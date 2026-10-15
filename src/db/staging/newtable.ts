/**
 * "Create a new table from this data": works out column types from the data and builds the CREATE TABLE for each engine.
 */
import type { Engine } from "../types";
import { q, refOf, type StageDb } from "./db";
import { isOwnTable, safeColumnNames } from "./dialect";
import { StagingError } from "./limits";
import type { SourceColumn } from "./reader";
import type { ColumnRule, ImportPlan, TargetColumn, TargetTable, TypeClass } from "./types";
import { suggestSteps } from "./mapping";

export const NEW_KINDS = ["text", "integer", "decimal", "boolean", "date", "timestamp", "json", "uuid"] as const;
export type NewKind = (typeof NEW_KINDS)[number];

export interface NewColumnSpec {
  name: string;
  kind: NewKind;
  nullable: boolean;
  /** Longest text seen (text columns). */
  length?: number;
  precision?: number;
  scale?: number;
}

export interface NewTableSpec {
  columns: NewColumnSpec[];
  /** Add an automatic `id` primary key column. */
  autoId: boolean;
}

const isKind = (k: unknown): k is NewKind => (NEW_KINDS as readonly string[]).includes(k as string);

/** A table name that is safe to create: letters, digits and underscores only. */
export function checkNewTableName(name: string, existing: string[]): string {
  const n = (name ?? "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(n)) throw new StagingError("A table name may use letters, digits and underscores only, must not start with a digit, and can be up to 60 characters.", "BAD_NAME");
  if (/^(_stg_|_import_)/i.test(n) || isOwnTable(n.toLowerCase())) throw new StagingError("That name is reserved for the import's own staging and record tables. Choose another name.", "BAD_NAME");
  if (existing.some((t) => t.toLowerCase() === n.toLowerCase())) throw new StagingError(`A table called “${n}” already exists. Choose another name, or pick it as the existing table to load into.`, "NAME_TAKEN", 409);
  return n;
}

/** First suggestion of column names and types from what the data looks like. */
export function suggestNewTable(columns: SourceColumn[]): { spec: NewTableSpec; rules: ColumnRule[] } {
  const names = safeColumnNames(columns.map((c) => c.name));
  const specs: NewColumnSpec[] = columns.map((c, i) => {
    const inf = c.inferred;
    const kind: NewKind = inf.kind;
    return {
      name: names[i]!,
      kind,
      nullable: true,
      ...(kind === "text" ? { length: Math.max(1, inf.maxLength) } : {}),
      ...(kind === "decimal" ? { precision: Math.min(38, Math.max(inf.intDigits + inf.scale, 1) + 2), scale: inf.scale } : {}),
    };
  });
  const hasId = names.some((n) => n.toLowerCase() === "id");
  const rules: ColumnRule[] = columns.map((c, i) => {
    const t = toTargetColumn(specs[i]!, "sqlite");
    return { target: specs[i]!.name, source: { kind: "column", column: c.name }, steps: suggestSteps(t, c) };
  });
  return { spec: { columns: specs, autoId: !hasId }, rules };
}

export function sanitizeNewTable(input: unknown, existingNames?: string[]): NewTableSpec {
  const raw = input as any;
  if (!raw || !Array.isArray(raw.columns) || raw.columns.length === 0) throw new StagingError("The new table needs at least one column.", "BAD_REQUEST");
  const names = safeColumnNames(raw.columns.map((c: any) => String(c?.name ?? "")));
  const columns: NewColumnSpec[] = raw.columns.map((c: any, i: number) => {
    const kind = isKind(c?.kind) ? c.kind : "text";
    const num = (v: unknown, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.trunc(Number(v)))) : undefined);
    return {
      name: names[i]!,
      kind,
      nullable: c?.nullable !== false,
      ...(kind === "text" && num(c.length, 1, 1_000_000) ? { length: num(c.length, 1, 1_000_000)! } : {}),
      ...(kind === "decimal" ? { precision: num(c.precision, 1, 38) ?? 20, scale: num(c.scale, 0, 30) ?? 6 } : {}),
    };
  });
  void existingNames;
  return { columns, autoId: raw.autoId === true };
}

