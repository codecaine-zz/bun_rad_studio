// What you can do with buried items: bring them back (with a choice when something is in the way or the folder is gone),
// or delete them for good (always after a clear question, with a typed word and a short wait for "everything").
// Slow work comes back as a job and shows in the task list. Plain words everywhere; nothing is shown as "null".
import { ApiError, call } from "./api.js";
import { chooseConflict, confirmBox, openDialog, problemsBox, promptBox } from "./dialogs.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo, refresh, refreshTrashCount } from "./nav.js";
import { currentPath, emit, state } from "./state.js";
import { baseName, formatSize, parentOf, plural } from "./util.js";

const say = (err, fallback = "That didn't work.") => (err instanceof ApiError ? err.message : fallback);

let emptyDelayMs = 3000;
/** For tests: how long "Empty the graveyard" stays locked after the question appears. */
export const setEmptyDelay = (ms) => {
  emptyDelayMs = ms;
};

/** Asks for a folder by typing its location. Resolves the full path, or null when cancelled. */
export function askFolder({ title, label, hint }) {
  return promptBox({
    title,
    label,
    value: currentPath() || state.home,
    confirmLabel: "Use this folder",
    hint: hint ?? "Type a folder location, like ~/Documents or /Users/you/Desktop. It has to exist already.",
    submit: async (text) => {
      const res = await call("typedpath", { text, cwd: currentPath() || state.home });
      if (!res.exists || !res.isDir) throw new ApiError("That isn't a folder that exists. Check the spelling, or make the folder first.", "NOT_A_FOLDER", 400);
      return res.path;
    },
  });
}

async function askMissingFolders(folders) {
  const d = openDialog({
    title: "The original folder is gone",
    body: [
      h("p", {}, folders.length === 1 ? "The folder these items came from doesn't exist any more:" : `${plural(folders.length, "folder")} these items came from don't exist any more:`),
      h("ul", { class: "detail-list" }, folders.slice(0, 6).map((f) => h("li", {}, f)), folders.length > 6 ? h("li", {}, `…and ${folders.length - 6} more`) : null),
      h("p", { class: "hint" }, "You can make the folder again and put the items back in it, or choose a different folder."),
    ],
    buttons: [{ label: "Cancel", value: null }, { label: "Choose another folder…", value: "other" }, { label: "Create the folder", value: "create", primary: true }],
  });
  return d.result;
}

/** Puts a restore (or a restore-and-replace) back the way it was: buries the restored items again and brings back what was replaced. */
function undoRestore(done) {
  const paths = done.map((d) => d.restoredTo);
  const trashIds = done.filter((d) => d.replaced).map((d) => d.replaced.trashId);
  emit("undo-push", {
    label: `restore of ${plural(done.length, "item")} from the graveyard`,
    run: async () => {
      const buried = await call("grave/bury", { paths });
      const bad = buried.results.find((r) => !r.ok);
      if (bad) throw new Error(bad.message);
      if (trashIds.length) await call("trash/restore", { ids: trashIds });
    },
  });
}

/** After anything here changed what is on disk or in the graveyard. */
async function changed({ bin = false } = {}) {
  emit("grave-changed");
  await refresh({ keepSelection: false });
  if (bin) await refreshTrashCount();
}

/**
 * The whole "Restore" experience for `ids`: checks first, asks what to do about a missing folder or a name that is
 * already taken, then restores and offers Undo. Resolves true when something was done, false when it was cancelled.
 */
