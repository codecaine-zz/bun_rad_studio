import { describe, expect, test } from "bun:test";
import { FmError, classify, cleanName, describeFsError, extensionOf, formatSize, isHiddenName, isSameOrInside, parseTypedPath, protectedReason, splitName, uniqueName, validateName } from "../src/features/filemanager/fmPaths";

describe("validateName", () => {
  test("accepts ordinary names everywhere", () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      for (const n of ["report.txt", "My Photos", "résumé (final).docx", ".gitignore", "日本語.txt", "a"]) expect(validateName(n, platform), `${platform} ${n}`).toBeNull();
    }
  });

  test("rejects empty, dots, slashes and null characters with a plain explanation", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(validateName("", platform)).toContain("Type a name");
      expect(validateName("   ", platform)).toContain("Type a name");
      expect(validateName(undefined, platform)).toContain("Type a name");
      expect(validateName(".", platform)).toContain("can't be used");
      expect(validateName("..", platform)).toContain("can't be used");
      expect(validateName("a/b", platform)).toContain("/");
      expect(validateName("a\0b", platform)).toContain("null");
    }
  });

  test("Windows rules apply only on Windows", () => {
    expect(validateName("what?.txt", "win32")).toContain("these characters");
    expect(validateName("a:b", "win32")).toContain("these characters");
    expect(validateName("back\\slash", "win32")).toContain("these characters");
    expect(validateName("name.", "win32")).toContain("dot or a space");
    expect(validateName("CON", "win32")).toContain("reserved");
    expect(validateName("con.txt", "win32")).toContain("reserved");
    expect(validateName("Lpt1.log", "win32")).toContain("reserved");
    expect(validateName("conference.txt", "win32")).toBeNull();
    for (const ok of ["what?.txt", "a:b", "CON", "name."]) expect(validateName(ok, "linux"), ok).toBeNull();
    expect(validateName("a\\b", "linux")).toBeNull();
  });

  test("length limits count bytes on Linux/macOS and characters on Windows", () => {
    expect(validateName("a".repeat(255), "linux")).toBeNull();
    expect(validateName("a".repeat(256), "linux")).toContain("too long");
    expect(validateName("é".repeat(128), "linux")).toContain("too long");
    expect(validateName("é".repeat(128), "win32")).toBeNull();
    expect(validateName("a".repeat(256), "win32")).toContain("too long");
  });

  test("cleanName trims", () => {
    expect(cleanName("  a b  ")).toBe("a b");
    expect(cleanName(5)).toBe("");
  });
});

describe("splitName and uniqueName", () => {
  test("splits extensions the way people expect", () => {
    expect(splitName("photo.final.jpg")).toEqual(["photo.final", ".jpg"]);
    expect(splitName("archive.tar.gz")).toEqual(["archive", ".tar.gz"]);
    expect(splitName(".bashrc")).toEqual([".bashrc", ""]);
    expect(splitName("README")).toEqual(["README", ""]);
    expect(splitName("trailing.")).toEqual(["trailing.", ""]);
    expect(splitName(".tar.gz")).toEqual([".tar", ".gz"]);
  });

  test("numbered style: report.txt -> report (2).txt", () => {
    const taken = new Set(["report.txt", "report (2).txt"]);
    expect(uniqueName("report.txt", (n) => taken.has(n))).toBe("report (3).txt");
    expect(uniqueName("fresh.txt", (n) => taken.has(n))).toBe("fresh.txt");
    expect(uniqueName("archive.tar.gz", (n) => n === "archive.tar.gz")).toBe("archive (2).tar.gz");
    expect(uniqueName(".env", (n) => n === ".env")).toBe(".env (2)");
  });

  test("copy style: report.txt -> report copy.txt, report copy 2.txt", () => {
    const taken = new Set(["report.txt", "report copy.txt"]);
    expect(uniqueName("report.txt", (n) => taken.has(n), "copy")).toBe("report copy 2.txt");
    expect(uniqueName("Folder", (n) => n === "Folder", "copy")).toBe("Folder copy");
  });

  test("gives up with an explanation instead of looping forever", () => {
    expect(() => uniqueName("x", () => true)).toThrow(FmError);
  });
});

