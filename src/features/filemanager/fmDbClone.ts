/**
 * Cross-engine database and table cloning for the File Manager Databases tool.
 *
 * Supports cloning whole databases, selected tables, views, indexes, foreign keys, and Redis key groups
 * across all four supported engines (`sqlite`, `mysql`, `postgres`, `redis`), as well as directly from/to
 * SQLite files on disk or into a brand-new SQLite database file.
 *
 * Passwords are resolved on the server from the OS keychain and never appear in any response or error message.
 */
import { existsSync, promises as fsp, statSync } from "fs";
import { RedisClient } from "bun";
import { createAdapter } from "../../db";
import { DbError, normalizeError, redact } from "../../db/errors";
import { placeholder, quoteIdent, quoteRef } from "../../db/quote";
import type { ColumnInfo, ConnectionConfig, DbAdapter, Engine, ForeignKeyInfo, IndexInfo, ObjectRef, Param, TableInfo, WireValue } from "../../db/types";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { effectiveFor, isObject, profileFor, testInputFor } from "./fmDbCommon";
import type { CloneRedisClient } from "./fmDbHooks";
import { ENGINES, type DbEngine } from "./fmDbModel";
import { checkSqlitePath, dbState } from "./fmDbState";
import type { DbProfile } from "./fmDbStore";
import { TEST_TIMEOUT_MS, type TestInput } from "./fmDbTest";
import { makeSqliteFile } from "./fmNewSqlite";
import { FmError, cleanName, validateName } from "./fmPaths";

export type CloneConflictMode = "replace" | "truncate" | "append" | "upsert" | "skip" | "fail";
export type CloneContentMode = "all" | "schema" | "data";
export type CloneViewMode = "view" | "table";
export type CloneRedisFormat = "hash" | "json";

export type CloneCanonicalType =
  | "integer"
  | "bigint"
  | "float"
  | "decimal"
  | "boolean"
  | "varchar"
  | "text"
  | "binary"
  | "date"
  | "time"
  | "timestamp"
  | "json"
  | "uuid";

export interface CloneSourceColumn {
  name: string;
  dataType: string;
  canonicalType: CloneCanonicalType;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  defaultValue: string | null;
  primaryKeyPosition: number | null;
  autoIncrement: boolean;
  generated: boolean;
}

export interface CloneSourceObject {
  name: string;
  schema?: string;
  kind: "table" | "view" | "redis_group";
  rowCount: number;
  columns: CloneSourceColumn[];
  primaryKey: string[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
  viewSql?: string | null;
  redisKeyType?: string;
  sampleKeys?: string[];
}

export interface CloneInspectResult {
  source: {
    kind: "profile" | "sqliteFile";
    engine: DbEngine;
    engineLabel: string;
    label: string;
    profileId?: string;
    path?: string;
    schema?: string;
    production: boolean;
    readOnly: boolean;
  };
  objects: CloneSourceObject[];
  totalRows: number;
}

export interface CloneOptions {
  /** Selected source object names (tables, views, or Redis key groups). Empty/omitted = all objects. */
  tables?: string[];
  /** Optional prefix prepended to every target table or Redis key group. */
  tablePrefix?: string;
  /** Optional explicit per-object target name map: sourceName -> targetName. */
  renameMap?: Record<string, string>;
  /** What to copy: "all" (schema + data), "schema" (DDL only), or "data" (rows only). */
  contentMode?: CloneContentMode;
  /** How to handle an existing target table or Redis key. */
  conflictMode?: CloneConflictMode;
  /** Copy secondary indexes on SQL targets (default true). */
  includeIndexes?: boolean;
  /** Copy foreign key constraints on SQL targets (default true). */
  includeForeignKeys?: boolean;
  /** Include views when cloning (default true). */
  includeViews?: boolean;
  /** How views should be created on the target: "view" (CREATE VIEW when possible, fallback to table) or "table" (materialize as table). */
  viewMode?: CloneViewMode;
  /** Maximum rows/keys to copy per table/group (0 or undefined = no limit). */
  rowLimit?: number;
  /** When cloning SQL tables into Redis: store each row as a Redis "hash" (default) or "json" string. */
  redisFormat?: CloneRedisFormat;
}

export interface CloneTablePlan {
  sourceName: string;
  targetName: string;
  kind: "table" | "view" | "redis_group";
  estimatedRows: number;
  targetExists: boolean;
  action: "create" | "replace" | "truncate" | "append" | "upsert" | "skip" | "fail";
  ddl: string[];
}

export interface ClonePreviewResult {
  source: CloneInspectResult["source"];
  target: {
    kind: "profile" | "sqliteFile" | "newSqlite";
    engine: DbEngine;
    engineLabel: string;
    label: string;
    profileId?: string;
    path?: string;
    schema?: string;
    production: boolean;
    readOnly: boolean;
  };
  plans: CloneTablePlan[];
  totalEstimatedRows: number;
  warnings: string[];
  needsConfirm: boolean;
  confirmReason?: "production" | "readonly" | "destructive";
}

export interface CloneTableResult {
  sourceName: string;
  targetName: string;
  kind: "table" | "view" | "redis_group";
  status: "copied" | "created" | "skipped";
  rowsCopied: number;
  indexesCreated: number;
  foreignKeysCreated: number;
  note?: string;
}

export interface CloneRunResult {
  summary: {
    sourceLabel: string;
    sourceEngine: DbEngine;
    targetLabel: string;
    targetEngine: DbEngine;
    tablesCreated: number;
    tablesCopied: number;
    viewsCopied: number;
    indexesCreated: number;
    foreignKeysCreated: number;
    rowsCopied: number;
    keysCopied: number;
    skippedCount: number;
    elapsedMs: number;
    warnings: string[];
    results: CloneTableResult[];
  };
  createdPath?: string;
  createdProfile?: DbProfile | null;
}

interface ResolvedEndpoint {
  kind: "profile" | "sqliteFile" | "newSqlite";
  engine: DbEngine;
  label: string;
  profile: DbProfile | null;
  profileId?: string;
  path?: string;
  newSqlite?: { folder: string; name: string; fullPath: string; saveProfile: boolean; connectionName?: string };
  schema?: string;
  production: boolean;
  readOnly: boolean;
  testInput: TestInput;
  password?: string;
}

const VALID_TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,119}$/;
const MAX_REDIS_SCAN = 5000;
const BATCH_ROWS = 250;

function sanitizeTargetIdentifier(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const cleaned = trimmed.replace(/[\0\r\n]/g, "").slice(0, 120);
  if (VALID_TABLE_NAME.test(cleaned)) return cleaned;
  const safe = cleaned.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([0-9])/, "_$1");
  return safe || fallback;
}

export function classifyCanonicalType(engine: DbEngine, rawType: string): {
  canonicalType: CloneCanonicalType;
  length?: number;
  precision?: number;
  scale?: number;
} {
  const t = (rawType || "").trim().toLowerCase();
  const paren = /\(([^)]*)\)/.exec(t)?.[1];
  const base = t.replace(/\([^)]*\)/g, "").replace(/\b(unsigned|zerofill|signed)\b/g, "").replace(/\s+/g, " ").trim();
  const nums = paren ? paren.split(",").map((x) => Number(x.trim())) : [];

  if (base === "tinyint" && nums[0] === 1 && engine !== "postgres") return { canonicalType: "boolean" };
  if (/^(bool|boolean|bit)$/.test(base)) return { canonicalType: "boolean" };
  if (/^(uuid|uniqueidentifier)$/.test(base)) return { canonicalType: "uuid" };
  if (/^(json|jsonb)$/.test(base)) return { canonicalType: "json" };
  if (/^date$/.test(base)) return { canonicalType: "date" };
  if (/^time( with(out)? time zone)?$|^timetz$/.test(base)) return { canonicalType: "time" };
  if (/^(datetime|timestamp|timestamptz|timestamp with time zone|timestamp without time zone)\b/.test(base)) return { canonicalType: "timestamp" };
  if (/^(bigint|int8|bigserial|serial8)$/.test(base)) return { canonicalType: "bigint" };
  if (/^(tinyint|smallint|mediumint|int|integer|int2|int4|serial|serial2|serial4)$/.test(base) || (engine === "sqlite" && /int/.test(base))) {
    return { canonicalType: "integer" };
  }
  if (/^(decimal|numeric|dec|fixed|money)$/.test(base)) {
    const precision = Number.isFinite(nums[0]) && nums[0]! > 0 ? Math.min(38, Math.trunc(nums[0]!)) : 18;
    const scale = Number.isFinite(nums[1]) && nums[1]! >= 0 ? Math.min(precision, Math.trunc(nums[1]!)) : 4;
    return { canonicalType: "decimal", precision, scale };
  }
  if (/^(float|double|double precision|real|float4|float8)$/.test(base) || (engine === "sqlite" && /real|floa|doub/.test(base))) {
    return { canonicalType: "float" };
  }
  if (/^(blob|tinyblob|mediumblob|longblob|bytea|binary|varbinary)$/.test(base) || (engine === "sqlite" && /blob/.test(base))) {
    return { canonicalType: "binary", ...(Number.isFinite(nums[0]) && nums[0]! > 0 ? { length: Math.trunc(nums[0]!) } : {}) };
  }
  if (/^(char|varchar|character|character varying|nchar|nvarchar|bpchar)$/.test(base)) {
    const length = Number.isFinite(nums[0]) && nums[0]! > 0 ? Math.min(65535, Math.trunc(nums[0]!)) : 255;
    return { canonicalType: "varchar", length };
  }
  return { canonicalType: "text" };
}

