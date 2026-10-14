/**
 * "Open with": the person's own list of programs, and which one opens each kind of file. It is remembered in its
 * own small file in the app's data folder (separate from the ordinary settings, because a program entry decides
 * what the computer will run, so it can only be changed through `openwith/save`, which asks for confirmation).
 *
 * A program is started with an argument list and never through a shell, so file names can't inject commands.
 */
import { existsSync, readdirSync } from "fs";
import { promises as fsp } from "fs";
import { randomBytes } from "crypto";
import * as nodePath from "path";
import { assertOpenAllowed } from "./fmCheck";
import { absolutePath, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";

export interface OpenWithProgram {
  id: string;
  name: string;
  /** "app" is a macOS application name or .app path; "command" is a program name or full path. */
  kind: "app" | "command";
  target: string;
  /** Arguments for a "command"; `{}` is replaced by the file(s). With no `{}` the files are added at the end. */
  args: string[];
}

export interface OpenWithState {
  programs: OpenWithProgram[];
  /** Lower-case extension without the dot -> program id, "default" (the system's choice) or a built-in id. */
  associations: Record<string, string>;
}

export const BUILTIN_PROGRAMS = [
  { id: "builtin:code", name: "Code editor (built in)", builtin: true as const },
  { id: "builtin:sqlite", name: "SQLite Studio (built in)", builtin: true as const },
];
const BUILTIN_IDS = new Set(BUILTIN_PROGRAMS.map((b) => b.id));

export const MAX_PROGRAMS = 40;
export const MAX_ASSOCIATIONS = 300;
export const MAX_FILES_PER_RUN = 20;

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const EXT = /^[a-z0-9][a-z0-9_+-]{0,19}$/;
const clean = (v: unknown, max: number): string | null => (typeof v === "string" && v.length > 0 && v.length <= max && !v.includes("\0") ? v : null);

/** Keeps only what is valid. Unknown program ids in the associations are dropped. */
export function sanitizeOpenWith(raw: unknown): OpenWithState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const programs: OpenWithProgram[] = [];
  for (const x of Array.isArray(r.programs) ? r.programs : []) {
    const p = (x ?? {}) as Record<string, unknown>;
    const id = typeof p.id === "string" && ID.test(p.id) && !p.id.startsWith("builtin") ? p.id : null;
    const name = clean(typeof p.name === "string" ? p.name.trim() : p.name, 60);
    const target = clean(typeof p.target === "string" ? p.target.trim() : p.target, 1024);
    const kind = p.kind === "app" || p.kind === "command" ? p.kind : null;
    if (!id || !name || !target || !kind || programs.length >= MAX_PROGRAMS || programs.some((q) => q.id === id)) continue;
    // `open -a -x` would make the target an option.
    if (target.startsWith("-")) continue;
    const args: string[] = [];
    for (const a of Array.isArray(p.args) ? p.args : []) {
      const s = typeof a === "string" && a.length <= 500 && !a.includes("\0") ? a : null;
      if (s !== null && args.length < 16) args.push(s);
    }
    programs.push({ id, name, kind, target, args });
  }
  const known = new Set([...programs.map((p) => p.id), ...BUILTIN_IDS, "default"]);
  const associations: Record<string, string> = {};
  const given = r.associations && typeof r.associations === "object" ? (r.associations as Record<string, unknown>) : {};
  for (const [ext, id] of Object.entries(given)) {
    const key = ext.toLowerCase().replace(/^\./, "");
    if (EXT.test(key) && typeof id === "string" && known.has(id) && Object.keys(associations).length < MAX_ASSOCIATIONS) associations[key] = id;
  }
  return { programs, associations };
}

const stateFile = (ctx: FmContext) => nodePath.join(ctx.dataDir, "file_manager_openwith.json");

export async function loadOpenWith(ctx: FmContext): Promise<OpenWithState> {
  try {
    return sanitizeOpenWith(JSON.parse(await fsp.readFile(stateFile(ctx), "utf8")));
  } catch {
    return sanitizeOpenWith({});
  }
}

let writing: Promise<unknown> = Promise.resolve();

export async function saveOpenWith(ctx: FmContext, next: unknown): Promise<OpenWithState> {
  const state = sanitizeOpenWith(next);
  const run = async () => {
    await fsp.mkdir(ctx.dataDir, { recursive: true });
    const tmp = `${stateFile(ctx)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    await fsp.rename(tmp, stateFile(ctx));
    return state;
  };
  const result = writing.then(run, run);
  writing = result.catch(() => {});
  return result;
}

export const extensionKey = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : "";
};

/** The command line for a program and some files. Exported so it can be tested without starting anything. */
export function buildLaunch(ctx: Pick<FmContext, "platform">, program: OpenWithProgram, paths: string[]): { command: string; args: string[] } {
  if (program.kind === "app") {
    if (ctx.platform !== "darwin") throw new FmError("BAD_PROGRAM", `"${program.name}" is a Mac application, so it can't be used on this computer. Choose a program instead.`);
    return { command: "open", args: ["-a", program.target, ...paths] };
  }
  const args: string[] = [];
  let placed = false;
  for (const a of program.args) {
    if (a === "{}") {
      args.push(...paths);
      placed = true;
    } else args.push(a);
  }
  if (!placed) args.push(...paths);
  return { command: program.target, args };
}

