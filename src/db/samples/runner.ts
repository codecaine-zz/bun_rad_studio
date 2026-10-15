/** Runs a dataset: generates deterministic rows, creates the schema, loads the data in batches and reports progress. */
import { createHash } from "node:crypto";
import { hashString, Gen } from "./gen";
import { sqlHelpers } from "./dialect";
import {
  type Cell, type ColumnDef, type DatasetDef, type Dialect, type Row, type Scale, type TableDef,
  insertableColumns, tableCounts,
} from "./model";
import {
  SYNTHETIC_NOTICE, columnDoc, columnType, fixSequence, insertStatements, metaTableDefs, renderComments,
  renderCreateTable, renderIndexes, renderTriggers, renderViews,
} from "./render";

export class SeedCancelled extends Error {
  constructor() {
    super("Sample creation was cancelled");
    this.name = "SeedCancelled";
  }
}

export interface GeneratedTable {
  table: TableDef;
  rows: Cell[][];
}

function cellFor(ds: DatasetDef, t: TableDef, c: ColumnDef, row: Row, id: number): Cell {
  let v = row[c.name];
  if (v === undefined) {
    if (c.type === "id") v = id;
    else if (c.default?.kind === "now") v = `${ds.asOf} 00:00:00`;
    else if (c.default?.kind === "literal") v = c.default.value;
    else if (!c.notNull) v = null;
    else throw new Error(`${ds.id}.${t.name}.${c.name}: generator did not supply a value`);
  }
  if (v === null) {
    if (c.notNull) throw new Error(`${ds.id}.${t.name}.${c.name}: NULL for a NOT NULL column`);
    return null;
  }
  if (c.type === "dec" && typeof v === "number") return Number(v.toFixed(c.scale ?? 2));
  if (c.type === "bool") return v === true || v === 1 || v === "true";
  return v;
}

/** Yields the rows of every table in dependency order. Pure and deterministic for a given dataset, scale and seed. */
export function* generateDataset(ds: DatasetDef, scale: Scale, seed: number = ds.seed): Generator<GeneratedTable> {
  const counts = tableCounts(ds, scale);
  const retain = new Set<string>();
  for (const t of ds.tables) {
    for (const c of t.columns) if (c.ref) retain.add(c.ref.table);
    for (const u of t.uses) retain.add(u);
  }
  const store = new Map<string, Row[]>();
  const byName = new Map(ds.tables.map((t) => [t.name, t]));
  for (const name of ds.order) {
    const t = byName.get(name)!;
    const n = counts[name]!;
    const g = new Gen(hashString(`${seed}:${ds.id}:${name}`), scale, ds.asOf, store, name, n);
    let objs: Row[];
    if (t.rows) objs = t.rows;
    else if (t.all) objs = t.all(g);
    else {
      objs = new Array<Row>(n);
      for (let i = 0; i < n; i++) objs[i] = t.gen!(g, i + 1);
    }
    if (objs.length !== n) throw new Error(`${ds.id}.${name}: generator returned ${objs.length} rows, expected ${n}`);
    const cols = insertableColumns(t);
    const idCol = t.columns.find((c) => c.type === "id");
    const rows: Cell[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = objs[i]!;
      if (idCol && o[idCol.name] === undefined) o[idCol.name] = i + 1;
      rows[i] = cols.map((c) => cellFor(ds, t, c, o, i + 1));
    }
    if (retain.has(name)) store.set(name, objs);
    yield { table: t, rows };
  }
}

/** SHA-256 over every generated cell: equal hashes mean identical data. */
export function datasetHash(ds: DatasetDef, scale: Scale, seed: number = ds.seed): string {
  const h = createHash("sha256");
  for (const { table, rows } of generateDataset(ds, scale, seed)) {
    h.update(`#${table.name}\n`);
    for (const r of rows) h.update(JSON.stringify(r) + "\n");
  }
  return h.digest("hex");
}

export interface SeedProgress {
  phase: "schema" | "data" | "indexes" | "views" | "triggers" | "finish";
  table?: string;
  tableIndex: number;
  tableCount: number;
  rowsDone: number;
  rowsTotal: number;
  percent: number;
}

