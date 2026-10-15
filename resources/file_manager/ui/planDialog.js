// The shared "look before you change things" dialog. Any bulk or destructive operation asks the server for a plan
// (plan/preview), shows what would happen, and only a person's approval runs it (plan/apply) through the same task
// queue as copy and move. When it ends, a message says what was done and offers Undo where Undo is really possible.
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { announce, h } from "./dom.js";
import { toast } from "./menus.js";
import { busy, refresh, refreshTrashCount } from "./nav.js";
import { emit, on, state } from "./state.js";
import { formatSize, plural } from "./util.js";

const COUNT_LABELS = [
  ["copy", "Copy"], ["move", "Move"], ["rename", "Rename"], ["create", "Create folder"], ["replace", "Replace existing"],
  ["delete", "Move to the Recycle Bin"], ["permanentDelete", "Delete for good"], ["skip", "Skip (left alone)"],
];
const ACTION_WORDS = { copy: "Copy", move: "Move", rename: "Rename", create: "New folder", delete: "Delete", skip: "Skip" };
const RECOVERY_WORDS = { undo: "Undo", "recycle-bin": "Recycle Bin", backup: "Backup restore", quarantine: "Graveyard (quarantine)" };
const FILTERS = [["all", "Everything"], ["change", "Will change"], ["skip", "Skipped"], ["problem", "With a problem or warning"]];

/** plan id -> the plan, for jobs that came from a reviewed plan. */
const plansByJob = new Map();

const pathLine = (item) => {
  if (item.action === "delete") return item.source;
  if (item.action === "create") return item.destination;
  if (item.action === "skip") return item.source ?? item.destination ?? "";
  return `${item.source}  →  ${item.destination}`;
};

function itemRow(item, included, onToggle) {
  const blocked = item.issues.some((i) => i.level === "block");
  const label = item.action === "skip" ? "Skip" : item.replaces ? "Replace" : item.action === "delete" && item.permanent ? "Delete for good" : ACTION_WORDS[item.action];
  const check = item.action === "skip"
    ? h("span", { class: "plan-check-space" })
    : h("input", { type: "checkbox", checked: included, "aria-label": `Include ${pathLine(item)}`, title: "Untick to leave this one out", onchange: (e) => onToggle(e.target.checked) });
  return h("li", { class: `plan-item plan-${item.action}${item.replaces ? " plan-replace" : ""}${blocked ? " plan-blocked" : ""}`, "data-id": item.id },
    h("div", { class: "plan-line" },
      check,
      h("span", { class: "plan-badge" }, label),
      h("span", { class: "plan-path pw-mono", title: pathLine(item) }, item.action === "copy" || item.action === "move" || item.action === "rename"
        ? [item.source, h("br"), `→ ${item.destination}`] : pathLine(item)),
      item.bytes ? h("span", { class: "plan-size" }, formatSize(item.bytes)) : null),
    item.reason && item.action === "skip" ? h("p", { class: "plan-why" }, item.reason) : null,
    ...item.issues.filter((i) => i.message !== item.reason).map((i) => h("p", { class: `plan-why plan-${i.level}` }, `${i.level === "block" ? "⛔" : "⚠️"} ${i.message}`)));
}

/**
 * Previews an operation and asks for approval.
 * @param {object} request what to plan (see fmPlan.ts: transfer, rename, bulk-rename, delete, items)
 * @param {{ applyLabel?: string }} [options]
 * @returns {Promise<{ applied: boolean, plan?: any, job?: any }>}
 */
