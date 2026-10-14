/**
 * The cryptographic building blocks of the Secrets vault: Argon2id, HKDF-SHA-256, the recovery key's text form, key
 * files, and the master-password rules. Nothing here writes or logs a secret; callers must `fill(0)` the Buffers they
 * get back when they are done with them.
 */
import { argon2, createHash, hkdfSync, randomBytes } from "node:crypto";
import { totalmem } from "node:os";
import { FmError } from "./fmPaths";
import { checkPasswordPolicy } from "./fmVaultPolicy";
import { VAULT_WORDS } from "./fmVaultWords";
import { KDF_LIMITS, kdfRefusal, passwordBytes, type KdfParams } from "./fmVaultFormat";
import type { SecretsKdfParams } from "./fmSecretsHooks";

export { KDF_LIMITS, kdfRefusal, passwordBytes };
export type { KdfParams };

/** One message for every reason a vault cannot be opened, so a wrong password and a damaged file look the same. */
export const WRONG_OR_DAMAGED = "Wrong password or key, or the vault file is damaged or has been changed.";

export class SecretsError extends FmError {}

export type Strength = "standard" | "strong" | "maximum";
export const STRENGTHS: readonly Strength[] = ["standard", "strong", "maximum"];

/** The default costs. Argon2id memory is the main brake on guessing: these are 256 MiB, 512 MiB and 1 GiB. */
export const DEFAULT_LEVELS: Record<Strength, SecretsKdfParams> = {
  standard: { memoryKiB: 256 * 1024, passes: 3, parallelism: 4 },
  strong: { memoryKiB: 512 * 1024, passes: 4, parallelism: 4 },
  maximum: { memoryKiB: 1024 * 1024, passes: 5, parallelism: 4 },
};

export function strengthOf(p: SecretsKdfParams, levels: Record<Strength, SecretsKdfParams>): Strength | "custom" {
  for (const s of STRENGTHS) if (levels[s].memoryKiB === p.memoryKiB && levels[s].passes === p.passes && levels[s].parallelism === p.parallelism) return s;
  return "custom";
}

export function hkdf(ikm: Buffer, salt: Buffer, info: string, length = 32): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}

function argon2Async(message: Buffer, salt: Buffer, p: SecretsKdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2("argon2id", { message, nonce: salt, parallelism: p.parallelism, tagLength: 32, memory: p.memoryKiB, passes: p.passes }, (err, key) => (err ? reject(err) : resolve(Buffer.from(key))));
  });
}

/**
 * Password (+ optional key file) -> Argon2id -> HKDF-SHA-256 -> the key that wraps the data key.
 * The parameters are checked first, so a hostile file cannot make this program allocate unreasonable memory.
 */
