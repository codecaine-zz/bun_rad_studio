/**
 * The catalog of document conversions: pandoc for markup and word-processor formats, LibreOffice for Office files
 * pandoc can't read, Ghostscript (and qpdf, poppler when present) for PDF work, Tesseract for text in pictures,
 * calibre for e-books, fontTools for fonts and the system's archive tools for 7z, RAR, ISO and DMG.
 */
import { existsSync, readdirSync, writeFileSync } from "fs";
import * as nodePath from "path";
import { pathToFileURL } from "url";
import { optNum, optStr, type OptionValues } from "./fmConvOptions";
import { choiceOpt, exts, numberOpt, pagesOpt, toggleOpt, type BuildContext, type ConvDef, type Engine } from "./fmConvTypes";

export const DOC_IN = exts("md markdown txt html htm docx odt rtf epub tex rst org textile");
const DOC_IN_PLUS = exts("md markdown txt html htm docx odt rtf epub tex rst org textile adoc asciidoc ipynb wiki mediawiki");
const LO_WRITER = exts("doc docx dot dotx rtf wps wpd odt ott sxw pages");
const LO_CALC = exts("xls xlsx xlsm xlt ods ots numbers");
const LO_IMPRESS = exts("ppt pptx pps ppsx odp otp key");
const LO_ALL = new Set([...LO_WRITER, ...LO_CALC, ...LO_IMPRESS]);
const EB_ONLY = exts("mobi azw azw3 azw4 fb2 lit lrf pdb prc htmlz");
const EB_FROM = new Set([...EB_ONLY, "epub", "pdf", "docx", "txt", "rtf", "odt", "html", "htm"]);
const PDF_IN = exts("pdf");
const OCR_IMAGES = exts("png jpg jpeg tif tiff bmp gif webp");

const READER: Record<string, string> = { md: "markdown", markdown: "markdown", txt: "markdown", html: "html", htm: "html", docx: "docx", odt: "odt", rtf: "rtf", epub: "epub", tex: "latex", rst: "rst", org: "org", textile: "textile", adoc: "asciidoc", asciidoc: "asciidoc", ipynb: "ipynb", wiki: "mediawiki", mediawiki: "mediawiki" };
const extOfPath = (p: string) => (p.split(/[\\/]/).pop() ?? "").split(".").pop()!.toLowerCase();
const TOC = toggleOpt("toc", "Add a table of contents", "A list of the headings at the start.", false);

// ---------------------------------------------------------------------------------------------------------------
// pandoc
// ---------------------------------------------------------------------------------------------------------------

/** The legacy way pandoc was started: inputs, the action's arguments, then the title / PDF engine / contents, then -o. */
const pandoc = (out: string, args: string[], extra: Partial<Engine> = {}): Engine => ({
  tool: "pandoc",
  argv: (c) => {
    const a = [...c.inputs, ...args];
    if (out === "html") a.push("--metadata", `pagetitle=${c.title}`);
    if (out === "pdf" && c.pdfEngine) a.push(`--pdf-engine=${c.pdfEngine}`);
    if (c.opts.toc === true) a.push("--toc");
    return [...a, "-o", c.output];
  },
  accepts: DOC_IN,
  ...extra,
});

/** pandoc with the reader and writer named explicitly (used for the formats added after the first release). */
const pandocFmt = (writer: string, args: string[] = [], accepts: Set<string> = DOC_IN_PLUS): Engine => ({
  tool: "pandoc",
  needs: `writer-${writer}`,
  accepts,
  argv: (c) => {
    const reader = READER[extOfPath(c.inputs[0]!)];
    return [...(reader ? ["-f", reader] : []), c.inputs[0]!, ...args, "-t", writer, ...(c.opts.toc === true ? ["--toc"] : []), "-o", c.output];
  },
});

const doc = (id: string, label: string, hint: string, out: string, engines: Engine[], extra: Partial<ConvDef> = {}): ConvDef => ({
  id, label, hint, group: "Documents", inputs: DOC_IN_PLUS, out, suffix: "converted", mode: "each", rejectSame: true, engines, ...extra,
});

