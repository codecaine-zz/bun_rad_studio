/**
 * The network side of the subdomain engine, kept small and replaceable: which addresses count as private, a shared
 * concurrency limiter, a per-host pacer, capped reading of answers, and the real DNS lookup, TCP connect and HTTP
 * request. The HTTP request is written by hand over a socket so that it connects to an address that was already
 * checked (a name can't change its answer between the check and the connection), verifies TLS, sends no cookies,
 * and reads only the start of the page.
 */
import { isIP, Socket } from "node:net";
import * as dns from "node:dns/promises";
import * as tls from "node:tls";

/** What this program tells the sites it asks. */
export const USER_AGENT = "CodecaineFileManager-Subdomains/1.0 (+https://github.com/codecaine-zz/bun_rad_studio)";

// ---------------------------------------------------------------------------------------------------------------
// Private addresses
// ---------------------------------------------------------------------------------------------------------------

const v4ToInt = (ip: string): number => ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);

function parseV6(ip: string): bigint | null {
  let s = ip.toLowerCase();
  if (s.includes("%")) s = s.slice(0, s.indexOf("%"));
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const n = v4ToInt(tail[1]!);
    s = `${s.slice(0, -tail[1]!.length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const groups = halves.length > 1 ? [...head, ...Array(missing).fill("0"), ...rest] : head;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

function reasonV4(ip: string): string | null {
  const n = v4ToInt(ip);
  const inside = (base: string, bits: number) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(v4ToInt(base) / 2 ** (32 - bits));
  if (inside("0.0.0.0", 8)) return "an unspecified address (0.x.x.x)";
  if (inside("10.0.0.0", 8) || inside("172.16.0.0", 12) || inside("192.168.0.0", 16)) return "a private network address";
  if (inside("127.0.0.0", 8)) return "this computer's own address (loopback)";
  if (inside("169.254.0.0", 16)) return "a link-local address (169.254.x.x)";
  if (inside("100.64.0.0", 10)) return "a shared carrier-grade NAT address (100.64.x.x)";
  if (inside("192.0.0.0", 24) || inside("192.0.2.0", 24) || inside("198.51.100.0", 24) || inside("203.0.113.0", 24)) return "a reserved or documentation address";
  if (inside("198.18.0.0", 15)) return "a network-testing address (198.18.x.x)";
  if (inside("224.0.0.0", 4)) return "a multicast address";
  if (inside("240.0.0.0", 4)) return "a reserved address";
  return null;
}

/** Why `ip` is not an ordinary public address (private, loopback, link-local, ULA, multicast, reserved ...), or null when it is public. Not an IP at all counts as unusable. */
export function nonPublicReason(ip: string): string | null {
  const family = isIP(ip);
  if (family === 4) return reasonV4(ip);
  if (family !== 6) return "not a valid IP address";
  const n = parseV6(ip);
  if (n === null) return "not a valid IP address";
  const top = (bits: number) => n >> BigInt(128 - bits);
  if (n === 0n) return "an unspecified address (::)";
  if (n === 1n) return "this computer's own address (loopback)";
  if (n >> 32n === 0xffffn) return reasonV4(`${(n >> 24n) & 255n}.${(n >> 16n) & 255n}.${(n >> 8n) & 255n}.${n & 255n}`) ?? null;
  if (top(96) === 0n) return "an old-style IPv4-compatible address";
  if (top(96) === 0x64ff9b0000000000000000n) return reasonV4(`${(n >> 24n) & 255n}.${(n >> 16n) & 255n}.${(n >> 8n) & 255n}.${n & 255n}`);
  if (top(7) === 0xfcn >> 1n) return "a private network address (unique local, fc00::/7)";
  if (top(10) === 0x3fan) return "a link-local address (fe80::/10)";
  if (top(10) === 0x3fbn) return "a retired site-local address (fec0::/10)";
  if (top(8) === 0xffn) return "a multicast address";
  if (top(32) === 0x20010db8n) return "a documentation address";
  if (top(16) === 0x2002n) return reasonV4(`${(n >> 104n) & 255n}.${(n >> 96n) & 255n}.${(n >> 88n) & 255n}.${(n >> 80n) & 255n}`);
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Limiting and pacing
// ---------------------------------------------------------------------------------------------------------------

export interface Limiter {
  /** Waits for a free slot, runs `fn`, frees the slot. Resolves to `undefined` without running `fn` when `signal` is aborted first. */
  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T | undefined>;
  readonly inFlight: number;
  readonly peak: number;
}

/** At most `max` things at once. Waiters leave the queue when their signal is aborted. */
export function createLimiter(max: number): Limiter {
  let active = 0;
  let peak = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    // A waiting run takes over the slot that was just freed; otherwise the slot is free.
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  return {
    get inFlight() { return active; },
    get peak() { return peak; },
    async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
      if (signal?.aborted) return undefined;
      if (active >= max) {
        const granted = await new Promise<boolean>((resolve) => {
          const turn = () => { signal?.removeEventListener("abort", leave); resolve(true); };
          const leave = () => {
            const i = waiting.indexOf(turn);
            if (i >= 0) waiting.splice(i, 1);
            resolve(false);
          };
          waiting.push(turn);
          signal?.addEventListener("abort", leave, { once: true });
        });
        if (!granted) return undefined;
      } else {
        active++;
      }
      peak = Math.max(peak, active);
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

/** Keeps `minIntervalMs` between the starts of two requests to the same key (a host name). `now` and `sleep` can be replaced to run on a fake clock. */
export function createPacer(minIntervalMs: number, now: () => number, sleep: (ms: number, signal?: AbortSignal) => Promise<void>) {
  const next = new Map<string, number>();
  return {
    async wait(key: string, signal?: AbortSignal): Promise<void> {
      const t = now();
      const start = Math.max(t, next.get(key) ?? 0);
      next.set(key, start + minIntervalMs);
      if (next.size > 5000) for (const [k, v] of next) if (v <= t) next.delete(k);
      if (start > t) await sleep(start - t, signal);
    },
  };
}

/** Waits `ms`, or less if `signal` is aborted. */
export function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** One limiter for the whole program: every lookup and connection of every run goes through it, so the File Manager stays responsive. */
export const sharedLimiter: Limiter = createLimiter(16);

// ---------------------------------------------------------------------------------------------------------------
// Reading answers with a size limit
// ---------------------------------------------------------------------------------------------------------------

export class TooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`The answer was larger than ${limit} bytes.`);
    this.name = "TooLargeError";
  }
}

/** The body of a fetch answer as text, refusing to read more than `maxBytes`. */
export async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    try { await res.body?.cancel(); } catch {}
    throw new TooLargeError(maxBytes);
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new TooLargeError(maxBytes);
      chunks.push(value);
    }
  } catch (err) {
    try { await reader.cancel(); } catch {}
    throw err;
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

// ---------------------------------------------------------------------------------------------------------------
// The real DNS lookup, TCP connect and HTTP request
// ---------------------------------------------------------------------------------------------------------------

const resolver = new dns.Resolver({ timeout: 2000, tries: 1 });
const NO_ANSWER = new Set(["ENOTFOUND", "ENODATA", "NODATA", "NOTFOUND"]);

function withDeadline<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const fail = (code: string) => reject(Object.assign(new Error(code === "ABORTED" ? "Cancelled." : "The lookup took too long."), { code }));
    if (signal?.aborted) return fail("ABORTED");
    const onAbort = () => { clearTimeout(timer); fail("ABORTED"); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); fail("ETIMEDOUT"); }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then((v) => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); resolve(v); }, (e) => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); reject(e); });
  });
}

/** The IPv4 and IPv6 addresses of a name. A name that doesn't exist gives []; a lookup that failed for another reason throws an error with a `code`. */
export async function realResolve(host: string, o: { timeoutMs: number; signal?: AbortSignal }): Promise<string[]> {
  const ask = async (fn: (h: string) => Promise<string[]>): Promise<{ ips: string[]; error?: NodeJS.ErrnoException }> => {
    try {
      return { ips: await fn(host) };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      return NO_ANSWER.has(String(e?.code)) ? { ips: [] } : { ips: [], error: e };
    }
  };
  const [v4, v6] = await withDeadline(Promise.all([ask((h) => resolver.resolve4(h)), ask((h) => resolver.resolve6(h))]), o.timeoutMs, o.signal);
  const ips = [...v4.ips, ...v6.ips];
  if (ips.length === 0 && (v4.error || v6.error)) throw Object.assign(new Error("The name couldn't be looked up right now."), { code: (v4.error ?? v6.error)?.code ?? "EAI_AGAIN" });
  return ips;
}

/** Tries one TCP connection to an address; true when something accepted it. */
export function realTcp(ip: string, port: number, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const socket = new Socket();
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket.removeAllListeners();
      socket.on("error", () => {});
      socket.destroy();
      resolve(open);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("close", () => finish(false));
    try { socket.connect({ host: ip, port }); } catch { finish(false); }
  });
}

export interface HttpRequest {
  scheme: "http" | "https";
  host: string;
  /** The address to connect to: already checked by the caller. */
  ip: string;
  port: number;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Verify the certificate (default true). */
  verifyTls?: boolean;
}

export interface HttpAnswer {
  status: number;
  location?: string;
  contentType?: string;
  /** The start of the page, decoded as text (only for pages that are text, and only the first few KB). */
  body: string;
}

export type HttpClient = (req: HttpRequest) => Promise<HttpAnswer>;

export const HTTP_LIMITS = { headerBytes: 16 * 1024, bodyBytes: 64 * 1024 } as const;

/** Decodes a chunked body prefix; stops quietly at the first thing that doesn't parse. */
function dechunk(raw: Buffer): Buffer {
  const out: Buffer[] = [];
  let pos = 0;
  for (let guard = 0; guard < 10000; guard++) {
    const eol = raw.indexOf("\r\n", pos);
    if (eol < 0) break;
    const size = parseInt(raw.toString("latin1", pos, eol).split(";")[0]!.trim(), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    out.push(raw.subarray(eol + 2, Math.min(raw.length, eol + 2 + size)));
    pos = eol + 2 + size + 2;
  }
  return Buffer.concat(out);
}

/** A single GET over a pinned address. Rejects (with a `code`) when it can't connect, the certificate isn't trusted, or the answer isn't HTTP. */
export const realHttp: HttpClient = (req) =>
  new Promise<HttpAnswer>((resolve, reject) => {
    const fail = (code: string, message: string) => finish(() => reject(Object.assign(new Error(message), { code })));
    let socket: Socket | tls.TLSSocket;
    let settled = false;
    let stop = () => {};
    const finish = (then: () => void) => {
      if (settled) return;
      settled = true;
      stop();
      try { socket?.removeAllListeners(); socket?.on("error", () => {}); socket?.destroy(); } catch {}
      then();
    };
    if (req.signal?.aborted) return fail("ABORTED", "Cancelled.");
    const onAbort = () => fail("ABORTED", "Cancelled.");
    const timer = setTimeout(() => fail("ETIMEDOUT", "No answer in time."), req.timeoutMs);
    stop = () => { clearTimeout(timer); req.signal?.removeEventListener("abort", onAbort); };
    req.signal?.addEventListener("abort", onAbort, { once: true });

    const request = [
      "GET / HTTP/1.1",
      `Host: ${req.host}${(req.scheme === "https" ? 443 : 80) === req.port ? "" : `:${req.port}`}`,
      `User-Agent: ${USER_AGENT}`,
      "Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      "Accept-Encoding: identity",
      "Connection: close",
      "", "",
    ].join("\r\n");

    const chunks: Buffer[] = [];
    let total = 0;
    let headerEnd = -1;
    const onData = (data: Buffer) => {
      chunks.push(data);
      total += data.length;
      if (headerEnd < 0) {
        const joined = Buffer.concat(chunks);
        const at = joined.indexOf("\r\n\r\n");
        if (at < 0) {
          if (total > HTTP_LIMITS.headerBytes) fail("BAD_RESPONSE", "The answer's headers were too large.");
          return;
        }
        headerEnd = at + 4;
      }
      const wanted = headerEnd + HTTP_LIMITS.bodyBytes + 8192;
      if (total >= wanted) conclude();
    };
    const conclude = () => {
      if (settled) return;
      const all = Buffer.concat(chunks);
      if (headerEnd < 0) {
        const at = all.indexOf("\r\n\r\n");
        if (at < 0) return fail("BAD_RESPONSE", "That wasn't a web server's answer.");
        headerEnd = at + 4;
      }
      const lines = all.toString("latin1", 0, headerEnd - 4).split("\r\n");
      const first = /^HTTP\/1\.[01]\s+(\d{3})(?:\s|$)/.exec(lines[0] ?? "");
      if (!first) return fail("BAD_RESPONSE", "That wasn't a web server's answer.");
      const headers = new Map<string, string>();
      for (const line of lines.slice(1, 101)) {
        const colon = line.indexOf(":");
        if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim().slice(0, 2000));
      }
      const contentType = headers.get("content-type") ?? "";
      const encoding = (headers.get("content-encoding") ?? "identity").toLowerCase();
      let raw: Buffer = all.subarray(headerEnd, headerEnd + HTTP_LIMITS.bodyBytes + 8192);
      if ((headers.get("transfer-encoding") ?? "").toLowerCase().includes("chunked")) raw = dechunk(raw);
      const isText = (!contentType || /^(text\/html|application\/xhtml)/i.test(contentType)) && encoding === "identity";
      const body = isText ? raw.subarray(0, HTTP_LIMITS.bodyBytes).toString("utf8") : "";
      const answer: HttpAnswer = { status: Number(first[1]), body, ...(headers.get("location") ? { location: headers.get("location")! } : {}), ...(contentType ? { contentType: contentType.slice(0, 200) } : {}) };
      finish(() => resolve(answer));
    };

    const onError = (err: NodeJS.ErrnoException) => {
      const code = err?.code ?? "UNKNOWN";
      const certProblem = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|HOSTNAME_MISMATCH|ERR_TLS/i.test(code) || /certificate|altnames/i.test(err?.message ?? "");
      fail(certProblem ? "CERT" : code, certProblem ? "The site's security certificate isn't trusted." : "Couldn't connect.");
    };
    try {
      if (req.scheme === "https") {
        socket = tls.connect({ host: req.ip, port: req.port, servername: isIP(req.host) ? undefined : req.host, rejectUnauthorized: req.verifyTls !== false });
        socket.once("secureConnect", () => socket.write(request));
      } else {
        socket = new Socket();
        socket.once("connect", () => socket.write(request));
        socket.connect({ host: req.ip, port: req.port });
      }
    } catch (err) {
      return onError(err as NodeJS.ErrnoException);
    }
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", conclude);
    socket.once("close", conclude);
  });