export function columnTypeForTarget(
  col: CloneSourceColumn,
  targetEngine: Engine,
  indexedOrKeyed: boolean,
): string {
  const len = col.length && col.length > 0 ? col.length : 255;
  const p = col.precision && col.precision > 0 ? Math.min(38, col.precision) : 18;
  const s = col.scale !== undefined && col.scale >= 0 ? Math.min(p, col.scale) : 4;

  switch (col.canonicalType) {
    case "integer":
      return targetEngine === "sqlite" ? "INTEGER" : targetEngine === "mysql" ? "INT" : "INTEGER";
    case "bigint":
      return targetEngine === "sqlite" ? "INTEGER" : "BIGINT";
    case "float":
      return targetEngine === "sqlite" ? "REAL" : targetEngine === "mysql" ? "DOUBLE" : "DOUBLE PRECISION";
    case "decimal":
      return targetEngine === "sqlite" ? `NUMERIC(${p},${s})` : targetEngine === "mysql" ? `DECIMAL(${p},${s})` : `NUMERIC(${p},${s})`;
    case "boolean":
      return targetEngine === "mysql" ? "TINYINT(1)" : "BOOLEAN";
    case "uuid":
      return targetEngine === "postgres" ? "UUID" : targetEngine === "mysql" ? "CHAR(36)" : "TEXT";
    case "json":
      return targetEngine === "postgres" ? "JSONB" : targetEngine === "mysql" ? "JSON" : "TEXT";
    case "date":
      return "DATE";
    case "time":
      return "TIME";
    case "timestamp":
      return targetEngine === "mysql" ? "DATETIME" : targetEngine === "postgres" ? "TIMESTAMPTZ" : "TIMESTAMP";
    case "binary":
      if (targetEngine === "sqlite") return "BLOB";
      if (targetEngine === "postgres") return "BYTEA";
      return indexedOrKeyed ? `VARBINARY(${Math.min(255, len)})` : "LONGBLOB";
    case "varchar":
      if (targetEngine === "sqlite") return `VARCHAR(${len})`;
      if (targetEngine === "postgres") return len <= 10485760 ? `VARCHAR(${len})` : "TEXT";
      if (indexedOrKeyed && len > 255) return "VARCHAR(255)";
      return len <= 16383 ? `VARCHAR(${len})` : "LONGTEXT";
    case "text":
    default:
      if (targetEngine === "mysql") return indexedOrKeyed ? "VARCHAR(255)" : "LONGTEXT";
      return "TEXT";
  }
}

function translateDefaultClause(col: CloneSourceColumn, targetEngine: Engine): string {
  const raw = col.defaultValue?.trim();
  if (!raw || col.autoIncrement || col.generated) return "";
  if (/^null$/i.test(raw) || /^null::/i.test(raw)) return "";
  if (/^nextval\(/i.test(raw)) return "";
  // Strip PostgreSQL type cast suffix like `'member'::character varying`
  const stripped = raw.replace(/::[a-zA-Z0-9_ ]+(\[\])?$/, "").trim();
  if (/^(current_timestamp(\(\d*\))?|now\(\)|datetime\('now'\))$/i.test(stripped)) {
    if (col.canonicalType === "timestamp" || col.canonicalType === "text" || col.canonicalType === "varchar") {
      return " DEFAULT CURRENT_TIMESTAMP";
    }
    return "";
  }
  if (/^(true|false)$/i.test(stripped)) {
    const isTrue = /^true$/i.test(stripped);
    if (targetEngine === "mysql" || targetEngine === "sqlite") return ` DEFAULT ${isTrue ? "1" : "0"}`;
    return ` DEFAULT ${isTrue ? "TRUE" : "FALSE"}`;
  }
  if (col.canonicalType === "boolean" && (stripped === "1" || stripped === "0")) {
    if (targetEngine === "postgres") return ` DEFAULT ${stripped === "1" ? "TRUE" : "FALSE"}`;
    return ` DEFAULT ${stripped}`;
  }
  if (/^[+-]?\d+(\.\d+)?$/.test(stripped)) {
    return ` DEFAULT ${stripped}`;
  }
  const quoted = /^'((?:[^']|'')*)'$/.exec(stripped);
  if (quoted) {
    if (targetEngine === "mysql" && (col.canonicalType === "text" || col.canonicalType === "json" || col.canonicalType === "binary")) {
      // MySQL TEXT/BLOB/JSON columns cannot have a plain literal default in strict modes across all versions.
      return "";
    }
    if (col.canonicalType === "timestamp" && targetEngine === "mysql") {
      const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(quoted[1]!.trim());
      if (m) return ` DEFAULT '${m[1]} ${m[2]}'`;
      return "";
    }
    if (col.canonicalType === "date" && targetEngine === "mysql") {
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(quoted[1]!.trim());
      if (m) return ` DEFAULT '${m[1]}'`;
      return "";
    }
    return ` DEFAULT ${stripped}`;
  }
  return "";
}

function safeRule(rule?: string): string {
  const u = (rule ?? "").trim().toUpperCase();
  if (u === "CASCADE" || u === "SET NULL" || u === "RESTRICT" || u === "NO ACTION" || u === "SET DEFAULT") return u;
  return "NO ACTION";
}

export function buildCreateTableDdl(
  obj: CloneSourceObject,
  targetName: string,
  targetEngine: Engine,
  targetSchema: string | undefined,
  opts: {
    ifNotExists?: boolean;
    includeForeignKeys?: boolean;
    tableNameMap: Map<string, string>;
    existingTargetTables: Set<string>;
  },
): { tableDdl: string; indexDdls: string[]; fkCount: number } {
  const q = (id: string) => quoteIdent(targetEngine, id);
  const fullTarget = targetEngine === "postgres" && targetSchema ? `${q(targetSchema)}.${q(targetName)}` : q(targetName);

  const pkCols = obj.primaryKey.filter((pk) => obj.columns.some((c) => c.name === pk));
  const singlePkName = pkCols.length === 1 ? pkCols[0]! : null;
  const indexedColSet = new Set<string>(pkCols);
  for (const idx of obj.indexes) for (const c of idx.columns) indexedColSet.add(c);
  for (const fk of obj.foreignKeys) for (const c of fk.columns) indexedColSet.add(c);

  const defs: string[] = [];
  let inlineSinglePk = false;

  for (const col of obj.columns) {
    const isSinglePk = singlePkName === col.name;
    const isIndexed = indexedColSet.has(col.name);

    if (isSinglePk && col.autoIncrement) {
      inlineSinglePk = true;
      if (targetEngine === "sqlite") {
        defs.push(`${q(col.name)} INTEGER PRIMARY KEY AUTOINCREMENT`);
      } else if (targetEngine === "mysql") {
        const intType = col.canonicalType === "integer" ? "INT" : "BIGINT";
        defs.push(`${q(col.name)} ${intType} NOT NULL AUTO_INCREMENT PRIMARY KEY`);
      } else {
        const intType = col.canonicalType === "integer" ? "INTEGER" : "BIGINT";
        defs.push(`${q(col.name)} ${intType} GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`);
      }
      continue;
    }

    const sqlType = columnTypeForTarget(col, targetEngine, isIndexed);
    const notNull = !col.nullable || pkCols.includes(col.name) ? " NOT NULL" : "";
    const dflt = translateDefaultClause(col, targetEngine);
    defs.push(`${q(col.name)} ${sqlType}${notNull}${dflt}`);
  }

  if (!inlineSinglePk && pkCols.length > 0) {
    defs.push(`PRIMARY KEY (${pkCols.map(q).join(", ")})`);
  }

  let fkCount = 0;
  if (opts.includeForeignKeys !== false && obj.foreignKeys.length > 0) {
    for (const fk of obj.foreignKeys) {
      if (!fk.columns.length || !fk.refColumns.length || fk.columns.length !== fk.refColumns.length) continue;
      const mappedRef = opts.tableNameMap.get(fk.refTable) ?? (opts.existingTargetTables.has(fk.refTable) ? fk.refTable : null);
      if (!mappedRef) continue;
      const refFull = targetEngine === "postgres" && targetSchema ? `${q(targetSchema)}.${q(mappedRef)}` : q(mappedRef);
      const del = safeRule(fk.onDelete);
      const upd = safeRule(fk.onUpdate);
      defs.push(
        `FOREIGN KEY (${fk.columns.map(q).join(", ")}) REFERENCES ${refFull} (${fk.refColumns.map(q).join(", ")})` +
          (del !== "NO ACTION" ? ` ON DELETE ${del}` : "") +
          (upd !== "NO ACTION" ? ` ON UPDATE ${upd}` : ""),
      );
      fkCount++;
    }
  }

  const ifne = opts.ifNotExists ? "IF NOT EXISTS " : "";
  const suffix = targetEngine === "mysql" ? " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" : "";
  const tableDdl = `CREATE TABLE ${ifne}${fullTarget} (${defs.join(", ")})${suffix}`;

  const indexDdls: string[] = [];
  const colNames = new Set(obj.columns.map((c) => c.name));
  let idxSeq = 1;
  for (const idx of obj.indexes) {
    if (idx.primary) continue;
    const validCols = idx.columns.filter((c) => colNames.has(c));
    if (validCols.length === 0 || validCols.length !== idx.columns.length) continue;
    if (pkCols.length === validCols.length && pkCols.every((c, i) => c === validCols[i])) continue;
    const rawIdxName = `idx_${targetName}_${validCols.join("_")}_${idxSeq++}`.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 60);
    const uniq = idx.unique ? "UNIQUE " : "";
    const idxIfne = targetEngine === "mysql" ? "" : "IF NOT EXISTS ";
    indexDdls.push(`CREATE ${uniq}INDEX ${idxIfne}${q(rawIdxName)} ON ${fullTarget} (${validCols.map(q).join(", ")})`);
  }

  return { tableDdl, indexDdls, fkCount };
}

/**
 * Orders tables topologically so referenced parent tables come before child tables.
 * Handles self-references and cycles deterministically.
 */
export function topologicalSortTables(objects: CloneSourceObject[]): CloneSourceObject[] {
  const byName = new Map(objects.map((o) => [o.name, o]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: CloneSourceObject[] = [];

  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) return; // cycle guard
    visiting.add(name);
    const obj = byName.get(name);
    if (obj) {
      for (const fk of obj.foreignKeys) {
        if (fk.refTable !== name && byName.has(fk.refTable)) {
          visit(fk.refTable);
        }
      }
      visited.add(name);
      out.push(obj);
    }
    visiting.delete(name);
  }

  for (const o of objects) visit(o.name);
  return out;
}

