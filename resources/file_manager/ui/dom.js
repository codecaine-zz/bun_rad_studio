// Small DOM helpers. File names and paths come from disk and are untrusted, so the page never builds HTML from
// them: text always goes in through textContent (the h() helper does this for you).

export function quietInput(el) {
  for (const [key, value] of Object.entries({ spellcheck: "false", autocomplete: "off", autocorrect: "off", autocapitalize: "off" })) {
    el.setAttribute(key, value);
  }
}

/**
 * Creates an element. `attrs`: class, text, dataset, aria-* / other attributes, boolean flags, and on<event> handlers.
 * `children` may be strings, nodes, arrays or null.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  if (tag === "input" || tag === "textarea") quietInput(el);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** @param {string} selector @param {ParentNode} [root] */
export const $ = (selector, root = document) => root.querySelector(selector);

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** Tells screen readers something (also useful as a quiet log). */
export function announce(message) {
  const live = $("#live");
  if (!live) return;
  live.textContent = "";
  setTimeout(() => (live.textContent = message), 30);
}
export const say = announce;

const ICONS = [
  ["🖼️", "png jpg jpeg gif webp bmp svg ico tif tiff heic avif raw psd", "image"],
  ["🎞️", "mp4 mov mkv avi webm wmv flv m4v mpg mpeg", "video"],
  ["🎵", "mp3 wav flac aac ogg m4a wma opus aiff mid midi", "audio"],
  ["📕", "pdf", "pdf"],
  ["📄", "doc docx odt rtf pages epub mobi", "doc"],
  ["📊", "xls xlsx ods csv tsv numbers", "sheet"],
  ["📽️", "ppt pptx odp key", "slide"],
  ["🗜️", "zip rar 7z tar gz tgz bz2 xz zst cab iso", "archive"],
  ["💻", "js mjs cjs ts tsx jsx py rb go rs java kt swift c h cpp hpp cs php html htm css scss json xml yaml yml toml sql lua dart vue svelte ps1 bat cmd sh bash zsh v vsh vv zig nim ex exs erl hs ml clj scala groovy r jl pl pm fs fsx vb asm s m mm cc cxx hh hxx mts cts jsonc less sass graphql proto cmake gradle tf sol wat fish ksh", "code"],
  ["📝", "txt md markdown log ini cfg conf env rst tex nfo", "text"],
  ["⚙️", "exe msi app command jar apk appimage scr com run vbs deb rpm pkg", "exec"],
  ["💿", "dmg img vhd vmdk", "disk"],
  ["🔤", "ttf otf woff woff2 eot", "font"],
];
const ICON_BY_EXT = new Map(ICONS.flatMap(([icon, exts]) => exts.split(" ").map((e) => [e, icon])));
const KIND_BY_EXT = new Map(ICONS.flatMap(([, exts, kind]) => exts.split(" ").map((e) => [e, kind])));

