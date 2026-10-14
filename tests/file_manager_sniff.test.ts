import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, closeSync, mkdirSync, mkdtempSync, openSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { createContext } from "../src/features/filemanager/fmCore";
import { assertOpenAllowed, checkFile, composeCheck, judgeContent } from "../src/features/filemanager/fmCheck";
import { CHECK_TIME_CAP_MS, MAX_CHECK_PATHS, checkMany } from "../src/features/filemanager/fmCheckOps";
import { SNIFF_BYTES, sniffKinds, sniffType, type Sniffed } from "../src/features/filemanager/fmSniff";
import { checkEndings, checkName, expectedFor, needsContent } from "../src/features/filemanager/fmSniffRules";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/features/filemanager/fmSettings";
import { openItem } from "../src/features/filemanager/fmOpen";
import { runWith, saveOpenWith } from "../src/features/filemanager/fmOpenWith";

// ---------------------------------------------------------------------------------------------------------------
// Real, minimal headers
// ---------------------------------------------------------------------------------------------------------------

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const pad = (head: number[], size = 64): Uint8Array => {
  const out = new Uint8Array(Math.max(size, head.length));
  out.set(head);
  return out;
};
const text = (s: string) => new TextEncoder().encode(s);
const put32le = (arr: Uint8Array, at: number, v: number) => new DataView(arr.buffer).setUint32(at, v, true);
const put32be = (arr: Uint8Array, at: number, v: number) => new DataView(arr.buffer).setUint32(at, v, false);

