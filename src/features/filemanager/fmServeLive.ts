/**
 * Live reload for the live server: it watches the served folder, tells every open page (over Server-Sent Events)
 * when something changed, and holds the tiny browser script that reacts. The script is served from the reserved
 * path `/__live__/client.js` rather than written inline into the page, so it keeps working on sites whose own
 * Content-Security-Policy forbids inline scripts; this server adds no policy of its own to the site's pages.
 */
import { existsSync, promises as fsp, watch as fsWatch, type FSWatcher } from "fs";
import { randomBytes } from "crypto";
import { describeFsError } from "./fmPaths";

export const LIVE_PATH = "/__live__";
export const LIVE_SCRIPT_PATH = "/__live__/client.js";
export const LIVE_TAG = `<script src="${LIVE_SCRIPT_PATH}" data-fm-live></script>`;
export const MAX_WATCHED_DIRS = 5000;
export const DEBOUNCE_MS = 100;
export const HEARTBEAT_MS = 15_000;
export const MAX_SSE_CLIENTS = 50;
const MAX_QUEUED_BYTES = 1024 * 1024;
const MAX_LISTED_FILES = 20;

/** Folders whose changes never matter to a page, and which can hold thousands of files. */
export const IGNORED_DIRS: readonly string[] = ["node_modules", ".git", ".hg", ".svn", ".idea", ".vscode", "__pycache__", ".cache", ".next", ".turbo", ".parcel-cache", ".sass-cache"];

