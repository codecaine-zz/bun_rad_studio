/**
 * Where the vault lives and how it is written: atomically (a temporary file in the same folder, synced, re-read and
 * verified, then renamed over the old file), with rotating encrypted backups, and with the small non-secret
 * counter file that slows down guessing. Only encrypted bytes (or counters) ever reach the disk.
 */
import { chmodSync, closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { MAX_FILE_BYTES } from "./fmSecretsFormat";
import { SecretsError } from "./fmSecretsCrypto";
import type { SecretsHooks } from "./fmSecretsHooks";

export const VAULT_FILE = "file_manager_secrets.radsec";
export const BACKUPS = 3;

export const vaultPath = (dataDir: string): string => join(dataDir, VAULT_FILE);
export const backupPath = (path: string, n: number): string => `${path}.${n}`;
export const throttlePath = (path: string): string => `${path}.attempts`;

/** The app's data folder, created private (0700) where the system supports it. */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try {
      chmodSync(dir, 0o700);
    } catch {
      // not ours to change (a shared folder): the vault file itself is still 0600
    }
  }
}

export const vaultExists = (path: string): boolean => existsSync(path);

export function readVaultFile(path: string): Buffer {
  const size = statSync(path).size;
  if (size > MAX_FILE_BYTES) throw new SecretsError("NOT_VAULT", "That file is far too big to be a vault.");
  return readFileSync(path);
}

function syncDirectory(dir: string): void {
  if (process.platform === "win32") return;
  try {
    const fd = openSync(dir, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // some file systems don't allow it; the rename itself is still atomic
  }
}

/** Removes leftovers of a save that was interrupted (temporary files next to the vault). */
export function cleanStaleTemps(path: string): void {
  try {
    const prefix = `${basename(path)}.`;
    for (const name of readdirSync(dirname(path))) if (name.startsWith(prefix) && name.endsWith(".tmp")) unlinkSync(join(dirname(path), name));
  } catch {
    // nothing to clean
  }
}

function writeNewFile(path: string, data: Buffer): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    let done = 0;
    while (done < data.length) done += writeSync(fd, data, done, data.length - done);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export interface AtomicOptions {
  /** Called with what was read back from the temporary file; throws if it can't be opened again. */
  verify?: (written: Buffer) => void;
  /** Keep the current file as backup .1 (shifting .1 to .2 and .2 to .3) before replacing it. */
  backup?: boolean;
  hooks?: Pick<SecretsHooks, "faultBeforeRename">;
}

/**
 * Replaces `path` with `data` so that at every moment the old file or the complete new file is there, never a mix.
 * Nothing is replaced unless the new bytes were fully written, synced, read back and verified.
 */
export function writeAtomic(path: string, data: Buffer, options: AtomicOptions = {}): void {
  if (data.length === 0) throw new SecretsError("EMPTY_SAVE", "Refusing to save an empty vault. Nothing was changed.");
  ensureDir(dirname(path));
  const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeNewFile(tmp, data);
    const back = readFileSync(tmp);
    if (back.length !== data.length || !back.equals(data)) throw new SecretsError("SAVE_FAILED", "The vault could not be written completely. Nothing was changed.");
    options.verify?.(back);
    options.hooks?.faultBeforeRename?.();
    if (options.backup && existsSync(path)) rotateBackups(path);
    renameSync(tmp, path);
    if (process.platform !== "win32") chmodSync(path, 0o600);
    syncDirectory(dirname(path));
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // already gone
    }
    throw err;
  }
}

/** .2 -> .3, .1 -> .2, current -> .1. The current vault is copied, never moved, so it is in place at every moment. */
function rotateBackups(path: string): void {
  for (let n = BACKUPS - 1; n >= 1; n--) if (existsSync(backupPath(path, n))) renameSync(backupPath(path, n), backupPath(path, n + 1));
  const tmp = `${backupPath(path, 1)}.${randomBytes(6).toString("hex")}.tmp`;
  copyFileSync(path, tmp);
  if (process.platform !== "win32") chmodSync(tmp, 0o600);
  renameSync(tmp, backupPath(path, 1));
}

export function deleteBackups(path: string): number {
  let n = 0;
  for (let i = 1; i <= BACKUPS; i++) {
    try {
      unlinkSync(backupPath(path, i));
      n++;
    } catch {
      // not there
    }
  }
  return n;
}

export const listBackups = (path: string): Array<{ n: number; bytes: number; modifiedMs: number }> =>
  Array.from({ length: BACKUPS }, (_, i) => i + 1).flatMap((n) => {
    try {
      const s = statSync(backupPath(path, n));
      return [{ n, bytes: s.size, modifiedMs: s.mtimeMs }];
    } catch {
      return [];
    }
  });

// ---------------------------------------------------------------------------------------------------------------
// The attempt counter. It holds no secret, only how many wrong passwords were typed and until when to wait. It is not
// protected against someone who can edit files; it only slows down guessing through this program.
// ---------------------------------------------------------------------------------------------------------------

export interface Throttle {
  fails: number;
  lastFailAt: number;
  until: number;
}

const FREE_ATTEMPTS = 2;
const MAX_DELAY_MS = 15 * 60 * 1000;

export const delayAfter = (fails: number): number => (fails <= FREE_ATTEMPTS ? 0 : Math.min(MAX_DELAY_MS, 1000 * 2 ** (fails - FREE_ATTEMPTS - 1)));

export function readThrottle(path: string): Throttle {
  try {
    const t = JSON.parse(readFileSync(throttlePath(path), "utf8"));
    const fails = Number(t.fails);
    return { fails: Number.isInteger(fails) && fails >= 0 ? Math.min(fails, 1000) : 0, lastFailAt: Number(t.lastFailAt) || 0, until: Number(t.until) || 0 };
  } catch {
    return { fails: 0, lastFailAt: 0, until: 0 };
  }
}

export function writeThrottle(path: string, t: Throttle): void {
  const file = throttlePath(path);
  try {
    if (t.fails === 0) {
      unlinkSync(file);
      return;
    }
    ensureDir(dirname(file));
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    writeNewFile(tmp, Buffer.from(JSON.stringify(t)));
    renameSync(tmp, file);
  } catch {
    // a missing counter must never stop the vault from working
  }
}
