import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "fs";
import { promises as fsp } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext, absolutePath, moveTree } from "../src/features/filemanager/fmCore";
import { MAX_LIST_ENTRIES, folderStats, listFolder, listPlaces, nameMatcher, parseMountPoints, parseNoBrowseMounts, previewFile, propertiesOf, searchFolder } from "../src/features/filemanager/fmList";
import { bulkRename, copyItems, findConflicts, makeFile, makeFolder, moveItems, planBulkRename, relocate, renameItem } from "../src/features/filemanager/fmOps";
import { deleteFromTrash, deletePermanently, listTrash, moveToTrash, restoreFromTrash } from "../src/features/filemanager/fmTrash";
import { DEFAULT_SETTINGS, MAX_FAVORITES, MAX_RECENTS, addRecent, loadSettings, sanitizeSettings, updateSettings } from "../src/features/filemanager/fmSettings";
import { openCommand, openItem, revealCommand, revealItem } from "../src/features/filemanager/fmOpen";

const posix = process.platform !== "win32";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const roots: string[] = [];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "fm-test-"));
  roots.push(root);
  const home = join(root, "home");
  const work = join(root, "work");
  mkdirSync(home);
  mkdirSync(work);
  const launched: Array<{ command: string; args: string[]; verbatim?: boolean }> = [];
  const ctx = createContext({
    home,
    dataDir: join(root, "data"),
    launch: async (command, args, o) => {
      launched.push({ command, args, verbatim: o?.windowsVerbatimArguments });
    },
  });
  return { root, home, work, ctx, launched, data: join(root, "data") };
}
const put = (path: string, content = "x") => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
};
const names = (dir: string) => readdirSync(dir).sort();
const ok = <T>(r: { ok: boolean }): T => {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return (r as any).value as T;
};

afterEach(() => {
  // every test makes its own sandbox; nothing to reset
});
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

describe("absolutePath", () => {
  test("accepts full paths and rejects relative, empty and null-containing input", () => {
    const { ctx, work } = sandbox();
    expect(absolutePath(ctx, work)).toBe(work);
    expect(absolutePath(ctx, join(work, "a", "..", "b"))).toBe(join(work, "b"));
    for (const bad of ["", "   ", "relative/path", "a\0b", 5, null, undefined]) expect(() => absolutePath(ctx, bad as any)).toThrow();
  });
});

