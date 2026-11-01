/**
 * Headless Command-Line Interface for Codecaine File Manager (`applications/file_manager_studio.ts`).
 *
 * Allows `codecaine-file-manager` (or `bun run app:files`) to be used directly from a terminal for directory
 * listings, file inspection, recursive search, cryptographic hashing, safe Recycle Bin operations, external tool
 * health checks, and discovering or running the 76 built-in RAD CLI utilities.
 */
import { createHash } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, createContext, pathApi, type FmContext, type FmContextOptions } from "./fmCore";
import { listCliUtils, runCliUtil } from "./fmCliUtils";
import { fileInfo } from "./fmInfoFile";
import { listFolder, propertiesOf, searchFolder, type SortBy } from "./fmList";
import { APP_NAME, APP_VERSION } from "./fmServer";
import { toolStatus } from "./fmToolDetect";
import { listTrash, moveToTrash, restoreFromTrash } from "./fmTrash";

async function computeFileDigests(ctx: FmContext, targetPath: string) {
  const safePath = absolutePath(ctx, targetPath);
  const buf = await fsp.readFile(safePath);
  return {
    path: safePath,
    size: buf.byteLength,
    md5: createHash("md5").update(buf).digest("hex"),
    sha1: createHash("sha1").update(buf).digest("hex"),
    sha256: createHash("sha256").update(buf).digest("hex"),
    sha512: createHash("sha512").update(buf).digest("hex"),
  };
}

export interface FmCliIo {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  cwd?: string;
  contextOptions?: FmContextOptions;
}

const CLI_SUBCOMMANDS = new Set([
  "help",
  "version",
  "ls",
  "list",
  "info",
  "stat",
  "find",
  "search",
  "hash",
  "checksum",
  "trash",
  "trash-list",
  "restore",
  "tools",
  "doctor",
  "cli-utils",
  "cli",
]);

/**
 * Returns true when `args` (typically `process.argv.slice(2)`) requests a direct CLI subcommand or `--help` / `--version`
 * rather than launching the desktop window or HTTP server.
 */
