/**
 * Zstandard built in: .zst files and .tar.zst archives are made and opened with no program installed. Round trips,
 * levels, damaged and cut-short input explained in plain words, the decompression-bomb cap, bounded memory, and files
 * made by the real zstd / tar programs when they are installed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, promises as fsp, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { once } from "events";
import { planConvert, startConvert } from "../src/features/filemanager/fmBatch";
import { CATALOG_BY_ID } from "../src/features/filemanager/fmConvCatalog";
import { createTarZstFrom, extractTarGz, tarGzToZip, unzstdFile, zstdFile } from "../src/features/filemanager/fmConvArchive";
import { createContext } from "../src/features/filemanager/fmCore";
import { readCentralDirectory } from "../src/features/filemanager/fmZip";

const root = mkdtempSync(join(tmpdir(), "fm-zstd-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const posix = process.platform !== "win32";
let n = 0;
const fresh = (name = "d") => {
  const d = join(root, `${name}-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};
const MiB = 1024 * 1024;
const text = (bytes: number) => Buffer.from("The quick brown fox jumps over the lazy dog. 0123456789\n".repeat(Math.ceil(bytes / 56)).slice(0, bytes));
const random = (bytes: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(bytes)));
const failure = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
  } catch (err: any) {
    return String(err.message);
  }
  throw new Error("expected a failure");
};
const which = (name: string) => Bun.which(name);
const tarEnv = { ...process.env, COPYFILE_DISABLE: "1" };

/** A file of `megabytes` of compressible text (or zeros), written in pieces so the test itself stays small. */
async function bigFile(path: string, megabytes: number, zeros = false): Promise<void> {
  const out = createWriteStream(path);
  const piece = zeros ? Buffer.alloc(MiB) : text(MiB);
  for (let i = 0; i < megabytes; i++) if (!out.write(piece)) await once(out, "drain");
  out.end();
  await once(out, "finish");
}

