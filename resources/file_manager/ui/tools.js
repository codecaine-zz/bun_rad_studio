// "Convert & process": turn the selected files into something else. The window asks "What do you want to turn these
// into?", shows only what applies, collects the options, previews the new files, and shows progress in the tasks tray.
// It also helps install the helper programs some conversions use.
import { call, ApiError, isPhononSupported } from "./api.js";
import { $, announce, debounce, h } from "./dom.js";
import { openDialog } from "./dialogs.js";
import { toast } from "./menus.js";
import { goTo, refresh } from "./nav.js";
import { currentPath, inTrash, isFolderView } from "./pane.js";
import { selectKeys, selectedEntries } from "./selection.js";
import { emit, on } from "./state.js";
import { startSetup } from "./toolsetup.js";
import { terminalAvailable, typeInTerminal } from "./terminal.js";
import { formatSize, plural } from "./util.js";
import { renderChooser } from "./convert.js";
import { extensionsOf } from "./convertdata.js";
import { buildDestination, buildOptions, optionsIntro, renderPreview } from "./convertopts.js";
import { openPower } from "./power.js";

const MANAGER_NAMES = { brew: "Homebrew", winget: "winget", scoop: "Scoop", choco: "Chocolatey", apt: "apt", dnf: "dnf", pacman: "pacman" };

// ---------------------------------------------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------------------------------------------

function selectedItems() {
  return selectedEntries().map((e) => ({ name: e.name, isDir: !!e.isDir, path: e.path }));
}

async function copyText(text) {
  try {
    await call("copytext", { text });
    toast("Copied. Paste it where you need it.", { kind: "info" });
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't copy that.", { kind: "error" });
  }
}

function commandBlock(command) {
  return h("code", { class: "tool-command" }, command);
}

/** Buttons that help someone run a command themselves. */
function commandButtons(command, close) {
  if (!command) return null;
  return h("div", { class: "tool-row-buttons" },
    h("button", { type: "button", class: "btn", onclick: () => copyText(command) }, "Copy the command"),
    terminalAvailable() ? h("button", { type: "button", class: "btn", onclick: () => {
      close();
      if (typeInTerminal(command)) toast("The command is typed in the Terminal. Press Enter there to run it.", { kind: "info" });
    } }, "Type it in the Terminal") : null);
}

function downloadButton(tool, manager = false) {
  const url = manager ? tool.plan.missingManager.url : tool.website;
  return h("button", { type: "button", class: "btn", title: url, onclick: async () => {
    try { await call("tools/website", { tool: tool.id, manager }); }
    catch (err) { toast(err instanceof ApiError ? err.message : "Couldn't open your browser.", { kind: "error" }); }
  } }, manager ? `Open ${tool.plan.missingManager.name} download page` : `Download ${tool.name}`);
}

function toolBlock(tool, close, startInstall) {
  const plan = tool.plan;
  const head = h("div", { class: "tool-head" },
    h("strong", {}, tool.name),
    h("span", { class: tool.installed ? "tool-ok" : "tool-missing" }, tool.installed ? `✔ Installed${tool.version ? ` (${tool.version})` : ""}` : "✖ Not installed"),
  );
  const body = [h("p", { class: "hint" }, tool.what)];
  if (tool.installed) {
    body.push(h("p", { class: "hint tool-path" }, tool.path));
  } else if (plan.auto) {
    body.push(
      h("p", { class: "hint" }, plan.note),
      commandBlock(plan.display),
      h("div", { class: "tool-row-buttons" }, h("button", { type: "button", class: "btn primary", onclick: () => startInstall([tool.id]) }, `Install ${tool.name} with ${MANAGER_NAMES[plan.method] ?? plan.method}`)),
    );
  } else if (tool.id === "ollama") {
    body.push(
      h("p", { class: "hint" }, "Downloads and installs Ollama + Gradium Phonon automatically into your user folder (no administrator password required), or use the terminal command below:"),
      commandBlock(plan.display),
      h("div", { class: "tool-row-buttons" },
        h("button", { type: "button", class: "btn primary", title: "Download and install Ollama + Phonon automatically", onclick: () => startInstall(["ollama"]) }, "⚡ Install Ollama & Phonon (1-Click)"),
      ),
      commandButtons(plan.display, close),
    );
  } else if (plan.missingManager) {
    const m = plan.missingManager;
    body.push(
      h("p", {}, `${m.name} isn't installed on this computer. ${m.name === "Homebrew" ? "It is a free tool that installs programs like this with one command." : ""}`),
      h("p", { class: "hint" }, `Step 1: install ${m.name} (${m.url}). Paste this:`),
      downloadButton(tool, true),
      commandBlock(m.command),
      commandButtons(m.command, close),
      h("p", { class: "hint" }, `${m.note} Step 2: come back here and press "Check again", then install ${tool.name}${plan.display ? ` (it runs: ${plan.display})` : ""}.`),
    );
  } else {
    body.push(h("p", { class: "hint" }, plan.note), commandBlock(plan.display), commandButtons(plan.display, close));
  }
  if (!tool.installed) body.push(downloadButton(tool), h("p", { class: "hint" }, tool.website));
  return h("section", { class: "tool-block" }, head, body);
}

