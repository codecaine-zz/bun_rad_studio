/**
 * Step 5: promote the checked rows into the target table, with a dry run first and a way back.
 *
 * Every promotion is one transaction. Rows the batch inserts are recorded by primary key and rows it updates keep
 * their previous values in `_import_batch_changes`, together with a fingerprint of how the row looked right after the import. "Undo" restores
 * exactly those rows, and only when each one still looks the way the import left it.
 *
 * Upsert is done as an UPDATE of the rows that exist and an INSERT of the rows that do not (instead of ON CONFLICT /
 * ON DUPLICATE KEY / REPLACE). That keeps exact counts for the dry run and the ledger, never deletes and re-creates a row (so
 * cascading children are safe), and works the same way in every engine.
 */
import { createHash } from "crypto";
import { breathe, q, refOf, type StageConn, type StageDb } from "./db";
import { CHANGES, Params, bindValue, differentExpr, valueExpr } from "./dialect";
import { classifyMatches, writeRowErrors, summarize, type ValidationSummary } from "./validate";
import { ensureLedger, getBatch, nowIso, updateBatch, type BatchRecord } from "./ledger";
import { newTableTarget, sanitizeNewTable } from "./newtable";
import { limits, StagingError } from "./limits";
import type { ImportPlan, PromoteMode, RowError, TargetColumn, TargetTable } from "./types";

export const MODE_LABELS: Record<PromoteMode, string> = {
  "insert-new": "Insert new rows only (rows that already exist are left alone)",
  "insert-all": "Insert every row (stop if any row clashes with an existing one)",
  upsert: "Upsert: add new rows and update rows that already exist",
  "update-only": "Update existing rows only (nothing is added)",
  append: "Append all valid rows (skip repeats)",
};

export interface PromoteOptions {
  db: StageDb;
  batch: BatchRecord;
  target: TargetTable;
  dataColumns: string[];
  plan: ImportPlan;
  mode: PromoteMode;
  /** Columns to overwrite on existing rows (upsert / update only). Defaults to every mapped column that is not part of the key. */
  updateColumns?: string[];
  signal?: AbortSignal;
  onProgress?: (phase: string) => void;
}

export interface PromoteCounts {
  insert: number;
  update: number;
  /** Valid rows that change nothing (already identical, or not selected by the mode). */
  skipped: number;
  unchanged: number;
  invalid: number;
  duplicate: number;
  skippedByPerson: number;
}

export interface PromotePreview {
  mode: PromoteMode;
  counts: PromoteCounts;
  sql: string[];
  sample: { updates: { row: number; key: string; changes: { column: string; before: string | null; after: string | null }[] }[]; inserts: { row: number; values: Record<string, string | null> }[] };
  undo: { available: boolean; reason?: string };
  warnings: string[];
  /** Result of really running it inside a transaction that was then rolled back. */
  rehearsal?: { ok: boolean; error?: string; skipped?: string };
}

const sha = (s: string) => createHash("sha1").update(s).digest("hex");
const shortText = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).length > 80 ? String(v).slice(0, 77) + "…" : String(v));

/** Reading rows back as text, for the fingerprints and before-images that make undo possible. */
class Snap {
  readonly e: StageDb["engine"];
  readonly tref: string;
  readonly byName: Map<string, TargetColumn>;
  constructor(
    readonly db: StageDb,
    readonly target: TargetTable,
    readonly snapCols: TargetColumn[],
    readonly pk: string[],
  ) {
    this.e = db.engine;
    this.tref = refOf(db, target.name);
    this.byName = new Map(target.columns.map((c) => [c.name, c]));
  }
  col = (n: string) => q(this.e, n);
  snapSelect(alias = "t"): string {
    return this.snapCols.map((c) => `CAST(${alias}.${this.col(c.name)} AS ${this.e === "mysql" ? "CHAR" : "TEXT"}) AS ${this.col(c.name)}`).join(", ");
  }
}

