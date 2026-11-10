// "Tools" section of the Dev tool: which developer programs are installed on this computer and their versions. Missing
// ones show how to install them (text to read; nothing is ever installed from here).
import { call } from "./api.js";
import { announce, h } from "./dom.js";
import { btn, createStatus, createTable, errorText, field } from "./devCore.js";
import { toast } from "./menus.js";

const GROUPS = {
  runtime: "Languages and runtimes",
  build: "Build tools",
  vcs: "Version control",
  other: "Other tools",
};

export function createEnv() {
  const status = createStatus();
  const host = h("div", {});
  let loaded = false;
  let seq = 0;
  let lastTools = null;

  const filterInput = h("input", {
    type: "search",
    id: "dev-env-filter",
    placeholder: "Filter tools…",
    spellcheck: "false",
    autocomplete: "off",
    title: "Filter developer tools by name, version, or install command.",
    oninput: () => {
      if (lastTools) renderTable(lastTools);
    },
  });
  const statusFilter = h(
    "select",
    {
      id: "dev-env-status",
      title: "Show all tools, only installed tools, or only missing tools.",
      onchange: () => {
        if (lastTools) renderTable(lastTools);
      },
    },
    h("option", { value: "all" }, "All tools"),
    h("option", { value: "installed" }, "Installed only"),
    h("option", { value: "missing" }, "Missing only"),
  );

  const table = createTable({
    caption: "Developer tools on this computer",
    columns: [
      { key: "name", label: "Tool", rowHeader: true },
      { key: "state", label: "Status" },
      { key: "version", label: "Version" },
      { key: "where", label: "Found at / how to install" },
    ],
  });

  function renderTable(tools) {
    const q = filterInput.value.trim().toLowerCase();
    const mode = statusFilter.value;
    const rows = [];
    for (const group of Object.keys(GROUPS)) {
      for (const t of tools.filter((x) => x.group === group)) {
        if (mode === "installed" && !t.installed) continue;
        if (mode === "missing" && t.installed) continue;
        if (q) {
          const hay =
            `${t.name} ${t.version ?? ""} ${t.path ?? ""} ${t.note ?? ""} ${t.hint ?? ""}`.toLowerCase();
          if (!hay.includes(q)) continue;
        }
        rows.push({
          cells: [
            t.name,
            t.installed
              ? "✓ Installed"
              : t.path
                ? "! Found, not working"
                : "✗ Missing",
            t.version ?? "",
            t.installed
              ? h("span", { class: "pw-mono" }, t.path)
              : h(
                  "span",
                  {},
                  t.note ?? "",
                  t.note && t.hint ? " " : "",
                  t.hint
                    ? h(
                        "code",
                        {
                          class: "pw-mono",
                          title:
                            "Shown for you to copy. Nothing is installed from here.",
                        },
                        t.hint,
                      )
                    : "",
                  t.hint ? " " : "",
                  t.hint
                    ? btn(
                        "📋 Copy",
                        `Copy install command: ${t.hint}`,
                        async () => {
                          try {
                            const r = await call("copytext", { text: t.hint });
                            if (r?.copied)
                              toast("Install command copied.", {
                                kind: "success",
                              });
                          } catch {}
                        },
                      )
                    : "",
                ),
          ],
        });
      }
    }
    table.render(rows);
    if (!host.contains(table.el)) host.replaceChildren(table.el);
  }

  async function load(refresh = false) {
    const mine = ++seq;
    status.set("Looking for your developer tools…");
    try {
      const res = await call("dev/env", { refresh });
      if (mine !== seq) return;
      loaded = true;
      lastTools = res.tools;
      renderTable(res.tools);
      const installed = res.tools.filter((t) => t.installed).length;
      status.set(
        `${installed} of ${res.tools.length} tools found${res.cached ? " (remembered from a moment ago)" : ""}.`,
      );
      announce(status.el.textContent);
    } catch (err) {
      if (mine === seq)
        status.set(errorText(err, "The tools couldn't be checked."), true);
    }
  }

  return {
    el: h(
      "div",
      { class: "dev-section" },
      h(
        "div",
        { class: "pw-card" },
        h("h3", {}, "Developer tools"),
        h(
          "p",
          { class: "pw-hint" },
          "Each tool is asked for its version (nothing else). Install commands are only shown for you to copy; nothing is installed from here.",
        ),
        h(
          "div",
          { class: "pw-row" },
          field("Filter", filterInput),
          field("Status", statusFilter),
          btn(
            "Check again",
            "Ask every tool for its version again.",
            () => load(true),
            { primary: true },
          ),
        ),
        status.el,
        host,
      ),
    ),
    show() {
      if (!loaded) load(false);
    },
  };
}
