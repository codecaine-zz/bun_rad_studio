// The search form of the Find tool: what to look for, where, and every filter. It only collects the values (read)
// and tells the caller when the person wants a search; it never talks to the server itself.
import { h } from "./dom.js";
import { pickFolder } from "./findPicker.js";
import { button, checkbox, dropdown, field, row, textInput } from "./findUi.js";
import { state } from "./state.js";

const MODES = [
  { value: "regex", label: "Pattern (regex)" },
  { value: "glob", label: "Wildcards (glob)" },
  { value: "fixed", label: "Plain text" },
];
const CASES = [
  { value: "smart", label: "Smart (match case only if you type capitals)" },
  { value: "sensitive", label: "Match case" },
  { value: "ignore", label: "Ignore case" },
];
const SHOW = [
  { value: "all", label: "Everything" },
  { value: "file", label: "Files only" },
  { value: "directory", label: "Folders only" },
  { value: "executable", label: "Programs" },
  { value: "symlink", label: "Links (shortcuts)" },
  { value: "empty", label: "Empty files and folders" },
];
const AGES = [
  { value: "", label: "Any time" },
  { value: "10m", label: "Last 10 minutes" },
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

/**
 * @param {{ onSearch: () => void, onClear: () => void, onLive: (on: boolean) => void, onPreset: (label: string) => void, onRecent: (text: string) => void }} hooks
 */
export function createForm(hooks) {
  const pattern = textInput({ placeholder: "Part of a name, like report", label: "What to look for", tip: "Type part of the name you are looking for. Leave it empty to list everything. Press Enter to search.", width: "l", onenter: hooks.onSearch });
  const root = textInput({ placeholder: "Folder to search in", label: "Folder to search in", tip: "The folder to search. Everything inside it is searched too. Type a location or use Browse.", width: "l", onenter: hooks.onSearch });
  const browse = button("📁 Browse…", async () => {
    const chosen = await pickFolder({ title: "Search in which folder?", start: root.value.trim() || state.home, confirmLabel: "Search this folder" });
    if (chosen) {
      root.value = chosen;
      hooks.onSearch();
    }
  }, { tip: "Pick the folder to search from a list of your folders" });
  const search = button("🔍 Find", hooks.onSearch, { primary: true, tip: "Start the search (you can also press Enter in a text box)" });
  const clear = button("✕ Reset", hooks.onClear, { tip: "Clear the filters and search again with the defaults" });

  const mode = dropdown(MODES, { label: "How to read the text", tip: "Pattern (regex) understands patterns like ^a.*\\.txt$. Wildcards (glob) understand * and ?. Plain text looks for exactly what you typed." });
  const caseMode = dropdown(CASES, { label: "Capital letters", tip: "Smart: capitals matter only if you type a capital letter yourself." });
  const show = dropdown(SHOW, { label: "Show", tip: "Limit the results to one kind of item" });
  const preset = dropdown([{ value: "", label: "Presets…" }], { label: "Ready-made searches", tip: "Fill in the form with a ready-made search, like Images or Large files, and run it", onchange: () => { if (preset.value) hooks.onPreset(preset.value); preset.value = ""; } });
  const recent = dropdown([{ value: "", label: "Recent searches…" }], { label: "Recent searches", tip: "Search again for something you looked for earlier in this window", onchange: () => { if (recent.value) hooks.onRecent(recent.value); recent.value = ""; } });
  const max = textInput({ value: "1500", type: "number", label: "Most results to show", tip: "The most matches to collect (1 to 20,000). A smaller number is faster.", width: "s" });
  max.min = "1";
  max.max = "20000";

  const exts = textInput({ placeholder: "ts, tsx, json", label: "File endings", tip: "Only show files with these endings (extensions), separated by commas. Leave empty for any.", width: "m", onenter: hooks.onSearch });
  const exclude = textInput({ value: "node_modules,dist,.git", label: "Leave out", tip: "Names to skip, separated by commas. Wildcards like *.log work. Skipped folders are not searched at all.", width: "m", onenter: hooks.onSearch });
  const minDepth = textInput({ type: "number", label: "Smallest depth", tip: "Skip items that are less than this many folders down. 1 = start with the items directly inside the folder.", width: "s", onenter: hooks.onSearch });
  const maxDepth = textInput({ type: "number", label: "Largest depth", tip: "Do not go deeper than this many folders. 1 = only the items directly inside the folder.", width: "s", onenter: hooks.onSearch });
  for (const d of [minDepth, maxDepth]) { d.min = "0"; d.max = "64"; }
  const size = textInput({ placeholder: "+1M or -10k", label: "Size", tip: "+1M means bigger than 1 MB, -10k means smaller than 10 KB, 500k means about 500 KB. Units: k, M, G.", width: "s", onenter: hooks.onSearch });
  const modified = dropdown(AGES, { label: "Changed", tip: "Only show items that were changed within this time" });

  const hidden = checkbox("Include hidden items", { tip: "Also search files and folders whose names start with a dot" });
  const noIgnore = checkbox("Don't skip ignored items", { tip: "Also search inside node_modules, .git and the files listed in a .gitignore file" });
  const follow = checkbox("Follow links", { tip: "Also search inside folders that shortcuts (symbolic links) point to. The search goes at most 20 folders deep when this is on." });
  const fullPath = checkbox("Match the whole path", { tip: "Look for the text in the whole location (like src/app/main.ts), not just in the name" });
  const live = checkbox("Live: search again when files change", { tip: "Keep watching the folder and update the results by themselves when something inside it changes", onchange: () => hooks.onLive(live.input.checked) });

  const el = h("section", { class: "pw-card find-form", "aria-label": "Search" },
    h("h3", {}, "Find files and folders"),
    row(field("What to look for", pattern, "Part of a name, a pattern or a wildcard"), field("Where to look", root, "The folder to search"), browse, search, clear),
    row(field("How to read it", mode), field("Capital letters", caseMode), field("Show", show), field("Ready-made", preset), field("Recent", recent), field("Most results", max)),
    h("details", { class: "find-more" },
      h("summary", { title: "More ways to narrow the search: file endings, size, age, depth and more" }, "More filters"),
      row(field("File endings", exts), field("Leave out", exclude), field("Smallest depth", minDepth), field("Largest depth", maxDepth), field("Size", size), field("Changed", modified)),
      row(hidden.el, noIgnore.el, follow.el, fullPath.el),
    ),
    row(live.el),
  );

  const words = (text) => text.split(/[,;\s]+/).filter(Boolean);

  return {
    el,
    /** The request body for find/search. */
    read() {
      const body = {
        root: root.value.trim(),
        pattern: pattern.value,
        mode: mode.value,
        caseMode: caseMode.value,
        type: show.value,
        extensions: words(exts.value),
        exclude: words(exclude.value),
        size: size.value.trim(),
        modified: modified.value,
        hidden: hidden.input.checked,
        noIgnore: noIgnore.input.checked,
        followSymlinks: follow.input.checked,
        fullPath: fullPath.input.checked,
        maxResults: Number(max.value) || 1500,
      };
      if (minDepth.value !== "") body.minDepth = Number(minDepth.value);
      if (maxDepth.value !== "") body.maxDepth = Number(maxDepth.value);
      return body;
    },
    setValues(v) {
      if (v.pattern !== undefined) pattern.value = v.pattern;
      if (v.root !== undefined) root.value = v.root;
      if (v.exts !== undefined) exts.value = v.exts.split(",").join(", ");
      if (v.size !== undefined) size.value = v.size;
      if (v.modified !== undefined) modified.value = v.modified;
      if (v.type !== undefined) show.value = v.type;
    },
    reset() {
      pattern.value = "";
      exts.value = "";
      size.value = "";
      minDepth.value = "";
      maxDepth.value = "";
      modified.value = "";
      show.value = "all";
      mode.value = "regex";
      caseMode.value = "smart";
      for (const c of [hidden, noIgnore, follow, fullPath]) c.input.checked = false;
    },
    getRoot: () => root.value.trim(),
    hasRoot: () => root.value.trim() !== "",
    focusPattern: () => pattern.focus(),
    setBusy(on) {
      search.disabled = on;
      search.textContent = on ? "Searching…" : "🔍 Find";
    },
    setPresets(list) {
      preset.replaceChildren(h("option", { value: "" }, "Presets…"), ...list.map((p) => h("option", { value: p.label }, p.label)));
    },
    setHistory(list) {
      recent.replaceChildren(h("option", { value: "" }, "Recent searches…"), ...list.map((t) => h("option", { value: t }, t)));
    },
    setPattern: (text) => { pattern.value = text; },
    isLive: () => live.input.checked,
    setLive: (on) => { live.input.checked = on; },
  };
}
