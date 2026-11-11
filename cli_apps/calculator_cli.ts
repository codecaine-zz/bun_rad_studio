#!/usr/bin/env bun
import { SimpleCLI } from "../src/index.ts";
import {
  createCalculatorStudio,
  startCalculatorStudioServer,
} from "../applications/calculator_studio.ts";

const app = SimpleCLI.newApp("calculator-cli", "2.7.0").setDescription(
  "Orbit Universal Computing Suite & Scientific Calculator CLI",
);

app.addFlagBool(
  "gui",
  "g",
  false,
  "Launch Orbit Universal Computing Suite desktop application",
);
app.addFlagBool(
  "server",
  "s",
  false,
  "Launch background web server without opening window",
);
app.addFlagInt(
  "port",
  "p",
  0,
  "Specific HTTP port to bind to when running as server",
);
app.addFlagString(
  "eval",
  "e",
  "",
  "Evaluate mathematical expression (e.g. 'sin(pi/4) + sqrt(16)')",
);

const MATH_CONSTANTS: Record<string, number> = Object.assign(
  Object.create(null),
  {
    pi: Math.PI,
    π: Math.PI,
    e: Math.E,
    tau: Math.PI * 2,
    τ: Math.PI * 2,
    phi: (1 + Math.sqrt(5)) / 2,
    φ: (1 + Math.sqrt(5)) / 2,
  },
);

const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> =
  Object.assign(Object.create(null), {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    asinh: Math.asinh,
    acosh: Math.acosh,
    atanh: Math.atanh,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    ln: Math.log,
    log: Math.log10,
    log10: Math.log10,
    log2: Math.log2,
    exp: Math.exp,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    trunc: Math.trunc,
    sign: Math.sign,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
    hypot: Math.hypot,
    deg: (rad: number) => (rad * 180) / Math.PI,
    rad: (deg: number) => (deg * Math.PI) / 180,
  });

