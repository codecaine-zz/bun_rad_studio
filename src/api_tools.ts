/**
 * Pure helpers for API Studio (URL handling, {{variables}}, cURL import/export,
 * request files, benchmark statistics, history). No GUI and no network access.
 */

export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;
export const AUTH_MODES = ["None", "Bearer Token", "Basic Auth", "API Key Header"] as const;

export function methodHasBody(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

/** Methods that can change server state; used to warn before repeating them in a benchmark. */
export function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function clampInt(v: any, min: number, max: number, dflt: number): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/**
 * Validate and complete a user-typed URL. Only http(s) is accepted (curl would otherwise happily read
 * file:// paths). A missing scheme becomes http:// for local addresses and https:// for everything else.
 */
export function normalizeUrl(raw: string): { url: string; error?: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { url: "", error: "Enter a URL" };
  if (/[\s\u0000-\u001f]/.test(s)) return { url: s, error: "The URL contains spaces or control characters" };
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
  let url = s;
  if (scheme) {
    const sch = scheme[1]!.toLowerCase();
    if (sch !== "http" && sch !== "https") return { url: s, error: `Only http:// and https:// URLs are supported (got ${sch}://)` };
  } else {
    const host = s.split(/[/?#]/)[0]!.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
    const local = host === "localhost" || host === "0.0.0.0" || host === "::1" || /^127\./.test(host) || host.endsWith(".local") || host.endsWith(".localhost");
    url = `${local ? "http" : "https"}://${s}`;
  }
  try {
    new URL(url);
  } catch {
    return { url: s, error: "That does not look like a valid URL" };
  }
  return { url };
}

/** Append `key=value` lines (or `a=1&b=2`) to a URL, percent-encoding anything not already encoded. */
export function buildUrl(url: string, paramsText: string): string {
  const enc = (x: string) => (/%[0-9a-f]{2}/i.test(x) ? x : encodeURIComponent(x));
  const pairs = String(paramsText || "")
    .split(/[\r\n&]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return i < 0 ? `${enc(p)}=` : `${enc(p.slice(0, i).trim())}=${enc(p.slice(i + 1).trim())}`;
    });
  if (pairs.length === 0) return url;
  const hashAt = url.indexOf("#");
  const base = hashAt < 0 ? url : url.slice(0, hashAt);
  const frag = hashAt < 0 ? "" : url.slice(hashAt);
  const sep = base.includes("?") ? (/[?&]$/.test(base) ? "" : "&") : "?";
  return base + sep + pairs.join("&") + frag;
}

// ---------------------------------------------------------------------------
// Variables: {{name}} plus {{$timestamp}}, {{$isoTimestamp}}, {{$uuid}}, {{$randomInt}}
// ---------------------------------------------------------------------------

export function parseVariables(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export function applyVariables(text: string, vars: Record<string, string>, now = new Date()): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = String(text ?? "").replace(/\{\{\s*([$A-Za-z_][\w.$-]*)\s*\}\}/g, (whole, name: string) => {
    switch (name) {
      case "$timestamp": return String(Math.floor(now.getTime() / 1000));
      case "$isoTimestamp": return now.toISOString();
      case "$uuid": return crypto.randomUUID();
      case "$randomInt": return String(Math.floor(Math.random() * 1000));
    }
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name]!;
    missing.add(name);
    return whole;
  });
  return { text: out, missing: [...missing] };
}

// ---------------------------------------------------------------------------
// Headers & auth
// ---------------------------------------------------------------------------

export function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    if (k) out[k] = line.slice(i + 1).trim();
  }
  return out;
}

export function applyAuth(headers: Record<string, string>, mode: string, cred: string): Record<string, string> {
  const out = { ...headers };
  const c = String(cred || "").trim();
  if (!c) return out;
  if (mode === "Bearer Token") out["Authorization"] = `Bearer ${c}`;
  else if (mode === "Basic Auth") out["Authorization"] = `Basic ${Buffer.from(c).toString("base64")}`;
  else if (mode === "API Key Header") out["X-API-Key"] = c;
  return out;
}

export function hasHeader(headers: Record<string, string>, name: string): boolean {
  const n = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === n);
}

