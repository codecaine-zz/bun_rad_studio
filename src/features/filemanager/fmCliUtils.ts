/**
 * Built-in RAD Studio CLI Utilities for the File Manager.
 *
 * Discovers every command-line tool in `cli_apps/*.ts` (or bundled `cli/*.js` in a packaged build), provisions a
 * ready-to-run `cli_utils` folder inside `ctx.dataDir` with executable wrappers (`./<name>` and `./<stem>`), marks
 * `cli_apps/*.ts` executable (`0o755`), and appends the CLI utilities folder to the built-in Terminal's `PATH`.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import * as nodePath from "path";
import { pathApi, type FmContext, type FmHandler } from "./fmCore";

export interface CliUtilEntry {
  /** Short command name without `_cli`, e.g. `calc`, `fd`, `rad`, `api_stress_bench`. */
  id: string;
  /** File stem in `cli_apps/`, e.g. `calc_cli`, `fd_cli`, `rad_cli`, `api_stress_bench`. */
  stem: string;
  /** Dashed CLI name, e.g. `calc-cli`, `api-stress-bench`. */
  dashedName: string;
  /** Suite alias, e.g. `codecaine-calc`. */
  suiteName: string;
  /** Human-readable description of what the CLI utility does. */
  description: string;
  /** Category for grouping in the CLI Utilities tool tab. */
  category: string;
  /** Absolute path to the underlying `.ts` or `.js` CLI entrypoint. */
  scriptPath: string;
  /** Absolute path to the executable wrapper in `cliUtilsDir(ctx)`. */
  wrapperPath: string;
  /** Absolute path to the `<stem>` wrapper in `cliUtilsDir(ctx)`. */
  stemWrapperPath: string;
  /** Ready-to-run relative invocation in the terminal when inside `cliUtilsDir(ctx)`, e.g. `./calc`. */
  command: string;
  /** Ready-to-run relative stem invocation in the terminal when inside `cliUtilsDir(ctx)`, e.g. `./calc_cli`. */
  stemCommand: string;
}

const KNOWN_DESCRIPTIONS: Record<string, string> = {
  codecaine_suite_cli: "Codecaine Utility Suite Master CLI & Application Hub for all Studios and CLI tools",
  doggo_cli: "Modern DNS Client & Lookup Tool (A, AAAA, CNAME, MX, NS, TXT, SOA, PTR, SRV)",
  gdu_cli: "Fast Disk Usage Analyzer with Interactive Terminal UI & Directory Breakdown",
  ipinfo_cli: "IP Address Geolocation, ASN, Subnet CIDR & Network Intelligence CLI",
  procs_cli: "Modern Process Viewer & Interactive Task Inspector (ps/top replacement)",
  rad_cli: "Bun RAD Utilities CLI — 44-Module Rapid Application Development Showcase & Recipes",
  sd_cli: "Intuitive Find & Replace CLI (sed alternative with literal & regex preview)",
  subfinder_cli: "Passive Subdomain Discovery & DNS Enumeration CLI",
  tokei_cli: "Fast Codebase Line Counter & Language Breakdown Statistics CLI",
  vault_cli: "Encrypt and Decrypt Files & Folders (.radenc) with Password Protection",
  watchexec_cli: "Filesystem Watcher that Executes Commands When Files Change",
};

function categorizeCli(stem: string): string {
  const s = stem.toLowerCase();
  if (/^(api|dns|doggo|ifconfig|ipinfo|network|nmap|port_kill|recon|speedtest|subfinder|wget2|yt_dlp)/.test(s)) return "Network & Web";
  if (/^(crypto|jwt|secrets|vault)/.test(s)) return "Security & Vault";
  if (/^(database|redis|sqlite|convert|dataconvert|jq|json|markdown|pandoc)/.test(s)) return "Data & Databases";
  if (/^(audiotag|color|dot|exif|ffmpeg|imagemagick|media_studio|ocr|say)/.test(s)) return "Media & Graphics";
  if (/^(calc|calculator|graph|kalker|numbat|qalc|statistics)/.test(s)) return "Math & Science";
  if (/^(brew|devops|disk|docker|gdu|launchd|launcher|process|procs|system|task_manager|terminal_recorder)/.test(s)) return "System & DevOps";
  return "Files & DevTools";
}

function shSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Finds the project root that holds `cli_apps/*.ts` or packaged `cli/*.js`. */
export function findCliSourceRoot(): { root: string; cliDir: string; ext: ".ts" | ".js"; binDir: string | null } | null {
  const candidates = [
    nodePath.resolve(import.meta.dir, "../../.."),
    nodePath.resolve(import.meta.dir, "../.."),
    nodePath.resolve(import.meta.dir, ".."),
    nodePath.resolve(process.cwd()),
  ];
  for (const root of candidates) {
    const cliApps = nodePath.join(root, "cli_apps");
    if (existsSync(cliApps)) {
      try {
        if (statSync(cliApps).isDirectory()) {
          const bin = nodePath.join(root, "bin");
          return { root, cliDir: cliApps, ext: ".ts", binDir: existsSync(bin) ? bin : null };
        }
      } catch {}
    }
    const bundledCli = nodePath.join(root, "cli");
    if (existsSync(bundledCli)) {
      try {
        if (statSync(bundledCli).isDirectory()) {
          const bin = nodePath.join(root, "bin");
          return { root, cliDir: bundledCli, ext: ".js", binDir: existsSync(bin) ? bin : null };
        }
      } catch {}
    }
  }
  return null;
}

function extractDescription(stem: string, filePath: string): string {
  if (KNOWN_DESCRIPTIONS[stem]) return KNOWN_DESCRIPTIONS[stem]!;
  try {
    const head = readFileSync(filePath, "utf8").slice(0, 2048);
    const setDesc = /\.setDescription\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)\s*\)/.exec(head);
    const matched = setDesc?.[1] ?? setDesc?.[2] ?? setDesc?.[3];
    if (matched && matched.trim()) return matched.trim();
    const banner = /\.banner\(\s*(?:'([^']+)'|"([^"]+)")/.exec(head);
    const bannerText = banner?.[1] ?? banner?.[2];
    if (bannerText && bannerText.trim()) return bannerText.trim();
  } catch {}
  return `${stem.replace(/_cli$/, "").replace(/_/g, " ")} command-line utility`;
}

let cachedCatalog: Array<Omit<CliUtilEntry, "wrapperPath" | "stemWrapperPath" | "command" | "stemCommand">> | null = null;

function discoverCatalog(): Array<Omit<CliUtilEntry, "wrapperPath" | "stemWrapperPath" | "command" | "stemCommand">> {
  if (cachedCatalog) return cachedCatalog;
  const loc = findCliSourceRoot();
  if (!loc) return [];
  let files: string[] = [];
  try {
    files = readdirSync(loc.cliDir).filter((f) => f.endsWith(loc.ext)).sort();
  } catch {
    return [];
  }
  const items: Array<Omit<CliUtilEntry, "wrapperPath" | "stemWrapperPath" | "command" | "stemCommand">> = [];
  for (const file of files) {
    const stem = file.slice(0, -loc.ext.length).replace(/-/g, "_");
    const id = stem.replace(/_cli$/, "");
    const dashedName = stem.replace(/_/g, "-");
    const suiteName = `codecaine-${id.replace(/_/g, "-")}`;
    const scriptPath = nodePath.join(loc.cliDir, file);
    if (loc.ext === ".ts" && process.platform !== "win32") {
      try {
        const mode = statSync(scriptPath).mode;
        if ((mode & 0o111) === 0) chmodSync(scriptPath, 0o755);
      } catch {}
    }
    items.push({
      id,
      stem,
      dashedName,
      suiteName,
      description: extractDescription(stem, scriptPath),
      category: categorizeCli(stem),
      scriptPath,
    });
  }
  cachedCatalog = items;
  return items;
}

/** The folder inside `ctx.dataDir` where ready-to-run CLI utility wrappers live. */
export function cliUtilsDir(ctx: Pick<FmContext, "dataDir" | "platform">): string {
  return pathApi(ctx).join(ctx.dataDir, "cli_utils");
}

function posixWrapperScript(execPath: string, scriptPath: string): string {
  const quotedExec = shSingleQuote(execPath);
  const quotedScript = shSingleQuote(scriptPath);
  return `#!/bin/sh
export BUN_BE_BUN=1
if [ -x ${quotedExec} ]; then
  exec ${quotedExec} ${quotedScript} "$@"
fi
exec bun ${quotedScript} "$@"
`;
}

function windowsCmdWrapper(execPath: string, scriptPath: string): string {
  return `@echo off\r\nset "BUN_BE_BUN=1"\r\n"${execPath}" "${scriptPath}" %*\r\n`;
}

const provisionedDirs = new Set<string>();

