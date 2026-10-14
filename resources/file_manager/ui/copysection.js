// "Copy this section": gives every block of information in the File Manager (a Properties group, a table, a log, a
// list of facts, an error message...) a small Copy button that puts just that block on the clipboard as clean text.
// One MutationObserver watches the page and adds the buttons, so most modules need no code of their own:
//   * <section> elements with a heading, tables, <pre> blocks, <dl> fact lists, error boxes and error toasts are found by themselves;
//   * data-copy="Title" marks any other element (data-copy="off" keeps a block button-free);
//   * data-copy-secret on a block adds the clipboard-privacy reminder; data-copy-controls also copies form-field state;
//   * registerCopySource(el, () => ({ text, tsv, markdown, json })) gives the exact content when a module holds more data than it shows.
import { platform } from "./api.js";
import { h } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import { copyToClipboard, flashCopied } from "./copyclip.js";
import { extractSection } from "./copyformat.js";

const CANDIDATES = '[data-copy], section, .pw-card, .dialog, table, pre, dl, ul.detail-list, .dialog-error, .toast.error';
/** Places that never get a button: the file list, the terminal, the code editor, menus, forms' own rows. */
const EXCLUDED = '[data-copy="off"], #list, #list-head, #sidebar, #toolbar, #viewbar, #addressbar, #terminal-panel, .xterm, .code-ed, .menu, #toasts .toast:not(.error), [contenteditable="true"]';
/** The big containers of the page: they hold tools, they are not blocks of information themselves. */
const SHELL = new Set(["power-panel", "dual-pane", "home", "stage", "app", "main", "body"]);
const HOST_SELECTOR = '[data-copy], section, .pw-card, .dialog';
const EDITABLE = 'input:not([readonly]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea:not([readonly]), select';
const BLOCK_TAGS = new Set(["TABLE", "PRE", "DL", "UL", "OL", "P", "OUTPUT"]);
const BIG_SUBTREE = 2000;
const TYPING_PAUSE_MS = 250;

let started = false;
let watchedDocument = null;
let observer = null;
let queued = false;
let lastTyping = 0;
let lastPointer = null;
const targets = new Map();
const sources = new WeakMap();
const pending = new Set();
const touched = new Set();
const toggled = new Set();

const shortcutLabel = () => (platform === "darwin" ? "⌥⇧C" : "Alt+Shift+C");
const hasDocument = () => typeof document !== "undefined";
const tag = (el) => el.tagName.toUpperCase();
const isHeading = (el) => /^H[1-6]$/.test(tag(el));
const isTextEntry = (el) => !!el && (tag(el) === "TEXTAREA" || (tag(el) === "INPUT" && !/^(checkbox|radio|button|submit|range|color|file)$/.test(el.type)) || el.isContentEditable === true);
const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function directHeading(el) {
  for (const c of el.children) {
    if (isHeading(c)) return c;
    // a heading kept in a header or in a "...head" row beside a count or a button still counts
    if (tag(c) === "HEADER" || (tag(c) === "DIV" && /(^|[-\s])head/.test(c.className?.toString() ?? ""))) {
      const inner = [...c.children].find(isHeading);
      if (inner) return inner;
    }
  }
  return null;
}

function nearestHeadingText(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const t = targets.get(p);
    if (t && t.info.heading) return t.info.heading;
    const head = directHeading(p);
    if (head) return squash(head.textContent);
  }
  return "";
}

/** A short name for the block, used in tooltips and messages. */
function titleOf(el) {
  const explicit = el.getAttribute("data-copy");
  if (explicit && explicit !== "on") return explicit;
  const head = directHeading(el);
  if (head) return squash(head.textContent);
  const caption = tag(el) === "TABLE" ? [...el.children].find((c) => tag(c) === "CAPTION") : null;
  if (caption) return squash(caption.textContent);
  const labelled = el.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(" ");
  return squash(labelled || el.getAttribute("aria-label")).replace(/\.\s.*$/, "").replace(/\.$/, "");
}

const KIND_WORD = { section: "section", table: "table", pre: "text", dl: "list of facts", list: "list", error: "error message", text: "text", toast: "error message" };

/** A form is not a block of information, unless it also shows results (a table, a list, a text block). */
const worthCopying = (el) => el.querySelector(EDITABLE) === null || el.querySelector("table, pre, dl, ul, ol") !== null;

/** True when the block is the only table, text block or fact list of the section around it: the section's own button covers it. */
function soleBlockOfSection(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.matches(HOST_SELECTOR) && p.getAttribute("data-copy") !== "off" && (p.hasAttribute("data-copy") || directHeading(p))) return p.querySelectorAll("table, pre, dl").length === 1;
  }
  return false;
}

