/**
 * Moving things in and out of the graveyard without ever risking them.
 *
 * Same disk: one rename. Different disks: the item is copied to a spare name, the copy is checked against the original
 * (names, kinds, sizes, link targets, permissions), only then put in its place, and only after that is the original
 * removed. Anything that goes wrong before that point leaves the original exactly where it was and removes the
 * half-made copy. Links are copied as links and never followed; permissions and times are kept. Every step looks at
 * `signal`, so a cancelled job stops between files (and between 4 MB pieces of a big file).
 */
import { constants, promises as fsp } from "fs";
import * as nodePath from "path";
import type { GraveyardHooks } from "./fmGraveyardHooks";
import { FmError } from "./fmPaths";

export interface MoveEnv {
  signal?: AbortSignal;
  hooks: GraveyardHooks;
  /** Told how much has been copied so far (for the progress text of a job). */
  progress?: (done: { files: number; bytes: number }) => void;
}

const BIG_FILE = 32 * 1024 * 1024;
const CHUNK = 4 * 1024 * 1024;
const NOFOLLOW = (constants as Record<string, number>).O_NOFOLLOW ?? 0;

export function checkAbort(env: { signal?: AbortSignal }): void {
  if (env.signal?.aborted) throw new FmError("CANCELLED", "Stopped. Nothing was lost.");
}

const mode = (st: { mode: number }) => st.mode & 0o7777;

/** The size and the number of entries inside, counted the way the Rip engine counts them. */
export async function measureTree(target: string, signal?: AbortSignal): Promise<{ sizeBytes: number; fileCount: number }> {
  const top = await fsp.lstat(target);
  if (!top.isDirectory()) return { sizeBytes: top.size, fileCount: 1 };
  let sizeBytes = 0;
  let count = 0;
  const stack = [target];
  while (stack.length) {
    checkAbort({ signal });
    const current = stack.pop()!;
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    const files: string[] = [];
    for (const e of entries) {
      count++;
      const full = nodePath.join(current, e.name);
      if (e.isDirectory()) stack.push(full);
      else files.push(full);
    }
    for (let i = 0; i < files.length; i += 64) {
      const sizes = await Promise.all(files.slice(i, i + 64).map((f) => fsp.lstat(f).then((s) => s.size, () => 0)));
      for (const s of sizes) sizeBytes += s;
    }
  }
  return { sizeBytes, fileCount: Math.max(1, count) };
}

async function copyFileData(source: string, destination: string, st: { mode: number; atime: Date; mtime: Date; size: number }, env: MoveEnv, counter: { files: number; bytes: number }): Promise<void> {
  if (st.size <= BIG_FILE) {
    await fsp.copyFile(source, destination, constants.COPYFILE_EXCL);
    counter.bytes += st.size;
  } else {
    const input = await fsp.open(source, constants.O_RDONLY | NOFOLLOW);
    try {
      const output = await fsp.open(destination, "wx", mode(st) | 0o200);
      try {
        const buffer = Buffer.allocUnsafe(CHUNK);
        for (;;) {
          checkAbort(env);
          const { bytesRead } = await input.read(buffer, 0, CHUNK, null);
          if (bytesRead === 0) break;
          await output.write(buffer, 0, bytesRead);
          counter.bytes += bytesRead;
          env.progress?.({ ...counter });
        }
      } finally {
        await output.close();
      }
    } finally {
      await input.close();
    }
  }
  await fsp.chmod(destination, mode(st));
  await fsp.utimes(destination, st.atime, st.mtime).catch(() => {});
}

async function copyInto(source: string, destination: string, env: MoveEnv, counter: { files: number; bytes: number }): Promise<void> {
  checkAbort(env);
  const st = await fsp.lstat(source);
  if (st.isSymbolicLink()) {
    await fsp.symlink(await fsp.readlink(source), destination);
  } else if (st.isFile()) {
    await copyFileData(source, destination, st, env, counter);
  } else if (st.isDirectory()) {
    await fsp.mkdir(destination, { mode: 0o700 });
    for (const name of (await fsp.readdir(source)).sort()) await copyInto(nodePath.join(source, name), nodePath.join(destination, name), env, counter);
    await fsp.chmod(destination, mode(st));
    await fsp.utimes(destination, st.atime, st.mtime).catch(() => {});
  } else {
    throw new FmError("SPECIAL_FILE", `"${nodePath.basename(source)}" is a special kind of file (a device, pipe or socket) that can't be copied between disks.`);
  }
  counter.files++;
  env.progress?.({ ...counter });
  await env.hooks.afterCopy(destination, counter.files);
}

