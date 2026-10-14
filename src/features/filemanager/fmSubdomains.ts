/**
 * Running subdomain discovery for the File Manager: input checking, the registry of runs (one per tab, two in all),
 * progress for the page to poll, the optional `subfinder` program, and cleaning up. The discovery itself is the
 * engine in src/features/subfinder; this file is the safety layer around it.
 */
import { statSync } from "node:fs";
import type { FmContext } from "./fmCore";
import { FmError } from "./fmPaths";
import { capture } from "./fmToolDetect";
import { childEnv, findExecutable, searchDirs } from "./fmTools";
import { subdomainDeps } from "./fmSubdomainsHooks";
import { addHistory, MAX_KEPT_HOSTS, type HistoryEntry } from "./fmSubdomainsStore";
import type { RunMeta } from "./fmSubdomainsExport";
import { validateTargetDomain, parsePortList, MAX_PORTS } from "../subfinder/subfinderNames";
import { DEFAULT_OPTIONS, ENGINE_LIMITS, runDiscovery, type DiscoveryOptions, type DiscoverySummary, type PhaseInfo, type SourceStatus } from "../subfinder/subfinderEngine";
import { PASSIVE_SOURCES } from "../subfinder/subfinderSources";
import type { SubdomainResult } from "../subfinder/subfinderTypes";

export const SUB_LIMITS = {
  maxRuns: 2,
  maxFinished: 6,
  finishedTtlMs: 30 * 60_000,
  /** A whole run is stopped after this long, whatever is left. */
  maxRunMs: 20 * 60_000,
  maxLog: 300,
  pollRows: 3000,
  minTimeoutSec: 3,
  maxTimeoutSec: 60,
  maxResults: ENGINE_LIMITS.maxResultsCeiling,
} as const;

export interface ProgramInfo { installed: boolean; path: string | null; version: string | null; hint: string }

const versionCache = new Map<string, { text: string; code: number | null }>();

function fileKey(path: string): string {
  try {
    return `${path}|${statSync(path).mtimeMs}`;
  } catch {
    return path;
  }
}

/** Is the real `subfinder` program here? Found like the other helper programs (the PATH and the usual install places), then asked for its version. */
export async function detectProgram(ctx: FmContext): Promise<ProgramInfo> {
  const hint = ctx.platform === "win32"
    ? "go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest (see projectdiscovery.io)"
    : "brew install subfinder";
  const path = findExecutable(ctx.platform, ["subfinder"], searchDirs(ctx));
  if (!path) return { installed: false, path: null, version: null, hint };
  const key = fileKey(path);
  let v = versionCache.get(key);
  if (!v) {
    const asked = await capture([path, "-version"], childEnv(ctx), 15000);
    if (asked.code !== null) versionCache.set(key, v = asked);
    else v = asked;
  }
  // A program with the same name might be something else.
  if (!/subfinder|projectdiscovery/i.test(v.text)) return { installed: false, path: null, version: null, hint };
  const version = /v?(\d+\.\d+(?:\.\d+)*)/.exec(v.text.split(/\r?\n/).find((l) => /version/i.test(l)) ?? v.text)?.[1] ?? null;
  return { installed: true, path, version, hint };
}

// ---------------------------------------------------------------------------------------------------------------
// Checking a request
// ---------------------------------------------------------------------------------------------------------------

export interface StartRequest {
  domain: { ascii: string; unicode: string };
  options: DiscoveryOptions;
  keepResults: boolean;
  permission: boolean;
  client: string;
}

function intOption(raw: unknown, name: string, min: number, max: number, fallback: number): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d{1,9}$/.test(raw.trim()) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new FmError("BAD_OPTION", `${name} must be a whole number from ${min} to ${max}.`);
  return n;
}

function boolOption(raw: unknown, name: string): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw !== "boolean") throw new FmError("BAD_OPTION", `${name} must be on or off.`);
  return raw;
}

export const isActive = (o: Pick<DiscoveryOptions, "resolve" | "probeHttp" | "ports" | "wildcard">) => o.resolve || o.probeHttp || o.ports.length > 0 || o.wildcard;

