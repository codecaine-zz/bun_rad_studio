/** Databases, fonts and programs: read-only header parsing. Nothing is opened as a database, loaded as a font or run. */
import { inflateSync } from "zlib";
import { ascii, be16, be32, clip, le16, le32, Rows, type InfoGroup, type Source } from "./fmInfoCommon";

// ---------------------------------------------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------------------------------------------

function varint(b: Uint8Array, p: number): { value: number; length: number } {
  let v = 0;
  for (let i = 0; i < 9; i++) {
    const byte = b[p + i];
    if (byte === undefined) return { value: v, length: i };
    if (i === 8) return { value: v * 256 + byte, length: 9 };
    v = v * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return { value: v, length: i + 1 };
  }
  return { value: v, length: 9 };
}

const SERIAL_BYTES = [0, 1, 2, 3, 4, 6, 8, 8, 0, 0];

/** The first text columns of a sqlite_master row, from the part of the record that is stored on the page itself. */
function masterRow(page: Uint8Array, cell: number, encoding: number): { type: string; name: string; table: string } | null {
  let p = cell;
  const payload = varint(page, p);
  p += payload.length;
  p += varint(page, p).length;
  const hdrLen = varint(page, p);
  const types: number[] = [];
  let q = p + hdrLen.length;
  const end = p + hdrLen.value;
  while (q < end && types.length < 5) {
    const t = varint(page, q);
    types.push(t.value);
    q += t.length;
  }
  let data = end;
  const out: string[] = [];
  for (let i = 0; i < 3 && i < types.length; i++) {
    const t = types[i]!;
    const n = t >= 13 && t % 2 === 1 ? (t - 13) / 2 : t >= 12 ? (t - 12) / 2 : (SERIAL_BYTES[t] ?? 0);
    if (data + n > page.length) return null;
    const bytes = Buffer.from(page.subarray(data, data + n));
    out.push(encoding === 2 ? bytes.toString("utf16le") : encoding === 3 ? Buffer.from(bytes).swap16().toString("utf16le") : bytes.toString("utf8"));
    data += n;
  }
  return out.length === 3 ? { type: out[0]!, name: out[1]!, table: out[2]! } : null;
}

export async function sqliteInfo(src: Source): Promise<{ groups: InfoGroup[]; kind: string }> {
  const h = await src.read(0, 100);
  if (h.length < 100 || ascii(h, 0, 16) !== "SQLite format 3\0") throw new Error("not sqlite");
  let pageSize = be16(h, 16);
  if (pageSize === 1) pageSize = 65536;
  const enc = be32(h, 56);
  const r = new Rows();
  const pages = be32(h, 28);
  const version = be32(h, 96);
  r.add("Page size", `${pageSize.toLocaleString("en-US")} bytes`, "The database stores its data in equal blocks called pages.");
  r.add("Pages", pages ? pages.toLocaleString("en-US") : "", "How many pages the database file has.");
  r.add("Text encoding", enc === 1 ? "UTF-8" : enc === 2 ? "UTF-16 (little-endian)" : enc === 3 ? "UTF-16 (big-endian)" : "", "How text is stored inside.");
  r.add("Journal mode", h[18] === 2 ? "WAL (write-ahead log)" : "Rollback journal", "WAL databases keep recent changes in a separate -wal file, which is not read here.");
  r.add("Application id", be32(h, 68) ? `0x${be32(h, 68).toString(16)}` : "", "A number some programs put in their databases to mark them as theirs.");
  r.add("User version", be32(h, 60) || "", "A number the program that owns the database uses to track its own layout.");
  r.add("Changes counter", be32(h, 24) || "", "How many times the file has been changed.");
  r.add("Free pages", be32(h, 36) || "", "Unused space inside the file that a 'vacuum' would give back.");
  r.add("Made with SQLite", version ? `${Math.floor(version / 1e6)}.${Math.floor((version % 1e6) / 1e3)}.${version % 1e3}` : "");
  const groups: InfoGroup[] = [];
  const objects = new Map<string, number>();
  const tables: string[] = [];
  let walked = 0, ok = true;
  const walk = async (pageNo: number, depth: number): Promise<void> => {
    if (depth > 4 || walked > 40 || pageNo < 1 || (pages && pageNo > pages)) { ok = false; return; }
    walked++;
    const page = await src.read((pageNo - 1) * pageSize, pageSize);
    if (page.length < pageSize) { ok = false; return; }
    const off = pageNo === 1 ? 100 : 0;
    const type = page[off];
    const cells = be16(page, off + 3);
    if (type === 0x0d) {
      for (let i = 0; i < cells && objects.size < 50; i++) {
        const ptr = be16(page, off + 8 + i * 2);
        if (ptr < off + 8 || ptr >= page.length) continue;
        const row = masterRow(page, ptr, enc);
        if (!row) continue;
        objects.set(row.type, (objects.get(row.type) ?? 0) + 1);
        if (row.type === "table" && tables.length < 60 && !row.name.startsWith("sqlite_")) tables.push(clip(row.name, 100));
      }
    } else if (type === 0x05) {
      const kids: number[] = [];
      for (let i = 0; i < cells; i++) {
        const ptr = be16(page, off + 12 + i * 2);
        if (ptr + 4 <= page.length) kids.push(be32(page, ptr));
      }
      kids.push(be32(page, off + 8));
      for (const k of kids) await walk(k, depth + 1);
    } else ok = false;
  };
  try {
    await walk(1, 0);
  } catch {
    ok = false;
  }
  if (objects.size) {
    r.add("Tables", objects.get("table") ?? 0, "A table is one list of records, like a spreadsheet sheet.");
    r.add("Indexes", objects.get("index") ?? 0).add("Views", objects.get("view") ?? 0).add("Triggers", objects.get("trigger") ?? 0);
    r.add("Table names", tables.join(", "));
  }
  const g = r.group("database", "SQLite database", undefined, ok ? undefined : "The list of tables is only partly read (very large schema, or an unusual layout).");
  if (g) groups.push(g);
  return { groups, kind: "SQLite database" };
}