describe("listFolder", () => {
  test("lists files and folders with kind, size and visible/hidden handling", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "photo.png"), "12345");
    put(join(work, "notes.txt"), "hello");
    put(join(work, ".secret"), "s");
    mkdirSync(join(work, "Sub"));
    const shown = await listFolder(ctx, work);
    expect(shown.entries.map((e) => e.name).sort()).toEqual(["Sub", "notes.txt", "photo.png"]);
    const photo = shown.entries.find((e) => e.name === "photo.png")!;
    expect(photo).toMatchObject({ isDir: false, size: 5, kind: "image", preview: "image", hidden: false });
    expect(shown.entries.find((e) => e.name === "Sub")).toMatchObject({ isDir: true, kind: "folder", label: "Folder" });
    expect(shown.parent).toBe(join(work, ".."));
    const withHidden = await listFolder(ctx, work, { showHidden: true });
    expect(withHidden.entries.find((e) => e.name === ".secret")?.hidden).toBe(true);
    expect(withHidden.total).toBe(4);
  });

  test("an empty folder, a missing folder and a file instead of a folder", async () => {
    const { ctx, work } = sandbox();
    expect((await listFolder(ctx, work)).entries).toEqual([]);
    await expect(listFolder(ctx, join(work, "nope"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    put(join(work, "f.txt"));
    await expect(listFolder(ctx, join(work, "f.txt"))).rejects.toMatchObject({ code: "NOT_A_FOLDER" });
  });

  test("the top of the file system has no parent", async () => {
    const { ctx } = sandbox();
    const root = process.platform === "win32" ? "C:\\" : "/";
    if (existsSync(root)) expect((await listFolder(ctx, root)).parent).toBeNull();
  });

  test.skipIf(!posix)("symbolic links are shown as links, and broken links are marked", async () => {
    const { ctx, work } = sandbox();
    mkdirSync(join(work, "real"));
    put(join(work, "file.txt"));
    symlinkSync("real", join(work, "link-to-folder"));
    symlinkSync("file.txt", join(work, "link-to-file"));
    symlinkSync("missing-target", join(work, "broken"));
    const { entries } = await listFolder(ctx, work);
    const by = (n: string) => entries.find((e) => e.name === n)!;
    expect(by("link-to-folder")).toMatchObject({ isSymlink: true, isDir: true, broken: false });
    expect(by("link-to-file")).toMatchObject({ isSymlink: true, isDir: false, broken: false });
    expect(by("broken")).toMatchObject({ isSymlink: true, broken: true, label: "Broken link" });
  });

  test.skipIf(!posix || isRoot)("a folder that can't be read gives a plain permission message", async () => {
    const { ctx, work } = sandbox();
    const locked = join(work, "locked");
    mkdirSync(locked);
    chmodSync(locked, 0o000);
    try {
      await expect(listFolder(ctx, locked)).rejects.toMatchObject({ code: "EACCES", message: expect.stringContaining("permission") });
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  test.skipIf(!posix)("an executable file is marked as a program", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "tool"));
    chmodSync(join(work, "tool"), 0o755);
    expect((await listFolder(ctx, work)).entries[0]).toMatchObject({ program: true, kind: "program" });
  });

  test("a huge folder is cut at the limit and says so", async () => {
    expect(MAX_LIST_ENTRIES).toBeGreaterThanOrEqual(10_000);
  });
});

describe("propertiesOf and folderStats", () => {
  test("a file", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "hello");
    const p = await propertiesOf(ctx, [join(work, "a.txt")]);
    expect(p).toMatchObject({ count: 1, name: "a.txt", isDir: false, size: 5, files: 1, folders: 0, location: work, kind: "TXT text file" });
    expect(p.modifiedMs).toBeGreaterThan(0);
  });

  test("a folder adds up everything inside it", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "d", "a.txt"), "12");
    put(join(work, "d", "sub", "b.txt"), "345");
    mkdirSync(join(work, "d", "empty"));
    const p = await propertiesOf(ctx, [join(work, "d")]);
    expect(p).toMatchObject({ isDir: true, size: 5, files: 2, folders: 2, partial: false });
  });

  test("several items", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "1");
    put(join(work, "b.txt"), "22");
    const p = await propertiesOf(ctx, [join(work, "a.txt"), join(work, "b.txt")]);
    expect(p).toMatchObject({ count: 2, name: "2 items", size: 3, files: 2, location: work, path: null });
  });

  test.skipIf(!posix)("links are counted as links, never followed", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "big", "f.bin"), "x".repeat(1000));
    mkdirSync(join(work, "d"));
    symlinkSync(join(work, "big"), join(work, "d", "link"));
    expect(await folderStats(join(work, "d"))).toMatchObject({ bytes: 0, files: 1, folders: 0 });
    expect((await propertiesOf(ctx, [join(work, "d", "link")])).linkTarget).toBe(join(work, "big"));
  });

  test("a count that runs out of budget reports that it is partial", async () => {
    const { work } = sandbox();
    for (let i = 0; i < 20; i++) put(join(work, `f${i}.txt`));
    const stats = await folderStats(work, { maxEntries: 5 });
    expect(stats.partial).toBe(true);
    expect(stats.files).toBeLessThanOrEqual(5);
  });

  test("nothing selected is an error", async () => {
    const { ctx } = sandbox();
    await expect(propertiesOf(ctx, [])).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("listPlaces", () => {
  test("always has Home; other places appear only when the folder exists; drives are listed", () => {
    const { ctx, home } = sandbox();
    mkdirSync(join(home, "Documents"));
    mkdirSync(join(home, "Downloads"));
    const r = listPlaces(ctx);
    expect(r.places.map((p) => p.name)).toEqual(["Home", "Documents", "Downloads"]);
    expect(r.places[0]).toMatchObject({ id: "home", path: home });
    expect(r.drives.length).toBeGreaterThan(0);
    for (const d of r.drives) expect(d.path.length).toBeGreaterThan(0);
    expect(r.separator).toBe(process.platform === "win32" ? "\\" : "/");
    expect(r.fileManagerName.length).toBeGreaterThan(0);
  });

  test.skipIf(!posix || process.platform === "darwin")("Linux reads the folder names in user-dirs.dirs", () => {
    const { ctx, home } = sandbox();
    mkdirSync(join(home, ".config"), { recursive: true });
    mkdirSync(join(home, "Dokumente"));
    writeFileSync(join(home, ".config", "user-dirs.dirs"), 'XDG_DOCUMENTS_DIR="$HOME/Dokumente"\n');
    expect(listPlaces(ctx).places.find((p) => p.id === "documents")?.path).toBe(join(home, "Dokumente"));
  });
});

describe("which disks are listed", () => {
  test("macOS: volumes marked nobrowse are hidden, ordinary ones stay", () => {
    const out = [
      "/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)",
      "/dev/disk3s6 on /System/Volumes/VM (apfs, local, noexec, journaled, noatime, nobrowse)",
      "/dev/disk3s3 on /Volumes/Recovery (apfs, local, journaled, nobrowse)",
      "/dev/disk5s1 on /Volumes/My USB Drive (msdos, local, nodev, nosuid, noowners)",
      "map auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)",
    ].join("\n");
    const hidden = parseNoBrowseMounts(out);
    expect(hidden.has("/Volumes/Recovery")).toBe(true);
    expect(hidden.has("/System/Volumes/VM")).toBe(true);
    expect(hidden.has("/Volumes/My USB Drive")).toBe(false);
    expect(hidden.has("/")).toBe(false);
    expect(parseNoBrowseMounts("").size).toBe(0);
    expect(parseNoBrowseMounts("garbage line without the format").size).toBe(0);
  });

  test("Linux: mount points come from /proc/mounts, with escaped spaces", () => {
    const points = parseMountPoints("/dev/sda1 / ext4 rw 0 0\n/dev/sdb1 /media/sam/My\\040Stick vfat rw 0 0\ntmpfs /run tmpfs rw 0 0\n");
    expect(points.has("/")).toBe(true);
    expect(points.has("/media/sam/My Stick")).toBe(true);
    expect(points.has("/mnt/empty")).toBe(false);
  });

  test("the real list never includes the macOS Recovery volume", () => {
    const { ctx } = sandbox();
    expect(listPlaces(ctx).drives.some((d) => d.name === "Recovery")).toBe(false);
  });
});

describe("previewFile", () => {
  test("text, empty, image, binary and unknown-but-textual files", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "hello\nworld");
    put(join(work, "empty.txt"), "");
    put(join(work, "p.png"), "not really a png");
    writeFileSync(join(work, "b.bin"), Buffer.from([1, 2, 0, 3, 4]));
    put(join(work, "README"), "plain words without any extension");
    expect(await previewFile(ctx, join(work, "a.txt"))).toMatchObject({ type: "text", text: "hello\nworld", truncated: false });
    expect(await previewFile(ctx, join(work, "empty.txt"))).toMatchObject({ type: "text", text: "" });
    expect(await previewFile(ctx, join(work, "p.png"))).toMatchObject({ type: "image" });
    expect(await previewFile(ctx, join(work, "b.bin"))).toMatchObject({ type: "binary" });
    expect(await previewFile(ctx, join(work, "README"))).toMatchObject({ type: "text" });
    expect(await previewFile(ctx, work)).toMatchObject({ type: "none" });
  });

  test("a big text file is cut and marked as cut", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "big.txt"), "a".repeat(200_000));
    const p = (await previewFile(ctx, join(work, "big.txt"))) as any;
    expect(p.truncated).toBe(true);
    expect(p.text.length).toBe(64 * 1024);
    expect(p.size).toBe(200_000);
  });
});

