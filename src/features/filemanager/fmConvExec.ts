/**
 * Moving parts around a conversion that are not the conversion itself: temporary working folders, running a series
 * of programs with a time limit and cancel, keeping an archive extractor inside its size limits, and putting the
 * finished result in its place without ever replacing anything that is already there.
 */
import { constants as fsConstants, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { lstat, readdir, rm, unlink } from "fs/promises";
import { tmpdir } from "os";
import * as nodePath from "path";
import { randomBytes } from "crypto";
import { ConvError } from "./fmConvCommon";

// ---------------------------------------------------------------------------------------------------------------
// Working folders
// ---------------------------------------------------------------------------------------------------------------

/** A private temporary folder for one step; `cleanup` removes it with everything inside. */
export class Stage {
  private root: string | null = null;
  private count = 0;

  dir(): string {
    this.root ??= mkdtempSync(nodePath.join(tmpdir(), "fm-conv-"));
    return this.root;
  }

  /** A new empty folder inside, with a safe name. */
  subDir(name: string): string {
    const d = nodePath.join(this.dir(), `${name.replace(/[^A-Za-z0-9_-]/g, "_")}-${++this.count}`);
    mkdirSync(d);
    return d;
  }

  file(name: string, content: string): string {
    const p = nodePath.join(this.dir(), `${++this.count}-${name.replace(/[^A-Za-z0-9_.-]/g, "_")}`);
    writeFileSync(p, content);
    return p;
  }

  copy(source: string, name: string): string {
    const d = this.subDir("copy");
    const p = nodePath.join(d, name.replace(/[^A-Za-z0-9_.-]/g, "_"));
    copyFileSync(source, p);
    return p;
  }

  /** The input under a name that no program can read as an instruction: a link (or a copy where links aren't allowed). */
  safeInput(source: string, base: string, ext: string): string {
    const target = nodePath.join(this.dir(), `${base}${ext ? `.${ext}` : ""}`);
    try {
      symlinkSync(source, target);
    } catch {
      copyFileSync(source, target);
    }
    return target;
  }

  cleanup(): void {
    if (this.root) rmSync(this.root, { recursive: true, force: true });
    this.root = null;
  }
}

/** A hidden, new folder next to `final` for a program to fill; it is renamed to `final` when done. */
export function siblingTemp(final: string): string {
  const tmp = nodePath.join(nodePath.dirname(final), `.fm-tmp-${randomBytes(5).toString("hex")}`);
  mkdirSync(tmp);
  return tmp;
}

// ---------------------------------------------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------------------------------------------

/**
 * Puts a finished file at `final`. It is copied next to its destination first and then linked into place, so the
 * result appears complete or not at all, and a file that appeared at `final` in the meantime is never replaced
 * (the error code is EEXIST).
 */
export function publishFile(source: string, final: string): void {
  const part = nodePath.join(nodePath.dirname(final), `.fm-part-${randomBytes(5).toString("hex")}`);
  copyFileSync(source, part, fsConstants.COPYFILE_EXCL);
  try {
    try {
      linkSync(part, final);
    } catch (err: any) {
      if (err?.code === "EEXIST") throw err;
      // Links aren't possible here (some network and FAT disks): check, then rename.
      if (existsSync(final)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
      renameSync(part, final);
    }
  } finally {
    try { unlinkSync(part); } catch {}
  }
}

/** Puts a finished folder at `final`; refuses when anything is there already. */
export function publishFolder(source: string, final: string): void {
  if (existsSync(final)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
  renameSync(source, final);
}

// ---------------------------------------------------------------------------------------------------------------
// Folder size limits and links
// ---------------------------------------------------------------------------------------------------------------

export interface TreeLimits {
  maxBytes: number;
  maxEntries: number;
}

export const EXTRACT_LIMITS: TreeLimits = { maxBytes: 8 * 1024 ** 3, maxEntries: 100_000 };

/** Size and number of items in a folder, stopping as soon as a limit is passed. */
export async function measureTree(root: string, limits: TreeLimits): Promise<{ bytes: number; entries: number; over: boolean }> {
  let bytes = 0;
  let entries = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      entries++;
      const p = nodePath.join(dir, name);
      let st;
      try {
        st = await lstat(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(p);
      else if (st.isFile()) bytes += st.size;
      if (bytes > limits.maxBytes || entries > limits.maxEntries) return { bytes, entries, over: true };
    }
  }
  return { bytes, entries, over: false };
}

/** After a program unpacked something: remove links (they could point anywhere), and refuse oversized or empty results. */
export async function sanitizeExtracted(root: string, limits: TreeLimits): Promise<{ removedLinks: number; files: number }> {
  let removedLinks = 0;
  let files = 0;
  let bytes = 0;
  let entries = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const name of await readdir(dir)) {
      const p = nodePath.join(dir, name);
      const st = await lstat(p);
      if (++entries > limits.maxEntries) throw new ConvError(`This archive has too many items (more than ${limits.maxEntries}).`);
      if (st.isSymbolicLink()) { await unlink(p); removedLinks++; }
      else if (st.isDirectory()) stack.push(p);
      else if (st.isFile()) {
        files++;
        bytes += st.size;
        if (bytes > limits.maxBytes) throw new ConvError("Unpacking this would use more disk space than the safety limit allows.");
      }
    }
  }
  if (files === 0) throw new ConvError("Nothing came out of this archive (it is empty, protected by a password, or damaged).");
  return { removedLinks, files };
}

// ---------------------------------------------------------------------------------------------------------------
// Running programs
// ---------------------------------------------------------------------------------------------------------------

export interface RunOptions {
  env?: Record<string, string>;
  cwd?: string;
  /** Write what the last program prints to this file (for programs that print their result). */
  stdoutTo?: string;
  /** Stop the programs when this folder grows beyond the limits. */
  watch?: { dir: string; limits: TreeLimits };
  explain: (text: string, code: number | null) => string;
  signal: AbortSignal;
  log: (text: string) => void;
}

/** Runs command lines one after another. A step may be a function that makes its command line when its turn comes. */
export async function runCommands(steps: Array<string[] | (() => string[])>, o: RunOptions): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    if (o.signal.aborted) throw new Error("Cancelled.");
    const step = steps[i]!;
    const argv = typeof step === "function" ? step() : step;
    const last = i === steps.length - 1;
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: o.env, cwd: o.cwd });
    } catch (err: any) {
      throw new Error(err?.code === "ENOENT" ? "The program could not be found. Was it moved or uninstalled?" : `The program could not be started: ${String(err?.message ?? err).slice(0, 200)}`);
    }
    const onAbort = () => { try { proc.kill(); } catch {} };
    o.signal.addEventListener("abort", onAbort);
    let tail = "";
    const out: Buffer[] = [];
    let outBytes = 0;
    const capture = last && !!o.stdoutTo;
    const drain = async (stream: unknown, isStdout: boolean) => {
      if (!stream || typeof (stream as ReadableStream).getReader !== "function") return;
      const reader = (stream as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (capture && isStdout) {
            outBytes += value.length;
            if (outBytes > 200 * 1024 * 1024) { try { proc.kill(); } catch {} break; }
            out.push(Buffer.from(value));
          } else {
            tail = (tail + decoder.decode(value, { stream: true })).slice(-8000);
            o.log(tail.slice(-400));
          }
        }
      } catch {
        // the stream closed because the program was stopped
      }
    };
    let tooBig: string | null = null;
    const timer = o.watch
      ? setInterval(() => {
          void measureTree(o.watch!.dir, o.watch!.limits).then((m) => {
            if (m.over && !tooBig) {
              tooBig = "Unpacking this would use more disk space (or more items) than the safety limit allows, so it was stopped.";
              try { proc.kill(); } catch {}
            }
          });
        }, 400)
      : null;
    const draining = Promise.all([drain(proc.stdout, true), drain(proc.stderr, false)]);
    const code = await proc.exited;
    await Promise.race([draining, new Promise((r) => setTimeout(r, 1000))]);
    if (timer) clearInterval(timer);
    o.signal.removeEventListener("abort", onAbort);
    if (o.signal.aborted) throw new Error("Cancelled.");
    if (tooBig) throw new ConvError(tooBig);
    if (code !== 0) throw new Error(o.explain(tail, code));
    if (capture) {
      if (!outBytes) throw new Error("The program finished but printed nothing.");
      writeFileSync(o.stdoutTo!, Buffer.concat(out), { flag: "wx" });
    }
  }
}

/** Removes a file or folder, ignoring errors (cleanup after a failure). */
export async function removeQuietly(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true }).catch(() => {});
}
