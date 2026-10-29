/**
 * Working with the staged rows: look at them, fix a cell in place, skip rows, clean a whole column, download the rejects,
 * list and drop staging tables. All of it touches staging tables only, never the target.
 */
import { csvCell } from "../wire";
import { breathe, q, refOf, type StageDb } from "./db";
import { CHANGES, LEDGER, Params, STAGING_NAME } from "./dialect";
import { ensureLedger, getBatch, listBatches, nowIso, updateBatch, type BatchRecord } from "./ledger";
import { limits, StagingError } from "./limits";
import { applyStep } from "./mapping";
import type { RowError, Step } from "./types";

const col = (db: StageDb, n: string) => q(db.engine, n);

export async function stagingDataColumns(db: StageDb, batch: BatchRecord): Promise<string[]> {
  const cfg = batch.config?.dataColumns;
  if (Array.isArray(cfg) && cfg.length) return cfg.map(String);
  const t = await db.describe(batch.stagingTable!);
  return t.columns.map((c) => c.name).filter((n) => !n.startsWith("_stg_"));
}

async function need(db: StageDb, batchId: string): Promise<BatchRecord & { stagingTable: string }> {
  const b = await getBatch(db, batchId);
  if (!b) throw new StagingError("That import was not found.", "NOT_FOUND", 404);
  if (!b.stagingTable || b.droppedAt) throw new StagingError("The staging table of this import has been dropped.", "NO_STAGING", 409);
  return b as BatchRecord & { stagingTable: string };
}

export interface StagedRow {
  rowId: number;
  rowNumber: number | null;
  status: string;
  match: string | null;
  errors: RowError[];
  values: Record<string, string | null>;
}