/** The list of helper programs: the three main ones first, the rest (needed only for some conversions) after. */
function helperPrograms(data, close, install, recheck) {
  const visibleTools = data.tools.filter((t) => t.id !== "ollama" || isPhononSupported());
  const main = visibleTools.filter((t) => !t.optional);
  const more = visibleTools.filter((t) => t.optional);
  const missingAll = visibleTools.filter((t) => !t.installed);
  const parts = [
    h("p", { class: "hint" }, "These free programs do the work. They are installed once and then used by the File Manager. Nothing is installed unless you press its button."),
  ];
  if (missingAll.length) {
    parts.push(h("section", { class: "tool-setup", "data-copy": "off" },
      h("h3", { class: "tool-setup-title" }, "One-click setup"),
      h("p", { class: "hint" }, `${plural(missingAll.length, "helper program")} ${missingAll.length === 1 ? "is" : "are"} missing. Install them all in one go, or pick the ones you want. ${data.platform === "win32" ? "Windows uses winget when available; download buttons are also provided." : "If your computer has no installer yet, Homebrew is installed and set up for you first."}`),
      h("div", { class: "tool-row-buttons" },
        h("button", { type: "button", class: "btn primary", title: "Install every missing helper program with one click (you are asked to confirm first)", onclick: () => startSetup({ mode: "everything", startJob: install, closeOuter: close }) }, `Install everything missing (${missingAll.length})`),
        h("button", { type: "button", class: "btn", title: "See the list and untick anything you don't want", onclick: () => startSetup({ mode: "choose", startJob: install, closeOuter: close }) }, "Choose what to install…"))));
  }
  parts.push(h("h3", { class: "tools-heading" }, "The main helpers (pictures, video, sound and documents)"));
  parts.push(...main.map((t) => toolBlock(t, close, install)));
  parts.push(h("h3", { class: "tools-heading" }, "More helpers (only some conversions need them)"));
  parts.push(h("p", { class: "hint" }, "Many conversions need nothing at all (data files, text, zip). These add PDF work, scanned text, Office files, e-books, fonts and more archive types."));
  parts.push(...more.map((t) => toolBlock(t, close, install)));
  parts.push(h("div", { class: "tool-row-buttons" }, h("button", { type: "button", class: "btn", onclick: recheck }, "Check again")));
  return parts;
}

