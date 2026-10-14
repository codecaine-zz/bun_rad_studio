// The general-purpose code scanner behind the highlighter. It walks a line once, left to right, and never goes
// back, so the time it takes is proportional to the line's length whatever the text contains.
// Output: tokens [{ text, type }] ("" is plain text) and the state to carry into the next line
// ("" = normal, "c" = inside a block comment, "s:<end>" = inside a string that continues).
import { SPECS } from "./codeSpecs.js";
import { attributeEnd, isLegacyAttribute, nestedComment, optionTypeEnd, vBody, vStringStart } from "./codeScanV.js";

const prepared = new Map();
const words = (s) => new Set(s ? s.split(" ").filter(Boolean) : []);

export function prepare(id) {
  let spec = prepared.get(id);
  if (!spec) {
    const raw = SPECS[id] ?? SPECS.plain;
    const fold = (set) => (raw.ci ? new Set([...set].map((w) => w.toLowerCase())) : set);
    spec = { ...raw, id, kwSet: fold(words(raw.kw)), typeSet: fold(words(raw.types)), constSet: fold(words(raw.consts)), pascal: !["sql", "shell", "yaml", "toml", "ini", "json", "dockerfile", "makefile", "plain"].includes(id) };
    prepared.set(id, spec);
  }
  return spec;
}

/** Adds a token, joining it to the one before when they have the same type. */
export function push(out, text, type) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === type) last.text += text;
  else out.push({ text, type });
}

const isIdentStart = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$" || c > "\u007f";
const isIdentPart = (c) => isIdentStart(c) || (c >= "0" && c <= "9");
const isDigit = (c) => c >= "0" && c <= "9";
const isSpace = (c) => c === " " || c === "\t";

/** Index just after the end of a string that starts after `from`, or -1 when the line ends first. */
function stringEnd(line, from, quote) {
  for (let i = from; i < line.length; i++) {
    const c = line[i];
    if (c === "\\") i++;
    else if (line.startsWith(quote, i)) return i + quote.length;
  }
  return -1;
}

const REGEX_AFTER = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const REGEX_WORDS = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "yield", "await"]);

function regexEnd(line, i) {
  let inClass = false;
  for (let j = i + 1; j < line.length; j++) {
    const c = line[j];
    if (c === "\\") j++;
    else if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      let k = j + 1;
      while (k < line.length && line[k] >= "a" && line[k] <= "z") k++;
      return k;
    }
  }
  return -1;
}

