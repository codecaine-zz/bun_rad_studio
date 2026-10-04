// Feature: RAD - stateutils
// Persistent application state: OS-correct config/data/cache directories, an AppStateStore with
// atomic (temp+rename) saves, multi-level undo history, change subscriptions and partial patches,
// plus a tiny persistent KeyValueState built on top of it.

import os from "node:os";
import path from "node:path";
import { mkdir, rename, rm } from "node:fs/promises";

/** Options for {@link AppStateStore}. */
export interface AppStateOptions {
  /** Absolute/relative file path to persist to. Default: `<configDir>/<appName>/state.json`. */
  customPath?: string;
  /** Persist after every `update`/`patch`. Default `true`. */
  autoSave?: boolean;
  /** How many previous snapshots `rollback()` can step back through. Default `10`. */
  historyLimit?: number;
}

/** Callback fired after every state change with the new and previous state. */
export type StateListener<T> = (next: T, prev: T) => void;

function clone<T>(v: T): T {
  return structuredClone(v);
}

/**
 * OS-standard per-app **config** directory.
 * macOS `~/Library/Application Support/<app>` · Windows `%APPDATA%\<app>` · Linux `$XDG_CONFIG_HOME/<app>` (or `~/.config`).
 * @example `stateutils.resolveConfigDir("my-cli"); // "/Users/me/Library/Application Support/my-cli"`
 */
export function resolveConfigDir(appName: string): string {
  const platform = process.platform;
  let base: string;
  if (platform === "darwin") base = path.join(os.homedir(), "Library", "Application Support");
  else if (platform === "win32") base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  else base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, appName);
}

/**
 * OS-standard per-app **data** directory (databases, user content).
 * macOS same as config · Windows `%LOCALAPPDATA%\<app>` · Linux `$XDG_DATA_HOME/<app>` (or `~/.local/share`).
 * @example `stateutils.resolveDataDir("my-cli");`
 */
export function resolveDataDir(appName: string): string {
  const platform = process.platform;
  let base: string;
  if (platform === "darwin") base = path.join(os.homedir(), "Library", "Application Support");
  else if (platform === "win32") base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  else base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(base, appName);
}

/**
 * OS-standard per-app **cache** directory (safe to delete).
 * macOS `~/Library/Caches/<app>` · Windows `%LOCALAPPDATA%\<app>\Cache` · Linux `$XDG_CACHE_HOME/<app>` (or `~/.cache`).
 * @example `stateutils.resolveCacheDir("my-cli");`
 */
export function resolveCacheDir(appName: string): string {
  const platform = process.platform;
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Caches", appName);
  if (platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), appName, "Cache");
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), appName);
}

/**
 * Managed, persistent application state.
 * - Atomic saves (never leaves a half-written JSON file)
 * - Multi-level `rollback()` undo history
 * - `subscribe()` to react to changes
 * - `patch()` for shallow partial updates
 * @example
 * ```ts
 * const store = new AppStateStore("todo-app", { todos: [] as string[], theme: "dark" });
 * await store.load();
 * const off = store.subscribe((next) => console.log("todos:", next.todos.length));
 * await store.update((d) => { d.todos.push("ship it"); });
 * await store.patch({ theme: "light" });
 * store.rollback(); // theme back to "dark"
 * off();
 * ```
 */
export class AppStateStore<T extends Record<string, any>> {
  private current: T;
  private history: T[] = [];
  private listeners = new Set<StateListener<T>>();
  private readonly defaultData: T;
  readonly filePath: string;
  readonly autoSave: boolean;
  readonly historyLimit: number;

  constructor(appName: string, initialData: T, options: AppStateOptions = {}) {
    this.defaultData = clone(initialData);
    this.current = clone(initialData);
    this.autoSave = options.autoSave ?? true;
    this.historyLimit = Math.max(1, options.historyLimit ?? 10);
    this.filePath = options.customPath ?? path.join(resolveConfigDir(appName), "state.json");
  }

  /** Current state (live reference — mutate only through `update`/`patch`). */
  get(): T {
    return this.current;
  }

  /** Derive a value from the current state. @example `store.select((s) => s.todos.length)` */
  select<R>(selector: (state: T) => R): R {
    return selector(this.current);
  }

  /**
   * Mutate a draft in place **or** return a replacement object. Snapshots the previous state for
   * `rollback()`, notifies subscribers, and auto-saves when enabled.
   */
  async update(fn: (draft: T) => void | T): Promise<void> {
    const prev = clone(this.current);
    const result = fn(this.current);
    if (result !== undefined) this.current = result;
    this.commit(prev);
    if (this.autoSave) await this.save();
  }

