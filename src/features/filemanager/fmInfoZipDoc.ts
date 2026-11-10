/**
 * Archives and zip-based documents: zip, Office (docx, xlsx, pptx), OpenDocument, EPUB, tar and gzip.
 * Entries are only listed or (for a few small XML parts) inflated under a size cap; nothing is ever extracted or run.
 */
import { createReadStream, type promises as fsp } from "fs";
import { createGunzip } from "zlib";
import {
  humanBytes,
  readBytes,
  Rows,
  sizeText,
  type InfoGroup,
} from "./fmInfoCommon";
import { decodeEntities, xmlAttr, xmlText } from "./fmInfoMeta";
import { FmError } from "./fmPaths";
import { readCentralDirectory, readZipEntry, type CentralEntry } from "./fmZip";

const PART_LIMIT = 1024 * 1024;

/** Aggregated entry counts, total sizes, and largest members of an archive. */
export interface ArchiveSummary {
  entries: number;
  files: number;
  folders: number;
  uncompressed: number;
  compressed: number;
  encrypted: number;
  top: Array<{ name: string; size: number }>;
  items?: Array<{
    name: string;
    size: number;
    packed?: number;
    dir: boolean;
    encrypted?: boolean;
  }>;
  partial: boolean;
}

/** Computes entry counts, unpacked/packed totals, and the top 10 largest files from an archive entry list. */
export function summarizeEntries(
  list: Array<{
    name: string;
    size: number;
    packed?: number;
    dir?: boolean;
    encrypted?: boolean;
  }>,
  partial = false,
): ArchiveSummary {
  const s: ArchiveSummary = {
    entries: list.length,
    files: 0,
    folders: 0,
    uncompressed: 0,
    compressed: 0,
    encrypted: 0,
    top: [],
    partial,
  };
  for (const e of list) {
    if (e.dir) {
      s.folders++;
      continue;
    }
    s.files++;
    s.uncompressed += e.size;
    s.compressed += e.packed ?? 0;
    if (e.encrypted) s.encrypted++;
  }
  s.items = list.slice(0, 400).map((e) => ({
    name: e.name.slice(0, 300),
    size: e.size,
    ...(e.packed !== undefined ? { packed: e.packed } : {}),
    dir: Boolean(e.dir),
    ...(e.encrypted ? { encrypted: true } : {}),
  }));
  s.top = [...list]
    .filter((e) => !e.dir)
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .map((e) => ({
      name: e.name.replace(/\/+$/, "").slice(0, 300),
      size: e.size,
    }));
  return s;
}

/** Builds display `InfoGroup` sections for an archive summary, including compression ratios and zip-bomb warnings. */
export function archiveGroups(
  kind: string,
  s: ArchiveSummary,
  fileSize: number,
): InfoGroup[] {
  const r = new Rows();
  r.add("Kind", kind);
  r.add(
    "Items inside",
    `${s.partial ? "at least " : ""}${s.entries.toLocaleString("en-US")} (${s.files.toLocaleString("en-US")} files, ${s.folders.toLocaleString("en-US")} folders)`,
  );
  r.add(
    "Total size when unpacked",
    `${s.partial ? "at least " : ""}${sizeText(s.uncompressed)}`,
    "How big everything would be after unpacking. Nothing was unpacked.",
  );
  const ratio = s.compressed > 0 ? s.uncompressed / s.compressed : 0;
  r.add(
    "Compression",
    s.compressed > 0
      ? `Packed to ${Math.round((s.compressed / Math.max(1, s.uncompressed)) * 100)}% of the unpacked size (ratio ${ratio.toFixed(1)}:1)`
      : "",
    "How much smaller the archive is than its contents.",
  );
  r.add(
    "Password-protected items",
    s.encrypted
      ? `${s.encrypted}. Their contents can't be listed or read.`
      : "None",
    "Encrypted entries need a password to open.",
    s.encrypted ? "warn" : undefined,
  );
  const bomb =
    (ratio > 200 && s.uncompressed > 100 * 1024 * 1024) ||
    s.uncompressed > 20 * 1024 ** 3;
  r.add(
    "Warning",
    bomb
      ? `Unpacking this would produce ${humanBytes(s.uncompressed)} from a ${humanBytes(fileSize)} file. That is unusually large and could fill the disk.`
      : "",
    "A 'zip bomb' is a tiny file that unpacks to an enormous size. Be careful before extracting it.",
    "warn",
  );
  const groups: InfoGroup[] = [];
  const g = r.group(
    "archive",
    "Archive",
    undefined,
    s.partial
      ? "Only the first part of the list was counted (safety limit)."
      : undefined,
  );
  if (g) groups.push(g);
  const t = new Rows();
  for (const e of s.top) t.add(e.name, humanBytes(e.size));
  const gt = t.group("largest", "Largest items inside");
  if (gt) groups.push(gt);
  return groups;
}

