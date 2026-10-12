/**
 * Pure and subprocess-backed helpers for Network Forensics Studio's productivity toolkit
 * (custom port lists, TCP ping, TLS certificate inspection, reverse DNS, HTML escaping).
 *
 * Subprocess scripts receive their input as JSON in an environment variable instead of being
 * string-interpolated, so user input can never alter the generated script.
 */
import { isIP } from "node:net";

export interface ScanResult {
  port: number;
  status: "OPEN" | "CLOSED" | "TIMEOUT";
  latencyMs: number;
}

export const SERVICE_NAMES: Record<number, string> = {
  20: "FTP Data", 21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS", 67: "DHCP", 80: "HTTP", 110: "POP3",
  123: "NTP", 139: "NetBIOS", 143: "IMAP", 161: "SNMP", 389: "LDAP", 443: "HTTPS", 445: "SMB", 465: "SMTPS",
  514: "Syslog", 587: "SMTP Submission", 636: "LDAPS", 993: "IMAPS", 995: "POP3S", 1433: "MS SQL", 1521: "Oracle",
  2049: "NFS", 2375: "Docker (unencrypted)", 2376: "Docker TLS", 3000: "Node/Vite Dev", 3306: "MySQL", 3389: "RDP",
  4200: "Angular Dev", 5000: "Flask/Registry", 5173: "Vite", 5432: "PostgreSQL", 5672: "RabbitMQ", 5900: "VNC",
  6379: "Redis", 8000: "Django/FastAPI", 8080: "HTTP Proxy/Dev", 8443: "HTTPS Alt", 8888: "Jupyter", 9000: "PHP-FPM/Portainer",
  9090: "Prometheus", 9200: "Elasticsearch", 11211: "Memcached", 27017: "MongoDB",
};

export function serviceName(port: number): string {
  return SERVICE_NAMES[port] || "Custom";
}

export const MAX_CUSTOM_PORTS = 1024;

/** Parse "22, 80, 443, 8000-8010" into a sorted, de-duplicated port list. */
export function parsePortSpec(spec: string, max = MAX_CUSTOM_PORTS): { ports: number[]; error?: string; truncated: boolean } {
  const set = new Set<number>();
  const tokens = String(spec || "").split(/[\s,;]+/).filter(Boolean);
  if (tokens.length === 0) return { ports: [], error: "Enter at least one port (e.g. 22,80,443 or 8000-8010)", truncated: false };
  for (const tok of tokens) {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(tok);
    if (!m) return { ports: [], error: `Invalid port or range: "${tok}"`, truncated: false };
    const a = parseInt(m[1]!, 10);
    const b = m[2] !== undefined ? parseInt(m[2], 10) : a;
    if (a < 1 || a > 65535 || b < 1 || b > 65535) return { ports: [], error: `Ports must be between 1 and 65535: "${tok}"`, truncated: false };
    if (b < a) return { ports: [], error: `Range start is greater than end: "${tok}"`, truncated: false };
    for (let p = a; p <= b; p++) {
      set.add(p);
      if (set.size > max * 4) break; // stop expanding absurd ranges early
    }
  }
  const all = [...set].sort((x, y) => x - y);
  return { ports: all.slice(0, max), truncated: all.length > max };
}

export function summarizeScan(results: ScanResult[]): { open: number; closed: number; timeout: number } {
  return {
    open: results.filter((r) => r.status === "OPEN").length,
    closed: results.filter((r) => r.status === "CLOSED").length,
    timeout: results.filter((r) => r.status === "TIMEOUT").length,
  };
}

const csvCell = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export function scanResultsToCsv(host: string, results: ScanResult[]): string {
  return [
    "host,port,service,status,latency_ms",
    ...results.map((r) => [host, r.port, serviceName(r.port), r.status, r.latencyMs].map(csvCell).join(",")),
  ].join("\n");
}

export function escapeHtml(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const STATUS_TEXT: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 303: "See Other",
  304: "Not Modified", 307: "Temporary Redirect", 308: "Permanent Redirect", 400: "Bad Request", 401: "Unauthorized",
  403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout", 409: "Conflict", 410: "Gone",
  418: "I'm a teapot", 429: "Too Many Requests", 500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway",
  503: "Service Unavailable", 504: "Gateway Timeout",
};
export function httpStatusText(code: number): string {
  return STATUS_TEXT[code] || `HTTP ${code}`;
}

// ---------------------------------------------------------------------------
// Latency statistics
// ---------------------------------------------------------------------------