export const ICON_PACK_GLYPHS = {
  default: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "🗜️", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📃",
  },
  macos_tahoe_3d: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "🖼️", archive: "📦", code: "🧑‍💻", text: "🗒️", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄",
    topics: { pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "💠", "3d": "🧊", docs: "📚", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️" },
  },
  win11_fluent_pro: {
    folder: "🗂️", image: "🖼️", video: "📽️", audio: "🎵", pdf: "📕", doc: "📃",
    sheet: "📈", slide: "📊", archive: "🧳", code: "💻", text: "📝", exec: "⚡",
    disk: "💽", font: "🔤", file: "📄",
    topics: { pictures: "🖼️", video: "📽️", videos: "📽️", music: "🎵", code: "💻", "3d": "🧊", docs: "🗂️", downloads: "⬇️", archive: "🧳", cloud: "☁️", database: "🛢️" },
  },
  pro_studio_xdr: {
    folder: "🗄️", image: "📸", video: "🎞️", audio: "🎚️", pdf: "📋", doc: "📑",
    sheet: "📐", slide: "🖥️", archive: "🧰", code: "⚡", text: "🗒️", exec: "🎛️",
    disk: "💽", font: "🔡", file: "📄",
    topics: { pictures: "📸", video: "🎞️", videos: "🎞️", music: "🎚️", code: "⚡", "3d": "🧊", docs: "📑", downloads: "📡", archive: "🧰", cloud: "🛰️", database: "🗄️" },
  },
  hdr_photo_studio: {
    folder: "📸", image: "🖼️", video: "🎥", audio: "🎙️", pdf: "🎞️", doc: "🖼️",
    sheet: "🎨", slide: "📽️", archive: "🎞️", code: "✨", text: "📝", exec: "🎬",
    disk: "💿", font: "🔤", file: "🖼️",
    topics: { pictures: "📸", video: "🎥", videos: "🎥", music: "🎙️", code: "✨", "3d": "🧊", docs: "🖼️", downloads: "📥", archive: "🎞️", cloud: "☁️", database: "🗄️" },
  },
  linux_papirus_pro: {
    folder: "📂", image: "🖼️", video: "🎞️", audio: "🎶", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "🐧", text: "📝", exec: "⚙️",
    disk: "💽", font: "🔤", file: "📃",
    topics: { pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎶", code: "🐧", "3d": "🧊", docs: "📚", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️" },
  },
  nordic_minimal: {
    folder: "📁", image: "🎨", video: "🎞️", audio: "🎵", pdf: "📓", doc: "📄",
    sheet: "📊", slide: "🖼️", archive: "📦", code: "🧩", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📃",
    topics: { pictures: "🎨", video: "🎞️", videos: "🎞️", music: "🎵", code: "🧩", "3d": "🧊", docs: "📓", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️" },
  },
  inferno: {
    folder: "🔥", image: "🌅", video: "🎬", audio: "🎸", pdf: "📜", doc: "🏮",
    sheet: "📈", slide: "🎆", archive: "💣", code: "⚡", text: "🕯️", exec: "☄️",
    disk: "🌋", font: "🔱", file: "🧨",
  },
  slime: {
    folder: "🧪", image: "🦠", video: "👁️", audio: "🫧", pdf: "🧫", doc: "📋",
    sheet: "🧬", slide: "🔬", archive: "🛢️", code: "🧬", text: "🧪", exec: "☣️",
    disk: "🟢", font: "🦠", file: "💧",
  },
  storm_tempest: {
    folder: "🌪️", image: "🌈", video: "🌩️", audio: "🌬️", pdf: "⚡", doc: "🍃",
    sheet: "🧭", slide: "⛈️", archive: "🌊", code: "⚡", text: "🍂", exec: "🌀",
    disk: "🛟", font: "💨", file: "🌧️",
  },
  neon_cyber: {
    folder: "💠", image: "🔮", video: "📡", audio: "🎛️", pdf: "🪪", doc: "📟",
    sheet: "📉", slide: "🛰️", archive: "🧊", code: "⚡", text: "💾", exec: "🚀",
    disk: "💽", font: "🔣", file: "🔹",
  },
  liquid_gems: {
    folder: "💎", image: "🔮", video: "🪩", audio: "🎐", pdf: "👑", doc: "💠",
    sheet: "✨", slide: "🌟", archive: "💍", code: "🔷", text: "🫧", exec: "⚜️",
    disk: "💿", font: "💠", file: "🔹",
  },
  cryo_crystal: {
    folder: "🧊", image: "❄️", video: "🏔️", audio: "🎐", pdf: "🌨️", doc: "📃",
    sheet: "🧊", slide: "🌌", archive: "🏔️", code: "❄️", text: "🌬️", exec: "⛷️",
    disk: "💿", font: "❄️", file: "🧊",
  },
  retro_pixel: {
    folder: "👾", image: "🎨", video: "📺", audio: "📻", pdf: "📕", doc: "📜",
    sheet: "🧮", slide: "🕹️", archive: "📦", code: "🕹️", text: "📟", exec: "🪙",
    disk: "💾", font: "🔤", file: "📼",
  },
  xenotech_2126: {
    folder: "🛸", image: "🌌", video: "🪐", audio: "〰️", pdf: "🧿", doc: "📡",
    sheet: "⚛️", slide: "🔭", archive: "🕳️", code: "⚛️", text: "🧬", exec: "🚀",
    disk: "🪐", font: "🔯", file: "✨",
  },
  psychedelic_trip: {
    folder: "🍄", image: "🌈", video: "🔮", audio: "🎶", pdf: "🧿", doc: "📜",
    sheet: "🦋", slide: "🪷", archive: "🪐", code: "🧬", text: "✨", exec: "🚀",
    disk: "💿", font: "🔯", file: "🌸",
    topics: { pictures: "🌈", video: "🔮", videos: "🔮", music: "🎶", code: "🧬", "3d": "🪷", docs: "🧿", downloads: "🦋", archive: "🪐", cloud: "☁️", database: "🍄" },
  },
  lava_groovy: {
    folder: "🫧", image: "🌻", video: "🪩", audio: "🎸", pdf: "☮️", doc: "🌺",
    sheet: "🌈", slide: "🪩", archive: "🧳", code: "⚡", text: "✌️", exec: "🚀",
    disk: "💿", font: "🔤", file: "🌼",
    topics: { pictures: "🌻", video: "🪩", videos: "🪩", music: "🎸", code: "⚡", "3d": "🫧", docs: "☮️", downloads: "🌈", archive: "🧳", cloud: "☁️", database: "🪩" },
  },
  op_art_illusion: {
    folder: "🌀", image: "👁️", video: "🎞️", audio: "〰️", pdf: "💠", doc: "📐",
    sheet: "📊", slide: "🔮", archive: "🧊", code: "♾️", text: "📝", exec: "⚡",
    disk: "💿", font: "🔣", file: "🔹",
    topics: { pictures: "👁️", video: "🌀", videos: "🌀", music: "〰️", code: "♾️", "3d": "🧊", docs: "📐", downloads: "💠", archive: "🧊", cloud: "🌀", database: "🔮" },
  },
};
ICON_PACK_GLYPHS.inferno_burn = ICON_PACK_GLYPHS.inferno;
ICON_PACK_GLYPHS.bio_slime = ICON_PACK_GLYPHS.slime;
ICON_PACK_GLYPHS.storm_weather = ICON_PACK_GLYPHS.storm_tempest;
ICON_PACK_GLYPHS.liquid_chrome = ICON_PACK_GLYPHS.liquid_gems;
ICON_PACK_GLYPHS.arcane_glyphs = ICON_PACK_GLYPHS.xenotech_2126;

