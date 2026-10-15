// The "Actions" tool: saved recipes that run the same steps on the files you choose. An action says what it accepts, what
// it does, where the results go and that your originals are never changed. Everything is checked before it runs, runs in
// the task queue, and a failure names the step and the files.
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { announce, h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo } from "./nav.js";
import { registerPowerTab } from "./power.js";
import { selectedEntries } from "./selection.js";
import { plural } from "./util.js";

const STEP_ICON = { waiting: "○", running: "⏳", done: "✓", failed: "✗", cancelled: "⏹" };
const POLL_MS = 400;

const explain = (err, fallback) => (err instanceof ApiError ? err.message : fallback);
const base = (path) => path.split(/[\\/]/).pop() || path;
const textArea = (value, label, rows = 2) => h("textarea", { class: "find-input proj-text", rows: String(rows), spellcheck: "false", "aria-label": label }, value);

/** The control for one setting (a fixed list, a number, a switch or plain text). */
function valueControl(opt, value, onchange) {
  if (opt.kind === "choice" && opt.choices) {
    const select = h("select", { class: "find-input", "aria-label": opt.label, onchange: () => onchange(select.value) }, opt.choices.map((c) => h("option", { value: c.value, selected: String(c.value) === String(value) }, c.label)));
    return select;
  }
  if (opt.kind === "toggle") return h("input", { type: "checkbox", checked: value === true, "aria-label": opt.label, onchange: (e) => onchange(e.target.checked) });
  const input = h("input", { type: opt.kind === "number" ? "number" : "text", class: "find-input", value: String(value ?? ""), min: opt.min, max: opt.max, "aria-label": opt.label,
    oninput: () => onchange(opt.kind === "number" ? Number(input.value) : input.value) });
  return input;
}

/** The setting a person fills in each time: the same kind as the step's own setting. */
const paramFor = (stepIndex, opt, value) => ({
  id: `s${stepIndex + 1}_${opt.id}`.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24),
  label: opt.label,
  kind: opt.kind === "choice" && opt.choices ? "choice" : opt.kind === "number" ? "number" : opt.kind === "toggle" ? "toggle" : "text",
  default: value,
  ...(opt.kind === "number" ? { min: opt.min ?? 0, max: opt.max ?? 100000 } : {}),
  ...(opt.kind === "choice" && opt.choices ? { choices: opt.choices } : {}),
});

