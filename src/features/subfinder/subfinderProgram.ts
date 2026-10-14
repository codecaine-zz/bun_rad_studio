/**
 * The optional real `subfinder` program as one more source. It is run with an argument list (never through a shell),
 * with a time limit and a cap on how much output is read, and its output is parsed defensively: one JSON object per
 * line (`{"host":"a.example.com","source":[...]}`) or a plain host per line. What comes out is still only candidate
 * text; the engine validates every name like it does for any other source.
 */
import { SourceError, MAX_RAW_NAMES } from "./subfinderSources.ts";
import { validateTargetDomain } from "./subfinderNames.ts";

export interface ProgramProcess {
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  exited: Promise<number | null>;
  kill(signal?: "SIGTERM" | "SIGKILL"): void;
}

export type SpawnLike = (argv: string[], options: { env: Record<string, string | undefined> }) => ProgramProcess;

export const defaultSpawn: SpawnLike = (argv, options) =>
  Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: options.env as Record<string, string> }) as unknown as ProgramProcess;

export const PROGRAM_LIMITS = { maxOutputBytes: 4 * 1024 * 1024, maxStderrBytes: 16 * 1024 } as const;

/** The arguments for one passive run: only flags that exist in `subfinder -h`, and the domain as its own element (so it can never be read as a flag or a shell word). */
export function buildProgramArgs(domain: string, options: { timeoutSec: number; maxMinutes?: number }): string[] {
  const checked = validateTargetDomain(domain);
  if (!checked.ok || checked.ascii !== domain) throw new SourceError("program", "That isn't a domain the subfinder program can be asked about.");
  const timeout = Math.max(1, Math.min(120, Math.round(options.timeoutSec)));
  return ["-silent", "-json", "-nc", "-disable-update-check", "-timeout", String(timeout), "-max-time", String(Math.max(1, Math.min(5, options.maxMinutes ?? 1))), "-d", domain];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** Host names in what the program printed. Lines that are neither JSON with a host nor a single word are ignored. */
export function parseProgramOutput(text: string): string[] {
  const names: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (names.length >= MAX_RAW_NAMES) break;
    const line = rawLine.replace(ANSI, "").trim();
    if (!line || line.length > 2000) continue;
    if (line.startsWith("{")) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const host = typeof obj?.host === "string" ? obj.host : typeof obj?.name === "string" ? obj.name : null;
        if (host) names.push(host);
      } catch {
        // a damaged line is skipped
      }
    } else if (!/\s/.test(line) && !line.startsWith("[")) {
      names.push(line);
    }
  }
  return names;
}

interface Collected { text: string; truncated: boolean }

/** Reads a stream up to `maxBytes`; `done` resolves with what arrived (also when the stream is cancelled). */
function collect(stream: ReadableStream<Uint8Array> | null, maxBytes: number, onFull: () => void): { done: Promise<Collected>; cancel: () => void } {
  const reader = stream?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  const finish = (): Collected => ({ text: new TextDecoder().decode(Buffer.concat(chunks).subarray(0, maxBytes)), truncated });
  const done = (async () => {
    if (!reader) return finish();
    try {
      for (;;) {
        const { value, done: ended } = await reader.read();
        if (ended) break;
        total += value.byteLength;
        chunks.push(value);
        if (total > maxBytes) {
          truncated = true;
          onFull();
          break;
        }
      }
    } catch {
      // the stream closed because the program was stopped
    }
    return finish();
  })();
  return { done, cancel: () => { reader?.cancel().catch(() => {}); } };
}

export interface ProgramResult { names: string[]; note?: string }

/** Runs `exe` for `domain`. Throws a SourceError when it can't start, fails without any answer, or is cancelled. */
export async function runSubfinderProgram(exe: string, domain: string, o: { timeoutMs: number; timeoutSec: number; signal?: AbortSignal; spawn?: SpawnLike; env?: Record<string, string | undefined> }): Promise<ProgramResult> {
  const args = buildProgramArgs(domain, { timeoutSec: o.timeoutSec });
  if (o.signal?.aborted) throw new SourceError("cancelled", "Cancelled.");
  let proc: ProgramProcess;
  try {
    proc = (o.spawn ?? defaultSpawn)([exe, ...args], { env: o.env ?? process.env });
  } catch (err: any) {
    throw new SourceError("program", err?.code === "ENOENT" ? "The subfinder program couldn't be found. Was it moved or uninstalled?" : "The subfinder program couldn't be started.");
  }
  let timedOut = false;
  let cancelled = false;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    try { proc.kill("SIGTERM"); } catch {}
    hardTimer ??= setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 1000);
  };
  const timer = setTimeout(() => { timedOut = true; stop(); }, o.timeoutMs);
  const onAbort = () => { cancelled = true; stop(); };
  o.signal?.addEventListener("abort", onAbort, { once: true });
  const out = collect(proc.stdout, PROGRAM_LIMITS.maxOutputBytes, stop);
  const err = collect(proc.stderr, PROGRAM_LIMITS.maxStderrBytes, () => {});
  try {
    const code = await proc.exited.catch(() => null);
    // A program that left a helper holding its pipes open must not keep us waiting.
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<null>((resolve) => { giveUp = setTimeout(() => resolve(null), 1000); });
    const stdout = await Promise.race([out.done, grace]);
    const stderr = await Promise.race([err.done, grace]);
    clearTimeout(giveUp);
    if (cancelled) throw new SourceError("cancelled", "Cancelled.");
    const names = stdout ? parseProgramOutput(stdout.text) : [];
    const notes: string[] = [];
    if (stdout?.truncated) notes.push(`The output was cut short at ${Math.round(PROGRAM_LIMITS.maxOutputBytes / 1024 / 1024)} MB.`);
    if (timedOut) {
      if (names.length === 0) throw new SourceError("timeout", `The subfinder program didn't finish within ${Math.round(o.timeoutMs / 1000)} seconds.`);
      notes.push(`Stopped after ${Math.round(o.timeoutMs / 1000)} seconds; the list may be incomplete.`);
    } else if (code !== 0 && names.length === 0 && !stdout?.truncated) {
      const lastLine = (stderr?.text ?? "").replace(ANSI, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(-1)[0] ?? "";
      throw new SourceError("program", `The subfinder program stopped with an error${lastLine ? `: ${lastLine.slice(0, 200)}` : "."}`);
    }
    return { names, ...(notes.length ? { note: notes.join(" ") } : {}) };
  } finally {
    clearTimeout(timer);
    clearTimeout(hardTimer);
    o.signal?.removeEventListener("abort", onAbort);
    out.cancel();
    err.cancel();
  }
}
