/**
 * Longer jobs of the "More info" window (hashes, folder counts): started, polled and cancelled by id.
 * Each job runs in this process, reads in small pieces, checks for cancellation between pieces, and never loads a
 * whole file into memory.
 */
import { createHash, randomBytes } from "crypto";
import { crc32 } from "zlib";
import type { FmContext } from "./fmCore";
import { openForRead, regularFile, readBytes, type InfoRow } from "./fmInfoCommon";
import { FmError } from "./fmPaths";

export type TaskKind = "hash" | "folder";
export type TaskState = "running" | "done" | "failed" | "cancelled";

export interface TaskView {
  id: string;
  kind: TaskKind;
  state: TaskState;
  done: number;
  total: number;
  message: string;
  result: unknown;
  error: string;
}

interface Task {
  view: TaskView;
  abort: AbortController;
  finishedAt: number;
}

export interface TaskControl {
  signal: AbortSignal;
  progress(done: number, total: number, message?: string): void;
}

const MAX_RUNNING = 4;
const MAX_KEPT = 40;
const KEEP_MS = 15 * 60 * 1000;
const registries = new WeakMap<FmContext, Map<string, Task>>();

function registry(ctx: FmContext): Map<string, Task> {
  let r = registries.get(ctx);
  if (!r) {
    r = new Map();
    registries.set(ctx, r);
    const map = r;
    ctx.disposers.push(() => {
      for (const t of map.values()) t.abort.abort();
      map.clear();
    });
  }
  return r;
}

function purge(map: Map<string, Task>): void {
  const now = Date.now();
  for (const [id, t] of map) if (t.view.state !== "running" && now - t.finishedAt > KEEP_MS) map.delete(id);
  while (map.size > MAX_KEPT) {
    const old = [...map].find(([, t]) => t.view.state !== "running");
    if (!old) break;
    map.delete(old[0]);
  }
}

export function startTask(ctx: FmContext, kind: TaskKind, run: (control: TaskControl) => Promise<unknown>): TaskView {
  const map = registry(ctx);
  purge(map);
  if ([...map.values()].filter((t) => t.view.state === "running").length >= MAX_RUNNING) throw new FmError("TOO_MANY", "Several details are already being worked out. Wait for one to finish or cancel it.");
  const task: Task = { view: { id: randomBytes(9).toString("base64url"), kind, state: "running", done: 0, total: 0, message: "", result: null, error: "" }, abort: new AbortController(), finishedAt: 0 };
  map.set(task.view.id, task);
  const control: TaskControl = {
    signal: task.abort.signal,
    progress(done, total, message) {
      task.view.done = done;
      task.view.total = total;
      if (message !== undefined) task.view.message = message;
    },
  };
  void run(control).then(
    (result) => {
      task.view.result = result;
      task.view.state = task.abort.signal.aborted ? "cancelled" : "done";
    },
    (err: any) => {
      task.view.state = task.abort.signal.aborted ? "cancelled" : "failed";
      task.view.error = err instanceof FmError ? err.message : err?.code === "EACCES" ? "No permission to read that." : "That could not be worked out.";
    },
  ).finally(() => {
    task.finishedAt = Date.now();
  });
  return { ...task.view };
}

export function taskView(ctx: FmContext, id: unknown): TaskView {
  const t = typeof id === "string" ? registry(ctx).get(id) : undefined;
  if (!t) throw new FmError("NO_TASK", "That job isn't running any more.");
  return { ...t.view };
}

