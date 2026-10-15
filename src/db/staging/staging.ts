/**
 * Step 3: load the incoming records into a staging table. The target table is never touched here.
 *
 * The staging table lives in the same database (and PostgreSQL schema) as the target and is called
 * `stg_<target>_<yyyymmdd_hhmm>` (a numeric suffix is added when that name is taken). Its data columns are TEXT, named like the
 * target columns they will go into, so nothing is coerced on the way in. Next to them are the `_stg_*` columns that
 * record where every row came from and what became of it.
 */
import type { ByteSource } from "./source";
import { breathe, q, refOf, type StageConn, type StageDb } from "./db";
import { newBatchId, Params, stagingDdl, stagingName } from "./dialect";
import { insertBatch, ensureLedger, nowIso, type BatchRecord } from "./ledger";
import { limitMessage, limits, StagingError } from "./limits";
import { compileRules } from "./mapping";
import { newReadContext, readRows, type SourceSettings } from "./reader";
import type { ColumnRule, ImportPlan, RowError } from "./types";

export class LoadCancelled extends Error {
  constructor() {
    super("The load was cancelled and nothing was kept.");
    this.name = "LoadCancelled";
  }
}

export interface LoadProgress {
  rows: number;
  /** 0..1 of the file read so far (an estimate). */
  fraction: number;
}

export interface LoadOptions {
  db: StageDb;
  src: ByteSource;
  settings: SourceSettings;
  /** Names of the source columns, in file order. */
  sourceColumns: string[];
  plan: ImportPlan;
  /** Name shown in `_stg_source_file` (file name only, never a path). */
  fileName: string;
  signal?: AbortSignal;
  onProgress?: (p: LoadProgress) => void;
  batchId?: string;
}

export interface LoadResult {
  batch: BatchRecord;
  stagingTable: string;
  dataColumns: string[];
  rowsLoaded: number;
  /** Rows that were damaged in the file (marked invalid right away). */
  problemRows: number;
  warnings: string[];
}

const shortName = (s: string) => s.replace(/[\\/]/g, "/").split("/").pop()!.slice(0, 255);

function countingSource(src: ByteSource, counter: { bytes: number }): ByteSource {
  return {
    ...src,
    chunks() {
      const inner = src.chunks()[Symbol.asyncIterator]();
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              const r = await inner.next();
              if (!r.done) counter.bytes += r.value.byteLength;
              return r;
            },
            async return() {
              await inner.return?.();
              return { done: true, value: undefined };
            },
          };
        },
      };
    },
  } as ByteSource;
}