/** Turns a request body into checked settings, or throws a plain-words FmError. `program` is where subfinder is, if it is installed. */
export function parseStart(b: Record<string, any>, program: ProgramInfo): StartRequest {
  const checked = validateTargetDomain(b.domain);
  if (!checked.ok) throw new FmError("BAD_DOMAIN", checked.reason);
  const raw = b.options === undefined || b.options === null ? {} : b.options;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new FmError("BAD_OPTION", "The options must be an object.");
  const o = raw as Record<string, any>;

  let sources = DEFAULT_OPTIONS.sources;
  if (o.sources !== undefined) {
    if (!Array.isArray(o.sources) || o.sources.length > 10) throw new FmError("BAD_SOURCES", "Choose sources from the list.");
    const known = new Set([...PASSIVE_SOURCES.map((s) => s.id), "subfinder"]);
    for (const s of o.sources) if (typeof s !== "string" || !known.has(s)) throw new FmError("BAD_SOURCES", `"${String(s).slice(0, 30)}" isn't a source this tool knows.`);
    sources = [...new Set<string>(o.sources)];
  }
  if (sources.length === 0) throw new FmError("NO_SOURCES", "Tick at least one source to ask.");
  if (sources.includes("subfinder") && !program.installed) throw new FmError("NO_PROGRAM", `The subfinder program isn't installed. To get it: ${program.hint}`);

  const resolve = boolOption(o.resolve, "Resolve DNS");
  const probeHttp = boolOption(o.probeHttp, "Probe HTTP/HTTPS");
  const probePorts = boolOption(o.probePorts, "Probe ports");
  const wildcard = boolOption(o.wildcard, "Detect wildcard DNS");
  const portList = parsePortList(o.ports);
  if (!portList.ok) throw new FmError("BAD_PORTS", portList.reason);
  if (probePorts && portList.ports.length === 0) throw new FmError("BAD_PORTS", `Type the ports to probe, like 80,443 (at most ${MAX_PORTS}).`);
  if ((probeHttp || probePorts || wildcard) && !resolve) throw new FmError("NEEDS_DNS", "Probing and the wildcard check use the addresses DNS finds, so turn on \"Resolve DNS\" too.");

  const options: DiscoveryOptions = {
    sources, resolve, probeHttp, ports: probePorts ? portList.ports : [], wildcard,
    timeoutMs: intOption(o.timeoutSec, "The time limit per source", SUB_LIMITS.minTimeoutSec, SUB_LIMITS.maxTimeoutSec, DEFAULT_OPTIONS.timeoutMs / 1000) * 1000,
    maxResults: intOption(o.maxResults, "The most results to keep", 1, SUB_LIMITS.maxResults, DEFAULT_OPTIONS.maxResults),
    dnsConcurrency: intOption(o.dnsConcurrency, "The number of DNS lookups at once", 1, ENGINE_LIMITS.maxDnsConcurrency, DEFAULT_OPTIONS.dnsConcurrency),
    httpConcurrency: intOption(o.httpConcurrency, "The number of web checks at once", 1, ENGINE_LIMITS.maxHttpConcurrency, DEFAULT_OPTIONS.httpConcurrency),
    portConcurrency: DEFAULT_OPTIONS.portConcurrency,
    rateLimitMs: intOption(o.rateLimitMs, "The pause between requests to one host", 100, 5000, DEFAULT_OPTIONS.rateLimitMs),
    allowPrivate: false, verifyTls: !boolOption(o.acceptUntrustedTls, "Accept untrusted certificates"),
    programPath: sources.includes("subfinder") ? program.path : null,
  };
  const privateAllowed = boolOption(o.allowPrivate, "Allow private addresses");
  options.allowPrivate = privateAllowed && isActive(options);

  const client = typeof b.client === "string" && /^[a-z0-9_-]{1,40}$/i.test(b.client) ? b.client : "default";
  if (b.client !== undefined && client === "default" && b.client !== "default") throw new FmError("BAD_REQUEST", "That tab name isn't valid.");
  return { domain: checked, options, keepResults: boolOption(o.keepResults, "Keep results"), permission: b.permission === true, client };
}

// ---------------------------------------------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------------------------------------------

export interface LogLine { at: number; level: "info" | "ok" | "warn" | "error"; text: string }

export interface Run {
  id: string;
  client: string;
  domain: { ascii: string; unicode: string };
  options: DiscoveryOptions;
  keepResults: boolean;
  state: "running" | "done" | "cancelled" | "error";
  startedAt: number;
  endedAt: number | null;
  sources: SourceStatus[];
  phase: PhaseInfo;
  rows: Map<string, SubdomainResult>;
  revs: Map<string, number>;
  rev: number;
  log: LogLine[];
  logCount: number;
  summary: DiscoverySummary | null;
  error: { code: string; message: string } | null;
  stoppedBy: "time-limit" | "cancelled" | null;
  abort: AbortController;
  finished: Promise<void>;
}

interface SubState {
  runs: Map<string, Run>;
  counter: number;
  /** Domains the person confirmed they may test, for this session only. */
  permitted: Set<string>;
  disposed: boolean;
}

const states = new WeakMap<FmContext, SubState>();

export function subState(ctx: FmContext): SubState {
  let state = states.get(ctx);
  if (state) return state;
  const created: SubState = { runs: new Map(), counter: 0, permitted: new Set(), disposed: false };
  state = created;
  states.set(ctx, created);
  ctx.disposers.push(() => {
    created.disposed = true;
    for (const run of created.runs.values()) if (run.state === "running") run.abort.abort();
  });
  return created;
}

