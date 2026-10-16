// What the Dev tool can do with a result: show it in the file list, open it in the Code editor, type a command into
// the Terminal, or move a folder to the Recycle Bin. Each one is started by a click and says what it did.
import { call } from "./api.js";
import { commandInFolder } from "./codeRun.js";
import { confirmBox, messageBox } from "./dialogs.js";
import { toast } from "./menus.js";
import { goTo } from "./nav.js";
import { openPower } from "./power.js";
import { state } from "./state.js";
import { terminalAvailable, terminalShell, terminalWsl, typeInTerminal } from "./terminal.js";
import { parentOf } from "./util.js";
import { errorText } from "./devCore.js";

/** The full path of `rel` below the scanned folder. */
export const joinRoot = (root, rel) => `${root.replace(/[\\/]+$/, "")}${state.sep}${rel.split("/").join(state.sep)}`;

/** Selects the item in the file list (the Files, Split and Dual views show it). */
export async function revealPath(path) {
  const parent = parentOf(path, state.sep);
  if (parent && (await goTo(parent, { select: path }))) toast("Selected in the file list. Switch to Files or Split view to see it.", { kind: "info" });
}

let codeOpener = (path, line) => openPower("code", { open: path, line });

/** Lets a test see which file the Code editor is asked to open (the real editor needs a full page). */
export function setCodeOpener(fn) {
  codeOpener = fn ?? ((path, line) => openPower("code", { open: path, line }));
}

/** Opens a text file in the Code editor, at a line when one is given. */
export function openInCodeAt(path, line = 1) {
  codeOpener(path, line);
}

/** Asks first, then types the command into the Terminal and presses Enter, like the Code editor's Run presets. */
export async function runInTerminal(folder, commandText, display = commandText) {
  // Written for the shell the Terminal is in now: PowerShell, the Command Prompt, WSL or Git Bash on Windows.
  const run = commandInFolder(folder, commandText, terminalShell(), terminalWsl());
  if (run.error || /[\r\n\0]/.test(commandText)) return void (await messageBox("This command can't be sent", run.error ?? "It has a line break in it."));
  const line = run.text;
  if (!terminalAvailable()) return void (await messageBox("The Terminal isn't available on this system", `Run this in your system's terminal: ${line}`));
  const ok = await confirmBox({ title: "Run this in the Terminal?", message: `The project's own script will run on your computer: "${display}".`, details: [line], confirmLabel: "Run it" });
  if (!ok) return;
  if (!typeInTerminal(`${line}\r`)) return void toast("The Terminal couldn't be opened.", { kind: "error" });
  toast(`Running in the Terminal: ${display}`, { kind: "info", timeout: 6000 });
}

/** Moves folders to the Recycle Bin after asking. Never deletes for good. Resolves true when something moved. */
export async function trashFolders(paths, summary) {
  const ok = await confirmBox({ title: "Move to the Recycle Bin?", message: `${summary} You can put them back from the Recycle Bin.`, details: paths, confirmLabel: "Move to Recycle Bin", danger: true });
  if (!ok) return false;
  try {
    const res = await call("trash", { paths });
    const failed = res.results.filter((r) => !r.ok);
    if (failed.length) toast(failed[0].message, { kind: "error" });
    const moved = res.results.length - failed.length;
    if (moved) toast(`Moved ${moved} folder${moved === 1 ? "" : "s"} to the Recycle Bin.`, { kind: "success" });
    return moved > 0;
  } catch (err) {
    toast(errorText(err, "Couldn't move them to the Recycle Bin."), { kind: "error" });
    return false;
  }
}
