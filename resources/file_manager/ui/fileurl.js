// Two small right-click actions that hand a file to other programs: open it in your code editor, and copy its
// file:// address. Both are worked out by the server (Bun.openInEditor and Bun.pathToFileURL).
import { ApiError, call } from "./api.js";
import { toast } from "./menus.js";
import { quotePathsForTerminal, shellFor } from "./codeRun.js";
import { state } from "./state.js";

/** Opens one file in the code editor chosen in Settings. */
export async function openInEditor(entry) {
  try {
    const r = await call("editor/open", { path: entry.path });
    toast(`Sent ${entry.name} to ${r.via}. It opens in a moment.`, { kind: "success" });
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't start the editor.", { kind: "error" });
  }
}

/** Copies the file:// address of each item (one per line). */
export async function copyFileUrls(entries) {
  try {
    const { urls } = await call("fileurl/make", { paths: entries.map((e) => e.path) });
    const r = await call("copytext", { text: urls.join("\n") });
    toast(r.copied ? (entries.length === 1 ? "The file:// address was copied." : "The file:// addresses were copied.") : "Couldn't copy to the clipboard.", { kind: r.copied ? "success" : "error" });
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't make the file:// address.", { kind: "error" });
  }

}

/** Copies the paths quoted for `shell` ("posix", "powershell", "cmd" or "wsl"; the usual shell of this computer when left out). */
export async function copyTerminalPaths(entries, shell = shellFor(state.platform)) {
  const quoted = quotePathsForTerminal(entries.map((entry) => entry.path), shell);
  if (quoted.error) return toast(quoted.error, { kind: "error" });
  try {
    const result = await call("copytext", { text: quoted.text });
    toast(result.copied ? "Shell-quoted paths copied. Paste them after a command in your terminal." : "Couldn't copy paths to the clipboard.", { kind: result.copied ? "success" : "error" });
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't copy paths to the clipboard.", { kind: "error" });
  }
}
