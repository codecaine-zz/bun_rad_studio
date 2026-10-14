// Smart typing helpers: new lines that keep the indentation, brackets and quotes that close themselves, matching
// brackets, and finding out how a file is indented. Pure functions on text and offsets.
import { lineEnd, lineStart } from "./codeLines.js";

const OPEN_TO_CLOSE = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
const CLOSERS = new Set([")", "]", "}", '"', "'", "`"]);
const QUOTES = new Set(['"', "'", "`"]);
const isWordChar = (c) => c !== undefined && c !== "" && /[\w\u00c0-\uffff]/.test(c);

/** Which of ( [ { " ' ` close by themselves in this language. */
export function autoClosePairs(lang) {
  switch (lang) {
    case "plain": return "([{";
    case "markdown": return "([{`";
    case "json": return '([{"';
    case "rust": return '([{"`';
    default: return "([{\"'`";
  }
}

export function indentUnit({ useTabs, size }) {
  return useTabs ? "\t" : " ".repeat(Math.max(1, size || 2));
}

/** Enter: a new line with the same indentation; one level deeper after an opening bracket (and a tidy block between { and }). */
export function newLineEdit(text, s, e, lang, unit) {
  const ls = lineStart(text, s);
  const before = text.slice(ls, s);
  const indent = /^[ \t]*/.exec(before)[0];
  const trimmed = before.trimEnd();
  const prev = trimmed[trimmed.length - 1] ?? "";
  const next = text[e] ?? "";
  if (lang === "markdown" && !text.slice(e, lineEnd(text, e)).trim().length) {
    const m = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/.exec(before);
    if (m) {
      if (m[5].trim() === "" && !m[4]) return { from: ls, to: e, insert: "", selStart: ls, selEnd: ls };
      const num = /^(\d+)([.)])$/.exec(m[2]);
      const marker = num ? `${Number(num[1]) + 1}${num[2]}` : m[2];
      const insert = `\n${m[1]}${marker}${m[3]}${m[4] ? "[ ] " : ""}`;
      return { from: s, to: e, insert, selStart: s + insert.length, selEnd: s + insert.length };
    }
  }
  const opensBlock = (prev !== "" && "{[(".includes(prev)) || ((lang === "python" || lang === "yaml") && prev === ":");
  const between = (prev === "{" && next === "}") || (prev === "[" && next === "]") || (prev === "(" && next === ")") || ((lang === "html" || lang === "xml") && prev === ">" && text.startsWith("</", e));
  if (between) {
    const insert = `\n${indent}${unit}\n${indent}`;
    const caret = s + 1 + indent.length + unit.length;
    return { from: s, to: e, insert, selStart: caret, selEnd: caret };
  }
  const insert = `\n${indent}${opensBlock ? unit : ""}`;
  return { from: s, to: e, insert, selStart: s + insert.length, selEnd: s + insert.length };
}

/**
 * A typed character. Answers { from, to, insert, selStart, selEnd } to apply, { move } to just step over a closing
 * character that is already there, or null to let the character be typed normally.
 */
export function typedCharEdit(text, s, e, ch, lang) {
  const pairs = autoClosePairs(lang);
  const close = OPEN_TO_CLOSE[ch];
  if (s !== e) {
    if (!close || !pairs.includes(ch)) return null;
    const insert = ch + text.slice(s, e) + close;
    return { from: s, to: e, insert, selStart: s + 1, selEnd: s + 1 + (e - s) };
  }
  const next = text[s];
  if (CLOSERS.has(ch) && next === ch && (!QUOTES.has(ch) || pairs.includes(ch))) return { move: s + 1 };
  if (!close || !pairs.includes(ch)) return null;
  const before = text[s - 1];
  if (QUOTES.has(ch)) {
    if (isWordChar(before) || before === ch || isWordChar(next)) return null;
    if (ch === "'" && before === "\\") return null;
  } else if (next !== undefined && !/[\s)\]}>,;:.]/.test(next)) return null;
  return { from: s, to: s, insert: ch + close, selStart: s + 1, selEnd: s + 1 };
}

/** Typing } ) or ] on a line that holds only indentation takes one level of indent away (like `v fmt` and most editors do). */
export function closerDedentEdit(text, s, e, ch, unit, lang) {
  if (s !== e || !"})]".includes(ch) || ["plain", "markdown", "yaml", "toml", "ini", "diff"].includes(lang)) return null;
  const lead = text.slice(lineStart(text, s), s);
  if (!lead || !/^[ \t]+$/.test(lead)) return null;
  const spaces = /( *)$/.exec(lead)[1].length;
  const remove = lead.endsWith(unit) ? unit.length : lead.endsWith("\t") ? 1 : Math.min(spaces, unit === "\t" ? 4 : unit.length);
  if (!remove) return null;
  const from = s - remove;
  return { from, to: s, insert: ch, selStart: from + 1, selEnd: from + 1 };
}

