// Built-in RAD Studio CLI Utilities tool: browse all command-line utilities, jump to the built-in cli_utils folder,
// or launch any utility in the built-in Terminal via ./<name>.
import { ApiError, call } from "./api.js";
import { announce, h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo } from "./nav.js";
import { openPower, registerPowerTab } from "./power.js";
import { emit, on, state } from "./state.js";
import { plural } from "./util.js";
import { setWorkspace } from "./workspace.js";

function mount(root) {
  let tools = [];
  let folder = state.cliUtilsDir || "";
  let sourceFolder = state.cliAppsDir || "";
  let selectedCategory = "All";
  let loaded = false;

  const status = h("p", { class: "pw-status", role: "status", "aria-live": "polite" });
  const folderCode = h("code", { class: "pw-mono" }, folder || "~/.bun_rad_studio/cli_utils");
  const filterInput = h("input", {
    type: "search",
    class: "find-input",
    placeholder: "Search CLI utilities by name, command or description…",
    "aria-label": "Search CLI utilities",
    spellcheck: "false",
    autocomplete: "off",
    oninput: () => renderList(),
  });
  const argsInput = h("input", {
    type: "text",
    class: "find-input pw-mono",
    placeholder: "Optional arguments (e.g. --help or flags)…",
    "aria-label": "Optional arguments for ./command",
    spellcheck: "false",
    autocomplete: "off",
  });
  const categoryBar = h("div", { class: "pw-row" });
  const listWrap = h("div", { class: "cliutils-list" });

  function say(text, isErr = false) {
    status.textContent = text;
    status.classList.toggle("pw-err", isErr);
    if (text) announce(text);
  }

  function buildCmd(baseCommand, extraArgs = "") {
    const trimmed = extraArgs.trim();
    return trimmed ? `${baseCommand} ${trimmed}` : baseCommand;
  }

  function openFolderInFiles(target) {
    if (!target) return toast("The folder path isn't available yet.", { kind: "info" });
    setWorkspace("files");
    goTo(target);
  }

  function openTerminalInCliFolder() {
    const target = folder || state.cliUtilsDir;
    if (!target) return toast("The CLI utilities folder isn't ready yet.", { kind: "error" });
    setWorkspace("files");
    goTo(target);
    emit("terminal-here", target);
    toast("Terminal opened in CLI Utilities. Run ./<tool-name> directly.", { kind: "info" });
  }

  function sendToolToTerminal(tool, { submit = false, forceArgs = null } = {}) {
    const target = folder || state.cliUtilsDir;
    if (!target) return toast("The CLI utilities folder isn't ready yet.", { kind: "error" });
    const rawArgs = forceArgs !== null ? forceArgs : argsInput.value;
    if (/[\r\n\0]/.test(rawArgs)) return toast("Arguments cannot contain line breaks.", { kind: "error" });
    const cmd = buildCmd(tool.command, rawArgs) + (submit ? "" : rawArgs.trim() ? " " : " ");
    emit("terminal-run-in", { folder: target, command: cmd, submit });
    toast(
      submit ? `Running ${cmd.trim()} in Terminal…` : `Ready in Terminal: ${cmd.trim()} (press Enter to run)`,
      { kind: "info" },
    );
  }

  async function copyCommand(text) {
    try {
      await call("copytext", { text });
      toast(`Copied: ${text}`, { kind: "success" });
    } catch {
      toast("Couldn't copy to clipboard.", { kind: "error" });
    }
  }

  function renderCategories() {
    const cats = ["All", ...new Set(tools.map((t) => t.category))];
    categoryBar.replaceChildren(
      ...cats.map((cat) =>
        h(
          "button",
          {
            type: "button",
            class: `pw-btn${selectedCategory === cat ? " primary" : ""}`,
            "aria-pressed": String(selectedCategory === cat),
            onclick: () => {
              selectedCategory = cat;
              renderCategories();
              renderList();
            },
          },
          cat,
        ),
      ),
    );
  }

  function renderRow(tool) {
    const bothNames = tool.id !== tool.stem ? `${tool.command}  (${tool.stemCommand})` : tool.command;
    return h(
      "article",
      { class: "pw-card cliutil-card", dataset: { toolId: tool.id }, "aria-label": tool.id },
      h(
        "div",
        { class: "pw-row" },
        h("strong", { class: "pw-mono" }, bothNames),
        h("span", { class: "code-badge code-badge-quiet" }, tool.category),
        h("span", { class: "pw-hint" }, tool.suiteName),
      ),
      h("p", { class: "pw-hint" }, tool.description),
      h(
        "div",
        { class: "pw-row" },
        h(
          "button",
          {
            type: "button",
            class: "pw-btn primary",
            title: `Open the Terminal in CLI Utilities and type ${tool.command} on the prompt`,
            onclick: () => sendToolToTerminal(tool, { submit: false }),
          },
          `⌨️ ${tool.command}`,
        ),
        h(
          "button",
          {
            type: "button",
            class: "pw-btn",
            title: `Run ${tool.command} immediately in the Terminal`,
            onclick: () => sendToolToTerminal(tool, { submit: true }),
          },
          "▶ Run",
        ),
        h(
          "button",
          {
            type: "button",
            class: "pw-btn",
            title: `Run ${tool.command} --help in the Terminal`,
            onclick: () => sendToolToTerminal(tool, { submit: true, forceArgs: "--help" }),
          },
          "❓ --help",
        ),
        h(
          "button",
          {
            type: "button",
            class: "pw-btn",
            title: `Copy ${tool.command} to the clipboard`,
            onclick: () => copyCommand(buildCmd(tool.command, argsInput.value)),
          },
          "📋 Copy",
        ),
      ),
    );
  }

  function renderList() {
    const q = filterInput.value.trim().toLowerCase();
    const filtered = tools.filter((t) => {
      if (selectedCategory !== "All" && t.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        t.stem.toLowerCase().includes(q) ||
        t.suiteName.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
    say(`${plural(filtered.length, "CLI utility")} shown (of ${tools.length} built-in utilities).`);
    if (!filtered.length) {
      listWrap.replaceChildren(h("p", { class: "pw-hint" }, "No CLI utilities match that filter."));
      return;
    }
    listWrap.replaceChildren(...filtered.map(renderRow));
  }

  async function load(force = false) {
    say(force ? "Rebuilding CLI utility wrappers…" : "Loading built-in CLI utilities…");
    try {
      const res = await call(force ? "cliutils/ensure" : "cliutils/list", force ? { force: true } : {});
      tools = res.tools ?? [];
      folder = res.folder || state.cliUtilsDir || "";
      sourceFolder = res.sourceFolder || state.cliAppsDir || "";
      if (folder) state.cliUtilsDir = folder;
      if (sourceFolder) state.cliAppsDir = sourceFolder;
      folderCode.textContent = folder;
      loaded = true;
      renderCategories();
      renderList();
      if (force) toast(`Synced ${plural(tools.length, "CLI utility wrapper")} in ${folder}.`, { kind: "success" });
    } catch (err) {
      say(err instanceof ApiError ? err.message : "Couldn't load the built-in CLI utilities.", true);
    }
  }

  const headCard = h(
    "section",
    { class: "pw-card", "aria-label": "Built-in CLI Utilities" },
    h("h3", {}, "🛠️ Built-in RAD Studio CLI Utilities"),
    h(
      "p",
      { class: "pw-hint" },
      "Every RAD Studio CLI utility is ready to run as ",
      h("code", {}, "./<name>"),
      " or ",
      h("code", {}, "./<name>_cli"),
      " inside the built-in CLI Utilities folder, and is also added to the built-in Terminal's PATH.",
    ),
    h("p", { class: "pw-hint" }, "Folder: ", folderCode),
    h(
      "div",
      { class: "pw-row" },
      h(
        "button",
        {
          type: "button",
          class: "pw-btn primary",
          title: "Open the CLI Utilities folder in the File Manager and open the Terminal there so you can type ./tool-name",
          onclick: openTerminalInCliFolder,
        },
        "⌨️ Open Terminal in CLI Utilities (./)",
      ),
      h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          title: "Browse the built-in CLI Utilities folder in the File Manager",
          onclick: () => openFolderInFiles(folder || state.cliUtilsDir),
        },
        "📁 Open CLI Utilities folder",
      ),
      h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          title: "Browse the cli_apps/*.ts TypeScript source scripts in the File Manager",
          onclick: () => openFolderInFiles(sourceFolder || state.cliAppsDir),
        },
        "📂 Open cli_apps source",
      ),
      h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          title: "Re-sync all executable wrappers in the CLI Utilities folder",
          onclick: () => load(true),
        },
        "↻ Rebuild wrappers",
      ),
    ),
    h("div", { class: "pw-row" }, filterInput, argsInput),
    categoryBar,
  );

  root.append(headCard, status, listWrap);

  return {
    show() {
      if (!loaded) load(false);
    },
  };
}

on("open-cliutils-tool", () => openPower("cliutils"));

registerPowerTab({
  id: "cliutils",
  label: "CLI Utilities",
  icon: "🛠️",
  tip: "Built-in RAD Studio command-line utilities: open the CLI utilities folder or run ./tool-name in the terminal",
  group: "automate",
  mount,
});