export async function showToolsDialog() {
  if (inTrash()) return toast("Open a folder first: files in the Recycle Bin can't be converted.", { kind: "info" });
  const entries = selectedItems();
  const paths = entries.map((e) => e.path);
  const box = h("div", { class: "tools-box" }, h("p", { class: "hint" }, "Looking for your helper programs…"));
  const dlg = openDialog({ title: "Convert & process", body: box, wide: true, buttons: [{ label: "Close", value: null }], describe: "Choose what to turn the selected files into, set the options, and start. You can also install the helper programs here." });
  const heading = dlg.el.querySelector(".dialog-title");
  const setTitle = (text) => { heading.textContent = text; };
  let data = null;

  async function startJob(op, body, failure) {
    try {
      const res = await call(op, body);
      dlg.close();
      trackJob(res.job);
    } catch (err) {
      dlg.setError(err instanceof ApiError ? err.message : failure);
    }
  }
  const install = (tools) => startJob("tools/install", { tools, confirm: true }, "The installation didn't start.");

  function showHelpers() {
    dlg.setError("");
    setTitle("Helper programs");
    const back = paths.length ? h("button", { type: "button", class: "btn", title: "Go back to the list of things you can make", onclick: showChooser }, "← Back to the list") : null;
    box.replaceChildren(...[back, ...helperPrograms(data, () => dlg.close(), install, load)].filter(Boolean));
    (back ?? box.querySelector("button, input, select"))?.focus();
  }

  function showChooser() {
    dlg.setError("");
    setTitle("Convert & process");
    if (!paths.length) {
      box.replaceChildren(
        h("p", {}, "Select some files or folders first, then open this window again to see what you can do with them. You can already set up the helper programs here."),
        ...helperPrograms(data, () => dlg.close(), install, load));
      return;
    }
    const view = renderChooser({ box, data, entries, pick: showOptions, install, showTools: showHelpers });
    if (!data.actions.length) box.append(h("p", { class: "hint" }, "Nothing can be made from these items. Try other files, or choose several of the same kind."));
    box.append(h("div", { class: "tool-row-buttons" },
      h("button", { type: "button", class: "btn", title: "Install or check the programs that do the work", onclick: showHelpers }, "Helper programs…"),
      ...(isPhononSupported() ? [h("button", { type: "button", class: "btn", title: "Open Ollama Text-to-Speech (Phonon Voice Reader) to read text out loud or export audiobooks", onclick: () => { dlg.close(); openPower("phonon", paths.length ? { paths } : undefined); } }, "🗣️ Ollama Text-to-Speech…")] : []),
    ));
    view.focus();
  }

  function showOptions(action) {
    dlg.setError("");
    setTitle(action.label);
    const exts = extensionsOf(entries);
    let seq = 0;
    const schedule = debounce(() => refreshPreview(), 250);
    const options = buildOptions(action, exts, schedule);
    const dest = buildDestination(schedule);
    const previewBox = h("div", { class: "cv-preview", "aria-live": "polite" });
    const label = action.mode === "all" ? "Make it" : action.count > 1 ? `Convert ${plural(action.count, "item")}` : "Convert";
    const go = h("button", { type: "button", class: "btn primary", disabled: true, title: "Make the new files now. The originals are not changed.", onclick: () => startJob("tools/run", request(), "That didn't start.") }, label);
    const back = h("button", { type: "button", class: "btn", title: "Go back and choose something else", onclick: showChooser }, "← Back to the list");
    function request() {
      const where = dest.read();
      return { action: action.id, paths, options: options.read(), outputDir: where.outputDir, pattern: where.pattern };
    }
    async function refreshPreview() {
      const mine = ++seq;
      go.disabled = true;
      renderPreview(previewBox, { state: "loading" });
      try {
        const data = await call("tools/preview", request());
        if (mine !== seq) return;
        renderPreview(previewBox, { state: "ready", data });
        go.disabled = !data.items.some((i) => !i.problem);
      } catch (err) {
        if (mine !== seq) return;
        renderPreview(previewBox, { state: "error", message: err instanceof ApiError ? err.message : "Couldn't check what will be made." });
      }
    }
    box.replaceChildren(...[
      back,
      h("p", { class: "cv-intro" }, optionsIntro(action, paths.length)),
      action.note ? h("p", { class: "hint" }, action.note) : null,
      options.count ? h("div", {}, h("h3", {}, "Options"), options.el) : null,
      dest.el,
      h("h3", {}, "What will be created"),
      previewBox,
      h("div", { class: "cv-actions" }, go),
    ].filter(Boolean));
    refreshPreview();
    (box.querySelector(".cv-options input, .cv-options select") ?? go).focus();
  }

  async function load() {
    dlg.setError("");
    box.replaceChildren(h("p", { class: "hint" }, "Looking for your helper programs…"));
    try {
      data = await call("tools/overview", { paths });
    } catch (err) {
      return box.replaceChildren(h("p", { role: "alert" }, err instanceof ApiError ? err.message : "Couldn't look for the helper programs."));
    }
    showChooser();
  }
  await load();
}

// ---------------------------------------------------------------------------------------------------------------
// The tasks tray
// ---------------------------------------------------------------------------------------------------------------

const cards = new Map();
const dismissed = new Set();
const lastState = new Map();
let timer = 0;

const isActive = (job) => job.state === "running" || job.state === "waiting";

const FILE_OPS = ["copy", "move", "rename", "delete", "mixed"];
export const isFileOp = (job) => FILE_OPS.includes(job.kind);

/** Items that did not run because of Cancel, and items that were stopped part-way. */
const unfinished = (job) => job.steps.filter((s) => s.state === "skipped" && s.skipReason === "cancelled").length;

function fileOpProgress(job) {
  const p = job.progress;
  const items = `${job.done + job.failed + job.skipped} of ${plural(job.total, "item")}`;
  if (p.measuring) return "Measuring what to do…";
  if (p.bytesTotal !== null && job.kind !== "rename") return `${items}  ·  ${formatSize(p.bytesDone)} of ${formatSize(p.bytesTotal)}`;
  if (job.kind === "rename") return items;
  return `${items}  ·  ${formatSize(p.bytesDone)} so far (the total size can't be measured)`;
}