async function editAction(existing, catalog) {
  const draft = structuredClone(existing ?? { name: "", description: "", input: { extensions: [], min: 1, max: 500 }, params: [], steps: [], output: { folder: "./output", conflict: "rename" }, revealOutput: true });
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const name = h("input", { type: "text", class: "find-input", value: draft.name, "aria-label": "Action name", spellcheck: "false" });
  const description = textArea(draft.description, "What it does", 2);
  const exts = h("input", { type: "text", class: "find-input", value: draft.input.extensions.join(", "), "aria-label": "File types it accepts", placeholder: "jpg, png (empty means any)", spellcheck: "false" });
  const folder = h("input", { type: "text", class: "find-input", value: draft.output.folder, "aria-label": "Output folder", title: "A folder like ./optimized (next to the first file) or a full path. No '..'.", spellcheck: "false" });
  const conflict = h("select", { class: "find-input", "aria-label": "If a name is already taken" },
    h("option", { value: "rename", selected: draft.output.conflict === "rename" }, "Keep both: add a number"),
    h("option", { value: "skip", selected: draft.output.conflict === "skip" }, "Leave that file alone"));
  const reveal = h("input", { type: "checkbox", checked: draft.revealOutput });
  const stepsBox = h("div", { class: "act-steps" });
  const add = h("select", { class: "find-input", "aria-label": "Add a step" }, h("option", { value: "" }, "Add a step…"), ...catalog.map((s) => h("option", { value: s.id }, `${s.group}: ${s.label}`)));

  function drawSteps() {
    stepsBox.replaceChildren(...draft.steps.map((step, i) => {
      if (step.type === "command") {
        return h("div", { class: "act-step disabled" }, h("strong", {}, `${i + 1}. ${step.label}`), h("p", { class: "pw-hint" }, "A custom command. These are not supported, so this step is disabled and the action can't run until you remove it."), h("button", { type: "button", class: "btn", onclick: () => { draft.steps.splice(i, 1); drawSteps(); } }, "Remove this step"));
      }
      const def = byId.get(step.action);
      const label = h("input", { type: "text", class: "find-input", value: step.label, "aria-label": `Name of step ${i + 1}`, oninput: (e) => { step.label = e.target.value; } });
      const opts = (def?.options ?? []).map((opt) => {
        const bound = step.options[opt.id] && typeof step.options[opt.id] === "object" ? step.options[opt.id].$param : null;
        const param = bound ? draft.params.find((p) => p.id === bound) : null;
        const current = param ? param.default : step.options[opt.id] ?? opt.default;
        const ask = h("input", { type: "checkbox", checked: !!bound, "aria-label": `Ask me about ${opt.label} each time`, onchange: (e) => {
          if (e.target.checked) { const p = paramFor(i, opt, current); draft.params = [...draft.params.filter((x) => x.id !== p.id), p]; step.options[opt.id] = { $param: p.id }; }
          else { draft.params = draft.params.filter((x) => x.id !== bound); step.options[opt.id] = current; }
          drawSteps();
        } });
        const control = valueControl(opt, current, (v) => { if (param) param.default = v; else step.options[opt.id] = v; });
        return h("div", { class: "act-opt" }, h("label", { class: "pw-field" }, opt.label, control, opt.hint ? h("span", { class: "pw-hint" }, opt.hint) : null), h("label", { class: "find-check" }, ask, h("span", {}, "Ask me each time")));
      });
      return h("div", { class: "act-step" },
        h("div", { class: "pw-row" }, h("strong", {}, `${i + 1}.`), label,
          h("button", { type: "button", class: "btn", disabled: i === 0, "aria-label": `Move step ${i + 1} up`, onclick: () => { [draft.steps[i - 1], draft.steps[i]] = [draft.steps[i], draft.steps[i - 1]]; drawSteps(); } }, "↑"),
          h("button", { type: "button", class: "btn", disabled: i === draft.steps.length - 1, "aria-label": `Move step ${i + 1} down`, onclick: () => { [draft.steps[i + 1], draft.steps[i]] = [draft.steps[i], draft.steps[i + 1]]; drawSteps(); } }, "↓"),
          h("button", { type: "button", class: "btn", "aria-label": `Remove step ${i + 1}`, onclick: () => { draft.steps.splice(i, 1); drawSteps(); } }, "Remove")),
        h("p", { class: "pw-hint" }, def ? def.hint : `Unknown conversion "${step.action}"`), ...opts);
    }));
    if (!draft.steps.length) stepsBox.append(h("p", { class: "pw-hint" }, "No steps yet. Add the first one below."));
  }
  add.addEventListener("change", () => {
    const def = byId.get(add.value);
    if (!def) return;
    draft.steps.push({ type: "convert", label: def.label, action: def.id, options: Object.fromEntries(def.options.map((o) => [o.id, o.default])) });
    add.value = "";
    drawSteps();
  });
  drawSteps();

  const field = (label, control, hint) => h("label", { class: "pw-field" }, label, control, hint ? h("span", { class: "pw-hint" }, hint) : null);
  const dlg = openDialog({
    title: existing ? `Edit the action "${existing.name}"` : "New action",
    wide: true,
    describe: "An action is a saved recipe of conversion steps. It never changes your original files.",
    body: [
      field("Name", name), field("What it does", description),
      field("File types it accepts", exts, "Letters only, separated by commas. Leave empty to accept any file."),
      h("h3", { class: "plan-h" }, "Steps"), h("p", { class: "pw-hint" }, "Each step works on the results of the one before it. Tick “Ask me each time” to be asked for that setting whenever you run the action."),
      stepsBox, add,
      h("h3", { class: "plan-h" }, "Results"),
      field("Output folder", folder, "Next to the first file (./optimized) or a full path. Missing folders are made."),
      field("If a name is already taken", conflict, "Nothing is ever overwritten."),
      h("label", { class: "find-check" }, reveal, h("span", {}, "Show the output folder when it is done")),
      h("p", { class: "pw-hint" }, "Your original files are never changed. Actions work on copies."),
    ],
    buttons: [{ label: "Cancel", value: null }, { label: "Save action", value: "save", primary: true }],
    initialFocus: name,
  });
  const saveButton = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  return await new Promise((resolve) => {
    saveButton.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      saveButton.disabled = true;
      try {
        const action = { ...(existing?.source === "local" || existing?.source === "imported" ? { id: existing.id } : {}), name: name.value, description: description.value, input: { extensions: exts.value.split(/[,\s]+/).filter(Boolean), min: 1, max: 500 }, params: draft.params, steps: draft.steps, output: { folder: folder.value, conflict: conflict.value }, revealOutput: reveal.checked };
        const res = await call("actions/save", { action });
        dlg.close("saved");
        resolve(res.action);
      } catch (err) {
        dlg.setError(explain(err, "The action couldn't be saved."));
        saveButton.disabled = false;
      }
    }, true);
    dlg.result.then((v) => v !== "saved" && resolve(null));
  });
}

