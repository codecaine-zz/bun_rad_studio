/**
 * Step 4: check the staged rows. Repeatable and safe: it only writes to the staging table.
 *
 * Cell checks (type, size, required, the person's own rules) run in one streaming pass in JavaScript so that every engine
 * judges a value the same strict way (MySQL, for instance, would quietly turn "12abc" into 12). Everything that compares rows
 * with each other or with the target (duplicates in the file, rows that already exist, foreign keys, unique constraints)
 * is set-based SQL.
 */
import { breathe, q, refOf, type StageConn, type StageDb } from "./db";
import { BOOLEAN_WORDS, differentExpr, Params, valueExpr } from "./dialect";
import { ensureLedger, nowIso, updateBatch, type BatchRecord } from "./ledger";
import { limits, StagingError } from "./limits";
import type { ImportPlan, RowError, TargetColumn, TargetTable, UserRule } from "./types";
import { daysInMonth, parseBoolean, parseDate, parseNumber } from "./values";

export interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  skipped: number;
  promoted: number;
  /** Rows that are not in the target yet / are in the target and identical / are in the target and different. */
  newRows: number;
  same: number;
  changed: number;
  /** Valid rows whose match against the target is unknown because no key was chosen. */
  unknownMatch: number;
  byColumn: { column: string; count: number }[];
  /** Problems with the setup itself (for example a required column that is not mapped). */
  blocking: string[];
  notes: string[];
  checkedAt: string;
  truncated: boolean;
}

