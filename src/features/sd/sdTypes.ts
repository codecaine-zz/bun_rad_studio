/**
 * Type definitions for the `sd` search-and-replace feature, including CLI
 * options, line-by-line diff hunks, and file transformation results.
 */

/**
 * Configuration options for a search-and-replace operation in `sd`.
 */
export interface SdOptions {
  findPattern: string;
  replacePattern: string;
  files: string[];
  stringMode: boolean;
  flags: string;
  preview: boolean;
  countOnly?: boolean;
  ignoreCase?: boolean;
  backupExt?: string;
  wholeWord?: boolean;
  quiet?: boolean;
}

/**
 * Represents a single modified line in a file transformation diff.
 */
export interface DiffHunk {
  lineNumber: number;
  original: string;
  modified: string;
}

/**
 * Result of applying a search-and-replace regex to a single file, including
 * original content, updated content, and line diff hunks.
 */
export interface FileTransformResult {
  filePath: string;
  hasChanged: boolean;
  originalContent: string;
  newContent: string;
  diffHunks: DiffHunk[];
}
