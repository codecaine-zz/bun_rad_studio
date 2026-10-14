import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { fastText, hashAlgorithms, hashText } from "../src/features/filemanager/fmCrypto";
import { cryptoOperations } from "../src/features/filemanager/fmCryptoOps";
import { FAST_GROUP_TITLE, HASH_SPECS, MAX_WHOLE_FILE_BYTES, digestFile, fastSpecs } from "../src/features/filemanager/fmHashes";
import { compareHash, hashFile, normalizeHash } from "../src/features/filemanager/fmInfoTasks";

const root = mkdtempSync(join(tmpdir(), "fm-hashes-"));
const ctx = createContext({ home: root, dataDir: join(root, "data") });
const op = (name: string, body: Record<string, any> = {}) => cryptoOperations[`crypto/${name}`]!(ctx, body) as Promise<any>;
const control = () => ({ signal: new AbortController().signal, progress() {} });
const byLabel = (rows: Array<[string, string]>) => Object.fromEntries(rows);
const abc = new TextEncoder().encode("abc");

beforeAll(() => mkdirSync(root, { recursive: true }));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("the extra secure digests (known answers for \"abc\")", () => {
  // SHA-2/SHA-3/RIPEMD/BLAKE2b-512/MD4 agree with `openssl dgst`; BLAKE2b-256 agrees with Python's hashlib.blake2b(digest_size=32).
  const vectors: Record<string, string> = {
    "SHA-224": "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7",
    "SHA-512/256": "53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23",
    "SHA3-256": "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532",
    "SHA3-512": "b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0",
    "BLAKE2b-256": "bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319",
    "BLAKE2b-512": "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923",
    "RIPEMD-160": "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc",
    MD4: "a448017aaf21d8525fc10ae87aa6729d",
  };
  const rows = byLabel(hashText("abc"));
  for (const [label, expected] of Object.entries(vectors)) test(`${label}("abc")`, () => expect(rows[label]).toBe(expected));

  test("the old five come first, then the extras, and MD4 is described as broken", () => {
    expect(hashAlgorithms().slice(0, 5)).toEqual(["SHA-256", "SHA-512", "SHA-384", "SHA-1", "MD5"]);
    expect(hashAlgorithms()).toContain("MD4");
    expect(HASH_SPECS.find((s) => s.id === "md4")!.hint).toMatch(/OBSOLETE and BROKEN/);
    expect(HASH_SPECS.filter((s) => s.group !== "fast").every((s) => s.hint.length > 20)).toBe(true);
  });
});

describe("fast checksums (Bun.hash)", () => {
  // CRC32, Adler-32 agree with Python's zlib; the xxHash and MurmurHash3 values are the published reference answers for "abc" with seed 0.
  const known: Record<string, string> = {
    CRC32: "352441c2",
    "Adler-32": "024d0127",
    xxHash32: "32d153ff",
    xxHash64: "44bc2cf5ad770999",
    XXH3: "78af5f94892f3950",
    "MurmurHash3 (32-bit)": "b3dd93fa",
  };
  // No second implementation is installed for these, so they are pinned to what Bun 1.4.2 returns (a change means the output format moved).
  const pinned: Record<string, string> = {
    wyhash: "02a4f1d7cb516c72",
    CityHash32: "2f635ec7",
    CityHash64: "56848711f2055db1",
    "MurmurHash2 (32-bit)": "13577c9b",
    "MurmurHash2 (64-bit)": "9cc9c33498a95efb",
    rapidhash: "7270d92a69eaa3b2",
  };
  const rows = byLabel(fastText("abc"));
  for (const [label, expected] of Object.entries({ ...known, ...pinned })) test(`${label}("abc") = ${expected}`, () => expect(rows[label]).toBe(expected));

  test("every result is fixed-width lower-case hex: 8 digits for 32-bit kinds, 16 for 64-bit ones", () => {
    for (const s of fastSpecs()) {
      const v = s.whole(new TextEncoder().encode("x"));
      expect(v, s.id).toMatch(new RegExp(`^[0-9a-f]{${s.hex}}$`));
    }
    expect(fastSpecs().some((s) => s.hex === 8) && fastSpecs().some((s) => s.hex === 16)).toBe(true);
    // a result with leading zeros keeps them
    expect(byLabel(fastText(""))["CRC32"]).toBe("00000000");
  });

  test("the title says clearly that they are not secure", () => {
    expect(FAST_GROUP_TITLE).toContain("NOT secure");
    for (const s of fastSpecs()) expect(s.hint).toContain("Not secure");
  });

  test("CRC32 and Adler-32 can be continued piece by piece and give the one-shot value", () => {
    const data = Buffer.alloc(70_000, "abcdefghij");
    for (const id of ["crc32", "adler32"]) {
      const spec = HASH_SPECS.find((s) => s.id === id)!;
      const d = spec.stream!();
      for (let i = 0; i < data.length; i += 12_345) d.update(data.subarray(i, i + 12_345));
      expect(d.digest(), id).toBe(spec.whole(data));
    }
    expect(Bun.hash.adler32(Buffer.alloc(100_000, 255)).toString(16)).toBe(HASH_SPECS.find((s) => s.id === "adler32")!.whole(Buffer.alloc(100_000, 255)).replace(/^0+/, ""));
  });
});

