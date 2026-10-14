import { describe, expect, test } from "bun:test";
import {
  baseName, collapseCrumbs, describeSelection, driveFor, extensionOf, formatDate, formatSize, isInside, isModifier, isWindowsPath, joinPath,
  naturalCompare, parentOf, plural, rangeIndexes, sortEntries, splitPath, summarizeCount, typeaheadFind, wantsCopy,
} from "../resources/file_manager/ui/util.js";

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
