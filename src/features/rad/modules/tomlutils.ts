// Feature: RAD - tomlutils
// High-performance TOML parsing and serialization powered natively by Bun.TOML (Zig engine),
// plus typed dotted-path accessors, path mutation, deep merging and layered config loading.
// See: https://bun.sh/docs/runtime/toml

import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

/** Any parsed TOML table. */
export type TomlTable = Record<string, any>;

/**
 * Parse TOML text with native `Bun.TOML.parse`.
 * @throws `[tomlutils.parseToml] <reason>` with the parser's message when the TOML is invalid.
 * @example
 * ```ts
 * const cfg = tomlutils.parseToml<{ server: { port: number } }>("[server]\nport = 8080");
 * cfg.server.port; // 8080
 * ```
 */
export function parseToml<T = TomlTable>(content: string): T {
  try {
    return Bun.TOML.parse(content) as T;
  } catch (err: any) {
    throw new Error(`[tomlutils.parseToml] ${err.message}`);
  }
}

/**
 * Parse TOML, returning `null` instead of throwing on invalid input.
 * @example `tomlutils.tryParseToml("a = "); // null`
 */
export function tryParseToml<T = TomlTable>(content: string): T | null {
  try {
    return Bun.TOML.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Serialize a plain object to TOML text with native `Bun.TOML.stringify`.
 * @example
 * ```ts
 * tomlutils.stringifyToml({ title: "app", server: { port: 80 } }); // 'title = "app"\n\n[server]\nport = 80\n'
 * ```
 */
export function stringifyToml(data: unknown): string {
  return Bun.TOML.stringify(data as any) ?? "";
}

/**
 * Load and parse a TOML file. `fallback` (if given) is returned on a missing or invalid file.
 * @throws When the file is missing/invalid and no fallback was supplied.
 * @example
 * ```ts
 * const cfg = await tomlutils.loadToml("./bunfig.toml", {});
 * ```
 */
export async function loadToml<T = TomlTable>(filePath: string, fallback?: T): Promise<T> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      if (fallback !== undefined) return fallback;
      throw new Error(`[tomlutils] TOML file not found: ${filePath}`);
    }
    return Bun.TOML.parse(await file.text()) as T;
  } catch (err: any) {
    if (fallback !== undefined) return fallback;
    throw new Error(`[tomlutils] Failed to load TOML from ${filePath}: ${err.message}`);
  }
}

/**
 * Serialize and write TOML atomically (temp file + rename), creating parent directories.
 * @returns Number of bytes written.
 * @example `await tomlutils.saveToml("./config.toml", { server: { port: 8080 } });`
 */
export async function saveToml(filePath: string, data: unknown): Promise<number> {
  const content = Bun.TOML.stringify(data as any) ?? "";
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    const bytes = await Bun.write(tmp, content);
    await rename(tmp, filePath);
    return bytes;
  } catch (err: any) {
    await rm(tmp, { force: true });
    throw new Error(`[tomlutils.saveToml] Failed writing ${filePath}: ${err.message}`);
  }
}

/**
 * Resolve a dotted key path (array indices allowed: `"servers.0.host"`). `undefined` when absent.
 * @example `tomlutils.getTomlPath(cfg, "database.pool.max"); // 20`
 */
