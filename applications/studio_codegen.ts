/**
 * Code generation for the Studio apps (SQLite / MySQL / Postgres).
 *
 * Translates a macro, a saved query or any SQL into a standalone, runnable program that uses the
 * *native* SQLite driver of the target language, following that ecosystem's best practices:
 *
 *   python -> sqlite3 (stdlib): parameterized queries, `with conn:` transaction, argparse, type hints
 *   bun    -> bun:sqlite:       prepared statements, db.transaction(), WAL + foreign_keys, parseArgs
 *   vlang  -> db.sqlite:        `!` error propagation, BEGIN/COMMIT/ROLLBACK, flag module
 *
 * Values typed by the user (`[Enter ...]` prompts, InsertRecord fields) are always bound as
 * parameters, never concatenated into SQL. MySQL/Postgres SQL is translated to SQLite on a best
 * effort basis and every construct that could not be translated is reported as a warning.
 */

import {
  type MacroAction,
  type MacroDefinition,
  type MacroDialect,
  type SavedQueryDefinition,
  buildDeleteRecordSql,
  buildEmptyTableSql,
  buildMakeTableStatements,
  buildUpdateRecordSql,
  extractPromptParams,
  parseRecordFields,
  quoteIdentFor,
} from "./sqlite_studio_macros.ts";

export type CodegenTarget = "python" | "bun" | "vlang" | "bun-sql" | "typescript";

export interface CodegenResult {
  target: CodegenTarget;
  language: string;
  filename: string;
  runHint: string;
  code: string;
  warnings: string[];
}

export interface CodegenContext {
  sourceDialect: MacroDialect;
  queries?: SavedQueryDefinition[];
  macros?: MacroDefinition[];
  appName?: string;
}

export const CODEGEN_TARGETS: Record<CodegenTarget, { label: string; ext: string }> = {
  python: { label: "Python (sqlite3)", ext: "py" },
  bun: { label: "Bun (bun:sqlite)", ext: "ts" },
  vlang: { label: "V (db.sqlite)", ext: "v" },
  "bun-sql": { label: "Bun (Bun.sql native)", ext: "ts" },
  typescript: { label: "TypeScript (Interfaces + Client)", ext: "ts" },
};

function isJsTarget(target: CodegenTarget): boolean {
  return target === "bun" || target === "bun-sql" || target === "typescript";
}

// -------------------------------------------------------------------------------------------------
// SQL translation (MySQL / Postgres -> SQLite)
// -------------------------------------------------------------------------------------------------

/** Runs `fn` on the parts of `sql` that are outside string literals and comments. */
function mapOutsideStrings(sql: string, fn: (chunk: string) => string): string {
  let out = "";
  let buf = "";
  let i = 0;
  const flush = () => { out += fn(buf); buf = ""; };
  while (i < sql.length) {
    const c = sql[i]!;
    if (c === "'" || c === '"' || c === "`") {
      flush();
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; }
          break;
        }
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" && sql[i + 1] === "-") {
      flush();
      let j = sql.indexOf("\n", i);
      if (j === -1) j = sql.length;
      out += sql.slice(i, j);
      i = j;
    } else if (c === "/" && sql[i + 1] === "*") {
      flush();
      let j = sql.indexOf("*/", i + 2);
      j = j === -1 ? sql.length : j + 2;
      out += sql.slice(i, j);
      i = j;
    } else {
      buf += c;
      i++;
    }
  }
  flush();
  return out;
}

