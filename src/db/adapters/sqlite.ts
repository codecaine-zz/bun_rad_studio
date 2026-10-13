import { Database, type SQLQueryBindings } from "bun:sqlite";
import { existsSync, statSync } from "fs";
import { resolve } from "path";
import type { Capabilities, ColumnInfo, ConnectionConfig, DbSession, ForeignKeyInfo, IndexInfo, ObjectRef, Param, QueryOptions, QueryResult, ServerInfo, TableInfo, WireValue } from "../types";
import { DbError, assertReadOnlyStatement, normalizeError } from "../errors";
import { quoteIdent } from "../quote";
import { splitStatements, leadingKeyword } from "../splitter";
import { decodeParam, toWire } from "../wire";
import { BaseAdapter, type Executor } from "./base";

const WRITE_KEYWORDS = new Set(["INSERT", "UPDATE", "DELETE", "REPLACE"]);

export class SqliteAdapter extends BaseAdapter {
  readonly engine = "sqlite" as const;
  private db: Database | null = null;
  private resolvedPath = ":memory:";
  private txOpen = false;
  /** True for ":memory:" databases: everything is lost on close. */
  get isTemporary(): boolean {
    return this.resolvedPath === ":memory:";
  }
  get path(): string {
    return this.resolvedPath;
  }

  private get conn(): Database {
    if (!this.db) throw new DbError("CONNECTION_LOST", "Not connected. Call connect() first.");
    return this.db;
  }

  async connect(): Promise<void> {
    if (this.db) return;
    const mode = this.config.sqliteMode ?? (this.config.path === ":memory:" ? "memory" : "readwrite");
    try {
      if (mode === "memory") {
        this.resolvedPath = ":memory:";
        this.db = new Database(":memory:", { safeIntegers: true });
      } else {
        const path = this.config.path;
        if (!path) throw new DbError("INVALID_REQUEST", "A database file path is required.");
        this.resolvedPath = resolve(path);
        const exists = existsSync(this.resolvedPath);
        if (mode !== "create" && !exists) {
          throw new DbError("DATABASE_NOT_FOUND", `Database file not found: ${this.resolvedPath}`, "Use the explicit \"Create new database\" action to create a file.");
        }
        if (mode === "create" && exists) {
          throw new DbError("INVALID_REQUEST", `Refusing to create: ${this.resolvedPath} already exists.`, "Open the existing file instead.");
        }
        if (exists && !statSync(this.resolvedPath).isFile()) throw new DbError("INVALID_REQUEST", `${this.resolvedPath} is not a file.`);
        this.db =
          mode === "readonly"
            ? new Database(this.resolvedPath, { readonly: true, safeIntegers: true })
            : mode === "create"
              ? new Database(this.resolvedPath, { create: true, readwrite: true, safeIntegers: true })
              : new Database(this.resolvedPath, { readwrite: true, safeIntegers: true });
      }
      // Per-connection (not persisted in the file): wait briefly on locks and enforce foreign keys.
      this.db.run("PRAGMA busy_timeout = 5000");
      if (this.config.readOnly || mode === "readonly") {
        if (mode !== "readonly") this.db.run("PRAGMA query_only = ON");
      } else {
        this.db.run("PRAGMA foreign_keys = ON");
      }
    } catch (e) {
      this.db?.close();
      this.db = null;
      throw normalizeError("sqlite", e, [this.password]);
    }
  }

  /** Consistent copy of the live database (includes WAL contents). Fails if `dest` exists. */
  backupTo(dest: string): void {
    if (existsSync(dest)) throw new DbError("INVALID_REQUEST", `${dest} already exists. Existing files are never overwritten.`);
    try {
      this.conn.query("VACUUM INTO ?").run(dest);
    } catch (e) {
      throw normalizeError("sqlite", e, [this.password]);
    }
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
    this.txOpen = false;
  }

