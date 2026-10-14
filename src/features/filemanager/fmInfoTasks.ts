/**
 * Longer jobs of the "More info" window (hashes, folder counts): started, polled and cancelled by id.
 * Each job runs in this process, reads in small pieces, checks for cancellation between pieces, and never loads a
 * whole file into memory.
 */
import { randomBytes } from "crypto";
import type { FmContext } from "./fmCore";
import { HASH_BY_ID, HASH_SPECS, digestFile } from "./fmHashes";
import { openForRead, regularFile, type InfoRow } from "./fmInfoCommon";
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

/** What "Calculate fingerprints" works out by default (the other kinds are chosen on the page). */
export const DEFAULT_HASH_IDS = ["md5", "sha1", "sha256", "sha512", "crc32"];
export const HASHES = HASH_SPECS.map((s) => ({ id: s.id, label: s.label, hint: s.hint, group: s.group }));

export interface HashRowOut extends InfoRow {
  id: string;
  group: string;
}

/** Streams the file once through every wanted kind. Stops soon after `control.signal` aborts. */
export async function hashFile(ctx: FmContext, input: unknown, control: TaskControl, wanted?: unknown): Promise<{ rows: HashRowOut[]; size: number; skipped: Array<{ id: string; label: string; reason: string }> }> {
  const t = await regularFile(ctx, input);
  const chosen = Array.isArray(wanted) && wanted.length ? HASH_SPECS.filter((h) => wanted.includes(h.id)) : DEFAULT_HASH_IDS.map((id) => HASH_BY_ID.get(id)!);
  if (!chosen.length) throw new FmError("BAD_REQUEST", "Choose at least one kind of fingerprint.");
  const done = await digestFile(t.path, chosen, { open: openForRead, signal: control.signal, progress: (d, total) => control.progress(d, total) });
  return {
    rows: done.rows.map((r) => ({ id: r.spec.id, label: r.spec.label, value: r.value, hint: r.spec.hint, group: r.spec.group })),
    size: done.size,
    skipped: done.skipped.map((x) => ({ id: x.spec.id, label: x.spec.label, reason: x.reason })),
  };
}

const HEX_LENGTH: Record<number, string[]> = {};
for (const h of HASH_SPECS) (HEX_LENGTH[h.hex] ??= []).push(h.id);
/** Names a person may write in front of a checksum ("sha-256:", "XXH3=", "SHA-512/256("), mapped to the kind. */
const ALIASES = new Map<string, string>();
for (const h of HASH_SPECS) for (const name of [h.id, h.label]) ALIASES.set(name.toLowerCase().replace(/[^a-z0-9]/g, ""), h.id);

/** A pasted checksum as plain lower-case hex: spaces, colons, "0x" and a "sha256:" style name in front are ignored. */
export function normalizeHash(text: string): { hex: string; named: string | null } {
  let s = String(text ?? "").trim().slice(0, 2000);
  let named: string | null = null;
  const prefix = /^([a-z][a-z0-9\-/]*)\s*[:=(]?\s*/i.exec(s);
  const alias = prefix ? ALIASES.get(prefix[1]!.toLowerCase().replace(/[^a-z0-9]/g, "")) : undefined;
  if (prefix && alias) {
    named = alias;
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
  if (!kinds) return { matched: null, normalized: hex, hint: `That is ${hex.length} characters long. A checksum has 8 or 16 (fast checksums such as CRC32), 32 (MD5), 40 (SHA-1), 56 (SHA-224), 64 (SHA-256), 96 (SHA-384) or 128 (SHA-512) characters. Part of it may be missing.` };
  const hit = rows.find((r) => r.value.toLowerCase() === hex && (!named || r.id === named));
  if (hit) return { matched: hit.id, normalized: hex, hint: `It matches the ${HASHES.find((h) => h.id === hit.id)?.label ?? hit.id} of this file. The file is what it should be.` };
  const same = rows.find((r) => kinds.includes(r.id));
  return { matched: null, normalized: hex, hint: same ? `It does NOT match this file's ${HASHES.find((h) => h.id === same.id)?.label}. The file differs from the original, or the checksum is for a different file.` : "That kind of checksum wasn't calculated. Tick it under “More kinds”, calculate again and compare." };
}
