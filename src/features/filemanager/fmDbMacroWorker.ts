/**
 * Safe AST condition/expression evaluator and isolated Worker runtime for File Manager Database Macros.
 *
 * - `evalCondition` / `validateConditionAst` evaluate Access/JS macro conditions and expressions using a
 *   pure recursive-descent AST parser with zero `new Function` or `eval`.
 * - `runMacroCodeInWorker` executes Bun JS macro bodies and `RunCode` steps inside a short-lived Worker
 *   thread with strict-mode execution, locked-down prototype constructors, scrubbed host globals, hard
 *   `worker.terminate()` timeouts, and async RPC bridges back to the database session.
 */
import { URL as NodeURL } from "node:url";
import { Worker as NodeWorker } from "node:worker_threads";
import { FmError } from "./fmPaths";

const RESTRICTED_MSG =
  "Access to host process, filesystem, or OS process APIs is restricted inside database macros.";

const BLOCKED_PROPS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "mainModule",
  "binding",
  "dlopen",
]);

const FORBIDDEN_IDENTS = new Set([
  "process",
  "globalThis",
  "global",
  "window",
  "self",
  "Bun",
  "Deno",
  "fetch",
  "require",
  "import",
  "Function",
  "eval",
  "Reflect",
  "Proxy",
  "ShadowRealm",
  "importValue",
  "Worker",
  "WebSocket",
  "XMLHttpRequest",
  "SharedArrayBuffer",
  "FinalizationRegistry",
  "WeakRef",
  "BroadcastChannel",
  "MessageChannel",
  "MessagePort",
  "HTMLRewriter",
  "Loader",
]);

const SAFE_MATH_FNS = new Set([
  "abs",
  "min",
  "max",
  "round",
  "floor",
  "ceil",
  "trunc",
  "pow",
  "sqrt",
  "sign",
  "log",
  "log10",
  "log2",
  "exp",
]);

const SAFE_STRING_METHODS = new Set([
  "trim",
  "trimStart",
  "trimEnd",
  "toLowerCase",
  "toUpperCase",
  "includes",
  "startsWith",
  "endsWith",
  "slice",
  "substring",
  "indexOf",
  "lastIndexOf",
  "split",
  "replace",
]);

const SAFE_ARRAY_METHODS = new Set(["includes", "indexOf", "slice", "join"]);

type TokenKind = "num" | "str" | "ident" | "bracket" | "op" | "punc" | "eof";

interface Token {
  kind: TokenKind;
  value: string;
  numValue?: number;
  pos: number;
}

type ExprNode =
  | { type: "literal"; value: unknown }
  | { type: "ident"; name: string }
  | { type: "bracketVar"; name: string }
  | { type: "array"; elements: ExprNode[] }
  | { type: "object"; entries: { key: string; value: ExprNode }[] }
  | { type: "unary"; op: string; arg: ExprNode }
  | { type: "binary"; op: string; left: ExprNode; right: ExprNode }
  | {
      type: "conditional";
      test: ExprNode;
      consequent: ExprNode;
      alternate: ExprNode;
    }
  | {
      type: "member";
      object: ExprNode;
      property: string;
      optional: boolean;
    }
  | {
      type: "computed";
      object: ExprNode;
      property: ExprNode;
      optional: boolean;
    }
  | { type: "call"; callee: ExprNode; args: ExprNode[] };

function tokenizeExpression(src: string): Token[] {
  const tokens: Token[] = [];
  const len = src.length;
  let i = 0;

  while (i < len) {
    const ch = src[i]!;
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < len && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) {
        throw new FmError(
          "SYNTAX_ERROR",
          "Unterminated comment in expression.",
        );
      }
      i = end + 2;
      continue;
    }

    // Numbers
    if (
      (ch >= "0" && ch <= "9") ||
      (ch === "." && i + 1 < len && src[i + 1]! >= "0" && src[i + 1]! <= "9")
    ) {
      const start = i;
      if (ch === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        i += 2;
        while (i < len && /[0-9a-fA-F_]/.test(src[i]!)) i++;
      } else {
        while (
          i < len &&
          ((src[i]! >= "0" && src[i]! <= "9") || src[i] === "_")
        )
          i++;
        if (i < len && src[i] === ".") {
          i++;
          while (
            i < len &&
            ((src[i]! >= "0" && src[i]! <= "9") || src[i] === "_")
          )
            i++;
        }
        if (i < len && (src[i] === "e" || src[i] === "E")) {
          i++;
          if (i < len && (src[i] === "+" || src[i] === "-")) i++;
          while (
            i < len &&
            ((src[i]! >= "0" && src[i]! <= "9") || src[i] === "_")
          )
            i++;
        }
      }
      const raw = src.slice(start, i).replace(/_/g, "");
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new FmError("SYNTAX_ERROR", `Invalid numeric literal '${raw}'.`);
      }
      tokens.push({ kind: "num", value: raw, numValue: n, pos: start });
      continue;
    }

    // Strings ('...', "...", or plain `...` without ${})
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      const start = i++;
      let out = "";
      let closed = false;
      while (i < len) {
        const c = src[i++]!;
        if (c === quote) {
          closed = true;
          break;
        }
        if (quote === "`" && c === "$" && src[i] === "{") {
          throw new FmError(
            "SYNTAX_ERROR",
            "Template literal interpolation is not supported in condition expressions; use + concatenation.",
          );
        }
        if (c === "\\") {
          if (i >= len) break;
          const esc = src[i++]!;
          if (esc === "n") out += "\n";
          else if (esc === "r") out += "\r";
          else if (esc === "t") out += "\t";
          else if (esc === "0") out += "\0";
          else if (esc === "u") {
            if (src[i] === "{") {
              const closeBrace = src.indexOf("}", i + 1);
              if (closeBrace < 0)
                throw new FmError("SYNTAX_ERROR", "Invalid Unicode escape.");
              const cp = Number.parseInt(src.slice(i + 1, closeBrace), 16);
              if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff)
                throw new FmError(
                  "SYNTAX_ERROR",
                  "Invalid Unicode code point.",
                );
              out += String.fromCodePoint(cp);
              i = closeBrace + 1;
            } else {
              const hex = src.slice(i, i + 4);
              if (!/^[0-9a-fA-F]{4}$/.test(hex))
                throw new FmError("SYNTAX_ERROR", "Invalid Unicode escape.");
              out += String.fromCharCode(Number.parseInt(hex, 16));
              i += 4;
            }
          } else {
            out += esc;
          }
        } else {
          out += c;
        }
      }
      if (!closed) {
        throw new FmError("SYNTAX_ERROR", "Unterminated string literal.");
      }
      tokens.push({ kind: "str", value: out, pos: start });
      continue;
    }

    // Access-style [varName] when not postfix indexing an expression
    if (ch === "[") {
      const prev = tokens[tokens.length - 1];
      const isPostfix =
        prev &&
        (prev.kind === "ident" ||
          prev.kind === "bracket" ||
          prev.kind === "str" ||
          (prev.kind === "punc" && (prev.value === ")" || prev.value === "]")));
      if (!isPostfix) {
        const closeIdx = src.indexOf("]", i + 1);
        if (closeIdx > i + 1) {
          const inner = src.slice(i + 1, closeIdx).trim();
          if (/^[A-Za-z_][A-Za-z0-9_ ]*$/.test(inner)) {
            tokens.push({ kind: "bracket", value: inner, pos: i });
            i = closeIdx + 1;
            continue;
          }
        }
      }
      tokens.push({ kind: "punc", value: "[", pos: i++ });
      continue;
    }

    // Identifiers (including \uXXXX escapes rejected cleanly if used to obfuscate identifiers)
    if (ch === "\\") {
      throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
    }
    if (
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      ch === "_" ||
      ch === "$"
    ) {
      const start = i++;
      while (
        i < len &&
        ((src[i]! >= "A" && src[i]! <= "Z") ||
          (src[i]! >= "a" && src[i]! <= "z") ||
          (src[i]! >= "0" && src[i]! <= "9") ||
          src[i] === "_" ||
          src[i] === "$")
      ) {
        i++;
      }
      const ident = src.slice(start, i);
      tokens.push({ kind: "ident", value: ident, pos: start });
      continue;
    }

    // Multi-character operators
    const three = src.slice(i, i + 3);
    if (three === "===" || three === "!==") {
      tokens.push({ kind: "op", value: three, pos: i });
      i += 3;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (
      two === "==" ||
      two === "!=" ||
      two === "<>" ||
      two === "<=" ||
      two === ">=" ||
      two === "&&" ||
      two === "||" ||
      two === "??" ||
      two === "**" ||
      two === "?."
    ) {
      tokens.push({ kind: "op", value: two === "<>" ? "!=" : two, pos: i });
      i += 2;
      continue;
    }
    if (two === "=>" || two === "++" || two === "--") {
      throw new FmError(
        "SYNTAX_ERROR",
        `Unsupported operator '${two}' in condition expression.`,
      );
    }

    if ("+-*/%<>!?:=".includes(ch)) {
      tokens.push({ kind: "op", value: ch, pos: i++ });
      continue;
    }

    if ("()]{}.,".includes(ch)) {
      tokens.push({ kind: "punc", value: ch, pos: i++ });
      continue;
    }

    throw new FmError(
      "SYNTAX_ERROR",
      `Unexpected character '${ch}' at position ${i + 1}.`,
    );
  }

  tokens.push({ kind: "eof", value: "", pos: len });
  return tokens;
}

