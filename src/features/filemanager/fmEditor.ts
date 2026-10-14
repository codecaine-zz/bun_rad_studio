/**
 * "Open in editor": starts a code editor on a file with `Bun.openInEditor`, never through a shell.
 *
 * Bun starts the editor in the background and can't say afterwards whether it worked, so the command is looked up
 * first (`Bun.which`) and a plain-words error is given when it isn't there. Terminal editors (vim, nano, ...) are
 * refused: started from here they would have no terminal to run in.
 */
import { promises as fsp } from "fs";
import { absolutePath, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { FmError, describeFsError, pathToFileUrl } from "./fmPaths";
import { loadSettings } from "./fmSettings";

export const EDITOR_IDS = ["default", "vscode", "subl", "webstorm", "idea"] as const;
export type EditorId = (typeof EDITOR_IDS)[number];

interface EditorInfo {
  label: string;
  /** The command Bun starts for this editor. */
  exe: string;
  hint: string;
  install: string;
}

const EDITORS: Record<Exclude<EditorId, "default">, EditorInfo> = {
  vscode: { label: "Visual Studio Code", exe: "code", hint: "Opens the file in VS Code, at the line you ask for.", install: "In VS Code open the Command Palette and run “Shell Command: Install 'code' command in PATH”, then try again." },
  subl: { label: "Sublime Text", exe: "subl", hint: "Opens the file in Sublime Text.", install: "Sublime Text comes with a command called subl. Add it to your PATH (see Sublime Text's help for “command line”), then try again." },
  webstorm: { label: "WebStorm", exe: "webstorm", hint: "Opens the file in WebStorm.", install: "In WebStorm choose Tools, Create Command-line Launcher, then try again." },
  idea: { label: "IntelliJ IDEA", exe: "idea", hint: "Opens the file in IntelliJ IDEA.", install: "In IntelliJ IDEA choose Tools, Create Command-line Launcher, then try again." },
};

/** Editors the "default" choice tries, in this order, when $VISUAL and $EDITOR don't name a usable one. */
const AUTO_ORDER: Array<Exclude<EditorId, "default">> = ["vscode", "subl", "webstorm", "idea"];
const TERMINAL_EDITORS = new Set(["vim", "vi", "nvim", "nano", "emacs", "micro", "pico", "joe", "ne", "hx", "helix", "kak", "ed", "ex", "view", "less", "more"]);
const MAX_LINE = 10_000_000;

export const isEditorId = (value: unknown): value is EditorId => (EDITOR_IDS as readonly unknown[]).includes(value);

/** The command named by $VISUAL or $EDITOR ("code --wait" gives "code"), or "". */
function environmentEditor(ctx: FmContext): string {
  const raw = (ctx.editor.env.VISUAL || ctx.editor.env.EDITOR || "").trim();
  const first = raw.split(/\s+/)[0] ?? "";
  return first.replace(/\\/g, "/").split("/").pop()!.replace(/\.(exe|cmd|bat)$/i, "");
}

export interface EditorChoice {
  id: EditorId;
  label: string;
  hint: string;
  /** Whether the command was found on this computer. "default" is always available (it says why when nothing is). */
  available: boolean;
}

/** The choices for the Settings window, with whether each one can be started from here. */
export function editorChoices(ctx: FmContext): EditorChoice[] {
  const envName = environmentEditor(ctx);
  return [
    { id: "default", label: "Automatic", hint: `Uses the editor named by $VISUAL or $EDITOR${envName ? ` (now: ${envName})` : ""}, or else the first of VS Code, Sublime Text, WebStorm or IntelliJ IDEA that is installed.`, available: true },
    ...(Object.entries(EDITORS) as Array<[Exclude<EditorId, "default">, EditorInfo]>).map(([id, e]) => ({ id, label: e.label, hint: `${e.hint} Needs the "${e.exe}" command.`, available: ctx.editor.which(e.exe) !== null })),
  ];
}

function intField(value: unknown, what: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LINE) throw new FmError("BAD_REQUEST", `${what} must be a whole number from 1 to ${MAX_LINE.toLocaleString("en-US")}.`);
  return n;
}

