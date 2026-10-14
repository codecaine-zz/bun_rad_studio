// Databases in the file list: a real SQLite file (its first bytes say so, not just its name) gets "Open in SQLite Studio"
// and "Add as database connection", and a `.env` file gets "Import database settings…". Also registers SQLite Studio
// as a built-in program for Open with…, so a person can choose it for a file type; the default way to open is untouched.
import { call } from "./api.js";
import { showEditor } from "./dbEditor.js";
import { showEnvFileImport } from "./dbImport.js";
import { toast } from "./menus.js";
import { registerOpener } from "./openwith.js";
import { openPower } from "./power.js";
import { inTrash, on, state } from "./state.js";
import { baseName, extensionOf } from "./util.js";

const SQLITE_EXTENSIONS = new Set(["sqlite", "sqlite3", "db", "db3", "s3db"]);
const MAX_PROBE = 60;
/** path -> { sig, sqlite } */
const known = new Map();
const sig = (e) => `${e.size}|${e.mtimeMs}`;

const isEnvFile = (name) => /^\.env(\.[A-Za-z0-9_.-]+)?$/.test(name) || /\.env$/.test(name);

/** True when the server has looked at this file and found SQLite's header. */
export function isSqliteFile(entry) {
  const hit = known.get(entry.path);
  return !!hit && hit.sig === sig(entry) && hit.sqlite;
}

/** Forgets what was looked at (for tests that start the page more than once in one process). */
export function resetDatabaseFiles() {
  known.clear();
}

/** Looks at the files in view that are named like databases and remembers which really are. */
export async function probeSqliteFiles() {
  if (typeof document === "undefined" || inTrash()) return;
  const entries = [...(state.search?.entries ?? state.entries ?? [])].filter((e) => !e.isDir && SQLITE_EXTENSIONS.has(extensionOf(e.name)) && known.get(e.path)?.sig !== sig(e)).slice(0, MAX_PROBE);
  if (!entries.length) return;
  try {
    const r = await call("db/sqlite/check", { paths: entries.map((e) => e.path) });
    const by = new Map(r.results.map((x) => [x.path, x.sqlite]));
    for (const e of entries) known.set(e.path, { sig: sig(e), sqlite: by.get(e.path) === true });
  } catch {
    // no answer: the menu simply doesn't offer it
  }
}

export async function openInSqliteStudio(path) {
  try {
    const r = await call("db/sqlite/check", { paths: [path] });
    if (!r.results[0]?.sqlite) return toast("That file isn't an SQLite database, so SQLite Studio can't open it.", { kind: "error" });
  } catch {
    return toast("That file couldn't be checked.", { kind: "error" });
  }
  openPower("databases", { sqlitePath: path });
}

async function addConnection(entry) {
  const saved = await showEditor({ engine: "sqlite", prefill: { name: baseName(entry.path, state.sep), path: entry.path, sqliteMode: "readwrite" } });
  if (saved) toast(`"${saved.name}" was added to Databases.`, { kind: "info", action: { label: "Open Databases", run: () => openPower("databases", { select: saved.id }) } });
}

/** Context-menu items for one selected SQLite file. */
export function sqliteMenuItems(entries) {
  if (entries.length !== 1 || entries[0].isDir || !isSqliteFile(entries[0])) return [];
  const e = entries[0];
  return [
    { label: "Open in SQLite Studio", icon: "🪶", tip: "Open this database in SQLite Studio, inside the Databases tool.", action: () => openInSqliteStudio(e.path) },
    { label: "Add as database connection", icon: "🗄️", tip: "Save this file as a connection in the Databases tool.", action: () => addConnection(e) },
  ];
}

/** Context-menu item for one selected .env file. */
export function envFileMenuItems(entries) {
  if (entries.length !== 1 || entries[0].isDir || !isEnvFile(entries[0].name)) return [];
  const e = entries[0];
  return [{ label: "Import database settings…", icon: "🔑", tip: "Look in this .env file for database connections and choose which to save. The file is only read, never changed.", action: () => showEnvFileImport(e.path) }];
}

registerOpener("sqlite", (path) => openInSqliteStudio(path));
on("view", probeSqliteFiles);
