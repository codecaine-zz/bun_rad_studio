// Built-in RAD Studio CLI Utilities tool: browse all command-line utilities, jump to the built-in cli_utils folder,
// execute utilities inline in the Quick Runner Console, or launch any utility in the built-in Terminal via ./<name>.
import { ApiError, call } from "./api.js";
import { announce, h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo, refresh } from "./nav.js";
import { openPower, registerPowerTab } from "./power.js";
import { emit, on, state } from "./state.js";
import { plural } from "./util.js";
import { setWorkspace } from "./workspace.js";

const PINNED_STORAGE_KEY = "fm.cliutils.pinned";

function loadPinnedSet() {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PINNED_STORAGE_KEY) : null;
    if (!raw) return new Set(["calc", "fd", "rg", "tokei", "jq", "sqlite"]);
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set(["calc", "fd", "rg", "tokei", "jq", "sqlite"]);
  }
}

function savePinnedSet(set) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([...set]));
    }
  } catch {}
}

function quoteCliArg(value) {
  const s = String(value ?? "");
  if (!s) return '""';
  return /[\s"'\\]/.test(s) ? `"${s.replace(/["\\]/g, "\\$&")}"` : s;
}

function mount(root) {
  let tools = [];
  let folder = state.cliUtilsDir || "";
  let sourceFolder = state.cliAppsDir || "";
  let selectedCategory = "All";
  let cwdMode = "current"; // "current" | "cli_utils"
  let loaded = false;
  let pendingShowOpts = null;
  let lastRun = null;
  let runningToolId = "";
  const pinned = loadPinnedSet();

  const status = h("p", { class: "pw-status", role: "status", "aria-live": "polite" });
  const folderCode = h("code", { class: "pw-mono" }, folder || "~/.bun_rad_studio/cli_utils");
  const filterInput = h("input", {
    type: "search",
    class: "find-input",
    placeholder: "Search CLI utilities by name, flag, command or description…",
    "aria-label": "Search CLI utilities",
    spellcheck: "false",
    autocomplete: "off",
    oninput: () => renderList(),
  });
  const argsInput = h("input", {
    type: "text",
    class: "find-input pw-mono",
    placeholder: "Optional arguments (e.g. --help, flags, or file paths)…",
    "aria-label": "Optional arguments for ./command",
    spellcheck: "false",
    autocomplete: "off",
    onkeydown: (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const targetTool =
          (lastRun?.tool && tools.find((t) => t.id === lastRun.tool.id)) || getFilteredTools()[0];
        if (targetTool) void quickRunTool(targetTool);
      }
    },
  });
  const cwdToggleBtn = h(
    "button",
    {
      type: "button",
      class: "pw-btn",
      title: "Switch working directory for Quick Run between the current File Manager folder and cli_utils",
      onclick: () => {
        cwdMode = cwdMode === "current" ? "cli_utils" : "current";
        syncCwdButton();
      },
    },
    "📂 CWD: Active Folder",
  );
  const categoryBar = h("div", { class: "pw-row" });
  const runnerWrap = h("div", { class: "cliutil-runner-wrap" });
  const listWrap = h("div", { class: "cliutils-list" });

  function syncCwdButton() {
    const activePath = state.path || folder || state.cliUtilsDir || "";
    if (cwdMode === "current" && state.path) {
      cwdToggleBtn.textContent = "📂 CWD: Active Folder";
      cwdToggleBtn.title = `Quick Run executes inside current folder: ${activePath}`;
    } else {
      cwdToggleBtn.textContent = "🛠️ CWD: cli_utils";
      cwdToggleBtn.title = `Quick Run executes inside CLI Utilities folder: ${folder || state.cliUtilsDir}`;
    }
  }

  function say(text, isErr = false) {
    status.textContent = text;
    status.classList.toggle("pw-err", isErr);
    if (text) announce(text);
  }

  function buildCmd(baseCommand, extraArgs = "") {
    const trimmed = extraArgs.trim();
    return trimmed ? `${baseCommand} ${trimmed}` : baseCommand;
  }

  function appendArgTokens(tokens) {
    const formatted = tokens.map(quoteCliArg).filter(Boolean).join(" ");
    if (!formatted) return;
    const cur = argsInput.value.trim();
    argsInput.value = cur ? `${cur} ${formatted}` : formatted;
    argsInput.focus();
  }

  function insertSelectedPaths() {
    const selected = [...(state.selected ?? [])];
    if (!selected.length) {
      toast("Select one or more files in the File Manager first.", { kind: "info" });
      return;
    }
    appendArgTokens(selected);
    toast(`Inserted ${plural(selected.length, "selected path")} into arguments.`, { kind: "info" });
  }

  function insertCurrentFolder() {
    const target = state.path || folder || state.cliUtilsDir;
    if (!target) {
      toast("No active folder is open yet.", { kind: "info" });
      return;
    }
    appendArgTokens([target]);
    toast("Inserted current folder path into arguments.", { kind: "info" });
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

  async function saveOutputToFile() {
    if (!lastRun || !lastRun.cleanOutput) {
      toast("No CLI output to save yet.", { kind: "info" });
      return;
    }
    const parent = state.path || folder || state.cliUtilsDir;
    if (!parent) {
      toast("No target folder available to save output.", { kind: "error" });
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `${lastRun.tool.id}-output-${stamp}.txt`;
    try {
      const created = await call("newfile", {
        parent,
        name: fileName,
        content: lastRun.cleanOutput.slice(0, 250_000),
      });
      toast(`Saved CLI output to ${created.name}`, { kind: "success" });
      if (state.path === parent) void refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save output to file.", { kind: "error" });
    }
  }

  function renderRunnerConsole() {
    if (!lastRun && !runningToolId) {
      runnerWrap.replaceChildren();
      return;
    }
    if (runningToolId && !lastRun) {
      runnerWrap.replaceChildren(
        h(
          "section",
          { class: "pw-card cliutil-runner-card", "aria-label": "CLI Quick Runner Console" },
          h("div", { class: "pw-row" }, h("strong", {}, `⚡ Running ./${runningToolId}…`)),
        ),
      );
      return;
    }

    const r = lastRun;
    const isOk = r.ok && r.exitCode === 0;
    const badgeText = r.timedOut ? "⏱ Timed out" : isOk ? "✓ Exit 0" : `✗ Exit ${r.exitCode}`;
    const outputText = (r.cleanOutput || r.output || "").trim() || "(Command completed with no stdout/stderr output)";

    runnerWrap.replaceChildren(
      h(
        "section",
        { class: "pw-card cliutil-runner-card", "aria-label": "CLI Quick Runner Console" },
        h(
          "div",
          { class: "pw-row cliutil-card-head" },
          h(
            "div",
            { class: "cliutil-title-wrap" },
            h("strong", {}, `${r.tool.icon || "⚡"} Quick Runner Console`),
            h("code", { class: "pw-mono" }, r.command),
            h("span", { class: `cliutil-exit-badge ${isOk ? "ok" : "err"}` }, badgeText),
            h("span", { class: "code-badge code-badge-quiet" }, `${r.durationMs} ms`),
          ),
          h(
            "div",
            { class: "pw-row" },
            h(
              "button",
              {
                type: "button",
                class: "pw-btn primary",
                disabled: Boolean(runningToolId),
                title: "Re-run this command with current arguments",
                onclick: () => void quickRunTool(r.tool),
              },
              runningToolId ? "⏳ Running…" : "↻ Re-run",
            ),
            h(
              "button",
              {
                type: "button",
                class: "pw-btn",
                title: "Run this command inside the interactive Terminal",
                onclick: () => sendToolToTerminal(r.tool, { submit: true }),
              },
              "⌨️ Run in Terminal",
            ),
            h(
              "button",
              {
                type: "button",
                class: "pw-btn",
                title: "Copy plain-text CLI output to clipboard",
                onclick: () => copyCommand(r.cleanOutput || r.output || ""),
              },
              "📋 Copy output",
            ),
            h(
              "button",
              {
                type: "button",
                class: "pw-btn",
                title: "Save CLI output as a .txt file in the active folder",
                onclick: () => void saveOutputToFile(),
              },
              "💾 Save to file",
            ),
            h(
              "button",
              {
                type: "button",
                class: "pw-btn",
                title: "Clear the Quick Runner Console",
                onclick: () => {
                  lastRun = null;
                  renderRunnerConsole();
                },
              },
              "✕ Clear",
            ),
          ),
        ),
        h("p", { class: "pw-hint" }, "Working directory: ", h("code", { class: "pw-mono" }, r.cwd)),
        h("pre", { class: "pw-out cliutil-console-out", tabindex: "0" }, outputText),
      ),
    );
  }

  async function quickRunTool(tool, overrideArgs = null) {
    if (overrideArgs !== null) {
      argsInput.value = overrideArgs;
    }
    const rawArgs = argsInput.value;
    if (/[\r\n\0]/.test(rawArgs)) {
      toast("Arguments cannot contain line breaks.", { kind: "error" });
      return;
    }
    const targetCwd =
      cwdMode === "current" && state.path ? state.path : folder || state.cliUtilsDir || "";
    runningToolId = tool.id;
    renderRunnerConsole();
    say(`Running ${buildCmd(tool.command, rawArgs)}…`);
    try {
      const res = await call("cliutils/run", {
        tool: tool.id,
        args: rawArgs,
        cwd: targetCwd || undefined,
      });
      lastRun = res;
      runningToolId = "";
      renderRunnerConsole();
      say(
        `${res.command} finished with exit code ${res.exitCode} in ${res.durationMs} ms.`,
        !res.ok,
      );
    } catch (err) {
      runningToolId = "";
      renderRunnerConsole();
      const msg = err instanceof ApiError ? err.message : "Couldn't run CLI utility.";
      say(msg, true);
      toast(msg, { kind: "error" });
    }
  }

  function togglePin(toolId) {
    if (pinned.has(toolId)) pinned.delete(toolId);
    else pinned.add(toolId);
    savePinnedSet(pinned);
    renderCategories();
    renderList();
  }

  function renderCategories() {
    const counts = new Map();
    for (const t of tools) {
      counts.set(t.category, (counts.get(t.category) || 0) + 1);
    }
    const pinnedCount = tools.filter((t) => pinned.has(t.id)).length;
    const cats = [
      { id: "All", label: `All (${tools.length})` },
      ...(pinnedCount > 0 ? [{ id: "Pinned", label: `⭐ Pinned (${pinnedCount})` }] : []),
      ...[...counts.entries()].map(([cat, count]) => ({ id: cat, label: `${cat} (${count})` })),
    ];
    if (selectedCategory === "Pinned" && pinnedCount === 0) {
      selectedCategory = "All";
    }
    categoryBar.replaceChildren(
      ...cats.map((c) =>
        h(
          "button",
          {
            type: "button",
            class: `pw-btn${selectedCategory === c.id ? " primary" : ""}`,
            "aria-pressed": String(selectedCategory === c.id),
            onclick: () => {
              selectedCategory = c.id;
              renderCategories();
              renderList();
            },
          },
          c.label,
        ),
      ),
    );
  }

  function renderRow(tool) {
    const bothNames = tool.id !== tool.stem ? `${tool.command}  (${tool.stemCommand})` : tool.command;
    const isFav = pinned.has(tool.id);
    const flags = Array.isArray(tool.flags) ? tool.flags : [];
    const examples = Array.isArray(tool.examples) ? tool.examples : [];

    return h(
      "article",
      {
        class: `pw-card cliutil-card${isFav ? " is-pinned" : ""}`,
        dataset: { toolId: tool.id },
        "aria-label": tool.id,
      },
      h(
        "div",
        { class: "pw-row cliutil-card-head" },
        h(
          "div",
          { class: "cliutil-title-wrap" },
          h("span", { class: "cliutil-icon", "aria-hidden": "true" }, tool.icon || "🛠️"),
          h("strong", { class: "pw-mono" }, bothNames),
          h("span", { class: "code-badge code-badge-quiet" }, tool.category),
          h("span", { class: "pw-hint" }, tool.suiteName),
        ),
        h(
          "button",
          {
            type: "button",
            class: `cliutil-fav-btn${isFav ? " is-fav" : ""}`,
            "aria-pressed": String(isFav),
            title: isFav ? `Unpin ${tool.id}` : `Pin ${tool.id} to top of list`,
            onclick: () => togglePin(tool.id),
          },
          isFav ? "★ Pinned" : "☆ Pin",
        ),
      ),
      h("p", { class: "pw-hint" }, tool.description),
      flags.length > 0
        ? h(
            "div",
            { class: "cliutil-meta-row", "aria-label": "Supported flags" },
            ...flags.slice(0, 5).map((f) => {
              const flagSyntax = f.short ? `--${f.name} (-${f.short})` : `--${f.name}`;
              return h(
                "button",
                {
                  type: "button",
                  class: "cliutil-flag-pill pw-mono",
                  title: `${f.description} — click to insert --${f.name}`,
                  onclick: () => {
                    const snippet =
                      f.type === "bool"
                        ? `--${f.name}`
                        : `--${f.name} ${quoteCliArg(f.defaultValue ?? "")}`;
                    const cur = argsInput.value.trim();
                    argsInput.value = cur ? `${cur} ${snippet}` : snippet;
                    argsInput.focus();
                  },
                },
                flagSyntax,
              );
            }),
          )
        : null,
      examples.length > 0
        ? h(
            "div",
            { class: "cliutil-meta-row", "aria-label": "Example invocations" },
            h("span", { class: "pw-hint" }, "Examples:"),
            ...examples.slice(0, 3).map((ex) =>
              h(
                "button",
                {
                  type: "button",
                  class: "cliutil-preset-pill",
                  title: ex.description ? `${ex.description} (${tool.command} ${ex.args})` : `${tool.command} ${ex.args}`,
                  onclick: () => void quickRunTool(tool, ex.args),
                },
                `⚡ ${ex.label}`,
              ),
            ),
          )
        : null,
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
            title: `Execute ${tool.command} right here in the Quick Runner Console`,
            onclick: () => void quickRunTool(tool),
          },
          "⚡ Quick Run",
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

  function getFilteredTools() {
    const q = filterInput.value.trim().toLowerCase();
    const filtered = tools.filter((t) => {
      if (selectedCategory === "Pinned") {
        if (!pinned.has(t.id)) return false;
      } else if (selectedCategory !== "All" && t.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const flagMatch =
        Array.isArray(t.flags) &&
        t.flags.some(
          (f) => f.name.toLowerCase().includes(q) || (f.description && f.description.toLowerCase().includes(q)),
        );
      return (
        t.id.toLowerCase().includes(q) ||
        t.stem.toLowerCase().includes(q) ||
        t.suiteName.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        flagMatch
      );
    });
    return filtered.sort((a, b) => {
      const aPin = pinned.has(a.id) ? 0 : 1;
      const bPin = pinned.has(b.id) ? 0 : 1;
      if (aPin !== bPin) return aPin - bPin;
      return a.id.localeCompare(b.id);
    });
  }

  function renderList() {
    const filtered = getFilteredTools();
    say(`${plural(filtered.length, "CLI utility")} shown (of ${tools.length} built-in utilities).`);
    if (!filtered.length) {
      listWrap.replaceChildren(h("p", { class: "pw-hint" }, "No CLI utilities match that filter."));
      return;
    }
    listWrap.replaceChildren(...filtered.map(renderRow));
  }

  function applyShowOptions(opts) {
    if (!opts || typeof opts !== "object") return;
    if (typeof opts.category === "string" && opts.category) {
      selectedCategory = opts.category;
    }
    if (typeof opts.query === "string") {
      filterInput.value = opts.query;
    }
    if (typeof opts.args === "string") {
      argsInput.value = opts.args;
    } else if (Array.isArray(opts.paths) && opts.paths.length > 0) {
      argsInput.value = opts.paths.map(quoteCliArg).join(" ");
    }
    renderCategories();
    renderList();
    if (opts.toolId) {
      const target = tools.find((t) => t.id === opts.toolId || t.stem === opts.toolId);
      if (target && opts.autoRun) {
        void quickRunTool(target);
      }
    }
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
      syncCwdButton();
      renderCategories();
      renderList();
      if (pendingShowOpts) {
        const opts = pendingShowOpts;
        pendingShowOpts = null;
        applyShowOptions(opts);
      }
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
      " inside the built-in CLI Utilities folder, is added to the built-in Terminal's PATH, or can be executed inline with ",
      h("strong", {}, "⚡ Quick Run"),
      ".",
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
    h("div", { class: "pw-row cliutils-input-row" }, filterInput, argsInput),
    h(
      "div",
      { class: "pw-row" },
      cwdToggleBtn,
      h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          title: "Insert currently selected File Manager paths into the arguments box",
          onclick: insertSelectedPaths,
        },
        "📎 Insert selected files",
      ),
      h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          title: "Insert the active File Manager folder path into the arguments box",
          onclick: insertCurrentFolder,
        },
        "📂 Insert current folder",
      ),
      h(
        "button",
        {
          type: "button",
          class: "pw-btn",
          title: "Clear the arguments box",
          onclick: () => {
            argsInput.value = "";
            argsInput.focus();
          },
        },
        "✕ Clear args",
      ),
    ),
    categoryBar,
  );

  root.append(headCard, runnerWrap, status, listWrap);

  return {
    show(opts) {
      syncCwdButton();
      if (!loaded) {
        if (opts) pendingShowOpts = opts;
        load(false);
      } else if (opts) {
        applyShowOptions(opts);
      }
    },
  };
}

on("open-cliutils-tool", (opts) => openPower("cliutils", opts));

registerPowerTab({
  id: "cliutils",
  label: "CLI Utilities",
  icon: "🛠️",
  tip: "Built-in RAD Studio command-line utilities: open the CLI utilities folder, run inline with Quick Run, or launch ./tool-name in the terminal",
  group: "automate",
  mount,
});
