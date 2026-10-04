/**
 * diffutils — Text & sequence diffing, unified patches, and patch application.
 *
 * Core is a generic LCS diff over any array (`diffArrays`) with common prefix/suffix trimming,
 * specialised for lines, words and characters. `unifiedDiff` emits real Git-style hunks with
 * configurable context and correct line numbers; `applyPatch` replays them with context
 * verification — together they form a complete diff → patch → apply round-trip.
 *
 * @example
 * import { diffutils } from "./src/features/rad/index.ts";
 * const patch = diffutils.unifiedDiff("a\nb\nc", "a\nB\nc", "notes.txt");
 * diffutils.applyPatch("a\nb\nc", patch); // "a\nB\nc"
 */
import { colorText, colors } from "../../../shared/colors.ts";

/** Kind of change. */
export type DiffType = "add" | "delete" | "equal";

/** Line-level change (legacy shape returned by {@link diffLines}). */
export interface DiffChange {
  type: DiffType;
  line: string;
}

/** Generic change returned by {@link diffArrays}, {@link diffWords} and {@link diffChars}. */
export interface DiffOp<T> {
  type: DiffType;
  value: T;
}

/** Options for line diffs. */
export interface DiffLineOptions {
  /** Compare lines ignoring leading/trailing and repeated whitespace. */
  ignoreWhitespace?: boolean;
  /** Compare lines case-insensitively. */
  ignoreCase?: boolean;
}

/** Options for {@link unifiedDiff}. */
export interface UnifiedDiffOptions extends DiffLineOptions {
  /** Unchanged lines shown around each change. Default `3`. */
  context?: number;
  /** Label for the new file (defaults to the old filename). */
  newFilename?: string;
}

/** Summary counts from {@link diffStats}. */
export interface DiffStats {
  added: number;
  deleted: number;
  unchanged: number;
}

/** Parsed hunk from {@link parseUnifiedDiff}. */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

function lcsBacktrack<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): DiffOp<T>[] {
  const n = a.length, m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) dp[i + 1]![j + 1] = eq(a[i]!, b[j]!) ? dp[i]![j]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  }
  const ops: DiffOp<T>[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && eq(a[i - 1]!, b[j - 1]!)) { ops.push({ type: "equal", value: a[i - 1]! }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) { ops.push({ type: "add", value: b[j - 1]! }); j--; }
    else { ops.push({ type: "delete", value: a[i - 1]! }); i--; }
  }
  return ops.reverse();
}

/**
 * Minimal LCS diff of two sequences. Common prefix/suffix are trimmed first, so typical
 * edits on large inputs stay fast. Deletions precede additions within a change.
 * @example diffutils.diffArrays([1, 2, 3], [1, 3, 4]); // equal 1, delete 2, equal 3, add 4
 */
export function diffArrays<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = Object.is): DiffOp<T>[] {
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start]!, b[start]!)) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1]!, b[endB - 1]!)) { endA--; endB--; }
  const head = a.slice(0, start).map((value) => ({ type: "equal" as const, value }));
  const tail = a.slice(endA).map((value) => ({ type: "equal" as const, value }));
  const middle = groupDeletesFirst(lcsBacktrack(a.slice(start, endA), b.slice(start, endB), eq));
  return [...head, ...middle, ...tail];
}

function groupDeletesFirst<T>(ops: DiffOp<T>[]): DiffOp<T>[] {
  const out: DiffOp<T>[] = [];
  for (let i = 0; i < ops.length; ) {
    if (ops[i]!.type === "equal") { out.push(ops[i++]!); continue; }
    const run: DiffOp<T>[] = [];
    while (i < ops.length && ops[i]!.type !== "equal") run.push(ops[i++]!);
    out.push(...run.filter((o) => o.type === "delete"), ...run.filter((o) => o.type === "add"));
  }
  return out;
}

