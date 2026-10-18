/**
 * The File Manager's download engine: fast downloads that are split over several connections, can be paused and
 * resumed (even after the program was closed), retry on their own and can be speed limited.
 *
 * How a download works:
 *   1. Probe: one small request (`Range: bytes=0-0`) tells the size, whether the server accepts ranges, the file's
 *      ETag and the name it wants to be saved as. The final address after redirects is used from then on.
 *   2. If ranges work and the size is known the file is cut into chunks and N workers take chunks in turn, each with
 *      its own connection, writing straight to the right place in the `.part` file. A fast connection simply takes
 *      more chunks, so the slowest connection never decides the speed.
 *   3. Progress (which chunks are done, how far each unfinished one got) is saved next to the file (`.dlstate`), so a
 *      pause, a crash or a restart continues where it stopped. The saved file is checked against the server's ETag
 *      and size first, so a file that changed is never stitched together from two versions.
 *   4. Servers without ranges are downloaded in one stream (and resumed with `Range: bytes=N-` when they allow it).
 *   5. When all bytes are there the `.part` file is renamed, and a checksum (if one was given) is verified.
 *
 * Nothing here talks to the page: fmDownloadOps.ts wraps it in API calls.
 */
import { createHash, randomBytes } from "crypto";
import * as fs from "fs";
import { promises as fsp } from "fs";
import * as nodePath from "path";

export type DlState = "queued" | "probing" | "downloading" | "paused" | "verifying" | "done" | "error";

export interface DlSettings {
  /** Connections used for each file (1 to MAX_CONNECTIONS). */
  connections: number;
  /** Files downloading at the same time. */
  maxConcurrent: number;
  /** Bytes per second for everything together; 0 = no limit. */
  speedLimit: number;
  /** Where files go unless a folder is chosen. */
  folder: string;
  /** Tries per chunk before giving up. */
  retries: number;
}

export interface DlRequest {
  url: string;
  folder?: string;
  /** Save as this name instead of the one the server or the address suggests. */
  name?: string;
  connections?: number;
  /** Extra request headers (cookies, a referer, an authorization token ...). */
  headers?: Record<string, string>;
  /** `sha256:<hex>` (or md5, sha1, sha512), or just the hex digits. Checked when the download ends. */
  checksum?: string;
  /** Start now (default) or add it paused. */
  start?: boolean;
}

export interface DlItem {
  id: string;
  /** What was asked for. */
  url: string;
  /** Where the file really is after redirects, used for the data requests. */
  finalUrl?: string;
  folder: string;
  name: string;
  /** The final path of the file (the `.part` file sits next to it while it downloads). */
  path: string;
  state: DlState;
  size: number | null;
  received: number;
  /** Bytes per second, averaged over the last few seconds. */
  speed: number;
  /** Seconds left, when the size and the speed are known. */
  eta: number | null;
  connections: number;
  /** Connections working right now. */
  active: number;
  /** A pause keeps what was downloaded. */
  resumable: boolean | null;
  message?: string;
  addedAt: number;
  startedAt?: number;
  finishedAt?: number;
  checksum?: { algo: string; value: string };
  /** true / false after a checksum check, null when none was asked for. */
  verified: boolean | null;
  headers?: Record<string, string>;
  etag?: string;
  lastModified?: string;
  mime?: string;
}

/** What the page sees: the same, without the header values (they can hold secrets). */
export type DlView = Omit<DlItem, "headers" | "finalUrl"> & { headerNames: string[] };

export const MAX_CONNECTIONS = 32;
export const MAX_CONCURRENT = 10;
const MIN_CHUNK = 512 * 1024;
const MAX_CHUNK = 16 * 1024 * 1024;
const STATE_VERSION = 1;

export const DEFAULT_SETTINGS = (folder: string): DlSettings => ({ connections: 8, maxConcurrent: 3, speedLimit: 0, folder, retries: 6 });

/* ------------------------------------------------------------------------------------------------ small helpers */

class DlError extends Error {
  constructor(message: string, readonly fatal = true, readonly retryAfterMs = 0) {
    super(message);
    this.name = "DlError";
  }
}

const isAbort = (err: unknown) => (err as any)?.name === "AbortError" || (err as any)?.code === "ABORT_ERR";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Spreads a speed limit over every connection of every download. */
export class RateLimiter {
  limit = 0;
  private next = 0;
  async take(bytes: number, signal?: AbortSignal): Promise<void> {
    if (!this.limit || bytes <= 0) return;
    const now = Date.now();
    const start = Math.max(now, this.next);
    this.next = start + (bytes / this.limit) * 1000;
    const wait = start - now - 250; // a quarter second of burst keeps small reads cheap
    if (wait > 0) await sleep(wait, signal);
  }
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** A name that is safe to create on every system: no folders, no control or reserved characters. */
export function safeFileName(raw: string, fallback = "download"): string {
  let n = String(raw ?? "").replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_").replace(/^[. ]+|[. ]+$/g, "");
  if (!n) n = fallback;
  if (RESERVED.test(n)) n = `_${n}`;
  if (n.length > 180) {
    const ext = nodePath.extname(n).slice(0, 20);
    n = n.slice(0, 180 - ext.length) + ext;
  }
  return n;
}

/** The name from a Content-Disposition header (`filename*=UTF-8''...` first), or null. */
export function nameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[2]!.trim());
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header) ?? /filename\s*=\s*([^;]+)/i.exec(header);
  return plain ? plain[1]!.trim().replace(/\\(.)/g, "$1") : null;
}