function typeSql(engine: Engine, c: NewColumnSpec): string {
  switch (c.kind) {
    case "integer":
      return engine === "sqlite" ? "INTEGER" : "BIGINT";
    case "decimal":
      return engine === "sqlite" ? "NUMERIC" : `${engine === "postgres" ? "NUMERIC" : "DECIMAL"}(${Math.max(1, Math.min(38, c.precision ?? 20))},${Math.min(c.scale ?? 6, c.precision ?? 20)})`;
    case "boolean":
      return engine === "mysql" ? "TINYINT(1)" : "BOOLEAN";
    case "date":
      return "DATE";
    case "timestamp":
      return engine === "mysql" ? "DATETIME(6)" : engine === "postgres" ? "TIMESTAMP" : "TIMESTAMP";
    case "json":
      return engine === "postgres" ? "JSONB" : engine === "mysql" ? "JSON" : "TEXT";
    case "uuid":
      return engine === "postgres" ? "UUID" : engine === "mysql" ? "CHAR(36)" : "TEXT";
    default:
      return engine === "mysql" ? ((c.length ?? 255) <= 255 ? `VARCHAR(${Math.max(16, Math.min(255, Math.ceil((c.length ?? 255) / 16) * 16))})` : "LONGTEXT") : "TEXT";
  }
}

const CLASS: Record<NewKind, TypeClass> = { text: "text", integer: "integer", decimal: "decimal", boolean: "boolean", date: "date", timestamp: "timestamp", json: "json", uuid: "uuid" };

export function toTargetColumn(c: NewColumnSpec, engine: Engine, pk?: number): TargetColumn {
  const dataType = typeSql(engine, c);
  return {
    name: c.name,
    dataType,
    cls: CLASS[c.kind],
    nullable: c.nullable && pk === undefined,
    hasDefault: false,
    auto: false,
    generated: false,
    pkPosition: pk ?? null,
    ...(c.kind === "integer" ? { bits: 64 } : {}),
    ...(c.kind === "decimal" && engine !== "sqlite" ? { precision: c.precision ?? 20, scale: Math.min(c.scale ?? 6, c.precision ?? 20) } : {}),
    ...(c.kind === "text" && engine === "mysql" && (c.length ?? 255) <= 255 ? { length: Math.max(16, Math.min(255, Math.ceil((c.length ?? 255) / 16) * 16)) } : {}),
  };
}

/** The target description and CREATE TABLE for a table that will be created by the import. */
export function newTableTarget(db: Pick<StageDb, "engine" | "schema">, name: string, spec: NewTableSpec, keyColumns: string[]): { target: TargetTable; ddl: string } {
  const e = db.engine;
  const keys = keyColumns.filter((k) => spec.columns.some((c) => c.name === k));
  if (spec.autoId && spec.columns.some((c) => c.name.toLowerCase() === "id")) throw new StagingError("The data already has a column called id, so an automatic id column can't be added. Turn the automatic id off or rename the column.", "BAD_NAME");
  const cols: TargetColumn[] = spec.columns.map((c) => toTargetColumn(c, e, keys.includes(c.name) ? keys.indexOf(c.name) + 1 : undefined));
  const defs: string[] = [];
  if (spec.autoId) defs.push(`${q(e, "id")} ${e === "sqlite" ? "INTEGER PRIMARY KEY AUTOINCREMENT" : e === "mysql" ? "BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY" : "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY"}`);
  for (const c of cols) defs.push(`${q(e, c.name)} ${c.dataType}${c.nullable ? "" : " NOT NULL"}`);
  if (!spec.autoId && keys.length) defs.push(`PRIMARY KEY (${keys.map((k) => q(e, k)).join(", ")})`);
  const target: TargetTable = {
    engine: e,
    ...(db.schema ? { schema: db.schema } : {}),
    name,
    columns: spec.autoId ? [{ name: "id", dataType: "BIGINT", cls: "integer", nullable: false, hasDefault: false, auto: true, generated: false, pkPosition: 1, bits: 64 }, ...cols] : cols,
    primaryKey: spec.autoId ? ["id"] : keys,
    uniques: [],
    foreignKeys: [],
    virtual: true,
  };
  return { target, ddl: `CREATE TABLE ${refOf(db, name)} (${defs.join(", ")})${e === "mysql" ? " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" : ""}` };
}

export function planFor(plan: ImportPlan): ImportPlan {
  return plan;
}
