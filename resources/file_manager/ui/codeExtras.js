// Built-in developer power tools for the Code tab so users never need to install external extensions:
// - TODO / FIXME / BUG / HACK / NOTE scanner (Todo Tree & Better Comments)
// - Word occurrence finder & whole-word symbol rename across a file
// - Structural Expand Selection (word -> quotes -> brackets -> line -> outer blocks -> document)
// - Toggle boolean/keyword/operator values ("true" <-> "false", "const" <-> "let", "===" <-> "!==" ...)
// - Cycle string quotes ("..." <-> '...' <-> `...`)
// - Emmet-style Wrap with HTML/XML tag (div.card#main, ul>li* ...)
// - Safe recursive-descent math expression evaluator (no eval)
// - JSON recursive key sorter & CSV/TSV parser + Markdown table formatter
// - Smart token inspector at cursor (Color hex/rgb/hsl + WCAG contrast, JWT decoder, Unix timestamp, Cron explainer,
//   octal chmod permissions, hex/bin/oct/dec number bases, URL + query string breakdown, Unicode code points)
// - Unified line diff generator (Compare with saved / Compare with another open tab)
// Pure functions with no DOM access, so every tool can be unit-tested directly.

import { findMatchingBracket } from "./codeEditing.js";
import { lineEnd, lineStart, touchedLines, wordAt } from "./codeLines.js";

export const TODO_TAGS = ["TODO", "FIXME", "BUG", "HACK", "NOTE", "XXX", "OPTIMIZE"];
const TODO_RE = /\b(TODO|FIXME|BUG|HACK|NOTE|XXX|OPTIMIZE)\b(?:\(([^)\n]{1,40})\))?\s*:?\s*(.*)$/i;

/**
 * Finds TODO / FIXME / BUG / HACK / NOTE / XXX / OPTIMIZE comments in `text`.
 * Returns [{ tag, author, text, line (1-based), col (1-based) }].
 */
export function extractTodos(text) {
  const out = [];
  const lines = String(text).split("\n");
  for (let i = 0; i < lines.length && out.length < 2000; i++) {
    const line = lines[i];
    if (line.length > 600) continue;
    const commentStart = line.search(/\/\/|#|\/\*|<!--|--|;/);
    const searchIn = commentStart >= 0 ? line.slice(commentStart) : line;
    const m = TODO_RE.exec(searchIn);
    if (!m) continue;
    // If there is no comment marker on the line, only accept when the line itself starts with the tag or comment-like prefix.
    if (commentStart < 0 && !/^\s*(?:[-*•]|\d+\.)?\s*(?:TODO|FIXME|BUG|HACK|NOTE|XXX|OPTIMIZE)\b/i.test(line)) continue;
    const tag = m[1].toUpperCase();
    const col = (commentStart >= 0 ? commentStart : 0) + m.index + 1;
    const body = (m[3] ?? "").replace(/\*\/\s*$|-+>\s*$/, "").trim();
    out.push({
      tag,
      author: m[2] ? m[2].trim() : "",
      text: body || tag,
      line: i + 1,
      col,
    });
  }
  return out;
}

const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

/**
 * Finds the identifier at the caret or selection and all its whole-word occurrences in `text`.
 * Returns { word, matches: [{ index, length }], current } or null when the caret isn't on an identifier.
 */
export function findWordOccurrences(text, start, end, maxTextLen = 400_000) {
  if (!text || text.length > maxTextLen) return null;
  let word = "";
  let wordStart = start;
  if (start !== end) {
    if (end - start > 80) return null;
    const sel = text.slice(start, end);
    if (!IDENT_RE.test(sel)) return null;
    word = sel;
  } else {
    const w = wordAt(text, start);
    if (!w) return null;
    const candidate = text.slice(w.selStart, w.selEnd);
    if (!IDENT_RE.test(candidate) || candidate.length < 2) return null;
    word = candidate;
    wordStart = w.selStart;
  }
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, "g");
  const matches = [];
  let current = -1;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index === wordStart || (start !== end && m.index === start)) current = matches.length;
    matches.push({ index: m.index, length: word.length });
    if (matches.length >= 2000) break;
  }
  if (!matches.length) return null;
  if (current < 0) current = matches.findIndex((m) => m.index >= start);
  if (current < 0) current = 0;
  return { word, matches, current };
}

/**
 * Renames every whole-word occurrence of the identifier at `pos` (or selection `start..end`) to `newName`.
 * Returns an edit { from, to, insert, selStart, selEnd, count, oldName, message } or { message } on error.
 */
export function renameSymbolInText(text, start, end, newName) {
  const occ = findWordOccurrences(text, start, end, 2_000_000);
  if (!occ) return { message: "Put the cursor on a word or variable name first." };
  const clean = String(newName ?? "").trim();
  if (!clean) return { message: "Type the new name." };
  if (clean === occ.word) return { message: "That is already its name." };
  let out = "";
  let last = 0;
  let caret = start;
  for (let i = 0; i < occ.matches.length; i++) {
    const m = occ.matches[i];
    out += text.slice(last, m.index) + clean;
    if (i === occ.current) caret = out.length;
    last = m.index + m.length;
  }
  out += text.slice(last);
  return {
    from: 0,
    to: text.length,
    insert: out,
    selStart: caret - clean.length,
    selEnd: caret,
    count: occ.matches.length,
    oldName: occ.word,
    message: `Renamed "${occ.word}" to "${clean}" (${occ.matches.length} ${occ.matches.length === 1 ? "place" : "places"}).`,
  };
}

/**
 * Finds the innermost enclosing quote or bracket pair strictly or inclusively containing `start..end`.
 */
function enclosingDelimiter(text, start, end) {
  // 1. Check quotes on the same line first
  const ls = lineStart(text, start);
  const le = lineEnd(text, end);
  if (ls === lineStart(text, end)) {
    for (const q of ['"', "'", "`"]) {
      let open = -1;
      for (let i = ls; i < le; i++) {
        if (text[i] === "\\" && i + 1 < le) { i++; continue; }
        if (text[i] === q) {
          if (open < 0) open = i;
          else {
            const innerStart = open + 1;
            const innerEnd = i;
            if (innerStart <= start && end <= innerEnd && (start > innerStart || end < innerEnd)) {
              return { selStart: innerStart, selEnd: innerEnd };
            }
            if (open <= start && end <= i + 1 && (start > open || end < i + 1)) {
              return { selStart: open, selEnd: i + 1 };
            }
            open = -1;
          }
        }
      }
    }
  }
  // 2. Scan outward for enclosing brackets ( ) [ ] { }
  const stack = [];
  const limit = Math.max(0, start - 50_000);
  for (let i = start - 1; i >= limit; i--) {
    const c = text[i];
    if (c === ")" || c === "]" || c === "}") stack.push(c);
    else if (c === "(" || c === "[" || c === "{") {
      const want = c === "(" ? ")" : c === "[" ? "]" : "}";
      if (stack.length && stack[stack.length - 1] === want) stack.pop();
      else {
        const m = findMatchingBracket(text, i);
        if (m && m.close >= end) {
          const innerStart = m.open + 1;
          const innerEnd = m.close;
          if (start > innerStart || end < innerEnd) return { selStart: innerStart, selEnd: innerEnd };
          if (start > m.open || end < m.close + 1) return { selStart: m.open, selEnd: m.close + 1 };
        }
      }
    }
  }
  return null;
}

