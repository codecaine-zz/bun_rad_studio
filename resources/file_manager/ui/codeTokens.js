// Syntax highlighting: turns lines of text into coloured pieces. `tokenizeLine` handles one line given the state
// left by the line before; `createHighlighter` keeps the work for a whole document so that after an edit only
// the lines that changed (and any lines whose state really changed) are scanned again.
import { scanCode, prepare, push } from "./codeScan.js";
import { scanCss, scanDiff, scanMarkdown, scanMarkup } from "./codeMarkup.js";

/** Lines longer than this are shown without colours (minified files), which keeps every line cheap. */
export const MAX_COLOURED_LINE = 2000;
export const TOKEN_TYPES = ["keyword", "type", "function", "constant", "string", "number", "comment", "property", "tag", "attr", "variable", "meta", "regexp", "heading", "link", "strong", "emphasis", "inserted", "deleted"];

const join = (head, rest) => {
  const tokens = [];
  for (const t of head) push(tokens, t.text, t.type);
  for (const t of rest.tokens) push(tokens, t.text, t.type);
  return { tokens, state: rest.state };
};

/** For config-like files: colour the key (or [section]) at the start of the line, then scan the rest normally. */
function keyedLine(id, line, state) {
  if (state) return scanCode(id, line, state);
  const m = /^(\s*)(?:(\[[^\]\n]*\])|((?:-\s+)*)((?:"[^"\n]*"|'[^'\n]*'|[^\s=:#;[\]"'-][^=:#;]*?))(\s*)([=:]))/.exec(line);
  if (!m) return scanCode(id, line, state);
  if (m[2] !== undefined) return join([{ text: m[1], type: "" }, { text: m[2], type: "tag" }], scanCode(id, line.slice(m[1].length + m[2].length), ""));
  // YAML and TOML allow ":" only when followed by a space (so URLs in values stay whole); INI allows "=" or ":"
  const sep = m[6];
  const after = line[m[0].length] ?? "";
  if (id === "yaml" && (sep !== ":" || (after !== "" && after !== " "))) return scanCode(id, line, state);
  if (id === "toml" && sep !== "=") return scanCode(id, line, state);
  if (m[4].length > 80) return scanCode(id, line, state);
  return join([{ text: m[1] + m[3], type: "" }, { text: m[4], type: "property" }, { text: m[5] + sep, type: "" }], scanCode(id, line.slice(m[0].length), ""));
}

function dockerLine(line, state) {
  const m = /^(\s*)([A-Za-z]+)(?=\s|$)/.exec(line);
  if (!state && m && prepare("dockerfile").kwSet.has(m[2].toLowerCase())) {
    return join([{ text: m[1], type: "" }, { text: m[2], type: "keyword" }], scanCode("dockerfile", line.slice(m[0].length), ""));
  }
  return scanCode("dockerfile", line, state);
}

function makeLine(line, state) {
  if (state || line.startsWith("\t") || /^\s*#/.test(line)) return scanCode("makefile", line, state);
  const colon = line.indexOf(":");
  const equals = line.indexOf("=");
  const assign = /^[\w.-]+\s*(?:[:?+]|::)?=/.exec(line);
  if (assign) {
    const key = /^[\w.-]+/.exec(line)[0];
    return join([{ text: key, type: "property" }], scanCode("makefile", line.slice(key.length), ""));
  }
  if (colon > 0 && (equals < 0 || colon < equals) && line[colon + 1] !== "=" && !/^\s*(ifn?eq|ifn?def|else|endif|include|define|endef|export)\b/.test(line)) {
    return join([{ text: line.slice(0, colon), type: "function" }], scanCode("makefile", line.slice(colon), ""));
  }
  return scanCode("makefile", line, state);
}

/**
 * Colours one line of `lang` (a language id from codeLang.js). `state` is what the previous line returned ("" at the top).
 * @returns {{ tokens: Array<{ text: string, type: string }>, state: string }}
 */
export function tokenizeLine(lang, line, state = "") {
  if (line.length > MAX_COLOURED_LINE) return { tokens: [{ text: line, type: "" }], state };
  switch (lang) {
    case "plain": return { tokens: line ? [{ text: line, type: "" }] : [], state: "" };
    case "html":
    case "xml": return scanMarkup(line, state, tokenizeLine);
    case "css": return scanCss(line, state);
    case "markdown": return scanMarkdown(line, state);
    case "diff": return scanDiff(line);
    case "yaml":
    case "toml":
    case "ini": return keyedLine(lang, line, state);
    case "dockerfile": return dockerLine(line, state);
    case "makefile": return makeLine(line, state);
    default: return scanCode(lang, line, state);
  }
}

/** All the lines of a text, coloured. Handy for previews and tests. */
export function tokenizeText(lang, text) {
  let state = "";
  return text.split("\n").map((line) => {
    const r = tokenizeLine(lang, line, state);
    state = r.state;
    return r.tokens;
  });
}

/**
 * A highlighter for one document. Give it the lines with setLines() after every change and ask for the lines
 * on screen with line(i); colours are worked out only when asked for and kept until the line changes.
 */
export function createHighlighter(lang = "plain") {
  let language = lang;
  let lines = [];
  let enabled = true;
  /** states[i] = the scanner state at the start of line i (undefined = not known yet). */
  let states = [""];
  let cache = [];

  const reset = () => {
    states = [""];
    cache = [];
  };

  function compute(i) {
    if (!enabled) return [];
    let from = i;
    while (from > 0 && states[from] === undefined) from--;
    for (let k = from; k <= i; k++) {
      const r = tokenizeLine(language, lines[k] ?? "", states[k]);
      cache[k] = r.tokens;
      states[k + 1] = r.state;
    }
    return cache[i];
  }

  return {
    setLanguage(id) {
      if (id !== language) {
        language = id;
        reset();
      }
    },
    setEnabled(on) {
      if (enabled !== on) {
        enabled = on;
        reset();
      }
    },
    /** Replaces the lines, scanning again only from the first line that differs, and only as far as its state travels. */
    setLines(next) {
      const old = lines;
      lines = next;
      let a = 0;
      const max = Math.min(old.length, next.length);
      while (a < max && old[a] === next[a]) a++;
      let b = 0;
      while (b < max - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
      if (a === old.length && a === next.length) return;
      const oldEnd = old.length - b; // exclusive end of the changed block in the old lines
      const newEnd = next.length - b;
      const tailStates = states.slice(oldEnd, old.length + 1);
      const tailCache = cache.slice(oldEnd, old.length);
      states = states.slice(0, a + 1);
      cache = cache.slice(0, a);
      // a big change is scanned lazily, when the lines are asked for
      if (!enabled || states[a] === undefined || newEnd - a > 2000) return;
      // rescan the changed block, then see whether the lines after it can keep their colours
      let state = states[a];
      for (let k = a; k < newEnd; k++) {
        const r = tokenizeLine(language, lines[k], state);
        cache[k] = r.tokens;
        state = r.state;
        states[k + 1] = state;
      }
      if (b > 0 && tailStates[0] === state) {
        for (let k = 0; k < b; k++) {
          cache[newEnd + k] = tailCache[k];
          states[newEnd + k] = tailStates[k];
        }
        states[newEnd + b] = tailStates[b];
      }
    },
    /** The coloured pieces of line `i` (0-based). */
    line(i) {
      return cache[i] ?? compute(i);
    },
  };
}