/** Classifies a folder's semantic purpose (pictures, video, music, code, 3d, docs, downloads, database, cloud, archive) for high-end 3D folder badges. */
export function classifyFolderTopic(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "general";
  if (/(?:^|[\s_.-])(3d|blender|maya|zbrush|cinema4d|houdini|cad|meshes|models|rigging)(?:$|[\s_.-])/.test(n)) return "3d";
  if (/(?:^|[\s_.-])(pictures?|photos?|images?|img|wallpapers?|screenshots?|camera|raw|renders?|gallery|art|icons?|avatars?|thumbnails?|lightroom)(?:$|[\s_.-])/.test(n)) return "pictures";
  if (/(?:^|[\s_.-])(videos?|movies?|films?|clips?|footage|cinema|recordings?|captures?)(?:$|[\s_.-])/.test(n)) return "video";
  if (/(?:^|[\s_.-])(music|audio|sounds?|podcasts?|tracks?|stems?|samples?|sfx)(?:$|[\s_.-])/.test(n)) return "music";
  if (/(?:^|[\s_.-])(src|lib|app|components|scripts|packages|server|client|api|hooks|utils|tests|test|__tests__|spec|bin|\.git|\.github)(?:$|[\s_.-])/.test(n)) return "code";
  if (/(?:^|[\s_.-])(docs?|documentation|notes|guides|manuals|papers|books|wiki|readme)(?:$|[\s_.-])/.test(n)) return "docs";
  if (/(?:^|[\s_.-])(downloads?|inbox|incoming|temp|tmp)(?:$|[\s_.-])/.test(n)) return "downloads";
  if (/(?:^|[\s_.-])(db|databases?|sql|migrations|data|prisma|seeds)(?:$|[\s_.-])/.test(n)) return "database";
  if (/(?:^|[\s_.-])(cloud|sync|icloud|dropbox|drive|onedrive|shared)(?:$|[\s_.-])/.test(n)) return "cloud";
  if (/(?:^|[\s_.-])(archives?|backups?|dist|build|out|releases?|vendor|node_modules)(?:$|[\s_.-])/.test(n)) return "archive";
  return "general";
}