describe("protectedReason", () => {
  const mac = { platform: "darwin" as const, home: "/Users/sam" };
  const linux = { platform: "linux" as const, home: "/home/sam" };
  const win = { platform: "win32" as const, home: "C:\\Users\\Sam" };

  test("the top of the file system, home and main personal folders can't be changed themselves", () => {
    expect(protectedReason("/", mac)).toContain("top of the computer");
    expect(protectedReason("/Users/sam", mac)).toContain("home folder");
    expect(protectedReason("/Users/sam/Documents", mac)).toContain("personal folders");
    expect(protectedReason("/Users/sam/Documents/", mac)).toContain("personal folders");
    expect(protectedReason("/Users/sam/Documents/report.txt", mac)).toBeNull();
    expect(protectedReason("/home/sam/Downloads", linux)).toContain("personal folders");
    expect(protectedReason("/home/sam/Downloads/a.zip", linux)).toBeNull();
  });

  test("system folders and everything inside them are protected, /usr/local is not", () => {
    expect(protectedReason("/usr", linux)).toContain("system folder");
    expect(protectedReason("/usr/bin/ls", linux)).toContain("inside a system folder");
    expect(protectedReason("/etc/hosts", linux)).toContain("inside a system folder");
    expect(protectedReason("/System/Library/x", mac)).toContain("inside a system folder");
    expect(protectedReason("/usr/local/bin/tool", linux)).toBeNull();
    expect(protectedReason("/tmp/work", linux)).toBeNull();
    expect(protectedReason("/var/folders/ab/cd/T/work", mac)).toBeNull();
    expect(protectedReason("/Applications", mac)).toContain("system folder");
    expect(protectedReason("/Applications/Thing.app", mac)).toBeNull();
  });

  test("creating items: only the inside of system folders is blocked", () => {
    expect(protectedReason("/usr/bin", linux, "create")).toContain("system folder");
    expect(protectedReason("/home/sam", linux, "create")).toBeNull();
    expect(protectedReason("/", linux, "create")).toBeNull();
    expect(protectedReason("/home/sam/Documents", linux, "create")).toBeNull();
  });

  test("Windows: drive roots, Windows, Program Files and Users are protected; other folders are not", () => {
    expect(protectedReason("C:\\", win)).toContain("top of a drive");
    expect(protectedReason("d:\\", win)).toContain("top of a drive");
    expect(protectedReason("C:\\Windows", win)).toContain("system folder");
    expect(protectedReason("c:\\windows\\system32\\cmd.exe", win)).toContain("inside a system folder");
    expect(protectedReason("C:\\Program Files", win)).toContain("system folder");
    expect(protectedReason("C:\\Program Files\\App\\app.exe", win)).toBeNull();
    expect(protectedReason("C:\\Users", win)).toContain("system folder");
    expect(protectedReason("C:\\Users\\Sam", win)).toContain("home folder");
    expect(protectedReason("c:\\users\\sam\\documents", win)).toContain("personal folders");
    expect(protectedReason("C:\\Users\\Sam\\Documents\\a.docx", win)).toBeNull();
    expect(protectedReason("D:\\Projects", win)).toBeNull();
    expect(protectedReason("C:\\", win, "create")).toBeNull();
    expect(protectedReason("\\\\server\\share", win)).toContain("network");
    expect(protectedReason("\\\\server\\share\\folder", win)).toBeNull();
  });

  test("extra protected folders (the Recycle Bin) and everything in them are protected", () => {
    const ctx = { ...linux, extraProtected: ["/home/sam/.bun_rad_studio/trash"] };
    expect(protectedReason("/home/sam/.bun_rad_studio/trash", ctx)).toContain("Recycle Bin");
    expect(protectedReason("/home/sam/.bun_rad_studio/trash/items/x/a.txt", ctx)).toContain("Recycle Bin");
    expect(protectedReason("/home/sam/.bun_rad_studio/other.json", ctx)).toBeNull();
  });
});

describe("isSameOrInside", () => {
  test("detects a folder moved into itself and does not confuse similar names", () => {
    expect(isSameOrInside("/a/b", "/a/b", "linux")).toBe(true);
    expect(isSameOrInside("/a/b/c/d", "/a/b", "linux")).toBe(true);
    expect(isSameOrInside("/a/bc", "/a/b", "linux")).toBe(false);
    expect(isSameOrInside("/a", "/a/b", "linux")).toBe(false);
    expect(isSameOrInside("C:\\Data\\X", "c:\\data", "win32")).toBe(true);
    expect(isSameOrInside("/A/b", "/a", "linux")).toBe(false);
  });
});

describe("parseTypedPath", () => {
  test("expands ~, strips quotes, resolves relative paths", () => {
    expect(parseTypedPath("~", "/x", "/home/sam", "linux")).toBe("/home/sam");
    expect(parseTypedPath("~/Documents", "/x", "/home/sam", "linux")).toBe("/home/sam/Documents");
    expect(parseTypedPath('"/tmp/a b"', "/x", "/home/sam", "linux")).toBe("/tmp/a b");
    expect(parseTypedPath("sub/dir", "/work", "/home/sam", "linux")).toBe("/work/sub/dir");
    expect(parseTypedPath("../up", "/work/here", "/home/sam", "linux")).toBe("/work/up");
    expect(parseTypedPath("/a//b/./c/", "/x", "/h", "linux")).toBe("/a/b/c");
  });
  test("Windows: forward slashes and bare drive letters", () => {
    expect(parseTypedPath("D:/Games", "C:\\x", "C:\\Users\\Sam", "win32")).toBe("D:\\Games");
    expect(parseTypedPath("d:", "C:\\x", "C:\\Users\\Sam", "win32")).toBe("d:\\");
    expect(parseTypedPath("~\\Desktop", "C:\\x", "C:\\Users\\Sam", "win32")).toBe("C:\\Users\\Sam\\Desktop");
  });
  test("refuses empty and null-containing input", () => {
    expect(parseTypedPath("", "/x", "/h", "linux")).toBeNull();
    expect(parseTypedPath("   ", "/x", "/h", "linux")).toBeNull();
    expect(parseTypedPath('""', "/x", "/h", "linux")).toBeNull();
    expect(parseTypedPath("a\0b", "/x", "/h", "linux")).toBeNull();
  });
});