/**
 * Progressively expands the selection `start..end`:
 * caret -> word -> inside quotes/brackets -> quotes/brackets -> line content -> full line -> outer brackets -> whole file.
 */
export function expandSelection(text, start, end) {
  if (!text.length) return null;
  if (start === 0 && end === text.length) return null;
  if (start === end) {
    const w = wordAt(text, start);
    if (w && (w.selStart < start || w.selEnd > end)) return w;
  }
  const delim = enclosingDelimiter(text, start, end);
  const ls = lineStart(text, start);
  const le = lineEnd(text, end);
  const trimStartOffset = ls + (/^[ \t]*/.exec(text.slice(ls, le))?.[0].length ?? 0);
  const trimEndOffset = le - (/[ \t]*$/.exec(text.slice(ls, le))?.[0].length ?? 0);

  // If delimiter is within the same line or smaller than the current selection's enclosing block, prefer it
  if (delim && (delim.selStart >= ls && delim.selEnd <= le)) return delim;
  if (start >= trimStartOffset && end <= trimEndOffset && (start > trimStartOffset || end < trimEndOffset) && trimEndOffset > trimStartOffset) {
    return { selStart: trimStartOffset, selEnd: trimEndOffset };
  }
  if (start >= ls && end <= le && (start > ls || end < le)) {
    return { selStart: ls, selEnd: le };
  }
  if (delim) return delim;
  return { selStart: 0, selEnd: text.length };
}

const TOGGLE_GROUPS = [
  ["true", "false"],
  ["yes", "no"],
  ["on", "off"],
  ["enabled", "disabled"],
  ["enable", "disable"],
  ["show", "hide"],
  ["visible", "hidden"],
  ["open", "close"],
  ["opened", "closed"],
  ["const", "let"],
  ["public", "private", "protected"],
  ["asc", "desc"],
  ["ascending", "descending"],
  ["min", "max"],
  ["minimum", "maximum"],
  ["width", "height"],
  ["left", "right"],
  ["top", "bottom"],
  ["start", "end"],
  ["first", "last"],
  ["up", "down"],
  ["in", "out"],
  ["before", "after"],
  ["read", "write"],
  ["get", "set"],
  ["add", "remove"],
  ["push", "pop"],
  [" resolver", " reject"],
  ["0", "1"],
  ["===", "!=="],
  ["==", "!="],
  ["<=", ">="],
  ["&&", "||"],
  ["<", ">"],
  ["+", "-"],
];

const TOGGLE_MAP = new Map();
for (const group of TOGGLE_GROUPS) {
  for (let i = 0; i < group.length; i++) {
    TOGGLE_MAP.set(group[i].trim(), group[(i + 1) % group.length].trim());
  }
}

function matchCasePattern(source, replacement) {
  if (/^[A-Za-z]+$/.test(source)) {
    if (source === source.toUpperCase()) return replacement.toUpperCase();
    if (source[0] === source[0].toUpperCase() && source.slice(1) === source.slice(1).toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1).toLowerCase();
    }
  }
  return replacement;
}

/**
 * Flips a boolean, keyword, or operator under the cursor or selection (e.g. true <-> false, const <-> let, === <-> !==).
 */
export function toggleValueAtCaret(text, start, end) {
  let from = start;
  let to = end;
  if (from === to) {
    // Check operators around the cursor first
    for (const opLen of [3, 2, 1]) {
      for (let offset = -opLen; offset <= 0; offset++) {
        const a = start + offset;
        const b = a + opLen;
        if (a < 0 || b > text.length) continue;
        const piece = text.slice(a, b);
        if (TOGGLE_MAP.has(piece) && !/^[A-Za-z0-9]+$/.test(piece)) {
          const next = TOGGLE_MAP.get(piece);
          return { from: a, to: b, insert: next, selStart: a, selEnd: a + next.length };
        }
      }
    }
    const w = wordAt(text, start);
    if (!w) return { message: "Put the cursor on a word or operator like true, false, const, ===, yes, on, or 0." };
    from = w.selStart;
    to = w.selEnd;
  }
  const current = text.slice(from, to);
  const lower = current.toLowerCase();
  const target = TOGGLE_MAP.get(lower);
  if (!target) return { message: `"${current.slice(0, 24)}" doesn't have a opposite to flip to.` };
  const insert = matchCasePattern(current, target);
  return { from, to, insert, selStart: from, selEnd: from + insert.length };
}

const QUOTE_CYCLE = ['"', "'", "`"];

/**
 * Cycles the quotes around a string literal ("..." -> '...' -> `...` -> "...").
 */
