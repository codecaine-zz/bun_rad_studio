/**
 * Everything that differs between SQLite, MySQL/MariaDB and PostgreSQL in the staging import: how staged text is
 * converted to a target column's type, how "is different" is spelled, and the DDL of the staging and ledger tables.
 */
import type { Engine } from "../types";
import { ph, q, refOf, safeTypeName, type StageDb } from "./db";
import { StagingError } from "./limits";
import type { TargetColumn } from "./types";

const TRUE_WORDS = ["true", "t", "yes", "y", "1", "on"];
const FALSE_WORDS = ["false", "f", "no", "n", "0", "off"];
export const BOOLEAN_WORDS = [...TRUE_WORDS, ...FALSE_WORDS];
const sqlList = (words: string[]) => words.map((w) => `'${w}'`).join(", ");

/** Turns the staged text `ref` (an expression such as `s."age"`) into a value of the target column's type. */
export function valueExpr(engine: Engine, col: TargetColumn, ref: string): string {
  switch (engine) {
    case "sqlite":
      switch (col.cls) {
        case "integer":
          return `CAST(${ref} AS INTEGER)`;
        case "decimal":
          return `CAST(${ref} AS NUMERIC)`;
        case "float":
          return `CAST(${ref} AS REAL)`;
        case "boolean":
          return `CASE WHEN ${ref} IS NULL THEN NULL WHEN LOWER(${ref}) IN (${sqlList(TRUE_WORDS)}) THEN 1 ELSE 0 END`;
        default:
          return ref;
      }
    case "mysql":
      switch (col.cls) {
        case "integer":
          return `CAST(${ref} AS ${col.unsigned ? "UNSIGNED" : "SIGNED"})`;
        case "decimal":
          return `CAST(${ref} AS DECIMAL(${col.precision ?? 65},${Math.min(col.scale ?? 30, 30)}))`;
        case "float":
          return `CAST(${ref} AS DOUBLE)`;
        case "boolean":
          return `CASE WHEN ${ref} IS NULL THEN NULL WHEN LOWER(${ref}) IN (${sqlList(TRUE_WORDS)}) THEN 1 ELSE 0 END`;
        case "date":
          return `CAST(${ref} AS DATE)`;
        case "timestamp":
          return `CAST(${ref} AS DATETIME(6))`;
        case "time":
          return `CAST(${ref} AS TIME(6))`;
        case "json":
          return `CAST(${ref} AS JSON)`;
        case "text":
        case "enum":
        case "uuid":
          return col.collation ? `(${ref} COLLATE ${col.collation})` : ref;
        default:
          return ref;
      }
    case "postgres":
      if (col.cls === "text") return ref;
      if (!safeTypeName(col.dataType)) throw new StagingError(`Column “${col.name}” has a type (${col.dataType}) that cannot be loaded safely.`, "BAD_TYPE");
      return `CAST(${ref} AS ${col.dataType})`;
  }
}

/** `a` and `b` have the same value, treating NULL = NULL as the same. */
export function sameExpr(engine: Engine, a: string, b: string): string {
  return engine === "sqlite" ? `${a} IS ${b}` : engine === "mysql" ? `${a} <=> ${b}` : `${a} IS NOT DISTINCT FROM ${b}`;
}

export function differentExpr(engine: Engine, a: string, b: string): string {
  return engine === "sqlite" ? `${a} IS NOT ${b}` : engine === "mysql" ? `NOT (${a} <=> ${b})` : `${a} IS DISTINCT FROM ${b}`;
}

// ---- names -----------------------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

