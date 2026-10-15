/**
 * Creating a sample inside a real database: target inspection, collision rules, transactions and cleanup.
 *
 * Safety rules (identical for every engine):
 *   - mode "new" never touches anything that already exists: the target database / schema / file must not exist (or be empty).
 *   - mode "replace-sample-tables" only works on a target that already holds the SAME sample (its `_sample_info` row names
 *     the dataset) and only drops the objects that dataset defines; anything else in the target is left alone.
 *   - SQLite "current database" mode refuses to run when any object name collides with an existing object.
 */
import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { quoteId } from "./dialect";
import type { DatasetDef, Dialect, Scale } from "./model";
import { objectNames, renderDrop } from "./render";
import { seedDataset, SeedCancelled, type SeedHooks, type SeedSummary } from "./runner";

export class SampleError extends Error {
  constructor(message: string, public status = 400, public code = "bad_request") {
    super(message);
    this.name = "SampleError";
  }
}

export type SeedMode = "new" | "replace-sample-tables";

export interface SeedRequest {
  datasetId: string;
  scale: Scale;
  target: string;
  mode: SeedMode;
  confirm?: boolean;
  seed?: number;
}

export interface TargetInfo {
  exists: boolean;
  objects: string[];
  sampleDataset: string | null;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;

export function validateSchemaName(name: string, what: string): string {
  const n = (name ?? "").trim();
  if (!NAME_RE.test(n)) throw new SampleError(`Invalid ${what} "${n}": start with a letter, then letters, digits or underscores (up to 48 characters).`, 400, "bad_name");
  return n;
}

function collisions(ds: DatasetDef, existing: string[]): string[] {
  const mine = objectNames(ds);
  const have = new Set(existing.map((e) => e.toLowerCase()));
  return [...mine.tables, ...mine.views].filter((n) => have.has(n.toLowerCase()));
}

function planOutcome(ds: DatasetDef, info: TargetInfo, req: SeedRequest, what: string, target: string, allowExistingEmpty: boolean, addToExisting = false): "create" | "replace" {
  if (req.mode === "replace-sample-tables") {
    if (!info.exists) throw new SampleError(`There is no ${what} named "${target}" to replace.`, 404, "not_found");
    if (info.sampleDataset !== ds.id) {
      throw new SampleError(
        info.sampleDataset
          ? `"${target}" holds the sample "${info.sampleDataset}", not "${ds.id}". Choose another name or replace that sample.`
          : `"${target}" is not a sample database (no _sample_info table), so nothing in it will be replaced.`,
        409, "not_a_sample",
      );
    }
    if (!req.confirm) throw new SampleError(`Replacing the sample in "${target}" drops and recreates its ${ds.tables.length} sample tables and ${ds.views.length} views. Send confirm: true to proceed.`, 409, "confirm_required");
    return "replace";
  }
  if (info.exists && !(allowExistingEmpty && info.objects.length === 0)) {
    const clash = collisions(ds, info.objects);
    if (addToExisting && clash.length === 0 && info.sampleDataset === null) return "create";
    throw new SampleError(
      clash.length
        ? `The ${what} "${target}" already contains ${clash.slice(0, 6).join(", ")}${clash.length > 6 ? "…" : ""}. Pick a new name; nothing was changed.`
        : `The ${what} "${target}" already exists. Pick a new name, or use "replace sample tables" if it already holds this sample.`,
      409, "exists",
    );
  }
  return "create";
}

// --------------------------------------------------------------------------------------------- SQLite

export function inspectSqlite(db: Database): TargetInfo {
  const objects = (db.query("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
  let sampleDataset: string | null = null;
  if (objects.includes("_sample_info")) {
    try {
      sampleDataset = (db.query("SELECT dataset_id FROM _sample_info LIMIT 1").get() as { dataset_id: string } | null)?.dataset_id ?? null;
    } catch {}
  }
  return { exists: true, objects, sampleDataset };
}

/** Adds the sample to an open SQLite database (all-or-nothing). Used for "the open database" and for freshly created files. */
export async function seedIntoSqlite(db: Database, ds: DatasetDef, req: SeedRequest, hooks: SeedHooks, fresh = false): Promise<SeedSummary> {
  const info = fresh ? { exists: true, objects: [], sampleDataset: null } : inspectSqlite(db);
  const action = fresh ? "create" : planOutcome(ds, info, req, "database", "the open database", true, true);
  const fkWas = (db.query("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys;
  db.run("PRAGMA foreign_keys = ON");
  try {
    db.run("BEGIN IMMEDIATE");
    try {
      if (action === "replace") for (const sql of renderDrop("sqlite", ds)) db.run(sql);
      const summary = await seedDataset(ds, "sqlite", async (sql) => { db.run(sql); }, { scale: req.scale, seed: req.seed, ...hooks });
      const bad = db.query("PRAGMA foreign_key_check").all();
      if (bad.length) throw new Error(`Foreign key check failed (${bad.length} violations)`);
      db.run("COMMIT");
      return summary;
    } catch (e) {
      try { db.run("ROLLBACK"); } catch {}
      throw e;
    }
  } finally {
    db.run(`PRAGMA foreign_keys = ${fkWas ? "ON" : "OFF"}`);
  }
}

/** Creates a brand-new SQLite file holding the sample. Never overwrites: an existing path is a 409. */
export async function createSqliteFile(path: string, ds: DatasetDef, req: SeedRequest, hooks: SeedHooks, open: (p: string) => Database): Promise<SeedSummary> {
  if (existsSync(path)) throw new SampleError(`The file ${path} already exists. Choose another name; existing files are never overwritten.`, 409, "exists");
  mkdirSync(dirname(path), { recursive: true });
  const db = open(path);
  try {
    return await seedIntoSqlite(db, ds, req, hooks, true);
  } catch (e) {
    try { db.close(); } catch {}
    for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(path + suffix, { force: true });
    throw e;
  } finally {
    try { db.close(); } catch {}
  }
}

export function sqlitePreflightFile(path: string): void {
  if (existsSync(path)) throw new SampleError(`The file ${path} already exists. Choose another name; existing files are never overwritten.`, 409, "exists");
}

export function sqlitePreflightCurrent(db: Database, ds: DatasetDef, req: SeedRequest): "create" | "replace" {
  return planOutcome(ds, inspectSqlite(db), req, "database", "the open database", true, true);
}

// --------------------------------------------------------------------------------------------- MySQL

type BunSql = { unsafe: (sql: string, params?: unknown[]) => Promise<any>; reserve?: () => Promise<any> };

export async function inspectMysql(sql: BunSql, database: string): Promise<TargetInfo> {
  const dbs = await sql.unsafe("SELECT schema_name AS n FROM information_schema.schemata WHERE schema_name = ?", [database]);
  if (!dbs.length) return { exists: false, objects: [], sampleDataset: null };
  const rows = await sql.unsafe("SELECT table_name AS n FROM information_schema.tables WHERE table_schema = ?", [database]);
  const objects = (rows as any[]).map((r) => String(r.n ?? r.N ?? r.TABLE_NAME ?? r.table_name));
  let sampleDataset: string | null = null;
  if (objects.includes("_sample_info")) {
    try {
      const r = await sql.unsafe(`SELECT dataset_id FROM ${quoteId("mysql", database)}.\`_sample_info\` LIMIT 1`);
      sampleDataset = r[0]?.dataset_id ?? null;
    } catch {}
  }
  return { exists: true, objects, sampleDataset };
}

export async function preflightMysql(sql: BunSql, ds: DatasetDef, req: SeedRequest): Promise<{ database: string; action: "create" | "replace"; info: TargetInfo }> {
  const database = validateSchemaName(req.target, "database name");
  const info = await inspectMysql(sql, database);
  return { database, action: planOutcome(ds, info, req, "database", database, true), info };
}

export async function seedMysql(sql: BunSql, ds: DatasetDef, req: SeedRequest, hooks: SeedHooks): Promise<SeedSummary> {
  const pre = await preflightMysql(sql, ds, req);
  const conn = await (sql as any).reserve();
  const db = quoteId("mysql", pre.database);
  let createdDb = false;
  try {
    if (!pre.info.exists) {
      await conn.unsafe(`CREATE DATABASE ${db} CHARACTER SET utf8mb4`);
      createdDb = true;
    }
    await conn.unsafe(`USE ${db}`);
    await conn.unsafe("SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'ANSI_QUOTES')");
    if (pre.action === "replace") for (const s of renderDrop("mysql", ds)) await conn.unsafe(s);
    try {
      return await seedDataset(ds, "mysql", async (s) => { await conn.unsafe(s); }, { scale: req.scale, seed: req.seed, ...hooks });
    } catch (e) {
      // MySQL DDL cannot be rolled back, so undo by hand: drop the new database, or just this dataset's objects.
      try {
        if (createdDb) await conn.unsafe(`DROP DATABASE IF EXISTS ${db}`);
        else for (const s of renderDrop("mysql", ds)) await conn.unsafe(s);
      } catch {}
      throw e;
    }
  } finally {
    try { conn.release(); } catch {}
  }
}

// --------------------------------------------------------------------------------------------- PostgreSQL

export async function inspectPostgres(sql: BunSql, schema: string): Promise<TargetInfo> {
  const s = await sql.unsafe("SELECT 1 AS x FROM pg_namespace WHERE nspname = $1", [schema]);
  if (!s.length) return { exists: false, objects: [], sampleDataset: null };
  const rows = await sql.unsafe(
    "SELECT c.relname AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE ns.nspname = $1 AND c.relkind IN ('r','p','v','m','f')",
    [schema],
  );
  const objects = (rows as any[]).map((r) => String(r.n));
  let sampleDataset: string | null = null;
  if (objects.includes("_sample_info")) {
    try {
      const r = await sql.unsafe(`SELECT dataset_id FROM ${quoteId("postgres", schema)}."_sample_info" LIMIT 1`);
      sampleDataset = r[0]?.dataset_id ?? null;
    } catch {}
  }
  return { exists: true, objects, sampleDataset };
}

export async function preflightPostgres(sql: BunSql, ds: DatasetDef, req: SeedRequest): Promise<{ schema: string; action: "create" | "replace"; info: TargetInfo }> {
  const schema = validateSchemaName(req.target, "schema name");
  if (/^pg_/i.test(schema) || ["public", "information_schema"].includes(schema.toLowerCase())) {
    throw new SampleError(`The schema name "${schema}" is reserved. Pick another name, for example sample_${ds.id}.`, 400, "reserved_name");
  }
  const info = await inspectPostgres(sql, schema);
  return { schema, action: planOutcome(ds, info, req, "schema", schema, true), info };
}

export async function seedPostgres(sql: BunSql & { begin: (fn: (tx: BunSql) => Promise<any>) => Promise<any> }, ds: DatasetDef, req: SeedRequest, hooks: SeedHooks): Promise<SeedSummary> {
  const pre = await preflightPostgres(sql, ds, req);
  const sch = quoteId("postgres", pre.schema);
  return await sql.begin(async (tx) => {
    if (!pre.info.exists) await tx.unsafe(`CREATE SCHEMA ${sch}`);
    await tx.unsafe(`SET LOCAL search_path TO ${sch}`);
    if (pre.action === "replace") for (const s of renderDrop("postgres", ds)) await tx.unsafe(s);
    return await seedDataset(ds, "postgres", async (s) => { await tx.unsafe(s); }, { scale: req.scale, seed: req.seed, ...hooks });
  });
}

export function dialectTargetLabel(d: Dialect): string {
  return d === "sqlite" ? "database file" : d === "mysql" ? "database" : "schema";
}

export { SeedCancelled };