// ---------------------------------------------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------------------------------------------

const NAME_IDS: Array<[number, string, string?]> = [
  [1, "Family"], [2, "Style"], [4, "Full name"], [5, "Version"], [6, "PostScript name"], [0, "Copyright"], [7, "Trademark"], [8, "Made by"], [9, "Designer"],
  [11, "Maker's website"], [13, "License", "What you are allowed to do with the font."], [14, "License website"],
];

function decodeName(platform: number, bytes: Uint8Array): string {
  const b = Buffer.from(bytes);
  return clip(platform === 1 ? b.toString("latin1") : Buffer.from(b).swap16().toString("utf16le"), 500).trim();
}

export async function fontInfo(src: Source): Promise<{ groups: InfoGroup[]; kind: string }> {
  const head = await src.read(0, 12);
  let tag = ascii(head, 0, 4);
  let base = 0;
  let collection = 0;
  if (tag === "ttcf") {
    collection = be32(head, 8);
    base = be32(await src.read(12, 4), 0);
    tag = ascii(await src.read(base, 4), 0, 4);
  }
  const woff = tag === "wOFF";
  const flavor = woff ? ascii(await src.read(base + 4, 4), 0, 4) : tag;
  const numTables = be16(await src.read(base + 4 + (woff ? 8 : 0), 2), 0);
  const dir = await src.read(base + (woff ? 44 : 12), Math.min(numTables, 80) * (woff ? 20 : 16));
  const tables = new Map<string, { offset: number; length: number; comp: number }>();
  for (let i = 0; i < Math.min(numTables, 80); i++) {
    const o = i * (woff ? 20 : 16);
    if (o + (woff ? 20 : 16) > dir.length) break;
    tables.set(ascii(dir, o, 4), woff ? { offset: be32(dir, o + 4), comp: be32(dir, o + 8), length: be32(dir, o + 12) } : { offset: be32(dir, o + 8), length: be32(dir, o + 12), comp: be32(dir, o + 12) });
  }
  const table = async (name: string, max = 512 * 1024): Promise<Buffer | null> => {
    const t = tables.get(name);
    if (!t || t.comp > max || t.length > max * 4) return null;
    const raw = await src.read(t.offset, t.comp);
    if (!woff || t.comp === t.length) return raw;
    try {
      return inflateSync(raw, { maxOutputLength: max * 4 });
    } catch {
      return null;
    }
  };
  const r = new Rows();
  const nameTable = await table("name");
  const names = new Map<number, string>();
  if (nameTable && nameTable.length >= 6) {
    const count = Math.min(be16(nameTable, 2), 400), strings = be16(nameTable, 4);
    let best = new Map<number, { score: number; text: string }>();
    for (let i = 0; i < count && 6 + i * 12 + 12 <= nameTable.length; i++) {
      const o = 6 + i * 12;
      const platform = be16(nameTable, o), lang = be16(nameTable, o + 4), id = be16(nameTable, o + 6), len = be16(nameTable, o + 8), off = be16(nameTable, o + 10);
      if (platform === 2 || strings + off + len > nameTable.length) continue;
      const text = decodeName(platform, nameTable.subarray(strings + off, strings + off + len));
      const score = (platform === 3 && lang === 0x409 ? 3 : platform === 1 && lang === 0 ? 2 : 1);
      if (text && (best.get(id)?.score ?? 0) < score) best.set(id, { score, text });
    }
    for (const [id, v] of best) names.set(id, v.text);
    best = new Map();
  }
  for (const [id, label, hint] of NAME_IDS) r.add(label, names.get(id), hint);
  const maxp = await table("maxp", 64);
  const head2 = await table("head", 64);
  const os2 = await table("OS/2", 128);
  r.add("Glyphs", maxp && maxp.length >= 6 ? be16(maxp, 4).toLocaleString("en-US") : "", "A glyph is the drawing of one character or symbol in the font.");
  r.add("Units per em", head2 && head2.length >= 20 ? be16(head2, 18) : "", "The grid size the letters are drawn on. Bigger means finer detail.");
  r.add("Weight", os2 && os2.length >= 6 ? `${be16(os2, 4)} (400 is regular, 700 is bold)` : "");
  if (head2 && head2.length >= 36) {
    const secs = (be32(head2, 20) * 2 ** 32 + be32(head2, 24)) - 2082844800;
    const mod = (be32(head2, 28) * 2 ** 32 + be32(head2, 32)) - 2082844800;
    if (secs > 0 && secs < 4e9) r.add("Created", new Date(secs * 1000).toISOString().slice(0, 10));
    if (mod > 0 && mod < 4e9) r.add("Last changed", new Date(mod * 1000).toISOString().slice(0, 10));
  }
  r.add("Outlines", tables.has("CFF ") || tables.has("CFF2") ? "PostScript (CFF)" : tables.has("glyf") ? "TrueType" : flavor === "OTTO" ? "PostScript (CFF)" : "", "How the letter shapes are drawn.");
  r.add("Variable font", tables.has("fvar") ? "Yes: it has adjustable weight or width" : "No", "A variable font holds many styles in one file.");
  r.add("Color glyphs", tables.has("COLR") || tables.has("SVG ") || tables.has("sbix") || tables.has("CBDT") ? "Yes (emoji-style color)" : "");
  r.add("Fonts in collection", collection || "", "A font collection (.ttc) holds several fonts in one file; the first is shown.");
  r.add("Format", woff ? "WOFF (web font)" : flavor === "OTTO" ? "OpenType (CFF)" : "TrueType / OpenType");
  const g = r.group("font", "Font");
  return { groups: g ? [g] : [], kind: woff ? "Web font (WOFF)" : "Font" };
}

