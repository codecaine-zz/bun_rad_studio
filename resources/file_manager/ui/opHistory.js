// "Activity": the history of copies, moves and renames, kept between runs (paths and outcomes only).
// Shows what finished, what failed and why, and what was left unfinished. Loading, empty and error states are spelled out.
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { formatSize, plural } from "./util.js";

const WORDS = { done: "Finished", failed: "Some items failed", cancelled: "Cancelled", interrupted: "Interrupted (the app closed)", running: "Running", waiting: "Waiting" };
const ITEM_WORDS = { done: "done", failed: "failed", skipped: "not done", waiting: "not started", running: "interrupted" };

function entryView(entry) {
  const when = entry.startedAt ? new Date(entry.startedAt).toLocaleString() : "";
  const size = entry.bytesTotal !== null ? `${formatSize(entry.bytesDone)} of ${formatSize(entry.bytesTotal)}` : entry.bytesDone ? `${formatSize(entry.bytesDone)} (total size unknown)` : "";
  const counts = [`${entry.done} done`, entry.failed ? `${entry.failed} failed` : "", entry.skipped ? `${entry.skipped} not done or left alone` : ""].filter(Boolean).join(", ");
  const problems = entry.items.filter((i) => i.state !== "done");
  return h("details", { class: "oph-entry", "data-state": entry.state, open: entry.state !== "done" },
    h("summary", {}, `${entry.title}: ${WORDS[entry.state] ?? entry.state}`),
    h("p", { class: "oph-meta" }, [when, counts, size].filter(Boolean).join("  ·  ")),
    problems.length
      ? h("ul", { class: "oph-items" }, ...problems.map((i) => h("li", {}, `${i.source} (${ITEM_WORDS[i.state] ?? i.state})${i.message ? `: ${i.message}` : ""}`)), entry.itemsOmitted ? h("li", {}, `…and ${plural(entry.itemsOmitted, "more item")} not listed.`) : null)
      : h("p", { class: "oph-meta" }, "Every item finished."),
  );
}

export async function showOperationHistory() {
  const list = h("div", { class: "oph-list", "aria-live": "polite" }, h("p", { class: "oph-meta" }, "Loading…"));
  const dlg = openDialog({
    title: "File activity: copy, move, rename and delete",
    wide: true,
    describe: "What was copied, moved, renamed or deleted, and what did not finish.",
    body: [list, h("p", { class: "oph-meta" }, "This list keeps paths and outcomes only, never file contents. Clearing it does not touch any file. A finished operation can only be retried while the app stays open.")],
    buttons: [{ label: "Clear the list", value: "clear" }, { label: "Close", primary: true, value: null }],
  });
  try {
    const { entries } = await call("fileops/history");
    list.replaceChildren(...(entries.length ? entries.map(entryView) : [h("p", { class: "oph-meta" }, "Nothing yet. Copies, moves, renames and deletes you run through the task list will be listed here.")]));
  } catch (err) {
    list.replaceChildren(h("p", { class: "dialog-error", role: "alert" }, err instanceof ApiError ? err.message : "The history could not be read."));
  }
  if ((await dlg.result) === "clear") await call("fileops/history/clear").catch(() => {});
}
