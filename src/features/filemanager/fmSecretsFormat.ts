/**
 * RADSEC v1: the byte-exact format of the Secrets vault. Specified in docs/reference/secrets-format.md.
 *
 *   header = fixed(64) | database nonce(12) | password wrap(60) | [recovery wrap(92)] | [device wrap(60)] | header MAC(32)
 *   file   = header | AES-256-GCM(padded database) | tag(16)
 *
 * A random 256-bit data key encrypts the whole database as ONE authenticated blob; the data key itself is stored
 * wrapped (AES-256-GCM) under a key made from the master password (Argon2id + HKDF-SHA-256, plus an optional key
 * file) and, optionally, under a second key made from the recovery key and a third made from a device key kept in the
 * operating system's credential store ("Unlock with this computer"). The entire header is authenticated: it is the
 * AAD of the database blob, and an HMAC keyed from the data key covers it too. Independent of the File Manager's context.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SecretsError, WRONG_OR_DAMAGED, deviceKek, hkdf, kdfRefusal, recoveryKek } from "./fmSecretsCrypto";
import type { SecretsKdfParams } from "./fmSecretsHooks";

export const MAGIC = Buffer.from("RADSEC01", "latin1");
export const KDF_ARGON2ID = 1;
export const FLAG_KEYFILE = 1;
export const FLAG_RECOVERY = 2;
export const FLAG_DEVICE = 4;
export const VAULT_ID_SIZE = 16;
export const FIXED_SIZE = 64;
export const NONCE_SIZE = 12;
export const TAG_SIZE = 16;
export const PW_WRAP_SIZE = NONCE_SIZE + 32 + TAG_SIZE; // 60
export const REC_WRAP_SIZE = 32 + PW_WRAP_SIZE; // 92: its own 32-byte salt first
export const DEV_WRAP_SIZE = PW_WRAP_SIZE; // 60
export const MAC_SIZE = 32;
export const PAD_BLOCK = 4096;
export const MAX_PLAINTEXT_BYTES = 64 * 1024 * 1024;
export const MAX_FILE_BYTES = MAX_PLAINTEXT_BYTES + 1024 * 1024;
export const EXTENSION = ".radsec";
export const NOT_A_VAULT = "This isn't a RADSEC vault file.";

export type Random = (n: number) => Buffer;

/** Everything needed to write the vault except the database itself. `dataKey` must be zeroed when the session ends. */
export interface VaultKeys {
  params: SecretsKdfParams;
  salt: Buffer;
  /** Random id of this vault (public, stable for its life): names its entry in the credential store. */
  vaultId: Buffer;
  flags: number;
  pwWrap: Buffer;
  recWrap: Buffer | null;
  devWrap: Buffer | null;
  dataKey: Buffer;
}

export interface ParsedHeader {
  params: SecretsKdfParams;
  salt: Buffer;
  vaultId: Buffer;
  flags: number;
  nonce: Buffer;
  pwWrap: Buffer;
  recWrap: Buffer | null;
  devWrap: Buffer | null;
  mac: Buffer;
  /** The whole header, MAC included: the AAD of the database blob. */
  raw: Buffer;
  length: number;
  fileBytes: number;
}

const bad = (): never => {
  throw new SecretsError("BAD_VAULT", WRONG_OR_DAMAGED);
};

export const headerLength = (flags: number): number => FIXED_SIZE + NONCE_SIZE + PW_WRAP_SIZE + ((flags & FLAG_RECOVERY) !== 0 ? REC_WRAP_SIZE : 0) + ((flags & FLAG_DEVICE) !== 0 ? DEV_WRAP_SIZE : 0) + MAC_SIZE;

export function encodeFixed(keys: Pick<VaultKeys, "params" | "salt" | "flags" | "vaultId">): Buffer {
  const b = Buffer.alloc(FIXED_SIZE);
  MAGIC.copy(b, 0);
  b[8] = KDF_ARGON2ID;
  b.writeUInt32BE(keys.params.memoryKiB, 9);
  b[13] = keys.params.passes;
  b[14] = keys.params.parallelism;
  b[15] = keys.flags;
  keys.salt.copy(b, 16);
  keys.vaultId.copy(b, 48);
  return b;
}

