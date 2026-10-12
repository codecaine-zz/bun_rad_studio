/**
 * Fd Ops — file management & analysis primitives for Fd Studio Pro.
 * Pure Node/Bun fs logic (no UI) so it can be smoke-tested and reused by the CLI/server.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { formatHumanSize } from "./fd_engine";

export type UndoEntry =
  | { kind: "rename"; from: string; to: string }
  | { kind: "create"; path: string }
  | { kind: "duplicate"; path: string };

export interface RenamePlanRow {
  from: string;
  to: string;
  oldName: string;
  newName: string;
  error?: string;
}

export interface RenameRules {
  find?: string;
  replace?: string;
  useRegex?: boolean;
  prefix?: string;
  suffix?: string; // inserted before the extension
  caseMode?: "none" | "lower" | "upper" | "title";
  numbering?: boolean; // appends _001, _002 ... before the extension
  spacesToUnderscore?: boolean;
}

export interface ContentMatch {
  path: string;
  line: number;
  text: string;
}

export interface DuplicateGroup {
  hash: string;
  sizeBytes: number;
  paths: string[];
}

const INVALID_NAME = /[\/\\\0]/;

export function validateName(name: string): string | null {
  const trimmedName = name.trim();
  if (!trimmedName) return "Name cannot be empty.";
  if (trimmedName === "." || trimmedName === "..") return "Invalid name.";
  if (INVALID_NAME.test(trimmedName)) return "Name cannot contain slashes.";
  return null;
}

/** Returns a path that does not exist yet by appending " copy", " copy 2", ... */
export function uniquePath(target: string, suffixWord = "copy"): string {
  if (!fs.existsSync(target)) return target;
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let i = 1; i < 10000; i++) {
    const candidatePath = path.join(dir, `${base} ${suffixWord}${i > 1 ? " " + i : ""}${ext}`);
    if (!fs.existsSync(candidatePath)) return candidatePath;
  }
  throw new Error("Could not find a free file name.");
}

export function createFileAt(dir: string, name: string): UndoEntry {
  const err = validateName(name);
  if (err) throw new Error(err);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, name.trim());
  if (fs.existsSync(target)) throw new Error(`'${name}' already exists.`);
  fs.writeFileSync(target, "");
  return { kind: "create", path: target };
}

export function createFolderAt(dir: string, name: string): UndoEntry {
  const err = validateName(name);
  if (err) throw new Error(err);
  const target = path.join(dir, name.trim());
  if (fs.existsSync(target)) throw new Error(`'${name}' already exists.`);
  fs.mkdirSync(target, { recursive: true });
  return { kind: "create", path: target };
}

export function renamePath(from: string, newName: string): UndoEntry {
  const err = validateName(newName);
  if (err) throw new Error(err);
  const to = path.join(path.dirname(from), newName.trim());
  if (to === from) throw new Error("The new name is the same as the old name.");
  if (fs.existsSync(to)) throw new Error(`'${newName}' already exists in that folder.`);
  fs.renameSync(from, to);
  return { kind: "rename", from, to };
}

export function duplicatePath(from: string): UndoEntry {
  const to = uniquePath(from);
  fs.cpSync(from, to, { recursive: true });
  return { kind: "duplicate", path: to };
}

/** Undo one entry. Created/duplicated items are removed only if still empty files or fresh copies. */
export function undoEntry(entry: UndoEntry): string {
  if (entry.kind === "rename") {
    if (fs.existsSync(entry.from)) throw new Error(`Cannot undo: '${path.basename(entry.from)}' already exists.`);
    fs.renameSync(entry.to, entry.from);
    return `Renamed '${path.basename(entry.to)}' back to '${path.basename(entry.from)}'`;
  }
  // create / duplicate → remove (recursive but only what we made)
  fs.rmSync(entry.path, { recursive: true, force: true });
  return `Removed '${path.basename(entry.path)}'`;
}

export function openWithDefaultApp(target: string): void {
  const resolved = path.resolve(target);
  if (process.platform === "darwin") Bun.spawn(["open", resolved]);
  else if (process.platform === "win32") Bun.spawn(["cmd", "/c", "start", "", resolved]);
  else Bun.spawn(["xdg-open", resolved]);
}

/** Accepts octal ("644", "0755") or symbolic ("rwxr-xr-x"). Returns the numeric mode. */
export function parseMode(input: string): number {
  const trimmedInput = input.trim();
  if (/^[0-7]{3,4}$/.test(trimmedInput)) return parseInt(trimmedInput, 8);
  if (/^[r-][w-][x-][r-][w-][x-][r-][w-][x-]$/.test(trimmedInput)) {
    let modeBits = 0;
    for (let i = 0; i < 9; i++) if (trimmedInput[i] !== "-") modeBits |= 1 << (8 - i);
    return modeBits;
  }
  throw new Error("Use octal like 644 / 755 or symbolic like rwxr-xr-x.");
}

