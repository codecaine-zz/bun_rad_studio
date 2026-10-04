// Feature: RAD - fileutils
// Async, non-blocking filesystem toolkit: atomic writes, JSON/JSONL/CSV I/O, line ops,
// directory walking, temp dirs, byte formatting, and content hashing.
// Engine: node:fs/promises + Bun.file / Bun.write / Bun.CryptoHasher.

import {
  appendFile,
  copyFile as fsCopyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Plain metadata record describing a path on disk. */
export interface FileInfo {
  path: string;
  size: number;
  isFile: boolean;
  isDir: boolean;
  isSymlink: boolean;
  mtimeMs: number;
  birthtimeMs: number;
  mode: number;
}

/** Options for {@link parseCsvString} / {@link readCsv}. */
export interface CsvParseOptions {
  /** Trim whitespace around every cell. Default `true` (legacy behaviour). */
  trim?: boolean;
  /** Drop rows that are entirely empty. Default `true`. */
  skipEmptyLines?: boolean;
}

/** Any scalar that can be written to a CSV cell. `null`/`undefined` become empty cells. */
export type CsvCell = string | number | boolean | bigint | null | undefined;

/** Options for {@link walkFiles}. */
export interface WalkOptions {
  /** Maximum recursion depth (0 = only `dirPath` itself). Default: unlimited. */
  maxDepth?: number;
  /** Directory names to never descend into, e.g. `["node_modules", ".git"]`. */
  skipDirs?: string[];
  /** Include directory paths in the result as well as files. Default `false`. */
  includeDirs?: boolean;
}

/** Hash algorithms supported by {@link hashFile}. */
export type FileHashAlgorithm = "md5" | "sha1" | "sha256" | "sha512" | "blake2b256";

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB"] as const;

/**
 * Recursively create a directory (like `mkdir -p`). No-op when it already exists.
 * @param dirPath - Directory to create.
 * @example
 * ```ts
 * await fileutils.ensureDir("./data/cache/images");
 * ```
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    if (err.code !== "EEXIST") throw new Error(`[fileutils.ensureDir] Cannot create ${dirPath}: ${err.message}`);
  }
}

/**
 * Format a byte count as a human string using 1024-based units (B, KB … EB). Pure + sync.
 * @param bytes - Byte count (negative values keep their sign).
 * @param decimals - Fraction digits for non-byte units. Default `1`.
 * @returns e.g. `"512 B"`, `"1.5 KB"`, `"2.0 GB"`.
 * @example
 * ```ts
 * fileutils.formatBytes(1536); // "1.5 KB"
 * fileutils.formatBytes(5_000_000_000, 2); // "4.66 GB"
 * ```
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes)) throw new Error(`[fileutils.formatBytes] Expected finite number, got ${bytes}`);
  const sign = bytes < 0 ? "-" : "";
  let size = Math.abs(bytes);
  if (size < 1024) return `${sign}${size} B`;
  let u = 0;
  while (size >= 1024 && u < BYTE_UNITS.length - 1) {
    size /= 1024;
    u++;
  }
  return `${sign}${size.toFixed(decimals)} ${BYTE_UNITS[u]}`;
}

/**
 * Parse a human byte string back into a number of bytes (1024-based). Inverse of {@link formatBytes}.
 * Accepts `B`, `K/KB/KiB`, `M/MB/MiB`, … case-insensitively; a bare number means bytes.
 * @throws When the string is not a recognisable size.
 * @example
 * ```ts
 * fileutils.parseBytes("1.5 KB"); // 1536
 * fileutils.parseBytes("10mb");   // 10485760
 * ```
 */
export function parseBytes(input: string): number {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*([kmgtpe]?)(i?b)?\s*$/i.exec(input);
  if (!m) throw new Error(`[fileutils.parseBytes] Unrecognised size string: "${input}"`);
  const power = m[2] ? "BKMGTPE".indexOf(m[2].toUpperCase()) : 0;
  return Math.round(Number(m[1]) * 1024 ** power);
}

/**
 * Human-readable size of a byte count **or** of a file on disk.
 * @param bytesOrPath - Number of bytes, or a file path to `stat`.
 * @throws When given a path that does not exist.
 * @example
 * ```ts
 * await fileutils.fileSizeHuman(1048576 * 2.5); // "2.5 MB"
 * await fileutils.fileSizeHuman("./package.json"); // e.g. "1.4 KB"
 * ```
 */
export async function fileSizeHuman(bytesOrPath: number | string): Promise<string> {
  if (typeof bytesOrPath === "number") return formatBytes(bytesOrPath);
  try {
    return formatBytes((await stat(bytesOrPath)).size);
  } catch {
    throw new Error(`[fileutils] File not found: ${bytesOrPath}`);
  }
}

/**
 * `true` when any filesystem entry (file, dir, symlink target) exists at `path`.
 * @example
 * ```ts
 * if (!(await fileutils.pathExists("./out"))) await fileutils.ensureDir("./out");
 * ```
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** `true` when `path` exists and is a regular file. @example `await fileutils.isFile("a.txt")` */
export async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** `true` when `path` exists and is a directory. @example `await fileutils.isDir("./src")` */
export async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Plain-data metadata for a path, or `null` when it does not exist.
 * @example
 * ```ts
 * const info = await fileutils.fileInfo("./package.json");
 * console.log(info?.size, new Date(info!.mtimeMs));
 * ```
 */
export async function fileInfo(path: string): Promise<FileInfo | null> {
  try {
    const s = await stat(path);
    return {
      path,
      size: s.size,
      isFile: s.isFile(),
      isDir: s.isDirectory(),
      isSymlink: s.isSymbolicLink(),
      mtimeMs: s.mtimeMs,
      birthtimeMs: s.birthtimeMs,
      mode: s.mode,
    };
  } catch {
    return null;
  }
}

/**
 * Read a whole file as UTF-8 text, returning `fallback` (if provided) when missing.
 * @throws When the file is missing and no fallback was given.
 * @example
 * ```ts
 * const css = await fileutils.readText("./theme.css", "");
 * ```
 */
export async function readText(filePath: string, fallback?: string): Promise<string> {
  const file = Bun.file(filePath);
  if (await file.exists()) return file.text();
  if (fallback !== undefined) return fallback;
  throw new Error(`[fileutils.readText] File not found: ${filePath}`);
}

/**
 * Crash-safe write: writes to a sibling temp file then atomically `rename`s it over the target,
 * so readers never observe a half-written file. Parent dirs are created automatically.
 * @returns Number of bytes written.
 * @example
 * ```ts
 * await fileutils.writeFileAtomic("./state.json", JSON.stringify(state));
 * ```
 */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<number> {
  await ensureDir(dirname(filePath));
  const tmp = `${filePath}.tmp-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    const written = await Bun.write(tmp, data);
    await rename(tmp, filePath);
    return written;
  } catch (err: any) {
    await rm(tmp, { force: true });
    throw new Error(`[fileutils.writeFileAtomic] Failed writing ${filePath}: ${err.message}`);
  }
}

/**
 * Write UTF-8 text, creating parent directories. Pass `atomic: true` for crash-safe replace.
 * @returns Number of bytes written.
 * @example
 * ```ts
 * await fileutils.writeText("./out/report.md", "# Report", { atomic: true });
 * ```
 */
export async function writeText(filePath: string, text: string, options: { atomic?: boolean } = {}): Promise<number> {
  if (options.atomic) return writeFileAtomic(filePath, text);
  await ensureDir(dirname(filePath));
  return Bun.write(filePath, text);
}

/**
 * Serialize `data` to a JSON file (pretty by default). Writes are atomic.
 * @param pretty - Indent with 2 spaces. Default `true`.
 * @example
 * ```ts
 * await fileutils.saveJson("./config.json", { port: 8080 });
 * ```
 */
export async function saveJson(filePath: string, data: unknown, pretty = true): Promise<void> {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFileAtomic(filePath, content);
}

/**
 * Load and parse a JSON file. When `fallback` is given, it is returned on a missing or corrupt file.
 * @throws When the file is missing/corrupt and no fallback was given.
 * @example
 * ```ts
 * const cfg = await fileutils.loadJson<{ port: number }>("./config.json", { port: 3000 });
 * ```
 */
export async function loadJson<T>(filePath: string, fallback?: T): Promise<T> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      if (fallback !== undefined) return fallback;
      throw new Error(`[fileutils] JSON file not found: ${filePath}`);
    }
    return (await file.json()) as T;
  } catch (err: any) {
    if (fallback !== undefined) return fallback;
    throw new Error(`[fileutils] Failed to load JSON from ${filePath}: ${err.message}`);
  }
}

/**
 * Read a JSON-Lines (`.jsonl` / NDJSON) file into an array. Blank lines are skipped.
 * @throws With the 1-based line number when a line is not valid JSON.
 * @example
 * ```ts
 * const events = await fileutils.readJsonl<{ type: string }>("./events.jsonl");
 * ```
 */
export async function readJsonl<T = unknown>(filePath: string): Promise<T[]> {
  const lines = (await readText(filePath)).split(/\r?\n/);
  const out: T[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      out.push(JSON.parse(line) as T);
    } catch (err: any) {
      throw new Error(`[fileutils.readJsonl] ${filePath}:${i + 1} invalid JSON: ${err.message}`);
    }
  });
  return out;
}

/**
 * Write an array as JSON-Lines (one compact JSON value per line, trailing newline). Atomic.
 * @example
 * ```ts
 * await fileutils.writeJsonl("./events.jsonl", [{ type: "start" }, { type: "stop" }]);
 * ```
 */
export async function writeJsonl(filePath: string, records: unknown[]): Promise<void> {
  const body = records.map((r) => JSON.stringify(r)).join("\n");
  await writeFileAtomic(filePath, records.length ? `${body}\n` : "");
}

/**
 * Append a single record to a JSON-Lines file in O(1) (no re-read). Ideal for logs/event streams.
 * @example
 * ```ts
 * await fileutils.appendJsonl("./audit.jsonl", { at: Date.now(), action: "login" });
 * ```
 */
export async function appendJsonl(filePath: string, record: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf-8");
}

/**
 * Read a text file and split it into lines (handles `\n` and `\r\n`).
 * @throws When the file does not exist.
 * @example
 * ```ts
 * const hosts = await fileutils.readLines("/etc/hosts");
 * ```
 */
export async function readLines(filePath: string): Promise<string[]> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`[fileutils] File not found: ${filePath}`);
  }
  return (await file.text()).split(/\r?\n/);
}

/**
 * Join lines with `\n` and write them, creating parent directories.
 * @example
 * ```ts
 * await fileutils.writeLines("./todo.txt", ["buy milk", "ship v2"]);
 * ```
 */
export async function writeLines(filePath: string, lines: string[]): Promise<void> {
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, lines.join("\n"));
}

/**
 * Append one line. Inserts a `\n` separator only when the file already has content that does not
 * end with a newline. O(1): uses `appendFile`, never re-reads the whole file.
 * @example
 * ```ts
 * await fileutils.appendLine("./app.log", `[${new Date().toISOString()}] boot`);
 * ```
 */
export async function appendLine(filePath: string, line: string): Promise<void> {
  await appendLines(filePath, [line]);
}

/**
 * Append many lines in one write (same separator rules as {@link appendLine}).
 * @example
 * ```ts
 * await fileutils.appendLines("./app.log", ["a", "b", "c"]);
 * ```
 */
export async function appendLines(filePath: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  await ensureDir(dirname(filePath));
  const file = Bun.file(filePath);
  let prefix = "";
  if (await file.exists()) {
    const size = file.size;
    if (size > 0) {
      const last = await file.slice(size - 1, size).text();
      prefix = last === "\n" ? "" : "\n";
    }
  }
  await appendFile(filePath, prefix + lines.join("\n"), "utf-8");
}

/**
 * Create an empty file, or bump the modification time of an existing one (like `touch`).
 * @example
 * ```ts
 * await fileutils.touch("./.last-run");
 * ```
 */
export async function touch(filePath: string): Promise<void> {
  if (await pathExists(filePath)) {
    const now = new Date();
    await utimes(filePath, now, now);
    return;
  }
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, "");
}

/**
 * Copy one file, creating destination parent directories.
 * @throws When `src` does not exist.
 * @example
 * ```ts
 * await fileutils.copyFile("./a.txt", "./backup/a.txt");
 * ```
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  if (!(await Bun.file(src).exists())) {
    throw new Error(`[fileutils] Source file does not exist: ${src}`);
  }
  await ensureDir(dirname(dest));
  await fsCopyFile(src, dest);
}

/**
 * Move/rename a file. Falls back to copy + delete when crossing devices (`EXDEV`).
 * @throws When `src` does not exist.
 * @example
 * ```ts
 * await fileutils.moveFile("./tmp/upload.bin", "/Volumes/Backup/upload.bin");
 * ```
 */
export async function moveFile(src: string, dest: string): Promise<void> {
  if (!(await Bun.file(src).exists())) {
    throw new Error(`[fileutils] Source file does not exist: ${src}`);
  }
  await ensureDir(dirname(dest));
  try {
    await rename(src, dest);
  } catch (err: any) {
    if (err.code !== "EXDEV") throw err;
    await fsCopyFile(src, dest);
    await unlink(src);
  }
}

/**
 * Recursively copy a directory tree (like `cp -R`).
 * @param overwrite - Replace existing files at the destination. Default `true`.
 * @example
 * ```ts
 * await fileutils.copyDir("./public", "./dist/public");
 * ```
 */
export async function copyDir(srcDir: string, destDir: string, overwrite = true): Promise<void> {
  if (!(await isDir(srcDir))) throw new Error(`[fileutils.copyDir] Source is not a directory: ${srcDir}`);
  await cp(srcDir, destDir, { recursive: true, force: overwrite, errorOnExist: false });
}

/**
 * Delete a file or a whole directory tree (like `rm -rf`). Missing paths are ignored.
 * @returns `true` if something existed and was removed.
 * @example
 * ```ts
 * await fileutils.removePath("./dist");
 * ```
 */
export async function removePath(path: string): Promise<boolean> {
  const existed = await pathExists(path);
  await rm(path, { recursive: true, force: true });
  return existed;
}

/**
 * Create a unique temporary directory under the OS temp dir.
 * @param prefix - Directory name prefix. Default `"rad-"`.
 * @returns Absolute path of the new directory.
 * @example
 * ```ts
 * const dir = await fileutils.makeTempDir("build-");
 * ```
 */
export async function makeTempDir(prefix = "rad-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Run `fn` with a fresh temp directory that is **always** deleted afterwards (even on throw).
 * @returns Whatever `fn` returns.
 * @example
 * ```ts
 * const count = await fileutils.withTempDir(async (dir) => {
 *   await fileutils.writeText(`${dir}/a.txt`, "hi");
 *   return (await fileutils.walkFiles(dir)).length;
 * }); // 1
 * ```
 */
export async function withTempDir<T>(fn: (dir: string) => Promise<T> | T, prefix = "rad-"): Promise<T> {
  const dir = await makeTempDir(prefix);
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Streaming hash of a file's contents (constant memory, works on multi-GB files).
 * @param algorithm - Default `"sha256"`.
 * @returns Lower-case hex digest.
 * @example
 * ```ts
 * const digest = await fileutils.hashFile("./release.tar.gz", "sha512");
 * ```
 */
export async function hashFile(filePath: string, algorithm: FileHashAlgorithm = "sha256"): Promise<string> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) throw new Error(`[fileutils.hashFile] File not found: ${filePath}`);
  const hasher = new Bun.CryptoHasher(algorithm);
  for await (const chunk of file.stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

/**
 * Parse CSV text into a 2-D string matrix. RFC 4180 compliant: quoted cells may contain
 * delimiters, escaped quotes (`""`) **and newlines**; handles `\n`, `\r\n` and lone `\r`.
 * @param delimiter - Single-character separator. Default `","` (use `"\t"` for TSV).
 * @example
 * ```ts
 * fileutils.parseCsvString('id,note\n1,"multi\nline"'); // [["id","note"],["1","multi\nline"]]
 * ```
 */
export function parseCsvString(csvText: string, delimiter = ",", options: CsvParseOptions = {}): string[][] {
  const trim = options.trim ?? true;
  const skipEmpty = options.skipEmptyLines ?? true;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const endCell = () => {
    row.push(trim ? cell.trim() : cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    const empty = row.length === 1 && row[0] === "";
    if (!(skipEmpty && empty)) rows.push(row);
    row = [];
  };
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i]!;
    if (inQuotes) {
      if (ch !== '"') cell += ch;
      else if (csvText[i + 1] === '"') {
        cell += '"';
        i++;
      } else inQuotes = false;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) endCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && csvText[i + 1] === "\n") i++;
      endRow();
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) endRow();
  return rows;
}

/**
 * Serialize a matrix to CSV text, quoting cells containing the delimiter, quotes, newlines,
 * or leading/trailing whitespace. Non-string scalars are stringified; `null`/`undefined` → empty.
 * @example
 * ```ts
 * fileutils.formatCsvString([["id", "name"], [1, 'Al "The Pal"']]); // 'id,name\n1,"Al ""The Pal"""'
 * ```
 */
export function formatCsvString(rows: CsvCell[][], delimiter = ","): string {
  const encode = (raw: CsvCell): string => {
    const val = raw === null || raw === undefined ? "" : String(raw);
    const needsQuotes = val.includes(delimiter) || /["\r\n]/.test(val) || val !== val.trim();
    return needsQuotes ? `"${val.replace(/"/g, '""')}"` : val;
  };
  return rows.map((row) => row.map(encode).join(delimiter)).join("\n");
}

