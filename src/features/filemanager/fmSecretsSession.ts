/**
 * One unlocked vault: the keys, the decrypted database, saving, the idle timer and the clipboard clean-up. It lives
 * inside one File Manager instance's service (never in a module-level variable), and `destroy()` zeroes the key
 * material and drops the database. Saving is synchronous on purpose: a save is one small file write, and it keeps
 * the "one writer at a time" rule and the shutdown flush trivial.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { FmError } from "./fmPaths";
import { SecretsError } from "./fmSecretsCrypto";
import { MAX_PLAINTEXT_BYTES, encodeVault, openWithDataKey, parseHeader, wipeKeys, type VaultKeys } from "./fmSecretsFormat";
import type { SecretsHooks } from "./fmSecretsHooks";
import { LIMITS, type AuditEvent, type Db } from "./fmSecretsModel";
import { writeAtomic } from "./fmSecretsStore";

export const sha256Hex = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

export interface PendingImport {
  token: string;
  items: Array<Record<string, any>>;
  dialect: string;
  warnings: string[];
}

export type Via = "password" | "recovery" | "device";

export class Session {
  db: Db | null;
  keys: VaultKeys;
  readonly via: Via;
  /** SHA-256 of the vault file as this session last read or wrote it: a different file on disk means somebody else changed it. */
  lastDigest: string | null;
  conflict = false;
  dirty = false;
  lastActivity: number;
  lastBackupAt = 0;
  pendingImport: PendingImport | null = null;
  private readonly usedNonces = new Set<string>();
  private saveTimer: unknown = null;
  private idleTimer: unknown = null;

  constructor(
    private readonly path: string,
    private readonly hooks: SecretsHooks,
    keys: VaultKeys,
    db: Db,
    lastDigest: string | null,
    via: Via = "password",
    private readonly onAutoLock: () => void = () => {},
  ) {
    this.keys = keys;
    this.db = db;
    this.lastDigest = lastDigest;
    this.via = via;
    this.lastActivity = hooks.now();
    this.armIdle();
  }

  get destroyed(): boolean {
    return this.db === null;
  }

  database(): Db {
    if (!this.db) throw new FmError("LOCKED", "The vault is locked. Unlock it first.");
    return this.db;
  }

  // ---- idle auto-lock ----------------------------------------------------------------------------------------

  private idleMs(): number {
    return (this.db?.settings.autoLockMinutes ?? 0) * 60_000;
  }

  private armIdle(): void {
    if (this.idleTimer !== null) this.hooks.clearTimer(this.idleTimer);
    this.idleTimer = null;
    const ms = this.idleMs();
    if (ms <= 0 || this.destroyed) return;
    const left = Math.max(0, this.lastActivity + ms - this.hooks.now());
    this.idleTimer = this.hooks.setTimer(() => {
      this.idleTimer = null;
      if (this.destroyed) return;
      if (this.hooks.now() - this.lastActivity >= ms - 25) this.onAutoLock();
      else this.armIdle();
    }, left);
    (this.idleTimer as { unref?: () => void } | null)?.unref?.();
  }

  /** The person is using the vault: restart the idle countdown. */
  touch(): void {
    if (this.destroyed) return;
    this.lastActivity = this.hooks.now();
    this.armIdle();
  }

  /** Seconds until auto-lock, or null when auto-lock is off. Asking does not count as activity. */
  idleSecondsLeft(): number | null {
    const ms = this.idleMs();
    return ms > 0 ? Math.max(0, Math.ceil((this.lastActivity + ms - this.hooks.now()) / 1000)) : null;
  }

  settingsChanged(): void {
    this.armIdle();
  }

  // ---- saving ------------------------------------------------------------------------------------------------

  private diskDigest(): string | null {
    return existsSync(this.path) ? sha256Hex(readFileSync(this.path)) : null;
  }

  /**
   * Writes the database now. Refuses (and changes nothing on disk) when the file was changed behind this session's
   * back or can't be verified after writing; the old vault is then still in place.
   */
  flush(opts: { backup?: boolean } = {}): void {
    if (!this.db || (!this.dirty && !opts.backup)) return;
    if (this.conflict) throw new FmError("CONFLICT", "The vault file changed on disk since you unlocked it (another copy of this program or a sync tool?). Nothing was overwritten.");
    if (this.diskDigest() !== this.lastDigest) {
      this.conflict = true;
      throw new FmError("CONFLICT", "The vault file changed on disk since you unlocked it (another copy of this program or a sync tool?). Nothing was overwritten.");
    }
    this.db.modifiedAt = this.hooks.now();
    const plain = Buffer.from(JSON.stringify(this.db), "utf8");
    try {
      if (plain.length > MAX_PLAINTEXT_BYTES) throw new SecretsError("TOO_LARGE", "The vault has grown too big to save (the limit is 64 MB of data). Delete or shrink something first.");
      let nonce = randomBytes(12);
      while (this.usedNonces.has(nonce.toString("hex"))) nonce = randomBytes(12);
      this.usedNonces.add(nonce.toString("hex"));
      const file = encodeVault(this.keys, plain, randomBytes, nonce);
      const now = this.hooks.now();
      const rotate = opts.backup === true || now - this.lastBackupAt >= (this.hooks.backupMinIntervalMs ?? 10 * 60_000);
      writeAtomic(this.path, file, {
        backup: rotate,
        hooks: this.hooks,
        verify: (written) => {
          const h = parseHeader(written);
          const again = openWithDataKey(written, h, this.keys.dataKey);
          const same = again.length === plain.length;
          again.fill(0);
          if (!same) throw new SecretsError("SAVE_FAILED", "The saved vault could not be verified. Nothing was changed.");
        },
      });
      if (rotate) this.lastBackupAt = now;
      this.lastDigest = sha256Hex(file);
      this.dirty = false;
    } finally {
      plain.fill(0);
    }
  }

  /** Saves in a moment (a few changes in a row become one write). Failures surface at the next immediate save, on lock, or in the status. */
  saveSoon(): void {
    this.dirty = true;
    if (this.saveTimer !== null) return;
    this.saveTimer = this.hooks.setTimer(() => {
      this.saveTimer = null;
      try {
        this.flush();
      } catch {
        // the conflict flag or the error is reported by the next operation
      }
    }, this.hooks.saveDelayMs ?? 500);
    (this.saveTimer as { unref?: () => void } | null)?.unref?.();
  }

  /**
   * Runs `fn` on the database and saves at once. When the save fails, the database is put back exactly as it was and
   * the error is passed on, so what is in memory is never ahead of what is on disk.
   */
  change<T>(fn: (db: Db) => T, opts: { backup?: boolean } = {}): T {
    const db = this.database();
    const before = { items: db.items, settings: db.settings, audit: db.audit, dirty: this.dirty };
    db.items = { ...db.items };
    db.audit = [...db.audit];
    db.settings = { ...db.settings };
    try {
      const out = fn(db);
      if (db.audit.length > LIMITS.audit) db.audit = db.audit.slice(-LIMITS.audit);
      this.dirty = true;
      this.flush(opts);
      this.armIdle();
      return out;
    } catch (err) {
      db.items = before.items;
      db.settings = before.settings;
      db.audit = before.audit;
      this.dirty = before.dirty;
      throw err;
    }
  }

  audit(ev: string, n?: number): void {
    const db = this.database();
    const e: AuditEvent = { t: this.hooks.now(), ev, ...(n === undefined ? {} : { n }) };
    db.audit = [...db.audit, e].slice(-LIMITS.audit);
  }

  /** Accepts what is on disk as this session's base (the person chose to keep their open copy). */
  acceptDisk(): void {
    this.lastDigest = this.diskDigest();
    this.conflict = false;
    this.dirty = true;
  }

  /** Zeroes the keys and drops the database. Safe to call twice. */
  destroy(): void {
    if (this.saveTimer !== null) this.hooks.clearTimer(this.saveTimer);
    if (this.idleTimer !== null) this.hooks.clearTimer(this.idleTimer);
    this.saveTimer = this.idleTimer = null;
    wipeKeys(this.keys);
    this.db = null;
    this.pendingImport = null;
    this.usedNonces.clear();
  }
}