  /** Shallow-merge `partial` into the state (same history/notify/save semantics as `update`). */
  async patch(partial: Partial<T>): Promise<void> {
    await this.update((draft) => {
      Object.assign(draft, partial);
    });
  }

  /** Register a change listener. @returns An unsubscribe function. */
  subscribe(listener: StateListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Atomically write the current state as pretty JSON (temp file + rename). */
  async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await Bun.write(tmp, JSON.stringify(this.current, null, 2));
      await rename(tmp, this.filePath);
    } catch (err: any) {
      await rm(tmp, { force: true });
      throw new Error(`[stateutils.AppStateStore] Failed to save ${this.filePath}: ${err.message}`);
    }
  }

  /**
   * Load persisted state, shallow-merged over defaults (so new default keys appear automatically).
   * A missing or corrupt file leaves the current state untouched.
   */
  async load(): Promise<T> {
    const file = Bun.file(this.filePath);
    if (!(await file.exists())) return this.current;
    try {
      const data = (await file.json()) as Partial<T>;
      this.current = { ...clone(this.defaultData), ...data };
      this.history = [];
    } catch {
      // Corrupt file: keep in-memory state so the app can still boot.
    }
    return this.current;
  }

  /** `true` when there is at least one snapshot to roll back to. */
  canRollback(): boolean {
    return this.history.length > 0;
  }

  /** Undo the most recent change (in memory; call `save()` to persist). No-op without history. */
  rollback(): void {
    const prev = this.history.pop();
    if (!prev) return;
    const before = this.current;
    this.current = prev;
    this.notify(before);
  }

  /** Restore initial defaults in memory (undoable via `rollback()`). */
  reset(): void {
    const prev = clone(this.current);
    this.current = clone(this.defaultData);
    this.commit(prev);
  }

  /** Delete the persisted file (in-memory state is kept). @returns `true` if a file was removed. */
  async removeFile(): Promise<boolean> {
    const existed = await Bun.file(this.filePath).exists();
    await rm(this.filePath, { force: true });
    return existed;
  }

  private commit(prev: T): void {
    this.history.push(prev);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.notify(prev);
  }

  private notify(prev: T): void {
    for (const l of this.listeners) l(this.current, prev);
  }
}

/**
 * Persistent string-keyed settings bag (auto-saved JSON).
 * @example
 * ```ts
 * const kv = new KeyValueState("my-cli", "/tmp/my-cli.json");
 * await kv.init();
 * await kv.set("token", "abc");
 * kv.get<string>("token"); // "abc"
 * ```
 */
export class KeyValueState {
  private store: AppStateStore<Record<string, any>>;

  constructor(appName: string, customPath?: string) {
    this.store = new AppStateStore(appName, {}, { customPath, autoSave: true });
  }

  /** Path of the backing JSON file. */
  get filePath(): string {
    return this.store.filePath;
  }

  /** Load persisted values. Call once before reading. */
  async init(): Promise<void> {
    await this.store.load();
  }

  /** Read a key, or `fallback` when absent. */
  get<T = any>(key: string, fallback?: T): T | undefined {
    const val = this.store.get()[key];
    return val !== undefined ? val : fallback;
  }

  /** `true` when the key is set. */
  has(key: string): boolean {
    return this.store.get()[key] !== undefined;
  }

  /** Persist one key. */
  async set(key: string, value: any): Promise<void> {
    await this.store.update((draft) => {
      draft[key] = value;
    });
  }

  /** Persist many keys in a single write. */
  async setMany(values: Record<string, any>): Promise<void> {
    await this.store.patch(values);
  }

  /** Remove a key. */
  async delete(key: string): Promise<void> {
    await this.store.update((draft) => {
      delete draft[key];
    });
  }

  /** All keys, insertion-ordered. */
  keys(): string[] {
    return Object.keys(this.store.get());
  }

  /** Shallow copy of every key/value. */
  all(): Record<string, any> {
    return { ...this.store.get() };
  }

  /** Remove every key and persist the empty object. */
  async clear(): Promise<void> {
    await this.store.update(() => ({}));
  }
}

export const stateutils = {
  resolveConfigDir,
  resolveDataDir,
  resolveCacheDir,
  AppStateStore,
  KeyValueState,
};