describe("a single .zst file", () => {
  test("round trips: small, one byte, and several megabytes", async () => {
    const d = fresh();
    for (const [name, data] of [["small.txt", Buffer.from("hello, zstd\n")], ["one.bin", Buffer.from([7])], ["multi.txt", text(5 * MiB + 123)]] as const) {
      writeFileSync(join(d, name), data);
      await zstdFile(join(d, name), join(d, `${name}.zst`));
      await unzstdFile(join(d, `${name}.zst`), join(d, `${name}.out`));
      expect(readFileSync(join(d, `${name}.out`)).equals(data), name).toBe(true);
    }
    expect(statSync(join(d, "multi.txt.zst")).size).toBeLessThan(statSync(join(d, "multi.txt")).size / 20);
  });

  test("random (incompressible) data and an empty file work too", async () => {
    const d = fresh();
    const data = random(300_000);
    writeFileSync(join(d, "r.bin"), data);
    writeFileSync(join(d, "e.bin"), "");
    await zstdFile(join(d, "r.bin"), join(d, "r.zst"));
    await unzstdFile(join(d, "r.zst"), join(d, "r.out"));
    expect(readFileSync(join(d, "r.out")).equals(data)).toBe(true);
    await zstdFile(join(d, "e.bin"), join(d, "e.zst"));
    await unzstdFile(join(d, "e.zst"), join(d, "e.out"));
    expect(readFileSync(join(d, "e.out")).length).toBe(0);
  });

  test("the level option changes the size: a higher level is not bigger on compressible data, and the levels round-trip", async () => {
    const d = fresh();
    const data = Buffer.concat([text(400_000), random(20_000), text(400_000)]);
    writeFileSync(join(d, "x.bin"), data);
    const sizes: number[] = [];
    for (const level of [1, 3, 9, 19]) {
      await zstdFile(join(d, "x.bin"), join(d, `x${level}.zst`), level);
      sizes.push(statSync(join(d, `x${level}.zst`)).size);
    }
    expect(sizes[3]!).toBeLessThanOrEqual(sizes[0]!);
    expect(new Set(sizes).size).toBeGreaterThan(1);
    for (const level of [1, 19]) {
      await unzstdFile(join(d, `x${level}.zst`), join(d, `y${level}`));
      expect(readFileSync(join(d, `y${level}`)).equals(data)).toBe(true);
    }
  });

  test("an existing output is never replaced", async () => {
    const d = fresh();
    writeFileSync(join(d, "a.txt"), "a");
    writeFileSync(join(d, "a.txt.zst"), "mine");
    await expect(zstdFile(join(d, "a.txt"), join(d, "a.txt.zst"))).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(join(d, "a.txt.zst"), "utf8")).toBe("mine");
  });

  test("not a zstd file, and a file cut short, are explained in plain words and leave nothing behind", async () => {
    const d = fresh();
    writeFileSync(join(d, "fake.zst"), "this is just text, not compressed data at all");
    expect(await failure(() => unzstdFile(join(d, "fake.zst"), join(d, "fake.out")))).toBe("This file is damaged or isn't the kind of file it says it is.");
    expect(existsSync(join(d, "fake.out"))).toBe(false);

    await bigFile(join(d, "big.txt"), 3);
    await zstdFile(join(d, "big.txt"), join(d, "big.zst"));
    const whole = readFileSync(join(d, "big.zst"));
    for (const keep of [5, 20, Math.floor(whole.length / 2), whole.length - 1, whole.length - 5]) {
      writeFileSync(join(d, "cut.zst"), whole.subarray(0, keep));
      const message = await failure(() => unzstdFile(join(d, "cut.zst"), join(d, `cut-${keep}.out`)));
      expect(message, `cut at ${keep}`).toMatch(/cut short|damaged/);
      expect(existsSync(join(d, `cut-${keep}.out`)), `cut at ${keep}`).toBe(false);
    }
    writeFileSync(join(d, "empty.zst"), "");
    expect(await failure(() => unzstdFile(join(d, "empty.zst"), join(d, "empty.out")))).toMatch(/empty/);
  });

  test("a flipped byte is caught by the checksum", async () => {
    const d = fresh();
    writeFileSync(join(d, "t.txt"), text(300_000));
    await zstdFile(join(d, "t.txt"), join(d, "t.zst"));
    const bytes = readFileSync(join(d, "t.zst"));
    bytes[Math.floor(bytes.length / 2)]! ^= 0xff;
    writeFileSync(join(d, "bad.zst"), bytes);
    expect(await failure(() => unzstdFile(join(d, "bad.zst"), join(d, "bad.out")))).toMatch(/damaged/);
    expect(existsSync(join(d, "bad.out"))).toBe(false);
  });

  test("a decompression bomb is stopped at the limit with a clear message", async () => {
    const d = fresh();
    await bigFile(join(d, "z.bin"), 24, true);
    await zstdFile(join(d, "z.bin"), join(d, "z.zst"));
    expect(statSync(join(d, "z.zst")).size).toBeLessThan(MiB / 4);
    const message = await failure(() => unzstdFile(join(d, "z.zst"), join(d, "z.out"), 4 * MiB));
    expect(message).toBe("This file would be bigger than the safety limit (4 MB) once unpacked, so it was stopped.");
    expect(existsSync(join(d, "z.out"))).toBe(false);
    await unzstdFile(join(d, "z.zst"), join(d, "z.ok"), 25 * MiB);
    expect(statSync(join(d, "z.ok")).size).toBe(24 * MiB);
  });

  test("big files are streamed: memory does not grow with the file size", async () => {
    const d = fresh();
    await bigFile(join(d, "large.txt"), 160);
    const base = process.memoryUsage().rss;
    let peak = base;
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 15);
    try {
      await zstdFile(join(d, "large.txt"), join(d, "large.zst"));
      await unzstdFile(join(d, "large.zst"), join(d, "large.out"));
    } finally {
      clearInterval(timer);
    }
    expect(statSync(join(d, "large.out")).size).toBe(160 * MiB);
    expect(peak - base, `rss grew by ${Math.round((peak - base) / MiB)} MB`).toBeLessThan(110 * MiB);
  }, 60_000);

  const zstd = which("zstd");
  (zstd ? test : test.skip)("files made by the real zstd program open here, and ours pass `zstd -t`", async () => {
    const d = fresh();
    const data = Buffer.concat([text(2 * MiB), random(50_000)]);
    writeFileSync(join(d, "f.bin"), data);
    for (const args of [["-1"], ["-19"], ["--no-check"], ["--long=27"]]) {
      expect(spawnSync(zstd!, ["-q", "-f", ...args, join(d, "f.bin"), "-o", join(d, "f.zst")]).status).toBe(0);
      await unzstdFile(join(d, "f.zst"), join(d, "f.out"));
      expect(readFileSync(join(d, "f.out")).equals(data), args.join(" ")).toBe(true);
      rmSync(join(d, "f.out"));
    }
    await zstdFile(join(d, "f.bin"), join(d, "ours.zst"), 5);
    expect(spawnSync(zstd!, ["-q", "-t", join(d, "ours.zst")]).status).toBe(0);
    // two frames in a row (as `cat a.zst b.zst` makes) are one stream
    writeFileSync(join(d, "two.zst"), Buffer.concat([readFileSync(join(d, "ours.zst")), readFileSync(join(d, "ours.zst"))]));
    await unzstdFile(join(d, "two.zst"), join(d, "two.out"));
    expect(statSync(join(d, "two.out")).size).toBe(data.length * 2);
  });

  (zstd ? test : test.skip)("a file made with a huge window is either opened or refused politely, never crashing", async () => {
    const d = fresh();
    writeFileSync(join(d, "w.bin"), Buffer.concat([text(MiB), random(MiB), text(MiB)]));
    const made = spawnSync(zstd!, ["-q", "-f", "--ultra", "-22", "--long=31", join(d, "w.bin"), "-o", join(d, "w.zst")]);
    if (made.status !== 0) return;
    const outcome = await failure(async () => {
      await unzstdFile(join(d, "w.zst"), join(d, "w.out"));
      throw new Error("opened");
    });
    expect(outcome === "opened" || /needs more memory|damaged/.test(outcome)).toBe(true);
  });
});

