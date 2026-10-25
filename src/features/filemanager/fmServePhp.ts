/**
 * PHP's built-in web server for a folder: finding `php`, telling what kind of project a folder is, and running
 * `php -S` safely. It is started with an argument list (never through a shell), in the served folder, with a
 * minimal environment (so none of this app's own secrets are passed on), and it is always ended again: stopped
 * with SIGTERM then SIGKILL, with its helper processes, when the File Manager stops, and as a last resort when
 * this program exits. PHP's own "development server only" warning applies: it is not meant for a network.
 */
import { promises as fsp, statSync } from "fs";
import { connect, createServer } from "net";
import * as nodePath from "path";
import type { Subprocess } from "bun";
import type { FmContext } from "./fmCore";
import { capture } from "./fmToolDetect";
import { FmError } from "./fmPaths";
import { findExecutable, searchDirs } from "./fmTools";
import { RingLog } from "./fmServeLog";

export const PHP_READY_MS = 5000;
export const PHP_TERM_GRACE_MS = 2000;
const PHP_NAME = /^php(\d+(\.\d+)*)?(\.exe)?$/i;

export interface PhpInfo {
  available: boolean;
  path: string | null;
  /** "PHP 8.5.11 (cli)", or null. */
  version: string | null;
  /** Plain-words ways to install it, shown only (never run for the person). */
  hints: string[];
}

export function installHints(platform: FmContext["platform"]): string[] {
  if (platform === "darwin") return ["Install PHP with Homebrew: brew install php"];
  if (platform === "win32") return ["Install PHP with winget: winget install PHP.PHP", "Or with Scoop: scoop install php"];
  return ["On Debian or Ubuntu: sudo apt install php-cli", "On Fedora: sudo dnf install php-cli", "With Homebrew: brew install php"];
}

function phpDirs(ctx: Pick<FmContext, "platform" | "home" | "toolDirs">): string[] {
  const dirs = searchDirs(ctx);
  if (ctx.toolDirs) return dirs;
  if (ctx.platform === "darwin") dirs.push("/opt/homebrew/opt/php/bin", "/usr/local/opt/php/bin");
  if (ctx.platform === "win32") dirs.push("C:\\php", "C:\\tools\\php", nodePath.win32.join(ctx.home, "scoop", "apps", "php", "current"));
  if (ctx.platform === process.platform) {
    const whichPhp = Bun.which("php");
    if (whichPhp) {
      const dir = (ctx.platform === "win32" ? nodePath.win32 : nodePath.posix).dirname(whichPhp);
      if (!dirs.includes(dir)) dirs.push(dir);
    }
  }
  return dirs;
}

/** What a PHP program may know about this computer: the least it needs to run. */
export function phpEnv(ctx: Pick<FmContext, "platform" | "home" | "toolDirs">): Record<string, string> {
  const win = ctx.platform === "win32";
  const src = process.env;
  const env: Record<string, string> = {};
  const pick = (key: string) => {
    const v = src[key];
    if (v !== undefined) env[key] = v;
  };
  env[win ? "Path" : "PATH"] = phpDirs(ctx).join(win ? ";" : ":");
  env.HOME = src.HOME ?? ctx.home;
  pick("LANG");
  pick("TMPDIR");
  if (win) for (const k of ["SystemRoot", "TEMP", "TMP", "windir", "USERPROFILE"]) pick(k);
  return env;
}

const infoCache = new Map<string, { version: string | null; mtime: number }>();

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** The PHP command line program to use: `override` if given and valid, else the first `php` found. */
export async function detectPhp(ctx: FmContext, override?: string): Promise<PhpInfo> {
  const missing: PhpInfo = { available: false, path: null, version: null, hints: installHints(ctx.platform) };
  let path: string | null;
  if (override) {
    const p = ctx.platform === "win32" ? nodePath.win32 : nodePath.posix;
    if (override.includes("\0") || /[\r\n]/.test(override) || !p.isAbsolute(override)) throw new FmError("BAD_REQUEST", "The PHP program must be given as a full path.");
    if (!PHP_NAME.test(p.basename(override))) throw new FmError("BAD_REQUEST", "That doesn't look like a PHP program. Its file name should be php (or php8.3 and so on).");
    path = findExecutable(ctx.platform, [p.basename(override).replace(/\.exe$/i, "")], [p.dirname(override)]);
    if (!path) throw new FmError("NO_PHP", "There is no program at that PHP path, or it can't be run.");
  } else {
    path = findExecutable(ctx.platform, ["php"], phpDirs(ctx));
    if (!path && !ctx.toolDirs && ctx.platform === process.platform) path = Bun.which("php");
    if (!path) return missing;
  }
  const mtime = mtimeOf(path);
  let cached = infoCache.get(path);
  if (!cached || cached.mtime !== mtime || !cached.version) {
    const asked = await capture([path, "-v"], phpEnv(ctx), 15000);
    const m = /^PHP\s+(\S+)\s+\((cli)\)/m.exec(asked.text);
    cached = { version: m ? `PHP ${m[1]} (${m[2]})` : null, mtime };
    if (cached.version) infoCache.set(path, cached);
  }
  // A program that isn't the command-line PHP can't run a server.
  if (!cached.version) {
    if (override) throw new FmError("NO_PHP", "That program didn't answer like PHP's command line version.");
    return missing;
  }
  return { available: true, path, version: cached.version, hints: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// What kind of folder is it?
// ---------------------------------------------------------------------------------------------------------------

export interface FolderKind {
  kind: "php" | "static";
  /** "laravel", "symfony", "wordpress", "composer" or null. */
  framework: string | null;
  hints: string[];
  /** The folder to serve, relative to the project ("" = the project folder itself). */
  suggestedDocroot: string;
  indexFiles: string[];
  hasPhp: boolean;
  hasHtml: boolean;
}

const DOCROOT_NAMES = ["public", "web", "www", "htdocs", "public_html"];

async function entriesOf(dir: string): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  try {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) out.set(e.name, e.isDirectory());
  } catch {}
  return out;
}

