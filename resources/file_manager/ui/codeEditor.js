// The text editor itself: a <textarea> that takes the typing (so selection, copy/paste, undo and spell/IME
// behaviour are the browser's own) with a coloured copy of the text painted underneath it. Only the lines on screen
// are painted (plus a few more), so a file of 100,000 lines is as quick as one of 100. Everything is built from DOM
// nodes: file text never goes through innerHTML.
import { h } from "./dom.js";
import { backspaceEdit, buildLineStarts, closerDedentEdit, createHighlighter, findMatchingBracket, indentLines, lineAt, newLineEdit, offsetOf, outdentLines, tabAtCaret, typedCharEdit } from "./codeLogic.js";

const PAD = 8;
const BUFFER = 25;
const PLAIN_ABOVE = 2_000_000;
const WRAP_LINES = 2500;
const WRAP_CHARS = 150_000;

function span(text, type, cls) {
  if (!type && !cls) return document.createTextNode(text);
  return h("span", { class: `${type ? `code-t-${type}` : ""}${cls ?? ""}`.trim() }, text);
}

/** Adds coloured pieces to a row, cutting them where search matches or brackets are marked. decos: [{ from, to, cls }]. */
function appendTokens(row, tokens, decos) {
  if (!decos) {
    for (const t of tokens) row.append(span(t.text, t.type));
    return;
  }
  let col = 0;
  for (const t of tokens) {
    let text = t.text;
    while (text) {
      let cut = text.length;
      let cls = "";
      for (const d of decos) {
        if (d.from <= col && col < d.to) {
          cut = Math.min(cut, d.to - col);
          cls += ` ${d.cls}`;
        } else if (d.from > col && d.from < col + cut) cut = d.from - col;
      }
      row.append(span(text.slice(0, cut), t.type, cls));
      col += cut;
      text = text.slice(cut);
    }
  }
}

/**
 * Makes an editor. Callbacks: onChange(), onSelect({ start, end, line, col }), onClip(text) for copy and cut, and
 * onKey(event) which sees every key first and returns true when it dealt with it (the suggestion list uses this).
 * The element to put on the page is `editor.el`.
 */
