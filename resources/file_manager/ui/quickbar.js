// Smart Kind-Chips bar, live folder filter, row density & grouping pills, Context-Aware Selection Action Bar,
// and RAD Developer "New from Template" studio dialog.
import { ApiError, call } from "./api.js";
import { openFolderInCode, openInCode } from "./code.js";
import { looksLikeText } from "./codeLang.js";
import { canCompareData, showCompareData } from "./datacompare.js";
import { openDialog } from "./dialogs.js";
import { $, announce, buttonIconFor, clear, h } from "./dom.js";
import { isStudioPicture } from "./imageStudio.js";
import { renderList } from "./list.js";
import { isPlayableOrPlaylist } from "./mediacore.js";
import { showMenu, toast } from "./menus.js";
import { busy, entryMatchesKindFilter, refresh, saveSettings, visibleEntries } from "./nav.js";
import * as ops from "./ops.js";
import { activePane, currentPath, inTrash, isFolderView, left } from "./pane.js";
import { openInMediaDeck } from "./playerDeck.js";
import { openPower } from "./power.js";
import { openQuickLook } from "./quicklook.js";
import { clearSelection, focusIndex, selectKeys, selectedEntries } from "./selection.js";
import { emit, on, state } from "./state.js";
import { TAG_DEFS, setTagForPaths, tagForPath } from "./tags.js";
import { showToolsDialog } from "./tools.js";
import { baseName, describeSelection, extensionOf, extractableEntries, formatSize } from "./util.js";

// ---------------------------------------------------------------------------------------------------------------
// Kind Chips definitions
// ---------------------------------------------------------------------------------------------------------------

export const KIND_CHIP_DEFS = [
  { id: "all", icon: "✦", label: "All", tip: "Show all files and folders in this location" },
  { id: "folder", icon: "📂", label: "Folders", tip: "Filter to show only folders" },
  { id: "code", icon: "💻", label: "Code", tip: "Filter to show source code, scripts, and markup files" },
  { id: "document", icon: "📄", label: "Docs", tip: "Filter to show Markdown, text, PDF, and office documents" },
  { id: "image", icon: "🖼️", label: "Pictures", tip: "Filter to show PNG, JPEG, WebP, SVG, and other images" },
  { id: "media", icon: "🎬", label: "Media", tip: "Filter to show audio, video, and playlists" },
  { id: "data", icon: "🗄️", label: "Data", tip: "Filter to show JSON, CSV, SQLite databases, and config files" },
  { id: "archive", icon: "🗜️", label: "Archives", tip: "Filter to show ZIP, TAR, GZ, and encrypted archives" },
];

export const ROW_DENSITY_DEFS = [
  { id: "compact", label: "Compact", tip: "Tighter row spacing to fit more files on screen" },
  { id: "comfortable", label: "Comfortable", tip: "Balanced default spacing for everyday browsing" },
  { id: "spacious", label: "Spacious", tip: "Generous row height for touch or high-readability browsing" },
];

export const GROUP_BY_DEFS = [
  { id: "none", label: "None", tip: "Continuous list without section headers" },
  { id: "kind", label: "Kind", tip: "Group items under section headers for Folders and each file type" },
  { id: "date", label: "Date", tip: "Group items by modification date (Today, Yesterday, Earlier…)" },
  { id: "size", label: "Size", tip: "Group files by size tier (Tiny, Small, Medium, Large)" },
];

// ---------------------------------------------------------------------------------------------------------------
// RAD Developer File Templates
// ---------------------------------------------------------------------------------------------------------------

