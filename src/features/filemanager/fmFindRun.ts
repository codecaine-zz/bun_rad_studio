/**
 * The Find tool's per-server state (recent results, live watchers, running workers and programs) and the helper
 * that runs a heavy job in a worker with a hard time limit.
 */
import type { ChildProcess } from "child_process";
import type { FSWatcher } from "fs";
import type { FmContext } from "./fmCore";
import { FmError, describeFsError } from "./fmPaths";
import { FIND_TIMEOUT_MS, MAX_WORKERS, type FindItem, type WorkerJob } from "./fmFindShared";

export interface StoredResults {
  id: string;
  root: string;
  items: FindItem[];
  at: number;
}

export interface LiveWatcher {
  id: string;
  root: string;
  hidden: boolean;
  changes: number;
  lastName: string;
  failed: string | null;
  watcher: FSWatcher;
  idle: ReturnType<typeof setTimeout>;
}

export interface FindState {
  results: Map<string, StoredResults>;
  watchers: Map<string, LiveWatcher>;
  /** Running workers, each with the function that ends its job. */
  workers: Map<Worker, () => void>;
  children: Set<ChildProcess>;
  /** How long a worker job may run. Tests make it short. */
  timeoutMs: number;
}

const states = new WeakMap<FmContext, FindState>();

export function findState(ctx: FmContext): FindState {
  let state = states.get(ctx);
  if (!state) {
    const created: FindState = { results: new Map(), watchers: new Map(), workers: new Map(), children: new Set(), timeoutMs: FIND_TIMEOUT_MS };
    state = created;
    states.set(ctx, created);
    ctx.disposers.push(() => {
      for (const w of created.watchers.values()) {
        clearTimeout(w.idle);
        try { w.watcher.close(); } catch {}
      }
      created.watchers.clear();
      for (const stop of [...created.workers.values()]) stop();
      created.workers.clear();
      for (const child of created.children) {
        try { child.kill("SIGKILL"); } catch {}
      }
      created.children.clear();
      created.results.clear();
    });
  }
  return state;
}

/**
 * Runs `job` in a new worker. After `timeoutMs` the worker is ended and a plain "took too long" error is thrown,
 * so a huge folder or a runaway pattern can't hold the server up.
 */
export function runWorkerJob<T>(ctx: FmContext, job: WorkerJob, timeoutMs?: number): Promise<T> {
  const state = findState(ctx);
  if (state.workers.size >= MAX_WORKERS) {
    return Promise.reject(new FmError("BUSY", "Too many searches are running at once. Wait for one to finish and try again."));
  }
  const limit = timeoutMs ?? state.timeoutMs;
  return new Promise<T>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./fmFindWorker.ts", import.meta.url).href);
    } catch (err) {
      return reject(new FmError("WORKER_FAILED", `The search couldn't start: ${describeFsError(err).message}`));
    }
    let done = false;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      state.workers.delete(worker);
      try { worker.terminate(); } catch {}
      settle();
    };
    state.workers.set(worker, () => finish(() => reject(new FmError("CANCELLED", "The File Manager is closing, so the search was stopped."))));
    const timer = setTimeout(
      () => finish(() => reject(new FmError("TIMEOUT", `That took longer than ${Math.max(1, Math.round(limit / 1000))} seconds, so it was stopped. Try a smaller folder, a more exact pattern, or fewer items.`))),
      limit,
    );
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { ok: boolean; result?: T; code?: string; message?: string };
      finish(() => {
        if (m.ok) return resolve(m.result as T);
        const code = m.code ?? "UNKNOWN";
        if (/^E[A-Z]+$/.test(code)) {
          const info = describeFsError(Object.assign(new Error(m.message ?? "failed"), { code }));
          return reject(new FmError(info.code, info.message));
        }
        reject(new FmError(code, m.message ?? "That didn't work."));
      });
    };
    worker.onerror = (e: ErrorEvent) => finish(() => reject(new FmError("WORKER_FAILED", `The search stopped unexpectedly${e?.message ? ` (${e.message})` : ""}.`)));
    worker.postMessage(job);
  });
}