/** What differs between a tree and its copy, or null when they match. */
export async function verifyTree(source: string, copy: string, env: { signal?: AbortSignal } = {}): Promise<string | null> {
  checkAbort(env);
  const [a, b] = await Promise.all([fsp.lstat(source), fsp.lstat(copy)]);
  const name = nodePath.basename(source);
  if (a.isSymbolicLink() !== b.isSymbolicLink() || a.isDirectory() !== b.isDirectory() || a.isFile() !== b.isFile()) return `${name} is a different kind of item in the copy`;
  if (a.isSymbolicLink()) return (await fsp.readlink(source)) === (await fsp.readlink(copy)) ? null : `the link ${name} points somewhere else in the copy`;
  if (a.isFile()) {
    if (a.size !== b.size) return `${name} has a different size in the copy`;
    return mode(a) === mode(b) ? null : `${name} has different permissions in the copy`;
  }
  if (!a.isDirectory()) return null;
  const [names, copied] = await Promise.all([fsp.readdir(source), fsp.readdir(copy)]);
  names.sort();
  copied.sort();
  if (names.length !== copied.length || names.some((n, i) => n !== copied[i])) return `${name} has different contents in the copy`;
  for (const n of names) {
    const problem = await verifyTree(nodePath.join(source, n), nodePath.join(copy, n), env);
    if (problem) return problem;
  }
  return null;
}

/** Makes every folder in the tree writable, so a read-only folder can be emptied. Links are never followed. */
async function makeWritable(target: string): Promise<void> {
  let st;
  try {
    st = await fsp.lstat(target);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
  await fsp.chmod(target, mode(st) | 0o700).catch(() => {});
  for (const name of await fsp.readdir(target).catch(() => [] as string[])) await makeWritable(nodePath.join(target, name));
}

/** Removes a file, link or whole tree (links are removed, not followed), including read-only folders. */
export async function removeTree(target: string): Promise<void> {
  try {
    await fsp.rm(target, { recursive: true, force: true });
    return;
  } catch (err: any) {
    if (err?.code === "ENOENT") return;
  }
  // Most often a read-only folder that can't be emptied: make the folders writable and try once more.
  await makeWritable(target);
  await fsp.rm(target, { recursive: true, force: true });
}

async function renameSmart(source: string, destination: string): Promise<void> {
  try {
    await fsp.rename(source, destination);
    return;
  } catch (err: any) {
    if (err?.code !== "EACCES" && err?.code !== "EPERM") throw err;
    // Moving a read-only folder to another parent needs write permission on the folder itself: give it briefly.
    const st = await fsp.lstat(source).catch(() => null);
    if (!st || !st.isDirectory() || (st.mode & 0o200) !== 0) throw err;
    await fsp.chmod(source, mode(st) | 0o200);
    try {
      await fsp.rename(source, destination);
    } catch (second) {
      await fsp.chmod(source, mode(st)).catch(() => {});
      throw second;
    }
    await fsp.chmod(destination, mode(st)).catch(() => {});
  }
}

async function isThere(target: string): Promise<boolean> {
  try {
    await fsp.lstat(target);
    return true;
  } catch {
    return false;
  }
}

export interface Placed {
  via: "rename" | "copy";
  /** Set when the item is safely in its new place but the original couldn't be fully removed. */
  warning?: string;
}

/**
 * Moves `source` to `destination` (which must not exist). `staging` is where a cross-disk copy is made first; it
 * must be on the same disk as `destination`.
 */
export async function placeTree(source: string, destination: string, staging: string, env: MoveEnv): Promise<Placed> {
  checkAbort(env);
  if (await env.hooks.sameDevice(source, nodePath.dirname(destination))) {
    if (await isThere(destination)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
    try {
      await renameSmart(source, destination);
      return { via: "rename" };
    } catch (err: any) {
      if (err?.code !== "EXDEV") throw err;
    }
  }
  // A leftover copy from an interrupted attempt of this very restore (the name carries the item's id) is cleared first.
  await removeTree(staging).catch(() => {});
  await fsp.mkdir(nodePath.dirname(staging), { recursive: true, mode: 0o700 });
  try {
    const counter = { files: 0, bytes: 0 };
    await copyInto(source, staging, env, counter);
    const problem = await verifyTree(source, staging, env);
    if (problem) throw new FmError("COPY_UNVERIFIED", `The copy couldn't be checked (${problem}), so the original was left where it is.`);
    checkAbort(env);
    if (await isThere(destination)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
    await renameSmart(staging, destination);
  } catch (err) {
    await removeTree(staging).catch(() => {});
    throw err;
  }
  try {
    await removeTree(source);
  } catch {
    return { via: "copy", warning: "It was copied to its new place, but the original couldn't be fully removed. Both copies still exist, so nothing is lost." };
  }
  return { via: "copy" };
}
