// "Do something with the results": copy their paths, copy or move them to a folder, archive them, send them to
// the Recycle Bin, delete them for good, or save the list of results as a file. Each action works on the results
// that are shown (or only the selected ones) and offers Undo where that is possible.
import { call } from "./api.js";
import { problemsBox } from "./dialogs.js";
import { h } from "./dom.js";
import { fs, onFind, scopeItems, setScope, targetBody } from "./findStore.js";
import { pathsText, summarizeBatch } from "./findCore.js";
import { copyText } from "./findInspector.js";
import { pickFolder } from "./findPicker.js";
import { attempt, button, card, dropdown, field, row } from "./findUi.js";
import { toast } from "./menus.js";
import { refresh, refreshTrashCount } from "./nav.js";
import { pushUndo } from "./ops.js";
import { reviewPlan } from "./planDialog.js";
import { baseName, formatSize, plural } from "./util.js";
import { state } from "./state.js";

const FORMATS = [
  { value: "json", label: "JSON (for programs)" },
  { value: "csv", label: "CSV (for spreadsheets)" },
  { value: "tsv", label: "TSV (tab separated)" },
  { value: "md", label: "Markdown table" },
  { value: "paths", label: "List of full paths" },
];

const failedOf = (results) => results.filter((r) => !r.ok).map((r) => r.message);

