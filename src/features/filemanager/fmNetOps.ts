/**
 * API operations of the "Network" power tool, all named `net/...`:
 *
 *   net/presets   {}                                         -> presets, top ports, limits, this computer's connections
 *   net/probe     {host, port?, scheme?, method?, timeoutMs?} -> HTTP check (status, timings, headers; redirects are reported, not followed)
 *   net/scan      {host, mode, port?, ports?, timeoutMs?, concurrency?} -> {task}   (background; mode: single | top | list)
 *   net/tcpping   {host, port?, count?, timeoutMs?}          -> {task}               (background)
 *   net/status    {id?, logFrom?, resultFrom?}               -> {task, tasks, running} progress of one task, or all
 *   net/cancel    {id?}                                      -> {cancelled}
 *   net/dns       {host, type}                               -> one lookup, or type "ALL" for the full audit
 *   net/tls       {host, port?, timeoutMs?}                  -> certificate details
 *   net/activity  {since?}                                   -> the connection audit table
 *   net/clear     {}                                         -> forget finished tasks and the audit table
 *   net/save      {folder, text? | taskId + format "csv", name?} -> a NEW file, never an overwrite
 */
import { promises as fsp } from "node:fs";
import { networkInterfaces } from "node:os";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { DNS_TYPES, dnsAudit, dnsQuery, type DnsType } from "./fmNetDns";
import { NET_LIMITS, PRESETS, TOP_PORTS, clampTimeout, netState, validateHost, validatePort, withSyncSlot } from "./fmNetCore";
import { httpProbe, inspectTls } from "./fmNetProbe";
import { briefTasks, cancelTasks, findTask, scanCsv, snapshot, startPing, startScan } from "./fmNetScan";
import { FmError, cleanName, parseTypedPath, uniqueName, validateName } from "./fmPaths";

function localConnections() {
  const out: Array<{ name: string; family: string; internal: boolean; address: string }> = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === "IPv6" && item.address.startsWith("fe80:")) continue;
      // Only the loopback address is shown in full: the others would identify this computer on its network.
      out.push({ name, family: item.family, internal: item.internal, address: item.internal ? item.address : "hidden for privacy" });
    }
  }
  return out.slice(0, 12);
}

function pickScheme(host: string, port: number, wanted: unknown): "http" | "https" {
  if (wanted === "http" || wanted === "https") return wanted;
  if (wanted !== undefined && wanted !== "auto" && wanted !== "") throw new FmError("BAD_SCHEME", 'The web address type must be "auto", "http" or "https".');
  if (port === 443) return "https";
  if (port === 80) return "http";
  return host === "localhost" || /^127\./.test(host) || host === "::1" ? "http" : "https";
}

async function saveReport(ctx: FmContext, b: Record<string, any>) {
  if (typeof b.folder !== "string" || !b.folder.trim()) throw new FmError("BAD_PATH", "Choose a folder to save the report in.");
  const typed = parseTypedPath(b.folder, ctx.home, ctx.home, ctx.platform);
  const folder = absolutePath(ctx, typed ?? "");
  await assertFolder(folder, "That folder");
  assertCreatable(ctx, folder);

  const asCsv = b.format === "csv";
  let content: string;
  if (asCsv) {
    const task = findTask(ctx, b.taskId);
    if (task.kind !== "scan" || task.results.length === 0) throw new FmError("NO_RESULTS", "There are no scan results to save as a table yet.");
    content = scanCsv(task);
  } else {
    if (typeof b.text !== "string" || !b.text.trim()) throw new FmError("NO_RESULTS", "There is nothing to save yet. Run a check first.");
    if (b.text.length > NET_LIMITS.maxReportChars) throw new FmError("TOO_LARGE", "That report is too large to save.");
    content = b.text;
  }

  let wanted = asCsv ? "Network scan.csv" : "Network report.txt";
  if (typeof b.name === "string" && b.name.trim()) {
    const reason = validateName(b.name, ctx.platform);
    if (reason) throw new FmError("BAD_NAME", reason);
    wanted = cleanName(b.name);
    if (!/\.(txt|csv)$/i.test(wanted)) wanted += asCsv ? ".csv" : ".txt";
  }
  const p = pathApi(ctx);
  const taken = new Set(await fsp.readdir(folder));
  // "wx" never replaces a file; if one appears between the check and the write, the next free name is tried.
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = uniqueName(wanted, (n) => taken.has(n));
    try {
      await fsp.writeFile(p.join(folder, name), content, { flag: "wx", encoding: "utf8" });
      return { path: p.join(folder, name), name };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
      taken.add(name);
    }
  }
  throw new FmError("NO_FREE_NAME", "Could not find a free name for the report.");
}

