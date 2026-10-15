// Quick Look: press Space on a file (or choose Quick Look in its menu) to look at it without opening another program.
// Pictures, text and, on a Mac, documents (PDF, Word, Excel, Keynote, HEIC ...) show right here, and sound and video open
// a full player (mediaplayer.js). The arrow keys move to the next and previous item of the list, Enter opens the item in
// its own program, Space or Esc closes it. For sound, video and animated GIFs Space plays and pauses, and Esc closes.
import { ApiError, call, rawUrl } from "./api.js";
import { $, announce, h, iconFor } from "./dom.js";
import { menuIsOpen, showMenu, toast } from "./menus.js";
import { visibleEntries } from "./nav.js";
import { copyImageFile, copyTextFile } from "./clipfile.js";
import { copyPathOf, openEntry, revealEntry } from "./ops.js";
import { openInCode } from "./code.js";
import { isKnownTextName } from "./codeLang.js";
import { showMoreInfo } from "./fileinfo.js";
import { showProperties } from "./extras.js";
import { createGifViewer } from "./gifviewer.js";
import { createPlayer } from "./mediaplayer.js";
import { mediaKindOfName } from "./mediacore.js";
import { showOpenWith } from "./openwith.js";
import { showToolsDialog } from "./tools.js";
import { activePane } from "./pane.js";
import { focusIndex, selectedEntries } from "./selection.js";
import { inTrash } from "./state.js";
import { parseTable } from "./quicklookTable.js";
import { extensionOf, formatDate, formatSize, plural } from "./util.js";

const DEFAULT_FOOT = "Space or Esc closes  ·  ← → show the next or previous item  ·  Enter opens it";

/** The open Quick Look, or null. */
let ql = null;

export const quickLookIsOpen = () => ql !== null;

const thumbUrl = (path) => `${rawUrl(path)}&thumb=1`;
const TABLE_EXTS = new Set(["csv", "tsv"]);

function destroyPlayer() {
  if (!ql?.player) return;
  ql.player.destroy();
  ql.player = null;
}

function destroyGif() {
  if (!ql?.gif) return;
  ql.gif.destroy();
  ql.gif = null;
}

