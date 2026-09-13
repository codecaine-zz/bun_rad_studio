import type { Subprocess } from "bun";

export interface WatchexecOptions {
  watchPaths: string[];
  command: string[];
  extensions?: string[];
  filterPatterns?: string[];
  ignorePatterns: string[];
  debounceMs: number;
  clear: boolean;
  restart: boolean;
  runOnStart: boolean;
  shell?: string;
}

export interface WatcherEvent {
  eventType: string;
  filename: string;
}

export interface ProcessState {
  currentProcess: Subprocess | null;
}
