// The Details panel on the right: a picture or text preview and the basic facts about the selection.
import { call, rawUrl } from "./api.js";
import { openFolderInCode, openInCode } from "./code.js";
import { looksLikeText } from "./codeLang.js";
import { isSqliteFile, openInSqliteStudio } from "./dbFiles.js";
import { showProperties } from "./extras.js";
import { showMoreInfo } from "./fileinfo.js";
import { mayHavePhotoDetails, photoStrip } from "./fileinfoPhoto.js";
import { $, clear, h, iconForEntry } from "./dom.js";
import { saveSettings, visibleEntries } from "./nav.js";
import { octalOf, symbolicOf } from "./permsModel.js";
import { copyPathOf } from "./ops.js";
import { openPower } from "./power.js";
import { selectedEntries } from "./selection.js";
import { emit, inTrash, on, state } from "./state.js";
import { quickMediaBlock } from "./mediaQuick.js";
import { renderRichInfoSummary } from "./quicklookFormat.js";
import { editNoteDialog, noteForPath, setNoteForPath } from "./tags.js";
import { verdictBlock } from "./typecheck.js";
import { baseName, formatDate, formatSize, isDocumentPackageEntry, plural } from "./util.js";

let sequence = 0;

function fact(label, value) {
  return value ? [h("dt", {}, label), h("dd", {}, value)] : [];
}

function quickActionsStrip(items) {
  if (!Array.isArray(items) || items.length === 0 || inTrash()) return null;
  if (items.length === 1) {
    const e = items[0];
    const paths = [e.path];
    return h(
      "div",
      { class: "info-quick-actions", dataset: { infoQuickActions: "" }, role: "group", "aria-label": "Quick actions for selected item" },
      h(
        "button",
        {
          type: "button",
          class: "btn info-qa-btn",
          dataset: { infoAction: "quicklook" },
          title: "Preview this item right here without opening another program (Space)",
          onclick: () => emit("quicklook-open", e),
        },
        "👁️ Quick Look",
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn info-qa-btn",
          dataset: { infoAction: "copy-path" },
          title: "Copy the full path of this item to the clipboard",
          onclick: () => void copyPathOf([e]),
        },
        "📋 Copy Path",
      ),
      !e.isDir
        ? h(
            "button",
            {
              type: "button",
              class: "btn info-qa-btn",
              dataset: { infoAction: "ask-ai" },
              title: "Analyze or summarize this file with Ollama AI",
              onclick: () => openPower("ollama", { subTab: "assistant", paths }),
            },
            "🤖 Ask AI",
          )
        : null,
      !e.isDir
        ? h(
            "button",
            {
              type: "button",
              class: "btn info-qa-btn",
              dataset: { infoAction: "ask-bionic" },
              title: "Analyze this file with LM Studio Bionic AI Studio",
              onclick: () => openPower("bionic", { subTab: "assistant", paths }),
            },
            "🧬 Ask Bionic",
          )
        : null,
      !e.isDir && looksLikeText(e.name)
        ? h(
            "button",
            {
              type: "button",
              class: "btn info-qa-btn",
              dataset: { infoAction: "read-aloud" },
              title: "Read this file aloud using AI Speech TTS",
              onclick: () => openPower("ollama", { subTab: "speech", paths }),
            },
            "🔊 Read Aloud",
          )
        : null,
    );
  }
  const paths = items.map((x) => x.path);
  return h(
    "div",
    { class: "info-quick-actions", dataset: { infoQuickActions: "" }, role: "group", "aria-label": "Quick actions for selected items" },
    h(
      "button",
      {
        type: "button",
        class: "btn info-qa-btn",
        dataset: { infoAction: "copy-path" },
        title: "Copy the full paths of all selected items",
        onclick: () => void copyPathOf(items),
      },
      "📋 Copy Paths",
    ),
    h(
      "button",
      {
        type: "button",
        class: "btn info-qa-btn",
        dataset: { infoAction: "ask-ai" },
        title: "Analyze all selected items with Ollama AI",
        onclick: () => openPower("ollama", { subTab: "assistant", paths }),
      },
      `🤖 Ask AI (${items.length})`,
    ),
    h(
      "button",
      {
        type: "button",
        class: "btn info-qa-btn",
        dataset: { infoAction: "ask-bionic" },
        title: "Synthesize or compare all selected items with LM Studio Bionic",
        onclick: () => openPower("bionic", { subTab: "assistant", paths, synthesize: true, mode: "compare" }),
      },
      `🧬 Bionic (${items.length})`,
    ),
  );
}

