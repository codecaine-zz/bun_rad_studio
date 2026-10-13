/**
 * ⚡ Bun RAD Studio - MySQL Studio Pro Server Engine
 * 
 * High-performance background HTTP telemetry & database engine for MySQL Studio Pro.
 * Runs on a dedicated OS thread (via Bun Worker) or standalone web server, providing
 * sub-millisecond query execution, schema reflection, and live database telemetry
 * using Bun's native high-performance SQL client.
 */

import { guardLocalRequest, writeClipboardSync } from "../src/localGuard";
import { SQL } from "bun";
import { resolve, basename } from "path";
import { existsSync, statSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { generateMysqlStudioHtml } from "./mysql_studio.ts";

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

// -------------------------------------------------------------------------------------------------
// MySQL Database Manager
// -------------------------------------------------------------------------------------------------

export class MysqlManager {
  public sql_conn: any;
  public activePath: string;
  public isMemory: boolean = false;
  public configSource: "env" | "manual" = "env";
  public dbConfig: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    tls?: boolean;
  };

  constructor(initialDb: string = "", initialConfig?: Partial<MysqlConnectionConfig>) {
    this.loadEnvFile();
    this.activePath = initialDb 
      || initialConfig?.database 
      || process.env.MSQL_NAME 
      || process.env.MSQL_DATABASE 
      || process.env.MSQL_DB 
      || process.env.MYSQL_DATABASE 
      || process.env.DB_NAME 
      || "my_app_dev";
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
    let database = customConfig?.database 
      || overrideDb 
      || process.env.MSQL_NAME 
      || process.env.MSQL_DATABASE 
      || process.env.MSQL_DB 
      || process.env.MYSQL_DATABASE 
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
      this.sql_conn = new SQL({
        adapter: "mysql",
        hostname: this.dbConfig.host,
        port: this.dbConfig.port,
        username: this.dbConfig.user,
        password: this.dbConfig.password,
        database: this.dbConfig.database,
        allowPublicKeyRetrieval: true,
        tls: this.dbConfig.tls ?? false,
      });
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
      const testConn = new SQL({
        adapter: "mysql",
        hostname: host,
        port: port,
        username: user,
        password: password,
        database: database || undefined,
        allowPublicKeyRetrieval: true,
        tls: tls,
      });

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

  public async ensureDatabaseExists(dbName: string = this.dbConfig.database): Promise<void> {
    try {
      const rootSql = new SQL({
        adapter: "mysql",
        hostname: this.dbConfig.host,
        port: this.dbConfig.port,
        username: this.dbConfig.user,
        password: this.dbConfig.password,
        allowPublicKeyRetrieval: true,
        tls: this.dbConfig.tls ?? false,
      });
      await rootSql.unsafe(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, "``")}\``);
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
          const ddlRes = await this.sql_conn.unsafe(isTable ? `SHOW CREATE TABLE \`${tname}\`` : `SHOW CREATE VIEW \`${tname}\``);
          createSql = ddlRes[0]?.["Create Table"] || ddlRes[0]?.["Create View"] || "";
        } catch {}

        const rowCount = Number(item.TABLE_ROWS ?? item.table_rows ?? 0);
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
      const latencyMs = Number((performance.now() - t0).toFixed(2));
      return { success: false, latencyMs, error: err?.message || String(err) };
    }
  }

  public async explain(sqlStr: string): Promise<any> {
    const trimmed = (sqlStr || "").trim();
    if (!trimmed) return { success: false, error: "SQL statement is required for explain" };

    const t0 = performance.now();
    try {
      const cleanSql = trimmed.replace(/^EXPLAIN\s+(ANALYZE\s+|FORMAT\s*=\s*\w+\s+)?/i, "");
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
        } catch {
          explainRows = [];
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
        explainRows = await this.sql_conn.unsafe(`EXPLAIN ${cleanSql}`);
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

          while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
          }
          const parent = stack.length > 0 ? stack[stack.length - 1].id : 0;
          stack.push({ id, indent });

          const isScan = /table\s+scan/i.test(cleanDetail) || /full\s+scan/i.test(cleanDetail);
          const isIndex = /index/i.test(cleanDetail) || /key/i.test(cleanDetail);

          // Extract cost & rows: (cost=X rows=Y)
          const costMatch = cleanDetail.match(/cost=([\d.]+)/i);
          const rowsMatch = cleanDetail.match(/rows=([\d.]+)/i);
          const timeMatch = cleanDetail.match(/actual\s+time=([\d.]+)\.\.([\d.]+)/i);

          const cost = costMatch ? parseFloat(costMatch[1]) : undefined;
          const rows = rowsMatch ? parseFloat(rowsMatch[1]) : undefined;
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
    options: { page?: number; pageSize?: number; orderBy?: string; orderDir?: "ASC" | "DESC"; search?: string } = {}
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

      let whereClause = "";
      const params: any[] = [];
      if (options.search && options.search.trim() && columns.length > 0) {
        const searchVal = `%${options.search.trim()}%`;
        const conditions = columns.map((col: string) => `${qm(col)} LIKE ?`);
        whereClause = `WHERE (${conditions.join(" OR ")})`;
        columns.forEach(() => params.push(searchVal));
      }

      let orderClause = "";
      if (options.orderBy && columns.includes(options.orderBy)) {
        const dir = options.orderDir === "DESC" ? "DESC" : "ASC";
        orderClause = `ORDER BY ${qm(options.orderBy)} ${dir}`;
      } else if (pkColumns.length > 0) {
        orderClause = `ORDER BY ${qm(pkColumns[0])} ASC`;
      }

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
          def += ` DEFAULT '${String(c.default).replace(/'/g, "''")}'`;
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
      const stmts = sql
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
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
    try {
      const schema = await this.getSchema();
      const targetTables = tables && tables.length > 0 ? tables : schema.tables.map((t) => t.name);
      let dump = `-- MySQL Studio Pro Dump\n-- Database: ${this.dbConfig.database}\n-- Generated: ${new Date().toISOString()}\n\n`;

      for (const t of targetTables) {
        const details = await this.getTableDetails(t);
        if (details.sql) {
          dump += `DROP TABLE IF EXISTS ${qm(t)};\n${details.sql};\n\n`;
        }
        const rows = await this.sql_conn.unsafe(`SELECT * FROM ${qm(t)}`);
        if (rows && rows.length > 0) {
          const cols = Object.keys(rows[0]);
          const colsStr = cols.map((c) => qm(c)).join(", ");
          for (const r of rows) {
            const vals = cols
              .map((c) => {
                const v = r[c];
                if (v === null || v === undefined) return "NULL";
                if (typeof v === "number") return v;
                return `'${String(v).replace(/'/g, "''")}'`;
              })
              .join(", ");
            dump += `INSERT INTO ${qm(t)} (${colsStr}) VALUES (${vals});\n`;
          }
          dump += "\n";
        }
      }

      return { success: true, dump };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
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
          tier VARCHAR(255) DEFAULT 'Standard',
          balance DECIMAL(10,2) DEFAULT 0.00,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

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
          status VARCHAR(255) DEFAULT 'pending',
          total_amount DECIMAL(10,2) DEFAULT 0.00,
          payment_method VARCHAR(255) DEFAULT 'Credit Card',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

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
        // Optimize all tables
        const schema = await this.getSchema();
        const outputs: string[] = [];
        for (const t of schema.tables) {
          const res = await this.sql_conn.unsafe(`OPTIMIZE TABLE ${qm(t.name)}`);
          outputs.push(`${t.name}: ${res[0]?.Msg_text || "OK"}`);
        }
        return { success: true, result: outputs.join("\n") || "Database optimized" };
      }
      if (p === "integrity_check") {
        const schema = await this.getSchema();
        const outputs: string[] = [];
        let allOk = true;
        for (const t of schema.tables) {
          const res = await this.sql_conn.unsafe(`CHECK TABLE ${qm(t.name)}`);
          const msg = res[0]?.Msg_text || "OK";
          if (msg !== "OK") allOk = false;
          outputs.push(`${t.name}: ${msg}`);
        }
        return { success: allOk, result: outputs.join("\n") || "OK" };
      }

      // Variable query or status
      if (value !== undefined) {
        await this.sql_conn.unsafe(`SET SESSION ${pragma} = ?`, [value]);
        return { success: true, result: `${pragma} = ${value}` };
      } else {
        const res = await this.sql_conn.unsafe(`SHOW VARIABLES LIKE ?`, [`%${pragma}%`]);
        return { success: true, result: JSON.stringify(res, null, 2) };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
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

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      // CORS Headers
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
        return Response.json(kpis, { headers: corsHeaders });
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
            search?: string;
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
          const body = (await req.json().catch(() => ({}))) as { tables?: string[] };
          return Response.json(await manager.dumpSql(body.tables), { headers: corsHeaders });
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
            const tbl = (body.tableName || "exported_records").replace(/`/g, "``");
            const headers = allKeys;
            const escapedHeaders = headers.map((h) => `\`${h.replace(/`/g, "``")}\``).join(", ");
            const lines = body.rows.map((r) => {
              const vals = headers.map((h) => {
                const v = r[h];
                if (v === null || v === undefined) return "NULL";
                if (typeof v === "number") return v;
                return `'${String(v).replace(/'/g, "''")}'`;
              });
              return `INSERT INTO \`${tbl}\` (${escapedHeaders}) VALUES (${vals.join(", ")});`;
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

if (!Bun.isMainThread && (!process.env.STUDIO_WORKER || process.env.STUDIO_WORKER === "mysql_studio")) {
  const preferredPort = 0;
  const initialDbPath = process.env.MYSQL_DB_PATH 
    || process.env.MSQL_NAME 
    || process.env.MSQL_DATABASE 
    || process.env.MSQL_DB 
    || process.env.MYSQL_DATABASE 
    || process.env.DB_NAME 
    || "my_app_dev";
  const server = startMysqlStudioServer({ port: preferredPort, initialDbPath });

  (globalThis as any).postMessage({
    ready: true,
    type: "mysql_studio",
    port: server.port,
    url: `http://127.0.0.1:${server.port}`,
  });
}
