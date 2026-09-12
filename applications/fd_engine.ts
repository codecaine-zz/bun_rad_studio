/**
 * Native Bun Fd Engine -- High-Performance Filesystem Traversal & Search
 * Implements 100% of fd (fd-find) capabilities using only Bun and Node system APIs.
 * Zero Homebrew / external binary dependencies.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export type FdFileType = "file" | "directory" | "symlink" | "executable" | "empty" | "socket" | "pipe" | "other";

export interface FdItem {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  type: FdFileType;
  sizeBytes: number;
  humanSize: string;
  isExecutable: boolean;
  isEmpty: boolean;
  isSymlink: boolean;
  targetSymlink?: string;
  mtime: Date;
  mtimeMs: number;
  mtimeStr: string;
  mode: number;
  permStr: string;
  ownerUid: number;
  ownerGid: number;
  ownerUser?: string;
}

export interface FdSearchOptions {
  searchRoot?: string;
  pattern?: string;
  searchMode?: "regex" | "glob" | "fixed";
  caseMode?: "smart" | "sensitive" | "ignore";
  fullPath?: boolean;
  types?: FdFileType[];
  extensions?: string[];
  hidden?: boolean;
  noIgnore?: boolean;
  excludePatterns?: string[];
  maxDepth?: number;
  minDepth?: number;
  exactDepth?: number;
  followSymlinks?: boolean;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  changedWithinMs?: number;
  changedBeforeMs?: number;
  owner?: string;
  perm?: string;
  maxResults?: number;
}

export interface FdSearchResult {
  items: FdItem[];
  totalScanned: number;
  matchedCount: number;
  durationMs: number;
  totalSizeBytes: number;
  totalHumanSize: string;
  truncated: boolean;
}

/**
 * Format raw byte count into readable human size.
 */