describe(".tar.zst archives", () => {
  function sample(d: string) {
    mkdirSync(join(d, "src", "sub"), { recursive: true });
    writeFileSync(join(d, "src", "a.txt"), "alpha");
    writeFileSync(join(d, "src", "sub", "b.bin"), text(200_000));
    writeFileSync(join(d, "src", "sub", "é ü.txt"), "unicode name");
  }

  test("made here, unpacked here: same files, and the file starts with the zstd marker", async () => {
    const d = fresh();
    sample(d);
    const made = await createTarZstFrom([join(d, "src")], join(d, "pack.tar.zst"), undefined, 5);
    expect(made.files).toBe(3);
    expect([...readFileSync(join(d, "pack.tar.zst")).subarray(0, 4)]).toEqual([0x28, 0xb5, 0x2f, 0xfd]);
    mkdirSync(join(d, "out"));
    const r = await extractTarGz(join(d, "pack.tar.zst"), join(d, "out"), "linux");
    expect(r.files).toBe(3);
    expect(readFileSync(join(d, "out", "src", "a.txt"), "utf8")).toBe("alpha");
    expect(readFileSync(join(d, "out", "src", "sub", "é ü.txt"), "utf8")).toBe("unicode name");
    expect(readFileSync(join(d, "out", "src", "sub", "b.bin")).equals(text(200_000))).toBe(true);
  });

  const system = posix ? which("tar") : null;
  (system && which("zstd") ? test : test.skip)("a .tar.zst made by the system tar opens here; ours opens with the system tar", async () => {
    const d = fresh();
    sample(d);
    const make = spawnSync(system!, ["--zstd", "-cf", join(d, "sys.tar.zst"), "-C", d, "src"], { env: tarEnv });
    if (make.status !== 0) return; // this tar has no zstd support
    mkdirSync(join(d, "o1"));
    expect((await extractTarGz(join(d, "sys.tar.zst"), join(d, "o1"), "linux")).files).toBeGreaterThanOrEqual(3);
    expect(readFileSync(join(d, "o1", "src", "a.txt"), "utf8")).toBe("alpha");
    await createTarZstFrom([join(d, "src")], join(d, "ours.tar.zst"));
    mkdirSync(join(d, "o2"));
    expect(spawnSync(system!, ["--zstd", "-xf", join(d, "ours.tar.zst"), "-C", join(d, "o2")]).status).toBe(0);
    expect(readFileSync(join(d, "o2", "src", "sub", "b.bin")).equals(text(200_000))).toBe(true);
  });

  test("a cut-short .tar.zst is explained, and an archive bomb is stopped", async () => {
    const d = fresh();
    sample(d);
    await createTarZstFrom([join(d, "src")], join(d, "p.tar.zst"));
    const whole = readFileSync(join(d, "p.tar.zst"));
    writeFileSync(join(d, "cut.tar.zst"), whole.subarray(0, whole.length - 8));
    mkdirSync(join(d, "o"));
    expect(await failure(() => extractTarGz(join(d, "cut.tar.zst"), join(d, "o"), "linux"))).toMatch(/cut short|damaged/);
    mkdirSync(join(d, "big"));
    writeFileSync(join(d, "big", "zeros"), Buffer.alloc(20 * MiB));
    await createTarZstFrom([join(d, "big")], join(d, "bomb.tar.zst"));
    expect(statSync(join(d, "bomb.tar.zst")).size).toBeLessThan(MiB);
    mkdirSync(join(d, "o3"));
    expect(await failure(() => extractTarGz(join(d, "bomb.tar.zst"), join(d, "o3"), "linux", { maxBytes: 2 * MiB, maxEntries: 100 }))).toMatch(/safety limit/);
  });

  test("a .tar.zst converts to a zip without unpacking to disk", async () => {
    const d = fresh();
    sample(d);
    await createTarZstFrom([join(d, "src")], join(d, "p.tar.zst"));
    const r = await tarGzToZip(join(d, "p.tar.zst"), join(d, "p.zip"), "linux");
    expect(r.files).toBe(3);
    const h = await fsp.open(join(d, "p.zip"), "r");
    const names = (await readCentralDirectory(h, statSync(join(d, "p.zip")).size)).map((e) => e.name);
    await h.close();
    expect(names).toContain("src/a.txt");
  });
});

