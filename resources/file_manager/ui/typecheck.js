// "Is this file what its name says?" Marks files whose real content doesn't match their name (a program called
// invoice.pdf, a PNG called photo.jpg), explains it in plain words, and asks before opening the dangerous ones.
// The server does the looking (it reads the first few hundred bytes); this module only asks, remembers and shows.
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { $, debounce, h } from "./dom.js";
import { toast } from "./menus.js";
import { refresh, saveSettings, visibleEntries } from "./nav.js";
import { selectKeys, selectOnly } from "./selection.js";
import { inTrash, on, state } from "./state.js";
import { baseName } from "./util.js";

const MAX_CACHE = 5000;
/** Rows checked automatically in a folder; showing more of a big folder checks the rows that appear. */
const FIRST_ROWS = 300;
const BATCH = 100;
const PAGE = 500;

/** path -> { sig, check }. The signature makes a changed file be looked at again. */
const cache = new Map();
const inflight = new Set();
let generation = 0;
let scope = "";

export const typeWarningsOn = () => state.settings.typeWarnings !== false;

/** True when the page should send `confirmMismatch` by itself, because the person turned the warnings off. */
export const skipMismatchGuard = () => !typeWarningsOn();

const sigOf = (entry) => `${entry.size}|${entry.mtimeMs}`;

function remember(path, sig, check) {
  cache.delete(path);
  cache.set(path, { sig, check });
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}

function cached(entry) {
  const hit = cache.get(entry.path);
  return hit && hit.sig === sigOf(entry) ? hit : null;
}

const LEVELS = {
  danger: { icon: "⛔", word: "Danger", lead: "Danger" },
  warning: { icon: "⚠", word: "Warning", lead: "Warning" },
  notice: { icon: "ℹ️", word: "Note", lead: "Note" },
};

const level = (check) => LEVELS[check.severity] ?? LEVELS.notice;

const CONTENT_CODES = new Set(["PROGRAM_DISGUISED", "SCRIPT_DISGUISED"]);

function meaningOf(check) {
  if (check.severity === "danger") {
    return CONTENT_CODES.has(check.code)
      ? "A program or script can run on your computer and change or take things. Pretending to be a document or a picture is a common way to trick people into running one."
      : "A name like this is a common trick to make something that can run look like a harmless document or picture.";
  }
  if (check.severity === "warning") return "The file itself isn't a program, but programs that expect that kind of file may not open it, or may show an error.";
  return "It is a different format of the same sort of file, so most programs will still open it, though a few strict ones may not.";
}

function adviceOf(check) {
  if (check.severity === "danger") return "Don't open it unless you trust where it came from. If you weren't expecting it, move it to the Recycle Bin.";
  if (check.severity === "warning") return "If you know what it really is, rename it so it ends the right way. If you don't recognise it, check where it came from before you open it.";
  return check.suggestedName ? "You can rename it so its ending matches what it really is." : "Nothing needs to be done unless a program refuses to open it.";
}

// ---------------------------------------------------------------------------------------------------------------
// Asking the server, and remembering the answers
// ---------------------------------------------------------------------------------------------------------------

/** What is known about one file: a verdict or null. Asks the server when the list hasn't done so already. */
export async function verdictFor(path, entry = null) {
  if (!typeWarningsOn()) return null;
  const known = entry ?? visibleEntries().find((e) => e.path === path) ?? null;
  const hit = known ? cached(known) : null;
  if (hit) return hit.check;
  try {
    const res = await call("check/one", { path });
    if (known) remember(path, sigOf(known), res.check ?? null);
    return res.check ?? null;
  } catch {
    return null;
  }
}

/** The files on screen that still need a look. */
function wanted() {
  const limit = state.shown > PAGE ? state.shown : FIRST_ROWS;
  const byPath = new Map(visibleEntries().map((e) => [e.path, e]));
  const out = [];
  for (const row of [...document.querySelectorAll("#list .row")].slice(0, limit)) {
    const entry = byPath.get(row.dataset.key);
    if (entry && !entry.isDir && !cached(entry) && !inflight.has(entry.path)) out.push(entry);
  }
  return out;
}

