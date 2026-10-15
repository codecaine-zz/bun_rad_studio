/** Adapters that connect the shared sample API to each studio's database manager. */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { getDataset } from "./catalog";
import { quoteId } from "./dialect";
import type { QueryPreview, SampleHost } from "./routes";
import {
  SampleError, validateSchemaName, createSqliteFile, inspectSqlite, preflightMysql, preflightPostgres, seedIntoSqlite, seedMysql, seedPostgres,
  sqlitePreflightCurrent, sqlitePreflightFile, type SeedRequest,
} from "./targets";

const dsOrThrow = (id: string) => {
  const ds = getDataset(id);
  if (!ds) throw new SampleError(`Unknown sample dataset "${id}".`, 404, "unknown_dataset");
  return ds;
};

export const defaultSampleName = (datasetId: string) => `sample_${datasetId}`;

const PREVIEW_ROWS = 200;

const plain = (v: unknown): unknown => {
  if (typeof v === "bigint") return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (v instanceof Date) return v.toISOString().replace("T", " ").slice(0, 19);
  if (v instanceof Uint8Array) return `[${v.byteLength} bytes]`;
  if (v && typeof v === "object") return JSON.stringify(v);
  return v;
};

function preview(rows: Record<string, unknown>[], started: number): QueryPreview {
  const columns = rows.length ? Object.keys(rows[0]!) : [];
  const shown = rows.slice(0, PREVIEW_ROWS);
  return { columns, rows: shown.map((r) => columns.map((c) => plain(r[c]))), rowCount: rows.length, truncated: rows.length > shown.length, ms: Date.now() - started };
}

// ------------------------------------------------------------------------------------------ SQLite

export interface SqliteHostContext {
  getDb(): Database;
  getActivePath(): string;
  connect(path: string): { success: boolean; error?: string; path?: string };
  /** Folder new sample files go into when the target is only a name. */
  sampleDir(): string;
}

export function resolveSqliteTarget(ctx: Pick<SqliteHostContext, "sampleDir">, target: string): string {
  const t = target.trim();
  if (!t) throw new SampleError("Enter a file name for the new sample database.", 400, "bad_name");
  if (!isAbsolute(t) && /(^|[\\/])\.\.([\\/]|$)/.test(t)) throw new SampleError("The file name may not contain '..'.", 400, "bad_name");
  if (!isAbsolute(t) && /[\\/]/.test(t)) throw new SampleError("Use a plain file name (or a full path). It is created in the samples folder.", 400, "bad_name");
  if (!isAbsolute(t) && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(t)) throw new SampleError(`"${t}" is not a valid file name: use letters, digits, dots, dashes and underscores.`, 400, "bad_name");
  const withExt = /\.(sqlite|sqlite3|db|db3)$/i.test(t) ? t : `${t}.sqlite`;
  return isAbsolute(withExt) ? resolve(withExt) : join(ctx.sampleDir(), withExt);
}

export function sqliteSampleHost(ctx: SqliteHostContext): SampleHost {
  return {
    dialect: "sqlite",
    describe: () => ({ sampleDir: ctx.sampleDir(), supportsCurrent: true, activePath: ctx.getActivePath(), kind: "file" }),
    defaultTarget: (id) => `${defaultSampleName(id)}.sqlite`,
    async prepare(req: SeedRequest) {
      const ds = dsOrThrow(req.datasetId);
      if (req.target === "current") {
        sqlitePreflightCurrent(ctx.getDb(), ds, req);
        return { target: "current", run: async (hooks) => seedIntoSqlite(ctx.getDb(), ds, req, hooks) };
      }
      const path = resolveSqliteTarget(ctx, req.target);
      if (req.mode === "replace-sample-tables") {
        if (!existsSync(path)) throw new SampleError(`There is no file ${path} to replace the sample in.`, 404, "not_found");
        if (path === ctx.getActivePath()) {
          sqlitePreflightCurrent(ctx.getDb(), ds, req);
          return { target: path, run: async (hooks) => seedIntoSqlite(ctx.getDb(), ds, req, hooks) };
        }
        const probe = new Database(path, { readonly: true });
        try {
          const info = inspectSqlite(probe);
          if (info.sampleDataset !== ds.id) {
            throw new SampleError(info.sampleDataset ? `${path} holds the sample "${info.sampleDataset}", not "${ds.id}".` : `${path} is not a sample database, so nothing in it will be replaced.`, 409, "not_a_sample");
          }
          if (!req.confirm) throw new SampleError("Replacing the sample drops and recreates its tables and views. Send confirm: true to proceed.", 409, "confirm_required");
        } finally {
          probe.close();
        }
        return {
          target: path,
          run: async (hooks) => {
            const db = new Database(path);
            try {
              return await seedIntoSqlite(db, ds, req, hooks);
            } finally {
              db.close();
            }
          },
        };
      }
      sqlitePreflightFile(path);
      return { target: path, run: (hooks) => createSqliteFile(path, ds, req, hooks, (p) => new Database(p, { create: true })) };
    },
    async runQuery(target, sql) {
      const started = Date.now();
      if (target === "current" || target === ctx.getActivePath()) return preview(ctx.getDb().query(sql).all() as Record<string, unknown>[], started);
      const path = resolveSqliteTarget(ctx, target);
      if (!existsSync(path)) throw new SampleError(`The sample file ${path} no longer exists.`, 404, "not_found");
      const db = new Database(path, { readonly: true });
      try {
        return preview(db.query(sql).all() as Record<string, unknown>[], started);
      } finally {
        db.close();
      }
    },
    async open(target) {
      const path = target === "current" ? ctx.getActivePath() : resolveSqliteTarget(ctx, target);
      if (!existsSync(path)) return { success: false, error: `${path} does not exist.` };
      const r = ctx.connect(path);
      return { success: r.success, error: r.error, path };
    },
  };
}