export const RAD_FILE_TEMPLATES = [
  {
    id: "markdown",
    icon: "📝",
    label: "Markdown Document",
    category: "Docs & Notes",
    defaultName: "README.md",
    desc: "Structured Markdown document with overview, quickstart, and task list",
    content: () => `# Project Overview\n\nCreated on ${ops.localDateStamp()}.\n\n## Quick Start\n\n\`\`\`bash\nbun run index.ts\n\`\`\`\n\n## Tasks\n\n- [ ] Define core architecture\n- [ ] Add automated tests\n- [ ] Document usage\n`,
  },
  {
    id: "typescript",
    icon: "🟦",
    label: "TypeScript Script",
    category: "Code & Scripts",
    defaultName: "script.ts",
    desc: "Runnable TypeScript module for Bun or Node with async main() entry point",
    content: () => `#!/usr/bin/env bun\n/**\n * Starter TypeScript utility (${ops.localDateStamp()})\n */\n\nexport async function main(args: string[] = process.argv.slice(2)): Promise<void> {\n  console.log("Running script with args:", args);\n}\n\nif (import.meta.main) {\n  main().catch((err) => {\n    console.error(err);\n    process.exit(1);\n  });\n}\n`,
  },
  {
    id: "python",
    icon: "🐍",
    label: "Python Script",
    category: "Code & Scripts",
    defaultName: "main.py",
    desc: "Clean Python 3 CLI script with argparse and main() guard",
    content: () => `#!/usr/bin/env python3\n"""Starter Python script (${ops.localDateStamp()})."""\nimport argparse\nimport sys\n\n\ndef parse_args(argv: list[str]) -> argparse.Namespace:\n    parser = argparse.ArgumentParser(description="Run task")\n    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose output")\n    return parser.parse_args(argv)\n\n\ndef main(argv: list[str] | None = None) -> int:\n    args = parse_args(argv if argv is not None else sys.argv[1:])\n    print(f"Ready (verbose={args.verbose})")\n    return 0\n\n\nif __name__ == "__main__":\n    raise SystemExit(main())\n`,
  },
  {
    id: "html",
    icon: "🌐",
    label: "Modern HTML5 App Page",
    category: "Web & UI",
    defaultName: "index.html",
    desc: "Responsive HTML5 page with dark/light CSS variables and ES module script",
    content: () => `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="color-scheme" content="light dark">\n  <title>App Starter</title>\n  <style>\n    :root { --bg: #0f172a; --panel: #1e293b; --text: #f8fafc; --accent: #38bdf8; }\n    * { box-sizing: border-box; }\n    body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); display: grid; place-items: center; min-height: 100vh; }\n    main { background: var(--panel); padding: 2rem; border-radius: 0.75rem; max-width: 40rem; width: 92%; }\n  </style>\n</head>\n<body>\n  <main>\n    <h1>Ready to Build</h1>\n    <p>Edit this page in the Codecaine Code editor or serve it live.</p>\n  </main>\n</body>\n</html>\n`,
  },
  {
    id: "json",
    icon: "📋",
    label: "JSON Configuration",
    category: "Data & Config",
    defaultName: "config.json",
    desc: "Structured JSON configuration file with environment and feature flags",
    content: () => `${JSON.stringify({ name: "app-config", version: "1.0.0", created: ops.localDateStamp(), settings: { debug: false, port: 3000 } }, null, 2)}\n`,
  },
  {
    id: "package_json",
    icon: "📦",
    label: "Bun / Node package.json",
    category: "Data & Config",
    defaultName: "package.json",
    desc: "Ready-to-run ES module package.json with dev, start, and test scripts",
    content: () => `${JSON.stringify({ name: "my-rad-project", version: "0.1.0", private: true, type: "module", scripts: { dev: "bun --watch index.ts", start: "bun run index.ts", test: "bun test" } }, null, 2)}\n`,
  },
  {
    id: "shell",
    icon: "🐚",
    label: "Shell Script",
    category: "Code & Scripts",
    defaultName: "run.sh",
    desc: "Safe POSIX/Bash automation script with strict error handling",
    content: () => `#!/usr/bin/env bash\nset -euo pipefail\n\nSCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"\necho "Running in \${SCRIPT_DIR}"\n`,
  },
  {
    id: "env",
    icon: "🔐",
    label: "Environment Variables (.env)",
    category: "Data & Config",
    defaultName: ".env.example",
    desc: "Template environment configuration for ports, URLs, and database credentials",
    content: () => `# Application Environment\nNODE_ENV=development\nPORT=3000\n\n# Database Connections (importable into Codecaine Databases tool)\nDATABASE_URL=sqlite://./app.sqlite\n`,
  },
  {
    id: "gitignore",
    icon: "🙈",
    label: "Git Ignore (.gitignore)",
    category: "Data & Config",
    defaultName: ".gitignore",
    desc: "Standard ignore rules for Node/Bun, Python, macOS, Windows, and build artifacts",
    content: () => `# Dependencies & build outputs\nnode_modules/\ndist/\nbuild/\n__pycache__/\n*.pyc\n\n# Local environment & secrets\n.env\n.env.local\n\n# OS & editor files\n.DS_Store\nThumbs.db\n*.log\n`,
  },
  {
    id: "csv",
    icon: "📊",
    label: "CSV Dataset",
    category: "Data & Config",
    defaultName: "data.csv",
    desc: "Clean tabular CSV file ready for spreadsheet viewing or SQLite staging import",
    content: () => `id,name,category,value,created_at\n1,Alpha,core,100,${ops.localDateStamp()}\n2,Beta,analytics,250,${ops.localDateStamp()}\n3,Gamma,automation,420,${ops.localDateStamp()}\n`,
  },
  {
    id: "sql",
    icon: "🗄️",
    label: "SQL Schema Migration",
    category: "Data & Config",
    defaultName: "schema.sql",
    desc: "Starter SQL table definition with primary key, timestamps, and index",
    content: () => `-- Schema migration (${ops.localDateStamp()})\nCREATE TABLE IF NOT EXISTS items (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'active',\n  created_at TEXT NOT NULL DEFAULT (datetime('now'))\n);\n\nCREATE INDEX IF NOT EXISTS idx_items_status ON items(status);\n`,
  },
  {
    id: "dockerfile",
    icon: "🐳",
    label: "Dockerfile",
    category: "Data & Config",
    defaultName: "Dockerfile",
    desc: "Lightweight container image definition for Bun/Node services",
    content: () => `FROM oven/bun:1-alpine\nWORKDIR /app\nCOPY package.json ./\nRUN bun install --production\nCOPY . .\nEXPOSE 3000\nCMD ["bun", "run", "start"]\n`,
  },
];