export function parseConditionAst(exprCode: string): ExprNode {
  const tokens = tokenizeExpression(exprCode);
  let pos = 0;

  const peek = (): Token => tokens[pos]!;
  const next = (): Token => tokens[pos++]!;
  const matchOp = (...ops: string[]): Token | null => {
    const t = peek();
    if (t.kind === "op" && ops.includes(t.value)) {
      pos++;
      return t;
    }
    return null;
  };
  const matchPunc = (val: string): boolean => {
    const t = peek();
    if (t.kind === "punc" && t.value === val) {
      pos++;
      return true;
    }
    return false;
  };
  const expectPunc = (val: string) => {
    if (!matchPunc(val)) {
      throw new FmError(
        "SYNTAX_ERROR",
        `Expected '${val}' at position ${peek().pos + 1}.`,
      );
    }
  };

  function parseExpression(): ExprNode {
    const node = parseNullishOrLogicalOr();
    if (matchOp("?")) {
      const consequent = parseExpression();
      const colon = matchOp(":");
      if (!colon) {
        throw new FmError(
          "SYNTAX_ERROR",
          "Expected ':' in ternary conditional expression.",
        );
      }
      const alternate = parseExpression();
      return { type: "conditional", test: node, consequent, alternate };
    }
    return node;
  }

  function parseNullishOrLogicalOr(): ExprNode {
    let left = parseLogicalAnd();
    while (true) {
      const t = peek();
      if (t.kind === "op" && (t.value === "||" || t.value === "??")) {
        pos++;
        const right = parseLogicalAnd();
        left = { type: "binary", op: t.value, left, right };
      } else if (t.kind === "ident" && t.value.toUpperCase() === "OR") {
        pos++;
        const right = parseLogicalAnd();
        left = { type: "binary", op: "||", left, right };
      } else {
        break;
      }
    }
    return left;
  }

  function parseLogicalAnd(): ExprNode {
    let left = parseEquality();
    while (true) {
      const t = peek();
      if (t.kind === "op" && t.value === "&&") {
        pos++;
        const right = parseEquality();
        left = { type: "binary", op: "&&", left, right };
      } else if (t.kind === "ident" && t.value.toUpperCase() === "AND") {
        pos++;
        const right = parseEquality();
        left = { type: "binary", op: "&&", left, right };
      } else {
        break;
      }
    }
    return left;
  }

  function parseEquality(): ExprNode {
    let left = parseRelational();
    while (true) {
      const op = matchOp("===", "!==", "==", "!=", "=");
      if (!op) break;
      // Single '=' in Access-style conditions is treated as equality comparison (never mutation)
      const normalizedOp = op.value === "=" ? "==" : op.value;
      const right = parseRelational();
      left = { type: "binary", op: normalizedOp, left, right };
    }
    return left;
  }

  function parseRelational(): ExprNode {
    let left = parseAdditive();
    while (true) {
      const op = matchOp("<", "<=", ">", ">=");
      if (op) {
        const right = parseAdditive();
        left = { type: "binary", op: op.value, left, right };
        continue;
      }
      const t = peek();
      if (t.kind === "ident" && t.value === "in") {
        pos++;
        const right = parseAdditive();
        left = { type: "binary", op: "in", left, right };
        continue;
      }
      break;
    }
    return left;
  }

  function parseAdditive(): ExprNode {
    let left = parseMultiplicative();
    while (true) {
      const op = matchOp("+", "-");
      if (!op) break;
      const right = parseMultiplicative();
      left = { type: "binary", op: op.value, left, right };
    }
    return left;
  }

  function parseMultiplicative(): ExprNode {
    let left = parseExponent();
    while (true) {
      const op = matchOp("*", "/", "%");
      if (!op) break;
      const right = parseExponent();
      left = { type: "binary", op: op.value, left, right };
    }
    return left;
  }

  function parseExponent(): ExprNode {
    const left = parseUnary();
    if (matchOp("**")) {
      const right = parseExponent();
      return { type: "binary", op: "**", left, right };
    }
    return left;
  }

  function parseUnary(): ExprNode {
    const op = matchOp("!", "+", "-");
    if (op) {
      return { type: "unary", op: op.value, arg: parseUnary() };
    }
    const t = peek();
    if (t.kind === "ident") {
      if (t.value === "typeof" || t.value === "await") {
        pos++;
        return { type: "unary", op: t.value, arg: parseUnary() };
      }
      if (t.value.toUpperCase() === "NOT") {
        pos++;
        return { type: "unary", op: "!", arg: parseUnary() };
      }
      if (
        t.value === "new" ||
        t.value === "function" ||
        t.value === "class" ||
        t.value === "async" ||
        t.value === "delete" ||
        t.value === "void"
      ) {
        throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
      }
    }
    return parsePostfix();
  }

  function parsePostfix(): ExprNode {
    let node = parsePrimary();
    while (true) {
      if (matchPunc(".")) {
        const prop = next();
        if (prop.kind !== "ident") {
          throw new FmError("SYNTAX_ERROR", "Expected property identifier.");
        }
        if (BLOCKED_PROPS.has(prop.value)) {
          throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
        }
        node = {
          type: "member",
          object: node,
          property: prop.value,
          optional: false,
        };
        continue;
      }
      if (matchOp("?.")) {
        if (matchPunc("[")) {
          const idxExpr = parseExpression();
          expectPunc("]");
          node = {
            type: "computed",
            object: node,
            property: idxExpr,
            optional: true,
          };
          continue;
        }
        const prop = next();
        if (prop.kind !== "ident") {
          throw new FmError(
            "SYNTAX_ERROR",
            "Expected property identifier after '?.'.",
          );
        }
        if (BLOCKED_PROPS.has(prop.value)) {
          throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
        }
        node = {
          type: "member",
          object: node,
          property: prop.value,
          optional: true,
        };
        continue;
      }
      if (matchPunc("[")) {
        const idxExpr = parseExpression();
        expectPunc("]");
        node = {
          type: "computed",
          object: node,
          property: idxExpr,
          optional: false,
        };
        continue;
      }
      if (matchPunc("(")) {
        const args: ExprNode[] = [];
        if (!matchPunc(")")) {
          do {
            args.push(parseExpression());
          } while (matchPunc(","));
          expectPunc(")");
        }
        validateAstCallTarget(node);
        node = { type: "call", callee: node, args };
        continue;
      }
      break;
    }
    return node;
  }

  function parsePrimary(): ExprNode {
    const t = peek();
    if (t.kind === "num") {
      pos++;
      return { type: "literal", value: t.numValue };
    }
    if (t.kind === "str") {
      pos++;
      return { type: "literal", value: t.value };
    }
    if (t.kind === "bracket") {
      pos++;
      return { type: "bracketVar", name: t.value };
    }
    if (t.kind === "ident") {
      pos++;
      if (t.value === "true") return { type: "literal", value: true };
      if (t.value === "false") return { type: "literal", value: false };
      if (t.value === "null") return { type: "literal", value: null };
      if (t.value === "undefined") return { type: "literal", value: undefined };
      if (t.value === "NaN") return { type: "literal", value: Number.NaN };
      if (t.value === "Infinity")
        return { type: "literal", value: Number.POSITIVE_INFINITY };
      if (
        t.value === "this" ||
        FORBIDDEN_IDENTS.has(t.value) ||
        BLOCKED_PROPS.has(t.value)
      ) {
        throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
      }
      return { type: "ident", name: t.value };
    }
    if (matchPunc("(")) {
      const inner = parseExpression();
      expectPunc(")");
      return inner;
    }
    if (matchPunc("[")) {
      const elements: ExprNode[] = [];
      if (!matchPunc("]")) {
        do {
          if (peek().kind === "punc" && peek().value === "]") break;
          elements.push(parseExpression());
        } while (matchPunc(","));
        expectPunc("]");
      }
      return { type: "array", elements };
    }
    if (matchPunc("{")) {
      const entries: { key: string; value: ExprNode }[] = [];
      if (!matchPunc("}")) {
        do {
          if (peek().kind === "punc" && peek().value === "}") break;
          const kt = next();
          let key: string;
          if (kt.kind === "ident" || kt.kind === "str" || kt.kind === "num") {
            key = kt.value;
          } else {
            throw new FmError(
              "SYNTAX_ERROR",
              "Expected object property name in literal.",
            );
          }
          if (BLOCKED_PROPS.has(key)) {
            throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
          }
          if (matchOp(":")) {
            const val = parseExpression();
            entries.push({ key, value: val });
          } else if (kt.kind === "ident") {
            entries.push({ key, value: { type: "ident", name: key } });
          } else {
            throw new FmError(
              "SYNTAX_ERROR",
              "Expected ':' after object property key.",
            );
          }
        } while (matchPunc(","));
        expectPunc("}");
      }
      return { type: "object", entries };
    }
    throw new FmError(
      "SYNTAX_ERROR",
      `Unexpected token '${t.value || t.kind}' at position ${t.pos + 1}.`,
    );
  }

  const root = parseExpression();
  if (peek().kind !== "eof") {
    throw new FmError(
      "SYNTAX_ERROR",
      `Unexpected token '${peek().value}' at position ${peek().pos + 1}.`,
    );
  }
  return root;
}

