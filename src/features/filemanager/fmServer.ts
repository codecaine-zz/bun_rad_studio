/**
 * The File Manager's local HTTP server: the page, its scripts, and a small JSON API the page calls.
 *
 * Safety, in layers (see docs/file-manager):
 *   - listens on 127.0.0.1 only and refuses foreign Host / Origin headers (guardLocalRequest);
 *   - every /api call needs this session's secret token, which only the page this server hands out contains;
 *   - writes must be JSON (a web page on another site can't send that without a CORS check, which fails);
 *   - request bodies are limited to 1 MB;
 *   - the page is served with a strict Content-Security-Policy, and file previews with `sandbox`;
 *   - permanent deletion needs an explicit `confirm: true`.
 * Local programs running as the same user can still read the page (and so the token): this is a tool for one
 * person's own computer, not a boundary between users.
 */
import { randomBytes, timingSafeEqual } from "crypto";
import { existsSync, promises as fsp, readFileSync, realpathSync } from "fs";
import * as nodePath from "path";
import { guardLocalRequest, writeClipboardSync } from "../../localGuard";
import { absolutePath, createContext, pathApi, type FmContext, type FmContextOptions, type FmHandler } from "./fmCore";
import { codeOperations } from "./fmCodeOps";
import { checkOperations } from "./fmCheckOps";
import { cryptoOperations } from "./fmCryptoOps";
import { dataCompareOperations } from "./fmDataCompare";
import { editorOperations } from "./fmEditor";
import { aboutOperations } from "./fmAboutOps";
import { devOperations } from "./fmDevOps";
import { planSetup, setupOptions } from "./fmSetup";
import { themeOperations } from "./fmThemes";
import { findOperations } from "./fmFindOps";
import { infoOperations } from "./fmInfoOps";
import { ipOperations } from "./fmIpOps";
import { netOperations } from "./fmNetOps";
import { sdOperations } from "./fmSdOps";
import { serveOperations } from "./fmServeOps";
import { vaultOperations } from "./fmVaultOps";
import { secretsOperations } from "./fmSecretsOps";
import { watchOperations } from "./fmWatchOps";
import { listFolder, listPlaces, previewFile, propertiesOf, searchFolder } from "./fmList";
import { bulkRename, copyItems, findConflicts, makeFile, makeFolder, moveItems, relocate, renameItem } from "./fmOps";
import { overview, previewConvert, startConvert, startInstall } from "./fmBatch";
import { openItem, revealItem } from "./fmOpen";
import { openViaAssociation, openWithOperations } from "./fmOpenWith";
import { FmError, classify, describeFsError, parseTypedPath, extensionOf } from "./fmPaths";
import { addRecent, loadSettings, updateSettings } from "./fmSettings";
import { MAX_INPUT_BYTES, clampSize, createTerminalHub, shellFolder, terminalSupported, type TerminalSession } from "./fmTerminal";
import { deleteFromTrash, deletePermanently, listTrash, moveToTrash, restoreFromTrash } from "./fmTrash";
import { createZip, extractZip } from "./fmZip";

export const APP_ID = "file_manager_studio";
/** The product name: the window title, the page title and the health answer. */
export const APP_NAME = "Codecaine File Manager";
export const APP_VERSION = "1.0.0";
export const MAX_BODY_BYTES = 1024 * 1024;
const MAX_RAW_BYTES = 100 * 1024 * 1024;

export interface FileManagerServerOptions {
  port?: number;
  host?: string;
  /** Overrides for tests: home folder, data folder, platform, program launcher. */
  context?: FmContextOptions;
  /** Use a fixed token (tests). Normally a random one is made. */
  token?: string;
  /** Folder to open first, instead of the last one used. */
  startPath?: string;
}

export function getFileManagerAssetsDir(): string {
  const candidates = [
    nodePath.join(import.meta.dir, "..", "..", "..", "resources", "file_manager"),
    nodePath.join(process.cwd(), "resources", "file_manager"),
  ];
  return candidates.find((d) => existsSync(nodePath.join(d, "index.html"))) ?? candidates[0]!;
}

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * The page's policy. It may open a WebSocket to its own address only (for the terminal; `host` was checked by the
 * loopback guard), and the terminal library may add style elements that carry this response's one-time `nonce`.
 */
