import { describe, expect, test } from "bun:test";
import {
  EXTRACTABLE_EXTENSIONS, archiveExtensionOf, baseName, collapseCrumbs, describeSelection, detectSnippetInfo, driveFor,
  extensionOf, extractableEntries, formatDate, formatSize, isExtractableEntry, isExtractableName,
  isInside, isModifier, isWindowsPath, joinPath, kindsForName, naturalCompare, parentOf, parseByteSizeToken, plural,
  rangeIndexes, sortEntries, splitPath, summarizeCount, typeaheadFind, wantsCopy,
} from "../resources/file_manager/ui/util.js";
import { entryMatchesQuickFilter } from "../resources/file_manager/ui/nav.js";
import { ACTIONS, kindsFor } from "../src/features/filemanager/fmTools";

const e = (name: string, extra: object = {}) => ({ name, isDir: false, size: 0, mtimeMs: 0, label: "File", ...extra });

describe("sorting", () => {
  test("natural order: numbers inside names count as numbers, case is ignored", () => {
    expect(["file10", "File2", "file1", "FILE3"].sort(naturalCompare)).toEqual(["file1", "File2", "FILE3", "file10"]);
  });

  test("folders first by default, and sort directions", () => {
    const list = [e("b.txt"), e("A", { isDir: true }), e("a.txt"), e("z", { isDir: true })];
    expect(sortEntries(list).map((x) => x.name)).toEqual(["A", "z", "a.txt", "b.txt"]);
    expect(sortEntries(list, { dir: "desc" }).map((x) => x.name)).toEqual(["z", "A", "b.txt", "a.txt"]);
    expect(sortEntries(list, { foldersFirst: false }).map((x) => x.name)).toEqual(["A", "a.txt", "b.txt", "z"]);
  });

  test("by size, modified date and type, ties broken by name", () => {
    const list = [e("big", { size: 100, mtimeMs: 1, label: "B file" }), e("small", { size: 1, mtimeMs: 3, label: "A file" }), e("mid", { size: 1, mtimeMs: 2, label: "A file" })];
    expect(sortEntries(list, { by: "size" }).map((x) => x.name)).toEqual(["mid", "small", "big"]);
    expect(sortEntries(list, { by: "modified", dir: "desc" }).map((x) => x.name)).toEqual(["small", "mid", "big"]);
    expect(sortEntries(list, { by: "type" }).map((x) => x.name)).toEqual(["mid", "small", "big"]);
  });

  test("the input list is not changed", () => {
    const list = [e("b"), e("a")];
    sortEntries(list);
    expect(list.map((x) => x.name)).toEqual(["b", "a"]);
  });
});

describe("formatting", () => {
  test("sizes", () => {
    expect(formatSize(0)).toBe("0 bytes");
    expect(formatSize(1)).toBe("1 byte");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(250 * 1024 ** 2)).toBe("250 MB");
    expect(formatSize(-1)).toBe("");
  });

  test("dates read naturally", () => {
    const now = new Date(2025, 2, 10, 15, 0).getTime();
    expect(formatDate(new Date(2025, 2, 10, 9, 5).getTime(), now, "en-US")).toBe("Today, 9:05 AM");
    expect(formatDate(new Date(2025, 2, 9, 23, 59).getTime(), now, "en-US")).toBe("Yesterday, 11:59 PM");
    expect(formatDate(new Date(2024, 11, 25, 8, 0).getTime(), now, "en-US")).toBe("Dec 25, 2024");
    expect(formatDate(0)).toBe("");
    expect(formatDate(NaN)).toBe("");
  });

  test("plural and summaries", () => {
    expect(plural(1, "file")).toBe("1 file");
    expect(plural(2, "file")).toBe("2 files");
    expect(plural(2, "city", "cities")).toBe("2 cities");
    expect(summarizeCount(0, 0)).toBe("This folder is empty");
    expect(summarizeCount(5, 5)).toBe("5 items");
    expect(summarizeCount(1, 1)).toBe("1 item");
    expect(summarizeCount(5000, 600)).toBe("Showing 600 of 5,000 items");
  });

  test("selection sentence", () => {
    expect(describeSelection([])).toBe("");
    expect(describeSelection([e("a", { size: 1024 })])).toBe("1 file selected (1 KB)");
    expect(describeSelection([e("a", { size: 1024 }), e("b", { size: 1024 }), e("d", { isDir: true })])).toBe("1 folder and 2 files selected (2 KB)");
    expect(describeSelection([e("d", { isDir: true })])).toBe("1 folder selected");
  });
});

