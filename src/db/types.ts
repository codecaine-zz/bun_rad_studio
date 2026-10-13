/**
 * Shared database layer types. Engines differ (SQL dialect, transactions, permissions); this layer
 * normalises how callers talk to them but exposes real differences through `Capabilities`.
 */

export type Engine = "sqlite" | "mysql" | "postgres";

export interface TlsOptions {
  /** PEM text of a CA certificate to trust in addition to / instead of the system store. */
  ca?: string;
  /** Verify the server certificate. Defaults to true whenever TLS is enabled. */
  verify?: boolean;
}

export interface ConnectionConfig {
  engine: Engine;
  /** SQLite: file path, or ":memory:". */
  path?: string;
  /** SQLite open mode. "create" is the only mode that may create a missing file. Default "readwrite". */
  sqliteMode?: "readwrite" | "readonly" | "create" | "memory";
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  /** PostgreSQL schema used for unqualified names (default "public"). */
  schema?: string;
  tls?: boolean | TlsOptions;
  connectTimeoutMs?: number;
  /** MySQL only: allow fetching the server RSA key over a non-TLS connection (caching_sha2/sha256 auth). Default false. */
  allowPublicKeyRetrieval?: boolean;
  /** Server engines: pool ceiling (default 4). */
  maxConnections?: number;
  /** Read-only is enforced by the engine where possible (see `ReadOnlyEnforcement`). */
  readOnly?: boolean;
  /** Per-statement timeout in ms (0/undefined = none). */
  statementTimeoutMs?: number;
}

export type ReadOnlyEnforcement =
  /** The connection itself cannot write (SQLite readonly open). */
  | "connection"
  /** Every statement runs in a server-enforced READ ONLY transaction that is always rolled back. */
  | "transaction"
  | "none";

export interface Capabilities {
  engine: Engine;
  version: string;
  schemas: boolean;
  transactionalDdl: boolean;
  /** Statements can be interrupted server-side (PG pg_cancel_backend / MySQL KILL QUERY). */
  cancelQuery: boolean;
  /** A per-statement timeout is enforced by the server. */
  statementTimeout: boolean;
  readOnlyEnforcement: ReadOnlyEnforcement;
  /** Why a feature is unavailable: shown to users instead of silently hiding controls. */
  notes: Record<string, string>;
  explainAnalyze: boolean;
  routines: boolean;
  sequences: boolean;
}

/** JSON-safe value as sent to the browser. Big integers/decimals are strings, binary is tagged. */
export type WireValue = null | boolean | number | string | { $binary: string } | WireValue[] | { [k: string]: WireValue };

/** Value accepted from the browser as a bound parameter. Tagged objects keep exact types. */
export type Param =
  | null
  | boolean
  | number
  | string
  | { $bigint: string }
  | { $decimal: string }
  | { $binary: string }
  | { $date: string }
  | { $json: unknown };

export interface QueryResult {
  columns: string[];
  rows: Record<string, WireValue>[];
  rowCount: number;
  /** Rows changed by INSERT/UPDATE/DELETE (null when the engine does not report it). */
  affectedRows: number | null;
  /** Decimal string; null when not applicable. */
  lastInsertId: string | null;
  /** True when `maxRows` stopped the result early. */
  truncated: boolean;
  elapsedMs: number;
}

export interface QueryOptions {
  maxRows?: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  primaryKeyPosition: number | null;
  autoIncrement: boolean;
  generated: boolean;
  comment?: string | null;
}

export interface ForeignKeyInfo {
  name: string | null;
  columns: string[];
  refSchema?: string;
  refTable: string;
  refColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  columns: string[];
  primary: boolean;
}

export interface TableInfo {
  schema?: string;
  name: string;
  type: "table" | "view";
  columns: ColumnInfo[];
  primaryKey: string[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
  /** SQLite: rows can also be addressed via rowid. */
  hasRowid?: boolean;
  comment?: string | null;
}

export interface ObjectRef {
  schema?: string;
  name: string;
  type: "table" | "view";
}

export interface ServerInfo {
  version: string;
  currentDatabase: string | null;
  latencyMs: number;
}

export interface BrowseFilter {
  column: string;
  op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "contains" | "startsWith" | "isNull" | "notNull";
  value?: Param;
}

export interface BrowseRequest {
  table: ObjectRef;
  limit: number;
  offset: number;
  orderBy?: { column: string; direction: "asc" | "desc" }[];
  filters?: BrowseFilter[];
}

export type EditableInfo = { ok: true; keyColumns: string[]; keyKind: "primary" | "rowid" } | { ok: false; reason: string };

export interface BrowseResult {
  columns: ColumnInfo[];
  rows: Record<string, WireValue>[];
  total: number;
  limit: number;
  offset: number;
  /** When `editable.ok` is false, `editable.reason` explains why editing is disabled. */
  editable: EditableInfo;
}

export interface RowKey {
  [column: string]: Param;
}

export interface RowUpdate {
  table: ObjectRef;
  key: RowKey;
  /** Values the client last saw for the columns it is changing; the update fails if they differ now. */
  expected: Record<string, Param>;
  changes: Record<string, Param>;
}

export interface RowDelete {
  table: ObjectRef;
  key: RowKey;
  /** Whole-row snapshot for conflict detection (every listed column must still match). */
  expected?: Record<string, Param>;
}

export interface RowInsert {
  table: ObjectRef;
  values: Record<string, Param>;
}

export interface DbSession {
  readonly inTransaction: boolean;
  query(sql: string, params?: Param[], options?: QueryOptions): Promise<QueryResult>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  /** Ask the server to stop the statement currently running in this session. Returns false when unsupported. */
  cancel(): Promise<boolean>;
  close(): Promise<void>;
}

export interface DbAdapter {
  readonly config: Readonly<Omit<ConnectionConfig, "password">>;
  readonly engine: Engine;
  connect(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<ServerInfo>;
  capabilities(): Promise<Capabilities>;
  query(sql: string, params?: Param[], options?: QueryOptions): Promise<QueryResult>;
  openSession(): Promise<DbSession>;
  listObjects(): Promise<ObjectRef[]>;
  describeTable(ref: ObjectRef): Promise<TableInfo>;
  browse(req: BrowseRequest): Promise<BrowseResult>;
  insertRow(req: RowInsert): Promise<QueryResult>;
  updateRow(req: RowUpdate): Promise<QueryResult>;
  deleteRow(req: RowDelete): Promise<QueryResult>;
  /** Stream query/table rows as CSV text chunks with bounded memory. */
  exportCsv(source: { table: ObjectRef; excludeColumns?: string[] } | { sql: string; params?: Param[] }): AsyncGenerator<string>;
}
