import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { deflateSync, gzipSync } from "zlib";
import { createContext } from "../src/features/filemanager/fmCore";
import { elfInfo, fontInfo, machoInfo, peInfo, sqliteInfo } from "../src/features/filemanager/fmInfoBinary";
import { bufferSource } from "../src/features/filemanager/fmInfoCommon";
import { documentInfo } from "../src/features/filemanager/fmInfoDoc";
import { parsePdf, pdfDate, pdfGroups, pdfString } from "../src/features/filemanager/fmInfoPdf";
import { analyzeText, guessEncoding, jsonRows, textGroups } from "../src/features/filemanager/fmInfoText";
import { isTarHeader, walkTar } from "../src/features/filemanager/fmInfoZipDoc";
import { zipBuffer } from "../src/features/filemanager/fmConvZip";
import { elf64, machoUniversal, pdf, pe64, scratchRoot, sqliteDb } from "./file_manager_info_fixtures";

const root = scratchRoot("doc");
afterAll(() => root.remove());
const ctx = createContext({ home: root.dir, dataDir: join(root.dir, "data") });
const dir = join(root.dir, "files");
mkdirSync(dir, { recursive: true });
const put = (name: string, data: Buffer | string) => {
  const p = join(dir, name);
  writeFileSync(p, data);
  return p;
};
const rows = (r: { groups: Array<{ id: string; rows: Array<{ label: string; value: string; flag?: string }> }> }) => Object.fromEntries(r.groups.flatMap((g) => g.rows.map((x) => [`${g.id}/${x.label}`, x.value])));
const flags = (r: { groups: Array<{ id: string; rows: Array<{ label: string; flag?: string }> }> }) => Object.fromEntries(r.groups.flatMap((g) => g.rows.map((x) => [`${g.id}/${x.label}`, x.flag])));
const tool = (n: string) => Bun.which(n);
async function run(argv: string[]) {
  const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out;
}

describe("PDF", () => {
  test("version, pages, page size, Info dictionary (escapes, hex strings, dates)", async () => {
    const info = await parsePdf(bufferSource(pdf({ pages: 3 })));
    expect(info).toMatchObject({ version: "1.7", pages: 3, encrypted: false, linearized: false });
    expect(info.pageSize).toContain("A4");
    expect(info.info.Title).toBe("Quarterly (draft) Report");
    expect(info.info.Author).toBe("JoeDoe");
    expect(info.info.Producer).toBe("Test Producer 1.2");
    expect(info.info.CreationDate).toBe("2024-01-02 03:04:05 (+02:00)");
    expect(info.info.ModDate).toBe("2024-02-03 04:05:06 UTC");
    expect(info.flags.every((f) => !f.found)).toBe(true);
  });

  test("encrypted, linearized and the warning flags are found by scanning, never by running anything", async () => {
    const info = await parsePdf(bufferSource(pdf({ encrypted: true, linearized: true, javascript: true, launch: true })));
    expect([info.encrypted, info.linearized]).toEqual([true, true]);
    const found = info.flags.filter((f) => f.found).map((f) => f.label);
    expect(found).toEqual(expect.arrayContaining(["JavaScript", "Launch action", "Runs something when opened"]));
    const g = pdfGroups(info).find((x) => x.id === "security")!;
    expect(g.rows.find((r) => r.label === "JavaScript")).toMatchObject({ flag: "warn", value: "Found. It was NOT run." });
    expect(g.rows.find((r) => r.label === "Embedded files")!.flag).toBe("good");
  });

  test("dictionaries inside compressed object streams are read too", async () => {
    const objs = "<< /Type /Pages /Count 7 /Kids [] >> << /Title (Hidden Title) /Author (Zed) >>";
    const header = "10 0 11 " + String(objs.indexOf("<< /Title") + 0) + " ";
    const body = header + objs;
    const packed = deflateSync(Buffer.from(body, "latin1"));
    const file = Buffer.concat([Buffer.from("%PDF-1.5\n5 0 obj\n<< /Type /ObjStm /N 2 /First " + header.length + " /Filter /FlateDecode /Length " + packed.length + " >>\nstream\n", "latin1"), packed, Buffer.from("\nendstream\nendobj\n6 0 obj\n<< /Title (From Objstm) /Author (Zed) >>\nendobj\ntrailer\n<< /Info 6 0 R >>\n", "latin1")]);
    const info = await parsePdf(bufferSource(file));
    expect(info.pages).toBe(7);
    expect(info.info.Title).toBe("From Objstm");
  });

  test("odd files don't throw", async () => {
    for (const junk of [Buffer.from("%PDF-"), Buffer.alloc(1000), Buffer.from("%PDF-1.4\n/Pages /Pages /Pages ".repeat(2000)), Buffer.from("%PDF-1.4\n" + "/Info 1 0 R ".repeat(5000))]) await parsePdf(bufferSource(junk));
    expect(pdfString("(a\\)b\\\\c\\101)")).toBe("a)b\\cA");
    expect(pdfString("<FEFF00480069>")).toBe("Hi");
    expect(pdfString("(\\376\\377\\000H\\000i)")).toBe("Hi");
    expect(pdfDate("D:2020")).toBe("2020-01-01 00:00:00");
    expect(pdfDate("garbage")).toBe("garbage");
  });

  test("a big file is only scanned at its ends, and says so", async () => {
    const big = Buffer.concat([pdf({ pages: 2 }).subarray(0, 60), Buffer.alloc(30 * 1024 * 1024), pdf({ pages: 2 }).subarray(60)]);
    const info = await parsePdf(bufferSource(big));
    expect(info.partial).toBe(true);
  });

  test.skipIf(!tool("magick") || !tool("exiftool"))("a real PDF agrees with exiftool", async () => {
    const path = join(dir, "real.pdf");
    const made = Bun.spawnSync([tool("magick")!, "-size", "200x100", "xc:white", "-density", "72", path], { stdout: "ignore", stderr: "ignore" });
    if (made.exitCode !== 0 || !existsSync(path)) return; // no PDF writer (Ghostscript) here
    const [j] = JSON.parse(await run([tool("exiftool")!, "-json", "-n", path]));
    const mine = await parsePdf(bufferSource(Buffer.from(await Bun.file(path).arrayBuffer())));
    expect(mine.pages).toBe(j.PageCount);
    expect(mine.version).toBe(String(j.PDFVersion));
  });
});