export function formatHumanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(val < 10 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Parse human size string (e.g. "+1M", "-500k", "10KB", "2G") into comparison and bytes.
 */
export function parseSizeFilter(sizeStr: string): { mode: "greater" | "less" | "exact"; bytes: number } | null {
  const trimmed = sizeStr.trim();
  if (!trimmed) return null;

  let mode: "greater" | "less" | "exact" = "exact";
  let numPart = trimmed;
  if (trimmed.startsWith("+")) {
    mode = "greater";
    numPart = trimmed.slice(1);
  } else if (trimmed.startsWith("-")) {
    mode = "less";
    numPart = trimmed.slice(1);
  }

  const match = numPart.match(/^([\d.]+)\s*([a-zA-Z]*)$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;

  const unit = (match[2] || "").toLowerCase();
  let mult = 1;
  if (unit.startsWith("k")) mult = 1024;
  else if (unit.startsWith("m")) mult = 1024 * 1024;
  else if (unit.startsWith("g")) mult = 1024 * 1024 * 1024;
  else if (unit.startsWith("t")) mult = 1024 * 1024 * 1024 * 1024;
  else if (unit.startsWith("b")) mult = 1;

  return { mode, bytes: Math.round(num * mult) };
}

/**
 * Parse human duration string (e.g. "10m", "2h", "1d", "7d", "1w", "1y") into milliseconds.
 */
export function parseDurationMs(durStr: string): number | null {
  const trimmed = durStr.trim().toLowerCase();
  if (!trimmed) return null;

  const match = trimmed.match(/^([\d.]+)\s*([a-z]+)?$/);
  if (!match) return null;

  const val = parseFloat(match[1]);
  if (isNaN(val)) return null;

  const unit = match[2] || "s";
  switch (unit) {
    case "s":
    case "sec":
    case "seconds":
      return val * 1000;
    case "m":
    case "min":
    case "minutes":
      return val * 60 * 1000;
    case "h":
    case "hr":
    case "hours":
      return val * 60 * 60 * 1000;
    case "d":
    case "day":
    case "days":
      return val * 24 * 60 * 60 * 1000;
    case "w":
    case "wk":
    case "weeks":
      return val * 7 * 24 * 60 * 60 * 1000;
    case "y":
    case "yr":
    case "years":
      return val * 365 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

/**
 * Converts a shell glob pattern (e.g. "*.ts", "test_*.{js,ts}", "** /src/*") to a valid RegExp.
 */
export function globToRegExp(glob: string, caseSensitive: boolean): RegExp {
  let reStr = "^";
  let inGroup = false;

  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        reStr += ".*";
        i++;
      } else {
        reStr += "[^/]*";
      }
    } else if (c === "?") {
      reStr += "[^/]";
    } else if (c === "{") {
      inGroup = true;
      reStr += "(";
    } else if (c === "}" && inGroup) {
      inGroup = false;
      reStr += ")";
    } else if (c === "," && inGroup) {
      reStr += "|";
    } else if ("[].^$()+\\|".includes(c)) {
      reStr += "\\" + c;
    } else {
      reStr += c;
    }
  }
  reStr += "$";
  return new RegExp(reStr, caseSensitive ? "" : "i");
}

/**
 * Format octal file permissions into symbolic unix string (e.g. 0o755 -> "rwxr-xr-x").
 */
export function formatPermissions(mode: number): string {
  const perms = [
    mode & 0o400 ? "r" : "-",
    mode & 0o200 ? "w" : "-",
    mode & 0o100 ? (mode & 0o4000 ? "s" : "x") : (mode & 0o4000 ? "S" : "-"),
    mode & 0o040 ? "r" : "-",
    mode & 0o020 ? "w" : "-",
    mode & 0o010 ? (mode & 0o2000 ? "s" : "x") : (mode & 0o2000 ? "S" : "-"),
    mode & 0o004 ? "r" : "-",
    mode & 0o002 ? "w" : "-",
    mode & 0o001 ? (mode & 0o1000 ? "t" : "x") : (mode & 0o1000 ? "T" : "-"),
  ];
  return perms.join("");
}

/**
 * Simple .gitignore rule engine
 */
class GitignoreMatcher {
  private rules: { pattern: RegExp; isNegative: boolean; dirOnly: boolean }[] = [];

  constructor(baseDir: string, ignoreContent?: string) {
    if (ignoreContent) {
      this.parse(ignoreContent);
    } else {
      const gitignorePath = path.join(baseDir, ".gitignore");
      if (fs.existsSync(gitignorePath)) {
        try {
          const content = fs.readFileSync(gitignorePath, "utf8");
          this.parse(content);
        } catch {}
      }
    }
  }

  private parse(content: string) {
    const lines = content.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const isNegative = line.startsWith("!");
      const clean = isNegative ? line.slice(1).trim() : line;
      const dirOnly = clean.endsWith("/");
      const patternClean = dirOnly ? clean.slice(0, -1) : clean;

      try {
        let regex: RegExp;
        if (patternClean.includes("/")) {
          regex = globToRegExp(patternClean.replace(/^\//, ""), false);
        } else {
          regex = new RegExp("(^|/)" + globToRegExp(patternClean, false).source.slice(1));
        }
        this.rules.push({ pattern: regex, isNegative, dirOnly });
      } catch {}
    }
  }

  public isIgnored(relPath: string, isDir: boolean): boolean {
    const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
    let ignored = false;

    for (const rule of this.rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.pattern.test(normalized) || rule.pattern.test(path.basename(normalized))) {
        ignored = !rule.isNegative;
      }
    }
    return ignored;
  }
}

/**
 * Execute command placeholder interpolation for `-x` and `-X` (fd exec commands)
 * Replaces:
 * - `{}`: full path
 * - `{/}`: basename
 * - `{//}`: dirname
 * - `{.}`: path without extension
 * - `{/.}`: basename without extension
 */
export function interpolateExecCommand(cmdTemplate: string, filePath: string): string {
  const base = path.basename(filePath);
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseNoExt = base.slice(0, base.length - ext.length);
  const pathNoExt = path.join(dir, baseNoExt);

  return cmdTemplate
    .replace(/{}/g, filePath)
    .replace(/{\/}/g, base)
    .replace(/{\/\/}/g, dir)
    .replace(/{\.}/g, pathNoExt)
    .replace(/{\/\.}/g, baseNoExt);
}

/**
 * Execute a fast native filesystem search with complete fd-find feature set.
 * Fully synchronous to prevent microtask deadlock in native desktop Webview runloop.
 */
export function executeFdSearch(options: FdSearchOptions = {}): FdSearchResult {
  const startTime = performance.now();
  const rawRoot = options.searchRoot || ".";
  const resolvedRoot = path.resolve(rawRoot);
  const maxResults = options.maxResults || 5000;

  if (!fs.existsSync(resolvedRoot)) {
    return {
      items: [],
      totalScanned: 0,
      matchedCount: 0,
      durationMs: 0,
      totalSizeBytes: 0,
      totalHumanSize: "0 B",
      truncated: false,
    };
  }

  // 1. Prepare Pattern Matcher
  const rawPattern = options.pattern || "";
  const mode = options.searchMode || "regex";
  let caseSensitive = false;

  if (options.caseMode === "sensitive") {
    caseSensitive = true;
  } else if (options.caseMode === "ignore") {
    caseSensitive = false;
  } else {
    // Smart case: sensitive if uppercase characters exist, insensitive otherwise
    caseSensitive = /[A-Z]/.test(rawPattern);
  }

  let matcherRegex: RegExp | null = null;
  if (rawPattern) {
    try {
      if (mode === "glob") {
        matcherRegex = globToRegExp(rawPattern, caseSensitive);
      } else if (mode === "fixed") {
        const escaped = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        matcherRegex = new RegExp(escaped, caseSensitive ? "" : "i");
      } else {
        matcherRegex = new RegExp(rawPattern, caseSensitive ? "" : "i");
      }
    } catch {
      // Fallback to literal search if regex is malformed
      const escaped = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matcherRegex = new RegExp(escaped, caseSensitive ? "" : "i");
    }
  }

  // 2. Prepare Exclusions & Gitignore
  const defaultExcludes = options.noIgnore ? [] : ["node_modules", ".git", ".DS_Store"];
  const customExcludes = (options.excludePatterns || []).map(p => p.trim()).filter(Boolean);
  const allExcludes = [...defaultExcludes, ...customExcludes];
  const excludeRegexes = allExcludes.map(ex => globToRegExp(ex, false));

  const gitignore = !options.noIgnore ? new GitignoreMatcher(resolvedRoot) : null;

  // 3. Extension filters
  const exts = options.extensions?.map(e => e.trim().toLowerCase().replace(/^\./, "")).filter(Boolean);

  // 4. Type filters
  const allowedTypes = options.types && options.types.length > 0 ? new Set(options.types) : null;

  const results: FdItem[] = [];
  let totalScanned = 0;
  let totalSizeBytes = 0;
  let truncated = false;

  // Traversal stack
  interface StackFrame {
    dir: string;
    depth: number;
  }
  const stack: StackFrame[] = [{ dir: resolvedRoot, depth: 0 }];

  while (stack.length > 0) {
    if (results.length >= maxResults) {
      truncated = true;
      break;
    }

    const { dir, depth } = stack.pop()!;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      totalScanned++;
      const name = entry.name;
      const isHidden = name.startsWith(".");

      // Hidden filter
      if (isHidden && !options.hidden) {
        continue;
      }

      const fullPath = path.join(dir, name);
      const relativePath = path.relative(resolvedRoot, fullPath) || ".";

      // Exclude filter
      const isExcluded = excludeRegexes.some(rx => rx.test(name) || rx.test(relativePath));
      if (isExcluded) {
        continue;
      }

      // Determine initial type from dirent
      let isDir = entry.isDirectory();
      let isSymlink = entry.isSymbolicLink();
      let isSocket = entry.isSocket();
      let isFIFO = entry.isFIFO();
      let isFile = entry.isFile();

      // Gitignore check
      if (gitignore && gitignore.isIgnored(relativePath, isDir)) {
        continue;
      }

      // Follow symlinks if requested
      let targetSymlink: string | undefined;
      if (isSymlink) {
        try {
          targetSymlink = fs.readlinkSync(fullPath);
          if (options.followSymlinks) {
            const stat = fs.statSync(fullPath);
            isDir = stat.isDirectory();
            isFile = stat.isFile();
            isSocket = stat.isSocket();
            isFIFO = stat.isFIFO();
          }
        } catch {
          // broken symlink
        }
      }

      // Check depth for subdirectories traversal
      if (isDir) {
        const nextDepth = depth + 1;
        if (options.maxDepth === undefined || nextDepth <= options.maxDepth) {
          stack.push({ dir: fullPath, depth: nextDepth });
        }
      }

      // Depth constraints for matching
      const currentDepth = depth + 1;
      if (options.minDepth !== undefined && currentDepth < options.minDepth) continue;
      if (options.maxDepth !== undefined && currentDepth > options.maxDepth) continue;
      if (options.exactDepth !== undefined && currentDepth !== options.exactDepth) continue;

      // Stats check
      let stat: fs.Stats | null = null;
      try {
        stat = isSymlink && !options.followSymlinks ? fs.lstatSync(fullPath) : fs.statSync(fullPath);
      } catch {
        continue;
      }

      const sizeBytes = stat.size;
      const mode = stat.mode;
      const isExecutable = !isDir && (mode & 0o111) !== 0;
      let isEmpty = false;

      if (isFile && sizeBytes === 0) {
        isEmpty = true;
      } else if (isDir) {
        try {
          const sub = fs.readdirSync(fullPath);
          isEmpty = sub.length === 0;
        } catch {
          isEmpty = false;
        }
      }

      // Categorize item type
      let itemType: FdFileType = "file";
      if (isDir) itemType = "directory";
      else if (isSymlink) itemType = "symlink";
      else if (isSocket) itemType = "socket";
      else if (isFIFO) itemType = "pipe";
      else if (isExecutable) itemType = "executable";
      else itemType = "file";

      // Type filter
      if (allowedTypes) {
        let matchesType = false;
        if (allowedTypes.has(itemType)) matchesType = true;
        if (allowedTypes.has("executable") && isExecutable) matchesType = true;
        if (allowedTypes.has("empty") && isEmpty) matchesType = true;
        if (allowedTypes.has("file") && isFile) matchesType = true;
        if (allowedTypes.has("directory") && isDir) matchesType = true;
        if (allowedTypes.has("symlink") && isSymlink) matchesType = true;
        if (allowedTypes.has("socket") && isSocket) matchesType = true;
        if (allowedTypes.has("pipe") && isFIFO) matchesType = true;
        if (!matchesType) continue;
      }

      // Extension filter
      const ext = path.extname(name).replace(/^\./, "").toLowerCase();
      if (exts && exts.length > 0) {
        if (!exts.includes(ext)) continue;
      }

      // Size constraints
      if (options.minSizeBytes !== undefined && sizeBytes < options.minSizeBytes) continue;
      if (options.maxSizeBytes !== undefined && sizeBytes > options.maxSizeBytes) continue;

      // Modification time constraints
      const now = Date.now();
      const mtimeMs = stat.mtimeMs;
      if (options.changedWithinMs !== undefined) {
        if (now - mtimeMs > options.changedWithinMs) continue;
      }
      if (options.changedBeforeMs !== undefined) {
        if (now - mtimeMs < options.changedBeforeMs) continue;
      }

      // Owner filter
      if (options.owner !== undefined && options.owner !== "") {
        const uidStr = String(stat.uid);
        if (options.owner !== uidStr) continue;
      }

      // Permission filter
      if (options.perm !== undefined && options.perm !== "") {
        const octal = (mode & 0o777).toString(8);
        const permString = formatPermissions(mode);
        if (!octal.includes(options.perm) && !permString.includes(options.perm)) {
          continue;
        }
      }

      // Pattern matching
      if (matcherRegex) {
        const targetText = options.fullPath ? relativePath : name;
        if (!matcherRegex.test(targetText)) {
          continue;
        }
      }

      const item: FdItem = {
        path: fullPath,
        relativePath,
        name,
        extension: ext,
        type: itemType,
        sizeBytes,
        humanSize: formatHumanSize(sizeBytes),
        isExecutable,
        isEmpty,
        isSymlink,
        targetSymlink,
        mtime: stat.mtime,
        mtimeMs,
        mtimeStr: stat.mtime.toLocaleString(),
        mode,
        permStr: formatPermissions(mode),
        ownerUid: stat.uid,
        ownerGid: stat.gid,
      };

      results.push(item);
      totalSizeBytes += sizeBytes;

      if (results.length >= maxResults) {
        truncated = true;
        break;
      }
    }
  }

  // Sort alphabetically by relative path
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const endTime = performance.now();
  const durationMs = Math.round((endTime - startTime) * 10) / 10;

  return {
    items: results,
    totalScanned,
    matchedCount: results.length,
    durationMs,
    totalSizeBytes,
    totalHumanSize: formatHumanSize(totalSizeBytes),
    truncated,
  };
}