/** @param {{ rerun: () => void }} hooks */
export function createActions(hooks) {
  const scope = dropdown([{ value: "all", label: "All results" }, { value: "selected", label: "Only the selected" }], {
    label: "Which results to act on", tip: "Choose whether the buttons below act on every result that is shown, or only on the ones you selected in the table",
    onchange: () => setScope(scope.value),
  });
  const policy = dropdown([{ value: "rename", label: "Keep both (add a number)" }, { value: "skip", label: "Skip it" }, { value: "replace", label: "Replace it (the old one goes to the Recycle Bin)" }], {
    label: "If a name is already used", tip: "What to do when the folder you choose already has an item with the same name. Nothing is ever overwritten without a copy going to the Recycle Bin.",
  });
  const archiveKind = dropdown([{ value: "zip", label: ".zip" }, { value: "tar.gz", label: ".tar.gz" }], { label: "Archive type", tip: ".zip opens everywhere. .tar.gz is common on Linux and Mac. The archive is a new file; nothing is overwritten." });
  const format = dropdown(FORMATS, { label: "Format of the saved list", tip: "How the list of results is written when you save or copy it" });

  /** The items to work on, or null after telling the person why there are none. */
  function items(verb) {
    const list = scopeItems();
    if (!fs.resultId || list.length === 0) {
      toast(fs.scope === "selected" ? `Select some results first, then ${verb}.` : "There are no results to work on. Search first.", { kind: "info" });
      return null;
    }
    if (fs.scope === "selected" && list.length > fs.meta.limits.maxPaths) {
      toast(`That's too many items to pick one by one (the limit is ${fs.meta.limits.maxPaths}). Choose "All results" instead.`, { kind: "error" });
      return null;
    }
    return list;
  }

  const refreshAround = () => {
    refresh().catch(() => {});
    refreshTrashCount();
    hooks.rerun();
  };

  async function reportBatch(verb, res, what) {
    const text = summarizeBatch(verb, res);
    toast(`${text}.`, { kind: res.failed ? "error" : "success" });
    if (res.failed) await problemsBox(`${plural(res.failed, "item")} couldn't be ${what}`, "Here is why:", [...new Set(res.errors.map((e) => `${baseName(e.path, state.sep)}: ${e.message}`))]);
  }

  async function copyPaths(kind) {
    const list = items("copy their paths");
    if (list) await copyText(pathsText(list, kind), plural(list.length, kind === "relative" ? "relative path" : "full path"));
  }

  async function transfer(copying) {
    const list = items(copying ? "copy them" : "move them");
    if (!list) return;
    const dest = await pickFolder({ title: `${copying ? "Copy" : "Move"} ${plural(list.length, "item")} to which folder?`, start: fs.root, confirmLabel: copying ? "Copy here" : "Move here" });
    if (!dest) return;
    // The plan shows every item with its final name and what a same-name policy does, then runs in the task queue.
    const outcome = await reviewPlan({ type: "transfer", mode: copying ? "copy" : "move", sources: list.map((i) => i.path), destination: dest, policy: policy.value });
    if (outcome.applied) refreshAround();
  }

  async function archive() {
    const list = items("archive them");
    if (!list) return;
    const dest = await pickFolder({ title: `Save the archive of ${plural(list.length, "item")} in which folder?`, start: fs.root, confirmLabel: "Save archive here" });
    if (!dest) return;
    const res = await attempt(() => call("find/archive", { ...targetBody(), format: archiveKind.value, dest }));
    if (!res) return;
    toast(`Created ${baseName(res.archivePath, state.sep)}: ${plural(res.files, "file")}, ${formatSize(res.size)}${res.skipped ? `, ${res.skipped} skipped (links or unreadable)` : ""}.`, { kind: "success" });
    pushUndo(`archive "${baseName(res.archivePath, state.sep)}"`, async () => {
      const back = await call("trash", { paths: [res.archivePath] });
      const bad = failedOf(back.results);
      if (bad.length) throw new Error(bad[0]);
      hooks.rerun();
    });
    refreshAround();
  }

  async function bury() {
    const list = items("move them to the Recycle Bin");
    if (!list) return;
    await reviewPlan({ type: "delete", paths: list.map((i) => i.path), permanent: false }, { applyLabel: "Move to the Recycle Bin" });
  }

  async function destroy() {
    const list = items("delete them");
    if (!list) return;
    await reviewPlan({ type: "delete", paths: list.map((i) => i.path), permanent: true }, { applyLabel: "Delete for good" });
  }

  async function saveList() {
    const list = items("save the list");
    if (!list) return;
    const dest = await pickFolder({ title: "Save the list of results in which folder?", start: fs.root, confirmLabel: "Save the list here" });
    if (!dest) return;
    const res = await attempt(() => call("find/export", { ...targetBody(), format: format.value, dest }));
    if (!res) return;
    toast(`Saved ${plural(res.count, "result")} as ${res.saved.name}.`, { kind: "success" });
    pushUndo(`export "${res.saved.name}"`, async () => {
      const back = await call("trash", { paths: [res.saved.path] });
      const bad = failedOf(back.results);
      if (bad.length) throw new Error(bad[0]);
      hooks.rerun();
    });
    refresh().catch(() => {});
  }

  async function copyList() {
    const list = items("copy the list");
    if (!list) return;
    const res = await attempt(() => call("find/export", { ...targetBody(), format: format.value }));
    if (res) await copyText(res.text, `the list (${plural(res.count, "result")})`);
  }

  const buttons = {
    relative: button("📋 Copy relative paths", () => copyPaths("relative"), { tip: "Copy the paths of the results, one per line, starting from the search folder" }),
    full: button("📋 Copy full paths", () => copyPaths("full"), { tip: "Copy the complete location of every result, one per line" }),
    copy: button("📁 Copy to a folder…", () => transfer(true), { tip: "Copy these items into a folder you choose. The originals stay where they are." }),
    move: button("📦 Move to a folder…", () => transfer(false), { tip: "Move these items into a folder you choose. You can undo it." }),
    archive: button("🗜️ Archive…", archive, { tip: "Pack these items into one new .zip or .tar.gz file in a folder you choose" }),
    bury: button("🗑️ Move to the Recycle Bin", bury, { tip: "The safe way to delete: the items go to the Recycle Bin, where you can bring them back" }),
    destroy: button("💥 Delete for good…", destroy, { danger: true, tip: "Permanently delete these items. This can't be undone, so you will be asked to confirm." }),
    save: button("💾 Save list to a folder…", saveList, { tip: "Write the list of results to a new file in a folder you choose. Nothing is overwritten." }),
    clip: button("📋 Copy list", copyList, { tip: "Copy the list of results, in the format chosen on the left, so you can paste it somewhere" }),
  };

  function paint() {
    const list = scopeItems();
    const all = fs.view.length;
    const picked = fs.selected.size;
    scope.options[0].textContent = `All ${plural(all, "result")}`;
    scope.options[1].textContent = `Only the ${picked} selected`;
    scope.value = fs.scope;
    for (const b of Object.values(buttons)) b.disabled = list.length === 0;
  }

  let hadSelection = false;
  onFind("selection", () => {
    const has = fs.selected.size > 0;
    if (has !== hadSelection) {
      hadSelection = has;
      setScope(has ? "selected" : "all");
    }
    paint();
  });
  onFind("results", paint);
  onFind("view", paint);
  onFind("scope", paint);

  const el = card("Do something with the results", "These buttons work on the results that are shown, or only on the ones you selected in the table. Nothing is changed until you press one.",
    row(field("Act on", scope, "Every shown result, or only the selected ones")),
    row(buttons.relative, buttons.full),
    h("p", { class: "find-sub" }, "Copy, move and archive"),
    row(buttons.copy, buttons.move, field("If the name is taken", policy), buttons.archive, field("Archive type", archiveKind)),
    h("p", { class: "find-sub" }, "Delete"),
    row(buttons.bury, buttons.destroy),
    h("p", { class: "find-sub" }, "Save the list of results"),
    row(field("Format", format), buttons.save, buttons.clip),
  );
  paint();
  return { el };
}
