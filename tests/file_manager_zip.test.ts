import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as zlib from "zlib";
import { createContext } from "../src/features/filemanager/fmCore";
import { createZip, extractZip, safeEntryPath } from "../src/features/filemanager/fmZip";

const posix = process.platform !== "win32";
const hasTool = (name: string) => !!Bun.which(name);
const roots: string[] = [];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "fm-zip-"));
  roots.push(root);
  const home = join(root, "home");
  const work = join(root, "work");
  mkdirSync(home);
  mkdirSync(work);
  return { root, work, ctx: createContext({ home, dataDir: join(root, "data") }) };
}
const put = (path: string, content: string | Buffer = "x") => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
};

/** A snapshot of a folder: relative path -> file content (or null for folders). */
function snapshot(dir: string, base = dir, out: Record<string, string | null> = {}) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = full.slice(base.length + 1).split("\\").join("/");
    if (lstatSync(full).isDirectory()) {
      out[`${rel}/`] = null;
      snapshot(full, base, out);
    } else out[rel] = readFileSync(full).toString("base64");
  }
  return out;
}

interface RawEntry {
  name: string;
  data?: Buffer;
  method?: number;
  flags?: number;
  crc?: number;
  usize?: number;
  csize?: number;
  mode?: number;
}

/** Builds a zip file byte by byte, so tests can make archives that a normal zip program never would. */
function buildZip(entries: RawEntry[], tweak: { zip64?: boolean; count?: number } = {}): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const data = e.data ?? Buffer.alloc(0);
    const method = e.method ?? 8;
    const payload = method === 8 ? zlib.deflateRawSync(data) : data;
    const crc = e.crc ?? zlib.crc32(data);
    const csize = e.csize ?? payload.length;
    const usize = e.usize ?? data.length;
    const name = Buffer.from(e.name, "utf8");
    const flags = (e.flags ?? 0) | 0x800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(csize, 18);
    local.writeUInt32LE(usize, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, payload);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE((3 << 8) | 20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(flags, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt32LE(crc >>> 0, 16);
    cd.writeUInt32LE(csize, 20);
    cd.writeUInt32LE(usize, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE((((e.mode ?? 0o100644) << 16) | (e.name.endsWith("/") ? 0x10 : 0)) >>> 0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + payload.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  const count = tweak.count ?? entries.length;
  end.writeUInt16LE(tweak.zip64 ? 0xffff : count, 8);
  end.writeUInt16LE(tweak.zip64 ? 0xffff : count, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

describe("createZip", () => {
  test("zips a folder tree and extracting it gives back exactly the same tree", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "Photos", "a.txt"), "alpha");
    put(join(work, "Photos", "sub dir", "b.bin"), Buffer.from([0, 1, 2, 255, 254]));
    put(join(work, "Photos", "日本語 ñ.txt"), "unicode");
    put(join(work, "Photos", "empty.txt"), "");
    mkdirSync(join(work, "Photos", "empty folder"));
    const big = Buffer.alloc(1_500_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31 + (i >> 8)) & 255;
    put(join(work, "Photos", "big.dat"), big);

    const made = await createZip(ctx, [join(work, "Photos")]);
    expect(made.zipPath).toBe(join(work, "Photos.zip"));
    expect(made).toMatchObject({ files: 5, folders: 3, skippedLinks: 0 }); // 3 folders: Photos itself, "sub dir", "empty folder"
    expect(made.bytes).toBe(5 + 5 + 7 + 0 + 1_500_000);

    const out = join(work, "out");
    mkdirSync(out);
    const extracted = await extractZip(ctx, made.zipPath, out);
    expect(extracted.folder).toBe(join(out, "Photos"));
    expect(extracted).toMatchObject({ files: 5, folders: 3, skipped: [] });
    expect(snapshot(join(out, "Photos", "Photos"))).toEqual(snapshot(join(work, "Photos")));
  });

  test("names: one source uses its name, several use 'Archive', a custom name works, taken names get a number", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    put(join(work, "b.txt"));
    expect((await createZip(ctx, [join(work, "a.txt")])).zipPath).toBe(join(work, "a.zip"));
    expect((await createZip(ctx, [join(work, "a.txt")])).zipPath).toBe(join(work, "a (2).zip"));
    expect((await createZip(ctx, [join(work, "a.txt"), join(work, "b.txt")])).zipPath).toBe(join(work, "Archive.zip"));
    expect((await createZip(ctx, [join(work, "a.txt")], "My backup.zip")).zipPath).toBe(join(work, "My backup.zip"));
    await expect(createZip(ctx, [join(work, "a.txt")], "bad/name")).rejects.toMatchObject({ code: "BAD_NAME" });
    expect(readdirSync(work).filter((n) => n.includes("fm-tmp"))).toEqual([]);
  });

  test("refuses items from different folders, nothing selected, missing items; leaves no partial file", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a", "x.txt"));
    put(join(work, "b", "y.txt"));
    await expect(createZip(ctx, [join(work, "a", "x.txt"), join(work, "b", "y.txt")])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createZip(ctx, [])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(createZip(ctx, [join(work, "a", "missing.txt")])).rejects.toMatchObject({ code: "ENOENT" });
    expect(readdirSync(join(work, "a"))).toEqual(["x.txt"]);
    expect(readdirSync(work).sort()).toEqual(["a", "b"]);
  });

  test.skipIf(!posix)("links inside are left out and counted, never followed", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "outside", "secret.txt"), "SECRET");
    put(join(work, "d", "keep.txt"), "K");
    symlinkSync(join(work, "outside"), join(work, "d", "link"));
    const made = await createZip(ctx, [join(work, "d")]);
    expect(made.skippedLinks).toBe(1);
    const out = join(work, "out");
    mkdirSync(out);
    await extractZip(ctx, made.zipPath, out);
    expect(snapshot(join(out, "d", "d"))).toEqual({ "keep.txt": Buffer.from("K").toString("base64") });
  });

  test("keeps modified times (to the 2 seconds a zip file can store)", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    const when = new Date(2021, 4, 6, 7, 8, 10);
    utimesSync(join(work, "a.txt"), when, when);
    const made = await createZip(ctx, [join(work, "a.txt")]);
    mkdirSync(join(work, "o"));
    const ex = await extractZip(ctx, made.zipPath, join(work, "o"));
    expect(Math.abs(statSync(join(ex.folder, "a.txt")).mtimeMs - when.getTime())).toBeLessThanOrEqual(2000);
  });

  test.skipIf(!posix)("keeps the executable bit", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "run.sh"), "#!/bin/sh\n");
    chmodSync(join(work, "run.sh"), 0o755);
    const made = await createZip(ctx, [join(work, "run.sh")]);
    mkdirSync(join(work, "o"));
    const ex = await extractZip(ctx, made.zipPath, join(work, "o"));
    expect(statSync(join(ex.folder, "run.sh")).mode & 0o777).toBe(0o755);
  });
});

