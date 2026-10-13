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
import { SQL } from "bun";
import { resolve, basename } from "path";
import { existsSync, statSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { generatePostgresStudioHtml } from "./postgres_studio.ts";

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
      this.sql_conn.unsafe(`SET search_path TO "${this.activeSchema}", public;`).catch(() => {});
    } catch (e: any) {
      console.error("Failed to initialize Postgres connection:", e);
    }
  }

  public async setSchema(schemaName: string): Promise<boolean> {
    const clean = (schemaName || "").trim();
    if (!clean) return false;
    try {
      await this.sql_conn.unsafe(`SET search_path TO "${clean}", public;`);
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
      await this.sql_conn.unsafe(`CREATE SCHEMA IF NOT EXISTS "${clean}";`);
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
        await rootSql.unsafe(`CREATE DATABASE "${clean}";`);
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
          WHERE table_schema = '${schema}';
        `);
        tableCount = Number(countsRes?.[0]?.tables || 0);
        viewCount = Number(countsRes?.[0]?.views || 0);
      } catch {}

      try {
        const mvRes = await this.sql_conn.unsafe(`SELECT count(*) as c FROM pg_matviews WHERE schemaname = '${schema}';`);
        matViewCount = Number(mvRes?.[0]?.c || 0);
      } catch {}

      let totalRows = 0;
      try {
        const rowsRes = await this.sql_conn.unsafe(`
          SELECT COALESCE(SUM(reltuples)::bigint, 0) as total_rows 
          FROM pg_class c 
          JOIN pg_namespace n ON n.oid = c.relnamespace 
          WHERE n.nspname = '${schema}' AND c.relkind IN ('r', 'm');
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
        WHERE table_schema = '${schema}' 
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
            WHERE tc.table_schema = '${schema}' AND tc.table_name = '${tname}' AND tc.constraint_type = 'PRIMARY KEY'
          ) pk ON pk.column_name = c.column_name
          WHERE c.table_schema = '${schema}' AND c.table_name = '${tname}'
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
          WHERE schemaname = '${schema}' AND tablename = '${tname}';
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
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = '${schema}' AND tc.table_name = '${tname}';
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
            WHERE n.nspname = '${schema}' AND c.relname = '${tname}';
          `);
          rowCount = Math.max(0, Number(cntRes?.[0]?.rc || 0));
        } catch {}

        if (rowCount <= 0 && isTable) {
          try {
            const exactRes = await this.sql_conn.unsafe(`SELECT count(*) as rc FROM "${schema}"."${tname}";`);
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
        WHERE schemaname = '${schema}' 
        ORDER BY matviewname;
      `);

      for (const mv of matviews) {
        const mvName = mv.matviewname;
        const colsRes = await this.sql_conn.unsafe(`
          SELECT a.attname as column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type, a.attnotnull as notnull
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = '${schema}' AND c.relname = '${mvName}' AND a.attnum > 0 AND NOT a.attisdropped
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
        await this.sql_conn.unsafe(`CREATE EXTENSION IF NOT EXISTS "${clean}";`);
        await this.logAudit("EXTENSION", clean, `Installed extension: ${clean}`);
      } else {
        await this.sql_conn.unsafe(`DROP EXTENSION IF EXISTS "${clean}" CASCADE;`);
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
        ? `REFRESH MATERIALIZED VIEW CONCURRENTLY "${this.activeSchema}"."${clean}";`
        : `REFRESH MATERIALIZED VIEW "${this.activeSchema}"."${clean}";`;
      await this.sql_conn.unsafe(sql);
      await this.logAudit("MATVIEW", clean, `Refreshed materialized view: ${clean}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async vacuum(full: boolean = false, analyze: boolean = true, table?: string, schema?: string): Promise<{ success: boolean; details: string; error?: string }> {
    try {
      const target = table ? `"${schema || this.activeSchema}"."${table}"` : "";
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
        if (relation) detail += ` on "${relation}"`;
        if (alias && alias !== relation) detail += ` (as "${alias}")`;
        if (indexName) detail += ` using "${indexName}"`;

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
      let countSql = `SELECT count(*) as c FROM "${schema}"."${tableName}"`;
      let dataSql = `SELECT * FROM "${schema}"."${tableName}"`;

      const params: any[] = [];
      if (search && search.trim()) {
        const schemaMeta = await this.getSchema(schema);
        const allItems = [...schemaMeta.tables, ...schemaMeta.views, ...schemaMeta.matviews];
        const tbl = allItems.find((t) => t.name === tableName);
        if (tbl && tbl.columns.length > 0) {
          const filterClauses = tbl.columns.map((c) => `CAST("${c.name}" AS TEXT) ILIKE $1`).join(" OR ");
          countSql += ` WHERE ${filterClauses}`;
          dataSql += ` WHERE ${filterClauses}`;
          params.push(`%${search.trim()}%`);
        }
      }

      if (orderBy) {
        dataSql += ` ORDER BY "${orderBy}" ${safeDir}`;
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

      const cols = keys.map((k) => `"${k}"`).join(", ");
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

      const sql = `INSERT INTO "${schema}"."${tableName}" (${cols}) VALUES (${placeholders}) RETURNING *;`;
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
        if (type.includes("JSON")) return `"${k}" = $${i + 1}::jsonb`;
        return `"${k}" = $${i + 1}`;
      }).join(", ");

      const values = keys.map((k) => {
        const val = rowData[k];
        if (typeof val === "object" && val !== null) {
          return JSON.stringify(val);
        }
        return val;
      });
      values.push(pkVal);

      const sql = `UPDATE "${schema}"."${tableName}" SET ${sets} WHERE "${pkCol}" = $${values.length};`;
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
      const sql = `DELETE FROM "${schema}"."${tableName}" WHERE "${pkCol}" = $1;`;
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
        let def = `"${c.name}" ${c.type}`;
        if (c.pk) def += " PRIMARY KEY";
        if (c.notnull) def += " NOT NULL";
        if (c.dflt_value !== undefined && c.dflt_value !== null && c.dflt_value !== "") {
          def += ` DEFAULT ${c.dflt_value}`;
        }
        return def;
      });

      const sql = `CREATE TABLE "${schema}"."${tableName}" (\n  ${colDefs.join(",\n  ")}\n);`;
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
    try {
      const targetName = newTable || oldTable;
      const tmpName = `_tmp_redesign_${Date.now()}`;
      await this.createTable(tmpName, columns, schema);

      try {
        const oldColsRes = await this.sql_conn.unsafe(`
          SELECT column_name FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${oldTable}';
        `);
        const oldCols = new Set(oldColsRes.map((r: any) => r.column_name));
        const sharedCols = columns.filter((c) => oldCols.has(c.name)).map((c) => `"${c.name}"`);

        if (sharedCols.length > 0) {
          const colList = sharedCols.join(", ");
          await this.sql_conn.unsafe(`INSERT INTO "${schema}"."${tmpName}" (${colList}) SELECT ${colList} FROM "${schema}"."${oldTable}";`);
        }
      } catch (err: any) {
        console.warn("Data transfer during table redesign had warnings:", err.message);
      }

      await this.sql_conn.unsafe(`DROP TABLE "${schema}"."${oldTable}" CASCADE;`);
      await this.sql_conn.unsafe(`ALTER TABLE "${schema}"."${tmpName}" RENAME TO "${targetName}";`);

      await this.logAudit("REDESIGN_TABLE", targetName, `Redesigned table structure`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async renameTable(oldTable: string, newTable: string, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      await this.sql_conn.unsafe(`ALTER TABLE "${schema}"."${oldTable}" RENAME TO "${newTable}";`);
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
        sql = `DROP MATERIALIZED VIEW IF EXISTS "${schema}"."${name}" CASCADE;`;
      } else if (kind === "view") {
        sql = `DROP VIEW IF EXISTS "${schema}"."${name}" CASCADE;`;
      } else {
        sql = `DROP TABLE IF EXISTS "${schema}"."${name}" CASCADE;`;
      }
      await this.sql_conn.unsafe(sql);
      await this.logAudit("DROP", name, `Dropped ${kind}: ${name}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public async truncateTable(tableName: string, cascade: boolean = false, schemaName?: string): Promise<{ success: boolean; error?: string }> {
    const schema = schemaName || this.activeSchema || "public";
    try {
      const sql = `TRUNCATE TABLE "${schema}"."${tableName}" ${cascade ? "CASCADE" : "RESTRICT"};`;
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
        WHERE schemaname = '${schema}'
      `;
      if (tableName) {
        sql += ` AND tablename = '${tableName}'`;
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
      const safeCols = columns.map(c => `"${c}"`).join(", ");
      const uq = unique ? "UNIQUE " : "";
      const usingClause = indexType && indexType !== "btree" ? `USING ${indexType.toLowerCase()} ` : "";
      const sql = `CREATE ${uq}INDEX IF NOT EXISTS "${indexName}" ON "${schema}"."${tableName}" ${usingClause}(${safeCols});`;
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
      await this.sql_conn.unsafe(`DROP INDEX IF EXISTS "${schema}"."${indexName}";`);
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
        WHERE schemaname = '${schema}'
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
      await this.sql_conn.unsafe(`ALTER SEQUENCE "${schema}"."${seqName}" RESTART WITH ${Number(restartVal)};`);
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
        WHERE trigger_schema = '${schema}'
      `;
      if (tableName) sql += ` AND event_object_table = '${tableName}'`;
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
        WHERE routine_schema = '${schema}'
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
        WHERE schemaname = '${schema}'
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
        DROP MATERIALIZED VIEW IF EXISTS "${s}"."mv_daily_sales_analytics" CASCADE;
        DROP VIEW IF EXISTS "${s}"."v_order_details_extended" CASCADE;
        DROP VIEW IF EXISTS "${s}"."v_customer_order_summary" CASCADE;
        DROP VIEW IF EXISTS "${s}"."v_product_sales_performance" CASCADE;
        DROP VIEW IF EXISTS "${s}"."v_pending_shipments" CASCADE;
        DROP VIEW IF EXISTS "${s}"."v_vip_customer_analytics" CASCADE;
        DROP TABLE IF EXISTS "${s}"."order_items" CASCADE;
        DROP TABLE IF EXISTS "${s}"."orders" CASCADE;
        DROP TABLE IF EXISTS "${s}"."products" CASCADE;
        DROP TABLE IF EXISTS "${s}"."customers" CASCADE;
        DROP TABLE IF EXISTS "${s}"."audit_logs" CASCADE;
      `);

      // 3. Customers (with JSONB preferences)
      await this.sql_conn.unsafe(`
        CREATE TABLE "${s}"."customers" (
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
        CREATE TABLE "${s}"."products" (
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
        CREATE TABLE "${s}"."orders" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_number VARCHAR(30) NOT NULL UNIQUE,
          customer_id UUID REFERENCES "${s}"."customers"(id) ON DELETE RESTRICT,
          total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
          status VARCHAR(30) DEFAULT 'Pending',
          shipping_address JSONB DEFAULT '{"city": "San Francisco", "state": "CA", "country": "USA"}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 6. Order Items
      await this.sql_conn.unsafe(`
        CREATE TABLE "${s}"."order_items" (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id UUID REFERENCES "${s}"."orders"(id) ON DELETE CASCADE,
          product_id UUID REFERENCES "${s}"."products"(id) ON DELETE RESTRICT,
          quantity INT NOT NULL DEFAULT 1,
          unit_price NUMERIC(10,2) NOT NULL,
          line_total NUMERIC(10,2) NOT NULL
        );
      `);

      // 7. Audit Logs
      await this.sql_conn.unsafe(`
        CREATE TABLE "${s}"."audit_logs" (
          id BIGSERIAL PRIMARY KEY,
          action VARCHAR(50) NOT NULL,
          entity VARCHAR(100) NOT NULL,
          details JSONB DEFAULT '{}'::jsonb,
          timestamp TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // 8. Populate Data
      await this.sql_conn.unsafe(`
        INSERT INTO "${s}"."customers" (name, email, tier, preferences) VALUES
          ('Alice Johnson', 'alice.johnson@enterprise.io', 'VIP', '{"theme": "dark", "loyalty_pts": 1450, "priority_support": true}'::jsonb),
          ('Bob Smith', 'bob.smith@cloudtech.com', 'Standard', '{"theme": "light", "loyalty_pts": 320, "priority_support": false}'::jsonb),
          ('Carol Williams', 'carol.williams@fintech.org', 'VIP', '{"theme": "system", "loyalty_pts": 2890, "priority_support": true}'::jsonb),
          ('David Miller', 'david.miller@devops.net', 'Gold', '{"theme": "dark", "loyalty_pts": 950, "priority_support": false}'::jsonb),
          ('Elena Rostova', 'elena.rostova@quantum.ai', 'VIP', '{"theme": "dark", "loyalty_pts": 4120, "priority_support": true}'::jsonb);

        INSERT INTO "${s}"."products" (sku, name, category, price, stock, specs, tags) VALUES
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
          SELECT id INTO c_alice FROM "${s}"."customers" WHERE email = 'alice.johnson@enterprise.io';
          SELECT id INTO c_carol FROM "${s}"."customers" WHERE email = 'carol.williams@fintech.org';
          SELECT id INTO c_david FROM "${s}"."customers" WHERE email = 'david.miller@devops.net';
          SELECT id INTO c_elena FROM "${s}"."customers" WHERE email = 'elena.rostova@quantum.ai';

          SELECT id INTO p_epyc FROM "${s}"."products" WHERE sku = 'SRV-EPYC-01';
          SELECT id INTO p_gpu FROM "${s}"."products" WHERE sku = 'GPU-A100-80';
          SELECT id INTO p_ssd FROM "${s}"."products" WHERE sku = 'SSD-NVME-08';
          SELECT id INTO p_switch FROM "${s}"."products" WHERE sku = 'SW-400G-32';

          INSERT INTO "${s}"."orders" (order_number, customer_id, total_amount, status, shipping_address)
          VALUES ('ORD-2026-001', c_alice, 18298.98, 'Shipped', '{"city": "Austin", "state": "TX", "zip": "78701"}'::jsonb)
          RETURNING id INTO o1;

          INSERT INTO "${s}"."order_items" (order_id, product_id, quantity, unit_price, line_total) VALUES
            (o1, p_epyc, 2, 4299.99, 8599.98),
            (o1, p_ssd, 4, 849.50, 3398.00),
            (o1, p_gpu, 1, 6999.00, 6999.00);

          INSERT INTO "${s}"."orders" (order_number, customer_id, total_amount, status, shipping_address)
          VALUES ('ORD-2026-002', c_carol, 26499.00, 'Completed', '{"city": "New York", "state": "NY", "zip": "10005"}'::jsonb)
          RETURNING id INTO o2;

          INSERT INTO "${s}"."order_items" (order_id, product_id, quantity, unit_price, line_total) VALUES
            (o2, p_switch, 1, 12500.00, 12500.00),
            (o2, p_gpu, 2, 6999.00, 13998.00);

          INSERT INTO "${s}"."orders" (order_number, customer_id, total_amount, status, shipping_address)
          VALUES ('ORD-2026-003', c_elena, 20997.00, 'Processing', '{"city": "Seattle", "state": "WA", "zip": "98101"}'::jsonb)
          RETURNING id INTO o3;

          INSERT INTO "${s}"."order_items" (order_id, product_id, quantity, unit_price, line_total) VALUES
            (o3, p_gpu, 3, 6999.00, 20997.00);

          INSERT INTO "${s}"."orders" (order_number, customer_id, total_amount, status, shipping_address)
          VALUES ('ORD-2026-004', c_david, 5149.49, 'Pending', '{"city": "Denver", "state": "CO", "zip": "80202"}'::jsonb)
          RETURNING id INTO o4;

          INSERT INTO "${s}"."order_items" (order_id, product_id, quantity, unit_price, line_total) VALUES
            (o4, p_epyc, 1, 4299.99, 4299.99),
            (o4, p_ssd, 1, 849.50, 849.50);

          INSERT INTO "${s}"."audit_logs" (action, entity, details) VALUES
            ('SEED', 'SYSTEM', '{"event": "Starter dataset initialized", "tables": 5, "views": 5}'::jsonb),
            ('ORDER_PLACED', 'ORD-2026-001', '{"amount": 18298.98, "customer": "Alice Johnson"}'::jsonb),
            ('ORDER_PLACED', 'ORD-2026-002', '{"amount": 26499.00, "customer": "Carol Williams"}'::jsonb);
        END $$;
      `);

      // 9. Create Relational Views
      await this.sql_conn.unsafe(`
        CREATE OR REPLACE VIEW "${s}"."v_order_details_extended" AS
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
        FROM "${s}"."order_items" oi
        JOIN "${s}"."orders" o ON o.id = oi.order_id
        JOIN "${s}"."customers" c ON c.id = o.customer_id
        JOIN "${s}"."products" p ON p.id = oi.product_id;

        CREATE OR REPLACE VIEW "${s}"."v_customer_order_summary" AS
        SELECT 
          c.id AS customer_id,
          c.name,
          c.email,
          c.tier,
          COUNT(DISTINCT o.id) AS total_orders,
          COALESCE(SUM(o.total_amount), 0.00) AS total_spend
        FROM "${s}"."customers" c
        LEFT JOIN "${s}"."orders" o ON o.customer_id = c.id
        GROUP BY c.id, c.name, c.email, c.tier;

        CREATE OR REPLACE VIEW "${s}"."v_product_sales_performance" AS
        SELECT 
          p.id AS product_id,
          p.sku,
          p.name AS product_name,
          p.category,
          p.stock,
          COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
          COALESCE(SUM(oi.line_total), 0.00) AS gross_revenue
        FROM "${s}"."products" p
        LEFT JOIN "${s}"."order_items" oi ON oi.product_id = p.id
        GROUP BY p.id, p.sku, p.name, p.category, p.stock;

        CREATE OR REPLACE VIEW "${s}"."v_pending_shipments" AS
        SELECT 
          o.order_number,
          c.name AS customer_name,
          o.total_amount,
          o.status,
          o.shipping_address->>'city' as shipping_city,
          o.shipping_address->>'state' as shipping_state,
          o.created_at
        FROM "${s}"."orders" o
        JOIN "${s}"."customers" c ON c.id = o.customer_id
        WHERE o.status IN ('Pending', 'Processing');

        CREATE OR REPLACE VIEW "${s}"."v_vip_customer_analytics" AS
        SELECT 
          c.name,
          c.email,
          c.preferences->>'loyalty_pts' as loyalty_points,
          COUNT(o.id) as completed_orders,
          SUM(o.total_amount) as total_vip_revenue
        FROM "${s}"."customers" c
        JOIN "${s}"."orders" o ON o.customer_id = c.id
        WHERE c.tier = 'VIP'
        GROUP BY c.name, c.email, c.preferences;
      `);

      // 10. PostgreSQL Materialized View (Specialty Feature!)
      await this.sql_conn.unsafe(`
        CREATE MATERIALIZED VIEW "${s}"."mv_daily_sales_analytics" AS
        SELECT 
          DATE_TRUNC('day', o.created_at)::date AS sales_date,
          COUNT(DISTINCT o.id) AS orders_count,
          SUM(o.total_amount) AS revenue,
          AVG(o.total_amount) AS average_order_value
        FROM "${s}"."orders" o
        GROUP BY DATE_TRUNC('day', o.created_at)::date;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_sales_date ON "${s}"."mv_daily_sales_analytics" (sales_date);
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
        `INSERT INTO "${this.activeSchema}"."audit_logs" (action, entity, details) VALUES ($1, $2, $3::jsonb);`,
        [action, entity, JSON.stringify({ message: details })]
      );
    } catch {}
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

      // 6. Live Activity & Process Monitor API (Postgres Specialty)
      if (url.pathname === "/api/activity" && req.method === "GET") {
        try {
          const activity = await manager.getActivity();
          return Response.json({ success: true, activity }, { headers: corsHeaders });
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
