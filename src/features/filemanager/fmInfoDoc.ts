/** `info/document`: what a document, archive, database, font, program or text file contains. Read-only; nothing is run. */
import { absolutePath, type FmContext } from "./fmCore";
import { elfInfo, fontInfo, machoInfo, peInfo, sqliteInfo } from "./fmInfoBinary";
import { fileSource, HEAD_BYTES, openForRead, readBytes, regularFile, type InfoGroup } from "./fmInfoCommon";
import { parsePdf, pdfGroups } from "./fmInfoPdf";
import { analyzeText, jsonRows, textGroups } from "./fmInfoText";
import { gzipDocument, tarDocument, zipDocument } from "./fmInfoZipDoc";
import { extensionOf, FmError } from "./fmPaths";
import { SNIFF_BYTES, sniffType } from "./fmSniff";

export interface DocumentResult {
  kind: string;
  groups: InfoGroup[];
  supported: boolean;
  notes: string[];
}

const ZIP_EXT = new Set(["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub", "jar", "apk", "war", "xpi", "cbz", "vsix", "nupkg", "whl", "ipa"]);
const TEXT_KINDS = new Set(["text", "script", "html", "xml", "svg"]);

export async function documentInfo(ctx: FmContext, input: unknown): Promise<DocumentResult> {
  const t = await regularFile(ctx, input);
  const path = absolutePath(ctx, input);
  const ext = extensionOf(path);
  const handle = await openForRead(path);
  try {
    const size = t.lst.size;
    const src = fileSource(handle, size);
    const sniff = sniffType(await readBytes(handle, 0, SNIFF_BYTES));
    const kind = sniff?.kind ?? "";
    const done = (r: { groups: InfoGroup[]; kind: string }): DocumentResult => ({ ...r, supported: true, notes: [] });
    if (kind === "pdf") return done({ kind: "PDF document", groups: pdfGroups(await parsePdf(src)) });
    if (kind === "zip" || (ZIP_EXT.has(ext) && kind !== "gzip" && kind !== "text")) {
      try {
        return done(await zipDocument(handle, size, ext));
      } catch (err) {
        if (kind === "zip") throw err;
      }
    }
    if (kind === "gzip") return done(await gzipDocument(handle, path, size));
    if (kind === "tar") return done(await tarDocument(path, size));
    if (kind === "sqlite") return done(await sqliteInfo(src));
    if (kind === "ttf" || kind === "otf" || kind === "ttc" || kind === "woff") return done(await fontInfo(src));
    if (kind === "pe") return done(await peInfo(src));
    if (kind === "elf") return done(await elfInfo(src));
    if (kind === "macho") return done(await machoInfo(src));
    if (kind === "woff2") return { kind: "Web font (WOFF2)", groups: [], supported: false, notes: ["WOFF2 fonts are compressed in a way that isn't read here."] };
    if (["rar", "7z", "bzip2", "xz", "zstd", "cab"].includes(kind)) return { kind: sniff!.label.replace(/^an? /, ""), groups: [], supported: false, notes: ["This kind of archive can't be listed here."] };
    if (size === 0) return { kind: "Empty file", groups: [], supported: false, notes: ["The file is empty."] };
    if (TEXT_KINDS.has(kind)) {
      const bytes = await readBytes(handle, 0, Math.min(size, HEAD_BYTES));
      const { stats, text } = analyzeText(bytes, size);
      const json = ext === "json" || /^\s*[[{]/.test(text.slice(0, 20)) ? jsonRows(text, size <= HEAD_BYTES) : null;
      return done({ kind: sniff!.label.replace(/^an? /, "").replace(/^./, (c) => c.toUpperCase()), groups: textGroups(stats, json) });
    }
    throw new FmError("NOT_SUPPORTED", "There is no detailed reader for this kind of file. The general details still apply.");
  } finally {
    await handle.close();
  }
}