async function checkPending() {
  if (typeof document === "undefined" || !typeWarningsOn() || inTrash()) return; // a timer left over from a torn-down page
  const mine = generation;
  const todo = wanted();
  for (let i = 0; i < todo.length && mine === generation; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    for (const e of batch) inflight.add(e.path);
    try {
      const res = await call("check/files", { paths: batch.map((e) => e.path) });
      const byPath = new Map(batch.map((e) => [e.path, e]));
      for (const r of res.results) {
        const entry = byPath.get(r.path);
        if (entry && !r.skipped) remember(entry.path, sigOf(entry), r.check ?? null);
      }
      decorate();
    } catch {
      // the badges are a nicety: say nothing, and try again at the next draw
    } finally {
      for (const e of batch) inflight.delete(e.path);
    }
  }
}

const schedule = debounce(checkPending, 250);

function noteScope() {
  const now = `${state.location.kind}:${state.location.path ?? ""}:${state.search?.query ?? ""}`;
  if (now !== scope) {
    scope = now;
    generation++;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The badge in the list
// ---------------------------------------------------------------------------------------------------------------

function makeBadge(entry, check) {
  const lv = level(check);
  const badge = h("button", {
    type: "button", class: `type-badge ${check.severity}`, dataset: { code: check.code },
    "aria-label": `${lv.lead}: this file is not what its name says. Press for details`,
    title: `${check.title}. ${check.detail} Press to read more.`,
    onclick: () => explainFile(entry.path, entry.name, check),
    ondblclick: (e) => e.stopPropagation(),
  }, h("span", { "aria-hidden": "true" }, lv.icon), " ", lv.word);
  badge.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  });
  return badge;
}

/** Puts a badge on every listed file that has a verdict, and removes the ones that no longer apply. */
function decorate() {
  const active = typeWarningsOn() && !inTrash();
  const byPath = active ? new Map(visibleEntries().map((e) => [e.path, e])) : null;
  for (const row of document.querySelectorAll("#list .row")) {
    const entry = byPath?.get(row.dataset.key);
    const check = entry && !entry.isDir ? (cached(entry)?.check ?? null) : null;
    const old = row.querySelector(".type-badge");
    if (!check) {
      if (old) {
        old.remove();
        row.classList.remove("has-verdict");
      }
      continue;
    }
    if (old && old.dataset.code === check.code && old.classList.contains(check.severity)) continue;
    old?.remove();
    row.classList.add("has-verdict");
    (row.querySelector(".c-name") ?? row).append(makeBadge(entry, check));
  }
}

/** Starts watching the file list: badges appear after every draw of it. */
export function wireTypeCheck() {
  const list = $("#list");
  if (!list) return;
  const changed = () => {
    noteScope();
    decorate();
    schedule();
  };
  new MutationObserver(changed).observe(list, { childList: true });
  on("settings", (change) => {
    if (!change || Object.keys(change).length === 0 || "typeWarnings" in change) changed();
  });
  changed();
}

// ---------------------------------------------------------------------------------------------------------------
// Explaining, and what can be done about it
// ---------------------------------------------------------------------------------------------------------------

async function renameTo(path, newName, oldName) {
  const res = await call("rename", { path, name: newName });
  await refresh({ keepSelection: false });
  selectKeys([res.to]);
  toast(`Renamed to "${newName}".`, {
    kind: "success",
    action: { label: "Undo", run: () => call("rename", { path: res.to, name: oldName }).then(() => refresh({ keepSelection: false })).catch((err) => toast(err instanceof ApiError ? err.message : "That couldn't be undone.", { kind: "error" })) },
  });
  return res;
}

/**
 * The buttons that go with a verdict. `onDone` runs after one of them did its work (to close a dialog);
 * `onError` shows a problem (a name that is taken) where the person is looking.
 */
