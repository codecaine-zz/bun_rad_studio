/**
 * Dialect-neutral model for the sample databases.
 *
 * One dataset definition (tables, columns, constraints, indexes, views, queries and a deterministic row generator)
 * is rendered to SQLite, MySQL and PostgreSQL by render.ts. Tables are described with compact column strings:
 *
 *   "<name> <type> [flags...] [= <generated expression>] [# comment]"
 *
 * Types:  id (identity primary key) int bigint smallint str(n) char(n) text dec(p,s) real bool date ts time json
 *         tags (text array) uuid enum(a,b,c)
 * Flags:  null (columns are NOT NULL by default)  uq  ix  upd (updated_at touched on UPDATE)  cascade (ON DELETE CASCADE)
 *         fk:table  or  fk:table.column     def:<value>  (def:now, def:0, def:true, def:draft, def:null)
 */
import type { Gen } from "./gen";

export type Dialect = "sqlite" | "mysql" | "postgres";
export type Scale = "small" | "medium" | "large";
export const SCALES: Scale[] = ["small", "medium", "large"];
export const DIALECTS: Dialect[] = ["sqlite", "mysql", "postgres"];

export type Cell = string | number | boolean | null | string[] | unknown[] | { [k: string]: unknown };
export type Row = Record<string, Cell | undefined>;

export type BaseType =
  | "id" | "int" | "bigint" | "smallint" | "str" | "char" | "text" | "dec" | "real"
  | "bool" | "date" | "ts" | "time" | "json" | "tags" | "uuid" | "enum";

export interface ColumnDef {
  name: string;
  type: BaseType;
  len?: number;
  prec?: number;
  scale?: number;
  enumValues?: string[];
  notNull: boolean;
  unique: boolean;
  indexed: boolean;
  pk: boolean;
  cascade: boolean;
  touch: boolean;
  default?: { kind: "now" } | { kind: "literal"; value: string | number | boolean | null };
  ref?: { table: string; column: string };
  generated?: string;
  comment?: string;
}

export interface IndexDef {
  cols: string[];
  unique: boolean;
  where?: string;
}

export type CountFn = (n: (table: string) => number, scale: Scale) => number;
export type Count = number | [number, number, number] | CountFn;

export interface TableDef {
  name: string;
  comment: string;
  columns: ColumnDef[];
  pk: string[];
  uniques: string[][];
  checks: string[];
  indexes: IndexDef[];
  count: Count;
  gen?: (g: Gen, i: number) => Row;
  all?: (g: Gen) => Row[];
  rows?: Row[];
  uses: string[];
}

export interface TableOpts {
  n?: Count;
  pk?: string[];
  uq?: string[][];
  ix?: string[];
  ck?: string[];
  gen?: (g: Gen, i: number) => Row;
  all?: (g: Gen) => Row[];
  rows?: Row[];
  uses?: string[];
}

export interface SqlHelpers {
  dialect: Dialect;
  concat(...parts: string[]): string;
  ym(x: string): string;
  year(x: string): string;
  month(x: string): string;
  dow(x: string): string;
  hour(x: string): string;
  dateOf(x: string): string;
  addDays(x: string, days: number | string): string;
  diffDays(a: string, b: string): string;
  strAgg(x: string, sep?: string): string;
  cast(x: string, to: "int" | "dec" | "text" | "date"): string;
  round(x: string, digits?: number): string;
  jsonGet(col: string, key: string): string;
  arrayHas(col: string, value: string): string;
  /** Scalar subquery returning the dataset's "as of" date (kept in _sample_info so results are reproducible). */
  asOf: string;
}

export type SqlFn = (d: SqlHelpers) => string;

export interface ViewDef {
  name: string;
  comment: string;
  sql: SqlFn;
  materialized: boolean;
}

export interface QueryDef {
  id: string;
  title: string;
  description: string;
  sql: SqlFn;
}

export interface RawTriggers {
  sqlite?: string[];
  mysql?: string[];
  postgres?: string[];
  /** PostgreSQL functions created for the triggers (dropped again when a sample is replaced). */
  postgresFunctions?: string[];
}

export interface DatasetDef {
  id: string;
  title: string;
  tagline: string;
  description: string;
  tags: string[];
  version: string;
  seed: number;
  asOf: string;
  tables: TableDef[];
  views: ViewDef[];
  queries: QueryDef[];
  triggers: RawTriggers;
  /** Features shown on the dataset card, e.g. "recursive CTE", "ledger triggers". */
  highlights: string[];
  /** Tables in foreign-key dependency order (parents first). */
  order: string[];
}

