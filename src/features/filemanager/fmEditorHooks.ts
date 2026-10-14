/**
 * The real "start an editor" behaviour behind `ctx.editor` (tests replace all of it).
 *
 * `Bun.openInEditor` finds the editor on the PATH the app was started with, and an app opened from the Dock, the
 * Start menu or a launcher often has a very short PATH that lacks /usr/local/bin or /opt/homebrew/bin. So the editor
 * is looked for in the usual install places too, and when it is found only there it is started directly by its full
 * path (as an argument list, never through a shell), with the same arguments Bun would give it.
 */
import { spawn } from "child_process";
import { existsSync } from "fs";
import * as nodePath from "path";
import type { EditorHooks, FmContext } from "./fmCore";
import { findExecutable, searchDirs } from "./fmTools";

/** Where each editor's command-line program usually is when it was installed without adding it to the PATH. */
function usualPlaces(platform: FmContext["platform"], home: string, command: string): string[] {
  if (platform === "darwin") {
    return {
      code: ["/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code", nodePath.join(home, "Applications/Visual Studio Code.app/Contents/Resources/app/bin/code")],
      subl: ["/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl"],
      webstorm: [nodePath.join(home, "Library/Application Support/JetBrains/Toolbox/scripts/webstorm")],
      idea: [nodePath.join(home, "Library/Application Support/JetBrains/Toolbox/scripts/idea")],
    }[command] ?? [];
  }
  if (platform === "win32") {
    // VS Code's own launcher is a .cmd file, which can't be started without a shell, so only real programs are listed here.
    const files = process.env.ProgramFiles ?? "C:\\Program Files";
    return command === "subl" ? [nodePath.win32.join(files, "Sublime Text", "subl.exe")] : [];
  }
  return [];
}

/** Arguments for starting each editor on a file, at a line and column (VS Code, Sublime Text and JetBrains each have their own way). */
export function editorArguments(editor: string | undefined, path: string, line?: number, column?: number): string[] {
  const at = line === undefined ? path : `${path}:${line}${column === undefined ? "" : `:${column}`}`;
  if (editor === "vscode") return line === undefined ? [path] : ["--goto", at];
  if (editor === "webstorm" || editor === "idea") return [...(line === undefined ? [] : ["--line", String(line)]), ...(column === undefined ? [] : ["--column", String(column)]), path];
  return [at];
}

export function defaultEditorHooks(context: { platform: FmContext["platform"]; home: string; toolDirs?: string[] }): EditorHooks {
  return {
    which(name) {
      const found = findExecutable(context.platform, [name], searchDirs(context));
      if (found || context.toolDirs) return found;
      return Bun.which(name) ?? usualPlaces(context.platform, context.home, name).find((p) => existsSync(p)) ?? null;
    },
    env: process.env,
    open(path, { command, ...options }) {
      // Bun starts it when its own PATH has the editor; otherwise it is started here from where it was found.
      if (command && (context.platform !== "win32" || /\.exe$/i.test(command)) && !Bun.which(nodePath.basename(command).replace(/\.exe$/i, ""))) {
        const child = spawn(command, editorArguments(options.editor, path, options.line, options.column), { detached: true, stdio: "ignore", windowsHide: true, shell: false });
        child.on("error", () => {});
        child.unref();
        return;
      }
      Bun.openInEditor(path, options as Bun.EditorOptions);
    },
  };
}
