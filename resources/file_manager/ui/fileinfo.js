// "More info": a window with every detail about a file, picture, folder or selection. Grouped, searchable, copyable.
// What is shown comes from the server's `info/...` operations; this page only arranges it (never as HTML text).
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { h, iconFor } from "./dom.js";
import { hashSection } from "./fileinfoHash.js";
import { loadPalette, paletteGroup, paletteView } from "./fileinfoPalette.js";
import { privacySection } from "./fileinfoPrivacy.js";
import { copyValue, groupView } from "./fileinfoRender.js";
import { FORMATS, buildReport, rowMatches } from "./fileinfoReport.js";
import { toast } from "./menus.js";
import { refresh } from "./nav.js";
import { state } from "./state.js";
import { baseName } from "./util.js";

/** Where each part of the answer goes, top to bottom. */
const SLOTS = ["general", "image", "media", "document", "folder", "origin", "palette", "privacy", "hashes", "exiftool"];
const ORIGIN_IDS = new Set(["macos", "security"]);
const PALETTE_KINDS = new Set(["png", "jpeg", "gif", "webp", "bmp", "svg"]);
const RAW_EXT = new Set(["cr2", "cr3", "nef", "nrw", "arw", "dng", "orf", "rw2", "raf", "pef", "srw", "x3f", "heic", "heif", "avif"]);
const EXIFTOOL_FAMILIES = new Set(["image", "video", "audio"]);

const problem = (err, fallback = "That didn't work.") => (err instanceof ApiError ? err.message : fallback);

/**
 * Opens the window for one or several items.
 * @param {string[]} paths
 */