function factsList(entry, extra = []) {
  const facts = [["Type", entry.label], ["Size", entry.isDir ? "" : formatSize(entry.size)], ["Modified", entry.mtimeMs ? formatDate(entry.mtimeMs) : ""], ...extra].filter(([, v]) => v);
  return h("dl", { class: "ql-facts" }, ...facts.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
}

/** The plain card: used for folders and for files that can't be drawn here. */
function infoCard(entry, note, extra = []) {
  return h("div", { class: "ql-card" },
    h("div", { class: "ql-bigicon", "aria-hidden": "true" }, entry.icon || iconFor(entry.name, entry.isDir)),
    h("h3", {}, entry.name),
    factsList(entry, extra),
    note ? h("p", { class: "ql-note" }, note) : null,
  );
}

/** The header's Copy button: shown only when the item in view is a picture or text that can be copied. */
function setCopy(offer) {
  ql.copyAction = offer ? offer.run : null;
  ql.copyBtn.hidden = !offer;
  if (offer) {
    ql.copyBtn.textContent = offer.label;
    ql.copyBtn.title = offer.tip;
  }
}

/** Which of the header's other buttons make sense for the item in view. */
function setActions(entry) {
  const text = !entry.isDir && isKnownTextName(entry.name);
  ql.convertBtn.hidden = entry.isDir;
  ql.editBtn.hidden = !text;
}

function setSub(text) {
  ql.sub.textContent = text;
}

function baseSub(entry) {
  return [entry.label, entry.isDir ? "" : formatSize(entry.size), entry.mtimeMs ? formatDate(entry.mtimeMs) : ""].filter(Boolean).join("  ·  ");
}

function failed(entry, what) {
  return infoCard(entry, `${what} Press Enter to open it in the program your computer uses for it.`);
}

async function renderBody(entry, mine) {
  const open = (node) => { if (ql && mine === ql.seq) ql.body.replaceChildren(node); };
  if (entry.isDir) {
    open(infoCard(entry, "Press Enter to open this folder."));
    try {
      const { properties: p } = await call("props", { paths: [entry.path] });
      open(infoCard(entry, "Press Enter to open this folder.", [["Contains", `${plural(p.files, "file")}, ${plural(p.folders, "folder")}${p.partial ? " (counted partly)" : ""}`], ["Total size", formatSize(p.size)]]));
    } catch { /* the plain card already says what it can */ }
    return;
  }
  if (mediaKindOfName(entry.name)) return mountPlayer(entry, mine);
  open(h("p", { class: "ql-loading", role: "status" }, "Loading…"));
  let preview;
  try {
    ({ preview } = await call("preview", { path: entry.path }));
  } catch (err) {
    open(infoCard(entry, err instanceof ApiError ? err.message : "This couldn't be read."));
    return;
  }
  if (!ql || mine !== ql.seq) return;
  switch (preview.type) {
    case "image": {
      if (extensionOf(entry.name) === "gif") return mountGif(entry, mine, open);
      setCopy({ label: "Copy picture", tip: "Put the picture on the clipboard, to paste into a document or chat", run: () => copyImageFile(entry) });
      const img = h("img", { class: "ql-image", src: rawUrl(entry.path), alt: `Preview of ${entry.name}`, onload: () => ql && mine === ql.seq && setSub(`${baseSub(entry)}  ·  ${img.naturalWidth} × ${img.naturalHeight}`), onerror: () => open(failed(entry, "This picture can't be shown here.")) });
      return open(img);
    }
    case "thumb": {
      const img = h("img", { class: "ql-image", src: thumbUrl(entry.path), alt: `First page or picture of ${entry.name}`, onerror: () => open(failed(entry, "This computer couldn't make a preview of it.")) });
      return open(h("div", { class: "ql-doc" }, img, h("p", { class: "ql-note" }, "A picture of the first page, made by your computer's own Quick Look.")));
    }
    case "text": {
      setCopy({ label: "Copy text", tip: "Put the whole text of this file on the clipboard", run: () => copyTextFile(entry) });
      const ext = extensionOf(entry.name);
      const note = preview.truncated ? h("p", { class: "ql-note" }, `Showing the start of the file (${formatSize(new Blob([preview.text]).size)} of ${formatSize(preview.size)}).`) : null;
      if (TABLE_EXTS.has(ext)) {
        const rows = parseTable(preview.text, ext === "tsv" ? "\t" : ",").slice(0, 300);
        if (rows.length) {
          const width = Math.max(...rows.map((r) => r.length));
          const body = rows.slice(1).map((r) => h("tr", {}, ...Array.from({ length: width }, (_, i) => h("td", {}, r[i] ?? ""))));
          return open(h("div", { class: "ql-tablewrap", tabindex: "0", "aria-label": `Table ${entry.name}` }, h("table", { class: "ql-table" }, h("thead", {}, h("tr", {}, ...Array.from({ length: width }, (_, i) => h("th", { scope: "col" }, rows[0][i] ?? "")))), h("tbody", {}, ...body)), note, rows.length >= 300 ? h("p", { class: "ql-note" }, "Showing the first 300 rows.") : null));
        }
      }
      return open(h("div", { class: "ql-textwrap" }, h("pre", { class: "ql-text", tabindex: "0", "aria-label": `Contents of ${entry.name}` }, preview.text || "(An empty file.)"), note));
    }
    default:
      return open(infoCard(entry, "There is no preview for this kind of file. Press Enter to open it in the program your computer uses for it."));
  }
}

const GIF_FOOT = "Space plays or pauses  ·  , and . step a frame  ·  [ and ] speed  ·  L loops  ·  F fits  ·  ← → show the next or previous item  ·  Esc closes";

/** An animated GIF: a viewer with play, pause, frame stepping, speed and loop (a plain picture when it can't be read frame by frame). */
function mountGif(entry, mine, open) {
  setCopy({ label: "Copy picture", tip: "Put the picture on the clipboard, to paste into a document or chat", run: () => copyImageFile(entry) });
  destroyGif();
  const viewer = createGifViewer(entry);
  ql.gif = viewer;
  open(viewer.root);
  viewer.ready.then((r) => {
    if (!ql || mine !== ql.seq) return;
    if (r.fallback) {
      destroyGif();
      open(r.fallback);
      return;
    }
    setSub(`${baseSub(entry)}  ·  ${r.facts}`);
    ql.foot.textContent = GIF_FOOT;
  });
}

/** Sound and video: one player for the whole queue (the other sound and video files of the folder). */
function mountPlayer(entry, mine) {
  if (ql.player) {
    if (ql.player.show(entry)) return;
    destroyPlayer();
  }
  if (mine !== ql.seq) return;
  ql.player = createPlayer({ entries: ql.entries, start: entry, subtitleEntries: ql.entries, announce, onTrack: (e) => followTrack(e) });
  ql.body.replaceChildren(ql.player.root);
  ql.foot.textContent = "Space plays or pauses  ·  ← → seek  ·  ↑ ↓ volume  ·  N and B next and previous  ·  E equaliser  ·  Q queue  ·  Esc closes  ·  Enter opens it";
}

/** The player moved to another track by itself (the queue, shuffle, repeat): keep the window's header and selection in step. */
function followTrack(entry) {
  if (!ql) return;
  const index = ql.entries.findIndex((e) => e.path === entry.path);
  if (index < 0 || index === ql.index) return;
  ql.index = index;
  ++ql.seq;
  ql.icon.textContent = entry.icon || iconFor(entry.name, entry.isDir);
  ql.title.textContent = entry.name;
  setSub(baseSub(entry));
  ql.count.textContent = `${index + 1} of ${ql.entries.length}`;
  ql.dialog.setAttribute("aria-label", `Quick Look: ${entry.name}`);
  setActions(entry);
  focusIndex(index, { pane: ql.pane });
}

async function show(index) {
  const entry = ql.entries[index];
  if (!entry) return;
  const mine = ++ql.seq;
  ql.index = index;
  destroyGif();
  if (!mediaKindOfName(entry.name)) {
    destroyPlayer();
    ql.foot.textContent = DEFAULT_FOOT;
  }
  setCopy(null);
  setActions(entry);
  ql.icon.textContent = entry.icon || iconFor(entry.name, entry.isDir);
  ql.title.textContent = entry.name;
  setSub(baseSub(entry));
  ql.count.textContent = `${index + 1} of ${ql.entries.length}`;
  ql.dialog.setAttribute("aria-label", `Quick Look: ${entry.name}`);
  announce(`Quick Look: ${entry.name}, ${index + 1} of ${ql.entries.length}`);
  focusIndex(index, { pane: ql.pane });
  await renderBody(entry, mine);
}

export function closeQuickLook() {
  if (!ql) return;
  destroyPlayer();
  destroyGif();
  document.removeEventListener("keydown", onKey, true);
  ql.backdrop.remove();
  const { opener } = ql;
  ql = null;
  if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
}

function step(delta) {
  const next = ql.index + delta;
  if (next >= 0 && next < ql.entries.length) show(next);
}

function openCurrent() {
  const entry = ql.entries[ql.index];
  closeQuickLook();
  if (entry) openEntry(entry);
}

function onKey(e) {
  if (!ql) return;
  // A menu or a dialog opened from here has the keys first.
  if (menuIsOpen() || document.querySelector(".modal-backdrop")) return;
  const target = e.target instanceof Element ? e.target : null;
  const onControl = !!target?.closest("button, select, input, textarea, a[href]");
  const isArrow = e.key.startsWith("Arrow");
  // While Quick Look is open it owns the keyboard: nothing reaches the file list underneath.
  if (e.ctrlKey || e.metaKey || e.altKey) { if (!e.metaKey && !e.ctrlKey) e.stopPropagation(); return; }
  if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); return closeQuickLook(); }
  if (e.key === "Tab") {
    e.stopPropagation();
    e.preventDefault();
    const items = [...ql.dialog.querySelectorAll("button, select, input, audio[controls], video[controls], [tabindex='0']")].filter((el) => !el.disabled && !el.hidden && !el.closest("[hidden]"));
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    return;
  }
  // A focused button, list or slider keeps the keys it uses itself (Space and Enter press a button; arrows move a slider or a list).
  if (e.key === "Enter" && target?.closest("button")) { e.stopPropagation(); return; }
  if (e.key === " " && onControl) { e.stopPropagation(); return; }
  if (isArrow && target?.closest("select, input[type=range]")) { e.stopPropagation(); return; }
  if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); return openCurrent(); }
  // The player owns the rest of the keys while a sound or video is in view.
  if (ql.player && ql.player.handleKey(e)) { e.stopPropagation(); e.preventDefault(); return; }
  if (ql.gif && ql.gif.handleKey(e)) { e.stopPropagation(); e.preventDefault(); return; }
  const mine = e.key === " " || isArrow || e.key === "Home" || e.key === "End";
  if (!mine) { e.stopPropagation(); return; }
  e.stopPropagation();
  e.preventDefault();
  if (e.key === " ") return closeQuickLook();
  if (e.key === "ArrowRight" || e.key === "ArrowDown") return step(1);
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") return step(-1);
  if (e.key === "Home") return show(0);
  if (e.key === "End") return show(ql.entries.length - 1);
}

