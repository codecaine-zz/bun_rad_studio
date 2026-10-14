// The theme editor: make your own colour theme, or start from any other theme and change it. The whole window shows
// the theme while you edit (the server keeps text and buttons readable), and nothing is kept until you press Save.
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { debounce, h } from "./dom.js";
import { toast } from "./menus.js";
import { saveSettings } from "./nav.js";
import { emit, on, state } from "./state.js";
import { applyPalette, forgetThemeList, paint } from "./themes.js";

const EXPORT_FORMAT = "bun-rad-studio-file-manager-theme";

/** The colours people can change, with what each one does. `secondary` isn't shown: this window has no use for it. */
const FIELDS = [
  ["background", "Window background", "The main colour behind the list of files."],
  ["card", "Panels", "The toolbar, side panel, menus and dialogs."],
  ["text", "Text", "Names, labels and everything you read. It is adjusted a little if it would be hard to read."],
  ["accent", "Accent", "Selected items, links and the main buttons."],
  ["border", "Lines", "Borders and dividers."],
  ["danger", "Errors (red)", "Delete buttons and error messages."],
  ["warning", "Warnings (amber)", "Warnings, such as a file that isn't what its name says."],
  ["success", "Good news (green)", "Free space and finished jobs."],
  ["info", "Notes (blue)", "Hints and information."],
];

const STANDARD = {
  "standard-dark": { name: "Standard dark", dark: true, colors: { background: "#16191d", card: "#1e2329", text: "#e8eaed", accent: "#6ea8ff", border: "#353c46", danger: "#ff8a80", warning: "#fbbf24", success: "#7ee2a0", info: "#38bdf8" } },
  "standard-light": { name: "Standard light", dark: false, colors: { background: "#ffffff", card: "#f3f5f8", text: "#1b1f24", accent: "#0b5cd5", border: "#ccd2db", danger: "#b42318", warning: "#b45309", success: "#166534", info: "#0369a1" } },
};

const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v);

async function loadStart(key) {
  if (STANDARD[key]) return { ...structuredClone(STANDARD[key]), base: STANDARD[key].name, editingId: null };
  const r = await call("themes/get", { key });
  const custom = r.custom;
  return { name: custom ? custom.name : `${r.theme.name} (mine)`, dark: r.source.dark, colors: { ...r.source.colors }, base: custom ? custom.base : r.theme.name, editingId: custom ? custom.id : null };
}