/**
 * Convert a CSV matrix whose first row is a header into an array of plain records.
 * Missing trailing cells become `""`.
 * @example
 * ```ts
 * fileutils.csvToObjects([["id", "name"], ["1", "Ada"]]); // [{ id: "1", name: "Ada" }]
 * ```
 */
export function csvToObjects(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/**
 * Convert records into a CSV matrix (header row first). Columns default to the union of keys
 * in first-seen order; pass `columns` to choose/ordering explicitly.
 * @example
 * ```ts
 * fileutils.objectsToCsv([{ id: 1, name: "Ada" }]); // [["id","name"],[1,"Ada"]]
 * ```
 */
export function objectsToCsv(records: Record<string, CsvCell>[], columns?: string[]): CsvCell[][] {
  const cols = columns ?? [...new Set(records.flatMap((r) => Object.keys(r)))];
  return [cols, ...records.map((r) => cols.map((c) => r[c]))];
}

/**
 * Read and parse a CSV file into a matrix.
 * @throws When the file does not exist.
 * @example
 * ```ts
 * const rows = await fileutils.readCsv("./sales.csv");
 * ```
 */
export async function readCsv(filePath: string, delimiter = ",", options: CsvParseOptions = {}): Promise<string[][]> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`[fileutils] CSV file not found: ${filePath}`);
  }
  return parseCsvString(await file.text(), delimiter, options);
}