const SPEC_TYPE = /^(id|int|bigint|smallint|text|real|bool|date|ts|time|json|tags|uuid)$/;

export function parseColumn(spec: string): ColumnDef {
  let rest = spec.trim();
  let comment: string | undefined;
  const hash = rest.indexOf(" # ");
  if (hash >= 0) {
    comment = rest.slice(hash + 3).trim();
    rest = rest.slice(0, hash).trim();
  }
  let generated: string | undefined;
  const eq = rest.indexOf(" = ");
  if (eq >= 0) {
    generated = rest.slice(eq + 3).trim();
    rest = rest.slice(0, eq).trim();
  }
  const tokens = rest.split(/\s+/);
  const name = tokens[0]!;
  const typeTok = tokens[1];
  if (!name || !typeTok) throw new Error(`Bad column spec "${spec}"`);
  const col: ColumnDef = {
    name, type: "int", notNull: true, unique: false, indexed: false, pk: false, cascade: false, touch: false,
  };
  let m: RegExpMatchArray | null;
  if ((m = typeTok.match(/^(str|varchar|char)\((\d+)\)$/))) {
    col.type = m[1] === "char" ? "char" : "str";
    col.len = Number(m[2]);
  } else if ((m = typeTok.match(/^dec\((\d+),(\d+)\)$/))) {
    col.type = "dec";
    col.prec = Number(m[1]);
    col.scale = Number(m[2]);
  } else if ((m = typeTok.match(/^enum\(([^)]+)\)$/))) {
    col.type = "enum";
    col.enumValues = m[1]!.split(",").map((s) => s.trim());
    col.len = Math.max(...col.enumValues.map((s) => s.length), 1);
  } else if (SPEC_TYPE.test(typeTok)) {
    col.type = typeTok as BaseType;
  } else {
    throw new Error(`Unknown type "${typeTok}" in column spec "${spec}"`);
  }
  if (col.type === "id") {
    col.pk = true;
    col.notNull = true;
  }
  for (const flag of tokens.slice(2)) {
    if (flag === "null") col.notNull = false;
    else if (flag === "uq") col.unique = true;
    else if (flag === "ix") col.indexed = true;
    else if (flag === "upd") col.touch = true;
    else if (flag === "cascade") col.cascade = true;
    else if (flag.startsWith("fk:")) {
      const [t, c] = flag.slice(3).split(".");
      col.ref = { table: t!, column: c ?? "" };
    } else if (flag.startsWith("def:")) {
      const v = flag.slice(4);
      if (v === "now") col.default = { kind: "now" };
      else if (v === "null") col.default = { kind: "literal", value: null };
      else if (v === "true" || v === "false") col.default = { kind: "literal", value: v === "true" };
      else if (/^-?\d+(\.\d+)?$/.test(v)) col.default = { kind: "literal", value: Number(v) };
      else col.default = { kind: "literal", value: v.replace(/^'|'$/g, "") };
    } else throw new Error(`Unknown flag "${flag}" in column spec "${spec}"`);
  }
  if (col.touch) {
    if (col.name !== "updated_at" || col.type !== "ts") throw new Error(`"upd" is only valid on a ts column named updated_at: ${spec}`);
    col.default ??= { kind: "now" };
  }
  if (generated) {
    col.generated = generated;
    col.notNull = false;
  }
  if (comment) col.comment = comment;
  return col;
}

function parseIndex(spec: string): IndexDef {
  const m = spec.match(/^(unique\s+)?([a-z0-9_,\s]+?)(?:\s+where\s+(.+))?$/i);
  if (!m) throw new Error(`Bad index spec "${spec}"`);
  return { cols: m[2]!.split(",").map((s) => s.trim()), unique: Boolean(m[1]), where: m[3] };
}

export function table(name: string, comment: string, cols: string[], opts: TableOpts = {}): TableDef {
  const columns = cols.map(parseColumn);
  const idCols = columns.filter((c) => c.pk).map((c) => c.name);
  return {
    name,
    comment,
    columns,
    pk: opts.pk ?? idCols,
    uniques: opts.uq ?? [],
    checks: opts.ck ?? [],
    indexes: (opts.ix ?? []).map(parseIndex),
    count: opts.n ?? (opts.rows ? opts.rows.length : 1),
    gen: opts.gen,
    all: opts.all,
    rows: opts.rows,
    uses: opts.uses ?? [],
  };
}

export function view(name: string, comment: string, sql: SqlFn, materialized = false): ViewDef {
  return { name, comment, sql, materialized };
}

export function query(id: string, title: string, description: string, sql: SqlFn): QueryDef {
  return { id, title, description, sql };
}

