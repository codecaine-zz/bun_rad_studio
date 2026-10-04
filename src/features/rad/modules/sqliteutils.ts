// Feature: RAD - sqliteutils
// Embedded database toolkit on native bun:sqlite: tuned connections, safe identifier quoting,
// typed query helpers, transactions, KV store, JSON document store (with json_extract queries),
// CRUD + bulk insert + upsert, schema introspection, versioned migrations, FTS5, backups.

import { Database } from "bun:sqlite";

/** Positional bind parameters accepted by every query helper. */
export type SqlParams = any[];

/** Connection options for {@link openDb}. */
export interface OpenDbOptions {
  /** Enable WAL journal + `synchronous=NORMAL` (ignored for `:memory:`). Default `true`. */
  wal?: boolean;
  /** Open read-only. Default `false`. */
  readonly?: boolean;
  /** Create the file if missing. Default `true`. */
  create?: boolean;
  /** Enforce `FOREIGN KEY` constraints. Default `true`. */
  foreignKeys?: boolean;
  /** Milliseconds to wait on a locked database before `SQLITE_BUSY`. Default `5000`. */
  busyTimeoutMs?: number;
}

/** A versioned schema migration. Applied once, in ascending `version` order, inside a transaction. */
export interface SqlMigration {
  version: number;
  up: string;
  /** Optional human label, stored for auditing. */
  name?: string;
}

/** One column as reported by `PRAGMA table_info`. */
export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  defaultValue: string | null;
  primaryKey: boolean;
}

/** A stored JSON document with its id and last-update timestamp. */
export interface StoredDoc<T> {
  id: string;
  doc: T;
  updatedAt: string;
}

/**
 * Safely quote an SQL identifier (table/column). Doubles embedded `"` so names can never break out.
 * @throws When the identifier is empty.
 * @example
 * ```ts
 * sqliteutils.quoteIdent('weird"name'); // "\"weird\"\"name\""
 * ```
 */
export function quoteIdent(name: string): string {
  if (!name) throw new Error("[sqliteutils.quoteIdent] Identifier must be a non-empty string");
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Open (or create) a database with production-ready pragmas.
 * @param path - File path or `":memory:"`. Default `":memory:"`.
 * @param options - Legacy `boolean` (WAL on/off) or a full {@link OpenDbOptions} object.
 * @example
 * ```ts
 * const db = sqliteutils.openDb("app.db", { busyTimeoutMs: 10_000 });
 * const ro = sqliteutils.openDb("app.db", { readonly: true });
 * ```
 */
export function openDb(path = ":memory:", options: boolean | OpenDbOptions = true): Database {
  const opts: OpenDbOptions = typeof options === "boolean" ? { wal: options } : options;
  const db = opts.readonly
    ? new Database(path, { readonly: true })
    : new Database(path, { create: opts.create ?? true });
  db.run(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(opts.busyTimeoutMs ?? 5000))};`);
  if (opts.foreignKeys ?? true) db.run("PRAGMA foreign_keys = ON;");
  if ((opts.wal ?? true) && path !== ":memory:" && !opts.readonly) {
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
  }
  return db;
}

/**
 * Close the connection. Safe to call twice.
 * @example `sqliteutils.closeDb(db);`
 */
export function closeDb(db: Database): void {
  db.close();
}

/**
 * Execute one statement (DDL or DML) with positional parameters.
 * @example
 * ```ts
 * sqliteutils.execSql(db, "UPDATE users SET active = ? WHERE id = ?", [1, 42]);
 * ```
 */
export function execSql(db: Database, sql: string, params: SqlParams = []): void {
  db.query(sql).run(...params);
}

/**
 * Run a parameterized query and return every row (statements are cached by bun:sqlite).
 * @example
 * ```ts
 * const admins = sqliteutils.queryAll<{ id: number }>(db, "SELECT id FROM users WHERE role = ?", ["admin"]);
 * ```
 */
export function queryAll<T = Record<string, any>>(db: Database, sql: string, params: SqlParams = []): T[] {
  return db.query(sql).all(...params) as T[];
}

/**
 * Return the first row of a query, or `null`.
 * @example
 * ```ts
 * const user = sqliteutils.queryOne<{ name: string }>(db, "SELECT name FROM users WHERE id = ?", [1]);
 * ```
 */
export function queryOne<T = Record<string, any>>(db: Database, sql: string, params: SqlParams = []): T | null {
  return (db.query(sql).get(...params) as T | null) ?? null;
}

/**
 * Return the first column of the first row (scalar queries like `COUNT(*)`), or `null`.
 * @example
 * ```ts
 * const n = sqliteutils.queryValue<number>(db, "SELECT COUNT(*) FROM users"); // 12
 * ```
 */
export function queryValue<T = unknown>(db: Database, sql: string, params: SqlParams = []): T | null {
  const row = db.query(sql).values(...params)[0];
  return row ? (row[0] as T) : null;
}

/**
 * Run `fn` inside a transaction: commits on success, rolls back and re-throws on error.
 * Nested calls become savepoints automatically.
 * @returns The value returned by `fn`.
 * @example
 * ```ts
 * sqliteutils.transaction(db, () => {
 *   sqliteutils.execSql(db, "UPDATE acct SET bal = bal - 10 WHERE id = 1");
 *   sqliteutils.execSql(db, "UPDATE acct SET bal = bal + 10 WHERE id = 2");
 * });
 * ```
 */
export function transaction<T>(db: Database, fn: () => T): T {
  return db.transaction(fn)() as T;
}

/**
 * `true` when a table, view or virtual table named `table` exists.
 * @example `sqliteutils.tableExists(db, "users"); // true`
 */
export function tableExists(db: Database, table: string): boolean {
  return queryOne(db, "SELECT 1 AS ok FROM sqlite_master WHERE type IN ('table','view') AND name = ?;", [table]) !== null;
}

/**
 * List user tables (excludes `sqlite_*` internals), sorted by name.
 * @example `sqliteutils.listTables(db); // ["kv_store", "users"]`
 */
export function listTables(db: Database): string[] {
  const rows = queryAll<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
  );
  return rows.map((r) => r.name);
}

