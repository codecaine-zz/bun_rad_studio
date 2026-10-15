/**
 * The one way the staging import talks to a database. SQLite goes through `bun:sqlite` directly (so the studio's own
 * in-memory database can be used), MySQL/MariaDB and PostgreSQL through the shared database adapters.
 * All identifiers are quoted with `quoteIdent` and checked against the real catalog; values are always parameters.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { resolve } from "path";
import type { DbAdapter, Engine } from "../types";
import { quoteIdent } from "../quote";
import { StagingError } from "./limits";
import type { TargetColumn, TargetForeignKey, TargetTable, TypeClass } from "./types";

export interface QueryOutcome {
  rows: Record<string, any>[];
  /** Rows written by INSERT/UPDATE/DELETE, or rows returned. */
  affected: number;
}

export interface StageConn {
  readonly engine: Engine;
  query(sql: string, params?: unknown[]): Promise<QueryOutcome>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
}

export interface StageDb {
  readonly engine: Engine;
  /** PostgreSQL schema the work happens in. */
  readonly schema?: string;
  /** True when one connection is shared with the rest of the studio (the studio's in-memory SQLite database). */
  readonly shared: boolean;
  /** A short name for messages: file name or database name. */
  readonly label: string;
  open(): Promise<StageConn>;
  tables(): Promise<string[]>;
  describe(table: string): Promise<TargetTable>;
  /** Size of a table in bytes when the database can tell cheaply. */
  sizeOf(table: string): Promise<number | null>;
  close(): Promise<void>;
}

export const q = (engine: Engine, ident: string): string => quoteIdent(engine, ident);

/**
 * SQLite runs inside the studio's process, so a long loop of statements would starve the studio's HTTP server (progress,
 * cancel). Loops call this to let other requests in. Not done on the studio's shared in-memory connection while a transaction is open.
 */
export function breathe(db: Pick<StageDb, "engine" | "shared">, inTransaction = false): Promise<void> {
  if (db.engine !== "sqlite" || (db.shared && inTransaction)) return Promise.resolve();
  return new Promise((r) => setTimeout(r, 0));
}

/** `"schema"."table"` for PostgreSQL, a plain quoted name elsewhere. */
export function refOf(db: Pick<StageDb, "engine" | "schema">, table: string): string {
  return db.engine === "postgres" ? `${quoteIdent("postgres", db.schema || "public")}.${quoteIdent("postgres", table)}` : quoteIdent(db.engine, table);
}

export async function runOnce(db: StageDb, sql: string, params: unknown[] = []): Promise<QueryOutcome> {
  const c = await db.open();
  try {
    return await c.query(sql, params);
  } finally {
    await c.release();
  }
}

/** Placeholder for the n-th (1-based) parameter. PostgreSQL gets an explicit type so text parameters never become "unknown". */
export function ph(engine: Engine, n: number, type?: "text" | "bigint"): string {
  if (engine !== "postgres") return "?";
  return type ? `CAST($${n} AS ${type === "bigint" ? "BIGINT" : "TEXT"})` : `$${n}`;
}

// ---- type classification -----------------------------------------------------------------------------------------

export function classifyType(engine: Engine, raw: string): Pick<TargetColumn, "cls" | "length" | "precision" | "scale" | "unsigned" | "bits" | "enumValues"> {
  const t = (raw || "").trim().toLowerCase();
  const paren = /\(([^)]*)\)/.exec(t)?.[1];
  const base = t.replace(/\([^)]*\)/g, "").replace(/\b(unsigned|zerofill|signed)\b/g, "").replace(/\s+/g, " ").trim();
  const unsigned = /\bunsigned\b/.test(t);
  const nums = paren ? paren.split(",").map((x) => Number(x.trim())) : [];
  const ints = (bits: number) => ({ cls: "integer" as TypeClass, bits, unsigned });

  if (/^enum\b/.test(base) && engine === "mysql") {
    const values = [...(raw.match(/'((?:[^']|'')*)'/g) ?? [])].map((v) => v.slice(1, -1).replace(/''/g, "'"));
    return { cls: "enum", enumValues: values };
  }
  if (engine === "mysql" && /^set$/.test(base)) return { cls: "other" };
  if (base === "tinyint" && nums[0] === 1 && engine !== "postgres") return { cls: "boolean" };
  if (/^(bool|boolean)$/.test(base)) return { cls: "boolean" };
  if (/^(uuid|uniqueidentifier)$/.test(base)) return { cls: "uuid" };
  if (/^(json|jsonb)$/.test(base)) return { cls: "json" };
  if (/^date$/.test(base)) return { cls: "date" };
  if (/^time( with(out)? time zone)?$|^timetz$/.test(base)) return { cls: "time" };
  if (/^(datetime|timestamp|timestamptz)\b/.test(base)) return { cls: "timestamp" };
  if (engine === "sqlite") {
    if (/int/.test(base)) return ints(64);
    if (/char|clob|text/.test(base)) return { cls: "text" };
    if (/blob/.test(base)) return { cls: "binary" };
    if (/real|floa|doub/.test(base)) return { cls: "float" };
    if (/dec|num/.test(base)) return { cls: "decimal" };
    return { cls: "other" };
  }
  if (/^(tinyint)$/.test(base)) return ints(8);
  if (/^(smallint|int2|smallserial|serial2)$/.test(base)) return ints(16);
  if (/^(mediumint)$/.test(base)) return ints(24);
  if (/^(int|integer|int4|serial|serial4)$/.test(base)) return ints(32);
  if (/^(bigint|int8|bigserial|serial8)$/.test(base)) return ints(64);
  if (/^(decimal|numeric|dec|fixed)$/.test(base)) return { cls: "decimal", ...(nums[0] ? { precision: nums[0] } : {}), ...(nums.length ? { scale: nums[1] ?? 0 } : {}), unsigned };
  if (/^(float|double|double precision|real|float4|float8)$/.test(base)) return { cls: "float" };
  if (/^(char|varchar|character|character varying|nchar|nvarchar|bpchar|national char|national varchar)$/.test(base)) return { cls: "text", ...(nums[0] ? { length: nums[0] } : {}) };
  if (/^(text|tinytext|mediumtext|longtext|citext|name|string)$/.test(base)) return { cls: "text" };
  if (/^(blob|tinyblob|mediumblob|longblob|bytea|binary|varbinary)$/.test(base)) return { cls: "binary" };
  return { cls: "other" };
}