export interface LatencySummary {
  sent: number;
  received: number;
  lossPct: number;
  min: number | null;
  avg: number | null;
  max: number | null;
  jitter: number | null;
}

/** `null` samples are failed attempts. Jitter is the mean absolute difference of consecutive replies. */
export function summarizeLatencies(samples: (number | null)[]): LatencySummary {
  const ok = samples.filter((s): s is number => typeof s === "number");
  const sent = samples.length;
  if (ok.length === 0) return { sent, received: 0, lossPct: sent === 0 ? 0 : 100, min: null, avg: null, max: null, jitter: null };
  const sum = ok.reduce((a, b) => a + b, 0);
  let jit = 0;
  for (let i = 1; i < ok.length; i++) jit += Math.abs(ok[i]! - ok[i - 1]!);
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    sent,
    received: ok.length,
    lossPct: r(((sent - ok.length) / sent) * 100),
    min: r(Math.min(...ok)),
    avg: r(sum / ok.length),
    max: r(Math.max(...ok)),
    jitter: ok.length > 1 ? r(jit / (ok.length - 1)) : 0,
  };
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export function daysUntil(dateStr: string, now = Date.now()): number | null {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now) / 86_400_000);
}

export interface CertInfo {
  authorized?: boolean;
  authError?: string | null;
  protocol?: string | null;
  cipher?: string | null;
  handshakeMs?: number;
  subject?: Record<string, string>;
  issuer?: Record<string, string>;
  validFrom?: string;
  validTo?: string;
  san?: string;
  fingerprint256?: string;
  serialNumber?: string;
  error?: string;
}

const dn = (o?: Record<string, string>) => (o ? o.CN || o.O || Object.values(o).join(", ") : "-");

/** Turn certificate info into [label, value] rows, with an expiry verdict. */
export function describeCert(c: CertInfo, now = Date.now()): string[][] {
  if (c.error) return [["Error", c.error]];
  const days = c.validTo ? daysUntil(c.validTo, now) : null;
  const expiry =
    days === null ? "Unknown" : days < 0 ? `EXPIRED ${Math.abs(days)} day(s) ago` : days <= 14 ? `Expires soon (${days} day(s))` : `Valid for ${days} more day(s)`;
  return [
    ["Subject (CN)", dn(c.subject)],
    ["Issuer", dn(c.issuer)],
    ["Valid From", c.validFrom || "-"],
    ["Valid Until", c.validTo || "-"],
    ["Expiry Status", expiry],
    ["Trusted by System", c.authorized ? "Yes" : `No${c.authError ? ` (${c.authError})` : ""}`],
    ["Protocol", c.protocol || "-"],
    ["Cipher", c.cipher || "-"],
    ["Handshake", c.handshakeMs !== undefined ? `${c.handshakeMs}ms` : "-"],
    ["Alt Names", (c.san || "-").replace(/DNS:/g, "").replace(/,\s*/g, ", ")],
    ["SHA-256 Fingerprint", c.fingerprint256 || "-"],
    ["Serial", c.serialNumber || "-"],
  ];
}

// ---------------------------------------------------------------------------
// Subprocess helpers
// ---------------------------------------------------------------------------

function runScript(script: string, payload: unknown, timeoutMs: number): any {
  const proc = Bun.spawnSync([process.execPath, "-e", script], {
    env: { ...process.env, NET_PAYLOAD: JSON.stringify(payload) },
    timeout: timeoutMs,
  });
  const out = proc.stdout.toString().trim();
  if (!out) throw new Error(proc.stderr.toString().trim() || "No output from network helper");
  return JSON.parse(out.split("\n").pop()!);
}

const PORT_SCRIPT = `
import * as net from "node:net";
const p = JSON.parse(process.env.NET_PAYLOAD);
function probe(port) {
  return new Promise((res) => {
    const t0 = performance.now();
    const s = new net.Socket();
    let done = false;
    const fin = (status) => {
      if (done) return;
      done = true;
      const lat = status === "TIMEOUT" ? p.timeout : parseFloat((performance.now() - t0).toFixed(1));
      s.destroy();
      res({ port, status, latencyMs: lat });
    };
    s.setTimeout(p.timeout);
    s.on("connect", () => fin("OPEN"));
    s.on("timeout", () => fin("TIMEOUT"));
    s.on("error", () => fin("CLOSED"));
    try { s.connect(port, p.host); } catch { fin("CLOSED"); }
  });
}
const out = [];
let i = 0;
const workers = Array.from({ length: Math.max(1, Math.min(p.concurrency, p.ports.length)) }, async () => {
  while (i < p.ports.length) { const port = p.ports[i++]; out.push(await probe(port)); }
});
await Promise.all(workers);
out.sort((a, b) => a.port - b.port);
console.log(JSON.stringify(out));
`;