class Setup extends Snap {
  readonly stg: string;
  readonly sref: string;
  readonly mapped: string[];
  readonly key: string[];
  readonly keyMapped: boolean;
  readonly insertCols: string[];
  readonly updateCols: string[];
  readonly valid: string;
  constructor(readonly o: PromoteOptions) {
    super(o.db, o.target, o.target.columns.filter((c) => c.cls !== "binary"), o.target.primaryKey);
    this.stg = o.batch.stagingTable ?? "";
    this.sref = refOf(o.db, this.stg);
    this.mapped = o.dataColumns.filter((n) => this.byName.has(n));
    this.key = o.plan?.keyColumns?.filter((k) => this.mapped.includes(k)) ?? [];
    this.keyMapped = (o.plan?.keyColumns?.length ?? 0) > 0 && o.plan.keyColumns.every((k) => this.mapped.includes(k));
    this.insertCols = this.mapped.filter((c) => !this.byName.get(c)!.generated);
    const defaults = this.mapped.filter((c) => !this.key.includes(c) && !this.byName.get(c)!.generated && !o.target.primaryKey.includes(c));
    this.updateCols = (o.updateColumns ?? defaults).filter((c) => this.mapped.includes(c) && !this.key.includes(c) && !this.byName.get(c)!.generated);
    this.valid = `s.${q(this.e, "_stg_status")} = 'valid'`;
  }
  cast = (n: string) => valueExpr(this.e, this.byName.get(n)!, `s.${this.col(n)}`);
  keyEq = () => this.key.map((c) => `t.${this.col(c)} = ${this.cast(c)}`).join(" AND ");
  diff = () => this.updateCols.map((c) => differentExpr(this.e, `t.${this.col(c)}`, this.cast(c))).join(" OR ");
  match = (v: string) => `s.${q(this.e, "_stg_match")} = '${v}'`;
  insertPred(): string | null {
    switch (this.o.mode) {
      case "insert-new":
      case "upsert":
        return `${this.valid} AND ${this.match("new")}`;
      case "insert-all":
        return this.valid;
      case "append":
        return `${this.valid} AND (s.${this.col("_stg_match")} IS NULL OR ${this.match("new")})`;
      default:
        return null;
    }
  }
  updatePred(): string | null {
    return (this.o.mode === "upsert" || this.o.mode === "update-only") && this.updateCols.length ? `${this.valid} AND ${this.match("changed")} AND EXISTS (SELECT 1 FROM ${this.tref} AS t WHERE ${this.keyEq()} AND (${this.diff()}))` : null;
  }
  insertSql(pred: string, returning = false): string {
    const ret = returning && this.e !== "mysql" ? ` RETURNING ${this.pk.map((c) => this.col(c)).join(", ")}` : "";
    const override = this.e === "postgres" && this.insertCols.some((c) => this.byName.get(c)!.auto) ? " OVERRIDING SYSTEM VALUE" : "";
    return `INSERT INTO ${this.tref} (${this.insertCols.map((c) => this.col(c)).join(", ")})${override} SELECT ${this.insertCols.map((c) => this.cast(c)).join(", ")} FROM ${this.sref} AS s WHERE ${pred} ORDER BY s.${this.col("_stg_row_id")}${ret}`;
  }
  updateSql(pred: string): string {
    const set = this.updateCols.map((c) => `${this.e === "mysql" ? "t." : ""}${this.col(c)} = ${this.cast(c)}`).join(", ");
    if (this.e === "mysql") return `UPDATE ${this.tref} AS t JOIN ${this.sref} AS s ON ${this.keyEq()} SET ${set} WHERE ${pred}`;
    return `UPDATE ${this.tref} AS t SET ${set} FROM ${this.sref} AS s WHERE ${this.keyEq()} AND ${pred}`;
  }
}

function checkMode(s: Setup): void {
  const { mode } = s.o;
  const needsKey = mode === "insert-new" || mode === "upsert" || mode === "update-only";
  if (needsKey && !s.keyMapped) throw new StagingError("This choice matches rows by a key column, but no key column is chosen (or it is not mapped). Pick the key in the mapping step, or choose “Insert every row” or “Append”.", "NEEDS_KEY");
  if ((mode === "upsert" || mode === "update-only") && !s.updateCols.length) throw new StagingError("There are no columns to update. Choose at least one column that is not part of the key.", "NOTHING_TO_UPDATE");
  if (!s.insertCols.length && mode !== "update-only") throw new StagingError("No columns are mapped, so there is nothing to insert.", "NOTHING_MAPPED");
}

async function count(conn: StageConn, s: Setup, pred: string): Promise<number> {
  return Number((await conn.query(`SELECT COUNT(*) AS c FROM ${s.sref} AS s WHERE ${pred}`)).rows[0]?.c ?? 0);
}

async function counts(conn: StageConn, s: Setup): Promise<PromoteCounts> {
  const ip = s.insertPred();
  const up = s.updatePred();
  const insert = ip ? await count(conn, s, ip) : 0;
  const update = up ? await count(conn, s, up) : 0;
  const byStatus = new Map<string, number>();
  for (const r of (await conn.query(`SELECT ${s.col("_stg_status")} AS st, COUNT(*) AS c FROM ${s.sref} GROUP BY ${s.col("_stg_status")}`)).rows) byStatus.set(String(r.st), Number(r.c));
  const valid = byStatus.get("valid") ?? 0;
  const same = await count(conn, s, `${s.valid} AND ${s.match("same")}`);
  return { insert, update, skipped: Math.max(0, valid - insert - update), unchanged: same, invalid: byStatus.get("invalid") ?? 0, duplicate: byStatus.get("duplicate") ?? 0, skippedByPerson: byStatus.get("skipped") ?? 0 };
}