const SQLITE_SIMPLE = /^[A-Za-z0-9_ ,().\[\]"$'-]*$/;
/** Type names are echoed into CAST(...) on PostgreSQL; refuse anything but a plain type name. */
export function safeTypeName(t: string): boolean {
  return t.length > 0 && t.length < 120 && SQLITE_SIMPLE.test(t);
}

// ---- SQLite --------------------------------------------------------------------------------------------------------

const plain = (v: unknown): unknown => (typeof v === "bigint" ? (v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString()) : v);

class SqliteConn implements StageConn {
  readonly engine = "sqlite" as const;
  private open_ = false;
  constructor(
    private db: Database,
    private owned: boolean,
  ) {}
  async query(sql: string, params: unknown[] = []): Promise<QueryOutcome> {
    const bound = params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p)) as any[];
    const st = this.db.prepare(sql);
    try {
      if (st.columnNames.length > 0) {
        const rows = (st.all(...bound) as Record<string, unknown>[]).map((r) => {
          for (const k in r) r[k] = plain(r[k]);
          return r;
        });
        return { rows, affected: rows.length };
      }
      const r = st.run(...bound);
      return { rows: [], affected: Number(r.changes) };
    } catch (e: any) {
      throw new StagingError(String(e?.message ?? e), "DB_ERROR", 400);
    } finally {
      st.finalize();
    }
  }
  async begin() {
    this.db.run("BEGIN IMMEDIATE");
    this.open_ = true;
  }
  async commit() {
    if (this.open_) this.db.run("COMMIT");
    this.open_ = false;
  }
  async rollback() {
    if (this.open_) {
      try {
        this.db.run("ROLLBACK");
      } catch {
        /* nothing to roll back */
      }
    }
    this.open_ = false;
  }
  async release() {
    if (this.open_) await this.rollback();
    if (this.owned) this.db.close();
  }
}

export class SqliteStageDb implements StageDb {
  readonly engine = "sqlite" as const;
  readonly shared: boolean;
  readonly label: string;
  private path: string;
  private sharedDb?: Database;

