// Running presets. "Run" sends the command to the File Manager's own terminal (so its output is seen there, live,
// and Ctrl+C works) after moving to the preset's working folder, and presses Enter. It only happens when the person
// clicks Run or uses the shortcut on a preset they saved. This file also draws the "Run presets" dialog.
import { call, ApiError } from "./api.js";
import { h } from "./dom.js";
import { confirmBox, messageBox, openDialog } from "./dialogs.js";
import { showMenu, toast } from "./menus.js";
import { terminalAvailable, typeInTerminal } from "./terminal.js";
import { state } from "./state.js";
import { formatDate } from "./util.js";
import { buildRunSequence, copyName, suggestionsFor } from "./codeLogic.js";
import { deletePreset, listPresets, projectRoot, recordRun, reorderPresets, savePreset, setDefaultPreset } from "./codeIO.js";
import { openExport, openImport, openPresetForm } from "./codePresetForm.js";

const CWD_NAMES = { file: "file's folder", workspace: "workspace folder", root: "project folder" };
const short = (text, n = 160) => (text.length > n ? `${text.slice(0, n)}…` : text);

export function createRunUi({ getWorkspace }) {
  const roots = new Map();

  async function varsFor(doc) {
    const dir = doc.path.slice(0, Math.max(doc.path.lastIndexOf("/"), doc.path.lastIndexOf("\\")));
    if (!roots.has(dir)) roots.set(dir, await projectRoot(doc.path).catch(() => ""));
    return { path: doc.path, workspace: getWorkspace(), root: roots.get(dir), platform: state.platform };
  }

  async function copyCommand(line) {
    try {
      await call("copytext", { text: line });
      toast("Command copied. Paste it into a terminal and press Enter.", { kind: "success" });
    } catch (err) {
      toast(err.message ?? "Couldn't copy.", { kind: "error" });
    }
  }

  /** Sends one preset to the terminal. Never called except from a click or a shortcut. */
  async function runPreset(doc, preset) {
    if (!doc?.path) return void (await messageBox("Save the file first", "A command needs to know where the file is. Save this file (Ctrl/Cmd+S), then try again."));
    const vars = await varsFor(doc);
    const seq = buildRunSequence(preset, vars);
    if (seq.error) return void (await messageBox("This preset can't run", seq.error));
    if (!terminalAvailable()) {
      const dlg = openDialog({
        title: "The Terminal isn't available on Windows yet",
        body: [h("p", {}, "Presets run in the File Manager's built-in Terminal, which needs macOS or Linux for now. You can copy the command and run it in PowerShell yourself:"), h("pre", { class: "code-preview" }, seq.line)],
        buttons: [{ label: "Close", value: null }, { label: "Copy command", value: "copy", primary: true }],
      });
      if ((await dlg.result) === "copy") copyCommand(seq.line);
      return;
    }
    if (preset.ask) {
      const ok = await confirmBox({ title: "Run this command?", message: "This will be sent to the Terminal and run (it can delete, move or overwrite things):", details: [seq.line], confirmLabel: "Run it", danger: true });
      if (!ok) return;
    }
    if (!typeInTerminal(seq.send)) return void toast("The Terminal couldn't be opened.", { kind: "error" });
    toast(`Running in Terminal: ${short(seq.line, 200)}`, { kind: "info", timeout: 6000 });
    recordRun(doc.path, preset.id).catch(() => {});
  }

  /** Runs the default Run (or Build) preset of the file; with none set, asks what to do. */
  async function runDefault(doc, kind) {
    if (!doc?.path) return void toast("Save this file first. Run and Build need to know where it is.");
    const list = await listPresets(doc.path).catch((err) => void toast(err.message, { kind: "error" }));
    if (!list) return;
    const id = kind === "build" ? list.defaultBuild : list.defaultRun || list.last;
    const preset = list.presets.find((p) => p.id === id && p.kind === kind) ?? (kind === "run" ? list.presets.find((p) => p.id === list.last) : null);
    if (preset) return runPreset(doc, preset);
    const ofKind = list.presets.filter((p) => p.kind === kind);
    if (ofKind.length === 1) return runPreset(doc, ofKind[0]);
    toast(kind === "build" ? "No Build preset is chosen for this file yet. Pick one, or add one." : "No Run preset is chosen for this file yet. Pick one, or add one.");
    openPresets(doc);
  }

  /** A drop-down of this file's presets under `anchor`. */
  async function presetMenu(doc, anchor) {
    if (!doc?.path) return void toast("Save this file first. Run and Build need to know where it is.");
    const list = await listPresets(doc.path).catch(() => null);
    const items = [];
    for (const kind of ["run", "build"]) {
      const of = list?.presets.filter((p) => p.kind === kind) ?? [];
      if (of.length) items.push({ header: kind === "run" ? "Run" : "Build" }, ...of.map((p) => ({ label: p.name, icon: "▶", shortcut: p.id === (kind === "run" ? list.defaultRun : list.defaultBuild) ? (kind === "run" ? "default" : "Build") : "", action: () => runPreset(doc, p) })));
    }
    if (!items.length) items.push({ header: "No presets for this file yet" });
    items.push({ separator: true }, { label: "Run presets…", action: () => openPresets(doc) });
    showMenu(items, { anchor, label: "Run and build" });
  }

  async function openPresets(doc) {
    if (!doc?.path) return void (await messageBox("Save the file first", "Presets are remembered for each saved file. Save this file (Ctrl/Cmd+S), then add presets."));
    const ext = (/\.[A-Za-z0-9_+-]{1,16}$/.exec(doc.name)?.[0] ?? "").toLowerCase();
    const box = h("div", { class: "code-presets" });
    const dlg = openDialog({
      title: `Run presets for ${doc.name}`, wide: true,
      buttons: [{ label: "Close", value: null, primary: true }],
      body: [h("p", { class: "code-hint" }, "Run sends the command to the Terminal and presses Enter; you'll see its output there. Presets are only saved here: nothing runs until you click Run. Ctrl/Cmd+Enter runs the default Run preset, Ctrl/Cmd+B the Build preset."), box],
    });
    let data = null;

    async function reload(next) {
      try {
        data = next ?? (await listPresets(doc.path));
      } catch (err) {
        dlg.setError(err instanceof ApiError ? err.message : "Couldn't load the presets.");
        return;
      }
      dlg.setError("");
      draw();
    }
    const act = async (fn) => {
      try {
        await reload(await fn());
      } catch (err) {
        dlg.setError(err instanceof ApiError ? err.message : "That didn't work.");
      }
    };
    const small = (label, tip, run, extra = {}) => h("button", { type: "button", class: "btn code-small", title: tip, "aria-label": tip, onclick: run, ...extra }, label);

    async function edit(preset, scope) {
      const vars = await varsFor(doc);
      if (await openPresetForm({ path: doc.path, preset, scope, ext, vars })) reload();
    }

    function card(p, k, same) {
      const isDefault = p.id === (p.kind === "run" ? data.defaultRun : data.defaultBuild);
      const posInScope = same.findIndex((x) => x.id === p.id);
      const move = (d) => act(() => {
        const ids = same.map((x) => x.id);
        [ids[posInScope], ids[posInScope + d]] = [ids[posInScope + d], ids[posInScope]];
        return reorderPresets(doc.path, ids, p.scope);
      });
      return h("div", { class: `code-preset${isDefault ? " code-preset-default" : ""}` },
        h("div", { class: "code-preset-main" },
          h("div", {}, h("strong", {}, p.name), isDefault ? h("span", { class: "code-badge", title: p.kind === "run" ? "Ctrl/Cmd+Enter runs this one" : "Ctrl/Cmd+B runs this one" }, p.kind === "run" ? "Default (Ctrl/Cmd+Enter)" : "Build (Ctrl/Cmd+B)") : null,
            h("span", { class: "code-badge code-badge-quiet" }, p.scope === "ext" ? `All ${p.ext} files` : "This file")),
          h("code", { class: "code-preset-cmd", title: p.command }, p.command),
          h("div", { class: "code-hint" }, `In the ${CWD_NAMES[p.cwd]}${p.ask ? " · asks first" : ""} · ${p.runCount ? `ran ${p.runCount} ${p.runCount === 1 ? "time" : "times"}${p.lastRun ? `, last ${formatDate(Date.parse(p.lastRun))}` : ""}` : "not run yet"}`)),
        h("div", { class: "code-preset-actions" },
          small("▶ Run", "Send this command to the Terminal and press Enter", () => { dlg.close(); runPreset(doc, p); }, { class: "btn primary code-small" }),
          small(isDefault ? "Not default" : p.kind === "run" ? "Make default" : "Make Build", isDefault ? "Stop using this as the default" : p.kind === "run" ? "Make this the preset Ctrl/Cmd+Enter runs" : "Make this the Build preset (Ctrl/Cmd+B)", () => act(() => setDefaultPreset(doc.path, isDefault ? "" : p.id, p.kind))),
          small("Edit", "Change this preset", () => edit(p, p.scope)),
          small("Duplicate", "Make a copy of this preset", () => act(() => savePreset(doc.path, p.scope, { name: copyName(p.name, data.presets.map((x) => x.name)), command: p.command, cwd: p.cwd, kind: p.kind, ask: p.ask }))),
          small("▲", "Move up", () => move(-1), { disabled: posInScope <= 0 }),
          small("▼", "Move down", () => move(1), { disabled: posInScope >= same.length - 1 }),
          small("Delete", "Delete this preset", async () => { if (await confirmBox({ title: "Delete this preset?", message: `"${p.name}" will be removed. (The command is not run.)`, confirmLabel: "Delete", danger: true })) act(() => deletePreset(doc.path, p.id)); }, { class: "btn danger code-small" })));
    }

    function draw() {
      const sections = [["run", "Run presets", "For running or testing this file."], ["build", "Build presets", "For compiling, bundling or checking the project."]];
      const suggestions = h("button", { type: "button", class: "btn", title: "Add a ready-made preset for this kind of file with one click", onclick: (e) => {
        const have = new Set(data.presets.map((p) => p.command));
        const list = suggestionsFor(doc.lang);
        showMenu(list.map((s) => ({ label: s.name, icon: s.kind === "build" ? "🔨" : "▶", shortcut: s.command, checked: have.has(s.command) ? true : undefined, disabled: have.has(s.command), action: () => act(() => savePreset(doc.path, "file", { name: s.name, command: s.command, cwd: s.cwd, kind: s.kind })) })), { anchor: e.currentTarget, label: "Suggested presets" });
      } }, "Add a suggestion ▾");
      box.replaceChildren(
        h("div", { class: "pw-row" },
          h("button", { type: "button", class: "btn primary", title: "Write your own preset", onclick: () => edit(null, "file") }, "+ New preset"), suggestions,
          h("span", { class: "code-grow" }),
          h("button", { type: "button", class: "btn", title: "Show all your presets as text you can keep", onclick: () => openExport() }, "Export…"),
          h("button", { type: "button", class: "btn", title: "Add presets from text you exported before", onclick: () => openImport(() => reload()) }, "Import…")),
        ...sections.map(([kind, title, note]) => {
          const of = data.presets.filter((p) => p.kind === kind);
          return h("section", { class: "code-preset-group" }, h("h3", {}, title), h("p", { class: "code-hint" }, note),
            of.length ? of.map((p, k) => card(p, k, of.filter((x) => x.scope === p.scope))) : h("p", { class: "code-hint" }, "None yet. Use \"+ New preset\" or \"Add a suggestion\"."));
        }));
    }
    await reload();
  }

  return { runDefault, runPreset, presetMenu, openPresets, forget: () => roots.clear() };
}