/** Reads and checks a header without any secret. Every refusal is decided here, before any key derivation. */
export function parseHeader(file: Buffer): ParsedHeader {
  if (file.length < MAGIC.length || !file.subarray(0, 6).equals(MAGIC.subarray(0, 6))) throw new SecretsError("NOT_VAULT", NOT_A_VAULT);
  if (!file.subarray(0, 8).equals(MAGIC)) throw new SecretsError("UNSUPPORTED", "This vault was made by a newer version of this program. Update the program to open it.");
  if (file.length < headerLength(0) + PAD_BLOCK + TAG_SIZE || file.length > MAX_FILE_BYTES) return bad();
  if (file[8] !== KDF_ARGON2ID) return bad();
  const flags = file[15]!;
  if ((flags & ~(FLAG_KEYFILE | FLAG_RECOVERY | FLAG_DEVICE)) !== 0) return bad();
  const params: SecretsKdfParams = { memoryKiB: file.readUInt32BE(9), passes: file[13]!, parallelism: file[14]! };
  if (kdfRefusal(params)) return bad();
  const length = headerLength(flags);
  const cipherLength = file.length - length;
  if (cipherLength < PAD_BLOCK + TAG_SIZE || (cipherLength - TAG_SIZE) % PAD_BLOCK !== 0) return bad();
  const rec = (flags & FLAG_RECOVERY) !== 0;
  const dev = (flags & FLAG_DEVICE) !== 0;
  const recAt = FIXED_SIZE + NONCE_SIZE + PW_WRAP_SIZE;
  const devAt = recAt + (rec ? REC_WRAP_SIZE : 0);
  return {
    params,
    salt: Buffer.from(file.subarray(16, 48)),
    vaultId: Buffer.from(file.subarray(48, 64)),
    flags,
    nonce: Buffer.from(file.subarray(FIXED_SIZE, FIXED_SIZE + NONCE_SIZE)),
    pwWrap: Buffer.from(file.subarray(FIXED_SIZE + NONCE_SIZE, recAt)),
    recWrap: rec ? Buffer.from(file.subarray(recAt, recAt + REC_WRAP_SIZE)) : null,
    devWrap: dev ? Buffer.from(file.subarray(devAt, devAt + DEV_WRAP_SIZE)) : null,
    mac: Buffer.from(file.subarray(length - MAC_SIZE, length)),
    raw: Buffer.from(file.subarray(0, length)),
    length,
    fileBytes: file.length,
  };
}

const pwAad = (fixed: Buffer): Buffer => {
  const aad = Buffer.concat([fixed, Buffer.from("pw", "latin1")]);
  aad[15] = aad[15]! & FLAG_KEYFILE; // adding or removing the recovery or device key must not require re-wrapping the password key
  return aad;
};
const recAad = (recSalt: Buffer): Buffer => Buffer.concat([MAGIC, Buffer.from("rec", "latin1"), recSalt]);
const devAad = (vaultId: Buffer): Buffer => Buffer.concat([MAGIC, Buffer.from("dev", "latin1"), vaultId]);

function seal(key: Buffer, nonce: Buffer, aad: Buffer, data: Buffer): Buffer {
  const c = createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(aad);
  return Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
}

function open(key: Buffer, nonce: Buffer, aad: Buffer, sealed: Buffer): Buffer | null {
  try {
    const d = createDecipheriv("aes-256-gcm", key, nonce);
    d.setAAD(aad);
    d.setAuthTag(sealed.subarray(sealed.length - TAG_SIZE));
    return Buffer.concat([d.update(sealed.subarray(0, sealed.length - TAG_SIZE)), d.final()]);
  } catch {
    return null;
  }
}

/** nonce | AES-256-GCM(data key) | tag */
function wrapKey(kek: Buffer, dataKey: Buffer, aad: Buffer, random: Random): Buffer {
  const nonce = random(NONCE_SIZE);
  return Buffer.concat([nonce, seal(kek, nonce, aad, dataKey)]);
}

const unwrapKey = (kek: Buffer, wrap: Buffer, aad: Buffer): Buffer | null => open(kek, wrap.subarray(0, NONCE_SIZE), aad, wrap.subarray(NONCE_SIZE));

