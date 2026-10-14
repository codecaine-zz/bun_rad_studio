// The Details panel on the right: a picture or text preview and the basic facts about the selection.
import { call, rawUrl } from "./api.js";
import { showProperties } from "./extras.js";
import { $, clear, h, iconFor } from "./dom.js";
import { saveSettings, visibleEntries } from "./nav.js";
import { selectedEntries } from "./selection.js";
import { inTrash, on, state } from "./state.js";
import { baseName, formatDate, formatSize, plural } from "./util.js";

let sequence = 0;

function fact(label, value) {
  return value ? [h("dt", {}, label), h("dd", {}, value)] : [];
}

async function previewFor(entry) {
  if (entry.isDir || inTrash()) return null;
  try {
    const { preview } = await call("preview", { path: entry.path });
    if (preview.type === "image") return h("img", { class: "preview-image", src: rawUrl(entry.path), alt: `Preview of ${entry.name}` });
    if (preview.type === "text") return h("pre", { class: "preview-text", tabindex: "0", "aria-label": `Start of ${entry.name}` }, preview.text + (preview.truncated ? "\n…" : ""));
    if (preview.type === "binary") return h("p", { class: "hint" }, "No preview for this kind of file.");
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
    box.append(
      h("div", { class: "info-icon", "aria-hidden": "true" }, "🗂️"),
      h("h2", { class: "info-name" }, `${items.length} items selected`),
      h("dl", { class: "info-facts" }, ...fact("Folders", String(items.length - files.length)), ...fact("Files", String(files.length)), ...fact("Size of files", formatSize(files.reduce((n, e) => n + e.size, 0)))),
      h("button", { type: "button", class: "btn", onclick: () => showProperties(items.map((e) => e.path)) }, "Properties…"),
    );
    return;
  }
  const e = items[0];
  box.append(
    h("div", { class: "info-icon", "aria-hidden": "true" }, e.icon || iconFor(e.name, e.isDir)),
    h("h2", { class: "info-name" }, e.name),
    h("dl", { class: "info-facts" },
      ...fact("Type", e.label), ...fact("Size", e.isDir ? "" : formatSize(e.size)), ...fact(inTrash() ? "Deleted" : "Modified", formatDate(e.mtimeMs)),
      ...fact(inTrash() ? "Was in" : "Where", inTrash() ? e.where : state.search ? e.folder : baseName(state.location.path, state.sep))),
    inTrash() ? null : h("button", { type: "button", class: "btn", onclick: () => showProperties([e.path]) }, "Properties…"),
  );
  const preview = await previewFor(e);
  if (mine === sequence && preview) box.insertBefore(preview, box.querySelector(".info-facts"));
}

export function wireInfo() {
  on("selection", renderInfo);
  on("view", renderInfo);
  on("settings", (change) => ("showInfoPanel" in change || Object.keys(change).length === 0) && renderInfo());
  on("toggle-info", () => saveSettings({ showInfoPanel: !state.settings.showInfoPanel }));
}
