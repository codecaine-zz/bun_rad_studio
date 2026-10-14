// The form for adding or editing one run preset, and the export / import of presets as JSON.
// Presets are only stored; nothing here runs a command.
import { call, ApiError } from "./api.js";
import { debounce, h } from "./dom.js";
import { confirmBox, openDialog, promptBox } from "./dialogs.js";
import { toast } from "./menus.js";
import { buildRunSequence, needsConfirmation, PLACEHOLDERS } from "./codeLogic.js";
import { exportPresets, importPresets, readFile, savePreset, writeText } from "./codeIO.js";
import { state } from "./state.js";

const CWD_CHOICES = [
  ["file", "The file's own folder"],
  ["workspace", "The workspace folder (the one shown in the Explorer)"],
  ["root", "The project folder (nearest folder above with package.json, .git, Cargo.toml, go.mod, pyproject.toml, v.mod or Makefile)"],
];

const field = (label, control, tip) => h("label", { class: "code-field", title: tip }, label, control);

/**
 * Opens the form. `preset` is null for a new one (or a template with no id); `vars` = { path, workspace, root, platform }
 * for the live preview; `ext` is the file's ending like ".ts" ("" when it has none). Resolves true when saved.
 */
export function openPresetForm({ path, preset, scope, ext, vars }) {
  const editing = !!preset?.id;
  const name = h("input", { type: "text", class: "code-in", maxlength: "60", value: preset?.name ?? "", "aria-label": "Preset name", title: "A short name, like \"Run tests\".", spellcheck: "false", autocomplete: "off" });
  const command = h("input", { type: "text", class: "code-in code-mono", maxlength: "2000", value: preset?.command ?? "", "aria-label": "Command to run", title: "The command, like: bun run {file}. Use the placeholders listed below for the file's path.", spellcheck: "false", autocomplete: "off" });
  const cwd = h("select", { class: "code-in", "aria-label": "Working folder", title: "The folder the terminal moves to before the command runs." }, CWD_CHOICES.map(([v, l]) => h("option", { value: v, selected: (preset?.cwd ?? "file") === v }, l)));
  const kind = h("select", { class: "code-in", "aria-label": "Kind", title: "Run presets run the file or tests. One Build preset per file can run with Ctrl/Cmd+B." },
    h("option", { value: "run", selected: (preset?.kind ?? "run") === "run" }, "Run (for running or testing the file)"), h("option", { value: "build", selected: preset?.kind === "build" }, "Build (for compiling, bundling or checking the project)"));
  const scopeSel = h("select", { class: "code-in", "aria-label": "Remember for", title: "Keep this preset just for this file, or for every file with the same ending." },
    h("option", { value: "file", selected: scope !== "ext" }, "This file only"), h("option", { value: "ext", selected: scope === "ext", disabled: !ext }, ext ? `All ${ext} files` : "All files of this type (this file has no ending)"));
  const ask = h("input", { type: "checkbox", id: "code-pf-ask", checked: preset?.ask ?? false });
  let askTouched = editing;
  ask.addEventListener("change", () => (askTouched = true));
  const preview = h("pre", { class: "code-preview", "aria-live": "polite" });
  const build = () => ({ id: preset?.id, name: name.value, command: command.value, cwd: cwd.value, kind: kind.value, ask: ask.checked });

  function update() {
    if (!askTouched) ask.checked = needsConfirmation(command.value);
    if (!command.value.trim()) {
      preview.textContent = "The exact text that will be sent to the Terminal appears here.";
      return preview.classList.remove("code-bad");
    }
    const seq = buildRunSequence(build(), vars);
    preview.classList.toggle("code-bad", !!seq.error);
    preview.textContent = seq.error ? seq.error : `${seq.line}   ⏎`;
  }
  const live = debounce(update, 80);
  for (const c of [name, command, cwd, kind]) c.addEventListener("input", live);
  cwd.addEventListener("change", update);

  const dlg = openDialog({
    title: editing ? "Edit preset" : "New preset", wide: true, initialFocus: name,
    buttons: [{ label: "Cancel", value: false }, { label: "Save preset", value: true, primary: true }],
    body: [
      h("p", { class: "code-hint" }, "Run sends the command to the Terminal and presses Enter; you'll see its output there. This form only saves the command: nothing runs until you click Run."),
      field("Name", name), field("Command", command),
      h("details", { class: "code-help" }, h("summary", {}, "Placeholders you can use in the command"), h("dl", { class: "code-sc-list" }, PLACEHOLDERS.flatMap(([k, d]) => [h("dt", {}, h("code", {}, k)), h("dd", {}, d)])),
        h("p", { class: "code-hint" }, "Paths are put in quotes for you when they need them. Write {{ or }} for a literal brace.")),
      h("div", { class: "code-sb-row" }, field("Working folder", cwd), field("Kind", kind), field("Remember for", scopeSel)),
      h("label", { class: "code-check", title: "When on, you'll be asked to confirm before this command is sent. It starts on for commands that delete, move, use sudo, redirect output, pipe into a shell or force something." }, ask, " Ask before running"),
      h("div", { class: "code-field" }, "What will be sent", preview),
    ],
  });
  update();

  return new Promise((resolve) => {
    const okButton = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
    okButton.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      okButton.disabled = true;
      try {
        await savePreset(path, scopeSel.value, build());
        dlg.close("saved");
      } catch (err) {
        dlg.setError(err instanceof ApiError ? err.message : "That couldn't be saved.");
        okButton.disabled = false;
      }
    }, true);
    dlg.result.then((v) => resolve(v === "saved"));
  });
}