/** Scans one line of code with the settings of language `id`, starting from `state`. */
export function scanCode(id, line, state = "", from = 0) {
  const spec = prepare(id);
  const out = [];
  const n = line.length;
  let i = from;
  let lineStart = true;
  let prev = "";
  let prevWord = "";
  const stringState = (end, quote) => (spec.multi.includes(quote) || spec.triple.includes(quote) ? `s:${end}` : "");

  if (/^c\d*$/.test(state) && spec.block) {
    if (spec.nestedBlock) {
      const r = nestedComment(line, i, Number(state.slice(1)) || 1, spec.block);
      if (r.depth > 0) return { tokens: [{ text: line.slice(i), type: "comment" }], state: `c${r.depth}` };
      push(out, line.slice(i, r.end), "comment");
      i = r.end;
    } else {
      const end = line.indexOf(spec.block[1], i);
      if (end < 0) return { tokens: [{ text: line.slice(i), type: "comment" }], state: "c" };
      push(out, line.slice(i, end + spec.block[1].length), "comment");
      i = end + spec.block[1].length;
    }
    state = "";
  } else if (spec.interp && (state.startsWith("s:") || state.startsWith("S:"))) {
    const r = vBody(out, push, line, i, state[2], state[0] === "S");
    if (!r.closed) return { tokens: out, state };
    i = r.i;
    state = "";
  } else if (state.startsWith("s:")) {
    const end = state.slice(2);
    const stop = stringEnd(line, i, end);
    if (stop < 0) return { tokens: [{ text: line.slice(i), type: "string" }], state };
    push(out, line.slice(i, stop), "string");
    i = stop;
    state = "";
  } else state = "";

  while (i < n) {
    const c = line[i];
    if (isSpace(c)) {
      let j = i + 1;
      while (j < n && isSpace(line[j])) j++;
      push(out, line.slice(i, j), "");
      i = j;
      continue;
    }
    const first = lineStart;
    lineStart = false;

    if (spec.nestedBlock && line.startsWith(spec.block[0], i)) {
      const r = nestedComment(line, i + spec.block[0].length, 1, spec.block);
      push(out, line.slice(i, r.end), "comment");
      if (r.depth > 0) return { tokens: out, state: `c${r.depth}` };
      i = r.end;
      continue;
    }
    if (spec.block && !spec.nestedBlock && line.startsWith(spec.block[0], i)) {
      const end = line.indexOf(spec.block[1], i + spec.block[0].length);
      if (end < 0) {
        push(out, line.slice(i), "comment");
        return { tokens: out, state: "c" };
      }
      push(out, line.slice(i, end + spec.block[1].length), "comment");
      i = end + spec.block[1].length;
      continue;
    }
    const marker = spec.line.find((m) => line.startsWith(m, i));
    if (marker && (!spec.lineNeedsSpace || i === 0 || isSpace(line[i - 1]))) {
      push(out, line.slice(i), "comment");
      return { tokens: out, state: "" };
    }

    if (spec.interp) {
      const vs = vStringStart(line, i);
      if (vs) {
        push(out, line.slice(i, vs.quoteAt + 1), "string");
        const r = vBody(out, push, line, vs.quoteAt + 1, vs.quote, vs.raw);
        if (!r.closed) return { tokens: out, state: `${vs.raw ? "S" : "s"}:${vs.quote}` };
        i = r.i;
        prev = vs.quote;
        continue;
      }
      if (c === "@" && line[i + 1] === "[") {
        const end = attributeEnd(line, i);
        push(out, line.slice(i, end), "meta");
        i = end;
        continue;
      }
      if (c === "[" && first && isLegacyAttribute(line)) {
        push(out, line.slice(i), "meta");
        return { tokens: out, state: "" };
      }
      if (c === "$" && isIdentStart(line[i + 1] ?? "")) {
        let j = i + 1;
        while (j < n && isIdentPart(line[j]) && line[j] !== "$") j++;
        push(out, line.slice(i, j), "meta");
        i = j;
        continue;
      }
      if ((c === "?" || c === "!") && (prev === "a" ? !spec.kwSet.has(prevWord) : prev === ")" || prev === "]") && (i === 0 || isSpace(line[i - 1]) || line[i - 1] === ")")) {
        const end = optionTypeEnd(line, i);
        if (end > 0) {
          push(out, line.slice(i, end), "type");
          prev = "a";
          prevWord = "";
          i = end;
          continue;
        }
      }
    }

    // Strings (python-style prefixes like f"..." or r'...' belong to the string)
    let quoteAt = i;
    if (spec.id === "python" && "rRbBfFuU".includes(c) && i + 1 < n && (spec.str.includes(line[i + 1]) || ("rRbBfFuU".includes(line[i + 1]) && spec.str.includes(line[i + 2] ?? "")))) quoteAt = i + (spec.str.includes(line[i + 1]) ? 1 : 2);
    const q = spec.str.includes(line[quoteAt]) ? line[quoteAt] : "";
    if (q) {
      const triple = spec.triple.find((t) => line.startsWith(t, quoteAt));
      const open = triple ?? q;
      const stop = stringEnd(line, quoteAt + open.length, open);
      if (stop < 0) {
        push(out, line.slice(i), "string");
        return { tokens: out, state: stringState(open, open) };
      }
      let type = "string";
      if (spec.keyColon) {
        let k = stop;
        while (k < n && isSpace(line[k])) k++;
        if (line[k] === ":") type = "property";
      }
      push(out, line.slice(i, stop), type);
      prev = open[0];
      i = stop;
      continue;
    }

    if (isDigit(c) || (c === "." && isDigit(line[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < n) {
        const d = line[j];
        if (isIdentPart(d) && d !== "$") j++;
        else if (d === "." && isDigit(line[j + 1] ?? "")) j++;
        else if ((d === "+" || d === "-") && /[eE]/.test(line[j - 1]) && !/^0[xX]/.test(line.slice(i, j))) j++;
        else break;
      }
      push(out, line.slice(i, j), "number");
      prev = "0";
      i = j;
      continue;
    }

    if (spec.sigil && c === spec.sigil && i + 1 < n && (isIdentStart(line[i + 1]) || line[i + 1] === "{" || line[i + 1] === "(" || (spec.sigil === "$" && /[\d?$@!#*]/.test(line[i + 1])) || line[i + 1] === c)) {
      let j = i + 1;
      if (line[j] === "{" || line[j] === "(") {
        const closer = line[j] === "{" ? "}" : ")";
        const end = line.indexOf(closer, j);
        j = end < 0 ? n : end + 1;
      } else {
        if (line[j] === c) j++;
        if (isIdentStart(line[j] ?? "")) while (j < n && isIdentPart(line[j])) j++;
        else j++;
      }
      push(out, line.slice(i, j), "variable");
      prev = "a";
      i = j;
      continue;
    }

    if (spec.meta && c === spec.meta && (spec.meta !== "#" || first)) {
      let j = i + 1;
      if (line[j] === "!") j++;
      while (j < n && (isIdentPart(line[j]) || line[j] === ".")) j++;
      if (spec.meta === "#" && line[j] === "[") {
        const end = line.indexOf("]", j);
        j = end < 0 ? n : end + 1;
      }
      if (j > i + 1 || spec.meta === "#") {
        push(out, line.slice(i, j), "meta");
        i = j;
        continue;
      }
    }

    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(line[j])) j++;
      const word = line.slice(i, j);
      const key = spec.ci ? word.toLowerCase() : word;
      let type = "";
      if (spec.kwSet.has(key)) type = "keyword";
      else if (spec.constSet.has(key)) type = "constant";
      else if (spec.typeSet.has(key)) type = "type";
      else if (line[j] === "(" ) type = "function";
      else if (spec.pascal && c >= "A" && c <= "Z" && /[a-z]/.test(word)) type = "type";
      push(out, word, type);
      prev = "a";
      prevWord = word;
      i = j;
      continue;
    }

    if (spec.regexLit && c === "/" && (REGEX_AFTER.has(prev) || REGEX_WORDS.has(prevWord)) && !isSpace(line[i + 1] ?? " ")) {
      const end = regexEnd(line, i);
      if (end > 0) {
        push(out, line.slice(i, end), "regexp");
        prev = "0";
        prevWord = "";
        i = end;
        continue;
      }
    }

    push(out, c, "");
    prev = c;
    prevWord = "";
    i++;
  }
  return { tokens: out, state: "" };
}
