/**
 * Background jobs: batches of conversions and installs, run one step at a time.
 *
 * A step is one program started with a list of arguments. Nothing here ever builds a shell command line, so file
 * names can contain anything without being able to change what runs. The page polls `list()` to show progress.
 *
 * Guarantees, each covered by tests:
 *  - a step that fails, is cancelled or times out never leaves a half-written output file behind;
 *  - a step that exits with 0 but makes no file (or an empty one) counts as failed;
 *  - cancelling stops the running program and skips the steps that have not started;
 *  - at most `maxRunning` jobs run at the same time, the rest wait their turn.
 *
 * File operations (copy, move, rename: see fmFileOps.ts) use the same hub. They add per-item paths, progress by files
 * and bytes (`null` totals mean "cannot be measured"), skipped items with a reason, a retry of only the items that did
 * not finish, and start/finish hooks that feed the persistent operation history (fmOpHistory.ts).
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";

export type JobState = "waiting" | "running" | "done" | "failed" | "cancelled";
export type StepState = "waiting" | "running" | "done" | "failed" | "skipped";
/** Why a step is "skipped": the person cancelled, or chose to leave that item alone. Only the first kind is retried. */
export type SkipReason = "cancelled" | "policy";

/** Thrown by a step's `work` to say "I chose not to do this item" (for example the person picked Skip for a name clash). */
export class StepSkip extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StepSkip";
  }
}

/** What a step reports while it works. */
export interface StepProgress {
  /** Bytes written since the last call. */
  bytes(count: number): void;
  /** Files finished since the last call (default 1). */
  files(count?: number): void;
  /** Records where the item went (and what was replaced), for the history and for Undo. */
  item(patch: Partial<StepItem>): void;
  /** A sentence shown next to the step. If the step is cancelled it replaces the plain "Cancelled." */
  note(text: string): void;
}

/** How big an item is. `null` from a measuring function means "unknown": the job then shows no total. */
export interface ItemSize {
  files: number;
  bytes: number;
}

/** The files an item is about. Paths only; nothing secret ever goes here. */
export interface StepItem {
  source: string;
  destination: string | null;
  /** Something that was in the way and was sent to the Recycle Bin first. */
  replacedTrashId?: string;
  bytes: number | null;
  files: number | null;
}

export interface PreparedStep {
  /** The program to run. Left out for a step that does its work in this process (see `work`). */
  argv?: string[];
  /** In-process work (the built-in converters): replaces starting a program. It must stop soon after `signal` aborts. */
  work?: (signal: AbortSignal, log: (text: string) => void, progress: StepProgress) => Promise<string | void>;
  /** Called after a successful run to move the result to its final place; throws if that is not possible. */
  publish?: () => Promise<void>;
  /** Always called when the step is over, whatever happened (removes temporary files). */
  cleanup?: () => Promise<void>;
}

export interface JobStepSpec {
  label: string;
  argv?: string[];
  prepare?: () => Promise<PreparedStep>;
  env?: Record<string, string>;
  cwd?: string;
  /** The file (or folder, see `outputKind`) this step creates. It must not exist yet; whatever is left of it after a failure is removed. */
  output?: string;
  outputKind?: "file" | "folder";
  timeoutMs?: number;
  /** The files this step is about (file operations). */
  item?: { source: string; destination?: string };
  /** Sizes the item before the job's steps run, so progress can be shown. Must stop soon after `signal` aborts. */
  measure?: (signal: AbortSignal) => Promise<ItemSize | null>;
  /** A step whose work finished is kept as done even if Cancel arrived at the same moment (the work cannot be half-done). */
  keepFinishedOnCancel?: boolean;
  /** Turns the program's error text into a sentence for the user. */
  explain?: (errorText: string, exitCode: number | null) => string;
}

export interface JobSpec {
  kind: "convert" | "install" | "permissions" | "graveyard" | "copy" | "move" | "rename" | "delete" | "mixed";
  title: string;
  steps: JobStepSpec[];
  /** Steps that did not finish can be run again with `retry`. */
  retryable?: boolean;
}

export interface StepView {
  label: string;
  state: StepState;
  message: string;
  output: string | null;
  item: StepItem | null;
  skipReason: SkipReason | null;
}

export interface JobProgress {
  /** True while the items are being sized, before anything is changed. */
  measuring: boolean;
  bytesDone: number;
  /** `null`: the total cannot be measured, so only the counts of items and files are meaningful. */
  bytesTotal: number | null;
  filesDone: number;
  filesTotal: number | null;
}