export function toggleQuotes(text, start, end) {
  const ls = lineStart(text, start);
  const le = lineEnd(text, end);
  let openPos = -1;
  let closePos = -1;
  let quote = "";

  if (start !== end && QUOTE_CYCLE.includes(text[start]) && text[end - 1] === text[start] && end - start >= 2) {
    openPos = start;
    closePos = end - 1;
    quote = text[start];
  } else {
    for (let i = ls; i < le; i++) {
      const c = text[i];
      if (c === "\\" && i + 1 < le) { i++; continue; }
      if (QUOTE_CYCLE.includes(c)) {
        let j = i + 1;
        while (j < le) {
          if (text[j] === "\\") { j += 2; continue; }
          if (text[j] === c) break;
          j++;
        }
        if (j < le && i <= start && end <= j + 1) {
          openPos = i;
          closePos = j;
          quote = c;
          break;
        }
        i = j;
      }
    }
  }
  if (openPos < 0 || closePos < 0) return { message: "Put the cursor inside a quoted string first." };
  const nextQuote = QUOTE_CYCLE[(QUOTE_CYCLE.indexOf(quote) + 1) % QUOTE_CYCLE.length];
  const inner = text.slice(openPos + 1, closePos);
  const unescaped = inner.replaceAll(`\\${quote}`, quote);
  const reescaped = unescaped.replace(new RegExp(`(?<!\\\\)\\${nextQuote}`, "g"), `\\${nextQuote}`);
  const insert = `${nextQuote}${reescaped}${nextQuote}`;
  return {
    from: openPos,
    to: closePos + 1,
    insert,
    selStart: openPos + 1,
    selEnd: openPos + 1 + reescaped.length,
  };
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function parseSingleTagSpec(spec) {
  const clean = spec.trim();
  if (!clean) return null;
  const m = /^([A-Za-z][\w:-]*)?((?:[.#][\w-]+)*)(?:\[([^\]]+)\])?(\*)?$/.exec(clean);
  if (!m) return null;
  const tag = m[1] || "div";
  const modifiers = m[2] || "";
  const attrRaw = m[3] || "";
  const repeatLines = Boolean(m[4]);
  let id = "";
  const classes = [];
  for (const part of modifiers.matchAll(/([.#])([\w-]+)/g)) {
    if (part[1] === "#") id = part[2];
    else classes.push(part[2]);
  }
  const attrs = [];
  if (id) attrs.push(`id="${id}"`);
  if (classes.length) attrs.push(`class="${classes.join(" ")}"`);
  if (attrRaw) attrs.push(attrRaw.trim());
  const open = `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>`;
  const close = VOID_TAGS.has(tag.toLowerCase()) ? "" : `</${tag}>`;
  return { tag, open, close, repeatLines };
}

/**
 * Wraps the selection (or current line) with an HTML/XML tag or simple Emmet abbreviation like `div.card#hero` or `ul>li*`.
 */
export function wrapWithTag(text, start, end, spec = "div") {
  const parts = String(spec ?? "").trim().split(/\s*>\s*/).filter(Boolean);
  if (!parts.length) return { message: "Type a tag name, such as div, span.badge, or ul>li*." };
  const parsed = parts.map(parseSingleTagSpec);
  if (parsed.some((p) => !p)) return { message: "That tag isn't valid. Try a name like div, section.card, or ul>li*." };

  let from = start;
  let to = end;
  if (from === to) {
    const { first, last } = touchedLines(text, start, end);
    from = first + (/^[ \t]*/.exec(text.slice(first, last))?.[0].length ?? 0);
    to = last;
  }
  const selected = text.slice(from, to);
  let result = selected;
  for (let i = parsed.length - 1; i >= 0; i--) {
    const p = parsed[i];
    if (p.repeatLines) {
      result = result
        .split("\n")
        .map((line) => {
          const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
          const body = line.trim();
          return body ? `${lead}${p.open}${body}${p.close}` : line;
        })
        .join("\n");
    } else if (result.includes("\n") && parsed.length > 1) {
      const lead = /^[ \t]*/.exec(result)?.[0] ?? "";
      const indented = result.split("\n").map((l) => (l.trim() ? `${lead}  ${l.trimStart()}` : l)).join("\n");
      result = `${lead}${p.open}\n${indented}\n${lead}${p.close}`;
    } else {
      result = `${p.open}${result}${p.close}`;
    }
  }
  const firstOpen = parsed[0].open.length;
  return {
    from,
    to,
    insert: result,
    selStart: from + firstOpen,
    selEnd: from + result.length - parsed[0].close.length,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Safe recursive-descent math evaluator (never calls eval or Function)
// ---------------------------------------------------------------------------------------------------------------

const MATH_FUNCS = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const MATH_CONSTS = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

export function evaluateMath(expr) {
  const clean = String(expr ?? "").trim().replace(/=\s*$/, "").trim();
  if (!clean || clean.length > 500) return { error: "Select a math expression to calculate (for example 1920 * 1080 / 1024)." };
  const tokens = [];
  for (let i = 0; i < clean.length; ) {
    const c = clean[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "*" && clean[i + 1] === "*") { tokens.push({ t: "op", v: "**" }); i += 2; continue; }
    if ("+-*/%^(),|&".includes(c)) { tokens.push({ t: "op", v: c }); i++; continue; }
    const numMatch = /^(?:0x[0-9a-fA-F_]+|0b[01_]+|0o[0-7_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?|\.\d+)/.exec(clean.slice(i));
    if (numMatch) {
      const raw = numMatch[0].replaceAll("_", "");
      const val = Number(raw);
      if (!Number.isFinite(val)) return { error: `"${numMatch[0]}" isn't a valid number.` };
      tokens.push({ t: "num", v: val });
      i += numMatch[0].length;
      continue;
    }
    const idMatch = /^[A-Za-z_]\w*/.exec(clean.slice(i));
    if (idMatch) {
      tokens.push({ t: "id", v: idMatch[0].toLowerCase() });
      i += idMatch[0].length;
      continue;
    }
    return { error: `Unexpected character "${c}" in math expression.` };
  }
  if (!tokens.length) return { error: "There is no math expression to calculate." };

  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let left = parseTerm();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = next().v;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm() {
    let left = parsePower();
    while (peek()?.t === "op" && (peek().v === "*" || peek().v === "/" || peek().v === "%")) {
      const op = next().v;
      const right = parsePower();
      if ((op === "/" || op === "%") && right === 0) throw new Error("Division by zero.");
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }

  function parsePower() {
    const base = parseUnary();
    if (peek()?.t === "op" && (peek().v === "**" || peek().v === "^")) {
      next();
      return Math.pow(base, parsePower());
    }
    return base;
  }

  function parseUnary() {
    if (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = next().v;
      return op === "-" ? -parseUnary() : parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tok = next();
    if (!tok) throw new Error("The expression ends too soon.");
    if (tok.t === "num") return tok.v;
    if (tok.t === "id") {
      if (peek()?.t === "op" && peek().v === "(") {
        next(); // (
        const args = [];
        if (!(peek()?.t === "op" && peek().v === ")")) {
          args.push(parseExpr());
          while (peek()?.t === "op" && peek().v === ",") {
            next();
            args.push(parseExpr());
          }
        }
        if (!(peek()?.t === "op" && peek().v === ")")) throw new Error("Missing closing parenthesis ')'.");
        next();
        const fn = MATH_FUNCS[tok.v];
        if (!fn) throw new Error(`Unknown math function "${tok.v}".`);
        return fn(...args);
      }
      if (tok.v in MATH_CONSTS) return MATH_CONSTS[tok.v];
      throw new Error(`Unknown name "${tok.v}".`);
    }
    if (tok.t === "op" && tok.v === "(") {
      const val = parseExpr();
      if (!(peek()?.t === "op" && peek().v === ")")) throw new Error("Missing closing parenthesis ')'.");
      next();
      return val;
    }
    throw new Error(`Unexpected "${tok.v}".`);
  }

  try {
    const value = parseExpr();
    if (pos < tokens.length) return { error: `Unexpected "${tokens[pos].v}" in expression.` };
    if (!Number.isFinite(value)) return { error: "The result isn't a finite number." };
    const formatted = Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
    return { value, text: formatted };
  } catch (err) {
    return { error: err?.message || "That math expression couldn't be calculated." };
  }
}

/**
 * Evaluates the math expression in the selection (or current line) and returns an editor edit.
 */
export function evaluateMathEdit(text, start, end) {
  let from = start;
  let to = end;
  if (from === to) {
    const ls = lineStart(text, start);
    const le = lineEnd(text, start);
    const line = text.slice(ls, le);
    const trimLead = /^[ \t]*/.exec(line)?.[0].length ?? 0;
    from = ls + trimLead;
    to = le;
  }
  const expr = text.slice(from, to);
  const res = evaluateMath(expr);
  if (res.error) return { message: res.error };
  const appendMode = /=\s*$/.test(expr);
  const insert = appendMode ? `${expr.replace(/\s*$/, "")} ${res.text}` : res.text;
  return {
    from,
    to,
    insert,
    selStart: from + insert.length,
    selEnd: from + insert.length,
    message: `${expr.replace(/=\s*$/, "").trim()} = ${res.text}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Generators (UUID, Timestamps, Sequences, Lorem Ipsum) & JSON Key Sorting
// ---------------------------------------------------------------------------------------------------------------

export function generateUuidV4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const GENERATOR_ITEMS = [
  { id: "uuid", label: "UUID v4", detail: "Random unique identifier (e.g. 550e8400-e29b-41d4-a716-446655440000)", build: () => generateUuidV4() },
  { id: "iso", label: "ISO-8601 date & time (UTC)", detail: "e.g. 2026-10-17T20:30:00.000Z", build: () => new Date().toISOString() },
  { id: "date", label: "Today's date (YYYY-MM-DD)", detail: "e.g. 2026-10-17", build: () => new Date().toISOString().slice(0, 10) },
  { id: "unix", label: "Unix timestamp (seconds)", detail: "Seconds since 1970-01-01 UTC", build: () => String(Math.floor(Date.now() / 1000)) },
  { id: "unixMs", label: "Unix timestamp (milliseconds)", detail: "Milliseconds since 1970-01-01 UTC", build: () => String(Date.now()) },
  { id: "hex16", label: "Random 16-byte hex token", detail: "32 hex characters for keys or salts", build: () => generateUuidV4().replaceAll("-", "") },
  { id: "seq10", label: "Number sequence 1 to 10 (lines)", detail: "1, 2, 3 … 10, one per line", build: () => Array.from({ length: 10 }, (_, i) => String(i + 1)).join("\n") },
  { id: "lorem", label: "Lorem ipsum paragraph", detail: "Standard placeholder paragraph", build: () => "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat." },
];

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      out[k] = sortKeysDeep(value[k]);
    }
    return out;
  }
  return value;
}

/**
 * Recursively sorts all object keys alphabetically in JSON text.
 */
export function sortJsonKeys(text, unit = "  ") {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { message: `That isn't valid JSON: ${String(err?.message ?? err).slice(0, 100)}` };
  }
  const sorted = sortKeysDeep(parsed);
  const indent = unit === "\t" ? "\t" : unit.length || 2;
  const formatted = JSON.stringify(sorted, null, indent) + (text.endsWith("\n") ? "\n" : "");
  if (formatted === text) return { message: "The JSON keys are already in alphabetical order." };
  return { from: 0, to: text.length, insert: formatted, selStart: 0, selEnd: 0, message: "Sorted JSON keys alphabetically." };
}

// ---------------------------------------------------------------------------------------------------------------
// CSV / TSV parsing and Markdown Table conversion
// ---------------------------------------------------------------------------------------------------------------

export function detectCsvDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/)[0] ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis && tabs > 0) return "\t";
  if (semis > commas && semis > 0) return ";";
  return ",";
}

export function parseCsvTable(text, delimiter = detectCsvDelimiter(text), maxRows = 500) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const src = String(text ?? "");
  for (let i = 0; i < src.length && rows.length < maxRows; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (inQuotes || cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const headers = rows[0] ?? [];
  const body = rows.slice(1);
  return { headers, rows: body, allRows: rows, colCount, rowCount: body.length, delimiter };
}

export function csvToMarkdownTable(text) {
  const { allRows, colCount } = parseCsvTable(text);
  if (!allRows.length || colCount === 0) throw new Error("There are no rows to turn into a table.");
  const widths = Array.from({ length: colCount }, (_, c) => Math.max(3, ...allRows.map((r) => String(r[c] ?? "").trim().replace(/\|/g, "\\|").length)));
  const formatRow = (r) => "| " + widths.map((w, c) => String(r[c] ?? "").trim().replace(/\|/g, "\\|").padEnd(w, " ")).join(" | ") + " |";
  const sep = "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |";
  const out = [formatRow(allRows[0]), sep, ...allRows.slice(1).map(formatRow)];
  return out.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Smart Token Inspector (Color, JWT, Timestamp, Cron, Chmod, Numbers, URLs, Unicode)
// ---------------------------------------------------------------------------------------------------------------

function parseHexColor(str) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(str.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3 || h.length === 4) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    const a = h.length === 4 ? +(parseInt(h[3] + h[3], 16) / 255).toFixed(2) : 1;
    return { r, g, b, a };
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? +(parseInt(h.slice(6, 8), 16) / 255).toFixed(2) : 1;
  return { r, g, b, a };
}

function parseRgbOrHsl(str) {
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*[,/]\s*([0-9.]+))?\s*\)$/i.exec(str.trim());
  if (rgb) {
    const r = Math.min(255, Number(rgb[1]));
    const g = Math.min(255, Number(rgb[2]));
    const b = Math.min(255, Number(rgb[3]));
    const a = rgb[4] !== undefined ? Math.min(1, Math.max(0, Number(rgb[4]))) : 1;
    return { r, g, b, a };
  }
  const hsl = /^hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%(?:\s*[,/]\s*([0-9.]+))?\s*\)$/i.exec(str.trim());
  if (hsl) {
    const h = (Number(hsl[1]) % 360) / 360;
    const s = Math.min(100, Number(hsl[2])) / 100;
    const l = Math.min(100, Number(hsl[3])) / 100;
    const a = hsl[4] !== undefined ? Math.min(1, Math.max(0, Number(hsl[4]))) : 1;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const r = s === 0 ? Math.round(l * 255) : Math.round(hue2rgb(h + 1 / 3) * 255);
    const g = s === 0 ? Math.round(l * 255) : Math.round(hue2rgb(h) * 255);
    const b = s === 0 ? Math.round(l * 255) : Math.round(hue2rgb(h - 1 / 3) * 255);
    return { r, g, b, a };
  }
  return null;
}

export function formatColorFormats({ r, g, b, a = 1 }) {
  const hex = `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
  const rgb = a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h /= 6;
  }
  const hsl = a < 1
    ? `hsla(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`
    : `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  const srgb = [rn, gn, bn].map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const lum = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  const contrastWhite = +((1.05) / (lum + 0.05)).toFixed(2);
  const contrastBlack = +((lum + 0.05) / 0.05).toFixed(2);
  return { hex, rgb, hsl, luminance: +lum.toFixed(3), contrastWhite, contrastBlack };
}

function decodeJwtToken(token) {
  const m = /^([A-Za-z0-9_-]{4,})\.([A-Za-z0-9_-]{4,})\.([A-Za-z0-9_-]*)$/.exec(token.trim());
  if (!m) return null;
  const decodePart = (b64) => {
    const pad = b64.replaceAll("-", "+").replaceAll("_", "/");
    const bin = atob(pad.padEnd(Math.ceil(pad.length / 4) * 4, "="));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  };
  try {
    const header = decodePart(m[1]);
    const payload = decodePart(m[2]);
    if (!header || typeof header !== "object" || !payload || typeof payload !== "object") return null;
    return { header, payload, signature: m[3] ? `${m[3].slice(0, 16)}…` : "(none)" };
  } catch {
    return null;
  }
}

function explainCron(str) {
  const clean = str.trim().replace(/^["'`]|["'`]$/g, "").trim();
  const parts = clean.split(/\s+/);
  if (parts.length !== 5) return null;
  if (!parts.every((p) => /^[\d*,/-]+$/.test(p))) return null;
  const [min, hour, dom, mon, dow] = parts;
  const pieces = [];
  if (min === "*" && hour === "*") pieces.push("Every minute");
  else if (min.startsWith("*/") && hour === "*") pieces.push(`Every ${min.slice(2)} minutes`);
  else if (min === "0" && hour.startsWith("*/")) pieces.push(`Every ${hour.slice(2)} hours (on the hour)`);
  else if (/^\d+$/.test(min) && /^\d+$/.test(hour)) pieces.push(`At ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`);
  else pieces.push(`Minute ${min}, hour ${hour}`);
  if (dom !== "*") pieces.push(`on day ${dom} of the month`);
  if (mon !== "*") pieces.push(`in month ${mon}`);
  if (dow !== "*") {
    const days = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };
    pieces.push(`on day-of-week ${dow.replace(/\d/g, (d) => days[d] ?? d)}`);
  }
  return { expression: clean, summary: pieces.join(" "), fields: { minute: min, hour, dayOfMonth: dom, month: mon, dayOfWeek: dow } };
}

function explainOctalPerm(str) {
  const m = /^(?:0o?|chmod\s+)?([0-7]{3,4})$/.exec(str.trim());
  if (!m) return null;
  const digits = m[1].length === 4 ? m[1].slice(1) : m[1];
  const rwx = (n) => `${n & 4 ? "r" : "-"}${n & 2 ? "w" : "-"}${n & 1 ? "x" : "-"}`;
  const words = (n) => [n & 4 ? "read" : "", n & 2 ? "write" : "", n & 1 ? "execute" : ""].filter(Boolean).join(", ") || "none";
  const u = Number(digits[0]);
  const g = Number(digits[1]);
  const o = Number(digits[2]);
  return {
    octal: `0${digits}`,
    symbolic: `${rwx(u)}${rwx(g)}${rwx(o)}`,
    owner: words(u),
    group: words(g),
    others: words(o),
  };
}

/**
 * Extracts the token around `start..end` on the current line and returns structured inspector cards:
 * { token, from, to, cards: [{ kind, title, rows: [[label, value]], replacements?: [{ label, value }] }] }.
 */
export function inspectTokenAtCaret(text, start, end) {
  const ls = lineStart(text, start);
  const le = lineEnd(text, end);
  const line = text.slice(ls, le);
  const col = start - ls;
  let from = start;
  let to = end;

  if (from === to) {
    // Look for a color, URL, JWT, or general token covering `col`
    const patterns = [
      /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
      /(?:rgba?|hsla?)\([^)]+\)/gi,
      /https?:\/\/[^\s"'`)>]+/gi,
      /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
      /0x[0-9a-fA-F_]+|0b[01_]+|0o[0-7_]+|-?\d[\d_]*(?:\.\d+)?/g,
      /[\w$.-]+/g,
    ];
    for (const re of patterns) {
      let found = null;
      for (let m = re.exec(line); m !== null; m = re.exec(line)) {
        if (m.index <= col && col <= m.index + m[0].length) {
          found = { from: ls + m.index, to: ls + m.index + m[0].length };
          break;
        }
      }
      if (found) {
        from = found.from;
        to = found.to;
        break;
      }
    }
  }

  const token = text.slice(from, to).trim();
  const cards = [];

  // 1. Color
  const color = parseHexColor(token) ?? parseRgbOrHsl(token);
  if (color) {
    const fmt = formatColorFormats(color);
    cards.push({
      kind: "color",
      title: "Color",
      color: fmt.hex,
      rows: [
        ["Hex", fmt.hex],
        ["RGB", fmt.rgb],
        ["HSL", fmt.hsl],
        ["Contrast vs white", `${fmt.contrastWhite}:1 (${fmt.contrastWhite >= 4.5 ? "AA pass" : "low"})`],
        ["Contrast vs black", `${fmt.contrastBlack}:1 (${fmt.contrastBlack >= 4.5 ? "AA pass" : "low"})`],
      ],
      replacements: [
        { label: `Use ${fmt.hex}`, value: fmt.hex },
        { label: `Use ${fmt.rgb}`, value: fmt.rgb },
        { label: `Use ${fmt.hsl}`, value: fmt.hsl },
      ],
    });
  }

  // 2. JWT
  const jwt = decodeJwtToken(token);
  if (jwt) {
    const rows = [
      ["Header", JSON.stringify(jwt.header)],
      ["Payload", JSON.stringify(jwt.payload, null, 2)],
    ];
    for (const k of ["exp", "iat", "nbf"]) {
      if (typeof jwt.payload[k] === "number") {
        rows.push([`${k} (UTC)`, new Date(jwt.payload[k] * 1000).toISOString()]);
      }
    }
    cards.push({ kind: "jwt", title: "JSON Web Token (JWT)", rows });
  }

  // 3. Unix Timestamp (10 digits seconds or 13 digits ms)
  if (/^\d{10}(\d{3})?$/.test(token)) {
    const ms = token.length === 13 ? Number(token) : Number(token) * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      const iso = d.toISOString();
      cards.push({
        kind: "timestamp",
        title: "Unix timestamp",
        rows: [
          ["UTC (ISO-8601)", iso],
          ["Seconds", String(Math.floor(ms / 1000))],
          ["Milliseconds", String(ms)],
        ],
        replacements: [{ label: `Replace with "${iso}"`, value: iso }],
      });
    }
  }

  // 4. Cron expression
  const cron = explainCron(token);
  if (cron) {
    cards.push({
      kind: "cron",
      title: "Cron schedule",
      rows: [
        ["Schedule", cron.summary],
        ["Minute / Hour", `${cron.fields.minute} / ${cron.fields.hour}`],
        ["Day / Month / Weekday", `${cron.fields.dayOfMonth} / ${cron.fields.month} / ${cron.fields.dayOfWeek}`],
      ],
    });
  }

  // 5. Octal permission
  const perm = explainOctalPerm(token);
  if (perm) {
    cards.push({
      kind: "chmod",
      title: "File permissions (chmod)",
      rows: [
        ["Octal / Symbolic", `${perm.octal} (${perm.symbolic})`],
        ["Owner", perm.owner],
        ["Group", perm.group],
        ["Others", perm.others],
      ],
    });
  }

  // 6. Number bases (Hex / Binary / Octal / Integer)
  if (/^(?:0x[0-9a-fA-F_]+|0b[01_]+|0o[0-7_]+|-?\d[\d_]*)$/.test(token)) {
    const cleanNum = token.replaceAll("_", "");
    const n = Number(cleanNum);
    if (Number.isSafeInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) {
      const abs = Math.abs(n);
      const sign = n < 0 ? "-" : "";
      const hex = `${sign}0x${abs.toString(16)}`;
      const bin = `${sign}0b${abs.toString(2)}`;
      const oct = `${sign}0o${abs.toString(8)}`;
      const dec = String(n);
      const rows = [
        ["Decimal", n.toLocaleString()],
        ["Hexadecimal", hex],
        ["Binary", bin],
        ["Octal", oct],
      ];
      if (n >= 1024) {
        rows.push(["Bytes", `${(n / 1024).toFixed(2)} KB · ${(n / (1024 * 1024)).toFixed(2)} MB`]);
      }
      cards.push({
        kind: "number",
        title: "Number representations",
        rows,
        replacements: [
          { label: `Decimal (${dec})`, value: dec },
          { label: `Hex (${hex})`, value: hex },
          { label: `Binary (${bin})`, value: bin },
        ],
      });
    }
  }

  // 7. URL breakdown
  if (/^https?:\/\//i.test(token)) {
    try {
      const u = new URL(token);
      const rows = [
        ["Address", u.href],
        ["Host", u.host],
        ["Path", u.pathname],
      ];
      for (const [k, v] of u.searchParams.entries()) rows.push([`?${k}`, v]);
      if (u.hash) rows.push(["Hash", u.hash]);
      cards.push({ kind: "url", title: "Web address (URL)", url: u.href, rows });
    } catch {}
  }

  // 8. Unicode & Character Info (always available if token is non-empty and short)
  const sample = (token || text.slice(start, start + 1)).slice(0, 12);
  if (sample) {
    const points = [...sample].map((ch) => {
      const cp = ch.codePointAt(0);
      const hex = cp.toString(16).toUpperCase().padStart(4, "0");
      return `${JSON.stringify(ch)} U+${hex} (${cp})`;
    });
    const bytes = new TextEncoder().encode(token || sample);
    cards.push({
      kind: "unicode",
      title: "Characters & UTF-8 bytes",
      rows: [
        ["Characters", points.join(" · ")],
        ["UTF-8 bytes", `${bytes.length} ${bytes.length === 1 ? "byte" : "bytes"} (${[...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join(" ")}${bytes.length > 16 ? " …" : ""})`],
      ],
    });
  }

  return { token, from, to, cards };
}

// ---------------------------------------------------------------------------------------------------------------
// Unified Line Diff (Compare with saved / Compare with another open tab)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Computes a unified diff between `oldText` and `newText` with `context` surrounding lines.
 * Returns { diff, added, removed, identical, hunks }.
 */
export function computeLineDiff(oldText, newText, { oldLabel = "Saved", newLabel = "Current", context = 3 } = {}) {
  if (oldText === newText) return { diff: "", added: 0, removed: 0, identical: true, hunks: [] };
  const a = String(oldText).split("\n");
  const b = String(newText).split("\n");

  // Trim common prefix and suffix first so large files with small edits diff in < 1 ms
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ type: " ", line: a[i], oldLine: i + 1, newLine: i + 1 });

  if (midA.length * midB.length <= 250_000) {
    // Exact LCS matrix on the changed middle window
    const m = midA.length;
    const n = midB.length;
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = midA[i] === midB[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        ops.push({ type: " ", line: midA[i], oldLine: start + i + 1, newLine: start + j + 1 });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: "-", line: midA[i], oldLine: start + i + 1, newLine: null });
        i++;
      } else {
        ops.push({ type: "+", line: midB[j], oldLine: null, newLine: start + j + 1 });
        j++;
      }
    }
    while (i < m) { ops.push({ type: "-", line: midA[i], oldLine: start + i + 1, newLine: null }); i++; }
    while (j < n) { ops.push({ type: "+", line: midB[j], oldLine: null, newLine: start + j + 1 }); j++; }
  } else {
    for (let i = 0; i < midA.length; i++) ops.push({ type: "-", line: midA[i], oldLine: start + i + 1, newLine: null });
    for (let j = 0; j < midB.length; j++) ops.push({ type: "+", line: midB[j], oldLine: null, newLine: start + j + 1 });
  }

  for (let i = endA, j = endB; i < a.length; i++, j++) {
    ops.push({ type: " ", line: a[i], oldLine: i + 1, newLine: j + 1 });
  }

  let added = 0;
  let removed = 0;
  const changedIdx = [];
  ops.forEach((op, idx) => {
    if (op.type === "+") { added++; changedIdx.push(idx); }
    else if (op.type === "-") { removed++; changedIdx.push(idx); }
  });

  // Group into context hunks
  const ranges = [];
  for (const idx of changedIdx) {
    const lo = Math.max(0, idx - context);
    const hi = Math.min(ops.length - 1, idx + context);
    if (ranges.length && lo <= ranges[ranges.length - 1].hi + 1) {
      ranges[ranges.length - 1].hi = Math.max(ranges[ranges.length - 1].hi, hi);
    } else {
      ranges.push({ lo, hi });
    }
  }

  const outLines = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  const hunks = [];
  for (const r of ranges) {
    const slice = ops.slice(r.lo, r.hi + 1);
    const firstOld = slice.find((x) => x.oldLine !== null)?.oldLine ?? 1;
    const firstNew = slice.find((x) => x.newLine !== null)?.newLine ?? 1;
    const oldCount = slice.filter((x) => x.type !== "+").length;
    const newCount = slice.filter((x) => x.type !== "-").length;
    const header = `@@ -${firstOld},${oldCount} +${firstNew},${newCount} @@`;
    outLines.push(header);
    for (const s of slice) outLines.push(`${s.type}${s.line}`);
    hunks.push({ header, newStart: firstNew, lines: slice });
  }

  return { diff: outLines.join("\n") + "\n", added, removed, identical: false, hunks };
}

/**
 * finds hex colors on a single line so the editor can show inline color swatches:
 * returns [{ from, to, color }].
 */
export function findLineColors(line) {
  if (!line || line.length > 500 || (!line.includes("#") && !/rgba?\(|hsla?\(/i.test(line))) return [];
  const out = [];
  const re = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|(?:rgba?|hsla?)\(\s*\d{1,3}\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?(?:\s*[,/]\s*[0-9.]+)?\s*\)/g;
  for (let m = re.exec(line); m !== null; m = re.exec(line)) {
    const parsed = parseHexColor(m[0]) ?? parseRgbOrHsl(m[0]);
    if (parsed) {
      out.push({ from: m.index, to: m.index + m[0].length, color: formatColorFormats(parsed).hex });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Code Folding Ranges, Live Syntax Diagnostics, Gutter Line Changes & Batch Multi-Line Edits
// ---------------------------------------------------------------------------------------------------------------

/**
 * Detects foldable line ranges (1-indexed: { startLine, endLine, label }) for brace blocks, Markdown headings, or indentation blocks.
 */
export function detectFoldableRanges(text, lang = "plain") {
  const src = String(text ?? "");
  if (!src || src.length > 300_000) return [];
  const lines = src.split("\n");
  const ranges = [];

  if (lang === "markdown") {
    const heads = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
      if (m) heads.push({ line: i + 1, level: m[1].length, label: m[2] });
    }
    for (let i = 0; i < heads.length; i++) {
      const cur = heads[i];
      let endLine = lines.length;
      for (let j = i + 1; j < heads.length; j++) {
        if (heads[j].level <= cur.level) {
          endLine = heads[j].line - 1;
          break;
        }
      }
      while (endLine > cur.line && !lines[endLine - 1]?.trim()) endLine--;
      if (endLine > cur.line) ranges.push({ startLine: cur.line, endLine, label: cur.label });
    }
    return ranges;
  }

  // Brace/bracket block folding per line
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === "{" || ch === "[") {
        stack.push({ ch, close: ch === "{" ? "}" : "]", startLine: i + 1, label: trimmed.slice(0, 48) });
      } else if (ch === "}" || ch === "]") {
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].close === ch) {
            const top = stack.splice(s)[0];
            if (i + 1 > top.startLine) {
              if (!ranges.some((r) => r.startLine === top.startLine)) {
                ranges.push({ startLine: top.startLine, endLine: i + 1, label: top.label });
              }
            }
            break;
          }
        }
      }
    }
  }

  // Fallback indentation folding (Python, YAML, etc.) when no brace blocks were found
  if (ranges.length === 0 && lines.length > 1) {
    const indentOf = (s) => {
      let n = 0;
      for (const ch of s) {
        if (ch === " ") n++;
        else if (ch === "\t") n += 2;
        else break;
      }
      return n;
    };
    for (let i = 0; i < lines.length - 1; i++) {
      if (!lines[i].trim()) continue;
      const base = indentOf(lines[i]);
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && indentOf(lines[j]) > base) {
        let end = j;
        for (let k = j + 1; k < lines.length; k++) {
          if (!lines[k].trim()) continue;
          if (indentOf(lines[k]) <= base) break;
          end = k;
        }
        if (end > i) ranges.push({ startLine: i + 1, endLine: end + 1, label: lines[i].trim().slice(0, 48) });
      }
    }
  }

  return ranges.sort((a, b) => a.startLine - b.startLine);
}