  /** `shared` is the studio's own connection (used for ":memory:"); otherwise a connection is opened per job on `path`. */
  constructor(opts: { path: string; shared?: Database }) {
    this.sharedDb = opts.shared;
    this.path = opts.path === ":memory:" ? ":memory:" : resolve(opts.path);
    this.shared = !!opts.shared && (this.path === ":memory:" || !opts.path);
    this.label = this.path === ":memory:" ? "in-memory database" : this.path.split(/[\\/]/).pop()!;
  }
  async open(): Promise<StageConn> {
    if (this.shared) return new SqliteConn(this.sharedDb!, false);
    if (this.path === ":memory:") throw new StagingError("This in-memory database is not available.", "NO_DB");
    if (!existsSync(this.path)) throw new StagingError(`The database file is not there any more: ${this.path}`, "NO_DB");
    const db = new Database(this.path, { readwrite: true, safeIntegers: true });
    db.run("PRAGMA busy_timeout = 5000");
    db.run("PRAGMA foreign_keys = ON");
    return new SqliteConn(db, true);
  }
  async tables() {
    const r = await runOnce(this, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name");
    return r.rows.map((x) => String(x.name));
  }
  async describe(table: string): Promise<TargetTable> {
    const c = await this.open();
    try {
      if (!(await this.tables()).includes(table)) throw new StagingError(`There is no table called “${table}” in this database.`, "NO_TABLE", 404);
      const cols = (await c.query("SELECT cid, name, type, \"notnull\" AS nn, dflt_value, pk, hidden FROM pragma_table_xinfo(?) ORDER BY cid", [table])).rows;
      const pkCols = cols.filter((x) => Number(x.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk));
      const sqlRow = (await c.query("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?", [table])).rows[0];
      const withoutRowid = /WITHOUT\s+ROWID/i.test(String(sqlRow?.sql ?? ""));
      const columns: TargetColumn[] = cols
        .filter((x) => Number(x.hidden) !== 1)
        .map((x) => {
          const type = String(x.type ?? "");
          const info = classifyType("sqlite", type);
          const isRowidAlias = pkCols.length === 1 && Number(x.pk) === 1 && /^integer$/i.test(type) && !withoutRowid;
          return {
            name: String(x.name),
            dataType: type || "(any)",
            nullable: Number(x.nn) === 0 && Number(x.pk) === 0,
            hasDefault: x.dflt_value !== null && x.dflt_value !== undefined,
            auto: isRowidAlias,
            generated: Number(x.hidden) >= 2,
            pkPosition: Number(x.pk) > 0 ? Number(x.pk) : null,
            ...info,
          };
        });
      const uniques: string[][] = [];
      for (const ix of (await c.query("SELECT name, \"unique\" AS u, origin, partial FROM pragma_index_list(?)", [table])).rows) {
        if (!Number(ix.u) || ix.origin === "pk" || Number(ix.partial)) continue;
        const parts = (await c.query("SELECT name FROM pragma_index_info(?) ORDER BY seqno", [String(ix.name)])).rows;
        if (parts.some((p) => p.name === null)) continue;
        uniques.push(parts.map((p) => String(p.name)));
      }
      const fkRows = (await c.query("SELECT id, seq, \"table\" AS t, \"from\" AS f, \"to\" AS tt FROM pragma_foreign_key_list(?) ORDER BY id, seq", [table])).rows;
      const fks = new Map<number, TargetForeignKey>();
      for (const f of fkRows) {
        const id = Number(f.id);
        const fk = fks.get(id) ?? { columns: [], refTable: String(f.t), refColumns: [] };
        fk.columns.push(String(f.f));
        if (f.tt !== null) fk.refColumns.push(String(f.tt));
        fks.set(id, fk);
      }
      for (const fk of fks.values()) {
        if (fk.refColumns.length === 0) {
          const parent = (await c.query("SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk", [fk.refTable])).rows;
          fk.refColumns = parent.map((p) => String(p.name));
        }
      }
      return { engine: "sqlite", name: table, columns, primaryKey: pkCols.map((p) => String(p.name)), uniques, foreignKeys: [...fks.values()], hasRowid: !withoutRowid };
    } finally {
      await c.release();
    }
  }
  async sizeOf(table: string): Promise<number | null> {
    try {
      const r = await runOnce(this, "SELECT SUM(pgsize) AS s FROM dbstat WHERE name = ?", [table]);
      return r.rows[0]?.s === null || r.rows[0]?.s === undefined ? null : Number(r.rows[0].s);
    } catch {
      return null;
    }
  }
  async close() {}
}

// ---- MySQL / MariaDB and PostgreSQL -----------------------------------------------------------------------------

class AdapterConn implements StageConn {
  constructor(
    readonly engine: Engine,
    private s: Awaited<ReturnType<DbAdapter["openSession"]>>,
  ) {}
  async query(sql: string, params: unknown[] = []): Promise<QueryOutcome> {
    try {
      const r = await this.s.query(sql, params as never[]);
      return { rows: r.rows as Record<string, any>[], affected: r.affectedRows ?? r.rowCount ?? 0 };
    } catch (e: any) {
      throw new StagingError(String(e?.message ?? e), "DB_ERROR", 400, e?.hint);
    }
  }
  begin() {
    return this.s.begin();
  }
  commit() {
    return this.s.commit();
  }
  async rollback() {
    try {
      if (this.s.inTransaction) await this.s.rollback();
    } catch {
      /* already closed */
    }
  }
  async release() {
    if (this.s.inTransaction) await this.rollback();
    await this.s.close();
  }
}

export class AdapterStageDb implements StageDb {
  readonly shared = false;
  readonly engine: Engine;
  readonly schema?: string;
  readonly label: string;
  constructor(
    private adapter: DbAdapter,
    label?: string,
  ) {
    this.engine = adapter.engine;
    this.schema = adapter.engine === "postgres" ? adapter.config.schema || "public" : undefined;
    this.label = label ?? adapter.config.database ?? adapter.engine;
  }
  async open(): Promise<StageConn> {
    await this.adapter.connect();
    return new AdapterConn(this.engine, await this.adapter.openSession());
  }
  private async rows(sql: string, params: unknown[] = []) {
    await this.adapter.connect();
    return (await this.adapter.query(sql, params as never[])).rows as Record<string, any>[];
  }
  async tables() {
    const rows =
      this.engine === "mysql"
        ? await this.rows("SELECT table_name AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name")
        : await this.rows("SELECT table_name AS n FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name", [this.schema]);
    return rows.map((r) => String(r.n ?? r.N ?? r.table_name ?? Object.values(r)[0]));
  }
  async describe(table: string): Promise<TargetTable> {
    if (!(await this.tables()).includes(table)) throw new StagingError(`There is no table called “${table}” in this database.`, "NO_TABLE", 404);
    await this.adapter.connect();
    const info = await this.adapter.describeTable({ name: table, type: "table", ...(this.schema ? { schema: this.schema } : {}) });
    const columns: TargetColumn[] = info.columns.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      nullable: c.nullable,
      hasDefault: c.defaultValue !== null && c.defaultValue !== undefined,
      auto: c.autoIncrement,
      generated: c.generated,
      pkPosition: c.primaryKeyPosition,
      ...classifyType(this.engine, c.dataType),
    }));
    for (const c of columns) {
      if (c.cls === "text" && this.engine === "mysql") continue;
      if (this.engine === "postgres" && c.cls === "other" && !safeTypeName(c.dataType)) c.cls = "other";
    }
    if (this.engine === "mysql") {
      const rows = await this.rows("SELECT column_name AS n, collation_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND collation_name IS NOT NULL", [table]);
      const coll = new Map(rows.map((r) => [String(r.n ?? r.N ?? r.column_name), String(r.c ?? r.C ?? r.collation_name)]));
      for (const c of columns) {
        const v = coll.get(c.name);
        if (v && /^[A-Za-z0-9_]+$/.test(v)) c.collation = v;
      }
    } else {
      const rows = await this.rows(
        `SELECT a.attname AS n, e.enumlabel AS label FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid JOIN pg_enum e ON e.enumtypid = t.oid
         WHERE a.attrelid = (SELECT c.oid FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = $1 AND c.relname = $2) AND a.attnum > 0 ORDER BY e.enumsortorder`,
        [this.schema, table],
      );
      for (const r of rows) {
        const c = columns.find((x) => x.name === r.n);
        if (c) {
          c.cls = "enum";
          (c.enumValues ??= []).push(String(r.label));
        }
      }
    }
    const uniques: string[][] = [];
    if (this.engine === "mysql") {
      const rows = await this.rows("SELECT index_name AS i, column_name AS c FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND non_unique = 0 AND index_name <> 'PRIMARY' ORDER BY index_name, seq_in_index", [table]);
      const by = new Map<string, (string | null)[]>();
      for (const r of rows) {
        const k = String(r.i ?? r.I ?? r.index_name);
        (by.get(k) ?? by.set(k, []).get(k)!).push((r.c ?? r.C ?? r.column_name) as string | null);
      }
      for (const cols of by.values()) if (cols.every((c) => c !== null)) uniques.push(cols as string[]);
    } else {
      const rows = await this.rows(
        `SELECT ic.relname AS idx, array_agg(a.attname ORDER BY k.ord) AS cols
         FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord) ON true
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
         WHERE n.nspname = $1 AND t.relname = $2 AND i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indisvalid AND k.ord <= i.indnkeyatts
         GROUP BY ic.relname ORDER BY ic.relname`,
        [this.schema, table],
      );
      for (const r of rows) uniques.push((r.cols as string[]).map(String));
    }
    return {
      engine: this.engine,
      ...(this.schema ? { schema: this.schema } : {}),
      name: table,
      columns,
      primaryKey: info.primaryKey,
      uniques,
      foreignKeys: info.foreignKeys.map((f) => ({ columns: f.columns, refTable: f.refTable, refColumns: f.refColumns, ...(f.refSchema && this.engine === "postgres" ? { refSchema: f.refSchema } : {}) })),
    };
  }
  async sizeOf(table: string): Promise<number | null> {
    try {
      const rows =
        this.engine === "mysql"
          ? await this.rows("SELECT data_length + index_length AS s FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?", [table])
          : await this.rows("SELECT pg_total_relation_size(c.oid)::bigint AS s FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2", [this.schema, table]);
      const v = rows[0]?.s ?? rows[0]?.S;
      return v === undefined || v === null ? null : Number(v);
    } catch {
      return null;
    }
  }
  async close() {
    await this.adapter.close();
  }
}