async function openEditor({ from = "" } = {}) {
  let themes;
  try {
    themes = (await call("themes/list")).themes;
  } catch (err) {
    toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
    return;
  }
  const isDark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  let start;
  try {
    start = await loadStart(from || (isDark ? "standard-dark" : "standard-light"));
  } catch {
    start = await loadStart("standard-dark");
  }
  let draft = start;

  // -- the form ----------------------------------------------------------------------------------------------------
  const nameInput = h("input", { type: "text", class: "prop-input", maxlength: "40", "aria-label": "Theme name", title: "The name shown in the theme gallery.", value: draft.name });
  const darkBox = h("input", { type: "checkbox", checked: draft.dark, title: "Tick this when the background is dark. It decides the shadows and the colour of the browser's own controls." });
  const notes = h("p", { class: "hint theme-notes", role: "status" });
  const status = h("p", { class: "dialog-error", role: "alert", hidden: true });
  const startSelect = h("select", { class: "prop-input", "aria-label": "Start from", title: "Copy the colours of another theme to work from." });
  const heading = h("p", { class: "hint" });

  const rows = new Map();
  const field = ([key, label, tip]) => {
    const picker = h("input", { type: "color", class: "theme-color", "aria-label": `${label} colour picker`, title: tip, value: draft.colors[key] ?? "#808080" });
    const text = h("input", { type: "text", class: "prop-input theme-hex", maxlength: "7", spellcheck: "false", "aria-label": `${label} as a hex code`, title: `${tip} Type a code like #1a2b3c.`, value: draft.colors[key] ?? "" });
    const set = (value) => {
      if (!isHex(value)) { text.setAttribute("aria-invalid", "true"); return; }
      text.removeAttribute("aria-invalid");
      draft.colors[key] = value.toLowerCase();
      picker.value = draft.colors[key];
      text.value = draft.colors[key];
      refresh();
    };
    picker.addEventListener("input", () => set(picker.value));
    text.addEventListener("input", () => { if (isHex(text.value)) set(text.value); else text.setAttribute("aria-invalid", String(text.value !== "")); });
    rows.set(key, { picker, text });
    return h("div", { class: "theme-field" }, h("span", { class: "theme-field-label", title: tip }, label), picker, text);
  };

  /** Fills the form from `next` (a theme to start from, or imported text). */
  const load = (next) => {
    draft = next;
    nameInput.value = draft.name;
    darkBox.checked = draft.dark;
    for (const [key, { picker, text }] of rows) {
      const v = draft.colors[key] ?? "";
      text.removeAttribute("aria-invalid");
      text.value = v;
      if (isHex(v)) picker.value = v;
    }
    heading.textContent = draft.editingId ? `You are changing your theme "${draft.name}". Save replaces it; Save as a copy keeps it.` : draft.base ? `This is a new theme, started from ${draft.base}.` : "This is a new theme.";
    refresh();
  };

  const draftBody = () => ({ name: nameInput.value, dark: darkBox.checked, base: draft.base ?? "", colors: draft.colors });
  const refresh = debounce(async () => {
    try {
      const { theme } = await call("themes/preview", { theme: { ...draftBody(), name: nameInput.value.trim() || "Untitled" } });
      paint(theme, "preview");
      notes.textContent = theme.notes.join(" ");
      status.hidden = true;
    } catch (err) {
      status.textContent = err instanceof ApiError ? err.message : "That colour can't be shown.";
      status.hidden = false;
    }
  }, 120);
  darkBox.addEventListener("change", () => { draft.dark = darkBox.checked; refresh(); });
  nameInput.addEventListener("input", () => { draft.name = nameInput.value; });

  const groups = new Map();
  for (const t of themes) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  startSelect.append(
    h("optgroup", { label: "Plain" }, Object.entries(STANDARD).map(([k, v]) => h("option", { value: k }, v.name))),
    ...[...groups].map(([group, list]) => h("optgroup", { label: group }, list.map((t) => h("option", { value: t.key }, t.name)))),
  );
  startSelect.value = STANDARD[from] || themes.some((t) => t.key === from) ? from : isDark ? "standard-dark" : "standard-light";
  startSelect.addEventListener("change", async () => {
    try {
      load(await loadStart(startSelect.value));
    } catch (err) {
      toast(err?.message || "That theme couldn't be loaded.", { kind: "error" });
    }
  });

  const body = h("div", { class: "theme-editor" },
    heading,
    h("div", { class: "theme-meta" },
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Name"), nameInput),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Start from"), startSelect),
      h("label", { class: "check" }, darkBox, h("span", {}, "This is a dark theme"))),
    h("div", { class: "theme-fields" }, FIELDS.map(field)),
    h("div", { class: "theme-sample", "aria-label": "Sample of the colours" },
      h("button", { type: "button", class: "btn primary", tabindex: "-1" }, "Main button"),
      h("button", { type: "button", class: "btn", tabindex: "-1" }, "Button"),
      h("button", { type: "button", class: "btn danger", tabindex: "-1" }, "Delete"),
      h("span", { class: "hint" }, "Sample text in a hint")),
    notes, status,
    h("p", { class: "hint" }, "The whole window shows your colours while you edit. Nothing is kept until you press Save."));
  load(draft);

  // -- the buttons -------------------------------------------------------------------------------------------------
  const currentButtons = () => [
    { label: "Cancel", value: "cancel" },
    { label: "Import…", value: "import" },
    { label: "Export…", value: "export" },
    ...(draft.editingId ? [{ label: "Delete theme", value: "delete", danger: true }, { label: "Save as a copy", value: "copy" }] : []),
    { label: draft.editingId ? "Save" : "Save theme", value: "save", primary: true },
  ];

  // The import and export windows open over this one, so this one is shown again afterwards.
  const run = async () => {
    for (;;) {
      const answer = await openDialog({ title: "Theme editor", wide: true, body, buttons: currentButtons(), initialFocus: nameInput }).result;
      if (answer === "import") { await importText(); continue; }
      if (answer === "export") { await exportText(); continue; }
      if (answer === "delete") { if (await removeTheme()) return; continue; }
      if (answer === "save" || answer === "copy") { if (await save(answer === "copy")) return; continue; }
      return;
    }
  };
  async function save(asCopy) {
    try {
      const res = await call("themes/custom/save", { theme: draftBody(), id: asCopy ? undefined : draft.editingId ?? undefined });
      forgetThemeList();
      await saveSettings({ palette: res.id });
      toast(`Saved the theme "${res.name}".`, { kind: "success" });
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The theme couldn't be saved.", { kind: "error" });
      return false;
    }
  }

  async function removeTheme() {
    if (!(await confirmBox({ title: "Delete this theme?", message: `"${draft.name}" will be deleted for good. Export it first if you may want it back.`, confirmLabel: "Delete theme", danger: true }))) return false;
    try {
      await call("themes/custom/delete", { id: draft.editingId });
      forgetThemeList();
      if (state.settings.palette === draft.editingId) await saveSettings({ palette: "" });
      toast("The theme was deleted.", { kind: "success" });
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The theme couldn't be deleted.", { kind: "error" });
      return false;
    }
  }

  async function exportText() {
    const text = JSON.stringify({ format: EXPORT_FORMAT, version: 1, name: nameInput.value.trim(), dark: darkBox.checked, colors: draft.colors }, null, 2);
    const box = h("textarea", { class: "prop-input theme-export", readonly: true, rows: "10", "aria-label": "The theme as text", title: "Copy this text and keep it, or send it to someone. Import… turns it back into a theme." }, text);
    const d = openDialog({ title: "Export theme", body: [h("p", {}, "Copy this text to keep or share the theme."), box], buttons: [{ label: "Close", value: false }, { label: "Copy", value: true, primary: true }], initialFocus: box });
    if (await d.result) {
      try {
        await call("copytext", { text });
        toast("The theme text was copied.", { kind: "success" });
      } catch {
        toast("Couldn't copy. Select the text and copy it yourself.", { kind: "error" });
      }
    }
  }

  async function importText() {
    const box = h("textarea", { class: "prop-input theme-export", rows: "10", "aria-label": "Theme text to import", title: "Paste text that was made with Export…", placeholder: "Paste the theme text here" });
    const d = openDialog({ title: "Import theme", body: [h("p", {}, "Paste a theme that was exported from this editor. You can look at it and change it before saving."), box], buttons: [{ label: "Cancel", value: false }, { label: "Use this theme", value: true, primary: true }], initialFocus: box });
    if (!(await d.result)) return;
    try {
      const { theme } = await call("themes/custom/import", { text: box.value });
      load({ name: theme.name, dark: theme.dark, colors: { ...draft.colors, ...theme.colors }, base: "an imported theme", editingId: null });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That text isn't a theme.", { kind: "error" });
    }
  }

  try {
    await run();
  } finally {
    // Back to the saved choice: the new theme after Save, otherwise what was chosen before.
    await applyPalette(state.settings.palette || "");
    emit("theme-picker");
  }
}

on("theme-editor", (detail) => { openEditor(detail ?? {}); });
