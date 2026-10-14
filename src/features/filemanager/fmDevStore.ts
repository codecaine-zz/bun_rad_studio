/**
 * Named snapshots of code statistics ("compare with what it was last month"): one small JSON file in the app's data
 * folder, validated on every read and write and capped, so a damaged or hand-edited file can't break anything.
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import type { FmContext } from "./fmCore";
import { FmError } from "./fmPaths";
import type { LangRow, StatsTotals } from "./fmDevTypes";
import { sumTotals } from "./fmDevTypes";

export const MAX_SNAPSHOTS = 50;
export const MAX_SNAPSHOT_LANGUAGES = 400;
export const MAX_SNAPSHOT_NAME = 60;
const FILE_NAME = "file_manager_dev_snapshots.json";

export interface Snapshot {
  id: string;
  name: string;
  root: string;
  createdAt: string;
  engine: string;
  totals: StatsTotals;
  languages: Array<Pick<LangRow, "name" | "files" | "code" | "comments" | "blanks">>;
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e12 ? Math.floor(v) : null);

/** A snapshot read from disk or from a request, or null when it isn't valid. */
export function validateSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, any>;
  if (typeof s.id !== "string" || !/^[a-f0-9]{8,32}$/.test(s.id)) return null;
  if (typeof s.name !== "string" || !s.name.trim() || s.name.length > MAX_SNAPSHOT_NAME * 2) return null;
  if (typeof s.root !== "string" || !s.root || s.root.length > 4096 || s.root.includes("\0")) return null;
  if (typeof s.createdAt !== "string" || Number.isNaN(Date.parse(s.createdAt))) return null;
  if (!Array.isArray(s.languages) || s.languages.length > MAX_SNAPSHOT_LANGUAGES) return null;
  const languages: Snapshot["languages"] = [];
  for (const l of s.languages) {
    if (!l || typeof l.name !== "string" || !l.name || l.name.length > 80) return null;
    const files = count(l.files);
    const code = count(l.code);
    const comments = count(l.comments);
    const blanks = count(l.blanks);
    if (files === null || code === null || comments === null || blanks === null) return null;
    languages.push({ name: l.name, files, code, comments, blanks });
  }
  return { id: s.id, name: s.name.trim().slice(0, MAX_SNAPSHOT_NAME), root: s.root, createdAt: s.createdAt, engine: typeof s.engine === "string" ? s.engine.slice(0, 40) : "", totals: sumTotals(languages), languages };
}

const storeFile = (ctx: FmContext) => nodePath.join(ctx.dataDir, FILE_NAME);
let queue: Promise<unknown> = Promise.resolve();

export async function loadSnapshots(ctx: FmContext): Promise<Snapshot[]> {
  try {
    const parsed = JSON.parse(await fsp.readFile(storeFile(ctx), "utf8"));
    const list = Array.isArray(parsed?.snapshots) ? parsed.snapshots : [];
    return list.map(validateSnapshot).filter((s: Snapshot | null): s is Snapshot => !!s).slice(0, MAX_SNAPSHOTS);
  } catch {
    return [];
  }
}

async function writeSnapshots(ctx: FmContext, snapshots: Snapshot[]): Promise<void> {
  await fsp.mkdir(ctx.dataDir, { recursive: true });
  const file = storeFile(ctx);
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify({ version: 1, snapshots }), { mode: 0o600 });
  await fsp.rename(tmp, file);
}

/** Changes the list one request at a time, so two quick saves can't lose each other. */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export function cleanName(input: unknown): string {
  const name = typeof input === "string" ? input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (!name) throw new FmError("BAD_NAME", "Give the snapshot a name.");
  return name.slice(0, MAX_SNAPSHOT_NAME);
}

export function saveSnapshot(ctx: FmContext, input: { name: unknown; root: string; engine: string; languages: LangRow[] }): Promise<Snapshot> {
  const name = cleanName(input.name);
  return locked(async () => {
    const all = await loadSnapshots(ctx);
    if (all.length >= MAX_SNAPSHOTS) throw new FmError("TOO_MANY", `You can keep up to ${MAX_SNAPSHOTS} snapshots. Delete an old one first.`);
    const languages = input.languages.slice(0, MAX_SNAPSHOT_LANGUAGES).map((l) => ({ name: l.name, files: l.files, code: l.code, comments: l.comments, blanks: l.blanks }));
    const snap = validateSnapshot({ id: randomBytes(6).toString("hex"), name, root: input.root, createdAt: new Date().toISOString(), engine: input.engine, languages });
    if (!snap) throw new FmError("BAD_SNAPSHOT", "Those numbers couldn't be saved.");
    all.unshift(snap);
    await writeSnapshots(ctx, all);
    return snap;
  });
}

export function deleteSnapshot(ctx: FmContext, id: unknown): Promise<boolean> {
  return locked(async () => {
    const all = await loadSnapshots(ctx);
    const next = all.filter((s) => s.id !== id);
    if (next.length === all.length) return false;
    await writeSnapshots(ctx, next);
    return true;
  });
}

export interface DiffRow {
  name: string;
  status: "added" | "removed" | "changed" | "same";
  files: number;
  code: number;
  comments: number;
  blanks: number;
  /** Change since the snapshot (current minus snapshot). */
  filesDelta: number;
  codeDelta: number;
  commentsDelta: number;
  blanksDelta: number;
}

type Row = Pick<LangRow, "name" | "files" | "code" | "comments" | "blanks">;

/** What changed per language between a snapshot and the current numbers; sorted by the size of the change in code lines. */
export function diffLanguages(before: Row[], after: Row[]): { rows: DiffRow[]; totals: { before: StatsTotals; after: StatsTotals; delta: StatsTotals } } {
  const old = new Map(before.map((r) => [r.name, r]));
  const now = new Map(after.map((r) => [r.name, r]));
  const rows: DiffRow[] = [];
  for (const name of new Set([...old.keys(), ...now.keys()])) {
    const a = old.get(name);
    const b = now.get(name);
    const cur = b ?? { name, files: 0, code: 0, comments: 0, blanks: 0 };
    const was = a ?? { name, files: 0, code: 0, comments: 0, blanks: 0 };
    const row: DiffRow = {
      name, status: !a ? "added" : !b ? "removed" : "same", files: cur.files, code: cur.code, comments: cur.comments, blanks: cur.blanks,
      filesDelta: cur.files - was.files, codeDelta: cur.code - was.code, commentsDelta: cur.comments - was.comments, blanksDelta: cur.blanks - was.blanks,
    };
    if (row.status === "same" && (row.filesDelta || row.codeDelta || row.commentsDelta || row.blanksDelta)) row.status = "changed";
    rows.push(row);
  }
  rows.sort((x, y) => Math.abs(y.codeDelta) - Math.abs(x.codeDelta) || x.name.localeCompare(y.name));
  const tb = sumTotals(before);
  const ta = sumTotals(after);
  return { rows, totals: { before: tb, after: ta, delta: { files: ta.files - tb.files, code: ta.code - tb.code, comments: ta.comments - tb.comments, blanks: ta.blanks - tb.blanks, lines: ta.lines - tb.lines } } };
}
