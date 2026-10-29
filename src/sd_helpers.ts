/**
 * Pure helpers for Sd Studio: replace presets, file filtering, binary detection,
 * undo bookkeeping and patch/report formatting. No GUI access.
 */

export interface SdPreset {
  label: string;
  find: string;
  replace: string;
  /** Regex flags to use (without "g" being required; the studio always adds it when missing). */
  flags: string;
  literal: boolean;
  wholeWord: boolean;
  ignoreCase: boolean;
  /** Replacement uses \\n / \\t / \\r escapes. */
  escapes?: boolean;
}

export const SD_PRESET_NONE = "Presets…";

export const SD_PRESETS: SdPreset[] = [
  { label: "Trim trailing whitespace", find: "[ \\t]+$", replace: "", flags: "gm", literal: false, wholeWord: false, ignoreCase: false },
  { label: "Tabs → 4 spaces", find: "\\t", replace: "    ", flags: "g", literal: false, wholeWord: false, ignoreCase: false },
  { label: "Collapse 3+ blank lines", find: "\\n{3,}", replace: "\\n\\n", flags: "g", literal: false, wholeWord: false, ignoreCase: false, escapes: true },
  { label: "Windows (CRLF) → Unix (LF)", find: "\\r\\n", replace: "\\n", flags: "g", literal: false, wholeWord: false, ignoreCase: false, escapes: true },
  { label: "Remove console.log lines", find: "^[ \\t]*console\\.log\\(.*\\);?[ \\t]*\\r?\\n", replace: "", flags: "gm", literal: false, wholeWord: false, ignoreCase: false },
  { label: "http:// → https://", find: "http://", replace: "https://", flags: "g", literal: true, wholeWord: false, ignoreCase: false },
  { label: "Rename identifier (whole word)", find: "oldName", replace: "newName", flags: "g", literal: false, wholeWord: true, ignoreCase: false },
];

export function findSdPreset(label: string): SdPreset | undefined {
  return SD_PRESETS.find((p) => p.label === label);
}

/** Splits "ts, tsx;json" → ["ts","tsx","json"] (lowercase, no dots). */
export function parseExtList(raw: string): string[] {
  return (raw || "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
}

const globRegexCache = new Map<string, RegExp>();

/** Converts a simple glob (*, **, ?) to a RegExp that matches against a "/"-normalized path. */
export function globToRegExp(glob: string): RegExp {
  const cached = globRegexCache.get(glob);
  if (cached) return cached;
  const g = glob.trim().replace(/\\/g, "/");
  let out = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === "*") {
      if (g[i + 1] === "*") { out += ".*"; i++; if (g[i + 1] === "/") i++; }
      else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // Bare names (no slash) match any path segment / basename.
  const anchored = g.includes("/") ? `(^|/)${out}($|/)` : `(^|/)${out}($|/)`;
  const compiled = new RegExp(anchored);
  if (globRegexCache.size < 512) globRegexCache.set(glob, compiled);
  return compiled;
}

export interface FileFilter {
  exts?: string[];
  exclude?: string[];
}

/** True when the file passes the extension whitelist and no exclude glob matches. */
export function passesFileFilter(filePath: string, f: FileFilter): boolean {
  const p = filePath.replace(/\\/g, "/");
  if (f.exts && f.exts.length) {
    const dot = p.lastIndexOf(".");
    const ext = dot > p.lastIndexOf("/") ? p.slice(dot + 1).toLowerCase() : "";
    if (!f.exts.includes(ext)) return false;
  }
  for (const g of f.exclude || []) {
    if (g && globToRegExp(g).test(p)) return false;
  }
  return true;
}

/** Heuristic: a NUL byte or many control characters in the first 8 KB means binary. */
export function isLikelyBinary(sample: Uint8Array): boolean {
  const n = Math.min(sample.length, 8192);
  if (n === 0) return false;
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const b = sample[i]!;
    if (b === 0) return true;
    if (b < 7 || (b > 14 && b < 32 && b !== 27)) ctrl++;
  }
  return ctrl / n > 0.1;
}

export const SD_MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface UndoRecord {
  filePath: string;
  original: string;
}

/** Keeps only the first snapshot per file so repeated replaces still undo to the true original. */
export function mergeUndo(existing: UndoRecord[], incoming: UndoRecord[]): UndoRecord[] {
  const seen = new Set(existing.map((r) => r.filePath));
  return [...existing, ...incoming.filter((r) => !seen.has(r.filePath))];
}

export interface ReportRow {
  filePath: string;
  matches: number;
  hunks: number;
  status: string;
}

/** Plain-text/Markdown summary of a run for Save As / clipboard. */
export function formatReport(opts: { find: string; replace: string; mode: string; rows: ReportRow[]; skipped?: number }): string {
  const total = opts.rows.reduce((a, r) => a + r.matches, 0);
  const lines = [
    "# Sd Studio report",
    "",
    `- Mode: ${opts.mode}`,
    `- Find: \`${opts.find}\``,
    `- Replace: \`${opts.replace}\``,
    `- Files with matches: ${opts.rows.length}`,
    `- Total matches: ${total}`,
  ];
  if (opts.skipped) lines.push(`- Skipped (binary / too large): ${opts.skipped}`);
  lines.push("", "| File | Matches | Hunks | Status |", "| --- | ---: | ---: | --- |");
  for (const r of opts.rows) lines.push(`| ${r.filePath} | ${r.matches} | ${r.hunks} | ${r.status} |`);
  return lines.join("\n") + "\n";
}

/** Concatenates unified-diff texts (already formatted per file) into one patch-like document. */
export function joinDiffs(diffs: string[]): string {
  return diffs.filter(Boolean).join("\n\n") + (diffs.length ? "\n" : "");
}

/** Turns \\n, \\t, \\r and \\\\ in a replacement string into real characters ($1 captures are untouched). */
export function unescapeReplacement(s: string): string {
  return s.replace(/\\([ntr\\])/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : "\\"));
}