describe("Office, OpenDocument and EPUB files built with the repo's zip writer", () => {
  const xml = (s: string) => Buffer.from(`<?xml version="1.0"?>${s}`);
  const core = xml('<cp:coreProperties xmlns:cp="c" xmlns:dc="d" xmlns:dcterms="t"><dc:title>Budget &amp; Plan</dc:title><dc:creator>Ann Author</dc:creator><cp:lastModifiedBy>Bob Editor</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2023-01-02T03:04:05Z</dcterms:created><dcterms:modified>2024-02-03T04:05:06Z</dcterms:modified><cp:revision>7</cp:revision><dc:subject>Money</dc:subject></cp:coreProperties>');
  const app = (extra = "") => xml(`<Properties><Application>Microsoft Office Word</Application><AppVersion>16.0000</AppVersion><Pages>12</Pages><Words>3456</Words><Characters>20000</Characters><Company>Acme</Company><TotalTime>95</TotalTime>${extra}</Properties>`);

  test("docx: title, author, last saved by, dates, counts, company", async () => {
    const p = put("a.docx", zipBuffer([{ name: "[Content_Types].xml", data: xml("<Types/>") }, { name: "docProps/core.xml", data: core }, { name: "docProps/app.xml", data: app() }, { name: "word/document.xml", data: xml("<w:document/>") }]));
    const r = await documentInfo(ctx, p);
    expect(r.kind).toBe("Word document (docx)");
    const x = rows(r);
    expect(x["document/Title"]).toBe("Budget & Plan");
    expect(x["document/Author"]).toBe("Ann Author");
    expect(x["document/Last saved by"]).toBe("Bob Editor");
    expect(x["document/Created"]).toBe("2023-01-02T03:04:05Z");
    expect(x["document/Revision"]).toBe("7");
    expect(x["document/Made with"]).toBe("Microsoft Office Word 16.0000");
    expect(x["document/Pages"]).toBe("12");
    expect(x["document/Words"]).toBe("3456");
    expect(x["document/Company"]).toBe("Acme");
    expect(x["document/Editing time"]).toBe("95 minutes");
    expect(x["document/Macros"]).toContain("None");
    expect(x["archive/Items inside"]).toContain("4 (4 files");
  });

  test("xlsx sheets, pptx slides and a macro warning", async () => {
    const xlsx = put("b.xlsx", zipBuffer([{ name: "[Content_Types].xml", data: xml("<Types/>") }, { name: "docProps/app.xml", data: app() }, { name: "xl/workbook.xml", data: xml('<workbook><sheets><sheet name="Totals" sheetId="1" r:id="rId1"/><sheet name="Q&amp;A" sheetId="2"/></sheets></workbook>') }, { name: "xl/vbaProject.bin", data: Buffer.from("macro") }]));
    const x = rows(await documentInfo(ctx, xlsx));
    expect(x["document/Sheets"]).toBe("2: Totals, Q&A");
    expect(x["document/Macros"]).toContain("NOT run");
    const pptx = put("c.pptx", zipBuffer([{ name: "[Content_Types].xml", data: xml("<Types/>") }, { name: "docProps/app.xml", data: app("<Slides>3</Slides><HiddenSlides>1</HiddenSlides>") }, ...[1, 2, 3].map((i) => ({ name: `ppt/slides/slide${i}.xml`, data: xml("<s/>") }))]));
    const p = rows(await documentInfo(ctx, pptx));
    expect(p["document/Slides"]).toBe("3");
    expect(p["document/Hidden slides"]).toBe("1");
    expect((await documentInfo(ctx, pptx)).kind).toBe("PowerPoint presentation (pptx)");
    expect(flags(await documentInfo(ctx, xlsx))["document/Macros"]).toBe("warn");
  });

  test("OpenDocument and EPUB", async () => {
    const odt = put("d.odt", zipBuffer([{ name: "mimetype", data: Buffer.from("application/vnd.oasis.opendocument.text") }, { name: "meta.xml", data: xml('<office:meta><meta:generator>LibreOffice/7</meta:generator><dc:title>ODT Title</dc:title><dc:creator>Olga</dc:creator><meta:initial-creator>Ivan</meta:initial-creator><meta:creation-date>2022-05-06T07:08:09</meta:creation-date><dc:date>2023-01-01T00:00:00</dc:date><meta:document-statistic meta:page-count="4" meta:word-count="999" meta:character-count="5000"/></office:meta>') }]));
    const o = rows(await documentInfo(ctx, odt));
    expect([o["document/Title"], o["document/Author"], o["document/First author"], o["document/Pages"], o["document/Words"], o["document/Made with"]]).toEqual(["ODT Title", "Olga", "Ivan", "4", "999", "LibreOffice/7"]);
    const epub = put("e.epub", zipBuffer([{ name: "mimetype", data: Buffer.from("application/epub+zip") }, { name: "META-INF/container.xml", data: xml('<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="x"/></rootfiles></container>') }, { name: "OEBPS/content.opf", data: xml('<package><metadata><dc:title>The Book</dc:title><dc:creator>Writer</dc:creator><dc:language>en</dc:language><dc:publisher>Pub Co</dc:publisher><dc:identifier>urn:isbn:123</dc:identifier></metadata><manifest><item id="a"/><item id="b"/><item id="c"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>') }]));
    const e = rows(await documentInfo(ctx, epub));
    expect([e["document/Title"], e["document/Author"], e["document/Language"], e["document/Publisher"], e["document/Chapters in reading order"], e["document/Files listed"]]).toEqual(["The Book", "Writer", "en", "Pub Co", "2", "3"]);
  });

  test("a part bigger than the safety limit is skipped, not inflated", async () => {
    const big = xml(`<cp:coreProperties><dc:title>${"x".repeat(3 * 1024 * 1024)}</dc:title></cp:coreProperties>`);
    const p = put("big.docx", zipBuffer([{ name: "[Content_Types].xml", data: xml("<Types/>") }, { name: "docProps/core.xml", data: big }, { name: "word/document.xml", data: xml("<w/>") }]));
    const start = Date.now();
    const r = rows(await documentInfo(ctx, p));
    expect(r["document/Title"]).toBeUndefined();
    expect(r["archive/Items inside"]).toBeDefined();
    expect(Date.now() - start).toBeLessThan(2000);
  });

  test.skipIf(!tool("exiftool"))("agrees with exiftool on a docx", async () => {
    const p = join(dir, "a.docx");
    const [j] = JSON.parse(await run([tool("exiftool")!, "-json", "-n", p]));
    const x = rows(await documentInfo(ctx, p));
    if (j.Title) expect(x["document/Title"]).toBe(j.Title);
    if (j.Creator) expect(x["document/Author"]).toBe(j.Creator);
    if (j.LastModifiedBy) expect(x["document/Last saved by"]).toBe(j.LastModifiedBy);
  });
});

