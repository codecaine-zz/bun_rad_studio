/**
 * The catalog of built-in conversions: data formats, text, Base64 and hex, and the archive work that needs no
 * program. All of them run in a worker (see fmConvBuiltin.ts) and need nothing installed.
 */
import { choiceOpt, exts, numberOpt, textOpt, toggleOpt, type ConvDef, type Engine } from "./fmConvTypes";
import type { OptionDef } from "./fmConvOptions";

const STRUCT = "json jsonc json5 yaml yml toml csv tsv tab xml ndjson jsonl ini env properties plist xlsx xlsm ods";
const TABLE_EXTRA = "md markdown html htm sql";
const DATA_STRUCT = exts(STRUCT);
const DATA_ALL = exts(`${STRUCT} ${TABLE_EXTRA}`);

export const TEXT_EXTENSIONS = exts(
  "txt log md markdown csv tsv tab json jsonc json5 yaml yml toml xml ini env properties html htm css js mjs ts jsx tsx c h cpp hpp cs java kt py rb go rs php sh bat cmd ps1 sql srt vtt ass ssa lrc tex rst org textile adoc svg plist conf cfg",
);

const builtin = (kind: string, params: Record<string, string | number | boolean> = {}, extra: Partial<Engine> = {}): Engine => ({ tool: "builtin", builtin: { kind, params }, ...extra });

// Options of the data converters; each says which kinds of file it matters for.
const HEADER: OptionDef = { ...toggleOpt("header", "The first row has the column names", "Turn this off when the first row is already data.", true), forExts: ["csv", "tsv", "tab", "xlsx", "xlsm", "ods", "html", "htm"] };
const TYPES: OptionDef = { ...toggleOpt("types", "Turn numbers and true/false into real numbers and booleans", "Only when nothing is lost: 007 and 1.50 stay as text.", true), forExts: ["csv", "tsv", "tab", "ini", "env", "properties", "md", "markdown", "html", "htm"] };
const UNFLATTEN: OptionDef = { ...toggleOpt("unflatten", "Turn dotted names (a.b.c) into nested data", "Rebuilds nested data from names like address.city.", false), forExts: ["csv", "tsv", "tab", "env", "properties", "ini"] };
const DELIMITER_IN: OptionDef = { ...choiceOpt("delimiter", "Separator in the CSV file", "Usually found automatically.", [["auto", "Find it automatically"], [",", "Comma ,"], [";", "Semicolon ;"], ["\t", "Tab"], ["|", "Pipe |"]], "auto"), forExts: ["csv"] };
const SHEET: OptionDef = { ...choiceOpt("sheet", "Spreadsheets with several sheets", "", [["first", "Only the first sheet"], ["all", "Every sheet (one entry for each)"]], "first"), forExts: ["xlsx", "xlsm", "ods"] };
const FLATTEN = toggleOpt("flatten", "Flatten nested data into columns", "Nested data becomes columns with dotted names (address.city). Turn off to keep it as text in one cell.", true);
const INDENT = choiceOpt("indent", "Layout", "", [["2", "Indented with 2 spaces"], ["4", "Indented with 4 spaces"]], "2");

const READ_OPTIONS: OptionDef[] = [DELIMITER_IN, HEADER, TYPES, UNFLATTEN, SHEET];

function target(id: string, label: string, hint: string, out: string, inputs: Set<string>, options: OptionDef[], extra: Partial<ConvDef> = {}): ConvDef {
  return { id, label, hint, group: "Data & text", inputs, out, suffix: "converted", mode: "each", rejectSame: true, engines: [builtin("data", { to: out === "md" ? "markdown" : out })], options: [...READ_OPTIONS, ...options], ...extra };
}

