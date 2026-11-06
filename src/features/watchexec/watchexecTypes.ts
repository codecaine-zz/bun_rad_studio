/**
 * Type definitions for the `watchexec` file-watching command runner, including
 * watcher configuration options, filesystem change events, and active process state.
 */
import type { Subprocess } from "bun";

/**
 * Configuration options controlling `watchexec` watched paths, filters, debouncing, and command execution.
 */
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

/**
 * Represents a filesystem modification event emitted by the watcher.
 */
export interface WatcherEvent {
  eventType: string;
  filename: string;
}

/**
 * Mutable container holding a reference to the currently running child `Subprocess`, if any.
 */
export interface ProcessState {
  currentProcess: Subprocess | null;
}
