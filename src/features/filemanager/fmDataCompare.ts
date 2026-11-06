/**
 * "Compare data files": two JSON, JSON5, YAML or TOML files read with Bun's own parsers and compared by meaning
 * (key order, comments, quoting and formatting do not matter). `Bun.deepEquals` gives the quick answer; a structured
 * walk lists what changed, and what is only on one side.
 */
import { promises as fsp } from "fs";
import {
  absolutePath,
  pathApi,
  type FmContext,
  type FmHandler,
} from "./fmCore";
import { FmError, describeFsError, extensionOf } from "./fmPaths";
import { extractReadableDocumentText } from "./fmPreview";

/** Maximum file size in bytes accepted when comparing two structured data files. */
export const COMPARE_MAX_BYTES = 5 * 1024 * 1024;
/** Maximum object/array nesting depth traversed when diffing two structured data trees. */
export const COMPARE_MAX_DEPTH = 100;
/** Maximum number of individual key/index differences returned in a structured data comparison. */
export const COMPARE_MAX_ENTRIES = 300;
const VALUE_CHARS = 200;

/** Structured data format family (`JSON`, `JSON5`, `YAML`, or `TOML`) supported by semantic data comparison. */
export type DataKind = "JSON" | "JSON5" | "YAML" | "TOML";

const KIND_BY_EXT: Record<string, DataKind> = {
  json: "JSON",
  jsonc: "JSON5",
  json5: "JSON5",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
};

/** Can this file name be compared (by its extension)? */
export const comparableKind = (name: string): DataKind | null =>
  KIND_BY_EXT[extensionOf(name).toLowerCase()] ?? null;

/** A single path-level difference between two structured data files. */
export interface Difference {
  path: string;
  left?: string;
  right?: string;
  note?: string;
}

/** Semantic comparison report for two structured data files, including changed, left-only, and right-only paths. */
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
  if (depth > COMPARE_MAX_DEPTH)
    throw new FmError(
      "TOO_DEEP",
      `This data is nested more than ${COMPARE_MAX_DEPTH} levels deep, which is more than can be compared.`,
    );
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return `${value}`;
  if (typeof value === "number")
    return Number.isFinite(value)
      ? Object.is(value, -0)
        ? 0
        : value
      : String(value);
  if (value instanceof Date) return value.toISOString();
  // TOML dates and times are Temporal objects in Bun: they say what they are with toJSON() ("2024-01-15T10:30:00Z")
  if (
    typeof value === "object" &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null &&
    typeof (value as { toJSON?: unknown }).toJSON === "function"
  )
    return toPlain((value as { toJSON(): unknown }).toJSON(), depth + 1);
  if (Array.isArray(value)) return value.map((v) => toPlain(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = toPlain(v, depth + 1);
    return out;
  }
  return value;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const typeName = (v: unknown): string =>
  v === null
    ? "null"
    : Array.isArray(v)
      ? "a list"
      : isObject(v)
        ? "a group of settings"
        : typeof v === "string"
          ? "text"
          : typeof v === "number"
            ? "a number"
            : typeof v === "boolean"
              ? "true/false"
              : typeof v;

function show(v: unknown): string {
  const text = JSON.stringify(v) ?? "null";
  return text.length > VALUE_CHARS ? `${text.slice(0, VALUE_CHARS)}…` : text;
}

const SIMPLE_KEY = /^[A-Za-z_$][\w$]*$/;
const keyPath = (parent: string, key: string) =>
  SIMPLE_KEY.test(key)
    ? parent
      ? `${parent}.${key}`
      : key
    : `${parent}[${JSON.stringify(key)}]`;

/** Parses one file's text with the parser for its kind. Errors are explained in plain words. */
export function parseDataText(
  text: string,
  kind: DataKind,
  name: string,
): unknown {
  const clean = text.replace(/^\uFEFF/, "");
  try {
    if (kind === "JSON") return JSON.parse(clean);
    if (kind === "JSON5") return Bun.JSON5.parse(clean);
    if (kind === "YAML") return Bun.YAML.parse(clean);
    return Bun.TOML.parse(clean);
  } catch (err: any) {
    const why = String(err?.message ?? "it isn't valid")
      .replace(/\s+/g, " ")
      .slice(0, 200);
    throw new FmError(
      "BAD_DATA",
      `"${name}" couldn't be read as ${kind}: ${why}`,
    );
  }
}

/** Walks two parsed values and collects what differs. Stops listing after COMPARE_MAX_ENTRIES (the total keeps counting). */
export function diffValues(
  left: unknown,
  right: unknown,
): Pick<
  CompareResult,
  "changed" | "onlyLeft" | "onlyRight" | "total" | "truncated"
> {
  const changed: Difference[] = [];
  const onlyLeft: Difference[] = [];
  const onlyRight: Difference[] = [];
  let total = 0;
  const add = (list: Difference[], d: Difference) => {
    total++;
    if (
      changed.length + onlyLeft.length + onlyRight.length <
      COMPARE_MAX_ENTRIES
    )
      list.push(d);
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
      for (let i = common; i < a.length; i++)
        add(onlyLeft, { path: `${path}[${i}]`, left: show(a[i]) });
      for (let i = common; i < b.length; i++)
        add(onlyRight, { path: `${path}[${i}]`, right: show(b[i]) });
    } else if (!Bun.deepEquals(a, b, true)) {
      const same = typeName(a) === typeName(b);
      add(changed, {
        path: path || "(the whole file)",
        left: show(a),
        right: show(b),
        ...(same ? {} : { note: `${typeName(a)} became ${typeName(b)}` }),
      });
    }
  };
  walk("", left, right);
  return {
    changed,
    onlyLeft,
    onlyRight,
    total,
    truncated: total > changed.length + onlyLeft.length + onlyRight.length,
  };
}

