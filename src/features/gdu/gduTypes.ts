export interface DiskUsageItem {
  name: string;
  path: string;
  size: number;
  itemCount: number;
  isDirectory: boolean;
  mtime: Date;
  children?: DiskUsageItem[];
}

export interface MountedDisk {
  filesystem: string;
  size: number;
  used: number;
  available: number;
  percentUsed: string;
  mountPoint: string;
}

export type GduSortBy = "size" | "name" | "count" | "mtime";

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
}