export const DATA_DEFS: ConvDef[] = [
  target("data-json", "Convert to JSON", "The data format of the web.", "json", DATA_ALL, [INDENT], { keywords: "json5 jsonc yaml csv" }),
  target("data-yaml", "Convert to YAML", "A readable format for settings files.", "yaml", DATA_ALL, []),
  target("data-toml", "Convert to TOML", "A simple format for settings files. Empty values (null) are left out.", "toml", DATA_STRUCT, []),
  target("data-csv", "Make a spreadsheet file (CSV)", "Opens in Excel, Numbers and Google Sheets.", "csv", DATA_ALL, [
    FLATTEN,
    choiceOpt("delimiter", "Separator to write", "Some countries use a semicolon.", [[",", "Comma ,"], [";", "Semicolon ;"], ["\t", "Tab"], ["|", "Pipe |"]], ","),
    toggleOpt("bom", "Add a mark so Excel shows accents correctly", "Recommended when the file has accents or non-English letters and will be opened in Excel.", false),
  ], { keywords: "excel table comma separated" }),
  target("data-tsv", "Convert to TSV (tab-separated)", "Like CSV but with tabs between the values.", "tsv", DATA_ALL, [FLATTEN]),
  target("data-xlsx", "Make a spreadsheet (XLSX)", "A real Excel file with a frozen header row.", "xlsx", DATA_ALL, [FLATTEN, textOpt("sheetName", "Sheet name", "Empty uses the file name.", "", 31)], { engines: [builtin("to-xlsx")], keywords: "excel table" }),
  target("data-xml", "Convert to XML", "A markup format used by many programs.", "xml", DATA_STRUCT, [{ ...textOpt("rootName", "Name of the main element", "", "root", 60), kind: "name" }]),
  target("data-ndjson", "Convert to JSON Lines (.ndjson)", "One JSON item on each line, good for logs and big lists.", "ndjson", DATA_ALL, []),
  target("data-ini", "Convert to INI", "Settings in [sections].", "ini", DATA_STRUCT, []),
  target("data-env", "Convert to .env", "NAME=value lines for apps and servers. Nested names are joined with _.", "env", DATA_STRUCT, []),
  target("data-properties", "Convert to .properties", "The settings format of Java programs. Non-English letters are written as \\u escapes.", "properties", DATA_STRUCT, []),
  target("data-md", "Make a Markdown table", "A table you can paste into a document or a web page.", "md", DATA_ALL, [FLATTEN], { keywords: "github readme table" }),
  target("data-html", "Make an HTML table", "A web page with the table.", "html", DATA_ALL, [FLATTEN], { keywords: "web table page" }),
  target("data-sql", "Make SQL INSERT statements", "Ready to run in a database.", "sql", DATA_ALL, [
    FLATTEN,
    { ...textOpt("tableName", "Table name", "", "data", 60), kind: "name" },
    choiceOpt("dialect", "Database", "", [["ansi", "Standard SQL, PostgreSQL, SQLite"], ["mysql", "MySQL and MariaDB"], ["sqlserver", "SQL Server"]], "ansi"),
    toggleOpt("createTable", "Also write the CREATE TABLE statement", "", false),
  ], { keywords: "database insert" }),
  target("data-plist", "Convert to a property list (plist)", "The settings format of macOS and iOS apps.", "plist", DATA_STRUCT, []),
  { ...target("data-json-pretty", "Make the JSON easy to read", "Adds line breaks and indentation. Comments in JSONC and JSON5 files are removed.", "json", exts("json jsonc json5"), [INDENT]), suffix: "pretty", rejectSame: false },
  { ...target("data-json-min", "Make the JSON as small as possible", "Removes the spaces and line breaks.", "json", exts("json jsonc json5 yaml yml toml"), []), suffix: "minified", rejectSame: false, engines: [builtin("data", { to: "json", indent: 0 })], options: [] },
  { ...target("data-json-sorted", "Sort the keys of the JSON alphabetically", "Makes two JSON files easy to compare.", "json", exts("json jsonc json5"), [INDENT]), suffix: "sorted", rejectSame: false, engines: [builtin("data", { to: "json", sortKeys: true })] },
  { id: "sheet-csv-all", label: "Spreadsheet to CSV, one file for each sheet", hint: "A new folder with a CSV file for every sheet.", group: "Data & text", inputs: exts("xlsx xlsm ods"), out: "", suffix: "sheets", mode: "each", outKind: "folder", engines: [builtin("sheet-folder", { to: "csv" })], options: [HEADER, toggleOpt("bom", "Add a mark so Excel shows accents correctly", "", false)], keywords: "excel sheets tabs" },
];

const textTool = (id: string, label: string, hint: string, kind: string, params: Record<string, string | number | boolean>, suffix: string, options: OptionDef[] = [], extra: Partial<ConvDef> = {}): ConvDef => ({
  id, label, hint, group: "Data & text", inputs: TEXT_EXTENSIONS, out: "", suffix, mode: "each", engines: [builtin(kind, params)], options, ...extra,
});

