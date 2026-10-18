// "Open with": choose which program opens a file, add your own programs, and remember the choice per file type.
// Everything is saved on the computer by the server (file_manager_openwith.json), so it is still there next time.
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { toast } from "./menus.js";
import { selectedEntries } from "./selection.js";
import { askOpenAnyway, skipMismatchGuard } from "./typecheck.js";
import { extensionOf, plural } from "./util.js";

const MAX_PATHS = 20;

/** Built-in programs are carried out by the page itself (for example the code editor). */
const builtinOpeners = new Map();

/** Lets another part of the page handle a built-in program id such as "code". `fn(path)` opens the file. */
export function registerOpener(id, fn) {
  builtinOpeners.set(id, fn);
}

/** Runs what the server answered for an open: a built-in program is finished here. Returns true when it handled it. */
export function finishOpen(result, path) {
  if (!result?.builtin) return false;
  const opener = builtinOpeners.get(result.builtin);
  if (!opener) toast(`${result.with} isn't available in this window.`, { kind: "error" });
  else opener(path);
  return true;
}

function slug(name, taken) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "program";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Opens the Open with window for the selected files (or the given entries). */
export async function showOpenWith(entries = selectedEntries()) {
  const files = entries.filter((e) => !e.isDir);
  if (!files.length) return toast("Choose a file first. Open with works on files.", { kind: "info" });
  if (files.length > MAX_PATHS) return toast(`Choose ${MAX_PATHS} files or fewer.`, { kind: "info" });
  const paths = files.map((f) => f.path);
  const ext = files.every((f) => extensionOf(f.name) === extensionOf(files[0].name)) ? extensionOf(files[0].name) : "";
  const body = h("div", { class: "ow-box" }, h("p", { class: "hint" }, "Looking for programs…"));
  const dlg = openDialog({
    title: files.length === 1 ? `Open "${files[0].name}" with` : `Open ${plural(files.length, "file")} with`,
    body, wide: true, buttons: [{ label: "Close", primary: true, value: null }],
    describe: "Choose a program to open the selected files, or add your own program.",
  });
  let data = null;
  const always = h("input", { type: "checkbox", id: "ow-always", title: "Next time, opening this kind of file (double-click or Enter) uses the program you pick now. You can undo this under Your choices below." });

  async function reload() {
    try {
      data = await call("openwith/list", { path: paths[0] });
      render();
    } catch (err) {
      dlg.setError(err instanceof ApiError ? err.message : "Couldn't load your programs.");
    }
  }

  async function save(programs, associations) {
    await call("openwith/save", { programs, associations, confirm: true });
    await reload();
  }

  async function run(programId, add, mismatchOk = false) {
    dlg.setError("");
    try {
      if (add) {
        const programs = [...data.programs, add];
        await save(programs, data.associations);
        programId = add.id;
      }
      const confirmMismatch = mismatchOk || skipMismatchGuard();
      if (programId === "default") {
        if (always.checked && ext) await save(data.programs, { ...data.associations, [ext]: "default" });
        for (const p of paths) await call("open", { path: p, ignoreAssociation: true, confirmMismatch });
        dlg.close();
        return;
      }
      const res = await call("openwith/run", { paths, programId, always: always.checked && !!ext, confirmMismatch });
      dlg.close();
      if (!finishOpen(res, paths[0])) toast(`Opened with ${res.with}.`, { kind: "success" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "TYPE_MISMATCH") {
        if (await askOpenAnyway(paths[0], err)) await run(programId, null, true);
        return;
      }
      dlg.setError(err instanceof ApiError ? err.message : "That didn't open.");
    }
  }

  const choice = (label, hint, onclick, tip) => h("button", { type: "button", class: "act-btn", title: tip ?? hint, onclick },
    h("span", { class: "act-label" }, label), h("span", { class: "act-hint" }, hint));

  function addForm() {
    const name = h("input", { type: "text", id: "ow-name", class: "ow-input", placeholder: "Name, like My Editor", "aria-label": "Name of the program", title: "A name you will recognize in this list", autocomplete: "off" });
    const kind = h("select", { id: "ow-kind", class: "ow-input", "aria-label": "Kind of program", title: "A program is a command or the full path of a program file. A Mac application is the name of an app in your Applications folder." },
      data.platform === "darwin" ? h("option", { value: "app" }, "Mac application") : null,
      h("option", { value: "command" }, "Program or command"));
    const target = h("input", { type: "text", id: "ow-target", class: "ow-input", placeholder: data.platform === "darwin" ? "Application name, like TextEdit (or a command if you chose Program)" : "Program, like code or C:\\Tools\\editor.exe", "aria-label": "Program name or path", title: "Type the program's name (if it works in a terminal) or its full location", autocomplete: "off", spellcheck: "false" });
    const args = h("input", { type: "text", id: "ow-args", class: "ow-input", placeholder: "Extra options (optional), like --reuse-window", "aria-label": "Extra options", title: "Words added before the file name. Separate them with spaces. Leave empty if you don't need any.", autocomplete: "off", spellcheck: "false" });
    const add = h("button", { type: "button", class: "btn primary", title: "Save this program in your list and open the file with it", onclick: () => {
      const n = name.value.trim();
      const t = target.value.trim();
      if (!n || !t) return dlg.setError("Give the program a name and tell me where it is.");
      const taken = new Set(data.programs.map((p) => p.id));
      run(null, { id: slug(n, taken), name: n, kind: kind.value, target: t, args: args.value.trim() ? args.value.trim().split(/\s+/) : [] });
    } }, "Add and open");
    return h("section", { class: "tool-block" }, h("h3", {}, "Add a program"),
      h("p", { class: "hint" }, "Adding a program lets this window start it to open your files. Only add programs you trust."),
      h("div", { class: "ow-form" }, name, kind, target, args, add));
  }

  function render() {
    clear(body);
    const items = [choice("System default", "The program your computer normally uses for this file", () => run("default"))];
    for (const b of data.builtin) items.push(choice(b.name, "Opens inside this window", () => run(b.id)));
    for (const p of data.programs) {
      items.push(h("div", { class: "ow-row" },
        choice(p.name, p.kind === "app" ? "Mac application" : p.target, () => run(p.id)),
        h("button", { type: "button", class: "btn", title: `Take ${p.name} out of your list`, "aria-label": `Remove ${p.name} from the list`, onclick: async () => {
          try { await save(data.programs.filter((q) => q.id !== p.id), data.associations); } catch (err) { dlg.setError(err instanceof ApiError ? err.message : "Couldn't remove that."); }
        } }, "Remove")));
    }
    body.append(h("div", { class: "act-list" }, items));
    if (ext) {
      body.append(h("p", { class: "ow-always" }, always, h("label", { for: "ow-always" }, ` Always open .${ext} files with the program I choose`)));
    }
    const found = data.suggestions.filter((s) => !data.programs.some((p) => p.target === s.target));
    if (found.length) {
      body.append(h("section", { class: "tool-block" }, h("h3", {}, "Programs found on this computer"),
        h("div", { class: "ow-found" }, found.slice(0, 60).map((s) => h("button", { type: "button", class: "btn", title: `Add ${s.name} to your list and open the file with it`, onclick: () => {
          const taken = new Set(data.programs.map((p) => p.id));
          run(null, { id: slug(s.name, taken), name: s.name, kind: s.kind, target: s.target, args: [] });
        } }, s.name)))));
    }
    body.append(addForm());
    const mine = Object.entries(data.associations);
    if (mine.length) {
      const nameOf = (id) => (id === "default" ? "System default" : [...data.builtin, ...data.programs].find((p) => p.id === id)?.name ?? id);
      body.append(h("section", { class: "tool-block" }, h("h3", {}, "Your choices"),
        h("p", { class: "hint" }, "These file types open with the program you chose."),
        mine.map(([e, id]) => h("div", { class: "ow-assoc" }, h("span", {}, `.${e} → ${nameOf(id)}`),
          h("button", { type: "button", class: "btn", title: `Go back to the normal program for .${e} files`, "aria-label": `Reset .${e} files`, onclick: async () => {
            const next = { ...data.associations };
            delete next[e];
            try { await save(data.programs, next); } catch (err) { dlg.setError(err instanceof ApiError ? err.message : "Couldn't change that."); }
          } }, "Reset")))));
    }
  }

  await reload();
}
