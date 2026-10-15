/**
 * Saved project workspaces: a named set of folders and the things you use with them, so one click puts everything back.
 *
 * A workspace remembers: its name, project folders, the folders and tool that were open, saved search settings (what
 * to look for, filters, ignore rules), favorite commands, which File Manager tools it uses, and which saved database
 * connections it uses. Operation history is not copied into it; it is looked up by folder, so a workspace shows the
 * copies, moves and renames that touched its folders (fmOpHistory.ts).
 *
 * Safety rules, covered by tests (tests/file_manager_workspaces.test.ts):
 *  - No secrets are ever stored. Database connections are saved as a reference (the id and name of the connection); the
 *    password stays where it already is, in the system keychain behind the Databases tool. Anything that looks like a
 *    password, token, key or a URL with a password in it is refused with a message, in names, commands and filters.
 *  - Commands are never run by the File Manager server. They are listed, and the page can only put one in the terminal
 *    for the person to read and press Enter. Commands from an imported file arrive UNTRUSTED and stay marked until the
 *    person trusts each one after reading it. A trusted command that is edited becomes untrusted again.
 *  - Missing folders, connections or tools do not break opening a workspace: each is reported as missing and the rest
 *    still opens.
 *  - The file is versioned (`version: 1`), written atomically with owner-only permissions, validated on every read, and
 *    never overwritten when it was written by a newer version of the app.
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, lstatOrNull, type FmContext, type FmHandler } from "./fmCore";
import { dbStore } from "./fmDbState";
import { FmError, isSameOrInside } from "./fmPaths";
import { loadHistory, type HistoryEntry } from "./fmOpHistory";
import { makeFile } from "./fmOps";

export const WORKSPACE_VERSION = 1;
export const WORKSPACE_FORMAT = "bun-rad-file-manager-workspace";
export const MAX_WORKSPACES = 100;
const MAX_FOLDERS = 40;
const MAX_COMMANDS = 30;
const MAX_IGNORE = 200;
const MAX_IMPORT_BYTES = 256 * 1024;
const VIEWS = ["files", "home", "tools", "split", "dual"] as const;

export interface WorkspaceCommand {
  id: string;
  label: string;
  /** One line. Never run by the server. */
  command: string;
  cwd: string | null;
  trusted: boolean;
}

export interface WorkspaceDatabaseRef {
  id: string;
  name: string;
  engine: string;
}

export interface WorkspaceSearch {
  pattern: string;
  mode: string;
  caseMode: string;
  type: string;
  extensions: string[];
  exclude: string[];
  size: string;
  modified: string;
  hidden: boolean;
  noIgnore: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  source: "local" | "imported";
  createdAt: string;
  updatedAt: string;
  roots: string[];
  openFolders: string[];
  view: (typeof VIEWS)[number];
  tool: string | null;
  search: WorkspaceSearch;
  /** Patterns in .gitignore syntax, used by Compare folders and shown beside the search settings. */
  ignore: string[];
  commands: WorkspaceCommand[];
  tools: string[];
  databases: WorkspaceDatabaseRef[];
}

interface WorkspaceFile {
  version: number;
  workspaces: Workspace[];
}

// ---------------------------------------------------------------------------------------------------------------
// Keeping secrets out
// ---------------------------------------------------------------------------------------------------------------

