/**
 * ⚡ Bun RAD Studio - MySQL Studio Pro Server Engine
 * 
 * High-performance background HTTP telemetry & database engine for MySQL Studio Pro.
 * Runs on a dedicated OS thread (via Bun Worker) or standalone web server, providing
 * sub-millisecond query execution, schema reflection, and live database telemetry
 * using Bun's native high-performance SQL client.
 */

import { guardLocalRequest, writeClipboardSync } from "../src/localGuard";
import { getSharedWorkbench } from "../src/db/workbench_shared";
import { mysqlStaging } from "../src/db/staging/mount";
import { viewApi } from "../src/shared/studioViews";
import {
  formatSqlDialect,
  buildColumnFilterWhere,
  buildOrderClause,
  computeSchemaDiffDdl,
  type SortColumnSpec,
} from "../src/shared/studioServerEnhancements";
import { splitStatements } from "../src/db/splitter";
import { SQL } from "bun";

/** Passes connection options through unchanged. Bun's `SQL` type definitions omit `allowPublicKeyRetrieval`, which this file has always sent. */
function mysqlOptions<const T extends object>(options: T): T {
  return options;
}
import { resolve, basename } from "path";
import { existsSync, statSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { generateMysqlStudioHtml } from "./mysql_studio.ts";
import { MacroStore, handleMacroRoute, type MacroAdapter, type MacroQueryResult } from "./studio_macros_server.ts";
import { mysqlSampleApi } from "../src/db/samples/wiring";

export interface ServerOptions {
  port?: number;
  host?: string;
  initialDbPath?: string;
  config?: Partial<MysqlConnectionConfig>;
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
  mysqlVersion: string;
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

/** Quote a MySQL string literal: backslashes and quotes are escaped (MySQL treats backslash as an escape character). */
function ml(value: unknown): string {
  return "'" + String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
}

/** Quote a MySQL identifier with backticks. */
function qm(name: string): string {
  const s = String(name ?? "").trim();
  if (!s || s.includes("\0")) throw new Error("Invalid or empty identifier");
  return `\`${s.replace(/`/g, "``")}\``;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function downloadsDir(): string {
  const d = resolve(homedir(), "Downloads");
  try { mkdirSync(d, { recursive: true }); } catch {}
  return existsSync(d) ? d : process.cwd();
}

export function pickNativeDataFile(title = "Select data file to import"): string | null {
  try {
    if (process.platform === "darwin") {
      const script = `try\nPOSIX path of (choose file with prompt "${title.replace(/"/g, "")}")\non error\nreturn ""\nend try`;
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

export function pickNativeDatabaseFile(): string | null {
  return null; // Remote MySQL uses host/database selection
}

export interface MysqlConnectionConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  tls?: boolean;
  url?: string;
}

export interface MysqlConnectionConfigSanitized {
  host: string;
  port: number;
  user: string;
  database: string;
  tls: boolean;
  hasPassword: boolean;
  source: "env" | "manual";
}

export interface MysqlEnumMeta {
  name: string;
  table: string;
  column: string;
  type: string;
  values: string[];
  schema: string;
}

export interface MysqlPartitionMeta {
  parentTable: string;
  parentSchema: string;
  partitionStrategy: string;
  partitionName: string;
  subpartitionName?: string | null;
  partitionExpression: string;
  totalSize: string;
  rowEstimate: number;
}

export interface MysqlReplicationMeta {
  replicas: any[];
  binaryLogs: { logName: string; fileSize: string }[];
  masterStatus: any;
  replicaHosts: any[];
}

export interface MysqlBlockedLockMeta {
  waitingTrxId: string;
  waitingPid: number;
  waitingQuery: string;
  blockingTrxId: string;
  blockingPid: number;
  blockingQuery: string;
  waitAgeSeconds: number;
  lockMode: string;
}

// -------------------------------------------------------------------------------------------------
// MySQL Database Manager
// -------------------------------------------------------------------------------------------------

export class MysqlManager {
  public sql_conn: any;
  public activePath: string;
  public isMemory: boolean = false;
  public configSource: "env" | "manual" = "env";
  public dbConfig!: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    tls?: boolean;
  };

  constructor(initialDbOrConfig: string | Partial<MysqlConnectionConfig> = "", initialConfig?: Partial<MysqlConnectionConfig>) {
    this.loadEnvFile();
    let initialDb = "";
    let cfg = initialConfig;
    if (typeof initialDbOrConfig === "object" && initialDbOrConfig !== null) {
      cfg = initialDbOrConfig;
      initialDb = cfg.database || "";
    } else if (typeof initialDbOrConfig === "string") {
      initialDb = initialDbOrConfig;
    }
    this.activePath = initialDb 
      || cfg?.database 
      || process.env.MSQL_NAME 
      || process.env.MSQL_DATABASE 
      || process.env.MSQL_DB 
      || process.env.MYSQL_DATABASE 
      || process.env.DB_NAME 
      || "my_app_dev";
    this.parseConfig(initialDb, cfg);
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

  private parseConfig(overrideDb: string = "", customConfig?: Partial<MysqlConnectionConfig>) {
    this.loadEnvFile();

    let host = customConfig?.host 
      || process.env.MSQL_HOST 
      || process.env.MYSQL_HOST 
      || process.env.DB_HOST 
      || "localhost";
    let port = customConfig?.port 
      ? Number(customConfig.port) 
      : (Number(process.env.MSQL_PORT || process.env.MYSQL_PORT || process.env.DB_PORT) || 3306);
    let user = customConfig?.user 
      || process.env.MSQL_USER 
      || process.env.MYSQL_USER 
      || process.env.DB_USER 
      || "root";
    let password = customConfig?.password !== undefined 
      ? customConfig.password 
      : (process.env.MSQL_PASSWORD !== undefined 
          ? process.env.MSQL_PASSWORD 
          : (process.env.MYSQL_PASSWORD !== undefined ? process.env.MYSQL_PASSWORD : (process.env.DB_PASSWORD || "")));
    if (overrideDb === ":memory:") overrideDb = "";
    if (process.env.MYSQL_DB_PATH === ":memory:") delete process.env.MYSQL_DB_PATH;
    if (process.env.MYSQL_STUDIO_DB === ":memory:") delete process.env.MYSQL_STUDIO_DB;

    let database = customConfig?.database 
      || (overrideDb && overrideDb !== ":memory:" ? overrideDb : "")
      || process.env.MSQL_NAME 
      || process.env.MYSQL_DATABASE 
      || process.env.MSQL_DB 
      || (process.env.MYSQL_DB_PATH && process.env.MYSQL_DB_PATH !== ":memory:" ? process.env.MYSQL_DB_PATH : "")
      || process.env.DB_NAME 
      || "my_app_dev";
    let tls = customConfig?.tls !== undefined 
      ? Boolean(customConfig.tls) 
      : (process.env.MSQL_TLS === "1" || process.env.MSQL_TLS === "true" || process.env.MYSQL_TLS === "1" || process.env.MYSQL_TLS === "true");

    const urlCandidate = customConfig?.url || process.env.MSQL_URL || process.env.DATABASE_URL;
    if (urlCandidate) {
      try {
        const u = new URL(urlCandidate.replace(/^mysql:\/\//i, "http://"));
        if (u.hostname) host = u.hostname;
        if (u.port) port = Number(u.port);
        if (u.username) user = decodeURIComponent(u.username);
        if (u.password) password = decodeURIComponent(u.password);
        if (u.pathname && u.pathname.length > 1 && !overrideDb && !customConfig?.database) {
          database = decodeURIComponent(u.pathname.slice(1));
        }
        if (u.searchParams.get("tls") === "true" || u.searchParams.get("ssl") === "true") {
          tls = true;
        }
      } catch {}
    }

    if (customConfig && Object.keys(customConfig).length > 0) {
      this.configSource = "manual";
    }

    this.dbConfig = { host, port, user, password, database, tls };
    this.activePath = database;
  }

  public getConfig(): MysqlConnectionConfigSanitized {
    return {
      host: this.dbConfig.host,
      port: this.dbConfig.port,
      user: this.dbConfig.user,
      database: this.dbConfig.database,
      tls: Boolean(this.dbConfig.tls),
      hasPassword: Boolean(this.dbConfig.password),
      source: this.configSource,
    };
  }

  public initConnection() {
    try {
      this.sql_conn = new SQL(mysqlOptions({
        adapter: "mysql",
        hostname: this.dbConfig.host,
        port: this.dbConfig.port,
        username: this.dbConfig.user,
        password: this.dbConfig.password,
        database: this.dbConfig.database,
        allowPublicKeyRetrieval: true,
        tls: this.dbConfig.tls ?? false,
      }));
      // Enable ANSI_QUOTES in session mode to guarantee compatibility with both ANSI quotes and backticks
      this.sql_conn.unsafe("SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'ANSI_QUOTES');").catch(() => {});
    } catch (e: any) {
      console.error("Failed to initialize MySQL connection:", e);
    }
  }

  public async testConnection(candidateConfig?: Partial<MysqlConnectionConfig>): Promise<{
    success: boolean;
    latencyMs: number;
    version?: string;
    databases?: string[];
    error?: string;
  }> {
    let host = candidateConfig?.host || this.dbConfig.host || "localhost";
    let port = Number(candidateConfig?.port || this.dbConfig.port || 3306);
    let user = candidateConfig?.user || this.dbConfig.user || "root";
    let password = candidateConfig?.password !== undefined ? candidateConfig.password : this.dbConfig.password;
    let database = candidateConfig?.database !== undefined ? candidateConfig.database : this.dbConfig.database;
    let tls = candidateConfig?.tls ?? this.dbConfig.tls ?? false;

    if (candidateConfig?.url) {
      try {
        const u = new URL(candidateConfig.url);
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
      const testConn = new SQL(mysqlOptions({
        adapter: "mysql",
        hostname: host,
        port: port,
        username: user,
        password: password,
        database: database || undefined,
        allowPublicKeyRetrieval: true,
        tls: tls,
      }));

      const versionRows = await testConn.unsafe("SELECT VERSION() as ver;");
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      const version = String(versionRows?.[0]?.ver || versionRows?.[0]?.VER || "MySQL 8.x");

      let databases: string[] = [];
      try {
        const dbRows = await testConn.unsafe("SHOW DATABASES;");
        databases = (dbRows || []).map((r: any) => String(r.Database || r.database || "")).filter(Boolean);
      } catch {}

      await testConn.end?.().catch(() => {});
      return { success: true, latencyMs, version, databases };
    } catch (err: any) {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      return { success: false, latencyMs, error: err?.message || String(err) };
    }
  }

  public async updateConfig(newConfig: MysqlConnectionConfig): Promise<{
    success: boolean;
    config: MysqlConnectionConfigSanitized;
    error?: string;
    version?: string;
    databases?: string[];
  }> {
    let host = (newConfig.host ?? this.dbConfig.host ?? "localhost").trim();
    let port = Number(newConfig.port ?? this.dbConfig.port ?? 3306);
    let user = (newConfig.user ?? this.dbConfig.user ?? "root").trim();
    let password = newConfig.password !== undefined ? newConfig.password : this.dbConfig.password;
    let database = (newConfig.database ?? this.dbConfig.database ?? "my_app_dev").trim();
    let tls = newConfig.tls ?? this.dbConfig.tls ?? false;

    if (newConfig.url) {
      try {
        const u = new URL(newConfig.url);
        if (u.hostname) host = u.hostname;
        if (u.port) port = Number(u.port);
        if (u.username) user = decodeURIComponent(u.username);
        if (u.password) password = decodeURIComponent(u.password);
        if (u.pathname && u.pathname.length > 1) {
          database = decodeURIComponent(u.pathname.slice(1));
        }
      } catch (err: any) {
        return { success: false, config: this.getConfig(), error: `Invalid connection URL: ${err.message}` };
      }
    }

    const test = await this.testConnection({ host, port, user, password, database, tls });
    if (!test.success) {
      return {
        success: false,
        config: this.getConfig(),
        error: test.error || "Failed to connect to MySQL server",
      };
    }

    try { await this.sql_conn?.end?.(); } catch {}

    this.dbConfig = { host, port, user, password, database, tls };
    this.activePath = database;
    this.configSource = "manual";
    this.initConnection();

    if (database) {
      await this.ensureDatabaseExists(database).catch(() => {});
    }

    await this.logAudit("DB_CONFIG", "SYSTEM", `Updated manual MySQL connection: ${user}@${host}:${port}/${database}`);

    return {
      success: true,
      config: this.getConfig(),
      version: test.version,
      databases: test.databases,
    };
  }

  public resetToEnv(): { success: boolean; config: MysqlConnectionConfigSanitized } {
    try { this.sql_conn?.end?.(); } catch {}
    this.configSource = "env";
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
      await this.ensureDatabaseExists(clean);
      return { success: true, database: clean, name: clean };
    } catch (err: any) {
      return { success: false, database: dbName, name: dbName, error: err?.message || String(err) };
    }
  }

  public async ensureDatabaseExists(dbName?: string | any): Promise<void> {
    try {
      const db = (typeof dbName === "string" ? dbName : this.dbConfig?.database) || "my_app_dev";
      const rootSql = new SQL(mysqlOptions({
        adapter: "mysql",
        hostname: this.dbConfig.host,
        port: this.dbConfig.port,
        username: this.dbConfig.user,
        password: this.dbConfig.password,
        allowPublicKeyRetrieval: true,
        tls: this.dbConfig.tls ?? false,
      }));
      await rootSql.unsafe(`CREATE DATABASE IF NOT EXISTS \`${db.replace(/`/g, "``")}\``);
      await rootSql.end?.().catch(() => {});
    } catch (err: any) {
      console.warn("ensureDatabaseExists warning:", err?.message || err);
    }
  }

  public async connect(newDb: string): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      const targetDb = (newDb || "").trim() || "my_app_dev";
      await this.ensureDatabaseExists(targetDb);
      this.dbConfig.database = targetDb;
      this.activePath = targetDb;
      this.initConnection();
      await this.logAudit("DB_CONNECT", "SYSTEM", `Switched connection to database: ${targetDb}`);
      return { success: true, path: targetDb };
    } catch (err: any) {
      return { success: false, path: newDb, error: err?.message || String(err) };
    }
  }

  public async getWorkspaceDatabases(): Promise<{ name: string; path: string; sizeFormatted: string; isCurrent?: boolean }[]> {
    try {
      const rows = await this.sql_conn.unsafe("SHOW DATABASES;");
      const dbs: { name: string; path: string; sizeFormatted: string; isCurrent?: boolean }[] = [];
      for (const r of rows) {
        const name = r.Database || r.database;
        if (!name) continue;
        dbs.push({
          name: `MySQL: ${name}`,
          path: name,
          sizeFormatted: name === this.dbConfig.database ? "Active" : "Available",
          isCurrent: name === this.dbConfig.database,
        });
      }
      return dbs;
    } catch {
      return [
        {
          name: `MySQL: ${this.dbConfig.database}`,
          path: this.dbConfig.database,
          sizeFormatted: "Active",
          isCurrent: true,
        },
      ];
    }
  }

  public async getKpis(): Promise<DatabaseKpis> {
    const dbName = this.dbConfig.database;
    try {
      let version = "MySQL 8.x";
      try {
        const vRes = await this.sql_conn.unsafe("SELECT VERSION() as ver;");
        if (vRes && (vRes[0]?.ver || vRes[0]?.VER)) version = String(vRes[0].ver || vRes[0].VER);
      } catch {}

      const sizeRes = await this.sql_conn.unsafe(
        "SELECT sum(data_length + index_length) as size FROM information_schema.tables WHERE table_schema = ?",
        [dbName]
      );
      const sizeBytes = Number(sizeRes[0]?.size || sizeRes[0]?.SIZE || 0);

      const tablesRes = await this.sql_conn.unsafe(
        "SELECT count(*) as c FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
        [dbName]
      );
      const viewsRes = await this.sql_conn.unsafe(
        "SELECT count(*) as c FROM information_schema.tables WHERE table_schema = ? AND table_type = 'VIEW'",
        [dbName]
      );

      const rowsRes = await this.sql_conn.unsafe(
        "SELECT sum(table_rows) as total_rows FROM information_schema.tables WHERE table_schema = ?",
        [dbName]
      );

      return {
        dbPath: `${this.dbConfig.user}@${this.dbConfig.host}:${this.dbConfig.port}/${dbName}`,
        dbName,
        isMemory: false,
        fileSizeBytes: sizeBytes,
        fileSizeFormatted: formatBytes(sizeBytes),
        pageSize: 16384,
        pageCount: Math.ceil(sizeBytes / 16384),
        freelistCount: 0,
        journalMode: "InnoDB",
        walMode: true,
        foreignKeys: true,
        tableCount: Number(tablesRes[0]?.c || tablesRes[0]?.C || 0),
        viewCount: Number(viewsRes[0]?.c || viewsRes[0]?.C || 0),
        indexCount: 0,
        totalRows: Number(rowsRes[0]?.total_rows || rowsRes[0]?.TOTAL_ROWS || 0),
        cacheSizeKb: 131072,
        mysqlVersion: version,
      };
    } catch {
      return {
        dbPath: `${this.dbConfig.host}/${dbName}`,
        dbName,
        isMemory: false,
        fileSizeBytes: 0,
        fileSizeFormatted: "0 B",
        pageSize: 16384,
        pageCount: 0,
        freelistCount: 0,
        journalMode: "InnoDB",
        walMode: true,
        foreignKeys: true,
        tableCount: 0,
        viewCount: 0,
        indexCount: 0,
        totalRows: 0,
        cacheSizeKb: 0,
        mysqlVersion: "MySQL",
      };
    }
  }

  public async getSchema(): Promise<DatabaseSchemaResponse> {
    const dbName = this.dbConfig.database;
    const tablesMeta: TableSchemaMeta[] = [];
    const viewsMeta: TableSchemaMeta[] = [];
    let totalIndices = 0;
    let totalRows = 0;

    try {
      const items = await this.sql_conn.unsafe(
        "SELECT table_name, table_type, table_rows FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
        [dbName]
      );

      for (const item of items) {
        const typeVal = String(item.TABLE_TYPE || item.table_type || "");
        const isTable = typeVal === "BASE TABLE";
        const tname = String(item.TABLE_NAME || item.table_name || "");
        if (!tname) continue;

        // Columns
        const cols = await this.sql_conn.unsafe(
          "SELECT column_name, data_type, is_nullable, column_default, column_key FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
          [dbName, tname]
        );

        const columns: TableColumnMeta[] = cols.map((c: any, i: number) => {
          const colName = c.COLUMN_NAME || c.column_name;
          const dataType = c.DATA_TYPE || c.data_type || "text";
          const isNullable = c.IS_NULLABLE || c.is_nullable;
          const colDefault = c.COLUMN_DEFAULT ?? c.column_default;
          const colKey = c.COLUMN_KEY || c.column_key;
          return {
            cid: i,
            name: colName,
            type: dataType,
            notnull: isNullable === "NO",
            dflt_value: colDefault,
            pk: colKey === "PRI",
          };
        });

        // Indices
        const idxRes = await this.sql_conn.unsafe(
          "SELECT index_name, non_unique, column_name FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? ORDER BY seq_in_index",
          [dbName, tname]
        );
        const idxMap = new Map<string, { name: string; unique: boolean; origin: string; columns: string[] }>();
        for (const idx of idxRes) {
          const iname = idx.INDEX_NAME || idx.index_name;
          const nonUniq = idx.NON_UNIQUE ?? idx.non_unique;
          const cname = idx.COLUMN_NAME || idx.column_name;
          if (!idxMap.has(iname)) {
            idxMap.set(iname, {
              name: iname,
              unique: Number(nonUniq) === 0,
              origin: iname === "PRIMARY" ? "pk" : "c",
              columns: [],
            });
          }
          idxMap.get(iname)!.columns.push(cname);
        }
        const indices = Array.from(idxMap.values());
        totalIndices += indices.length;

        // Foreign keys
        const fkRes = await this.sql_conn.unsafe(
          `SELECT constraint_name, column_name, referenced_table_name, referenced_column_name 
           FROM information_schema.key_column_usage 
           WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
          [dbName, tname]
        );
        const foreignKeys = fkRes.map((fk: any, i: number) => ({
          id: i,
          seq: 0,
          table: fk.REFERENCED_TABLE_NAME || fk.referenced_table_name,
          from: fk.COLUMN_NAME || fk.column_name,
          to: fk.REFERENCED_COLUMN_NAME || fk.referenced_column_name,
        }));

        // DDL
        let createSql = "";
        try {
          const ddlRes = await this.sql_conn.unsafe(isTable ? `SHOW CREATE TABLE ${qm(tname)}` : `SHOW CREATE VIEW ${qm(tname)}`);
          createSql = ddlRes[0]?.["Create Table"] || ddlRes[0]?.["Create View"] || "";
        } catch {}

        // information_schema's TABLE_ROWS is only an estimate (and MySQL caches it for a day), so a table that was just filled
        // can show 0 and one that was emptied can still show rows. Count the small and medium tables for real.
        let rowCount = Number(item.TABLE_ROWS ?? item.table_rows ?? 0);
        if (isTable && rowCount <= 100000) {
          try {
            const exact = await this.sql_conn.unsafe(`SELECT COUNT(*) AS c FROM (SELECT 1 FROM ${qm(tname)} LIMIT 100001) AS t`);
            rowCount = Number(exact?.[0]?.c ?? exact?.[0]?.C ?? rowCount);
          } catch {}
        }
        totalRows += rowCount;

        const meta: TableSchemaMeta = {
          name: tname,
          type: isTable ? "table" : "view",
          sql: createSql,
          rowCount,
          columns,
          indices,
          foreignKeys,
        };

        if (isTable) tablesMeta.push(meta);
        else viewsMeta.push(meta);
      }
    } catch (e: any) {
      console.warn("getSchema error:", e?.message || e);
    }

    return {
      dbPath: `${this.dbConfig.host}/${dbName}`,
      dbName,
      isMemory: false,
      tables: tablesMeta,
      views: viewsMeta,
      totalTables: tablesMeta.length,
      totalViews: viewsMeta.length,
      totalIndices,
      totalRows,
    };
  }

  /** Create / check / edit / drop a view (see src/shared/studioViews.ts). MySQL DDL commits by itself, so there is no transaction. */
  public async viewOp(op: "check" | "create" | "definition" | "drop", body: any) {
    const run = async (s: string) => {
      const r = await this.sql_conn.unsafe(s);
      return (Array.isArray(r) ? r : []) as any[];
    };
    const res = await viewApi(op, body, {
      dialect: "mysql",
      run,
      tx: async (fn: (r: typeof run) => Promise<void>) => { await fn(run); },
      rollbackProbe: async () => {},
    });
    if (res.success && (op === "create" || op === "drop")) await this.logAudit(op === "drop" ? "DROP_VIEW" : "CREATE_VIEW", String(body.name), String(res.ddl || "").replace(/\s+/g, " ").slice(0, 150));
    return res;
  }

  public async query(sqlStr: string, params: any[] = []): Promise<any> {
    const trimmed = (sqlStr || "").trim();
    if (!trimmed) return { success: false, error: "Query statement is empty" };

    const t0 = performance.now();
    try {
      const isRead = /^\s*(SELECT|SHOW|EXPLAIN|DESCRIBE|WITH)/i.test(trimmed);
      const rows = await this.sql_conn.unsafe(trimmed, params);
      const latencyMs = Number((performance.now() - t0).toFixed(2));

      if (isRead) {
        const rowsArr = Array.isArray(rows) ? rows : [];
        const columns = rowsArr.length > 0 ? Object.keys(rowsArr[0]) : [];
        await this.logAudit("SELECT", "QUERY", trimmed.slice(0, 150));
        return {
          success: true,
          rows: rowsArr,
          columns,
          rowCount: rowsArr.length,
          latencyMs,
        };
      } else {
        await this.logAudit("MUTATION", "STATEMENT", trimmed.slice(0, 150));
        return {
          success: true,
          rows: [],
          columns: [],
          rowsAffected: rows?.affectedRows ?? 0,
          lastInsertRowid: rows?.lastInsertRowid ?? 0,
          latencyMs,
        };
      }
    } catch (err: any) {
      if (err?.message?.includes("right syntax to use near '\"") || err?.message?.includes('right syntax to use near \'"')) {
        try {
          await this.sql_conn.unsafe("SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'ANSI_QUOTES');");
          const retryRows = await this.sql_conn.unsafe(trimmed, params);
          const latencyMs = Number((performance.now() - t0).toFixed(2));
          const isRead = /^\s*(SELECT|SHOW|EXPLAIN|DESCRIBE|WITH)/i.test(trimmed);
          if (isRead) {
            const rowsArr = Array.isArray(retryRows) ? retryRows : [];
            const columns = rowsArr.length > 0 ? Object.keys(rowsArr[0]) : [];
            await this.logAudit("SELECT", "QUERY", trimmed.slice(0, 150));
            return {
              success: true,
              rows: rowsArr,
              columns,
              rowCount: rowsArr.length,
              latencyMs,
            };
          } else {
            await this.logAudit("MUTATION", "STATEMENT", trimmed.slice(0, 150));
            return {
              success: true,
              rows: [],
              columns: [],
              rowsAffected: retryRows?.affectedRows ?? 0,
              lastInsertRowid: retryRows?.lastInsertRowid ?? 0,
              latencyMs,
            };
          }
        } catch {}
      }
      const latencyMs = Number((performance.now() - t0).toFixed(2));
      return { success: false, latencyMs, error: err?.message || String(err) };
    }
  }

  public async explain(sqlStr: string): Promise<any> {
    const trimmed = (sqlStr || "").trim();
    if (!trimmed) return { success: false, error: "SQL statement is required for explain" };

    const t0 = performance.now();
    try {
      const cleanSql = trimmed.replace(/^EXPLAIN\s+(ANALYZE\s+|FORMAT\s*=\s*\w+\s+)?/i, "").replace(/;+\s*$/, "").trim();
      const isSelect = /^\s*SELECT\b/i.test(cleanSql);

      let explainRows: any[] = [];
      let rawText = "";

      // 1. Try modern EXPLAIN ANALYZE for SELECTs (provides actual execution timing)
      if (isSelect) {
        try {
          explainRows = await this.sql_conn.unsafe(`EXPLAIN ANALYZE ${cleanSql}`);
          if (explainRows?.[0]?.EXPLAIN) {
            rawText = String(explainRows[0].EXPLAIN).trim();
          }
        } catch (e: any) {
          if (e?.message?.includes("right syntax to use near '\"") || e?.message?.includes('right syntax to use near \'"')) {
            await this.sql_conn.unsafe("SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'ANSI_QUOTES');").catch(() => {});
            try {
              explainRows = await this.sql_conn.unsafe(`EXPLAIN ANALYZE ${cleanSql}`);
              if (explainRows?.[0]?.EXPLAIN) {
                rawText = String(explainRows[0].EXPLAIN).trim();
              }
            } catch {
              explainRows = [];
            }
          } else {
            explainRows = [];
          }
        }
      }

      // 2. Fall back to EXPLAIN FORMAT=TREE (supported in MySQL 8.0.16+)
      if (!rawText) {
        try {
          explainRows = await this.sql_conn.unsafe(`EXPLAIN FORMAT=TREE ${cleanSql}`);
          if (explainRows?.[0]?.EXPLAIN) {
            rawText = String(explainRows[0].EXPLAIN).trim();
          }
        } catch {
          explainRows = [];
        }
      }

      // 3. Fall back to standard tabular EXPLAIN
      if (!rawText) {
        try {
          explainRows = await this.sql_conn.unsafe(`EXPLAIN ${cleanSql}`);
        } catch (explainErr: any) {
          if (explainErr?.message?.includes("right syntax to use near '\"") || explainErr?.message?.includes('right syntax to use near \'"')) {
            try {
              await this.sql_conn.unsafe("SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'ANSI_QUOTES');");
              explainRows = await this.sql_conn.unsafe(`EXPLAIN ${cleanSql}`);
            } catch (retryErr: any) {
              return { success: false, error: retryErr?.message || "Explain execution failed" };
            }
          } else {
            return { success: false, error: explainErr?.message || "Explain execution failed" };
          }
        }
      }

      const latencyMs = Number((performance.now() - t0).toFixed(2));

      // Parse structured queryPlan nodes
      const queryPlan: Array<{
        id: number;
        parent: number;
        depth: number;
        detail: string;
        isScan: boolean;
        isIndex: boolean;
        cost?: number;
        rows?: number;
        actualTime?: string;
      }> = [];

      if (rawText) {
        // Parse tree text output
        const lines = rawText.split("\n").filter(l => l.trim().length > 0);
        const stack: Array<{ id: number; indent: number }> = [];

        lines.forEach((line, idx) => {
          const id = idx + 1;
          const trimmedLine = line.trim();
          const cleanDetail = trimmedLine.replace(/^->\s*/, "");
          const indent = line.search(/\S/);

          while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
            stack.pop();
          }
          const parent = stack.length > 0 ? stack[stack.length - 1]!.id : 0;
          stack.push({ id, indent });

          const isScan = /table\s+scan/i.test(cleanDetail) || /full\s+scan/i.test(cleanDetail);
          const isIndex = /index/i.test(cleanDetail) || /key/i.test(cleanDetail);

          // Extract cost & rows: (cost=X rows=Y)
          const costMatch = cleanDetail.match(/cost=([\d.]+)/i);
          const rowsMatch = cleanDetail.match(/rows=([\d.]+)/i);
          const timeMatch = cleanDetail.match(/actual\s+time=([\d.]+)\.\.([\d.]+)/i);

          const cost = costMatch ? parseFloat(costMatch[1]!) : undefined;
          const rows = rowsMatch ? parseFloat(rowsMatch[1]!) : undefined;
          const actualTime = timeMatch ? `${timeMatch[1]}..${timeMatch[2]}ms` : undefined;

          queryPlan.push({
            id,
            parent,
            depth: stack.length - 1,
            detail: cleanDetail,
            isScan,
            isIndex,
            cost,
            rows,
            actualTime,
          });
        });
      } else {
        // Parse legacy tabular rows
        (explainRows || []).forEach((row: any, i: number) => {
          const table = row.table || "";
          const type = row.type || "";
          const key = row.key || "NONE";
          const rows = Number(row.rows || 0);
          const extra = row.Extra || "";
          const isScan = type === "ALL";
          const isIndex = type.includes("index") || key !== "NONE";

          queryPlan.push({
            id: i + 1,
            parent: 0,
            depth: 0,
            detail: `Table: ${table} | Type: ${type} | Key: ${key} | Estimated Rows: ${rows}${extra ? ` (${extra})` : ""}`,
            isScan,
            isIndex,
            rows,
          });
        });

        rawText = queryPlan.map(n => `[Node #${n.id}] ${n.detail}`).join("\n");
      }

      return {
        success: true,
        queryPlan,
        rawPlan: explainRows,
        rawText,
        latencyMs,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async getTableData(
    table: string,
    options: {
      page?: number;
      pageSize?: number;
      orderBy?: string;
      orderDir?: "ASC" | "DESC";
      sortColumns?: SortColumnSpec[];
      search?: string;
      columnFilters?: Record<string, string>;
    } = {}
  ): Promise<any> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(500, Math.max(1, options.pageSize || 25));
    const offset = (page - 1) * pageSize;
    const dbName = this.dbConfig.database;
    const t0 = performance.now();

    try {
      const escapedTable = qm(table);

      // Columns metadata
      const cols = await this.sql_conn.unsafe(
        "SELECT column_name, column_key FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
        [dbName, table]
      );
      const columns = cols.map((c: any) => c.COLUMN_NAME || c.column_name);
      const pkColumns = cols.filter((c: any) => (c.COLUMN_KEY || c.column_key) === "PRI").map((c: any) => c.COLUMN_NAME || c.column_name);

      const whereParts: string[] = [];
      const params: any[] = [];
      if (options.search && options.search.trim() && columns.length > 0) {
        const searchVal = `%${options.search.trim()}%`;
        const conditions = columns.map((col: string) => `${qm(col)} LIKE ?`);
        whereParts.push(`(${conditions.join(" OR ")})`);
        columns.forEach(() => params.push(searchVal));
      }
      if (options.columnFilters && typeof options.columnFilters === "object") {
        const colFilter = buildColumnFilterWhere(options.columnFilters, columns, "mysql");
        if (colFilter.clauses.length > 0) {
          whereParts.push(...colFilter.clauses);
          params.push(...colFilter.params);
        }
      }
      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

      const orderClause = buildOrderClause(columns, "mysql", {
        sortColumns: options.sortColumns,
        orderBy: options.orderBy,
        orderDir: options.orderDir,
        defaultPkColumn: pkColumns[0],
      });

      const countSql = `SELECT count(*) as total FROM ${escapedTable} ${whereClause}`;
      const countRes = await this.sql_conn.unsafe(countSql, params);
      const totalRows = Number(countRes[0]?.total ?? countRes[0]?.TOTAL ?? 0);

      const dataParams = [...params, pageSize, offset];
      const dataSql = `SELECT * FROM ${escapedTable} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
      const rows = await this.sql_conn.unsafe(dataSql, dataParams);

      const rowsWithRowid = rows.map((r: any, i: number) => {
        const out = { ...r };
        out.__rowid__ = pkColumns.length ? pkColumns.map((pk: string) => r[pk]).join("||") : `row_${offset + i}`;
        return out;
      });

      return {
        success: true,
        table,
        rows: rowsWithRowid,
        columns,
        totalRows,
        total: totalRows,
        page,
        pageSize,
        totalPages: Math.ceil(totalRows / pageSize) || 1,
        latencyMs: Number((performance.now() - t0).toFixed(2)),
        editable: pkColumns.length > 0,
        isView: false,
        pkColumns,
      };
    } catch (err: any) {
      return { success: false, table, error: err?.message || String(err) };
    }
  }

  public async mutateRow(
    table: string,
    action: "insert" | "update" | "delete",
    payload: { rowId?: any; rowIds?: any[]; pkColumn?: string; data?: Record<string, any> }
  ): Promise<{ success: boolean; rowsAffected?: number; lastInsertRowid?: number; error?: string }> {
    try {
      const dbName = this.dbConfig.database;
      const escapedTable = qm(table);

      // Verify columns
      const cols = await this.sql_conn.unsafe(
        "SELECT column_name, column_key FROM information_schema.columns WHERE table_schema = ? AND table_name = ?",
        [dbName, table]
      );
      const validCols = new Set(cols.map((c: any) => c.COLUMN_NAME || c.column_name));
      const pkCol = payload.pkColumn || cols.find((c: any) => (c.COLUMN_KEY || c.column_key) === "PRI")?.COLUMN_NAME || "id";

      if (action === "delete") {
        const ids = payload.rowIds ?? (payload.rowId !== undefined ? [payload.rowId] : []);
        if (ids.length === 0) throw new Error("rowId is required for deletion");
        let changes = 0;
        for (const id of ids) {
          const res = await this.sql_conn.unsafe(`DELETE FROM ${escapedTable} WHERE ${qm(pkCol)} = ?`, [id]);
          changes += res?.affectedRows ?? 0;
        }
        await this.logAudit("DELETE", table, `Deleted ${changes} row(s)`);
        return { success: true, rowsAffected: changes };
      }

      if (action === "update") {
        if (payload.rowId === undefined || !payload.data) throw new Error("rowId and data required for update");
        const entries = Object.entries(payload.data).filter(([k]) => k !== pkCol && validCols.has(k));
        if (entries.length === 0) return { success: true, rowsAffected: 0 };

        const setClause = entries.map(([k]) => `${qm(k)} = ?`).join(", ");
        const values = entries.map(([, v]) => v);
        values.push(payload.rowId);

        const res = await this.sql_conn.unsafe(`UPDATE ${escapedTable} SET ${setClause} WHERE ${qm(pkCol)} = ?`, values);
        await this.logAudit("UPDATE", table, `Updated ${pkCol}=${payload.rowId} (${entries.length} cols)`);
        return { success: true, rowsAffected: res?.affectedRows ?? 0 };
      }

      if (action === "insert") {
        if (!payload.data) throw new Error("data object is required for insert");
        const keys = Object.keys(payload.data).filter((k) => validCols.has(k));
        if (keys.length === 0) {
          const res = await this.sql_conn.unsafe(`INSERT INTO ${escapedTable} () VALUES ()`);
          await this.logAudit("INSERT", table, `Inserted empty default row`);
          return { success: true, rowsAffected: res?.affectedRows ?? 0, lastInsertRowid: res?.lastInsertRowid ?? 0 };
        }

        const colNames = keys.map((k) => qm(k)).join(", ");
        const placeholders = keys.map(() => "?").join(", ");
        const values = keys.map((k) => payload.data![k]);

        const res = await this.sql_conn.unsafe(`INSERT INTO ${escapedTable} (${colNames}) VALUES (${placeholders})`, values);
        await this.logAudit("INSERT", table, `Inserted row with id=${res?.lastInsertRowid}`);
        return { success: true, rowsAffected: res?.affectedRows ?? 0, lastInsertRowid: res?.lastInsertRowid ?? 0 };
      }

      return { success: false, error: "Invalid mutation action" };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async createTable(name: string, columns: ColumnSpec[]): Promise<any> {
    try {
      if (!name || !columns || columns.length === 0) throw new Error("Table name and columns required");
      const colDefs = columns.map((c) => {
        let def = `${qm(c.name)} ${c.type || "VARCHAR(255)"}`;
        if (c.notnull) def += " NOT NULL";
        if (c.autoinc) def += " AUTO_INCREMENT";
        if (c.pk) def += " PRIMARY KEY";
        if (c.default !== undefined && c.default !== null && c.default !== "") {
          def += ` DEFAULT ${ml(String(c.default))}`;
        }
        return def;
      });
      const ddl = `CREATE TABLE ${qm(name)} (\n  ${colDefs.join(",\n  ")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;
      await this.sql_conn.unsafe(ddl);
      await this.logAudit("CREATE_TABLE", name, `Created table with ${columns.length} columns`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async redesignTable(table: string, newName: string, columns: ColumnSpec[]): Promise<any> {
    try {
      if (newName && newName !== table) {
        await this.sql_conn.unsafe(`RENAME TABLE ${qm(table)} TO ${qm(newName)}`);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async renameTable(table: string, newName: string): Promise<any> {
    try {
      await this.sql_conn.unsafe(`RENAME TABLE ${qm(table)} TO ${qm(newName)}`);
      await this.logAudit("RENAME_TABLE", table, `Renamed to ${newName}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async dropObject(kind: "table" | "view", name: string): Promise<any> {
    try {
      if (kind === "view") {
        await this.sql_conn.unsafe(`DROP VIEW IF EXISTS ${qm(name)}`);
      } else {
        await this.sql_conn.unsafe(`DROP TABLE IF EXISTS ${qm(name)}`);
      }
      await this.logAudit("DROP", name, `Dropped ${kind}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async createIndex(spec: { name: string; table: string; columns: string[]; unique?: boolean }): Promise<any> {
    try {
      const idxName = qm(spec.name);
      const tblName = qm(spec.table);
      const cols = spec.columns.map((c) => qm(c)).join(", ");
      const u = spec.unique ? "UNIQUE " : "";
      await this.sql_conn.unsafe(`CREATE ${u}INDEX ${idxName} ON ${tblName} (${cols})`);
      await this.logAudit("CREATE_INDEX", spec.name, `Created index on ${spec.table}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async createView(name: string, sql: string): Promise<any> {
    try {
      await this.sql_conn.unsafe(`CREATE OR REPLACE VIEW ${qm(name)} AS ${sql}`);
      await this.logAudit("CREATE_VIEW", name, `Created view`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async getTableDetails(table: string): Promise<any> {
    try {
      const ddlRes = await this.sql_conn.unsafe(`SHOW CREATE TABLE ${qm(table)}`);
      const sql = ddlRes[0]?.["Create Table"] || "";
      return { success: true, table, sql };
    } catch {
      try {
        const viewRes = await this.sql_conn.unsafe(`SHOW CREATE VIEW ${qm(table)}`);
        const sql = viewRes[0]?.["Create View"] || "";
        return { success: true, table, sql };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }
  }

  public async importRows(spec: { table: string; rows: Record<string, any>[] }): Promise<any> {
    try {
      if (!spec.rows || spec.rows.length === 0) return { success: true, imported: 0 };
      let count = 0;
      for (const row of spec.rows) {
        const res = await this.mutateRow(spec.table, "insert", { data: row });
        if (res.success) count++;
      }
      return { success: true, imported: count };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async runScript(sql: string): Promise<any> {
    try {
      // Tokenizer-based split: semicolons inside strings, comments and DELIMITER blocks do not end a statement.
      const stmts = splitStatements(sql, { engine: "mysql" }).map((s) => s.sql);
      let executed = 0;
      for (const st of stmts) {
        await this.sql_conn.unsafe(st);
        executed++;
      }
      return { success: true, executed };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async getAllRows(table: string): Promise<any> {
    try {
      const rows = await this.sql_conn.unsafe(`SELECT * FROM ${qm(table)}`);
      return { success: true, rows };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async dumpSql(tables?: string[]): Promise<any> {
    const res = await this.generateDatabaseDump({ mode: "all", tables });
    return res;
  }

  public async generateDatabaseDump(options: { mode?: "all" | "schema" | "data"; tables?: string[] } = {}): Promise<{ success: boolean; sql?: string; dump?: string; tablesIncluded?: string[]; error?: string }> {
    try {
      const mode = options.mode || "all";
      const schema = await this.getSchema();
      const targetTables = options.tables && options.tables.length > 0 
        ? options.tables 
        : schema.tables.map((t) => t.name);

      let dump = `-- ================================================================\n`;
      dump += `-- 🐬 MYSQL STUDIO PRO - ENTERPRISE DATABASE DUMP & RECOVERY SCRIPT\n`;
      dump += `-- Generated: ${new Date().toISOString()}\n`;
      dump += `-- Database: ${this.dbConfig.database} | Mode: ${mode.toUpperCase()}\n`;
      dump += `-- ================================================================\n\n`;
      dump += `SET FOREIGN_KEY_CHECKS = 0;\n`;
      dump += `SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n`;

      for (const t of targetTables) {
        const details = await this.getTableDetails(t);
        if (mode === "all" || mode === "schema") {
          dump += `-- -----------------------------------------------------\n`;
          dump += `-- Table structure for table ${qm(t)}\n`;
          dump += `-- -----------------------------------------------------\n`;
          dump += `DROP TABLE IF EXISTS ${qm(t)};\n`;
          if (details.sql) {
            dump += `${details.sql};\n\n`;
          }
        }

        if (mode === "all" || mode === "data") {
          const rows = await this.sql_conn.unsafe(`SELECT * FROM ${qm(t)}`);
          if (rows && rows.length > 0) {
            dump += `-- Dumping data for table ${qm(t)}\n`;
            const cols = Object.keys(rows[0]);
            const colsStr = cols.map((c) => `${qm(c)}`).join(", ");
            for (const r of rows) {
              const vals = cols
                .map((c) => {
                  const v = r[c];
                  if (v === null || v === undefined) return "NULL";
                  if (typeof v === "number") return v;
                  return `'${String(v).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
                })
                .join(", ");
              dump += `INSERT INTO ${qm(t)} (${colsStr}) VALUES (${vals});\n`;
            }
            dump += "\n";
          }
        }
      }

      dump += `SET FOREIGN_KEY_CHECKS = 1;\n`;
      dump += `-- Dump completed on ${new Date().toISOString()}\n`;

      return { success: true, sql: dump, dump, tablesIncluded: targetTables };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async getEnumTypes(schema?: string): Promise<MysqlEnumMeta[]> {
    try {
      const db = schema || this.dbConfig.database;
      const rows = await this.sql_conn.unsafe(`
        SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, TABLE_SCHEMA
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ${ml(db)}
          AND DATA_TYPE IN ('enum', 'set')
        ORDER BY TABLE_NAME, COLUMN_NAME;
      `);
      return (rows || []).map((r: any) => {
        const colType = String(r.COLUMN_TYPE || "");
        const match = colType.match(/\((.*)\)/);
        let values: string[] = [];
        if (match && match[1]) {
          values = match[1].split(",").map((v: string) => v.trim().replace(/^'|'$/g, "").replace(/''/g, "'"));
        }
        return {
          name: `${r.TABLE_NAME}.${r.COLUMN_NAME}`,
          table: r.TABLE_NAME,
          column: r.COLUMN_NAME,
          type: r.DATA_TYPE.toUpperCase(),
          values,
          schema: r.TABLE_SCHEMA
        };
      });
    } catch (e: any) {
      return [];
    }
  }

  public async addEnumValue(tableName: string, colName: string, newValue: string, schema?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = schema || this.dbConfig.database;
      const rows = await this.sql_conn.unsafe(`
        SELECT COLUMN_TYPE, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ${ml(db)}
          AND TABLE_NAME = ${ml(tableName)}
          AND COLUMN_NAME = ${ml(colName)}
        LIMIT 1;
      `);
      if (!rows || rows.length === 0) return { success: false, error: "Column not found" };
      const curType = String(rows[0].COLUMN_TYPE);
      const isNull = rows[0].IS_NULLABLE === "YES";
      const dflt = rows[0].COLUMN_DEFAULT !== null ? `DEFAULT ${ml(rows[0].COLUMN_DEFAULT)}` : "";

      const match = curType.match(/^(\w+)\((.*)\)$/);
      if (!match) return { success: false, error: "Invalid column type definition" };
      const baseType = match[1];
      const existingVals = match[2]!.split(",").map((v: string) => v.trim());
      const escapedNewVal = `${ml(newValue)}`;
      if (!existingVals.includes(escapedNewVal)) {
        existingVals.push(escapedNewVal);
      }
      const newTypeStr = `${baseType}(${existingVals.join(", ")})`;
      const nullStr = isNull ? "NULL" : "NOT NULL";

      await this.sql_conn.unsafe(`
        ALTER TABLE \`${tableName.replace(/`/g, "")}\`
        MODIFY COLUMN \`${colName.replace(/`/g, "")}\` ${newTypeStr} ${nullStr} ${dflt};
      `);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  public async getPartitionedTables(schema?: string): Promise<MysqlPartitionMeta[]> {
    try {
      const db = schema || this.dbConfig.database;
      const rows = await this.sql_conn.unsafe(`
        SELECT 
          TABLE_NAME,
          TABLE_SCHEMA,
          PARTITION_NAME,
          SUBPARTITION_NAME,
          PARTITION_METHOD,
          PARTITION_EXPRESSION,
          PARTITION_DESCRIPTION,
          TABLE_ROWS,
          DATA_LENGTH
        FROM information_schema.PARTITIONS
        WHERE TABLE_SCHEMA = ${ml(db)}
          AND PARTITION_NAME IS NOT NULL
        ORDER BY TABLE_NAME, PARTITION_ORDINAL_POSITION;
      `);

      return (rows || []).map((r: any) => {
        const bytes = Number(r.DATA_LENGTH) || 0;
        return {
          parentTable: r.TABLE_NAME,
          parentSchema: r.TABLE_SCHEMA,
          partitionStrategy: r.PARTITION_METHOD || "RANGE",
          partitionName: r.PARTITION_NAME,
          subpartitionName: r.SUBPARTITION_NAME || null,
          partitionExpression: r.PARTITION_DESCRIPTION || r.PARTITION_EXPRESSION || "DEFAULT",
          totalSize: formatBytes(bytes),
          rowEstimate: Number(r.TABLE_ROWS) || 0
        };
      });
    } catch (e) {
      return [];
    }
  }

  public async getReplicationStatus(): Promise<MysqlReplicationMeta> {
    const meta: MysqlReplicationMeta = {
      replicas: [],
      binaryLogs: [],
      masterStatus: null,
      replicaHosts: []
    };
    try {
      // 1. Replicas / Slaves
      try {
        const repl = await this.sql_conn.unsafe("SHOW REPLICA STATUS;");
        if (repl && repl.length > 0) {
          meta.replicas = repl;
        } else {
          const slave = await this.sql_conn.unsafe("SHOW SLAVE STATUS;");
          if (slave && slave.length > 0) meta.replicas = slave;
        }
      } catch {}

      // 2. Binary Log Coordinator / Master Status
      try {
        const binStat = await this.sql_conn.unsafe("SHOW BINARY LOG STATUS;");
        if (binStat && binStat.length > 0) {
          meta.masterStatus = binStat[0];
        } else {
          const master = await this.sql_conn.unsafe("SHOW MASTER STATUS;");
          if (master && master.length > 0) meta.masterStatus = master[0];
        }
      } catch {}

      // 3. Binary Logs File List
      try {
        const logs = await this.sql_conn.unsafe("SHOW BINARY LOGS;");
        if (logs && logs.length > 0) {
          meta.binaryLogs = logs.map((l: any) => ({
            logName: l.Log_name || l.LOG_NAME,
            fileSize: formatBytes(Number(l.File_size || l.FILE_SIZE || 0))
          }));
        }
      } catch {}

      // 4. Connected Replica Hosts
      try {
        const hosts = await this.sql_conn.unsafe("SHOW REPLICAS;");
        if (hosts && hosts.length > 0) {
          meta.replicaHosts = hosts;
        } else {
          const slaves = await this.sql_conn.unsafe("SHOW SLAVE HOSTS;");
          if (slaves && slaves.length > 0) meta.replicaHosts = slaves;
        }
      } catch {}
    } catch {}
    return meta;
  }

  public async getBlockedLocks(): Promise<MysqlBlockedLockMeta[]> {
    try {
      const rows = await this.sql_conn.unsafe(`
        SELECT 
          r.trx_id waiting_trx_id,
          r.trx_mysql_thread_id waiting_pid,
          r.trx_query waiting_query,
          b.trx_id blocking_trx_id,
          b.trx_mysql_thread_id blocking_pid,
          b.trx_query blocking_query,
          TIMESTAMPDIFF(SECOND, r.trx_wait_started, NOW()) wait_age_seconds
        FROM information_schema.innodb_lock_waits w
        JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_trx_id
        JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_trx_id;
      `).catch(() => []);

      return (rows || []).map((r: any) => ({
        waitingTrxId: String(r.waiting_trx_id),
        waitingPid: Number(r.waiting_pid),
        waitingQuery: r.waiting_query || "WAITING FOR LOCK",
        blockingTrxId: String(r.blocking_trx_id),
        blockingPid: Number(r.blocking_pid),
        blockingQuery: r.blocking_query || "ACTIVE TRANSACTION",
        waitAgeSeconds: Number(r.wait_age_seconds) || 0,
        lockMode: "EXCLUSIVE"
      }));
    } catch {
      return [];
    }
  }

  public async getActivity(): Promise<any[]> {
    try {
      const rows = await this.sql_conn.unsafe(`
        SELECT 
          ID as pid,
          USER as user,
          HOST as client,
          DB as database_name,
          COMMAND as command,
          TIME as duration_seconds,
          STATE as state,
          INFO as query
        FROM information_schema.PROCESSLIST
        ORDER BY TIME DESC;
      `).catch(() => []);
      return (rows || []).map((r: any) => ({
        pid: Number(r.pid),
        user: String(r.user || ""),
        client: String(r.client || ""),
        database: String(r.database_name || ""),
        command: String(r.command || ""),
        durationSeconds: Number(r.duration_seconds || 0),
        duration: `${Number(r.duration_seconds || 0)}s`,
        state: String(r.state || "sleep"),
        query: r.query || null,
      }));
    } catch {
      return [];
    }
  }

  public async terminateProcess(pid: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.sql_conn.unsafe(`KILL ${Number(pid)};`);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  public async getTableAggregates(tableName: string): Promise<Record<string, { count: number; sum?: number; avg?: number; min?: any; max?: any }>> {
    try {
      const dbName = this.dbConfig.database;
      const cols = await this.sql_conn.unsafe(
        "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
        [dbName, tableName]
      );
      if (!cols || cols.length === 0) return {};

      const numericCols = cols.filter((c: any) => {
        const t = (c.DATA_TYPE || c.data_type || "").toUpperCase();
        return t.includes("INT") || t.includes("DECIMAL") || t.includes("FLOAT") || t.includes("DOUBLE") || t.includes("NUMERIC");
      }).map((c: any) => c.COLUMN_NAME || c.column_name);

      const aggSelects: string[] = ["COUNT(*) as __total_count__"];
      for (const col of numericCols) {
        aggSelects.push(`SUM(${qm(col)}) as ${qm(col + "_sum")}`);
        aggSelects.push(`AVG(${qm(col)}) as ${qm(col + "_avg")}`);
        aggSelects.push(`MIN(${qm(col)}) as ${qm(col + "_min")}`);
        aggSelects.push(`MAX(${qm(col)}) as ${qm(col + "_max")}`);
      }

      const res = await this.sql_conn.unsafe(`SELECT ${aggSelects.join(", ")} FROM \`${tableName.replace(/`/g, "")}\``);
      const row = res && res[0] ? res[0] : {};
      const totalCount = Number(row.__total_count__) || 0;

      const results: Record<string, any> = { __total: { count: totalCount } };
      for (const col of numericCols) {
        results[col] = {
          count: totalCount,
          sum: row[`${col}_sum`] !== null ? Number(row[`${col}_sum`]) : null,
          avg: row[`${col}_avg`] !== null ? Number(parseFloat(row[`${col}_avg`]).toFixed(2)) : null,
          min: row[`${col}_min`],
          max: row[`${col}_max`],
        };
      }
      return results;
    } catch (e: any) {
      return {};
    }
  }

  public async seedEnterpriseDatabase(): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      await this.ensureDatabaseExists();
      this.initConnection();

      // 1. Customers
      await this.sql_conn.unsafe(`
        CREATE TABLE IF NOT EXISTS customers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          company VARCHAR(255),
          country VARCHAR(255) DEFAULT 'United States',
          tier ENUM('Standard', 'VIP', 'Enterprise', 'Partner', 'Pioneering', 'Honorary') DEFAULT 'Standard',
          balance DECIMAL(10,2) DEFAULT 0.00,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await this.sql_conn.unsafe(`
        ALTER TABLE customers MODIFY COLUMN tier ENUM('Standard', 'VIP', 'Enterprise', 'Partner', 'Pioneering', 'Honorary') DEFAULT 'Standard';
      `).catch(() => {});

      // 2. Products
      await this.sql_conn.unsafe(`
        CREATE TABLE IF NOT EXISTS products (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sku VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          category VARCHAR(255) NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          stock INT DEFAULT 100,
          rating DECIMAL(3,2) DEFAULT 4.5,
          active TINYINT DEFAULT 1
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // 3. Orders
      await this.sql_conn.unsafe(`
        CREATE TABLE IF NOT EXISTS orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customer_id INT NOT NULL,
          order_number VARCHAR(255) UNIQUE NOT NULL,
          status ENUM('pending', 'processing', 'completed', 'shipped', 'cancelled', 'refunded') DEFAULT 'pending',
          total_amount DECIMAL(10,2) DEFAULT 0.00,
          payment_method VARCHAR(255) DEFAULT 'Credit Card',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      await this.sql_conn.unsafe(`
        ALTER TABLE orders MODIFY COLUMN status ENUM('pending', 'processing', 'completed', 'shipped', 'cancelled', 'refunded') DEFAULT 'pending';
      `).catch(() => {});

      // 3b. Declarative Partitioned Table: sales_history
      await this.sql_conn.unsafe(`
        CREATE TABLE IF NOT EXISTS sales_history (
          id INT NOT NULL,
          customer_id INT NOT NULL,
          total_amount DECIMAL(10,2) NOT NULL,
          sale_date DATE NOT NULL,
          PRIMARY KEY (id, sale_date)
        ) ENGINE=InnoDB
        PARTITION BY RANGE (YEAR(sale_date)) (
          PARTITION p2023 VALUES LESS THAN (2024),
          PARTITION p2024 VALUES LESS THAN (2025),
          PARTITION p2025 VALUES LESS THAN (2026),
          PARTITION p_future VALUES LESS THAN MAXVALUE
        );
      `);
      // Seed sales_history if empty
      const salesCount = await this.sql_conn.unsafe("SELECT count(*) as cnt FROM sales_history;").catch(() => [{ cnt: 0 }]);
      if (Number(salesCount?.[0]?.cnt || 0) === 0) {
        await this.sql_conn.unsafe(`
          INSERT INTO sales_history (id, customer_id, total_amount, sale_date) VALUES
          (1, 1, 1499.00, '2023-05-12'),
          (2, 2, 850.50, '2023-11-20'),
          (3, 3, 2300.00, '2024-02-14'),
          (4, 4, 420.00, '2024-08-01'),
          (5, 5, 5400.00, '2025-01-10'),
          (6, 6, 1250.00, '2025-06-18'),
          (7, 7, 3100.00, '2026-03-22');
        `).catch(() => {});
      }

      // 4. Order Items
      await this.sql_conn.unsafe(`
        CREATE TABLE IF NOT EXISTS order_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NOT NULL,
          product_id INT NOT NULL,
          quantity INT DEFAULT 1,
          unit_price DECIMAL(10,2) NOT NULL,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // 5. Audit Log
      await this.sql_conn.unsafe(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          action VARCHAR(255) NOT NULL,
          entity VARCHAR(255) NOT NULL,
          details TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Views
      await this.sql_conn.unsafe(`
        CREATE OR REPLACE VIEW v_customer_orders AS
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

      await this.sql_conn.unsafe(`
        CREATE OR REPLACE VIEW v_sales_by_category AS
        SELECT 
          p.category,
          count(oi.id) AS units_sold,
          sum(oi.quantity * oi.unit_price) AS gross_revenue,
          avg(p.rating) AS avg_product_rating
        FROM products p
        JOIN order_items oi ON oi.product_id = p.id
        GROUP BY p.category;
      `);

      await this.sql_conn.unsafe(`
        CREATE OR REPLACE VIEW v_order_details_extended AS
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

      await this.sql_conn.unsafe(`
        CREATE OR REPLACE VIEW v_customer_order_summary AS
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

      await this.sql_conn.unsafe(`
        CREATE OR REPLACE VIEW v_product_sales_performance AS
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

      await this.sql_conn.unsafe(`
        CREATE OR REPLACE VIEW v_pending_shipments AS
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

      await this.sql_conn.unsafe(`
        CREATE OR REPLACE VIEW v_vip_customer_analytics AS
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

      const custCountRes = await this.sql_conn.unsafe("SELECT count(*) as c FROM customers;");
      const custCount = Number(custCountRes[0]?.c || 0);

      if (custCount === 0) {
        const customers = [
          ["Linus Torvalds", "linus@kernel.org", "Linux Foundation", "United States", "Enterprise", 45200.5],
          ["Brendan Eich", "brendan@brave.com", "Brave Software", "United States", "Enterprise", 31800.0],
          ["Jarred Sumner", "jarred@oven.sh", "Oven Inc / Bun", "United States", "VIP", 94500.0],
          ["Guido van Rossum", "guido@python.org", "Python Software Foundation", "Netherlands", "Standard", 12400.75],
          ["Dennis Ritchie", "dennis@bell-labs.com", "Bell Labs", "United States", "Honorary", 75000.0],
          ["Ada Lovelace", "ada@babbage.engine", "Analytical Research", "United Kingdom", "Pioneering", 120000.0],
          ["Grace Hopper", "grace@navy.mil", "Naval Computing", "United States", "Pioneering", 88000.0],
          ["Ken Thompson", "ken@unix.org", "Bell Labs", "United States", "VIP", 62000.0],
          ["Bjarne Stroustrup", "bjarne@morgan.com", "C++ Standards", "United States", "Enterprise", 54000.0],
          ["Anders Hejlsberg", "anders@microsoft.com", "TypeScript / C#", "United States", "Enterprise", 67000.0],
          ["Sophie Wilson", "sophie@arm.com", "ARM Architecture", "United Kingdom", "VIP", 83000.0],
          ["Donald Knuth", "knuth@stanford.edu", "Stanford University", "United States", "Honorary", 99000.0],
        ];

        for (const c of customers) {
          await this.sql_conn.unsafe(
            "INSERT INTO customers (name, email, company, country, tier, balance) VALUES (?, ?, ?, ?, ?, ?)",
            c
          );
        }

        const products = [
          ["BUN-PRO-01", "Bun RAD Studio Workstation Pro", "Developer Tools", 499.0, 250, 4.9],
          ["SQL-IDE-02", "MySQL Studio Pro Dedicated License", "Developer Tools", 199.0, 500, 4.8],
          ["SRV-SYS-03", "Hardware Telemetry Probe Appliance", "Hardware", 1299.0, 45, 4.7],
          ["MEM-NVME-04", "Ultra-Fast PCI-e 5.0 NVMe 4TB", "Hardware", 389.0, 120, 4.9],
          ["NET-ROUT-05", "10GbE SFP+ Enterprise Core Switch", "Networking", 899.0, 60, 4.6],
          ["SEC-HSM-06", "Hardware Security Module KeyVault", "Security", 1499.0, 30, 5.0],
          ["RAM-ECC-07", "DDR5-5600 128GB ECC Workstation Kit", "Hardware", 549.0, 85, 4.8],
          ["ACC-PWR-08", "Titanium 1600W Silent ATX 3.0 PSU", "Power", 329.0, 150, 4.7],
          ["DSK-ENC-09", "8-Bay Thunderbolt 4 RAID Enclosure", "Storage", 799.0, 75, 4.5],
          ["SRV-ARM-10", "Ampere Altra 128-Core Compute Node", "Servers", 4899.0, 15, 4.9],
        ];

        for (const p of products) {
          await this.sql_conn.unsafe(
            "INSERT INTO products (sku, name, category, price, stock, rating) VALUES (?, ?, ?, ?, ?, ?)",
            p
          );
        }

        for (let i = 1; i <= 15; i++) {
          const custId = (i % 12) + 1;
          const orderNum = `ORD-2026-${1000 + i}`;
          const status = i % 4 === 0 ? "completed" : i % 3 === 0 ? "shipped" : "processing";
          const payMethod = i % 2 === 0 ? "Corporate Net-30" : "Credit Card";

          const prod1Id = (i % 10) + 1;
          const prod2Id = ((i + 3) % 10) + 1;
          const q1 = (i % 3) + 1;
          const q2 = 1;

          const p1Res = await this.sql_conn.unsafe("SELECT price FROM products WHERE id = ?", [prod1Id]);
          const p1 = Number(p1Res[0]?.price || 199.0);
          const p2Res = await this.sql_conn.unsafe("SELECT price FROM products WHERE id = ?", [prod2Id]);
          const p2 = Number(p2Res[0]?.price || 389.0);
          const totalAmount = Number((q1 * p1 + q2 * p2).toFixed(2));

          const orderRes = await this.sql_conn.unsafe(
            "INSERT INTO orders (customer_id, order_number, status, total_amount, payment_method) VALUES (?, ?, ?, ?, ?)",
            [custId, orderNum, status, totalAmount, payMethod]
          );
          const orderId = orderRes?.lastInsertRowid;

          await this.sql_conn.unsafe(
            "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
            [orderId, prod1Id, q1, p1]
          );
          await this.sql_conn.unsafe(
            "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
            [orderId, prod2Id, q2, p2]
          );
        }

        await this.sql_conn.unsafe(`
          INSERT INTO audit_logs (action, entity, details) VALUES
            ('SYSTEM_BOOT', 'DATABASE', 'Enterprise MySQL relational dataset seeded successfully.'),
            ('STORAGE_ENGINE', 'INNODB', 'InnoDB storage engine configured with foreign keys.');
        `);
      }

      await this.logAudit("SEED", "DATABASE", "Seeded enterprise sample database");
      return { success: true, count: 12 + 10 + 15 };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async runPragma(pragma: string, value?: string): Promise<any> {
    try {
      const p = (pragma || "").toLowerCase();

      if (p === "vacuum") {
        const schema = await this.getSchema();
        const outputs: string[] = [];
        for (const t of schema.tables) {
          const res = await this.sql_conn.unsafe(`OPTIMIZE TABLE ${qm(t.name)}`);
          const msg = res[0]?.Msg_text || "OK";
          outputs.push(`${t.name}: ${msg}`);
        }
        return { success: true, result: outputs.join("\n") || "Tables optimized" };
      }

      if (p === "integrity_check") {
        const schema = await this.getSchema();
        const outputs: string[] = [];
        let allOk = true;
        for (const t of schema.tables) {
          const res = await this.sql_conn.unsafe(`CHECK TABLE ${qm(t.name)}`);
          const msg = String(res[0]?.Msg_text || "OK");
          if (!msg.toLowerCase().includes("ok")) allOk = false;
          outputs.push(`${t.name}: ${msg}`);
        }
        return { success: allOk, result: outputs };
      }

      if (p === "analyze_table" || p === "analyze") {
        const schema = await this.getSchema();
        const outputs: string[] = [];
        for (const t of schema.tables) {
          const res = await this.sql_conn.unsafe(`ANALYZE TABLE ${qm(t.name)}`);
          const msg = res[0]?.Msg_text || "OK";
          outputs.push(`${t.name}: ${msg}`);
        }
        return { success: true, result: outputs.join("\n") || "Tables analyzed" };
      }

      const cleanPragma = pragma.replace(/[^a-zA-Z0-9_]/g, "");
      if (value !== undefined) {
        await this.sql_conn.unsafe(`SET SESSION ${cleanPragma} = ${ml(String(value))}`);
        return { success: true, result: `${cleanPragma} = ${value}` };
      }

      const res = await this.sql_conn.unsafe(`SHOW VARIABLES LIKE '%${cleanPragma}%'`);
      return { success: true, result: Array.isArray(res) ? res : JSON.stringify(res, null, 2) };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // macros are persisted per connection (never inside the user's database).
  public macroStore = new MacroStore("mysql", () => `${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.database}`);

  public getMacroAdapter(): MacroAdapter {
    const toResult = (rows: any): MacroQueryResult => {
      if (Array.isArray(rows)) {
        const isRows = rows.length > 0;
        return {
          success: true,
          rows: isRows ? rows : [],
          columns: isRows ? Object.keys(rows[0]) : [],
          rowCount: rows.length,
          rowsAffected: isRows ? undefined : Number((rows as unknown as { affectedRows?: number; count?: number }).affectedRows ?? (rows as unknown as { count?: number }).count ?? 0),
        };
      }
      return { success: true, rows: [], columns: [], rowsAffected: Number(rows?.affectedRows ?? 0) };
    };
    const safe = async (fn: () => Promise<any>): Promise<MacroQueryResult> => {
      try {
        return toResult(await fn());
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    };
    return {
      dialect: "mysql",
      connectionKey: () => `${this.dbConfig.host}:${this.dbConfig.port}/${this.dbConfig.database}`,
      query: async (sql) => {
        const r = await this.query(sql);
        return r.success
          ? { success: true, rows: r.rows || [], columns: r.columns || [], rowCount: r.rowCount, rowsAffected: r.rowsAffected }
          : { success: false, error: r.error };
      },
      beginTransaction: async () => {
        const conn = await this.sql_conn.reserve();
        try {
          await conn.unsafe("START TRANSACTION");
        } catch (err) {
          conn.release();
          throw err;
        }
        let closed = false;
        const finish = async (verb: "COMMIT" | "ROLLBACK") => {
          if (closed) return;
          closed = true;
          try {
            await conn.unsafe(verb);
          } finally {
            conn.release();
          }
        };
        return {
          query: (sql) => safe(() => conn.unsafe(sql)),
          commit: () => finish("COMMIT"),
          rollback: () => finish("ROLLBACK"),
        };
      },
      maintenance: async (analyze) => {
        const tables = await this.listMacroTables();
        for (const t of tables) {
          const q = "`" + t.replace(/`/g, "``") + "`";
          await this.sql_conn.unsafe(`OPTIMIZE TABLE ${q}`);
          if (analyze) await this.sql_conn.unsafe(`ANALYZE TABLE ${q}`);
        }
        return `Optimized${analyze ? " and analyzed" : ""} ${tables.length} table(s)`;
      },
      backup: async (mode) => {
        const dump = await this.generateDatabaseDump({ mode: mode === "full" ? "all" : (mode as any) });
        if (!dump.success) throw new Error(dump.error || "Backup failed");
        return `Generated SQL dump (${(dump.sql || dump.dump || "").length} bytes, mode ${mode})`;
      },
      listTables: () => this.listMacroTables(),
    };
  }

  private async listMacroTables(): Promise<string[]> {
    const rows = await this.sql_conn.unsafe(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name",
      [this.dbConfig.database],
    );
    return (rows as any[]).map((r) => String(r.name ?? r.NAME ?? r.table_name ?? r.TABLE_NAME));
  }

  public async logAudit(action: string, entity: string, details: string) {
    try {
      await this.sql_conn.unsafe(
        "INSERT INTO audit_logs (action, entity, details) VALUES (?, ?, ?)",
        [action, entity, String(details).slice(0, 300)]
      );
    } catch {}
  }
}

// -------------------------------------------------------------------------------------------------
// HTTP Telemetry Server Engine
// -------------------------------------------------------------------------------------------------

export function startMysqlStudioServer(options: ServerOptions = {}) {
  const port = options.port ?? 0;
  const hostname = options.host ?? "127.0.0.1";
  const manager = new MysqlManager(options.initialDbPath || "", options.config);
  const staging = mysqlStaging(manager);
  const samples = mysqlSampleApi(manager);

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      // CORS Headers
      const __blocked = guardLocalRequest(req);
      if (__blocked) return __blocked;
      if (url.pathname === "/workbench" || url.pathname.startsWith("/api/v2/")) {
        const __workbench = await (await getSharedWorkbench("MySQL Studio · Workbench")).handle(req);
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
        return new Response(generateMysqlStudioHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          },
        });
      }

      // 2. Database KPIs Telemetry
      if (url.pathname === "/api/kpis" && req.method === "GET") {
        const kpis = await manager.getKpis();
        return Response.json({ success: true, kpis, ...kpis }, { headers: corsHeaders });
      }

      // 3. Database Schema
      if (url.pathname === "/api/schema" && req.method === "GET") {
        const schema = await manager.getSchema();
        return Response.json(schema, { headers: corsHeaders });
      }

      // 4. Execute Arbitrary SQL
      if (url.pathname === "/api/query" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string; params?: any[] };
          const result = await manager.query(body.sql, body.params || []);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 4a. Format SQL with sql-formatter
      if (url.pathname === "/api/sql/format" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string };
          const formatted = formatSqlDialect(body.sql || "", "mysql");
          return Response.json({ success: true, formatted }, { headers: corsHeaders });
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
          const result = await manager.explain(body.sql);
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
            sortColumns?: SortColumnSpec[];
            search?: string;
            columnFilters?: Record<string, string>;
          };
          const result = await manager.getTableData(body.table, body);
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
            payload: { rowId?: any; rowIds?: any[]; pkColumn?: string; data?: Record<string, any> };
          };
          const result = await manager.mutateRow(body.table, body.action, body.payload);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 7b. Row Mutation Convenience Endpoints
      if (url.pathname === "/api/rows/insert" && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const result = await manager.mutateRow(body.table, "insert", { data: body.row || body.data });
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/rows/update" && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const result = await manager.mutateRow(body.table, "update", {
            data: body.row || body.data,
            rowId: body.pkVal ?? body.rowId,
            pkColumn: body.pkCol ?? body.pkColumn,
          });
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/rows/delete" && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const result = await manager.mutateRow(body.table, "delete", {
            rowId: body.rowId ?? body.pkVal,
            pkColumn: body.pkColumn ?? body.pkCol,
          });
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if ((url.pathname === "/api/rows/import-batch" || url.pathname === "/api/table/import") && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const result = await manager.importRows(body);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/table/truncate" && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const result = await manager.runScript(`TRUNCATE TABLE ${qm(body.table)}`);
          return Response.json(result, { status: result.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/schema/drop-table" && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const result = await manager.runScript(`DROP TABLE IF EXISTS ${qm(body.table)}`);
          return Response.json(result, { status: result.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 8. Connect / Switch Database or Custom Host & Credentials
      if (url.pathname === "/api/connect" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            path?: string;
            host?: string;
            port?: number;
            user?: string;
            password?: string;
            database?: string;
            tls?: boolean;
            url?: string;
          };
          if (body.host || body.user || body.url || (body.port && body.port !== 3306)) {
            const configResult = await manager.updateConfig({
              host: body.host,
              port: body.port,
              user: body.user,
              password: body.password,
              database: body.database || body.path,
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

          const result = await manager.connect(body.path || body.database || "");
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

      // 8a. Connection Config (Get active config)
      if (url.pathname === "/api/config" && req.method === "GET") {
        return Response.json({ success: true, config: manager.getConfig() }, { headers: corsHeaders });
      }

      // 8a-2. Update Connection Config
      if (url.pathname === "/api/config" && req.method === "POST") {
        try {
          const body = (await req.json()) as MysqlConnectionConfig & { resetToEnv?: boolean };
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

      // 8a-3. Test Connection Config without applying
      if (url.pathname === "/api/test-config" && req.method === "POST") {
        try {
          const body = (await req.json()) as MysqlConnectionConfig;
          const result = await manager.testConnection(body);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 8a-4. Create Database
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

      // 8b. Workspace Discovered Databases List
      if (url.pathname === "/api/workspace-databases" && req.method === "GET") {
        try {
          const databases = await manager.getWorkspaceDatabases();
          return Response.json({ success: true, databases }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 8c. Table / schema designer, import & export (GUI CRUD)
      if (url.pathname.startsWith("/api/schema/") && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          const op = url.pathname.slice("/api/schema/".length);
          let result: any;
          switch (op) {
            case "create-table":
              result = await manager.createTable(body.name, body.columns);
              break;
            case "redesign-table":
              result = await manager.redesignTable(body.table, body.newName, body.columns);
              break;
            case "rename-table":
              result = await manager.renameTable(body.table, body.newName);
              break;
            case "drop":
              result = await manager.dropObject(body.kind, body.name);
              break;
            case "create-index":
              result = await manager.createIndex(body);
              break;
            case "create-view":
              result = await manager.createView(body.name, body.sql);
              break;
            case "details":
              result = await manager.getTableDetails(body.table);
              break;
            case "diff": {
              const currentTables = Array.isArray(body.targetTables) ? body.targetTables : (await manager.getSchema()).tables;
              const baselineTables = Array.isArray(body.baselineTables) ? body.baselineTables : [];
              result = { success: true, ...computeSchemaDiffDdl(baselineTables, currentTables, "mysql") };
              break;
            }
            default:
              return new Response("Not Found", { status: 404, headers: corsHeaders });
          }
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/import" && req.method === "POST") {
        try {
          const body = (await req.json()) as any;
          return Response.json(await manager.importRows(body), { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/script" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string };
          return Response.json(await manager.runScript(body.sql), { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/table/all" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string };
          return Response.json(await manager.getAllRows(body.table), { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/dump" && req.method === "POST") {
        try {
          const body = (await req.json().catch(() => ({}))) as { tables?: string[]; mode?: "all" | "schema" | "data" };
          if (body.mode) {
            return Response.json(await manager.generateDatabaseDump(body), { headers: corsHeaders });
          }
          return Response.json(await manager.dumpSql(body.tables), { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Full Database SQL Dump & Backup Generator API
      if (url.pathname === "/api/database/dump" && req.method === "POST") {
        try {
          const body = (await req.json().catch(() => ({}))) as { mode?: "all" | "schema" | "data"; tables?: string[] };
          const dumpRes = await manager.generateDatabaseDump(body);
          return Response.json({ success: true, sql: dumpRes.sql || dumpRes.dump, mode: body.mode || "all", timestamp: new Date().toISOString() }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Custom Types & ENUMs API
      if (url.pathname === "/api/types/enums" && req.method === "GET") {
        try {
          const enums = await manager.getEnumTypes(url.searchParams.get("schema") || undefined);
          return Response.json({ success: true, enums }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/types/enums/add-value" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string; column: string; value: string; schema?: string; name?: string };
          let tbl = body.table;
          let col = body.column;
          if ((!tbl || !col) && body.name && body.name.includes(".")) {
            const parts = body.name.split(".");
            tbl = parts[0] ?? tbl;
            col = parts[1] ?? col;
          }
          const res = await manager.addEnumValue(tbl, col, body.value, body.schema);
          return Response.json(res, { status: res.success ? 200 : 400, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (url.pathname === "/api/types/enums/create" && req.method === "POST") {
        try {
          const body = (await req.json()) as { name: string; values: string[] };
          // If name has dot (table.column), alter table to add enum column
          if (body.name && body.name.includes(".")) {
            const [tbl = "", col = ""] = body.name.split(".");
            const valList = (body.values || []).map(v => `${ml(v)}`).join(", ");
            await manager.runScript(`ALTER TABLE \`${tbl.replace(/`/g, "")}\` ADD COLUMN \`${col.replace(/`/g, "")}\` ENUM(${valList});`);
          }
          return Response.json({ success: true }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Partitioned Tables API
      if (url.pathname === "/api/partitions" && req.method === "GET") {
        try {
          const partitions = await manager.getPartitionedTables(url.searchParams.get("schema") || undefined);
          return Response.json({ success: true, partitions }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // Replication & Binary Log Status API
      if (url.pathname === "/api/replication" && req.method === "GET") {
        try {
          const replication = await manager.getReplicationStatus();
          return Response.json({ success: true, replication }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // Table Aggregates for Totals Row
      if (url.pathname === "/api/table/aggregates" && req.method === "POST") {
        try {
          const body = (await req.json()) as { table: string };
          const aggregates = await manager.getTableAggregates(body.table);
          return Response.json({ success: true, aggregates }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Live Activity & Locks API
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
          const res = await manager.terminateProcess(body.pid);
          return Response.json(res, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

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
          const result = await manager.seedEnterpriseDatabase();
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 10. Run PRAGMA / Server Operations
      if (url.pathname === "/api/pragma" && req.method === "POST") {
        try {
          const body = (await req.json()) as { pragma: string; value?: string };
          const result = await manager.runPragma(body.pragma, body.value);
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
          const filename = `mysql_export_${Date.now()}.${fmt}`;
          const exportPath = resolve(process.env.STUDIO_EXPORT_DIR || process.cwd(), filename);
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
            const tbl = (body.tableName || "exported_records").replace(/`/g, "``");
            const headers = allKeys;
            const escapedHeaders = headers.map((h) => `\`${h.replace(/`/g, "``")}\``).join(", ");
            const lines = body.rows.map((r) => {
              const vals = headers.map((h) => {
                const v = r[h];
                if (v === null || v === undefined) return "NULL";
                if (typeof v === "number") return v;
                return `${ml(String(v))}`;
              });
              return `INSERT INTO ${qm(tbl)} (${escapedHeaders}) VALUES (${vals.join(", ")});`;
            });
            content = lines.join("\n");
          }

          writeFileSync(exportPath, content, "utf8");
          return Response.json({ success: true, filename, path: exportPath, data: content, rowCount: body.rows.length }, { headers: corsHeaders });
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

      // Shutdown / Close workstation
      if ((url.pathname === "/api/shutdown" || url.pathname === "/api/close") && req.method === "POST") {
        setTimeout(() => process.exit(0), 100);
        return Response.json({ success: true, message: "Workstation shutting down..." }, { headers: corsHeaders });
      }

      // Macro Designer & Saved Queries
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

if (!Bun.isMainThread && (!process.env.STUDIO_WORKER || process.env.STUDIO_WORKER === "mysql_studio")) {
  const preferredPort = 0;
  const rawDb = process.env.MYSQL_DB_PATH;
  const initialDbPath = (rawDb && rawDb !== ":memory:")
    ? rawDb
    : (process.env.MSQL_NAME 
    || process.env.MSQL_DATABASE 
    || process.env.MSQL_DB 
    || process.env.MYSQL_DATABASE 
    || process.env.DB_NAME 
    || "my_app_dev");
  const server = startMysqlStudioServer({ port: preferredPort, initialDbPath });

  (globalThis as any).postMessage({
    ready: true,
    type: "mysql_studio",
    port: server.port,
    url: `http://127.0.0.1:${server.port}`,
  });
}