/** Opens Quick Look on `entry` (default: the focused or first selected item of the active list). */
export function openQuickLook(entry = null, pane = activePane()) {
  if (ql) return closeQuickLook();
  if (inTrash()) return toast("Restore it from the Recycle Bin first, then you can look at it.");
  const entries = visibleEntries(pane);
  const target = entry ?? entries.find((e) => e.path === pane.focusKey) ?? selectedEntries()[0];
  const index = target ? entries.findIndex((e) => e.path === target.path) : -1;
  if (index < 0) return toast("Select a file first, then press Space.");
  const icon = h("span", { class: "ql-icon", "aria-hidden": "true" });
  const title = h("div", { class: "ql-title" });
  const sub = h("div", { class: "ql-sub" });
  const count = h("span", { class: "ql-count" });
  const body = h("div", { class: "ql-body", "aria-live": "off" });
  const foot = h("div", { class: "ql-foot" }, DEFAULT_FOOT);
  const copyBtn = h("button", { type: "button", class: "btn", hidden: true, onclick: () => ql?.copyAction?.() }, "Copy");
  const current = () => ql?.entries[ql.index];
  // Convert, Edit and the dialogs of the More menu work on the selection, which follows Quick Look, so Quick Look steps aside first.
  const thenClose = (fn) => () => { const e = current(); if (!e) return; closeQuickLook(); fn(e); };
  const convertBtn = h("button", { type: "button", class: "btn", hidden: true, title: "Turn this file into another format, or make a smaller or changed copy (Convert and process)", onclick: thenClose(() => showToolsDialog()) }, "Convert…");
  const editBtn = h("button", { type: "button", class: "btn", hidden: true, title: "Edit it in the built-in Code editor", onclick: thenClose((e) => openInCode(e.path)) }, "Edit");
  const moreBtn = h("button", { type: "button", class: "btn", "aria-haspopup": "menu", title: "More things to do with this file", onclick: () => {
    const e = current();
    if (!e) return;
    showMenu([
      { label: "Copy path", icon: "🔗", action: () => copyPathOf([e]) },
      { label: "Open with…", icon: "🧩", disabled: e.isDir, action: thenClose((x) => showOpenWith([x])) },
      { label: "Show in file manager", icon: "🔎", action: () => revealEntry(e) },
      { separator: true },
      { label: "Properties…", icon: "ℹ️", action: thenClose((x) => showProperties([x.path])) },
      { label: "More info…", icon: "🔍", action: thenClose((x) => showMoreInfo([x.path])) },
    ], { anchor: moreBtn, label: "More" });
  } }, "More ▾");
  const dialog = h("div", { class: "ql", role: "dialog", "aria-modal": "true", "aria-label": "Quick Look", tabindex: "-1" },
    h("div", { class: "ql-head" }, icon, h("div", { class: "ql-headtext" }, title, sub), count,
      copyBtn, convertBtn, editBtn,
      h("button", { type: "button", class: "btn", title: "Open it with the program chosen in Settings, or the one your computer uses for it (Enter)", onclick: () => openCurrent() }, "Open"),
      moreBtn,
      h("button", { type: "button", class: "btn", "aria-label": "Close Quick Look", title: "Close (Space or Esc)", onclick: () => closeQuickLook() }, "Close")),
    body,
    foot);
  const backdrop = h("div", { class: "ql-backdrop", onclick: (ev) => { if (ev.target === backdrop) closeQuickLook(); } }, dialog);
  ql = { backdrop, dialog, body, icon, title, sub, count, foot, copyBtn, convertBtn, editBtn, player: null, copyAction: null, entries, index, pane, seq: 0, opener: document.activeElement };
  $("#overlay").append(backdrop);
  document.addEventListener("keydown", onKey, true);
  dialog.focus();
  show(index);
}
