/**
 * Pure, dependency-free helpers behind DevTools Studio (ripgrep / fd / sd / rip engines).
 * Kept free of any GUI code so they can be unit-tested directly.
 */
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, renameSync, mkdirSync, cpSync, rmSync } from "fs";
import { join, relative, basename, resolve } from "path";
import { homedir } from "os";

/** Directories that are never descended into. */
export const ALWAYS_SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".temp", ".temp_screens"]);

export const clampInt = (v: any, min: number, max: number, fallback: number): number => {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Glob support
// ---------------------------------------------------------------------------

/** Convert a glob (`*`, `**`, `?`, `{a,b}`) into an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end > i) {
        re += "(?:" + glob.slice(i + 1, end).split(",").map(escapeRe).join("|") + ")";
        i = end;
      } else re += "\\{";
    } else re += escapeRe(c);
  }
  return new RegExp("^" + re + "$");
}

/** Split a user glob list on whitespace, `;` or `|` (and commas outside braces). */
export function parseGlobList(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of String(text || "")) {
    if (ch === "{") depth++;
    if (ch === "}") depth = Math.max(0, depth - 1);
    if ((/\s/.test(ch) || ch === ";" || ch === "|" || (ch === "," && depth === 0))) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

interface GlobRule { re: RegExp; slash: boolean; negate: boolean }

export function compileGlobs(globs: string[]): GlobRule[] {
  return globs.map((g) => {
    const negate = g.startsWith("!");
    const body = negate ? g.slice(1) : g;
    const slash = body.includes("/");
    return { re: globToRegExp(slash ? body.replace(/^\.\//, "") : body), slash, negate };
  });
}

/** True when `rel` passes the include / `!exclude` rules. No rules = everything passes. */
export function passesGlobs(rel: string, rules: GlobRule[]): boolean {
  if (rules.length === 0) return true;
  const name = rel.split("/").pop() || rel;
  const hit = (r: GlobRule) => r.re.test(r.slash ? rel : name);
  if (rules.some((r) => r.negate && hit(r))) return false;
  const positives = rules.filter((r) => !r.negate);
  return positives.length === 0 || positives.some(hit);
}

// ---------------------------------------------------------------------------
// .gitignore support (simple subset: comments, dir-only, anchored, globs; no negation)
// ---------------------------------------------------------------------------

export type IgnoreMatcher = (rel: string, isDir: boolean) => boolean;

export function parseGitignore(text: string): IgnoreMatcher {
  const rules: { re: RegExp; anchored: boolean; dirOnly: boolean }[] = [];
  for (let line of String(text || "").split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    if (!line) continue;
    rules.push({ re: globToRegExp(line), anchored, dirOnly });
  }
  return (rel, isDir) => {
    const segs = rel.split("/");
    for (let i = 1; i <= segs.length; i++) {
      const isDirPrefix = i < segs.length || isDir;
      for (const r of rules) {
        if (r.dirOnly && !isDirPrefix) continue;
        const subject = r.anchored ? segs.slice(0, i).join("/") : segs[i - 1]!;
        if (r.re.test(subject)) return true;
      }
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// Pattern building & file walking
// ---------------------------------------------------------------------------

export interface MatchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  fixed?: boolean;
}

/** Build a (non-global, so `.test` is stateless) RegExp. Throws on an invalid regex. */
export function buildMatcher(pattern: string, opts: MatchOptions = {}, global = false): RegExp {
  let src = opts.fixed ? escapeRe(pattern) : pattern;
  if (opts.wholeWord) src = `\\b(?:${src})\\b`;
  return new RegExp(src, (opts.caseSensitive ? "" : "i") + (global ? "g" : ""));
}

export interface WalkOptions {
  include?: string;      // glob list, `!` prefix excludes
  hidden?: boolean;      // include dotfiles / dot-directories
  gitignore?: boolean;   // honour the root .gitignore
  includeDirs?: boolean; // yield directories as well as files
}

export interface WalkEntry { full: string; rel: string; isDir: boolean }

/** Walk `root` (file or directory) honouring skip dirs, hidden, globs and .gitignore. */
export function walkEntries(root: string, opts: WalkOptions = {}): WalkEntry[] {
  const out: WalkEntry[] = [];
  let st;
  try { st = statSync(root); } catch { return out; }
  if (st.isFile()) {
    out.push({ full: root, rel: basename(root), isDir: false });
    return out;
  }
  const rules = compileGlobs(parseGlobList(opts.include || ""));
  let ignored: IgnoreMatcher | null = null;
  if (opts.gitignore) {
    try { ignored = parseGitignore(readFileSync(join(root, ".gitignore"), "utf-8")); } catch { /* none */ }
  }
  const walk = (dir: string) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const name = e.name;
      if (!opts.hidden && name.startsWith(".")) continue;
      const full = join(dir, name);
      const rel = relative(root, full).split("\\").join("/");
      if (e.isDirectory()) {
        if (ALWAYS_SKIP_DIRS.has(name)) continue;
        if (ignored && ignored(rel, true)) continue;
        if (opts.includeDirs && passesGlobs(rel, rules)) out.push({ full, rel, isDir: true });
        walk(full);
      } else if (e.isFile()) {
        if (ignored && ignored(rel, false)) continue;
        if (!passesGlobs(rel, rules)) continue;
        out.push({ full, rel, isDir: false });
      }
    }
  };
  walk(root);
  return out;
}

/** Heuristic binary check: a NUL byte in the first 8KB. */
export function looksBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Ripgrep-style search
// ---------------------------------------------------------------------------

export interface SearchOptions extends MatchOptions, WalkOptions {
  maxResults?: number;
  context?: number;     // lines of context before/after
  filesOnly?: boolean;  // list matching files with counts only
}

export interface SearchResult {
  output: string;
  matches: number;
  filesScanned: number;
  filesMatched: number;
  truncated: boolean;
}

export function searchCode(targetDir: string, pattern: string, options: SearchOptions = {}): SearchResult {
  let regex: RegExp;
  try {
    regex = buildMatcher(pattern, options);
  } catch (e: any) {
    return { output: `[Invalid Regex]: ${e.message}`, matches: 0, filesScanned: 0, filesMatched: 0, truncated: false };
  }
  const max = clampInt(options.maxResults ?? 200, 1, 100000, 200);
  const ctx = clampInt(options.context ?? 0, 0, 20, 0);
  const results: string[] = [];
  const perFile: [string, number][] = [];
  let matchCount = 0;
  let scanned = 0;
  let truncated = false;

  for (const f of walkEntries(targetDir, { ...options, includeDirs: false })) {
    if (matchCount >= max) { truncated = true; break; }
    scanned++;
    try {
      if (statSync(f.full).size > 1.5 * 1024 * 1024) continue;
      const buf = readFileSync(f.full);
      if (looksBinary(buf)) continue;
      const lines = buf.toString("utf-8").split("\n");
      let fileHits = 0;
      let lastPrinted = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!regex.test(line)) continue;
        fileHits++;
        matchCount++;
        if (!options.filesOnly) {
          if (ctx > 0) {
            const from = Math.max(lastPrinted + 1, i - ctx);
            if (lastPrinted >= 0 && from > lastPrinted + 1) results.push("--");
            for (let c = from; c < i; c++) results.push(`${f.rel}-${c + 1}- ${lines[c]!.trim()}`);
          }
          results.push(`${f.rel}:${i + 1}: ${line.trim()}`);
          if (ctx > 0) {
            const to = Math.min(lines.length - 1, i + ctx);
            for (let c = i + 1; c <= to; c++) {
              if (regex.test(lines[c]!)) break;
              results.push(`${f.rel}-${c + 1}- ${lines[c]!.trim()}`);
              lastPrinted = c;
            }
            lastPrinted = Math.max(lastPrinted, i);
          }
        }
        if (matchCount >= max) { truncated = true; break; }
      }
      if (fileHits > 0) perFile.push([f.rel, fileHits]);
    } catch { /* unreadable */ }
  }

  if (options.filesOnly) for (const [rel, n] of perFile) results.push(`${rel} (${n})`);
  if (truncated) results.push(`\n... (Results capped at ${max} matches)`);
  return {
    output: results.length > 0 ? results.join("\n") : "(No matches found)",
    matches: matchCount,
    filesScanned: scanned,
    filesMatched: perFile.length,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Fd-style finder
// ---------------------------------------------------------------------------

export interface FindOptions extends MatchOptions, WalkOptions {
  maxResults?: number;
  type?: "any" | "file" | "dir";
}

export function findPaths(targetDir: string, pattern: string, options: FindOptions = {}): { output: string; matches: number; truncated: boolean } {
  let regex: RegExp;
  try {
    regex = buildMatcher(pattern, options);
  } catch (e: any) {
    return { output: `[Invalid Regex]: ${e.message}`, matches: 0, truncated: false };
  }
  const max = clampInt(options.maxResults ?? 200, 1, 100000, 200);
  const type = options.type || "any";
  const results: string[] = [];
  let truncated = false;
  for (const e of walkEntries(targetDir, { ...options, includeDirs: true })) {
    if (type === "file" && e.isDir) continue;
    if (type === "dir" && !e.isDir) continue;
    if (!(regex.test(basename(e.full)) || regex.test(e.rel))) continue;
    if (results.length >= max) { truncated = true; break; }
    let meta = "";
    try { meta = e.isDir ? "" : ` (${(statSync(e.full).size / 1024).toFixed(1)} KB)`; } catch { /* gone */ }
    results.push(`${e.isDir ? "📁 [DIR] " : "📄 [FILE]"} ${e.rel}${meta}`);
  }
  if (truncated) results.push(`\n... (Results capped at ${max} items)`);
  return {
    output: results.length > 0 ? results.join("\n") : "(No matching files or directories found)",
    matches: truncated ? max : results.length,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Sd-style find & replace
// ---------------------------------------------------------------------------

export interface ReplaceOptions extends MatchOptions, WalkOptions {
  dryRun: boolean;
  backup?: boolean; // write `<file>.bak` before changing
}

export function replaceInFiles(
  targetPath: string,
  searchPattern: string,
  replaceWith: string,
  options: ReplaceOptions
): { output: string; filesChanged: number; replacements: number } {
  if (!existsSync(targetPath)) {
    return { output: `Target path does not exist: ${targetPath}`, filesChanged: 0, replacements: 0 };
  }
  let regex: RegExp;
  try {
    regex = buildMatcher(searchPattern, options, true);
  } catch (e: any) {
    return { output: `[Invalid Regex]: ${e.message}`, filesChanged: 0, replacements: 0 };
  }
  if (searchPattern === "") {
    return { output: "Search pattern is empty.", filesChanged: 0, replacements: 0 };
  }
  const summary: string[] = [];
  let filesChanged = 0;
  let total = 0;
  const replacer: any = options.fixed ? () => replaceWith : replaceWith;

  for (const f of walkEntries(targetPath, { ...options, includeDirs: false })) {
    try {
      if (statSync(f.full).size > 1024 * 1024) continue;
      const buf = readFileSync(f.full);
      if (looksBinary(buf)) continue;
      const text = buf.toString("utf-8");
      const count = (text.match(regex) || []).length;
      if (count === 0) continue;
      filesChanged++;
      total += count;
      summary.push(`${options.dryRun ? "🔍 [Dry Run]" : "✏️ [Replaced]"} ${relative(process.cwd(), f.full)}: ${count} occurrences`);
      const updated = text.replace(regex, replacer);
      if (options.dryRun) {
        const before = text.split("\n");
        const after = updated.split("\n");
        let shown = 0;
        for (let i = 0; i < before.length && shown < 3; i++) {
          if (before[i] !== after[i]) {
            summary.push(`     - ${(before[i] ?? "").trim().slice(0, 160)}`);
            summary.push(`     + ${(after[i] ?? "").trim().slice(0, 160)}`);
            shown++;
          }
        }
      } else {
        if (options.backup) writeFileSync(f.full + ".bak", text, "utf-8");
        writeFileSync(f.full, updated, "utf-8");
      }
    } catch { /* unreadable */ }
  }

  if (summary.length === 0) {
    summary.push(`No occurrences of "${searchPattern}" found in ${targetPath}`);
  } else {
    summary.unshift(
      `${options.dryRun ? "[DRY RUN PREVIEW]" : "[REPLACEMENT COMPLETED]"}: Changed ${total} occurrence(s) across ${filesChanged} file(s).\n`
    );
  }
  return { output: summary.join("\n"), filesChanged, replacements: total };
}

// ---------------------------------------------------------------------------
// Rip-style safe trash with undo
// ---------------------------------------------------------------------------

export interface TrashRecord { from: string; to: string }
let lastTrash: TrashRecord | null = null;
export const getLastTrash = () => lastTrash;
export const clearLastTrash = () => { lastTrash = null; };

function moveAny(from: string, to: string) {
  try {
    renameSync(from, to);
  } catch (e: any) {
    if (e?.code !== "EXDEV") throw e;
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

export function trashPath(targetPath: string, trashDir = join(homedir(), ".Trash")): { output: string; success: boolean } {
  if (!existsSync(targetPath)) {
    return { output: `Target path does not exist: ${targetPath}`, success: false };
  }
  const destName = `${basename(targetPath)}_deleted_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const destPath = join(trashDir, destName);
  try {
    if (!existsSync(trashDir)) mkdirSync(trashDir, { recursive: true });
    const protectedPaths = new Set([resolve("/"), resolve(homedir()), resolve(process.cwd()), resolve(process.cwd(), "..")]);
    if (protectedPaths.has(resolve(targetPath))) {
      return { output: `Refusing to trash protected path: ${targetPath}\nChoose a specific file or sub-folder.`, success: false };
    }
    moveAny(targetPath, destPath);
    lastTrash = { from: resolve(targetPath), to: destPath };
    return {
      output: `✔ Safely moved to macOS Trash:\n  Source: ${targetPath}\n  Trash:  ${destPath}\n\nUse "Undo Trash" to restore it, or restore it from the macOS Trash folder.`,
      success: true,
    };
  } catch (e: any) {
    return { output: `Failed to trash item: ${e.message}`, success: false };
  }
}

export function undoLastTrash(): { output: string; success: boolean } {
  if (!lastTrash) return { output: "Nothing to undo.", success: false };
  const { from, to } = lastTrash;
  if (!existsSync(to)) {
    lastTrash = null;
    return { output: `Trashed item is no longer in the Trash: ${to}`, success: false };
  }
  if (existsSync(from)) {
    return { output: `Cannot restore: ${from} already exists.`, success: false };
  }
  try {
    mkdirSync(join(from, ".."), { recursive: true });
    moveAny(to, from);
    lastTrash = null;
    return { output: `✔ Restored ${from}`, success: true };
  } catch (e: any) {
    return { output: `Restore failed: ${e.message}`, success: false };
  }
}