export interface ValidateOptions {
  db: StageDb;
  batch: BatchRecord;
  target: TargetTable;
  dataColumns: string[];
  plan: ImportPlan;
  signal?: AbortSignal;
  onProgress?: (phase: string, done: number, total: number) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shown = (v: string): string => (v.length > 60 ? v.slice(0, 57) + "…" : v);
const fmt = (v: string) => `“${shown(v)}”`;
const INT_RANGE = (bits: number, unsigned: boolean): [bigint, bigint] => (unsigned ? [0n, (1n << BigInt(bits)) - 1n] : [-(1n << BigInt(bits - 1)), (1n << BigInt(bits - 1)) - 1n]);

interface CellProblem {
  code: string;
  m: string;
  f?: string;
}

/** Why a staged text value cannot go into this column, or null when it can. */
export function checkCell(col: TargetColumn, v: string, engine: TargetTable["engine"]): CellProblem | null {
  switch (col.cls) {
    case "integer": {
      const s = v.trim();
      if (!/^[+-]?\d+$/.test(s)) {
        if (/^[+-]?\d*\.\d+$/.test(s) || /^[+-]?\d+\.\d*$/.test(s)) return { code: "not_integer", m: `${fmt(v)} has decimals, but this column holds whole numbers.`, f: "Round the value, or choose a column that holds decimals." };
        if (parseNumber(s, "auto") !== null) return { code: "bad_number_format", m: `${fmt(v)} has separators or symbols that the database cannot read as a whole number.`, f: "Use the clean-up “Read as a number” on this column." };
        return { code: "not_integer", m: `${fmt(v)} is not a whole number.`, f: "Correct the value, or leave it empty if it is unknown." };
      }
      const [lo, hi] = INT_RANGE(engine === "sqlite" ? 64 : (col.bits ?? 64), !!col.unsigned);
      const n = BigInt(s);
      if (n < lo || n > hi) return { code: "out_of_range", m: `${fmt(v)} is outside what this column can hold (${lo} to ${hi}).`, f: "Use a smaller value or a bigger column type." };
      return null;
    }
    case "decimal":
    case "float": {
      const s = v.trim();
      if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
        if (parseNumber(s, "auto") !== null) return { code: "bad_number_format", m: `${fmt(v)} has separators or symbols that the database cannot read as a number.`, f: "Use the clean-up “Read as a number” on this column (choose the right decimal style)." };
        return { code: "not_number", m: `${fmt(v)} is not a number.`, f: "Correct the value, or leave it empty if it is unknown." };
      }
      if (col.cls === "decimal" && col.precision && engine !== "sqlite" && !/[eE]/.test(s)) {
        const [i = "", f = ""] = s.replace(/^[+-]/, "").split(".");
        const scale = col.scale ?? 0;
        const intDigits = i.replace(/^0+(?=\d)/, "").length;
        if (f.length > scale) return { code: "too_many_decimals", m: `${fmt(v)} has ${f.length} decimal place${f.length === 1 ? "" : "s"}; this column keeps ${scale}.`, f: `Round to ${scale} decimal place${scale === 1 ? "" : "s"}.` };
        if (intDigits > col.precision - scale) return { code: "too_big", m: `${fmt(v)} has too many digits for ${col.dataType}.`, f: "Use a smaller number or a wider column." };
        if (col.unsigned && s.startsWith("-") && !/^-0(\.0*)?$/.test(s)) return { code: "out_of_range", m: `${fmt(v)} is negative, but this column only holds zero and up.` };
      }
      return null;
    }
    case "boolean":
      return BOOLEAN_WORDS.includes(v.trim().toLowerCase()) ? null : { code: "not_boolean", m: `${fmt(v)} is not a yes/no value.`, f: parseBoolean(v) ? "Use the clean-up “Read yes/no/Y/N/1/0 as true/false”." : "Use true/false, yes/no, y/n or 1/0." };
    case "date": {
      const s = v.trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= daysInMonth(Number(m[1]), Number(m[2])) && Number(m[1]) >= 1) return null;
      const p = parseDate(s);
      if (m) return { code: "bad_date", m: `${fmt(v)} is not a real calendar date.`, f: "Check the day and month." };
      if (p) return { code: "date_format", m: `${fmt(v)} is not in year-month-day form (2024-03-31).`, f: "Use the clean-up “Read as a date” on this column and choose the order of day and month." };
      return { code: "bad_date", m: `${fmt(v)} is not a date.`, f: "Correct it to year-month-day, for example 2024-03-31." };
    }
    case "timestamp": {
      const s = v.trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(s);
      if (m) {
        const ok = Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= daysInMonth(Number(m[1]), Number(m[2])) && Number(m[4]) <= 23 && Number(m[5]) <= 59 && Number(m[6] ?? 0) <= 59;
        if (!ok) return { code: "bad_date", m: `${fmt(v)} is not a real date and time.`, f: "Check the day, month and time." };
        if (m[7] && engine === "mysql") return { code: "timezone", m: `${fmt(v)} carries a time zone, which MySQL's DATETIME cannot hold.`, f: "Convert it to one time zone and remove the suffix." };
        return null;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(s) && parseDate(s)) return { code: "date_format", m: `${fmt(v)} has a date but no time.`, f: "Add a time (for example 00:00:00) with the clean-up “Read as a date and time”." };
      if (parseDate(s)) return { code: "date_format", m: `${fmt(v)} is not in year-month-day hour:minute form (2024-03-31 14:30:00).`, f: "Use the clean-up “Read as a date and time” on this column." };
      return { code: "bad_date", m: `${fmt(v)} is not a date and time.`, f: "Correct it to 2024-03-31 14:30:00." };
    }
    case "time":
      return /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v.trim()) && Number(v.slice(0, 2)) <= 23 && Number(v.slice(3, 5)) <= 59 ? null : { code: "bad_time", m: `${fmt(v)} is not a time of day.`, f: "Use hour:minute:second, for example 14:30:00." };
    case "uuid":
      return UUID.test(v.trim()) ? null : { code: "not_uuid", m: `${fmt(v)} is not a UUID.`, f: "A UUID looks like 123e4567-e89b-12d3-a456-426614174000." };
    case "json":
      try {
        JSON.parse(v);
        return null;
      } catch {
        return { code: "not_json", m: `${fmt(v)} is not valid JSON.`, f: "Fix the braces, brackets and quotes." };
      }
    case "enum": {
      const values = col.enumValues ?? [];
      const hit = engine === "mysql" ? values.some((x) => x.toLowerCase() === v.toLowerCase()) : values.includes(v);
      return hit || !values.length ? null : { code: "not_in_list", m: `${fmt(v)} is not one of the allowed values: ${values.slice(0, 8).join(", ")}${values.length > 8 ? ", …" : ""}.`, f: "Pick one of the allowed values." };
    }
    case "text":
      if (col.length && engine !== "sqlite" && v.length > col.length * 0.5) {
        const len = Array.from(v).length;
        if (len > col.length) return { code: "too_long", m: `Text is ${len} characters; this column holds at most ${col.length}.`, f: "Shorten the text, or make the column longer." };
      }
      return null;
    default:
      return null;
  }
}