export function isFileManagerCliInvocation(args: string[]): boolean {
  if (!args || args.length === 0) return false;
  const first = args[0]!.trim();
  if (first === "--help" || first === "-h" || first === "--version" || first === "-v") {
    return true;
  }
  if (!first.startsWith("-") && CLI_SUBCOMMANDS.has(first.toLowerCase())) {
    return true;
  }
  return false;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIdx]}`;
}

function resolveUserPath(ctx: FmContext, raw: string, cwd: string): string {
  const p = pathApi(ctx);
  const trimmed = raw.trim();
  if (!trimmed || trimmed === ".") return p.resolve(cwd);
  if (trimmed === "~") return ctx.home;
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return p.join(ctx.home, trimmed.slice(2));
  }
  return p.isAbsolute(trimmed) ? p.resolve(trimmed) : p.resolve(cwd, trimmed);
}

function printHelp(out: (line: string) => void): void {
  out(`${APP_NAME} v${APP_VERSION} — Desktop Studio & Command-Line File Manager`);
  out("");
  out("Usage:");
  out("  codecaine-file-manager [window/server options]");
  out("  codecaine-file-manager <subcommand> [options] [arguments]");
  out("");
  out("Subcommands:");
  out("  ls, list [path]                  List directory contents (--hidden, --sort, --reverse, --json)");
  out("  info, stat <path...>             Inspect file/folder properties & deep metadata (--json)");
  out("  find, search <pattern> [path]    Recursively search for files/folders (--hidden, --limit, --json)");
  out("  hash, checksum <path...>         Compute MD5, SHA-1, SHA-256 & SHA-512 digests (--algo, --json)");
  out("  trash <path...>                  Move files or folders safely to the File Manager Recycle Bin");
  out("  trash-list                       List items currently in the Recycle Bin (--json)");
  out("  restore <id...>                  Restore items from the Recycle Bin by trash ID");
  out("  tools, doctor                    Check status of optional external helper tools (--json)");
  out("  cli-utils, cli [list|run]        List or execute the 76 built-in RAD CLI utilities (--category, --search, --json)");
  out("  help, --help, -h                 Show this help message");
  out("  version, --version, -v           Show version information");
  out("");
  out("Window & Server Options:");
  out("  --server, -s                     Run headless HTTP server and print its URL");
  out("  --port <n>                       Port to listen on (0 for automatic)");
  out("  --path <dir>                     Open directly to the specified folder");
  out("  --tool <id>                      Open a studio tool tab (e.g. cliutils, tasks, sysinfo, ollama)");
  out("  --browser, -b                    Open in system browser instead of native WebView");
  out("  --home <dir>                     Override user home directory");
  out("  --data-dir <dir>                 Override File Manager data & trash directory");
}

function extractGlobalContextFlags(
  rawArgs: string[],
  baseOptions: FmContextOptions = {},
): { rest: string[]; ctxOptions: FmContextOptions } {
  const rest: string[] = [];
  const ctxOptions: FmContextOptions = { ...baseOptions };
  const sep = process.platform === "win32" ? ";" : ":";

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i]!;
    if (a === "--home" && rawArgs[i + 1]) {
      ctxOptions.home = rawArgs[++i]!;
    } else if (a === "--data-dir" && rawArgs[i + 1]) {
      ctxOptions.dataDir = rawArgs[++i]!;
    } else if (a === "--tool-dirs" && rawArgs[i + 1]) {
      ctxOptions.toolDirs = rawArgs[++i]!.split(sep).filter(Boolean);
    } else {
      rest.push(a);
    }
  }
  return { rest, ctxOptions };
}

/**
 * Executes a headless File Manager CLI subcommand and returns an exit code (`0` on success, non-zero on error).
 */
export async function runFileManagerCli(rawArgs: string[], io: FmCliIo = {}): Promise<number> {
  const out = io.stdout ?? ((line: string) => console.log(line));
  const err = io.stderr ?? ((line: string) => console.error(line));
  const cwd = io.cwd ?? process.cwd();

  const { rest: args, ctxOptions } = extractGlobalContextFlags(rawArgs, io.contextOptions);
  const first = (args[0] ?? "").trim();

  if (!first || first === "--help" || first === "-h" || first.toLowerCase() === "help") {
    printHelp(out);
    return 0;
  }

  if (first === "--version" || first === "-v" || first.toLowerCase() === "version") {
    if (args.includes("--json") || args.includes("-j")) {
      out(JSON.stringify({ name: APP_NAME, version: APP_VERSION }, null, 2));
    } else {
      out(`${APP_NAME} v${APP_VERSION}`);
    }
    return 0;
  }

  const sub = first.toLowerCase();
  const subArgs = args.slice(1);
  const ctx = createContext(ctxOptions);

  try {
    switch (sub) {
      case "ls":
      case "list": {
        let showHidden = false;
        let sortBy: SortBy = "name";
        let sortDir: "asc" | "desc" = "asc";
        let json = false;
        const targets: string[] = [];

        for (let i = 0; i < subArgs.length; i++) {
          const a = subArgs[i]!;
          if (a === "--hidden" || a === "-a") showHidden = true;
          else if (a === "--reverse" || a === "-r") sortDir = "desc";
          else if (a === "--json" || a === "-j") json = true;
          else if ((a === "--sort" || a === "-s") && subArgs[i + 1]) {
            const v = subArgs[++i]!.toLowerCase();
            if (v === "name" || v === "size" || v === "modified" || v === "type") sortBy = v;
          } else if (!a.startsWith("-")) {
            targets.push(a);
          }
        }

        const targetPath = resolveUserPath(ctx, targets[0] ?? ".", cwd);
        const listing = await listFolder(ctx, targetPath, { showHidden, sortBy, sortDir });
        if (json) {
          out(JSON.stringify(listing, null, 2));
          return 0;
        }
        out(`Folder: ${listing.path} (${listing.total} items)`);
        for (const item of listing.entries) {
          const typeBadge = item.isDir ? "DIR " : item.isSymlink ? "LINK" : "FILE";
          const sizeStr = item.isDir ? "       -" : formatBytes(item.size).padStart(8);
          out(`  ${typeBadge}  ${sizeStr}  ${item.name}`);
        }
        return 0;
      }

      case "info":
      case "stat": {
        let json = false;
        const targets: string[] = [];
        for (const a of subArgs) {
          if (a === "--json" || a === "-j") json = true;
          else if (!a.startsWith("-")) targets.push(a);
        }
        if (targets.length === 0) {
          err("Usage: codecaine-file-manager info <path...> [--json]");
          return 1;
        }
        const resolved = targets.map((t) => resolveUserPath(ctx, t, cwd));
        const props = await propertiesOf(ctx, resolved);
        let deepInfo: unknown = null;
        if (resolved.length === 1 && !props.isDir) {
          deepInfo = await fileInfo(ctx, resolved[0]!).catch(() => null);
        }
        if (json) {
          out(JSON.stringify(deepInfo ? { ...props, inspect: deepInfo } : props, null, 2));
          return 0;
        }
        out(`Name:        ${props.name}`);
        if (props.path) out(`Path:        ${props.path}`);
        out(`Kind:        ${props.kind}`);
        out(`Size:        ${formatBytes(props.size)} (${props.size} bytes)`);
        if (props.isDir || props.count > 1) {
          out(`Contents:    ${props.files} files, ${props.folders} folders`);
        }
        if (props.permissions) out(`Permissions: ${props.permissions}`);
        if (props.modifiedMs) out(`Modified:    ${new Date(props.modifiedMs).toISOString()}`);
        if (deepInfo && typeof deepInfo === "object" && "mime" in deepInfo) {
          const d = deepInfo as { mime?: string; encoding?: string };
          if (d.mime) out(`MIME Type:   ${d.mime}`);
          if (d.encoding) out(`Encoding:    ${d.encoding}`);
        }
        return 0;
      }

      case "find":
      case "search": {
        let showHidden = false;
        let json = false;
        let maxResults = 200;
        let kind: string | undefined;
        const positionals: string[] = [];

        for (let i = 0; i < subArgs.length; i++) {
          const a = subArgs[i]!;
          if (a === "--hidden" || a === "-a") showHidden = true;
          else if (a === "--json" || a === "-j") json = true;
          else if ((a === "--limit" || a === "-n") && subArgs[i + 1]) {
            maxResults = Math.max(1, Number(subArgs[++i]) || 200);
          } else if (a === "--kind" && subArgs[i + 1]) {
            kind = subArgs[++i]!;
          } else if (!a.startsWith("-")) {
            positionals.push(a);
          }
        }

        const query = positionals[0] ?? "";
        if (!query) {
          err("Usage: codecaine-file-manager find <pattern> [path] [--hidden] [--limit <n>] [--json]");
          return 1;
        }
        const rootPath = resolveUserPath(ctx, positionals[1] ?? ".", cwd);
        const res = await searchFolder(ctx, rootPath, query, { showHidden, maxResults, kind });
        if (json) {
          out(JSON.stringify(res, null, 2));
          return 0;
        }
        out(`Found ${res.entries.length} match(es) in ${rootPath} (scanned ${res.scanned}):`);
        for (const item of res.entries) {
          const tag = item.isDir ? "[DIR] " : "      ";
          out(`  ${tag}${item.path}`);
        }
        return 0;
      }

      case "hash":
      case "checksum": {
        let json = false;
        let algo = "sha256";
        const targets: string[] = [];
        for (let i = 0; i < subArgs.length; i++) {
          const a = subArgs[i]!;
          if (a === "--json" || a === "-j") json = true;
          else if ((a === "--algo" || a === "-a") && subArgs[i + 1]) {
            algo = subArgs[++i]!.toLowerCase();
          } else if (!a.startsWith("-")) {
            targets.push(a);
          }
        }
        if (targets.length === 0) {
          err("Usage: codecaine-file-manager hash <path...> [--algo sha256|sha512|sha1|md5] [--json]");
          return 1;
        }
        const results = [];
        for (const t of targets) {
          const full = resolveUserPath(ctx, t, cwd);
          const h = await computeFileDigests(ctx, full);
          results.push(h);
        }
        if (json) {
          out(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
          return 0;
        }
        for (const r of results) {
          const digest =
            algo === "md5"
              ? r.md5
              : algo === "sha1"
                ? r.sha1
                : algo === "sha512"
                  ? r.sha512
                  : r.sha256;
          out(`${digest}  ${r.path}`);
        }
        return 0;
      }

      case "trash": {
        let json = false;
        const targets: string[] = [];
        for (const a of subArgs) {
          if (a === "--json" || a === "-j") json = true;
          else if (!a.startsWith("-")) targets.push(a);
        }
        if (targets.length === 0) {
          err("Usage: codecaine-file-manager trash <path...> [--json]");
          return 1;
        }
        const resolved = targets.map((t) => resolveUserPath(ctx, t, cwd));
        const res = await moveToTrash(ctx, resolved);
        if (json) {
          out(JSON.stringify(res, null, 2));
          return res.every((r) => r.ok) ? 0 : 1;
        }
        let failed = 0;
        for (const r of res) {
          if (r.ok) {
            out(`Trashed: ${r.value.originalPath} (id: ${r.value.id})`);
          } else {
            failed++;
            err(`Failed: ${r.message}`);
          }
        }
        return failed === 0 ? 0 : 1;
      }

      case "trash-list": {
        const json = subArgs.includes("--json") || subArgs.includes("-j");
        const { items, count } = await listTrash(ctx);
        if (json) {
          out(JSON.stringify({ count, items }, null, 2));
          return 0;
        }
        if (items.length === 0) {
          out("Recycle Bin is empty.");
          return 0;
        }
        out(`Recycle Bin (${items.length} item${items.length === 1 ? "" : "s"}):`);
        for (const item of items) {
          out(`  ${item.id}  ${item.name}  (from ${item.originalPath})`);
        }
        return 0;
      }

      case "restore": {
        let json = false;
        const ids: string[] = [];
        for (const a of subArgs) {
          if (a === "--json" || a === "-j") json = true;
          else if (!a.startsWith("-")) ids.push(a);
        }
        if (ids.length === 0) {
          err("Usage: codecaine-file-manager restore <trash-id...> [--json]");
          return 1;
        }
        const res = await restoreFromTrash(ctx, ids);
        if (json) {
          out(JSON.stringify(res, null, 2));
          return res.every((r) => r.ok) ? 0 : 1;
        }
        let failed = 0;
        for (const r of res) {
          if (r.ok) {
            out(`Restored: ${r.value.restoredTo}`);
          } else {
            failed++;
            err(`Failed: ${r.message}`);
          }
        }
        return failed === 0 ? 0 : 1;
      }

      case "tools":
      case "doctor": {
        const json = subArgs.includes("--json") || subArgs.includes("-j");
        const status = await toolStatus(ctx);
        if (json) {
          out(JSON.stringify(status, null, 2));
          return 0;
        }
        const installedCount = status.tools.filter((t) => t.installed).length;
        out(`${APP_NAME} External Helper Tools (${installedCount}/${status.tools.length} available):`);
        for (const t of status.tools) {
          const badge = t.installed ? "✓" : "✗";
          const ver = t.version ? ` (${t.version})` : "";
          out(`  [${badge}] ${t.name.padEnd(22)} ${t.purpose}${ver}`);
        }
        return 0;
      }

      case "cli-utils":
      case "cli": {
        const action = (subArgs[0] ?? "list").toLowerCase();
        if (action === "run") {
          const toolName = subArgs[1] ?? "";
          if (!toolName) {
            err("Usage: codecaine-file-manager cli-utils run <tool> [args...]");
            return 1;
          }
          const forwardArgs = subArgs.slice(2);
          const result = await runCliUtil(ctx, {
            tool: toolName,
            args: forwardArgs,
            cwd: nodePath.resolve(cwd),
          });
          if (result.stdout) out(result.stdout.replace(/\n$/, ""));
          if (result.stderr) err(result.stderr.replace(/\n$/, ""));
          return result.exitCode;
        }

        let json = false;
        let categoryFilter = "";
        let searchFilter = "";
        for (let i = 0; i < subArgs.length; i++) {
          const a = subArgs[i]!;
          if (a === "list") continue;
          if (a === "--json" || a === "-j") json = true;
          else if ((a === "--category" || a === "-c") && subArgs[i + 1]) {
            categoryFilter = subArgs[++i]!.toLowerCase();
          } else if ((a === "--search" || a === "-q") && subArgs[i + 1]) {
            searchFilter = subArgs[++i]!.toLowerCase();
          } else if (!a.startsWith("-") && !searchFilter) {
            searchFilter = a.toLowerCase();
          }
        }

        const catalog = listCliUtils(ctx);
        const filtered = catalog.tools.filter((t) => {
          if (categoryFilter && !t.category.toLowerCase().includes(categoryFilter)) return false;
          if (
            searchFilter &&
            !t.id.toLowerCase().includes(searchFilter) &&
            !t.stem.toLowerCase().includes(searchFilter) &&
            !t.description.toLowerCase().includes(searchFilter) &&
            !t.category.toLowerCase().includes(searchFilter)
          ) {
            return false;
          }
          return true;
        });

        if (json) {
          out(
            JSON.stringify(
              {
                folder: catalog.folder,
                sourceFolder: catalog.sourceFolder,
                binFolder: catalog.binFolder,
                count: filtered.length,
                tools: filtered,
              },
              null,
              2,
            ),
          );
          return 0;
        }

        out(`Built-in RAD CLI Utilities (${filtered.length}/${catalog.count}) — folder: ${catalog.folder}`);
        for (const t of filtered) {
          out(`  ${t.icon} ${t.command.padEnd(22)} [${t.category}] ${t.description}`);
        }
        return 0;
      }

      default:
        err(`Unknown subcommand "${first}". Run with --help for usage.`);
        return 1;
    }
  } catch (e: any) {
    err(e?.message ? `Error: ${e.message}` : String(e));
    return 1;
  } finally {
    for (const d of ctx.disposers) {
      try {
        d();
      } catch {}
    }
  }
}