/** Backspace between an empty pair (like "()") removes both; in indentation made of spaces it removes one level. */
export function backspaceEdit(text, s, e, unit) {
  if (s !== e || s === 0) return null;
  const prev = text[s - 1];
  if (OPEN_TO_CLOSE[prev] !== undefined && OPEN_TO_CLOSE[prev] === text[s]) return { from: s - 1, to: s + 1, insert: "", selStart: s - 1, selEnd: s - 1 };
  if (unit !== "\t") {
    const ls = lineStart(text, s);
    const lead = text.slice(ls, s);
    if (lead.length > 0 && /^ +$/.test(lead)) {
      const remove = lead.length % unit.length || unit.length;
      return { from: s - remove, to: s, insert: "", selStart: s - remove, selEnd: s - remove };
    }
  }
  return null;
}

/** The brackets that match each other at the caret: { open, close } offsets, or null. Looks at most 100,000 characters away. */
export function findMatchingBracket(text, pos, limit = 100_000) {
  for (const at of [pos, pos - 1]) {
    const ch = text[at];
    if (ch === undefined) continue;
    const open = "([{".indexOf(ch);
    const closeIdx = ")]}".indexOf(ch);
    if (open >= 0) {
      const target = ")]}"[open];
      let depth = 0;
      for (let i = at, end = Math.min(text.length, at + limit); i < end; i++) {
        const c = text[i];
        if (c === ch) depth++;
        else if (c === target && --depth === 0) return { open: at, close: i };
      }
      return null;
    }
    if (closeIdx >= 0) {
      const target = "([{"[closeIdx];
      let depth = 0;
      for (let i = at, end = Math.max(-1, at - limit); i > end; i--) {
        const c = text[i];
        if (c === ch) depth++;
        else if (c === target && --depth === 0) return { open: i, close: at };
      }
      return null;
    }
  }
  return null;
}

/** How a file is indented: { useTabs, size } where size is null when nothing is indented (or tabs are used). */
export function detectIndent(text) {
  let tabs = 0;
  let spaces = 0;
  const diffs = new Map();
  let prev = 0;
  let seen = 0;
  for (let start = 0; start < text.length && seen < 5000; seen++) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = text.length;
    let i = start;
    while (i < end && text[i] === " ") i++;
    if (i < end && text[i] === "\t" && i === start) tabs++;
    else if (i < end && text[i] !== "\r") {
      const width = i - start;
      if (width > 0) {
        spaces++;
        const d = Math.abs(width - prev);
        if (d >= 1 && d <= 8) diffs.set(d, (diffs.get(d) ?? 0) + 1);
      }
      prev = width;
    }
    start = end + 1;
  }
  if (tabs === 0 && spaces === 0) return { useTabs: false, size: null };
  if (tabs > spaces) return { useTabs: true, size: null };
  let best = null;
  let bestCount = 0;
  for (const [d, n] of diffs) {
    const weight = n * (d === 2 || d === 4 ? 1.2 : 1);
    if (weight > bestCount) {
      best = d;
      bestCount = weight;
    }
  }
  return { useTabs: false, size: best };
}

/** The line ending that most lines use: "lf", "crlf" or "cr", and whether the file mixes them. */
export function detectEol(text) {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        crlf++;
        i++;
      } else cr++;
    } else if (c === 10) lf++;
  }
  const kinds = [crlf, lf, cr].filter((n) => n > 0).length;
  const eol = crlf >= lf && crlf >= cr && crlf > 0 ? "crlf" : lf >= cr ? "lf" : "cr";
  return { eol: kinds === 0 ? "lf" : eol, mixed: kinds > 1 };
}

/** Counts for the status bar: characters, words and lines (a trailing new line doesn't start a new line). */
export function textStats(text) {
  let words = 0;
  const re = /\S+/g;
  while (re.exec(text) !== null) words++;
  let lines = 1;
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) if (i < text.length - 1) lines++;
  return { chars: text.length, words, lines };
}

// ---------------------------------------------------------------------------------------------------------------
// Bookmarks: sorted lists of 1-based line numbers
// ---------------------------------------------------------------------------------------------------------------

/** Adds the line to the list, or removes it when it is already there. */
export function toggleBookmark(list, line) {
  return list.includes(line) ? list.filter((l) => l !== line) : [...list, line].sort((a, b) => a - b);
}

/** The next (direction 1) or previous (-1) bookmarked line after `line`, wrapping around; null when there are none. */
export function stepBookmark(list, line, direction) {
  if (!list.length) return null;
  if (direction > 0) return list.find((l) => l > line) ?? list[0];
  return [...list].reverse().find((l) => l < line) ?? list[list.length - 1];
}

/** Moves bookmarks after an edit: `delta` lines were added (or removed, when negative) at `line`. Bookmarks on removed lines are dropped. */
export function shiftBookmarks(list, line, delta) {
  if (!delta) return list;
  const out = [];
  for (const l of list) {
    if (l <= line) out.push(l);
    else if (delta > 0) out.push(l + delta);
    else if (l > line - delta) out.push(l + delta);
  }
  return out;
}
