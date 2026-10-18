/**
 * Shared pieces of the File Manager's Network tool: the safety limits, strict checking of hosts / ports / time
 * limits, the per-server state (running checks, open sockets, activity log) and the single place that opens a
 * TCP connection. Everything that touches the network goes through here, so every call has a time limit and
 * every socket and timer can be closed when a check is cancelled or the server stops.
 */
import { isIP, Socket } from "node:net";
import { domainToASCII } from "node:url";
import type { FmContext } from "./fmCore";
import { FmError } from "./fmPaths";
import { parsePortSpec } from "../../network_tools";

export const NET_LIMITS = {
  maxPorts: 1024,
  maxConcurrency: 64,
  defaultConcurrency: 32,
  minTimeoutMs: 100,
  maxTimeoutMs: 5000,
  scanTimeoutMs: 800,
  /** A whole scan is stopped after this long, however many ports are left. */
  scanTimeCapMs: 60_000,
  maxRunningTasks: 2,
  maxSyncOps: 4,
  maxFinishedTasks: 10,
  maxPingCount: 10,
  defaultPingCount: 5,
  maxLogLines: 500,
  maxActivityRows: 500,
  maxReportChars: 200_000,
  maxHeaderBytes: 16 * 1024,
  maxHeaders: 100,
  maxBodyBytes: 4096,
} as const;

/** The services the "Scan common ports" button looks at. */
export const TOP_PORTS: Array<{ port: number; service: string }> = [
  { port: 21, service: "FTP" }, { port: 22, service: "SSH" }, { port: 53, service: "DNS" }, { port: 80, service: "HTTP" },
  { port: 443, service: "HTTPS" }, { port: 3000, service: "Node/Vite Dev" }, { port: 3306, service: "MySQL" },
  { port: 5432, service: "PostgreSQL" }, { port: 6379, service: "Redis" }, { port: 8000, service: "Django/FastAPI" },
  { port: 8080, service: "HTTP Proxy/Dev" }, { port: 27017, service: "MongoDB" },
];

export const PRESETS = [
  { id: "localhost", label: "Localhost", host: "127.0.0.1", port: 3000, note: "This computer itself (a good place to practice)." },
  { id: "cloudflare", label: "Cloudflare", host: "1.1.1.1", port: 443, note: "Cloudflare's public DNS service." },
  { id: "google", label: "Google", host: "google.com", port: 443, note: "Google's website." },
  { id: "github", label: "GitHub", host: "github.com", port: 443, note: "GitHub's website." },
];

// ---------------------------------------------------------------------------------------------------------------
// Checking what the person typed
// ---------------------------------------------------------------------------------------------------------------

const HOST_HELP = "Type just the name or address of a computer, like example.com or 192.168.1.10.";

function isUnusableAddress(ip: string, family: number): boolean {
  if (family === 4) {
    const first = Number(ip.split(".")[0]);
    return ip === "0.0.0.0" || ip === "255.255.255.255" || (first >= 224 && first <= 239);
  }
  const lower = ip.toLowerCase();
  return lower === "::" || lower.startsWith("ff");
}

