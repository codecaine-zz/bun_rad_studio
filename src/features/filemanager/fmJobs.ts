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
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";

export type JobState = "waiting" | "running" | "done" | "failed" | "cancelled";
export type StepState = "waiting" | "running" | "done" | "failed" | "skipped";

export interface PreparedStep {
  /** The program to run. Left out for a step that does its work in this process (see `work`). */
  argv?: string[];
  /** In-process work (the built-in converters): replaces starting a program. It must stop soon after `signal` aborts. */
  work?: (signal: AbortSignal, log: (text: string) => void) => Promise<string | void>;
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
  /** Turns the program's error text into a sentence for the user. */
  explain?: (errorText: string, exitCode: number | null) => string;
}

export interface JobSpec {
  kind: "convert" | "install" | "permissions" | "graveyard";
  title: string;
  steps: JobStepSpec[];
}

export interface StepView {
  label: string;
  state: StepState;
  message: string;
  output: string | null;
}

export interface JobView {
  id: string;
  kind: JobSpec["kind"];
  title: string;
  state: JobState;
  total: number;
  done: number;
  failed: number;
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

export interface JobHub {
  start(spec: JobSpec): JobView;
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

interface InternalJob {
  view: JobView;
  spec: JobSpec;
  cancelled: boolean;
  proc: ReturnType<typeof Bun.spawn> | null;
  abort: AbortController | null;
  finished: Promise<void>;
  release: () => void;
}

export function createJobHub(maxRunning = 2): JobHub {
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
      if (prepared.work) {
        const abort = new AbortController();
        job.abort = abort;
        const timer = setTimeout(() => { timedOut = true; abort.abort(); }, step.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        try {
          note = (await prepared.work(abort.signal, addTail)) ?? "";
        } catch (err) {
          if (!job.cancelled && !timedOut) throw err;
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

      if (job.cancelled) {
        view.state = "skipped";
        view.message = "Cancelled.";
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
      view.state = "failed";
      view.message = String(err?.message ?? err).slice(0, 400);
      await removeOutput();
    } finally {
      job.proc = null;
      if (prepared?.cleanup) await prepared.cleanup().catch(() => {});
    }
  }

  async function runJob(job: InternalJob): Promise<void> {
    running++;
    job.view.state = "running";
    try {
      for (let i = 0; i < job.spec.steps.length; i++) {
        if (job.cancelled) {
          for (let j = i; j < job.spec.steps.length; j++) {
            const s = job.view.steps[j]!;
            if (s.state === "waiting") { s.state = "skipped"; s.message = "Cancelled."; }
          }
          break;
        }
        await runStep(job, i);
        const s = job.view.steps[i]!;
        if (s.state === "done") job.view.done++;
        else if (s.state === "failed") job.view.failed++;
      }
    } finally {
      job.view.current = "";
      job.view.finishedAt = Date.now();
      job.view.state = job.cancelled ? "cancelled" : job.view.failed > 0 ? "failed" : "done";
      running--;
      job.release();
      const next = waiting.shift();
      if (next) void runJob(next);
    }
  }

  return {
    start(spec) {
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
        current: "",
        steps: spec.steps.map((s) => ({ label: s.label, state: "waiting", message: "", output: null })),
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
        for (const s of job.view.steps) { s.state = "skipped"; s.message = "Cancelled."; }
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
