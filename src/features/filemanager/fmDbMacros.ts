/**
 * Bun JavaScript & Visual Macro Engine for the File Manager Databases tool.
 *
 * Brings Microsoft Access-style macro automation (`CurrentDb`, `DoCmd`, `DLookup`/`DCount`/`DSum`,
 * `TempVars`, `MsgBox`, `Debug.Print`, visual action rows, and "Convert Macro to Bun JS / VBA")
 * to the Bun JavaScript runtime across SQLite, MySQL, PostgreSQL, Redis, local SQLite files,
 * and an in-memory scratch database.
 *
 * Passwords are resolved on the server from the OS keychain and redacted from all logs,
 * results, and error messages.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { RedisClient } from "bun";
import { createAdapter } from "../../db";
import { DbError, redact } from "../../db/errors";
import { placeholder, quoteIdent, quoteRef } from "../../db/quote";
import type { ConnectionConfig, DbAdapter, Engine, ObjectRef, Param, WireValue } from "../../db/types";
import type { FmContext, FmHandler } from "./fmCore";
import { effectiveFor, isObject, profileFor, testInputFor } from "./fmDbCommon";
import type { CloneRedisClient } from "./fmDbHooks";
import { ENGINES, isEngine, type DbEngine } from "./fmDbModel";
import { checkSqlitePath, dbState } from "./fmDbState";
import type { DbProfile } from "./fmDbStore";
import { TEST_TIMEOUT_MS, type TestInput } from "./fmDbTest";
import { FmError, cleanName } from "./fmPaths";

export type DbMacroMode = "code" | "actions";
export type DbMacroEngineFilter = "any" | DbEngine;

export type DbMacroActionType =
  | "RunSQL"
  | "OpenQuery"
  | "OpenTable"
  | "InsertRecord"
  | "UpdateRecord"
  | "DeleteRecord"
  | "MakeTable"
  | "EmptyTable"
  | "SetTempVar"
  | "RemoveTempVar"
  | "MessageBox"
  | "Beep"
  | "RunCode"
  | "RunMacro"
  | "Assert"
  | "StopMacro"
  | "Comment";

export interface DbMacroActionRow {
  id: string;
  action: DbMacroActionType;
  params: Record<string, string>;
  condition?: string;
  comment?: string;
  enabled: boolean;
}

export interface DbMacro {
  id: string;
  name: string;
  description: string;
  mode: DbMacroMode;
  engine: DbMacroEngineFilter;
  code: string;
  actions: DbMacroActionRow[];
  transaction: boolean;
  timeoutMs: number;
  defaultParams: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  builtin?: boolean;
}

export interface DbMacroCatalogEntry {
  action: DbMacroActionType;
  category: "Data" | "Queries & Tables" | "Variables & Flow" | "Bun Runtime" | "UI & Alerts";
  label: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; required?: boolean; multiline?: boolean }[];
}

export interface DbMacroTargetSpec {
  kind: "profile" | "sqliteFile" | "memory";
  profileId?: string;
  path?: string;
}

export interface DbMacroLogEntry {
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  elapsedMs: number;
}

export interface DbMacroMessageBox {
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
}

export interface DbMacroResultSet {
  label: string;
  sql?: string;
  columns: string[];
  rows: Record<string, WireValue>[];
  rowCount: number;
  truncated?: boolean;
}

export interface DbMacroStepResult {
  index: number;
  action: string;
  status: "ok" | "skipped" | "stopped" | "error";
  detail: string;
  affectedRows?: number;
  rowCount?: number;
  elapsedMs: number;
}

export interface DbMacroRunResult {
  ok: boolean;
  status: "completed" | "stopped" | "rolled_back" | "failed";
  macroName: string;
  mode: DbMacroMode;
  target: {
    kind: "profile" | "sqliteFile" | "memory";
    engine: DbEngine;
    engineLabel: string;
    label: string;
    production: boolean;
    readOnly: boolean;
  };
  transaction: boolean;
  dryRun: boolean;
  committed: boolean;
  rolledBack: boolean;
  affectedRows: number;
  elapsedMs: number;
  returnValue: unknown;
  logs: DbMacroLogEntry[];
  messages: DbMacroMessageBox[];
  beeps: number;
  steps: DbMacroStepResult[];
  resultSets: DbMacroResultSet[];
  tempVars: Record<string, unknown>;
  promptsRequired?: string[];
  error?: {
    message: string;
    line?: number;
    column?: number;
  };
}

const MACRO_FILE = "file_manager_db_macros.json";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_MACRO_DEPTH = 8;
const MAX_RESULT_ROWS = 250;
const MAX_LOG_ENTRIES = 200;

export const FM_MACRO_ACTION_CATALOG: DbMacroCatalogEntry[] = [
  {
    action: "RunSQL",
    category: "Data",
    label: "RunSQL",
    description: "Execute an INSERT, UPDATE, DELETE, or DDL SQL statement.",
    fields: [{ key: "sql", label: "SQL Statement", placeholder: "UPDATE customers SET tier = 'VIP' WHERE points >= 100", required: true, multiline: true }],
  },
  {
    action: "OpenQuery",
    category: "Queries & Tables",
    label: "OpenQuery",
    description: "Run a SELECT query and display its rows in the macro results pane.",
    fields: [
      { key: "sql", label: "SELECT Query", placeholder: "SELECT id, name, email, points FROM customers ORDER BY points DESC", required: true, multiline: true },
      { key: "label", label: "Result Label", placeholder: "Top Customers" },
    ],
  },
  {
    action: "OpenTable",
    category: "Queries & Tables",
    label: "OpenTable",
    description: "Open a table with optional filter and sort order.",
    fields: [
      { key: "table", label: "Table Name", placeholder: "customers", required: true },
      { key: "where", label: "WHERE Filter", placeholder: "active = 1" },
      { key: "orderBy", label: "ORDER BY", placeholder: "id DESC" },
      { key: "limit", label: "Row Limit", placeholder: "100" },
    ],
  },
  {
    action: "InsertRecord",
    category: "Data",
    label: "InsertRecord",
    description: "Insert a new record into a table from a JSON object.",
    fields: [
      { key: "table", label: "Table Name", placeholder: "audit_logs", required: true },
      { key: "values", label: "Row Values (JSON)", placeholder: "{\"event\": \"macro_run\", \"detail\": \"Checked records\"}", required: true, multiline: true },
    ],
  },
  {
    action: "UpdateRecord",
    category: "Data",
    label: "UpdateRecord",
    description: "Update matching records in a table using a JSON object and WHERE condition.",
    fields: [
      { key: "table", label: "Table Name", placeholder: "customers", required: true },
      { key: "values", label: "New Values (JSON)", placeholder: "{\"tier\": \"gold\"}", required: true },
      { key: "where", label: "WHERE Filter", placeholder: "points >= 100" },
    ],
  },
  {
    action: "DeleteRecord",
    category: "Data",
    label: "DeleteRecord",
    description: "Delete matching records from a table.",
    fields: [
      { key: "table", label: "Table Name", placeholder: "audit_logs", required: true },
      { key: "where", label: "WHERE Filter", placeholder: "created_at < '2020-01-01'" },
    ],
  },
  {
    action: "MakeTable",
    category: "Queries & Tables",
    label: "MakeTable",
    description: "Create a new table populated from a SELECT query (Access Make-Table Query).",
    fields: [
      { key: "targetTable", label: "New Table Name", placeholder: "vip_customers_snapshot", required: true },
      { key: "sql", label: "Source SELECT Query", placeholder: "SELECT id, name, email, points FROM customers WHERE points >= 100", required: true, multiline: true },
      { key: "replace", label: "Replace Existing (true/false)", placeholder: "true" },
    ],
  },
  {
    action: "EmptyTable",
    category: "Data",
    label: "EmptyTable",
    description: "Delete all rows from a table.",
    fields: [{ key: "table", label: "Table Name", placeholder: "audit_logs", required: true }],
  },
  {
    action: "RunCode",
    category: "Bun Runtime",
    label: "RunCode (Bun JS)",
    description: "Execute a Bun JavaScript / TypeScript snippet with full access to CurrentDb, DoCmd, TempVars, and DLookup.",
    fields: [
      {
        key: "code",
        label: "Bun JS / TS Code",
        placeholder: "const total = await DCount('*', 'customers');\nTempVars.customerCount = total;\nDebug.print('Customers:', total);",
        required: true,
        multiline: true,
      },
    ],
  },
  {
    action: "SetTempVar",
    category: "Variables & Flow",
    label: "SetTempVar",
    description: "Store a value in TempVars for use in conditions, SQL templates (${TempVars.name}), or Bun JS.",
    fields: [
      { key: "name", label: "Variable Name", placeholder: "minPoints", required: true },
      { key: "expression", label: "Value or Expression", placeholder: "100", required: true },
    ],
  },
  {
    action: "RemoveTempVar",
    category: "Variables & Flow",
    label: "RemoveTempVar",
    description: "Remove a variable from TempVars.",
    fields: [{ key: "name", label: "Variable Name", placeholder: "minPoints", required: true }],
  },
  {
    action: "MessageBox",
    category: "UI & Alerts",
    label: "MessageBox",
    description: "Display a message box in the macro output (supports ${TempVars.name} placeholders).",
    fields: [
      { key: "message", label: "Message", placeholder: "Processed ${TempVars.customerCount} customer records.", required: true },
      { key: "title", label: "Title", placeholder: "Macro Complete" },
      { key: "type", label: "Type (info / warning / error / success)", placeholder: "info" },
    ],
  },
  {
    action: "Beep",
    category: "UI & Alerts",
    label: "Beep",
    description: "Emit an audible/visual beep notification.",
    fields: [],
  },
  {
    action: "RunMacro",
    category: "Variables & Flow",
    label: "RunMacro",
    description: "Invoke another saved macro by name or ID.",
    fields: [{ key: "macroName", label: "Macro Name or ID", placeholder: "Table Row Counter (Bun JS)", required: true }],
  },
  {
    action: "Assert",
    category: "Variables & Flow",
    label: "Assert",
    description: "Verify a condition; abort the macro if it evaluates to false.",
    fields: [
      { key: "expression", label: "Condition Expression", placeholder: "Number(TempVars.customerCount) > 0", required: true },
      { key: "message", label: "Failure Message", placeholder: "Expected at least one customer row." },
    ],
  },
  {
    action: "StopMacro",
    category: "Variables & Flow",
    label: "StopMacro",
    description: "Halt macro execution cleanly at this step.",
    fields: [{ key: "reason", label: "Stop Reason", placeholder: "Completed early." }],
  },
  {
    action: "Comment",
    category: "Variables & Flow",
    label: "Comment",
    description: "Documentation note inside the macro (no runtime side effect).",
    fields: [{ key: "text", label: "Comment", placeholder: "Step note..." }],
  },
];

function defaultBuiltinMacros(): DbMacro[] {
  const now = "2025-01-01T00:00:00.000Z";
  return [
    {
      id: "macro-table-inventory",
      name: "Table Row Counter (Bun JS)",
      description: "Inspects all tables in the active database using CurrentDb and DCount, logs counts via Debug.print, and returns a summary table.",
      mode: "code",
      engine: "any",
      transaction: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      defaultParams: {},
      createdAt: now,
      updatedAt: now,
      builtin: true,
      actions: [],
      code: `// Microsoft Access VBA style macro running on the Bun JS runtime
const tables = await CurrentDb.tables();
const summary = [];

for (const t of tables) {
  const rows = await DCount("*", t.name);
  summary.push({
    table_name: t.name,
    kind: t.kind,
    row_count: rows,
  });
  Debug.print(\`\${t.name}: \${rows} row(s)\`);
}

TempVars.tableCount = summary.length;
MsgBox(\`Inspected \${summary.length} table(s) on \${CurrentDb.name}.\`, "Table Inventory", "info");
return summary;`,
    },
    {
      id: "macro-access-recordset-audit",
      name: "Customer Order Audit (Access VBA style)",
      description: "Uses CurrentDb.OpenRecordset, DLookup, DSum, DoCmd, and TempVars just like Microsoft Access VBA modules.",
      mode: "code",
      engine: "any",
      transaction: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      defaultParams: { minPoints: "100" },
      createdAt: now,
      updatedAt: now,
      builtin: true,
      actions: [],
      code: `// Access-style Recordset + Domain Aggregate Functions in Bun JS
const cutoff = Number(params.minPoints ?? 100);
await DoCmd.SetTempVar("cutoff", cutoff);

const totalCustomers = await DCount("*", "customers");
const vipCount = await DCount("*", "customers", \`points >= \${cutoff}\`);
const totalRevenue = await DSum("total_cents", "orders", "status = 'paid'");
const topCustomer = await DLookup("name", "customers", \`points >= \${cutoff}\`);

Debug.print(\`Total customers: \${totalCustomers}, VIPs (>=\${cutoff} pts): \${vipCount}\`);
Debug.print(\`Paid revenue (cents): \${totalRevenue}, Lead VIP: \${topCustomer ?? "none"}\`);

// Iterate with an Access-style Recordset
const rs = await CurrentDb.OpenRecordset("SELECT id, name, email, tier, points FROM customers ORDER BY points DESC");
const promoted = [];
while (!rs.EOF) {
  const pts = Number(rs.Fields("points"));
  const name = String(rs.Fields("name"));
  if (pts >= cutoff) {
    promoted.push({ id: rs.Fields("id"), name, points: pts, badge: "VIP" });
  }
  rs.MoveNext();
}
rs.Close();

await DoCmd.OpenQuery(
  "SELECT c.id, c.name, c.tier, c.points, COUNT(o.id) AS order_count, COALESCE(SUM(o.total_cents), 0) AS spent_cents FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id, c.name, c.tier, c.points ORDER BY spent_cents DESC",
  "Customer Spend Summary"
);

MsgBox(\`Found \${vipCount} VIP customer(s). Total paid order volume: $\${(totalRevenue / 100).toFixed(2)}\`, "Customer Audit", "success");
return { totalCustomers, vipCount, totalRevenue, topCustomer, promoted };`,
    },
    {
      id: "macro-safe-batch-update",
      name: "Loyalty Tier Promotion (Transactional)",
      description: "Promotes high-point customers to VIP inside an atomic database transaction and writes an audit log entry.",
      mode: "code",
      engine: "any",
      transaction: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      defaultParams: { minPoints: "120", newTier: "VIP" },
      createdAt: now,
      updatedAt: now,
      builtin: true,
      actions: [],
      code: `// Transactional data macro — combine with Dry Run to preview changes safely!
const minPoints = Number(params.minPoints ?? 120);
const newTier = String(params.newTier ?? "VIP");

const updated = await db.update(
  "customers",
  { tier: newTier },
  "points >= ? AND tier != ?",
  [minPoints, newTier]
);

Debug.print(\`Updated \${CurrentDb.RecordsAffected} customer row(s) to tier '\${newTier}'.\`);

await DoCmd.InsertRecord("audit_logs", {
  event: "tier_promotion",
  detail: \`Promoted \${updated} customer(s) with points >= \${minPoints} to \${newTier}\`,
  created_at: new Date().toISOString(),
});

await DoCmd.OpenTable("customers", { orderBy: "points DESC" });
await DoCmd.OpenTable("audit_logs", { orderBy: "id DESC", limit: 10 });

return { promotedCount: updated, newTier, minPoints };`,
    },
    {
      id: "macro-visual-actions-demo",
      name: "Quick VIP Report (Visual DoCmd + RunCode)",
      description: "Visual Microsoft Access-style action table combining SetTempVar, RunCode (Bun JS), OpenQuery, and MessageBox.",
      mode: "actions",
      engine: "any",
      transaction: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      defaultParams: { minPoints: "100" },
      createdAt: now,
      updatedAt: now,
      builtin: true,
      code: "",
      actions: [
        {
          id: "step-1",
          action: "SetTempVar",
          params: { name: "minPoints", expression: "100" },
          comment: "Threshold for VIP customer lookup",
          enabled: true,
        },
        {
          id: "step-2",
          action: "RunCode",
          params: {
            code: "TempVars.vipCount = await DCount('*', 'customers', `points >= ${Number(TempVars.minPoints ?? 100)}`);\nDebug.print('VIP count computed by Bun JS:', TempVars.vipCount);",
          },
          comment: "Compute VIP count via Bun JS DCount",
          enabled: true,
        },
        {
          id: "step-3",
          action: "OpenQuery",
          params: {
            sql: "SELECT id, name, email, tier, points FROM customers WHERE points >= ${TempVars.minPoints} ORDER BY points DESC",
            label: "VIP Customers",
          },
          condition: "Number(TempVars.vipCount) > 0",
          comment: "Display matching VIP customers",
          enabled: true,
        },
        {
          id: "step-4",
          action: "MessageBox",
          params: {
            message: "Found ${TempVars.vipCount} VIP customer(s) with at least ${TempVars.minPoints} points.",
            title: "VIP Report",
            type: "success",
          },
          enabled: true,
        },
      ],
    },
    {
      id: "macro-redis-and-multi-conn",
      name: "Redis Key Inspector & Cache Macro",
      description: "Inspects Redis keys or SQL tables using the Bun runtime and reports key groups or table metrics.",
      mode: "code",
      engine: "any",
      transaction: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      defaultParams: { pattern: "*" },
      createdAt: now,
      updatedAt: now,
      builtin: true,
      actions: [],
      code: `// Works on Redis connections AND SQL connections!
if (db.engine === "redis") {
  const pattern = String(params.pattern || "*");
  const keys = await redis.keys(pattern);
  const rows = [];
  for (const key of keys.slice(0, 50)) {
    const type = await redis.command("TYPE", key);
    const ttl = await redis.ttl(key);
    rows.push({ key, type, ttl });
  }
  Debug.print(\`Scanned \${keys.length} Redis key(s) matching '\${pattern}'.\`);
  return rows;
} else {
  const saved = connections.list();
  Debug.print(\`Active SQL engine: \${db.engine} (\${ saved.length } saved connection(s) available via connections.use()).\`);
  const tables = await db.tables();
  return tables;
}`,
    },
  ];
}

function macroFilePath(ctx: FmContext): string {
  return join(ctx.dataDir, MACRO_FILE);
}

function sanitizeActionRow(raw: unknown, idx: number): DbMacroActionRow {
  const obj = isObject(raw) ? raw : {};
  const validActions = new Set<string>(FM_MACRO_ACTION_CATALOG.map((c) => c.action));
  const action = (typeof obj.action === "string" && validActions.has(obj.action) ? obj.action : "RunSQL") as DbMacroActionType;
  const params: Record<string, string> = {};
  const srcParams = isObject(obj.params) ? obj.params : isObject(obj.parameters) ? obj.parameters : null;
  if (srcParams) {
    for (const [k, v] of Object.entries(srcParams)) {
      if (v !== undefined && v !== null) {
        params[String(k)] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
    }
    if (!params.where && params.whereCondition) params.where = params.whereCondition;
    if (!params.values && params.setValues) params.values = params.setValues;
  }
  return {
    id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : `step-${idx + 1}`,
    action,
    params,
    condition: typeof obj.condition === "string" && obj.condition.trim() ? obj.condition.trim() : undefined,
    comment: typeof obj.comment === "string" && obj.comment.trim() ? obj.comment.trim() : undefined,
    enabled: obj.enabled !== false,
  };
}

function sanitizeMacroInput(raw: unknown, existing?: DbMacro): DbMacro {
  if (!isObject(raw)) throw new FmError("BAD_REQUEST", "Provide a macro definition.");
  const name = cleanName(typeof raw.name === "string" ? raw.name : existing?.name ?? "");
  if (!name) throw new FmError("BAD_REQUEST", "Give the macro a name.");
  if (name.length > 120) throw new FmError("BAD_REQUEST", "Keep the macro name under 120 characters.");

  const mode: DbMacroMode = raw.mode === "actions" ? "actions" : raw.mode === "code" || raw.mode === "bun" ? "code" : existing?.mode ?? "code";
  const engine: DbMacroEngineFilter =
    raw.engine === "any" || isEngine(raw.engine) ? raw.engine : existing?.engine ?? "any";
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, 500) : existing?.description ?? "";
  const code = typeof raw.code === "string" ? raw.code : existing?.code ?? "";
  const actions = Array.isArray(raw.actions)
    ? raw.actions.map((r, i) => sanitizeActionRow(r, i))
    : existing?.actions ?? [];
  const transaction = typeof raw.transaction === "boolean" ? raw.transaction : existing?.transaction ?? false;
  const rawTimeout = Number(raw.timeoutMs ?? existing?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(rawTimeout) ? Math.max(500, Math.min(MAX_TIMEOUT_MS, Math.trunc(rawTimeout))) : DEFAULT_TIMEOUT_MS;

  const defaultParams: Record<string, string> = {};
  if (isObject(raw.defaultParams)) {
    for (const [k, v] of Object.entries(raw.defaultParams)) {
      const key = k.trim();
      if (key && v !== undefined && v !== null) defaultParams[key] = String(v);
    }
  } else if (existing?.defaultParams) {
    Object.assign(defaultParams, existing.defaultParams);
  }

  const now = new Date().toISOString();
  return {
    id: existing?.id ?? (typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `macro-${ crypto.randomUUID().slice(0, 8) }`),
    name,
    description,
    mode,
    engine,
    code,
    actions,
    transaction,
    timeoutMs,
    defaultParams,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(existing?.builtin ? { builtin: true } : {}),
  };
}

export function loadMacros(ctx: FmContext): DbMacro[] {
  const file = macroFilePath(ctx);
  if (!existsSync(file)) {
    const defaults = defaultBuiltinMacros();
    saveMacrosFile(ctx, defaults);
    return defaults;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (Array.isArray(parsed?.macros)) {
      return parsed.macros.map((m: unknown) => sanitizeMacroInput(m, isObject(m) ? (m as unknown as DbMacro) : undefined));
    }
  } catch {}
  const defaults = defaultBuiltinMacros();
  saveMacrosFile(ctx, defaults);
  return defaults;
}

function saveMacrosFile(ctx: FmContext, macros: DbMacro[]): void {
  const file = macroFilePath(ctx);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ version: 1, macros }, null, 2), { mode: 0o600 });
}

/**
 * Prepares user TypeScript / JavaScript code so both top-level script statements
 * (`await DoCmd.RunSQL(...)`, `return rows;`) AND module exports (`export default async function(ctx) {}`,
 * `export async function myHelper() {}`) work seamlessly inside an async wrapper.
 */
