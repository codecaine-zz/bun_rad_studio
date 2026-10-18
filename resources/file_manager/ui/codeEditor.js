// The text editor itself: a <textarea> that takes the typing (so selection, copy/paste, undo and spell/IME
// behavior are the browser's own) with a colored copy of the text painted underneath it. Only the lines on screen
// are painted (plus a few more), so a file of 100,000 lines is as quick as one of 100. Everything is built from DOM
// nodes: file text never goes through innerHTML.
import { h } from "./dom.js";
import { backspaceEdit, buildLineStarts, closerDedentEdit, createHighlighter, detectFoldableRanges, diagnoseSyntax, findLineColors, findMatchingBracket, findWordOccurrences, indentLines, lineAt, newLineEdit, offsetOf, outdentLines, tabAtCaret, typedCharEdit } from "./codeLogic.js";

const PAD = 8;
const BUFFER = 25;
const PLAIN_ABOVE = 2_000_000;
const WRAP_LINES = 2500;
const WRAP_CHARS = 150_000;
const TODO_COMMENT_RE = /\b(TODO|FIXME|BUG|HACK|NOTE|XXX|OPTIMIZE)\b/gi;

function span(text, type, cls, showWs) {
  const display = showWs && text.includes(" ") ? text.replaceAll(" ", "·") : text;
  if (type === "comment" && TODO_COMMENT_RE.test(text)) {
    TODO_COMMENT_RE.lastIndex = 0;
    const wrap = h("span", { class: `code-t-comment${cls ?? ""}`.trim() });
    let last = 0;
    for (let m = TODO_COMMENT_RE.exec(text); m !== null; m = TODO_COMMENT_RE.exec(text)) {
      if (m.index > last) {
        const before = text.slice(last, m.index);
        wrap.append(document.createTextNode(showWs ? before.replaceAll(" ", "·") : before));
      }
      const tag = m[1].toUpperCase();
      wrap.append(h("span", { class: `code-todo-tag code-todo-${tag.toLowerCase()}` }, m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      const rest = text.slice(last);
      wrap.append(document.createTextNode(showWs ? rest.replaceAll(" ", "·") : rest));
    }
    return wrap;
  }
  if (!type && !cls && !showWs) return document.createTextNode(display);
  return h("span", { class: `${type ? `code-t-${type}` : ""}${cls ?? ""}${showWs && text.includes(" ") ? " code-ws" : ""}`.trim() }, display);
}

/** Adds colored pieces to a row, cutting them where search matches, word occurrences or brackets are marked. decos: [{ from, to, cls }]. */
function appendTokens(row, tokens, decos, showWs) {
  if (!decos) {
    for (const t of tokens) row.append(span(t.text, t.type, "", showWs));
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
      row.append(span(text.slice(0, cut), t.type, cls, showWs));
      col += cut;
      text = text.slice(cut);
    }
  }
}

/**
 * Makes an editor. Callbacks: onChange(), onSelect({ start, end, line, col, word, wordCount }), onClip(text) for copy and cut,
 * onBookmark(line) when a line number in the gutter is clicked, onScroll({ scrollTop, scrollHeight, clientHeight, topLine }),
 * and onKey(event) which sees every key first and returns true when dealt with.
 * The element to put on the page is `editor.el`.
 */
export function createEditor({ onChange = () => {}, onSelect = () => {}, onClip = () => {}, onKey = () => false, onBookmark = null, onScroll = null } = {}) {
  const o = { lang: "plain", wrap: false, lineNumbers: true, minimap: false, stickyScroll: true, whitespace: false, indentGuides: true, ruler: false, wordHighlight: true, fontSize: 0, tabSize: 0, unit: "  ", readOnly: false };
  const ta = h("textarea", { class: "code-ta", spellcheck: "false", autocomplete: "off", autocapitalize: "off", autocorrect: "off", wrap: "off", "aria-label": "Code editor text", "aria-multiline": "true" });
  const inner = h("div", { class: "code-hl-inner" });
  const layer = h("div", { class: "code-hl", "aria-hidden": "true" }, inner);
  const gutInner = h("div", { class: "code-gut-inner" });
  const gutter = h("div", { class: "code-gut", "aria-hidden": "true" }, gutInner);
  const mmLines = h("div", { class: "code-mm-lines" });
  const mmSlider = h("div", { class: "code-mm-slider" });
  const minimap = h("div", { class: "code-minimap", "aria-hidden": "true", hidden: true }, mmLines, mmSlider);
  const stickyScrollEl = h("button", {
    type: "button",
    class: "code-sticky-scroll",
    hidden: true,
    title: "Enclosing block header (click to jump to its start line)",
    "aria-label": "Jump to enclosing block start",
    onclick: () => {
      const targetLine = Number(stickyScrollEl.dataset.line);
      if (targetLine > 0) editor.goTo(targetLine, 1);
    },
  });
  const probe = h("span", { class: "code-probe", "aria-hidden": "true" }, "0000000000");
  const el = h("div", { class: "code-ed code-guides" }, layer, gutter, minimap, stickyScrollEl, ta, probe);
  const hl = createHighlighter("plain");

  let lines = [""];
  let starts = null;
  let dirty = true;
  let mmDirty = true;
  let lh = 21;
  let cw = 0;
  let gutterPx = 0;
  let rendered = null;
  let frame = 0;
  let curLine = -1;
  let lastSel = "";
  let plain = false;
  let bookmarks = new Set();
  let lineChanges = new Map();
  let foldRanges = [];
  let foldMap = new Map();
  const foldedLines = new Set();
  let diagnostics = [];
  const diagByLine = new Map();
  const decoKinds = { brk: new Map(), find: new Map(), word: new Map(), diag: new Map() };
  const rows = new Map();
  let tabTrap = true;
  const fallbackUndo = [];

  const getStarts = () => (starts ??= buildLineStarts(ta.value));
  const lineOf = (pos) => lineAt(getStarts(), pos);

  function decosFor(i) {
    const a = decoKinds.brk.get(i);
    const b = decoKinds.find.get(i);
    const w = decoKinds.word.get(i);
    const d = decoKinds.diag.get(i);
    if (!a && !b && !w && !d) return null;
    return [...(d ?? []), ...(w ?? []), ...(b ?? []), ...(a ?? [])];
  }

  function isLineHiddenInFold(lineOneBased) {
    for (const startLine of foldedLines) {
      const r = foldMap.get(startLine);
      if (r && lineOneBased > r.startLine && lineOneBased <= r.endLine) return true;
    }
    return false;
  }

  function updateStickyScroll() {
    if (o.stickyScroll === false || plain || foldRanges.length === 0) {
      stickyScrollEl.hidden = true;
      return;
    }
    const topLine = Math.max(1, Math.floor((ta.scrollTop - PAD) / lh) + 1);
    const refLine = Math.max(topLine, curLine + 1);
    let enclosing = null;
    for (const r of foldRanges) {
      if (r.startLine < refLine && refLine <= r.endLine) {
        enclosing = r;
      }
    }
    if (!enclosing) {
      stickyScrollEl.hidden = true;
      return;
    }
    stickyScrollEl.hidden = false;
    stickyScrollEl.dataset.line = String(enclosing.startLine);
    stickyScrollEl.textContent = `📌 Ln ${enclosing.startLine}: ${enclosing.label}`;
  }

  function buildMinimap() {
    if (!o.minimap) return;
    mmDirty = false;
    const total = lines.length;
    const maxBars = 120;
    const step = Math.max(1, Math.ceil(total / maxBars));
    const frag = document.createDocumentFragment();
    for (let i = 0; i < total; i += step) {
      const line = lines[i] ?? "";
      const trimmed = line.trimStart();
      const indent = Math.min(24, line.length - trimmed.length);
      const len = Math.min(60, trimmed.length);
      let cls = "code-mm-row";
      for (let j = i; j < Math.min(total, i + step); j++) {
        if (j === curLine) cls += " code-mm-cur";
        if (bookmarks.has(j + 1)) cls += " code-mm-bm";
        if (diagByLine.has(j)) cls += " code-mm-err";
        const chg = lineChanges.get(j + 1);
        if (chg === "added") cls += " code-mm-added";
        else if (chg === "modified") cls += " code-mm-modified";
        if (decoKinds.find.has(j)) cls += " code-mm-find";
        else if (decoKinds.word.has(j)) cls += " code-mm-word";
      }
      const bar = h("span", { class: "code-mm-bar" });
      bar.style.marginLeft = `${Math.round(indent * 1.2)}px`;
      bar.style.width = `${Math.max(2, Math.round(len * 0.85))}px`;
      frag.append(h("div", { class: cls, dataset: { line: String(i + 1) } }, len ? bar : null));
    }
    mmLines.replaceChildren(frag);
  }

  function updateMinimapScroll() {
    if (!o.minimap) return;
    if (mmDirty) buildMinimap();
    const viewH = ta.clientHeight || 1;
    const contentH = Math.max(viewH, lines.length * lh + PAD * 2);
    const mmH = minimap.clientHeight || viewH;
    const ratio = Math.min(1, viewH / contentH);
    const sliderH = Math.max(18, Math.round(mmH * ratio));
    const maxTop = Math.max(1, contentH - viewH);
    const sliderTop = Math.min(mmH - sliderH, Math.round((ta.scrollTop / maxTop) * (mmH - sliderH)));
    mmSlider.style.height = `${sliderH}px`;
    mmSlider.style.transform = `translateY(${Math.max(0, sliderTop)}px)`;
  }

  function scrollFromMinimap(clientY) {
    const rect = minimap.getBoundingClientRect();
    if (rect.height <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const targetLine = Math.max(1, Math.min(lines.length, Math.round(ratio * lines.length)));
    ta.scrollTop = Math.max(0, (targetLine - 1) * lh - ta.clientHeight / 2);
    schedule();
  }

  minimap.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    scrollFromMinimap(e.clientY);
    const onMove = (ev) => scrollFromMinimap(ev.clientY);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  gutter.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || o.wrap || !o.lineNumbers) return;
    const foldEl = e.target?.closest?.("[data-fold-line]");
    if (foldEl) {
      e.preventDefault();
      e.stopPropagation();
      editor.toggleFold(Number(foldEl.dataset.foldLine));
      return;
    }
    if (!onBookmark) return;
    e.preventDefault();
    const rect = gutter.getBoundingClientRect();
    const y = e.clientY - rect.top + ta.scrollTop - PAD;
    const line = Math.max(1, Math.min(lines.length, Math.floor(y / lh) + 1));
    onBookmark(line);
  });

  function sync() {
    if (!dirty) return;
    dirty = false;
    mmDirty = true;
    const text = ta.value;
    lines = text.split("\n");
    starts = null;
    plain = text.length > PLAIN_ABOVE;
    hl.setEnabled(!plain);
    hl.setLines(lines);

    foldRanges = plain ? [] : detectFoldableRanges(text, o.lang);
    foldMap = new Map(foldRanges.map((r) => [r.startLine, r]));
    for (const l of [...foldedLines]) {
      if (!foldMap.has(l)) foldedLines.delete(l);
    }

    diagnostics = plain ? [] : diagnoseSyntax(text, o.lang);
    diagByLine.clear();
    const diagDecos = new Map();
    for (const d of diagnostics) {
      const idx = d.line - 1;
      if (!diagByLine.has(idx)) diagByLine.set(idx, d.message);
      diagDecos.set(idx, [...(diagDecos.get(idx) ?? []), { from: Math.max(0, d.col - 1), to: Math.max(d.col, d.endCol - 1), cls: "code-diag-err" }]);
    }
    decoKinds.diag = diagDecos;

    const digits = Math.max(3, String(lines.length).length);
    rendered = null;
    const px = o.lineNumbers && cw ? Math.ceil(digits * cw) + 22 : o.lineNumbers ? 46 : 0;
    if (px !== gutterPx) {
      gutterPx = px;
      el.style.setProperty("--code-gutter", `${px}px`);
    }
  }

  function row(i) {
    const lineOne = i + 1;
    const inFold = isLineHiddenInFold(lineOne);
    const r = h("div", { class: `code-row${i === curLine ? " code-cur" : ""}${inFold ? " code-row-folded" : ""}` });
    if (o.wrap && o.lineNumbers) r.append(h("span", { class: `code-ln${bookmarks.has(lineOne) ? " code-bm" : ""}` }, String(lineOne)));
    const tokens = plain ? (lines[i] ? [{ text: lines[i], type: "" }] : []) : hl.line(i);
    appendTokens(r, tokens, decosFor(i), o.whitespace);
    if (!plain) {
      const colors = findLineColors(lines[i]);
      for (const c of colors) {
        const swatch = h("span", {
          class: "code-color-swatch",
          dataset: { color: c.color, line: String(lineOne), col: String(c.from + 1) },
          title: `Color ${c.color}`,
        });
        swatch.style.backgroundColor = c.color;
        r.append(swatch);
      }
      if (foldedLines.has(lineOne)) {
        const range = foldMap.get(lineOne);
        if (range) {
          r.append(h("span", {
            class: "code-fold-badge",
            dataset: { foldLine: String(lineOne) },
          }, ` ⋯ ${range.endLine - range.startLine} lines folded`));
        }
      }
    }
    return r;
  }

  function gutRow(i) {
    const lineOne = i + 1;
    const chg = lineChanges.get(lineOne);
    const errMsg = diagByLine.get(i);
    const foldable = foldMap.has(lineOne);
    const isFolded = foldedLines.has(lineOne);
    const cls = [
      "code-gn",
      i === curLine ? "code-cur" : "",
      bookmarks.has(lineOne) ? "code-bm" : "",
      chg ? `code-gn-${chg}` : "",
      errMsg ? "code-gn-err" : "",
      foldable ? "code-gn-foldable" : "",
      isFolded ? "code-gn-folded" : "",
    ].filter(Boolean).join(" ");
    const tipParts = [];
    if (errMsg) tipParts.push(`⚠ ${errMsg}`);
    if (chg) tipParts.push(`Line ${chg} since last save`);
    if (onBookmark) tipParts.push("Click to toggle bookmark on this line");
    const foldToggle = foldable
      ? h("span", {
          class: "code-fold-icon",
          dataset: { foldLine: String(lineOne) },
          title: isFolded ? `Unfold block (lines ${lineOne}–${foldMap.get(lineOne).endLine})` : `Fold block (lines ${lineOne}–${foldMap.get(lineOne).endLine})`,
        }, isFolded ? "▸" : "▾")
      : null;
    return h("div", { class: cls, title: tipParts.join(" · ") || null }, foldToggle, String(lineOne));
  }

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
    updateMinimapScroll();
    updateStickyScroll();
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  function invalidate() {
    rendered = null;
    mmDirty = true;
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
    mmDirty = true;
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
      mmDirty = true;
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

    const words = new Map();
    let occWord = "";
    let occCount = 0;
    if (o.wordHighlight && text.length < 300_000) {
      const occ = findWordOccurrences(text, start, end, 300_000);
      if (occ && occ.matches.length > 1) {
        occWord = occ.word;
        occCount = occ.matches.length;
        const st = getStarts();
        for (let k = 0; k < occ.matches.length; k++) {
          const m = occ.matches[k];
          const l = lineAt(st, m.index);
          words.set(l, [...(words.get(l) ?? []), { from: m.index - st[l], to: m.index - st[l] + m.length, cls: k === occ.current ? "code-word-occ code-word-cur" : "code-word-occ" }]);
        }
      }
    }
    setKind("word", words);
    updateStickyScroll();
    onSelect({ start, end, line: line + 1, col: caret - getStarts()[line] + 1, word: occWord, wordCount: occCount });
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
  ta.addEventListener("scroll", () => {
    schedule();
    if (onScroll) {
      const topLine = Math.max(1, Math.floor((ta.scrollTop - PAD) / lh) + 1);
      const maxScroll = Math.max(1, ta.scrollHeight - ta.clientHeight);
      const ratio = Math.max(0, Math.min(1, ta.scrollTop / maxScroll));
      onScroll({ scrollTop: ta.scrollTop, scrollHeight: ta.scrollHeight, clientHeight: ta.clientHeight, topLine, ratio });
    }
  });
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
      mmDirty = true;
      patch(changed);
      schedule();
    },
    setLineChanges(map) {
      lineChanges = map instanceof Map ? map : new Map();
      mmDirty = true;
      invalidate();
    },
    toggleFold(lineOneBased) {
      sync();
      if (!foldMap.has(lineOneBased)) return false;
      if (foldedLines.has(lineOneBased)) foldedLines.delete(lineOneBased);
      else foldedLines.add(lineOneBased);
      rendered = null;
      mmDirty = true;
      render();
      return true;
    },
    foldAtCursor() {
      sync();
      const lineOne = lineOf(ta.selectionStart) + 1;
      if (foldMap.has(lineOne)) {
        foldedLines.add(lineOne);
        rendered = null;
        mmDirty = true;
        render();
        return true;
      }
      let enclosing = null;
      for (const r of foldRanges) {
        if (r.startLine <= lineOne && lineOne <= r.endLine) enclosing = r;
      }
      if (enclosing) {
        foldedLines.add(enclosing.startLine);
        rendered = null;
        mmDirty = true;
        render();
        return true;
      }
      return false;
    },
    unfoldAtCursor() {
      sync();
      const lineOne = lineOf(ta.selectionStart) + 1;
      if (foldedLines.has(lineOne)) {
        foldedLines.delete(lineOne);
        rendered = null;
        mmDirty = true;
        render();
        return true;
      }
      for (const l of [...foldedLines]) {
        const r = foldMap.get(l);
        if (r && r.startLine <= lineOne && lineOne <= r.endLine) {
          foldedLines.delete(l);
          rendered = null;
          mmDirty = true;
          render();
          return true;
        }
      }
      return false;
    },
    foldAll() {
      sync();
      for (const r of foldRanges) foldedLines.add(r.startLine);
      rendered = null;
      mmDirty = true;
      render();
    },
    unfoldAll() {
      foldedLines.clear();
      rendered = null;
      mmDirty = true;
      render();
    },
    getFoldedLines: () => [...foldedLines],
    getFoldRanges: () => { sync(); return foldRanges; },
    getDiagnostics: () => { sync(); return diagnostics; },
    setOptions(patchOptions) {
      const before = { ...o };
      Object.assign(o, patchOptions);
      if (o.lang !== before.lang) {
        hl.setLanguage(o.lang);
        dirty = true;
      }
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
      if (o.minimap !== before.minimap) {
        minimap.hidden = !o.minimap;
        el.classList.toggle("code-has-mm", Boolean(o.minimap));
        mmDirty = true;
      }
      if (o.stickyScroll !== before.stickyScroll) updateStickyScroll();
      if (o.whitespace !== before.whitespace) el.classList.toggle("code-show-ws", Boolean(o.whitespace));
      if (o.indentGuides !== before.indentGuides) el.classList.toggle("code-guides", o.indentGuides !== false);
      if (o.ruler !== before.ruler) el.classList.toggle("code-ruler", Boolean(o.ruler));
      if (o.wordHighlight !== before.wordHighlight) selectionChanged(true);
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