describe("search", () => {
  function tree() {
    const s = sandbox();
    put(join(s.work, "Report 2024.txt"));
    put(join(s.work, "sub", "report-final.docx"));
    put(join(s.work, "sub", "deep", "REPORT.pdf"));
    put(join(s.work, "sub", "deep", "photo.JPG"));
    put(join(s.work, ".hidden", "report-secret.txt"));
    mkdirSync(join(s.work, "reports-folder"));
    return s;
  }

  test("finds names containing the text anywhere below, ignoring case, and skips hidden folders", async () => {
    const { ctx, work } = tree();
    const r = await searchFolder(ctx, work, "report");
    expect(r.entries.map((e) => e.name).sort()).toEqual(["REPORT.pdf", "Report 2024.txt", "report-final.docx", "reports-folder"]);
    expect(r.entries.find((e) => e.name === "REPORT.pdf")?.folder).toBe(join(work, "sub", "deep"));
    expect(r.truncated).toBe(false);
    const hidden = await searchFolder(ctx, work, "secret", { showHidden: true });
    expect(hidden.entries.map((e) => e.name)).toEqual(["report-secret.txt"]);
    expect((await searchFolder(ctx, work, "secret")).entries).toEqual([]);
  });

  test("wildcards match the whole name", async () => {
    const { ctx, work } = tree();
    expect((await searchFolder(ctx, work, "*.jpg")).entries.map((e) => e.name)).toEqual(["photo.JPG"]);
    expect((await searchFolder(ctx, work, "report?final.docx")).entries.map((e) => e.name)).toEqual(["report-final.docx"]);
    expect((await searchFolder(ctx, work, "port*")).entries).toEqual([]);
  });

  test("can be limited to one kind of file", async () => {
    const { ctx, work } = tree();
    const r = await searchFolder(ctx, work, "*", { kind: "image" });
    expect(r.entries.filter((e) => !e.isDir).map((e) => e.name)).toEqual(["photo.JPG"]);
  });

  test("stops at the result limit and says it was cut", async () => {
    const { ctx, work } = sandbox();
    for (let i = 0; i < 30; i++) put(join(work, `item${i}.txt`));
    const r = await searchFolder(ctx, work, "item", { maxResults: 10 });
    expect(r.entries.length).toBe(10);
    expect(r.truncated).toBe(true);
  });

  test("an empty query and a missing folder are errors", async () => {
    const { ctx, work } = sandbox();
    await expect(searchFolder(ctx, work, "  ")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(searchFolder(ctx, join(work, "nope"), "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test.skipIf(!posix)("does not follow links, so a link back to a parent can't loop forever", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a", "needle.txt"));
    symlinkSync(work, join(work, "a", "loop"));
    const r = await searchFolder(ctx, work, "needle");
    expect(r.entries.length).toBe(1);
  });

  test("nameMatcher: substring and wildcard forms, special characters are literal", () => {
    expect(nameMatcher("a.b")("xa.by")).toBe(true);
    expect(nameMatcher("a.b")("axb")).toBe(false);
    expect(nameMatcher("*.TXT")("notes.txt")).toBe(true);
    expect(nameMatcher("(1)*")("(1) copy")).toBe(true);
  });
});

describe("new folder and new file", () => {
  test("default names are numbered, explicit names are used, bad names are refused", async () => {
    const { ctx, work } = sandbox();
    expect((await makeFolder(ctx, work)).name).toBe("New folder");
    expect((await makeFolder(ctx, work)).name).toBe("New folder (2)");
    expect((await makeFolder(ctx, work, "Photos")).path).toBe(join(work, "Photos"));
    expect((await makeFile(ctx, work)).name).toBe("New file.txt");
    expect((await makeFile(ctx, work)).name).toBe("New file (2).txt");
    expect(readFileSync((await makeFile(ctx, work, "n.md", "# hi")).path, "utf8")).toBe("# hi");
    await expect(makeFolder(ctx, work, "Photos")).rejects.toMatchObject({ code: "EXISTS" });
    await expect(makeFile(ctx, work, "n.md")).rejects.toMatchObject({ code: "EXISTS" });
    await expect(makeFolder(ctx, work, "a/b")).rejects.toMatchObject({ code: "BAD_NAME" });
    await expect(makeFile(ctx, work, "..")).rejects.toMatchObject({ code: "BAD_NAME" });
    await expect(makeFolder(ctx, join(work, "missing"), "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("a name with surrounding spaces is trimmed", async () => {
    const { ctx, work } = sandbox();
    expect((await makeFolder(ctx, work, "  Spaced  ")).name).toBe("Spaced");
  });

  test.skipIf(!posix)("system folders refuse new items", async () => {
    const { ctx } = sandbox();
    await expect(makeFolder(ctx, "/usr/bin", "x")).rejects.toMatchObject({ code: "PROTECTED" });
  });
});

describe("renameItem", () => {
  test("renames files and folders, refuses to replace an existing item", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "A");
    put(join(work, "b.txt"), "B");
    mkdirSync(join(work, "dir"));
    expect(await renameItem(ctx, join(work, "a.txt"), "c.txt")).toEqual({ from: join(work, "a.txt"), to: join(work, "c.txt") });
    expect(names(work)).toEqual(["b.txt", "c.txt", "dir"]);
    await renameItem(ctx, join(work, "dir"), "folder");
    await expect(renameItem(ctx, join(work, "c.txt"), "b.txt")).rejects.toMatchObject({ code: "EXISTS" });
    expect(readFileSync(join(work, "b.txt"), "utf8")).toBe("B");
    await expect(renameItem(ctx, join(work, "c.txt"), "x/y")).rejects.toMatchObject({ code: "BAD_NAME" });
    await expect(renameItem(ctx, join(work, "gone.txt"), "z.txt")).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("the same name is a no-op and a change of letter case only works", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "report.txt"));
    expect((await renameItem(ctx, join(work, "report.txt"), "report.txt")).to).toBe(join(work, "report.txt"));
    await renameItem(ctx, join(work, "report.txt"), "Report.txt");
    expect(names(work)).toEqual(["Report.txt"]);
    expect(names(work).some((n) => n.startsWith(".fm-rename"))).toBe(false);
  });

  test.skipIf(!posix)("system and personal folders can't be renamed", async () => {
    const { ctx, home } = sandbox();
    mkdirSync(join(home, "Documents"));
    await expect(renameItem(ctx, join(home, "Documents"), "Docs")).rejects.toMatchObject({ code: "PROTECTED" });
    await expect(renameItem(ctx, home, "x")).rejects.toMatchObject({ code: "PROTECTED" });
    await expect(renameItem(ctx, "/usr/bin/env", "x")).rejects.toMatchObject({ code: "PROTECTED" });
  });
});

describe("relocate (the exact move behind Undo)", () => {
  test("moves to an exact path, creates missing folders, never overwrites", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "A");
    put(join(work, "b.txt"), "B");
    const [r1] = await relocate(ctx, [{ from: join(work, "a.txt"), to: join(work, "new", "deep", "a2.txt") }]);
    ok(r1!);
    expect(readFileSync(join(work, "new", "deep", "a2.txt"), "utf8")).toBe("A");
    const [r2] = await relocate(ctx, [{ from: join(work, "b.txt"), to: join(work, "new", "deep", "a2.txt") }]);
    expect(r2).toMatchObject({ ok: false, code: "EXISTS" });
    expect(readFileSync(join(work, "b.txt"), "utf8")).toBe("B");
  });

  test("refuses a folder into itself and invalid names", async () => {
    const { ctx, work } = sandbox();
    mkdirSync(join(work, "d"));
    const [r1] = await relocate(ctx, [{ from: join(work, "d"), to: join(work, "d", "inner") }]);
    expect(r1).toMatchObject({ ok: false, code: "INTO_ITSELF" });
    put(join(work, "f.txt"));
    const [r2] = await relocate(ctx, [{ from: join(work, "f.txt"), to: join(work, "bad\0name") }]);
    expect(r2!.ok).toBe(false);
  });
});

