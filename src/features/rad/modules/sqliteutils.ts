import { Database } from "bun:sqlite";

// Doer: Open SQLite database with optional WAL mode
export function openDb(path = ":memory:", pragmaWal = true): Database {
  const db = new Database(path);
  if (pragmaWal && path !== ":memory:") {
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
  }
  return db;
}

// Doer: Close database safely
export function closeDb(db: Database): void {
  db.close();
}

// Doer: Execute arbitrary SQL statement with optional parameters
export function execSql(db: Database, sql: string, params: any[] = []): void {
  const query = db.query(sql);
  query.run(...params);
}

// Doer: Create Key-Value table
export function createKvTable(db: Database, table = "kv_store"): void {
  db.run(`CREATE TABLE IF NOT EXISTS "${table}" (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
}

// Doer: Set key-value pair
export function setKv(db: Database, table: string, key: string, value: unknown): void {
  const strVal = typeof value === "string" ? value : JSON.stringify(value);
  const stmt = db.prepare(`INSERT INTO "${table}" (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`);
  stmt.run(key, strVal);
}

// Doer: Get key-value pair
export function getKv(db: Database, table: string, key: string): string | null {
  const stmt = db.prepare(`SELECT value FROM "${table}" WHERE key = ?;`);
  const row = stmt.get(key) as { value: string } | null;
  return row ? row.value : null;
}

// Coordinator: Get key-value with fallback and auto JSON parsing
export function getKvOr<T>(db: Database, table: string, key: string, fallback: T): T {
  const val = getKv(db, table, key);
  if (val === null) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return val as unknown as T;
  }
}

// Doer: Delete key-value pair
export function deleteKv(db: Database, table: string, key: string): boolean {
  const stmt = db.prepare(`DELETE FROM "${table}" WHERE key = ?;`);
  const res = stmt.run(key);
  return res.changes > 0;
}

// Doer: List all KV pairs
export function listKv(db: Database, table: string): Record<string, string> {
  const stmt = db.prepare(`SELECT key, value FROM "${table}" ORDER BY key ASC;`);
  const rows = stmt.all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// Doer: Create JSON document store table
export function createJsonStore(db: Database, table = "json_store"): void {
  db.run(`CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY, doc TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
}

// Doer: Save JSON document
export function saveDoc<T>(db: Database, table: string, id: string, doc: T): void {
  const strVal = JSON.stringify(doc);
  const stmt = db.prepare(`INSERT INTO "${table}" (id, doc, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, updated_at = CURRENT_TIMESTAMP;`);
  stmt.run(id, strVal);
}

// Doer: Load JSON document
export function loadDoc<T>(db: Database, table: string, id: string): T | null {
  const stmt = db.prepare(`SELECT doc FROM "${table}" WHERE id = ?;`);
  const row = stmt.get(id) as { doc: string } | null;
  if (!row) return null;
  return JSON.parse(row.doc) as T;
}

// Doer: Delete JSON document
export function deleteDoc(db: Database, table: string, id: string): boolean {
  const stmt = db.prepare(`DELETE FROM "${table}" WHERE id = ?;`);
  const res = stmt.run(id);
  return res.changes > 0;
}

// Doer: List all JSON documents
export function listDocs<T>(db: Database, table: string): { id: string; doc: T }[] {
  const stmt = db.prepare(`SELECT id, doc FROM "${table}" ORDER BY id ASC;`);
  const rows = stmt.all() as { id: string; doc: string }[];
  return rows.map((r) => ({ id: r.id, doc: JSON.parse(r.doc) as T }));
}

// Doer: Insert row via plain record dictionary
export function insertRow(db: Database, table: string, record: Record<string, any>): number {
  const keys = Object.keys(record);
  if (keys.length === 0) throw new Error("[sqliteutils] Cannot insert empty record");
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const vals = Object.values(record);
  const stmt = db.prepare(`INSERT INTO "${table}" (${cols}) VALUES (${placeholders});`);
  const info = stmt.run(...vals);
  return Number(info.lastInsertRowid);
}

// Coordinator: Select rows with parameterized filter
export function selectRows<T = Record<string, any>>(
  db: Database,
  table: string,
  columns: string[] = ["*"],
  whereClause?: string,
  params: any[] = []
): T[] {
  const cols = columns.map((c) => (c === "*" ? "*" : `"${c}"`)).join(", ");
  const sql = whereClause
    ? `SELECT ${cols} FROM "${table}" WHERE ${whereClause};`
    : `SELECT ${cols} FROM "${table}";`;
  const stmt = db.prepare(sql);
  return stmt.all(...params) as T[];
}

// Coordinator: Update rows with parameterized updates and filter
export function updateRows(
  db: Database,
  table: string,
  updates: Record<string, any>,
  whereClause?: string,
  params: any[] = []
): number {
  const setKeys = Object.keys(updates);
  if (setKeys.length === 0) return 0;
  const setExpr = setKeys.map((k) => `"${k}" = ?`).join(", ");
  const setVals = Object.values(updates);
  const sql = whereClause
    ? `UPDATE "${table}" SET ${setExpr} WHERE ${whereClause};`
    : `UPDATE "${table}" SET ${setExpr};`;
  const stmt = db.prepare(sql);
  const info = stmt.run(...setVals, ...params);
  return info.changes;
}

// Coordinator: Delete rows with parameterized filter
export function deleteRows(db: Database, table: string, whereClause?: string, params: any[] = []): number {
  const sql = whereClause ? `DELETE FROM "${table}" WHERE ${whereClause};` : `DELETE FROM "${table}";`;
  const stmt = db.prepare(sql);
  const info = stmt.run(...params);
  return info.changes;
}

export interface SqlMigration {
  version: number;
  up: string;
}

// Coordinator: Run automatic ordered migrations
export function runMigrations(db: Database, migrations: SqlMigration[]): number {
  db.run("CREATE TABLE IF NOT EXISTS _schema_migrations (version INTEGER PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);");
  const appliedRows = db.prepare("SELECT version FROM _schema_migrations ORDER BY version ASC;").all() as { version: number }[];
  const appliedSet = new Set(appliedRows.map((r) => r.version));
  let newlyApplied = 0;
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const m of sorted) {
    if (!appliedSet.has(m.version)) {
      db.transaction(() => {
        db.run(m.up);
        db.prepare("INSERT INTO _schema_migrations (version) VALUES (?);").run(m.version);
      })();
      newlyApplied++;
    }
  }
  return newlyApplied;
}

// Doer: Create FTS5 virtual table for full-text search
export function createFtsTable(db: Database, table: string, columns: string[]): void {
  const cols = columns.map((c) => `"${c}"`).join(", ");
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS "${table}" USING fts5(${cols});`);
}

// Doer: Index document in FTS5 full-text search table
export function indexFts(db: Database, table: string, row: Record<string, string>): void {
  const keys = Object.keys(row);
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const vals = Object.values(row);
  db.prepare(`INSERT INTO "${table}" (${cols}) VALUES (${placeholders});`).run(...vals);
}

// Coordinator: Query FTS5 table with full-text search match query
export function searchFts<T = Record<string, any>>(db: Database, table: string, query: string, limit = 50): T[] {
  const stmt = db.prepare(`SELECT * FROM "${table}" WHERE "${table}" MATCH ? LIMIT ?;`);
  return stmt.all(query, limit) as T[];
}

// Doer: Optimize SQLite database with VACUUM
export function vacuumDb(db: Database): void {
  db.run("VACUUM;");
}

// Doer: Truncate and checkpoint WAL journal
export function checkpointWal(db: Database): void {
  db.run("PRAGMA wal_checkpoint(TRUNCATE);");
}

export const sqliteutils = {
  openDb,
  closeDb,
  execSql,
  createKvTable,
  setKv,
  getKv,
  getKvOr,
  deleteKv,
  listKv,
  createJsonStore,
  saveDoc,
  loadDoc,
  deleteDoc,
  listDocs,
  insertRow,
  selectRows,
  updateRows,
  deleteRows,
  runMigrations,
  createFtsTable,
  indexFts,
  searchFts,
  vacuumDb,
  checkpointWal,
};