describe("zip archives, bombs and the safety caps", () => {
  test("entries, sizes, ratio and the largest items", async () => {
    const p = put("plain.zip", zipBuffer([{ name: "a.txt", data: Buffer.alloc(5000, 0x61) }, { name: "dir/", data: Buffer.alloc(0) }, { name: "dir/b.bin", data: Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 7919) & 255)) }]));
    const r = await documentInfo(ctx, p);
    const x = rows(r);
    expect(x["archive/Items inside"]).toBe("3 (2 files, 1 folders)");
    expect(x["archive/Total size when unpacked"]).toContain("8,000 bytes");
    expect(x["archive/Password-protected items"]).toBe("None");
    expect(r.groups.find((g) => g.id === "largest")!.rows[0]!.label).toBe("a.txt");
  });

  test("a password-protected entry is reported, not read", async () => {
    const z = zipBuffer([{ name: "secret.txt", data: Buffer.from("top secret words") }]);
    for (let i = 0; i + 4 < z.length; i++) {
      if (z.readUInt32LE(i) === 0x02014b50) z.writeUInt16LE(z.readUInt16LE(i + 8) | 1, i + 8);
      if (z.readUInt32LE(i) === 0x04034b50) z.writeUInt16LE(z.readUInt16LE(i + 6) | 1, i + 6);
    }
    const r = rows(await documentInfo(ctx, put("locked.zip", z)));
    expect(r["archive/Password-protected items"]).toContain("1.");
  });

  test("a zip bomb is described, and nothing is unpacked", async () => {
    const bomb = zipBuffer([{ name: "zeros.bin", data: Buffer.alloc(128 * 1024 * 1024) }]);
    expect(bomb.length).toBeLessThan(1_000_000);
    const p = put("bomb.zip", bomb);
    const start = Date.now();
    const r = await documentInfo(ctx, p);
    expect(Date.now() - start).toBeLessThan(2000);
    const x = rows(r);
    expect(x["archive/Warning"]).toContain("unusually large");
    expect(flags(r)["archive/Warning"]).toBe("warn");
    expect(x["archive/Total size when unpacked"]).toContain("134,217,728 bytes");
  });

  test("a damaged zip is an error with a clear message, not a hang", async () => {
    await expect(documentInfo(ctx, put("cut.zip", zipBuffer([{ name: "a", data: Buffer.from("x") }]).subarray(0, 20)))).rejects.toThrow();
    await expect(documentInfo(ctx, put("liar.zip", (() => { const z = zipBuffer([{ name: "a", data: Buffer.from("x") }]); const at = z.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6])); z.writeUInt32LE(0x7fffffff, at + 16); return z; })()))).rejects.toThrow();
  });
});

