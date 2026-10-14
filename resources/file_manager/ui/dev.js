// The "Dev" tool of the Power tools panel: developer information about a folder. Code statistics (a "tokei studio"),
// a project overview, a Git summary, disk usage, TODO markers and the developer tools on this computer. Everything is
// read only. Each section lives in its own dev*.js module; this file owns the folder box and the section tabs.
import { call } from "./api.js";
import { h } from "./dom.js";
import { btn, createStatus, errorText } from "./devCore.js";
import { createDisk } from "./devDisk.js";
import { createEnv } from "./devEnv.js";
import { createGit } from "./devGit.js";
import { createProject } from "./devProject.js";
import { createStats } from "./devStats.js";
import { createTodo } from "./devTodo.js";
import { registerPowerTab } from "./power.js";
import { currentPath, state } from "./state.js";

const SECTIONS = [
  { id: "stats", label: "Code stats", tip: "Lines of code, comments and blanks per language (tokei studio)", make: createStats },
  { id: "project", label: "Project", tip: "What kind of project this is: scripts, dependencies, license, CI", make: createProject },
  { id: "git", label: "Git", tip: "Branch, history, contributors and activity", make: createGit },
  { id: "disk", label: "Disk & files", tip: "Where the space goes, heavy folders, duplicates", make: createDisk },
  { id: "todo", label: "TODO", tip: "TODO, FIXME and other markers in your code", make: createTodo },
  { id: "tools", label: "Tools", tip: "Developer programs installed on this computer", make: createEnv },
];

function mount(root) {
  root.classList.add("dev-pane");
  let autoRoot = "";
  let active = "stats";
  const built = new Map();
  const status = createStatus();

  const rootInput = h("input", {
    type: "text", id: "dev-root", class: "dev-root", spellcheck: "false", autocomplete: "off", placeholder: "/path/to/project",
    title: "The folder to look at. Type a location (like ~/projects/app) or use the buttons. Nothing in it is changed.",
  });
  const env = { getRoot: () => rootInput.value.trim() };

  async function normalise() {
    const text = rootInput.value.trim();
    if (!text) return;
    try {
      const res = await call("typedpath", { text, cwd: currentPath() || state.home });
      if (!res.exists || !res.isDir) return status.set(`“${text}” isn't a folder that exists.`, true);
      rootInput.value = res.path;
      status.set("");
    } catch (err) {
      status.set(errorText(err, "That location isn't valid."), true);
    }
  }

  function useFolder(path) {
    if (!path) return status.set("There is no folder to use yet. Open a folder in the file list first.", true);
    rootInput.value = path;
    status.set("");
    autoRoot = path;
  }

  function selectedFolder() {
    const picked = state.entries.filter((e) => state.selection.has(e.path) && e.isDir);
    return picked.length === 1 ? picked[0].path : "";
  }

  const tablist = h("div", { class: "dev-tabs", role: "tablist", "aria-label": "Developer information" });
  const panels = h("div", { class: "dev-panels" });
  const tabButtons = new Map();

  function section(id) {
    let s = built.get(id);
    if (!s) {
      const def = SECTIONS.find((x) => x.id === id);
      s = def.make(env);
      s.panel = h("div", { class: "dev-panel", role: "tabpanel", id: `dev-panel-${id}`, "aria-labelledby": `dev-tab-${id}`, hidden: true }, s.el);
      panels.append(s.panel);
      built.set(id, s);
    }
    return s;
  }

  function select(id, { focus = false } = {}) {
    active = id;
    for (const [tid, b] of tabButtons) {
      b.setAttribute("aria-selected", String(tid === id));
      b.tabIndex = tid === id ? 0 : -1;
      b.classList.toggle("active", tid === id);
    }
    for (const s of built.values()) s.panel.hidden = true;
    const s = section(id);
    s.panel.hidden = false;
    s.show?.();
    if (focus) tabButtons.get(id).focus();
  }

  for (const def of SECTIONS) {
    const b = h("button", { type: "button", role: "tab", id: `dev-tab-${def.id}`, class: "dev-tab", "aria-selected": "false", "aria-controls": `dev-panel-${def.id}`, tabindex: "-1", title: `${def.label}: ${def.tip}`, onclick: () => select(def.id) }, def.label);
    tabButtons.set(def.id, b);
    tablist.append(b);
  }
  tablist.addEventListener("keydown", (e) => {
    const i = SECTIONS.findIndex((s) => s.id === active);
    const next = e.key === "ArrowRight" ? (i + 1) % SECTIONS.length : e.key === "ArrowLeft" ? (i + SECTIONS.length - 1) % SECTIONS.length : e.key === "Home" ? 0 : e.key === "End" ? SECTIONS.length - 1 : -1;
    if (next >= 0) {
      e.preventDefault();
      select(SECTIONS[next].id, { focus: true });
    }
  });
  rootInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    await normalise();
    const s = section(active);
    (s.start ?? s.load)?.call(s);
  });
  rootInput.addEventListener("change", normalise);

  root.append(
    h("div", { class: "pw-card dev-target" },
      h("h3", {}, "Developer information"),
      h("div", { class: "pw-row" },
        h("label", { class: "pw-field dev-root-field" }, "Folder to look at", rootInput),
        btn("Use current folder", "Look at the folder the file list is showing now.", () => useFolder(currentPath())),
        btn("Use selected folder", "Look at the folder that is selected in the file list.", () => useFolder(selectedFolder()))),
      status.el),
    tablist, panels);

  return {
    show(opts) {
      if (typeof opts?.root === "string" && opts.root) {
        useFolder(opts.root);
        autoRoot = opts.root;
      } else if (!rootInput.value || rootInput.value === autoRoot) {
        autoRoot = currentPath() || state.home || "";
        rootInput.value = autoRoot;
      }
      const wanted = SECTIONS.some((s) => s.id === opts?.section) ? opts.section : active;
      select(wanted);
      if (opts?.root && opts.run !== false) {
        const s = section(wanted);
        (s.start ?? s.load)?.call(s);
      }
    },
    hide() {},
  };
}

registerPowerTab({ id: "dev", label: "Dev", icon: "🧑‍💻", tip: "Developer information about a folder: lines of code (tokei studio), project, Git, disk, TODO markers", group: "files", mount });