export function stamp(d = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function slug(text: string, max = 28): string {
  const s = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (s || "data").slice(0, max).replace(/_+$/, "") || "data";
}

/** `stg_<target>_<yyyymmdd_hhmm>`, made unique among `existing` (case-insensitively). */
export function stagingName(target: string, existing: Iterable<string>, now = new Date()): string {
  const taken = new Set([...existing].map((n) => n.toLowerCase()));
  const base = `stg_${slug(target)}_${stamp(now)}`;
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}_${i}`;
  return name;
}

export const LEDGER = "_import_batches";
export const CHANGES = "_import_batch_changes";

export function newBatchId(now = new Date()): string {
  return `b${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${Math.random().toString(16).slice(2, 6)}`;
}

/** A column name that is safe in every engine for a table created from data. */
export function safeColumnNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((n, i) => {
    let s = slug(n, 60).replace(/^(\d)/, "c_$1");
    if (!s || s === "data" && !/data/i.test(n)) s = `column_${i + 1}`;
    if (s.startsWith("_stg_")) s = "c" + s;
    let name = s;
    for (let k = 2; seen.has(name); k++) name = `${s}_${k}`;
    seen.add(name);
    return name;
  });
}

// ---- DDL ---------------------------------------------------------------------------------------------------------

export function stagingDdl(db: Pick<StageDb, "engine" | "schema">, name: string, dataColumns: string[]): string {
  const e = db.engine;
  const text = e === "mysql" ? "LONGTEXT NULL" : "TEXT";
  const id = e === "sqlite" ? "INTEGER PRIMARY KEY AUTOINCREMENT" : e === "mysql" ? "BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY" : "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY";
  const meta =
    e === "mysql"
      ? [
          "`_stg_batch_id` VARCHAR(64) NOT NULL",
          "`_stg_source_file` VARCHAR(255) NULL",
          "`_stg_row_number` BIGINT NULL",
          "`_stg_loaded_at` VARCHAR(32) NOT NULL",
          "`_stg_status` VARCHAR(16) NOT NULL DEFAULT 'new'",
          "`_stg_errors` LONGTEXT NULL",
          "`_stg_match` VARCHAR(16) NULL",
          "`_stg_raw` LONGTEXT NULL",
        ]
      : [
          `${q(e, "_stg_batch_id")} TEXT NOT NULL`,
          `${q(e, "_stg_source_file")} TEXT`,
          `${q(e, "_stg_row_number")} ${e === "sqlite" ? "INTEGER" : "BIGINT"}`,
          `${q(e, "_stg_loaded_at")} TEXT NOT NULL`,
          `${q(e, "_stg_status")} TEXT NOT NULL DEFAULT 'new'`,
          `${q(e, "_stg_errors")} TEXT`,
          `${q(e, "_stg_match")} TEXT`,
          `${q(e, "_stg_raw")} TEXT`,
        ];
  const cols = [`${q(e, "_stg_row_id")} ${id}`, ...dataColumns.map((c) => `${q(e, c)} ${text}`), ...meta];
  return `CREATE TABLE ${refOf(db, name)} (${cols.join(", ")})${e === "mysql" ? " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" : ""}`;
}

export function ledgerDdl(db: Pick<StageDb, "engine" | "schema">): string[] {
  const e = db.engine;
  const t = (n: string) => q(e, n);
  const str = (len: number) => (e === "mysql" ? `VARCHAR(${len})` : "TEXT");
  const big = e === "sqlite" ? "INTEGER" : "BIGINT";
  const long = e === "mysql" ? "LONGTEXT" : "TEXT";
  const id = e === "sqlite" ? "INTEGER PRIMARY KEY AUTOINCREMENT" : e === "mysql" ? "BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY" : "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY";
  const tail = e === "mysql" ? " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" : "";
  const ine = e === "mysql" ? "CREATE TABLE IF NOT EXISTS" : "CREATE TABLE IF NOT EXISTS";
  const batches = `${ine} ${refOf(db, LEDGER)} (${[
    `${t("batch_id")} ${str(64)} NOT NULL PRIMARY KEY`,
    `${t("created_at")} ${str(32)} NOT NULL`,
    `${t("source_name")} ${str(255)}`,
    `${t("target_table")} ${str(255)}`,
    `${t("new_table")} ${big} NOT NULL DEFAULT 0`,
    `${t("staging_table")} ${str(128)}`,
    `${t("mode")} ${str(32)}`,
    `${t("status")} ${str(16)} NOT NULL`,
    `${t("rows_total")} ${big} NOT NULL DEFAULT 0`,
    `${t("rows_valid")} ${big} NOT NULL DEFAULT 0`,
    `${t("rows_invalid")} ${big} NOT NULL DEFAULT 0`,
    `${t("rows_duplicate")} ${big} NOT NULL DEFAULT 0`,
    `${t("rows_inserted")} ${big} NOT NULL DEFAULT 0`,
    `${t("rows_updated")} ${big} NOT NULL DEFAULT 0`,
    `${t("rows_skipped")} ${big} NOT NULL DEFAULT 0`,
    `${t("promoted_at")} ${str(32)}`,
    `${t("undone_at")} ${str(32)}`,
    `${t("dropped_at")} ${str(32)}`,
    `${t("undoable")} ${big} NOT NULL DEFAULT 0`,
    `${t("undo_note")} ${long}`,
    `${t("config_json")} ${long}`,
    `${t("note")} ${long}`,
  ].join(", ")})${tail}`;
  const changes = `${ine} ${refOf(db, CHANGES)} (${[
    `${t("change_id")} ${id}`,
    `${t("batch_id")} ${str(64)} NOT NULL`,
    `${t("action")} ${str(8)} NOT NULL`,
    `${t("ref_row_id")} ${big}`,
    `${t("pk_json")} ${long} NOT NULL`,
    `${t("before_json")} ${long}`,
    `${t("after_hash")} ${str(64)}`,
  ].join(", ")})${tail}`;
  const out = [batches, changes];
  if (e !== "mysql") {
    out.push(`CREATE INDEX IF NOT EXISTS ${t("_import_batch_changes_batch_idx")} ON ${refOf(db, CHANGES)} (${t("batch_id")}, ${t("change_id")})`);
    out.push(`CREATE INDEX IF NOT EXISTS ${t("_import_batch_changes_ref_idx")} ON ${refOf(db, CHANGES)} (${t("batch_id")}, ${t("ref_row_id")})`);
  } else {
    out[1] = out[1]!.replace(`${t("after_hash")} ${str(64)}`, `${t("after_hash")} ${str(64)}, INDEX ${t("batch_idx")} (${t("batch_id")}, ${t("change_id")}), INDEX ${t("ref_idx")} (${t("batch_id")}, ${t("ref_row_id")})`);
  }
  return out;
}

/** What the import calls its staging tables: `stg_<target>_<yyyymmdd>_<hhmm>`, with a number added when the name is taken. */
export const STAGING_NAME = /^stg_[a-z0-9_]+_\d{8}_\d{4}(_\d+)?$/;

/** Is this table one of the import's own (staging or ledger) tables? They must never be chosen as a target. A user's own table that merely starts with stg_ is not. */
export const isOwnTable = (name: string): boolean => name === LEDGER || name === CHANGES || STAGING_NAME.test(name);

/** Collects bound values and hands out the right placeholder (`?` or a typed `$n`). */
export class Params {
  readonly values: unknown[] = [];
  constructor(readonly engine: Engine) {}
  add(value: unknown, type?: "text" | "bigint"): string {
    this.values.push(value);
    return ph(this.engine, this.values.length, type);
  }
}

/** `valueExpr` for a bound text value; the value is bound once per place it appears, so positional `?` parameters stay in step. */
export function bindValue(p: Params, col: TargetColumn, value: string | null | undefined): string {
  const mark = "\u0000";
  const parts = valueExpr(p.engine, col, mark).split(mark);
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i++) out += p.add(value ?? null, "text") + parts[i];
  return out;
}