/**
 * Materializes the built-in `cli_utils` directory for `ctx` with executable wrappers for every `cli_apps/*.ts` tool,
 * so the user can open the terminal in `cliUtilsDir(ctx)` and run `./<name>` or `./<stem>` directly.
 */
export function ensureCliUtilsFolder(ctx: Pick<FmContext, "dataDir" | "platform">, options: { force?: boolean } = {}): string {
  const dir = cliUtilsDir(ctx);
  if (!options.force && provisionedDirs.has(dir) && existsSync(dir)) return dir;
  const catalog = discoverCatalog();
  try {
    mkdirSync(dir, { recursive: true });
    const execPath = process.execPath;
    for (const item of catalog) {
      const names = item.id === item.stem ? [item.id] : [item.id, item.stem];
      const shContent = posixWrapperScript(execPath, item.scriptPath);
      for (const name of names) {
        const target = nodePath.join(dir, name);
        writeFileSync(target, shContent, { mode: 0o755 });
        if (process.platform !== "win32") {
          try { chmodSync(target, 0o755); } catch {}
        }
        if (ctx.platform === "win32" || process.platform === "win32") {
          const cmdTarget = nodePath.join(dir, `${name}.cmd`);
          writeFileSync(cmdTarget, windowsCmdWrapper(execPath, item.scriptPath));
        }
      }
    }
    provisionedDirs.add(dir);
  } catch {
    // A read-only test directory should not crash the server or terminal.
  }
  return dir;
}

/** Returns all built-in RAD Studio CLI utilities with their paths for `ctx`. */
export function listCliUtils(ctx: Pick<FmContext, "dataDir" | "platform">, options: { force?: boolean } = {}): {
  folder: string;
  sourceFolder: string;
  binFolder: string;
  count: number;
  tools: CliUtilEntry[];
} {
  const folder = ensureCliUtilsFolder(ctx, options);
  const loc = findCliSourceRoot();
  const p = pathApi(ctx);
  const prefix = ctx.platform === "win32" ? ".\\" : "./";
  const ext = ctx.platform === "win32" ? ".cmd" : "";
  const tools: CliUtilEntry[] = discoverCatalog().map((item) => ({
    ...item,
    wrapperPath: p.join(folder, `${item.id}${ext}`),
    stemWrapperPath: p.join(folder, `${item.stem}${ext}`),
    command: `${prefix}${item.id}`,
    stemCommand: `${prefix}${item.stem}`,
  }));
  return {
    folder,
    sourceFolder: loc?.cliDir ?? "",
    binFolder: loc?.binDir ?? "",
    count: tools.length,
    tools,
  };
}

/**
 * Builds the environment for a built-in Terminal session, ensuring the built-in CLI utilities folder (and repo `bin/`
 * folder when present) are appended to `PATH` so tools can be run either as `./<name>` inside `cli_utils` or as
 * `<name>` / `<stem>` / `codecaine-<name>` from any folder without shadowing system commands.
 */
export function terminalEnv(
  ctx: Pick<FmContext, "dataDir" | "platform">,
  baseEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const dir = ensureCliUtilsFolder(ctx);
  const loc = findCliSourceRoot();
  const sep = ctx.platform === "win32" ? ";" : ":";
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (typeof v === "string") env[k] = v;
  }
  const pathKey = ctx.platform === "win32" && "Path" in env && !("PATH" in env) ? "Path" : "PATH";
  const current = (env[pathKey] ?? env.PATH ?? env.Path ?? "").split(sep).filter(Boolean);
  const extras = [dir, ...(loc?.binDir ? [loc.binDir] : [])];
  for (const extra of extras) {
    if (extra && !current.includes(extra)) current.push(extra);
  }
  const joined = current.join(sep);
  env[pathKey] = joined;
  if (ctx.platform === "win32") {
    env.Path = joined;
    env.PATH = joined;
  }
  env.RAD_CLI_UTILS_DIR = dir;
  if (loc?.cliDir) env.RAD_CLI_APPS_DIR = loc.cliDir;
  if (ctx.platform !== "win32") {
    env.TERM = "xterm-256color";
    env.COLORTERM = "truecolor";
  }
  return env;
}

export const cliUtilsOperations: Record<string, FmHandler> = {
  async "cliutils/list"(ctx) {
    return listCliUtils(ctx);
  },
  async "cliutils/ensure"(ctx, b) {
    return listCliUtils(ctx, { force: b.force === true });
  },
};
