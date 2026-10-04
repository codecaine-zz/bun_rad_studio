/**
 * strutils — Unicode-aware string toolkit.
 *
 * Word-splitting that understands camelCase, acronyms (`XMLHttpRequest`), digits and
 * separators powers every case converter. Grapheme-aware helpers (via `Intl.Segmenter`)
 * keep emoji and combining marks intact, and terminal helpers use native `Bun.stringWidth`
 * / `Bun.stripANSI`. Randomness uses `crypto.getRandomValues` with rejection sampling.
 *
 * @example
 * import { strutils } from "./src/features/rad/index.ts";
 * strutils.toSnakeCase("XMLHttpRequest"); // "xml_http_request"
 * strutils.closestMatch("instal", ["install", "init"]); // "install"
 */

/** Options for {@link slugify}. */
export interface SlugifyOptions {
  /** Separator between words. Default `"-"`. */
  separator?: string;
  /** Lowercase output. Default `true`. */
  lowercase?: boolean;
  /** Hard cap on length (trailing separators trimmed). */
  maxLength?: number;
}

/** Options for {@link wordWrap}. */
export interface WordWrapOptions {
  /** Keep existing line breaks / paragraphs. Default `false` (legacy: reflow everything). */
  preserveNewlines?: boolean;
  /** Split words longer than `width`. Default `false`. */
  breakLongWords?: boolean;
  /** Prefix added to every output line. Default `""`. */
  indent?: string;
}

