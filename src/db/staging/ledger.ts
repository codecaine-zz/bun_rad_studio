/**
 * The batch ledger: one row per import in `_import_batches`, and (for undo) what each promoted import changed in
 * `_import_batch_changes`. Both live in the same database/schema as the target, so they travel with the data.
 */
import { q, refOf, runOnce, type StageConn, type StageDb } from "./db";
import { CHANGES, LEDGER, ledgerDdl, Params } from "./dialect";
import type { BatchStatus, PromoteMode } from "./types";

export interface BatchRecord {
  batchId: string;
  createdAt: string;
  sourceName: string | null;
  targetTable: string | null;
  newTable: boolean;
  stagingTable: string | null;
  mode: PromoteMode | null;
  status: BatchStatus;
  rowsTotal: number;
  rowsValid: number;
  rowsInvalid: number;
  rowsDuplicate: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  promotedAt: string | null;
  undoneAt: string | null;
  droppedAt: string | null;
  undoable: boolean;
  undoNote: string | null;
  config: any;
  note: string | null;
}

export const nowIso = () => new Date().toISOString();

const ensured = new WeakSet<object>();
const ensuring = new Map<string, Promise<void>>();

/** Creates the ledger tables when they are missing. Safe to call again. */
export async function ensureLedger(db: StageDb): Promise<void> {
  const key = `${db.engine}:${db.label}:${db.schema ?? ""}`;
  if (ensured.has(db)) return;
  let p = ensuring.get(key);
  if (!p) {
    p = (async () => {
      const c = await db.open();
      try {
        for (const sql of ledgerDdl(db)) await c.query(sql);
      } finally {
        await c.release();
      }
    })().finally(() => ensuring.delete(key));
    ensuring.set(key, p);
  }
  await p;
  ensured.add(db);
}

const COLS = ["batch_id", "created_at", "source_name", "target_table", "new_table", "staging_table", "mode", "status", "rows_total", "rows_valid", "rows_invalid", "rows_duplicate", "rows_inserted", "rows_updated", "rows_skipped", "promoted_at", "undone_at", "dropped_at", "undoable", "undo_note", "config_json", "note"];

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

function toRecord(r: Record<string, any>): BatchRecord {
  let config: any = null;
  try {
    config = r.config_json ? JSON.parse(String(r.config_json)) : null;
  } catch {
    config = null;
  }
  return {
    batchId: String(r.batch_id),
    createdAt: String(r.created_at),
    sourceName: s(r.source_name),
    targetTable: s(r.target_table),
    newTable: n(r.new_table) === 1,
    stagingTable: s(r.staging_table),
    mode: s(r.mode) as PromoteMode | null,
    status: String(r.status) as BatchStatus,
    rowsTotal: n(r.rows_total),
    rowsValid: n(r.rows_valid),
    rowsInvalid: n(r.rows_invalid),
    rowsDuplicate: n(r.rows_duplicate),
    rowsInserted: n(r.rows_inserted),
    rowsUpdated: n(r.rows_updated),
    rowsSkipped: n(r.rows_skipped),
    promotedAt: s(r.promoted_at),
    undoneAt: s(r.undone_at),
    droppedAt: s(r.dropped_at),
    undoable: n(r.undoable) === 1,
    undoNote: s(r.undo_note),
    config,
    note: s(r.note),
  };
}

export async function insertBatch(db: StageDb, c: StageConn, rec: BatchRecord): Promise<void> {
  const p = new Params(db.engine);
  const vals = [rec.batchId, rec.createdAt, rec.sourceName, rec.targetTable, rec.newTable ? 1 : 0, rec.stagingTable, rec.mode, rec.status, rec.rowsTotal, rec.rowsValid, rec.rowsInvalid, rec.rowsDuplicate, rec.rowsInserted, rec.rowsUpdated, rec.rowsSkipped, rec.promotedAt, rec.undoneAt, rec.droppedAt, rec.undoable ? 1 : 0, rec.undoNote, rec.config === null || rec.config === undefined ? null : JSON.stringify(rec.config), rec.note];
  const marks = vals.map((v, i) => p.add(v, typeof v === "number" ? "bigint" : "text"));
  void marks;
  await c.query(`INSERT INTO ${refOf(db, LEDGER)} (${COLS.map((x) => q(db.engine, x)).join(", ")}) VALUES (${marks.join(", ")})`, p.values);
}

const FIELD: Record<string, string> = {
  status: "status",
  mode: "mode",
  rowsTotal: "rows_total",
  rowsValid: "rows_valid",
  rowsInvalid: "rows_invalid",
  rowsDuplicate: "rows_duplicate",
  rowsInserted: "rows_inserted",
  rowsUpdated: "rows_updated",
  rowsSkipped: "rows_skipped",
  promotedAt: "promoted_at",
  undoneAt: "undone_at",
  droppedAt: "dropped_at",
  undoable: "undoable",
  undoNote: "undo_note",
  config: "config_json",
  stagingTable: "staging_table",
  note: "note",
};

export async function updateBatch(db: StageDb, c: StageConn, batchId: string, patch: Partial<Omit<BatchRecord, "batchId">>): Promise<void> {
  const p = new Params(db.engine);
  const sets: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = FIELD[k];
    if (!col) continue;
    const val = k === "config" ? (v === null ? null : JSON.stringify(v)) : k === "undoable" ? (v ? 1 : 0) : v;
    sets.push(`${q(db.engine, col)} = ${p.add(val, typeof val === "number" ? "bigint" : "text")}`);
  }
  if (!sets.length) return;
  const idp = p.add(batchId, "text");
  await c.query(`UPDATE ${refOf(db, LEDGER)} SET ${sets.join(", ")} WHERE ${q(db.engine, "batch_id")} = ${idp}`, p.values);
}

export async function getBatch(db: StageDb, batchId: string): Promise<BatchRecord | null> {
  await ensureLedger(db);
  const p = new Params(db.engine);
  const r = await runOnce(db, `SELECT * FROM ${refOf(db, LEDGER)} WHERE ${q(db.engine, "batch_id")} = ${p.add(batchId, "text")}`, p.values);
  return r.rows[0] ? toRecord(r.rows[0]) : null;
}

export async function listBatches(db: StageDb): Promise<BatchRecord[]> {
  await ensureLedger(db);
  const r = await runOnce(db, `SELECT * FROM ${refOf(db, LEDGER)} ORDER BY ${q(db.engine, "created_at")} DESC, ${q(db.engine, "batch_id")} DESC`);
  return r.rows.map(toRecord);
}

export const CHANGE_COLS = { id: "change_id", batch: "batch_id", action: "action", ref: "ref_row_id", pk: "pk_json", before: "before_json", after: "after_hash" } as const;

export { CHANGES };