export function showMoreInfo(paths) {
  const list = [...new Set((paths ?? []).filter((p) => typeof p === "string" && p))];
  if (!list.length) return Promise.resolve();
  const many = list.length > 1;
  const path = list[0];
  const name = many ? `${list.length} items` : baseName(path, state.sep) || path;

  const data = Object.fromEntries(SLOTS.map((s) => [s, []]));
  const providers = {};
  const slots = Object.fromEntries(SLOTS.map((s) => [s, h("div", { class: `fi-slot fi-slot-${s}`, dataset: { slot: s } })]));
  let views = [];
  let alive = true;
  let kindText = "";
  let hashes = null;

  const search = h("input", { type: "search", class: "text-input fi-search", placeholder: "Search these details…", "aria-label": "Search these details", autocomplete: "off", spellcheck: "false", title: "Type part of a word to show only the details that contain it. Press Escape to clear." });
  const status = h("p", { class: "fi-status", role: "status", "aria-live": "polite" }, "Loading…");
  const format = h("select", { class: "select fi-format", "aria-label": "Report format", title: "How the report is written when you copy or save it" }, Object.entries(FORMATS).map(([id, f]) => h("option", { value: id }, f.label)));
  const sub = h("p", { class: "fi-sub" }, many ? "A summary of everything selected." : "Looking…");
  const gpsBanner = h("p", { class: "fi-gps-banner", role: "note", hidden: true }, h("span", { "aria-hidden": "true" }, "📍 "), h("strong", {}, "Has location"), ": This photo contains the location where it was taken.");

  function reportGroups() {
    const out = [];
    for (const slot of SLOTS) {
      out.push(...data[slot]);
      const p = providers[slot];
      if (p) out.push(p());
    }
    return out;
  }
  const makeReport = () => buildReport({ name, path: many ? list.join("\n") : path, kind: kindText }, reportGroups());

  async function copyReport() {
    const text = FORMATS[format.value].make(makeReport());
    if (text.length > 100_000) return void toast("The report is too long to copy (over 100,000 characters). Save it instead.", { kind: "error" });
    await copyValue(text, "The report");
  }

  async function saveReport() {
    const f = FORMATS[format.value];
    try {
      const r = await call("info/save", { path, format: f.ext, content: f.make(makeReport()) });
      toast(`Saved “${r.name}” next to the item.`, { kind: "success" });
      refresh();
    } catch (err) {
      toast(problem(err, "Couldn't save the report."), { kind: "error" });
    }
  }

  const copyBtn = h("button", { type: "button", class: "btn fi-copy-report", title: "Copy everything shown here to the clipboard, in the format chosen on the right", onclick: copyReport }, "Copy report");
  const saveBtn = h("button", { type: "button", class: "btn fi-save-report", disabled: many, title: many ? "Select one item to save its report next to it" : "Save the report as a new file next to this item, named like “photo.jpg.info.txt”. Nothing is overwritten.", onclick: saveReport }, "Save report");

  function applySearch() {
    const q = search.value.trim();
    let shown = 0;
    for (const v of views) shown += v.filter(q);
    for (const slot of SLOTS) {
      const p = providers[slot];
      const node = slots[slot].querySelector("[data-custom]");
      if (p && node) node.hidden = !!q && !p().rows.some((r) => rowMatches(r, q));
    }
    if (!q) status.textContent = alive && views.length ? `${views.reduce((n, v) => n + v.count, 0)} details` : status.textContent;
    else status.textContent = shown ? `${shown} detail${shown === 1 ? "" : "s"} match “${q}”.` : `Nothing matches “${q}”.`;
  }

  /** Puts groups in a slot (replacing what was there). */
  function fill(slot, groups) {
    data[slot] = groups.filter((g) => g.rows.length || g.note);
    views = views.filter((v) => !slots[slot].contains(v.el));
    const fresh = data[slot].map(groupView);
    views.push(...fresh);
    slots[slot].replaceChildren(...fresh.map((v) => v.el));
    applySearch();
  }

  function custom(slot, node, provider) {
    node.dataset.custom = "1";
    providers[slot] = provider;
    slots[slot].replaceChildren(node);
  }

  const note = (slot, text) => slots[slot].append(h("p", { class: "fi-note fi-slot-note" }, text));

  search.addEventListener("input", applySearch);
  // Escape empties the search box first; only when it is already empty does it close the window.
  const onEscape = (e) => {
    if (e.key !== "Escape" || e.target !== search || !search.value) return;
    e.stopPropagation();
    e.preventDefault();
    search.value = "";
    applySearch();
  };
  window.addEventListener("keydown", onEscape, true);

  const body = h("div", { class: "fi", dataset: { state: "loading" } },
    h("div", { class: "fi-head" }, h("div", { class: "fi-icon", "aria-hidden": "true" }, many ? "🗂️" : iconFor(name, false)), h("div", { class: "fi-head-text" }, h("h3", { class: "fi-name" }, name), sub)),
    h("div", { class: "fi-bar" }, search, copyBtn, format, saveBtn),
    status, gpsBanner,
    h("div", { class: "fi-groups" }, SLOTS.map((s) => slots[s])),
  );
  const dialog = openDialog({ title: "More info", body, wide: true, initialFocus: search, buttons: [{ label: "Close", primary: true, value: true }], describe: "Details and hidden information about the selected item. Use the search box to filter them." });
  dialog.el.classList.add("fi-dialog");
  dialog.result.then(() => {
    alive = false;
    window.removeEventListener("keydown", onEscape, true);
    hashes?.dispose();
  });

  // ---- loading ------------------------------------------------------------------------------------------------
  async function loadFolder(file) {
    let id = "";
    const bar = h("progress", { class: "fi-progress", "aria-label": "Counting is in progress" });
    const text = h("span", {}, "Counting what is inside…");
    const stop = h("button", { type: "button", class: "btn", title: "Stop counting. What was counted so far is shown.", onclick: () => id && call("info/cancel", { id }).catch(() => {}) }, "Cancel");
    slots.folder.replaceChildren(h("div", { class: "fi-scan", role: "status" }, bar, text, stop));
    try {
      id = (await call("info/folderscan", { path: file.path })).task.id;
      for (;;) {
        if (!alive) return void call("info/cancel", { id }).catch(() => {});
        const t = (await call("info/task", { id })).task;
        if (t.state === "running") {
          text.textContent = t.message || "Counting what is inside…";
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        if (t.state === "failed") throw new ApiError(t.error || "That didn't work.", "FAILED", 0);
        fill("folder", t.result?.groups ?? []);
        return;
      }
    } catch (err) {
      slots.folder.replaceChildren(h("p", { class: "fi-note" }, problem(err)));
    }
  }

  async function loadImage(file) {
    try {
      const img = await call("info/image", { path: file.path });
      fill("image", img.groups);
      if (img.notes?.length) note("image", img.notes.join(" "));
      if (img.gps) gpsBanner.hidden = false;
      const privacy = privacySection(file.path, img);
      custom("privacy", privacy.el, privacy.group);
      applySearch();
      if (PALETTE_KINDS.has(img.kind)) {
        const colors = await loadPalette(file.path);
        if (alive && colors) {
          custom("palette", paletteView(colors), () => paletteGroup(colors));
          applySearch();
        }
      }
      return img;
    } catch (err) {
      note("image", problem(err));
      return null;
    }
  }

  async function loadOther(op, slot, file) {
    try {
      const r = await call(op, { path: file.path });
      fill(slot, r.groups);
      if (r.notes?.length) note(slot, r.notes.join(" "));
      if (r.helper?.hint) note(slot, r.helper.hint);
      if (r.kind) kindText = r.kind;
    } catch (err) {
      if (err instanceof ApiError && err.code !== "NOT_SUPPORTED") note(slot, err.message);
      else note(slot, "There is no detailed reader for this kind of file. The general details above still apply.");
    }
  }

  function exiftoolSection(file) {
    const result = h("div", { class: "fi-exif-result" });
    const run = h("button", { type: "button", class: "btn fi-exif-run", title: "List every tag ExifTool can read in this file: camera, lens, location, software, video and document details.", onclick: async () => {
      run.disabled = true;
      result.textContent = "Reading…";
      try {
        const r = await call("info/exiftool", { path: file.path });
        result.replaceChildren();
        if (!r.available) result.append(h("p", { class: "fi-note" }, `ExifTool isn't installed on this computer. ${r.hint}`));
        else if (r.hint) result.append(h("p", { class: "fi-note" }, r.hint));
        if (r.truncated) result.append(h("p", { class: "fi-note" }, "There are more tags than can be shown."));
        data.exiftool = r.groups;
        const fresh = r.groups.map(groupView);
        views = views.filter((v) => !result.contains(v.el)).concat(fresh);
        result.append(...fresh.map((v) => v.el));
        applySearch();
      } catch (err) {
        result.replaceChildren(h("p", { class: "fi-note" }, problem(err)));
      }
      run.disabled = false;
    } }, "Show everything (ExifTool)");
    return h("section", { class: "fi-group fi-exif", dataset: { group: "exiftool-view" } },
      h("h3", { class: "fi-title", title: "ExifTool is a free helper program that reads every kind of hidden detail. It is optional." }, "Everything (ExifTool)"), run, result);
  }

  async function load() {
    try {
      if (many) {
        fill("general", (await call("info/many", { paths: list })).groups);
        return;
      }
      const file = await call("info/file", { path });
      kindText = file.kind;
      sub.textContent = `${file.kind}${file.mime && !file.isDir ? ` · ${file.mime}` : ""}`;
      fill("general", file.groups.filter((g) => !ORIGIN_IDS.has(g.id)));
      fill("origin", file.groups.filter((g) => ORIGIN_IDS.has(g.id)));
      if (file.isLink) {
        if (file.realPath) {
          const go = h("button", { type: "button", class: "btn fi-target", title: "Show the details of the item this link points to", onclick: () => { dialog.close(); showMoreInfo([file.realPath]); } }, "Show details of the target");
          slots.general.append(h("p", { class: "fi-note" }, "This is a link. Its own details are shown; its content is not read."), go);
        }
        return;
      }
      if (file.isDir) return await loadFolder(file);
      let img = null;
      if (file.family === "image") img = await loadImage(file);
      else if (file.family === "video" || file.family === "audio") await loadOther("info/media", "media", file);
      else await loadOther("info/document", "document", file);
      if (!alive) return;
      hashes = hashSection(file.path);
      custom("hashes", hashes.el, hashes.group);
      if (EXIFTOOL_FAMILIES.has(file.family) || file.sniffKind === "pdf" || RAW_EXT.has(file.ext) || (file.family === "image" && img === null)) slots.exiftool.replaceChildren(exiftoolSection(file));
      applySearch();
    } catch (err) {
      sub.textContent = "";
      slots.general.replaceChildren(h("p", { class: "fi-note", role: "alert" }, problem(err, "Couldn't read the details.")));
    } finally {
      body.dataset.state = "ready";
    }
  }

  load();
  return dialog.result;
}
