/**
 * Type definitions for the `procs` process viewer, including process records, hierarchical
 * parent-child tree nodes, sort columns, and CLI configuration options.
 */

/**
 * Column field used to sort the process list.
 */
export type SortField = "cpu" | "mem" | "pid" | "user";

/**
 * Snapshot of a single OS process parsed from `ps` and optionally enriched with listening TCP ports.
 */
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

/**
 * Node in a parent-child process hierarchy built from `pid` and `ppid` relationships.
 */
export interface ProcessTreeNode {
  process: ProcessInfo;
  children: ProcessTreeNode[];
}

/**
 * Parsed CLI options controlling process filtering, sorting, tree rendering, port inspection, and termination.
 */
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
