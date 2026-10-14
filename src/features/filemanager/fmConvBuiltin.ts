/**
 * The built-in converters as one function: `runBuiltin(job)` reads the input(s), converts and writes `job.output`.
 * It runs inside a Bun Worker (see `fmConvWorker.ts`) so a big file never freezes the File Manager, and it can be
 * stopped by ending the worker. It writes only to `job.output`, a path chosen by the caller that does not exist yet.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { ConvError, Notes, checkSize, toTable, type Value } from "./fmConvCommon";
import { DATA_EXTENSIONS, DEFAULT_DATA_OPTIONS, FORMAT_EXTENSION, parseData, writeData, type DataFormat, type DataOptions } from "./fmConvFormats";
import type { OptionValues } from "./fmConvOptions";
import { readSpreadsheet, sheetValue, sheetsFromValue, writeXlsx, type Sheet } from "./fmConvSheet";
import {
  ENCODING_BY_ID, convertLineEndings, decodeBase64, decodeBytes, decodeHex, encodeBase64, encodeHex, encodeText, htmlToText,
  spacesToTabs, stripTrailingSpaces, stripUtf8Bom, tabsToSpaces, textToHtml, type LineEnding,
} from "./fmConvText";
import {
  DEFAULT_ARCHIVE_LIMITS, brotliFile, createTarGzFrom, createTarZstFrom, createZipFrom, extractTarGz, gunzipFile, gzipFile, tarGzToZip, unbrotliFile, unzstdFile, zipToTarGz, zstdFile, type ArchiveLimits,
} from "./fmConvArchive";
import { renderMarkdownPage } from "./fmConvMarkdown";
import { TranspileError, transpileSource, type JsTarget, type JsxStyle } from "./fmJsTranspile";
import { extractZip } from "./fmZip";
import { createContext } from "./fmCore";
import type { Platform } from "./fmPaths";

export interface BuiltinJob {
  kind: string;
  inputs: string[];
  /** A file to create, or (for the kinds that make folders) a folder that exists and is empty. */
  output: string;
  /** Checked option values (see `fmConvOptions.ts`). */
  opts: OptionValues;
  /** Fixed settings of the action, such as the format to write. */
  params: Record<string, string | number | boolean>;
  platform: Platform;
  home: string;
  limits?: ArchiveLimits;
}

const str = (o: OptionValues, id: string, d = ""): string => (o[id] === undefined ? d : String(o[id]));
const bool = (o: OptionValues, id: string, d = false): boolean => (o[id] === undefined ? d : o[id] === true);
const num = (o: OptionValues, id: string, d: number): number => (o[id] === undefined ? d : Number(o[id]));

