/**
 * Starts a built-in conversion in a Bun Worker and waits for it. Aborting the signal ends the worker.
 */
import type { BuiltinJob } from "./fmConvBuiltin";

/** Runs the job and resolves with its note ("" when there is nothing to tell). Rejects with a plain-language Error. */
export function runBuiltinInWorker(job: BuiltinJob, signal: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Cancelled."));
    let worker: Worker;
    try {
      worker = new Worker(new URL("./fmConvWorker.ts", import.meta.url).href);
    } catch (err: any) {
      return reject(new Error(`The converter couldn't start: ${String(err?.message ?? err).slice(0, 200)}`));
    }
    let done = false;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      signal.removeEventListener("abort", onAbort);
      try { worker.terminate(); } catch {}
      settle();
    };
    const onAbort = () => finish(() => reject(new Error("Cancelled.")));
    signal.addEventListener("abort", onAbort);
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { ok: boolean; note?: string; message?: string };
      finish(() => (m.ok ? resolve(m.note ?? "") : reject(new Error(m.message ?? "That didn't work."))));
    };
    worker.onerror = (e: ErrorEvent) => finish(() => reject(new Error(`The converter stopped unexpectedly${e?.message ? ` (${String(e.message).slice(0, 160)})` : ""}.`)));
    worker.postMessage(job);
  });
}