function undoAvailability(s: Setup, inserts: number): { available: boolean; reason?: string } {
  if (!s.pk.length) return { available: false, reason: "This table has no primary key, so the rows this import adds or changes cannot be identified later. The staging table is kept as a record." };
  const needsReturning = s.o.mode !== "update-only" && !s.keyMapped && !s.o.plan.createTable;
  if (needsReturning && s.e === "mysql") return { available: false, reason: "MySQL cannot tell which rows an import without a key column added, so this import cannot be undone." };
  if (needsReturning && inserts > 200_000) return { available: false, reason: "Too many rows to undo without a key column (more than 200,000)." };
  return { available: true };
}

/** What a promotion would do, without changing the target. Re-checks which rows already exist first (this writes to the staging table only). */
export async function previewPromote(o: PromoteOptions): Promise<PromotePreview> {
  const s = new Setup(o);
  const { db } = o;
  checkMode(s);
  if (!o.batch.stagingTable) throw new StagingError("This import's staging table has been dropped.", "NO_STAGING", 409);
  const c = await db.open();
  const warnings: string[] = [];
  try {
    if (s.keyMapped && !o.target.virtual) {
      await c.begin();
      await classifyMatches(db, c, s.stg, o.target, s.key, s.mapped);
      await c.commit();
    }
    const cnt = await counts(c, s);
    const ip = s.insertPred();
    const up = s.updatePred();
    const sql: string[] = [];
    if (o.plan.createTable) sql.push(newTableTarget(db, o.target.name, sanitizeNewTable(o.plan.newTable), o.plan.keyColumns).ddl);
    sql.push("-- The rows chosen above are marked first, then:");
    if (up) sql.push(s.updateSql(s.match("updating")));
    if (ip) sql.push(s.insertSql(s.match("inserting")));
    const sample: PromotePreview["sample"] = { updates: [], inserts: [] };
    if (up && s.updateCols.length) {
      const cols = [...new Set([...s.key, ...s.updateCols])];
      const rows = (await c.query(`SELECT s.${s.col("_stg_row_number")} AS _rn, ${cols.map((n) => `CAST(t.${s.col(n)} AS ${s.e === "mysql" ? "CHAR" : "TEXT"}) AS ${s.col("t_" + n)}`).join(", ")}, ${s.updateCols.map((n) => `s.${s.col(n)} AS ${s.col("s_" + n)}, CASE WHEN ${differentExpr(s.e, `t.${s.col(n)}`, s.cast(n))} THEN 1 ELSE 0 END AS ${s.col("d_" + n)}`).join(", ")}${s.key.map((n) => `, s.${s.col(n)} AS ${s.col("k_" + n)}`).join("")} FROM ${s.sref} AS s JOIN ${s.tref} AS t ON ${s.keyEq()} WHERE ${up} ORDER BY s.${s.col("_stg_row_id")} LIMIT 10`)).rows;
      for (const r of rows) {
        sample.updates.push({
          row: Number(r._rn),
          key: s.key.map((n) => `${n} = ${shortText(r["k_" + n])}`).join(", "),
          changes: s.updateCols.filter((n) => Number(r["d_" + n]) === 1).map((n) => ({ column: n, before: shortText(r["t_" + n]), after: shortText(r["s_" + n]) })),
        });
      }
    }
    if (ip) {
      const rows = (await c.query(`SELECT s.${s.col("_stg_row_number")} AS _rn, ${s.insertCols.slice(0, 12).map((n) => `s.${s.col(n)} AS ${s.col(n)}`).join(", ")} FROM ${s.sref} AS s WHERE ${ip} ORDER BY s.${s.col("_stg_row_id")} LIMIT 5`)).rows;
      for (const r of rows) sample.inserts.push({ row: Number(r._rn), values: Object.fromEntries(s.insertCols.slice(0, 12).map((n) => [n, shortText(r[n])])) });
    }
    if (o.mode === "insert-all" && cnt.unchanged > 0 && s.keyMapped) warnings.push(`${cnt.unchanged} row${cnt.unchanged === 1 ? "" : "s"} already exist${cnt.unchanged === 1 ? "s" : ""} in the table, so inserting everything will stop with an error. Choose “Insert new rows only” or “Upsert” instead.`);
    if (o.mode === "insert-all" && s.keyMapped) {
      const clash = await count(c, s, `${s.valid} AND (${s.match("same")} OR ${s.match("changed")})`);
      if (clash > 0 && cnt.unchanged === 0) warnings.push(`${clash} row${clash === 1 ? "" : "s"} already exist in the table, so inserting everything will stop with an error.`);
    }
    if (cnt.invalid) warnings.push(`${cnt.invalid} row${cnt.invalid === 1 ? "" : "s"} with problems will be left out. They stay in the staging table.`);
    if (cnt.duplicate) warnings.push(`${cnt.duplicate} repeated row${cnt.duplicate === 1 ? "" : "s"} will be left out.`);
    return { mode: o.mode, counts: cnt, sql, sample, undo: undoAvailability(s, cnt.insert), warnings };
  } finally {
    await c.release();
  }
}


// ---- trying the table's own rules ------------------------------------------------------------------------------------

/**
 * Some rules only the database can judge (CHECK constraints, triggers, odd column types). This tries the rows against
 * the table in a transaction that is always rolled back; when something is refused it narrows down which rows, by halving
 * the range, and marks exactly those rows as problems. The target is unchanged afterwards.
 */
