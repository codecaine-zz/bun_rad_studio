/**
 * The subdomain discovery engine used by the File Manager's Subdomains tab (and open to any other caller):
 *
 *   1. passive sources, all at once, each with its own time limit, status and count; one failing never fails the run;
 *   2. optional active steps, each off unless asked for: DNS lookups (with wildcard detection), HTTP/HTTPS probing
 *      (status and title) and TCP port probing.
 *
 * Everything outside the process is reached through `EngineDeps` (fetch, DNS, HTTP, TCP, clock, program start), so
 * tests run without a network. Every remote answer is treated as hostile: names are validated by strict rules and
 * kept only when they are inside the target domain, results are capped, and the HTTP and port steps refuse private
 * and internal addresses (checked on the address that is then connected to, and again after every redirect).
 */
import type { SubdomainResult } from "./subfinderTypes.ts";
import { extractTitle, normaliseHost } from "./subfinderNames.ts";
import {
  createPacer, nonPublicReason, realHttp, realResolve, realSleep, realTcp, sharedLimiter, type HttpClient, type Limiter,
} from "./subfinderNet.ts";
import { PASSIVE_SOURCES, SourceError, askSource, type FetchLike } from "./subfinderSources.ts";
import { runSubfinderProgram, type SpawnLike } from "./subfinderProgram.ts";

export interface DiscoveryOptions {
  /** Source ids: crtsh, hackertarget, alienvault, anubis, subfinder. */
  sources: string[];
  /** Look each host up in DNS (needed by the HTTP and port steps). */
  resolve: boolean;
  probeHttp: boolean;
  ports: number[];
  wildcard: boolean;
  /** Time limit for each source, in milliseconds. */
  timeoutMs: number;
  maxResults: number;
  dnsConcurrency: number;
  httpConcurrency: number;
  portConcurrency: number;
  /** Least time between two requests to the same host. */
  rateLimitMs: number;
  /** Allow HTTP and port probing of private, loopback and other internal addresses. */
  allowPrivate: boolean;
  /** Verify HTTPS certificates. */
  verifyTls: boolean;
  /** Where the real subfinder program is, when it should be used. */
  programPath?: string | null;
}

export const ENGINE_LIMITS = {
  maxDnsConcurrency: 10,
  maxHttpConcurrency: 5,
  maxPortConcurrency: 10,
  maxRedirects: 3,
  maxIpsPerHost: 8,
  maxResultsCeiling: 10_000,
} as const;

export const DEFAULT_OPTIONS: DiscoveryOptions = {
  sources: ["crtsh", "hackertarget", "alienvault", "anubis"],
  resolve: false, probeHttp: false, ports: [], wildcard: false,
  timeoutMs: 15_000, maxResults: 2000,
  dnsConcurrency: 8, httpConcurrency: 4, portConcurrency: 8,
  rateLimitMs: 250, allowPrivate: false, verifyTls: true,
};

export interface EngineDeps {
  fetch: FetchLike;
  resolve(host: string, o: { timeoutMs: number; signal?: AbortSignal }): Promise<string[]>;
  http: HttpClient;
  tcp(ip: string, port: number, timeoutMs: number, signal?: AbortSignal): Promise<boolean>;
  spawn?: SpawnLike;
  env?: Record<string, string | undefined>;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  random(): number;
  /** Shared by every run so the whole program stays within one cap on simultaneous lookups and connections. */
  limiter: Limiter;
}

export function defaultDeps(): EngineDeps {
  return {
    fetch: (url, init) => fetch(url, init),
    resolve: realResolve, http: realHttp, tcp: realTcp,
    now: () => Date.now(), sleep: realSleep, random: Math.random, limiter: sharedLimiter,
  };
}

export type SourceState = "waiting" | "running" | "done" | "failed" | "timeout" | "cancelled";

export interface SourceStatus {
  id: string;
  label: string;
  state: SourceState;
  /** Hosts inside the target domain that this source gave. */
  count: number;
  /** Names the source gave that were refused (another domain, or not a valid host name). */
  dropped: number;
  error?: string;
  note?: string;
  ms: number;
}

export interface PhaseInfo { phase: "sources" | "dns" | "http" | "ports"; done: number; total: number }

export interface EngineHooks {
  onSource?(status: SourceStatus): void;
  onRow?(row: SubdomainResult): void;
  onPhase?(info: PhaseInfo): void;
  log?(level: "info" | "ok" | "warn" | "error", text: string): void;
}

export interface DiscoverySummary {
  state: "done" | "cancelled";
  hosts: number;
  truncated: boolean;
  wildcard: { tested: boolean; detected: boolean; ips: string[] };
  dnsFailures: number;
  /** Hosts that were not probed because they point at a private or internal address. */
  blocked: number;
  durationMs: number;
}