export function nameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
    return last || "download";
  } catch {
    return "download";
  }
}

/** A path in `folder` that nothing uses yet (also not as a `.part` file): `name.ext`, `name (1).ext`, `name (2).ext` ... */
export function uniquePath(folder: string, name: string, taken: (path: string) => boolean = () => false): string {
  const ext = nodePath.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 0; i < 10000; i++) {
    const candidate = nodePath.join(folder, i === 0 ? name : `${stem} (${i})${ext}`);
    if (!fs.existsSync(candidate) && !fs.existsSync(`${candidate}.part`) && !fs.existsSync(`${candidate}.dlstate`) && !taken(candidate)) return candidate;
  }
  throw new DlError("Couldn't find a free file name.");
}

export function parseChecksum(input: string | undefined): { algo: string; value: string } | undefined {
  if (!input?.trim()) return undefined;
  const text = input.trim().toLowerCase();
  const m = /^(sha256|sha512|sha1|md5)\s*[:=]\s*([0-9a-f]+)$/.exec(text);
  const [algo, value] = m ? [m[1]!, m[2]!] : [({ 32: "md5", 40: "sha1", 64: "sha256", 128: "sha512" } as Record<number, string>)[text.length], text];
  const lengths: Record<string, number> = { md5: 32, sha1: 40, sha256: 64, sha512: 128 };
  if (!algo || !/^[0-9a-f]+$/.test(value) || value.length !== lengths[algo]) throw new DlError("That checksum isn't valid. Use sha256:<64 hex digits> (or md5, sha1, sha512).");
  return { algo, value };
}

/** Only plain request headers; no line breaks and no names a request can't carry. */
export function cleanHeaders(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  const blocked = /^(host|content-length|connection|transfer-encoding|range|if-range|upgrade|te|trailer|keep-alive|proxy-.*)$/i;
  for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, 30)) {
    if (typeof v !== "string" || !/^[A-Za-z0-9-]{1,60}$/.test(k) || blocked.test(k) || /[\r\n\0]/.test(v) || v.length > 4000) continue;
    out[k] = v;
  }
  return out;
}

/** Splits `https://user:pass@host/x` into a credential-free address and an Authorization header (fetch refuses credentials in addresses). */
export function splitCredentials(url: string): { url: string; auth?: string } {
  const u = new URL(url);
  if (!u.username && !u.password) return { url };
  const auth = `Basic ${Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString("base64")}`;
  u.username = "";
  u.password = "";
  return { url: u.toString(), auth };
}

export function parseWebUrl(input: string): URL {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new DlError(`"${input.trim().slice(0, 80)}" isn't a web address.`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new DlError("Only http:// and https:// addresses can be downloaded.");
  if (input.length > 8000) throw new DlError("That address is too long.");
  return u;
}

/* ------------------------------------------------------------------------------------------------ probing */

export interface ProbeResult {
  finalUrl: string;
  size: number | null;
  ranges: boolean;
  etag?: string;
  lastModified?: string;
  name: string;
  mime?: string;
}

const SENSITIVE_HEADERS = /^(authorization|cookie|proxy-authorization)$/i;

/** The request headers for `url`. Logins and cookies were meant for the address that was asked for, so they are not sent to a different site (a CDN or storage host a redirect leads to). */
function requestHeaders(item: { headers?: Record<string, string>; url?: string }, extra: Record<string, string> = {}, url?: string): Record<string, string> {
  let headers = item.headers ?? {};
  if (url && item.url) {
    try {
      if (new URL(url).origin !== new URL(item.url).origin) headers = Object.fromEntries(Object.entries(headers).filter(([k]) => !SENSITIVE_HEADERS.test(k)));
    } catch {
      /* keep the headers when an address can't be read: the request would fail anyway */
    }
  }
  return { "User-Agent": "Mozilla/5.0 (compatible; CodecaineFileManager/1.0)", "Accept": "*/*", "Accept-Encoding": "identity", ...headers, ...extra };
}

function httpProblem(status: number, retryAfter: string | null): DlError {
  const wait = retryAfter && /^\d+$/.test(retryAfter) ? Math.min(60, Number(retryAfter)) * 1000 : 0;
  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 408) return new DlError(`The server is busy (HTTP ${status}).`, false, wait);
  if (status === 401 || status === 403) return new DlError(`The server refused the download (HTTP ${status}). It may need a login, a cookie, or the link has expired.`);
  if (status === 404 || status === 410) return new DlError(`The file isn't there any more (HTTP ${status}).`);
  if (status >= 500) return new DlError(`The server had a problem (HTTP ${status}).`, false, wait);
  return new DlError(`The server answered HTTP ${status}.`);
}