function lineComparator(opts: DiffLineOptions): (x: string, y: string) => boolean {
  const norm = (s: string) => {
    let v = opts.ignoreWhitespace ? s.trim().replace(/\s+/g, " ") : s;
    if (opts.ignoreCase) v = v.toLowerCase();
    return v;
  };
  return opts.ignoreWhitespace || opts.ignoreCase ? (x, y) => norm(x) === norm(y) : (x, y) => x === y;
}

/**
 * Line diff (`\n` / `\r\n` aware).
 * @example diffutils.diffLines("a\nb", "a\nc"); // [{type:"equal",line:"a"},{type:"delete",line:"b"},{type:"add",line:"c"}]
 */
export function diffLines(oldText: string, newText: string, options: DiffLineOptions = {}): DiffChange[] {
  return diffArrays(oldText.split(/\r?\n/), newText.split(/\r?\n/), lineComparator(options)).map((o) => ({ type: o.type, line: o.value }));
}

/** Word-level diff (whitespace tokens preserved so `join("")` rebuilds the text). @example diffutils.diffWords("the cat", "the dog"); */
export function diffWords(oldText: string, newText: string): DiffOp<string>[] {
  const tok = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  return diffArrays(tok(oldText), tok(newText));
}

/** Character-level (grapheme-safe) diff. @example diffutils.diffChars("abc", "abd"); */
export function diffChars(oldText: string, newText: string): DiffOp<string>[] {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const split = (s: string) => Array.from(seg.segment(s), (x) => x.segment);
  return diffArrays(split(oldText), split(newText));
}

/** Count added / deleted / unchanged items. @example diffutils.diffStats(diffutils.diffLines("a", "b")); // { added: 1, deleted: 1, unchanged: 0 } */
export function diffStats(changes: readonly { type: DiffType }[]): DiffStats {
  const s: DiffStats = { added: 0, deleted: 0, unchanged: 0 };
  for (const c of changes) s[c.type === "add" ? "added" : c.type === "delete" ? "deleted" : "unchanged"]++;
  return s;
}

/** Line similarity `2·equal / (old + new)` in `0..1`. @example diffutils.similarityRatio("a\nb", "a\nc"); // 0.5 */
export function similarityRatio(oldText: string, newText: string): number {
  const s = diffStats(diffLines(oldText, newText));
  const total = s.deleted + s.added + 2 * s.unchanged;
  return total === 0 ? 1 : (2 * s.unchanged) / total;
}

function markContext(changes: DiffChange[], context: number): boolean[] {
  const keep = new Array<boolean>(changes.length).fill(false);
  let lastChange = -Infinity;
  for (let i = 0; i < changes.length; i++) {
    if (changes[i]!.type !== "equal") lastChange = i;
    keep[i] = i - lastChange <= context;
  }
  let nextChange = Infinity;
  for (let i = changes.length - 1; i >= 0; i--) {
    if (changes[i]!.type !== "equal") nextChange = i;
    keep[i] = keep[i]! || nextChange - i <= context;
  }
  return keep;
}

function buildHunks(changes: DiffChange[], context: number): DiffHunk[] {
  const keep = markContext(changes, context);
  const hunks: DiffHunk[] = [];
  let oldNo = 1, newNo = 1, cur: DiffHunk | null = null;
  changes.forEach((c, idx) => {
    if (keep[idx]) {
      if (!cur) { cur = { oldStart: oldNo, oldLines: 0, newStart: newNo, newLines: 0, lines: [] }; hunks.push(cur); }
      cur.lines.push((c.type === "add" ? "+" : c.type === "delete" ? "-" : " ") + c.line);
      if (c.type !== "add") cur.oldLines++;
      if (c.type !== "delete") cur.newLines++;
    } else cur = null;
    if (c.type !== "add") oldNo++;
    if (c.type !== "delete") newNo++;
  });
  return hunks;
}

function hunkHeader(h: DiffHunk): string {
  const oldStart = h.oldLines === 0 ? h.oldStart - 1 : h.oldStart;
  const newStart = h.newLines === 0 ? h.newStart - 1 : h.newStart;
  return `@@ -${oldStart},${h.oldLines} +${newStart},${h.newLines} @@`;
}

