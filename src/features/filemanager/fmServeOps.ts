/**
 * API operations of the "Serve" power tool, namespaced `serve/...`: start and stop a live server (static files with
 * automatic reload) or PHP's built-in server for a folder, list what is running, show a server's log, and open a
 * running server in the browser. Servers belong to this File Manager session and end with it.
 */
import { realpathSync, statSync } from "fs";
import * as nodePath from "path";
import { absolutePath, assertFolder, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { openCommand } from "./fmOpen";
import { FmError, isSameOrInside, protectedReason } from "./fmPaths";
import { detectFolder, detectPhp, type PhpInfo } from "./fmServePhp";
import { LIVE_FIRST_PORT, MAX_SERVERS, PHP_FIRST_PORT, getServeRegistry, type ServerKind, type StartRequest } from "./fmServeRegistry";
import { lanAddress } from "./fmServeStatic";

const MAX_PATH_TEXT = 4096;

/** The File Manager's own files: never served, even when the chosen folder contains them. */
function ownFolders(ctx: FmContext): string[] {
  return [ctx.dataDir, ctx.trashRoot, nodePath.join(import.meta.dir, "..", "..", "..", "resources", "file_manager")].map((p) => nodePath.resolve(p));
}

const realOr = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return nodePath.resolve(p);
  }
};

/** A folder from the page that may be served: it exists, is a real folder, and isn't a place that is too broad or belongs to the system. */
async function servableFolder(ctx: FmContext, input: unknown): Promise<string> {
  const root = absolutePath(ctx, input);
  if (/[\r\n]/.test(root) || root.length > MAX_PATH_TEXT) throw new FmError("BAD_PATH", "That location isn't valid.");
  await assertFolder(root, "That folder");
  const real = realOr(root);
  const p = pathApi(ctx);
  const ci = ctx.platform !== "linux";
  // The shared check also guards the home folder and its main subfolders against being moved or deleted; serving a
  // project inside Documents is fine, so it is asked about with no home, and the home folder itself is refused here.
  const noHome = ctx.platform === "win32" ? "Z:\\__no_home__" : "/__no_home__";
  for (const candidate of new Set([root, real])) {
    const isHome = ci ? candidate.toLowerCase() === p.resolve(ctx.home).toLowerCase() : candidate === p.resolve(ctx.home);
    if (isHome || protectedReason(candidate, { platform: ctx.platform, home: noHome }, "modify") || protectedReason(candidate, { platform: ctx.platform, home: ctx.home }, "create")) {
      throw new FmError("PROTECTED", "That folder is too broad or belongs to the system to be served. Pick a project folder: not the top of a drive, your home folder or a system folder.");
    }
  }
  for (const own of ownFolders(ctx)) {
    if (isSameOrInside(real, realOr(own), ctx.platform)) throw new FmError("PROTECTED", "That folder holds the File Manager's own files, which are never served.");
  }
  return root;
}

/** A folder or file inside `root`, named relative to it. Empty means `root` itself. */
function insideRoot(ctx: FmContext, root: string, input: unknown, what: string, shape: "folder" | "file"): string {
  if (input === undefined || input === null || input === "") return "";
  if (typeof input !== "string" || input.includes("\0") || /[\r\n]/.test(input) || input.length > MAX_PATH_TEXT) throw new FmError("BAD_REQUEST", `${what} isn't valid.`);
  const p = ctx.platform === "win32" ? nodePath.win32 : nodePath.posix;
  if (p.isAbsolute(input)) throw new FmError("BAD_REQUEST", `${what} must be a path inside the folder (like public), not a full path.`);
  const full = p.resolve(root, input);
  if (!isSameOrInside(full, root, ctx.platform)) throw new FmError("BAD_REQUEST", `${what} must be inside the folder.`);
  let real: string;
  try {
    real = realpathSync(full);
  } catch {
    throw new FmError("NOT_FOUND", `${what} doesn't exist: ${input}`);
  }
  if (!isSameOrInside(real, realOr(root), ctx.platform)) throw new FmError("BAD_REQUEST", `${what} points outside the folder.`);
  const st = statSync(real);
  if (shape === "folder" && !st.isDirectory()) throw new FmError("NOT_A_FOLDER", `${what} isn't a folder: ${input}`);
  if (shape === "file" && !st.isFile()) throw new FmError("NOT_A_FILE", `${what} isn't a file: ${input}`);
  return full;
}

function flag(b: Record<string, any>, key: string, fallback: boolean): boolean {
  const v = b[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "boolean") throw new FmError("BAD_REQUEST", `"${key}" must be on or off.`);
  return v;
}

function portOf(value: unknown): number | null {
  if (value === undefined || value === null || value === "" || value === "auto" || value === 0) return null;
  const n = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1024 || n > 65535) throw new FmError("BAD_REQUEST", "The port must be a whole number from 1024 to 65535, or Auto.");
  return n;
}