const parseErrors = (t: unknown): RowError[] => {
  if (typeof t !== "string" || !t) return [];
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export interface RowFilter {
  status?: string | string[];
  match?: string;
  /** Only rows that have a problem in this column. */
  column?: string;
  code?: string;
  /** Keyset cursor: rows after this staging row id. */
  after?: number;
  limit?: number;
}

const STATUSES = new Set(["new", "valid", "invalid", "duplicate", "promoted", "skipped"]);

export async function listStagedRows(db: StageDb, batchId: string, f: RowFilter): Promise<{ rows: StagedRow[]; columns: string[]; next: number | null }> {
  const b = await need(db, batchId);
  const cols = await stagingDataColumns(db, b);
  const limit = Math.max(1, Math.min(500, f.limit ?? limits.pageSize));
  const out: StagedRow[] = [];
  let after = f.after ?? 0;
  let more = true;
  while (out.length < limit && more) {
    const p = new Params(db.engine);
    const where: string[] = [`${col(db, "_stg_row_id")} > ${p.add(after, "bigint")}`];
    if (f.status) {
      const list = Array.isArray(f.status) ? f.status : [f.status];
      if (!list.length || !list.every((x) => STATUSES.has(x))) throw new StagingError("Unknown status.", "BAD_REQUEST");
      where.push(`${col(db, "_stg_status")} IN (${list.map((x) => p.add(x, "text")).join(", ")})`);
    }
    if (f.match) where.push(`${col(db, "_stg_match")} = ${p.add(f.match, "text")}`);
    const rows = (await (async () => {
      const c = await db.open();
      try {
        return await c.query(`SELECT ${[ "_stg_row_id", "_stg_row_number", "_stg_status", "_stg_match", "_stg_errors", ...cols].map((x) => col(db, x)).join(", ")} FROM ${refOf(db, b.stagingTable)} WHERE ${where.join(" AND ")} ORDER BY ${col(db, "_stg_row_id")} LIMIT ${Math.min(500, limit * 2)}`, p.values);
      } finally {
        await c.release();
      }
    })()).rows;
    more = rows.length >= Math.min(500, limit * 2);
    for (const r of rows) {
      after = Number(r._stg_row_id);
      const errors = parseErrors(r._stg_errors);
      if (f.column && !errors.some((e) => e.c === f.column)) continue;
      if (f.code && !errors.some((e) => e.code === f.code)) continue;
      out.push({ rowId: after, rowNumber: r._stg_row_number === null ? null : Number(r._stg_row_number), status: String(r._stg_status), match: r._stg_match === null ? null : String(r._stg_match), errors, values: Object.fromEntries(cols.map((n) => [n, r[n] === null ? null : String(r[n])])) });
      if (out.length >= limit) break;
    }
    if (!rows.length) break;
  }
  return { rows: out, columns: cols, next: out.length >= limit ? out[out.length - 1]!.rowId : null };
}

export interface ErrorLine {
  rowId: number;
  rowNumber: number | null;
  column: string | null;
  value: string | null;
  code: string;
  message: string;
  fix: string | null;
  status: string;
}

/** The problems, one line per problem, in row order. */
export async function listProblems(db: StageDb, batchId: string, f: { column?: string; code?: string; after?: number; limit?: number }): Promise<{ lines: ErrorLine[]; next: number | null }> {
  const limit = Math.max(1, Math.min(500, f.limit ?? limits.pageSize));
  const lines: ErrorLine[] = [];
  let after = f.after ?? 0;
  for (let guard = 0; guard < 500; guard++) {
    const page = await listStagedRows(db, batchId, { after, limit: 100, status: ["invalid", "duplicate"], ...(f.column ? { column: f.column } : {}), ...(f.code ? { code: f.code } : {}) });
    for (const r of page.rows) {
      for (const e of r.errors) {
        if ((f.column && e.c !== f.column) || (f.code && e.code !== f.code)) continue;
        lines.push({ rowId: r.rowId, rowNumber: r.rowNumber, column: e.c, value: e.v ?? null, code: e.code, message: e.m, fix: e.f ?? null, status: r.status });
      }
      after = r.rowId;
      if (lines.length >= limit) return { lines, next: after };
    }
    if (page.next === null) return { lines, next: null };
    after = page.next;
  }
  return { lines, next: after };
}

/** Changes one staged cell. The row goes back to "new" so the next check looks at it again. */
export async function fixCell(db: StageDb, batchId: string, rowId: number, column: string, value: string | null): Promise<void> {
  const b = await need(db, batchId);
  const cols = await stagingDataColumns(db, b);
  if (!cols.includes(column)) throw new StagingError(`There is no column called “${column}” in this staging table.`, "BAD_COLUMN");
  if (b.status === "promoted" || b.status === "undone") throw new StagingError("This import was already promoted, so its staged rows can't be edited.", "ALREADY_PROMOTED", 409);
  if (!Number.isInteger(rowId)) throw new StagingError("Choose a row.", "BAD_REQUEST");
  const c = await db.open();
  try {
    const p = new Params(db.engine);
    const set = `${col(db, column)} = ${p.add(value, "text")}`;
    const r = await c.query(`UPDATE ${refOf(db, b.stagingTable)} SET ${set}, ${col(db, "_stg_status")} = 'new', ${col(db, "_stg_errors")} = NULL, ${col(db, "_stg_match")} = NULL WHERE ${col(db, "_stg_row_id")} = ${p.add(rowId, "bigint")} AND ${col(db, "_stg_status")} IN ('new','valid','invalid','duplicate','skipped')`, p.values);
    if (r.affected === 0) throw new StagingError("That row can't be edited (it was already imported, or it is not there).", "NOT_FOUND", 404);
  } finally {
    await c.release();
  }
}

/** Skip (or bring back) rows by id, or every row with a given status. */
export async function setSkipped(db: StageDb, batchId: string, spec: { rowIds?: number[]; status?: "invalid" | "duplicate"; skip: boolean }): Promise<number> {
  const b = await need(db, batchId);
  const c = await db.open();
  try {
    const e = db.engine;
    const p = new Params(e);
    const to = spec.skip ? "skipped" : "new";
    const from = spec.skip ? (spec.status ? [spec.status] : ["new", "valid", "invalid", "duplicate"]) : ["skipped"];
    const base = `UPDATE ${refOf(db, b.stagingTable)} SET ${col(db, "_stg_status")} = ${p.add(to, "text")}${spec.skip ? "" : `, ${col(db, "_stg_match")} = NULL`} WHERE ${col(db, "_stg_status")} IN (${from.map((x) => p.add(x, "text")).join(", ")})`;
    if (spec.rowIds) {
      if (!spec.rowIds.length || spec.rowIds.length > 5000 || !spec.rowIds.every(Number.isInteger)) throw new StagingError("Choose between 1 and 5000 rows.", "BAD_REQUEST");
      return (await c.query(`${base} AND ${col(db, "_stg_row_id")} IN (${spec.rowIds.map((id) => p.add(id, "bigint")).join(", ")})`, p.values)).affected;
    }
    return (await c.query(base, p.values)).affected;
  } finally {
    await c.release();
  }
}

/** Applies one clean-up step to every row of a staged column (in chunks). Returns how many cells changed. */
export async function transformColumn(db: StageDb, batchId: string, column: string, step: Step, onProgress?: (done: number) => void): Promise<number> {
  const b = await need(db, batchId);
  const cols = await stagingDataColumns(db, b);
  if (!cols.includes(column)) throw new StagingError(`There is no column called “${column}” in this staging table.`, "BAD_COLUMN");
  if (b.status === "promoted" || b.status === "undone") throw new StagingError("This import was already promoted, so its staged rows can't be changed.", "ALREADY_PROMOTED", 409);
  const c = await db.open();
  let changed = 0;
  try {
    await c.begin();
    let last = 0;
    for (;;) {
      const p = new Params(db.engine);
      const rows = (await c.query(`SELECT ${col(db, "_stg_row_id")} AS id, ${col(db, column)} AS v FROM ${refOf(db, b.stagingTable)} WHERE ${col(db, "_stg_status")} IN ('new','valid','invalid','duplicate') AND ${col(db, "_stg_row_id")} > ${p.add(last, "bigint")} ORDER BY ${col(db, "_stg_row_id")} LIMIT 1000`, p.values)).rows;
      if (!rows.length) break;
      last = Number(rows[rows.length - 1]!.id);
      const diff: { id: number; v: string | null }[] = [];
      for (const r of rows) {
        const before = r.v === null ? null : String(r.v);
        const after = applyStep(before, step);
        if (after !== before) diff.push({ id: Number(r.id), v: after });
      }
      for (let i = 0; i < diff.length; i += 250) {
        const part = diff.slice(i, i + 250);
        const q2 = new Params(db.engine);
        const cases = part.map((d) => `WHEN ${q2.add(d.id, "bigint")} THEN ${q2.add(d.v, "text")}`).join(" ");
        const ids = part.map((d) => q2.add(d.id, "bigint")).join(", ");
        await c.query(`UPDATE ${refOf(db, b.stagingTable)} SET ${col(db, column)} = CASE ${col(db, "_stg_row_id")} ${cases} END, ${col(db, "_stg_status")} = 'new', ${col(db, "_stg_errors")} = NULL, ${col(db, "_stg_match")} = NULL WHERE ${col(db, "_stg_row_id")} IN (${ids})`, q2.values);
      }
      changed += diff.length;
      onProgress?.(changed);
      await breathe(db, true);
    }
    await c.commit();
  } catch (err) {
    await c.rollback().catch(() => {});
    throw err;
  } finally {
    await c.release();
  }
  return changed;
}

/** The rows with problems as CSV text chunks: their original row number, status, every staged value, and what is wrong. */
export async function* rejectsCsv(db: StageDb, batchId: string): AsyncGenerator<string> {
  const b = await need(db, batchId);
  const cols = await stagingDataColumns(db, b);
  yield ["row_number", "status", ...cols, "problems"].map((x) => csvCell(x)).join(",") + "\r\n";
  let after = 0;
  for (;;) {
    const page = await listStagedRows(db, batchId, { after, limit: 500, status: ["invalid", "duplicate"] });
    for (const r of page.rows) yield [r.rowNumber ?? "", r.status, ...cols.map((c) => r.values[c] ?? null), r.errors.map((e) => `${e.c ? e.c + ": " : ""}${e.m}`).join(" | ")].map((x) => csvCell(x as never)).join(",") + "\r\n";
    if (page.next === null) break;
    after = page.next;
  }
}

// ---- the staging area ---------------------------------------------------------------------------------------------------

export interface StagingEntry {
  batch: BatchRecord;
  /** Rows in the staging table now (null when it was dropped). */
  rows: number | null;
  bytes: number | null;
  ageDays: number;
  /** Older than the keep-for setting: the page offers to drop it. */
  stale: boolean;
}

export async function stagingArea(db: StageDb): Promise<{ entries: StagingEntry[]; orphans: string[]; retainDays: number }> {
  await ensureLedger(db);
  const batches = await listBatches(db);
  const tables = await db.tables();
  const have = new Set(tables);
  const entries: StagingEntry[] = [];
  let sharedConn: Awaited<ReturnType<StageDb["open"]>> | null = null;
  try {
    for (const b of batches) {
      let rows: number | null = null;
      let bytes: number | null = null;
      if (b.stagingTable && have.has(b.stagingTable)) {
        try {
          if (!sharedConn) sharedConn = await db.open();
          rows = Number((await sharedConn.query(`SELECT COUNT(*) AS c FROM ${refOf(db, b.stagingTable)}`)).rows[0]?.c ?? 0);
          bytes = await db.sizeOf(b.stagingTable);
        } catch {
          rows = null;
        }
      }
      const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(b.createdAt)) / 86_400_000));
      entries.push({ batch: b, rows, bytes, ageDays, stale: !!b.stagingTable && have.has(b.stagingTable) && ageDays >= limits.retainDays });
    }
  } finally {
    if (sharedConn) {
      try {
        await sharedConn.release();
      } catch {}
    }
  }
  const known = new Set(batches.map((b) => b.stagingTable).filter(Boolean));
  return { entries, orphans: tables.filter((t) => STAGING_NAME.test(t) && !known.has(t)), retainDays: limits.retainDays };
}

