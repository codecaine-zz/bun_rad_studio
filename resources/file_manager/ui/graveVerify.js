// "Verify graveyard": compares the list of buried items with what is really in the graveyard folder and, if they
// disagree, offers a Repair that only fixes the list (it never deletes anything buried).
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { emit } from "./state.js";
import { plural } from "./util.js";

const say = (err) => (err instanceof ApiError ? err.message : "That didn't work.");

/** The problems found, as short plain sentences (each starts with a word, never only a color). */
export function problemLines(report) {
  const c = report.counts;
  const lines = [];
  if (report.damaged) lines.push("⚠ The record file is damaged and can't be read. Repair sets it aside (it is kept, not deleted) and starts a fresh list from the files that are there.");
  if (c.missing) lines.push(`⚠ ${plural(c.missing, "item")} on the list ${c.missing === 1 ? "has" : "have"} no files in the graveyard any more, so ${c.missing === 1 ? "it" : "they"} can't be restored.`);
  if (c.orphans) lines.push(`⚠ ${plural(c.orphans, "folder")} in the graveyard ${c.orphans === 1 ? "isn't" : "aren't"} on the list. Repair adds ${c.orphans === 1 ? "it" : "them"} back, with an unknown original place.`);
  if (c.staging) lines.push(`⚠ ${plural(c.staging, "unfinished copy", "unfinished copies")} left over from a copy that was interrupted. The originals are safe; Repair clears these.`);
  if (c.unsafe) lines.push(`⚠ ${plural(c.unsafe, "item")} ${c.unsafe === 1 ? "sits" : "sit"} in a place that isn't a normal folder, so ${c.unsafe === 1 ? "it was" : "they were"} left alone.`);
  if (c.invalid) lines.push(`⚠ ${plural(c.invalid, "entry", "entries")} on the list can't be used (damaged). Repair removes ${c.invalid === 1 ? "it" : "them"}.`);
  if (c.changed) lines.push(`⚠ ${plural(c.changed, "buried file")} ${c.changed === 1 ? "has" : "have"} changed since ${c.changed === 1 ? "it was" : "they were"} buried: ${report.changed.slice(0, 3).map((x) => x.name).join(", ")}${c.changed > 3 ? "…" : ""}. Repair can't fix this; restore the file and check it.`);
  return lines;
}

export function showVerify() {
  const deep = h("input", { type: "checkbox", title: "Also read every small buried file and compare it with the checksum taken when it was buried. Slower." });
  const result = h("div", { class: "grave-verify", role: "status", "aria-live": "polite" }, h("p", {}, "Checking…"));
  const run = h("button", { type: "button", class: "btn", title: "Check the list against the files again", onclick: () => check() }, "Check again");
  const repair = h("button", { type: "button", class: "btn primary", title: "Fix the list: remove entries whose files are gone, add back files that have no entry, clear unfinished copies. Nothing buried is deleted.", hidden: true, onclick: () => fix() }, "Repair…");
  openDialog({
    title: "Verify the graveyard",
    wide: true,
    body: [
      h("p", {}, "This compares the list of buried items with the files that are really in the graveyard folder. It doesn't change anything."),
      h("label", { class: "check", title: deep.title }, deep, h("span", {}, "Also check that buried files haven't changed (slower)")),
      result,
      h("div", { class: "pw-row" }, run, repair),
    ],
    buttons: [{ label: "Close", value: true, primary: true }],
  });
  let last = null;

  async function check() {
    result.replaceChildren(h("p", {}, "Checking…"));
    repair.hidden = true;
    try {
      const { report } = await call("grave/verify", { deep: deep.checked });
      last = report;
      const lines = problemLines(report);
      if (report.ok) result.replaceChildren(h("p", {}, `✓ Everything matches: ${plural(report.checked, "buried item")} checked, and the list and the files agree.`));
      else {
        result.replaceChildren(h("p", {}, `${plural(lines.length, "problem")} found in ${plural(report.checked, "buried item")}:`), h("ul", { class: "detail-list" }, lines.map((l) => h("li", {}, l))));
        const fixable = report.damaged || report.counts.missing || report.counts.orphans || report.counts.staging || report.counts.invalid;
        repair.hidden = !fixable;
      }
    } catch (err) {
      result.replaceChildren(h("p", { role: "alert" }, say(err)));
    }
  }

  async function fix() {
    if (!last) return;
    const ok = await confirmBox({
      title: "Repair the list?",
      message: "This only fixes the list. Entries whose files are gone are removed, files without an entry are added back (their original place will be unknown), and unfinished copies are cleared. Nothing that is buried is deleted.",
      confirmLabel: "Repair",
    });
    if (!ok) return;
    try {
      const { report } = await call("grave/repair", { confirm: true });
      const parts = [report.droppedRecords && `${plural(report.droppedRecords, "entry", "entries")} removed`, report.adopted && `${plural(report.adopted, "item")} added back`, report.stagingCleared && `${plural(report.stagingCleared, "unfinished copy", "unfinished copies")} cleared`, report.damagedBackup && "the damaged record file was kept aside", report.leftAlone && `${plural(report.leftAlone, "folder")} left alone`].filter(Boolean);
      toast(parts.length ? `Repaired: ${parts.join(", ")}.` : "Nothing needed repairing.", { kind: "success" });
      emit("grave-changed");
    } catch (err) {
      toast(say(err), { kind: "error" });
    }
    await check();
  }

  check();
}