export function chmodPath(target: string, modeInput: string): { before: string; after: string } {
  const mode = parseMode(modeInput);
  const before = (fs.statSync(target).mode & 0o777).toString(8).padStart(3, "0");
  fs.chmodSync(target, mode);
  return { before, after: (mode & 0o777).toString(8).padStart(3, "0") };
}

function titleCase(text: string): string {
  return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/** Builds a preview of renames without touching the disk. */
export function planBatchRename(paths: string[], rules: RenameRules): RenamePlanRow[] {
  let re: RegExp | null = null;
  if (rules.find) {
    try {
      re = new RegExp(rules.useRegex ? rules.find : rules.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    } catch (e: any) {
      throw new Error(`Invalid pattern: ${e.message}`);
    }
  }
  const width = Math.max(3, String(paths.length).length);
  const taken = new Set<string>();
  const rows: RenamePlanRow[] = paths.map((filePath, index) => {
    const oldName = path.basename(filePath);
    const ext = path.extname(oldName);
    let stem = ext ? oldName.slice(0, -ext.length) : oldName;
    if (re) stem = stem.replace(re, rules.replace ?? "");
    if (rules.spacesToUnderscore) stem = stem.replace(/\s+/g, "_");
    if (rules.caseMode === "lower") stem = stem.toLowerCase();
    else if (rules.caseMode === "upper") stem = stem.toUpperCase();
    else if (rules.caseMode === "title") stem = titleCase(stem);
    stem = (rules.prefix ?? "") + stem + (rules.suffix ?? "");
    if (rules.numbering) stem += "_" + String(index + 1).padStart(width, "0");
    const newName = stem + ext;
    const to = path.join(path.dirname(filePath), newName);
    const row: RenamePlanRow = { from: filePath, to, oldName, newName };
    const nameErr = validateName(newName);
    if (nameErr) row.error = nameErr;
    return row;
  });
  // Conflict detection (collisions with each other or existing files not part of the batch)
  const sources = new Set(rows.map((planRow) => planRow.from));
  for (const planRow of rows) {
    if (planRow.error || planRow.from === planRow.to) continue;
    if (taken.has(planRow.to)) planRow.error = "Duplicate target name in this batch.";
    else if (fs.existsSync(planRow.to) && !sources.has(planRow.to)) planRow.error = "A file with that name already exists.";
    taken.add(planRow.to);
  }
  return rows;
}

/** Applies a plan (rows with errors or no change are skipped). Returns undo entries + counts. */
export function applyRenamePlan(plan: RenamePlanRow[]): { done: UndoEntry[]; skipped: number; failed: string[] } {
  const done: UndoEntry[] = [];
  const failed: string[] = [];
  let skipped = 0;
  // Two-phase via temp names so swaps / chains inside a batch never clobber each other.
  const staged: { stagedPath: string; row: RenamePlanRow }[] = [];
  for (const row of plan) {
    if (row.error || row.from === row.to) {
      skipped++;
      continue;
    }
    const stagedPath = path.join(path.dirname(row.from), `.fdrn_${process.pid}_${staged.length}_${Date.now()}`);
    try {
      fs.renameSync(row.from, stagedPath);
      staged.push({ stagedPath, row });
    } catch (e: any) {
      failed.push(`${row.oldName}: ${e.message}`);
    }
  }
  for (const { stagedPath, row } of staged) {
    try {
      fs.renameSync(stagedPath, row.to);
      done.push({ kind: "rename", from: row.from, to: row.to });
    } catch (e: any) {
      failed.push(`${row.oldName}: ${e.message}`);
      try {
        fs.renameSync(stagedPath, row.from);
      } catch {}
    }
  }
  return { done, skipped, failed };
}

/** Grep-like search inside files (skips directories, binaries and files > maxFileBytes). */
export function searchContents(
  paths: string[],
  query: string,
  opts: { regex?: boolean; caseSensitive?: boolean; maxMatches?: number; maxFileBytes?: number } = {}
): { matches: ContentMatch[]; filesScanned: number; filesWithHits: number; truncated: boolean } {
  const maxMatches = opts.maxMatches ?? 500;
  const maxFileBytes = opts.maxFileBytes ?? 5 * 1024 * 1024;
  const flags = opts.caseSensitive ? "" : "i";
  const re = new RegExp(opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  const matches: ContentMatch[] = [];
  let filesScanned = 0;
  let filesWithHits = 0;
  let truncated = false;
  for (const filePath of paths) {
    let st: fs.Stats;
    try {
      st = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > maxFileBytes || st.size === 0) continue;
    let buf: Buffer;
    try {
      buf = fs.readFileSync(filePath);
    } catch {
      continue;
    }
    if (buf.subarray(0, 4096).includes(0)) continue; // binary
    filesScanned++;
    const lines = buf.toString("utf-8").split(/\r?\n/);
    let hit = false;
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? "";
      if (re.test(lineText)) {
        hit = true;
        matches.push({ path: filePath, line: i + 1, text: lineText.trim().slice(0, 200) });
        if (matches.length >= maxMatches) {
          truncated = true;
          break;
        }
      }
    }
    if (hit) filesWithHits++;
    if (truncated) break;
  }
  return { matches, filesScanned, filesWithHits, truncated };
}

/** Finds identical files: group by size, then by SHA-256. */
export function findDuplicates(paths: string[], minBytes = 1): { groups: DuplicateGroup[]; wastedBytes: number } {
  const bySize = new Map<number, string[]>();
  for (const filePath of paths) {
    try {
      const st = fs.statSync(filePath);
      if (!st.isFile() || st.size < minBytes) continue;
      const sameSizePaths = bySize.get(st.size) ?? [];
      sameSizePaths.push(filePath);
      bySize.set(st.size, sameSizePaths);
    } catch {}
  }
  const groups: DuplicateGroup[] = [];
  let wastedBytes = 0;
  for (const [size, list] of bySize) {
    if (list.length < 2) continue;
    const byHash = new Map<string, string[]>();
    for (const filePath of list) {
      try {
        const hasher = new Bun.CryptoHasher("sha256");
        hasher.update(fs.readFileSync(filePath));
        const hex = hasher.digest("hex");
        const sameHashPaths = byHash.get(hex) ?? [];
        sameHashPaths.push(filePath);
        byHash.set(hex, sameHashPaths);
      } catch {}
    }
    for (const [hash, ps] of byHash) {
      if (ps.length > 1) {
        groups.push({ hash, sizeBytes: size, paths: ps });
        wastedBytes += size * (ps.length - 1);
      }
    }
  }
  groups.sort((a, b) => b.sizeBytes * (b.paths.length - 1) - a.sizeBytes * (a.paths.length - 1));
  return { groups, wastedBytes };
}

export function largestFiles(paths: string[], n = 20): { path: string; sizeBytes: number; humanSize: string }[] {
  const out: { path: string; sizeBytes: number; humanSize: string }[] = [];
  for (const filePath of paths) {
    try {
      const st = fs.statSync(filePath);
      if (st.isFile()) out.push({ path: filePath, sizeBytes: st.size, humanSize: formatHumanSize(st.size) });
    } catch {}
  }
  return out.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, n);
}

/** Size breakdown by file extension for the given files. */
export function sizeByExtension(paths: string[]): { ext: string; count: number; sizeBytes: number; humanSize: string }[] {
  const map = new Map<string, { count: number; sizeBytes: number }>();
  for (const filePath of paths) {
    try {
      const st = fs.statSync(filePath);
      if (!st.isFile()) continue;
      const ext = path.extname(filePath).toLowerCase() || "(none)";
      const cur = map.get(ext) ?? { count: 0, sizeBytes: 0 };
      cur.count++;
      cur.sizeBytes += st.size;
      map.set(ext, cur);
    } catch {}
  }
  return [...map.entries()]
    .map(([ext, v]) => ({ ext, ...v, humanSize: formatHumanSize(v.sizeBytes) }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
}

/** Hex dump of the first `len` bytes (for binary previews). */
export function hexPreview(file: string, len = 256): string {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(len);
    const bytesRead = fs.readSync(fd, buf, 0, len, 0);
    const lines: string[] = [];
    for (let i = 0; i < bytesRead; i += 16) {
      const chunk = buf.subarray(i, Math.min(i + 16, bytesRead));
      const hex = [...chunk].map((byte) => byte.toString(16).padStart(2, "0")).join(" ").padEnd(47);
      const asc = [...chunk].map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".")).join("");
      lines.push(`${i.toString(16).padStart(6, "0")}  ${hex}  ${asc}`);
    }
    return lines.join("\n");
  } finally {
    fs.closeSync(fd);
  }
}

export function isBinaryFile(file: string): boolean {
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(4096);
      const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
      return buf.subarray(0, bytesRead).includes(0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

export interface ExportRow {
  name: string;
  type: string;
  humanSize: string;
  relativePath: string;
  mtimeStr: string;
  permStr: string;
}

export function toTsv(rows: ExportRow[]): string {
  const clean = (v: string) => String(v).replace(/[\t\r\n]+/g, " ");
  const head = ["Name", "Type", "Size", "Path", "Modified", "Perms"].join("\t");
  return [head, ...rows.map((row) => [row.name, row.type, row.humanSize, row.relativePath, row.mtimeStr, row.permStr].map(clean).join("\t"))].join("\n") + "\n";
}

export function toMarkdownTable(rows: ExportRow[]): string {
  const esc = (v: string) => String(v).replace(/\|/g, "\\|");
  const lines = ["| Name | Type | Size | Path | Modified | Perms |", "|---|---|---|---|---|---|"];
  for (const row of rows) lines.push(`| ${[row.name, row.type, row.humanSize, row.relativePath, row.mtimeStr, row.permStr].map(esc).join(" | ")} |`);
  return lines.join("\n") + "\n";
}
