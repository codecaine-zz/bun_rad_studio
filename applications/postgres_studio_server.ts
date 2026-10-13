/**
 * ⚡ Bun RAD Studio - Postgres Studio Pro Server Engine
 * 
 * High-performance background HTTP telemetry & database engine for Postgres Studio Pro.
 * Runs on a dedicated OS thread (via Bun Worker) or standalone web server, providing
 * sub-millisecond query execution, schema reflection, extensions management,
 * materialized views, JSONB/array handling, and live database telemetry
 * using Bun's native high-performance SQL PostgreSQL client.
 */

import { guardLocalRequest, writeClipboardSync } from "../src/localGuard";
import { getSharedWorkbench } from "../src/db/workbench_shared";
import { quoteIdent } from "../src/db/quote";
import { SQL } from "bun";
import { resolve, basename } from "path";
import { existsSync, statSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { generatePostgresStudioHtml } from "./postgres_studio.ts";
import { MacroStore, handleMacroRoute, type MacroAdapter, type MacroQueryResult } from "./studio_macros_server.ts";

/** Quote a PostgreSQL identifier (doubles embedded quotes). Never splice names into SQL without it. */
const pgq = (name: unknown): string => quoteIdent("postgres", String(name ?? ""));
/** Type names and default expressions are SQL fragments by nature; refuse anything that could start another statement. */
function assertSafeSqlFragment(what: string, text: string): void {
  if (/;|--|\/\*/.test(String(text ?? ""))) throw new Error(`Invalid ${what}: statement separators and comments are not allowed`);
}
/** Quote a PostgreSQL string literal (standard_conforming_strings is on, so only quotes need doubling). */
const pgl = (value: unknown): string => "'" + String(value ?? "").replace(/'/g, "''") + "'";

export interface PostgresConnectionConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  schema?: string;
  tls?: boolean;
  url?: string;
}

export interface PostgresConnectionConfigSanitized {
  host: string;
  port: number;
  user: string;
  database: string;
  schema: string;
  tls: boolean;
  hasPassword: boolean;
  source: "env" | "manual";
}

export interface ServerOptions {
  port?: number;
  host?: string;
  initialDbPath?: string;
  initialSchema?: string;
  config?: Partial<PostgresConnectionConfig>;
}

export interface TableColumnMeta {
  cid: number;
  name: string;
  type: string;
  udt_name?: string;
  notnull: boolean;
  dflt_value: any;
  pk: boolean;
}

export interface TableSchemaMeta {
  name: string;
  schema: string;
  type: "table" | "view" | "materialized_view" | "foreign_table";
  sql: string;
  rowCount: number;
  columns: TableColumnMeta[];
  indices: { name: string; unique: boolean; columns: string[]; indexDef?: string }[];
  foreignKeys: { id: number; seq: number; table: string; from: string; to: string }[];
}

export interface DatabaseKpis {
  dbPath: string;
  dbName: string;
  activeSchema: string;
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
  matViewCount: number;
  totalRows: number;
  cacheSizeKb: number;
  pgVersion: string;
  activeConnections: number;
  sharedBuffers: string;
  isSSL: boolean;
  latencyMs: number;
}

export interface DatabaseSchemaResponse {
  success: boolean;
  name: string;
  tables: TableSchemaMeta[];
  views: TableSchemaMeta[];
  matviews: TableSchemaMeta[];
  schemas: string[];
  activeSchema: string;
  indicesCount: number;
  totalRows: number;
}

export interface PostgresExtensionMeta {
  name: string;
  defaultVersion: string;
  installedVersion: string | null;
  comment: string;
  isInstalled: boolean;
}

export interface PostgresActivityMeta {
  pid: number;
  usename: string;
  datname: string;
  client_addr: string;
  state: string;
  wait_event_type: string;
  wait_event: string;
  duration: string;
  query: string;
}

export interface PostgresBlockedLockMeta {
  blockedPid: number;
  blockedUser: string;
  blockingPid: number;
  blockingUser: string;
  blockedQuery: string;
  blockingQuery: string;
}

export interface PostgresEnumMeta {
  name: string;
  schema: string;
  values: string[];
}

export interface PostgresPartitionMeta {
  parentTable: string;
  parentSchema: string;
  partitionStrategy: string;
  partitionName: string;
  partitionExpression: string;
  totalSize: string;
  rowEstimate: number;
}

export interface PostgresReplicationMeta {
  standbys: Array<{
    pid: number;
    clientAddr: string;
    applicationName: string;
    state: string;
    syncState: string;
    writeLag: string;
    flushLag: string;
    replayLag: string;
  }>;
  slots: Array<{
    slotName: string;
    plugin: string;
    slotType: string;
    active: boolean;
    walStatus: string;
  }>;
  walStats: Record<string, any>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// -------------------------------------------------------------------------------------------------
// Postgres Studio Manager Core Engine
// -------------------------------------------------------------------------------------------------

export class PostgresManager {
  public activePath: string;
  public activeSchema: string = "public";
  public configSource: "env" | "manual" = "env";
  public sql_conn!: any;
  public dbConfig!: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    schema: string;
    tls?: boolean;
  };

  public macroStore = new MacroStore("postgres", () => {
    const c = this.dbConfig;
    return c ? `${c.host}:${c.port}/${c.database}/${this.activeSchema}` : "postgres";
  });

  constructor(initialDb: string = "", initialConfig?: Partial<PostgresConnectionConfig>) {
    this.loadEnvFile();
    this.activePath = initialDb 
      || initialConfig?.database 
      || process.env.PG_DATABASE 
      || process.env.PG_NAME 
      || process.env.PG_DB 
      || process.env.POSTGRES_DB 
      || process.env.DB_NAME 
      || "mydb";
    this.activeSchema = initialConfig?.schema || process.env.PG_SCHEMA || "public";
    this.parseConfig(initialDb, initialConfig);
    this.initConnection();
  }

  private loadEnvFile() {
    try {
      const envPath = resolve(process.cwd(), ".env");
      if (existsSync(envPath)) {
        const text = readFileSync(envPath, "utf-8");
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        }
      }
    } catch {}
  }

  private parseConfig(overrideDb: string = "", customConfig?: Partial<PostgresConnectionConfig>) {
    this.loadEnvFile();

    let host = customConfig?.host 
      || process.env.PG_HOST 
      || process.env.POSTGRES_HOST 
      || process.env.DB_HOST 
      || "localhost";
    let port = customConfig?.port 
      ? Number(customConfig.port) 
      : (Number(process.env.PG_PORT || process.env.POSTGRES_PORT || process.env.DB_PORT) || 5432);
    let user = customConfig?.user 
      || process.env.PG_USER 
      || process.env.POSTGRES_USER 
      || process.env.DB_USER 
      || "postgres";
    let password = customConfig?.password !== undefined 
      ? customConfig.password 
      : (process.env.PG_PASSWORD !== undefined 
          ? process.env.PG_PASSWORD 
          : (process.env.POSTGRES_PASSWORD !== undefined ? process.env.POSTGRES_PASSWORD : (process.env.DB_PASSWORD || "")));
    let database = customConfig?.database 
      || overrideDb 
      || process.env.PG_DATABASE 
      || process.env.PG_NAME 
      || process.env.PG_DB 
      || process.env.POSTGRES_DB 
      || process.env.DB_NAME 
      || "mydb";
    let schema = customConfig?.schema || process.env.PG_SCHEMA || "public";
    let tls = customConfig?.tls !== undefined 
      ? Boolean(customConfig.tls) 
      : (process.env.PG_TLS === "1" || process.env.PG_TLS === "true" || process.env.PG_SSL === "1" || process.env.PG_SSL === "true");

    const urlCandidate = customConfig?.url || process.env.PG_URL || process.env.DATABASE_URL;
    if (urlCandidate) {
      try {
        const u = new URL(urlCandidate.replace(/^(postgres|postgresql):\/\//i, "http://"));
        if (u.hostname) host = u.hostname;
        if (u.port) port = Number(u.port);
        if (u.username) user = decodeURIComponent(u.username);
        if (u.password) password = decodeURIComponent(u.password);
        if (u.pathname && u.pathname.length > 1 && !overrideDb && !customConfig?.database) {
          database = decodeURIComponent(u.pathname.slice(1));
        }
        if (u.searchParams.get("schema")) {
          schema = u.searchParams.get("schema")!;
        }
        if (u.searchParams.get("sslmode") === "require" || u.searchParams.get("tls") === "true") {
          tls = true;
        }
      } catch {}
    }

    if (customConfig && Object.keys(customConfig).length > 0) {
      this.configSource = "manual";
    }

    this.dbConfig = { host, port, user, password, database, schema, tls };
    this.activePath = database;
    this.activeSchema = schema;
  }

  public getConfig(): PostgresConnectionConfigSanitized {
    return {
      host: this.dbConfig.host,
      port: this.dbConfig.port,
      user: this.dbConfig.user,
      database: this.dbConfig.database,
      schema: this.activeSchema,
      tls: Boolean(this.dbConfig.tls),
      hasPassword: Boolean(this.dbConfig.password),
      source: this.configSource,
    };
  }

  public initConnection() {
    try {
      this.sql_conn = new SQL({
        adapter: "postgres",
        hostname: this.dbConfig.host,
        port: this.dbConfig.port,
        username: this.dbConfig.user,
        password: this.dbConfig.password,
        database: this.dbConfig.database,
        tls: this.dbConfig.tls ?? false,
      });
      // Apply search path
      this.sql_conn.unsafe(`SET search_path TO ${pgq(this.activeSchema)}, public;`).catch(() => {});
    } catch (e: any) {
      console.error("Failed to initialize Postgres connection:", e);
    }
  }

  public async setSchema(schemaName: string): Promise<boolean> {
    const clean = (schemaName || "").trim();
    if (!clean) return false;
    try {
      // PostgreSQL accepts a non-existent schema in search_path; only switch to schemas that really exist.
      const found = await this.sql_conn.unsafe("SELECT 1 FROM pg_namespace WHERE nspname = $1", [clean]);
      if (found.length === 0) return false;
      await this.sql_conn.unsafe(`SET search_path TO ${pgq(clean)}, public;`);
      this.activeSchema = clean;
      this.dbConfig.schema = clean;
      return true;
    } catch {
      return false;
    }
  }

  public async getSchemas(): Promise<string[]> {
    try {
      const rows = await this.sql_conn.unsafe(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema') 
          AND schema_name NOT LIKE 'pg_%' 
        ORDER BY (schema_name = 'public') DESC, schema_name ASC;
      `);
      return rows.map((r: any) => String(r.schema_name || "")).filter(Boolean);
    } catch {
      return ["public"];
    }
  }

  public async createSchema(schemaName: string): Promise<{ success: boolean; schema: string; error?: string }> {
    const clean = (schemaName || "").trim();
    if (!clean) return { success: false, schema: schemaName, error: "Schema name cannot be empty" };
    if (!/^[a-zA-Z0-9_$-]+$/.test(clean)) {
      return { success: false, schema: schemaName, error: "Invalid schema name: only alphanumeric characters, underscore, and dash are permitted" };
    }
    try {
      await this.sql_conn.unsafe(`CREATE SCHEMA IF NOT EXISTS ${pgq(clean)};`);
      await this.setSchema(clean);
      return { success: true, schema: clean };
    } catch (err: any) {
      return { success: false, schema: schemaName, error: err?.message || String(err) };
    }
  }

  public async testConnection(candidateConfig?: Partial<PostgresConnectionConfig>): Promise<{
    success: boolean;
    latencyMs: number;
    version?: string;
    databases?: string[];
    schemas?: string[];
    error?: string;
  }> {
    let host = candidateConfig?.host || this.dbConfig.host || "localhost";
    let port = Number(candidateConfig?.port || this.dbConfig.port || 5432);
    let user = candidateConfig?.user || this.dbConfig.user || "postgres";
    let password = candidateConfig?.password !== undefined ? candidateConfig.password : this.dbConfig.password;
    let database = candidateConfig?.database !== undefined ? candidateConfig.database : this.dbConfig.database;
    let tls = candidateConfig?.tls ?? this.dbConfig.tls ?? false;

    if (candidateConfig?.url) {
      try {
        const u = new URL(candidateConfig.url.replace(/^(postgres|postgresql):\/\//i, "http://"));
        if (u.hostname) host = u.hostname;
        if (u.port) port = Number(u.port);
        if (u.username) user = decodeURIComponent(u.username);
        if (u.password) password = decodeURIComponent(u.password);
        if (u.pathname && u.pathname.length > 1) {
          database = decodeURIComponent(u.pathname.slice(1));
        }
      } catch (err: any) {
        return { success: false, latencyMs: 0, error: `Invalid connection URL: ${err.message}` };
      }
    }

    const start = performance.now();
    try {
      const testConn = new SQL({
        adapter: "postgres",
        hostname: host,
        port: port,
        username: user,
        password: password,
        database: database || "postgres",
        tls: tls,
      });

      const versionRows = await testConn.unsafe("SELECT version();");
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      const rawVer = String(versionRows?.[0]?.version || "PostgreSQL");
      const versionMatch = rawVer.match(/PostgreSQL\s+([\d.]+)/i);
      const version = versionMatch ? `PostgreSQL ${versionMatch[1]}` : rawVer.split(",")[0];

      let databases: string[] = [];
      try {
        const dbRows = await testConn.unsafe("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;");
        databases = (dbRows || []).map((r: any) => String(r.datname || "")).filter(Boolean);
      } catch {}

      let schemas: string[] = ["public"];
      try {
        const scRows = await testConn.unsafe(`
          SELECT schema_name FROM information_schema.schemata 
          WHERE schema_name NOT IN ('pg_catalog', 'information_schema') AND schema_name NOT LIKE 'pg_%' 
          ORDER BY schema_name;
        `);
        schemas = (scRows || []).map((r: any) => String(r.schema_name || "")).filter(Boolean);
      } catch {}

      await testConn.end?.().catch(() => {});
      return { success: true, latencyMs, version, databases, schemas };
    } catch (err: any) {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      return { success: false, latencyMs, error: err?.message || String(err) };
    }
  }

  public async updateConfig(newConfig: PostgresConnectionConfig): Promise<{
    success: boolean;
    config: PostgresConnectionConfigSanitized;
    error?: string;
    version?: string;
    databases?: string[];
  }> {
    let host = (newConfig.host ?? this.dbConfig.host ?? "localhost").trim();
    let port = Number(newConfig.port ?? this.dbConfig.port ?? 5432);
    let user = (newConfig.user ?? this.dbConfig.user ?? "postgres").trim();
    let password = newConfig.password !== undefined ? newConfig.password : this.dbConfig.password;
    let database = (newConfig.database ?? this.dbConfig.database ?? "mydb").trim();
    let schema = (newConfig.schema ?? this.activeSchema ?? "public").trim();
    let tls = newConfig.tls !== undefined ? Boolean(newConfig.tls) : (this.dbConfig.tls ?? false);

    if (newConfig.url) {
      try {
        const u = new URL(newConfig.url.replace(/^(postgres|postgresql):\/\//i, "http://"));
        if (u.hostname) host = u.hostname;
        if (u.port) port = Number(u.port);
        if (u.username) user = decodeURIComponent(u.username);
        if (u.password) password = decodeURIComponent(u.password);
        if (u.pathname && u.pathname.length > 1) {
          database = decodeURIComponent(u.pathname.slice(1));
        }
        if (u.searchParams.get("schema")) {
          schema = u.searchParams.get("schema")!;
        }
        if (u.searchParams.get("sslmode") === "require" || u.searchParams.get("tls") === "true") {
          tls = true;
        }
      } catch (err: any) {
        return {
          success: false,
          config: this.getConfig(),
          error: `Invalid connection URL: ${err.message}`,
        };
      }
    }

    const test = await this.testConnection({ host, port, user, password, database, schema, tls });
    if (!test.success) {
      return {
        success: false,
        config: this.getConfig(),
        error: `Could not connect to PostgreSQL with these credentials: ${test.error}`,
      };
    }

    try { this.sql_conn?.end?.(); } catch {}

    this.dbConfig = { host, port, user, password, database, schema, tls };
    this.activePath = database;
    this.activeSchema = schema;
    this.configSource = "manual";
    this.initConnection();

    await this.logAudit("DB_CONFIG", "SYSTEM", `Updated manual PostgreSQL connection: ${user}@${host}:${port}/${database} (schema: ${schema})`);

    return {
      success: true,
      config: this.getConfig(),
      version: test.version,
      databases: test.databases,
    };
  }

  public resetToEnv(): { success: boolean; config: PostgresConnectionConfigSanitized } {
    try { this.sql_conn?.end?.(); } catch {}
    this.configSource = "env";
    this.loadEnvFile();
    this.parseConfig();
    this.initConnection();
    return { success: true, config: this.getConfig() };
  }

  public async createDatabase(dbName: string): Promise<{ success: boolean; database: string; name: string; error?: string }> {
    try {
      const clean = (dbName || "").trim();
      if (!clean) throw new Error("Database name cannot be empty");
      if (!/^[a-zA-Z0-9_$-]+$/.test(clean)) {
        throw new Error("Invalid database name: only alphanumeric characters, underscore, and dash are permitted");
      }
      const rootSql = new SQL({
        adapter: "postgres",
        hostname: this.dbConfig.host,
        port: this.dbConfig.port,
        username: this.dbConfig.user,
        password: this.dbConfig.password,
        database: "postgres",
        tls: this.dbConfig.tls ?? false,
      });
      try {
        await rootSql.unsafe(`CREATE DATABASE ${pgq(clean)};`);
      } finally {
        await rootSql.end?.().catch(() => {});
      }
      return { success: true, database: clean, name: clean };
    } catch (err: any) {
      return { success: false, database: dbName, name: dbName, error: err?.message || String(err) };
    }
  }

  public async connect(newDb: string, newSchema?: string): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      const targetDb = newDb || this.dbConfig.database;
      const targetSchema = newSchema || this.activeSchema || "public";
      try { this.sql_conn?.end?.(); } catch {}

      this.dbConfig.database = targetDb;
      this.activePath = targetDb;
      this.activeSchema = targetSchema;
      this.dbConfig.schema = targetSchema;
      this.initConnection();

      await this.logAudit("CONNECT", targetDb, `Connected to database: ${targetDb}.${targetSchema}`);
      return { success: true, path: `${targetDb}.${targetSchema}` };
    } catch (err: any) {
      return { success: false, path: newDb, error: err.message };
    }
  }

  public async getWorkspaceDatabases(): Promise<{ name: string; path: string; sizeFormatted: string; isCurrent?: boolean }[]> {
    try {
      const rows = await this.sql_conn.unsafe(`
        SELECT datname, pg_size_pretty(pg_database_size(datname)) as size 
        FROM pg_database 
        WHERE datistemplate = false 
        ORDER BY (datname = current_database()) DESC, datname ASC;
      `);
      return rows.map((r: any) => ({
        name: `Postgres: ${r.datname}`,
        path: r.datname,
        sizeFormatted: r.size || "Unknown",
        isCurrent: r.datname === this.dbConfig.database,
      }));
    } catch {
      return [
        {
          name: `Postgres: ${this.dbConfig.database}`,
          path: this.dbConfig.database,
          sizeFormatted: "Active",
          isCurrent: true,
        },
      ];
    }
  }

  public async getKpis(): Promise<DatabaseKpis> {
    const dbName = this.dbConfig.database;
    const schema = this.activeSchema;
    const start = performance.now();

    try {
      let version = "PostgreSQL 16+";
      try {
        const vRes = await this.sql_conn.unsafe("SELECT version();");
        const rawVer = String(vRes?.[0]?.version || "");
        const m = rawVer.match(/PostgreSQL\s+([\d.]+)/i);
        version = m ? `PostgreSQL ${m[1]}` : rawVer.split(",")[0];
      } catch {}

      let sizeBytes = 0;
      let sizeFormatted = "0 B";
      try {
        const szRes = await this.sql_conn.unsafe("SELECT pg_database_size(current_database()) as size_bytes, pg_size_pretty(pg_database_size(current_database())) as size_str;");
        sizeBytes = Number(szRes?.[0]?.size_bytes || 0);
        sizeFormatted = String(szRes?.[0]?.size_str || "0 B");
      } catch {}

      let tableCount = 0;
      let viewCount = 0;
      let matViewCount = 0;
      try {
        const countsRes = await this.sql_conn.unsafe(`
          SELECT 
            COUNT(CASE WHEN table_type = 'BASE TABLE' THEN 1 END) as tables,
            COUNT(CASE WHEN table_type = 'VIEW' THEN 1 END) as views
          FROM information_schema.tables 
          WHERE table_schema = ${pgl(schema)};
        `);
        tableCount = Number(countsRes?.[0]?.tables || 0);
        viewCount = Number(countsRes?.[0]?.views || 0);
      } catch {}

      try {
        const mvRes = await this.sql_conn.unsafe(`SELECT count(*) as c FROM pg_matviews WHERE schemaname = ${pgl(schema)};`);
        matViewCount = Number(mvRes?.[0]?.c || 0);
      } catch {}

      let totalRows = 0;
      try {
        const rowsRes = await this.sql_conn.unsafe(`
          SELECT COALESCE(SUM(reltuples)::bigint, 0) as total_rows 
          FROM pg_class c 
          JOIN pg_namespace n ON n.oid = c.relnamespace 
          WHERE n.nspname = ${pgl(schema)} AND c.relkind IN ('r', 'm');
        `);
        totalRows = Math.max(0, Number(rowsRes?.[0]?.total_rows || 0));
      } catch {}

      let activeConnections = 1;
      try {
        const connRes = await this.sql_conn.unsafe("SELECT count(*) as c FROM pg_stat_activity WHERE datname = current_database();");
        activeConnections = Number(connRes?.[0]?.c || 1);
      } catch {}

      let sharedBuffers = "128MB";
      try {
        const sbRes = await this.sql_conn.unsafe("SHOW shared_buffers;");
        sharedBuffers = String(sbRes?.[0]?.shared_buffers || "128MB");
      } catch {}

      const latencyMs = Math.round((performance.now() - start) * 100) / 100;

      return {
        dbPath: `${this.dbConfig.user}@${this.dbConfig.host}:${this.dbConfig.port}/${dbName}`,
        dbName,
        activeSchema: schema,
        isMemory: false,
        fileSizeBytes: sizeBytes,
        fileSizeFormatted: sizeFormatted,
        pageSize: 8192,
        pageCount: Math.ceil(sizeBytes / 8192),
        freelistCount: 0,
        journalMode: "WAL",
        walMode: true,
        foreignKeys: true,
        tableCount,
        viewCount,
        matViewCount,
        totalRows,
        cacheSizeKb: 131072,
        pgVersion: version,
        activeConnections,
        sharedBuffers,
        isSSL: Boolean(this.dbConfig.tls),
        latencyMs,
      };
    } catch {
      return {
        dbPath: `${this.dbConfig.host}/${dbName}`,
        dbName,
        activeSchema: schema,
        isMemory: false,
        fileSizeBytes: 0,
        fileSizeFormatted: "0 B",
        pageSize: 8192,
        pageCount: 0,
        freelistCount: 0,
        journalMode: "WAL",
        walMode: true,
        foreignKeys: true,
        tableCount: 0,
        viewCount: 0,
        matViewCount: 0,
        totalRows: 0,
        cacheSizeKb: 0,
        pgVersion: "PostgreSQL",
        activeConnections: 1,
        sharedBuffers: "128MB",
        isSSL: false,
        latencyMs: 0,
      };
    }
  }

  public async getSchema(targetSchema?: string): Promise<DatabaseSchemaResponse> {
    const schema = targetSchema || this.activeSchema || "public";
    const tablesMeta: TableSchemaMeta[] = [];
    const viewsMeta: TableSchemaMeta[] = [];
    const matviewsMeta: TableSchemaMeta[] = [];
    let totalIndices = 0;
    let totalRows = 0;

    try {
      const schemas = await this.getSchemas();

      // 1. Tables & Views
      const items = await this.sql_conn.unsafe(`
        SELECT table_name, table_type 
        FROM information_schema.tables 
        WHERE table_schema = ${pgl(schema)} 
        ORDER BY table_name;
      `);

      for (const item of items) {
        const typeVal = String(item.table_type || item.TABLE_TYPE || "");
        const isTable = typeVal === "BASE TABLE";
        const tname = String(item.table_name || item.TABLE_NAME || "");
        if (!tname) continue;

        // Columns & PKs
        const colsRes = await this.sql_conn.unsafe(`
          SELECT 
            c.column_name, 
            c.data_type, 
            c.udt_name, 
            c.is_nullable, 
            c.column_default, 
            c.ordinal_position,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT ccu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu 
              ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
            WHERE tc.table_schema = ${pgl(schema)} AND tc.table_name = ${pgl(tname)} AND tc.constraint_type = 'PRIMARY KEY'
          ) pk ON pk.column_name = c.column_name
          WHERE c.table_schema = ${pgl(schema)} AND c.table_name = ${pgl(tname)}
          ORDER BY c.ordinal_position;
        `);

        const columns: TableColumnMeta[] = colsRes.map((c: any, i: number) => ({
          cid: i,
          name: c.column_name,
          type: c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type,
          udt_name: c.udt_name,
          notnull: c.is_nullable === "NO",
          dflt_value: c.column_default,
          pk: Boolean(c.is_pk),
        }));

        // Indices
        const idxRes = await this.sql_conn.unsafe(`
          SELECT indexname, indexdef 
          FROM pg_indexes 
          WHERE schemaname = ${pgl(schema)} AND tablename = ${pgl(tname)};
        `);
        const indices = idxRes.map((idx: any) => {
          const iname = idx.indexname;
          const idef = idx.indexdef || "";
          const isUnique = idef.includes("UNIQUE");
          return {
            name: iname,
            unique: isUnique,
            columns: [],
            indexDef: idef,
          };
        });
        totalIndices += indices.length;

        // Foreign keys
        const fkRes = await this.sql_conn.unsafe(`
          SELECT 
            tc.constraint_name, 
            kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
          FROM information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu 
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu 
            ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = ${pgl(schema)} AND tc.table_name = ${pgl(tname)};
        `);
        const foreignKeys = fkRes.map((fk: any, i: number) => ({
          id: i,
          seq: 0,
          table: fk.foreign_table_name,
          from: fk.column_name,
          to: fk.foreign_column_name,
        }));

        // Estimate row count
        let rowCount = 0;
        try {
          const cntRes = await this.sql_conn.unsafe(`
            SELECT COALESCE(reltuples::bigint, 0) as rc 
            FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE n.nspname = ${pgl(schema)} AND c.relname = ${pgl(tname)};
          `);
          rowCount = Math.max(0, Number(cntRes?.[0]?.rc || 0));
        } catch {}

        if (rowCount <= 0 && isTable) {
          try {
            const exactRes = await this.sql_conn.unsafe(`SELECT count(*) as rc FROM ${pgq(schema)}.${pgq(tname)};`);
            rowCount = Number(exactRes?.[0]?.rc || 0);
          } catch {}
        }

        totalRows += rowCount;

        const meta: TableSchemaMeta = {
          name: tname,
          schema,
          type: isTable ? "table" : "view",
          sql: "",
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

      // 2. Materialized Views (PostgreSQL Specialty!)
      const matviews = await this.sql_conn.unsafe(`
        SELECT matviewname, definition, hasindexes 
        FROM pg_matviews 
        WHERE schemaname = ${pgl(schema)} 
        ORDER BY matviewname;
      `);

      for (const mv of matviews) {
        const mvName = mv.matviewname;
        const colsRes = await this.sql_conn.unsafe(`
          SELECT a.attname as column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type, a.attnotnull as notnull
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = ${pgl(schema)} AND c.relname = ${pgl(mvName)} AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY a.attnum;
        `);

        const columns: TableColumnMeta[] = colsRes.map((c: any, i: number) => ({
          cid: i,
          name: c.column_name,
          type: c.data_type,
          notnull: Boolean(c.notnull),
          dflt_value: null,
          pk: false,
        }));

        matviewsMeta.push({
          name: mvName,
          schema,
          type: "materialized_view",
          sql: mv.definition || "",
          rowCount: 0,
          columns,
          indices: [],
          foreignKeys: [],
        });
      }

      return {
        success: true,
        name: schema,
        tables: tablesMeta,
        views: viewsMeta,
        matviews: matviewsMeta,
        schemas,
        activeSchema: schema,
        indicesCount: totalIndices,
        totalRows,
      };
    } catch (err: any) {
      console.error("Postgres getSchema failed:", err);
      return {
        success: false,
        name: schema,
        tables: [],
        views: [],
        matviews: [],
        schemas: ["public"],
        activeSchema: schema,
        indicesCount: 0,
        totalRows: 0,
      };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // PostgreSQL Extensions Ecosystem (Specialty Feature)
  // -----------------------------------------------------------------------------------------------

  public async getExtensions(): Promise<PostgresExtensionMeta[]> {
    try {
      const rows = await this.sql_conn.unsafe(`
        SELECT name, default_version, installed_version, comment
        FROM pg_available_extensions
        ORDER BY (installed_version IS NOT NULL) DESC, name ASC;
      `);
      return rows.map((r: any) => ({
        name: r.name,
        defaultVersion: r.default_version || "",
        installedVersion: r.installed_version || null,
        comment: r.comment || "",
        isInstalled: Boolean(r.installed_version),
      }));
    } catch {
      return [];
    }
  }

  public async toggleExtension(extName: string, enable: boolean): Promise<{ success: boolean; error?: string }> {
    const clean = (extName || "").trim();
    if (!clean) return { success: false, error: "Extension name cannot be empty" };
    if (!/^[a-zA-Z0-9_$-]+$/.test(clean)) return { success: false, error: "Invalid extension name" };

    try {
      if (enable) {
        await this.sql_conn.unsafe(`CREATE EXTENSION IF NOT EXISTS ${pgq(clean)};`);
        await this.logAudit("EXTENSION", clean, `Installed extension: ${clean}`);
      } else {
        await this.sql_conn.unsafe(`DROP EXTENSION IF EXISTS ${pgq(clean)} CASCADE;`);
        await this.logAudit("EXTENSION", clean, `Dropped extension: ${clean}`);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Live Activity & Process Diagnostics (Specialty Feature)
  // -----------------------------------------------------------------------------------------------

  public async getActivity(): Promise<PostgresActivityMeta[]> {
    try {
      const rows = await this.sql_conn.unsafe(`
        SELECT 
          pid,
          COALESCE(usename, '') as usename,
          COALESCE(datname, '') as datname,
          COALESCE(client_addr::text, 'local') as client_addr,
          COALESCE(state, 'unknown') as state,
          COALESCE(wait_event_type, '') as wait_event_type,
          COALESCE(wait_event, '') as wait_event,
          COALESCE(to_char(now() - query_start, 'HH24:MI:SS.MS'), '00:00:00') as duration,
          COALESCE(query, '') as query
        FROM pg_stat_activity
        WHERE datname = current_database()
        ORDER BY query_start DESC NULLS LAST
        LIMIT 50;
      `);
      return rows.map((r: any) => ({
        pid: Number(r.pid),
        usename: String(r.usename),
        datname: String(r.datname),
        client_addr: String(r.client_addr),
        state: String(r.state),
        wait_event_type: String(r.wait_event_type),
        wait_event: String(r.wait_event),
        duration: String(r.duration),
        query: String(r.query),
      }));
    } catch {
      return [];
    }
  }

  public async getBlockedLocks(): Promise<PostgresBlockedLockMeta[]> {
    try {
      const rows = await this.sql_conn.unsafe(`
        SELECT
          blocked_locks.pid AS blocked_pid,
          COALESCE(blocked_activity.usename, '') AS blocked_user,
          blocking_locks.pid AS blocking_pid,
          COALESCE(blocking_activity.usename, '') AS blocking_user,
          COALESCE(blocked_activity.query, '') AS blocked_query,
          COALESCE(blocking_activity.query, '') AS blocking_query
        FROM pg_catalog.pg_locks blocked_locks
        JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
        JOIN pg_catalog.pg_locks blocking_locks 
            ON blocking_locks.locktype = blocked_locks.locktype
            AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
            AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
            AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
            AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
            AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
            AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
            AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
            AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
            AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
            AND blocking_locks.pid != blocked_locks.pid
        JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
        WHERE NOT blocked_locks.granted;
      `);
      return rows.map((r: any) => ({
        blockedPid: Number(r.blocked_pid),
        blockedUser: String(r.blocked_user),
        blockingPid: Number(r.blocking_pid),
        blockingUser: String(r.blocking_user),
        blockedQuery: String(r.blocked_query),
        blockingQuery: String(r.blocking_query),
      }));
    } catch {
      return [];
    }
  }

  public async terminateBackend(pid: number): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.sql_conn.unsafe(`SELECT pg_terminate_backend(${Number(pid)}) as ok;`);
      return { success: Boolean(res?.[0]?.ok) };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async cancelBackend(pid: number): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.sql_conn.unsafe(`SELECT pg_cancel_backend(${Number(pid)}) as ok;`);
      return { success: Boolean(res?.[0]?.ok) };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Materialized Views & Maintenance (Specialty Features)
  // -----------------------------------------------------------------------------------------------

  public async refreshMaterializedView(matviewName: string, concurrently: boolean = false): Promise<{ success: boolean; error?: string }> {
    const clean = (matviewName || "").trim();
    if (!clean) return { success: false, error: "Materialized view name cannot be empty" };
    try {
      const sql = concurrently
        ? `REFRESH MATERIALIZED VIEW CONCURRENTLY ${pgq(this.activeSchema)}.${pgq(clean)};`
        : `REFRESH MATERIALIZED VIEW ${pgq(this.activeSchema)}.${pgq(clean)};`;
      await this.sql_conn.unsafe(sql);
      await this.logAudit("MATVIEW", clean, `Refreshed materialized view: ${clean}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async vacuum(full: boolean = false, analyze: boolean = true, table?: string, schema?: string): Promise<{ success: boolean; details: string; error?: string }> {
    try {
      const target = table ? `${pgq(schema || this.activeSchema)}.${pgq(table)}` : "";
      const cmd = `VACUUM ${full ? "FULL " : ""}${analyze ? "ANALYZE " : ""}${target};`.trim();
      await this.sql_conn.unsafe(cmd);
      await this.logAudit("VACUUM", this.activePath, `Executed ${cmd}`);
      return { success: true, details: `Executed ${cmd} successfully.` };
    } catch (err: any) {
      return { success: false, details: "", error: err?.message || String(err) };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Query Execution & EXPLAIN ANALYZE
  // -----------------------------------------------------------------------------------------------

  // Macro Designer adapter (shared engine in studio_macros_server.ts)
  private static async runMacroSql(conn: any, sqlText: string): Promise<MacroQueryResult> {
    try {
      const res = await conn.unsafe(sqlText);
      const rows: any[] = Array.isArray(res) ? Array.from(res) : [];
      const columns = rows.length > 0 && typeof rows[0] === "object" ? Object.keys(rows[0]) : [];
      const isSelect = res?.command === "SELECT" || res?.command === "SHOW";
      return {
        success: true,
        rows,
        columns,
        rowCount: rows.length,
        rowsAffected: !isSelect && typeof res?.count === "number" ? res.count : undefined,
      };
    } catch (err: any) {
      return { success: false, rows: [], columns: [], rowCount: 0, error: err?.message || String(err) };
    }
  }

  public getMacroAdapter(): MacroAdapter {
    return {
      dialect: "postgres",
      connectionKey: () => `${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.database}/${this.activeSchema}`,
      query: (sqlText) => PostgresManager.runMacroSql(this.sql_conn, sqlText),
      beginTransaction: async () => {
        const c = await this.sql_conn.reserve();
        try {
          await c.unsafe(`SET search_path TO ${pgq(this.activeSchema)}, public`);
          await c.unsafe("BEGIN");
        } catch (err) {
          try { c.release(); } catch {}
          throw err;
        }
        let finished = false;
        const finish = async (verb: "COMMIT" | "ROLLBACK") => {
          if (finished) return;
          finished = true;
          try { await c.unsafe(verb); } finally { try { c.release(); } catch {} }
        };
        return {
          query: (sqlText: string) => PostgresManager.runMacroSql(c, sqlText),
          commit: () => finish("COMMIT"),
          rollback: () => finish("ROLLBACK"),
        };
      },
      maintenance: async (analyze) => {
        const res = await this.vacuum(false, analyze);
        if (!res.success) throw new Error(res.error || "VACUUM failed");
        return res.details || `Executed VACUUM${analyze ? " ANALYZE" : ""}`;
      },
      backup: async (mode) => {
        const dump = await this.generateDatabaseDump({ mode: mode === "full" ? "all" : (mode as "all" | "schema" | "data") });
        return `SQL dump generated (${mode}, ${dump.length} characters)`;
      },
      listTables: async () => {
        const rows = await this.sql_conn.unsafe(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
          [this.activeSchema],
        );
        return Array.from(rows as any[]).map((r) => String(r.table_name));
      },
    };
  }

  public async query(sqlText: string, params: any[] = []): Promise<{
    success: boolean;
    columns: string[];
    rows: any[];
    rowCount: number;
    executionTimeMs: number;
    error?: string;
  }> {
    const start = performance.now();
    try {
      let resultRows = await this.sql_conn.unsafe(sqlText, params);
      const executionTimeMs = Math.round((performance.now() - start) * 100) / 100;

      let rows: any[] = [];
      let columns: string[] = [];

      if (Array.isArray(resultRows)) {
        rows = resultRows;
        if (rows.length > 0 && typeof rows[0] === "object") {
          columns = Object.keys(rows[0]);
        }
      }

      await this.logAudit("QUERY", "SQL", sqlText.slice(0, 160));

      return {
        success: true,
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs,
      };
    } catch (err: any) {
      const executionTimeMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        success: false,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs,
        error: err?.message || String(err),
      };
    }
  }

  public async explain(sqlStr: string): Promise<{
    success: boolean;
    queryPlan?: {
      id: number;
      parent: number;
      detail: string;
      isScan: boolean;
      isIndex: boolean;
      cost?: string;
      rows?: string;
      actualTime?: string;
      buffers?: string;
    }[];
    rawPlan?: any;
    rawText?: string;
    latencyMs?: number;
    error?: string;
  }> {
    const trimmed = (sqlStr || "").trim();
    if (!trimmed) return { success: false, error: "SQL statement is required for explain" };

    const t0 = performance.now();
    try {
      const cleanSql = trimmed
        .replace(/^EXPLAIN\s*(\([^)]*\))?\s*/i, "")
        .replace(/;+$/, "")
        .trim();
      if (!cleanSql) return { success: false, error: "SQL statement is required for explain" };

      let rawPlan: any = null;
      try {
        const jsonRes = await this.sql_conn.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${cleanSql};`);
        const planJson = jsonRes?.[0]?.["QUERY PLAN"] || jsonRes?.[0]?.[Object.keys(jsonRes[0])[0]];
        rawPlan = typeof planJson === "string" ? JSON.parse(planJson) : planJson;
      } catch (errJson) {
        // Fallback without ANALYZE (e.g., if query fails in analyze mode or write statement)
        const jsonRes2 = await this.sql_conn.unsafe(`EXPLAIN (FORMAT JSON) ${cleanSql};`);
        const planJson2 = jsonRes2?.[0]?.["QUERY PLAN"] || jsonRes2?.[0]?.[Object.keys(jsonRes2[0])[0]];
        rawPlan = typeof planJson2 === "string" ? JSON.parse(planJson2) : planJson2;
      }

      let rawTextLines = "";
      try {
        const textRes = await this.sql_conn.unsafe(`EXPLAIN (ANALYZE, BUFFERS) ${cleanSql};`);
        rawTextLines = (textRes || []).map((r: any) => Object.values(r)[0]).join("\n");
      } catch {
        const textRes2 = await this.sql_conn.unsafe(`EXPLAIN ${cleanSql};`);
        rawTextLines = (textRes2 || []).map((r: any) => Object.values(r)[0]).join("\n");
      }

      const latencyMs = Number((performance.now() - t0).toFixed(2));

      // Build structured node tree for visual explain visualizer
      const queryPlan: {
        id: number;
        parent: number;
        detail: string;
        isScan: boolean;
        isIndex: boolean;
        cost?: string;
        rows?: string;
        actualTime?: string;
        buffers?: string;
      }[] = [];

      let nodeIdCounter = 1;
      function traverseNode(node: any, parentId: number) {
        if (!node) return;
        const currentId = nodeIdCounter++;
        const nodeType = node["Node Type"] || "Plan Node";
        const relation = node["Relation Name"] || "";
        const alias = node["Alias"] || "";
        const indexName = node["Index Name"] || "";

        const isScan = /Seq\s*Scan/i.test(nodeType);
        const isIndex = /Index/i.test(nodeType);

        let detail = nodeType;
        if (relation) detail += ` on ${pgq(relation)}`;
        if (alias && alias !== relation) detail += ` (as ${pgq(alias)})`;
        if (indexName) detail += ` using ${pgq(indexName)}`;

        const startupCost = node["Startup Cost"] ?? 0;
        const totalCost = node["Total Cost"] ?? 0;
        const planRows = node["Plan Rows"] ?? 0;
        const actualRows = node["Actual Rows"] ?? null;
        const actualTime = node["Actual Total Time"] ?? null;
        const sharedHitBlocks = node["Shared Hit Blocks"] ?? null;

        detail += ` | Cost: ${startupCost}..${totalCost} | Est. Rows: ${planRows}`;
        if (actualRows !== null) detail += ` | Actual Rows: ${actualRows}`;
        if (actualTime !== null) detail += ` (${actualTime}ms)`;
        if (sharedHitBlocks !== null) detail += ` | Buffers: ${sharedHitBlocks} hit`;

        queryPlan.push({
          id: currentId,
          parent: parentId,
          detail,
          isScan,
          isIndex,
          cost: `${startupCost}..${totalCost}`,
          rows: actualRows !== null ? `${actualRows} (est: ${planRows})` : `${planRows}`,
          actualTime: actualTime !== null ? `${actualTime}ms` : undefined,
          buffers: sharedHitBlocks !== null ? `${sharedHitBlocks} hits` : undefined,
        });

        if (Array.isArray(node["Plans"])) {
          node["Plans"].forEach((subNode: any) => traverseNode(subNode, currentId));
        }
      }

      const rootPlan = Array.isArray(rawPlan) && rawPlan[0] && rawPlan[0]["Plan"] ? rawPlan[0]["Plan"] : rawPlan;
      if (rootPlan) {
        traverseNode(rootPlan, 0);
      }

      // If for any reason JSON plan traversal produced no nodes, build from text lines
      if (queryPlan.length === 0 && rawTextLines) {
        const lines = rawTextLines.split("\n").filter(l => l.trim());
        lines.forEach((line, idx) => {
          const isScan = /Seq\s*Scan/i.test(line);
          const isIndex = /Index\s*Scan/i.test(line);
          queryPlan.push({
            id: idx + 1,
            parent: idx === 0 ? 0 : 1,
            detail: line.trim(),
            isScan,
            isIndex,
          });
        });
      }

      return {
        success: true,
        queryPlan,
        rawPlan,
        rawText: rawTextLines,
        latencyMs,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
      };
    }
  }

  public async explainQuery(sqlText: string, analyze: boolean = true): Promise<{
    success: boolean;
    plan: any;
    rawText: string;
    executionTimeMs: number;
    error?: string;
  }> {
    const res = await this.explain(sqlText);
    return {
      success: res.success,
      plan: res.rawPlan,
      rawText: res.rawText || (res.error || ""),
      executionTimeMs: res.latencyMs || 0,
      error: res.error,
    };
  }

  // -----------------------------------------------------------------------------------------------
  // Table Data & CRUD API
  // -----------------------------------------------------------------------------------------------

  public async getTableData(
    tableName: string,
    page: number = 1,
    pageSize: number = 25,
    orderBy?: string,
    orderDir: string = "ASC",
    search?: string,
    schemaName?: string
  ): Promise<{
    success: boolean;
    columns: string[];
    rows: any[];
    totalRows: number;
    page: number;
    pageSize: number;
    totalPages: number;
    error?: string;
  }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const offset = (page - 1) * pageSize;
      const safeDir = orderDir.toUpperCase() === "DESC" ? "DESC" : "ASC";
      let countSql = `SELECT count(*) as c FROM ${pgq(schema)}.${pgq(tableName)}`;
      let dataSql = `SELECT * FROM ${pgq(schema)}.${pgq(tableName)}`;

      const params: any[] = [];
      if (search && search.trim()) {
        const schemaMeta = await this.getSchema(schema);
        const allItems = [...schemaMeta.tables, ...schemaMeta.views, ...schemaMeta.matviews];
        const tbl = allItems.find((t) => t.name === tableName);
        if (tbl && tbl.columns.length > 0) {
          const filterClauses = tbl.columns.map((c) => `CAST(${pgq(c.name)} AS TEXT) ILIKE $1`).join(" OR ");
          countSql += ` WHERE ${filterClauses}`;
          dataSql += ` WHERE ${filterClauses}`;
          params.push(`%${search.trim()}%`);
        }
      }

      if (orderBy) {
        dataSql += ` ORDER BY ${pgq(orderBy)} ${safeDir}`;
      }
      dataSql += ` LIMIT ${Number(pageSize)} OFFSET ${Number(offset)};`;

      const countRes = await this.sql_conn.unsafe(countSql, params);
      const totalRows = Number(countRes[0]?.c || countRes[0]?.count || 0);

      const rows = await this.sql_conn.unsafe(dataSql, params);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        success: true,
        columns,
        rows,
        totalRows,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
      };
    } catch (err: any) {
      return {
        success: false,
        columns: [],
        rows: [],
        totalRows: 0,
        page,
        pageSize,
        totalPages: 1,
        error: err.message,
      };
    }
  }

  public async insertRow(tableName: string, rowData: Record<string, any>, schemaName?: string): Promise<{ success: boolean; insertedId?: any; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const keys = Object.keys(rowData);
      if (keys.length === 0) throw new Error("No column data provided");

      let colTypeMap = new Map<string, string>();
      try {
        const schemaMeta = await this.getSchema(schema);
        const allItems = [...schemaMeta.tables, ...schemaMeta.views];
        const tbl = allItems.find((t) => t.name === tableName);
        if (tbl && tbl.columns) {
          colTypeMap = new Map(tbl.columns.map((c) => [c.name, (c.type || "").toUpperCase()]));
        }
      } catch {}

      const cols = keys.map((k) => `${pgq(k)}`).join(", ");
      const placeholders = keys.map((k, i) => {
        const type = colTypeMap.get(k) || "";
        if (type.includes("JSON")) return `$${i + 1}::jsonb`;
        return `$${i + 1}`;
      }).join(", ");

      const values = keys.map((k) => {
        const val = rowData[k];
        if (typeof val === "object" && val !== null) {
          return JSON.stringify(val);
        }
        return val;
      });

      const sql = `INSERT INTO ${pgq(schema)}.${pgq(tableName)} (${cols}) VALUES (${placeholders}) RETURNING *;`;
      const res = await this.sql_conn.unsafe(sql, values);

      await this.logAudit("INSERT", tableName, JSON.stringify(rowData).slice(0, 150));
      return { success: true, insertedId: res?.[0] };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async updateRow(
    tableName: string,
    pkCol: string,
    pkVal: any,
    rowData: Record<string, any>,
    schemaName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const keys = Object.keys(rowData);
      if (keys.length === 0) throw new Error("No column data to update");

      let colTypeMap = new Map<string, string>();
      try {
        const schemaMeta = await this.getSchema(schema);
        const allItems = [...schemaMeta.tables, ...schemaMeta.views];
        const tbl = allItems.find((t) => t.name === tableName);
        if (tbl && tbl.columns) {
          colTypeMap = new Map(tbl.columns.map((c) => [c.name, (c.type || "").toUpperCase()]));
        }
      } catch {}

      const sets = keys.map((k, i) => {
        const type = colTypeMap.get(k) || "";
        if (type.includes("JSON")) return `${pgq(k)} = $${i + 1}::jsonb`;
        return `${pgq(k)} = $${i + 1}`;
      }).join(", ");

      const values = keys.map((k) => {
        const val = rowData[k];
        if (typeof val === "object" && val !== null) {
          return JSON.stringify(val);
        }
        return val;
      });
      values.push(pkVal);

      const sql = `UPDATE ${pgq(schema)}.${pgq(tableName)} SET ${sets} WHERE ${pgq(pkCol)} = $${values.length};`;
      await this.sql_conn.unsafe(sql, values);

      await this.logAudit("UPDATE", tableName, `PK=${pkVal}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async deleteRow(tableName: string, pkCol: string, pkVal: any, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const sql = `DELETE FROM ${pgq(schema)}.${pgq(tableName)} WHERE ${pgq(pkCol)} = $1;`;
      await this.sql_conn.unsafe(sql, [pkVal]);

      await this.logAudit("DELETE", tableName, `PK=${pkVal}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async createTable(
    tableName: string,
    columns: { name: string; type: string; notnull?: boolean; pk?: boolean; dflt_value?: any }[],
    schemaName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      if (!tableName || columns.length === 0) throw new Error("Table name and columns required");

      const colDefs = columns.map((c) => {
        assertSafeSqlFragment("column type", c.type);
        if (c.dflt_value !== undefined && c.dflt_value !== null) assertSafeSqlFragment("default expression", String(c.dflt_value));
        let def = `${pgq(c.name)} ${c.type}`;
        if (c.pk) def += " PRIMARY KEY";
        if (c.notnull) def += " NOT NULL";
        if (c.dflt_value !== undefined && c.dflt_value !== null && c.dflt_value !== "") {
          def += ` DEFAULT ${c.dflt_value}`;
        }
        return def;
      });

      const sql = `CREATE TABLE ${pgq(schema)}.${pgq(tableName)} (\n  ${colDefs.join(",\n  ")}\n);`;
      await this.sql_conn.unsafe(sql);

      await this.logAudit("CREATE_TABLE", tableName, `Created table with ${columns.length} columns`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async redesignTable(
    oldTable: string,
    newTable: string,
    columns: { name: string; type: string; notnull?: boolean; pk?: boolean; dflt_value?: any }[],
    schemaName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    const tmpName = `_tmp_redesign_${Date.now()}`;
    let tmpCreated = false;
    try {
      const targetName = newTable || oldTable;
      const created = await this.createTable(tmpName, columns, schema);
      if (!created.success) return created;
      tmpCreated = true;

      try {
        const oldColsRes = await this.sql_conn.unsafe(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
          [schema, oldTable],
        );
        const oldCols = new Set(oldColsRes.map((r: any) => r.column_name));
        const sharedCols = columns.filter((c) => oldCols.has(c.name)).map((c) => `${pgq(c.name)}`);

        if (sharedCols.length > 0) {
          const colList = sharedCols.join(", ");
          await this.sql_conn.unsafe(`INSERT INTO ${pgq(schema)}.${pgq(tmpName)} (${colList}) SELECT ${colList} FROM ${pgq(schema)}.${pgq(oldTable)};`);
        }
      } catch (err: any) {
        // Never drop the original table when its data could not be copied.
        await this.sql_conn.unsafe(`DROP TABLE IF EXISTS ${pgq(schema)}.${pgq(tmpName)};`).catch(() => {});
        return { success: false, error: `Data could not be copied to the new structure; the original table was left unchanged. ${err.message}` };
      }

      // PostgreSQL DDL is transactional: swap the tables atomically.
      await this.sql_conn.begin(async (tx: any) => {
        await tx.unsafe(`DROP TABLE ${pgq(schema)}.${pgq(oldTable)} CASCADE;`);
        await tx.unsafe(`ALTER TABLE ${pgq(schema)}.${pgq(tmpName)} RENAME TO ${pgq(targetName)};`);
      });

      await this.logAudit("REDESIGN_TABLE", targetName, `Redesigned table structure`);
      return { success: true };
    } catch (err: any) {
      if (tmpCreated) await this.sql_conn.unsafe(`DROP TABLE IF EXISTS ${pgq(schema)}.${pgq(tmpName)};`).catch(() => {});
      return { success: false, error: err.message };
    }
  }

  public async renameTable(oldTable: string, newTable: string, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      await this.sql_conn.unsafe(`ALTER TABLE ${pgq(schema)}.${pgq(oldTable)} RENAME TO ${pgq(newTable)};`);
      await this.logAudit("RENAME_TABLE", newTable, `Renamed from ${oldTable}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async dropObject(kind: "table" | "view" | "matview", name: string, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      let sql = "";
      if (kind === "matview") {
        sql = `DROP MATERIALIZED VIEW IF EXISTS ${pgq(schema)}.${pgq(name)} CASCADE;`;
      } else if (kind === "view") {
        sql = `DROP VIEW IF EXISTS ${pgq(schema)}.${pgq(name)} CASCADE;`;
      } else {
        sql = `DROP TABLE IF EXISTS ${pgq(schema)}.${pgq(name)} CASCADE;`;
      }
      await this.sql_conn.unsafe(sql);
      await this.logAudit("DROP", name, `Dropped ${kind}: ${name}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async addColumn(
    tableName: string,
    column: { name: string; type: string; notnull?: boolean; dflt_value?: any },
    schemaName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      if (!tableName || !column?.name) throw new Error("Table name and column name required");
      assertSafeSqlFragment("column type", column.type || "");
      if (column.dflt_value !== undefined && column.dflt_value !== null) assertSafeSqlFragment("default expression", String(column.dflt_value));
      let def = `${pgq(column.name)} ${column.type || "text"}`;
      if (column.notnull) def += " NOT NULL";
      if (column.dflt_value !== undefined && column.dflt_value !== null && column.dflt_value !== "") {
        def += ` DEFAULT ${column.dflt_value}`;
      }
      const sql = `ALTER TABLE ${pgq(schema)}.${pgq(tableName)} ADD COLUMN ${def};`;
      await this.sql_conn.unsafe(sql);
      await this.logAudit("ADD_COLUMN", tableName, `Added column ${pgq(column.name)} (${column.type})`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async dropColumn(
    tableName: string,
    columnName: string,
    cascade: boolean = false,
    schemaName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      if (!tableName || !columnName) throw new Error("Table name and column name required");
      const sql = `ALTER TABLE ${pgq(schema)}.${pgq(tableName)} DROP COLUMN ${pgq(columnName)}${cascade ? " CASCADE" : ""};`;
      await this.sql_conn.unsafe(sql);
      await this.logAudit("DROP_COLUMN", tableName, `Dropped column ${pgq(columnName)}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // PostgreSQL Custom ENUM Types Management
  public async getEnumTypes(schemaName?: string): Promise<PostgresEnumMeta[]> {
    const s = schemaName || this.activeSchema;
    try {
      const rows = await this.sql_conn.unsafe(`
        SELECT 
          t.typname AS name,
          n.nspname AS schema,
          array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1
        GROUP BY t.typname, n.nspname
        ORDER BY t.typname;
      `, [s]);

      return (rows || []).map((r: any) => ({
        name: r.name,
        schema: r.schema,
        values: Array.isArray(r.values) ? r.values : [],
      }));
    } catch (err: any) {
      console.warn("getEnumTypes error:", err.message);
      return [];
    }
  }

  public async createEnumType(name: string, values: string[], schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const s = schemaName || this.activeSchema;
    try {
      if (!name) throw new Error("Enum type name required");
      if (!values || values.length === 0) throw new Error("At least one enum value required");
      const escapedVals = values.map(v => `'${v.replace(/'/g, "''")}'`).join(", ");
      await this.sql_conn.unsafe(`CREATE TYPE ${pgq(s)}.${pgq(name)} AS ENUM (${escapedVals});`);
      await this.logAudit("CREATE_TYPE", name, `Values: ${values.join(", ")}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async addEnumValue(name: string, value: string, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const s = schemaName || this.activeSchema;
    try {
      if (!name || !value) throw new Error("Enum name and new value required");
      await this.sql_conn.unsafe(`ALTER TYPE ${pgq(s)}.${pgq(name)} ADD VALUE '${value.replace(/'/g, "''")}';`);
      await this.logAudit("ALTER_TYPE", name, `Added value: ${value}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async dropEnumType(name: string, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const s = schemaName || this.activeSchema;
    try {
      if (!name) throw new Error("Enum type name required");
      await this.sql_conn.unsafe(`DROP TYPE ${pgq(s)}.${pgq(name)} CASCADE;`);
      await this.logAudit("DROP_TYPE", name, `Dropped ENUM type ${name}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // PostgreSQL Partitioned Tables Inspection
  public async getPartitionedTables(schemaName?: string): Promise<PostgresPartitionMeta[]> {
    const s = schemaName || this.activeSchema;
    try {
      const rows = await this.sql_conn.unsafe(`
        SELECT 
          pt.relname AS parent_table,
          pn.nspname AS parent_schema,
          CASE p.partstrat
            WHEN 'r' THEN 'RANGE'
            WHEN 'l' THEN 'LIST'
            WHEN 'h' THEN 'HASH'
            ELSE p.partstrat::text
          END AS partition_strategy,
          c.relname AS partition_name,
          COALESCE(pg_get_expr(c.relpartbound, c.oid), 'DEFAULT') AS partition_expression,
          pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
          COALESCE(c.reltuples::bigint, 0) AS row_estimate
        FROM pg_partitioned_table p
        JOIN pg_class pt ON pt.oid = p.partrelid
        JOIN pg_namespace pn ON pn.oid = pt.relnamespace
        JOIN pg_inherits i ON i.inhparent = p.partrelid
        JOIN pg_class c ON c.oid = i.inhrelid
        WHERE pn.nspname = $1
        ORDER BY pt.relname, c.relname;
      `, [s]);

      return (rows || []).map((r: any) => ({
        parentTable: r.parent_table,
        parentSchema: r.parent_schema,
        partitionStrategy: r.partition_strategy,
        partitionName: r.partition_name,
        partitionExpression: r.partition_expression,
        totalSize: r.total_size,
        rowEstimate: Number(r.row_estimate || 0),
      }));
    } catch (err: any) {
      console.warn("getPartitionedTables error:", err.message);
      return [];
    }
  }

  // PostgreSQL Streaming Replication & WAL Status
  public async getReplicationStatus(): Promise<PostgresReplicationMeta> {
    const result: PostgresReplicationMeta = {
      standbys: [],
      slots: [],
      walStats: {},
    };

    try {
      const standbys = await this.sql_conn.unsafe(`
        SELECT 
          pid, client_addr::text, application_name, state, sync_state,
          write_lag::text, flush_lag::text, replay_lag::text
        FROM pg_stat_replication;
      `);
      result.standbys = (standbys || []).map((s: any) => ({
        pid: s.pid,
        clientAddr: s.client_addr || "local",
        applicationName: s.application_name || "unknown",
        state: s.state || "active",
        syncState: s.sync_state || "async",
        writeLag: s.write_lag || "00:00:00",
        flushLag: s.flush_lag || "00:00:00",
        replayLag: s.replay_lag || "00:00:00",
      }));
    } catch { /* ignored */ }

    try {
      const slots = await this.sql_conn.unsafe(`
        SELECT slot_name, plugin, slot_type, active, COALESCE(wal_status, 'normal') as wal_status
        FROM pg_replication_slots;
      `);
      result.slots = (slots || []).map((sl: any) => ({
        slotName: sl.slot_name,
        plugin: sl.plugin || "n/a",
        slotType: sl.slot_type,
        active: Boolean(sl.active),
        walStatus: sl.wal_status,
      }));
    } catch { /* ignored */ }

    try {
      const wal = await this.sql_conn.unsafe(`
        SELECT wal_records, wal_fpi, wal_bytes, wal_buffers_full, wal_write, wal_sync
        FROM pg_stat_wal;
      `);
      if (wal && wal.length > 0) {
        result.walStats = wal[0];
      }
    } catch { /* ignored */ }

    return result;
  }

  // Full Database SQL Dump & Backup Generator
  public async generateDatabaseDump(options: { mode?: "all" | "schema" | "data"; tables?: string[]; schema?: string } = {}): Promise<string> {
    const s = options.schema || this.activeSchema;
    const mode = options.mode || "all";
    const out: string[] = [];
    out.push(`-- =========================================================================`);
    out.push(`-- 🐘 POSTGRES STUDIO PRO - ENTERPRISE DATABASE DUMP & RECOVERY SCRIPT`);
    out.push(`-- Generated: ${new Date().toISOString()}`);
    out.push(`-- Schema: ${pgq(s)} | Mode: ${mode.toUpperCase()}`);
    out.push(`-- Database: ${this.activeDb}`);
    out.push(`-- =========================================================================\n`);

    out.push(`SET statement_timeout = 0;`);
    out.push(`SET lock_timeout = 0;`);
    out.push(`SET client_encoding = 'UTF8';`);
    out.push(`SET standard_conforming_strings = on;`);
    out.push(`SET check_function_bodies = false;`);
    out.push(`SET client_min_messages = warning;\n`);

    const schemaRes = await this.getSchema(s);
    const tableNames = options.tables && options.tables.length > 0
      ? options.tables
      : schemaRes.tables.map(t => t.name);

    // 1. Custom Enums
    if (mode === "all" || mode === "schema") {
      const enums = await this.getEnumTypes(s);
      if (enums.length > 0) {
        out.push(`-- Custom Enum Types`);
        for (const e of enums) {
          const vals = e.values.map(v => `'${v.replace(/'/g, "''")}'`).join(", ");
          out.push(`DO $$ BEGIN CREATE TYPE ${pgq(s)}.${pgq(e.name)} AS ENUM (${vals}); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
        }
        out.push("");
      }
    }

    // 2. Tables and Columns
    for (const tblMeta of schemaRes.tables) {
      if (!tableNames.includes(tblMeta.name)) continue;
      const tName = tblMeta.name;

      if (mode === "all" || mode === "schema") {
        out.push(`-- Table: ${pgq(s)}.${pgq(tName)}`);
        out.push(`CREATE TABLE IF NOT EXISTS ${pgq(s)}.${pgq(tName)} (`);
        const colDefs: string[] = [];
        for (const col of tblMeta.columns) {
          let line = `  ${pgq(col.name)} ${col.type}`;
          if (col.notnull) line += ` NOT NULL`;
          if (col.dflt_value !== null && col.dflt_value !== undefined && col.dflt_value !== "") {
            line += ` DEFAULT ${col.dflt_value}`;
          }
          if (col.pk) {
            line += ` PRIMARY KEY`;
          }
          colDefs.push(line);
        }
        out.push(colDefs.join(",\n"));
        out.push(`);\n`);

        // Indexes
        if (tblMeta.indices && tblMeta.indices.length > 0) {
          for (const idx of tblMeta.indices) {
            if (idx.name.endsWith("_pkey")) continue;
            const unique = idx.unique ? "UNIQUE " : "";
            out.push(`CREATE ${unique}INDEX IF NOT EXISTS ${pgq(idx.name)} ON ${pgq(s)}.${pgq(tName)} (${idx.columns.map(c => `${pgq(c)}`).join(", ")});`);
          }
          out.push("");
        }
      }

      // 3. Table Data
      if (mode === "all" || mode === "data") {
        try {
          const rows = await this.sql_conn.unsafe(`SELECT * FROM ${pgq(s)}.${pgq(tName)} LIMIT 5000;`);
          if (rows && rows.length > 0) {
            out.push(`-- Data for Table: ${pgq(s)}.${pgq(tName)} (${rows.length} rows)`);
            const colNames = Object.keys(rows[0]);
            const escapedCols = colNames.map(c => `${pgq(c)}`).join(", ");
            out.push(`INSERT INTO ${pgq(s)}.${pgq(tName)} (${escapedCols}) VALUES`);
            const rowValues: string[] = [];
            for (const r of rows) {
              const vals = colNames.map(c => {
                const val = r[c];
                if (val === null || val === undefined) return "NULL";
                if (typeof val === "number" || typeof val === "boolean") return String(val);
                if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
                return `'${String(val).replace(/'/g, "''")}'`;
              });
              rowValues.push(`  (${vals.join(", ")})`);
            }
            out.push(rowValues.join(",\n") + `;`);
            out.push("");
          }
        } catch (err: any) {
          out.push(`-- Error dumping data for ${pgq(tName)}: ${err.message}\n`);
        }
      }
    }

    // 4. Foreign Keys
    if (mode === "all" || mode === "schema") {
      out.push(`-- Foreign Key Constraints`);
      for (const tblMeta of schemaRes.tables) {
        if (!tableNames.includes(tblMeta.name)) continue;
        if (tblMeta.foreignKeys && tblMeta.foreignKeys.length > 0) {
          for (const fk of tblMeta.foreignKeys) {
            if (!tableNames.includes(fk.table)) continue;
            const constraintName = `${tblMeta.name}_${fk.from}_fkey`;
            out.push(`DO $$ BEGIN ALTER TABLE ${pgq(s)}.${pgq(tblMeta.name)} ADD CONSTRAINT ${pgq(constraintName)} FOREIGN KEY (${pgq(fk.from)}) REFERENCES ${pgq(s)}.${pgq(fk.table)} (${pgq(fk.to)}) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`);
          }
        }
      }
      out.push("");
    }

    // 5. Views
    if (mode === "all" || mode === "schema") {
      try {
        const views = await this.sql_conn.unsafe(`
          SELECT table_name, view_definition
          FROM information_schema.views
          WHERE table_schema = $1;
        `, [s]);
        if (views && views.length > 0) {
          out.push(`-- Views`);
          for (const v of views) {
            out.push(`CREATE OR REPLACE VIEW ${pgq(s)}.${pgq(v.table_name)} AS\n${v.view_definition};\n`);
          }
        }
      } catch { /* ignored */ }
    }

    out.push(`-- =========================================================================`);
    out.push(`-- Dump complete.`);
    out.push(`-- =========================================================================`);
    return out.join("\n");
  }

  // Access Totals Row & Aggregates Computer
  public async getTableAggregates(tableName: string, schemaName?: string): Promise<Record<string, any>> {
    const s = schemaName || this.activeSchema;
    try {
      const cols = await this.sql_conn.unsafe(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2;
      `, [s, tableName]);

      const aggSelects: string[] = ["COUNT(*)::bigint AS _total_count"];
      const numericCols: string[] = [];

      for (const c of cols) {
        const type = String(c.data_type).toLowerCase();
        const isNum = type.includes("int") || type.includes("numeric") || type.includes("decimal") || type.includes("float") || type.includes("double") || type.includes("real");
        if (isNum) {
          numericCols.push(c.column_name);
          aggSelects.push(`ROUND(SUM(${pgq(c.column_name)})::numeric, 2) AS "${c.column_name}__sum"`);
          aggSelects.push(`ROUND(AVG(${pgq(c.column_name)})::numeric, 2) AS "${c.column_name}__avg"`);
          aggSelects.push(`MIN(${pgq(c.column_name)}) AS "${c.column_name}__min"`);
          aggSelects.push(`MAX(${pgq(c.column_name)}) AS "${c.column_name}__max"`);
        }
      }

      const q = `SELECT ${aggSelects.join(", ")} FROM ${pgq(s)}.${pgq(tableName)};`;
      const res = await this.sql_conn.unsafe(q);
      const row = res?.[0] || {};
      const totalCount = Number(row._total_count || 0);

      const result: Record<string, any> = { _totalCount: totalCount };
      for (const col of numericCols) {
        result[col] = {
          count: totalCount,
          sum: row[`${col}__sum`] !== null ? Number(row[`${col}__sum`]) : undefined,
          avg: row[`${col}__avg`] !== null ? Number(row[`${col}__avg`]) : undefined,
          min: row[`${col}__min`],
          max: row[`${col}__max`],
        };
      }
      return result;
    } catch (err: any) {
      console.warn("getTableAggregates error:", err.message);
      return { _totalCount: 0 };
    }
  }

  public async truncateTable(tableName: string, cascade: boolean = false, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const sql = `TRUNCATE TABLE ${pgq(schema)}.${pgq(tableName)} ${cascade ? "CASCADE" : "RESTRICT"};`;
      await this.sql_conn.unsafe(sql);
      await this.logAudit("TRUNCATE", tableName, `Truncated table`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async importBatchRows(tableName: string, rows: Record<string, any>[], schemaName?: string): Promise<{ success: boolean; importedCount: number; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      if (!rows || rows.length === 0) return { success: true, importedCount: 0 };
      let imported = 0;
      for (const row of rows) {
        const res = await this.insertRow(tableName, row, schema);
        if (res.success) imported++;
      }
      return { success: true, importedCount: imported };
    } catch (err: any) {
      return { success: false, importedCount: 0, error: err.message };
    }
  }

  public async getIndexes(tableName?: string, schemaName?: string): Promise<any[]> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      let sql = `
        SELECT 
          tablename, 
          indexname, 
          indexdef 
        FROM pg_indexes 
        WHERE schemaname = ${pgl(schema)}
      `;
      if (tableName) {
        sql += ` AND tablename = ${pgl(tableName)}`;
      }
      sql += ` ORDER BY tablename ASC, indexname ASC;`;
      const res = await this.sql_conn.unsafe(sql);
      return (res || []).map((r: any) => ({
        table: r.tablename,
        name: r.indexname,
        definition: r.indexdef,
        unique: String(r.indexdef || "").includes("UNIQUE"),
      }));
    } catch {
      return [];
    }
  }

  public async createIndex(
    indexName: string,
    tableName: string,
    columns: string[],
    indexType: string = "btree",
    unique: boolean = false,
    schemaName?: string
  ): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const safeCols = columns.map(c => `${pgq(c)}`).join(", ");
      const uq = unique ? "UNIQUE " : "";
      const usingClause = indexType && indexType !== "btree" ? `USING ${indexType.toLowerCase()} ` : "";
      const sql = `CREATE ${uq}INDEX IF NOT EXISTS ${pgq(indexName)} ON ${pgq(schema)}.${pgq(tableName)} ${usingClause}(${safeCols});`;
      await this.sql_conn.unsafe(sql);
      await this.logAudit("CREATE_INDEX", indexName, `Created ${indexType} index on ${tableName}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async dropIndex(indexName: string, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      await this.sql_conn.unsafe(`DROP INDEX IF EXISTS ${pgq(schema)}.${pgq(indexName)};`);
      await this.logAudit("DROP_INDEX", indexName, `Dropped index`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getSequences(schemaName?: string): Promise<any[]> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const res = await this.sql_conn.unsafe(`
        SELECT 
          sequencename as name,
          sequenceowner as owner,
          data_type as type,
          start_value,
          min_value,
          max_value,
          increment_by,
          last_value
        FROM pg_sequences 
        WHERE schemaname = ${pgl(schema)}
        ORDER BY sequencename ASC;
      `);
      return res || [];
    } catch {
      return [];
    }
  }

  public async restartSequence(seqName: string, restartVal: number = 1, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      await this.sql_conn.unsafe(`ALTER SEQUENCE ${pgq(schema)}.${pgq(seqName)} RESTART WITH ${Number(restartVal)};`);
      await this.logAudit("RESTART_SEQ", seqName, `Restarted sequence at ${restartVal}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async getRoles(): Promise<any[]> {
    try {
      const res = await this.sql_conn.unsafe(`
        SELECT 
          rolname as name, 
          rolsuper as is_superuser, 
          rolcreaterole as can_create_role, 
          rolcreatedb as can_create_db, 
          rolcanlogin as can_login, 
          rolconnlimit as conn_limit, 
          rolvaliduntil as valid_until
        FROM pg_roles 
        ORDER BY rolname ASC;
      `);
      return res || [];
    } catch {
      return [];
    }
  }

  public async getTriggers(tableName?: string, schemaName?: string): Promise<any[]> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      let sql = `
        SELECT 
          event_object_table as table_name,
          trigger_name,
          event_manipulation as event,
          action_timing as timing,
          action_statement as statement
        FROM information_schema.triggers
        WHERE trigger_schema = ${pgl(schema)}
      `;
      if (tableName) sql += ` AND event_object_table = ${pgl(tableName)}`;
      sql += ` ORDER BY event_object_table ASC, trigger_name ASC;`;
      const res = await this.sql_conn.unsafe(sql);
      return res || [];
    } catch {
      return [];
    }
  }

  public async getFunctions(schemaName?: string): Promise<any[]> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const res = await this.sql_conn.unsafe(`
        SELECT 
          routine_name as name,
          routine_type as type,
          data_type as return_type,
          routine_body as body,
          external_language as language,
          is_deterministic
        FROM information_schema.routines
        WHERE routine_schema = ${pgl(schema)}
        ORDER BY routine_name ASC;
      `);
      return res || [];
    } catch {
      return [];
    }
  }

  public async getTableStats(schemaName?: string): Promise<any[]> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const res = await this.sql_conn.unsafe(`
        SELECT 
          relname as table_name,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size,
          pg_size_pretty(pg_relation_size(relid)) as data_size,
          pg_size_pretty(pg_indexes_size(relid)) as index_size
        FROM pg_stat_user_tables
        WHERE schemaname = ${pgl(schema)}
        ORDER BY pg_total_relation_size(relid) DESC;
      `);
      return res || [];
    } catch {
      return [];
    }
  }

  public async getPerformanceMetrics(): Promise<any> {
    try {
      const cacheRes = await this.sql_conn.unsafe(`
        SELECT 
          round((sum(heap_blks_hit) * 100.0) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as hit_ratio
        FROM pg_statio_user_tables;
      `);
      const txnRes = await this.sql_conn.unsafe(`
        SELECT 
          datname, 
          xact_commit, 
          xact_rollback, 
          blks_read, 
          blks_hit, 
          tup_returned, 
          tup_fetched, 
          tup_inserted, 
          tup_updated, 
          tup_deleted 
        FROM pg_stat_database 
        WHERE datname = current_database();
      `);
      const locksRes = await this.sql_conn.unsafe(`
        SELECT 
          count(*) as total_locks,
          count(*) FILTER (WHERE granted = true) as granted_locks,
          count(*) FILTER (WHERE granted = false) as waiting_locks
        FROM pg_locks;
      `);
      const tuplesRes = await this.sql_conn.unsafe(`
        SELECT 
          coalesce(sum(n_live_tup), 0) as live_tuples,
          coalesce(sum(n_dead_tup), 0) as dead_tuples
        FROM pg_stat_user_tables;
      `);
      const sizeRes = await this.sql_conn.unsafe(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as pretty_size;
      `);

      const row = txnRes?.[0] || {};
      const locks = locksRes?.[0] || {};
      const tuples = tuplesRes?.[0] || {};

      return {
        cacheHitRatio: Number(cacheRes?.[0]?.hit_ratio ?? 99.8),
        databaseSizeBytesPretty: String(sizeRes?.[0]?.pretty_size || "16 MB"),
        activeLocksCount: Number(locks.total_locks || 0),
        grantedLocksCount: Number(locks.granted_locks || 0),
        waitingLocksCount: Number(locks.waiting_locks || 0),
        deadTuplesTotal: Number(tuples.dead_tuples || 0),
        liveTuplesTotal: Number(tuples.live_tuples || 0),
        xactCommit: Number(row.xact_commit || 0),
        xactRollback: Number(row.xact_rollback || 0),
        blksRead: Number(row.blks_read || 0),
        blksHit: Number(row.blks_hit || 0),
        tupInserted: Number(row.tup_inserted || 0),
        tupUpdated: Number(row.tup_updated || 0),
        tupDeleted: Number(row.tup_deleted || 0),
      };
    } catch {
      return {
        cacheHitRatio: 99.5,
        databaseSizeBytesPretty: "16 MB",
        activeLocksCount: 0,
        grantedLocksCount: 0,
        waitingLocksCount: 0,
        deadTuplesTotal: 0,
        liveTuplesTotal: 0,
        xactCommit: 0,
        xactRollback: 0,
      };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Enterprise Starter Relational Dataset Seeder (Tailored for PostgreSQL)
  // -----------------------------------------------------------------------------------------------

  public async seedSampleDataset(targetSchema?: string): Promise<{ success: boolean; error?: string }> {
    const s = targetSchema || this.activeSchema || "public";
    try {
      // 1. Enable UUID extension if available
      try {
        await this.sql_conn.unsafe(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
      } catch {}

      // 2. Drop existing sample objects if they exist
      await this.sql_conn.unsafe(`
        DROP MATERIALIZED VIEW IF EXISTS ${pgq(s)}."mv_daily_sales_analytics" CASCADE;
        DROP VIEW IF EXISTS ${pgq(s)}."v_order_details_extended" CASCADE;
        DROP VIEW IF EXISTS ${pgq(s)}."v_customer_order_summary" CASCADE;
        DROP VIEW IF EXISTS ${pgq(s)}."v_product_sales_performance" CASCADE;
        DROP VIEW IF EXISTS ${pgq(s)}."v_pending_shipments" CASCADE;
        DROP VIEW IF EXISTS ${pgq(s)}."v_vip_customer_analytics" CASCADE;
        DROP TABLE IF EXISTS ${pgq(s)}."order_items" CASCADE;
        DROP TABLE IF EXISTS ${pgq(s)}."orders" CASCADE;
        DROP TABLE IF EXISTS ${pgq(s)}."products" CASCADE;
        DROP TABLE IF EXISTS ${pgq(s)}."customers" CASCADE;
        DROP TABLE IF EXISTS ${pgq(s)}."audit_logs" CASCADE;
      `);

      // 3. Customers (with JSONB preferences)
      await this.sql_conn.unsafe(`
        CREATE TABLE ${pgq(s)}."customers" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(150) NOT NULL,
          email VARCHAR(150) NOT NULL UNIQUE,
          tier VARCHAR(20) DEFAULT 'Standard',
          preferences JSONB DEFAULT '{"theme": "dark", "notifications": true, "newsletter": false}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 4. Products (with JSONB specs and text[] array tags)
      await this.sql_conn.unsafe(`
        CREATE TABLE ${pgq(s)}."products" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sku VARCHAR(50) NOT NULL UNIQUE,
          name VARCHAR(150) NOT NULL,
          category VARCHAR(80) NOT NULL,
          price NUMERIC(10,2) NOT NULL,
          stock INT DEFAULT 100,
          specs JSONB DEFAULT '{}'::jsonb,
          tags text[] DEFAULT ARRAY['general'],
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 5. Orders (with JSONB shipping address)
      await this.sql_conn.unsafe(`
        CREATE TABLE ${pgq(s)}."orders" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_number VARCHAR(30) NOT NULL UNIQUE,
          customer_id UUID REFERENCES ${pgq(s)}."customers"(id) ON DELETE RESTRICT,
          total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
          status VARCHAR(30) DEFAULT 'Pending',
          shipping_address JSONB DEFAULT '{"city": "San Francisco", "state": "CA", "country": "USA"}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 6. Order Items
      await this.sql_conn.unsafe(`
        CREATE TABLE ${pgq(s)}."order_items" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id UUID REFERENCES ${pgq(s)}."orders"(id) ON DELETE CASCADE,
          product_id UUID REFERENCES ${pgq(s)}."products"(id) ON DELETE RESTRICT,
          quantity INT NOT NULL DEFAULT 1,
          unit_price NUMERIC(10,2) NOT NULL,
          line_total NUMERIC(10,2) NOT NULL
        );
      `);

      // 7. Audit Logs
      await this.sql_conn.unsafe(`
        CREATE TABLE ${pgq(s)}."audit_logs" (
          id BIGSERIAL PRIMARY KEY,
          action VARCHAR(50) NOT NULL,
          entity VARCHAR(100) NOT NULL,
          details JSONB DEFAULT '{}'::jsonb,
          timestamp TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 8. Populate Data
      await this.sql_conn.unsafe(`
        INSERT INTO ${pgq(s)}."customers" (name, email, tier, preferences) VALUES
          ('Alice Johnson', 'alice.johnson@enterprise.io', 'VIP', '{"theme": "dark", "loyalty_pts": 1450, "priority_support": true}'::jsonb),
          ('Bob Smith', 'bob.smith@cloudtech.com', 'Standard', '{"theme": "light", "loyalty_pts": 320, "priority_support": false}'::jsonb),
          ('Carol Williams', 'carol.williams@fintech.org', 'VIP', '{"theme": "system", "loyalty_pts": 2890, "priority_support": true}'::jsonb),
          ('David Miller', 'david.miller@devops.net', 'Gold', '{"theme": "dark", "loyalty_pts": 950, "priority_support": false}'::jsonb),
          ('Elena Rostova', 'elena.rostova@quantum.ai', 'VIP', '{"theme": "dark", "loyalty_pts": 4120, "priority_support": true}'::jsonb);

        INSERT INTO ${pgq(s)}."products" (sku, name, category, price, stock, specs, tags) VALUES
          ('SRV-EPYC-01', 'AMD EPYC 9654 Server Blade', 'Compute', 4299.99, 45, '{"cores": 96, "ram_gb": 384, "tdp_w": 360}'::jsonb, ARRAY['server', 'datacenter', 'high-performance']),
          ('GPU-A100-80', 'NVIDIA A100 Tensor Core 80GB', 'Accelerators', 6999.00, 18, '{"vram_gb": 80, "pcie": "Gen4", "tensor_cores": 432}'::jsonb, ARRAY['gpu', 'ai', 'deep-learning']),
          ('SSD-NVME-08', 'Enterprise NVMe U.3 7.68TB', 'Storage', 849.50, 120, '{"read_mbs": 7000, "write_mbs": 5500, "dwpd": 3}'::jsonb, ARRAY['storage', 'nvme', 'fast']),
          ('SW-400G-32', 'Arista 32-Port 400G Switch', 'Networking', 12500.00, 8, '{"ports": 32, "speed": "400GbE", "latency_ns": 450}'::jsonb, ARRAY['networking', 'spine-leaf']),
          ('UPS-RACK-05', 'APC Smart-UPS On-Line 5kVA', 'Power', 2150.00, 25, '{"va": 5000, "efficiency": "98%", "battery": "Li-Ion"}'::jsonb, ARRAY['power', 'rackmount', 'backup']);
      `);

      // Insert Orders and Items using customer and product lookup
      await this.sql_conn.unsafe(`
        DO $$
        DECLARE
          c_alice UUID;
          c_carol UUID;
          c_david UUID;
          c_elena UUID;
          p_epyc UUID;
          p_gpu UUID;
          p_ssd UUID;
          p_switch UUID;
          o1 UUID;
          o2 UUID;
          o3 UUID;
          o4 UUID;
        BEGIN
          SELECT id INTO c_alice FROM ${pgq(s)}."customers" WHERE email = 'alice.johnson@enterprise.io';
          SELECT id INTO c_carol FROM ${pgq(s)}."customers" WHERE email = 'carol.williams@fintech.org';
          SELECT id INTO c_david FROM ${pgq(s)}."customers" WHERE email = 'david.miller@devops.net';
          SELECT id INTO c_elena FROM ${pgq(s)}."customers" WHERE email = 'elena.rostova@quantum.ai';

          SELECT id INTO p_epyc FROM ${pgq(s)}."products" WHERE sku = 'SRV-EPYC-01';
          SELECT id INTO p_gpu FROM ${pgq(s)}."products" WHERE sku = 'GPU-A100-80';
          SELECT id INTO p_ssd FROM ${pgq(s)}."products" WHERE sku = 'SSD-NVME-08';
          SELECT id INTO p_switch FROM ${pgq(s)}."products" WHERE sku = 'SW-400G-32';

          INSERT INTO ${pgq(s)}."orders" (order_number, customer_id, total_amount, status, shipping_address)
          VALUES ('ORD-2026-001', c_alice, 18298.98, 'Shipped', '{"city": "Austin", "state": "TX", "zip": "78701"}'::jsonb)
          RETURNING id INTO o1;

          INSERT INTO ${pgq(s)}."order_items" (order_id, product_id, quantity, unit_price, line_total) VALUES
            (o1, p_epyc, 2, 4299.99, 8599.98),
            (o1, p_ssd, 4, 849.50, 3398.00),
            (o1, p_gpu, 1, 6999.00, 6999.00);

          INSERT INTO ${pgq(s)}."orders" (order_number, customer_id, total_amount, status, shipping_address)
          VALUES ('ORD-2026-002', c_carol, 26499.00, 'Completed', '{"city": "New York", "state": "NY", "zip": "10005"}'::jsonb)
          RETURNING id INTO o2;

          INSERT INTO ${pgq(s)}."order_items" (order_id, product_id, quantity, unit_price, line_total) VALUES
            (o2, p_switch, 1, 12500.00, 12500.00),
            (o2, p_gpu, 2, 6999.00, 13998.00);

          INSERT INTO ${pgq(s)}."orders" (order_number, customer_id, total_amount, status, shipping_address)
          VALUES ('ORD-2026-003', c_elena, 20997.00, 'Processing', '{"city": "Seattle", "state": "WA", "zip": "98101"}'::jsonb)
          RETURNING id INTO o3;

          INSERT INTO ${pgq(s)}."order_items" (order_id, product_id, quantity, unit_price, line_total) VALUES
            (o3, p_gpu, 3, 6999.00, 20997.00);

          INSERT INTO ${pgq(s)}."orders" (order_number, customer_id, total_amount, status, shipping_address)
          VALUES ('ORD-2026-004', c_david, 5149.49, 'Pending', '{"city": "Denver", "state": "CO", "zip": "80202"}'::jsonb)
          RETURNING id INTO o4;

          INSERT INTO ${pgq(s)}."order_items" (order_id, product_id, quantity, unit_price, line_total) VALUES
            (o4, p_epyc, 1, 4299.99, 4299.99),
            (o4, p_ssd, 1, 849.50, 849.50);

          INSERT INTO ${pgq(s)}."audit_logs" (action, entity, details) VALUES
            ('SEED', 'SYSTEM', '{"event": "Starter dataset initialized", "tables": 5, "views": 5}'::jsonb),
            ('ORDER_PLACED', 'ORD-2026-001', '{"amount": 18298.98, "customer": "Alice Johnson"}'::jsonb),
            ('ORDER_PLACED', 'ORD-2026-002', '{"amount": 26499.00, "customer": "Carol Williams"}'::jsonb);
        END $$;
      `);

      // 9. Create Relational Views
      await this.sql_conn.unsafe(`
        CREATE OR REPLACE VIEW ${pgq(s)}."v_order_details_extended" AS
        SELECT 
          o.order_number,
          c.name AS customer_name,
          c.tier AS customer_tier,
          p.name AS product_name,
          p.category AS product_category,
          oi.quantity,
          oi.unit_price,
          oi.line_total,
          o.status AS order_status,
          o.created_at AS order_date
        FROM ${pgq(s)}."order_items" oi
        JOIN ${pgq(s)}."orders" o ON o.id = oi.order_id
        JOIN ${pgq(s)}."customers" c ON c.id = o.customer_id
        JOIN ${pgq(s)}."products" p ON p.id = oi.product_id;

        CREATE OR REPLACE VIEW ${pgq(s)}."v_customer_order_summary" AS
        SELECT 
          c.id AS customer_id,
          c.name,
          c.email,
          c.tier,
          COUNT(DISTINCT o.id) AS total_orders,
          COALESCE(SUM(o.total_amount), 0.00) AS total_spend
        FROM ${pgq(s)}."customers" c
        LEFT JOIN ${pgq(s)}."orders" o ON o.customer_id = c.id
        GROUP BY c.id, c.name, c.email, c.tier;

        CREATE OR REPLACE VIEW ${pgq(s)}."v_product_sales_performance" AS
        SELECT 
          p.id AS product_id,
          p.sku,
          p.name AS product_name,
          p.category,
          p.stock,
          COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
          COALESCE(SUM(oi.line_total), 0.00) AS gross_revenue
        FROM ${pgq(s)}."products" p
        LEFT JOIN ${pgq(s)}."order_items" oi ON oi.product_id = p.id
        GROUP BY p.id, p.sku, p.name, p.category, p.stock;

        CREATE OR REPLACE VIEW ${pgq(s)}."v_pending_shipments" AS
        SELECT 
          o.order_number,
          c.name AS customer_name,
          o.total_amount,
          o.status,
          o.shipping_address->>'city' as shipping_city,
          o.shipping_address->>'state' as shipping_state,
          o.created_at
        FROM ${pgq(s)}."orders" o
        JOIN ${pgq(s)}."customers" c ON c.id = o.customer_id
        WHERE o.status IN ('Pending', 'Processing');

        CREATE OR REPLACE VIEW ${pgq(s)}."v_vip_customer_analytics" AS
        SELECT 
          c.name,
          c.email,
          c.preferences->>'loyalty_pts' as loyalty_points,
          COUNT(o.id) as completed_orders,
          SUM(o.total_amount) as total_vip_revenue
        FROM ${pgq(s)}."customers" c
        JOIN ${pgq(s)}."orders" o ON o.customer_id = c.id
        WHERE c.tier = 'VIP'
        GROUP BY c.name, c.email, c.preferences;
      `);

      // 10. PostgreSQL Materialized View (Specialty Feature!)
      await this.sql_conn.unsafe(`
        CREATE MATERIALIZED VIEW ${pgq(s)}."mv_daily_sales_analytics" AS
        SELECT 
          DATE_TRUNC('day', o.created_at)::date AS sales_date,
          COUNT(DISTINCT o.id) AS orders_count,
          SUM(o.total_amount) AS revenue,
          AVG(o.total_amount) AS average_order_value
        FROM ${pgq(s)}."orders" o
        GROUP BY DATE_TRUNC('day', o.created_at)::date;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_sales_date ON ${pgq(s)}."mv_daily_sales_analytics" (sales_date);
      `);

      // 11. Run ANALYZE so statistics and row counts are immediately computed
      try {
        await this.sql_conn.unsafe(`ANALYZE;`);
      } catch {}

      await this.logAudit("SEED_SAMPLE", s, "Provisions enterprise PostgreSQL relational starter suite with JSONB, Arrays, Views & Materialized View");
      return { success: true };
    } catch (err: any) {
      console.error("seedSampleDataset error:", err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async logAudit(action: string, entity: string, details: string) {
    try {
      await this.sql_conn.unsafe(
        `INSERT INTO ${pgq(this.activeSchema)}."audit_logs" (action, entity, details) VALUES ($1, $2, $3::jsonb);`,
        [action, entity, JSON.stringify({ message: details })]
      );
    } catch {}
  }

  public async getAuditLogs(limit: number = 50): Promise<any[]> {
    try {
      const rows = await this.sql_conn.unsafe(
        `SELECT id, action, entity, details, timestamp FROM ${pgq(this.activeSchema)}."audit_logs" ORDER BY id DESC LIMIT $1;`,
        [Math.min(200, Math.max(1, limit))]
      );
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  public async checkIntegrity(schemaName: string = this.activeSchema): Promise<{
    success: boolean;
    result: string;
    tablesChecked: number;
    issues: string[];
  }> {
    const s = schemaName || this.activeSchema || "public";
    const issues: string[] = [];
    const outputs: string[] = [];
    let tablesChecked = 0;

    try {
      const tables = await this.sql_conn.unsafe(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name;`,
        [s]
      );

      for (const t of tables) {
        const tbl = t.table_name || t.TABLE_NAME;
        if (!tbl) continue;
        tablesChecked++;

        // 1. Verify table access & row counting
        try {
          const countRes = await this.sql_conn.unsafe(`SELECT count(*) AS c FROM ${pgq(s)}.${pgq(tbl)};`);
          const count = Number(countRes[0]?.c || 0);

          // 2. Check index validity
          const idxRes = await this.sql_conn.unsafe(
            `SELECT i.relname AS index_name, ix.indisvalid 
             FROM pg_index ix 
             JOIN pg_class i ON i.oid = ix.indexrelid 
             JOIN pg_class t ON t.oid = ix.indrelid 
             JOIN pg_namespace n ON n.oid = t.relnamespace 
             WHERE n.nspname = $1 AND t.relname = $2;`,
            [s, tbl]
          );

          let idxStatus = "All indexes valid";
          for (const idx of idxRes) {
            if (!idx.indisvalid) {
              issues.push(`Index ${pgq(idx.index_name)} on table ${pgq(tbl)} is INVALID`);
              idxStatus = `INVALID index: ${idx.index_name}`;
            }
          }

          outputs.push(`Table ${pgq(s)}.${pgq(tbl)}: ${count} rows, ${idxRes.length} index(es) OK (${idxStatus})`);
        } catch (tableErr: any) {
          issues.push(`Error checking table ${pgq(tbl)}: ${tableErr.message}`);
          outputs.push(`Table ${pgq(s)}.${pgq(tbl)}: ERROR (${tableErr.message})`);
        }
      }

      await this.logAudit("INTEGRITY_CHECK", s, `Checked ${tablesChecked} tables. Issues found: ${issues.length}`);

      return {
        success: issues.length === 0,
        result: outputs.join("\n") || "No tables found to check.",
        tablesChecked,
        issues,
        checks: outputs,
      };
    } catch (err: any) {
      return {
        success: false,
        result: `Integrity check failed: ${err.message}`,
        tablesChecked: 0,
        issues: [err.message],
        checks: [],
      };
    }
  }
}

// -------------------------------------------------------------------------------------------------
// HTTP Telemetry Server Engine
// -------------------------------------------------------------------------------------------------

export function startPostgresStudioServer(options: ServerOptions = {}) {
  const port = options.port ?? 0;
  const hostname = options.host ?? "127.0.0.1";
  const manager = new PostgresManager(options.initialDbPath || "", options.config);
  if (options.initialSchema) {
    manager.setSchema(options.initialSchema).catch(() => {});
  }

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      // CORS & Local Guard
      const __blocked = guardLocalRequest(req);
      if (__blocked) return __blocked;
      if (url.pathname === "/workbench" || url.pathname.startsWith("/api/v2/")) {
        const __workbench = await (await getSharedWorkbench("PostgreSQL Studio · Workbench")).handle(req);
        if (__workbench) return __workbench;
      }
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // 1. Webstation App UI Entry point
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(generatePostgresStudioHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      // 2. Telemetry KPIs
      if (url.pathname === "/api/kpis") {
        try {
          const kpis = await manager.getKpis();
          return Response.json({ success: true, kpis, ...kpis }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 3. Schema Structure (Tables, Views, MatViews, Columns, FKs, Indices)
      if (url.pathname === "/api/schema") {
        try {
          const targetSchema = url.searchParams.get("schema") || manager.activeSchema;
          const schema = await manager.getSchema(targetSchema);
          return Response.json(schema, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 3b. Schemas Listing & Schema Switcher (Postgres Specialty)
      if (url.pathname === "/api/schemas" && req.method === "GET") {
        try {
          const schemas = await manager.getSchemas();
          return Response.json({ success: true, schemas, activeSchema: manager.activeSchema }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/set-schema" && req.method === "POST") {
        try {
          const body = (await req.json()) as { schema: string };
          const ok = await manager.setSchema(body.schema);
          return Response.json({ success: ok, activeSchema: manager.activeSchema }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/create-schema" && req.method === "POST") {
        try {
          const body = (await req.json()) as { schema: string };
          const res = await manager.createSchema(body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 4. SQL Execution & EXPLAIN ANALYZE
      if (url.pathname === "/api/query" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string; params?: any[]; explain?: boolean; analyze?: boolean };
          if (body.explain) {
            const result = await manager.explain(body.sql);
            return Response.json(result, { headers: corsHeaders });
          }
          const result = await manager.query(body.sql, body.params || []);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 4b. Dedicated Explain Query Plan (Structured Node Tree & Raw Output)
      if (url.pathname === "/api/explain" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string };
          const result = await manager.explain(body.sql);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 5. Extensions Manager API (Postgres Specialty)
      if (url.pathname === "/api/extensions" && req.method === "GET") {
        try {
          const extensions = await manager.getExtensions();
          return Response.json({ success: true, extensions }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/extensions/toggle" && req.method === "POST") {
        try {
          const body = (await req.json()) as { name: string; enable: boolean };
          const res = await manager.toggleExtension(body.name, body.enable);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 5b. Custom Enum Types API
      if (url.pathname === "/api/types/enums" && req.method === "GET") {
        try {
          const enums = await manager.getEnumTypes(url.searchParams.get("schema") || undefined);
          return Response.json({ success: true, enums }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/types/enums/create" && req.method === "POST") {
        try {
          const body = (await req.json()) as { name: string; values: string[]; schema?: string };
          const res = await manager.createEnumType(body.name, body.values, body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/types/enums/add-value" && req.method === "POST") {
        try {
          const body = (await req.json()) as { name: string; value: string; schema?: string };
          const res = await manager.addEnumValue(body.name, body.value, body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/types/enums/drop" && req.method === "POST") {
        try {
          const body = (await req.json()) as { name: string; schema?: string };
          const res = await manager.dropEnumType(body.name, body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 5c. Partitioned Tables API
      if (url.pathname === "/api/partitions" && req.method === "GET") {
        try {
          const partitions = await manager.getPartitionedTables(url.searchParams.get("schema") || undefined);
          return Response.json({ success: true, partitions }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 5d. Streaming Replication & WAL Status API
      if (url.pathname === "/api/replication" && req.method === "GET") {
        try {
          const replication = await manager.getReplicationStatus();
          return Response.json({ success: true, replication }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 5e. Full Database SQL Dump & Backup Generator API
      if (url.pathname === "/api/database/dump" && req.method === "POST") {
        try {
          const body = (await req.json()) as { mode?: "all" | "schema" | "data"; tables?: string[]; schema?: string };
          const sqlDump = await manager.generateDatabaseDump(body);
          return Response.json({ success: true, sql: sqlDump, mode: body.mode || "all", timestamp: new Date().toISOString() }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 5f. Table Aggregates for Access Totals Row
      if (url.pathname === "/api/table/aggregates" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string; schema?: string };
          const aggregates = await manager.getTableAggregates(body.table, body.schema);
          return Response.json({ success: true, aggregates }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 6. Live Activity & Process Monitor API (Postgres Specialty)
      if ((url.pathname === "/api/activity" || url.pathname === "/api/activity/locks") && req.method === "GET") {
        try {
          const activity = await manager.getActivity();
          const blockedLocks = await manager.getBlockedLocks();
          return Response.json({ success: true, activity, blockedLocks }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/activity/terminate" && req.method === "POST") {
        try {
          const body = (await req.json()) as { pid: number };
          const res = await manager.terminateBackend(body.pid);
          return Response.json(res, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/activity/cancel" && req.method === "POST") {
        try {
          const body = (await req.json()) as { pid: number };
          const res = await manager.cancelBackend(body.pid);
          return Response.json(res, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 7. Materialized View Refresh (Postgres Specialty)
      if (url.pathname === "/api/matviews/refresh" && req.method === "POST") {
        try {
          const body = (await req.json()) as { name: string; concurrently?: boolean };
          const res = await manager.refreshMaterializedView(body.name, body.concurrently);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 8. Maintenance (VACUUM ANALYZE)
      if (url.pathname === "/api/vacuum" && req.method === "POST") {
        try {
          const body = ((await req.json().catch(() => ({}))) || {}) as { full?: boolean; analyze?: boolean; table?: string; schema?: string };
          const res = await manager.vacuum(body.full, body.analyze !== false, body.table, body.schema);
          return Response.json(res, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 9. Starter Dataset Seeding
      if ((url.pathname === "/api/seed-sample" || url.pathname === "/api/seed") && (req.method === "POST" || req.method === "GET")) {
        try {
          let schema: string | undefined = url.searchParams.get("schema") || undefined;
          if (req.method === "POST") {
            try {
              const body = await req.json();
              if (body?.schema) schema = body.schema;
            } catch {}
          }
          const res = await manager.seedSampleDataset(schema);
          return Response.json(res, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 10. Table Data (Paginated & Filtered)
      if (url.pathname === "/api/table/data" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            table: string;
            page?: number;
            pageSize?: number;
            orderBy?: string;
            orderDir?: string;
            search?: string;
            schema?: string;
          };
          const data = await manager.getTableData(
            body.table,
            body.page,
            body.pageSize,
            body.orderBy,
            body.orderDir,
            body.search,
            body.schema
          );
          return Response.json({ ...data, total: data.totalRows }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 11. Connect / Switch Database or Custom Host & Credentials
      if (url.pathname === "/api/connect" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            path?: string;
            host?: string;
            port?: number;
            user?: string;
            password?: string;
            database?: string;
            schema?: string;
            tls?: boolean;
            url?: string;
          };
          if (body.host || body.user || body.url || (body.port && body.port !== 5432)) {
            const configResult = await manager.updateConfig({
              host: body.host,
              port: body.port,
              user: body.user,
              password: body.password,
              database: body.database || body.path,
              schema: body.schema,
              tls: body.tls,
              url: body.url,
            });
            if (!configResult.success) {
              return Response.json(configResult, { status: 400, headers: corsHeaders });
            }
            return Response.json(
              {
                success: true,
                path: manager.activePath,
                config: manager.getConfig(),
                kpis: await manager.getKpis(),
                schema: await manager.getSchema(),
              },
              { headers: corsHeaders }
            );
          }

          const result = await manager.connect(body.path || body.database || "", body.schema);
          if (!result.success) {
            return Response.json(result, { status: 400, headers: corsHeaders });
          }
          return Response.json(
            {
              ...result,
              config: manager.getConfig(),
              kpis: await manager.getKpis(),
              schema: await manager.getSchema(),
            },
            { headers: corsHeaders }
          );
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 12. Connection Config Endpoints
      if (url.pathname === "/api/config" && req.method === "GET") {
        return Response.json({ success: true, config: manager.getConfig() }, { headers: corsHeaders });
      }

      if (url.pathname === "/api/config" && req.method === "POST") {
        try {
          const body = (await req.json()) as PostgresConnectionConfig & { resetToEnv?: boolean };
          if (body.resetToEnv) {
            const res = manager.resetToEnv();
            return Response.json({
              ...res,
              kpis: await manager.getKpis(),
              schema: await manager.getSchema(),
            }, { headers: corsHeaders });
          }
          const result = await manager.updateConfig(body);
          if (!result.success) {
            return Response.json(result, { status: 400, headers: corsHeaders });
          }
          return Response.json({
            ...result,
            kpis: await manager.getKpis(),
            schema: await manager.getSchema(),
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/test-config" && req.method === "POST") {
        try {
          const body = (await req.json()) as PostgresConnectionConfig;
          const result = await manager.testConnection(body);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/create-database" && req.method === "POST") {
        try {
          const body = (await req.json()) as { name?: string; database?: string };
          const dbName = body.name || body.database || "";
          const result = await manager.createDatabase(dbName);
          if (!result.success) {
            return Response.json(result, { status: 400, headers: corsHeaders });
          }
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/workspace-databases" && req.method === "GET") {
        try {
          const databases = await manager.getWorkspaceDatabases();
          return Response.json({ success: true, databases }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 13. Table CRUD Mutations
      if (url.pathname.startsWith("/api/schema/") && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const op = url.pathname.slice("/api/schema/".length);
          let result: any;
          switch (op) {
            case "create-table":
              result = await manager.createTable(body.name || body.table, body.columns, body.schema);
              break;
            case "redesign-table":
              result = await manager.redesignTable(body.table || body.name, body.newName, body.columns, body.schema);
              break;
            case "rename-table":
              result = await manager.renameTable(body.table || body.name, body.newName, body.schema);
              break;
            case "drop-table":
            case "drop":
              result = await manager.dropObject(body.kind || "table", body.name || body.table, body.schema);
              break;
            case "add-column":
              result = await manager.addColumn(body.table || body.name, body.column, body.schema);
              break;
            case "drop-column":
              result = await manager.dropColumn(body.table || body.name, body.column || body.columnName, body.cascade, body.schema);
              break;
            default:
              return Response.json({ success: false, error: `Unknown op ${op}` }, { status: 400, headers: corsHeaders });
          }
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname.startsWith("/api/rows/") && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const op = url.pathname.slice("/api/rows/".length);
          let result: any;
          switch (op) {
            case "insert":
              result = await manager.insertRow(body.table, body.row, body.schema);
              break;
            case "update":
              result = await manager.updateRow(body.table, body.pkCol, body.pkVal, body.row, body.schema);
              break;
            case "delete":
              result = await manager.deleteRow(body.table, body.pkCol, body.pkVal, body.schema);
              break;
            case "import-batch":
              result = await manager.importBatchRows(body.table, body.rows, body.schema);
              break;
            default:
              return Response.json({ success: false, error: `Unknown row op ${op}` }, { status: 400, headers: corsHeaders });
          }
          return Response.json(result, { status: result.success !== false ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 14. Table Truncate & Batch Operations
      if (url.pathname === "/api/table/truncate" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string; cascade?: boolean; schema?: string };
          const res = await manager.truncateTable(body.table, body.cascade, body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/rows/import-batch" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string; rows: Record<string, any>[]; schema?: string };
          const res = await manager.importBatchRows(body.table, body.rows, body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 15. Indexes Management
      if (url.pathname === "/api/indexes" && (req.method === "GET" || req.method === "POST")) {
        try {
          let table = url.searchParams.get("table") || undefined;
          let schema = url.searchParams.get("schema") || undefined;
          if (req.method === "POST") {
            try {
              const body = await req.json();
              if (body?.table) table = body.table;
              if (body?.schema) schema = body.schema;
            } catch {}
          }
          const indexes = await manager.getIndexes(table, schema);
          return Response.json({ success: true, indexes }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/indexes/create" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            name: string;
            table: string;
            columns: string[];
            type?: string;
            unique?: boolean;
            schema?: string;
          };
          const res = await manager.createIndex(body.name, body.table, body.columns, body.type, body.unique, body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/indexes/drop" && req.method === "POST") {
        try {
          const body = (await req.json()) as { name: string; schema?: string };
          const res = await manager.dropIndex(body.name, body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 16. Sequences Inspection & Operations
      if (url.pathname === "/api/sequences" && (req.method === "GET" || req.method === "POST")) {
        try {
          let schema = url.searchParams.get("schema") || undefined;
          if (req.method === "POST") {
            try {
              const body = await req.json();
              if (body?.schema) schema = body.schema;
            } catch {}
          }
          const sequences = await manager.getSequences(schema);
          return Response.json({ success: true, sequences }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/sequences/restart" && req.method === "POST") {
        try {
          const body = (await req.json()) as { name: string; restartVal?: number; schema?: string };
          const res = await manager.restartSequence(body.name, body.restartVal || 1, body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 17. Roles & Privileges
      if (url.pathname === "/api/roles" && (req.method === "GET" || req.method === "POST")) {
        try {
          const roles = await manager.getRoles();
          return Response.json({ success: true, roles }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 18. Triggers & Functions
      if (url.pathname === "/api/triggers" && (req.method === "GET" || req.method === "POST")) {
        try {
          let table = url.searchParams.get("table") || undefined;
          let schema = url.searchParams.get("schema") || undefined;
          if (req.method === "POST") {
            try {
              const body = await req.json();
              if (body?.table) table = body.table;
              if (body?.schema) schema = body.schema;
            } catch {}
          }
          const triggers = await manager.getTriggers(table, schema);
          return Response.json({ success: true, triggers }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/functions" && (req.method === "GET" || req.method === "POST")) {
        try {
          let schema = url.searchParams.get("schema") || undefined;
          if (req.method === "POST") {
            try {
              const body = await req.json();
              if (body?.schema) schema = body.schema;
            } catch {}
          }
          const functions = await manager.getFunctions(schema);
          return Response.json({ success: true, functions }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 19. Table Bloat & Performance Telemetry
      if (url.pathname === "/api/table/stats" && (req.method === "GET" || req.method === "POST")) {
        try {
          let schema = url.searchParams.get("schema") || undefined;
          if (req.method === "POST") {
            try {
              const body = await req.json();
              if (body?.schema) schema = body.schema;
            } catch {}
          }
          const stats = await manager.getTableStats(schema);
          return Response.json({ success: true, stats }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/telemetry" && (req.method === "GET" || req.method === "POST")) {
        try {
          const telemetry = await manager.getPerformanceMetrics();
          return Response.json({ success: true, telemetry }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // Integrity Check
      if (url.pathname === "/api/integrity" && (req.method === "GET" || req.method === "POST")) {
        try {
          const result = await manager.checkIntegrity();
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // Audit Logs Trail
      if (url.pathname === "/api/audit-logs" && (req.method === "GET" || req.method === "POST")) {
        try {
          const logs = await manager.getAuditLogs();
          return Response.json({ success: true, logs }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // Clipboard Helper
      if (url.pathname === "/api/clipboard" && req.method === "POST") {
        try {
          const body = (await req.json()) as { text: string };
          writeClipboardSync(body.text || "");
          return Response.json({ success: true }, { headers: corsHeaders });
        } catch {
          return Response.json({ success: true, fallback: "Clipboard simulated" }, { headers: corsHeaders });
        }
      }

      // Unified Table Mutate (Insert / Update / Delete)
      if (url.pathname === "/api/table/mutate" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            table: string;
            action: "insert" | "update" | "delete";
            payload: { rowId?: any; rowIds?: any[]; pkColumn?: string; data?: Record<string, any> };
            schema?: string;
          };
          const tbl = body.table;
          const s = body.schema || manager.getActiveSchema();
          let result: any = { success: false, error: "Invalid action" };

          if (body.action === "insert") {
            result = await manager.insertRow(tbl, body.payload.data || {}, s);
          } else if (body.action === "update") {
            result = await manager.updateRow(tbl, body.payload.pkColumn || "id", body.payload.rowId, body.payload.data || {}, s);
          } else if (body.action === "delete") {
            result = await manager.deleteRow(tbl, body.payload.pkColumn || "id", body.payload.rowId, s);
          }

          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Export file generation (CSV / JSON / SQL)
      if ((url.pathname === "/api/export" || url.pathname === "/api/export-file") && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            format?: "json" | "csv" | "sql";
            rows?: any[];
            tableName?: string;
            sql?: string;
          };
          const fmt = (body.format || "json").toLowerCase();
          const rows = Array.isArray(body.rows) ? body.rows : [];
          const exportsDir = resolve(homedir(), ".bun_rad_studio", "exports");
          if (!existsSync(exportsDir)) mkdirSync(exportsDir, { recursive: true });

          const filename = `pg_export_${Date.now()}.${fmt}`;
          const exportPath = resolve(exportsDir, filename);

          let content = "";
          const allKeys: string[] = [];
          for (const r of rows) for (const k of Object.keys(r || {})) if (!allKeys.includes(k) && k !== "__rowid__") allKeys.push(k);

          if (fmt === "json") {
            content = JSON.stringify(rows, null, 2);
          } else if (fmt === "csv") {
            const esc = (v: any) => {
              if (v === null || v === undefined) return "";
              const s = typeof v === "object" ? JSON.stringify(v) : String(v);
              return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const lines = [allKeys.map(esc).join(",")];
            for (const r of rows) {
              lines.push(allKeys.map((h) => esc(r[h])).join(","));
            }
            content = lines.join("\r\n");
          } else if (fmt === "sql") {
            const tbl = (body.tableName || "exported_records").replace(/"/g, '""');
            const headers = allKeys;
            const escapedHeaders = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(", ");
            const lines = rows.map((r) => {
              const vals = headers.map((h) => {
                const v = r[h];
                if (v === null || v === undefined) return "NULL";
                if (typeof v === "number") return v;
                if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
                return `'${String(v).replace(/'/g, "''")}'`;
              });
              return `INSERT INTO ${pgq(tbl)} (${escapedHeaders}) VALUES (${vals.join(", ")});`;
            });
            content = lines.join("\n");
          }

          writeFileSync(exportPath, content, "utf8");
          return Response.json({ success: true, filename, path: exportPath, rowCount: rows.length }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // PRAGMA / Server Setting Query & Maintenance
      if (url.pathname === "/api/pragma" && (req.method === "GET" || req.method === "POST")) {
        try {
          let param = url.searchParams.get("pragma") || "";
          let value: any = url.searchParams.get("value");
          if (req.method === "POST") {
            try {
              const body = (await req.json()) as { pragma?: string; value?: unknown };
              if (body.pragma) param = body.pragma;
              if (body.value !== undefined) value = body.value;
            } catch {}
          }

          const cleanParam = (param || "").trim().toLowerCase();
          if (cleanParam === "vacuum") {
            const vacRes = await manager.vacuum(false, true);
            return Response.json({ success: true, result: JSON.stringify(vacRes, null, 2) }, { headers: corsHeaders });
          }
          if (cleanParam === "integrity_check" || cleanParam === "integrity") {
            const intRes = await manager.checkIntegrity();
            return Response.json({ success: intRes.success, result: intRes.result }, { headers: corsHeaders });
          }

          if (value !== undefined && value !== null) {
            await manager.query(`SET ${cleanParam} = '${String(value).replace(/'/g, "''")}';`);
            return Response.json({ success: true, result: `${cleanParam} = ${value}` }, { headers: corsHeaders });
          } else {
            const settingRes = await manager.query(
              cleanParam ? `SHOW ${cleanParam};` : `SELECT name, setting, unit, category, context, short_desc, boot_val, min_val, max_val FROM pg_settings ORDER BY category, name;`
            );
            return Response.json({
              success: true,
              result: JSON.stringify(settingRes.rows, null, 2),
              settings: settingRes.rows,
            }, { headers: corsHeaders });
          }
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      const macroRes = await handleMacroRoute(manager.getMacroAdapter(), manager.macroStore, req, url.pathname, corsHeaders);
      if (macroRes) return macroRes;

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return server;
}

// -------------------------------------------------------------------------------------------------
// Worker Message Handling (Isolated OS Background Thread)
// -------------------------------------------------------------------------------------------------

if (!Bun.isMainThread && (!process.env.STUDIO_WORKER || process.env.STUDIO_WORKER === "postgres_studio")) {
  const preferredPort = 0;
  const initialDbPath = process.env.PG_DB_PATH 
    || process.env.PG_DATABASE 
    || process.env.PG_NAME 
    || process.env.PG_DB 
    || process.env.POSTGRES_DB 
    || process.env.DB_NAME 
    || "mydb";
  const initialSchema = process.env.PG_SCHEMA || "public";
  const server = startPostgresStudioServer({ port: preferredPort, initialDbPath, initialSchema });

  (globalThis as any).postMessage({
    ready: true,
    type: "postgres_studio",
    port: server.port,
    url: `http://127.0.0.1:${server.port}`,
  });
}