async function resolveEndpoint(
  ctx: FmContext,
  raw: unknown,
  role: "source" | "target",
  readOnlyForSource: boolean,
): Promise<ResolvedEndpoint> {
  if (!isObject(raw)) {
    throw new FmError("BAD_REQUEST", `Choose a ${role} database.`);
  }
  const st = dbState(ctx);
  const kind = typeof raw.kind === "string" ? raw.kind : typeof raw.profileId === "string" ? "profile" : typeof raw.path === "string" ? "sqliteFile" : "";

  if (kind === "profile") {
    const profile = profileFor(st.store, raw.profileId);
    const { resolved, password } = await effectiveFor(ctx, profile.engine, profile);
    const ti = testInputFor(profile, resolved);
    if (profile.engine === "sqlite") {
      if (ti.sqliteMode === "memory" || ti.path === ":memory:") {
        throw new FmError("BAD_REQUEST", "An in-memory SQLite connection starts empty every time it is opened, so it cannot be cloned from or to here.");
      }
      const mode = readOnlyForSource ? "readonly" : ti.sqliteMode ?? "readwrite";
      ti.path = await checkSqlitePath(ctx, ti.path, mode);
    }
    return {
      kind: "profile",
      engine: profile.engine,
      label: profile.name,
      profile,
      profileId: profile.id,
      path: ti.path,
      schema: profile.engine === "postgres" ? (ti.schema || "public") : undefined,
      production: profile.environment === "production",
      readOnly: Boolean((profile as { readOnly?: boolean }).readOnly) || (profile.engine === "sqlite" && ti.sqliteMode === "readonly"),
      testInput: ti,
      password: password ?? undefined,
    };
  }

  if (kind === "sqliteFile") {
    const path = await checkSqlitePath(ctx, raw.path, readOnlyForSource ? "readonly" : "readwrite");
    const label = pathApi(ctx).basename(path);
    const ti: TestInput = { engine: "sqlite", path, sqliteMode: readOnlyForSource ? "readonly" : "readwrite", production: false };
    return {
      kind: "sqliteFile",
      engine: "sqlite",
      label,
      profile: null,
      path,
      production: false,
      readOnly: false,
      testInput: ti,
    };
  }

  if (kind === "newSqlite" && role === "target") {
    const folder = absolutePath(ctx, raw.folder);
    await assertFolder(folder, "The folder for the new database");
    assertCreatable(ctx, folder);
    const rawName = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!rawName) throw new FmError("BAD_NAME", "Give the new SQLite database file a name.");
    const reason = validateName(rawName, ctx.platform);
    if (reason) throw new FmError("BAD_NAME", reason);
    let fileName = cleanName(rawName);
    if (!/\.(sqlite|sqlite3|db|db3|s3db)$/i.test(fileName)) fileName += ".sqlite";
    const fullPath = pathApi(ctx).join(folder, fileName);
    if (existsSync(fullPath)) {
      throw new FmError("EXISTS", `"${fileName}" already exists in that folder. Choose a different file name or select it as an existing SQLite file.`);
    }
    const saveProfile = raw.saveProfile !== false;
    const connectionName = typeof raw.connectionName === "string" && raw.connectionName.trim() ? raw.connectionName.trim().slice(0, 80) : undefined;
    const ti: TestInput = { engine: "sqlite", path: fullPath, sqliteMode: "create", production: false };
    return {
      kind: "newSqlite",
      engine: "sqlite",
      label: fileName,
      profile: null,
      path: fullPath,
      newSqlite: { folder, name: fileName, fullPath, saveProfile, connectionName },
      production: false,
      readOnly: false,
      testInput: ti,
    };
  }

  throw new FmError("BAD_REQUEST", `Choose a valid ${role} database.`);
}

function openSqlAdapter(ctx: FmContext, ep: ResolvedEndpoint, readOnly: boolean): DbAdapter {
  const i = ep.testInput;
  const config: ConnectionConfig = {
    engine: ep.engine as Engine,
    path: i.path,
    sqliteMode: readOnly ? "readonly" : i.sqliteMode === "create" ? "readwrite" : (i.sqliteMode ?? "readwrite"),
    host: i.host,
    port: i.port,
    user: i.user,
    password: i.password,
    database: i.database,
    schema: i.schema,
    tls: i.tls,
    readOnly,
    connectTimeoutMs: Math.min(i.connectTimeoutMs ?? TEST_TIMEOUT_MS, TEST_TIMEOUT_MS),
    allowPublicKeyRetrieval: ep.engine === "mysql",
    maxConnections: 1,
  };
  const hook = dbState(ctx).hooks.openAdapter;
  return hook ? hook(config) : createAdapter(config);
}

async function openRedis(ctx: FmContext, ep: ResolvedEndpoint): Promise<CloneRedisClient> {
  const hook = dbState(ctx).hooks.openRedis;
  const i = ep.testInput;
  if (hook) return await hook(i);
  const tls = !!i.tls;
  const auth = i.user || i.password ? `${i.user ? encodeURIComponent(i.user) : ""}${i.password ? `:${encodeURIComponent(i.password)}` : ""}@` : "";
  const url = `${tls ? "rediss" : "redis"}://${auth}${i.host?.includes(":") ? `[${i.host}]` : i.host}:${i.port}`;
  const client = new RedisClient(
    url,
    {
      connectionTimeout: Math.min(i.connectTimeoutMs ?? TEST_TIMEOUT_MS, TEST_TIMEOUT_MS),
      autoReconnect: false,
      maxRetries: 0,
      ...(tls && typeof i.tls === "object"
        ? { tls: { rejectUnauthorized: i.tls.verify !== false, ...(i.tls.ca ? { ca: i.tls.ca } : {}) } }
        : {}),
    } as never,
  ) as RedisClient & { select(db: number): Promise<unknown> };
  await client.connect();
  await client.ping();
  if (i.dbIndex) await client.select(i.dbIndex);
  return {
    send: (cmd, args) => client.send(cmd, args),
    close: () => {
      try {
        client.close();
      } catch {}
    },
  };
}

function wrapCloneError(err: unknown, secrets: (string | undefined)[] = []): FmError {
  if (err instanceof FmError) return err;
  if (err instanceof DbError) {
    return new FmError(err.code === "INVALID_REQUEST" ? "BAD_REQUEST" : err.code, redact(err.message, secrets));
  }
  const msg = redact(err instanceof Error ? err.message : String(err), secrets).replace(/\s+/g, " ").slice(0, 260);
  return new FmError("CLONE_FAILED", msg || "The database operation could not be completed.");
}

async function scanRedisKeys(client: CloneRedisClient, prefix = "", limit = MAX_REDIS_SCAN): Promise<string[]> {
  const keys: string[] = [];
  const seen = new Set<string>();
  let cursor = "0";
  const pattern = prefix ? `${prefix}*` : "*";
  let loops = 0;
  do {
    const res: any = await client.send("SCAN", [cursor, "MATCH", pattern, "COUNT", "500"]);
    cursor = String(res?.[0] ?? "0");
    const batch = Array.isArray(res?.[1]) ? res[1].map(String) : [];
    for (const k of batch) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
        if (keys.length >= limit) return keys;
      }
    }
    loops++;
  } while (cursor !== "0" && loops < 50);
  return keys.sort();
}

function groupOfRedisKey(key: string, basePrefix = ""): string {
  const stripped = basePrefix && key.startsWith(basePrefix) ? key.slice(basePrefix.length) : key;
  const idx = stripped.indexOf(":");
  if (idx > 0) {
    const g = stripped.slice(0, idx).replace(/[^A-Za-z0-9_]/g, "_");
    return g || "redis_keys";
  }
  return "redis_keys";
}

function parseHashPairs(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      out[String(raw[i])] = String(raw[i + 1] ?? "");
    }
    return out;
  }
  if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = String(v ?? "");
    }
  }
  return out;
}

async function inspectRedisEndpoint(ctx: FmContext, ep: ResolvedEndpoint): Promise<CloneSourceObject[]> {
  const client = await openRedis(ctx, ep);
  try {
    const basePrefix = ep.testInput.keyPrefix ?? "";
    const keys = await scanRedisKeys(client, basePrefix, MAX_REDIS_SCAN);
    const byGroup = new Map<string, string[]>();
    for (const k of keys) {
      const g = groupOfRedisKey(k, basePrefix);
      let list = byGroup.get(g);
      if (!list) {
        list = [];
        byGroup.set(g, list);
      }
      list.push(k);
    }
    const objects: CloneSourceObject[] = [];
    for (const [groupName, groupKeys] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sample = groupKeys.slice(0, 15);
      const types = new Set<string>();
      const hashFields = new Set<string>();
      for (const k of sample) {
        const t = String((await client.send("TYPE", [k])) ?? "string").toLowerCase();
        if (t && t !== "none") types.add(t);
        if (t === "hash") {
          const h = parseHashPairs(await client.send("HGETALL", [k]));
          for (const f of Object.keys(h)) hashFields.add(f);
        }
      }
      const redisKeyType = types.size === 1 ? [...types][0]! : types.size > 1 ? "mixed" : "string";
      const columns: CloneSourceColumn[] =
        redisKeyType === "hash" && hashFields.size > 0
          ? [
              { name: "redis_key", dataType: "VARCHAR(255)", canonicalType: "varchar", length: 255, nullable: false, defaultValue: null, primaryKeyPosition: 1, autoIncrement: false, generated: false },
              { name: "key_id", dataType: "VARCHAR(255)", canonicalType: "varchar", length: 255, nullable: false, defaultValue: null, primaryKeyPosition: null, autoIncrement: false, generated: false },
              ...[...hashFields].slice(0, 60).map((f) => ({
                name: sanitizeTargetIdentifier(f, "field"),
                dataType: "TEXT",
                canonicalType: "text" as const,
                nullable: true,
                defaultValue: null,
                primaryKeyPosition: null,
                autoIncrement: false,
                generated: false,
              })),
              { name: "ttl_ms", dataType: "BIGINT", canonicalType: "bigint", nullable: true, defaultValue: null, primaryKeyPosition: null, autoIncrement: false, generated: false },
            ]
          : [
              { name: "redis_key", dataType: "VARCHAR(255)", canonicalType: "varchar", length: 255, nullable: false, defaultValue: null, primaryKeyPosition: 1, autoIncrement: false, generated: false },
              { name: "redis_type", dataType: "VARCHAR(32)", canonicalType: "varchar", length: 32, nullable: false, defaultValue: null, primaryKeyPosition: null, autoIncrement: false, generated: false },
              { name: "value_text", dataType: "TEXT", canonicalType: "text", nullable: true, defaultValue: null, primaryKeyPosition: null, autoIncrement: false, generated: false },
              { name: "value_json", dataType: "JSON", canonicalType: "json", nullable: true, defaultValue: null, primaryKeyPosition: null, autoIncrement: false, generated: false },
              { name: "ttl_ms", dataType: "BIGINT", canonicalType: "bigint", nullable: true, defaultValue: null, primaryKeyPosition: null, autoIncrement: false, generated: false },
            ];
      // Deduplicate column names if hash fields collided with reserved column names
      const usedNames = new Set<string>();
      for (const col of columns) {
        let candidate = col.name;
        let n = 2;
        while (usedNames.has(candidate.toLowerCase())) {
          candidate = `${col.name}_${n++}`;
        }
        col.name = candidate;
        usedNames.add(candidate.toLowerCase());
      }
      objects.push({
        name: groupName,
        kind: "redis_group",
        rowCount: groupKeys.length,
        columns,
        primaryKey: ["redis_key"],
        indexes: [],
        foreignKeys: [],
        redisKeyType,
        sampleKeys: groupKeys.slice(0, 5),
      });
    }
    return objects;
  } finally {
    client.close();
  }
}

