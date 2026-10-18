// Recent files: files you opened lately, shown in the sidebar, on the Home page and under the 🕘 Recent menu.
// You can turn recent files on or off, remove individual items, prune files that were deleted on disk, or clear the list.
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import { goTo, saveSettings } from "./nav.js";
import { emit, state } from "./state.js";
import { baseName, parentOf, plural } from "./util.js";

export const isRecentsEnabled = () => state.settings.recentsEnabled !== false;

/** Short human-readable time since `iso` (or "" when missing/epoch). */
export function formatRecentTime(iso) {
  if (!iso || typeof iso !== "string") return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 45) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

/** Opens a recent item through the File Manager's opener (`ops.openPath` listens for `recent-open`). */
export function openRecentItem(path) {
  emit("recent-open", path);
}

/** Opens the folder containing `path` in the Files view and selects the item. */
export async function openRecentFolder(path) {
  const parent = parentOf(path, state.sep);
  if (!parent) return openRecentItem(path);
  if (state.workspace === "home" || state.workspace === "tools") emit("workspace-go", "files");
  await goTo(parent, { select: path });
}

async function copyRecentPath(path) {
  try {
    const r = await call("copytext", { text: path });
    toast(r.copied ? "Path copied." : "Couldn't copy to the clipboard.", { kind: r.copied ? "success" : "error" });
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't copy to the clipboard.", { kind: "error" });
  }
}

/** Enables or disables recording and showing recent files. */
export async function setRecentsEnabled(enabled) {
  const next = Boolean(enabled);
  try {
    await saveSettings({ recentsEnabled: next });
    toast(next ? "Recent files turned on." : "Recent files turned off. Newly opened files won't be recorded.", {
      kind: "info",
      timeout: 3000,
    });
    return true;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't save your recent files setting.", { kind: "error" });
    return false;
  }
}

export const toggleRecentsEnabled = () => setRecentsEnabled(!isRecentsEnabled());

/** Removes a single file from the Recent list. */
export async function removeRecentItem(path) {
  const name = baseName(path, state.sep) || path;
  try {
    const recents = state.settings.recents.filter((r) => r.path !== path);
    await saveSettings({ recents });
    toast(`Removed "${name}" from Recent.`, { timeout: 2500 });
    return true;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't update Recent files.", { kind: "error" });
    return false;
  }
}

/** Clears all remembered items from the Recent list. */
export async function clearRecents() {
  if (!state.settings.recents.length) {
    toast("The Recent list is already empty.", { kind: "info", timeout: 2500 });
    return false;
  }
  try {
    await saveSettings({ recents: [] });
    toast("Cleared recent files.", { kind: "success", timeout: 2500 });
    return true;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't clear recent files.", { kind: "error" });
    return false;
  }
}

/** Drops items from Recent whose files are no longer on disk. */
export async function pruneMissingRecents() {
  try {
    const r = await call("recent/prune");
    state.settings = r.settings;
    emit("settings", { recents: r.settings.recents });
    toast(r.removed ? `Removed ${plural(r.removed, "missing file")} from Recent.` : "Every recent file is still on disk.", {
      kind: r.removed ? "success" : "info",
      timeout: 3000,
    });
    return r.removed;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't check the recent files.", { kind: "error" });
    return 0;
  }
}

/** The right-click menu for one recent file (in the sidebar or on the Home page). */
export function recentMenuItems(path) {
  const enabled = isRecentsEnabled();
  const hasAny = state.settings.recents.length > 0;
  return [
    { label: "Open", icon: "📄", action: () => openRecentItem(path) },
    { label: "Show in folder", icon: "📂", action: () => openRecentFolder(path) },
    { label: "Copy path", icon: "📋", action: () => copyRecentPath(path) },
    { separator: true },
    { label: "Remove from Recent", icon: "✕", action: () => removeRecentItem(path) },
    { label: "Remove missing files", icon: "🔍", disabled: !hasAny, action: () => pruneMissingRecents() },
    { label: "Clear recent files", icon: "🧹", danger: true, disabled: !hasAny, action: () => clearRecents() },
    { separator: true },
    { label: enabled ? "Turn off recent files" : "Turn on recent files", icon: enabled ? "⏸" : "▶", action: () => toggleRecentsEnabled() },
    { label: "Manage recent files…", icon: "⚙️", action: () => showRecentsManager() },
  ];
}