export function createEditor({ onChange = () => {}, onSelect = () => {}, onClip = () => {}, onKey = () => false } = {}) {
  const o = { lang: "plain", wrap: false, lineNumbers: true, fontSize: 0, tabSize: 0, unit: "  ", readOnly: false };
  const ta = h("textarea", { class: "code-ta", spellcheck: "false", autocomplete: "off", autocapitalize: "off", autocorrect: "off", wrap: "off", "aria-label": "Code editor text", "aria-multiline": "true" });
  const inner = h("div", { class: "code-hl-inner" });
  const layer = h("div", { class: "code-hl", "aria-hidden": "true" }, inner);
  const gutInner = h("div", { class: "code-gut-inner" });
  const gutter = h("div", { class: "code-gut", "aria-hidden": "true" }, gutInner);
  const probe = h("span", { class: "code-probe", "aria-hidden": "true" }, "0000000000");
  const el = h("div", { class: "code-ed" }, layer, gutter, ta, probe);
  const hl = createHighlighter("plain");

  let lines = [""];
  let starts = null;
  let dirty = true;
  let lh = 21;
  let cw = 0;
  let gutterPx = 0;
  let rendered = null;
  let frame = 0;
  let curLine = -1;
  let lastSel = "";
  let plain = false;
  let bookmarks = new Set();
  const decoKinds = { brk: new Map(), find: new Map() };
  const rows = new Map();
  let tabTrap = true;
  const fallbackUndo = [];

  const getStarts = () => (starts ??= buildLineStarts(ta.value));
  const lineOf = (pos) => lineAt(getStarts(), pos);

  function decosFor(i) {
    const a = decoKinds.brk.get(i);
    const b = decoKinds.find.get(i);
    return a && b ? [...b, ...a] : a ?? b ?? null;
  }

  function sync() {
    if (!dirty) return;
    dirty = false;
    const text = ta.value;
    lines = text.split("\n");
    starts = null;
    plain = text.length > PLAIN_ABOVE;
    hl.setEnabled(!plain);
    hl.setLines(lines);
    const digits = Math.max(3, String(lines.length).length);
    rendered = null;
    const px = o.lineNumbers && cw ? Math.ceil(digits * cw) + 22 : o.lineNumbers ? 46 : 0;
    if (px !== gutterPx) {
      gutterPx = px;
      el.style.setProperty("--code-gutter", `${px}px`);
    }
  }

  function row(i) {
    const r = h("div", { class: `code-row${i === curLine ? " code-cur" : ""}` });
    if (o.wrap && o.lineNumbers) r.append(h("span", { class: `code-ln${bookmarks.has(i + 1) ? " code-bm" : ""}` }, String(i + 1)));
    const tokens = plain ? (lines[i] ? [{ text: lines[i], type: "" }] : []) : hl.line(i);
    appendTokens(r, tokens, decosFor(i));
    return r;
  }

  const gutRow = (i) => h("div", { class: `code-gn${i === curLine ? " code-cur" : ""}${bookmarks.has(i + 1) ? " code-bm" : ""}` }, String(i + 1));

  function rebuild(first, last) {
    rows.clear();
    const text = document.createDocumentFragment();
    const nums = document.createDocumentFragment();
    for (let i = first; i <= last; i++) {
      const r = row(i);
      rows.set(i, r);
      text.append(r);
      if (!o.wrap && o.lineNumbers) nums.append(gutRow(i));
    }
    inner.replaceChildren(text);
    gutInner.replaceChildren(nums);
    rendered = { wrap: o.wrap, first, last };
  }

  /** Redraws single lines (after a bracket, search match, bookmark or current-line change). */
  function patch(indexes) {
    sync();
    if (!rendered) return schedule();
    for (const i of indexes) {
      const old = rows.get(i);
      if (!old) continue;
      const fresh = row(i);
      old.replaceWith(fresh);
      rows.set(i, fresh);
      if (!o.wrap && o.lineNumbers) {
        const g = gutInner.children[i - rendered.first];
        if (g) g.replaceWith(gutRow(i));
      }
    }
  }

  function render() {
    frame = 0;
    if (!el.isConnected || el.offsetParent === null) return;
    if (!cw) measure();
    sync();
    el.classList.toggle("code-nolayer", o.wrap && (lines.length > WRAP_LINES || ta.value.length > WRAP_CHARS));
    if (el.classList.contains("code-nolayer")) return;
    const top = ta.scrollTop;
    const left = ta.scrollLeft;
    if (!o.wrap) {
      const view = ta.clientHeight;
      const first = Math.max(0, Math.floor((top - PAD) / lh));
      const last = Math.min(lines.length - 1, Math.ceil((top + view - PAD) / lh));
      if (!rendered || rendered.wrap || first < rendered.first || last > rendered.last) rebuild(Math.max(0, first - BUFFER), Math.min(lines.length - 1, last + BUFFER));
      inner.style.transform = `translate(${-left}px, ${PAD + rendered.first * lh - top}px)`;
      gutInner.style.transform = `translate(0px, ${PAD + rendered.first * lh - top}px)`;
    } else {
      if (!rendered || !rendered.wrap) rebuild(0, lines.length - 1);
      inner.style.width = `${ta.clientWidth}px`;
      inner.style.transform = `translate(0px, ${PAD - top}px)`;
    }
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  function invalidate() {
    rendered = null;
    schedule();
  }

  function measure() {
    const width = probe.getBoundingClientRect().width / 10;
    if (width > 0) {
      cw = width;
      dirty = true;
      el.style.setProperty("--code-cw", `${width}px`);
    }
  }

  function setKind(kind, next) {
    const old = decoKinds[kind];
    const changed = new Set();
    for (const k of new Set([...old.keys(), ...next.keys()])) if (JSON.stringify(old.get(k)) !== JSON.stringify(next.get(k))) changed.add(k);
    decoKinds[kind] = next;
    if (changed.size > 400) invalidate();
    else {
      patch(changed);
      schedule();
    }
  }

  function selectionChanged(force = false) {
    if (!el.isConnected) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const key = `${start}:${end}`;
    if (key === lastSel && !force) return;
    lastSel = key;
    const caret = ta.selectionDirection === "backward" ? start : end;
    const text = ta.value;
    const line = lineOf(caret);
    if (line !== curLine) {
      const before = curLine;
      curLine = line;
      patch([before, line]);
    }
    const brackets = new Map();
    if (start === end && text.length < 400_000) {
      const m = findMatchingBracket(text, caret);
      if (m) for (const pos of [m.open, m.close]) {
        const l = lineOf(pos);
        brackets.set(l, [...(brackets.get(l) ?? []), { from: pos - getStarts()[l], to: pos - getStarts()[l] + 1, cls: "code-brk" }]);
      }
    }
    setKind("brk", brackets);
    onSelect({ start, end, line: line + 1, col: caret - getStarts()[line] + 1 });
  }

  /** Replaces a range through the browser's own editing command, so Undo and Redo keep working. */
  function replaceRange(from, to, insert) {
    const value = ta.value;
    const old = value.slice(from, to);
    let a = 0;
    while (a < old.length && a < insert.length && old[a] === insert[a]) a++;
    let b = 0;
    while (b < old.length - a && b < insert.length - a && old[old.length - 1 - b] === insert[insert.length - 1 - b]) b++;
    const f = from + a;
    const t = to - b;
    const text = insert.slice(a, insert.length - b);
    if (f === t && !text) return;
    const expected = value.slice(0, f) + text + value.slice(t);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(f, t);
    let ok = false;
    try {
      ok = text ? document.execCommand("insertText", false, text) : document.execCommand("delete");
    } catch {
      ok = false;
    }
    if (!ok || ta.value !== expected) {
      fallbackUndo.push({ value, start: ta.selectionStart, end: ta.selectionEnd });
      if (fallbackUndo.length > 100) fallbackUndo.shift();
      ta.value = expected;
      dirty = true;
      starts = null;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function apply(edit) {
    if (!edit) return;
    if (edit.move !== undefined) {
      ta.setSelectionRange(edit.move, edit.move);
      return selectionChanged();
    }
    if (o.readOnly || edit.from === undefined) return;
    replaceRange(edit.from, edit.to, edit.insert);
    ta.setSelectionRange(edit.selStart, edit.selEnd);
    selectionChanged(true);
  }

  function onInput() {
    dirty = true;
    starts = null;
    schedule();
    onChange();
    selectionChanged(true);
  }

  function onKeyDown(e) {
    if (e.isComposing || onKey(e)) return;
    const plainKey = !e.ctrlKey && !e.metaKey && !e.altKey;
    const s = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z" && fallbackUndo.length) {
      e.preventDefault();
      if (!e.shiftKey) {
        const snap = fallbackUndo.pop();
        ta.value = snap.value;
        ta.setSelectionRange(snap.start, snap.end);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    if (o.readOnly) return;
    if (e.key === "Escape") tabTrap = false;
    else if (e.key === "Tab" && plainKey) {
      if (!tabTrap) return void (tabTrap = true);
      e.preventDefault();
      const multi = text.slice(s, end).includes("\n");
      if (e.shiftKey) apply(outdentLines(text, s, end, o.unit));
      else if (multi) apply(indentLines(text, s, end, o.unit));
      else {
        const edit = tabAtCaret(text, s, o.unit);
        apply({ ...edit, to: end, selEnd: edit.selStart });
      }
      return;
    } else tabTrap = true;
    if (e.key === "Enter" && plainKey) {
      e.preventDefault();
      apply(newLineEdit(text, s, end, o.lang, o.unit));
    } else if (e.key === "Backspace" && plainKey && !e.shiftKey) {
      const edit = backspaceEdit(text, s, end, o.unit);
      if (edit) {
        e.preventDefault();
        apply(edit);
      }
    } else if (e.key.length === 1 && plainKey) {
      const edit = typedCharEdit(text, s, end, e.key, o.lang) ?? closerDedentEdit(text, s, end, e.key, o.unit, o.lang);
      if (edit) {
        e.preventDefault();
        apply(edit);
      }
    }
  }

  function clip(e) {
    const text = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (text.trim()) onClip(text, e.type);
  }

  const onDocSelection = () => document.activeElement === ta && selectionChanged();
  ta.addEventListener("input", onInput);
  ta.addEventListener("keydown", onKeyDown);
  ta.addEventListener("scroll", schedule);
  ta.addEventListener("copy", clip);
  ta.addEventListener("cut", clip);
  ta.addEventListener("focus", () => selectionChanged(true));
  document.addEventListener("selectionchange", onDocSelection);
  const resizer = new ResizeObserver(() => {
    cw = 0;
    invalidate();
  });
  resizer.observe(el);

  const editor = {
    el,
    ta,
    get lineCount() { return lines.length; },
    getText: () => ta.value,
    /** Puts new text in (a file was opened, or reloaded). The undo history starts afresh. */
    setText(text) {
      ta.value = text;
      dirty = true;
      starts = null;
      fallbackUndo.length = 0;
      lastSel = "";
      invalidate();
    },
    getSelection: () => ({ start: ta.selectionStart, end: ta.selectionEnd }),
    /** Where the caret is drawn: { x, y, h } in pixels from the top left of the editor (y is the top of the line). */
    caretRect() {
      sync();
      if (!cw) measure();
      const caret = ta.selectionDirection === "backward" ? ta.selectionStart : ta.selectionEnd;
      const line = lineOf(caret);
      const tab = Math.max(1, o.tabSize || 4);
      let vcol = 0;
      for (const ch of lines[line].slice(0, caret - getStarts()[line])) vcol = ch === "\t" ? vcol + tab - (vcol % tab) : vcol + 1;
      const base = (cw ? gutterPx : 46) + 8;
      if (!o.wrap) return { x: base + vcol * cw - ta.scrollLeft, y: PAD + line * lh - ta.scrollTop, h: lh };
      const perRow = Math.max(1, Math.floor((ta.clientWidth - base - 12) / (cw || 8)));
      const r = rows.get(line);
      return { x: base + (vcol % perRow) * cw, y: PAD + (r ? r.offsetTop : line * lh) + Math.floor(vcol / perRow) * lh - ta.scrollTop, h: lh };
    },
    setSelection(start, end = start) {
      ta.setSelectionRange(start, end);
      selectionChanged(true);
    },
    apply,
    focus: () => ta.focus({ preventScroll: true }),
    hasFocus: () => document.activeElement === ta,
    get scrollTop() { return ta.scrollTop; },
    set scrollTop(v) { ta.scrollTop = v; schedule(); },
    lineOffset: (line, col) => offsetOf(ta.value, line, col),
    /** Scrolls so that line (1-based) is comfortably in view. */
    reveal(line, col = 1) {
      sync();
      let y = PAD + (line - 1) * lh;
      if (o.wrap) {
        const r = rows.get(line - 1);
        y = r ? PAD + r.offsetTop : (ta.scrollHeight * (line - 1)) / Math.max(1, lines.length);
      }
      const view = ta.clientHeight;
      if (y < ta.scrollTop + lh * 2 || y > ta.scrollTop + view - lh * 3) ta.scrollTop = Math.max(0, y - view / 2 + lh);
      if (!o.wrap) {
        const x = (col - 1) * cw + gutterPx + 8;
        if (x < ta.scrollLeft + gutterPx + 8 || x > ta.scrollLeft + ta.clientWidth - 30) ta.scrollLeft = Math.max(0, x - ta.clientWidth / 2);
      }
      schedule();
    },
    goTo(line, col = 1) {
      const pos = offsetOf(ta.value, line, col);
      ta.setSelectionRange(pos, pos);
      editor.reveal(line, col);
      selectionChanged(true);
      ta.focus({ preventScroll: true });
    },
    /** Marks search matches: [{ index, length }], and which one is the current one. */
    setMatches(matches, current = -1) {
      const map = new Map();
      const text = ta.value;
      const st = getStarts();
      matches.slice(0, 5000).forEach((m, k) => {
        for (let pos = m.index, endPos = m.index + m.length; pos < endPos; ) {
          const l = lineAt(st, pos);
          const lineEndPos = l + 1 < st.length ? st[l + 1] - 1 : text.length;
          const stop = Math.min(endPos, lineEndPos);
          if (stop > pos) map.set(l, [...(map.get(l) ?? []), { from: pos - st[l], to: stop - st[l], cls: k === current ? " code-find code-find-cur" : " code-find" }]);
          pos = Math.max(stop, pos + 1) + (stop >= lineEndPos ? 1 : 0);
        }
      });
      setKind("find", map);
    },
    setBookmarks(list) {
      const next = new Set(list);
      const changed = [...bookmarks, ...next].filter((l) => bookmarks.has(l) !== next.has(l)).map((l) => l - 1);
      bookmarks = next;
      patch(changed);
    },
    setOptions(patchOptions) {
      const before = { ...o };
      Object.assign(o, patchOptions);
      if (o.lang !== before.lang) hl.setLanguage(o.lang);
      if (o.readOnly !== before.readOnly) ta.readOnly = o.readOnly;
      if (o.wrap !== before.wrap) {
        ta.setAttribute("wrap", o.wrap ? "soft" : "off");
        el.classList.toggle("code-wrap", o.wrap);
      }
      if (o.fontSize !== before.fontSize) {
        lh = Math.max(12, Math.round(o.fontSize * 1.5));
        el.style.setProperty("--code-fs", `${o.fontSize}px`);
        el.style.setProperty("--code-lh", `${lh}px`);
        cw = 0;
      }
      if (o.tabSize !== before.tabSize) el.style.setProperty("--code-tab", String(o.tabSize));
      if (o.lineNumbers !== before.lineNumbers) {
        el.classList.toggle("code-no-ln", !o.lineNumbers);
        dirty = true;
      }
      invalidate();
    },
    /** Call when the editor becomes visible or its size may have changed. */
    layout() {
      cw = 0;
      invalidate();
    },
    refresh: invalidate,
    destroy() {
      document.removeEventListener("selectionchange", onDocSelection);
      resizer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      el.remove();
    },
  };
  editor.setOptions({ fontSize: 14, tabSize: 2 });
  return editor;
}
