/**
 * What the Replace tool's server side and its worker share: the limits, the shapes of jobs and results, how a
 * person's pattern becomes a regular expression, and how one file's text is rewritten (line breaks included).
 */
import { buildReplacerRegex } from "../sd/sdDoers";
import { unescapeReplacement } from "../../sd_helpers";
import { FmError } from "./fmPaths";

export const SD_MAX_FILES = 5000;
export const SD_MAX_REPLACEMENTS = 100_000;
export const SD_TIMEOUT_MS = 60_000;
export const SD_UNDO_RUNS = 5;
/** The most file content (before + after) one apply may hold in memory at once; it is also what Undo keeps. */
export const SD_MAX_BATCH_BYTES = 64 * 1024 * 1024;
export const SD_DEFAULT_EXCLUDES = ["node_modules", ".git", "dist"];
export const SD_MAX_FIND = 2000;
export const SD_MAX_REPLACE = 10_000;
export const SD_DIFF_LIMITS = { maxLines: 2000, maxChars: 200_000 };
/** How much diff text one preview keeps in memory in total; files past it still list, without a diff. */
export const SD_DIFF_BUDGET = 8 * 1024 * 1024;

export interface SdSpec {
  find: string;
  replace: string;
  literal: boolean;
  wholeWord: boolean;
  ignoreCase: boolean;
  flags: string;
  escapes: boolean;
}

export interface SdFilter {
  exts: string[];
  exclude: string[];
  defaultExcludes: boolean;
  hidden: boolean;
}

export type SdJob =
  | { kind: "scan"; mode: "count" | "preview"; spec: SdSpec; targets: string[]; filter: SdFilter }
  | { kind: "transform"; spec: SdSpec; files: Array<{ path: string; hash: string }>; maxBytes: number }
  | { kind: "spin"; ms: number };

export interface SdSkipped {
  binary: number;
  large: number;
  notText: number;
  unreadable: number;
  links: number;
}

export interface SdFileResult {
  path: string;
  matches: number;
  changed: boolean;
  hunks: number;
  added: number;
  removed: number;
  size: number;
  /** SHA-256 of the file as it was scanned: Replace only goes ahead when the file still has this content. */
  hash: string;
  diff: string;
  diffTruncated: boolean;
}

export interface SdScanOutcome {
  files: SdFileResult[];
  filesScanned: number;
  replacements: number;
  skipped: SdSkipped;
  filesCapped: boolean;
  replacementsCapped: boolean;
}

export interface SdTransformItem {
  path: string;
  status: "ok" | "changed" | "unchanged" | "unreadable";
  replacements: number;
  original?: Uint8Array;
  updated?: Uint8Array;
}

export interface SdTransformOutcome {
  items: SdTransformItem[];
  replacementsCapped: boolean;
}

export interface Compiled {
  re: RegExp;
  replacement: string;
  /** True when the pattern talks about carriage returns itself, so line breaks must be matched as they are on disk. */
  mentionsCr: boolean;
}

/** Turns what the person typed into a regular expression, or throws a plain-language error. */
export function compileSpec(spec: SdSpec): Compiled {
  if (!spec.find) throw new FmError("BAD_REQUEST", "Type what to look for.");
  if (spec.find.length > SD_MAX_FIND) throw new FmError("BAD_REQUEST", `The text to find is too long (the limit is ${SD_MAX_FIND} characters).`);
  if (spec.replace.length > SD_MAX_REPLACE) throw new FmError("BAD_REQUEST", `The replacement is too long (the limit is ${SD_MAX_REPLACE} characters).`);
  if (!/^[gimsu]*$/.test(spec.flags)) throw new FmError("BAD_FLAGS", "The flags can only use the letters g, i, m, s and u.");
  const flags = [...new Set(spec.flags)].join("");
  const notRegex = new FmError("BAD_PATTERN", 'That isn\'t a valid pattern. Tick "Plain text" if you want to find the characters exactly as you typed them.');
  let re: RegExp;
  try {
    if (!spec.literal) new RegExp(spec.find, flags);
    // Grouped, so "cat|dog" with "whole word" means (cat or dog) as a whole word.
    const body = spec.wholeWord && !spec.literal ? `(?:${spec.find})` : spec.find;
    re = buildReplacerRegex(body, spec.literal, flags, spec.ignoreCase, spec.wholeWord);
  } catch (err) {
    throw new FmError(notRegex.code, `${notRegex.message} (${String((err as Error)?.message ?? err).replace(/^Invalid regular expression: /, "")})`);
  }
  const mentionsCr = spec.literal ? spec.find.includes("\r") : /\\r|\\x0d|\\u000d|\\cM|\r/i.test(spec.find);
  return { re, replacement: spec.escapes ? unescapeReplacement(spec.replace) : spec.replace, mentionsCr };
}

export type Eol = "crlf" | "lf" | "mixed" | "none";

export function eolOf(text: string): Eol {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) {
    if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++;
    else lf++;
  }
  for (let i = text.indexOf("\r"); i >= 0; i = text.indexOf("\r", i + 1)) if (text.charCodeAt(i + 1) !== 10) cr++;
  if (crlf === 0 && lf === 0 && cr === 0) return "none";
  if (crlf > 0 && lf === 0 && cr === 0) return "crlf";
  if (crlf === 0 && cr === 0) return "lf";
  return "mixed";
}

export interface Rewrite {
  /** The text the pattern was matched against and the text it produced (line breaks as LF when the file uses CRLF). */
  before: string;
  after: string;
  /** What goes back on disk. */
  final: string;
  matches: number;
  /** True when this file would push the run past the replacement limit; nothing was changed. */
  capped: boolean;
}

/** Counts the matches, stopping once more than `limit` were found. */
export function countMatches(text: string, re: RegExp, limit: number): number {
  let n = 0;
  for (const _ of text.matchAll(re)) if (++n > limit) break;
  return n;
}

/**
 * Rewrites one file's text. A file that uses CRLF everywhere is matched as if it used LF (so `\n` and `$` work the
 * way people expect) and written back with CRLF, unless the pattern mentions `\r` itself. `budget.left` is the
 * number of replacements this run may still make; it is lowered by what this file uses.
 */
export function rewriteText(text: string, c: Compiled, budget: { left: number }, countOnly = false): Rewrite {
  const normalize = !c.mentionsCr && eolOf(text) === "crlf";
  const before = normalize ? text.replaceAll("\r\n", "\n") : text;
  const matches = countMatches(before, c.re, budget.left);
  if (matches > budget.left) return { before, after: before, final: text, matches: 0, capped: true };
  budget.left -= matches;
  if (matches === 0 || countOnly) return { before, after: before, final: text, matches, capped: false };
  const after = before.replace(c.re, c.replacement);
  return { before, after, final: normalize ? after.replace(/\r?\n/g, "\r\n") : after, matches, capped: false };
}