  private get readOnly(): boolean {
    return Boolean(this.config.readOnly) || this.config.sqliteMode === "readonly";
  }

  async ping(): Promise<ServerInfo> {
    const t = performance.now();
    const row = this.conn.query("SELECT sqlite_version() AS v").get() as { v: string };
    return { version: row.v, currentDatabase: this.resolvedPath, latencyMs: Math.round((performance.now() - t) * 100) / 100 };
  }

  async capabilities(): Promise<Capabilities> {
    const { version } = await this.ping();
    const fk = this.conn.query("PRAGMA foreign_keys").get() as { foreign_keys: number | bigint };
    const journal = this.conn.query("PRAGMA journal_mode").get() as { journal_mode: string };
    return {
      engine: "sqlite",
      version,
      schemas: false,
      transactionalDdl: true,
      cancelQuery: false,
      statementTimeout: false,
      readOnlyEnforcement: this.readOnly ? (this.config.sqliteMode === "readonly" ? "connection" : "transaction") : "none",
      explainAnalyze: false,
      routines: false,
      sequences: false,
      notes: {
        cancelQuery: "SQLite runs in-process; a running statement cannot be interrupted from here.",
        statementTimeout: "SQLite has no statement timeout. Only the lock wait (busy_timeout = 5000 ms) is bounded.",
        schemas: "SQLite has no schemas; attached databases are not browsed here.",
        foreignKeys: Number(fk.foreign_keys) === 1 ? "Foreign-key enforcement is ON for this connection." : "Foreign-key enforcement is OFF for this connection.",
        journalMode: `Journal mode: ${journal.journal_mode}. This tool never changes it.`,
        ...(this.isTemporary ? { temporary: "This is an in-memory database; its data is lost when it is closed." } : {}),
      },
    };
  }

  protected execute: Executor = async (sql, params, options) => this.run(sql, params, options);