// ------------------------------------------------------------------------------------------ MySQL

export interface MysqlHostContext {
  getSql(): any;
  currentDatabase(): string;
  connect(database: string): Promise<{ success: boolean; error?: string }>;
}

export function mysqlSampleHost(ctx: MysqlHostContext): SampleHost {
  return {
    dialect: "mysql",
    describe: () => ({ currentDatabase: ctx.currentDatabase(), supportsCurrent: false, kind: "database" }),
    defaultTarget: (id) => defaultSampleName(id),
    async prepare(req) {
      const ds = dsOrThrow(req.datasetId);
      const pre = await preflightMysql(ctx.getSql(), ds, req);
      return { target: pre.database, run: (hooks) => seedMysql(ctx.getSql(), ds, { ...req, target: pre.database }, hooks) };
    },
    async runQuery(target, sql) {
      const name = validateSchemaName(target, "database name");
      const started = Date.now();
      const conn = await ctx.getSql().reserve();
      try {
        await conn.unsafe(`USE ${quoteId("mysql", name)}`);
        await conn.unsafe("SET SESSION MAX_EXECUTION_TIME = 20000");
        await conn.unsafe("START TRANSACTION READ ONLY");
        try {
          return preview((await conn.unsafe(sql)) as Record<string, unknown>[], started);
        } finally {
          await conn.unsafe("ROLLBACK").catch(() => {});
        }
      } finally {
        conn.release();
      }
    },
    async open(target) {
      const r = await ctx.connect(target);
      return { success: r.success, error: r.error, path: target };
    },
  };
}

// ------------------------------------------------------------------------------------------ PostgreSQL

export interface PostgresHostContext {
  getSql(): any;
  currentDatabase(): string;
  currentSchema(): string;
  connect(database: string, schema: string): Promise<{ success: boolean; error?: string }>;
}

export function postgresSampleHost(ctx: PostgresHostContext): SampleHost {
  return {
    dialect: "postgres",
    describe: () => ({ currentDatabase: ctx.currentDatabase(), currentSchema: ctx.currentSchema(), supportsCurrent: false, kind: "schema" }),
    defaultTarget: (id) => defaultSampleName(id),
    async prepare(req) {
      const ds = dsOrThrow(req.datasetId);
      const pre = await preflightPostgres(ctx.getSql(), ds, req);
      return { target: pre.schema, run: (hooks) => seedPostgres(ctx.getSql(), ds, { ...req, target: pre.schema }, hooks) };
    },
    async runQuery(target, sql) {
      const schema = validateSchemaName(target, "schema name");
      const started = Date.now();
      return await ctx.getSql().begin(async (tx: any) => {
        await tx.unsafe("SET TRANSACTION READ ONLY");
        await tx.unsafe("SET LOCAL statement_timeout = 20000");
        await tx.unsafe(`SET LOCAL search_path TO ${quoteId("postgres", schema)}`);
        return preview((await tx.unsafe(sql)) as Record<string, unknown>[], started);
      });
    },
    async open(target) {
      const r = await ctx.connect(ctx.currentDatabase(), target);
      return { success: r.success, error: r.error, path: `${ctx.currentDatabase()}.${target}` };
    },
  };
}