const anyFile = (list: Map<string, boolean>, re: RegExp) => [...list.entries()].some(([n, isDir]) => !isDir && re.test(n));

export async function detectFolder(root: string): Promise<FolderKind> {
  const top = await entriesOf(root);
  const hasFile = (n: string) => top.get(n) === false;
  const hasDir = (n: string) => top.get(n) === true;
  const hints: string[] = [];
  let framework: string | null = null;
  let docroot = "";

  let publicName = "";
  for (const d of DOCROOT_NAMES) {
    if (hasDir(d) && (await entriesOf(nodePath.join(root, d))).get("index.php") === false) {
      publicName = d;
      break;
    }
  }

  if (hasFile("artisan")) {
    framework = "laravel";
    hints.push("Laravel project. It needs PHP 8 and the vendor folder made by `composer install`.");
    docroot = publicName;
  } else if (hasFile("wp-config.php") || (hasDir("wp-content") && hasFile("wp-load.php"))) {
    framework = "wordpress";
    hints.push("WordPress site. It needs a database (MySQL or MariaDB), which this server doesn't provide.");
  } else if (hasFile("composer.json") && publicName) {
    framework = top.has("symfony.lock") ? "symfony" : "composer";
    hints.push(framework === "symfony" ? "Symfony project. Its web folder is public." : `A Composer project. Its web folder is ${publicName}.`);
    docroot = publicName;
  } else if (!hasFile("index.php") && publicName) {
    docroot = publicName;
    hints.push(`The web pages are in "${publicName}", so that folder is suggested as the document root.`);
  } else if (hasFile("composer.json")) framework = "composer";

  const base = docroot ? await entriesOf(nodePath.join(root, docroot)) : top;
  const hasPhp = anyFile(top, /\.php$/i) || anyFile(base, /\.php$/i);
  const indexFiles = ["index.php", "index.html", "index.htm"].filter((f) => base.get(f) === false);
  const hasHtml = anyFile(top, /\.html?$/i) || anyFile(base, /\.html?$/i);
  if (hasPhp) hints.unshift("This folder has PHP files, so the PHP server is suggested.");
  else if (hasHtml) hints.unshift("This folder has web pages (HTML), so the live server is suggested.");
  return { kind: hasPhp ? "php" : "static", framework, hints, suggestedDocroot: docroot, indexFiles, hasPhp, hasHtml };
}

// ---------------------------------------------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------------------------------------------