describe("tar and gzip", () => {
  function tarEntry(name: string, size: number, type = "0"): Buffer {
    const h = Buffer.alloc(512);
    h.write(name, 0, "utf8");
    h.write("0000644\0", 100, "latin1");
    h.write(size.toString(8).padStart(11, "0") + "\0", 124, "latin1");
    h.write("00000000000\0", 136, "latin1");
    h.write("        ", 148, "latin1");
    h.write(type, 156, "latin1");
    h.write("ustar\0" + "00", 257, "latin1");
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "latin1");
    return Buffer.concat([h, Buffer.alloc(Math.ceil(size / 512) * 512)]);
  }
  const tar = (entries: Array<[string, number, string?]>) => Buffer.concat([...entries.map(([n, s, t]) => tarEntry(n, s, t)), Buffer.alloc(1024)]);
  const chunks = async function* (b: Buffer, step = 700) { for (let i = 0; i < b.length; i += step) yield b.subarray(i, i + step); };

  test("a tar file is walked header by header, whatever the chunk size", async () => {
    const t = tar([["docs/", 0, "5"], ["docs/a.txt", 100], ["docs/b.bin", 5000], ["c.txt", 0]]);
    expect(isTarHeader(t.subarray(0, 512))).toBe(true);
    for (const step of [1000, 513, 4096, 100000]) {
      const s = await walkTar(chunks(t, step), { maxEntries: 100, maxBytes: Infinity, maxMs: 5000 });
      expect([s.entries, s.files, s.folders, s.uncompressed, s.partial]).toEqual([4, 3, 1, 5100, false]);
    }
    const r = rows(await documentInfo(ctx, put("x.tar", t)));
    expect(r["archive/Items inside"]).toBe("4 (3 files, 1 folders)");
  });

  test(".tar.gz is listed through a streaming gunzip", async () => {
    const r = await documentInfo(ctx, put("x.tar.gz", gzipSync(tar([["one.txt", 10], ["two.txt", 20]]))));
    expect(r.kind).toBe("Compressed tar archive (.tar.gz)");
    const x = rows(r);
    expect(x["archive/Items inside"]).toBe("2 (2 files, 0 folders)");
    expect(x["gzip/Unpacked size"]).toContain("3,072 bytes");
  });

  test("the entry cap stops a very long list, and says it is partial", async () => {
    const many = tar(Array.from({ length: 25_000 }, (_, i) => [`f${i}`, 0] as [string, number]));
    const s = await walkTar(chunks(many, 64 * 1024), { maxEntries: 20_000, maxBytes: Infinity, maxMs: 5000 });
    expect([s.entries, s.partial]).toEqual([20_000, true]);
  });

  test("a gzip bomb made of one huge tar entry is cut off after the byte cap", async () => {
    const bomb = gzipSync(Buffer.concat([tarEntry("big.bin", 300 * 1024 * 1024).subarray(0, 512), Buffer.alloc(300 * 1024 * 1024)]), { level: 1 });
    const p = put("bomb.tar.gz", bomb);
    const start = Date.now();
    const r = await documentInfo(ctx, p);
    expect(Date.now() - start).toBeLessThan(8000);
    expect(r.kind).toBe("Compressed tar archive (.tar.gz)");
  });

  test("a plain gzip file reports its name and size; damaged ones don't crash", async () => {
    const gz = gzipSync(Buffer.from("hello hello hello"));
    const named = Buffer.from(gz);
    named[3] = 8;
    const withName = Buffer.concat([named.subarray(0, 10), Buffer.from("notes.txt\0"), named.subarray(10)]);
    const r = rows(await documentInfo(ctx, put("n.gz", withName)));
    expect(r["gzip/Original name"]).toBe("notes.txt");
    expect(r["gzip/Unpacked size"]).toContain("17 bytes");
    await documentInfo(ctx, put("d.gz", gz.subarray(0, 12))).catch(() => {});
    await documentInfo(ctx, put("e.tar.gz", gzipSync(tar([["a", 1]])).subarray(0, 60))).catch(() => {});
  });
});

