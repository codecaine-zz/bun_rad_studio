// A small "choose a folder" window for the Find tool: the sidebar places, a box to type or paste a location, and the
// folders inside the current one. It only lists and chooses; it never changes anything.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { openDialog } from "./dialogs.js";
import { state } from "./state.js";

/**
 * Asks the person for a folder. Resolves with its full path, or null when they cancel.
 * @param {{ title: string, start?: string, confirmLabel?: string }} options
 */
export async function pickFolder({ title, start = "", confirmLabel = "Choose this folder" }) {
  let current = "";
  let loadId = 0;
  const here = h("p", { class: "find-picker-here", "aria-live": "polite" });
  const list = h("ul", { class: "find-picker-list", "aria-label": "Folders in this location" });
  const places = h("div", { class: "find-picker-places", role: "group", "aria-label": "Places" });
  // A one-line text area rather than an input: the dialog treats Enter in an input as "choose", but here Enter means "go there".
  const pathBox = h("textarea", {
    rows: "1", class: "find-input find-picker-path", spellcheck: "false", autocomplete: "off", "aria-label": "Folder location",
    title: "Type or paste a folder location (for example ~/Documents) and press Enter to go there",
    onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); go(pathBox.value.trim()); } },
  });
  const message = (text) => list.replaceChildren(h("li", { class: "pw-hint" }, text));

  async function load(path) {
    const mine = ++loadId;
    try {
      const res = await call("list", { path, showHidden: false });
      if (mine !== loadId) return;
      current = res.path;
      pathBox.value = res.path;
      here.textContent = `Folder to choose: ${res.path}`;
      const folders = res.entries.filter((e) => e.isDir);
      const items = [];
      if (res.parent) items.push(entry("⬆️ Up one folder", res.parent, "Go to the folder that contains this one"));
      for (const f of folders) items.push(entry(`📁 ${f.name}`, f.path, `Open the folder ${f.name}`));
      if (!folders.length) items.push(h("li", { class: "pw-hint" }, "There are no folders in here. You can still choose this one."));
      list.replaceChildren(...items);
      dlg.setError("");
    } catch (err) {
      if (mine !== loadId) return;
      dlg.setError(err instanceof ApiError ? err.message : "That folder couldn't be opened.");
    }
  }

  async function go(text) {
    if (!text) return;
    try {
      const res = await call("typedpath", { text, cwd: current || state.home });
      if (!res.isDir) return dlg.setError(res.exists ? "That is a file, not a folder." : "That folder doesn't exist.");
      await load(res.path);
    } catch (err) {
      dlg.setError(err instanceof ApiError ? err.message : "That location isn't valid.");
    }
  }

  const entry = (label, path, tip) => h("li", {}, h("button", { type: "button", class: "find-picker-item", title: tip, onclick: () => load(path) }, label));

  for (const p of [...state.places, ...state.drives]) {
    places.append(h("button", { type: "button", class: "pw-btn find-picker-place", title: `Go to ${p.name}: ${p.path}`, onclick: () => load(p.path) }, `${p.icon ?? "📁"} ${p.name}`));
  }

  const dlg = openDialog({
    title,
    wide: true,
    body: [
      h("p", { class: "pw-hint" }, "Pick a place, open folders by clicking them, or type a location and press Enter. Then press the blue button."),
      places,
      h("div", { class: "pw-row" },
        h("label", { class: "pw-field find-grow" }, "Location", pathBox),
        h("button", { type: "button", class: "pw-btn", title: "Go to the location you typed", onclick: () => go(pathBox.value.trim()) }, "Go")),
      here,
      list,
    ],
    buttons: [{ label: "Cancel", value: null }, { label: confirmLabel, value: "ok", primary: true }],
    initialFocus: pathBox,
  });
  message("Opening…");
  load(start || state.home);
  return (await dlg.result) === "ok" ? current || null : null;
}