async function inspectSqlEndpoint(ctx: FmContext, ep: ResolvedEndpoint): Promise<CloneSourceObject[]> {
  const adapter = openSqlAdapter(ctx, ep, true);
  try {
    await adapter.connect();
    const refs = await adapter.listObjects();
    const filtered = refs.filter((r) => !ep.schema || !r.schema || r.schema === ep.schema);
    const objects: CloneSourceObject[] = [];
    for (const ref of filtered) {
      let info: TableInfo;
      try {
        info = await adapter.describeTable(ref);
      } catch {
        continue;
      }
      let rowCount = 0;
      try {
        const qRef = quoteRef(ep.engine as Engine, { schema: info.schema, name: info.name });
        const cnt = await adapter.query(`SELECT COUNT(*) AS c FROM ${qRef}`);
        const firstVal = cnt.rows[0] ? Object.values(cnt.rows[0])[0] : 0;
        rowCount = Number(firstVal ?? 0) || 0;
      } catch {
        rowCount = 0;
      }
      let viewSql: string | null = null;
      if (info.type === "view") {
        try {
          if (ep.engine === "sqlite") {
            const r = await adapter.query("SELECT sql FROM sqlite_master WHERE type = 'view' AND name = ?", [info.name]);
            viewSql = typeof r.rows[0]?.sql === "string" ? r.rows[0].sql : null;
          } else if (ep.engine === "mysql") {
            const r = await adapter.query("SELECT view_definition AS v FROM information_schema.views WHERE table_schema = DATABASE() AND table_name = ?", [info.name]);
            const def = r.rows[0]?.v ?? r.rows[0]?.V;
            if (typeof def === "string" && def.trim()) viewSql = `CREATE VIEW ${quoteIdent("mysql", info.name)} AS ${def}`;
          } else if (ep.engine === "postgres") {
            const r = await adapter.query("SELECT pg_get_viewdef((quote_ident($1) || '.' || quote_ident($2))::regclass, true) AS v", [info.schema || ep.schema || "public", info.name]);
            const def = r.rows[0]?.v;
            if (typeof def === "string" && def.trim()) viewSql = `CREATE VIEW ${quoteRef("postgres", { schema: info.schema || ep.schema || "public", name: info.name })} AS ${def}`;
          }
        } catch {
          viewSql = null;
        }
      }
      const columns: CloneSourceColumn[] = info.columns
        .filter((c) => !c.generated)
        .map((c) => {
          const classified = classifyCanonicalType(ep.engine, c.dataType);
          return {
            name: c.name,
            dataType: c.dataType,
            ...classified,
            nullable: c.nullable,
            defaultValue: c.defaultValue,
            primaryKeyPosition: c.primaryKeyPosition,
            autoIncrement: c.autoIncrement,
            generated: c.generated,
          };
        });
      objects.push({
        name: info.name,
        ...(info.schema ? { schema: info.schema } : {}),
        kind: info.type,
        rowCount,
        columns,
        primaryKey: info.primaryKey,
        indexes: info.indexes,
        foreignKeys: info.foreignKeys,
        viewSql,
      });
    }
    return objects;
  } finally {
    await adapter.close().catch(() => {});
  }
}

export async function inspectCloneSource(ctx: FmContext, sourceInput: unknown): Promise<CloneInspectResult> {
  const ep = await resolveEndpoint(ctx, sourceInput, "source", true);
  try {
    const objects = ep.engine === "redis" ? await inspectRedisEndpoint(ctx, ep) : await inspectSqlEndpoint(ctx, ep);
    if (ep.profileId) dbState(ctx).store.markUsed(ep.profileId);
    return {
      source: {
        kind: ep.kind === "profile" ? "profile" : "sqliteFile",
        engine: ep.engine,
        engineLabel: ENGINES[ep.engine].label,
        label: ep.label,
        ...(ep.profileId ? { profileId: ep.profileId } : {}),
        ...(ep.path ? { path: ep.path } : {}),
        ...(ep.schema ? { schema: ep.schema } : {}),
        production: ep.production,
        readOnly: ep.readOnly,
      },
      objects,
      totalRows: objects.reduce((sum, o) => sum + o.rowCount, 0),
    };
  } catch (err) {
    throw wrapCloneError(err, [ep.password]);
  }
}

function normalizeOptions(raw: unknown): Required<Omit<CloneOptions, "tables" | "renameMap" | "rowLimit">> & {
  tables: string[] | null;
  renameMap: Record<string, string>;
  rowLimit: number | null;
} {
  const o = isObject(raw) ? raw : {};
  const contentMode: CloneContentMode = o.contentMode === "schema" || o.contentMode === "data" ? o.contentMode : "all";
  const conflictMode: CloneConflictMode =
    o.conflictMode === "replace" ||
    o.conflictMode === "truncate" ||
    o.conflictMode === "append" ||
    o.conflictMode === "upsert" ||
    o.conflictMode === "skip" ||
    o.conflictMode === "fail"
      ? o.conflictMode
      : "replace";
  const viewMode: CloneViewMode = o.viewMode === "table" ? "table" : "view";
  const redisFormat: CloneRedisFormat = o.redisFormat === "json" ? "json" : "hash";
  const tablePrefix = typeof o.tablePrefix === "string" ? o.tablePrefix.trim().replace(/[^A-Za-z0-9_:-]/g, "_") : "";
  const renameMap: Record<string, string> = {};
  if (isObject(o.renameMap)) {
    for (const [k, v] of Object.entries(o.renameMap)) {
      if (typeof v === "string" && v.trim()) renameMap[k] = v.trim();
    }
  }
  const tables = Array.isArray(o.tables) ? o.tables.filter((t): t is string => typeof t === "string" && t.trim().length > 0) : null;
  const rowLimit = Number.isFinite(Number(o.rowLimit)) && Number(o.rowLimit) > 0 ? Math.min(1_000_000, Math.trunc(Number(o.rowLimit))) : null;
  return {
    tables,
    tablePrefix,
    renameMap,
    contentMode,
    conflictMode,
    includeIndexes: o.includeIndexes !== false,
    includeForeignKeys: o.includeForeignKeys !== false,
    includeViews: o.includeViews !== false,
    viewMode,
    rowLimit,
    redisFormat,
  };
}

function resolveTargetName(sourceName: string, opts: ReturnType<typeof normalizeOptions>, targetEngine: DbEngine): string {
  const explicit = opts.renameMap[sourceName];
  const raw = explicit ? explicit : `${opts.tablePrefix}${sourceName}`;
  if (targetEngine === "redis") {
    return raw.replace(/[\0\r\n]/g, "").slice(0, 120) || sourceName;
  }
  return sanitizeTargetIdentifier(raw, sourceName);
}

function endpointsAreSameDatabase(src: ResolvedEndpoint, dst: ResolvedEndpoint): boolean {
  if (src.engine !== dst.engine) return false;
  if (src.profileId && dst.profileId && src.profileId === dst.profileId) return true;
  if (src.engine === "sqlite") {
    return Boolean(src.path && dst.path && src.path === dst.path);
  }
  const a = src.testInput;
  const b = dst.testInput;
  if (src.engine === "redis") {
    return (a.host ?? "localhost") === (b.host ?? "localhost") && (a.port ?? 6379) === (b.port ?? 6379) && (a.dbIndex ?? 0) === (b.dbIndex ?? 0);
  }
  return (
    (a.host ?? "localhost") === (b.host ?? "localhost") &&
    a.port === b.port &&
    (a.database ?? "") === (b.database ?? "") &&
    (src.schema ?? "public") === (dst.schema ?? "public")
  );
}

async function listExistingTargetNames(ctx: FmContext, dst: ResolvedEndpoint): Promise<Set<string>> {
  if (dst.kind === "newSqlite") return new Set();
  if (dst.engine === "redis") {
    const client = await openRedis(ctx, dst);
    try {
      const keys = await scanRedisKeys(client, dst.testInput.keyPrefix ?? "", 1000);
      const groups = new Set<string>();
      for (const k of keys) groups.add(groupOfRedisKey(k, dst.testInput.keyPrefix ?? ""));
      return groups;
    } finally {
      client.close();
    }
  }
  const adapter = openSqlAdapter(ctx, dst, true);
  try {
    await adapter.connect();
    const objs = await adapter.listObjects();
    return new Set(objs.filter((o) => !dst.schema || !o.schema || o.schema === dst.schema).map((o) => o.name));
  } finally {
    await adapter.close().catch(() => {});
  }
}