export async function derivePasswordKek(password: string, keyFile: Buffer | null, salt: Buffer, params: SecretsKdfParams): Promise<Buffer> {
  if (kdfRefusal(params)) throw new SecretsError("BAD_VAULT", WRONG_OR_DAMAGED);
  const pw = passwordBytes(password);
  let master: Buffer | null = null;
  let kf: Buffer | null = null;
  let ikm: Buffer | null = null;
  try {
    if (params.memoryKiB * 1024 > totalmem() * 0.8) throw new Error("memory");
    master = await argon2Async(pw, salt, params);
    if (keyFile) kf = hkdf(keyFile, salt, "radsec v1 key file", 32);
    ikm = kf ? Buffer.concat([master, kf]) : master;
    return hkdf(ikm, salt, "radsec v1 password wrap key", 32);
  } catch (err) {
    if (err instanceof SecretsError) throw err;
    throw new SecretsError("NO_MEMORY", `This computer can't spare the ${Math.round(params.memoryKiB / 1024)} MB of memory the vault's key settings need. Close other programs and try again, or choose a lighter strength.`);
  } finally {
    pw.fill(0);
    master?.fill(0);
    kf?.fill(0);
    if (ikm && ikm !== master) ikm.fill(0);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Recovery key: 160 random bits written in Crockford base32 (no I, L, O or U), as 8 groups of 4 characters.
// ---------------------------------------------------------------------------------------------------------------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const RECOVERY_KEY_BYTES = 20;

export const newRecoveryKey = (): Buffer => randomBytes(RECOVERY_KEY_BYTES);

export function formatRecoveryKey(key: Buffer): string {
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const byte of key) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  return out.match(/.{4}/g)!.join("-");
}

/** The typed recovery key as bytes, or null when it isn't one. Case, spaces and dashes don't matter; O, I and L are read as 0, 1 and 1. */
export function parseRecoveryKey(text: unknown): Buffer | null {
  if (typeof text !== "string" || text.length > 200) return null;
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (clean.length !== RECOVERY_KEY_BYTES * 8 / 5) return null;
  const out = Buffer.alloc(RECOVERY_KEY_BYTES);
  let bits = 0;
  let acc = 0;
  let n = 0;
  for (const ch of clean) {
    const v = CROCKFORD.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out[n++] = (acc >>> (bits - 8)) & 255;
      bits -= 8;
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

/** The key that wraps the data key for "Unlock with this computer": from the 256-bit device key kept in the OS credential store. */
export const deviceKek = (deviceKey: Buffer, vaultId: Buffer): Buffer => hkdf(deviceKey, vaultId, "radsec v1 device wrap key", 32);

export const recoveryKek = (key: Buffer, recSalt: Buffer): Buffer => hkdf(key, recSalt, "radsec v1 recovery wrap key", 32);

/** A random key file's bytes (64 of them). */
export const newKeyFileBytes = (): Buffer => randomBytes(64);

export const sha256 = (data: Uint8Array): Buffer => createHash("sha256").update(data).digest();

// ---------------------------------------------------------------------------------------------------------------
// How strong a password is (a rough estimate) and the master-password rules
// ---------------------------------------------------------------------------------------------------------------

const WORD_SET = new Set(VAULT_WORDS);

/** Words in a passphrase-like text (letters only, at least 3 each, separated by spaces or punctuation). */
export function passphraseWords(text: string): string[] {
  const parts = text.normalize("NFKC").split(/[\s\-_.,;:+]+/u).filter(Boolean);
  return parts.length >= 3 && parts.every((w) => /^\p{L}{3,}$/u.test(w)) ? parts : [];
}

/** Bits of guessing effort: random characters count fully; words, patterns and repeats are counted strictly. */
export function passwordBits(password: string): number {
  const chars = [...password.normalize("NFKC")];
  const length = chars.length;
  if (length === 0) return 0;
  const words = passphraseWords(password);
  if (words.length >= 3 && new Set(words.map((w) => w.toLowerCase())).size === words.length) {
    return words.reduce((sum, w) => sum + (WORD_SET.has(w.toLowerCase()) ? 11 : 8), 0);
  }
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
  let bits = length * Math.log2(Math.max(pool, 2));
  const unique = new Set(chars).size;
  if (unique < length / 2) bits *= unique / (length / 2);
  const letters = chars.filter((c) => /[A-Za-z]/.test(c)).length;
  if (/^[A-Za-z]+([ _.-][A-Za-z]+)*$/.test(password)) bits = Math.min(bits, letters * 2 + (length - letters));
  else if (/^[A-Za-z]{3,}[0-9]{1,6}[^A-Za-z0-9]{0,3}$/.test(password)) bits = Math.min(bits, letters * 2 + (length - letters) * 3.3 + 6);
  if (/(.)\1{3,}/.test(password) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(password)) bits *= 0.7;
  return Math.round(bits);
}

export const MIN_MASTER_CHARS = 12;
export const MIN_MASTER_BITS = 60;
export const MIN_MASTER_WORDS = 5;

/** A plain sentence saying why this master password may not be used, or null when it is acceptable. */
export function masterProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length === 0) return "Type a master password first.";
  try {
    checkPasswordPolicy(password);
  } catch (err) {
    return err instanceof FmError ? err.message : "That password can't be used.";
  }
  const length = [...password.normalize("NFKC")].length;
  const words = passphraseWords(password);
  const phrase = words.length >= MIN_MASTER_WORDS && new Set(words.map((w) => w.toLowerCase())).size === words.length && length >= 20;
  if (phrase) return null;
  if (length < MIN_MASTER_CHARS) return `The master password is too short. Use at least ${MIN_MASTER_CHARS} characters, or a passphrase of ${MIN_MASTER_WORDS} or more random words.`;
  const bits = passwordBits(password);
  if (bits < MIN_MASTER_BITS) return `The master password is too easy to guess (about ${bits} bits; at least ${MIN_MASTER_BITS} are needed). Make it longer or use a passphrase of ${MIN_MASTER_WORDS} or more random words.`;
  return null;
}
