// The larger dialogs: Properties, Rename several, Help, Welcome and Settings.
import { ApiError, call } from "./api.js";
import { showAbout } from "./about.js";
import { openDialog } from "./dialogs.js";
import { debounce, h } from "./dom.js";
import { showMoreInfo } from "./fileinfo.js";
import { toast } from "./menus.js";
import { saveSettings } from "./nav.js";
import { keysOf } from "./keymap.js";
import { permissionsSection } from "./permsPanel.js";
import { reviewPlan } from "./planDialog.js";
import { clearRecents, isRecentsEnabled, showRecentsManager } from "./recents.js";
import { formatShortcut } from "./shortcuts.js";
import { showShortcutsDialog } from "./shortcutsDialog.js";
import { state } from "./state.js";
import { currentThemeName, showThemePicker } from "./themes.js";
import { verdictBlock } from "./typecheck.js";
import { formatSize, plural } from "./util.js";
import { resetWindowToDefault, windowSection } from "./windowSettings.js";
import { hasDesktopWindow } from "./windowState.js";

// ---------------------------------------------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------------------------------------------

export async function showProperties(paths, options = {}) {
  let p;
  try {
    p = (await call("props", { paths })).properties;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't read the properties.", { kind: "error" });
    return;
  }
  const rows = [];
  const add = (label, value) => value !== null && value !== undefined && value !== "" && rows.push([label, value]);
  add("Name", p.name);
  add("Type", p.kind);
  add("Where", p.location);
  const size = `${formatSize(p.size)}${p.size >= 1024 ? ` (${p.size.toLocaleString()} bytes)` : ""}`;
  add("Size", `${size}${p.partial ? " or more (still counting stopped early)" : ""}`);
  if (p.isDir || p.count > 1) add("Contains", `${plural(p.files, "file")}, ${plural(p.folders, "folder")}${p.partial ? " or more" : ""}`);
  add("Created", p.createdMs ? new Date(p.createdMs).toLocaleString() : "");
  add("Modified", p.modifiedMs ? new Date(p.modifiedMs).toLocaleString() : "");
  add("Opened", p.accessedMs ? new Date(p.accessedMs).toLocaleString() : "");
  add("Link to", p.linkTarget);
  add("Permissions", p.permissions ? `${p.permissions} (owner, group, others)` : "");
  if (p.readOnly) add("Read-only", "Yes: it can't be changed");
  if (p.hidden) add("Hidden", "Yes: it is normally not shown");
  let dialog = null;
  const kind = !p.isDir && p.count <= 1 && paths.length === 1 ? verdictBlock(paths[0], p.name, { showDetails: true, onDone: () => dialog?.close() }) : null;
  const perms = state.location.kind === "trash" ? null : permissionsSection(paths);
  dialog = openDialog({
    title: p.count > 1 ? `Properties of ${p.name}` : "Properties",
    wide: !!perms,
    body: [h("dl", { class: "props" }, rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])), kind, perms?.el],
    buttons: [{ label: "More info…", value: "more" }, { label: "Close", primary: true, value: true }],
  });
  if (perms && options.section === "permissions") {
    perms.ready.then(() => {
      perms.el.scrollIntoView?.({ block: "nearest" });
      perms.focusFirst();
    });
  }
  dialog.result.then((answer) => answer === "more" && showMoreInfo(paths));
}

// ---------------------------------------------------------------------------------------------------------------
// Rename several items
// ---------------------------------------------------------------------------------------------------------------

