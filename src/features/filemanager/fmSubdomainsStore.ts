/**
 * The history of recent subdomain runs: one small JSON file in the app's data folder. It holds the target, the time
 * and the counts of the last 20 runs. The hosts themselves are stored only for a run where the person ticked "keep
 * results", and then at most MAX_KEPT_HOSTS of them. Everything read back is validated again, so a damaged or
 * hand-edited file can't break the page.
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import type { FmContext } from "./fmCore";
import { normaliseHost, validateTargetDomain } from "../subfinder/subfinderNames";

export const MAX_HISTORY = 20;
export const MAX_KEPT_HOSTS = 2000;
const FILE_NAME = "file_manager_subdomains_history.json";

export interface HistoryRow {
  host: string;
  sources: string[];
  ip?: string[];
  httpStatus?: number;
  httpTitle?: string;
  openPorts?: number[];
  isWildcard?: boolean;
}

export interface HistoryEntry {
  id: string;
  domain: string;
  unicode: string;
  at: string;
  state: "done" | "cancelled";
  durationMs: number;
  counts: { hosts: number; live: number; http: number; withPorts: number; wildcard: number };
  sources: Array<{ id: string; state: string; count: number }>;
  steps: { resolve: boolean; probeHttp: boolean; ports: number[]; wildcard: boolean };
  truncated: boolean;
  /** Only present when "keep results" was ticked for that run. */
  results?: HistoryRow[];
  resultsCut?: boolean;
}

const num = (v: unknown, max = 1e9): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.floor(v) : null);
const word = (v: unknown): string | null => (typeof v === "string" && /^[a-z0-9_.-]{1,40}$/i.test(v) ? v : null);

function validateRow(raw: unknown, domain: string): HistoryRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const host = normaliseHost(r.host, domain);
  if (!host || !Array.isArray(r.sources)) return null;
  const sources = r.sources.map((s: unknown) => word(s)).filter((s: string | null): s is string => !!s).slice(0, 8);
  const row: HistoryRow = { host, sources };
  if (Array.isArray(r.ip)) row.ip = r.ip.filter((v: unknown): v is string => typeof v === "string" && v.length <= 45 && /^[0-9a-f:.]+$/i.test(v)).slice(0, 8);
  if (num(r.httpStatus, 999) !== null) row.httpStatus = num(r.httpStatus, 999)!;
  // eslint-disable-next-line no-control-regex
  if (typeof r.httpTitle === "string") row.httpTitle = r.httpTitle.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").slice(0, 120);
  if (Array.isArray(r.openPorts)) row.openPorts = r.openPorts.map((p: unknown) => num(p, 65535)).filter((p: number | null): p is number => p !== null && p > 0).slice(0, 20);
  if (r.isWildcard === true) row.isWildcard = true;
  return row;
}

/** A history entry read from disk, or null when it isn't valid. */
export function validateEntry(raw: unknown): HistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, any>;
  if (typeof e.id !== "string" || !/^[a-f0-9]{8,32}$/.test(e.id)) return null;
  const checked = validateTargetDomain(e.domain);
  if (!checked.ok) return null;
  if (typeof e.at !== "string" || Number.isNaN(Date.parse(e.at))) return null;
  if (e.state !== "done" && e.state !== "cancelled") return null;
  const c = e.counts ?? {};
  const counts = { hosts: num(c.hosts), live: num(c.live), http: num(c.http), withPorts: num(c.withPorts), wildcard: num(c.wildcard) };
  if (Object.values(counts).some((v) => v === null)) return null;
  const durationMs = num(e.durationMs, 1e10);
  if (durationMs === null || !Array.isArray(e.sources) || !e.steps || typeof e.steps !== "object") return null;
  const sources = e.sources.slice(0, 8).map((s: any) => (word(s?.id) && typeof s.state === "string" && num(s.count) !== null ? { id: word(s.id)!, state: String(s.state).slice(0, 20), count: num(s.count)! } : null)).filter((s: HistoryEntry["sources"][number] | null): s is HistoryEntry["sources"][number] => !!s);
  const ports = Array.isArray(e.steps.ports) ? e.steps.ports.map((p: unknown) => num(p, 65535)).filter((p: number | null): p is number => p !== null && p > 0).slice(0, 20) : [];
  const entry: HistoryEntry = {
    id: e.id, domain: checked.ascii, unicode: checked.unicode, at: new Date(e.at).toISOString(), state: e.state, durationMs,
    counts: counts as HistoryEntry["counts"], sources,
    steps: { resolve: e.steps.resolve === true, probeHttp: e.steps.probeHttp === true, ports, wildcard: e.steps.wildcard === true },
    truncated: e.truncated === true,
  };
  if (Array.isArray(e.results)) {
    entry.results = e.results.slice(0, MAX_KEPT_HOSTS).map((r: unknown) => validateRow(r, checked.ascii)).filter((r: HistoryRow | null): r is HistoryRow => !!r);
    if (e.resultsCut === true || e.results.length > MAX_KEPT_HOSTS) entry.resultsCut = true;
  }
  return entry;
}

const storeFile = (ctx: FmContext) => nodePath.join(ctx.dataDir, FILE_NAME);
let queue: Promise<unknown> = Promise.resolve();

export async function loadHistory(ctx: FmContext): Promise<HistoryEntry[]> {
  try {
    const parsed = JSON.parse(await fsp.readFile(storeFile(ctx), "utf8"));
    const list = Array.isArray(parsed?.history) ? parsed.history : [];
    return list.slice(0, MAX_HISTORY).map(validateEntry).filter((e: HistoryEntry | null): e is HistoryEntry => !!e);
  } catch {
    return [];
  }
}

async function writeHistory(ctx: FmContext, history: HistoryEntry[]): Promise<void> {
  await fsp.mkdir(ctx.dataDir, { recursive: true });
  const file = storeFile(ctx);
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify({ version: 1, history }), { mode: 0o600 });
  await fsp.rename(tmp, file);
}

/** Changes the list one request at a time, so two runs ending together can't lose each other's entry. */
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Adds an entry at the front (newest first) and drops the oldest beyond MAX_HISTORY. */
export function addHistory(ctx: FmContext, input: Omit<HistoryEntry, "id">): Promise<HistoryEntry | null> {
  return locked(async () => {
    const entry = validateEntry({ ...input, id: randomBytes(6).toString("hex") });
    if (!entry) return null;
    const all = await loadHistory(ctx);
    all.unshift(entry);
    await writeHistory(ctx, all.slice(0, MAX_HISTORY));
    return entry;
  });
}

export function clearHistory(ctx: FmContext): Promise<number> {
  return locked(async () => {
    const all = await loadHistory(ctx);
    await fsp.rm(storeFile(ctx), { force: true });
    return all.length;
  });
}

/** The entry without its stored hosts, for lists. */
export function briefEntry(entry: HistoryEntry): Omit<HistoryEntry, "results"> & { hasResults: boolean; keptHosts: number } {
  const { results, ...rest } = entry;
  return { ...rest, hasResults: !!results, keptHosts: results?.length ?? 0 };
}