describe("paths", () => {
  test("posix: join, base name, parent", () => {
    expect(joinPath("/a/b", "c.txt", "/")).toBe("/a/b/c.txt");
    expect(joinPath("/", "etc", "/")).toBe("/etc");
    expect(baseName("/a/b/c.txt", "/")).toBe("c.txt");
    expect(baseName("/a/b/", "/")).toBe("b");
    expect(baseName("/", "/")).toBe("/");
    expect(parentOf("/a/b", "/")).toBe("/a");
    expect(parentOf("/a", "/")).toBe("/");
    expect(parentOf("/", "/")).toBeNull();
  });

  test("windows: drives, folders and network shares", () => {
    expect(joinPath("C:\\", "Users", "\\")).toBe("C:\\Users");
    expect(joinPath("C:\\Users", "Sam", "\\")).toBe("C:\\Users\\Sam");
    expect(baseName("C:\\Users\\Sam", "\\")).toBe("Sam");
    expect(baseName("C:\\", "\\")).toBe("C:\\");
    expect(parentOf("C:\\Users\\Sam", "\\")).toBe("C:\\Users");
    expect(parentOf("C:\\Users", "\\")).toBe("C:\\");
    expect(parentOf("C:\\", "\\")).toBeNull();
    expect(parentOf("\\\\server\\share\\dir", "\\")).toBe("\\\\server\\share");
    expect(parentOf("\\\\server\\share", "\\")).toBeNull();
    expect(isWindowsPath("C:\\x")).toBe(true);
    expect(isWindowsPath("\\\\srv\\s")).toBe(true);
    expect(isWindowsPath("/home")).toBe(false);
  });

  test("the clickable address parts", () => {
    expect(splitPath("/", "/")).toEqual([{ name: "Computer", path: "/", root: true }]);
    expect(splitPath("/Users/sam/Documents", "/").map((c) => c.path)).toEqual(["/", "/Users", "/Users/sam", "/Users/sam/Documents"]);
    expect(splitPath("C:\\", "\\")).toEqual([{ name: "C:", path: "C:\\", root: true }]);
    expect(splitPath("C:\\Users\\Sam", "\\").map((c) => [c.name, c.path])).toEqual([["C:", "C:\\"], ["Users", "C:\\Users"], ["Sam", "C:\\Users\\Sam"]]);
    expect(splitPath("\\\\srv\\share\\a", "\\").map((c) => c.path)).toEqual(["\\\\srv\\share", "\\\\srv\\share\\a"]);
  });

  test("long addresses collapse in the middle", () => {
    const crumbs = splitPath("/a/b/c/d/e/f/g", "/");
    const short = collapseCrumbs(crumbs, 3);
    expect(short.map((c) => c.name)).toEqual(["Computer", "…", "e", "f", "g"]);
    expect(short[1]).toMatchObject({ ellipsis: true, path: "/a/b/c/d" });
    expect(collapseCrumbs(splitPath("/a/b", "/"), 3)).toHaveLength(3);
  });

  test("inside / drive lookup", () => {
    expect(isInside("/a/b/c", "/a/b", "/")).toBe(true);
    expect(isInside("/a/bc", "/a/b", "/")).toBe(false);
    expect(isInside("/a/b", "/a/b", "/")).toBe(true);
    expect(isInside("C:\\Data\\x", "c:\\data", "\\", true)).toBe(true);
    const drives = [{ path: "/" }, { path: "/Volumes/USB" }];
    expect(driveFor("/Volumes/USB/photos", drives, "/")).toBe(drives[1]);
    expect(driveFor("/Users/sam", drives, "/")).toBe(drives[0]);
    expect(driveFor("/Volumes/USB2/x", drives, "/")).toBe(drives[0]);
  });
});

