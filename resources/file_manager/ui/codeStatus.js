// The status bar under the editor: where the cursor is, and (as buttons you can click) the language, line endings,
// indentation and text encoding of the file, plus word counts and whether it is saved.
import { h } from "./dom.js";
import { languageInfo, textStats } from "./codeLogic.js";

const EOL_NAMES = { lf: "LF", crlf: "CRLF", cr: "CR" };
const ENCODING_NAMES = { "utf-8": "UTF-8", "utf-8-bom": "UTF-8 with BOM", "utf-16le": "UTF-16 LE", "utf-16be": "UTF-16 BE", latin1: "Latin-1" };
export const encodingName = (id) => ENCODING_NAMES[id] ?? id;

export function createStatus({ onLanguage, onEol, onIndent, onEncoding, onPosition, onAutosave }) {
  const part = (cls, tip, click) => h(click ? "button" : "span", { class: `code-st ${cls}`, type: click ? "button" : undefined, title: tip, onclick: click });
  const pos = part("code-st-pos", "Where the cursor is. Click to go to a line (Ctrl/Cmd+G).", onPosition);
  const lang = part("code-st-lang", "The kind of file, used for colors and comments. Click to change it.", onLanguage);
  const eol = part("code-st-eol", "How lines end in this file: LF (Mac, Linux) or CRLF (Windows). Click to change it.", onEol);
  const indent = part("code-st-indent", "How indentation is done. Click to change it.", onIndent);
  const enc = part("code-st-enc", "The text encoding of the file. Click to reopen or save it in another one.", onEncoding);
  const counts = part("code-st-count", "Words and characters in this file (or in the selection).");
  const auto = part("code-st-autosave", "Autosave saves your changes for you a moment after you stop typing. Click to turn it on or off (View → Autosave options… has the details).", onAutosave);
  auto.setAttribute("aria-pressed", "false");
  const saved = h("span", { class: "code-st code-st-saved", "aria-live": "polite", title: "Whether your changes are saved to the file." });
  const el = h("div", { class: "code-status", "aria-label": "Editor status" }, pos, h("span", { class: "code-grow" }), counts, indent, enc, eol, lang, auto, saved);

  return {
    el,
    /** Shows whether autosave is on. */
    setAutosave(on, seconds) {
      auto.textContent = on ? `Autosave: On (${seconds} s)` : "Autosave: Off";
      auto.setAttribute("aria-pressed", String(on));
    },
    /** doc: the open document (or null), sel: { line, col, start, end }, text: the selected text or "" */
    update(doc, sel, selected = "") {
      if (!doc) {
        for (const p of [pos, counts, indent, enc, eol, lang, saved]) p.textContent = "";
        return;
      }
      pos.textContent = `Ln ${sel.line}, Col ${sel.col}${selected ? ` (${selected.length} selected)` : ""}`;
      const stats = selected.length && selected.length < 1_000_000 ? textStats(selected) : doc.text.length < 3_000_000 ? textStats(doc.text) : null;
      counts.textContent = stats ? `${stats.words.toLocaleString()} ${stats.words === 1 ? "word" : "words"}, ${stats.chars.toLocaleString()} chars${selected ? " selected" : ""}` : "";
      indent.textContent = doc.indent.useTabs ? "Tabs" : `Spaces: ${doc.indent.size ?? 2}`;
      enc.textContent = encodingName(doc.encoding) + (doc.guessed ? " (guessed)" : "");
      eol.textContent = EOL_NAMES[doc.eol] ?? "LF";
      lang.textContent = languageInfo(doc.lang).name;
      saved.textContent = doc.kind === "diff" ? "Read only" : doc.readOnly ? "Read only" : doc.text !== doc.savedText ? "● Unsaved" : doc.kind === "untitled" ? "New file" : doc.autoSavedText === doc.savedText ? "Autosaved" : "Saved";
      saved.classList.toggle("code-warn", doc.kind !== "diff" && doc.text !== doc.savedText);
    },
  };
}
