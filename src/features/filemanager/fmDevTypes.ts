/** Shapes shared by the Dev tab's code-statistics engines, snapshots and exports. */

/** Aggregated file, code, comment, blank, line, and byte counts for a single programming language. */
export interface LangRow {
  name: string;
  files: number;
  code: number;
  comments: number;
  blanks: number;
  /** code + comments + blanks */
  lines: number;
  /** Bytes of the files counted (0 when the engine doesn't report it). */
  bytes: number;
}

/** Code, comment, blank, line, and byte counts for an individual source file. */
export interface FileRow {
  path: string;
  language: string;
  code: number;
  comments: number;
  blanks: number;
  size: number;
}

/** Grand total file, code, comment, blank, line, and byte counts across all scanned languages. */
export interface StatsTotals {
  files: number;
  code: number;
  comments: number;
  blanks: number;
  lines: number;
}

/** Configuration options for a code statistics scan (engine choice, gitignore, hidden/vendored files, and walk limits). */
export interface StatsOptions {
  engine: "auto" | "tokei" | "builtin";
  respectGitignore: boolean;
  hidden: boolean;
  vendored: boolean;
  excludes: string[];
  docAsComment: boolean;
  maxFiles?: number;
  maxDirs?: number;
  maxSeconds?: number;
}

/** Complete code statistics report including engine info, totals, per-language rows, per-file rows, and walk summary. */
export interface StatsResult {
  engine: "tokei" | "builtin";
  /** "tokei 15.0.0" or "Built-in counter". */
  engineLabel: string;
  root: string;
  languages: LangRow[];
  totals: StatsTotals;
  skipped: {
    binary: number;
    tooBig: number;
    unknown: number;
    symlinks: number;
    ignored: number;
    hidden: number;
    vendored: number;
  };
  /** Why the scan stopped early ("files", "folders", "time", "bytes"), or null. */
  stoppedBy: string | null;
  elapsedMs: number;
  options: StatsOptions;
  /** Plain-language remarks (a fallback happened, an option doesn't apply to this engine ...). */
  notes: string[];
  fileCount: number;
}

/** Sums `files`, `code`, `comments`, `blanks`, `lines`, and `bytes` across an array of language rows. */
export const sumTotals = (
  rows: Array<Pick<LangRow, "files" | "code" | "comments" | "blanks">>,
): StatsTotals => {
  const t: StatsTotals = {
    files: 0,
    code: 0,
    comments: 0,
    blanks: 0,
    lines: 0,
  };
  for (const r of rows) {
    t.files += r.files;
    t.code += r.code;
    t.comments += r.comments;
    t.blanks += r.blanks;
  }
  t.lines = t.code + t.comments + t.blanks;
  return t;
};