/** True for changes that should not reload a page: ignored folders, editor scratch files and (unless allowed) hidden files. */
export function isIgnoredChange(rel: string, allowDotfiles = false): boolean {
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (parts.some((p) => IGNORED_DIRS.includes(p))) return true;
  const last = parts[parts.length - 1] ?? "";
  if (/(~|\.sw[a-z]|\.tmp|\.temp|\.crdownload|\.part)$/i.test(last) || /^(\.#|#.*#$|\.fm-)/.test(last) || last === "4913" || last === ".DS_Store") return true;
  return !allowDotfiles && parts.some((p) => p.startsWith("."));
}

/** Puts the live script into an HTML page (before `</body>`, otherwise at the end). A page that already has it is returned as is. */
export function injectLive(html: string): string {
  if (html.includes(LIVE_SCRIPT_PATH)) return html;
  let at = -1;
  for (const m of html.matchAll(/<\/body\s*>/gi)) at = m.index!;
  return at >= 0 ? html.slice(0, at) + LIVE_TAG + html.slice(at) : html + LIVE_TAG;
}

/** What the page runs: listens for changes, swaps stylesheets for CSS-only changes, and reloads for anything else. */
export const LIVE_CLIENT_JS = `(function () {
  if (window.__fmLive) return;
  window.__fmLive = true;
  var seen = null;
  var dropped = false;
  function swapStyles() {
    var links = document.querySelectorAll('link[rel~="stylesheet"][href]');
    for (var i = 0; i < links.length; i++) {
      (function (link) {
        var u;
        try { u = new URL(link.href, location.href); } catch (e) { return; }
        if (u.origin !== location.origin) return;
        u.searchParams.set('__live', String(Date.now()));
        var fresh = link.cloneNode(false);
        fresh.href = u.href;
        fresh.onload = function () { link.remove(); };
        fresh.onerror = function () { fresh.remove(); };
        link.after(fresh);
      })(links[i]);
    }
  }
  var es = new EventSource('/__live__');
  es.onmessage = function (e) {
    var m;
    try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.type === 'hello') {
      if (seen !== null && (seen !== m.id || dropped)) { location.reload(); return; }
      seen = m.id;
      dropped = false;
    } else if (m.type === 'css') swapStyles();
    else if (m.type === 'reload') location.reload();
  };
  es.onerror = function () { dropped = true; };
})();
`;

/** How many folders are inside `root` (not counting ignored ones), stopping once it is clear there are more than `cap`. */
export async function countDirs(root: string, cap: number, allowDotfiles = false): Promise<number> {
  let count = 1;
  const queue = [root];
  while (queue.length && count <= cap) {
    const batch = queue.splice(0, 16);
    const lists = await Promise.all(batch.map((dir) => fsp.readdir(dir, { withFileTypes: true }).catch(() => null)));
    for (let i = 0; i < batch.length && count <= cap; i++) {
      const entries = lists[i];
      if (!entries) continue;
      const dir = batch[i]!;
      for (const e of entries) {
        if (!e.isDirectory() || IGNORED_DIRS.includes(e.name) || (!allowDotfiles && e.name.startsWith("."))) continue;
        count++;
        queue.push(`${dir}/${e.name}`);
        if (count > cap) break;
      }
    }
  }
  return count;
}

interface Client {
  id: number;
  controller: ReadableStreamDefaultController<Uint8Array>;
}

export interface LiveOptions {
  root: string;
  allowDotfiles?: boolean;
  debounceMs?: number;
  maxDirs?: number;
  heartbeatMs?: number;
  maxClients?: number;
  onNote?: (text: string) => void;
}

const enc = new TextEncoder();

export class LiveHub {
  readonly serverId = randomBytes(6).toString("hex");
  /** Plain words, or "" when all is well: why live reload isn't working. */
  warning = "";
  watching = false;
  private clients = new Map<number, Client>();
  private nextClient = 1;
  private watcher: FSWatcher | null = null;
  private pending = new Set<string>();
  private pendingOverflow = 0;
  private pendingNonCss = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private quietUntil = 0;

  constructor(private opts: LiveOptions) {}

  get clientCount(): number {
    return this.clients.size;
  }

  async start(): Promise<void> {
    const cap = this.opts.maxDirs ?? MAX_WATCHED_DIRS;
    const dirs = await countDirs(this.opts.root, cap, this.opts.allowDotfiles);
    if (this.stopped) return;
    if (dirs > cap) {
      this.warning = `Live reload is off: this folder has more than ${cap.toLocaleString("en-US")} subfolders, which is too many to watch. Serve a smaller folder to get automatic reloading.`;
      this.opts.onNote?.(this.warning);
      return;
    }
    try {
      this.watcher = fsWatch(this.opts.root, { recursive: true }, (_event, name) => this.changed(name === null || name === undefined ? "" : String(name)));
      this.watcher.on("error", (err) => this.fail(`Live reload stopped: ${describeFsError(err, "watch that folder").message}`));
      this.watching = true;
      // Some systems report changes made just before the watch began; they aren't news.
      this.quietUntil = Date.now() + 400;
    } catch (err) {
      this.warning = `Live reload couldn't start: ${describeFsError(err, "watch that folder").message}`;
      this.opts.onNote?.(this.warning);
    }
    this.beat = setInterval(() => this.broadcastRaw(": ping\n\n"), this.opts.heartbeatMs ?? HEARTBEAT_MS);
    (this.beat as { unref?: () => void }).unref?.();
  }

  private fail(message: string): void {
    this.warning = message;
    this.watching = false;
    this.opts.onNote?.(message);
    try { this.watcher?.close(); } catch {}
    this.watcher = null;
  }

  /** A file or folder changed (a name relative to the served folder). */
  changed(rel: string): void {
    if (this.stopped || Date.now() < this.quietUntil) return;
    if (rel && isIgnoredChange(rel, this.opts.allowDotfiles)) return;
    if (!/\.css$/i.test(rel)) this.pendingNonCss = true;
    if (this.pending.size < 256) {
      this.pending.add(rel);
    } else if (!this.pending.has(rel)) {
      this.pendingOverflow++;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.opts.debounceMs ?? DEBOUNCE_MS);
  }

  private flush(): void {
    this.timer = null;
    const files = [...this.pending];
    const totalCount = files.length + this.pendingOverflow;
    const cssOnly = !this.pendingNonCss && files.every((f) => /\.css$/i.test(f));
    this.pending.clear();
    this.pendingOverflow = 0;
    this.pendingNonCss = false;
    if (this.stopped || !files.length) return;
    if (!existsSync(this.opts.root)) {
      this.fail("The folder being served was deleted or moved, so there is nothing to show. Stop this server and start a new one.");
      return;
    }
    this.broadcast({ type: cssOnly ? "css" : "reload", files: files.slice(0, MAX_LISTED_FILES), more: Math.max(0, totalCount - MAX_LISTED_FILES) });
  }

  private broadcast(message: Record<string, unknown>): void {
    this.broadcastRaw(`data: ${JSON.stringify(message)}\n\n`);
  }

  private broadcastRaw(text: string): void {
    const bytes = enc.encode(text);
    for (const c of [...this.clients.values()]) {
      try {
        if ((c.controller.desiredSize ?? 1) < -MAX_QUEUED_BYTES) throw new Error("slow client");
        c.controller.enqueue(bytes);
      } catch {
        this.drop(c.id);
      }
    }
  }

  private drop(id: number): void {
    const c = this.clients.get(id);
    if (!c) return;
    this.clients.delete(id);
    try { c.controller.close(); } catch {}
  }

  /** A new open page. Returns null when too many pages are connected. */
  connect(): Response | null {
    if (this.stopped || this.clients.size >= (this.opts.maxClients ?? MAX_SSE_CLIENTS)) return null;
    const id = this.nextClient++;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.clients.set(id, { id, controller });
        controller.enqueue(enc.encode(`retry: 1000\ndata: ${JSON.stringify({ type: "hello", id: this.serverId })}\n\n`));
      },
      cancel: () => {
        this.clients.delete(id);
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" },
    });
  }

  /** Closes every page's connection, the folder watch and the timers. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.beat) clearInterval(this.beat);
    this.timer = null;
    this.beat = null;
    try { this.watcher?.close(); } catch {}
    this.watcher = null;
    this.watching = false;
    for (const id of [...this.clients.keys()]) this.drop(id);
  }
}