/**
 * Describe a table's columns via `PRAGMA table_info`.
 * @example
 * ```ts
 * sqliteutils.tableColumns(db, "users").map((c) => c.name); // ["id", "name", "email"]
 * ```
 */
export function tableColumns(db: Database, table: string): ColumnInfo[] {
  const rows = queryAll<any>(db, `PRAGMA table_info(${quoteIdent(table)});`);
  return rows.map((r) => ({
    cid: r.cid,
    name: r.name,
    type: r.type,
    notnull: r.notnull === 1,
    defaultValue: r.dflt_value,
    primaryKey: r.pk > 0,
  }));
}

/**
 * Count rows, optionally filtered by a parameterized WHERE clause.
 * @example
 * ```ts
 * sqliteutils.countRows(db, "users", "active = ?", [1]); // 7
 * ```
 */
export function countRows(db: Database, table: string, whereClause?: string, params: SqlParams = []): number {
  const where = whereClause ? ` WHERE ${whereClause}` : "";
  return Number(queryValue(db, `SELECT COUNT(*) FROM ${quoteIdent(table)}${where};`, params) ?? 0);
}

/**
 * Create a key/value table `(key TEXT PRIMARY KEY, value TEXT, updated_at)`.
 * @example `sqliteutils.createKvTable(db, "settings");`
 */
export function createKvTable(db: Database, table = "kv_store"): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`
  );
}

/**
 * Upsert a key. Strings are stored verbatim; everything else is JSON-encoded.
 * @example
 * ```ts
 * sqliteutils.setKv(db, "settings", "theme", "dark");
 * sqliteutils.setKv(db, "settings", "limits", { max: 10 });
 * ```
 */
export function setKv(db: Database, table: string, key: string, value: unknown): void {
  const strVal = typeof value === "string" ? value : JSON.stringify(value);
  db.query(
    `INSERT INTO ${quoteIdent(table)} (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`
  ).run(key, strVal);
}

/**
 * Read the raw stored string for `key`, or `null`.
 * @example `sqliteutils.getKv(db, "settings", "theme"); // "dark"`
 */
export function getKv(db: Database, table: string, key: string): string | null {
  const row = db.query(`SELECT value FROM ${quoteIdent(table)} WHERE key = ?;`).get(key) as { value: string } | null;
  return row ? row.value : null;
}

/**
 * Read `key`, JSON-decoding when possible, else returning the raw string; `fallback` when absent.
 * @example
 * ```ts
 * const limits = sqliteutils.getKvOr(db, "settings", "limits", { max: 5 }); // { max: 10 }
 * ```
 */
export function getKvOr<T>(db: Database, table: string, key: string, fallback: T): T {
  const val = getKv(db, table, key);
  if (val === null) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return val as unknown as T;
  }
}

