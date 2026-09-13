export type SortField = "cpu" | "mem" | "pid" | "user";

export interface ProcessInfo {
  pid: number;
  ppid: number;
  user: string;
  cpu: number;
  mem: number;
  stat: string;
  time: string;
  command: string;
  ports?: string[];
}

export interface ProcessTreeNode {
  process: ProcessInfo;
  children: ProcessTreeNode[];
}

export interface ProcsOptions {
  keyword?: string;
  user?: string;
  tree: boolean;
  sortBy?: SortField;
  watch: boolean;
  limit?: number;
  json?: boolean;
  ports?: boolean;
  killPid?: number;
  signal?: string;
  interactive?: boolean;
}