/** Scan an arbitrary port list with bounded concurrency. */
export function checkPortsSync(host: string, ports: number[], timeoutMs = 500, concurrency = 128): ScanResult[] {
  if (ports.length === 0) return [];
  const timeout = Math.max(50, Math.min(10_000, timeoutMs));
  const budget = Math.ceil(ports.length / Math.max(1, concurrency)) * timeout + 8000;
  try {
    return runScript(PORT_SCRIPT, { host, ports, timeout, concurrency }, budget);
  } catch {
    return ports.map((port) => ({ port, status: "CLOSED" as const, latencyMs: 0 }));
  }
}

const PING_SCRIPT = `
import * as net from "node:net";
const p = JSON.parse(process.env.NET_PAYLOAD);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function once() {
  return new Promise((res) => {
    const t0 = performance.now();
    const s = new net.Socket();
    let done = false;
    const fin = (v) => { if (done) return; done = true; s.destroy(); res(v); };
    s.setTimeout(p.timeout);
    s.on("connect", () => fin(parseFloat((performance.now() - t0).toFixed(1))));
    s.on("timeout", () => fin(null));
    s.on("error", () => fin(null));
    try { s.connect(p.port, p.host); } catch { fin(null); }
  });
}
const samples = [];
for (let i = 0; i < p.count; i++) { samples.push(await once()); if (i < p.count - 1) await sleep(150); }
console.log(JSON.stringify(samples));
`;

/** Time repeated TCP connects to host:port. `null` = no reply within the timeout. */
export function tcpPingSync(host: string, port: number, count = 5, timeoutMs = 1000): (number | null)[] {
  const n = Math.max(1, Math.min(20, count));
  try {
    return runScript(PING_SCRIPT, { host, port, count: n, timeout: timeoutMs }, n * (timeoutMs + 200) + 8000);
  } catch {
    return Array.from({ length: n }, () => null);
  }
}

const TLS_SCRIPT = `
import * as tls from "node:tls";
import * as net from "node:net";
const p = JSON.parse(process.env.NET_PAYLOAD);
const t0 = performance.now();
let printed = false;
const print = (o) => { if (printed) return; printed = true; console.log(JSON.stringify(o)); process.exit(0); };
const opts = { host: p.host, port: p.port, rejectUnauthorized: false, timeout: p.timeout };
if (!net.isIP(p.host)) opts.servername = p.host;
const s = tls.connect(opts, () => {
  const c = s.getPeerCertificate();
  if (!c || !c.subject) return print({ error: "The server did not present a certificate" });
  print({
    authorized: s.authorized,
    authError: s.authorizationError ? String(s.authorizationError) : null,
    protocol: s.getProtocol(),
    cipher: s.getCipher() ? s.getCipher().name : null,
    handshakeMs: parseFloat((performance.now() - t0).toFixed(1)),
    subject: c.subject, issuer: c.issuer, validFrom: c.valid_from, validTo: c.valid_to,
    san: c.subjectaltname, fingerprint256: c.fingerprint256, serialNumber: c.serialNumber,
  });
});
s.on("error", (e) => print({ error: e.message }));
s.on("timeout", () => print({ error: "Connection timed out" }));
`;

export function getTlsCertSync(host: string, port = 443, timeoutMs = 4000): CertInfo {
  try {
    return runScript(TLS_SCRIPT, { host, port, timeout: timeoutMs }, timeoutMs + 6000);
  } catch (e: any) {
    return { error: e?.message || "TLS inspection failed" };
  }
}

const PTR_SCRIPT = `
import dns from "node:dns/promises";
const p = JSON.parse(process.env.NET_PAYLOAD);
try { console.log(JSON.stringify({ hostnames: await dns.reverse(p.ip) })); }
catch (e) { console.log(JSON.stringify({ hostnames: [], error: e.code || e.message })); }
`;

/** Reverse DNS (PTR) lookup for an IP literal. */
export function reversePtrSync(ip: string): { hostnames: string[]; error?: string } {
  if (isIP(ip) === 0) return { hostnames: [], error: "Reverse DNS needs an IP address (not a hostname)" };
  try {
    return runScript(PTR_SCRIPT, { ip }, 8000);
  } catch (e: any) {
    return { hostnames: [], error: e?.message || "Reverse lookup failed" };
  }
}