export async function restoreIds(ids, { to } = {}) {
  let check;
  try {
    check = await call("grave/check", { ids, to });
  } catch (err) {
    toast(say(err), { kind: "error" });
    return false;
  }
  const gone = check.items.filter((i) => i.missingFiles);
  const usable = check.items.filter((i) => !i.missingFiles);
  if (!usable.length) {
    await problemsBox("Nothing could be restored", "These items can't be restored:", [...gone.map((i) => `${i.name}: its files are no longer in the graveyard. Use Verify to tidy up the list.`), ...check.unknown.map(() => "An item is no longer in the graveyard.")]);
    return false;
  }
  let makeFolders = false;
  if (!to) {
    if (usable.some((i) => i.unknownOrigin)) {
      const ok = await confirmBox({ title: "Where should these go?", message: "Some items don't know where they came from (Verify found them and added them back). Choose one folder to restore everything you selected into.", confirmLabel: "Choose a folder…" });
      if (!ok) return false;
      const folder = await askFolder({ title: "Restore to…", label: "Folder to restore into" });
      return folder ? restoreIds(ids, { to: folder }) : false;
    }
    const missingFolders = [...new Set(usable.filter((i) => i.folderMissing).map((i) => i.folder))];
    if (missingFolders.length) {
      const choice = await askMissingFolders(missingFolders);
      if (!choice) return false;
      if (choice === "other") {
        const folder = await askFolder({ title: "Restore to…", label: "Folder to restore into" });
        return folder ? restoreIds(ids, { to: folder }) : false;
      }
      makeFolders = true;
    }
  }
  let conflict = "ask";
  const clashes = usable.filter((i) => i.conflict);
  if (clashes.length) {
    const pick = await chooseConflict({ conflicts: clashes.map((c) => ({ name: c.targetName ?? c.name })), verb: "Restore" });
    if (!pick) return false;
    conflict = pick;
  }
  let res;
  try {
    res = await call("grave/restore", { ids: usable.map((i) => i.id), to, conflict, makeFolders });
  } catch (err) {
    toast(say(err), { kind: "error" });
    return false;
  }
  if (res.job) emit("job-started", res.job);
  const done = res.results.filter((r) => r.ok && r.value.status === "done").map((r) => r.value);
  const skipped = res.results.filter((r) => r.ok && r.value.status === "skipped").length;
  const problems = [...new Set(res.results.filter((r) => !r.ok).map((r) => r.message))];
  if (done.length) {
    undoRestore(done);
    const first = done[0].restoredTo;
    const note = skipped ? ` (${skipped} skipped)` : "";
    toast(done.length === 1 ? `Restored “${baseName(first, state.sep)}”${note}.` : `Restored ${plural(done.length, "item")}${note}.`, {
      kind: "success",
      action: { label: "Show it", run: () => { emit("workspace-go", "files"); goTo(parentOf(first, state.sep), { select: [first] }); } },
    });
  } else if (res.job) {
    toast(`${plural(res.queued, "item")} ${res.queued === 1 ? "is" : "are"} being copied back from another disk. Watch the task list.`, { kind: "info" });
  } else if (skipped && !problems.length) toast(`Nothing was restored: ${plural(skipped, "item")} skipped.`, { kind: "info" });
  if (problems.length) await problemsBox(`${plural(problems.length, "problem")} while restoring`, "Here is why:", problems);
  await changed({ bin: done.some((d) => d.replaced) });
  return done.length > 0 || !!res.job;
}

/** Restore to… : asks for a folder, then restores there. */
export async function restoreToFolder(ids) {
  const folder = await askFolder({ title: "Restore to…", label: "Folder to restore into", hint: "The items keep their own names in this folder. If a name is already used there you choose what happens." });
  return folder ? restoreIds(ids, { to: folder }) : false;
}

// ---------------------------------------------------------------------------------------------------------------
// Deleting for good
// ---------------------------------------------------------------------------------------------------------------

function reportDeleted(res) {
  if (res.job) {
    emit("job-started", res.job);
    return toast(`Deleting ${plural(res.count, "item")} for good in the background. Watch the task list.`, { kind: "info" });
  }
  if (res.failed?.length) return problemsBox("Some items couldn't be deleted", "Here is why:", res.failed.map((f) => `${f.name}: ${f.message}`));
  toast(`Deleted ${plural(res.deleted, "item")} for good${res.freedBytes ? ` and freed ${formatSize(res.freedBytes)}` : ""}.`, { kind: "success" });
}

async function runDelete(body) {
  try {
    reportDeleted(await call("grave/decompose", { ...body, confirm: true }));
  } catch (err) {
    toast(say(err), { kind: "error" });
  }
  await changed();
}