export interface JobView {
  id: string;
  kind: JobSpec["kind"];
  title: string;
  state: JobState;
  total: number;
  done: number;
  failed: number;
  /** Steps that did not run: cancelled, or left alone on purpose (see each step's `skipReason`). */
  skipped: number;
  progress: JobProgress;
  retryable: boolean;
  /** The job this one re-runs the unfinished items of, and the job that did so for this one. */
  retryOf: string | null;
  retriedBy: string | null;
  /** Label of the step that is running now. */
  current: string;
  steps: StepView[];
  /** Files that were made. */
  outputs: string[];
  /** The last lines the running or failed program wrote. */
  log: string;
  startedAt: number;
  finishedAt: number | null;
}

const MAX_TAIL = 8000;
const DEFAULT_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const MAX_JOBS = 30;

/** Called as jobs start and end (to keep the operation history). A failing hook never affects the job. */
export interface JobHooks {
  onStart?: (view: JobView) => void | Promise<void>;
  onFinish?: (view: JobView) => void | Promise<void>;
}

export interface JobHub {
  start(spec: JobSpec): JobView;
  /** Runs again only the steps of a finished job that failed or were cancelled. Returns null if there is nothing to retry. */
  retry(id: string): JobView | null;
  list(): JobView[];
  cancel(id: string): boolean;
  clearFinished(): number;
  cancelAll(): void;
  /** Resolves with the final state once the job is over (for tests and scripts). */
  whenDone(id: string): Promise<JobView>;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** The last meaningful line of a program's error text, as the generic explanation. */
export function lastLines(text: string, count = 1): string {
  const lines = text.replace(ANSI, "").split(/\r?\n|\r/).map((l) => l.trim()).filter(Boolean);
  return lines.slice(-count).join("\n").slice(0, 400);
}

async function exists(path: string): Promise<boolean> {
  try {
    await fsp.lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function safely(hook: ((view: JobView) => void | Promise<void>) | undefined, view: JobView): Promise<void> {
  try {
    await hook?.(view);
  } catch {
    // a failing history hook must never change what happens to the files
  }
}

interface InternalJob {
  view: JobView;
  spec: JobSpec;
  cancelled: boolean;
  proc: ReturnType<typeof Bun.spawn> | null;
  abort: AbortController | null;
  finished: Promise<void>;
  release: () => void;
}

export function createJobHub(maxRunning = 2, hooks: JobHooks = {}): JobHub {
  const jobs: InternalJob[] = [];
  let running = 0;
  const waiting: InternalJob[] = [];

  function trim() {
    while (jobs.length > MAX_JOBS) {
      const i = jobs.findIndex((j) => j.view.state !== "running" && j.view.state !== "waiting");
      if (i < 0) break;
      jobs.splice(i, 1);
    }
  }

  async function runStep(job: InternalJob, index: number): Promise<void> {
    const step = job.spec.steps[index]!;
    const view = job.view.steps[index]!;
    view.state = "running";
    job.view.current = step.label;
    job.view.log = "";
    let prepared: PreparedStep | null = null;
    let tail = "";
    const addTail = (chunk: string) => {
      tail = (tail + chunk).slice(-MAX_TAIL);
      job.view.log = tail.replace(ANSI, "").split(/\r?\n|\r/).filter((l) => l.trim()).slice(-12).join("\n");
    };
    // Only a file this step made may be removed. One that was already there belongs to the user.
    let mayRemoveOutput = false;
    const removeOutput = async () => {
      if (step.output && mayRemoveOutput) await fsp.rm(step.output, { force: true, recursive: step.outputKind === "folder" }).catch(() => {});
    };
    try {
      if (step.output && (await exists(step.output))) throw new Error("A file with that name already exists.");
      mayRemoveOutput = true;
      prepared = step.prepare ? await step.prepare() : { argv: step.argv ?? [] };
      let timedOut = false;
      let code: number | null = 0;
      let note = "";
      let workFinished = false;
      if (prepared.work) {
        const abort = new AbortController();
        job.abort = abort;
        const timer = setTimeout(() => { timedOut = true; abort.abort(); }, step.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        const progress: StepProgress = {
          bytes: (count) => { job.view.progress.bytesDone += count; },
          files: (count = 1) => { job.view.progress.filesDone += count; },
          item: (patch) => { view.item = { source: "", destination: null, bytes: null, files: null, ...view.item, ...patch }; },
          note: (text) => { view.message = text.slice(0, 600); },
        };
        try {
          note = (await prepared.work(abort.signal, addTail, progress)) ?? "";
          workFinished = true;
        } catch (err) {
          if (err instanceof StepSkip || (!job.cancelled && !timedOut)) throw err;
        } finally {
          clearTimeout(timer);
          job.abort = null;
        }
      } else {
        const argv = prepared.argv ?? [];
        if (!argv.length) throw new Error("Nothing to run.");
        let proc: ReturnType<typeof Bun.spawn>;
        try {
          proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: step.env, cwd: step.cwd });
        } catch (err: any) {
          throw new Error(err?.code === "ENOENT" ? "The program could not be found. Was it moved or uninstalled?" : `The program could not be started: ${err?.message ?? err}`);
        }
        job.proc = proc;
        const timer = setTimeout(() => { timedOut = true; try { proc.kill(); } catch {} }, step.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        const decoder = new TextDecoder();
        const readers: Array<{ cancel(): Promise<void> }> = [];
        const drain = async (stream: unknown) => {
          if (!stream || typeof (stream as ReadableStream).getReader !== "function") return;
          const reader = (stream as ReadableStream<Uint8Array>).getReader();
          readers.push(reader);
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              addTail(decoder.decode(value, { stream: true }));
            }
          } catch {
            // the stream closed because the program was stopped
          }
        };
        const draining = Promise.all([drain(proc.stdout), drain(proc.stderr)]);
        code = await proc.exited;
        // A program that started helpers (an installer, a shell script) can leave them holding the output open after it
        // ends or is stopped. Take what has arrived and move on instead of waiting for them.
        await Promise.race([draining, new Promise((r) => setTimeout(r, 1000))]);
        for (const r of readers) r.cancel().catch(() => {});
        clearTimeout(timer);
        job.proc = null;
      }

      if (job.cancelled && !(step.keepFinishedOnCancel && workFinished)) {
        view.state = "skipped";
        view.skipReason = "cancelled";
        view.message = view.message || "Cancelled.";
        await removeOutput();
        return;
      }
      if (timedOut) throw new Error("It took too long and was stopped.");
      if (code !== 0) {
        view.message = step.explain ? step.explain(tail, code) : lastLines(tail) || `It stopped with an error (code ${code}).`;
        view.state = "failed";
        await removeOutput();
        return;
      }
      if (prepared.publish) {
        try {
          await prepared.publish();
        } catch (err: any) {
          // A file with that name appeared while we worked. It is not ours, so it must stay.
          if (err?.code === "EEXIST" || err?.code === "ENOTEMPTY") {
            mayRemoveOutput = false;
            throw new Error("A file with that name appeared while this was running, so it was left alone and nothing was saved.");
          }
          throw err;
        }
      }
      if (step.output) {
        const st = await fsp.stat(step.output).catch(() => null);
        const folder = step.outputKind === "folder";
        const made = !!st && (folder ? st.isDirectory() && (await fsp.readdir(step.output).catch(() => [])).length > 0 : st.isFile() && st.size > 0);
        if (!made) {
          await removeOutput();
          view.state = "failed";
          view.message = folder ? "It finished but did not make any files." : "The program finished but did not make a file.";
          return;
        }
        view.output = step.output;
        job.view.outputs.push(step.output);
      }
      view.state = "done";
      // What a built-in converter could not keep exactly; shown beside the finished step.
      if (note) view.message = note.slice(0, 600);
    } catch (err: any) {
      if (err instanceof StepSkip) {
        view.state = "skipped";
        view.skipReason = "policy";
        view.message = err.message.slice(0, 600);
      } else {
        view.state = "failed";
        view.message = String(err?.message ?? err).slice(0, 600);
      }
      await removeOutput();
    } finally {
      job.proc = null;
      if (prepared?.cleanup) await prepared.cleanup().catch(() => {});
    }
  }

  async function measureJob(job: InternalJob): Promise<void> {
    if (!job.spec.steps.some((s) => s.measure)) return;
    const progress = job.view.progress;
    progress.measuring = true;
    const abort = new AbortController();
    job.abort = abort;
    let files: number | null = 0;
    let bytes: number | null = 0;
    try {
      for (let i = 0; i < job.spec.steps.length; i++) {
        if (job.cancelled) return;
        const measure = job.spec.steps[i]!.measure;
        const size = measure ? await measure(abort.signal).catch(() => null) : null;
        const view = job.view.steps[i]!;
        view.item = { source: "", destination: null, ...view.item, bytes: size?.bytes ?? null, files: size?.files ?? null };
        files = files === null || !size ? null : files + size.files;
        bytes = bytes === null || !size ? null : bytes + size.bytes;
      }
      progress.filesTotal = files;
      progress.bytesTotal = bytes;
    } finally {
      job.abort = null;
      progress.measuring = false;
    }
  }

  async function runJob(job: InternalJob): Promise<void> {
    running++;
    job.view.state = "running";
    await safely(hooks.onStart, job.view);
    try {
      await measureJob(job);
      for (let i = 0; i < job.spec.steps.length; i++) {
        if (job.cancelled) {
          for (let j = i; j < job.spec.steps.length; j++) {
            const s = job.view.steps[j]!;
            if (s.state === "waiting") { s.state = "skipped"; s.skipReason = "cancelled"; s.message = "Cancelled before it started. Nothing was changed."; job.view.skipped++; }
          }
          break;
        }
        await runStep(job, i);
        const s = job.view.steps[i]!;
        if (s.state === "done") job.view.done++;
        else if (s.state === "failed") job.view.failed++;
        else if (s.state === "skipped") job.view.skipped++;
      }
    } finally {
      job.view.current = "";
      job.view.finishedAt = Date.now();
      // "Cancelled" only if the request changed the outcome; a Cancel that arrived after the last item finished is moot.
      const cutShort = job.cancelled && job.view.steps.some((s) => s.skipReason === "cancelled");
      job.view.state = cutShort ? "cancelled" : job.view.failed > 0 ? "failed" : "done";
      running--;
      await safely(hooks.onFinish, job.view);
      job.release();
      const next = waiting.shift();
      if (next) void runJob(next);
    }
  }

  function create(spec: JobSpec, retryOf: string | null): JobView {
    let release!: () => void;
    const finished = new Promise<void>((r) => (release = r));
    const view: JobView = {
      id: randomBytes(6).toString("hex"),
      kind: spec.kind,
      title: spec.title,
      state: "waiting",
      total: spec.steps.length,
      done: 0,
      failed: 0,
      skipped: 0,
      progress: { measuring: false, bytesDone: 0, bytesTotal: null, filesDone: 0, filesTotal: null },
      retryable: spec.retryable === true,
      retryOf,
      retriedBy: null,
      current: "",
      steps: spec.steps.map((s) => ({
        label: s.label,
        state: "waiting",
        message: "",
        output: null,
        item: s.item ? { source: s.item.source, destination: s.item.destination ?? null, bytes: null, files: null } : null,
        skipReason: null,
      })),
      outputs: [],
      log: "",
      startedAt: Date.now(),
      finishedAt: null,
    };
    const job: InternalJob = { view, spec, cancelled: false, proc: null, abort: null, finished, release };
    jobs.push(job);
    trim();
    if (running < maxRunning) void runJob(job);
    else waiting.push(job);
    return view;
  }

  return {
    start(spec) {
      return create(spec, null);
    },
    retry(id) {
      const job = jobs.find((j) => j.view.id === id);
      if (!job || !job.spec.retryable || job.view.retriedBy || job.view.state === "running" || job.view.state === "waiting") return null;
      const again = job.view.steps.flatMap((s, i) => (s.state === "failed" || (s.state === "skipped" && s.skipReason === "cancelled") ? [i] : []));
      if (!again.length) return null;
      const view = create({ ...job.spec, title: `${job.spec.title} (retry)`, steps: again.map((i) => job.spec.steps[i]!) }, id);
      job.view.retriedBy = view.id;
      return view;
    },
    list() {
      return jobs.map((j) => j.view);
    },
    cancel(id) {
      const job = jobs.find((j) => j.view.id === id);
      if (!job || (job.view.state !== "running" && job.view.state !== "waiting")) return false;
      job.cancelled = true;
      if (job.view.state === "waiting") {
        const i = waiting.indexOf(job);
        if (i >= 0) waiting.splice(i, 1);
        for (const s of job.view.steps) { s.state = "skipped"; s.skipReason = "cancelled"; s.message = "Cancelled before it started. Nothing was changed."; }
        job.view.skipped = job.view.steps.length;
        job.view.state = "cancelled";
        job.view.finishedAt = Date.now();
        job.release();
      } else {
        try { job.proc?.kill(); } catch {}
        job.abort?.abort();
      }
      return true;
    },
    clearFinished() {
      let removed = 0;
      for (let i = jobs.length - 1; i >= 0; i--) {
        const s = jobs[i]!.view.state;
        if (s !== "running" && s !== "waiting") { jobs.splice(i, 1); removed++; }
      }
      return removed;
    },
    async whenDone(id) {
      const job = jobs.find((j) => j.view.id === id);
      if (!job) throw new Error("No such job.");
      await job.finished;
      return job.view;
    },
    cancelAll() {
      for (const j of jobs) if (j.view.state === "running" || j.view.state === "waiting") this.cancel(j.view.id);
    },
  };
}