export interface OpenedInEditor {
  opened: string;
  editor: EditorId;
  /** What was started: the command Bun used or "the editor named in $EDITOR". */
  via: string;
}

/** Opens a file in the chosen editor (the Settings choice when none is given). */
export async function openInEditor(ctx: FmContext, input: { path: unknown; editor?: unknown; line?: unknown; column?: unknown }): Promise<OpenedInEditor> {
  const path = absolutePath(ctx, input.path);
  const name = pathApi(ctx).basename(path);
  const line = intField(input.line, "The line");
  const column = intField(input.column, "The column");
  if (column !== undefined && line === undefined) throw new FmError("BAD_REQUEST", "Give a line number as well as a column.");
  let want: EditorId;
  if (input.editor === undefined || input.editor === null || input.editor === "") want = (await loadSettings(ctx)).editor;
  else if (isEditorId(input.editor)) want = input.editor;
  else throw new FmError("BAD_REQUEST", "Choose Automatic, VS Code, Sublime Text, WebStorm or IntelliJ IDEA.");

  let st;
  try {
    st = await fsp.stat(path);
  } catch (err) {
    const d = describeFsError(err, "open that file");
    throw new FmError(d.code === "ENOENT" ? "NOT_FOUND" : d.code, d.message);
  }
  if (st.isDirectory()) throw new FmError("IS_FOLDER", `"${name}" is a folder. Choose a file to open in an editor.`);
  if (!st.isFile()) throw new FmError("NOT_A_FILE", `"${name}" isn't an ordinary file.`);

  let editor: Exclude<EditorId, "default"> | undefined;
  let command: string | undefined;
  let via: string;
  if (want !== "default") {
    const info = EDITORS[want];
    command = ctx.editor.which(info.exe) ?? undefined;
    if (!command) throw new FmError("NO_EDITOR", `${info.label} can't be started from here: the "${info.exe}" command wasn't found on this computer. ${info.install}`);
    editor = want;
    via = info.exe;
  } else {
    const named = environmentEditor(ctx);
    if (named && TERMINAL_EDITORS.has(named)) {
      throw new FmError("TERMINAL_EDITOR", `Your $EDITOR is "${named}", which runs inside a terminal and can't be started from here. Choose VS Code, Sublime Text, WebStorm or IntelliJ IDEA in Settings instead.`);
    }
    if (named && ctx.editor.which(named)) via = `the editor named in $EDITOR (${named})`;
    else {
      const found = AUTO_ORDER.find((id) => ctx.editor.which(EDITORS[id].exe) !== null);
      command = found ? ctx.editor.which(EDITORS[found].exe) ?? undefined : undefined;
      if (!found) {
        throw new FmError("NO_EDITOR", `No code editor was found. Install VS Code or Sublime Text and add its command to your PATH (VS Code: “Shell Command: Install 'code' command in PATH”), or set the EDITOR environment variable, then try again. You can choose the editor in Settings.`);
      }
      editor = found;
      via = EDITORS[found].exe;
    }
  }
  try {
    ctx.editor.open(path, { ...(editor ? { editor } : {}), ...(command ? { command } : {}), ...(line !== undefined ? { line } : {}), ...(column !== undefined ? { column } : {}) });
  } catch (err: any) {
    throw new FmError("OPEN_FAILED", `Couldn't start the editor: ${String(err?.message ?? err).slice(0, 200)}`);
  }
  return { opened: path, editor: want, via };
}

export const editorOperations: Record<string, FmHandler> = {
  async "editor/info"(ctx) {
    return { choices: editorChoices(ctx), current: (await loadSettings(ctx)).editor };
  },
  async "editor/open"(ctx, b) {
    return { ...(await openInEditor(ctx, { path: b.path, editor: b.editor, line: b.line, column: b.column })) };
  },
  /** The `file://` addresses of some paths (`Bun.pathToFileURL`), for "Copy as a file:// address". */
  async "fileurl/make"(ctx, b) {
    if (!Array.isArray(b.paths) || b.paths.length === 0 || b.paths.length > 500) throw new FmError("BAD_REQUEST", "Choose between 1 and 500 items.");
    return { urls: b.paths.map((p: unknown) => pathToFileUrl(absolutePath(ctx, p))) };
  },
};