describe("works with other zip programs", () => {
  test.skipIf(!hasTool("unzip"))("the system's unzip accepts our archives (integrity test and listing)", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "T", "one.txt"), "1".repeat(5000));
    put(join(work, "T", "d", "two.txt"), "two");
    put(join(work, "T", "empty.txt"), "");
    mkdirSync(join(work, "T", "emptydir"));
    const made = await createZip(ctx, [join(work, "T")]);
    const test = Bun.spawnSync(["unzip", "-t", made.zipPath], { stdout: "pipe", stderr: "pipe" });
    expect(test.exitCode, test.stdout.toString() + test.stderr.toString()).toBe(0);
    expect(test.stdout.toString()).toContain("No errors detected");
    const list = Bun.spawnSync(["unzip", "-Z1", made.zipPath], { stdout: "pipe" }).stdout.toString().trim().split("\n").sort();
    expect(list).toEqual(["T/", "T/d/", "T/d/two.txt", "T/emptydir/", "T/empty.txt", "T/one.txt"].sort());
    const out = join(work, "sys-out");
    mkdirSync(out);
    expect(Bun.spawnSync(["unzip", "-q", made.zipPath, "-d", out]).exitCode).toBe(0);
    expect(snapshot(join(out, "T"))).toEqual(snapshot(join(work, "T")));
  });

  test.skipIf(!hasTool("zip"))("we can extract archives made by the system's zip program", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "src", "a.txt"), "hello ".repeat(2000));
    put(join(work, "src", "sub", "b.txt"), "b");
    put(join(work, "src", "empty.txt"), "");
    mkdirSync(join(work, "src", "emptydir"));
    if (posix) {
      put(join(work, "src", "run.sh"), "#!/bin/sh\n");
      chmodSync(join(work, "src", "run.sh"), 0o755);
    }
    const made = Bun.spawnSync(["zip", "-r", "-q", join(work, "system.zip"), "src"], { cwd: work });
    expect(made.exitCode).toBe(0);
    mkdirSync(join(work, "o"));
    const ex = await extractZip(ctx, join(work, "system.zip"), join(work, "o"));
    expect(ex.skipped).toEqual([]);
    expect(snapshot(join(ex.folder, "src"))).toEqual(snapshot(join(work, "src")));
    if (posix) expect(statSync(join(ex.folder, "src", "run.sh")).mode & 0o111).not.toBe(0);
  });
});