(posix ? describe : describe.skip)("zstd actions in the Convert window (no helper program installed)", () => {
  const home = join(root, "job-home");
  const work = join(home, "Docs");
  const ctx = createContext({ platform: "darwin", home, dataDir: join(root, "job-data"), toolDirs: [join(root, "no-tools")] });
  beforeAll(() => mkdirSync(work, { recursive: true }));
  const run = async (req: Parameters<typeof startConvert>[1], state: "done" | "failed" = "done") => {
    const done = await ctx.jobs.whenDone((await startConvert(ctx, req)).id);
    if (done.state !== state) throw new Error(`job ${done.state}: ${done.steps.map((s) => s.message).join(" | ")}`);
    return done;
  };
  const noLeftovers = (dir: string) => expect(readdirSync(dir).filter((x) => x.startsWith(".fm-")), "temporary files").toEqual([]);

  test("the actions exist in the Archives group and use only the built-in engine", () => {
    for (const id of ["arc-zstd", "arc-unzstd", "arc-tarzst"]) {
      const def = CATALOG_BY_ID.get(id)!;
      expect(def.group).toBe("Archives");
      expect(def.engines.every((e) => e.tool === "builtin")).toBe(true);
    }
    expect(CATALOG_BY_ID.get("arc-zstd")!.options!.find((o) => o.id === "level")).toMatchObject({ min: 1, max: 19, default: 3 });
    expect(CATALOG_BY_ID.get("arc-gzip")!.options!.find((o) => o.id === "level")).toMatchObject({ min: 1, max: 9, default: 6 });
    expect(CATALOG_BY_ID.get("arc-targz")!.options!.find((o) => o.id === "level")).toMatchObject({ min: 1, max: 9, default: 6 });
    expect(CATALOG_BY_ID.get("arc-tarzst")!.options!.find((o) => o.id === "level")).toMatchObject({ min: 1, max: 19, default: 3 });
    expect(CATALOG_BY_ID.get("arc-decompress")!.inputs!.has("zst")).toBe(false);
    // the unpack action tries the built-in reader for .tar.zst before any program
    const extract = CATALOG_BY_ID.get("arc-extract")!;
    expect(extract.engines.find((e) => e.accepts?.has("tar.zst"))!.tool).toBe("builtin");
  });

  test("compress, open and name the files: .zst is added and removed, and nothing is overwritten", async () => {
    const d = join(work, "zst-jobs");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "notes.txt"), text(100_000));
    const one = await run({ action: "arc-zstd", paths: [join(d, "notes.txt")], options: { level: 19 } });
    expect(one.outputs).toEqual([join(d, "notes.txt.zst")]);
    const again = await run({ action: "arc-zstd", paths: [join(d, "notes.txt")] });
    expect(again.outputs).toEqual([join(d, "notes.txt (2).zst")]);
    expect(statSync(join(d, "notes.txt.zst")).size).toBeLessThanOrEqual(statSync(join(d, "notes.txt (2).zst")).size);
    const opened = await run({ action: "arc-unzstd", paths: [join(d, "notes.txt.zst")] });
    expect(basename(opened.outputs[0]!)).not.toBe("notes.txt"); // that name is taken: the original is untouched
    expect(readFileSync(opened.outputs[0]!).equals(text(100_000))).toBe(true);
    noLeftovers(d);
  });

  test("a level beyond the range is clamped, text is refused, and the gzip level works", async () => {
    const d = join(work, "zst-level");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "a.txt"), text(50_000));
    await run({ action: "arc-zstd", paths: [join(d, "a.txt")], options: { level: 99 } });
    await expect(startConvert(ctx, { action: "arc-zstd", paths: [join(d, "a.txt")], options: { level: "fast" } })).rejects.toMatchObject({ code: "BAD_OPTION" });
    const gz = await run({ action: "arc-gzip", paths: [join(d, "a.txt")], options: { level: 1 } });
    expect(gz.outputs).toEqual([join(d, "a.txt.gz")]);
    const small = statSync(join(d, "a.txt.gz")).size;
    const best = await run({ action: "arc-gzip", paths: [join(d, "a.txt")], options: { level: 9 } });
    expect(statSync(best.outputs[0]!).size).toBeLessThanOrEqual(small);
  });

  test("a corrupt .zst is a plain failure: no output and a readable reason", async () => {
    const d = join(work, "zst-bad");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "bad.zst"), "not really zstd");
    const done = await run({ action: "arc-unzstd", paths: [join(d, "bad.zst")] }, "failed");
    expect(done.steps[0]!.message).toBe("This file is damaged or isn't the kind of file it says it is.");
    expect(readdirSync(d)).toEqual(["bad.zst"]);
  });

  test(".tar.zst is packed and unpacked through the jobs, built in (no bsdtar, 7-Zip or unar needed)", async () => {
    const d = join(work, "tarzst");
    mkdirSync(join(d, "docs"), { recursive: true });
    writeFileSync(join(d, "docs", "readme.txt"), "read me");
    writeFileSync(join(d, "one.txt"), "1");
    const packed = await run({ action: "arc-tarzst", paths: [join(d, "docs"), join(d, "one.txt")], options: { level: 7 } });
    expect(packed.outputs).toEqual([join(d, "Archive.tar.zst")]);
    const plan = await planConvert(ctx, { action: "arc-extract", paths: [join(d, "Archive.tar.zst")] });
    expect(plan.items[0]!.engine!.tool).toBe("builtin");
    const unpacked = await run({ action: "arc-extract", paths: [join(d, "Archive.tar.zst")] });
    expect(unpacked.outputs).toEqual([join(d, "Archive (unpacked)")]);
    expect(readFileSync(join(d, "Archive (unpacked)", "docs", "readme.txt"), "utf8")).toBe("read me");
    const zip = await run({ action: "arc-targz-to-zip", paths: [join(d, "Archive.tar.zst")] });
    expect(zip.outputs).toEqual([join(d, "Archive.zip")]);
    noLeftovers(d);
  });
});
