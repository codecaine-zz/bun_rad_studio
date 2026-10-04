/**
 * regexutils — Safe, stateless regular-expression helpers.
 *
 * Every function clones the incoming `RegExp`, so `/g` and `/y` `lastIndex` state never
 * leaks between calls (a classic source of "works every other time" bugs). String patterns
 * are treated as regex *source*; use {@link literal} / {@link escapeRegExp} for user input.
 *
 * @example
 * import { regexutils } from "./src/features/rad/index.ts";
 * regexutils.matchAll(/(?<key>\w+)=(?<val>\w+)/, "a=1 b=2").map((m) => m.groups);
 */

/** Pattern accepted by every helper: regex source string or a `RegExp`. */
export type Pattern = string | RegExp;

/** Detailed match record returned by {@link matchAll} / {@link matchFirst}. */
export interface RegexMatch {
  /** Full matched text. */
  match: string;
  /** Start offset in the input. */
  index: number;
  /** Positional capture groups (`undefined` when a group did not participate). */
  captures: (string | undefined)[];
  /** Named capture groups (empty object when none). */
  groups: Record<string, string | undefined>;
}

/** Replacement value: string (supports `$1`, `$<name>`) or callback. */
export type Replacement = string | ((match: string, ...args: any[]) => string);

/** Ready-made validation patterns (anchored, no global flag). */
export const commonPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
  ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  semver: /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+([\w.-]+))?$/,
  hexColor: /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  isoDate: /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  integer: /^[+-]?\d+$/,
  number: /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i,
  whitespace: /\s+/,
} as const;

/** Name of a built-in pattern in {@link commonPatterns}. */
export type CommonPatternName = keyof typeof commonPatterns;

function toRegex(pattern: Pattern, addFlags = "", removeFlags = ""): RegExp {
  const source = pattern instanceof RegExp ? pattern.source : pattern;
  const base = pattern instanceof RegExp ? pattern.flags : "";
  const flags = Array.from(new Set([...base, ...addFlags])).filter((f) => !removeFlags.includes(f)).join("");
  try {
    return new RegExp(source, flags);
  } catch (err) {
    throw new Error(`[regexutils] Invalid pattern /${source}/${flags}: ${(err as Error).message}`);
  }
}

function toMatch(m: RegExpExecArray): RegexMatch {
  return { match: m[0], index: m.index, captures: m.slice(1), groups: { ...(m.groups ?? {}) } };
}

/** Escape regex metacharacters. @example regexutils.escapeRegExp("1+1=2?"); // "1\\+1=2\\?" */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** RegExp matching `text` literally. @example regexutils.literal("a.b", "g").test("a.b"); // true */
export function literal(text: string, flags = ""): RegExp {
  return new RegExp(escapeRegExp(text), flags);
}

/** `true` if `source`/`flags` compile. @example regexutils.isValidRegex("(unclosed"); // false */
export function isValidRegex(source: string, flags = ""): boolean {
  return tryRegex(source, flags) !== null;
}

/** Compile or return `null` (never throws). @example regexutils.tryRegex("[a-z]+", "i"); // /[a-z]+/i */
export function tryRegex(source: string, flags = ""): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

/** Stateless test (safe with `/g` regexes). @example regexutils.isMatch(/^\d+$/, "12345"); // true */
export function isMatch(pattern: Pattern, text: string): boolean {
  return toRegex(pattern, "", "gy").test(text);
}

/** Test against a {@link commonPatterns} entry. @example regexutils.matchesPattern("email", "a@b.co"); // true */
export function matchesPattern(name: CommonPatternName, text: string): boolean {
  return commonPatterns[name].test(text);
}

/** First matching substring or `null`. @example regexutils.findFirst(/\d+/, "v42"); // "42" */
export function findFirst(pattern: Pattern, text: string): string | null {
  return toRegex(pattern, "", "gy").exec(text)?.[0] ?? null;
}