export async function reviewPlan(request, { applyLabel = "" } = {}) {
  let plan;
  try {
    // "existing": a plan another tool already asked the server for (Compare folders), shown here for approval.
    announce("Working out what would happen. Nothing is changed yet.");
    ({ plan } = await busy(() => (request.type === "existing" ? call("plan/get", { id: request.id }) : call("plan/preview", { request }))));
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "That couldn't be previewed.", { kind: "error" });
    return { applied: false };
  }
  const excluded = new Set();
  let filter = "all";
  const list = h("ul", { class: "plan-items", "aria-label": "Every change in this operation" });
  const filterSelect = h("select", { class: "select", "aria-label": "Which items to show", onchange: () => { filter = filterSelect.value; draw(); } },
    FILTERS.map(([v, l]) => h("option", { value: v }, l)));
  const approve = h("input", { type: "checkbox", id: "plan-approve", onchange: () => sync() });
  const permanent = h("input", { type: "checkbox", id: "plan-permanent", onchange: () => sync() });
  const live = () => plan.items.filter((i) => i.action !== "skip" && !excluded.has(i.id));
  const shown = () => plan.items.filter((i) => {
    if (filter === "change") return i.action !== "skip";
    if (filter === "skip") return i.action === "skip";
    if (filter === "problem") return i.issues.length > 0;
    return true;
  });
  const summary = h("dl", { class: "plan-summary" },
    COUNT_LABELS.filter(([k]) => plan.summary[k]).flatMap(([k, label]) => [h("dt", {}, `${label}:`), h("dd", { "data-count": k }, `${plan.summary[k]} ${plan.summary[k] === 1 ? "item" : "items"}`)]));
  const recovery = h("ul", { class: "plan-recovery", "aria-label": "How to get things back" },
    plan.recovery.map((r) => h("li", { class: r.available ? "yes" : "no" }, h("strong", {}, `${r.available ? "✓" : "✗"} ${RECOVERY_WORDS[r.kind]}: `), r.text)));
  const needsPermanent = plan.needsPermanentApproval;
  const body = [
    h("p", { class: "plan-title" }, plan.title),
    plan.canApply ? null : h("p", { class: "dialog-error", role: "alert" }, "Nothing in this preview can be done. See the skipped items below for why."),
    plan.warnings.length ? h("ul", { class: "plan-warnings", role: "alert" }, plan.warnings.map((w) => h("li", {}, `⚠️ ${w}`))) : null,
    summary,
    h("h3", { class: "plan-h" }, "If you change your mind"),
    recovery,
    h("div", { class: "plan-listhead" }, h("h3", { class: "plan-h" }, "Every change"), h("label", { class: "plan-filter" }, "Show ", filterSelect)),
    list,
    plan.itemsOmitted ? h("p", { class: "hint" }, `…and ${plural(plan.itemsOmitted, "more item")} not shown here. They follow the same rules.`) : null,
    plan.needsApproval ? h("label", { class: "check plan-approve" }, approve, h("span", {}, "I have looked at these changes and I approve them.")) : null,
    needsPermanent ? h("label", { class: "check plan-approve" }, permanent, h("span", {}, "I understand that items deleted for good cannot be brought back.")) : null,
  ];
  const danger = plan.needsApproval;
  const dlg = openDialog({
    title: "Review before anything changes",
    wide: true,
    describe: "Shows every change this operation would make. Nothing happens until you approve it.",
    body,
    buttons: [{ label: "Cancel", value: null }, { label: applyLabel || (danger ? "Approve and apply" : "Apply"), value: "apply", primary: true, danger: needsPermanent, disabled: true }],
    initialFocus: plan.canApply && !plan.needsApproval ? undefined : filterSelect,
  });
  const applyButton = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));

  function sync() {
    const count = live().length;
    const ok = count > 0 && (!plan.needsApproval || approve.checked) && (!needsPermanent || permanent.checked);
    applyButton.disabled = !ok;
    applyButton.textContent = (applyLabel || (danger ? "Approve and apply" : "Apply")) + (count ? ` (${plural(count, "item")})` : "");
  }
  function draw() {
    const rows = shown();
    list.replaceChildren(...(rows.length ? rows.map((item) => itemRow(item, !excluded.has(item.id), (on) => { on ? excluded.delete(item.id) : excluded.add(item.id); sync(); }))
      : [h("li", { class: "hint" }, "Nothing to show with this filter.")]));
  }
  draw();
  sync();

  const outcome = await new Promise((resolve) => {
    applyButton.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      applyButton.disabled = true;
      try {
        const res = await call("plan/apply", { id: plan.id, approved: plan.needsApproval ? approve.checked : undefined, confirmPermanent: needsPermanent ? permanent.checked : undefined, exclude: [...excluded] });
        dlg.close("applied");
        resolve(res);
      } catch (err) {
        dlg.setError(err instanceof ApiError ? err.message : "That couldn't be started. Nothing was changed.");
        sync();
      }
    }, true);
    dlg.result.then((v) => v !== "applied" && resolve(null));
  });
  if (!outcome) {
    call("plan/discard", { id: plan.id }).catch(() => {});
    return { applied: false };
  }
  state.planJobs.add(outcome.job.id);
  plansByJob.set(outcome.job.id, outcome.plan);
  emit("job-started", outcome.job);
  announce(`${plural(live().length, "item")} started. Progress is in the task list.`);
  return { applied: true, plan: outcome.plan, job: outcome.job };
}

const SAYS = { copy: "Copied", move: "Moved", rename: "Renamed", delete: "Deleted", mixed: "Done" };

async function undoPlan(id) {
  const res = await call("plan/undo", { id });
  const bad = res.results.filter((r) => !r.ok);
  await refresh({ keepSelection: false });
  await refreshTrashCount();
  if (bad.length) throw new Error(`${plural(bad.length, "item")} could not be undone. ${bad[0].message}`);
  return res;
}

async function onPlanJobDone(job) {
  const plan = plansByJob.get(job.id);
  if (!plan) return;
  const problems = job.failed + job.steps.filter((s) => s.skipReason === "cancelled").length;
  const left = job.steps.filter((s) => s.state === "skipped" && s.skipReason === "policy").length;
  const worked = job.done;
  const text = job.state === "cancelled"
    ? `Cancelled: ${plural(worked, "item")} done, ${plural(job.total - worked, "item")} not done. Done items stay as they are.`
    : `${SAYS[job.kind] ?? "Done"} ${plural(worked, "item")}${left ? `, ${left} left alone` : ""}${problems ? `. ${plural(problems, "item")} did not finish: see the task list for why` : ""}.`;
  const permanentOnly = plan.items.length > 0 && plan.items.every((i) => i.action === "skip" || (i.action === "delete" && i.permanent));
  if (worked && !permanentOnly) {
    const entry = { label: plan.title, run: () => undoPlan(plan.id) };
    state.undoStack.push(entry);
    emit("undo");
    toast(text, {
      kind: problems ? "info" : "success",
      action: { label: "Undo", run: async () => {
        const at = state.undoStack.indexOf(entry);
        if (at >= 0) state.undoStack.splice(at, 1);
        emit("undo");
        try {
          await entry.run();
          toast(`Undone: ${plan.title}`, { kind: "success" });
        } catch (err) {
          toast(`Couldn't undo everything: ${err instanceof Error ? err.message : "something went wrong"}`, { kind: "error" });
        }
      } },
    });
  } else {
    toast(text + (worked ? " This can't be undone." : ""), { kind: problems ? "error" : "info" });
  }
  await refresh({ keepSelection: false });
  await refreshTrashCount();
}

on("fileop-done", (job) => { onPlanJobDone(job).catch(() => {}); });