/** Inspects a ZIP archive or ZIP-based document (Office, EPUB, OpenDocument, JAR/APK) and extracts metadata groups. */
export async function zipDocument(
  handle: fsp.FileHandle,
  size: number,
  ext: string,
): Promise<{ groups: InfoGroup[]; kind: string }> {
  let entries: CentralEntry[];
  try {
    entries = await readCentralDirectory(handle, size);
  } catch (err) {
    if (err instanceof FmError && err.code === "ZIP64")
      return {
        kind: "Zip archive (ZIP64)",
        groups: [
          {
            id: "archive",
            title: "Archive",
            rows: [],
            note: "This is a very large (ZIP64) archive. Its list isn't read here.",
          },
        ],
      };
    throw err;
  }
  const byName = new Map(entries.map((e) => [e.name, e]));
  const summary = summarizeEntries(
    entries.map((e) => ({
      name: e.name,
      size: e.usize,
      packed: e.csize,
      dir: e.isDir,
      encrypted: (e.flags & 1) !== 0,
    })),
  );
  const part = async (name: string): Promise<string> => {
    const e = byName.get(name);
    if (!e || e.isDir || e.flags & 1) return "";
    try {
      return (await readZipEntry(handle, size, e, PART_LIMIT)).toString("utf8");
    } catch {
      return "";
    }
  };
  const groups: InfoGroup[] = [];
  let kind = "Zip archive";
  const names = entries.map((e) => e.name);
  const isOffice =
    names.includes("[Content_Types].xml") &&
    names.some(
      (n) =>
        n.startsWith("docProps/") ||
        n.startsWith("word/") ||
        n.startsWith("xl/") ||
        n.startsWith("ppt/"),
    );
  const mimetype = byName.has("mimetype")
    ? (await part("mimetype")).trim()
    : "";
  const container = names.includes("META-INF/container.xml");
  if (isOffice) {
    const core = await part("docProps/core.xml");
    const app = await part("docProps/app.xml");
    const flavour = names.some((n) => n.startsWith("word/"))
      ? "Word document (docx)"
      : names.some((n) => n.startsWith("xl/"))
        ? "Excel workbook (xlsx)"
        : names.some((n) => n.startsWith("ppt/"))
          ? "PowerPoint presentation (pptx)"
          : "Office document";
    kind = flavour;
    const r = new Rows();
    r.add("Title", xmlText(core, "dc:title"))
      .add("Subject", xmlText(core, "dc:subject"))
      .add(
        "Author",
        xmlText(core, "dc:creator"),
        "The name stored as the person who made the document.",
      );
    r.add(
      "Last saved by",
      xmlText(core, "cp:lastModifiedBy"),
      "The name of the person who last saved it. It can reveal who else worked on the file.",
    );
    r.add("Created", xmlText(core, "dcterms:created"))
      .add("Last saved", xmlText(core, "dcterms:modified"))
      .add(
        "Revision",
        xmlText(core, "cp:revision"),
        "How many times it was saved.",
      );
    r.add("Keywords", xmlText(core, "cp:keywords"))
      .add("Description", xmlText(core, "dc:description"))
      .add("Category", xmlText(core, "cp:category"));
    r.add(
      "Made with",
      [xmlText(app, "Application"), xmlText(app, "AppVersion")]
        .filter(Boolean)
        .join(" "),
    );
    r.add(
      "Company",
      xmlText(app, "Company"),
      "The organization name stored by the program.",
    );
    r.add("Pages", xmlText(app, "Pages"))
      .add("Words", xmlText(app, "Words"))
      .add("Characters", xmlText(app, "Characters"))
      .add("Paragraphs", xmlText(app, "Paragraphs"));
    const total = xmlText(app, "TotalTime");
    r.add(
      "Editing time",
      total ? `${total} minutes` : "",
      "How long the document was open for editing, as the program counted.",
    );
    if (names.some((n) => n.startsWith("xl/"))) {
      const sheets = [
        ...(await part("xl/workbook.xml")).matchAll(
          /<sheet\b[^>]{0,300}?\bname="([^"]{1,100})"/g,
        ),
      ].map((m) => decodeEntities(m[1]!));
      r.add(
        "Sheets",
        sheets.length
          ? `${sheets.length}: ${sheets.slice(0, 20).join(", ")}`
          : "",
      );
    }
    if (names.some((n) => n.startsWith("ppt/"))) {
      r.add(
        "Slides",
        xmlText(app, "Slides") ||
          String(
            names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length,
          ),
      );
      r.add("Hidden slides", xmlText(app, "HiddenSlides")).add(
        "Notes",
        xmlText(app, "Notes"),
      );
    }
    const macros = names.some((n) => /vbaProject\.bin$/i.test(n));
    r.add(
      "Macros",
      macros
        ? "Contains macros (VBA programs). They were NOT run."
        : "None found",
      "Macros are small programs inside a document. They are a common way to spread harmful software.",
      macros ? "warn" : "good",
    );
    const embeds = names.filter((n) =>
      /\/(embeddings|activeX)\//i.test(n),
    ).length;
    r.add(
      "Embedded objects",
      embeds ? `${embeds} embedded file${embeds === 1 ? "" : "s"}` : "",
      "Other files placed inside the document.",
    );
    const g = r.group("document", flavour);
    if (g) groups.push(g);
  } else if (mimetype === "application/epub+zip" || container) {
    kind = "E-book (EPUB)";
    const rootPath = xmlAttr(
      await part("META-INF/container.xml"),
      "rootfile",
      "full-path",
    );
    const opf = rootPath ? await part(rootPath) : "";
    const r = new Rows();
    r.add("Title", xmlText(opf, "dc:title"))
      .add("Author", xmlText(opf, "dc:creator"))
      .add("Language", xmlText(opf, "dc:language"));
    r.add("Publisher", xmlText(opf, "dc:publisher"))
      .add("Date", xmlText(opf, "dc:date"))
      .add(
        "Identifier",
        xmlText(opf, "dc:identifier"),
        "A unique code for the book (like an ISBN).",
      );
    r.add("Rights", xmlText(opf, "dc:rights")).add(
      "Description",
      xmlText(opf, "dc:description"),
    );
    r.add(
      "Chapters in reading order",
      String((opf.match(/<itemref\b/g) ?? []).length || ""),
      "How many parts the book is divided into.",
    ).add("Files listed", String((opf.match(/<item\b/g) ?? []).length || ""));
    const g = r.group("document", "E-book");
    if (g) groups.push(g);
  } else if (mimetype.startsWith("application/vnd.oasis.opendocument")) {
    const meta = await part("meta.xml");
    kind = mimetype.includes("text")
      ? "OpenDocument text"
      : mimetype.includes("spreadsheet")
        ? "OpenDocument spreadsheet"
        : mimetype.includes("presentation")
          ? "OpenDocument presentation"
          : "OpenDocument file";
    const stat = (a: string) => xmlAttr(meta, "meta:document-statistic", a);
    const r = new Rows();
    r.add("Title", xmlText(meta, "dc:title"))
      .add("Subject", xmlText(meta, "dc:subject"))
      .add(
        "Author",
        xmlText(meta, "dc:creator") || xmlText(meta, "meta:initial-creator"),
      );
    r.add("First author", xmlText(meta, "meta:initial-creator"))
      .add("Created", xmlText(meta, "meta:creation-date"))
      .add("Last saved", xmlText(meta, "dc:date"));
    r.add("Made with", xmlText(meta, "meta:generator"))
      .add("Pages", stat("meta:page-count"))
      .add("Words", stat("meta:word-count"))
      .add("Characters", stat("meta:character-count"))
      .add("Tables", stat("meta:table-count"));
    r.add("Editing time", xmlText(meta, "meta:editing-duration"));
    const g = r.group("document", kind);
    if (g) groups.push(g);
  } else if (["jar", "apk", "war"].includes(ext))
    kind = `Java / Android package (${ext})`;
  groups.push(...archiveGroups(kind, summary, size));
  return { groups, kind };
}

