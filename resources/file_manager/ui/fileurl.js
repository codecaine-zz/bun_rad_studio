// Two small right-click actions that hand a file to other programs: open it in your code editor, and copy its
// file:// address. Both are worked out by the server (Bun.openInEditor and Bun.pathToFileURL).
import { ApiError, call } from "./api.js";
import { toast } from "./menus.js";

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
