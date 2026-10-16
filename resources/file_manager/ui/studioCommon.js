// Pieces shared by the Image Studio and the Media Studio: the "which file" row, labelled sliders and switches, preset
// buttons, and saving: every change is sent as ONE conversion job (tools/run), so the result gets a new, safe name next
// to the original, shows in the task list, and the original is never touched.
import { ApiError, call } from "./api.js";
import { confirmBox, promptBox } from "./dialogs.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { refresh, saveSettings } from "./nav.js";
import { currentPath } from "./pane.js";
import { selectedEntries } from "./selection.js";
import { emit, on, state } from "./state.js";

export const extOf = (name) => (/\.([^./\\]+)$/.exec(name)?.[1] ?? "").toLowerCase();
export const baseName = (path) => path.split(/[\\/]/).pop() ?? path;

/**
 * The row at the top of a studio: the file being edited, "Use the selected file", and a box to type or paste a path.
 * `accepts(name)` says which files fit; `onPick(path)` loads one.
 */
export function fileRow({ what, accepts, onPick, idPrefix }) {
  const name = h("strong", { class: "st-file-name", id: `${idPrefix}-file` }, `No ${what} yet`);
  const typed = h("input", { type: "text", class: "pw-mono st-path", placeholder: `Or type or paste the path of a ${what}`, spellcheck: "false", autocomplete: "off", "aria-label": `Path of a ${what}` });
  const useSelected = () => {
    const pick = selectedEntries().find((e) => !e.isDir && accepts(e.name));
    if (!pick) return toast(`Select a ${what} in the file list first (or type its path).`, { kind: "info" });
    onPick(pick.path);
  };
  const openTyped = async () => {
    const text = typed.value.trim();
    if (!text) return;
    try {
      const r = await call("typedpath", { text, cwd: currentPath() });
      if (!r.exists || r.isDir || !accepts(r.path)) throw new Error(`That isn't a ${what} this studio can open.`);
      typed.value = "";
      onPick(r.path);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : err.message, { kind: "error" });
    }
  };
  typed.addEventListener("keydown", (e) => { if (e.key === "Enter") openTyped(); });
  const el = h("div", { class: "pw-card st-filecard" },
    h("div", { class: "pw-row" },
      h("span", { class: "st-file-label" }, "Editing:"), name,
      h("button", { type: "button", class: "pw-btn primary", id: `${idPrefix}-use-selected`, title: `Edit the ${what} selected in the file list`, onclick: useSelected }, `Use the selected ${what}`),
      typed, h("button", { type: "button", class: "pw-btn", onclick: openTyped }, "Open")));
  return { el, setName: (path) => { name.textContent = path ? baseName(path) : `No ${what} yet`; name.title = path ?? ""; } };
}

/** A labelled slider with its value shown; `format(v)` writes the value ("+20", "150%"). */
export function slider({ id, label, min, max, step = 1, value, format = (v) => String(v), tip, onInput }) {
  const out = h("output", { class: "st-value" }, format(value));
  const input = h("input", { type: "range", min, max, step, value, "aria-label": label, title: tip ?? label, dataset: { opt: id } });
  input.addEventListener("input", () => { out.textContent = format(Number(input.value)); onInput(); });
  // A double-click puts it back to where it started.
  const reset = value;
  input.addEventListener("dblclick", () => { input.value = String(reset); out.textContent = format(reset); onInput(); });
  const el = h("label", { class: "st-slider", title: `${tip ?? label} Double-click to reset.` }, h("span", { class: "st-slider-label" }, label), input, out);
  return { el, input, get: () => Number(input.value), set: (v) => { input.value = String(v); out.textContent = format(Number(input.value)); }, reset: () => { input.value = String(reset); out.textContent = format(reset); } };
}

export function toggle({ id, label, tip, value = false, onInput }) {
  const input = h("input", { type: "checkbox", "aria-label": label, dataset: { opt: id } });
  input.checked = value;
  input.addEventListener("change", onInput);
  const start = value;
  return { el: h("label", { class: "st-toggle", title: tip ?? label }, input, label), input, get: () => input.checked, set: (v) => { input.checked = !!v; }, reset: () => { input.checked = start; } };
}