async function load(
  ctx: FmContext,
  input: unknown,
): Promise<{ name: string; kind: DataKind; bytes: Buffer; data: unknown }> {
  const path = absolutePath(ctx, input);
  const name = pathApi(ctx).basename(path);
  const kind = comparableKind(name);
  if (!kind)
    throw new FmError(
      "NOT_DATA",
      `"${name}" isn't a JSON, JSON5, YAML or TOML file, so it can't be compared here.`,
    );
  try {
    const st = await fsp.stat(path);
    if (!st.isFile())
      throw new FmError("NOT_A_FILE", `"${name}" isn't an ordinary file.`);
    if (st.size > COMPARE_MAX_BYTES)
      throw new FmError(
        "TOO_LARGE",
        `"${name}" is bigger than ${COMPARE_MAX_BYTES / 1048576} MB, which is more than can be compared here.`,
      );
    const bytes = await fsp.readFile(path);
    return {
      name,
      kind,
      bytes,
      data: toPlain(parseDataText(bytes.toString("utf8"), kind, name)),
    };
  } catch (err) {
    if (err instanceof FmError) throw err;
    const d = describeFsError(err, "read that file");
    throw new FmError(d.code, d.message);
  }
}

/** Compares two data files by meaning. */
export async function compareDataFiles(
  ctx: FmContext,
  leftPath: unknown,
  rightPath: unknown,
): Promise<CompareResult> {
  const left = await load(ctx, leftPath);
  const right = await load(ctx, rightPath);
  const identical = Bun.deepEquals(left.data, right.data, true);
  const diff = identical
    ? { changed: [], onlyLeft: [], onlyRight: [], total: 0, truncated: false }
    : diffValues(left.data, right.data);
  const notes: string[] = [];
  if (left.kind !== right.kind)
    notes.push(
      `One file is ${left.kind} and the other is ${right.kind}. They were compared by what they say, not by how they are written.`,
    );
  if (identical && !left.bytes.equals(right.bytes))
    notes.push(
      "The files are written differently (order, spacing, comments or quoting) but say exactly the same thing.",
    );
  if (diff.truncated)
    notes.push(
      `${diff.total.toLocaleString("en-US")} differences were found; only the first ${COMPARE_MAX_ENTRIES} are listed.`,
    );
  return {
    identical,
    sameBytes: left.bytes.equals(right.bytes),
    left: { name: left.name, kind: left.kind, bytes: left.bytes.length },
    right: { name: right.name, kind: right.kind, bytes: right.bytes.length },
    ...diff,
    notes,
  };
}

/** File Manager API handlers for semantic structured data comparison (`data/compare`) and line-by-line text comparison (`text/compare`). */
export const dataCompareOperations: Record<string, FmHandler> = {
  async "data/compare"(ctx, b) {
    return { ...(await compareDataFiles(ctx, b.left, b.right)) };
  },
  async "text/compare"(ctx, b) {
    return { ...(await compareTextFiles(ctx, b.left, b.right)) };
  },
};

/** Maximum file size in bytes accepted when comparing two plain-text or document files. */
export const TEXT_COMPARE_MAX_BYTES = 2 * 1024 * 1024;
/** Maximum number of lines per file compared in the LCS line-by-line text diff. */
export const TEXT_COMPARE_MAX_LINES = 2000;

/** A single unchanged, added, or deleted line in a side-by-side/unified text comparison. */
export interface TextDiffRow {
  type: "same" | "add" | "del";
  leftLine?: number;
  rightLine?: number;
  text: string;
}

