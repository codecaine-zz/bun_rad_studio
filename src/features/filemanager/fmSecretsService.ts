/**
 * The vault's life cycle for one File Manager instance: create, unlock (password, key file, recovery key or
 * "this computer"), lock, change password, re-key, recovery key, device key, backups, throttling and the clipboard.
 * Every wrong-credential or damaged-file outcome gives the same message. Nothing secret is logged or put in an error.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { readClipboardSync, writeClipboardSync } from "../../localGuard";
import { absolutePath, type FmContext } from "./fmCore";
import { FmError } from "./fmPaths";
import {
  DEFAULT_LEVELS, SecretsError, WRONG_OR_DAMAGED, derivePasswordKek, formatRecoveryKey, masterProblem, newRecoveryKey, parseRecoveryKey, strengthOf, type Strength,
} from "./fmSecretsCrypto";
import { SERVICE, UNAVAILABLE, bunCredentialStore, encodeEntry, entryName, isExpired, parseEntry, probe } from "./fmSecretsDevice";
import {
  FLAG_DEVICE, FLAG_KEYFILE, FLAG_RECOVERY, decryptVault, encodeVault, newVaultKeys, parseHeader, passwordKekMatches, recoveryKeyMatches, removeDeviceWrap, removeRecoveryWrap, setDeviceWrap,
  setPasswordWrap, setRecoveryWrap, deviceKeyMatches, type Access, type ParsedHeader, type VaultKeys,
} from "./fmSecretsFormat";
import type { SecretsHooks, SecretsKdfParams } from "./fmSecretsHooks";
import { emptyDb, normalizeDb, normalizeSettings, type Db } from "./fmSecretsModel";
import { Session, sha256Hex, type Via } from "./fmSecretsSession";
import { backupPath, cleanStaleTemps, deleteBackups, delayAfter, ensureDir, listBackups, readThrottle, readVaultFile, throttlePath, vaultPath, writeAtomic, writeThrottle } from "./fmSecretsStore";

export interface Creds {
  password?: unknown;
  keyFile?: unknown;
  recoveryKey?: unknown;
}

const MAX_KEY_FILE = 1024 * 1024;

const failure = (retryAfterMs = 0): SecretsError => new SecretsError("WRONG_OR_DAMAGED", WRONG_OR_DAMAGED, retryAfterMs > 0 ? { retryAfterMs } : undefined);

export class SecretsService {
  readonly hooks: SecretsHooks;
  readonly path: string;
  readonly levels: Record<Strength, SecretsKdfParams>;
  session: Session | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private clip: { value: string; timer: unknown } | null = null;
  private header: { stamp: string; info: ParsedHeader | null } | null = null;
  private deviceProbe: { ok: boolean; reason: string; at: number } | null = null;

  constructor(readonly ctx: FmContext) {
    this.hooks = {
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      fetch: (url, init) => fetch(url, init),
      clipboard: { read: readClipboardSync, write: writeClipboardSync },
      store: bunCredentialStore(),
      ...ctx.secrets,
    };
    this.path = vaultPath(ctx.dataDir);
    this.levels = this.hooks.kdf ?? DEFAULT_LEVELS;
    ctx.disposers.push(() => this.shutdown());
  }

  /** One asynchronous vault operation at a time (key derivation takes a moment, and two at once would race). */
  serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => {});
    return run;
  }

  get unlocked(): Session | null {
    return this.session && !this.session.destroyed ? this.session : null;
  }

  requireSession(): Session {
    const s = this.unlocked;
    if (!s) throw new FmError("LOCKED", "The vault is locked. Unlock it first.");
    return s;
  }

  async keyFileBytes(input: unknown): Promise<Buffer> {
    const file = absolutePath(this.ctx, input);
    let size: number;
    try {
      const st = statSync(file);
      if (!st.isFile()) throw new Error("not a file");
      size = st.size;
    } catch {
      throw new FmError("BAD_KEY_FILE", "That key file couldn't be read. Check the location.");
    }
    if (size < 1 || size > MAX_KEY_FILE) throw new FmError("BAD_KEY_FILE", "A key file must be between 1 byte and 1 MB.");
    return readFileSync(file);
  }

  // ---- status ------------------------------------------------------------------------------------------------

  private headerInfo(): ParsedHeader | null {
    try {
      const st = statSync(this.path);
      const stamp = `${st.size}:${st.mtimeMs}`;
      if (this.header?.stamp === stamp) return this.header.info;
      let info: ParsedHeader | null = null;
      try {
        info = parseHeader(readVaultFile(this.path));
      } catch {
        info = null;
      }
      this.header = { stamp, info };
      return info;
    } catch {
      return null;
    }
  }

  status() {
    const exists = existsSync(this.path);
    const s = this.unlocked;
    const info = exists ? this.headerInfo() : null;
    const t = exists ? readThrottle(this.path) : { fails: 0, lastFailAt: 0, until: 0 };
    const keys = s?.keys;
    const params = keys?.params ?? info?.params;
    const flags = keys?.flags ?? info?.flags ?? 0;
    const db = s?.db ?? null;
    return {
      exists,
      locked: s === null,
      path: this.path,
      valid: !exists || info !== null || s !== null,
      params: params ? { strength: strengthOf(params, this.levels), memoryMiB: Math.round(params.memoryKiB / 1024), passes: params.passes, parallelism: params.parallelism, belowStandard: params.memoryKiB < this.levels.standard.memoryKiB } : null,
      keyFile: (flags & FLAG_KEYFILE) !== 0,
      recovery: (flags & FLAG_RECOVERY) !== 0,
      device: (flags & FLAG_DEVICE) !== 0,
      waitMs: Math.max(0, t.until - this.hooks.now()),
      ...(s && db
        ? {
            idleSeconds: s.idleSecondsLeft(),
            settings: db.settings,
            items: Object.values(db.items).filter((i) => i.deletedAt === null).length,
            trash: Object.values(db.items).filter((i) => i.deletedAt !== null).length,
            savedAt: existsSync(this.path) ? statSync(this.path).mtimeMs : null,
            dirty: s.dirty,
            conflict: s.conflict,
            via: s.via,
            backups: listBackups(this.path).length,
            fileBytes: existsSync(this.path) ? statSync(this.path).size : 0,
          }
        : {}),
    };
  }

  // ---- throttle ----------------------------------------------------------------------------------------------

  private checkThrottle(): void {
    const wait = readThrottle(this.path).until - this.hooks.now();
    if (wait > 0) throw new SecretsError("THROTTLED", `Too many wrong attempts. Wait ${Math.ceil(wait / 1000)} second${Math.ceil(wait / 1000) === 1 ? "" : "s"} before trying again.`, { retryAfterMs: wait });
  }

  private recordFailure(): number {
    const t = readThrottle(this.path);
    const now = this.hooks.now();
    const fails = t.fails + 1;
    const delay = delayAfter(fails);
    writeThrottle(this.path, { fails, lastFailAt: now, until: delay > 0 ? now + delay : 0 });
    return delay;
  }

  /** Makes a wrong-password attempt cost about as much as a real one, so a refused file isn't told apart by its speed. */
  private async burn(): Promise<void> {
    try {
      const k = await derivePasswordKek("x", null, randomBytes(32), this.levels.standard);
      k.fill(0);
    } catch {
      // only the time matters
    }
  }

  // ---- create ------------------------------------------------------------------------------------------------

  async create(body: { password: unknown; keyFile?: unknown; strength?: unknown; recovery?: unknown }): Promise<{ recoveryKey?: string; kdfMs: number }> {
    return this.serial(async () => {
      if (existsSync(this.path)) throw new FmError("EXISTS", "A vault already exists. Unlock it instead.");
      const problem = masterProblem(body.password);
      if (problem) throw new FmError("WEAK_PASSWORD", problem);
      const level = body.strength === undefined ? "standard" : body.strength;
      if (level !== "standard" && level !== "strong" && level !== "maximum") throw new FmError("BAD_REQUEST", "Choose Standard, Strong or Maximum.");
      const params = this.levels[level];
      const kf = body.keyFile ? await this.keyFileBytes(body.keyFile) : null;
      const salt = randomBytes(32);
      const started = this.hooks.now();
      const kek = await derivePasswordKek(body.password as string, kf, salt, params);
      const kdfMs = Math.max(0, this.hooks.now() - started);
      kf?.fill(0);
      const keys = newVaultKeys(params, salt, kek, kf !== null);
      kek.fill(0);
      let recoveryKey: string | undefined;
      if (body.recovery === true) {
        const rk = newRecoveryKey();
        setRecoveryWrap(keys, rk);
        recoveryKey = formatRecoveryKey(rk);
        rk.fill(0);
      }
      const now = this.hooks.now();
      const db = emptyDb(now);
      db.audit.push({ t: now, ev: "created" });
      const plain = Buffer.from(JSON.stringify(db), "utf8");
      try {
        const file = encodeVault(keys, plain);
        ensureDir(this.ctx.dataDir);
        writeAtomic(this.path, file, { hooks: this.hooks });
        this.open(keys, db, file, "password");
      } finally {
        plain.fill(0);
      }
      return { ...(recoveryKey ? { recoveryKey } : {}), kdfMs };
    });
  }

  private open(keys: VaultKeys, db: Db, file: Buffer, via: Via): Session {
    this.session?.destroy();
    this.session = new Session(this.path, this.hooks, keys, db, sha256Hex(file), via, () => this.lock("auto-lock"));
    return this.session;
  }

  // ---- unlock ------------------------------------------------------------------------------------------------

  /** Reads and decrypts a vault file with the given access; throws the one generic failure for everything wrong. */
  private async openFile(file: Buffer, how: { creds: Creds; countFailures: boolean }): Promise<{ keys: VaultKeys; db: Db; via: Via; header: ParsedHeader }> {
    const fail = async (): Promise<never> => {
      const delay = how.countFailures ? this.recordFailure() : 0;
      throw failure(delay);
    };
    let header: ParsedHeader;
    try {
      header = parseHeader(file);
    } catch (err) {
      if (err instanceof SecretsError && (err.code === "NOT_VAULT" || err.code === "UNSUPPORTED")) throw err;
      await this.burn();
      return fail();
    }
    const { creds } = how;
    let access: Access;
    let via: Via = "password";
    let kf: Buffer | null = null;
    let kek: Buffer | null = null;
    if (creds.recoveryKey !== undefined) {
      const key = parseRecoveryKey(creds.recoveryKey);
      if (!key || !header.recWrap) {
        await this.burn();
        return fail();
      }
      access = { kind: "recovery", key };
      via = "recovery";
    } else {
      if (typeof creds.password !== "string" || creds.password.length === 0) throw new FmError("BAD_REQUEST", "Type the master password first.");
      if ((header.flags & FLAG_KEYFILE) !== 0) {
        if (!creds.keyFile) throw new FmError("NEEDS_KEY_FILE", "This vault needs its key file as well as the password. Choose the key file and try again.");
        kf = await this.keyFileBytes(creds.keyFile);
      }
      try {
        kek = await derivePasswordKek(creds.password, kf, header.salt, header.params);
      } catch (err) {
        if (err instanceof SecretsError && err.code === "NO_MEMORY") throw err;
        return fail();
      } finally {
        kf?.fill(0);
      }
      access = { kind: "password", kek };
    }
    try {
      const { keys, plain } = decryptVault(file, header, access);
      try {
        return { keys, db: normalizeDb(JSON.parse(plain.toString("utf8")), this.hooks.now()), via, header };
      } catch {
        keys.dataKey.fill(0);
        return fail();
      } finally {
        plain.fill(0);
      }
    } catch (err) {
      if (err instanceof SecretsError && err.code === "WRONG_OR_DAMAGED") throw err;
      return fail();
    } finally {
      kek?.fill(0);
      if (access.kind === "recovery") access.key.fill(0);
    }
  }

  async unlock(creds: Creds): Promise<void> {
    return this.serial(async () => {
      if (this.unlocked) return;
      if (!existsSync(this.path)) throw new FmError("NO_VAULT", "There is no vault yet. Create one first.");
      this.checkThrottle();
      const file = readVaultFile(this.path);
      const opened = await this.openFile(file, { creds, countFailures: true });
      await this.finishUnlock(opened, file, opened.via);
    });
  }

  private async finishUnlock(opened: { keys: VaultKeys; db: Db }, file: Buffer, via: Via): Promise<void> {
    const before = readThrottle(this.path);
    writeThrottle(this.path, { fails: 0, lastFailAt: 0, until: 0 });
    cleanStaleTemps(this.path);
    const s = this.open(opened.keys, opened.db, file, via);
    if (before.fails > 0) s.audit("failed-attempts", before.fails);
    s.audit(via === "recovery" ? "recovery-unlock" : via === "device" ? "device-unlock" : "unlock");
    s.saveSoon();
    if (via !== "device" && opened.keys.devWrap) await this.refreshDeviceEntry(s);
  }

  /** Unlock with the key kept in the OS credential store. Never counts as a wrong password; every problem gives a plain message. */
  async unlockWithDevice(): Promise<void> {
    return this.serial(async () => {
      if (this.unlocked) return;
      if (!existsSync(this.path)) throw new FmError("NO_VAULT", "There is no vault yet. Create one first.");
      const file = readVaultFile(this.path);
      let header: ParsedHeader;
      try {
        header = parseHeader(file);
      } catch (err) {
        if (err instanceof SecretsError && (err.code === "NOT_VAULT" || err.code === "UNSUPPORTED")) throw err;
        throw failure();
      }
      if (!header.devWrap) throw new FmError("DEVICE_OFF", "“Unlock with this computer” isn't turned on for this vault. Use your master password.");
      let text: string | null;
      try {
        text = await this.hooks.store.get(SERVICE, entryName(header.vaultId));
      } catch {
        throw new FmError("DEVICE_UNAVAILABLE", UNAVAILABLE);
      }
      const entry = parseEntry(text);
      if (!entry) throw new FmError("DEVICE_MISSING", "This computer doesn't have the key for this vault (it may have been removed, or the vault was copied from another computer). Use your master password.");
      if (isExpired(entry, this.hooks.now())) {
        entry.key.fill(0);
        throw new FmError("DEVICE_EXPIRED", `For safety the master password is needed at least every ${entry.days} days. Type it once, and “Unlock with this computer” works again.`);
      }
      try {
        const { keys, plain } = decryptVault(file, header, { kind: "device", key: entry.key });
        try {
          await this.finishUnlock({ keys, db: normalizeDb(JSON.parse(plain.toString("utf8")), this.hooks.now()) }, file, "device");
        } finally {
          plain.fill(0);
        }
      } catch (err) {
        if (err instanceof FmError && !(err instanceof SecretsError)) throw err;
        throw new FmError("DEVICE_CHANGED", "The key stored on this computer doesn't match this vault any more. Use your master password.");
      } finally {
        entry.key.fill(0);
      }
    });
  }

  private async refreshDeviceEntry(s: Session): Promise<void> {
    try {
      const entry = parseEntry(await this.hooks.store.get(SERVICE, entryName(s.keys.vaultId)));
      if (entry && deviceKeyMatches(s.keys, entry.key)) await this.hooks.store.set(SERVICE, entryName(s.keys.vaultId), encodeEntry({ ...entry, passwordAt: this.hooks.now(), days: s.database().settings.deviceMaxDays }));
      entry?.key.fill(0);
    } catch {
      // the shortcut just stays as it was
    }
  }

  // ---- lock --------------------------------------------------------------------------------------------------

  lock(reason = "lock"): { saved: boolean } {
    const s = this.session;
    this.session = null;
    this.clearClipboardNow();
    if (!s || s.destroyed) return { saved: true };
    let saved = true;
    try {
      s.audit(reason);
      s.dirty = true;
      s.flush();
    } catch {
      saved = false;
    }
    s.destroy();
    return { saved };
  }

  shutdown(): void {
    this.lock("shutdown");
  }

  // ---- clipboard ---------------------------------------------------------------------------------------------

  copy(value: string, seconds: number): boolean {
    if (!this.hooks.clipboard.write(value)) return false;
    if (this.clip) this.hooks.clearTimer(this.clip.timer);
    this.clip = { value, timer: null };
    if (seconds > 0) {
      const t = this.hooks.setTimer(() => this.clearClipboardNow(), seconds * 1000);
      (t as { unref?: () => void } | null)?.unref?.();
      this.clip.timer = t;
    }
    return true;
  }

  /** Empties the clipboard, but only when it still holds what this program put there. */
  clearClipboardNow(): void {
    const c = this.clip;
    this.clip = null;
    if (!c) return;
    this.hooks.clearTimer(c.timer);
    try {
      if (this.hooks.clipboard.read().trimEnd() === c.value.trimEnd()) this.hooks.clipboard.write("");
    } catch {
      // nothing more can be done
    }
  }

  // ---- proving the password again, and changing the keys -----------------------------------------------------

  /** Checks the master password (and key file) or recovery key against the open vault. Returns the key file's bytes (zero them) or null. */
  async verify(s: Session, creds: Creds): Promise<Buffer | null> {
    this.checkThrottle();
    const wrong = (): never => {
      const delay = this.recordFailure();
      throw new SecretsError("WRONG_PASSWORD", "That isn't the right password, key file or recovery key.", delay > 0 ? { retryAfterMs: delay } : undefined);
    };
    if (creds.recoveryKey !== undefined) {
      const key = parseRecoveryKey(creds.recoveryKey);
      const ok = key !== null && recoveryKeyMatches(s.keys, key);
      key?.fill(0);
      return ok ? null : wrong();
    }
    if (typeof creds.password !== "string" || !creds.password) throw new FmError("BAD_REQUEST", "Type the master password to confirm.");
    let kf: Buffer | null = null;
    if ((s.keys.flags & FLAG_KEYFILE) !== 0) {
      if (!creds.keyFile) throw new FmError("NEEDS_KEY_FILE", "This vault needs its key file as well as the password.");
      kf = await this.keyFileBytes(creds.keyFile);
    }
    const kek = await derivePasswordKek(creds.password, kf, s.keys.salt, s.keys.params);
    const ok = passwordKekMatches(s.keys, kek);
    kek.fill(0);
    if (!ok) {
      kf?.fill(0);
      return wrong();
    }
    writeThrottle(this.path, { fails: 0, lastFailAt: 0, until: 0 });
    return kf;
  }

  /** Applies a change to the keys and saves it; on failure the old keys are put back. With `dropBackups`, old backups (which still open with the old keys) are deleted. */
  commitKeys(s: Session, mutate: () => void, dropBackups: boolean): { backupsDeleted: number } {
    const k = s.keys;
    const snap = { params: { ...k.params }, salt: Buffer.from(k.salt), flags: k.flags, pwWrap: Buffer.from(k.pwWrap), recWrap: k.recWrap && Buffer.from(k.recWrap), devWrap: k.devWrap && Buffer.from(k.devWrap), dataKey: k.dataKey };
    const auditBefore = s.database().audit;
    try {
      mutate();
      s.dirty = true;
      s.flush();
    } catch (err) {
      if (k.dataKey !== snap.dataKey) k.dataKey.fill(0);
      Object.assign(k, snap);
      s.database().audit = auditBefore;
      throw err;
    }
    if (snap.dataKey !== k.dataKey) snap.dataKey.fill(0);
    return { backupsDeleted: dropBackups ? deleteBackups(this.path) : 0 };
  }

  async changePassword(body: Creds & { newPassword: unknown; newKeyFile?: unknown; dropKeyFile?: unknown }): Promise<{ backupsDeleted: number }> {
    return this.serial(async () => {
      const s = this.requireSession();
      const problem = masterProblem(body.newPassword);
      if (problem) throw new FmError("WEAK_PASSWORD", problem);
      const current = s.via === "recovery" && body.password === undefined && body.recoveryKey === undefined ? null : await this.verify(s, body);
      let kf: Buffer | null = null;
      if (body.newKeyFile) kf = await this.keyFileBytes(body.newKeyFile);
      else if (body.dropKeyFile !== true && (s.keys.flags & FLAG_KEYFILE) !== 0) {
        if (!current) throw new FmError("NEEDS_KEY_FILE", "Choose the key file this vault uses, so it can be kept with the new password.");
        kf = Buffer.from(current);
      }
      current?.fill(0);
      const salt = randomBytes(32);
      const kek = await derivePasswordKek(body.newPassword as string, kf, salt, s.keys.params);
      try {
        return this.commitKeys(s, () => {
          s.keys.salt = salt;
          s.keys.flags = kf ? s.keys.flags | FLAG_KEYFILE : s.keys.flags & ~FLAG_KEYFILE;
          setPasswordWrap(s.keys, kek);
          s.audit("change-password");
        }, true);
      } finally {
        kek.fill(0);
        kf?.fill(0);
      }
    });
  }

  async rekey(body: Creds & { strength: unknown; rotateKey?: unknown }): Promise<{ kdfMs: number; backupsDeleted: number; recoveryRemoved: boolean }> {
    return this.serial(async () => {
      const s = this.requireSession();
      const level = body.strength;
      if (level !== "standard" && level !== "strong" && level !== "maximum") throw new FmError("BAD_REQUEST", "Choose Standard, Strong or Maximum.");
      if (typeof body.password !== "string" || !body.password) throw new FmError("BAD_REQUEST", "Type the master password to confirm.");
      const kf = await this.verify(s, { password: body.password, keyFile: body.keyFile });
      const salt = randomBytes(32);
      const params = this.levels[level];
      const started = this.hooks.now();
      const kek = await derivePasswordKek(body.password, kf, salt, params);
      const kdfMs = Math.max(0, this.hooks.now() - started);
      kf?.fill(0);
      const rotate = body.rotateKey === true;
      const hadDevice = s.keys.devWrap !== null;
      const hadRecovery = s.keys.recWrap !== null;
      try {
        const out = this.commitKeys(s, () => {
          s.keys.salt = salt;
          s.keys.params = { ...params };
          if (rotate) {
            s.keys.dataKey = randomBytes(32);
            removeRecoveryWrap(s.keys);
            removeDeviceWrap(s.keys);
          }
          setPasswordWrap(s.keys, kek);
          s.audit("rekey");
        }, rotate);
        if (rotate && hadDevice) await this.hooks.store.delete(SERVICE, entryName(s.keys.vaultId)).catch(() => false);
        return { kdfMs, ...out, recoveryRemoved: rotate && hadRecovery };
      } finally {
        kek.fill(0);
      }
    });
  }

  async recovery(body: Creds & { action: unknown }): Promise<{ recoveryKey?: string; matches?: boolean; backupsDeleted?: number }> {
    if (body.action === "verify") {
      const s = this.requireSession();
      const key = parseRecoveryKey(body.recoveryKey);
      const ok = key !== null && recoveryKeyMatches(s.keys, key);
      key?.fill(0);
      return { matches: ok };
    }
    return this.serial(async () => {
      const s = this.requireSession();
      if (body.action !== "create" && body.action !== "remove") throw new FmError("BAD_REQUEST", "Choose what to do with the recovery key.");
      (await this.verify(s, { password: body.password, keyFile: body.keyFile }))?.fill(0);
      if (body.action === "remove") return this.commitKeys(s, () => { removeRecoveryWrap(s.keys); s.audit("recovery-remove"); }, true);
      const rk = newRecoveryKey();
      try {
        const out = this.commitKeys(s, () => { setRecoveryWrap(s.keys, rk); s.audit("recovery-create"); }, true);
        return { ...out, recoveryKey: formatRecoveryKey(rk) };
      } finally {
        rk.fill(0);
      }
    });
  }

  // ---- "Unlock with this computer" ---------------------------------------------------------------------------

  async deviceAvailability(): Promise<{ ok: boolean; reason: string }> {
    if (!this.deviceProbe || this.hooks.now() - this.deviceProbe.at > 60_000) this.deviceProbe = { ...(await probe(this.hooks.store)), at: this.hooks.now() };
    return this.deviceProbe;
  }

  async deviceEnable(creds: Creds): Promise<void> {
    return this.serial(async () => {
      const s = this.requireSession();
      const avail = await this.deviceAvailability();
      if (!avail.ok) throw new FmError("DEVICE_UNAVAILABLE", avail.reason);
      (await this.verify(s, creds))?.fill(0);
      const key = randomBytes(32);
      const name = entryName(s.keys.vaultId);
      try {
        await this.hooks.store.set(SERVICE, name, encodeEntry({ key, passwordAt: this.hooks.now(), days: s.database().settings.deviceMaxDays }));
      } catch {
        key.fill(0);
        throw new FmError("DEVICE_UNAVAILABLE", UNAVAILABLE);
      }
      try {
        this.commitKeys(s, () => { setDeviceWrap(s.keys, key); s.audit("device-on"); }, false);
      } catch (err) {
        await this.hooks.store.delete(SERVICE, name).catch(() => false);
        throw err;
      } finally {
        key.fill(0);
      }
    });
  }

  async deviceDisable(): Promise<{ keychainRemoved: boolean; backupsDeleted: number }> {
    return this.serial(async () => {
      const s = this.requireSession();
      const name = entryName(s.keys.vaultId);
      const out = s.keys.devWrap ? this.commitKeys(s, () => { removeDeviceWrap(s.keys); s.audit("device-off"); }, true) : { backupsDeleted: 0 };
      let keychainRemoved = true;
      try {
        await this.hooks.store.delete(SERVICE, name);
      } catch {
        keychainRemoved = false;
      }
      return { keychainRemoved, ...out };
    });
  }

  async updateSettings(input: unknown): Promise<void> {
    const s = this.requireSession();
    s.change((db) => {
      db.settings = normalizeSettings(input, db.settings);
      s.audit("settings");
    });
    s.settingsChanged();
    if (s.keys.devWrap) await this.refreshDeviceDays(s);
  }

  private async refreshDeviceDays(s: Session): Promise<void> {
    try {
      const name = entryName(s.keys.vaultId);
      const entry = parseEntry(await this.hooks.store.get(SERVICE, name));
      if (entry && deviceKeyMatches(s.keys, entry.key)) await this.hooks.store.set(SERVICE, name, encodeEntry({ ...entry, days: s.database().settings.deviceMaxDays }));
      entry?.key.fill(0);
    } catch {
      // the old limit stays until the next master-password unlock
    }
  }

  // ---- backups and removal -----------------------------------------------------------------------------------

  /** Writes a copy of the (encrypted) vault to a new file. Works locked or unlocked; never overwrites. */
  exportBackup(target: string): void {
    if (!existsSync(this.path)) throw new FmError("NO_VAULT", "There is no vault to back up yet.");
    const s = this.unlocked;
    if (s) s.flush();
    if (existsSync(target)) throw new FmError("EXISTS", "That file already exists. Choose a new name.");
    writeAtomic(target, readVaultFile(this.path));
    if (s) s.change(() => s.audit("export-backup"));
  }

  /** Replaces the vault with a backup, after decrypting it here to prove it is good. The current vault is kept as backup .1 first. */
  async importBackup(file: Buffer, creds: Creds): Promise<void> {
    return this.serial(async () => {
      if (existsSync(this.path)) this.checkThrottle();
      const opened = await this.openFile(file, { creds, countFailures: existsSync(this.path) });
      const s = this.unlocked;
      if (s) {
        try {
          s.flush();
        } catch {
          // an unsaved change that can't be saved is lost with the swap; the person asked for the restore
        }
      }
      writeAtomic(this.path, file, { backup: true, hooks: this.hooks });
      this.session?.destroy();
      this.session = null;
      this.header = null;
      const fresh = this.open(opened.keys, opened.db, file, opened.via);
      fresh.audit("import-backup");
      fresh.saveSoon();
    });
  }

  async destroyVault(): Promise<void> {
    return this.serial(async () => {
      const info = existsSync(this.path) ? this.headerInfo() : null;
      this.lock("destroyed");
      for (const f of [this.path, throttlePath(this.path), ...[1, 2, 3].map((n) => backupPath(this.path, n))]) {
        try {
          unlinkSync(f);
        } catch {
          // not there
        }
      }
      this.header = null;
      if (info?.devWrap) await this.hooks.store.delete(SERVICE, entryName(info.vaultId)).catch(() => false);
    });
  }
}

const services = new WeakMap<FmContext, SecretsService>();

/** The Secrets service of this File Manager instance (made on first use, locked when the server stops). */
export function secretsService(ctx: FmContext): SecretsService {
  let s = services.get(ctx);
  if (!s) {
    s = new SecretsService(ctx);
    services.set(ctx, s);
  }
  return s;
}