/**
 * Write a matrix to a CSV file, creating parent directories.
 * @example
 * ```ts
 * await fileutils.writeCsv("./out.csv", [["a", "b"], [1, 2]]);
 * ```
 */
export async function writeCsv(filePath: string, rows: CsvCell[][], delimiter = ","): Promise<void> {
  await ensureDir(dirname(filePath));
  await Bun.write(filePath, formatCsvString(rows, delimiter));
}

/**
 * Read a CSV file with a header row directly into records.
 * @example
 * ```ts
 * const users = await fileutils.readCsvObjects("./users.csv"); // [{ id: "1", name: "Ada" }, ...]
 * ```
 */
export async function readCsvObjects(filePath: string, delimiter = ","): Promise<Record<string, string>[]> {
  return csvToObjects(await readCsv(filePath, delimiter));
}

/**
 * Write records to a CSV file with an auto-generated (or explicit) header row.
 * @example
 * ```ts
 * await fileutils.writeCsvObjects("./users.csv", [{ id: 1, name: "Ada" }]);
 * ```
 */
export async function writeCsvObjects(
  filePath: string,
  records: Record<string, CsvCell>[],
  columns?: string[],
  delimiter = ","
): Promise<void> {
  await writeCsv(filePath, objectsToCsv(records, columns), delimiter);
}