/** `true` when `key` exists. @example `sqliteutils.hasKv(db, "settings", "theme")` */
export function hasKv(db: Database, table: string, key: string): boolean {
  return getKv(db, table, key) !== null;
}

/**
 * Atomically add `by` to a numeric key (missing keys start at 0). Perfect for counters.
 * @returns The new value.
 * @example
 * ```ts
 * sqliteutils.incrementKv(db, "stats", "page_views"); // 1
 * sqliteutils.incrementKv(db, "stats", "page_views", 5); // 6
 * ```
 */
export function incrementKv(db: Database, table: string, key: string, by = 1): number {
  // IMMEDIATE takes the write lock up front so concurrent processes can't interleave read/modify/write.
  return db.transaction(() => {
    const current = Number(getKv(db, table, key) ?? 0);
    const next = current + by;
    if (!Number.isFinite(next)) throw new Error(`[sqliteutils.incrementKv] ${table}.${key} is not numeric`);
    setKv(db, table, key, String(next));
    return next;
  }).immediate();
}

/**
 * Delete `key`. @returns `true` when a row was removed.
 * @example `sqliteutils.deleteKv(db, "settings", "theme");`
 */
export function deleteKv(db: Database, table: string, key: string): boolean {
  return db.query(`DELETE FROM ${quoteIdent(table)} WHERE key = ?;`).run(key).changes > 0;
}

/**
 * Every key/value pair as a plain object (raw strings), sorted by key.
 * @example `sqliteutils.listKv(db, "settings"); // { theme: "dark" }`
 */
