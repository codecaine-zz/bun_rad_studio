// The Find / Replace bar above the editor. It works on whichever editor is current (`getEditor()`), marks every match
// in the text, steps through them, and replaces one or all. Bad or dangerous patterns are explained, never run.
import { h } from "./dom.js";
import { compileSearch, findAll, nextMatch, previousMatch, replaceAll, replacementAt } from "./codeLogic.js";

export function createFindBar({ getEditor, toast, onClose }) {
  const state = { query: "", replace: "", regex: false, caseSensitive: false, wholeWord: false };
  const find = h("input", { type: "search", class: "code-in code-find-in", placeholder: "Find", "aria-label": "Find in this file", title: "Type what to look for. Enter goes to the next match, Shift+Enter to the previous one.", spellcheck: "false", autocomplete: "off" });
  const repl = h("input", { type: "text", class: "code-in code-find-in", placeholder: "Replace with", "aria-label": "Replace with", title: "What to put in place of each match. In regular-expression mode, $1 and $& can be used.", spellcheck: "false", autocomplete: "off" });
  const status = h("span", { class: "code-find-status", "aria-live": "polite" });
  const toggle = (label, tip, key) => {
    const b = h("button", { type: "button", class: "code-btn code-tog", "aria-pressed": "false", title: tip, "aria-label": tip, onclick: () => {
      state[key] = !state[key];
      b.setAttribute("aria-pressed", String(state[key]));
      refresh(true);
    } }, label);
    return b;
  };
  const buttons = {
    caseSensitive: toggle("Aa", "Match upper and lower case exactly", "caseSensitive"),
    wholeWord: toggle("ab", "Match whole words only", "wholeWord"),
    regex: toggle(".*", "Treat the text as a regular expression (a pattern)", "regex"),
  };
  const button = (label, tip, run) => h("button", { type: "button", class: "code-btn", title: tip, "aria-label": tip, onclick: run }, label);
  const replaceRow = h("div", { class: "code-find-row", hidden: true },
    repl,
    button("Replace", "Replace the highlighted match, then go to the next one", () => replaceOne()),
    button("Replace all", "Replace every match in this file", () => replaceEverything()),
  );
  const bar = h("div", { class: "code-findbar", role: "search", "aria-label": "Find and replace", hidden: true },
    h("div", { class: "code-find-row" },
      find, buttons.caseSensitive, buttons.wholeWord, buttons.regex,
      button("▲", "Previous match (Shift+Enter)", () => step(-1)), button("▼", "Next match (Enter)", () => step(1)), status,
      h("span", { class: "code-grow" }),
      button("✕", "Close the find bar (Esc)", () => close()),
    ),
    replaceRow,
  );

  let matches = [];
  let current = -1;

  const search = () => ({ query: find.value, regex: state.regex, caseSensitive: state.caseSensitive, wholeWord: state.wholeWord });

  /** Looks for matches again (after typing in the box, a toggle, or an edit) and marks them. */
  function refresh(jump = false) {
    const ed = getEditor();
    if (!ed || bar.hidden) return;
    const compiled = compileSearch(search());
    if (compiled.empty) {
      matches = [];
      current = -1;
      ed.setMatches([], -1);
      status.textContent = "";
      status.classList.remove("code-bad");
      return;
    }
    if (compiled.error) {
      matches = [];
      ed.setMatches([], -1);
      status.textContent = compiled.error;
      status.classList.add("code-bad");
      return;
    }
    status.classList.remove("code-bad");
    const result = findAll(ed.getText(), search());
    matches = result.matches;
    const caret = ed.getSelection().start;
    current = matches.findIndex((m) => m.index >= caret);
    if (current < 0 && matches.length) current = 0;
    if (jump && current >= 0) select(current, false);
    mark();
  }

  function mark() {
    const ed = getEditor();
    if (!ed) return;
    ed.setMatches(matches, current);
    status.textContent = !find.value ? "" : matches.length ? `${current + 1} of ${matches.length}${matches.length >= 20000 ? "+" : ""}` : "No results";
  }

  function select(k, focus) {
    const ed = getEditor();
    const m = matches[k];
    if (!ed || !m) return;
    current = k;
    ed.setSelection(m.index, m.index + m.length);
    const before = ed.getText().slice(0, m.index);
    const line = before.split("\n").length;
    ed.reveal(line, m.index - before.lastIndexOf("\n"));
    if (focus) ed.focus();
    mark();
  }

  function step(direction) {
    const ed = getEditor();
    if (!ed || !find.value) return;
    if (!matches.length) refresh();
    if (!matches.length) return;
    const sel = ed.getSelection();
    const found = direction > 0 ? nextMatch(ed.getText(), sel.end, search()) : previousMatch(ed.getText(), sel.start, search());
    const k = found ? matches.findIndex((m) => m.index === found.index) : -1;
    select(k >= 0 ? k : (current + direction + matches.length) % matches.length, false);
  }

  function replaceOne() {
    const ed = getEditor();
    if (!ed || ed.ta.readOnly) return;
    const sel = ed.getSelection();
    const r = replacementAt(ed.getText(), sel.start, search(), repl.value);
    if (r && r.length === sel.end - sel.start) {
      ed.apply({ from: sel.start, to: sel.end, insert: r.insert, selStart: sel.start + r.insert.length, selEnd: sel.start + r.insert.length });
      refresh();
    }
    step(1);
  }

  function replaceEverything() {
    const ed = getEditor();
    if (!ed || ed.ta.readOnly || !find.value) return;
    const text = ed.getText();
    const r = replaceAll(text, search(), repl.value);
    if (r.error) return toast(r.error, { kind: "error" });
    if (!r.count) return toast("Nothing to replace.");
    ed.apply({ from: 0, to: text.length, insert: r.text, selStart: 0, selEnd: 0 });
    toast(`Replaced ${r.count} ${r.count === 1 ? "match" : "matches"}. Undo (Ctrl/Cmd+Z) puts them back.`, { kind: "success" });
    refresh();
  }

  function open({ replace = false, seed = true } = {}) {
    bar.hidden = false;
    replaceRow.hidden = !replace;
    const ed = getEditor();
    if (seed && ed) {
      const sel = ed.getSelection();
      const picked = ed.getText().slice(sel.start, sel.end);
      if (picked && !picked.includes("\n") && picked.length < 200) find.value = picked;
    }
    (replace && find.value ? repl : find).focus();
    find.select();
    refresh(true);
  }

  function close() {
    if (bar.hidden) return;
    bar.hidden = true;
    getEditor()?.setMatches([], -1);
    matches = [];
    onClose?.();
  }

  find.addEventListener("input", () => refresh(true));
  find.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
  repl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) replaceEverything();
      else replaceOne();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  return { el: bar, open, close, refresh, next: () => step(1), prev: () => step(-1), isOpen: () => !bar.hidden };
}
