// @ts-nocheck
/**
 * ⚡ Bun RAD Studio - SQLite Studio Pro Microsoft Access Macro Automation Engine
 * 
 * Complete Microsoft Access-style Macro subsystem for SQLite Studio Pro.
 * Provides:
 *   - Visual Macro Designer & Action Matrix with step reordering (▲/▼)
 *   - Microsoft Access Action Catalog (Database Objects, Data Operations, System, Flow & Logic)
 *   - Conditional action execution (`If [condition]`)
 *   - Iconic Access Single Step Debugger (Step ▶, Continue ⏩, Halt ⏹️)
 *   - Access Message Box dialogs with Web Audio synthesized chimes
 *   - AutoExec macro support on database load/connect
 *   - Object Tree integration in left navigation pane
 *   - Database-backed persistence in `_studio_macros` table
 *   - Macro templates, presets, JSON import/export, and server execution engine
 */

export interface MacroAction {
  id: string;
  action: string;
  condition?: string;
  enabled?: boolean;
  /** Access "OnError Next": keep going if this step fails. */
  continueOnError?: boolean;
  parameters: Record<string, any>;
  comment?: string;
}

export interface MacroDefinition {
  id: string;
  name: string;
  description: string;
  isAutoExec?: boolean;
  /** Default failure policy for steps (Access stops on error). */
  onError?: "stop" | "continue";
  actions: MacroAction[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MacroStepExecutionLog {
  stepIndex: number;
  actionId: string;
  action: string;
  condition?: string;
  conditionMet: boolean;
  parameters: Record<string, any>;
  status: "success" | "skipped" | "error";
  message?: string;
  output?: any;
  latencyMs: number;
}

export interface MacroExecutionResult {
  success: boolean;
  macroName: string;
  totalSteps: number;
  executedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  totalLatencyMs: number;
  logs: MacroStepExecutionLog[];
  error?: string;
  variables?: Record<string, any>;
  halted?: boolean;
  committed?: boolean;
  rolledBack?: boolean;
  dryRun?: boolean;
}

export interface SavedQueryDefinition {
  id: string;
  name: string;
  description?: string;
  sql: string;
  designerStateJson?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_SAMPLE_QUERIES: SavedQueryDefinition[] = [
  {
    id: "query_vip_customers",
    name: "VIP_Customers_High_Balance",
    description: "Access Query: Filter VIP tier customers with balance over 1000",
    sql: 'SELECT id, name, email, balance, tier FROM customers WHERE balance > 1000 ORDER BY balance DESC;',
  },
  {
    id: "query_low_stock_alerts",
    name: "Low_Stock_Restock_Alerts",
    description: "Access Restock Query: Products with inventory below 50 units",
    sql: 'SELECT id, name, category, stock, price FROM products WHERE stock < 50 ORDER BY stock ASC;',
  },
  {
    id: "query_top_spenders",
    name: "Top_Spenders_By_Revenue",
    description: "Access Relational Query: Customers aggregated order revenue",
    sql: 'SELECT c.id, c.name, COUNT(o.id) AS order_count, SUM(o.total_amount) AS total_spent FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.id, c.name ORDER BY total_spent DESC LIMIT 25;',
  }
];

export function createDefaultQueries(d: MacroDialect = "sqlite"): SavedQueryDefinition[] {
  return JSON.parse(JSON.stringify(DEFAULT_SAMPLE_QUERIES));
}

// -------------------------------------------------------------------------------------------------
// SQL Action Query Builders (Append, Update, Delete, MakeTable, EmptyTable)
// -------------------------------------------------------------------------------------------------

export type MacroDialect = "sqlite" | "mysql" | "postgres";

export function quoteIdentFor(d: MacroDialect, name: string): string {
  return d === "mysql" ? "`" + name.replace(/`/g, "``") + "`" : '"' + name.replace(/"/g, '""') + '"';
}

export function quoteStringFor(d: MacroDialect, value: any): string {
  let v = String(value);
  if (d === "mysql") v = v.replace(/\\/g, "\\\\");
  return "'" + v.replace(/'/g, "''") + "'";
}

export function parseRecordFieldsToInsertSql(tableName: string, fieldsInput: any, d: MacroDialect = "sqlite"): string {
  let obj: Record<string, any> = {};
  if (typeof fieldsInput === "object" && fieldsInput !== null) {
    obj = fieldsInput;
  } else if (typeof fieldsInput === "string") {
    const trimmed = fieldsInput.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        obj = JSON.parse(trimmed);
      } catch {}
    }
    if (Object.keys(obj).length === 0) {
      const parts = trimmed.split(/,(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/);
      for (const part of parts) {
        const eqIdx = part.search(/[:=]/);
        if (eqIdx !== -1) {
          const key = part.slice(0, eqIdx).trim().replace(/^['"`\[]|['"`\]]$/g, "");
          const rawVal = part.slice(eqIdx + 1).trim();
          let val: any = rawVal;
          if ((rawVal.startsWith("'") && rawVal.endsWith("'")) || (rawVal.startsWith('"') && rawVal.endsWith('"'))) {
            val = rawVal.slice(1, -1);
          } else if (!isNaN(Number(rawVal)) && rawVal !== "") {
            val = Number(rawVal);
          } else if (rawVal.toLowerCase() === "true") val = 1;
          else if (rawVal.toLowerCase() === "false") val = 0;
          else if (rawVal.toLowerCase() === "null") val = null;
          if (key) obj[key] = val;
        }
      }
    }
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) {
    throw new Error("No fields provided for InsertRecord");
  }

  const colNames = keys.map(k => quoteIdentFor(d, k)).join(", ");
  const colVals = keys.map(k => {
    const v = obj[k];
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    return quoteStringFor(d, v);
  }).join(", ");

  return `INSERT INTO ${quoteIdentFor(d, tableName)} (${colNames}) VALUES (${colVals});`;
}

export function buildUpdateRecordSql(tableName: string, setValues: string, whereCondition?: string, d: MacroDialect = "sqlite"): string {
  const table = quoteIdentFor(d, tableName);
  let sql = `UPDATE ${table} SET ${setValues}`;
  if (whereCondition && whereCondition.trim()) {
    sql += ` WHERE ${whereCondition.trim()}`;
  }
  return sql + ";";
}

export function buildDeleteRecordSql(tableName: string, whereCondition?: string, d: MacroDialect = "sqlite"): string {
  const table = quoteIdentFor(d, tableName);
  let sql = `DELETE FROM ${table}`;
  if (whereCondition && whereCondition.trim()) {
    sql += ` WHERE ${whereCondition.trim()}`;
  }
  return sql + ";";
}

/** Individual statements, for drivers that cannot run several statements in one call. */
export function buildMakeTableStatements(newTableName: string, selectSql: string, dropExisting = true, d: MacroDialect = "sqlite"): string[] {
  const table = quoteIdentFor(d, newTableName);
  let cleanSelect = selectSql.trim();
  if (cleanSelect.endsWith(";")) cleanSelect = cleanSelect.slice(0, -1);
  const stmts = [`CREATE TABLE ${table} AS ${cleanSelect};`];
  if (dropExisting) stmts.unshift(`DROP TABLE IF EXISTS ${table};`);
  return stmts;
}

export function buildMakeTableSql(newTableName: string, selectSql: string, dropExisting = true, d: MacroDialect = "sqlite"): string {
  return buildMakeTableStatements(newTableName, selectSql, dropExisting, d).join(" ");
}

export function buildEmptyTableSql(tableName: string, d: MacroDialect = "sqlite"): string {
  return `DELETE FROM ${quoteIdentFor(d, tableName)};`;
}

// -------------------------------------------------------------------------------------------------
// Access-style Parameter Prompts: `[Enter Start Date]` inside SQL
// (Only brackets beginning with "Enter " are treated as prompts, so SQLite's own [identifier]
// quoting keeps working.) These helpers are injected verbatim into the browser script.
// -------------------------------------------------------------------------------------------------

export function extractPromptParams(sql: string): string[] {
  const found: string[] = [];
  if (!sql) return found;
  const re = /\[(Enter [^\[\]\r\n]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    if (!found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

export function applyPromptParams(sql: string, values: Record<string, any>, escapeBackslash: boolean = false): string {
  return sql.replace(/\[(Enter [^\[\]\r\n]+)\]/gi, (whole, name) => {
    if (!values || !(name in values)) return whole;
    const v = values[name];
    if (v === null || v === undefined || v === "") return "NULL";
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    const s = String(v).trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) return s;
    let lit = String(v);
    if (escapeBackslash) lit = lit.replace(/\\/g, "\\\\");
    return "'" + lit.replace(/'/g, "''") + "'";
  });
}

// -------------------------------------------------------------------------------------------------
// Macro validation & export (SQL script / VBA module)
// -------------------------------------------------------------------------------------------------

export interface MacroValidationIssue {
  stepIndex: number;
  severity: "error" | "warning";
  message: string;
}

const REQUIRED_MACRO_PARAMS: Record<string, string[][]> = {
  InsertRecord: [["table", "tableName", "targetTable"], ["fields", "record", "values"]],
  UpdateRecord: [["table", "tableName", "targetTable"], ["setValues", "set", "updates"]],
  DeleteRecord: [["table", "tableName", "targetTable"]],
  EmptyTable: [["table", "tableName", "targetTable"]],
  MakeTable: [["newTable", "newTableName", "tableName", "table"], ["selectSql", "sourceSql", "sql", "queryName"]],
  RunSQL: [["sql"]],
  RunMacro: [["macroName"]],
};

export function validateMacro(macro: MacroDefinition, knownMacroNames: string[] = []): MacroValidationIssue[] {
  const issues: MacroValidationIssue[] = [];
  const actions = Array.isArray(macro?.actions) ? macro.actions : [];
  if (!macro?.name || !String(macro.name).trim()) {
    issues.push({ stepIndex: 0, severity: "error", message: "Macro has no name" });
  }
  actions.forEach((act, i) => {
    if (act.enabled === false) return;
    const p = act.parameters || {};
    for (const alternatives of REQUIRED_MACRO_PARAMS[act.action] || []) {
      if (!alternatives.some((k) => p[k] !== undefined && String(p[k]).trim() !== "")) {
        issues.push({ stepIndex: i + 1, severity: "error", message: `${act.action} requires '${alternatives[0]}'` });
      }
    }
    if (act.action === "OpenQuery" && !String(p.sql || "").trim() && !String(p.queryName || "").trim()) {
      issues.push({ stepIndex: i + 1, severity: "error", message: "OpenQuery requires 'sql' or 'queryName'" });
    }
    if ((act.action === "UpdateRecord" || act.action === "DeleteRecord") && !String(p.whereCondition ?? p.where ?? p.condition ?? "").trim()) {
      issues.push({ stepIndex: i + 1, severity: "warning", message: `${act.action} has no WHERE condition and will affect every row` });
    }
    if (act.action === "RunMacro" && p.macroName && knownMacroNames.length && !knownMacroNames.includes(p.macroName)) {
      issues.push({ stepIndex: i + 1, severity: "error", message: `RunMacro target '${p.macroName}' does not exist` });
    }
  });
  return issues;
}

function stepToSql(act: MacroAction, queries: SavedQueryDefinition[], d: MacroDialect = "sqlite"): string | null {
  const p = act.parameters || {};
  const tbl = p.table || p.tableName || p.targetTable;
  const findQuerySql = () => {
    if (!p.queryName) return undefined;
    return queries.find((q) => q.name.toLowerCase() === String(p.queryName).toLowerCase() || q.id === p.queryName)?.sql;
  };
  switch (act.action) {
    case "RunSQL":
      return p.sql ? String(p.sql).trim() : null;
    case "OpenQuery": {
      const sql = findQuerySql() || p.sql;
      return sql ? String(sql).trim() : null;
    }
    case "InsertRecord":
      return tbl ? parseRecordFieldsToInsertSql(tbl, p.fields || p.record || p.values, d) : null;
    case "UpdateRecord":
      return tbl ? buildUpdateRecordSql(tbl, p.setValues || p.set || p.updates, p.whereCondition || p.where || p.condition, d) : null;
    case "DeleteRecord":
      return tbl ? buildDeleteRecordSql(tbl, p.whereCondition || p.where || p.condition, d) : null;
    case "EmptyTable":
      return tbl ? buildEmptyTableSql(tbl, d) : null;
    case "MakeTable": {
      const name = p.newTable || p.newTableName || p.tableName || p.table;
      const sel = findQuerySql() || p.selectSql || p.sourceSql || p.sql;
      return name && sel ? buildMakeTableSql(name, sel, p.dropExisting !== false, d) : null;
    }
    case "VacuumDatabase":
      return d === "mysql" ? null : "VACUUM;";
    default:
      return null;
  }
}

/** Serializes a macro into a plain SQL script (data-changing steps wrapped in one transaction). */
export function macroToSqlScript(macro: MacroDefinition, queries: SavedQueryDefinition[] = [], d: MacroDialect = "sqlite"): string {
  const lines: string[] = [`-- Macro: ${macro.name}`];
  if (macro.description) lines.push(`-- ${String(macro.description).replace(/\r?\n/g, " ")}`);
  lines.push("", d === "mysql" ? "START TRANSACTION;" : d === "postgres" ? "BEGIN;" : "BEGIN TRANSACTION;", "");
  if (d === "mysql") lines.push("-- NOTE: MySQL commits implicitly before DDL (CREATE/DROP/ALTER/TRUNCATE), so those steps cannot be rolled back.", "");
  const trailing: string[] = [];
  (macro.actions || []).forEach((act, i) => {
    const label = `-- Step ${i + 1}: ${act.action}${act.enabled === false ? " (disabled)" : ""}${act.condition ? ` [If ${act.condition}]` : ""}`;
    if (act.action === "Comment") {
      lines.push(`-- ${String((act.parameters || {}).comment || "").replace(/\r?\n/g, " ")}`, "");
      return;
    }
    const sql = stepToSql(act, queries, d);
    if (sql === null) {
      lines.push(label, `-- (UI-only action, no SQL equivalent)`, "");
      return;
    }
    const prefix = act.enabled === false ? "-- " : "";
    const body = sql.endsWith(";") ? sql : sql + ";";
    if (act.action === "VacuumDatabase" && d !== "mysql") {
      trailing.push(label, prefix + body, "");
      return;
    }
    lines.push(label, ...body.split("\n").map((l) => prefix + l), "");
  });
  lines.push("COMMIT;", "");
  if (trailing.length) lines.push(`-- VACUUM cannot run inside a transaction`, ...trailing);
  return lines.join("\n");
}

/** Serializes a macro into an Access-flavoured VBA Sub that mirrors the DoCmd calls. */
export function macroToVba(macro: MacroDefinition, queries: SavedQueryDefinition[] = [], d: MacroDialect = "sqlite"): string {
  const vbaStr = (s: any) => '"' + String(s ?? "").replace(/"/g, '""').replace(/\r?\n/g, '" & vbCrLf & "') + '"';
  const subName = String(macro.name || "Macro").replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");
  const out: string[] = [`Option Compare Database`, `Option Explicit`, ``, `Public Sub ${subName}()`, `    On Error GoTo ErrHandler`];
  (macro.actions || []).forEach((act, i) => {
    if (act.enabled === false) return;
    const p = act.parameters || {};
    const body: string[] = [];
    switch (act.action) {
      case "Comment":
        body.push(`' ${String(p.comment || "").replace(/\r?\n/g, " ")}`);
        break;
      case "OpenTable":
        body.push(`DoCmd.OpenTable ${vbaStr(p.table)}`);
        break;
      case "OpenQuery":
        if (p.queryName) body.push(`DoCmd.OpenQuery ${vbaStr(p.queryName)}`);
        else body.push(`DoCmd.RunSQL ${vbaStr(p.sql)}`);
        break;
      case "OpenReport":
        body.push(`DoCmd.OpenReport ${vbaStr(p.table || p.report)}, acViewPreview`);
        break;
      case "MessageBox":
        body.push(`MsgBox ${vbaStr(p.message)}, vbInformation, ${vbaStr(p.title)}`);
        break;
      case "Beep":
        body.push(`Beep`);
        break;
      case "SetWarnings":
        body.push(`DoCmd.SetWarnings ${p.warningsOn ? "True" : "False"}`);
        break;
      case "StopMacro":
        body.push(`Exit Sub`);
        break;
      case "RunMacro":
        body.push(`Call ${String(p.macroName || "").replace(/[^A-Za-z0-9_]/g, "_")}`);
        break;
      default: {
        const sql = stepToSql(act, queries, d);
        if (sql !== null) body.push(`DoCmd.RunSQL ${vbaStr(sql)}`);
        else body.push(`' ${act.action}: no direct VBA equivalent`);
      }
    }
    out.push(`    ' Step ${i + 1}: ${act.action}`);
    if (act.condition) {
      out.push(`    If ${act.condition.replace(/\[([A-Za-z0-9_]+)\]/g, "$1")} Then`);
      body.forEach((l) => out.push(`        ${l}`));
      out.push(`    End If`);
    } else {
      body.forEach((l) => out.push(`    ${l}`));
    }
  });
  out.push(`    Exit Sub`, `ErrHandler:`, `    MsgBox "Macro ${subName} failed: " & Err.Description, vbCritical`, `End Sub`, ``);
  return out.join("\n");
}

export const DEFAULT_SAMPLE_MACROS: MacroDefinition[] = [
  {
    id: "macro_autoexec",
    name: "AutoExec",
    description: "Microsoft Access Startup Macro: Welcomes user, switches to customers table, and applies active filter",
    isAutoExec: true,
    actions: [
      {
        id: "step_1",
        action: "Comment",
        enabled: true,
        parameters: { comment: "Microsoft Access Startup Routine - AutoExec" }
      },
      {
        id: "step_2",
        action: "MessageBox",
        enabled: true,
        parameters: {
          message: "Welcome to SQLite Studio Pro! Microsoft Access Macro Automation is active.",
          title: "SQLite Studio Pro",
          type: "information",
          beep: true
        }
      },
      {
        id: "step_3",
        action: "OpenTable",
        enabled: true,
        parameters: { table: "customers", view: "datasheet", dataMode: "edit" }
      },
      {
        id: "step_4",
        action: "ApplyFilter",
        enabled: true,
        condition: "[totalRows] > 0",
        parameters: { condition: "balance > 500" }
      },
      {
        id: "step_5",
        action: "Requery",
        enabled: true,
        parameters: { target: "active" }
      }
    ]
  },
  {
    id: "macro_vip_report",
    name: "VIP_Customer_Report",
    description: "Filter VIP Tier Customers and Launch Access Publication Report",
    isAutoExec: false,
    actions: [
      {
        id: "step_1",
        action: "Comment",
        enabled: true,
        parameters: { comment: "Extract high-tier customer records and open printable report" }
      },
      {
        id: "step_2",
        action: "OpenTable",
        enabled: true,
        parameters: { table: "customers", view: "datasheet", dataMode: "readOnly" }
      },
      {
        id: "step_3",
        action: "ApplyFilter",
        enabled: true,
        parameters: { condition: "tier = 'VIP'" }
      },
      {
        id: "step_4",
        action: "OpenReport",
        enabled: true,
        parameters: { table: "customers", title: "VIP Tier Accounts Publication Report" }
      },
      {
        id: "step_5",
        action: "MessageBox",
        enabled: true,
        parameters: {
          message: "VIP Customer publication report generated successfully!",
          title: "Report Ready",
          type: "success",
          beep: true
        }
      }
    ]
  },
  {
    id: "macro_maintenance",
    name: "Database_Maintenance_Routine",
    description: "Automated Maintenance: Log audit entry, VACUUM database, run PRAGMA optimize, and create SQL backup dump",
    isAutoExec: false,
    actions: [
      {
        id: "step_1",
        action: "Comment",
        enabled: true,
        parameters: { comment: "System Maintenance & Backup Automation Routine" }
      },
      {
        id: "step_2",
        action: "RunSQL",
        enabled: true,
        parameters: {
          sql: "INSERT INTO audit_logs (action, entity, details) VALUES ('MACRO_MAINTENANCE', 'SYSTEM', 'Macro execution of automated database maintenance');"
        }
      },
      {
        id: "step_3",
        action: "VacuumDatabase",
        enabled: true,
        parameters: { analyze: true }
      },
      {
        id: "step_4",
        action: "BackupDatabase",
        enabled: true,
        parameters: { mode: "full" }
      },
      {
        id: "step_5",
        action: "Beep",
        enabled: true,
        parameters: { count: 2, frequency: 900 }
      },
      {
        id: "step_6",
        action: "MessageBox",
        enabled: true,
        parameters: {
          message: "Routine maintenance completed! Database vacuumed, optimized, and backed up.",
          title: "Maintenance Complete",
          type: "information",
          beep: true
        }
      }
    ]
  },
  {
    id: "macro_batch_update",
    name: "Batch_Order_Status_Update",
    description: "Batch update pending high-value orders to processing and refresh view",
    isAutoExec: false,
    actions: [
      {
        id: "step_1",
        action: "Comment",
        enabled: true,
        parameters: { comment: "Promote pending orders above threshold to processing" }
      },
      {
        id: "step_2",
        action: "SetVariable",
        enabled: true,
        parameters: { name: "minOrderValue", expression: "100.0" }
      },
      {
        id: "step_3",
        action: "RunSQL",
        enabled: true,
        parameters: {
          sql: "UPDATE orders SET status = 'processing' WHERE status = 'pending' AND total_amount > 100;"
        }
      },
      {
        id: "step_4",
        action: "Requery",
        enabled: true,
        parameters: { target: "all" }
      },
      {
        id: "step_5",
        action: "MessageBox",
        enabled: true,
        parameters: {
          message: "Pending orders over $100 updated to processing!",
          title: "Batch Update",
          type: "information",
          beep: false
        }
      }
    ]
  },
  {
    id: "macro_crud_pipeline",
    name: "Customer_CRUD_Pipeline",
    description: "Demonstrates Microsoft Access Action Queries: InsertRecord, UpdateRecord, MakeTable archive, GoToRecord, and OpenQuery",
    isAutoExec: false,
    actions: [
      {
        id: "step_1",
        action: "Comment",
        enabled: true,
        parameters: { comment: "Microsoft Access Visual CRUD & Action Query Pipeline" }
      },
      {
        id: "step_2",
        action: "InsertRecord",
        enabled: true,
        parameters: {
          table: "customers",
          fields: 'name: "Apex Innovations", email: "info@apex.io", balance: 1850, tier: "Enterprise"'
        }
      },
      {
        id: "step_3",
        action: "UpdateRecord",
        enabled: true,
        parameters: {
          table: "customers",
          setValues: "tier = 'VIP', balance = balance + 250",
          whereCondition: "name = 'Apex Innovations'"
        }
      },
      {
        id: "step_4",
        action: "MakeTable",
        enabled: true,
        parameters: {
          newTable: "vip_customers_archive",
          queryName: "VIP_Customers_High_Balance",
          dropExisting: true
        }
      },
      {
        id: "step_5",
        action: "OpenTable",
        enabled: true,
        parameters: { table: "customers", view: "datasheet" }
      },
      {
        id: "step_6",
        action: "GoToRecord",
        enabled: true,
        parameters: { record: "last" }
      },
      {
        id: "step_7",
        action: "MessageBox",
        enabled: true,
        parameters: {
          message: "CRUD pipeline completed! Record inserted, updated, and VIP archive table created from named query.",
          title: "CRUD Query Success",
          type: "success",
          beep: true
        }
      }
    ]
  }
];

/** Rewrites SQLite-flavoured sample text (names, date math, JSON columns) for another engine. */
export function adaptMacroTextForDialect(text: string, d: MacroDialect): string {
  if (d === "sqlite") return text;
  let out = text
    .replace(/SQLite Studio Pro/g, d === "mysql" ? "MySQL Studio Pro" : "Postgres Studio Pro")
    .replace(/SQLite database/g, "database")
    .replace(/datetime\('now', '-30 days'\)/g, d === "mysql" ? "NOW() - INTERVAL 30 DAY" : "NOW() - INTERVAL '30 days'");
  if (d === "postgres") {
    out = out.replace(/\('MACRO_MAINTENANCE', 'SYSTEM', '([^']*)'\)/g, "('MACRO_MAINTENANCE', 'SYSTEM', to_jsonb('$1'::text))");
  }
  return out;
}

export function createDefaultMacros(d: MacroDialect = "sqlite"): MacroDefinition[] {
  return JSON.parse(adaptMacroTextForDialect(JSON.stringify(DEFAULT_SAMPLE_MACROS), d));
}

// -------------------------------------------------------------------------------------------------
// CSS Styles for Microsoft Access Macro Subsystem
// -------------------------------------------------------------------------------------------------

export const MACRO_STYLE = `
    /* ===== Microsoft Access Macro Subsystem ===== */
    .macro-layout {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      position: relative;
    }

    .macro-ribbon {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(15, 23, 42, 0.95);
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .macro-ribbon-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .macro-ribbon-sep {
      width: 1px;
      height: 22px;
      background: var(--border-subtle);
      margin: 0 4px;
    }

    .macro-name-input {
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border-subtle);
      color: var(--cyan);
      font-weight: 700;
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 6px;
      outline: none;
      min-width: 170px;
      transition: all 0.2s;
    }
    .macro-name-input:focus {
      border-color: var(--cyan);
      box-shadow: 0 0 0 2px var(--cyan-glow);
    }

    .macro-selector-select {
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 6px;
      outline: none;
      max-width: 180px;
    }

    .btn-step-active {
      background: rgba(245, 158, 11, 0.2) !important;
      border-color: var(--amber) !important;
      color: var(--amber) !important;
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.3) !important;
    }

    .macro-workspace-body {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    .macro-main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 12px;
      gap: 12px;
    }

    /* Macro Action Matrix Table */
    .macro-matrix-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    }

    .macro-matrix-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--border-subtle);
    }

    .macro-matrix-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
    }

    .macro-matrix-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .macro-matrix-table th {
      position: sticky;
      top: 0;
      background: #0d1527;
      color: var(--text-dim);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border-subtle);
      text-align: left;
      z-index: 5;
    }

    .macro-matrix-table td {
      padding: 8px 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: middle;
      color: var(--text-main);
    }

    .macro-matrix-table tr.macro-row:hover {
      background: rgba(56, 189, 248, 0.04);
    }

    .macro-matrix-table tr.macro-row.macro-step-current {
      background: rgba(245, 158, 11, 0.15) !important;
      border-left: 3px solid var(--amber);
      animation: macroPulseGlow 1.4s infinite alternate;
    }

    .macro-matrix-table tr.macro-row.macro-step-success {
      border-left: 3px solid var(--emerald);
    }

    .macro-matrix-table tr.macro-row.macro-step-skipped {
      opacity: 0.55;
    }

    @keyframes macroPulseGlow {
      from { background-color: rgba(245, 158, 11, 0.1); }
      to { background-color: rgba(245, 158, 11, 0.22); }
    }

    .macro-matrix-table tr.macro-row-comment td {
      background: rgba(16, 185, 129, 0.04);
      color: #34d399;
      font-style: italic;
    }

    .macro-step-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      font-weight: 700;
      font-size: 11px;
      color: var(--cyan);
    }

    .macro-action-select {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border-subtle);
      color: #fff;
      font-size: 12px;
      padding: 5px 8px;
      border-radius: 4px;
      outline: none;
      min-width: 155px;
    }
    .macro-action-select:focus {
      border-color: var(--cyan);
    }

    .macro-condition-input {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-subtle);
      color: var(--amber);
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      outline: none;
      width: 100%;
      min-width: 130px;
    }
    .macro-condition-input:focus {
      border-color: var(--amber);
    }

    .macro-params-box {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }

    .macro-param-field {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 4px;
      padding: 2px 6px;
    }

    .macro-param-label {
      font-size: 10px;
      color: var(--text-dim);
      font-weight: 600;
      text-transform: uppercase;
    }

    .macro-param-input, .macro-param-select {
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      outline: none;
    }

    .macro-param-input:focus, .macro-param-select:focus {
      border-color: var(--cyan);
    }

    .macro-matrix-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.02);
      border-top: 1px solid var(--border-subtle);
    }

    /* Action Catalog Drawer */
    .macro-catalog-drawer {
      width: 280px;
      background: var(--bg-card);
      border-left: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
      transition: width 0.2s ease;
    }

    .macro-catalog-drawer.closed {
      width: 0;
      border-left: none;
    }

    .macro-catalog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 12px;
      font-weight: 700;
      color: var(--text-main);
    }

    .macro-catalog-search {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-subtle);
    }

    .macro-catalog-search input {
      width: 100%;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
      padding: 4px 8px;
      font-size: 11px;
      border-radius: 4px;
      outline: none;
    }

    .macro-catalog-items {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .macro-catalog-category {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 6px;
      padding: 2px 4px;
    }

    .macro-catalog-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .macro-catalog-item:hover {
      background: rgba(56, 189, 248, 0.1);
      border-color: var(--cyan);
      transform: translateX(2px);
    }

    .macro-catalog-item-title {
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .macro-catalog-desc-box {
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.35);
      border-top: 1px solid var(--border-subtle);
      font-size: 11px;
      color: var(--text-dim);
      min-height: 60px;
    }

    /* Execution Log Console */
    .macro-console-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
      height: 160px;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .macro-console-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 11px;
      font-weight: 700;
    }

    .macro-console-log {
      flex: 1;
      overflow-y: auto;
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 8px 12px;
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .macro-log-line {
      display: flex;
      align-items: center;
      gap: 8px;
      word-break: break-all;
    }

    .macro-log-time {
      color: var(--text-dim);
      font-size: 10px;
      flex-shrink: 0;
    }

    .macro-log-tag {
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .macro-log-tag.success { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .macro-log-tag.skipped { background: rgba(148, 163, 184, 0.2); color: #94a3b8; }
    .macro-log-tag.error { background: rgba(244, 63, 94, 0.2); color: #fb7185; }
    .macro-log-tag.info { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }

    /* Single Step Debugger Modal */
    #macroSingleStepModal .modal-card {
      max-width: 520px;
      border-color: var(--amber);
      box-shadow: 0 10px 30px rgba(245, 158, 11, 0.25);
    }

    .single-step-row {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 12px;
    }

    .single-step-label {
      color: var(--text-dim);
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10px;
      padding-top: 2px;
    }

    .single-step-val {
      font-weight: 600;
      color: var(--text-main);
      word-break: break-word;
    }

    /* Access Message Box Modal */
    #macroMsgBoxModal .modal-card {
      max-width: 460px;
    }

    .msgbox-content {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 16px;
    }

    .msgbox-icon {
      font-size: 32px;
      line-height: 1;
      flex-shrink: 0;
    }

    .msgbox-text {
      flex: 1;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-main);
      white-space: pre-wrap;
    }

    /* Object Tree Macro Group Styling */
    .tree-item-macro-run {
      opacity: 0;
      margin-left: auto;
      padding: 1px 6px;
      font-size: 10px;
      border-radius: 3px;
      background: rgba(56, 189, 248, 0.2);
      color: var(--cyan);
      border: 1px solid var(--cyan);
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .tree-item:hover .tree-item-macro-run {
      opacity: 1;
    }
    .tree-item-macro-run:hover {
      background: var(--cyan);
      color: #000;
    }
`;

// -------------------------------------------------------------------------------------------------
// Tab Button HTML
// -------------------------------------------------------------------------------------------------

export const MACRO_TAB_BTN = `<div class="tab-btn" id="tabBtnMacros" onclick="switchTab('macros')">⚡ Macro Designer</div>`;

// -------------------------------------------------------------------------------------------------
// Tab Pane & Modals HTML
// -------------------------------------------------------------------------------------------------

export const MACRO_HTML = `
        <!-- Macro Designer Tab Pane -->
        <div class="tab-pane" id="tabMacros">
          <div class="macro-layout">
            <!-- Macro Ribbon / Toolbar -->
            <div class="macro-ribbon">
              <div class="macro-ribbon-group">
                <span style="font-size: 11px; font-weight: 700; color: var(--text-dim);">Macro:</span>
                <select class="macro-selector-select" id="macroSelector" onchange="onSelectMacro(this.value)">
                  <!-- Populated dynamically -->
                </select>
                <input type="text" class="macro-name-input" id="macroNameInput" placeholder="Macro Name" onchange="onMacroNameChange(this.value)">
              </div>

              <div class="macro-ribbon-sep"></div>

              <div class="macro-ribbon-group">
                <button class="btn btn-sm btn-primary" id="btnRunMacro" onclick="runCurrentMacro(false)" title="Execute entire macro sequentially (Ctrl+Enter)">▶️ Run</button>
                <button class="btn btn-sm" id="btnDryRun" onclick="runCurrentMacroOnServer('dryRun')" title="Run data steps on the server and ROLL BACK every change (safe preview)">🧪 Dry Run</button>
                <button class="btn btn-sm" id="btnAtomicRun" onclick="runCurrentMacroOnServer('transaction')" title="Run data steps on the server in one transaction: all changes commit, or none do (UI-only steps are skipped)">🔒 Atomic</button>
                <button class="btn btn-sm" id="btnSingleStep" onclick="toggleSingleStepMode()" title="Toggle Microsoft Access Single Step Debugging Mode">⏯️ Single Step</button>
                <button class="btn btn-sm" onclick="saveCurrentMacro()" title="Save macro to database">💾 Save</button>
                <button class="btn btn-sm" onclick="addNewActionRow()" title="Add next action to macro">➕ Add Action</button>
              </div>

              <div class="macro-ribbon-sep"></div>

              <div class="macro-ribbon-group">
                <button class="sidebar-mini-btn" onclick="createNewMacro()" title="Create blank macro">📄 New</button>
                <button class="sidebar-mini-btn" onclick="duplicateCurrentMacro()" title="Duplicate current macro">📑 Duplicate</button>
                <button class="sidebar-mini-btn" onclick="deleteCurrentMacro()" title="Delete current macro">🗑️ Delete</button>
                <select class="sidebar-mini-btn" id="macroOnErrorSelect" onchange="onMacroOnErrorChange(this.value)" title="What to do when a step fails" style="padding: 3px 6px;">
                  <option value="stop">On error: Stop</option>
                  <option value="continue">On error: Continue</option>
                </select>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); cursor: pointer; margin-left: 4px;">
                  <input type="checkbox" id="macroAutoExecCheck" onchange="onAutoExecToggle(this.checked)" style="accent-color: var(--cyan);">
                  <span>AutoExec</span>
                </label>
              </div>

              <div class="macro-ribbon-sep"></div>

              <div class="macro-ribbon-group" style="margin-left: auto;">
                <select class="sidebar-mini-btn" id="macroPresetSelect" onchange="applyMacroPreset(this.value)" style="padding: 3px 6px;">
                  <option value="">📋 Template Presets...</option>
                  <option value="autoexec">Startup: AutoExec & Overview</option>
                  <option value="vip_audit">Audit: VIP Customers Report</option>
                  <option value="maintenance">Maintenance: VACUUM & Backup</option>
                  <option value="batch_orders">Batch: Order Pipeline Update</option>
                  <option value="purge_logs">Cleanup: Archive & Purge Logs</option>
                </select>
                <button class="sidebar-mini-btn" onclick="openMacroExportDialog('json')" title="Export macro as JSON">📤 Export</button>
                <button class="sidebar-mini-btn" onclick="openMacroExportDialog('sql')" title="Export macro as a plain SQL script">📜 SQL</button>
                <button class="sidebar-mini-btn" onclick="openMacroExportDialog('vba')" title="Export macro as an Access VBA module">🧾 VBA</button>
                <button class="sidebar-mini-btn" onclick="openMacroImportDialog()" title="Import macro JSON">📥 Import</button>
                <button class="sidebar-mini-btn" id="btnToggleCatalog" onclick="toggleActionCatalog()" title="Toggle Action Catalog Drawer">📖 Catalog</button>
              </div>
            </div>

            <!-- Workspace Body: Action Matrix + Action Catalog -->
            <div class="macro-workspace-body">
              <div class="macro-main-area">
                <!-- Action Matrix Card -->
                <div class="macro-matrix-card">
                  <div class="macro-matrix-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 11px; font-weight: 700; color: var(--cyan);">Microsoft Access Macro Action Matrix</span>
                      <span class="badge" id="macroActionCountBadge">0 Actions</span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-dim);" id="macroStatusText">Ready</div>
                  </div>

                  <div class="macro-matrix-scroll">
                    <table class="macro-matrix-table" id="macroMatrixTable">
                      <thead>
                        <tr>
                          <th style="width: 44px; text-align: center;">#</th>
                          <th style="width: 170px;">Condition (Optional)</th>
                          <th style="width: 175px;">Action</th>
                          <th>Action Arguments</th>
                          <th style="width: 50px; text-align: center;">Active</th>
                          <th style="width: 58px; text-align: center;" title="Keep running if this step fails (Access OnError Next)">On Err ⏭</th>
                          <th style="width: 70px; text-align: center;">Order</th>
                          <th style="width: 40px; text-align: center;">Del</th>
                        </tr>
                      </thead>
                      <tbody id="macroMatrixBody">
                        <!-- Populated dynamically -->
                      </tbody>
                    </table>
                  </div>

                  <div class="macro-matrix-footer">
                    <div style="display: flex; gap: 6px; align-items: center;">
                      <button class="btn btn-sm" onclick="addNewActionRow()">➕ Add Action Row</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('InsertRecord')" title="Access Append Query">+ Insert</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('UpdateRecord')" title="Access Update Query">+ Update</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('DeleteRecord')" title="Access Delete Query">+ Delete</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('MakeTable')" title="Access Make-Table Query">+ MakeTable</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('OpenQuery')" title="Open Named / SQL Query">+ OpenQuery</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('GoToRecord')" title="Access GoToRecord">+ GoToRecord</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('OpenTable')">+ OpenTable</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('RunSQL')">+ RunSQL</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('ApplyFilter')">+ Filter</button>
                      <button class="sidebar-mini-btn" onclick="quickAddAction('MessageBox')">+ MsgBox</button>
                    </div>
                    <div style="font-size: 10px; color: var(--text-dim);">
                      Tip: Use <b>[totalRows]</b>, <b>[activeTable]</b>, or <b>[variableName]</b> in Conditions
                    </div>
                  </div>
                </div>

                <!-- Execution Console & Trace -->
                <div class="macro-console-card">
                  <div class="macro-console-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span>⚡ Execution Console & Telemetry Trace</span>
                      <span id="macroExecutionSummary" style="color: var(--emerald); font-weight: 600;"></span>
                    </div>
                    <div style="display: flex; gap: 4px;">
                      <button class="sidebar-mini-btn" onclick="clearMacroLog()">Clear Console</button>
                      <button class="sidebar-mini-btn" onclick="copyMacroLog()">Copy Log</button>
                    </div>
                  </div>
                  <div class="macro-console-log" id="macroConsoleLog">
                    <div class="macro-log-line">
                      <span class="macro-log-time">[00:00:00]</span>
                      <span class="macro-log-tag info">INFO</span>
                      <span>Microsoft Access Macro subsystem ready. Select or create a macro to execute.</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Action Catalog Drawer (Collapsible Right Side) -->
              <div class="macro-catalog-drawer" id="macroCatalogDrawer">
                <div class="macro-catalog-header">
                  <span>Action Catalog</span>
                  <button class="sidebar-mini-btn" onclick="toggleActionCatalog()">✕</button>
                </div>
                <div class="macro-catalog-search">
                  <input type="text" id="catalogSearchInput" placeholder="Filter actions..." oninput="filterCatalogActions(this.value)">
                </div>
                <div class="macro-catalog-items" id="macroCatalogItems">
                  <!-- Rendered dynamically -->
                </div>
                <div class="macro-catalog-desc-box" id="catalogDescBox">
                  Hover or select an action in the catalog to view details and arguments.
                </div>
              </div>
            </div>
          </div>
        </div>

  <!-- Microsoft Access Macro Single Step Debugger Modal -->
  <div class="modal-overlay" id="macroSingleStepModal" style="display: none; z-index: 10050;">
    <div class="modal-card">
      <div class="modal-header" style="background: rgba(245, 158, 11, 0.12); border-bottom: 1px solid var(--amber);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">⏯️</span>
          <span style="font-weight: 700; color: var(--amber);">Macro Single Step Debugger</span>
        </div>
        <span class="badge" id="stepStepIndexBadge" style="background: var(--amber); color: #000; font-weight: 700;">Step 1 of 1</span>
      </div>
      <div class="modal-body" style="padding: 16px;">
        <div class="single-step-row">
          <span class="single-step-label">Macro Name:</span>
          <span class="single-step-val" id="stepMacroNameVal">AutoExec</span>
        </div>
        <div class="single-step-row">
          <span class="single-step-label">Condition:</span>
          <span class="single-step-val" id="stepConditionVal" style="color: var(--amber);">True</span>
        </div>
        <div class="single-step-row">
          <span class="single-step-label">Action Name:</span>
          <span class="single-step-val" id="stepActionNameVal" style="color: var(--cyan); font-size: 13px;">OpenTable</span>
        </div>
        <div class="single-step-row">
          <span class="single-step-label">Arguments:</span>
          <span class="single-step-val" id="stepArgumentsVal" style="font-family: var(--font-mono); font-size: 11px;">table: customers</span>
        </div>
        <div class="single-step-row">
          <span class="single-step-label">Status:</span>
          <span class="single-step-val" style="color: var(--emerald);">Ready to execute action</span>
        </div>
      </div>
      <div class="modal-footer" style="background: rgba(0,0,0,0.3); justify-content: flex-end; gap: 8px;">
        <button class="btn btn-primary" id="btnSingleStepNext" onclick="onSingleStepNext()" style="background: var(--amber); border-color: var(--amber); color: #000; font-weight: 700;">Step ▶</button>
        <button class="btn" id="btnSingleStepContinue" onclick="onSingleStepContinue()" title="Execute remaining actions without pausing">Continue ⏩</button>
        <button class="btn btn-danger" id="btnSingleStepHalt" onclick="onSingleStepHalt()" title="Stop macro execution immediately">Halt ⏹️</button>
      </div>
    </div>
  </div>

  <!-- Microsoft Access Message Box Modal -->
  <div class="modal-overlay" id="macroMsgBoxModal" style="display: none; z-index: 10060;">
    <div class="modal-card">
      <div class="modal-header">
        <span id="msgBoxTitle" style="font-weight: 700; color: var(--text-main);">Microsoft Access</span>
        <button class="sidebar-mini-btn" onclick="closeMacroMsgBox(true)">✕</button>
      </div>
      <div class="msgbox-content">
        <div class="msgbox-icon" id="msgBoxIcon">ℹ️</div>
        <div class="msgbox-text" id="msgBoxText">Message text goes here...</div>
      </div>
      <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
        <button class="btn btn-primary" id="msgBoxBtnOk" onclick="closeMacroMsgBox(true)">OK</button>
      </div>
    </div>
  </div>

  <!-- Macro JSON Import / Export Modal -->
  <div class="modal-overlay" id="macroJsonModal" style="display: none; z-index: 10040;">
    <div class="modal-card" style="max-width: 640px;">
      <div class="modal-header">
        <span id="macroJsonModalTitle" style="font-weight: 700;">Macro JSON Definition</span>
        <button class="sidebar-mini-btn" onclick="closeMacroJsonModal()">✕</button>
      </div>
      <div class="modal-body" style="padding: 14px;">
        <textarea id="macroJsonTextArea" style="width: 100%; height: 260px; background: rgba(0,0,0,0.4); color: var(--cyan); font-family: var(--font-mono); font-size: 11px; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px; outline: none;"></textarea>
      </div>
      <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
        <button class="btn" onclick="copyMacroJsonToClipboard()">📋 Copy</button>
        <button class="btn btn-primary" id="btnMacroJsonAction" onclick="submitMacroJsonAction()">Save / Import</button>
        <button class="btn" onclick="closeMacroJsonModal()">Close</button>
      </div>
    </div>
  </div>
`;

// -------------------------------------------------------------------------------------------------
// Client-Side Macro Script Logic
// -------------------------------------------------------------------------------------------------

const MACRO_SCRIPT_BASE = `
// =================================================================================================
// ⚡ Microsoft Access Macro Engine Client-Side Implementation
// =================================================================================================

// =================================================================================================
// ⚡ Microsoft Access Action Catalog
// =================================================================================================

const ACCESS_ACTION_CATALOG = [
  // CRUD & Action Queries
  {
    name: "RunSQL",
    category: "CRUD & Action Queries",
    icon: "⚡",
    desc: "Executes an action query (INSERT, UPDATE, DELETE, or DDL statement).",
    defaultParams: { sql: "UPDATE customers SET tier = 'VIP' WHERE balance > 1000;", useTransaction: true }
  },
  {
    name: "InsertRecord",
    category: "CRUD & Action Queries",
    icon: "➕",
    desc: "Inserts a new record into target table (Microsoft Access Append Query).",
    defaultParams: { table: "customers", fields: 'name: "Apex Innovations", email: "info@apex.io", balance: 1850, tier: "Enterprise"' }
  },
  {
    name: "UpdateRecord",
    category: "CRUD & Action Queries",
    icon: "✏️",
    desc: "Updates existing records matching criteria (Microsoft Access Update Query).",
    defaultParams: { table: "customers", setValues: "tier = 'VIP', balance = balance + 100", whereCondition: "balance > 1000" }
  },
  {
    name: "DeleteRecord",
    category: "CRUD & Action Queries",
    icon: "🗑️",
    desc: "Deletes records matching criteria (Microsoft Access Delete Query).",
    defaultParams: { table: "customers", whereCondition: "tier = 'Archived'" }
  },
  {
    name: "MakeTable",
    category: "CRUD & Action Queries",
    icon: "🏗️",
    desc: "Creates a new table dynamically from query results (Microsoft Access Make-Table Query).",
    defaultParams: { newTable: "customers_archive", queryName: "", selectSql: "SELECT * FROM customers WHERE balance > 1000", dropExisting: true }
  },
  {
    name: "EmptyTable",
    category: "CRUD & Action Queries",
    icon: "🧹",
    desc: "Removes all records from target table (Delete All Records / Truncate).",
    defaultParams: { table: "audit_logs" }
  },

  // Record Operations
  {
    name: "GoToRecord",
    category: "Record Operations",
    icon: "🎯",
    desc: "Navigates active datasheet to First, Last, Next, Previous, New, or specific row offset.",
    defaultParams: { record: "first", offset: 1 }
  },
  {
    name: "FindRecord",
    category: "Record Operations",
    icon: "🔎",
    desc: "Finds matching record across datasheet and scrolls into view (Access FindRecord).",
    defaultParams: { findWhat: "", field: "*", matchCase: false }
  },
  {
    name: "ShowAllRecords",
    category: "Record Operations",
    icon: "👁️",
    desc: "Removes any active filter and displays all records in datasheet (Access RemoveFilter).",
    defaultParams: {}
  },
  {
    name: "SetValue",
    category: "Record Operations",
    icon: "🏷️",
    desc: "Sets field in active record or stores runtime variable (Access SetValue).",
    defaultParams: { item: "tier", expression: "'VIP'" }
  },
  {
    name: "SaveRecord",
    category: "Record Operations",
    icon: "💾",
    desc: "Commits pending edits in active record to SQLite database.",
    defaultParams: {}
  },
  {
    name: "SetWarnings",
    category: "Record Operations",
    icon: "⚠️",
    desc: "Toggles confirmation prompts before running action queries (Access SetWarnings).",
    defaultParams: { warningsOn: false }
  },

  // Database Objects
  {
    name: "OpenQuery",
    category: "Database Objects",
    icon: "👁️",
    desc: "Executes a saved named query or custom SQL statement and renders the results in the grid.",
    defaultParams: { queryName: "", sql: "SELECT * FROM customers LIMIT 100;" }
  },
  {
    name: "OpenTable",
    category: "Database Objects",
    icon: "📋",
    desc: "Opens a table in datasheet or design view and selects it as active.",
    defaultParams: { table: "", view: "datasheet", dataMode: "edit" }
  },
  {
    name: "OpenReport",
    category: "Database Objects",
    icon: "🖨️",
    desc: "Generates and opens Microsoft Access printable publication report / PDF.",
    defaultParams: { table: "", title: "Publication Report" }
  },
  {
    name: "CloseObject",
    category: "Database Objects",
    icon: "🪟",
    desc: "Closes the active datasheet table, report modal, or resets workspace.",
    defaultParams: { objectType: "activeTable" }
  },
  {
    name: "Requery",
    category: "Database Objects",
    icon: "🔄",
    desc: "Re-executes active query or refreshes table data, schema, and KPIs.",
    defaultParams: { target: "active" }
  },

  // Data Operations
  {
    name: "ApplyFilter",
    category: "Data Operations",
    icon: "🔍",
    desc: "Applies a WHERE filter expression to the current table or datasheet view.",
    defaultParams: { condition: "balance > 500", filterName: "" }
  },
  {
    name: "ExportData",
    category: "Data Operations",
    icon: "📤",
    desc: "Exports table records or current query results to CSV, JSON, or SQL file.",
    defaultParams: { table: "", format: "csv", fileName: "" }
  },
  {
    name: "ImportData",
    category: "Data Operations",
    icon: "📥",
    desc: "Launches the Access Import Wizard or imports rows into destination table.",
    defaultParams: { table: "", format: "csv" }
  },

  // System & Maintenance
  {
    name: "MessageBox",
    category: "System & Maintenance",
    icon: "💬",
    desc: "Displays a Microsoft Access style dialog box with title, icon, and optional chime.",
    defaultParams: { message: "Operation completed successfully!", title: "SQLite Studio Pro", type: "information", beep: true }
  },
  {
    name: "VacuumDatabase",
    category: "System & Maintenance",
    icon: "🧹",
    desc: "Reclaims unused database pages and runs PRAGMA optimize.",
    defaultParams: { analyze: true }
  },
  {
    name: "BackupDatabase",
    category: "System & Maintenance",
    icon: "💾",
    desc: "Generates full SQLite database backup or SQL dump.",
    defaultParams: { mode: "full" }
  },
  {
    name: "Beep",
    category: "System & Maintenance",
    icon: "🔔",
    desc: "Synthesizes an Access audible notification chime using Web Audio API.",
    defaultParams: { count: 1, frequency: 800 }
  },

  // Flow & Logic
  {
    name: "SetVariable",
    category: "Flow & Logic",
    icon: "⚙️",
    desc: "Stores a temporary runtime variable (TempVar) for use in conditions.",
    defaultParams: { name: "myVar", expression: "100" }
  },
  {
    name: "RunMacro",
    category: "Flow & Logic",
    icon: "▶️",
    desc: "Executes another saved macro as a sub-routine.",
    defaultParams: { macroName: "" }
  },
  {
    name: "StopMacro",
    category: "Flow & Logic",
    icon: "⏹️",
    desc: "Halts macro execution immediately.",
    defaultParams: { reason: "Normal completion" }
  },
  {
    name: "Comment",
    category: "Flow & Logic",
    icon: "📝",
    desc: "Access remarks documentation row (displayed in green italic style).",
    defaultParams: { comment: "Note or documentation here..." }
  }
];

let macroStore = [];
let savedQueriesStore = [];
let currentMacro = null;
let singleStepActive = false;
let singleStepResolve = null;
let macroVariables = {};
let isMacroRunning = false;
let haltRequested = false;

// -------------------------------------------------------------------------------------------------
// SQL Action Query Builders (Append, Update, Delete, MakeTable, EmptyTable)
// -------------------------------------------------------------------------------------------------
function parseRecordFieldsToInsertSql(tableName, fieldsInput) {
  let obj = {};
  if (typeof fieldsInput === "object" && fieldsInput !== null) {
    obj = fieldsInput;
  } else if (typeof fieldsInput === "string") {
    const trimmed = fieldsInput.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try { obj = JSON.parse(trimmed); } catch {}
    }
    if (Object.keys(obj).length === 0) {
      const parts = trimmed.split(/,(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/);
      for (const part of parts) {
        const eqIdx = part.search(/[:=]/);
        if (eqIdx !== -1) {
          let key = part.slice(0, eqIdx).trim();
          const bt = String.fromCharCode(96);
          while (key.startsWith("'") || key.startsWith('"') || key.startsWith("[") || key.startsWith(bt)) key = key.slice(1);
          while (key.endsWith("'") || key.endsWith('"') || key.endsWith("]") || key.endsWith(bt)) key = key.slice(0, -1);
          const rawVal = part.slice(eqIdx + 1).trim();
          let val = rawVal;
          if ((rawVal.startsWith("'") && rawVal.endsWith("'")) || (rawVal.startsWith('"') && rawVal.endsWith('"'))) {
            val = rawVal.slice(1, -1);
          } else if (!isNaN(Number(rawVal)) && rawVal !== "") {
            val = Number(rawVal);
          } else if (rawVal.toLowerCase() === "true") val = 1;
          else if (rawVal.toLowerCase() === "false") val = 0;
          else if (rawVal.toLowerCase() === "null") val = null;
          if (key) obj[key] = val;
        }
      }
    }
  }

  const keys = Object.keys(obj);
  if (keys.length === 0) throw new Error("No fields provided for InsertRecord");

  const colNames = keys.map(k => macroQuoteId(k)).join(", ");
  const colVals = keys.map(k => {
    const v = obj[k];
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    return macroQuoteStr(v);
  }).join(", ");

  return 'INSERT INTO ' + macroQuoteId(tableName) + ' (' + colNames + ') VALUES (' + colVals + ');';
}

function buildUpdateRecordSql(tableName, setValues, whereCondition) {
  const table = macroQuoteId(tableName);
  let sql = 'UPDATE ' + table + ' SET ' + setValues;
  if (whereCondition && whereCondition.trim()) {
    sql += ' WHERE ' + whereCondition.trim();
  }
  return sql + ';';
}

function buildDeleteRecordSql(tableName, whereCondition) {
  const table = macroQuoteId(tableName);
  let sql = 'DELETE FROM ' + table;
  if (whereCondition && whereCondition.trim()) {
    sql += ' WHERE ' + whereCondition.trim();
  }
  return sql + ';';
}

function buildMakeTableStatements(newTableName, selectSql, dropExisting = true) {
  const table = macroQuoteId(newTableName);
  let cleanSelect = selectSql.trim();
  if (cleanSelect.endsWith(";")) cleanSelect = cleanSelect.slice(0, -1);
  const create = 'CREATE TABLE ' + table + ' AS ' + cleanSelect + ';';
  return dropExisting ? ['DROP TABLE IF EXISTS ' + table + ';', create] : [create];
}

function buildEmptyTableSql(tableName) {
  return 'DELETE FROM ' + macroQuoteId(tableName) + ';';
}

// -------------------------------------------------------------------------------------------------
// Saved Named Queries Subsystem (Access Parity)
// -------------------------------------------------------------------------------------------------
async function loadSavedQueriesFromServer() {
  try {
    const res = await apiRequest('/api/queries/list');
    if (res && res.success && Array.isArray(res.queries)) {
      savedQueriesStore = res.queries;
    } else {
      savedQueriesStore = getDefaultSampleQueries();
    }
  } catch (e) {
    savedQueriesStore = getDefaultSampleQueries();
  }

  if (typeof queryDesignerState !== "undefined" && Array.isArray(savedQueriesStore)) {
    queryDesignerState.savedQueries = savedQueriesStore;
  }
  if (typeof renderObjectTree === "function") {
    renderObjectTree();
  }
  return savedQueriesStore;
}

function renderQueryTreeGroup(container, query) {
  const filtered = query
    ? (savedQueriesStore || []).filter(q => q.name.toLowerCase().includes(query))
    : (savedQueriesStore || []);

  const group = document.createElement("div");
  group.className = "tree-group";

  const header = document.createElement("div");
  header.className = "tree-header";
  header.innerHTML = '<div class="tree-header-left">' +
    '<span class="tree-arrow">▼</span>' +
    '<span>👁️ Saved Queries</span>' +
    '</div>' +
    '<div style="display: flex; align-items: center; gap: 4px;">' +
    '<span class="tree-badge">' + filtered.length + '</span>' +
    '<button class="sidebar-mini-btn btn-new-query" style="padding: 0 4px; font-size: 10px;" title="New Query in Visual Designer">+</button>' +
    '</div>';

  const newBtn = header.querySelector(".btn-new-query");
  if (newBtn) {
    newBtn.onclick = (e) => {
      e.stopPropagation();
      switchTab("designer");
      if (typeof resetDesignerAll === "function") resetDesignerAll();
    };
  }

  const itemsList = document.createElement("div");
  itemsList.className = "tree-items";

  header.onclick = () => {
    const isHidden = itemsList.style.display === "none";
    itemsList.style.display = isHidden ? "flex" : "none";
    header.querySelector(".tree-arrow").textContent = isHidden ? "▼" : "▶";
  };

  filtered.forEach(q => {
    const row = document.createElement("div");
    row.className = "tree-item";
    row.innerHTML = '<span class="tree-item-title" title="' + escapeHtml(q.description || q.sql) + '">👁️ ' + escapeHtml(q.name) + '</span>' +
      '<button class="tree-item-macro-run btn-run-query" title="Run Query in Datasheet">▶</button>' +
      '<button class="sidebar-mini-btn btn-design-query" style="padding: 0 3px; font-size: 9px;" title="Open in Query Designer">📐</button>' +
      '<button class="sidebar-mini-btn btn-del-query" style="padding: 0 3px; font-size: 9px; color: var(--rose);" title="Delete Query">✕</button>';

    const runBtn = row.querySelector(".btn-run-query");
    if (runBtn) runBtn.onclick = (e) => { e.stopPropagation(); executeSpecificQueryByName(q.name); };
    const designBtn = row.querySelector(".btn-design-query");
    if (designBtn) designBtn.onclick = (e) => { e.stopPropagation(); openQueryInVisualDesigner(q.name); };
    const delBtn = row.querySelector(".btn-del-query");
    if (delBtn) delBtn.onclick = (e) => { e.stopPropagation(); deleteNamedQueryById(q.id || q.name); };
    row.onclick = () => { executeSpecificQueryByName(q.name); };

    itemsList.appendChild(row);
  });

  group.appendChild(header);
  group.appendChild(itemsList);
  container.appendChild(group);
}

async function executeSpecificQueryByName(queryName) {
  const found = (savedQueriesStore || []).find(q => q.name === queryName || q.id === queryName);
  if (!found) return;
  const editor = document.getElementById("sqlEditor");
  if (editor) editor.value = found.sql;
  switchTab("grid");
  if (typeof runEditorQuery === "function") {
    await runEditorQuery();
  }
  showToast("Executed saved query: " + found.name);
}

function openQueryInVisualDesigner(queryName) {
  const found = (savedQueriesStore || []).find(q => q.name === queryName || q.id === queryName);
  if (!found) return;
  switchTab("designer");
  if (found.designerStateJson && typeof queryDesignerState !== "undefined") {
    try {
      const parsed = JSON.parse(found.designerStateJson);
      Object.assign(queryDesignerState, parsed);
      if (typeof renderQueryDesigner === "function") renderQueryDesigner();
      showToast("Loaded query into Visual Designer: " + found.name);
      return;
    } catch {}
  }
  if (typeof queryDesignerState !== "undefined") {
    queryDesignerState.activeView = "sql";
    if (typeof renderQueryDesigner === "function") renderQueryDesigner();
    const preview = document.getElementById("designerSqlPreview");
    if (preview) preview.value = found.sql;
    showToast("Loaded SQL into Visual Designer: " + found.name);
  }
}

async function deleteNamedQueryById(idOrName) {
  if (!confirm("Are you sure you want to delete query '" + idOrName + "'?")) return;
  try {
    const res = await apiRequest('/api/queries/delete', { id: idOrName });
    if (res && res.success) {
      showToast("Deleted query: " + idOrName);
      await loadSavedQueriesFromServer();
    }
  } catch (e) {
    showToast("Error deleting query: " + e.message);
  }
}

// -------------------------------------------------------------------------------------------------
// Audio Synthesizer (Access Beep / Chime)
// -------------------------------------------------------------------------------------------------
function playAccessBeep(frequency = 800, count = 1) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const startT = ctx.currentTime + i * 0.18;
      osc.frequency.setValueAtTime(frequency, startT);
      gain.gain.setValueAtTime(0.18, startT);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startT);
      osc.stop(startT + 0.12);
    }
  } catch (err) {
    console.log("Audio chime simulated:", err);
  }
}

// -------------------------------------------------------------------------------------------------
// Macro Loading & Persistence
// -------------------------------------------------------------------------------------------------
async function loadMacrosFromServer() {
  if (typeof loadSavedQueriesFromServer === "function") {
    try { await loadSavedQueriesFromServer(); } catch {}
  }
  try {
    const res = await apiRequest('/api/macros/list');
    if (res && res.success && Array.isArray(res.macros)) {
      macroStore = res.macros;
    } else {
      macroStore = getDefaultSampleMacros();
    }
  } catch (e) {
    macroStore = getDefaultSampleMacros();
  }

  if (macroStore.length === 0) {
    macroStore = getDefaultSampleMacros();
  }

  if (!currentMacro || !macroStore.some(m => m.id === currentMacro.id)) {
    currentMacro = macroStore[0];
  } else {
    currentMacro = macroStore.find(m => m.id === currentMacro.id);
  }

  populateMacroSelector();
  renderMacroDesigner();
  renderMacroTreeItems();
}

function getDefaultSampleMacros() {
  return [
    {
      id: "macro_autoexec",
      name: "AutoExec",
      description: "Startup Routine: Welcomes user and opens default table view",
      isAutoExec: true,
      actions: [
        { id: "step_1", action: "Comment", enabled: true, parameters: { comment: "Microsoft Access Startup Routine - AutoExec" } },
        { id: "step_2", action: "MessageBox", enabled: true, parameters: { message: "Welcome to SQLite Studio Pro! Access Macro Automation is ready.", title: "SQLite Studio Pro", type: "information", beep: true } },
        { id: "step_3", action: "OpenTable", enabled: true, parameters: { table: "customers", view: "datasheet", dataMode: "edit" } },
        { id: "step_4", action: "ApplyFilter", enabled: true, condition: "[totalRows] > 0", parameters: { condition: "balance > 500" } },
        { id: "step_5", action: "Requery", enabled: true, parameters: { target: "active" } }
      ]
    },
    {
      id: "macro_vip_report",
      name: "VIP_Customer_Report",
      description: "Filter VIP Tier Customers and Launch Access Publication Report",
      isAutoExec: false,
      actions: [
        { id: "step_1", action: "Comment", enabled: true, parameters: { comment: "Extract high-tier customer records and open printable report" } },
        { id: "step_2", action: "OpenTable", enabled: true, parameters: { table: "customers", view: "datasheet", dataMode: "readOnly" } },
        { id: "step_3", action: "ApplyFilter", enabled: true, parameters: { condition: "tier = 'VIP'" } },
        { id: "step_4", action: "OpenReport", enabled: true, parameters: { table: "customers", title: "VIP Tier Accounts Publication Report" } },
        { id: "step_5", action: "MessageBox", enabled: true, parameters: { message: "VIP Customer publication report generated successfully!", title: "Report Ready", type: "success", beep: true } }
      ]
    },
    {
      id: "macro_maintenance",
      name: "Database_Maintenance_Routine",
      description: "Automated Maintenance: VACUUM database and generate SQL backup",
      isAutoExec: false,
      actions: [
        { id: "step_1", action: "Comment", enabled: true, parameters: { comment: "System Maintenance & Backup Automation Routine" } },
        { id: "step_2", action: "RunSQL", enabled: true, parameters: { sql: "INSERT INTO audit_logs (action, entity, details) VALUES ('MACRO_MAINTENANCE', 'SYSTEM', 'Macro execution of automated database maintenance');" } },
        { id: "step_3", action: "VacuumDatabase", enabled: true, parameters: { analyze: true } },
        { id: "step_4", action: "BackupDatabase", enabled: true, parameters: { mode: "full" } },
        { id: "step_5", action: "Beep", enabled: true, parameters: { count: 2, frequency: 900 } },
        { id: "step_6", action: "MessageBox", enabled: true, parameters: { message: "Routine maintenance completed! Database vacuumed, optimized, and backed up.", title: "Maintenance Complete", type: "information", beep: true } }
      ]
    }
  ];
}

async function saveCurrentMacro() {
  if (!currentMacro) return;
  const nameInput = document.getElementById("macroNameInput");
  if (nameInput) currentMacro.name = nameInput.value.trim() || currentMacro.name;

  try {
    const res = await apiRequest('/api/macros/save', { macro: currentMacro });
    if (res && res.success) {
      showToast("Saved macro: " + currentMacro.name);
      logMacroConsole("Saved macro: " + currentMacro.name, "success");
      await loadMacrosFromServer();
    } else {
      showToast("Error saving macro: " + (res?.error || "Unknown"));
    }
  } catch (err) {
    showToast("Macro saved locally.");
    renderMacroTreeItems();
  }
}

async function deleteCurrentMacro() {
  if (!currentMacro) return;
  if (!confirm("Are you sure you want to delete macro '" + currentMacro.name + "'?")) return;

  try {
    await apiRequest('/api/macros/delete', { id: currentMacro.id, name: currentMacro.name });
  } catch (e) {}

  macroStore = macroStore.filter(m => m.id !== currentMacro.id);
  currentMacro = macroStore[0] || null;
  populateMacroSelector();
  renderMacroDesigner();
  renderMacroTreeItems();
  showToast("Macro deleted.");
}

function createNewMacro() {
  const newId = "macro_" + Date.now();
  const newName = "Macro" + (macroStore.length + 1);
  const fresh = {
    id: newId,
    name: newName,
    description: "New Microsoft Access style automation macro",
    isAutoExec: false,
    actions: [
      { id: "step_1", action: "Comment", enabled: true, parameters: { comment: "New Macro Workflow" } },
      { id: "step_2", action: "MessageBox", enabled: true, parameters: { message: "Hello from " + newName + "!", title: newName, type: "information", beep: true } }
    ]
  };
  macroStore.push(fresh);
  currentMacro = fresh;
  populateMacroSelector();
  renderMacroDesigner();
  renderMacroTreeItems();
  showToast("Created new macro: " + newName);
}

function populateMacroSelector() {
  const sel = document.getElementById("macroSelector");
  if (!sel) return;
  sel.innerHTML = "";
  macroStore.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = (m.isAutoExec ? "⚡ " : "📜 ") + m.name;
    if (currentMacro && m.id === currentMacro.id) opt.selected = true;
    sel.appendChild(opt);
  });
}

function onSelectMacro(id) {
  const found = macroStore.find(m => m.id === id);
  if (found) {
    currentMacro = found;
    renderMacroDesigner();
  }
}

function onMacroNameChange(val) {
  if (!currentMacro) return;
  currentMacro.name = val.trim() || currentMacro.name;
  populateMacroSelector();
  renderMacroTreeItems();
}

function onMacroOnErrorChange(val) {
  if (!currentMacro) return;
  currentMacro.onError = val === "continue" ? "continue" : "stop";
  currentMacro.actions.forEach(a => { delete a.continueOnError; });
  renderMacroMatrixTable();
}

function duplicateCurrentMacro() {
  if (!currentMacro) return;
  const copy = JSON.parse(JSON.stringify(currentMacro));
  copy.id = "macro_" + Date.now();
  copy.isAutoExec = false;
  let base = currentMacro.name + "_Copy";
  let name = base;
  let n = 2;
  while (macroStore.some(m => m.name === name)) name = base + n++;
  copy.name = name;
  macroStore.push(copy);
  currentMacro = copy;
  renderMacroDesigner();
  renderMacroTreeItems();
  showToast("Duplicated macro as '" + name + "' (click Save to persist)");
}

function onAutoExecToggle(checked) {
  if (!currentMacro) return;
  currentMacro.isAutoExec = checked;
  if (checked) {
    macroStore.forEach(m => {
      if (m.id !== currentMacro.id) m.isAutoExec = false;
    });
  }
  populateMacroSelector();
  renderMacroTreeItems();
}

function toggleSingleStepMode() {
  singleStepActive = !singleStepActive;
  const btn = document.getElementById("btnSingleStep");
  if (btn) {
    if (singleStepActive) {
      btn.classList.add("btn-step-active");
      btn.innerHTML = "⏯️ Single Step ON";
      showToast("Single Step Debugger ENABLED");
      logMacroConsole("Single Step mode turned ON. Actions will pause for step confirmation.", "info");
    } else {
      btn.classList.remove("btn-step-active");
      btn.innerHTML = "⏯️ Single Step";
      showToast("Single Step Debugger DISABLED");
      logMacroConsole("Single Step mode turned OFF.", "info");
    }
  }
}

function toggleActionCatalog() {
  const drawer = document.getElementById("macroCatalogDrawer");
  if (drawer) {
    drawer.classList.toggle("closed");
  }
}

// -------------------------------------------------------------------------------------------------
// Render Macro Designer
// -------------------------------------------------------------------------------------------------
function renderMacroDesigner() {
  if (!currentMacro) {
    if (macroStore.length > 0) currentMacro = macroStore[0];
    else { createNewMacro(); return; }
  }

  const nameInput = document.getElementById("macroNameInput");
  if (nameInput) nameInput.value = currentMacro.name;

  const autoExecCheck = document.getElementById("macroAutoExecCheck");
  if (autoExecCheck) autoExecCheck.checked = Boolean(currentMacro.isAutoExec);

  const onErrorSel = document.getElementById("macroOnErrorSelect");
  if (onErrorSel) onErrorSel.value = currentMacro.onError === "continue" ? "continue" : "stop";

  const badge = document.getElementById("macroActionCountBadge");
  if (badge) badge.textContent = currentMacro.actions.length + " Actions";

  populateMacroSelector();
  renderMacroMatrixTable();
  renderActionCatalog();
}

function renderMacroMatrixTable() {
  const tbody = document.getElementById("macroMatrixBody");
  if (!tbody || !currentMacro) return;
  tbody.innerHTML = "";

  if (currentMacro.actions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-dim);">No actions defined. Click <b>➕ Add Action</b> or select an action from the Action Catalog.</td></tr>';
    return;
  }

  currentMacro.actions.forEach((act, idx) => {
    const tr = document.createElement("tr");
    tr.className = "macro-row" + (act.action === "Comment" ? " macro-row-comment" : "");
    tr.id = "macroRow_" + act.id;

    // 1. Step Number
    const tdNum = document.createElement("td");
    tdNum.style.textAlign = "center";
    tdNum.innerHTML = \`<span class="macro-step-badge">\${idx + 1}</span>\`;
    tr.appendChild(tdNum);

    // 2. Condition
    const tdCond = document.createElement("td");
    const condInput = document.createElement("input");
    condInput.type = "text";
    condInput.className = "macro-condition-input";
    condInput.placeholder = "e.g. [totalRows] > 0";
    condInput.value = act.condition || "";
    condInput.onchange = () => { act.condition = condInput.value.trim(); };
    tdCond.appendChild(condInput);
    tr.appendChild(tdCond);

    // 3. Action selector
    const tdAct = document.createElement("td");
    const actSelect = document.createElement("select");
    actSelect.className = "macro-action-select";
    
    // Group catalog by category
    const cats = {};
    ACCESS_ACTION_CATALOG.forEach(item => {
      cats[item.category] = cats[item.category] || [];
      cats[item.category].push(item);
    });

    Object.keys(cats).forEach(cat => {
      const optg = document.createElement("optgroup");
      optg.label = cat;
      cats[cat].forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.name;
        opt.textContent = item.icon + " " + item.name;
        if (item.name === act.action) opt.selected = true;
        optg.appendChild(opt);
      });
      actSelect.appendChild(optg);
    });

    actSelect.onchange = () => {
      onActionTypeChange(act, actSelect.value);
    };
    tdAct.appendChild(actSelect);
    tr.appendChild(tdAct);

    // 4. Action Arguments (Context-aware controls)
    const tdArgs = document.createElement("td");
    renderActionArguments(tdArgs, act);
    tr.appendChild(tdArgs);

    // 5. Active Checkbox
    const tdActive = document.createElement("td");
    tdActive.style.textAlign = "center";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = act.enabled !== false;
    chk.onchange = () => { act.enabled = chk.checked; };
    tdActive.appendChild(chk);
    tr.appendChild(tdActive);

    // 5b. Continue-on-error checkbox
    const tdCont = document.createElement("td");
    tdCont.style.textAlign = "center";
    const contChk = document.createElement("input");
    contChk.type = "checkbox";
    contChk.title = "Keep running if this step fails";
    contChk.checked = act.continueOnError !== undefined ? Boolean(act.continueOnError) : currentMacro.onError === "continue";
    contChk.onchange = () => { act.continueOnError = contChk.checked; };
    tdCont.appendChild(contChk);
    tr.appendChild(tdCont);

    // 6. Order (Up / Down buttons)
    const tdOrder = document.createElement("td");
    tdOrder.style.textAlign = "center";
    tdOrder.innerHTML = \`
      <button class="sidebar-mini-btn" onclick="moveActionRow('\${act.id}', -1)" \${idx === 0 ? 'disabled' : ''} title="Move Up">▲</button>
      <button class="sidebar-mini-btn" onclick="moveActionRow('\${act.id}', 1)" \${idx === currentMacro.actions.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
    \`;
    tr.appendChild(tdOrder);

    // 7. Delete Button
    const tdDel = document.createElement("td");
    tdDel.style.textAlign = "center";
    tdDel.innerHTML = \`<button class="sidebar-mini-btn" onclick="deleteActionRow('\${act.id}')" title="Delete action">✕</button>\`;
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });
}

function onActionTypeChange(actionObj, newType) {
  actionObj.action = newType;
  const def = ACCESS_ACTION_CATALOG.find(a => a.name === newType);
  if (def) {
    actionObj.parameters = JSON.parse(JSON.stringify(def.defaultParams));
  }
  renderMacroMatrixTable();
}

function renderActionArguments(container, actionObj) {
  container.innerHTML = "";
  const box = document.createElement("div");
  box.className = "macro-params-box";

  const params = actionObj.parameters = actionObj.parameters || {};
  const schemaTables = (currentSchema && currentSchema.tables) ? currentSchema.tables.map(t => t.name) : ["customers", "products", "orders", "order_items", "audit_logs"];

  switch (actionObj.action) {
    case "OpenTable": {
      // Table select
      const fieldTbl = createParamField("Table:");
      const selTbl = document.createElement("select");
      selTbl.className = "macro-param-select";
      schemaTables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (params.table === t) opt.selected = true;
        selTbl.appendChild(opt);
      });
      if (!params.table && schemaTables[0]) params.table = schemaTables[0];
      selTbl.onchange = () => { params.table = selTbl.value; };
      fieldTbl.appendChild(selTbl);
      box.appendChild(fieldTbl);

      // View Mode
      const fieldView = createParamField("View:");
      const selView = document.createElement("select");
      selView.className = "macro-param-select";
      ["datasheet", "design"].forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v === "datasheet" ? "Datasheet View" : "Design View";
        if (params.view === v) opt.selected = true;
        selView.appendChild(opt);
      });
      selView.onchange = () => { params.view = selView.value; };
      fieldView.appendChild(selView);
      box.appendChild(fieldView);

      // Data Mode
      const fieldMode = createParamField("Mode:");
      const selMode = document.createElement("select");
      selMode.className = "macro-param-select";
      ["edit", "readOnly", "add"].forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m === "edit" ? "Edit" : (m === "readOnly" ? "Read Only" : "Add Row");
        if (params.dataMode === m) opt.selected = true;
        selMode.appendChild(opt);
      });
      selMode.onchange = () => { params.dataMode = selMode.value; };
      fieldMode.appendChild(selMode);
      box.appendChild(fieldMode);
      break;
    }

    case "OpenQuery": {
      // 1. Saved Query Dropdown
      const fieldQName = createParamField("Query Name:");
      const selQ = document.createElement("select");
      selQ.className = "macro-param-select";
      selQ.style.maxWidth = "175px";
      
      const optCustom = document.createElement("option");
      optCustom.value = "";
      optCustom.textContent = "⚙️ Custom SQL...";
      selQ.appendChild(optCustom);

      const qList = (typeof savedQueriesStore !== "undefined" && Array.isArray(savedQueriesStore)) ? savedQueriesStore : [];
      qList.forEach(q => {
        const opt = document.createElement("option");
        opt.value = q.name;
        opt.textContent = "👁️ " + q.name;
        if (params.queryName === q.name) opt.selected = true;
        selQ.appendChild(opt);
      });

      fieldQName.appendChild(selQ);
      box.appendChild(fieldQName);

      // 2. SQL input / preview
      const fieldSql = createParamField("SQL Statement:");
      const inputSql = document.createElement("input");
      inputSql.type = "text";
      inputSql.className = "macro-param-input";
      inputSql.style.width = "220px";
      inputSql.value = params.sql || (params.queryName ? "" : "SELECT * FROM customers LIMIT 100;");
      inputSql.onchange = () => { params.sql = inputSql.value; };
      fieldSql.appendChild(inputSql);
      box.appendChild(fieldSql);

      selQ.onchange = () => {
        params.queryName = selQ.value;
        if (params.queryName) {
          const matched = qList.find(q => q.name === params.queryName);
          if (matched) {
            params.sql = matched.sql;
            inputSql.value = matched.sql;
          }
        }
      };
      break;
    }

    case "InsertRecord": {
      const fieldTbl = createParamField("Table:");
      const selTbl = document.createElement("select");
      selTbl.className = "macro-param-select";
      schemaTables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (params.table === t) opt.selected = true;
        selTbl.appendChild(opt);
      });
      if (!params.table && schemaTables[0]) params.table = schemaTables[0];
      selTbl.onchange = () => { params.table = selTbl.value; };
      fieldTbl.appendChild(selTbl);
      box.appendChild(fieldTbl);

      const fieldValues = createParamField("Fields / Values:");
      const inputVal = document.createElement("input");
      inputVal.type = "text";
      inputVal.className = "macro-param-input";
      inputVal.style.width = "270px";
      inputVal.placeholder = "name: 'Apex', email: 'a@corp.io', balance: 1000";
      inputVal.value = typeof params.fields === "object" ? JSON.stringify(params.fields) : (params.fields || params.record || "");
      inputVal.onchange = () => { params.fields = inputVal.value; };
      fieldValues.appendChild(inputVal);
      box.appendChild(fieldValues);
      break;
    }

    case "UpdateRecord": {
      const fieldTbl = createParamField("Table:");
      const selTbl = document.createElement("select");
      selTbl.className = "macro-param-select";
      schemaTables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (params.table === t) opt.selected = true;
        selTbl.appendChild(opt);
      });
      if (!params.table && schemaTables[0]) params.table = schemaTables[0];
      selTbl.onchange = () => { params.table = selTbl.value; };
      fieldTbl.appendChild(selTbl);
      box.appendChild(fieldTbl);

      const fieldSet = createParamField("SET Expression:");
      const inputSet = document.createElement("input");
      inputSet.type = "text";
      inputSet.className = "macro-param-input";
      inputSet.style.width = "180px";
      inputSet.placeholder = "tier = 'VIP', balance = balance + 100";
      inputSet.value = params.setValues || "";
      inputSet.onchange = () => { params.setValues = inputSet.value; };
      fieldSet.appendChild(inputSet);
      box.appendChild(fieldSet);

      const fieldWhere = createParamField("WHERE Condition:");
      const inputWhere = document.createElement("input");
      inputWhere.type = "text";
      inputWhere.className = "macro-param-input";
      inputWhere.style.width = "160px";
      inputWhere.placeholder = "balance > 1000";
      inputWhere.value = params.whereCondition || "";
      inputWhere.onchange = () => { params.whereCondition = inputWhere.value; };
      fieldWhere.appendChild(inputWhere);
      box.appendChild(fieldWhere);
      break;
    }

    case "DeleteRecord": {
      const fieldTbl = createParamField("Table:");
      const selTbl = document.createElement("select");
      selTbl.className = "macro-param-select";
      schemaTables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (params.table === t) opt.selected = true;
        selTbl.appendChild(opt);
      });
      if (!params.table && schemaTables[0]) params.table = schemaTables[0];
      selTbl.onchange = () => { params.table = selTbl.value; };
      fieldTbl.appendChild(selTbl);
      box.appendChild(fieldTbl);

      const fieldWhere = createParamField("WHERE Condition:");
      const inputWhere = document.createElement("input");
      inputWhere.type = "text";
      inputWhere.className = "macro-param-input";
      inputWhere.style.width = "220px";
      inputWhere.placeholder = "tier = 'Archived'";
      inputWhere.value = params.whereCondition || "";
      inputWhere.onchange = () => { params.whereCondition = inputWhere.value; };
      fieldWhere.appendChild(inputWhere);
      box.appendChild(fieldWhere);
      break;
    }

    case "MakeTable": {
      const fieldNew = createParamField("New Table:");
      const inputNew = document.createElement("input");
      inputNew.type = "text";
      inputNew.className = "macro-param-input";
      inputNew.style.width = "150px";
      inputNew.placeholder = "customers_archive";
      inputNew.value = params.newTable || "";
      inputNew.onchange = () => { params.newTable = inputNew.value; };
      fieldNew.appendChild(inputNew);
      box.appendChild(fieldNew);

      const fieldQName = createParamField("Source Query:");
      const selQ = document.createElement("select");
      selQ.className = "macro-param-select";
      selQ.style.maxWidth = "150px";

      const optCustom = document.createElement("option");
      optCustom.value = "";
      optCustom.textContent = "Custom SELECT SQL...";
      selQ.appendChild(optCustom);

      const qList = (typeof savedQueriesStore !== "undefined" && Array.isArray(savedQueriesStore)) ? savedQueriesStore : [];
      qList.forEach(q => {
        const opt = document.createElement("option");
        opt.value = q.name;
        opt.textContent = "👁️ " + q.name;
        if (params.queryName === q.name) opt.selected = true;
        selQ.appendChild(opt);
      });
      fieldQName.appendChild(selQ);
      box.appendChild(fieldQName);

      const fieldSql = createParamField("SELECT SQL:");
      const inputSql = document.createElement("input");
      inputSql.type = "text";
      inputSql.className = "macro-param-input";
      inputSql.style.width = "180px";
      inputSql.placeholder = "SELECT * FROM customers WHERE balance > 1000;";
      inputSql.value = params.selectSql || "";
      inputSql.onchange = () => { params.selectSql = inputSql.value; };
      fieldSql.appendChild(inputSql);
      box.appendChild(fieldSql);

      selQ.onchange = () => {
        params.queryName = selQ.value;
        if (params.queryName) {
          const matched = qList.find(q => q.name === params.queryName);
          if (matched) {
            params.selectSql = matched.sql;
            inputSql.value = matched.sql;
          }
        }
      };

      const fieldDrop = createParamField("Drop Existing:");
      const chkDrop = document.createElement("input");
      chkDrop.type = "checkbox";
      chkDrop.checked = params.dropExisting !== false;
      chkDrop.onchange = () => { params.dropExisting = chkDrop.checked; };
      fieldDrop.appendChild(chkDrop);
      box.appendChild(fieldDrop);
      break;
    }

    case "EmptyTable": {
      const fieldTbl = createParamField("Table to Empty:");
      const selTbl = document.createElement("select");
      selTbl.className = "macro-param-select";
      schemaTables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (params.table === t) opt.selected = true;
        selTbl.appendChild(opt);
      });
      if (!params.table && schemaTables[0]) params.table = schemaTables[0];
      selTbl.onchange = () => { params.table = selTbl.value; };
      fieldTbl.appendChild(selTbl);
      box.appendChild(fieldTbl);
      break;
    }

    case "GoToRecord": {
      const fieldRec = createParamField("Record:");
      const selRec = document.createElement("select");
      selRec.className = "macro-param-select";
      ["first", "last", "next", "previous", "new", "offset"].forEach(r => {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = r.charAt(0).toUpperCase() + r.slice(1);
        if (params.record === r) opt.selected = true;
        selRec.appendChild(opt);
      });
      fieldRec.appendChild(selRec);
      box.appendChild(fieldRec);

      const fieldOff = createParamField("Offset #:");
      fieldOff.style.display = params.record === "offset" ? "flex" : "none";
      const inputOff = document.createElement("input");
      inputOff.type = "number";
      inputOff.min = "1";
      inputOff.className = "macro-param-input";
      inputOff.style.width = "50px";
      inputOff.value = params.offset || 1;
      inputOff.onchange = () => { params.offset = parseInt(inputOff.value) || 1; };
      fieldOff.appendChild(inputOff);
      box.appendChild(fieldOff);

      selRec.onchange = () => {
        params.record = selRec.value;
        fieldOff.style.display = params.record === "offset" ? "flex" : "none";
      };
      break;
    }

    case "FindRecord": {
      const fieldFind = createParamField("Find What:");
      const inputFind = document.createElement("input");
      inputFind.type = "text";
      inputFind.className = "macro-param-input";
      inputFind.style.width = "150px";
      inputFind.placeholder = "Search term...";
      inputFind.value = params.findWhat || "";
      inputFind.onchange = () => { params.findWhat = inputFind.value; };
      fieldFind.appendChild(inputFind);
      box.appendChild(fieldFind);

      const fieldCol = createParamField("Column:");
      const inputCol = document.createElement("input");
      inputCol.type = "text";
      inputCol.className = "macro-param-input";
      inputCol.style.width = "90px";
      inputCol.placeholder = "* or column";
      inputCol.value = params.field || "*";
      inputCol.onchange = () => { params.field = inputCol.value; };
      fieldCol.appendChild(inputCol);
      box.appendChild(fieldCol);

      const fieldMatch = createParamField("Match Case:");
      const chkMatch = document.createElement("input");
      chkMatch.type = "checkbox";
      chkMatch.checked = Boolean(params.matchCase);
      chkMatch.onchange = () => { params.matchCase = chkMatch.checked; };
      fieldMatch.appendChild(chkMatch);
      box.appendChild(fieldMatch);
      break;
    }

    case "ShowAllRecords": {
      const sp = document.createElement("span");
      sp.style.color = "var(--emerald)";
      sp.style.fontSize = "11px";
      sp.textContent = "Removes any active filter and displays all records in datasheet.";
      box.appendChild(sp);
      break;
    }

    case "SetValue": {
      const fieldItem = createParamField("Item / Field:");
      const inputItem = document.createElement("input");
      inputItem.type = "text";
      inputItem.className = "macro-param-input";
      inputItem.style.width = "110px";
      inputItem.placeholder = "tier or [var]";
      inputItem.value = params.item || "";
      inputItem.onchange = () => { params.item = inputItem.value; };
      fieldItem.appendChild(inputItem);
      box.appendChild(fieldItem);

      const fieldExpr = createParamField("Expression:");
      const inputExpr = document.createElement("input");
      inputExpr.type = "text";
      inputExpr.className = "macro-param-input";
      inputExpr.style.width = "130px";
      inputExpr.placeholder = "'VIP' or 150";
      inputExpr.value = params.expression || "";
      inputExpr.onchange = () => { params.expression = inputExpr.value; };
      fieldExpr.appendChild(inputExpr);
      box.appendChild(fieldExpr);
      break;
    }

    case "SaveRecord": {
      const sp = document.createElement("span");
      sp.style.color = "var(--cyan)";
      sp.style.fontSize = "11px";
      sp.textContent = "Commits pending datasheet cell edits to SQLite database.";
      box.appendChild(sp);
      break;
    }

    case "SetWarnings": {
      const fieldWarn = createParamField("Warnings On:");
      const chkWarn = document.createElement("input");
      chkWarn.type = "checkbox";
      chkWarn.checked = Boolean(params.warningsOn);
      chkWarn.onchange = () => { params.warningsOn = chkWarn.checked; };
      fieldWarn.appendChild(chkWarn);
      box.appendChild(fieldWarn);
      const sp = document.createElement("span");
      sp.style.color = "var(--text-dim)";
      sp.style.fontSize = "11px";
      sp.style.marginLeft = "4px";
      sp.textContent = "(Uncheck to suppress confirmation dialogs)";
      box.appendChild(sp);
      break;
    }

    case "RunSQL": {
      const fieldSql = createParamField("SQL Action:");
      const inputSql = document.createElement("input");
      inputSql.type = "text";
      inputSql.className = "macro-param-input";
      inputSql.style.width = "280px";
      inputSql.placeholder = "UPDATE customers SET ...";
      inputSql.value = params.sql || "";
      inputSql.onchange = () => { params.sql = inputSql.value; };
      fieldSql.appendChild(inputSql);
      box.appendChild(fieldSql);

      const fieldTx = createParamField("Transaction:");
      const chkTx = document.createElement("input");
      chkTx.type = "checkbox";
      chkTx.checked = params.useTransaction !== false;
      chkTx.onchange = () => { params.useTransaction = chkTx.checked; };
      fieldTx.appendChild(chkTx);
      box.appendChild(fieldTx);
      break;
    }

    case "ApplyFilter": {
      const fieldCond = createParamField("WHERE Condition:");
      const inputCond = document.createElement("input");
      inputCond.type = "text";
      inputCond.className = "macro-param-input";
      inputCond.style.width = "200px";
      inputCond.placeholder = "balance > 1000";
      inputCond.value = params.condition || "";
      inputCond.onchange = () => { params.condition = inputCond.value; };
      fieldCond.appendChild(inputCond);
      box.appendChild(fieldCond);
      break;
    }

    case "MessageBox": {
      const fieldMsg = createParamField("Message:");
      const inputMsg = document.createElement("input");
      inputMsg.type = "text";
      inputMsg.className = "macro-param-input";
      inputMsg.style.width = "200px";
      inputMsg.value = params.message || "";
      inputMsg.onchange = () => { params.message = inputMsg.value; };
      fieldMsg.appendChild(inputMsg);
      box.appendChild(fieldMsg);

      const fieldType = createParamField("Type:");
      const selType = document.createElement("select");
      selType.className = "macro-param-select";
      ["information", "warning", "critical", "success"].forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (params.type === t) opt.selected = true;
        selType.appendChild(opt);
      });
      selType.onchange = () => { params.type = selType.value; };
      fieldType.appendChild(selType);
      box.appendChild(fieldType);

      const fieldBeep = createParamField("Beep:");
      const chkBeep = document.createElement("input");
      chkBeep.type = "checkbox";
      chkBeep.checked = params.beep !== false;
      chkBeep.onchange = () => { params.beep = chkBeep.checked; };
      fieldBeep.appendChild(chkBeep);
      box.appendChild(fieldBeep);
      break;
    }

    case "OpenReport": {
      const fieldTbl = createParamField("Table:");
      const selTbl = document.createElement("select");
      selTbl.className = "macro-param-select";
      schemaTables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (params.table === t) opt.selected = true;
        selTbl.appendChild(opt);
      });
      selTbl.onchange = () => { params.table = selTbl.value; };
      fieldTbl.appendChild(selTbl);
      box.appendChild(fieldTbl);

      const fieldTitle = createParamField("Title:");
      const inputTitle = document.createElement("input");
      inputTitle.type = "text";
      inputTitle.className = "macro-param-input";
      inputTitle.style.width = "140px";
      inputTitle.value = params.title || "Report";
      inputTitle.onchange = () => { params.title = inputTitle.value; };
      fieldTitle.appendChild(inputTitle);
      box.appendChild(fieldTitle);
      break;
    }

    case "ExportData": {
      const fieldTbl = createParamField("Table:");
      const selTbl = document.createElement("select");
      selTbl.className = "macro-param-select";
      schemaTables.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        if (params.table === t) opt.selected = true;
        selTbl.appendChild(opt);
      });
      selTbl.onchange = () => { params.table = selTbl.value; };
      fieldTbl.appendChild(selTbl);
      box.appendChild(fieldTbl);

      const fieldFmt = createParamField("Format:");
      const selFmt = document.createElement("select");
      selFmt.className = "macro-param-select";
      ["csv", "json", "sql"].forEach(f => {
        const opt = document.createElement("option");
        opt.value = f;
        opt.textContent = f.toUpperCase();
        if (params.format === f) opt.selected = true;
        selFmt.appendChild(opt);
      });
      selFmt.onchange = () => { params.format = selFmt.value; };
      fieldFmt.appendChild(selFmt);
      box.appendChild(fieldFmt);
      break;
    }

    case "VacuumDatabase": {
      const fieldAz = createParamField("Run ANALYZE:");
      const chkAz = document.createElement("input");
      chkAz.type = "checkbox";
      chkAz.checked = params.analyze !== false;
      chkAz.onchange = () => { params.analyze = chkAz.checked; };
      fieldAz.appendChild(chkAz);
      box.appendChild(fieldAz);
      break;
    }

    case "BackupDatabase": {
      const fieldMode = createParamField("Mode:");
      const selMode = document.createElement("select");
      selMode.className = "macro-param-select";
      ["full", "schema", "data"].forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m === "full" ? "Full Dump" : (m === "schema" ? "Schema Only" : "Data Only");
        if (params.mode === m) opt.selected = true;
        selMode.appendChild(opt);
      });
      selMode.onchange = () => { params.mode = selMode.value; };
      fieldMode.appendChild(selMode);
      box.appendChild(fieldMode);
      break;
    }

    case "SetVariable": {
      const fieldVar = createParamField("Variable Name:");
      const inputVar = document.createElement("input");
      inputVar.type = "text";
      inputVar.className = "macro-param-input";
      inputVar.style.width = "100px";
      inputVar.value = params.name || "var1";
      inputVar.onchange = () => { params.name = inputVar.value; };
      fieldVar.appendChild(inputVar);
      box.appendChild(fieldVar);

      const fieldVal = createParamField("Value / Expression:");
      const inputVal = document.createElement("input");
      inputVal.type = "text";
      inputVal.className = "macro-param-input";
      inputVal.style.width = "140px";
      inputVal.value = params.expression || "";
      inputVal.onchange = () => { params.expression = inputVal.value; };
      fieldVal.appendChild(inputVal);
      box.appendChild(fieldVal);
      break;
    }

    case "RunMacro": {
      const fieldMac = createParamField("Target Macro:");
      const selMac = document.createElement("select");
      selMac.className = "macro-param-select";
      macroStore.forEach(m => {
        if (!currentMacro || m.id !== currentMacro.id) {
          const opt = document.createElement("option");
          opt.value = m.name;
          opt.textContent = m.name;
          if (params.macroName === m.name) opt.selected = true;
          selMac.appendChild(opt);
        }
      });
      selMac.onchange = () => { params.macroName = selMac.value; };
      fieldMac.appendChild(selMac);
      box.appendChild(fieldMac);
      break;
    }

    case "Beep": {
      const fieldCnt = createParamField("Count:");
      const inputCnt = document.createElement("input");
      inputCnt.type = "number";
      inputCnt.min = "1";
      inputCnt.max = "5";
      inputCnt.className = "macro-param-input";
      inputCnt.style.width = "50px";
      inputCnt.value = params.count || 1;
      inputCnt.onchange = () => { params.count = parseInt(inputCnt.value) || 1; };
      fieldCnt.appendChild(inputCnt);
      box.appendChild(fieldCnt);
      break;
    }

    case "Requery": {
      const fieldTgt = createParamField("Target:");
      const selTgt = document.createElement("select");
      selTgt.className = "macro-param-select";
      ["active", "all", "schema", "kpis"].forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t.toUpperCase();
        if (params.target === t) opt.selected = true;
        selTgt.appendChild(opt);
      });
      selTgt.onchange = () => { params.target = selTgt.value; };
      fieldTgt.appendChild(selTgt);
      box.appendChild(fieldTgt);
      break;
    }

    case "Comment": {
      const fieldRem = createParamField("Remarks:");
      const inputRem = document.createElement("input");
      inputRem.type = "text";
      inputRem.className = "macro-param-input";
      inputRem.style.width = "320px";
      inputRem.value = params.comment || "";
      inputRem.onchange = () => { params.comment = inputRem.value; };
      fieldRem.appendChild(inputRem);
      box.appendChild(fieldRem);
      break;
    }

    default: {
      const sp = document.createElement("span");
      sp.style.color = "var(--text-dim)";
      sp.style.fontSize = "11px";
      sp.textContent = "No extra parameters required.";
      box.appendChild(sp);
      break;
    }
  }

  container.appendChild(box);
}

function createParamField(label) {
  const div = document.createElement("div");
  div.className = "macro-param-field";
  const span = document.createElement("span");
  span.className = "macro-param-label";
  span.textContent = label;
  div.appendChild(span);
  return div;
}

function addNewActionRow(actionType = "MessageBox") {
  if (!currentMacro) return;
  const def = ACCESS_ACTION_CATALOG.find(a => a.name === actionType) || ACCESS_ACTION_CATALOG[0];
  const newAction = {
    id: "step_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5),
    action: def.name,
    condition: "",
    enabled: true,
    parameters: JSON.parse(JSON.stringify(def.defaultParams))
  };
  currentMacro.actions.push(newAction);
  renderMacroMatrixTable();
  const badge = document.getElementById("macroActionCountBadge");
  if (badge) badge.textContent = currentMacro.actions.length + " Actions";
}

function quickAddAction(actionType) {
  addNewActionRow(actionType);
  showToast("Added " + actionType + " action");
}

function deleteActionRow(actionId) {
  if (!currentMacro) return;
  currentMacro.actions = currentMacro.actions.filter(a => a.id !== actionId);
  renderMacroMatrixTable();
  const badge = document.getElementById("macroActionCountBadge");
  if (badge) badge.textContent = currentMacro.actions.length + " Actions";
}

function moveActionRow(actionId, delta) {
  if (!currentMacro) return;
  const idx = currentMacro.actions.findIndex(a => a.id === actionId);
  if (idx < 0) return;
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= currentMacro.actions.length) return;
  const item = currentMacro.actions.splice(idx, 1)[0];
  currentMacro.actions.splice(targetIdx, 0, item);
  renderMacroMatrixTable();
}

// -------------------------------------------------------------------------------------------------
// Action Catalog Drawer Rendering
// -------------------------------------------------------------------------------------------------
function renderActionCatalog() {
  const container = document.getElementById("macroCatalogItems");
  if (!container) return;
  container.innerHTML = "";

  const filter = (document.getElementById("catalogSearchInput")?.value || "").toLowerCase().trim();

  const cats = {};
  ACCESS_ACTION_CATALOG.forEach(act => {
    if (filter && !act.name.toLowerCase().includes(filter) && !act.desc.toLowerCase().includes(filter)) {
      return;
    }
    cats[act.category] = cats[act.category] || [];
    cats[act.category].push(act);
  });

  Object.keys(cats).forEach(cat => {
    const catDiv = document.createElement("div");
    catDiv.className = "macro-catalog-category";
    catDiv.textContent = cat;
    container.appendChild(catDiv);

    cats[cat].forEach(act => {
      const item = document.createElement("div");
      item.className = "macro-catalog-item";
      item.innerHTML = \`
        <div class="macro-catalog-item-title">
          <span>\${act.icon}</span>
          <span>\${act.name}</span>
        </div>
        <button class="sidebar-mini-btn" style="padding: 1px 5px;" title="Add action">+ Add</button>
      \`;

      item.onmouseenter = () => {
        const descBox = document.getElementById("catalogDescBox");
        if (descBox) descBox.innerHTML = \`<b>\${act.icon} \${act.name}</b> (\${act.category})<br><span style="color:var(--text-main)">\${act.desc}</span>\`;
      };

      item.onclick = () => {
        addNewActionRow(act.name);
        showToast("Added " + act.name + " to macro");
      };

      container.appendChild(item);
    });
  });
}

function filterCatalogActions(query) {
  renderActionCatalog();
}

// -------------------------------------------------------------------------------------------------
// Sidebar Object Tree Integration
// -------------------------------------------------------------------------------------------------
function renderMacroTreeGroup(container, query) {
  const filtered = query
    ? macroStore.filter(m => m.name.toLowerCase().includes(query))
    : macroStore;

  const group = document.createElement("div");
  group.className = "tree-group";

  const header = document.createElement("div");
  header.className = "tree-header";
  header.innerHTML = \`
    <div class="tree-header-left">
      <span class="tree-arrow">▼</span>
      <span>⚡ Macros</span>
    </div>
    <div style="display: flex; align-items: center; gap: 4px;">
      <span class="tree-badge">\${filtered.length}</span>
      <button class="sidebar-mini-btn" style="padding: 0 4px; font-size: 10px;" onclick="event.stopPropagation(); createNewMacro(); switchTab('macros');" title="New Macro">+</button>
    </div>
  \`;

  const itemsList = document.createElement("div");
  itemsList.className = "tree-items";

  header.onclick = () => {
    const isHidden = itemsList.style.display === "none";
    itemsList.style.display = isHidden ? "flex" : "none";
    header.querySelector(".tree-arrow").textContent = isHidden ? "▼" : "▶";
  };

  filtered.forEach(m => {
    const row = document.createElement("div");
    row.className = "tree-item" + (currentMacro && m.id === currentMacro.id ? " active" : "");
    row.innerHTML = \`
      <span class="tree-item-title">\${m.isAutoExec ? "⚡ " : "📜 "}\${escapeHtml(m.name)}</span>
      <span class="badge" style="font-size: 9px; padding: 1px 4px;">\${m.actions.length} steps</span>
      <button class="tree-item-macro-run" onclick="event.stopPropagation(); executeSpecificMacroById('\${m.id}')" title="Execute macro now">▶</button>
    \`;

    row.onclick = () => {
      currentMacro = m;
      switchTab("macros");
      renderMacroDesigner();
    };

    itemsList.appendChild(row);
  });

  group.appendChild(header);
  group.appendChild(itemsList);
  container.appendChild(group);
}

function renderMacroTreeItems() {
  const container = document.getElementById("objectTreeContainer");
  if (!container) return;
  renderObjectTree();
}

async function executeSpecificMacroById(id) {
  const found = macroStore.find(m => m.id === id);
  if (!found) return;
  currentMacro = found;
  populateMacroSelector();
  renderMacroDesigner();
  await runCurrentMacro(false);
}

// -------------------------------------------------------------------------------------------------
// Condition Evaluation Engine
// -------------------------------------------------------------------------------------------------
function evaluateMacroCondition(condStr, scope) {
  if (!condStr || !condStr.trim()) return true;
  let expr = condStr.trim();

  // Replace [variable] syntax with scope values
  const varRegex = /\\[([a-zA-Z0-9_]+)\\]/g;
  expr = expr.replace(varRegex, (_, varName) => {
    if (varName in scope) {
      const val = scope[varName];
      if (typeof val === "string") return JSON.stringify(val);
      if (typeof val === "number" || typeof val === "boolean") return String(val);
      return JSON.stringify(val);
    }
    return "0";
  });

  try {
    const fn = new Function("scope", "with(scope) { return Boolean(" + expr + "); }");
    return Boolean(fn(scope));
  } catch (err) {
    // A broken condition must never silently run a (possibly destructive) step.
    throw new Error("Invalid condition [" + condStr + "]: " + (err.message || err));
  }
}

// -------------------------------------------------------------------------------------------------
// Access-style [Enter ...] parameter prompts (helpers shared with the server module)
// -------------------------------------------------------------------------------------------------
${extractPromptParams.toString()}
${applyPromptParams.toString()}

let macroParamCache = {};
let macroDepth = 0;

async function resolveMacroSqlParams(sql) {
  const names = extractPromptParams(sql);
  for (const name of names) {
    if (!(name in macroParamCache)) {
      const answer = window.prompt(name.replace(/^Enter\\s+/i, "Enter ") + ":", "");
      if (answer === null) throw new Error("Parameter prompt cancelled: [" + name + "]");
      macroParamCache[name] = answer;
    }
  }
  return names.length ? applyPromptParams(sql, macroParamCache) : sql;
}

// -------------------------------------------------------------------------------------------------
// Execution Engine & Single-Step Controller
// -------------------------------------------------------------------------------------------------
async function runCurrentMacro(forceSingleStep = false) {
  if (isMacroRunning) {
    showToast("A macro is already executing.");
    return;
  }
  if (!currentMacro || currentMacro.actions.length === 0) {
    showToast("No actions to run in current macro.");
    return;
  }

  // Pre-flight validation: block on errors, confirm on warnings (e.g. UPDATE/DELETE without WHERE)
  try {
    const v = await apiRequest('/api/macros/validate', { macro: currentMacro });
    const issues = (v && v.issues) || [];
    const errs = issues.filter(i => i.severity === "error");
    const warns = issues.filter(i => i.severity === "warning");
    if (errs.length) {
      errs.forEach(i => logMacroConsole("Validation: step " + i.stepIndex + ": " + i.message, "error"));
      showToast("Macro has " + errs.length + " validation error(s) - see the log.");
      return;
    }
    if (warns.length && !confirm("Warnings:\\n" + warns.map(i => "- step " + i.stepIndex + ": " + i.message).join("\\n") + "\\n\\nRun anyway?")) {
      return;
    }
  } catch (e) {}

  isMacroRunning = true;
  haltRequested = false;
  macroParamCache = {};
  macroDepth = 0;
  const isStepping = forceSingleStep || singleStepActive;

  logMacroConsole("=== Starting Macro: " + currentMacro.name + " (" + (isStepping ? "Single Step Mode" : "Normal") + ") ===", "info");
  const startTime = performance.now();

  // Initialize runtime variables scope
  macroVariables = {
    totalRows: (currentGridRows && currentGridRows.length) ? currentGridRows.length : 0,
    activeTable: activeTable || "",
    dbName: (currentKpis && currentKpis.dbName) ? currentKpis.dbName : ":memory:",
    kpiTables: (currentKpis && currentKpis.tableCount) ? currentKpis.tableCount : 0,
  };

  let stats = { executed: 0, skipped: 0, errors: 0, aborted: false };
  try {
    stats = await runMacroSteps(currentMacro);
  } finally {
    isMacroRunning = false;
  }

  const totalMs = (performance.now() - startTime).toFixed(1);
  const summary = "Completed in " + totalMs + "ms (" + stats.executed + " executed, " + stats.skipped + " skipped, " + stats.errors + " errors" + (stats.aborted ? ", stopped on error" : "") + ")";
  logMacroConsole("=== Finished Macro: " + currentMacro.name + " - " + summary + " ===", stats.errors > 0 ? "error" : "success");

  const summaryEl = document.getElementById("macroExecutionSummary");
  if (summaryEl) summaryEl.textContent = summary;

  showToast("Macro '" + currentMacro.name + "' finished (" + totalMs + "ms)");
}

// Runs one macro's steps. Access semantics: a failing step stops the macro unless the step
// (continueOnError) or the macro (onError = "continue") says otherwise.
async function runMacroSteps(macro) {
  const stats = { executed: 0, skipped: 0, errors: 0, aborted: false };
  const isStepping = singleStepActive;

  for (let i = 0; i < macro.actions.length; i++) {
    if (haltRequested) {
      logMacroConsole("Macro execution halted by user request.", "error");
      break;
    }

    const action = macro.actions[i];
    if (action.enabled === false) {
      stats.skipped++;
      continue;
    }

    const t0 = performance.now();
    try {
      const condResult = evaluateMacroCondition(action.condition, macroVariables);
      if (!condResult) {
        logMacroConsole("Step " + (i + 1) + " [" + action.action + "]: Skipped (Condition [" + action.condition + "] evaluated to false)", "skipped");
        stats.skipped++;
        continue;
      }

      highlightCurrentStepRow(action.id);

      if (isStepping) {
        const proceed = await promptSingleStepDialog(macro.name, action, i + 1, macro.actions.length);
        if (!proceed) {
          logMacroConsole("Macro halted at step " + (i + 1) + ".", "error");
          clearStepRowHighlight(action.id);
          break;
        }
      }

      const stepRes = await executeMacroAction(action);
      const stepMs = (performance.now() - t0).toFixed(1);
      logMacroConsole("Step " + (i + 1) + " [" + action.action + "]: " + (stepRes?.message || "Success") + " (" + stepMs + "ms)", "success");
      markStepRowSuccess(action.id);
      stats.executed++;
    } catch (err) {
      const stepMs = (performance.now() - t0).toFixed(1);
      logMacroConsole("Step " + (i + 1) + " [" + action.action + "] FAILED: " + (err.message || String(err)) + " (" + stepMs + "ms)", "error");
      stats.errors++;
      const keepGoing = action.continueOnError !== undefined ? Boolean(action.continueOnError) : macro.onError === "continue";
      if (!keepGoing) {
        stats.aborted = true;
        clearStepRowHighlight(action.id);
        break;
      }
      if (isStepping && !confirm("Step failed: " + err.message + "\\n\\nContinue executing remaining steps?")) {
        stats.aborted = true;
        clearStepRowHighlight(action.id);
        break;
      }
    }

    clearStepRowHighlight(action.id);
  }

  return stats;
}

// Runs the current macro on the server: "dryRun" rolls every change back, "transaction" commits
// only if all steps succeed. UI-only actions (dialogs, navigation) are not executed there.
async function runCurrentMacroOnServer(mode) {
  if (!currentMacro || currentMacro.actions.length === 0) {
    showToast("No actions to run in current macro.");
    return;
  }
  const params = {};
  const sqls = [];
  currentMacro.actions.forEach(a => {
    if (a.enabled === false) return;
    const p = a.parameters || {};
    ["sql", "selectSql"].forEach(k => { if (p[k]) sqls.push(p[k]); });
    if (p.queryName) {
      const q = (savedQueriesStore || []).find(item => item.name === p.queryName || item.id === p.queryName);
      if (q && q.sql) sqls.push(q.sql);
    }
  });
  try {
    for (const sql of sqls) {
      for (const name of extractPromptParams(sql)) {
        if (name in params) continue;
        const answer = window.prompt(name + ":", "");
        if (answer === null) { showToast("Run cancelled."); return; }
        params[name] = answer;
      }
    }
  } catch (e) {}

  const label = mode === "dryRun" ? "Dry Run (rolled back)" : "Atomic Run";
  logMacroConsole("=== " + label + ": " + currentMacro.name + " ===", "info");
  const res = await apiRequest('/api/macros/run', {
    macro: currentMacro,
    params,
    dryRun: mode === "dryRun",
    transaction: mode === "transaction",
    variables: { activeTable: activeTable || "" },
  });
  const r = (res && res.result) || {};
  (r.logs || []).forEach(l => {
    logMacroConsole("Step " + l.stepIndex + " [" + l.action + "]: " + (l.message || l.status) + " (" + l.latencyMs + "ms)", l.status === "error" ? "error" : (l.status === "skipped" ? "skipped" : "success"));
  });
  if (r.error) logMacroConsole("Error: " + r.error, "error");
  const outcome = r.committed ? "committed" : (r.rolledBack ? "rolled back" : "finished");
  const summary = label + ": " + (r.success ? "success" : "FAILED") + ", " + (r.executedSteps || 0) + " executed, " + (r.skippedSteps || 0) + " skipped, changes " + outcome;
  logMacroConsole("=== " + summary + " ===", r.success ? "success" : "error");
  const summaryEl = document.getElementById("macroExecutionSummary");
  if (summaryEl) summaryEl.textContent = summary;
  showToast(summary);
  if (r.committed) {
    try { await refreshSchema(); await refreshKpis(); if (activeTable) await fetchTableData(); } catch (e) {}
  }
}

async function executeMacroAction(action) {
  const p = action.parameters || {};

  switch (action.action) {
    case "OpenTable": {
      const targetTable = p.table || activeTable;
      if (!targetTable) throw new Error("No table specified for OpenTable");
      switchTab("grid");
      await selectTable(targetTable);
      return { message: "Opened table '" + targetTable + "' in " + (p.view || "datasheet") + " view" };
    }

    case "OpenQuery": {
      let sql = p.sql;
      if (p.queryName) {
        let q = (savedQueriesStore || []).find(item => item.name === p.queryName || item.id === p.queryName);
        if (!q && typeof loadSavedQueriesFromServer === "function") {
          try {
            const qList = await loadSavedQueriesFromServer();
            q = (qList || []).find(item => item.name === p.queryName || item.id === p.queryName);
          } catch {}
        }
        if (q) {
          sql = q.sql;
        } else if (!sql) {
          throw new Error("Saved query '" + p.queryName + "' not found");
        }
      }
      if (!sql) throw new Error("No SQL specified for OpenQuery");
      sql = await resolveMacroSqlParams(sql);
      const editor = document.getElementById("sqlEditor");
      if (editor) editor.value = sql;
      switchTab("grid");
      await runEditorQuery();
      return { message: "Executed query '" + (p.queryName || "custom") + "' and rendered datasheet" };
    }

    case "InsertRecord": {
      const targetTable = p.table || activeTable;
      if (!targetTable) throw new Error("No target table specified for InsertRecord");
      const sql = parseRecordFieldsToInsertSql(targetTable, p.fields || p.record);
      const res = await apiRequest('/api/query', { sql });
      if (!res || !res.success) throw new Error(res?.error || "InsertRecord failed");
      macroVariables.lastRowsAffected = 1;
      if (targetTable === activeTable) {
        await fetchTableData();
      }
      return { message: "Appended record into '" + targetTable + "'" };
    }

    case "UpdateRecord": {
      const targetTable = p.table || activeTable;
      if (!targetTable) throw new Error("No target table specified for UpdateRecord");
      if (!p.setValues) throw new Error("No SET expressions provided for UpdateRecord");
      const sql = buildUpdateRecordSql(targetTable, p.setValues, p.whereCondition);
      const res = await apiRequest('/api/query', { sql });
      if (!res || !res.success) throw new Error(res?.error || "UpdateRecord failed");
      const affected = res.rowsAffected !== undefined ? res.rowsAffected : 0;
      macroVariables.lastRowsAffected = affected;
      if (targetTable === activeTable) {
        await fetchTableData();
      }
      return { message: "Updated records in '" + targetTable + "' (" + affected + " rows affected)" };
    }

    case "DeleteRecord": {
      const targetTable = p.table || activeTable;
      if (!targetTable) throw new Error("No target table specified for DeleteRecord");
      const sql = buildDeleteRecordSql(targetTable, p.whereCondition);
      const res = await apiRequest('/api/query', { sql });
      if (!res || !res.success) throw new Error(res?.error || "DeleteRecord failed");
      const affected = res.rowsAffected !== undefined ? res.rowsAffected : 0;
      macroVariables.lastRowsAffected = affected;
      if (targetTable === activeTable) {
        await fetchTableData();
      }
      await refreshKpis();
      return { message: "Deleted records from '" + targetTable + "' (" + affected + " rows affected)" };
    }

    case "MakeTable": {
      const newTbl = p.newTable;
      if (!newTbl) throw new Error("No new table name specified for MakeTable");
      let selSql = p.selectSql;
      if (p.queryName) {
        let q = (savedQueriesStore || []).find(item => item.name === p.queryName || item.id === p.queryName);
        if (!q && typeof loadSavedQueriesFromServer === "function") {
          try {
            const qList = await loadSavedQueriesFromServer();
            q = (qList || []).find(item => item.name === p.queryName || item.id === p.queryName);
          } catch {}
        }
        if (q) selSql = q.sql;
      }
      if (!selSql) throw new Error("No source SELECT query or saved query provided for MakeTable");
      selSql = await resolveMacroSqlParams(selSql);
      for (const stmt of buildMakeTableStatements(newTbl, selSql, p.dropExisting !== false)) {
        const res = await apiRequest('/api/query', { sql: stmt });
        if (!res || !res.success) throw new Error(res?.error || "MakeTable failed");
      }
      await refreshSchema();
      await refreshKpis();
      return { message: "Created new table '" + newTbl + "' from query" };
    }

    case "EmptyTable": {
      const targetTable = p.table || activeTable;
      if (!targetTable) throw new Error("No table specified for EmptyTable");
      const sql = buildEmptyTableSql(targetTable);
      const res = await apiRequest('/api/query', { sql });
      if (!res || !res.success) throw new Error(res?.error || "EmptyTable failed");
      if (targetTable === activeTable) {
        await fetchTableData();
      }
      await refreshKpis();
      return { message: "Emptied all records from table '" + targetTable + "'" };
    }

    case "GoToRecord": {
      const rec = p.record || "first";
      const totalRows = (currentGridRows && currentGridRows.length) || 0;
      let targetIdx = 0;
      if (rec === "first") targetIdx = 0;
      else if (rec === "last") targetIdx = Math.max(0, totalRows - 1);
      else if (rec === "next") targetIdx = Math.min(totalRows - 1, (macroVariables.currentRowIndex || 0) + 1);
      else if (rec === "previous") targetIdx = Math.max(0, (macroVariables.currentRowIndex || 0) - 1);
      else if (rec === "offset") targetIdx = Math.max(0, Math.min(totalRows - 1, (parseInt(p.offset) || 1) - 1));
      else if (rec === "new") {
        if (typeof openAddRowModal === "function") openAddRowModal();
        return { message: "Navigated to new record insertion row" };
      }

      macroVariables.currentRowIndex = targetIdx;
      if (currentGridRows && currentGridRows[targetIdx]) {
        macroVariables.activeRow = currentGridRows[targetIdx];
      }

      // Highlight DOM row
      const gridEl = document.getElementById("mainDataGrid") || document.getElementById("dataGrid");
      if (gridEl) {
        const rows = gridEl.querySelectorAll("tbody tr");
        rows.forEach(r => r.classList.remove("macro-active-row"));
        if (rows[targetIdx]) {
          rows[targetIdx].classList.add("macro-active-row");
          rows[targetIdx].scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      return { message: "Navigated to record: " + rec + " (row " + (targetIdx + 1) + ")" };
    }

    case "FindRecord": {
      const term = String(p.findWhat || "").trim();
      if (!term) return { message: "No search term provided for FindRecord" };
      const col = p.field || "*";
      const caseSensitive = Boolean(p.matchCase);
      let matchIdx = -1;

      for (let i = 0; i < (currentGridRows || []).length; i++) {
        const row = currentGridRows[i];
        if (col === "*") {
          const matched = Object.values(row).some(v => {
            const strVal = String(v !== null && v !== undefined ? v : "");
            return caseSensitive ? strVal.includes(term) : strVal.toLowerCase().includes(term.toLowerCase());
          });
          if (matched) { matchIdx = i; break; }
        } else {
          const strVal = String(row[col] !== null && row[col] !== undefined ? row[col] : "");
          const matched = caseSensitive ? strVal.includes(term) : strVal.toLowerCase().includes(term.toLowerCase());
          if (matched) { matchIdx = i; break; }
        }
      }

      if (matchIdx !== -1) {
        macroVariables.foundRowIndex = matchIdx;
        macroVariables.currentRowIndex = matchIdx;
        macroVariables.activeRow = currentGridRows[matchIdx];
        const gridEl = document.getElementById("mainDataGrid") || document.getElementById("dataGrid");
        if (gridEl) {
          const rows = gridEl.querySelectorAll("tbody tr");
          rows.forEach(r => r.classList.remove("macro-active-row"));
          if (rows[matchIdx]) {
            rows[matchIdx].classList.add("macro-active-row");
            rows[matchIdx].scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
        return { message: "FindRecord: Matched '" + term + "' at row " + (matchIdx + 1) };
      }
      return { message: "FindRecord: No record matched '" + term + "'" };
    }

    case "ShowAllRecords": {
      const filterInput = document.getElementById("gridSearchInput");
      if (filterInput) filterInput.value = "";
      if (typeof fetchTableData === "function") {
        await fetchTableData(1);
      }
      return { message: "ShowAllRecords: Cleared active filter and refreshed all records" };
    }

    case "SetValue": {
      const item = p.item || "val";
      const expr = interpolateMacroText(p.expression || "", macroVariables);
      macroVariables[item] = expr;
      if (activeTable && macroVariables.activeRow && (macroVariables.activeRow.id || macroVariables.activeRow.rowid)) {
        let colName = item.trim();
        if (colName.startsWith("[") && colName.endsWith("]")) colName = colName.slice(1, -1);
        const colClean = quoteSqlIdentifier(colName);
        const updSql = "UPDATE " + quoteSqlIdentifier(activeTable) + " SET " + colClean + " = '" + String(expr).replace(/'/g, "''") + "' WHERE rowid = " + rowId + " OR id = " + rowId + ";";
        try {
          await apiRequest('/api/query', { sql: updSql });
          await fetchTableData();
        } catch {}
      }
      return { message: "SetValue: [" + item + "] = " + JSON.stringify(expr) };
    }

    case "SaveRecord": {
      if (typeof fetchTableData === "function") {
        await fetchTableData();
      }
      return { message: "SaveRecord: Committed active row edits" };
    }

    case "SetWarnings": {
      macroVariables.warningsOn = Boolean(p.warningsOn);
      return { message: "SetWarnings: " + (p.warningsOn ? "ON" : "OFF") };
    }

    case "RunSQL": {
      if (!p.sql) throw new Error("No SQL specified for RunSQL");
      const sql = await resolveMacroSqlParams(p.sql);
      const res = await apiRequest('/api/query', { sql });
      if (!res || !res.success) throw new Error(res?.error || "SQL execution failed");
      const changes = res.rowsAffected !== undefined ? res.rowsAffected : (res.rows ? res.rows.length : 0);
      macroVariables.lastRowsAffected = changes;
      return { message: "SQL executed successfully (" + changes + " rows affected)" };
    }

    case "ApplyFilter": {
      const cond = p.condition;
      if (!cond) return { message: "No filter condition provided" };
      if (!activeTable) throw new Error("No active table selected to filter");
      const filteredSql = \`SELECT * FROM \${quoteSqlIdentifier(activeTable)} WHERE \${cond} LIMIT 100;\`;
      const res = await apiRequest('/api/query', { sql: filteredSql });
      if (res && res.success) {
        currentGridRows = res.rows || [];
        currentGridColumns = res.columns || [];
        renderDataGrid(currentGridColumns, currentGridRows, true, res.rows.length);
        macroVariables.totalRows = currentGridRows.length;
        return { message: "Applied filter '" + cond + "' (" + currentGridRows.length + " matching records)" };
      } else {
        throw new Error(res?.error || "Filter query failed");
      }
    }

    case "Requery": {
      const target = p.target || "active";
      if (target === "active" || target === "all") {
        await fetchTableData();
      }
      if (target === "kpis" || target === "all") {
        await refreshKpis();
      }
      if (target === "schema" || target === "all") {
        await refreshSchema();
      }
      return { message: "Requery completed for target: " + target };
    }

    case "MessageBox": {
      if (p.beep) playAccessBeep(850, 1);
      await openMacroMsgBox({
        title: p.title || "SQLite Studio Pro",
        message: interpolateMacroText(p.message || "", macroVariables),
        type: p.type || "information"
      });
      return { message: "Displayed message box dialog" };
    }

    case "OpenReport": {
      const targetTable = p.table || activeTable;
      if (!targetTable) throw new Error("No table specified for OpenReport");
      if (targetTable !== activeTable) {
        await selectTable(targetTable);
      }
      openAccessReportModal();
      return { message: "Opened Microsoft Access publication report for " + targetTable };
    }

    case "ExportData": {
      const targetTable = p.table || activeTable;
      const fmt = p.format || "csv";
      if (!targetTable) throw new Error("No table specified for ExportData");
      const res = await apiRequest('/api/table/data', { table: targetTable, page: 1, pageSize: 5000 });
      if (!res || !res.success) throw new Error("Failed to load table rows for export");
      const exportRes = await apiRequest('/api/export', {
        format: fmt,
        tableName: targetTable,
        rows: res.rows || []
      });
      if (exportRes && exportRes.success) {
        return { message: "Exported " + (res.rows?.length || 0) + " rows to " + fmt.toUpperCase() + " (" + exportRes.filename + ")" };
      } else {
        throw new Error(exportRes?.error || "Export failed");
      }
    }

    case "ImportData": {
      if (typeof openImportWizard === "function") {
        openImportWizard({ targetTable: p.table || activeTable });
        return { message: "Opened Access Import Wizard" };
      }
      return { message: "Import wizard displayed" };
    }

    case "VacuumDatabase": {
      const note = await macroRunMaintenance(Boolean(p.analyze));
      await refreshKpis();
      return { message: note };
    }

    case "BackupDatabase": {
      const mode = p.mode || "full";
      return { message: await macroRunBackup(mode) };
    }

    case "SetVariable": {
      const vName = p.name || "var1";
      const val = interpolateMacroText(p.expression || "", macroVariables);
      macroVariables[vName] = val;
      return { message: "Set variable [" + vName + "] = " + JSON.stringify(val) };
    }

    case "RunMacro": {
      const targetMacroName = p.macroName;
      if (!targetMacroName) throw new Error("No target macro name provided");
      const targetMacro = macroStore.find(m => m.name === targetMacroName);
      if (!targetMacro) throw new Error("Macro '" + targetMacroName + "' not found");
      if (macroDepth >= 8) throw new Error("RunMacro nesting too deep (possible recursion)");
      logMacroConsole("--> Subroutine call to macro: " + targetMacroName, "info");
      macroDepth++;
      let sub;
      try {
        sub = await runMacroSteps(targetMacro);
      } finally {
        macroDepth--;
      }
      if (sub.aborted) throw new Error("Sub-macro '" + targetMacroName + "' stopped on error");
      return { message: "Subroutine macro '" + targetMacroName + "' executed (" + sub.executed + " steps)" };
    }

    case "StopMacro": {
      haltRequested = true;
      return { message: "Macro stopped by StopMacro action. Reason: " + (p.reason || "None") };
    }

    case "Beep": {
      const cnt = p.count || 1;
      const freq = p.frequency || 800;
      playAccessBeep(freq, cnt);
      return { message: "Emitted " + cnt + " audio chime tone(s)" };
    }

    case "CloseObject": {
      const obj = p.objectType || "activeTable";
      if (obj === "report") {
        closeAccessReportModal();
      } else {
        switchTab("grid");
      }
      return { message: "Closed object: " + obj };
    }

    case "Comment": {
      return { message: "Remark: " + (p.comment || "") };
    }

    default:
      return { message: "Action " + action.action + " completed" };
  }
}

function interpolateMacroText(text, scope) {
  return text.replace(/\\{([a-zA-Z0-9_]+)\\}/g, (_, key) => {
    return key in scope ? String(scope[key]) : "{" + key + "}";
  });
}

function highlightCurrentStepRow(actionId) {
  document.querySelectorAll(".macro-row").forEach(r => r.classList.remove("macro-step-current"));
  const row = document.getElementById("macroRow_" + actionId);
  if (row) {
    row.classList.add("macro-step-current");
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function clearStepRowHighlight(actionId) {
  const row = document.getElementById("macroRow_" + actionId);
  if (row) row.classList.remove("macro-step-current");
}

function markStepRowSuccess(actionId) {
  const row = document.getElementById("macroRow_" + actionId);
  if (row) row.classList.add("macro-step-success");
}

// -------------------------------------------------------------------------------------------------
// Single Step Debugger Dialog Controller
// -------------------------------------------------------------------------------------------------
function promptSingleStepDialog(macroName, action, stepNum, totalSteps) {
  return new Promise((resolve) => {
    singleStepResolve = resolve;
    const modal = document.getElementById("macroSingleStepModal");
    if (!modal) return resolve(true);

    document.getElementById("stepStepIndexBadge").textContent = "Step " + stepNum + " of " + totalSteps;
    document.getElementById("stepMacroNameVal").textContent = macroName;
    document.getElementById("stepConditionVal").textContent = action.condition || "True";
    document.getElementById("stepActionNameVal").textContent = action.action;
    document.getElementById("stepArgumentsVal").textContent = JSON.stringify(action.parameters || {});

    modal.style.display = "flex";
  });
}

function onSingleStepNext() {
  const modal = document.getElementById("macroSingleStepModal");
  if (modal) modal.style.display = "none";
  if (singleStepResolve) {
    singleStepResolve(true);
    singleStepResolve = null;
  }
}

function onSingleStepContinue() {
  singleStepActive = false;
  const btn = document.getElementById("btnSingleStep");
  if (btn) {
    btn.classList.remove("btn-step-active");
    btn.innerHTML = "⏯️ Single Step";
  }
  onSingleStepNext();
}

function onSingleStepHalt() {
  haltRequested = true;
  const modal = document.getElementById("macroSingleStepModal");
  if (modal) modal.style.display = "none";
  if (singleStepResolve) {
    singleStepResolve(false);
    singleStepResolve = null;
  }
}

// -------------------------------------------------------------------------------------------------
// Access Message Box Controller
// -------------------------------------------------------------------------------------------------
let msgBoxResolve = null;
function openMacroMsgBox(opts) {
  return new Promise((resolve) => {
    msgBoxResolve = resolve;
    const modal = document.getElementById("macroMsgBoxModal");
    if (!modal) {
      alert((opts.title ? opts.title + "\\n\\n" : "") + opts.message);
      return resolve(true);
    }

    document.getElementById("msgBoxTitle").textContent = opts.title || "Microsoft Access";
    document.getElementById("msgBoxText").textContent = opts.message || "";
    
    const iconEl = document.getElementById("msgBoxIcon");
    if (iconEl) {
      switch (opts.type) {
        case "critical": iconEl.textContent = "❌"; break;
        case "warning": iconEl.textContent = "⚠️"; break;
        case "success": iconEl.textContent = "✅"; break;
        default: iconEl.textContent = "ℹ️"; break;
      }
    }

    modal.style.display = "flex";
  });
}

function closeMacroMsgBox() {
  const modal = document.getElementById("macroMsgBoxModal");
  if (modal) modal.style.display = "none";
  if (msgBoxResolve) {
    msgBoxResolve(true);
    msgBoxResolve = null;
  }
}

// -------------------------------------------------------------------------------------------------
// Macro Console Logging
// -------------------------------------------------------------------------------------------------
function logMacroConsole(msg, type = "info") {
  const box = document.getElementById("macroConsoleLog");
  if (!box) return;

  const now = new Date();
  const timeStr = "[" + now.toTimeString().split(" ")[0] + "]";

  const line = document.createElement("div");
  line.className = "macro-log-line";
  line.innerHTML = \`
    <span class="macro-log-time">\${timeStr}</span>
    <span class="macro-log-tag \${type}">\${type}</span>
    <span>\${escapeHtml(msg)}</span>
  \`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function clearMacroLog() {
  const box = document.getElementById("macroConsoleLog");
  if (box) box.innerHTML = "";
}

function copyMacroLog() {
  const box = document.getElementById("macroConsoleLog");
  if (!box) return;
  const text = box.innerText;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Execution log copied to clipboard");
  }).catch(() => {
    showToast("Failed to copy log");
  });
}

// -------------------------------------------------------------------------------------------------
// Templates & Presets
// -------------------------------------------------------------------------------------------------
function applyMacroPreset(presetKey) {
  if (!presetKey) return;
  const sel = document.getElementById("macroPresetSelect");
  if (sel) sel.value = "";

  switch (presetKey) {
    case "autoexec":
      createNewMacro();
      currentMacro.name = "AutoExec";
      currentMacro.isAutoExec = true;
      currentMacro.actions = [
        { id: "step_1", action: "Comment", enabled: true, parameters: { comment: "Startup Routine: Welcomes user and opens default table" } },
        { id: "step_2", action: "MessageBox", enabled: true, parameters: { message: "Welcome to SQLite Studio Pro!", title: "AutoExec", type: "information", beep: true } },
        { id: "step_3", action: "OpenTable", enabled: true, parameters: { table: "customers", view: "datasheet", dataMode: "edit" } },
        { id: "step_4", action: "ApplyFilter", enabled: true, condition: "[totalRows] > 0", parameters: { condition: "balance > 500" } },
        { id: "step_5", action: "Requery", enabled: true, parameters: { target: "active" } }
      ];
      break;

    case "vip_audit":
      createNewMacro();
      currentMacro.name = "VIP_Customer_Audit";
      currentMacro.actions = [
        { id: "step_1", action: "Comment", enabled: true, parameters: { comment: "Filter VIP Tier Customers and launch printable report" } },
        { id: "step_2", action: "OpenTable", enabled: true, parameters: { table: "customers", view: "datasheet", dataMode: "readOnly" } },
        { id: "step_3", action: "ApplyFilter", enabled: true, parameters: { condition: "tier = 'VIP'" } },
        { id: "step_4", action: "OpenReport", enabled: true, parameters: { table: "customers", title: "VIP Tier Accounts Publication Report" } },
        { id: "step_5", action: "MessageBox", enabled: true, parameters: { message: "VIP Customer publication report generated!", title: "Report Ready", type: "success", beep: true } }
      ];
      break;

    case "maintenance":
      createNewMacro();
      currentMacro.name = "Database_Maintenance";
      currentMacro.actions = [
        { id: "step_1", action: "Comment", enabled: true, parameters: { comment: "System Maintenance & Full Backup" } },
        { id: "step_2", action: "RunSQL", enabled: true, parameters: { sql: "INSERT INTO audit_logs (action, entity, details) VALUES ('MACRO_MAINTENANCE', 'SYSTEM', 'Macro vacuum & backup executed');" } },
        { id: "step_3", action: "VacuumDatabase", enabled: true, parameters: { analyze: true } },
        { id: "step_4", action: "BackupDatabase", enabled: true, parameters: { mode: "full" } },
        { id: "step_5", action: "Beep", enabled: true, parameters: { count: 2, frequency: 900 } },
        { id: "step_6", action: "MessageBox", enabled: true, parameters: { message: "Database vacuumed, analyzed, and backed up.", title: "Maintenance Complete", type: "information", beep: true } }
      ];
      break;

    case "batch_orders":
      createNewMacro();
      currentMacro.name = "Promote_Pending_Orders";
      currentMacro.actions = [
        { id: "step_1", action: "Comment", enabled: true, parameters: { comment: "Batch update pending high-value orders to processing" } },
        { id: "step_2", action: "SetVariable", enabled: true, parameters: { name: "minThreshold", expression: "100.0" } },
        { id: "step_3", action: "RunSQL", enabled: true, parameters: { sql: "UPDATE orders SET status = 'processing' WHERE status = 'pending' AND total_amount > 100;" } },
        { id: "step_4", action: "Requery", enabled: true, parameters: { target: "all" } },
        { id: "step_5", action: "MessageBox", enabled: true, parameters: { message: "Pending orders over $100 updated to processing!", title: "Batch Update", type: "information", beep: false } }
      ];
      break;

    case "purge_logs":
      createNewMacro();
      currentMacro.name = "Purge_Old_Audit_Logs";
      currentMacro.actions = [
        { id: "step_1", action: "Comment", enabled: true, parameters: { comment: "Delete audit logs older than 30 days and reclaim space" } },
        { id: "step_2", action: "RunSQL", enabled: true, parameters: { sql: "DELETE FROM audit_logs WHERE timestamp < datetime('now', '-30 days');" } },
        { id: "step_3", action: "VacuumDatabase", enabled: true, parameters: { analyze: false } },
        { id: "step_4", action: "MessageBox", enabled: true, parameters: { message: "Audit logs purged and database vacuumed.", title: "Purge Complete", type: "information", beep: true } }
      ];
      break;
  }

  renderMacroDesigner();
  showToast("Loaded macro template: " + currentMacro.name);
}

// -------------------------------------------------------------------------------------------------
// JSON Import & Export
// -------------------------------------------------------------------------------------------------
let jsonActionCallback = null;

async function openMacroExportDialog(format = "json") {
  if (!currentMacro) return;
  const modal = document.getElementById("macroJsonModal");
  const title = document.getElementById("macroJsonModalTitle");
  const textarea = document.getElementById("macroJsonTextArea");
  const btn = document.getElementById("btnMacroJsonAction");
  const labels = { json: "JSON", sql: "SQL Script", vba: "VBA Module" };
  const exts = { json: ".macro.json", sql: ".sql", vba: ".bas" };
  const fmt = labels[format] ? format : "json";

  title.textContent = "Export Macro " + labels[fmt] + ": " + currentMacro.name;
  textarea.value = JSON.stringify(currentMacro, null, 2);
  if (fmt !== "json") {
    try {
      const res = await apiRequest('/api/macros/export', { macro: currentMacro, format: fmt });
      if (res && res.success) textarea.value = res.content;
      else textarea.value = "-- Export failed: " + ((res && res.error) || "unknown error");
    } catch (err) {
      textarea.value = "-- Export failed: " + err.message;
    }
  }
  btn.textContent = "Download " + labels[fmt] + " File";
  jsonActionCallback = () => {
    downloadJsonFile(currentMacro.name + exts[fmt], textarea.value);
    closeMacroJsonModal();
  };

  modal.style.display = "flex";
}

function openMacroImportDialog() {
  const modal = document.getElementById("macroJsonModal");
  const title = document.getElementById("macroJsonModalTitle");
  const textarea = document.getElementById("macroJsonTextArea");
  const btn = document.getElementById("btnMacroJsonAction");

  title.textContent = "Import Macro JSON";
  textarea.value = "";
  textarea.placeholder = "Paste macro JSON definition here...";
  btn.textContent = "Import Macro";
  jsonActionCallback = () => {
    try {
      const parsed = JSON.parse(textarea.value);
      if (!parsed || !parsed.name || !Array.isArray(parsed.actions)) {
        throw new Error("Invalid macro format. Must include 'name' and 'actions'.");
      }
      parsed.id = "macro_" + Date.now();
      macroStore.push(parsed);
      currentMacro = parsed;
      renderMacroDesigner();
      renderMacroTreeItems();
      saveCurrentMacro();
      closeMacroJsonModal();
      showToast("Imported macro: " + parsed.name);
    } catch (err) {
      alert("Import error: " + err.message);
    }
  };

  modal.style.display = "flex";
}

function submitMacroJsonAction() {
  if (jsonActionCallback) jsonActionCallback();
}

function closeMacroJsonModal() {
  const modal = document.getElementById("macroJsonModal");
  if (modal) modal.style.display = "none";
}

function copyMacroJsonToClipboard() {
  const textarea = document.getElementById("macroJsonTextArea");
  if (textarea) {
    navigator.clipboard.writeText(textarea.value).then(() => {
      showToast("JSON copied to clipboard");
    });
  }
}

function downloadJsonFile(filename, content) {
  const blob = new Blob([content], { type: /\.json$/i.test(filename) ? "application/json" : "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -------------------------------------------------------------------------------------------------
// AutoExec Startup Hook
// -------------------------------------------------------------------------------------------------
let autoExecTriggered = false;
async function checkAndRunAutoExec() {
  if (autoExecTriggered) return;
  autoExecTriggered = true;

  if (macroStore.length === 0) {
    await loadMacrosFromServer();
  }

  const autoExecMacro = macroStore.find(m => m.isAutoExec || m.name.toLowerCase() === "autoexec");
  if (autoExecMacro) {
    logMacroConsole("⚡ Found AutoExec startup macro. Executing initialization actions...", "info");
    currentMacro = autoExecMacro;
    populateMacroSelector();
    await runCurrentMacro(false);
  }
}

// Initial boot for macros
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    loadMacrosFromServer().then(() => {
      setTimeout(checkAndRunAutoExec, 800);
    });
  }, 400);
});
`;

// -------------------------------------------------------------------------------------------------
// Dialect-specific client script (SQLite / MySQL / PostgreSQL hosts)
// -------------------------------------------------------------------------------------------------

function macroDialectPrelude(d: MacroDialect): string {
  const sampleQueries = d === "sqlite"
    ? JSON.stringify(DEFAULT_SAMPLE_QUERIES)
    : "[]";
  const quoteId = d === "mysql"
    ? "return '`' + String(n).replace(/`/g, '``') + '`';"
    : "return '\"' + String(n).replace(/\"/g, '\"\"') + '\"';";
  const maintenance = d === "postgres"
    ? `const r = await apiRequest('/api/vacuum', { analyze: Boolean(analyze) });
  if (!r || r.success === false) throw new Error((r && r.error) || "VACUUM failed");
  return "Executed VACUUM" + (analyze ? " ANALYZE" : "");`
    : d === "mysql"
    ? `const tables = ((typeof currentSchema !== "undefined" && currentSchema && currentSchema.tables) || []).map(t => t.name);
  for (const t of tables) {
    const r = await apiRequest('/api/query', { sql: 'OPTIMIZE TABLE ' + macroQuoteId(t) });
    if (!r || r.success === false) throw new Error((r && r.error) || "OPTIMIZE failed for " + t);
    if (analyze) await apiRequest('/api/query', { sql: 'ANALYZE TABLE ' + macroQuoteId(t) });
  }
  return "Optimized" + (analyze ? " and analyzed " : " ") + tables.length + " table(s)";`
    : `await apiRequest('/api/pragma', { command: 'VACUUM;' });
  if (analyze) await apiRequest('/api/pragma', { command: 'PRAGMA optimize;' });
  return "Executed VACUUM and database optimization";`;
  const backup = d === "sqlite"
    ? `if (typeof downloadDatabaseDump === "function") {
    downloadDatabaseDump(mode);
  } else {
    await apiRequest('/api/database/dump', { mode });
  }
  return "Database backup / SQL dump triggered (" + mode + ")";`
    : `const r = await apiRequest('/api/database/dump', { mode: mode === "full" ? "all" : mode });
  if (!r || r.success === false) throw new Error((r && r.error) || "Backup failed");
  const dbName = (typeof currentKpis !== "undefined" && currentKpis && currentKpis.dbName) || "database";
  if (r.sql) downloadJsonFile(dbName + ".sql", r.sql);
  return "SQL dump generated (" + mode + ")";`;
  const shims = d === "postgres"
    ? `
// Postgres host adapters: map the shared macro engine onto this app's function names.
if (typeof window.currentGridRows === "undefined") window.currentGridRows = [];
if (typeof window.currentGridColumns === "undefined") window.currentGridColumns = [];
if (typeof window.currentKpis === "undefined") window.currentKpis = null;
if (typeof window.quoteSqlIdentifier !== "function") window.quoteSqlIdentifier = macroQuoteId;
if (typeof window.refreshKpis !== "function") window.refreshKpis = async () => { if (typeof loadKpis === "function") await loadKpis(); };
if (typeof window.refreshSchema !== "function") window.refreshSchema = async () => { if (typeof loadSchema === "function") await loadSchema(); };
if (typeof window.fetchTableData !== "function") window.fetchTableData = async (page) => { if (typeof loadTableData === "function" && activeTable) await loadTableData(typeof activeTable === "string" ? activeTable : activeTable.name, page || 1); };
if (typeof window.renderObjectTree !== "function") window.renderObjectTree = () => { if (typeof renderSidebarTree === "function") renderSidebarTree(); };
if (typeof window.renderDataGrid !== "function") window.renderDataGrid = (cols, rows, _u, total) => { if (typeof renderGridTable === "function") renderGridTable(rows, cols, total == null ? rows.length : total, 1, rows.length); };
`
    : "";
  return `
// ---- Dialect prelude (${d}) ----
const MACRO_DIALECT = ${JSON.stringify(d)};
const MACRO_BACKSLASH_ESCAPES = ${d === "mysql"};
function macroQuoteId(n) { ${quoteId} }
function macroQuoteStr(v) {
  let t = String(v);
  if (MACRO_BACKSLASH_ESCAPES) t = t.replace(/\\\\/g, "\\\\\\\\");
  return "'" + t.replace(/'/g, "''") + "'";
}
function getDefaultSampleQueries() { return ${sampleQueries}; }
async function macroRunMaintenance(analyze) {
  ${maintenance}
}
async function macroRunBackup(mode) {
  ${backup}
}
${shims}`;
}

export function buildMacroScript(d: MacroDialect = "sqlite"): string {
  const body = adaptMacroTextForDialect(MACRO_SCRIPT_BASE, d)
    .replace("applyPromptParams(sql, macroParamCache)", "applyPromptParams(sql, macroParamCache, MACRO_BACKSLASH_ESCAPES)");
  return macroDialectPrelude(d) + body;
}

export const MACRO_SCRIPT = buildMacroScript("sqlite");
