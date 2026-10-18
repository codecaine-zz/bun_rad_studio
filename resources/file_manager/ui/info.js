// The Details panel on the right: a picture or text preview and the basic facts about the selection.
import { call, rawUrl } from "./api.js";
import { openFolderInCode, openInCode } from "./code.js";
import { looksLikeText } from "./codeLang.js";
import { isSqliteFile, openInSqliteStudio } from "./dbFiles.js";
import { showProperties } from "./extras.js";
import { showMoreInfo } from "./fileinfo.js";
import { mayHavePhotoDetails, photoStrip } from "./fileinfoPhoto.js";
import { $, clear, h, iconFor } from "./dom.js";
import { saveSettings, visibleEntries } from "./nav.js";
import { octalOf, symbolicOf } from "./permsModel.js";
import { selectedEntries } from "./selection.js";
import { inTrash, on, state } from "./state.js";
import { quickMediaBlock } from "./mediaQuick.js";
import { renderRichInfoSummary } from "./quicklookFormat.js";
import { verdictBlock } from "./typecheck.js";
import { baseName, formatDate, formatSize, plural } from "./util.js";

let sequence = 0;

function fact(label, value) {
  return value ? [h("dt", {}, label), h("dd", {}, value)] : [];
}

async function previewFor(entry) {
  if (entry.isDir || inTrash()) return null;
  try {
    const { preview } = await call("preview", { path: entry.path });
    if (preview.type === "image") {
      const img = h("img", {
        class: "preview-image",
        src: rawUrl(entry.path),
        alt: `Preview of ${entry.name}`,
        onerror: () => {
          if (!img.dataset.retried) {
            img.dataset.retried = "1";
            img.src = `${rawUrl(entry.path)}&convert=1`;
          }
        },
      });
      return img;
    }
    if (preview.type === "thumb") {
      const img = h("img", { class: "preview-image", src: `${rawUrl(entry.path)}&thumb=1`, alt: `Preview of ${entry.name}` });
      const richBox = renderRichInfoSummary(entry, preview);
      return richBox ? h("div", { class: "info-thumb-rich" }, img, richBox) : img;
    }
    if (preview.type === "text") return h("pre", { class: "preview-text", tabindex: "0", "aria-label": `Start of ${entry.name}` }, preview.text + (preview.truncated ? "\n…" : ""));
    if (preview.type === "binary") {
      const richBox = renderRichInfoSummary(entry, preview);
      if (richBox) return richBox;
      return h("p", { class: "hint" }, "No preview for this kind of file.");
    }
  } catch {
    // preview is a nicety: say nothing
  }
  return null;
}

export async function renderInfo() {
  const panel = $("#info");
  panel.hidden = !state.settings.showInfoPanel;
  if (panel.hidden) return;
  const mine = ++sequence;
  const items = selectedEntries();
  const box = clear(panel);
  if (items.length === 0) {
    const entries = visibleEntries();
    const files = entries.filter((e) => !e.isDir);
    box.append(
      h("div", { class: "info-icon", "aria-hidden": "true" }, inTrash() ? "🗑️" : "📂"),
      h("h2", { class: "info-name" }, inTrash() ? "Recycle Bin" : baseName(state.location.path, state.sep) || state.location.path),
      h("p", { class: "hint" }, "Select an item to see details about it."),
      h("dl", { class: "info-facts" }, ...fact("Items", plural(entries.length, "item")), ...fact("Total size of files", files.length ? formatSize(files.reduce((n, e) => n + e.size, 0)) : "")),
    );
    return;
  }
  if (items.length > 1) {
    const files = items.filter((e) => !e.isDir);
    box.append(...[
      h("div", { class: "info-icon", "aria-hidden": "true" }, "🗂️"),
      h("h2", { class: "info-name" }, `${items.length} items selected`),
      h("dl", { class: "info-facts" }, ...fact("Folders", String(items.length - files.length)), ...fact("Files", String(files.length)), ...fact("Size of files", formatSize(files.reduce((n, e) => n + e.size, 0)))),
      h("button", { type: "button", class: "btn", onclick: () => showProperties(items.map((e) => e.path)) }, "Properties…"),
      h("button", { type: "button", class: "btn fi-more", title: "A summary of everything selected: total size, kinds of files and dates", onclick: () => showMoreInfo(items.map((e) => e.path)) }, "More info…"),
      quickMediaBlock(items),
    ].filter((part) => part !== null));
    return;
  }
  const e = items[0];
  // Node.append turns a null into the text "null", so the parts that don't apply are left out first.
  box.append(...[
    h("div", { class: "info-icon", "aria-hidden": "true" }, e.icon || iconFor(e.name, e.isDir)),
    h("h2", { class: "info-name" }, e.name),
    h("dl", { class: "info-facts" },
      ...fact("Type", e.label), ...fact("Size", e.isDir ? "" : formatSize(e.size)), ...fact(inTrash() ? "Deleted" : "Modified", formatDate(e.mtimeMs)),
      ...fact("Permissions", !inTrash() && typeof e.mode === "number" ? `${symbolicOf(e.mode)} (${octalOf(e.mode)})` : ""),
      ...fact(inTrash() ? "Was in" : "Where", inTrash() ? e.where : state.search ? e.folder : baseName(state.location.path, state.sep))),
    inTrash() || e.isDir ? null : verdictBlock(e.path, e.name),
    inTrash() ? null : h("button", { type: "button", class: "btn", onclick: () => showProperties([e.path]) }, "Properties…"),
    inTrash() ? null : h("button", { type: "button", class: "btn fi-more", title: "Everything about this item, including hidden details such as camera, location and checksums (Alt+Shift+Enter)", onclick: () => showMoreInfo([e.path]) }, "More info…"),
    inTrash() || e.isDir || !(isSqliteFile(e) || e.kind === "sqlite") ? null : h("button", { type: "button", class: "btn", title: "Open this database in SQLite Studio inside the Databases tool", onclick: () => openInSqliteStudio(e.path) }, "Open in SQLite Studio"),
    inTrash() || !(e.isDir || looksLikeText(e.name)) ? null : h("button", { type: "button", class: "btn", title: "Open it in the built-in code editor (Ctrl/Cmd+E)", onclick: () => (e.isDir ? openFolderInCode(e.path) : openInCode(e.path)) }, e.isDir ? "Open folder in Code editor" : "Edit in Code editor"),
    quickMediaBlock([e]),
  ].filter((part) => part !== null));
  const [preview, strip] = await Promise.all([previewFor(e), !inTrash() && mayHavePhotoDetails(e) ? photoStrip(e) : null]);
  if (mine === sequence && preview) box.insertBefore(preview, box.querySelector(".info-facts"));
  if (mine === sequence && strip) box.querySelector(".info-facts")?.after(strip);
}

export function wireInfo() {
  on("selection", renderInfo);
  on("view", renderInfo);
  on("settings", (change) => ("showInfoPanel" in change || Object.keys(change).length === 0) && renderInfo());
  on("toggle-info", () => saveSettings({ showInfoPanel: !state.settings.showInfoPanel }));
}