describe("SQLite", () => {
  test("header facts and the table list from a hand-made database", async () => {
    const r = rows(await sqliteInfo(bufferSource(sqliteDb())));
    expect(r["database/Page size"]).toBe("4,096 bytes");
    expect(r["database/Text encoding"]).toBe("UTF-8");
    expect(r["database/Journal mode"]).toContain("Rollback");
    expect(r["database/User version"]).toBe("7");
    expect(r["database/Made with SQLite"]).toBe("3.45.0");
    expect(r["database/Tables"]).toBe("2");
    expect(r["database/Table names"]).toBe("users, orders");
  });

  test("a real database (several pages of schema, WAL mode) is listed like SQLite lists it", async () => {
    const path = join(dir, "real.db");
    const db = new Database(path);
    db.exec("PRAGMA page_size=1024; PRAGMA journal_mode=WAL; PRAGMA user_version=42;");
    for (let i = 0; i < 70; i++) db.exec(`CREATE TABLE t${String(i).padStart(2, "0")} (id INTEGER PRIMARY KEY, name TEXT, note TEXT); CREATE INDEX i${i} ON t${String(i).padStart(2, "0")}(name);`);
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    const names = new Database(path, { readonly: true }).query("select name from sqlite_master where type='table' order by name").all().map((x: any) => x.name as string);
    const r = rows(await documentInfo(ctx, path));
    expect(r["database/Page size"]).toBe("1,024 bytes");
    expect(r["database/User version"]).toBe("42");
    expect(r["database/Journal mode"]).toContain("WAL");
    expect(r["database/Tables"]).toBe(String(names.length));
    expect(r["database/Indexes"]).toBe("70");
    expect(r["database/Table names"]!.split(", ").every((n) => names.includes(n))).toBe(true);
  });

  test("a truncated or damaged header is an error, damaged pages are tolerated", async () => {
    await expect(sqliteInfo(bufferSource(Buffer.from("SQLite format 3\0")))).rejects.toThrow();
    const bad = sqliteDb();
    bad[100] = 0x99;
    expect(rows(await sqliteInfo(bufferSource(bad)))["database/Page size"]).toBeDefined();
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (let i = 0; i < 100; i++) {
      const b = Buffer.from(sqliteDb());
      for (let k = 0; k < 5; k++) b[100 + (rnd() % 400)] = rnd() & 255;
      await sqliteInfo(bufferSource(b)).catch(() => {});
    }
  });
});

