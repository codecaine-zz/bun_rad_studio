// Lock (encrypt) and unlock (decrypt) from the file list: which items may be locked, and what the Lock button, the
// right-click menu and Enter on a .radenc file do. The dialogs themselves are in vaultEncrypt.js and vaultDecrypt.js.
import { toast } from "./menus.js";
import { selectedEntries } from "./selection.js";
import { inTrash } from "./pane.js";
import { extensionOf } from "./util.js";
import { openDecryptDialog } from "./vaultDecrypt.js";
import { openEncryptDialog } from "./vaultEncrypt.js";

/** A file made by Encrypt (its name ends in .radenc). */
export const isLocked = (entry) => !entry.isDir && extensionOf(entry.name) === "radenc";

/** Files and folders can be locked; already-locked files and the Recycle Bin can't. */
export const canLock = (entries) => entries.length > 0 && !inTrash() && entries.every((e) => !isLocked(e));

export const canUnlock = (entries) => entries.length > 0 && !inTrash() && entries.every(isLocked);

export function lockEntries(entries) {
  if (inTrash()) return toast("Items in the Recycle Bin can't be locked. Restore them first.");
  if (!canLock(entries)) return toast("Those items are already locked. Pick files or folders that aren't, or pick only .radenc files to unlock.", { kind: "error" });
  return openEncryptDialog(entries);
}

export function unlockEntries(entries) {
  if (!canUnlock(entries)) return toast("Pick .radenc files to unlock.", { kind: "error" });
  return openDecryptDialog(entries);
}

/** The Lock button: locks the selection, or unlocks it when it is made of .radenc files. */
export function lockSelection() {
  const entries = selectedEntries();
  if (!entries.length) return toast("Select the files or folders to lock (or a .radenc file to unlock) first.");
  if (canUnlock(entries)) return unlockEntries(entries);
  return lockEntries(entries);
}