/** The Recent dropdown menu: jump to a recent file, turn recent files on or off, clear them, or open the manager. */
export function showRecentsMenu(anchor) {
  const enabled = isRecentsEnabled();
  const recents = state.settings.recents;
  const items = enabled
    ? recents.slice(0, 10).map((r) => {
        const when = formatRecentTime(r.at);
        return {
          label: baseName(r.path, state.sep) || r.path,
          icon: "🕘",
          tip: `${r.path}${when ? ` (${when})` : ""}`,
          action: () => openRecentItem(r.path),
        };
      })
    : [];
  if (!enabled) items.push({ label: "Recent files are turned off", disabled: true });
  else if (!items.length) items.push({ label: "No recent files yet", disabled: true });
  items.push({ separator: true });
  items.push({
    label: enabled ? "Turn off recent files" : "Turn on recent files",
    icon: enabled ? "⏸" : "▶",
    action: () => toggleRecentsEnabled(),
  });
  items.push({
    label: "Remove missing files",
    icon: "🔍",
    disabled: !recents.length,
    action: () => pruneMissingRecents(),
  });
  items.push({
    label: "Clear recent files",
    icon: "🧹",
    danger: true,
    disabled: !recents.length,
    action: () => clearRecents(),
  });
  items.push({
    label: "Manage recent files…",
    icon: "⚙️",
    action: () => showRecentsManager(),
  });
  showMenu(items, anchor instanceof HTMLElement ? { anchor, label: "Recent files" } : { ...anchor, label: "Recent files" });
}

/** The "Recent" section in the sidebar, with quick toggle, clear and manage buttons. */
export function recentSection(makeSideItem) {
  const enabled = isRecentsEnabled();
  const all = state.settings.recents;
  const head = h("div", { class: "side-head" },
    h("h2", { class: "side-title" }, "Recent"),
    h("button", {
      type: "button",
      class: "side-mini",
      dataset: { recentToggle: "" },
      "aria-pressed": String(enabled),
      title: enabled ? "Pause recent files (stop recording files you open)" : "Turn on recent files",
      "aria-label": enabled ? "Turn off recent files" : "Turn on recent files",
      onclick: toggleRecentsEnabled,
    }, enabled ? "⏸" : "▶"),
    all.length ? h("button", {
      type: "button",
      class: "side-mini",
      dataset: { recentClear: "" },
      title: "Clear recent files",
      "aria-label": "Clear recent files",
      onclick: clearRecents,
    }, "🧹") : null,
    h("button", {
      type: "button",
      class: "side-mini",
      dataset: { recentManage: "" },
      title: "Manage recent files (enable, disable, remove or clear)",
      "aria-label": "Manage recent files",
      onclick: showRecentsManager,
    }, "⚙"));

  let body;
  if (!enabled) {
    body = [h("p", { class: "side-hint" }, "Recent files are turned off. Press ▶ to turn them on.")];
  } else if (!all.length) {
    body = [h("p", { class: "side-hint" }, "Files you open appear here.")];
  } else {
    body = all.slice(0, 8).map((r) => {
      const when = formatRecentTime(r.at);
      return makeSideItem({
        icon: "🕘",
        label: baseName(r.path, state.sep) || r.path,
        title: `${r.path}${when ? ` — opened ${when}` : ""}`,
        onClick: () => openRecentItem(r.path),
        onMenu: (pt) => showMenu(recentMenuItems(r.path), { ...pt, label: "Recent file" }),
      });
    });
  }
  return h("section", { class: "side-section" }, head, ...body);
}

