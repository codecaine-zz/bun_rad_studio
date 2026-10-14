// "Convert & process": batch actions for the selected files (pictures, video, sound, documents) that use helper
// programs (ffmpeg, ImageMagick, pandoc), help installing those programs, and the tasks tray that shows progress.
import { call, ApiError } from "./api.js";
import { $, announce, h } from "./dom.js";
import { openDialog } from "./dialogs.js";
import { toast } from "./menus.js";
import { goTo, refresh } from "./nav.js";
import { selectKeys, selectedEntries } from "./selection.js";
import { inTrash, state } from "./state.js";
import { terminalAvailable, typeInTerminal } from "./terminal.js";
import { plural } from "./util.js";

const GROUP_ORDER = ["Pictures", "Video", "Sound", "Documents"];
const MANAGER_NAMES = { brew: "Homebrew", winget: "winget", scoop: "Scoop", choco: "Chocolatey", apt: "apt", dnf: "dnf", pacman: "pacman" };

// ---------------------------------------------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------------------------------------------

function selectedFilePaths() {
  return selectedEntries().filter((e) => !e.isDir).map((e) => e.path);
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
  return h("div", { class: "tool-row-buttons" },
    h("button", { type: "button", class: "btn", onclick: () => copyText(command) }, "Copy the command"),
    terminalAvailable() ? h("button", { type: "button", class: "btn", onclick: () => {
      close();
      if (typeInTerminal(command)) toast("The command is typed in the Terminal. Press Enter there to run it.", { kind: "info" });
    } }, "Type it in the Terminal") : null);
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
  } else if (plan.missingManager) {
    const m = plan.missingManager;
    body.push(
      h("p", {}, `${m.name} isn't installed on this computer. ${m.name === "Homebrew" ? "It is a free tool that installs programs like this with one command." : ""}`),
      h("p", { class: "hint" }, `Step 1: install ${m.name} (${m.url}). Paste this:`),
      commandBlock(m.command),
      commandButtons(m.command, close),
      h("p", { class: "hint" }, `${m.note} Step 2: come back here and press "Check again", then install ${tool.name}${plan.display ? ` (it runs: ${plan.display})` : ""}.`),
    );
  } else {
    body.push(h("p", { class: "hint" }, plan.note), commandBlock(plan.display), commandButtons(plan.display, close));
  }
  if (!tool.installed) body.push(h("p", { class: "hint" }, `Or download it from ${tool.website}`));
  return h("section", { class: "tool-block" }, head, body);
}

function actionsSection(data, run) {
  const sections = [];
  const total = data.selected;
  for (const group of GROUP_ORDER) {
    const list = data.actions.filter((a) => a.group === group);
    if (!list.length) continue;
    // Say why something can't be used once for the group, not on every button.
    const reasons = [...new Set(list.filter((a) => !a.available).map((a) => a.why))];
    const buttons = list.map((a) => h("button", {
      type: "button", class: "act-btn", disabled: !a.available, title: a.available ? a.hint : a.why,
      onclick: () => run(a),
    }, h("span", { class: "act-label" }, a.label), h("span", { class: "act-hint" }, a.available && a.count < total ? `${a.count} of ${total} files` : a.hint)));
    sections.push(h("section", { class: "act-group" },
      h("h3", {}, `${group} (${plural(list[0].count, "file")})`),
      reasons.map((r) => h("p", { class: "hint act-why" }, `Not available yet: ${r}`)),
      h("div", { class: "act-list" }, buttons)));
  }
  return sections;
}

export async function showToolsDialog() {
  if (inTrash()) return toast("Open a folder first: files in the Recycle Bin can't be converted.", { kind: "info" });
  const paths = selectedFilePaths();
  const box = h("div", { class: "tools-box" }, h("p", { class: "hint" }, "Looking for your helper programs…"));
  const dlg = openDialog({ title: "Convert & process", body: box, wide: true, buttons: [{ label: "Close", primary: true, value: null }], describe: "Choose what to do with the selected files, or install the programs that do it." });

  async function startJob(op, body, failure) {
    try {
      const res = await call(op, body);
      dlg.close();
      trackJob(res.job);
    } catch (err) {
      dlg.setError(err instanceof ApiError ? err.message : failure);
    }
  }
  const run = (a) => startJob("tools/run", { action: a.id, paths }, "That didn't start.");
  const install = (tools) => startJob("tools/install", { tools, confirm: true }, "The installation didn't start.");

  async function render() {
    dlg.setError("");
    let data;
    try {
      data = await call("tools/overview", { paths });
    } catch (err) {
      return box.replaceChildren(h("p", { role: "alert" }, err instanceof ApiError ? err.message : "Couldn't look for the helper programs."));
    }
    const missingAuto = data.tools.filter((t) => !t.installed && t.plan.auto);
    const parts = [];
    if (paths.length) {
      parts.push(h("p", {}, `${plural(data.selected, "file")} selected. Results are saved next to the originals as new files; the originals are never changed.`));
      const sections = actionsSection(data, run);
      parts.push(...(sections.length ? sections : [h("p", { class: "hint" }, "None of the selected files can be converted. Pictures, video, sound and documents can: for example JPG, PNG, MP4, MP3, DOCX or Markdown.")]));
    } else {
      parts.push(h("p", {}, "Select some pictures, videos, sound files or documents first, then open this window again to see what you can do with them. You can already set up the helper programs here."));
    }
    parts.push(h("h3", { class: "tools-heading" }, "Helper programs"));
    parts.push(h("p", { class: "hint" }, "These free programs do the work. They are installed once and then used by the File Manager."));
    if (missingAuto.length > 1) parts.push(h("div", { class: "tool-row-buttons" }, h("button", { type: "button", class: "btn primary", onclick: () => install(missingAuto.map((t) => t.id)) }, `Install all ${missingAuto.length} missing programs`)));
    parts.push(...data.tools.map((t) => toolBlock(t, () => dlg.close(), install)));
    parts.push(h("div", { class: "tool-row-buttons" }, h("button", { type: "button", class: "btn", onclick: () => { box.replaceChildren(h("p", { class: "hint" }, "Checking…")); render(); } }, "Check again")));
    box.replaceChildren(...parts);
  }
  await render();
}

