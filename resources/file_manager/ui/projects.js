// The "Projects" tool: saved workspaces. A project remembers its folders, the view and tool that were open, the saved
// search settings, ignore rules, favorite commands and which database connections it uses. Opening one puts the file
// manager back the way it was; anything that is gone is listed instead of breaking the rest.
// Nothing secret is stored (the server refuses it), and a command is never run: it is typed into the terminal for the
// person to read and press Enter. Commands from an imported file stay untrusted until the person trusts each one.
import { ApiError, call } from "./api.js";
import { openDialog, promptBox, confirmBox } from "./dialogs.js";
import { announce, h } from "./dom.js";
import { fs } from "./findStore.js";
import { pickFolder } from "./findPicker.js";
import { toast } from "./menus.js";
import { goTo, saveSettings } from "./nav.js";
import { currentPath } from "./pane.js";
import { listPowerTabs, registerPowerTab } from "./power.js";
import { state } from "./state.js";
import { terminalAvailable, typeInTerminal } from "./terminal.js";
import { plural } from "./util.js";
import { setWorkspace } from "./workspace.js";

const VIEW_NAMES = { files: "Files", home: "Home", tools: "Tools", split: "Split", dual: "Dual" };
const STATUS_WORDS = { ok: "found", missing: "missing", "not-folder": "not a folder any more", "no-access": "can't be read", unknown: "not checked" };

const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const explain = (err, fallback) => (err instanceof ApiError ? err.message : fallback);

