// Duplicate files panel (part of "Disk & files"): groups of files with exactly the same content, found by size, then a
// quick fingerprint, then a full SHA-256. The search only reports. Cleaning up is a separate, previewed step: tick the
// copies to remove (one always stays), review the plan, and they go to the Recycle Bin, where they can be restored.
import { announce, h } from "./dom.js";
import { joinRoot, revealPath } from "./devActions.js";
import { reviewPlan } from "./planDialog.js";
import { btn, checkbox, createStatus, errorText, field, linkButton, num, runJob, seconds } from "./devCore.js";
import { formatSize, plural } from "./util.js";

const SIZES = [["1 KB or more", 1024], ["100 KB or more", 100 * 1024], ["1 MB or more", 1024 * 1024], ["Any size", 1]];

export function createDupes(env) {
  const status = createStatus();
  const out = h("div", { class: "dev-dupes" });
  const min = h("select", { id: "dev-dupes-min", title: "Ignore files smaller than this, so tiny files don't flood the list." }, SIZES.map(([label, v]) => h("option", { value: String(v) }, label)));
  const vendored = checkbox("dev-dupes-vendored", "Include node_modules, target, dist, build", "Also compare files inside these folders. They hold a lot of legitimate copies, so they are left out by default.", false);
  const run = btn("Find duplicates", "Look for files with identical content in this folder. Nothing is changed or deleted.", () => start(), { primary: true });
  const cancel = btn("Cancel", "Stop the search.", () => job?.cancel());
  cancel.hidden = true;
  let job = null;
  let seq = 0;

  /** The copies ticked for removal (full paths). At least one copy of every group is always kept. */
  const picked = new Set();
  let current = null;
  const pickedNote = h("span", { class: "pw-hint", role: "status" });
  const cleanBtn = btn("Move the selected copies to the Recycle Bin…", "Shows exactly what would be moved, and where to get it back, before anything changes.", () => cleanUp());
  const tickRest = btn("Tick all but the first copy of each group", "Keeps the first copy listed in every group and ticks the others. You can untick any of them.", () => {
    picked.clear();
    for (const g of current?.groups ?? []) for (const f of g.files.slice(1)) picked.add(joinRoot(current.root, f));
    paint();
  });
  const clearTicks = btn("Clear the ticks", "Untick every copy.", () => { picked.clear(); paint(); });
  const tools = h("div", { class: "pw-row dev-dupe-tools", hidden: true }, tickRest, clearTicks, cleanBtn, pickedNote);

  function paint() {
    for (const box of out.querySelectorAll("input[data-path]")) box.checked = picked.has(box.dataset.path);
    cleanBtn.disabled = picked.size === 0;
    pickedNote.textContent = picked.size ? `${plural(picked.size, "copy", "copies")} ticked` : "Nothing ticked";
  }

  function toggle(group, root, file, box) {
    const path = joinRoot(root, file);
    if (box.checked) {
      picked.add(path);
      if (group.files.every((f) => picked.has(joinRoot(root, f)))) {
        picked.delete(path);
        box.checked = false;
        announce("Keep at least one copy of each file.");
        status.set("Keep at least one copy of every file: that one was not ticked.", true);
      }
    } else picked.delete(path);
    paint();
  }

  async function cleanUp() {
    if (!picked.size) return;
    const outcome = await reviewPlan({ type: "delete", paths: [...picked], permanent: false }, { applyLabel: "Move to the Recycle Bin" });
    if (outcome.applied) {
      picked.clear();
      paint();
    }
  }

  function render(r) {
    const root = r.root;
    current = r;
    picked.clear();
    tools.hidden = !r.groups.length;
    out.replaceChildren(...r.groups.map((g, i) => h("section", { class: "dev-dupe-group", "aria-label": `Group ${i + 1}` },
      h("h4", {}, `${g.files.length} identical copies of ${formatSize(g.size)} — ${formatSize(g.wasted)} could be freed`),
      h("ul", { class: "dev-dupe-files" }, g.files.map((f) => {
        const box = h("input", { type: "checkbox", "data-path": joinRoot(root, f), "aria-label": `Remove the copy ${f}`, title: "Tick the copies you want to move to the Recycle Bin. One copy of each file always stays.", onchange: () => toggle(g, root, f, box) });
        return h("li", {}, box, " ", h("span", { class: "pw-mono" }, f), " ", linkButton("Show in file list", `Select ${f} in the file list.`, () => revealPath(joinRoot(root, f))));
      })))));
    if (!r.groups.length) out.append(h("p", { class: "pw-hint" }, "No duplicate files were found."));
    if (r.groupCount > r.groups.length) out.append(h("p", { class: "pw-hint" }, `Showing the ${r.groups.length} groups that would free the most space, of ${num(r.groupCount)}.`));
    paint();
  }

  async function start() {
    const root = env.getRoot();
    if (!root) return status.set("Choose a folder first.", true);
    const mine = ++seq;
    run.disabled = true;
    cancel.hidden = false;
    out.replaceChildren();
    status.set("Looking for duplicates…");
    try {
      job = runJob("dev/dupes/start", { root, minBytes: Number(min.value), vendored: vendored.querySelector("input").checked }, (p, ms) => mine === seq && status.set(p.phase === "listing" ? `Listing files… ${num(p.files ?? 0)} (${seconds(ms)})` : `Comparing… ${num(p.checked ?? 0)} of ${num(p.of ?? 0)} sizes (${seconds(ms)})`));
      const done = await job.promise;
      if (mine !== seq) return;
      const r = done.result;
      if (!r) return status.set("Cancelled.");
      render(r);
      status.set(`${plural(r.groupCount, "group")} of duplicates, ${formatSize(r.totalWasted)} could be freed (${seconds(r.elapsedMs)}).${r.stoppedBy ? ` Stopped at the limit for ${r.stoppedBy}.` : ""}`, false);
      announce(status.el.textContent);
    } catch (err) {
      if (mine === seq) status.set(errorText(err, "The search didn't work."), true);
    } finally {
      if (mine === seq) {
        run.disabled = false;
        cancel.hidden = true;
        job = null;
      }
    }
  }

  return {
    el: h("section", { class: "pw-card dev-dupes-card", "aria-label": "Duplicate files" }, h("h3", {}, "Duplicate files"),
      h("div", { class: "pw-row" }, field("Smallest file", min), vendored, run, cancel), status.el, tools, out),
    start,
    cancel: () => job?.cancel(),
  };
}
