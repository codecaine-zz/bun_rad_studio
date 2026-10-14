/**
 * The in-process task hub of the vault tool: one background task per "Encrypt" or "Decrypt" request, with progress,
 * per-item results and cancel. The password is only ever held in this module's closure while a task runs: it is never
 * stored on the task, never part of a view, a result or an error message.
 */
import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";
import { pathApi, type FmContext } from "./fmCore";
import { decryptFile, encryptItem, vaultErrorInfo } from "./fmVaultEngine";
import { scanSource, type ScanResult } from "./fmVaultWalk";
import type { KdfParams, Level } from "./fmVaultFormat";
import { moveToTrash } from "./fmTrash";
import { FmError } from "./fmPaths";

export const VAULT_LIMITS = { maxItems: 200, maxRunningTasks: 2, maxKeptTasks: 20 } as const;

export type ItemState = "waiting" | "working" | "done" | "error" | "cancelled";

export interface VaultItem {
  path: string;
  name: string;
  state: ItemState;
  output?: string;
  outputName?: string;
  kind?: "file" | "folder";
  entries?: number;
  plainBytes?: number;
  cipherBytes?: number;
  warnings: string[];
  error?: { code: string; message: string };
  /** The original was moved to the Recycle Bin after the result was checked. */
  trashed?: boolean;
  trashMessage?: string;
}

export interface VaultTask {
  id: string;
  kind: "encrypt" | "decrypt";
  state: "running" | "done" | "cancelled" | "failed";
  phase: "scanning" | "deriving" | "encrypting" | "verifying" | "decrypting" | "finishing" | "idle";
  current: string | null;
  currentIndex: number;
  bytesDone: number;
  bytesTotal: number;
  items: VaultItem[];
  startedAt: number;
  finishedAt?: number;
  version: number;
  controller: AbortController;
  finished: Promise<void>;
}

export interface VaultInternal {
  kdf?: KdfParams;
  chunkLog2?: number;
  afterWrite?: (tempPath: string) => Promise<void>;
}

interface VaultState {
  tasks: Map<string, VaultTask>;
  counter: number;
  internal: VaultInternal;
}

const states = new WeakMap<FmContext, VaultState>();

export function vaultState(ctx: FmContext): VaultState {
  let state = states.get(ctx);
  if (state) return state;
  const created: VaultState = { tasks: new Map(), counter: 0, internal: {} };
  states.set(ctx, created);
  ctx.disposers.push(() => {
    for (const task of created.tasks.values()) task.controller.abort();
  });
  return created;
}

/** For tests only (never reachable from the API): cheaper key derivation and a hook that runs after a file is written. */
export function setVaultInternal(ctx: FmContext, internal: VaultInternal): void {
  vaultState(ctx).internal = internal;
}

export function findTask(ctx: FmContext, id: unknown): VaultTask {
  const task = typeof id === "string" ? vaultState(ctx).tasks.get(id) : undefined;
  if (!task) throw new FmError("NOT_FOUND", "That task no longer exists.");
  return task;
}

export function snapshot(task: VaultTask, since?: number) {
  const base = { id: task.id, kind: task.kind, state: task.state, phase: task.phase, version: task.version };
  if (since !== undefined && since === task.version) return { ...base, unchanged: true as const };
  return {
    ...base,
    current: task.current,
    currentIndex: task.currentIndex,
    total: task.items.length,
    bytesDone: task.bytesDone,
    bytesTotal: task.bytesTotal,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    items: task.items.map((i) => ({ ...i, warnings: [...i.warnings] })),
  };
}

function touch(task: VaultTask): void {
  task.version++;
}

function register(ctx: FmContext, kind: "encrypt" | "decrypt", paths: string[], run: (task: VaultTask) => Promise<void>): VaultTask {
  const state = vaultState(ctx);
  const running = [...state.tasks.values()].filter((t) => t.state === "running").length;
  if (running >= VAULT_LIMITS.maxRunningTasks) throw new FmError("BUSY", `${VAULT_LIMITS.maxRunningTasks} lock or unlock jobs are already running. Wait for one to finish, then try again.`);
  const p = pathApi(ctx);
  const task: VaultTask = {
    id: `v${++state.counter}`,
    kind,
    state: "running",
    phase: "idle",
    current: null,
    currentIndex: 0,
    bytesDone: 0,
    bytesTotal: 0,
    items: paths.map((path) => ({ path, name: p.basename(path), state: "waiting", warnings: [] })),
    startedAt: Date.now(),
    version: 0,
    controller: new AbortController(),
    finished: Promise.resolve(),
  };
  state.tasks.set(task.id, task);
  task.finished = run(task)
    .catch(() => {
      task.state = "failed";
    })
    .finally(() => {
      task.finishedAt = Date.now();
      task.phase = "idle";
      task.current = null;
      if (task.state === "running") {
        const results = task.items;
        task.state = task.controller.signal.aborted ? "cancelled" : results.length > 0 && results.every((i) => i.state === "error") ? "failed" : "done";
      }
      touch(task);
      const finished = [...state.tasks.values()].filter((t) => t.state !== "running");
      for (const old of finished.slice(0, Math.max(0, finished.length - VAULT_LIMITS.maxKeptTasks))) state.tasks.delete(old.id);
    });
  return task;
}

