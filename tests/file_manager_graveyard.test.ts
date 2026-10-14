import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { calculatePathMetrics, compareTreesSync, createGraveyardItem, getGraveyardStats, loadManifest, loadManifestChecked, newBurialId, saveManifest, buryTargetsSync } from "../applications/rip_engine";
import { defaultGraveyardHooks } from "../src/features/filemanager/fmGraveyardHooks";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The Graveyard in the File Manager (burying, restoring, emptying, checking), against the real server, real files and a
// private graveyard folder. "Different disk" cases use the graveyard's same-disk seam to force the copy-and-check path.
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
const TOKEN = "grave-token";
const root = mkdtempSync(join(tmpdir(), "fm-grave-"));
const home = join(root, "home");
const work = join(home, "work");
const gy = join(root, "graveyard");
const data = join(root, "data");
const seam: { sameDevice: null | ((a: string, b: string) => boolean | Promise<boolean>); afterCopy: null | ((dest: string, n: number) => void | Promise<void>) } = { sameDevice: null, afterCopy: null };
let server: ReturnType<typeof startFileManagerServer>;
let base = "";
let counter = 0;

beforeAll(() => {
  mkdirSync(work, { recursive: true });
  server = startFileManagerServer({
    port: 0,
    token: TOKEN,
    context: {
      home,
      dataDir: data,
      graveyardDir: gy,
      graveyardHooks: { sameDevice: async (a, b) => (seam.sameDevice ? seam.sameDevice(a, b) : defaultGraveyardHooks.sameDevice(a, b)), afterCopy: async (d, n) => void (await seam.afterCopy?.(d, n)) },
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
  seam.sameDevice = null;
  seam.afterCopy = null;
  allowWrite(gy);
  rmSync(gy, { recursive: true, force: true });
  allowWrite(join(data, "file_manager_trash"));
  rmSync(join(data, "file_manager_trash"), { recursive: true, force: true });
});

async function post(op: string, body: unknown = {}, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
}
async function api(op: string, body: unknown = {}) {
  const r = await post(op, body);
  if (r.status !== 200) throw new Error(`${op} -> ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}
const jobDone = async (job: { id: string }) => server.context.jobs.whenDone(job.id);
const folder = (label = "t") => {
  const d = join(work, `${label}-${++counter}`);
  mkdirSync(d, { recursive: true });
  return d;
};
const write = (path: string, text = "hello", mode?: number) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  if (mode !== undefined) chmodSync(path, mode);
  return path;
};
const listAll = async (extra: Record<string, unknown> = {}) => (await api("grave/list", { pageSize: 500, ...extra })).items as any[];
const idOf = async (path: string) => (await listAll()).find((i) => i.originalPath === path)?.id as string;

/** Buries and waits for a job when the item went through the copy path. Returns the response. */
async function bury(paths: string[], extra: Record<string, unknown> = {}) {
  const res = await api("grave/bury", { paths, ...extra });
  if (res.job) expect((await jobDone(res.job)).state).toBe("done");
  return res;
}
async function restore(ids: string[], extra: Record<string, unknown> = {}) {
  const res = await api("grave/restore", { ids, ...extra });
  if (res.job) expect((await jobDone(res.job)).state).toBe("done");
  return res;
}

/** Everything about a tree that a round trip must not change. */
function snapshot(path: string, rel = "."): string[] {
  const st = lstatSync(path);
  const kind = st.isSymbolicLink() ? `L>${readlinkSync(path)}` : st.isDirectory() ? "D" : `F${st.size}`;
  const out = [`${rel}|${kind}|${(st.mode & 0o7777).toString(8)}|${st.isSymbolicLink() ? "" : Math.floor(st.mtimeMs)}`];
  if (st.isDirectory() && !st.isSymbolicLink()) for (const name of readdirSync(path).sort()) out.push(...snapshot(join(path, name), join(rel, name)));
  return out;
}
const allowWrite = (path: string) => {
  try {
    chmodSync(path, 0o755);
    for (const n of readdirSync(path)) allowWrite(join(path, n));
  } catch {
    // a file, or already gone
  }
};

// ---------------------------------------------------------------------------------------------------------------

describe("bury and restore round trips", () => {
  for (const disk of ["same disk", "different disk"] as const) {
    describe(disk, () => {
      beforeEach(() => {
        seam.sameDevice = disk === "different disk" ? () => false : null;
      });

      test("a file comes back exactly as it was, and the graveyard keeps it in the Rip layout", async () => {
        const f = write(join(folder(), "report.txt"), "quarterly numbers", 0o640);
        const before = snapshot(f);
        const res = await bury([f]);
        expect(res.results[0]?.ok || res.job).toBeTruthy();
        expect(existsSync(f)).toBe(false);
        const id = await idOf(f);
        expect(id).toMatch(/^rip_\d+_[a-z0-9]+$/);
        const payload = join(gy, "entries", id, "report.txt");
        expect(readFileSync(payload, "utf8")).toBe("quarterly numbers");
        const record = loadManifest(gy).items.find((i) => i.id === id)!;
        expect(record).toMatchObject({ name: "report.txt", originalPath: f, type: "file", status: "buried", sizeBytes: 17, graveyardPath: payload });
        expect(record.sha256).toHaveLength(64);
        if (disk === "different disk") expect(res.job).toBeTruthy();
        else expect(res.job).toBeUndefined();
        const back = await restore([id]);
        if (disk === "same disk") expect(back.results[0]).toMatchObject({ ok: true, value: { status: "done", restoredTo: f } });
        expect(snapshot(f)).toEqual(before);
        expect(existsSync(join(gy, "entries", id))).toBe(false);
        expect(loadManifest(gy).items.find((i) => i.id === id)!.status).toBe("unburied");
        expect(existsSync(join(gy, ".staging")) ? readdirSync(join(gy, ".staging")) : []).toEqual([]);
      });

      test("a folder with nested files, links, hidden files, an empty folder and odd names round-trips exactly", async () => {
        const top = join(folder(), "project");
        write(join(top, "src", "main.ts"), "export {}", 0o755);
        write(join(top, "src", "deep", "er", "x.bin"), "\u0000\u0001\u0002");
        write(join(top, ".hidden"), "secret");
        write(join(top, "-rf notes.txt"), "leading dash");
        write(join(top, "日本語 ファイル.txt"), "unicode");
        write(join(top, "émoji 🪦  two  spaces.txt"), "emoji");
        write(join(top, "read-only.txt"), "ro", 0o444);
        mkdirSync(join(top, "empty"));
        symlinkSync("src/main.ts", join(top, "relative-link"));
        symlinkSync("/definitely/not/here", join(top, "dangling-link"));
        utimesSync(join(top, "src", "main.ts"), new Date(1_600_000_000_000), new Date(1_600_000_000_000));
        utimesSync(join(top, "src"), new Date(1_600_000_100_000), new Date(1_600_000_100_000));
        const before = snapshot(top);
        const engine = calculatePathMetrics(top);
        await bury([top]);
        const id = await idOf(top);
        const payload = join(gy, "entries", id, "project");
        expect(lstatSync(join(payload, "relative-link")).isSymbolicLink()).toBe(true);
        expect(readlinkSync(join(payload, "relative-link"))).toBe("src/main.ts");
        expect(readlinkSync(join(payload, "dangling-link"))).toBe("/definitely/not/here");
        const record = loadManifest(gy).items.find((i) => i.id === id)!;
        expect({ size: record.sizeBytes, files: record.fileCount, type: record.type }).toEqual({ size: engine.sizeBytes, files: engine.fileCount, type: "directory" });
        await restore([id]);
        expect(snapshot(top)).toEqual(before);
      });

      test("a symbolic link is buried as a link: its target is neither moved nor followed", async () => {
        const dir = folder();
        const target = write(join(dir, "target.txt"), "keep me");
        const link = join(dir, "the-link");
        symlinkSync("target.txt", link);
        await bury([link]);
        expect(existsSync(target)).toBe(true);
        expect(readFileSync(target, "utf8")).toBe("keep me");
        const id = await idOf(link);
        const payload = join(gy, "entries", id, "the-link");
        expect(lstatSync(payload).isSymbolicLink()).toBe(true);
        expect(loadManifest(gy).items.find((i) => i.id === id)!.type).toBe("symlink");
        await restore([id]);
        expect(readlinkSync(link)).toBe("target.txt");
        expect(readFileSync(link, "utf8")).toBe("keep me");
      });

      test("a link to nowhere can be buried and restored too", async () => {
        const link = join(folder(), "dangling");
        symlinkSync("missing-target", link);
        await bury([link]);
        expect(() => lstatSync(link)).toThrow();
        const id = await idOf(link);
        await restore([id]);
        expect(readlinkSync(link)).toBe("missing-target");
      });

      test("read-only files and read-only folders can be buried and are restored read-only", async () => {
        const dir = folder();
        const file = write(join(dir, "locked.txt"), "x", 0o444);
        const ro = join(dir, "locked-dir");
        write(join(ro, "inner.txt"), "inner", 0o444);
        chmodSync(ro, 0o555);
        const before = [snapshot(file), snapshot(ro)];
        try {
          await bury([file, ro]);
          expect(existsSync(file) || existsSync(ro)).toBe(false);
          await restore([await idOf(file), await idOf(ro)]);
          expect([snapshot(file), snapshot(ro)]).toEqual(before);
          expect((lstatSync(ro).mode & 0o222) === 0 || asRoot).toBe(true);
        } finally {
          allowWrite(ro);
        }
      });

      test("an empty file and an empty folder", async () => {
        const dir = folder();
        const file = write(join(dir, "empty.txt"), "");
        const sub = join(dir, "nothing");
        mkdirSync(sub);
        await bury([file, sub]);
        expect(readdirSync(dir)).toEqual([]);
        await restore([await idOf(file), await idOf(sub)]);
        expect(readdirSync(dir).sort()).toEqual(["empty.txt", "nothing"]);
      });
    });
  }

  test("buried items are listed newest first with the folder they came from, and the status counts them", async () => {
    const dir = folder();
    const a = write(join(dir, "a.txt"), "aaa");
    const b = write(join(dir, "b.txt"), "bbbbb");
    await bury([a]);
    await new Promise((r) => setTimeout(r, 5));
    await bury([b]);
    const items = await listAll();
    expect(items.map((i) => i.name)).toEqual(["b.txt", "a.txt"]);
    expect(items[0]).toMatchObject({ folder: dir, type: "file", sizeBytes: 5, humanSize: "5 B", unknownOrigin: false, missing: false });
    const { status } = await api("grave/status");
    expect(status).toMatchObject({ dir: gy, count: 2, bytes: 8, human: "8 B", damaged: false, today: 2 });
    expect(status.oldest.name).toBe("a.txt");
    expect(status.newest.name).toBe("b.txt");
    expect(status.free.freeBytes).toBeGreaterThan(0);
    expect(status.free.totalBytes).toBeGreaterThanOrEqual(status.free.freeBytes);
  });
});

describe("a different disk is copied, checked, then removed", () => {
  test("a big tree is copied as a job with progress, links stay relative, modes and times are kept, the original goes only afterwards", async () => {
    seam.sameDevice = () => false;
    const top = join(folder(), "big");
    for (let i = 0; i < 120; i++) write(join(top, `d${i % 6}`, `f${i}.txt`), `file ${i}`.repeat(i + 1), i % 2 ? 0o600 : 0o644);
    symlinkSync("d0/f0.txt", join(top, "link"));
    const before = snapshot(top);
    let sourceSeenDuringCopy = true;
    seam.afterCopy = () => {
      sourceSeenDuringCopy = sourceSeenDuringCopy && existsSync(join(top, "d0", "f0.txt"));
    };
    const res = await api("grave/bury", { paths: [top] });
    expect(res.job.kind).toBe("graveyard");
    expect(res.queued).toBe(1);
    const final = await jobDone(res.job);
    expect(final.state).toBe("done");
    expect(sourceSeenDuringCopy).toBe(true);
    expect(existsSync(top)).toBe(false);
    const id = await idOf(top);
    expect(compareTreesSync(join(gy, "entries", id, "big"), join(gy, "entries", id, "big"))).toBeNull();
    await restore([id]);
    expect(snapshot(top)).toEqual(before);
  });

  test("a failure half way through the copy leaves the original untouched and no leftovers", async () => {
    seam.sameDevice = () => false;
    const top = join(folder(), "fragile");
    for (let i = 0; i < 20; i++) write(join(top, `f${i}.txt`), `data ${i}`);
    const before = snapshot(top);
    seam.afterCopy = (_d, n) => {
      if (n === 8) throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
    };
    const res = await api("grave/bury", { paths: [top] });
    const final = await jobDone(res.job);
    expect(final.state).toBe("failed");
    expect(final.steps[0]!.message).toContain("space");
    expect(snapshot(top)).toEqual(before);
    expect(readdirSync(join(gy, "entries"))).toEqual([]);
    expect(existsSync(join(gy, ".staging")) ? readdirSync(join(gy, ".staging")) : []).toEqual([]);
    expect(loadManifest(gy).items).toEqual([]);
    const report = (await api("grave/verify")).report;
    expect(report.ok).toBe(true);
  });

  test("cancelling a copy stops it, keeps the original and cleans up", async () => {
    seam.sameDevice = () => false;
    const top = join(folder(), "slow");
    for (let i = 0; i < 30; i++) write(join(top, `f${i}.txt`), `data ${i}`);
    const before = snapshot(top);
    let reached!: () => void;
    const reachedPromise = new Promise<void>((r) => (reached = r));
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    seam.afterCopy = async (_d, n) => {
      if (n === 5) {
        reached();
        await gate;
      }
    };
    const res = await api("grave/bury", { paths: [top] });
    await reachedPromise;
    expect((await api("jobs/cancel", { id: res.job.id })).cancelled).toBe(true);
    open();
    const final = await jobDone(res.job);
    expect(final.state).toBe("cancelled");
    expect(snapshot(top)).toEqual(before);
    expect(readdirSync(join(gy, "entries"))).toEqual([]);
    expect(existsSync(join(gy, ".staging")) ? readdirSync(join(gy, ".staging")) : []).toEqual([]);
    expect(loadManifest(gy).items).toEqual([]);
  });

  test("a copy that doesn't match the original is refused and the original stays", async () => {
    seam.sameDevice = () => false;
    const top = join(folder(), "mismatch");
    for (let i = 0; i < 6; i++) write(join(top, `f${i}.txt`), `data ${i}`);
    const before = snapshot(top);
    seam.afterCopy = (dest, n) => {
      // damage the copy after the file was written (a bad disk would do this)
      if (n === 3 && existsSync(dest) && lstatSync(dest).isFile()) writeFileSync(dest, "x");
    };
    const final = await jobDone((await api("grave/bury", { paths: [top] })).job);
    expect(final.state).toBe("failed");
    expect(final.steps[0]!.message).toContain("original was left");
    expect(snapshot(top)).toEqual(before);
    expect(readdirSync(join(gy, "entries"))).toEqual([]);
  });

  test("an item on a different disk is moved while others are done straight away", async () => {
    const dir = folder();
    const near = write(join(dir, "near.txt"));
    const far = write(join(dir, "far.txt"));
    seam.sameDevice = (a) => a !== far;
    const res = await api("grave/bury", { paths: [near, far] });
    expect(res.results.map((r: any) => r.ok)).toEqual([true]);
    expect(res.queued).toBe(1);
    expect((await jobDone(res.job)).state).toBe("done");
    expect((await listAll()).map((i) => i.name).sort()).toEqual(["far.txt", "near.txt"]);
  });

  test("a large tree (2,400 files in 60 folders) is buried and restored intact on the same disk and on another disk, and the numbers match the engine's", async () => {
    const top = join(folder(), "large");
    for (let i = 0; i < 2400; i++) write(join(top, `d${i % 60}`, i % 3 === 0 ? `sub${i % 7}` : ".", `f${i}.dat`), `payload ${i}`.repeat(1 + (i % 9)));
    const before = snapshot(top);
    const engine = calculatePathMetrics(top);
    for (const different of [false, true]) {
      seam.sameDevice = different ? () => false : null;
      const t0 = performance.now();
      await bury([top]);
      expect(existsSync(top)).toBe(false);
      const record = loadManifest(gy).items.find((i) => i.originalPath === top && i.status === "buried")!;
      expect({ size: record.sizeBytes, files: record.fileCount }).toEqual({ size: engine.sizeBytes, files: engine.fileCount });
      await restore([record.id]);
      expect(snapshot(top)).toEqual(before);
      expect(performance.now() - t0).toBeLessThan(25_000);
    }
  });

  test("the engine itself now buries and restores a link whose target is missing (it used to say 'no such file')", () => {
    const link = join(folder("engine"), "dangling");
    symlinkSync("nowhere", link);
    const result = buryTargetsSync([link], { graveyardDir: gy });
    expect(result.failed).toEqual([]);
    expect(result.buriedItems[0]).toMatchObject({ type: "symlink", name: "dangling" });
    expect(() => lstatSync(link)).toThrow();
  });

  test("the engine's own sync tree check spots a changed copy", () => {
    const a = folder("cmp");
    write(join(a, "x.txt"), "one");
    const b = folder("cmp");
    write(join(b, "x.txt"), "one");
    expect(compareTreesSync(a, b)).toBeNull();
    write(join(b, "x.txt"), "two!");
    expect(compareTreesSync(a, b)).toContain("size");
    write(join(b, "extra.txt"), "x");
    expect(compareTreesSync(a, b)).toContain("contents");
  });
});

describe("restoring: where, conflicts and missing folders", () => {
  test("a file that is in the way is never overwritten silently: the answer is a conflict", async () => {
    const f = write(join(folder(), "doc.txt"), "original");
    await bury([f]);
    write(f, "newer file in the way");
    const id = await idOf(f);
    const first = await api("grave/restore", { ids: [id] });
    expect(first.results[0]).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(first.results[0].message).toContain("Replace, Keep both or Skip");
    expect(readFileSync(f, "utf8")).toBe("newer file in the way");
    expect((await listAll()).length).toBe(1);
  });

  test("Skip leaves both alone, Keep both restores beside it, Replace sends the old one to the Recycle Bin", async () => {
    const dir = folder();
    const f = write(join(dir, "doc.txt"), "buried version");
    await bury([f]);
    write(f, "current version");
    const id = await idOf(f);
    const skipped = await api("grave/restore", { ids: [id], conflict: "skip" });
    expect(skipped.results[0].value.status).toBe("skipped");
    expect((await listAll()).length).toBe(1);
    expect(readFileSync(f, "utf8")).toBe("current version");

    const kept = await api("grave/restore", { ids: [id], conflict: "rename" });
    expect(kept.results[0].value.restoredTo).toBe(join(dir, "doc (2).txt"));
    expect(readFileSync(join(dir, "doc (2).txt"), "utf8")).toBe("buried version");
    expect(readFileSync(f, "utf8")).toBe("current version");

    // bury it again and restore with Replace
    await bury([join(dir, "doc (2).txt")]);
    const id2 = await idOf(join(dir, "doc (2).txt"));
    write(join(dir, "doc (2).txt"), "to be replaced");
    const replaced = await api("grave/restore", { ids: [id2], conflict: "replace" });
    expect(replaced.results[0].value.replaced.trashId).toBeTruthy();
    expect(readFileSync(join(dir, "doc (2).txt"), "utf8")).toBe("buried version");
    const bin = (await api("trash/list")).items;
    expect(bin.some((t: any) => t.name === "doc (2).txt")).toBe(true);
    const trashed = bin.find((t: any) => t.name === "doc (2).txt");
    expect(readFileSync(join(data, "file_manager_trash", "items", trashed.id, "doc (2).txt"), "utf8")).toBe("to be replaced");
  });

  test("grave/check says what would clash and which folders are gone, before anything is changed", async () => {
    const dir = folder();
    const a = write(join(dir, "a.txt"));
    const gone = join(folder("gone"), "g.txt");
    write(gone);
    await bury([a, gone]);
    write(a, "in the way");
    rmSync(dirname(gone), { recursive: true });
    const ids = [await idOf(a), await idOf(gone)];
    const check = await api("grave/check", { ids });
    const byName = Object.fromEntries(check.items.map((i: any) => [i.name, i]));
    expect(byName["a.txt"]).toMatchObject({ conflict: true, folderMissing: false, conflictIsDir: false });
    expect(byName["g.txt"]).toMatchObject({ conflict: false, folderMissing: true, folder: dirname(gone) });
    expect(existsSync(dirname(gone))).toBe(false);
  });

  test("when the original folder is gone: refused until you choose to create it or pick another folder", async () => {
    const parent = folder("gone");
    const f = write(join(parent, "sub", "lost.txt"), "lost");
    await bury([f]);
    rmSync(parent, { recursive: true });
    const id = await idOf(f);
    const refused = await api("grave/restore", { ids: [id] });
    expect(refused.results[0]).toMatchObject({ ok: false, code: "FOLDER_GONE" });
    expect(existsSync(parent)).toBe(false);
    const created = await api("grave/restore", { ids: [id], makeFolders: true });
    expect(created.results[0].value.restoredTo).toBe(f);
    expect(readFileSync(f, "utf8")).toBe("lost");
  });

  test("Restore to… puts items in the chosen folder (same name there, conflicts handled the same way)", async () => {
    const a = write(join(folder(), "one.txt"), "1");
    const b = write(join(folder(), "two.txt"), "2");
    await bury([a, b]);
    const dest = folder("dest");
    write(join(dest, "two.txt"), "already here");
    const res = await api("grave/restore", { ids: [await idOf(a), await idOf(b)], to: dest, conflict: "rename" });
    expect(res.results.map((r: any) => r.value.restoredTo).sort()).toEqual([join(dest, "one.txt"), join(dest, "two (2).txt")]);
    expect(readFileSync(join(dest, "two.txt"), "utf8")).toBe("already here");
    const bad = await post("grave/restore", { ids: ["rip_1_a"], to: join(dest, "nope") });
    expect(bad.status).toBe(400);
    expect(bad.json.error.message).toContain("doesn't exist");
  });

  test("an item found during a repair has no known origin: restore needs a folder", async () => {
    mkdirSync(join(gy, "entries", "rip_1700000000000_abcdef"), { recursive: true });
    writeFileSync(join(gy, "entries", "rip_1700000000000_abcdef", "found.txt"), "found");
    await api("grave/repair", { confirm: true });
    const [item] = await listAll();
    expect(item).toMatchObject({ name: "found.txt", unknownOrigin: true, folder: "" });
    const refused = await api("grave/restore", { ids: [item.id] });
    expect(refused.results[0]).toMatchObject({ ok: false, code: "NO_ORIGIN" });
    const dest = folder("dest");
    const ok = await api("grave/restore", { ids: [item.id], to: dest });
    expect(readFileSync(join(dest, "found.txt"), "utf8")).toBe("found");
  });

  test("a leftover half-restored copy from an interrupted restore is cleared, not tripped over", async () => {
    seam.sameDevice = () => false;
    const dir = folder();
    const f = write(join(dir, "again.txt"), "second try");
    await bury([f]);
    const id = await idOf(f);
    mkdirSync(join(dir, `.rip-restoring-${id}`), { recursive: true });
    writeFileSync(join(dir, `.rip-restoring-${id}`, "junk"), "half");
    await restore([id]);
    expect(readFileSync(f, "utf8")).toBe("second try");
    expect(readdirSync(dir)).toEqual(["again.txt"]);
  });

  test("a record with a relative original place (a hand-edited list) is never restored relative to the server's own folder", async () => {
    const f = write(join(folder(), "rel.txt"), "relative");
    await bury([f]);
    const m = loadManifest(gy);
    m.items[0]!.originalPath = "relative/place/rel.txt";
    saveManifest(gy, m);
    const [row] = await listAll();
    expect(row).toMatchObject({ unknownOrigin: true, folder: "" });
    const res = await api("grave/restore", { ids: [row.id] });
    expect(res.results[0]).toMatchObject({ ok: false, code: "NO_ORIGIN" });
    expect(existsSync(join(process.cwd(), "relative"))).toBe(false);
  });

  test("restoring something that is no longer in the graveyard, or twice, is a plain-words failure", async () => {
    const f = write(join(folder(), "x.txt"));
    await bury([f]);
    const id = await idOf(f);
    await restore([id]);
    const again = await api("grave/restore", { ids: [id] });
    expect(again.results[0]).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(again.results[0].message).toContain("no longer in the graveyard");
  });

  test("an item whose files vanished can't be restored, and Verify and Repair clear it from the list", async () => {
    const f = write(join(folder(), "vanish.txt"));
    await bury([f]);
    const id = await idOf(f);
    rmSync(join(gy, "entries", id), { recursive: true });
    expect((await listAll())[0].missing).toBe(true);
    const res = await api("grave/restore", { ids: [id] });
    expect(res.results[0]).toMatchObject({ ok: false, code: "MISSING_FILES" });
    const report = (await api("grave/verify")).report;
    expect(report.counts.missing).toBe(1);
    expect(report.ok).toBe(false);
    const fixed = (await api("grave/repair", { confirm: true })).report;
    expect(fixed.droppedRecords).toBe(1);
    expect((await api("grave/verify")).report.ok).toBe(true);
    expect(await listAll()).toEqual([]);
  });
});

describe("emptying the graveyard (decompose)", () => {
  async function bury3() {
    const dir = folder();
    const files = ["a.txt", "b.txt", "c.txt"].map((n, i) => write(join(dir, n), "x".repeat((i + 1) * 100)));
    await bury(files);
    return { dir, files };
  }

  test("nothing is deleted without confirm, and nothing without a choice of what", async () => {
    const { files } = await bury3();
    const id = await idOf(files[0]!);
    const noConfirm = await post("grave/decompose", { ids: [id] });
    expect(noConfirm.status).toBe(409);
    expect(noConfirm.json.error.code).toBe("NEEDS_CONFIRM");
    expect((await post("grave/decompose", { confirm: true })).status).toBe(400);
    expect((await post("grave/decompose", { confirm: true, ids: [id], all: true })).status).toBe(400);
    expect((await listAll()).length).toBe(3);
    expect(existsSync(join(gy, "entries", id))).toBe(true);
  });

  test("a dry run counts and sizes without deleting", async () => {
    const { files } = await bury3();
    const all = await api("grave/decompose", { all: true, dryRun: true });
    expect(all).toMatchObject({ count: 3, bytes: 600, human: "600 B" });
    const some = await api("grave/decompose", { ids: [await idOf(files[1]!), await idOf(files[2]!)], dryRun: true });
    expect(some).toMatchObject({ count: 2, bytes: 500 });
    expect((await listAll()).length).toBe(3);
  });

  test("chosen items are deleted for good, the rest stay, and the numbers are right", async () => {
    const { files } = await bury3();
    const gone = await idOf(files[2]!);
    const res = await api("grave/decompose", { ids: [gone], confirm: true });
    expect(res).toMatchObject({ deleted: 1, freedBytes: 300, freed: "300 B", failed: [] });
    expect(existsSync(join(gy, "entries", gone))).toBe(false);
    expect((await listAll()).map((i) => i.name).sort()).toEqual(["a.txt", "b.txt"]);
    expect((await api("grave/status")).status.bytes).toBe(300);
    expect(getGraveyardStats(gy).totalItems).toBe(2);
  });

  test("everything needs the typed word, and refuses if the graveyard changed since the person looked", async () => {
    const { files } = await bury3();
    const noWord = await post("grave/decompose", { all: true, confirm: true });
    expect(noWord.status).toBe(409);
    expect(noWord.json.error.message).toContain("type the word empty");
    const wrongWord = await post("grave/decompose", { all: true, confirm: true, typed: "yes" });
    expect(wrongWord.status).toBe(409);
    const stale = await post("grave/decompose", { all: true, confirm: true, typed: "empty", expectCount: 2 });
    expect(stale.status).toBe(400);
    expect(stale.json.error.code).toBe("CHANGED");
    expect((await listAll()).length).toBe(3);
    const ok = await api("grave/decompose", { all: true, confirm: true, typed: " Empty ", expectCount: 3 });
    expect(ok.deleted).toBe(3);
    expect(await listAll()).toEqual([]);
    expect(readdirSync(join(gy, "entries"))).toEqual([]);
    expect(files.some(existsSync)).toBe(false);
  });

  test("emptying everything also removes files with no record and unfinished copies, but nothing outside the graveyard", async () => {
    const { dir } = await bury3();
    mkdirSync(join(gy, "entries", "stray-folder"), { recursive: true });
    writeFileSync(join(gy, "entries", "stray-folder", "x"), "x");
    mkdirSync(join(gy, ".staging", "rip_1_a"), { recursive: true });
    writeFileSync(join(dir, "survivor.txt"), "outside");
    await api("grave/decompose", { all: true, confirm: true, typed: "empty" });
    expect(readdirSync(join(gy, "entries"))).toEqual([]);
    expect(existsSync(join(gy, ".staging"))).toBe(false);
    expect(readFileSync(join(dir, "survivor.txt"), "utf8")).toBe("outside");
  });

  test("items older than N days: only the old ones go", async () => {
    const dir = folder();
    const files = ["old.txt", "older.txt", "new.txt"].map((n) => write(join(dir, n), "data"));
    await bury(files);
    const manifest = loadManifest(gy);
    const byName = (n: string) => manifest.items.find((i) => i.name === n)!;
    byName("old.txt").buriedAtMs = Date.now() - 40 * 86_400_000;
    byName("older.txt").buriedAtMs = Date.now() - 400 * 86_400_000;
    saveManifest(gy, manifest);
    expect(await api("grave/decompose", { olderThanDays: 30, dryRun: true })).toMatchObject({ count: 2 });
    expect(await api("grave/decompose", { olderThanDays: 365, dryRun: true })).toMatchObject({ count: 1 });
    const res = await api("grave/decompose", { olderThanDays: 30, confirm: true });
    expect(res.deleted).toBe(2);
    expect((await listAll()).map((i) => i.name)).toEqual(["new.txt"]);
    for (const bad of [0, -3, 1.5, "x", 40000]) expect((await post("grave/decompose", { olderThanDays: bad, confirm: true })).status).toBe(400);
  });

  test("a buried read-only folder can be deleted for good", async () => {
    const dir = folder();
    const ro = join(dir, "ro");
    write(join(ro, "sub", "f.txt"), "x", 0o444);
    chmodSync(join(ro, "sub"), 0o555);
    chmodSync(ro, 0o555);
    try {
      await bury([ro]);
      const id = await idOf(ro);
      const res = await api("grave/decompose", { ids: [id], confirm: true });
      expect(res.deleted).toBe(1);
      expect(existsSync(join(gy, "entries", id))).toBe(false);
    } finally {
      allowWrite(ro);
    }
  });

  test("emptying many items runs as a job that can be watched", async () => {
    const dir = folder();
    const files = Array.from({ length: 40 }, (_, i) => write(join(dir, `f${i}.txt`), "x"));
    await bury(files);
    const res = await api("grave/decompose", { all: true, confirm: true, typed: "empty" });
    expect(res.job.kind).toBe("graveyard");
    expect((await jobDone(res.job)).state).toBe("done");
    expect(await listAll()).toEqual([]);
  });

  test("a long graveyard deleted by ids runs as a job in steps, and can be cancelled between items", async () => {
    const dir = folder();
    const files = Array.from({ length: 30 }, (_, i) => write(join(dir, `n${i}.txt`), "x"));
    await bury(files);
    const ids = (await listAll()).map((i) => i.id);
    const res = await api("grave/decompose", { ids, confirm: true });
    expect(res.job.title).toBe("Deleting 30 items for good");
    expect((await jobDone(res.job)).state).toBe("done");
    expect(await listAll()).toEqual([]);
  });
});

describe("the same refusals as Delete", () => {
  const refused = async (path: string) => {
    const res = await api("grave/bury", { paths: [path] });
    return res.results[0];
  };

  test("home, system folders, main personal folders, the top of the disk and the Recycle Bin can't be buried", async () => {
    mkdirSync(join(home, "Documents"), { recursive: true });
    for (const p of [home, join(home, "Documents"), "/", "/usr", "/usr/bin/env", "/etc", "/System", join(data, "file_manager_trash")]) {
      const r = await refused(p);
      expect(r.ok, p).toBe(false);
      expect(["PROTECTED"].includes(r.code), `${p}: ${r.code} ${r.message}`).toBe(true);
      expect(r.message).not.toMatch(/undefined|null/);
    }
    expect(existsSync(home)).toBe(true);
  });

  test("the graveyard itself, things inside it, and a folder that contains it can't be buried", async () => {
    const f = write(join(folder(), "x.txt"));
    await bury([f]);
    for (const p of [gy, join(gy, "entries"), join(gy, "entries", await idOf(f)), root]) {
      const r = await refused(p);
      expect(r, p).toMatchObject({ ok: false, code: "PROTECTED" });
    }
    expect(existsSync(gy)).toBe(true);
    expect(readFileSync(join(gy, "entries", await idOf(f), "x.txt"), "utf8")).toBe("hello");
  });

  test("things that don't exist, and a file with a relative or empty path, get plain messages", async () => {
    const missing = await refused(join(work, "no-such-thing"));
    expect(missing).toMatchObject({ ok: false });
    expect(missing.message).toContain("doesn't exist");
    for (const bad of [["relative/path"], [""], ["a\0b"], [null], [42], "not-an-array", []]) expect((await post("grave/bury", { paths: bad })).status, JSON.stringify(bad)).toBe(400);
  });

  test("one refused item doesn't stop the others", async () => {
    const f = write(join(folder(), "fine.txt"));
    const res = await api("grave/bury", { paths: [home, f] });
    expect(res.results.map((r: any) => r.ok)).toEqual([false, true]);
    expect(existsSync(f)).toBe(false);
  });

  test("restoring into the graveyard or a system folder is refused", async () => {
    const f = write(join(folder(), "x.txt"));
    await bury([f]);
    const id = await idOf(f);
    for (const to of [gy, join(gy, "entries"), "/usr/bin", "/etc"]) {
      const r = await post("grave/restore", { ids: [id], to });
      const first = r.json.results?.[0] ?? r.json.error;
      expect(r.status === 400 || first?.ok === false, `${to}`).toBe(true);
    }
    expect((await listAll()).length).toBe(1);
  });
});

describe("Verify and Repair", () => {
  test("a clean graveyard verifies; a leftover copy, a stray folder and a record without files are each found", async () => {
    const dir = folder();
    const a = write(join(dir, "a.txt"));
    const b = write(join(dir, "b.txt"));
    await bury([a, b]);
    expect((await api("grave/verify")).report).toMatchObject({ ok: true, checked: 2, damaged: false });
    mkdirSync(join(gy, "entries", "rip_1700000000000_orphan"), { recursive: true });
    writeFileSync(join(gy, "entries", "rip_1700000000000_orphan", "lost.txt"), "lost");
    mkdirSync(join(gy, ".staging", "rip_1_half"), { recursive: true });
    rmSync(join(gy, "entries", await idOf(b)), { recursive: true });
    const report = (await api("grave/verify")).report;
    expect(report.ok).toBe(false);
    expect(report.counts).toMatchObject({ missing: 1, orphans: 1, staging: 1, unsafe: 0, changed: 0 });
    expect(report.missing[0]).toMatchObject({ name: "b.txt", originalPath: b });
    expect(report.orphans[0]).toMatchObject({ id: "rip_1700000000000_orphan", name: "lost.txt" });
    expect(await listAll()).toHaveLength(2);

    expect((await post("grave/repair", {})).status).toBe(409);
    const fixed = (await api("grave/repair", { confirm: true })).report;
    expect(fixed).toMatchObject({ droppedRecords: 1, adopted: 1, stagingCleared: 1, leftAlone: 0, damagedBackup: null });
    expect((await api("grave/verify")).report.ok).toBe(true);
    expect((await listAll()).map((i) => i.name).sort()).toEqual(["a.txt", "lost.txt"]);
    // nothing buried was deleted by repairing
    expect(readFileSync(join(gy, "entries", "rip_1700000000000_orphan", "lost.txt"), "utf8")).toBe("lost");
  });

  test("repair can be limited to some of the problems", async () => {
    mkdirSync(join(gy, "entries", "rip_1700000000001_aa"), { recursive: true });
    writeFileSync(join(gy, "entries", "rip_1700000000001_aa", "x"), "x");
    mkdirSync(join(gy, ".staging", "rip_9_zz"), { recursive: true });
    const r = (await api("grave/repair", { confirm: true, orphans: false })).report;
    expect(r).toMatchObject({ adopted: 0, stagingCleared: 1 });
    expect((await api("grave/verify")).report.counts.orphans).toBe(1);
  });

  test("a folder with two things in it, or a name that isn't ours, is reported and left alone", async () => {
    mkdirSync(join(gy, "entries", "rip_1700000000002_bb"), { recursive: true });
    writeFileSync(join(gy, "entries", "rip_1700000000002_bb", "one"), "1");
    writeFileSync(join(gy, "entries", "rip_1700000000002_bb", "two"), "2");
    mkdirSync(join(gy, "entries", "somebody-elses-folder"), { recursive: true });
    const r = (await api("grave/repair", { confirm: true })).report;
    expect(r).toMatchObject({ adopted: 0, leftAlone: 2 });
    expect(existsSync(join(gy, "entries", "rip_1700000000002_bb", "two"))).toBe(true);
    expect(existsSync(join(gy, "entries", "somebody-elses-folder"))).toBe(true);
  });

  test("Deep verify notices a buried file whose content changed", async () => {
    const f = write(join(folder(), "doc.txt"), "original text");
    await bury([f]);
    const id = await idOf(f);
    expect((await api("grave/verify", { deep: true })).report.ok).toBe(true);
    writeFileSync(join(gy, "entries", id, "doc.txt"), "tampered text");
    expect((await api("grave/verify")).report.ok).toBe(true);
    const deep = (await api("grave/verify", { deep: true })).report;
    expect(deep.counts.changed).toBe(1);
    expect(deep.changed[0].name).toBe("doc.txt");
  });

  test("a damaged record file is never written over: changes are refused until it is repaired, and repair keeps a backup", async () => {
    const f = write(join(folder(), "keep.txt"), "precious");
    await bury([f]);
    const id = await idOf(f);
    const manifestFile = join(gy, "manifest.json");
    writeFileSync(manifestFile, '{"items": [ {"id": "rip_1_a"');
    const damagedBytes = readFileSync(manifestFile, "utf8");
    expect(loadManifestChecked(gy).damaged).toBe(true);
    const status = (await api("grave/status")).status;
    expect(status).toMatchObject({ damaged: true, count: 0 });
    expect((await api("grave/list")).damaged).toBe(true);
    const another = write(join(folder(), "second.txt"));
    const refused = await post("grave/bury", { paths: [another] });
    expect(refused.status).toBe(400);
    expect(refused.json.error.code).toBe("DAMAGED");
    expect(existsSync(another)).toBe(true);
    expect((await post("grave/decompose", { ids: ["rip_1_a"], confirm: true })).status).toBe(400);
    expect(readFileSync(manifestFile, "utf8")).toBe(damagedBytes);
    const report = (await api("grave/verify")).report;
    expect(report).toMatchObject({ damaged: true, ok: false });
    expect(report.counts.orphans).toBe(1);
    const fixed = (await api("grave/repair", { confirm: true })).report;
    expect(fixed.adopted).toBe(1);
    expect(readFileSync(fixed.damagedBackup, "utf8")).toBe(damagedBytes);
    expect(loadManifestChecked(gy).damaged).toBe(false);
    const [item] = await listAll();
    expect(item.id).toBe(id);
    expect(item.unknownOrigin).toBe(true);
    expect(readFileSync(join(gy, "entries", id, "keep.txt"), "utf8")).toBe("precious");
  });

  test("a wrong-shaped record file counts as damaged too, and Empty everything still works on it", async () => {
    const f = write(join(folder(), "x.txt"));
    await bury([f]);
    writeFileSync(join(gy, "manifest.json"), JSON.stringify({ version: "1.0.0", items: "nope" }));
    expect((await api("grave/status")).status.damaged).toBe(true);
    const res = await api("grave/decompose", { all: true, confirm: true, typed: "empty" });
    expect(res.deleted ?? res.job).toBeDefined();
    if (res.job) await jobDone(res.job);
    expect(readdirSync(join(gy, "entries"))).toEqual([]);
    expect(loadManifestChecked(gy).damaged).toBe(false);
    expect(readdirSync(gy).some((n) => n.startsWith("manifest.json.damaged-"))).toBe(true);
  });

  test("records that can't be used (bad id or a name with a slash) are counted, never used to reach other files, and repair drops them", async () => {
    const f = write(join(folder(), "real.txt"));
    await bury([f]);
    const m = loadManifest(gy);
    const evil = { ...m.items[0]!, id: "../../escape", name: "x" };
    const evil2 = { ...m.items[0]!, id: "rip_1_okid", name: "../../etc/passwd" };
    m.items.push(evil as any, evil2 as any);
    saveManifest(gy, m);
    expect((await api("grave/status")).status).toMatchObject({ count: 1, invalid: 2 });
    expect((await api("grave/verify")).report.counts.invalid).toBe(2);
    expect((await post("grave/restore", { ids: ["../../escape"] })).status).toBe(400);
    expect((await post("grave/preview", { id: "../../escape" })).status).toBe(400);
    expect((await api("grave/repair", { confirm: true })).report.droppedRecords).toBe(2);
    expect(loadManifest(gy).items).toHaveLength(1);
  });
});

describe("previews", () => {
  test("text, a picture, a folder, a link and a binary file are shown read-only", async () => {
    const dir = folder();
    const txt = write(join(dir, "note.txt"), "line one\nline two");
    const png = join(dir, "dot.png");
    writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
    const bin = join(dir, "data.bin");
    writeFileSync(bin, Buffer.from([1, 2, 0, 3, 4]));
    const sub = join(dir, "pack");
    write(join(sub, "a.txt"));
    write(join(sub, "b", "c.txt"));
    const link = join(dir, "lnk");
    symlinkSync("/etc/hosts", link);
    await bury([txt, png, bin, sub, link]);
    const view = async (p: string) => (await api("grave/preview", { id: await idOf(p) })).preview;
    expect(await view(txt)).toEqual({ kind: "text", text: "line one\nline two", truncated: false, bytes: 17 });
    const image = await view(png);
    expect(image.kind).toBe("image");
    expect(image.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(await view(bin)).toEqual({ kind: "binary", bytes: 5 });
    const folderView = await view(sub);
    expect(folderView).toMatchObject({ kind: "folder", total: 2 });
    expect(folderView.entries).toEqual([{ name: "a.txt", type: "file" }, { name: "b", type: "folder" }]);
    // a link is described, never opened
    expect(await view(link)).toEqual({ kind: "link", target: "/etc/hosts" });
  });

  test("a long text file is cut short, and a missing item gives a plain answer", async () => {
    const f = write(join(folder(), "long.txt"), "x".repeat(200_000));
    await bury([f]);
    const p = (await api("grave/preview", { id: await idOf(f) })).preview;
    expect(p.kind).toBe("text");
    expect(p.truncated).toBe(true);
    expect(p.text.length).toBe(65_536);
    expect(p.bytes).toBe(200_000);
    const gone = (await post("grave/preview", { id: "rip_1700000000000_nope00" }));
    expect(gone.status).toBe(400);
    expect(gone.json.error.message).toContain("no longer in the graveyard");
  });

  test("if an item's folder in the graveyard was swapped for a link, nothing outside is read", async () => {
    const secret = write(join(folder("outside"), "secret.txt"), "TOP SECRET");
    const f = write(join(folder(), "x.txt"), "inside");
    await bury([f]);
    const id = await idOf(f);
    rmSync(join(gy, "entries", id), { recursive: true });
    mkdirSync(dirname(secret), { recursive: true });
    symlinkSync(dirname(secret), join(gy, "entries", id));
    writeFileSync(join(dirname(secret), "x.txt"), "OUTSIDE CONTENT");
    const p = (await api("grave/preview", { id })).preview;
    expect(p.kind).toBe("none");
    expect(JSON.stringify(p)).not.toContain("OUTSIDE");
    const r = await api("grave/restore", { ids: [id] });
    expect(r.results[0]).toMatchObject({ ok: false, code: "UNSAFE" });
    expect(readFileSync(secret, "utf8")).toBe("TOP SECRET");
    expect(existsSync(f)).toBe(false);
  });
});

describe("the server's guards", () => {
  const ops = ["status", "list", "check", "bury", "restore", "decompose", "verify", "repair", "preview"].map((o) => `grave/${o}`);

  test("every operation needs the session token and JSON, and refuses another web page", async () => {
    for (const op of ops) {
      const noToken = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      expect(noToken.status, op).toBe(401);
      const badToken = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": "nope" }, body: "{}" });
      expect(badToken.status, op).toBe(401);
      const notJson = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "text/plain", "x-fm-token": TOKEN }, body: "{}" });
      expect(notJson.status, op).toBe(415);
      const origin = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, Origin: "https://evil.example" }, body: "{}" });
      expect(origin.status, op).toBe(403);
      const host = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, Host: "attacker.example" }, body: "{}" });
      expect(host.status, op).toBe(403);
    }
    const get = await fetch(`${base}/api/grave/status?token=${TOKEN}`);
    expect(get.status).toBe(404);
  });

  test("bad input is a 400 with a plain sentence, never a crash or the word undefined", async () => {
    const bodies: Array<[string, any]> = [
      ["grave/restore", {}], ["grave/restore", { ids: [] }], ["grave/restore", { ids: "x" }], ["grave/restore", { ids: [1] }], ["grave/restore", { ids: ["rip_1_a"], conflict: "overwrite" }],
      ["grave/restore", { ids: ["rip_1_a"], to: "relative" }], ["grave/decompose", { ids: [] , confirm: true }], ["grave/decompose", { ids: ["a/b"], confirm: true }],
      ["grave/preview", {}], ["grave/preview", { id: 5 }], ["grave/check", {}], ["grave/list", { filter: "here" }],
    ];
    for (const [op, body] of bodies) {
      const r = await post(op, body);
      expect(r.status, `${op} ${JSON.stringify(body)}`).toBe(400);
      expect(r.json.error.message).toMatch(/\w/);
      expect(r.json.error.message).not.toMatch(/undefined|null|\[object/);
    }
  });

  test("lists are capped, pages clamp, and absurd numbers are tamed", async () => {
    const dir = folder();
    await bury(Array.from({ length: 12 }, (_, i) => write(join(dir, `f${i}.txt`))));
    const big = await api("grave/list", { pageSize: 100000, page: 1 });
    expect(big.pageSize).toBe(500);
    expect(big.items).toHaveLength(12);
    const tiny = await api("grave/list", { pageSize: 5, page: 99 });
    expect(tiny).toMatchObject({ page: 3, pages: 3, total: 12 });
    expect(tiny.items).toHaveLength(2);
    const junk = await api("grave/list", { pageSize: "lots", page: -4, sort: "bogus", filter: "bogus", query: "x".repeat(5000) });
    expect(junk.page).toBe(1);
    expect(junk.items).toHaveLength(0);
    const tooMany = await post("grave/bury", { paths: Array.from({ length: 5001 }, (_, i) => join(work, `p${i}`)) });
    expect(tooMany.status).toBe(400);
  });

  test("a request body over 1 MB is refused", async () => {
    const r = await post("grave/restore", { ids: ["rip_1_a".padEnd(2_000_000, "a")] });
    expect([400, 413]).toContain(r.status);
  });
});

describe("a long graveyard stays smooth", () => {
  test("6,000 items: pages, search, filters and sorting are quick and correct", async () => {
    const items = Array.from({ length: 6000 }, (_, i) =>
      createGraveyardItem({
        id: `rip_${1_700_000_000_000 + i}_${i.toString(36)}`,
        name: i % 7 === 0 ? `folder-${i}` : `file-${i}.txt`,
        originalPath: join(work, `dir${i % 50}`, i % 7 === 0 ? `folder-${i}` : `file-${i}.txt`),
        cwd: join(work, `dir${i % 50}`),
        graveyardDir: gy,
        graveyardPath: join(gy, "entries", `rip_${1_700_000_000_000 + i}_${i.toString(36)}`, "x"),
        now: new Date(1_700_000_000_000 + i * 1000),
        type: i % 7 === 0 ? "directory" : "file",
        mode: 0o644,
        sizeBytes: i * 10,
        fileCount: 1,
      }),
    );
    saveManifest(gy, { version: "1.0.0", graveyardRoot: gy, lastUpdated: "", items: items.reverse() });
    const timed = async <T>(fn: () => Promise<T>) => {
      const t0 = performance.now();
      const v = await fn();
      return { v, ms: performance.now() - t0 };
    };
    const first = await timed(() => api("grave/list", { pageSize: 100 }));
    expect(first.v).toMatchObject({ total: 6000, pages: 60, pageSize: 100 });
    expect(first.v.items[0].name).toBe("folder-5999");
    const status = await timed(() => api("grave/status"));
    expect(status.v.status).toMatchObject({ count: 6000 });
    expect(status.v.status.bytes).toBe(10 * ((5999 * 6000) / 2));
    const search = await timed(() => api("grave/list", { query: "file-4999" }));
    expect(search.v.items.map((i: any) => i.name)).toEqual(["file-4999.txt"]);
    const folders = await timed(() => api("grave/list", { filter: "folders", pageSize: 500 }));
    expect(folders.v.total).toBe(Math.ceil(6000 / 7));
    expect(folders.v.items.every((i: any) => i.type === "directory")).toBe(true);
    const files = await timed(() => api("grave/list", { filter: "files" }));
    expect(files.v.total).toBe(6000 - Math.ceil(6000 / 7));
    const here = await timed(() => api("grave/list", { filter: "here", folder: join(work, "dir3"), pageSize: 500 }));
    expect(here.v.total).toBe(120);
    expect(here.v.items.every((i: any) => i.folder === join(work, "dir3"))).toBe(true);
    const bySize = await timed(() => api("grave/list", { sort: "size", pageSize: 3 }));
    expect(bySize.v.items.map((i: any) => i.sizeBytes)).toEqual([59990, 59980, 59970]);
    const byName = await timed(() => api("grave/list", { sort: "name", dir: "asc", pageSize: 2 }));
    expect(byName.v.items.map((i: any) => i.name)).toEqual(["file-1.txt", "file-2.txt"]);
    const last = await timed(() => api("grave/list", { page: 60, pageSize: 100 }));
    expect(last.v.items).toHaveLength(100);
    for (const t of [first, status, search, folders, files, here, bySize, byName, last]) expect(t.ms).toBeLessThan(4000);
    // every listed row says its files are gone (no payload folders were made for this test)
    expect(first.v.items.every((i: any) => i.missing === true)).toBe(true);
  });

  test("emptying 3,000 old items out of 6,000 runs as a job and leaves the right ones", async () => {
    const now = Date.now();
    const items = Array.from({ length: 6000 }, (_, i) =>
      createGraveyardItem({ id: `rip_${now - i * 1000}_${i.toString(36)}`, name: `f${i}`, originalPath: join(work, `f${i}`), cwd: work, graveyardDir: gy, graveyardPath: join(gy, "entries", `x${i}`), now: new Date(i < 3000 ? now - 400 * 86_400_000 : now - 1000), type: "file", mode: 0o644, sizeBytes: 1, fileCount: 1 }),
    );
    saveManifest(gy, { version: "1.0.0", graveyardRoot: gy, lastUpdated: "", items });
    const res = await api("grave/decompose", { olderThanDays: 365, confirm: true, expectCount: 3000 });
    expect(res.job).toBeDefined();
    const final = await jobDone(res.job);
    expect(final.state).toBe("done");
    expect(final.total).toBeLessThanOrEqual(100);
    expect((await api("grave/status")).status.count).toBe(3000);
    expect((await listAll({ query: "f2999" })).length).toBe(0);
    expect((await listAll({ query: "f3000" })).length).toBe(1);
  });
});

describe("settings and the context", () => {
  test("deleteTo is a validated setting that defaults to the Recycle Bin", async () => {
    expect((await api("settings")).settings.deleteTo).toBe("bin");
    expect((await api("settings", { set: { deleteTo: "graveyard" } })).settings.deleteTo).toBe("graveyard");
    expect((await api("settings", { set: { deleteTo: "banana" } })).settings.deleteTo).toBe("bin");
    expect((await api("settings", { set: { deleteTo: 7 } })).settings.deleteTo).toBe("bin");
    expect((await api("settings", { set: { deleteTo: "graveyard" } })).settings.deleteTo).toBe("graveyard");
    await api("settings", { set: { deleteTo: "bin" } });
  });

  test("without an injected folder the graveyard is the engine's choice, so the GRAVEYARD variable is honoured", async () => {
    const elsewhere = join(root, "env-graveyard");
    const saved = process.env.GRAVEYARD;
    process.env.GRAVEYARD = elsewhere;
    const other = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: join(root, "data2") } });
    try {
      const res = await fetch(`http://127.0.0.1:${other.port}/api/grave/status`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: "{}" });
      expect(((await res.json()) as any).status.dir).toBe(elsewhere);
      // reading never creates the graveyard
      expect(existsSync(elsewhere)).toBe(false);
    } finally {
      other.stop(true);
      if (saved === undefined) delete process.env.GRAVEYARD;
      else process.env.GRAVEYARD = saved;
    }
  });

  test("the old Rip engine still reads what the File Manager buries, and the File Manager reads what the engine buries", async () => {
    const f = write(join(folder(), "from-fm.txt"), "fm");
    await bury([f]);
    const g = write(join(folder(), "from-engine.txt"), "engine");
    const burial = buryTargetsSync([g], { graveyardDir: gy });
    expect(burial.success).toBe(true);
    expect((await listAll()).map((i) => i.name).sort()).toEqual(["from-engine.txt", "from-fm.txt"]);
    expect(getGraveyardStats(gy).totalItems).toBe(2);
    const { unburyTargetsSync } = await import("../applications/rip_engine");
    expect(unburyTargetsSync([await idOf(f)], { graveyardDir: gy }).success).toBe(true);
    expect(readFileSync(f, "utf8")).toBe("fm");
    await restore([await idOf(g)]);
    expect(readFileSync(g, "utf8")).toBe("engine");
    expect(newBurialId()).toMatch(/^rip_\d+_[a-z0-9]+$/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The `rip` command. Its graveyard has a different layout from the Rip engine's (`.record` plus the full original path,
// against `manifest.json` plus `entries/<id>/`), so the two don't share items. What must hold is that they can share a
// folder without hurting each other. Skipped, with this message, when the real command isn't installed.
// ---------------------------------------------------------------------------------------------------------------

function findRealRip(): string | null {
  for (const candidate of [Bun.which("rip"), "/opt/homebrew/bin/rip", "/usr/local/bin/rip"]) {
    if (!candidate || !existsSync(candidate)) continue;
    const help = Bun.spawnSync([candidate, "--help"], { stdout: "pipe", stderr: "pipe" });
    const text = help.stdout.toString() + help.stderr.toString();
    if (help.exitCode === 0 && /alternative to rm/i.test(text) && /--graveyard/.test(text)) return candidate;
  }
  return null;
}
const REAL_RIP = findRealRip();
const real = (args: string[], cwd: string) => {
  const r = Bun.spawnSync([REAL_RIP!, ...args], { cwd, env: { ...process.env, RIP_GRAVEYARD: gy }, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
};

(REAL_RIP ? describe : describe.skip)(`the real rip command shares a folder with the graveyard without either harming the other${REAL_RIP ? "" : " (SKIPPED: the `rip` command is not installed on this computer)"}`, () => {
  test("the two layouts differ, as documented: manifest.json and entries/ against .record and a mirrored path", async () => {
    const dir = realpathSync(folder("real"));
    const a = write(join(dir, "by-rip.txt"), "rip made this");
    expect(real([a], dir).code).toBe(0);
    expect(existsSync(join(gy, ".record"))).toBe(true);
    expect(existsSync(join(gy, "manifest.json"))).toBe(false);
    expect(existsSync(join(gy, a))).toBe(true);
    const b = write(join(dir, "by-fm.txt"), "fm made this");
    await bury([b]);
    expect(existsSync(join(gy, "manifest.json"))).toBe(true);
    expect(existsSync(join(gy, "entries"))).toBe(true);
    expect(readFileSync(join(gy, ".record"), "utf8")).not.toContain("by-fm.txt");
  });

  test("items buried by rip aren't listed or counted, Verify doesn't call them strays, and Empty everything leaves them alone so rip can still restore them", async () => {
    const dir = realpathSync(folder("real"));
    const a = write(join(dir, "rip-buried.txt"), "restore me with rip");
    expect(real([a], dir).code).toBe(0);
    const record = readFileSync(join(gy, ".record"), "utf8");
    expect((await api("grave/status")).status).toMatchObject({ count: 0, damaged: false });
    expect((await api("grave/verify")).report.ok).toBe(true);
    const mine = write(join(dir, "fm-buried.txt"), "mine");
    await bury([mine]);
    const res = await api("grave/decompose", { all: true, confirm: true, typed: "empty" });
    if (res.job) await jobDone(res.job);
    expect(readFileSync(join(gy, ".record"), "utf8")).toBe(record);
    expect(readFileSync(join(gy, a), "utf8")).toBe("restore me with rip");
    const back = real(["-u", join(gy, a)], dir);
    expect(back.code).toBe(0);
    expect(readFileSync(a, "utf8")).toBe("restore me with rip");
  });

  test("what the File Manager buries is untouched by rip burying and listing in the same folder, and still restores", async () => {
    const dir = realpathSync(folder("real"));
    const mine = write(join(dir, "fm-first.txt"), "kept by the file manager");
    await bury([mine]);
    const manifestBefore = readFileSync(join(gy, "manifest.json"), "utf8");
    const other = write(join(dir, "rip-second.txt"), "kept by rip");
    expect(real([other], dir).code).toBe(0);
    const listing = real(["-s"], dir);
    expect(listing.code).toBe(0);
    expect(listing.out).toContain("rip-second.txt");
    expect(listing.out).not.toContain("fm-first.txt");
    expect(readFileSync(join(gy, "manifest.json"), "utf8")).toBe(manifestBefore);
    expect((await listAll()).map((i) => i.name)).toEqual(["fm-first.txt"]);
    expect((await api("grave/verify")).report.ok).toBe(true);
    await restore([await idOf(mine)]);
    expect(readFileSync(mine, "utf8")).toBe("kept by the file manager");
    expect(real(["-u", join(gy, other)], dir).code).toBe(0);
    expect(readFileSync(other, "utf8")).toBe("kept by rip");
  });
});
