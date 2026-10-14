/** Shapes shared by the Dev tab's code-statistics engines, snapshots and exports. */

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

export interface FileRow {
  path: string;
  language: string;
  code: number;
  comments: number;
  blanks: number;
  size: number;
}

export interface StatsTotals {
  files: number;
  code: number;
  comments: number;
  blanks: number;
  lines: number;
}

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

export interface StatsResult {
  engine: "tokei" | "builtin";
  /** "tokei 15.0.0" or "Built-in counter". */
  engineLabel: string;
  root: string;
  languages: LangRow[];
  totals: StatsTotals;
  skipped: { binary: number; tooBig: number; unknown: number; symlinks: number; ignored: number; hidden: number; vendored: number };
  /** Why the scan stopped early ("files", "folders", "time", "bytes"), or null. */
  stoppedBy: string | null;
  elapsedMs: number;
  options: StatsOptions;
  /** Plain-language remarks (a fallback happened, an option doesn't apply to this engine ...). */
  notes: string[];
  fileCount: number;
}

export const sumTotals = (rows: Array<Pick<LangRow, "files" | "code" | "comments" | "blanks">>): StatsTotals => {
  const t: StatsTotals = { files: 0, code: 0, comments: 0, blanks: 0, lines: 0 };
  for (const r of rows) {
    t.files += r.files;
    t.code += r.code;
    t.comments += r.comments;
    t.blanks += r.blanks;
  }
  t.lines = t.code + t.comments + t.blanks;
  return t;
};