// ---------------------------------------------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------------------------------------------

const PE_MACHINE: Record<number, string> = { 0x14c: "x86 (32-bit Intel)", 0x8664: "x64 (64-bit Intel/AMD)", 0x1c0: "ARM", 0x1c4: "ARM Thumb-2", 0xaa64: "ARM64", 0x200: "Itanium", 0x5064: "RISC-V" };
const PE_SUBSYSTEM: Record<number, string> = { 1: "Native (drivers)", 2: "Windows window program", 3: "Windows console program", 5: "OS/2 console", 7: "POSIX console", 9: "Windows CE", 10: "EFI application", 14: "Xbox" };
const ELF_MACHINE: Record<number, string> = { 3: "x86 (32-bit Intel)", 8: "MIPS", 20: "PowerPC", 21: "PowerPC 64", 40: "ARM", 62: "x86-64 (64-bit Intel/AMD)", 183: "ARM64 (AArch64)", 243: "RISC-V", 22: "IBM S/390" };
const ELF_TYPE: Record<number, string> = { 1: "Object file (not yet linked)", 2: "Program", 3: "Shared library or position-independent program", 4: "Core dump" };
const MACHO_CPU: Record<number, string> = { 7: "x86 (32-bit)", 0x01000007: "x86-64", 12: "ARM", 0x0100000c: "ARM64", 18: "PowerPC", 0x01000012: "PowerPC 64", 0x0200000c: "ARM64 (32-bit pointers)" };
const MACHO_TYPE: Record<number, string> = { 1: "Object file", 2: "Program", 3: "Fixed library", 4: "Core dump", 6: "Dynamic library", 7: "Dynamic linker", 8: "Bundle (plug-in)", 9: "Library stub", 10: "Debug symbols", 11: "Kernel extension" };