function pe(dll = false, ptr = 0x80, size = 0x200): Uint8Array {
  const b = new Uint8Array(size);
  b.set(ascii("MZ"));
  b[0x18] = 0x40;
  put32le(b, 0x3c, ptr);
  b.set(ascii("PE\0\0"), ptr);
  new DataView(b.buffer).setUint16(ptr + 4, 0x8664, true);
  new DataView(b.buffer).setUint16(ptr + 22, dll ? 0x2022 : 0x0022, true);
  return b;
}
const elf = () => pad([0x7f, ...ascii("ELF"), 2, 1, 1, 0]);
function macho(magic: "le64" | "le32" | "be32" | "be64" = "le64", fileType = 2): Uint8Array {
  const b = new Uint8Array(64);
  const m = { le64: [0xcf, 0xfa, 0xed, 0xfe], le32: [0xce, 0xfa, 0xed, 0xfe], be32: [0xfe, 0xed, 0xfa, 0xce], be64: [0xfe, 0xed, 0xfa, 0xcf] }[magic];
  b.set(m);
  if (magic.startsWith("le")) put32le(b, 12, fileType);
  else put32be(b, 12, fileType);
  return b;
}
function fat(archs = 2, cpu = 0x01000007): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0xca, 0xfe, 0xba, 0xbe]);
  put32be(b, 4, archs);
  put32be(b, 8, cpu);
  put32be(b, 16, 0x4000);
  return b;
}
const javaClass = (major = 52) => pad([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, major]);
const ftyp = (brand: string) => pad([0, 0, 0, 0x18, ...ascii("ftyp"), ...ascii(brand), 0, 0, 0, 0]);
const riff = (form: string) => pad([...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii(form)]);
const bmp = () => {
  const b = new Uint8Array(64);
  b.set(ascii("BM"));
  put32le(b, 14, 40);
  return b;
};
const ico = (type = 1) => pad([0, 0, type, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0], 32);
const png = () => pad([0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR")]);
const jpeg = () => pad([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...ascii("JFIF")]);
const tar = () => {
  const b = new Uint8Array(512);
  b.set(ascii("ustar"), 257);
  return b;
};
const ttf = () => pad([0, 1, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0]);

const SAMPLES: Array<[string, () => Uint8Array, string, Sniffed["family"]]> = [
  ["png", png, "png", "image"],
  ["jpeg", jpeg, "jpeg", "image"],
  ["gif", () => pad(ascii("GIF89a")), "gif", "image"],
  ["webp", () => riff("WEBP"), "webp", "image"],
  ["bmp", bmp, "bmp", "image"],
  ["tiff", () => pad([...ascii("II"), 42, 0, 8, 0, 0, 0]), "tiff", "image"],
  ["tiff (big endian)", () => pad([...ascii("MM"), 0, 42, 0, 0, 0, 8]), "tiff", "image"],
  ["ico", () => ico(1), "ico", "image"],
  ["cur", () => ico(2), "cur", "image"],
  ["heic", () => ftyp("heic"), "heic", "image"],
  ["heif (mif1)", () => ftyp("mif1"), "heic", "image"],
  ["avif", () => ftyp("avif"), "avif", "image"],
  ["psd", () => pad([...ascii("8BPS"), 0, 1]), "psd", "image"],
  ["pdf", () => text("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj"), "pdf", "document"],
  ["zip", () => pad([...ascii("PK"), 3, 4, 20, 0]), "zip", "archive"],
  ["empty zip", () => pad([...ascii("PK"), 5, 6, 0, 0]), "zip", "archive"],
  ["rar", () => pad([...ascii("Rar!"), 0x1a, 7, 1, 0]), "rar", "archive"],
  ["7z", () => pad([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4]), "7z", "archive"],
  ["gzip", () => pad([0x1f, 0x8b, 8, 0, 0, 0, 0, 0]), "gzip", "archive"],
  ["bzip2", () => pad(ascii("BZh9")), "bzip2", "archive"],
  ["xz", () => pad([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0, 0, 4]), "xz", "archive"],
  ["zstd", () => pad([0x28, 0xb5, 0x2f, 0xfd, 0, 0]), "zstd", "archive"],
  ["tar", tar, "tar", "archive"],
  ["cab", () => pad(ascii("MSCF")), "cab", "archive"],
  ["mp3 (ID3)", () => pad([...ascii("ID3"), 3, 0, 0]), "mp3", "audio"],
  ["mp3 (frame)", () => pad([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]), "mp3", "audio"],
  ["aac (ADTS)", () => pad([0xff, 0xf1, 0x50, 0x80, 0x01, 0x3f, 0xfc]), "aac", "audio"],
  ["mp4", () => ftyp("isom"), "mp4", "video"],
  ["m4a", () => ftyp("M4A "), "m4a", "audio"],
  ["mov", () => ftyp("qt  "), "mov", "video"],
  ["3gp", () => ftyp("3gp4"), "3gp", "video"],
  ["m4v", () => ftyp("M4V "), "m4v", "video"],
  ["old QuickTime", () => pad([0, 0, 0, 0x20, ...ascii("moov")]), "mov", "video"],
  ["mkv", () => pad([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88, ...ascii("matroska")]), "mkv", "video"],
  ["webm", () => pad([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, ...ascii("webm")]), "webm", "video"],
  ["avi", () => riff("AVI "), "avi", "video"],
  ["wav", () => riff("WAVE"), "wav", "audio"],
  ["ogg", () => pad(ascii("OggS")), "ogg", "audio"],
  ["flac", () => pad(ascii("fLaC")), "flac", "audio"],
  ["aiff", () => pad([...ascii("FORM"), 0, 0, 0, 0, ...ascii("AIFF")]), "aiff", "audio"],
  ["midi", () => pad(ascii("MThd")), "midi", "audio"],
  ["flv", () => pad([...ascii("FLV"), 1, 5]), "flv", "video"],
  ["asf / wmv", () => pad([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9]), "asf", "video"],
  ["mpeg", () => pad([0, 0, 1, 0xba, 0x44]), "mpeg", "video"],
  ["sqlite", () => pad(ascii("SQLite format 3\0")), "sqlite", "data"],
  ["binary plist", () => pad(ascii("bplist00")), "bplist", "data"],
  ["Windows program", () => pe(), "pe", "program"],
  ["Windows DLL", () => pe(true), "pe", "program"],
  ["ELF", elf, "elf", "program"],
  ["Mach-O 64 (little endian)", () => macho("le64"), "macho", "program"],
  ["Mach-O 32 (little endian)", () => macho("le32"), "macho", "program"],
  ["Mach-O 32 (big endian)", () => macho("be32"), "macho", "program"],
  ["Mach-O 64 (big endian)", () => macho("be64"), "macho", "program"],
  ["fat Mach-O (2 architectures)", () => fat(2), "macho", "program"],
  ["fat Mach-O (arm64)", () => fat(3, 0x0100000c), "macho", "program"],
  ["Java class", () => javaClass(52), "javaclass", "program"],
  ["Java class (old)", () => javaClass(45), "javaclass", "program"],
  ["shell script", () => text("#!/bin/sh\necho hi\n"), "script", "script"],
  ["env script", () => text("#!/usr/bin/env python3\nprint(1)\n"), "script", "script"],
  ["HTML", () => text("<!DOCTYPE html>\n<html><body>hi</body></html>"), "html", "text"],
  ["HTML with a BOM and blank lines", () => new Uint8Array([0xef, 0xbb, 0xbf, ...text("\n\n  <HTML>\n<head>")]), "html", "text"],
  ["XML", () => text('<?xml version="1.0"?>\n<root/>'), "xml", "text"],
  ["SVG", () => text('<svg xmlns="http://www.w3.org/2000/svg" width="1"/>'), "svg", "image"],
  ["SVG with an XML header", () => text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'), "svg", "image"],
  ["RTF", () => text("{\\rtf1\\ansi\\deff0 Hello}"), "rtf", "document"],
  ["OLE2", () => pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "ole2", "document"],
  ["TrueType font", ttf, "ttf", "font"],
  ["OpenType font", () => pad(ascii("OTTO")), "otf", "font"],
  ["WOFF", () => pad(ascii("wOFF")), "woff", "font"],
  ["WOFF2", () => pad(ascii("wOF2")), "woff2", "font"],
  ["font collection", () => pad(ascii("ttcf")), "ttc", "font"],
];

describe("recognising real content", () => {
  for (const [label, make, kind, family] of SAMPLES) {
    test(`${label} is ${kind}`, () => {
      const s = sniffType(make());
      expect(s?.kind).toBe(kind);
      expect(s?.family).toBe(family);
      expect(s!.label.length).toBeGreaterThan(3);
    });
  }

  test("a DLL says so, and only programs and shebang scripts are dangerous", () => {
    expect(sniffType(pe(true))!.label).toContain("DLL");
    expect(sniffType(pe(true))!.extensions).toEqual(["dll"]);
    expect(sniffType(pe())!.extensions).toEqual(["exe"]);
    const dangerous = SAMPLES.filter(([, make]) => sniffType(make())!.danger).map(([, , kind]) => kind);
    expect([...new Set(dangerous)].sort()).toEqual(["elf", "macho", "pe", "script"]);
  });

  test("every kind has plain words, a family and an article", () => {
    for (const k of sniffKinds()) {
      expect(k.label, k.kind).toMatch(/^(an?|binary) /);
      expect(k.family).toBeTruthy();
    }
  });

  test("a fat Mach-O program and a Java class are told apart by the number after CAFEBABE", () => {
    expect(sniffType(fat(1))!.kind).toBe("macho");
    expect(sniffType(fat(30))!.kind).toBe("macho");
    expect(sniffType(javaClass(65))!.kind).toBe("javaclass");
    // 31 "architectures" isn't a fat binary and not a Java version either: just binary data
    expect(sniffType(pad([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 31]))!.kind).toBe("binary");
    expect(sniffType(fat(2, 0x1234))!.kind).toBe("binary");
  });

  test("MZ alone is not a program: it needs a valid PE header pointer", () => {
    expect(sniffType(text("MZ is the start of this note. ".repeat(5)))!.kind).toBe("text");
    const noPtr = pe();
    put32le(noPtr, 0x3c, 0x7777777);
    expect(sniffType(noPtr)!.kind).toBe("binary");
    const wrongSig = pe();
    wrongSig.set(ascii("XX\0\0"), 0x80);
    expect(sniffType(wrongSig)!.kind).toBe("binary");
    const farPtr = pe(); // header beyond what is read: judged from the DOS header
    put32le(farPtr, 0x3c, 0x4000);
    expect(sniffType(farPtr)!.kind).toBe("pe");
  });

  test("lookalikes that aren't the format are not claimed", () => {
    expect(sniffType(text("BM is a stock symbol, and this is a note"))!.kind).toBe("text");
    expect(sniffType(text("ID3 tags are what MP3 files use"))!.kind).toBe("text");
    expect(sniffType(text("%PDF- in the middle of this note %PDF-"))!.kind).toBe("pdf"); // it does start with it
    expect(sniffType(text("a note about %PDF- files"))!.kind).toBe("text");
    expect(sniffType(text("#! not a script"))!.kind).toBe("text");
    expect(sniffType(text("\n#!/bin/sh\n"))!.kind).toBe("text"); // a shebang only counts at the very first byte
    expect(sniffType(pad([0xff, 0xd8, 0x00]))!.kind).toBe("binary");
    expect(sniffType(new Uint8Array([0xff, 0xfe, 0x48, 0, 0x69, 0]))!.kind).toBe("text"); // UTF-16 "Hi", not an MP3 frame
  });

  test("text versus binary", () => {
    expect(sniffType(text("Hello, world\nsecond line\ttab\r\n"))!.kind).toBe("text");
    expect(sniffType(text("naïve café — 日本語 ✓"))!.kind).toBe("text");
    expect(sniffType(new Uint8Array([0xef, 0xbb, 0xbf, ...text("with a BOM")]))!.kind).toBe("text");
    expect(sniffType(new Uint8Array([0xff, 0xfe, ...[..."UTF-16 text"].flatMap((c) => [c.charCodeAt(0), 0])]))!.kind).toBe("text");
    expect(sniffType(new Uint8Array([0xfe, 0xff, ...[..."UTF-16 text"].flatMap((c) => [0, c.charCodeAt(0)])]))!.kind).toBe("text");
    expect(sniffType(new Uint8Array([...[..."no bom here"].flatMap((c) => [c.charCodeAt(0), 0])]))!.kind).toBe("text");
    expect(sniffType(new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20, 0x6f, 0x6b]))!.kind).toBe("text"); // Latin-1 "café ok"
    expect(sniffType(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))!.kind).toBe("binary");
    expect(sniffType(new Uint8Array(Array.from({ length: 300 }, (_, i) => (i * 37 + 11) % 256)))!.kind).toBe("binary");
    expect(sniffType(text("has a NUL\0 inside"))!.kind).toBe("binary");
  });

  test("a text cut off in the middle of a character is still text", () => {
    const bytes = text("é".repeat(400)).subarray(0, 599);
    expect(sniffType(bytes)!.kind).toBe("text");
  });

  test("no bytes, no answer; only the first bytes count", () => {
    expect(sniffType(new Uint8Array(0))).toBeNull();
    const big = new Uint8Array(100_000);
    big.set(png());
    expect(sniffType(big)!.kind).toBe("png");
    const late = new Uint8Array(100_000);
    late.set(png(), 5000); // a signature far from the start doesn't count
    expect(sniffType(late)!.kind).toBe("binary");
    expect(SNIFF_BYTES).toBe(600);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The extension table
// ---------------------------------------------------------------------------------------------------------------

const verdict = (name: string, bytes: Uint8Array) => composeCheck(name, sniffType(bytes));

describe("which content each extension may hold", () => {
  test("zip families are never flagged for being zips", () => {
    const zip = pad([...ascii("PK"), 3, 4, 20, 0]);
    for (const ext of ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub", "jar", "apk", "ipa", "xpi", "pages", "numbers", "key", "war", "whl", "nupkg", "vsix", "docm", "kmz", "cbz"]) {
      expect(verdict(`file.${ext}`, zip), ext).toBeNull();
    }
  });

  test("ftyp families accept any ftyp brand", () => {
    for (const ext of ["m4a", "mp4", "mov", "heic", "heif", "avif", "3gp", "m4v", "m4b"]) {
      for (const brand of ["isom", "M4A ", "qt  ", "heic", "avif", "3gp4", "M4V "]) expect(verdict(`clip.${ext}`, ftyp(brand)), `${ext} ${brand}`).toBeNull();
    }
  });

  test("OLE2 families accept OLE2", () => {
    const ole = pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    for (const ext of ["msi", "doc", "xls", "ppt", "msg", "wps", "vsd", "pub", "docx"]) expect(verdict(`a.${ext}`, ole), ext).toBeNull();
  });

  test("all text and source code extensions accept text, scripts and markup", () => {
    const exts = "txt md csv tsv json xml html css js mjs ts tsx py rb go rs java c cpp h sh bat cmd ps1 psm1 vbs php sql yaml yml toml ini cfg conf log srt vtt svg plist".split(" ");
    const samples = [text("hello there\n"), text("#!/usr/bin/env node\nconsole.log(1)\n"), text("<!DOCTYPE html><html></html>"), text('<?xml version="1.0"?><a/>'), text('<svg xmlns="x"/>'), new Uint8Array([0xff, 0xfe, 0x68, 0, 0x69, 0])];
    for (const ext of exts) for (const s of samples) if (!(ext === "svg" && sniffType(s)!.kind === "script")) expect(verdict(`f.${ext}`, s), `${ext} ${sniffType(s)!.kind}`).toBeNull();
  });

  test("`.ts` may be MPEG transport video, `.log`/`.sql` may be binary; `.txt` may not", () => {
    expect(verdict("clip.ts", pad([0x47, 0x40, 0, 0x10, 0, 0, 0xb0, 0x0d]))).toBeNull();
    expect(verdict("clip.ts", pad([0, 0, 1, 0xba, 0x44]))).toBeNull();
    expect(verdict("a.log", pad([1, 2, 3, 0, 5, 6]))).toBeNull();
    expect(verdict("dump.sql", pad([1, 2, 3, 0, 5, 6]))).toBeNull();
    expect(verdict("a.txt", pad([1, 2, 3, 0, 5, 6]))!.severity).toBe("warning");
  });

  test("no extension, unknown extensions and never-judged extensions say nothing, whatever is inside", () => {
    const things = [png(), pe(), elf(), text("hi"), pad([1, 2, 3, 0])];
    for (const name of ["README", "Makefile", ".bashrc", "data.dat", "x.bin", "x.tmp", "x.bak", "x.old", "x.part", "x.crdownload", "x.download", "x.unknown", "x.zzzz", "x.2024", "archive.tar.lz4", "disk.iso", "a.dmg", "x.db", "x.pem", "photo.nef"]) {
      for (const bytes of things) expect(verdict(name, bytes), `${name} ${sniffType(bytes)!.kind}`).toBeNull();
    }
  });

  test("tar.gz and tgz hold gzip", () => {
    const gz = pad([0x1f, 0x8b, 8, 0]);
    expect(verdict("backup.tar.gz", gz)).toBeNull();
    expect(verdict("backup.tgz", gz)).toBeNull();
    expect(verdict("backup.tar.gz", png())!.severity).toBe("warning");
    expect(verdict("a.tar.bz2", pad(ascii("BZh9")))).toBeNull();
  });

  test("exact formats match their own extensions", () => {
    expect(verdict("a.jpg", jpeg())).toBeNull();
    expect(verdict("a.JPEG", jpeg())).toBeNull();
    expect(verdict("a.jpe", jpeg())).toBeNull();
    expect(verdict("a.jfif", jpeg())).toBeNull();
    expect(verdict("a.png", png())).toBeNull();
    expect(verdict("a.mp3", pad([...ascii("ID3"), 3, 0, 0]))).toBeNull();
    expect(verdict("a.pdf", text("%PDF-1.4\n"))).toBeNull();
    expect(verdict("a.dll", pe(true))).toBeNull();
    expect(verdict("a.exe", pe())).toBeNull();
    expect(verdict("a.sqlite", pad(ascii("SQLite format 3\0")))).toBeNull();
    expect(expectedFor("exe")).toBeNull();
    expect(expectedFor("nothing")).toBeNull();
    expect(expectedFor("jpg")!.kinds.has("jpeg")).toBe(true);
    expect(expectedFor(".PNG")!.family).toBe("image");
  });

  test("binary data of an unrecognised format is not reported for media and documents (it may be damaged or rare)", () => {
    for (const name of ["a.pdf", "a.jpg", "a.mp3", "a.docx", "a.zip", "a.mp4"]) expect(verdict(name, pad([1, 2, 3, 0, 9, 9, 9])), name).toBeNull();
  });

  test("empty files say nothing", async () => {
    expect(composeCheck("a.pdf", sniffType(new Uint8Array(0)))).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Severity and suggestions
// ---------------------------------------------------------------------------------------------------------------

describe("what is said about a mismatch", () => {
  test("a program named like a document, picture, sound, video, archive or text is danger", () => {
    for (const name of ["invoice.pdf", "photo.jpg", "song.mp3", "clip.mp4", "backup.zip", "notes.txt", "sheet.xlsx", "photo.PNG"]) {
      for (const [bytes, kind] of [[pe(), "pe"], [elf(), "elf"], [macho(), "macho"], [fat(), "macho"]] as const) {
        const c = verdict(name, bytes)!;
        expect(c.severity, `${name} ${kind}`).toBe("danger");
        expect(c.code).toBe("PROGRAM_DISGUISED");
        expect(c.actual!.kind).toBe(kind);
        expect(c.suggestedExtension).toBeUndefined();
      }
    }
    const pdfPe = verdict("invoice.pdf", pe())!;
    expect(pdfPe.detail).toBe('This file is named "invoice.pdf", but it is really a Windows program. Opening it could run it on your computer.');
    expect(pdfPe.title).toContain("program");
  });

  test("a shebang script named like a document or picture is danger, but a text name may hold one", () => {
    const sh = text("#!/bin/sh\nrm -rf ~\n");
    for (const name of ["invoice.pdf", "photo.jpg", "song.mp3", "archive.zip"]) {
      const c = verdict(name, sh)!;
      expect(c.severity).toBe("danger");
      expect(c.code).toBe("SCRIPT_DISGUISED");
    }
    for (const name of ["run.sh", "tool.py", "notes.txt", "x.js", "README.md"]) expect(verdict(name, sh), name).toBeNull();
  });

  test("a different category is a warning", () => {
    const cases: Array<[string, Uint8Array, string]> = [
      ["report.pdf", text("just some words"), "plain text file"],
      ["photo.jpg", text("<!DOCTYPE html><html></html>"), "web page"],
      ["song.mp3", pad([...ascii("PK"), 3, 4]), "ZIP"],
      ["letter.docx", pad(ascii("SQLite format 3\0")), "database"],
      ["notes.txt", pad([1, 2, 3, 0, 5]), "binary data"],
      ["data.csv", png(), "PNG"],
      ["movie.mp4", jpeg(), "JPEG"],
      ["report.pdf", pad([...ascii("PK"), 3, 4]), "ZIP"],
    ];
    for (const [name, bytes, word] of cases) {
      const c = verdict(name, bytes)!;
      expect(c.severity, name).toBe("warning");
      expect(c.code).toBe("WRONG_KIND");
      expect(c.detail).toContain(word);
      expect(c.detail).toContain(`"${name}"`);
    }
  });

  test("another format of the same sort of file is a notice, with the right extension suggested", () => {
    const c = verdict("photo.jpg", png())!;
    expect(c.severity).toBe("notice");
    expect(c.code).toBe("WRONG_FORMAT");
    expect(c.suggestedExtension).toBe("png");
    expect(c.suggestedName).toBe("photo.png");
    expect(c.actual).toEqual({ kind: "png", label: "a PNG picture" });
    const table: Array<[string, Uint8Array, string, string]> = [
      ["clip.mp4", pad([0x1a, 0x45, 0xdf, 0xa3, ...ascii("matroska")]), "mkv", "clip.mkv"],
      ["song.mp3", riff("WAVE"), "wav", "song.wav"],
      ["pic.png", jpeg(), "jpg", "pic.jpg"],
      ["a.b.c.gif", png(), "png", "a.b.c.png"],
      ["report.docx", text("%PDF-1.7"), "pdf", "report.pdf"],
      ["a.zip", pad([0x1f, 0x8b, 8, 0]), "gz", "a.gz"],
      ["note.txt", text("{\\rtf1 hi}"), "rtf", "note.rtf"],
    ];
    for (const [name, bytes, ext, renamed] of table) {
      const v = verdict(name, bytes)!;
      expect(v.severity, name).toBe("notice");
      expect(v.suggestedExtension, name).toBe(ext);
      expect(v.suggestedName, name).toBe(renamed);
    }
  });

  test("a PDF named .jpg is a warning, and renaming to .pdf is suggested", () => {
    const c = verdict("scan.jpg", text("%PDF-1.4"))!;
    expect(c.severity).toBe("warning");
    expect(c.suggestedExtension).toBe("pdf");
    expect(c.suggestedName).toBe("scan.pdf");
  });

  test("no suggestion when the real format has no single usual extension, or the name is compound", () => {
    expect(verdict("a.pdf", pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))!.suggestedExtension).toBeUndefined();
    expect(verdict("a.pdf", text("words"))!.suggestedExtension).toBeUndefined();
    expect(verdict("a.tar.gz", png())!.suggestedExtension).toBeUndefined();
    expect(verdict("a.tar", pad([0x1f, 0x8b, 8, 0]))!.suggestedExtension).toBeUndefined();
  });

  test("judgeContent is the content rule alone, without name traps", () => {
    expect(judgeContent("a.pdf.exe", sniffType(pe())!)).toBeNull();
    expect(judgeContent("a.jpg", sniffType(png())!)!.severity).toBe("notice");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------

describe("names that are traps on their own", () => {
  test("a document or picture name followed by a launching extension is danger", () => {
    for (const name of ["report.pdf.exe", "photo.jpg.scr", "Invoice.PDF.EXE", "movie.mp4.bat", "sheet.xlsx.cmd", "a.docx.msi", "scan.png.vbs", "x.pdf.vbe", "x.pdf.js", "x.txt.jse", "x.pdf.wsf", "x.pdf.hta", "x.pdf.lnk", "x.pdf.jar", "x.pdf.ps1", "x.pdf.app", "x.pdf.command", "x.pdf.dmg", "x.pdf.pkg", "x.pdf.apk", "x.pdf.com", "x.pdf.pif", "photo.jpg .exe", "a.b.pdf.exe"]) {
      const p = checkName(name);
      expect(p?.code, name).toBe("DOUBLE_EXTENSION");
    }
    const c = verdict("report.pdf.exe", pe())!;
    expect(c.severity).toBe("danger");
    expect(c.code).toBe("DOUBLE_EXTENSION");
    expect(c.detail).toContain("The contents are a Windows program");
    expect(c.actual!.kind).toBe("pe");
  });

  test("ordinary names with several dots are fine", () => {
    for (const name of ["jquery.min.js", "archive.tar.gz", "report.final.pdf", "setup.exe", "v1.2.3.zip", "my.photo.jpg", "data.v2.json", "app.config.js", "a.exe.exe", "notes.txt.bak", "x.tar.exe", "x.pdf.txt", "Screenshot 2024-01-01 at 10.30.45.png", "wait....mp3"]) {
      expect(checkName(name), name).toBeNull();
    }
  });

  test("right-to-left override and the other bidi controls are danger, with the real name spelled out", () => {
    const rlo = "invoice\u202Efdp.exe";
    const p = checkName(rlo)!;
    expect(p.code).toBe("BIDI_OVERRIDE");
    expect(p.visibleName).toBe("invoice‹U+202E›fdp.exe");
    expect(p.detail).toContain("invoice‹U+202E›fdp.exe");
    for (const ch of ["\u202A", "\u202B", "\u202C", "\u202D", "\u202E", "\u2066", "\u2067", "\u2068", "\u2069"]) expect(checkName(`a${ch}b.txt`)?.code, ch.charCodeAt(0).toString(16)).toBe("BIDI_OVERRIDE");
    const c = composeCheck(rlo, null)!;
    expect(c.severity).toBe("danger");
    expect(c.visibleName).toBe("invoice‹U+202E›fdp.exe");
  });

  test("control and invisible characters are danger", () => {
    for (const ch of ["\u0001", "\u0007", "\u001b", "\u007f", "\u0085", "\u200B", "\u2060", "\uFEFF", "\u2028", "\u3164"]) {
      const p = checkName(`photo${ch}.jpg`);
      expect(p?.code, ch.charCodeAt(0).toString(16)).toBe("HIDDEN_CHARACTERS");
      expect(p!.visibleName).toContain("‹U+");
    }
  });

  test("ordinary non-English and emoji names are not flagged", () => {
    for (const name of ["日本語のファイル.txt", "café.pdf", "שלום.docx", "مرحبا.txt", "👨‍👩‍👧 photo.jpg", "Привет.png", "نام\u200cفایل.txt", "שלום\u200f.txt"]) expect(checkName(name), name).toBeNull();
  });

  test("a long padding before the extension is danger", () => {
    expect(checkName("invoice.pdf              .exe")?.code).toBe("DOUBLE_EXTENSION");
    for (const name of ["invoice          .pdf", "report_______.docx", "report.......txt", "a\u00a0\u00a0\u00a0\u00a0\u00a0.pdf", "pic\u3000\u3000\u3000\u3000.png"]) expect(checkName(name)?.code, name).toBe("PADDED_NAME");
    for (const name of ["my   photo.jpg", "a  b.txt", "x_y.txt", "x___.txt"]) expect(checkName(name), name).toBeNull();
  });

  test("a trailing dot or space is danger", () => {
    for (const name of ["report.pdf.", "report.exe ", "photo.jpg  "]) expect(checkName(name)?.code, name).toBe("TRAILING_DOT_SPACE");
    expect(checkName("a")).toBeNull();
  });

  test("a name trap beats a harmless content verdict, but a dangerous content wins over a name trap", () => {
    expect(composeCheck("photo.jpg ", sniffType(png()))!.code).toBe("TRAILING_DOT_SPACE");
    expect(composeCheck("photo.pdf.exe", sniffType(png()))!.code).toBe("DOUBLE_EXTENSION");
    expect(composeCheck("photo.pdf.", sniffType(pe()))!.code).toBe("PROGRAM_DISGUISED");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Files on disk
// ---------------------------------------------------------------------------------------------------------------

const root = mkdtempSync(join(tmpdir(), "fm-sniff-"));
const home = join(root, "home");
const data = join(root, "data");
const docs = join(home, "docs");
const launched: Array<{ command: string; args: string[] }> = [];
const TOKEN = "sniff-token";
let server: ReturnType<typeof startFileManagerServer>;
let base: string;
const ctx = createContext({ home, dataDir: data, platform: "linux", launch: async (command, args) => void launched.push({ command, args }) });

const file = (name: string, bytes: Uint8Array | string) => {
  writeFileSync(join(docs, name), bytes);
  return join(docs, name);
};

beforeAll(() => {
  mkdirSync(docs, { recursive: true });
  server = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: data, platform: "linux", launch: async (command, args) => void launched.push({ command, args }) } });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

async function api(op: string, body: unknown = {}) {
  const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
}

describe("checking files on disk", () => {
  test("a real Windows program named invoice.pdf", async () => {
    const c = await checkFile(file("invoice.pdf", pe()));
    expect(c?.severity).toBe("danger");
    expect(c?.actual?.label).toBe("a Windows program");
  });

  test("a PNG named photo.jpg, a clean file, and an empty file", async () => {
    expect((await checkFile(file("photo.jpg", png())))?.suggestedName).toBe("photo.png");
    expect(await checkFile(file("clean.png", png()))).toBeNull();
    expect(await checkFile(file("empty.pdf", new Uint8Array(0)))).toMatchObject({ severity: "notice", code: "EMPTY_FILE" });
    expect(await checkFile(file("empty.txt", new Uint8Array(0)))).toBeNull();
  });

  test("a PDF that carries junk before its header is still a PDF", async () => {
    expect(await checkFile(file("junky.pdf", "Some leading words\r\n%PDF-1.4\n"))).toBeNull();
    expect((await checkFile(file("notpdf.pdf", "no header at all")))?.severity).toBe("warning");
  });

  test("directories, missing files and special files say nothing", async () => {
    expect(await checkFile(docs)).toBeNull();
    expect(await checkFile(join(docs, "nope.pdf"))).toBeNull();
    expect(await checkFile("/dev/null")).toBeNull();
  });

  test("a link is not followed, but its name still counts", async () => {
    const target = file("real.pdf", pe());
    symlinkSync(target, join(docs, "link.jpg"));
    expect(await checkFile(join(docs, "link.jpg"))).toBeNull();
    symlinkSync(target, join(docs, "doc.pdf.exe"));
    expect((await checkFile(join(docs, "doc.pdf.exe")))?.code).toBe("DOUBLE_EXTENSION");
  });

  test("an unreadable file is judged by its name alone", async () => {
    if (process.getuid?.() === 0) return;
    const p = file("secret.pdf.scr", pe());
    chmodSync(p, 0o000);
    try {
      expect((await checkFile(p))?.code).toBe("DOUBLE_EXTENSION");
      const q = file("secret2.pdf", pe());
      chmodSync(q, 0o000);
      expect(await checkFile(q)).toBeNull();
      chmodSync(q, 0o600);
    } finally {
      chmodSync(p, 0o600);
    }
  });

  test("a huge file is judged from its first bytes only", async () => {
    const p = join(docs, "huge.pdf");
    const fd = openSync(p, "w");
    writeFileSync(fd, pe());
    closeSync(fd);
    truncateSync(p, 4 * 1024 * 1024 * 1024); // sparse: a 4 GB file that costs nothing
    const start = performance.now();
    const c = await checkFile(p);
    expect(c?.severity).toBe("danger");
    expect(performance.now() - start).toBeLessThan(1500);
  });

  test("never throws, whatever it is given", async () => {
    for (const bad of ["", "\0", "relative/path.pdf", "/nonexistent/dir/file.pdf"]) expect(await checkFile(bad).catch(() => "threw")).toBeNull();
  });
});

describe("the check operations", () => {
  test("check/files returns a verdict or null for each path, in order", async () => {
    const paths = [file("a1.pdf", pe()), file("a2.jpg", png()), file("a3.png", png()), file("a4.txt", "hello")];
    const r = await api("check/files", { paths });
    expect(r.status).toBe(200);
    expect(r.json.results.map((x: any) => x.path)).toEqual(paths);
    expect(r.json.results.map((x: any) => x.check?.severity ?? null)).toEqual(["danger", "notice", null, null]);
    expect(r.json.results[0].check.actual.kind).toBe("pe");
    expect(r.json.results[1].check.suggestedName).toBe("a2.png");
  });

  test("check/one answers the same for one file", async () => {
    const p = file("one.mp3", pe());
    const r = await api("check/one", { path: p });
    expect(r.json.path).toBe(p);
    expect(r.json.check.severity).toBe("danger");
    expect((await api("check/one", { path: file("fine.mp3", "ID3\u0003\u0000\u0000")})).json.check).toBeNull();
  });

  test("bad requests are refused in plain words", async () => {
    expect((await api("check/files", { paths: "x" })).status).toBe(400);
    expect((await api("check/files", {})).status).toBe(400);
    expect((await api("check/files", { paths: ["relative.pdf"] })).json.error.code).toBe("BAD_PATH");
    expect((await api("check/one", { path: "relative.pdf" })).json.error.code).toBe("BAD_PATH");
    const tooMany = await api("check/files", { paths: Array.from({ length: MAX_CHECK_PATHS + 1 }, (_, i) => join(docs, `n${i}.pdf`)) });
    expect(tooMany.status).toBe(400);
    expect(tooMany.json.error.code).toBe("TOO_MANY");
    expect((await api("check/files", { paths: Array.from({ length: MAX_CHECK_PATHS }, (_, i) => join(docs, `n${i}.pdf`)) })).json.results.length).toBe(MAX_CHECK_PATHS);
    expect((await api("check/files", { paths: [] })).json.results).toEqual([]);
  });

  test("missing files give null, and a file that vanished is not an error", async () => {
    const r = await api("check/files", { paths: [join(docs, "gone.pdf"), file("here.png", png())] });
    expect(r.json.results.map((x: any) => x.check)).toEqual([null, null]);
  });

  test("checkMany runs at most 16 at a time and stops starting work at the time cap", async () => {
    let running = 0;
    let most = 0;
    const slow = async () => {
      running++;
      most = Math.max(most, running);
      await Bun.sleep(5);
      running--;
      return null;
    };
    const paths = Array.from({ length: 100 }, (_, i) => join(docs, `c${i}.pdf`));
    const all = await checkMany(ctx, paths, { check: slow });
    expect(all.every((x) => !x.skipped)).toBe(true);
    expect(most).toBeLessThanOrEqual(16);
    expect(most).toBeGreaterThan(1);

    const started = performance.now();
    const some = await checkMany(ctx, paths, { check: async () => (await Bun.sleep(40), null), timeCapMs: 120, concurrency: 4 });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(some.length).toBe(100);
    expect(some.some((x) => x.skipped)).toBe(true);
    expect(some.filter((x) => x.skipped).every((x) => x.check === null)).toBe(true);
    expect(some.some((x) => !x.skipped)).toBe(true);
    expect(CHECK_TIME_CAP_MS).toBe(3000);
  });

  test("a check that hangs does not hold the answer past the time cap", async () => {
    const started = performance.now();
    const r = await checkMany(ctx, [join(docs, "h.pdf")], { check: () => new Promise(() => {}), timeCapMs: 100 });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(r).toEqual([{ path: join(docs, "h.pdf"), check: null, skipped: true }]);
  });

  test("the operations need the token like every other", async () => {
    const res = await fetch(`${base}/api/check/files`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [] }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The open guard
// ---------------------------------------------------------------------------------------------------------------

describe("opening a file that isn't what its name says", () => {
  test("danger needs confirmMismatch: 409 TYPE_MISMATCH with the verdict, then it opens", async () => {
    const p = file("open-me.pdf", pe());
    launched.length = 0;
    const refused = await api("open", { path: p });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("TYPE_MISMATCH");
    expect(refused.json.error.message).toContain("Windows program");
    expect(refused.json.error.details.check.severity).toBe("danger");
    expect(launched).toEqual([]);
    const ok = await api("open", { path: p, confirmMismatch: true });
    expect(ok.status).toBe(200);
    expect(launched.length).toBe(1);
  });

  test("a double extension is guarded too, and the program confirmation still comes after it", async () => {
    const p = file("report.pdf.exe", pe());
    launched.length = 0;
    expect((await api("open", { path: p })).json.error.code).toBe("TYPE_MISMATCH");
    const second = await api("open", { path: p, confirmMismatch: true });
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe("NEEDS_CONFIRM");
    expect(launched).toEqual([]);
    expect((await api("open", { path: p, confirmMismatch: true, confirmProgram: true })).status).toBe(200);
    expect(launched.length).toBe(1);
  });

  test("warnings and notices never block", async () => {
    launched.length = 0;
    expect((await api("open", { path: file("w.pdf", "plain words") })).status).toBe(200);
    expect((await api("open", { path: file("n.jpg", png()) })).status).toBe(200);
    expect(launched.length).toBe(2);
  });

  test("a genuine program still asks the program question, and clean files open at once", async () => {
    launched.length = 0;
    const exe = file("setup.exe", pe());
    const r = await api("open", { path: exe });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("NEEDS_CONFIRM");
    expect((await api("open", { path: exe, confirmProgram: true })).status).toBe(200);
    expect((await api("open", { path: file("fine.png", png()) })).status).toBe(200);
  });

  test("openItem and assertOpenAllowed apply the same rule", async () => {
    const p = file("direct.jpg", elf());
    await expect(openItem(ctx, p)).rejects.toMatchObject({ code: "TYPE_MISMATCH" });
    await expect(assertOpenAllowed(ctx, p, false)).rejects.toMatchObject({ code: "TYPE_MISMATCH" });
    await assertOpenAllowed(ctx, p, true);
    launched.length = 0;
    await openItem(ctx, p, false, true);
    expect(launched.length).toBe(1);
  });

  test("a program chosen for that kind of file (Open with) is guarded too", async () => {
    await saveOpenWith(ctx, { programs: [{ id: "viewer", name: "Viewer", kind: "command", target: "viewer", args: [] }], associations: { pdf: "viewer", jpg: "builtin:code" } });
    const p = file("assoc.pdf", pe());
    launched.length = 0;
    const refused = await api("open", { path: p });
    expect(refused.json.error.code).toBe("TYPE_MISMATCH");
    expect(launched).toEqual([]);
    const ok = await api("open", { path: p, confirmMismatch: true });
    expect(ok.status).toBe(200);
    expect(launched[0]!.command).toBe("viewer");
    // a harmless mismatch goes straight to the chosen program
    launched.length = 0;
    expect((await api("open", { path: file("assoc2.pdf", "plain words") })).status).toBe(200);
    expect(launched[0]!.command).toBe("viewer");
  });

  test("openwith/run is guarded for other programs, but not for the built-in editor", async () => {
    const p = file("run.pdf", pe());
    launched.length = 0;
    const refused = await api("openwith/run", { paths: [p], programId: "viewer" });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("TYPE_MISMATCH");
    expect(launched).toEqual([]);
    await expect(runWith(ctx, [p], "viewer")).rejects.toMatchObject({ code: "TYPE_MISMATCH" });
    expect((await api("openwith/run", { paths: [p], programId: "viewer", confirmMismatch: true })).status).toBe(200);
    const builtin = await api("openwith/run", { paths: [p], programId: "builtin:code" });
    expect(builtin.status).toBe(200);
    expect(builtin.json.builtin).toBe("code");
  });
});

describe("the setting", () => {
  test("typeWarnings defaults to on, is validated, and can be changed", async () => {
    expect(DEFAULT_SETTINGS.typeWarnings).toBe(true);
    expect(sanitizeSettings({}, ctx).typeWarnings).toBe(true);
    expect(sanitizeSettings({ typeWarnings: false }, ctx).typeWarnings).toBe(false);
    expect(sanitizeSettings({ typeWarnings: "no" }, ctx).typeWarnings).toBe(true);
    expect((await api("settings")).json.settings.typeWarnings).toBe(true);
    expect((await api("settings", { set: { typeWarnings: false } })).json.settings.typeWarnings).toBe(false);
    expect((await api("settings", { set: { typeWarnings: 5 } })).json.settings.typeWarnings).toBe(true);
    await api("settings", { set: { typeWarnings: true } });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Empty files with a file type in the name, and names with two file types
// ---------------------------------------------------------------------------------------------------------------

describe("empty files and two endings", () => {
  const dir = mkdtempSync(join(tmpdir(), "fm-empty-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const onDisk = async (name: string, content: string | Uint8Array) => {
    writeFileSync(join(dir, name), content);
    return checkFile(join(dir, name));
  };

  test("an empty picture, sound, PDF, archive or Office file is not that thing yet", async () => {
    for (const name of ["a.png", "a.jpg", "a.mp3", "a.mp4", "a.pdf", "a.zip", "a.docx", "a.xlsx", "a.heic"]) {
      const c = await onDisk(name, "");
      expect(c, name).toMatchObject({ severity: "notice", code: "EMPTY_FILE", actual: { kind: "empty" } });
      expect(c!.detail).toContain("is empty");
    }
  });

  test("empty text, code, unknown and database files say nothing", async () => {
    for (const name of ["a.txt", "a.md", "a.json", "a.js", "a.ts", "a.svg", "a.sqlite", "a.db3", "a.bin", "a.dat", "noextension", "a.xyz"]) expect(await onDisk(name, ""), name).toBeNull();
  });

  test("New file.txt.png: two endings (and empty), with a rename back to .txt; with text inside the content verdict wins", async () => {
    const empty = await onDisk("New file.txt.png", "");
    expect(empty).toMatchObject({ severity: "notice", code: "TWO_ENDINGS", suggestedExtension: "txt", suggestedName: "New file.txt" });
    expect(empty!.detail).toMatch(/has two file types in its name\. Only the last one, \.png, counts/);
    expect(empty!.detail).toMatch(/also empty/);
    const withText = await onDisk("New file.txt.png", "just words\n");
    expect(withText).toMatchObject({ severity: "warning", code: "WRONG_KIND" });
    const realPng = await onDisk("New file.txt.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]));
    expect(realPng).toMatchObject({ code: "TWO_ENDINGS" });
    expect(realPng!.detail).not.toContain("empty");
  });

  test("which names count as two endings", () => {
    const two = (n: string) => checkEndings(n)?.last ?? null;
    expect(two("New file.txt.png")).toBe("png");
    expect(two("report.pdf.jpg")).toBe("jpg");
    expect(two("song.mp3.txt")).toBe("txt");
    for (const quiet of ["a.jpg.png", "data.json.txt", "x.md.txt", "app.min.js", "backup.tar.gz", "v1.2.png", "photo.final.png", "a.png", "noext", "a..png", ".hidden.png", "x.txt.exe", "x.pdf.bat"]) expect(two(quiet), quiet).toBeNull();
    expect(needsContent("png")).toBe(true);
    expect(needsContent("txt")).toBe(false);
    expect(needsContent("sqlite")).toBe(false);
    expect(needsContent("nope")).toBe(false);
  });

  test("the strong rules still win: a program in disguise or a launch ending is a danger, not this notice", async () => {
    expect(composeCheck("x.txt.exe", null, true)).toMatchObject({ severity: "danger", code: "DOUBLE_EXTENSION" });
    expect(composeCheck("holiday.txt.png", sniffType(pe()), false)).toMatchObject({ severity: "danger" });
  });
});
