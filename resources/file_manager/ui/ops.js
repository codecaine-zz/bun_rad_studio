// Everything the person can do to files, with Undo. Each operation calls the server, explains problems in plain
// words, offers Undo where it is possible, and refreshes the view.
import { ApiError, call } from "./api.js";
import { chooseConflict, confirmBox, problemsBox } from "./dialogs.js";
import { announce } from "./dom.js";
import { toast } from "./menus.js";
import { openInCode } from "./code.js";
import { hasNoExtension, isKnownTextName } from "./codeLang.js";
import { openInEditor } from "./fileurl.js";
import { finishOpen } from "./openwith.js";
import { busy, goTo, goToIn, refresh, refreshTrashCount, saveSettings, showTrash } from "./nav.js";
import { bulkRenameDialog } from "./extras.js";
import { buryItems } from "./graveBury.js";
import { activePane, currentPath, inTrash, isFolderView } from "./pane.js";
import { selectKeys, selectedEntries } from "./selection.js";
import { emit, on, state } from "./state.js";
import { announceVerdict, askOpenAnyway, skipMismatchGuard } from "./typecheck.js";
import { baseName, parentOf, plural } from "./util.js";
import { isLocked, unlockEntries } from "./vault.js";

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

function tally(results) {
  const done = [];
  const failed = [];
  for (const r of results) (r.ok ? done : failed).push(r.ok ? r.value : r.message);
  return { done, failed };
}

async function reportFailures(failed, doing) {
  const unique = [...new Set(failed)];
  if (!unique.length) return;
  if (failed.length === 1) toast(unique[0], { kind: "error" });
  else await problemsBox(`${plural(failed.length, "item")} couldn't be ${doing}`, "Here is why:", unique);
}

function fail(err) {
  toast(err instanceof ApiError ? err.message : "That didn't work.", { kind: "error" });
}

const names = (paths) => paths.map((p) => baseName(p, state.sep));
const canChangeHere = () => isFolderView();