/** After a successful result only: moves the original to the Recycle Bin. A failure here is reported, never fatal. */
async function trashOriginal(ctx: FmContext, item: VaultItem): Promise<void> {
  try {
    const [res] = await moveToTrash(ctx, [item.path]);
    if (res?.ok) item.trashed = true;
    else item.trashMessage = `The result is safe, but the original couldn't be moved to the Recycle Bin: ${res?.message ?? "unknown reason"}`;
  } catch (err) {
    item.trashMessage = `The result is safe, but the original couldn't be moved to the Recycle Bin: ${vaultErrorInfo(err).message}`;
  }
}

function fail(item: VaultItem, err: unknown, what: string): void {
  const info = vaultErrorInfo(err, what);
  if (info.code === "CANCELLED") {
    item.state = "cancelled";
  } else {
    item.state = "error";
    item.error = info;
  }
}

export interface EncryptParams {
  paths: string[];
  password: string;
  level: Level;
  compress: boolean;
  hideName: boolean;
  /** One folder for every result; null puts each result next to its original. */
  outputDir: string | null;
  afterwards: "keep" | "trash";
}

export function startEncrypt(ctx: FmContext, params: EncryptParams): VaultTask {
  const { internal } = vaultState(ctx);
  const password = params.password;
  return register(ctx, "encrypt", params.paths, async (task) => {
    const { signal } = task.controller;
    const scans = new Map<number, ScanResult>();
    task.phase = "scanning";
    touch(task);
    for (const [i, item] of task.items.entries()) {
      if (signal.aborted) break;
      try {
        const scan = await scanSource(item.path, signal);
        scans.set(i, scan);
        task.bytesTotal += scan.bytes;
      } catch (err) {
        fail(item, err, "read that");
      }
    }
    touch(task);
    for (const [i, item] of task.items.entries()) {
      if (item.state === "error") continue;
      if (signal.aborted) {
        item.state = "cancelled";
        continue;
      }
      task.currentIndex = i;
      task.current = item.name;
      item.state = "working";
      touch(task);
      try {
        const result = await encryptItem({
          source: item.path,
          outputDir: params.outputDir ?? nodePath.dirname(item.path),
          password,
          level: params.level,
          compress: params.compress,
          hideName: params.hideName,
          platform: ctx.platform,
          signal,
          scan: scans.get(i),
          internal,
          onPhase: (phase) => {
            task.phase = phase;
            touch(task);
          },
          onBytes: (n, phase) => {
            if (phase === "encrypting") task.bytesDone += n;
            touch(task);
          },
        });
        Object.assign(item, { state: "done", output: result.output, outputName: result.outputName, kind: result.kind, entries: result.entries, plainBytes: result.plainBytes, cipherBytes: result.cipherBytes, warnings: result.warnings });
        if (params.afterwards === "trash") await trashOriginal(ctx, item);
      } catch (err) {
        fail(item, err, "write the encrypted file");
      }
      touch(task);
    }
  });
}

export interface DecryptParams {
  paths: string[];
  password: string;
  outputDir: string | null;
  afterwards: "keep" | "trash";
}

export function startDecrypt(ctx: FmContext, params: DecryptParams): VaultTask {
  const password = params.password;
  return register(ctx, "decrypt", params.paths, async (task) => {
    const { signal } = task.controller;
    task.phase = "scanning";
    for (const item of task.items) {
      try {
        task.bytesTotal += (await fsp.stat(item.path)).size;
      } catch {
        // reported when its turn comes
      }
    }
    touch(task);
    for (const [i, item] of task.items.entries()) {
      if (signal.aborted) {
        item.state = "cancelled";
        continue;
      }
      task.currentIndex = i;
      task.current = item.name;
      item.state = "working";
      touch(task);
      try {
        const result = await decryptFile({
          source: item.path,
          outputDir: params.outputDir ?? nodePath.dirname(item.path),
          password,
          platform: ctx.platform,
          signal,
          onPhase: (phase) => {
            task.phase = phase;
            touch(task);
          },
          onBytes: (n) => {
            task.bytesDone += n;
            touch(task);
          },
        });
        Object.assign(item, { state: "done", output: result.output, outputName: result.outputName, kind: result.kind, entries: result.entries, plainBytes: result.plainBytes });
        if (params.afterwards === "trash") await trashOriginal(ctx, item);
      } catch (err) {
        fail(item, err, "read that file");
      }
      touch(task);
    }
  });
}
