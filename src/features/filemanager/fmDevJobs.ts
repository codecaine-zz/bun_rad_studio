/**
 * Long-running work of the Dev tab (code statistics, disk breakdown, TODO scan, duplicate search) as small jobs the
 * page polls: `dev/job/poll {id, since}` answers quickly with the progress and, once finished, the result; the
 * page passes back the `seq` it last saw, so an unchanged job costs almost nothing. `dev/job/cancel` stops one.
 */
import { randomBytes } from "crypto";
import type { FmContext } from "./fmCore";
import { FmError } from "./fmPaths";
import type { Cancellable } from "./fmDevWalk";

export type DevJobKind = "stats" | "disk" | "todo" | "dupes";
export type DevJobState = "running" | "done" | "failed" | "cancelled";

export interface DevJob extends Cancellable {
  id: string;
  kind: DevJobKind;
  root: string;
  state: DevJobState;
  /** Goes up whenever something about the job changes (progress, state, result). */
  seq: number;
  startedAt: number;
  finishedAt: number | null;
  progress: Record<string, number | string | null>;
  /** What the page gets when the job is done. */
  result: unknown;
  /** What stays on the server (the per-file table that the page asks for in pages). */
  data: any;
  error: { code: string; message: string } | null;
}

const MAX_RUNNING = 3;
const MAX_KEPT = 12;
const registries = new WeakMap<FmContext, Map<string, DevJob>>();

function registry(ctx: FmContext): Map<string, DevJob> {
  let reg = registries.get(ctx);
  if (!reg) {
    const created = new Map<string, DevJob>();
    reg = created;
    registries.set(ctx, created);
    ctx.disposers.push(() => {
      for (const job of created.values()) job.cancelled = true;
    });
  }
  return reg;
}

export function setProgress(job: DevJob, patch: Record<string, number | string | null>): void {
  Object.assign(job.progress, patch);
  job.seq++;
}

export function startDevJob(ctx: FmContext, kind: DevJobKind, root: string, run: (job: DevJob) => Promise<unknown>): DevJob {
  const reg = registry(ctx);
  if ([...reg.values()].filter((j) => j.state === "running").length >= MAX_RUNNING) throw new FmError("BUSY", "Several scans are already running. Wait for one to finish or cancel it.");
  const job: DevJob = { id: randomBytes(6).toString("hex"), kind, root, state: "running", seq: 1, startedAt: Date.now(), finishedAt: null, progress: {}, result: null, data: null, error: null, cancelled: false };
  reg.set(job.id, job);
  for (const [id, old] of reg) {
    if (reg.size <= MAX_KEPT) break;
    if (old.state !== "running" && id !== job.id) reg.delete(id);
  }
  run(job).then(
    (result) => {
      job.result = result;
      job.state = job.cancelled ? "cancelled" : "done";
    },
    (err) => {
      job.state = "failed";
      job.error = err instanceof FmError ? { code: err.code, message: err.message } : { code: "FAILED", message: String((err as Error)?.message ?? err).slice(0, 300) };
    },
  ).finally(() => {
    job.finishedAt = Date.now();
    job.seq++;
  });
  return job;
}

/** A job of the given kind(s) by id, or an error that says what to do. */
export function findDevJob(ctx: FmContext, id: unknown, kinds?: DevJobKind[]): DevJob {
  const job = typeof id === "string" ? registry(ctx).get(id) : undefined;
  if (!job || (kinds && !kinds.includes(job.kind))) throw new FmError("NO_JOB", "That scan isn't available any more. Run it again.");
  return job;
}

export function pollDevJob(ctx: FmContext, body: Record<string, any>): Record<string, unknown> {
  const job = findDevJob(ctx, body.id);
  const since = typeof body.since === "number" ? body.since : 0;
  const view: Record<string, unknown> = { id: job.id, kind: job.kind, root: job.root, state: job.state, seq: job.seq, elapsedMs: (job.finishedAt ?? Date.now()) - job.startedAt, progress: job.progress };
  if (since === job.seq && job.state === "running") return { ...view, unchanged: true };
  if (job.state === "done" || job.state === "cancelled") view.result = job.result;
  if (job.state === "failed") view.error = job.error;
  return view;
}

export function cancelDevJob(ctx: FmContext, body: Record<string, any>): Record<string, unknown> {
  const job = findDevJob(ctx, body.id);
  if (job.state === "running") {
    job.cancelled = true;
    job.seq++;
  }
  return { cancelled: job.state === "running" || job.state === "cancelled" };
}
