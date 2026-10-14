/**
 * API operations of the "Subdomains" power tool, all named `subdomains/...`:
 *
 *   subdomains/info           {}                                -> tools (the subfinder program), sources, defaults, limits, public-suffix help
 *   subdomains/start          {domain, options, permission?, client?} -> {run}   (background; one per tab, two in all)
 *   subdomains/status         {id, since?, logFrom?}            -> {run}  state, per-source status, progress, counts, changed rows
 *   subdomains/results        {id, since?}                      -> {rows, rev, more, total}
 *   subdomains/cancel         {id? | client?}                   -> {cancelled}
 *   subdomains/export         {id, format, folder, name?, onlyLive?, hosts?} -> a NEW file (txt | csv | json)
 *   subdomains/report         {id, folder, name?}               -> a NEW Markdown report
 *   subdomains/open           {id, host, scheme?}               -> opens a host of that run in the web browser
 *   subdomains/history        {id?}                             -> recent runs, or one run with its kept hosts
 *   subdomains/history/clear  {}                                -> {cleared}
 */
import { openCommand } from "./fmOpen";
import type { FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";
import { cancelClient, cancelRun, detectProgram, findRun, parseStart, runMeta, snapshot, startRun, SUB_LIMITS } from "./fmSubdomains";
import { renderExport, toReport, writeNewFile, type ExportFormat } from "./fmSubdomainsExport";
import { briefEntry, clearHistory, loadHistory, MAX_HISTORY, MAX_KEPT_HOSTS } from "./fmSubdomainsStore";
import { DEFAULT_OPTIONS, ENGINE_LIMITS } from "../subfinder/subfinderEngine";
import { MAX_PORTS, normaliseHost } from "../subfinder/subfinderNames";
import { PASSIVE_SOURCES } from "../subfinder/subfinderSources";
import type { SubdomainResult } from "../subfinder/subfinderTypes";

const sinceOf = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

const FORMATS: Record<ExportFormat, { ext: string; label: string }> = {
  txt: { ext: ".txt", label: "hosts" },
  csv: { ext: ".csv", label: "subdomains" },
  json: { ext: ".json", label: "subdomains" },
};

export const subdomainOperations: Record<string, FmHandler> = {
  async "subdomains/info"(ctx) {
    const program = await detectProgram(ctx);
    return {
      tools: { subfinder: program },
      sources: [
        ...PASSIVE_SOURCES.map((s) => ({ id: s.id, label: s.label, note: s.note })),
        { id: "subfinder", label: "subfinder program", note: "The real subfinder command-line program, if it is installed. It asks many more public sources." },
      ],
      defaults: {
        sources: DEFAULT_OPTIONS.sources, timeoutSec: DEFAULT_OPTIONS.timeoutMs / 1000, maxResults: DEFAULT_OPTIONS.maxResults, ports: "80,443",
        dnsConcurrency: DEFAULT_OPTIONS.dnsConcurrency, httpConcurrency: DEFAULT_OPTIONS.httpConcurrency, rateLimitMs: DEFAULT_OPTIONS.rateLimitMs,
      },
      limits: {
        maxPorts: MAX_PORTS, minTimeoutSec: SUB_LIMITS.minTimeoutSec, maxTimeoutSec: SUB_LIMITS.maxTimeoutSec, maxResults: SUB_LIMITS.maxResults,
        maxDnsConcurrency: ENGINE_LIMITS.maxDnsConcurrency, maxHttpConcurrency: ENGINE_LIMITS.maxHttpConcurrency, maxRedirects: ENGINE_LIMITS.maxRedirects,
        maxRuns: SUB_LIMITS.maxRuns, maxRunMinutes: SUB_LIMITS.maxRunMs / 60_000, maxHistory: MAX_HISTORY, maxKeptHosts: MAX_KEPT_HOSTS,
      },
      publicSuffix: { examples: ["com", "localhost", "co.uk"], help: "Type a name you can own, like example.com or example.co.uk, not a shared ending like com or co.uk." },
    };
  },

  async "subdomains/start"(ctx, b) {
    const program = Array.isArray(b.options?.sources) && b.options.sources.includes("subfinder") ? await detectProgram(ctx) : { installed: false, path: null, version: null, hint: "brew install subfinder" };
    const req = parseStart(b, program);
    const run = startRun(ctx, req);
    return { run: snapshot(run, { withRows: false }) };
  },

  async "subdomains/status"(ctx, b) {
    const run = findRun(ctx, b.id);
    const withRows = b.since !== undefined;
    return { run: snapshot(run, { since: sinceOf(b.since), logFrom: sinceOf(b.logFrom), withRows }) };
  },

  async "subdomains/results"(ctx, b) {
    const run = findRun(ctx, b.id);
    const snap = snapshot(run, { since: sinceOf(b.since), withRows: true });
    return { rows: snap.rows, rev: snap.rev, more: snap.more, total: snap.total, state: run.state };
  },

  async "subdomains/cancel"(ctx, b) {
    if (b.id !== undefined) return { cancelled: cancelRun(findRun(ctx, b.id)) ? 1 : 0 };
    return { cancelled: cancelClient(ctx, typeof b.client === "string" ? b.client : "default") };
  },

  async "subdomains/export"(ctx, b) {
    const run = findRun(ctx, b.id);
    const format = b.format as ExportFormat;
    if (!Object.prototype.hasOwnProperty.call(FORMATS, format)) throw new FmError("BAD_FORMAT", "Choose a text (.txt), spreadsheet (.csv) or JSON (.json) file.");
    let rows: SubdomainResult[] = [...run.rows.values()];
    if (b.hosts !== undefined) {
      if (!Array.isArray(b.hosts) || b.hosts.length > SUB_LIMITS.maxResults) throw new FmError("BAD_REQUEST", "That list of hosts isn't valid.");
      const wanted = new Set<string>();
      for (const h of b.hosts) if (typeof h === "string") wanted.add(h);
      rows = rows.filter((r) => wanted.has(r.host));
    }
    if (b.onlyLive === true) rows = rows.filter((r) => (r.ip?.length ?? 0) > 0);
    if (rows.length === 0) throw new FmError("NO_RESULTS", "There is nothing to export yet.");
    const spec = FORMATS[format];
    const saved = await writeNewFile(ctx, b.folder, b.name, `${run.domain.ascii} ${spec.label}${spec.ext}`, spec.ext, renderExport(format, runMeta(run), rows));
    return { ...saved, count: rows.length };
  },

  async "subdomains/report"(ctx, b) {
    const run = findRun(ctx, b.id);
    const rows = [...run.rows.values()];
    const saved = await writeNewFile(ctx, b.folder, b.name, `${run.domain.ascii} subdomain report.md`, ".md", toReport(runMeta(run), rows));
    return { ...saved, count: rows.length };
  },

  async "subdomains/open"(ctx, b) {
    const run = findRun(ctx, b.id);
    const host = normaliseHost(b.host, run.domain.ascii);
    if (!host || !run.rows.has(host)) throw new FmError("NO_HOST", "That host isn't in this run's results.");
    const scheme = b.scheme === undefined ? (run.rows.get(host)?.httpScheme ?? "https") : b.scheme;
    if (scheme !== "http" && scheme !== "https") throw new FmError("BAD_SCHEME", "Only http and https addresses can be opened.");
    const url = `${scheme}://${host}/`;
    const { command, args } = openCommand(ctx.platform, url);
    try {
      await ctx.launch(command, args);
    } catch (err: any) {
      throw new FmError("OPEN_FAILED", `Couldn't open your web browser: ${err?.message ?? err}. The address is ${url}`);
    }
    return { opened: url };
  },

  async "subdomains/history"(ctx, b) {
    const all = await loadHistory(ctx);
    if (b.id !== undefined) {
      const entry = all.find((e) => e.id === b.id);
      if (!entry) throw new FmError("NO_RUN", "That entry isn't in the history any more.");
      return { entry };
    }
    return { history: all.map(briefEntry), max: MAX_HISTORY };
  },

  async "subdomains/history/clear"(ctx) {
    return { cleared: await clearHistory(ctx) };
  },
};
