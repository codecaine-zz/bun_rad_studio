// Formatting: JSON (checked, with the position of a mistake), CSS, and "tidy the indentation" for code in the C family.
// All pure functions that return { text } or { error } / { message } in plain words.
import { tokenizeLine } from "./codeTokens.js";
import { formatHtml } from "./codeHtml.js";
import { lineCol } from "./codeLines.js";

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;
const ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);

/** Splits JSON text into tokens [{ kind, raw, at }], or explains the first mistake. */
function jsonTokens(text) {
  const tokens = [];
  const bad = (at, message) => ({ error: { message, at, ...lineCol(text, at) } });
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") i++;
    else if ("{}[],:".includes(c)) {
      tokens.push({ kind: c, raw: c, at: i });
      i++;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < text.length && text[j] !== '"'; j++) {
        const d = text[j];
        if (d === "\n" || d === "\r" || d < " ") return bad(j, "A string can't contain a line break or other control characters.");
        if (d === "\\") {
          const e = text[j + 1];
          if (e === "u") {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(j + 2, j + 6))) return bad(j, "\\u must be followed by four hex digits.");
            j += 5;
          } else if (ESCAPES.has(e)) j++;
          else return bad(j, "That backslash isn't followed by a valid escape.");
        }
      }
      if (j >= text.length) return bad(i, "This string never ends (a closing quote is missing).");
      tokens.push({ kind: "string", raw: text.slice(i, j + 1), at: i });
      i = j + 1;
    } else {
      let j = i;
      while (j < text.length && !" \t\r\n{}[],:\"".includes(text[j])) j++;
      const raw = text.slice(i, j);
      if (!(NUMBER.test(raw) || raw === "true" || raw === "false" || raw === "null")) {
        const hint = raw.startsWith("//") || raw.startsWith("/*") ? " JSON doesn't allow comments." : raw.startsWith("'") ? " JSON needs double quotes (\") around text." : "";
        return bad(i, `"${raw.slice(0, 20)}" isn't valid JSON here.${hint}`);
      }
      tokens.push({ kind: "value", raw, at: i });
      i = j;
    }
  }
  return { tokens };
}

/** Checks the order of the tokens (values, keys, commas) with a small state machine. */
function checkJson(text, tokens) {
  const bad = (t, message) => ({ error: { message, at: t?.at ?? text.length, ...lineCol(text, t?.at ?? text.length) } });
  const stack = [];
  let expect = "value"; // value | valueOrEnd | keyOrEnd | key | colon | commaOrEnd | done
  const describe = (t) => (t ? `"${t.raw.slice(0, 20)}"` : "the end of the text");
  for (const t of tokens) {
    const isValue = t.kind === "string" || t.kind === "value" || t.kind === "{" || t.kind === "[";
    if (expect === "done") return bad(t, "There is extra text after the end of the JSON.");
    if (expect === "value" || expect === "valueOrEnd") {
      if (expect === "valueOrEnd" && t.kind === "]") { stack.pop(); expect = stack.length ? "commaOrEnd" : "done"; continue; }
      if (!isValue) return bad(t, `A value was expected here, not ${describe(t)}.`);
      if (t.kind === "{") { stack.push("{"); expect = "keyOrEnd"; } else if (t.kind === "[") { stack.push("["); expect = "valueOrEnd"; } else expect = stack.length ? "commaOrEnd" : "done";
    } else if (expect === "keyOrEnd" || expect === "key") {
      if (t.kind === "}" && expect === "keyOrEnd") { stack.pop(); expect = stack.length ? "commaOrEnd" : "done"; } else if (t.kind === "string") expect = "colon";
      else return bad(t, `A key in "double quotes" was expected here, not ${describe(t)}.`);
    } else if (expect === "colon") {
      if (t.kind !== ":") return bad(t, `A colon (:) was expected after the key, not ${describe(t)}.`);
      expect = "value";
    } else if (expect === "commaOrEnd") {
      const open = stack[stack.length - 1];
      if (t.kind === ",") expect = open === "{" ? "key" : "value";
      else if ((t.kind === "}" && open === "{") || (t.kind === "]" && open === "[")) { stack.pop(); expect = stack.length ? "commaOrEnd" : "done"; } else return bad(t, `A comma or a closing bracket was expected here, not ${describe(t)}.`);
    }
  }
  if (expect !== "done") return bad(null, tokens.length ? "The JSON ends too soon (something isn't closed)." : "There is no JSON here.");
  return null;
}

