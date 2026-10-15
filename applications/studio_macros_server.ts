/**
 * Shared server side of the macro system for the networked studios
 * (MySQL Studio / Postgres Studio).
 *
 *  - MacroStore: macros + saved queries persisted as JSON per connection, so nothing is ever
 *    created inside the user's database.
 *  - runMacroAsync: the async macro engine (stop-on-error, onError policy, [Enter ...] prompts,
 *    RunMacro sub-macros, dry-run / atomic transactions on a pinned connection).
 *  - handleMacroRoute: the /api/macros/* and /api/queries/* HTTP surface.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  type MacroAction,
  type MacroDefinition,
  type MacroDialect,
  type MacroExecutionResult,
  type MacroStepExecutionLog,
  type SavedQueryDefinition,
  applyPromptParams,
  buildDeleteRecordSql,
  buildEmptyTableSql,
  buildMakeTableStatements,
  buildUpdateRecordSql,
  createDefaultMacros,
  extractPromptParams,
  macroToSqlScript,
  macroToVba,
  parseRecordFieldsToInsertSql,
  validateMacro,
} from "./sqlite_studio_macros.ts";
import { handleCodegenRequest } from "./studio_codegen.ts";

export interface MacroQueryResult {
  success: boolean;
  rows?: any[];
  columns?: string[];
  rowCount?: number;
  rowsAffected?: number;
  error?: string;
}

export type MacroQueryFn = (sql: string) => Promise<MacroQueryResult>;

export interface MacroTransaction {
  query: MacroQueryFn;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** What a studio manager has to provide so the shared engine can run against its database. */
export interface MacroAdapter {
  dialect: Exclude<MacroDialect, "sqlite">;
  /** Stable identifier of the current connection (host:port/database) used to pick the store file. */
  connectionKey(): string;
  query: MacroQueryFn;
  beginTransaction(): Promise<MacroTransaction>;
  maintenance(analyze: boolean): Promise<string>;
  backup(mode: string): Promise<string>;
  listTables(): Promise<string[]>;
}

// -------------------------------------------------------------------------------------------------
// Persistence
// -------------------------------------------------------------------------------------------------

interface StoreFile {
  macros: MacroDefinition[];
  queries: SavedQueryDefinition[];
}

export class MacroStore {
  constructor(private dialect: Exclude<MacroDialect, "sqlite">, private keyFn: () => string) {}

  private file(): string {
    const dir = process.env.STUDIO_MACRO_STORE_DIR || join(homedir(), ".bun_rad_studio", "macros");
    mkdirSync(dir, { recursive: true });
    const safe = `${this.dialect}_${this.keyFn()}`.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 120);
    return join(dir, `${safe}.json`);
  }

  private read(): StoreFile {
    const f = this.file();
    if (existsSync(f)) {
      try {
        const parsed = JSON.parse(readFileSync(f, "utf-8"));
        return { macros: parsed.macros || [], queries: parsed.queries || [] };
      } catch {}
    }
    const fresh: StoreFile = { macros: createDefaultMacros(this.dialect), queries: [] };
    this.write(fresh);
    return fresh;
  }

  private write(data: StoreFile) {
    writeFileSync(this.file(), JSON.stringify(data, null, 2));
  }

  getMacros(): MacroDefinition[] {
    return [...this.read().macros].sort((a, b) => Number(!!b.isAutoExec) - Number(!!a.isAutoExec) || a.name.localeCompare(b.name));
  }

  saveMacro(macro: MacroDefinition): { success: boolean; macro?: MacroDefinition; error?: string } {
    if (!macro || !macro.name || !String(macro.name).trim()) return { success: false, error: "Macro name is required" };
    const data = this.read();
    const name = macro.name.trim();
    const id = macro.id || `macro_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (data.macros.some((m) => m.id !== id && m.name.toLowerCase() === name.toLowerCase())) {
      return { success: false, error: `A macro named '${name}' already exists` };
    }
    const now = new Date().toISOString();
    const existing = data.macros.find((m) => m.id === id);
    const saved: MacroDefinition = {
      ...macro,
      id,
      name,
      description: macro.description || "",
      isAutoExec: !!macro.isAutoExec,
      onError: macro.onError === "continue" ? "continue" : "stop",
      actions: macro.actions || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (saved.isAutoExec) data.macros.forEach((m) => { if (m.id !== id) m.isAutoExec = false; });
    data.macros = data.macros.filter((m) => m.id !== id).concat(saved);
    this.write(data);
    return { success: true, macro: saved };
  }

  deleteMacro(idOrName: string): { success: boolean; error?: string } {
    const data = this.read();
    data.macros = data.macros.filter((m) => m.id !== idOrName && m.name !== idOrName);
    this.write(data);
    return { success: true };
  }

  getSavedQueries(): SavedQueryDefinition[] {
    return [...this.read().queries].sort((a, b) => a.name.localeCompare(b.name));
  }

  saveQuery(query: SavedQueryDefinition): { success: boolean; query?: SavedQueryDefinition; error?: string } {
    if (!query || !query.name?.trim() || !query.sql?.trim()) return { success: false, error: "Query name and SQL are required" };
    const data = this.read();
    const name = query.name.trim();
    const existing = data.queries.find((q) => q.id === query.id) || data.queries.find((q) => q.name.toLowerCase() === name.toLowerCase());
    const now = new Date().toISOString();
    const saved: SavedQueryDefinition = {
      ...query,
      id: existing?.id || query.id || `query_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    data.queries = data.queries.filter((q) => q.id !== saved.id).concat(saved);
    this.write(data);
    return { success: true, query: saved };
  }

  deleteQuery(idOrName: string): { success: boolean; error?: string } {
    const data = this.read();
    data.queries = data.queries.filter((q) => q.id !== idOrName && q.name !== idOrName);
    this.write(data);
    return { success: true };
  }
}