  private run(sql: string, params: Param[], options?: QueryOptions): QueryResult {
    const started = performance.now();
    const stmts = splitStatements(sql, { engine: "sqlite" });
    if (stmts.length !== 1) throw new DbError("INVALID_REQUEST", stmts.length === 0 ? "Empty statement." : "Run one statement at a time (use the script runner for several).");
    const text = stmts[0]!.sql;
    try {
      if (this.readOnly) assertReadOnlyStatement("sqlite", text);
      const stmt = this.conn.query(text);
      const bound = params.map((x) => decodeParam(x, "sqlite")) as SQLQueryBindings[];
      const columns = stmt.columnNames;
      if (columns.length > 0) {
        const rows = stmt.all(...bound) as Record<string, unknown>[];
        const max = options?.maxRows;
        const truncated = max !== undefined && rows.length > max;
        const kept = truncated ? rows.slice(0, max) : rows;
        return {
          columns: [...columns],
          rows: kept.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toWire(v)])) as Record<string, WireValue>),
          rowCount: kept.length,
          affectedRows: null,
          lastInsertId: null,
          truncated,
          elapsedMs: Math.round((performance.now() - started) * 100) / 100,
        };
      }
      const info = stmt.run(...bound);
      const kw = leadingKeyword(text);
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        affectedRows: WRITE_KEYWORDS.has(kw) ? Number(info.changes) : null,
        lastInsertId: WRITE_KEYWORDS.has(kw) && Number(info.changes) > 0 ? String(info.lastInsertRowid) : null,
        truncated: false,
        elapsedMs: Math.round((performance.now() - started) * 100) / 100,
      };
    } catch (e) {
      throw normalizeError("sqlite", e, [this.password]);
    }
  }

  async openSession(): Promise<DbSession> {
    const self = this;
    return {
      get inTransaction() {
        return self.txOpen;
      },
      query: (sql, params = [], options) => Promise.resolve().then(() => self.run(sql, params, options)),
      async begin() {
        if (self.txOpen) throw new DbError("INVALID_REQUEST", "A transaction is already open.");
        self.conn.run("BEGIN");
        self.txOpen = true;
      },
      async commit() {
        if (!self.txOpen) throw new DbError("INVALID_REQUEST", "No transaction is open.");
        self.conn.run("COMMIT");
        self.txOpen = false;
      },
      async rollback() {
        if (!self.txOpen) return;
        self.conn.run("ROLLBACK");
        self.txOpen = false;
      },
      async cancel() {
        return false;
      },
      async close() {
        if (self.txOpen) {
          self.conn.run("ROLLBACK");
          self.txOpen = false;
        }
      },
    };
  }

  protected textCast(expr: string): string {
    return `CAST(${expr} AS TEXT)`;
  }

  async listObjects(): Promise<ObjectRef[]> {
    const rows = this.conn.query("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string; type: string }[];
    return rows.map((r) => ({ name: r.name, type: r.type === "view" ? "view" : "table" }));
  }

  async describeTable(ref: ObjectRef): Promise<TableInfo> {
    const master = this.conn.query("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name = ?").get(ref.name) as { name: string; type: string; sql: string | null } | null;
    if (!master) throw new DbError("OBJECT_NOT_FOUND", `Table or view "${ref.name}" does not exist.`);
    const q = quoteIdent("sqlite", master.name);
    const cols = this.conn.query(`PRAGMA table_xinfo(${q})`).all() as { name: string; type: string; notnull: number | bigint; dflt_value: string | null; pk: number | bigint; hidden: number | bigint }[];
    const createSql = master.sql ?? "";
    const withoutRowid = /\bWITHOUT\s+ROWID\b/i.test(createSql);
    const pkCols = cols.filter((c) => Number(c.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk));
    const autoInc = /\bAUTOINCREMENT\b/i.test(createSql);
    const columns: ColumnInfo[] = cols
      .filter((c) => Number(c.hidden) !== 1)
      .map((c) => ({
        name: c.name,
        dataType: c.type || "",
        nullable: Number(c.notnull) === 0 && Number(c.pk) === 0,
        defaultValue: c.dflt_value,
        primaryKeyPosition: Number(c.pk) > 0 ? Number(c.pk) : null,
        autoIncrement: pkCols.length === 1 && Number(c.pk) > 0 && /^integer$/i.test(c.type) && (autoInc || !withoutRowid),
        generated: Number(c.hidden) >= 2,
      }));
    const fkRows = this.conn.query(`PRAGMA foreign_key_list(${q})`).all() as { id: number | bigint; seq: number | bigint; table: string; from: string; to: string | null; on_update: string; on_delete: string }[];
    const fkMap = new Map<number, ForeignKeyInfo>();
    for (const f of fkRows.sort((a, b) => Number(a.seq) - Number(b.seq))) {
      const id = Number(f.id);
      const entry = fkMap.get(id) ?? { name: null, columns: [], refTable: f.table, refColumns: [], onDelete: f.on_delete, onUpdate: f.on_update };
      entry.columns.push(f.from);
      if (f.to) entry.refColumns.push(f.to);
      fkMap.set(id, entry);
    }
    const idxRows = master.type === "table" ? (this.conn.query(`PRAGMA index_list(${q})`).all() as { name: string; unique: number | bigint; origin: string }[]) : [];
    const indexes: IndexInfo[] = idxRows.map((i) => ({
      name: i.name,
      unique: Number(i.unique) === 1,
      primary: i.origin === "pk",
      columns: (this.conn.query(`PRAGMA index_info(${quoteIdent("sqlite", i.name)})`).all() as { seqno: number | bigint; name: string | null }[]).sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((c) => c.name ?? "<expression>"),
    }));
    return {
      name: master.name,
      type: master.type === "view" ? "view" : "table",
      columns,
      primaryKey: pkCols.map((c) => c.name),
      foreignKeys: [...fkMap.values()],
      indexes,
      hasRowid: master.type === "table" && !withoutRowid,
    };
  }
}