function noPhpError(info: PhpInfo): FmError {
  return new FmError("NO_PHP", `PHP isn't installed on this computer, so the PHP server can't start. ${info.hints.join(" ")}`, { hints: info.hints });
}

async function openUrl(ctx: FmContext, url: string): Promise<void> {
  const { command, args } = openCommand(ctx.platform, url);
  try {
    await ctx.launch(command, args);
  } catch (err: any) {
    throw new FmError("OPEN_FAILED", `Couldn't open your web browser: ${err?.message ?? err}. The address is ${url}`);
  }
}

async function parseStart(ctx: FmContext, input: Record<string, any>) {
  const b: Record<string, any> = { ...input, ...(input.options && typeof input.options === "object" && !Array.isArray(input.options) ? input.options : {}) };
  const root = await servableFolder(ctx, b.root ?? b.path);
  const docroot = insideRoot(ctx, root, b.docroot, "The document folder", "folder") || root;
  const requested = b.kind === undefined || b.kind === null || b.kind === "" ? "auto" : b.kind;
  if (!["auto", "static", "php"].includes(requested)) throw new FmError("BAD_REQUEST", "The kind of server must be auto, static or php.");
  const kind: ServerKind = requested === "auto" ? ((await detectFolder(docroot)).hasPhp ? "php" : "static") : (requested as ServerKind);
  const host = b.host === undefined || b.host === null || b.host === "" ? (b.lan === true ? "lan" : "local") : b.host;
  if (!["local", "lan", "127.0.0.1", "0.0.0.0"].includes(host)) throw new FmError("BAD_REQUEST", "The address must be this computer only, or your network.");
  const lan = host === "lan" || host === "0.0.0.0";
  let php = "";
  let phpVersion: string | null = null;
  let router = "";
  if (kind === "php") {
    const info = await detectPhp(ctx, typeof b.phpPath === "string" && b.phpPath.trim() ? b.phpPath.trim() : undefined);
    if (!info.available) throw noPhpError(info);
    php = info.path!;
    phpVersion = info.version;
    router = insideRoot(ctx, root, b.router, "The router script", "file");
    if (router && !/\.php$/i.test(router)) throw new FmError("BAD_REQUEST", "The router script must be a PHP file.");
  }
  const request: StartRequest = {
    kind, root, docroot, port: portOf(b.port), lan,
    liveReload: flag(b, "liveReload", true), dotfiles: flag(b, "dotfiles", false), cors: flag(b, "cors", false), listing: flag(b, "listing", true),
    router, php, phpVersion, forbidden: ownFolders(ctx),
  };
  return { request, openBrowser: flag(b, "openBrowser", false) };
}

export const serveOperations: Record<string, FmHandler> = {
  async "serve/status"(ctx) {
    const php = await detectPhp(ctx);
    return {
      php, servers: getServeRegistry(ctx).list(), max: MAX_SERVERS, lanAddress: lanAddress(),
      firstPorts: { static: LIVE_FIRST_PORT, php: PHP_FIRST_PORT },
    };
  },

  async "serve/detect"(ctx, b) {
    const root = await servableFolder(ctx, b.path);
    const found = await detectFolder(root);
    const php = await detectPhp(ctx);
    const reg = getServeRegistry(ctx);
    return { path: root, ...found, phpAvailable: php.available, running: { static: reg.findFor(root, "static") ?? null, php: reg.findFor(root, "php") ?? null } };
  },

  async "serve/start"(ctx, b) {
    const { request, openBrowser } = await parseStart(ctx, b);
    const server = await getServeRegistry(ctx).start(request);
    let openError = "";
    if (openBrowser) {
      try {
        await openUrl(ctx, server.url);
      } catch (err) {
        openError = err instanceof FmError ? err.message : "The web browser couldn't be opened.";
      }
    }
    return { server, openError };
  },

  async "serve/stop"(ctx, b) {
    return { server: await getServeRegistry(ctx).stop(b.id) };
  },

  async "serve/stopAll"(ctx) {
    return { stopped: await getServeRegistry(ctx).stopAll() };
  },

  async "serve/log"(ctx, b) {
    return getServeRegistry(ctx).log(b.id, b.since);
  },

  async "serve/open"(ctx, b) {
    const server = getServeRegistry(ctx).summary(b.id);
    if (server.status !== "running") throw new FmError("NOT_RUNNING", "That server isn't running.");
    const path = b.path === undefined || b.path === null || b.path === "" ? "/" : b.path;
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > MAX_PATH_TEXT || /[\\\0\r\n]/.test(path)) throw new FmError("BAD_REQUEST", "That address isn't valid.");
    const base = new URL(server.url);
    const target = new URL(path, base);
    if (target.origin !== base.origin) throw new FmError("BAD_REQUEST", "That address isn't valid.");
    await openUrl(ctx, target.href);
    return { opened: target.href };
  },
};