/** A fuzzy-search hit returned by {@link fuzzySearch}. */
export interface FuzzyResult<T> {
  item: T;
  score: number;
}

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function stripDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function capitalizeWord(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/**
 * Split into words across camelCase, PascalCase, acronyms, digits, and any non-alphanumeric separator.
 * @example strutils.words("parseHTTPResponse_v2 code"); // ["parse","HTTP","Response","v2","code"]
 */
export function words(str: string): string[] {
  return (
    str
      .replace(/([\p{Ll}\d])(\p{Lu})/gu, "$1 $2")
      .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
      .match(/[\p{L}\d]+/gu) ?? []
  );
}

/**
 * URL-safe slug: strips accents, collapses non-alphanumerics into `separator`.
 * @example strutils.slugify("Crème Brûlée & Co!"); // "creme-brulee-co"
 * @example strutils.slugify("Hello World", { separator: "_", maxLength: 7 }); // "hello_w"
 */
export function slugify(str: string, options: SlugifyOptions = {}): string {
  const sep = options.separator ?? "-";
  const base = stripDiacritics(options.lowercase === false ? str : str.toLowerCase());
  let slug = base.replace(/[^a-zA-Z0-9]+/g, sep);
  const edge = new RegExp(`^(?:${escapeForRegex(sep)})+|(?:${escapeForRegex(sep)})+$`, "g");
  slug = slug.replace(edge, "");
  if (options.maxLength !== undefined) slug = slug.slice(0, options.maxLength).replace(edge, "");
  return slug;
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") || "(?!)";
}

/** `snake_case`. @example strutils.toSnakeCase("camelCaseText"); // "camel_case_text" */
export function toSnakeCase(str: string): string {
  return words(str).map((w) => w.toLowerCase()).join("_");
}

/** `kebab-case`. @example strutils.toKebabCase("camelCaseText"); // "camel-case-text" */
export function toKebabCase(str: string): string {
  return words(str).map((w) => w.toLowerCase()).join("-");
}

/** `CONSTANT_CASE`. @example strutils.toConstantCase("maxRetryCount"); // "MAX_RETRY_COUNT" */
export function toConstantCase(str: string): string {
  return words(str).map((w) => w.toUpperCase()).join("_");
}

/** `dot.case`. @example strutils.toDotCase("App Server Port"); // "app.server.port" */
export function toDotCase(str: string): string {
  return words(str).map((w) => w.toLowerCase()).join(".");
}

/** `camelCase`. @example strutils.toCamelCase("snake_case_text"); // "snakeCaseText" */
export function toCamelCase(str: string): string {
  return words(str).map((w, i) => (i === 0 ? w.toLowerCase() : capitalizeWord(w))).join("");
}

/** `PascalCase`. @example strutils.toPascalCase("snake_case_text"); // "SnakeCaseText" */
export function toPascalCase(str: string): string {
  return words(str).map(capitalizeWord).join("");
}

/** `Title Case` (each word capitalised, original separators kept). @example strutils.toTitleCase("hello world"); // "Hello World" */
export function toTitleCase(str: string): string {
  return str.replace(/[\p{L}\d]+/gu, (w) => capitalizeWord(w));
}

/** `Sentence case` from any identifier. @example strutils.toSentenceCase("userAccountId"); // "User account id" */
export function toSentenceCase(str: string): string {
  const s = words(str).join(" ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Uppercase the first character only. @example strutils.capitalize("bun rocks"); // "Bun rocks" */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Lowercase the first character only. @example strutils.uncapitalize("Bun"); // "bun" */
export function uncapitalize(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Generic masker keeping `visibleStart` leading and `visibleEnd` trailing characters.
 * @example strutils.maskString("sk_live_abcdef123456", 8, 4); // "sk_live_********3456"
 */
export function maskString(str: string, visibleStart = 0, visibleEnd = 4, maskChar = "*"): string {
  if (str.length <= visibleStart + visibleEnd) return maskChar.repeat(str.length);
  const hidden = str.length - visibleStart - visibleEnd;
  return str.slice(0, visibleStart) + maskChar.repeat(hidden) + str.slice(str.length - visibleEnd);
}

/** Mask an email's local part. @example strutils.maskEmail("developer@example.com"); // "d*******r@example.com" */
export function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [user, domain] = parts;
  if (!user || user.length <= 2) return `${user?.charAt(0) || "*"}*@${domain}`;
  return `${user.charAt(0)}${"*".repeat(user.length - 2)}${user.charAt(user.length - 1)}@${domain}`;
}

/** Mask a phone number, revealing the last 4 digits. @example strutils.maskPhone("(555) 123-7890"); // "***-***-7890" */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? phone : `***-***-${digits.slice(-4)}`;
}

/** Mask a card number, revealing the last 4 digits. @example strutils.maskCreditCard("4111 1111 1111 1234"); // "****-****-****-1234" */
export function maskCreditCard(cc: string): string {
  const digits = cc.replace(/\D/g, "");
  return digits.length <= 4 ? cc : `****-****-****-${digits.slice(-4)}`;
}

/**
 * Levenshtein edit distance (two-row DP: O(min(a,b)) memory).
 * @example strutils.levenshteinDistance("kitten", "sitting"); // 3
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length < b.length) [a, b] = [b, a];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Normalised similarity `1 − distance / maxLen` in `0..1`. @example strutils.similarity("night", "nacht"); // 0.6 */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshteinDistance(a, b) / max;
}

/**
 * "Did you mean…?" — closest candidate within `maxDistance` (case-insensitive), or `null`.
 * @example strutils.closestMatch("stauts", ["status", "start", "stop"]); // "status"
 */
export function closestMatch(input: string, candidates: readonly string[], maxDistance = Math.max(2, Math.floor(input.length / 3))): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshteinDistance(input.toLowerCase(), c.toLowerCase());
    if (d < bestDist) [best, bestDist] = [c, d];
  }
  return bestDist <= maxDistance ? best : null;
}

/**
 * Subsequence fuzzy score (higher = better; consecutive and word-start hits boosted), or `null` if no match.
 * @example strutils.fuzzyScore("gco", "git checkout") !== null; // true
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase(), t = text.toLowerCase();
  let score = 0, ti = 0, streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    streak = found === ti ? streak + 1 : 1;
    const wordStart = found === 0 || /[\s\-_./]/.test(t[found - 1]!);
    score += 1 + streak * 2 + (wordStart ? 5 : 0) - Math.min(found - ti, 5) * 0.5;
    ti = found + 1;
  }
  return score - (t.length - q.length) * 0.01;
}

/**
 * Rank items by {@link fuzzyScore}, best first; non-matches dropped.
 * @example strutils.fuzzySearch("dep", [{ n: "deploy" }, { n: "test" }], (x) => x.n); // [{ item: { n: "deploy" }, score: … }]
 */