function canConnect(host: string, port: number, ms = 800): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = connect({ host: host === "0.0.0.0" ? "127.0.0.1" : host, port });
    const timer = setTimeout(() => done(false), ms);
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch {}
      resolve(v);
    };
    socket.setTimeout(ms, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/** True when something already accepts connections on the port, or it can't be bound. */
export async function portInUse(host: string, port: number): Promise<boolean> {
  const bindFailed = await new Promise<boolean>((resolve) => {
    let settled = false;
    const srv = createServer();
    const timer = setTimeout(() => finish(false), 800);
    const finish = (v: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { srv.close(); } catch {}
      resolve(v);
    };
    srv.once("error", () => finish(true));
    srv.listen({ host, port, exclusive: true }, () => srv.close(() => finish(false)));
  });
  if (bindFailed) return true;
  return canConnect(host, port);
}

const livePids = new Set<number>();
let exitHooked = false;

function hookExit(): void {
  if (exitHooked) return;
  exitHooked = true;
  process.on("exit", () => {
    for (const pid of livePids) killTree(pid, "SIGKILL");
  });
}

/** Ends a process and everything it started. Children first, so none is left without a parent to wait for. */
export function killTree(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
  if (!pid || pid <= 0) return;
  if (process.platform === "win32") {
    try { process.kill(pid, signal); } catch {}
    return;
  }
  try {
    const found = Bun.spawnSync(["pgrep", "-P", String(pid)], { stdout: "pipe", stderr: "ignore", stdin: "ignore", timeout: 2000 });
    for (const child of found.stdout.toString().split(/\s+/).map(Number).filter((n) => n > 0)) killTree(child, signal);
  } catch {}
  try { process.kill(pid, signal); } catch {}
}

export interface PhpStartOptions {
  php: string;
  host: string;
  port: number;
  docroot: string;
  /** Absolute path of a router script, or "". */
  router: string;
  env: Record<string, string>;
  log: RingLog;
  onRequest?: () => void;
  readyMs?: number;
  termGraceMs?: number;
}

export interface PhpProcess {
  readonly pid: number;
  readonly exited: Promise<number | null>;
  /** null while it runs. */
  exitCode(): number | null;
  stop(): Promise<void>;
  /** Ends it at once, without waiting (used when the File Manager is closing). */
  killNow(): void;
}

/** A plain-words explanation of what PHP printed when it couldn't start. */
export function explainPhpFailure(text: string, host: string, port: number): string {
  if (/address already in use|Failed to listen/i.test(text)) return `Port ${port} is already used by another program on this computer (maybe another PHP server). Pick a different port, or leave the port on Auto.`;
  if (/permission denied/i.test(text)) return `PHP isn't allowed to use port ${port}. Pick a port from 1024 up.`;
  const last = text.split("\n").map((l) => l.trim()).filter(Boolean).slice(-4).join(" ");
  return last ? `PHP stopped as soon as it started. It said: ${last}` : `PHP stopped as soon as it started, without saying why. Try running "php -S ${host}:${port}" in a terminal to see the problem.`;
}

/** A development server shows PHP's errors in the page and the log, whatever the installed php.ini (Linux packages ship with display_errors off). */
export const DEV_INI = ["-d", "display_errors=1", "-d", "error_reporting=E_ALL", "-d", "log_errors=1"];

export async function startPhp(o: PhpStartOptions): Promise<PhpProcess> {
  hookExit();
  if (await portInUse(o.host, o.port)) throw new FmError("PORT_IN_USE", explainPhpFailure("Address already in use", o.host, o.port));
  const argv = [o.php, ...DEV_INI, "-S", `${o.host}:${o.port}`, "-t", o.docroot, ...(o.router ? ["--", o.router] : [])];
  o.log.add(`$ ${argv.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
  let proc: Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn(argv, { cwd: o.docroot, env: o.env, stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true });
  } catch (err: any) {
    throw new FmError("PHP_FAILED", `PHP couldn't be started: ${err?.message ?? err}`);
  }
  const pid = proc.pid;
  livePids.add(pid);
  let tail = "";
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    const dec = new TextDecoder();
    try {
      for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
        const text = dec.decode(chunk, { stream: true });
        tail = (tail + text).slice(-4000);
        o.log.write(text);
        for (const _ of text.matchAll(/ \[\d{3}\]: [A-Z]+ /g)) o.onRequest?.();
      }
    } catch {}
  };
  const pumps = Promise.all([pump(proc.stdout), pump(proc.stderr)]);
  let code: number | null = null;
  const exited = proc.exited.then(async (c) => {
    code = c;
    livePids.delete(pid);
    await Promise.race([pumps, Bun.sleep(300)]);
    o.log.flush();
    return c as number | null;
  });

  const readyMs = o.readyMs ?? PHP_READY_MS;
  const deadline = Date.now() + readyMs;
  let ready = false;
  while (Date.now() < deadline && proc.exitCode === null) {
    if (await canConnect(o.host, o.port, 500)) { ready = true; break; }
    await Bun.sleep(80);
  }
  if (!ready) {
    const died = proc.exitCode !== null;
    if (!died) {
      if (process.platform === "win32") {
        try { process.kill(pid); } catch {}
      } else {
        killTree(pid, "SIGKILL");
        try { proc.kill("SIGKILL"); } catch {}
      }
    }
    await exited;
    throw new FmError(died ? "PHP_FAILED" : "PHP_NOT_READY", died ? explainPhpFailure(tail, o.host, o.port) : `PHP started but didn't answer on port ${o.port} within ${Math.round(readyMs / 1000)} seconds, so it was stopped.`);
  }

  return {
    pid,
    exited,
    exitCode: () => code,
    async stop() {
      if (code !== null) return;
      if (process.platform === "win32") {
        try { process.kill(pid); } catch {}
        await Promise.race([exited, Bun.sleep(1000)]);
        return;
      }
      killTree(pid, "SIGTERM");
      try { proc.kill("SIGTERM"); } catch {}
      const done = await Promise.race([exited.then(() => true), Bun.sleep(o.termGraceMs ?? PHP_TERM_GRACE_MS).then(() => false)]);
      if (!done) {
        killTree(pid, "SIGKILL");
        try { proc.kill("SIGKILL"); } catch {}
        await Promise.race([exited, Bun.sleep(1000)]);
      }
    },
    killNow() {
      if (code !== null) return;
      if (process.platform === "win32") {
        try { process.kill(pid); } catch {}
        return;
      }
      killTree(pid, "SIGKILL");
      try { proc.kill("SIGKILL"); } catch {}
    },
  };
}
