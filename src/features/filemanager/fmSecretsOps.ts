/**
 * The vault-level Secrets operations (create, unlock, lock, settings, keys, recovery, device, backups). The item
 * operations are in fmSecretsItemOps.ts. All of them sit behind the File Manager's token and loopback guard.
 */
import { closeSync, existsSync, fsyncSync, openSync, writeSync } from "node:fs";
import { absolutePath, type FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";
import { randomBytes } from "node:crypto";
import { derivePasswordKek, formatRecoveryKey, masterProblem, newKeyFileBytes, parseRecoveryKey, passwordBits, type Strength } from "./fmSecretsCrypto";
import { optionalText, credsOf, newFilePath, secretsOp } from "./fmSecretsGuard";
import { generateSecret } from "./fmSecretsGen";
import { itemOperations } from "./fmSecretsItemOps";
import { readVaultFile } from "./fmSecretsStore";

export const secretsOperations: Record<string, FmHandler> = {
  "secrets/status": secretsOp((svc) => ({ status: svc.status() }), { touch: false }),

  "secrets/check-password": secretsOp((_svc, _ctx, b) => {
    const problem = masterProblem(b.password);
    return { acceptable: problem === null, problem: problem ?? "", bits: typeof b.password === "string" ? passwordBits(b.password) : 0 };
  }, { touch: false }),

  "secrets/generate": secretsOp((_svc, _ctx, b) => ({ generated: generateSecret(b) }), { touch: false }),

  /** How long unlocking takes on this computer at one of the three strengths (a throw-away key derivation). */
  "secrets/benchmark": secretsOp((svc, _ctx, b) => svc.serial(async () => {
    if (b.strength !== "standard" && b.strength !== "strong" && b.strength !== "maximum") throw new FmError("BAD_REQUEST", "Choose Standard, Strong or Maximum.");
    const params = svc.levels[b.strength as Strength];
    const started = performance.now();
    try {
      (await derivePasswordKek("benchmark", null, randomBytes(32), params)).fill(0);
    } catch {
      return { ms: null, memoryMiB: Math.round(params.memoryKiB / 1024), problem: "This computer can't spare that much memory right now." };
    }
    return { ms: Math.round(performance.now() - started), memoryMiB: Math.round(params.memoryKiB / 1024), problem: "" };
  }), { touch: false }),

  /**
   * Copies a recovery key that was just shown to the clipboard, so nobody has to type it by hand. The key comes from
   * the page that showed it (it is checked to really be a recovery key and is never stored here), and the clipboard is
   * cleared again after the usual number of seconds if nothing else was copied meanwhile.
   */
  "secrets/copy-recovery": secretsOp((svc, _ctx, b) => {
    const key = parseRecoveryKey(b.text);
    if (!key) throw new FmError("BAD_REQUEST", "That isn't a recovery key.");
    const seconds = svc.requireSession().database().settings.clipboardSeconds;
    const written = svc.copy(formatRecoveryKey(key), seconds);
    key.fill(0);
    if (!written) throw new FmError("CLIPBOARD_FAILED", "Couldn't use the clipboard on this computer.");
    return { copied: true, clearsInSeconds: seconds > 0 ? seconds : null };
  }),

  /** Saves a shown recovery key to a new text file (readable only by you, never overwriting), for people who print it or keep it on a USB stick. */
  async "secrets/save-recovery"(ctx, b) {
    return secretsOp((svc) => {
      svc.requireSession();
      const key = parseRecoveryKey(b.text);
      if (!key) throw new FmError("BAD_REQUEST", "That isn't a recovery key.");
      const path = newFilePath(ctx, b.path);
      const text = `Codecaine File Manager: Secrets recovery key\n\n${formatRecoveryKey(key)}\n\nAnyone who has this key can open your Secrets vault. Keep this file somewhere safe and offline, such as a USB stick in a drawer, or print it and delete the file.\n`;
      key.fill(0);
      const fd = openSync(path, "wx", 0o600);
      try {
        writeSync(fd, text);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return { path };
    })(ctx, b);
  },

  async "secrets/keyfile"(ctx, b) {
    return secretsOp(() => {
      const path = newFilePath(ctx, b.path);
      const bytes = newKeyFileBytes();
      const fd = openSync(path, "wx", 0o600);
      try {
        writeSync(fd, bytes);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
        bytes.fill(0);
      }
      return { path };
    })(ctx, b);
  },

  "secrets/create": secretsOp(async (svc, _ctx, b) => {
    const made = await svc.create({ password: b.password, keyFile: optionalText(b.keyFile, "key file location"), strength: b.strength, recovery: b.recovery });
    return { ...made, status: svc.status() };
  }, { touch: false }),

  "secrets/unlock": secretsOp(async (svc, _ctx, b) => {
    if (b.device === true) await svc.unlockWithDevice();
    else await svc.unlock(credsOf(b));
    return { status: svc.status() };
  }, { touch: false }),

  "secrets/lock": secretsOp((svc) => ({ ...svc.lock("lock"), status: svc.status() }), { touch: false }),

  "secrets/ping": secretsOp((svc) => ({ idleSeconds: svc.unlocked?.idleSecondsLeft() ?? null })),

  "secrets/settings": secretsOp(async (svc, _ctx, b) => {
    if (b.settings !== undefined) await svc.updateSettings(b.settings);
    return { settings: svc.requireSession().database().settings, status: svc.status() };
  }),

  "secrets/change-password": secretsOp(async (svc, _ctx, b) => {
    const out = await svc.changePassword({ ...credsOf(b), newPassword: b.newPassword, newKeyFile: optionalText(b.newKeyFile, "key file location"), dropKeyFile: b.dropKeyFile });
    return { ...out, status: svc.status() };
  }),

  "secrets/rekey": secretsOp(async (svc, _ctx, b) => ({ ...(await svc.rekey({ ...credsOf(b), strength: b.strength, rotateKey: b.rotateKey })), status: svc.status() })),

  "secrets/recovery": secretsOp(async (svc, _ctx, b) => ({ ...(await svc.recovery({ ...credsOf(b), action: b.action })), status: svc.status() })),

  "secrets/device": secretsOp(async (svc, _ctx, b) => {
    if (b.action === "probe") return { availability: await svc.deviceAvailability(), status: svc.status() };
    if (b.action === "enable") await svc.deviceEnable(credsOf(b));
    else if (b.action === "disable") return { ...(await svc.deviceDisable()), status: svc.status() };
    else throw new FmError("BAD_REQUEST", "Choose what to do with “Unlock with this computer”.");
    return { status: svc.status() };
  }),

  "secrets/export-backup": secretsOp((svc, ctx, b) => {
    const path = newFilePath(ctx, b.path);
    svc.exportBackup(path);
    return { path, status: svc.status() };
  }),

  "secrets/import-backup": secretsOp(async (svc, ctx, b) => {
    const path = absolutePath(ctx, b.path);
    if (!existsSync(path)) throw new FmError("BAD_PATH", "That file doesn't exist.");
    await svc.importBackup(readVaultFile(path), credsOf(b));
    return { status: svc.status() };
  }),

  "secrets/resolve": secretsOp((svc, _ctx, b) => {
    const s = svc.requireSession();
    if (b.action === "keep") {
      s.acceptDisk();
      s.flush({ backup: true });
      return { status: svc.status() };
    }
    if (b.action === "discard") return { ...svc.lock("conflict-discard"), status: svc.status() };
    throw new FmError("BAD_REQUEST", "Choose whether to keep your open copy or reload from disk.");
  }),

  "secrets/audit": secretsOp((svc) => ({ events: svc.requireSession().database().audit.slice(-200).reverse() })),

  "secrets/destroy": secretsOp(async (svc, _ctx, b) => {
    if (b.confirm !== "DELETE") throw new FmError("NEEDS_CONFIRM", "Type DELETE to confirm that everything in the vault should be erased for good.");
    await svc.destroyVault();
    return { status: svc.status() };
  }, { touch: false }),

  ...itemOperations,
};
