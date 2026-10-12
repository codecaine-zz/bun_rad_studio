/**
 * Regex Studio helpers: safe evaluation (worker + timeout), match metadata, replacement preview,
 * highlighting, pattern explanation, code generation for several languages, and workspace files.
 * Pure functions, no GUI dependencies.
 */

export const MAX_MATCHES = 1000;
export const MAX_CORPUS_BYTES = 5 * 1024 * 1024;

export interface MatchInfo {
  num: number;
  text: string;
  index: number;
  end: number;
  length: number;
  line: number;
  col: number;
  groups: (string | undefined)[];
  named: Record<string, string | undefined>;
}

export interface RunResult {
  matches: MatchInfo[];
  capped: boolean;
  ms: number;
  error?: string;
  timedOut?: boolean;
}

export interface ReplaceResult {
  text: string;
  count: number;
  error?: string;
  timedOut?: boolean;
}

export function buildFlags(o: { g?: boolean; i?: boolean; m?: boolean; s?: boolean; u?: boolean }): string {
  return (o.g ? "g" : "") + (o.i ? "i" : "") + (o.m ? "m" : "") + (o.s ? "s" : "") + (o.u ? "u" : "");
}

export interface PatternInfo {
  ok: boolean;
  error?: string;
  groupCount: number;
  namedGroups: string[];
}

/** Check a pattern compiles and report how many capture groups it has. */
export function validatePattern(pattern: string, flags: string): PatternInfo {
  if (!pattern) return { ok: false, error: "Pattern is empty", groupCount: 0, namedGroups: [] };
  try {
    new RegExp(pattern, flags);
    const probe = new RegExp(pattern + "|", flags.replace(/[gy]/g, "")).exec("")!;
    const named = [...pattern.matchAll(/\(\?<([A-Za-z_$][\w$]*)>/g)].map((m) => m[1]!);
    return { ok: true, groupCount: probe.length - 1, namedGroups: named };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e).replace(/^Invalid regular expression:\s*/i, ""), groupCount: 0, namedGroups: [] };
  }
}

/** Heuristic: nested quantifiers such as (a+)+ or (.*)* can backtrack catastrophically. */
export function looksCatastrophic(pattern: string): boolean {
  return /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/.test(pattern);
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function locate(starts: number[], index: number): { line: number; col: number } {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= index) lo = mid; else hi = mid - 1;
  }
  return { line: lo + 1, col: index - starts[lo]! + 1 };
}

export function lineCol(text: string, index: number): { line: number; col: number } {
  return locate(lineStarts(text), index);
}

/** Synchronous evaluation. Use runRegexSafe from the GUI so a runaway pattern cannot freeze the app. */
export function runRegexSync(pattern: string, flags: string, corpus: string, limit = MAX_MATCHES): RunResult {
  const t0 = performance.now();
  const info = validatePattern(pattern, flags);
  if (!info.ok) return { matches: [], capped: false, ms: 0, error: info.error };
  const regex = new RegExp(pattern, flags);
  const starts = lineStarts(corpus);
  const raw: RegExpExecArray[] = [];
  let capped = false;
  if (flags.includes("g")) {
    for (const m of corpus.matchAll(regex)) {
      if (raw.length >= limit) { capped = true; break; }
      raw.push(m as RegExpExecArray);
    }
  } else {
    const one = regex.exec(corpus);
    if (one) raw.push(one);
  }
  const matches = raw.map((m, i): MatchInfo => {
    const { line, col } = locate(starts, m.index);
    return {
      num: i + 1, text: m[0], index: m.index, end: m.index + m[0].length, length: m[0].length, line, col,
      groups: m.slice(1), named: { ...(m.groups || {}) },
    };
  });
  return { matches, capped, ms: performance.now() - t0 };
}