describe("extractZip", () => {
  test("goes into a new folder named after the zip, never overwriting anything", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "A");
    const made = await createZip(ctx, [join(work, "a.txt")]);
    const first = await extractZip(ctx, made.zipPath);
    expect(first.folder).toBe(join(work, "a"));
    const second = await extractZip(ctx, made.zipPath);
    expect(second.folder).toBe(join(work, "a (2)"));
    expect(readFileSync(join(first.folder, "a.txt"), "utf8")).toBe("A");
  });

  test("a file that isn't a zip, a truncated zip and an empty file are explained and leave nothing behind", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "notzip.zip"), "this is just text");
    put(join(work, "empty.zip"), "");
    const real = buildZip([{ name: "a.txt", data: Buffer.from("hello") }]);
    writeFileSync(join(work, "cut.zip"), real.subarray(0, real.length - 30));
    for (const n of ["notzip.zip", "empty.zip", "cut.zip"]) {
      await expect(extractZip(ctx, join(work, n))).rejects.toMatchObject({ code: "BAD_ZIP" });
    }
    expect(readdirSync(work).sort()).toEqual(["cut.zip", "empty.zip", "notzip.zip"]);
    await expect(extractZip(ctx, join(work, "missing.zip"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("names that try to escape the target folder are skipped, and nothing is written outside", async () => {
    const { ctx, work } = sandbox();
    const evil = buildZip([
      { name: "../evil1.txt", data: Buffer.from("x") },
      { name: "a/../../evil2.txt", data: Buffer.from("x") },
      { name: "/abs-evil.txt", data: Buffer.from("x") },
      { name: "C:\\win-evil.txt", data: Buffer.from("x") },
      { name: "..\\evil3.txt", data: Buffer.from("x") },
      { name: "good/ok.txt", data: Buffer.from("fine") },
    ]);
    writeFileSync(join(work, "evil.zip"), evil);
    mkdirSync(join(work, "dest"));
    const ex = await extractZip(ctx, join(work, "evil.zip"), join(work, "dest"));
    expect(ex.files).toBe(1);
    expect(ex.skipped.length).toBe(5);
    expect(ex.skipped.join("\n")).toContain("leave the folder");
    expect(readFileSync(join(ex.folder, "good", "ok.txt"), "utf8")).toBe("fine");
    expect(readdirSync(join(work, "dest"))).toEqual(["evil"]);
    expect(readdirSync(work).sort()).toEqual(["dest", "evil.zip"]);
    expect(existsSync(join(ex.folder, "..", "evil1.txt"))).toBe(false);
  });

  test("links inside an archive are not created", async () => {
    const { ctx, work } = sandbox();
    writeFileSync(join(work, "link.zip"), buildZip([{ name: "l", data: Buffer.from("/etc/passwd"), mode: 0o120777 }, { name: "f.txt", data: Buffer.from("F") }]));
    const ex = await extractZip(ctx, join(work, "link.zip"));
    expect(readdirSync(ex.folder)).toEqual(["f.txt"]);
    expect(ex.skipped.join("")).toContain("links inside zip files");
  });

  test("password-protected, unsupported-method and ZIP64 archives are refused with a clear message", async () => {
    const { ctx, work } = sandbox();
    writeFileSync(join(work, "enc.zip"), buildZip([{ name: "a.txt", data: Buffer.from("x"), flags: 1 }]));
    writeFileSync(join(work, "method.zip"), buildZip([{ name: "a.txt", data: Buffer.from("x"), method: 14 }]));
    writeFileSync(join(work, "z64.zip"), buildZip([{ name: "a.txt", data: Buffer.from("x") }], { zip64: true }));
    await expect(extractZip(ctx, join(work, "enc.zip"))).rejects.toMatchObject({ code: "ENCRYPTED" });
    await expect(extractZip(ctx, join(work, "method.zip"))).rejects.toMatchObject({ code: "UNSUPPORTED" });
    await expect(extractZip(ctx, join(work, "z64.zip"))).rejects.toMatchObject({ code: "ZIP64" });
    expect(readdirSync(work).filter((n) => !n.endsWith(".zip"))).toEqual([]);
  });

  test("a wrong checksum, or a file bigger than the archive claims (zip bomb), is rejected and the half-made folder removed", async () => {
    const { ctx, work } = sandbox();
    writeFileSync(join(work, "crc.zip"), buildZip([{ name: "ok.txt", data: Buffer.from("fine") }, { name: "a.txt", data: Buffer.from("hello"), crc: 12345 }]));
    await expect(extractZip(ctx, join(work, "crc.zip"))).rejects.toMatchObject({ code: "BAD_ZIP", message: expect.stringContaining("checksum") });
    const big = Buffer.alloc(100_000, 97);
    writeFileSync(join(work, "bomb.zip"), buildZip([{ name: "b.txt", data: big, usize: 10 }]));
    await expect(extractZip(ctx, join(work, "bomb.zip"))).rejects.toMatchObject({ code: "BAD_ZIP", message: expect.stringContaining("larger than") });
    expect(readdirSync(work).filter((n) => !n.endsWith(".zip"))).toEqual([]);
  });

  test("limits on the number of items and on total size are enforced", async () => {
    const { ctx, work } = sandbox();
    writeFileSync(join(work, "many.zip"), buildZip(Array.from({ length: 20 }, (_, i) => ({ name: `f${i}.txt`, data: Buffer.from("x") }))));
    await expect(extractZip(ctx, join(work, "many.zip"), undefined, { maxEntries: 10, maxTotalBytes: 1e9 })).rejects.toMatchObject({ code: "TOO_MANY" });
    writeFileSync(join(work, "size.zip"), buildZip([{ name: "a.txt", data: Buffer.alloc(5000, 1) }, { name: "b.txt", data: Buffer.alloc(5000, 2) }]));
    await expect(extractZip(ctx, join(work, "size.zip"), undefined, { maxEntries: 100, maxTotalBytes: 6000 })).rejects.toMatchObject({ code: "TOO_BIG" });
    expect(readdirSync(work).filter((n) => !n.endsWith(".zip"))).toEqual([]);
  });

  test("a write error part-way (the same name twice in one archive) is a clean error, not a crash, and is cleaned up", async () => {
    const { ctx, work } = sandbox();
    writeFileSync(join(work, "dup.zip"), buildZip([{ name: "a.txt", data: Buffer.from("one") }, { name: "a.txt", data: Buffer.from("two") }]));
    const unhandled: unknown[] = [];
    const onError = (e: unknown) => unhandled.push(e);
    process.on("uncaughtException", onError);
    try {
      await expect(extractZip(ctx, join(work, "dup.zip"))).rejects.toMatchObject({ code: "EEXIST" });
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      process.off("uncaughtException", onError);
    }
    expect(unhandled).toEqual([]);
    expect(readdirSync(work)).toEqual(["dup.zip"]);
  });

  test("backslash separators from Windows archivers become folders", async () => {
    const { ctx, work } = sandbox();
    writeFileSync(join(work, "win.zip"), buildZip([{ name: "dir\\sub\\file.txt", data: Buffer.from("W") }]));
    const ex = await extractZip(ctx, join(work, "win.zip"));
    expect(readFileSync(join(ex.folder, "dir", "sub", "file.txt"), "utf8")).toBe("W");
  });
});

describe("safeEntryPath", () => {
  test("accepts normal paths and explains what it skips", () => {
    expect(safeEntryPath("a/b/c.txt", "linux")).toEqual({ path: ["a", "b", "c.txt"] });
    expect(safeEntryPath("./a//b/", "linux")).toEqual({ path: ["a", "b"] });
    expect(safeEntryPath("../x", "linux")).toEqual({ skip: expect.stringContaining("leave") });
    expect(safeEntryPath("/x", "linux")).toEqual({ skip: expect.stringContaining("absolute") });
    expect(safeEntryPath("c:/x", "linux")).toEqual({ skip: expect.stringContaining("absolute") });
    expect(safeEntryPath("", "linux")).toEqual({ skip: expect.stringContaining("no name") });
    expect(safeEntryPath("a/CON/b", "win32")).toEqual({ skip: expect.stringContaining("can't be used") });
    expect(safeEntryPath("a/CON/b", "linux")).toEqual({ path: ["a", "CON", "b"] });
    expect(safeEntryPath("what?.txt", "win32")).toEqual({ skip: expect.stringContaining("can't be used") });
  });
});