/** Resolves the rows that were renamed, or null when cancelled. */
export function bulkRenameDialog(folder, names) {
  const spec = { mode: "replace", find: "", replace: "", matchCase: false, pattern: "Photo {n}", start: 1, padding: 2, style: "lower", prefix: "", suffix: "" };
  const preview = h("div", { class: "bulk-preview", "aria-live": "polite" });
  const fields = h("div", { class: "bulk-fields" });
  const modeSelect = h("select", { class: "select", "aria-label": "How to rename" },
    h("option", { value: "replace" }, "Replace text"),
    h("option", { value: "number" }, "Number them (Photo 01, Photo 02 …)"),
    h("option", { value: "case" }, "Change capital letters"),
    h("option", { value: "affix" }, "Add text at the start or end"),
  );
  const text = (key, label, extra = {}) => {
    const input = h("input", { type: "text", class: "text-input", value: String(spec[key]), spellcheck: "false", autocomplete: "off", ...extra, oninput: () => { spec[key] = input.type === "number" ? Number(input.value) : input.value; update(); } });
    return h("label", { class: "field" }, h("span", { class: "field-label" }, label), input);
  };
  const check = (key, label) => {
    const input = h("input", { type: "checkbox", checked: spec[key], onchange: () => { spec[key] = input.checked; update(); } });
    return h("label", { class: "check" }, input, h("span", {}, label));
  };
  function drawFields() {
    fields.replaceChildren();
    if (spec.mode === "replace") fields.append(text("find", "Find"), text("replace", "Replace with"), check("matchCase", "Match capital letters exactly"));
    else if (spec.mode === "number") fields.append(text("pattern", "Name pattern (use {n} for the number)"), text("start", "Start at", { type: "number", min: "0" }), text("padding", "Digits (2 gives 01, 02 …)", { type: "number", min: "1", max: "10" }));
    else if (spec.mode === "case") {
      const select = h("select", { class: "select", "aria-label": "Capital letters", onchange: () => { spec.style = select.value; update(); } },
        ...[["lower", "all lower case"], ["upper", "ALL UPPER CASE"], ["title", "Each Word Capitalised"], ["sentence", "First word only"]].map(([v, l]) => h("option", { value: v, selected: spec.style === v }, l)));
      fields.append(h("label", { class: "field" }, h("span", { class: "field-label" }, "Style"), select));
    } else fields.append(text("prefix", "Add at the start"), text("suffix", "Add at the end (before .ext)"));
  }
  modeSelect.addEventListener("change", () => { spec.mode = modeSelect.value; drawFields(); update(); });

  const dlg = openDialog({
    title: `Rename ${plural(names.length, "item")}`,
    wide: true,
    body: [h("label", { class: "field" }, h("span", { class: "field-label" }, "How"), modeSelect), fields, h("p", { class: "hint" }, "The file ending (like .jpg) always stays the same. Check the preview, then press Rename."), preview],
    buttons: [{ label: "Cancel", value: null }, { label: "Rename", value: "ok", primary: true, disabled: true }],
    initialFocus: modeSelect,
  });
  const ok = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  let rows = [];
  let seq = 0;

  const update = debounce(async () => {
    const mine = ++seq;
    try {
      const res = await call("bulkrename", { folder, names, spec: cleanSpec(spec), apply: false });
      if (mine !== seq) return;
      rows = res.rows;
      const changed = rows.filter((r) => r.changed);
      const bad = rows.filter((r) => r.error);
      preview.replaceChildren(h("table", { class: "bulk-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Now"), h("th", {}, "Will become"))),
        h("tbody", {}, rows.slice(0, 200).map((r) => h("tr", { class: r.error ? "bad" : r.changed ? "changed" : "same" },
          h("td", {}, r.from), h("td", {}, r.changed ? r.to : "(no change)", r.error ? h("span", { class: "row-error" }, ` — ${r.error}`) : null)))),
        rows.length > 200 ? h("caption", {}, `Showing the first 200 of ${rows.length}`) : null));
      ok.disabled = bad.length > 0 || changed.length === 0;
      dlg.setError(bad.length ? `${plural(bad.length, "name")} can't be used. Change the settings to fix it.` : "");
    } catch (err) {
      dlg.setError(err instanceof ApiError ? err.message : "Couldn't make the preview.");
    }
  }, 200);

  drawFields();
  update();

  return new Promise((resolve) => {
    ok.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      ok.disabled = true;
      try {
        // The preview here only shows the new names; the plan checks the disk again, shows recovery, and runs in the task queue.
        const outcome = await reviewPlan({ type: "bulk-rename", folder, names, spec: cleanSpec(spec) });
        if (outcome.applied) {
          dlg.close("done");
          resolve(outcome);
        } else ok.disabled = false;
      } catch (err) {
        dlg.setError(err instanceof ApiError ? err.message : "Renaming failed. Nothing was changed.");
        ok.disabled = false;
      }
    }, true);
    dlg.result.then((v) => v !== "done" && resolve(null));
  });
}