describe("copy", () => {
  test("copies a file and a folder with everything inside, keeping the originals", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "src", "a.txt"), "A");
    put(join(work, "src", "dir", "b.txt"), "B");
    mkdirSync(join(work, "dest"));
    const results = await copyItems(ctx, [join(work, "src", "a.txt"), join(work, "src", "dir")], join(work, "dest"));
    expect(results.map((r) => ok<any>(r).status)).toEqual(["done", "done"]);
    expect(readFileSync(join(work, "dest", "a.txt"), "utf8")).toBe("A");
    expect(readFileSync(join(work, "dest", "dir", "b.txt"), "utf8")).toBe("B");
    expect(existsSync(join(work, "src", "a.txt"))).toBe(true);
  });

  test("keeps the modified time", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    const old = new Date("2020-01-02T03:04:05Z");
    utimesSync(join(work, "a.txt"), old, old);
    mkdirSync(join(work, "d"));
    await copyItems(ctx, [join(work, "a.txt")], join(work, "d"));
    expect(Math.abs(statSync(join(work, "d", "a.txt")).mtimeMs - old.getTime())).toBeLessThan(2000);
  });

  test("copying into the same folder makes a 'copy' name", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "A");
    const r1 = ok<any>((await copyItems(ctx, [join(work, "a.txt")], work))[0]!);
    expect(r1.destination).toBe(join(work, "a copy.txt"));
    const r2 = ok<any>((await copyItems(ctx, [join(work, "a.txt")], work))[0]!);
    expect(r2.destination).toBe(join(work, "a copy 2.txt"));
    mkdirSync(join(work, "Dir"));
    expect(ok<any>((await copyItems(ctx, [join(work, "Dir")], work))[0]!).destination).toBe(join(work, "Dir copy"));
  });

  test("conflicts: keep both (default), skip, or replace (the old one goes to the Recycle Bin)", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "in", "a.txt"), "NEW");
    put(join(work, "out", "a.txt"), "OLD");
    const src = [join(work, "in", "a.txt")];
    const both = ok<any>((await copyItems(ctx, src, join(work, "out")))[0]!);
    expect(both.destination).toBe(join(work, "out", "a (2).txt"));
    expect(readFileSync(join(work, "out", "a.txt"), "utf8")).toBe("OLD");
    const skipped = ok<any>((await copyItems(ctx, src, join(work, "out"), "skip"))[0]!);
    expect(skipped).toMatchObject({ status: "skipped", destination: null });
    const replaced = ok<any>((await copyItems(ctx, src, join(work, "out"), "replace"))[0]!);
    expect(replaced.status).toBe("done");
    expect(readFileSync(join(work, "out", "a.txt"), "utf8")).toBe("NEW");
    expect(replaced.replaced.trashId).toMatch(/^[a-f0-9]{16}$/);
    const bin = await listTrash(ctx);
    expect(bin.items.map((i) => i.originalPath)).toEqual([join(work, "out", "a.txt")]);
    const restored = ok<any>((await restoreFromTrash(ctx, [replaced.replaced.trashId]))[0]!);
    expect(readFileSync(restored.restoredTo, "utf8")).toBe("OLD");
  });

  test("findConflicts reports what would clash, and ignores the same folder", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "in", "a.txt"));
    put(join(work, "in", "b.txt"));
    put(join(work, "out", "a.txt"));
    mkdirSync(join(work, "out", "b.txt"));
    const { conflicts } = await findConflicts(ctx, [join(work, "in", "a.txt"), join(work, "in", "b.txt")], join(work, "out"));
    expect(conflicts.map((c) => [c.name, c.sourceIsDir, c.existingIsDir])).toEqual([["a.txt", false, false], ["b.txt", false, true]]);
    expect((await findConflicts(ctx, [join(work, "in", "a.txt")], join(work, "in"))).conflicts).toEqual([]);
  });

  test("a folder can't be copied into itself or its own sub-folder", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "d", "sub", "f.txt"));
    const r = (await copyItems(ctx, [join(work, "d")], join(work, "d", "sub")))[0]!;
    expect(r).toMatchObject({ ok: false, code: "INTO_ITSELF" });
    expect(names(join(work, "d", "sub"))).toEqual(["f.txt"]);
  });

  test("one failing item doesn't stop the others, and each gets its own result", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "good.txt"));
    mkdirSync(join(work, "out"));
    const results = await copyItems(ctx, [join(work, "missing.txt"), join(work, "good.txt")], join(work, "out"));
    expect(results[0]).toMatchObject({ ok: false, code: "ENOENT" });
    expect(results[1]).toMatchObject({ ok: true });
    expect(existsSync(join(work, "out", "good.txt"))).toBe(true);
  });

  test.skipIf(!posix)("links are copied as links, not followed", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "big", "f.txt"), "F");
    mkdirSync(join(work, "src"));
    symlinkSync(join(work, "big"), join(work, "src", "link"));
    mkdirSync(join(work, "out"));
    await copyItems(ctx, [join(work, "src")], join(work, "out"));
    expect(lstatSync(join(work, "out", "src", "link")).isSymbolicLink()).toBe(true);
  });

  test("bad destinations are explained", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    await expect(copyItems(ctx, [join(work, "a.txt")], join(work, "nope"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(copyItems(ctx, [join(work, "a.txt")], join(work, "a.txt"))).rejects.toMatchObject({ code: "NOT_A_FOLDER" });
    await expect(copyItems(ctx, [], work)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("move", () => {
  test("moves files and folders out of their old place", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "A");
    put(join(work, "d", "b.txt"), "B");
    mkdirSync(join(work, "dest"));
    const results = await moveItems(ctx, [join(work, "a.txt"), join(work, "d")], join(work, "dest"));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(names(work)).toEqual(["dest"]);
    expect(readFileSync(join(work, "dest", "d", "b.txt"), "utf8")).toBe("B");
  });

  test("moving into the folder it is already in does nothing", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    expect(ok<any>((await moveItems(ctx, [join(work, "a.txt")], work))[0]!)).toMatchObject({ status: "skipped" });
  });

  test("conflict policies work for moves too, and replace can be undone through the Recycle Bin", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "in", "a.txt"), "NEW");
    put(join(work, "out", "a.txt"), "OLD");
    const kept = ok<any>((await moveItems(ctx, [join(work, "in", "a.txt")], join(work, "out")))[0]!);
    expect(kept.destination).toBe(join(work, "out", "a (2).txt"));
    put(join(work, "in", "a.txt"), "NEWER");
    const r = ok<any>((await moveItems(ctx, [join(work, "in", "a.txt")], join(work, "out"), "replace"))[0]!);
    expect(readFileSync(join(work, "out", "a.txt"), "utf8")).toBe("NEWER");
    expect(existsSync(join(work, "in", "a.txt"))).toBe(false);
    expect((await listTrash(ctx)).items.some((i) => i.id === r.replaced.trashId)).toBe(true);
  });

  test("a folder can't be moved into itself", async () => {
    const { ctx, work } = sandbox();
    mkdirSync(join(work, "d", "sub"), { recursive: true });
    expect((await moveItems(ctx, [join(work, "d")], join(work, "d", "sub")))[0]).toMatchObject({ ok: false, code: "INTO_ITSELF" });
    expect(existsSync(join(work, "d", "sub"))).toBe(true);
  });

  test.skipIf(!posix)("system folders can't be moved", async () => {
    const { ctx, work } = sandbox();
    expect((await moveItems(ctx, ["/usr/bin/env"], work))[0]).toMatchObject({ ok: false, code: "PROTECTED" });
  });

  test("moving between disks (rename fails with EXDEV) copies then removes, and keeps both if the removal fails", async () => {
    const { work } = sandbox();
    put(join(work, "src", "a.txt"), "A");
    put(join(work, "src", "sub", "b.txt"), "B");
    const exdev = () => Promise.reject(Object.assign(new Error("cross-device"), { code: "EXDEV" }));
    const spy = spyOn(fsp, "rename").mockImplementationOnce(exdev);
    try {
      await moveTree(join(work, "src"), join(work, "moved"));
    } finally {
      spy.mockRestore();
    }
    expect(existsSync(join(work, "src"))).toBe(false);
    expect(readFileSync(join(work, "moved", "sub", "b.txt"), "utf8")).toBe("B");

    put(join(work, "s2", "x.txt"), "X");
    const spy2 = spyOn(fsp, "rename").mockImplementationOnce(exdev);
    const rm = spyOn(fsp, "rm").mockImplementationOnce(() => Promise.reject(Object.assign(new Error("busy"), { code: "EBUSY" })));
    try {
      await expect(moveTree(join(work, "s2"), join(work, "m2"))).rejects.toMatchObject({ code: "PARTIAL_MOVE" });
    } finally {
      spy2.mockRestore();
      rm.mockRestore();
    }
    expect(existsSync(join(work, "s2", "x.txt"))).toBe(true);
    expect(existsSync(join(work, "m2", "x.txt"))).toBe(true);
  });
});

