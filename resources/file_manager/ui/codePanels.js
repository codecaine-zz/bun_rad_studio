// The side panels of the Code tab besides the Explorer: Search (find in all files), Git (what changed), Outline
// (the functions and headings of this file) and Bookmarks. Each returns { el, show() }.
import { ApiError } from "./api.js";
import { h } from "./dom.js";
import { extractSymbols } from "./codeLogic.js";
import { gitCall, searchFiles } from "./codeIO.js";
import { state } from "./state.js";

const input = (attrs) => h("input", { type: "text", class: "code-in", spellcheck: "false", autocomplete: "off", ...attrs });
const btn = (label, tip, run, cls = "") => h("button", { type: "button", class: `code-btn ${cls}`.trim(), title: tip, "aria-label": tip === label ? null : tip, onclick: run }, label);
const hint = (text) => h("p", { class: "code-hint" }, text);
const friendly = (err) => (err instanceof ApiError ? err.message : "That didn't work. Try again.");

/** Find in files. */
export function createSearchPanel({ getRoot, getHidden, onOpen }) {
  const flags = { caseSensitive: false, wholeWord: false, regex: false };
  const q = input({ placeholder: "Find in all files", "aria-label": "Find in all files of the folder", title: "Looks in every text file of the Explorer's folder. Enter starts the search." });
  const include = input({ placeholder: "Only files like *.ts, src/**", "aria-label": "Only search files matching", title: "Optional. Separate several patterns with commas. * means any letters, ** also crosses folders." });
  const status = h("div", { class: "code-panel-status", "aria-live": "polite" });
  const results = h("div", { class: "code-results" });
  const toggle = (label, tip, key) => {
    const b = h("button", { type: "button", class: "code-btn code-tog", "aria-pressed": "false", title: tip, "aria-label": tip, onclick: () => { flags[key] = !flags[key]; b.setAttribute("aria-pressed", String(flags[key])); } }, label);
    return b;
  };
  let busy = false;

  async function run() {
    const root = getRoot();
    if (!root) return void (status.textContent = "Open a folder first.");
    if (!q.value || busy) return;
    busy = true;
    status.textContent = "Searching…";
    results.replaceChildren();
    try {
      const r = await searchFiles({ root, query: q.value, include: include.value, hidden: getHidden(), ...flags });
      const byFile = new Map();
      for (const m of r.matches) byFile.set(m.path, [...(byFile.get(m.path) ?? []), m]);
      for (const [path, list] of byFile) {
        results.append(h("div", { class: "code-res-file", title: path }, path, h("span", { class: "code-res-count" }, ` ${list.length}`)));
        for (const m of list) {
          const at = Math.max(0, m.col - 1);
          results.append(h("button", { type: "button", class: "code-res-line", title: `Open ${path} at line ${m.line}`, onclick: () => onOpen(`${root}${state.sep}${path.replaceAll("/", state.sep)}`, m.line, m.col, m.length) },
            h("span", { class: "code-res-ln" }, String(m.line)), m.text.slice(0, at).trimStart(), h("mark", {}, m.text.slice(at, at + m.length)), m.text.slice(at + m.length)));
        }
      }
      const note = [r.truncated ? "Showing the first 1000 matches." : "", r.timedOut ? "The search took too long and was stopped; try a narrower search." : "", r.fileListTruncated ? "The folder is very big, so not every file was searched." : "", r.skippedBinary ? `${r.skippedBinary} non-text ${r.skippedBinary === 1 ? "file was" : "files were"} skipped.` : ""].filter(Boolean).join(" ");
      status.textContent = r.matches.length ? `${r.matches.length} ${r.matches.length === 1 ? "match" : "matches"} in ${byFile.size} ${byFile.size === 1 ? "file" : "files"}. ${note}` : `No matches in ${r.filesSearched} files. ${note}`;
    } catch (err) {
      status.textContent = friendly(err);
    } finally {
      busy = false;
    }
  }
  q.addEventListener("keydown", (e) => e.key === "Enter" && run());
  include.addEventListener("keydown", (e) => e.key === "Enter" && run());
  const el = h("div", { class: "code-panel" }, h("div", { class: "code-panel-head" }, q, h("div", { class: "code-row-tools" }, toggle("Aa", "Match upper and lower case exactly", "caseSensitive"), toggle("ab", "Match whole words only", "wholeWord"), toggle(".*", "Treat the text as a regular expression", "regex"), btn("Search", "Search all files in the folder", run, "primary")), include), status, results);
  return { el, show: () => q.focus(), focusWith(text) { if (text) q.value = text; q.focus(); q.select(); }, run };
}

