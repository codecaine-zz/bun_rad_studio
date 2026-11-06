/**
 * Pure and I/O helper functions for the `sd` search-and-replace utility,
 * covering regex construction, file/directory target expansion, backups,
 * line diff calculation, and both async and sync file processing.
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { colors } from "../../shared/colors.ts";
import type { DiffHunk, FileTransformResult } from "./sdTypes.ts";

/**
 * Escapes all special regular expression metacharacters in a literal string.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Constructs a global `RegExp` for search-and-replace, optionally escaping literal
 * strings, enforcing whole-word boundaries (`\b`), and applying regex flags.
 */
export function buildReplacerRegex(
  find: string,
  stringMode: boolean,
  flags: string = "",
  ignoreCase?: boolean,
  wholeWord?: boolean,
): RegExp {
  let pattern = stringMode ? escapeRegExp(find) : find;
  if (wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }
  const safeFlags = flags || "";
  let activeFlags = safeFlags.includes("g") ? safeFlags : `${safeFlags}g`;
  if (ignoreCase && !activeFlags.includes("i")) {
    activeFlags += "i";
  }
  return new RegExp(pattern, activeFlags);
}

/**
 * Asynchronously copies `filePath` to a backup file with the given extension before in-place modification.
 */
export async function createBackup(
  filePath: string,
  backupExt: string,
): Promise<string> {
  const ext = backupExt.startsWith(".") ? backupExt : `.${backupExt}`;
  const backupPath = `${filePath}${ext}`;
  const content = await Bun.file(filePath).text();
  await Bun.write(backupPath, content);
  return backupPath;
}

/**
 * Returns the total number of regex matches found in `content`.
 */
export function countMatches(content: string, regex: RegExp): number {
  return (content.match(regex) ?? []).length;
}

/**
 * Asynchronously expands a list of file and directory targets into individual file paths,
 * skipping ignored and hidden directories while preserving `"-"` for stdin.
 */
export async function expandTargets(
  targets: string[],
  ignores: string[] = ["node_modules", ".git", ".graveyard", "dist", "build"],
): Promise<string[]> {
  const filePaths: string[] = [];
  for (const target of targets) {
    if (target === "-") {
      filePaths.push("-");
      continue;
    }
    try {
      const s = await stat(target);
      if (s.isDirectory()) {
        const entries = await readdir(target, { withFileTypes: true });
        const subTargets = entries
          .filter((e) => !ignores.includes(e.name) && !e.name.startsWith("."))
          .map((e) => join(target, e.name));
        const expanded = await expandTargets(subTargets, ignores);
        filePaths.push(...expanded);
      } else if (s.isFile()) {
        filePaths.push(target);
      }
    } catch {
      // File not found or unreadable
    }
  }
  return filePaths;
}

/**
 * Replaces all occurrences of `regex` in `content` with `replacement` (supporting `$1`, `$2` capture groups).
 */
export function replaceText(
  content: string,
  regex: RegExp,
  replacement: string,
): string {
  // Support $1, $2, etc., capture groups in regex replacements
  return content.replaceAll(regex, replacement);
}

/**
 * Compares `original` and `modified` text line by line and returns an array of changed `DiffHunk` entries.
 */
export function computeDiffHunks(
  original: string,
  modified: string,
): DiffHunk[] {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const hunks: DiffHunk[] = [];

  const max = Math.max(origLines.length, modLines.length);
  for (let i = 0; i < max; i++) {
    const orig = origLines[i] ?? "";
    const mod = modLines[i] ?? "";
    if (orig !== mod) {
      hunks.push({ lineNumber: i + 1, original: orig, modified: mod });
    }
  }
  return hunks;
}

/**
 * Formats line-by-line diff hunks for a file as a colorized unified preview string.
 */
export function formatDiffPreview(
  filePathOrResult: string | { filePath: string; diffHunks: DiffHunk[] },
  hunks?: DiffHunk[],
): string {
  const filePath =
    typeof filePathOrResult === "string"
      ? filePathOrResult
      : filePathOrResult.filePath;
  const list =
    typeof filePathOrResult === "string"
      ? hunks || []
      : filePathOrResult.diffHunks || [];
  if (list.length === 0) return "";
  const header = colors.bold(colors.cyan(`--- ${filePath} ---`));
  const diffLines = list.map((h) => {
    const lineNum = colors.dim(`[L${h.lineNumber}]`);
    const del = colors.red(`- ${h.original}`);
    const add = colors.green(`+ ${h.modified}`);
    return `${lineNum}\n${del}\n${add}`;
  });
  return `${header}\n${diffLines.join("\n")}`;
}

/**
 * Asynchronously reads the UTF-8 text content of a file, throwing if the file does not exist.
 */
export async function readContent(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`[SdRead] File not found: ${filePath}`);
  }
  return await file.text();
}

/**
 * Asynchronously writes string content to `filePath` and returns the number of bytes written.
 */
export async function writeContent(
  filePath: string,
  content: string,
): Promise<number> {
  return await Bun.write(filePath, content);
}

/**
 * Synchronously reads and returns the UTF-8 text content of `filePath`.
 */
export function readContentSync(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

/**
 * Synchronously writes UTF-8 text `content` to `filePath`.
 */
export function writeContentSync(filePath: string, content: string): void {
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Synchronously creates a backup copy of `filePath` with the given extension and returns the backup path.
 */
export function createBackupSync(filePath: string, backupExt: string): string {
  const ext = backupExt.startsWith(".") ? backupExt : `.${backupExt}`;
  const backupPath = `${filePath}${ext}`;
  const content = readContentSync(filePath);
  writeContentSync(backupPath, content);
  return backupPath;
}

/**
 * Synchronously expands file and directory targets into a flat list of file paths,
 * skipping ignored and hidden directories while preserving `"-"` for stdin.
 */
export function expandTargetsSync(
  targets: string[],
  ignores: string[] = ["node_modules", ".git", ".graveyard", "dist", "build"],
): string[] {
  const filePaths: string[] = [];
  for (const target of targets) {
    if (target === "-") {
      filePaths.push("-");
      continue;
    }
    try {
      const s = statSync(target);
      if (s.isDirectory()) {
        const entries = readdirSync(target, { withFileTypes: true });
        const subTargets = entries
          .filter((e) => !ignores.includes(e.name) && !e.name.startsWith("."))
          .map((e) => join(target, e.name));
        const expanded = expandTargetsSync(subTargets, ignores);
        filePaths.push(...expanded);
      } else if (s.isFile()) {
        filePaths.push(target);
      }
    } catch {}
  }
  return filePaths;
}

/**
 * Synchronously reads `filePath`, applies the replacement `regex`, and computes resulting diff hunks.
 */
export function processFileSync(
  filePath: string,
  regex: RegExp,
  replacement: string,
): FileTransformResult {
  const original = readContentSync(filePath);
  const newContent = replaceText(original, regex, replacement);
  const hasChanged = original !== newContent;
  const diffHunks = hasChanged ? computeDiffHunks(original, newContent) : [];

  return {
    filePath,
    hasChanged,
    originalContent: original,
    newContent,
    diffHunks,
  };
}