describe("extensionOf", () => {
  test("lower-case ending without the dot", () => {
    expect(extensionOf("photo.JPG")).toBe("jpg");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf(".bashrc")).toBe("");
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
  });

  test("archiveExtensionOf and extractableEntries detect all extractable compressed formats and skip folders/plain files", () => {
    expect(EXTRACTABLE_EXTENSIONS.includes("tar.gz")).toBe(true);
    expect(EXTRACTABLE_EXTENSIONS.includes("7z")).toBe(true);
    expect(archiveExtensionOf("archive.tar.gz")).toBe("tar.gz");
    expect(archiveExtensionOf("archive.TAR.ZST")).toBe("tar.zst");
    expect(archiveExtensionOf("photo.JPG")).toBe("jpg");
    expect(archiveExtensionOf("README")).toBe("");
    expect(isExtractableName("data.xz")).toBe(true);
    expect(isExtractableName("data.txt")).toBe(false);

    const items = [
      e("archive.zip"),
      e("bundle.tar.gz"),
      e("folder.zip", { isDir: true }),
      e("notes.md"),
      e("package.7z"),
    ];
    expect(isExtractableEntry(items[0])).toBe(true);
    expect(isExtractableEntry(items[2])).toBe(false);
    expect(extractableEntries(items).map((x) => x.name)).toEqual(["archive.zip", "bundle.tar.gz", "package.7z"]);
  });
});

describe("keyboard helpers", () => {
  const list = ["Alpha", "apple", "Banana", "berry", "Cherry"].map((n) => e(n));

  test("type-ahead finds the next name starting with the typed letters, wrapping around", () => {
    expect(typeaheadFind(list, "b", -1)).toBe(2);
    expect(typeaheadFind(list, "b", 2)).toBe(3);
    expect(typeaheadFind(list, "b", 3)).toBe(2);
    expect(typeaheadFind(list, "ch", 0)).toBe(4);
    expect(typeaheadFind(list, "ap", 0)).toBe(1);
    expect(typeaheadFind(list, "zzz", 0)).toBe(-1);
    expect(typeaheadFind(list, "", 0)).toBe(-1);
    expect(typeaheadFind([], "a", -1)).toBe(-1);
  });

  test("ranges go either way", () => {
    expect(rangeIndexes(2, 5)).toEqual([2, 3, 4, 5]);
    expect(rangeIndexes(5, 2)).toEqual([2, 3, 4, 5]);
    expect(rangeIndexes(3, 3)).toEqual([3]);
  });

  test("Cmd on macOS, Ctrl elsewhere; copy-drag uses Option on macOS", () => {
    expect(isModifier({ metaKey: true, ctrlKey: false }, "darwin")).toBe(true);
    expect(isModifier({ metaKey: false, ctrlKey: true }, "darwin")).toBe(false);
    expect(isModifier({ metaKey: false, ctrlKey: true }, "win32")).toBe(true);
    expect(wantsCopy({ altKey: true, ctrlKey: false }, "darwin")).toBe(true);
    expect(wantsCopy({ altKey: false, ctrlKey: true }, "linux")).toBe(true);
    expect(wantsCopy({ altKey: true, ctrlKey: false }, "linux")).toBe(false);
  });
});

describe("convert and process: the page and the server agree on which files qualify", () => {
  test("kindsForName matches the server's kindsFor for every input type of every action, and for names that don't qualify", () => {
    const exts = new Set<string>();
    for (const a of ACTIONS) for (const x of a.inputs) exts.add(x);
    for (const x of exts) {
      expect(kindsForName(`file.${x}`), x).toEqual(kindsFor(`file.${x}`));
      expect(kindsForName(`FILE.${x.toUpperCase()}`), x).toEqual(kindsFor(`file.${x}`));
    }
    for (const n of ["archive.zip", "noextension", ".hidden", "program.exe", "dir.d", "trailing."]) {
      expect(kindsForName(n), n).toEqual([]);
      expect(kindsFor(n), n).toEqual([]);
    }
  });
});

