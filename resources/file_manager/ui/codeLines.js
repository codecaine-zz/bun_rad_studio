// Line-based editing operations. Each takes the whole text and the selection (selStart, selEnd) and answers with an
// edit { from, to, insert, selStart, selEnd, message? } to apply (the new selection is in the new text), or null when
// there is nothing to do. `{ message }` alone means "can't do this, and here is why". Nothing here touches the page.
import { commentSyntax } from "./codeLang.js";

export const lineStart = (text, pos) => text.lastIndexOf("\n", pos - 1) + 1;
export const lineEnd = (text, pos) => {
  const i = text.indexOf("\n", pos);
  return i < 0 ? text.length : i;
};

/** Start offsets of every line (line 0 starts at 0). */
export function buildLineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** Which line (0-based) offset `pos` is on, by binary search in `starts`. */
export function lineAt(starts, pos) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 1-based line and column of an offset. */
export function lineCol(text, pos) {
  const p = Math.max(0, Math.min(pos, text.length));
  const start = lineStart(text, p);
  let line = 1;
  for (let i = text.indexOf("\n"); i >= 0 && i < p; i = text.indexOf("\n", i + 1)) line++;
  return { line, col: p - start + 1 };
}

/** Offset of a 1-based line and column (clamped to the text). */
export function offsetOf(text, line, col = 1) {
  let pos = 0;
  for (let l = 1; l < line; l++) {
    const i = text.indexOf("\n", pos);
    if (i < 0) return text.length;
    pos = i + 1;
  }
  return Math.min(pos + Math.max(0, col - 1), lineEnd(text, pos));
}