async function launch(ctx: FmContext, program: OpenWithProgram, paths: string[]): Promise<void> {
  const { command, args } = buildLaunch(ctx, program, paths);
  try {
    await ctx.launch(command, args);
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new FmError("NO_PROGRAM", `Couldn't find "${program.target}". Check the name in Open with, then try again.`);
    throw new FmError("OPEN_FAILED", `Couldn't open that with ${program.name}: ${err?.message ?? err}`);
  }
}

export interface OpenWithResult {
  opened: string;
  program: false;
  with: string;
  builtin?: string;
}

/**
 * Opens files with a chosen program (a saved one, or a built-in one which the page carries out). Starting another
 * program on a file that is dangerously not what its name says needs `confirmMismatch`.
 */
export async function runWith(ctx: FmContext, pathsInput: unknown, programId: unknown, confirmMismatch = false): Promise<OpenWithResult> {
  if (!Array.isArray(pathsInput) || pathsInput.length === 0) throw new FmError("BAD_REQUEST", "Choose something to open.");
  if (pathsInput.length > MAX_FILES_PER_RUN) throw new FmError("TOO_MANY", `Open at most ${MAX_FILES_PER_RUN} items at once.`);
  const paths = pathsInput.map((p) => absolutePath(ctx, p));
  for (const p of paths) {
    try {
      await fsp.stat(p);
    } catch (err: any) {
      if (err?.code === "ENOENT") throw new FmError("NOT_FOUND", "That item doesn't exist any more.");
      throw err;
    }
  }
  const first = paths[0]!;
  if (typeof programId === "string" && BUILTIN_IDS.has(programId)) {
    return { opened: first, program: false, with: BUILTIN_PROGRAMS.find((b) => b.id === programId)!.name, builtin: programId.slice("builtin:".length) };
  }
  for (const p of paths) await assertOpenAllowed(ctx, p, confirmMismatch);
  const state = await loadOpenWith(ctx);
  const program = state.programs.find((p) => p.id === programId);
  if (!program) throw new FmError("NO_PROGRAM", "That program isn't in your Open with list any more.");
  await launch(ctx, program, paths);
  return { opened: first, program: false, with: program.name };
}

/** If the person chose a program for this kind of file, opens it with that one and says so; otherwise null. */
export async function openViaAssociation(ctx: FmContext, pathInput: unknown, confirmMismatch = false): Promise<OpenWithResult | null> {
  const path = absolutePath(ctx, pathInput);
  const ext = extensionKey(pathApi(ctx).basename(path));
  if (!ext) return null;
  const id = (await loadOpenWith(ctx)).associations[ext];
  if (!id || id === "default") return null;
  try {
    if (!(await fsp.stat(path)).isFile()) return null;
  } catch {
    return null;
  }
  return await runWith(ctx, [path], id, confirmMismatch);
}

export interface Suggestion {
  name: string;
  kind: OpenWithProgram["kind"];
  target: string;
}

const LINUX_CANDIDATES: Array<[string, string]> = [
  ["Visual Studio Code", "code"], ["Sublime Text", "subl"], ["gedit", "gedit"], ["Kate", "kate"], ["Mousepad", "mousepad"], ["Xed", "xed"], ["Pluma", "pluma"],
  ["GIMP", "gimp"], ["VLC", "vlc"], ["mpv", "mpv"], ["LibreOffice", "libreoffice"], ["Firefox", "firefox"], ["Chromium", "chromium"], ["Google Chrome", "google-chrome"],
];
const WINDOWS_CANDIDATES: Array<[string, string]> = [["Notepad", "notepad.exe"], ["Paint", "mspaint.exe"], ["WordPad", "wordpad.exe"], ["Visual Studio Code", "code"], ["VLC", "vlc"]];

/** Programs that seem to be installed, to offer as one-click choices. `appDirs` is for tests. */
export function detectPrograms(platform: FmContext["platform"], home: string, appDirs?: string[]): Suggestion[] {
  if (platform === "darwin") {
    const out: Suggestion[] = [];
    for (const dir of appDirs ?? ["/Applications", nodePath.join(home, "Applications")]) {
      if (!existsSync(dir)) continue;
      try {
        for (const f of readdirSync(dir)) if (f.endsWith(".app") && out.length < 300) out.push({ name: f.slice(0, -4), kind: "app", target: f.slice(0, -4) });
      } catch {
        // an unreadable folder just has no suggestions
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  const list = platform === "win32" ? WINDOWS_CANDIDATES : LINUX_CANDIDATES;
  return list.filter(([, cmd]) => Bun.which(cmd)).map(([name, target]) => ({ name, kind: "command" as const, target }));
}

export const openWithOperations: Record<string, FmHandler> = {
  async "openwith/list"(ctx, b) {
    const state = await loadOpenWith(ctx);
    const ext = typeof b.path === "string" ? extensionKey(pathApi(ctx).basename(b.path)) : "";
    return { ...state, builtin: BUILTIN_PROGRAMS, suggestions: detectPrograms(ctx.platform, ctx.home), ext, platform: ctx.platform };
  },
  async "openwith/save"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Changing the programs that open your files needs your confirmation.");
    return await saveOpenWith(ctx, { programs: b.programs, associations: b.associations });
  },
  async "openwith/run"(ctx, b) {
    const result = await runWith(ctx, b.paths, b.programId, b.confirmMismatch === true);
    if (b.always === true && Array.isArray(b.paths) && b.paths.length > 0) {
      const ext = extensionKey(pathApi(ctx).basename(String(b.paths[0])));
      if (ext) {
        const state = await loadOpenWith(ctx);
        await saveOpenWith(ctx, { ...state, associations: { ...state.associations, [ext]: b.programId } });
      }
    }
    return result;
  },
};