function actionButtons(path, name, check, { details = true, onDone = () => {}, onError = (message) => toast(message, { kind: "error" }) } = {}) {
  const out = [];
  if (check.suggestedName && check.suggestedExtension && check.severity !== "danger") {
    out.push(h("button", {
      type: "button", class: "btn primary", title: "Gives the file the ending that matches what it really is. What is inside doesn't change, and nothing is overwritten.",
      onclick: async () => {
        try {
          await renameTo(path, check.suggestedName, name);
          onDone();
        } catch (err) {
          onError(err instanceof ApiError ? err.message : "That couldn't be renamed.");
        }
      },
    }, `Rename to .${check.suggestedExtension}`));
  }
  if (details) {
    out.push(h("button", {
      type: "button", class: "btn", title: "Opens the Details panel on the right, with this file selected",
      onclick: async () => {
        await saveSettings({ showInfoPanel: true }).catch(() => {});
        selectOnly(path);
        onDone();
      },
    }, "Show in Details"));
  }
  return out;
}

const explanation = (check) => [
  h("p", { class: "tc-detail" }, h("strong", {}, `${level(check).icon} ${level(check).word}: `), check.detail),
  h("p", {}, h("strong", {}, "What this means: "), meaningOf(check)),
  h("p", {}, h("strong", {}, "What to do: "), adviceOf(check)),
];

/** Verdicts that are about the name rather than about what the file holds. */
const NAME_NOTICES = new Set(["EMPTY_FILE", "TWO_ENDINGS"]);

/**
 * Right after a file is created or renamed: if its new name deserves a word (an empty .png, two endings, a name that
 * doesn't match what is inside), say so at once instead of waiting for someone to notice the badge.
 */
export async function announceVerdict(path) {
  if (!typeWarningsOn() || typeof document === "undefined") return;
  let check = null;
  try {
    check = (await call("check/one", { path })).check ?? null;
  } catch {
    return;
  }
  if (!check) return;
  const name = baseName(path, state.sep);
  const first = check.detail.split(/(?<=[.!?])\s/)[0];
  toast(`${check.title}: ${first}`, { kind: check.severity === "danger" ? "error" : "info", timeout: 12000, action: { label: "Details", run: () => explainFile(path, name, check) } });
}

/** The dialog that explains one verdict. */
export function explainFile(path, name, check) {
  let dialog = null;
  const actions = actionButtons(path, name, check, { onDone: () => dialog?.close("done"), onError: (message) => dialog?.setError(message) });
  dialog = openDialog({
    title: NAME_NOTICES.has(check.code) ? "Look at this file's name" : "This file isn't what its name says",
    body: h("div", { class: "tc-dialog" }, explanation(check), actions.length ? h("div", { class: "type-actions" }, actions) : null),
    buttons: [{ label: "Close", primary: check.severity === "danger" || actions.length === 0, value: "close" }],
    describe: check.title,
  });
  const close = dialog.el.querySelector(".dialog-buttons .btn");
  if (close) close.title = "Close this message and leave the file as it is";
  return dialog.result;
}

/**
 * A panel for the Details panel and Properties: nothing at first, and the verdict once the server has answered
 * (and only when there is one). `showDetails` adds "Show in Details" (not needed inside the Details panel itself).
 */
export function verdictBlock(path, name, { showDetails = false, onDone = () => {} } = {}) {
  const box = h("div", { class: "type-block-host", "aria-live": "polite" });
  verdictFor(path).then((check) => {
    if (!check) return;
    const actions = actionButtons(path, name, check, { details: showDetails, onDone, onError: (message) => toast(message, { kind: "error" }) });
    box.append(h("section", { class: `type-block ${check.severity}`, "aria-label": "File type" },
      h("h3", { class: "tc-heading" }, `${level(check).icon} File type: ${check.title}`),
      explanation(check),
      check.actual ? h("p", { class: "hint" }, `Its contents are ${check.actual.label}.`) : null,
      actions.length ? h("div", { class: "type-actions" }, actions) : null,
    ));
  });
  return box;
}

/** Asks whether to open a file that is dangerously not what its name says. Resolves true for "Open anyway". */
export function askOpenAnyway(path, err) {
  const check = err?.details?.check;
  return confirmBox({
    title: "This file isn't what its name says",
    message: check?.detail ?? `"${baseName(path, state.sep)}" isn't what its name says.`,
    details: ["Only open it if you trust where it came from. If you weren't expecting this file, choose Don't open."],
    confirmLabel: "Open anyway",
    cancelLabel: "Don't open",
    danger: true,
  });
}