/** Git: the files that changed, and what changed in each. */
export function createGitPanel({ getRoot, onOpen, onDiff }) {
  const list = h("div", { class: "code-results" });
  const status = h("div", { class: "code-panel-status", "aria-live": "polite" });
  let top = "";

  async function refresh() {
    const root = getRoot();
    if (!root) return void (status.textContent = "Open a folder first.");
    status.textContent = "Asking Git…";
    list.replaceChildren();
    try {
      const r = await gitCall({ root, action: "status" });
      if (!r.available || !r.isRepo || r.message) return void (status.textContent = r.message ?? "");
      top = r.root;
      const where = r.branch ? `On branch ${r.branch}${r.ahead ? `, ${r.ahead} to push` : ""}${r.behind ? `, ${r.behind} to pull` : ""}. ` : "";
      status.textContent = r.files.length ? `${where}${r.files.length} changed ${r.files.length === 1 ? "file" : "files"}. Click one to see what changed.` : `${where}Nothing has changed since the last commit.`;
      for (const f of r.files) {
        const full = `${top}${state.sep}${f.path.replaceAll("/", state.sep)}`;
        list.append(h("div", { class: "code-git-row" },
          h("span", { class: "code-git-tag", title: f.label }, `${f.x === " " ? "" : f.x}${f.y === " " ? "" : f.y}`.trim() || "·"),
          h("button", { type: "button", class: "code-res-line", title: `See what changed in ${f.path}`, onclick: () => showDiff(f, full) }, f.path, h("span", { class: "code-hint" }, ` (${f.label})`)),
          btn("Open", `Open ${f.path} in the editor`, () => onOpen(full)),
        ));
      }
    } catch (err) {
      status.textContent = friendly(err);
    }
  }

  async function showDiff(f, full) {
    if (f.x === "?" || f.label === "deleted") {
      if (f.label !== "deleted") return onOpen(full);
    }
    try {
      const r = await gitCall({ root: top, action: "diff", file: f.path });
      if (!r.diff) return f.label === "deleted" ? onDiff(`Deleted: ${f.path}`, (await gitCall({ root: top, action: "show", file: f.path })).text ?? "", "plain") : onOpen(full);
      onDiff(`Changes: ${f.path}`, r.diff + (r.truncated ? "\n… (the rest is too long to show)\n" : ""), "diff");
    } catch (err) {
      status.textContent = friendly(err);
    }
  }

  const el = h("div", { class: "code-panel" }, h("div", { class: "code-panel-head" }, btn("⟳ Refresh", "Ask Git what changed", refresh)), status, list, hint("Read only: this panel only looks at your changes. It never commits or changes anything."));
  return { el, show: refresh, refresh };
}

const KIND_ICON = { function: "ƒ", method: "ƒ", class: "◆", interface: "◇", type: "◇", enum: "▤", struct: "◆", heading: "§", key: "•", rule: "#", "at-rule": "@", section: "§", target: "▶", table: "▦", view: "▦", stage: "▶", file: "▤" };

/** Outline of the open file. */
export function createOutlinePanel({ getDoc, onGo }) {
  const filter = input({ placeholder: "Filter", "aria-label": "Filter the outline", title: "Type part of a name to narrow the list." });
  const list = h("div", { class: "code-results" });
  const draw = () => {
    const doc = getDoc();
    list.replaceChildren();
    if (!doc) return void list.append(hint("Open a file to see its outline."));
    const symbols = extractSymbols(doc.text, doc.lang);
    const needle = filter.value.trim().toLowerCase();
    const shown = symbols.filter((s) => !needle || s.name.toLowerCase().includes(needle));
    if (!shown.length) list.append(hint(symbols.length ? "Nothing matches the filter." : "No functions, classes or headings were found in this file."));
    for (const s of shown.slice(0, 1500)) {
      list.append(h("button", { type: "button", class: `code-res-line code-out-${Math.min(s.level, 6)}`, title: `${s.kind} on line ${s.line}`, onclick: () => onGo(s.line) },
        h("span", { class: "code-out-icon", "aria-hidden": "true" }, KIND_ICON[s.kind] ?? "·"), h("span", {}, s.name), h("span", { class: "code-res-ln" }, String(s.line))));
    }
  };
  filter.addEventListener("input", draw);
  return { el: h("div", { class: "code-panel" }, h("div", { class: "code-panel-head" }, filter), list), show: draw, update: draw };
}

/** Bookmarks of every open file. */
export function createBookmarksPanel({ getDocs, onGo, onClear }) {
  const list = h("div", { class: "code-results" });
  const draw = () => {
    list.replaceChildren();
    let any = false;
    for (const doc of getDocs()) {
      if (!doc.bookmarks.length) continue;
      any = true;
      list.append(h("div", { class: "code-res-file", title: doc.path || doc.name }, doc.name));
      const lines = doc.text.split("\n");
      for (const n of doc.bookmarks) {
        list.append(h("button", { type: "button", class: "code-res-line", title: `Go to line ${n} of ${doc.name}`, onclick: () => onGo(doc, n) }, h("span", { class: "code-res-ln" }, String(n)), (lines[n - 1] ?? "").trim().slice(0, 120) || "(empty line)"));
      }
    }
    if (!any) list.append(hint("No bookmarks yet. Press Ctrl/Cmd+F2 on a line to mark it, then F2 and Shift+F2 jump between marks."));
  };
  return { el: h("div", { class: "code-panel" }, h("div", { class: "code-panel-head" }, btn("Clear all", "Remove every bookmark in the open files", () => onClear())), list), show: draw, update: draw };
}
