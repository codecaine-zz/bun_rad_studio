// Drag and drop. Items are dragged inside this window onto folders (in the list, the sidebar or the address bar)
// or onto the Recycle Bin. Dropping moves them; holding Ctrl (Option on macOS) copies.
import { dropOnTrash, dropOnto } from "./ops.js";
import { state } from "./state.js";
import { isInside, wantsCopy } from "./util.js";

/** What is being dragged right now (paths), or empty. */
export const drag = { paths: /** @type {string[]} */ ([]) };

export function startDrag(e, paths, labelText) {
  drag.paths = paths;
  e.dataTransfer.effectAllowed = "copyMove";
  e.dataTransfer.setData("text/plain", labelText);
  document.body.classList.add("dragging");
}

export function endDrag() {
  drag.paths = [];
  document.body.classList.remove("dragging");
  document.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
}

/** A folder can't be dropped on itself or on something inside itself. */
function acceptable(destPath) {
  if (!drag.paths.length) return false;
  return !drag.paths.some((p) => isInside(destPath, p, state.sep, state.sep === "\\"));
}

/**
 * Makes `el` a place to drop items. `getPath()` gives the folder; with `trash: true` dropping deletes (to the bin).
 * @param {HTMLElement} el
 * @param {{ getPath?: () => string | null, trash?: boolean }} options
 */
export function attachDropTarget(el, { getPath, trash = false }) {
  const ok = () => {
    if (!drag.paths.length) return false;
    if (trash) return true;
    const path = getPath?.();
    return !!path && acceptable(path);
  };
  el.addEventListener("dragover", (e) => {
    if (!ok()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = trash ? "move" : wantsCopy(e, state.platform) ? "copy" : "move";
    el.classList.add("drop-target");
  });
  el.addEventListener("dragleave", (e) => {
    if (!el.contains(e.relatedTarget)) el.classList.remove("drop-target");
  });
  el.addEventListener("drop", async (e) => {
    el.classList.remove("drop-target");
    if (!ok()) return;
    e.preventDefault();
    e.stopPropagation();
    const paths = [...drag.paths];
    const copy = wantsCopy(e, state.platform);
    endDrag();
    if (trash) await dropOnTrash(paths);
    else await dropOnto(getPath(), paths, copy);
  });
}