/** Pretty-prints JSON. Numbers and strings are kept exactly as written (no precision is lost). */
export function formatJson(text, unit = "  ") {
  const lexed = jsonTokens(text);
  if (lexed.error) return lexed;
  const bad = checkJson(text, lexed.tokens);
  if (bad) return bad;
  const out = [];
  let depth = 0;
  const { tokens } = lexed;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const next = tokens[k + 1];
    if (t.kind === "{" || t.kind === "[") {
      out.push(t.raw);
      if (next && (next.kind === "}" || next.kind === "]")) { out.push(next.raw); k++; } else out.push("\n", unit.repeat(++depth));
    } else if (t.kind === "}" || t.kind === "]") out.push("\n", unit.repeat(--depth), t.raw);
    else if (t.kind === ",") out.push(",\n", unit.repeat(depth));
    else if (t.kind === ":") out.push(": ");
    else out.push(t.raw);
  }
  return { text: out.join("") + (/\n$/.test(text) ? "\n" : "") };
}

export function minifyJson(text) {
  const lexed = jsonTokens(text);
  if (lexed.error) return lexed;
  const bad = checkJson(text, lexed.tokens);
  if (bad) return bad;
  return { text: lexed.tokens.map((t) => t.raw).join("") + (/\n$/.test(text) ? "\n" : "") };
}

// ---------------------------------------------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------------------------------------------

/** Walks CSS text and calls `on(kind, text)` for "string", "comment" and "code" pieces, so tools never touch strings or comments. */
function cssPieces(text, on) {
  let code = "";
  const flush = () => { if (code) on("code", code); code = ""; };
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      flush();
      on("string", text.slice(i, Math.min(text.length, j + 1)));
      i = Math.min(text.length, j + 1);
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      flush();
      on("comment", text.slice(i, end < 0 ? text.length : end + 2));
      i = end < 0 ? text.length : end + 2;
    } else {
      code += c;
      i++;
    }
  }
  flush();
}

export function minifyCss(text) {
  if (/[\ue000\ue001]/.test(text)) return { error: { message: "This file has unusual private-use characters, so it can't be minified safely." } };
  // strings and /*! */ comments are set aside while the rest is squeezed, then put back
  const kept = [];
  let code = "";
  cssPieces(text, (kind, piece) => {
    if (kind === "code") code += piece;
    else if (kind === "comment" && !piece.startsWith("/*!")) code += " ";
    else code += `\ue000${kept.push(piece) - 1}\ue001`;
  });
  const squeezed = code.replace(/\s+/g, " ").replace(/\s*([{};,>])\s*/g, "$1").replace(/:\s+/g, ":").replace(/;}/g, "}").trim();
  return { text: squeezed.replace(/\ue000(\d+)\ue001/g, (_, n) => kept[Number(n)]) };
}

