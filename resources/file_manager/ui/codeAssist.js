// Code completion in the editor: opens the suggestion list while typing (or on Ctrl+Space / Alt+/), keeps it in step
// with the text, accepts a suggestion, and runs snippets (Tab jumps between the places to fill in). It also shows the
// signature tip while typing the arguments of a call. The thinking is in codeComplete.js and codeSnippets.js (both
// DOM-free and unit-tested); the drawing is in codePopup.js.
import { familyOf } from "./codeCompleteData.js";
import { acceptEdit, buildIndex, complete, createSnippetSession, expandSnippet, shouldAutoOpen, signatureAt } from "./codeLogic.js";
import { announce } from "./dom.js";
import { createPopup } from "./codePopup.js";

const MAX_OTHERS = 12;
const OTHER_CHARS = 400_000;
const MAX_RECENT = 40;
const NO_SIGNATURE = new Set(["plain", "markdown", "diff", "ini", "dockerfile", "makefile", "json", "yaml", "toml", "css", "html", "xml"]);

/** What an edit did, as `from..to` replaced by `insertLen` characters: from the key press if known, else by comparing. */
function changeBetween(before, after, pre) {
  if (pre && pre.start <= before.length && pre.end <= before.length) {
    const insertLen = after.length - before.length + (pre.end - pre.start);
    if (insertLen >= 0 && before.slice(0, pre.start) === after.slice(0, pre.start)) return { from: pre.start, to: pre.end, insertLen };
  }
  let p = 0;
  const limit = Math.min(before.length, after.length);
  while (p < limit && before[p] === after[p]) p++;
  let s = 0;
  while (s < limit - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  return { from: p, to: before.length - s, insertLen: after.length - p - s };
}

/**
 * `deps`: settings() -> { completion, autoOpen }, docs() -> every open document, unit(doc) -> one level of indentation.
 * Call attach(doc, editor) once per editor and pass keydown(doc, event) as the editor's onKey.
 */
export function createAssist({ settings, docs, unit }) {
  const states = new WeakMap();
  const recent = [];
  const enabled = () => settings().completion !== false;

  function indexOf(d, text, caret) {
    const key = `${d.lang}\u0000${text.length < 300_000 ? "" : caret >> 12}`;
    if (d.index && d.indexText === text && d.indexKey === key) return d.index;
    d.index = buildIndex(text, d.lang, caret);
    d.indexText = text;
    d.indexKey = key;
    return d.index;
  }

  function othersOf(d) {
    const family = familyOf(d.lang);
    const out = [];
    for (const x of docs()) {
      if (x === d || x.kind === "diff" || out.length >= MAX_OTHERS || x.text.length > OTHER_CHARS || familyOf(x.lang) !== family) continue;
      out.push(indexOf(x, x.text, 0));
    }
    return out;
  }

  function remember(label) {
    const at = recent.indexOf(label);
    if (at >= 0) recent.splice(at, 1);
    recent.unshift(label);
    recent.length = Math.min(recent.length, MAX_RECENT);
  }

  function close(st) {
    st.popup.hide();
    st.result = null;
  }

  function request(st, manual) {
    const { d, editor } = st;
    if (!enabled() || d.readOnly || d.kind === "diff") return close(st);
    const { start, end } = editor.getSelection();
    if (start !== end) return close(st);
    const text = editor.getText();
    const result = complete({ text, caret: end, lang: d.lang, index: indexOf(d, text, end), others: othersOf(d), recent, manual, snippets: true });
    if (!result) return close(st);
    const wasOpen = st.popup.visible;
    st.result = result;
    st.manual = manual || (wasOpen && st.manual);
    st.popup.show(result.items, editor.caretRect(), { keep: wasOpen, onPick: (i) => accept(st, i) });
    if (!wasOpen) announce(`${result.items.length} suggestions. Use the arrow keys, then Enter or Tab.`);
  }

  function setText(st, edit) {
    st.applying = true;
    try {
      st.editor.apply(edit);
    } finally {
      st.applying = false;
      st.prevText = st.editor.getText();
    }
  }

  function startSnippet(st, from, to, source) {
    const { d, editor } = st;
    const text = editor.getText();
    const lineStart = text.lastIndexOf("\n", from - 1) + 1;
    const indent = /^[ \t]*/.exec(text.slice(lineStart, from))[0];
    const expanded = expandSnippet(source, { indent, unit: unit(d) });
    const end = from + expanded.text.length;
    setText(st, { from, to, insert: expanded.text, selStart: end, selEnd: end });
    const last = expanded.stops[expanded.stops.length - 1];
    if (expanded.stops.length <= 1) return editor.setSelection(from + last.ranges[0].start);
    st.snip = createSnippetSession(expanded, from);
    const first = st.snip.select();
    editor.setSelection(first.start, first.end);
  }

  function accept(st, index) {
    const item = st.popup.items[index];
    const { result, editor } = st;
    if (!item || !result) return false;
    const text = editor.getText();
    const edit = acceptEdit(result, item, text, editor.getSelection().end);
    close(st);
    remember(item.label);
    if (edit.snippet) startSnippet(st, edit.from, edit.to, edit.snippet);
    else {
      const caret = edit.from + edit.caret;
      setText(st, { from: edit.from, to: edit.to, insert: edit.insert, selStart: caret, selEnd: caret });
    }
    return true;
  }

  function updateSignature(st) {
    const { d, editor } = st;
    if (!enabled() || d.readOnly || NO_SIGNATURE.has(d.lang)) return st.popup.hideSignature();
    const { start, end } = editor.getSelection();
    const text = editor.getText();
    const sig = start === end ? signatureAt(text, end, d.lang, indexOf(d, text, end), othersOf(d)) : null;
    st.popup.showSignature(sig, editor.caretRect());
  }

  /** Keeps the snippet's other copies of a stop equal to the one being typed in, and ends the snippet when you leave it. */
  function followSnippet(st, text, change) {
    const snip = st.snip;
    if (!snip.contains(change.from) || !snip.contains(change.to)) {
      st.snip = null;
      return;
    }
    const edits = snip.change(text, change.from, change.to, change.insertLen);
    if (!edits.length) return;
    st.applying = true;
    try {
      for (const e of edits) st.editor.apply({ from: e.from, to: e.to, insert: e.insert, selStart: e.from + e.insert.length, selEnd: e.from + e.insert.length });
      const here = snip.current();
      if (here) st.editor.setSelection(here.end);
    } finally {
      st.applying = false;
    }
  }

  function onInput(st, e) {
    const { editor, d } = st;
    const text = editor.getText();
    if (st.applying) {
      st.prevText = text;
      return;
    }
    const change = changeBetween(st.prevText, text, st.pre);
    st.prevText = text;
    st.pre = null;
    if (st.snip) {
      followSnippet(st, text, change);
      st.prevText = editor.getText();
    }
    if (st.popup.visible) request(st, false);
    else if (enabled() && settings().autoOpen !== false && change.insertLen > 0 && (!e.inputType || (e.inputType.startsWith("insert") && !/Paste|Drop|Replacement/.test(e.inputType))) && !st.snip) {
      const caret = editor.getSelection().end;
      if (editor.getSelection().start === caret && shouldAutoOpen(text, caret, d.lang)) request(st, false);
    }
  }

  function attach(d, editor) {
    const st = { d, editor, popup: createPopup(editor.el, editor.ta, `code-ac-${d.id}`), result: null, snip: null, manual: false, prevText: editor.getText(), pre: null, applying: false };
    states.set(d, st);
    const ta = editor.ta;
    ta.setAttribute("aria-autocomplete", "list");
    ta.setAttribute("aria-haspopup", "listbox");
    ta.setAttribute("aria-expanded", "false");
    ta.addEventListener("beforeinput", () => { st.pre = { start: ta.selectionStart, end: ta.selectionEnd }; });
    ta.addEventListener("input", (e) => onInput(st, e));
    ta.addEventListener("blur", () => close(st));
    ta.addEventListener("mousedown", () => close(st));
    ta.addEventListener("scroll", () => close(st));
    return st;
  }

  function keydown(d, e) {
    const st = states.get(d);
    if (!st) return false;
    if ((e.ctrlKey && !e.metaKey && !e.altKey && e.key === " ") || (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === "Slash" || e.key === "/"))) {
      e.preventDefault();
      if (enabled() && !d.readOnly) request(st, true);
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (st.popup.visible) {
      if ((e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) && accept(st, st.popup.selected)) {
        e.preventDefault();
        return true;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); st.popup.move(e.key === "ArrowDown" ? 1 : -1); return true; }
      if (e.key === "PageDown" || e.key === "PageUp") { e.preventDefault(); st.popup.jump(st.popup.selected + (e.key === "PageDown" ? 8 : -8)); return true; }
      if (e.key === "Escape") { e.preventDefault(); close(st); return true; }
      if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter", "Tab"].includes(e.key)) close(st);
      return false;
    }
    if (st.snip) {
      if (e.key === "Tab") {
        e.preventDefault();
        const range = st.snip.move(e.shiftKey ? -1 : 1);
        if (range) st.editor.setSelection(range.start, range.end);
        if (st.snip.done) st.snip = null;
        return true;
      }
      if (e.key === "Escape") { e.preventDefault(); st.snip = null; return true; }
    }
    return false;
  }

  return {
    attach,
    keydown,
    /** Opens the list now (the "Show suggestions" command). */
    suggest(d) {
      const st = states.get(d);
      if (st) request(st, true);
      st?.editor.focus();
    },
    /** Called when a file's text or language was replaced from outside (reload, language change). */
    reset(d) {
      const st = states.get(d);
      if (!st) return;
      close(st);
      st.snip = null;
      st.prevText = st.editor.getText();
      d.index = null;
    },
    /** The caret moved or the text changed: keeps the signature tip right. */
    caretMoved(d) {
      const st = states.get(d);
      if (st && !st.applying) updateSignature(st);
    },
    inSnippet: (d) => !!states.get(d)?.snip,
  };
}