/**
 * Git-style unified diff with real hunks (`context` lines around each change). Returns `""` when
 * the inputs are identical.
 * @example diffutils.unifiedDiff("alpha\nbeta", "alpha\ngamma", "f.txt");
 * // "--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,2 @@\n alpha\n-beta\n+gamma"
 */
export function unifiedDiff(oldText: string, newText: string, filename = "file.txt", options: UnifiedDiffOptions = {}): string {
  const hunks = buildHunks(diffLines(oldText, newText, options), options.context ?? 3);
  if (hunks.length === 0) return "";
  const header = `--- a/${filename}\n+++ b/${options.newFilename ?? filename}`;
  return [header, ...hunks.flatMap((h) => [hunkHeader(h), ...h.lines])].join("\n");
}

/**
 * Parse the hunks of a unified diff (file headers are skipped).
 * @throws on malformed `@@` headers.
 * @example diffutils.parseUnifiedDiff(patch)[0]?.oldStart;
 */
export function parseUnifiedDiff(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let cur: DiffHunk | null = null;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!m) throw new Error(`[diffutils.parseUnifiedDiff] Malformed hunk header: ${line}`);
      cur = { oldStart: +m[1]!, oldLines: m[2] === undefined ? 1 : +m[2], newStart: +m[3]!, newLines: m[4] === undefined ? 1 : +m[4], lines: [] };
      hunks.push(cur);
    } else if (cur && /^[ +\-]/.test(line) && !line.startsWith("---") && !line.startsWith("+++")) cur.lines.push(line);
    else if (cur && line === "") cur.lines.push(" ");
  }
  return hunks;
}

/**
 * Apply a unified diff to `oldText`, verifying every context/deleted line.
 * @throws `[diffutils.applyPatch]` with the hunk & line number when the patch does not match.
 * @example diffutils.applyPatch("a\nb", diffutils.unifiedDiff("a\nb", "a\nc")); // "a\nc"
 */
export function applyPatch(oldText: string, patch: string): string {
  if (!patch.trim()) return oldText;
  const src = oldText.split(/\r?\n/);
  const out: string[] = [];
  let pos = 0;
  parseUnifiedDiff(patch).forEach((h, hi) => {
    const start = h.oldLines === 0 ? h.oldStart : h.oldStart - 1;
    out.push(...src.slice(pos, start));
    pos = start;
    for (const l of h.lines) {
      const [op, text] = [l[0], l.slice(1)];
      if (op === "+") { out.push(text); continue; }
      if (src[pos] !== text) throw new Error(`[diffutils.applyPatch] Hunk ${hi + 1} mismatch at line ${pos + 1}: expected ${JSON.stringify(text)}, found ${JSON.stringify(src[pos])}`);
      if (op === " ") out.push(text);
      pos++;
    }
  });
  return [...out, ...src.slice(pos)].join("\n");
}

/** Colourise unified-diff text for terminals. @example console.log(diffutils.renderColoredDiff(patch)); */
export function renderColoredDiff(diffText: string): string {
  return diffText
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith("---") || line.startsWith("+++")) return colors.bold(line);
      if (line.startsWith("@@")) return colors.cyan(line);
      if (line.startsWith("+")) return colors.green(line);
      if (line.startsWith("-")) return colors.red(line);
      return colors.gray(line);
    })
    .join("\n");
}

/** Inline word diff for terminals: deletions red+strikethrough, additions green+underline. @example console.log(diffutils.renderInlineDiff("the cat", "the dog")); */
export function renderInlineDiff(oldText: string, newText: string): string {
  return diffWords(oldText, newText)
    .map((o) => (o.type === "add" ? colors.green(colorText(o.value, "4")) : o.type === "delete" ? colors.red(colorText(o.value, "9")) : o.value))
    .join("");
}

/** Namespace bundle. */
export const diffutils = {
  diffArrays,
  diffLines,
  diffWords,
  diffChars,
  diffStats,
  similarityRatio,
  unifiedDiff,
  parseUnifiedDiff,
  applyPatch,
  renderColoredDiff,
  renderInlineDiff,
};