describe("fonts", () => {
  const candidates = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Courier New.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf", "C:\\Windows\\Fonts\\arial.ttf"];
  const system = candidates.find((p) => existsSync(p));

  test.skipIf(!system)("a system font: family, style, version, glyphs", async () => {
    const r = rows(await documentInfo(ctx, system!));
    expect(r["font/Family"]).toBeTruthy();
    expect(r["font/Style"]).toBeTruthy();
    expect(Number(r["font/Glyphs"]!.replace(/,/g, ""))).toBeGreaterThan(50);
    if (tool("exiftool") && !system!.endsWith(".ttc")) {
      const [j] = JSON.parse(await run([tool("exiftool")!, "-json", "-n", system!]));
      if (j.FontFamily) expect(r["font/Family"]).toBe(j.FontFamily);
      if (j.NumGlyphs) expect(Number(r["font/Glyphs"]!.replace(/,/g, ""))).toBe(j.NumGlyphs);
    }
  });

  test("a hand-made name table", async () => {
    const enc = (s: string) => Buffer.from(s, "utf16le").swap16();
    const names: Array<[number, string]> = [[1, "Test Sans"], [2, "Bold"], [5, "Version 1.5"], [9, "A. Designer"], [13, "Free to use"]];
    const strings = Buffer.concat(names.map(([, s]) => enc(s)));
    let off = 0;
    const recs = names.map(([id, s]) => { const r = Buffer.alloc(12); r.writeUInt16BE(3, 0); r.writeUInt16BE(1, 2); r.writeUInt16BE(0x409, 4); r.writeUInt16BE(id, 6); r.writeUInt16BE(enc(s).length, 8); r.writeUInt16BE(off, 10); off += enc(s).length; return r; });
    const head = Buffer.alloc(6);
    head.writeUInt16BE(names.length, 2);
    head.writeUInt16BE(6 + 12 * names.length, 4);
    const nameTable = Buffer.concat([head, ...recs, strings]);
    const maxp = Buffer.alloc(6); maxp.writeUInt16BE(321, 4);
    const dirLen = 12 + 16 * 2;
    const font = Buffer.alloc(dirLen);
    font.writeUInt32BE(0x00010000, 0); font.writeUInt16BE(2, 4);
    font.write("maxp", 12, "latin1"); font.writeUInt32BE(dirLen, 20); font.writeUInt32BE(maxp.length, 24);
    font.write("name", 28, "latin1"); font.writeUInt32BE(dirLen + maxp.length, 36); font.writeUInt32BE(nameTable.length, 40);
    const f = rows(await fontInfo(bufferSource(Buffer.concat([font, maxp, nameTable]))));
    expect([f["font/Family"], f["font/Style"], f["font/Version"], f["font/Designer"], f["font/Licence"], f["font/Glyphs"]]).toEqual(["Test Sans", "Bold", "Version 1.5", "A. Designer", "Free to use", "321"]);
  });

  test("garbage in a font header doesn't throw", async () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (let i = 0; i < 100; i++) {
      const b = Buffer.alloc(300);
      for (let k = 0; k < 300; k++) b[k] = rnd() & 255;
      b.writeUInt32BE(0x00010000, 0);
      await fontInfo(bufferSource(b)).catch(() => {});
    }
  });
});