const ALLOWED_DIRECT_CALLS = new Set([
  "Number",
  "String",
  "Boolean",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "DCount",
  "DLookup",
  "DSum",
  "DAvg",
  "DMin",
  "DMax",
]);

function validateAstCallTarget(callee: ExprNode): void {
  if (callee.type === "ident") {
    if (!ALLOWED_DIRECT_CALLS.has(callee.name)) {
      throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
    }
    return;
  }
  if (callee.type === "member") {
    if (BLOCKED_PROPS.has(callee.property)) {
      throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
    }
    if (callee.object.type === "ident") {
      const objName = callee.object.name;
      if (objName === "Math" && SAFE_MATH_FNS.has(callee.property)) return;
      if (objName === "Array" && callee.property === "isArray") return;
      if (
        objName === "JSON" &&
        (callee.property === "stringify" || callee.property === "parse")
      )
        return;
      if (
        (objName === "TempVars" || objName === "vars") &&
        callee.property === "get"
      )
        return;
      if (
        objName === "Number" &&
        (callee.property === "isFinite" ||
          callee.property === "isNaN" ||
          callee.property === "isInteger" ||
          callee.property === "parseInt" ||
          callee.property === "parseFloat")
      )
        return;
    }
    if (
      SAFE_STRING_METHODS.has(callee.property) ||
      SAFE_ARRAY_METHODS.has(callee.property)
    ) {
      return;
    }
  }
  throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
}