const ENCODING_CHOICES: Array<[string, string]> = [
  ["utf-8", "UTF-8 (the usual one)"], ["utf-8-bom", "UTF-8 with a byte-order mark (Excel and Notepad like it)"], ["utf-16le", "UTF-16 little-endian (Windows \"Unicode\")"], ["utf-16be", "UTF-16 big-endian"],
  ["windows-1252", "Windows-1252 (Western European)"], ["iso-8859-1", "ISO-8859-1 (Latin-1)"], ["iso-8859-15", "ISO-8859-15 (Latin-9, with the euro sign)"], ["windows-1250", "Windows-1250 (Central European)"],
  ["windows-1251", "Windows-1251 (Cyrillic)"], ["koi8-r", "KOI8-R (Russian)"], ["macintosh", "Mac Roman (old Macs)"], ["shift_jis", "Shift_JIS (Japanese)"], ["euc-jp", "EUC-JP (Japanese)"],
  ["gbk", "GBK (Simplified Chinese)"], ["big5", "Big5 (Traditional Chinese)"], ["euc-kr", "EUC-KR (Korean)"],
];

export const TEXT_DEFS: ConvDef[] = [
  textTool("text-encoding", "Change the text encoding", "Fixes accents that look wrong, or saves the file in another encoding.", "encoding", {}, "re-encoded", [
    choiceOpt("from", "Read it as", "Automatic looks at the file: a mark at the start, or whether it is valid UTF-8.", [["auto", "Find it automatically"], ...ENCODING_CHOICES, ["gb18030", "GB18030 (Chinese)"]], "auto"),
    choiceOpt("to", "Save it as", "", ENCODING_CHOICES, "utf-8"),
    choiceOpt("bad", "If something can't be converted", "", [["stop", "Stop and tell me (nothing is saved)"], ["replace", "Replace it with ? and carry on"]], "stop"),
  ], { keywords: "utf-8 utf8 utf-16 latin1 windows-1252 shift_jis gbk big5 charset bom accents mojibake" }),
  textTool("text-eol-lf", "Use Unix line endings (LF)", "For Mac, Linux and most programming tools.", "eol", { to: "lf" }, "LF", [], { keywords: "newline line breaks" }),
  textTool("text-eol-crlf", "Use Windows line endings (CRLF)", "For Windows programs such as Notepad.", "eol", { to: "crlf" }, "CRLF", [], { keywords: "newline line breaks" }),
  textTool("text-eol-cr", "Use old Mac line endings (CR)", "Only for very old programs.", "eol", { to: "cr" }, "CR", [], { keywords: "newline line breaks" }),
  textTool("text-tabs-spaces", "Change tabs into spaces", "Each tab becomes the right number of spaces.", "tabs-to-spaces", {}, "spaces", [numberOpt("width", "Spaces for a tab", "", 1, 16, 4)]),
  textTool("text-spaces-tabs", "Change leading spaces into tabs", "Indentation made of spaces becomes tabs.", "spaces-to-tabs", {}, "tabs", [numberOpt("width", "Spaces for a tab", "", 1, 16, 4)]),
  textTool("text-trim", "Remove spaces at the end of lines", "Cleans trailing spaces and tabs.", "trim-trailing", {}, "trimmed"),
  textTool("text-diacritics", "Remove or change accents (diacritics)", "Turns é into e, or fixes accents stored as a letter plus a separate mark.", "diacritics", {}, "no accents", [
    choiceOpt("mode", "What to do", "Only Latin and Greek letters lose their marks; Cyrillic, Japanese, Korean and Indian scripts are left as they are.", [
      ["remove", "Remove the accents (é becomes e)"],
      ["compose", "Join letter and accent into one character (fixes text from older Macs)"],
      ["decompose", "Split into a letter and a separate accent (UTF-8 and UTF-16 only)"],
    ], "remove"),
    choiceOpt("from", "Read it as", "Automatic works for UTF-8 and UTF-16 files. For an older encoding choose it here.", [["auto", "UTF-8 or UTF-16 (found automatically)"], ...ENCODING_CHOICES, ["gb18030", "GB18030 (Chinese)"]], "auto"),
    toggleOpt("letters", "Also spell out ß, æ, ø, đ, ł and similar as plain letters", "Only when removing: ß becomes ss, æ becomes ae, ø becomes o.", true),
  ], { keywords: "accent accents diacritic diacritics umlaut cedilla tilde ascii normalize unicode nfc nfd latin strip" }),
  textTool("text-strip-bom", "Remove the byte-order mark (BOM)", "Some programs show strange characters at the start of a UTF-8 file with a mark.", "strip-bom", {}, "no BOM", [], { keywords: "utf-8 bom" }),
  { id: "text-html", label: "Make a web page from plain text", hint: "Keeps the text exactly as typed.", group: "Data & text", inputs: exts("txt log"), out: "html", suffix: "page", mode: "each", engines: [builtin("text-html")], options: [choiceOpt("layout", "Layout", "", [["pre", "Keep the line breaks and spacing"], ["paragraphs", "Paragraphs (a blank line starts a new one)"]], "pre")] },
  { id: "code-ts-js", label: "Make JavaScript from TypeScript or JSX", hint: "Removes the types (and turns JSX into plain calls) so any browser or Node can run the file. It does not check types or bundle other files.", group: "Data & text", inputs: exts("ts tsx jsx mts cts"), out: "js", suffix: "js", mode: "each",
    engines: [builtin("transpile")],
    options: [
      choiceOpt("target", "Made for", "Where the code will run. The result is the same for most code. For Bun, non-English letters inside text are written as \\u escapes (the same text, but not readable in the file).", [["browser", "A web browser"], ["bun", "Bun"], ["node", "Node.js"]], "browser"),
      { ...choiceOpt("jsx", "JSX style", "How JSX tags are written as code. React needs React in scope; Preact needs its h and Fragment.", [["react", "React (React.createElement)"], ["preact", "Preact (h and Fragment)"]], "react"), forExts: ["tsx", "jsx"] },
      toggleOpt("minifyWhitespace", "Remove spaces and line breaks", "Makes the file smaller and harder to read.", false),
      toggleOpt("minifyIdentifiers", "Shorten the names of local variables", "Makes the file smaller and harder to read. Names that other files use are kept.", false),
      toggleOpt("minifySyntax", "Simplify the code where possible", "Rewrites things like if/else into shorter forms.", false),
    ],
    outName: (n) => n.replace(/\.(ts|tsx|jsx)$/i, ".js").replace(/\.mts$/i, ".mjs").replace(/\.cts$/i, ".cjs"), keywords: "typescript javascript tsx jsx transpile compile ts js bun" },
  { id: "file-to-base64", label: "Encode as Base64 text", hint: "Any file as plain text letters and digits (for emails and web pages).", group: "Other", inputs: null, out: "b64", suffix: "base64", mode: "each", engines: [builtin("base64-encode")], options: [choiceOpt("wrap", "Line length", "", [["76", "Lines of 76 characters"], ["64", "Lines of 64 characters"], ["0", "One long line"]], "76")], outName: (n) => `${n}.b64`, keywords: "base64 encode data uri" },
  { id: "base64-to-file", label: "Decode Base64 text back into a file", hint: "Turns Base64 text (or a data: link) into the original file.", group: "Other", inputs: exts("b64 base64 txt"), out: "", suffix: "decoded", mode: "each", engines: [builtin("base64-decode")], outName: (n) => (/\.(b64|base64)$/i.test(n) ? n.replace(/\.(b64|base64)$/i, "") || "decoded" : `${n.replace(/\.[^.]*$/, "")} (decoded)`), keywords: "base64 decode" },
  { id: "file-to-hex", label: "Show as hex text", hint: "Any file as hexadecimal digits.", group: "Other", inputs: null, out: "hex", suffix: "hex", mode: "each", engines: [builtin("hex-encode")], options: [choiceOpt("style", "Layout", "", [["spaced", "Bytes separated by spaces"], ["plain", "One unbroken line"]], "spaced"), toggleOpt("upper", "Capital letters", "", false)], outName: (n) => `${n}.hex`, keywords: "hexadecimal dump" },
  { id: "hex-to-file", label: "Turn hex text back into a file", hint: "Reads hexadecimal digits (spaces and 0x are fine) and writes the bytes.", group: "Other", inputs: exts("hex txt"), out: "", suffix: "decoded", mode: "each", engines: [builtin("hex-decode")], outName: (n) => (/\.hex$/i.test(n) ? n.replace(/\.hex$/i, "") || "decoded" : `${n.replace(/\.[^.]*$/, "")} (decoded)`), keywords: "hexadecimal" },
];