// ---------------------------------------------------------------------------------------------------------------
// tar and gzip
// ---------------------------------------------------------------------------------------------------------------

/** Extracts the entry path from a 512-byte POSIX ustar tar header block, combining prefix and name fields. */
export function tarName(h: Buffer): string {
  const name = h.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
  const prefix = h.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
  return prefix && h.subarray(257, 262).toString("latin1") === "ustar"
    ? `${prefix}/${name}`
    : name;
}

/** Checks whether a 512-byte buffer is a valid POSIX `ustar` or classic V7 tar header with a matching octal checksum. */
export function isTarHeader(h: Buffer): boolean {
  if (h.length < 512) return false;
  const magic = h.subarray(257, 262);
  const isUstar = magic.toString("latin1") === "ustar";
  const isV7 = magic.every((b) => b === 0) && h[0] !== 0;
  if (!isUstar && !isV7) return false;
  const chkRaw = h
    .subarray(148, 156)
    .toString("latin1")
    .replace(/\0.*$/, "")
    .trim();
  if (!/^[0-7]+$/.test(chkRaw)) return false;
  const expected = parseInt(chkRaw, 8);
  let unsignedSum = 0;
  let signedSum = 0;
  for (let i = 0; i < 512; i++) {
    const b = i >= 148 && i < 156 ? 32 : h[i]!;
    unsignedSum += b;
    signedSum += b > 127 ? b - 256 : b;
  }
  return expected === unsignedSum || expected === signedSum;
}

