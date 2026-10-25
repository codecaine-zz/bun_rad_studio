/**
 * The live server's web server (static files). It serves one folder, read only, with Bun.serve.
 *
 * What it will not do: leave the folder (every request is resolved with realpath and checked), show hidden files
 * (names starting with "." are 404 unless allowed, and `.git` never), accept a request body, or answer a page that
 * isn't addressed to this computer (DNS-rebinding guard). Files are streamed from disk, never loaded whole,
 * except HTML pages in live mode, which get the reload script added.
 */
import { createHash } from "crypto";
import { promises as fsp, type Stats } from "fs";
import { networkInterfaces } from "os";
import * as nodePath from "path";
import type { Server } from "bun";
import { isSameOrInside, type Platform } from "./fmPaths";
import { LIVE_SCRIPT_PATH, LIVE_CLIENT_JS, LiveHub, injectLive } from "./fmServeLive";
import { isHtmlName, mimeFor } from "./fmServeMime";

export const MAX_URL_LENGTH = 4096;
export const MAX_HEADERS = 100;
export const MAX_INFLIGHT = 64;
export const MAX_LISTING = 5000;
const MAX_INJECT_BYTES = 8 * 1024 * 1024;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
// eslint-disable-next-line no-control-regex
const BAD_NAME = /[\\/\x00-\x1f\x7f]/;
const INDEX_FILES = ["index.html", "index.htm"];
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'";

export interface StaticOptions {
  /** The folder to serve (absolute). */
  root: string;
  host: string;
  port: number;
  /** Bound to all network interfaces: the Host header can then be any name this computer has. */
  lan?: boolean;
  liveReload?: boolean;
  dotfiles?: boolean;
  cors?: boolean;
  listing?: boolean;
  platform?: Platform;
  /** Folders that are never served even if they lie inside `root` (the File Manager's own files). */
  forbidden?: string[];
  /** Lines for the server's log: "GET /a.html 200 1.2 KB". */
  log?: (line: string) => void;
  /** Called for every real request (not the live-reload channel). */
  onRequest?: () => void;
  liveOptions?: { debounceMs?: number; maxDirs?: number; heartbeatMs?: number; maxClients?: number };
}