function classify(el) {
  if (el.hasAttribute("data-copy-ui") || el.closest(EXCLUDED)) return null;
  const t = tag(el);
  const explicit = el.getAttribute("data-copy");
  if (explicit === "off" || el.getAttribute("data-copy-self") === "off") return null;
  if (el.parentElement?.closest('[data-copy-inner="off"]')) return null;
  let kind = null;
  if (el.classList.contains("toast")) kind = "toast";
  else if (el.classList.contains("dialog-error")) kind = "error";
  else if (explicit !== null) kind = t === "TABLE" ? "table" : t === "PRE" ? "pre" : t === "DL" ? "dl" : t === "UL" || t === "OL" ? "list" : BLOCK_TAGS.has(t) ? "text" : "section";
  else if (t === "SECTION" || el.classList.contains("pw-card") || el.classList.contains("dialog")) kind = !SHELL.has(el.id) && directHeading(el) && worthCopying(el) ? "section" : null;
  else if (t === "TABLE") kind = "table";
  else if (t === "PRE" || t === "DL") kind = soleBlockOfSection(el) ? null : t === "PRE" ? "pre" : "dl";
  else if (t === "UL" && el.classList.contains("detail-list")) kind = el.children.length >= 3 ? "list" : null;
  if (!kind) return null;
  const title = kind === "toast" || kind === "error" ? "" : titleOf(el) || nearestHeadingText(el) || "";
  const heading = directHeading(el) ? squash(directHeading(el).textContent) : "";
  return { kind, title, heading, mode: kind === "toast" ? "toast" : kind === "section" ? "host" : "bar" };
}

/** True when the button should not be offered right now: the block is hidden or has nothing in it. */
function isUnavailable(entry) {
  const { el, info } = entry;
  if (el.hidden || el.closest("[hidden]")) return true;
  if (info.kind === "section" || info.kind === "toast") return false;
  if (sources.has(el)) return false;
  if (info.kind === "table") return el.querySelector("td, th[scope='row']") === null;
  return squash(el.textContent) === "";
}

function dataFor(entry, options = {}) {
  const el = entry.el;
  const source = sources.get(el);
  const dom = extractSection(el, { heading: options.heading !== false, controls: el.closest("[data-copy-controls]") !== null });
  if (!source) return dom;
  let given = null;
  try {
    given = source();
  } catch {
    given = null;
  }
  if (!given) return dom;
  const text = given.text ?? dom.text;
  return { text, markdown: given.markdown ?? null, tsv: given.tsv ?? null, json: given.json ?? null, tabular: !!given.tsv, shortened: !!given.shortened };
}

const FORMAT_LABEL = {
  text: "Copy as text",
  tsv: "Copy as table (for spreadsheets)",
  markdown: "Copy as Markdown",
  json: "Copy as JSON",
};

async function copyEntry(entry, format = "text", options = {}) {
  const data = dataFor(entry, options);
  const text = data[format] ?? data.text;
  const secret = options.secret === true || entry.el.closest("[data-copy-secret]") !== null;
  const ok = await copyToClipboard(text, { what: entry.info.title || KIND_WORD[entry.info.kind] || "text", secret, shortened: data.shortened });
  if (ok && entry.main) flashCopied(entry.main);
  return ok;
}

function openMenu(entry) {
  const full = dataFor(entry);
  const items = [{ label: FORMAT_LABEL.text, icon: "📋", action: () => copyEntry(entry, "text") }];
  if (full.tsv) items.push({ label: FORMAT_LABEL.tsv, icon: "▦", action: () => copyEntry(entry, "tsv") });
  if (full.markdown) items.push({ label: FORMAT_LABEL.markdown, icon: "Ⓜ", action: () => copyEntry(entry, "markdown") });
  if (full.json) items.push({ label: FORMAT_LABEL.json, icon: "{ }", action: () => copyEntry(entry, "json") });
  if (!sources.has(entry.el) && dataFor(entry, { heading: false }).text !== full.text) items.push({ separator: true }, { label: "Copy text without the heading", icon: "", action: () => copyEntry(entry, "text", { heading: false }) });
  showMenu(items, { anchor: entry.more, label: `Ways to copy ${entry.info.title || "this block"}` });
}