function pageCsp(host: string, nonce: string): string {
  const withNonce = CSP.replace("style-src 'self'", `style-src 'self' 'nonce-${nonce}'`);
  const alt = alternateOrigin(host);
  const framed = alt ? `${withNonce}; frame-src ${alt}` : withNonce;
  return /^[\w.:[\]-]+$/.test(host) ? framed.replace("connect-src 'self'", `connect-src 'self' ws://${host}`) : framed;
}

/** The other spelling of this loopback address. A page there is a different origin, so it can't read this page (or its token). */
export function alternateOrigin(host: string): string | null {
  const m = /^(127\.0\.0\.1|localhost)(:\d+)?$/i.exec(host);
  if (!m) return null;
  return `http://${m[1]!.toLowerCase() === "localhost" ? "127.0.0.1" : "localhost"}${m[2] ?? ""}`;
}

/**
 * Small self-contained web apps from resources/ that the Power tools show in a frame. Each runs on the other loopback
 * spelling (a separate origin that can't read this page or its token), with its own policy: these pages need inline
 * scripts, and load fonts, icons and libraries from a few named CDNs.
 */
export interface EmbeddedApp {
  dir: string;
  script: string[];
  style: string[];
  font: string[];
  img: string[];
  frame: string[];
  connect: string[];
  /** Hide the "back to the hub" links the standalone app has, which would load this File Manager into the frame. */
  hideCss: string;
  /** The graphing calculator turns the formulas you type into functions. Safe here: its own origin holds nothing to steal. */
  evalFormulas?: boolean;
}