export async function testDatabaseRules(o: { db: StageDb; batch: BatchRecord; target: TargetTable; dataColumns: string[]; plan: ImportPlan }, summary: ValidationSummary, opts: { maxCandidates?: number; maxRejects?: number } = {}): Promise<ValidationSummary> {
  const { db } = o;
  const s = new Setup({ ...o, mode: o.plan.keyColumns.length ? "upsert" : "append" });
  const maxCandidates = opts.maxCandidates ?? 200_000;
  const maxRejects = opts.maxRejects ?? 100;
  const ip = s.insertPred();
  // MySQL does not allow the UPDATE's own table inside a sub-select, so rows already known to differ are used as they are
  const up = s.updateCols.length && s.keyMapped && (s.o.mode === "upsert" || s.o.mode === "update-only") ? `${s.valid} AND ${s.match("changed")}` : null;
  if (!s.insertCols.length || (!ip && !up) || o.target.virtual) return summary;
  const c = await db.open();
  const notes = [...summary.notes];
  try {
    await c.begin();
    const total = await count(c, s, s.valid);
    if (total > maxCandidates) {
      await c.rollback();
      return { ...summary, notes: [...notes, `The table's own rules (checks, triggers) were not tested in advance because there are more than ${maxCandidates.toLocaleString("en-US")} rows. If the database refuses a row, promoting stops and nothing is changed.`] };
    }
    const range = (await c.query(`SELECT MIN(s.${s.col("_stg_row_id")}) AS lo, MAX(s.${s.col("_stg_row_id")}) AS hi FROM ${s.sref} AS s WHERE ${s.valid}`)).rows[0];
    if (!range || range.lo === null || range.lo === undefined) {
      await c.rollback();
      return summary;
    }
    const rejects = new Map<number, RowError[]>();
    let unexplained = false;
    const tryRange = async (lo: number, hi: number): Promise<string | null> => {
      await c.query("SAVEPOINT stg_try");
      let err: string | null = null;
      try {
        const between = `s.${s.col("_stg_row_id")} BETWEEN ${lo} AND ${hi}`;
        if (up) await c.query(s.updateSql(`${up} AND ${between}`));
        if (ip) await c.query(s.insertSql(`${ip} AND ${between}`));
      } catch (e) {
        err = String((e as Error).message ?? e);
      }
      await c.query("ROLLBACK TO SAVEPOINT stg_try");
      await c.query("RELEASE SAVEPOINT stg_try");
      return err;
    };
    const narrow = async (lo: number, hi: number, known: string): Promise<void> => {
      if (rejects.size >= maxRejects) return;
      if (lo === hi) {
        const m = known.replace(/^SQLite query[^:]*: ?/i, "").split("\n")[0]!.slice(0, 300);
        rejects.set(lo, [{ c: null, code: "db_rule", m: `The table's own rules reject this row: ${m}`, f: "Correct the values, or skip the row." }]);
        return;
      }
      const mid = Math.floor((lo + hi) / 2);
      const left = await tryRange(lo, mid);
      const right = await tryRange(mid + 1, hi);
      if (!left && !right) {
        unexplained = true;
        return;
      }
      if (left) await narrow(lo, mid, left);
      if (right) await narrow(mid + 1, hi, right);
    };
    const first = await tryRange(Number(range.lo), Number(range.hi));
    if (first) await narrow(Number(range.lo), Number(range.hi), first);
    if (rejects.size) await writeRowErrors(db, c, s.stg, rejects, "invalid");
    if (unexplained) notes.push("The database refused some rows only in combination (for example two rows that clash with each other). Promote to see the exact message.");
    if (rejects.size >= maxRejects) notes.push(`The table's own rules refuse many rows. The first ${maxRejects} are listed; fix those and check again.`);
    const fresh = await summarize(db, c, s.stg);
    await updateBatch(db, c, o.batch.batchId, { rowsValid: fresh.valid, rowsInvalid: fresh.invalid, rowsDuplicate: fresh.duplicate });
    await c.commit();
    const byColumn = summary.byColumn.map((c) => ({ ...c }));
    if (rejects.size) {
      const whole = byColumn.find((c) => c.column === "(whole row)");
      if (whole) whole.count += rejects.size;
      else byColumn.push({ column: "(whole row)", count: rejects.size });
    }
    return { ...summary, ...fresh, byColumn, notes };
  } catch (err) {
    await c.rollback().catch(() => {});
    throw err;
  } finally {
    await c.release();
  }
}

// ---- running it -------------------------------------------------------------------------------------------------------

const rowJson = (row: Record<string, any>, cols: TargetColumn[]) => JSON.stringify(cols.map((c) => row[c.name] ?? null));
const pkOf = (row: Record<string, any>, pk: string[]) => JSON.stringify(pk.map((c) => (row[c] === null || row[c] === undefined ? null : String(row[c]))));