const dateFrom = (secs: number) => (secs > 315532800 && secs < 4e9 ? new Date(secs * 1000).toISOString().replace(/\.000Z$/, "Z") : "");

export async function peInfo(src: Source): Promise<{ groups: InfoGroup[]; kind: string }> {
  const dos = await src.read(0, 64);
  const pe = le32(dos, 0x3c);
  const h = await src.read(pe, 24 + 240);
  if (ascii(h, 0, 4) !== "PE\0\0") throw new Error("not pe");
  const machine = le16(h, 4), sections = le16(h, 6), stamp = le32(h, 8), optSize = le16(h, 20), chars = le16(h, 22);
  const magic = le16(h, 24);
  const r = new Rows();
  r.add("Kind", chars & 0x2000 ? "Library (DLL)" : "Program (EXE)", "A DLL is a bundle of code other programs use; an EXE is started directly.");
  r.add("Built for", PE_MACHINE[machine] ?? `Machine 0x${machine.toString(16)}`, "The kind of processor the program runs on.");
  r.add("Word size", magic === 0x20b ? "64-bit (PE32+)" : magic === 0x10b ? "32-bit (PE32)" : "");
  r.add("Subsystem", optSize >= 70 ? PE_SUBSYSTEM[le16(h, 24 + 68)] ?? `Code ${le16(h, 24 + 68)}` : "", "Whether it opens windows or runs in a text console.");
  r.add("Built on", dateFrom(stamp), "The build date stored by the compiler. Some tools set it to a fixed or false value.");
  r.add("Sections", sections, "The blocks (code, data, resources) the program file is made of.");
  r.add("Entry point", optSize >= 20 ? `0x${le32(h, 24 + 16).toString(16)}` : "");
  const clrAt = 24 + (magic === 0x20b ? 228 : 212);
  r.add("Contains .NET code", (magic === 0x10b || magic === 0x20b) && h.length >= clrAt + 4 && optSize >= clrAt - 24 + 4 ? (le32(h, clrAt) ? "Yes" : "No") : "");
  const g = r.group("executable", "Windows program");
  return { groups: g ? [g] : [], kind: chars & 0x2000 ? "Windows library (DLL)" : "Windows program" };
}

export async function elfInfo(src: Source): Promise<{ groups: InfoGroup[]; kind: string }> {
  const h = await src.read(0, 64);
  const is64 = h[4] === 2, le = h[5] === 1;
  const u16 = (o: number) => (le ? le16(h, o) : be16(h, o));
  const u32 = (o: number) => (le ? le32(h, o) : be32(h, o));
  const r = new Rows();
  const type = u16(16), machine = u16(18);
  r.add("Kind", ELF_TYPE[type] ?? `Type ${type}`, "What sort of file this is: a program, a library and so on.");
  r.add("Built for", ELF_MACHINE[machine] ?? `Machine ${machine}`, "The kind of processor it runs on.");
  r.add("Word size", is64 ? "64-bit" : "32-bit").add("Byte order", le ? "Little-endian" : "Big-endian");
  r.add("Entry point", `0x${(is64 ? Number((le ? Buffer.from(h).readBigUInt64LE(24) : Buffer.from(h).readBigUInt64BE(24)) & 0xffffffffffffn) : u32(24)).toString(16)}`);
  const phoff = is64 ? Number(le ? Buffer.from(h).readBigUInt64LE(32) : Buffer.from(h).readBigUInt64BE(32)) : u32(28);
  const phentsize = u16(is64 ? 54 : 42), phnum = u16(is64 ? 56 : 44);
  r.add("Program headers", phnum);
  if (phoff > 0 && phentsize >= 32 && phnum > 0 && phnum < 200) {
    const ph = await src.read(phoff, phentsize * phnum);
    for (let i = 0; i < phnum && (i + 1) * phentsize <= ph.length; i++) {
      const o = i * phentsize;
      if ((le ? le32(ph, o) : be32(ph, o)) !== 3) continue;
      const off = is64 ? Number(le ? ph.readBigUInt64LE(o + 8) : ph.readBigUInt64BE(o + 8)) : le ? le32(ph, o + 4) : be32(ph, o + 4);
      const sz = is64 ? Number(le ? ph.readBigUInt64LE(o + 32) : ph.readBigUInt64BE(o + 32)) : le ? le32(ph, o + 16) : be32(ph, o + 16);
      const s = (await src.read(off, Math.min(sz, 256))).toString("latin1").replace(/\0.*$/, "");
      r.add("Needs this loader", clip(s, 200), "The helper program the system starts first to run this program (the 'interpreter').");
    }
  }
  const g = r.group("executable", "Linux program");
  return { groups: g ? [g] : [], kind: type === 2 || type === 3 ? "Linux program or library" : "ELF file" };
}