function cleanSpec(s) {
  if (s.mode === "replace") return { mode: "replace", find: s.find, replace: s.replace, matchCase: s.matchCase };
  if (s.mode === "number") return { mode: "number", pattern: s.pattern, start: Number.isFinite(s.start) ? s.start : 1, padding: Number.isFinite(s.padding) ? s.padding : 1 };
  if (s.mode === "case") return { mode: "case", style: s.style };
  return { mode: "affix", prefix: s.prefix, suffix: s.suffix };
}

// ---------------------------------------------------------------------------------------------------------------
// Help, welcome, settings
// ---------------------------------------------------------------------------------------------------------------

function shortcuts() {
  const m = state.platform === "darwin" ? "⌘" : "Ctrl+";
  const alt = state.platform === "darwin" ? "⌥" : "Alt+";
  const copyKey = state.platform === "darwin" ? "⌥ (Option)" : "Ctrl";
  // Shortcuts that can be changed in Settings are read from the live table, so this list is always right.
  const K = (...ids) => ids.map((id) => keysOf(id).map((spec) => formatShortcut(spec, state.platform)).join("  or ") || "(none)").join("  /  ");
  return [
    ["Open the selected item", "Enter  or  double-click"],
    ["Quick Look: see a picture, play a sound or video, read a text file or document without opening it (arrows move to the next one)", "Space"],
    ["Go up one folder", K("nav.up")],
    ["Back / Forward", K("nav.back", "nav.forward")],
    ["Copy / Cut / Paste", K("file.copy", "file.cut", "file.paste")],
    ["Duplicate", K("file.duplicate")],
    ["Rename", K("file.rename")],
    ["Move to the Recycle Bin", K("file.trash")],
    ["Delete permanently", K("file.deleteForever")],
    ["Bury in the Rip graveyard (an undoable delete you can restore later)", K("file.bury")],
    ["Undo the last action", K("file.undo")],
    ["Select everything", K("file.selectAll")],
    ["New folder", K("file.newFolder")],
    ["New file", K("file.newFile")],
    ["Search this folder", K("nav.search")],
    ["Favorite folders (jump, add, manage)", K("nav.favorites")],
    ["Type a folder location", K("nav.address")],
    ["Refresh", K("nav.refresh")],
    ["Show or hide hidden files", K("view.hidden")],
    ["Show or hide the Details panel", K("view.info")],
    ["Show or hide the terminal", K("terminal.toggle")],
    ["Open the terminal in the selected folder (or this one)", K("terminal.here")],
    ["Paste into the terminal (or Ctrl+V / Ctrl+Shift+V / ⌘V in the terminal)", K("terminal.paste")],
    ["Change the view", `${K("view.details")}  ·  ${K("view.list")}  ·  ${K("view.icons")}`],
    ["Switch window view: Files, Home, Tools, Split, Dual", `${alt}1  ·  ${alt}2  ·  ${alt}3  ·  ${alt}4  ·  ${alt}5`],
    ["Focus (hide toolbar and side panels), Esc to leave", `${alt}6`],
    ["Show or hide the list of places", `${alt}7`],
    ["Expand or restore the tool (ultra focus), Esc to leave", `${K("app.expandTool")}  ·  ${alt}8`],
    ["Filter tools and apps", K("nav.filterTools")],
    ["Open Find in the tools", K("nav.findTool")],
    ["Dual view: switch side, copy, move", `Tab  ·  ${K("dual.copy")}  ·  ${K("dual.move")}`],
    ["Properties", K("file.properties")],
    ["More info and hidden details", K("file.moreInfo")],
    ["Copy the section you are in (its Copy button does the same)", `${alt}Shift+C`],
    ["Secrets tool: lock the vault  ·  copy the selected password  ·  search", `${m}L  ·  ${m}Shift+C  ·  /`],
    ["Right-click menu from the keyboard", `Shift+F10, ${m}Shift+M  or  the Menu key`],
    ["Copy by dragging", `Hold ${copyKey} while dropping`],
    ["Jump to an item", "Just start typing its name"],
    ["This help", `${K("app.help")}  or  ?`],
  ];
}