// ---------------------------------------------------------------------------------------------------------------
// LibreOffice
// ---------------------------------------------------------------------------------------------------------------

/** LibreOffice in the background: a private profile (so a running LibreOffice is never disturbed) and a staged name. */
const lo = (filter: string, accepts: Set<string>): Engine => ({
  tool: "libreoffice", stage: true, stageBase: "out", accepts, timeoutMs: 15 * 60 * 1000,
  argv: (c) => ["--headless", "--norestore", "--nolockcheck", "--nodefault", "--nologo", `-env:UserInstallation=${pathToFileURL(c.tmpDir("profile")).href}`, "--convert-to", filter, "--outdir", nodePath.dirname(c.output), c.inputs[0]!],
});

// ---------------------------------------------------------------------------------------------------------------
// Ghostscript, qpdf, poppler
// ---------------------------------------------------------------------------------------------------------------

const GS = ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET"];
const gs = (argv: (c: BuildContext) => string[], extra: Partial<Engine> = {}): Engine => ({ tool: "ghostscript", stage: true, argv, ...extra });
const pdfTool = (id: string, label: string, hint: string, out: string, suffix: string, engines: Engine[], extra: Partial<ConvDef> = {}): ConvDef => ({
  id, label, hint, group: "PDF tools", inputs: PDF_IN, out, suffix, mode: "each", engines, ...extra,
});

/** Page selection for Ghostscript: -sPageList takes the same "1-3,5" form. */
const gsPages = (o: OptionValues) => (o.pages ? [`-sPageList=${o.pages}`] : []);