export interface DatasetInput {
  id: string;
  title: string;
  tagline: string;
  description: string;
  tags: string[];
  asOf: string;
  seed?: number;
  version?: string;
  tables: TableDef[];
  views: ViewDef[];
  queries: QueryDef[];
  triggers?: RawTriggers;
  highlights?: string[];
}

/** Resolves foreign keys (the child column takes the parent's type), orders tables parents-first and validates the model. */
export function dataset(input: DatasetInput): DatasetDef {
  const byName = new Map<string, TableDef>();
  for (const t of input.tables) {
    if (byName.has(t.name)) throw new Error(`${input.id}: duplicate table ${t.name}`);
    byName.set(t.name, t);
  }
  for (const t of input.tables) {
    for (const c of t.columns) {
      if (!c.ref) continue;
      const parent = byName.get(c.ref.table);
      if (!parent) throw new Error(`${input.id}: ${t.name}.${c.name} references unknown table ${c.ref.table}`);
      const pkName = c.ref.column || parent.pk[0]!;
      const pc = parent.columns.find((x) => x.name === pkName);
      if (!pc) throw new Error(`${input.id}: ${t.name}.${c.name} references unknown column ${c.ref.table}.${pkName}`);
      c.ref.column = pkName;
      if (pc.type === "id") c.type = "int";
      else {
        c.type = pc.type;
        c.len = pc.len;
        c.prec = pc.prec;
        c.scale = pc.scale;
        c.enumValues = pc.enumValues;
      }
    }
    for (const c of t.columns) {
      if (c.generated && (c.default || c.pk)) throw new Error(`${input.id}: ${t.name}.${c.name} generated column cannot have a default`);
      if ((c.type === "text" || c.type === "json" || c.type === "tags") && (c.unique || c.indexed)) {
        throw new Error(`${input.id}: ${t.name}.${c.name} cannot be indexed (${c.type})`);
      }
    }
    const names = new Set(t.columns.map((c) => c.name));
    for (const p of t.pk) if (!names.has(p)) throw new Error(`${input.id}: ${t.name} primary key column ${p} missing`);
    for (const u of t.uniques) for (const c of u) if (!names.has(c)) throw new Error(`${input.id}: ${t.name} unique column ${c} missing`);
    for (const ix of t.indexes) for (const c of ix.cols) if (!names.has(c)) throw new Error(`${input.id}: ${t.name} index column ${c} missing`);
    if (!t.gen && !t.all && !t.rows) throw new Error(`${input.id}: ${t.name} has no row generator`);
  }
  const order: string[] = [];
  const state = new Map<string, number>();
  const visit = (name: string, trail: string[]) => {
    const s = state.get(name);
    if (s === 2) return;
    if (s === 1) throw new Error(`${input.id}: foreign key cycle ${[...trail, name].join(" -> ")}`);
    state.set(name, 1);
    const t = byName.get(name)!;
    for (const c of t.columns) if (c.ref && c.ref.table !== name) visit(c.ref.table, [...trail, name]);
    for (const u of t.uses) {
      if (!byName.has(u)) throw new Error(`${input.id}: ${name} uses unknown table ${u}`);
      if (u !== name) visit(u, [...trail, name]);
    }
    state.set(name, 2);
    order.push(name);
  };
  for (const t of input.tables) visit(t.name, []);
  return {
    id: input.id,
    title: input.title,
    tagline: input.tagline,
    description: input.description,
    tags: input.tags,
    version: input.version ?? "1.0",
    seed: input.seed ?? 20250630,
    asOf: input.asOf,
    tables: input.tables,
    views: input.views,
    queries: input.queries,
    triggers: input.triggers ?? {},
    highlights: input.highlights ?? [],
    order,
  };
}

export function resolveCount(t: TableDef, scale: Scale, n: (table: string) => number): number {
  const c = t.count;
  if (typeof c === "number") return c;
  if (Array.isArray(c)) return c[SCALES.indexOf(scale)]!;
  return c(n, scale);
}

/** Exact row counts per table for a scale (dependency order, no data generated). */
export function tableCounts(ds: DatasetDef, scale: Scale): Record<string, number> {
  const out: Record<string, number> = {};
  const byName = new Map(ds.tables.map((t) => [t.name, t]));
  for (const name of ds.order) out[name] = resolveCount(byName.get(name)!, scale, (x) => {
    const v = out[x];
    if (v === undefined) throw new Error(`${ds.id}: count of ${name} needs ${x} which is not ready`);
    return v;
  });
  return out;
}

export function insertableColumns(t: TableDef): ColumnDef[] {
  return t.columns.filter((c) => !c.generated);
}