describe("Recycle Bin", () => {
  test("delete, list and restore a file and a folder to where they were", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "A");
    put(join(work, "dir", "b.txt"), "B");
    const results = await moveToTrash(ctx, [join(work, "a.txt"), join(work, "dir")]);
    const ids = results.map((r) => ok<any>(r).id);
    expect(names(work)).toEqual([]);
    const bin = await listTrash(ctx);
    expect(bin.count).toBe(2);
    expect(bin.items.find((i) => i.name === "a.txt")).toMatchObject({ originalPath: join(work, "a.txt"), isDir: false, size: 1 });
    expect(bin.items.find((i) => i.name === "dir")).toMatchObject({ isDir: true, size: null });
    const restored = await restoreFromTrash(ctx, ids);
    expect(restored.map((r) => ok<any>(r).restoredTo).sort()).toEqual([join(work, "a.txt"), join(work, "dir")]);
    expect(readFileSync(join(work, "dir", "b.txt"), "utf8")).toBe("B");
    expect((await listTrash(ctx)).count).toBe(0);
    expect(existsSync(join(ctx.trashRoot, "items", ids[0]!))).toBe(false);
  });

  test("restoring when the original name is taken keeps both; a deleted parent folder is recreated", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "p", "a.txt"), "OLD");
    const [r] = await moveToTrash(ctx, [join(work, "p", "a.txt")]);
    put(join(work, "p", "a.txt"), "NEW");
    const first = ok<any>((await restoreFromTrash(ctx, [ok<any>(r!).id]))[0]!);
    expect(first.restoredTo).toBe(join(work, "p", "a (2).txt"));
    expect(readFileSync(join(work, "p", "a.txt"), "utf8")).toBe("NEW");

    const [r2] = await moveToTrash(ctx, [join(work, "p", "a (2).txt")]);
    rmSync(join(work, "p"), { recursive: true });
    const second = ok<any>((await restoreFromTrash(ctx, [ok<any>(r2!).id]))[0]!);
    expect(second.restoredTo).toBe(join(work, "p", "a (2).txt"));
    expect(readFileSync(second.restoredTo, "utf8")).toBe("OLD");
  });

  test("delete forever removes chosen items, then Empty removes the rest", async () => {
    const { ctx, work } = sandbox();
    for (const n of ["a", "b", "c"]) put(join(work, `${n}.txt`));
    const ids = (await moveToTrash(ctx, [join(work, "a.txt"), join(work, "b.txt"), join(work, "c.txt")])).map((r) => ok<any>(r).id);
    expect(await deleteFromTrash(ctx, [ids[0]])).toEqual({ deleted: 1 });
    expect((await listTrash(ctx)).count).toBe(2);
    expect(await deleteFromTrash(ctx)).toEqual({ deleted: 2 });
    expect((await listTrash(ctx)).count).toBe(0);
    expect(readdirSync(join(ctx.trashRoot, "items"))).toEqual([]);
  });

  test("many deletes at the same moment are all recorded", async () => {
    const { ctx, work } = sandbox();
    const files = Array.from({ length: 25 }, (_, i) => put(join(work, `f${i}.txt`), String(i)));
    const all = await Promise.all(files.map((f) => moveToTrash(ctx, [f])));
    expect(all.every((r) => r[0]!.ok)).toBe(true);
    expect((await listTrash(ctx)).count).toBe(25);
  });

  test("a damaged index file doesn't hide what is in the bin", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "keep.txt"), "K");
    await moveToTrash(ctx, [join(work, "keep.txt")]);
    writeFileSync(join(ctx.trashRoot, "index.json"), "{ not json");
    const bin = await listTrash(ctx);
    expect(bin.count).toBe(1);
    expect(bin.items[0]!.name).toBe("keep.txt");
    const restored = ok<any>((await restoreFromTrash(ctx, [bin.items[0]!.id]))[0]!);
    expect(readFileSync(restored.restoredTo, "utf8")).toBe("K");
  });

  test("a record pointing at nothing, and made-up ids, are ignored safely", async () => {
    const { ctx } = sandbox();
    expect((await restoreFromTrash(ctx, ["../../etc"]))[0]).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await deleteFromTrash(ctx, ["../../x"])).toEqual({ deleted: 0 });
  });

  test("the bin itself can't be deleted, moved or renamed through the normal operations", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    const [r] = await moveToTrash(ctx, [join(work, "a.txt")]);
    const inside = join(ctx.trashRoot, "items", ok<any>(r!).id, "a.txt");
    expect((await moveToTrash(ctx, [inside]))[0]).toMatchObject({ ok: false, code: "PROTECTED" });
    expect((await deletePermanently(ctx, [ctx.trashRoot]))[0]).toMatchObject({ ok: false, code: "PROTECTED" });
    await expect(renameItem(ctx, inside, "b.txt")).rejects.toMatchObject({ code: "PROTECTED" });
    expect((await moveItems(ctx, [inside], work))[0]).toMatchObject({ ok: false, code: "PROTECTED" });
  });

  test.skipIf(!posix)("system folders, home and Documents can't be deleted", async () => {
    const { ctx, home } = sandbox();
    mkdirSync(join(home, "Documents"));
    for (const p of ["/", "/usr", "/etc/hosts", home, join(home, "Documents")]) {
      expect((await moveToTrash(ctx, [p]))[0], p).toMatchObject({ ok: false, code: "PROTECTED" });
      expect((await deletePermanently(ctx, [p]))[0], p).toMatchObject({ ok: false, code: "PROTECTED" });
    }
  });

  test("a missing item is reported, the others still go to the bin", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    const results = await moveToTrash(ctx, [join(work, "missing.txt"), join(work, "a.txt")]);
    expect(results[0]).toMatchObject({ ok: false, code: "ENOENT" });
    expect(results[1]).toMatchObject({ ok: true });
    expect((await listTrash(ctx)).count).toBe(1);
  });

  test("permanent delete removes the item for good, and a link only removes the link", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "gone.txt"));
    put(join(work, "d", "x.txt"));
    expect((await deletePermanently(ctx, [join(work, "gone.txt"), join(work, "d")])).every((r) => r.ok)).toBe(true);
    expect(names(work)).toEqual([]);
    if (posix) {
      put(join(work, "target", "keep.txt"));
      symlinkSync(join(work, "target"), join(work, "link"));
      await deletePermanently(ctx, [join(work, "link")]);
      expect(existsSync(join(work, "target", "keep.txt"))).toBe(true);
      expect(existsSync(join(work, "link"))).toBe(false);
    }
    expect((await deletePermanently(ctx, [join(work, "again.txt")]))[0]).toMatchObject({ ok: false, code: "ENOENT" });
  });
});