/** Drops the staging table (the ledger row stays, so a promoted import can still be undone). */
export async function dropStaging(db: StageDb, batchId: string): Promise<void> {
  const b = await getBatch(db, batchId);
  if (!b) throw new StagingError("That import was not found.", "NOT_FOUND", 404);
  if (!b.stagingTable) return;
  if (!STAGING_NAME.test(b.stagingTable)) throw new StagingError("That is not a staging table, so it will not be dropped.", "BAD_NAME");
  if (!(await db.tables()).includes(b.stagingTable)) {
    const c0 = await db.open();
    try {
      await updateBatch(db, c0, batchId, { status: "dropped", droppedAt: b.droppedAt ?? nowIso() });
    } finally {
      await c0.release();
    }
    return;
  }
  const c = await db.open();
  try {
    await c.query(`DROP TABLE ${refOf(db, b.stagingTable)}`);
    await updateBatch(db, c, batchId, { droppedAt: nowIso(), ...(b.status === "promoted" || b.status === "undone" ? {} : { status: "dropped" }) });
  } finally {
    await c.release();
  }
}

/** Forgets the ledger row of an import that is finished with (undone or never promoted) and has no staging table any more. */
export async function forgetBatch(db: StageDb, batchId: string): Promise<void> {
  const b = await getBatch(db, batchId);
  if (!b) return;
  if (b.status === "promoted") throw new StagingError("A promoted import's record is kept so it can be undone.", "KEEP", 409);
  const c = await db.open();
  try {
    const p = new Params(db.engine);
    await c.query(`DELETE FROM ${refOf(db, CHANGES)} WHERE ${col(db, "batch_id")} = ${p.add(batchId, "text")}`, p.values);
    const p2 = new Params(db.engine);
    await c.query(`DELETE FROM ${refOf(db, LEDGER)} WHERE ${col(db, "batch_id")} = ${p2.add(batchId, "text")}`, p2.values);
  } finally {
    await c.release();
  }
}