// -------------------------------------------------------------------------------------------------
// Execution
// -------------------------------------------------------------------------------------------------

export interface RunMacroOptions {
  transaction?: boolean;
  dryRun?: boolean;
  params?: Record<string, any>;
}

const MAX_MACRO_DEPTH = 8;
const DDL_PATTERN = /^\s*(CREATE|DROP|ALTER|TRUNCATE|RENAME)\b/i;

function evaluateCondition(condition: string, variables: Record<string, any>): boolean {
  const expr = condition.trim().replace(/\[([a-zA-Z0-9_]+)\]/g, (_, name) => {
    if (name in variables) {
      const val = variables[name];
      return typeof val === "number" || typeof val === "boolean" ? String(val) : JSON.stringify(val);
    }
    return "0";
  });
  const fn = new Function("vars", `with(vars) { return Boolean(${expr}); }`);
  return Boolean(fn(variables));
}

function resolvePrompts(sql: string, values: Record<string, any>, dialect: MacroDialect): string {
  const missing = extractPromptParams(sql).filter((n) => !(n in values));
  if (missing.length > 0) throw new Error(`Missing parameter value(s): ${missing.map((n) => `[${n}]`).join(", ")}`);
  return applyPromptParams(sql, values, dialect === "mysql");
}

/**
 * Runs a macro. With `transaction` (or `dryRun`) all steps share one pinned connection that is
 * rolled back on failure; `dryRun` always rolls back. MySQL cannot roll back DDL, so DDL steps are
 * refused in those modes instead of silently committing.
 */
export async function runMacroAsync(
  adapter: MacroAdapter,
  store: MacroStore,
  macroOrId: MacroDefinition | string,
  initialVariables: Record<string, any> = {},
  opts: RunMacroOptions = {},
): Promise<MacroExecutionResult> {
  const useTx = Boolean(opts.transaction || opts.dryRun);
  let tx: MacroTransaction | null = null;
  if (useTx) {
    try {
      tx = await adapter.beginTransaction();
    } catch (err: any) {
      return {
        success: false,
        macroName: typeof macroOrId === "string" ? macroOrId : macroOrId?.name || "Unknown",
        totalSteps: 0, executedSteps: 0, skippedSteps: 0, failedSteps: 1, totalLatencyMs: 0, logs: [],
        error: `Cannot start transaction: ${err?.message || err}`,
      };
    }
  }

  const exec: MacroQueryFn = tx ? tx.query : adapter.query;
  let result: MacroExecutionResult;
  try {
    result = await runCore(adapter, store, exec, !!tx, macroOrId, initialVariables, opts.params || {}, 0);
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch {} }
    throw err;
  }

  if (tx) {
    try {
      if (result.success && !opts.dryRun) {
        await tx.commit();
        result.committed = true;
      } else {
        await tx.rollback();
        result.rolledBack = true;
      }
    } catch (err: any) {
      try { await tx.rollback(); } catch {}
      result.success = false;
      result.rolledBack = true;
      result.error = `Transaction finalize failed: ${err?.message || err}`;
    }
  }
  if (opts.dryRun) result.dryRun = true;
  return result;
}