export function replaceSync(pattern: string, flags: string, corpus: string, subst: string): ReplaceResult {
  const info = validatePattern(pattern, flags);
  if (!info.ok) return { text: corpus, count: 0, error: info.error };
  const regex = new RegExp(pattern, flags);
  const text = corpus.replace(regex, subst); // native semantics: $1, $<name>, $&, $$
  let count = 0;
  if (flags.includes("g")) count = [...corpus.matchAll(new RegExp(pattern, flags))].length;
  else count = new RegExp(pattern, flags).test(corpus) ? 1 : 0;
  return { text, count };
}

// ---------------------------------------------------------------------------
// Worker-backed evaluation with a timeout
// ---------------------------------------------------------------------------

function callWorker<T>(msg: any, timeoutMs: number, fallback: () => T, onTimeout: () => T): Promise<T> {
  return new Promise((resolve) => {
    let w: Worker;
    try {
      w = new Worker(new URL("./regex_worker.ts", import.meta.url).href);
    } catch {
      resolve(fallback());
      return;
    }
    let done = false;
    const finish = (v: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { w.terminate(); } catch {}
      resolve(v);
    };
    const timer = setTimeout(() => finish(onTimeout()), timeoutMs);
    w.onmessage = (e: MessageEvent) => finish(e.data as T);
    w.onerror = () => finish(fallback());
    w.postMessage(msg);
  });
}

export function runRegexSafe(pattern: string, flags: string, corpus: string, limit = MAX_MATCHES, timeoutMs = 4000): Promise<RunResult> {
  const info = validatePattern(pattern, flags);
  if (!info.ok) return Promise.resolve({ matches: [], capped: false, ms: 0, error: info.error });
  const t0 = performance.now();
  return callWorker<RunResult>(
    { op: "run", pattern, flags, corpus, limit },
    timeoutMs,
    () => runRegexSync(pattern, flags, corpus, limit),
    () => ({ matches: [], capped: false, ms: performance.now() - t0, timedOut: true, error: `Stopped after ${timeoutMs / 1000}s: the pattern is probably backtracking catastrophically` })
  );
}

