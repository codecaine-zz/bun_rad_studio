/**
 * Type definitions for the `fd` fast file-finding feature, including entry-type
 * filters, CLI search options, and discovered filesystem entry metadata.
 */

/**
 * Filter code restricting search results to files (`"f"`), directories (`"d"`),
 * symbolic links (`"l"`), or executable files (`"x"`).
 */
export type EntryTypeFilter = "f" | "d" | "l" | "x";

/**
 * Configuration options controlling `fd` directory traversal, filtering, and command execution.
 */
export interface FdOptions {
  pattern?: string;
  rootPath: string;
  typeFilter?: EntryTypeFilter;
  extension?: string;
  hidden: boolean;
  maxDepth?: number;
  absolute: boolean;
  caseSensitive?: boolean;
  execCmd?: string[];
  exclude?: string[];
  sizeFilter?: string;
  minDepth?: number;
  changedWithin?: string;
  empty?: boolean;
}

/**
 * Metadata describing a single filesystem entry discovered during an `fd` traversal.
 */
export interface FdEntry {
  path: string;
  displayPath: string;
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  isExecutable: boolean;
  depth: number;
  size?: number;
  mtime?: Date;
}