function needFolder(what) {
  if (!canChangeHere()) {
    toast(inTrash() ? `Open a folder first: ${what} isn't possible inside the Recycle Bin.` : `Close the search results first: ${what} needs a folder.`, { kind: "info" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------------------------------------------

export function pushUndo(label, run) {
  state.undoStack.push({ label, run });
  if (state.undoStack.length > 50) state.undoStack.shift();
  emit("undo");
}

export async function undo() {
  const entry = state.undoStack.pop();
  emit("undo");
  if (!entry) return toast("There is nothing to undo.");
  try {
    await busy(() => entry.run());
    toast(`Undone: ${entry.label}`, { kind: "success" });
  } catch (err) {
    toast(`Couldn't undo: ${err instanceof Error ? err.message : "something went wrong"}`, { kind: "error" });
  }
  await refresh();
  await refreshTrashCount();
}

function ensureOk(results, what) {
  const { failed } = tally(results);
  if (failed.length) throw new Error(failed[0] ?? `${what} failed`);
}

// Windows that sit below this module (the Properties window) can't import it, so they ask for Undo steps by event.
on("undo-push", ({ label, run }) => pushUndo(label, run));
on("undo-last", () => undo());

/** Sends items to the Recycle Bin; resolves the records ({ path, id }) for those that worked. */
async function trashPaths(paths) {
  const res = await call("trash", { paths });
  return tally(res.results);
}

// ---------------------------------------------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------------------------------------------

/**
 * Whether opening this file should use the Code editor (or the editor chosen in Settings) instead of the computer's own
 * program: plain text and source files, unless Settings says "the program my computer uses". Programs and scripts that
 * would run still ask first, as before.
 */
export function textOpensInEditor(entry) {
  return !entry.isDir && !entry.program && state.settings.textOpensIn !== "system" && isKnownTextName(entry.name);
}

const LOOK_INSIDE_MAX = 2 * 1024 * 1024;

/**
 * A file with no extension that isn't a well-known text name (NOTICE.third-party, a script without .sh, a data file) could be
 * anything: the server looks inside it, and it opens in the editor only when it really is text.
 */
async function isPlainTextInside(entry) {
  if (entry.isDir || entry.program || state.settings.textOpensIn === "system" || !hasNoExtension(entry.name)) return false;
  if (entry.kind && entry.kind !== "file" && entry.kind !== "other" && entry.kind !== "text") return false;
  if (!(entry.size > 0) || entry.size > LOOK_INSIDE_MAX) return false;
  try {
    const { preview } = await call("preview", { path: entry.path });
    return preview?.type === "text";
  } catch {
    return false;
  }
}

export async function openEntry(entry) {
  if (inTrash()) return toast("Items in the Recycle Bin can't be opened. Restore one first (right-click, then Restore).");
  if (entry.isDir) return goToIn(activePane(), entry.path);
  if (isLocked(entry)) return unlockEntries([entry]);
  if (textOpensInEditor(entry) || (await isPlainTextInside(entry))) {
    if (state.settings.textOpensIn === "editor") return openInEditor(entry);
    return openInCode(entry.path);
  }
  await openFile(entry.path, false);
}

async function openFile(path, confirmed, mismatchOk = false) {
  try {
    const res = await call("open", { path, confirmProgram: confirmed, confirmMismatch: mismatchOk || skipMismatchGuard() });
    finishOpen(res, path);
    call("settings").then((r) => { state.settings = r.settings; emit("settings", {}); }).catch(() => {});
  } catch (err) {
    if (err instanceof ApiError && err.code === "TYPE_MISMATCH") {
      if (await askOpenAnyway(path, err)) await openFile(path, confirmed, true);
      return;
    }
    if (err instanceof ApiError && err.code === "NEEDS_CONFIRM") {
      const ok = await confirmBox({
        title: "Run this program?",
        message: `"${baseName(path, state.sep)}" is a program or installer. Opening it will run it on your computer. Only continue if you trust where it came from.`,
        confirmLabel: "Run it",
        danger: true,
      });
      if (ok) await openFile(path, true, mismatchOk);
      return;
    }
    fail(err);
  }
}

/** From a search result: open the folder it is in, with the item selected. */
export async function goToContaining(entry) {
  const parent = parentOf(entry.path, state.sep);
  if (parent) await goTo(parent, { select: entry.path });
}

export async function revealEntry(entry) {
  try {
    const r = await call("reveal", { path: entry.path });
    announce(`Showing in ${r.with}`);
  } catch (err) {
    fail(err);
  }
}

export async function copyPathOf(entries) {
  const text = entries.map((e) => e.path).join("\n");
  try {
    const r = await call("copytext", { text });
    toast(r.copied ? (entries.length === 1 ? "Path copied." : "Paths copied.") : "Couldn't copy to the clipboard.", { kind: r.copied ? "success" : "error" });
  } catch (err) {
    fail(err);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// New folder / file, rename
// ---------------------------------------------------------------------------------------------------------------

/** The most recently created item: renaming it right away is part of creating it, not a separate undo step. */
let lastCreated = null;

async function createItem(op, label) {
  if (!needFolder(`creating a ${label}`)) return;
  const pane = activePane();
  try {
    const r = await busy(() => call(op, { parent: currentPath(pane) }));
    lastCreated = { path: r.path };
    const tracker = lastCreated;
    pushUndo(`new ${label}`, async () => ensureOk((await trashPaths([tracker.path])).failed.map((m) => ({ ok: false, message: m })), "undo"));
    await refresh({ keepSelection: false, pane });
    selectKeys([r.path], pane);
    emit("rename-request", { key: r.path, pane });
  } catch (err) {
    fail(err);
  }
}

export const newFolder = () => createItem("mkdir", "folder");
export const newFile = () => createItem("newfile", "file");
export const newSqlite = () => createItem("newsqlite", "SQLite database");

/** Renames one item; throws an ApiError when the name isn't accepted (the caller shows it next to the name). */
export async function commitRename(path, newName, pane = activePane()) {
  const r = await call("rename", { path, name: newName });
  if (r.from === r.to) return r;
  if (lastCreated && lastCreated.path === r.from) {
    lastCreated.path = r.to;
    const top = state.undoStack.at(-1);
    if (top) top.label = `new item "${baseName(r.to, state.sep)}"`;
  } else {
    pushUndo(`rename "${baseName(r.from, state.sep)}"`, async () => ensureOk((await call("relocate", { pairs: [{ from: r.to, to: r.from }] })).results, "rename"));
  }
  await refresh({ keepSelection: false, pane });
  selectKeys([r.to], pane);
  announceVerdict(r.to);
  return r;
}

/** Rename: in place for one item, a dialog with a preview for several. */
export async function renameSelection() {
  const pane = activePane();
  const items = selectedEntries(pane);
  if (!items.length || inTrash(pane)) return;
  if (items.length === 1) return emit("rename-request", { key: items[0].path, pane });
  const folders = new Set(items.map((e) => parentOf(e.path, state.sep)));
  if (folders.size !== 1) return toast("To rename several items at once, they need to be in the same folder.");
  const folder = [...folders][0];
  const rows = await bulkRenameDialog(folder, items.map((e) => e.name));
  if (!rows || !rows.length) return;
  const sep = state.sep;
  pushUndo(`rename of ${plural(rows.length, "item")}`, async () => {
    const pairs = rows.map((r) => ({ from: `${folder}${folder.endsWith(sep) ? "" : sep}${r.to}`, to: `${folder}${folder.endsWith(sep) ? "" : sep}${r.from}` }));
    ensureOk((await call("relocate", { pairs })).results, "rename");
  });
  toast(`Renamed ${plural(rows.length, "item")}.`, { kind: "success", action: { label: "Undo", run: undo } });
  await refresh({ keepSelection: false, pane });
  selectKeys(rows.map((r) => `${folder}${folder.endsWith(sep) ? "" : sep}${r.to}`), pane);
}

// ---------------------------------------------------------------------------------------------------------------
// Copy, cut, paste, duplicate, drag and drop
// ---------------------------------------------------------------------------------------------------------------

export function copySelection() {
  const items = selectedEntries();
  if (!items.length || inTrash()) return;
  state.clipboard = { mode: "copy", paths: items.map((e) => e.path) };
  emit("clipboard");
  toast(`${plural(items.length, "item")} ready to paste. Open a folder and press Paste.`, { timeout: 3500 });
}

export function cutSelection() {
  const items = selectedEntries();
  if (!items.length || inTrash()) return;
  state.clipboard = { mode: "cut", paths: items.map((e) => e.path) };
  emit("clipboard");
  toast(`${plural(items.length, "item")} ready to move. Open a folder and press Paste.`, { timeout: 3500 });
}

export async function paste() {
  if (!state.clipboard) return toast("There's nothing to paste yet. Select items and choose Copy or Cut first.");
  if (!needFolder("pasting")) return;
  await pasteInto(currentPath());
}

/** Pastes the clipboard into `dest` (the open folder, or a folder you right-clicked). */
export async function pasteInto(dest) {
  if (!state.clipboard) return;
  const { mode, paths } = state.clipboard;
  const moved = await transferInto(dest, paths, mode === "cut" ? "move" : "copy");
  if (moved && mode === "cut") {
    state.clipboard = null;
    emit("clipboard");
  }
}

export async function duplicateSelection() {
  const items = selectedEntries();
  if (!items.length || !needFolder("duplicating")) return;
  await transferInto(currentPath(), items.map((e) => e.path), "copy");
}

/** Jobs this page started, so that when one ends the page knows where to look and what Undo should do. */
const pendingTransfers = new Map();

/**
 * Copies or moves `sources` into `dest`, asking what to do about name clashes. The work runs in the tasks tray (so the
 * rest of the window stays usable); what happens when it ends is in `onFileOpDone`. Resolves true when it was started.
 * `pane` is the list the person is working in (it loses its selection and shows the new items when they land in it).
 */
export async function transferInto(dest, sources, mode, pane = activePane()) {
  const verb = mode === "copy" ? "Copy" : "Move";
  try {
    const { conflicts } = await call("conflicts", { sources, dest });
    let policy = "rename";
    if (conflicts.length) {
      policy = await chooseConflict({ conflicts, verb });
      if (!policy) return false;
    }
    const { job } = await call("fileops/start", { mode, sources, dest, policy });
    pendingTransfers.set(job.id, { mode, dest, pane });
    emit("job-started", job);
    announce(`${verb} started: ${plural(sources.length, "item")}. Progress is in the task list.`);
    return true;
  } catch (err) {
    fail(err);
    return false;
  }
}

/** A copy or move from the queue ended (finished, partly failed or cancelled): refresh, offer Undo for what was done, say what was not. */
async function onFileOpDone(job) {
  if (job.kind === "rename") return refresh({ keepSelection: false });
  const mine = pendingTransfers.get(job.id);
  pendingTransfers.delete(job.id);
  const mode = job.kind;
  const worked = job.steps.filter((s) => s.state === "done" && s.item?.destination).map((s) => ({ source: s.item.source, destination: s.item.destination, replaced: s.item.replacedTrashId ? { trashId: s.item.replacedTrashId } : null }));
  if (worked.length) {
    pushUndo(`${mode} of ${plural(worked.length, "item")}`, () => undoTransfer(mode, worked));
    const skipped = job.steps.filter((s) => s.state === "skipped" && s.skipReason === "policy").length;
    const problems = job.failed + job.steps.filter((s) => s.skipReason === "cancelled").length;
    const text = `${mode === "copy" ? "Copied" : "Moved"} ${plural(worked.length, "item")}${skipped ? ` (${skipped} skipped)` : ""}${problems ? `. ${plural(problems, "item")} did not finish: see the task list` : ""}.`;
    toast(text, { kind: problems ? "info" : "success", action: { label: "Undo", run: undo } });
  } else if (!job.failed && job.state !== "cancelled") {
    toast(mode === "move" ? "Those items are already in this folder." : "Nothing was copied.");
  }
  const pane = mine?.pane ?? activePane();
  await refresh({ keepSelection: false, pane });
  if (mine && worked.length && currentPath(pane) === mine.dest) selectKeys(worked.map((w) => w.destination), pane);
}

on("fileop-done", (job) => { onFileOpDone(job).catch((err) => fail(err)); });

async function undoTransfer(mode, worked) {
  if (mode === "copy") {
    const { failed } = await trashPaths(worked.map((w) => w.destination));
    if (failed.length) throw new Error(failed[0]);
  } else {
    ensureOk((await call("relocate", { pairs: worked.map((w) => ({ from: w.destination, to: w.source })) })).results, "move");
  }
  const replaced = worked.filter((w) => w.replaced).map((w) => w.replaced.trashId);
  if (replaced.length) await call("trash/restore", { ids: replaced });
}

/** Dropping items onto a folder: moves them (or copies, with the copy key held). */
export async function dropOnto(destPath, sources, copy) {
  const real = sources.filter((s) => s !== destPath);
  if (!real.length) return;
  await transferInto(destPath, real, copy ? "copy" : "move");
}

export async function dropOnTrash(sources) {
  await trashItems(sources);
}

// ---------------------------------------------------------------------------------------------------------------
// Recycle Bin and deleting
// ---------------------------------------------------------------------------------------------------------------

/** Deleting (the Delete key and button): to the Recycle Bin, or to the Rip graveyard when Settings says so. Both can be undone. */
export async function trashSelection() {
  if (inTrash()) return deleteFromTrashForever();
  if (state.settings.deleteTo === "graveyard") return burySelection();
  return moveSelectionToBin();
}

/** Always moves to the app's Recycle Bin, whatever Delete is set to use. */
export async function moveSelectionToBin() {
  if (inTrash()) return deleteFromTrashForever();
  const items = selectedEntries();
  if (!items.length) return;
  await trashItems(items.map((e) => e.path));
}

/** Always buries in the Rip graveyard (shared with Rip Studio and the rip tools). Undo brings it back. */
export async function burySelection() {
  if (inTrash()) return toast("Open a folder first: the Recycle Bin can't be buried.", { kind: "info" });
  const items = selectedEntries();
  if (!items.length) return;
  await buryItems(items.map((e) => e.path));
}

async function trashItems(paths) {
  try {
    const { done, failed } = await busy(() => trashPaths(paths));
    if (done.length) {
      const ids = done.map((d) => d.id);
      pushUndo(`delete of ${plural(done.length, "item")}`, async () => ensureOk((await call("trash/restore", { ids })).results, "restore"));
      toast(`Moved ${plural(done.length, "item")} to the Recycle Bin.`, { kind: "success", action: { label: "Undo", run: undo } });
    }
    await refresh({ keepSelection: false });
    await refreshTrashCount();
    await reportFailures(failed, "deleted");
  } catch (err) {
    fail(err);
  }
}

/** Shift+Delete: deletes for good, after asking. */
export async function deleteForever() {
  if (inTrash()) return deleteFromTrashForever();
  const items = selectedEntries();
  if (!items.length) return;
  const ok = await confirmBox({
    title: "Delete permanently?",
    message: `${items.length === 1 ? `"${items[0].name}"` : plural(items.length, "item")} will be deleted for good. This can't be undone, and it won't go to the Recycle Bin.`,
    confirmLabel: "Delete permanently",
    danger: true,
    details: items.length > 1 ? items.slice(0, 6).map((e) => e.name) : [],
  });
  if (!ok) return;
  try {
    const res = await busy(() => call("delete", { paths: items.map((e) => e.path), confirm: true }));
    const { done, failed } = tally(res.results);
    if (done.length) toast(`Deleted ${plural(done.length, "item")} permanently.`, { kind: "success" });
    await refresh({ keepSelection: false });
    await reportFailures(failed, "deleted");
  } catch (err) {
    fail(err);
  }
}

export async function restoreFromBin() {
  const items = selectedEntries();
  if (!items.length || !inTrash()) return;
  try {
    const res = await busy(() => call("trash/restore", { ids: items.map((e) => e.path) }));
    const { done, failed } = tally(res.results);
    if (done.length) {
      const restored = done.map((d) => d.restoredTo);
      pushUndo(`restore of ${plural(done.length, "item")}`, async () => {
        const { failed: f } = await trashPaths(restored);
        if (f.length) throw new Error(f[0]);
      });
      const first = restored[0];
      toast(`Restored ${plural(done.length, "item")}.`, { kind: "success", action: { label: "Show", run: () => goTo(parentOf(first, state.sep) ?? first, { select: first }) } });
    }
    await refresh({ keepSelection: false });
    await refreshTrashCount();
    await reportFailures(failed, "restored");
  } catch (err) {
    fail(err);
  }
}

async function deleteFromTrashForever() {
  const items = selectedEntries();
  if (!items.length) return;
  const ok = await confirmBox({
    title: "Delete forever?",
    message: `${items.length === 1 ? `"${items[0].name}"` : plural(items.length, "item")} will be deleted permanently from the Recycle Bin. This can't be undone.`,
    confirmLabel: "Delete forever",
    danger: true,
  });
  if (!ok) return;
  try {
    const r = await busy(() => call("trash/delete", { ids: items.map((e) => e.path), confirm: true }));
    toast(`Deleted ${plural(r.deleted, "item")} permanently.`, { kind: "success" });
    await refresh({ keepSelection: false });
    await refreshTrashCount();
  } catch (err) {
    fail(err);
  }
}

export async function emptyBin() {
  if (state.trashCount === 0) return toast("The Recycle Bin is already empty.");
  const ok = await confirmBox({
    title: "Empty the Recycle Bin?",
    message: `All ${plural(state.trashCount, "item")} in the Recycle Bin will be deleted permanently. This can't be undone.`,
    confirmLabel: "Empty Recycle Bin",
    danger: true,
  });
  if (!ok) return;
  try {
    const r = await busy(() => call("trash/delete", { confirm: true }));
    toast(`Emptied the Recycle Bin (${plural(r.deleted, "item")}).`, { kind: "success" });
    if (inTrash()) await showTrash({ push: false });
    await refreshTrashCount();
    state.undoStack = state.undoStack.filter((u) => !/^delete of|^restore of/.test(u.label));
    emit("undo");
  } catch (err) {
    fail(err);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------------------------------------------

export async function zipSelection() {
  const pane = activePane();
  const items = selectedEntries(pane);
  if (!items.length || !needFolder("making a zip file")) return;
  try {
    const r = await busy(() => call("zip", { paths: items.map((e) => e.path) }));
    pushUndo(`zip "${baseName(r.zipPath, state.sep)}"`, async () => {
      const { failed } = await trashPaths([r.zipPath]);
      if (failed.length) throw new Error(failed[0]);
    });
    const extra = r.skippedLinks ? ` ${plural(r.skippedLinks, "shortcut")} (links) were left out.` : "";
    toast(`Created "${baseName(r.zipPath, state.sep)}" with ${plural(r.files, "file")}.${extra}`, { kind: "success", action: { label: "Undo", run: undo } });
    await refresh({ keepSelection: false, pane });
    selectKeys([r.zipPath], pane);
  } catch (err) {
    fail(err);
  }
}

export async function unzipEntry(entry) {
  if (!needFolder("extracting")) return;
  const pane = activePane();
  try {
    const r = await busy(() => call("unzip", { path: entry.path }));
    pushUndo(`extract "${entry.name}"`, async () => {
      const { failed } = await trashPaths([r.folder]);
      if (failed.length) throw new Error(failed[0]);
    });
    toast(`Extracted ${plural(r.files, "file")} into "${baseName(r.folder, state.sep)}".`, { kind: "success", action: { label: "Undo", run: undo } });
    await refresh({ keepSelection: false, pane });
    selectKeys([r.folder], pane);
    if (r.skipped.length) await problemsBox("Some items were skipped", "These items were not extracted, to keep your computer safe:", r.skipped.slice(0, 20));
  } catch (err) {
    fail(err);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------------------------------------------

export const isFavorite = (path) => state.settings.favorites.includes(path);

export async function toggleFavorite(path) {
  const favorites = isFavorite(path) ? state.settings.favorites.filter((f) => f !== path) : [...state.settings.favorites, path];
  try {
    await saveSettings({ favorites });
    toast(isFavorite(path) ? `Added "${baseName(path, state.sep)}" to Favorites.` : `Removed "${baseName(path, state.sep)}" from Favorites.`, { timeout: 3000 });
  } catch (err) {
    fail(err);
  }
}
