// "Replace" tool of the Power tools panel: find and replace text across many files, with a preview of every change,
// a backup option and an undo. The work happens on the server (which edits the files safely, one at a time);
// this page collects the settings, shows the preview and asks before anything is changed.
// sdform.js draws the settings, sdview.js the numbers, the file list and the diff, sdinspect.js the saving buttons.
import { h } from "./dom.js";
import { ApiError, call } from "./api.js";
import { confirmBox, messageBox } from "./dialogs.js";
import { toast } from "./menus.js";
import { selectedPaths } from "./selection.js";
import { currentPath } from "./state.js";
import { plural } from "./util.js";
import { registerPowerTab } from "./power.js";
import { buildForm } from "./sdform.js";
import { buildResults } from "./sdview.js";
import { buildInspector } from "./sdinspect.js";

const short = (text, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const nameOf = (path) => path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
const problem = (err) => (err instanceof ApiError ? err.message : "That didn't work. Try again.");

function createTool(root, info) {
  let undoRuns = info.undo;
  let busy = false;
  let stale = false;
  let targetsTouched = false;
  let folderTouched = false;
  let token = 0;

  const status = h("p", { class: "pw-status sd-message", role: "status" }, "Ready. Type what to find, choose where to look, and press Preview changes. Nothing is changed until you confirm.");
  const say = (text, kind = "") => {
    status.textContent = text;
    status.className = `pw-status sd-message${kind === "ok" ? " pw-ok" : kind === "bad" ? " pw-bad" : ""}`;
  };

  const form = buildForm(info, {
    onEnter: () => run("preview"),
    useSelected: () => {
      const paths = selectedPaths();
      if (paths.length === 0) return say("Nothing is selected in the file list. Select some files or folders there first, or type their locations.", "bad");
      form.setTargets(paths);
      targetsTouched = true;
    },
    useFolder: () => {
      if (!currentPath()) return say("There's no open folder right now.", "bad");
      form.setTargets([currentPath()]);
      targetsTouched = true;
    },
  });
  form.targets.addEventListener("input", () => (targetsTouched = true));

  const results = buildResults({ onSelect: showDiff, onTicks: () => updateButtons() });
  const inspector = buildInspector({
    onCopy: copyDiff,
    onSavePatch: () => saveFile("sd/savediff", "patch file"),
    onSaveReport: () => saveFile("sd/savereport", "report"),
    onUseFolder: () => {
      inspector.folder.value = currentPath();
      folderTouched = true;
    },
  });
  inspector.folder.addEventListener("input", () => (folderTouched = true));

  const button = (label, tip, onclick, kind = "") => h("button", { type: "button", class: `pw-btn${kind ? ` ${kind}` : ""}`, title: tip, onclick }, label);
  const countBtn = button("🔍 Count matches", "Only count how many matches there are in each file. Nothing is changed.", () => run("count"));
  const previewBtn = button("👁 Preview changes", "Work out every change and show it, file by file. Nothing is changed yet.", () => run("preview"), "primary");
  const replaceBtn = button("⚡ Replace in ticked files", "", replace, "danger");
  const undoBtn = button("↶ Undo last replace", "", undo);
  const clearBtn = button("✕ Clear", "Empty the Find and Replace boxes and the results. Your files are not touched.", () => {
    form.clear();
    results.setResult(null);
    inspector.clear();
    stale = false;
    say("Cleared.");
    updateButtons();
  });
  const actionsCard = h("section", { class: "pw-card", "aria-label": "Actions" }, h("div", { class: "pw-row sd-actions" }, countBtn, previewBtn, replaceBtn, undoBtn, clearBtn), status);

  root.append(
    h("p", { class: "pw-hint" }, "Find text in many files and replace it, safely: you see every change before it happens, only the files you tick are changed, and the last replaces can be undone."),
    form.el, actionsCard, results.el, inspector.el,
  );

  function updateButtons() {
    countBtn.disabled = busy;
    previewBtn.disabled = busy;
    clearBtn.disabled = busy;
    const ticked = results.tickedChanged().length;
    let why = "";
    if (results.mode() !== "preview") why = "First press Preview changes, so you can see what would change.";
    else if (stale) why = "You changed the settings after the preview. Press Preview changes again.";
    else if (ticked === 0) why = "Tick at least one file in the list that would change.";
    replaceBtn.disabled = busy || why !== "";
    replaceBtn.title = why || `Replace the text in the ${plural(ticked, "ticked file")}. You will be asked to confirm first.`;
    const last = undoRuns[undoRuns.length - 1];
    undoBtn.disabled = busy || !last;
    undoBtn.title = last ? `Put ${plural(last.files, "file")} back the way they were before the last replace (you will be asked to confirm). Up to ${info.limits.undoRuns} replaces are kept while this window is open.` : "Nothing to undo yet. Replaces made in this session can be undone here.";
    const canDiff = results.mode() === "preview" && ticked > 0 && !stale;
    inspector.setEnabled({ diff: canDiff, report: results.hasResult() });
  }

  form.onChange(() => {
    if (!results.hasResult() || stale) return;
    stale = true;
    say("You changed the settings. Press Preview changes again to see the new result before replacing.", "bad");
    updateButtons();
  });
  form.onPreset((p) => say(`Loaded “${p.label}”. Press Preview changes to see what it would do.`));

  function setBusy(on, text) {
    busy = on;
    if (text) say(text);
    updateButtons();
  }

  /** Turns the lines of the "files and folders" box into full paths the server accepts. */
  async function resolveTargets() {
    const lines = form.targetLines();
    if (lines.length === 0) throw new ApiError("Add at least one file or folder under “Where to look”.", "BAD_REQUEST", 0);
    const paths = [];
    for (const line of lines) {
      const typed = await call("typedpath", { text: line, cwd: currentPath() || undefined });
      if (!typed.exists) throw new ApiError(`“${short(line, 60)}” doesn't exist. Check the spelling.`, "NOT_FOUND", 0);
      paths.push(typed.path);
    }
    return paths;
  }

  async function run(mode) {
    if (busy) return;
    const v = form.values();
    if (!v.find) {
      say("Type what to look for in the Find box first.", "bad");
      form.find.focus();
      return;
    }
    const mine = ++token;
    setBusy(true, `${mode === "count" ? "Counting matches" : "Working out the changes"}… a big folder can take a while (it stops after ${info.limits.seconds} seconds).`);
    try {
      const targets = await resolveTargets();
      const r = await call(mode === "count" ? "sd/count" : "sd/preview", { ...v, targets });
      if (mine !== token) return;
      stale = false;
      results.setResult(r);
      inspector.clear();
      const s = r.stats;
      if (r.files.length === 0) say(`No matches in ${plural(s.filesScanned, "file")}.`);
      else if (mode === "count") say(`Found ${plural(s.replacements, "match", "matches")} in ${plural(r.files.length, "file")}. Press Preview changes to see what a replace would do.`, "ok");
      else if (s.filesChanged === 0) say(`Found ${plural(s.replacements, "match", "matches")}, but replacing them wouldn't change any file.`);
      else say(`${plural(s.replacements, "replacement")} ready in ${plural(s.filesChanged, "file")}. Click a file to see its changes, untick files you don't want to change, then press Replace.`, "ok");
      results.focusFirst();
    } catch (err) {
      if (mine === token) say(problem(err), "bad");
    } finally {
      if (mine === token) setBusy(false);
    }
  }

  async function showDiff(path) {
    const id = results.id();
    if (results.mode() !== "preview") {
      inspector.show(path, "", "press Preview changes to see exactly what would change in this file.");
      return;
    }
    try {
      const d = await call("sd/diff", { id, path });
      if (results.id() !== id || results.selected() !== path) return;
      if (!d.changed) inspector.show(path, "", "replacing would give the same text, so nothing changes.");
      else if (!d.diff) inspector.show(path, "", "there are too many changes to keep a preview of (the file is still replaced if it is ticked).");
      else inspector.show(path, d.diff, "", d.truncated);
    } catch (err) {
      inspector.show(path, "", problem(err));
    }
  }

  async function replace() {
    const files = results.tickedChanged();
    if (busy || files.length === 0) return;
    const places = files.reduce((n, f) => n + f.matches, 0);
    const backup = form.backup();
    const ok = await confirmBox({
      title: `Replace in ${plural(files.length, "file")}?`,
      message: `${plural(places, "place")} in ${plural(files.length, "file")} will be changed on your disk.`,
      details: [
        backup.backup ? `A backup of each file will be saved next to it (its name plus ${backup.backupExt}).` : "No backup copies will be made. “Undo last replace” can still put the files back while this window stays open.",
        "A file that was edited after the preview is skipped, never overwritten.",
        "Binary files, links and files over 5 MB are never touched.",
      ],
      confirmLabel: "Replace",
      danger: true,
    });
    if (!ok) {
      say("Cancelled. Nothing was changed.");
      return;
    }
    setBusy(true, "Replacing…");
    try {
      const r = await call("sd/apply", { id: results.id(), paths: files.map((f) => f.path), backup: backup.backup, backupExt: backup.backupExt, confirm: true });
      undoRuns = r.undo;
      results.setRowNotes(r.rows);
      const skipped = r.skipped ? ` ${plural(r.skipped, "file")} skipped: see the Status column.` : "";
      const text = `Replaced ${plural(r.replacements, "place")} in ${plural(r.replaced, "file")}.${backup.backup && r.backups ? ` ${plural(r.backups, "backup")} saved.` : ""}${skipped}`;
      say(text, r.skipped ? "bad" : "ok");
      if (r.replaced > 0) toast(text, { kind: "success", action: { label: "Undo", run: undo } });
    } catch (err) {
      say(problem(err), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    const last = undoRuns[undoRuns.length - 1];
    if (busy || !last) return;
    const ok = await confirmBox({
      title: "Undo the last replace?",
      message: `Put ${plural(last.files, "file")} back the way they were before “${short(last.find, 30)}” was replaced with “${short(last.replace, 30)}”.`,
      details: ["A file you edited after the replace is left as it is, so your newer changes are never lost.", last.backups ? "Backup copies are kept; delete them yourself when you no longer need them." : "No backup copies were made, so this is the only way back."],
      confirmLabel: "Undo",
    });
    if (!ok) return;
    setBusy(true, "Undoing…");
    try {
      const r = await call("sd/undo", { runId: last.id, confirm: true });
      undoRuns = r.undo;
      results.setRowNotes(r.rows);
      say(`Restored ${plural(r.restored, "file")}.${r.left ? ` ${plural(r.left, "file")} left as they are.` : ""}`, r.left ? "bad" : "ok");
      toast(`Restored ${plural(r.restored, "file")}.`, { kind: "success" });
      if (r.left) await messageBox("Some files were left as they are", "These files were not restored, so nothing of yours was lost:", r.rows.filter((x) => x.status !== "restored").map((x) => `${nameOf(x.path)}: ${x.message}`));
    } catch (err) {
      say(problem(err), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function copyDiff() {
    const files = results.tickedChanged();
    if (files.length === 0) {
      say("Tick at least one file that would change.", "bad");
      return;
    }
    try {
      const r = await call("sd/copydiff", { id: results.id(), paths: files.map((f) => f.path) });
      if (r.copied) toast(`Copied the changes of ${plural(r.files, "file")}.`, { kind: "success" });
      else toast("Couldn't reach the clipboard. Use “Save the changes as a patch file” instead.", { kind: "error" });
    } catch (err) {
      say(problem(err), "bad");
    }
  }

  async function saveFile(op, what) {
    const text = inspector.folder.value.trim();
    if (!text) {
      say("Type the folder to save into first.", "bad");
      return;
    }
    try {
      const typed = await call("typedpath", { text, cwd: currentPath() || undefined });
      if (!typed.isDir) {
        say("That folder doesn't exist. Check the spelling.", "bad");
        return;
      }
      const body = { id: results.id(), folder: typed.path };
      if (op === "sd/savediff") body.paths = results.tickedChanged().map((f) => f.path);
      const r = await call(op, body);
      say(`Saved the ${what} as ${r.name} in ${r.path.slice(0, r.path.length - r.name.length)}`, "ok");
      toast(`Saved ${r.name}`, { kind: "success" });
    } catch (err) {
      say(problem(err), "bad");
    }
  }

  updateButtons();
  return {
    show(opts) {
      const given = Array.isArray(opts?.targets) && opts.targets.length > 0 ? opts.targets : null;
      if (given || !targetsTouched) {
        const fallback = selectedPaths().length > 0 ? selectedPaths() : currentPath() ? [currentPath()] : [];
        form.setTargets(given ?? fallback);
        targetsTouched = !!given;
      }
      if (!folderTouched && currentPath()) inspector.folder.value = currentPath();
      form.find.focus();
    },
  };
}

registerPowerTab({
  id: "sd", label: "Replace", icon: "🔁", tip: "Find and replace text across many files, with a preview and undo",
  mount(root) {
    const note = h("p", { class: "pw-hint", role: "status" }, "Loading the Replace tool…");
    root.append(note);
    let tool = null;
    let pending = null;
    const load = async () => {
      try {
        const info = await call("sd/info");
        note.remove();
        tool = createTool(root, info);
        tool.show(pending);
      } catch (err) {
        note.textContent = `The Replace tool couldn't start: ${problem(err)} Close the Power tools and open them again.`;
      }
    };
    load();
    return {
      show(opts) {
        if (tool) tool.show(opts);
        else pending = opts;
      },
    };
  },
});