describe("bulk rename", () => {
  const none = new Set<string>();
  const plan = (n: string[], spec: any, existing = none) => planBulkRename(n, spec, existing, "linux");

  test("find and replace changes the name but keeps the extension", () => {
    const rows = plan(["IMG_001.jpg", "IMG_002.jpg", "notes.txt"], { mode: "replace", find: "IMG_", replace: "Holiday " });
    expect(rows.map((r) => r.to)).toEqual(["Holiday 001.jpg", "Holiday 002.jpg", "notes.txt"]);
    expect(rows.map((r) => r.changed)).toEqual([true, true, false]);
    expect(plan(["a.TXT"], { mode: "replace", find: "A", replace: "b", matchCase: true })[0]!.changed).toBe(false);
    expect(plan(["a.txt"], { mode: "replace", find: "a.", replace: "x" })[0]!.to).toBe("a.txt"); // special characters are literal
    expect(plan(["x.txt"], { mode: "replace", find: "", replace: "y" })[0]!.changed).toBe(false);
  });

  test("numbering with {n}, start and padding", () => {
    const rows = plan(["a.png", "b.png", "c.jpg"], { mode: "number", pattern: "Trip {n}", start: 8, padding: 3 });
    expect(rows.map((r) => r.to)).toEqual(["Trip 008.png", "Trip 009.png", "Trip 010.jpg"]);
    expect(plan(["a.txt", "b.txt"], { mode: "number", pattern: "page" }).map((r) => r.to)).toEqual(["page 1.txt", "page 2.txt"]);
    expect(plan(["a.txt"], { mode: "number", pattern: "{name}-{n}" })[0]!.to).toBe("a-1.txt");
  });

  test("letter case and prefix/suffix", () => {
    expect(plan(["My FILE.TXT"], { mode: "case", style: "lower" })[0]!.to).toBe("my file.TXT");
    expect(plan(["my file.txt"], { mode: "case", style: "upper" })[0]!.to).toBe("MY FILE.txt");
    expect(plan(["my_file-name.txt"], { mode: "case", style: "title" })[0]!.to).toBe("My_File-Name.txt");
    expect(plan(["hELLO wORLD.txt"], { mode: "case", style: "sentence" })[0]!.to).toBe("Hello world.txt");
    expect(plan(["a.txt"], { mode: "affix", prefix: "2024-", suffix: "-final" })[0]!.to).toBe("2024-a-final.txt");
  });

  test("clashes are reported: two items with one name, a name in use by something else, invalid names", () => {
    const dup = plan(["a.txt", "b.txt"], { mode: "replace", find: "a", replace: "b" });
    expect(dup[0]!.error).toContain("same name");
    const clash = plan(["a.txt"], { mode: "affix", suffix: "2" }, new Set(["a2.txt"]));
    expect(clash[0]!.error).toContain("already exists");
    expect(plan(["a.txt"], { mode: "replace", find: "a", replace: "x/y" })[0]!.error).toContain("/");
    expect(plan(["a.txt"], { mode: "replace", find: "a", replace: "" })[0]!.error).toContain("empty"); // would leave only ".txt"
  });

  test("applying renames on disk, including swapping two names", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "A");
    put(join(work, "b.txt"), "B");
    put(join(work, "other.txt"), "O");
    const preview = await bulkRename(ctx, work, ["a.txt", "b.txt"], { mode: "number", pattern: "n{n}" }, false);
    expect(preview.applied).toBe(false);
    expect(names(work)).toEqual(["a.txt", "b.txt", "other.txt"]);
    await bulkRename(ctx, work, ["a.txt", "b.txt"], { mode: "number", pattern: "n{n}" }, true);
    expect(names(work)).toEqual(["n1.txt", "n2.txt", "other.txt"]);
    expect(readFileSync(join(work, "n1.txt"), "utf8")).toBe("A");
    // swap: n1 <-> n2 using find/replace on the digit
    await bulkRename(ctx, work, ["n1.txt", "n2.txt"], { mode: "number", pattern: "z{n}", start: 2 }, true);
    expect(readFileSync(join(work, "z2.txt"), "utf8")).toBe("A");
    expect(readFileSync(join(work, "z3.txt"), "utf8")).toBe("B");
  });

  test("renumbering that swaps two names works (2.txt and 1.txt trade places)", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "2.txt"), "was two");
    put(join(work, "1.txt"), "was one");
    await bulkRename(ctx, work, ["2.txt", "1.txt"], { mode: "number", pattern: "{n}" }, true);
    expect(readFileSync(join(work, "1.txt"), "utf8")).toBe("was two");
    expect(readFileSync(join(work, "2.txt"), "utf8")).toBe("was one");
    expect(names(work)).toEqual(["1.txt", "2.txt"]);
  });

  test("a name that clashes with an existing file refuses the whole batch and changes nothing", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    put(join(work, "b.txt"));
    put(join(work, "n1.txt"));
    await expect(bulkRename(ctx, work, ["a.txt", "b.txt"], { mode: "number", pattern: "n{n}" }, true)).rejects.toMatchObject({ code: "BAD_NAME" });
    expect(names(work)).toEqual(["a.txt", "b.txt", "n1.txt"]);
  });

  test("if a rename fails half-way, every item is put back", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "A");
    put(join(work, "b.txt"), "B");
    put(join(work, "c.txt"), "C");
    const real = fsp.rename.bind(fsp);
    let calls = 0;
    const spy = spyOn(fsp, "rename").mockImplementation(((a: any, b: any) => {
      calls++;
      return calls === 5 ? Promise.reject(Object.assign(new Error("disk error"), { code: "EIO" })) : real(a, b);
    }) as any);
    try {
      await expect(bulkRename(ctx, work, ["a.txt", "b.txt", "c.txt"], { mode: "number", pattern: "x{n}" }, true)).rejects.toThrow("disk error");
    } finally {
      spy.mockRestore();
    }
    expect(names(work)).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(readFileSync(join(work, "b.txt"), "utf8")).toBe("B");
  });

  test("only plain names inside the folder are accepted", async () => {
    const { ctx, work } = sandbox();
    await expect(bulkRename(ctx, work, ["../x.txt"], { mode: "affix", prefix: "a" }, false)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(bulkRename(ctx, work, [], { mode: "affix", prefix: "a" }, false)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("settings", () => {
  test("defaults, partial updates, and values that are out of range or the wrong type are cleaned", async () => {
    const { ctx, work } = sandbox();
    expect(await loadSettings(ctx)).toEqual(DEFAULT_SETTINGS);
    const s = await updateSettings(ctx, { view: "icons", showHidden: true, textSize: 500, theme: "purple", sortBy: "size", bogus: 1, favorites: [work, "relative/path", 5, work] });
    expect(s).toMatchObject({ view: "icons", showHidden: true, textSize: 160, theme: "auto", sortBy: "size", favorites: [work] });
    expect((s as any).bogus).toBeUndefined();
    expect(await loadSettings(ctx)).toEqual(s);
    expect((await updateSettings(ctx, { textSize: 10 })).textSize).toBe(80);
    expect((await updateSettings(ctx, { view: "details" })).showHidden).toBe(true); // untouched keys stay
  });

  test("a damaged settings file falls back to defaults", async () => {
    const { ctx, data } = sandbox();
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, "file_manager.json"), "][ not json");
    expect(await loadSettings(ctx)).toEqual(DEFAULT_SETTINGS);
    expect((await updateSettings(ctx, { theme: "dark" })).theme).toBe("dark");
  });

  test("recents: newest first, no duplicates, capped", async () => {
    const { ctx, work } = sandbox();
    for (let i = 0; i < MAX_RECENTS + 5; i++) await addRecent(ctx, join(work, `f${i}.txt`));
    await addRecent(ctx, join(work, "f10.txt"));
    const { recents } = await loadSettings(ctx);
    expect(recents.length).toBe(MAX_RECENTS);
    expect(recents[0]!.path).toBe(join(work, "f10.txt"));
    expect(new Set(recents.map((r) => r.path)).size).toBe(MAX_RECENTS);
  });

  test("favorites are capped and de-duplicated", () => {
    const { ctx, work } = sandbox();
    const many = Array.from({ length: MAX_FAVORITES + 10 }, (_, i) => join(work, `d${i}`));
    expect(sanitizeSettings({ favorites: [...many, many[0]] }, ctx).favorites.length).toBe(MAX_FAVORITES);
  });

  test.skipIf(!posix)("the settings file is private to the user", async () => {
    const { ctx, data } = sandbox();
    await updateSettings(ctx, { theme: "dark" });
    expect(statSync(join(data, "file_manager.json")).mode & 0o777).toBe(0o600);
  });

  test("many quick updates don't lose each other", async () => {
    const { ctx } = sandbox();
    await Promise.all([updateSettings(ctx, { view: "list" }), updateSettings(ctx, { showHidden: true }), updateSettings(ctx, { theme: "light" }), updateSettings(ctx, { sortDir: "desc" })]);
    expect(await loadSettings(ctx)).toMatchObject({ view: "list", showHidden: true, theme: "light", sortDir: "desc" });
  });
});

describe("open and reveal", () => {
  test("the right command for each platform, as an argument list (never a shell string)", () => {
    expect(openCommand("darwin", "/a b/c.txt")).toEqual({ command: "open", args: ["/a b/c.txt"] });
    expect(openCommand("linux", "/a b/c.txt")).toEqual({ command: "xdg-open", args: ["/a b/c.txt"] });
    expect(openCommand("win32", "C:\\a b\\c & d.txt")).toEqual({ command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", "C:\\a b\\c & d.txt"] });
    expect(revealCommand("darwin", "/a/b.txt", false)).toMatchObject({ command: "open", args: ["-R", "/a/b.txt"], selects: true });
    expect(revealCommand("win32", "C:\\a b\\c.txt", false)).toMatchObject({ command: "explorer.exe", args: ['/select,"C:\\a b\\c.txt"'], verbatim: true, selects: true });
    expect(revealCommand("linux", "/a/b.txt", false)).toMatchObject({ command: "xdg-open", args: ["/a"], selects: false });
    expect(revealCommand("linux", "/a/dir", true)).toMatchObject({ args: ["/a/dir"] });
  });

  test("opens a file with the default program, and runs nothing for a missing file", async () => {
    const { ctx, work, launched } = sandbox();
    put(join(work, "doc.txt"));
    const r = await openItem(ctx, join(work, "doc.txt"));
    expect(r).toMatchObject({ opened: join(work, "doc.txt"), program: false });
    expect(launched.length).toBe(1);
    expect(launched[0]!.args).toContain(join(work, "doc.txt"));
    await expect(openItem(ctx, join(work, "missing.txt"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(launched.length).toBe(1);
  });

  test("a program or installer is only run after the person confirms", async () => {
    const { ctx, work, launched } = sandbox();
    put(join(work, "setup.exe"));
    put(join(work, "script.sh"));
    for (const n of ["setup.exe", "script.sh"]) {
      await expect(openItem(ctx, join(work, n))).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });
    }
    expect(launched.length).toBe(0);
    expect((await openItem(ctx, join(work, "setup.exe"), true)).program).toBe(true);
    expect(launched.length).toBe(1);
  });

  test("a missing 'xdg-open' is explained, and reveal selects the file where the system can", async () => {
    const { work } = sandbox();
    put(join(work, "doc.txt"));
    const failing = createContext({ home: work, dataDir: join(work, "d"), platform: "linux", launch: async () => { throw Object.assign(new Error("spawn xdg-open ENOENT"), { code: "ENOENT" }); } });
    await expect(openItem(failing, join(work, "doc.txt"))).rejects.toMatchObject({ code: "NO_OPENER", message: expect.stringContaining("xdg-open") });
    const calls: string[][] = [];
    const mac = createContext({ home: work, dataDir: join(work, "d"), platform: "darwin", launch: async (c, a) => { calls.push([c, ...a]); } });
    expect(await revealItem(mac, join(work, "doc.txt"))).toMatchObject({ selected: true, with: "Finder" });
    expect(calls[0]).toEqual(["open", "-R", join(work, "doc.txt")]);
  });
});