/** New keys for a new vault: a random data key wrapped under `kek` (the password key). */
export function newVaultKeys(params: SecretsKdfParams, salt: Buffer, kek: Buffer, usesKeyFile: boolean, random: Random = randomBytes): VaultKeys {
  const dataKey = random(32);
  const keys: VaultKeys = { params: { ...params }, salt, vaultId: random(VAULT_ID_SIZE), flags: usesKeyFile ? FLAG_KEYFILE : 0, pwWrap: Buffer.alloc(PW_WRAP_SIZE), recWrap: null, devWrap: null, dataKey };
  setPasswordWrap(keys, kek, random);
  return keys;
}

/** Wraps the data key under a (new) password key; used for a new vault, a new master password and a re-key. */
export function setPasswordWrap(keys: VaultKeys, kek: Buffer, random: Random = randomBytes): void {
  keys.pwWrap = wrapKey(kek, keys.dataKey, pwAad(encodeFixed(keys)), random);
}

export function setRecoveryWrap(keys: VaultKeys, recoveryKey: Buffer, random: Random = randomBytes): void {
  const recSalt = random(32);
  const kek = recoveryKek(recoveryKey, recSalt);
  try {
    keys.recWrap = Buffer.concat([recSalt, wrapKey(kek, keys.dataKey, recAad(recSalt), random)]);
    keys.flags |= FLAG_RECOVERY;
  } finally {
    kek.fill(0);
  }
}

export function removeRecoveryWrap(keys: VaultKeys): void {
  keys.recWrap = null;
  keys.flags &= ~FLAG_RECOVERY;
}

/** Wraps the data key under a key made from the device key (kept in the operating system's credential store). */
export function setDeviceWrap(keys: VaultKeys, deviceKey: Buffer, random: Random = randomBytes): void {
  const kek = deviceKek(deviceKey, keys.vaultId);
  try {
    keys.devWrap = wrapKey(kek, keys.dataKey, devAad(keys.vaultId), random);
    keys.flags |= FLAG_DEVICE;
  } finally {
    kek.fill(0);
  }
}

export function removeDeviceWrap(keys: VaultKeys): void {
  keys.devWrap = null;
  keys.flags &= ~FLAG_DEVICE;
}

/** True when `deviceKey` unwraps to the data key held in `keys`. */
export function deviceKeyMatches(keys: VaultKeys, deviceKey: Buffer): boolean {
  if (!keys.devWrap) return false;
  const kek = deviceKek(deviceKey, keys.vaultId);
  const got = unwrapKey(kek, keys.devWrap, devAad(keys.vaultId));
  kek.fill(0);
  const ok = got !== null && got.length === 32 && timingSafeEqual(got, keys.dataKey);
  got?.fill(0);
  return ok;
}

/** True when `recoveryKey` unwraps to the data key held in `keys`. */
export function recoveryKeyMatches(keys: VaultKeys, recoveryKey: Buffer): boolean {
  if (!keys.recWrap) return false;
  const recSalt = keys.recWrap.subarray(0, 32);
  const kek = recoveryKek(recoveryKey, recSalt);
  const got = unwrapKey(kek, keys.recWrap.subarray(32), recAad(recSalt));
  kek.fill(0);
  const ok = got !== null && got.length === 32 && timingSafeEqual(got, keys.dataKey);
  got?.fill(0);
  return ok;
}

/** True when `kek` is the key that wraps this vault's data key under the master password. */
export function passwordKekMatches(keys: VaultKeys, kek: Buffer): boolean {
  const got = unwrapKey(kek, keys.pwWrap, pwAad(encodeFixed(keys)));
  const ok = got !== null && got.length === 32 && timingSafeEqual(got, keys.dataKey);
  got?.fill(0);
  return ok;
}

function subkeys(keys: Pick<VaultKeys, "dataKey" | "salt">): { dbKey: Buffer; macKey: Buffer } {
  return { dbKey: hkdf(keys.dataKey, keys.salt, "radsec v1 database key", 32), macKey: hkdf(keys.dataKey, keys.salt, "radsec v1 header mac key", 32) };
}