export const EMBEDDED_APPS: Record<string, EmbeddedApp> = {
  calc: {
    dir: "universal_calculator",
    script: ["https://cdn.jsdelivr.net"], style: ["https://cdn.jsdelivr.net", "https://fonts.googleapis.com"], font: ["https://cdn.jsdelivr.net", "https://fonts.gstatic.com"], img: [], frame: [], connect: [],
    hideCss: ".hub-button{display:none!important}.brand{pointer-events:none}",
    evalFormulas: true,
  },
  timer: {
    dir: "interval_timer",
    script: ["https://cdnjs.cloudflare.com", "https://www.youtube.com", "https://s.ytimg.com"],
    style: ["https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
    font: ["https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
    img: ["https://img.youtube.com", "https://i.ytimg.com"],
    frame: ["https://www.youtube.com", "https://www.youtube-nocookie.com"],
    connect: ["https://cdnjs.cloudflare.com"],
    hideCss: ".hub-return-btn{display:none!important}",
  },
};

function embeddedCsp(app: EmbeddedApp, host: string): string {
  const own = `http://${host}`;
  const alt = alternateOrigin(host);
  const list = (items: string[]) => (items.length ? ` ${items.join(" ")}` : "");
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline'${app.evalFormulas ? " 'unsafe-eval'" : ""}${list(app.script)}`,
    `style-src 'self' 'unsafe-inline'${list(app.style)}`,
    `font-src 'self' data:${list(app.font)}`,
    `img-src 'self' data: blob:${list(app.img)}`,
    "media-src 'self' data: blob:",
    `connect-src 'self'${list(app.connect)}`,
    `frame-src 'self'${list(app.frame)}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    `frame-ancestors ${alt ?? "'none'"} ${own}`,
  ].join("; ");
}

const EMBED_TYPES: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", svg: "image/svg+xml", json: "application/json; charset=utf-8", png: "image/png", gif: "image/gif", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", woff2: "font/woff2", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg" };

interface TerminalSocketData {
  cwd: string;
  cols: number;
  rows: number;
  session?: TerminalSession;
  /** Watches the shell's folder and tells the page when `cd` moves it. */
  watch?: { check: () => void; stop: () => void };
}

const MIME: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  html: "text/html; charset=utf-8",
  json: "application/json; charset=utf-8",
};

const RAW_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  avif: "image/avif",
};

const secureHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  ...extra,
});

function tokenMatches(given: string | null, token: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Handler = FmHandler;

/** The API: one entry per operation. Each takes the JSON body and returns the JSON answer. */
const operations: Record<string, Handler> = {
  async places(ctx) {
    const places = listPlaces(ctx);
    const trash = await listTrash(ctx);
    return { ...places, trash: { count: trash.count }, settings: await loadSettings(ctx) };
  },
  async list(ctx, b) {
    return await listFolder(ctx, b.path, { showHidden: b.showHidden === true });
  },
  async props(ctx, b) {
    return { properties: await propertiesOf(ctx, b.paths) };
  },
  async mkdir(ctx, b) {
    return await makeFolder(ctx, b.parent, b.name);
  },
  async newfile(ctx, b) {
    return await makeFile(ctx, b.parent, b.name);
  },
  async rename(ctx, b) {
    return await renameItem(ctx, b.path, b.name);
  },
  async relocate(ctx, b) {
    return { results: await relocate(ctx, b.pairs) };
  },
  async conflicts(ctx, b) {
    return await findConflicts(ctx, b.sources, b.dest);
  },
  async copy(ctx, b) {
    return { results: await copyItems(ctx, b.sources, b.dest, b.policy) };
  },
  async move(ctx, b) {
    return { results: await moveItems(ctx, b.sources, b.dest, b.policy) };
  },
  async trash(ctx, b) {
    return { results: await moveToTrash(ctx, b.paths) };
  },
  async "trash/list"(ctx) {
    return await listTrash(ctx);
  },
  async "trash/restore"(ctx, b) {
    return { results: await restoreFromTrash(ctx, b.ids) };
  },
  async "trash/delete"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Deleting from the Recycle Bin is permanent and needs to be confirmed.");
    return await deleteFromTrash(ctx, Array.isArray(b.ids) ? b.ids : undefined);
  },
  async delete(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Deleting for good needs to be confirmed.");
    return { results: await deletePermanently(ctx, b.paths) };
  },
  async search(ctx, b) {
    return await searchFolder(ctx, b.path, b.query, { showHidden: b.showHidden === true, kind: typeof b.kind === "string" ? b.kind : undefined });
  },
  async preview(ctx, b) {
    return { preview: await previewFile(ctx, b.path) };
  },
  async open(ctx, b) {
    // A program the person chose for this kind of file comes first.
    const confirmMismatch = b.confirmMismatch === true;
    const result = (b.ignoreAssociation === true ? null : await openViaAssociation(ctx, b.path, confirmMismatch)) ?? (await openItem(ctx, b.path, b.confirmProgram === true, confirmMismatch));
    await addRecent(ctx, result.opened).catch(() => {});
    return result;
  },
  async reveal(ctx, b) {
    return await revealItem(ctx, b.path);
  },
  async zip(ctx, b) {
    return await createZip(ctx, b.paths, b.name);
  },
  async unzip(ctx, b) {
    return await extractZip(ctx, b.path, b.dest);
  },
  async bulkrename(ctx, b) {
    return await bulkRename(ctx, b.folder, b.names, b.spec, b.apply === true);
  },
  async "tools/overview"(ctx, b) {
    return await overview(ctx, b.paths);
  },
  async "tools/run"(ctx, b) {
    return { job: await startConvert(ctx, { action: b.action, paths: b.paths, options: b.options, outputDir: b.outputDir, pattern: b.pattern }) };
  },
  async "tools/preview"(ctx, b) {
    return await previewConvert(ctx, { action: b.action, paths: b.paths, options: b.options, outputDir: b.outputDir, pattern: b.pattern });
  },
  async "tools/setup/options"(ctx) {
    return await setupOptions(ctx);
  },
  async "tools/setup"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Installing needs your confirmation.");
    return await planSetup(ctx, { tools: b.tools, manager: b.manager });
  },
  async "tools/install"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Installing needs your confirmation.");
    return { job: startInstall(ctx, b.tools) };
  },
  async "jobs/list"(ctx) {
    return { jobs: ctx.jobs.list() };
  },
  async "jobs/cancel"(ctx, b) {
    return { cancelled: ctx.jobs.cancel(String(b.id ?? "")) };
  },
  async "jobs/clear"(ctx) {
    return { removed: ctx.jobs.clearFinished() };
  },
  async settings(ctx, b) {
    return { settings: b.set && typeof b.set === "object" ? await updateSettings(ctx, b.set) : await loadSettings(ctx) };
  },
  async typedpath(ctx, b) {
    const cwd = typeof b.cwd === "string" && b.cwd ? b.cwd : ctx.home;
    const path = parseTypedPath(typeof b.text === "string" ? b.text : "", cwd, ctx.home, ctx.platform);
    if (!path) throw new FmError("BAD_PATH", typeof b.text === "string" && /^\s*["']?file:/i.test(b.text) ? "That file:// address doesn't point to a place on this computer. It should look like file:///Users/you/Documents." : "Type a folder location, like ~/Documents.");
    const st = await fsp.stat(path).catch(() => null);
    return { path, exists: !!st, isDir: !!st?.isDirectory() };
  },
  async copytext(_ctx, b) {
    if (typeof b.text !== "string" || b.text.length > 100_000) throw new FmError("BAD_REQUEST", "Nothing to copy.");
    return { copied: writeClipboardSync(b.text) };
  },
};

// The power tools (Find, Watch, Crypto, IP info, Network) bring their own operations.
Object.assign(operations, aboutOperations, themeOperations, checkOperations, openWithOperations, findOperations, watchOperations, cryptoOperations, ipOperations, netOperations, sdOperations, codeOperations, vaultOperations, devOperations, infoOperations, serveOperations, dataCompareOperations, editorOperations);

Object.assign(operations, secretsOperations);

export const API_OPERATIONS = Object.keys(operations);

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: secureHeaders({ "Content-Type": MIME.json! }) });
}

function failure(err: unknown): Response {
  if (err instanceof FmError) {
    const needsConfirm = err.code === "NEEDS_CONFIRM" || err.code === "TYPE_MISMATCH";
    return json(needsConfirm ? 409 : 400, { ok: false, error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } });
  }
  const info = describeFsError(err);
  const unexpected = info.code === "UNKNOWN" || !/^E[A-Z]+$/.test(info.code);
  return json(unexpected ? 500 : 400, { ok: false, error: info });
}

export function startFileManagerServer(options: FileManagerServerOptions = {}) {
  const ctx = createContext(options.context);
  const token = options.token ?? randomBytes(24).toString("base64url");
  const assets = getFileManagerAssetsDir();

  const terminals = createTerminalHub();
  const primaryHostname = (options.host ?? "127.0.0.1").toLowerCase();

  async function serveEmbedded(id: string, rel: string, host: string, query: URLSearchParams): Promise<Response> {
    const notFound = () => new Response("Not Found", { status: 404, headers: secureHeaders() });
    const app = Object.prototype.hasOwnProperty.call(EMBEDDED_APPS, id) ? EMBEDDED_APPS[id]! : undefined;
    if (!app) return notFound();
    const dir = nodePath.join(assets, "..", app.dir);
    let name: string;
    try {
      name = decodeURIComponent(rel);
    } catch {
      return notFound();
    }
    if (name === "" || name.endsWith("/")) name += "index.html";
    if (!/^[\w.\-]+(\/[\w.\-]+)*$/.test(name) || name.split("/").some((part) => part === "." || part === "..")) return notFound();
    const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
    const type = EMBED_TYPES[ext];
    const file = nodePath.join(dir, name);
    if (!type || !file.startsWith(dir + nodePath.sep) || !existsSync(file)) return notFound();
    const headers = secureHeaders({ "Content-Type": type, "Content-Security-Policy": embeddedCsp(app, host) });
    if (name === "index.html") {
      // The timer asks its page address for its music playlist (a list of tracks kept in a file next to it).
      if (id === "timer" && query.get("action") === "sync_codecaine_playlist") {
        let tracks: unknown[] = [];
        try {
          const parsed = JSON.parse(readFileSync(nodePath.join(dir, "cache", "codecaine_playlist.json"), "utf8"));
          if (Array.isArray(parsed)) tracks = parsed;
        } catch {
          // no playlist file: an empty list
        }
        return json(200, { success: true, count: tracks.length, tracks });
      }
      const html = readFileSync(file, "utf8");
      const at = html.lastIndexOf("</head>");
      const tweak = `<style>${app.hideCss}</style>`;
      return new Response(at >= 0 ? html.slice(0, at) + tweak + html.slice(at) : html + tweak, { headers });
    }
    return new Response(Bun.file(file), { headers });
  }

  const server = Bun.serve<TerminalSocketData>({
    port: options.port ?? 0,
    hostname: options.host ?? "127.0.0.1",
    maxRequestBodySize: MAX_BODY_BYTES + 1024,
    websocket: {
      open(ws) {
        const { cwd, cols, rows } = ws.data;
        const send = (message: object) => { try { ws.send(JSON.stringify(message)); } catch {} };
        try {
          const session = terminals.open(ctx, {
            cwd,
            cols,
            rows,
            onData: (data) => send({ type: "output", data }),
            onExit: (code) => {
              send({ type: "exit", code });
              try { ws.close(1000, "The shell ended."); } catch {}
            },
          });
          if (!session) {
            send({ type: "error", message: "Too many terminals are open. Close one first." });
            return void ws.close(1008, "Too many terminals.");
          }
          ws.data.session = session;
          // Tell the page whenever the shell changes folder, so the file list can follow it.
          // The shell reports real paths, so compare with the real path of where it started (a symlinked folder would otherwise look like a move).
          let last = ws.data.cwd;
          try { last = realpathSync(ws.data.cwd); } catch {}
          let busy = false;
          let alive = true;
          const check = async () => {
            if (busy || !alive) return;
            busy = true;
            try {
              const now = await shellFolder(ctx.platform, session.pid);
              if (alive && now && now !== last) {
                last = now;
                send({ type: "cwd", path: now });
              }
            } finally {
              busy = false;
            }
          };
          const timer = setInterval(() => void check(), 2500);
          timer.unref?.();
          ws.data.watch = { check: () => void check(), stop: () => { alive = false; clearInterval(timer); } };
        } catch (err) {
          send({ type: "error", message: `The terminal couldn't start: ${describeFsError(err).message}` });
          ws.close(1011, "Could not start.");
        }
      },
      message(ws, message) {
        if (typeof message !== "string" || message.length > MAX_INPUT_BYTES) return;
        let m: any;
        try {
          m = JSON.parse(message);
        } catch {
          return;
        }
        if (!m || typeof m !== "object") return;
        if (m.type === "input" && typeof m.data === "string") {
          ws.data.session?.write(m.data);
          // A command was run: look soon, and again once it has had time to change folder.
          if (/[\r\n]/.test(m.data)) for (const ms of [120, 450, 1200]) setTimeout(() => ws.data.watch?.check(), ms).unref?.();
        }
        else if (m.type === "resize") ws.data.session?.resize(clampSize(m.cols, 80, 2, 500), clampSize(m.rows, 24, 1, 200));
      },
      close(ws) {
        ws.data.watch?.stop();
        ws.data.session?.close();
      },
    },
    async fetch(req, srv) {
      const blocked = guardLocalRequest(req);
      if (blocked) return blocked;
      const url = new URL(req.url);
      const path = url.pathname;

      try {
        // Embedded apps are served to an iframe on the other loopback spelling, which is a separate origin.
        const embedded = /^\/app\/([a-z]+)\/(.*)$/.exec(path);
        if (embedded) {
          if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: secureHeaders() });
          return await serveEmbedded(embedded[1]!, embedded[2]!, url.host, url.searchParams);
        }
        // Anything else is only for this window's own address, so a page on the calculator's origin can't reach the token.
        if (url.hostname.toLowerCase() !== primaryHostname) return new Response("Not Found", { status: 404, headers: secureHeaders() });
        if (req.method === "GET" && (path === "/" || path === "/index.html")) {
          const file = nodePath.join(assets, "index.html");
          if (!existsSync(file)) return new Response("The File Manager page is missing.", { status: 500 });
          const nonce = randomBytes(16).toString("base64");
          const html = readFileSync(file, "utf8").replaceAll("__FM_TOKEN__", token).replaceAll("__FM_NONCE__", nonce).replaceAll("__FM_PLATFORM__", ctx.platform).replaceAll("__FM_START__", options.startPath ? encodeURIComponent(nodePath.resolve(options.startPath)) : "");
          return new Response(html, { headers: secureHeaders({ "Content-Type": MIME.html!, "Content-Security-Policy": pageCsp(url.host, nonce) }) });
        }

        // The terminal: a WebSocket that needs the session token and must come from this page's own address.
        if (req.method === "GET" && path === "/api/terminal") {
          if (!tokenMatches(url.searchParams.get("token"), token)) return json(401, { ok: false, error: { code: "NO_TOKEN", message: "Not allowed. Reload the File Manager window." } });
          if (!terminalSupported(ctx.platform)) return json(501, { ok: false, error: { code: "NO_TERMINAL", message: "The terminal isn't available on this system yet." } });
          if (req.headers.get("origin") !== `http://${url.host}`) return json(403, { ok: false, error: { code: "BAD_ORIGIN", message: "Not allowed." } });
          const cwd = absolutePath(ctx, url.searchParams.get("path"));
          if (!(await fsp.stat(cwd)).isDirectory()) return json(400, { ok: false, error: { code: "NOT_A_FOLDER", message: "That isn't a folder." } });
          const data: TerminalSocketData = { cwd, cols: clampSize(url.searchParams.get("cols"), 80, 2, 500), rows: clampSize(url.searchParams.get("rows"), 24, 1, 200) };
          if (srv.upgrade(req, { data })) return undefined;
          return new Response("This address only accepts a WebSocket.", { status: 426, headers: secureHeaders() });
        }

        const vendor = /^\/vendor\/(xterm\.mjs|addon-fit\.mjs|xterm\.css|LICENSE-xterm\.txt)$/.exec(path);
        if (req.method === "GET" && vendor) {
          const file = nodePath.join(assets, "vendor", vendor[1]!);
          if (!existsSync(file)) return new Response("Not Found", { status: 404 });
          const type = vendor[1]!.endsWith(".css") ? MIME.css! : vendor[1]!.endsWith(".txt") ? "text/plain; charset=utf-8" : MIME.js!;
          return new Response(Bun.file(file), { headers: secureHeaders({ "Content-Type": type, "Content-Security-Policy": CSP }) });
        }

        const ui = /^\/ui\/([\w.-]+\.(js|css|svg|png))$/.exec(path);
        if (req.method === "GET" && ui) {
          const file = nodePath.join(assets, "ui", ui[1]!);
          if (!existsSync(file)) return new Response("Not Found", { status: 404 });
          return new Response(Bun.file(file), { headers: secureHeaders({ "Content-Type": MIME[ui[2]!]!, "Content-Security-Policy": CSP }) });
        }

        if (req.method === "GET" && path === "/api/health") {
          return json(200, { status: "ok", app: APP_ID, name: APP_NAME, version: APP_VERSION, platform: ctx.platform, timestamp: Date.now() });
        }

        if (req.method === "GET" && path === "/api/raw") {
          if (!tokenMatches(url.searchParams.get("token"), token)) return json(401, { ok: false, error: { code: "NO_TOKEN", message: "Not allowed." } });
          const file = absolutePath(ctx, url.searchParams.get("path"));
          const ext = extensionOf(pathApi(ctx).basename(file));
          const mime = RAW_MIME[ext];
          if (!mime || classify(pathApi(ctx).basename(file), false).preview !== "image") return json(415, { ok: false, error: { code: "NOT_AN_IMAGE", message: "Only pictures can be previewed this way." } });
          const st = await fsp.stat(file);
          if (!st.isFile()) return json(400, { ok: false, error: { code: "NOT_A_FILE", message: "That isn't a file." } });
          if (st.size > MAX_RAW_BYTES) return json(413, { ok: false, error: { code: "TOO_BIG", message: "That picture is too big to preview." } });
          return new Response(Bun.file(file), { headers: secureHeaders({ "Content-Type": mime, "Content-Security-Policy": "sandbox; default-src 'none'", "Cache-Control": "private, max-age=30" }) });
        }

        if (req.method === "POST" && path.startsWith("/api/")) {
          if (!tokenMatches(req.headers.get("x-fm-token"), token)) return json(401, { ok: false, error: { code: "NO_TOKEN", message: "Not allowed. Reload the File Manager window." } });
          const op = path.slice("/api/".length);
          const handler = Object.prototype.hasOwnProperty.call(operations, op) ? operations[op] : undefined;
          if (!handler) return json(404, { ok: false, error: { code: "UNKNOWN_OPERATION", message: "Unknown operation." } });
          if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json(415, { ok: false, error: { code: "NOT_JSON", message: "Requests must be JSON." } });
          const declared = Number(req.headers.get("content-length") ?? 0);
          if (declared > MAX_BODY_BYTES) return json(413, { ok: false, error: { code: "TOO_LARGE", message: "That request is too large." } });
          const text = await req.text();
          if (text.length > MAX_BODY_BYTES) return json(413, { ok: false, error: { code: "TOO_LARGE", message: "That request is too large." } });
          let body: Record<string, any>;
          try {
            body = text ? JSON.parse(text) : {};
          } catch {
            return json(400, { ok: false, error: { code: "BAD_JSON", message: "That request wasn't valid JSON." } });
          }
          if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { ok: false, error: { code: "BAD_JSON", message: "That request must be a JSON object." } });
          const data = await handler(ctx, body);
          return json(200, { ok: true, ...(data as object) });
        }

        return new Response("Not Found", { status: 404, headers: secureHeaders() });
      } catch (err) {
        return failure(err);
      }
    },
  });

  // Stopping the server must also end every shell it started.
  const stopServer = server.stop.bind(server);
  server.stop = (closeActiveConnections?: boolean) => {
    terminals.closeAll();
    ctx.jobs.cancelAll();
    for (const dispose of ctx.disposers.splice(0)) {
      try { dispose(); } catch {}
    }
    return stopServer(closeActiveConnections);
  };

  return Object.assign(server, { token, context: ctx });
}