/** The first and last offset of the lines a selection touches (a selection ending at a line start doesn't include that line). */
export function touchedLines(text, s, e) {
  const first = lineStart(text, s);
  const last = lineEnd(text, e > s && text[e - 1] === "\n" ? e - 1 : e);
  return { first, last };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces the touched lines with what `mapper(lines)` returns. */
function mapLines(text, s, e, mapper, message) {
  const { first, last } = touchedLines(text, s, e);
  const oldText = text.slice(first, last);
  const oldLines = oldText.split("\n");
  const insert = mapper(oldLines).join("\n");
  if (insert === oldText) return null;
  let selStart = first;
  let selEnd = first + insert.length;
  if (oldLines.length === 1) {
    const d = insert.length - oldText.length;
    selStart = clamp(s + d, first, first + insert.length);
    selEnd = clamp(e + d, first, first + insert.length);
  }
  return { from: first, to: last, insert, selStart, selEnd, message };
}

// ---------------------------------------------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------------------------------------------

export function toggleLineComment(text, s, e, lang) {
  const { line, block } = commentSyntax(lang);
  if (!line && !block) return { message: "This kind of file has no comments." };
  const open = line || block[0];
  const close = line ? "" : block[1];
  const isBlank = (l) => l.trim() === "";
  return mapLines(text, s, e, (lines) => {
    const real = lines.filter((l) => !isBlank(l));
    const commented = (l) => {
      const t = l.trim();
      return t.startsWith(open) && (!close || t.endsWith(close) && t.length >= open.length + close.length);
    };
    if (real.length && real.every(commented)) {
      return lines.map((l) => {
        if (isBlank(l)) return l;
        let out = l.replace(new RegExp(`^(\\s*)${escapeRe(open)} ?`), "$1");
        if (close) out = out.replace(new RegExp(` ?${escapeRe(close)}\\s*$`), "");
        return out;
      });
    }
    const targets = real.length ? real : lines;
    let indent = null;
    for (const l of targets) {
      const lead = /^\s*/.exec(l)[0];
      if (indent === null || lead.length < indent.length) indent = lead;
    }
    return lines.map((l) => {
      if (real.length && isBlank(l)) return l;
      const lead = l.startsWith(indent) ? indent.length : 0;
      const body = `${l.slice(0, lead)}${open} ${l.slice(lead)}${close ? ` ${close}` : ""}`;
      return isBlank(l) ? body.trimEnd() : body;
    });
  });
}

export function toggleBlockComment(text, s, e, lang) {
  const { line, block } = commentSyntax(lang);
  if (!block) return line ? toggleLineComment(text, s, e, lang) : { message: "This kind of file has no comments." };
  const [open, close] = block;
  if (s === e) return toggleLineComment(text, s, e, lang);
  const sel = text.slice(s, e);
  if (sel.startsWith(open) && sel.endsWith(close) && sel.length >= open.length + close.length) {
    const inner = sel.slice(open.length, sel.length - close.length).replace(/^ /, "").replace(/ $/, "");
    return { from: s, to: e, insert: inner, selStart: s, selEnd: s + inner.length };
  }
  if (text.slice(Math.max(0, s - open.length - 1), s).trimEnd().endsWith(open) && text.slice(e, e + close.length + 1).trimStart().startsWith(close)) {
    const before = text.slice(0, s);
    const o = before.lastIndexOf(open);
    const afterClose = text.indexOf(close, e);
    const inner = text.slice(o + open.length, afterClose).replace(/^ /, "").replace(/ $/, "");
    return { from: o, to: afterClose + close.length, insert: inner, selStart: o, selEnd: o + inner.length };
  }
  const insert = `${open} ${sel} ${close}`;
  return { from: s, to: e, insert, selStart: s, selEnd: s + insert.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Indentation
// ---------------------------------------------------------------------------------------------------------------

/** Tab with no selection types spaces up to the next tab stop (or a tab character). */
export function tabAtCaret(text, pos, unit) {
  if (unit === "\t") return { from: pos, to: pos, insert: "\t", selStart: pos + 1, selEnd: pos + 1 };
  const col = pos - lineStart(text, pos);
  const add = " ".repeat(unit.length - (col % unit.length));
  return { from: pos, to: pos, insert: add, selStart: pos + add.length, selEnd: pos + add.length };
}

export function indentLines(text, s, e, unit) {
  return mapLines(text, s, e, (lines) => lines.map((l) => (l === "" ? l : unit + l)));
}

export function outdentLines(text, s, e, unit) {
  const size = unit === "\t" ? 4 : unit.length;
  return mapLines(text, s, e, (lines) =>
    lines.map((l) => {
      if (l.startsWith("\t")) return l.slice(1);
      let n = 0;
      while (n < size && l[n] === " ") n++;
      return l.slice(n);
    }),
  );
}

/** Rewrites the leading white space of every line as tabs or spaces. */
export function convertIndent(text, to, size) {
  const width = Math.max(1, size);
  const lines = text.split("\n").map((l) => {
    const lead = /^[ \t]*/.exec(l)[0];
    if (!lead) return l;
    let cols = 0;
    for (const ch of lead) cols += ch === "\t" ? width - (cols % width) : 1;
    const body = l.slice(lead.length);
    return to === "tabs" ? "\t".repeat(Math.floor(cols / width)) + " ".repeat(cols % width) + body : " ".repeat(cols) + body;
  });
  const insert = lines.join("\n");
  return insert === text ? null : { from: 0, to: text.length, insert, selStart: 0, selEnd: 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// Moving and removing lines
// ---------------------------------------------------------------------------------------------------------------

export function deleteLines(text, s, e) {
  const { first, last } = touchedLines(text, s, e);
  let from = first;
  let to = last + 1;
  if (last >= text.length) {
    to = text.length;
    if (first > 0) from = first - 1;
  }
  const col = s - lineStart(text, s);
  const rest = text.slice(0, from) + text.slice(to);
  const start = from === first ? Math.min(first, rest.length) : lineStart(rest, from);
  const caret = start + Math.min(col, lineEnd(rest, start) - start);
  return { from, to, insert: "", selStart: caret, selEnd: caret };
}

export function duplicateLines(text, s, e, direction = "down") {
  const { first, last } = touchedLines(text, s, e);
  const block = text.slice(first, last);
  if (direction === "up") return { from: first, to: first, insert: `${block}\n`, selStart: s, selEnd: e };
  const shift = block.length + 1;
  return { from: last, to: last, insert: `\n${block}`, selStart: s + shift, selEnd: e + shift };
}

export function moveLines(text, s, e, direction) {
  const { first, last } = touchedLines(text, s, e);
  const block = text.slice(first, last);
  if (direction < 0) {
    if (first === 0) return null;
    const prevStart = lineStart(text, first - 1);
    const prev = text.slice(prevStart, first - 1);
    const shift = prev.length + 1;
    return { from: prevStart, to: last, insert: `${block}\n${prev}`, selStart: s - shift, selEnd: e - shift };
  }
  if (last >= text.length) return null;
  const nextEnd = lineEnd(text, last + 1);
  const next = text.slice(last + 1, nextEnd);
  const shift = next.length + 1;
  return { from: first, to: nextEnd, insert: `${next}\n${block}`, selStart: s + shift, selEnd: e + shift };
}

export function joinLines(text, s, e) {
  const { first, last } = touchedLines(text, s, e);
  let end = last;
  if (!text.slice(first, last).includes("\n")) {
    if (last >= text.length) return null;
    end = lineEnd(text, last + 1);
  }
  const lines = text.slice(first, end).split("\n");
  let out = lines[0];
  const caret = first + out.length;
  for (const l of lines.slice(1)) {
    const piece = l.trimStart();
    if (!out.length || /\s$/.test(out) || !piece) out += piece;
    else out += ` ${piece}`;
  }
  return { from: first, to: end, insert: out, selStart: caret, selEnd: caret };
}

export function selectLine(text, s, e) {
  const { first, last } = touchedLines(text, s, e);
  return { selStart: first, selEnd: Math.min(text.length, last + 1) };
}

const WORD = /[\w$\u00c0-\uffff]/;
export function wordAt(text, pos) {
  let a = pos;
  let b = pos;
  while (a > 0 && WORD.test(text[a - 1])) a--;
  while (b < text.length && WORD.test(text[b])) b++;
  return a === b ? null : { selStart: a, selEnd: b };
}

// ---------------------------------------------------------------------------------------------------------------
// Whole-text tools (they work on the selected lines when several are selected, otherwise on everything)
// ---------------------------------------------------------------------------------------------------------------

function region(text, s, e) {
  if (e > s && text.slice(s, e).includes("\n")) return touchedLines(text, s, e);
  return { first: 0, last: text.length };
}

function rewrite(text, s, e, fn, message) {
  const { first, last } = region(text, s, e);
  const oldText = text.slice(first, last);
  const trailing = oldText.endsWith("\n") && first === 0 && last === text.length;
  const lines = (trailing ? oldText.slice(0, -1) : oldText).split("\n");
  const result = fn(lines);
  const insert = result.lines.join("\n") + (trailing ? "\n" : "");
  if (insert === oldText) return { message: result.none ?? "Nothing needed changing." };
  return { from: first, to: last, insert, selStart: first, selEnd: first + insert.length, message: message?.(result) };
}

export function sortLines(text, s, e, { descending = false, ignoreCase = false, numeric = false } = {}) {
  const collator = new Intl.Collator(undefined, { numeric, sensitivity: ignoreCase ? "accent" : "variant" });
  const compare = ignoreCase || numeric ? (a, b) => collator.compare(a, b) : (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return rewrite(text, s, e, (lines) => ({
    lines: lines.map((l, i) => ({ l, i })).sort((a, b) => (descending ? -1 : 1) * compare(a.l, b.l) || a.i - b.i).map((x) => x.l),
    none: "The lines are already in that order.",
  }));
}

export function removeDuplicateLines(text, s, e, { ignoreCase = false } = {}) {
  return rewrite(
    text, s, e,
    (lines) => {
      const seen = new Set();
      const kept = [];
      for (const l of lines) {
        const k = ignoreCase ? l.toLowerCase() : l;
        if (seen.has(k)) continue;
        seen.add(k);
        kept.push(l);
      }
      return { lines: kept, removed: lines.length - kept.length, none: "There are no duplicate lines." };
    },
    (r) => `Removed ${r.removed} duplicate ${r.removed === 1 ? "line" : "lines"}.`,
  );
}

export function reverseLines(text, s, e) {
  return rewrite(text, s, e, (lines) => ({ lines: [...lines].reverse(), none: "Nothing to reverse." }));
}

export function trimTrailingWhitespace(text, s, e) {
  return rewrite(text, s, e, (lines) => ({ lines: lines.map((l) => l.replace(/[ \t]+$/, "")), none: "There was no extra space at the ends of lines." }), () => "Removed the extra space at the ends of lines.");
}

export function ensureFinalNewline(text) {
  if (text === "" || text.endsWith("\n")) return { message: "The file already ends with a new line." };
  return { from: text.length, to: text.length, insert: "\n", selStart: text.length + 1, selEnd: text.length + 1 };
}

// ---------------------------------------------------------------------------------------------------------------
// Text transforms on the selection (or the word at the caret)
// ---------------------------------------------------------------------------------------------------------------

const words = (t) => t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9\u00c0-\uffff]+/).filter(Boolean);

export const CASES = {
  upper: (t) => t.toUpperCase(),
  lower: (t) => t.toLowerCase(),
  title: (t) => t.toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()),
  camel: (t) => words(t).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(""),
  snake: (t) => words(t).map((w) => w.toLowerCase()).join("_"),
  kebab: (t) => words(t).map((w) => w.toLowerCase()).join("-"),
};

function transformSelection(text, s, e, fn) {
  let from = s;
  let to = e;
  if (s === e) {
    const w = wordAt(text, s);
    if (!w) return { message: "Select some text first (or put the cursor in a word)." };
    from = w.selStart;
    to = w.selEnd;
  }
  const before = text.slice(from, to);
  let after;
  try {
    after = fn(before);
  } catch {
    return { message: "That text can't be converted." };
  }
  if (after === before) return null;
  return { from, to, insert: after, selStart: from, selEnd: from + after.length };
}

export const changeCase = (text, s, e, kind) => transformSelection(text, s, e, CASES[kind] ?? ((t) => t));
export const urlEncode = (text, s, e) => transformSelection(text, s, e, (t) => encodeURIComponent(t));
export function urlDecode(text, s, e) {
  const r = transformSelection(text, s, e, (t) => decodeURIComponent(t.replace(/\+/g, " ")));
  return r?.message ? { message: "That text isn't valid web-address encoding (a % isn't followed by two digits)." } : r;
}