function normalizeMacroSourceForAsyncBody(source: string): string {
  return source
    .replace(/^\s*export\s+default\s+async\s+function\s*([A-Za-z_$][\w$]*)?/gm, (_m, fnName) =>
      fnName ? `__exports.default = async function ${fnName}` : `__exports.default = async function`,
    )
    .replace(/^\s*export\s+default\s+function\s*([A-Za-z_$][\w$]*)?/gm, (_m, fnName) =>
      fnName ? `__exports.default = function ${fnName}` : `__exports.default = function`,
    )
    .replace(/^\s*export\s+default\s+/gm, "__exports.default = ")
    .replace(/^\s*export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, (_m, asyncKw, fnName) =>
      `${asyncKw ?? ""}function ${fnName}`,
    )
    .replace(/^\s*export\s+(const|let|var)\s+/gm, "$1 ");
}

export interface MacroValidationResult {
  valid: boolean;
  transpiledJs?: string;
  warnings: string[];
  errors: { message: string; line?: number; column?: number }[];
}

export const FORBIDDEN_MACRO_CODE_RE =
  /\b(?:process\s*\.\s*(?:env|binding|dlopen|exit|kill|mainModule)|Bun\s*\.\s*(?:spawn|spawnSync|serve|file|write|mmap|dlopen|unsafe|plugin)|globalThis\b|Reflect\b|Proxy\b|constructor\b|__proto__\b|prototype\b|import\s*\.\s*meta\b|require\s*\(|import\s*\(|child_process\b|Function\s*\(|eval\s*\()/;

export function validateBunMacroCode(code: string): MacroValidationResult {
  const warnings: string[] = [];
  const errors: { message: string; line?: number; column?: number }[] = [];
  const trimmed = (code ?? "").trim();
  if (!trimmed) {
    errors.push({ message: "Macro code cannot be empty." });
    return { valid: false, warnings, errors };
  }

  if (FORBIDDEN_MACRO_CODE_RE.test(trimmed)) {
    errors.push({ message: "Access to host process, filesystem, or OS process APIs is restricted inside database macros." });
    return { valid: false, warnings, errors };
  }

  const normalized = normalizeMacroSourceForAsyncBody(code);
  const wrapped = `async function __bunMacroEntry(__ctx: any) {\n${normalized}\n}`;

  try {
    const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
    const js = transpiler.transformSync(wrapped);
    if (/\bDROP\s+TABLE\b/i.test(code)) {
      warnings.push("Macro contains DROP TABLE — consider running with Dry Run enabled first.");
    }
    if (/\bDELETE\s+FROM\s+\w+\s*(?:;|$)/i.test(code)) {
      warnings.push("Macro contains an unqualified DELETE FROM without a WHERE clause.");
    }
    return { valid: true, transpiledJs: js, warnings, errors };
  } catch (err: any) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const posLine = typeof err?.line === "number" ? Math.max(1, err.line - 1) : undefined;
    const posCol = typeof err?.column === "number" ? err?.column : undefined;
    errors.push({
      message: rawMsg.replace(/\s+/g, " ").trim(),
      ...(posLine !== undefined ? { line: posLine } : {}),
      ...(posCol !== undefined ? { column: posCol } : {}),
    });
    return { valid: false, warnings, errors };
  }
}

export function validateMacroActions(actions: DbMacroActionRow[], knownMacroNames?: string[]): MacroValidationResult {
  const warnings: string[] = [];
  const errors: { message: string; line?: number; column?: number }[] = [];
  const enabled = actions.filter((a) => a.enabled !== false && a.action !== "Comment");
  if (enabled.length === 0) {
    warnings.push("Macro has no enabled action rows.");
  }

  for (let i = 0; i < actions.length; i++) {
    const row = actions[i]!;
    if (!row.enabled || row.action === "Comment") continue;
    const cat = FM_MACRO_ACTION_CATALOG.find((c) => c.action === row.action);
    if (!cat) {
      errors.push({ message: `Step ${i + 1}: Unknown action '${row.action}'.`, line: i + 1 });
      continue;
    }
    for (const f of cat.fields) {
      if (f.required && !(row.params[f.key] ?? "").trim()) {
        errors.push({ message: `Step ${i + 1} (${row.action}): '${f.label}' is required.`, line: i + 1 });
      }
    }
    if ((row.action === "DeleteRecord" || row.action === "UpdateRecord") && !(row.params.where ?? "").trim()) {
      warnings.push(`Step ${i + 1} (${row.action}): No WHERE filter specified; this will affect all rows in '${row.params.table || "table"}'.`);
    }
    if (row.action === "InsertRecord" && (row.params.values ?? "").trim()) {
      try {
        const parsed = JSON.parse(row.params.values!);
        if (!isObject(parsed)) {
          errors.push({ message: `Step ${i + 1} (${row.action}): 'Row Values' must be a JSON object.`, line: i + 1 });
        }
      } catch {
        errors.push({ message: `Step ${i + 1} (${row.action}): 'Row Values' must be valid JSON.`, line: i + 1 });
      }
    }
    if (row.action === "UpdateRecord" && (row.params.values ?? "").trim()) {
      const v = row.params.values!.trim();
      if (v.startsWith("{")) {
        try {
          const parsed = JSON.parse(v);
          if (!isObject(parsed)) {
            errors.push({ message: `Step ${i + 1} (${row.action}): 'Values' must be a JSON object or SQL SET assignment.`, line: i + 1 });
          }
        } catch {
          errors.push({ message: `Step ${i + 1} (${row.action}): Invalid JSON in 'Values'.`, line: i + 1 });
        }
      }
    }
    if (row.action === "RunMacro" && knownMacroNames && (row.params.macroName ?? "").trim()) {
      const targetName = row.params.macroName!.trim().toLowerCase();
      if (!knownMacroNames.some((n) => n.toLowerCase() === targetName)) {
        errors.push({ message: `Step ${i + 1} (RunMacro): Sub-macro '${row.params.macroName}' was not found.`, line: i + 1 });
      }
    }
    if (row.action === "RunCode" && (row.params.code ?? "").trim()) {
      const check = validateBunMacroCode(row.params.code!);
      if (!check.valid) {
        for (const e of check.errors) {
          errors.push({ message: `Step ${i + 1} (RunCode): ${e.message}`, line: i + 1 });
        }
      }
    }
    if ((row.condition ?? "").trim()) {
      const condCheck = validateBunMacroCode(row.condition!.replace(/\[([A-Za-z0-9_]+)\]/g, "TempVars.$1"));
      if (!condCheck.valid) {
        for (const e of condCheck.errors) {
          errors.push({ message: `Step ${i + 1} (Condition): ${e.message}`, line: i + 1 });
        }
      }
    }
    if ((row.action === "SetTempVar" || row.action === "Assert") && (row.params.expression ?? "").trim()) {
      const exprCheck = validateBunMacroCode(`return (${row.params.expression!});`);
      if (!exprCheck.valid) {
        for (const e of exprCheck.errors) {
          errors.push({ message: `Step ${i + 1} (${row.action}): ${e.message}`, line: i + 1 });
        }
      }
    }
  }
  return { valid: errors.length === 0, warnings, errors };
}

/**
 * Converts visual Access-style Macro action rows into clean, idiomatic Bun JavaScript
 * (just like Microsoft Access's "Convert Macro to Visual Basic" command).
 */
export function macroActionsToBunJs(name: string, actions: DbMacroActionRow[]): string {
  const lines: string[] = [
    `// Macro: ${name || "Untitled Macro"}`,
    `// Converted from Visual Actions to Bun JavaScript Runtime`,
    ``,
  ];

  for (let i = 0; i < actions.length; i++) {
    const row = actions[i]!;
    if (!row.enabled) {
      lines.push(`// [Disabled Step ${i + 1}: ${row.action}]`);
      continue;
    }
    if (row.comment) {
      lines.push(`// ${row.comment}`);
    }
    if (row.action === "Comment") {
      if (row.params.text) lines.push(`// ${row.params.text}`);
      continue;
    }

    const rawCond = (row.condition ?? "").trim();
    const cond = rawCond.replace(/\[([A-Za-z0-9_]+)\]/g, "TempVars.$1");
    if (cond && !validateBunMacroCode(cond).valid) {
      throw new FmError("SYNTAX_ERROR", `Step ${i + 1}: Invalid condition expression.`);
    }
    const indent = cond ? "  " : "";
    if (cond) {
      lines.push(`if (${cond}) {`);
    }

    const p = row.params;
    switch (row.action) {
      case "RunSQL":
        lines.push(`${indent}await DoCmd.RunSQL(${JSON.stringify(p.sql ?? "")});`);
        break;
      case "OpenQuery":
        lines.push(
          p.label
            ? `${indent}await DoCmd.OpenQuery(${JSON.stringify(p.sql ?? "")}, ${JSON.stringify(p.label)});`
            : `${indent}await DoCmd.OpenQuery(${JSON.stringify(p.sql ?? "")});`,
        );
        break;
      case "OpenTable": {
        const opts: Record<string, unknown> = {};
        if (p.where?.trim()) opts.where = p.where.trim();
        if (p.orderBy?.trim()) opts.orderBy = p.orderBy.trim();
        if (p.limit?.trim() && Number.isFinite(Number(p.limit))) opts.limit = Number(p.limit);
        lines.push(
          Object.keys(opts).length > 0
            ? `${indent}await DoCmd.OpenTable(${JSON.stringify(p.table ?? "")}, ${JSON.stringify(opts)});`
            : `${indent}await DoCmd.OpenTable(${JSON.stringify(p.table ?? "")});`,
        );
        break;
      }
      case "InsertRecord": {
        let objLiteral = p.values ?? "{}";
        try {
          objLiteral = JSON.stringify(JSON.parse(objLiteral));
        } catch {}
        lines.push(`${indent}await DoCmd.InsertRecord(${JSON.stringify(p.table ?? "")}, ${objLiteral});`);
        break;
      }
      case "UpdateRecord": {
        let valArg = JSON.stringify(p.values ?? "");
        const trimmedVal = (p.values ?? "").trim();
        if (trimmedVal.startsWith("{")) {
          try {
            valArg = JSON.stringify(JSON.parse(trimmedVal));
          } catch {}
        }
        lines.push(
          `${indent}await DoCmd.UpdateRecord(${JSON.stringify(p.table ?? "")}, ${valArg}, ${JSON.stringify(p.where ?? "")});`,
        );
        break;
      }
      case "DeleteRecord":
        lines.push(`${indent}await DoCmd.DeleteRecord(${JSON.stringify(p.table ?? "")}, ${JSON.stringify(p.where ?? "")});`);
        break;
      case "MakeTable":
        lines.push(
          `${indent}await DoCmd.MakeTable(${JSON.stringify(p.sql ?? "")}, ${JSON.stringify(p.targetTable ?? "")}, ${p.replace !== "false"});`,
        );
        break;
      case "EmptyTable":
        lines.push(`${indent}await DoCmd.EmptyTable(${JSON.stringify(p.table ?? "")});`);
        break;
      case "SetTempVar": {
        const expr = p.expression?.trim() || '""';
        if (!validateBunMacroCode(`return (${expr});`).valid) {
          throw new FmError("SYNTAX_ERROR", `Step ${i + 1} (SetTempVar): Invalid expression.`);
        }
        lines.push(`${indent}await DoCmd.SetTempVar(${JSON.stringify(p.name ?? "var")}, ${expr});`);
        break;
      }
      case "RemoveTempVar":
        lines.push(`${indent}await DoCmd.RemoveTempVar(${JSON.stringify(p.name ?? "")});`);
        break;
      case "MessageBox":
        lines.push(
          `${indent}MsgBox(${JSON.stringify(p.message ?? "")}, ${JSON.stringify(p.title ?? "Macro")}, ${JSON.stringify(p.type ?? "info")});`,
        );
        break;
      case "Beep":
        lines.push(`${indent}DoCmd.Beep();`);
        break;
      case "RunMacro":
        lines.push(`${indent}await DoCmd.RunMacro(${JSON.stringify(p.macroName ?? "")});`);
        break;
      case "Assert": {
        const expr = p.expression?.trim() || "true";
        if (!validateBunMacroCode(`return (${expr});`).valid) {
          throw new FmError("SYNTAX_ERROR", `Step ${i + 1} (Assert): Invalid expression.`);
        }
        lines.push(
          `${indent}DoCmd.Assert(${expr}, ${JSON.stringify(p.message ?? "Macro assertion failed")});`,
        );
        break;
      }
      case "StopMacro":
        lines.push(`${indent}DoCmd.StopMacro(${JSON.stringify(p.reason ?? "Stopped by macro")});`);
        break;
      case "RunCode": {
        const snippet = (p.code ?? "").trim();
        for (const sl of snippet.split("\n")) {
          lines.push(`${indent}${sl}`);
        }
        break;
      }
    }

    if (cond) {
      lines.push(`}`);
    }
  }

  return lines.join("\n");
}

/**
 * Exports a macro as:
 * - `"bun"`: Standalone runnable Bun TypeScript script (`bun run macro.ts`)
 * - `"vba"`: Microsoft Access VBA `Sub Macro_<Name>()` equivalent
 * - `"sql"`: Extracted SQL statements
 * - `"json"`: Portable JSON macro bundle
 */
export function exportMacroArtifact(macro: DbMacro, format: "bun" | "vba" | "sql" | "json"): { format: string; filename: string; mime: string; content: string } {
  const safeSlug = macro.name.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "macro";
  const bodyCode = macro.mode === "actions" ? macroActionsToBunJs(macro.name, macro.actions) : macro.code;

  if (format === "json") {
    return {
      format,
      filename: `${safeSlug}.macro.json`,
      mime: "application/json",
      content: JSON.stringify(macro, null, 2),
    };
  }

  if (format === "sql") {
    const sqlLines: string[] = [`-- Macro SQL Export: ${macro.name}`, `BEGIN TRANSACTION;`];
    if (macro.mode === "actions") {
      for (const a of macro.actions) {
        if (!a.enabled) continue;
        if (a.comment) sqlLines.push(`-- ${a.comment}`);
        if (a.action === "RunSQL" || a.action === "OpenQuery") {
          sqlLines.push(`${(a.params.sql ?? "").trim().replace(/;?\s*$/, ";")}`);
        } else if (a.action === "OpenTable" && a.params.table) {
          const w = a.params.where ? ` WHERE ${a.params.where}` : "";
          const o = a.params.orderBy ? ` ORDER BY ${a.params.orderBy}` : "";
          sqlLines.push(`SELECT * FROM "${a.params.table}"${w}${o};`);
        } else if (a.action === "UpdateRecord" && a.params.table) {
          const w = a.params.where ? ` WHERE ${a.params.where}` : "";
          sqlLines.push(`UPDATE "${a.params.table}" SET ${a.params.values ?? ""}${w};`);
        } else if (a.action === "DeleteRecord" && a.params.table) {
          const w = a.params.where ? ` WHERE ${a.params.where}` : "";
          sqlLines.push(`DELETE FROM "${a.params.table}"${w};`);
        } else if (a.action === "EmptyTable" && a.params.table) {
          sqlLines.push(`DELETE FROM "${a.params.table}";`);
        }
      }
    } else {
      const matches = [...bodyCode.matchAll(/(?:RunSQL|OpenQuery|query|execute)\(\s*([`"'])([\s\S]*?)\1/g)];
      for (const m of matches) {
        sqlLines.push(`${m[2]!.trim().replace(/;?\s*$/, ";")}`);
      }
    }
    sqlLines.push(`COMMIT;`);
    return {
      format,
      filename: `${safeSlug}.sql`,
      mime: "application/sql",
      content: sqlLines.join("\n\n") + "\n",
    };
  }

  if (format === "vba") {
    const fnName = macro.name.replace(/[^A-Za-z0-9_]/g, "_") || "Untitled";
    const vba: string[] = [
      `Option Compare Database`,
      `Option Explicit`,
      ``,
      `' Macro: ${macro.name}`,
      `' ${macro.description || "Exported from Bun RAD Studio File Manager Databases"}`,
      `Public Sub ${fnName}()`,
      `    On Error GoTo ErrHandler`,
      `    Dim db As DAO.Database`,
      `    Set db = CurrentDb()`,
    ];
    if (macro.transaction) vba.push(`    DBEngine.BeginTrans`);
    if (macro.mode === "actions") {
      for (const a of macro.actions) {
        if (!a.enabled) continue;
        if (a.comment) vba.push(`    ' ${a.comment}`);
        const esc = (s = "") => s.replace(/"/g, '""');
        if (a.action === "RunSQL") vba.push(`    CurrentDb.Execute "${esc(a.params.sql)}", dbFailOnError`);
        else if (a.action === "OpenQuery") vba.push(`    DoCmd.OpenQuery "${esc(a.params.label || a.params.sql)}"`);
        else if (a.action === "OpenTable") vba.push(`    DoCmd.OpenTable "${esc(a.params.table)}"`);
        else if (a.action === "UpdateRecord") vba.push(`    CurrentDb.Execute "UPDATE [${esc(a.params.table)}] SET ${esc(a.params.values)}${a.params.where ? ` WHERE ${esc(a.params.where)}` : ""}", dbFailOnError`);
        else if (a.action === "DeleteRecord") vba.push(`    CurrentDb.Execute "DELETE FROM [${esc(a.params.table)}]${a.params.where ? ` WHERE ${esc(a.params.where)}` : ""}", dbFailOnError`);
        else if (a.action === "SetTempVar") vba.push(`    TempVars.Add "${esc(a.params.name)}", ${a.params.expression || '""'}`);
        else if (a.action === "RemoveTempVar") vba.push(`    TempVars.Remove "${esc(a.params.name)}"`);
        else if (a.action === "MessageBox") vba.push(`    MsgBox "${esc(a.params.message)}", vbInformation, "${esc(a.params.title || "Macro")}"`);
        else if (a.action === "Beep") vba.push(`    DoCmd.Beep`);
        else if (a.action === "RunCode") vba.push(`    ' [Bun JS RunCode]: ${(a.params.code ?? "").replace(/\r?\n/g, " | ")}`);
        else if (a.action === "StopMacro") vba.push(`    Exit Sub`);
      }
    } else {
      for (const line of bodyCode.split("\n")) {
        vba.push(`    ' ${line}`);
      }
    }
    if (macro.transaction) vba.push(`    DBEngine.CommitTrans`);
    vba.push(
      `    Exit Sub`,
      `ErrHandler:`,
      ...(macro.transaction ? [`    DBEngine.Rollback`] : []),
      `    MsgBox Err.Description, vbCritical, "${macro.name.replace(/"/g, '""')}"`,
      `End Sub`,
    );
    return {
      format,
      filename: `${safeSlug}.bas`,
      mime: "text/plain",
      content: vba.join("\n") + "\n",
    };
  }

  // Standalone Bun TypeScript script
  const bunScript = [
    `#!/usr/bin/env bun`,
    `/**`,
    ` * Macro: ${macro.name}`,
    ` * ${macro.description || "Generated by Bun RAD Studio — File Manager Databases"}`,
    ` * Run with: bun run ${safeSlug}.ts [sqlite-path-or-database-url]`,
    ` */`,
    `import { Database } from "bun:sqlite";`,
    ``,
    `const dbPath = Bun.argv[2] || process.env.SQLITE_PATH || ":memory:";`,
    `const sqlite = new Database(dbPath);`,
    `const TempVars: Record<string, any> = {};`,
    `const params: Record<string, any> = ${JSON.stringify(macro.defaultParams)};`,
    `const Debug = { print: (...args: any[]) => console.log("[Debug]", ...args), Print: (...args: any[]) => console.log("[Debug]", ...args) };`,
    `const MsgBox = (message: string, title = "Macro", type = "info") => console.log(\`[\${title}:\${type}] \${message}\`);`,
    ``,
    `const CurrentDb = {`,
    `  name: dbPath,`,
    `  engine: "sqlite",`,
    `  RecordsAffected: 0,`,
    `   async query(sql: string, bind: any[] = []) { return sqlite.query(sql).all(...bind) as Record<string, any>[]; },`,
    `  async execute(sql: string, bind: any[] = []) { const r = sqlite.query(sql).run(...bind); this.RecordsAffected = r.changes; return { affectedRows: r.changes }; },`,
    `  async tables() { return sqlite.query("SELECT name, type AS kind FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as any[]; },`,
    `  async OpenRecordset(sqlOrTable: string, bind: any[] = []) {`,
    `    const sql = /^\\s*select\\b/i.test(sqlOrTable) ? sqlOrTable : \`SELECT * FROM "\${sqlOrTable.replace(/"/g, '""')}"\`;`,
    `    const rows = sqlite.query(sql).all(...bind) as Record<string, any>[];`,
    `    let idx = 0;`,
    `    return {`,
    `      rows,`,
    `      RecordCount: rows.length,`,
    `      get EOF() { return idx >= rows.length; },`,
    `      MoveFirst() { idx = 0; },`,
    `      MoveNext() { idx++; },`,
    `      Fields(k: string | number) { const r = rows[idx]; if (!r) return null; return typeof k === "number" ? Object.values(r)[k] : r[k]; },`,
    `      Close() {},`,
    `    };`,
    `  },`,
    `};`,
    `const db = CurrentDb;`,
    `const DCount = async (expr: string, domain: string, criteria?: string) => {`,
    `  const w = criteria ? \` WHERE \${criteria}\` : "";`,
    `  const r = sqlite.query(\`SELECT COUNT(\${expr || "*"}) AS v FROM "\${domain.replace(/"/g, '""')}"\${w}\`).get() as any;`,
    `  return Number(r?.v ?? 0);`,
    `};`,
    `const DLookup = async (expr: string, domain: string, criteria?: string) => {`,
    `  const w = criteria ? \` WHERE \${criteria}\` : "";`,
    `  const r = sqlite.query(\`SELECT \${expr} AS v FROM "\${domain.replace(/"/g, '""')}"\${w} LIMIT 1\`).get() as any;`,
    `  return r?.v ?? null;`,
    `};`,
    `const DSum = async (expr: string, domain: string, criteria?: string) => {`,
    `  const w = criteria ? \` WHERE \${criteria}\` : "";`,
    `  const r = sqlite.query(\`SELECT COALESCE(SUM(\${expr}), 0) AS v FROM "\${domain.replace(/"/g, '""')}"\${w}\`).get() as any;`,
    `  return Number(r?.v ?? 0);`,
    `};`,
    `const DoCmd = {`,
    `  RunSQL: (sql: string, bind: any[] = []) => CurrentDb.execute(sql, bind),`,
    `  OpenQuery: async (sql: string, label?: string) => { const rows = await CurrentDb.query(sql); console.table(rows); return rows; },`,
    `  OpenTable: async (table: string) => { const rows = await CurrentDb.query(\`SELECT * FROM "\${table.replace(/"/g, '""')}"\`); console.table(rows); return rows; },`,
    `  SetTempVar: async (k: string, v: any) => { TempVars[k] = v; },`,
    `  RemoveTempVar: async (k: string) => { delete TempVars[k]; },`,
    `  MessageBox: MsgBox,`,
    `  Beep: () => process.stdout.write("\\x07"),`,
    `};`,
    ``,
    `async function main() {`,
    ...bodyCode.split("\n").map((l) => `  ${l}`),
    `}`,
    ``,
    `const result = await main();`,
    `if (result !== undefined) console.log("Result:", result);`,
  ];
  return {
    format,
    filename: `${safeSlug}.ts`,
    mime: "application/typescript",
    content: bunScript.join("\n") + "\n",
  };
}

class MacroStopSignal extends Error {
  reason: string;
  constructor(reason = "Macro stopped") {
    super(reason);
    this.reason = reason;
  }
}

interface ResolvedMacroTarget {
  kind: "profile" | "sqliteFile" | "memory";
  engine: DbEngine;
  engineLabel: string;
  label: string;
  profile?: DbProfile;
  testInput: TestInput;
  passwordSecret?: string;
  production: boolean;
  readOnly: boolean;
}

async function resolveMacroTarget(ctx: FmContext, spec: unknown): Promise<ResolvedMacroTarget> {
  if (!isObject(spec) || !spec.kind || spec.kind === "memory") {
    return {
      kind: "memory",
      engine: "sqlite",
      engineLabel: ENGINES.sqlite.label,
      label: "Scratch SQLite (In-Memory Demo DB)",
      testInput: {
        engine: "sqlite",
        path: ":memory:",
        sqliteMode: "readwrite",
        production: false,
      },
      production: false,
      readOnly: false,
    };
  }

  if (spec.kind === "profile") {
    const st = dbState(ctx);
    const profile = profileFor(st.store, spec.profileId);
    const eff = await effectiveFor(ctx, profile.engine, profile);
    const ti = testInputFor(profile, eff.resolved);
    if (profile.engine === "sqlite" && ti.path) {
      ti.path = await checkSqlitePath(ctx, ti.path, ti.sqliteMode ?? "readwrite");
    }
    return {
      kind: "profile",
      engine: profile.engine,
      engineLabel: ENGINES[profile.engine].label,
      label: profile.name,
      profile,
      testInput: ti,
      passwordSecret: eff.password ?? undefined,
      production: profile.environment === "production",
      readOnly: profile.readOnly === true || (profile.engine === "sqlite" && ti.sqliteMode === "readonly"),
    };
  }

  if (spec.kind === "sqliteFile") {
    const checkedPath = await checkSqlitePath(ctx, spec.path, "readwrite");
    const baseName = checkedPath.split(/[\\/]/).pop() || checkedPath;
    return {
      kind: "sqliteFile",
      engine: "sqlite",
      engineLabel: ENGINES.sqlite.label,
      label: baseName,
      testInput: {
        engine: "sqlite",
        path: checkedPath,
        sqliteMode: "readwrite",
        production: false,
      },
      production: false,
      readOnly: false,
    };
  }

  throw new FmError("BAD_REQUEST", "Choose a valid database connection, SQLite file, or the Scratch database.");
}

async function openMacroSqlAdapter(ctx: FmContext, target: ResolvedMacroTarget): Promise<DbAdapter> {
  const i = target.testInput;
  const config: ConnectionConfig = {
    engine: target.engine as Engine,
    path: i.path,
    sqliteMode: i.path === ":memory:" ? "memory" : i.sqliteMode === "create" ? "readwrite" : (i.sqliteMode ?? "readwrite"),
    host: i.host,
    port: i.port,
    user: i.user,
    password: i.password,
    database: i.database ?? (target.engine === "sqlite" ? i.path : undefined),
    schema: i.schema,
    tls: i.tls,
    readOnly: false,
    connectTimeoutMs: Math.min(i.connectTimeoutMs ?? TEST_TIMEOUT_MS, TEST_TIMEOUT_MS),
    allowPublicKeyRetrieval: target.engine === "mysql",
    maxConnections: 1,
  };
  const hook = dbState(ctx).hooks.openAdapter;
  const adapter = hook ? await hook(config) : await createAdapter(config);
  await adapter.connect();
  if (target.kind === "memory") {
    await seedScratchDatabase(adapter);
  }
  return adapter;
}

async function seedScratchDatabase(adapter: DbAdapter): Promise<void> {
  await adapter.query(
    `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'standard',
      points INTEGER NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    [],
  );
  await adapter.query(
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      title TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0
    )`,
    [],
  );
  await adapter.query(
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      total_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      ordered_at TEXT NOT NULL
    )`,
    [],
  );
  await adapter.query(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    [],
  );

  const existing = await adapter.query(`SELECT COUNT(*) AS c FROM customers`, []);
  if (Number(existing.rows[0]?.c ?? 0) === 0) {
    await adapter.query(
      `INSERT INTO customers (name, email, tier, points, spent, active) VALUES
        ('Ada Lovelace', 'ada@analytical.org', 'VIP', 240, 1270, 1),
        ('Grace Hopper', 'grace@cobol.navy.mil', 'gold', 150, 790, 1),
        ('Edgar Codd', 'ted@relational.ibm.com', 'gold', 115, 655.5, 1),
        ('Margaret Hamilton', 'margaret@apollo.mit.edu', 'VIP', 310, 2100, 1),
        ('Alan Turing', 'alan@bletchley.uk', 'standard', 50, 150, 1)`,
      [],
    );
    await adapter.query(
      `INSERT INTO products (sku, title, price_cents, stock) VALUES
        ('BUN-PRO', 'Bun Runtime Pro License', 4900, 50),
        ('ACCESS-KIT', 'RAD Database Macro Toolkit', 2900, 120),
        ('SQL-CLOUD', 'Cross-Engine Replicator', 7900, 30)`,
      [],
    );
    await adapter.query(
      `INSERT INTO orders (customer_id, product_id, quantity, total_cents, status, ordered_at) VALUES
        (1, 1, 2, 9800, 'paid', '2025-02-01T10:00:00Z'),
        (1, 2, 1, 2900, 'paid', '2025-02-03T12:30:00Z'),
        (2, 3, 1, 7900, 'paid', '2025-02-05T15:15:00Z'),
        (3, 2, 1, 2900, 'pending', '2025-02-06T09:00:00Z')`,
      [],
    );
    await adapter.query(
      `INSERT INTO audit_logs (event, detail, created_at) VALUES
        ('seed_init', 'Initialized Scratch SQLite demo tables', '2025-02-01T00:00:00Z')`,
      [],
    );
  }
}

async function openMacroRedisClient(ctx: FmContext, target: ResolvedMacroTarget): Promise<CloneRedisClient> {
  const hook = dbState(ctx).hooks.openRedis;
  const i = target.testInput;
  if (hook) return await hook(i);
  const tls = !!i.tls;
  const auth = i.user || i.password ? `${i.user ? encodeURIComponent(i.user) : ""}${i.password ? `:${encodeURIComponent(i.password)}` : ""}@` : "";
  const url = `${tls ? "rediss" : "redis"}://${auth}${i.host?.includes(":") ? `[${i.host}]` : i.host}:${i.port}`;
  const client = new RedisClient(
    url,
    {
      connectionTimeout: Math.min(i.connectTimeoutMs ?? TEST_TIMEOUT_MS, TEST_TIMEOUT_MS),
      autoReconnect: false,
      maxRetries: 0,
      ...(tls && typeof i.tls === "object"
        ? { tls: { rejectUnauthorized: i.tls.verify !== false, ...(i.tls.ca ? { ca: i.tls.ca } : {}) } }
        : {}),
    } as never,
  ) as RedisClient & { select(db: number): Promise<unknown> };
  await client.connect();
  await client.ping();
  if (i.dbIndex) await client.select(i.dbIndex);
  return {
    send: (cmd, args) => client.send(cmd, args),
    close: () => {
      try {
        client.close();
      } catch {}
    },
  };
}

/**
 * Replaces `?` positional placeholders with `$1, $2, ...` when running on PostgreSQL
 * so user macros can write portable parameterized SQL (`WHERE points >= ?`) across SQLite, MySQL, and Postgres.
 */
function adaptSqlPlaceholders(engine: Engine, sql: string, paramCount: number): string {
  if (engine !== "postgres" || paramCount === 0 || !sql.includes("?")) return sql;
  let idx = 0;
  let inSingle = false;
  let inDouble = false;
  let out = "";
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      out += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ch;
    } else if (ch === "?" && !inSingle && !inDouble) {
      idx++;
      out += `$${idx}`;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Resolves `${TempVars.key}`, `${params.key}`, and Access-style `[Enter Prompt]` placeholders in SQL/messages.
 */
function interpolateTemplate(
  raw: string,
  tempVars: Record<string, unknown>,
  params: Record<string, unknown>,
  missingPrompts: Set<string>,
  interpolateBracketVars = false,
): string {
  if (!raw) return "";
  let out = raw.replace(/\$\{\s*(?:TempVars\.|vars\.|params\.)?([A-Za-z0-9_]+)\s*\}/g, (_m, key) => {
    if (key in tempVars && tempVars[key] !== undefined) return String(tempVars[key]);
    if (key in params && params[key] !== undefined) return String(params[key]);
    return "";
  });
  out = out.replace(/\[Enter ([^\]]+)\]/gi, (full, promptName) => {
    const clean = String(promptName).trim();
    const withEnter = `Enter ${clean}`;
    for (const k of [clean, withEnter]) {
      if (k in params && params[k] !== undefined && String(params[k]) !== "") {
        return String(params[k]);
      }
      if (k in tempVars && tempVars[k] !== undefined && String(tempVars[k]) !== "") {
        return String(tempVars[k]);
      }
    }
    missingPrompts.add(clean);
    return full;
  });
  if (interpolateBracketVars) {
    out = out.replace(/\[([A-Za-z0-9_]+)\]/g, (full, key) => {
      if (key in tempVars && tempVars[key] !== undefined) return String(tempVars[key]);
      if (key in params && params[key] !== undefined) return String(params[key]);
      return full;
    });
  }
  return out;
}

function createRecordSet(rows: Record<string, WireValue>[]) {
  let cursor = 0;
  return {
    rows,
    RecordCount: rows.length,
    get BOF() {
      return rows.length === 0 || cursor < 0;
    },
    get EOF() {
      return rows.length === 0 || cursor >= rows.length;
    },
    MoveFirst() {
      cursor = 0;
    },
    MoveLast() {
      cursor = Math.max(0, rows.length - 1);
    },
    MoveNext() {
      cursor++;
    },
    MovePrevious() {
      cursor--;
    },
    Fields(nameOrIndex: string | number): WireValue {
      const row = rows[cursor];
      if (!row) return null;
      if (typeof nameOrIndex === "number") {
        const vals = Object.values(row);
        return vals[nameOrIndex] ?? null;
      }
      if (nameOrIndex in row) return row[nameOrIndex] ?? null;
      const lower = nameOrIndex.toLowerCase();
      for (const [k, v] of Object.entries(row)) {
        if (k.toLowerCase() === lower) return v ?? null;
      }
      return null;
    },
    GetRows(numRows?: number) {
      const slice = numRows !== undefined ? rows.slice(cursor, cursor + numRows) : rows.slice(cursor);
      cursor += slice.length;
      return slice;
    },
    Close() {
      cursor = rows.length;
    },
    [Symbol.iterator]: function* () {
      for (const r of rows) yield r;
    },
  };
}

function formatLogArg(val: unknown): string {
  if (typeof val === "string") return val;
  if (val === null || val === undefined || typeof val === "number" || typeof val === "boolean") return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export interface RunMacroRequest {
  macro?: unknown;
  macroId?: string;
  target?: unknown;
  params?: Record<string, unknown>;
  dryRun?: boolean;
  transaction?: boolean;
  confirmWrites?: boolean;
}

export async function executeDbMacro(ctx: FmContext, req: RunMacroRequest): Promise<DbMacroRunResult> {
  const allMacros = loadMacros(ctx);
  let macro: DbMacro;
  if (req.macroId && !req.macro) {
    const found = allMacros.find((m) => m.id === req.macroId || m.name.toLowerCase() === req.macroId!.toLowerCase());
    if (!found) throw new FmError("NOT_FOUND", `Macro '${req.macroId}' was not found.`);
    macro = found;
  } else if (req.macro) {
    const rawObj = isObject(req.macro) ? req.macro : {};
    macro = sanitizeMacroInput({
      ...rawObj,
      name: typeof rawObj.name === "string" && rawObj.name.trim() ? rawObj.name : "Ad-hoc Macro",
    });
  } else {
    throw new FmError("BAD_REQUEST", "Provide a macro to run.");
  }

  const target = await resolveMacroTarget(ctx, req.target);
  const dryRun = req.dryRun === true;
  const useTransaction = dryRun || (typeof req.transaction === "boolean" ? req.transaction : macro.transaction);

  if (macro.engine !== "any" && macro.engine !== target.engine) {
    throw new FmError(
      "BAD_REQUEST",
      `Macro '${macro.name}' targets ${ENGINES[macro.engine].label}, but the selected connection is ${target.engineLabel}.`,
    );
  }

  // Guard production and read-only connections when not running in Dry Run mode
  if (!dryRun && (target.production || target.readOnly) && req.confirmWrites !== true) {
    const reason = target.readOnly ? "readonly" : "production";
    throw new FmError(
      "NEEDS_CONFIRM",
      target.readOnly
        ? `'${target.label}' is marked Read-Only. Confirm if you want to run '${macro.name}' against it (or enable Dry Run).`
        : `'${target.label}' is a Production ${target.engineLabel} connection. Confirm before executing '${macro.name}' (or enable Dry Run).`,
      { reason, name: target.label, engine: target.engine },
    );
  }

  const secrets: (string | undefined)[] = [target.passwordSecret];
  const startedAt = performance.now();
  const logs: DbMacroLogEntry[] = [];
  const messages: DbMacroMessageBox[] = [];
  const steps: DbMacroStepResult[] = [];
  const resultSets: DbMacroResultSet[] = [];
  const missingPrompts = new Set<string>();
  let beeps = 0;
  let totalAffectedRows = 0;
  let warningsEnabled = true;

  const tempVarsStore: Record<string, unknown> = {};
  const inputParams: Record<string, unknown> = { ...macro.defaultParams, ...(isObject(req.params) ? req.params : {}) };
  for (const [k, v] of Object.entries(inputParams)) {
    tempVarsStore[k] = v;
  }

  const pushLog = (level: DbMacroLogEntry["level"], args: unknown[]) => {
    if (logs.length >= MAX_LOG_ENTRIES) return;
    const text = redact(args.map(formatLogArg).join(" "), secrets);
    logs.push({
      level,
      text,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
  };

  const tempVarsProxy = new Proxy(tempVarsStore, {
    get(targetObj, prop: string | symbol) {
      if (typeof prop === "symbol") return (targetObj as any)[prop];
      if (prop === "get") return (k: string) => targetObj[k];
      if (prop === "set" || prop === "Add") {
        return (k: string, v: unknown) => {
          targetObj[k] = v;
          return v;
        };
      }
      if (prop === "remove" || prop === "Remove") {
        return (k: string) => {
          delete targetObj[k];
        };
      }
      if (prop === "clear" || prop === "RemoveAll") {
        return () => {
          for (const k of Object.keys(targetObj)) delete targetObj[k];
        };
      }
      if (prop === "toJSON") return () => ({ ...targetObj });
      return targetObj[prop];
    },
    set(targetObj, prop: string | symbol, value: unknown) {
      if (typeof prop === "string") targetObj[prop] = value;
      return true;
    },
    deleteProperty(targetObj, prop: string | symbol) {
      if (typeof prop === "string") delete targetObj[prop];
      return true;
    },
  });

  const openedAdapters: DbAdapter[] = [];
  const openedRedisClients: CloneRedisClient[] = [];

  const createDatabaseApi = (
    epTarget: ResolvedMacroTarget,
    sqlAdapter: DbAdapter | null,
    redisClient: CloneRedisClient | null,
  ) => {
    const engine = epTarget.engine;
    const sqlEngine = (engine === "redis" ? "sqlite" : engine) as Engine;

    const assertSql = (): DbAdapter => {
      if (!sqlAdapter) {
        throw new FmError("BAD_REQUEST", `SQL operations are not available on a ${epTarget.engineLabel} connection. Use 'redis.*' commands instead.`);
      }
      return sqlAdapter;
    };

    const guardMysqlDryRunDdl = (sql: string) => {
      if (dryRun && engine === "mysql" && /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(sql)) {
        throw new FmError(
          "BAD_REQUEST",
          "MySQL implicitly commits DDL statements (CREATE/ALTER/DROP/TRUNCATE), which cannot be rolled back in Dry Run mode.",
        );
      }
    };

    const dbApi: Record<string, any> = {
      engine,
      name: epTarget.label,
      RecordsAffected: 0,

      quoteIdent(name: string) {
        return quoteIdent(sqlEngine, name);
      },

      async query(rawSql: string, bindParams: Param[] = [], label?: string) {
        const ad = assertSql();
        const interpolated = interpolateTemplate(String(rawSql ?? ""), tempVarsStore, inputParams, missingPrompts);
        if (missingPrompts.size > 0) {
          throw new FmError("PROMPT_REQUIRED", `Provide parameter value(s): ${[...missingPrompts].join(", ")}`);
        }
        const sql = adaptSqlPlaceholders(sqlEngine, interpolated, bindParams.length);
        const stepStart = performance.now();
        const res = await ad.query(sql, bindParams);
        const rows = res.rows.slice(0, MAX_RESULT_ROWS);
        const cols = res.columns.length > 0 ? res.columns.map((c: any) => (typeof c === "string" ? c : c.name)) : rows[0] ? Object.keys(rows[0]) : [];
        if (resultSets.length < 25) {
          resultSets.push({
            label: label || `Query ${resultSets.length + 1}`,
            sql: redact(sql, secrets),
            columns: cols,
            rows,
            rowCount: res.rows.length,
            truncated: res.rows.length > MAX_RESULT_ROWS,
          });
        }
        steps.push({
          index: steps.length + 1,
          action: label ? `OpenQuery (${label})` : "query",
          status: "ok",
          detail: redact(sql, secrets),
          rowCount: res.rows.length,
          elapsedMs: Math.round(performance.now() - stepStart),
        });
        return res.rows;
      },

      async execute(rawSql: string, bindParams: Param[] = [], actionLabel = "execute") {
        const ad = assertSql();
        const interpolated = interpolateTemplate(String(rawSql ?? ""), tempVarsStore, inputParams, missingPrompts);
        if (missingPrompts.size > 0) {
          throw new FmError("PROMPT_REQUIRED", `Provide parameter value(s): ${[...missingPrompts].join(", ")}`);
        }
        guardMysqlDryRunDdl(interpolated);
        const sql = adaptSqlPlaceholders(sqlEngine, interpolated, bindParams.length);
        const stepStart = performance.now();
        const res = await ad.query(sql, bindParams);
        const affected = Number(res.affectedRows ?? 0);
        dbApi.RecordsAffected = affected;
        totalAffectedRows += affected;
        steps.push({
          index: steps.length + 1,
          action: actionLabel,
          status: "ok",
          detail: redact(sql, secrets),
          affectedRows: affected,
          elapsedMs: Math.round(performance.now() - stepStart),
        });
        return { affectedRows: affected, lastInsertId: res.lastInsertId };
      },

      async scalar(rawSql: string, bindParams: Param[] = []) {
        const ad = assertSql();
        const interpolated = interpolateTemplate(String(rawSql ?? ""), tempVarsStore, inputParams, missingPrompts);
        const sql = adaptSqlPlaceholders(sqlEngine, interpolated, bindParams.length);
        const res = await ad.query(sql, bindParams);
        const firstRow = res.rows[0];
        if (!firstRow) return null;
        const rawFirst = res.columns[0] as any;
        const firstCol = (typeof rawFirst === "string" ? rawFirst : rawFirst?.name) ?? Object.keys(firstRow)[0];
        return firstCol !== undefined ? (firstRow[firstCol] ?? null) : null;
      },

      async OpenRecordset(source: string, bindParams: Param[] = []) {
        const ad = assertSql();
        const trimmed = String(source ?? "").trim();
        const isSelect = /^\s*(SELECT|WITH|PRAGMA|SHOW|EXPLAIN)\b/i.test(trimmed);
        const rawSql = isSelect ? trimmed : `SELECT * FROM ${quoteIdent(sqlEngine, trimmed)}`;
        const interpolated = interpolateTemplate(rawSql, tempVarsStore, inputParams, missingPrompts);
        const sql = adaptSqlPlaceholders(sqlEngine, interpolated, bindParams.length);
        const res = await ad.query(sql, bindParams);
        return createRecordSet(res.rows);
      },

      async tables() {
        const ad = assertSql();
        const schema = epTarget.testInput.schema || (sqlEngine === "postgres" ? "public" : undefined);
        const list = await ad.listObjects();
        return list.map((t) => ({
          name: t.name,
          schema: t.schema ?? schema ?? "main",
          kind: t.type,
        }));
      },

      async describe(tableName: string) {
        const ad = assertSql();
        const ref: ObjectRef = {
          name: tableName,
          type: "table",
          schema: epTarget.testInput.schema || (sqlEngine === "postgres" ? "public" : undefined),
        };
        const info = await ad.describeTable(ref);
        return {
          table: info.name,
          columns: info.columns,
          primaryKey: info.primaryKey,
          indexes: info.indexes,
          foreignKeys: info.foreignKeys,
        };
      },

      async insert(tableName: string, rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        if (rows.length === 0) return 0;
        let count = 0;
        for (const r of rows) {
          if (!isObject(r) || Object.keys(r).length === 0) continue;
          const cols = Object.keys(r);
          const vals = cols.map((c) => r[c] as Param);
          const colSql = cols.map((c) => quoteIdent(sqlEngine, c)).join(", ");
          const phSql = cols.map((_c, idx) => placeholder(sqlEngine, idx + 1)).join(", ");
          const sql = `INSERT INTO ${quoteIdent(sqlEngine, tableName)} (${colSql}) VALUES (${phSql})`;
          const res = await dbApi.execute(sql, vals, `InsertRecord (${tableName})`);
          count += res.affectedRows;
        }
        dbApi.RecordsAffected = count;
        return count;
      },

      async update(
        tableName: string,
        values: Record<string, unknown> | string,
        whereClause?: string,
        whereParams: Param[] = [],
      ) {
        if (typeof values === "string" && values.trim()) {
          const interpolatedSet = interpolateTemplate(values.trim(), tempVarsStore, inputParams, missingPrompts);
          let whereSql = "";
          if (whereClause && whereClause.trim()) {
            const interpolatedWhere = interpolateTemplate(whereClause.trim(), tempVarsStore, inputParams, missingPrompts);
            whereSql = ` WHERE ${adaptSqlPlaceholders(sqlEngine, interpolatedWhere, whereParams.length)}`;
          }
          const sql = `UPDATE ${quoteIdent(sqlEngine, tableName)} SET ${interpolatedSet}${whereSql}`;
          const res = await dbApi.execute(sql, whereParams, `UpdateRecord (${tableName})`);
          return res.affectedRows;
        }
        if (!isObject(values) || Object.keys(values).length === 0) {
          throw new FmError("BAD_REQUEST", "db.update requires a non-empty values object or SET clause.");
        }
        const cols = Object.keys(values);
        const setParts = cols.map((c, idx) => `${quoteIdent(sqlEngine, c)} = ${placeholder(sqlEngine, idx + 1)}`);
        const setVals = cols.map((c) => values[c] as Param);
        let whereSql = "";
        if (whereClause && whereClause.trim()) {
          const interpolatedWhere = interpolateTemplate(whereClause.trim(), tempVarsStore, inputParams, missingPrompts);
          if (sqlEngine === "postgres" && interpolatedWhere.includes("?")) {
            let pIdx = cols.length;
            whereSql = ` WHERE ${interpolatedWhere.replace(/\?/g, () => `$${++pIdx}`)}`;
          } else {
            whereSql = ` WHERE ${interpolatedWhere}`;
          }
        }
        const sql = `UPDATE ${quoteIdent(sqlEngine, tableName)} SET ${setParts.join(", ")}${whereSql}`;
        const res = await dbApi.execute(sql, [...setVals, ...whereParams], `UpdateRecord (${tableName})`);
        return res.affectedRows;
      },

      async delete(tableName: string, whereClause?: string, whereParams: Param[] = []) {
        let whereSql = "";
        if (whereClause && whereClause.trim()) {
          const interpolatedWhere = interpolateTemplate(whereClause.trim(), tempVarsStore, inputParams, missingPrompts);
          whereSql = ` WHERE ${adaptSqlPlaceholders(sqlEngine, interpolatedWhere, whereParams.length)}`;
        }
        const sql = `DELETE FROM ${quoteIdent(sqlEngine, tableName)}${whereSql}`;
        const res = await dbApi.execute(sql, whereParams, `DeleteRecord (${tableName})`);
        return res.affectedRows;
      },

      async transaction<T>(fn: (txDb: typeof dbApi) => Promise<T>): Promise<T> {
        const sp = `sp_macro_${Math.random().toString(36).slice(2, 8)}`;
        await dbApi.execute(`SAVEPOINT ${sp}`, [], "SAVEPOINT");
        try {
          const out = await fn(dbApi);
          await dbApi.execute(`RELEASE SAVEPOINT ${sp}`, [], "RELEASE SAVEPOINT");
          return out;
        } catch (err) {
          await dbApi.execute(`ROLLBACK TO SAVEPOINT ${sp}`, [], "ROLLBACK TO SAVEPOINT").catch(() => {});
          throw err;
        }
      },
    };

    // Access VBA PascalCase aliases on CurrentDb
    dbApi.Query = dbApi.query;
    dbApi.Execute = dbApi.execute;
    dbApi.openRecordset = dbApi.OpenRecordset;
    dbApi.TableDefs = dbApi.tables;

    const domainAggregate = async (
      fnName: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX" | "LOOKUP",
      expr: string,
      domain: string,
      criteria?: string,
    ) => {
      const ad = assertSql();
      const cleanDomain = String(domain ?? "").trim();
      if (!cleanDomain) throw new FmError("BAD_REQUEST", `D${fnName} requires a table or view name.`);
      const cleanExpr = String(expr ?? "*").trim() || "*";
      const fromSql = /^\s*select\b/i.test(cleanDomain)
        ? `(${cleanDomain}) AS __d`
        : quoteIdent(sqlEngine, cleanDomain);
      const wherePart =
        criteria && criteria.trim()
          ? ` WHERE ${interpolateTemplate(criteria.trim(), tempVarsStore, inputParams, missingPrompts)}`
          : "";
      if (fnName === "LOOKUP") {
        const sql = `SELECT ${cleanExpr} AS __val FROM ${fromSql}${wherePart} LIMIT 1`;
        const res = await ad.query(sql);
        return res.rows[0]?.__val ?? null;
      }
      const aggExpr = fnName === "COUNT" && cleanExpr === "*" ? "COUNT(*)" : `${fnName}(${cleanExpr})`;
      const sql = `SELECT ${aggExpr} AS __val FROM ${fromSql}${wherePart}`;
      const res = await ad.query(sql);
      const rawVal = res.rows[0]?.__val;
      if (fnName === "COUNT" || fnName === "SUM") return Number(rawVal ?? 0);
      return rawVal !== undefined && rawVal !== null ? Number(rawVal) : null;
    };

    const DCount = (expr = "*", domain: string, criteria?: string) => domainAggregate("COUNT", expr, domain, criteria);
    const DLookup = (expr: string, domain: string, criteria?: string) => domainAggregate("LOOKUP", expr, domain, criteria);
    const DSum = (expr: string, domain: string, criteria?: string) => domainAggregate("SUM", expr, domain, criteria);
    const DAvg = (expr: string, domain: string, criteria?: string) => domainAggregate("AVG", expr, domain, criteria);
    const DMin = (expr: string, domain: string, criteria?: string) => domainAggregate("MIN", expr, domain, criteria);
    const DMax = (expr: string, domain: string, criteria?: string) => domainAggregate("MAX", expr, domain, criteria);

    const MsgBox = (message: unknown, title = "Macro", type: "info" | "warning" | "error" | "success" = "info") => {
      const rawText = formatLogArg(message);
      const interpolated = redact(interpolateTemplate(rawText, tempVarsStore, inputParams, missingPrompts, true), secrets);
      const validType = type === "warning" || type === "error" || type === "success" ? type : "info";
      messages.push({
        title: redact(String(title || "Macro"), secrets),
        message: interpolated,
        type: validType,
      });
      steps.push({
        index: steps.length + 1,
        action: "MessageBox",
        status: "ok",
        detail: `${title}: ${interpolated}`,
        elapsedMs: 0,
      });
      return 1; // vbOK
    };

    const READONLY_REDIS_CMDS = new Set([
      "PING", "GET", "MGET", "HGET", "HMGET", "HGETALL", "HKEYS", "HVALS", "HLEN", "HEXISTS",
      "LLEN", "LRANGE", "LINDEX", "SCARD", "SMEMBERS", "SISMEMBER", "ZCARD", "ZRANGE", "ZSCORE",
      "TYPE", "TTL", "PTTL", "EXISTS", "SCAN", "HSCAN", "SSCAN", "ZSCAN", "DBSIZE", "INFO", "KEYS",
    ]);

    const redisApi = {
      async command(cmd: string, ...args: (string | number)[]) {
        if (!redisClient) {
          throw new FmError("BAD_REQUEST", "This connection is not a Redis server.");
        }
        const upper = String(cmd).toUpperCase().trim();
        const stepStart = performance.now();
        if (dryRun && !READONLY_REDIS_CMDS.has(upper)) {
          steps.push({
            index: steps.length + 1,
            action: `Redis ${upper}`,
            status: "ok",
            detail: redact(`[Dry Run — not executed] ${cmd} ${args.join(" ")}`.trim(), secrets),
            elapsedMs: Math.round(performance.now() - stepStart),
          });
          return "OK";
        }
        const res = await redisClient.send(upper, args.map(String));
        steps.push({
          index: steps.length + 1,
          action: `Redis ${upper}`,
          status: "ok",
          detail: redact(`${cmd} ${args.join(" ")}`.trim(), secrets),
          elapsedMs: Math.round(performance.now() - stepStart),
        });
        return res;
      },
      async get(key: string) {
        return await redisApi.command("GET", key);
      },
      async set(key: string, value: string | number, ttlSeconds?: number) {
        if (ttlSeconds && ttlSeconds > 0) {
          return await redisApi.command("SET", key, String(value), "EX", Math.trunc(ttlSeconds));
        }
        return await redisApi.command("SET", key, String(value));
      },
      async del(...keys: string[]) {
        if (keys.length === 0) return 0;
        return Number((await redisApi.command("DEL", ...keys)) ?? 0);
      },
      async keys(pattern = "*") {
        const res: any = await redisApi.command("SCAN", "0", "MATCH", pattern, "COUNT", "200");
        const arr = Array.isArray(res?.[1]) ? res[1].map(String) : Array.isArray(res) ? res.map(String) : [];
        return arr.sort();
      },
      async hgetall(key: string) {
        const raw: any = await redisApi.command("HGETALL", key);
        if (!raw) return {};
        if (Array.isArray(raw)) {
          const out: Record<string, string> = {};
          for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1] ?? "");
          return out;
        }
        return typeof raw === "object" ? raw : {};
      },
      async hset(key: string, fields: Record<string, string | number>) {
        const args: (string | number)[] = [key];
        for (const [k, v] of Object.entries(fields)) args.push(k, String(v));
        return await redisApi.command("HSET", ...args);
      },
      async incr(key: string) {
        return Number((await redisApi.command("INCR", key)) ?? 0);
      },
      async ttl(key: string) {
        return Number((await redisApi.command("TTL", key)) ?? -1);
      },
    };

    const DoCmd: Record<string, any> = {
      async RunSQL(sql: string, bindParams: Param[] = []) {
        return await dbApi.execute(sql, bindParams, "RunSQL");
      },
      async OpenQuery(sql: string, label?: string) {
        return await dbApi.query(sql, [], label || "OpenQuery");
      },
      async OpenTable(
        tableName: string,
        optionsOrWhere?: { where?: string; orderBy?: string; limit?: number } | string,
        limitArg?: number,
      ) {
        const options = typeof optionsOrWhere === "string"
          ? { where: optionsOrWhere, limit: limitArg }
          : optionsOrWhere;
        const qTable = quoteIdent(sqlEngine, tableName);
        let w = "";
        if (options?.where && options.where.trim()) {
          const interpolatedWhere = interpolateTemplate(options.where.trim(), tempVarsStore, inputParams, missingPrompts);
          if (/;|--|\/\*|#|\bUNION\b/i.test(interpolatedWhere)) {
            throw new FmError("BAD_REQUEST", "Invalid OpenTable WHERE clause: statement separators, UNION, and comments are not allowed.");
          }
          w = ` WHERE ${interpolatedWhere}`;
        }
        let o = "";
        if (options?.orderBy && options.orderBy.trim()) {
          const cleanOrder = options.orderBy.trim();
          if (/;|--|\/\*|#|\bUNION\b/i.test(cleanOrder)) {
            throw new FmError("BAD_REQUEST", "Invalid OpenTable ORDER BY clause: statement separators, UNION, and comments are not allowed.");
          }
          o = ` ORDER BY ${cleanOrder}`;
        }
        const lim =
          options?.limit && Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
            ? ` LIMIT ${Math.min(MAX_RESULT_ROWS, Math.trunc(Number(options.limit)))}`
            : ` LIMIT ${MAX_RESULT_ROWS}`;
        return await dbApi.query(`SELECT * FROM ${qTable}${w}${o}${lim}`, [], `Table: ${tableName}`);
      },
      async InsertRecord(tableName: string, values: Record<string, unknown>) {
        return await dbApi.insert(tableName, values);
      },
      async UpdateRecord(tableName: string, values: Record<string, unknown> | string, where?: string, bindParams: Param[] = []) {
        return await dbApi.update(tableName, values, where, bindParams);
      },
      async DeleteRecord(tableName: string, where?: string, bindParams: Param[] = []) {
        return await dbApi.delete(tableName, where, bindParams);
      },
      async MakeTable(selectSql: string, targetTable: string, replace = true) {
        const qTarget = quoteIdent(sqlEngine, targetTable);
        if (replace) {
          await dbApi.execute(`DROP TABLE IF EXISTS ${qTarget}`, [], `DropTable (${targetTable})`);
        }
        const interpolated = interpolateTemplate(selectSql, tempVarsStore, inputParams, missingPrompts);
        return await dbApi.execute(`CREATE TABLE ${qTarget} AS ${interpolated}`, [], `MakeTable (${targetTable})`);
      },
      async EmptyTable(tableName: string) {
        return await dbApi.delete(tableName);
      },
      async SetTempVar(name: string, value: unknown) {
        tempVarsStore[String(name)] = value;
        steps.push({
          index: steps.length + 1,
          action: "SetTempVar",
          status: "ok",
          detail: `${name} = ${ redact(formatLogArg(value), secrets) }`,
          elapsedMs: 0,
        });
        return value;
      },
      async RemoveTempVar(name: string) {
        delete tempVarsStore[String(name)];
        steps.push({
          index: steps.length + 1,
          action: "RemoveTempVar",
          status: "ok",
          detail: String(name),
          elapsedMs: 0,
        });
      },
      async RemoveAllTempVars() {
        for (const k of Object.keys(tempVarsStore)) delete tempVarsStore[k];
      },
      MessageBox: MsgBox,
      Beep() {
        beeps++;
        steps.push({
          index: steps.length + 1,
          action: "Beep",
          status: "ok",
          detail: "Beep!",
          elapsedMs: 0,
        });
      },
      SetWarnings(enabled: boolean) {
        warningsEnabled = Boolean(enabled);
      },
      Assert(condition: unknown, message = "Macro assertion failed") {
        if (!condition) {
          throw new FmError("ASSERTION_FAILED", String(message));
        }
        steps.push({
          index: steps.length + 1,
          action: "Assert",
          status: "ok",
          detail: String(message),
          elapsedMs: 0,
        });
      },
      StopMacro(reason = "Stopped by StopMacro") {
        steps.push({
          index: steps.length + 1,
          action: "StopMacro",
          status: "stopped",
          detail: String(reason),
          elapsedMs: 0,
        });
        throw new MacroStopSignal(String(reason));
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
  };

  let primarySqlAdapter: DbAdapter | null = null;
  let primaryRedisClient: CloneRedisClient | null = null;
  let committed = false;
  let rolledBack = false;
  let stoppedEarly = false;
  let returnValue: unknown = undefined;

  try {
    if (target.engine === "redis") {
      primaryRedisClient = await openMacroRedisClient(ctx, target);
      openedRedisClients.push(primaryRedisClient);
    } else {
      primarySqlAdapter = await openMacroSqlAdapter(ctx, target);
      openedAdapters.push(primarySqlAdapter);
      if (useTransaction) {
        await primarySqlAdapter.query("BEGIN", []);
      }
    }

    const primaryEnv = createDatabaseApi(target, primarySqlAdapter, primaryRedisClient);

    const connectionsApi = {
      list() {
        return dbState(ctx)
          .store.listPlain()
          .map((p) => ({
            id: p.id,
            name: p.name,
            engine: p.engine,
            environment: p.environment ?? "local",
            readOnly: p.readOnly === true,
          }));
      },
      async use(idOrName: string) {
        const st = dbState(ctx);
        const list = st.store.listPlain();
        const found = list.find((p) => p.id === idOrName || p.name.toLowerCase() === String(idOrName).toLowerCase());
        if (!found) throw new FmError("NOT_FOUND", `Saved connection '${idOrName}' was not found.`);
        const subTarget = await resolveMacroTarget(ctx, { kind: "profile", profileId: found.id });
        if (subTarget.passwordSecret) secrets.push(subTarget.passwordSecret);
        if (!dryRun && (subTarget.production || subTarget.readOnly) && req.confirmWrites !== true) {
          throw new FmError(
            "NEEDS_CONFIRM",
            `Connection '${subTarget.label}' requires confirmation before macro access.`,
            { reason: subTarget.readOnly ? "readonly" : "production", name: subTarget.label, engine: subTarget.engine },
          );
        }
        if (subTarget.engine === "redis") {
          const rc = await openMacroRedisClient(ctx, subTarget);
          openedRedisClients.push(rc);
          return createDatabaseApi(subTarget, null, rc);
        } else {
          const sa = await openMacroSqlAdapter(ctx, subTarget);
          openedAdapters.push(sa);
          if (useTransaction) {
            await sa.query("BEGIN", []);
          }
          return createDatabaseApi(subTarget, sa, null);
        }
      },
    };

    const consoleProxy = {
      log: (...args: unknown[]) => pushLog("log", args),
      info: (...args: unknown[]) => pushLog("info", args),
      warn: (...args: unknown[]) => pushLog("warn", args),
      error: (...args: unknown[]) => pushLog("error", args),
      debug: (...args: unknown[]) => pushLog("debug", args),
      table: (data: unknown) => {
        if (Array.isArray(data) && data.length > 0 && isObject(data[0])) {
          const rows = data.slice(0, MAX_RESULT_ROWS) as Record<string, WireValue>[];
          resultSets.push({
            label: `console.table (${resultSets.length + 1})`,
            columns: Object.keys(rows[0]!),
            rows,
            rowCount: data.length,
          });
        }
        pushLog("info", [data]);
      },
    };

    const DebugApi = {
      print: (...args: unknown[]) => pushLog("debug", args),
      Print: (...args: unknown[]) => pushLog("debug", args),
      Assert: (cond: unknown, msg?: string) => primaryEnv.DoCmd.Assert(cond, msg),
      assert: (cond: unknown, msg?: string) => primaryEnv.DoCmd.Assert(cond, msg),
    };

    const safeBun = {
      version: Bun.version,
      nanoseconds: () => Bun.nanoseconds(),
      sleep: (ms: number) => Bun.sleep(Math.min(Math.max(0, Number(ms) || 0), 2_000)),
      hash: (v: string | ArrayBufferView) => Bun.hash(v as any),
      inspect: (v: unknown) => Bun.inspect(v),
      escapeHTML: (s: string) => Bun.escapeHTML(s),
      deepEquals: (a: unknown, b: unknown) => Bun.deepEquals(a, b),
      randomUUIDv7: () => Bun.randomUUIDv7(),
    };

    const evaluateExpr = async (exprCode: string): Promise<unknown> => {
      const trimmed = (exprCode ?? "").trim();
      if (!trimmed) return undefined;
      if (FORBIDDEN_MACRO_CODE_RE.test(trimmed)) {
        throw new FmError("SYNTAX_ERROR", "Access to host process, filesystem, or OS process APIs is restricted inside database macros.");
      }
      const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
      const js = transpiler.transformSync(`async function __eval(__c: any) { return (${trimmed}); }`);
      const body = `${js}\nreturn await __eval(__ctx);`;
      const fn = new Function(
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
        "eval",
        "require",
        `return (async () => { ${body} })();`,
      );
      return await fn(
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
    };

    const runCodeSnippet = async (codeSource: string): Promise<unknown> => {
      const check = validateBunMacroCode(codeSource);
      if (!check.valid) {
        const first = check.errors[0]!;
        const err = new FmError("SYNTAX_ERROR", first.message, { line: first.line, column: first.column });
        throw err;
      }
      const normalized = normalizeMacroSourceForAsyncBody(codeSource);
      const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
      const jsBody = transpiler.transformSync(`async function __userMain() {\n${normalized}\n}`);
      const runnerSource = `
        const __exports = {};
        ${jsBody}
        let __res = await __userMain();
        if (__res === undefined) {
          if (typeof __exports.default === "function") __res = await __exports.default(__ctx);
          else if (typeof __exports.main === "function") __res = await __exports.main(__ctx);
        }
        return __res;
      `;
      const fn = new Function(
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
        "eval",
        "require",
        `return (async () => { ${runnerSource} })();`,
      );
      return await fn(
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
    };

    const runActionRows = async (rows: DbMacroActionRow[], depth: number): Promise<unknown> => {
      let lastResult: unknown = undefined;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        if (!row.enabled || row.action === "Comment") {
          steps.push({
            index: steps.length + 1,
            action: row.action,
            status: "skipped",
            detail: row.comment || row.params.text || "Disabled step",
            elapsedMs: 0,
          });
          continue;
        }
        if (row.condition && row.condition.trim()) {
          const condOk = Boolean(await evaluateExpr(row.condition));
          if (!condOk) {
            steps.push({
              index: steps.length + 1,
              action: row.action,
              status: "skipped",
              detail: `Condition false: ${row.condition}`,
              elapsedMs: 0,
            });
            continue;
          }
        }

        const p = row.params;
        switch (row.action) {
          case "RunSQL":
            lastResult = await primaryEnv.DoCmd.RunSQL(p.sql ?? "");
            break;
          case "OpenQuery":
            lastResult = await primaryEnv.DoCmd.OpenQuery(p.sql ?? "", p.label);
            break;
          case "OpenTable":
            lastResult = await primaryEnv.DoCmd.OpenTable(p.table ?? "", {
              where: p.where,
              orderBy: p.orderBy,
              limit: p.limit ? Number(p.limit) : undefined,
            });
            break;
          case "InsertRecord": {
            const rawVals = (p.values ?? "{}").trim();
            let parsed: Record<string, unknown>;
            try {
              const obj = JSON.parse(rawVals);
              parsed = isObject(obj)
                ? Object.fromEntries(
                    Object.entries(obj).map(([k, v]) => [
                      k,
                      typeof v === "string" ? interpolateTemplate(v, tempVarsStore, inputParams, missingPrompts) : v,
                    ]),
                  )
                : {};
            } catch {
              parsed = JSON.parse(interpolateTemplate(rawVals, tempVarsStore, inputParams, missingPrompts));
            }
            lastResult = await primaryEnv.DoCmd.InsertRecord(p.table ?? "", parsed);
            break;
          }
          case "UpdateRecord": {
            const rawVals = (p.values ?? "{}").trim();
            let parsed: Record<string, unknown> | string;
            if (rawVals.startsWith("{")) {
              try {
                const obj = JSON.parse(rawVals);
                parsed = isObject(obj)
                  ? Object.fromEntries(
                      Object.entries(obj).map(([k, v]) => [
                        k,
                        typeof v === "string" ? interpolateTemplate(v, tempVarsStore, inputParams, missingPrompts) : v,
                      ]),
                    )
                  : rawVals;
              } catch {
                parsed = JSON.parse(interpolateTemplate(rawVals, tempVarsStore, inputParams, missingPrompts));
              }
            } else {
              parsed = rawVals;
            }
            lastResult = await primaryEnv.DoCmd.UpdateRecord(p.table ?? "", parsed, p.where ?? "");
            break;
          }
          case "DeleteRecord":
            lastResult = await primaryEnv.DoCmd.DeleteRecord(p.table ?? "", p.where ?? "");
            break;
          case "MakeTable":
            lastResult = await primaryEnv.DoCmd.MakeTable(p.sql ?? "", p.targetTable ?? "", p.replace !== "false");
            break;
          case "EmptyTable":
            lastResult = await primaryEnv.DoCmd.EmptyTable(p.table ?? "");
            break;
          case "SetTempVar": {
            const val = await evaluateExpr(p.expression ?? '""');
            lastResult = await primaryEnv.DoCmd.SetTempVar(p.name ?? "var", val);
            break;
          }
          case "RemoveTempVar":
            await primaryEnv.DoCmd.RemoveTempVar(p.name ?? "");
            break;
          case "MessageBox":
            lastResult = primaryEnv.MsgBox(p.message ?? "", p.title || "Macro", (p.type as any) || "info");
            break;
          case "Beep":
            primaryEnv.DoCmd.Beep();
            break;
          case "RunCode":
            lastResult = await runCodeSnippet(p.code ?? "");
            break;
          case "RunMacro":
            lastResult = await primaryEnv.DoCmd.RunMacro(p.macroName ?? "", {}, depth + 1);
            break;
          case "Assert": {
            const ok = Boolean(await evaluateExpr(p.expression ?? "true"));
            primaryEnv.DoCmd.Assert(ok, p.message || `Assertion failed: ${p.expression}`);
            break;
          }
          case "StopMacro":
            primaryEnv.DoCmd.StopMacro(p.reason || "Stopped by StopMacro");
            break;
        }
      }
      return lastResult;
    };

    primaryEnv.DoCmd.RunCode = async (codeOrExpr: string) => {
      const stepStart = performance.now();
      const out = await runCodeSnippet(String(codeOrExpr ?? ""));
      steps.push({
        index: steps.length + 1,
        action: "RunCode",
        status: "ok",
        detail: redact(String(codeOrExpr ?? "").split("\n")[0]?.slice(0, 120) || "RunCode", secrets),
        elapsedMs: Math.round(performance.now() - stepStart),
      });
      return out;
    };

    primaryEnv.DoCmd.RunMacro = async (
      macroNameOrId: string,
      overrideParams: Record<string, unknown> = {},
      depth = 1,
    ) => {
      if (depth > MAX_MACRO_DEPTH) {
        throw new FmError("BAD_REQUEST", `Maximum macro nesting depth (${MAX_MACRO_DEPTH}) exceeded.`);
      }
      const sub = allMacros.find(
        (m) => m.id === macroNameOrId || m.name.toLowerCase() === String(macroNameOrId).toLowerCase(),
      );
      if (!sub) throw new FmError("NOT_FOUND", `Nested macro '${macroNameOrId}' was not found.`);
      Object.assign(inputParams, overrideParams);
      if (sub.mode === "actions") {
        return await runActionRows(sub.actions, depth);
      }
      return await runCodeSnippet(sub.code);
    };

    const runtimeCtx = {
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
    };

    const execPromise = (async () => {
      if (macro.mode === "actions") {
        return await runActionRows(macro.actions, 1);
      }
      return await runCodeSnippet(macro.code);
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new FmError("TIMEOUT", `Macro execution timed out after ${macro.timeoutMs} ms.`));
      }, macro.timeoutMs);
    });

    try {
      returnValue = await Promise.race([execPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }

    // If the macro returned an array of row objects, surface it as a result set automatically
    if (Array.isArray(returnValue) && returnValue.length > 0 && isObject(returnValue[0])) {
      const rows = returnValue.slice(0, MAX_RESULT_ROWS) as Record<string, WireValue>[];
      resultSets.push({
        label: "Return Value",
        columns: Object.keys(rows[0]!),
        rows,
        rowCount: returnValue.length,
        truncated: returnValue.length > MAX_RESULT_ROWS,
      });
    }

    if (openedAdapters.length > 0 && useTransaction) {
      if (dryRun) {
        for (const ad of openedAdapters) {
          await ad.query("ROLLBACK", []).catch(() => {});
        }
        rolledBack = true;
      } else {
        for (const ad of openedAdapters) {
          await ad.query("COMMIT", []);
        }
        committed = true;
      }
    } else if (!dryRun) {
      committed = true;
    }
  } catch (err) {
    if (err instanceof MacroStopSignal) {
      stoppedEarly = true;
      if (openedAdapters.length > 0 && useTransaction) {
        if (dryRun) {
          for (const ad of openedAdapters) {
            await ad.query("ROLLBACK", []).catch(() => {});
          }
          rolledBack = true;
        } else {
          for (const ad of openedAdapters) {
            await ad.query("COMMIT", []).catch(() => {});
          }
          committed = true;
        }
      }
    } else {
      if (openedAdapters.length > 0 && useTransaction) {
        for (const ad of openedAdapters) {
          await ad.query("ROLLBACK", []).catch(() => {});
        }
        rolledBack = true;
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      const safeMsg = redact(rawMsg, secrets);
      const details = err instanceof FmError && isObject(err.details) ? err.details : {};
      return {
        ok: false,
        status: "failed",
        macroName: macro.name,
        mode: macro.mode,
        target: {
          kind: target.kind,
          engine: target.engine,
          engineLabel: target.engineLabel,
          label: target.label,
          production: target.production,
          readOnly: target.readOnly,
        },
        transaction: useTransaction,
        dryRun,
        committed: false,
        rolledBack,
        affectedRows: totalAffectedRows,
        elapsedMs: Math.round(performance.now() - startedAt),
        returnValue: undefined,
        logs,
        messages,
        beeps,
        steps,
        resultSets,
        tempVars: JSON.parse( redact(JSON.stringify(tempVarsStore), secrets) ),
        ...(missingPrompts.size > 0 ? { promptsRequired: [...missingPrompts] } : {}),
        error: {
          message: safeMsg,
          ...(typeof details.line === "number" ? { line: details.line } : {}),
          ...(typeof details.column === "number" ? { column: details.column } : {}),
        },
      };
    }
  } finally {
    for (const ad of openedAdapters) {
      await ad.close().catch(() => {});
    }
    for (const rc of openedRedisClients) {
      try {
        rc.close();
      } catch {}
    }
  }

  let safeReturn: unknown = returnValue;
  try {
    if (returnValue !== undefined) {
      safeReturn = JSON.parse(redact(JSON.stringify(returnValue), secrets));
    }
  } catch {
    safeReturn = redact(String(returnValue), secrets);
  }

  return {
    ok: true,
    status: dryRun ? "rolled_back" : stoppedEarly ? "stopped" : "completed",
    macroName: macro.name,
    mode: macro.mode,
    target: {
      kind: target.kind,
      engine: target.engine,
      engineLabel: target.engineLabel,
      label: target.label,
      production: target.production,
      readOnly: target.readOnly,
    },
    transaction: useTransaction,
    dryRun,
    committed,
    rolledBack,
    affectedRows: totalAffectedRows,
    elapsedMs: Math.round(performance.now() - startedAt),
    returnValue: safeReturn,
    logs,
    messages,
    beeps,
    steps,
    resultSets,
    tempVars: JSON.parse(redact(JSON.stringify(tempVarsStore), secrets)),
  };
}

export const macroOperations: Record<string, FmHandler> = {
  async "db/macros/list"(ctx) {
    const macros = loadMacros(ctx);
    return {
      macros,
      catalog: FM_MACRO_ACTION_CATALOG,
      bunVersion: Bun.version,
    };
  },

  async "db/macros/save"(ctx, b) {
    const macros = loadMacros(ctx);
    const rawMacro = isObject(b.macro) ? b.macro : b;
    const id = typeof rawMacro.id === "string" ? rawMacro.id.trim() : undefined;
    const existingIdx = id ? macros.findIndex((m) => m.id === id) : -1;
    const existing = existingIdx >= 0 ? macros[existingIdx] : undefined;
    const saved = sanitizeMacroInput(rawMacro, existing);

    if (saved.mode === "code") {
      const check = validateBunMacroCode(saved.code);
      if (!check.valid) {
        const first = check.errors[0]!;
        throw new FmError("BAD_REQUEST", `Syntax error in Bun JS macro: ${first.message}`, first);
      }
    } else {
      const check = validateMacroActions(saved.actions);
      if (!check.valid) {
        const first = check.errors[0]!;
        throw new FmError("BAD_REQUEST", first.message, first);
      }
    }

    if (existingIdx >= 0) {
      macros[existingIdx] = saved;
    } else {
      macros.push(saved);
    }
    saveMacrosFile(ctx, macros);
    return { macro: saved, macros };
  },

  async "db/macros/delete"(ctx, b) {
    const id = typeof b.id === "string" ? b.id.trim() : "";
    if (!id) throw new FmError("BAD_REQUEST", "Choose a macro to delete.");
    const macros = loadMacros(ctx);
    const idx = macros.findIndex((m) => m.id === id);
    if (idx < 0) throw new FmError("NOT_FOUND", "That macro no longer exists.");
    macros.splice(idx, 1);
    saveMacrosFile(ctx, macros);
    return { removed: id, deleted: true, macros };
  },

  async "db/macros/duplicate"(ctx, b) {
    const id = typeof b.id === "string" ? b.id.trim() : "";
    const macros = loadMacros(ctx);
    const orig = macros.find((m) => m.id === id);
    if (!orig) throw new FmError("NOT_FOUND", "That macro no longer exists.");
    const copy = sanitizeMacroInput({
      ...orig,
      id: `macro-${crypto.randomUUID().slice(0, 8)}`,
      name: `${orig.name} (Copy)`,
      builtin: false,
    });
    delete copy.builtin;
    macros.push(copy);
    saveMacrosFile(ctx, macros);
    return { macro: copy, macros };
  },

  async "db/macros/validate"(ctx, b) {
    const src = isObject(b.macro) ? b.macro : b;
    const mode: DbMacroMode = src.mode === "actions" ? "actions" : "code";
    const knownNames = loadMacros(ctx).map((m) => m.name);
    const res =
      mode === "actions"
        ? validateMacroActions(Array.isArray(src.actions) ? src.actions.map((r, i) => sanitizeActionRow(r, i)) : [], knownNames)
        : validateBunMacroCode(typeof src.code === "string" ? src.code : "");
    const issues = [
      ...res.errors.map((e) => ({ severity: "error" as const, message: e.message, line: e.line, column: e.column })),
      ...res.warnings.map((w) => ({ severity: "warning" as const, message: w })),
    ];
    return { ...res, issues };
  },

  async "db/macros/convert"(_ctx, b) {
    const src = isObject(b.macro) ? b.macro : b;
    const name = typeof src.name === "string" && src.name.trim() ? src.name.trim() : "Converted Macro";
    const actions = Array.isArray(src.actions) ? src.actions.map((r, i) => sanitizeActionRow(r, i)) : [];
    const code = macroActionsToBunJs(name, actions);
    return { code };
  },

  async "db/macros/export"(ctx, b) {
    const format = b.format === "vba" || b.format === "sql" || b.format === "json" ? b.format : "bun";
    let macro: DbMacro;
    if (typeof b.id === "string" && !b.macro) {
      const found = loadMacros(ctx).find((m) => m.id === b.id);
      if (!found) throw new FmError("NOT_FOUND", "That macro no longer exists.");
      macro = found;
    } else {
      macro = sanitizeMacroInput(isObject(b.macro) ? b.macro : b);
    }
    return exportMacroArtifact(macro, format);
  },

  async "db/macros/run"(ctx, b) {
    return await executeDbMacro(ctx, {
      macro: b.macro,
      macroId: typeof b.macroId === "string" ? b.macroId : undefined,
      target: b.target,
      params: isObject(b.params) ? b.params : undefined,
      dryRun: b.dryRun === true,
      transaction: typeof b.transaction === "boolean" ? b.transaction : undefined,
      confirmWrites: b.confirmWrites === true,
    });
  },
};