/** Line-by-line diff rows, similarity percentage, line counts, and unified patch for two compared text files. */
export interface TextCompareResult {
  identical: boolean;
  left: { name: string; path: string; lines: number; bytes: number };
  right: { name: string; path: string; lines: number; bytes: number };
  added: number;
  removed: number;
  unchanged: number;
  similarityPct: number;
  truncated: boolean;
  rows: TextDiffRow[];
  unifiedPatch: string;
}

async function loadReadableTextForCompare(
  ctx: FmContext,
  input: unknown,
): Promise<{ name: string; path: string; text: string; bytes: number }> {
  const path = absolutePath(ctx, input);
  const name = pathApi(ctx).basename(path);
  try {
    const st = await fsp.stat(path);
    if (st.isDirectory()) {
      const extracted = await extractReadableDocumentText(path, 200_000);
      if (extracted !== null) {
        return {
          name,
          path,
          text: extracted,
          bytes: Buffer.byteLength(extracted, "utf8"),
        };
      }
      throw new FmError(
        "NOT_A_FILE",
        `"${name}" is a folder and not a document package, so it can't be text-compared here.`,
      );
    }
    if (!st.isFile())
      throw new FmError("NOT_A_FILE", `"${name}" isn't an ordinary file.`);
    const extracted = await extractReadableDocumentText(path, 200_000);
    if (extracted !== null) {
      return { name, path, text: extracted, bytes: st.size };
    }
    if (st.size > TEXT_COMPARE_MAX_BYTES) {
      throw new FmError(
        "TOO_LARGE",
        `"${name}" is bigger than ${TEXT_COMPARE_MAX_BYTES / 1048576} MB, which is more than can be compared line-by-line.`,
      );
    }
    const buf = await fsp.readFile(path);
    const checkLen = Math.min(buf.length, 4096);
    for (let i = 0; i < checkLen; i++) {
      if (buf[i] === 0) {
        throw new FmError(
          "BINARY_FILE",
          `"${name}" looks like a binary file rather than readable text or code.`,
        );
      }
    }
    return {
      name,
      path,
      text: buf.toString("utf8").replace(/^\uFEFF/, ""),
      bytes: buf.length,
    };
  } catch (err) {
    if (err instanceof FmError) throw err;
    const d = describeFsError(err, "read that file");
    throw new FmError(d.code, d.message);
  }
}

/** Computes line-by-line LCS diff with prefix/suffix trimming for speed. */
export function computeLineDiff(
  leftLines: string[],
  rightLines: string[],
  maxMidLines = TEXT_COMPARE_MAX_LINES,
): TextDiffRow[] {
  let start = 0;
  while (
    start < leftLines.length &&
    start < rightLines.length &&
    leftLines[start] === rightLines[start]
  ) {
    start++;
  }
  let endLeft = leftLines.length - 1;
  let endRight = rightLines.length - 1;
  while (
    endLeft >= start &&
    endRight >= start &&
    leftLines[endLeft] === rightLines[endRight]
  ) {
    endLeft--;
    endRight--;
  }

  const rows: TextDiffRow[] = [];
  for (let i = 0; i < start; i++) {
    rows.push({
      type: "same",
      leftLine: i + 1,
      rightLine: i + 1,
      text: leftLines[i]!,
    });
  }

  const midLeft = leftLines.slice(
    start,
    Math.min(endLeft + 1, start + maxMidLines),
  );
  const midRight = rightLines.slice(
    start,
    Math.min(endRight + 1, start + maxMidLines),
  );
  const n = midLeft.length;
  const m = midRight.length;

  if (n === 0 && m === 0) {
    // Only prefix/suffix
  } else if (n === 0) {
    for (let j = 0; j < m; j++) {
      rows.push({ type: "add", rightLine: start + j + 1, text: midRight[j]! });
    }
  } else if (m === 0) {
    for (let i = 0; i < n; i++) {
      rows.push({ type: "del", leftLine: start + i + 1, text: midLeft[i]! });
    }
  } else if (n * m <= 1_200_000) {
    // Standard 2D LCS matrix using Uint16Array for speed and compact memory
    const cols = m + 1;
    const dp = new Uint16Array((n + 1) * cols);
    for (let i = n - 1; i >= 0; i--) {
      const a = midLeft[i];
      const rowOff = i * cols;
      const nextRowOff = (i + 1) * cols;
      for (let j = m - 1; j >= 0; j--) {
        dp[rowOff + j] =
          a === midRight[j]
            ? dp[nextRowOff + j + 1]! + 1
            : Math.max(dp[nextRowOff + j]!, dp[rowOff + j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midLeft[i] === midRight[j]) {
        rows.push({
          type: "same",
          leftLine: start + i + 1,
          rightLine: start + j + 1,
          text: midLeft[i]!,
        });
        i++;
        j++;
      } else if (dp[(i + 1) * cols + j]! >= dp[i * cols + j + 1]!) {
        rows.push({ type: "del", leftLine: start + i + 1, text: midLeft[i]! });
        i++;
      } else {
        rows.push({
          type: "add",
          rightLine: start + j + 1,
          text: midRight[j]!,
        });
        j++;
      }
    }
    while (i < n) {
      rows.push({ type: "del", leftLine: start + i + 1, text: midLeft[i]! });
      i++;
    }
    while (j < m) {
      rows.push({ type: "add", rightLine: start + j + 1, text: midRight[j]! });
      j++;
    }
  } else {
    // Fallback greedy anchor matching for very large middle sections
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midLeft[i] === midRight[j]) {
        rows.push({
          type: "same",
          leftLine: start + i + 1,
          rightLine: start + j + 1,
          text: midLeft[i]!,
        });
        i++;
        j++;
      } else if (i < n) {
        rows.push({ type: "del", leftLine: start + i + 1, text: midLeft[i]! });
        i++;
      } else if (j < m) {
        rows.push({
          type: "add",
          rightLine: start + j + 1,
          text: midRight[j]!,
        });
        j++;
      }
    }
  }

  const suffixCount = leftLines.length - 1 - endLeft;
  for (let k = 0; k < suffixCount; k++) {
    const lIdx = endLeft + 1 + k;
    const rIdx = endRight + 1 + k;
    rows.push({
      type: "same",
      leftLine: lIdx + 1,
      rightLine: rIdx + 1,
      text: leftLines[lIdx]!,
    });
  }
  return rows;
}

