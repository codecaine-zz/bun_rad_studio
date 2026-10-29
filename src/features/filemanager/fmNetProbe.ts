/**
 * The HTTP probe and the SSL/TLS certificate inspector. Both talk to the other computer over a plain socket we
 * control: every phase has a deadline, redirects are reported but never followed, the answer is read only as far
 * as the headers (and, if asked, the first few KB of the page), and the socket is closed as soon as we are done.
 */
import * as dns from "node:dns/promises";
import { isIP, Socket } from "node:net";
import * as tls from "node:tls";
import { daysUntil, describeCert, httpStatusText, type CertInfo } from "../../network_tools";
import { NET_LIMITS, addActivity, cleanText, connectTarget, describeNetError, pushLog, round1, timeout, type LogLine, type NetState } from "./fmNetCore";

/** Finds the address of a name, giving up after `ms`. IP addresses and "localhost" need no lookup. */
async function lookupHost(state: NetState, host: string, ms: number): Promise<{ ip: string; ms: number }> {
  if (isIP(host)) return { ip: host, ms: 0 };
  if (host === "localhost") return { ip: connectTarget(host), ms: 0 };
  const started = performance.now();
  let cancel = () => {};
  const limit = new Promise<never>((_, reject) => {
    cancel = timeout(state, () => reject(Object.assign(new Error("The name lookup took too long."), { code: "ETIMEDOUT" })), ms);
  });
  try {
    const found = await Promise.race([dns.lookup(host), limit]);
    return { ip: found.address, ms: round1(performance.now() - started) };
  } finally {
    cancel();
  }
}

const errorCode = (err: unknown): string | undefined => (err as NodeJS.ErrnoException)?.code;

// ---------------------------------------------------------------------------------------------------------------
// HTTP probe
// ---------------------------------------------------------------------------------------------------------------

export interface ParsedHead { version: string; status: number; reason: string; headers: Array<[string, string]> }

/** Reads "HTTP/1.1 200 OK" and the header lines. Returns null if this doesn't look like an HTTP answer. */
export function parseHead(text: string): ParsedHead | null {
  const lines = text.split(/\r?\n/);
  const first = /^HTTP\/(\d(?:\.\d)?)\s+(\d{3})(?:\s+(.*))?$/.exec(lines[0] ?? "");
  if (!first) return null;
  const headers: Array<[string, string]> = [];
  for (const line of lines.slice(1)) {
    if (!line) break;
    const colon = line.indexOf(":");
    if (colon <= 0 || headers.length >= NET_LIMITS.maxHeaders) continue;
    headers.push([cleanText(line.slice(0, colon).trim(), 100), cleanText(line.slice(colon + 1).trim(), 1000)]);
  }
  return { version: first[1]!, status: Number(first[2]), reason: cleanText(first[3] ?? "", 100), headers };
}

export function explainStatus(status: number, method: string): string {
  if (status >= 200 && status < 300) return "The website answered normally. It is up and the address works.";
  if (status >= 300 && status < 400) return "The page has moved. The server points to another address (see Location). This tool does not follow it for you.";
  if (status === 401 || status === 403) return "The server is there, but it wants a login or won't let this request in.";
  if (status === 404) return "The server is working, but it has no page at this address.";
  if ((status === 405 || status === 501) && method === "HEAD") return "The server doesn't allow the quick HEAD check. Tick \"Also read the first few KB\" and try again.";
  if (status === 429) return "The server says there were too many requests. Wait a little before trying again.";
  if (status >= 400 && status < 500) return "The server is there, but it rejected the request.";
  if (status >= 500) return "The server is there, but it had a problem answering.";
  return "The server gave an unusual answer.";
}

export interface ProbeOptions { host: string; port: number; scheme: "http" | "https"; method: "HEAD" | "GET"; timeoutMs: number }