function uniqueTemplateName(pane, defaultName) {
  const taken = new Set((pane.entries ?? []).map((e) => e.name));
  if (!taken.has(defaultName)) return defaultName;
  const dot = defaultName.lastIndexOf(".");
  const stem = dot > 0 ? defaultName.slice(0, dot) : defaultName;
  const ext = dot > 0 ? defaultName.slice(dot) : "";
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

/**
 * Creates a file in the active folder from a template ID (or custom content) with full Undo support.
 */
export async function newFromTemplate(templateId, customNameOrOpts = "", maybeOpts = {}) {
  const isObj = customNameOrOpts && typeof customNameOrOpts === "object";
  const customName = isObj ? String(customNameOrOpts.customName || "") : String(customNameOrOpts || "");
  const openInEditor = Boolean(isObj ? customNameOrOpts.openInEditor : maybeOpts?.openInEditor);
  const pane = activePane();
  if (!isFolderView(pane)) {
    toast(inTrash(pane) ? "Open a folder first: creating files isn't possible inside the Recycle Bin." : "Close the search results first to create a file from a template.", { kind: "info" });
    return null;
  }
  const tpl = RAD_FILE_TEMPLATES.find((t) => t.id === templateId) ?? RAD_FILE_TEMPLATES[0];
  const name = (customName && customName.trim()) || uniqueTemplateName(pane, tpl.defaultName);
  const content = typeof tpl.content === "function" ? tpl.content() : String(tpl.content || "");
  try {
    const r = await busy(() => call("newfile", { parent: currentPath(pane), name, content }));
    const createdPath = r.path;
    ops.pushUndo(`new file "${r.name}"`, async () => {
      const res = await call("trash", { paths: [createdPath] });
      const failed = (res.results ?? []).filter((x) => !x.ok);
      if (failed.length) throw new Error(failed[0].message || "Undo failed");
    });
    await refresh({ keepSelection: false, pane });
    selectKeys([r.path], pane);
    if (openInEditor) {
      openInCode(r.path);
    } else {
      toast(`Created "${r.name}" from ${tpl.label}.`, {
        kind: "success",
        action: { label: "Edit in Code", run: () => openInCode(r.path) },
      });
    }
    return r;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't create file from template.", { kind: "error" });
    return null;
  }
}

/**
 * Opens the interactive RAD "New from Template" studio modal dialog.
 */
export async function showNewTemplateDialog(initialTemplateId = "markdown") {
  const pane = activePane();
  if (!isFolderView(pane)) {
    toast(inTrash(pane) ? "Open a folder first: creating files isn't possible inside the Recycle Bin." : "Close the search results first to create a file from a template.", { kind: "info" });
    return null;
  }
  let selectedTpl = RAD_FILE_TEMPLATES.find((t) => t.id === initialTemplateId) ?? RAD_FILE_TEMPLATES[0];
  let userEditedName = false;

  const nameInput = h("input", {
    id: "tpl-filename-input",
    type: "text",
    class: "text-input",
    value: uniqueTemplateName(pane, selectedTpl.defaultName),
    spellcheck: "false",
    autocomplete: "off",
    "aria-label": "File name",
  });
  nameInput.addEventListener("input", () => {
    userEditedName = true;
  });

  const previewCode = h("textarea", {
    id: "tpl-content-preview",
    class: "tpl-preview-area",
    rows: "8",
    spellcheck: "false",
    "aria-label": "Starter file content (you can customize it before creating)",
  }, selectedTpl.content());

  const descEl = h("p", { class: "hint tpl-desc" }, selectedTpl.desc);
  const grid = h("div", { class: "tpl-grid", role: "listbox", "aria-label": "Starter file templates" });

  function selectTemplate(tpl) {
    selectedTpl = tpl;
    if (!userEditedName) {
      nameInput.value = uniqueTemplateName(pane, tpl.defaultName);
    }
    previewCode.value = tpl.content();
    descEl.textContent = tpl.desc;
    for (const card of grid.querySelectorAll(".tpl-card")) {
      const active = card.dataset.tplId === tpl.id;
      card.classList.toggle("active", active);
      card.setAttribute("aria-selected", String(active));
    }
  }

  for (const tpl of RAD_FILE_TEMPLATES) {
    const active = tpl.id === selectedTpl.id;
    const card = h("button", {
      type: "button",
      role: "option",
      class: `tpl-card${active ? " active" : ""}`,
      dataset: { tplId: tpl.id },
      "aria-selected": String(active),
      title: `${tpl.label} (${tpl.defaultName}) — ${tpl.desc}`,
      onclick: () => selectTemplate(tpl),
    },
      h("span", { class: "tpl-card-icon", "aria-hidden": "true" }, tpl.icon),
      h("span", { class: "tpl-card-body" },
        h("span", { class: "tpl-card-title" }, tpl.label),
        h("span", { class: "tpl-card-meta" }, tpl.defaultName),
      ),
    );
    grid.append(card);
  }

  const body = h("div", { class: "tpl-dialog-body" },
    grid,
    descEl,
    h("div", { class: "tpl-form-row" },
      h("label", { class: "field", for: "tpl-filename-input" },
        h("span", { class: "field-label" }, "File name"),
        nameInput,
      ),
      h("label", { class: "field", for: "tpl-content-preview" },
        h("span", { class: "field-label" }, "Starter content (editable)"),
        previewCode,
      ),
    ),
  );

  const dlg = openDialog({
    title: "✨ New File from Template",
    wide: true,
    body,
    initialFocus: nameInput,
    buttons: [
      { label: "Cancel", value: null },
      { label: "Create & Edit in Code", value: "edit" },
      { label: "Create File", value: "create", primary: true },
    ],
  });

  const choice = await dlg.result;
  if (!choice) return null;

  const finalName = nameInput.value.trim() || uniqueTemplateName(pane, selectedTpl.defaultName);
  const finalContent = previewCode.value;
  try {
    const r = await busy(() => call("newfile", { parent: currentPath(pane), name: finalName, content: finalContent }));
    const createdPath = r.path;
    ops.pushUndo(`new file "${r.name}"`, async () => {
      const res = await call("trash", { paths: [createdPath] });
      const failed = (res.results ?? []).filter((x) => !x.ok);
      if (failed.length) throw new Error(failed[0].message || "Undo failed");
    });
    await refresh({ keepSelection: false, pane });
    selectKeys([r.path], pane);
    if (choice === "edit") {
      openInCode(r.path);
    } else {
      toast(`Created "${r.name}".`, {
        kind: "success",
        action: { label: "Edit in Code", run: () => openInCode(r.path) },
      });
    }
    return r;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't create that file.", { kind: "error" });
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Quickbar: Live Filter + Smart Kind-Chips + Group/Density Pills
// ---------------------------------------------------------------------------------------------------------------

export function clearQuickFilters({ focusList = false } = {}) {
  const changed = Boolean(state.quickFilter) || (state.kindFilter && state.kindFilter !== "all");
  state.quickFilter = "";
  state.kindFilter = "all";
  const input = $("#quick-filter");
  if (input) input.value = "";
  const clearBtn = $("#quick-filter-clear");
  if (clearBtn) clearBtn.hidden = true;
  if (changed) {
    state.shown = 0;
    renderList(left);
    renderQuickbar();
  }
  if (focusList) $("#list")?.focus();
}

export function focusQuickFilter() {
  const input = $("#quick-filter");
  if (!input || input.closest("[hidden]")) return;
  input.focus();
  input.select?.();
}

export function setKindFilter(kindId) {
  const next = !kindId || (state.kindFilter === kindId && kindId !== "all") ? "all" : kindId;
  state.kindFilter = next;
  state.shown = 0;
  renderList(left);
  renderQuickbar();
  const def = KIND_CHIP_DEFS.find((d) => d.id === next);
  if (def) announce(next === "all" ? "Showing all file kinds" : `Filtered by ${def.label}`);
}

export function renderQuickbar() {
  const bar = $("#quickbar");
  if (!bar) return;
  const trash = inTrash(left);
  bar.hidden = trash;
  if (trash) return;

  const input = $("#quick-filter");
  const clearBtn = $("#quick-filter-clear");
  if (input && document.activeElement !== input && input.value !== (state.quickFilter || "")) {
    input.value = state.quickFilter || "";
  }
  const hasFilter = Boolean((state.quickFilter || "").trim()) || (state.kindFilter && state.kindFilter !== "all");
  if (clearBtn) clearBtn.hidden = !hasFilter;

  // Compute live counts across the current folder's raw entries (after tag filter if any)
  let baseEntries = left.search ? left.search.entries : left.entries;
  if (state.tagFilter && state.settings?.tags) {
    baseEntries = baseEntries.filter((e) => state.settings.tags[e.path] === state.tagFilter);
  }
  const counts = new Map();
  counts.set("all", baseEntries.length);
  for (const def of KIND_CHIP_DEFS) {
    if (def.id === "all") continue;
    let c = 0;
    for (const e of baseEntries) {
      if (entryMatchesKindFilter(e, def.id)) c++;
    }
    counts.set(def.id, c);
  }

  const chipsBox = $("#kind-chips");
  if (chipsBox) {
    clear(chipsBox);
    const activeKind = state.kindFilter || "all";
    for (const def of KIND_CHIP_DEFS) {
      const count = counts.get(def.id) ?? 0;
      if (def.id !== "all" && count === 0 && activeKind !== def.id) continue;
      const pressed = activeKind === def.id;
      const btnIconId = `chip.${def.id === "document" ? "docs" : def.id === "media" ? "video" : def.id}`;
      const chip = h("button", {
        type: "button",
        class: `qb-chip${pressed ? " active" : ""}`,
        dataset: { kindChip: def.id, kind: def.id },
        "aria-pressed": String(pressed),
        title: `${def.tip} (${count})`,
        onclick: () => setKindFilter(def.id),
      },
        h("span", {
          class: "qb-chip-icon",
          "aria-hidden": "true",
          dataset: { btnIcon: btnIconId, defaultIcon: def.icon },
        }, buttonIconFor(btnIconId, undefined, def.icon)),
        h("span", { class: "qb-chip-label" }, def.label),
        h("span", { class: "qb-chip-count" }, String(count)),
      );
      chipsBox.append(chip);
    }
  }

  const groupBtn = $("#qb-group-btn");
  if (groupBtn) {
    const g = state.settings.groupBy || "none";
    const def = GROUP_BY_DEFS.find((d) => d.id === g) ?? GROUP_BY_DEFS[0];
    groupBtn.textContent = `Group: ${def.label} ▾`;
    groupBtn.classList.toggle("active", g !== "none");
  }

  const densityBtn = $("#qb-density-btn");
  if (densityBtn) {
    const d = state.settings.rowDensity || "comfortable";
    const def = ROW_DENSITY_DEFS.find((x) => x.id === d) ?? ROW_DENSITY_DEFS[1];
    densityBtn.textContent = `${def.label} ▾`;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Context-Aware Floating Selection Action Bar
// ---------------------------------------------------------------------------------------------------------------

export function renderSelectionBar() {
  const bar = $("#selection-bar");
  if (!bar) return;
  const items = selectedEntries(left);
  if (!items.length || inTrash(left)) {
    bar.hidden = true;
    clear(bar);
    return;
  }
  bar.hidden = false;
  clear(bar);

  const paths = items.map((e) => e.path).filter(Boolean);
  const existingTags = paths.map((p) => tagForPath(p)?.id).filter(Boolean);
  const sharedTag = existingTags.length === paths.length && existingTags.every((c) => c === existingTags[0]) ? existingTags[0] : "";

  const summary = h("span", { class: "sb-summary" }, describeSelection(items));

  // Inline 1-click Color Tag bar
  const tagGroup = h("div", { class: "sb-tags", role: "group", "aria-label": "Quick color tag" },
    ...TAG_DEFS.map((t) =>
      h("button", {
        type: "button",
        class: `sb-tag-btn tag-${t.id}${sharedTag === t.id ? " active" : ""}`,
        dataset: { sbTag: t.id },
        "aria-pressed": String(sharedTag === t.id),
        title: sharedTag === t.id ? `Remove ${t.label} tag` : `Tag selected as ${t.label}`,
        "aria-label": `Tag ${t.label}`,
        onclick: () => setTagForPaths(paths, sharedTag === t.id ? "" : t.id),
      }),
    ),
    existingTags.length > 0
      ? h("button", {
          type: "button",
          class: "sb-tag-clear",
          title: "Clear color tag from selected items",
          "aria-label": "Clear color tag",
          onclick: () => setTagForPaths(paths, ""),
        }, "✕")
      : null,
  );

  // Context-Smart RAD Actions
  const actions = h("div", { class: "sb-actions", role: "group", "aria-label": "Selection actions" });
  const addAct = (id, icon, label, tip, run, { primary = false, danger = false } = {}) => {
    const btnIconId = id === "quicklook" ? "sb.quicklook" : id === "code" ? "sb.code" : id === "sqlite" ? "databases" : id === "compare-data" || id === "compare-dirs" ? "sb.compare" : id === "copypath" ? "copy" : id;
    actions.append(
      h("button", {
        type: "button",
        class: `sb-btn${primary ? " primary" : ""}${danger ? " danger" : ""}`,
        dataset: { sbAction: id },
        title: tip,
        onclick: run,
      },
        h("span", {
          "aria-hidden": "true",
          dataset: { btnIcon: btnIconId, defaultIcon: icon },
        }, buttonIconFor(btnIconId, undefined, icon)),
        h("span", { class: "sb-btn-label" }, label),
      ),
    );
  };

  const one = items.length === 1 ? items[0] : null;
  if (one && !one.isDir) {
    addAct("quicklook", "👁️", "Quick Look", "Preview this file with Quick Look (Space)", () => openQuickLook(one), { primary: true });
  }
  if (one && (one.isDir || looksLikeText(one.name))) {
    addAct("code", "📝", "Code", one.isDir ? "Open this folder in the built-in Code editor" : "Edit this file in the built-in Code editor (Mod+E)", () =>
      one.isDir ? openFolderInCode(one.path) : openInCode(one.path),
    );
  }
  if (one && !one.isDir && /^(sqlite|sqlite3|db|db3|s3db)$/.test(extensionOf(one.name))) {
    addAct("sqlite", "🗄️", "SQLite Studio", "Open this database in SQLite Studio", () => openPower("databases", { sqlitePath: one.path }), { primary: true });
  }
  const pics = items.filter((x) => !x.isDir && isStudioPicture(x.name));
  if (pics.length > 0) {
    addAct("imagestudio", "🎨", pics.length > 1 ? `Image Studio (${pics.length})` : "Image Studio", "Open selected picture(s) in Image Studio", () =>
      openPower("imagestudio", { paths: pics.map((x) => x.path) }),
    );
  }
  const playable = items.filter((x) => !x.isDir && isPlayableOrPlaylist(x.name));
  if (playable.length > 0) {
    addAct("mediadeck", "🎛️", playable.length > 1 ? `Play (${playable.length})` : "Play", "Play in Media Deck", () =>
      openInMediaDeck({ entries: playable, enqueue: false }),
    );
  }
  const archives = extractableEntries(items);
  if (archives.length > 0 && !left.search) {
    addAct("extract", "📦", "Extract", "Extract archive contents into this folder", () => ops.extractSelection(items));
  }
  if (canCompareData(items)) {
    addAct("compare-data", "⚖️", "Compare Data", "Compare these two JSON, YAML, or TOML files semantically", () => showCompareData(items), { primary: true });
  } else if (items.length === 2 && items[0].isDir && items[1].isDir) {
    addAct("compare-dirs", "🆚", "Compare Folders", "Compare these two folders side by side in the Compare tool", () => {
      openPower("compare");
      setTimeout(() => {
        const l = $("#compare-left");
        const r = $("#compare-right");
        if (l && r) {
          l.value = items[0].path;
          r.value = items[1].path;
        }
      }, 60);
    }, { primary: true });
  }

  addAct("rename", "✏️", items.length > 1 ? `Bulk Rename (${items.length})` : "Rename", items.length > 1 ? "Batch rename all selected items with a live preview" : "Rename this item (F2)", () => ops.renameSelection());
  if (!left.search) {
    addAct("zip", "🗜️", "Zip", "Compress selected items into a .zip archive", () => ops.zipSelection());
  }
  addAct("copypath", "🔗", "Copy Path", "Copy full path(s) to the clipboard", () => ops.copyPathOf(items));
  addAct("delete", "🗑️", "Delete", "Move selected items to the Recycle Bin / Graveyard", () => ops.trashSelection(), { danger: true });
  addAct("clear", "✕", "Deselect", "Clear selection (Esc)", () => clearSelection(left));

  bar.append(summary, tagGroup, actions);
}

// ---------------------------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------------------------

export function wireQuickbar() {
  const input = $("#quick-filter");
  const clearBtn = $("#quick-filter-clear");
  if (input) {
    input.addEventListener("input", () => {
      state.quickFilter = input.value;
      state.shown = 0;
      renderList(left);
      renderQuickbar();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        clearQuickFilters({ focusList: true });
      } else if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        const entries = visibleEntries(left);
        if (entries.length > 0) {
          focusIndex(0, { pane: left });
          $("#list")?.focus();
        }
      }
    });
  }
  clearBtn?.addEventListener("click", () => clearQuickFilters({ focusList: true }));

  const groupBtn = $("#qb-group-btn");
  groupBtn?.addEventListener("click", () => {
    const cur = state.settings.groupBy || "none";
    showMenu(
      GROUP_BY_DEFS.map((g) => ({
        label: `Group by: ${g.label}`,
        checked: cur === g.id,
        tip: g.tip,
        action: () => saveSettings({ groupBy: g.id }),
      })),
      { anchor: groupBtn, label: "Group items by" },
    );
  });

  const densityBtn = $("#qb-density-btn");
  densityBtn?.addEventListener("click", () => {
    const cur = state.settings.rowDensity || "comfortable";
    showMenu(
      ROW_DENSITY_DEFS.map((d) => ({
        label: `Density: ${d.label}`,
        checked: cur === d.id,
        tip: d.tip,
        action: () => saveSettings({ rowDensity: d.id }),
      })),
      { anchor: densityBtn, label: "Row density" },
    );
  });

  const tplBtn = $("#qb-template-btn");
  tplBtn?.addEventListener("click", () => void showNewTemplateDialog());

  on("focus-quick-filter", () => focusQuickFilter());
  on("new-template-dialog", (tplId) => void showNewTemplateDialog(typeof tplId === "string" ? tplId : "markdown"));
  on("view", () => {
    renderQuickbar();
    renderSelectionBar();
  });
  on("selection", () => renderSelectionBar());
  on("settings", () => {
    renderQuickbar();
    renderSelectionBar();
  });
  renderQuickbar();
  renderSelectionBar();
}