function buildPlanAndPreview(
  src: ResolvedEndpoint,
  dst: ResolvedEndpoint,
  sourceObjects: CloneSourceObject[],
  existingTargetNames: Set<string>,
  opts: ReturnType<typeof normalizeOptions>,
): ClonePreviewResult {
  const warnings: string[] = [];
  const selectedSet = opts.tables ? new Set(opts.tables) : null;
  let chosen = sourceObjects.filter((o) => (!selectedSet || selectedSet.has(o.name)) && (opts.includeViews || o.kind !== "view"));
  if (chosen.length === 0) {
    throw new FmError("BAD_REQUEST", "Select at least one table, view or key group to clone.");
  }

  const tablesOnly = chosen.filter((o) => o.kind !== "view");
  const viewsOnly = chosen.filter((o) => o.kind === "view");
  const ordered = [...topologicalSortTables(tablesOnly), ...viewsOnly];

  const tableNameMap = new Map<string, string>();
  const seenTargets = new Set<string>();
  const sameDb = endpointsAreSameDatabase(src, dst);

  for (const obj of ordered) {
    const tName = resolveTargetName(obj.name, opts, dst.engine);
    if (sameDb && tName.toLowerCase() === obj.name.toLowerCase()) {
      throw new FmError(
        "BAD_REQUEST",
        `Source and target are the same database ("${src.label}"). Add a table prefix or rename "${obj.name}" so it doesn't overwrite itself.`,
      );
    }
    if (seenTargets.has(tName.toLowerCase())) {
      throw new FmError("BAD_REQUEST", `Two source objects map to the same target name "${tName}". Give each a distinct target name.`);
    }
    seenTargets.add(tName.toLowerCase());
    tableNameMap.set(obj.name, tName);
  }

  if (src.engine !== dst.engine) {
    if (src.engine === "redis") {
      warnings.push(`Redis key groups will be structured into ${ENGINES[dst.engine].label} tables (hash fields become columns; other key types use redis_key, redis_type, value_text, value_json, ttl_ms).`);
    } else if (dst.engine === "redis") {
      warnings.push(
        `SQL tables will be cloned into Redis as ${opts.redisFormat === "json" ? "JSON strings" : "Redis Hashes"} named "<tableName>:<primaryKey>" with an index set "<tableName>:_ids".`,
      );
    } else {
      warnings.push(`Column types, auto-increment keys and defaults will be translated from ${ENGINES[src.engine].label} to ${ENGINES[dst.engine].label}.`);
    }
  }

  const plans: CloneTablePlan[] = [];
  for (const obj of ordered) {
    const targetName = tableNameMap.get(obj.name)!;
    const exists = existingTargetNames.has(targetName);
    const estimatedRows = opts.contentMode === "schema" ? 0 : opts.rowLimit ? Math.min(obj.rowCount, opts.rowLimit) : obj.rowCount;
    let action: CloneTablePlan["action"] = "create";
    if (exists) {
      action = opts.conflictMode;
    } else if (opts.contentMode === "data") {
      warnings.push(`"${targetName}" does not exist on the target yet; its table structure will be created before copying rows.`);
    }

    const ddl: string[] = [];
    if (dst.engine === "redis") {
      const prefix = dst.testInput.keyPrefix ?? "";
      if (exists && opts.conflictMode === "replace") ddl.push(`DEL ${prefix}${targetName}:*`);
      ddl.push(
        opts.redisFormat === "json"
          ? `SET ${prefix}${targetName}:<id> "{...json...}" (${estimatedRows} keys)`
          : `HSET ${prefix}${targetName}:<id> <col> <val> ... (${estimatedRows} hashes)`,
      );
    } else {
      const qTarget = dst.engine === "postgres" && dst.schema ? `${quoteIdent("postgres", dst.schema)}.${quoteIdent("postgres", targetName)}` : quoteIdent(dst.engine as Engine, targetName);
      if (exists && opts.conflictMode === "replace") {
        ddl.push(`DROP ${obj.kind === "view" && opts.viewMode === "view" && src.engine === dst.engine ? "VIEW" : "TABLE"} IF EXISTS ${qTarget}`);
      } else if (exists && opts.conflictMode === "truncate") {
        ddl.push(`DELETE FROM ${qTarget}`);
      }
      if (!exists || opts.conflictMode === "replace") {
        if (obj.kind === "view" && opts.viewMode === "view" && src.engine === dst.engine && obj.viewSql && targetName === obj.name) {
          ddl.push(obj.viewSql);
        } else {
          if (obj.kind === "view" && (src.engine !== dst.engine || opts.viewMode === "table" || targetName !== obj.name)) {
            warnings.push(`View "${obj.name}" will be materialized as table "${targetName}" on ${ENGINES[dst.engine].label}.`);
          }
          const built = buildCreateTableDdl(obj, targetName, dst.engine as Engine, dst.schema, {
            ifNotExists: opts.conflictMode !== "replace",
            includeForeignKeys: opts.includeForeignKeys,
            tableNameMap,
            existingTargetTables: existingTargetNames,
          });
          ddl.push(built.tableDdl);
          if (opts.includeIndexes) ddl.push(...built.indexDdls);
        }
      }
    }

    plans.push({
      sourceName: obj.name,
      targetName,
      kind: obj.kind,
      estimatedRows,
      targetExists: exists,
      action,
      ddl,
    });
  }

  const destructive = plans.some((p) => p.targetExists && (p.action === "replace" || p.action === "truncate"));
  const confirmReason = dst.production ? "production" : dst.readOnly ? "readonly" : destructive ? "destructive" : undefined;

  return {
    source: {
      kind: src.kind === "profile" ? "profile" : "sqliteFile",
      engine: src.engine,
      engineLabel: ENGINES[src.engine].label,
      label: src.label,
      ...(src.profileId ? { profileId: src.profileId } : {}),
      ...(src.path ? { path: src.path } : {}),
      ...(src.schema ? { schema: src.schema } : {}),
      production: src.production,
      readOnly: src.readOnly,
    },
    target: {
      kind: dst.kind,
      engine: dst.engine,
      engineLabel: ENGINES[dst.engine].label,
      label: dst.label,
      ...(dst.profileId ? { profileId: dst.profileId } : {}),
      ...(dst.path ? { path: dst.path } : {}),
      ...(dst.schema ? { schema: dst.schema } : {}),
      production: dst.production,
      readOnly: dst.readOnly,
    },
    plans,
    totalEstimatedRows: plans.reduce((s, p) => s + (p.action === "skip" ? 0 : p.estimatedRows), 0),
    warnings: [...new Set(warnings)],
    needsConfirm: Boolean(dst.production || dst.readOnly),
    ...(confirmReason ? { confirmReason } : {}),
  };
}

export async function previewClone(ctx: FmContext, body: Record<string, any>): Promise<ClonePreviewResult> {
  const src = await resolveEndpoint(ctx, body.source, "source", true);
  const dst = await resolveEndpoint(ctx, body.target, "target", false);
  const opts = normalizeOptions(body.options);
  try {
    const sourceObjects = src.engine === "redis" ? await inspectRedisEndpoint(ctx, src) : await inspectSqlEndpoint(ctx, src);
    const existingTargetNames = await listExistingTargetNames(ctx, dst);
    return buildPlanAndPreview(src, dst, sourceObjects, existingTargetNames, opts);
  } catch (err) {
    throw wrapCloneError(err, [src.password, dst.password]);
  }
}