export async function httpProbe(state: NetState, o: ProbeOptions) {
  const log: LogLine[] = [];
  const started = performance.now();
  const defaultPort = o.scheme === "https" ? 443 : 80;
  const shown = isIP(o.host) === 6 ? `[${o.host}]` : o.host;
  const url = `${o.scheme}://${shown}${o.port === defaultPort ? "" : `:${o.port}`}/`;
  const result = {
    host: o.host, port: o.port, scheme: o.scheme, method: o.method, url, remoteIp: null as string | null,
    status: null as number | null, statusText: "", version: "", headers: [] as Array<[string, string]>, location: null as string | null,
    redirect: null as { to: string; sameHost: boolean } | null,
    timings: { dnsMs: 0, connectMs: 0, tlsMs: 0, ttfbMs: 0, totalMs: 0 },
    tls: null as { trusted: boolean; authError: string | null; protocol: string | null } | null,
    bodyBytesRead: 0, bodyTruncated: false, explain: "", error: null as { code: string; message: string } | null, log,
  };
  pushLog(log, "info", `${o.method} ${url}`);
  try {
    const looked = await lookupHost(state, o.host, o.timeoutMs);
    result.remoteIp = looked.ip;
    result.timings.dnsMs = looked.ms;
    pushLog(log, "info", isIP(o.host) ? `Using address ${looked.ip}` : `${o.host} is at ${looked.ip} (${looked.ms} ms)`);
    const left = Math.max(50, o.timeoutMs - (performance.now() - started));
    await exchange(state, o, looked.ip, left, result, log);
    result.timings.totalMs = round1(performance.now() - started);
    result.statusText = httpStatusText(result.status ?? 0);
    result.explain = explainStatus(result.status ?? 0, o.method);
    const location = result.headers.find(([k]) => k.toLowerCase() === "location")?.[1] ?? null;
    if (result.status !== null && result.status >= 300 && result.status < 400 && location) {
      result.location = location;
      try {
        const target = new URL(location, url);
        result.redirect = { to: cleanText(target.href, 500), sameHost: target.hostname.replace(/^\[|\]$/g, "") === o.host };
      } catch {
        result.redirect = null;
      }
      pushLog(log, "warn", `Redirect to ${cleanText(location, 200)} - not followed`);
    }
    pushLog(log, result.status !== null && result.status < 400 ? "ok" : "warn", `HTTP ${result.status} ${result.statusText} in ${result.timings.totalMs} ms`);
    addActivity(state, "http", `${o.host}:${o.port}`, `HTTP ${result.status}`, result.timings.totalMs);
  } catch (err) {
    result.timings.totalMs = round1(performance.now() - started);
    result.error = describeNetError(errorCode(err), o.host);
    const message = (err as Error)?.message;
    if (errorCode(err) === "NOT_HTTP" || errorCode(err) === "TOO_BIG") result.error = { code: errorCode(err)!, message: message ?? "That didn't look like a web server." };
    else if (result.error.code === "UNKNOWN" && o.scheme === "https") result.error = { code: "TLS_FAILED", message: "The secure connection couldn't be set up. That port may not use HTTPS - try the HTTP option." };
    pushLog(log, "error", result.error.message);
    addActivity(state, "http", `${o.host}:${o.port}`, result.error.code.toLowerCase(), result.timings.totalMs);
  }
  return result;
}

type ProbeResult = Awaited<ReturnType<typeof httpProbe>>;