describe("files", () => {
  const big = Buffer.alloc(3 * 1024 * 1024 + 99, "0123456789abcdef");
  test("every kind agrees with hashing the whole file at once, and with node:crypto where it has the kind", async () => {
    const p = join(root, "big.bin");
    writeFileSync(p, big);
    const r = await digestFile(p, HASH_SPECS);
    expect(r.size).toBe(big.length);
    expect(r.skipped).toEqual([]);
    expect(r.rows.length).toBe(HASH_SPECS.length);
    for (const x of r.rows) expect(x.value, x.spec.id).toBe(x.spec.whole(big));
    expect(r.rows.find((x) => x.spec.id === "sha3-256")!.value).toBe(createHash("sha3-256").update(big).digest("hex"));
  });

  test("an empty file works, and an unreadable name is refused", async () => {
    const p = join(root, "empty.bin");
    writeFileSync(p, "");
    const r = await digestFile(p, HASH_SPECS);
    expect(r.rows.find((x) => x.spec.id === "crc32")!.value).toBe("00000000");
    expect(r.rows.find((x) => x.spec.id === "xxhash64")!.value.length).toBe(16);
    await expect(digestFile(join(root, "nope"), HASH_SPECS)).rejects.toThrow();
  });

  test("a cancelled run stops with the CANCELLED code", async () => {
    const p = join(root, "cancel.bin");
    writeFileSync(p, big);
    const ac = new AbortController();
    ac.abort();
    await expect(digestFile(p, HASH_SPECS, { signal: ac.signal })).rejects.toMatchObject({ code: "CANCELLED" });
  });

  test("the whole-file limit is a sane constant that is explained when it applies", () => {
    expect(MAX_WHOLE_FILE_BYTES).toBe(256 * 1024 * 1024);
  });

  test("crypto/filehash gives the five classic rows, and every kind with extras", async () => {
    const p = join(root, "small.txt");
    writeFileSync(p, "abc");
    const plain = (await op("filehash", { paths: [p] })).results[0];
    expect(plain.rows.map((r: string[]) => r[0])).toEqual(["SHA-256", "SHA-512", "SHA-384", "SHA-1", "MD5"]);
    expect(plain.fast).toEqual([]);
    const more = (await op("filehash", { paths: [p], extras: true })).results[0];
    const rows = byLabel([...more.rows, ...more.fast]);
    expect(more.rows.length + more.fast.length).toBe(HASH_SPECS.length);
    expect(more.fast.map((r: string[]) => r[0])).toEqual(fastSpecs().map((s) => s.label));
    expect(rows["CRC32"]).toBe("352441c2");
    expect(rows["XXH3"]).toBe("78af5f94892f3950");
    expect(rows["BLAKE2b-256"]).toBe("bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319");
    expect(more.skipped).toEqual([]);
  });

  test("crypto/hash returns the fast group separately, and verify accepts every kind", async () => {
    const r = await op("hash", { text: "abc" });
    expect(r.fast.map((x: string[]) => x[0])).toContain("xxHash64");
    expect(r.rows.map((x: string[]) => x[0])).not.toContain("CRC32");
    for (const [published, kind] of [["352441C2", "CRC32"], ["44bc2cf5ad770999", "xxHash64"], ["bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319", "BLAKE2b-256"], ["CRC32: 352441c2  abc.txt", "CRC32"]] as const) {
      const v = await op("verify", { expected: published, text: "abc" });
      expect(v.matched, published).toBe(true);
      // the 64-digit ones are ambiguous between several kinds; the first matching one is named
      if (!/^bddd/.test(published)) expect(v.match).toBe(kind);
    }
    const p = join(root, "verify.txt");
    writeFileSync(p, "abc");
    expect((await op("verify", { expected: "78af5f94892f3950", path: p })).match).toBe("XXH3");
    expect((await op("verify", { expected: "0000000000000000", path: p })).matched).toBe(false);
    expect((await op("info")).fast.algorithms).toContain("rapidhash");
  });
});

describe("More info: fingerprints", () => {
  test("the default stays the five usual kinds in the usual order", async () => {
    const p = join(root, "i1.txt");
    writeFileSync(p, "123456789");
    const r = await hashFile(ctx, p, control());
    expect(r.rows.map((x) => x.id)).toEqual(["md5", "sha1", "sha256", "sha512", "crc32"]);
    expect(r.skipped).toEqual([]);
  });

  test("extra kinds can be chosen; fast ones have 8 or 16 digits", async () => {
    const p = join(root, "i2.txt");
    writeFileSync(p, "abc");
    const r = await hashFile(ctx, p, control(), ["blake2b256", "xxh3", "adler32", "md4"]);
    expect(Object.fromEntries(r.rows.map((x) => [x.id, x.value]))).toEqual({
      blake2b256: "bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319",
      md4: "a448017aaf21d8525fc10ae87aa6729d",
      adler32: "024d0127",
      xxh3: "78af5f94892f3950",
    });
    expect(r.rows.every((x) => x.hint)).toBe(true);
  });

  test("the compare box knows the new names and lengths", async () => {
    const p = join(root, "i3.txt");
    writeFileSync(p, "abc");
    const r = await hashFile(ctx, p, control(), ["sha224", "xxhash64", "sha512-256", "crc32", "sha3-512"]);
    const rows = r.rows.map((x) => ({ id: x.id, value: x.value }));
    expect(compareHash("44BC2CF5AD770999", rows).matched).toBe("xxhash64");
    expect(compareHash("xxHash64: 44bc2cf5ad770999", rows).matched).toBe("xxhash64");
    expect(compareHash("sha-512/256 = 53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23", rows).matched).toBe("sha512-256");
    expect(compareHash("sha256:53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23", rows).matched).toBeNull();
    expect(compareHash("23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7", rows).matched).toBe("sha224");
    expect(compareHash("0000000000000000", rows).hint).toContain("does NOT match");
    expect(compareHash("00000000000000000000000000000000", rows).hint).toContain("wasn't calculated");
    expect(normalizeHash("XXH3=78af5f94892f3950")).toEqual({ hex: "78af5f94892f3950", named: "xxh3" });
  });
});