async function insertChanges(db: StageDb, c: StageConn, batchId: string, rows: { action: "insert" | "update"; ref: number | null; pk: string; before: string | null; after: string | null }[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const p = new Params(db.engine);
    const values = part.map((r) => `(${p.add(batchId, "text")}, ${p.add(r.action, "text")}, ${p.add(r.ref, "bigint")}, ${p.add(r.pk, "text")}, ${p.add(r.before, "text")}, ${p.add(r.after, "text")})`).join(", ");
    await c.query(`INSERT INTO ${refOf(db, CHANGES)} (${["batch_id", "action", "ref_row_id", "pk_json", "before_json", "after_hash"].map((x) => q(db.engine, x)).join(", ")}) VALUES ${values}`, p.values);
  }
}

/** Reads the current text snapshot of target rows chosen by `select` (which must return `_stg_rid` for paging) and records them. */
async function recordSnapshots(s: Setup, c: StageConn, batchId: string, action: "insert" | "update", from: string, where: string, withBefore: boolean, after: boolean): Promise<number> {
  let last = 0;
  let total = 0;
  for (;;) {
    const p = new Params(s.e);
    const rows = (await c.query(`SELECT s.${s.col("_stg_row_id")} AS _stg_rid, ${s.snapSelect()} FROM ${from} WHERE ${where} AND s.${s.col("_stg_row_id")} > ${p.add(last, "bigint")} ORDER BY s.${s.col("_stg_row_id")} LIMIT 500`, p.values)).rows;
    if (!rows.length) break;
    last = Number(rows[rows.length - 1]!._stg_rid);
    total += rows.length;
    await breathe(s.db, true);
    if (after) {
      const part = rows.map((r) => ({ ref: Number(r._stg_rid), hash: sha(rowJson(r, s.snapCols)) }));
      const q2 = new Params(s.e);
      const cases = part.map((r) => `WHEN ${q2.add(r.ref, "bigint")} THEN ${q2.add(r.hash, "text")}`).join(" ");
      const bid = q2.add(batchId, "text");
      const ids = part.map((r) => q2.add(r.ref, "bigint")).join(", ");
      await c.query(`UPDATE ${refOf(s.o.db, CHANGES)} SET ${q(s.e, "after_hash")} = CASE ${q(s.e, "ref_row_id")} ${cases} END WHERE ${q(s.e, "batch_id")} = ${bid} AND ${q(s.e, "action")} = 'update' AND ${q(s.e, "ref_row_id")} IN (${ids})`, q2.values);
    } else {
      await insertChanges(
        s.o.db,
        c,
        batchId,
        rows.map((r) => ({ action, ref: Number(r._stg_rid), pk: pkOf(r, s.pk), before: withBefore ? JSON.stringify(Object.fromEntries(s.snapCols.map((col) => [col.name, r[col.name] ?? null]))) : null, after: withBefore ? null : sha(rowJson(r, s.snapCols)) })),
      );
    }
  }
  return total;
}

async function snapshotsByPk(s: Snap, c: StageConn, pks: (string | null)[][], lock = false): Promise<Map<string, Record<string, any>>> {
  const out = new Map<string, Record<string, any>>();
  const pkCols = s.pk.map((n) => s.byName.get(n)!);
  for (let i = 0; i < pks.length; i += 100) {
    const part = pks.slice(i, i + 100);
    const p = new Params(s.e);
    const where = part.map((vals) => "(" + pkCols.map((col, k) => `t.${s.col(col.name)} = ${bindValue(p, col, vals[k])}`).join(" AND ") + ")").join(" OR ");
    const rows = (await c.query(`SELECT ${s.snapSelect()} FROM ${s.tref} AS t WHERE ${where}${lock && s.e !== "sqlite" ? " FOR UPDATE" : ""}`, p.values)).rows;
    for (const r of rows) out.set(pkOf(r, s.pk), r);
  }
  return out;
}

export interface PromoteResult {
  batch: BatchRecord;
  counts: { inserted: number; updated: number; skipped: number };
  undo: { available: boolean; reason?: string };
  rehearsal: boolean;
}

