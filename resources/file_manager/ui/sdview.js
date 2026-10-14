// The results half of the Replace tool: the numbers, the table of matching files (with a tick box for each), and
// the diff of the selected file. Everything is built with h(); file names and file content only ever become text.
import { clear, h } from "./dom.js";
import { plural } from "./util.js";

const STATUS = {
  replaced: "Replaced ✓", changed: "Skipped: file was edited", protected: "Skipped: protected", failed: "Skipped: problem", already: "Already replaced",
  unchanged: "Nothing to change", restored: "Restored ✓", edited: "Left as it is", missing: "File is gone",
};

const formatMs = (ms) => (ms < 1000 ? `${Math.max(0, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`);

/** One sentence about what was left out, so a missing file never looks like a bug. */
export function describeNotes(stats) {
  const s = stats.skipped;
  const bits = [];
  if (s.binary) bits.push(`${plural(s.binary, "binary file")}`);
  if (s.large) bits.push(`${plural(s.large, "file")} over 5 MB`);
  if (s.notText) bits.push(`${plural(s.notText, "file")} that aren't UTF-8 text`);
  if (s.links) bits.push(`${plural(s.links, "link")}`);
  if (s.unreadable) bits.push(`${plural(s.unreadable, "item")} that couldn't be read`);
  const notes = [];
  if (bits.length) notes.push(`Left alone: ${bits.join(", ")}.`);
  if (stats.filesCapped) notes.push("Only the first 5000 files were looked at. Search a smaller folder to see the rest.");
  if (stats.replacementsCapped) notes.push("The search stopped at 100,000 replacements. Search a smaller folder, or use a more exact pattern.");
  return notes.join(" ");
}

/** Shows a unified diff with a colour AND a + / − mark on every changed line. */
export function renderDiff(host, text) {
  clear(host);
  for (const line of text.split("\n")) {
    let kind = "ctx";
    if (line.startsWith("+++ ") || line.startsWith("--- ")) kind = "meta";
    else if (line.startsWith("@@")) kind = "hunk";
    else if (line.startsWith("+")) kind = "add";
    else if (line.startsWith("-")) kind = "del";
    else if (line.startsWith("\\") || line.startsWith("…")) kind = "note";
    const marked = kind === "add" || kind === "del" || kind === "ctx";
    host.append(h("div", { class: `sd-line sd-${kind}` }, h("span", { class: "sd-mark" }, marked ? (kind === "add" ? "+" : kind === "del" ? "−" : " ") : ""), h("span", { class: "sd-code" }, marked ? line.slice(1) : line)));
  }
}