function tarHeaderSize(h: Buffer): number {
  const first = h[124] ?? 0;
  if ((first & 0x80) !== 0) {
    if ((first & 0x40) !== 0) return 0;
    let val = first & 0x3f;
    for (let i = 125; i < 136; i++) {
      val = val * 256 + h[i]!;
    }
    return Number.isFinite(val) && val >= 0 ? val : 0;
  }
  return (
    parseInt(
      h.subarray(124, 136).toString("latin1").replace(/\0.*$/, "").trim() ||
        "0",
      8,
    ) || 0
  );
}

function parsePaxRecords(payload: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 0;
  while (pos < payload.length) {
    const sp = payload.indexOf(0x20, pos);
    if (sp <= pos) break;
    const len = parseInt(payload.subarray(pos, sp).toString("latin1"), 10);
    if (
      !Number.isFinite(len) ||
      len <= sp - pos + 1 ||
      pos + len > payload.length
    ) {
      break;
    }
    const body = payload.subarray(sp + 1, pos + len - 1).toString("utf8");
    const eq = body.indexOf("=");
    if (eq > 0) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    }
    pos += len;
  }
  return out;
}

/** Reads a tar stream header by header, skipping the data. Stops at the limits. */
export async function walkTar(
  chunks: AsyncIterable<Buffer>,
  limits: { maxEntries: number; maxBytes: number; maxMs: number },
): Promise<ArchiveSummary> {
  const list: Array<{ name: string; size: number; dir: boolean }> = [];
  const started = Date.now();
  let pending: Buffer = Buffer.alloc(0);
  let skip = 0,
    seen = 0,
    partial = false,
    zeroBlocks = 0,
    longName = "",
    paxPath = "",
    paxSize: number | null = null;
  outer: for await (const chunk of chunks) {
    seen += chunk.length;
    let buf: Buffer = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    for (;;) {
      if (skip > 0) {
        const n = Math.min(skip, buf.length);
        skip -= n;
        buf = buf.subarray(n);
      }
      if (skip > 0 || buf.length < 512) break;
      const h = buf.subarray(0, 512);
      if (h.every((x) => x === 0)) {
        buf = buf.subarray(512);
        if (++zeroBlocks >= 2) break outer;
        continue;
      }
      zeroBlocks = 0;
      if (!isTarHeader(h)) {
        partial = true;
        break outer;
      }
      const size = tarHeaderSize(h);
      const type = String.fromCharCode(h[156] || 48);
      const padded = Math.ceil(size / 512) * 512;
      if (
        (type === "L" || type === "x") &&
        padded <= 1024 * 1024 &&
        buf.length < 512 + padded
      ) {
        break;
      }
      buf = buf.subarray(512);
      if (type === "L") {
        longName = buf
          .subarray(0, Math.min(buf.length, size))
          .toString("utf8")
          .replace(/\0.*$/, "");
        skip = padded;
        continue;
      }
      if (type === "K" || type === "g") {
        skip = padded;
        continue;
      }
      if (type === "x") {
        const pax = parsePaxRecords(
          buf.subarray(0, Math.min(buf.length, size)),
        );
        if (typeof pax.path === "string" && pax.path) paxPath = pax.path;
        if (typeof pax.size === "string" && /^\d+$/.test(pax.size)) {
          const n = Number(pax.size);
          if (Number.isFinite(n) && n >= 0) paxSize = n;
        }
        skip = padded;
        continue;
      }
      const effectiveSize = paxSize ?? size;
      const name = paxPath || longName || tarName(h);
      longName = "";
      paxPath = "";
      paxSize = null;
      list.push({
        name,
        size: effectiveSize,
        dir: type === "5" || name.endsWith("/"),
      });
      skip = Math.ceil(effectiveSize / 512) * 512;
      if (
        list.length >= limits.maxEntries ||
        seen > limits.maxBytes ||
        Date.now() - started > limits.maxMs
      ) {
        partial = true;
        break outer;
      }
    }
    pending = buf;
  }
  return summarizeEntries(list, partial);
}