const MAX_REDIRECTS = 10;

/** Asks the server about a file with one tiny ranged request. Follows redirects itself, so logins never go to another site. */
export async function probeUrl(url: string, headers: Record<string, string> | undefined, fetchFn: typeof fetch, signal?: AbortSignal): Promise<ProbeResult> {
  const { url: clean, auth } = splitCredentials(parseWebUrl(url).toString());
  const original = { url: clean, headers: { ...(headers ?? {}), ...(auth && !headers?.Authorization ? { Authorization: auth } : {}) } };
  let current = clean;
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      res = await fetchFn(current, { headers: requestHeaders(original, { Range: "bytes=0-0" }, current), redirect: "manual", signal });
    } catch (err: any) {
      if (isAbort(err)) throw err;
      throw new DlError(`Couldn't reach the server: ${String(err?.message ?? err).split("\n")[0]}`, false);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      res.body?.cancel().catch(() => {});
      let next: URL;
      try {
        next = new URL(res.headers.get("location")!, current);
      } catch {
        throw new DlError("The server sent a redirect that can't be followed.");
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") throw new DlError("The server redirected to an address that isn't a web address.");
      current = next.toString();
      res = null;
      continue;
    }
    break;
  }
  if (!res) throw new DlError("The address redirects too many times.");
  const finalUrl = current;
  const cd = res.headers.get("content-disposition");
  const name = safeFileName(nameFromDisposition(cd) ?? nameFromUrl(finalUrl));
  const common = { finalUrl, etag: res.headers.get("etag") ?? undefined, lastModified: res.headers.get("last-modified") ?? undefined, name, mime: res.headers.get("content-type")?.split(";")[0]?.trim() || undefined };
  try {
    if (res.status === 206) {
      const m = /bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(res.headers.get("content-range") ?? "");
      return { ...common, size: m && m[3] !== "*" ? Number(m[3]) : null, ranges: !!m };
    }
    if (res.status === 200) {
      const len = Number(res.headers.get("content-length"));
      return { ...common, size: Number.isFinite(len) && res.headers.has("content-length") ? len : null, ranges: false };
    }
    if (res.status === 416) {
      const m = /bytes\s+\*\/(\d+)/i.exec(res.headers.get("content-range") ?? "");
      return { ...common, size: m ? Number(m[1]) : 0, ranges: false };
    }
    throw httpProblem(res.status, res.headers.get("retry-after"));
  } finally {
    // Only the first byte was wanted; don't read a whole body the server may have sent anyway.
    res.body?.cancel().catch(() => {});
  }
}

/** `If-Range` makes the server send the whole file instead of a part when the file is not the one that was probed. */
function ifRange(probe: ProbeResult): Record<string, string> {
  if (probe.etag && !probe.etag.startsWith("W/")) return { "If-Range": probe.etag };
  if (probe.lastModified) return { "If-Range": probe.lastModified };
  return {};
}

/* ------------------------------------------------------------------------------------------------ saved progress */

interface SavedState {
  v: number;
  url: string;
  size: number;
  etag?: string;
  lastModified?: string;
  chunkSize: number;
  /** Runs of finished chunks: [first, last] pairs. */
  complete: Array<[number, number]>;
  /** Unfinished chunks that got part of the way: [index, bytes]. */
  partial: Array<[number, number]>;
}

export function encodeProgress(done: number[], chunkSize: number, size: number): Pick<SavedState, "complete" | "partial"> {
  const complete: Array<[number, number]> = [];
  const partial: Array<[number, number]> = [];
  for (let i = 0; i < done.length; i++) {
    const length = Math.min(chunkSize, size - i * chunkSize);
    if (done[i]! >= length) {
      const last = complete[complete.length - 1];
      if (last && last[1] === i - 1) last[1] = i;
      else complete.push([i, i]);
    } else if (done[i]! > 0) partial.push([i, done[i]!]);
  }
  return { complete, partial };
}

export function decodeProgress(state: Pick<SavedState, "complete" | "partial">, chunkSize: number, size: number): number[] {
  const count = Math.ceil(size / chunkSize);
  const done = new Array<number>(count).fill(0);
  for (const [a, b] of state.complete) for (let i = Math.max(0, a); i <= Math.min(count - 1, b); i++) done[i] = Math.min(chunkSize, size - i * chunkSize);
  for (const [i, n] of state.partial) if (i >= 0 && i < count) done[i] = Math.max(0, Math.min(n, Math.min(chunkSize, size - i * chunkSize) - 1));
  return done;
}

