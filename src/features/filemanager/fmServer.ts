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
import { existsSync, promises as fsp, readFileSync } from "fs";
import * as nodePath from "path";
import { guardLocalRequest, writeClipboardSync } from "../../localGuard";
import { absolutePath, createContext, pathApi, type FmContext, type FmContextOptions } from "./fmCore";
import { listFolder, listPlaces, previewFile, propertiesOf, searchFolder } from "./fmList";
import { bulkRename, copyItems, findConflicts, makeFile, makeFolder, moveItems, relocate, renameItem } from "./fmOps";
import { openItem, revealItem } from "./fmOpen";
import { FmError, classify, describeFsError, parseTypedPath, extensionOf } from "./fmPaths";
import { addRecent, loadSettings, updateSettings } from "./fmSettings";
import { deleteFromTrash, deletePermanently, listTrash, moveToTrash, restoreFromTrash } from "./fmTrash";
import { createZip, extractZip } from "./fmZip";

export const APP_ID = "file_manager_studio";
export const APP_NAME = "File Manager";
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

type Handler = (ctx: FmContext, body: Record<string, any>) => Promise<unknown>;

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
    const result = await openItem(ctx, b.path, b.confirmProgram === true);
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
  async settings(ctx, b) {
    return { settings: b.set && typeof b.set === "object" ? await updateSettings(ctx, b.set) : await loadSettings(ctx) };
  },
  async typedpath(ctx, b) {
    const cwd = typeof b.cwd === "string" && b.cwd ? b.cwd : ctx.home;
    const path = parseTypedPath(typeof b.text === "string" ? b.text : "", cwd, ctx.home, ctx.platform);
    if (!path) throw new FmError("BAD_PATH", "Type a folder location, like ~/Documents.");
    const st = await fsp.stat(path).catch(() => null);
    return { path, exists: !!st, isDir: !!st?.isDirectory() };
  },
  async copytext(_ctx, b) {
    if (typeof b.text !== "string" || b.text.length > 100_000) throw new FmError("BAD_REQUEST", "Nothing to copy.");
    return { copied: writeClipboardSync(b.text) };
  },
};

export const API_OPERATIONS = Object.keys(operations);

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: secureHeaders({ "Content-Type": MIME.json! }) });
}

function failure(err: unknown): Response {
  if (err instanceof FmError) return json(err.code === "NEEDS_CONFIRM" ? 409 : 400, { ok: false, error: { code: err.code, message: err.message } });
  const info = describeFsError(err);
  const unexpected = info.code === "UNKNOWN" || !/^E[A-Z]+$/.test(info.code);
  return json(unexpected ? 500 : 400, { ok: false, error: info });
}

export function startFileManagerServer(options: FileManagerServerOptions = {}) {
  const ctx = createContext(options.context);
  const token = options.token ?? randomBytes(24).toString("base64url");
  const assets = getFileManagerAssetsDir();

  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: options.host ?? "127.0.0.1",
    maxRequestBodySize: MAX_BODY_BYTES + 1024,
    async fetch(req) {
      const blocked = guardLocalRequest(req);
      if (blocked) return blocked;
      const url = new URL(req.url);
      const path = url.pathname;

      try {
        if (req.method === "GET" && (path === "/" || path === "/index.html")) {
          const file = nodePath.join(assets, "index.html");
          if (!existsSync(file)) return new Response("The File Manager page is missing.", { status: 500 });
          const html = readFileSync(file, "utf8").replaceAll("__FM_TOKEN__", token).replaceAll("__FM_PLATFORM__", ctx.platform).replaceAll("__FM_START__", options.startPath ? encodeURIComponent(nodePath.resolve(options.startPath)) : "");
          return new Response(html, { headers: secureHeaders({ "Content-Type": MIME.html!, "Content-Security-Policy": CSP }) });
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

  return Object.assign(server, { token, context: ctx });
}