/** All matching substrings. @example regexutils.findAll(/\d+/g, "10 20 30"); // ["10","20","30"] */
export function findAll(pattern: Pattern, text: string): string[] {
  return Array.from(text.matchAll(toRegex(pattern, "g")), (m) => m[0]);
}

/** First match with index, captures and groups, or `null`. @example regexutils.matchFirst(/(\d+)px/, "w: 12px")?.captures; // ["12"] */
export function matchFirst(pattern: Pattern, text: string): RegexMatch | null {
  const m = toRegex(pattern, "", "gy").exec(text);
  return m ? toMatch(m) : null;
}

/** Every match with full detail. @example regexutils.matchAll(/(\w)=(\d)/, "a=1 b=2").map((m) => m.captures); // [["a","1"],["b","2"]] */
export function matchAll(pattern: Pattern, text: string): RegexMatch[] {
  return Array.from(text.matchAll(toRegex(pattern, "g")), toMatch);
}

/** Count matches. @example regexutils.countMatches(/o/, "foo boo"); // 4 */
export function countMatches(pattern: Pattern, text: string): number {
  let n = 0;
  for (const _ of text.matchAll(toRegex(pattern, "g"))) n++;
  return n;
}

/**
 * Replace **all** matches (string with `$1`/`$<name>` or callback).
 * @example regexutils.replace(/\d+/g, "items: 123", "###"); // "items: ###"
 * @example regexutils.replace(/\d+/, "1 2", (m) => String(+m * 10)); // "10 20"
 */
export function replace(pattern: Pattern, text: string, replacement: Replacement): string {
  return text.replace(toRegex(pattern, "g"), replacement as any);
}

/** Replace only the first match. @example regexutils.replaceFirst(/a/g, "aaa", "b"); // "baa" */
export function replaceFirst(pattern: Pattern, text: string, replacement: Replacement): string {
  return text.replace(toRegex(pattern, "", "g"), replacement as any);
}

/** Split by pattern (capture groups are included, per `String.split`). @example regexutils.split(/ ?, ?/, "a , b,c"); // ["a","b","c"] */
export function split(pattern: Pattern, text: string, limit?: number): string[] {
  return text.split(toRegex(pattern, "", "gy"), limit);
}

/** Named groups of every match (matches without groups are skipped). @example regexutils.findNamedGroups(/(?<k>\w+)=(?<v>\w+)/, "a=1 b=2"); // [{k:"a",v:"1"},{k:"b",v:"2"}] */
export function findNamedGroups(pattern: RegExp, text: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of text.matchAll(toRegex(pattern, "g"))) if (m.groups) out.push({ ...m.groups } as Record<string, string>);
  return out;
}

/** Named groups of the first match, or `null`. @example regexutils.extractGroups(/(?<major>\d+)\.(?<minor>\d+)/, "v3.14"); // { major: "3", minor: "14" } */
export function extractGroups(pattern: RegExp, text: string): Record<string, string> | null {
  const m = toRegex(pattern, "", "gy").exec(text);
  return m?.groups ? ({ ...m.groups } as Record<string, string>) : null;
}

/**
 * Combine patterns into one alternation (`(?:a)|(?:b)`), keeping flags of the first RegExp.
 * @example regexutils.anyOf(["cat", /dogs?/]).test("dogs"); // true
 */
export function anyOf(patterns: readonly Pattern[], flags?: string): RegExp {
  const sources = patterns.map((p) => (p instanceof RegExp ? p.source : escapeRegExp(p)));
  const firstRe = patterns.find((p): p is RegExp => p instanceof RegExp);
  return new RegExp(sources.map((s) => `(?:${s})`).join("|"), flags ?? firstRe?.flags.replace(/[gy]/g, "") ?? "");
}

/** Namespace bundle. */
export const regexutils = {
  commonPatterns,
  escapeRegExp,
  literal,
  isValidRegex,
  tryRegex,
  isMatch,
  matchesPattern,
  findFirst,
  findAll,
  matchFirst,
  matchAll,
  countMatches,
  replace,
  replaceFirst,
  split,
  findNamedGroups,
  extractGroups,
  anyOf,
};
