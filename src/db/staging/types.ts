/** Shared shapes of the staging import. Plain data only, so they can be sent to the page as JSON. */
import type { Engine } from "../types";

export type TypeClass = "integer" | "decimal" | "float" | "boolean" | "date" | "time" | "timestamp" | "uuid" | "json" | "enum" | "text" | "binary" | "other";

export interface TargetColumn {
  name: string;
  /** The type exactly as the database reports it, for example "varchar(50)" or "numeric(10,2)". */
  dataType: string;
  cls: TypeClass;
  nullable: boolean;
  hasDefault: boolean;
  /** Filled in by the database (auto-increment, identity, generated). */
  auto: boolean;
  generated: boolean;
  pkPosition: number | null;
  /** Longest text, in characters (text types only; not enforced by SQLite). */
  length?: number;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
  /** Bits of a whole-number type. */
  bits?: number;
  enumValues?: string[];
  /** MySQL text collation, so comparisons with staging text never mix collations. */
  collation?: string;
}

export interface TargetForeignKey {
  columns: string[];
  refSchema?: string;
  refTable: string;
  refColumns: string[];
}

export interface TargetTable {
  engine: Engine;
  schema?: string;
  name: string;
  columns: TargetColumn[];
  primaryKey: string[];
  /** Other unique indexes, by column (expression and partial indexes are left out). */
  uniques: string[][];
  foreignKeys: TargetForeignKey[];
  /** SQLite tables without a primary key can still be addressed by rowid. */
  hasRowid?: boolean;
  /** The table does not exist yet; the import creates it. */
  virtual?: boolean;
}

export type Step =
  | { t: "trim" }
  | { t: "collapse" }
  | { t: "emptyToNull" }
  | { t: "upper" }
  | { t: "lower" }
  | { t: "title" }
  | { t: "digits" }
  | { t: "date"; order?: "YMD" | "DMY" | "MDY" | "auto" }
  | { t: "datetime"; order?: "YMD" | "DMY" | "MDY" | "auto" }
  | { t: "number"; locale?: "us" | "eu" | "auto" }
  | { t: "boolean" }
  | { t: "replace"; find: string; with: string }
  | { t: "default"; value: string };

export type SourceSpec =
  | { kind: "column"; column: string }
  | { kind: "concat"; columns: string[]; separator: string }
  | { kind: "split"; column: string; separator: string; part: number }
  | { kind: "constant"; value: string | null }
  | { kind: "skip" };

export interface ColumnRule {
  target: string;
  source: SourceSpec;
  steps: Step[];
}

export interface UserRule {
  column: string;
  kind: "regex" | "min" | "max" | "oneof" | "length" | "notempty";
  /** regex pattern, a number, a comma-separated list, or "min-max" for length. */
  value: string;
  message?: string;
}

export interface ImportPlan {
  /** Target table name; for a new table this is the name the table will get. */
  target: string;
  /** True when the table is created from the data. */
  createTable: boolean;
  rules: ColumnRule[];
  /** Columns that say which rows are "the same" (usually the primary key). */
  keyColumns: string[];
  userRules: UserRule[];
  /** New table only: the columns and types to create. */
  newTable?: { columns: { name: string; kind: string; nullable: boolean }[]; autoId: boolean };
}

export type BatchStatus = "staged" | "checked" | "promoted" | "undone" | "dropped";

export type PromoteMode = "insert-new" | "insert-all" | "upsert" | "update-only" | "append";

export interface RowError {
  /** Column the problem is about (null for the whole row). */
  c: string | null;
  code: string;
  /** The offending value (shortened). */
  v?: string | null;
  m: string;
  /** Suggested fix in plain words. */
  f?: string;
  /** "load" problems stay until the row is edited; the rest are recomputed by each check. */
  s?: "load";
}

export const STG_PREFIX = "_stg_";
export const META_COLUMNS = ["_stg_row_id", "_stg_batch_id", "_stg_source_file", "_stg_row_number", "_stg_loaded_at", "_stg_status", "_stg_errors", "_stg_match", "_stg_raw"] as const;
