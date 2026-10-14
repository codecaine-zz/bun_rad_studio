/**
 * Opening things with the operating system: the default program for a file, or the system file manager pointed at
 * an item. Programs are started with an argument list and never through a shell, so a file name can't inject commands.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, pathApi, type FmContext } from "./fmCore";
import { FmError, classify, systemFileManagerName, type Platform } from "./fmPaths";

const HELP_LINUX = "Opening needs the 'xdg-open' program, which this computer doesn't seem to have. Install it (package 'xdg-utils') and try again.";

async function startProgram(ctx: FmContext, command: string, args: string[], verbatim = false): Promise<void> {
  try {
    await ctx.launch(command, args, verbatim ? { windowsVerbatimArguments: true } : undefined);
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new FmError("NO_OPENER", ctx.platform === "linux" ? HELP_LINUX : `Couldn't start "${command}" to open that.`);
    throw new FmError("OPEN_FAILED", `Couldn't open that: ${err?.message ?? err}`);
  }
}

export interface Command {
  command: string;
  args: string[];
  /** Windows only: pass the arguments exactly as given (explorer.exe's /select needs its own quoting). */
  verbatim?: boolean;
}

/** The command that opens `path` with its default program on this platform. */
export function openCommand(platform: Platform, path: string): Command {
  if (platform === "darwin") return { command: "open", args: [path] };
  if (platform === "win32") return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", path] };
  return { command: "xdg-open", args: [path] };
}

/** The command that shows `path` in the system file manager, selected where the system can do that. */
export function revealCommand(platform: Platform, path: string, isDir: boolean): Command & { selects: boolean } {
  if (platform === "darwin") return { command: "open", args: ["-R", path], selects: true };
  if (platform === "win32") return { command: "explorer.exe", args: [`/select,"${path}"`], verbatim: true, selects: true };
  return { command: "xdg-open", args: [isDir ? path : nodePath.posix.dirname(path)], selects: false };
}

/**
 * Opens a file or folder with its default program. A program or installer (.exe, .sh, .app, .msi ...) is only run
 * when `confirmProgram` is true, which the app sets after asking the person.
 */
export async function openItem(ctx: FmContext, pathInput: unknown, confirmProgram = false): Promise<{ opened: string; program: boolean }> {
  const path = absolutePath(ctx, pathInput);
  let st;
  try {
    st = await fsp.stat(path);
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new FmError("NOT_FOUND", "That item doesn't exist any more.");
    throw err;
  }
  const kind = classify(pathApi(ctx).basename(path), st.isDirectory(), ctx.platform !== "win32" && !st.isDirectory() && (st.mode & 0o111) !== 0);
  if (kind.program && !confirmProgram) throw new FmError("NEEDS_CONFIRM", "This is a program or installer. Opening it will run it.");
  const cmd = openCommand(ctx.platform, path);
  await startProgram(ctx, cmd.command, cmd.args, cmd.verbatim);
  return { opened: path, program: kind.program };
}

/** Shows the item in the system file manager (selected where the system supports that). */
export async function revealItem(ctx: FmContext, pathInput: unknown): Promise<{ revealed: string; selected: boolean; with: string }> {
  const path = absolutePath(ctx, pathInput);
  let st;
  try {
    st = await fsp.stat(path);
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new FmError("NOT_FOUND", "That item doesn't exist any more.");
    throw err;
  }
  const cmd = revealCommand(ctx.platform, path, st.isDirectory());
  await startProgram(ctx, cmd.command, cmd.args, cmd.verbatim);
  return { revealed: path, selected: cmd.selects, with: systemFileManagerName(ctx.platform) };
}
