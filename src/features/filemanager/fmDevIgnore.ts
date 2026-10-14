/**
 * .gitignore-style matching for the Dev tab's scans: patterns with `*`, `**`, `?`, `[...]`, a leading `/` (anchored),
 * a trailing `/` (folders only) and `!` (negation), read from .gitignore files (and the user's exclude globs).
 * The last matching rule wins, like git.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";

export interface IgnoreRule {
  re: RegExp;
  negate: boolean;
  dirOnly: boolean;
}

export interface IgnoreSet {
  /** The folder the patterns are relative to (absolute, with "/" separators). */
  base: string;
  rules: IgnoreRule[];
}

const MAX_PATTERNS = 5000;
const MAX_PATTERN_LENGTH = 500;

function globToRegex(pattern: string, anchored: boolean): RegExp | null {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        const before = i === 0 || pattern[i - 1] === "/";
        const after = pattern[i + 2] === "/" || i + 2 >= pattern.length;
        if (before && after) {
          if (pattern[i + 2] === "/") {
            out += "(?:.*/)?";
            i += 3;
          } else {
            out += ".*";
            i += 2;
          }
          continue;
        }
        out += "[^/]*";
        i += 2;
        continue;
      }
      out += "[^/]*";
      i++;
    } else if (c === "?") {
      out += "[^/]";
      i++;
    } else if (c === "[") {
      const end = pattern.indexOf("]", i + 2);
      if (end < 0) {
        out += "\\[";
        i++;
      } else {
        let body = pattern.slice(i + 1, end);
        if (body.startsWith("!")) body = `^${body.slice(1)}`;
        out += `[${body.replace(/\\/g, "\\\\").replace(/]/g, "\\]")}]`;
        i = end + 1;
      }
    } else if (c === "\\" && i + 1 < pattern.length) {
      out += pattern[i + 1]!.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      i += 2;
    } else {
      out += c.replace(/[.+^${}()|\\]/g, "\\$&");
      i++;
    }
  }
  try {
    return new RegExp(anchored ? `^${out}$` : `^(?:.*/)?${out}$`);
  } catch {
    return null;
  }
}

/** Turns the lines of an ignore file into rules. Unusable lines are skipped. */
export function parseIgnoreLines(lines: string[]): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const rawLine of lines) {
    if (rules.length >= MAX_PATTERNS) break;
    let line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith("#") || line.length > MAX_PATTERN_LENGTH) continue;
    line = line.replace(/(?<!\\)\s+$/, "");
    if (!line) continue;
    let negate = false;
    if (line.startsWith("!")) {
      negate = true;
      line = line.slice(1);
    } else if (line.startsWith("\\!") || line.startsWith("\\#")) line = line.slice(1);
    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    if (!line) continue;
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    const re = globToRegex(line, anchored);
    if (re) rules.push({ re, negate, dirOnly });
  }
  return rules;
}

export function ignoreSetFromText(base: string, text: string): IgnoreSet {
  return { base: base.replace(/\\/g, "/").replace(/\/$/, ""), rules: parseIgnoreLines(text.split("\n")) };
}

/** True when the sets (shallowest first) ignore `absPath`. The last rule that matches decides. */
export function isIgnored(sets: IgnoreSet[], absPath: string, isDir: boolean): boolean {
  const abs = absPath.replace(/\\/g, "/");
  let ignored = false;
  for (const set of sets) {
    if (!abs.startsWith(`${set.base}/`)) continue;
    const rel = abs.slice(set.base.length + 1);
    for (const rule of set.rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.re.test(rel)) ignored = !rule.negate;
    }
  }
  return ignored;
}

const MAX_IGNORE_FILE = 256 * 1024;
export const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".tokeignore"];

/** Reads the ignore files in `dir` (if any). Symlinks are not followed and big files are skipped. */
export async function readIgnoreFiles(dir: string, names: string[] = IGNORE_FILE_NAMES): Promise<IgnoreSet | null> {
  const rules: IgnoreRule[] = [];
  for (const name of names) {
    try {
      const file = nodePath.join(dir, name);
      const st = await fsp.lstat(file);
      if (!st.isFile() || st.size > MAX_IGNORE_FILE) continue;
      rules.push(...parseIgnoreLines((await fsp.readFile(file, "utf8")).split("\n")));
    } catch {
      // no such file
    }
  }
  return rules.length ? { base: dir.replace(/\\/g, "/").replace(/\/$/, ""), rules } : null;
}

const hasGit = (dir: string) => fsp.lstat(nodePath.join(dir, ".git")).then(() => true, () => false);

/**
 * The ignore sets that apply to a scan of `root` from folders above it: .git/info/exclude and the .gitignore files
 * between `root` and the enclosing git repository (so scanning a sub-folder still honours the repository's rules).
 * Shallowest first. Empty when `root` is not inside a repository.
 */
export async function inheritedIgnores(root: string, maxLevels = 12): Promise<IgnoreSet[]> {
  const above: string[] = [];
  let repoTop: string | null = (await hasGit(root)) ? root : null;
  let dir = nodePath.dirname(root);
  for (let level = 0; !repoTop && level < maxLevels && dir !== nodePath.dirname(dir); level++) {
    above.push(dir);
    if (await hasGit(dir)) repoTop = dir;
    dir = nodePath.dirname(dir);
  }
  if (!repoTop) return [];
  const sets: IgnoreSet[] = [];
  try {
    sets.push(ignoreSetFromText(repoTop, await fsp.readFile(nodePath.join(repoTop, ".git", "info", "exclude"), "utf8")));
  } catch {
    // no exclude file
  }
  for (const folder of above.reverse()) {
    const set = await readIgnoreFiles(folder, [".gitignore"]);
    if (set) sets.push(set);
  }
  return sets;
}