function exchange(state: NetState, o: ProbeOptions, ip: string, ms: number, out: ProbeResult, log: LogLine[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const sni = isIP(o.host) ? undefined : o.host;
    const socket: Socket = o.scheme === "https"
      ? tls.connect({ host: ip, port: o.port, servername: sni, rejectUnauthorized: false })
      : new Socket();
    state.sockets.add(socket);
    const marks = { start: performance.now(), connect: 0, secure: 0, sent: 0, first: 0 };
    let buffer: Buffer = Buffer.alloc(0);
    let totalBytes = 0;
    let head: ParsedHead | null = null;
    let headEnd = -1;
    let settled = false;
    let stop = () => {};
    const end = (err?: Error & { code?: string }) => {
      if (settled) return;
      settled = true;
      stop();
      state.sockets.delete(socket);
      socket.removeAllListeners();
      socket.on("error", () => {});
      socket.destroy();
      if (err && !head) return reject(err);
      if (!head) return reject(Object.assign(new Error("The server closed the connection without answering."), { code: "ECONNRESET" }));
      out.status = head.status;
      out.version = head.version;
      out.headers = head.headers;
      out.timings.connectMs = round1((marks.connect || marks.secure) - marks.start);
      out.timings.tlsMs = o.scheme === "https" && marks.secure ? round1(marks.secure - (marks.connect || marks.start)) : 0;
      out.timings.ttfbMs = marks.first && marks.sent ? round1(marks.first - marks.sent) : 0;
      if (o.method === "GET" && headEnd >= 0) {
        const body = totalBytes - headEnd;
        out.bodyBytesRead = Math.min(body, NET_LIMITS.maxBodyBytes);
        out.bodyTruncated = body >= NET_LIMITS.maxBodyBytes;
      }
      if (o.scheme === "https") {
        const secure = socket as tls.TLSSocket;
        out.tls = { trusted: !!secure.authorized, authError: secure.authorizationError ? cleanText(String(secure.authorizationError), 200) : null, protocol: secure.getProtocol?.() ?? null };
      }
      resolve();
    };
    stop = timeout(state, () => end(Object.assign(new Error("No answer in time."), { code: "ETIMEDOUT" })), ms);

    const sendRequest = () => {
      pushLog(log, "info", o.scheme === "https" ? "Secure connection ready. Sending the request..." : "Connected. Sending the request...");
      marks.sent = performance.now();
      const hostHeader = `${isIP(o.host) === 6 ? `[${o.host}]` : o.host}${o.port === (o.scheme === "https" ? 443 : 80) ? "" : `:${o.port}`}`;
      socket.write(`${o.method} / HTTP/1.1\r\nHost: ${hostHeader}\r\nUser-Agent: RadStudio-FileManager/1.0 (network check)\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
    };
    socket.on("connect", () => {
      marks.connect = performance.now();
      if (o.scheme === "http") sendRequest();
    });
    socket.on("secureConnect", () => {
      marks.secure = performance.now();
      sendRequest();
    });
    const headChunks: Buffer[] = [];
    let headBytes = 0;
    socket.on("data", (chunk: Buffer) => {
      if (!marks.first) marks.first = performance.now();
      totalBytes += chunk.length;
      if (!head) {
        headChunks.push(chunk);
        headBytes += chunk.length;
        if (headBytes > NET_LIMITS.maxHeaderBytes) {
          buffer = headChunks.length === 1 ? headChunks[0]! : Buffer.concat(headChunks, headBytes);
          const at = buffer.indexOf("\r\n\r\n");
          if (at < 0) {
            end(Object.assign(new Error("That server's answer is too large to be a normal web page header."), { code: "TOO_BIG" }));
            return;
          }
        }
        if (!chunk.includes(10)) return;
        buffer = headChunks.length === 1 ? headChunks[0]! : Buffer.concat(headChunks, headBytes);
        const at = buffer.indexOf("\r\n\r\n");
        if (at < 0) return;
        head = parseHead(buffer.subarray(0, at).toString("latin1"));
        headEnd = at + 4;
        buffer = Buffer.alloc(0);
        headChunks.length = 0;
        if (!head) return end(Object.assign(new Error("That port didn't answer like a web server (it isn't speaking HTTP)."), { code: "NOT_HTTP" }));
        if (o.method === "HEAD") return end();
      }
      if (totalBytes - headEnd >= NET_LIMITS.maxBodyBytes) end();
    });
    socket.on("end", () => end());
    socket.on("close", () => end());
    socket.on("error", (err: Error) => end(err));
    if (o.scheme === "http") socket.connect({ host: ip, port: o.port });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// SSL/TLS certificate
// ---------------------------------------------------------------------------------------------------------------

const asNames = (value: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) out[k] = cleanText(Array.isArray(v) ? v.join(", ") : v, 200);
  return out;
};

export function parseAltNames(san: string | undefined): string[] {
  return (san ?? "").split(/,\s*/).map((s) => cleanText(s.replace(/^DNS:/, "").replace(/^IP Address:/, "IP:"), 200)).filter(Boolean).slice(0, 100);
}

export function certVerdict(info: CertInfo, now = Date.now()): { verdict: "ok" | "warn" | "bad"; daysLeft: number | null; explain: string } {
  const daysLeft = info.validTo ? daysUntil(info.validTo, now) : null;
  const notYet = info.validFrom && Date.parse(info.validFrom) > now;
  if (notYet) return { verdict: "bad", daysLeft, explain: "This certificate is not valid yet. Check that your computer's clock is right." };
  if (daysLeft !== null && daysLeft < 0) return { verdict: "bad", daysLeft, explain: `This certificate expired ${Math.abs(daysLeft)} day(s) ago, so browsers would show a warning.` };
  if (!info.authorized) return { verdict: "warn", daysLeft, explain: `Your computer doesn't trust this certificate${info.authError ? ` (${info.authError})` : ""}. That is normal for a self-signed certificate on your own server, but be careful with websites.` };
  if (daysLeft !== null && daysLeft <= 14) return { verdict: "warn", daysLeft, explain: `The certificate is trusted but runs out in ${daysLeft} day(s). It should be renewed soon.` };
  return { verdict: "ok", daysLeft, explain: `The certificate is trusted by your computer${daysLeft !== null ? ` and valid for ${daysLeft} more day(s)` : ""}.` };
}

export async function inspectTls(state: NetState, o: { host: string; port: number; timeoutMs: number }) {
  const log: LogLine[] = [];
  const started = performance.now();
  const out = {
    host: o.host, port: o.port, remoteIp: null as string | null, cert: null as null | (CertInfo & { daysLeft: number | null; altNames: string[]; selfSigned: boolean }),
    rows: [] as string[][], verdict: "bad" as "ok" | "warn" | "bad", explain: "", error: null as { code: string; message: string } | null, log,
  };
  pushLog(log, "info", `Opening a secure connection to ${o.host}:${o.port}...`);
  try {
    const looked = await lookupHost(state, o.host, o.timeoutMs);
    out.remoteIp = looked.ip;
    const left = Math.max(50, o.timeoutMs - (performance.now() - started));
    const info = await handshake(state, o.host, looked.ip, o.port, left);
    const { verdict, daysLeft, explain } = certVerdict(info);
    out.cert = { ...info, daysLeft, altNames: parseAltNames(info.san), selfSigned: JSON.stringify(info.subject) === JSON.stringify(info.issuer) };
    out.rows = describeCert(info);
    out.verdict = verdict;
    out.explain = explain;
    pushLog(log, verdict === "ok" ? "ok" : "warn", explain);
    addActivity(state, "tls", `${o.host}:${o.port}`, verdict, info.handshakeMs ?? null);
  } catch (err) {
    const code = errorCode(err);
    const known = describeNetError(code, o.host);
    out.error = code === "NO_CERT" ? { code, message: (err as Error).message } : known.code === "UNKNOWN" || (code ?? "").startsWith("ERR_SSL") || (code ?? "").startsWith("ERR_TLS")
      ? { code: "TLS_FAILED", message: "The secure handshake failed. That port may not use SSL/TLS (for example, it may be plain HTTP)." }
      : known;
    out.explain = out.error.message;
    pushLog(log, "error", out.error.message);
    addActivity(state, "tls", `${o.host}:${o.port}`, out.error.code.toLowerCase(), round1(performance.now() - started));
  }
  return out;
}

function handshake(state: NetState, host: string, ip: string, port: number, ms: number): Promise<CertInfo> {
  return new Promise<CertInfo>((resolve, reject) => {
    const started = performance.now();
    const socket = tls.connect({ host: ip, port, servername: isIP(host) ? undefined : host, rejectUnauthorized: false });
    state.sockets.add(socket);
    let settled = false;
    let stop = () => {};
    const end = (err: Error | null, info?: CertInfo) => {
      if (settled) return;
      settled = true;
      stop();
      state.sockets.delete(socket);
      socket.removeAllListeners();
      socket.on("error", () => {});
      socket.destroy();
      if (err || !info) reject(err ?? new Error("No certificate"));
      else resolve(info);
    };
    stop = timeout(state, () => end(Object.assign(new Error("No answer in time."), { code: "ETIMEDOUT" })), ms);
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.subject) return end(Object.assign(new Error("The server did not present a certificate."), { code: "NO_CERT" }));
      end(null, {
        authorized: socket.authorized,
        authError: socket.authorizationError ? cleanText(String(socket.authorizationError), 200) : null,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name ?? null,
        handshakeMs: round1(performance.now() - started),
        subject: asNames(cert.subject),
        issuer: asNames(cert.issuer),
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        san: cleanText(cert.subjectaltname ?? "", 2000),
        fingerprint256: cert.fingerprint256,
        serialNumber: cert.serialNumber,
      });
    });
    socket.once("error", (err: Error) => end(err));
    socket.once("close", () => end(Object.assign(new Error("The connection closed during the secure handshake."), { code: "ECONNRESET" })));
  });
}
