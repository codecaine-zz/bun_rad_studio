// "Copy image to clipboard" and "Copy text to clipboard" for a file: the right-click menu and Quick Look use these.
// The server reads the file and writes the system clipboard (it works in every window). Only a picture that the
// server's tools can't handle falls back to the browser's own clipboard.
import { ApiError, call, rawUrl } from "./api.js";
import { looksLikeText } from "./codeLang.js";
import { toast } from "./menus.js";
import { plural } from "./util.js";

export const canCopyImage = (entry) => !!entry && !entry.isDir && entry.kind === "image";
/** Names that are plain text by their extension. The server still checks the contents before copying. */
export const canCopyText = (entry) => !!entry && !entry.isDir && entry.kind !== "image" && looksLikeText(entry.name);

/** A picture as PNG bytes, drawn by the browser engine (which knows WebP, AVIF and SVG), for the browser clipboard. */
async function pngBlobOf(path) {
  const res = await fetch(rawUrl(path));
  if (!res.ok) throw new Error("The picture couldn't be read.");
  const blob = await res.blob();
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture couldn't be converted."))), "image/png"));
}

export async function copyImageFile(entry) {
  try {
    await call("clip/image", { path: entry.path });
    toast(`Copied the picture “${entry.name}” to the clipboard. Paste it into a document, chat or image editor.`, { kind: "success" });
    return true;
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "The picture couldn't be copied.";
    // The server's tools couldn't do it (an odd format, or no clipboard tool): the browser may still be able to.
    if (err instanceof ApiError && err.code === "CLIPBOARD_FAILED" && navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": await pngBlobOf(entry.path) })]);
        toast(`Copied the picture “${entry.name}” to the clipboard.`, { kind: "success" });
        return true;
      } catch { /* say what the server said */ }
    }
    toast(message, { kind: "error" });
    return false;
  }
}

export async function copyTextFile(entry) {
  try {
    const r = await call("clip/text", { path: entry.path });
    toast(`Copied the text of “${entry.name}” (${plural(r.lines, "line")}) to the clipboard.`, { kind: "success" });
    return true;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "The text couldn't be copied.", { kind: "error" });
    return false;
  }
}