export function select({ id, label, choices, value, tip, onInput }) {
  const input = h("select", { "aria-label": label, title: tip ?? label, dataset: { opt: id } }, choices.map(([v, l]) => h("option", { value: v }, l)));
  input.value = value;
  input.addEventListener("change", onInput);
  const start = value;
  return { el: h("label", { class: "st-select" }, h("span", { class: "st-slider-label" }, label), input), input, get: () => input.value, set: (v) => { input.value = v; }, reset: () => { input.value = start; } };
}

export const group = (title, ...children) => h("section", { class: "pw-card st-group" }, h("h3", {}, title), h("div", { class: "st-controls" }, children));

/** Waits for a job to finish (looking every half second); resolves with the finished job. */
async function whenFinished(id) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const job = (await call("jobs/list")).jobs.find((j) => j.id === id);
    if (!job) return null;
    if (!["queued", "running", "pending"].includes(job.state)) return job;
  }
}

/**
 * Saves the edits as new files: one job for every path (one or many), followed until it ends, then says where the new
 * files are. Returns the new paths (or null). `status` is an element that shows what is going on.
 */
export async function saveCopy({ action, path, paths = [path], options, status, button }) {
  button.disabled = true;
  const many = paths.length > 1;
  status.textContent = many ? `Saving ${paths.length} new files…` : "Saving a copy…";
  status.className = "pw-status";
  try {
    const { job } = await call("tools/run", { action, paths, options });
    emit("job-started", job);
    const done = await whenFinished(job.id);
    const outs = done?.outputs ?? [];
    if (!done || (done.state !== "done" && !outs.length)) {
      const why = done?.steps?.find((s) => s.message)?.message ?? "It didn't finish.";
      status.textContent = why;
      status.className = "pw-status pw-bad";
      return null;
    }
    const failed = paths.length - outs.length;
    status.textContent = many
      ? `Saved ${outs.length} new file${outs.length === 1 ? "" : "s"} next to the originals${failed > 0 ? ` (${failed} couldn't be done — see the task list)` : ""}. The originals are unchanged.`
      : `Saved “${baseName(outs[0])}” next to the original. The original is unchanged.`;
    status.className = failed > 0 ? "pw-status pw-bad" : "pw-status pw-ok";
    toast(many ? `Saved ${outs.length} new files.` : `Saved “${baseName(outs[0])}”.`, { kind: failed > 0 ? "info" : "success" });
    refresh();
    return outs;
  } catch (err) {
    status.textContent = err instanceof ApiError ? err.message : "That didn't start.";
    status.className = "pw-status pw-bad";
    return null;
  } finally {
    button.disabled = false;
  }
}

/**
 * The "My presets" card: pick a saved look to put every control back the way it was saved, save the current controls
 * under a name, or delete one. Presets live in the File Manager's settings file, so they are there next time too.
 * `kind` is "image" or "media"; `skip` lists option ids that are never saved (like a song's start and end time).
 */
export function presetCard({ kind, idPrefix, getValues, applyValues, skip = [] }) {
  const list = () => state.settings?.studioPresets?.[kind] ?? [];
  const pick = h("select", { id: `${idPrefix}-preset`, "aria-label": "My presets", title: "Choose a saved preset to set every control the way it was saved" });
  const del = h("button", { type: "button", class: "pw-btn", id: `${idPrefix}-preset-delete`, title: "Delete the chosen preset", disabled: true }, "Delete");
  const save = h("button", { type: "button", class: "pw-btn", id: `${idPrefix}-preset-save`, title: "Remember every control as it is now, under a name, to use again on other files" }, "＋ Save as preset…");
  const fill = () => {
    const keep = pick.value;
    pick.replaceChildren(h("option", { value: "" }, list().length ? "Choose a saved preset…" : "No saved presets yet"), ...list().map((p) => h("option", { value: p.name }, p.name)));
    pick.value = list().some((p) => p.name === keep) ? keep : "";
    del.disabled = !pick.value;
  };
  const store = (presets) => saveSettings({ studioPresets: { ...(state.settings.studioPresets ?? { image: [], media: [] }), [kind]: presets } });
  pick.addEventListener("change", () => {
    del.disabled = !pick.value;
    const p = list().find((x) => x.name === pick.value);
    if (p) { applyValues(p.options); toast(`Preset “${p.name}” is set. Save a copy, or apply it to all the selected files.`, { kind: "info" }); }
  });
  save.addEventListener("click", async () => {
    const options = Object.fromEntries(Object.entries(getValues()).filter(([k]) => !skip.includes(k)));
    const name = await promptBox({
      title: "Save as preset", label: "Name of the preset", value: pick.value, confirmLabel: "Save",
      hint: "Every slider and switch is saved as it is now. Using the same name again replaces that preset.",
      submit: async (text) => {
        const n = text.trim().replace(/\s+/g, " ").slice(0, 40);
        if (!n) throw new ApiError("Type a name for the preset.", "BAD_NAME", 400);
        const others = list().filter((p) => p.name.toLowerCase() !== n.toLowerCase());
        if (others.length >= 50) throw new ApiError("That's 50 presets already. Delete one first.", "TOO_MANY", 400);
        await store([...others, { name: n, options }].sort((a, b) => a.name.localeCompare(b.name)));
        return n;
      },
    });
    if (name) { fill(); pick.value = name; del.disabled = false; toast(`Saved the preset “${name}”.`, { kind: "success" }); }
  });
  del.addEventListener("click", async () => {
    const name = pick.value;
    if (!name || !(await confirmBox({ title: "Delete preset?", message: `Delete the preset “${name}”? Files already made with it are not changed.`, confirmLabel: "Delete", danger: true }))) return;
    await store(list().filter((p) => p.name !== name));
    pick.value = "";
    fill();
  });
  on("settings", fill);
  fill();
  return { el: h("div", { class: "pw-row st-presetbar" }, h("span", { class: "st-file-label" }, "My presets:"), pick, save, del) };
}

/**
 * The "Apply to many files" card: uses the current controls (or a chosen preset) on every matching file selected in the
 * file list, as ONE job; each file gets its own new copy next to it.
 */
export function bulkCard({ what, whatMany, accepts, action, getValues, idPrefix, check = () => null }) {
  const status = h("p", { class: "pw-status", role: "status", "aria-live": "polite" });
  const count = h("p", { class: "pw-hint st-bulk-count" });
  const button = h("button", { type: "button", class: "pw-btn primary", id: `${idPrefix}-bulk`, disabled: true }, "Apply to the selected files");
  let targets = [];
  const update = () => {
    targets = selectedEntries().filter((e) => !e.isDir && accepts(e.name)).map((e) => e.path);
    const n = targets.length;
    button.disabled = n === 0;
    button.textContent = n ? `Apply to all ${n} selected ${n === 1 ? what : whatMany}` : "Apply to the selected files";
    const names = targets.slice(0, 4).map(baseName).join(", ");
    count.textContent = n ? `${names}${n > 4 ? ` and ${n - 4} more` : ""}` : `Select ${whatMany} in the file list (Shift- or ${navigator.platform.startsWith("Mac") ? "Cmd" : "Ctrl"}-click to pick several), then press the button. Each one gets its own new copy; nothing is overwritten.`;
  };
  button.addEventListener("click", async () => {
    if (!targets.length) return;
    const problem = check();
    if (problem) { status.textContent = problem; status.className = "pw-status pw-bad"; return; }
    await saveCopy({ action, paths: targets, options: getValues(), status, button });
    update();
  });
  on("selection", update);
  update();
  return {
    el: h("section", { class: "pw-card st-bulk" }, h("h3", {}, `Apply to many ${whatMany} at once`), h("p", { class: "pw-hint" }, `Uses the settings above (or a preset you choose) on every selected ${what}.`), count, h("div", { class: "pw-row" }, button), status),
    update,
  };
}