export async function loadIntoStaging(o: LoadOptions): Promise<LoadResult> {
  const { db, plan } = o;
  const e = db.engine;
  await ensureLedger(db);
  const rules: ColumnRule[] = plan.rules;
  const builder = compileRules(rules, o.sourceColumns);
  const dataColumns = builder.columns;
  if (!dataColumns.length) throw new StagingError("No columns are mapped, so there is nothing to load. Map at least one column.", "NOTHING_MAPPED");
  for (const c of dataColumns) if (c.startsWith("_stg_")) throw new StagingError(`A column called “${c}” clashes with the staging bookkeeping columns (they all start with _stg_). Rename it first.`, "BAD_COLUMN");

  const existing = await db.tables();
  const stg = stagingName(plan.target, existing);
  const batchId = o.batchId ?? newBatchId();
  const file = shortName(o.fileName);
  const loadedAt = nowIso();
  const metaCols = ["_stg_batch_id", "_stg_source_file", "_stg_row_number", "_stg_loaded_at", "_stg_status", "_stg_errors", "_stg_raw"];
  const insertCols = [...dataColumns, ...metaCols];
  const perBatch = Math.max(1, Math.min(limits.batchRows, Math.floor(limits.maxParams / insertCols.length)));
  const sqlCache = new Map<number, string>();
  const sqlFor = (rows: number, p: Params): string => {
    const groups: string[] = [];
    for (let r = 0; r < rows; r++) groups.push("(" + insertCols.map((c) => p.add(null, c === "_stg_row_number" ? "bigint" : "text")).join(", ") + ")");
    return `INSERT INTO ${refOf(db, stg)} (${insertCols.map((c) => q(e, c)).join(", ")}) VALUES ${groups.join(", ")}`;
  };

  await (async () => {
    const c = await db.open();
    try {
      await c.query(stagingDdl(db, stg, dataColumns));
    } finally {
      await c.release();
    }
  })();

  const counter = { bytes: 0 };
  const src = countingSource(o.src, counter);
  const ctx = newReadContext();
  const warnings: string[] = [];
  let conn: StageConn | null = null;
  let inTx = false;
  let rows = 0;
  let problems = 0;
  let nulStripped = 0;
  let extraFields = 0;
  let pending: unknown[][] = [];

  const clean = (v: string | null): string | null => {
    if (v !== null && v.includes("\0")) {
      nulStripped++;
      return v.replaceAll("\0", "");
    }
    return v;
  };

  const flush = async () => {
    if (!pending.length) return;
    let text = sqlCache.get(pending.length);
    if (!text) sqlCache.set(pending.length, (text = sqlFor(pending.length, new Params(e))));
    const flat = pending.flat();
    pending = [];
    await conn!.query(text, flat);
  };

  const dropStaging = async () => {
    try {
      const c = await db.open();
      try {
        await c.query(`DROP TABLE IF EXISTS ${refOf(db, stg)}`);
      } finally {
        await c.release();
      }
    } catch {
      /* best effort */
    }
  };

  try {
    conn = await db.open();
    // The studio's own in-memory SQLite connection is shared with everything else: no transaction is held open across
    // reads of the file there; a failed or cancelled load drops the (new) staging table instead, which has the same effect.
    if (!db.shared) {
      await conn.begin();
      inTx = true;
    }
    for await (const row of readRows(src, o.settings, o.sourceColumns, ctx)) {
      if (o.signal?.aborted) throw new LoadCancelled();
      if (rows >= limits.maxRows) throw new StagingError(limitMessage("rows"), "TOO_MANY_ROWS", 413);
      const built = builder.build(row.cells);
      const errors: RowError[] = [];
      if (row.problem) {
        problems++;
        errors.push({ c: null, code: "damaged_row", m: row.problem, f: "Fix the cells in place or skip this row.", s: "load" });
      }
      let raw: string | null = null;
      if (built.changed || row.problem || row.extra || builder.unusedSource.length) {
        const obj: Record<string, string | null> = {};
        o.sourceColumns.forEach((n, i) => (obj[n] = row.cells[i] ?? null));
        if (row.extra) {
          Object.assign(obj, row.extra);
          extraFields++;
        }
        const out: any = obj;
        if (row.rawCells && row.rawCells.length > o.sourceColumns.length) out["(extra cells)"] = row.rawCells.slice(o.sourceColumns.length);
        raw = JSON.stringify(out);
      }
      rows++;
      pending.push([...built.values.map(clean), batchId, file, row.n, loadedAt, errors.length ? "invalid" : "new", errors.length ? JSON.stringify(errors) : null, raw]);
      if (pending.length >= perBatch) {
        await flush();
        o.onProgress?.({ rows, fraction: o.src.size ? Math.min(0.99, counter.bytes / o.src.size) : 0 });
        await breathe(db);
      }
    }
    if (o.signal?.aborted) throw new LoadCancelled();
    await flush();
    if (inTx) {
      await conn.commit();
      inTx = false;
    }
  } catch (err) {
    if (inTx) await conn?.rollback().catch(() => {});
    await conn?.release().catch(() => {});
    conn = null;
    await dropStaging();
    throw err;
  }
  await conn.release();

  if (nulStripped) warnings.push(`${nulStripped} cell${nulStripped === 1 ? "" : "s"} contained invisible NUL characters, which databases cannot store; they were removed.`);
  if (extraFields) warnings.push(`${extraFields} row${extraFields === 1 ? "" : "s"} had fields that are not among the columns. They are kept in the raw copy of the row.`);
  if (ctx.replaced.replaced) warnings.push(`${ctx.replaced.replaced} character${ctx.replaced.replaced === 1 ? "" : "s"} could not be read with the chosen encoding.`);
  for (const w of ctx.warnings) warnings.push(w);

  const batch: BatchRecord = {
    batchId,
    createdAt: loadedAt,
    sourceName: file,
    targetTable: plan.target,
    newTable: plan.createTable,
    stagingTable: stg,
    mode: null,
    status: "staged",
    rowsTotal: rows,
    rowsValid: 0,
    rowsInvalid: problems,
    rowsDuplicate: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    promotedAt: null,
    undoneAt: null,
    droppedAt: null,
    undoable: false,
    undoNote: null,
    config: { plan, settings: o.settings, sourceColumns: o.sourceColumns, dataColumns },
    note: null,
  };
  const c2 = await db.open();
  try {
    await insertBatch(db, c2, batch);
  } finally {
    await c2.release();
  }
  o.onProgress?.({ rows, fraction: 1 });
  return { batch, stagingTable: stg, dataColumns, rowsLoaded: rows, problemRows: problems, warnings };
}
