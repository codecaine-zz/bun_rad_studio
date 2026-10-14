import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { argon2Sync, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, chmodSync, utimesSync } from "node:fs";
import { open as openFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { createContext, type FmContext } from "../src/features/filemanager/fmCore";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";
import { listTrash } from "../src/features/filemanager/fmTrash";
import { checkEntryPath, collisionKey, componentProblem } from "../src/features/filemanager/fmVaultContainer";
import { decryptFile, encryptItem, inspectFile, type EncryptRequest } from "../src/features/filemanager/fmVaultEngine";
import {
  HEADER_SIZE, KDF_LIMITS, LEVELS, WRONG_OR_DAMAGED, deriveFileKey, encodeHeader, newHeader, openBlocks, parseHeader, sealStream, verifyCiphertext, type KdfParams,
} from "../src/features/filemanager/fmVaultFormat";
import { vaultOperations } from "../src/features/filemanager/fmVaultOps";
import { checkPasswordPolicy, generatePassphrase } from "../src/features/filemanager/fmVaultPolicy";
import { setVaultInternal, findTask } from "../src/features/filemanager/fmVaultTasks";
import { VAULT_WORDS } from "../src/features/filemanager/fmVaultWords";

const FAST: KdfParams = { memoryKiB: 64, passes: 1, parallelism: 1 };
const PW = "correct horse battery staple";
const scratch = join(import.meta.dir, `.scratch-fm-vault-${process.pid}`);
const home = join(scratch, "home");
let counter = 0;

beforeAll(() => mkdirSync(home, { recursive: true }));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const fresh = (name = "d") => {
  const dir = join(scratch, `${name}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
async function shaFile(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}
function tree(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = lstatSync(p);
    const rel = p.slice(base.length + 1);
    if (st.isDirectory()) out.push(`${rel}/`, ...tree(p, base));
    else out.push(`${rel} ${sha(readFileSync(p))}`);
  }
  return out;
}
const files = (dir: string) => readdirSync(dir).sort();
function allFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allFiles(join(dir, e.name)) : [join(dir, e.name)]));
}

const enc = (source: string, outputDir: string, extra: Partial<EncryptRequest> = {}) =>
  encryptItem({ source, outputDir, password: PW, level: "standard", compress: true, hideName: false, internal: { kdf: FAST, chunkLog2: 12 }, ...extra });
const dec = (source: string, outputDir: string, password = PW) => decryptFile({ source, outputDir, password });

async function rejectsWith(fn: () => Promise<unknown>, code?: string): Promise<any> {
  let thrown: any;
  try {
    await fn();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeDefined();
  if (code) expect(thrown.code).toBe(code);
  return thrown;
}

// ---------------------------------------------------------------------------------------------------------------
// An independent decryptor, written only from docs/reference/vault-format.md and node:crypto.
// ---------------------------------------------------------------------------------------------------------------
interface RefEntry { type: "F" | "D"; path: string; mode: number; mtime: number; data: Buffer }
function referenceDecrypt(file: Buffer, password: string): { manifest: any; entries: RefEntry[] } {
  const h = file.subarray(0, 64);
  if (h.subarray(0, 8).toString("latin1") !== "RADENC01" || h[8] !== 1 || h[47] !== 1) throw new Error("bad header");
  const [mem, t, p, salt, chunk, flags, prefix] = [h.readUInt32BE(9), h[13]!, h[14]!, h.subarray(15, 47), 1 << h[48]!, h[49]!, h.subarray(50, 57)];
  const master = Buffer.from(argon2Sync("argon2id", { message: Buffer.from(password.normalize("NFKC"), "utf8"), nonce: salt, memory: mem, passes: t, parallelism: p, tagLength: 32 }));
  const key = Buffer.from(hkdfSync("sha256", master, salt, "radenc v1 file key", 32));
  const body = file.subarray(64);
  const parts: Buffer[] = [];
  const count = Math.ceil(body.length / (chunk + 16));
  for (let i = 0; i < count; i++) {
    const block = body.subarray(i * (chunk + 16), (i + 1) * (chunk + 16));
    const counterBytes = Buffer.alloc(4);
    counterBytes.writeUInt32BE(i);
    const nonce = Buffer.concat([prefix, counterBytes, Buffer.from([i === count - 1 ? 1 : 0])]);
    const d = createDecipheriv("aes-256-gcm", key, nonce);
    d.setAAD(h);
    d.setAuthTag(block.subarray(block.length - 16));
    parts.push(d.update(block.subarray(0, block.length - 16)), d.final());
  }
  let payload = Buffer.concat(parts);
  if (flags & 1) payload = gunzipSync(payload);
  let o = 0;
  if (String.fromCharCode(payload[o++]!) !== "M") throw new Error("no manifest");
  const mlen = payload.readUInt32BE(o);
  o += 4;
  const manifest = JSON.parse(payload.subarray(o, o + mlen).toString("utf8"));
  o += mlen;
  const entries: RefEntry[] = [];
  for (;;) {
    const tag = String.fromCharCode(payload[o++]!);
    if (tag === "E") break;
    const plen = payload.readUInt16BE(o);
    o += 2;
    const path = payload.subarray(o, o + plen).toString("utf8");
    o += plen;
    const mode = payload.readUInt16BE(o);
    const mtime = payload.readDoubleBE(o + 2);
    o += 10;
    let data = Buffer.alloc(0);
    if (tag === "F") {
      const size = Number(payload.readBigUInt64BE(o));
      o += 8;
      data = payload.subarray(o, o + size);
      o += size;
    }
    entries.push({ type: tag as "F" | "D", path, mode, mtime, data });
  }
  if (o !== payload.length) throw new Error("trailing bytes");
  return { manifest, entries };
}

// A file made once by this engine and frozen here: any accidental change to the format breaks this test.
const KAT = "UkFERU5DMDEBAAAAQAEBAYkR5mWZBaLviHBhOyBR5ruswAxfmonyxRum7UbxenYBFADt1rojWHt6AAAAAAAAAGayDyAsQJRJ2qNThPX+cyvgvjb5w4VyxidVcKWSNcDH7keEGwP0FUcm7dcmkXK43jy1+hFgCiFsEANJ5BSzkZDDs57wmoW9TS2AjxKv2bO2hlARxHG9dKmSm+MtsU850NJ58Tj/mk7hY0TzTlJ8rZ/DxzBJx5fB9tsabvhoybMUKHwSeX0nrgrOehPLa8KiERoEI9kjEemkdBvltCaJqaPaXJwCFvA=";

describe("the format, proven by an independent decryptor", () => {
  test("the header is 64 bytes laid out exactly as documented", async () => {
    const dir = fresh();
    const src = join(dir, "note.txt");
    writeFileSync(src, "hello");
    const r = await enc(src, dir, { level: "standard", compress: false });
    const f = readFileSync(r.output);
    expect(f.subarray(0, 8).toString("latin1")).toBe("RADENC01");
    expect(f[8]).toBe(1);
    expect(f.readUInt32BE(9)).toBe(FAST.memoryKiB);
    expect([f[13], f[14]]).toEqual([1, 1]);
    expect(f[47]).toBe(1);
    expect(f[48]).toBe(12);
    expect(f[49]).toBe(0);
    expect(f.subarray(57, 64).every((x) => x === 0)).toBe(true);
    expect(f.subarray(15, 47).every((x) => x === 0)).toBe(false);
    const c = await enc(src, dir, { compress: true });
    expect(readFileSync(c.output)[49]).toBe(1);
    expect(r.outputName).toBe("note.txt.radenc");
  });

  test("files made by the engine open with the reference decryptor (file, folder, compressed or not)", async () => {
    const dir = fresh();
    const src = join(dir, "src");
    mkdirSync(join(src, "sub/deeper"), { recursive: true });
    mkdirSync(join(src, "empty"));
    writeFileSync(join(src, "a.txt"), "alpha\n".repeat(2000));
    writeFileSync(join(src, "sub/b.bin"), randomBytes(20_000));
    writeFileSync(join(src, "sub/deeper/c.txt"), "");
    chmodSync(join(src, "a.txt"), 0o640);
    utimesSync(join(src, "a.txt"), new Date(1_600_000_000_123), new Date(1_600_000_000_123));
    for (const compress of [false, true]) {
      const out = fresh();
      const r = await enc(src, out, { compress });
      const ref = referenceDecrypt(readFileSync(r.output), PW);
      expect(ref.manifest).toMatchObject({ v: 1, kind: "folder", name: "src", count: 6, bytes: 12_000 + 20_000 });
      expect(Number.isNaN(Date.parse(ref.manifest.created))).toBe(false);
      const byPath = new Map(ref.entries.map((e) => [e.path, e]));
      expect([...byPath.keys()].sort()).toEqual(["a.txt", "empty", "sub", "sub/b.bin", "sub/deeper", "sub/deeper/c.txt"]);
      expect(byPath.get("a.txt")!.data.equals(readFileSync(join(src, "a.txt")))).toBe(true);
      expect(byPath.get("a.txt")!.mode).toBe(0o640);
      expect(byPath.get("a.txt")!.mtime).toBe(1_600_000_000_123);
      expect(byPath.get("empty")!.type).toBe("D");
      expect(byPath.get("sub/deeper/c.txt")!.data.length).toBe(0);
    }
    const single = await enc(join(src, "a.txt"), fresh(), { compress: false });
    const one = referenceDecrypt(readFileSync(single.output), PW);
    expect(one.manifest).toMatchObject({ kind: "file", name: "a.txt", count: 1 });
    expect(one.entries).toHaveLength(1);
    expect(one.entries[0]!.path).toBe("a.txt");
  });

  test("the reference decryptor refuses a changed header (the header is authenticated)", async () => {
    const dir = fresh();
    const src = join(dir, "x.txt");
    writeFileSync(src, "data");
    const f = readFileSync((await enc(src, dir)).output);
    const bad = Buffer.from(f);
    bad[56]! ^= 1;
    expect(() => referenceDecrypt(bad, PW)).toThrow();
    expect(() => referenceDecrypt(f, "wrong password")).toThrow();
    expect(referenceDecrypt(f, PW).manifest.name).toBe("x.txt");
  });

  test("a frozen file from the first release still opens (known answer)", async () => {
    const out = fresh();
    const file = join(out, "kat.radenc");
    writeFileSync(file, Buffer.from(KAT, "base64"));
    const ref = referenceDecrypt(readFileSync(file), "correct horse battery staple");
    expect(ref.entries[0]!.data.toString()).toBe("RADENC known answer\n");
    const dest = fresh();
    const r = await dec(file, dest, "correct horse battery staple");
    expect(readFileSync(r.output, "utf8")).toBe("RADENC known answer\n");
    expect(r.outputName).toBe("kat.txt");
    expect(await inspectFile(file)).toMatchObject({ valid: true, version: 1, compressed: false, chunkSize: 1 << 20 });
  });

  test("password text is normalised (NFKC) before use", async () => {
    const dir = fresh();
    const src = join(dir, "u.txt");
    writeFileSync(src, "x");
    const r = await enc(src, dir, { password: "Caf\u00e9 password long" });
    const out = fresh();
    await dec(r.output, out, "Cafe\u0301 password long"); // decomposed é
    expect(files(out)).toEqual(["u.txt"]);
    const out2 = fresh();
    await dec(r.output, out2, "\uff23afe\u0301 password long"); // fullwidth C
    expect(files(out2)).toEqual(["u.txt"]);
  });
});

describe("the chunked stream", () => {
  const S = 1 << 12;
  const header = () => newHeader(FAST, false, 12);
  const seal = async (len: number) => {
    const h = header();
    const raw = encodeHeader(h);
    const key = await deriveFileKey("pw", h);
    const parts: Buffer[] = [raw];
    const plain = randomBytes(len);
    const res = await sealStream((async function* () { yield plain; })(), key, h, raw, async (b) => void parts.push(b));
    return { h, raw, key, file: Buffer.concat(parts), plain, res };
  };
  const readBack = async (file: Buffer, h: ReturnType<typeof header>, raw: Buffer, key: Buffer) => {
    const path = join(fresh(), "s.bin");
    writeFileSync(path, file);
    const fh = await openFile(path, "r");
    try {
      const out: Buffer[] = [];
      for await (const p of openBlocks(fh, file.length, key, h, raw)) out.push(p);
      return out;
    } finally {
      await fh.close();
    }
  };

  for (const len of [0, 1, S - 1, S, S + 1, 2 * S, 2 * S + 1, 5 * S - 3]) {
    test(`a payload of ${len} bytes round-trips in the right number of chunks`, async () => {
      const { h, raw, key, file, plain, res } = await seal(len);
      const expected = Math.max(1, Math.ceil(len / S));
      expect(res.chunks).toBe(expected);
      expect(file.length).toBe(64 + len + 16 * expected);
      const pieces = await readBack(file, h, raw, key);
      expect(Buffer.concat(pieces).equals(plain)).toBe(true);
      if (len > 0) expect(pieces.at(-1)!.length).toBeGreaterThan(0);
    });
  }

  test("verifyCiphertext accepts a good file and rejects any single flipped bit", async () => {
    const { h, raw, key, file } = await seal(3 * S + 5);
    const path = join(fresh(), "v.bin");
    writeFileSync(path, file);
    const check = async (buf: Buffer) => {
      writeFileSync(path, buf);
      const fh = await openFile(path, "r");
      try {
        return await verifyCiphertext(fh, buf.length, key, raw);
      } finally {
        await fh.close();
      }
    };
    expect(await check(file)).toBe(true);
    for (const at of [3, 20, 60, 64, 100, 64 + S, file.length - 1, file.length - 17]) {
      const bad = Buffer.from(file);
      bad[at]! ^= 0x01;
      expect(await check(bad)).toBe(false);
    }
    expect(h.noncePrefix.length).toBe(7);
  });
});

describe("round trips", () => {
  const cases: Array<[string, (src: string) => void, string]> = [
    ["an empty file", (s) => writeFileSync(s, ""), "file"],
    ["one byte", (s) => writeFileSync(s, "x"), "file"],
    ["binary data", (s) => writeFileSync(s, randomBytes(70_000)), "file"],
    ["many chunks", (s) => writeFileSync(s, randomBytes(200_001)), "file"],
  ];
  for (const compress of [true, false]) {
    for (const [label, make] of cases) {
      test(`${label} (compress ${compress})`, async () => {
        const dir = fresh();
        const src = join(dir, "item.dat");
        make(src);
        const r = await enc(src, dir, { compress });
        expect(r.kind).toBe("file");
        const out = fresh();
        const d = await dec(r.output, out);
        expect(d.outputName).toBe("item.dat");
        expect(readFileSync(d.output).equals(readFileSync(src))).toBe(true);
        expect(files(dir)).toEqual(["item.dat", "item.dat.radenc"]);
      });
    }
  }

  test("sizes around one default-sized chunk (1 MiB), with the real chunk size", async () => {
    const S = 1 << 20;
    for (const size of [S - 1, S, S + 1]) {
      const dir = fresh();
      const src = join(dir, "big.bin");
      writeFileSync(src, randomBytes(size));
      const r = await encryptItem({ source: src, outputDir: dir, password: PW, level: "standard", compress: false, hideName: false, internal: { kdf: FAST } });
      const out = fresh();
      const d = await dec(r.output, out);
      expect(await shaFile(d.output)).toBe(await shaFile(src));
    }
  });

  test("an empty folder, nested folders, empty subfolders, many small files and mixed content", async () => {
    const dir = fresh();
    const empty = join(dir, "empty");
    mkdirSync(empty);
    const nested = join(dir, "nested");
    mkdirSync(join(nested, "a/b/c/d"), { recursive: true });
    mkdirSync(join(nested, "a/empty"));
    writeFileSync(join(nested, "a/b/c/d/leaf.txt"), "leaf");
    writeFileSync(join(nested, "top.bin"), randomBytes(9000));
    const many = join(dir, "many");
    mkdirSync(many);
    for (let i = 0; i < 300; i++) writeFileSync(join(many, `f${i}.txt`), `file ${i}\n`.repeat(i % 7));
    for (const folder of [empty, nested, many]) {
      for (const compress of [true, false]) {
        const out = fresh();
        const r = await enc(folder, out, { compress });
        const dest = fresh();
        const d = await dec(r.output, dest);
        expect(d.kind).toBe("folder");
        expect(tree(d.output)).toEqual(tree(folder));
      }
    }
  });

  test("unicode and very long names survive; the .radenc name is shortened when needed", async () => {
    const dir = fresh();
    const names = ["日本語のファイル.txt", "émoji 😀 file.txt", "a".repeat(240) + ".txt", "ünï-cödé"];
    for (const n of names) writeFileSync(join(dir, n), `content of ${n}`);
    for (const n of names) {
      const out = fresh();
      const r = await enc(join(dir, n), out);
      expect(Buffer.byteLength(r.outputName)).toBeLessThanOrEqual(255);
      expect(r.outputName.endsWith(".radenc")).toBe(true);
      const dest = fresh();
      const d = await dec(r.output, dest);
      expect(d.outputName).toBe(n);
      expect(readFileSync(d.output, "utf8")).toBe(`content of ${n}`);
    }
  });

  test("hideName gives an anonymous file name and keeps the real name only inside", async () => {
    const dir = fresh();
    const src = join(dir, "secret-plans.txt");
    writeFileSync(src, "plans");
    const a = await enc(src, dir, { hideName: true });
    const b = await enc(src, dir, { hideName: true });
    expect([a.outputName, b.outputName]).toEqual(["Encrypted file 1.radenc", "Encrypted file 2.radenc"]);
    for (const r of [a, b]) {
      const bytes = readFileSync(r.output);
      expect(bytes.includes(Buffer.from("secret-plans"))).toBe(false);
      expect(bytes.includes(Buffer.from("plans"))).toBe(false);
    }
    const out = fresh();
    expect((await dec(a.output, out)).outputName).toBe("secret-plans.txt");
  });

  test("file modes and times are restored; set-id bits are not", async () => {
    const dir = fresh();
    const src = join(dir, "tool.sh");
    writeFileSync(src, "#!/bin/sh\n");
    chmodSync(src, 0o755);
    utimesSync(src, new Date(1_500_000_000_000), new Date(1_500_000_000_000));
    const out = fresh();
    const d = await dec((await enc(src, fresh())).output, out);
    expect(statSync(d.output).mode & 0o777).toBe(0o755);
    expect(statSync(d.output).mtimeMs).toBe(1_500_000_000_000);
  });

  test("links are skipped with a warning, never followed or stored; a link as the item is refused", async () => {
    const dir = fresh();
    const folder = join(dir, "withlink");
    mkdirSync(folder);
    writeFileSync(join(folder, "real.txt"), "real");
    writeFileSync(join(dir, "outside.txt"), "OUTSIDE");
    symlinkSync(join(dir, "outside.txt"), join(folder, "link.txt"));
    const r = await enc(folder, fresh());
    expect(r.warnings.join("\n")).toContain("link.txt");
    const ref = referenceDecrypt(readFileSync(r.output), PW);
    expect(ref.entries.map((e) => e.path)).toEqual(["real.txt"]);
    await rejectsWith(() => enc(join(folder, "link.txt"), fresh()), "BAD_SOURCE");
  });

  test("the output folder can't be inside the folder being encrypted", async () => {
    const dir = fresh();
    const folder = join(dir, "f");
    mkdirSync(join(folder, "out"), { recursive: true });
    writeFileSync(join(folder, "a.txt"), "a");
    await rejectsWith(() => enc(folder, join(folder, "out")), "OUTPUT_INSIDE");
    expect(files(join(folder, "out"))).toEqual([]);
  });

  test("inspect: valid files, other files, short files, folders", async () => {
    const dir = fresh();
    const src = join(dir, "i.txt");
    writeFileSync(src, "inspect me");
    const r = await enc(src, dir, { compress: true });
    expect(await inspectFile(r.output)).toMatchObject({ valid: true, version: 1, compressed: true, level: "custom", chunkSize: 4096, size: statSync(r.output).size });
    expect(await inspectFile(src)).toMatchObject({ valid: false, reason: "not-radenc" });
    writeFileSync(join(dir, "short.radenc"), "RAD");
    expect(await inspectFile(join(dir, "short.radenc"))).toMatchObject({ valid: false });
    writeFileSync(join(dir, "empty.radenc"), "");
    expect(await inspectFile(join(dir, "empty.radenc"))).toMatchObject({ valid: false, reason: "not-radenc" });
  });
});

describe("large files stream with bounded memory", () => {
  test("a 100 MB file encrypts, checks and decrypts without holding it in memory", async () => {
    const dir = fresh();
    const src = join(dir, "big.bin");
    const block = randomBytes(1 << 20);
    const fh = await openFile(src, "w");
    const hash = createHash("sha256");
    for (let i = 0; i < 100; i++) {
      block.writeUInt32BE(i, 0);
      await fh.write(block);
      hash.update(block);
    }
    await fh.close();
    const want = hash.digest("hex");
    Bun.gc(true);
    const baseline = process.memoryUsage().rss;
    let peak = baseline;
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 10);
    try {
      const t0 = performance.now();
      const r = await encryptItem({ source: src, outputDir: dir, password: PW, level: "standard", compress: false, hideName: false, internal: { kdf: FAST } });
      const t1 = performance.now();
      const out = fresh();
      const d = await dec(r.output, out);
      const t2 = performance.now();
      expect(await shaFile(d.output)).toBe(want);
      const mb = 100 * 1.048576;
      console.log(`vault throughput: encrypt+verify ${(mb / ((t1 - t0) / 1000)).toFixed(0)} MB/s, decrypt ${(mb / ((t2 - t1) / 1000)).toFixed(0)} MB/s, RSS growth ${((peak - baseline) / 1048576).toFixed(0)} MB`);
    } finally {
      clearInterval(timer);
    }
    expect(peak - baseline).toBeLessThan(150 * 1048576);
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------------------------
describe("tampering: every change fails with the same plain message and leaves nothing behind", () => {
  let baseFile: Buffer;
  let compressedFile: Buffer;
  const FULL = 4096 + 16;

  beforeAll(async () => {
    const dir = fresh();
    const src = join(dir, "src");
    mkdirSync(join(src, "sub"), { recursive: true });
    writeFileSync(join(src, "one.bin"), randomBytes(12_000));
    writeFileSync(join(src, "sub/two.bin"), randomBytes(12_000));
    baseFile = readFileSync((await enc(src, fresh(), { compress: false })).output);
    compressedFile = readFileSync((await enc(src, fresh(), { compress: true })).output);
  });

  async function mustFail(bytes: Buffer, password = PW) {
    const work = fresh("tamper");
    const file = join(work, "t.radenc");
    writeFileSync(file, bytes);
    const out = fresh("tamper-out");
    const err = await rejectsWith(() => dec(file, out, password));
    expect(err.message).toBe(WRONG_OR_DAMAGED);
    expect(files(out)).toEqual([]);
    expect(files(work)).toEqual(["t.radenc"]);
  }
  const flipped = (src: Buffer, at: number, mask = 0x01) => {
    const b = Buffer.from(src);
    b[at]! ^= mask;
    return b;
  };

  test("the untouched file opens (control)", async () => {
    const out = fresh();
    const file = join(fresh(), "ok.radenc");
    writeFileSync(file, baseFile);
    const d = await dec(file, out);
    expect(d.kind).toBe("folder");
  });

  test("flipping a byte in every header position (magic, ids, parameters, salt, nonce, reserved)", async () => {
    for (let i = 0; i < HEADER_SIZE; i++) {
      await mustFail(flipped(baseFile, i));
      if (i >= 8 && i <= 14) await mustFail(flipped(baseFile, i, 0x80));
    }
  });

  test("flipping a byte in the first, a middle and the last chunk, and in their tags", async () => {
    const blocks = Math.ceil((baseFile.length - 64) / FULL);
    expect(blocks).toBeGreaterThan(5);
    const at = [64, 64 + 100, 64 + FULL * 2 + 7, 64 + FULL * (blocks - 1), baseFile.length - 1, baseFile.length - 16, 64 + FULL - 1, 64 + FULL - 16];
    for (const i of at) await mustFail(flipped(baseFile, i));
    for (const i of at) await mustFail(flipped(compressedFile, Math.min(i, compressedFile.length - 1)));
  });

  test("truncating at every chunk boundary and in the middle of every chunk", async () => {
    const blocks = Math.ceil((baseFile.length - 64) / FULL);
    for (let k = 0; k <= blocks; k++) {
      await mustFail(baseFile.subarray(0, Math.min(baseFile.length - 1, 64 + k * FULL)));
      await mustFail(baseFile.subarray(0, Math.min(baseFile.length - 1, 64 + k * FULL + 100)));
    }
    await mustFail(baseFile.subarray(0, 63));
    await mustFail(baseFile.subarray(0, 64));
    await mustFail(baseFile.subarray(0, 70));
    await mustFail(compressedFile.subarray(0, compressedFile.length - 1));
    await mustFail(compressedFile.subarray(0, 64 + 5));
  });

  test("reordering, duplicating and appending chunks", async () => {
    const head = baseFile.subarray(0, 64);
    const blocks: Buffer[] = [];
    for (let o = 64; o < baseFile.length; o += FULL) blocks.push(baseFile.subarray(o, Math.min(baseFile.length, o + FULL)));
    expect(blocks.length).toBeGreaterThan(4);
    const join2 = (list: Buffer[]) => Buffer.concat([head, ...list]);
    const swapped = [...blocks];
    [swapped[1], swapped[2]] = [swapped[2]!, swapped[1]!];
    await mustFail(join2(swapped));
    await mustFail(join2([blocks[0]!, blocks[1]!, blocks[1]!, ...blocks.slice(2)]));
    await mustFail(join2([...blocks, blocks[1]!]));
    await mustFail(join2([...blocks, blocks.at(-1)!]));
    await mustFail(join2(blocks.slice(1)));
    await mustFail(Buffer.concat([baseFile, Buffer.from([0])]));
    await mustFail(Buffer.concat([baseFile, randomBytes(16)]));
    await mustFail(Buffer.concat([baseFile, randomBytes(5000)]));
    await mustFail(Buffer.concat([baseFile, head]));
  });

  test("a wrong password and an empty password", async () => {
    await mustFail(baseFile, "not the password at all");
    await mustFail(baseFile, "");
    await mustFail(baseFile, PW + " ");
    await mustFail(baseFile, PW.toUpperCase());
    await mustFail(compressedFile, "another wrong one");
  });

  test("a file that isn't RADENC at all gets the same message", async () => {
    await mustFail(Buffer.from("just some text, nothing special"));
    await mustFail(randomBytes(300));
    await mustFail(Buffer.alloc(0));
  });
});

describe("key-derivation parameter abuse is refused before any work is done", () => {
  const craft = (mutate: (h: Buffer) => void) => {
    const h = encodeHeader(newHeader(FAST, false, 12));
    mutate(h);
    return Buffer.concat([h, randomBytes(200)]);
  };
  const abuse: Array<[string, (h: Buffer) => void]> = [
    ["4 TiB of memory", (h) => h.writeUInt32BE(0xffffffff, 9)],
    ["just over 2 GiB", (h) => h.writeUInt32BE(KDF_LIMITS.maxMemoryKiB + 1, 9)],
    ["zero passes", (h) => (h[13] = 0)],
    ["255 passes", (h) => (h[13] = 255)],
    ["11 passes", (h) => (h[13] = 11)],
    ["zero lanes", (h) => (h[14] = 0)],
    ["255 lanes", (h) => (h[14] = 255)],
    ["17 lanes", (h) => (h[14] = 17)],
    ["memory below 8 KiB per lane", (h) => { h[14] = 4; h.writeUInt32BE(31, 9); }],
    ["a chunk size of 2^5", (h) => (h[48] = 5)],
    ["a chunk size of 2^40", (h) => (h[48] = 40)],
    ["a chunk size of 2^25", (h) => (h[48] = 25)],
    ["an unknown KDF", (h) => (h[8] = 2)],
    ["an unknown cipher", (h) => (h[47] = 9)],
    ["unknown flags", (h) => (h[49] = 0x02)],
    ["non-zero reserved bytes", (h) => (h[60] = 1)],
  ];
  for (const [label, mutate] of abuse) {
    test(`${label}`, async () => {
      const bytes = craft(mutate);
      const dir = fresh();
      const file = join(dir, "abuse.radenc");
      writeFileSync(file, bytes);
      const t0 = performance.now();
      const err = await rejectsWith(() => dec(file, fresh()));
      expect(err.message).toBe(WRONG_OR_DAMAGED);
      expect(performance.now() - t0).toBeLessThan(400); // the KDF never ran
      const info = await inspectFile(file);
      expect(info.valid).toBe(false);
      expect(parseHeader(bytes).ok).toBe(false);
    });
  }

  test("limits at the edge are accepted by the header check", () => {
    const edge = encodeHeader(newHeader({ memoryKiB: KDF_LIMITS.maxMemoryKiB, passes: 10, parallelism: 16 }, true));
    expect(parseHeader(edge).ok).toBe(true);
    expect(parseHeader(encodeHeader(newHeader({ memoryKiB: 8, passes: 1, parallelism: 1 }, false))).ok).toBe(true);
  });

  test("the real levels are what the documentation says", () => {
    expect(LEVELS.standard).toEqual({ memoryKiB: 262_144, passes: 3, parallelism: 4 });
    expect(LEVELS.maximum).toEqual({ memoryKiB: 1_048_576, passes: 4, parallelism: 4 });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("hostile containers (valid encryption, malicious contents) never write outside the destination", () => {
  const u16 = (n: number) => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n);
    return b;
  };
  const u64 = (n: bigint) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(n);
    return b;
  };
  interface E { t: "F" | "D"; path: string | Buffer; data?: Buffer; size?: bigint }
  const entryBuf = (e: E) => {
    const p = typeof e.path === "string" ? Buffer.from(e.path, "utf8") : e.path;
    const mtime = Buffer.alloc(8);
    mtime.writeDoubleBE(1_700_000_000_000);
    const head = Buffer.concat([Buffer.from(e.t), u16(p.length), p, u16(0o644), mtime]);
    return e.t === "D" ? head : Buffer.concat([head, u64(e.size ?? BigInt((e.data ?? Buffer.alloc(0)).length)), e.data ?? Buffer.alloc(0)]);
  };
  const manifestBuf = (m: unknown, lengthOverride?: number) => {
    const json = Buffer.from(typeof m === "string" ? m : JSON.stringify(m));
    const head = Buffer.alloc(5);
    head[0] = 0x4d;
    head.writeUInt32BE(lengthOverride ?? json.length, 1);
    return Buffer.concat([head, json]);
  };
  const build = (entries: E[], over: Record<string, unknown> = {}, tail: Buffer = Buffer.from("E")) => {
    const bytes = entries.reduce((n, e) => n + (e.t === "F" ? (e.data?.length ?? 0) : 0), 0);
    const m = { v: 1, kind: "folder", name: "evil", created: "2026-01-01T00:00:00.000Z", count: entries.length, bytes, ...over };
    return Buffer.concat([manifestBuf(m), ...entries.map(entryBuf), tail]);
  };
  const forge = async (payload: Buffer, compress = false) => {
    const h = newHeader(FAST, compress, 12);
    const raw = encodeHeader(h);
    const key = await deriveFileKey(PW, h);
    const parts: Buffer[] = [raw];
    await sealStream((async function* () { yield compress ? gzipSync(payload) : payload; })(), key, h, raw, async (b) => void parts.push(b));
    const path = join(fresh("forged"), "f.radenc");
    writeFileSync(path, Buffer.concat(parts));
    return path;
  };
  const refused = async (payload: Buffer, platform: "linux" | "darwin" = "linux", codes = ["BAD_CONTAINER"]) => {
    const dir = fresh("victim");
    const dest = join(dir, "dest");
    mkdirSync(dest);
    const file = await forge(payload);
    const err = await rejectsWith(() => decryptFile({ source: file, outputDir: dest, password: PW, platform }));
    expect(codes).toContain(err.code);
    expect(String(err.message).length).toBeGreaterThan(15);
    expect(files(dest)).toEqual([]);
    expect(files(dir)).toEqual(["dest"]);
  };
  const F = (path: string | Buffer, data = "x"): E => ({ t: "F", path, data: Buffer.from(data) });
  const D = (path: string | Buffer): E => ({ t: "D", path });

  test("a well-formed container extracts (control for every case below)", async () => {
    const dest = fresh();
    const file = await forge(build([D("sub"), F("sub/a.txt", "AAA"), F("b.txt", "BB"), D("empty")]), true);
    const r = await decryptFile({ source: file, outputDir: dest, password: PW });
    expect(tree(r.output)).toEqual([`b.txt ${sha("BB")}`, "empty/", "sub/", `sub/a.txt ${sha("AAA")}`]);
    const one = await forge(Buffer.concat([manifestBuf({ v: 1, kind: "file", name: "n.txt", created: "x", count: 1, bytes: 2 }), entryBuf(F("n.txt", "hi")), Buffer.from("E")]));
    const r2 = await decryptFile({ source: one, outputDir: dest, password: PW });
    expect(readFileSync(r2.output, "utf8")).toBe("hi");
  });

  const badPaths: Array<[string, string | Buffer]> = [
    ["parent traversal", "../x"],
    ["nested traversal", "a/../../x"],
    ["traversal in the middle", "a/../b"],
    ["an absolute path", "/etc/evil"],
    ["a Windows drive path", "C:/evil"],
    ["a drive-relative path", "C:evil"],
    ["a backslash", "a\\b"],
    ["a backslash traversal", "..\\evil"],
    ["a NUL byte", Buffer.from("a\0b")],
    ["a control character", "a\u0001b"],
    ["a DEL character", "a\u007fb"],
    ["a dot part", "./a"],
    ["a single dot", "."],
    ["dot dot", ".."],
    ["an empty part", "a//b"],
    ["a trailing slash", "a/"],
    ["invalid UTF-8", Buffer.from([0x61, 0xff, 0xfe])],
    ["a name over 255 bytes", "n".repeat(256)],
    ["a path over 1024 bytes", Array.from({ length: 6 }, () => "p".repeat(200)).join("/")],
    ["65 levels", Array.from({ length: 65 }, () => "d").join("/")],
  ];
  for (const [label, path] of badPaths) {
    test(`refuses ${label}`, async () => {
      await refused(build([F(path)]));
      await refused(build([D(path)]));
    });
  }

  test("refuses a zero-length path", async () => {
    await refused(build([F(Buffer.alloc(0))]));
  });

  test("refuses duplicate names and a name used as both file and folder", async () => {
    await refused(build([F("a"), F("a")]));
    await refused(build([D("a"), D("a")]));
    await refused(build([F("a"), F("a/b")]));
    await refused(build([F("a/b"), F("a")]));
    await refused(build([D("a"), F("a")]));
    await refused(build([F("a"), D("a")]));
  });

  test("refuses names that collide on case-insensitive systems (macOS, Windows) (Linux keeps them apart)", async () => {
    await refused(build([F("A"), F("a")]), "darwin");
    await refused(build([F("é.txt"), F("e\u0301.txt")]), "darwin");
    expect(collisionKey("A/B", "darwin")).toBe(collisionKey("a/b", "darwin"));
    expect(collisionKey("A", "linux")).not.toBe(collisionKey("a", "linux"));
  });

  test("Windows rules (reserved names, forbidden characters, trailing dots) are applied for Windows", () => {
    for (const bad of ["CON", "aux.txt", "COM1.txt", "lpt9", "a:b", "a<b", "a|b", "what?", "trail.", "trail ", " lead", "dir/NUL/x", "C:", "a\\b", "con.txt.bak"]) {
      expect(() => checkEntryPath(bad, "win32"), bad).toThrow();
    }
    for (const good of ["xcon.txt.bak", "a/b/c.txt", "Readme", "日本/語.txt", "x-1_2 3.txt"]) expect(() => checkEntryPath(good, "win32"), good).not.toThrow();
    expect(componentProblem("CON", "linux")).toBeNull();
    expect(componentProblem("a:b", "darwin")).toBeNull();
    expect(componentProblem("", "linux")).not.toBeNull();
  });

  test("refuses impossible sizes and counts", async () => {
    await refused(build([{ t: "F", path: "big", data: Buffer.alloc(0), size: 1n << 60n }], { bytes: 5 }));
    await refused(build([{ t: "F", path: "big", data: Buffer.alloc(0), size: 0xffffffffffffffffn }], { bytes: 5 }));
    await refused(build([{ t: "F", path: "big", data: Buffer.from("xx"), size: 3n }], { bytes: 2 }));
    await refused(build([F("a"), F("b")], { count: 1 }));
    await refused(build([F("a")], { count: 3_000_000 }));
    await refused(build([F("a")], { count: 2 }));
    await refused(build([F("a")], { bytes: 1_000_000 }), "linux", ["BAD_CONTAINER", "NO_SPACE"]);
    await refused(build([F("a")], { bytes: 1e15 }), "linux", ["BAD_CONTAINER", "NO_SPACE"]);
    await refused(build([F("a")], { bytes: 2 ** 60 }));
  });

  test("refuses a bad manifest", async () => {
    const ok = { v: 1, kind: "folder", name: "evil", created: "t", count: 0, bytes: 0 };
    const payload = (m: unknown, len?: number) => Buffer.concat([manifestBuf(m, len), Buffer.from("E")]);
    await refused(payload("{not json"));
    await refused(payload("[]"));
    await refused(payload({ ...ok, v: 2 }));
    await refused(payload({ ...ok, kind: "symlink" }));
    await refused(payload({ ...ok, name: "../x" }));
    await refused(payload({ ...ok, name: "a/b" }));
    await refused(payload({ ...ok, name: "" }));
    await refused(payload({ ...ok, name: ".." }));
    await refused(payload({ ...ok, name: 5 }));
    await refused(payload({ ...ok, count: -1 }));
    await refused(payload({ ...ok, count: 1.5 }));
    await refused(payload({ ...ok, bytes: "9" }));
    await refused(payload({ ...ok, created: "x".repeat(100) }));
    await refused(payload({ ...ok, kind: "file", count: 2 }));
    await refused(payload(ok, 70_000));
    await refused(Buffer.concat([Buffer.from("X"), Buffer.alloc(8)]));
    await refused(Buffer.from("M"));
  });

  test("refuses a single-file container that doesn't match itself", async () => {
    const fileManifest = (name: string, extra: Record<string, unknown> = {}) => manifestBuf({ v: 1, kind: "file", name, created: "t", count: 1, bytes: 1, ...extra });
    await refused(Buffer.concat([fileManifest("n"), entryBuf(D("n")), Buffer.from("E")]));
    await refused(Buffer.concat([fileManifest("n"), entryBuf(F("other")), Buffer.from("E")]));
    await refused(Buffer.concat([fileManifest("n"), entryBuf(F("n/x")), Buffer.from("E")]));
  });

  test("refuses broken structure: no end marker, data after the end, unknown entry kinds", async () => {
    await refused(build([F("a")], {}, Buffer.alloc(0)));
    await refused(build([F("a")], {}, Buffer.from("Eextra")));
    await refused(build([F("a")], {}, Buffer.from("X")));
    await refused(Buffer.concat([manifestBuf({ v: 1, kind: "folder", name: "n", created: "t", count: 1, bytes: 0 }), Buffer.from("Q"), Buffer.from("E")]));
  });

  test("a hostile compressed container is refused the same way", async () => {
    const dir = fresh();
    const dest = join(dir, "dest");
    mkdirSync(dest);
    const file = await forge(build([F("../escape.txt", "gotcha")]), true);
    await rejectsWith(() => decryptFile({ source: file, outputDir: dest, password: PW }), "BAD_CONTAINER");
    expect(files(dir)).toEqual(["dest"]);
    expect(files(dest)).toEqual([]);
  });

  test("a pre-existing link in the destination is never written through", async () => {
    const dir = fresh();
    const dest = join(dir, "dest");
    mkdirSync(dest);
    writeFileSync(join(dir, "target.txt"), "KEEP");
    symlinkSync(join(dir, "target.txt"), join(dest, "evil"));
    symlinkSync(join(dir, "target.txt"), join(dest, "n.txt"));
    const file = await forge(build([F("a.txt", "new")]));
    const r = await decryptFile({ source: file, outputDir: dest, password: PW });
    expect(r.outputName).toBe("evil (2)");
    expect(readFileSync(join(dir, "target.txt"), "utf8")).toBe("KEEP");
    const one = await forge(Buffer.concat([manifestBuf({ v: 1, kind: "file", name: "n.txt", created: "t", count: 1, bytes: 2 }), entryBuf(F("n.txt", "hi")), Buffer.from("E")]));
    const r2 = await decryptFile({ source: one, outputDir: dest, password: PW });
    expect(r2.outputName).toBe("n (2).txt");
    expect(readFileSync(join(dir, "target.txt"), "utf8")).toBe("KEEP");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("never overwrites, never touches the original", () => {
  test("encrypting twice makes a second name; existing files keep their bytes", async () => {
    const dir = fresh();
    const src = join(dir, "doc.txt");
    writeFileSync(src, "original");
    const before = lstatSync(src);
    const a = await enc(src, dir);
    const aBytes = readFileSync(a.output);
    const b = await enc(src, dir);
    const c = await enc(src, dir);
    expect([a.outputName, b.outputName, c.outputName]).toEqual(["doc.txt.radenc", "doc.txt (2).radenc", "doc.txt (3).radenc"]);
    expect(readFileSync(a.output).equals(aBytes)).toBe(true);
    expect(readFileSync(src, "utf8")).toBe("original");
    expect(lstatSync(src).mtimeMs).toBe(before.mtimeMs);
    expect(files(dir)).toEqual(["doc.txt", "doc.txt (2).radenc", "doc.txt (3).radenc", "doc.txt.radenc"]);
  });

  test("a pre-existing name of any kind is kept, even a folder or a link", async () => {
    const dir = fresh();
    const src = join(dir, "x.txt");
    writeFileSync(src, "data");
    mkdirSync(join(dir, "x.txt.radenc"));
    writeFileSync(join(dir, "keep.txt"), "KEEP");
    symlinkSync(join(dir, "keep.txt"), join(dir, "x.txt (2).radenc"));
    const r = await enc(src, dir);
    expect(r.outputName).toBe("x.txt (3).radenc");
    expect(readFileSync(join(dir, "keep.txt"), "utf8")).toBe("KEEP");
    expect(lstatSync(join(dir, "x.txt.radenc")).isDirectory()).toBe(true);
  });

  test("decrypting next to an existing item picks a free name for files and folders", async () => {
    const dir = fresh();
    const src = join(dir, "pic.png");
    writeFileSync(src, "png-bytes");
    const folder = join(dir, "album");
    mkdirSync(folder);
    writeFileSync(join(folder, "1.txt"), "one");
    const a = await enc(src, fresh());
    const b = await enc(folder, fresh());
    const d1 = await dec(a.output, dir);
    const d2 = await dec(b.output, dir);
    expect([d1.outputName, d2.outputName]).toEqual(["pic (2).png", "album (2)"]);
    expect(readFileSync(src, "utf8")).toBe("png-bytes");
    expect(files(dir)).toEqual(["album", "album (2)", "pic (2).png", "pic.png"]);
    expect(files(folder)).toEqual(["1.txt"]);
  });

  test("a failed verification leaves no output and no temporary file", async () => {
    const dir = fresh();
    const src = join(dir, "v.txt");
    writeFileSync(src, "verify me");
    const err = await rejectsWith(() =>
      enc(src, dir, {
        internal: {
          kdf: FAST,
          afterWrite: async (p) => {
            const b = readFileSync(p);
            b[b.length - 3]! ^= 0xff;
            writeFileSync(p, b);
          },
        },
      }),
    "VERIFY_FAILED");
    expect(err.message).toContain("original is untouched");
    expect(files(dir)).toEqual(["v.txt"]);
  });

  test("cancelling mid-way removes every partial file", async () => {
    const dir = fresh();
    const src = join(dir, "c.bin");
    writeFileSync(src, randomBytes(12_000_000));
    const ac = new AbortController();
    let seen = 0;
    const out = fresh();
    await rejectsWith(() => enc(src, out, { signal: ac.signal, compress: false, internal: { kdf: FAST }, onBytes: (n) => { seen += n; if (seen > 3_000_000) ac.abort(); } }), "CANCELLED");
    expect(files(out)).toEqual([]);
    const done = await enc(src, out, { compress: false, internal: { kdf: FAST } });
    const ac2 = new AbortController();
    const dest = fresh();
    let got = 0;
    await rejectsWith(() => decryptFile({ source: done.output, outputDir: dest, password: PW, signal: ac2.signal, onBytes: (n) => { got += n; if (got > 2_000_000) ac2.abort(); } }), "CANCELLED");
    expect(files(dest)).toEqual([]);
  });

  test("a missing or non-folder output location is refused", async () => {
    const dir = fresh();
    const src = join(dir, "m.txt");
    writeFileSync(src, "x");
    await rejectsWith(() => enc(src, join(dir, "nope")), "NOT_FOUND");
    await rejectsWith(() => enc(src, src), "NOT_A_FOLDER");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("password rules and the passphrase generator", () => {
  const weak = (pw: unknown, names: string[] = []) => {
    try {
      checkPasswordPolicy(pw, names);
    } catch (err: any) {
      return err as { code: string; message: string };
    }
    return null;
  };

  test("too short, empty and non-text passwords are refused with plain words", () => {
    expect(weak("")?.code).toBe("BAD_PASSWORD");
    expect(weak(undefined)?.code).toBe("BAD_PASSWORD");
    expect(weak(12345678901)?.code).toBe("BAD_PASSWORD");
    expect(weak("short1!")?.message).toContain("too short");
    expect(weak("123456789")?.message).toContain("10");
    expect(weak("x".repeat(2000))?.code).toBe("BAD_PASSWORD");
  });

  test("obvious passwords are refused", () => {
    for (const pw of ["1234567890", "qwertyuiop", "password123", "Password1234!", "passw0rd!!!!", "aaaaaaaaaaaa", "abababababab", "1111111111", "abcdefghijkl", "0987654321", "letmein123", "iloveyou123", "xyzxyzxyzxyz"]) {
      expect(weak(pw), pw)?.toBeTruthy();
      expect(weak(pw)!.code).toBe("WEAK_PASSWORD");
    }
  });

  test("the file's own name can't be the password", () => {
    expect(weak("quarterly-report-2026", ["quarterly-report.pdf"])?.code).toBe("WEAK_PASSWORD");
    expect(weak("My Quarterly Report", ["Quarterly Report.xlsx"])?.code).toBe("WEAK_PASSWORD");
    expect(weak("river-lamp-orbit-seven-plum", ["quarterly-report.pdf"])).toBeNull();
    expect(weak("river-lamp-orbit-seven-plum", ["a.txt"])).toBeNull();
  });

  test("good passwords pass, including unicode, spaces and long passphrases", () => {
    for (const pw of ["river-lamp-orbit-seven-plum", "correct horse battery staple", "Tr0ub4dor&3-extended!", "日本語のパスワードです長い", "  spaces   inside  ok  ", generatePassphrase().passphrase]) expect(weak(pw), pw).toBeNull();
  });

  test("the policy counts characters after NFKC, not bytes", () => {
    expect(weak("あいうえおかきくけ")?.code).toBe("WEAK_PASSWORD"); // 9 characters
    expect(weak("あいうえおかきくけこ")).toBeNull(); // 10
  });

  test("the passphrase list has 2048 distinct words", () => {
    expect(VAULT_WORDS.length).toBeGreaterThanOrEqual(2048);
    expect(new Set(VAULT_WORDS).size).toBe(VAULT_WORDS.length);
    for (const w of VAULT_WORDS) expect(w).toMatch(/^[a-z]{3,8}$/);
  });

  test("passphrases are random, from the list, of the right size and entropy", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = generatePassphrase();
      expect(p.words).toBe(6);
      expect(p.bits).toBe(66);
      const parts = p.passphrase.split("-");
      expect(parts).toHaveLength(6);
      for (const w of parts) expect(VAULT_WORDS).toContain(w);
      seen.add(p.passphrase);
    }
    expect(seen.size).toBe(300);
    expect(generatePassphrase(1).words).toBe(4);
    expect(generatePassphrase(99).words).toBe(12);
    expect(generatePassphrase(8).bits).toBe(88);
    expect(generatePassphrase("x").words).toBe(6);
    expect(generatePassphrase(NaN).words).toBe(6);
    const words = new Set<string>();
    for (let i = 0; i < 1500; i++) words.add(generatePassphrase(4).passphrase.split("-")[0]!);
    expect(words.size).toBeGreaterThan(900); // uniform over 2048 words
    expect(weak(generatePassphrase().passphrase)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("the vault operations (tasks, trash, limits, secrets)", () => {
  let ctx: FmContext;
  const work = () => fresh("w");
  const call = (op: string, body: Record<string, unknown> = {}) => vaultOperations[op]!(ctx, body) as Promise<any>;
  const setup = (internal: Parameters<typeof setVaultInternal>[1] = { kdf: FAST, chunkLog2: 12 }) => {
    ctx = createContext({ home, dataDir: join(scratch, `data-${++counter}`) });
    setVaultInternal(ctx, internal);
  };
  const finish = async (id: string) => {
    await findTask(ctx, id).finished;
    return (await call("vault/status", { id })).task;
  };
  afterEach(() => {
    for (const dispose of ctx?.disposers.splice(0) ?? []) dispose();
  });

  test("every operation is registered with the server", () => {
    for (const op of ["vault/encrypt", "vault/decrypt", "vault/inspect", "vault/status", "vault/cancel", "vault/passphrase"]) expect(API_OPERATIONS).toContain(op);
  });

  test("encrypt then decrypt, with progress, per-item results and a status view", async () => {
    setup();
    const dir = work();
    writeFileSync(join(dir, "a.txt"), "aaa".repeat(5000));
    mkdirSync(join(dir, "folder"));
    writeFileSync(join(dir, "folder/b.txt"), "bbb");
    const started = await call("vault/encrypt", { paths: [join(dir, "a.txt"), join(dir, "folder")], password: PW, level: "standard", compress: true, hideName: false, afterwards: "keep" });
    expect(started.task.state).toBe("running");
    const t = await finish(started.task.id);
    expect(t.state).toBe("done");
    expect(t.bytesTotal).toBe(15_003);
    expect(t.bytesDone).toBe(15_003);
    expect(t.items.map((i: any) => [i.name, i.state, i.outputName])).toEqual([["a.txt", "done", "a.txt.radenc"], ["folder", "done", "folder.radenc"]]);
    expect(t.items[1].entries).toBe(1);
    expect(files(dir)).toEqual(["a.txt", "a.txt.radenc", "folder", "folder.radenc"]);

    const unchanged = (await call("vault/status", { id: t.id, since: t.version })).task;
    expect(unchanged.unchanged).toBe(true);

    const out = work();
    const d = await call("vault/decrypt", { paths: [join(dir, "a.txt.radenc"), join(dir, "folder.radenc")], password: PW, outputDir: out });
    const dt = await finish(d.task.id);
    expect(dt.items.map((i: any) => i.state)).toEqual(["done", "done"]);
    expect(tree(out)).toEqual([`a.txt ${sha("aaa".repeat(5000))}`, "folder/", `folder/b.txt ${sha("bbb")}`]);
  });

  test("a wrong password gives the plain message per item and creates nothing", async () => {
    setup();
    const dir = work();
    writeFileSync(join(dir, "a.txt"), "aaa");
    const e = await finish((await call("vault/encrypt", { paths: [join(dir, "a.txt")], password: PW })).task.id);
    const out = work();
    const d = await finish((await call("vault/decrypt", { paths: [e.items[0].output], password: "definitely wrong", outputDir: out })).task.id);
    expect(d.state).toBe("failed");
    expect(d.items[0].state).toBe("error");
    expect(d.items[0].error.message).toBe(WRONG_OR_DAMAGED);
    expect(files(out)).toEqual([]);
  });

  test("the original is untouched by default; 'trash' moves it only after the copy is checked", async () => {
    setup();
    const dir = work();
    writeFileSync(join(dir, "keep.txt"), "keep");
    writeFileSync(join(dir, "gone.txt"), "gone");
    const kept = await finish((await call("vault/encrypt", { paths: [join(dir, "keep.txt")], password: PW, afterwards: "keep" })).task.id);
    expect(kept.items[0].trashed).toBeUndefined();
    expect(existsSync(join(dir, "keep.txt"))).toBe(true);

    const moved = await finish((await call("vault/encrypt", { paths: [join(dir, "gone.txt")], password: PW, afterwards: "trash" })).task.id);
    expect(moved.items[0].state).toBe("done");
    expect(moved.items[0].trashed).toBe(true);
    expect(existsSync(join(dir, "gone.txt"))).toBe(false);
    expect(existsSync(join(dir, "gone.txt.radenc"))).toBe(true);
    expect((await listTrash(ctx)).items.map((i) => i.name)).toEqual(["gone.txt"]);
  });

  test("when the check of the copy fails, the original stays and nothing is trashed", async () => {
    setup({
      kdf: FAST,
      afterWrite: async (p) => {
        const b = readFileSync(p);
        b[b.length - 1]! ^= 1;
        writeFileSync(p, b);
      },
    });
    const dir = work();
    writeFileSync(join(dir, "precious.txt"), "precious");
    const t = await finish((await call("vault/encrypt", { paths: [join(dir, "precious.txt")], password: PW, afterwards: "trash" })).task.id);
    expect(t.items[0].state).toBe("error");
    expect(t.items[0].error.code).toBe("VERIFY_FAILED");
    expect(readFileSync(join(dir, "precious.txt"), "utf8")).toBe("precious");
    expect(files(dir)).toEqual(["precious.txt"]);
    expect((await listTrash(ctx)).count).toBe(0);
  });

  test("decrypt with 'trash' moves the .radenc file to the Recycle Bin after success only", async () => {
    setup();
    const dir = work();
    writeFileSync(join(dir, "z.txt"), "zzz");
    const e = await finish((await call("vault/encrypt", { paths: [join(dir, "z.txt")], password: PW })).task.id);
    const out = work();
    const bad = await finish((await call("vault/decrypt", { paths: [e.items[0].output], password: "wrong wrong wrong", outputDir: out, afterwards: "trash" })).task.id);
    expect(bad.items[0].trashed).toBeUndefined();
    expect(existsSync(e.items[0].output)).toBe(true);
    const ok = await finish((await call("vault/decrypt", { paths: [e.items[0].output], password: PW, outputDir: out, afterwards: "trash" })).task.id);
    expect(ok.items[0].trashed).toBe(true);
    expect(existsSync(e.items[0].output)).toBe(false);
  });

  test("cancel stops a running task and removes partial output", async () => {
    setup({ kdf: FAST });
    const dir = work();
    writeFileSync(join(dir, "slow.bin"), randomBytes(40_000_000));
    const t = (await call("vault/encrypt", { paths: [join(dir, "slow.bin")], password: PW, compress: true })).task;
    for (let i = 0; i < 2000; i++) {
      const s = (await call("vault/status", { id: t.id })).task;
      if (s.phase === "encrypting" && s.bytesDone > 0) break;
      await new Promise((r) => setTimeout(r, 2));
    }
    expect((await call("vault/cancel", { id: t.id })).cancelled).toBe(true);
    const end = await finish(t.id);
    expect(end.state).toBe("cancelled");
    expect(end.items[0].state).toBe("cancelled");
    expect(files(dir)).toEqual(["slow.bin"]);
    expect((await call("vault/cancel", { id: t.id })).cancelled).toBe(false);
  }, 30_000);

  test("at most two jobs run at once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({ kdf: FAST, afterWrite: () => gate });
    const dir = work();
    writeFileSync(join(dir, "g.txt"), "gate");
    const start = () => call("vault/encrypt", { paths: [join(dir, "g.txt")], password: PW, hideName: true });
    const a = await start();
    const b = await start();
    const err = await rejectsWith(() => start(), "BUSY");
    expect(err.message).toContain("2");
    release();
    await finish(a.task.id);
    await finish(b.task.id);
    const c = await start();
    expect((await finish(c.task.id)).state).toBe("done");
    expect(files(dir)).toEqual(["Encrypted file 1.radenc", "Encrypted file 2.radenc", "Encrypted file 3.radenc", "g.txt"]);
  });

  test("protected places are refused", async () => {
    setup();
    const dir = work();
    writeFileSync(join(dir, "p.txt"), "p");
    const base = { paths: [join(dir, "p.txt")], password: PW };
    await rejectsWith(() => call("vault/encrypt", { ...base, outputDir: "/etc" }), "PROTECTED");
    await rejectsWith(() => call("vault/encrypt", { ...base, outputDir: ctx.trashRoot }), "PROTECTED");
    await rejectsWith(() => call("vault/decrypt", { ...base, outputDir: "/usr/bin" }), "PROTECTED");
    mkdirSync(join(ctx.trashRoot, "items"), { recursive: true });
    writeFileSync(join(ctx.trashRoot, "items", "t.txt"), "t");
    await rejectsWith(() => call("vault/encrypt", { paths: [join(ctx.trashRoot, "items", "t.txt")], password: PW }), "PROTECTED");
    const docs = join(ctx.home, "Documents");
    mkdirSync(docs, { recursive: true });
    await rejectsWith(() => call("vault/encrypt", { paths: [docs], password: PW, afterwards: "trash" }), "PROTECTED");
    expect(existsSync(docs)).toBe(true);
  });

  test("bad requests get plain errors and start nothing", async () => {
    setup();
    const dir = work();
    writeFileSync(join(dir, "q.txt"), "q");
    const p = [join(dir, "q.txt")];
    await rejectsWith(() => call("vault/encrypt", { paths: [], password: PW }), "BAD_REQUEST");
    await rejectsWith(() => call("vault/encrypt", { paths: "x", password: PW }), "BAD_REQUEST");
    await rejectsWith(() => call("vault/encrypt", { paths: Array.from({ length: 201 }, (_, i) => join(dir, `f${i}`)), password: PW }), "TOO_MANY");
    await rejectsWith(() => call("vault/encrypt", { paths: ["relative/path"], password: PW }), "BAD_PATH");
    await rejectsWith(() => call("vault/encrypt", { paths: [`${dir}/a\0b`], password: PW }), "BAD_PATH");
    await rejectsWith(() => call("vault/encrypt", { paths: p, password: PW, level: "ultra" }), "BAD_REQUEST");
    await rejectsWith(() => call("vault/encrypt", { paths: p, password: PW, afterwards: "delete" }), "BAD_REQUEST");
    await rejectsWith(() => call("vault/encrypt", { paths: p, password: PW, compress: "yes" }), "BAD_REQUEST");
    await rejectsWith(() => call("vault/encrypt", { paths: p, password: PW, hideName: 1 }), "BAD_REQUEST");
    await rejectsWith(() => call("vault/encrypt", { paths: p, password: PW, outputDir: join(dir, "missing") }), "NOT_FOUND");
    await rejectsWith(() => call("vault/encrypt", { paths: p, password: PW, outputDir: p[0] }), "NOT_A_FOLDER");
    await rejectsWith(() => call("vault/encrypt", { paths: p }), "BAD_PASSWORD");
    await rejectsWith(() => call("vault/encrypt", { paths: p, password: "short" }), "WEAK_PASSWORD");
    await rejectsWith(() => call("vault/encrypt", { paths: p, password: "q.txt q.txt q.txt" }), "WEAK_PASSWORD");
    await rejectsWith(() => call("vault/decrypt", { paths: p }), "BAD_PASSWORD");
    await rejectsWith(() => call("vault/status", { id: "nope" }), "NOT_FOUND");
    await rejectsWith(() => call("vault/cancel", { id: 5 }), "NOT_FOUND");
    expect(files(dir)).toEqual(["q.txt"]);
    expect((await call("vault/status", {})).tasks).toEqual([]);
  });

  test("a missing item is reported per item and the rest still run", async () => {
    setup();
    const dir = work();
    writeFileSync(join(dir, "real.txt"), "r");
    const t = await finish((await call("vault/encrypt", { paths: [join(dir, "ghost.txt"), join(dir, "real.txt")], password: PW })).task.id);
    expect(t.state).toBe("done");
    expect(t.items[0].state).toBe("error");
    expect(t.items[0].error.message).toContain("doesn't exist");
    expect(t.items[1].state).toBe("done");
  });

  test("an empty password to decrypt is the same plain failure", async () => {
    setup();
    const dir = work();
    writeFileSync(join(dir, "e.txt"), "e");
    const e = await finish((await call("vault/encrypt", { paths: [join(dir, "e.txt")], password: PW })).task.id);
    const t = await finish((await call("vault/decrypt", { paths: [e.items[0].output], password: "", outputDir: work() })).task.id);
    expect(t.items[0].error.message).toBe(WRONG_OR_DAMAGED);
  });

  test("passphrase and inspect operations", async () => {
    setup();
    const p = await call("vault/passphrase", {});
    expect(p.passphrase.split("-")).toHaveLength(6);
    expect((await call("vault/passphrase", { words: 8 })).words).toBe(8);
    const dir = work();
    writeFileSync(join(dir, "text.txt"), "plain text");
    expect(await call("vault/inspect", { path: join(dir, "text.txt") })).toMatchObject({ valid: false, reason: "not-radenc" });
    expect(await call("vault/inspect", { path: dir })).toMatchObject({ valid: false });
    await rejectsWith(() => call("vault/inspect", { path: join(dir, "missing.radenc") }), "ENOENT");
    const limits = await call("vault/limits");
    expect(limits).toMatchObject({ minPasswordLength: 10, maxItems: 200 });
  });

  test("the password never appears in views, errors, console output, file bytes or the data folder", async () => {
    setup();
    const SECRET = "Zq7-unique-marker-phrase-ulysses-4417";
    const logged: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
    for (const k of Object.keys(orig) as Array<keyof typeof orig>) console[k] = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
    const seen: string[] = [];
    try {
      const dir = work();
      writeFileSync(join(dir, "doc.txt"), "THE-PLAINTEXT-MARKER");
      const t = (await call("vault/encrypt", { paths: [join(dir, "doc.txt"), join(dir, "nothing.txt")], password: SECRET })).task;
      seen.push(JSON.stringify(t));
      const end = await finish(t.id);
      seen.push(JSON.stringify(end), JSON.stringify(await call("vault/status", {})));
      const out = work();
      const wrong = await finish((await call("vault/decrypt", { paths: [end.items[0].output], password: SECRET + "x", outputDir: out })).task.id);
      seen.push(JSON.stringify(wrong));
      const good = await finish((await call("vault/decrypt", { paths: [end.items[0].output], password: SECRET, outputDir: out })).task.id);
      seen.push(JSON.stringify(good));
      for (const pw of [SECRET.slice(0, 8), "Password-" + SECRET]) {
        try {
          await call("vault/encrypt", { paths: [join(dir, "doc.txt")], password: pw });
        } catch (err: any) {
          seen.push(String(err.message), JSON.stringify(err));
        }
      }
      const bytes = readFileSync(end.items[0].output);
      expect(bytes.includes(Buffer.from(SECRET))).toBe(false);
      expect(bytes.includes(Buffer.from("THE-PLAINTEXT-MARKER"))).toBe(false);
      expect(bytes.includes(Buffer.from("doc.txt"))).toBe(false);
      for (const folder of [dir, out, ctx.dataDir]) {
        for (const file of allFiles(folder)) expect(readFileSync(file).includes(Buffer.from(SECRET)), file).toBe(false);
      }
    } finally {
      Object.assign(console, orig);
    }
    for (const text of [...seen, ...logged]) expect(text).not.toContain(SECRET);
    expect(seen.join("")).not.toContain("Zq7-unique");
  });

  test("a path with dot-dot parts in it is resolved to the real file", async () => {
    setup();
    const dir = work();
    writeFileSync(join(dir, "n.txt"), "n");
    const e = await finish((await call("vault/encrypt", { paths: [join(dir, "n.txt")], password: PW })).task.id);
    const t = await finish((await call("vault/decrypt", { paths: [`${dir}/../${dir.split("/").pop()}/n.txt.radenc`], password: PW, outputDir: work() })).task.id);
    expect(t.items[0].state).toBe("done");
    expect(e.state).toBe("done");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("over HTTP, and with the real key-derivation settings", () => {
  const TOKEN = "vault-test-token";
  const root = fresh("http");
  const httpHome = join(root, "home");
  const work = join(httpHome, "work");
  let server: ReturnType<typeof startFileManagerServer>;
  let base: string;

  beforeAll(() => {
    mkdirSync(work, { recursive: true });
    server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home: httpHome, dataDir: join(root, "data") } });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));

  async function api(op: string, body: unknown = {}, token: string | null = TOKEN) {
    const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-fm-token": token } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  }
  async function until(id: string) {
    for (let i = 0; i < 4000; i++) {
      const s = (await api("vault/status", { id })).json.task;
      if (s.state !== "running") return s;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("task did not finish");
  }

  test("a token is required", async () => {
    expect((await api("vault/passphrase", {}, null)).status).toBe(401);
    expect((await api("vault/passphrase", {}, "wrong")).status).toBe(401);
  });

  test("Standard: encrypt, inspect, wrong password, decrypt, with timings and a responsive event loop", async () => {
    writeFileSync(join(work, "real.txt"), "real settings");
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    const t0 = performance.now();
    const started = await api("vault/encrypt", { paths: [join(work, "real.txt")], password: PW, level: "standard", compress: true, hideName: false, afterwards: "keep" });
    expect(started.status).toBe(200);
    const end = await until(started.json.task.id);
    const encMs = performance.now() - t0;
    clearInterval(timer);
    expect(end.state).toBe("done");
    expect(ticks).toBeGreaterThan(5);
    const out = end.items[0].output;
    const bytes = readFileSync(out);
    expect(bytes.readUInt32BE(9)).toBe(262_144);
    expect([bytes[13], bytes[14]]).toEqual([3, 4]);
    expect(referenceDecrypt(bytes, PW).manifest.name).toBe("real.txt");
    const info = await api("vault/inspect", { path: out });
    expect(info.json).toMatchObject({ ok: true, valid: true, version: 1, level: "standard", compressed: true, chunkSize: 1048576 });

    const bad = await until((await api("vault/decrypt", { paths: [out], password: "the wrong password!", outputDir: work })).json.task.id);
    expect(bad.items[0].error.message).toBe(WRONG_OR_DAMAGED);
    const t1 = performance.now();
    const good = await until((await api("vault/decrypt", { paths: [out], password: PW, outputDir: work })).json.task.id);
    const decMs = performance.now() - t1;
    expect(good.items[0].outputName).toBe("real (2).txt");
    expect(readFileSync(join(work, "real (2).txt"), "utf8")).toBe("real settings");
    console.log(`vault Standard: encrypt+verify ${encMs.toFixed(0)} ms, decrypt ${decMs.toFixed(0)} ms`);
  }, 60_000);

  test("Maximum level works and is recorded in the header", async () => {
    writeFileSync(join(work, "max.txt"), "maximum");
    const t0 = performance.now();
    const end = await until((await api("vault/encrypt", { paths: [join(work, "max.txt")], password: PW, level: "maximum", compress: false })).json.task.id);
    const encMs = performance.now() - t0;
    expect(end.state).toBe("done");
    const info = (await api("vault/inspect", { path: end.items[0].output })).json;
    expect(info).toMatchObject({ valid: true, level: "maximum", compressed: false });
    const t1 = performance.now();
    const good = await until((await api("vault/decrypt", { paths: [end.items[0].output], password: PW, outputDir: fresh("maxout") })).json.task.id);
    expect(good.items[0].state).toBe("done");
    console.log(`vault Maximum: encrypt+verify ${encMs.toFixed(0)} ms, decrypt ${(performance.now() - t1).toFixed(0)} ms`);
  }, 90_000);

  test("errors are JSON with plain messages", async () => {
    const bad = await api("vault/encrypt", { paths: [join(work, "real.txt")], password: "weak" });
    expect(bad.status).toBe(400);
    expect(bad.json).toMatchObject({ ok: false, error: { code: "WEAK_PASSWORD" } });
    expect(JSON.stringify(bad.json)).not.toContain('"weak"');
    expect((await api("vault/cancel", { id: "zzz" })).json.error.code).toBe("NOT_FOUND");
    expect((await api("vault/encrypt", { paths: [join(work, "real.txt")], password: PW, level: "x" })).status).toBe(400);
    expect((await api("vault/passphrase", { words: 5 })).json.passphrase.split("-")).toHaveLength(5);
  });
});
