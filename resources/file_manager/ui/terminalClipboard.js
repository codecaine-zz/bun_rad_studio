import { copyToClipboard, readFromClipboard } from "./copyclip.js";
import { $ } from "./dom.js";
import { showMenu, toast } from "./menus.js";
import { state } from "./state.js";

export function wireTerminalClipboard(term, host) {
  const copyButton = $("#terminal-copy");
  const paintSelection = () => {
    if (copyButton) copyButton.disabled = !term.hasSelection();
  };
  const copy = async (text = term.getSelection()) => {
    if (!text) {
      toast("Select terminal text first: drag across it, or use Select all.", { kind: "info" });
      return;
    }
    await copyToClipboard(text, { quiet: true });
  };
  const paste = async () => {
    let text;
    try {
      text = typeof readFromClipboard === "function"
        ? await readFromClipboard()
        : await navigator.clipboard.readText();
    } catch {
      toast("Couldn't read the clipboard. Focus the terminal and use Ctrl+V, Ctrl+Shift+V or Command+V to paste.", { kind: "error" });
      term.focus();
      return;
    }
    term.focus();
    term.paste(text);
  };
  const selectAll = () => {
    term.selectAll();
    term.focus();
  };

  copyButton?.addEventListener("click", () => { void copy(); term.focus(); });
  $("#terminal-paste")?.addEventListener("click", paste);
  $("#terminal-select-all")?.addEventListener("click", selectAll);
  term.onSelectionChange(paintSelection);
  paintSelection();

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    const key = (e.key || "").toLowerCase();
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key === "Insert") {
      e.preventDefault();
      e.stopPropagation();
      void paste();
      return false;
    }
    if (e.altKey) return true;
    const pasteKey = key === "v" && (
      (e.ctrlKey && !e.metaKey) ||
      (e.metaKey && !e.ctrlKey && !e.shiftKey)
    );
    if (pasteKey) {
      e.preventDefault();
      e.stopPropagation();
      void paste();
      return false;
    }
    const shortcut = (e.ctrlKey && e.shiftKey && !e.metaKey) || (state.platform === "darwin" && e.metaKey && !e.ctrlKey && !e.shiftKey);
    if (!shortcut) return true;
    if (key !== "c" && key !== "a") return true;
    e.preventDefault();
    e.stopPropagation();
    if (key === "c") void copy();
    else selectAll();
    return false;
  });
  host.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = term.getSelection();
    term.focus();
    showMenu([
      { label: "Copy", disabled: !text, shortcut: state.platform === "darwin" ? "Command+C" : "Ctrl+Shift+C", action: () => copy(text) },
      { label: "Paste", shortcut: state.platform === "darwin" ? "Command+V" : "Ctrl+V / Ctrl+Shift+V", action: paste },
      { separator: true },
      { label: "Select all", shortcut: state.platform === "darwin" ? "Command+A" : "Ctrl+Shift+A", action: selectAll },
      { label: "Clear selection", disabled: !text, action: () => { term.clearSelection(); term.focus(); } },
    ], { x: e.clientX, y: e.clientY, label: "Terminal text" });
  });
  return { copy, paste, selectAll };
}