/** Runs the promotion in one transaction. With `rehearse` it does everything and then rolls back, so nothing is kept. */
export async function executePromote(o: PromoteOptions & { rehearse?: boolean }): Promise<PromoteResult> {
  const s = new Setup(o);
  const { db, batch } = o;
  const rehearse = !!o.rehearse;
  checkMode(s);
  await ensureLedger(db);
  const fresh = await getBatch(db, batch.batchId);
  if (!fresh || !fresh.stagingTable) throw new StagingError("This import's staging table has been dropped.", "NO_STAGING", 409);
  if (fresh.status === "promoted" && !rehearse) throw new StagingError("This import was already promoted. Load the data again to import it a second time.", "ALREADY_PROMOTED", 409);
  const c = await db.open();
  let tableCreated = false;
  try {
    await c.begin();
    if (o.plan.createTable && !o.target.virtual) throw new StagingError("Internal: the new table was not described.", "INTERNAL");
    if (o.plan.createTable) {
      if (rehearse && db.engine === "mysql") {
        await c.rollback();
        throw new StagingError("MySQL cannot undo creating a table, so a rehearsal is not possible for a new table.", "NO_REHEARSAL", 409);
      }
      await c.query(newTableTarget(db, o.target.name, sanitizeNewTable(o.plan.newTable), o.plan.keyColumns).ddl);
      tableCreated = true;
    }
    if (s.keyMapped && !o.target.virtual) await classifyMatches(db, c, s.stg, o.target, s.key, s.mapped);
    const undoable = undoAvailability(s, 0);
    let updated = 0;
    let inserted = 0;
    const up = s.updatePred();
    const ip = s.insertPred();
    const stgUpdate = (set: string, where: string) => c.query(`UPDATE ${s.sref} AS s SET ${set} WHERE ${where}`);
    const m = s.col("_stg_match");

    if (up) {
      o.onProgress?.("Updating existing rows");
      updated = (await stgUpdate(`${m} = 'updating'`, up)).affected;
      if (updated) {
        const from = `${s.sref} AS s JOIN ${s.tref} AS t ON ${s.keyEq()}`;
        const marked = `${s.match("updating")}`;
        if (undoable.available) await recordSnapshots(s, c, batch.batchId, "update", from, marked, true, false);
        const n = (await c.query(s.updateSql(marked))).affected;
        if (db.engine !== "mysql" && n !== updated) throw new StagingError(`The database changed ${n} rows but ${updated} were expected. Nothing was kept.`, "COUNT_MISMATCH", 409);
        if (undoable.available) await recordSnapshots(s, c, batch.batchId, "update", from, marked, true, true);
        await stgUpdate(`${s.col("_stg_status")} = 'promoted', ${m} = 'changed'`, marked);
      }
    }

    let keyedRecording = false;
    if (ip) {
      o.onProgress?.("Adding new rows");
      inserted = (await stgUpdate(`${m} = 'inserting'`, ip)).affected;
      if (inserted) {
        const marked = s.match("inserting");
        const keyed = s.keyMapped && !o.target.virtual;
        const useReturning = undoable.available && !keyed && !(o.plan.createTable && s.pk.length === 1 && s.pk[0] === "id" && o.plan.newTable?.autoId) && db.engine !== "mysql" && inserted <= 200_000;
        const res = await c.query(s.insertSql(marked, useReturning));
        const got = useReturning ? res.rows.length : res.affected;
        if (db.engine !== "mysql" && got !== inserted) throw new StagingError(`The database added ${got} rows but ${inserted} were expected. Nothing was kept.`, "COUNT_MISMATCH", 409);
        if (undoable.available) {
          if (useReturning) {
            const pks = res.rows.map((r) => s.pk.map((n) => (r[n] === null || r[n] === undefined ? null : String(r[n]))));
            const snaps = await snapshotsByPk(s, c, pks);
            await insertChanges(db, c, batch.batchId, [...snaps.entries()].map(([pk, r]) => ({ action: "insert" as const, ref: null, pk, before: null, after: sha(rowJson(r, s.snapCols)) })));
          } else if (keyed || (o.plan.createTable && s.keyMapped)) {
            await recordSnapshots(s, c, batch.batchId, "insert", `${s.sref} AS s JOIN ${s.tref} AS t ON ${s.keyEq()}`, marked, false, false);
            keyedRecording = true;
          } else if (o.plan.createTable) {
            await recordWholeTable(s, c, batch.batchId);
          }
        }
        await stgUpdate(`${s.col("_stg_status")} = 'promoted', ${m} = 'new'`, marked);
      }
    }
    void keyedRecording;
    const skipped = (await stgUpdate(`${s.col("_stg_status")} = 'skipped'`, s.valid)).affected;
    if (db.engine === "postgres" && !rehearse && inserted) await bumpSequences(s, c);

    const finished = nowIso();
    await updateBatch(db, c, batch.batchId, {
      status: "promoted",
      mode: o.mode,
      rowsInserted: inserted,
      rowsUpdated: updated,
      rowsSkipped: fresh.rowsSkipped + skipped,
      promotedAt: finished,
      undoable: undoable.available && inserted + updated > 0,
      undoNote: undoable.available ? null : undoable.reason ?? null,
      config: { ...(fresh.config ?? {}), promote: { mode: o.mode, updateColumns: s.updateCols, keyColumns: s.key, snapshotColumns: s.snapCols.map((x) => x.name), primaryKey: s.pk, createdTable: tableCreated } },
    });
    if (rehearse) {
      await c.rollback();
      return { batch: fresh, counts: { inserted, updated, skipped }, undo: undoable, rehearsal: true };
    }
    await c.commit();
    const after = (await getBatch(db, batch.batchId))!;
    return { batch: after, counts: { inserted, updated, skipped }, undo: undoable, rehearsal: false };
  } catch (err) {
    await c.rollback().catch(() => {});
    if (err instanceof StagingError) throw err;
    throw explain(err);
  } finally {
    await c.release();
  }
}