/** `ident` -> "ident", leaving string literals and comments untouched. */
function convertBackticks(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "`") {
      let j = i + 1;
      let id = "";
      while (j < sql.length) {
        if (sql[j] === "`") { if (sql[j + 1] === "`") { id += "`"; j += 2; continue; } break; }
        id += sql[j];
        j++;
      }
      out += `"${id.replace(/"/g, '""')}"`;
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function translateSqlToSqlite(sql: string, source: MacroDialect): { sql: string; warnings: string[] } {
  if (source === "sqlite") return { sql, warnings: [] };
  const warnings = new Set<string>();
  const warn = (m: string) => warnings.add(m);
  let out = sql;

  if (source === "mysql") out = convertBackticks(out);
  // Intervals contain a quoted literal, so they must be rewritten before the string-aware pass.
  out = out.replace(/\b(?:NOW|CURRENT_TIMESTAMP)\s*\(\s*\)\s*([-+])\s*INTERVAL\s+'?(\d+)\s*(second|minute|hour|day|week|month|year)s?'?/gi,
    (_m, sign, n, unit) => `datetime('now', '${sign}${n} ${String(unit).toLowerCase()}s')`);
  if (source === "postgres") {
    out = out.replace(/"public"\./gi, "");
  }

  out = mapOutsideStrings(out, (c) => {
    let t = c;
    t = t.replace(/\b(?:NOW|CURRENT_TIMESTAMP)\s*\(\s*\)/gi, "datetime('now')");
    t = t.replace(/\bCURDATE\s*\(\s*\)/gi, "date('now')");
    t = t.replace(/\bILIKE\b/gi, "LIKE");
    t = t.replace(/\bLIMIT\s+(\d+)\s*,\s*(\d+)/gi, "LIMIT $2 OFFSET $1");
    t = t.replace(/\)\s*ENGINE\s*=\s*\w+(\s+DEFAULT)?(\s+CHARSET\s*=\s*\w+)?(\s+COLLATE\s*=\s*\w+)?/gi, ")");
    t = t.replace(/\bAUTO_INCREMENT\b/gi, () => { warn("AUTO_INCREMENT: use INTEGER PRIMARY KEY (AUTOINCREMENT) in SQLite."); return "AUTOINCREMENT"; });
    t = t.replace(/\bBIGSERIAL\b|\bSERIAL\b/gi, () => { warn("SERIAL: replaced by INTEGER; add PRIMARY KEY AUTOINCREMENT by hand."); return "INTEGER"; });
    t = t.replace(/::\s*[a-z_][a-z0-9_]*(\s*\[\])?/gi, (m) => { warn(`Postgres cast '${m.trim()}' removed; use CAST(... AS ...) if the type matters.`); return ""; });
    return t;
  });

  const unsupported: [RegExp, string][] = [
    [/\bDISTINCT\s+ON\b/i, "DISTINCT ON is not supported by SQLite."],
    [/\b(?:JSONB|TIMESTAMPTZ|UUID|ENUM)\b/i, "Postgres/MySQL column types (JSONB, TIMESTAMPTZ, UUID, ENUM) have no SQLite equivalent; SQLite stores them with dynamic typing."],
    [/\bto_jsonb\s*\(|\bjsonb_/i, "Postgres JSON functions: use SQLite json_* functions instead."],
    [/\bCONCAT\s*\(/i, "CONCAT(): use the || operator in SQLite."],
    [/\bDATE_FORMAT\s*\(|\bDATE_TRUNC\s*\(|\bEXTRACT\s*\(/i, "Date functions differ: use strftime()/date()/datetime() in SQLite."],
    [/\bGROUP_CONCAT\b|\bSTRING_AGG\b|\bARRAY_AGG\b/i, "Aggregate differs: SQLite has group_concat()."],
    [/\bINTERVAL\b/i, "INTERVAL expressions are not translated; use datetime('now', '-N days')."],
    [/\bON\s+DUPLICATE\s+KEY\b/i, "ON DUPLICATE KEY UPDATE: use INSERT ... ON CONFLICT DO UPDATE in SQLite."],
    [/\b(?:OPTIMIZE|ANALYZE)\s+TABLE\b|\bSHOW\s+(?:TABLES|COLUMNS|CREATE|DATABASES)\b|\bDESCRIBE\b/i, "Server administration statements are not available in SQLite (use PRAGMA / sqlite_master)."],
    [/\bUNSIGNED\b|\bTINYINT\s*\(/i, "MySQL integer attributes are ignored by SQLite."],
    [/\bSET\s+search_path\b|\bCREATE\s+(?:EXTENSION|SCHEMA|SEQUENCE|TYPE)\b/i, "Postgres-only DDL has no SQLite equivalent."],
  ];
  for (const [re, msg] of unsupported) if (re.test(out)) warn(msg);
  return { sql: out, warnings: [...warnings] };
}

/** Splits a script into statements on `;` outside strings/comments. */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" && sql[i + 1] === "-") {
      let j = sql.indexOf("\n", i);
      if (j === -1) j = sql.length;
      cur += sql.slice(i, j);
      i = j;
    } else if (c === "/" && sql[i + 1] === "*") {
      let j = sql.indexOf("*/", i + 2);
      j = j === -1 ? sql.length : j + 2;
      cur += sql.slice(i, j);
      i = j;
    } else if (c === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
    } else {
      cur += c;
      i++;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim() !== "");
}

// -------------------------------------------------------------------------------------------------
// Naming / literals
// -------------------------------------------------------------------------------------------------

const PY_KEYWORDS = new Set(["False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield", "params", "conn", "cur", "rows"]);
const JS_KEYWORDS = new Set(["break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield", "let", "static", "await", "async", "params", "db", "result", "rows"]);
const V_KEYWORDS = new Set(["as", "asm", "assert", "atomic", "break", "const", "continue", "defer", "else", "enum", "false", "fn", "for", "go", "goto", "if", "import", "in", "interface", "is", "isreftype", "lock", "match", "module", "mut", "none", "or", "pub", "return", "rlock", "select", "shared", "sizeof", "spawn", "static", "struct", "true", "type", "typeof", "union", "unsafe", "volatile", "__global", "db", "params", "rows"]);

function words(name: string): string[] {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

function snake(name: string): string {
  const w = words(name);
  const s = w.join("_") || "item";
  return /^\d/.test(s) ? `_${s}` : s;
}

function camel(name: string): string {
  const w = words(name);
  const s = w.map((x, i) => (i === 0 ? x : x[0]!.toUpperCase() + x.slice(1))).join("") || "item";
  return /^\d/.test(s) ? `_${s}` : s;
}

function identFor(target: CodegenTarget, name: string): string {
  const id = isJsTarget(target) ? camel(name) : snake(name);
  const kw = target === "python" ? PY_KEYWORDS : isJsTarget(target) ? JS_KEYWORDS : V_KEYWORDS;
  return kw.has(id) ? `${id}_` : id;
}

function fnNameFor(target: CodegenTarget, macroName: string): string {
  return isJsTarget(target) ? `run${camel(macroName)[0]!.toUpperCase()}${camel(macroName).slice(1)}` : `run_${snake(macroName)}`;
}

function pyStr(s: string): string {
  if (!s.includes("\n") && s.includes('"') && !s.includes("'") && !s.includes("\\")) return `'${s}'`;
  if (!s.includes("\n")) return JSON.stringify(s);
  return `"""${s.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"')}"""`;
}

function jsStr(s: string): string {
  if (!s.includes("\n") && s.includes('"') && !s.includes("'") && !s.includes("\\")) return `'${s}'`;
  if (!s.includes("\n")) return JSON.stringify(s);
  return "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
}

function vStr(s: string): string {
  if (s.includes("'") && !s.includes('"')) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + '"';
  }
  return "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$/g, "\\$").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + "'";
}

function strLit(target: CodegenTarget, s: string): string {
  return target === "python" ? pyStr(s) : isJsTarget(target) ? jsStr(s) : vStr(s);
}

// -------------------------------------------------------------------------------------------------
// Intermediate representation
// -------------------------------------------------------------------------------------------------

type Bind = { kind: "param"; name: string } | { kind: "lit"; value: string | number | boolean | null };

interface Op {
  step: number;
  action: string;
  condition?: string;
  cont: boolean;
  kind: "sql" | "comment" | "setvar" | "print" | "call" | "stop";
  // sql
  sql?: string;
  binds?: Bind[];
  returnsRows?: boolean;
  capturesRowCount?: boolean;
  // comment / print
  text?: string;
  // setvar
  varName?: string;
  varValue?: string | number;
  // call
  macroName?: string;
}

interface PostOp {
  step: number;
  action: string;
  kind: "vacuum" | "backup";
  analyze?: boolean;
}

interface MacroPlan {
  macro: MacroDefinition;
  fn: string;
  ops: Op[];
  vars: Map<string, "int" | "float" | "string">;
}

interface Plan {
  macros: MacroPlan[]; // dependency order: callees first
  params: string[]; // prompt parameter names, in first-use order
  post: PostOp[];
  warnings: string[];
}

const KNOWN_STRING_VARS = new Set(["activeTable", "dbName", "currentRecord", "findWhat"]);
const UI_VARS = new Set(["totalRows", "activeTable", "dbName", "kpiTables", "activeRow"]);

function isRowReturning(sql: string): boolean {
  const first = sql.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/, "").match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "";
  return ["SELECT", "WITH", "PRAGMA", "EXPLAIN", "VALUES", "SHOW", "DESCRIBE"].includes(first);
}

function buildPlan(root: MacroDefinition, ctx: CodegenContext, target: CodegenTarget): Plan {
  const warnings: string[] = [];
  const params: string[] = [];
  const post: PostOp[] = [];
  const done = new Map<string, MacroPlan>();
  const order: MacroPlan[] = [];
  const stack: string[] = [];
  const src = ctx.sourceDialect;
  const allMacros = ctx.macros || [];
  const warn = (m: string) => { if (!warnings.includes(m)) warnings.push(m); };

  const prepareSql = (raw: string, step: number): { sql: string; binds: Bind[] } => {
    const binds: Bind[] = [];
    // [Enter X] prompts become bound parameters.
    for (const name of extractPromptParams(raw)) if (!params.includes(name)) params.push(name);
    let idx = 0;
    const withPlaceholders = raw.replace(/\[(Enter [^\[\]\r\n]+)\]/gi, (_m, name) => {
      binds.push({ kind: "param", name });
      idx++;
      return target === "bun-sql" && src === "postgres" ? `$${idx}` : "?";
    });
    if (target === "bun-sql") {
      return { sql: withPlaceholders.trim().replace(/;+\s*$/, ""), binds };
    }
    const tr = translateSqlToSqlite(withPlaceholders, src);
    tr.warnings.forEach((w) => warn(`Step ${step}: ${w}`));
    return { sql: tr.sql.trim().replace(/;+\s*$/, ""), binds };
  };

  const visit = (macro: MacroDefinition): MacroPlan => {
    const existing = done.get(macro.name);
    if (existing) return existing;
    const plan: MacroPlan = { macro, fn: fnNameFor(target, macro.name), ops: [], vars: new Map() };
    done.set(macro.name, plan);
    stack.push(macro.name);

    const qSql = (name: string) => (ctx.queries || []).find((q) => q.name.toLowerCase() === String(name).toLowerCase() || q.id === name)?.sql;
    const lookupMacro = (name: string) => allMacros.find((m) => m.name.toLowerCase() === String(name).toLowerCase() || m.id === name);

    (macro.actions || []).forEach((act: MacroAction, idx) => {
      const step = idx + 1;
      const p = act.parameters || {};
      const base = { step, action: act.action, condition: act.condition?.trim() || undefined, cont: act.continueOnError ?? macro.onError === "continue" };
      const tbl = p.table || p.tableName || p.targetTable;
      const push = (op: Omit<Op, "step" | "action" | "cont" | "condition">) => plan.ops.push({ ...base, ...op } as Op);
      const sqlOp = (raw: string, extra: Partial<Op> = {}, pre: Bind[] = []) => {
        const { sql, binds } = prepareSql(raw, step);
        push({ kind: "sql", sql, binds: [...pre, ...binds], returnsRows: isRowReturning(sql), ...extra });
      };

      if (act.enabled === false) {
        plan.ops.push({ ...base, kind: "comment", text: `Step ${step} (${act.action}) is disabled in the macro`, condition: undefined });
        return;
      }

      try {
        switch (act.action) {
          case "Comment":
            push({ kind: "comment", text: String(p.comment || "") });
            break;
          case "RunSQL":
            if (!p.sql) throw new Error("RunSQL has no SQL");
            sqlOp(String(p.sql));
            break;
          case "OpenQuery": {
            const sql = (p.queryName && qSql(p.queryName)) || p.sql;
            if (!sql) throw new Error(p.queryName ? `saved query '${p.queryName}' not found` : "OpenQuery has no SQL");
            sqlOp(String(sql));
            break;
          }
          case "OpenTable":
            if (!tbl) throw new Error("OpenTable has no table");
            sqlOp(`SELECT * FROM ${quoteIdentFor("sqlite", tbl)} LIMIT 100`);
            break;
          case "InsertRecord": {
            if (!tbl) throw new Error("InsertRecord has no table");
            const fields = parseRecordFields(p.fields || p.record || p.values);
            const keys = Object.keys(fields);
            if (!keys.length) throw new Error("InsertRecord has no fields");
            const binds: Bind[] = keys.map((k) => ({ kind: "lit", value: fields[k] ?? null }));
            const sql = `INSERT INTO ${quoteIdentFor("sqlite", tbl)} (${keys.map((k) => quoteIdentFor("sqlite", k)).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
            push({ kind: "sql", sql, binds, returnsRows: false, capturesRowCount: true });
            break;
          }
          case "UpdateRecord":
            if (!tbl) throw new Error("UpdateRecord has no table");
            sqlOp(buildUpdateRecordSql(tbl, p.setValues || p.set || p.updates, p.whereCondition || p.where || p.condition, "sqlite"), { capturesRowCount: true });
            break;
          case "DeleteRecord":
            if (!tbl) throw new Error("DeleteRecord has no table");
            sqlOp(buildDeleteRecordSql(tbl, p.whereCondition || p.where || p.condition, "sqlite"), { capturesRowCount: true });
            break;
          case "EmptyTable":
            if (!tbl) throw new Error("EmptyTable has no table");
            sqlOp(buildEmptyTableSql(tbl, "sqlite"), { capturesRowCount: true });
            break;
          case "MakeTable": {
            const name = p.newTable || p.newTableName || p.tableName || p.table;
            const sel = (p.queryName && qSql(p.queryName)) || p.selectSql || p.sourceSql || p.sql;
            if (!name || !sel) throw new Error("MakeTable needs a table name and a SELECT");
            for (const stmt of buildMakeTableStatements(name, String(sel), p.dropExisting !== false, "sqlite")) sqlOp(stmt);
            break;
          }
          case "SetVariable":
          case "SetValue": {
            const name = String(act.action === "SetVariable" ? p.name || "var1" : p.item || "var").replace(/^\[|\]$/g, "");
            const raw = p.expression;
            const num = typeof raw === "number" ? raw : raw !== "" && raw !== null && raw !== undefined && !isNaN(Number(raw)) ? Number(raw) : null;
            push({ kind: "setvar", varName: name, varValue: num !== null ? num : String(raw ?? "") });
            break;
          }
          case "MessageBox":
            push({ kind: "print", text: `${p.title ? p.title + ": " : ""}${p.message || ""}` });
            break;
          case "RunMacro": {
            const sub = lookupMacro(p.macroName);
            if (!sub) throw new Error(`sub-macro '${p.macroName}' not found`);
            if (stack.includes(sub.name)) {
              warn(`Step ${step}: RunMacro '${sub.name}' is recursive and was not translated.`);
              push({ kind: "comment", text: `RunMacro '${sub.name}' skipped (recursive)` });
              break;
            }
            visit(sub);
            push({ kind: "call", macroName: sub.name });
            break;
          }
          case "StopMacro":
            push({ kind: "stop", text: p.reason ? String(p.reason) : "" });
            break;
          case "VacuumDatabase":
            post.push({ step, action: act.action, kind: "vacuum", analyze: Boolean(p.analyze) });
            plan.ops.push({ ...base, kind: "comment", text: `Step ${step}: VACUUM${p.analyze ? " + optimize" : ""} runs after the transaction commits (see main)`, condition: undefined });
            break;
          case "BackupDatabase":
            post.push({ step, action: act.action, kind: "backup" });
            plan.ops.push({ ...base, kind: "comment", text: `Step ${step}: backup copy is created after the transaction commits (see main)`, condition: undefined });
            break;
          default:
            push({ kind: "comment", text: `${act.action} is a UI-only action and was skipped` });
            warn(`Step ${step}: '${act.action}' is a UI-only action with no database effect; it was skipped.`);
        }
      } catch (err: any) {
        warn(`Step ${step} (${act.action}) could not be translated: ${err?.message || err}`);
        plan.ops.push({ ...base, kind: "comment", text: `Step ${step} (${act.action}) could not be translated: ${err?.message || err}`, condition: undefined });
      }
    });

    stack.pop();
    order.push(plan);
    return plan;
  };

  visit(root);

  // Variable discovery (conditions + SetVariable) per macro.
  for (const plan of order) {
    for (const op of plan.ops) {
      if (op.kind === "setvar" && op.varName) {
        plan.vars.set(op.varName, typeof op.varValue === "number" ? (Number.isInteger(op.varValue) ? "int" : "float") : "string");
      }
    }
    for (const op of plan.ops) {
      if (!op.condition) continue;
      for (const m of op.condition.matchAll(/\[([A-Za-z0-9_]+)\]/g)) {
        const name = m[1]!;
        if (!plan.vars.has(name)) {
          plan.vars.set(name, KNOWN_STRING_VARS.has(name) ? "string" : "int");
          if (UI_VARS.has(name)) warn(`Condition [${name}] is a UI variable in the designer; it is initialized to a default here — set it yourself.`);
        }
      }
    }
    if (plan.ops.some((o) => o.capturesRowCount) && plan.ops.some((o) => o.condition?.includes("[lastRowsAffected]"))) {
      plan.vars.set("lastRowsAffected", "int");
    }
  }

  const nested = order.length > 1;
  if (nested) warn("Variables are local to each macro function; sub-macros do not share variable values.");
  return { macros: order, params, post, warnings };
}

// -------------------------------------------------------------------------------------------------
// Conditions
// -------------------------------------------------------------------------------------------------

function translateCondition(expr: string, target: CodegenTarget): string | null {
  if (/[A-Za-z_]\w*\s*\(/.test(expr.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''"))) return null;
  let out = "";
  let i = 0;
  while (i < expr.length) {
    const c = expr[i]!;
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < expr.length && expr[j] !== c) { if (expr[j] === "\\") j++; j++; }
      out += expr.slice(i, j + 1);
      i = j + 1;
    } else if (c === "[") {
      const j = expr.indexOf("]", i);
      if (j === -1) return null;
      out += identFor(target, expr.slice(i + 1, j));
      i = j + 1;
    } else if (expr.startsWith("===", i)) { out += "=="; i += 3; }
    else if (expr.startsWith("!==", i)) { out += "!="; i += 3; }
    else if (expr.startsWith("&&", i) || expr.startsWith("||", i)) {
      const and = expr.startsWith("&&", i);
      out = out.trimEnd() + (target === "python" ? (and ? " and " : " or ") : and ? " && " : " || ");
      i += 2;
      while (expr[i] === " ") i++;
    }
    else if (c === "!" && expr[i + 1] !== "=") { out += target === "python" ? "not " : "!"; i++; }
    else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < expr.length && /\w/.test(expr[j]!)) j++;
      const w = expr.slice(i, j);
      if (w === "true" || w === "false") out += target === "python" ? (w === "true" ? "True" : "False") : w;
      else if (w === "null") out += target === "python" ? "None" : isJsTarget(target) ? "null" : "none";
      else return null; // bare identifiers are not translatable
      i = j;
    } else if (/[\w\s<>=!+\-*/%().,]/.test(c)) { out += c; i++; }
    else return null;
  }
  return out.trim();
}

// -------------------------------------------------------------------------------------------------
// Emitters
// -------------------------------------------------------------------------------------------------

class Writer {
  private lines: string[] = [];
  private level = 0;
  constructor(private unit: string) {}
  line(text = "") { this.lines.push(text ? this.unit.repeat(this.level) + text : ""); }
  indent() { this.level++; }
  dedent() { this.level--; }
  block(open: string, body: () => void, close?: string) {
    this.line(open);
    this.indent();
    body();
    this.dedent();
    if (close) this.line(close);
  }
  toString() { return this.lines.join("\n") + "\n"; }
}

function paramAccess(target: CodegenTarget, name: string): string {
  const id = identFor(target, name);
  return target === "python" ? `params[${JSON.stringify(id)}]` : isJsTarget(target) ? `params.${id}` : `params['${id}']`;
}

function bindExpr(target: CodegenTarget, b: Bind): string {
  if (b.kind === "param") return paramAccess(target, b.name);
  const v = b.value;
  if (v === null) return target === "python" ? "None" : "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return target === "python" ? (v ? "True" : "False") : v ? "true" : "false";
  return strLit(target, String(v));
}

/** V binds every parameter as TEXT; numbers/NULLs are inlined into the SQL (they are not user input). */
function prepareVBinds(op: Op): { sql: string; binds: string[] } {
  let n = 0;
  const binds: string[] = [];
  const sql = op.sql!.replace(/\?/g, () => {
    const b = op.binds![n++]!;
    if (!b) return "?";
    if (b.kind === "lit" && (b.value === null || typeof b.value === "number" || typeof b.value === "boolean")) {
      return b.value === null ? "NULL" : String(typeof b.value === "boolean" ? (b.value ? 1 : 0) : b.value);
    }
    binds.push(bindExpr("vlang", b));
    return "?";
  });
  return { sql, binds };
}

function pyDefault(t: "int" | "float" | "string") { return t === "string" ? '""' : t === "float" ? "0.0" : "0"; }
function jsDefault(t: "int" | "float" | "string") { return t === "string" ? '""' : "0"; }
function vDefault(t: "int" | "float" | "string") { return t === "string" ? "''" : t === "float" ? "0.0" : "0"; }

function header(kind: string, name: string, ctx: CodegenContext, comment: string, warnings: string[]): string[] {
  const lines = [
    `Generated by ${ctx.appName || "Studio Pro"} from ${kind} "${name}"`,
    `Source SQL dialect: ${ctx.sourceDialect}${ctx.sourceDialect === "sqlite" ? "" : " (translated to SQLite, best effort)"}`,
    "Review before production use: user input is always bound as parameters.",
  ];
  if (warnings.length) {
    lines.push("", "Warnings:");
    warnings.forEach((w) => lines.push(` - ${w}`));
  }
  return lines.map((l) => (l ? `${comment} ${l}` : comment));
}

// ---- Python -------------------------------------------------------------------------------------

function emitPython(plan: Plan, root: MacroDefinition, kind: string, ctx: CodegenContext): string {
  const w = new Writer("    ");
  const mod = [
    "#!/usr/bin/env python3",
    '"""' + header(kind, root.name, ctx, "", plan.warnings).map((l) => l.replace(/^ ?/, "")).join("\n").trim() + '"""',
  ];
  mod.forEach((l) => w.line(l));
  w.line("from __future__ import annotations");
  w.line();
  w.line("import argparse");
  w.line("import os");
  w.line("import sqlite3");
  w.line("import sys");
  if (plan.post.some((p) => p.kind === "backup")) w.line("from datetime import datetime");
  w.line();
  w.line("Params = dict[str, str]");
  w.line();
  w.line();
  w.block("def connect(path: str) -> sqlite3.Connection:", () => {
    w.line('"""Open the database with row access by column name and foreign keys enforced."""');
    w.line("conn = sqlite3.connect(path)");
    w.line("conn.row_factory = sqlite3.Row");
    w.line('conn.execute("PRAGMA foreign_keys = ON")');
    w.line("return conn");
  });
  w.line();
  w.line();
  w.block("def print_rows(rows: list[sqlite3.Row]) -> None:", () => {
    w.line("for row in rows:");
    w.line("    print(dict(row))");
  });

  for (const mp of plan.macros) {
    w.line();
    w.line();
    w.block(`def ${mp.fn}(conn: sqlite3.Connection, params: Params) -> bool:`, () => {
      w.line(`"""Macro '${mp.macro.name.replace(/"/g, "'")}'. Returns True if a StopMacro step halted it."""`);
      for (const [name, t] of mp.vars) w.line(`${identFor("python", name)} = ${pyDefault(t)}`);
      if (mp.ops.length === 0) w.line("return False");
      for (const op of mp.ops) emitPyOp(w, op, mp);
      if (mp.ops.length) w.line("return False");
    });
  }

  const paramIds = plan.params;
  w.line();
  w.line();
  w.block("def main() -> int:", () => {
    w.line(`parser = argparse.ArgumentParser(description=${pyStr(`Run macro "${root.name}"`)})`);
    w.line('parser.add_argument("--db", default=os.environ.get("DB_PATH", "app.db"), help="SQLite database file")');
    for (const name of paramIds) {
      const id = identFor("python", name);
      w.line(`parser.add_argument("--${id.replace(/_/g, "-")}", dest=${JSON.stringify(id)}, required=True, help=${pyStr(name)})`);
    }
    w.line("args = parser.parse_args()");
    w.line(`params: Params = {${paramIds.map((n) => `${JSON.stringify(identFor("python", n))}: getattr(args, ${JSON.stringify(identFor("python", n))})`).join(", ")}}`);
    w.line();
    w.line("conn = connect(args.db)");
    w.block("try:", () => {
      w.line("with conn:  # one transaction: commits on success, rolls back on any error");
      w.line(`    ${plan.macros[plan.macros.length - 1]!.fn}(conn, params)`);
      for (const p of plan.post) {
        if (p.kind === "vacuum") {
          w.line('conn.execute("VACUUM")');
          if (p.analyze) w.line('conn.execute("PRAGMA optimize")');
        } else {
          w.line('conn.execute("VACUUM INTO ?", (f"backup_{datetime.now():%Y%m%d_%H%M%S}.sqlite",))');
        }
      }
      w.line("return 0");
    });
    w.line("except sqlite3.Error as exc:");
    w.line('    print(f"Macro failed, changes rolled back: {exc}", file=sys.stderr)');
    w.line("    return 1");
    w.line("finally:");
    w.line("    conn.close()");
  });
  w.line();
  w.line();
  w.line('if __name__ == "__main__":');
  w.line("    sys.exit(main())");
  return w.toString();
}

function emitPyOp(w: Writer, op: Op, mp: MacroPlan) {
  const cond = op.condition ? translateCondition(op.condition, "python") : undefined;
  w.line(`# Step ${op.step}: ${op.action}${op.condition ? ` [If ${op.condition.replace(/\n/g, " ")}]` : ""}`);
  if (op.condition && cond === null) {
    w.line(`# Condition could not be translated; step skipped: ${op.condition}`);
    return;
  }
  const body = () => {
    switch (op.kind) {
      case "comment": w.line(`# ${String(op.text).replace(/\n/g, " ")}`); w.line("pass"); break;
      case "print": w.line(`print(${pyStr(op.text || "")})`); break;
      case "setvar": w.line(`${identFor("python", op.varName!)} = ${typeof op.varValue === "number" ? op.varValue : pyStr(String(op.varValue))}`); break;
      case "stop": w.line("return True"); break;
      case "call": w.line(`if ${fnNameFor("python", op.macroName!)}(conn, params):`); w.line("    return True"); break;
      case "sql": {
        const args = op.binds!.length ? `, (${op.binds!.map((b) => bindExpr("python", b)).join(", ")},)` : "";
        const sqlLit = pyStr(op.sql!);
        if (op.returnsRows) {
          w.line(`rows = conn.execute(${sqlLit}${args}).fetchall()`);
          w.line("print_rows(rows)");
        } else if (mp.vars.has("lastRowsAffected") && op.capturesRowCount) {
          w.line(`last_rows_affected = conn.execute(${sqlLit}${args}).rowcount`);
        } else {
          w.line(`conn.execute(${sqlLit}${args})`);
        }
      }
    }
  };
  const guarded = () => {
    if (op.cont && op.kind === "sql") {
      w.line("try:");
      w.indent(); body(); w.dedent();
      w.line("except sqlite3.Error as exc:");
      w.line(`    print(f"Step ${op.step} failed (continuing): {exc}", file=sys.stderr)`);
    } else body();
  };
  if (cond) {
    w.line(`if ${cond}:`);
    w.indent(); guarded(); w.dedent();
  } else guarded();
}

// ---- Bun ----------------------------------------------------------------------------------------

function emitBun(plan: Plan, root: MacroDefinition, kind: string, ctx: CodegenContext): string {
  const w = new Writer("  ");
  w.line("#!/usr/bin/env bun");
  header(kind, root.name, ctx, "//", plan.warnings).forEach((l) => w.line(l));
  w.line('import { Database } from "bun:sqlite";');
  w.line('import { parseArgs } from "node:util";');
  w.line();
  w.line("type Params = Record<string, string>;");
  w.line();
  w.block("function connect(path: string): Database {", () => {
    w.line("// strict: bind parameters without prefixes; WAL + foreign keys are the recommended defaults");
    w.line("const db = new Database(path, { create: true, strict: true });");
    w.line('db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");');
    w.line("return db;");
  }, "}");

  for (const mp of plan.macros) {
    w.line();
    w.line(`/** Macro '${mp.macro.name.replace(/\*\//g, "")}'. Returns true if a StopMacro step halted it. */`);
    w.block(`export function ${mp.fn}(db: Database, params: Params): boolean {`, () => {
      for (const [name, t] of mp.vars) w.line(`let ${identFor("bun", name)} = ${jsDefault(t)};`);
      for (const op of mp.ops) emitBunOp(w, op, mp);
      w.line("return false;");
    }, "}");
  }

  w.line();
  w.block("function main(): number {", () => {
    w.block("const { values } = parseArgs({", () => {
      w.line("options: {");
      w.line('  db: { type: "string", default: process.env.DB_PATH ?? "app.db" },');
      for (const name of plan.params) w.line(`  ${JSON.stringify(identFor("bun", name))}: { type: "string" },`);
      w.line("},");
    }, "});");
    for (const name of plan.params) {
      const id = identFor("bun", name);
      w.line(`if (values.${id} === undefined) { console.error("Missing --${id}: ${name.replace(/"/g, "'")}"); return 2; }`);
    }
    w.line(`const params: Params = { ${plan.params.map((n) => `${identFor("bun", n)}: values.${identFor("bun", n)} as string`).join(", ")} };`);
    w.line("const db = connect(values.db as string);");
    w.block("try {", () => {
      w.line("// db.transaction() commits on success and rolls back if the callback throws");
      w.line(`db.transaction(() => { ${plan.macros[plan.macros.length - 1]!.fn}(db, params); })();`);
      for (const p of plan.post) {
        if (p.kind === "vacuum") { w.line('db.exec("VACUUM");'); if (p.analyze) w.line('db.exec("PRAGMA optimize");'); }
        else w.line('db.run("VACUUM INTO ?", [`backup_${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`]);');
      }
      w.line("return 0;");
    });
    w.line("} catch (err) {");
    w.line('  console.error("Macro failed, changes rolled back:", err instanceof Error ? err.message : err);');
    w.line("  return 1;");
    w.line("} finally {");
    w.line("  db.close();");
    w.line("}");
  }, "}");
  w.line();
  w.line("if (import.meta.main) process.exit(main());");
  return w.toString();
}

function emitBunOp(w: Writer, op: Op, mp: MacroPlan) {
  const cond = op.condition ? translateCondition(op.condition, "bun") : undefined;
  w.line(`// Step ${op.step}: ${op.action}${op.condition ? ` [If ${op.condition.replace(/\n/g, " ")}]` : ""}`);
  if (op.condition && cond === null) {
    w.line(`// Condition could not be translated; step skipped: ${op.condition}`);
    return;
  }
  const body = () => {
    switch (op.kind) {
      case "comment": w.line(`// ${String(op.text).replace(/\n/g, " ")}`); break;
      case "print": w.line(`console.log(${jsStr(op.text || "")});`); break;
      case "setvar": w.line(`${identFor("bun", op.varName!)} = ${typeof op.varValue === "number" ? op.varValue : jsStr(String(op.varValue))};`); break;
      case "stop": w.line("return true;"); break;
      case "call": w.line(`if (${fnNameFor("bun", op.macroName!)}(db, params)) return true;`); break;
      case "sql": {
        const binds = op.binds!.map((b) => bindExpr("bun", b));
        const sqlLit = jsStr(op.sql!);
        if (op.returnsRows) {
          w.line(`console.table(db.query(${sqlLit}).all(${binds.join(", ")}));`);
        } else if (mp.vars.has("lastRowsAffected") && op.capturesRowCount) {
          w.line(`lastRowsAffected = db.run(${sqlLit}${binds.length ? `, [${binds.join(", ")}]` : ""}).changes;`);
        } else {
          w.line(`db.run(${sqlLit}${binds.length ? `, [${binds.join(", ")}]` : ""});`);
        }
      }
    }
  };
  const guarded = () => {
    if (op.cont && op.kind === "sql") {
      w.line("try {");
      w.indent(); body(); w.dedent();
      w.line("} catch (err) {");
      w.line(`  console.error("Step ${op.step} failed (continuing):", err instanceof Error ? err.message : err);`);
      w.line("}");
    } else body();
  };
  if (cond) {
    w.line(`if (${cond}) {`);
    w.indent(); guarded(); w.dedent();
    w.line("}");
  } else guarded();
}

// ---- V ------------------------------------------------------------------------------------------

function emitV(plan: Plan, root: MacroDefinition, kind: string, ctx: CodegenContext): string {
  const w = new Writer("\t");
  header(kind, root.name, ctx, "//", plan.warnings).forEach((l) => w.line(l));
  w.line("// Note: V's db.sqlite binds every parameter as TEXT; numbers and NULLs are inlined, user text is bound.");
  w.line("module main");
  w.line();
  w.line("import db.sqlite");
  w.line("import flag");
  w.line("import os");
  if (plan.post.some((p) => p.kind === "backup")) w.line("import time");
  w.line();
  if (plan.macros.some((m) => m.ops.some((o) => o.returnsRows && !o.binds!.length))) {
    w.block("fn print_rows(rows []map[string]string) {", () => {
      w.line("for row in rows {");
      w.line("\tprintln(row)");
      w.line("}");
    }, "}");
  }

  for (const mp of plan.macros) {
    w.line();
    w.line(`// Macro '${mp.macro.name.replace(/\n/g, " ")}'. Returns true if a StopMacro step halted it.`);
    w.block(`fn ${mp.fn}(mut db sqlite.DB, params map[string]string) !bool {`, () => {
      const usesParams = mp.ops.some((o) => o.binds?.some((b) => b.kind === "param")) || mp.ops.some((o) => o.kind === "call");
      if (!usesParams) w.line("_ = params");
      for (const [name, t] of mp.vars) {
        const id = identFor("vlang", name);
        const used = mp.ops.some((o) => o.condition?.includes(`[${name}]`));
        w.line(`mut ${id} := ${vDefault(t)}`);
        if (!used) w.line(`_ = ${id}`);
      }
      for (const op of mp.ops) emitVOp(w, op, mp);
      w.line("return false");
    }, "}");
  }

  w.line();
  w.block("fn main() {", () => {
    w.line("mut fp := flag.new_flag_parser(os.args)");
    w.line(`fp.application(${vStr(snake(root.name))})`);
    w.line(`fp.description(${vStr(`Run macro "${root.name}"`)})`);
    w.line("fp.skip_executable()");
    w.line(`db_path := fp.string('db', 0, os.getenv_opt('DB_PATH') or { 'app.db' }, 'SQLite database file')`);
    for (const name of plan.params) w.line(`${identFor("vlang", name)} := fp.string('${identFor("vlang", name)}', 0, '', ${vStr(name)})`);
    w.line("fp.finalize() or {");
    w.line("\teprintln(err)");
    w.line("\texit(2)");
    w.line("}");
    for (const name of plan.params) {
      const id = identFor("vlang", name);
      w.line(`if ${id} == '' {`);
      w.line(`\teprintln('Missing --${id}: ${name.replace(/'/g, "")}')`);
      w.line("\texit(2)");
      w.line("}");
    }
    if (!plan.params.length) w.line("params := map[string]string{}");
    else w.line(`params := {${plan.params.map((n) => `'${identFor("vlang", n)}': ${identFor("vlang", n)}`).join(", ")}}`);
    w.line();
    w.line("mut db := sqlite.connect(db_path) or {");
    w.line("\teprintln('cannot open database: ${err}')");
    w.line("\texit(1)");
    w.line("}");
    w.line("defer {");
    w.line("\tdb.close() or {}");
    w.line("}");
    w.line("db.exec('PRAGMA foreign_keys = ON') or { panic(err) }");
    w.line();
    w.line("// one transaction: commit on success, roll back on any error");
    w.line("db.begin() or { panic(err) }");
    w.line(`${plan.macros[plan.macros.length - 1]!.fn}(mut db, params) or {`);
    w.line("\teprintln('Macro failed, changes rolled back: ${err}')");
    w.line("\tdb.rollback() or {}");
    w.line("\texit(1)");
    w.line("}");
    w.line("db.commit() or { panic(err) }");
    for (const p of plan.post) {
      if (p.kind === "vacuum") {
        w.line("db.exec('VACUUM') or { eprintln(err) }");
        if (p.analyze) w.line("db.exec('PRAGMA optimize') or { eprintln(err) }");
      } else {
        w.line("db.exec_param_many('VACUUM INTO ?', ['backup_${time.now().custom_format(\\'YYYYMMDD_HHmmss\\')}.sqlite']) or { eprintln(err) }");
      }
    }
  }, "}");
  return w.toString();
}

function emitVOp(w: Writer, op: Op, mp: MacroPlan) {
  const cond = op.condition ? translateCondition(op.condition, "vlang") : undefined;
  w.line(`// Step ${op.step}: ${op.action}${op.condition ? ` [If ${op.condition.replace(/\n/g, " ")}]` : ""}`);
  if (op.condition && cond === null) {
    w.line(`// Condition could not be translated; step skipped: ${op.condition}`);
    return;
  }
  const tail = op.cont ? " or {" : "!";
  const orBody = () => {
    // `or` block: report the failure, then yield an empty result of the expected type
    w.indent();
    w.line(`eprintln('Step ${op.step} failed (continuing): \${err}')`);
    w.line(op.returnsRows ? "[]map[string]string{}" : "[]sqlite.Row{}");
    w.dedent();
    w.line("}");
  };
  const body = () => {
    switch (op.kind) {
      case "comment": w.line(`// ${String(op.text).replace(/\n/g, " ")}`); break;
      case "print": w.line(`println(${vStr(op.text || "")})`); break;
      case "setvar": w.line(`${identFor("vlang", op.varName!)} = ${typeof op.varValue === "number" ? op.varValue : vStr(String(op.varValue))}`); break;
      case "stop": w.line("return true"); break;
      case "call": w.line(`if ${fnNameFor("vlang", op.macroName!)}(mut db, params)! {`); w.line("\treturn true"); w.line("}"); break;
      case "sql": {
        const { sql, binds } = prepareVBinds(op);
        const sqlLit = vStr(sql);
        if (op.returnsRows && binds.length === 0) {
          if (op.cont) {
            w.line(`rows_${op.step} := db.exec_map(${sqlLit})${tail}`);
            orBody();
            w.line(`print_rows(rows_${op.step})`);
          } else w.line(`print_rows(db.exec_map(${sqlLit})!)`);
        } else if (op.returnsRows) {
          const call = `db.exec_param_many(${sqlLit}, [${binds.join(", ")}])`;
          if (op.cont) {
            w.line(`rows_${op.step} := ${call}${tail}`);
            orBody();
            w.line(`for row in rows_${op.step} {`);
          } else w.line(`for row in ${call}! {`);
          w.line("\tprintln(row.vals)");
          w.line("}");
        } else {
          const call = binds.length ? `db.exec_param_many(${sqlLit}, [${binds.join(", ")}])` : `db.exec(${sqlLit})`;
          if (op.cont) {
            w.line(`${call}${tail}`);
            orBody();
          } else w.line(`${call}!`);
          if (mp.vars.has("lastRowsAffected") && op.capturesRowCount) w.line("last_rows_affected = db.get_affected_rows_count()");
        }
      }
    }
  };
  if (cond) {
    w.line(`if ${cond} {`);
    w.indent(); body(); w.dedent();
    w.line("}");
  } else body();
}

// ---- Bun.sql (Native Postgres / MySQL / SQLite driver) -------------------------------------------

function emitBunSql(plan: Plan, root: MacroDefinition, kind: string, ctx: CodegenContext): string {
  const w = new Writer("  ");
  w.line("#!/usr/bin/env bun");
  w.line(`// Generated by ${ctx.appName || "Studio Pro"} from ${kind} "${root.name}"`);
  w.line(`// Source SQL dialect: ${ctx.sourceDialect} (native Bun.sql client)`);
  w.line("// Review before production use: user input is always bound as parameters.");
  w.line('import { SQL } from "bun";');
  w.line('import { parseArgs } from "node:util";');
  w.line();
  w.line("type Params = Record<string, string>;");

  const defaultUrl =
    ctx.sourceDialect === "postgres"
      ? "postgres://postgres:postgres@127.0.0.1:5432/postgres"
      : ctx.sourceDialect === "mysql"
      ? "mysql://root@127.0.0.1:3306/mysql"
      : "sqlite://app.db";

  for (const mp of plan.macros) {
    w.line();
    w.line(`/** Macro '${mp.macro.name.replace(/\*\//g, "")}'. Returns true if a StopMacro step halted it. */`);
    w.block(`export async function ${mp.fn}(db: SQL, params: Params): Promise<boolean> {`, () => {
      for (const [name, t] of mp.vars) w.line(`let ${identFor("bun-sql", name)} = ${jsDefault(t)};`);
      for (const op of mp.ops) {
        const cond = op.condition ? translateCondition(op.condition, "bun-sql") : undefined;
        w.line(`// Step ${op.step}: ${op.action}${op.condition ? ` [If ${op.condition.replace(/\n/g, " ")}]` : ""}`);
        if (op.condition && cond === null) {
          w.line(`// Condition could not be translated; step skipped: ${op.condition}`);
          continue;
        }
        const body = () => {
          switch (op.kind) {
            case "comment": w.line(`// ${String(op.text).replace(/\n/g, " ")}`); break;
            case "print": w.line(`console.log(${jsStr(op.text || "")});`); break;
            case "setvar": w.line(`${identFor("bun-sql", op.varName!)} = ${typeof op.varValue === "number" ? op.varValue : jsStr(String(op.varValue))};`); break;
            case "stop": w.line("return true;"); break;
            case "call": w.line(`if (await ${fnNameFor("bun-sql", op.macroName!)}(db, params)) return true;`); break;
            case "sql": {
              const binds = op.binds!.map((b) => bindExpr("bun-sql", b));
              const sqlLit = jsStr(op.sql!);
              const call = binds.length ? `await db.unsafe(${sqlLit}, [${binds.join(", ")}])` : `await db.unsafe(${sqlLit})`;
              if (op.returnsRows) {
                w.line(`console.table(${call});`);
              } else if (mp.vars.has("lastRowsAffected") && op.capturesRowCount) {
                w.line(`const res_${op.step} = ${call};`);
                w.line(`lastRowsAffected = Number((res_${op.step} as any)?.count ?? (res_${op.step} as any)?.affectedRows ?? 0);`);
              } else {
                w.line(`${call};`);
              }
            }
          }
        };
        if (cond) {
          w.line(`if (${cond}) {`);
          w.indent(); body(); w.dedent();
          w.line("}");
        } else body();
      }
      w.line("return false;");
    }, "}");
  }

  w.line();
  w.block("async function main(): Promise<number> {", () => {
    w.block("const { values } = parseArgs({", () => {
      w.line("options: {");
      w.line(`  url: { type: "string", default: process.env.DATABASE_URL ?? ${jsStr(defaultUrl)} },`);
      for (const name of plan.params) w.line(`  ${JSON.stringify(identFor("bun-sql", name))}: { type: "string" },`);
      w.line("},");
    }, "});");
    for (const name of plan.params) {
      const id = identFor("bun-sql", name);
      w.line(`if (values.${id} === undefined) { console.error("Missing --${id}: ${name.replace(/"/g, "'")}"); return 2; }`);
    }
    w.line(`const params: Params = { ${plan.params.map((n) => `${identFor("bun-sql", n)}: values.${identFor("bun-sql", n)} as string`).join(", ")} };`);
    w.line("const db = new SQL(values.url as string);");
    w.block("try {", () => {
      w.line(`await db.begin(async (tx) => { await ${plan.macros[plan.macros.length - 1]!.fn}(tx as unknown as SQL, params); });`);
      w.line("return 0;");
    });
    w.line("} catch (err) {");
    w.line('  console.error("Execution failed, changes rolled back:", err instanceof Error ? err.message : err);');
    w.line("  return 1;");
    w.line("} finally {");
    w.line("  await db.close();");
    w.line("}");
  }, "}");
  w.line();
  w.line("if (import.meta.main) process.exit(await main());");
  return w.toString();
}

// ---- TypeScript (Row Interfaces + Typed Query Helper) --------------------------------------------

function mapSqlTypeToTs(sqlType: string): string {
  const t = sqlType.toUpperCase();
  if (/INT|SERIAL|DEC|NUM|FLOAT|DOUBLE|REAL|MONEY/.test(t)) return "number";
  if (/BOOL|BIT/.test(t)) return "boolean";
  if (/JSON/.test(t)) return "Record<string, unknown> | unknown[]";
  if (/BLOB|BYTEA|BINARY/.test(t)) return "Uint8Array";
  return "string";
}

function inferTypeScriptInterfaces(plan: Plan, rootName: string): { name: string; fields: { col: string; tsType: string; nullable: boolean }[] }[] {
  const out: { name: string; fields: { col: string; tsType: string; nullable: boolean }[] }[] = [];
  const seen = new Set<string>();
  const toPascal = (s: string) => {
    const c = camel(s);
    return c[0]!.toUpperCase() + c.slice(1);
  };

  for (const mp of plan.macros) {
    for (const op of mp.ops) {
      if (op.kind !== "sql" || !op.sql) continue;
      const createMatch = op.sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?([A-Za-z0-9_]+)["`]?\s*\(([\s\S]+)\)$/i);
      if (createMatch) {
        const tblName = createMatch[1]!;
        const ifaceName = `${toPascal(tblName)}Row`;
        if (seen.has(ifaceName)) continue;
        seen.add(ifaceName);
        const body = createMatch[2]!;
        const fields: { col: string; tsType: string; nullable: boolean }[] = [];
        for (const rawPart of body.split(",")) {
          const part = rawPart.trim();
          if (!part || /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(part)) continue;
          const m = part.match(/^["`]?([A-Za-z0-9_]+)["`]?\s+([A-Za-z0-9_()]+)/);
          if (m) {
            const col = m[1]!;
            const colType = m[2]!;
            const notNull = /\bNOT\s+NULL\b|\bPRIMARY\s+KEY\b/i.test(part);
            fields.push({ col, tsType: mapSqlTypeToTs(colType), nullable: !notNull });
          }
        }
        if (fields.length > 0) out.push({ name: ifaceName, fields });
      }
    }
  }

  if (out.length === 0) {
    out.push({
      name: `${toPascal(rootName)}Row`,
      fields: [{ col: "[column: string]", tsType: "unknown", nullable: false }],
    });
  }
  return out;
}

function emitTypeScript(plan: Plan, root: MacroDefinition, kind: string, ctx: CodegenContext): string {
  const w = new Writer("  ");
  header(kind, root.name, ctx, "//", plan.warnings).forEach((l) => w.line(l));
  w.line('import { Database } from "bun:sqlite";');
  w.line();

  const interfaces = inferTypeScriptInterfaces(plan, root.name);
  for (const iface of interfaces) {
    w.block(`export interface ${iface.name} {`, () => {
      for (const f of iface.fields) {
        if (f.col.startsWith("[")) w.line(`${f.col}: ${f.tsType};`);
        else w.line(`${JSON.stringify(f.col)}: ${f.tsType}${f.nullable ? " | null" : ""};`);
      }
    }, "}");
    w.line();
  }

  w.block("export interface QueryParams {", () => {
    if (plan.params.length === 0) {
      w.line("[key: string]: string | number | boolean | null;");
    } else {
      for (const name of plan.params) {
        w.line(`${identFor("typescript", name)}: string | number;`);
      }
    }
  }, "}");
  w.line();

  const primaryIface = interfaces[0]!.name;
  const rootPlan = plan.macros[plan.macros.length - 1]!;
  w.block(`export function ${rootPlan.fn}(db: Database, params: QueryParams = {} as QueryParams): ${primaryIface}[] {`, () => {
    w.line(`const results: ${primaryIface}[] = [];`);
    for (const op of rootPlan.ops) {
      if (op.kind !== "sql" || !op.sql) continue;
      const binds = (op.binds || []).map((b) => bindExpr("typescript", b));
      const sqlLit = jsStr(op.sql);
      if (op.returnsRows) {
        w.line(`results.push(...(db.query(${sqlLit}).all(${binds.join(", ")}) as ${primaryIface}[]));`);
      } else {
        w.line(`db.run(${sqlLit}${binds.length ? `, [${binds.join(", ")}]` : ""});`);
      }
    }
    w.line("return results;");
  }, "}");

  return w.toString();
}

// -------------------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------------------

function finish(target: CodegenTarget, plan: Plan, root: MacroDefinition, kind: string, ctx: CodegenContext): CodegenResult {
  const code =
    target === "python"
      ? emitPython(plan, root, kind, ctx)
      : target === "bun"
      ? emitBun(plan, root, kind, ctx)
      : target === "bun-sql"
      ? emitBunSql(plan, root, kind, ctx)
      : target === "typescript"
      ? emitTypeScript(plan, root, kind, ctx)
      : emitV(plan, root, kind, ctx);
  const ext = CODEGEN_TARGETS[target].ext;
  const file = `${snake(root.name)}.${ext}`;
  const args = plan.params.map((n) => ` --${identFor(target, n).replace(/_/g, "-")} <value>`).join("");
  const runHint =
    target === "python" ? `python3 ${file} --db app.db${args}`
    : target === "bun" ? `bun run ${file} --db app.db${plan.params.map((n) => ` --${identFor(target, n)} <value>`).join("")}`
    : target === "bun-sql" ? `bun run ${file} --url $DATABASE_URL${plan.params.map((n) => ` --${identFor(target, n)} <value>`).join("")}`
    : target === "typescript" ? `bun test / import { ${plan.macros[plan.macros.length - 1]!.fn} } from "./${file}"`
    : `v run ${file} --db app.db${plan.params.map((n) => ` --${identFor(target, n)} <value>`).join("")}`;
  return { target, language: CODEGEN_TARGETS[target].label, filename: file, runHint, code, warnings: plan.warnings };
}

export function generateMacroCode(macro: MacroDefinition, target: CodegenTarget, ctx: CodegenContext): CodegenResult {
  if (!CODEGEN_TARGETS[target]) throw new Error(`Unknown target '${target}' (use python, bun or vlang)`);
  const plan = buildPlan(macro, ctx, target);
  return finish(target, plan, macro, "macro", ctx);
}

/** One query or a whole SQL script (statements run in order, SELECT results are printed). */
export function generateSqlCode(sql: string, target: CodegenTarget, ctx: CodegenContext, name = "query"): CodegenResult {
  if (!CODEGEN_TARGETS[target]) throw new Error(`Unknown target '${target}' (use python, bun or vlang)`);
  const statements = splitSqlStatements(sql);
  if (!statements.length) throw new Error("No SQL to translate");
  const macro: MacroDefinition = {
    id: "codegen_sql",
    name,
    description: "",
    actions: statements.map((s, i) => ({ id: `s${i + 1}`, action: "RunSQL", enabled: true, parameters: { sql: s } })),
  };
  const plan = buildPlan(macro, { ...ctx, macros: [] }, target);
  return finish(target, plan, macro, "SQL", ctx);
}

export interface CodegenRequest {
  kind?: "macro" | "sql";
  target?: CodegenTarget;
  macro?: MacroDefinition;
  id?: string;
  sql?: string;
  name?: string;
}

/** Shared request handler used by every studio server's /api/codegen route. */
export function handleCodegenRequest(body: CodegenRequest, ctx: CodegenContext): CodegenResult {
  const target = (body.target || "python") as CodegenTarget;
  if ((body.kind || "macro") === "sql") {
    const saved = body.id ? (ctx.queries || []).find((q) => q.id === body.id || q.name === body.id) : undefined;
    return generateSqlCode(body.sql ?? saved?.sql ?? "", target, ctx, body.name || saved?.name || "query");
  }
  const macro = body.macro || (ctx.macros || []).find((m) => m.id === body.id || m.name === body.id);
  if (!macro) throw new Error("Macro not found");
  return generateMacroCode(macro, target, ctx);
}
