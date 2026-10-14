/**
 * The Replace tool's per-server memory (the last previews, the undo list, running workers) and the helper that runs
 * a job in a worker with a hard time limit.
 */
import type { FmContext } from "./fmCore";
import { FmError, describeFsError } from "./fmPaths";
import { SD_TIMEOUT_MS, type SdFileResult, type SdScanOutcome, type SdSpec } from "./fmSdShared";

export const MAX_SD_WORKERS = 2;
export const MAX_PREVIEWS = 6;

export interface SdPreview {
  id: string;
  mode: "count" | "preview";
  spec: SdSpec;
  /** When the preview was made (ms). */
  at: number;
  targets: string[];
  files: SdFileResult[];
  outcome: SdScanOutcome;
  durationMs: number;
  /** Files already replaced from this preview, with what happened. */
  applied: Map<string, string>;
}

export interface SdUndoFile {
  path: string;
  original: Buffer;
  /** SHA-256 and size of the content the replace wrote: Undo only restores a file that still has exactly this. */
  updatedHash: string;
  mode: number;
  backup: string | null;
  replacements: number;
}

export interface SdUndoRun {
  id: string;
  at: number;
  find: string;
  replace: string;
  files: SdUndoFile[];
}

export interface SdState {
  previews: Map<string, SdPreview>;
  undo: SdUndoRun[];
  workers: Set<Worker>;
  /** How long a worker job may run. Tests make it short. */
  timeoutMs: number;
  /** True while a replace or an undo is writing files, so two can't run at once. */
  writing: boolean;
}

const states = new WeakMap<FmContext, SdState>();

export function sdState(ctx: FmContext): SdState {
  let state = states.get(ctx);
  if (!state) {
    const created: SdState = { previews: new Map(), undo: [], workers: new Set(), timeoutMs: SD_TIMEOUT_MS, writing: false };
    state = created;
    states.set(ctx, created);
    ctx.disposers.push(() => {
      for (const w of created.workers) {
        try { w.terminate(); } catch {}
      }
      created.workers.clear();
      created.previews.clear();
      created.undo.length = 0;
    });
  }
  return state;
}

/** Runs `job` in a new worker. After the time limit the worker is ended and a plain "took too long" error is thrown. */
export function runSdJob<T>(ctx: FmContext, job: unknown, timeoutMs?: number): Promise<T> {
  const state = sdState(ctx);
  if (state.workers.size >= MAX_SD_WORKERS) {
    return Promise.reject(new FmError("BUSY", "Another search is still running. Wait for it to finish and try again."));
  }
  const limit = timeoutMs ?? state.timeoutMs;
  return new Promise<T>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./fmSdWorker.ts", import.meta.url).href);
    } catch (err) {
      return reject(new FmError("WORKER_FAILED", `The search couldn't start: ${describeFsError(err).message}`));
    }
    state.workers.add(worker);
    let done = false;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      state.workers.delete(worker);
      try { worker.terminate(); } catch {}
      settle();
    };
    const timer = setTimeout(
      () => finish(() => reject(new FmError("TIMEOUT", `That took longer than ${Math.max(1, Math.round(limit / 1000))} seconds, so it was stopped and nothing was changed. The pattern may be too complicated for this text: try a simpler one, or fewer files.`))),
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