/** A path as one shell word, for typing `cd` into the terminal. */
function quoteForShell(path) {
  return state.platform === "win32" ? `"${path.replace(/"/g, "")}"` : `'${path.replace(/'/g, `'\\''`)}'`;
}

function textArea(value, { rows = 3, label, tip, placeholder = "" }) {
  return h("textarea", { class: "find-input proj-text", rows: String(rows), spellcheck: "false", autocomplete: "off", "aria-label": label, title: tip, placeholder }, value);
}

const toolChoices = () => listPowerTabs().filter((t) => t.id !== "projects");

/** What the file manager looks like right now, as the start of a new project. */
function snapshot() {
  const here = currentPath() || state.home;
  const dual = state.workspace === "dual" && state.settings.dualPath ? [state.settings.dualPath] : [];
  const tool = toolChoices().some((t) => t.id === state.settings.splitTool) ? state.settings.splitTool : "";
  const saved = fs.readForm?.();
  return { name: "", roots: [here], openFolders: [here, ...dual], view: state.workspace === "home" || ((state.workspace === "tools" || state.workspace === "split") && !tool) ? "files" : state.workspace, tool: tool || null, search: saved ?? null, ignore: [], commands: [], tools: [], databases: [] };
}

async function editProject(project, seed) {
  const w = project ?? seed;
  const name = h("input", { type: "text", class: "find-input", value: w.name, spellcheck: "false", "aria-label": "Project name", title: "A name you will recognise" });
  const roots = textArea(w.roots.join("\n"), { label: "Project folders", tip: "The folders this project is about, one per line (full paths).", rows: 3 });
  const open = textArea(w.openFolders.join("\n"), { label: "Folders to open", tip: "Folders to show when you open the project: the first in the file list, the second in the Dual view.", rows: 2 });
  const view = h("select", { class: "find-input", "aria-label": "View", title: "Which view to show when you open the project" }, Object.entries(VIEW_NAMES).map(([v, l]) => h("option", { value: v, selected: v === w.view }, l)));
  const tool = h("select", { class: "find-input", "aria-label": "Tool", title: "The tool to show in the Tools or Split view" }, h("option", { value: "" }, "(none)"), ...toolChoices().map((t) => h("option", { value: t.id, selected: t.id === w.tool }, `${t.icon} ${t.label}`)));
  const ignore = textArea(w.ignore.join("\n"), { label: "Ignore rules", tip: "Things to leave out of searches and folder comparisons, one rule per line, like a .gitignore file (node_modules/, *.log).", rows: 3, placeholder: "node_modules/\n*.log" });
  let search = w.search ?? null;
  const searchNote = h("span", { class: "pw-hint" });
  const paintSearch = () => { searchNote.textContent = search?.pattern || search?.extensions?.length ? `Saved: looks for "${search.pattern}"${search.extensions?.length ? ` in ${search.extensions.join(", ")} files` : ""}.` : "No search settings are saved."; };
  paintSearch();
  const takeSearch = h("button", { type: "button", class: "btn", title: "Copy what is typed in the Find tool into this project", onclick: () => {
    const now = fs.readForm?.();
    if (!now) return toast("Open the Find tool and set up a search first.", { kind: "info" });
    search = now;
    paintSearch();
  } }, "Use the Find tool's settings");
  const dropSearch = h("button", { type: "button", class: "btn", onclick: () => { search = null; paintSearch(); } }, "Forget them");

  const cmdRows = h("div", { class: "proj-commands" });
  const cmds = w.commands.map((c) => ({ ...c }));
  const drawCmds = () => cmdRows.replaceChildren(...cmds.map((c, i) => h("div", { class: "proj-cmd" },
    h("input", { type: "text", class: "find-input", value: c.label, placeholder: "Name", "aria-label": `Name of command ${i + 1}`, oninput: (e) => { c.label = e.target.value; } }),
    h("input", { type: "text", class: "find-input proj-cmd-line", value: c.command, placeholder: "bun test", spellcheck: "false", "aria-label": `Command ${i + 1} (one line)`, title: "One line. It is typed into the terminal for you to run; never run for you. Don't put passwords or tokens in it: use an environment variable like $MY_TOKEN.", oninput: (e) => { c.command = e.target.value; } }),
    h("button", { type: "button", class: "btn", "aria-label": `Remove command ${i + 1}`, onclick: () => { cmds.splice(i, 1); drawCmds(); } }, "Remove"))));
  drawCmds();
  const addCmd = h("button", { type: "button", class: "btn", onclick: () => { cmds.push({ id: undefined, label: "", command: "", cwd: null, trusted: true }); drawCmds(); } }, "Add a command");

  const toolBoxes = toolChoices().map((t) => ({ t, box: h("input", { type: "checkbox", checked: w.tools.includes(t.id) }) }));
  const dbs = h("div", { class: "proj-dbs" }, h("span", { class: "pw-hint" }, "Looking for your saved connections…"));
  const chosenDbs = new Map(w.databases.map((d) => [d.id, d]));
  call("db/shortcuts").then((r) => {
    const list = r.shortcuts ?? [];
    dbs.replaceChildren(...(list.length ? list.map((p) => h("label", { class: "find-check" }, h("input", { type: "checkbox", checked: chosenDbs.has(p.id), onchange: (e) => { e.target.checked ? chosenDbs.set(p.id, { id: p.id, name: p.name, engine: p.engine }) : chosenDbs.delete(p.id); } }), h("span", {}, `${p.icon ?? ""} ${p.name} (${p.label})`)))
      : [h("span", { class: "pw-hint" }, "You have no saved database connections yet. Add them in the Databases tool.")]));
  }).catch(() => dbs.replaceChildren(h("span", { class: "pw-hint" }, "The connections couldn't be listed.")));

  const field = (label, control, hint) => h("label", { class: "pw-field" }, label, control, hint ? h("span", { class: "pw-hint" }, hint) : null);
  const dlg = openDialog({
    title: project ? `Edit the project "${project.name}"` : "Save a project",
    wide: true,
    describe: "A project remembers folders, a view and tool, search settings, ignore rules, commands and database connections. It never stores passwords.",
    body: [
      field("Name", name),
      field("Project folders", roots, "One full path per line."),
      field("Folders to open", open, "The first goes in the file list, the second in the Dual view."),
      h("div", { class: "pw-row" }, field("View", view), field("Tool", tool)),
      field("Ignore rules", ignore, "Used by Compare folders and shown in searches. Same style as a .gitignore file."),
      h("div", { class: "pw-row" }, h("strong", {}, "Search: "), searchNote, takeSearch, dropSearch),
      h("h3", { class: "plan-h" }, "Favorite commands"),
      h("p", { class: "pw-hint" }, "They are never run by themselves. “Put in the terminal” types the command there and you press Enter."),
      cmdRows, addCmd,
      h("h3", { class: "plan-h" }, "Tools this project uses"),
      h("div", { class: "proj-tools" }, toolBoxes.map(({ t, box }) => h("label", { class: "find-check" }, box, h("span", {}, `${t.icon} ${t.label}`)))),
      h("h3", { class: "plan-h" }, "Database connections"),
      h("p", { class: "pw-hint" }, "Only the connection's name is saved here. Its password stays in the system keychain."),
      dbs,
    ],
    buttons: [{ label: "Cancel", value: null }, { label: project ? "Save changes" : "Save project", value: "save", primary: true }],
    initialFocus: name,
  });
  const saveButton = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  return await new Promise((resolve) => {
    saveButton.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      saveButton.disabled = true;
      try {
        const body = {
          ...(project ? { id: project.id } : {}),
          name: name.value, roots: lines(roots.value), openFolders: lines(open.value), view: view.value, tool: tool.value || null,
          search, ignore: lines(ignore.value), commands: cmds.filter((c) => c.command.trim()), tools: toolBoxes.filter(({ box }) => box.checked).map(({ t }) => t.id),
          databases: [...chosenDbs.values()],
        };
        const res = await call("workspace/save", { workspace: body });
        dlg.close("saved");
        resolve(res.workspace);
      } catch (err) {
        dlg.setError(explain(err, "The project couldn't be saved."));
        saveButton.disabled = false;
      }
    }, true);
    dlg.result.then((v) => v !== "saved" && resolve(null));
  });
}

/** Puts a command in the terminal for the person to run. Never presses Enter. */
async function runCommand(w, c) {
  if (!terminalAvailable()) return toast("The terminal isn't available on this system. The command was not copied.", { kind: "error" });
  let trust = c.trusted;
  if (!c.trusted) {
    const choice = await openDialog({
      title: "This command is not trusted yet",
      describe: "Read the command before you let it into the terminal.",
      body: [
        h("p", {}, w.source === "imported" ? "It came from a file you imported, so nobody here has checked it. Read it carefully." : "Its text was changed since you last trusted it."),
        h("pre", { class: "proj-cmd-view" }, c.command),
        c.cwd ? h("p", {}, `It is meant to run in: ${c.cwd}`) : null,
        h("p", { class: "pw-hint" }, "It is only typed into the terminal. Nothing runs until you press Enter there."),
      ],
      buttons: [{ label: "Cancel", value: null }, { label: "Type it, don't trust it", value: "once" }, { label: "Trust it and type it", value: "trust", primary: true }],
    }).result;
    if (!choice) return;
    trust = choice === "trust";
    if (trust) {
      try { await call("workspace/trust", { id: w.id, commandId: c.id, command: c.command, trusted: true }); }
      catch (err) { return toast(explain(err, "The command couldn't be trusted."), { kind: "error" }); }
    }
  }
  const prefix = c.cwd && terminalAvailable() ? `cd ${state.platform === "win32" ? "/d " : ""}${quoteForShell(c.cwd)} && ` : "";
  if (typeInTerminal(`${prefix}${c.command}`)) toast(`Typed into the terminal. Press Enter there to run it.${trust ? "" : " (Not trusted.)"}`, { kind: "info" });
}

async function showExport(w) {
  let res;
  try { res = await call("workspace/export", { id: w.id }); } catch (err) { return toast(explain(err, "That couldn't be exported."), { kind: "error" }); }
  const box = textArea(res.text, { rows: 12, label: "The workspace file", tip: "Read-only copy of the file." });
  box.readOnly = true;
  const dlg = openDialog({
    title: `Share "${w.name}"`,
    wide: true,
    body: [
      h("p", {}, "This file holds the folders, settings and commands of the project, never a password. Folder paths are included, so they may show your user name."),
      box,
    ],
    buttons: [{ label: "Close", value: null }, { label: "Copy", value: "copy" }, { label: "Save as a file…", value: "save", primary: true }],
  });
  const choice = await dlg.result;
  if (choice === "copy") {
    try { await call("copytext", { text: res.text }); toast("Copied.", { kind: "success" }); } catch (err) { toast(explain(err, "It couldn't be copied."), { kind: "error" }); }
  } else if (choice === "save") {
    const folder = await pickFolder({ title: "Save the workspace file in which folder?", start: currentPath() || state.home, confirmLabel: "Save here" });
    if (!folder) return;
    try {
      const saved = await call("workspace/export-save", { id: w.id, folder });
      toast(`Saved ${saved.name}.`, { kind: "success" });
    } catch (err) { toast(explain(err, "It couldn't be saved."), { kind: "error" }); }
  }
}

async function importProject() {
  const box = textArea("", { rows: 10, label: "The workspace file's text", tip: "Paste the text of a .workspace.json file, or press Open a file.", placeholder: "Paste a workspace file here" });
  const picker = h("input", { type: "file", accept: ".json,application/json", hidden: true, "aria-label": "Choose a workspace file", onchange: async (e) => { const file = e.target.files?.[0]; if (file) box.value = await file.text(); } });
  const dlg = openDialog({
    title: "Import a project",
    wide: true,
    body: [
      h("p", {}, "Every command in an imported file starts as untrusted. You read each one and trust it yourself before it can be put in the terminal."),
      box, picker,
      h("button", { type: "button", class: "btn", onclick: () => picker.click() }, "Open a file…"),
    ],
    buttons: [{ label: "Cancel", value: null }, { label: "Import", value: "import", primary: true }],
    initialFocus: box,
  });
  const go = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  return await new Promise((resolve) => {
    go.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      go.disabled = true;
      try {
        const res = await call("workspace/import", { text: box.value });
        dlg.close("done");
        resolve(res);
      } catch (err) {
        dlg.setError(explain(err, "That file couldn't be imported."));
        go.disabled = false;
      }
    }, true);
    dlg.result.then((v) => v !== "done" && resolve(null));
  });
}

registerPowerTab({
  id: "projects", label: "Projects", icon: "📌", tip: "Save a project: its folders, view, search settings, favorite commands and database connections, and open it again in one click",
  mount(root) {
    const status = h("p", { class: "pw-status", role: "status", "aria-live": "polite" });
    const list = h("div", { class: "proj-list" });
    const detail = h("section", { class: "pw-card proj-detail", "aria-label": "Project details", hidden: true });
    let projects = [];
    let readOnly = false;

    const say = (text, bad = false) => { status.textContent = text; status.classList.toggle("pw-bad", bad); if (text) announce(text); };

    async function load() {
      try {
        const res = await call("workspace/list");
        projects = res.workspaces;
        readOnly = res.readOnly;
        say(res.readOnly ? "These projects were saved by a newer version of the app, so they can be read but not changed." : res.skipped ? `${plural(res.skipped, "saved project")} could not be read and was skipped.` : "", res.readOnly);
        paint();
      } catch (err) {
        say(explain(err, "The projects couldn't be loaded."), true);
      }
    }

    function paint() {
      list.replaceChildren(...(projects.length ? projects.map(card) : [h("p", { class: "pw-hint" }, "No projects yet. Press “Save the current layout as a project” to make the first one.")]));
    }

    function card(w) {
      const untrusted = w.commands.filter((c) => !c.trusted).length;
      return h("article", { class: "pw-card proj-card", "aria-label": w.name },
        h("h3", {}, `📌 ${w.name}`, w.source === "imported" ? h("span", { class: "proj-badge", title: "Made from a file you imported" }, "imported") : null),
        h("p", { class: "pw-mono proj-roots" }, w.roots.length ? w.roots.join("   ") : "(no folders)"),
        h("p", { class: "pw-hint" }, [VIEW_NAMES[w.view], w.tool ? `tool: ${w.tool}` : "", plural(w.commands.length, "command"), untrusted ? `${untrusted} untrusted` : "", plural(w.databases.length, "database reference")].filter(Boolean).join("  ·  ")),
        h("div", { class: "pw-row" },
          h("button", { type: "button", class: "pw-btn primary", title: "Go to the project's folders, view and tool", onclick: () => openProject(w) }, "Open"),
          h("button", { type: "button", class: "pw-btn", title: "See what is still there, its commands and what was done in its folders", onclick: () => showDetail(w) }, "Details"),
          h("button", { type: "button", class: "pw-btn", disabled: readOnly, onclick: async () => { const saved = await editProject(w); if (saved) { await load(); showDetail(saved); } } }, "Edit…"),
          h("button", { type: "button", class: "pw-btn", onclick: () => showExport(w) }, "Share…"),
          h("button", { type: "button", class: "pw-btn danger", disabled: readOnly, title: "Forget this project. Your files are not touched.", onclick: () => remove(w) }, "Delete…")));
    }

    async function remove(w) {
      if (!(await confirmBox({ title: `Delete the project "${w.name}"?`, message: "Only the saved project is deleted. Your folders and files are not touched.", confirmLabel: "Delete the project", danger: true }))) return;
      try { await call("workspace/delete", { id: w.id }); detail.hidden = true; detail.replaceChildren(); await load(); } catch (err) { say(explain(err, "It couldn't be deleted."), true); }
    }

    async function showDetail(w) {
      let r;
      try { r = await call("workspace/resolve", { id: w.id }); } catch (err) { return say(explain(err, "The details couldn't be loaded."), true); }
      const known = new Set(listPowerTabs().map((t) => t.id));
      const mark = (s) => h("span", { class: s === "ok" ? "pw-ok" : "pw-bad" }, STATUS_WORDS[s] ?? s);
      const folderList = (items) => items.length ? h("ul", {}, items.map((f) => h("li", {}, h("span", { class: "pw-mono" }, f.path), " — ", mark(f.status)))) : h("p", { class: "pw-hint" }, "None.");
      detail.hidden = false;
      detail.replaceChildren(
        h("h3", {}, `Details of "${r.workspace.name}"`),
        h("h4", {}, "Project folders"), folderList(r.roots),
        h("h4", {}, "Folders that open"), folderList(r.openFolders),
        h("h4", {}, "Tools"), r.workspace.tools.length ? h("ul", {}, r.workspace.tools.map((t) => h("li", {}, t, " — ", mark(known.has(t) ? "ok" : "missing")))) : h("p", { class: "pw-hint" }, "None."),
        h("h4", {}, "Database connections"), r.databases.length ? h("ul", {}, r.databases.map((d) => h("li", {}, `${d.name} (${d.engine || "database"}) — `, mark(d.status === "ok" ? "ok" : d.status === "missing" ? "missing" : "unknown"), d.status === "missing" ? " It was deleted or never made on this computer. Add it in the Databases tool." : ""))) : h("p", { class: "pw-hint" }, "None."),
        h("h4", {}, "Ignore rules"), r.workspace.ignore.length ? h("pre", { class: "proj-cmd-view" }, r.workspace.ignore.join("\n")) : h("p", { class: "pw-hint" }, "None."),
        h("h4", {}, "Commands"), commandList(r.workspace),
        h("h4", {}, "What was copied, moved or renamed here"), r.history.length ? h("ul", {}, r.history.map((e) => h("li", {}, `${e.title} — ${e.state}${e.startedAt ? ` (${new Date(e.startedAt).toLocaleString()})` : ""}`))) : h("p", { class: "pw-hint" }, "Nothing recorded in these folders yet."));
    }

    function commandList(w) {
      if (!w.commands.length) return h("p", { class: "pw-hint" }, "None.");
      return h("ul", { class: "proj-cmds" }, w.commands.map((c) => h("li", {},
        h("strong", {}, c.label), c.trusted ? null : h("span", { class: "proj-badge warn", title: "Nobody here has read this command yet" }, "untrusted"),
        h("pre", { class: "proj-cmd-view" }, c.command), c.cwd ? h("p", { class: "pw-hint" }, `in ${c.cwd}`) : null,
        h("div", { class: "pw-row" },
          h("button", { type: "button", class: "pw-btn", title: "Type it into the terminal. You press Enter to run it.", onclick: () => runCommand(w, c) }, "Put in the terminal"),
          h("button", { type: "button", class: "pw-btn", onclick: async () => { try { await call("copytext", { text: c.command }); toast("Copied.", { kind: "success" }); } catch { toast("It couldn't be copied.", { kind: "error" }); } } }, "Copy")))));
    }

    async function openProject(w) {
      let r;
      try { r = await call("workspace/resolve", { id: w.id }); } catch (err) { return say(explain(err, "The project couldn't be opened."), true); }
      const problems = [];
      const ok = (items) => items.filter((f) => f.status === "ok").map((f) => f.path);
      for (const f of [...r.roots, ...r.openFolders]) if (f.status !== "ok") problems.push(`${f.path} is ${STATUS_WORDS[f.status] ?? f.status}.`);
      const known = new Set(listPowerTabs().map((t) => t.id));
      const tool = r.workspace.tool && known.has(r.workspace.tool) ? r.workspace.tool : null;
      if (r.workspace.tool && !tool) problems.push(`The tool "${r.workspace.tool}" isn't available in this version.`);
      for (const d of r.databases) if (d.status === "missing") problems.push(`The database connection "${d.name}" doesn't exist on this computer.`);
      const folders = ok(r.openFolders.length ? r.openFolders : r.roots);
      const first = folders[0] ?? ok(r.roots)[0];
      if (first) await goTo(first).catch(() => problems.push(`${first} couldn't be opened.`));
      if (folders[1] && r.workspace.view === "dual") await saveSettings({ dualPath: folders[1] }).catch(() => {});
      const view = r.workspace.view === "tools" || r.workspace.view === "split" ? (tool ? r.workspace.view : "files") : r.workspace.view;
      setWorkspace(view, { tool: tool ?? undefined, focus: true });
      const searchable = r.workspace.search && (r.workspace.search.pattern || r.workspace.search.extensions?.length || r.workspace.search.exclude?.length);
      if (searchable && tool === "find") setTimeout(() => fs.applyForm?.(r.workspace.search, ok(r.roots)[0]), 0);
      toast(problems.length ? `Opened "${w.name}" with ${plural(problems.length, "problem")}: ${problems[0]}` : `Opened "${w.name}".`, { kind: problems.length ? "info" : "success" });
      if (problems.length) showDetail(w);
    }

    async function saveCurrent() {
      const name = await promptBox({ title: "Save the current layout as a project", label: "Project name", confirmLabel: "Continue", hint: "You can change the folders, commands and everything else on the next screen.", submit: async (n) => n.trim() });
      if (!name) return;
      const saved = await editProject(null, { ...snapshot(), name });
      if (saved) { await load(); showDetail(saved); }
    }

    async function doImport() {
      const res = await importProject();
      if (!res) return;
      toast(`Imported "${res.workspace.name}".${res.untrustedCommands ? ` Its ${plural(res.untrustedCommands, "command")} must be trusted before use.` : ""}`, { kind: "success" });
      await load();
      showDetail(res.workspace);
    }

    root.append(
      h("section", { class: "pw-card", "aria-label": "Projects" },
        h("h3", {}, "Projects"),
        h("p", { class: "pw-hint" }, "A project is a saved set-up: its folders, the view and tool, search settings, favorite commands and database connections. Open it to get everything back. Passwords and tokens are never saved."),
        h("div", { class: "pw-row" },
          h("button", { type: "button", class: "pw-btn primary", onclick: saveCurrent }, "Save the current layout as a project…"),
          h("button", { type: "button", class: "pw-btn", onclick: doImport }, "Import a project file…"))),
      status, list, detail);
    return { show: () => load() };
  },
});
