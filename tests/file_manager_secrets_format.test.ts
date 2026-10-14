import { describe, expect, test } from "bun:test";
import { argon2Sync, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { WRONG_OR_DAMAGED, derivePasswordKek, formatRecoveryKey, newRecoveryKey, parseRecoveryKey, passwordBytes } from "../src/features/filemanager/fmSecretsCrypto";
import {
  FLAG_DEVICE, FLAG_KEYFILE, FLAG_RECOVERY, decryptVault, deviceKeyMatches, encodeVault, newVaultKeys, nonceOf, parseHeader, recoveryKeyMatches, removeRecoveryWrap, setDeviceWrap, setPasswordWrap, setRecoveryWrap,
  type Random,
} from "../src/features/filemanager/fmSecretsFormat";

const P = { memoryKiB: 64, passes: 1, parallelism: 1 };
const PASSWORD = "correct horse battery staple";
const PLAIN = Buffer.from(JSON.stringify({ v: 1, hello: "world", marker: "FMT-MARKER-1" }));

/** A deterministic "random" source for the known-answer test: the n-th call returns bytes derived from n. */
function seeded(): Random {
  let n = 0;
  return (len) => {
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i += 32) createHash("sha256").update(`radsec-test-${n}-${i}`).digest().copy(out, i, 0, Math.min(32, len - i));
    n++;
    return out;
  };
}

async function make(opts: { password?: string; keyFile?: Buffer | null; recovery?: boolean; device?: Buffer; random?: Random; salt?: Buffer } = {}) {
  const random = opts.random ?? randomBytes;
  const salt = opts.salt ?? random(32);
  const kek = await derivePasswordKek(opts.password ?? PASSWORD, opts.keyFile ?? null, salt, P);
  const keys = newVaultKeys(P, salt, kek, Boolean(opts.keyFile), random);
  kek.fill(0);
  let recoveryKey: Buffer | undefined;
  if (opts.recovery) {
    recoveryKey = Buffer.from(random(20));
    setRecoveryWrap(keys, recoveryKey, random);
  }
  if (opts.device) setDeviceWrap(keys, opts.device, random);
  return { keys, recoveryKey, file: encodeVault(keys, PLAIN, random) };
}

async function openWith(file: Buffer, password = PASSWORD, keyFile: Buffer | null = null) {
  const header = parseHeader(file);
  const kek = await derivePasswordKek(password, keyFile, header.salt, header.params);
  return decryptVault(file, header, { kind: "password", kek });
}

async function failure(fn: () => unknown): Promise<{ code: string; message: string }> {
  try {
    await fn();
  } catch (e: any) {
    return { code: e.code, message: e.message };
  }
  throw new Error("expected a failure");
}