async function recordWholeTable(s: Setup, c: StageConn, batchId: string): Promise<void> {
  const pk = s.pk[0]!;
  const col = s.byName.get(pk)!;
  let last: string | null = null;
  for (;;) {
    const p = new Params(s.e);
    const cond: string = last === null ? "1 = 1" : `t.${s.col(pk)} > ${bindValue(p, col, last)}`;
    const rows: Record<string, any>[] = (await c.query(`SELECT ${s.snapSelect()} FROM ${s.tref} AS t WHERE ${cond} ORDER BY t.${s.col(pk)} LIMIT 500`, p.values)).rows;
    if (!rows.length) break;
    last = String(rows[rows.length - 1]![pk]);
    await insertChanges(s.o.db, c, batchId, rows.map((r) => ({ action: "insert" as const, ref: null, pk: pkOf(r, s.pk), before: null, after: sha(rowJson(r, s.snapCols)) })));
  }
}

/** After explicit ids were inserted, keeps a PostgreSQL serial/identity sequence ahead of them so later inserts do not collide. */
async function bumpSequences(s: Setup, c: StageConn): Promise<void> {
  for (const pk of s.pk) {
    const col = s.byName.get(pk);
    if (!col || !col.auto || col.cls !== "integer" || !s.mapped.includes(pk)) continue;
    const seq = (await c.query("SELECT pg_get_serial_sequence($1, $2) AS s", [`${q("postgres", s.o.db.schema || "public")}.${q("postgres", s.o.target.name)}`, pk])).rows[0]?.s;
    if (!seq || !/^[\w."$ -]+$/.test(String(seq))) continue;
    const max = (await c.query(`SELECT MAX(${s.col(pk)}) AS m FROM ${s.tref}`)).rows[0]?.m;
    if (max === null || max === undefined) continue;
    const last = (await c.query(`SELECT last_value AS l FROM ${seq}`)).rows[0]?.l;
    if (Number(max) > Number(last)) await c.query("SELECT setval($1, $2)", [String(seq), Number(max)]);
  }
}

/** A database refusal, said in plain words. */
export function explain(err: unknown): StagingError {
  const msg = String((err as any)?.message ?? err);
  const hint = "Nothing was changed. Fix the data in the staging table (or skip the rows) and check again.";
  if (/unique|duplicate entry|already exists/i.test(msg)) return new StagingError(`The database refused the rows because a value that must be unique already exists: ${msg}`, "DB_UNIQUE", 409, hint);
  if (/foreign key/i.test(msg)) return new StagingError(`The database refused the rows because a linked row is missing (or still needed): ${msg}`, "DB_FK", 409, hint);
  if (/not null|cannot be null|null value/i.test(msg)) return new StagingError(`The database refused the rows because a required value is empty: ${msg}`, "DB_NOT_NULL", 409, hint);
  if (/check constraint|violates check/i.test(msg)) return new StagingError(`The database refused the rows because they break a rule (check constraint) of the table: ${msg}`, "DB_CHECK", 409, hint);
  return new StagingError(`The database refused the change: ${msg}`, "DB_ERROR", 409, hint);
}

export { CHANGES };

// ---- undo ------------------------------------------------------------------------------------------------------------

export interface UndoConflict {
  key: string;
  reason: string;
}

export interface UndoResult {
  ok: boolean;
  deleted: number;
  restored: number;
  conflicts: UndoConflict[];
  droppedTable: boolean;
  batch?: BatchRecord;
}

export async function undoBatch(db: StageDb, target: TargetTable | null, batchId: string): Promise<UndoResult> {
  await ensureLedger(db);
  const batch = await getBatch(db, batchId);
  if (!batch) throw new StagingError("That import was not found.", "NOT_FOUND", 404);
  if (batch.status !== "promoted") throw new StagingError(batch.status === "undone" ? "This import was already undone." : "This import was not promoted, so there is nothing to undo.", "NOT_PROMOTED", 409);
  if (!batch.undoable) throw new StagingError(batch.undoNote || "This import cannot be undone.", "NOT_UNDOABLE", 409);
  if (!target) throw new StagingError("The table this import changed is no longer there, so it cannot be undone.", "NO_TABLE", 409);
  const promote = batch.config?.promote ?? {};
  const byName = new Map(target.columns.map((c) => [c.name, c]));
  const snapNames: string[] = promote.snapshotColumns ?? [];
  const snapCols = snapNames.map((n) => byName.get(n)).filter((x): x is TargetColumn => !!x);
  if (snapCols.length !== snapNames.length) throw new StagingError("The table's columns changed since this import, so it can no longer be undone safely.", "SCHEMA_CHANGED", 409);
  const pk: string[] = promote.primaryKey ?? target.primaryKey;
  const view = new Snap(db, target, snapCols, pk);
  const c = await db.open();
  const conflicts: UndoConflict[] = [];
  const cc = (col: string) => q(db.engine, col);
  try {
    await c.begin();
    // pass 1: nothing may have touched these rows since
    type Change = { id: number; action: string; pk: (string | null)[]; before: Record<string, any> | null; after: string };
    const all: Change[] = [];
    let last = 0;
    for (;;) {
      const p = new Params(db.engine);
      const rows = (await c.query(`SELECT ${cc("change_id")} AS id, ${cc("action")} AS action, ${cc("pk_json")} AS pk, ${cc("before_json")} AS before_json, ${cc("after_hash")} AS after_hash FROM ${refOf(db, CHANGES)} WHERE ${cc("batch_id")} = ${p.add(batchId, "text")} AND ${cc("change_id")} > ${p.add(last, "bigint")} ORDER BY ${cc("change_id")} LIMIT 500`, p.values)).rows;
      if (!rows.length) break;
      last = Number(rows[rows.length - 1]!.id);
      const part: Change[] = rows.map((r) => ({ id: Number(r.id), action: String(r.action), pk: JSON.parse(String(r.pk)), before: r.before_json ? JSON.parse(String(r.before_json)) : null, after: String(r.after_hash ?? "") }));
      const snaps = await snapshotsByPk(view, c, part.map((x) => x.pk), true);
      for (const ch of part) {
        const key = ch.pk.map((v, i) => `${pk[i]} = ${v}`).join(", ");
        const cur = snaps.get(JSON.stringify(ch.pk));
        if (!cur) conflicts.push({ key, reason: "This row was deleted after the import." });
        else if (sha(rowJson(cur, snapCols)) !== ch.after) conflicts.push({ key, reason: "This row was changed after the import." });
        if (!limitsOk(conflicts)) break;
      }
      all.push(...part);
      if (!limitsOk(conflicts)) break;
    }
    if (conflicts.length) {
      await c.rollback();
      return { ok: false, deleted: 0, restored: 0, conflicts: conflicts.slice(0, 50), droppedTable: false };
    }
    // pass 2: put things back
    let deleted = 0;
    let restored = 0;
    const pkCols = pk.map((n) => byName.get(n)!);
    const skipRestore = new Set(target.columns.filter((x) => x.generated || x.cls === "binary").map((x) => x.name));
    for (let i = 0; i < all.length; i += 100) {
      const part = all.slice(i, i + 100);
      const ins = part.filter((x) => x.action === "insert");
      if (ins.length) {
        const p = new Params(db.engine);
        const where = ins.map((x) => "(" + pkCols.map((col, k) => `${cc(col.name)} = ${bindValue(p, col, x.pk[k])}`).join(" AND ") + ")").join(" OR ");
        deleted += (await c.query(`DELETE FROM ${refOf(db, target.name)} WHERE ${where}`, p.values)).affected;
      }
      for (const x of part.filter((y) => y.action === "update")) {
        const p = new Params(db.engine);
        const set = snapCols.filter((col) => !pk.includes(col.name) && !skipRestore.has(col.name)).map((col) => `${cc(col.name)} = ${x.before![col.name] === null ? "NULL" : bindValue(p, col, x.before![col.name])}`).join(", ");
        const where = pkCols.map((col, k) => `${cc(col.name)} = ${bindValue(p, col, x.pk[k])}`).join(" AND ");
        if (set) restored += (await c.query(`UPDATE ${refOf(db, target.name)} SET ${set} WHERE ${where}`, p.values)).affected;
      }
    }
    await updateBatch(db, c, batchId, { status: "undone", undoneAt: nowIso(), undoable: false });
    const dp = new Params(db.engine);
    await c.query(`DELETE FROM ${refOf(db, CHANGES)} WHERE ${cc("batch_id")} = ${dp.add(batchId, "text")}`, dp.values);
    await c.commit();
  } catch (err) {
    await c.rollback().catch(() => {});
    if (err instanceof StagingError) throw err;
    const e = explain(err);
    throw new StagingError(`The import could not be undone because the database refused: ${e.message.replace(/^The database refused[^:]*: /, "")} Other rows probably depend on the rows this import added. Nothing was changed.`, "UNDO_REFUSED", 409);
  } finally {
    await c.release();
  }
  let droppedTable = false;
  if (promote.createdTable) {
    const left = Number((await (async () => {
      const c2 = await db.open();
      try {
        return await c2.query(`SELECT COUNT(*) AS c FROM ${refOf(db, target.name)}`);
      } finally {
        await c2.release();
      }
    })()).rows[0]?.c ?? 0);
    if (left === 0) {
      const c3 = await db.open();
      try {
        await c3.query(`DROP TABLE ${refOf(db, target.name)}`);
        droppedTable = true;
      } finally {
        await c3.release();
      }
    }
  }
  const after = (await getBatch(db, batchId))!;
  return { ok: true, deleted: batch.rowsInserted, restored: batch.rowsUpdated, conflicts: [], droppedTable, batch: after };
}

const limitsOk = (c: UndoConflict[]) => c.length < 1000 && limits.maxFindings > 0;