/**
 * Computes fast, synchronous syntax diagnostics:
 * returns Array<{ line: number, col: number, endCol: number, message: string, severity: "error" | "warning" }>.
 */
export function diagnoseSyntax(text, lang = "plain") {
  const src = String(text ?? "");
  if (!src.trim() || src.length > 250_000) return [];
  const lines = src.split("\n");
  const diags = [];

  if (lang === "json") {
    try {
      JSON.parse(src);
    } catch (err) {
      const msg = String(err?.message ?? "Invalid JSON");
      let line = 1;
      let col = 1;
      const lineColMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(msg);
      const posMatch = /position\s+(\d+)/i.exec(msg);
      if (lineColMatch) {
        line = Number(lineColMatch[1]) || 1;
        col = Number(lineColMatch[2]) || 1;
      } else if (posMatch) {
        const pos = Math.min(src.length, Math.max(0, Number(posMatch[1]) || 0));
        const before = src.slice(0, pos).split("\n");
        line = before.length;
        col = (before.at(-1)?.length ?? 0) + 1;
      } else {
        // Fallback: check trailing comma or bracket mismatch
        for (let i = 0; i < lines.length; i++) {
          if (/,\s*[}\]]/.test(lines[i]) || (i + 1 < lines.length && /,\s*$/.test(lines[i]) && /^\s*[}\]]/.test(lines[i + 1]))) {
            line = i + 1;
            col = Math.max(1, lines[i].lastIndexOf(",") + 1);
            break;
          }
        }
      }
      const lineLen = (lines[line - 1] ?? "").length;
      diags.push({
        line: Math.min(lines.length, Math.max(1, line)),
        col: Math.max(1, Math.min(col, lineLen || 1)),
        endCol: Math.max(col + 1, lineLen + 1),
        message: `JSON syntax error: ${msg}`,
        severity: "error",
      });
    }
    return diags;
  }

  if (lang === "yaml") {
    for (let i = 0; i < lines.length; i++) {
      if (/^\t+/.test(lines[i])) {
        diags.push({
          line: i + 1,
          col: 1,
          endCol: lines[i].length + 1,
          message: "YAML forbids tabs for indentation (use spaces instead).",
          severity: "error",
        });
      }
    }
    return diags;
  }

  const codeLangs = new Set(["javascript", "typescript", "v", "c", "cpp", "rust", "go", "java", "csharp", "css", "python", "php", "swift", "kotlin"]);
  if (!codeLangs.has(lang)) return diags;

  // Scan for unmatched brackets (), [], {} outside strings and comments
  const stack = [];
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const closers = new Set([")", "]", "}"]);
  let inBlockComment = false;
  let inTemplate = false;

  for (let i = 0; i < lines.length && diags.length < 10; i++) {
    const line = lines[i];
    let inString = "";
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const next = line[c + 1];
      if (inBlockComment) {
        if (ch === "*" && next === "/") { inBlockComment = false; c++; }
        continue;
      }
      if (inTemplate) {
        if (ch === "\\") { c++; continue; }
        if (ch === "`") inTemplate = false;
        continue;
      }
      if (inString) {
        if (ch === "\\") { c++; continue; }
        if (ch === inString) inString = "";
        continue;
      }
      if (ch === "/" && next === "/") break;
      if (lang === "python" && ch === "#") break;
      if (ch === "/" && next === "*") { inBlockComment = true; c++; continue; }
      if (ch === "`") { inTemplate = true; continue; }
      if (ch === '"' || ch === "'") { inString = ch; continue; }
      if (pairs[ch]) {
        stack.push({ ch, expected: pairs[ch], line: i + 1, col: c + 1 });
      } else if (closers.has(ch)) {
        const last = stack.pop();
        if (!last || last.expected !== ch) {
          diags.push({
            line: i + 1,
            col: c + 1,
            endCol: c + 2,
            message: last ? `Mismatched bracket '${ch}' (expected '${last.expected}' for '${last.ch}' on line ${last.line}).` : `Unexpected closing bracket '${ch}'.`,
            severity: "error",
          });
        }
      }
    }
  }
  for (const unclosed of stack.slice(-5)) {
    const lineLen = (lines[unclosed.line - 1] ?? "").length;
    diags.push({
      line: unclosed.line,
      col: unclosed.col,
      endCol: Math.max(unclosed.col + 1, lineLen + 1),
      message: `Unclosed '${unclosed.ch}' (missing '${unclosed.expected}').`,
      severity: "error",
    });
  }
  return diags;
}

