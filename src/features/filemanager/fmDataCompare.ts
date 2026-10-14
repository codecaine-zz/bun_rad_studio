/**
 * "Compare data files": two JSON, JSON5, YAML or TOML files read with Bun's own parsers and compared by meaning
 * (key order, comments, quoting and formatting do not matter). `Bun.deepEquals` gives the quick answer; a structured
 * walk lists what changed, and what is only on one side.
 */
import { promises as fsp } from "fs";
import { absolutePath, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { FmError, describeFsError, extensionOf } from "./fmPaths";

export const COMPARE_MAX_BYTES = 5 * 1024 * 1024;
export const COMPARE_MAX_DEPTH = 100;
export const COMPARE_MAX_ENTRIES = 300;
const VALUE_CHARS = 200;

export type DataKind = "JSON" | "JSON5" | "YAML" | "TOML";

const KIND_BY_EXT: Record<string, DataKind> = { json: "JSON", jsonc: "JSON5", json5: "JSON5", yaml: "YAML", yml: "YAML", toml: "TOML" };

/** Can this file name be compared (by its extension)? */
export const comparableKind = (name: string): DataKind | null => KIND_BY_EXT[extensionOf(name).toLowerCase()] ?? null;

export interface Difference {
  path: string;
  left?: string;
  right?: string;
  note?: string;
}

export interface CompareResult {
  /** The same data once key order and formatting are ignored (`Bun.deepEquals`). */
  identical: boolean;
  /** The files are byte for byte the same. */
  sameBytes: boolean;
  left: { name: string; kind: DataKind; bytes: number };
  right: { name: string; kind: DataKind; bytes: number };
  changed: Difference[];
  onlyLeft: Difference[];
  onlyRight: Difference[];
  /** How many differences there are in total, which can be more than is listed. */
  total: number;
  truncated: boolean;
  notes: string[];
}

/** Turns what a parser returned into plain JSON-like data: dates become text, bigints and odd numbers become text. */
export function toPlain(value: unknown, depth = 0): unknown {
  if (depth > COMPARE_MAX_DEPTH) throw new FmError("TOO_DEEP", `This data is nested more than ${COMPARE_MAX_DEPTH} levels deep, which is more than can be compared.`);
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return `${value}`;
  if (typeof value === "number") return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : String(value);
  if (value instanceof Date) return value.toISOString();
  // TOML dates and times are Temporal objects in Bun: they say what they are with toJSON() ("2024-01-15T10:30:00Z")
  if (typeof value === "object" && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null && typeof (value as { toJSON?: unknown }).toJSON === "function") return toPlain((value as { toJSON(): unknown }).toJSON(), depth + 1);
  if (Array.isArray(value)) return value.map((v) => toPlain(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toPlain(v, depth + 1);
    return out;
  }
  return value;
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const typeName = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "a list" : isObject(v) ? "a group of settings" : typeof v === "string" ? "text" : typeof v === "number" ? "a number" : typeof v === "boolean" ? "true/false" : typeof v);

function show(v: unknown): string {
  const text = JSON.stringify(v) ?? "null";
  return text.length > VALUE_CHARS ? `${text.slice(0, VALUE_CHARS)}…` : text;
}

const SIMPLE_KEY = /^[A-Za-z_$][\w$]*$/;
const keyPath = (parent: string, key: string) => (SIMPLE_KEY.test(key) ? (parent ? `${parent}.${key}` : key) : `${parent}[${JSON.stringify(key)}]`);

/** Parses one file's text with the parser for its kind. Errors are explained in plain words. */
export function parseDataText(text: string, kind: DataKind, name: string): unknown {
  const clean = text.replace(/^\uFEFF/, "");
  try {
    if (kind === "JSON") return JSON.parse(clean);
    if (kind === "JSON5") return Bun.JSON5.parse(clean);
    if (kind === "YAML") return Bun.YAML.parse(clean);
    return Bun.TOML.parse(clean);
  } catch (err: any) {
    const why = String(err?.message ?? "it isn't valid").replace(/\s+/g, " ").slice(0, 200);
    throw new FmError("BAD_DATA", `"${name}" couldn't be read as ${kind}: ${why}`);
  }
}

/** Walks two parsed values and collects what differs. Stops listing after COMPARE_MAX_ENTRIES (the total keeps counting). */
export function diffValues(left: unknown, right: unknown): Pick<CompareResult, "changed" | "onlyLeft" | "onlyRight" | "total" | "truncated"> {
  const changed: Difference[] = [];
  const onlyLeft: Difference[] = [];
  const onlyRight: Difference[] = [];
  let total = 0;
  const add = (list: Difference[], d: Difference) => {
    total++;
    if (changed.length + onlyLeft.length + onlyRight.length < COMPARE_MAX_ENTRIES) list.push(d);
  };
  const walk = (path: string, a: unknown, b: unknown) => {
    if (isObject(a) && isObject(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        const p = keyPath(path, k);
        const inA = Object.hasOwn(a, k);
        const inB = Object.hasOwn(b, k);
        if (inA && inB) walk(p, a[k], b[k]);
        else if (inA) add(onlyLeft, { path: p, left: show(a[k]) });
        else add(onlyRight, { path: p, right: show(b[k]) });
      }
    } else if (Array.isArray(a) && Array.isArray(b)) {
      const common = Math.min(a.length, b.length);
      for (let i = 0; i < common; i++) walk(`${path}[${i}]`, a[i], b[i]);
      for (let i = common; i < a.length; i++) add(onlyLeft, { path: `${path}[${i}]`, left: show(a[i]) });
      for (let i = common; i < b.length; i++) add(onlyRight, { path: `${path}[${i}]`, right: show(b[i]) });
    } else if (!Bun.deepEquals(a, b, true)) {
      const same = typeName(a) === typeName(b);
      add(changed, { path: path || "(the whole file)", left: show(a), right: show(b), ...(same ? {} : { note: `${typeName(a)} became ${typeName(b)}` }) });
    }
  };
  walk("", left, right);
  return { changed, onlyLeft, onlyRight, total, truncated: total > changed.length + onlyLeft.length + onlyRight.length };
}

async function load(ctx: FmContext, input: unknown): Promise<{ name: string; kind: DataKind; bytes: Buffer; data: unknown }> {
  const path = absolutePath(ctx, input);
  const name = pathApi(ctx).basename(path);
  const kind = comparableKind(name);
  if (!kind) throw new FmError("NOT_DATA", `"${name}" isn't a JSON, JSON5, YAML or TOML file, so it can't be compared here.`);
  try {
    const st = await fsp.stat(path);
    if (!st.isFile()) throw new FmError("NOT_A_FILE", `"${name}" isn't an ordinary file.`);
    if (st.size > COMPARE_MAX_BYTES) throw new FmError("TOO_LARGE", `"${name}" is bigger than ${COMPARE_MAX_BYTES / 1048576} MB, which is more than can be compared here.`);
    const bytes = await fsp.readFile(path);
    return { name, kind, bytes, data: toPlain(parseDataText(bytes.toString("utf8"), kind, name)) };
  } catch (err) {
    if (err instanceof FmError) throw err;
    const d = describeFsError(err, "read that file");
    throw new FmError(d.code, d.message);
  }
}

/** Compares two data files by meaning. */
export async function compareDataFiles(ctx: FmContext, leftPath: unknown, rightPath: unknown): Promise<CompareResult> {
  const left = await load(ctx, leftPath);
  const right = await load(ctx, rightPath);
  const identical = Bun.deepEquals(left.data, right.data, true);
  const diff = identical ? { changed: [], onlyLeft: [], onlyRight: [], total: 0, truncated: false } : diffValues(left.data, right.data);
  const notes: string[] = [];
  if (left.kind !== right.kind) notes.push(`One file is ${left.kind} and the other is ${right.kind}. They were compared by what they say, not by how they are written.`);
  if (identical && !left.bytes.equals(right.bytes)) notes.push("The files are written differently (order, spacing, comments or quoting) but say exactly the same thing.");
  if (diff.truncated) notes.push(`${diff.total.toLocaleString("en-US")} differences were found; only the first ${COMPARE_MAX_ENTRIES} are listed.`);
  return {
    identical, sameBytes: left.bytes.equals(right.bytes),
    left: { name: left.name, kind: left.kind, bytes: left.bytes.length }, right: { name: right.name, kind: right.kind, bytes: right.bytes.length },
    ...diff, notes,
  };
}

export const dataCompareOperations: Record<string, FmHandler> = {
  async "data/compare"(ctx, b) {
    return { ...(await compareDataFiles(ctx, b.left, b.right)) };
  },
};
