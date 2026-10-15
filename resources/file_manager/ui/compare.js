// The "Compare" tool: two folders side by side as five groups (only on the left, only on the right, different,
// identical, cannot compare), and a one-way copy of the differences you choose. Copying goes through the same
// preview and approval as every other change, and nothing is ever deleted from either folder.
import { ApiError, call } from "./api.js";
import { announce, h } from "./dom.js";
import { btn, createStatus, errorText, num, runJob, seconds } from "./devCore.js";
import { pickFolder } from "./findPicker.js";
import { toast } from "./menus.js";
import { reviewPlan } from "./planDialog.js";
import { registerPowerTab } from "./power.js";
import { currentPath } from "./pane.js";
import { on, state } from "./state.js";
import { formatSize, plural } from "./util.js";

const GROUPS = [
  ["onlyLeft", "Only on the left", "These are in the left folder but not in the right one."],
  ["onlyRight", "Only on the right", "These are in the right folder but not in the left one."],
  ["different", "Different", "Both folders have it, but it is not the same."],
  ["identical", "Identical", "Both folders have the same thing. 'Not verified' means only size and date were compared."],
  ["cannot", "Cannot compare", "Could not be read, or the comparison was cancelled before it got there."],
];
const PAGE = 500;
const DEFAULT_IGNORE = [".git/", "node_modules/", ".DS_Store", "Thumbs.db"].join("\n");

const when = (ms) => (ms ? new Date(ms).toLocaleString() : "");
const sideText = (s) => (s ? `${s.kind === "dir" ? "folder" : s.kind === "link" ? `link → ${s.target ?? "?"}` : formatSize(s.size)}${s.kind === "file" ? `, ${when(s.mtimeMs)}` : ""}` : "—");

/** Which entries can be copied in a direction: something that exists on the source side and is not a file-versus-folder clash. */
export function copyable(entry, direction) {
  if (entry.category === "onlyLeft") return direction === "toRight";
  if (entry.category === "onlyRight") return direction === "toLeft";
  return entry.category === "different" && entry.basis !== "type";
}