/** Inspects an uncompressed `.tar` archive file and returns its summary groups and kind label. */
export async function tarDocument(
  path: string,
  size: number,
): Promise<{ groups: InfoGroup[]; kind: string; summary?: ArchiveSummary }> {
  const rs = createReadStream(path, { highWaterMark: 256 * 1024 });
  try {
    const s = await walkTar(rs, {
      maxEntries: 20_000,
      maxBytes: Number.POSITIVE_INFINITY,
      maxMs: 6000,
    });
    return {
      kind: "Tar archive",
      groups: archiveGroups("Tar archive (not compressed)", s, size),
      summary: s,
    };
  } finally {
    rs.destroy();
  }
}

/** The first bytes a gzip stream unpacks to (at most `count`), read without unpacking the rest. */
async function gunzipStart(compressed: Buffer, count: number): Promise<Buffer> {
  const gz = createGunzip();
  const got: Buffer[] = [];
  let total = 0;
  try {
    gz.end(compressed);
    for await (const chunk of gz) {
      got.push(chunk as Buffer);
      total += (chunk as Buffer).length;
      if (total >= count) break;
    }
  } catch {
    // a cut-off stream still gave its first bytes
  } finally {
    gz.destroy();
  }
  return Buffer.concat(got).subarray(0, count);
}

/** Inspects a gzip-compressed file (or `.tar.gz` archive) and returns its header metadata and archive summary groups. */
export async function gzipDocument(
  handle: fsp.FileHandle,
  path: string,
  size: number,
): Promise<{ groups: InfoGroup[]; kind: string; summary?: ArchiveSummary }> {
  const head = await readBytes(handle, 0, 64 * 1024);
  const rows = new Rows();
  let originalName = "";
  if (head.length >= 12 && (head[3]! & 8) !== 0) {
    let p = 10;
    if ((head[3]! & 4) !== 0) p += 2 + head.readUInt16LE(10);
    const z = head.indexOf(0, p);
    if (z > p) originalName = head.subarray(p, z).toString("latin1");
  }
  const tail =
    size >= 18 ? await readBytes(handle, size - 4, 4) : Buffer.alloc(0);
  const isize = tail.length === 4 ? tail.readUInt32LE(0) : 0;
  rows.add(
    "Original name",
    originalName,
    "The name the file had before it was compressed.",
  );
  rows.add(
    "Compressed on",
    head.length >= 8 && head.readUInt32LE(4) > 0
      ? new Date(head.readUInt32LE(4) * 1000)
          .toISOString()
          .replace(/\.000Z$/, "Z")
      : "",
  );
  rows.add(
    "Unpacked size",
    isize
      ? `${sizeText(isize)}${size > 4 * 1024 ** 3 ? " (only the lowest 32 bits are stored, so the real size may be larger)" : ""}`
      : "",
    "Read from the end of the file. A file bigger than 4 GB shows a smaller number.",
  );
  const groups: InfoGroup[] = [];
  const isTar = isTarHeader(await gunzipStart(head, 512));
  let kind = "gzip-compressed file";
  let tarSummary: ArchiveSummary | undefined;
  if (isTar) {
    kind = "Compressed tar archive (.tar.gz)";
    const rs = createReadStream(path, { highWaterMark: 256 * 1024 });
    const gz = createGunzip();
    rs.on("error", (err) => gz.destroy(err));
    rs.pipe(gz);
    try {
      tarSummary = await walkTar(gz, {
        maxEntries: 20_000,
        maxBytes: 256 * 1024 * 1024,
        maxMs: 6000,
      });
      groups.push(...archiveGroups(kind, tarSummary, size));
    } catch {
      groups.push({
        id: "archive",
        title: "Archive",
        rows: [],
        note: "The list could not be read to the end: the file may be damaged.",
      });
    } finally {
      rs.destroy();
      gz.destroy();
    }
  }
  const g = rows.group("gzip", "Compressed file");
  if (g) groups.unshift(g);
  return { groups, kind, ...(tarSummary ? { summary: tarSummary } : {}) };
}
