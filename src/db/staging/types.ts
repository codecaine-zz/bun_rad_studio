/** Shared shapes of the staging import. Plain data only, so they can be sent to the page as JSON. */
import type { Engine } from "../types";

/** Broad data type family used for staging validation and type coercion rules. */
export type TypeClass = "integer" | "decimal" | "float" | "boolean" | "date" | "time" | "timestamp" | "uuid" | "json" | "enum" | "text" | "binary" | "other";

/** Metadata describing a single column in the target database table. */
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

/** Foreign key constraint on a target table referencing another table's columns. */
export interface TargetForeignKey {
  columns: string[];
  refSchema?: string;
  refTable: string;
  refColumns: string[];
}

/** Full schema description of the target database table for a staging import. */
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

/** A single cell transformation or normalization step applied during staging or review. */
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

/** Specification of how a target column's raw value is derived from incoming source columns. */
export type SourceSpec =
  | { kind: "column"; column: string }
  | { kind: "concat"; columns: string[]; separator: string }
  | { kind: "split"; column: string; separator: string; part: number }
  | { kind: "constant"; value: string | null }
  | { kind: "skip" };

/** Mapping and transformation rule for populating a single target column. */
export interface ColumnRule {
  target: string;
  source: SourceSpec;
  steps: Step[];
}

/** Custom user-defined validation rule evaluated against staged column values. */
export interface UserRule {
  column: string;
  kind: "regex" | "min" | "max" | "oneof" | "length" | "notempty";
  /** regex pattern, a number, a comma-separated list, or "min-max" for length. */
  value: string;
  message?: string;
}

/** Complete configuration plan for mapping, validating, and promoting a staging import. */
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

/** Lifecycle status of an import batch in the staging ledger. */
export type BatchStatus = "staged" | "checked" | "promoted" | "undone" | "dropped";

/** Strategy for promoting validated rows from the staging table into the target table. */
export type PromoteMode = "insert-new" | "insert-all" | "upsert" | "update-only" | "append";

/** Structured validation or load problem recorded on a staged row. */
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

/** Prefix reserved for internal bookkeeping columns on staging tables. */
export const STG_PREFIX = "_stg_";
/** Ordered list of metadata column names present on every staging table. */
export const META_COLUMNS = ["_stg_row_id", "_stg_batch_id", "_stg_source_file", "_stg_row_number", "_stg_loaded_at", "_stg_status", "_stg_errors", "_stg_match", "_stg_raw"] as const;
