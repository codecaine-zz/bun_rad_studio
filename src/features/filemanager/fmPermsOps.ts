/**
 * The File Manager operations for changing permissions: perms/get, perms/plan, perms/apply, perms/undo, and
 * perms/progress and perms/cancel for long runs. Everything the page sends is checked here; the page never sends
 * a command line, and the risky cases are re-derived on the server (the page's own confirmation is not trusted).
 *
 * A run over a folder's contents goes through a job hub of its own (the same machinery as conversions), so it can be
 * cancelled, has a time limit, and reports how far it got.
 */
import type { FmContext, FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";
import { applyPerms, getPerms, planPerms, undoPerms, type RunControl } from "./fmPerms";
import { parseChange } from "./fmPermsModel";
import { hooksFor } from "./fmPermsSys";
import { createJobHub, type JobHub } from "./fmJobs";

interface Run {
  jobId: string | null;
  /** Stops the run even when the job has not started yet. */
  stop: () => void;
  phase: "checking" | "changing";
  done: number;
  changed: number;
  state: "running" | "finished";
}

interface Runs {
  hub: JobHub;
  runs: Map<string, Run>;
}

const registry = new WeakMap<FmContext, Runs>();

function runsFor(ctx: FmContext): Runs {
  let r = registry.get(ctx);
  if (!r) {
    r = { hub: createJobHub(2), runs: new Map() };
    registry.set(ctx, r);
    const hub = r.hub;
    ctx.disposers.push(() => hub.cancelAll());
  }
  return r;
}

function runIdOf(value: unknown): string {
  if (value === undefined || value === null) return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(value)) throw new FmError("BAD_REQUEST", "That run name isn't valid.");
  return value;
}

/** Runs `fn` as a job: cancellable by run id, time-limited, with progress. Resolves with what `fn` returns. */
async function inJob<T>(ctx: FmContext, runId: string, title: string, fn: (ctl: RunControl) => Promise<T>): Promise<T> {
  const { hub, runs } = runsFor(ctx);
  if (runs.get(runId)?.state === "running") throw new FmError("BUSY", "That is already running.");
  const own = new AbortController();
  const run: Run = { jobId: null, stop: () => own.abort(), phase: "checking", done: 0, changed: 0, state: "running" };
  runs.set(runId, run);
  let value: T | undefined;
  let failed: unknown;
  let ran = false;
  const limit = hooksFor(ctx).limits.maxMillis;
  const job = hub.start({
    kind: "permissions",
    title,
    steps: [{
      label: title,
      // The run stops itself at the limit; the hub's own timer is only a backstop.
      timeoutMs: limit + 15_000,
      prepare: async () => ({
        work: async (signal) => {
          ran = true;
          signal.addEventListener("abort", () => own.abort());
          try {
            value = await fn({ signal: own.signal, report: (phase, done, changed) => { run.phase = phase; run.done = done; run.changed = changed; } });
          } catch (err) {
            failed = err;
          }
        },
      }),
    }],
  });
  run.jobId = job.id;
  try {
    await hub.whenDone(job.id);
  } finally {
    run.state = "finished";
    for (const key of [...runs.keys()]) if (runs.size > 30 && runs.get(key)?.state === "finished" && key !== runId) runs.delete(key);
  }
  if (failed) throw failed;
  if (!ran) throw new FmError("CANCELLED", "Cancelled. Nothing was changed.");
  return value as T;
}

export const permsOperations: Record<string, FmHandler> = {
  async "perms/get"(ctx, b) {
    return await getPerms(ctx, hooksFor(ctx), b.paths);
  },
  async "perms/plan"(ctx, b) {
    const hooks = hooksFor(ctx);
    const change = parseChange(b.change, ctx.platform);
    const plan = change.recursive ? await inJob(ctx, runIdOf(b.runId), "Checking permissions", (ctl) => planPerms(ctx, hooks, b, ctl)) : await planPerms(ctx, hooks, b);
    return { plan };
  },
  async "perms/apply"(ctx, b) {
    const hooks = hooksFor(ctx);
    const change = parseChange(b.change, ctx.platform);
    const result = change.recursive ? await inJob(ctx, runIdOf(b.runId), "Changing permissions", (ctl) => applyPerms(ctx, hooks, b, ctl)) : await applyPerms(ctx, hooks, b);
    return { result };
  },
  async "perms/undo"(ctx, b) {
    return { result: await undoPerms(ctx, hooksFor(ctx), b.undo) };
  },
  async "perms/progress"(ctx, b) {
    const run = typeof b.runId === "string" ? registry.get(ctx)?.runs.get(b.runId) : undefined;
    return run ? { found: true, state: run.state, phase: run.phase, done: run.done, changed: run.changed } : { found: false, state: "finished", phase: "checking", done: 0, changed: 0 };
  },
  async "perms/cancel"(ctx, b) {
    const r = registry.get(ctx);
    const run = typeof b.runId === "string" ? r?.runs.get(b.runId) : undefined;
    if (!run || !run.jobId || run.state !== "running") return { cancelled: false };
    run.stop();
    r?.hub.cancel(run.jobId);
    return { cancelled: true };
  },
};