export function showHelp() {
  openDialog({
    title: "Help",
    wide: true,
    body: [
      h("section", {},
        h("h3", {}, "The basics"),
        h("ul", { class: "tips" },
          h("li", {}, "Click an item to select it. Double-click (or press Enter) to open it."),
          h("li", {}, "Right-click anything for the actions that make sense for it."),
          h("li", {}, "The buttons at the very top change the view: Files, Home (everything this app can do), Tools, Split (files beside a tool) and Dual (two folders). Focus hides the toolbar and side panels."),
          h("li", {}, "Drag items onto a folder in the list or in the sidebar to move them. Hold the copy key to copy instead."),
          h("li", {}, "Deleting never destroys anything straight away: items go to the Recycle Bin (or, if you chose it in Settings, the Rip graveyard), and Undo brings them back. Right-click → Bury (Rip) always uses the graveyard."),
          h("li", {}, `"Show in ${state.fmName === "your file manager" ? "file manager" : state.fmName}" opens the computer's own file manager at the item.`),
          h("li", {}, "Programs and installers always ask before they run."),
          h("li", {}, "Right-click an item and choose Permissions… to see and change who may read, write or run it. You see what would change first, and every change can be undone."),
          h("li", {}, "Right-click pictures, videos, sound files or documents and choose Convert or process to change their format, make them smaller, or combine pictures into a PDF. The new files appear next to the originals."),
          h("li", {}, "Every block of information (a group of details, a table, a log, a result, an error) has a small Copy button when you point at it or tab to it. It copies just that block as plain text. The little arrow beside it offers a table for spreadsheets, Markdown or JSON."),
        ),
      ),
      h("section", {},
        h("h3", {}, "Keyboard shortcuts"),
        h("p", {}, h("button", { type: "button", class: "btn", onclick: () => showShortcutsDialog() }, "Change keyboard shortcuts…")),
        h("table", { class: "keys", "data-copy": "off" }, h("tbody", {}, shortcuts().map(([what, keys]) => h("tr", {}, h("td", {}, what), h("td", { class: "keycap" }, keys))))),
      ),
      h("section", {},
        h("h3", {}, "Good to know"),
        h("ul", { class: "tips" },
          h("li", {}, "The Recycle Bin here belongs to this app, not to your computer's Trash. Items stay in it until you empty it, and they use disk space until then."),
          h("li", {}, "Cut, Copy and Paste of files work inside this window. They don't share the clipboard with other programs. The Copy buttons on sections of information do use the computer's clipboard, and other programs can read it, so don't copy passwords or keys unless you will paste them soon."),
          h("li", {}, "Zip files made here open in any other program. Zip files with a password aren't supported."),
          h("li", {}, "System folders (like Windows, /usr or your Documents folder itself) are protected from being moved or deleted."),
        ),
      ),
    ],
    buttons: [{ label: "About and GitHub", value: "about" }, ...(hasDesktopWindow() ? [{ label: "Reset window", value: "resetwindow" }] : []), { label: "Close", primary: true, value: true }],
  }).result.then((answer) => {
    if (answer === "about") showAbout();
    else if (answer === "resetwindow") resetWindowToDefault();
  });
}

export async function showWelcome() {
  const d = openDialog({
    title: "Welcome to Codecaine File Manager",
    wide: true,
    body: [
      h("p", { class: "lead" }, "Everything is where you'd expect it. Here's a 30-second tour:"),
      h("ol", { class: "tips big" },
        h("li", {}, h("strong", {}, "Places on the left"), " take you to your Documents, Downloads, drives and Recycle Bin."),
        h("li", {}, h("strong", {}, "The address bar"), " shows where you are. Click any part to jump there, or click the empty part to type a location."),
        h("li", {}, h("strong", {}, "Right-click"), " any file or folder to open, copy, rename, zip or delete it."),
        h("li", {}, h("strong", {}, "The buttons at the very top"), " change the view: Files, Home (everything this app can do), Tools, Split (files beside a tool) and Dual (two folders)."),
        h("li", {}, h("strong", {}, "Mistakes are safe:"), " deleted items go to the Recycle Bin and ", h("strong", {}, "Undo"), " brings back the last thing you did."),
      ),
      h("p", { class: "hint" }, "You can read this and all the keyboard shortcuts any time: press F1 or click Help."),
    ],
    buttons: [{ label: "Show me the shortcuts", value: "help" }, { label: "Start", primary: true, value: true }],
  });
  const answer = await d.result;
  await saveSettings({ seenWelcome: true }).catch(() => {});
  if (answer === "help") showHelp();
}