/** Extension of a file name in lower case, with ".tar.gz" as one. */
export function extOfName(name: string): string {
  const m = /\.(tar\.gz|tar\.bz2|tar\.xz)$/i.exec(name);
  if (m) return m[1]!.toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

async function readInput(path: string): Promise<Buffer> {
  const st = await fsp.stat(path);
  if (!st.isFile()) throw new ConvError("That isn't a file.");
  if (st.size === 0) throw new ConvError("The file is empty: there is nothing to convert.");
  checkSize(st.size);
  const bytes = await fsp.readFile(path);
  checkSize(bytes.length);
  return bytes;
}

async function writeNew(path: string, data: string | Uint8Array): Promise<void> {
  await fsp.writeFile(path, data, { flag: "wx" });
}

function dataOptions(o: OptionValues, params: BuiltinJob["params"]): DataOptions {
  const d = DEFAULT_DATA_OPTIONS;
  return {
    flatten: bool(o, "flatten", d.flatten),
    unflatten: bool(o, "unflatten", d.unflatten),
    header: bool(o, "header", d.header),
    delimiter: (str(o, "delimiter", "auto") as DataOptions["delimiter"]) || "auto",
    types: bool(o, "types", d.types),
    sortKeys: params.sortKeys === true || bool(o, "sortKeys", false),
    indent: params.indent !== undefined ? Number(params.indent) : num(o, "indent", d.indent),
    tableName: str(o, "tableName", d.tableName) || d.tableName,
    rootName: str(o, "rootName", d.rootName) || d.rootName,
    itemName: d.itemName,
    dialect: (str(o, "dialect", d.dialect) as DataOptions["dialect"]) || d.dialect,
    createTable: bool(o, "createTable", d.createTable),
    bom: bool(o, "bom", d.bom),
    title: "Table",
  };
}

/** The input as data: a data file is read as text, a spreadsheet through the spreadsheet reader. */
async function readValue(input: string, o: DataOptions, notes: Notes, sheets: "first" | "all"): Promise<Value> {
  const name = nodePath.basename(input);
  const format: DataFormat | undefined = DATA_EXTENSIONS[extOfName(name)];
  if (!format) throw new ConvError("This kind of file isn't a data format the built-in converter knows.");
  if (format === "sheet") {
    const all = await sheetsOf(input);
    if (sheets === "all" && all.length > 1) {
      const out: Record<string, Value> = {};
      for (const s of all) Object.defineProperty(out, s.name, { value: sheetValue(s, o.header), enumerable: true, writable: true, configurable: true });
      return out;
    }
    if (all.length > 1) notes.add(`The spreadsheet has ${all.length} sheets; only the first ("${all[0]!.name}") was used.`);
    return sheetValue(all[0]!, o.header);
  }
  const bytes = await readInput(input);
  const d = decodeBytes(bytes, "auto", false);
  if (d.encoding === "windows-1252" && /not valid UTF-8/.test(d.how)) notes.add("The file wasn't UTF-8, so it was read as Windows-1252 (Western European).");
  return parseData(format, d.text, o, notes);
}

async function sheetsOf(path: string): Promise<Sheet[]> {
  const st = await fsp.stat(path);
  checkSize(st.size);
  return readSpreadsheet(path);
}

function limitsOf(job: BuiltinJob): ArchiveLimits {
  return job.limits ?? DEFAULT_ARCHIVE_LIMITS;
}

function archiveNote(label: string, r: { files: number; folders?: number; skipped?: string[]; skippedLinks?: number }): string {
  const parts = [`${r.files} file${r.files === 1 ? "" : "s"}`];
  const skipped = r.skipped?.length ?? 0;
  if (skipped) parts.push(`${skipped} skipped for safety (${r.skipped!.slice(0, 2).join(" ")}${skipped > 2 ? " …" : ""})`);
  if (r.skippedLinks) parts.push(`${r.skippedLinks} link${r.skippedLinks === 1 ? "" : "s"} skipped`);
  return `${label}: ${parts.join(", ")}.`;
}

/** Runs one built-in conversion and returns a note for the person (what was lost or guessed), or "". A failed run leaves no output file. */
export async function runBuiltin(job: BuiltinJob): Promise<string> {
  // Whatever is at the output path before the run is not ours and is never touched.
  if (await fsp.lstat(job.output).then(() => true, () => false) && !(await isEmptyFolder(job.output))) throw Object.assign(new Error("A file with that name already exists."), { code: "EEXIST" });
  try {
    return await convert(job);
  } catch (err) {
    const st = await fsp.lstat(job.output).catch(() => null);
    if (st?.isFile()) await fsp.rm(job.output, { force: true }).catch(() => {});
    throw err;
  }
}

async function isEmptyFolder(path: string): Promise<boolean> {
  const st = await fsp.lstat(path).catch(() => null);
  return !!st?.isDirectory() && (await fsp.readdir(path)).length === 0;
}

async function convert(job: BuiltinJob): Promise<string> {
  const { kind, params, opts: o } = job;
  const input = job.inputs[0]!;
  const notes = new Notes();
  switch (kind) {
    case "data": {
      const dopts = dataOptions(o, params);
      const to = String(params.to) as DataFormat;
      const value = await readValue(input, dopts, notes, to === "json" || to === "yaml" || to === "toml" || to === "xml" ? (str(o, "sheet", "first") === "all" ? "all" : "first") : "first");
      await writeNew(job.output, writeData(to, value, dopts, notes));
      return notes.toString();
    }
    case "sheet-folder": {
      const dopts = dataOptions(o, params);
      const to = String(params.to) as DataFormat;
      const sheets = await sheetsOf(input);
      const used = new Set<string>();
      let written = 0;
      for (const s of sheets) {
        if (!s.rows.length) { notes.add("Empty sheets were skipped."); continue; }
        const base = (s.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().replace(/[. ]+$/, "") || "Sheet").slice(0, 80);
        let name = base;
        for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base} (${k})`;
        used.add(name.toLowerCase());
        const text = writeData(to, sheetValue(s, dopts.header), dopts, notes);
        await writeNew(nodePath.join(job.output, `${name}.${FORMAT_EXTENSION[to] ?? to}`), text);
        written++;
      }
      if (!written) throw new ConvError("Every sheet in this spreadsheet is empty.");
      return notes.toString();
    }
    case "to-xlsx": {
      const dopts = dataOptions(o, params);
      const value = await readValue(input, dopts, notes, "first");
      const base = nodePath.basename(input).replace(/\.[^.]*$/, "");
      const sheets = sheetsFromValue(value, str(o, "sheetName", "") || base || "Sheet1", (v) => toTable(v, { flatten: dopts.flatten, notes }), true);
      await writeNew(job.output, writeXlsx(sheets, notes));
      return notes.toString();
    }
    case "encoding": {
      const bytes = await readInput(input);
      const replace = str(o, "bad", "stop") === "replace";
      const d = decodeBytes(bytes, str(o, "from", "auto"), replace);
      const to = str(o, "to", "utf-8");
      if (!ENCODING_BY_ID.get(to)?.write) throw new ConvError("That encoding can't be written.");
      const enc = encodeText(d.text, to, replace);
      await writeNew(job.output, enc.bytes);
      const parts = [`Read as ${ENCODING_BY_ID.get(d.encoding)!.label.split(" (")[0]} (${d.how}).`];
      if (d.bad) parts.push(`${d.bad} unreadable place${d.bad === 1 ? " was" : "s were"} replaced.`);
      if (enc.unmappable) parts.push(`${enc.unmappable} character${enc.unmappable === 1 ? "" : "s"} that ${ENCODING_BY_ID.get(to)!.label.split(" (")[0]} can't hold became "?".`);
      return parts.join(" ");
    }
    case "eol":
      await writeNew(job.output, convertLineEndings(await readInput(input), String(params.to) as LineEnding));
      return "";
    case "tabs-to-spaces":
      await writeNew(job.output, tabsToSpaces(await readInput(input), num(o, "width", 4)));
      return "";
    case "spaces-to-tabs":
      await writeNew(job.output, spacesToTabs(await readInput(input), num(o, "width", 4)));
      return "";
    case "trim-trailing":
      await writeNew(job.output, stripTrailingSpaces(await readInput(input)));
      return "";
    case "strip-bom": {
      const bytes = await readInput(input);
      const out = stripUtf8Bom(bytes);
      await writeNew(job.output, out);
      return out.length === bytes.length ? "The file had no byte-order mark, so this is an exact copy." : "";
    }
    case "base64-encode":
      await writeNew(job.output, encodeBase64(await readInput(input), num(o, "wrap", 76)));
      return "";
    case "hex-encode":
      await writeNew(job.output, encodeHex(await readInput(input), str(o, "style", "spaced") === "spaced", bool(o, "upper", false)));
      return "";
    case "base64-decode":
    case "hex-decode": {
      const bytes = await readInput(input);
      const text = new TextDecoder("utf-8").decode(bytes);
      const out = kind === "base64-decode" ? decodeBase64(text) : decodeHex(text);
      await writeNew(job.output, out);
      return "";
    }
    case "md-html": {
      const bytes = await readInput(input);
      const page = renderMarkdownPage(decodeBytes(bytes, "auto", true).text, nodePath.basename(input).replace(/\.[^.]*$/, ""));
      await writeNew(job.output, page.html);
      return `Raw HTML in the Markdown is shown as text, and only web, mail and relative links are kept.${page.engine === "builtin" ? " The simpler built-in renderer was used." : ""}`;
    }
    case "transpile": {
      const bytes = await readInput(input);
      const ext = extOfName(nodePath.basename(input));
      const jsx = str(o, "jsx", "react") as JsxStyle;
      let code: string;
      try {
        code = transpileSource(decodeBytes(bytes, "auto", true).text, ext, {
          target: str(o, "target", "browser") as JsTarget,
          jsx,
          minifyWhitespace: bool(o, "minifyWhitespace"),
          minifyIdentifiers: bool(o, "minifyIdentifiers"),
          minifySyntax: bool(o, "minifySyntax"),
        });
      } catch (err) {
        if (err instanceof TranspileError) throw new ConvError(err.message);
        throw err;
      }
      await writeNew(job.output, code);
      const tags = ext === "tsx" || ext === "jsx";
      return `Types were removed; nothing was type-checked.${tags ? ` JSX tags became ${jsx === "preact" ? "h(...)" : "React.createElement(...)"} calls, so the page must provide ${jsx === "preact" ? "h and Fragment" : "React"}.` : ""}`;
    }
    case "text-html": {
      const bytes = await readInput(input);
      await writeNew(job.output, textToHtml(decodeBytes(bytes, "auto", true).text, nodePath.basename(input), str(o, "layout", "pre") === "paragraphs" ? "paragraphs" : "pre"));
      return "";
    }
    case "html-text": {
      const bytes = await readInput(input);
      await writeNew(job.output, htmlToText(decodeBytes(bytes, "auto", true).text));
      return "";
    }
    case "gzip": await gzipFile(input, job.output, num(o, "level", 6)); return "";
    case "zstd": await zstdFile(input, job.output, num(o, "level", 3)); return "";
    case "unzstd": await unzstdFile(input, job.output, limitsOf(job).maxBytes); return "";
    case "gunzip": await gunzipFile(input, job.output, limitsOf(job).maxBytes); return "";
    case "brotli": await brotliFile(input, job.output); return "";
    case "unbrotli": await unbrotliFile(input, job.output, limitsOf(job).maxBytes); return "";
    case "zip-create": return archiveNote("Zipped", await createZipFrom(job.inputs, job.output, limitsOf(job)));
    case "targz-create": return archiveNote("Packed", await createTarGzFrom(job.inputs, job.output, limitsOf(job), num(o, "level", 6)));
    case "tarzst-create": return archiveNote("Packed", await createTarZstFrom(job.inputs, job.output, limitsOf(job), num(o, "level", 3)));
    case "zip-to-targz": return archiveNote("Converted", await zipToTarGz(input, job.output, job.platform, limitsOf(job)));
    case "targz-to-zip": return archiveNote("Converted", await tarGzToZip(input, job.output, job.platform, limitsOf(job)));
    case "targz-extract":
    case "tarzst-extract": return archiveNote("Unpacked", await extractTarGz(input, job.output, job.platform, limitsOf(job)));
    case "zip-extract": {
      // fmZip makes a folder named after the zip inside the folder it is given; that folder is then moved up.
      const ctx = createContext({ platform: job.platform, home: job.home });
      const limits = limitsOf(job);
      const made = await extractZip(ctx, input, job.output, { maxTotalBytes: limits.maxBytes, maxEntries: limits.maxEntries });
      const holder = nodePath.join(job.output, `.fm-up-${process.pid}-${Date.now()}`);
      await fsp.rename(made.folder, holder);
      for (const name of await fsp.readdir(holder)) await fsp.rename(nodePath.join(holder, name), nodePath.join(job.output, name));
      await fsp.rmdir(holder);
      return archiveNote("Unzipped", { files: made.files, skipped: made.skipped });
    }
    default:
      throw new ConvError("That conversion isn't known.");
  }
}