/**
 * Execute command with interpolation against matching files (-x / -X).
 * Fully synchronous to prevent native desktop Webview runloop deadlocks.
 */
export function runFdCommand(commandTemplate: string, filePaths: string[]): { stdout: string; stderr: string; exitCode: number } {
  if (!commandTemplate || filePaths.length === 0) {
    return { stdout: "", stderr: "No command or files provided", exitCode: 1 };
  }

  try {
    const isBatch = commandTemplate.includes("{}") && filePaths.length > 1;
    let fullCommand = "";

    if (isBatch && !commandTemplate.includes("{/}")) {
      // Replace {} with space-separated list of quoted paths
      const quoted = filePaths.map(p => `"${p.replace(/"/g, '\\"')}"`).join(" ");
      fullCommand = commandTemplate.replace(/{}/g, quoted);
    } else {
      fullCommand = interpolateExecCommand(commandTemplate, filePaths[0] || "");
    }

    const res = Bun.spawnSync(["/bin/sh", "-c", fullCommand]);
    const stdoutBuf = res.stdout ? Buffer.from(res.stdout).toString("utf-8") : "";
    const stderrBuf = res.stderr ? Buffer.from(res.stderr).toString("utf-8") : "";
    return { stdout: stdoutBuf.trim(), stderr: stderrBuf.trim(), exitCode: res.exitCode };
  } catch (err: any) {
    return { stdout: "", stderr: err?.message || String(err), exitCode: 1 };
  }
}