export function getTomlPath(doc: TomlTable, keyPath: string): any {
  if (!doc || typeof doc !== "object") return undefined;
  let cur: any = doc;
  for (const p of keyPath.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

/** `true` when the dotted path resolves to a defined value. @example `tomlutils.hasTomlKey(cfg, "server.tls")` */
export function hasTomlKey(doc: TomlTable, keyPath: string): boolean {
  return getTomlPath(doc, keyPath) !== undefined;
}

/**
 * Set a value at a dotted path, creating intermediate tables. Mutates and returns `doc`.
 * @throws When an intermediate segment exists but is not a table.
 * @example
 * ```ts
 * tomlutils.setTomlPath(cfg, "server.tls.enabled", true);
 * ```
 */
export function setTomlPath<T extends TomlTable>(doc: T, keyPath: string, value: unknown): T {
  const parts = keyPath.split(".");
  let cur: any = doc;
  for (const p of parts.slice(0, -1)) {
    if (cur[p] === undefined) cur[p] = {};
    else if (typeof cur[p] !== "object" || cur[p] === null) {
      throw new Error(`[tomlutils.setTomlPath] "${p}" in "${keyPath}" is not a table`);
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]!] = value;
  return doc;
}

/**
 * Read a value as a string (numbers/booleans are stringified).
 * @example `tomlutils.getString(cfg, "app.name", "untitled");`
 */
export function getString(doc: TomlTable, keyPath: string, fallback = ""): string {
  const val = getTomlPath(doc, keyPath);
  return val !== undefined && val !== null ? String(val) : fallback;
}

/**
 * Read an integer (floats are floored; numeric strings parsed).
 * @example `tomlutils.getInt(cfg, "server.port", 3000);`
 */
export function getInt(doc: TomlTable, keyPath: string, fallback = 0): number {
  const val = getTomlPath(doc, keyPath);
  if (typeof val === "number") return Math.floor(val);
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "string") {
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

/**
 * Read a float (numeric strings parsed).
 * @example `tomlutils.getNumber(cfg, "limits.ratio", 0.5);`
 */
export function getNumber(doc: TomlTable, keyPath: string, fallback = 0): number {
  const val = getTomlPath(doc, keyPath);
  const n = typeof val === "number" ? val : typeof val === "string" ? Number(val) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Read a boolean (`"true"`, `"1"`, `"yes"`, `"on"` strings are truthy).
 * @example `tomlutils.getBool(cfg, "server.enabled");`
 */
export function getBool(doc: TomlTable, keyPath: string, fallback = false): boolean {
  const val = getTomlPath(doc, keyPath);
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") return ["true", "1", "yes", "on"].includes(val.toLowerCase());
  return fallback;
}

/**
 * Read an array (fallback when the value is not an array).
 * @example `tomlutils.getArray<string>(cfg, "server.cors_origins");`
 */
export function getArray<T = any>(doc: TomlTable, keyPath: string, fallback: T[] = []): T[] {
  const val = getTomlPath(doc, keyPath);
  return Array.isArray(val) ? (val as T[]) : fallback;
}

/**
 * Read a sub-table (fallback when the value is not a plain table).
 * @example `tomlutils.getTable(cfg, "database");`
 */
export function getTable<T extends TomlTable = TomlTable>(doc: TomlTable, keyPath: string, fallback = {} as T): T {
  const val = getTomlPath(doc, keyPath);
  return val && typeof val === "object" && !Array.isArray(val) ? (val as T) : fallback;
}

/**
 * Deep-merge TOML tables: nested tables merge recursively; arrays and scalars in `override` win.
 * Returns a new object; inputs are untouched.
 * @example
 * ```ts
 * tomlutils.mergeToml({ server: { port: 80, host: "0.0.0.0" } }, { server: { port: 8080 } });
 * // { server: { port: 8080, host: "0.0.0.0" } }
 * ```
 */
export function mergeToml<T extends TomlTable = TomlTable>(base: TomlTable, override: TomlTable): T {
  const out: TomlTable = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const prev = out[k];
    const bothTables = isTable(prev) && isTable(v);
    out[k] = bothTables ? mergeToml(prev, v) : v;
  }
  return out as T;
}

function isTable(v: unknown): v is TomlTable {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

/**
 * Load several TOML files in order and deep-merge them (later files win). Missing files are skipped,
 * which makes the classic `default.toml` → `local.toml` override pattern one line.
 * @throws When a file exists but contains invalid TOML.
 * @example
 * ```ts
 * const cfg = await tomlutils.loadTomlLayers(["./config/default.toml", "./config/local.toml"]);
 * ```
 */
export async function loadTomlLayers<T extends TomlTable = TomlTable>(filePaths: string[]): Promise<T> {
  let merged: TomlTable = {};
  for (const p of filePaths) {
    const file = Bun.file(p);
    if (!(await file.exists())) continue;
    try {
      merged = mergeToml(merged, Bun.TOML.parse(await file.text()) as TomlTable);
    } catch (err: any) {
      throw new Error(`[tomlutils.loadTomlLayers] Invalid TOML in ${p}: ${err.message}`);
    }
  }
  return merged as T;
}

export const tomlutils = {
  parse: Bun.TOML.parse,
  stringify: Bun.TOML.stringify,
  parseToml,
  tryParseToml,
  stringifyToml,
  loadToml,
  saveToml,
  loadTomlLayers,
  getTomlPath,
  hasTomlKey,
  setTomlPath,
  getString,
  getInt,
  getNumber,
  getBool,
  getArray,
  getTable,
  mergeToml,
};