/** Compiles the person's own rules for one column; returns null when the rule is not usable. */
export function compileUserRule(rule: UserRule): ((v: string | null) => string | null) | { error: string } {
  const label = rule.message?.trim();
  switch (rule.kind) {
    case "notempty":
      return (v) => (v === null || v.trim() === "" ? label || "This value is required." : null);
    case "regex": {
      if (rule.value.length > 200) return { error: "That pattern is too long (200 characters at most)." };
      let re: RegExp;
      try {
        re = new RegExp(rule.value, "u");
      } catch (e) {
        return { error: `That pattern is not valid: ${(e as Error).message}` };
      }
      return (v) => (v === null || v === "" || (v.length <= 10000 && re.test(v)) ? null : label || `Does not match the pattern ${rule.value}.`);
    }
    case "min":
    case "max": {
      const lim = Number(rule.value);
      if (!Number.isFinite(lim)) return { error: "The limit must be a number." };
      return (v) => {
        if (v === null || v.trim() === "") return null;
        const num = Number(parseNumber(v, "auto") ?? NaN);
        if (Number.isNaN(num)) return null;
        return rule.kind === "min" ? (num < lim ? label || `Must be at least ${lim}.` : null) : num > lim ? label || `Must be at most ${lim}.` : null;
      };
    }
    case "oneof": {
      const list = rule.value.split(",").map((x) => x.trim()).filter((x) => x !== "");
      if (!list.length) return { error: "List at least one allowed value, separated by commas." };
      const set = new Set(list.map((x) => x.toLowerCase()));
      return (v) => (v === null || v === "" || set.has(v.trim().toLowerCase()) ? null : label || `Must be one of: ${list.slice(0, 8).join(", ")}${list.length > 8 ? ", …" : ""}.`);
    }
    case "length": {
      const m = /^\s*(\d+)?\s*-?\s*(\d+)?\s*$/.exec(rule.value);
      const single = /^\s*\d+\s*$/.test(rule.value);
      const lo = single ? 0 : m?.[1] ? Number(m[1]) : 0;
      const hi = single ? Number(rule.value) : m?.[2] ? Number(m[2]) : Infinity;
      if (!m) return { error: "Use a length like 5 (at most 5) or 3-10." };
      return (v) => {
        if (v === null) return null;
        const len = Array.from(v).length;
        return len < lo || len > hi ? label || `Length must be ${Number.isFinite(hi) ? (lo ? `${lo} to ${hi}` : `at most ${hi}`) : `at least ${lo}`} characters.` : null;
      };
    }
  }
}

const chunk = <T,>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