export function classifyIconKind(name, isDir) {
  if (isDir) return "folder";
  const s = String(name || "");
  const dot = s.lastIndexOf(".");
  const ext = dot > 0 ? s.slice(dot + 1).toLowerCase() : "";
  return KIND_BY_EXT.get(ext) ?? "file";
}

export function activeIconPackStyle() {
  try {
    const p = typeof document !== "undefined" ? document.documentElement?.dataset?.iconPack : "";
    return p && ICON_PACK_GLYPHS[p] ? p : "default";
  } catch {
    return "default";
  }
}

/** A picture-word for a file name, for places (like the Recycle Bin) where the server didn't classify it, or when a custom Icon Pack is active. */
export function iconFor(name, isDir, packOverride, kindHint) {
  const pack = packOverride && ICON_PACK_GLYPHS[packOverride] ? packOverride : activeIconPackStyle();
  if (pack !== "default") {
    const def = ICON_PACK_GLYPHS[pack];
    if (isDir && def?.topics) {
      const topic = classifyFolderTopic(name);
      if (topic !== "general" && def.topics[topic]) return def.topics[topic];
    }
    const kind = isDir ? "folder" : (kindHint && def?.[kindHint] ? kindHint : classifyIconKind(name, false));
    return def?.[kind] ?? def?.file ?? "📁";
  }
  if (isDir) return "📁";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return ICON_BY_EXT.get(ext) ?? "📃";
}

/** Resolves the display icon for a File Manager entry, respecting custom Icon Pack styles when active. */
export function iconForEntry(entry, packOverride) {
  const isDir = Boolean(entry?.isDir || entry?.isDirectory);
  const pack = packOverride && ICON_PACK_GLYPHS[packOverride] ? packOverride : activeIconPackStyle();
  if (pack !== "default") {
    return iconFor(entry?.name || "", isDir, pack, entry?.kind);
  }
  return entry?.icon || iconFor(entry?.name || "", isDir, "default", entry?.kind);
}
export const entryIcon = iconForEntry;

/** Updates all visible `.row .c-icon` elements in place when the active Icon Pack changes. */
export function syncVisibleIcons(root = typeof document !== "undefined" ? document : null) {
  if (!root?.querySelectorAll) return;
  const pack = activeIconPackStyle();
  root.querySelectorAll(".row").forEach((row) => {
    const ico = row.querySelector(".c-icon");
    if (!ico) return;
    const isDir = row.classList.contains("is-folder") || row.dataset.isDir === "1";
    const name = row.dataset.entryName || row.querySelector(".name-text")?.textContent || "";
    const kind = classifyIconKind(name, isDir);
    ico.dataset.iconKind = kind;
    if (isDir) {
      const topic = classifyFolderTopic(name);
      row.dataset.folderTopic = topic;
      ico.dataset.folderTopic = topic;
    }
    if (pack === "default") {
      ico.textContent = row.dataset.defaultIcon || iconFor(name, isDir, "default");
    } else {
      ico.textContent = iconFor(name, isDir, pack);
    }
  });
}

/** Runs `fn` at most once per `ms` after the last call. */
export function debounce(fn, ms) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