function noteBlock(entry) {
  if (!entry?.path || inTrash()) return null;
  const note = noteForPath(entry.path);
  if (!note) {
    return h("button", {
      type: "button",
      class: "btn info-note-btn",
      dataset: { infoAddNote: "" },
      title: "Attach a persistent sticky note or reminder to this item",
      onclick: () => editNoteDialog(entry),
    }, "📝 Add sticky note…");
  }
  return h("div", { class: "info-note-card", dataset: { infoNoteCard: "" } },
    h("div", { class: "info-note-head" },
      h("span", { class: "info-note-title" }, "📝 Sticky Note"),
      h("div", { class: "info-note-actions" },
        h("button", {
          type: "button",
          class: "btn-link",
          dataset: { infoEditNote: "" },
          title: "Edit sticky note",
          onclick: () => editNoteDialog(entry),
        }, "Edit"),
        h("button", {
          type: "button",
          class: "btn-link",
          dataset: { infoClearNote: "" },
          title: "Remove sticky note",
          onclick: () => setNoteForPath(entry.path, ""),
        }, "Clear"),
      ),
    ),
    h("p", { class: "info-note-body" }, note),
  );
}

async function previewFor(entry) {
  if ((entry.isDir && !isDocumentPackageEntry(entry)) || inTrash()) return null;
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
    const folderLabel = inTrash() ? "Recycle Bin" : baseName(state.location.path, state.sep) || state.location.path;
    box.append(
      h("div", {
        class: "info-icon",
        "aria-hidden": "true",
        dataset: { entryName: folderLabel, isDir: "1", defaultIcon: inTrash() ? "🗑️" : "📂" },
      }, inTrash() ? "🗑️" : iconForEntry({ name: folderLabel, isDir: true, icon: "📂" })),
      h("h2", { class: "info-name" }, folderLabel),
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
      quickActionsStrip(items),
      h("button", { type: "button", class: "btn", onclick: () => showProperties(items.map((e) => e.path)) }, "Properties…"),
      h("button", { type: "button", class: "btn fi-more", title: "A summary of everything selected: total size, kinds of files and dates", onclick: () => showMoreInfo(items.map((e) => e.path)) }, "More info…"),
      quickMediaBlock(items),
    ].filter((part) => part !== null));
    return;
  }
  const e = items[0];
  // Node.append turns a null into the text "null", so the parts that don't apply are left out first.
  box.append(...[
    h("div", {
      class: "info-icon",
      "aria-hidden": "true",
      dataset: { entryName: e.name || "", isDir: e.isDir ? "1" : "0", defaultIcon: e.icon || "" },
    }, iconForEntry(e)),
    h("h2", { class: "info-name" }, e.name),
    h("dl", { class: "info-facts" },
      ...fact("Type", e.label), ...fact("Size", e.isDir && !isDocumentPackageEntry(e) ? "" : formatSize(e.size)), ...fact(inTrash() ? "Deleted" : "Modified", formatDate(e.mtimeMs)),
      ...fact("Permissions", !inTrash() && typeof e.mode === "number" ? `${symbolicOf(e.mode)} (${octalOf(e.mode)})` : ""),
      ...fact(inTrash() ? "Was in" : "Where", inTrash() ? e.where : state.search ? e.folder : baseName(state.location.path, state.sep))),
    quickActionsStrip([e]),
    noteBlock(e),
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
