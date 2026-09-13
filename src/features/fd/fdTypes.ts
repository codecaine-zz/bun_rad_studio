export type EntryTypeFilter = "f" | "d" | "l" | "x";

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