async function textDialog(title, intro, initial, buttonLabel, readOnly) {
  const box = textArea(initial, title, 10);
  box.readOnly = readOnly;
  const picker = h("input", { type: "file", accept: ".json,application/json", hidden: true, "aria-label": "Choose an action file", onchange: async (e) => { const f = e.target.files?.[0]; if (f) box.value = await f.text(); } });
  const dlg = openDialog({ title, wide: true, body: [h("p", {}, intro), box, readOnly ? null : picker, readOnly ? null : h("button", { type: "button", class: "btn", onclick: () => picker.click() }, "Open a file…")], buttons: [{ label: "Close", value: null }, { label: buttonLabel, value: "go", primary: true }], initialFocus: box });
  const go = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  return { dlg, box, go };
}

registerPowerTab({
  id: "actions", label: "Actions", icon: "⚙️", group: "automate", tip: "Saved recipes: run the same steps on the files you choose (like resize, then WebP, into ./optimized). Originals are never changed.",
  mount(root) {
    const status = h("p", { class: "pw-status", role: "status", "aria-live": "polite" });
    const list = h("div", { class: "act-cards" });
    const panel = h("section", { class: "pw-card act-panel", "aria-label": "Run an action", hidden: true });
    let actions = [];
    let catalog = [];
    let readOnly = false;
    let current = null;
    let inputs = [];
    let values = {};
    let timer = 0;
    let checkSeq = 0;

    const say = (text, bad = false) => { status.textContent = text; status.classList.toggle("pw-bad", bad); if (text) announce(text); };
    const ensureCatalog = async () => { if (!catalog.length) catalog = (await call("actions/catalog")).steps; return catalog; };

    async function load() {
      try {
        const res = await call("actions/list");
        actions = res.actions;
        readOnly = res.readOnly;
        say(readOnly ? "These actions were saved by a newer version of the app, so they can be read but not changed." : res.skipped ? `${plural(res.skipped, "saved action")} could not be read and was skipped.` : "", readOnly);
        paint();
      } catch (err) { say(explain(err, "The actions couldn't be loaded."), true); }
    }

    function paint() {
      list.replaceChildren(...actions.map((a) => h("article", { class: "pw-card act-card", "aria-label": a.name },
        h("h3", {}, `⚙️ ${a.name}`, a.source !== "local" ? h("span", { class: "proj-badge" }, a.source === "builtin" ? "built in" : "imported") : null),
        h("p", { class: "pw-hint" }, a.description),
        h("ol", { class: "act-list" }, a.steps.map((s) => h("li", {}, s.label, s.type === "command" ? h("span", { class: "proj-badge warn" }, "disabled") : null))),
        h("p", { class: "pw-hint" }, `Results go to ${a.output.folder}  ·  ${a.output.conflict === "skip" ? "a taken name is left alone" : "a taken name gets a number"}  ·  your original files are never changed`),
        h("div", { class: "pw-row" },
          h("button", { type: "button", class: "pw-btn primary", onclick: () => openPanel(a) }, "Choose files and run…"),
          h("button", { type: "button", class: "pw-btn", disabled: readOnly && a.source !== "builtin", onclick: () => edit(a) }, a.source === "builtin" ? "Edit a copy…" : "Edit…"),
          h("button", { type: "button", class: "pw-btn", onclick: () => share(a) }, "Share…"),
          a.source !== "builtin" ? h("button", { type: "button", class: "pw-btn danger", disabled: readOnly, onclick: () => remove(a) }, "Delete…") : null))));
    }

    async function edit(a) {
      await ensureCatalog();
      const copy = a.source === "builtin" ? { ...structuredClone(a), name: `${a.name} (copy)` } : a;
      const saved = await editAction(a.source === "builtin" ? { ...copy, source: "builtin-copy" } : copy, catalog);
      if (saved) { await load(); toast(`Saved "${saved.name}".`, { kind: "success" }); }
    }

    async function remove(a) {
      if (!(await confirmBox({ title: `Delete the action "${a.name}"?`, message: "Only the saved action is deleted. No files are touched.", confirmLabel: "Delete the action", danger: true }))) return;
      try { await call("actions/delete", { id: a.id }); if (current?.id === a.id) closePanel(); await load(); } catch (err) { say(explain(err, "It couldn't be deleted."), true); }
    }

    async function share(a) {
      let res;
      try { res = await call("actions/export", { id: a.id }); } catch (err) { return say(explain(err, "It couldn't be exported."), true); }
      const { dlg, box, go } = await textDialog(`Share "${a.name}"`, "This file holds the steps and settings, never a password. Anyone can use it from Import.", res.text, "Copy", true);
      go.addEventListener("click", async (e) => { e.stopImmediatePropagation(); try { await call("copytext", { text: box.value }); toast("Copied.", { kind: "success" }); dlg.close("go"); } catch { dlg.setError("It couldn't be copied."); } }, true);
    }

    async function doImport() {
      const { dlg, box, go } = await textDialog("Import an action", "Custom commands in an imported file are kept but disabled: they never run. Everything else is checked like any action.", "", "Import", false);
      go.addEventListener("click", async (e) => {
        e.stopImmediatePropagation();
        go.disabled = true;
        try {
          const res = await call("actions/import", { text: box.value });
          dlg.close("go");
          toast(`Imported "${res.action.name}".${res.disabledSteps ? ` ${plural(res.disabledSteps, "custom command")} disabled.` : ""}`, { kind: "success" });
          await load();
        } catch (err) { dlg.setError(explain(err, "That file couldn't be imported.")); go.disabled = false; }
      }, true);
    }

    function closePanel() { current = null; panel.hidden = true; panel.replaceChildren(); clearTimeout(timer); }

    function readSelection() {
      inputs = selectedEntries().filter((e) => !e.isDir).map((e) => e.path);
    }

    function openPanel(a) {
      current = a;
      values = Object.fromEntries(a.params.map((p) => [p.id, p.default]));
      readSelection();
      drawPanel();
    }

    function drawPanel() {
      const a = current;
      const check = h("div", { class: "act-check", "aria-live": "polite" });
      const progress = h("div", { class: "act-run", "aria-live": "polite" });
      const run = h("button", { type: "button", class: "pw-btn primary", disabled: true }, "Run the action");
      const useSelected = h("button", { type: "button", class: "pw-btn", title: "Use the files that are selected in the file list", onclick: () => { readSelection(); paintInputs(); doCheck(); } }, "Use the selected files");
      const inputBox = h("div", { class: "act-inputs" });
      const params = a.params.map((p) => {
        const control = valueControl({ kind: p.kind, choices: p.choices, min: p.min, max: p.max, label: p.label }, values[p.id], (v) => { values[p.id] = v; doCheck(); });
        return h("label", { class: "pw-field" }, p.label, control);
      });
      const paintInputs = () => {
        inputBox.replaceChildren(inputs.length
          ? h("div", {}, h("strong", {}, plural(inputs.length, "file")), h("ul", {}, ...inputs.slice(0, 8).map((p) => h("li", { class: "pw-mono" }, base(p))), inputs.length > 8 ? h("li", { class: "pw-hint" }, `…and ${inputs.length - 8} more`) : null))
          : h("p", { class: "pw-hint" }, "No files yet. Select some files in the file list, then press “Use the selected files”."));
      };
      async function doCheck() {
        const mine = ++checkSeq;
        run.disabled = true;
        if (!inputs.length) { check.replaceChildren(); return; }
        try {
          const { check: c } = await call("actions/preflight", { action: a.id, inputs, params: values });
          if (mine !== checkSeq) return;
          check.replaceChildren(...[
            h("p", { class: c.ok ? "pw-ok" : "pw-bad", role: "status" }, c.ok ? `Ready: ${plural(c.accepted.length, "file")} will be used. Your original files are never changed.` : "This can't run yet. Fix the problems below."),
            h("ol", { class: "act-list" }, c.steps.map((s) => h("li", { class: s.available ? "pw-ok" : "pw-bad" }, `${s.available ? "✓" : "✗"} ${s.label}`, h("span", { class: "pw-hint" }, ` — ${s.note}`)))),
            ...c.problems.map((p) => h("p", { class: p.level === "block" ? "pw-bad" : "pw-hint" }, `${p.level === "block" ? "⛔" : "⚠️"} ${p.message}`)),
            c.rejected.length ? h("ul", { class: "act-rejected" }, c.rejected.slice(0, 8).map((r) => h("li", {}, `${base(r.path)}: ${r.reason}`)), c.rejected.length > 8 ? h("li", { class: "pw-hint" }, `…and ${c.rejected.length - 8} more`) : null) : null,
            c.outputFolder ? h("p", { class: "pw-hint" }, `Results go to ${c.outputFolder}${c.outputFolderExists ? "" : " (it will be made)"}. ${c.recovery}`) : null].filter(Boolean));
          run.disabled = !c.ok;
        } catch (err) { if (mine === checkSeq) check.replaceChildren(h("p", { class: "pw-bad" }, explain(err, "The check didn't work."))); }
      }
      run.addEventListener("click", async () => {
        run.disabled = true;
        try {
          const res = await call("actions/run", { action: a.id, inputs, params: values });
          watch(res.run.id, progress, run);
        } catch (err) { progress.replaceChildren(h("p", { class: "pw-bad", role: "alert" }, explain(err, "The action couldn't start."))); doCheck(); }
      });
      panel.hidden = false;
      panel.replaceChildren(
        h("h3", {}, `Run "${a.name}"`),
        h("div", { class: "pw-row" }, useSelected, h("button", { type: "button", class: "pw-btn", onclick: closePanel }, "Close")),
        inputBox, ...params, check, h("div", { class: "pw-row" }, run), progress);
      paintInputs();
      doCheck();
    }

    function watch(id, progress, run) {
      clearTimeout(timer);
      const tick = async () => {
        let r;
        try { r = (await call("actions/run/get", { id })).run; } catch (err) { progress.replaceChildren(h("p", { class: "pw-bad" }, explain(err, "The progress couldn't be read."))); return; }
        const over = !!r.finishedAt;
        progress.replaceChildren(...[
          h("ol", { class: "act-list" }, r.steps.map((s) => h("li", { class: s.state === "failed" ? "pw-bad" : s.state === "done" ? "pw-ok" : "" }, `${STEP_ICON[s.state]} ${s.label}`, s.message ? h("span", { class: "pw-hint" }, ` — ${s.message}`) : null,
            s.failedFiles.length ? h("ul", {}, s.failedFiles.slice(0, 5).map((f) => h("li", {}, `${f.path}: ${f.message}`))) : null))),
          over ? h("p", { class: r.state === "done" ? "pw-ok" : "pw-bad", role: r.state === "done" ? "status" : "alert" }, r.message) : h("div", { class: "pw-row" }, h("span", { class: "pw-hint" }, "Working…"), h("button", { type: "button", class: "pw-btn", onclick: () => call("actions/run/cancel", { id }).catch(() => {}) }, "Cancel")),
          over && r.state === "done" && r.reveal && r.published.length ? h("button", { type: "button", class: "pw-btn", onclick: () => goTo(r.outputFolder) }, "Show the output folder") : null,
          over && r.notPublished.length ? h("p", { class: "pw-hint" }, `Not copied: ${r.notPublished.slice(0, 5).map(base).join(", ")}`) : null].filter(Boolean));
        if (over) { run.disabled = false; announce(r.message); if (r.state === "done") toast(r.message, { kind: "success" }); return; }
        timer = setTimeout(tick, POLL_MS);
      };
      tick();
    }

    root.append(
      h("section", { class: "pw-card", "aria-label": "Actions" },
        h("h3", {}, "Actions"),
        h("p", { class: "pw-hint" }, "An action is a saved recipe: the same steps, run on any files you choose. Example: make pictures smaller, turn them into WebP, put them in ./optimized. Your original files are never changed, nothing is overwritten, and everything is checked before it runs."),
        h("div", { class: "pw-row" },
          h("button", { type: "button", class: "pw-btn primary", disabled: false, onclick: async () => { await ensureCatalog(); const saved = await editAction(null, catalog); if (saved) { await load(); toast(`Saved "${saved.name}".`, { kind: "success" }); } } }, "New action…"),
          h("button", { type: "button", class: "pw-btn", onclick: doImport }, "Import an action file…"))),
      status, list, panel);
    return { show: () => { load(); if (current) { readSelection(); drawPanel(); } } };
  },
});
