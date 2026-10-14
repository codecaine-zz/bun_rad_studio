// The Permissions section of the Properties window: a grid of boxes, the same permissions as numbers and letters,
// presets, "everything inside", a preview of what would change, Apply, and Undo. Everything here only asks the
// server (perms/get, perms/plan, perms/apply); the server decides what is allowed and what needs confirming.
import { ApiError, call } from "./api.js";
import { confirmBox } from "./dialogs.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { busy, refresh } from "./nav.js";
import {
  CLASSES, PERMISSIONS, PRESETS, SETGID, SETUID, STICKY,
  bitName, bitsChange, commonMode, octalOf, parseOctal, presetAfter, presetChange, statesOf, statesSymbolic,
} from "./permsModel.js";
import { emit, on, state } from "./state.js";
import { baseName, plural } from "./util.js";

const FLAG_TEXT = {
  locked: { label: "Locked", line: "Locked (can't be changed or deleted)", tip: "A locked item can't be changed, renamed or deleted until you unlock it. Only macOS has this." },
  hidden: { label: "Hidden", line: "Hidden (not shown unless you ask for hidden items)", tip: "A hidden item isn't shown in the file manager unless you ask to see hidden items." },
  readonly: { label: "Read-only", line: "Read-only (can be read but not changed)", tip: "A read-only file can be read but not changed until you turn this off." },
};

const SCOPES = [
  ["all", "Files and folders"],
  ["files", "Only files"],
  ["dirs", "Only folders"],
];

function runName() {
  return `perm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** "1 item will change" / "3 items will change", "1 is" / "3 are": the sentence of the preview. */
export function previewSentence(counts) {
  const parts = [`${plural(counts.willChange, "item")} will change`];
  if (counts.alreadyCorrect) parts.push(`${counts.alreadyCorrect} ${counts.alreadyCorrect === 1 ? "is" : "are"} already correct`);
  if (counts.cannotChange) parts.push(`${counts.cannotChange} can't be changed`);
  if (counts.skipped) parts.push(`${counts.skipped} ${counts.skipped === 1 ? "is" : "are"} left out`);
  return `${parts.join(", ")}.`;
}

/**
 * Builds the section for `paths`. Returns the element, a promise that resolves when the current permissions have been
 * read, and a function that moves the keyboard focus to the first box.
 */