/**
 * Compares `savedText` and `currentText` and returns a Map<number, "added" | "modified" | "deleted"> (1-indexed line in currentText).
 */
export function computeGutterLineChanges(savedText, currentText) {
  const changes = new Map();
  if (savedText === currentText || savedText === undefined || savedText === null) return changes;
  const diff = computeLineDiff(savedText, currentText, { context: 0 });
  for (const hunk of diff.hunks) {
    let sawMinus = false;
    let lastNewLine = hunk.newStart || 1;
    for (const op of hunk.lines) {
      if (op.type === "-") {
        sawMinus = true;
      } else if (op.type === "+") {
        lastNewLine = op.newLine || lastNewLine;
        changes.set(lastNewLine, sawMinus ? "modified" : "added");
      }
    }
    if (sawMinus && !hunk.lines.some((op) => op.type === "+")) {
      changes.set(Math.max(1, lastNewLine), "deleted");
    }
  }
  return changes;
}

/**
 * Replaces every occurrence of the selected text (or word under the cursor) across `text` with `replacement`.
 */
export function editAllOccurrences(text, start, end, replacement) {
  let target = text.slice(start, end);
  if (!target) {
    const w = wordAt(text, start);
    if (w) target = text.slice(w.selStart, w.selEnd);
  }
  if (!target) return { message: "Select text or place the cursor on a word first." };
  const rep = String(replacement ?? "");
  if (rep === target) return { message: "Replacement is identical to the current text." };
  const parts = text.split(target);
  const count = parts.length - 1;
  if (count <= 0) return { message: "No occurrences found." };
  const updated = parts.join(rep);
  return {
    from: 0,
    to: text.length,
    insert: updated,
    selStart: Math.min(start, updated.length),
    selEnd: Math.min(start + rep.length, updated.length),
    count,
    message: `Updated ${count} ${count === 1 ? "occurrence" : "occurrences"} of "${target}".`,
  };
}