/** Returns the host in a clean form, or throws a plain-language FmError. Web addresses, user names and odd characters are refused. */
export function validateHost(input: unknown): string {
  if (typeof input !== "string" || input === "") throw new FmError("BAD_HOST", `No computer was given. ${HOST_HELP}`);
  if (input.length > 300) throw new FmError("BAD_HOST", "That name is too long to be a computer name.");
  if (/[\s\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(input)) throw new FmError("BAD_HOST", `A computer name can't contain spaces or hidden characters. ${HOST_HELP}`);
  if (/^[^:/\\?#@]+:\d{1,5}$/.test(input) && isIP(input) === 0) throw new FmError("BAD_HOST", "Type the port in the Port box, not after the name. " + HOST_HELP);
  if (/[/\\?#@:]/.test(input) && isIP(input.replace(/^\[|\]$/g, "")) === 0) throw new FmError("BAD_HOST", `That looks like a web address (or has a user name in it). ${HOST_HELP}`);

  let host = input;
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host.includes("%")) throw new FmError("BAD_HOST", "Addresses with a zone (like fe80::1%en0) aren't supported. Use a normal address.");

  const family = isIP(host);
  if (family !== 0) {
    if (isUnusableAddress(host, family)) throw new FmError("BAD_HOST", "That isn't an address of a single computer (it is a broadcast, multicast or empty address).");
    return host.toLowerCase();
  }

  if (host.endsWith(".")) host = host.slice(0, -1);
  if (/[^\x00-\x7f]/.test(host)) {
    host = domainToASCII(host);
    if (!host) throw new FmError("BAD_HOST", `That name has characters a computer name can't have. ${HOST_HELP}`);
  }
  host = host.toLowerCase();
  if (host.length === 0 || host.length > 253) throw new FmError("BAD_HOST", "That isn't a valid computer name.");
  const labels = host.split(".");
  for (const label of labels) {
    if (!/^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label)) throw new FmError("BAD_HOST", `"${label.slice(0, 30)}" isn't allowed in a computer name. Use letters, digits and hyphens only. ${HOST_HELP}`);
  }
  const last = labels[labels.length - 1]!;
  if (/^\d+$/.test(last) || /^0x[0-9a-f]*$/.test(last)) throw new FmError("BAD_HOST", "That looks like a number, not a name. Type a full address such as 192.168.1.10.");
  return host;
}

/** What to actually connect to: "localhost" always means this computer over IPv4. */
export const connectTarget = (host: string): string => (host === "localhost" ? "127.0.0.1" : host);

export function validatePort(input: unknown, what = "The port"): number {
  const n = typeof input === "number" ? input : typeof input === "string" && /^\d{1,5}$/.test(input) ? Number(input) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new FmError("BAD_PORT", `${what} must be a whole number from 1 to 65535.`);
  return n;
}

/** A time limit in milliseconds, kept between 100 and 5000. Missing means the default; text that isn't a number is refused. */
export function clampTimeout(input: unknown, fallback: number): number {
  if (input === undefined || input === null || input === "") return fallback;
  const n = typeof input === "number" ? input : typeof input === "string" && /^\d+(\.\d+)?$/.test(input.trim()) ? Number(input) : NaN;
  if (!Number.isFinite(n)) throw new FmError("BAD_TIMEOUT", "The time limit must be a number of milliseconds (100 to 5000).");
  return Math.round(Math.min(NET_LIMITS.maxTimeoutMs, Math.max(NET_LIMITS.minTimeoutMs, n)));
}

export function clampInt(input: unknown, min: number, max: number, fallback: number): number {
  const n = typeof input === "number" ? input : typeof input === "string" && /^\d+$/.test(input.trim()) ? Number(input) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/** "22,80,443,8000-8010" to a sorted list. More than 1024 ports is refused rather than quietly cut short. */
export function parsePorts(spec: unknown): number[] {
  if (typeof spec !== "string" || spec.length > 2000) throw new FmError("BAD_PORTS", "Type the ports to check, like 22,80,443 or 8000-8010.");
  const parsed = parsePortSpec(spec, NET_LIMITS.maxPorts);
  if (parsed.error) throw new FmError("BAD_PORTS", parsed.error);
  if (parsed.truncated) throw new FmError("TOO_MANY_PORTS", `That is more than ${NET_LIMITS.maxPorts} ports at once. Choose a smaller range (up to ${NET_LIMITS.maxPorts} ports per scan).`);
  return parsed.ports;
}

/** Text from the network is shown to people and saved to files: drop control characters and cap the length. */
export function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").slice(0, max);
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------------------------------------------
// State kept for one File Manager server
// ---------------------------------------------------------------------------------------------------------------

export interface LogLine { at: number; level: "info" | "ok" | "warn" | "error"; text: string }
export interface ScanRow { port: number; service: string; status: "OPEN" | "CLOSED" | "TIMEOUT"; latencyMs: number; code?: string }
export interface ActivityRow { n: number; at: number; kind: string; target: string; result: string; ms: number | null }

export interface NetTask {
  id: string;
  kind: "scan" | "ping";
  mode: string;
  host: string;
  port: number | null;
  total: number;
  done: number;
  state: "running" | "done" | "cancelled" | "error";
  startedAt: number;
  endedAt: number | null;
  results: ScanRow[];
  samples: Array<number | null>;
  log: LogLine[];
  summary: string;
  headline: string;
  error: { code: string; message: string } | null;
  /** Why a scan ended before every port was checked. */
  stoppedEarly: "cancelled" | "time-limit" | "unreachable" | null;
  abort: AbortController;
  finished: Promise<void>;
  /** Most connections open at once (kept so the concurrency limit can be checked). */
  peakInFlight: number;
}

export interface NetState {
  tasks: Map<string, NetTask>;
  sockets: Set<Socket>;
  timers: Set<ReturnType<typeof setTimeout>>;
  syncRunning: number;
  activity: ActivityRow[];
  activityTotal: number;
  taskCounter: number;
  disposed: boolean;
  /** For tests: makes the sockets a check uses, so nothing has to touch a real network. */
  makeSocket?: () => Socket;
}

const states = new WeakMap<FmContext, NetState>();

export function netState(ctx: FmContext): NetState {
  let state = states.get(ctx);
  if (state) return state;
  const created: NetState = { tasks: new Map(), sockets: new Set(), timers: new Set(), syncRunning: 0, activity: [], activityTotal: 0, taskCounter: 0, disposed: false };
  state = created;
  states.set(ctx, created);
  ctx.disposers.push(() => {
    created.disposed = true;
    for (const task of created.tasks.values()) if (task.state === "running") task.abort.abort();
    for (const socket of [...created.sockets]) socket.destroy();
    for (const timer of created.timers) clearTimeout(timer);
    created.timers.clear();
    created.sockets.clear();
  });
  return created;
}

/** A timer that is forgotten when it fires and closed with the server. Returns a function that cancels it. */
export function timeout(state: NetState, fn: () => void, ms: number): () => void {
  const timer = setTimeout(() => {
    state.timers.delete(timer);
    fn();
  }, ms);
  state.timers.add(timer);
  return () => {
    clearTimeout(timer);
    state.timers.delete(timer);
  };
}

/** Waits `ms`, or less if `signal` is aborted. */
export function sleep(state: NetState, ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    let stop = () => {};
    const done = () => {
      stop();
      signal?.removeEventListener("abort", done);
      resolve();
    };
    stop = timeout(state, done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

export function addActivity(state: NetState, kind: string, target: string, result: string, ms: number | null): void {
  state.activityTotal++;
  state.activity.push({ n: state.activityTotal, at: Date.now(), kind, target, result: cleanText(result, 200), ms: ms === null ? null : round1(ms) });
  if (state.activity.length > NET_LIMITS.maxActivityRows) state.activity.splice(0, state.activity.length - NET_LIMITS.maxActivityRows);
}

export function pushLog(log: LogLine[], level: LogLine["level"], text: string): void {
  log.push({ at: Date.now(), level, text: cleanText(text, 400) });
  if (log.length > NET_LIMITS.maxLogLines) log.splice(0, log.length - NET_LIMITS.maxLogLines);
}

/** Runs one quick check, allowing only a few at a time. */
export async function withSyncSlot<T>(state: NetState, fn: () => Promise<T>): Promise<T> {
  if (state.syncRunning >= NET_LIMITS.maxSyncOps) throw new FmError("BUSY", "Several checks are already running. Wait a moment and try again.");
  state.syncRunning++;
  try {
    return await fn();
  } finally {
    state.syncRunning--;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Opening one connection
// ---------------------------------------------------------------------------------------------------------------

export type Reach = "OPEN" | "CLOSED" | "TIMEOUT" | "CANCELLED" | "NAME_ERROR";
export interface ConnectResult { status: Reach; latencyMs: number; code?: string }

const NAME_ERRORS = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_NONAME", "EAI_FAIL"]);
const NO_ROUTE = new Set(["ENETUNREACH", "EHOSTUNREACH", "ENETDOWN", "EADDRNOTAVAIL"]);

/**
 * Tries to connect to host:port once. OPEN = something answered, CLOSED = refused, TIMEOUT = no answer in time
 * (or no route), NAME_ERROR = the name could not be found, CANCELLED = `signal` was aborted. The socket is always
 * destroyed and the timer always cleared before this resolves.
 */
export function tcpConnect(state: NetState, host: string, port: number, timeoutMs: number, signal?: AbortSignal): Promise<ConnectResult> {
  return new Promise((resolve) => {
    if (signal?.aborted || state.disposed) return resolve({ status: "CANCELLED", latencyMs: 0 });
    const socket = state.makeSocket ? state.makeSocket() : new Socket();
    state.sockets.add(socket);
    const started = performance.now();
    let settled = false;
    let stopTimer = () => {};
    const finish = (status: Reach, code?: string) => {
      if (settled) return;
      settled = true;
      stopTimer();
      signal?.removeEventListener("abort", onAbort);
      state.sockets.delete(socket);
      socket.removeAllListeners();
      socket.on("error", () => {});
      socket.destroy();
      resolve({ status, latencyMs: status === "TIMEOUT" ? timeoutMs : round1(performance.now() - started), code });
    };
    const onAbort = () => finish("CANCELLED");
    stopTimer = timeout(state, () => finish("TIMEOUT"), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.once("connect", () => finish("OPEN"));
    socket.once("close", () => finish("CLOSED"));
    socket.once("error", (err: NodeJS.ErrnoException) => {
      const code = err?.code ?? "UNKNOWN";
      finish(NAME_ERRORS.has(code) ? "NAME_ERROR" : NO_ROUTE.has(code) || code === "ETIMEDOUT" ? "TIMEOUT" : "CLOSED", code);
    });
    try {
      socket.connect({ host, port });
    } catch {
      finish("CLOSED", "EINVAL");
    }
  });
}

/** The friendly reason a connection problem happened (for HTTP, TLS and ping). */
export function describeNetError(code: string | undefined, host: string): { code: string; message: string } {
  switch (code) {
    case "ENOTFOUND":
    case "EAI_NONAME":
    case "EAI_FAIL":
      return { code: "NAME_NOT_FOUND", message: `Couldn't find a computer named "${host}". Check the spelling, or check that you are online.` };
    case "EAI_AGAIN":
      return { code: "OFFLINE", message: "The name couldn't be looked up right now. You may be offline, or your DNS server isn't answering." };
    case "ECONNREFUSED":
      return { code: "REFUSED", message: "The computer answered, but nothing is listening on that port." };
    case "ENETUNREACH":
    case "ENETDOWN":
    case "EHOSTUNREACH":
      return { code: "OFFLINE", message: "There is no way to reach that computer from here. You may be offline." };
    case "ETIMEDOUT":
    case "TIMEOUT":
      return { code: "TIMEOUT", message: "No answer in time. The computer may be off, offline, or a firewall may be blocking the connection." };
    case "ECONNRESET":
      return { code: "RESET", message: "The other computer closed the connection unexpectedly." };
    default:
      return { code: code ?? "UNKNOWN", message: "The connection didn't work. Check the address and that you are online." };
  }
}