const GZIP_LEVEL = numberOpt("level", "Compression level (1 is fastest, 9 is smallest)", "Higher squeezes more but takes longer. 6 is the usual balance.", 1, 9, 6);
const ZSTD_LEVEL = numberOpt("level", "Compression level (1 is fastest, 19 is smallest)", "Higher squeezes more but takes longer and needs more memory. 3 is the usual balance; 19 is for files you will keep for a long time.", 1, 19, 3);

export const ARCHIVE_BUILTIN_DEFS: ConvDef[] = [
  { id: "arc-zip", label: "Zip into one .zip file", hint: "Works for files and folders. Nothing to install.", group: "Archives", inputs: null, dirs: true, out: "zip", suffix: "zipped", mode: "all", allName: "Archive", singleName: true, minFiles: 1, engines: [builtin("zip-create")], keywords: "compress archive zip" },
  { id: "arc-targz", label: "Pack into a .tar.gz file", hint: "The usual archive on Linux and Mac. Works for files and folders.", group: "Archives", inputs: null, dirs: true, out: "tar.gz", suffix: "packed", mode: "all", allName: "Archive", singleName: true, minFiles: 1, engines: [builtin("targz-create")], options: [GZIP_LEVEL], keywords: "compress archive tar tgz" },
  { id: "arc-tarzst", label: "Pack into a .tar.zst file", hint: "Like .tar.gz but faster and smaller, using Zstandard. Works for files and folders. Nothing to install.", group: "Archives", inputs: null, dirs: true, out: "tar.zst", suffix: "packed", mode: "all", allName: "Archive", singleName: true, minFiles: 1, engines: [builtin("tarzst-create")], options: [ZSTD_LEVEL], keywords: "compress archive tar zstd zst" },
  { id: "arc-zip-to-targz", label: "Turn a zip file into a .tar.gz", hint: "Converts without unpacking to disk.", group: "Archives", inputs: exts("zip"), out: "tar.gz", suffix: "converted", mode: "each", engines: [builtin("zip-to-targz")], keywords: "convert zip tar" },
  { id: "arc-targz-to-zip", label: "Turn a .tar.gz or .tar.zst file into a zip", hint: "Converts without unpacking to disk.", group: "Archives", inputs: exts("tar.gz tgz tar tar.zst tzst"), out: "zip", suffix: "converted", mode: "each", engines: [builtin("targz-to-zip")], keywords: "convert zip tar" },
  { id: "arc-gzip", label: "Compress with gzip (.gz)", hint: "Squeezes one file.", group: "Archives", inputs: null, out: "gz", suffix: "gzipped", mode: "each", engines: [builtin("gzip")], options: [GZIP_LEVEL], outName: (n) => `${n}.gz`, keywords: "compress gz" },
  { id: "arc-gunzip", label: "Open a .gz file", hint: "Takes a single file out of its gzip compression.", group: "Archives", inputs: exts("gz"), out: "", suffix: "unpacked", mode: "each", engines: [builtin("gunzip")], outName: (n) => n.replace(/\.gz$/i, "") || `${n} (unpacked)`, keywords: "decompress gunzip" },
  { id: "arc-zstd", label: "Compress with Zstandard (.zst)", hint: "Squeezes one file quickly and well. Big files are fine: they are read in small pieces.", group: "Archives", inputs: null, out: "zst", suffix: "compressed", mode: "each", engines: [builtin("zstd")], options: [ZSTD_LEVEL], outName: (n) => `${n}.zst`, keywords: "compress zstd zst", note: "A .zst file opens with this tool, 7-Zip, bsdtar and the zstd program." },
  { id: "arc-unzstd", label: "Open a .zst file", hint: "Takes a single file out of its Zstandard compression, with nothing to install.", group: "Archives", inputs: exts("zst"), out: "", suffix: "unpacked", mode: "each", engines: [builtin("unzstd")], outName: (n) => n.replace(/\.zst$/i, "") || `${n} (unpacked)`, keywords: "decompress unzstd zstd zst" },
  { id: "arc-brotli", label: "Compress with Brotli (.br)", hint: "Squeezes one file a little more than gzip. Used by websites.", group: "Archives", inputs: null, out: "br", suffix: "compressed", mode: "each", engines: [builtin("brotli")], outName: (n) => `${n}.br`, keywords: "compress brotli" },
  { id: "arc-unbrotli", label: "Open a .br file", hint: "Takes a single file out of its Brotli compression.", group: "Archives", inputs: exts("br"), out: "", suffix: "unpacked", mode: "each", engines: [builtin("unbrotli")], outName: (n) => n.replace(/\.br$/i, "") || `${n} (unpacked)`, keywords: "decompress brotli" },
];