/** Where Ghostscript keeps its sRGB colour profile (a PDF/A file must name one), found from the folders it reports. */
export function ghostscriptProfile(gsExe: string): string | null {
  let text = "";
  try {
    const r = Bun.spawnSync([gsExe, "-h"], { stdout: "pipe", stderr: "pipe" });
    text = `${r.stdout.toString()}\n${r.stderr.toString()}`;
  } catch {
    return null;
  }
  const dirs = [...text.matchAll(/^\s+(\S.*?)\s*:?\s*$/gm)].map((m) => m[1]!.replace(/\s*:$/, "")).filter((d) => nodePath.isAbsolute(d));
  for (const d of dirs) {
    for (const rel of ["../iccprofiles", "../../iccprofiles", "iccprofiles"]) {
      const p = nodePath.join(d, rel, "default_rgb.icc");
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const psString = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

function pdfaDefinition(title: string, icc: string): string {
  const safe = title.replace(/[()\\]/g, "").slice(0, 80);
  return `%!\n[ /Title (${safe}) /DOCINFO pdfmark\n[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark\n[{icc_PDFA} <</N 3>> /PUT pdfmark\n[{icc_PDFA} (${psString(icc)}) (r) file /PUT pdfmark\n[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark\n[{OutputIntent_PDFA} <<\n  /Type /OutputIntent\n  /S /GTS_PDFA1\n  /DestOutputProfile {icc_PDFA}\n  /OutputConditionIdentifier (sRGB)\n>> /PUT pdfmark\n[{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------------------------------------------

const LANGUAGE_OPTION = { ...choiceOpt("language", "Language", "The language of the text in the picture.", [["eng", "English"]], "eng"), choicesFromCaps: { prefix: "lang-" } };

/** Tesseract: a picture goes in directly; a PDF is turned into pictures first by Ghostscript. `mode` is "txt" or "pdf". */
const ocr = (mode: "txt" | "pdf"): Engine => ({
  tool: "tesseract", stage: true, needs: (_e, o) => `lang-${String(o.language ?? "eng")}`, also: (ext) => (ext === "pdf" ? ["ghostscript"] : []),
  argv: (c) => {
    const base = c.output.replace(/\.(txt|pdf)$/i, "");
    const lang = optStr(c.opts, "language") || "eng";
    const tail = mode === "pdf" ? ["pdf"] : [];
    if (extOfPath(c.inputs[0]!) !== "pdf") return [c.inputs[0]!, base, "-l", lang, ...tail];
    const pages = c.tmpDir("pages");
    const list = nodePath.join(pages, "list.txt");
    const gsExe = c.program("ghostscript", "gs") ?? c.program("ghostscript", "gswin64c") ?? c.program("ghostscript", "gswin32c") ?? "gs";
    return [
      [gsExe, ...GS, "-sDEVICE=png16m", `-r${optNum(c.opts, "dpi")}`, `-sOutputFile=${nodePath.join(pages, "page-%04d.png")}`, c.inputs[0]!],
      () => {
        // The page pictures exist only now, so the list of them is made now.
        const names = readdirSync(pages).filter((n) => n.endsWith(".png")).sort();
        if (!names.length) throw new Error("The PDF has no pages to read.");
        writeFileSync(list, names.map((n) => nodePath.join(pages, n)).join("\n"));
        return [c.exe, list, base, "-l", lang, ...tail];
      },
    ];
  },
  timeoutMs: 60 * 60 * 1000,
});

// ---------------------------------------------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------------------------------------------

const EXTRACT_ENGINES = (): Engine[] => [
  { tool: "builtin", accepts: exts("zip"), builtin: { kind: "zip-extract" } },
  { tool: "builtin", accepts: exts("tar.gz tgz tar"), builtin: { kind: "targz-extract" } },
  { tool: "builtin", accepts: exts("tar.zst tzst"), builtin: { kind: "tarzst-extract" } },
  { tool: "bsdtar", accepts: exts("tar.bz2 tbz2 tar.xz txz tar.lz4 tar.lzma 7z rar iso cab cpio lzh lha xar ar rpm"), limitOutput: true, argv: (c) => ["-x", "-f", c.inputs[0]!, "-C", c.output] },
  { tool: "sevenzip", limitOutput: true, argv: (c) => ["x", "-y", "-bd", `-o${c.output}`, "--", c.inputs[0]!] },
  { tool: "unar", limitOutput: true, argv: (c) => ["-q", "-D", "-o", c.output, c.inputs[0]!] },
];

export const ARCHIVE_IN = exts("zip tar.gz tgz tar tar.bz2 tbz2 tar.xz txz tar.zst tzst 7z rar iso cab dmg cpio lzh lha xar rpm");

export const DOC_DEFS: ConvDef[] = [
  doc("doc-html", "Convert to a web page (HTML)", "One self-contained page.", "html", [
    pandoc("html", ["-s", "--embed-resources"]),
    { tool: "builtin", accepts: exts("md markdown txt"), builtin: { kind: "md-html" } },
  ], { options: [TOC], inputs: DOC_IN }),
  doc("doc-docx", "Convert to Word (DOCX)", "Opens in Word, Pages and Google Docs.", "docx", [pandoc("docx", []), lo("docx", exts("doc dot wps wpd sxw pages ott"))], { options: [TOC], inputs: new Set([...DOC_IN, "doc", "dot", "wps", "wpd", "sxw", "pages", "ott"]) }),
  doc("doc-odt", "Convert to OpenDocument (ODT)", "Opens in LibreOffice.", "odt", [pandoc("odt", []), lo("odt", exts("doc docx dot dotx wps wpd sxw pages"))], { options: [TOC], inputs: new Set([...DOC_IN, "doc", "dot", "dotx", "wps", "wpd", "sxw", "pages"]) }),
  doc("doc-md", "Convert to Markdown", "Plain text with simple marks.", "md", [pandoc("md", ["--wrap=none"])], { inputs: DOC_IN_PLUS }),
  doc("doc-txt", "Convert to plain text", "Only the words.", "txt", [
    pandoc("txt", ["--wrap=none"]),
    { tool: "builtin", accepts: exts("html htm"), builtin: { kind: "html-text" } },
    { tool: "calibre", accepts: EB_ONLY, argv: (c) => [c.inputs[0]!, c.output] },
    lo("txt:Text (encoded):UTF8", exts("doc docx dot dotx wps wpd sxw pages ott")),
  ], { inputs: new Set([...DOC_IN, ...EB_ONLY, "doc", "dot", "dotx", "wps", "wpd", "sxw", "pages", "ott"]) }),
  doc("doc-epub", "Convert to an e-book (EPUB)", "For e-readers.", "epub", [pandoc("epub", []), { tool: "calibre", accepts: EB_FROM, argv: (c) => [c.inputs[0]!, c.output] }], { options: [TOC], inputs: new Set([...DOC_IN, ...EB_ONLY, "pdf"]), group: "Documents" }),
  doc("doc-pdf", "Convert to PDF", "Uses LibreOffice for Office files, and pandoc (with a PDF engine such as Typst or LaTeX) for the rest.", "pdf", [
    lo("pdf", LO_ALL),
    pandoc("pdf", [], { needs: "pdfengine" }),
    { tool: "calibre", accepts: EB_ONLY, argv: (c) => [c.inputs[0]!, c.output] },
  ], { options: [TOC], inputs: new Set([...DOC_IN, ...LO_ALL, ...EB_ONLY]), keywords: "office word excel powerpoint print" }),
  doc("doc-rtf", "Convert to RTF", "Opens in almost any word processor.", "rtf", [pandocFmt("rtf", ["-s"])], { options: [TOC] }),
  doc("doc-tex", "Convert to LaTeX", "For scientific papers.", "tex", [pandocFmt("latex", ["-s"])], { options: [TOC], keywords: "latex" }),
  doc("doc-rst", "Convert to reStructuredText", "The format of Python documentation.", "rst", [pandocFmt("rst")]),
  doc("doc-org", "Convert to Org mode", "For Emacs users.", "org", [pandocFmt("org")]),
  doc("doc-adoc", "Convert to AsciiDoc", "A text format for books and manuals.", "adoc", [pandocFmt("asciidoc")]),
  doc("doc-wiki", "Convert to MediaWiki", "The markup of Wikipedia.", "wiki", [pandocFmt("mediawiki")]),
  doc("doc-textile", "Convert to Textile", "A light text markup.", "textile", [pandocFmt("textile")]),
  doc("doc-man", "Convert to a manual page", "A Unix man page.", "1", [pandocFmt("man", ["-s"])]),
  doc("doc-ipynb", "Convert to a Jupyter notebook", "Markdown becomes text cells.", "ipynb", [pandocFmt("ipynb")]),
  doc("doc-pptx", "Make a PowerPoint (PPTX)", "Each top-level heading starts a new slide. Works best from Markdown.", "pptx", [pandocFmt("pptx")], { keywords: "slides presentation powerpoint" }),
  doc("doc-fb2", "Convert to an FB2 e-book", "An e-book format used in Russia and by many readers.", "fb2", [pandocFmt("fb2"), { tool: "calibre", accepts: EB_FROM, argv: (c) => [c.inputs[0]!, c.output] }], { inputs: new Set([...DOC_IN_PLUS, ...EB_ONLY, "pdf"]), group: "Ebooks" }),

  { id: "ocr-text", label: "Read the text in a picture or scan (OCR)", hint: "Turns a picture, photo or scanned PDF into a text file.", group: "Documents", inputs: new Set([...OCR_IMAGES, "pdf"]), out: "txt", suffix: "text", mode: "each", engines: [ocr("txt")], options: [LANGUAGE_OPTION, { ...numberOpt("dpi", "Scan detail (for PDF files)", "Higher reads small print better and takes longer.", 100, 600, 300, "dpi", 50), forExts: ["pdf"] }], keywords: "ocr scan recognise recognize" },
  { id: "ocr-pdf", label: "Make a scanned PDF searchable (OCR)", hint: "A new PDF that looks the same, but where you can search and copy the text.", group: "Documents", inputs: new Set([...OCR_IMAGES, "pdf"]), out: "pdf", suffix: "searchable", mode: "each", engines: [ocr("pdf")], options: [LANGUAGE_OPTION, { ...numberOpt("dpi", "Scan detail (for PDF files)", "Higher reads small print better and takes longer.", 100, 600, 300, "dpi", 50), forExts: ["pdf"] }], keywords: "ocr scan searchable text layer" },
];

export const EBOOK_DEFS: ConvDef[] = [
  ...([["mobi", "MOBI", "For older Kindles."], ["azw3", "AZW3 (Kindle)", "For Kindle e-readers."], ["docx", "Word (DOCX)", "Opens in Word."]] as const).map(([out, name, hint]): ConvDef => ({
    id: `eb-${out}`, label: `Convert an e-book to ${name}`, hint, group: "Ebooks", inputs: EB_FROM, out, suffix: "converted", mode: "each", rejectSame: true, engines: [{ tool: "calibre", argv: (c) => [c.inputs[0]!, c.output] }], keywords: "kindle ebook",
  })),
];

export const PDF_DEFS: ConvDef[] = [
  pdfTool("pdf-merge", "Merge PDFs into one", "The selected PDF files, in the order you choose, become one PDF.", "pdf", "merged", [gs((c) => [...GS, "-sDEVICE=pdfwrite", `-sOutputFile=${c.output}`, ...c.inputs])], { mode: "all", allName: "Merged PDF", minFiles: 2, options: [choiceOpt("order", "Order", "Which PDF comes first.", [["name", "By name"], ["selected", "As selected"], ["modified", "By date"]], "name")], keywords: "join combine" }),
  pdfTool("pdf-split", "Split into single pages", "A new folder with one PDF for every page.", "", "pages", [gs((c) => [...GS, "-sDEVICE=pdfwrite", `-sOutputFile=${nodePath.join(c.output, "page-%03d.pdf")}`, c.inputs[0]!])], { outKind: "folder", keywords: "separate pages" }),
  pdfTool("pdf-extract", "Keep only some pages", "A new PDF with just the pages you choose.", "pdf", "pages", [
    { tool: "qpdf", argv: (c) => ["--empty", "--pages", c.inputs[0]!, optStr(c.opts, "pages"), "--", c.output] },
    gs((c) => [...GS, "-sDEVICE=pdfwrite", `-sPageList=${optStr(c.opts, "pages")}`, `-sOutputFile=${c.output}`, c.inputs[0]!]),
  ], { options: [pagesOpt("pages", "Pages to keep", "Like 1-3,5 (pages 1, 2, 3 and 5).")], check: (o) => (optStr(o, "pages") ? null : "Type the pages to keep, like 1-3,5."), keywords: "extract select range delete remove" }),
  pdfTool("pdf-compress", "Make the PDF file smaller", "Shrinks the pictures inside. Good for sending by email.", "pdf", "smaller", [gs((c) => [...GS, "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5", `-dPDFSETTINGS=/${optStr(c.opts, "level")}`, `-sOutputFile=${c.output}`, c.inputs[0]!])], {
    options: [choiceOpt("level", "How small", "", [["ebook", "Smaller (good for screens, 150 dpi)"], ["screen", "Smallest (low quality, 72 dpi)"], ["printer", "Larger (good for printing, 300 dpi)"], ["default", "Balanced"]], "ebook")], keywords: "compress shrink reduce size email",
  }),
  pdfTool("pdf-rotate", "Rotate the pages", "Turn some or all pages of the PDF.", "pdf", "rotated", [{ tool: "qpdf", argv: (c) => [c.inputs[0]!, c.output, `--rotate=${optStr(c.opts, "turn")}:${optStr(c.opts, "pages") || "1-z"}`] }], {
    options: [choiceOpt("turn", "Turn", "", [["+90", "A quarter turn right"], ["-90", "A quarter turn left"], ["+180", "Upside down"]], "+90"), pagesOpt("pages", "Pages", "Like 1-3,5. Empty means every page.")], keywords: "turn sideways",
  }),
  pdfTool("pdf-linearize", "Prepare for fast web viewing", "Makes the first page appear quickly when the PDF is opened on a website.", "pdf", "web", [{ tool: "qpdf", argv: (c) => ["--linearize", c.inputs[0]!, c.output] }], { keywords: "linearise optimize" }),
  pdfTool("pdf-pdfa", "Make a PDF/A copy for archiving", "A PDF built to stay readable for decades.", "pdf", "PDFA", [gs((c) => {
    const icc = ghostscriptProfile(c.exe);
    if (!icc) throw new Error("Ghostscript's colour profile wasn't found, so a PDF/A file can't be made.");
    return [...GS, `--permit-file-read=${icc}`, "-dPDFA=2", "-dPDFACompatibilityPolicy=1", "-sColorConversionStrategy=RGB", "-sDEVICE=pdfwrite", `-sOutputFile=${c.output}`, c.tmpFile("PDFA_def.ps", pdfaDefinition(c.title, icc)), c.inputs[0]!];
  })], { keywords: "archive pdf/a long term" }),
  pdfTool("pdf-png", "Save each page as a picture (PNG)", "A new folder with one sharp picture for every page.", "", "pages", [gs((c) => [...GS, "-sDEVICE=png16m", `-r${optNum(c.opts, "dpi")}`, "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", ...gsPages(c.opts), `-sOutputFile=${nodePath.join(c.output, "page-%03d.png")}`, c.inputs[0]!])], {
    outKind: "folder", options: [numberOpt("dpi", "Detail", "Higher makes bigger, sharper pictures.", 50, 600, 150, "dpi", 10), pagesOpt("pages", "Only these pages", "Like 1-3,5. Empty means every page.")], keywords: "images convert pdf to png",
  }),
  pdfTool("pdf-jpg", "Save each page as a picture (JPG)", "A new folder with one picture for every page.", "", "pages", [gs((c) => [...GS, "-sDEVICE=jpeg", `-dJPEGQ=${optNum(c.opts, "quality")}`, `-r${optNum(c.opts, "dpi")}`, "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", ...gsPages(c.opts), `-sOutputFile=${nodePath.join(c.output, "page-%03d.jpg")}`, c.inputs[0]!])], {
    outKind: "folder", options: [numberOpt("dpi", "Detail", "", 50, 600, 150, "dpi", 10), numberOpt("quality", "Quality", "", 30, 100, 85, "%"), pagesOpt("pages", "Only these pages", "Like 1-3,5. Empty means every page.")], keywords: "images convert pdf to jpg",
  }),
  pdfTool("pdf-text", "Get the text out of the PDF", "A plain text file with the words of the PDF.", "txt", "text", [
    { tool: "poppler", program: "pdftotext", argv: (c) => ["-layout", "-enc", "UTF-8", c.inputs[0]!, c.output] },
    gs((c) => [...GS, "-sDEVICE=txtwrite", "-sstdout=%stderr", `-sOutputFile=${c.output}`, c.inputs[0]!]),
  ], { keywords: "extract text copy words" }),
];

export const FONT_IN = exts("ttf otf woff woff2");
const font = (id: string, label: string, hint: string, out: string, inputs: string, engines: Engine[]): ConvDef => ({
  id, label, hint, group: "Fonts", inputs: exts(inputs), out, suffix: "converted", mode: "each", rejectSame: true, engines, keywords: "typeface webfont",
});

const TTX_OUT = ["-q", "-f"];

export const FONT_DEFS: ConvDef[] = [
  font("font-woff2", "Make a WOFF2 web font", "The smallest font file for websites.", "woff2", "ttf otf woff", [
    { tool: "fonttools", needs: "woff2", argv: (c) => ["ttLib.woff2", "compress", c.inputs[0]!, "-o", c.output] },
    { tool: "woff2", stage: true, stageBase: "out", argv: (c) => [c.inputs[0]!] },
  ]),
  font("font-woff", "Make a WOFF web font", "A compressed font for websites.", "woff", "ttf otf woff2", [{
    tool: "fonttools", stage: true, argv: (c) => {
      const src = extOfPath(c.inputs[0]!) === "woff2" ? undefined : c.inputs[0]!;
      const ttf = nodePath.join(c.tmpDir("convert"), "font.ttf");
      return src ? ["subset", src, "--unicodes=*", "--glyphs=*", "--layout-features=*", "--name-IDs=*", "--notdef-outline", "--glyph-names", "--legacy-kern", "--flavor=woff", `--output-file=${c.output}`] : [[c.exe, "ttLib.woff2", "decompress", c.inputs[0]!, "-o", ttf], [c.exe, "subset", ttf, "--unicodes=*", "--glyphs=*", "--layout-features=*", "--name-IDs=*", "--notdef-outline", "--glyph-names", "--legacy-kern", "--flavor=woff", `--output-file=${c.output}`]];
    },
  }]),
  font("font-ttf", "Open a web font as a desktop font", "Turns a WOFF or WOFF2 file back into a font you can install.", "ttf", "woff woff2", [
    { tool: "fonttools", stage: true, argv: (c) => (extOfPath(c.inputs[0]!) === "woff2" ? ["ttLib.woff2", "decompress", c.inputs[0]!, "-o", c.output] : (() => { const ttx = nodePath.join(c.tmpDir("convert"), "font.ttx"); return [[c.exe, "ttx", "-q", "-o", ttx, c.inputs[0]!], [c.exe, "ttx", ...TTX_OUT, "-o", c.output, ttx]]; })()) },
    { tool: "woff2", stage: true, stageBase: "out", accepts: exts("woff2"), argv: (c) => [c.inputs[0]!], needs: undefined },
  ]),
];

export const ARCHIVE_TOOL_DEFS: ConvDef[] = [
  { id: "arc-extract", label: "Unpack into a folder", hint: "Opens a zip, tar.gz, tar.zst, 7z, RAR, ISO or DMG file into a new folder next to it.", group: "Archives", inputs: ARCHIVE_IN, out: "", suffix: "unpacked", mode: "each", outKind: "folder", engines: EXTRACT_ENGINES(), keywords: "extract unzip decompress open rar 7z iso dmg tar" },
  { id: "arc-list", label: "List what is inside", hint: "A text file with the names, sizes and dates of everything in the archive.", group: "Archives", inputs: ARCHIVE_IN, out: "txt", suffix: "contents", mode: "each", engines: [
    { tool: "bsdtar", accepts: exts("zip tar.gz tgz tar tar.bz2 tbz2 tar.xz txz tar.zst tzst 7z rar iso cab cpio lzh lha xar rpm"), stdoutIsOutput: true, argv: (c) => ["-t", "-v", "-f", c.inputs[0]!] },
    { tool: "sevenzip", stdoutIsOutput: true, argv: (c) => ["l", "-bd", "--", c.inputs[0]!] },
    { tool: "unar", program: "lsar", stdoutIsOutput: true, argv: (c) => ["-l", c.inputs[0]!] },
  ], outName: (n) => `${n.replace(/\.(tar\.(?:gz|bz2|xz|zst)|[^.]+)$/i, "")} (contents).txt`, keywords: "list contents view" },
  { id: "arc-7z", label: "Pack into a 7z archive", hint: "Strong compression; opens with 7-Zip.", group: "Archives", inputs: null, dirs: true, out: "7z", suffix: "archive", mode: "all", allName: "Archive", singleName: true, minFiles: 1, engines: [{
    tool: "sevenzip", cwdIsInputFolder: true, argv: (c) => ["a", "-t7z", "-y", "-bd", "-spd", "--", c.output, ...c.originals.map((p) => nodePath.basename(p))],
  }], checkFiles: (files) => (new Set(files.map((f) => nodePath.dirname(f))).size > 1 ? "Select items that are all in one folder." : null), keywords: "compress archive" },
  { id: "arc-decompress", label: "Open a compressed file (.xz, .bz2 …)", hint: "Takes a single file out of its compression.", group: "Archives", inputs: exts("xz bz2 lzma lz4 z"), out: "", suffix: "unpacked", mode: "each", engines: [
    { tool: "sevenzip", stage: true, stageBase: "out", outputExt: "", argv: (c) => ["e", "-y", "-bd", `-o${nodePath.dirname(c.output)}`, "--", c.inputs[0]!] },
    { tool: "unar", stage: true, stageBase: "out", outputExt: "", accepts: exts("xz bz2 lzma z"), argv: (c) => ["-q", "-D", "-o", nodePath.dirname(c.output), c.inputs[0]!] },
  ], outName: (n) => n.replace(/\.[^.]+$/, "") || `${n} (unpacked)`, keywords: "decompress xz bzip2" },
];