async function runCore(
  adapter: MacroAdapter,
  store: MacroStore,
  exec: MacroQueryFn,
  inTx: boolean,
  macroOrId: MacroDefinition | string,
  initialVariables: Record<string, any>,
  promptParams: Record<string, any>,
  depth: number,
): Promise<MacroExecutionResult> {
  const d = adapter.dialect;
  const all = store.getMacros();
  const macro: MacroDefinition | null =
    typeof macroOrId === "string"
      ? all.find((m) => m.id === macroOrId || m.name.toLowerCase() === macroOrId.toLowerCase()) || null
      : macroOrId;

  const fail = (name: string, total: number, error: string, failed = 1): MacroExecutionResult => ({
    success: false, macroName: name, totalSteps: total, executedSteps: 0, skippedSteps: 0, failedSteps: failed,
    totalLatencyMs: 0, logs: [], error,
  });

  if (!macro) return fail(typeof macroOrId === "string" ? macroOrId : "Unknown", 0, `Macro '${typeof macroOrId === "string" ? macroOrId : ""}' not found`);
  if (depth > MAX_MACRO_DEPTH) return fail(macro.name, macro.actions.length, "RunMacro nesting too deep (possible recursion)");

  const blocking = validateMacro(macro, all.map((m) => m.name)).filter((i) => i.severity === "error");
  if (blocking.length > 0) {
    return fail(
      macro.name,
      macro.actions.length,
      "Validation failed: " + blocking.map((i) => (i.stepIndex ? `step ${i.stepIndex}: ` : "") + i.message).join("; "),
      blocking.length,
    );
  }

  const tStart = performance.now();
  const logs: MacroStepExecutionLog[] = [];
  const variables: Record<string, any> = { ...initialVariables };
  let executedSteps = 0;
  let skippedSteps = 0;
  let failedSteps = 0;
  const total = macro.actions.length;
  const elapsed = () => Number((performance.now() - tStart).toFixed(2));
  const summary = (extra: Partial<MacroExecutionResult> = {}): MacroExecutionResult => ({
    success: true, macroName: macro.name, totalSteps: total, executedSteps, skippedSteps, failedSteps,
    totalLatencyMs: elapsed(), logs, variables, ...extra,
  });

  const lookupQuerySql = (name: string): string | undefined =>
    store.getSavedQueries().find((q) => q.name.toLowerCase() === String(name).toLowerCase() || q.id === name)?.sql;

  const run = async (sql: string, what: string): Promise<MacroQueryResult> => {
    if (inTx && d === "mysql" && DDL_PATTERN.test(sql)) {
      throw new Error(`${what}: MySQL commits implicitly on DDL, so it cannot run in a dry-run/atomic macro`);
    }
    const res = await exec(sql);
    if (!res.success) throw new Error(res.error || `${what} failed`);
    return res;
  };

  for (let i = 0; i < macro.actions.length; i++) {
    const act: MacroAction = macro.actions[i]!;
    if (act.enabled === false) {
      skippedSteps++;
      continue;
    }

    let conditionError: string | null = null;
    if (act.condition && act.condition.trim()) {
      try {
        if (!evaluateCondition(act.condition, variables)) {
          skippedSteps++;
          logs.push({
            stepIndex: i + 1, actionId: act.id, action: act.action, condition: act.condition, conditionMet: false,
            parameters: act.parameters || {}, status: "skipped",
            message: `Skipped: condition [${act.condition}] evaluated to false`, latencyMs: 0,
          });
          continue;
        }
      } catch (err: any) {
        conditionError = `Invalid condition [${act.condition}]: ${err?.message || err}`;
      }
    }

    const t0 = performance.now();
    const lat = () => Number((performance.now() - t0).toFixed(2));
    try {
      if (conditionError) throw new Error(conditionError);
      const p = act.parameters || {};
      const tbl = p.table || p.tableName || p.targetTable;
      let output: any = null;
      let message = `Action ${act.action} executed`;

      switch (act.action) {
        case "OpenQuery": {
          let sql: string | undefined = p.sql;
          if (p.queryName) {
            const found = lookupQuerySql(p.queryName);
            if (found) sql = found;
            else if (!sql) throw new Error(`Saved query '${p.queryName}' not found`);
          }
          if (!sql) throw new Error("OpenQuery missing SQL query or query name");
          const res = await run(resolvePrompts(sql, promptParams, d), "OpenQuery");
          output = { columns: res.columns, rowsCount: res.rows?.length || 0 };
          message = `Executed query '${p.queryName || "custom"}' (${res.rows?.length || 0} rows returned)`;
          break;
        }
        case "RunSQL": {
          const res = await run(resolvePrompts(p.sql, promptParams, d), "RunSQL");
          variables.lastRowsAffected = res.rowsAffected ?? res.rows?.length ?? 0;
          message = `Executed SQL (${variables.lastRowsAffected} rows)`;
          break;
        }
        case "InsertRecord": {
          await run(parseRecordFieldsToInsertSql(tbl, p.fields || p.record || p.values, d), "InsertRecord");
          variables.lastRowsAffected = 1;
          message = `Appended 1 record into '${tbl}'`;
          break;
        }
        case "UpdateRecord": {
          const res = await run(buildUpdateRecordSql(tbl, p.setValues || p.set || p.updates, p.whereCondition || p.where || p.condition, d), "UpdateRecord");
          variables.lastRowsAffected = res.rowsAffected ?? 0;
          message = `Updated records in '${tbl}' (${variables.lastRowsAffected} rows affected)`;
          break;
        }
        case "DeleteRecord": {
          const res = await run(buildDeleteRecordSql(tbl, p.whereCondition || p.where || p.condition, d), "DeleteRecord");
          variables.lastRowsAffected = res.rowsAffected ?? 0;
          message = `Deleted records from '${tbl}' (${variables.lastRowsAffected} rows affected)`;
          break;
        }
        case "EmptyTable": {
          const res = await run(buildEmptyTableSql(tbl, d), "EmptyTable");
          message = `Emptied table '${tbl}' (${res.rowsAffected ?? 0} rows removed)`;
          break;
        }
        case "MakeTable": {
          const newTbl = p.newTable || p.newTableName || p.tableName || p.table;
          let selectSql: string | undefined = p.selectSql || p.sourceSql || p.sql;
          if (p.queryName) {
            const found = lookupQuerySql(p.queryName);
            if (found) selectSql = found;
            else if (!selectSql) throw new Error(`Saved query '${p.queryName}' not found for MakeTable`);
          }
          if (!selectSql) throw new Error("MakeTable requires source SELECT query or saved query name");
          for (const stmt of buildMakeTableStatements(newTbl, resolvePrompts(selectSql, promptParams, d), p.dropExisting !== false, d)) {
            await run(stmt, "MakeTable");
          }
          output = { newTable: newTbl };
          message = `Created table '${newTbl}' from query`;
          break;
        }
        case "VacuumDatabase": {
          if (inTx) throw new Error("Maintenance cannot run inside a transaction; run it as a separate (non-transactional) macro");
          message = await adapter.maintenance(Boolean(p.analyze));
          break;
        }
        case "BackupDatabase": {
          message = await adapter.backup(p.mode || "all");
          break;
        }
        case "SetValue": {
          variables[p.item || "var"] = p.expression;
          message = `SetValue: [${p.item || "var"}] = ${JSON.stringify(p.expression)}`;
          break;
        }
        case "SetVariable": {
          variables[p.name || "var1"] = p.expression;
          message = `Variable [${p.name || "var1"}] set to ${JSON.stringify(p.expression)}`;
          break;
        }
        case "SetWarnings": {
          variables.warningsOn = Boolean(p.warningsOn);
          message = `SetWarnings: ${variables.warningsOn ? "ON" : "OFF"}`;
          break;
        }
        case "Comment": {
          message = `Remark: ${p.comment || ""}`;
          break;
        }
        case "RunMacro": {
          const sub = await runCore(adapter, store, exec, inTx, p.macroName, variables, promptParams, depth + 1);
          logs.push({
            stepIndex: i + 1, actionId: act.id, action: act.action, condition: act.condition, conditionMet: true,
            parameters: p, status: sub.success ? "success" : "error",
            message: sub.success ? `Sub-macro '${sub.macroName}' finished (${sub.executedSteps} steps)` : `Sub-macro '${sub.macroName}' failed: ${sub.error}`,
            output: { logs: sub.logs }, latencyMs: lat(),
          });
          executedSteps += sub.executedSteps;
          skippedSteps += sub.skippedSteps;
          Object.assign(variables, sub.variables || {});
          if (!sub.success) {
            failedSteps++;
            if (act.continueOnError ?? macro.onError === "continue") continue;
            return summary({ success: false, error: sub.error });
          }
          if (sub.halted) return summary({ halted: true });
          continue;
        }
        case "StopMacro": {
          logs.push({
            stepIndex: i + 1, actionId: act.id, action: act.action, condition: act.condition, conditionMet: true,
            parameters: p, status: "success", message: `Macro halted: ${p.reason || "Normal"}`, latencyMs: lat(),
          });
          executedSteps++;
          return summary({ halted: true });
        }
        default:
          // UI-only actions (dialogs, navigation, reports) have no server-side effect.
          message = `Validated action '${act.action}' for execution`;
      }

      logs.push({
        stepIndex: i + 1, actionId: act.id, action: act.action, condition: act.condition, conditionMet: true,
        parameters: p, status: "success", message, output, latencyMs: lat(),
      });
      executedSteps++;
    } catch (err: any) {
      failedSteps++;
      logs.push({
        stepIndex: i + 1, actionId: act.id, action: act.action, condition: act.condition, conditionMet: true,
        parameters: act.parameters || {}, status: "error", message: err?.message || String(err), latencyMs: lat(),
      });
      if (act.continueOnError ?? macro.onError === "continue") continue;
      return summary({ success: false, error: err?.message || String(err) });
    }
  }

  return summary();
}