export function permissionsSection(paths) {
  const S = {
    items: [],
    support: null,
    editable: [],
    initial: {},
    desired: {},
    preset: null,
    recursive: { on: false, scope: "all", xOnly: true },
    flagInitial: {},
    flagDesired: {},
    plan: null,
    planKey: "",
    planning: 0,
    working: false,
    undoEntry: null,
    after: null,
  };
  const box = h("div", { class: "perm-body" }, h("p", { class: "hint" }, "Reading permissions…"));
  const el = h("section", { class: "perm-section", "aria-label": "Permissions", "data-copy": "off", "data-copy-skip": "" }, h("h3", { class: "perm-heading" }, "Permissions"), box);
  /** Every box that is drawn, by bit or flag name, so the states can be shown again after a change. */
  const bitBoxes = new Map();
  const flagBoxes = new Map();
  let octalInput = null;
  let symbolic = null;
  let previewBox = null;
  let applyButton = null;
  let undoButton = null;
  let cancelButton = null;
  let statusBox = null;
  let recursiveBox = null;
  let xOnlyBox = null;
  let scopeSelect = null;
  let presetButtons = [];
  let resetButton = null;
  let currentRun = "";

  const hasDirs = () => S.editable.some((i) => i.isDir);
  const posix = () => !!S.support?.mode;

  const runLabel = () => (hasDirs() ? "Run / open folder" : "Run");

  // ---- the request that the boxes stand for -------------------------------------------------------------------

  function flagChange() {
    const out = {};
    for (const key of Object.keys(S.flagDesired)) {
      const d = S.flagDesired[key];
      if (d !== "mixed" && d !== S.flagInitial[key]) out[key] = d === "on";
    }
    return out;
  }

  /** What to send, or null when nothing has been changed yet. */
  function request() {
    if (!S.editable.length) return null;
    const change = {};
    let targets = S.editable;
    if (posix()) {
      if (S.preset) {
        Object.assign(change, presetChange(S.preset));
        if (S.preset.filesOnly && !S.recursive.on) targets = S.editable.filter((i) => !i.isDir);
      } else {
        Object.assign(change, bitsChange(S.initial, S.desired) ?? {});
      }
    }
    const flags = flagChange();
    if (Object.keys(flags).length) change.flags = flags;
    if (!Object.keys(change).length || !targets.length) return null;
    if (S.recursive.on && hasDirs()) {
      const filesOnly = S.preset?.filesOnly === true;
      change.recursive = { scope: filesOnly ? "files" : S.recursive.scope, xOnlyIfExecutable: S.recursive.xOnly && S.preset?.id !== "exec" };
    }
    return { paths: targets.map((i) => i.path), change };
  }

  // ---- showing the state --------------------------------------------------------------------------------------

  function showBoxes() {
    for (const [bit, input] of bitBoxes) {
      const s = S.desired[bit];
      input.checked = s === "on";
      input.indeterminate = s === "mixed";
      input.setAttribute("aria-checked", s === "mixed" ? "mixed" : String(s === "on"));
    }
    for (const [key, input] of flagBoxes) {
      const s = S.flagDesired[key];
      input.checked = s === "on";
      input.indeterminate = s === "mixed";
      input.setAttribute("aria-checked", s === "mixed" ? "mixed" : String(s === "on"));
    }
    if (symbolic) symbolic.textContent = statesSymbolic(S.desired);
    if (octalInput && document.activeElement !== octalInput) showOctal();
    for (const b of presetButtons) b.button.setAttribute("aria-pressed", String(S.preset?.id === b.id));
    if (resetButton) resetButton.disabled = !request() && !S.preset;
  }

  function showOctal() {
    const mode = commonMode(S.desired);
    octalInput.value = mode === null ? "" : octalOf(mode);
    octalInput.placeholder = mode === null ? "mixed" : "";
    octalInput.removeAttribute("aria-invalid");
  }

  function changed() {
    showBoxes();
    schedulePreview();
  }

  // ---- the boxes ----------------------------------------------------------------------------------------------

  function nextState(bit) {
    const cur = S.desired[bit];
    if (cur === "mixed") return "on";
    if (cur === "on") return "off";
    return S.initial[bit] === "mixed" ? "mixed" : "on";
  }

  function bitBox(bit, title) {
    const input = h("input", { type: "checkbox", class: "perm-box", "aria-label": bitName(bit), title, dataset: { bit: String(bit) } });
    input.addEventListener("change", () => {
      S.preset = null;
      S.desired[bit] = nextState(bit);
      if (bit & 0o111 && S.desired[bit] === "on") S.recursive.xOnly = false;
      if (xOnlyBox) xOnlyBox.checked = S.recursive.xOnly;
      changed();
    });
    bitBoxes.set(bit, input);
    return input;
  }

  const PERMISSION_TIPS = {
    read: (who, dirs) => `Lets ${who} ${dirs ? "see what is inside" : "open and read"} it.`,
    write: (who, dirs) => `Lets ${who} ${dirs ? "add, rename and delete things inside" : "change"} it.`,
    run: (who, dirs) => `Lets ${who} ${dirs ? "open the folder (go into it)" : "run it as a program or script"}.`,
  };

  // Drawn with plain elements (not a <table>) so the Properties window's own "Copy" stays the only one; each box has its own label.
  function gridView() {
    const dirs = hasDirs();
    const head = [
      h("span", { class: "perm-corner", "aria-hidden": "true" }),
      ...PERMISSIONS.map((p) => h("span", { class: "perm-colhead", title: PERMISSION_TIPS[p.id]("someone", dirs) }, p.id === "run" ? runLabel() : p.label)),
    ];
    const rows = CLASSES.flatMap((c) => [
      h("span", { class: "perm-rowhead", title: `What ${c.who} may do.` }, c.label),
      ...PERMISSIONS.map((p) => h("span", { class: "perm-cell" }, bitBox(p.bit << c.shift, PERMISSION_TIPS[p.id](c.who, dirs)))),
    ]);
    return h("div", { class: "perm-grid", role: "group", "aria-label": "Who can read, write or run" }, head, rows);
  }

  function numbersView() {
    octalInput = h("input", {
      type: "text", class: "text-input perm-octal", inputmode: "numeric", maxlength: "4", autocomplete: "off", spellcheck: "false", size: "5",
      "aria-label": "Permissions as digits (octal)", title: "The same permissions as three or four digits, like 644. The digits stand for owner, group and others; 4 means read, 2 write and 1 run, added together.",
      "data-own-enter": "",
    });
    const note = h("span", { class: "perm-octal-note", role: "status" });
    octalInput.addEventListener("input", () => {
      const text = octalInput.value.trim();
      const mode = parseOctal(text);
      if (mode !== null) {
        S.preset = null;
        S.desired = statesOf([mode]);
        octalInput.removeAttribute("aria-invalid");
        note.textContent = "";
        changed();
      } else {
        const bad = text !== "" && (!/^[0-7]*$/.test(text) || text.length >= 3);
        if (bad) octalInput.setAttribute("aria-invalid", "true");
        else octalInput.removeAttribute("aria-invalid");
        note.textContent = bad ? "Use three or four digits from 0 to 7." : "";
      }
    });
    octalInput.addEventListener("blur", () => {
      note.textContent = "";
      showOctal();
    });
    octalInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        octalInput.blur();
        octalInput.focus();
      }
    });
    symbolic = h("code", { class: "perm-symbolic", title: "The same permissions as letters: r read, w write, x run, - none, ? differs between the chosen items." });
    return h("div", { class: "perm-numbers" },
      h("label", { class: "perm-field" }, h("span", { class: "field-label" }, "As digits"), octalInput),
      h("div", { class: "perm-field" }, h("span", { class: "field-label" }, "As letters"), symbolic),
      note);
  }

  function presetsView() {
    presetButtons = PRESETS.map((p) => {
      const button = h("button", { type: "button", class: "btn perm-preset", title: p.tip, "aria-pressed": "false", dataset: { preset: p.id } }, p.label);
      button.addEventListener("click", () => {
        S.preset = p;
        S.desired = statesOf(S.editable.map((i) => (p.filesOnly && i.isDir ? i.mode : presetAfter(p, i.mode, i.isDir))));
        if (p.id === "exec") S.recursive.xOnly = false;
        if (xOnlyBox) xOnlyBox.checked = S.recursive.xOnly;
        if (p.filesOnly && recursiveBox?.checked) {
          S.recursive.scope = "files";
          scopeSelect.value = "files";
        }
        changed();
      });
      return { id: p.id, button };
    });
    return h("div", { class: "perm-presets", role: "group", "aria-label": "Quick choices" }, presetButtons.map((b) => b.button));
  }

  function advancedView() {
    const row = (bit, label, tip, warn) => h("div", { class: "perm-adv-row" },
      h("label", { class: "check", title: tip }, bitBox(bit, tip), h("span", {}, label)),
      h("p", { class: "perm-warn" }, h("strong", {}, "Careful: "), warn));
    return h("details", { class: "perm-advanced" },
      h("summary", { title: "Rarely needed settings. Leave them alone unless you know what they do." }, "Advanced"),
      row(SETUID, "Run as the owner (setuid)", "A program with this runs with its owner's rights instead of yours.", "A program with this runs with the rights of the file's owner, whoever starts it. Setting it by mistake can be a security risk, so you will be asked to confirm."),
      row(SETGID, hasDirs() ? "Run as the group / new items join this folder's group (setgid)" : "Run as the group (setgid)", "On a program: runs with the file's group's rights. On a folder: new files inside belong to the folder's group.", "On a program this runs it with the group's rights. On a folder it is harmless and handy for shared folders."),
      row(STICKY, "Only owners can delete inside (sticky)", "On a shared folder: people can only delete or rename their own files.", "Meant for shared folders that everyone can write to, like a drop box. It does nothing useful on a file."));
  }

  function flagsView() {
    const keys = Object.keys(S.flagDesired);
    const rows = keys.map((key) => {
      const input = h("input", { type: "checkbox", class: "perm-box", "aria-label": FLAG_TEXT[key].label, title: FLAG_TEXT[key].tip, dataset: { flag: key } });
      input.addEventListener("change", () => {
        const cur = S.flagDesired[key];
        S.flagDesired[key] = cur === "mixed" ? "on" : cur === "on" ? "off" : S.flagInitial[key] === "mixed" ? "mixed" : "on";
        changed();
      });
      flagBoxes.set(key, input);
      return h("label", { class: "check", title: FLAG_TEXT[key].tip }, input, h("span", {}, FLAG_TEXT[key].line));
    });
    const note = S.support.platform === "linux"
      ? h("p", { class: "hint" }, "On Linux an item is hidden when its name starts with a dot. Rename it to hide or show it.")
      : null;
    return h("div", { class: "perm-flags" }, rows, note);
  }

  function recursiveView() {
    recursiveBox = h("input", { type: "checkbox", "aria-label": "Apply to everything inside", title: "Also change every file and folder inside the chosen folders, however deep. Links are never followed or changed.", dataset: { recursive: "on" } });
    scopeSelect = h("select", { class: "select perm-scope", "aria-label": "What to change inside", title: "Choose which items inside the folder are changed.", disabled: true },
      SCOPES.map(([v, l]) => h("option", { value: v }, l)));
    xOnlyBox = h("input", { type: "checkbox", checked: true, disabled: true, "aria-label": "Add Run only to folders and files that already run", title: "Recommended. Plain files that don't run today stay that way; folders can always be opened.", dataset: { xonly: "on" } });
    recursiveBox.addEventListener("change", () => {
      S.recursive.on = recursiveBox.checked;
      scopeSelect.disabled = !S.recursive.on;
      xOnlyBox.disabled = !S.recursive.on;
      // "Make executable" and "Remove execute" only ever touch files, so the choice shows that.
      if (S.recursive.on && S.preset?.filesOnly) {
        S.recursive.scope = "files";
        scopeSelect.value = "files";
      }
      changed();
    });
    scopeSelect.addEventListener("change", () => {
      S.recursive.scope = scopeSelect.value;
      changed();
    });
    xOnlyBox.addEventListener("change", () => {
      S.recursive.xOnly = xOnlyBox.checked;
      changed();
    });
    return h("div", { class: "perm-recursive" },
      h("label", { class: "check", title: recursiveBox.title }, recursiveBox, h("span", {}, "Apply to everything inside")),
      h("div", { class: "perm-recursive-options" },
        h("label", { class: "perm-field" }, h("span", { class: "field-label" }, "Change"), scopeSelect),
        h("label", { class: "check", title: xOnlyBox.title }, xOnlyBox, h("span", {}, "Add \"Run\" only to folders and files that already run (recommended)"))),
      h("p", { class: "hint" }, "The folder itself changes only when \"Files and folders\" or \"Only folders\" is chosen."));
  }

  // ---- preview, apply, undo -----------------------------------------------------------------------------------

  let previewTimer = 0;
  function schedulePreview() {
    clearTimeout(previewTimer);
    S.plan = null;
    S.planKey = "";
    if (applyButton) applyButton.disabled = true;
    if (!request()) {
      const needsInside = S.preset?.filesOnly && !S.recursive.on && S.editable.length > 0;
      previewBox?.replaceChildren(h("p", { class: "hint" }, needsInside ? "This choice changes files only. Tick \"Apply to everything inside\" to change the files in this folder." : "Change a box or pick a quick choice to see what would happen."));
      return;
    }
    previewBox?.replaceChildren(h("p", { class: "hint" }, "Checking…"));
    previewTimer = setTimeout(() => typeof document !== "undefined" && runPreview(), 250);
  }

  /** Follows a long run: shows how far it is and lets the person stop it. */
  function follow(run, what) {
    let alive = true;
    cancelButton.hidden = false;
    const tick = async () => {
      if (!alive || typeof document === "undefined") return;
      try {
        const p = await call("perms/progress", { runId: run });
        if (alive && p.found && p.state === "running") statusBox.textContent = `${what} ${plural(p.done, "item")}…`;
      } catch {
        // progress is only a nicety
      }
      if (alive) setTimeout(tick, 350);
    };
    setTimeout(tick, 350);
    return () => {
      alive = false;
      cancelButton.hidden = true;
      statusBox.textContent = "";
    };
  }

  function problemList(problems, count) {
    if (!problems?.length) return null;
    return h("ul", { class: "perm-problems" },
      problems.slice(0, 6).map((p) => h("li", {}, h("strong", {}, baseName(p.path, state.sep) || p.path), `: ${p.reason}`)),
      count > 6 ? h("li", {}, `…and ${count - 6} more`) : null);
  }

  function examplesView(plan) {
    const rows = plan.examples.filter((e) => e.state === "change").slice(0, 20);
    if (!rows.length) return null;
    return h("details", { class: "perm-examples" },
      h("summary", { title: "Lists some of the items that would change, with their permissions now and after." }, "Show what changes"),
      h("ul", { class: "perm-example-list" }, rows.map((e) => h("li", {},
        h("strong", {}, baseName(e.path, state.sep) || e.path),
        `: ${changeText(e, false) || "no change"} → ${changeText(e, true) || "no change"}`))),
      plan.counts.willChange > rows.length ? h("p", { class: "hint" }, `…and ${plan.counts.willChange - rows.length} more`) : null);
  }

  /** What one example row shows in its "Now" or "Becomes" column: the mode if it changes, and the changed settings. */
  function changeText(e, becomes) {
    const parts = [];
    if (e.before && e.before !== e.after) parts.push(becomes ? `${e.after} ${e.afterText}` : `${e.before} ${e.beforeText}`);
    parts.push(...Object.entries(e.flags).map(([k, v]) => `${FLAG_TEXT[k].label}: ${(becomes ? v : !v) ? "yes" : "no"}`));
    return parts.join(", ");
  }

  async function runPreview() {
    const req = request();
    if (!req) return;
    const key = JSON.stringify(req);
    const mine = ++S.planning;
    const run = req.change.recursive ? runName() : "";
    currentRun = run;
    const stop = run ? follow(run, "Checking") : () => {};
    try {
      const { plan } = await call("perms/plan", { ...req, ...(run ? { runId: run } : {}) });
      if (mine !== S.planning) return;
      S.plan = plan;
      S.planKey = key;
      const notes = [];
      if (plan.skippedBecause.length) notes.push(h("p", { class: "hint" }, `Left out: ${plan.skippedBecause.map((s) => `${plural(s.count, "item")} (${s.reason})`).join(", ")}.`));
      if (plan.risks.length) notes.push(h("p", { class: "perm-warn" }, h("strong", {}, "Careful: "), `${plan.risks.map((r) => r.message).join(" ")} You will be asked to confirm.`));
      previewBox.replaceChildren(...[h("p", { class: "perm-sentence" }, previewSentence(plan.counts)), ...notes, problemList(plan.problems, plan.problemCount), examplesView(plan)].filter((part) => part !== null));
      applyButton.disabled = plan.counts.willChange === 0 || S.working;
    } catch (err) {
      if (mine !== S.planning) return;
      previewBox.replaceChildren(h("p", { class: "perm-error", role: "alert" }, err instanceof ApiError ? err.message : "Couldn't check that."));
    } finally {
      stop();
    }
  }

  async function ask(risks, counts) {
    return await confirmBox({
      title: "Are you sure?",
      message: `${previewSentence(counts)} Please check this first:`,
      details: risks.map((r) => r.message),
      confirmLabel: "Change permissions",
      danger: true,
    });
  }

  async function applyNow() {
    const req = request();
    if (!req || !S.plan || S.planKey !== JSON.stringify(req) || S.working) return;
    let confirmed = false;
    if (S.plan.needsConfirm) {
      if (!(await ask(S.plan.risks, S.plan.counts))) return;
      confirmed = true;
    }
    S.working = true;
    applyButton.disabled = true;
    const run = req.change.recursive ? runName() : "";
    currentRun = run;
    const stop = run ? follow(run, "Changing") : () => {};
    let result = null;
    try {
      const body = { ...req, ...(run ? { runId: run } : {}) };
      try {
        result = (await busy(() => call("perms/apply", { ...body, confirmed }))).result;
      } catch (err) {
        if (err instanceof ApiError && err.code === "NEEDS_CONFIRM" && !confirmed) {
          if (!(await ask(err.details?.risks ?? [], err.details?.plan ?? S.plan.counts))) throw new ApiError("Nothing was changed.", "CANCELLED", 0);
          result = (await busy(() => call("perms/apply", { ...body, confirmed: true }))).result;
        } else throw err;
      }
    } catch (err) {
      statusBox.textContent = err instanceof ApiError ? err.message : "That didn't work.";
      S.working = false;
      stop();
      schedulePreview();
      return;
    }
    stop();
    S.working = false;
    finish(result);
  }

  function finish(result) {
    const n = result.counts.changed;
    const label = `permissions of ${plural(n, "item")}`;
    const bits = [n ? `Changed ${plural(n, "item")}.` : "Nothing was changed."];
    if (result.counts.failed) bits.push(`${plural(result.counts.failed, "item")} couldn't be changed.`);
    if (result.stopped) bits.push(result.stopped === "time" ? `It took too long and was stopped; ${plural(result.counts.notDone, "item")} weren't reached.` : `It was cancelled; ${plural(result.counts.notDone, "item")} weren't reached.`);
    statusBox.textContent = bits.join(" ");
    toast(bits.join(" "), { kind: result.counts.failed || result.stopped ? "info" : "success" });
    if (result.undo) {
      const id = result.undo.id;
      emit("undo-push", {
        label,
        run: async () => {
          const u = (await call("perms/undo", { undo: id })).result;
          if (u.skippedCount) toast(`${plural(u.skippedCount, "item")} had been changed again, so ${u.skippedCount === 1 ? "it was" : "they were"} left as ${u.skippedCount === 1 ? "it is" : "they are"}.`, { kind: "info" });
        },
      });
      const top = state.undoStack.at(-1);
      S.undoEntry = top?.label === label ? top : null;
      undoButton.hidden = !S.undoEntry;
    }
    S.after = problemList(result.problems, result.problemCount);
    refresh().catch(() => {});
    load(true);
  }

  // ---- reading the current state ------------------------------------------------------------------------------

  function build() {
    const blocked = S.items.filter((i) => !i.canChange);
    const parts = [];
    if (blocked.length) {
      parts.push(h("div", { class: "perm-blocked" },
        h("p", { class: "perm-warn" }, h("strong", {}, S.editable.length ? "Some can't be changed: " : "Can't be changed here: "), S.editable.length ? `${blocked.length} of the ${S.items.length} items.` : ""),
        h("ul", { class: "perm-problems" }, blocked.slice(0, 4).map((i) => h("li", {}, h("strong", {}, i.name), `: ${i.reason}`)), blocked.length > 4 ? h("li", {}, `…and ${blocked.length - 4} more`) : null)));
    }
    if (!S.editable.length) return parts;
    if (posix()) {
      parts.push(presetsView(), gridView(), numbersView(), ownerView(), advancedView());
    } else {
      parts.push(h("p", { class: "hint" }, "Windows decides who may open, change or run a file with access rules (ACLs). Those aren't edited here. You can turn the Read-only and Hidden settings on or off."));
    }
    if (Object.keys(S.flagDesired).length || S.support.platform === "linux") parts.push(flagsView());
    if (S.items.some((i) => i.acl)) parts.push(h("p", { class: "hint perm-acl" }, "This item also has extra access rules (ACL). They aren't shown or changed here."));
    if (hasDirs()) parts.push(recursiveView());
    previewBox = h("div", { class: "perm-preview", "aria-live": "polite" });
    statusBox = h("p", { class: "perm-status", role: "status" });
    applyButton = h("button", { type: "button", class: "btn primary perm-apply", disabled: true, title: "Make the change shown above. You can undo it afterwards." }, "Apply");
    undoButton = h("button", { type: "button", class: "btn perm-undo", hidden: true, title: "Put the permissions back the way they were before the last change." }, "Undo this change");
    cancelButton = h("button", { type: "button", class: "btn perm-cancel", hidden: true, title: "Stop now. Items already changed stay changed, and you can undo them." }, "Stop");
    resetButton = h("button", { type: "button", class: "btn perm-reset", disabled: true, title: "Forget what you changed here and show the current permissions again." }, "Reset");
    applyButton.addEventListener("click", applyNow);
    undoButton.addEventListener("click", () => emit("undo-last"));
    cancelButton.addEventListener("click", () => call("perms/cancel", { runId: currentRun || "" }).catch(() => {}));
    resetButton.addEventListener("click", () => load(false));
    parts.push(previewBox, h("div", { class: "perm-actions" }, applyButton, resetButton, cancelButton, undoButton), statusBox);
    return parts;
  }

  function ownerView() {
    const names = (key, fallback) => [...new Set(S.items.map((i) => i[key] ?? (i[fallback] === null || i[fallback] === undefined ? "" : `user ${i[fallback]}`)).filter(Boolean))];
    const owners = names("owner", "uid");
    const groups = names("group", "gid");
    const list = (a) => (a.length ? a.slice(0, 3).join(", ") + (a.length > 3 ? ` and ${a.length - 3} more` : "") : "unknown");
    return h("div", { class: "perm-owner" },
      h("p", {}, h("span", { class: "field-label" }, "Owner: "), list(owners), h("span", { class: "field-label" }, "   Group: "), list(groups)),
      h("p", { class: "hint" }, "Changing who owns something needs administrator rights, so it isn't done here."));
  }

  async function load(keepStatus) {
    let got;
    try {
      got = await call("perms/get", { paths });
    } catch (err) {
      box.replaceChildren(h("p", { class: "perm-error", role: "alert" }, err instanceof ApiError ? err.message : "Couldn't read the permissions."));
      return;
    }
    S.items = got.items;
    S.support = got.support;
    S.editable = got.items.filter((i) => i.canChange);
    S.preset = null;
    S.plan = null;
    S.planKey = "";
    bitBoxes.clear();
    flagBoxes.clear();
    S.initial = statesOf(S.editable.map((i) => i.mode ?? 0));
    S.desired = { ...S.initial };
    S.flagInitial = {};
    S.flagDesired = {};
    const supported = ["locked", "hidden", "readonly"].filter((k) => S.support[k]);
    for (const key of supported) {
      const values = S.editable.map((i) => i.flags?.[key]);
      const state1 = values.some((v) => v === undefined || v === null) ? "mixed" : values.every(Boolean) ? "on" : values.some(Boolean) ? "mixed" : "off";
      S.flagInitial[key] = state1;
      S.flagDesired[key] = state1;
    }
    const keepText = keepStatus && statusBox ? statusBox.textContent : "";
    const oldUndo = keepStatus && undoButton ? !undoButton.hidden : false;
    box.replaceChildren(...build());
    if (previewBox) previewBox.replaceChildren(S.after ?? h("p", { class: "hint" }, "Change a box or pick a quick choice to see what would happen."));
    S.after = null;
    if (keepText && statusBox) statusBox.textContent = keepText;
    if (oldUndo && undoButton) undoButton.hidden = false;
    showBoxes();
    updateUndoButton();
  }

  function updateUndoButton() {
    if (!undoButton) return;
    if (undoButton.hidden) return;
    undoButton.hidden = !S.undoEntry || state.undoStack.at(-1) !== S.undoEntry;
  }

  const off = on("undo", () => {
    if (!el.isConnected) return off();
    updateUndoButton();
  });
  // After Undo (from the toolbar or Ctrl+Z) the page refreshes the list; the boxes then show the restored permissions.
  const offView = on("view", () => {
    if (!el.isConnected) return offView();
    if (S.undoEntry && !state.undoStack.includes(S.undoEntry)) {
      S.undoEntry = null;
      load(false);
    }
  });

  const ready = load(false);
  return {
    el,
    ready,
    focusFirst() {
      const first = bitBoxes.values().next().value ?? flagBoxes.values().next().value;
      first?.focus();
    },
  };
}
