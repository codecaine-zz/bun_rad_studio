// "Import with staging" from the File Manager: a button in the Databases tool and a right-click item on data files.
// Both open the studio of a database with its import wizard (load the rows into a staging table, check them, then promote
// them into a real table, with undo). A data file is handed to the studio by the server, only after this page asks for it.
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { db, engineInfo, errorText, loadOverview } from "./dbState.js";
import { openTarget, shortcutMode } from "./dbShortcuts.js";
import { showMenu, toast } from "./menus.js";
import { openPower } from "./power.js";
import { baseName, extensionOf } from "./util.js";
import { state } from "./state.js";

/** The kinds of database that have tables to stage for. */
const SQL_ENGINES = new Set(["sqlite", "mysql", "postgres"]);
const DATA_EXTENSIONS = new Set(["csv", "tsv", "tab", "psv", "json", "ndjson", "jsonl"]);
const EXCEL_EXTENSIONS = new Set(["xlsx", "xls", "ods"]);
const REDIS_WHY = "Staging is for databases with tables: load rows, check them, then promote them. Redis has no tables, so Redis Studio does not offer it.";

export const isSqlEngine = (engine) => SQL_ENGINES.has(engine);

async function startInTab(target, confirmed = false) {
  try {
    await call("db/studio/start", { ...target, ...(confirmed ? { confirmWrites: true } : {}) });
  } catch (err) {
    if (err instanceof ApiError && err.code === "NEEDS_CONFIRM" && !confirmed) {
      const ok = await confirmBox({
        title: err.details?.reason === "production" ? "This is a production connection" : "This connection is marked read-only",
        message: err.message,
        confirmLabel: "Open anyway",
        danger: true,
      });
      return ok ? startInTab(target, true) : false;
    }
    toast(errorText(err, "The studio couldn't be opened."), { kind: "error" });
    return false;
  }
  // The studio is running now (and has been told what to open); the tab shows the same studio.
  if (target.profileId) openPower("databases", { profileId: target.profileId });
  else openPower("databases", { sqlitePath: target.path });
  return true;
}

/** Opens a studio with the wizard. `mode` is "tab", "window" or "browser". */
export function openImportWizard(target, { name = "The database", mode = "tab", file = null } = {}) {
  const asked = { ...target, ...(file ? { importFile: file } : { importOpen: true }) };
  if (mode === "tab") return startInTab(asked);
  return openTarget(asked, { name, mode });
}

const MODES = [
  ["tab", "Here, in this tab"],
  ["window", "In its own window"],
  ["browser", "In my web browser"],
];

/** The "Import data with staging…" button of a connection in the Databases tool. */
export function importButton(profile) {
  const info = engineInfo(profile.engine);
  const sql = isSqlEngine(profile.engine);
  const btn = h("button", {
    type: "button",
    class: "pw-btn",
    disabled: !sql || !info.studioAvailable,
    title: sql ? `Bring data in safely: load a file into a staging table first, check it, then promote it into a table. Opens ${info.studioName} with the import wizard.` : REDIS_WHY,
  }, "Import data with staging…");
  btn.addEventListener("click", () => {
    const box = btn.getBoundingClientRect();
    showMenu(MODES.map(([mode, label]) => ({ label, action: () => openImportWizard({ profileId: profile.id }, { name: profile.name, mode }) })), { x: box.left, y: box.bottom + 2, anchor: btn, label: "Where should the import wizard open?" });
  });
  return btn;
}

async function chooseDestination(entry) {
  try {
    await call("db/import/check", { path: entry.path });
  } catch (err) {
    toast(errorText(err, "That file can't be loaded this way."), { kind: "error" });
    return;
  }
  if (!db.loaded) {
    try {
      await loadOverview();
    } catch (err) {
      toast(errorText(err, "The saved connections couldn't be loaded."), { kind: "error" });
      return;
    }
  }
  const profiles = db.profiles.filter((p) => isSqlEngine(p.engine) && engineInfo(p.engine).studioAvailable);
  const SQLITE_FILE = "__file__";
  const pick = h("select", { class: "pw-input", "aria-label": "Database to load the file into", title: "Choose a saved connection, or a SQLite file" },
    profiles.map((p) => h("option", { value: p.id }, `${engineInfo(p.engine).icon} ${p.name}`)),
    h("option", { value: SQLITE_FILE }, "🪶 A SQLite file (type its path)…"));
  const path = h("input", { type: "text", class: "pw-input", placeholder: "Full path of the SQLite database file", "aria-label": "Full path of the SQLite database file", title: "The file is opened for reading and writing" });
  const pathRow = h("label", { class: "db-field" }, h("span", {}, "SQLite file"), path);
  const where = h("div", { class: "pw-row", role: "radiogroup", "aria-label": "Where to open the wizard" },
    MODES.map(([mode, label], i) => h("label", { class: "pw-check" }, h("input", { type: "radio", name: "stg-where", value: mode, title: label, "aria-label": label, checked: i === (shortcutMode() === "browser" ? 2 : 0) }), ` ${label}`)));
  const sync = () => {
    pathRow.hidden = pick.value !== SQLITE_FILE;
  };
  pick.addEventListener("change", sync);
  sync();
  const dlg = openDialog({
    title: "Load into a database (staging first)",
    body: [
      h("p", {}, `“${entry.name}” will be copied into a staging table first. You check it there, and only then does it go into a real table. You can undo it afterwards.`),
      h("p", { class: "pw-hint" }, "The file is only read, never changed. It is sent to the studio on this computer, nowhere else."),
      h("label", { class: "db-field" }, h("span", {}, "Database"), pick),
      pathRow,
      h("div", { class: "db-field" }, h("span", {}, "Open the wizard"), where),
    ],
    buttons: [{ label: "Cancel", value: null }, { label: "Open the import wizard", value: true, primary: true }],
    describe: "Choose a saved connection or a SQLite file, and where the import wizard should open.",
  });
  if (!(await dlg.result)) return;
  const mode = where.querySelector("input:checked")?.value ?? "tab";
  let target;
  let name;
  if (pick.value === SQLITE_FILE) {
    const text = path.value.trim();
    if (!text) return toast("Type the full path of the SQLite file.", { kind: "error" });
    try {
      const r = await call("db/sqlite/check", { paths: [text] });
      if (!r.results[0]?.sqlite) return toast("That isn't an SQLite database file.", { kind: "error" });
    } catch (err) {
      return toast(errorText(err, "That file couldn't be checked."), { kind: "error" });
    }
    target = { engine: "sqlite", path: text };
    name = baseName(text, state.sep);
  } else {
    const p = profiles.find((x) => x.id === pick.value);
    target = { profileId: pick.value };
    name = p?.name ?? "The database";
  }
  await openImportWizard(target, { name, mode, file: entry.path });
}

/** Right-click item for one selected data file (CSV, TSV, JSON, JSON Lines). Excel files get an honest, disabled item. */
export function importFileMenuItems(entries) {
  if (entries.length !== 1 || entries[0].isDir) return [];
  const e = entries[0];
  const ext = extensionOf(e.name);
  if (DATA_EXTENSIONS.has(ext)) {
    return [{ label: "Load into a database (staging first)…", icon: "📥", tip: "Copy this file's rows into a staging table of a database, check them there, then promote them into a table. The file is only read.", action: () => chooseDestination(e) }];
  }
  if (EXCEL_EXTENSIONS.has(ext)) {
    return [{ label: "Load into a database (staging first)…", icon: "📥", disabled: true, tip: "Excel files can't be read here. In Excel use File → Save As → “CSV UTF-8”, then load that file." }];
  }
  return [];
}