function toTargetParam(val: WireValue, col: CloneSourceColumn, targetEngine: Engine): Param {
  if (val === null || val === undefined) return null;
  if (typeof val === "object" && !Array.isArray(val) && "$binary" in val && typeof (val as { $binary: unknown }).$binary === "string") {
    return { $binary: (val as { $binary: string }).$binary };
  }
  if (col.canonicalType === "boolean") {
    const b =
      typeof val === "boolean"
        ? val
        : typeof val === "number"
          ? val !== 0
          : typeof val === "string"
            ? /^(1|true|t|yes|y)$/i.test(val.trim())
            : Boolean(val);
    return targetEngine === "postgres" ? b : b ? 1 : 0;
  }
  if (col.canonicalType === "date" && typeof val === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(val.trim());
    if (m) return m[1]!;
  }
  if (col.canonicalType === "timestamp" && targetEngine === "mysql" && typeof val === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(val.trim());
    if (m) return `${m[1]} ${m[2]}`;
  }
  if (col.canonicalType === "json") {
    if (typeof val === "string") {
      try {
        return { $json: JSON.parse(val) };
      } catch {
        return targetEngine === "postgres" ? { $json: val } : val;
      }
    }
    return { $json: val };
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  if (typeof val === "boolean") {
    return targetEngine === "postgres" ? val : val ? 1 : 0;
  }
  return val;
}

function buildInsertBatchSql(
  targetEngine: Engine,
  targetSchema: string | undefined,
  targetName: string,
  columns: CloneSourceColumn[],
  primaryKey: string[],
  rowCount: number,
  conflictMode: CloneConflictMode,
): string {
  const q = (id: string) => quoteIdent(targetEngine, id);
  const fullTarget = targetEngine === "postgres" && targetSchema ? `${q(targetSchema)}.${q(targetName)}` : q(targetName);
  const colList = columns.map((c) => q(c.name)).join(", ");

  const groups: string[] = [];
  let pIdx = 1;
  for (let r = 0; r < rowCount; r++) {
    const phs = columns.map(() => placeholder(targetEngine, pIdx++));
    groups.push(`(${phs.join(", ")})`);
  }
  const valuesClause = groups.join(", ");

  const validPk = primaryKey.filter((k) => columns.some((c) => c.name === k));
  const nonPkCols = columns.map((c) => c.name).filter((n) => !validPk.includes(n));

  if (conflictMode === "append") {
    if (targetEngine === "sqlite") return `INSERT OR IGNORE INTO ${fullTarget} (${colList}) VALUES ${valuesClause}`;
    if (targetEngine === "mysql") return `INSERT IGNORE INTO ${fullTarget} (${colList}) VALUES ${valuesClause}`;
    return `INSERT INTO ${fullTarget} (${colList}) VALUES ${valuesClause} ON CONFLICT DO NOTHING`;
  }

  if (conflictMode === "upsert" && validPk.length > 0) {
    if (targetEngine === "mysql") {
      const updates = (nonPkCols.length ? nonPkCols : validPk).map((c) => `${q(c)} = VALUES(${q(c)})`).join(", ");
      return `INSERT INTO ${fullTarget} (${colList}) VALUES ${valuesClause} ON DUPLICATE KEY UPDATE ${updates}`;
    }
    const pkList = validPk.map(q).join(", ");
    if (nonPkCols.length === 0) {
      return `INSERT INTO ${fullTarget} (${colList}) VALUES ${valuesClause} ON CONFLICT (${pkList}) DO NOTHING`;
    }
    const updates = nonPkCols.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(", ");
    return `INSERT INTO ${fullTarget} (${colList}) VALUES ${valuesClause} ON CONFLICT (${pkList}) DO UPDATE SET ${updates}`;
  }

  return `INSERT INTO ${fullTarget} (${colList}) VALUES ${valuesClause}`;
}

async function syncPostgresSequences(
  adapter: DbAdapter,
  schema: string,
  tableName: string,
  columns: CloneSourceColumn[],
): Promise<void> {
  const qSchema = quoteIdent("postgres", schema);
  const qTable = quoteIdent("postgres", tableName);
  const full = `${qSchema}.${qTable}`;
  for (const col of columns) {
    if (!col.autoIncrement && col.primaryKeyPosition !== 1) continue;
    if (col.canonicalType !== "integer" && col.canonicalType !== "bigint") continue;
    const qCol = quoteIdent("postgres", col.name);
    try {
      await adapter.query(
        `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${qCol}) FROM ${full}), 1), (SELECT COUNT(*) > 0 FROM ${full}))`,
        [`${schema}.${tableName}`, col.name],
      );
    } catch {
      // Table may not have an attached sequence if it existed previously without identity/serial
    }
  }
}

async function executeSqlToSqlClone(
  ctx: FmContext,
  src: ResolvedEndpoint,
  dst: ResolvedEndpoint,
  preview: ClonePreviewResult,
  sourceObjects: CloneSourceObject[],
  opts: ReturnType<typeof normalizeOptions>,
): Promise<CloneTableResult[]> {
  const sameSqliteFile = src.engine === "sqlite" && dst.engine === "sqlite" && src.path && dst.path && src.path === dst.path;
  const dstAdapter = openSqlAdapter(ctx, dst, false);
  const srcAdapter = sameSqliteFile ? dstAdapter : openSqlAdapter(ctx, src, true);

  try {
    await dstAdapter.connect();
    if (!sameSqliteFile) await srcAdapter.connect();

    const bySource = new Map(sourceObjects.map((o) => [o.name, o]));
    const tableNameMap = new Map(preview.plans.map((p) => [p.sourceName, p.targetName]));
    const existingSet = new Set(preview.plans.filter((p) => p.targetExists).map((p) => p.targetName));

    for (const plan of preview.plans) {
      if (plan.targetExists && plan.action === "fail") {
        throw new FmError("CONFLICT", `Target table "${plan.targetName}" already exists in "${dst.label}".`);
      }
    }

    // If replacing existing tables, drop them in reverse topological order so foreign keys do not block drops
    const toDrop = [...preview.plans].reverse().filter((p) => p.targetExists && p.action === "replace");
    if (toDrop.length > 0 && dst.engine === "mysql") {
      await dstAdapter.query("SET FOREIGN_KEY_CHECKS = 0").catch(() => {});
    }
    try {
      for (const p of toDrop) {
        const qTarget =
          dst.engine === "postgres" && dst.schema
            ? `${quoteIdent("postgres", dst.schema)}.${quoteIdent("postgres", p.targetName)}`
            : quoteIdent(dst.engine as Engine, p.targetName);
        if (p.kind === "view") {
          try {
            await dstAdapter.query(`DROP VIEW IF EXISTS ${qTarget}`);
          } catch {}
        }
        try {
          const cascade = dst.engine === "postgres" ? " CASCADE" : "";
          await dstAdapter.query(`DROP TABLE IF EXISTS ${qTarget}${cascade}`);
        } catch {
          await dstAdapter.query(`DROP VIEW IF EXISTS ${qTarget}`).catch(() => {});
        }
      }
    } finally {
      if (toDrop.length > 0 && dst.engine === "mysql") {
        await dstAdapter.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
      }
    }

    const results: CloneTableResult[] = [];
    const maxBatchRows = (colCount: number) => Math.max(1, Math.min(100, Math.floor(450 / Math.max(1, colCount))));

    for (const plan of preview.plans) {
      const obj = bySource.get(plan.sourceName)!;
      if (plan.action === "skip" && plan.targetExists) {
        results.push({
          sourceName: plan.sourceName,
          targetName: plan.targetName,
          kind: obj.kind,
          status: "skipped",
          rowsCopied: 0,
          indexesCreated: 0,
          foreignKeysCreated: 0,
          note: "Skipped because it already exists on the target.",
        });
        continue;
      }

      const qTarget =
        dst.engine === "postgres" && dst.schema
          ? `${quoteIdent("postgres", dst.schema)}.${quoteIdent("postgres", plan.targetName)}`
          : quoteIdent(dst.engine as Engine, plan.targetName);

      // Handle native same-engine view creation when requested
      if (
        obj.kind === "view" &&
        opts.viewMode === "view" &&
        src.engine === dst.engine &&
        obj.viewSql &&
        plan.targetName === obj.name
      ) {
        try {
          await dstAdapter.query(`DROP VIEW IF EXISTS ${qTarget}`).catch(() => {});
          await dstAdapter.query(obj.viewSql);
          results.push({
            sourceName: plan.sourceName,
            targetName: plan.targetName,
            kind: "view",
            status: "created",
            rowsCopied: 0,
            indexesCreated: 0,
            foreignKeysCreated: 0,
            note: "Recreated view definition.",
          });
          continue;
        } catch {
          // Fall through to materializing the view as a table if the view references uncloned objects
        }
      }

      let indexesCreated = 0;
      let foreignKeysCreated = 0;

      if (!plan.targetExists || plan.action === "replace") {
        const built = buildCreateTableDdl(obj, plan.targetName, dst.engine as Engine, dst.schema, {
          ifNotExists: plan.action !== "replace",
          includeForeignKeys: opts.includeForeignKeys,
          tableNameMap,
          existingTargetTables: existingSet,
        });
        await dstAdapter.query(built.tableDdl);
        foreignKeysCreated = built.fkCount;
        existingSet.add(plan.targetName);

        if (opts.includeIndexes) {
          for (const idxSql of built.indexDdls) {
            try {
              await dstAdapter.query(idxSql);
              indexesCreated++;
            } catch {
              // Ignore duplicate index errors when IF NOT EXISTS is unavailable
            }
          }
        }
      } else if (plan.action === "truncate") {
        await dstAdapter.query(`DELETE FROM ${qTarget}`);
      }

      let rowsCopied = 0;
      if (opts.contentMode !== "schema" && obj.columns.length > 0) {
        const qSource = quoteRef(src.engine as Engine, { schema: obj.schema, name: obj.name });
        const selectCols = obj.columns
          .map((c) => {
            const q = quoteIdent(src.engine as Engine, c.name);
            return src.engine === "mysql" && (c.canonicalType === "date" || c.canonicalType === "time" || c.canonicalType === "timestamp")
              ? `CAST(${q} AS CHAR) AS ${q}`
              : q;
          })
          .join(", ");
        const limitTotal = opts.rowLimit ?? Infinity;
        let offset = 0;
        const batchSize = maxBatchRows(obj.columns.length);

        while (rowsCopied < limitTotal) {
          const fetchLimit = Math.min(BATCH_ROWS, limitTotal - rowsCopied);
          const page = await srcAdapter.query(`SELECT ${selectCols} FROM ${qSource} LIMIT ${fetchLimit} OFFSET ${offset}`);
          if (page.rows.length === 0) break;
          offset += page.rows.length;

          for (let i = 0; i < page.rows.length; i += batchSize) {
            const chunk = page.rows.slice(i, i + batchSize);
            const params: Param[] = [];
            for (const row of chunk) {
              for (const col of obj.columns) {
                params.push(toTargetParam(row[col.name] ?? null, col, dst.engine as Engine));
              }
            }
            const insertSql = buildInsertBatchSql(
              dst.engine as Engine,
              dst.schema,
              plan.targetName,
              obj.columns,
              obj.primaryKey,
              chunk.length,
              plan.action === "append" || plan.action === "upsert" ? plan.action : "replace",
            );
            await dstAdapter.query(insertSql, params);
            rowsCopied += chunk.length;
          }

          if (page.rows.length < fetchLimit) break;
        }

        if (dst.engine === "postgres" && rowsCopied > 0) {
          await syncPostgresSequences(dstAdapter, dst.schema || "public", plan.targetName, obj.columns);
        }
      }

      results.push({
        sourceName: plan.sourceName,
        targetName: plan.targetName,
        kind: obj.kind,
        status: opts.contentMode === "schema" ? "created" : "copied",
        rowsCopied,
        indexesCreated,
        foreignKeysCreated,
      });
    }

    return results;
  } finally {
    if (!sameSqliteFile) await srcAdapter.close().catch(() => {});
    await dstAdapter.close().catch(() => {});
  }
}

async function readRedisKeyRecord(client: CloneRedisClient, key: string): Promise<{
  key: string;
  type: string;
  ttlMs: number | null;
  stringVal?: string;
  hashVal?: Record<string, string>;
  listVal?: string[];
  setVal?: string[];
  zsetVal?: Array<{ member: string; score: string }>;
}> {
  const type = String((await client.send("TYPE", [key])) ?? "string").toLowerCase();
  const rawTtl = Number(await client.send("PTTL", [key]));
  const ttlMs = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : null;
  if (type === "hash") {
    return { key, type, ttlMs, hashVal: parseHashPairs(await client.send("HGETALL", [key])) };
  }
  if (type === "list") {
    const arr = await client.send("LRANGE", [key, "0", "-1"]);
    return { key, type, ttlMs, listVal: Array.isArray(arr) ? arr.map(String) : [] };
  }
  if (type === "set") {
    const arr = await client.send("SMEMBERS", [key]);
    return { key, type, ttlMs, setVal: Array.isArray(arr) ? arr.map(String) : [] };
  }
  if (type === "zset") {
    const arr = await client.send("ZRANGE", [key, "0", "-1", "WITHSCORES"]);
    const zsetVal: Array<{ member: string; score: string }> = [];
    if (Array.isArray(arr)) {
      for (let i = 0; i + 1 < arr.length; i += 2) {
        if (Array.isArray(arr[i])) {
          zsetVal.push({ member: String(arr[i][0] ?? ""), score: String(arr[i][1] ?? "0") });
        } else {
          zsetVal.push({ member: String(arr[i] ?? ""), score: String(arr[i + 1] ?? "0") });
        }
      }
    }
    return { key, type, ttlMs, zsetVal };
  }
  const s = await client.send("GET", [key]);
  return { key, type: "string", ttlMs, stringVal: s === null || s === undefined ? "" : String(s) };
}

async function writeRedisKeyRecord(
  client: CloneRedisClient,
  targetKey: string,
  rec: Awaited<ReturnType<typeof readRedisKeyRecord>>,
  conflictMode: CloneConflictMode,
): Promise<boolean> {
  const exists = Number(await client.send("EXISTS", [targetKey])) > 0;
  if (exists) {
    if (conflictMode === "skip") return false;
    if (conflictMode === "fail") throw new FmError("CONFLICT", `Redis key "${targetKey}" already exists on the target.`);
    if (conflictMode === "replace" || conflictMode === "truncate") {
      await client.send("DEL", [targetKey]);
    }
  }
  if (rec.type === "hash" && rec.hashVal) {
    const entries = Object.entries(rec.hashVal);
    if (entries.length > 0) {
      const args: string[] = [targetKey];
      for (const [f, v] of entries) args.push(f, v);
      await client.send("HSET", args);
    }
  } else if (rec.type === "list" && rec.listVal) {
    if (rec.listVal.length > 0) await client.send("RPUSH", [targetKey, ...rec.listVal]);
  } else if (rec.type === "set" && rec.setVal) {
    if (rec.setVal.length > 0) await client.send("SADD", [targetKey, ...rec.setVal]);
  } else if (rec.type === "zset" && rec.zsetVal) {
    if (rec.zsetVal.length > 0) {
      const args: string[] = [targetKey];
      for (const z of rec.zsetVal) args.push(z.score, z.member);
      await client.send("ZADD", args);
    }
  } else {
    await client.send("SET", [targetKey, rec.stringVal ?? ""]);
  }
  if (rec.ttlMs && rec.ttlMs > 0) {
    await client.send("PEXPIRE", [targetKey, String(rec.ttlMs)]);
  }
  return true;
}

async function executeRedisToRedisClone(
  ctx: FmContext,
  src: ResolvedEndpoint,
  dst: ResolvedEndpoint,
  preview: ClonePreviewResult,
  opts: ReturnType<typeof normalizeOptions>,
): Promise<CloneTableResult[]> {
  const srcClient = await openRedis(ctx, src);
  const dstClient = await openRedis(ctx, dst);
  try {
    const srcPrefix = src.testInput.keyPrefix ?? "";
    const dstPrefix = dst.testInput.keyPrefix ?? "";
    const allKeys = await scanRedisKeys(srcClient, srcPrefix, MAX_REDIS_SCAN);
    const byGroup = new Map<string, string[]>();
    for (const k of allKeys) {
      const g = groupOfRedisKey(k, srcPrefix);
      let list = byGroup.get(g);
      if (!list) {
        list = [];
        byGroup.set(g, list);
      }
      list.push(k);
    }

    const results: CloneTableResult[] = [];
    for (const plan of preview.plans) {
      if (plan.action === "skip" && plan.targetExists) {
        results.push({ sourceName: plan.sourceName, targetName: plan.targetName, kind: "redis_group", status: "skipped", rowsCopied: 0, indexesCreated: 0, foreignKeysCreated: 0 });
        continue;
      }
      const keys = (byGroup.get(plan.sourceName) ?? []).slice(0, opts.rowLimit ?? Infinity);
      let copied = 0;
      if (opts.contentMode !== "schema") {
        for (const k of keys) {
          const stripped = srcPrefix && k.startsWith(srcPrefix) ? k.slice(srcPrefix.length) : k;
          const idx = stripped.indexOf(":");
          const suffix = idx > 0 ? stripped.slice(idx + 1) : stripped;
          const targetKey = idx > 0 || plan.targetName !== "redis_keys" ? `${dstPrefix}${plan.targetName}:${suffix}` : `${dstPrefix}${opts.tablePrefix}${stripped}`;
          const rec = await readRedisKeyRecord(srcClient, k);
          if (await writeRedisKeyRecord(dstClient, targetKey, rec, opts.conflictMode)) copied++;
        }
      }
      results.push({
        sourceName: plan.sourceName,
        targetName: plan.targetName,
        kind: "redis_group",
        status: "copied",
        rowsCopied: copied,
        indexesCreated: 0,
        foreignKeysCreated: 0,
      });
    }
    return results;
  } finally {
    srcClient.close();
    dstClient.close();
  }
}

async function executeRedisToSqlClone(
  ctx: FmContext,
  src: ResolvedEndpoint,
  dst: ResolvedEndpoint,
  preview: ClonePreviewResult,
  sourceObjects: CloneSourceObject[],
  opts: ReturnType<typeof normalizeOptions>,
): Promise<CloneTableResult[]> {
  const srcClient = await openRedis(ctx, src);
  const dstAdapter = openSqlAdapter(ctx, dst, false);
  try {
    await dstAdapter.connect();
    const srcPrefix = src.testInput.keyPrefix ?? "";
    const allKeys = await scanRedisKeys(srcClient, srcPrefix, MAX_REDIS_SCAN);
    const byGroup = new Map<string, string[]>();
    for (const k of allKeys) {
      const g = groupOfRedisKey(k, srcPrefix);
      let list = byGroup.get(g);
      if (!list) {
        list = [];
        byGroup.set(g, list);
      }
      list.push(k);
    }

    const bySource = new Map(sourceObjects.map((o) => [o.name, o]));
    const tableNameMap = new Map(preview.plans.map((p) => [p.sourceName, p.targetName]));
    const existingSet = new Set(preview.plans.filter((p) => p.targetExists).map((p) => p.targetName));
    const results: CloneTableResult[] = [];

    for (const plan of preview.plans) {
      const obj = bySource.get(plan.sourceName)!;
      if (plan.targetExists && plan.action === "fail") {
        throw new FmError("CONFLICT", `Target table "${plan.targetName}" already exists in "${dst.label}".`);
      }
      if (plan.action === "skip" && plan.targetExists) {
        results.push({ sourceName: plan.sourceName, targetName: plan.targetName, kind: "redis_group", status: "skipped", rowsCopied: 0, indexesCreated: 0, foreignKeysCreated: 0 });
        continue;
      }

      const qTarget =
        dst.engine === "postgres" && dst.schema
          ? `${quoteIdent("postgres", dst.schema)}.${quoteIdent("postgres", plan.targetName)}`
          : quoteIdent(dst.engine as Engine, plan.targetName);

      if (plan.targetExists && plan.action === "replace") {
        await dstAdapter.query(`DROP TABLE IF EXISTS ${qTarget}`);
      } else if (plan.targetExists && plan.action === "truncate") {
        await dstAdapter.query(`DELETE FROM ${qTarget}`);
      }

      if (!plan.targetExists || plan.action === "replace") {
        const built = buildCreateTableDdl(obj, plan.targetName, dst.engine as Engine, dst.schema, {
          ifNotExists: plan.action !== "replace",
          includeForeignKeys: false,
          tableNameMap,
          existingTargetTables: existingSet,
        });
        await dstAdapter.query(built.tableDdl);
      }

      let rowsCopied = 0;
      if (opts.contentMode !== "schema") {
        const keys = (byGroup.get(plan.sourceName) ?? []).slice(0, opts.rowLimit ?? Infinity);
        const isHashTable = obj.redisKeyType === "hash" && obj.columns.some((c) => c.name === "key_id");

        for (const k of keys) {
          const rec = await readRedisKeyRecord(srcClient, k);
          const stripped = srcPrefix && k.startsWith(srcPrefix) ? k.slice(srcPrefix.length) : k;
          const idx = stripped.indexOf(":");
          const keyId = idx > 0 ? stripped.slice(idx + 1) : stripped;

          const rowValues: Record<string, WireValue> = {};
          if (isHashTable) {
            rowValues.redis_key = k;
            rowValues.key_id = keyId;
            rowValues.ttl_ms = rec.ttlMs;
            const h = rec.hashVal ?? {};
            for (const col of obj.columns) {
              if (col.name === "redis_key" || col.name === "key_id" || col.name === "ttl_ms") continue;
              rowValues[col.name] = h[col.name] ?? null;
            }
          } else {
            rowValues.redis_key = k;
            rowValues.redis_type = rec.type;
            rowValues.ttl_ms = rec.ttlMs;
            if (rec.type === "string") {
              const str = rec.stringVal ?? "";
              rowValues.value_text = str;
              try {
                JSON.parse(str);
                rowValues.value_json = str;
              } catch {
                rowValues.value_json = JSON.stringify(str);
              }
            } else if (rec.type === "hash") {
              rowValues.value_text = JSON.stringify(rec.hashVal ?? {});
              rowValues.value_json = JSON.stringify(rec.hashVal ?? {});
            } else if (rec.type === "list") {
              rowValues.value_text = JSON.stringify(rec.listVal ?? []);
              rowValues.value_json = JSON.stringify(rec.listVal ?? []);
            } else if (rec.type === "set") {
              rowValues.value_text = JSON.stringify(rec.setVal ?? []);
              rowValues.value_json = JSON.stringify(rec.setVal ?? []);
            } else if (rec.type === "zset") {
              rowValues.value_text = JSON.stringify(rec.zsetVal ?? []);
              rowValues.value_json = JSON.stringify(rec.zsetVal ?? []);
            }
          }

          const params = obj.columns.map((col) => toTargetParam(rowValues[col.name] ?? null, col, dst.engine as Engine));
          const sql = buildInsertBatchSql(
            dst.engine as Engine,
            dst.schema,
            plan.targetName,
            obj.columns,
            obj.primaryKey,
            1,
            plan.action === "append" || plan.action === "upsert" ? plan.action : "replace",
          );
          await dstAdapter.query(sql, params);
          rowsCopied++;
        }
      }

      results.push({
        sourceName: plan.sourceName,
        targetName: plan.targetName,
        kind: "redis_group",
        status: opts.contentMode === "schema" ? "created" : "copied",
        rowsCopied,
        indexesCreated: 0,
        foreignKeysCreated: 0,
      });
    }

    return results;
  } finally {
    srcClient.close();
    await dstAdapter.close().catch(() => {});
  }
}

async function executeSqlToRedisClone(
  ctx: FmContext,
  src: ResolvedEndpoint,
  dst: ResolvedEndpoint,
  preview: ClonePreviewResult,
  sourceObjects: CloneSourceObject[],
  opts: ReturnType<typeof normalizeOptions>,
): Promise<CloneTableResult[]> {
  const srcAdapter = openSqlAdapter(ctx, src, true);
  const dstClient = await openRedis(ctx, dst);
  try {
    await srcAdapter.connect();
    const dstPrefix = dst.testInput.keyPrefix ?? "";
    const bySource = new Map(sourceObjects.map((o) => [o.name, o]));
    const results: CloneTableResult[] = [];

    for (const plan of preview.plans) {
      const obj = bySource.get(plan.sourceName)!;
      if (plan.action === "skip" && plan.targetExists) {
        results.push({ sourceName: plan.sourceName, targetName: plan.targetName, kind: obj.kind, status: "skipped", rowsCopied: 0, indexesCreated: 0, foreignKeysCreated: 0 });
        continue;
      }
      if (plan.targetExists && plan.action === "fail") {
        throw new FmError("CONFLICT", `Target Redis namespace "${plan.targetName}" already has keys.`);
      }

      const ns = `${dstPrefix}${plan.targetName}`;
      if (plan.targetExists && (plan.action === "replace" || plan.action === "truncate")) {
        const oldKeys = await scanRedisKeys(dstClient, `${ns}:`, MAX_REDIS_SCAN);
        for (const k of oldKeys) await dstClient.send("DEL", [k]);
      }

      let rowsCopied = 0;
      if (opts.contentMode !== "schema" && obj.columns.length > 0) {
        const qSource = quoteRef(src.engine as Engine, { schema: obj.schema, name: obj.name });
        const selectCols = obj.columns
          .map((c) => {
            const q = quoteIdent(src.engine as Engine, c.name);
            return src.engine === "mysql" && (c.canonicalType === "date" || c.canonicalType === "time" || c.canonicalType === "timestamp")
              ? `CAST(${q} AS CHAR) AS ${q}`
              : q;
          })
          .join(", ");
        const limitTotal = opts.rowLimit ?? Infinity;
        let offset = 0;
        let rowSeq = 1;

        while (rowsCopied < limitTotal) {
          const fetchLimit = Math.min(BATCH_ROWS, limitTotal - rowsCopied);
          const page = await srcAdapter.query(`SELECT ${selectCols} FROM ${qSource} LIMIT ${fetchLimit} OFFSET ${offset}`);
          if (page.rows.length === 0) break;
          offset += page.rows.length;

          for (const row of page.rows) {
            const pkParts = obj.primaryKey.length
              ? obj.primaryKey.map((k) => String(row[k] ?? "")).filter(Boolean)
              : [];
            const idPart = pkParts.length ? pkParts.join(":") : String(rowSeq);
            rowSeq++;
            const redisKey = `${ns}:${idPart}`;

            if (opts.conflictMode === "skip") {
              const ex = Number(await dstClient.send("EXISTS", [redisKey])) > 0;
              if (ex) continue;
            }

            if (opts.redisFormat === "json") {
              await dstClient.send("SET", [redisKey, JSON.stringify(row)]);
            } else {
              const args: string[] = [redisKey];
              for (const col of obj.columns) {
                const v = row[col.name];
                args.push(col.name, v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
              }
              await dstClient.send("HSET", args);
            }
            await dstClient.send("SADD", [`${ns}:_ids`, idPart]);
            rowsCopied++;
          }

          if (page.rows.length < fetchLimit) break;
        }
      }

      results.push({
        sourceName: plan.sourceName,
        targetName: plan.targetName,
        kind: obj.kind,
        status: "copied",
        rowsCopied,
        indexesCreated: 0,
        foreignKeysCreated: 0,
      });
    }

    return results;
  } finally {
    await srcAdapter.close().catch(() => {});
    dstClient.close();
  }
}

export async function runClone(ctx: FmContext, body: Record<string, any>): Promise<CloneRunResult> {
  const started = performance.now();
  const src = await resolveEndpoint(ctx, body.source, "source", true);
  const dst = await resolveEndpoint(ctx, body.target, "target", false);
  const opts = normalizeOptions(body.options);

  if ((dst.production || dst.readOnly) && body.confirmWrites !== true) {
    const reason = dst.production ? "production" : "readonly";
    throw new FmError(
      "NEEDS_CONFIRM",
      dst.production
        ? `"${dst.label}" is marked as a production database. Confirm that you want to write cloned tables/data into it.`
        : `"${dst.label}" is marked read-only. Confirm that you want to write cloned tables/data into it.`,
      { reason },
    );
  }

  let createdPath: string | undefined;
  let createdProfile: DbProfile | null = null;

  try {
    const sourceObjects = src.engine === "redis" ? await inspectRedisEndpoint(ctx, src) : await inspectSqlEndpoint(ctx, src);
    const existingTargetNames = await listExistingTargetNames(ctx, dst);
    const preview = buildPlanAndPreview(src, dst, sourceObjects, existingTargetNames, opts);

    if (dst.kind === "newSqlite" && dst.newSqlite) {
      const made = await makeSqliteFile(ctx, dst.newSqlite.folder, dst.newSqlite.name, {
        template: "empty",
        saveProfile: dst.newSqlite.saveProfile,
        connectionName: dst.newSqlite.connectionName,
      });
      createdPath = made.path;
      createdProfile = made.profile ?? null;
      dst.path = made.path;
      dst.testInput.path = made.path;
      dst.testInput.sqliteMode = "readwrite";
    }

    let results: CloneTableResult[];
    if (src.engine === "redis" && dst.engine === "redis") {
      results = await executeRedisToRedisClone(ctx, src, dst, preview, opts);
    } else if (src.engine === "redis") {
      results = await executeRedisToSqlClone(ctx, src, dst, preview, sourceObjects, opts);
    } else if (dst.engine === "redis") {
      results = await executeSqlToRedisClone(ctx, src, dst, preview, sourceObjects, opts);
    } else {
      results = await executeSqlToSqlClone(ctx, src, dst, preview, sourceObjects, opts);
    }

    if (src.profileId) dbState(ctx).store.markUsed(src.profileId);
    if (dst.profileId) dbState(ctx).store.markUsed(dst.profileId);

    // Ensure SQLite targets flush WAL/header cleanly so file size and inspection are immediate
    if (dst.engine === "sqlite" && dst.path && dst.path !== ":memory:") {
      try {
        statSync(dst.path);
      } catch {}
    }

    const isTargetTable = (r: CloneTableResult) => r.kind === "table" || (dst.engine !== "redis" && r.kind === "redis_group");
    const tablesCreated = results.filter((r) => isTargetTable(r) && r.status !== "skipped").length;
    const tablesCopied = results.filter((r) => isTargetTable(r) && r.status === "copied").length;
    const viewsCopied = results.filter((r) => r.kind === "view" && r.status !== "skipped").length;
    const indexesCreated = results.reduce((s, r) => s + r.indexesCreated, 0);
    const foreignKeysCreated = results.reduce((s, r) => s + r.foreignKeysCreated, 0);
    const rowsCopied = results.reduce((s, r) => s + r.rowsCopied, 0);
    const keysCopied = src.engine === "redis" || dst.engine === "redis" ? rowsCopied : 0;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    return {
      summary: {
        sourceLabel: src.label,
        sourceEngine: src.engine,
        targetLabel: dst.label,
        targetEngine: dst.engine,
        tablesCreated,
        tablesCopied,
        viewsCopied,
        indexesCreated,
        foreignKeysCreated,
        rowsCopied,
        keysCopied,
        skippedCount,
        elapsedMs: Math.max(1, Math.round(performance.now() - started)),
        warnings: preview.warnings,
        results,
      },
      ...(createdPath ? { createdPath } : {}),
      ...(createdProfile ? { createdProfile } : {}),
    };
  } catch (err) {
    if (createdPath) {
      await fsp.rm(createdPath, { force: true }).catch(() => {});
      if (createdProfile?.id) {
        await dbState(ctx).store.remove(createdProfile.id).catch(() => {});
      }
    }
    throw wrapCloneError(err, [src.password, dst.password]);
  }
}

export const cloneOperations: Record<string, FmHandler> = {
  async "db/clone/inspect"(ctx, b) {
    return await inspectCloneSource(ctx, isObject(b) ? (b.source ?? b) : undefined);
  },

  async "db/clone/preview"(ctx, b) {
    if (!isObject(b)) throw new FmError("BAD_REQUEST", "Choose a source and a target database.");
    return await previewClone(ctx, b);
  },

  async "db/clone/run"(ctx, b) {
    if (!isObject(b)) throw new FmError("BAD_REQUEST", "Choose a source and a target database.");
    return await runClone(ctx, b);
  },
};