/** A dialog to enable/disable, filter, inspect, prune and clear recent files. */
export async function showRecentsManager() {
  const missingMap = new Map();
  let filterText = "";

  const toggleInput = h("input", {
    type: "checkbox",
    checked: isRecentsEnabled(),
    dataset: { recentEnabled: "" },
    onchange: async () => {
      await setRecentsEnabled(toggleInput.checked);
      render();
    },
  });
  const toggleLabel = h("label", { class: "check", title: "When on, files you open are added to Recent (up to 30 files). Turn off to stop recording new files." },
    toggleInput,
    h("span", {}, "Remember recently opened files"));

  const filterInput = h("input", {
    type: "search",
    class: "text-input",
    placeholder: "Filter recent files by name or folder…",
    "aria-label": "Filter recent files",
    spellcheck: "false",
    autocomplete: "off",
    dataset: { recentFilter: "" },
    oninput: () => {
      filterText = filterInput.value.trim().toLowerCase();
      render();
    },
  });

  const statusLine = h("p", { class: "hint", dataset: { recentStatus: "" } });
  const pruneBtn = h("button", {
    type: "button",
    class: "btn",
    dataset: { recentPrune: "" },
    title: "Remove entries for files that were moved or deleted on disk",
    onclick: async () => {
      await pruneMissingRecents();
      render();
    },
  }, "🔍 Remove missing files");
  const clearBtn = h("button", {
    type: "button",
    class: "btn danger",
    dataset: { recentClearAll: "" },
    title: "Forget the entire list of recently opened files (your files on disk are not touched)",
    onclick: async () => {
      await clearRecents();
      render();
    },
  }, "🧹 Clear all recent files");

  const controls = h("div", { class: "recent-controls" },
    toggleLabel,
    h("div", { class: "recent-bar" }, filterInput, pruneBtn, clearBtn),
    statusLine);

  const list = h("div", { class: "fav-list recent-list" });
  const dlg = openDialog({
    title: "Manage recent files",
    wide: true,
    describe: "Enable or disable recent files, filter the list, remove individual items or clear everything.",
    body: [controls, list],
    buttons: [{ label: "Done", value: "done", primary: true }],
  });

  function render() {
    clear(list);
    const all = state.settings.recents;
    const enabled = isRecentsEnabled();
    toggleInput.checked = enabled;
    pruneBtn.disabled = !all.length;
    clearBtn.disabled = !all.length;

    const filtered = filterText
      ? all.filter((r) => r.path.toLowerCase().includes(filterText) || baseName(r.path, state.sep).toLowerCase().includes(filterText))
      : all;

    const missingCount = all.filter((r) => missingMap.get(r.path) === true).length;
    const statusParts = [
      enabled ? `${plural(all.length, "recent file")} remembered (up to 30)` : `Recent files are turned off (${plural(all.length, "saved item")})`,
    ];
    if (missingCount > 0) statusParts.push(`${plural(missingCount, "missing file")} on disk`);
    if (filterText && all.length) statusParts.push(`showing ${filtered.length} of ${all.length}`);
    statusLine.textContent = `${statusParts.join(" · ")}. Removing or clearing only forgets the shortcut — your files on disk are never deleted.`;

    if (!all.length) {
      list.append(h("p", { class: "hint" }, enabled ? "No recent files yet. Files you open will be listed here." : "Recent files are turned off and the list is empty."));
      return;
    }
    if (!filtered.length) {
      list.append(h("p", { class: "hint" }, `No recent files match “${filterInput.value.trim()}”.`));
      return;
    }

    filtered.forEach((row) => {
      const own = baseName(row.path, state.sep) || row.path;
      const missing = missingMap.get(row.path) === true;
      const when = formatRecentTime(row.at);
      const exactWhen = row.at && !isNaN(Date.parse(row.at)) && Date.parse(row.at) > 0 ? new Date(row.at).toLocaleString() : "";
      list.append(h("div", { class: `fav-row recent-row${missing ? " fav-missing" : ""}`, dataset: { recentPath: row.path } },
        h("div", { class: "fav-main" },
          h("div", { class: "recent-title-row" },
            h("strong", { class: "recent-name" }, own),
            when ? h("span", { class: "recent-when", title: exactWhen }, `Opened ${when}`) : null),
          h("span", { class: "fav-path", title: row.path }, missing ? `${row.path}  (this file isn't there any more)` : row.path)),
        h("div", { class: "fav-actions" },
          h("button", {
            type: "button",
            class: "btn",
            disabled: missing,
            title: "Open this file",
            "aria-label": `Open ${own}`,
            onclick: () => { dlg.close(null); openRecentItem(row.path); },
          }, "Open"),
          h("button", {
            type: "button",
            class: "btn",
            title: "Open the folder this file is in and select it",
            "aria-label": `Show ${own} in folder`,
            onclick: () => { dlg.close(null); openRecentFolder(row.path); },
          }, "Show in folder"),
          h("button", {
            type: "button",
            class: "btn",
            title: "Copy the full path of this file",
            "aria-label": `Copy path of ${own}`,
            onclick: () => copyRecentPath(row.path),
          }, "Copy path"),
          h("button", {
            type: "button",
            class: "btn danger",
            title: "Take this file out of Recent (the file itself is not touched)",
            "aria-label": `Remove ${own} from Recent`,
            onclick: async () => {
              await removeRecentItem(row.path);
              render();
            },
          }, "Remove"))));
    });
  }

  render();

  async function checkMissing() {
    const queue = [...state.settings.recents];
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        try {
          const r = await call("typedpath", { text: row.path, cwd: state.home });
          missingMap.set(row.path, !r.exists || r.isDir);
        } catch {
          // ignore failed check
        }
      }
    }));
    if (list.isConnected) render();
  }
  checkMissing();

  return await dlg.result;
}
