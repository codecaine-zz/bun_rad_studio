/**
 * Type definitions for the `tokei` line-of-code counter feature, including
 * language specifications, per-file line statistics, aggregated language reports,
 * and CLI configuration options.
 */

/**
 * Defines single-line and multi-line comment delimiter tokens for a programming language.
 */
export interface CommentRule {
  single?: string[];
  multi?: [string, string][];
}

/**
 * Specification for a supported programming or markup language, mapping file
 * extensions to comment syntax rules.
 */
export interface LanguageSpec {
  name: string;
  extensions: string[];
  commentRule: CommentRule;
}

/**
 * Breakdown of total, blank, comment, and executable code line counts.
 */
export interface LineStats {
  lines: number;
  blank: number;
  comment: number;
  code: number;
}

/**
 * Line count statistics associated with a single analyzed source file.
 */
export interface FileStat {
  path: string;
  language: string;
  stats: LineStats;
}

/**
 * Aggregated line count statistics and individual file breakdowns for a single language.
 */
export interface LanguageReport {
  language: string;
  files: number;
  stats: LineStats;
  fileDetails: FileStat[];
}

/**
 * Metric column name used to sort aggregated language reports.
 */
export type TokeiSortField = "files" | "lines" | "blank" | "comment" | "code";

/**
 * Configuration options controlling `tokei` directory traversal, filtering, sorting, and output format.
 */
export interface TokeiOptions {
  paths: string[];
  sort: TokeiSortField;
  showFiles: boolean;
  hidden: boolean;
  json?: boolean;
  markdown?: boolean;
  excludes?: string[];
}