// -------------------------------------------------------------------------------------------------
// HTTP routes
// -------------------------------------------------------------------------------------------------

/** Handles /api/macros/* and /api/queries/*; returns null when the path isn't ours. */
export async function handleMacroRoute(
  adapter: MacroAdapter,
  store: MacroStore,
  req: Request,
  pathname: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  if (!pathname.startsWith("/api/macros") && !pathname.startsWith("/api/queries") && pathname !== "/api/codegen") return null;
  const ok = (body: any, status = 200) => Response.json(body, { status, headers });
  const bad = (err: any, status = 400) => ok({ success: false, error: err?.message || String(err) }, status);
  const readBody = async () => ((await req.json().catch(() => ({}))) || {}) as any;
  const isPost = req.method === "POST";

  try {
    if ((pathname === "/api/macros/list" || pathname === "/api/macros") && (req.method === "GET" || isPost)) {
      return ok({ success: true, macros: store.getMacros() });
    }
    if (pathname === "/api/macros/save" && isPost) {
      const body = await readBody();
      const res = store.saveMacro(body.macro);
      return ok(res, res.success ? 200 : 400);
    }
    if (pathname === "/api/macros/delete" && isPost) {
      const body = await readBody();
      return ok(store.deleteMacro(body.id || body.name || ""));
    }
    if (pathname === "/api/macros/run" && isPost) {
      const body = await readBody();
      const result = await runMacroAsync(adapter, store, body.macro || body.id || body.name || "", body.variables || {}, {
        transaction: body.transaction, dryRun: body.dryRun, params: body.params,
      });
      return ok({ success: result.success, result });
    }
    if (pathname === "/api/macros/validate" && isPost) {
      const body = await readBody();
      return ok({ success: true, issues: validateMacro(body.macro, store.getMacros().map((m) => m.name)) });
    }
    if (pathname === "/api/macros/export" && isPost) {
      const body = await readBody();
      const macro: MacroDefinition | undefined = body.macro || store.getMacros().find((m) => m.id === body.id || m.name === body.id);
      if (!macro) return ok({ success: false, error: "Macro not found" }, 404);
      const queries = store.getSavedQueries();
      const format = body.format || "json";
      const content =
        format === "sql" ? macroToSqlScript(macro, queries, adapter.dialect)
        : format === "vba" ? macroToVba(macro, queries, adapter.dialect)
        : JSON.stringify(macro, null, 2);
      return ok({ success: true, format, content });
    }
    if (pathname === "/api/codegen" && isPost) {
      const body = await readBody();
      const result = handleCodegenRequest(body, {
        sourceDialect: adapter.dialect,
        queries: store.getSavedQueries(),
        macros: store.getMacros(),
        appName: adapter.dialect === "mysql" ? "MySQL Studio Pro" : "Postgres Studio Pro",
      });
      return ok({ success: true, ...result });
    }
    if (pathname === "/api/queries/list" && (req.method === "GET" || isPost)) {
      return ok({ success: true, queries: store.getSavedQueries() });
    }
    if (pathname === "/api/queries/save" && isPost) {
      const body = await readBody();
      const res = store.saveQuery(body.query);
      return ok(res, res.success ? 200 : 400);
    }
    if (pathname === "/api/queries/delete" && isPost) {
      const body = await readBody();
      return ok(store.deleteQuery(body.id || body.name || ""));
    }
  } catch (err) {
    return bad(err);
  }
  return null;
}