export function fuzzySearch<T>(query: string, items: readonly T[], getText: (item: T) => string = String): FuzzyResult<T>[] {
  const hits: FuzzyResult<T>[] = [];
  for (const item of items) {
    const score = fuzzyScore(query, getText(item));
    if (score !== null) hits.push({ item, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** Truncate to `maxLen` total characters including `suffix`. @example strutils.truncate("Hello World", 8); // "Hello..." */
export function truncate(text: string, maxLen: number, suffix = "..."): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - suffix.length)) + suffix;
}

/** Truncate on a word boundary. @example strutils.truncateWords("The quick brown fox", 15); // "The quick..." */
export function truncateWords(text: string, maxLen: number, suffix = "..."): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, Math.max(0, maxLen - suffix.length + 1));
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, -1)).trimEnd() + suffix;
}

/** Keep both ends, elide the middle (paths, hashes). @example strutils.truncateMiddle("/very/long/path/to/file.ts", 16); // "/very/lo…file.ts" */
export function truncateMiddle(text: string, maxLen: number, separator = "…"): string {
  if (text.length <= maxLen) return text;
  const keep = Math.max(0, maxLen - separator.length);
  const front = Math.ceil(keep / 2);
  return text.slice(0, front) + separator + text.slice(text.length - (keep - front));
}

/** Center within `width` using `padChar`. @example strutils.padCenter("hi", 6, "*"); // "**hi**" */
export function padCenter(text: string, width: number, padChar = " "): string {
  if (text.length >= width) return text;
  const totalPad = width - text.length;
  const leftPad = Math.floor(totalPad / 2);
  return padChar.repeat(leftPad) + text + padChar.repeat(totalPad - leftPad);
}