function fileOpStatus(job) {
  const verb = { copy: "copied", move: "moved", rename: "renamed", delete: "deleted" }[job.kind] ?? "done";
  const parts = [];
  if (job.done) parts.push(`${job.done} ${verb}`);
  if (job.skipped - unfinished(job) > 0) parts.push(`${job.skipped - unfinished(job)} left alone`);
  if (job.failed) parts.push(`${job.failed} failed`);
  if (unfinished(job)) parts.push(`${unfinished(job)} not finished`);
  const summary = parts.join(", ") || "nothing to do";
  if (job.state === "cancelled") return `Cancelled: ${summary}. Finished items stay ${verb}; the rest were not changed.`;
  if (job.state === "failed") return `${summary[0].toUpperCase()}${summary.slice(1)}. The items that failed are listed below.`;
  return `Done: ${summary}.`;
}

function statusText(job) {
  if (job.state === "waiting") return "Waiting for its turn…";
  if (isFileOp(job)) return job.state === "running" ? `${job.current ? `${job.current}  ·  ` : ""}${fileOpProgress(job)}` : fileOpStatus(job);
  if (job.state === "running") return `${job.current ? `${job.current}  ·  ` : ""}${job.done + job.failed} of ${job.total} done`;
  if (job.state === "cancelled") return `Cancelled. ${job.done} of ${job.total} were finished.`;
  if (job.state === "failed") return `${job.failed} of ${job.total} didn't work${job.done ? `; ${job.done} did` : ""}.`;
  if (job.kind === "graveyard") return "Done.";
  return job.kind === "install" ? "Installed." : `Done: ${plural(job.outputs.length, "new file")}.`;
}

function buildCard(job) {
  const card = h("div", { class: "task", role: "group", "aria-label": job.title },
    h("div", { class: "task-title" }),
    h("progress", { class: "task-progress", max: "1", value: "0" }),
    h("div", { class: "task-status" }),
    h("ul", { class: "task-problems" }),
    h("ul", { class: "task-notes" }),
    h("pre", { class: "task-log", hidden: true }),
    h("div", { class: "task-buttons" },
      h("button", { type: "button", class: "btn task-retry", title: "Run again only the items that did not finish", onclick: () => retry(card.__job) }, "Retry unfinished"),
      h("button", { type: "button", class: "btn task-cancel", onclick: () => call("jobs/cancel", { id: job.id }).then(poll).catch(() => {}) }, "Cancel"),
      h("button", { type: "button", class: "btn task-show", onclick: () => showResults(card.__job) }, "Show the new files"),
      h("button", { type: "button", class: "btn task-dismiss", onclick: () => { dismissed.add(job.id); card.remove(); cards.delete(job.id); } }, "Dismiss")));
  return card;
}

async function retry(job) {
  try {
    const { job: again } = await call("jobs/retry", { id: job.id });
    trackJob(again);
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "That could not be retried.", { kind: "error" });
  }
}

function updateCard(card, job) {
  card.__job = job;
  const active = isActive(job);
  card.dataset.state = job.state;
  card.querySelector(".task-title").textContent = job.title;
  const progress = card.querySelector(".task-progress");
  progress.hidden = !active;
  progress.setAttribute("aria-label", `Progress: ${job.title}`);
  if (isFileOp(job) && job.state === "running" && (job.progress.measuring || (job.progress.bytesTotal === null && job.kind !== "rename"))) {
    // The total can't be measured: an empty bar means "working", not "0%".
    progress.removeAttribute("value");
  } else if (isFileOp(job) && job.progress.bytesTotal) {
    progress.max = job.progress.bytesTotal;
    progress.value = job.progress.bytesDone;
  } else {
    progress.max = Math.max(1, job.total);
    progress.value = job.done + job.failed + (job.skipped || 0);
  }
  card.querySelector(".task-status").textContent = statusText(job);
  const problems = card.querySelector(".task-problems");
  const bad = job.steps.filter((s) => s.state === "failed" || (isFileOp(job) && s.skipReason === "cancelled" && s.item?.destination && s.message));
  problems.replaceChildren(...[...bad.slice(0, 4).map((s) => h("li", {}, isFileOp(job) ? `${s.item?.source ?? s.label}: ${s.message}` : `${s.label}: ${s.message}`)), ...(bad.length > 4 ? [h("li", {}, `…and ${bad.length - 4} more.`)] : [])]);
  // What a converter could not keep exactly (for example nested data that was flattened) is told after a step is done.
  const notes = [...new Set(job.steps.filter((s) => s.state === "done" && s.message).map((s) => s.message))];
  card.querySelector(".task-notes").replaceChildren(...notes.slice(0, 3).map((n) => h("li", {}, n)));
  const log = card.querySelector(".task-log");
  const showLog = (job.kind === "install" || job.kind === "graveyard") && !!job.log;
  log.hidden = !showLog;
  if (showLog) log.textContent = job.log;
  card.querySelector(".task-cancel").hidden = !active;
  const canRetry = !active && job.retryable && !job.retriedBy && job.steps.some((s) => s.state === "failed" || (s.state === "skipped" && s.skipReason === "cancelled"));
  card.querySelector(".task-retry").hidden = !canRetry;
  card.querySelector(".task-show").hidden = active || !job.outputs.length || job.kind !== "convert";
  card.querySelector(".task-dismiss").hidden = active;
}