export interface SeedHooks {
  onProgress?: (p: SeedProgress) => void;
  isCancelled?: () => boolean;
  /** Lets the event loop breathe between batches (so a busy server can still answer progress polls). */
  yieldNow?: () => Promise<void>;
}

export interface SeedSummary {
  datasetId: string;
  scale: Scale;
  seed: number;
  tables: number;
  views: number;
  rows: number;
  tableRows: Record<string, number>;
  elapsedMs: number;
}

export type RunSql = (sql: string) => Promise<void>;

export async function seedDataset(
  ds: DatasetDef, dialect: Dialect, run: RunSql,
  opts: { scale: Scale; seed?: number } & SeedHooks,
): Promise<SeedSummary> {
  const started = Date.now();
  const seed = opts.seed ?? ds.seed;
  const counts = tableCounts(ds, opts.scale);
  const rowsTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const tableCount = ds.tables.length;
  let rowsDone = 0;
  let tableIndex = 0;
  const report = (phase: SeedProgress["phase"], table: string | undefined, pct: number) =>
    opts.onProgress?.({ phase, table, tableIndex, tableCount, rowsDone, rowsTotal, percent: Math.min(100, Math.round(pct)) });
  const check = () => {
    if (opts.isCancelled?.()) throw new SeedCancelled();
  };
  const exec = async (sql: string) => {
    check();
    await run(sql);
  };

  const metas = metaTableDefs();
  report("schema", undefined, 0);
  for (const m of metas) await exec(renderCreateTable(dialect, m));
  for (const t of ds.tables.slice().sort((a, b) => ds.order.indexOf(a.name) - ds.order.indexOf(b.name))) {
    await exec(renderCreateTable(dialect, t));
  }
  report("schema", undefined, 3);

  const h = sqlHelpers(dialect);
  const info: Cell[][] = [[ds.id, ds.title, ds.version, seed, opts.scale, ds.asOf, new Date().toISOString().slice(0, 19).replace("T", " "), "bun-rad-studio samples", SYNTHETIC_NOTICE]];
  for (const b of insertStatements(dialect, metas[0]!, info)) await exec(b.sql);

  let batches = 0;
  for (const { table, rows } of generateDataset(ds, opts.scale, seed)) {
    tableIndex++;
    for (const b of insertStatements(dialect, table, rows)) {
      await exec(b.sql);
      rowsDone += b.rows;
      report("data", table.name, 3 + (87 * rowsDone) / Math.max(1, rowsTotal));
      if (++batches % 4 === 0 && opts.yieldNow) await opts.yieldNow();
    }
    const fix = fixSequence(dialect, table);
    if (fix) await exec(fix);
  }

  const dict: Cell[][] = [];
  let did = 0;
  const dictRow = (obj: string, col: string | null, type: string, dataType: string | null, desc: string) => dict.push([++did, obj, col, type, dataType, desc]);
  for (const t of ds.tables) {
    dictRow(t.name, null, "table", null, t.comment);
    for (const c of t.columns) dictRow(t.name, c.name, "column", columnType(dialect, c), columnDoc(t, c));
  }
  for (const v of ds.views) dictRow(v.name, null, "view", null, v.comment);
  for (const b of insertStatements(dialect, metas[1]!, dict)) await exec(b.sql);
  const qrows: Cell[][] = ds.queries.map((q, i) => [i + 1, q.id, q.title, q.description, q.sql(h).trim()]);
  for (const b of insertStatements(dialect, metas[2]!, qrows)) await exec(b.sql);

  report("indexes", undefined, 90);
  for (const t of ds.tables) for (const sql of renderIndexes(dialect, t)) await exec(sql);
  await opts.yieldNow?.();
  report("views", undefined, 95);
  for (const sql of renderViews(dialect, ds)) await exec(sql);
  report("triggers", undefined, 98);
  for (const sql of renderTriggers(dialect, ds)) await exec(sql);
  for (const sql of renderComments(dialect, ds, metas)) await exec(sql);
  report("finish", undefined, 100);

  return {
    datasetId: ds.id,
    scale: opts.scale,
    seed,
    tables: tableCount,
    views: ds.views.length,
    rows: rowsDone,
    tableRows: counts,
    elapsedMs: Date.now() - started,
  };
}
