// Putting text on the clipboard and telling the person what happened. The File Manager's own "copytext" operation
// writes the system clipboard (it works in every window); the browser's clipboard is only the fallback.
import { call } from "./api.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { MAX_CHARS } from "./copyformat.js";

export const SECRET_NOTE = "Other programs can read the clipboard, so paste it soon.";

/**
 * Copies `text`. `what` names it in the message ("Copied “Git summary”."), `secret` adds the clipboard warning,
 * `shortened` says the text was cut to fit. Resolves to true when the text reached the clipboard.
 * @param {string} text
 * @param {{ what?: string, secret?: boolean, shortened?: boolean, quiet?: boolean }} [options]
 */
export async function copyToClipboard(text, { what = "", secret = false, shortened = false, quiet = false } = {}) {
  const say = (message, kind) => {
    if (!quiet || kind === "error") toast(message, { kind });
  };
  if (typeof text !== "string" || text === "") {
    say(`There is nothing to copy${what ? ` in “${what}”` : ""} yet.`, "info");
    return false;
  }
  let done = false;
  if (text.length <= MAX_CHARS) {
    try {
      const r = await call("copytext", { text });
      done = r?.copied !== false;
    } catch {
      done = false;
    }
  }
  if (!done) {
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    } catch {
      done = false;
    }
  }
  if (!done) {
    say("Couldn't copy to the clipboard. Select the text and copy it yourself (Ctrl+C or ⌘C).", "error");
    return false;
  }
  say(`Copied${what ? ` “${what}”` : ""}${shortened ? " (shortened to fit)" : ""}.${secret ? ` ${SECRET_NOTE}` : ""}`, "success");
  return true;
}

/**
 * Reads text from the system clipboard (via the server's `pastetext` operation) or the browser clipboard as fallback.
 * @returns {Promise<string>}
 */
export async function readFromClipboard() {
  let serverOk = false;
  let serverText = "";
  try {
    const r = await call("pastetext", {});
    if (r && r.ok === true && typeof r.text === "string") {
      serverOk = true;
      serverText = r.text;
      if (serverText !== "") return serverText;
    }
  } catch {
    serverOk = false;
  }
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.readText === "function") {
    try {
      return await navigator.clipboard.readText();
    } catch (err) {
      if (serverOk) return serverText;
      throw err;
    }
  }
  if (serverOk) return serverText;
  throw new Error("Couldn't read the clipboard.");
}

/** Shows "Copied ✓" on a button for a moment, then puts its words back. */
export function flashCopied(button, copiedText = "Copied ✓") {
  if (typeof document === "undefined" || !button.isConnected) return;
  const before = button.dataset.copyWords ?? button.textContent;
  button.dataset.copyWords = before;
  button.textContent = copiedText;
  clearTimeout(Number(button.dataset.copyTimer));
  button.dataset.copyTimer = String(setTimeout(() => {
    if (typeof document === "undefined") return;
    button.textContent = before;
    delete button.dataset.copyWords;
  }, 1600));
}

/**
 * A small visible "Copy" button that copies one value (a digest, a password, a log line). `getText` is called when the
 * button is pressed, so it always copies what is shown now. `label` names the value for screen readers and tooltips.
 * @param {{ label: string, getText: () => string, secret?: boolean, words?: string, className?: string, onCopied?: (() => void) | null }} options
 */
export function copyItemButton({ label, getText, secret = false, words = "Copy", className = "", onCopied = null }) {
  const button = h("button", {
    type: "button",
    class: `copy-item${className ? ` ${className}` : ""}`,
    "data-copy-ui": "",
    "aria-label": `Copy ${label}`,
    title: `Copy ${label} to the clipboard. Only this one is copied.`,
  }, words);
  button.addEventListener("click", async () => {
    if (await copyToClipboard(getText(), { what: label, secret })) {
      flashCopied(button);
      onCopied?.();
    }
  });
  return button;
}