function wrapParagraph(text: string, width: number, breakLong: boolean): string[] {
  const lines: string[] = [];
  let line = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (breakLong && word.length > width) {
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + word.length + 1 <= width) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Greedy word-wrap to `width` columns.
 * @example strutils.wordWrap("The quick brown fox", 10); // "The quick\nbrown fox"
 * @example strutils.wordWrap("a\n\nb", 80, { preserveNewlines: true, indent: "> " }); // "> a\n> \n> b"
 */
export function wordWrap(text: string, width: number, options: WordWrapOptions = {}): string {
  const indent = options.indent ?? "";
  const avail = Math.max(1, width - indent.length);
  const blocks = options.preserveNewlines ? text.split(/\r?\n/) : [text];
  const lines = blocks.flatMap((b) => {
    const wrapped = wrapParagraph(b, avail, options.breakLongWords ?? false);
    return wrapped.length === 0 && options.preserveNewlines ? [""] : wrapped;
  });
  return lines.map((l) => indent + l).join("\n");
}

/**
 * Remove common leading indentation (great for template literals).
 * @example strutils.dedent("\n    a\n      b\n"); // "a\n  b"
 */
export function dedent(text: string): string {
  const lines = text.replace(/^\r?\n/, "").replace(/\r?\n\s*$/, "").split(/\r?\n/);
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

/** Prefix every non-empty line. @example strutils.indent("a\nb", 2); // "  a\n  b" */
export function indent(text: string, by: number | string = 2): string {
  const pad = typeof by === "number" ? " ".repeat(by) : by;
  return text.split("\n").map((l) => (l ? pad + l : l)).join("\n");
}

/** Collapse runs of whitespace into single spaces and trim. @example strutils.normalizeWhitespace("  a \n\t b "); // "a b" */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** `true` for empty or whitespace-only strings (and `null`/`undefined`). @example strutils.isBlank("  \n"); // true */
export function isBlank(text: string | null | undefined): boolean {
  return text == null || text.trim() === "";
}

/** Split on `\n` / `\r\n`. @example strutils.splitLines("a\r\nb"); // ["a","b"] */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Non-overlapping occurrences of `sub`. @example strutils.countOccurrences("banana", "an"); // 2 */
export function countOccurrences(text: string, sub: string): number {
  if (!sub) return 0;
  let count = 0;
  for (let i = text.indexOf(sub); i !== -1; i = text.indexOf(sub, i + sub.length)) count++;
  return count;
}

/** Add `prefix` if missing. @example strutils.ensurePrefix("api/users", "/"); // "/api/users" */
export function ensurePrefix(text: string, prefix: string): string {
  return text.startsWith(prefix) ? text : prefix + text;
}

/** Add `suffix` if missing. @example strutils.ensureSuffix("dir", "/"); // "dir/" */
export function ensureSuffix(text: string, suffix: string): string {
  return text.endsWith(suffix) ? text : text + suffix;
}

/** Remove `prefix` if present. @example strutils.removePrefix("v1.2.3", "v"); // "1.2.3" */
export function removePrefix(text: string, prefix: string): string {
  return prefix && text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

/** Remove `suffix` if present. @example strutils.removeSuffix("report.json", ".json"); // "report" */
export function removeSuffix(text: string, suffix: string): string {
  return suffix && text.endsWith(suffix) ? text.slice(0, -suffix.length) : text;
}

/** Split into user-perceived characters (emoji/combining-mark safe). @example strutils.graphemes("👍🏽a"); // ["👍🏽","a"] */
export function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
}

/** Grapheme-safe reverse. @example strutils.reverse("añb👍🏽"); // "👍🏽bña" */
export function reverse(text: string): string {
  return graphemes(text).reverse().join("");
}

/** Terminal display width (CJK = 2 cols, ANSI ignored) via `Bun.stringWidth`. @example strutils.displayWidth("日本"); // 4 */
export function displayWidth(text: string): number {
  return Bun.stringWidth(text);
}

/** Remove ANSI escape sequences via `Bun.stripANSI`. (Namespace-only: the flat export lives in cliutils.) @example strutils.stripAnsi("\x1b[31mred\x1b[0m"); // "red" */
function stripAnsi(text: string): string {
  return Bun.stripANSI(text);
}

/**
 * Pick singular/plural by count (`plural` defaults to `singular + "s"`).
 * @example strutils.pluralize(1, "file"); // "1 file"
 * @example strutils.pluralize(3, "child", "children"); // "3 children"
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`, includeCount = true): string {
  const word = Math.abs(count) === 1 ? singular : plural;
  return includeCount ? `${count} ${word}` : word;
}

/** English ordinal. @example strutils.ordinal(22); // "22nd" */
export function ordinal(n: number): string {
  const mod100 = Math.abs(n) % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : (["th", "st", "nd", "rd"][Math.abs(n) % 10] ?? "th");
  return `${n}${suffix}`;
}

/** Initials of up to `max` words. @example strutils.initials("Ada King Lovelace"); // "AK" */
export function initials(name: string, max = 2): string {
  return words(name).slice(0, max).map((w) => w.charAt(0).toUpperCase()).join("");
}

/**
 * Unbiased cryptographically random string from `alphabet` (rejection sampling).
 * @throws if `alphabet` is empty or longer than 256 characters.
 * @example strutils.randomString(6, "0123456789"); // "402913"
 */
export function randomString(length: number, alphabet = ALPHANUMERIC): string {
  if (alphabet.length === 0 || alphabet.length > 256) {
    throw new Error(`[strutils.randomString] Alphabet length must be 1..256 (got ${alphabet.length})`);
  }
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(Math.max(16, length)))) {
      if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}

/** Unbiased random `[A-Za-z0-9]` string. @example strutils.randomAlphanumeric(12); // "aZ3k9QpL0xYb" */
export function randomAlphanumeric(length: number): string {
  return randomString(length, ALPHANUMERIC);
}

/** Namespace bundle. */
export const strutils = {
  words,
  slugify,
  toSnakeCase,
  toKebabCase,
  toConstantCase,
  toDotCase,
  toCamelCase,
  toPascalCase,
  toTitleCase,
  toSentenceCase,
  capitalize,
  uncapitalize,
  maskString,
  maskEmail,
  maskPhone,
  maskCreditCard,
  levenshteinDistance,
  similarity,
  closestMatch,
  fuzzyScore,
  fuzzySearch,
  truncate,
  truncateWords,
  truncateMiddle,
  padCenter,
  wordWrap,
  dedent,
  indent,
  normalizeWhitespace,
  isBlank,
  splitLines,
  countOccurrences,
  ensurePrefix,
  ensureSuffix,
  removePrefix,
  removeSuffix,
  graphemes,
  reverse,
  displayWidth,
  stripAnsi,
  pluralize,
  ordinal,
  initials,
  randomString,
  randomAlphanumeric,
};