describe("classify", () => {
  test("folders, images, code, programs and unknown files", () => {
    expect(classify("Stuff", true)).toMatchObject({ kind: "folder", label: "Folder", icon: "📁" });
    expect(classify("Thing.app", true)).toMatchObject({ kind: "program", program: true });
    expect(classify("photo.JPG", false)).toMatchObject({ kind: "image", label: "JPG image", preview: "image", program: false });
    expect(classify("notes.md", false)).toMatchObject({ kind: "text", preview: "text" });
    expect(classify("main.ts", false)).toMatchObject({ kind: "code", preview: "text" });
    expect(classify("setup.exe", false)).toMatchObject({ kind: "program", program: true });
    expect(classify("run.sh", false)).toMatchObject({ program: true });
    expect(classify("data.xyz", false)).toMatchObject({ kind: "other", label: "XYZ file", preview: null });
    expect(classify("Makefile", false)).toMatchObject({ kind: "other", label: "File" });
    expect(classify("tool", false, true)).toMatchObject({ kind: "program", program: true });
    expect(classify("movie.mkv", false).kind).toBe("video");
    expect(classify("a.tar.gz", false).kind).toBe("archive");
  });
  test("every kind has an icon and a label", () => {
    for (const n of ["a.png", "a.mp4", "a.mp3", "a.pdf", "a.docx", "a.xlsx", "a.pptx", "a.zip", "a.js", "a.txt", "a.exe", "a.dmg", "a.ttf", "a.zzz"]) {
      const k = classify(n, false);
      expect(k.icon.length, n).toBeGreaterThan(0);
      expect(k.label.length, n).toBeGreaterThan(0);
    }
  });
  test("extensionOf is lower-case and handles .tar.gz", () => {
    expect(extensionOf("A.PNG")).toBe("png");
    expect(extensionOf("a.tar.gz")).toBe("tar.gz");
    expect(extensionOf("README")).toBe("");
  });
});

describe("isHiddenName, formatSize", () => {
  test("hidden names", () => {
    expect(isHiddenName(".git", "linux")).toBe(true);
    expect(isHiddenName("notes.txt", "linux")).toBe(false);
    expect(isHiddenName("Desktop.ini", "win32")).toBe(true);
    expect(isHiddenName("Desktop.ini", "linux")).toBe(false);
  });
  test("sizes read naturally", () => {
    expect(formatSize(0)).toBe("0 bytes");
    expect(formatSize(1)).toBe("1 byte");
    expect(formatSize(1023)).toBe("1023 bytes");
    expect(formatSize(1024)).toBe("1 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatSize(250 * 1024 * 1024)).toBe("250 MB");
    expect(formatSize(3.2 * 1024 ** 3)).toBe("3.2 GB");
    expect(formatSize(-1)).toBe("");
    expect(formatSize(NaN)).toBe("");
  });
});

describe("describeFsError", () => {
  test("common errors are explained in plain words", () => {
    const e = (code: string) => Object.assign(new Error("raw"), { code });
    expect(describeFsError(e("ENOENT")).message).toContain("doesn't exist");
    expect(describeFsError(e("EACCES"), "copy that").message).toContain("permission to copy that");
    expect(describeFsError(e("EEXIST")).message).toContain("already exists");
    expect(describeFsError(e("ENOSPC")).message).toContain("free space");
    expect(describeFsError(e("EBUSY")).message).toContain("in use");
    expect(describeFsError(e("EROFS")).message).toContain("read-only");
    expect(describeFsError(e("EWEIRD")).message).toContain("raw");
    expect(describeFsError(e("EWEIRD")).code).toBe("EWEIRD");
    expect(describeFsError(new FmError("X", "Mine")).message).toBe("Mine");
  });
});

describe("symlink ancestor protection in assertModifiable and assertCreatable", () => {
  test("blocks modifying or creating through a symlinked parent pointing into a protected system folder", () => {
    const { mkdtempSync, symlinkSync, rmSync } = require("fs");
    const { tmpdir } = require("os");
    const { join } = require("path");
    const { assertModifiable, assertCreatable, createContext } = require("../src/features/filemanager/fmCore");
    const tmp = mkdtempSync(join(tmpdir(), "fm-symlink-guard-"));
    try {
      const ctx = createContext({ home: join(tmp, "home"), dataDir: join(tmp, "data") });
      const linkToEtc = join(tmp, "etc-link");
      try {
        symlinkSync("/etc", linkToEtc);
      } catch {
        return;
      }
      expect(() => assertModifiable(ctx, join(linkToEtc, "hosts"))).toThrow(FmError);
      expect(() => assertCreatable(ctx, linkToEtc)).toThrow(FmError);
      // Deleting the symlink itself inside the user's folder remains allowed
      expect(() => assertModifiable(ctx, linkToEtc)).not.toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
