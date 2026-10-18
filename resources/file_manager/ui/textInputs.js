import { copyToClipboard } from "./copyclip.js";
import { quietInput } from "./dom.js";
import { showMenu, toast } from "./menus.js";

const TEXT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);

function isTextBox(el) {
  if (el instanceof Element && el.closest("#terminal-host")) return false;
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type));
}

function selectedDomText() {
  if (typeof window === "undefined" || typeof window.getSelection !== "function") return "";
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return "";
  return sel.toString();
}

export function wireTextInputs() {
  document.querySelectorAll("input, textarea").forEach(quietInput);
  document.addEventListener("focusin", (e) => {
    if (isTextBox(e.target)) quietInput(e.target);
  });
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || (e.target instanceof Element && e.target.closest("#terminal-host"))) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const key = (e.key || "").toLowerCase();
    if (isTextBox(e.target) && !e.target.disabled) {
      const field = e.target;
      if (key === "a") {
        e.preventDefault();
        e.stopPropagation();
        field.select();
        return;
      }
      if ((key === "c" || key === "x") && field.type !== "password") {
        const start = field.selectionStart;
        const end = field.selectionEnd;
        if (start !== null && end !== null && end > start) {
          const text = field.value.slice(start, end);
          e.preventDefault();
          e.stopPropagation();
          if (field.classList?.contains("code-ta")) {
            field.dispatchEvent(new Event(key === "x" && !field.readOnly ? "cut" : "copy", { bubbles: true }));
          }
          void copyToClipboard(text, { quiet: true });
          if (key === "x" && !field.readOnly) {
            let edited = false;
            try {
              edited = document.execCommand?.("delete", false) ?? false;
            } catch {
              edited = false;
            }
            if (!edited || field.value.slice(start, end) === text) {
              field.setRangeText("", start, end, "end");
              field.dispatchEvent(new Event("input", { bubbles: true }));
            }
            field.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return;
        }
      }
    }
    if (key === "c") {
      const domText = selectedDomText();
      if (domText.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        void copyToClipboard(domText, { quiet: true });
      }
    }
  }, true);
  document.addEventListener("contextmenu", (e) => {
    const field = e.target;
    if (e.defaultPrevented || !isTextBox(field) || field.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    field.focus();
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const value = field.value;
    const selected = start !== null && end !== null && end > start;
    const editable = !field.readOnly;
    const replace = (text, all = false) => {
      if (field.value !== value) {
        toast("The text changed while the menu was open. Try again.", { kind: "error" });
        return;
      }
      field.focus();
      let edited = false;
      if (start !== null && end !== null) {
        field.setSelectionRange(all ? 0 : start, all ? field.value.length : end);
        edited = document.execCommand?.(text ? "insertText" : "delete", false, text) ?? false;
      }
      if (!edited) {
        if (all || start === null || end === null) field.value = text;
        else field.setRangeText(text, start, end, "end");
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      field.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const copy = () => copyToClipboard(value.slice(start, end), { quiet: true });
    const history = (command) => {
      field.focus();
      if (!document.execCommand?.(command)) toast(`Use ${command === "undo" ? "Ctrl+Z or Command+Z to undo" : "Ctrl+Shift+Z or Command+Shift+Z to redo"}.`, { kind: "info" });
    };
    showMenu([
      { label: "Undo", disabled: !editable, action: () => history("undo") },
      { label: "Redo", disabled: !editable, action: () => history("redo") },
      { separator: true },
      { label: "Cut", disabled: !editable || !selected || field.type === "password", action: async () => { if (await copy()) replace(""); } },
      { label: "Copy", disabled: !selected || field.type === "password", action: copy },
      { label: "Paste", disabled: !editable, action: async () => {
        let text;
        try {
          text = await navigator.clipboard.readText();
        } catch {
          toast("Couldn't read the clipboard. Use Ctrl+V or Command+V to paste into the text box.", { kind: "error" });
          field.focus();
          return;
        }
        replace(text);
      } },
      { separator: true },
      { label: "Select all", disabled: !field.value, action: () => { field.focus(); field.select(); } },
      { label: "Delete selection", disabled: !editable || !selected, action: () => replace("") },
      { label: "Clear text", disabled: !editable || !field.value, action: () => replace("", true) },
    ], { x: e.clientX, y: e.clientY, label: "Text editing" });
  }, true);
}