export const netOperations: Record<string, FmHandler> = {
  async "net/presets"() {
    return {
      presets: PRESETS,
      topPorts: TOP_PORTS,
      limits: { maxPorts: NET_LIMITS.maxPorts, maxConcurrency: NET_LIMITS.maxConcurrency, minTimeoutMs: NET_LIMITS.minTimeoutMs, maxTimeoutMs: NET_LIMITS.maxTimeoutMs, scanTimeCapMs: NET_LIMITS.scanTimeCapMs, maxRunningTasks: NET_LIMITS.maxRunningTasks },
      dnsTypes: DNS_TYPES,
      connections: localConnections(),
    };
  },

  async "net/probe"(ctx, b) {
    const host = validateHost(b.host);
    const port = b.port === undefined || b.port === "" ? undefined : validatePort(b.port);
    const scheme = pickScheme(host, port ?? 0, b.scheme);
    const method = b.method === undefined || b.method === "HEAD" ? "HEAD" : b.method === "GET" ? "GET" : null;
    if (!method) throw new FmError("BAD_METHOD", 'The request type must be "HEAD" or "GET".');
    const timeoutMs = clampTimeout(b.timeoutMs, NET_LIMITS.maxTimeoutMs);
    const state = netState(ctx);
    return withSyncSlot(state, () => httpProbe(state, { host, port: port ?? (scheme === "https" ? 443 : 80), scheme, method, timeoutMs }));
  },

  async "net/scan"(ctx, b) {
    return { task: snapshot(startScan(ctx, b)) };
  },

  async "net/tcpping"(ctx, b) {
    return { task: snapshot(startPing(ctx, b)) };
  },

  async "net/status"(ctx, b) {
    const from = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
    const tasks = briefTasks(ctx);
    const task = b.id === undefined ? null : snapshot(findTask(ctx, b.id), from(b.logFrom), from(b.resultFrom));
    return { task, tasks, running: tasks.filter((t) => t.state === "running").length };
  },

  async "net/cancel"(ctx, b) {
    return { cancelled: await cancelTasks(ctx, b.id) };
  },

  async "net/dns"(ctx, b) {
    const host = validateHost(b.host);
    const type = typeof b.type === "string" ? b.type.toUpperCase() : "";
    const state = netState(ctx);
    if (type === "ALL") return withSyncSlot(state, async () => ({ type: "ALL", ...(await dnsAudit(state, host)) }));
    if (!(DNS_TYPES as readonly string[]).includes(type)) throw new FmError("BAD_DNS_TYPE", `Choose one of: ${DNS_TYPES.join(", ")}, or ALL.`);
    return withSyncSlot(state, async () => ({ type, result: await dnsQuery(state, host, type as DnsType) }));
  },

  async "net/tls"(ctx, b) {
    const host = validateHost(b.host);
    const port = validatePort(b.port ?? 443);
    const timeoutMs = clampTimeout(b.timeoutMs, NET_LIMITS.maxTimeoutMs);
    const state = netState(ctx);
    return withSyncSlot(state, () => inspectTls(state, { host, port, timeoutMs }));
  },

  async "net/activity"(ctx, b) {
    const state = netState(ctx);
    const since = typeof b.since === "number" && Number.isInteger(b.since) && b.since >= 0 ? b.since : 0;
    return { rows: state.activity.filter((r) => r.n > since), total: state.activityTotal };
  },

  async "net/clear"(ctx) {
    const state = netState(ctx);
    for (const [id, task] of state.tasks) if (task.state !== "running") state.tasks.delete(id);
    state.activity.length = 0;
    return { cleared: true };
  },

  async "net/save"(ctx, b) {
    return saveReport(ctx, b);
  },
};