const SECRET_NAME = /(pass(word|wd|phrase)?|pwd|secret|token|api[-_]?key|private[-_]?key|credential|auth(orization)?|bearer|session[-_]?id)/i;
const TOKEN_SHAPES: Array<[RegExp, string]> = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i, "an address with a password in it"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, "a GitHub token"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "an API key"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS key"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, "a login token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
];
const ASSIGNMENT = /(?:^|[\s"';,&|(])(?:--?)?([A-Za-z0-9_.-]*(?:pass(?:word|wd|phrase)?|pwd|secret|token|api[-_]?key|credential|authorization|bearer)[A-Za-z0-9_.-]*)\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/i;

/** What looks like a secret in `text`, or null. `command` also checks `NAME=value` assignments (a $VARIABLE value is fine). */
export function secretIn(text: string, command = false): string | null {
  for (const [re, what] of TOKEN_SHAPES) if (re.test(text)) return what;
  if (command) {
    const m = ASSIGNMENT.exec(text);
    if (m) {
      const value = m[2]!.replace(/^["']|["']$/g, "");
      if (value && !/^(\$|%|<|\{|\[)/.test(value) && !/^(true|false|yes|no|prompt|ask|stdin|none|\*+)$/i.test(value)) return `a value for "${m[1]}"`;
    }
  }
  return null;
}

function refuse(where: string, what: string): never {
  throw new FmError("SECRET_IN_WORKSPACE", `${where} seems to contain ${what}. Workspaces never store passwords, tokens or keys. Use an environment variable (like $MY_TOKEN) or the Databases tool's saved connections instead.`);
}

const noSecrets = (where: string, text: string, command = false) => {
  const found = secretIn(text, command);
  if (found) refuse(where, found);
};

// ---------------------------------------------------------------------------------------------------------------
// Checking what comes in
// ---------------------------------------------------------------------------------------------------------------

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\0\r\n]/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const idOf = (v: unknown): string => (typeof v === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(v) ? v : randomBytes(6).toString("hex"));

function folders(ctx: FmContext, v: unknown, where: string): string[] {
  const out: string[] = [];
  for (const raw of list(v, MAX_FOLDERS)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    let path: string;
    try { path = absolutePath(ctx, raw); } catch { throw new FmError("BAD_PATH", `"${str(raw, 80)}" in ${where} isn't a full folder path.`); }
    noSecrets(where, path);
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

function searchOf(v: unknown): WorkspaceSearch {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const words = (x: unknown) => list(x, 60).map((w) => str(w, 80)).filter(Boolean);
  const out: WorkspaceSearch = {
    pattern: str(s.pattern, 500),
    mode: ["regex", "glob", "literal"].includes(String(s.mode)) ? String(s.mode) : "regex",
    caseMode: ["smart", "sensitive", "ignore"].includes(String(s.caseMode)) ? String(s.caseMode) : "smart",
    type: str(s.type, 20) || "all",
    extensions: words(s.extensions),
    exclude: words(s.exclude),
    size: str(s.size, 40),
    modified: str(s.modified, 40),
    hidden: s.hidden === true,
    noIgnore: s.noIgnore === true,
  };
  for (const [k, value] of Object.entries(out)) {
    if (typeof value === "string") noSecrets(`The saved search (${k})`, value);
    else if (Array.isArray(value)) for (const w of value) noSecrets(`The saved search (${k})`, w);
  }
  return out;
}

type Mode = "save" | "import" | "stored";

/**
 * A command, as a person typed it. Trust: from an import never; from the file on disk as it was stored; when saving, an
 * existing command keeps its trust only if its text and folder are unchanged, and a command the person just added is trusted.
 */
function commandOf(ctx: FmContext, raw: unknown, mode: Mode, previous?: WorkspaceCommand): WorkspaceCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const command = typeof c.command === "string" ? c.command.trim() : "";
  if (!command) return null;
  if (/[\0\r\n]/.test(command)) throw new FmError("BAD_COMMAND", "A saved command must be a single line. Put several steps in a script file and save the command that runs it.");
  if (command.length > 2000) throw new FmError("BAD_COMMAND", "That command is too long (2000 characters at most).");
  const label = str(c.label, 80) || command.slice(0, 40);
  noSecrets(`The command "${label}"`, command, true);
  noSecrets(`The label "${label}"`, label);
  let cwd: string | null = null;
  if (typeof c.cwd === "string" && c.cwd.trim()) {
    try { cwd = absolutePath(ctx, c.cwd); } catch { throw new FmError("BAD_PATH", `The folder for "${label}" isn't a full path.`); }
  }
  let trusted = false;
  if (mode === "stored") trusted = c.trusted === true;
  else if (mode === "save") trusted = previous ? previous.trusted && previous.command === command && previous.cwd === cwd : c.trusted !== false;
  return { id: idOf(c.id), label, command, cwd, trusted };
}

export function sanitizeWorkspace(ctx: FmContext, raw: unknown, options: { mode: Mode; previous?: Workspace }): Workspace {
  if (!raw || typeof raw !== "object") throw new FmError("BAD_REQUEST", "That isn't a workspace.");
  const w = raw as Record<string, unknown>;
  const name = str(w.name, 80);
  if (!name) throw new FmError("BAD_NAME", "Give the workspace a name.");
  noSecrets("The name", name);
  const prevCommands = new Map((options.previous?.commands ?? []).map((c) => [c.id, c] as const));
  const commands: WorkspaceCommand[] = [];
  for (const rawCommand of list(w.commands, MAX_COMMANDS)) {
    const id = rawCommand && typeof rawCommand === "object" ? (rawCommand as { id?: unknown }).id : undefined;
    const c = commandOf(ctx, rawCommand, options.mode, typeof id === "string" ? prevCommands.get(id) : undefined);
    if (c && !commands.some((x) => x.id === c.id)) commands.push(c);
  }
  const ignore = list(w.ignore, MAX_IGNORE).map((l) => str(l, 300)).filter((l) => l && !l.startsWith("#"));
  for (const line of ignore) noSecrets("An ignore rule", line);
  const databases: WorkspaceDatabaseRef[] = [];
  for (const d of list(w.databases, 40)) {
    if (!d || typeof d !== "object") continue;
    const ref = d as Record<string, unknown>;
    if (typeof ref.id !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(ref.id)) continue;
    // Only the reference is kept, whatever else the object holds (a host, a user or a password).
    databases.push({ id: ref.id, name: str(ref.name, 80) || ref.id, engine: str(ref.engine, 20) });
  }
  const now = new Date().toISOString();
  const stored = options.mode === "stored";
  return {
    id: stored ? idOf(w.id) : (options.previous?.id ?? randomBytes(8).toString("hex")),
    name,
    source: stored ? (w.source === "imported" ? "imported" : "local") : (options.previous?.source ?? (options.mode === "import" ? "imported" : "local")),
    createdAt: stored ? str(w.createdAt, 40) || now : (options.previous?.createdAt ?? now),
    updatedAt: stored ? str(w.updatedAt, 40) || now : now,
    roots: folders(ctx, w.roots, "the project folders"),
    openFolders: folders(ctx, w.openFolders, "the open folders"),
    view: (VIEWS as readonly string[]).includes(String(w.view)) ? (w.view as Workspace["view"]) : "files",
    tool: typeof w.tool === "string" && /^[a-z0-9-]{1,40}$/.test(w.tool) ? w.tool : null,
    search: searchOf(w.search),
    ignore,
    commands,
    tools: [...new Set(list(w.tools, 40).filter((t): t is string => typeof t === "string" && /^[a-z0-9-]{1,40}$/.test(t)))],
    databases,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------------------------

export const workspaceFile = (ctx: FmContext) => nodePath.join(ctx.dataDir, "file_manager_workspaces.json");

interface Loaded {
  workspaces: Workspace[];
  /** The file was written by a newer version: it is read-only here, so it is never overwritten. */
  newer: boolean;
  skipped: number;
}

async function load(ctx: FmContext): Promise<Loaded> {
  let text: string;
  try {
    text = await fsp.readFile(workspaceFile(ctx), "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return { workspaces: [], newer: false, skipped: 0 };
    throw new FmError("READ_FAILED", "The saved workspaces couldn't be read.");
  }
  let data: Partial<WorkspaceFile> | null = null;
  try { data = JSON.parse(text); } catch { /* damaged: treated as empty, and the damaged file is kept aside when saving */ }
  if (!data || typeof data !== "object") return { workspaces: [], newer: false, skipped: 1 };
  if (typeof data.version === "number" && data.version > WORKSPACE_VERSION) return { workspaces: [], newer: true, skipped: 0 };
  const workspaces: Workspace[] = [];
  let skipped = 0;
  for (const raw of list(data.workspaces, MAX_WORKSPACES)) {
    try {
      workspaces.push(sanitizeWorkspace(ctx, raw, { mode: "stored" }));
    } catch {
      skipped++;
    }
  }
  return { workspaces, newer: false, skipped };
}

async function save(ctx: FmContext, loaded: Loaded, workspaces: Workspace[]): Promise<void> {
  if (loaded.newer) throw new FmError("NEWER_FILE", "The saved workspaces were written by a newer version of the app. They were left untouched; update the app to change them.");
  await fsp.mkdir(ctx.dataDir, { recursive: true });
  const file = workspaceFile(ctx);
  if (loaded.skipped) await fsp.copyFile(file, `${file}.damaged`).catch(() => {});
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  const body: WorkspaceFile = { version: WORKSPACE_VERSION, workspaces };
  await fsp.writeFile(tmp, JSON.stringify(body, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, file);
}

// ---------------------------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------------------------

export type FolderStatus = "ok" | "missing" | "not-folder" | "no-access";

async function folderStatus(path: string): Promise<FolderStatus> {
  const st = await lstatOrNull(path);
  if (!st) return "missing";
  const target = st.isSymbolicLink() ? await fsp.stat(path).catch(() => null) : st;
  if (!target?.isDirectory()) return "not-folder";
  try { await fsp.readdir(path); return "ok"; } catch { return "no-access"; }
}

async function resolve(ctx: FmContext, w: Workspace) {
  const withStatus = async (paths: string[]) => await Promise.all(paths.map(async (path) => ({ path, status: await folderStatus(path) })));
  let connections = new Map<string, { name: string }>();
  let databasesKnown = true;
  try {
    connections = new Map(dbStore(ctx).listPlain().map((p) => [p.id, { name: p.name }] as const));
  } catch {
    databasesKnown = false;
  }
  const rootsOnly = w.roots.length ? w.roots : [];
  let history: HistoryEntry[] = [];
  if (rootsOnly.length) {
    try {
      const all = await loadHistory(ctx, new Set(ctx.jobs.list().map((j) => j.id)));
      history = all.reverse().filter((e) => e.items.some((i) => [i.source, i.destination].some((p) => p && rootsOnly.some((r) => isSameOrInside(p, r, ctx.platform))))).slice(0, 20);
    } catch { history = []; }
  }
  return {
    workspace: w,
    roots: await withStatus(w.roots),
    openFolders: await withStatus(w.openFolders),
    databases: w.databases.map((d) => ({ ...d, status: !databasesKnown ? "unknown" : connections.has(d.id) ? "ok" : "missing", currentName: connections.get(d.id)?.name ?? null })),
    history,
  };
}

const find = (loaded: Loaded, id: unknown): Workspace => {
  const w = typeof id === "string" ? loaded.workspaces.find((x) => x.id === id) : undefined;
  if (!w) throw new FmError("NOT_FOUND", "That workspace doesn't exist (any more).");
  return w;
};

export interface ExportFile {
  format: typeof WORKSPACE_FORMAT;
  version: number;
  workspace: Omit<Workspace, "id" | "source" | "createdAt" | "updatedAt" | "commands"> & { commands: Array<Pick<WorkspaceCommand, "label" | "command" | "cwd">> };
}

function exportFile(w: Workspace): { text: string; fileName: string } {
  const file: ExportFile = {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    workspace: {
      name: w.name, roots: w.roots, openFolders: w.openFolders, view: w.view, tool: w.tool, search: w.search, ignore: w.ignore,
      commands: w.commands.map(({ label, command, cwd }) => ({ label, command, cwd })), tools: w.tools,
      databases: w.databases.map(({ id, name, engine }) => ({ id, name, engine })),
    },
  };
  return { text: JSON.stringify(file, null, 2), fileName: `${w.name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace"}.workspace.json` };
}

export const workspaceOperations: Record<string, FmHandler> = {
  async "workspace/list"(ctx) {
    const loaded = await load(ctx);
    return { workspaces: loaded.workspaces, version: WORKSPACE_VERSION, readOnly: loaded.newer, skipped: loaded.skipped };
  },
  async "workspace/save"(ctx, b) {
    const loaded = await load(ctx);
    const previous = typeof b.workspace?.id === "string" ? loaded.workspaces.find((w) => w.id === b.workspace.id) : undefined;
    if (!previous && loaded.workspaces.length >= MAX_WORKSPACES) throw new FmError("TOO_MANY", `You can keep up to ${MAX_WORKSPACES} workspaces. Delete one you no longer use.`);
    const w = sanitizeWorkspace(ctx, b.workspace, { mode: "save", previous });
    if (loaded.workspaces.some((x) => x.id !== w.id && x.name.toLowerCase() === w.name.toLowerCase())) throw new FmError("EXISTS", `A workspace named "${w.name}" already exists. Choose another name.`);
    await save(ctx, loaded, previous ? loaded.workspaces.map((x) => (x.id === w.id ? w : x)) : [...loaded.workspaces, w]);
    return { workspace: w };
  },
  async "workspace/delete"(ctx, b) {
    const loaded = await load(ctx);
    const w = find(loaded, b.id);
    await save(ctx, loaded, loaded.workspaces.filter((x) => x.id !== w.id));
    return { deleted: w.id };
  },
  /** What is still there: each folder and connection with its status. Opening a workspace uses this. */
  async "workspace/resolve"(ctx, b) {
    return await resolve(ctx, find(await load(ctx), b.id));
  },
  /** The person read the command and trusts it. Only a local command can be trusted; the server still never runs it. */
  async "workspace/trust"(ctx, b) {
    const loaded = await load(ctx);
    const w = find(loaded, b.id);
    const c = w.commands.find((x) => x.id === b.commandId);
    if (!c) throw new FmError("NOT_FOUND", "That command doesn't exist (any more).");
    if (typeof b.command !== "string" || b.command !== c.command) throw new FmError("CHANGED", "The command is different from the one you were shown. Open the workspace again and read it first.");
    c.trusted = b.trusted === true;
    w.updatedAt = new Date().toISOString();
    await save(ctx, loaded, loaded.workspaces);
    return { workspace: w };
  },
  async "workspace/export"(ctx, b) {
    return exportFile(find(await load(ctx), b.id));
  },
  /** Writes the export into a folder as a new file (never replacing one with the same name). */
  async "workspace/export-save"(ctx, b) {
    const { text, fileName } = exportFile(find(await load(ctx), b.id));
    return await makeFile(ctx, b.folder, fileName, text);
  },
  /** Reads a workspace file. Every command in it is untrusted, and folders that don't exist here are simply reported missing. */
  async "workspace/import"(ctx, b) {
    if (typeof b.text !== "string" || !b.text.trim()) throw new FmError("BAD_REQUEST", "Paste or open a workspace file first.");
    if (Buffer.byteLength(b.text) > MAX_IMPORT_BYTES) throw new FmError("TOO_BIG", "That file is too big to be a workspace file.");
    let data: any;
    try { data = JSON.parse(b.text); } catch { throw new FmError("BAD_FILE", "That isn't a workspace file (it isn't valid JSON)."); }
    if (!data || data.format !== WORKSPACE_FORMAT) throw new FmError("BAD_FILE", "That isn't a File Manager workspace file.");
    if (typeof data.version !== "number" || data.version > WORKSPACE_VERSION) throw new FmError("NEWER_FILE", "That workspace file was made by a newer version of the app.");
    const loaded = await load(ctx);
    if (loaded.workspaces.length >= MAX_WORKSPACES) throw new FmError("TOO_MANY", `You can keep up to ${MAX_WORKSPACES} workspaces. Delete one you no longer use.`);
    const w = sanitizeWorkspace(ctx, data.workspace, { mode: "import" });
    let name = w.name;
    for (let i = 2; loaded.workspaces.some((x) => x.name.toLowerCase() === name.toLowerCase()); i++) name = `${w.name} (${i})`;
    w.name = name;
    await save(ctx, loaded, [...loaded.workspaces, w]);
    return { workspace: w, untrustedCommands: w.commands.length };
  },
};
