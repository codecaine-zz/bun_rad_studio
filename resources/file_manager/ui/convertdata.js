// Plain functions for the "Convert & process" window: what the selected files are, how the list of things to make is
// searched and labelled. Nothing here touches the page, so it is easy to test.

/** The groups of the list, in the order they are shown. The server sends the same names. */
export const GROUP_ORDER = ["Pictures", "Video", "Sound", "Documents", "Data & text", "Archives", "PDF tools", "Ebooks", "Fonts", "Other"];

export const GROUP_BLURB = {
  Pictures: "Photos and drawings",
  Video: "Movies and screen recordings",
  Sound: "Music, voice and sound effects",
  Documents: "Word, web pages, text and scans",
  "Data & text": "Spreadsheets, settings files and plain text",
  Archives: "Zip files and other packs",
  "PDF tools": "Join, split, shrink and read PDF files",
  Ebooks: "Kindle and e-reader books",
  Fonts: "Fonts for the web and for your computer",
  Other: "Hidden details, Base64 and hex",
};

const KINDS = [
  ["picture", "pictures", "jpg jpeg png gif webp bmp tif tiff heic heif avif ico svg icns"],
  ["video", "videos", "mp4 mov mkv avi webm m4v wmv flv mpg mpeg 3gp ts"],
  ["sound file", "sound files", "mp3 wav flac aac m4a ogg opus wma aiff aif m4r"],
  ["subtitle file", "subtitle files", "srt vtt ass ssa"],
  ["PDF", "PDFs", "pdf"],
  ["spreadsheet", "spreadsheets", "xls xlsx xlsm ods csv tsv numbers"],
  ["Office document", "Office documents", "doc docx dot dotx odt rtf wps pages ppt pptx odp key"],
  ["e-book", "e-books", "epub mobi azw azw3 fb2"],
  ["data file", "data files", "json jsonc json5 yaml yml toml xml ndjson jsonl ini env properties plist sql"],
  ["text file", "text files", "txt md markdown log html htm tex rst org textile adoc"],
  ["archive", "archives", "zip tar tar.gz tar.bz2 tar.xz tar.zst gz tgz bz2 xz zst 7z rar iso dmg cab br"],
  ["font", "fonts", "ttf otf woff woff2"],
];
const KIND_BY_EXT = new Map(KINDS.flatMap(([one, many, list]) => list.split(" ").map((e) => [e, [one, many]])));

/** The lower-case extension without the dot; "a.tar.gz" gives "tar.gz". */
export function extensionOfName(name) {
  const lower = String(name).toLowerCase();
  const double = /\.(tar\.(?:gz|bz2|xz|zst))$/.exec(lower);
  if (double) return double[1];
  const dot = lower.lastIndexOf(".");
  return dot > 0 && dot < lower.length - 1 ? lower.slice(dot + 1) : "";
}

/**
 * "3 pictures, 1 video and 2 folders" for a list of `{ name, isDir }`.
 * @param {Array<{ name: string, isDir?: boolean }>} entries
 */
export function describeSelection(entries) {
  /** @type {Map<string, { one: string, many: string, n: number }>} */
  const counts = new Map();
  for (const e of entries) {
    const [one, many] = e.isDir ? ["folder", "folders"] : KIND_BY_EXT.get(extensionOfName(e.name)) ?? ["other file", "other files"];
    const c = counts.get(one) ?? { one, many, n: 0 };
    c.n++;
    counts.set(one, c);
  }
  const parts = [...counts.values()].map((c) => `${c.n} ${c.n === 1 ? c.one : c.many}`);
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** @param {Array<{ name: string, isDir?: boolean }>} entries */
export function extensionsOf(entries) {
  return [...new Set(entries.filter((e) => !e.isDir).map((e) => extensionOfName(e.name)))];
}

/**
 * The actions that match the words typed (every word must appear somewhere in the label, hint, group, file type or
 * keywords) and the chosen group ("" for all). Better matches (in the label) come first.
 * @param {Array<any>} actions
 */
export function searchActions(actions, query, group = "") {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  actions.forEach((a, index) => {
    if (group && a.group !== group) return;
    const label = a.label.toLowerCase();
    const rest = `${a.hint} ${a.group} ${a.out} ${a.keywords} ${a.engines.map((e) => e.name).join(" ")}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (label.startsWith(w) || label.includes(` ${w}`)) score += 3;
      else if (label.includes(w)) score += 2;
      else if (rest.includes(w)) score += 1;
      else return;
    }
    scored.push({ a, score, index });
  });
  if (!words.length) return scored.map((s) => s.a);
  return scored.sort((x, y) => y.score - x.score || x.index - y.index).map((s) => s.a);
}

/** Splits actions into the groups, in order, dropping empty ones. */
export function groupActions(actions, order = GROUP_ORDER) {
  return order.map((group) => ({ group, items: actions.filter((a) => a.group === group) })).filter((g) => g.items.length);
}

/**
 * The little label that says what an action needs.
 * @param {any} action @param {Record<string, string>} toolNames  tool id -> plain name
 */
export function badgeFor(action, toolNames) {
  if (action.available) {
    const used = action.engines.find((e) => e.usable);
    if (!used || used.tool === "builtin") return { kind: "builtin", text: "Built in" };
    return { kind: "tool", text: `Uses ${used.name}` };
  }
  const names = (action.installTools ?? []).map((id) => toolNames[id] ?? id);
  return names.length ? { kind: "missing", text: `Needs ${names.join(" and ")}` } : { kind: "missing", text: "Not available" };
}

/** One sentence about how many new files you get. */
export function modeText(action, selectedCount) {
  const n = action.count ?? selectedCount;
  const what = action.outKind === "folder" ? "folder" : "file";
  if (action.mode === "all") return `One new ${what} is made from all ${n} selected items together.`;
  if (n === 1) return `One new ${what} is made.`;
  return `A new ${what} is made for each of the ${n} selected items.`;
}

/** Should this option be shown, given the extensions of the selected files? */
export function optionApplies(option, exts) {
  return !option.forExts || option.forExts.some((e) => exts.includes(e));
}

/** The line for one item of the preview. */
export function previewLine(item) {
  const from = item.from.length === 1 ? item.from[0] : `${item.from.length} items`;
  return `${from} → ${item.to}`;
}

/** The size of a quality-like number option allows a slider. */
export function wantsSlider(option) {
  return option.kind === "number" && option.max !== undefined && option.min !== undefined && option.max - option.min <= 120;
}