/** Add a Content-Type for bodies the user did not label (curl would send form-encoded by default). */
export function withDefaultContentType(headers: Record<string, string>, method: string, body: string): Record<string, string> {
  if (!body.trim() || !methodHasBody(method) || hasHeader(headers, "content-type")) return headers;
  return { ...headers, "Content-Type": /^\s*[{[]/.test(body) ? "application/json" : "text/plain" };
}

// ---------------------------------------------------------------------------
// cURL export / import
// ---------------------------------------------------------------------------

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export interface CurlExport {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  follow?: boolean;
  insecure?: boolean;
  timeoutSec?: number;
}

export function buildCurlCommand(r: CurlExport): string {
  const parts = [r.method === "HEAD" ? `curl -I ${sq(r.url)}` : `curl -X ${r.method} ${sq(r.url)}`];
  for (const [k, v] of Object.entries(r.headers)) parts.push(`-H ${sq(`${k}: ${v}`)}`);
  if (r.body && methodHasBody(r.method)) parts.push(`--data-raw ${sq(r.body)}`);
  if (r.follow) parts.push("-L");
  if (r.insecure) parts.push("-k");
  if (r.timeoutSec) parts.push(`-m ${r.timeoutSec}`);
  return parts.join(" \\\n  ");
}

/** Split a shell command line into arguments (single/double quotes, $'..', backslashes, line continuations). */
export function tokenizeShell(cmd: string): string[] {
  const s = String(cmd || "").replace(/\\\r?\n/g, " ");
  const out: string[] = [];
  let cur = "";
  let has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (/\s/.test(c)) {
      if (has) { out.push(cur); cur = ""; has = false; }
    } else if (c === "'") {
      has = true;
      const end = s.indexOf("'", i + 1);
      if (end < 0) throw new Error("Unterminated single quote in the cURL command");
      cur += s.slice(i + 1, end);
      i = end;
    } else if (c === "$" && s[i + 1] === "'") {
      has = true;
      i += 2;
      for (; i < s.length && s[i] !== "'"; i++) {
        if (s[i] === "\\" && i + 1 < s.length) {
          const n = s[++i]!;
          cur += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n;
        } else cur += s[i];
      }
      if (i >= s.length) throw new Error("Unterminated $'...' string in the cURL command");
    } else if (c === '"') {
      has = true;
      i++;
      for (; i < s.length && s[i] !== '"'; i++) {
        if (s[i] === "\\" && i + 1 < s.length && /["\\$`]/.test(s[i + 1]!)) cur += s[++i];
        else cur += s[i];
      }
      if (i >= s.length) throw new Error("Unterminated double quote in the cURL command");
    } else if (c === "\\" && i + 1 < s.length) {
      has = true;
      cur += s[++i];
    } else {
      has = true;
      cur += c;
    }
  }
  if (has) out.push(cur);
  return out;
}

export interface ParsedCurl {
  method: string;
  url: string;
  headers: [string, string][];
  body: string;
  authMode?: string;
  authCred?: string;
  follow: boolean;
  insecure: boolean;
  timeoutSec?: number;
}

const VALUE_FLAGS: Record<string, string> = {
  "-X": "method", "--request": "method", "-H": "header", "--header": "header", "-d": "data", "--data": "data",
  "--data-raw": "data", "--data-binary": "data", "--data-ascii": "data", "--data-urlencode": "data", "--json": "json",
  "-u": "user", "--user": "user", "--url": "url", "-A": "agent", "--user-agent": "agent", "-e": "referer", "--referer": "referer",
  "-b": "cookie", "--cookie": "cookie", "-m": "timeout", "--max-time": "timeout",
};

/** Parse a pasted `curl ...` command (including Chrome/Firefox "Copy as cURL") into request fields. */
export function parseCurlCommand(cmd: string): ParsedCurl {
  const tokens = tokenizeShell(cmd.trim().replace(/^\$\s+/, ""));
  if (tokens.length === 0 || tokens[0] !== "curl") throw new Error("That is not a cURL command (it must start with \"curl\")");
  const r: ParsedCurl = { method: "", url: "", headers: [], body: "", follow: false, insecure: false };
  const data: string[] = [];
  let head = false;
  const handle = (kind: string, val: string) => {
    switch (kind) {
      case "method": r.method = val.toUpperCase(); break;
      case "header": {
        const i = val.indexOf(":");
        if (i > 0) r.headers.push([val.slice(0, i).trim(), val.slice(i + 1).trim()]);
        break;
      }
      case "data": data.push(val); break;
      case "json":
        data.push(val);
        if (!r.headers.some(([k]) => k.toLowerCase() === "content-type")) r.headers.push(["Content-Type", "application/json"]);
        if (!r.headers.some(([k]) => k.toLowerCase() === "accept")) r.headers.push(["Accept", "application/json"]);
        break;
      case "user": r.authMode = "Basic Auth"; r.authCred = val; break;
      case "url": r.url = val; break;
      case "agent": r.headers.push(["User-Agent", val]); break;
      case "referer": r.headers.push(["Referer", val]); break;
      case "cookie": r.headers.push(["Cookie", val]); break;
      case "timeout": { const n = parseFloat(val); if (Number.isFinite(n) && n > 0) r.timeoutSec = Math.ceil(n); break; }
    }
  };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t in VALUE_FLAGS) {
      if (i + 1 >= tokens.length) throw new Error(`Missing value after ${t}`);
      handle(VALUE_FLAGS[t]!, tokens[++i]!);
    } else if (t.startsWith("--")) {
      if (t === "--location") r.follow = true;
      else if (t === "--insecure") r.insecure = true;
      else if (t === "--head") head = true;
      else if (t.includes("=") && VALUE_FLAGS[t.slice(0, t.indexOf("="))]) handle(VALUE_FLAGS[t.slice(0, t.indexOf("="))]!, t.slice(t.indexOf("=") + 1));
      // other long flags (--compressed, --silent, ...) are ignored
    } else if (t.startsWith("-") && t.length > 1) {
      // short flag cluster, e.g. -sSL or -XPOST
      for (let j = 1; j < t.length; j++) {
        const f = "-" + t[j];
        if (f in VALUE_FLAGS) {
          const rest = t.slice(j + 1);
          if (rest) handle(VALUE_FLAGS[f]!, rest);
          else if (i + 1 < tokens.length) handle(VALUE_FLAGS[f]!, tokens[++i]!);
          else throw new Error(`Missing value after ${f}`);
          break;
        }
        if (f === "-L") r.follow = true;
        else if (f === "-k") r.insecure = true;
        else if (f === "-I") head = true;
      }
    } else if (!r.url) {
      r.url = t;
    }
  }
  if (!r.url) throw new Error("The cURL command has no URL");
  r.body = data.join("&");
  r.method = head ? "HEAD" : r.method || (r.body ? "POST" : "GET");
  return r;
}

// ---------------------------------------------------------------------------
// Request files
// ---------------------------------------------------------------------------

export interface RequestFile {
  format: "bun-rad-api-request";
  version: 1;
  method: string;
  url: string;
  headers: string;
  body: string;
  query: string;
  vars: string;
  authMode: string;
}

/** Serialize a request. Credentials are deliberately never written to the file. */
export function serializeRequest(r: Omit<RequestFile, "format" | "version">): string {
  const f: RequestFile = { format: "bun-rad-api-request", version: 1, ...r };
  return JSON.stringify(f, null, 2);
}

export function parseRequestFile(text: string): RequestFile {
  let o: any;
  try { o = JSON.parse(text); } catch { throw new Error("The file is not valid JSON"); }
  if (!o || o.format !== "bun-rad-api-request") throw new Error("Not an API Studio request file");
  const str = (v: any) => (typeof v === "string" ? v : "");
  const method = str(o.method).toUpperCase();
  return {
    format: "bun-rad-api-request",
    version: 1,
    method: (HTTP_METHODS as readonly string[]).includes(method) ? method : "GET",
    url: str(o.url),
    headers: str(o.headers),
    body: str(o.body),
    query: str(o.query),
    vars: str(o.vars),
    authMode: (AUTH_MODES as readonly string[]).includes(str(o.authMode)) ? str(o.authMode) : "None",
  };
}

// ---------------------------------------------------------------------------
// Benchmark & history
// ---------------------------------------------------------------------------

export async function runPool<T>(n: number, concurrency: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const results: T[] = new Array(n);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, n)) }, async () => {
    while (next < n) {
      const i = next++;
      results[i] = await fn(i);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface BenchStats {
  count: number;
  min: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  rps: number;
}

export function summarizeBench(latencies: number[], totalMs: number): BenchStats | null {
  if (latencies.length === 0) return null;
  const l = [...latencies].sort((a, b) => a - b);
  const pct = (p: number) => l[Math.min(l.length - 1, Math.floor(p * l.length))]!;
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    count: l.length,
    min: r(l[0]!),
    avg: r(l.reduce((a, b) => a + b, 0) / l.length),
    p50: r(pct(0.5)),
    p95: r(pct(0.95)),
    p99: r(pct(0.99)),
    max: r(l[l.length - 1]!),
    rps: totalMs > 0 ? r((l.length / totalMs) * 1000) : 0,
  };
}

export interface HistoryEntry {
  id: number;
  method: string;
  url: string;
  status: number;
  ms: string;
  time: string;
  headers: string;
  body: string;
}

export function pushHistory(list: HistoryEntry[], e: HistoryEntry, max = 30): HistoryEntry[] {
  return [e, ...list].slice(0, max);
}
