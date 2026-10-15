/**
 * The history of file operations (copy, move, rename): what was asked for, what finished, what failed and why.
 *
 * One small versioned JSON file in the app's data folder (`file_operations.json`, owner-only). It holds paths, counts and
 * plain-language messages only: no file contents, passwords, keys or environment values ever reach it. It is kept short
 * (the newest MAX_ENTRIES operations, MAX_ITEMS items each) and validated on every read, so a damaged or hand-edited
 * file can never break the app. An operation that was still running when the app closed is shown as "interrupted".
 *
 * Only the history is stored. A finished operation cannot be retried after a restart (the queue lives in memory); the
 * recorded paths tell the person what is done and what is left.
 */
import { promises as fsp } from "fs";
import { randomBytes } from "crypto";
import * as nodePath from "path";
import type { FmContext } from "./fmCore";
import type { JobHooks, JobView, StepState } from "./fmJobs";

export const HISTORY_VERSION = 1;
export const MAX_ENTRIES = 200;
export const MAX_ITEMS = 200;
const FILE_KINDS = ["copy", "move", "rename"] as const;
type FileOpKind = (typeof FILE_KINDS)[number];
const STATES = ["waiting", "running", "done", "failed", "cancelled", "interrupted"] as const;
type HistoryState = (typeof STATES)[number];
const ITEM_STATES: readonly StepState[] = ["waiting", "running", "done", "failed", "skipped"];

export interface HistoryItem {
  source: string;
  destination: string | null;
  state: StepState;
  message: string;
}

export interface HistoryEntry {
  id: string;
  kind: FileOpKind;
  title: string;
  state: HistoryState;
  startedAt: number;
  finishedAt: number | null;
  done: number;
  failed: number;
  skipped: number;
  total: number;
  bytesDone: number;
  /** `null`: the size could not be measured. */
  bytesTotal: number | null;
  /** The first MAX_ITEMS items; `itemsOmitted` counts the rest. */
  items: HistoryItem[];
  itemsOmitted: number;
  /** The entry this one retried, if any. */
  retryOf: string | null;
}

export const isFileOp = (kind: string): kind is FileOpKind => (FILE_KINDS as readonly string[]).includes(kind);

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\0/g, "").slice(0, max) : "");
const count = (v: unknown): number => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

function sanitizeEntry(raw: unknown): HistoryEntry | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, any> | null;
  if (!r || typeof r.id !== "string" || !/^[a-f0-9]{4,32}$/.test(r.id) || !isFileOp(String(r.kind))) return null;
  const items: HistoryItem[] = [];
  for (const i of Array.isArray(r.items) ? r.items : []) {
    if (!i || typeof i.source !== "string" || items.length >= MAX_ITEMS) continue;
    items.push({
      source: text(i.source, 4096),
      destination: typeof i.destination === "string" ? text(i.destination, 4096) : null,
      state: oneOf(i.state, ITEM_STATES, "waiting"),
      message: text(i.message, 600),
    });
  }
  return {
    id: r.id,
    kind: r.kind,
    title: text(r.title, 200),
    state: oneOf(r.state, STATES, "interrupted"),
    startedAt: count(r.startedAt),
    finishedAt: r.finishedAt === null || r.finishedAt === undefined ? null : count(r.finishedAt),
    done: count(r.done),
    failed: count(r.failed),
    skipped: count(r.skipped),
    total: count(r.total),
    bytesDone: count(r.bytesDone),
    bytesTotal: r.bytesTotal === null || r.bytesTotal === undefined ? null : count(r.bytesTotal),
    items,
    itemsOmitted: count(r.itemsOmitted),
    retryOf: typeof r.retryOf === "string" ? r.retryOf.slice(0, 32) : null,
  };
}

export const historyFile = (ctx: Pick<FmContext, "dataDir">) => nodePath.join(ctx.dataDir, "file_operations.json");

async function readEntries(ctx: Pick<FmContext, "dataDir">): Promise<HistoryEntry[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fsp.readFile(historyFile(ctx), "utf8"));
  } catch {
    return [];
  }
  const list = raw && typeof raw === "object" && (raw as any).version === HISTORY_VERSION && Array.isArray((raw as any).entries) ? ((raw as any).entries as unknown[]) : [];
  const entries: HistoryEntry[] = [];
  for (const e of list) {
    const entry = sanitizeEntry(e);
    if (entry) entries.push(entry);
  }
  return entries.slice(-MAX_ENTRIES);
}

/** Reads the history. Entries still marked running or waiting that are not in `live` belong to an earlier run of the app and are shown as interrupted. */
export async function loadHistory(ctx: Pick<FmContext, "dataDir">, live: ReadonlySet<string> = new Set()): Promise<HistoryEntry[]> {
  const entries = await readEntries(ctx);
  for (const entry of entries) {
    if ((entry.state === "running" || entry.state === "waiting") && !live.has(entry.id)) {
      entry.state = "interrupted";
      for (const item of entry.items) {
        if (item.state === "running" || item.state === "waiting") {
          item.message = item.message || "The app closed before this was finished. Check whether it was changed.";
        }
      }
    }
  }
  return entries;
}

export function entryFromJob(view: JobView): HistoryEntry {
  const items: HistoryItem[] = view.steps.slice(0, MAX_ITEMS).map((s) => ({
    source: text(s.item?.source ?? s.label, 4096),
    destination: s.item?.destination ?? null,
    state: s.state,
    message: text(s.message, 600),
  }));
  return {
    id: view.id,
    kind: view.kind as FileOpKind,
    title: text(view.title, 200),
    state: view.state === "waiting" || view.state === "running" || view.state === "done" || view.state === "failed" || view.state === "cancelled" ? view.state : "failed",
    startedAt: view.startedAt,
    finishedAt: view.finishedAt,
    done: view.done,
    failed: view.failed,
    skipped: view.skipped,
    total: view.total,
    bytesDone: view.progress.bytesDone,
    bytesTotal: view.progress.bytesTotal,
    items,
    itemsOmitted: Math.max(0, view.steps.length - items.length),
    retryOf: view.retryOf,
  };
}

const queues = new Map<string, Promise<unknown>>();

/** Adds or replaces one entry. Writes for the same file are done one at a time, each through a temporary file. */
export async function recordEntry(ctx: Pick<FmContext, "dataDir">, entry: HistoryEntry): Promise<void> {
  const file = historyFile(ctx);
  const run = async () => {
    const all = (await readEntries(ctx)).filter((e) => e.id !== entry.id);
    all.push(entry);
    await fsp.mkdir(ctx.dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ version: HISTORY_VERSION, entries: all.slice(-MAX_ENTRIES) }, null, 2), { mode: 0o600 });
    await fsp.rename(tmp, file);
  };
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.then(run, run);
  queues.set(file, next.catch(() => {}));
  return next;
}

/** Forgets every recorded operation. This only clears the list; no file is touched. */
export async function clearHistory(ctx: Pick<FmContext, "dataDir">): Promise<number> {
  const removed = (await readEntries(ctx)).length;
  const file = historyFile(ctx);
  const run = async () => {
    await fsp.rm(file, { force: true });
  };
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.then(run, run);
  queues.set(file, next.catch(() => {}));
  await next;
  return removed;
}

/** The hooks that make the job hub write file operations to the history. */
export function historyHooks(ctx: Pick<FmContext, "dataDir">): JobHooks {
  return {
    onStart: (view) => (isFileOp(view.kind) ? recordEntry(ctx, entryFromJob(view)) : undefined),
    onFinish: (view) => (isFileOp(view.kind) ? recordEntry(ctx, entryFromJob(view)) : undefined),
  };
}