/** How big the pieces are: small enough to share out evenly, big enough that requests stay few. */
export function chunkSizeFor(size: number, connections: number): number {
  return Math.max(MIN_CHUNK, Math.min(MAX_CHUNK, Math.ceil(size / (connections * 6) / 65536) * 65536));
}

function writeAllAt(fd: number, buf: Uint8Array, position: number): void {
  let offset = 0;
  while (offset < buf.length) offset += fs.writeSync(fd, buf, offset, buf.length - offset, position + offset);
}

/* ------------------------------------------------------------------------------------------------ the manager */

interface Job {
  ac: AbortController;
  stop?: "pause" | "shutdown";
  fd?: number;
  sampler?: ReturnType<typeof setInterval>;
}

export interface ManagerOptions {
  /** The JSON file the list and the settings are kept in. */
  file: string;
  /** Where files go by default. */
  defaultFolder: string;
  fetchFn?: typeof fetch;
}

const isFinished = (s: DlState) => s === "done" || s === "error";

export class DownloadManager {
  private readonly items = new Map<string, DlItem>();
  private readonly jobs = new Map<string, Job>();
  private readonly limiter = new RateLimiter();
  private readonly fetchFn: typeof fetch;
  private settings: DlSettings;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  /** Paths (final names) that a download has chosen and is writing `.part` / `.dlstate` files for, so two downloads never share one. */
  private readonly claimed = new Map<string, string>();

  constructor(private readonly options: ManagerOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.settings = DEFAULT_SETTINGS(options.defaultFolder);
    this.load();
  }

  /* -------------------------------------------------------------- the list */