function makeBar(entry) {
  const { info } = entry;
  const word = KIND_WORD[info.kind] ?? "text";
  const named = info.title ? `the ${word} ${info.title}` : `this ${word}`;
  const words = info.kind === "table" ? "Copy table" : info.kind === "error" ? "Copy error" : info.kind === "list" ? "Copy list" : "Copy";
  const tip = `Copy ${named} as plain text, ready to paste. Press the small arrow for more ways to copy (table, Markdown, JSON). Shortcut: ${shortcutLabel()}.`;
  const main = h("button", { type: "button", class: "copy-main", "aria-label": `Copy ${named}`, title: tip }, words);
  const more = h("button", { type: "button", class: "copy-more", "aria-haspopup": "menu", "aria-label": `More ways to copy ${named}`, title: `Choose how to copy ${named}: text, table, Markdown or JSON` }, "▾");
  main.addEventListener("click", () => copyEntry(entry, "text"));
  more.addEventListener("click", () => openMenu(entry));
  entry.main = main;
  entry.more = more;
  const bar = h("span", { class: `copy-bar copy-bar-${info.mode}`, "data-copy-ui": "", role: "group", "aria-label": `Copy ${named}` }, main, more);
  return bar;
}

function makeToastButton(entry) {
  const button = h("button", { type: "button", class: "toast-action copy-toast", "data-copy-ui": "", "aria-label": "Copy the error message", title: "Copy this error message so you can paste it into a note or a message to someone who can help" }, "Copy error");
  button.addEventListener("click", async () => {
    const text = squash(entry.el.querySelector(".toast-text")?.textContent);
    if (await copyToClipboard(text, { what: "the error message" })) flashCopied(button);
  });
  entry.main = button;
  return button;
}

/** The element a block-style button goes before: the table's scroll wrapper, when there is one. */
function anchorFor(el) {
  let anchor = el;
  while (anchor.parentElement && anchor.parentElement.children.length === 1 && /table-wrap|wrap/.test(anchor.parentElement.className?.toString() ?? "") && !anchor.parentElement.hasAttribute("data-copy")) anchor = anchor.parentElement;
  return anchor;
}

function place(entry) {
  const { el, info } = entry;
  if (info.mode === "toast") {
    const close = el.querySelector(".toast-close");
    const button = makeToastButton(entry);
    if (close) close.before(button);
    else el.append(button);
    entry.bar = button;
  } else if (info.mode === "host") {
    el.classList.add("copy-host");
    const bar = makeBar(entry);
    const head = directHeading(el);
    if (head) head.after(bar);
    else el.prepend(bar);
    entry.bar = bar;
  } else {
    const bar = makeBar(entry);
    anchorFor(el).before(bar);
    entry.bar = bar;
  }
  entry.bar.hidden = isUnavailable(entry);
}

function attach(el) {
  const existing = targets.get(el);
  if (existing) {
    if (!existing.bar.isConnected) {
      existing.bar.remove();
      place(existing);
    }
    return;
  }
  const info = classify(el);
  if (!info) return;
  const entry = { el, info, bar: null, main: null, more: null };
  targets.set(el, entry);
  place(entry);
}

function detach(entry) {
  entry.bar?.remove();
  if (entry.info.mode === "host") entry.el.classList.remove("copy-host");
  targets.delete(entry.el);
}

const LEAF_BLOCKS = new Set(["TABLE", "TBODY", "PRE", "UL", "OL", "DL"]);

function scan(root) {
  if (!root.isConnected || root.hasAttribute?.("data-copy-ui") || root.closest?.(EXCLUDED)) return;
  if (root.matches?.(CANDIDATES)) attach(root);
  if (root.getElementsByTagName("*").length > BIG_SUBTREE) {
    // a huge subtree is looked at piece by piece; a huge table, list or text block only gets the one button at its top
    if (LEAF_BLOCKS.has(root.tagName.toUpperCase())) return;
    for (const child of root.children) scan(child);
    return;
  }
  for (const el of root.querySelectorAll(CANDIDATES)) attach(el);
}

function refresh(node) {
  let hops = 0;
  for (let p = node; p && hops < 5; p = p.parentElement, hops++) {
    const entry = targets.get(p);
    if (!entry) continue;
    const hide = isUnavailable(entry);
    if (entry.bar.hidden !== hide) entry.bar.hidden = hide;
  }
}

function flush() {
  queued = false;
  if (!started || !hasDocument()) return;
  if (Date.now() - lastTyping < TYPING_PAUSE_MS) return schedule();
  for (const entry of [...targets.values()]) if (!entry.el.isConnected) detach(entry);
  const roots = [...pending];
  pending.clear();
  for (const root of roots) scan(root);
  const nodes = [...touched];
  touched.clear();
  for (const node of nodes) refresh(node);
  const flipped = [...toggled];
  toggled.clear();
  if (flipped.length) for (const entry of targets.values()) if (flipped.some((n) => n.contains(entry.el))) refresh(entry.el);
}