describe("power quick-filter, snippet auto-detection, and calculated folder sizes", () => {
  const now = new Date(2026, 9, 24, 15, 0, 0).getTime();
  const tsFile = e("server.ts", { path: "/work/server.ts", size: 4096, mtimeMs: now - 30 * 60_000, label: "TypeScript file", kind: "code" });
  const bigVideo = e("demo.mp4", { path: "/work/demo.mp4", size: 25 * 1024 * 1024, mtimeMs: now - 5 * 86_400_000, label: "MP4 video", kind: "video" });
  const emptyLog = e("debug.log", { path: "/work/debug.log", size: 0, mtimeMs: now - 86_400_000, label: "Log file", kind: "text" });
  const hiddenEnv = e(".env", { path: "/work/.env", size: 128, hidden: true, mtimeMs: now - 10 * 60_000, label: "Configuration", kind: "code" });
  const archivePkg = e("release.tar.gz", { path: "/work/release.tar.gz", size: 2 * 1024 * 1024, mtimeMs: now - 2 * 86_400_000, label: "Archive", kind: "archive" });
  const dirNodeModules = e("node_modules", { path: "/work/node_modules", isDir: true, size: -1, mtimeMs: now - 86_400_000, label: "Folder", kind: "folder" });
  const tags = { "/work/server.ts": "blue", "/work/demo.mp4": "red" };

  test("parseByteSizeToken parses byte units accurately", () => {
    expect(parseByteSizeToken("512")).toBe(512);
    expect(parseByteSizeToken("1.5kb")).toBe(1536);
    expect(parseByteSizeToken("10MB")).toBe(10 * 1024 * 1024);
    expect(parseByteSizeToken("2gb")).toBe(2 * 1024 ** 3);
    expect(parseByteSizeToken("invalid")).toBeNull();
  });

  test("entryMatchesQuickFilter supports wildcards, negation, ext:, size:, date:, tag:, is:, and kind:", () => {
    expect(entryMatchesQuickFilter(tsFile, "*.ts", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(tsFile, "*.js", tags, now)).toBe(false);
    expect(entryMatchesQuickFilter(tsFile, "ext:js,ts", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(dirNodeModules, "-node_modules", tags, now)).toBe(false);
    expect(entryMatchesQuickFilter(tsFile, "-node_modules", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(emptyLog, "!*.log", tags, now)).toBe(false);
    expect(entryMatchesQuickFilter(bigVideo, "size:>10mb", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(tsFile, "size:>10mb", tags, now)).toBe(false);
    expect(entryMatchesQuickFilter(bigVideo, ">10mb", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(emptyLog, "size:empty", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(tsFile, "date:today", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(bigVideo, "date:today", tags, now)).toBe(false);
    expect(entryMatchesQuickFilter(bigVideo, "date:week", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(tsFile, "age:<2h", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(tsFile, "tag:blue", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(tsFile, "tag:red", tags, now)).toBe(false);
    expect(entryMatchesQuickFilter(emptyLog, "tag:none", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(bigVideo, "tag:any", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(dirNodeModules, "is:dir", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(tsFile, "is:file", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(hiddenEnv, "is:hidden", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(archivePkg, "is:archive", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(emptyLog, "is:empty", tags, now)).toBe(true);
    expect(entryMatchesQuickFilter(tsFile, "kind:code size:>1kb date:today -debug", tags, now)).toBe(true);
  });

  test("detectSnippetInfo identifies JSON, Markdown, Shell, SQL, SVG, HTML, TypeScript, CSV, and plain text", () => {
    expect(detectSnippetInfo('{"name":"rad","version":1}').ext).toBe("json");
    expect(detectSnippetInfo("# Project Roadmap\n\n- item 1").ext).toBe("md");
    expect(detectSnippetInfo("#!/usr/bin/env bash\necho hi").ext).toBe("sh");
    expect(detectSnippetInfo("SELECT id, name FROM users WHERE active = 1;").ext).toBe("sql");
    expect(detectSnippetInfo("<svg viewBox='0 0 10 10'></svg>").ext).toBe("svg");
    expect(detectSnippetInfo("<!DOCTYPE html><html><body></body></html>").ext).toBe("html");
    expect(detectSnippetInfo("export function greet(name: string) {\n  return name;\n}").ext).toBe("ts");
    expect(detectSnippetInfo("id,name,role\n1,Ada,Engineer\n2,Grace,Admiral").ext).toBe("csv");
    expect(detectSnippetInfo("just a quick note").ext).toBe("txt");
  });

  test("sortEntries and describeSelection use calculated folder sizes when available", () => {
    const dirSmall = e("alpha_dir", { isDir: true, size: 1024, folderSizeCalculated: true });
    const dirBig = e("beta_dir", { isDir: true, size: 50_000, folderSizeCalculated: true });
    const dirUnknown = e("gamma_dir", { isDir: true, size: -1 });
    const sortedDesc = sortEntries([dirSmall, dirBig, dirUnknown], { by: "size", dir: "desc", foldersFirst: true });
    expect(sortedDesc.map((x) => x.name)).toEqual(["beta_dir", "alpha_dir", "gamma_dir"]);
    expect(describeSelection([dirBig])).toContain("1 folder selected (");
    expect(describeSelection([dirUnknown])).toBe("1 folder selected");
  });
});