export async function machoInfo(src: Source): Promise<{ groups: InfoGroup[]; kind: string }> {
  const h = await src.read(0, 4096);
  const first = be32(h, 0);
  const r = new Rows();
  const archs: string[] = [];
  let at = 0;
  if (first === 0xcafebabe || first === 0xcafebabf) {
    const n = Math.min(be32(h, 4), 20);
    const size = first === 0xcafebabf ? 32 : 20;
    for (let i = 0; i < n; i++) {
      const cpu = be32(h, 8 + i * size);
      archs.push(MACHO_CPU[cpu] ?? `CPU 0x${cpu.toString(16)}`);
      if (i === 0) at = first === 0xcafebabf ? Number(Buffer.from(h).readBigUInt64BE(8 + 8)) : be32(h, 8 + 8);
    }
    r.add("Universal binary", "Yes: one file holds a version for each kind of processor", "A 'universal' program has separate code for Intel and Apple Silicon Macs.");
  }
  const m = at ? await src.read(at, 4096) : h;
  const magic = le32(m, 0);
  const le = magic === 0xfeedface || magic === 0xfeedfacf;
  if (!le && be32(m, 0) !== 0xfeedface && be32(m, 0) !== 0xfeedfacf) throw new Error("not macho");
  const u32 = (o: number) => (le ? le32(m, o) : be32(m, o));
  const is64 = (le ? magic : be32(m, 0)) === 0xfeedfacf;
  if (!archs.length) archs.push(MACHO_CPU[u32(4)] ?? `CPU 0x${u32(4).toString(16)}`);
  r.add("Built for", archs.join(", "), "The kind of processor it runs on.");
  r.add("Kind", MACHO_TYPE[u32(12)] ?? `Type ${u32(12)}`).add("Word size", is64 ? "64-bit" : "32-bit");
  let p = is64 ? 32 : 28;
  const ncmds = Math.min(u32(16), 300);
  let signed = false, minos = "", libs = 0;
  const ver = (v: number) => `${v >> 16}.${(v >> 8) & 255}.${v & 255}`;
  for (let i = 0; i < ncmds && p + 8 <= m.length; i++) {
    const cmd = u32(p), size = u32(p + 4);
    if (size < 8) break;
    if (cmd === 0x1d) signed = true;
    else if (cmd === 0x32 && p + 16 <= m.length) minos = `${["", "macOS", "iOS", "tvOS", "watchOS"][u32(p + 8)] ?? "platform " + u32(p + 8)} ${ver(u32(p + 12))} or newer`;
    else if ((cmd === 0x24 || cmd === 0x25) && !minos) minos = `macOS ${ver(u32(p + 8))} or newer`;
    else if (cmd === 0xc || cmd === 0x8000001c || cmd === 0x18) libs++;
    p += size;
  }
  r.add("Needs", minos, "The oldest system version it is built for.").add("Code signature", signed ? "Has a signature block (not checked here)" : "No signature block", "A signature shows who made the program and that it wasn't changed.", signed ? undefined : "warn");
  r.add("Libraries it uses", libs || "");
  const g = r.group("executable", "Mac program");
  return { groups: g ? [g] : [], kind: "Mac program" };
}
