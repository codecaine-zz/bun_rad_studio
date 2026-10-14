// Dialogs of the Code tab: the quick-open / command palette, Go to line, the regex sandbox, the shortcuts list,
// clipboard history and the questions about unsaved changes. Built on the File Manager's own dialog helper.
import { ApiError } from "./api.js";
import { debounce, h } from "./dom.js";
import { openDialog, promptBox } from "./dialogs.js";
import { fuzzyScore, runRegexSandbox } from "./codeLogic.js";

let paletteCount = 0;

/**
 * A search box with a list under it. `items`: [{ label, detail?, hint?, value }]. Arrow keys move, Enter picks,
 * Escape closes. Resolves nothing; `onPick(value)` is called when something is chosen.
 */
export function openPalette({ title, placeholder, items, onPick, empty = "Nothing matches." }) {
  const id = `code-pal-${++paletteCount}`;
  const input = h("input", { type: "text", class: "code-in code-pal-in", role: "combobox", "aria-expanded": "true", "aria-controls": id, "aria-autocomplete": "list", "aria-label": placeholder, placeholder, spellcheck: "false", autocomplete: "off" });
  const list = h("div", { class: "code-pal-list", role: "listbox", id, "aria-label": title });
  let all = items;
  let shown = [];
  let at = 0;
  let dlg;

  function draw() {
    const q = input.value.trim();
    shown = (q ? all.map((it) => ({ it, s: fuzzyScore(q, `${it.label} ${it.detail ?? ""}`) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s).map((x) => x.it) : all).slice(0, 100);
    at = Math.min(at, Math.max(0, shown.length - 1));
    list.replaceChildren(...(shown.length ? shown.map((it, i) => h("button", { type: "button", role: "option", id: `${id}-${i}`, class: `code-pal-item${i === at ? " code-pal-sel" : ""}`, "aria-selected": String(i === at), tabindex: "-1", title: it.detail ?? it.label, onclick: () => pick(i) },
      h("span", { class: "code-pal-label" }, it.label), it.detail ? h("span", { class: "code-pal-detail" }, it.detail) : null, it.hint ? h("span", { class: "code-pal-hint" }, it.hint) : null)) : [h("p", { class: "code-hint" }, empty)]));
    input.setAttribute("aria-activedescendant", shown.length ? `${id}-${at}` : "");
    list.children[at]?.scrollIntoView?.({ block: "nearest" });
  }

  function pick(i) {
    const item = shown[i];
    if (!item) return;
    dlg.close();
    onPick(item.value);
  }

  input.addEventListener("input", () => { at = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); at = Math.max(0, at - 1); draw(); }
    else if (e.key === "PageDown") { e.preventDefault(); at = Math.min(shown.length - 1, at + 8); draw(); }
    else if (e.key === "PageUp") { e.preventDefault(); at = Math.max(0, at - 8); draw(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(at); }
  });
  dlg = openDialog({ title, body: [input, list], buttons: [{ label: "Close", value: null }], wide: true, initialFocus: input });
  draw();
  return { close: () => dlg.close(), setItems(next) { all = next; draw(); } };
}

/** Asks for a line number ("12" or "12:5"). Resolves { line, col } or null. */
export function askLine(lineCount) {
  return promptBox({
    title: "Go to line", label: `Line number (1 to ${lineCount.toLocaleString()}), or line:column`, confirmLabel: "Go",
    hint: "For example 120, or 120:8 to also pick the column.",
    submit: (text) => {
      const m = /^\s*(\d+)(?:\s*[:,]\s*(\d+))?\s*$/.exec(text);
      if (!m || Number(m[1]) < 1) throw new ApiError(`Type a line number between 1 and ${lineCount.toLocaleString()}.`, "BAD_LINE", 0);
      return { line: Math.min(Number(m[1]), lineCount), col: Number(m[2] ?? 1) };
    },
  });
}

export const AUTOSAVE_DELAYS = [[500, "Half a second"], [1500, "1.5 seconds (recommended)"], [3000, "3 seconds"], [10000, "10 seconds"], [30000, "30 seconds"]];

/** The Autosave options. Resolves { autosave, autosaveDelay, autosaveOnBlur } or null when cancelled. */
export function askAutosave(current) {
  const on = h("input", { type: "checkbox", id: "autosave-on", checked: Boolean(current.autosave) });
  const blur = h("input", { type: "checkbox", id: "autosave-blur", checked: current.autosaveOnBlur !== false });
  const delay = h("select", { id: "autosave-delay", class: "prop-input", title: "How long to wait after you stop typing before saving." },
    AUTOSAVE_DELAYS.map(([ms, label]) => h("option", { value: String(ms), selected: ms === current.autosaveDelay }, label)));
  const sync = () => { delay.disabled = !on.checked; blur.disabled = !on.checked; };
  on.addEventListener("change", sync);
  sync();
  const d = openDialog({
    title: "Autosave",
    body: [
      h("p", {}, h("label", {}, on, " Save changes automatically")),
      h("p", {}, h("label", { for: "autosave-delay" }, "Wait "), delay, " after I stop typing"),
      h("p", {}, h("label", {}, blur, " Also save when I switch to another tab, panel or window")),
      h("p", { class: "code-hint" }, "Only files that already exist on disk are saved. A new file still needs Save As. A file that changed on disk behind your back is never overwritten by autosave."),
    ],
    buttons: [{ label: "Cancel", value: null }, { label: "OK", value: "ok", primary: true }],
  });
  return d.result.then((answer) => (answer === "ok" ? { autosave: on.checked, autosaveDelay: Number(delay.value), autosaveOnBlur: blur.checked } : null));
}

/** A place to try a regular expression on some sample text, with live results. */
export function openRegexSandbox(seedText = "") {
  const pattern = h("input", { type: "text", class: "code-in", spellcheck: "false", autocomplete: "off", "aria-label": "Pattern (regular expression)", title: "The regular expression to try, without slashes." });
  const flags = h("input", { type: "text", class: "code-in code-flags", value: "g", spellcheck: "false", autocomplete: "off", "aria-label": "Flags", title: "g = every match, i = ignore case, m = ^ and $ match at each line, s = dot matches line breaks" });
  const sample = h("textarea", { class: "code-in code-sample", rows: "6", spellcheck: "false", "aria-label": "Text to test the pattern on", title: "Paste or type the text the pattern should be tried on.", placeholder: "Text to test on…" });
  sample.value = seedText.slice(0, 20000);
  const status = h("p", { class: "code-panel-status", "aria-live": "polite" });
  const out = h("div", { class: "code-results code-sandbox-out" });
  const run = () => {
    const r = runRegexSandbox(pattern.value, flags.value, sample.value);
    out.replaceChildren();
    status.classList.toggle("code-bad", !!r.error);
    if (r.error) return void (status.textContent = r.error);
    status.textContent = !pattern.value ? "Type a pattern to begin." : r.matches.length ? `${r.matches.length}${r.truncated ? "+" : ""} ${r.matches.length === 1 ? "match" : "matches"}${r.timedOut ? " (stopped early: too slow)" : ""}.` : "No matches.";
    for (const [k, m] of r.matches.entries()) {
      out.append(h("div", { class: "code-sb-match" }, h("strong", {}, `#${k + 1} `), h("code", {}, m.text === "" ? "(empty match)" : m.text), h("span", { class: "code-hint" }, ` at line ${m.line}, column ${m.col}`),
        m.groups.length ? h("div", { class: "code-hint" }, m.groups.map((g, i) => `$${i + 1} = ${g === undefined ? "(not matched)" : JSON.stringify(g)}`).join("   ")) : null));
    }
  };
  const live = debounce(run, 120);
  for (const f of [pattern, flags, sample]) f.addEventListener("input", live);
  openDialog({
    title: "Regex sandbox", wide: true, initialFocus: pattern, buttons: [{ label: "Close", value: null, primary: true }],
    body: [h("p", { class: "code-hint" }, "Try a regular expression on some text before you use it in Find. Nothing here changes your file."),
      h("div", { class: "code-sb-row" }, h("label", { class: "code-field" }, "Pattern", pattern), h("label", { class: "code-field" }, "Flags", flags)), h("label", { class: "code-field" }, "Test text", sample), status, out],
  });
  run();
}

/** The list of keyboard shortcuts. `rows`: [{ group, label, shortcut }]. */
export function openShortcutsHelp(rows) {
  const groups = new Map();
  for (const r of rows) if (r.shortcut) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  openDialog({
    title: "Keyboard shortcuts", wide: true, buttons: [{ label: "Close", value: null, primary: true }],
    body: [...[...groups].map(([group, list]) => h("section", { class: "code-sc-group" }, h("h3", {}, group), h("dl", { class: "code-sc-list" }, list.flatMap((r) => [h("dt", {}, r.label), h("dd", {}, h("kbd", {}, r.shortcut))])))),
      h("p", { class: "code-hint" }, "Tip: press Esc and then Tab to move out of the text (Tab normally indents). Ctrl/Cmd+Shift+P lists every command, with its shortcut.")],
  });
}

/** Recent copies from this editor; choosing one pastes it. */
export function openClipboardHistory(items, onPick) {
  if (!items.length) return void openDialog({ title: "Clipboard history", body: h("p", {}, "Nothing yet. Text you copy or cut in the editor will be listed here."), buttons: [{ label: "OK", primary: true, value: true }] });
  const dlg = openDialog({
    title: "Clipboard history", wide: true, buttons: [{ label: "Close", value: null }],
    body: [h("p", { class: "code-hint" }, "The last things you copied or cut in this editor (kept only until you close the File Manager). Click one to paste it at the cursor."),
      h("div", { class: "code-results" }, items.map((text) => h("button", { type: "button", class: "code-res-line", title: "Paste this text at the cursor", onclick: () => { dlg.close(); onPick(text); } }, text.split("\n").slice(0, 2).join(" ↵ ").slice(0, 120), h("span", { class: "code-res-ln" }, `${text.length} chars`))))],
  });
}

/** Unsaved changes: resolves "save", "discard" or null (cancel). */
export function askUnsaved(names) {
  return openDialog({
    title: "Unsaved changes",
    body: [h("p", {}, names.length === 1 ? `"${names[0]}" has changes that aren't saved.` : `${names.length} files have changes that aren't saved:`), names.length > 1 ? h("ul", { class: "detail-list" }, names.slice(0, 8).map((n) => h("li", {}, n))) : null, h("p", { class: "code-hint" }, "Choose \"Don't save\" to throw the changes away.")],
    buttons: [{ label: "Cancel", value: null }, { label: "Don't save", value: "discard", danger: true }, { label: names.length === 1 ? "Save" : "Save all", value: "save", primary: true }],
  }).result;
}

/** The file changed on disk while there are unsaved edits. Resolves "overwrite", "reload", "copy" or null. */
export function askChangedOnDisk(name, deleted) {
  return openDialog({
    title: deleted ? "The file is gone" : "The file changed on disk",
    body: [h("p", {}, deleted ? `"${name}" was deleted or moved by another program.` : `"${name}" was changed by another program since you opened it.`), h("p", { class: "code-hint" }, deleted ? "You can save your copy back to the same place, or save it somewhere else." : "Your edits and the file on disk are different. Pick which one to keep, or save yours as a separate copy.")],
    buttons: deleted
      ? [{ label: "Cancel", value: null }, { label: "Save as…", value: "copy" }, { label: "Save here again", value: "overwrite", primary: true }]
      : [{ label: "Cancel", value: null }, { label: "Save as a copy…", value: "copy" }, { label: "Load the disk version", value: "reload", danger: true }, { label: "Overwrite the file", value: "overwrite", primary: true }],
  }).result;
}