export interface SafeEvalScope {
  tempVars: Record<string, unknown>;
  params: Record<string, unknown>;
  recordsAffected?: number;
  engine?: string;
  connectionName?: string;
  domainFns?: {
    DCount?: (
      expr?: string,
      domain?: string,
      criteria?: string,
    ) => Promise<unknown>;
    DLookup?: (
      expr: string,
      domain: string,
      criteria?: string,
    ) => Promise<unknown>;
    DSum?: (
      expr: string,
      domain: string,
      criteria?: string,
    ) => Promise<unknown>;
    DAvg?: (
      expr: string,
      domain: string,
      criteria?: string,
    ) => Promise<unknown>;
    DMin?: (
      expr: string,
      domain: string,
      criteria?: string,
    ) => Promise<unknown>;
    DMax?: (
      expr: string,
      domain: string,
      criteria?: string,
    ) => Promise<unknown>;
  };
}

export function validateConditionAst(exprCode: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = (exprCode ?? "").trim();
  if (!trimmed) return { valid: true };
  try {
    parseConditionAst(trimmed);
    return { valid: true };
  } catch (err: any) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function safeOwnProp(obj: unknown, key: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (BLOCKED_PROPS.has(key)) {
    throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
  }
  if (typeof obj === "string") {
    if (key === "length") return obj.length;
    const idx = Number(key);
    if (Number.isInteger(idx) && idx >= 0 && idx < obj.length) return obj[idx];
    return undefined;
  }
  if (Array.isArray(obj)) {
    if (key === "length") return obj.length;
    const idx = Number(key);
    if (Number.isInteger(idx) && idx >= 0 && idx < obj.length) return obj[idx];
    return undefined;
  }
  if (typeof obj === "object") {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return (obj as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

/**
 * Evaluates a macro condition or `SetTempVar` / `Assert` expression via a pure AST walker
 * without `new Function`, `eval`, or host global access.
 */
export async function evalCondition(
  exprCode: string,
  scope: SafeEvalScope = { tempVars: {}, params: {} },
): Promise<unknown> {
  const trimmed = (exprCode ?? "").trim();
  if (!trimmed) return undefined;
  const ast = parseConditionAst(trimmed);

  const dbReadView = Object.assign(Object.create(null), {
    RecordsAffected: scope.recordsAffected ?? 0,
    engine: scope.engine ?? "sqlite",
    name: scope.connectionName ?? "",
  });

  async function evalNode(node: ExprNode): Promise<unknown> {
    switch (node.type) {
      case "literal":
        return node.value;
      case "bracketVar": {
        if (Object.prototype.hasOwnProperty.call(scope.tempVars, node.name)) {
          return scope.tempVars[node.name];
        }
        if (Object.prototype.hasOwnProperty.call(scope.params, node.name)) {
          return scope.params[node.name];
        }
        return undefined;
      }
      case "ident": {
        if (node.name === "TempVars" || node.name === "vars")
          return scope.tempVars;
        if (node.name === "params") return scope.params;
        if (node.name === "db" || node.name === "CurrentDb") return dbReadView;
        if (Object.prototype.hasOwnProperty.call(scope.tempVars, node.name)) {
          return scope.tempVars[node.name];
        }
        if (Object.prototype.hasOwnProperty.call(scope.params, node.name)) {
          return scope.params[node.name];
        }
        return undefined;
      }
      case "array": {
        const out: unknown[] = [];
        for (const el of node.elements) out.push(await evalNode(el));
        return out;
      }
      case "object": {
        const out: Record<string, unknown> = Object.create(null);
        for (const entry of node.entries) {
          out[entry.key] = await evalNode(entry.value);
        }
        return out;
      }
      case "unary": {
        const val = await evalNode(node.arg);
        if (node.op === "!") return !val;
        if (node.op === "+") return Number(val);
        if (node.op === "-") return -Number(val);
        if (node.op === "typeof") return typeof val;
        if (node.op === "await") return await val;
        return undefined;
      }
      case "binary": {
        if (node.op === "&&") {
          const l = await evalNode(node.left);
          return l ? await evalNode(node.right) : l;
        }
        if (node.op === "||") {
          const l = await evalNode(node.left);
          return l ? l : await evalNode(node.right);
        }
        if (node.op === "??") {
          const l = await evalNode(node.left);
          return l !== null && l !== undefined ? l : await evalNode(node.right);
        }
        const l: any = await evalNode(node.left);
        const r: any = await evalNode(node.right);
        switch (node.op) {
          case "===":
            return l === r;
          case "!==":
            return l !== r;
          case "==":
            // eslint-disable-next-line eqeqeq
            return l == r;
          case "!=":
            // eslint-disable-next-line eqeqeq
            return l != r;
          case "<":
            return l < r;
          case "<=":
            return l <= r;
          case ">":
            return l > r;
          case ">=":
            return l >= r;
          case "+":
            return l + r;
          case "-":
            return Number(l) - Number(r);
          case "*":
            return Number(l) * Number(r);
          case "/":
            return Number(l) / Number(r);
          case "%":
            return Number(l) % Number(r);
          case "**":
            return Number(l) ** Number(r);
          case "in": {
            const key = String(l);
            if (BLOCKED_PROPS.has(key) || !r || typeof r !== "object")
              return false;
            return Object.prototype.hasOwnProperty.call(r, key);
          }
          default:
            return undefined;
        }
      }
      case "conditional": {
        const testVal = await evalNode(node.test);
        return testVal
          ? await evalNode(node.consequent)
          : await evalNode(node.alternate);
      }
      case "member": {
        if (node.object.type === "ident" && node.object.name === "Math") {
          if (node.property === "PI") return Math.PI;
          if (node.property === "E") return Math.E;
        }
        const recv = await evalNode(node.object);
        if (recv === null || recv === undefined) {
          if (node.optional) return undefined;
          throw new TypeError(
            `Cannot read property '${node.property}' of ${recv}`,
          );
        }
        return safeOwnProp(recv, node.property);
      }
      case "computed": {
        const recv = await evalNode(node.object);
        if (recv === null || recv === undefined) {
          if (node.optional) return undefined;
          throw new TypeError(`Cannot read properties of ${recv}`);
        }
        const key = String(await evalNode(node.property));
        return safeOwnProp(recv, key);
      }
      case "call": {
        const args: any[] = [];
        for (const a of node.args) args.push(await evalNode(a));
        if (node.callee.type === "ident") {
          switch (node.callee.name) {
            case "Number":
              return Number(args[0]);
            case "String":
              return String(args[0] ?? "");
            case "Boolean":
              return Boolean(args[0]);
            case "parseInt":
              return Number.parseInt(String(args[0] ?? ""), args[1]);
            case "parseFloat":
              return Number.parseFloat(String(args[0] ?? ""));
            case "isNaN":
              return Number.isNaN(Number(args[0]));
            case "isFinite":
              return Number.isFinite(Number(args[0]));
            case "DCount":
            case "DLookup":
            case "DSum":
            case "DAvg":
            case "DMin":
            case "DMax": {
              const fn = scope.domainFns?.[node.callee.name];
              if (!fn) {
                throw new FmError(
                  "BAD_REQUEST",
                  `${node.callee.name} is not available in this context.`,
                );
              }
              return await (fn as any)(args[0], args[1], args[2]);
            }
            default:
              throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
          }
        }
        if (node.callee.type === "member") {
          const prop = node.callee.property;
          if (node.callee.object.type === "ident") {
            const ns = node.callee.object.name;
            if (ns === "Math" && SAFE_MATH_FNS.has(prop)) {
              return (Math as any)[prop](...args.map(Number));
            }
            if (ns === "Array" && prop === "isArray") {
              return Array.isArray(args[0]);
            }
            if (ns === "JSON" && prop === "stringify") {
              return JSON.stringify(args[0]);
            }
            if (ns === "JSON" && prop === "parse") {
              const parsed = JSON.parse(String(args[0] ?? "null"));
              return parsed;
            }
            if ((ns === "TempVars" || ns === "vars") && prop === "get") {
              const k = String(args[0] ?? "");
              return safeOwnProp(scope.tempVars, k);
            }
            if (ns === "Number") {
              if (prop === "isFinite") return Number.isFinite(args[0]);
              if (prop === "isNaN") return Number.isNaN(args[0]);
              if (prop === "isInteger") return Number.isInteger(args[0]);
              if (prop === "parseInt")
                return Number.parseInt(String(args[0] ?? ""), args[1]);
              if (prop === "parseFloat")
                return Number.parseFloat(String(args[0] ?? ""));
            }
          }
          const recv = await evalNode(node.callee.object);
          if (recv === null || recv === undefined) {
            if (node.callee.optional) return undefined;
            throw new TypeError(`Cannot call '${prop}' on ${recv}`);
          }
          if (typeof recv === "string" && SAFE_STRING_METHODS.has(prop)) {
            if (prop === "replace") {
              return recv.replace(String(args[0] ?? ""), () =>
                String(args[1] ?? ""),
              );
            }
            return (recv as any)[prop](...args);
          }
          if (Array.isArray(recv) && SAFE_ARRAY_METHODS.has(prop)) {
            return (recv as any)[prop](...args);
          }
        }
        throw new FmError("SYNTAX_ERROR", RESTRICTED_MSG);
      }
    }
  }

  return await evalNode(ast);
}

const WORKER_BOOTSTRAP_JS = `
"use strict";
(function () {
  const _wt = require("node:worker_threads");
  const _port = _wt.parentPort;
  const _post = _port.postMessage.bind(_port);
  const _onMsg = _port.on.bind(_port, "message");
  const _Object = Object;
  const _Proxy = Proxy;
  const _now = performance.now.bind(performance);
  const _randomUUID = crypto.randomUUID.bind(crypto);
  const _setTimeout = setTimeout;

  const AsyncFnProto = _Object.getPrototypeOf(async function () {});
  const GenFnProto = _Object.getPrototypeOf(function* () {});
  const AsyncGenFnProto = _Object.getPrototypeOf(async function* () {});
  const UserAsyncFunction = AsyncFnProto.constructor;
  const blockedCtor = function () {
    throw new Error("Dynamic code generation is restricted inside database macros.");
  };

  const ALLOWED_GLOBALS = new Set([
    "Object",
    "Array",
    "String",
    "Number",
    "Boolean",
    "Math",
    "Date",
    "JSON",
    "RegExp",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Promise",
    "Symbol",
    "BigInt",
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "EvalError",
    "AggregateError",
    "ArrayBuffer",
    "DataView",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float16Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
    "Intl",
    "TextEncoder",
    "TextDecoder",
    "URL",
    "URLSearchParams",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "encodeURI",
    "decodeURI",
    "encodeURIComponent",
    "decodeURIComponent",
    "atob",
    "btoa",
    "structuredClone",
    "setTimeout",
    "clearTimeout",
    "queueMicrotask",
    "undefined",
    "NaN",
    "Infinity",
    "globalThis",
    "Function",
    "eval",
  ]);

  try {
    _Object.setPrototypeOf(globalThis, _Object.prototype);
  } catch {}

  for (const k of _Object.getOwnPropertyNames(globalThis)) {
    if (!ALLOWED_GLOBALS.has(k)) {
      try { delete globalThis[k]; } catch {}
      try {
        _Object.defineProperty(globalThis, k, {
          value: undefined,
          writable: false,
          configurable: false,
        });
      } catch {
        try { globalThis[k] = undefined; } catch {}
      }
    }
  }

  for (const ck of ["Function", "eval", "ShadowRealm", "Bun", "process", "require", "fetch"]) {
    const replacement = ck === "Function" || ck === "eval" ? blockedCtor : undefined;
    try {
      _Object.defineProperty(globalThis, ck, {
        value: replacement,
        writable: false,
        configurable: false,
      });
    } catch {
      try { globalThis[ck] = replacement; } catch {}
    }
  }

  for (const proto of [Function.prototype, AsyncFnProto, GenFnProto, AsyncGenFnProto]) {
    try {
      _Object.defineProperty(proto, "constructor", {
        value: blockedCtor,
        writable: false,
        configurable: false,
      });
    } catch {}
  }

  let nextRpcId = 1;
  const pending = new Map();

  function rpc(connId, method, args) {
    return new Promise((resolve, reject) => {
      const id = nextRpcId++;
      pending.set(id, { resolve, reject });
      _post({ type: "rpc", id, connId, method, args });
    });
  }

  function quoteIdentLocal(engine, name) {
    const clean = String(name ?? "");
    if (engine === "mysql") return "\`" + clean.replace(/\`/g, "\`\`") + "\`";
    return '"' + clean.replace(/"/g, '""') + '"';
  }

  function createRecordSetLocal(rows) {
    let cursor = 0;
    return {
      rows,
      RecordCount: rows.length,
      get BOF() { return rows.length === 0 || cursor < 0; },
      get EOF() { return rows.length === 0 || cursor >= rows.length; },
      MoveFirst() { cursor = 0; },
      MoveLast() { cursor = Math.max(0, rows.length - 1); },
      MoveNext() { cursor++; },
      MovePrevious() { cursor--; },
      Fields(nameOrIndex) {
        const row = rows[cursor];
        if (!row) return null;
        if (typeof nameOrIndex === "number") {
          const vals = Object.values(row);
          return vals[nameOrIndex] ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(row, nameOrIndex)) return row[nameOrIndex] ?? null;
        const lower = String(nameOrIndex).toLowerCase();
        for (const [k, v] of Object.entries(row)) {
          if (k.toLowerCase() === lower) return v ?? null;
        }
        return null;
      },
      GetRows(numRows) {
        const slice = numRows !== undefined ? rows.slice(cursor, cursor + numRows) : rows.slice(cursor);
        cursor += slice.length;
        return slice;
      },
      Close() { cursor = rows.length; },
      [Symbol.iterator]: function* () {
        for (const r of rows) yield r;
      },
    };
  }

  function makeEnv(connId, engine, label, tempVarsStore, syncTempVars) {
    const sqlEngine = engine === "redis" ? "sqlite" : engine;
    const dbApi = {
      engine,
      name: label,
      RecordsAffected: 0,
      quoteIdent(name) {
        return quoteIdentLocal(sqlEngine, name);
      },
      async query(rawSql, bindParams = [], qLabel) {
        await syncTempVars();
        return await rpc(connId, "db.query", [rawSql, bindParams, qLabel]);
      },
      async execute(rawSql, bindParams = [], actionLabel = "execute") {
        await syncTempVars();
        const res = await rpc(connId, "db.execute", [rawSql, bindParams, actionLabel]);
        dbApi.RecordsAffected = Number(res?.affectedRows ?? 0);
        return res;
      },
      async scalar(rawSql, bindParams = []) {
        await syncTempVars();
        return await rpc(connId, "db.scalar", [rawSql, bindParams]);
      },
      async OpenRecordset(source, bindParams = []) {
        await syncTempVars();
        const rows = await rpc(connId, "db.openRecordsetRows", [source, bindParams]);
        return createRecordSetLocal(Array.isArray(rows) ? rows : []);
      },
      async tables() {
        return await rpc(connId, "db.tables", []);
      },
      async describe(tableName) {
        return await rpc(connId, "db.describe", [tableName]);
      },
      async insert(tableName, rowOrRows) {
        await syncTempVars();
        const count = await rpc(connId, "db.insert", [tableName, rowOrRows]);
        dbApi.RecordsAffected = Number(count ?? 0);
        return count;
      },
      async update(tableName, values, whereClause, whereParams = []) {
        await syncTempVars();
        const affected = await rpc(connId, "db.update", [tableName, values, whereClause, whereParams]);
        dbApi.RecordsAffected = Number(affected ?? 0);
        return affected;
      },
      async delete(tableName, whereClause, whereParams = []) {
        await syncTempVars();
        const affected = await rpc(connId, "db.delete", [tableName, whereClause, whereParams]);
        dbApi.RecordsAffected = Number(affected ?? 0);
        return affected;
      },
      async transaction(fn) {
        const sp = "sp_macro_" + Math.random().toString(36).slice(2, 8);
        await dbApi.execute("SAVEPOINT " + sp, [], "SAVEPOINT");
        try {
          const out = await fn(dbApi);
          await dbApi.execute("RELEASE SAVEPOINT " + sp, [], "RELEASE SAVEPOINT");
          return out;
        } catch (err) {
          await dbApi.execute("ROLLBACK TO SAVEPOINT " + sp, [], "ROLLBACK TO SAVEPOINT").catch(() => {});
          throw err;
        }
      },
    };
    dbApi.Query = dbApi.query;
    dbApi.Execute = dbApi.execute;
    dbApi.openRecordset = dbApi.OpenRecordset;
    dbApi.TableDefs = dbApi.tables;

    const DCount = async (expr = "*", domain, criteria) => {
      await syncTempVars();
      return await rpc(connId, "DCount", [expr, domain, criteria]);
    };
    const DLookup = async (expr, domain, criteria) => {
      await syncTempVars();
      return await rpc(connId, "DLookup", [expr, domain, criteria]);
    };
    const DSum = async (expr, domain, criteria) => {
      await syncTempVars();
      return await rpc(connId, "DSum", [expr, domain, criteria]);
    };
    const DAvg = async (expr, domain, criteria) => {
      await syncTempVars();
      return await rpc(connId, "DAvg", [expr, domain, criteria]);
    };
    const DMin = async (expr, domain, criteria) => {
      await syncTempVars();
      return await rpc(connId, "DMin", [expr, domain, criteria]);
    };
    const DMax = async (expr, domain, criteria) => {
      await syncTempVars();
      return await rpc(connId, "DMax", [expr, domain, criteria]);
    };

    const MsgBox = (message, title = "Macro", type = "info") => {
      _post({ type: "syncEvent", kind: "MsgBox", tempVars: { ...tempVarsStore }, args: [message, title, type] });
      return 1;
    };

    const redisApi = {
      async command(cmd, ...args) {
        return await rpc(connId, "redis.command", [cmd, ...args]);
      },
      async get(key) {
        return await rpc(connId, "redis.get", [key]);
      },
      async set(key, value, ttlSeconds) {
        return await rpc(connId, "redis.set", [key, value, ttlSeconds]);
      },
      async del(...keys) {
        return await rpc(connId, "redis.del", keys);
      },
      async keys(pattern = "*") {
        return await rpc(connId, "redis.keys", [pattern]);
      },
      async hgetall(key) {
        return await rpc(connId, "redis.hgetall", [key]);
      },
      async hset(key, fields) {
        return await rpc(connId, "redis.hset", [key, fields]);
      },
      async incr(key) {
        return await rpc(connId, "redis.incr", [key]);
      },
      async ttl(key) {
        return await rpc(connId, "redis.ttl", [key]);
      },
    };

    const DoCmd = {
      async RunSQL(sql, bindParams = []) {
        return await dbApi.execute(sql, bindParams, "RunSQL");
      },
      async OpenQuery(sql, qLabel) {
        return await dbApi.query(sql, [], qLabel || "OpenQuery");
      },
      async OpenTable(tableName, optionsOrWhere, limitArg) {
        await syncTempVars();
        return await rpc(connId, "DoCmd.OpenTable", [tableName, optionsOrWhere, limitArg]);
      },
      async InsertRecord(tableName, values) {
        return await dbApi.insert(tableName, values);
      },
      async UpdateRecord(tableName, values, where, bindParams = []) {
        return await dbApi.update(tableName, values, where, bindParams);
      },
      async DeleteRecord(tableName, where, bindParams = []) {
        return await dbApi.delete(tableName, where, bindParams);
      },
      async MakeTable(selectSql, targetTable, replace = true) {
        await syncTempVars();
        return await rpc(connId, "DoCmd.MakeTable", [selectSql, targetTable, replace]);
      },
      async EmptyTable(tableName) {
        return await dbApi.delete(tableName);
      },
      async SetTempVar(name, value) {
        tempVarsStore[String(name)] = value;
        await rpc(connId, "DoCmd.SetTempVar", [String(name), value]);
        return value;
      },
      async RemoveTempVar(name) {
        delete tempVarsStore[String(name)];
        await rpc(connId, "DoCmd.RemoveTempVar", [String(name)]);
      },
      async RemoveAllTempVars() {
        for (const k of Object.keys(tempVarsStore)) delete tempVarsStore[k];
        await rpc(connId, "DoCmd.RemoveAllTempVars", []);
      },
      MessageBox: MsgBox,
      Beep() {
        _post({ type: "syncEvent", kind: "Beep", args: [] });
      },
      SetWarnings(enabled) {
        _post({ type: "syncEvent", kind: "SetWarnings", args: [Boolean(enabled)] });
      },
      Assert(condition, message = "Macro assertion failed") {
        if (!condition) {
          const err = new Error(String(message));
          err.__macroCode = "ASSERTION_FAILED";
          throw err;
        }
        _post({ type: "syncEvent", kind: "AssertOk", args: [String(message)] });
      },
      StopMacro(reason = "Stopped by StopMacro") {
        const err = new Error(String(reason));
        err.__macroStop = true;
        throw err;
      },
      async RunCode(codeOrExpr) {
        await syncTempVars();
        const res = await rpc(connId, "DoCmd.RunCode", [String(codeOrExpr ?? "")]);
        if (res && typeof res === "object" && res.__tempVars) {
          for (const k of Object.keys(tempVarsStore)) delete tempVarsStore[k];
          Object.assign(tempVarsStore, res.__tempVars);
          return res.out;
        }
        return res;
      },
      async RunMacro(macroNameOrId, overrideParams = {}) {
        await syncTempVars();
        const res = await rpc(connId, "DoCmd.RunMacro", [macroNameOrId, overrideParams]);
        if (res && typeof res === "object" && res.__tempVars) {
          for (const k of Object.keys(tempVarsStore)) delete tempVarsStore[k];
          Object.assign(tempVarsStore, res.__tempVars);
          return res.out;
        }
        return res;
      },
    };

    return {
      db: dbApi,
      CurrentDb: dbApi,
      DoCmd,
      DCount,
      DLookup,
      DSum,
      DAvg,
      DMin,
      DMax,
      MsgBox,
      redis: redisApi,
    };
  }

  _onMsg(async (msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "rpcResult") {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) {
        entry.resolve(msg.result);
      } else {
        const err = new Error(msg.error || "Macro operation failed");
        if (msg.code) err.__macroCode = msg.code;
        if (msg.stop) err.__macroStop = true;
        if (msg.details) err.__macroDetails = msg.details;
        entry.reject(err);
      }
      return;
    }

    if (msg.type === "start") {
      const tempVarsStore = Object.assign({}, msg.tempVars || {});
      const inputParams = Object.assign({}, msg.inputParams || {});
      let dirty = false;

      const syncTempVars = async () => {
        if (!dirty) return;
        dirty = false;
        await rpc("primary", "syncTempVars", [{ ...tempVarsStore }]);
      };

      const tempVarsProxy = new _Proxy(tempVarsStore, {
        get(targetObj, prop) {
          if (typeof prop === "symbol") return targetObj[prop];
          if (prop === "get") return (k) => targetObj[k];
          if (prop === "set" || prop === "Add") {
            return (k, v) => {
              targetObj[k] = v;
              dirty = true;
              return v;
            };
          }
          if (prop === "remove" || prop === "Remove") {
            return (k) => {
              delete targetObj[k];
              dirty = true;
            };
          }
          if (prop === "clear" || prop === "RemoveAll") {
            return () => {
              for (const k of Object.keys(targetObj)) delete targetObj[k];
              dirty = true;
            };
          }
          if (prop === "toJSON") return () => ({ ...targetObj });
          return targetObj[prop];
        },
        set(targetObj, prop, value) {
          if (typeof prop === "string") {
            targetObj[prop] = value;
            dirty = true;
          }
          return true;
        },
        deleteProperty(targetObj, prop) {
          if (typeof prop === "string") {
            delete targetObj[prop];
            dirty = true;
          }
          return true;
        },
      });

      const primaryEnv = makeEnv(
        "primary",
        msg.engine,
        msg.label,
        tempVarsStore,
        syncTempVars,
      );

      const connectionsApi = {
        list() {
          return Array.isArray(msg.connectionsList) ? msg.connectionsList.slice() : [];
        },
        async use(idOrName) {
          await syncTempVars();
          const info = await rpc("primary", "connections.use", [idOrName]);
          return makeEnv(info.connId, info.engine, info.label, tempVarsStore, syncTempVars);
        },
      };

      const consoleProxy = {
        log: (...args) => _post({ type: "syncEvent", kind: "log", level: "log", args }),
        info: (...args) => _post({ type: "syncEvent", kind: "log", level: "info", args }),
        warn: (...args) => _post({ type: "syncEvent", kind: "log", level: "warn", args }),
        error: (...args) => _post({ type: "syncEvent", kind: "log", level: "error", args }),
        debug: (...args) => _post({ type: "syncEvent", kind: "log", level: "debug", args }),
        table: (data) => _post({ type: "syncEvent", kind: "consoleTable", args: [data] }),
      };

      const DebugApi = {
        print: (...args) => _post({ type: "syncEvent", kind: "log", level: "debug", args }),
        Print: (...args) => _post({ type: "syncEvent", kind: "log", level: "debug", args }),
        Assert: (cond, m) => primaryEnv.DoCmd.Assert(cond, m),
        assert: (cond, m) => primaryEnv.DoCmd.Assert(cond, m),
      };

      const safeBun = _Object.freeze({
        version: msg.bunVersion,
        nanoseconds: () => Math.round(_now() * 1e6),
        sleep: (ms) => new Promise((r) => _setTimeout(r, Math.min(Math.max(0, Number(ms) || 0), 2000))),
        hash: (v) => rpc("primary", "Bun.hash", [String(v ?? "")]),
        inspect: (v) => { try { return JSON.stringify(v); } catch { return String(v); } },
        escapeHTML: (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"),
        deepEquals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
        randomUUIDv7: () => _randomUUID(),
      });

      const runtimeCtx = Object.freeze({
        db: primaryEnv.db,
        CurrentDb: primaryEnv.CurrentDb,
        DoCmd: primaryEnv.DoCmd,
        DCount: primaryEnv.DCount,
        DLookup: primaryEnv.DLookup,
        DSum: primaryEnv.DSum,
        DAvg: primaryEnv.DAvg,
        DMin: primaryEnv.DMin,
        DMax: primaryEnv.DMax,
        TempVars: tempVarsProxy,
        vars: tempVarsProxy,
        params: inputParams,
        MsgBox: primaryEnv.MsgBox,
        Debug: DebugApi,
        console: consoleProxy,
        redis: primaryEnv.redis,
        connections: connectionsApi,
        Bun: safeBun,
      });

      try {
        const fn = new UserAsyncFunction(
          "__ctx",
          "db",
          "CurrentDb",
          "DoCmd",
          "DCount",
          "DLookup",
          "DSum",
          "DAvg",
          "DMin",
          "DMax",
          "TempVars",
          "vars",
          "params",
          "MsgBox",
          "Debug",
          "console",
          "redis",
          "connections",
          "Bun",
          "process",
          "globalThis",
          "global",
          "window",
          "self",
          "Function",
          "require",
          "fetch",
          \`"use strict";\\n\${msg.runnerSource}\`,
        );
        const out = await fn(
          runtimeCtx,
          primaryEnv.db,
          primaryEnv.CurrentDb,
          primaryEnv.DoCmd,
          primaryEnv.DCount,
          primaryEnv.DLookup,
          primaryEnv.DSum,
          primaryEnv.DAvg,
          primaryEnv.DMin,
          primaryEnv.DMax,
          tempVarsProxy,
          tempVarsProxy,
          inputParams,
          primaryEnv.MsgBox,
          DebugApi,
          consoleProxy,
          primaryEnv.redis,
          connectionsApi,
          safeBun,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        );
        _post({ type: "done", ok: true, result: out, tempVars: { ...tempVarsStore } });
      } catch (err) {
        _post({
          type: "done",
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: err?.__macroCode || undefined,
          stop: Boolean(err?.__macroStop),
          details: err?.__macroDetails || undefined,
          tempVars: { ...tempVarsStore },
        });
      }
    }
  });
})();
`;

export interface WorkerMacroHost {
  engine: string;
  label: string;
  bunVersion: string;
  timeoutMs: number;
  tempVarsStore: Record<string, unknown>;
  inputParams: Record<string, unknown>;
  connectionsList: unknown[];
  onSyncEvent: (ev: {
    kind: string;
    level?: string;
    tempVars?: Record<string, unknown>;
    args: unknown[];
  }) => void;
  onRpc: (connId: string, method: string, args: any[]) => Promise<unknown>;
  createStopSignal: (reason: string) => Error;
}

const WORKER_DATA_URL = new NodeURL(
  `data:text/javascript;base64,${Buffer.from(WORKER_BOOTSTRAP_JS, "utf8").toString("base64")}`,
);

export async function runMacroCodeInWorker(
  runnerSource: string,
  host: WorkerMacroHost,
): Promise<unknown> {
  const worker = new NodeWorker(WORKER_DATA_URL);
  let settled = false;

  return await new Promise<unknown>((resolve, reject) => {
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        void worker.terminate();
      } catch {}
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new FmError(
          "TIMEOUT",
          `Macro execution timed out after ${host.timeoutMs} ms.`,
        ),
      );
    }, host.timeoutMs);

    worker.on("error", (err: Error) => {
      cleanup();
      reject(
        err instanceof Error
          ? err
          : new Error(String(err || "Macro worker execution error.")),
      );
    });

    worker.on("message", async (msg: any) => {
      if (!msg || typeof msg !== "object" || settled) return;

      if (msg.type === "syncEvent") {
        if (msg.tempVars && typeof msg.tempVars === "object") {
          for (const k of Object.keys(host.tempVarsStore))
            delete host.tempVarsStore[k];
          Object.assign(host.tempVarsStore, msg.tempVars);
        }
        host.onSyncEvent(msg);
        return;
      }

      if (msg.type === "rpc") {
        try {
          const result = await host.onRpc(
            msg.connId,
            msg.method,
            msg.args ?? [],
          );
          if (!settled) {
            worker.postMessage({
              type: "rpcResult",
              id: msg.id,
              ok: true,
              result,
            });
          }
        } catch (err: any) {
          if (!settled) {
            const isStop = Boolean(err?.__isMacroStop);
            worker.postMessage({
              type: "rpcResult",
              id: msg.id,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
              code: err instanceof FmError ? err.code : undefined,
              details: err instanceof FmError ? err.details : undefined,
              stop: isStop,
            });
          }
        }
        return;
      }

      if (msg.type === "done") {
        if (msg.tempVars && typeof msg.tempVars === "object") {
          for (const k of Object.keys(host.tempVarsStore))
            delete host.tempVarsStore[k];
          Object.assign(host.tempVarsStore, msg.tempVars);
        }
        cleanup();
        if (msg.ok) {
          resolve(msg.result);
        } else if (msg.stop) {
          reject(host.createStopSignal(msg.error || "Stopped by StopMacro"));
        } else if (msg.code) {
          reject(
            new FmError(msg.code, msg.error || "Macro failed", msg.details),
          );
        } else {
          reject(new Error(msg.error || "Macro failed"));
        }
      }
    });

    worker.postMessage({
      type: "start",
      runnerSource,
      engine: host.engine,
      label: host.label,
      bunVersion: host.bunVersion,
      tempVars: { ...host.tempVarsStore },
      inputParams: { ...host.inputParams },
      connectionsList: host.connectionsList,
    });
  });
}