export function cancelTask(ctx: FmContext, id: unknown): boolean {
  const t = typeof id === "string" ? registry(ctx).get(id) : undefined;
  if (!t || t.view.state !== "running") return false;
  t.abort.abort();
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Hashes
// ---------------------------------------------------------------------------------------------------------------

export const HASHES = [
  { id: "md5", label: "MD5", hint: "A short fingerprint of the file. Fast, but no longer safe against deliberate tampering." },
  { id: "sha1", label: "SHA-1", hint: "A fingerprint of the file. Older; still used by some download pages." },
  { id: "sha256", label: "SHA-256", hint: "The usual modern fingerprint. If two files give the same SHA-256, they are the same file." },
  { id: "sha512", label: "SHA-512", hint: "A longer fingerprint with the same purpose as SHA-256." },
  { id: "crc32", label: "CRC32", hint: "A quick check number used by zip files. It catches accidents, not tampering." },
] as const;

const CHUNK = 1024 * 1024;

export interface HashRowOut extends InfoRow {
  id: string;
}

/** Streams the file once through every wanted algorithm. Stops soon after `control.signal` aborts. */
export async function hashFile(ctx: FmContext, input: unknown, control: TaskControl, wanted?: unknown): Promise<{ rows: HashRowOut[]; size: number }> {
  const t = await regularFile(ctx, input);
  const ids = Array.isArray(wanted) && wanted.length ? HASHES.filter((h) => wanted.includes(h.id)) : [...HASHES];
  if (!ids.length) throw new FmError("BAD_REQUEST", "Choose at least one kind of fingerprint.");
  const hashers = ids.filter((h) => h.id !== "crc32").map((h) => ({ h, d: createHash(h.id) }));
  const wantCrc = ids.some((h) => h.id === "crc32");
  let crc = 0;
  const handle = await openForRead(t.path);
  try {
    const size = (await handle.stat()).size;
    let pos = 0;
    while (pos < size) {
      if (control.signal.aborted) throw new FmError("CANCELLED", "Stopped.");
      const buf = await readBytes(handle, pos, Math.min(CHUNK, size - pos));
      if (!buf.length) break;
      for (const x of hashers) x.d.update(buf);
      if (wantCrc) crc = crc32(buf, crc);
      pos += buf.length;
      control.progress(pos, size);
    }
    const rows: HashRowOut[] = [];
    for (const h of ids) rows.push({ id: h.id, label: h.label, value: h.id === "crc32" ? (crc >>> 0).toString(16).padStart(8, "0") : hashers.find((x) => x.h.id === h.id)!.d.digest("hex"), hint: h.hint });
    control.progress(size, size);
    return { rows, size };
  } finally {
    await handle.close();
  }
}

const HEX_LENGTH: Record<number, string[]> = { 8: ["crc32"], 32: ["md5"], 40: ["sha1"], 64: ["sha256"], 128: ["sha512"] };

/** A pasted checksum as plain lower-case hex: spaces, colons, "0x" and a "sha256:" style name in front are ignored. */
export function normalizeHash(text: string): { hex: string; named: string | null } {
  let s = String(text ?? "").trim().slice(0, 2000);
  let named: string | null = null;
  const prefix = /^(md5|sha-?1|sha-?256|sha-?512|crc-?32)\s*[:=(]?\s*/i.exec(s);
  if (prefix) {
    named = prefix[1]!.toLowerCase().replace("-", "");
    s = s.slice(prefix[0].length);
  }
  // "hash  file name" lines (shasum output) and spaced groups: the whole text counts when it is only hex, else the longest checksum-like word.
  const compact = s.replace(/[\s:-]/g, "").replace(/^0x/i, "");
  if (/^[0-9a-f]+$/i.test(compact) && HEX_LENGTH[compact.length]) return { hex: compact.toLowerCase(), named };
  const clean = (w: string) => w.replace(/^0x/i, "").replace(/[:-]/g, "");
  const hexWord = s.split(/\s+/).filter((w) => /^(0x)?[0-9a-f:-]{8,}$/i.test(w) && HEX_LENGTH[clean(w).length]).sort((a, b) => clean(b).length - clean(a).length)[0];
  const hex = clean(hexWord ?? s.replace(/\s+/g, "")).toLowerCase();
  return { hex: /^[0-9a-f]*$/.test(hex) ? hex : "", named };
}

export function compareHash(expected: unknown, rows: Array<{ id: string; value: string }>): { matched: string | null; hint: string; normalized: string } {
  const { hex, named } = normalizeHash(typeof expected === "string" ? expected : "");
  if (!hex) return { matched: null, normalized: "", hint: "That doesn't look like a checksum. It should be letters a–f and digits, for example 9f86d081…" };
  const kinds = HEX_LENGTH[hex.length];
  if (!kinds) return { matched: null, normalized: hex, hint: `That is ${hex.length} characters long. A checksum has 8 (CRC32), 32 (MD5), 40 (SHA-1), 64 (SHA-256) or 128 (SHA-512) characters. Part of it may be missing.` };
  const hit = rows.find((r) => r.value.toLowerCase() === hex && (!named || r.id === named));
  if (hit) return { matched: hit.id, normalized: hex, hint: `It matches the ${HASHES.find((h) => h.id === hit.id)?.label ?? hit.id} of this file. The file is what it should be.` };
  const same = rows.find((r) => kinds.includes(r.id));
  return { matched: null, normalized: hex, hint: same ? `It does NOT match this file's ${HASHES.find((h) => h.id === same.id)?.label}. The file differs from the original, or the checksum is for a different file.` : "That kind of checksum wasn't calculated. Calculate all of them and try again." };
}