registerPowerTab({
  id: "compare", label: "Compare", icon: "🆚", tip: "Compare two folders and copy the differences you choose, one way, with a preview first",
  mount(root) {
    root.classList.add("compare-pane");
    const left = h("input", { type: "text", class: "find-input compare-path", id: "compare-left", spellcheck: "false", autocomplete: "off", "aria-label": "Left folder", title: "The first folder. Type or paste a location, or press Choose." });
    const right = h("input", { type: "text", class: "find-input compare-path", id: "compare-right", spellcheck: "false", autocomplete: "off", "aria-label": "Right folder", title: "The second folder. Type or paste a location, or press Choose." });
    const ignore = h("textarea", { class: "find-input compare-ignore", rows: "4", spellcheck: "false", "aria-label": "Ignore rules", title: "One rule per line, like a .gitignore file: node_modules/ (a folder), *.log (a pattern), /build (only at the top). Ignored items are left out of everything." }, DEFAULT_IGNORE);
    const mode = h("select", { class: "find-input", "aria-label": "How carefully to compare", title: "Quick compares size and date only. Verified reads every pair of same-size files, which is the only way to be sure they are identical." },
      h("option", { value: "quick" }, "Quick: size and date"),
      h("option", { value: "verified" }, "Verified: read the files"));
    const status = createStatus();
    const bar = h("progress", { class: "compare-progress", max: "100", value: "0", hidden: true, "aria-label": "Comparison progress" });
    const chips = h("div", { class: "compare-chips", role: "group", "aria-label": "Show one group" });
    const search = h("input", { type: "search", class: "find-input", placeholder: "Filter by name", "aria-label": "Filter the list by name", title: "Show only paths that contain this text", oninput: () => { query = search.value; reload(); } });
    const table = h("table", { class: "pw-table compare-table", "aria-label": "Differences between the two folders" });
    const more = btn("Show more", "Load the next part of the list", () => load(false));
    more.hidden = true;
    const direction = h("select", { class: "find-input", "aria-label": "Which way to copy", title: "Copying only ever adds or replaces files in the folder you copy TO. It never deletes anything.", onchange: () => paint() },
      h("option", { value: "toRight" }, "Copy to the right →"),
      h("option", { value: "toLeft" }, "← Copy to the left"));
    const replaceBox = h("input", { type: "checkbox", id: "compare-replace", title: "Also copy over files that exist on both sides but differ. The old file goes to the Recycle Bin first." });
    const selectAll = btn("Select everything that can be copied", "Tick every item in the list that can be copied this way", () => { for (const e of rows) if (usable(e)) picked.add(e.rel); paint(); });
    const clear = btn("Clear selection", "Untick everything", () => { picked.clear(); paint(); });
    const copy = btn("Copy the selected…", "Shows exactly what will be copied or replaced, and asks you to approve it", () => copyChosen(), { primary: true });
    const verifyNote = h("p", { class: "pw-hint compare-note", hidden: true });
    const actions = h("div", { class: "compare-actions", hidden: true },
      h("div", { class: "pw-row" }, direction, h("label", { class: "find-check" }, replaceBox, h("span", {}, "Replace files that differ")), selectAll, clear, copy),
      h("p", { class: "pw-hint" }, "Nothing is ever deleted. Files only on the other side stay where they are. Links are copied as links, never followed."));

    let job = null;
    let compareId = null;
    let summary = null;
    let category = "";
    let query = "";
    let rows = [];
    let total = 0;
    const picked = new Set();
    let seq = 0;

    const usable = (e) => copyable(e, direction.value);

    function paintChips() {
      const counts = summary?.counts ?? {};
      chips.replaceChildren(
        h("button", { type: "button", class: `compare-chip${category === "" ? " on" : ""}`, "aria-pressed": String(category === ""), onclick: () => setCategory("") }, "All"),
        ...GROUPS.map(([id, label, tip]) => h("button", { type: "button", class: `compare-chip g-${id}${category === id ? " on" : ""}`, "aria-pressed": String(category === id), title: tip, onclick: () => setCategory(id) }, `${label}: ${num(counts[id] ?? 0)}`)));
    }
    function setCategory(id) {
      category = id;
      paintChips();
      reload();
    }

    function paint() {
      const head = h("thead", {}, h("tr", {}, ["", "Path", "Left", "Right", "What was found"].map((t) => h("th", { scope: "col" }, t))));
      const body = h("tbody", {}, rows.map((e) => {
        const ok = usable(e);
        const box = h("input", { type: "checkbox", checked: picked.has(e.rel), disabled: !ok, "aria-label": `Select ${e.rel}`, title: ok ? "Select to copy" : "This can't be copied this way", onchange: () => { box.checked ? picked.add(e.rel) : picked.delete(e.rel); countNote(); } });
        return h("tr", { class: `g-${e.category}` }, h("td", {}, box), h("td", { class: "pw-mono" }, e.rel), h("td", {}, sideText(e.left)), h("td", {}, sideText(e.right)),
          h("td", {}, e.note, e.category === "identical" && !e.verified ? h("strong", {}, " (not verified)") : null));
      }));
      table.replaceChildren(head, body);
      more.hidden = rows.length >= total;
      const to = direction.value === "toRight" ? "right" : "left";
      copy.textContent = `Copy the selected to the ${to}…`;
      countNote();
    }
    const countNote = () => { copy.disabled = picked.size === 0; };

    async function load(fresh) {
      if (!compareId) return;
      const mine = ++seq;
      try {
        const res = await call("compare/entries", { id: compareId, category: category || undefined, query: query || undefined, offset: fresh ? 0 : rows.length, limit: PAGE });
        if (mine !== seq) return;
        rows = fresh ? res.entries : [...rows, ...res.entries];
        total = res.total;
        paint();
        announce(`${plural(total, "item")} shown.`);
      } catch (err) {
        status.set(errorText(err, "The list couldn't be loaded."), true);
      }
    }
    const reload = () => load(true);

    async function choose(input, title) {
      const dir = await pickFolder({ title, start: input.value || currentPath() || state.home, confirmLabel: "Use this folder" });
      if (dir) input.value = dir;
    }

    async function start(forceMode) {
      if (!left.value.trim() || !right.value.trim()) return status.set("Choose both folders first.", true);
      if (forceMode) mode.value = forceMode;
      const mine = ++seq;
      run.disabled = true;
      cancel.hidden = false;
      bar.hidden = false;
      bar.removeAttribute("value");
      actions.hidden = true;
      verifyNote.hidden = true;
      table.replaceChildren();
      picked.clear();
      status.set("Looking at both folders…");
      try {
        job = runJob("compare/start", { left: left.value.trim(), right: right.value.trim(), mode: mode.value, ignore: ignore.value.split("\n") }, (p) => {
          if (mine !== seq) return;
          if (p.phase === "verifying") {
            status.set(`Reading files to be sure: ${num(p.filesDone ?? 0)} of ${num(p.filesTotal ?? 0)} (${formatSize(p.bytesDone ?? 0)} of ${formatSize(p.bytesTotal ?? 0)})…`);
            if (p.bytesTotal) { bar.max = p.bytesTotal; bar.value = p.bytesDone ?? 0; }
          } else status.set(`Listing files… ${num(p.leftItems ?? 0)} on the left, ${num(p.rightItems ?? 0)} on the right`);
        });
        const done = await job.promise;
        if (mine !== seq) return;
        summary = done.result;
        compareId = done.id;
        category = "";
        paintChips();
        const c = summary.counts;
        status.set(`${summary.cancelled ? "Cancelled part-way. " : ""}${num(c.onlyLeft)} only on the left, ${num(c.onlyRight)} only on the right, ${num(c.different)} different, ${num(c.identical)} identical, ${num(c.cannot)} cannot be compared (${seconds(done.elapsedMs)}).`, summary.cancelled || c.cannot > 0);
        verifyNote.hidden = !summary.unverifiedIdentical;
        verifyNote.replaceChildren(`${plural(summary.unverifiedIdentical, "file")} listed as identical only because the size and date match. Their contents were not read. `, btn("Verify them now", "Run the comparison again, reading every pair of same-size files", () => start("verified")));
        actions.hidden = false;
        await reload();
      } catch (err) {
        if (mine === seq) status.set(errorText(err, "The comparison didn't work."), true);
      } finally {
        if (mine === seq) {
          run.disabled = false;
          cancel.hidden = true;
          bar.hidden = true;
          job = null;
        }
      }
    }

    async function copyChosen() {
      if (!picked.size || !compareId) return;
      try {
        const { plan } = await call("compare/plan", { id: compareId, direction: direction.value, paths: [...picked], replace: replaceBox.checked });
        // The server already built this preview; showing it again through the shared dialog keeps one way of approving changes.
        const outcome = await reviewPlan({ type: "existing", id: plan.id });
        if (outcome.applied) picked.clear();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "The preview couldn't be made.", { kind: "error" });
      }
    }

    const run = btn("Compare", "Compare the two folders. Nothing is changed.", () => start(), { primary: true });
    const cancel = btn("Cancel", "Stop the comparison. Items not reached are listed under Cannot compare.", () => job?.cancel());
    cancel.hidden = true;
    const swap = btn("⇄ Swap sides", "Exchange the left and right folders", () => { [left.value, right.value] = [right.value, left.value]; });
    on("fileop-done", (j) => { if (state.planJobs.has(j.id) && compareId && !actions.hidden) status.set("The copy finished. Press Compare to see what is different now."); });

    root.append(
      h("section", { class: "pw-card", "aria-label": "Folders to compare" },
        h("h3", {}, "Compare two folders"),
        h("p", { class: "pw-hint" }, "See what is only on one side, what differs and what is the same. Then copy the differences you choose in one direction. Nothing is deleted, and every copy is previewed first."),
        h("div", { class: "compare-folders" },
          h("label", { class: "pw-field" }, "Left folder", h("div", { class: "pw-row" }, left, btn("Choose…", "Pick the left folder", () => choose(left, "Choose the left folder")), btn("Use the open folder", "Use the folder shown in the file list", () => { left.value = currentPath() || ""; }))),
          h("label", { class: "pw-field" }, "Right folder", h("div", { class: "pw-row" }, right, btn("Choose…", "Pick the right folder", () => choose(right, "Choose the right folder")), btn("Use the open folder", "Use the folder shown in the file list", () => { right.value = currentPath() || ""; })))),
        h("div", { class: "pw-row" }, h("label", { class: "pw-field" }, "How carefully", mode), h("label", { class: "pw-field" }, "Ignore (one rule per line)", ignore)),
        h("div", { class: "pw-row" }, run, cancel, swap),
        bar, status.el,
        h("details", { class: "compare-help" }, h("summary", {}, "How this works"),
          h("ul", {},
            h("li", {}, "Quick compares size and date. Files with the same size and date are listed as identical but marked 'not verified', because their contents were not read."),
            h("li", {}, "Verified reads every pair of same-size files and compares them byte by byte. It is slower, and it is the only way to be sure."),
            h("li", {}, "Links are compared by where they point and never followed, so a loop can't make the search endless."),
            h("li", {}, "A folder that can't be read is 'Cannot compare', and so is everything below it. It is never reported as missing."),
            h("li", {}, "A file on one side and a folder on the other is 'Different' and is never copied over."))),
      ),
      h("section", { class: "pw-card", "aria-label": "Results" }, chips, verifyNote, h("div", { class: "pw-row" }, search), actions, h("div", { class: "pw-table-wrap" }, table), more),
    );
    paintChips();
    return {
      show(opts) {
        if (opts?.left) left.value = opts.left;
        if (opts?.right) right.value = opts.right;
        if (!left.value) left.value = currentPath() || "";
      },
    };
  },
});