/** Pads to a multiple of 4096 bytes (so the file size says little about how much is inside): length(4) | data | zeros. */
function frame(plain: Buffer): Buffer {
  if (plain.length > MAX_PLAINTEXT_BYTES) throw new SecretsError("TOO_LARGE", "The vault has grown too big to save (the limit is 64 MB of data).");
  const out = Buffer.alloc(Math.ceil((4 + plain.length) / PAD_BLOCK) * PAD_BLOCK);
  out.writeUInt32BE(plain.length, 0);
  plain.copy(out, 4);
  return out;
}

/** Encrypts the database into a complete vault file, with a fresh random nonce. `nonce` is for known-answer tests only. */
export function encodeVault(keys: VaultKeys, plain: Buffer, random: Random = randomBytes, nonce?: Buffer): Buffer {
  const { dbKey, macKey } = subkeys(keys);
  const framed = frame(plain);
  try {
    const n = nonce ?? random(NONCE_SIZE);
    const body = Buffer.concat([encodeFixed(keys), n, keys.pwWrap, ...(keys.recWrap ? [keys.recWrap] : []), ...(keys.devWrap ? [keys.devWrap] : [])]);
    const header = Buffer.concat([body, createHmac("sha256", macKey).update(body).digest()]);
    return Buffer.concat([header, seal(dbKey, n, header, framed)]);
  } finally {
    dbKey.fill(0);
    macKey.fill(0);
    framed.fill(0);
  }
}

/** The database nonce of a vault file (for the "never reused" check). */
export const nonceOf = (file: Buffer): Buffer => Buffer.from(file.subarray(FIXED_SIZE, FIXED_SIZE + NONCE_SIZE));

export type Access = { kind: "password"; kek: Buffer } | { kind: "recovery"; key: Buffer } | { kind: "device"; key: Buffer };

/**
 * Opens a vault whose header `parseHeader` accepted. Every failure (wrong password, wrong key file, wrong recovery key, a
 * changed or truncated file) throws the same error with the same message.
 */
export function decryptVault(file: Buffer, header: ParsedHeader, access: Access): { keys: VaultKeys; plain: Buffer } {
  let dataKey: Buffer | null = null;
  if (access.kind === "password") {
    dataKey = unwrapKey(access.kek, header.pwWrap, pwAad(encodeFixed(header)));
  } else if (access.kind === "recovery" && header.recWrap) {
    const recSalt = header.recWrap.subarray(0, 32);
    const kek = recoveryKek(access.key, recSalt);
    dataKey = unwrapKey(kek, header.recWrap.subarray(32), recAad(recSalt));
    kek.fill(0);
  } else if (access.kind === "device" && header.devWrap) {
    const kek = deviceKek(access.key, header.vaultId);
    dataKey = unwrapKey(kek, header.devWrap, devAad(header.vaultId));
    kek.fill(0);
  }
  if (!dataKey || dataKey.length !== 32) return bad();
  try {
    const plain = openWithDataKey(file, header, dataKey);
    return { keys: { params: header.params, salt: header.salt, vaultId: header.vaultId, flags: header.flags, pwWrap: header.pwWrap, recWrap: header.recWrap, devWrap: header.devWrap, dataKey }, plain };
  } catch (err) {
    dataKey.fill(0);
    throw err;
  }
}

/** Checks the header MAC and decrypts the database with a data key that is already known (also used to verify a file just written). */
export function openWithDataKey(file: Buffer, header: ParsedHeader, dataKey: Buffer): Buffer {
  const { dbKey, macKey } = subkeys({ dataKey, salt: header.salt });
  try {
    const expected = createHmac("sha256", macKey).update(header.raw.subarray(0, header.length - MAC_SIZE)).digest();
    if (!timingSafeEqual(expected, header.mac)) return bad();
    const framed = open(dbKey, header.nonce, header.raw, file.subarray(header.length));
    if (!framed) return bad();
    const length = framed.readUInt32BE(0);
    if (length > framed.length - 4) {
      framed.fill(0);
      return bad();
    }
    const plain = Buffer.from(framed.subarray(4, 4 + length));
    framed.fill(0);
    return plain;
  } finally {
    dbKey.fill(0);
    macKey.fill(0);
  }
}

/** Zeroes every secret buffer in `keys`. */
export function wipeKeys(keys: VaultKeys): void {
  keys.dataKey.fill(0);
}