describe("text files", () => {
  const stats = (s: string | Buffer, size?: number) => analyzeText(typeof s === "string" ? Buffer.from(s) : s, size ?? Buffer.byteLength(s as any)).stats;

  test("counts: lines, words, characters, longest line, trailing newline", () => {
    const s = stats("one two\nthree four five\n\nlast");
    expect([s.lines, s.words, s.chars, s.longest, s.trailingNewline, s.blankLines]).toEqual([4, 6, 29, 15, false, 1]);
    expect(stats("a\n").trailingNewline).toBe(true);
    expect(stats("").lines).toBe(0);
    expect(stats("héllo wörld 😀\n").chars).toBe(14);
  });

  test("line endings: Windows, Unix, old Mac and mixed", () => {
    expect(stats("a\r\nb\r\n").lineEnding).toBe("Windows (CRLF)");
    expect(stats("a\nb\n").lineEnding).toBe("Unix / macOS (LF)");
    expect(stats("a\rb\r").lineEnding).toBe("Classic Mac (CR)");
    expect(stats("a\r\nb\nc\rd").lineEnding).toBe("Mixed: 1 CRLF, 1 LF, 1 CR");
    expect(stats("no breaks").lineEnding).toBe("No line breaks");
    expect(stats("a\r\nb\r\n").lines).toBe(2);
  });

  test("encodings: BOMs, ASCII, UTF-8, Latin-1", () => {
    expect(guessEncoding(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("héllo")]))).toMatchObject({ name: "UTF-8", bom: "Has a byte-order mark (BOM)", text: "héllo" });
    expect(guessEncoding(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("hi", "utf16le")]))).toMatchObject({ name: "UTF-16 (little-endian)", text: "hi" });
    expect(guessEncoding(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from("hi", "utf16le").swap16()]))).toMatchObject({ name: "UTF-16 (big-endian)", text: "hi" });
    expect(guessEncoding(Buffer.from("plain")).name).toContain("ASCII");
    expect(guessEncoding(Buffer.from("héllo wörld, ünïcode ✓")).name).toBe("UTF-8");
    expect(guessEncoding(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x74, 0x65, 0x78, 0x74, 0x20, 0x6c, 0x61, 0x74, 0x69, 0x6e])).name).toContain("Not UTF-8");
    // half a character cut off at the end of the sample is not an error
    expect(guessEncoding(Buffer.from("ünï✓").subarray(0, -1)).name).toBe("UTF-8");
  });

  test("indentation and the #! line", () => {
    expect(stats("a\n\tb\n\t\tc\n").indent).toBe("Tabs");
    expect(stats("a\n    b\n        c\n    d\n").indent).toBe("Spaces (4 per level)");
    expect(stats("a\n  b\n    c\n  d\n").indent).toBe("Spaces (2 per level)");
    expect(stats("a\n\tb\n    c\n").indent).toContain("Mixed");
    expect(stats("no indent\nat all\n").indent).toBe("");
    expect(stats("#!/usr/bin/env bun\nconsole.log(1)\n").shebang).toBe("#!/usr/bin/env bun");
    expect(stats("echo hi\n").shebang).toBe("");
  });

  test("a big file is only sampled, and the counts say so with ≥", () => {
    const s = stats("word\n".repeat(1000), 50_000_000);
    expect(s.truncated).toBe(true);
    const g = textGroups(s, null)[0]!;
    expect(g.rows.find((r) => r.label === "Lines")!.value).toBe("≥ 1,000");
    expect(g.rows.find((r) => r.label === "Ends with a new line")!.value).toContain("Not checked");
    expect(g.note).toContain("first 4 MB");
  });

  test("JSON: valid, invalid, top-level type, keys", () => {
    const good = Object.fromEntries(jsonRows('{"a":1,"b":[1,2],"c":{}}', true)!.rows.map((r) => [r.label, r.value]));
    expect(good).toMatchObject({ "Valid JSON": "Yes", "Top level is": "Object (a set of named values)", Keys: "3", "First keys": "a, b, c" });
    expect(Object.fromEntries(jsonRows("[1,2,3]", true)!.rows.map((r) => [r.label, r.value]))).toMatchObject({ "Top level is": "List (array)", Items: "3" });
    expect(jsonRows('{"a":', true)!.rows[0]!.value).toStartWith("No:");
    expect(jsonRows("hello", true)).toBeNull();
    expect(jsonRows("{}", false)!.rows[0]!.value).toContain("Not checked");
  });

  test("through documentInfo: a script, a JSON file, a Latin-1 file and an empty file", async () => {
    const s = rows(await documentInfo(ctx, put("run.sh", "#!/bin/sh\necho hi\n")));
    expect(s["document/Starts with a #! line"]).toBe("#!/bin/sh");
    const j = rows(await documentInfo(ctx, put("data.json", '{"x": [1, 2, 3]}')));
    expect(j["json/Valid JSON"]).toBe("Yes");
    const l = rows(await documentInfo(ctx, put("latin.txt", Buffer.from("caf\xe9 au lait, tr\xe8s bon\n", "latin1"))));
    expect(l["document/Encoding"]).toContain("Not UTF-8");
    expect((await documentInfo(ctx, put("empty.txt", ""))).supported).toBe(false);
    await expect(documentInfo(ctx, put("blob.dat", Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 37 + 1) & 255))))).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });

  test("a 5 MB text file is read in time and marked with ≥", async () => {
    const big = put("big.txt", "lorem ipsum dolor\n".repeat(300_000));
    const start = Date.now();
    const r = rows(await documentInfo(ctx, big));
    expect(Date.now() - start).toBeLessThan(3000);
    expect(r["document/Lines"]).toStartWith("≥ ");
  });
});

