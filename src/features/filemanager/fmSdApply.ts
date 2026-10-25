/**
 * Writing the Replace tool's changes: each file is replaced atomically (a temp file in the same folder, then a
 * rename), only when it still has the content that was previewed, keeping its permissions, line breaks and BOM.
 * Every change is remembered in memory so it can be undone, and optionally copied to a backup file first.
 */
import { createHash, randomBytes, randomUUID } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { assertCreatable, assertModifiable, type FmContext } from "./fmCore";
import { FmError, describeFsError } from "./fmPaths";
import { sdState, runSdJob, type SdPreview, type SdUndoFile, type SdUndoRun } from "./fmSdRun";
import { SD_MAX_BATCH_BYTES, SD_UNDO_RUNS, type SdTransformOutcome } from "./fmSdShared";

export type RowStatus = "replaced" | "changed" | "protected" | "failed" | "unchanged" | "already" | "restored" | "missing" | "edited";

export interface ApplyRow {
  path: string;
  status: RowStatus;
  message: string;
  replacements: number;
  backup?: string;
}

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function atomicWrite(path: string, bytes: Uint8Array, mode: number): Promise<void> {
  const tmp = nodePath.join(nodePath.dirname(path), `.sdtmp-${randomBytes(6).toString("hex")}`);
  try {
    await fsp.writeFile(tmp, bytes, { flag: "wx", mode });
    await fsp.chmod(tmp, mode);
    await fsp.rename(tmp, path);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** Saves a copy of the old content next to the file. A backup that already exists is never touched: a new name is used. */
async function writeBackup(ctx: FmContext, path: string, bytes: Buffer, mode: number, ext: string): Promise<string> {
  assertCreatable(ctx, nodePath.dirname(path));
  const name = nodePath.basename(path);
  for (let i = 0; i < 1000; i++) {
    const candidate = nodePath.join(nodePath.dirname(path), i === 0 ? `${name}${ext}` : `${name} (${i + 1})${ext}`);
    try {
      await fsp.writeFile(candidate, bytes, { flag: "wx", mode: mode & 0o777 });
      return candidate;
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
    }
  }
  throw new FmError("NO_FREE_NAME", "Could not find a free name for the backup.");
}

export function backupExtension(raw: unknown): string {
  const text = typeof raw === "string" && raw.trim() ? raw.trim() : ".bak";
  if (!/^\.?[A-Za-z0-9_~-]{1,16}$/.test(text)) throw new FmError("BAD_REQUEST", "The backup ending can only use letters, numbers, dashes and underscores, like .bak or .orig.");
  return text.startsWith(".") ? text : `.${text}`;
}

export interface ApplyOptions {
  files: string[];
  backup: boolean;
  backupExt: string;
}

/** Replaces the chosen files of a preview. A file that can't be changed is skipped, with the reason; the rest go on. */
export async function applyPreview(ctx: FmContext, preview: SdPreview, options: ApplyOptions): Promise<{ rows: ApplyRow[]; run: SdUndoRun | null }> {
  const state = sdState(ctx);
  if (state.writing) throw new FmError("BUSY", "Another replace or undo is still working. Wait for it to finish.");
  state.writing = true;
  try {
    const rows: ApplyRow[] = [];
    const todo: Array<{ path: string; hash: string }> = [];
    const row = (path: string, status: RowStatus, message: string, replacements = 0, backup?: string) => rows.push({ path, status, message, replacements, ...(backup ? { backup } : {}) });
    const fileByPath = new Map(preview.files.map((f) => [f.path, f]));
    for (const path of options.files) {
      const file = fileByPath.get(path)!;
      if (preview.applied.has(path)) row(path, "already", "This file was already replaced from this preview.");
      else if (!file.changed) row(path, "unchanged", "Nothing would change in this file.");
      else {
        try {
          assertModifiable(ctx, path);
          todo.push({ path, hash: file.hash });
        } catch (err) {
          row(path, "protected", describeFsError(err).message);
        }
      }
    }
    const written: SdUndoFile[] = [];
    if (todo.length) {
      const outcome = await runSdJob<SdTransformOutcome>(ctx, { kind: "transform", spec: preview.spec, files: todo, maxBytes: SD_MAX_BATCH_BYTES });
      for (const item of outcome.items) {
        const keep = (status: RowStatus, message: string) => row(item.path, status, message);
        if (item.status === "changed") { keep("changed", "Skipped: this file was edited after the preview. Run Preview again to see its new content."); continue; }
        if (item.status === "unreadable") { keep("failed", "Skipped: this file can't be read any more."); continue; }
        if (item.status === "unchanged") { keep("unchanged", "Nothing would change in this file."); continue; }
        const original = Buffer.from(item.original!.buffer, item.original!.byteOffset, item.original!.byteLength);
        const updated = Buffer.from(item.updated!.buffer, item.updated!.byteOffset, item.updated!.byteLength);
        try {
          const st = await fsp.lstat(item.path);
          if (!st.isFile()) {
            keep("changed", "Skipped: this is no longer an ordinary file.");
            continue;
          }
          if (!original.equals(await fsp.readFile(item.path))) {
            keep("changed", "Skipped: this file was edited after the preview. Run Preview again to see its new content.");
            continue;
          }
          const mode = st.mode & 0o7777;
          const backup = options.backup ? await writeBackup(ctx, item.path, original, mode, options.backupExt) : null;
          await atomicWrite(item.path, updated, mode);
          written.push({ path: item.path, original, updatedHash: sha(updated), mode, backup, replacements: item.replacements });
          preview.applied.set(item.path, "replaced");
          row(item.path, "replaced", backup ? "Replaced. The old version was saved as a backup." : "Replaced.", item.replacements, backup ?? undefined);
        } catch (err) {
          row(item.path, "failed", `Skipped: ${describeFsError(err, "change that file").message}`);
        }
      }
    }
    let run: SdUndoRun | null = null;
    if (written.length) {
      run = { id: randomUUID(), at: Date.now(), find: preview.spec.find, replace: preview.spec.replace, files: written };
      state.undo.push(run);
      while (state.undo.length > SD_UNDO_RUNS) state.undo.shift();
    }
    return { rows, run };
  } finally {
    state.writing = false;
  }
}

/** Puts back the old content of a replace, file by file, but only where the file still holds exactly what the replace wrote. */
export async function undoRun(ctx: FmContext, runId: string | undefined): Promise<{ run: SdUndoRun; rows: ApplyRow[] }> {
  const state = sdState(ctx);
  if (state.writing) throw new FmError("BUSY", "Another replace or undo is still working. Wait for it to finish.");
  const run = runId ? state.undo.find((r) => r.id === runId) : state.undo[state.undo.length - 1];
  if (!run) throw new FmError("NOTHING_TO_UNDO", "There's nothing to undo. Only the last few replaces made since this window opened can be undone.");
  state.writing = true;
  try {
    const rows: ApplyRow[] = [];
    for (const f of run.files) {
      const backupNote = f.backup ? ` Your backup is still at ${f.backup}.` : "";
      try {
        assertModifiable(ctx, f.path);
        let current: Buffer;
        let mode = f.mode;
        try {
          const st = await fsp.lstat(f.path);
          if (!st.isFile()) {
            rows.push({ path: f.path, status: "edited", message: `Left as it is: this is no longer an ordinary file.${backupNote}`, replacements: 0 });
            continue;
          }
          mode = st.mode & 0o7777;
          current = await fsp.readFile(f.path);
        } catch (err: any) {
          if (err?.code === "ENOENT") {
            rows.push({ path: f.path, status: "missing", message: `This file no longer exists, so there is nothing to restore.${backupNote}`, replacements: 0 });
            continue;
          }
          throw err;
        }
        if (sha(current) !== f.updatedHash) {
          rows.push({ path: f.path, status: "edited", message: `Left as it is: this file was edited after the replace, so putting the old version back would throw those newer changes away.${backupNote}`, replacements: 0 });
          continue;
        }
        await atomicWrite(f.path, f.original, mode);
        rows.push({ path: f.path, status: "restored", message: "Restored to how it was before the replace.", replacements: f.replacements });
      } catch (err) {
        rows.push({ path: f.path, status: err instanceof FmError && err.code === "PROTECTED" ? "protected" : "failed", message: `Left as it is: ${describeFsError(err, "change that file").message}`, replacements: 0 });
      }
    }
    for (const row of rows) if (row.status === "restored") for (const p of state.previews.values()) p.applied.delete(row.path);
    state.undo.splice(state.undo.indexOf(run), 1);
    return { run, rows };
  } finally {
    state.writing = false;
  }
}

export function undoSummary(ctx: FmContext): Array<{ id: string; at: number; files: number; replacements: number; backups: number; find: string; replace: string }> {
  return sdState(ctx).undo.map((r) => ({
    id: r.id, at: r.at, files: r.files.length, replacements: r.files.reduce((n, f) => n + f.replacements, 0), backups: r.files.filter((f) => f.backup).length,
    find: r.find.slice(0, 200), replace: r.replace.slice(0, 200),
  }));
}