export function formatCss(text, unit = "  ") {
  let out = "";
  let depth = 0;
  let paren = 0;
  let lineHasText = false;
  const nl = () => { out = out.replace(/[ \t]+$/, ""); if (!out.endsWith("\n")) out += "\n"; lineHasText = false; };
  const put = (s) => { if (!lineHasText) { out += unit.repeat(depth); lineHasText = true; } out += s; };
  cssPieces(text, (kind, piece) => {
    if (kind === "string") return put(piece);
    if (kind === "comment") { if (lineHasText) nl(); put(piece); return nl(); }
    const s = piece.replace(/\s+/g, " ");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "(") { paren++; put(c); } else if (c === ")") { paren = Math.max(0, paren - 1); put(c); }
      else if (paren > 0) put(c === " " && !lineHasText ? "" : c);
      else if (c === "{") { put(out.endsWith(" ") || !lineHasText ? "{" : " {"); depth++; nl(); }
      else if (c === "}") { if (lineHasText) nl(); depth = Math.max(0, depth - 1); put("}"); nl(); if (depth === 0) out += "\n"; }
      else if (c === ";") { put(";"); nl(); }
      else if (c === ",") { put(", "); }
      else if (c === " ") { if (lineHasText && !out.endsWith(" ")) out += " "; }
      else if (c === ":" && depth > 0) {
        const rest = s.slice(i + 1);
        const stop = rest.search(/[;{}]/);
        const isSelector = stop >= 0 && rest[stop] === "{";
        put(isSelector || rest.startsWith(":") || s[i - 1] === ":" ? ":" : ": ");
        if (!isSelector && !rest.startsWith(":") && rest.startsWith(" ")) i++;
      } else put(c);
    }
  });
  return { text: out.replace(/\n{3,}/g, "\n\n").trim() + "\n" };
}

// ---------------------------------------------------------------------------------------------------------------
// Indentation for C-family code
// ---------------------------------------------------------------------------------------------------------------

/** Re-indents code by how deeply its brackets are nested. Strings, comments and the inside of multi-line strings are left alone. */
export function reindentCode(text, lang, unit = "  ") {
  const lines = text.split("\n");
  let depth = 0;
  let state = "";
  const out = lines.map((line) => {
    const startedInside = state !== "";
    const r = tokenizeLine(lang, line, state);
    state = r.state;
    if (startedInside) {
      depth = Math.max(0, depth + countBrackets(r.tokens, true).delta);
      return line;
    }
    const trimmed = line.trim();
    if (!trimmed) return "";
    const { delta, leadingClosers } = countBrackets(tokenizeLine(lang, trimmed, "").tokens, false);
    const level = Math.max(0, depth - leadingClosers);
    depth = Math.max(0, depth + delta);
    return unit.repeat(level) + trimmed;
  });
  return { text: out.join("\n") };
}

function countBrackets(tokens, skipLeading) {
  let delta = 0;
  let leadingClosers = 0;
  let leading = !skipLeading;
  for (const t of tokens) {
    if (t.type === "string" || t.type === "comment" || t.type === "regexp") {
      leading = false;
      continue;
    }
    for (const ch of t.text) {
      if (ch === "{" || ch === "(" || ch === "[") { delta++; leading = false; }
      else if (ch === "}" || ch === ")" || ch === "]") { delta--; if (leading) leadingClosers++; }
      else if (ch !== " " && ch !== "\t") leading = false;
    }
  }
  return { delta, leadingClosers };
}

const C_FAMILY = new Set(["javascript", "typescript", "java", "c", "cpp", "csharp", "go", "rust", "php", "kotlin", "swift"]);

/** Formats text for a language. { text } on success, { error } for a mistake in the text, { message } when it can't be done. */
export function formatCode(lang, text, unit = "  ") {
  if (lang === "json") return formatJson(text, unit);
  if (lang === "css") return formatCss(text, unit);
  if (lang === "html" || lang === "xml") return formatHtml(text, unit, (css) => formatCss(css, unit), (code) => reindentCode(code, "javascript", unit));
  if (C_FAMILY.has(lang)) return reindentCode(text, lang, unit);
  return { message: "Formatting isn't available for this kind of file. It works for JSON, CSS, HTML, XML and C-style languages such as JavaScript." };
}

export function minifyCode(lang, text) {
  if (lang === "json") return minifyJson(text);
  if (lang === "css") return minifyCss(text);
  return { message: "Minifying works for JSON and CSS files." };
}
