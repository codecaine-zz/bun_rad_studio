// Changing things from the Find tool: make a new file or folder, rename, duplicate or set permissions on the selected
// results (all with Undo), and rename all the matches at once with a preview first.
import { call } from "./api.js";
import { problemsBox } from "./dialogs.js";
import { h } from "./dom.js";
import { fs, onFind, scopeItems, selectedItems, targetBody } from "./findStore.js";
import { sampleNames } from "./findCore.js";
import { attempt, button, card, checkbox, dropdown, field, row, textInput } from "./findUi.js";
import { toast } from "./menus.js";
import { refresh, refreshTrashCount } from "./nav.js";
import { pushUndo, undo } from "./ops.js";
import { reviewPlan } from "./planDialog.js";
import { on, state } from "./state.js";
import { baseName, parentOf, plural } from "./util.js";

const CASES = [
  { value: "none", label: "Keep the letters as they are" },
  { value: "lower", label: "all lowercase" },
  { value: "upper", label: "ALL UPPERCASE" },
  { value: "title", label: "Title Case" },
];

const failedOf = (results) => results.filter((r) => !r.ok).map((r) => r.message);

/** @param {{ rerun: () => void, getRoot: () => string }} hooks */
export function createRename(hooks) {
  const refreshAll = () => {
    refresh().catch(() => {});
    refreshTrashCount();
    hooks.rerun();
  };
  /** For Undo: fails with the first problem, otherwise refreshes the results. */
  const ensure = (res) => {
    const bad = failedOf(res.results);
    if (bad.length) throw new Error(bad[0]);
    hooks.rerun();
  };

  on("fileop-done", (job) => { if (state.planJobs.has(job.id)) hooks.rerun(); });

  // --- one item ---------------------------------------------------------------------------------------------
  const name = textInput({ label: "Name", placeholder: "A name", tip: "The name for a new file or folder, or the new name for the selected result. Leave it empty for a new file or folder to get a standard name.", width: "m" });
  const mode = textInput({ value: "644", label: "Permissions", tip: "Three digits like 644 or 755, or letters like rwxr-xr-x. 644 = you can change it, others can only read it. 755 = also a program anyone can run.", width: "s" });
  const permRow = row(field("Permissions", mode), button("🔐 Set permissions", () => setPermissions(), { tip: "Change who may read, change or run the selected items. Works on files and folders, not on links." }));
  const undoBtn = button("↶ Undo last change", () => undo(), { tip: "Undo the last change made in the File Manager (Ctrl+Z or ⌘Z does the same)" });

  const need = (count) => {
    const list = selectedItems();
    if (list.length === 0 || (count === 1 && list.length !== 1)) {
      toast(count === 1 ? "Select exactly one result first." : "Select one or more results first.", { kind: "info" });
      return null;
    }
    return list;
  };

  async function create(kind) {
    const parent = fs.root || hooks.getRoot();
    if (!parent) return toast("Choose the folder to search first.", { kind: "info" });
    const res = await attempt(() => call(kind === "file" ? "newfile" : "mkdir", { parent, name: name.value.trim() || undefined }));
    if (!res) return undefined;
    toast(`Created the ${kind} "${res.name}" in ${parent}.`, { kind: "success" });
    pushUndo(`new ${kind}`, async () => ensure(await call("trash", { paths: [res.path] })));
    refreshAll();
    return undefined;
  }

  async function rename() {
    const list = need(1);
    if (!list) return;
    const newName = name.value.trim();
    if (!newName) return toast("Type the new name in the Name box first.", { kind: "info" });
    const item = list[0];
    const res = await attempt(() => call("rename", { path: item.path, name: newName }));
    if (!res) return;
    toast(`Renamed "${item.name}" to "${baseName(res.to, state.sep)}".`, { kind: "success" });
    pushUndo(`rename "${item.name}"`, async () => ensure(await call("relocate", { pairs: [{ from: res.to, to: res.from }] })));
    refreshAll();
  }

  async function duplicate() {
    const list = need(0);
    if (!list) return;
    const byFolder = new Map();
    for (const i of list) {
      const folder = parentOf(i.path, state.sep) ?? i.path;
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), i.path]);
    }
    const made = [];
    const problems = [];
    for (const [dest, sources] of byFolder) {
      const res = await attempt(() => call("copy", { sources, dest, policy: "rename" }));
      if (!res) return;
      for (const r of res.results) {
        if (r.ok && r.value.destination) made.push(r.value.destination);
        else if (!r.ok) problems.push(r.message);
      }
    }
    toast(`Made ${plural(made.length, "copy", "copies")}.`, { kind: problems.length ? "error" : "success" });
    if (problems.length) await problemsBox("Some items couldn't be copied", "Here is why:", [...new Set(problems)]);
    if (made.length) pushUndo(`copy of ${plural(made.length, "item")}`, async () => ensure(await call("trash", { paths: made })));
    refreshAll();
  }

  async function setPermissions() {
    const list = need(0);
    if (!list) return;
    const res = await attempt(() => call("find/chmod", { paths: list.map((i) => i.path), mode: mode.value.trim() }));
    if (!res) return;
    toast(res.failed ? `Changed ${res.done}, ${res.failed} couldn't be changed: ${res.errors[0]?.message ?? ""}` : `Permissions set to ${mode.value.trim()} on ${plural(res.done, "item")}.`, { kind: res.failed ? "error" : "success" });
    if (res.changed.length) {
      pushUndo(`permissions of ${plural(res.changed.length, "item")}`, async () => {
        const back = await call("find/chmod", { modes: res.changed.map((c) => ({ path: c.path, mode: c.before })) });
        if (back.failed) throw new Error(back.errors[0]?.message ?? "The permissions couldn't be put back.");
        hooks.rerun();
      });
    }
    hooks.rerun();
  }

  const single = card("Create, rename and copy", "Make a new file or folder in the search folder, or change the selected results. Every change can be undone.",
    row(field("Name", name, "A name"), button("📄 New file", () => create("file"), { tip: "Make an empty file with this name in the search folder" }), button("📁 New folder", () => create("folder"), { tip: "Make a folder with this name in the search folder" }),
      button("✏️ Rename selected", rename, { tip: "Give the selected result the name in the box (select exactly one)" }), button("⧉ Duplicate selected", duplicate, { tip: "Make a copy of each selected result, next to the original" })),
    permRow,
    row(undoBtn),
  );
  const paintUndo = () => {
    undoBtn.textContent = `↶ Undo last change (${state.undoStack.length})`;
    undoBtn.disabled = state.undoStack.length === 0;
  };
  on("undo", paintUndo);
  paintUndo();

  // --- batch rename -----------------------------------------------------------------------------------------
  const find = textInput({ label: "Find", placeholder: "Text to replace", tip: "The part of each name to replace. Leave empty to only use the other options below.", width: "m" });
  const replace = textInput({ label: "Replace with", placeholder: "New text", tip: "What to put instead. Leave empty to remove the found text.", width: "m" });
  const regex = checkbox("Find is a pattern (regex)", { tip: "Treat the Find text as a regular expression. Advanced." });
  const caseMode = dropdown(CASES, { label: "Letters", tip: "Change the capital letters of the names" });
  const prefix = textInput({ label: "Add at the start", placeholder: "Start", tip: "Text to put in front of each name", width: "s" });
  const suffix = textInput({ label: "Add at the end", placeholder: "End", tip: "Text to put at the end of each name, before the file ending (.txt)", width: "s" });
  const numbering = checkbox("Number them (_001, _002…)", { tip: "Add a running number to each name, in the order the results are shown" });
  const spaces = checkbox("Spaces to underscores", { tip: "Replace every space in the names with an underscore" });
  const scopeNote = h("p", { class: "pw-hint" });
  const preview = h("div", { class: "find-plan", hidden: true });

  const rules = () => ({ find: find.value, replace: replace.value, useRegex: regex.input.checked, prefix: prefix.value, suffix: suffix.value, caseMode: caseMode.value, numbering: numbering.input.checked, spacesToUnderscore: spaces.input.checked });
  const scopeBody = () => {
    if (fs.scope === "selected" && fs.selected.size === 0) return null;
    return targetBody();
  };

  function showPlan(res) {
    const rows = res.rows.slice(0, 200);
    if (!res.changed) {
      preview.replaceChildren(h("p", { class: "pw-hint" }, "No names would change with these settings."));
    } else {
      preview.replaceChildren(
        h("p", { class: res.conflicts ? "pw-bad" : "pw-ok", role: "status" }, `${plural(res.changed, "name")} would change${res.conflicts ? `, ${plural(res.conflicts, "problem")} (those are skipped)` : ""}.`),
        h("div", { class: "pw-table-wrap find-plan-wrap" }, h("table", { class: "pw-table", "aria-label": "Preview of the new names" },
          h("thead", {}, h("tr", {}, ["Now", "Becomes", "Note"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", {}, rows.map((r) => h("tr", { title: r.from }, h("td", {}, r.oldName), h("td", {}, r.newName), h("td", { class: r.error ? "pw-bad" : "pw-ok" }, r.error ?? "OK")))))),
        res.changed > rows.length ? h("p", { class: "pw-hint" }, `…and ${res.changed - rows.length} more.`) : null,
      );
    }
    preview.hidden = false;
  }

  async function previewRename() {
    const target = scopeBody();
    if (!target) return toast("Select some results first, or choose All results.", { kind: "info" });
    const res = await attempt(() => call("find/renameplan", { ...target, rules: rules() }));
    if (res) showPlan(res);
  }

  async function applyRename() {
    const target = scopeBody();
    if (!target) return toast("Select some results first, or choose All results.", { kind: "info" });
    const plan = await attempt(() => call("find/renameplan", { ...target, rules: rules() }));
    if (!plan) return;
    showPlan(plan);
    const items = plan.rows.filter((r) => !r.error && r.newName !== r.oldName).map((r) => ({ path: r.from, name: r.newName }));
    if (!items.length) return toast("No valid renames to do. Check the preview to see why.", { kind: "info" });
    // The plan checks the disk again, shows what happens to each item, and runs in the task queue with Undo.
    const outcome = await reviewPlan({ type: "rename", items });
    if (outcome.applied) preview.hidden = true;
  }

  const batch = card("Rename all the matches", "Change many names at once. Press Preview to see the new names before anything is renamed.",
    row(field("Find", find, "Text to find in the names"), field("Replace with", replace, "What to put instead"), regex.el),
    row(field("Letters", caseMode, "Capital letters"), field("Add at the start", prefix, "Text for the start of each name"), field("Add at the end", suffix, "Text for the end of each name"), numbering.el, spaces.el),
    scopeNote,
    row(button("👁 Preview the new names", previewRename, { tip: "Show what every name would become. Nothing is renamed yet." }), button("✅ Rename them…", applyRename, { primary: true, tip: "Rename the items as shown in the preview. You will be asked to confirm, and you can undo it." })),
    preview,
  );
  const paintScope = () => {
    const list = scopeItems();
    scopeNote.textContent = list.length ? `Works on ${plural(list.length, "result")} (${sampleNames(list, 3)}). Use "Act on" above to switch between all results and the selected ones.` : "Search first, then choose which results to rename.";
    preview.hidden = true;
  };
  for (const ev of ["results", "view", "selection", "scope"]) onFind(ev, paintScope);
  paintScope();

  return {
    els: [single, batch],
    applyMeta() {
      permRow.hidden = !fs.meta.posix;
    },
  };
}