async function showResults(job) {
  if (!job?.outputs.length) return;
  const folder = parentOfPath(job.outputs[0]);
  await goTo(folder, { select: job.outputs.filter((o) => parentOfPath(o) === folder) });
}

function parentOfPath(path) {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i <= 0 ? path : path.slice(0, i);
}

function finished(job) {
  announce(`${job.title}. ${statusText(job)}`);
  if (isFileOp(job)) {
    emit("fileop-done", job);
    return;
  }
  if (job.kind === "graveyard") {
    emit("grave-job-done", job);
    const why = job.steps.find((s) => s.state === "failed")?.message;
    toast(job.state === "done" ? `${job.title}: done.` : job.state === "cancelled" ? `${job.title}: cancelled. Nothing was lost.` : `${job.title}: ${job.failed} of ${job.total} didn't work. ${why ?? "See the task list."}`, { kind: job.state === "done" ? "success" : job.state === "cancelled" ? "info" : "error" });
    return;
  }
  if (job.kind === "install") {
    toast(job.state === "done" ? "Installed. Open Convert & process to use it." : job.state === "cancelled" ? "The installation was cancelled." : `The installation didn't work: ${job.steps.find((s) => s.state === "failed")?.message ?? "see the task list"}`, { kind: job.state === "done" ? "info" : "error" });
    return;
  }
  const here = isFolderView() ? currentPath() : null;
  const mine = here ? job.outputs.filter((o) => parentOfPath(o) === here) : [];
  if (mine.length) refresh().then(() => selectKeys(mine));
  if (job.state === "done") toast(`Done: ${plural(job.outputs.length, "new file")}.`, { kind: "info" });
  else if (job.state === "failed") toast(`${job.failed} of ${job.total} didn't work. See the task list for why.`, { kind: "error" });
}

function render(jobs) {
  const tray = $("#tasks");
  const now = Date.now();
  const visible = jobs.filter((j) => !dismissed.has(j.id) && (isActive(j) || (isFileOp(j) && j.state !== "done" && !j.retriedBy) || (j.finishedAt && now - j.finishedAt < 10 * 60 * 1000)));
  for (const job of visible) {
    let card = cards.get(job.id);
    if (!card) {
      card = buildCard(job);
      cards.set(job.id, card);
      tray.append(card);
    }
    updateCard(card, job);
  }
  for (const [id, card] of cards) if (!visible.some((j) => j.id === id)) { card.remove(); cards.delete(id); }
  tray.hidden = visible.length === 0;
  for (const job of jobs) {
    const before = lastState.get(job.id);
    lastState.set(job.id, job.state);
    if (before && isActive({ state: before }) && !isActive(job)) finished(job);
  }
}

async function poll() {
  clearTimeout(timer);
  let jobs = [];
  try {
    jobs = (await call("jobs/list")).jobs;
  } catch {
    return;
  }
  render(jobs);
  // Copies, moves and renames are usually quick: look again soon so the new items show up without a visible lag.
  if (jobs.some(isActive)) timer = setTimeout(poll, jobs.some((j) => isActive(j) && isFileOp(j)) ? 120 : 700);
}

/** Starts showing a job that was just started. */
export function trackJob(job) {
  lastState.set(job.id, "running");
  dismissed.delete(job.id);
  poll();
}

export function wireTools() {
  // A job may already be running (the page was reloaded); this also fills the tray.
  poll();
  // Other parts of the page (More info, for one) start a job themselves and announce it with emit("job-started", job).
  on("job-started", trackJob);
}