describe("RADSEC v1 format", () => {
  test("round trip: what is written is what is read", async () => {
    const { file } = await make();
    const { plain, keys } = await openWith(file);
    expect(plain.equals(PLAIN)).toBe(true);
    expect(keys.dataKey.length).toBe(32);
    expect(file.subarray(0, 8).toString("latin1")).toBe("RADSEC01");
    expect((file.length - 168 - 16) % 4096).toBe(0);
  });

  test("known answer: with fixed salt, nonce and random source the file bytes never change", async () => {
    const random = seeded();
    const { file } = await make({ random, salt: Buffer.alloc(32, 7), password: PASSWORD });
    expect(file.subarray(0, 64).toString("hex")).toBe(
      "524144534543303101" + "00000040" + "01" + "01" + "00" + "07".repeat(32) + file.subarray(48, 64).toString("hex"),
    );
    expect(file.length).toBe(4280);
    expect(createHash("sha256").update(file).digest("hex")).toBe(KAT_SHA256);
    expect(file.subarray(0, 168).toString("hex")).toBe(KAT_HEADER);
  });

  test("an independent reference decryptor (node:crypto only) opens the known-answer file", () => {
    const file = Buffer.from(knownFile());
    // header: magic(8) kdf(1) mem(4) t(1) p(1) flags(1) salt(32) vaultId(16) nonce(12) pwWrap(60) mac(32)
    expect(file.subarray(0, 8).toString()).toBe("RADSEC01");
    const mem = file.readUInt32BE(9);
    const salt = file.subarray(16, 48);
    const nonce = file.subarray(64, 76);
    const pwWrap = file.subarray(76, 136);
    const headerEnd = 168;
    const master = Buffer.from(argon2Sync("argon2id", { message: Buffer.from(PASSWORD.normalize("NFKC")), nonce: salt, parallelism: file[14]!, tagLength: 32, memory: mem, passes: file[13]! }));
    const kek = Buffer.from(hkdfSync("sha256", master, salt, "radsec v1 password wrap key", 32));
    const aad = Buffer.concat([file.subarray(0, 64), Buffer.from("pw")]);
    aad[15] = aad[15]! & 1;
    const unwrap = createDecipheriv("aes-256-gcm", kek, pwWrap.subarray(0, 12));
    unwrap.setAAD(aad);
    unwrap.setAuthTag(pwWrap.subarray(44, 60));
    const dataKey = Buffer.concat([unwrap.update(pwWrap.subarray(12, 44)), unwrap.final()]);
    const macKey = Buffer.from(hkdfSync("sha256", dataKey, salt, "radsec v1 header mac key", 32));
    expect(createHmac("sha256", macKey).update(file.subarray(0, headerEnd - 32)).digest().equals(file.subarray(headerEnd - 32, headerEnd))).toBe(true);
    const dbKey = Buffer.from(hkdfSync("sha256", dataKey, salt, "radsec v1 database key", 32));
    const d = createDecipheriv("aes-256-gcm", dbKey, nonce);
    d.setAAD(file.subarray(0, headerEnd));
    d.setAuthTag(file.subarray(file.length - 16));
    const framed = Buffer.concat([d.update(file.subarray(headerEnd, file.length - 16)), d.final()]);
    const len = framed.readUInt32BE(0);
    expect(framed.subarray(4, 4 + len).equals(PLAIN)).toBe(true);
    expect(framed.subarray(4 + len).every((b) => b === 0)).toBe(true);
  });

  test("every header field is validated before any key is derived", async () => {
    const { file } = await make({ recovery: true });
    const flip = (at: number, value: number) => {
      const f = Buffer.from(file);
      f[at] = value;
      return f;
    };
    expect(() => parseHeader(Buffer.from("not a vault at all, just text"))).toThrow(/isn't a RADSEC vault file/);
    expect(() => parseHeader(Buffer.alloc(0))).toThrow(/isn't a RADSEC vault file/);
    expect(() => parseHeader(flip(7, 0x32))).toThrow(/newer version/); // RADSEC02
    expect(() => parseHeader(flip(8, 2))).toThrow(WRONG_OR_DAMAGED); // unknown KDF
    expect(() => parseHeader(flip(15, 0x80))).toThrow(WRONG_OR_DAMAGED); // reserved flag
    expect(() => parseHeader(flip(14, 0))).toThrow(WRONG_OR_DAMAGED); // zero lanes
    expect(() => parseHeader(flip(14, 200))).toThrow(WRONG_OR_DAMAGED); // too many lanes
    expect(() => parseHeader(flip(13, 0))).toThrow(WRONG_OR_DAMAGED); // zero passes
    const bomb = Buffer.from(file);
    bomb.writeUInt32BE(0xffffffff, 9);
    expect(() => parseHeader(bomb)).toThrow(WRONG_OR_DAMAGED);
    const huge = Buffer.from(file);
    huge.writeUInt32BE(8 * 1024 * 1024, 9); // 8 GiB
    const started = performance.now();
    expect(() => parseHeader(huge)).toThrow(WRONG_OR_DAMAGED);
    expect(performance.now() - started).toBeLessThan(200);
    // the flag says there is a recovery wrap but the file is too short for one to fit with a body
    expect(() => parseHeader(flip(15, 0).subarray(0, 4000))).toThrow(WRONG_OR_DAMAGED);
    const kdfStarted = performance.now();
    await expect(derivePasswordKek("x", null, Buffer.alloc(32), { memoryKiB: 8 * 1024 * 1024, passes: 3, parallelism: 4 })).rejects.toThrow(WRONG_OR_DAMAGED);
    expect(performance.now() - kdfStarted).toBeLessThan(200);
  });

  test("truncated, bit-flipped, reordered and extended files are rejected, all with the same message as a wrong password", async () => {
    const { file } = await make({ recovery: true, device: randomBytes(32) });
    const wrong = await failure(() => openWith(file, "a completely different password"));
    expect(wrong.message).toBe(WRONG_OR_DAMAGED);
    const bad: Array<[string, Buffer]> = [
      ["truncated by one byte", file.subarray(0, file.length - 1)],
      ["truncated by a block", file.subarray(0, file.length - 4096)],
      ["extended by one byte", Buffer.concat([file, Buffer.from([0])])],
      ["extended by a block", Buffer.concat([file, randomBytes(4096)])],
    ];
    const headerLen = parseHeader(file).length;
    for (const at of [8, 9, 12, 13, 14, 15, 16, 47, 48, 63, 64, 75, 76, 100, 135, 140, 200, 228, headerLen - 33, headerLen - 1, headerLen, headerLen + 100, file.length - 17, file.length - 1]) {
      const f = Buffer.from(file);
      f[at] = f[at]! ^ 0x01;
      bad.push([`bit flipped at ${at}`, f]);
    }
    const swapped = Buffer.from(file);
    file.subarray(headerLen, headerLen + 16).copy(swapped, headerLen + 16);
    file.subarray(headerLen + 16, headerLen + 32).copy(swapped, headerLen);
    bad.push(["two ciphertext pieces swapped", swapped]);
    const wraps = Buffer.from(file); // password wrap and recovery wrap exchanged
    file.subarray(76, 136).copy(wraps, 136);
    file.subarray(136, 196).copy(wraps, 76);
    bad.push(["wraps exchanged", wraps]);
    for (const [what, f] of bad) {
      const err = await failure(() => openWith(f));
      expect(err.message, what).toBe(wrong.message);
    }
  });

  test("a wrong password and a damaged file give the very same code and message", async () => {
    const { file } = await make();
    const damaged = Buffer.from(file);
    damaged[damaged.length - 5] = damaged[damaged.length - 5]! ^ 0xff;
    const a = await failure(() => openWith(file, "wrong wrong wrong wrong"));
    const b = await failure(() => openWith(damaged));
    expect(a.message).toBe(b.message);
    expect(a.code).toBe(b.code);
  });

  test("a new nonce for every save, 200 times, with the same keys", async () => {
    const { keys } = await make();
    const nonces = new Set<string>();
    for (let i = 0; i < 200; i++) nonces.add(nonceOf(encodeVault(keys, PLAIN)).toString("hex"));
    expect(nonces.size).toBe(200);
  });

  test("key wrapping: changing the password re-wraps the same data key without touching the database", async () => {
    const { keys, file } = await make();
    const before = Buffer.from(keys.dataKey);
    const salt = randomBytes(32);
    const kek2 = await derivePasswordKek("a brand new passphrase", null, salt, P);
    keys.salt = salt;
    setPasswordWrap(keys, kek2);
    const file2 = encodeVault(keys, PLAIN);
    const opened = await openWith(file2, "a brand new passphrase");
    expect(opened.keys.dataKey.equals(before)).toBe(true);
    expect((await failure(() => openWith(file2, PASSWORD))).message).toBe(WRONG_OR_DAMAGED);
    expect((await openWith(file, PASSWORD)).plain.equals(PLAIN)).toBe(true); // the old file still opens with the old password
  });

  test("the recovery key opens the vault; a wrong one, a removed one and a tampered wrap do not", async () => {
    const { file, recoveryKey, keys } = await make({ recovery: true });
    const header = parseHeader(file);
    expect(header.flags & FLAG_RECOVERY).toBe(FLAG_RECOVERY);
    expect(decryptVault(file, header, { kind: "recovery", key: recoveryKey! }).plain.equals(PLAIN)).toBe(true);
    expect(() => decryptVault(file, header, { kind: "recovery", key: randomBytes(20) })).toThrow(WRONG_OR_DAMAGED);
    const tampered = Buffer.from(file);
    tampered[76 + 60 + 40] = tampered[76 + 60 + 40]! ^ 1;
    expect(() => decryptVault(tampered, parseHeader(tampered), { kind: "recovery", key: recoveryKey! })).toThrow(WRONG_OR_DAMAGED);
    expect(recoveryKeyMatches(keys, recoveryKey!)).toBe(true);
    expect(recoveryKeyMatches(keys, randomBytes(20))).toBe(false);
    removeRecoveryWrap(keys);
    const without = encodeVault(keys, PLAIN);
    expect(parseHeader(without).flags & FLAG_RECOVERY).toBe(0);
    expect(() => decryptVault(without, parseHeader(without), { kind: "recovery", key: recoveryKey! })).toThrow(WRONG_OR_DAMAGED);
    // the recovery wrap survives a re-key (a new salt and new settings) because it does not depend on them
    const k = await make({ recovery: true });
    const salt = randomBytes(32);
    k.keys.salt = salt;
    k.keys.params = { memoryKiB: 128, passes: 2, parallelism: 1 };
    setPasswordWrap(k.keys, await derivePasswordKek("another long passphrase here", null, salt, k.keys.params));
    const rekeyed = encodeVault(k.keys, PLAIN);
    expect(decryptVault(rekeyed, parseHeader(rekeyed), { kind: "recovery", key: k.recoveryKey! }).plain.equals(PLAIN)).toBe(true);
    expect((await openWith(rekeyed, "another long passphrase here")).plain.equals(PLAIN)).toBe(true);
    expect(parseHeader(rekeyed).params.memoryKiB).toBe(128);
  });

  test("a key file is mixed into the key: without it, or with another, the vault stays shut", async () => {
    const keyFile = randomBytes(64);
    const { file } = await make({ keyFile });
    expect(parseHeader(file).flags & FLAG_KEYFILE).toBe(FLAG_KEYFILE);
    expect((await openWith(file, PASSWORD, keyFile)).plain.equals(PLAIN)).toBe(true);
    expect((await failure(() => openWith(file, PASSWORD, null))).message).toBe(WRONG_OR_DAMAGED);
    expect((await failure(() => openWith(file, PASSWORD, randomBytes(64)))).message).toBe(WRONG_OR_DAMAGED);
    const noKeyFile = (await make()).file;
    expect((await failure(() => openWith(noKeyFile, PASSWORD, keyFile))).message).toBe(WRONG_OR_DAMAGED);
  });

  test("the device wrap opens the vault only with the right device key, and never touches the password path", async () => {
    const device = randomBytes(32);
    const { file, keys } = await make({ device, recovery: true });
    const header = parseHeader(file);
    expect(header.flags & FLAG_DEVICE).toBe(FLAG_DEVICE);
    expect(header.devWrap?.length).toBe(60);
    expect(decryptVault(file, header, { kind: "device", key: device }).plain.equals(PLAIN)).toBe(true);
    expect(() => decryptVault(file, header, { kind: "device", key: randomBytes(32) })).toThrow(WRONG_OR_DAMAGED);
    expect(deviceKeyMatches(keys, device)).toBe(true);
    expect(deviceKeyMatches(keys, randomBytes(32))).toBe(false);
    expect((await openWith(file)).plain.equals(PLAIN)).toBe(true);
    const plainFile = (await make()).file;
    expect(() => decryptVault(plainFile, parseHeader(plainFile), { kind: "device", key: device })).toThrow(WRONG_OR_DAMAGED);
    const tampered = Buffer.from(file);
    tampered[header.length - 32 - 20] = tampered[header.length - 32 - 20]! ^ 1; // inside the device wrap
    expect(() => decryptVault(tampered, parseHeader(tampered), { kind: "device", key: device })).toThrow(WRONG_OR_DAMAGED);
  });

  test("the vault id is random, public, stable across saves, and is where the device entry is named", async () => {
    const a = await make();
    const b = await make();
    expect(parseHeader(a.file).vaultId.length).toBe(16);
    expect(parseHeader(a.file).vaultId.equals(parseHeader(b.file).vaultId)).toBe(false);
    expect(parseHeader(encodeVault(a.keys, PLAIN)).vaultId.equals(parseHeader(a.file).vaultId)).toBe(true);
  });

  test("the recovery key text form: 8 groups of 4, case and dashes don't matter, look-alikes are forgiven", () => {
    const key = newRecoveryKey();
    const text = formatRecoveryKey(key);
    expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(parseRecoveryKey(text)?.equals(key)).toBe(true);
    expect(parseRecoveryKey(text.toLowerCase().replace(/-/g, " "))?.equals(key)).toBe(true);
    expect(parseRecoveryKey(text.slice(0, -1))).toBeNull();
    expect(parseRecoveryKey("UUUU-UUUU-UUUU-UUUU-UUUU-UUUU-UUUU-UUUU")).toBeNull();
    expect(parseRecoveryKey(42)).toBeNull();
    expect(passwordBytes("é").equals(passwordBytes("e\u0301"))).toBe(true); // NFKC
  });
});

// The reference file is rebuilt from fixed inputs; see the known-answer test. These two constants freeze the format.
const KAT_SHA256 = "46bc99b680e48277cabf5d3d3f211d61907fb824bdfd08a9c067a21b07276077";
const KAT_HEADER = "52414453454330310100000040010100070707070707070707070707070707070707070707070707070707070707070786e48a78251a1b065edc90cc8b5c3ef67059175702c1ac813b23cf5eeff5ea78adbd4010c3e938665314efffa88f47a433e6037e13c4f60ec99bac9580a81557d357b95d59c9a19b415503b0ea93b38af1378a5745272e897c7b4a30f032cb3b6944e9aa6339b9010aa03d5c1ab69f6add980641b78ef364";
function knownFile(): Buffer {
  const random = seeded();
  const salt = Buffer.alloc(32, 7);
  const kek = Buffer.from(hkdfSync("sha256", Buffer.from(argon2Sync("argon2id", { message: Buffer.from(PASSWORD), nonce: salt, parallelism: 1, tagLength: 32, memory: 64, passes: 1 })), salt, "radsec v1 password wrap key", 32));
  const keys = newVaultKeys(P, salt, kek, false, random);
  return encodeVault(keys, PLAIN, random);
}
