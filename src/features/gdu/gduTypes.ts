/**
 * Core data models and CLI option types for the `gdu` disk usage analyzer,
 * representing file/directory usage trees, mounted filesystems, and scan flags.
 */

/**
 * Recursive representation of a file or directory's disk consumption, item count, and modification time.
 */
export interface DiskUsageItem {
  name: string;
  path: string;
  size: number;
  itemCount: number;
  isDirectory: boolean;
  mtime: Date;
  children?: DiskUsageItem[];
}

/**
 * Capacity and mount point metadata for a mounted `/dev/*` filesystem parsed from `df -k`.
 */
export interface MountedDisk {
  filesystem: string;
  size: number;
  used: number;
  available: number;
  percentUsed: string;
  mountPoint: string;
}

/**
 * Sort criterion supported when ordering directory entries in `gdu`.
 */
export type GduSortBy = "size" | "name" | "count" | "mtime";

/**
 * Parsed command-line options controlling directory traversal, filtering, sorting, and output format in `gdu`.
 */
export interface GduOptions {
  targetDir: string;
  nonInteractive: boolean;
  showItemCount: boolean;
  showRelativeSize: boolean;
  showDisks: boolean;
  summarize: boolean;
  noHidden: boolean;
  top?: number;
  si: boolean;
  ignoreDirs: string[];
  maxDepth?: number;
  sortBy?: GduSortBy;
  minSize?: number | string;
  json?: boolean;
  noCross?: boolean;
}