/** Export and import of all saved presets as JSON text. */
export function openExport() {
  exportPresets().then((data) => {
    const json = JSON.stringify(data, null, 2);
    const box = h("textarea", { class: "code-in code-sample code-mono", rows: "12", readonly: true, "aria-label": "Exported presets (JSON)" });
    box.value = json;
    openDialog({ title: "Export presets", wide: true, buttons: [{ label: "Close", value: null, primary: true }],
      body: [h("p", { class: "code-hint" }, "This is every run preset you've saved, as text you can keep or share. Importing it later never runs anything."), box,
        h("div", { class: "pw-row" },
          h("button", { type: "button", class: "btn", title: "Copy all of this text", disabled: json.length > 100_000, onclick: () => call("copytext", { text: json }).then(() => toast("Copied.", { kind: "success" })).catch((err) => toast(err.message, { kind: "error" })) }, "Copy"),
          h("button", { type: "button", class: "btn", title: "Save this text to a file you choose", onclick: async () => {
            const saved = await promptBox({ title: "Save presets to a file", label: "Full path of the new file", value: `${state.home}${state.sep}run-presets.json`, confirmLabel: "Save", submit: (p) => writeText("code/saveas", { path: p, text: json, overwrite: false }) });
            if (saved) toast(`Saved to ${saved.path}`, { kind: "success" });
          } }, "Save to a file…"))],
    });
  }).catch((err) => toast(err.message, { kind: "error" }));
}

export function openImport(onDone) {
  const path = h("input", { type: "text", class: "code-in", placeholder: "Full path of an exported .json file", "aria-label": "Path of the file to import", title: "Type the full path of a presets file you exported earlier, then click Load.", spellcheck: "false" });
  const box = h("textarea", { class: "code-in code-sample code-mono", rows: "10", "aria-label": "Presets to bring in (JSON)", title: "Paste exported presets here.", placeholder: "…or paste the exported text here" });
  const mode = h("select", { class: "code-in", "aria-label": "How to import", title: "Merge adds to what you have; Replace swaps everything." }, h("option", { value: "merge" }, "Add to my presets (skip ones I already have)"), h("option", { value: "replace" }, "Replace all my presets"));
  const dlg = openDialog({
    title: "Import presets", wide: true, initialFocus: path, buttons: [{ label: "Cancel", value: false }, { label: "Import", value: true, primary: true }],
    body: [h("p", { class: "code-hint" }, "Imported presets are checked first and are never run. Ones with line breaks or hidden characters are left out."),
      h("div", { class: "pw-row" }, path, h("button", { type: "button", class: "btn", title: "Read the file into the box below", onclick: async () => {
        try {
          box.value = (await readFile(path.value.trim())).text;
        } catch (err) {
          dlg.setError(err instanceof ApiError ? err.message : "That file couldn't be read.");
        }
      } }, "Load")), box, field("How", mode)],
  });
  const okButton = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  okButton.addEventListener("click", async (e) => {
    e.stopImmediatePropagation();
    let data;
    try {
      data = JSON.parse(box.value);
    } catch {
      return dlg.setError("That text isn't valid JSON. Paste the whole exported text.");
    }
    if (mode.value === "replace" && !(await confirmBox({ title: "Replace all presets?", message: "Every run preset you have saved now will be replaced by the imported ones.", confirmLabel: "Replace", danger: true }))) return;
    try {
      const r = await importPresets(data, mode.value);
      dlg.close(true);
      toast(`Imported ${r.imported} ${r.imported === 1 ? "preset" : "presets"}${r.skipped ? ` (${r.skipped} skipped)` : ""}.`, { kind: "success" });
      onDone?.();
    } catch (err) {
      dlg.setError(err instanceof ApiError ? err.message : "That couldn't be imported.");
    }
  }, true);
}
