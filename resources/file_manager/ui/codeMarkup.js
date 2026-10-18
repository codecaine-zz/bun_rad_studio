// Highlighters for the languages that aren't "code with keywords": HTML/XML, CSS, Markdown and diffs.
// Like scanCode they read each line once, left to right, and return { tokens, state }.
import { push } from "./codeScan.js";

const isSpace = (c) => c === " " || c === "\t";
const isWord = (c) => /[\w-]/.test(c ?? "");

// ---------------------------------------------------------------------------------------------------------------
// HTML / XML. State: "" text, "c" comment, "t|<name>|<quote>" inside a tag, "raw|<script|style>|<inner state>" inside <script>/<style>.
// `inner(lang, text, state)` highlights the text of those with the JavaScript / CSS scanner.
// ---------------------------------------------------------------------------------------------------------------

export function scanMarkup(line, state, inner) {
  const out = [];
  const n = line.length;
  let i = 0;
  while (i < n) {
    if (state.startsWith("raw|")) {
      const [, name, ...rest] = state.split("|");
      const lower = line.toLowerCase();
      const close = lower.indexOf(`</${name}`, i);
      const piece = line.slice(i, close < 0 ? n : close);
      const result = inner(name === "script" ? "javascript" : "css", piece, rest.join("|"));
      for (const t of result.tokens) push(out, t.text, t.type);
      if (close < 0) return { tokens: out, state: `raw|${name}|${result.state}` };
      state = "";
      i = close;
      continue;
    }
    if (state === "c") {
      const end = line.indexOf("-->", i);
      if (end < 0) return { tokens: [...out, { text: line.slice(i), type: "comment" }], state: "c" };
      push(out, line.slice(i, end + 3), "comment");
      i = end + 3;
      state = "";
      continue;
    }
    if (state.startsWith("t|")) {
      const [, name, quote] = state.split("|");
      if (quote) {
        const end = line.indexOf(quote, i);
        if (end < 0) return { tokens: [...out, { text: line.slice(i), type: "string" }], state };
        push(out, line.slice(i, end + 1), "string");
        i = end + 1;
        state = `t|${name}|`;
        continue;
      }
      const c = line[i];
      if (isSpace(c)) {
        let j = i + 1;
        while (j < n && isSpace(line[j])) j++;
        push(out, line.slice(i, j), "");
        i = j;
      } else if (c === ">" || (c === "/" && line[i + 1] === ">")) {
        const len = c === ">" ? 1 : 2;
        push(out, line.slice(i, i + len), "tag");
        i += len;
        state = name && c === ">" ? `raw|${name}|` : "";
      } else if (c === '"' || c === "'") {
        const end = line.indexOf(c, i + 1);
        if (end < 0) {
          push(out, line.slice(i), "string");
          return { tokens: out, state: `t|${name}|${c}` };
        }
        push(out, line.slice(i, end + 1), "string");
        i = end + 1;
      } else if (c === "=") {
        push(out, c, "");
        i++;
      } else {
        let j = i + 1;
        while (j < n && !/[\s=/>"']/.test(line[j])) j++;
        push(out, line.slice(i, j), "attr");
        i = j;
      }
      continue;
    }
    // text between tags
    const lt = line.indexOf("<", i);
    const stop = lt < 0 ? n : lt;
    let k = i;
    while (k < stop) {
      const amp = line.indexOf("&", k);
      if (amp < 0 || amp >= stop) break;
      const semi = line.indexOf(";", amp);
      if (semi > amp && semi < stop && semi - amp < 12 && /^&#?\w+;$/.test(line.slice(amp, semi + 1))) {
        push(out, line.slice(k, amp), "");
        push(out, line.slice(amp, semi + 1), "constant");
        k = semi + 1;
      } else {
        push(out, line.slice(k, amp + 1), "");
        k = amp + 1;
      }
    }
    push(out, line.slice(k, stop), "");
    i = stop;
    if (i >= n) break;
    if (line.startsWith("<!--", i)) {
      const end = line.indexOf("-->", i + 4);
      if (end < 0) return { tokens: [...out, { text: line.slice(i), type: "comment" }], state: "c" };
      push(out, line.slice(i, end + 3), "comment");
      i = end + 3;
    } else if (line.startsWith("<![CDATA[", i)) {
      const end = line.indexOf("]]>", i);
      push(out, line.slice(i, end < 0 ? n : end + 3), "string");
      i = end < 0 ? n : end + 3;
    } else if (line[i + 1] === "!" || line[i + 1] === "?") {
      const end = line.indexOf(">", i);
      push(out, line.slice(i, end < 0 ? n : end + 1), "meta");
      i = end < 0 ? n : end + 1;
    } else if (/[A-Za-z/]/.test(line[i + 1] ?? "")) {
      let j = i + 1;
      const closing = line[j] === "/";
      if (closing) j++;
      const nameStart = j;
      while (j < n && /[\w:.-]/.test(line[j])) j++;
      const name = line.slice(nameStart, j).toLowerCase();
      push(out, line.slice(i, j), "tag");
      i = j;
      state = `t|${!closing && (name === "script" || name === "style") ? name : ""}|`;
    } else {
      push(out, "<", "");
      i++;
    }
  }
  return { tokens: out, state };
}

// ---------------------------------------------------------------------------------------------------------------
// CSS (also SCSS and Less in a simple way). State: "<c|d>:<depth>:<p|v>" - in a comment or not, brace depth,
// and whether we're in a property name position or a value.
// ---------------------------------------------------------------------------------------------------------------

export function scanCss(line, state) {
  const out = [];
  const n = line.length;
  let [mode, d, part] = (state || "d:0:p").split(":");
  let depth = Number(d) || 0;
  let i = 0;
  const finish = () => ({ tokens: out, state: `${mode}:${depth}:${part}` });
  while (i < n) {
    if (mode === "c") {
      const end = line.indexOf("*/", i);
      if (end < 0) {
        push(out, line.slice(i), "comment");
        return finish();
      }
      push(out, line.slice(i, end + 2), "comment");
      i = end + 2;
      mode = "d";
      continue;
    }
    const c = line[i];
    if (isSpace(c)) {
      let j = i + 1;
      while (j < n && isSpace(line[j])) j++;
      push(out, line.slice(i, j), "");
      i = j;
    } else if (line.startsWith("/*", i)) {
      push(out, "/*", "comment");
      i += 2;
      mode = "c";
    } else if (line.startsWith("//", i) && (i === 0 || /[\s;{}]/.test(line[i - 1]))) {
      push(out, line.slice(i), "comment");
      i = n;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && line[j] !== c) j += line[j] === "\\" ? 2 : 1;
      push(out, line.slice(i, Math.min(n, j + 1)), "string");
      i = Math.min(n, j + 1);
    } else if (c === "{") {
      push(out, c, "");
      depth++;
      part = "p";
      i++;
    } else if (c === "}") {
      push(out, c, "");
      depth = Math.max(0, depth - 1);
      part = "p";
      i++;
    } else if (c === ";") {
      push(out, c, "");
      part = "p";
      i++;
    } else if (c === "@") {
      let j = i + 1;
      while (j < n && isWord(line[j])) j++;
      push(out, line.slice(i, j), "keyword");
      part = "p";
      i = j;
    } else if (depth > 0 && part === "p" && /[-\w]/.test(c)) {
      let j = i + 1;
      while (j < n && isWord(line[j])) j++;
      let k = j;
      while (k < n && isSpace(line[k])) k++;
      let isProp = line[k] === ":";
      if (isProp) {
        const rest = line.slice(k + 1);
        const brace = rest.indexOf("{");
        const semi = Math.min(...[rest.indexOf(";"), rest.indexOf("}")].map((x) => (x < 0 ? Infinity : x)));
        if (brace >= 0 && brace < semi) isProp = false;
      }
      push(out, line.slice(i, j), isProp ? "property" : "tag");
      if (isProp) {
        push(out, line.slice(j, k + 1), "");
        part = "v";
        i = k + 1;
      } else {
        part = "s";
        i = j;
      }
    } else if (part === "v" || (depth > 0 && part !== "s" && part !== "p")) {
      i = cssValue(line, i, out);
    } else if (c === "." || c === "#") {
      let j = i + 1;
      while (j < n && isWord(line[j])) j++;
      push(out, line.slice(i, j), c === "." ? "type" : "function");
      i = j;
    } else if (c === ":") {
      let j = i + 1;
      if (line[j] === ":") j++;
      while (j < n && isWord(line[j])) j++;
      push(out, line.slice(i, j), "attr");
      i = j;
    } else if (c === "[") {
      const end = line.indexOf("]", i);
      push(out, line.slice(i, end < 0 ? n : end + 1), "attr");
      i = end < 0 ? n : end + 1;
    } else if (/[A-Za-z_-]/.test(c)) {
      let j = i + 1;
      while (j < n && isWord(line[j])) j++;
      push(out, line.slice(i, j), depth === 0 || part === "s" ? "tag" : "");
      i = j;
    } else {
      push(out, c, "");
      i++;
    }
  }
  return finish();
}

/** One piece of a CSS value starting at `i`: a number with its unit, a color, a function name, !important, or a character. */
function cssValue(line, i, out) {
  const n = line.length;
  const c = line[i];
  let j = i + 1;
  if (c === "#") {
    while (j < n && /[0-9a-fA-F]/.test(line[j])) j++;
    push(out, line.slice(i, j), j > i + 1 ? "number" : "");
  } else if (/[0-9]/.test(c) || ((c === "-" || c === ".") && /[0-9.]/.test(line[i + 1] ?? ""))) {
    while (j < n && /[0-9.]/.test(line[j])) j++;
    while (j < n && /[a-zA-Z%]/.test(line[j])) j++;
    push(out, line.slice(i, j), "number");
  } else if (c === "!" ) {
    while (j < n && /[a-z]/i.test(line[j])) j++;
    push(out, line.slice(i, j), "keyword");
  } else if (/[A-Za-z_-]/.test(c)) {
    while (j < n && isWord(line[j])) j++;
    const word = line.slice(i, j);
    if (line[j] === "(" && word === "url" && line[j + 1] !== '"' && line[j + 1] !== "'") {
      const end = line.indexOf(")", j);
      push(out, "url(", "function");
      push(out, line.slice(j + 1, end < 0 ? n : end), "string");
      j = end < 0 ? n : end;
    } else push(out, word, line[j] === "(" ? "function" : "");
  } else push(out, c, "");
  return j;
}

// ---------------------------------------------------------------------------------------------------------------
// Markdown. State: "" or "f:<fence marker>" while inside a fenced code block.
// ---------------------------------------------------------------------------------------------------------------

export function scanMarkdown(line, state) {
  const out = [];
  if (state.startsWith("f:")) {
    const fence = state.slice(2);
    if (line.trimStart().startsWith(fence)) return { tokens: [{ text: line, type: "meta" }], state: "" };
    return { tokens: [{ text: line, type: "string" }], state };
  }
  const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  if (fence) return { tokens: [{ text: line, type: "meta" }], state: `f:${fence[1].slice(0, 3)}` };
  if (/^ {0,3}#{1,6}(\s|$)/.test(line)) return { tokens: [{ text: line, type: "heading" }], state: "" };
  if (/^ {0,3}([-*_])( ?\1){2,} *$/.test(line)) return { tokens: [{ text: line, type: "meta" }], state: "" };
  let rest = line;
  const quote = /^\s*(>\s?)+/.exec(line);
  const list = quote ? null : /^\s*(?:[-*+]|\d{1,9}[.)])\s+(\[[ xX]\]\s+)?/.exec(line);
  const lead = quote ?? list;
  if (lead) {
    push(out, lead[0], quote ? "comment" : "keyword");
    rest = line.slice(lead[0].length);
  }
  inline(rest, out);
  return { tokens: out, state: "" };
}

function inline(text, out) {
  const n = text.length;
  let i = 0;
  let plainFrom = 0;
  const flush = (upTo) => push(out, text.slice(plainFrom, upTo), "");
  const take = (from, to, type) => {
    flush(from);
    push(out, text.slice(from, to), type);
    i = to;
    plainFrom = to;
  };
  while (i < n) {
    const c = text[i];
    if (c === "\\") i += 2;
    else if (c === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) take(i, end + 1, "string");
      else i++;
    } else if ((c === "*" || c === "_") && text[i + 1] === c) {
      const end = text.indexOf(c + c, i + 2);
      if (end > i + 2) take(i, end + 2, "strong");
      else i += 2;
    } else if ((c === "*" || c === "_") && !isSpace(text[i + 1] ?? " ") && (c === "*" || !isWord(text[i - 1] ?? " "))) {
      const end = text.indexOf(c, i + 1);
      if (end > i + 1 && !isSpace(text[end - 1])) take(i, end + 1, "emphasis");
      else i++;
    } else if (c === "~" && text[i + 1] === "~") {
      const end = text.indexOf("~~", i + 2);
      if (end > i + 2) take(i, end + 2, "deleted");
      else i += 2;
    } else if (c === "[" || (c === "!" && text[i + 1] === "[")) {
      const open = c === "!" ? i + 1 : i;
      const close = text.indexOf("](", open);
      const end = close < 0 ? -1 : text.indexOf(")", close + 2);
      if (close > open && end > close) take(i, end + 1, "link");
      else i++;
    } else if (c === "<") {
      const end = text.indexOf(">", i + 1);
      if (end > i + 1 && /^<\/?[A-Za-z][^<>]*>$|^<https?:[^<>\s]*>$/.test(text.slice(i, end + 1))) take(i, end + 1, "tag");
      else i++;
    } else i++;
  }
  flush(n);
}

// ---------------------------------------------------------------------------------------------------------------
// Diffs
// ---------------------------------------------------------------------------------------------------------------

export function scanDiff(line) {
  let type = "";
  if (/^(diff |index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode|Binary files)/.test(line)) type = "keyword";
  else if (line.startsWith("@@")) type = "meta";
  else if (line.startsWith("+")) type = "inserted";
  else if (line.startsWith("-")) type = "deleted";
  return { tokens: line ? [{ text: line, type }] : [], state: "" };
}