function prune(state: SubState, now: number): void {
  const finished = [...state.runs.values()].filter((r) => r.state !== "running");
  for (const run of finished) if (run.endedAt !== null && now - run.endedAt > SUB_LIMITS.finishedTtlMs) state.runs.delete(run.id);
  const left = [...state.runs.values()].filter((r) => r.state !== "running");
  for (const run of left.slice(0, Math.max(0, left.length - SUB_LIMITS.maxFinished))) state.runs.delete(run.id);
}

const pushLog = (run: Run, level: LogLine["level"], text: string) => {
  run.logCount++;
  run.log.push({ at: Date.now(), level, text: text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").slice(0, 300) });
  if (run.log.length > SUB_LIMITS.maxLog) run.log.splice(0, run.log.length - SUB_LIMITS.maxLog);
};

export function findRun(ctx: FmContext, id: unknown): Run {
  const run = typeof id === "string" ? subState(ctx).runs.get(id) : undefined;
  if (!run) throw new FmError("NO_RUN", "That run isn't there any more. Start a new one.");
  return run;
}

export function runCounts(rows: Iterable<SubdomainResult>) {
  let hosts = 0, live = 0, http = 0, withPorts = 0, wildcard = 0;
  for (const r of rows) {
    hosts++;
    if ((r.ip?.length ?? 0) > 0) live++;
    if (r.httpStatus !== undefined) http++;
    if ((r.openPorts?.length ?? 0) > 0) withPorts++;
    if (r.isWildcard) wildcard++;
  }
  return { hosts, live, http, withPorts, wildcard };
}

export function runMeta(run: Run): RunMeta {
  return {
    domain: run.domain.ascii, unicode: run.domain.unicode, startedAt: run.startedAt, endedAt: run.endedAt, state: run.state,
    steps: { resolve: run.options.resolve, probeHttp: run.options.probeHttp, ports: run.options.ports, wildcard: run.options.wildcard, allowPrivate: run.options.allowPrivate },
    sources: run.sources, summary: run.summary, maxResults: run.options.maxResults,
  };
}

const plainRow = (r: SubdomainResult) => ({
  host: r.host, sources: [...r.sources], ip: r.ip ? [...r.ip] : undefined, httpStatus: r.httpStatus, httpTitle: r.httpTitle, httpScheme: r.httpScheme,
  openPorts: r.openPorts ? [...r.openPorts] : undefined, isWildcard: r.isWildcard, note: r.note,
});

/** What the page needs to draw a run: state, per-source status, progress, counts and (when `since` is given) the rows that changed after it. */
export function snapshot(run: Run, query: { since?: number; logFrom?: number; withRows?: boolean } = {}) {
  const since = query.since ?? 0;
  const out: Record<string, unknown> = {
    id: run.id, client: run.client, domain: run.domain.ascii, unicode: run.domain.unicode, state: run.state, startedAt: run.startedAt, endedAt: run.endedAt,
    options: {
      sources: run.options.sources, resolve: run.options.resolve, probeHttp: run.options.probeHttp, ports: run.options.ports, wildcard: run.options.wildcard,
      timeoutSec: Math.round(run.options.timeoutMs / 1000), maxResults: run.options.maxResults, allowPrivate: run.options.allowPrivate, keepResults: run.keepResults, verifyTls: run.options.verifyTls,
    },
    sources: run.sources.map((s) => ({ ...s })), phase: run.phase, counts: runCounts(run.rows.values()),
    summary: run.summary, error: run.error, stoppedBy: run.stoppedBy,
    log: run.log.slice(Math.max(0, (query.logFrom ?? 0) - (run.logCount - run.log.length))), logCount: run.logCount,
  };
  if (query.withRows) {
    const changed: Array<[number, SubdomainResult]> = [];
    for (const [host, rev] of run.revs) if (rev > since) changed.push([rev, run.rows.get(host)!]);
    changed.sort((a, b) => a[0] - b[0]);
    const page = changed.slice(0, SUB_LIMITS.pollRows);
    out.rows = page.map(([, r]) => plainRow(r));
    out.rev = page.length < changed.length ? page[page.length - 1]![0] : run.rev;
    out.more = page.length < changed.length;
    out.total = run.rows.size;
  }
  return out;
}

/** Starts a run. The caller has checked the request with parseStart. */
export function startRun(ctx: FmContext, req: StartRequest): Run {
  const state = subState(ctx);
  if (state.disposed) throw new FmError("STOPPED", "The File Manager is closing.");
  prune(state, Date.now());
  const running = [...state.runs.values()].filter((r) => r.state === "running");
  if (running.some((r) => r.client === req.client)) throw new FmError("BUSY", "This tab already has a run in progress. Wait for it to finish or cancel it first.");
  if (running.length >= SUB_LIMITS.maxRuns) throw new FmError("BUSY", `${SUB_LIMITS.maxRuns} runs are already in progress. Wait for one to finish or cancel it first.`);
  if (isActive(req.options)) {
    if (!req.permission && !state.permitted.has(req.domain.ascii)) throw new FmError("PERMISSION_NEEDED", "DNS lookups and probing contact the target's own computers. Confirm that you own this domain or have permission to test it first.");
    state.permitted.add(req.domain.ascii);
  }
  const run: Run = {
    id: `s${++state.counter}`, client: req.client, domain: req.domain, options: req.options, keepResults: req.keepResults, state: "running", startedAt: Date.now(), endedAt: null,
    sources: [], phase: { phase: "sources", done: 0, total: req.options.sources.length }, rows: new Map(), revs: new Map(), rev: 0, log: [], logCount: 0,
    summary: null, error: null, stoppedBy: null, abort: new AbortController(), finished: Promise.resolve(),
  };
  state.runs.set(run.id, run);
  run.finished = execute(ctx, run).catch((err) => {
    run.error = { code: "UNKNOWN", message: `The run stopped unexpectedly: ${(err as Error)?.message ?? "unknown problem"}` };
    run.state = "error";
    run.endedAt = Date.now();
  });
  return run;
}

async function execute(ctx: FmContext, run: Run): Promise<void> {
  const deps = subdomainDeps(ctx);
  const cap = setTimeout(() => { run.stoppedBy = "time-limit"; run.abort.abort(); }, SUB_LIMITS.maxRunMs);
  cap.unref?.();
  const known = new Map<string, SourceStatus>();
  try {
    run.summary = await runDiscovery(run.domain.ascii, run.options, deps, {
      onSource(status) {
        known.set(status.id, status);
        run.sources = [...known.values()];
      },
      onRow(row) {
        run.rows.set(row.host, row);
        run.revs.set(row.host, ++run.rev);
      },
      onPhase(info) { run.phase = info; },
      log(level, text) { pushLog(run, level, text); },
    }, run.abort.signal);
  } finally {
    clearTimeout(cap);
  }
  if (run.stoppedBy === "time-limit") pushLog(run, "warn", `Stopped after ${SUB_LIMITS.maxRunMs / 60_000} minutes (the time limit). What was found so far is kept.`);
  else if (run.summary?.state === "cancelled") run.stoppedBy = "cancelled";
  // The history is written before the run is reported as finished, so a page that sees "done" also sees its entry.
  try {
    await addHistory(ctx, historyOf(run));
  } catch (err) {
    pushLog(run, "warn", "The run couldn't be added to the history.");
  }
  run.state = run.stoppedBy === "cancelled" ? "cancelled" : "done";
  run.endedAt = Date.now();
  pushLog(run, run.state === "done" ? "ok" : "warn", run.state === "done" ? `Done: ${run.rows.size} host${run.rows.size === 1 ? "" : "s"}.` : `Cancelled with ${run.rows.size} host${run.rows.size === 1 ? "" : "s"} found so far.`);
}

function historyOf(run: Run): Omit<HistoryEntry, "id"> {
  const counts = runCounts(run.rows.values());
  const entry: Omit<HistoryEntry, "id"> = {
    domain: run.domain.ascii, unicode: run.domain.unicode, at: new Date(run.startedAt).toISOString(), state: run.stoppedBy === "cancelled" ? "cancelled" : "done",
    durationMs: run.summary?.durationMs ?? 0, counts,
    sources: run.sources.map((s) => ({ id: s.id, state: s.state, count: s.count })),
    steps: { resolve: run.options.resolve, probeHttp: run.options.probeHttp, ports: run.options.ports, wildcard: run.options.wildcard },
    truncated: run.summary?.truncated === true,
  };
  if (run.keepResults) {
    const rows = [...run.rows.values()];
    entry.results = rows.slice(0, MAX_KEPT_HOSTS).map((r) => ({ host: r.host, sources: r.sources, ip: r.ip, httpStatus: r.httpStatus, httpTitle: r.httpTitle, openPorts: r.openPorts, isWildcard: r.isWildcard }));
    if (rows.length > MAX_KEPT_HOSTS) entry.resultsCut = true;
  }
  return entry;
}

/** Stops a run. Returns false when it was not running. */
export function cancelRun(run: Run): boolean {
  if (run.state !== "running") return false;
  run.abort.abort();
  return true;
}

export function cancelClient(ctx: FmContext, client: string): number {
  let n = 0;
  for (const run of subState(ctx).runs.values()) if (run.client === client && cancelRun(run)) n++;
  return n;
}
