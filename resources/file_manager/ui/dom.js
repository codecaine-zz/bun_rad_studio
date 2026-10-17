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

const ICONS = [
  ["🖼️", "png jpg jpeg gif webp bmp svg ico tif tiff heic avif raw psd"],
  ["🎞️", "mp4 mov mkv avi webm wmv flv m4v mpg mpeg"],
  ["🎵", "mp3 wav flac aac ogg m4a wma opus aiff mid midi"],
  ["📕", "pdf"],
  ["📄", "doc docx odt rtf pages epub mobi"],
  ["📊", "xls xlsx ods csv tsv numbers"],
  ["📽️", "ppt pptx odp key"],
  ["🗜️", "zip rar 7z tar gz tgz bz2 xz zst cab iso"],
  ["💻", "js mjs cjs ts tsx jsx py rb go rs java kt swift c h cpp hpp cs php html htm css scss json xml yaml yml toml sql lua dart vue svelte ps1 bat cmd sh bash zsh v vsh vv zig nim ex exs erl hs ml clj scala groovy r jl pl pm fs fsx vb asm s m mm cc cxx hh hxx mts cts jsonc less sass graphql proto cmake gradle tf sol wat fish ksh"],
  ["📝", "txt md markdown log ini cfg conf env rst tex nfo"],
  ["⚙️", "exe msi app command jar apk appimage scr com run vbs deb rpm pkg"],
  ["💿", "dmg img vhd vmdk"],
  ["🔤", "ttf otf woff woff2 eot"],
];
const ICON_BY_EXT = new Map(ICONS.flatMap(([icon, exts]) => exts.split(" ").map((e) => [e, icon])));

/** A picture-word for a file name, for places (like the Recycle Bin) where the server didn't classify it. */
export function iconFor(name, isDir) {
  if (isDir) return "📁";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return ICON_BY_EXT.get(ext) ?? "📃";
}

/** Runs `fn` at most once per `ms` after the last call. */
export function debounce(fn, ms) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
