// Looking closer at the results: search inside the files, find duplicate files, the biggest files, and how much room
// each kind of file takes. They work on the results that are shown (or the selected ones).
import { call } from "./api.js";
import { h } from "./dom.js";
import { fs, scopeItems, targetBody } from "./findStore.js";
import { attempt, button, card, checkbox, field, guarded, row, textInput } from "./findUi.js";
import { toast } from "./menus.js";
import { baseName, formatSize, plural } from "./util.js";
import { state } from "./state.js";

/** @param {{ reveal: (path: string) => boolean }} hooks */
export function createAnalyze(hooks) {
  const query = textInput({ label: "Text to find inside the files", placeholder: "Text to look for inside the files", tip: "Look inside the text files among the results for these words. Press Enter to search.", width: "l", onenter: () => findText() });
  const regex = checkbox("Pattern (regex)", { tip: "Treat the text as a regular expression. Advanced." });
  const matchCase = checkbox("Match capital letters", { tip: "Only find text with exactly the same capital letters" });
  const out = h("div", { class: "find-analysis", role: "region", "aria-label": "Results of the analysis", "aria-live": "polite", tabindex: "-1" });

  const link = (path, label) => h("button", {
    type: "button", class: "find-link", title: `Select this item in the results: ${path}`,
    onclick: () => { if (!hooks.reveal(path)) toast("That item isn't in the results that are shown now.", { kind: "info" }); },
  }, label ?? baseName(path, state.sep));

  const table = (headings, rows, label) => h("div", { class: "pw-table-wrap find-analysis-wrap" }, h("table", { class: "pw-table", "aria-label": label },
    h("thead", {}, h("tr", {}, headings.map((t) => h("th", { scope: "col", class: t.num ? "num" : "" }, t.text)))),
    h("tbody", {}, rows.map((cells) => h("tr", {}, cells.map((c, i) => h("td", { class: headings[i]?.num ? "num" : "" }, c)))))));

  const show = (...children) => out.replaceChildren(...children.filter(Boolean));
  const body = () => {
    if (!fs.resultId || scopeItems().length === 0) {
      toast(fs.scope === "selected" ? "Select some results first." : "There are no results to look at. Search first.", { kind: "info" });
      return null;
    }
    return targetBody();
  };

  async function findText() {
    const text = query.value;
    if (!text) return toast("Type the text to look for inside the files.", { kind: "info" });
    const target = body();
    if (!target) return undefined;
    show(h("p", { class: "pw-hint" }, "Looking inside the files…"));
    const res = await attempt(() => call("find/grep", { ...target, query: text, regex: regex.input.checked, matchCase: matchCase.input.checked }));
    if (!res) return show(h("p", { class: "pw-bad" }, "The search inside the files didn't work."));
    show(
      h("p", { class: res.matches.length ? "pw-ok" : "pw-hint", role: "status" }, `${plural(res.matches.length, "line")} found in ${plural(res.filesWithHits, "file")} (looked in ${plural(res.filesScanned, "text file")}${res.truncated ? "; stopped at the limit, so there may be more" : ""}). Binary, empty and very big files are skipped.`),
      res.matches.length ? table([{ text: "File" }, { text: "Line", num: true }, { text: "Text" }], res.matches.map((m) => [link(m.path, m.relativePath), String(m.line), h("span", { class: "pw-mono" }, m.text)]), "Lines that contain the text") : null,
    );
    return undefined;
  }

  async function findDupes() {
    const target = body();
    if (!target) return;
    show(h("p", { class: "pw-hint" }, "Comparing files… (big sets can take a while)"));
    const res = await attempt(() => call("find/dupes", target));
    if (!res) return show(h("p", { class: "pw-bad" }, "The comparison didn't work."));
    if (!res.totalGroups) {
      show(h("p", { class: "pw-ok", role: "status" }, `No identical files were found among the results.${res.skippedTooBig ? ` ${plural(res.skippedTooBig, "file")} over 256 MB were left out.` : ""}`));
      return;
    }
    show(
      h("p", { class: "pw-bad", role: "status" }, `${plural(res.totalGroups, "group")} of identical files; ${formatSize(res.wastedBytes)} could be saved by keeping one of each.${res.totalGroups > res.groups.length ? ` Showing the first ${res.groups.length}.` : ""}${res.skippedTooBig ? ` ${plural(res.skippedTooBig, "file")} over 256 MB were left out.` : ""}`),
      ...res.groups.map((g, i) => h("div", { class: "find-dupe" },
        h("p", { class: "find-sub" }, `Group ${i + 1}: ${plural(g.paths.length, "file")}, ${formatSize(g.sizeBytes)} each`),
        h("ul", {}, g.paths.map((p) => h("li", {}, link(p, p.startsWith(fs.root) ? p.slice(fs.root.length + 1) : p)))))),
    );
  }

  async function largest() {
    const target = body();
    if (!target) return;
    const res = await attempt(() => call("find/largest", { ...target, count: 20 }));
    if (!res) return;
    show(
      h("p", { class: "pw-hint", role: "status" }, res.files.length ? `The ${plural(res.files.length, "biggest file")}:` : "There are no files among the results (folders have no size of their own)."),
      res.files.length ? table([{ text: "Size", num: true }, { text: "File" }], res.files.map((f) => [f.humanSize, link(f.path, f.path.startsWith(fs.root) ? f.path.slice(fs.root.length + 1) : f.path)]), "Biggest files") : null,
    );
  }

  async function byType() {
    const target = body();
    if (!target) return;
    const res = await attempt(() => call("find/extstats", target));
    if (!res) return;
    show(
      h("p", { class: "pw-hint", role: "status" }, res.rows.length ? "Room taken by each kind of file (the file ending), biggest first:" : "There are no files among the results."),
      res.rows.length ? table([{ text: "Kind" }, { text: "Files", num: true }, { text: "Size", num: true }], res.rows.slice(0, 40).map((r) => [r.ext, String(r.count), r.humanSize]), "Space used by kind of file") : null,
    );
  }

  const grepBtn = button("🔎 Search inside files", () => grepRun(), { tip: "Look for the text inside the files among the results and list the lines that contain it" });
  const grepRun = guarded(grepBtn, findText);
  const dupBtn = button("👯 Find duplicates", () => dupRun(), { tip: "Find files with exactly the same content, even if their names differ" });
  const dupRun = guarded(dupBtn, findDupes);
  const bigBtn = button("🐘 Biggest files", () => bigRun(), { tip: "List the 20 biggest files among the results" });
  const bigRun = guarded(bigBtn, largest);
  const typeBtn = button("📊 Space by file type", () => typeRun(), { tip: "Add up the sizes of the files by their ending (.jpg, .txt …)" });
  const typeRun = guarded(typeBtn, byType);

  const el = card("Look closer", "Search inside the files, find copies of the same file, and see what takes the most room.",
    row(field("Text inside the files", query, "Words to look for inside the files"), regex.el, matchCase.el, grepBtn),
    row(dupBtn, bigBtn, typeBtn),
    out,
  );
  return { el };
}
