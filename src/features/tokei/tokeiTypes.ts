export interface CommentRule {
  single?: string[];
  multi?: [string, string][];
}

export interface LanguageSpec {
  name: string;
  extensions: string[];
  commentRule: CommentRule;
}

export interface LineStats {
  lines: number;
  blank: number;
  comment: number;
  code: number;
}

export interface FileStat {
  path: string;
  language: string;
  stats: LineStats;
}

export interface LanguageReport {
  language: string;
  files: number;
  stats: LineStats;
  fileDetails: FileStat[];
}

export type TokeiSortField = "files" | "lines" | "blank" | "comment" | "code";

export interface TokeiOptions {
  paths: string[];
  sort: TokeiSortField;
  showFiles: boolean;
  hidden: boolean;
  json?: boolean;
  markdown?: boolean;
  excludes?: string[];
}