const parseErrors = (text: unknown): RowError[] => {
  if (typeof text !== "string" || !text) return [];
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Writes error lists (and a status) for many rows with few statements. `errors === null` clears them. */
export async function writeRowErrors(db: StageDb, c: StageConn, stg: string, rows: Map<number, RowError[] | null>, status: "invalid" | "duplicate" | "keep"): Promise<void> {
  const e = db.engine;
  const entries = [...rows.entries()];
  const withErr = entries.filter(([, v]) => v && v.length) as [number, RowError[]][];
  const clear = entries.filter(([, v]) => !v || !v.length).map(([k]) => k);
  for (const part of chunk(withErr, 250)) {
    const p = new Params(e);
    const cases = part.map(([id, errs]) => `WHEN ${p.add(id, "bigint")} THEN ${p.add(JSON.stringify(errs.slice(0, 25)), "text")}`).join(" ");
    const ids = part.map(([id]) => p.add(id, "bigint")).join(", ");
    const st = status === "keep" ? "" : `, ${q(e, "_stg_status")} = '${status}'`;
    await c.query(`UPDATE ${refOf(db, stg)} SET ${q(e, "_stg_errors")} = CASE ${q(e, "_stg_row_id")} ${cases} END${st} WHERE ${q(e, "_stg_row_id")} IN (${ids})`, p.values);
  }
  for (const part of chunk(clear, 500)) {
    const p = new Params(e);
    const ids = part.map((id) => p.add(id, "bigint")).join(", ");
    await c.query(`UPDATE ${refOf(db, stg)} SET ${q(e, "_stg_errors")} = NULL WHERE ${q(e, "_stg_row_id")} IN (${ids})`, p.values);
  }
}


/**
 * Marks every still-unchecked-for-match row as new / same / changed compared with the rows that are in the target right now.
 * Needs the key columns to be mapped. Only writes to the staging table.
 */
export async function classifyMatches(db: StageDb, conn: StageConn, stg: string, target: TargetTable, key: string[], mapped: string[]): Promise<void> {
  const e = db.engine;
  const ref = refOf(db, stg);
  const col = (n: string) => q(e, n);
  const byName = new Map(target.columns.map((c) => [c.name, c]));
  const tcol = (n: string) => `t.${col(n)}`;
  const cast = (n: string) => valueExpr(e, byName.get(n)!, `s.${col(n)}`);
  const active = `s.${col("_stg_status")} IN ('valid', 'new')`;
  const keyEq = key.map((c) => `${tcol(c)} = ${cast(c)}`).join(" AND ");
  const notNull = key.map((c) => `s.${col(c)} IS NOT NULL`).join(" AND ");
  await conn.query(`UPDATE ${ref} AS s SET ${col("_stg_match")} = 'new' WHERE ${active}`);
  await conn.query(`UPDATE ${ref} AS s SET ${col("_stg_match")} = 'same' WHERE ${active} AND ${notNull} AND EXISTS (SELECT 1 FROM ${refOf(db, target.name)} AS t WHERE ${keyEq})`);
  const compare = mapped.filter((c) => !key.includes(c) && !byName.get(c)!.generated);
  if (compare.length) {
    const diff = compare.map((c) => differentExpr(e, tcol(c), cast(c))).join(" OR ");
    await conn.query(`UPDATE ${ref} AS s SET ${col("_stg_match")} = 'changed' WHERE ${active} AND ${col("_stg_match")} = 'same' AND EXISTS (SELECT 1 FROM ${refOf(db, target.name)} AS t WHERE ${keyEq} AND (${diff}))`);
  }
}

class Cancelled extends Error {}

export async function validateStaging(o: ValidateOptions): Promise<ValidationSummary> {
  const { db, batch, target, plan } = o;
  const e = db.engine;
  const stg = batch.stagingTable;
  if (!stg) throw new StagingError("This import's staging table has been dropped, so it can't be checked.", "NO_STAGING", 409);
  await ensureLedger(db);
  const ref = refOf(db, stg);
  const col = (n: string) => q(e, n);
  const byName = new Map(target.columns.map((c) => [c.name, c]));
  const mapped = o.dataColumns.filter((n) => byName.has(n));
  const mappedSet = new Set(mapped);
  const blocking: string[] = [];
  const notes: string[] = [];
  const checkCancel = () => {
    if (o.signal?.aborted) throw new Cancelled();
  };

  for (const c of target.columns) {
    if (mappedSet.has(c.name) || c.generated) continue;
    if (!c.nullable && !c.hasDefault && !c.auto) blocking.push(`Column “${c.name}” is required (it cannot be empty and has no default), but nothing is mapped to it.`);
  }
  const key = plan.keyColumns.filter(Boolean);
  const keyMapped = key.length > 0 && key.every((k) => mappedSet.has(k));
  for (const k of key) if (!mappedSet.has(k)) blocking.push(`The key column “${k}” is not mapped, so rows cannot be matched with existing rows.`);
  if (!key.length && !target.virtual) notes.push("No key column is chosen, so rows cannot be matched with rows that already exist. “Insert everything” and “Append” are still possible.");

  const cellChecks = mapped.map((n) => ({ name: n, col: byName.get(n)! }));
  const userChecks: { column: string; fn: (v: string | null) => string | null }[] = [];
  for (const r of plan.userRules) {
    if (!mappedSet.has(r.column)) continue;
    const fn = compileUserRule(r);
    if ("error" in fn) {
      blocking.push(`Rule on “${r.column}”: ${fn.error}`);
      continue;
    }
    userChecks.push({ column: r.column, fn });
  }

  const conn = await db.open();
  const columnCounts = new Map<string, number>();
  let findings = 0;
  let truncated = false;
  const bump = (c: string | null) => columnCounts.set(c ?? "(whole row)", (columnCounts.get(c ?? "(whole row)") ?? 0) + 1);
  try {
    await conn.begin();
    await conn.query(`UPDATE ${ref} SET ${col("_stg_status")} = 'new', ${col("_stg_match")} = NULL WHERE ${col("_stg_status")} IN ('valid', 'invalid', 'duplicate')`);
    const [{ c: total }] = ((await conn.query(`SELECT COUNT(*) AS c FROM ${ref} WHERE ${col("_stg_status")} = 'new'`)).rows as any[]) ?? [{ c: 0 }];
    const totalRows = Number(total);

    // 1. cell checks in one streaming pass
    let last = 0;
    let done = 0;
    const select = ["_stg_row_id", "_stg_errors", ...mapped].map(col).join(", ");
    for (;;) {
      checkCancel();
      const p = new Params(e);
      const rows = (await conn.query(`SELECT ${select} FROM ${ref} WHERE ${col("_stg_status")} = 'new' AND ${col("_stg_row_id")} > ${p.add(last, "bigint")} ORDER BY ${col("_stg_row_id")} LIMIT 2000`, p.values)).rows;
      if (!rows.length) break;
      const bad = new Map<number, RowError[]>();
      const clear = new Map<number, null>();
      for (const r of rows) {
        const id = Number(r._stg_row_id);
        last = id;
        const prior = parseErrors(r._stg_errors);
        const errs: RowError[] = prior.filter((x) => x.s === "load");
        for (const { name, col: tc } of cellChecks) {
          const raw = r[name] as string | null;
          const textual = tc.cls === "text" || tc.cls === "other" || tc.cls === "binary";
          const empty = raw === null || (!textual && raw.trim() === "");
          if (empty) {
            if (!tc.nullable && !(tc.auto && e !== "postgres") && !tc.generated) errs.push({ c: name, code: "required", v: raw === null ? null : "", m: `“${name}” is required but this row has no value.`, f: "Fill it in, or use the clean-up “If empty, use a default value”." });
            continue;
          }
          const problem = checkCell(tc, raw as string, e);
          if (problem) errs.push({ c: name, code: problem.code, v: shown(raw as string), m: problem.m, ...(problem.f ? { f: problem.f } : {}) });
        }
        for (const u of userChecks) {
          const msg = u.fn((r[u.column] as string | null) ?? null);
          if (msg) errs.push({ c: u.column, code: "rule", v: r[u.column] === null ? null : shown(String(r[u.column])), m: msg });
        }
        if (errs.length) {
          bad.set(id, errs);
          for (const x of errs) bump(x.c);
        } else if (prior.length) clear.set(id, null);
        findings += errs.length;
      }
      if (bad.size) await writeRowErrors(db, conn, stg, bad, "invalid");
      if (clear.size) await writeRowErrors(db, conn, stg, clear, "keep");
      done += rows.length;
      o.onProgress?.("Checking cells", done, totalRows);
      await breathe(db, true);
      if (findings > limits.maxFindings) {
        truncated = true;
        break;
      }
    }

    // 2. comparisons, all in SQL
    if (!truncated) {
      const tcol = (n: string) => `t.${col(n)}`;
      const scol = (n: string) => `s.${col(n)}`;
      const cast = (n: string, from = byName.get(n)!) => valueExpr(e, from, scol(n));
      const active = `s.${col("_stg_status")} = 'new'`;
      const found = new Map<number, RowError[]>();
      const foundDup = new Map<number, RowError[]>();
      const add = (m: Map<number, RowError[]>, id: number, err: RowError) => {
        if (findings > limits.maxFindings) return (truncated = true);
        (m.get(id) ?? m.set(id, []).get(id)!).push(err);
        bump(err.c);
        findings++;
      };
      const paged = async (build: (p: Params, after: number) => string, handle: (r: Record<string, any>) => void) => {
        let after = 0;
        for (;;) {
          checkCancel();
          const p = new Params(e);
          const rows = (await conn.query(build(p, after), p.values)).rows;
          for (const r of rows) {
            after = Number(r.rid);
            handle(r);
          }
          if (rows.length < 5000) break;
          await breathe(db, true);
        }
      };

      const uniqueSets: { cols: string[]; isKey: boolean }[] = [];
      if (keyMapped) uniqueSets.push({ cols: key, isKey: true });
      for (const u of [target.primaryKey, ...target.uniques]) if (u.length && u.every((c) => mappedSet.has(c)) && !(keyMapped && u.length === key.length && u.every((c) => key.includes(c)))) uniqueSets.push({ cols: u, isKey: false });

      // 2a. the same key twice in the file
      o.onProgress?.("Looking for repeated rows", 0, 0);
      for (const set of uniqueSets) {
        const notNull = set.cols.map((c) => `${scol(c)} IS NOT NULL`).join(" AND ");
        const exprs = set.cols.map((c) => cast(c));
        const sub = `SELECT ${exprs.map((x, i) => `${x} AS k${i}`).join(", ")}, MIN(s.${col("_stg_row_id")}) AS first_id FROM ${ref} AS s WHERE ${active} AND ${notNull} GROUP BY ${exprs.map((_, i) => i + 1).join(", ")} HAVING COUNT(*) > 1`;
        await paged(
          (p, after) =>
            `SELECT s.${col("_stg_row_id")} AS rid, s0.${col("_stg_row_number")} AS first_rn, ${set.cols.map((c, i) => `${scol(c)} AS v${i}`).join(", ")} FROM ${ref} AS s JOIN (${sub}) AS f ON ${exprs.map((x, i) => `${x} = f.k${i}`).join(" AND ")} AND s.${col("_stg_row_id")} <> f.first_id JOIN ${ref} AS s0 ON s0.${col("_stg_row_id")} = f.first_id WHERE ${active} AND ${notNull} AND s.${col("_stg_row_id")} > ${p.add(after, "bigint")} ORDER BY s.${col("_stg_row_id")} LIMIT 5000`,
          (r) => {
            const err: RowError = {
              c: set.cols[0]!,
              code: set.isKey ? "dup_file" : "unique_file",
              v: set.cols.map((_, i) => shown(String(r[`v${i}`]))).join(", "),
              m: `The same ${set.cols.join(" + ")} appears in row ${r.first_rn} of this file.`,
              f: set.isKey ? "Skip the repeated row, or correct its key." : "Each value in this column must be unique. Correct or skip the row.",
            };
            add(set.isKey ? foundDup : found, Number(r.rid), err);
          },
        );
      }

      // 2b. foreign keys: the value must exist in the parent table
      if (!target.virtual) {
        o.onProgress?.("Checking links to other tables", 0, 0);
        const parents = new Map<string, TargetTable>();
        for (const fk of target.foreignKeys) {
          if (!fk.columns.every((c) => mappedSet.has(c))) continue;
          let parent = parents.get(fk.refTable);
          if (!parent) {
            try {
              parent = fk.refTable === target.name ? target : await db.describe(fk.refTable);
            } catch {
              notes.push(`The link to “${fk.refTable}” could not be checked (that table could not be read).`);
              continue;
            }
            parents.set(fk.refTable, parent);
          }
          const pcols = fk.refColumns.map((c) => parent!.columns.find((x) => x.name === c));
          if (pcols.some((c) => !c)) continue;
          const pref = e === "postgres" ? `${q(e, fk.refSchema ?? db.schema ?? "public")}.${q(e, fk.refTable)}` : q(e, fk.refTable);
          const notNull = fk.columns.map((c) => `${scol(c)} IS NOT NULL`).join(" AND ");
          const match = fk.columns.map((c, i) => `p.${col(fk.refColumns[i]!)} = ${valueExpr(e, pcols[i]!, scol(c))}`).join(" AND ");
          await paged(
            (p, after) => `SELECT s.${col("_stg_row_id")} AS rid, ${fk.columns.map((c, i) => `${scol(c)} AS v${i}`).join(", ")} FROM ${ref} AS s WHERE ${active} AND ${notNull} AND NOT EXISTS (SELECT 1 FROM ${pref} AS p WHERE ${match}) AND s.${col("_stg_row_id")} > ${p.add(after, "bigint")} ORDER BY s.${col("_stg_row_id")} LIMIT 5000`,
            (r) =>
              add(found, Number(r.rid), {
                c: fk.columns[0]!,
                code: "fk_missing",
                v: fk.columns.map((_, i) => shown(String(r[`v${i}`]))).join(", "),
                m: `No row in “${fk.refTable}” has ${fk.refColumns.join(" + ")} = ${fk.columns.map((_, i) => shown(String(r[`v${i}`]))).join(", ")}.`,
                f: `Add that row to “${fk.refTable}” first, or correct the value.`,
              }),
          );
        }

        // 2c. another row of the target already uses a unique value
        o.onProgress?.("Checking values that must be unique", 0, 0);
        for (const set of uniqueSets) {
          if (set.isKey) continue;
          const notNull = set.cols.map((c) => `${scol(c)} IS NOT NULL`).join(" AND ");
          const hit = set.cols.map((c) => `${tcol(c)} = ${cast(c)}`).join(" AND ");
          const sameRow = keyMapped ? ` AND NOT (${key.map((c) => `${tcol(c)} = ${cast(c)}`).join(" AND ")})` : "";
          await paged(
            (p, after) => `SELECT s.${col("_stg_row_id")} AS rid, ${set.cols.map((c, i) => `${scol(c)} AS v${i}`).join(", ")} FROM ${ref} AS s WHERE ${active} AND ${notNull} AND EXISTS (SELECT 1 FROM ${refOf(db, target.name)} AS t WHERE ${hit}${sameRow}) AND s.${col("_stg_row_id")} > ${p.add(after, "bigint")} ORDER BY s.${col("_stg_row_id")} LIMIT 5000`,
            (r) =>
              add(found, Number(r.rid), {
                c: set.cols[0]!,
                code: "unique_target",
                v: set.cols.map((_, i) => shown(String(r[`v${i}`]))).join(", "),
                m: `${set.cols.join(" + ")} = ${set.cols.map((_, i) => shown(String(r[`v${i}`]))).join(", ")} already belongs to another row in “${target.name}”.`,
                f: "Use a different value, or skip the row.",
              }),
          );
        }
      }
      // a row that is both a repeat and invalid stays a repeat only when nothing else is wrong
      for (const [id, errs] of found) {
        foundDup.delete(id);
        void errs;
      }
      if (found.size) await writeRowErrors(db, conn, stg, found, "invalid");
      if (foundDup.size) await writeRowErrors(db, conn, stg, foundDup, "duplicate");

      if (keyMapped && !target.virtual) {
        o.onProgress?.("Comparing with the table", 0, 0);
        await classifyMatches(db, conn, stg, target, key, mapped);
      }
    }
    await conn.query(`UPDATE ${ref} SET ${col("_stg_status")} = 'valid' WHERE ${col("_stg_status")} = 'new'`);
    const summary = await summarize(db, conn, stg);
    await updateBatch(db, conn, batch.batchId, { status: batch.status === "promoted" ? "promoted" : "checked", rowsTotal: summary.total, rowsValid: summary.valid, rowsInvalid: summary.invalid, rowsDuplicate: summary.duplicate, rowsSkipped: summary.skipped });
    await conn.commit();
    return {
      ...summary,
      byColumn: [...columnCounts.entries()].map(([column, count]) => ({ column, count })).sort((a, b) => b.count - a.count).slice(0, 30),
      blocking,
      notes: truncated ? [...notes, `More than ${limits.maxFindings.toLocaleString("en-US")} problems were found, so checking stopped early. Fix the most common ones (see the list by column) and check again.`] : notes,
      checkedAt: nowIso(),
      truncated,
    };
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (err instanceof Cancelled) throw new StagingError("The check was cancelled. Nothing was changed.", "CANCELLED", 409);
    throw err;
  } finally {
    await conn.release();
  }
}

export async function summarize(db: StageDb, c: StageConn, stg: string): Promise<Omit<ValidationSummary, "byColumn" | "blocking" | "notes" | "checkedAt" | "truncated">> {
  const e = db.engine;
  const r = await c.query(`SELECT ${q(e, "_stg_status")} AS st, ${q(e, "_stg_match")} AS m, COUNT(*) AS c FROM ${refOf(db, stg)} GROUP BY ${q(e, "_stg_status")}, ${q(e, "_stg_match")}`);
  const s = { total: 0, valid: 0, invalid: 0, duplicate: 0, skipped: 0, promoted: 0, newRows: 0, same: 0, changed: 0, unknownMatch: 0 };
  for (const row of r.rows) {
    const n = Number(row.c);
    s.total += n;
    switch (row.st) {
      case "valid":
        s.valid += n;
        if (row.m === "new") s.newRows += n;
        else if (row.m === "same") s.same += n;
        else if (row.m === "changed") s.changed += n;
        else s.unknownMatch += n;
        break;
      case "invalid":
        s.invalid += n;
        break;
      case "duplicate":
        s.duplicate += n;
        break;
      case "skipped":
        s.skipped += n;
        break;
      case "promoted":
        s.promoted += n;
        break;
    }
  }
  return s;
}