export interface StaticServer {
  readonly port: number;
  readonly host: string;
  readonly root: string;
  readonly live: LiveHub | null;
  /** In-flight requests, for tests and the status. */
  inflight(): number;
  stop(): Promise<void>;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const LIVE_CLIENT_ETAG = `"${createHash("sha1").update(LIVE_CLIENT_JS).digest("hex").slice(0, 16)}"`;

function pageHead(title: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>` +
    `<style>body{font:16px/1.5 system-ui,sans-serif;margin:2rem auto;max-width:56rem;padding:0 1rem;color:#222;background:#fff}@media(prefers-color-scheme:dark){body{color:#ddd;background:#181818}a{color:#8ab4f8}}` +
    `h1{font-size:1.3rem}ul{list-style:none;padding:0}li{padding:.15rem 0}.size{color:#888;margin-left:.6rem;font-size:.85em}</style></head><body>`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
}

export function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

/** Parses a Range header against a file size. */
export function parseRange(header: string | null, size: number): { kind: "none" } | { kind: "bad" } | { kind: "ok"; start: number; end: number } {
  if (!header) return { kind: "none" };
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  // Several ranges, or a header we don't understand: send the whole file (allowed by the HTTP rules).
  if (!m || (m[1] === "" && m[2] === "")) return { kind: "none" };
  if (m[1] === "") {
    const n = Number(m[2]);
    if (!Number.isSafeInteger(n) || n === 0 || size === 0) return { kind: "bad" };
    return { kind: "ok", start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const last = m[2] === "" ? size - 1 : Number(m[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(last)) return { kind: "bad" };
  if (m[2] !== "" && last < start) return { kind: "none" };
  if (start >= size) return { kind: "bad" };
  return { kind: "ok", start, end: Math.min(last, size - 1) };
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const strip = (t: string) => t.trim().replace(/^W\//, "");
  return header.split(",").some((t) => strip(t) === strip(etag));
}

/** A path as one safe line for a log. */
function printable(path: string): string {
  // eslint-disable-next-line no-control-regex
  const p = path.replace(/[\x00-\x1f\x7f]/g, "?");
  return p.length > 200 ? `${p.slice(0, 200)}…` : p;
}

class Site {
  private realRoot = "";
  private inflightCount = 0;
  private forbidden: string[] = [];
  port = 0;

  constructor(private o: StaticOptions, readonly live: LiveHub | null) {}

  async init(): Promise<void> {
    this.realRoot = await fsp.realpath(this.o.root);
    this.forbidden = await Promise.all((this.o.forbidden ?? []).map((f) => fsp.realpath(f).catch(() => nodePath.resolve(f))));
  }

  get inflight(): number {
    return this.inflightCount;
  }

  private platform(): Platform {
    return this.o.platform ?? (process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux");
  }

  private headers(extra: Record<string, string> = {}): Headers {
    const h = new Headers({ "X-Content-Type-Options": "nosniff", ...extra });
    if (this.o.cors) {
      h.set("Access-Control-Allow-Origin", "*");
      h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      h.set("Access-Control-Allow-Headers", "Range, If-None-Match, If-Modified-Since");
      h.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, ETag");
    }
    return h;
  }

  private page(status: number, title: string, body: string, method: string, extra: Record<string, string> = {}): Response {
    const tag = this.live ? `<script src="${LIVE_SCRIPT_PATH}" data-fm-live></script>` : "";
    const html = `${pageHead(title)}<h1>${escapeHtml(title)}</h1>${body}${tag}</body></html>`;
    const headers = this.headers({ "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": PAGE_CSP, "Cache-Control": "no-store", ...extra });
    return new Response(method === "HEAD" ? null : html, { status, headers });
  }

  private notFound(method: string): Response {
    return this.page(404, "Not found", "<p>There is no file at this address in the folder being served.</p>", method);
  }

  private denied(method: string, why = "This server only shows files inside the folder you chose."): Response {
    return this.page(403, "Not allowed", `<p>${escapeHtml(why)}</p>`, method);
  }

  private plain(status: number, text: string, extra: Record<string, string> = {}): Response {
    return new Response(text, { status, headers: this.headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra }) });
  }

  private hostAllowed(req: Request): boolean {
    if (this.o.lan) return true;
    const host = (req.headers.get("host") ?? "").toLowerCase();
    const p = this.port;
    return host === `127.0.0.1:${p}` || host === `localhost:${p}` || host === `[::1]:${p}`;
  }

  async handle(req: Request, srv: Server<undefined>): Promise<Response> {
    const method = req.method.toUpperCase();
    if (req.url.length > MAX_URL_LENGTH) return this.plain(414, "That address is too long.");
    let count = 0;
    for (const _ of req.headers) if (++count > MAX_HEADERS) return this.plain(431, "Too many headers.");
    if (!this.hostAllowed(req)) return this.plain(403, "Blocked: this server only answers requests addressed to 127.0.0.1 or localhost on its own port.");
    if (method === "OPTIONS" && this.o.cors) return new Response(null, { status: 204, headers: this.headers({ "Access-Control-Max-Age": "600" }) });
    if (method !== "GET" && method !== "HEAD") return this.plain(405, "This server only accepts GET and HEAD requests.", { Allow: this.o.cors ? "GET, HEAD, OPTIONS" : "GET, HEAD" });
    if (req.headers.has("transfer-encoding") || Number(req.headers.get("content-length") ?? 0) > 0) return this.plain(400, "This server doesn't accept a request body.");

    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      return this.plain(400, "That address isn't valid.");
    }
    const rawSegs = url.pathname.split("/").filter((s) => s !== "");
    if (rawSegs[0]?.toLowerCase() === "__live__") return this.liveRoute(req, srv, rawSegs, method);

    if (this.inflightCount >= MAX_INFLIGHT) return this.plain(503, "This server is busy. Try again in a moment.", { "Retry-After": "1" });
    this.inflightCount++;
    this.o.onRequest?.();
    let res: Response;
    try {
      res = await this.serve(req, url, rawSegs, method);
    } catch (err: any) {
      res = err?.code === "EACCES" || err?.code === "EPERM" ? this.denied(method, "The File Manager isn't allowed to read that file.") : this.plain(500, "Something went wrong while reading that file.");
    } finally {
      this.inflightCount--;
    }
    const size = res.headers.get("content-length");
    this.o.log?.(`${method} ${printable(url.pathname)} ${res.status}${size ? ` ${formatBytes(Number(size))}` : ""}`);
    return res;
  }

  private liveRoute(req: Request, srv: Server<undefined>, segs: string[], method: string): Response {
    if (!this.live) return this.notFound(method);
    if (segs.length === 1) {
      const res = this.live.connect();
      if (!res) return this.plain(503, "Too many pages are connected for live reload.");
      try { srv.timeout(req, 0); } catch {}
      return res;
    }
    if (segs.length === 2 && segs[1] === "client.js") {
      const headers = this.headers({ "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache", ETag: LIVE_CLIENT_ETAG });
      if (etagMatches(req.headers.get("if-none-match"), LIVE_CLIENT_ETAG)) return new Response(null, { status: 304, headers });
      return new Response(method === "HEAD" ? null : LIVE_CLIENT_JS, { headers });
    }
    return this.notFound(method);
  }

  /** The real path of `target` if it is inside the served folder; otherwise a Response that says why not. */
  private async inside(target: string, method: string): Promise<{ real: string } | { deny: Response }> {
    let real: string;
    try {
      real = await fsp.realpath(target);
    } catch (err: any) {
      if (err?.code === "EACCES" || err?.code === "EPERM") return { deny: this.denied(method, "The File Manager isn't allowed to read that.") };
      return { deny: this.notFound(method) };
    }
    const platform = this.platform();
    if (!isSameOrInside(real, this.realRoot, platform) || this.forbidden.some((f) => isSameOrInside(real, f, platform))) return { deny: this.denied(method) };
    const rel = nodePath.relative(this.realRoot, real).split(/[\\/]+/).filter(Boolean);
    if (rel.some((s) => s.toLowerCase() === ".git") || (!this.o.dotfiles && rel.some((s) => s.startsWith(".")))) return { deny: this.notFound(method) };
    return { real };
  }

  private async serve(req: Request, url: URL, rawSegs: string[], method: string): Promise<Response> {
    const segs: string[] = [];
    for (const raw of rawSegs) {
      let s: string;
      try {
        s = decodeURIComponent(raw);
      } catch {
        return this.plain(400, "That address isn't valid.");
      }
      if (BAD_NAME.test(s)) return this.plain(400, "That address isn't valid.");
      if (s === ".") continue;
      if (s === "..") return this.denied(method);
      if (s.toLowerCase() === ".git" || (!this.o.dotfiles && s.startsWith("."))) return this.notFound(method);
      if (WINDOWS_RESERVED.test(s) || (this.platform() === "win32" && (/[:<>"|?*]/.test(s) || /[. ]$/.test(s)))) return this.notFound(method);
      segs.push(s);
    }

    const found = await this.inside(nodePath.join(this.o.root, ...segs), method);
    if ("deny" in found) return found.deny;
    const st = await fsp.stat(found.real);

    if (st.isDirectory()) {
      if (!url.pathname.endsWith("/") && segs.length) {
        const location = `/${segs.map(encodeURIComponent).join("/")}/${url.search}`;
        return new Response(null, { status: 301, headers: this.headers({ Location: location, "Cache-Control": "no-store" }) });
      }
      for (const name of INDEX_FILES) {
        const idx = await this.inside(nodePath.join(this.o.root, ...segs, name), method);
        if ("deny" in idx) continue;
        const ist = await fsp.stat(idx.real).catch(() => null);
        if (ist?.isFile()) return this.file(req, idx.real, ist, name, method);
      }
      if (this.o.listing === false) return this.denied(method, "This folder has no index.html, and showing the list of files is turned off.");
      return this.listing(segs, found.real, method);
    }
    if (!st.isFile() || (url.pathname.endsWith("/") && segs.length)) return this.notFound(method);
    return this.file(req, found.real, st, segs[segs.length - 1] ?? "", method);
  }

  private async listing(segs: string[], dir: string, method: string): Promise<Response> {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err?.code === "EACCES" || err?.code === "EPERM") return this.denied(method, "The File Manager isn't allowed to read that folder.");
      return this.notFound(method);
    }
    const rows: Array<{ name: string; dir: boolean; size: number }> = [];
    const candidates = entries.filter(
      (e) => !(e.name.toLowerCase() === ".git" || (!this.o.dotfiles && e.name.startsWith(".")) || WINDOWS_RESERVED.test(e.name) || BAD_NAME.test(e.name)),
    );
    for (let i = 0; i < candidates.length && rows.length < MAX_LISTING; i += 64) {
      const batch = candidates.slice(i, i + 64);
      const resolved = await Promise.all(
        batch.map(async (e) => {
          const full = nodePath.join(dir, e.name);
          let isDir = e.isDirectory();
          let isFile = e.isFile();
          let size = 0;
          if (e.isSymbolicLink()) {
            const checked = await this.inside(full, method);
            if ("deny" in checked) return null;
            const st = await fsp.stat(checked.real).catch(() => null);
            isDir = !!st?.isDirectory();
            isFile = !!st?.isFile();
            size = st?.size ?? 0;
          } else if (isFile) {
            size = (await fsp.stat(full).catch(() => null))?.size ?? 0;
          }
          return isDir || isFile ? { name: e.name, dir: isDir, size } : null;
        }),
      );
      for (const item of resolved) {
        if (!item) continue;
        rows.push(item);
        if (rows.length >= MAX_LISTING) break;
      }
    }
    rows.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, "en", { numeric: true }));
    const here = `/${segs.map(encodeURIComponent).join("/")}${segs.length ? "/" : ""}`;
    const label = segs.length ? `/${segs.join("/")}/` : "/";
    const items = rows.map((r) => `<li><a href="${escapeHtml(`${here}${encodeURIComponent(r.name)}${r.dir ? "/" : ""}`)}">${r.dir ? "📁 " : "📄 "}${escapeHtml(r.name)}${r.dir ? "/" : ""}</a>${r.dir ? "" : `<span class="size">${formatBytes(r.size)}</span>`}</li>`);
    const up = segs.length ? `<li><a href="${escapeHtml(`/${segs.slice(0, -1).map(encodeURIComponent).join("/")}${segs.length > 1 ? "/" : ""}`)}">⬆️ ..</a></li>` : "";
    const note = rows.length >= MAX_LISTING ? `<p>Only the first ${MAX_LISTING.toLocaleString("en-US")} items are listed.</p>` : "";
    const body = `<ul>${up}${items.join("")}</ul>${rows.length ? "" : "<p>This folder is empty.</p>"}${note}`;
    return this.page(200, `Files in ${label}`, body, method);
  }

  private async file(req: Request, real: string, st: Stats, name: string, method: string): Promise<Response> {
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = this.headers({
      "Content-Type": mimeFor(name), ETag: etag, "Last-Modified": st.mtime.toUTCString(), "Accept-Ranges": "bytes",
      "Cache-Control": this.live ? "no-store" : "no-cache",
    });
    const inm = req.headers.get("if-none-match");
    const ims = req.headers.get("if-modified-since");
    const fresh = inm ? etagMatches(inm, etag) : !!ims && Number.isFinite(Date.parse(ims)) && Math.floor(st.mtimeMs / 1000) <= Math.floor(Date.parse(ims) / 1000);
    if (fresh) return new Response(null, { status: 304, headers });

    const range = parseRange(req.headers.get("range"), st.size);
    if (range.kind === "bad") {
      headers.set("Content-Range", `bytes */${st.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (range.kind === "ok") {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${st.size}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(method === "HEAD" ? null : Bun.file(real).slice(range.start, range.end + 1), { status: 206, headers });
    }

    if (this.live && isHtmlName(name) && st.size <= MAX_INJECT_BYTES) {
      const bytes = await fsp.readFile(real);
      const utf16 = bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
      if (!utf16) {
        // Searched and rewritten as latin1, which maps every byte to one character, so any other encoding passes through untouched.
        const out = Buffer.from(injectLive(bytes.toString("latin1")), "latin1");
        headers.set("Content-Length", String(out.length));
        return new Response(method === "HEAD" ? null : out, { headers });
      }
    }
    headers.set("Content-Length", String(st.size));
    return new Response(method === "HEAD" ? null : Bun.file(real), { headers });
  }
}

export async function startStaticServer(options: StaticOptions): Promise<StaticServer> {
  const live = options.liveReload ? new LiveHub({ root: options.root, allowDotfiles: options.dotfiles, onNote: (t) => options.log?.(`Note: ${t}`), ...options.liveOptions }) : null;
  const site = new Site(options, live);
  await site.init();
  let server: Server<undefined>;
  try {
    server = Bun.serve({
      hostname: options.host,
      port: options.port,
      maxRequestBodySize: 1024,
      idleTimeout: 30,
      development: false,
      // Without this, Bun lets a second server share a port that is already taken, instead of failing.
      reusePort: false,
      fetch: (req, srv) => site.handle(req, srv),
      error: () => new Response("Something went wrong.", { status: 500, headers: { "X-Content-Type-Options": "nosniff" } }),
    });
  } catch (err) {
    live?.stop();
    throw err;
  }
  site.port = server.port!;
  await live?.start();
  let stopped: Promise<void> | null = null;
  return {
    port: server.port!,
    host: options.host,
    root: options.root,
    live,
    inflight: () => site.inflight,
    stop() {
      stopped ??= (async () => {
        live?.stop();
        await server.stop(true);
      })();
      return stopped;
    },
  };
}