/** The numbers, the table and the diff. `actions`: onSelect(path), onTicks(). */
export function buildResults(actions) {
  const statNumbers = {};
  const stat = (key, label, tip) => {
    statNumbers[key] = h("strong", { class: "sd-stat-n" }, "0");
    return h("div", { class: "sd-stat", title: tip }, statNumbers[key], h("span", {}, label));
  };
  const notes = h("p", { class: "pw-hint", role: "status" });
  const stats = h("div", { class: "pw-row sd-stats", role: "group", "aria-label": "Numbers for the last run" },
    stat("scanned", "Files looked at", "How many text files were read."),
    stat("matched", "Files with matches", "How many of them contain what you are looking for."),
    stat("replacements", "Replacements", "How many places would change (or were changed)."),
    stat("time", "Time", "How long the search took."),
  );

  let result = null;
  let rowNotes = new Map();
  const ticked = new Set();
  let selected = null;
  const body = h("tbody");
  const all = h("input", { type: "checkbox", "aria-label": "Tick or untick every file", title: "Tick or untick every file that would change. Only ticked files are replaced." });
  const empty = h("p", { class: "pw-hint" }, "Nothing yet. Fill in Find and Where to look, then press Count matches or Preview changes.");
  const table = h("table", { class: "pw-table sd-table" },
    h("caption", { class: "sr-only" }, "Files that contain a match. Tick the files you want to replace in."),
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, all), h("th", { scope: "col" }, "File"), h("th", { scope: "col", class: "num" }, "Matches"), h("th", { scope: "col" }, "Lines changed"), h("th", { scope: "col" }, "Status"))),
    body,
  );
  const tableWrap = h("div", { class: "pw-table-wrap sd-tablewrap", hidden: true }, table);
  const summary = h("p", { class: "pw-status", role: "status" });
  const card = h("section", { class: "pw-card", "aria-label": "Matching files" }, h("h3", {}, "Matching files"), summary, empty, tableWrap);

  const canTick = (f) => result?.mode === "preview" && f.changed && !f.applied && !rowNotes.has(f.path);
  const statusOf = (f) => {
    const note = rowNotes.get(f.path);
    if (note) return { text: STATUS[note.status] ?? note.status, detail: note.message };
    if (result.mode === "count") return { text: "Match found", detail: "" };
    return f.changed ? { text: "Ready to replace", detail: "" } : { text: "Nothing would change", detail: "The replacement gives the same text." };
  };

  function refreshChecks() {
    const boxes = [...body.querySelectorAll("input[type=checkbox]")].filter((b) => !b.disabled);
    all.checked = boxes.length > 0 && boxes.every((b) => b.checked);
    all.disabled = boxes.length === 0;
    summary.textContent = result ? `${plural(ticked.size, "file")} ticked to replace, out of ${plural(result.files.length, "file")} with matches.` : "";
    actions.onTicks();
  }

  function render() {
    clear(body);
    empty.hidden = !!result && result.files.length > 0;
    tableWrap.hidden = !(result && result.files.length > 0);
    if (!result) {
      summary.textContent = "";
      return;
    }
    if (result.files.length === 0) empty.textContent = "No file contains a match. Check the spelling, or try ticking “Ignore capital letters”.";
    for (const f of result.files) {
      const name = f.path.slice(Math.max(f.path.lastIndexOf("/"), f.path.lastIndexOf("\\")) + 1);
      const dir = f.path.slice(0, f.path.length - name.length);
      const st = statusOf(f);
      const box = h("input", { type: "checkbox", disabled: !canTick(f), "aria-label": `Replace in ${name}`, title: canTick(f) ? "Tick to replace in this file." : result.mode === "count" ? "Press Preview changes to choose files." : "This file can't be replaced from this preview." });
      box.checked = ticked.has(f.path);
      box.addEventListener("change", () => {
        if (box.checked) ticked.add(f.path);
        else ticked.delete(f.path);
        refreshChecks();
      });
      const open = h("button", { type: "button", class: "sd-file", title: `Show the changes in ${name}.\n${f.path}`, onclick: () => select(f.path) }, h("span", { class: "sd-name" }, name), " ", h("span", { class: "sd-dir" }, dir));
      open.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const row = open.closest("tr")[e.key === "ArrowDown" ? "nextElementSibling" : "previousElementSibling"];
        const next = row?.querySelector(".sd-file");
        if (next) {
          e.preventDefault();
          next.focus();
          next.click();
        }
      });
      const lines = result.mode === "count" ? "—" : f.changed ? `+${f.added} / −${f.removed}` : "none";
      body.append(h("tr", { "data-path": f.path, "aria-selected": String(f.path === selected) },
        h("td", {}, box), h("td", {}, open), h("td", { class: "num" }, String(f.matches)), h("td", { class: "sd-lines" }, lines),
        h("td", { title: st.detail || null }, st.text, st.detail ? h("div", { class: "pw-hint" }, st.detail) : null)));
    }
    refreshChecks();
  }

  function select(path) {
    selected = path;
    for (const tr of body.children) tr.setAttribute("aria-selected", String(tr.dataset.path === path));
    actions.onSelect(path);
  }

  all.addEventListener("change", () => {
    for (const f of result?.files ?? []) {
      if (!canTick(f)) continue;
      if (all.checked) ticked.add(f.path);
      else ticked.delete(f.path);
    }
    for (const b of body.querySelectorAll("input[type=checkbox]")) if (!b.disabled) b.checked = all.checked;
    refreshChecks();
  });

  return {
    el: h("div", { class: "sd-results" }, h("section", { class: "pw-card", "aria-label": "Numbers" }, h("h3", {}, "What was found"), stats, notes), card),
    /** Shows a new result (or null). In a preview every file that would change starts ticked. */
    setResult(next) {
      result = next;
      rowNotes = new Map();
      ticked.clear();
      selected = null;
      if (next) {
        for (const f of next.files) if (canTick(f)) ticked.add(f.path);
        const s = next.stats;
        statNumbers.scanned.textContent = String(s.filesScanned);
        statNumbers.matched.textContent = String(s.filesMatched);
        statNumbers.replacements.textContent = String(s.replacements);
        statNumbers.time.textContent = formatMs(s.durationMs);
        notes.textContent = describeNotes(s);
      } else {
        for (const k of Object.keys(statNumbers)) statNumbers[k].textContent = k === "time" ? "0 ms" : "0";
        notes.textContent = "";
        empty.textContent = "Nothing yet. Fill in Find and Where to look, then press Count matches or Preview changes.";
      }
      render();
    },
    /** After a replace or undo: shows what happened to each file. `rows`: [{ path, status, message }]. */
    setRowNotes(rows) {
      for (const r of rows) {
        rowNotes.set(r.path, r);
        ticked.delete(r.path);
      }
      render();
    },
    ticked: () => [...ticked],
    tickedChanged: () => (result?.files ?? []).filter((f) => ticked.has(f.path) && f.changed),
    selected: () => selected,
    select,
    hasResult: () => result !== null,
    mode: () => result?.mode ?? null,
    id: () => result?.id ?? null,
    /** Lets the person's attention go to the first row after a run. */
    focusFirst: () => body.querySelector(".sd-file")?.focus(),
  };
}