// ---------------------------------------------------------------------------------------------------------------
// The tasks tray
// ---------------------------------------------------------------------------------------------------------------

const cards = new Map();
const dismissed = new Set();
const lastState = new Map();
let timer = 0;

const isActive = (job) => job.state === "running" || job.state === "waiting";

function statusText(job) {
  if (job.state === "waiting") return "Waiting for its turn…";
  if (job.state === "running") return `${job.current ? `${job.current}  ·  ` : ""}${job.done + job.failed} of ${job.total} done`;
  if (job.state === "cancelled") return `Cancelled. ${job.done} of ${job.total} were finished.`;
  if (job.state === "failed") return `${job.failed} of ${job.total} didn't work${job.done ? `; ${job.done} did` : ""}.`;
  return job.kind === "install" ? "Installed." : `Done: ${plural(job.outputs.length, "new file")}.`;
}

function buildCard(job) {
  const card = h("div", { class: "task", role: "group", "aria-label": job.title },
    h("div", { class: "task-title" }),
    h("progress", { class: "task-progress", max: "1", value: "0" }),
    h("div", { class: "task-status" }),
    h("ul", { class: "task-problems" }),
    h("pre", { class: "task-log", hidden: true }),
    h("div", { class: "task-buttons" },
      h("button", { type: "button", class: "btn task-cancel", onclick: () => call("jobs/cancel", { id: job.id }).then(poll).catch(() => {}) }, "Cancel"),
      h("button", { type: "button", class: "btn task-show", onclick: () => showResults(card.__job) }, "Show the new files"),
      h("button", { type: "button", class: "btn task-dismiss", onclick: () => { dismissed.add(job.id); card.remove(); cards.delete(job.id); } }, "Dismiss")));
  return card;
}

function updateCard(card, job) {
  card.__job = job;
  const active = isActive(job);
  card.dataset.state = job.state;
  card.querySelector(".task-title").textContent = job.title;
  const progress = card.querySelector(".task-progress");
  progress.hidden = !active;
  progress.max = Math.max(1, job.total);
  progress.value = job.done + job.failed;
  card.querySelector(".task-status").textContent = statusText(job);
  const problems = card.querySelector(".task-problems");
  const bad = job.steps.filter((s) => s.state === "failed");
  problems.replaceChildren(...[...bad.slice(0, 4).map((s) => h("li", {}, `${s.label}: ${s.message}`)), ...(bad.length > 4 ? [h("li", {}, `…and ${bad.length - 4} more.`)] : [])]);
  const log = card.querySelector(".task-log");
  const showLog = job.kind === "install" && !!job.log;
  log.hidden = !showLog;
  if (showLog) log.textContent = job.log;
  card.querySelector(".task-cancel").hidden = !active;
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
  if (job.kind === "install") {
    toast(job.state === "done" ? "Installed. Open Convert & process to use it." : job.state === "cancelled" ? "The installation was cancelled." : `The installation didn't work: ${job.steps.find((s) => s.state === "failed")?.message ?? "see the task list"}`, { kind: job.state === "done" ? "info" : "error" });
    return;
  }
  const here = state.location.kind === "folder" && !state.search ? state.location.path : null;
  const mine = here ? job.outputs.filter((o) => parentOfPath(o) === here) : [];
  if (mine.length) refresh().then(() => selectKeys(mine));
  if (job.state === "done") toast(`Done: ${plural(job.outputs.length, "new file")}.`, { kind: "info" });
  else if (job.state === "failed") toast(`${job.failed} of ${job.total} didn't work. See the task list for why.`, { kind: "error" });
}

function render(jobs) {
  const tray = $("#tasks");
  const now = Date.now();
  const visible = jobs.filter((j) => !dismissed.has(j.id) && (isActive(j) || (j.finishedAt && now - j.finishedAt < 10 * 60 * 1000)));
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
  if (jobs.some(isActive)) timer = setTimeout(poll, 700);
}

/** Starts showing a job that was just started. */
export function trackJob(job) {
  lastState.set(job.id, job.state);
  dismissed.delete(job.id);
  poll();
}

export function wireTools() {
  // A job may already be running (the page was reloaded); this also fills the tray.
  poll();
}