export function replaceSafe(pattern: string, flags: string, corpus: string, subst: string, timeoutMs = 4000): Promise<ReplaceResult> {
  const info = validatePattern(pattern, flags);
  if (!info.ok) return Promise.resolve({ text: corpus, count: 0, error: info.error });
  return callWorker<ReplaceResult>(
    { op: "replace", pattern, flags, corpus, subst },
    timeoutMs,
    () => replaceSync(pattern, flags, corpus, subst),
    () => ({ text: corpus, count: 0, timedOut: true, error: `Stopped after ${timeoutMs / 1000}s: the pattern is probably backtracking catastrophically` })
  );
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** Wrap each match in markers so matches can be seen in context. */
export function markMatches(corpus: string, matches: MatchInfo[], open = "«", close = "»"): string {
  let out = "";
  let pos = 0;
  for (const m of matches) {
    if (m.index < pos) continue;
    out += corpus.slice(pos, m.index) + open + m.text + close;
    pos = m.end;
  }
  return out + corpus.slice(pos);
}

export function groupsLabel(m: MatchInfo): string {
  const named = Object.entries(m.named);
  const parts = m.groups.map((g, i) => `G${i + 1}: ${g ?? ""}`);
  if (named.length) parts.push(...named.map(([k, v]) => `${k}=${v ?? ""}`));
  return parts.join(", ");
}

/** List of the full matches, or of capture group n (1-based) when given. */
export function matchesToList(matches: MatchInfo[], group = 0): string[] {
  return matches.map((m) => (group > 0 ? m.groups[group - 1] ?? "" : m.text));
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function matchesToCsv(matches: MatchInfo[]): string {
  const maxG = matches.reduce((a, m) => Math.max(a, m.groups.length), 0);
  const head = ["match", "text", "index", "end", "line", "col", ...Array.from({ length: maxG }, (_, i) => `group${i + 1}`)];
  const rows = matches.map((m) => [String(m.num), m.text, String(m.index), String(m.end), String(m.line), String(m.col), ...Array.from({ length: maxG }, (_, i) => m.groups[i] ?? "")]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function matchesToJson(matches: MatchInfo[]): string {
  return JSON.stringify(matches.map((m) => ({ matchNum: m.num, text: m.text, index: m.index, end: m.end, length: m.length, line: m.line, col: m.col, groups: m.groups, named: m.named })), null, 2);
}

// ---------------------------------------------------------------------------
// Pattern explanation
// ---------------------------------------------------------------------------

const ESC_DOC: Record<string, string> = {
  d: "any digit (0-9)", D: "any character that is not a digit", w: "word character (letter, digit, underscore)", W: "non-word character",
  s: "whitespace", S: "non-whitespace", b: "word boundary", B: "not a word boundary", n: "newline", t: "tab", r: "carriage return",
  f: "form feed", v: "vertical tab", "0": "NUL character",
};

/** Plain-English, token-by-token explanation of an ECMAScript pattern (best effort). */
export function explainPattern(pattern: string): string[] {
  const out: string[] = [];
  let depth = 0;
  const line = (tok: string, doc: string) => out.push(`${"  ".repeat(depth)}${tok}  —  ${doc}`);
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "\\") {
      const n = pattern[i + 1];
      if (n === undefined) { line("\\", "trailing backslash"); break; }
      if (n === "u" && pattern[i + 2] === "{") {
        const end = pattern.indexOf("}", i);
        const tok = pattern.slice(i, end + 1);
        line(tok, "Unicode code point"); i = end; continue;
      }
      if (n === "u") { line(pattern.slice(i, i + 6), "Unicode character"); i += 5; continue; }
      if (n === "x") { line(pattern.slice(i, i + 4), "hex character"); i += 3; continue; }
      if ((n === "p" || n === "P") && pattern[i + 2] === "{") {
        const end = pattern.indexOf("}", i);
        line(pattern.slice(i, end + 1), `Unicode property${n === "P" ? " (negated)" : ""} (needs the u flag)`); i = end; continue;
      }
      if (n === "k" && pattern[i + 2] === "<") {
        const end = pattern.indexOf(">", i);
        line(pattern.slice(i, end + 1), "back-reference to a named group"); i = end; continue;
      }
      if (/[1-9]/.test(n)) { line("\\" + n, `back-reference to group ${n}`); i++; continue; }
      line("\\" + n, ESC_DOC[n] ?? `literal "${n}"`);
      i++;
      continue;
    }
    if (c === "[") {
      let j = i + 1;
      if (pattern[j] === "^") j++;
      if (pattern[j] === "]") j++;
      while (j < pattern.length && pattern[j] !== "]") j += pattern[j] === "\\" ? 2 : 1;
      const tok = pattern.slice(i, j + 1);
      line(tok, tok.startsWith("[^") ? "any character NOT in this set" : "any one character in this set");
      i = j;
      continue;
    }
    if (c === "(") {
      if (pattern.startsWith("(?:", i)) { line("(?:", "start non-capturing group"); i += 2; }
      else if (pattern.startsWith("(?=", i)) { line("(?=", "lookahead: must be followed by"); i += 2; }
      else if (pattern.startsWith("(?!", i)) { line("(?!", "negative lookahead: must NOT be followed by"); i += 2; }
      else if (pattern.startsWith("(?<=", i)) { line("(?<=", "lookbehind: must be preceded by"); i += 3; }
      else if (pattern.startsWith("(?<!", i)) { line("(?<!", "negative lookbehind: must NOT be preceded by"); i += 3; }
      else if (pattern.startsWith("(?<", i)) {
        const end = pattern.indexOf(">", i);
        line(pattern.slice(i, end + 1), `start capture group named "${pattern.slice(i + 3, end)}"`); i = end;
      } else line("(", "start capture group");
      depth++;
      continue;
    }
    if (c === ")") { depth = Math.max(0, depth - 1); line(")", "end group"); continue; }
    if (c === "{") {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
      if (m) {
        const doc = m[2] === undefined ? `exactly ${m[1]} times` : m[3] === "" ? `${m[1]} or more times` : `between ${m[1]} and ${m[3]} times`;
        let tok = m[0];
        if (pattern[i + tok.length] === "?") tok += "?";
        line(tok, doc + (tok.endsWith("?") ? " (lazy)" : ""));
        i += tok.length - 1;
        continue;
      }
      line("{", 'literal "{"');
      continue;
    }
    if (c === "*" || c === "+" || c === "?") {
      const lazy = pattern[i + 1] === "?";
      const base = c === "*" ? "zero or more times" : c === "+" ? "one or more times" : "optional (zero or one time)";
      line(c + (lazy ? "?" : ""), base + (lazy ? " (lazy: as few as possible)" : " (greedy)"));
      if (lazy) i++;
      continue;
    }
    if (c === "^") { line("^", "start of the text (or of a line with the m flag)"); continue; }
    if (c === "$") { line("$", "end of the text (or of a line with the m flag)"); continue; }
    if (c === ".") { line(".", "any character except a newline (any character with the s flag)"); continue; }
    if (c === "|") { line("|", "OR — match either side"); continue; }
    line(c, `literal "${c}"`);
  }
  return out;
}

export const CHEATSHEET = `Characters      .  any char      \\d digit   \\w word   \\s space   \\D \\W \\S the opposites
Anchors         ^ start   $ end   \\b word boundary   \\B not a boundary
Sets            [abc] any of   [^abc] none of   [a-z] range
Quantifiers     * 0+   + 1+   ? 0 or 1   {n} exactly n   {n,} n+   {n,m} n to m   add ? for lazy
Groups          (x) capture   (?:x) no capture   (?<name>x) named   \\1 or \\k<name> back-reference
Lookaround      (?=x) ahead   (?!x) not ahead   (?<=x) behind   (?<!x) not behind
Alternation     a|b
Flags           g all matches   i ignore case   m ^ $ per line   s dot matches newline   u Unicode
Replacement     $1 group   $<name> named group   $& whole match   $$ literal dollar`;

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

export const CODE_LANGUAGES = ["TypeScript", "JavaScript", "Python", "Go", "Java", "PHP"] as const;

function toPythonNamed(p: string): string {
  return p.replace(/\(\?<([A-Za-z_]\w*)>/g, "(?P<$1>").replace(/\\k<([A-Za-z_]\w*)>/g, "(?P=$1)");
}

export function generateCode(lang: string, pattern: string, flags: string): string {
  const has = (f: string) => flags.includes(f);
  switch (lang) {
    case "JavaScript":
      return `// JavaScript RegExp\nconst regex = new RegExp(${JSON.stringify(pattern)}, "${flags}");\nconst matches = [...text.matchAll(regex)];\n`;
    case "Python": {
      const fl = [has("i") && "re.IGNORECASE", has("m") && "re.MULTILINE", has("s") && "re.DOTALL"].filter(Boolean).join(" | ");
      return `# Python\nimport re\n\nregex = re.compile(${JSON.stringify(toPythonNamed(pattern))}${fl ? ", " + fl : ""})\nmatches = [m.group(0) for m in regex.finditer(text)]\n`;
    }
    case "Go": {
      const prefix = ["i", "m", "s"].filter(has).join("");
      const pat = (prefix ? `(?${prefix})` : "") + toPythonNamed(pattern);
      const lit = pat.includes("`") ? JSON.stringify(pat) : "`" + pat + "`";
      const warn = /\(\?<?[=!]|\\[1-9k]/.test(pattern) ? "// NOTE: Go's RE2 engine does not support lookaround or back-references.\n" : "";
      return `// Go\n${warn}re := regexp.MustCompile(${lit})\nmatches := re.FindAllString(text, -1)\n`;
    }
    case "Java": {
      const fl = [has("i") && "Pattern.CASE_INSENSITIVE", has("m") && "Pattern.MULTILINE", has("s") && "Pattern.DOTALL", has("u") && "Pattern.UNICODE_CASE"].filter(Boolean).join(" | ");
      return `// Java\nPattern regex = Pattern.compile(${JSON.stringify(pattern)}${fl ? ", " + fl : ""});\nMatcher m = regex.matcher(text);\nwhile (m.find()) {\n    System.out.println(m.group());\n}\n`;
    }
    case "PHP": {
      const delim = pattern.replace(/(^|[^\\])\//g, "$1\\/");
      const fl = ["i", "m", "s", "u"].filter(has).join("");
      return `<?php\n// PHP (PCRE)\npreg_match_all('/${delim.replace(/'/g, "\\'")}/${fl}', $text, $matches);\n`;
    }
    default:
      return `// TypeScript / Bun RegExp\nconst regex = new RegExp(${JSON.stringify(pattern)}, "${flags}");\nconst matches = [...text.matchAll(regex)];\n`;
  }
}

// ---------------------------------------------------------------------------
// Presets & workspace files
// ---------------------------------------------------------------------------

export const PRESETS: { name: string; pattern: string }[] = [
  { name: "1. Email Addresses", pattern: "([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+)" },
  { name: "2. IPv4 Addresses", pattern: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b" },
  { name: "3. Semantic Versions (SemVer)", pattern: "v?(\\d+)\\.(\\d+)\\.(\\d+)(?:-[a-zA-Z0-9.]+)?" },
  { name: "4. UUID v4 Tokens", pattern: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" },
  { name: "5. HTTP/HTTPS URLs", pattern: "https?:\\/\\/[\\w\\.-]+(?:\\.[a-zA-Z]{2,})(?:\\/[^\\s]*)?" },
  { name: "6. ISO-8601 Dates", pattern: "\\d{4}-\\d{2}-\\d{2}" },
  { name: "7. Hex Colors", pattern: "#(?:[0-9a-fA-F]{3}){1,2}\\b" },
  { name: "8. US Phone Numbers", pattern: "\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}" },
  { name: "9. HTML Tags", pattern: "<\\/?[a-zA-Z][^>]*>" },
  { name: "10. Duplicate Words", pattern: "\\b(\\w+)\\s+\\1\\b" },
  { name: "11. MAC Addresses", pattern: "\\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\\b" },
  { name: "12. Hashtags", pattern: "#\\w+" },
  { name: "13. Quoted Strings", pattern: "\"(?:[^\"\\\\]|\\\\.)*\"" },
  { name: "14. Leading/Trailing Whitespace", pattern: "^\\s+|\\s+$" },
];

export interface WorkspaceFile {
  format: "bun-rad-regex-workspace";
  version: 1;
  pattern: string;
  subst: string;
  corpus: string;
  flags: { g: boolean; i: boolean; m: boolean; s: boolean; u: boolean };
}

export function serializeWorkspace(w: Omit<WorkspaceFile, "format" | "version">): string {
  return JSON.stringify({ format: "bun-rad-regex-workspace", version: 1, ...w }, null, 2);
}

export function parseWorkspace(text: string): WorkspaceFile {
  let o: any;
  try { o = JSON.parse(text); } catch { throw new Error("The file is not valid JSON"); }
  if (!o || o.format !== "bun-rad-regex-workspace") throw new Error("Not a Regex Studio workspace file");
  const str = (v: any) => (typeof v === "string" ? v : "");
  const b = (v: any, d: boolean) => (typeof v === "boolean" ? v : d);
  const f = o.flags || {};
  return {
    format: "bun-rad-regex-workspace", version: 1, pattern: str(o.pattern), subst: str(o.subst), corpus: str(o.corpus),
    flags: { g: b(f.g, true), i: b(f.i, false), m: b(f.m, false), s: b(f.s, false), u: b(f.u, false) },
  };
}