  private load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.options.file, "utf8"));
      if (data?.settings) this.settings = this.cleanSettings({ ...this.settings, ...data.settings });
      for (const raw of Array.isArray(data?.items) ? data.items : []) {
        if (!raw || typeof raw.id !== "string" || typeof raw.url !== "string" || typeof raw.path !== "string") continue;
        const item: DlItem = { ...raw, speed: 0, eta: null, active: 0 };
        // Whatever was running when the program stopped is paused now; its progress is on disk.
        if (item.state === "downloading" || item.state === "probing" || item.state === "verifying" || item.state === "queued") {
          item.state = "paused";
          item.message = "Stopped when the File Manager closed. Resume to continue.";
        }
        this.items.set(item.id, item);
        if (item.state !== "done" && (item.received > 0 || fs.existsSync(`${item.path}.part`))) this.claimed.set(item.path, item.id);
      }
    } catch {
      /* no saved list yet */
    }
    this.limiter.limit = this.settings.speedLimit;
  }

  private persist(now = false) {
    if (this.closed && !now) return;
    const write = () => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(nodePath.dirname(this.options.file), { recursive: true });
        const tmp = `${this.options.file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ v: 1, settings: this.settings, items: [...this.items.values()] }), { mode: 0o600 });
        fs.renameSync(tmp, this.options.file);
      } catch {
        /* a list that can't be saved only costs the queue after a restart */
      }
    };
    if (now) {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      return write();
    }
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(write, 500);
      this.saveTimer.unref?.();
    }
  }

  list(): DlView[] {
    return [...this.items.values()].map(({ headers, finalUrl, ...rest }) => ({ ...rest, headerNames: Object.keys(headers ?? {}) }));
  }

  get(id: string): DlItem | undefined {
    return this.items.get(id);
  }

  getSettings(): DlSettings {
    return { ...this.settings };
  }

  private cleanSettings(s: DlSettings): DlSettings {
    const int = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);
    return {
      connections: int(s.connections, 1, MAX_CONNECTIONS, 8),
      maxConcurrent: int(s.maxConcurrent, 1, MAX_CONCURRENT, 3),
      speedLimit: int(s.speedLimit, 0, 1e12, 0),
      folder: typeof s.folder === "string" && s.folder ? s.folder : this.options.defaultFolder,
      retries: int(s.retries, 0, 20, 6),
    };
  }

  setSettings(patch: Partial<DlSettings>): DlSettings {
    this.settings = this.cleanSettings({ ...this.settings, ...patch });
    this.limiter.limit = this.settings.speedLimit;
    this.persist();
    this.schedule();
    return this.getSettings();
  }

  /* -------------------------------------------------------------- actions */

  /** Adds downloads. They start at once (up to the number allowed together) unless `start` is false. */
  add(requests: DlRequest[]): DlView[] {
    // Everything is checked before anything is added, so one bad address doesn't leave the others half-added.
    const added: DlItem[] = [];
    for (const req of requests) {
      const { url: clean, auth } = splitCredentials(parseWebUrl(req.url).toString());
      const folder = req.folder?.trim() || this.settings.folder;
      const name = safeFileName(req.name || nameFromUrl(clean));
      const headers = cleanHeaders(req.headers);
      // A login typed into the address (https://user:password@host/…) travels as a header, and is not kept in the address.
      if (auth && !Object.keys(headers).some((k) => k.toLowerCase() === "authorization")) headers.Authorization = auth;
      added.push({
        id: randomBytes(6).toString("hex"),
        url: clean,
        folder,
        name,
        path: nodePath.join(folder, name),
        state: req.start === false ? "paused" : "queued",
        size: null,
        received: 0,
        speed: 0,
        eta: null,
        connections: Math.max(1, Math.min(MAX_CONNECTIONS, Math.round(req.connections ?? this.settings.connections))),
        active: 0,
        resumable: null,
        addedAt: Date.now(),
        checksum: parseChecksum(req.checksum),
        verified: null,
        headers,
        message: req.start === false ? "Added. Press Resume to start." : undefined,
      });
    }
    for (const item of added) this.items.set(item.id, item);
    this.persist();
    this.schedule();
    return added.map((i) => this.list().find((v) => v.id === i.id)!);
  }

  pause(id: string) {
    const item = this.items.get(id);
    if (!item) return;
    if (item.state === "queued") {
      item.state = "paused";
      item.message = "Paused.";
    } else if (this.jobs.has(id)) {
      this.jobs.get(id)!.stop = "pause";
      this.jobs.get(id)!.ac.abort();
    }
    this.persist();
  }

  /** Continues a paused, failed or finished-with-a-problem download. */
  resume(id: string) {
    const item = this.items.get(id);
    if (!item || this.jobs.has(id) || item.state === "done") return;
    item.state = "queued";
    item.message = undefined;
    this.persist();
    this.schedule();
  }

  /** Stops a download and throws away what it had saved (a `.part` file and its progress). Keeps the list entry as "paused" only when asked to. */
  async remove(id: string, deleteFile = false): Promise<void> {
    const item = this.items.get(id);
    if (!item) return;
    const job = this.jobs.get(id);
    if (job) {
      job.stop = "pause";
      job.ac.abort();
      for (let i = 0; i < 100 && this.jobs.has(id); i++) await sleep(20);
    }
    this.items.delete(id);
    const remove = async (p: string) => fsp.rm(p, { force: true }).catch(() => {});
    // Only the files this download itself made: another one waiting for the same name must not lose its partial file.
    const owns = this.claimed.get(item.path) === item.id;
    if (item.state !== "done") {
      if (owns) {
        await remove(`${item.path}.part`);
        await remove(`${item.path}.dlstate`);
      }
    } else if (deleteFile) await remove(item.path);
    if (owns) this.claimed.delete(item.path);
    this.persist();
    this.schedule();
  }

  clearFinished() {
    for (const [id, item] of this.items) if (item.state === "done") this.items.delete(id);
    this.persist();
  }

  pauseAll() {
    for (const id of [...this.items.keys()]) this.pause(id);
  }

  resumeAll() {
    for (const [id, item] of this.items) if (item.state === "paused" || item.state === "error") this.resume(id);
  }

  /** Stops everything quickly and saves the list (the File Manager is closing). */
  closeAll() {
    this.closed = true;
    for (const job of this.jobs.values()) {
      job.stop = "shutdown";
      job.ac.abort();
    }
    this.persist(true);
  }

  /* -------------------------------------------------------------- scheduling */

  private schedule() {
    if (this.closed) return;
    let running = this.jobs.size;
    for (const item of this.items.values()) {
      if (running >= this.settings.maxConcurrent) break;
      if (item.state !== "queued" || this.jobs.has(item.id)) continue;
      running++;
      void this.run(item);
    }
  }

  private async run(item: DlItem) {
    const job: Job = { ac: new AbortController() };
    this.jobs.set(item.id, job);
    item.state = "probing";
    item.message = undefined;
    item.startedAt = item.startedAt ?? Date.now();
    item.speed = 0;
    item.eta = null;
    try {
      await this.download(item, job);
    } catch (err: any) {
      item.active = 0;
      if (isAbort(err) || job.stop) {
        item.state = "paused";
        item.message = job.stop === "shutdown" ? "Stopped when the File Manager closed. Resume to continue." : "Paused.";
        if (item.resumable === false && item.received > 0) item.message = "Paused. This server can't continue a download, so it will start again from the beginning.";
      } else {
        item.state = "error";
        item.message = err instanceof DlError ? err.message : `The download failed: ${String(err?.message ?? err).split("\n")[0]}`;
      }
    } finally {
      if (job.sampler) clearInterval(job.sampler);
      if (job.fd !== undefined) {
        try { fs.closeSync(job.fd); } catch { /* already closed */ }
      }
      item.speed = 0;
      item.eta = null;
      item.active = 0;
      this.jobs.delete(item.id);
      this.persist(item.state === "paused" || item.state === "error");
      this.schedule();
    }
  }

  /* -------------------------------------------------------------- one download */

  private async download(item: DlItem, job: Job) {
    const signal = job.ac.signal;
    await fsp.mkdir(item.folder, { recursive: true }).catch(() => {});
    try {
      if (!(await fsp.stat(item.folder)).isDirectory()) throw new Error("not a folder");
    } catch {
      throw new DlError(`The folder ${item.folder} isn't available.`);
    }

    // The file is complete but its checksum check was cut short (a pause, or the program closing): check it again, nothing to download.
    if (item.checksum && item.verified === null && item.size !== null && item.received === item.size && fs.existsSync(item.path) && !fs.existsSync(`${item.path}.part`)) {
      await this.verify(item, job);
      return;
    }

    const probe = await this.probeWithRetries(item, signal);
    item.finalUrl = probe.finalUrl;
    item.mime = probe.mime;
    item.resumable = probe.ranges;
    if (probe.size !== null) item.size = probe.size;

    // A file that was started before keeps its name; a new one gets the server's name (and a free one).
    const statePath = `${item.path}.dlstate`;
    let saved: SavedState | null = null;
    if (item.received > 0 || fs.existsSync(`${item.path}.part`)) {
      try {
        saved = JSON.parse(fs.readFileSync(statePath, "utf8")) as SavedState;
      } catch {
        saved = null;
      }
    }
    const sameFile = (s: SavedState) => s.v === STATE_VERSION && probe.size === s.size && (!s.etag || !probe.etag || s.etag === probe.etag) && (!s.lastModified || !probe.lastModified || s.lastModified === probe.lastModified);
    const hasPart = fs.existsSync(`${item.path}.part`);
    if (!(item.received > 0 && hasPart)) {
      if (item.name === nameFromUrl(item.url) || !item.name) item.name = probe.name;
      // Choosing and claiming the name happen in the same step (no await between), so two downloads can't both pick it.
      if (this.claimed.get(item.path) === item.id) this.claimed.delete(item.path);
      item.path = uniquePath(item.folder, safeFileName(item.name === nameFromUrl(item.url) ? probe.name : item.name), (c) => this.claimed.has(c));
      this.claimed.set(item.path, item.id);
      item.name = nodePath.basename(item.path);
      saved = null;
      item.received = 0;
    }
    item.etag = probe.etag;
    item.lastModified = probe.lastModified;

    const free = await this.freeSpace(item.folder);
    if (probe.size && free !== null && free < probe.size - (saved ? item.received : 0) + 50 * 1024 * 1024) throw new DlError(`There isn't enough free space in ${item.folder} (${fmtBytes(probe.size)} needed).`);

    item.state = "downloading";
    this.startSampler(item, job);
    this.persist();

    if (probe.ranges && probe.size !== null && probe.size > 0) {
      await this.segmented(item, job, probe, saved && sameFile(saved) ? saved : null);
    } else {
      await this.single(item, job, probe);
    }

    if (job.stop) throw new DOMException("paused", "AbortError");
    await this.finish(item, job);
  }

  private async probeWithRetries(item: DlItem, signal: AbortSignal): Promise<ProbeResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await probeUrl(item.url, item.headers, this.fetchFn, signal);
      } catch (err: any) {
        if (isAbort(err) || !(err instanceof DlError) || err.fatal || attempt >= Math.min(3, this.settings.retries)) throw err;
        item.message = `${err.message} Trying again…`;
        await sleep(err.retryAfterMs || 800 * 2 ** attempt, signal);
      }
    }
  }

  private async freeSpace(folder: string): Promise<number | null> {
    try {
      const s: any = await (fsp as any).statfs(folder);
      return Number(s.bavail) * Number(s.bsize);
    } catch {
      return null;
    }
  }

  private startSampler(item: DlItem, job: Job) {
    let last = item.received;
    let speed = 0;
    job.sampler = setInterval(() => {
      const instant = ((item.received - last) / 0.5);
      last = item.received;
      speed = speed === 0 ? instant : speed * 0.6 + instant * 0.4;
      item.speed = Math.max(0, Math.round(speed));
      item.eta = item.size && item.speed > 0 ? Math.max(0, Math.round((item.size - item.received) / item.speed)) : null;
      this.persist();
    }, 500);
    job.sampler.unref?.();
  }

  /** Several connections, each taking the next free chunk. */
  private async segmented(item: DlItem, job: Job, probe: ProbeResult, saved: SavedState | null) {
    const size = probe.size!;
    const signal = job.ac.signal;
    const partPath = `${item.path}.part`;
    const connections = Math.max(1, Math.min(item.connections, Math.ceil(size / MIN_CHUNK)));
    const chunkSize = saved?.chunkSize ?? chunkSizeFor(size, connections);
    const done = saved ? decodeProgress(saved, chunkSize, size) : new Array<number>(Math.ceil(size / chunkSize)).fill(0);
    item.received = done.reduce((a, b) => a + b, 0);

    const fd = fs.openSync(partPath, fs.existsSync(partPath) && saved ? "r+" : "w+");
    job.fd = fd;
    if (fs.fstatSync(fd).size !== size) fs.ftruncateSync(fd, size);

    const inflight = new Set<number>();
    let scan = 0;
    const nextChunk = (): number => {
      for (let i = scan; i < done.length; i++) {
        const length = Math.min(chunkSize, size - i * chunkSize);
        if (done[i]! < length && !inflight.has(i)) return i;
        if (i === scan && done[i]! >= length) scan = i + 1;
      }
      return -1;
    };
    const savedAt = { t: 0 };
    const saveState = (force = false) => {
      const now = Date.now();
      if (!force && now - savedAt.t < 1000) return;
      savedAt.t = now;
      const state: SavedState = { v: STATE_VERSION, url: probe.finalUrl, size, etag: probe.etag, lastModified: probe.lastModified, chunkSize, ...encodeProgress(done, chunkSize, size) };
      try { fs.writeFileSync(`${item.path}.dlstate`, JSON.stringify(state)); } catch { /* progress just isn't saved this time */ }
    };

    let failure: unknown = null;
    const fail = (err: unknown) => {
      if (!failure) failure = err;
      job.ac.abort();
    };

    const fetchChunk = async (idx: number) => {
      const start = idx * chunkSize;
      const end = Math.min(size, start + chunkSize) - 1;
      let attempt = 0;
      for (;;) {
        const from = start + done[idx]!;
        if (from > end) return;
        const before = done[idx]!;
        try {
          const res = await this.fetchFn(probe.finalUrl, { headers: requestHeaders(item, { Range: `bytes=${from}-${end}`, ...ifRange(probe) }, probe.finalUrl), redirect: "follow", signal });
          if (res.status !== 206) {
            res.body?.cancel().catch(() => {});
            if (res.status === 200 || res.status === 416) throw new DlError("The file changed on the server, or it stopped accepting ranges. Remove it and add it again.");
            throw httpProblem(res.status, res.headers.get("retry-after"));
          }
          const cr = /bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(res.headers.get("content-range") ?? "");
          if (!cr || Number(cr[1]) !== from) throw new DlError("The server sent the wrong part of the file.");
          if (cr[3] !== "*" && Number(cr[3]) !== size) throw new DlError("The file changed on the server while it was downloading. Remove it and add it again.");
          const reader = res.body!.getReader();
          let pos = from;
          try {
            for (;;) {
              const { done: finished, value } = await reader.read();
              if (finished) break;
              let buf: Uint8Array = value;
              const room = end + 1 - pos;
              if (buf.length > room) buf = buf.subarray(0, room);
              await this.limiter.take(buf.length, signal);
              if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
              writeAllAt(fd, buf, pos);
              pos += buf.length;
              done[idx] = pos - start;
              item.received += buf.length;
              if (pos > end) break;
            }
          } finally {
            reader.cancel().catch(() => {});
          }
          if (pos <= end) throw new DlError("The connection closed early.", false);
          saveState();
          return;
        } catch (err: any) {
          if (isAbort(err) || signal.aborted) throw err;
          if (err instanceof DlError && err.fatal) throw err;
          if (done[idx]! > before) attempt = 0;
          attempt++;
          if (attempt > this.settings.retries) throw err instanceof DlError ? err : new DlError(`The connection kept failing: ${String(err?.message ?? err).split("\n")[0]}`);
          const wait = err instanceof DlError && err.retryAfterMs ? err.retryAfterMs : Math.min(8000, 400 * 2 ** (attempt - 1)) * (0.7 + Math.random() * 0.6);
          await sleep(wait, signal);
        }
      }
    };

    const worker = async () => {
      item.active++;
      try {
        for (;;) {
          if (signal.aborted) return;
          const idx = nextChunk();
          if (idx < 0) return;
          inflight.add(idx);
          try {
            await fetchChunk(idx);
          } finally {
            inflight.delete(idx);
          }
        }
      } catch (err) {
        if (!isAbort(err)) fail(err);
      } finally {
        item.active--;
      }
    };

    // Start the connections a little apart: some servers count a burst of new connections as an attack.
    const workers: Promise<void>[] = [];
    for (let i = 0; i < connections; i++) {
      workers.push(worker());
      if (i < connections - 1) await sleep(25, signal).catch(() => {});
    }
    await Promise.all(workers);
    saveState(true);
    if (failure) throw failure;
    if (!job.stop && done.some((d, i) => d < Math.min(chunkSize, size - i * chunkSize))) throw new DlError("Some parts of the file are missing.", false);
  }

  /** One connection, for servers that can't send parts. Resumes with `Range: bytes=N-` when the server allows it. */
  private async single(item: DlItem, job: Job, probe: ProbeResult) {
    const signal = job.ac.signal;
    const partPath = `${item.path}.part`;
    const canResume = probe.ranges || (probe.size === null && false);
    let attempt = 0;
    let from = canResume && item.received > 0 && fs.existsSync(partPath) ? Math.min(item.received, fs.statSync(partPath).size) : 0;
    item.received = from;
    const fd = fs.openSync(partPath, from > 0 ? "r+" : "w+");
    job.fd = fd;
    if (from === 0) fs.ftruncateSync(fd, 0);

    for (;;) {
      const before = item.received;
      try {
        const res = await this.fetchFn(probe.finalUrl, { headers: requestHeaders(item, from > 0 ? { Range: `bytes=${from}-`, ...ifRange(probe) } : {}, probe.finalUrl), redirect: "follow", signal });
        if (from > 0 && res.status === 200) {
          // The server ignored the range: start from the top.
          from = 0;
          item.received = 0;
          fs.ftruncateSync(fd, 0);
        } else if (res.status !== 200 && res.status !== 206) {
          res.body?.cancel().catch(() => {});
          throw httpProblem(res.status, res.headers.get("retry-after"));
        }
        if (item.size === null) {
          const len = Number(res.headers.get("content-length"));
          if (res.headers.has("content-length") && Number.isFinite(len)) item.size = from + len;
        }
        item.active = 1;
        const reader = res.body!.getReader();
        try {
          for (;;) {
            const { done: finished, value } = await reader.read();
            if (finished) break;
            await this.limiter.take(value.length, signal);
            if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
            writeAllAt(fd, value, from);
            from += value.length;
            item.received = from;
          }
        } finally {
          reader.cancel().catch(() => {});
        }
        if (item.size !== null && from < item.size) throw new DlError("The connection closed early.", false);
        if (item.size === null) item.size = from;
        return;
      } catch (err: any) {
        if (isAbort(err) || signal.aborted) throw err;
        if (err instanceof DlError && err.fatal) throw err;
        if (item.received > before) attempt = 0;
        attempt++;
        if (attempt > this.settings.retries) throw err instanceof DlError ? err : new DlError(`The connection kept failing: ${String(err?.message ?? err).split("\n")[0]}`);
        if (!probe.ranges) {
          from = 0;
          item.received = 0;
          fs.ftruncateSync(fd, 0);
        }
        await sleep(err instanceof DlError && err.retryAfterMs ? err.retryAfterMs : Math.min(8000, 400 * 2 ** (attempt - 1)), signal);
      }
    }
  }

  /** All bytes are on disk: move the file into place and check its checksum. */
  private async finish(item: DlItem, job: Job) {
    if (job.fd !== undefined) {
      try { fs.fsyncSync(job.fd); } catch { /* not every system can */ }
      fs.closeSync(job.fd);
      job.fd = undefined;
    }
    const part = `${item.path}.part`;
    const actual = fs.statSync(part).size;
    if (item.size !== null && actual !== item.size) throw new DlError(`The file is ${fmtBytes(actual)} but should be ${fmtBytes(item.size)}.`, false);
    item.size = actual;
    item.received = actual;
    let finalPath = item.path;
    if (fs.existsSync(finalPath)) finalPath = uniquePath(item.folder, nodePath.basename(item.path), (c) => this.claimed.has(c));
    fs.renameSync(part, finalPath);
    fs.rmSync(`${item.path}.dlstate`, { force: true });
    if (this.claimed.get(item.path) === item.id) this.claimed.delete(item.path);
    item.path = finalPath;
    item.name = nodePath.basename(finalPath);
    await this.verify(item, job);
  }

  /** Checks the finished file against the checksum that was asked for (if any) and marks the download done. */
  private async verify(item: DlItem, job: Job) {
    if (item.checksum) {
      item.state = "verifying";
      item.message = "Checking the checksum…";
      const hash = createHash(item.checksum.algo);
      const stream = fs.createReadStream(item.path);
      try {
        for await (const chunk of stream) {
          hash.update(chunk);
          // A pause or the program closing stops the check; it is not a verdict, so the file is checked again on Resume.
          if (job.ac.signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }
      } finally {
        stream.destroy();
      }
      item.verified = hash.digest("hex") === item.checksum.value;
      if (!item.verified) {
        item.state = "error";
        item.message = `The file downloaded, but its ${item.checksum.algo.toUpperCase()} checksum doesn't match, so it may be damaged or not the file you expected. It was kept as ${item.name}.`;
        item.finishedAt = Date.now();
        return;
      }
    }
    item.state = "done";
    item.message = item.verified ? "Done. The checksum matches." : undefined;
    item.finishedAt = Date.now();
  }
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return "?";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export { isFinished as isFinishedState };