const yieldNow = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Runs `fn` over `items` with at most `concurrency` at once, and stops starting new ones when `signal` aborts. */
async function pool<T>(items: T[], concurrency: number, signal: AbortSignal, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (!signal.aborted) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
}

const ipv4First = (ips: string[]) => [...ips].sort((a, b) => Number(a.includes(":")) - Number(b.includes(":")));

export async function runDiscovery(domain: string, options: DiscoveryOptions, deps: EngineDeps, hooks: EngineHooks, signal: AbortSignal): Promise<DiscoverySummary> {
  const started = deps.now();
  const log = hooks.log ?? (() => {});
  const table = new Map<string, SubdomainResult>();
  const summary: DiscoverySummary = { state: "done", hosts: 0, truncated: false, wildcard: { tested: false, detected: false, ips: [] }, dnsFailures: 0, blocked: 0, durationMs: 0 };
  const pacer = createPacer(options.rateLimitMs, deps.now, deps.sleep);
  const dnsTimeout = Math.min(options.timeoutMs, 5000);

  const touch = (row: SubdomainResult) => hooks.onRow?.(row);
  const addNote = (row: SubdomainResult, text: string) => {
    if (!row.note?.includes(text)) row.note = [row.note, text].filter(Boolean).join(" ").slice(0, 300);
  };

  // ---- 1. passive sources -------------------------------------------------------------------------------------
  const labels = new Map<string, string>([["subfinder", "subfinder program"], ...PASSIVE_SOURCES.map((s) => [s.id, s.label] as [string, string])]);
  const statuses = new Map<string, SourceStatus>(options.sources.map((id) => [id, { id, label: labels.get(id) ?? id, state: "waiting", count: 0, dropped: 0, ms: 0 }]));
  for (const s of statuses.values()) hooks.onSource?.({ ...s });
  let sourcesDone = 0;
  hooks.onPhase?.({ phase: "sources", done: 0, total: statuses.size });

  const addHost = (host: string, source: string): boolean => {
    const existing = table.get(host);
    if (existing) {
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
        touch(existing);
      }
      return true;
    }
    if (table.size >= options.maxResults) {
      summary.truncated = true;
      return false;
    }
    const row: SubdomainResult = { host, sources: [source] };
    table.set(host, row);
    touch(row);
    return true;
  };

  async function runSource(status: SourceStatus): Promise<void> {
    const t0 = deps.now();
    status.state = "running";
    hooks.onSource?.({ ...status });
    try {
      let names: string[];
      if (status.id === "subfinder") {
        if (!options.programPath) throw new SourceError("program", "The subfinder program isn't installed here. To get it: brew install subfinder (or see projectdiscovery.io).");
        // The program prints at the end and stops itself after `-max-time 1` (a minute), so our own limit is a little longer than that.
        const run = await runSubfinderProgram(options.programPath, domain, { timeoutMs: Math.min(Math.max(options.timeoutMs * 4, 90_000), 120_000), timeoutSec: Math.ceil(options.timeoutMs / 1000), signal, spawn: deps.spawn, env: deps.env });
        names = run.names;
        if (run.note) status.note = run.note;
      } else {
        const def = PASSIVE_SOURCES.find((s) => s.id === status.id)!;
        names = await askSource(def, domain, { fetch: deps.fetch, timeoutMs: options.timeoutMs, signal });
      }
      const seen = new Set<string>();
      for (let i = 0; i < names.length; i++) {
        if (i % 5000 === 4999) await yieldNow();
        if (signal.aborted) throw new SourceError("cancelled", "Cancelled.");
        const host = normaliseHost(names[i], domain);
        if (!host) {
          status.dropped++;
          continue;
        }
        if (seen.has(host)) continue;
        if (!addHost(host, status.id)) {
          status.note = `${status.note ? `${status.note} ` : ""}Stopped at the limit of ${options.maxResults} hosts.`;
          break;
        }
        seen.add(host);
      }
      status.count = seen.size;
      status.state = "done";
      log("ok", `${status.label}: ${seen.size} host${seen.size === 1 ? "" : "s"}${status.dropped ? `, ${status.dropped} other name${status.dropped === 1 ? "" : "s"} ignored` : ""}.`);
    } catch (err) {
      const e = err instanceof SourceError ? err : new SourceError("network", `${status.label} failed unexpectedly.`);
      status.state = e.code === "timeout" ? "timeout" : e.code === "cancelled" ? "cancelled" : "failed";
      status.error = e.message;
      if (e.code !== "cancelled") log("warn", e.message);
    } finally {
      status.ms = Math.max(0, deps.now() - t0);
      hooks.onSource?.({ ...status });
      hooks.onPhase?.({ phase: "sources", done: ++sourcesDone, total: statuses.size });
    }
  }

  log("info", `Asking ${statuses.size} source${statuses.size === 1 ? "" : "s"} about ${domain}...`);
  await Promise.all([...statuses.values()].map(runSource));

  // ---- 2. active steps ----------------------------------------------------------------------------------------
  const active = options.resolve || options.probeHttp || options.ports.length > 0;
  if (active && !signal.aborted) {
    const rows = () => [...table.values()];
    const lookup = async (host: string, what = "dns"): Promise<string[] | undefined> => {
      try {
        const ips = await deps.limiter.run(() => deps.resolve(host, { timeoutMs: dnsTimeout, signal }), signal);
        return ips === undefined ? undefined : [...new Set(ips)];
      } catch (err) {
        if (!signal.aborted) {
          summary.dnsFailures++;
          if (summary.dnsFailures <= 3) log("warn", `Couldn't look up ${host} (${(err as NodeJS.ErrnoException)?.code ?? what}).`);
        }
        return undefined;
      }
    };

    // wildcard detection: names nobody could have made up
    let wildcardIps = new Set<string>();
    if (options.wildcard && !signal.aborted) {
      summary.wildcard.tested = true;
      const answers: string[][] = [];
      for (let i = 0; i < 3 && !signal.aborted; i++) {
        const label = `wc-${Math.floor(deps.random() * 36 ** 9).toString(36).padStart(9, "0")}`;
        const ips = await lookup(`${label}.${domain}`);
        if (ips && ips.length) answers.push(ips);
      }
      wildcardIps = new Set(answers.flat());
      summary.wildcard.detected = answers.length > 0;
      summary.wildcard.ips = [...wildcardIps].sort();
      log(answers.length ? "warn" : "ok", answers.length ? `${domain} answers for names that can't exist (a wildcard): ${summary.wildcard.ips.join(", ")}. Matching hosts are marked.` : `No wildcard DNS found for ${domain}.`);
    }

    if (options.resolve && !signal.aborted) {
      const list = rows();
      hooks.onPhase?.({ phase: "dns", done: 0, total: list.length });
      log("info", `Looking up ${list.length} host${list.length === 1 ? "" : "s"} in DNS (up to ${options.dnsConcurrency} at a time)...`);
      let done = 0;
      await pool(list, options.dnsConcurrency, signal, async (row) => {
        const ips = await lookup(row.host);
        if (ips !== undefined) {
          row.ip = ipv4First(ips).slice(0, ENGINE_LIMITS.maxIpsPerHost);
          if (wildcardIps.size > 0 && ips.length > 0 && ips.every((ip) => wildcardIps.has(ip))) row.isWildcard = true;
          if (!options.allowPrivate) {
            const internal = ips.map((ip) => ({ ip, why: nonPublicReason(ip) })).find((x) => x.why);
            if (internal) {
              summary.blocked++;
              addNote(row, `Points to ${internal.why}, so it is not probed.`);
            }
          }
          touch(row);
        }
        hooks.onPhase?.({ phase: "dns", done: ++done, total: list.length });
      });
    }

    const eligible = () => rows().filter((r) => r.ip && r.ip.length > 0 && (options.allowPrivate || r.ip.every((ip) => !nonPublicReason(ip))));

    // ---- HTTP / HTTPS ----
    if (options.probeHttp && !signal.aborted) {
      const list = eligible();
      hooks.onPhase?.({ phase: "http", done: 0, total: list.length });
      log("info", `Checking ${list.length} host${list.length === 1 ? "" : "s"} over HTTPS and HTTP (up to ${options.httpConcurrency} at a time)...`);
      let done = 0;
      await pool(list, options.httpConcurrency, signal, async (row) => {
        await probeOne(row);
        hooks.onPhase?.({ phase: "http", done: ++done, total: list.length });
      });
    }

    // ---- ports ----
    if (options.ports.length > 0 && !signal.aborted) {
      const list = eligible();
      hooks.onPhase?.({ phase: "ports", done: 0, total: list.length });
      log("info", `Checking ports ${options.ports.join(", ")} on ${list.length} host${list.length === 1 ? "" : "s"}...`);
      let done = 0;
      await pool(list, options.portConcurrency, signal, async (row) => {
        const ip = ipv4First(row.ip!)[0]!;
        const open: number[] = [];
        for (const port of options.ports) {
          if (signal.aborted) break;
          await pacer.wait(`${row.host}|tcp`, signal);
          const reachable = await deps.limiter.run(() => deps.tcp(ip, port, Math.min(options.timeoutMs, 3000), signal), signal);
          if (reachable) open.push(port);
        }
        if (!signal.aborted) {
          row.openPorts = open;
          touch(row);
        }
        hooks.onPhase?.({ phase: "ports", done: ++done, total: list.length });
      });
    }
  }

  /** Looks `host` up again and returns an address that is safe to connect to, or the reason it isn't. */
  async function safeAddress(host: string): Promise<{ ip: string } | { blocked: string } | { none: true }> {
    const ips = await (async () => {
      try {
        const got = await deps.limiter.run(() => deps.resolve(host, { timeoutMs: dnsTimeout, signal }), signal);
        return got === undefined ? undefined : [...new Set(got)];
      } catch {
        return undefined;
      }
    })();
    if (!ips || ips.length === 0) return { none: true };
    if (!options.allowPrivate) {
      for (const ip of ips) {
        const why = nonPublicReason(ip);
        if (why) return { blocked: `${host} points to ${why}` };
      }
    }
    return { ip: ipv4First(ips)[0]! };
  }

  async function fetchFollowing(startHost: string, startScheme: "https" | "http", row: SubdomainResult): Promise<{ status: number; title: string; scheme: "https" | "http"; note?: string } | { error: string } | null> {
    let host = startHost;
    let scheme = startScheme;
    for (let hop = 0; hop <= ENGINE_LIMITS.maxRedirects; hop++) {
      if (signal.aborted) return null;
      const where = await safeAddress(host);
      if ("none" in where) return { error: `${host} has no address any more.` };
      if ("blocked" in where) {
        summary.blocked++;
        return { error: hop === 0 ? `Not probed: ${where.blocked}.` : `Stopped: a redirect led to ${where.blocked}, so it was not followed.` };
      }
      await pacer.wait(host, signal);
      if (signal.aborted) return null;
      const port = scheme === "https" ? 443 : 80;
      let answer;
      try {
        answer = await deps.limiter.run(() => deps.http({ scheme, host, ip: where.ip, port, timeoutMs: Math.min(options.timeoutMs, 8000), signal, verifyTls: options.verifyTls }), signal);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code;
        return { error: code === "CERT" ? "The HTTPS certificate isn't trusted." : "" };
      }
      if (!answer) return null;
      const redirect = [301, 302, 303, 307, 308].includes(answer.status) && answer.location;
      if (!redirect) return { status: answer.status, title: extractTitle(answer.body), scheme };
      if (hop === ENGINE_LIMITS.maxRedirects) return { status: answer.status, title: "", scheme, note: `More than ${ENGINE_LIMITS.maxRedirects} redirects; the rest were not followed.` };
      let target: URL;
      try {
        target = new URL(answer.location!, `${scheme}://${host}/`);
      } catch {
        return { status: answer.status, title: "", scheme, note: "It redirects to an address that couldn't be read." };
      }
      const targetHost = normaliseHost(target.hostname, domain);
      const stop = (why: string) => ({ status: answer.status, title: "", scheme, note: `Redirects to ${target.hostname.slice(0, 80)} (${why}).` });
      if (target.protocol !== "https:" && target.protocol !== "http:") return stop("not a web address, not followed");
      if (target.username || target.password || target.port) return stop("not followed");
      if (!targetHost) return stop("another site, not followed");
      if (scheme === "https" && target.protocol === "http:") return stop("a downgrade to plain HTTP, not followed");
      host = targetHost;
      scheme = target.protocol === "https:" ? "https" : "http";
      if (targetHost !== row.host) addNote(row, `Redirects to ${targetHost}.`);
    }
    return null;
  }

  async function probeOne(row: SubdomainResult): Promise<void> {
    const reasons: string[] = [];
    for (const scheme of ["https", "http"] as const) {
      const res = await fetchFollowing(row.host, scheme, row);
      if (signal.aborted || res === null) return;
      if ("error" in res) {
        if (res.error) reasons.push(res.error);
        if (res.error.startsWith("Not probed") || res.error.startsWith("Stopped")) break;
        continue;
      }
      row.httpStatus = res.status;
      row.httpScheme = res.scheme;
      if (res.title) row.httpTitle = res.title;
      if (res.note) addNote(row, res.note);
      for (const r of new Set(reasons)) addNote(row, r);
      touch(row);
      return;
    }
    if (reasons.length) {
      for (const r of new Set(reasons)) addNote(row, r);
      touch(row);
    }
  }

  summary.hosts = table.size;
  summary.durationMs = Math.max(0, deps.now() - started);
  summary.state = signal.aborted ? "cancelled" : "done";
  return summary;
}