function buildUnifiedPatch(
  leftName: string,
  rightName: string,
  rows: TextDiffRow[],
): string {
  const out = [`--- a/${leftName}`, `+++ b/${rightName}`];
  const hasChanges = rows.some((r) => r.type !== "same");
  if (!hasChanges) return out.join("\n") + "\n";
  // Emit context around changed lines (3 lines of context)
  const keep = new Uint8Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.type !== "same") {
      const lo = Math.max(0, i - 3);
      const hi = Math.min(rows.length - 1, i + 3);
      for (let k = lo; k <= hi; k++) keep[k] = 1;
    }
  }
  let inHunk = false;
  for (let i = 0; i < rows.length; i++) {
    if (!keep[i]) {
      inHunk = false;
      continue;
    }
    const r = rows[i]!;
    if (!inHunk) {
      out.push(`@@ -${r.leftLine ?? 1} +${r.rightLine ?? 1} @@`);
      inHunk = true;
    }
    const prefix = r.type === "add" ? "+" : r.type === "del" ? "-" : " ";
    out.push(`${prefix}${r.text}`);
  }
  return out.join("\n") + "\n";
}

/** Compares two text, code, or document files line by line. */
export async function compareTextFiles(
  ctx: FmContext,
  leftPath: unknown,
  rightPath: unknown,
): Promise<TextCompareResult> {
  const left = await loadReadableTextForCompare(ctx, leftPath);
  const right = await loadReadableTextForCompare(ctx, rightPath);
  const normLeft = left.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const normRight = right.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const identical = normLeft === normRight;
  const rawLeftLines = normLeft.length === 0 ? [] : normLeft.split("\n");
  const rawRightLines = normRight.length === 0 ? [] : normRight.split("\n");
  const truncated =
    rawLeftLines.length > TEXT_COMPARE_MAX_LINES ||
    rawRightLines.length > TEXT_COMPARE_MAX_LINES;
  const allRows = computeLineDiff(
    rawLeftLines,
    rawRightLines,
    TEXT_COMPARE_MAX_LINES,
  );

  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const r of allRows) {
    if (r.type === "add") added++;
    else if (r.type === "del") removed++;
    else unchanged++;
  }
  const totalLines = Math.max(1, rawLeftLines.length + rawRightLines.length);
  const similarityPct = identical
    ? 100
    : Math.min(99, Math.round(((2 * unchanged) / totalLines) * 100));
  const unifiedPatch = buildUnifiedPatch(left.name, right.name, allRows);
  let rows = allRows;
  if (allRows.length > TEXT_COMPARE_MAX_LINES) {
    const firstChange = allRows.findIndex((r) => r.type !== "same");
    const winStart = firstChange > 20 ? firstChange - 20 : 0;
    rows = allRows.slice(winStart, winStart + TEXT_COMPARE_MAX_LINES);
  }

  return {
    identical,
    left: {
      name: left.name,
      path: left.path,
      lines: rawLeftLines.length,
      bytes: left.bytes,
    },
    right: {
      name: right.name,
      path: right.path,
      lines: rawRightLines.length,
      bytes: right.bytes,
    },
    added,
    removed,
    unchanged,
    similarityPct,
    truncated,
    rows,
    unifiedPatch,
  };
}