/**
 * Recursively collect file paths under `dirPath`. Unreadable directories are skipped silently.
 * @param filter - Optional predicate on the full path; return `true` to keep.
 * @param options - Depth limit, directory skip-list, include directories.
 * @example
 * ```ts
 * const ts = await fileutils.walkFiles("./src", (p) => p.endsWith(".ts"), { skipDirs: ["node_modules"] });
 * ```
 */
export async function walkFiles(
  dirPath: string,
  filter?: (path: string) => boolean,
  options: WalkOptions = {}
): Promise<string[]> {
  return walkDepth(dirPath, filter, options, 0);
}

async function walkDepth(
  dirPath: string,
  filter: ((path: string) => boolean) | undefined,
  options: WalkOptions,
  depth: number
): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (options.skipDirs?.includes(entry.name)) continue;
      if (options.includeDirs && (!filter || filter(fullPath))) results.push(fullPath);
      if (options.maxDepth === undefined || depth < options.maxDepth) {
        results.push(...(await walkDepth(fullPath, filter, options, depth + 1)));
      }
    } else if (entry.isFile() && (!filter || filter(fullPath))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Total size in bytes of every file beneath a directory (recursive).
 * @example
 * ```ts
 * fileutils.formatBytes(await fileutils.dirSize("./node_modules")); // "182.4 MB"
 * ```
 */
export async function dirSize(dirPath: string): Promise<number> {
  const files = await walkFiles(dirPath);
  const sizes = await Promise.all(files.map((f) => stat(f).then((s) => s.size, () => 0)));
  return sizes.reduce((a, b) => a + b, 0);
}

export const fileutils = {
  ensureDir,
  formatBytes,
  parseBytes,
  fileSizeHuman,
  pathExists,
  isFile,
  isDir,
  fileInfo,
  readText,
  writeText,
  writeFileAtomic,
  saveJson,
  loadJson,
  readJsonl,
  writeJsonl,
  appendJsonl,
  readLines,
  writeLines,
  appendLine,
  appendLines,
  touch,
  copyFile,
  moveFile,
  copyDir,
  removePath,
  makeTempDir,
  withTempDir,
  hashFile,
  parseCsvString,
  formatCsvString,
  csvToObjects,
  objectsToCsv,
  readCsv,
  writeCsv,
  readCsvObjects,
  writeCsvObjects,
  walkFiles,
  dirSize,
};
