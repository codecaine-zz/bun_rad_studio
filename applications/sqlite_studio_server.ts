/**
 * ⚡ Bun RAD Studio - SQLite Studio Pro Server Engine
 * 
 * High-performance background HTTP telemetry & database engine for SQLite Studio Pro.
 * Runs on a dedicated OS thread (via Bun Worker) or standalone web server, providing
 * sub-millisecond query execution, schema reflection, and live database telemetry
 * without main-thread event loop blocking.
 */

import { guardLocalRequest, writeClipboardSync } from "../src/localGuard";
import { getSharedWorkbench } from "../src/db/workbench_shared";
import { sqliteStaging } from "../src/db/staging/mount";
import { viewApi } from "../src/shared/studioViews";
import { Database } from "bun:sqlite";
import { resolve, basename } from "path";
import { existsSync, statSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { homedir } from "os";
import { generateSqliteStudioHtml } from "./sqlite_studio.ts";
import {
  type MacroAction,
  type MacroDefinition,
  type MacroExecutionResult,
  type MacroStepExecutionLog,
  type SavedQueryDefinition,
  DEFAULT_SAMPLE_MACROS,
  DEFAULT_SAMPLE_QUERIES,
  createDefaultMacros,
  createDefaultQueries,
  parseRecordFieldsToInsertSql,
  buildUpdateRecordSql,
  buildDeleteRecordSql,
  buildMakeTableSql,
  buildEmptyTableSql,
  extractPromptParams,
  applyPromptParams,
  validateMacro,
  macroToSqlScript,
  macroToVba,
} from "./sqlite_studio_macros.ts";
import { handleCodegenRequest } from "./studio_codegen.ts";
import { sqliteSampleApi } from "../src/db/samples/wiring";

export type { MacroAction, MacroDefinition, MacroExecutionResult, MacroStepExecutionLog, SavedQueryDefinition };

export interface ServerOptions {
  port?: number;
  host?: string;
  initialDbPath?: string;
  /** Folder for new sample database files (default: ~/bun_rad_samples, or BUNRAD_SAMPLE_DIR). */
  sampleDir?: string;
}

export interface TableColumnMeta {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: any;
  pk: boolean;
}

export interface TableSchemaMeta {
  name: string;
  type: "table" | "view";
  sql: string;
  rowCount: number;
  columns: TableColumnMeta[];
  indices: { name: string; unique: boolean; origin: string; columns: string[] }[];
  foreignKeys: { id: number; seq: number; table: string; from: string; to: string }[];
}

export interface DatabaseSchemaResponse {
  dbPath: string;
  dbName: string;
  isMemory: boolean;
  tables: TableSchemaMeta[];
  views: TableSchemaMeta[];
  totalTables: number;
  totalViews: number;
  totalIndices: number;
  totalRows: number;
}

export interface DatabaseKpis {
  dbPath: string;
  dbName: string;
  isMemory: boolean;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  pageSize: number;
  pageCount: number;
  freelistCount: number;
  journalMode: string;
  walMode: boolean;
  foreignKeys: boolean;
  tableCount: number;
  viewCount: number;
  indexCount: number;
  totalRows: number;
  cacheSizeKb: number;
  sqliteVersion: string;
}

export interface ColumnSpec {
  name: string;
  type?: string;
  pk?: boolean;
  autoinc?: boolean;
  notnull?: boolean;
  unique?: boolean;
  default?: string | number | null;
  check?: string;
  fkTable?: string;
  fkColumn?: string;
  fkOnDelete?: string;
}

/** Quote an SQL identifier. */
function qi(name: string): string {
  const s = String(name ?? "");
  if (!s.trim() || s.includes("\0")) throw new Error("Invalid or empty identifier");
  return `"${s.replace(/"/g, '""')}"`;
}

/** Turn a user typed default value into a safe SQL literal. */
function defaultLiteral(v: string): string {
  const s = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (/^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|NULL|TRUE|FALSE)$/i.test(s)) return s.toUpperCase();
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlLiteral(v: any): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Uint8Array) return `X'${Buffer.from(v).toString("hex")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Make a result row JSON-safe (BLOBs become a readable placeholder, BigInts become numbers/strings). */
function sanitizeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v instanceof Uint8Array) out[k] = `[BLOB ${v.byteLength} bytes]`;
    else if (typeof v === "bigint") out[k] = Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
    else out[k] = v;
  }
  return out;
}

// -------------------------------------------------------------------------------------------------
// Database Manager
// -------------------------------------------------------------------------------------------------

export class SqliteManager {
  public db: Database;
  public activePath: string;
  public isMemory: boolean;

  constructor(dbPath: string = ":memory:") {
    this.activePath = dbPath;
    this.isMemory = dbPath === ":memory:";
    this.db = new Database(dbPath);
    this.initPragmas();
    if (this.isMemory) {
      this.seedEnterpriseDatabase();
    }
  }

  private initPragmas() {
    try {
      this.db.run("PRAGMA foreign_keys = ON;");
      if (!this.isMemory) {
        this.db.run("PRAGMA journal_mode = WAL;");
      }
    } catch {}
  }

  public connect(newPath: string): { success: boolean; path: string; error?: string } {
    try {
      const raw = (newPath || "").trim();
      let targetPath = ":memory:";
      if (raw && raw !== ":memory:") {
        if (raw.startsWith("~/") || raw === "~") {
          targetPath = resolve(homedir(), raw.slice(2));
        } else {
          targetPath = resolve(process.cwd(), raw);
        }
      }

      const newDb = new Database(targetPath);
      
      // Close old if not memory
      try { this.db.close(); } catch {}
      
      this.db = newDb;
      this.activePath = targetPath;
      this.isMemory = targetPath === ":memory:";
      this.initPragmas();

      if (this.isMemory) {
        this.seedEnterpriseDatabase();
      }

      this.logAudit("DB_CONNECT", "SYSTEM", `Switched connection to ${targetPath}`);
      return { success: true, path: this.activePath };
    } catch (err: any) {
      return { success: false, path: this.activePath, error: err?.message || String(err) };
    }
  }

  public getWorkspaceDatabases(): { name: string; path: string; sizeFormatted: string; isMemory?: boolean; isCurrent?: boolean }[] {
    const list: { name: string; path: string; sizeFormatted: string; isMemory?: boolean; isCurrent?: boolean }[] = [
      {
        name: ":memory: (In-Memory RAM)",
        path: ":memory:",
        sizeFormatted: "0 B (RAM)",
        isMemory: true,
        isCurrent: this.isMemory,
      },
    ];

    const searchDirs = [process.cwd()];
    const potentialSubdirs = ["data", "db", "databases", "fixtures", "tests", ".sqlite_uploads"];
    for (const sub of potentialSubdirs) {
      const p = resolve(process.cwd(), sub);
      if (existsSync(p) && statSync(p).isDirectory()) {
        searchDirs.push(p);
      }
    }

    const seen = new Set<string>();
    const extRegex = /\.(sqlite|db|sqlite3|db3)$/i;

    for (const dir of searchDirs) {
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (extRegex.test(file)) {
            const fullPath = resolve(dir, file);
            if (!seen.has(fullPath) && existsSync(fullPath)) {
              seen.add(fullPath);
              const st = statSync(fullPath);
              list.push({
                name: file,
                path: fullPath,
                sizeFormatted: formatBytes(st.size),
                isCurrent: fullPath === this.activePath,
              });
            }
          }
        }
      } catch {}
    }

    return list;
  }

  public getKpis(): DatabaseKpis {
    let fileSizeBytes = 0;
    let fileSizeFormatted = "0 B (RAM)";
    if (!this.isMemory && existsSync(this.activePath)) {
      try {
        fileSizeBytes = statSync(this.activePath).size;
        fileSizeFormatted = formatBytes(fileSizeBytes);
      } catch {}
    }

    const getPragma = (name: string): any => {
      try {
        const row = this.db.query(`PRAGMA ${name};`).get() as any;
        if (!row) return null;
        return Object.values(row)[0];
      } catch {
        return null;
      }
    };

    const pageSize = Number(getPragma("page_size")) || 4096;
    const pageCount = Number(getPragma("page_count")) || 0;
    const freelistCount = Number(getPragma("freelist_count")) || 0;
    const journalMode = String(getPragma("journal_mode") || "delete").toUpperCase();
    const foreignKeys = Boolean(Number(getPragma("foreign_keys")) === 1);
    const cacheSizePages = Math.abs(Number(getPragma("cache_size")) || 2000);
    const cacheSizeKb = Math.round((cacheSizePages * pageSize) / 1024);

    // Schema counts
    let tableCount = 0;
    let viewCount = 0;
    let indexCount = 0;
    let totalRows = 0;

    try {
      const items = (this.db.query("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_studio_%';").all() as any[]) || [];
      items.forEach((item) => {
        if (item.type === "table") tableCount++;
        else if (item.type === "view") viewCount++;
        else if (item.type === "index") indexCount++;
      });

      // Count rows across all user tables
      const tables = items.filter((i) => i.type === "table");
      for (const t of tables) {
        try {
          const c = (this.db.query(`SELECT count(*) as c FROM "${String(t.name).replace(/"/g, "\"\"")}";`).get() as any)?.c || 0;
          totalRows += Number(c);
        } catch {}
      }
    } catch {}

    const sqliteVersion = String((this.db.query("SELECT sqlite_version() as v;").get() as any)?.v || "3.45.0");

    return {
      dbPath: this.activePath,
      dbName: this.isMemory ? ":memory:" : basename(this.activePath),
      isMemory: this.isMemory,
      fileSizeBytes,
      fileSizeFormatted,
      pageSize,
      pageCount,
      freelistCount,
      journalMode,
      walMode: journalMode === "WAL",
      foreignKeys,
      tableCount,
      viewCount,
      indexCount,
      totalRows,
      cacheSizeKb,
      sqliteVersion,
    };
  }

  public getSchema(): DatabaseSchemaResponse {
    const tablesMeta: TableSchemaMeta[] = [];
    const viewsMeta: TableSchemaMeta[] = [];
    let totalIndices = 0;
    let totalRows = 0;

    const masterItems = (this.db.query(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_studio_%' ORDER BY type, name;"
    ).all() as any[]) || [];

    for (const item of masterItems) {
      if (item.type !== "table" && item.type !== "view") continue;
      const isTable = item.type === "table";
      let rowCount = 0;
      if (isTable) {
        try {
          rowCount = Number((this.db.query(`SELECT count(*) as c FROM "${String(item.name).replace(/"/g, "\"\"")}";`).get() as any)?.c || 0);
          totalRows += rowCount;
        } catch {}
      }

      // Column metadata
      let columns: TableColumnMeta[] = [];
      try {
        const colsRaw = (this.db.query(`PRAGMA table_info("${String(item.name).replace(/"/g, "\"\"")}");`).all() as any[]) || [];
        columns = colsRaw.map((c) => ({
          cid: c.cid,
          name: c.name,
          type: c.type || "ANY",
          notnull: Boolean(c.notnull),
          dflt_value: c.dflt_value,
          pk: Boolean(c.pk),
        }));
      } catch {}

      // Index metadata
      let indices: any[] = [];
      if (isTable) {
        try {
          const idxRaw = (this.db.query(`PRAGMA index_list("${String(item.name).replace(/"/g, "\"\"")}");`).all() as any[]) || [];
          indices = idxRaw.map((idx) => {
            let cols: string[] = [];
            try {
              const idxInfo = (this.db.query(`PRAGMA index_info("${String(idx.name).replace(/"/g, "\"\"")}");`).all() as any[]) || [];
              cols = idxInfo.map((ii) => ii.name);
            } catch {}
            return {
              name: idx.name,
              unique: Boolean(idx.unique),
              origin: idx.origin,
              columns: cols,
            };
          });
          totalIndices += indices.length;
        } catch {}
      }

      // Foreign key metadata
      let foreignKeys: any[] = [];
      if (isTable) {
        try {
          foreignKeys = (this.db.query(`PRAGMA foreign_key_list("${String(item.name).replace(/"/g, "\"\"")}");`).all() as any[]) || [];
        } catch {}
      }

      const meta: TableSchemaMeta = {
        name: item.name,
        type: isTable ? "table" : "view",
        sql: item.sql || "",
        rowCount,
        columns,
        indices,
        foreignKeys,
      };

      if (isTable) {
        tablesMeta.push(meta);
      } else {
        viewsMeta.push(meta);
      }
    }

    return {
      dbPath: this.activePath,
      dbName: this.isMemory ? ":memory:" : basename(this.activePath),
      isMemory: this.isMemory,
      tables: tablesMeta,
      views: viewsMeta,
      totalTables: tablesMeta.length,
      totalViews: viewsMeta.length,
      totalIndices,
      totalRows,
    };
  }

  /** Create / check / edit / drop a view (see src/shared/studioViews.ts). */
  public async viewOp(op: "check" | "create" | "definition" | "drop", body: any) {
    const db = this.db;
    const run = async (s: string) => db.query(s).all() as any[];
    const res = await viewApi(op, body, {
      dialect: "sqlite",
      run,
      tx: async (fn: (r: typeof run) => Promise<void>) => {
        db.run("BEGIN");
        try { await fn(run); db.run("COMMIT"); } catch (e) { try { db.run("ROLLBACK"); } catch {} throw e; }
      },
      rollbackProbe: async (fn: (r: typeof run) => Promise<void>) => {
        db.run("BEGIN");
        try { await fn(run); } finally { try { db.run("ROLLBACK"); } catch {} }
      },
      describe: async (sel: string) => [...db.query(sel).columnNames],
    });
    if (res.success && (op === "create" || op === "drop")) this.logAudit(op === "drop" ? "DROP_VIEW" : "CREATE_VIEW", String(body.name), String(res.ddl || "").replace(/\s+/g, " ").slice(0, 150));
    return res;
  }

  public query(sql: string, params: any[] = []): {
    success: boolean;
    rows?: Record<string, any>[];
    columns?: string[];
    rowCount?: number;
    rowsAffected?: number;
    lastInsertRowid?: number;
    latencyMs?: number;
    error?: string;
  } {
    const trimmed = sql.trim();
    if (!trimmed) {
      return { success: false, error: "Query statement is empty" };
    }

    const t0 = performance.now();
    try {
      const isRead = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)/i.test(trimmed);

      if (isRead) {
        const stmt = this.db.query(trimmed);
        const rows = (stmt.all(...params) as Record<string, any>[]) || [];
        const latencyMs = Number((performance.now() - t0).toFixed(2));
        const columns = rows.length > 0 ? Object.keys(rows[0]!) : this.extractColumnsFromQuery(trimmed);

        this.logAudit("SELECT", "QUERY", trimmed.slice(0, 150));
        return {
          success: true,
          rows,
          columns,
          rowCount: rows.length,
          latencyMs,
        };
      } else {
        // Mutation or DDL
        const result = this.db.run(trimmed, ...params);
        const latencyMs = Number((performance.now() - t0).toFixed(2));

        this.logAudit("MUTATION", "STATEMENT", trimmed.slice(0, 150));
        return {
          success: true,
          rows: [],
          columns: [],
          rowsAffected: result.changes,
          lastInsertRowid: Number(result.lastInsertRowid),
          latencyMs,
        };
      }
    } catch (err: any) {
      const latencyMs = Number((performance.now() - t0).toFixed(2));
      return {
        success: false,
        latencyMs,
        error: err?.message || String(err),
      };
    }
  }

  public explain(sql: string): {
    success: boolean;
    queryPlan?: { id: number; parent: number; notused: number; detail: string; isScan: boolean; isIndex: boolean }[];
    rawPlan?: any[];
    latencyMs?: number;
    error?: string;
  } {
    const trimmed = sql.trim();
    if (!trimmed) return { success: false, error: "SQL statement is required for explain" };

    const t0 = performance.now();
    try {
      const cleanSql = trimmed.replace(/^EXPLAIN\s+QUERY\s+PLAN\s+/i, "");
      const singleSql = (cleanSql.split(";")[0] ?? "").trim();
      if (!singleSql) return { success: false, error: "SQL statement is required for explain" };
      const explainRows = (this.db.query(`EXPLAIN QUERY PLAN ${singleSql};`).all() as any[]) || [];
      const latencyMs = Number((performance.now() - t0).toFixed(2));

      const queryPlan = explainRows.map((row) => {
        const detail = String(row.detail || "");
        const isScan = /SCAN\s+TABLE/i.test(detail);
        const isIndex = /USING\s+INDEX|SEARCH\s+TABLE/i.test(detail);
        return {
          id: Number(row.id || 0),
          parent: Number(row.parent || 0),
          notused: Number(row.notused || 0),
          detail,
          isScan,
          isIndex,
        };
      });

      return {
        success: true,
        queryPlan,
        rawPlan: explainRows,
        latencyMs,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
      };
    }
  }

  public getTableData(
    table: string,
    options: { page?: number; pageSize?: number; orderBy?: string; orderDir?: "ASC" | "DESC"; search?: string } = {}
  ): {
    success: boolean;
    table: string;
    rows?: any[];
    columns?: string[];
    totalRows?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    latencyMs?: number;
    editable?: boolean;
    isView?: boolean;
    pkColumns?: string[];
    error?: string;
  } {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(500, Math.max(1, options.pageSize || 25));
    const offset = (page - 1) * pageSize;

    const t0 = performance.now();
    try {
      // Validate table exists using parameterized query
      const exists = (this.db.query("SELECT name, type FROM sqlite_master WHERE (type='table' OR type='view') AND name = ?;").get(table) as any);
      if (!exists) {
        return { success: false, table, error: `Table or view '${table}' does not exist` };
      }

      // Column metadata with safely escaped table identifier
      const escapedTable = table.replace(/"/g, '""');
      const colsRaw = (this.db.query(`PRAGMA table_info("${escapedTable}");`).all() as any[]) || [];
      const columns = colsRaw.map((c) => c.name);

      // Where filter for search
      let whereClause = "";
      const params: any[] = [];
      if (options.search && options.search.trim() && columns.length > 0) {
        const searchVal = `%${options.search.trim()}%`;
        const conditions = columns.map((col) => `CAST("${col.replace(/"/g, '""')}" AS TEXT) LIKE ?`);
        whereClause = `WHERE (${conditions.join(" OR ")})`;
        columns.forEach(() => params.push(searchVal));
      }

      // Total count
      const countSql = `SELECT count(*) as total FROM "${escapedTable}" ${whereClause};`;
      const countStmt = this.db.query(countSql);
      const totalRows = Number((countStmt.get(...params) as any)?.total || 0);

      // Order by
      let orderClause = "";
      if (options.orderBy && columns.includes(options.orderBy)) {
        const dir = options.orderDir === "DESC" ? "DESC" : "ASC";
        orderClause = `ORDER BY "${options.orderBy.replace(/"/g, '""')}" ${dir}`;
      }

      // Data fetch (tables expose their rowid as __rowid__ so every row is addressable)
      const isTable = (exists as any).type === "table";
      let hasRowid = false;
      if (isTable) {
        try { this.db.query(`SELECT rowid FROM "${escapedTable}" LIMIT 0;`).all(); hasRowid = true; } catch {}
      }
      const selectList = hasRowid ? `rowid AS "__rowid__", *` : `*`;
      const dataSql = `SELECT ${selectList} FROM "${escapedTable}" ${whereClause} ${orderClause} LIMIT ? OFFSET ?;`;
      const dataStmt = this.db.query(dataSql);
      const rows = ((dataStmt.all(...params, pageSize, offset) as Record<string, any>[]) || []).map(sanitizeRow);
      const latencyMs = Number((performance.now() - t0).toFixed(2));

      return {
        success: true,
        table,
        rows,
        columns,
        totalRows,
        page,
        pageSize,
        totalPages: Math.ceil(totalRows / pageSize) || 1,
        latencyMs,
        editable: isTable && hasRowid,
        isView: !isTable,
        pkColumns: colsRaw.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name),
      };
    } catch (err: any) {
      return { success: false, table, error: err?.message || String(err) };
    }
  }

  public mutateRow(
    table: string,
    action: "insert" | "update" | "delete",
    payload: { rowId?: any; rowIds?: any[]; pkColumn?: string; useRowid?: boolean; data?: Record<string, any> }
  ): { success: boolean; rowsAffected?: number; lastInsertRowid?: number; error?: string } {
    try {
      // 1. Verify table exists in sqlite_master
      const exists = (this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;").get(table) as any);
      if (!exists) {
        return { success: false, error: `Table '${table}' does not exist (views are read-only)` };
      }

      // 2. Fetch verified columns from schema
      const escapedTable = table.replace(/"/g, '""');
      const colsRaw = (this.db.query(`PRAGMA table_info("${escapedTable}");`).all() as any[]) || [];
      const validCols = new Set(colsRaw.map(c => c.name));

      // Row key: SQLite rowid (works for every ordinary table) or a named single column.
      let keyExpr = "rowid";
      const pkCol = payload.useRowid ? "" : (payload.pkColumn || "id");
      if (!payload.useRowid) {
        if (!validCols.has(pkCol)) {
          return { success: false, error: `Invalid primary key column '${pkCol}'` };
        }
        keyExpr = `"${pkCol.replace(/"/g, '""')}"`;
      }

      if (action === "delete") {
        const ids = payload.rowIds ?? (payload.rowId !== undefined ? [payload.rowId] : []);
        if (ids.length === 0) throw new Error("rowId is required for deletion");
        let changes = 0;
        this.db.run("BEGIN;");
        try {
          for (const id of ids) {
            changes += this.db.run(`DELETE FROM "${escapedTable}" WHERE ${keyExpr} = ?;`, [id]).changes;
          }
          this.db.run("COMMIT;");
        } catch (e) {
          try { this.db.run("ROLLBACK;"); } catch {}
          throw e;
        }
        this.logAudit("DELETE", table, `Deleted ${changes} row(s)`);
        return { success: true, rowsAffected: changes };
      }

      if (action === "update") {
        if (payload.rowId === undefined || !payload.data) throw new Error("rowId and data required for update");
        const entries = Object.entries(payload.data).filter(([k]) => k !== pkCol && validCols.has(k));
        if (entries.length === 0) return { success: true, rowsAffected: 0 };

        const setClause = entries.map(([k]) => `"${k.replace(/"/g, '""')}" = ?`).join(", ");
        const values = entries.map(([, v]) => v);
        values.push(payload.rowId);

        const res = this.db.run(`UPDATE "${escapedTable}" SET ${setClause} WHERE ${keyExpr} = ?;`, values);
        this.logAudit("UPDATE", table, `Updated ${payload.useRowid ? "rowid" : pkCol}=${payload.rowId} (${entries.length} cols)`);
        return { success: true, rowsAffected: res.changes };
      }

      if (action === "insert") {
        if (!payload.data) throw new Error("data object is required for insert");
        const keys = Object.keys(payload.data).filter(k => validCols.has(k));

        if (keys.length === 0) {
          const res = this.db.run(`INSERT INTO "${escapedTable}" DEFAULT VALUES;`);
          this.logAudit("INSERT", table, `Inserted default row id=${res.lastInsertRowid}`);
          return { success: true, rowsAffected: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
        }

        const cols = keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(", ");
        const placeholders = keys.map(() => "?").join(", ");
        const values = keys.map((k) => payload.data![k]);

        const res = this.db.run(`INSERT INTO "${escapedTable}" (${cols}) VALUES (${placeholders});`, values);
        this.logAudit("INSERT", table, `Inserted new row id=${res.lastInsertRowid}`);
        return { success: true, rowsAffected: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
      }

      return { success: false, error: "Invalid mutation action" };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Schema Designer operations (table design, no SQL needed)
  // -----------------------------------------------------------------------------------------------

  private buildColumnDef(c: ColumnSpec, inlinePk: boolean): string {
    const type = String(c.type || "").trim();
    if (!/^[A-Za-z0-9_ (),]*$/.test(type)) throw new Error(`Invalid column type '${type}'`);
    let def = `${qi(c.name)}${type ? " " + type : ""}`;
    if (inlinePk && c.pk) {
      def += " PRIMARY KEY";
      if (c.autoinc && /^INTEGER$/i.test(type)) def += " AUTOINCREMENT";
    }
    if (c.notnull && !(inlinePk && c.pk)) def += " NOT NULL";
    if (c.unique && !c.pk) def += " UNIQUE";
    if (c.default !== undefined && c.default !== null && String(c.default) !== "") {
      def += ` DEFAULT ${defaultLiteral(String(c.default))}`;
    }
    if (c.check && String(c.check).trim()) {
      const chk = String(c.check).trim();
      if (/[;]|--|\/\*/.test(chk)) throw new Error("CHECK expression may not contain ';' or comments");
      def += ` CHECK (${chk})`;
    }
    if (c.fkTable) {
      def += ` REFERENCES ${qi(c.fkTable)}`;
      if (c.fkColumn) def += `(${qi(c.fkColumn)})`;
      const od = String(c.fkOnDelete || "").toUpperCase();
      if (["CASCADE", "SET NULL", "RESTRICT", "NO ACTION", "SET DEFAULT"].includes(od)) def += ` ON DELETE ${od}`;
    }
    return def;
  }

  public buildCreateTableSql(name: string, columns: ColumnSpec[]): string {
    if (!name || !String(name).trim()) throw new Error("Table name is required");
    if (!columns || columns.length === 0) throw new Error("A table needs at least one column");
    const seen = new Set<string>();
    for (const c of columns) {
      if (!c.name || !String(c.name).trim()) throw new Error("Every column needs a name");
      const k = c.name.toLowerCase();
      if (seen.has(k)) throw new Error(`Duplicate column name '${c.name}'`);
      seen.add(k);
    }
    const pks = columns.filter((c) => c.pk);
    const inlinePk = pks.length === 1;
    const parts = columns.map((c) => this.buildColumnDef(c, inlinePk));
    if (pks.length > 1) parts.push(`PRIMARY KEY (${pks.map((c) => qi(c.name)).join(", ")})`);
    return `CREATE TABLE ${qi(name)} (\n  ${parts.join(",\n  ")}\n);`;
  }

  public createTable(name: string, columns: ColumnSpec[]): { success: boolean; sql?: string; error?: string } {
    try {
      const sql = this.buildCreateTableSql(name, columns);
      this.db.run(sql);
      this.logAudit("CREATE_TABLE", name, `${columns.length} columns`);
      return { success: true, sql };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  /**
   * Redesign an existing table (rename it, change/add/remove columns, change types & constraints)
   * by rebuilding it safely: create new table -> copy mapped data -> swap -> restore indexes/triggers.
   */
  public redesignTable(
    oldName: string,
    newName: string,
    columns: (ColumnSpec & { origName?: string })[]
  ): { success: boolean; sql?: string; error?: string } {
    const tmp = `__redesign_${Date.now()}`;
    let fkWasOn = true;
    try {
      const exists = this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;").get(oldName);
      if (!exists) throw new Error(`Table '${oldName}' does not exist`);
      const finalName = (newName || oldName).trim();
      if (finalName.toLowerCase() !== oldName.toLowerCase()) {
        const clash = this.db.query("SELECT name FROM sqlite_master WHERE name = ? COLLATE NOCASE;").get(finalName);
        if (clash) throw new Error(`An object named '${finalName}' already exists`);
      }

      const createSql = this.buildCreateTableSql(tmp, columns);
      const aux = (this.db.query("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index','trigger') AND sql IS NOT NULL;").all(oldName) as any[]).map((r) => String(r.sql));
      const oldCols = new Set((this.db.query(`PRAGMA table_info(${qi(oldName)});`).all() as any[]).map((c) => c.name));
      const mapped = columns.filter((c) => c.origName && oldCols.has(c.origName));

      fkWasOn = Number((this.db.query("PRAGMA foreign_keys;").get() as any)?.foreign_keys) === 1;
      this.db.run("PRAGMA foreign_keys = OFF;");
      this.db.run("BEGIN;");
      try {
        this.db.run(createSql);
        if (mapped.length > 0) {
          const dst = mapped.map((c) => qi(c.name)).join(", ");
          const src = mapped.map((c) => qi(c.origName!)).join(", ");
          this.db.run(`INSERT INTO ${qi(tmp)} (${dst}) SELECT ${src} FROM ${qi(oldName)};`);
        }
        this.db.run(`DROP TABLE ${qi(oldName)};`);
        this.db.run(`ALTER TABLE ${qi(tmp)} RENAME TO ${qi(finalName)};`);
        const skipped: string[] = [];
        for (const s of aux) {
          try { this.db.run(s); } catch { skipped.push(s); }
        }
        this.db.run("COMMIT;");
        if (skipped.length) this.logAudit("REDESIGN_WARN", finalName, `${skipped.length} index/trigger(s) could not be restored`);
      } catch (e) {
        try { this.db.run("ROLLBACK;"); } catch {}
        throw e;
      } finally {
        if (fkWasOn) this.db.run("PRAGMA foreign_keys = ON;");
      }
      this.logAudit("REDESIGN_TABLE", finalName, `${columns.length} columns`);
      return { success: true, sql: createSql.replace(tmp, finalName) };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public renameTable(oldName: string, newName: string): { success: boolean; error?: string } {
    try {
      if (!newName || !newName.trim()) throw new Error("New name is required");
      this.db.run(`ALTER TABLE ${qi(oldName)} RENAME TO ${qi(newName.trim())};`);
      this.logAudit("RENAME_TABLE", oldName, `-> ${newName}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public dropObject(kind: "table" | "view" | "index" | "trigger", name: string): { success: boolean; error?: string } {
    try {
      if (!["table", "view", "index", "trigger"].includes(kind)) throw new Error("Invalid object type");
      const row = this.db.query("SELECT name FROM sqlite_master WHERE type = ? AND name = ?;").get(kind, name);
      if (!row) throw new Error(`${kind} '${name}' does not exist`);
      this.db.run(`DROP ${kind.toUpperCase()} ${qi(name)};`);
      this.logAudit("DROP_" + kind.toUpperCase(), name, "Dropped via GUI");
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public createIndex(spec: { name: string; table: string; columns: string[]; unique?: boolean }): { success: boolean; sql?: string; error?: string } {
    try {
      if (!spec.name?.trim()) throw new Error("Index name is required");
      if (!spec.columns || spec.columns.length === 0) throw new Error("Pick at least one column");
      const sql = `CREATE ${spec.unique ? "UNIQUE " : ""}INDEX ${qi(spec.name.trim())} ON ${qi(spec.table)} (${spec.columns.map(qi).join(", ")});`;
      this.db.run(sql);
      this.logAudit("CREATE_INDEX", spec.name, spec.table);
      return { success: true, sql };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public createView(name: string, selectSql: string): { success: boolean; error?: string } {
    try {
      if (!name?.trim()) throw new Error("View name is required");
      const body = String(selectSql || "").trim().replace(/;+\s*$/, "");
      if (!/^\s*(SELECT|WITH)\b/i.test(body)) throw new Error("A view must be defined by a SELECT statement");
      this.db.run(`CREATE VIEW ${qi(name.trim())} AS ${body};`);
      this.logAudit("CREATE_VIEW", name, "Created via GUI");
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public getTableDetails(table: string): { success: boolean; sql?: string; triggers?: { name: string; sql: string }[]; error?: string } {
    try {
      const row = this.db.query("SELECT sql FROM sqlite_master WHERE name = ? AND type IN ('table','view');").get(table) as any;
      if (!row) throw new Error("Not found");
      const triggers = this.db.query("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name = ?;").all(table) as any[];
      return { success: true, sql: row.sql, triggers };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Import / Export engine
  // -----------------------------------------------------------------------------------------------

  public importRows(opts: {
    table: string;
    create?: boolean;
    createColumns?: ColumnSpec[];
    columns: string[];
    rows: any[][];
    mode?: "append" | "replace";
    onConflict?: "abort" | "ignore" | "replace";
  }): { success: boolean; inserted?: number; skipped?: number; error?: string; latencyMs?: number } {
    const t0 = performance.now();
    try {
      const table = String(opts.table || "").trim();
      if (!table) throw new Error("Target table is required");
      if (!opts.columns || opts.columns.length === 0) throw new Error("No columns to import");
      const rows = Array.isArray(opts.rows) ? opts.rows : [];

      this.db.run("BEGIN;");
      try {
        if (opts.create) {
          const cols = opts.createColumns && opts.createColumns.length ? opts.createColumns : opts.columns.map((n) => ({ name: n, type: "TEXT" } as ColumnSpec));
          this.db.run(this.buildCreateTableSql(table, cols));
        } else {
          const ex = this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;").get(table);
          if (!ex) throw new Error(`Table '${table}' does not exist`);
          const valid = new Set((this.db.query(`PRAGMA table_info(${qi(table)});`).all() as any[]).map((c) => c.name));
          for (const c of opts.columns) if (!valid.has(c)) throw new Error(`Unknown column '${c}' in '${table}'`);
          if (opts.mode === "replace") this.db.run(`DELETE FROM ${qi(table)};`);
        }

        const verb = opts.onConflict === "ignore" ? "INSERT OR IGNORE" : opts.onConflict === "replace" ? "INSERT OR REPLACE" : "INSERT";
        const stmt = this.db.prepare(
          `${verb} INTO ${qi(table)} (${opts.columns.map(qi).join(", ")}) VALUES (${opts.columns.map(() => "?").join(", ")});`
        );
        let inserted = 0;
        let skipped = 0;
        for (const r of rows) {
          const vals = opts.columns.map((_, i) => {
            const v = r[i];
            return v === undefined ? null : v;
          });
          const res = stmt.run(...vals);
          if (res.changes > 0) inserted++; else skipped++;
        }
        stmt.finalize();
        this.db.run("COMMIT;");
        this.logAudit("IMPORT", table, `${inserted} rows imported`);
        return { success: true, inserted, skipped, latencyMs: Number((performance.now() - t0).toFixed(2)) };
      } catch (e) {
        try { this.db.run("ROLLBACK;"); } catch {}
        throw e;
      }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public runScript(sql: string): { success: boolean; error?: string; latencyMs?: number } {
    const t0 = performance.now();
    try {
      const text = String(sql || "").trim();
      if (!text) throw new Error("Script is empty");
      // Strip a user-supplied outer transaction; we wrap everything in one so a failure rolls back cleanly.
      const cleaned = text.replace(/^\s*BEGIN(\s+TRANSACTION)?\s*;/i, "").replace(/COMMIT\s*;?\s*$/i, "");
      this.db.run("BEGIN;");
      try {
        this.db.exec(cleaned);
        this.db.run("COMMIT;");
      } catch (e) {
        try { this.db.run("ROLLBACK;"); } catch {}
        throw e;
      }
      this.logAudit("SCRIPT", "SQL", `Executed script (${text.length} chars)`);
      return { success: true, latencyMs: Number((performance.now() - t0).toFixed(2)) };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public getAllRows(table: string, limit = 1_000_000): { success: boolean; columns?: string[]; rows?: any[]; error?: string } {
    try {
      const ex = this.db.query("SELECT name FROM sqlite_master WHERE (type='table' OR type='view') AND name = ?;").get(table);
      if (!ex) throw new Error(`'${table}' does not exist`);
      const columns = (this.db.query(`PRAGMA table_info(${qi(table)});`).all() as any[]).map((c) => c.name);
      const rows = (this.db.query(`SELECT * FROM ${qi(table)} LIMIT ?;`).all(limit) as any[]).map(sanitizeRow);
      return { success: true, columns, rows };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public getTableAggregates(tableName: string): Record<string, { count: number; sum?: number | null; avg?: number | null; min?: any; max?: any }> {
    try {
      const cols = this.db.query(`PRAGMA table_info(${qi(tableName)});`).all() as any[];
      if (!cols || cols.length === 0) return {};

      const numericCols = cols.filter((c: any) => {
        const t = (c.type || "").toUpperCase();
        return t.includes("INT") || t.includes("REAL") || t.includes("FLOAT") || t.includes("DOUBLE") || t.includes("NUMERIC") || t.includes("DECIMAL");
      }).map((c: any) => c.name);

      const aggSelects: string[] = ["COUNT(*) as __total_count__"];
      for (const col of numericCols) {
        aggSelects.push(`SUM(${qi(col)}) as ${qi(col + "_sum")}`);
        aggSelects.push(`AVG(${qi(col)}) as ${qi(col + "_avg")}`);
        aggSelects.push(`MIN(${qi(col)}) as ${qi(col + "_min")}`);
        aggSelects.push(`MAX(${qi(col)}) as ${qi(col + "_max")}`);
      }

      const res = this.db.query(`SELECT ${aggSelects.join(", ")} FROM ${qi(tableName)};`).get() as any;
      const row = res || {};
      const totalCount = Number(row.__total_count__) || 0;

      const results: Record<string, any> = { __total: { count: totalCount } };
      for (const col of numericCols) {
        results[col] = {
          count: totalCount,
          sum: row[`${col}_sum`] !== null && row[`${col}_sum`] !== undefined ? Number(row[`${col}_sum`]) : null,
          avg: row[`${col}_avg`] !== null && row[`${col}_avg`] !== undefined ? Number(parseFloat(row[`${col}_avg`]).toFixed(2)) : null,
          min: row[`${col}_min`],
          max: row[`${col}_max`],
        };
      }
      return results;
    } catch {
      return {};
    }
  }

  public generateDatabaseDump(options: { mode?: "all" | "schema" | "data"; tables?: string[] } = {}): { success: boolean; sql?: string; dump?: string; error?: string; tablesIncluded?: string[] } {
    try {
      const mode = options.mode || "all";
      const items = this.db
        .query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_studio_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, name;")
        .all() as any[];

      const allTableNames = items.filter((it: any) => it.type === "table").map((it: any) => it.name);
      const targetTables = options.tables && options.tables.length > 0
        ? options.tables
        : allTableNames;
      const want = new Set(targetTables);

      let dump = `-- ================================================================\n`;
      dump += `-- ⚡ SQLITE STUDIO PRO - ENTERPRISE DATABASE DUMP & RECOVERY SCRIPT\n`;
      dump += `-- Generated: ${new Date().toISOString()}\n`;
      dump += `-- Database: ${this.activePath} | Mode: ${mode.toUpperCase()}\n`;
      dump += `-- ================================================================\n\n`;
      dump += `PRAGMA foreign_keys = OFF;\n`;
      if (mode === "all" || mode === "data") {
        dump += `BEGIN TRANSACTION;\n\n`;
      }

      // Schema DDL
      if (mode === "all" || mode === "schema") {
        for (const it of items) {
          if (it.type === "table") {
            if (!want.has(it.name)) continue;
            dump += `-- -----------------------------------------------------\n`;
            dump += `-- Table structure for table "${it.name}"\n`;
            dump += `-- -----------------------------------------------------\n`;
            dump += `DROP TABLE IF EXISTS ${qi(it.name)};\n`;
            dump += `${String(it.sql).replace(/;?\s*$/, ";")}\n\n`;
          } else if (it.type === "view") {
            dump += `-- View: "${it.name}"\n`;
            dump += `DROP VIEW IF EXISTS ${qi(it.name)};\n`;
            dump += `${String(it.sql).replace(/;?\s*$/, ";")}\n\n`;
          } else if (it.type === "index") {
            if (it.tbl_name && !want.has(it.tbl_name)) continue;
            dump += `${String(it.sql).replace(/;?\s*$/, ";")}\n`;
          }
        }
        dump += `\n`;
      }

      // Table Data
      if (mode === "all" || mode === "data") {
        for (const tbl of targetTables) {
          try {
            const rows = this.db.query(`SELECT * FROM ${qi(tbl)};`).all() as any[];
            if (rows && rows.length > 0) {
              dump += `-- Dumping data for table "${tbl}" (${rows.length} rows)\n`;
              const keys = Object.keys(rows[0]);
              const colList = keys.map(qi).join(", ");
              for (const r of rows) {
                const vals = keys.map((k) => sqlLiteral(r[k])).join(", ");
                dump += `INSERT INTO ${qi(tbl)} (${colList}) VALUES (${vals});\n`;
              }
              dump += `\n`;
            }
          } catch {}
        }
      }

      if (mode === "all" || mode === "data") {
        dump += `COMMIT;\n`;
      }
      dump += `PRAGMA foreign_keys = ON;\n`;
      dump += `-- Dump completed on ${new Date().toISOString()}\n`;

      return { success: true, sql: dump, dump, tablesIncluded: targetTables };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public dumpSql(tables?: string[]): { success: boolean; sql?: string; error?: string } {
    const res = this.generateDatabaseDump({ mode: "all", tables });
    return { success: res.success, sql: res.sql, error: res.error };
  }

  public getAttachedDatabases(): any[] {
    try {
      return this.db.query("PRAGMA database_list;").all();
    } catch {
      return [];
    }
  }

  public getVirtualTables(): any[] {
    try {
      return this.db.query(`
        SELECT name, sql FROM sqlite_master 
        WHERE sql LIKE '%VIRTUAL TABLE%' OR sql LIKE '%fts%' OR sql LIKE '%rtree%'
        ORDER BY name;
      `).all();
    } catch {
      return [];
    }
  }

  public runPragma(pragmaName: string, value?: string): { success: boolean; result: any; error?: string } {
    try {
      const name = String(pragmaName || "").trim();
      if (!/^[a-zA-Z0-9_]+$/.test(name)) {
        return { success: false, result: null, error: `Invalid pragma name: '${pragmaName}'` };
      }

      if (name.toLowerCase() === "vacuum" && (value === undefined || value === null)) {
        this.db.run("VACUUM;");
        return { success: true, result: [{ vacuum: "ok" }] };
      }

      if (value !== undefined && value !== null) {
        const val = String(value).trim();
        if (!/^(ON|OFF|NORMAL|FULL|OFF|DELETE|TRUNCATE|PERSIST|MEMORY|WAL|[0-9]+|'[^']*'|"[^"]*"|[a-zA-Z0-9_\-]+)$/i.test(val)) {
          return { success: false, result: null, error: `Invalid or unsafe pragma value: '${value}'` };
        }
        const sql = `PRAGMA ${name} = ${val};`;
        this.db.run(sql);
        const check = this.db.query(`PRAGMA ${name};`).get();
        return { success: true, result: check };
      } else {
        const sql = `PRAGMA ${name};`;
        const res = this.db.query(sql).all();
        return { success: true, result: res };
      }
    } catch (err: any) {
      return { success: false, result: null, error: err?.message || String(err) };
    }
  }

  public seedEnterpriseDatabase(): { success: boolean; count: number } {
    try {
      this.db.run("BEGIN TRANSACTION;");

      // 1. Customers
      this.db.run(`
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          company TEXT,
          country TEXT DEFAULT 'United States',
          tier TEXT DEFAULT 'Standard',
          balance REAL DEFAULT 0.00,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Products
      this.db.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          price REAL NOT NULL,
          stock INTEGER DEFAULT 100,
          rating REAL DEFAULT 4.5,
          active INTEGER DEFAULT 1
        );
      `);

      // 3. Orders
      this.db.run(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          order_number TEXT UNIQUE NOT NULL,
          status TEXT DEFAULT 'pending',
          total_amount REAL DEFAULT 0.00,
          payment_method TEXT DEFAULT 'Credit Card',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 4. Order Items
      this.db.run(`
        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL REFERENCES products(id),
          quantity INTEGER DEFAULT 1,
          unit_price REAL NOT NULL
        );
      `);

      // 5. Audit Log
      this.db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          details TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Indices
      this.db.run("CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);");
      this.db.run("CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);");
      this.db.run("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);");
      this.db.run("CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);");

      // Views
      this.db.run(`
        CREATE VIEW IF NOT EXISTS v_customer_orders AS
        SELECT 
          c.id AS customer_id,
          c.name AS customer_name,
          c.email,
          c.tier,
          count(o.id) AS total_orders,
          coalesce(sum(o.total_amount), 0.0) AS lifetime_spend
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id;
      `);

      this.db.run(`
        CREATE VIEW IF NOT EXISTS v_sales_by_category AS
        SELECT 
          p.category,
          count(oi.id) AS units_sold,
          sum(oi.quantity * oi.unit_price) AS gross_revenue,
          avg(p.rating) AS avg_product_rating
        FROM products p
        JOIN order_items oi ON oi.product_id = p.id
        GROUP BY p.category;
      `);

      // 1. 4-Table Join View: Extended Order Details with Customer and Product attributes
      this.db.run(`
        CREATE VIEW IF NOT EXISTS v_order_details_extended AS
        SELECT 
          o.id AS order_id,
          o.order_number,
          o.created_at AS order_date,
          o.status AS order_status,
          o.payment_method,
          c.id AS customer_id,
          c.name AS customer_name,
          c.email AS customer_email,
          c.company AS customer_company,
          c.tier AS customer_tier,
          p.id AS product_id,
          p.sku AS product_sku,
          p.name AS product_name,
          p.category AS product_category,
          oi.unit_price,
          oi.quantity,
          round(oi.quantity * oi.unit_price, 2) AS line_total
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id;
      `);

      // 2. 3-Table Join View: Customer Lifetime Order Summary & Total Spend
      this.db.run(`
        CREATE VIEW IF NOT EXISTS v_customer_order_summary AS
        SELECT 
          c.id AS customer_id,
          c.name AS customer_name,
          c.company,
          c.country,
          c.tier,
          count(DISTINCT o.id) AS total_orders,
          coalesce(sum(oi.quantity), 0) AS total_items_purchased,
          coalesce(round(sum(o.total_amount), 2), 0.0) AS total_spend,
          coalesce(round(avg(o.total_amount), 2), 0.0) AS avg_order_value,
          max(o.created_at) AS latest_order_date
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY c.id;
      `);

      // 3. 3-Table Join View: Product Inventory & Revenue Performance
      this.db.run(`
        CREATE VIEW IF NOT EXISTS v_product_sales_performance AS
        SELECT 
          p.id AS product_id,
          p.sku,
          p.name AS product_name,
          p.category,
          p.price,
          p.stock,
          p.rating,
          coalesce(sum(oi.quantity), 0) AS units_sold,
          coalesce(round(sum(oi.quantity * oi.unit_price), 2), 0.0) AS gross_revenue,
          count(DISTINCT o.id) AS orders_count
        FROM products p
        LEFT JOIN order_items oi ON oi.product_id = p.id
        LEFT JOIN orders o ON oi.order_id = o.id
        GROUP BY p.id;
      `);

      // 4. 3-Table Join View: Active / Pending Fulfillment Orders
      this.db.run(`
        CREATE VIEW IF NOT EXISTS v_pending_shipments AS
        SELECT 
          o.id AS order_id,
          o.order_number,
          o.created_at AS order_date,
          o.status AS shipment_status,
          o.payment_method,
          c.name AS customer_name,
          c.email AS customer_email,
          c.company AS customer_company,
          count(oi.id) AS distinct_products_count,
          coalesce(sum(oi.quantity), 0) AS total_units_to_ship,
          o.total_amount
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status IN ('pending', 'processing')
        GROUP BY o.id;
      `);

      // 5. 2-Table Join View: VIP Segment Completed Orders & Analytics
      this.db.run(`
        CREATE VIEW IF NOT EXISTS v_vip_customer_analytics AS
        SELECT 
          c.id AS customer_id,
          c.name AS customer_name,
          c.email,
          c.company,
          c.tier,
          count(o.id) AS completed_orders_count,
          coalesce(round(sum(o.total_amount), 2), 0.0) AS total_vip_revenue,
          coalesce(round(avg(o.total_amount), 2), 0.0) AS avg_basket_size
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
        WHERE c.tier IN ('VIP', 'Enterprise', 'Pioneering', 'Honorary')
        GROUP BY c.id;
      `);

      // Populate Seed Records
      const custCount = (this.db.query("SELECT count(*) as c FROM customers;").get() as any)?.c || 0;
      if (custCount === 0) {
        // 12 Customers
        const customers: Array<[string, string, string, string, string, number]> = [
          ["Linus Torvalds", "linus@kernel.org", "Linux Foundation", "United States", "Enterprise", 45200.50],
          ["Brendan Eich", "brendan@brave.com", "Brave Software", "United States", "Enterprise", 31800.00],
          ["Jarred Sumner", "jarred@oven.sh", "Oven Inc / Bun", "United States", "VIP", 94500.00],
          ["Guido van Rossum", "guido@python.org", "Python Software Foundation", "Netherlands", "Standard", 12400.75],
          ["Dennis Ritchie", "dennis@bell-labs.com", "Bell Labs", "United States", "Honorary", 75000.00],
          ["Ada Lovelace", "ada@babbage.engine", "Analytical Research", "United Kingdom", "Pioneering", 120000.00],
          ["Grace Hopper", "grace@navy.mil", "Naval Computing", "United States", "Pioneering", 88000.00],
          ["Ken Thompson", "ken@unix.org", "Bell Labs", "United States", "VIP", 62000.00],
          ["Bjarne Stroustrup", "bjarne@morgan.com", "C++ Standards", "United States", "Enterprise", 54000.00],
          ["Anders Hejlsberg", "anders@microsoft.com", "TypeScript / C#", "United States", "Enterprise", 67000.00],
          ["Sophie Wilson", "sophie@arm.com", "ARM Architecture", "United Kingdom", "VIP", 83000.00],
          ["Donald Knuth", "knuth@stanford.edu", "Stanford University", "United States", "Honorary", 99000.00],
        ];

        for (const [name, email, comp, country, tier, bal] of customers) {
          this.db.run(
            "INSERT INTO customers (name, email, company, country, tier, balance) VALUES (?, ?, ?, ?, ?, ?);",
            [name, email, comp, country, tier, bal]
          );
        }

        // 10 Products
        const products: Array<[string, string, string, number, number, number]> = [
          ["BUN-PRO-01", "Bun RAD Studio Workstation Pro", "Developer Tools", 499.00, 250, 4.9],
          ["SQL-IDE-02", "SQLite Studio Pro Dedicated License", "Developer Tools", 199.00, 500, 4.8],
          ["SRV-SYS-03", "Hardware Telemetry Probe Appliance", "Hardware", 1299.00, 45, 4.7],
          ["MEM-NVME-04", "Ultra-Fast PCI-e 5.0 NVMe 4TB", "Hardware", 389.00, 120, 4.9],
          ["NET-ROUT-05", "10GbE SFP+ Enterprise Core Switch", "Networking", 899.00, 60, 4.6],
          ["SEC-HSM-06", "Hardware Security Module KeyVault", "Security", 1499.00, 30, 5.0],
          ["RAM-ECC-07", "DDR5-5600 128GB ECC Workstation Kit", "Hardware", 549.00, 85, 4.8],
          ["ACC-PWR-08", "Titanium 1600W Silent ATX 3.0 PSU", "Power", 329.00, 150, 4.7],
          ["DSK-ENC-09", "8-Bay Thunderbolt 4 RAID Enclosure", "Storage", 799.00, 75, 4.5],
          ["SRV-ARM-10", "Ampere Altra 128-Core Compute Node", "Servers", 4899.00, 15, 4.9],
        ];

        for (const [sku, name, cat, price, stock, rating] of products) {
          this.db.run(
            "INSERT INTO products (sku, name, category, price, stock, rating) VALUES (?, ?, ?, ?, ?, ?);",
            [sku, name, cat, price, stock, rating]
          );
        }

        // 15 Orders with Items
        for (let i = 1; i <= 15; i++) {
          const custId = (i % 12) + 1;
          const orderNum = `ORD-2026-${1000 + i}`;
          const status = i % 4 === 0 ? "completed" : i % 3 === 0 ? "shipped" : "processing";
          const payMethod = i % 2 === 0 ? "Corporate Net-30" : "Credit Card";

          const prod1Id = (i % 10) + 1;
          const prod2Id = ((i + 3) % 10) + 1;
          const q1 = (i % 3) + 1;
          const q2 = 1;

          const p1 = (this.db.query("SELECT price FROM products WHERE id = ?;").get(prod1Id) as any)?.price || 199.0;
          const p2 = (this.db.query("SELECT price FROM products WHERE id = ?;").get(prod2Id) as any)?.price || 389.0;
          const totalAmount = Number((q1 * p1 + q2 * p2).toFixed(2));

          const orderRes = this.db.run(
            "INSERT INTO orders (customer_id, order_number, status, total_amount, payment_method) VALUES (?, ?, ?, ?, ?);",
            [custId, orderNum, status, totalAmount, payMethod]
          );
          const orderId = orderRes.lastInsertRowid;

          this.db.run("INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?);", [
            orderId,
            prod1Id,
            q1,
            p1,
          ]);
          this.db.run("INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?);", [
            orderId,
            prod2Id,
            q2,
            p2,
          ]);
        }

        this.db.run(`
          INSERT INTO audit_logs (action, entity, details) VALUES
            ('SYSTEM_BOOT', 'DATABASE', 'Enterprise schema and starter relational dataset seeded successfully.'),
            ('PRAGMA_INIT', 'DATABASE', 'Foreign keys enabled and WAL mode optimized.');
        `);
      }

      this.db.run("COMMIT;");
      return { success: true, count: 12 + 10 + 15 };
    } catch (err) {
      this.db.run("ROLLBACK;");
      throw err;
    }
  }

  private logAudit(action: string, entity: string, details: string) {
    try {
      this.db.run(
        "INSERT INTO audit_logs (action, entity, details) VALUES (?, ?, ?);",
        [action, entity, details.slice(0, 300)]
      );
    } catch {}
  }

  private extractColumnsFromQuery(sql: string): string[] {
    const match = sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (!match || !match[1]) return [];
    return match[1].split(",").map((s) => s.trim().split(/\s+as\s+/i).pop()!.trim().replace(/["'`]/g, ""));
  }

  public ensureQueryTable(): void {
    try {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS _studio_queries (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          sql TEXT NOT NULL,
          designer_state_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch {}
  }

  public getSavedQueries(): SavedQueryDefinition[] {
    this.ensureQueryTable();
    try {
      const rows = (this.db.query("SELECT id, name, description, sql, designer_state_json, created_at, updated_at FROM _studio_queries ORDER BY name ASC;").all() as any[]) || [];
      if (rows.length === 0) {
        const defaults = createDefaultQueries();
        for (const q of defaults) {
          this.saveNamedQuery(q);
        }
        return defaults;
      }
      return rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        description: String(r.description || ""),
        sql: String(r.sql),
        designerStateJson: r.designer_state_json || undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch {
      return createDefaultQueries();
    }
  }

  public saveNamedQuery(query: SavedQueryDefinition): { success: boolean; query?: SavedQueryDefinition; error?: string } {
    this.ensureQueryTable();
    try {
      if (!query || !query.name || !query.sql) return { success: false, error: "Query name and SQL statement are required" };
      const id = query.id || `query_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.db.run(
        `INSERT INTO _studio_queries (id, name, description, sql, designer_state_json, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           sql = excluded.sql,
           designer_state_json = excluded.designer_state_json,
           updated_at = datetime('now');`,
        [
          id,
          query.name.trim(),
          query.description || "",
          query.sql.trim(),
          query.designerStateJson || null,
        ]
      );

      const saved: SavedQueryDefinition = {
        ...query,
        id,
        name: query.name.trim(),
        sql: query.sql.trim(),
      };
      this.logAudit("QUERY_SAVE", "QUERY", `Saved named query: ${saved.name}`);
      return { success: true, query: saved };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public deleteNamedQuery(idOrName: string): { success: boolean; error?: string } {
    this.ensureQueryTable();
    try {
      this.db.run("DELETE FROM _studio_queries WHERE id = ? OR name = ?;", [idOrName, idOrName]);
      this.logAudit("QUERY_DELETE", "QUERY", `Deleted named query: ${idOrName}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public ensureMacroTable(): void {
    try {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS _studio_macros (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          actions_json TEXT NOT NULL,
          is_autoexec INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      const cols = this.db.query("PRAGMA table_info(_studio_macros);").all() as any[];
      if (!cols.some((c) => c.name === "on_error")) {
        this.db.run("ALTER TABLE _studio_macros ADD COLUMN on_error TEXT DEFAULT 'stop';");
      }
    } catch {}
  }

  public getMacros(): MacroDefinition[] {
    this.ensureMacroTable();
    try {
      const rows = (this.db.query("SELECT id, name, description, actions_json, is_autoexec, on_error, created_at, updated_at FROM _studio_macros ORDER BY is_autoexec DESC, name ASC;").all() as any[]) || [];
      if (rows.length === 0) {
        const defaults = createDefaultMacros();
        for (const m of defaults) {
          this.saveMacro(m);
        }
        return defaults;
      }
      return rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        description: String(r.description || ""),
        isAutoExec: Boolean(r.is_autoexec),
        onError: r.on_error === "continue" ? "continue" : "stop",
        actions: JSON.parse(r.actions_json || "[]"),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch {
      return createDefaultMacros();
    }
  }

  public saveMacro(macro: MacroDefinition): { success: boolean; macro?: MacroDefinition; error?: string } {
    this.ensureMacroTable();
    try {
      if (!macro || !macro.name) return { success: false, error: "Macro name is required" };
      const id = macro.id || `macro_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const actionsJson = JSON.stringify(macro.actions || []);
      const isAutoExec = macro.isAutoExec ? 1 : 0;

      if (isAutoExec) {
        try {
          this.db.run("UPDATE _studio_macros SET is_autoexec = 0 WHERE id != ?;", [id]);
        } catch {}
      }

      this.db.run(
        `INSERT INTO _studio_macros (id, name, description, actions_json, is_autoexec, on_error, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           actions_json = excluded.actions_json,
           is_autoexec = excluded.is_autoexec,
           on_error = excluded.on_error,
           updated_at = datetime('now');`,
        [
          id,
          macro.name.trim(),
          macro.description || "",
          actionsJson,
          isAutoExec,
          macro.onError === "continue" ? "continue" : "stop",
        ]
      );

      const saved: MacroDefinition = {
        ...macro,
        id,
        actions: macro.actions || [],
      };
      this.logAudit("MACRO_SAVE", "MACRO", `Saved macro: ${macro.name} (${saved.actions.length} actions)`);
      return { success: true, macro: saved };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public deleteMacro(idOrName: string): { success: boolean; error?: string } {
    this.ensureMacroTable();
    try {
      this.db.run("DELETE FROM _studio_macros WHERE id = ? OR name = ?;", [idOrName, idOrName]);
      this.logAudit("MACRO_DELETE", "MACRO", `Deleted macro: ${idOrName}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  private resolvePromptParams(sql: string, values: Record<string, any>): string {
    const missing = extractPromptParams(sql).filter((n) => !(n in values));
    if (missing.length > 0) throw new Error(`Missing parameter value(s): ${missing.map((n) => `[${n}]`).join(", ")}`);
    return applyPromptParams(sql, values);
  }

  /**
   * Runs a macro. With `transaction` (or `dryRun`) every data change is wrapped in one SQLite
   * transaction that is rolled back if any step fails; `dryRun` always rolls back.
   * `params` answers `[Enter ...]` prompts used in SQL.
   */
  public runMacro(
    macroOrId: MacroDefinition | string,
    initialVariables: Record<string, any> = {},
    opts: { transaction?: boolean; dryRun?: boolean; params?: Record<string, any> } = {},
  ): MacroExecutionResult {
    const useTx = Boolean(opts.transaction || opts.dryRun);
    if (useTx) {
      try {
        this.db.run("BEGIN IMMEDIATE;");
      } catch (err: any) {
        return {
          success: false, macroName: typeof macroOrId === "string" ? macroOrId : macroOrId?.name || "Unknown",
          totalSteps: 0, executedSteps: 0, skippedSteps: 0, failedSteps: 1, totalLatencyMs: 0, logs: [],
          error: `Cannot start transaction: ${err?.message || err}`,
        };
      }
    }
    let result: MacroExecutionResult;
    try {
      result = this.runMacroCore(macroOrId, initialVariables, opts.params || {}, 0);
    } catch (err: any) {
      if (useTx) { try { this.db.run("ROLLBACK;"); } catch {} }
      throw err;
    }
    if (useTx) {
      try {
        if (result.success && !opts.dryRun) {
          this.db.run("COMMIT;");
          result.committed = true;
        } else {
          this.db.run("ROLLBACK;");
          result.rolledBack = true;
        }
      } catch (err: any) {
        try { this.db.run("ROLLBACK;"); } catch {}
        result.success = false;
        result.rolledBack = true;
        result.error = `Transaction finalize failed: ${err?.message || err}`;
      }
    }
    if (opts.dryRun) result.dryRun = true;
    return result;
  }

  private runMacroCore(
    macroOrId: MacroDefinition | string,
    initialVariables: Record<string, any>,
    promptParams: Record<string, any>,
    depth: number,
  ): MacroExecutionResult {
    let macro: MacroDefinition | null = null;
    if (typeof macroOrId === "string") {
      const all = this.getMacros();
      macro = all.find((m) => m.id === macroOrId || m.name.toLowerCase() === macroOrId.toLowerCase()) || null;
    } else {
      macro = macroOrId;
    }

    if (!macro) {
      return {
        success: false,
        macroName: typeof macroOrId === "string" ? macroOrId : "Unknown",
        totalSteps: 0,
        executedSteps: 0,
        skippedSteps: 0,
        failedSteps: 1,
        totalLatencyMs: 0,
        logs: [],
        error: `Macro '${typeof macroOrId === "string" ? macroOrId : ""}' not found`,
      };
    }

    if (depth > 8) {
      return {
        success: false, macroName: macro.name, totalSteps: macro.actions.length, executedSteps: 0, skippedSteps: 0,
        failedSteps: 1, totalLatencyMs: 0, logs: [], error: "RunMacro nesting too deep (possible recursion)",
      };
    }
    const knownNames = this.getMacros().map((m) => m.name);
    const blocking = validateMacro(macro, knownNames).filter((i) => i.severity === "error");
    if (blocking.length > 0) {
      return {
        success: false, macroName: macro.name, totalSteps: macro.actions.length, executedSteps: 0, skippedSteps: 0,
        failedSteps: blocking.length, totalLatencyMs: 0, logs: [],
        error: "Validation failed: " + blocking.map((i) => (i.stepIndex ? `step ${i.stepIndex}: ` : "") + i.message).join("; "),
      };
    }

    const tStart = performance.now();
    const logs: MacroStepExecutionLog[] = [];
    const variables: Record<string, any> = { ...initialVariables };
    let executedSteps = 0;
    let skippedSteps = 0;
    let failedSteps = 0;

    for (let i = 0; i < macro.actions.length; i++) {
      const act = macro.actions[i]!;
      if (act.enabled === false) {
        skippedSteps++;
        continue;
      }

      let conditionMet = true;
      let conditionError: string | null = null;
      if (act.condition && act.condition.trim()) {
        try {
          let expr = act.condition.trim();
          expr = expr.replace(/\[([a-zA-Z0-9_]+)\]/g, (_, vName) => {
            if (vName in variables) {
              const val = variables[vName];
              return typeof val === "number" || typeof val === "boolean" ? String(val) : JSON.stringify(val);
            }
            return "0";
          });
          const fn = new Function("vars", `with(vars) { return Boolean(${expr}); }`);
          conditionMet = Boolean(fn(variables));
        } catch (err: any) {
          conditionError = `Invalid condition [${act.condition}]: ${err?.message || err}`;
        }
      }

      if (!conditionMet) {
        skippedSteps++;
        logs.push({
          stepIndex: i + 1,
          actionId: act.id,
          action: act.action,
          condition: act.condition,
          conditionMet: false,
          parameters: act.parameters || {},
          status: "skipped",
          message: `Skipped: condition [${act.condition}] evaluated to false`,
          latencyMs: 0,
        });
        continue;
      }

      const t0 = performance.now();
      try {
        if (conditionError) throw new Error(conditionError);
        const p = act.parameters || {};
        let output: any = null;
        let message = `Action ${act.action} executed`;

        switch (act.action) {
          case "OpenQuery": {
            let sql = p.sql;
            if (p.queryName) {
              const allQ = this.getSavedQueries();
              const found = allQ.find((q) => q.name.toLowerCase() === p.queryName.toLowerCase() || q.id === p.queryName);
              if (found) {
                sql = found.sql;
              } else if (!sql) {
                throw new Error(`Saved query '${p.queryName}' not found`);
              }
            }
            if (!sql) throw new Error("OpenQuery missing SQL query or query name");
            sql = this.resolvePromptParams(sql, promptParams);
            const res = this.query(sql);
            if (!res.success) throw new Error(res.error || "OpenQuery failed");
            output = { columns: res.columns, rowsCount: res.rows?.length || 0 };
            message = `Executed query '${p.queryName || "custom"}' (${res.rows?.length || 0} rows returned)`;
            break;
          }
          case "InsertRecord": {
            const tbl = p.tableName || p.table || p.targetTable;
            if (!tbl) throw new Error("InsertRecord requires target table");
            const sql = parseRecordFieldsToInsertSql(tbl, p.fields || p.record || p.values);
            const res = this.query(sql);
            if (!res.success) throw new Error(res.error || "InsertRecord failed");
            output = res;
            variables.lastRowsAffected = 1;
            message = `Appended 1 record into '${tbl}'`;
            break;
          }
          case "UpdateRecord": {
            const tbl = p.tableName || p.table || p.targetTable;
            if (!tbl) throw new Error("UpdateRecord requires target table");
            const setVals = p.setValues || p.set || p.updates;
            if (!setVals) throw new Error("UpdateRecord requires SET expressions");
            const whereCond = p.whereCondition || p.where || p.condition;
            const sql = buildUpdateRecordSql(tbl, setVals, whereCond);
            const res = this.query(sql);
            if (!res.success) throw new Error(res.error || "UpdateRecord failed");
            output = res;
            variables.lastRowsAffected = res.rowsAffected ?? 0;
            message = `Updated records in '${tbl}' (${res.rowsAffected ?? 0} rows affected)`;
            break;
          }
          case "DeleteRecord": {
            const tbl = p.tableName || p.table || p.targetTable;
            if (!tbl) throw new Error("DeleteRecord requires target table");
            const whereCond = p.whereCondition || p.where || p.condition;
            const sql = buildDeleteRecordSql(tbl, whereCond);
            const res = this.query(sql);
            if (!res.success) throw new Error(res.error || "DeleteRecord failed");
            output = res;
            variables.lastRowsAffected = res.rowsAffected ?? 0;
            message = `Deleted records from '${tbl}' (${res.rowsAffected ?? 0} rows affected)`;
            break;
          }
          case "MakeTable": {
            const newTbl = p.newTableName || p.newTable || p.tableName || p.table;
            if (!newTbl) throw new Error("MakeTable requires new table name");
            let selectSql = p.sourceSql || p.selectSql || p.sql;
            if (p.queryName) {
              const allQ = this.getSavedQueries();
              const found = allQ.find((q) => q.name.toLowerCase() === p.queryName.toLowerCase() || q.id === p.queryName);
              if (found) {
                selectSql = found.sql;
              } else if (!selectSql) {
                throw new Error(`Saved query '${p.queryName}' not found for MakeTable`);
              }
            }
            if (!selectSql) throw new Error("MakeTable requires source SELECT query or saved query name");
            const sql = buildMakeTableSql(newTbl, this.resolvePromptParams(selectSql, promptParams), p.dropExisting !== false);
            this.db.run(sql);
            output = { newTable: newTbl };
            message = `Created table '${newTbl}' from query`;
            break;
          }
          case "EmptyTable": {
            const tbl = p.tableName || p.table || p.targetTable;
            if (!tbl) throw new Error("EmptyTable requires target table");
            const sql = buildEmptyTableSql(tbl);
            const res = this.query(sql);
            if (!res.success) throw new Error(res.error || "EmptyTable failed");
            output = res;
            message = `Emptied table '${tbl}' (${res.rowsAffected ?? 0} rows removed)`;
            break;
          }
          case "GoToRecord": {
            variables.currentRecord = p.record || "first";
            message = `Navigated to record: ${variables.currentRecord}`;
            break;
          }
          case "FindRecord": {
            variables.findWhat = p.findWhat || "";
            message = `FindRecord target: ${variables.findWhat}`;
            break;
          }
          case "ShowAllRecords": {
            message = `ShowAllRecords: Cleared active filter`;
            break;
          }
          case "SetValue": {
            const item = p.item || "var";
            variables[item] = p.expression;
            message = `SetValue: [${item}] = ${JSON.stringify(p.expression)}`;
            break;
          }
          case "SetWarnings": {
            variables.warningsOn = Boolean(p.warningsOn);
            message = `SetWarnings: ${variables.warningsOn ? "ON" : "OFF"}`;
            break;
          }
          case "SaveRecord": {
            message = "SaveRecord: Committed active row edits";
            break;
          }
          case "RunSQL": {
            if (!p.sql) throw new Error("RunSQL missing sql statement");
            const res = this.query(this.resolvePromptParams(p.sql, promptParams));
            if (!res.success) throw new Error(res.error || "Query failed");
            output = res;
            message = `Executed SQL (${res.rowsAffected ?? res.rows?.length ?? 0} rows)`;
            break;
          }
          case "VacuumDatabase": {
            if (this.db.inTransaction) throw new Error("VACUUM cannot run inside a transaction; run it as a separate (non-transactional) macro");
            this.db.run("VACUUM;");
            if (p.analyze) {
              try { this.db.run("PRAGMA optimize;"); } catch {}
            }
            message = "Executed VACUUM & optimization";
            break;
          }
          case "BackupDatabase": {
            const dump = this.generateDatabaseDump({ mode: p.mode || "all" });
            message = `Generated backup dump (${dump.tablesIncluded?.length || 0} tables)`;
            output = { tablesIncluded: dump.tablesIncluded };
            break;
          }
          case "SetVariable": {
            const vName = p.name || "var1";
            variables[vName] = p.expression;
            message = `Variable [${vName}] set to ${JSON.stringify(p.expression)}`;
            break;
          }
          case "RunMacro": {
            const sub = this.runMacroCore(p.macroName, variables, promptParams, depth + 1);
            logs.push({
              stepIndex: i + 1, actionId: act.id, action: act.action, condition: act.condition, conditionMet: true,
              parameters: p, status: sub.success ? "success" : "error",
              message: sub.success ? `Sub-macro '${sub.macroName}' finished (${sub.executedSteps} steps)` : `Sub-macro '${sub.macroName}' failed: ${sub.error}`,
              output: { logs: sub.logs }, latencyMs: Number((performance.now() - t0).toFixed(2)),
            });
            executedSteps += sub.executedSteps;
            skippedSteps += sub.skippedSteps;
            Object.assign(variables, sub.variables || {});
            if (!sub.success) {
              failedSteps++;
              if (act.continueOnError ?? macro.onError === "continue") continue;
              return {
                success: false, macroName: macro.name, totalSteps: macro.actions.length, executedSteps, skippedSteps,
                failedSteps, totalLatencyMs: Number((performance.now() - tStart).toFixed(2)), logs,
                error: sub.error, variables,
              };
            }
            if (sub.halted) {
              return {
                success: true, halted: true, macroName: macro.name, totalSteps: macro.actions.length, executedSteps,
                skippedSteps, failedSteps, totalLatencyMs: Number((performance.now() - tStart).toFixed(2)), logs, variables,
              };
            }
            continue;
          }
          case "StopMacro": {
            const stepLat = Number((performance.now() - t0).toFixed(2));
            logs.push({
              stepIndex: i + 1,
              actionId: act.id,
              action: act.action,
              condition: act.condition,
              conditionMet: true,
              parameters: p,
              status: "success",
              message: `Macro halted: ${p.reason || "Normal"}`,
              latencyMs: stepLat,
            });
            executedSteps++;
            return {
              success: true,
              halted: true,
              macroName: macro.name,
              totalSteps: macro.actions.length,
              executedSteps,
              skippedSteps,
              failedSteps,
              totalLatencyMs: Number((performance.now() - tStart).toFixed(2)),
              logs,
              variables,
            };
          }
          case "Comment": {
            message = `Remark: ${p.comment || ""}`;
            break;
          }
          default: {
            message = `Validated action '${act.action}' for execution`;
            break;
          }
        }

        const stepLat = Number((performance.now() - t0).toFixed(2));
        logs.push({
          stepIndex: i + 1,
          actionId: act.id,
          action: act.action,
          condition: act.condition,
          conditionMet: true,
          parameters: p,
          status: "success",
          message,
          output,
          latencyMs: stepLat,
        });
        executedSteps++;
      } catch (err: any) {
        const stepLat = Number((performance.now() - t0).toFixed(2));
        failedSteps++;
        logs.push({
          stepIndex: i + 1,
          actionId: act.id,
          action: act.action,
          condition: act.condition,
          conditionMet: true,
          parameters: act.parameters || {},
          status: "error",
          message: err?.message || String(err),
          latencyMs: stepLat,
        });
        if (act.continueOnError ?? macro.onError === "continue") continue;
        return {
          success: false,
          macroName: macro.name,
          totalSteps: macro.actions.length,
          executedSteps,
          skippedSteps,
          failedSteps,
          totalLatencyMs: Number((performance.now() - tStart).toFixed(2)),
          logs,
          error: err?.message || String(err),
          variables,
        };
      }
    }

    return {
      success: true,
      macroName: macro.name,
      totalSteps: macro.actions.length,
      executedSteps,
      skippedSteps,
      failedSteps,
      totalLatencyMs: Number((performance.now() - tStart).toFixed(2)),
      logs,
      variables,
    };
  }
}


function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function pickNativeDataFile(title = "Select data file to import"): string | null {
  try {
    if (process.platform === "darwin") {
      const script = `try
POSIX path of (choose file with prompt "${title.replace(/"/g, "")}")
on error
return ""
end try`;
      return Bun.spawnSync(["osascript", "-e", script]).stdout.toString().trim() || null;
    } else if (process.platform === "linux") {
      return Bun.spawnSync(["zenity", "--file-selection", `--title=${title}`]).stdout.toString().trim() || null;
    } else if (process.platform === "win32") {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = '${title.replace(/'/g, "")}'; $f.Filter = 'Data files (*.csv;*.tsv;*.txt;*.json;*.jsonl;*.sql)|*.csv;*.tsv;*.txt;*.json;*.jsonl;*.ndjson;*.sql|All Files (*.*)|*.*'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$f.FileName}`;
      return Bun.spawnSync(["powershell", "-NoProfile", "-Command", ps]).stdout.toString().trim() || null;
    }
  } catch {}
  return null;
}

function downloadsDir(): string {
  const d = resolve(homedir(), "Downloads");
  try { mkdirSync(d, { recursive: true }); } catch {}
  return existsSync(d) ? d : process.cwd();
}

// -------------------------------------------------------------------------------------------------
// Native OS File Dialog Chooser
// -------------------------------------------------------------------------------------------------

export function pickNativeDatabaseFile(): string | null {
  try {
    if (process.platform === "darwin") {
      const script = `try
POSIX path of (choose file with prompt "Select SQLite Database File")
on error
return ""
end try`;
      const proc = Bun.spawnSync(["osascript", "-e", script]);
      const out = proc.stdout.toString().trim();
      return out || null;
    } else if (process.platform === "linux") {
      const proc = Bun.spawnSync([
        "zenity",
        "--file-selection",
        "--title=Select SQLite Database File",
        "--file-filter=SQLite Databases (*.db *.sqlite *.sqlite3)|*.db *.sqlite *.sqlite3 *.db3",
        "--file-filter=All Files|*",
      ]);
      const out = proc.stdout.toString().trim();
      return out || null;
    } else if (process.platform === "win32") {
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Select SQLite Database File'; $f.Filter = 'SQLite Database (*.sqlite;*.db;*.sqlite3;*.db3)|*.sqlite;*.db;*.sqlite3;*.db3|All Files (*.*)|*.*'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$f.FileName}`;
      const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", psScript]);
      const out = proc.stdout.toString().trim();
      return out || null;
    }
  } catch {
    // fallback
  }
  return null;
}

// -------------------------------------------------------------------------------------------------
// HTTP Telemetry Server Engine
// -------------------------------------------------------------------------------------------------

export function startSqliteStudioServer(options: ServerOptions = {}) {
  const port = options.port ?? 0;
  const hostname = options.host ?? "127.0.0.1";
  const manager = new SqliteManager(options.initialDbPath || ":memory:");
  const staging = sqliteStaging(manager);
  const samples = sqliteSampleApi(manager, options.sampleDir ? () => options.sampleDir as string : undefined);

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      // CORS Headers
      const __blocked = guardLocalRequest(req);
      if (__blocked) return __blocked;
      if (url.pathname === "/workbench" || url.pathname.startsWith("/api/v2/")) {
        const __workbench = await (await getSharedWorkbench("SQLite Studio · Workbench")).handle(req);
        if (__workbench) return __workbench;
      }
      if (url.pathname.startsWith("/api/staging/")) {
        const __staging = await staging.handle(req);
        if (__staging) return __staging;
      }
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // 1. Root HTML Workstation Shell
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(generateSqliteStudioHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          },
        });
      }

      // 2. Database KPIs Telemetry
      if (url.pathname === "/api/kpis" && req.method === "GET") {
        const kpis = manager.getKpis();
        return Response.json(kpis, { headers: corsHeaders });
      }

      // 3. Database Schema
      if (url.pathname === "/api/schema" && req.method === "GET") {
        const schema = manager.getSchema();
        return Response.json(schema, { headers: corsHeaders });
      }

      // 4. Execute Arbitrary SQL
      if (url.pathname === "/api/query" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string; params?: any[] };
          const result = manager.query(body.sql, body.params || []);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 4b. Views: check / create / definition / drop (src/shared/studioViews.ts)
      const viewMatch = /^\/api\/view\/(check|create|definition|drop)$/.exec(url.pathname);
      if (viewMatch && req.method === "POST") {
        try {
          const result = await manager.viewOp(viewMatch[1] as any, await req.json());
          return Response.json(result, { status: result.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 5. Explain Query Plan
      if (url.pathname === "/api/explain" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string };
          const result = manager.explain(body.sql);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 6. Paginated Table Data
      if (url.pathname === "/api/table/data" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            table: string;
            page?: number;
            pageSize?: number;
            orderBy?: string;
            orderDir?: "ASC" | "DESC";
            search?: string;
          };
          const result = manager.getTableData(body.table, body);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 7. Table Mutation (Insert / Update / Delete)
      if (url.pathname === "/api/table/mutate" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            table: string;
            action: "insert" | "update" | "delete";
            payload: { rowId?: any; pkColumn?: string; data?: Record<string, any> };
          };
          const result = manager.mutateRow(body.table, body.action, body.payload);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 8. Connect / Switch Database
      if (url.pathname === "/api/connect" && req.method === "POST") {
        try {
          const body = (await req.json()) as { path: string };
          const result = manager.connect(body.path);
          if (!result.success) {
            return Response.json(result, { status: 400, headers: corsHeaders });
          }
          return Response.json({
            ...result,
            kpis: manager.getKpis(),
            schema: manager.getSchema(),
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 8b. Browse Database via Native OS Dialog
      if (url.pathname === "/api/browse" && req.method === "POST") {
        try {
          const selectedPath = pickNativeDatabaseFile();
          if (!selectedPath) {
            return Response.json({ success: false, cancelled: true, message: "File selection was cancelled." }, { headers: corsHeaders });
          }
          const connectRes = manager.connect(selectedPath);
          if (!connectRes.success) {
            return Response.json({ success: false, error: connectRes.error, path: selectedPath }, { status: 400, headers: corsHeaders });
          }
          return Response.json({
            success: true,
            path: selectedPath,
            name: basename(selectedPath),
            kpis: manager.getKpis(),
            schema: manager.getSchema(),
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 8c. Workspace Discovered Databases List
      if (url.pathname === "/api/workspace-databases" && req.method === "GET") {
        try {
          const databases = manager.getWorkspaceDatabases();
          return Response.json({ success: true, databases }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 8d. Upload Database File (Browser & Drag-Drop Mode)
      if (url.pathname === "/api/upload-database" && req.method === "POST") {
        try {
          const formData = await req.formData();
          const file = formData.get("file") as File | null;
          if (!file) {
            return Response.json({ success: false, error: "No file provided in form data" }, { status: 400, headers: corsHeaders });
          }

          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const header = new TextDecoder().decode(bytes.slice(0, 15));
          if (!header.startsWith("SQLite format 3")) {
            return Response.json({
              success: false,
              error: "Invalid SQLite database file (missing 'SQLite format 3' header magic bytes)",
            }, { status: 400, headers: corsHeaders });
          }

          const uploadDir = resolve(process.cwd(), ".sqlite_uploads");
          try { mkdirSync(uploadDir, { recursive: true }); } catch {}
          const safeName = file.name ? basename(file.name) : `uploaded_${Date.now()}.db`;
          const savePath = resolve(uploadDir, safeName);
          writeFileSync(savePath, bytes);

          const connectRes = manager.connect(savePath);
          if (!connectRes.success) {
            return Response.json({ success: false, error: connectRes.error }, { status: 400, headers: corsHeaders });
          }

          return Response.json({
            success: true,
            path: savePath,
            name: safeName,
            kpis: manager.getKpis(),
            schema: manager.getSchema(),
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 8e. Table / schema designer, import & export (GUI CRUD)
      if (url.pathname.startsWith("/api/schema/") && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const op = url.pathname.slice("/api/schema/".length);
          let result: any;
          switch (op) {
            case "create-table": result = manager.createTable(body.name, body.columns); break;
            case "redesign-table": result = manager.redesignTable(body.table, body.newName, body.columns); break;
            case "rename-table": result = manager.renameTable(body.table, body.newName); break;
            case "drop": result = manager.dropObject(body.kind, body.name); break;
            case "drop-table": result = manager.dropObject("table", body.table || body.name); break;
            case "create-index": result = manager.createIndex(body); break;
            case "create-view": result = manager.createView(body.name, body.sql); break;
            case "details": result = manager.getTableDetails(body.table); break;
            default: return new Response("Not Found", { status: 404, headers: corsHeaders });
          }
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/import" && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          return Response.json(manager.importRows(body), { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/script" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string };
          return Response.json(manager.runScript(body.sql), { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/table/all" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string };
          return Response.json(manager.getAllRows(body.table), { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/dump" && req.method === "POST") {
        try {
          const body = (await req.json().catch(() => ({}))) as { tables?: string[]; mode?: "all" | "schema" | "data" };
          if (body.mode) {
            return Response.json(manager.generateDatabaseDump(body), { headers: corsHeaders });
          }
          return Response.json(manager.dumpSql(body.tables), { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Full Database SQL Dump & Backup Generator API
      if (url.pathname === "/api/database/dump" && req.method === "POST") {
        try {
          const body = (await req.json().catch(() => ({}))) as { mode?: "all" | "schema" | "data"; tables?: string[] };
          const dumpRes = manager.generateDatabaseDump(body);
          return Response.json({ success: true, sql: dumpRes.sql || dumpRes.dump, mode: body.mode || "all", timestamp: new Date().toISOString() }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Table Aggregates for Totals Row
      if (url.pathname === "/api/table/aggregates" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string };
          const aggregates = manager.getTableAggregates(body.table);
          return Response.json({ success: true, aggregates }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // SQLite Attached Databases API
      if (url.pathname === "/api/sqlite/attached" && req.method === "GET") {
        try {
          const databases = manager.getAttachedDatabases();
          return Response.json({ success: true, databases }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // SQLite Virtual Tables / FTS API
      if (url.pathname === "/api/sqlite/virtual-tables" && req.method === "GET") {
        try {
          const virtualTables = manager.getVirtualTables();
          return Response.json({ success: true, virtualTables }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // CRUD Route Aliases
      if (url.pathname === "/api/rows/insert" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string; row: Record<string, any> };
          const res = manager.mutateRow(body.table, "insert", { data: body.row });
          return Response.json(res, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/rows/update" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string; pk?: Record<string, any>; rowId?: any; pkColumn?: string; changes?: Record<string, any>; data?: Record<string, any> };
          const pkCol = body.pkColumn || (body.pk ? (Object.keys(body.pk)[0] ?? "id") : "id");
          const rowId = body.rowId !== undefined ? body.rowId : (body.pk ? body.pk[pkCol] : undefined);
          const data = body.changes || body.data || {};
          const res = manager.mutateRow(body.table, "update", { rowId, pkColumn: pkCol, data });
          return Response.json(res, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/rows/delete" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string; pk?: Record<string, any>; rowId?: any; rowIds?: any[]; pkColumn?: string };
          const pkCol = body.pkColumn || (body.pk ? (Object.keys(body.pk)[0] ?? "id") : "id");
          const rowId = body.rowId !== undefined ? body.rowId : (body.pk ? body.pk[pkCol] : undefined);
          const res = manager.mutateRow(body.table, "delete", { rowId, rowIds: body.rowIds, pkColumn: pkCol });
          return Response.json(res, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/rows/import-batch" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string; rows: Record<string, any>[] };
          let inserted = 0;
          for (const row of (body.rows || [])) {
            manager.mutateRow(body.table, "insert", { data: row });
            inserted++;
          }
          return Response.json({ success: true, count: inserted }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/table/truncate" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string };
          manager.db.run(`DELETE FROM "${body.table.replace(/"/g, '""')}";`);
          return Response.json({ success: true }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/schema/drop-table" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string };
          manager.db.run(`DROP TABLE IF EXISTS "${body.table.replace(/"/g, '""')}";`);
          return Response.json({ success: true }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 8f. Native data-file chooser (returns file text) and save-to-Downloads
      if (url.pathname === "/api/pick-file" && req.method === "POST") {
        try {
          const p = pickNativeDataFile();
          if (!p) return Response.json({ success: false, cancelled: true }, { headers: corsHeaders });
          const st = statSync(p);
          if (st.size > 200 * 1024 * 1024) {
            return Response.json({ success: false, error: "File is larger than 200 MB" }, { headers: corsHeaders });
          }
          const text = await Bun.file(p).text();
          return Response.json({ success: true, name: basename(p), size: st.size, text }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/export-file" && req.method === "POST") {
        try {
          const body = (await req.json()) as { filename: string; content: string };
          const safe = basename(String(body.filename || "export.txt")).replace(/[^\w.\- ]+/g, "_") || "export.txt";
          let dest = resolve(downloadsDir(), safe);
          if (existsSync(dest)) {
            const dot = safe.lastIndexOf(".");
            const stem = dot > 0 ? safe.slice(0, dot) : safe;
            const ext = dot > 0 ? safe.slice(dot) : "";
            dest = resolve(downloadsDir(), `${stem}_${Date.now()}${ext}`);
          }
          writeFileSync(dest, String(body.content ?? ""), "utf8");
          return Response.json({ success: true, path: dest }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // Sample databases catalog (src/db/samples)
      const __samples = await samples.handle(req, url, corsHeaders);
      if (__samples) return __samples;

      // 9. Seed Dataset
      if (url.pathname === "/api/seed" && req.method === "POST") {
        try {
          const result = manager.seedEnterpriseDatabase();
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 10. Run PRAGMA
      if (url.pathname === "/api/pragma" && req.method === "POST") {
        try {
          const body = (await req.json()) as { pragma: string; value?: string };
          const result = manager.runPragma(body.pragma, body.value);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 11. Export Query Results
      if (url.pathname === "/api/export" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            format: "csv" | "json" | "sql";
            tableName?: string;
            rows: Record<string, any>[];
          };

          if (!body.rows || body.rows.length === 0) {
            return Response.json({ success: false, error: "No rows provided for export" }, { status: 400, headers: corsHeaders });
          }

          const fmt = body.format;
          if (fmt !== "csv" && fmt !== "json" && fmt !== "sql") {
            return Response.json({ success: false, error: "Unsupported export format" }, { status: 400, headers: corsHeaders });
          }
          const filename = `sqlite_export_${Date.now()}.${fmt}`;
          const exportPath = resolve(process.cwd(), filename);
          let content = "";
          const allKeys: string[] = [];
          for (const r of body.rows) for (const k of Object.keys(r || {})) if (!allKeys.includes(k)) allKeys.push(k);

          if (fmt === "json") {
            content = JSON.stringify(body.rows, null, 2);
          } else if (fmt === "csv") {
            const esc = (v: any) => {
              if (v === null || v === undefined) return "";
              const s = typeof v === "object" ? JSON.stringify(v) : String(v);
              return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const lines = [allKeys.map(esc).join(",")];
            for (const r of body.rows) {
              lines.push(allKeys.map((h) => esc(r[h])).join(","));
            }
            content = lines.join("\r\n");
          } else if (fmt === "sql") {
            const tbl = (body.tableName || "exported_records").replace(/"/g, '""');
            const headers = allKeys;
            const escapedHeaders = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(", ");
            const lines = body.rows.map((r) => {
              const vals = headers.map((h) => {
                const v = r[h];
                if (v === null || v === undefined) return "NULL";
                if (typeof v === "number") return v;
                return `'${String(v).replace(/'/g, "''")}'`;
              });
              return `INSERT INTO "${tbl}" (${escapedHeaders}) VALUES (${vals.join(", ")});`;
            });
            content = lines.join("\n");
          }

          writeFileSync(exportPath, content, "utf8");
          return Response.json({ success: true, filename, path: exportPath, rowCount: body.rows.length }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 12. Clipboard Copy Helper
      if (url.pathname === "/api/clipboard" && req.method === "POST") {
        try {
          const body = (await req.json()) as { text: string };
          writeClipboardSync(body.text || "");
          return Response.json({ success: true }, { headers: corsHeaders });
        } catch {
          return Response.json({ success: true, fallback: "Clipboard simulated" }, { headers: corsHeaders });
        }
      }

      // 13. Macro Automation APIs
      if ((url.pathname === "/api/macros/list" || url.pathname === "/api/macros") && (req.method === "GET" || req.method === "POST")) {
        return Response.json({ success: true, macros: manager.getMacros() }, { headers: corsHeaders });
      }

      if (url.pathname === "/api/macros/save" && req.method === "POST") {
        try {
          const body = (await req.json()) as { macro: MacroDefinition };
          const result = manager.saveMacro(body.macro);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/macros/delete" && req.method === "POST") {
        try {
          const body = (await req.json()) as { id?: string; name?: string };
          const result = manager.deleteMacro(body.id || body.name || "");
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/macros/run" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            macro?: MacroDefinition; id?: string; name?: string; variables?: Record<string, any>;
            transaction?: boolean; dryRun?: boolean; params?: Record<string, any>;
          };
          const target = body.macro || body.id || body.name || "";
          const result = manager.runMacro(target, body.variables || {}, {
            transaction: body.transaction, dryRun: body.dryRun, params: body.params,
          });
          return Response.json({ success: result.success, result }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/codegen" && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const result = handleCodegenRequest(body, {
            sourceDialect: "sqlite",
            queries: manager.getSavedQueries(),
            macros: manager.getMacros(),
            appName: "SQLite Studio Pro",
          });
          return Response.json({ success: true, ...result }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/macros/validate" && req.method === "POST") {
        try {
          const body = (await req.json()) as { macro: MacroDefinition };
          const names = manager.getMacros().map((m) => m.name);
          return Response.json({ success: true, issues: validateMacro(body.macro, names) }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/macros/export" && req.method === "POST") {
        try {
          const body = (await req.json()) as { macro?: MacroDefinition; id?: string; format?: "json" | "sql" | "vba" };
          const macro = body.macro || manager.getMacros().find((m) => m.id === body.id || m.name === body.id);
          if (!macro) return Response.json({ success: false, error: "Macro not found" }, { status: 404, headers: corsHeaders });
          const queries = manager.getSavedQueries();
          const format = body.format || "json";
          const content =
            format === "sql" ? macroToSqlScript(macro, queries)
            : format === "vba" ? macroToVba(macro, queries)
            : JSON.stringify(macro, null, 2);
          return Response.json({ success: true, format, content }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Saved Queries (Visual Builder & Macro Integration)
      if (url.pathname === "/api/queries/list" && req.method === "GET") {
        try {
          const queries = manager.getSavedQueries();
          return Response.json({ success: true, queries }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/queries/save" && req.method === "POST") {
        try {
          const body = (await req.json()) as { query?: SavedQueryDefinition } & SavedQueryDefinition;
          const target = body.query || body;
          const result = manager.saveNamedQuery(target);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/queries/delete" && req.method === "POST") {
        try {
          const body = (await req.json()) as { id?: string; name?: string };
          const result = manager.deleteNamedQuery(body.id || body.name || "");
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Shutdown / Close workstation
      if ((url.pathname === "/api/shutdown" || url.pathname === "/api/close") && req.method === "POST") {
        setTimeout(() => process.exit(0), 100);
        return Response.json({ success: true, message: "Workstation shutting down..." }, { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return server;
}

// -------------------------------------------------------------------------------------------------
// Worker Message Handling (Isolated OS Background Thread)
// -------------------------------------------------------------------------------------------------

if (!Bun.isMainThread && (!process.env.STUDIO_WORKER || process.env.STUDIO_WORKER === "sqlite_studio")) {
  const preferredPort = 0; // Dynamic ephemeral port prevents any collisions
  const initialDbPath = process.env.SQLITE_DB_PATH || ":memory:";
  const server = startSqliteStudioServer({ port: preferredPort, initialDbPath });

  (globalThis as any).postMessage({
    ready: true,
    type: "sqlite_studio",
    port: server.port,
    url: `http://127.0.0.1:${server.port}`,
  });
}

// -------------------------------------------------------------------------------------------------
// Standalone CLI Invocation
// -------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const specifiedPort = Number(process.env.PORT);
  const initialDb = process.argv[2] || ":memory:";
  let server: any;
  if (specifiedPort) {
    server = startSqliteStudioServer({ port: specifiedPort, initialDbPath: initialDb });
  } else {
    try {
      server = startSqliteStudioServer({ port: 5757, initialDbPath: initialDb });
    } catch {
      server = startSqliteStudioServer({ port: 0, initialDbPath: initialDb });
    }
  }
  console.log(`READY:${server.port}`);
  console.log(`\n⚡ -----------------------------------------------------------------`);
  console.log(`⚡ SQLite Studio Pro - Enterprise Database Workstation Server`);
  console.log(`⚡ Local URL:    http://127.0.0.1:${server.port}`);
  console.log(`⚡ Network URL:  http://localhost:${server.port}`);
  console.log(`⚡ Database:     ${initialDb}`);
  console.log(`⚡ -----------------------------------------------------------------\n`);
}