describe("programs", () => {
  test("ELF: class, byte order, type, machine, interpreter", async () => {
    const r = rows(await elfInfo(bufferSource(elf64())));
    expect([r["executable/Kind"], r["executable/Built for"], r["executable/Word size"], r["executable/Byte order"], r["executable/Needs this loader"]]).toEqual(["Shared library or position-independent program", "x86-64 (64-bit Intel/AMD)", "64-bit", "Little-endian", "/lib64/ld-linux-x86-64.so.2"]);
    expect(r["executable/Entry point"]).toBe("0x1040");
  });

  test("PE: machine, subsystem, timestamp, sections, DLL or EXE", async () => {
    const r = rows(await peInfo(bufferSource(pe64())));
    expect([r["executable/Kind"], r["executable/Built for"], r["executable/Word size"], r["executable/Subsystem"], r["executable/Sections"], r["executable/Built on"]]).toEqual(["Program (EXE)", "x64 (64-bit Intel/AMD)", "64-bit (PE32+)", "Windows console program", "5", "2023-11-14T22:13:20Z"]);
    expect(rows(await peInfo(bufferSource(pe64(true))))["executable/Kind"]).toBe("Library (DLL)");
  });

  test("Mach-O: a universal file lists every processor", async () => {
    const r = rows(await machoInfo(bufferSource(machoUniversal())));
    expect(r["executable/Universal binary"]).toContain("Yes");
    expect(r["executable/Built for"]).toBe("ARM64, x86-64");
    expect(r["executable/Kind"]).toBe("Program");
  });

  test("dispatch by content, not by name, and damage doesn't throw", async () => {
    expect((await documentInfo(ctx, put("not-really.txt", elf64()))).kind).toBe("Linux program or library");
    expect((await documentInfo(ctx, put("tool.exe", pe64()))).kind).toBe("Windows program");
    let seed = 21;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    for (const base of [elf64(), pe64(), machoUniversal()]) {
      for (let i = 0; i < 100; i++) {
        const b = Buffer.from(base);
        for (let k = 0; k < 4; k++) b[rnd() % b.length] = rnd() & 255;
        await Promise.all([elfInfo(bufferSource(b)), peInfo(bufferSource(b)), machoInfo(bufferSource(b))].map((p) => p.catch(() => {})));
      }
    }
  });

  test.skipIf(process.platform !== "darwin" || !existsSync("/usr/bin/lipo"))("a real Mac program agrees with lipo", async () => {
    const archs = (await run(["/usr/bin/lipo", "-archs", "/bin/ls"])).trim().split(/\s+/);
    const r = rows(await documentInfo(ctx, "/bin/ls"));
    expect(r["executable/Built for"]).toBeDefined();
    for (const a of archs) expect(r["executable/Built for"], a).toContain(a === "x86_64" ? "x86-64" : "ARM64");
  });
});