export function listKv(db: Database, table: string): Record<string, string> {
  const rows = queryAll<{ key: string; value: string }>(db, `SELECT key, value FROM ${quoteIdent(table)} ORDER BY key ASC;`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Create a JSON document table `(id TEXT PRIMARY KEY, doc TEXT, updated_at)`.
 * @example `sqliteutils.createJsonStore(db, "users");`
 */
export function createJsonStore(db: Database, table = "json_store"): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (id TEXT PRIMARY KEY, doc TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`
  );
}

/**
 * Upsert a JSON document by id.
 * @example `sqliteutils.saveDoc(db, "users", "u1", { name: "Ada", role: "admin" });`
 */
export function saveDoc<T>(db: Database, table: string, id: string, doc: T): void {
  db.query(
    `INSERT INTO ${quoteIdent(table)} (id, doc, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, updated_at = CURRENT_TIMESTAMP;`
  ).run(id, JSON.stringify(doc));
}

/**
 * Load and parse a document, or `null`.
 * @example `sqliteutils.loadDoc<{ name: string }>(db, "users", "u1")?.name; // "Ada"`
 */
export function loadDoc<T>(db: Database, table: string, id: string): T | null {
  const row = db.query(`SELECT doc FROM ${quoteIdent(table)} WHERE id = ?;`).get(id) as { doc: string } | null;
  return row ? (JSON.parse(row.doc) as T) : null;
}

/**
 * Delete a document. @returns `true` when removed.
 * @example `sqliteutils.deleteDoc(db, "users", "u1");`
 */
export function deleteDoc(db: Database, table: string, id: string): boolean {
  return db.query(`DELETE FROM ${quoteIdent(table)} WHERE id = ?;`).run(id).changes > 0;
}

/**
 * All documents sorted by id, including their `updatedAt` timestamp.
 * @example
 * ```ts
 * for (const { id, doc } of sqliteutils.listDocs<{ name: string }>(db, "users")) console.log(id, doc.name);
 * ```
 */
export function listDocs<T>(db: Database, table: string): StoredDoc<T>[] {
  const rows = queryAll<{ id: string; doc: string; updated_at: string }>(
    db,
    `SELECT id, doc, updated_at FROM ${quoteIdent(table)} ORDER BY id ASC;`
  );
  return rows.map((r) => ({ id: r.id, doc: JSON.parse(r.doc) as T, updatedAt: r.updated_at }));
}

/**
 * Query documents by a JSON path using SQLite's `json_extract` (no schema needed).
 * @param jsonPath - SQLite JSON path such as `"$.role"` or `"$.address.city"`.
 * @example
 * ```ts
 * sqliteutils.findDocs<{ role: string }>(db, "users", "$.role", "admin"); // [{ id, doc, updatedAt }]
 * ```
 */
export function findDocs<T>(db: Database, table: string, jsonPath: string, value: string | number | boolean | null): StoredDoc<T>[] {
  const bound = typeof value === "boolean" ? Number(value) : value;
  const op = value === null ? "IS" : "=";
  const rows = queryAll<{ id: string; doc: string; updated_at: string }>(
    db,
    `SELECT id, doc, updated_at FROM ${quoteIdent(table)} WHERE json_extract(doc, ?) ${op} ? ORDER BY id ASC;`,
    [jsonPath, bound]
  );
  return rows.map((r) => ({ id: r.id, doc: JSON.parse(r.doc) as T, updatedAt: r.updated_at }));
}

/**
 * Insert one record (keys = columns). @returns The new `rowid`.
 * @throws On an empty record.
 * @example `const id = sqliteutils.insertRow(db, "items", { name: "Gadget", price: 9.99 });`
 */
export function insertRow(db: Database, table: string, record: Record<string, any>): number {
  const keys = Object.keys(record);
  if (keys.length === 0) throw new Error(`[sqliteutils.insertRow] Cannot insert empty record into ${table}`);
  const cols = keys.map(quoteIdent).join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const info = db.query(`INSERT INTO ${quoteIdent(table)} (${cols}) VALUES (${placeholders});`).run(...Object.values(record));
  return Number(info.lastInsertRowid);
}

/**
 * Bulk-insert many records in a single transaction (orders of magnitude faster than a loop).
 * Columns are taken from the first record; missing keys bind as `NULL`.
 * @returns Number of rows inserted.
 * @example
 * ```ts
 * sqliteutils.insertMany(db, "items", [{ name: "A", price: 1 }, { name: "B", price: 2 }]); // 2
 * ```
 */
export function insertMany(db: Database, table: string, records: Record<string, any>[]): number {
  const first = records[0];
  if (!first) return 0;
  const keys = Object.keys(first);
  const sql = `INSERT INTO ${quoteIdent(table)} (${keys.map(quoteIdent).join(", ")}) VALUES (${keys.map(() => "?").join(", ")});`;
  const stmt = db.query(sql);
  return transaction(db, () => {
    for (const r of records) stmt.run(...keys.map((k) => r[k] ?? null));
    return records.length;
  });
}

/**
 * Insert or update on conflict. `conflictColumns` must match a PRIMARY KEY / UNIQUE constraint.
 * @returns The affected `rowid`.
 * @example
 * ```ts
 * sqliteutils.upsertRow(db, "users", { email: "a@x.io", name: "Ada" }, ["email"]);
 * ```
 */
export function upsertRow(db: Database, table: string, record: Record<string, any>, conflictColumns: string[]): number {
  const keys = Object.keys(record);
  if (keys.length === 0) throw new Error(`[sqliteutils.upsertRow] Cannot upsert empty record into ${table}`);
  if (conflictColumns.length === 0) throw new Error(`[sqliteutils.upsertRow] conflictColumns required for ${table}`);
  const updates = keys.filter((k) => !conflictColumns.includes(k)).map((k) => `${quoteIdent(k)} = excluded.${quoteIdent(k)}`);
  const action = updates.length ? `DO UPDATE SET ${updates.join(", ")}` : "DO NOTHING";
  const sql = `INSERT INTO ${quoteIdent(table)} (${keys.map(quoteIdent).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})
    ON CONFLICT(${conflictColumns.map(quoteIdent).join(", ")}) ${action};`;
  return Number(db.query(sql).run(...Object.values(record)).lastInsertRowid);
}

/**
 * Select rows with an optional parameterized WHERE clause (may include ORDER BY / LIMIT).
 * @example
 * ```ts
 * sqliteutils.selectRows(db, "items", ["name", "price"], "price > ? ORDER BY price DESC LIMIT 10", [5]);
 * ```
 */
export function selectRows<T = Record<string, any>>(
  db: Database,
  table: string,
  columns: string[] = ["*"],
  whereClause?: string,
  params: SqlParams = []
): T[] {
  const cols = columns.map((c) => (c === "*" ? "*" : quoteIdent(c))).join(", ");
  const where = whereClause ? ` WHERE ${whereClause}` : "";
  return queryAll<T>(db, `SELECT ${cols} FROM ${quoteIdent(table)}${where};`, params);
}

/**
 * First matching row or `null` (convenience over {@link selectRows}).
 * @example `sqliteutils.selectOne(db, "users", "email = ?", ["a@x.io"]);`
 */
export function selectOne<T = Record<string, any>>(db: Database, table: string, whereClause: string, params: SqlParams = []): T | null {
  return queryOne<T>(db, `SELECT * FROM ${quoteIdent(table)} WHERE ${whereClause} LIMIT 1;`, params);
}

/**
 * Update matching rows. `updates` values bind first, then `params`. @returns Rows changed.
 * @example `sqliteutils.updateRows(db, "items", { price: 7 }, "name = ?", ["Gadget"]); // 1`
 */
export function updateRows(
  db: Database,
  table: string,
  updates: Record<string, any>,
  whereClause?: string,
  params: SqlParams = []
): number {
  const setKeys = Object.keys(updates);
  if (setKeys.length === 0) return 0;
  const setExpr = setKeys.map((k) => `${quoteIdent(k)} = ?`).join(", ");
  const where = whereClause ? ` WHERE ${whereClause}` : "";
  return db.query(`UPDATE ${quoteIdent(table)} SET ${setExpr}${where};`).run(...Object.values(updates), ...params).changes;
}

/**
 * Delete matching rows (all rows when no clause). @returns Rows deleted.
 * @example `sqliteutils.deleteRows(db, "items", "price < ?", [1]);`
 */
export function deleteRows(db: Database, table: string, whereClause?: string, params: SqlParams = []): number {
  const where = whereClause ? ` WHERE ${whereClause}` : "";
  return db.query(`DELETE FROM ${quoteIdent(table)}${where};`).run(...params).changes;
}

/**
 * Apply pending migrations in ascending version order; each runs in its own transaction and is
 * recorded in `_schema_migrations`. Idempotent: re-running applies nothing.
 * @returns Number of migrations newly applied.
 * @throws When two migrations share a version, or a migration fails (with its version in the message).
 * @example
 * ```ts
 * sqliteutils.runMigrations(db, [
 *   { version: 1, name: "users", up: "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);" },
 *   { version: 2, up: "ALTER TABLE users ADD COLUMN email TEXT;" },
 * ]);
 * ```
 */
export function runMigrations(db: Database, migrations: SqlMigration[]): number {
  db.run("CREATE TABLE IF NOT EXISTS _schema_migrations (version INTEGER PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);");
  const versions = migrations.map((m) => m.version);
  const dup = versions.find((v, i) => versions.indexOf(v) !== i);
  if (dup !== undefined) throw new Error(`[sqliteutils.runMigrations] Duplicate migration version ${dup}`);
  const applied = new Set(queryAll<{ version: number }>(db, "SELECT version FROM _schema_migrations;").map((r) => r.version));
  const pending = [...migrations].filter((m) => !applied.has(m.version)).sort((a, b) => a.version - b.version);
  for (const m of pending) {
    try {
      transaction(db, () => {
        db.run(m.up);
        db.query("INSERT INTO _schema_migrations (version) VALUES (?);").run(m.version);
      });
    } catch (err: any) {
      throw new Error(`[sqliteutils.runMigrations] Migration ${m.version}${m.name ? ` (${m.name})` : ""} failed: ${err.message}`);
    }
  }
  return pending.length;
}

/**
 * Highest applied migration version (0 when none).
 * @example `sqliteutils.getSchemaVersion(db); // 2`
 */
export function getSchemaVersion(db: Database): number {
  if (!tableExists(db, "_schema_migrations")) return 0;
  return Number(queryValue(db, "SELECT COALESCE(MAX(version), 0) FROM _schema_migrations;") ?? 0);
}

/**
 * Create an FTS5 virtual table for full-text search.
 * @example `sqliteutils.createFtsTable(db, "articles", ["title", "body"]);`
 */
export function createFtsTable(db: Database, table: string, columns: string[]): void {
  if (columns.length === 0) throw new Error(`[sqliteutils.createFtsTable] ${table} needs at least one column`);
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS ${quoteIdent(table)} USING fts5(${columns.map(quoteIdent).join(", ")});`);
}

/**
 * Index one document into an FTS5 table.
 * @example `sqliteutils.indexFts(db, "articles", { title: "Bun", body: "fast runtime" });`
 */
export function indexFts(db: Database, table: string, row: Record<string, string>): void {
  insertRow(db, table, row);
}

/**
 * Full-text search using FTS5 `MATCH` syntax (`"exact phrase"`, `bun AND fast`, `pre*`).
 * @example `sqliteutils.searchFts(db, "articles", "fast", 10);`
 */
export function searchFts<T = Record<string, any>>(db: Database, table: string, query: string, limit = 50): T[] {
  const t = quoteIdent(table);
  return queryAll<T>(db, `SELECT * FROM ${t} WHERE ${t} MATCH ? LIMIT ?;`, [query, limit]);
}

/**
 * Relevance-ranked full-text search (BM25, best first). Each row gains a numeric `rank`
 * (lower = more relevant).
 * @example
 * ```ts
 * const hits = sqliteutils.searchFtsRanked<{ title: string; rank: number }>(db, "articles", "bun");
 * ```
 */
export function searchFtsRanked<T = Record<string, any>>(db: Database, table: string, query: string, limit = 50): (T & { rank: number })[] {
  const t = quoteIdent(table);
  return queryAll(db, `SELECT *, bm25(${t}) AS rank FROM ${t} WHERE ${t} MATCH ? ORDER BY rank LIMIT ?;`, [query, limit]);
}

/** Rebuild the file to reclaim free pages. @example `sqliteutils.vacuumDb(db);` */
export function vacuumDb(db: Database): void {
  db.run("VACUUM;");
}

/** Flush the WAL into the main file and truncate it. @example `sqliteutils.checkpointWal(db);` */
export function checkpointWal(db: Database): void {
  db.run("PRAGMA wal_checkpoint(TRUNCATE);");
}

/**
 * Write a consistent, compacted snapshot of a live database to `destPath` (`VACUUM INTO`).
 * @throws When `destPath` already exists (SQLite refuses to overwrite).
 * @example `sqliteutils.backupDb(db, "./backups/app-2026-10-03.db");`
 */
export function backupDb(db: Database, destPath: string): void {
  db.query("VACUUM INTO ?;").run(destPath);
}

/**
 * Database size in bytes (`page_count * page_size`).
 * @example `fileutils.formatBytes(sqliteutils.dbSizeBytes(db));`
 */
export function dbSizeBytes(db: Database): number {
  const pages = Number(queryValue(db, "PRAGMA page_count;") ?? 0);
  const size = Number(queryValue(db, "PRAGMA page_size;") ?? 0);
  return pages * size;
}

export const sqliteutils = {
  quoteIdent,
  openDb,
  closeDb,
  execSql,
  queryAll,
  queryOne,
  queryValue,
  transaction,
  tableExists,
  listTables,
  tableColumns,
  countRows,
  createKvTable,
  setKv,
  getKv,
  getKvOr,
  hasKv,
  incrementKv,
  deleteKv,
  listKv,
  createJsonStore,
  saveDoc,
  loadDoc,
  deleteDoc,
  listDocs,
  findDocs,
  insertRow,
  insertMany,
  upsertRow,
  selectRows,
  selectOne,
  updateRows,
  deleteRows,
  runMigrations,
  getSchemaVersion,
  createFtsTable,
  indexFts,
  searchFts,
  searchFtsRanked,
  vacuumDb,
  checkpointWal,
  backupDb,
  dbSizeBytes,
};