function schedule() {
  if (queued || !started || !hasDocument()) return;
  queued = true;
  const run = () => {
    if (queued) flush();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  setTimeout(run, 60);
}

function onMutations(records) {
  for (const r of records) {
    const target = r.target;
    if (target.nodeType !== 1 || target.hasAttribute("data-copy-ui")) continue;
    if (isTextEntry(target)) continue;
    touched.add(target);
    if (r.type === "attributes") toggled.add(target);
    if (r.type !== "childList") continue;
    let foreign = false;
    for (const n of r.addedNodes) {
      if (n.nodeType !== 1 || n.hasAttribute("data-copy-ui")) continue;
      foreign = true;
      pending.add(n);
      if (isHeading(n)) pending.add(target); // a heading that arrives after its section makes it a section
    }
    for (const n of r.removedNodes) if (!(n.nodeType === 1 && n.hasAttribute("data-copy-ui"))) foreign = true;
    // a module that rebuilds the insides of a block also removed our button: put it back
    if (foreign && targets.has(target)) pending.add(target);
  }
  schedule();
}

function entryFrom(node) {
  for (let p = node instanceof Element ? node : node?.parentElement; p; p = p.parentElement) {
    const entry = targets.get(p);
    if (entry && entry.info.mode !== "toast" && !entry.bar.hidden) return entry;
  }
  return null;
}

function onKeyDown(e) {
  if (!(e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.code === "KeyC" || e.key === "C" || e.key === "Ç"))) return;
  const active = document.activeElement;
  const entry = entryFrom(active && active !== document.body ? active : lastPointer) ?? entryFrom(lastPointer);
  e.preventDefault();
  e.stopPropagation();
  if (!entry) {
    toast("Click inside the section you want to copy, then press " + shortcutLabel() + " again.", { kind: "info" });
    return;
  }
  void copyEntry(entry, "text");
}

const onTyping = () => {
  lastTyping = Date.now();
};
const onPointer = (e) => {
  lastPointer = e.target instanceof Element ? e.target : null;
};

/** Starts watching the page and adds the Copy buttons. Safe to call again (a page that was replaced is watched afresh). */
export function startCopySections() {
  if (!hasDocument() || !document.body) return;
  if (started && watchedDocument === document) return;
  if (started) stopCopySections();
  started = true;
  watchedDocument = document;
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("input", onTyping, true);
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("mousedown", onPointer, true);
  scan(document.body);
}

/** Stops watching and removes every Copy button this module added (used when the page is torn down). */
export function stopCopySections() {
  if (!started) return;
  started = false;
  observer?.disconnect();
  observer = null;
  queued = false;
  const doc = watchedDocument;
  watchedDocument = null;
  if (doc) {
    doc.removeEventListener("keydown", onKeyDown, true);
    doc.removeEventListener("input", onTyping, true);
    doc.removeEventListener("pointerdown", onPointer, true);
    doc.removeEventListener("mousedown", onPointer, true);
  }
  for (const entry of [...targets.values()]) detach(entry);
  targets.clear();
  pending.clear();
  touched.clear();
  toggled.clear();
  lastPointer = null;
}

/** Looks at the page (or just `root`) right now instead of waiting for the next batch. For tests and for modules that need the button at once. */
export function scanCopySections(root) {
  if (!started || !hasDocument()) return;
  flush();
  scan(root ?? document.body);
  for (const entry of targets.values()) refresh(entry.el);
}

/** How many blocks currently have a Copy button. */
export const copySectionCount = () => targets.size;

/**
 * Tells the Copy button of `el` exactly what to copy, for blocks whose full content is not all on screen (a long list
 * showing only some rows). `getData` returns any of { text, tsv, markdown, json }. Returns a function that undoes this.
 * @param {Element} el
 * @param {() => { text?: string, tsv?: string, markdown?: string, json?: string } | null} getData
 * @param {string} [title]
 */
export function registerCopySource(el, getData, title) {
  sources.set(el, getData);
  if (title && !el.hasAttribute("data-copy")) el.setAttribute("data-copy", title);
  else if (!el.hasAttribute("data-copy")) el.setAttribute("data-copy", "");
  if (started && el.isConnected) attach(el);
  return () => sources.delete(el);
}

/** Copies the block `el` right now (as if its Copy button was pressed). Used by "Copy all" buttons. */
export function copySectionNow(el, { title = "", secret = false, format = "text" } = {}) {
  const known = targets.get(el);
  const entry = { el, info: { ...(known?.info ?? { kind: "section", heading: "", mode: "host" }), title: title || known?.info.title || "" }, main: known?.main ?? null, more: null, bar: null };
  return copyEntry(entry, format, { secret });
}