type CalcToken =
  | { type: "num"; value: number }
  | { type: "ident"; name: string }
  | { type: "op"; op: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" }
  | { type: "eof" };

function tokenizeMathExpression(input: string): CalcToken[] {
  if (input.length > 4096) {
    throw new Error("Expression exceeds maximum allowed length (4096 chars)");
  }
  const tokens: CalcToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (
      (ch >= "0" && ch <= "9") ||
      (ch === "." &&
        i + 1 < input.length &&
        input[i + 1]! >= "0" &&
        input[i + 1]! <= "9")
    ) {
      const rest = input.slice(i);
      const hexMatch = /^0[xX][0-9a-fA-F]+/.exec(rest);
      const binMatch = !hexMatch ? /^0[bB][01]+/.exec(rest) : null;
      const numMatch =
        hexMatch ??
        binMatch ??
        /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
      if (!numMatch) {
        throw new Error(`Invalid number near "${rest.slice(0, 16)}"`);
      }
      const raw = numMatch[0];
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`Number out of range: "${raw}"`);
      }
      tokens.push({ type: "num", value });
      i += raw.length;
      continue;
    }
    if (/[A-Za-z_πτφ]/.test(ch)) {
      const m = /^[A-Za-z_πτφ][A-Za-z0-9_πτφ]*/.exec(input.slice(i))!;
      tokens.push({ type: "ident", name: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if (ch === "*" && input[i + 1] === "*") {
      tokens.push({ type: "op", op: "^" });
      i += 2;
      continue;
    }
    if (
      ch === "+" ||
      ch === "-" ||
      ch === "*" ||
      ch === "/" ||
      ch === "%" ||
      ch === "^" ||
      ch === "!"
    ) {
      tokens.push({ type: "op", op: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" at position ${i + 1}`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

/**
 * Evaluates a mathematical expression using a safe recursive-descent parser without `eval` or `new Function`.
 */
export function evaluateSafeMath(
  expression: string,
  variables: Record<string, number> = {},
): number {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new Error("Empty mathematical expression");
  }
  const tokens = tokenizeMathExpression(trimmed);
  let pos = 0;
  let depth = 0;

  const peek = (): CalcToken => tokens[pos]!;
  const consume = (): CalcToken => tokens[pos++]!;

  const canImplicitMultiplyNext = (): boolean => {
    const next = peek();
    return (
      next.type === "lparen" || next.type === "ident" || next.type === "num"
    );
  };

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (true) {
      const tok = peek();
      if (tok.type === "op" && (tok.op === "+" || tok.op === "-")) {
        consume();
        const right = parseMulDiv();
        left = tok.op === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parseUnary();
    while (true) {
      const tok = peek();
      if (
        tok.type === "op" &&
        (tok.op === "*" || tok.op === "/" || tok.op === "%")
      ) {
        consume();
        const right = parseUnary();
        if (tok.op === "*") left *= right;
        else if (tok.op === "/") left /= right;
        else left %= right;
      } else if (canImplicitMultiplyNext()) {
        const right = parseUnary();
        left *= right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseUnary(): number {
    const tok = peek();
    if (tok.type === "op" && (tok.op === "+" || tok.op === "-")) {
      consume();
      const val = parseUnary();
      return tok.op === "-" ? -val : val;
    }
    return parsePower();
  }

  function parsePower(): number {
    let base = parsePostfix();
    const tok = peek();
    if (tok.type === "op" && tok.op === "^") {
      consume();
      const exp = parseUnary();
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parsePostfix(): number {
    let val = parsePrimary();
    while (
      peek().type === "op" &&
      (peek() as { type: "op"; op: string }).op === "!"
    ) {
      consume();
      if (!Number.isInteger(val) || val < 0 || val > 170) {
        throw new Error(
          `Factorial requires an integer in [0, 170], got ${val}`,
        );
      }
      let acc = 1;
      for (let k = 2; k <= val; k++) acc *= k;
      val = acc;
    }
    return val;
  }

  function parsePrimary(): number {
    const tok = peek();
    if (tok.type === "num") {
      consume();
      return tok.value;
    }
    if (tok.type === "lparen") {
      consume();
      depth++;
      if (depth > 64) throw new Error("Expression nesting too deep");
      const inner = parseAddSub();
      depth--;
      if (peek().type !== "rparen") {
        throw new Error("Missing closing parenthesis ')'");
      }
      consume();
      return inner;
    }
    if (tok.type === "ident") {
      consume();
      const name = tok.name;
      if (peek().type === "lparen") {
        if (!Object.hasOwn(MATH_FUNCTIONS, name)) {
          throw new Error(`Unknown math function "${name}"`);
        }
        consume();
        depth++;
        if (depth > 64) throw new Error("Expression nesting too deep");
        const args: number[] = [];
        if (peek().type !== "rparen") {
          args.push(parseAddSub());
          while (peek().type === "comma") {
            consume();
            args.push(parseAddSub());
          }
        }
        depth--;
        if (peek().type !== "rparen") {
          throw new Error(`Missing closing ')' in call to ${name}()`);
        }
        consume();
        if (args.length === 0) {
          throw new Error(`Function "${name}" requires at least 1 argument`);
        }
        return MATH_FUNCTIONS[name]!(...args);
      }
      if (Object.hasOwn(variables, name)) {
        return variables[name]!;
      }
      if (Object.hasOwn(MATH_CONSTANTS, name)) {
        return MATH_CONSTANTS[name]!;
      }
      throw new Error(`Unknown identifier "${name}"`);
    }
    throw new Error(`Unexpected token "${tok.type}"`);
  }

  const result = parseAddSub();
  if (peek().type !== "eof") {
    throw new Error(`Unexpected trailing token "${peek().type}"`);
  }
  return result;
}

if (import.meta.main) {
  if (!app.parseCli()) process.exit(0);

  // 1. Launch GUI
  if (app.getFlagBool("gui")) {
    console.log("⚡ Launching Orbit Universal Computing Suite GUI...");
    const studio = createCalculatorStudio({ fullscreen: true });
    await studio.run();
    process.exit(0);
  }

  // 2. Launch Server
  if (app.getFlagBool("server")) {
    const port = app.getFlagInt("port") || 0;
    const srv = startCalculatorStudioServer({ port, host: "127.0.0.1" });
    app.banner("Orbit Universal Computing Suite", `v2.7.0 - Web Server`);
    console.log(`⚡ Server active at: http://127.0.0.1:${srv.port}`);
    console.log(`Press Ctrl+C to stop.`);
    setInterval(() => {}, 60000);
  } else if (app.getFlagString("eval")) {
    // 3. Fast Evaluation
    const expr = app.getFlagString("eval");
    try {
      const result = evaluateSafeMath(expr);
      app.banner("Orbit Math Evaluator", "v2.7.0");
      app.printKv({
        Expression: expr,
        Result: String(result),
        Type: typeof result,
      });
    } catch (err: any) {
      console.error(`Evaluation Error: ${err?.message || err}`);
      process.exit(1);
    }
  } else {
    // Default: Launch GUI or display banner & prompt
    const args = app.getPositionalArgs();
    if (args.length > 0) {
      const expr = args.join(" ");
      try {
        const result = evaluateSafeMath(expr);
        app.banner("Orbit Math Evaluator", "v2.7.0");
        app.printKv({
          Expression: expr,
          Result: String(result),
        });
      } catch (err: any) {
        console.error(`Evaluation Error: ${err?.message || err}`);
        process.exit(1);
      }
    } else {
      // Launch GUI when called with no arguments
      console.log("⚡ Launching Orbit Universal Computing Suite GUI...");
      const studio = createCalculatorStudio({ fullscreen: true });
      await studio.run();
      process.exit(0);
    }
  }
}