export function showSettings() {
  const choice = (label, key, options, after, tip) => {
    const select = h("select", { class: "select", "aria-label": label, title: tip, onchange: async () => { await saveSettings({ [key]: select.value }); after?.(); } },
      options.map(([v, l]) => h("option", { value: v, selected: state.settings[key] === v }, l)));
    return h("label", { class: "field" }, h("span", { class: "field-label" }, label), select);
  };
  const toggle = (label, key, tip, after) => {
    const input = h("input", { type: "checkbox", checked: state.settings[key] !== false && Boolean(state.settings[key]), onchange: async () => { await saveSettings({ [key]: input.checked }); after?.(); } });
    return h("label", { class: "check", title: tip }, input, h("span", {}, label));
  };
  const size = h("input", { type: "range", min: "80", max: "160", step: "10", value: String(state.settings.textSize), "aria-label": "Text size", oninput: () => { sizeValue.textContent = `${size.value}%`; saveSettings({ textSize: Number(size.value) }); } });
  const sizeValue = h("span", { class: "range-value" }, `${state.settings.textSize}%`);
  const themeNow = h("span", { class: "range-value" }, state.settings.palette ? "" : "Standard");
  currentThemeName().then((name) => { if (name) themeNow.textContent = name; }).catch(() => {});
  const themeRow = h("div", { class: "field" }, h("span", { class: "field-label" }, "Theme"),
    h("span", { class: "range-row" }, h("button", { type: "button", class: "btn", title: "Pick from over 170 themes: dark, light, futuristic special-effects themes, Linux, Windows, macOS, rare classic systems and editor favorites.", onclick: () => showThemePicker() }, "Choose a theme…"), themeNow));
  const recentSummary = h("span", { class: "range-value", dataset: { settingsRecentSummary: "" } });
  const clearRecentsBtn = h("button", {
    type: "button",
    class: "btn",
    dataset: { settingsRecentClear: "" },
    title: "Forget all recently opened files",
    onclick: async () => {
      await clearRecents();
      updateRecentRow();
    },
  }, "Clear recent files");
  const updateRecentRow = () => {
    const count = state.settings.recents.length;
    recentSummary.textContent = isRecentsEnabled() ? `${plural(count, "file")} remembered` : `Turned off (${plural(count, "saved file")})`;
    clearRecentsBtn.disabled = count === 0;
  };
  updateRecentRow();
  const recentRow = h("div", { class: "field" }, h("span", { class: "field-label" }, "Recent files"),
    h("span", { class: "range-row" },
      h("button", {
        type: "button",
        class: "btn",
        dataset: { settingsRecentManage: "" },
        title: "Enable or disable recent files, filter the list, remove missing files or clear all",
        onclick: async () => {
          await showRecentsManager();
          updateRecentRow();
        },
      }, "Manage recent files…"),
      clearRecentsBtn,
      recentSummary));
  const textOpenSelect = h("select", { class: "select", "aria-label": "Open text files with", title: "What double-click, Enter and Open do with text and source files. Documents, programs and other files open in the program your computer uses for them.", onchange: () => saveSettings({ textOpensIn: textOpenSelect.value }) },
    ...[["builtin", "The built-in Code editor"], ["editor", "My code editor (the one chosen below)"], ["system", "The program my computer uses"]].map(([value, label]) => h("option", { value, selected: (state.settings.textOpensIn ?? "builtin") === value }, label)));
  const mediaOpenSelect = h("select", { class: "select", "aria-label": "Open pictures, sound and video with", title: "What double-click, Enter and Open do with pictures, sound and video. The File Manager's viewer has the player, playlist and picture tools; Quick Look's Open button and right-click → Open with… still use another program.", onchange: () => saveSettings({ mediaOpensIn: mediaOpenSelect.value }) },
    ...[["manager", "The File Manager's viewer and player"], ["system", "The program my computer uses"]].map(([value, label]) => h("option", { value, selected: (state.settings.mediaOpensIn ?? "manager") === value }, label)));
  // The editor list comes from the server, which also knows which editors are installed.
  const editorSelect = h("select", { class: "select", "aria-label": "Code editor for “Open in editor”", title: "The program that “Open in editor” (right-click a file) starts. Automatic uses your EDITOR setting or the first of VS Code, Sublime Text, WebStorm or IntelliJ IDEA that is installed.", onchange: () => saveSettings({ editor: editorSelect.value }) },
    h("option", { value: "default", selected: true }, "Automatic"));
  call("editor/info").then(({ choices }) => {
    editorSelect.replaceChildren(...choices.map((c) => h("option", { value: c.id, title: c.hint, selected: state.settings.editor === c.id }, c.available ? c.label : `${c.label} (not found)`)));
  }).catch(() => {});
  openDialog({
    title: "Settings",
    body: [
      themeRow,
      choice("Colors", "theme", [["auto", "Match my computer"], ["light", "Light"], ["dark", "Dark"]]),
      choice("When the File Manager starts, show", "startWith", [["files", "My files"], ["home", "The Home page"], ["last", "The view I used last time"]]),
      choice("When I press Delete, use", "deleteTo", [["bin", "The File Manager's Recycle Bin"], ["graveyard", "The Rip graveyard"]], undefined, "Where the Delete key and the Delete button send things. The Recycle Bin is only for this app; the Rip graveyard is shared with Rip Studio. Both can be undone."),
      choice("Database shortcuts open in", "dbShortcut", [["window", "Their own window"], ["browser", "My web browser"]], undefined, "Where the quick-open buttons for saved database connections (on the Home page, and Shift+Enter in the Databases tool) show the studio."),
      h("p", { class: "hint" }, "The Recycle Bin belongs to this app only. The Rip graveyard is shared with Rip Studio and the bun run cli:rip command, and is found in Find & more → Graveyard. Both can be undone."),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Text size"), h("span", { class: "range-row" }, size, sizeValue)),
      toggle("Show hidden files and folders", "showHidden"),
      toggle("Keep folders at the top of the list", "foldersFirst"),
      toggle("Show the Details panel", "showInfoPanel"),
      toggle("Remember recently opened files", "recentsEnabled", "Keep a list of files you open in the sidebar, on the Home page and under the Recent menu. Turn off to stop recording new files.", updateRecentRow),
      toggle("Warn when a file isn't what its name says", "typeWarnings", "Shows a badge on files like a program named invoice.pdf, and asks before opening the dangerous ones. Turn it off if you don't want these checks."),
      state.platform !== "darwin" ? toggle("My keyboard's Delete key is Backspace (a Mac keyboard on Windows or Linux)", "backspaceDeletes", "A Mac keyboard's Delete key sends Backspace. Turn this on and Backspace moves the selected items to the Recycle Bin (Shift+Backspace deletes for good) instead of going up a folder. Alt+Up still goes up.") : null,
      typeof window.closeApp === "function" ? toggle("Only close the window with its close button", "shortcutsCantClose", `Stops ${state.platform === "darwin" ? "⌘Q and ⌘W" : "Ctrl+Q and Ctrl+W"} from closing the File Manager by accident. Close it with the window's close button instead.${state.platform === "darwin" ? "" : " Alt+F4 is handled by the system itself, so it still closes the window."}`) : null,
      recentRow,
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Open text files with"), textOpenSelect),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Open pictures, sound and video with"), mediaOpenSelect),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Code editor"), editorSelect),
      h("div", { class: "field" }, h("span", { class: "field-label" }, "Keyboard shortcuts"), h("span", { class: "range-row" }, h("button", { type: "button", class: "btn", title: "See every shortcut and change the keys. A key that another action already uses is refused.", onclick: () => showShortcutsDialog() }, "Change keyboard shortcuts…"))),
      windowSection(),
      h("p", { class: "hint" }, "Your choices are saved automatically."),
    ],
    buttons: [{ label: "Done", primary: true, value: true }],
  });
}