/** Delete the chosen buried items permanently, after saying how many and how big. */
export async function deleteIds(ids, names) {
  let q;
  try {
    q = await call("grave/decompose", { ids, dryRun: true });
  } catch (err) {
    toast(say(err), { kind: "error" });
    return false;
  }
  const ok = await confirmBox({
    title: "Delete for good?",
    message: `${q.count === 1 && names[0] ? `“${names[0]}”` : plural(q.count, "item")} (${q.human}) will be deleted permanently. This can't be undone, and ${q.count === 1 ? "it" : "they"} won't go to the Recycle Bin.`,
    confirmLabel: "Delete for good",
    danger: true,
    details: q.count > 1 ? [...names.slice(0, 6), ...(names.length > 6 ? [`…and ${names.length - 6} more`] : [])] : [],
  });
  if (!ok) return false;
  await runDelete({ ids, expectCount: q.count });
  return true;
}

/** Delete everything buried more than N days ago. The number can be changed; the question shows the count and size. */
export async function deleteOlderThan() {
  const days = h("input", { type: "number", min: "1", max: "36500", step: "1", value: "30", class: "text-input", "aria-label": "Days", title: "Items buried more than this many days ago are deleted. Type a whole number from 1 up." });
  const summary = h("p", { role: "status", class: "hint" }, "Counting…");
  const dlg = openDialog({
    title: "Delete old items for good",
    body: [h("label", { class: "field" }, h("span", { class: "field-label" }, "Delete everything buried more than this many days ago"), days), summary,
      h("p", { class: "hint" }, "This can't be undone, and the items won't go to the Recycle Bin.")],
    buttons: [{ label: "Cancel", value: null }, { label: "Delete for good", value: "go", danger: true, disabled: true }],
    initialFocus: days,
  });
  let current = 0;
  let count = 0;
  const recount = async () => {
    const mine = ++current;
    const n = Number(days.value);
    dlg.setDisabled("go", true);
    if (!Number.isInteger(n) || n < 1 || n > 36500) return void (summary.textContent = "Type a whole number of days, from 1 to 36500.");
    try {
      const q = await call("grave/decompose", { olderThanDays: n, dryRun: true });
      if (mine !== current) return;
      count = q.count;
      summary.textContent = q.count ? `${plural(q.count, "item")} (${q.human}) will be deleted.` : "Nothing is that old, so nothing would be deleted.";
      dlg.setDisabled("go", q.count === 0);
    } catch (err) {
      if (mine === current) summary.textContent = say(err);
    }
  };
  days.addEventListener("input", recount);
  recount();
  if ((await dlg.result) !== "go") return false;
  await runDelete({ olderThanDays: Number(days.value), expectCount: count });
  return true;
}

/** Delete everything: the count and size are shown, the word "empty" must be typed, and the button unlocks after a short wait. */
export async function emptyEverything() {
  let q;
  try {
    q = await call("grave/decompose", { all: true, dryRun: true });
  } catch (err) {
    toast(say(err), { kind: "error" });
    return false;
  }
  const word = h("input", { type: "text", class: "text-input", autocomplete: "off", spellcheck: "false", "aria-label": "Type the word empty to confirm", title: "Type the word empty (in any letters) to unlock the button.", placeholder: "empty" });
  const wait = h("p", { class: "hint", role: "status" });
  const dlg = openDialog({
    title: "Empty the whole graveyard?",
    body: [
      h("p", {}, q.count ? `All ${plural(q.count, "item")} (${q.human}) will be deleted permanently, together with any unfinished copies.` : "The list is empty, but any leftover files in the graveyard folder will be deleted permanently."),
      h("p", { class: "hint" }, "This can't be undone. Rip Studio and the other Rip tools share this graveyard, so they will lose these items too."),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Type the word empty to confirm"), word),
      wait,
    ],
    buttons: [{ label: "Cancel", value: null }, { label: "Empty the graveyard", value: "go", danger: true, disabled: true }],
    initialFocus: word,
  });
  let ready = emptyDelayMs <= 0;
  const update = () => {
    const typedOk = word.value.trim().toLowerCase() === "empty";
    dlg.setDisabled("go", !(typedOk && ready));
    wait.textContent = ready ? (typedOk ? "" : "Type the word empty to unlock the button.") : "The button unlocks in a moment, so it can't be pressed by accident.";
  };
  word.addEventListener("input", update);
  update();
  if (!ready && typeof document !== "undefined") setTimeout(() => { ready = true; update(); }, emptyDelayMs);
  if ((await dlg.result) !== "go") return false;
  await runDelete({ all: true, typed: word.value, expectCount: q.count });
  return true;
}
