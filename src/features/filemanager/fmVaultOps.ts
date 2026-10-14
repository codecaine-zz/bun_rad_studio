/**
 * API operations of the "Lock" (encryption) tool, all named `vault/...`:
 *
 *   vault/encrypt    {paths, password, level, compress, hideName, outputDir?, afterwards} -> {task}   (background; one .radenc per item)
 *   vault/decrypt    {paths, password, outputDir?, afterwards}                            -> {task}   (background)
 *   vault/inspect    {path}                                   -> {valid, version, level, compressed, size, chunkSize}   (no password needed)
 *   vault/status     {id?, since?}                            -> {task} progress of one task, or {tasks} all
 *   vault/cancel     {id}                                     -> {cancelled}
 *   vault/passphrase {words?}                                 -> {passphrase, words, bits}
 *   vault/limits     {}                                       -> what the page needs to know (levels, minimum length, limits)
 *
 * The password travels only in the request body of encrypt and decrypt. It is checked here (encrypt), handed to the
 * engine and never stored, logged or returned. Format: docs/reference/vault-format.md.
 */
import { promises as fsp } from "node:fs";
import { absolutePath, assertCreatable, assertFolder, assertModifiable, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { FmError, isSameOrInside } from "./fmPaths";
import { inspectFile, vaultErrorInfo } from "./fmVaultEngine";
import { EXTENSION, KDF_LIMITS, LEVELS, type Level } from "./fmVaultFormat";
import { DEFAULT_PASSPHRASE_WORDS, MAX_PASSPHRASE_WORDS, MAX_PASSWORD_LENGTH, MIN_PASSPHRASE_WORDS, MIN_PASSWORD_LENGTH, checkPasswordPolicy, generatePassphrase } from "./fmVaultPolicy";
import { VAULT_LIMITS, findTask, snapshot, startDecrypt, startEncrypt, vaultState } from "./fmVaultTasks";

function pathList(ctx: FmContext, input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  if (input.length > VAULT_LIMITS.maxItems) throw new FmError("TOO_MANY", `Select at most ${VAULT_LIMITS.maxItems} items at a time.`);
  const paths: string[] = [];
  for (const item of input) {
    const p = absolutePath(ctx, item);
    if (isSameOrInside(p, ctx.trashRoot, ctx.platform)) throw new FmError("PROTECTED", "Items in the Recycle Bin can't be locked or unlocked here. Restore them first.");
    if (!paths.includes(p)) paths.push(p);
  }
  return paths;
}

function flag(value: unknown, fallback: boolean, what: string): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new FmError("BAD_REQUEST", `"${what}" must be true or false.`);
  return value;
}

function afterwards(value: unknown): "keep" | "trash" {
  if (value === undefined || value === null || value === "keep") return "keep";
  if (value === "trash") return "trash";
  throw new FmError("BAD_REQUEST", 'Afterwards must be "keep" or "trash".');
}

function level(value: unknown): Level {
  if (value === undefined || value === null || value === "standard") return "standard";
  if (value === "maximum") return "maximum";
  throw new FmError("BAD_REQUEST", 'The strength level must be "standard" or "maximum".');
}

async function outputFolder(ctx: FmContext, value: unknown): Promise<string | null> {
  if (value === undefined || value === null || value === "") return null;
  const dir = absolutePath(ctx, value);
  assertCreatable(ctx, dir);
  await assertFolder(dir, "The output folder");
  return dir;
}

function password(body: Record<string, any>): string {
  const pw = body.password;
  if (typeof pw !== "string") throw new FmError("BAD_PASSWORD", "Type the password first.");
  if (pw.length > MAX_PASSWORD_LENGTH * 4) throw new FmError("BAD_PASSWORD", "That password is too long.");
  return pw;
}

/** Results go next to each original unless a folder was chosen; either way the place must accept new files. */
function checkPlaces(ctx: FmContext, paths: string[], outputDir: string | null, trash: boolean): void {
  const p = pathApi(ctx);
  for (const path of paths) {
    if (!outputDir) assertCreatable(ctx, p.dirname(path));
    if (trash) assertModifiable(ctx, path);
  }
}

export const vaultOperations: Record<string, FmHandler> = {
  async "vault/encrypt"(ctx, b) {
    const paths = pathList(ctx, b.paths);
    const pw = password(b);
    checkPasswordPolicy(pw, paths.map((x) => pathApi(ctx).basename(x)));
    const lvl = level(b.level);
    const compress = flag(b.compress, true, "compress");
    const hideName = flag(b.hideName, false, "hideName");
    const after = afterwards(b.afterwards);
    const outputDir = await outputFolder(ctx, b.outputDir);
    checkPlaces(ctx, paths, outputDir, after === "trash");
    return { task: snapshot(startEncrypt(ctx, { paths, password: pw, level: lvl, compress, hideName, outputDir, afterwards: after })) };
  },

  async "vault/decrypt"(ctx, b) {
    const paths = pathList(ctx, b.paths);
    const pw = password(b);
    const after = afterwards(b.afterwards);
    const outputDir = await outputFolder(ctx, b.outputDir);
    checkPlaces(ctx, paths, outputDir, after === "trash");
    return { task: snapshot(startDecrypt(ctx, { paths, password: pw, outputDir, afterwards: after })) };
  },

  async "vault/inspect"(ctx, b) {
    const path = absolutePath(ctx, b.path);
    try {
      const st = await fsp.stat(path);
      if (st.isDirectory()) return { valid: false, reason: "folder", message: "That is a folder. Only .radenc files can be unlocked.", size: 0 };
      return await inspectFile(path);
    } catch (err) {
      const info = vaultErrorInfo(err, "read that file");
      throw new FmError(info.code, info.message);
    }
  },

  async "vault/status"(ctx, b) {
    const since = typeof b.since === "number" && Number.isInteger(b.since) && b.since >= 0 ? b.since : undefined;
    const tasks = [...vaultState(ctx).tasks.values()];
    const running = tasks.filter((t) => t.state === "running").length;
    if (b.id === undefined) return { tasks: tasks.map((t) => snapshot(t, t.version)), running };
    return { task: snapshot(findTask(ctx, b.id), since), running };
  },

  async "vault/cancel"(ctx, b) {
    const task = findTask(ctx, b.id);
    const cancelled = task.state === "running";
    if (cancelled) task.controller.abort();
    return { cancelled };
  },

  async "vault/passphrase"(_ctx, b) {
    return generatePassphrase(b.words);
  },

  async "vault/limits"() {
    return {
      extension: EXTENSION,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      minPassphraseWords: MIN_PASSPHRASE_WORDS,
      maxPassphraseWords: MAX_PASSPHRASE_WORDS,
      defaultPassphraseWords: DEFAULT_PASSPHRASE_WORDS,
      maxItems: VAULT_LIMITS.maxItems,
      levels: { standard: { memoryMB: LEVELS.standard.memoryKiB / 1024, passes: LEVELS.standard.passes }, maximum: { memoryMB: LEVELS.maximum.memoryKiB / 1024, passes: LEVELS.maximum.passes } },
      maxMemoryMB: KDF_LIMITS.maxMemoryKiB / 1024,
    };
  },
};