/**
 * Adds `prefix` and/or `suffix` to every line in the selection (or the current line when nothing is selected).
 */
export function addLinePrefixSuffix(text, start, end, prefixOrOpts = "", maybeSuffix = "") {
  const isObj = typeof prefixOrOpts === "object" && prefixOrOpts !== null;
  const pre = String(isObj ? (prefixOrOpts.prefix ?? "") : (prefixOrOpts ?? ""));
  const suf = String(isObj ? (prefixOrOpts.suffix ?? "") : (maybeSuffix ?? ""));
  const skipEmpty = isObj ? Boolean(prefixOrOpts.skipEmpty) : false;
  if (!pre && !suf) return { message: "No prefix or suffix given." };
  const ls = lineStart(text, start);
  const le = lineEnd(text, end > start && text[end - 1] === "\n" ? end - 1 : end);
  const block = text.slice(ls, le);
  const lines = block.split("\n");
  const updated = lines.map((line) => (skipEmpty && !line.trim() ? line : `${pre}${line}${suf}`)).join("\n");
  return {
    from: ls,
    to: le,
    insert: updated,
    selStart: ls,
    selEnd: ls + updated.length,
    message: `Added ${pre && suf ? "prefix and suffix" : pre ? "prefix" : "suffix"} to ${lines.length} ${lines.length === 1 ? "line" : "lines"}.`,
  };
}

/**
 * Prepends sequential line numbers (1. , 2. , ...) to every line in the selection (or all lines if nothing is selected).
 */
export function numberSelectedLines(text, start, end, { startAt = 1, step = 1, separator = ". " } = {}) {
  const hasSel = start < end;
  const ls = hasSel ? lineStart(text, start) : 0;
  const le = hasSel ? lineEnd(text, text[end - 1] === "\n" ? end - 1 : end) : text.length;
  const block = text.slice(ls, le);
  const lines = block.split("\n");
  const updated = lines.map((line, idx) => `${startAt + idx * step}${separator}${line}`).join("\n");
  return {
    from: ls,
    to: le,
    insert: updated,
    selStart: ls,
    selEnd: ls + updated.length,
    message: `Numbered ${lines.length} ${lines.length === 1 ? "line" : "lines"}.`,
  };
}

