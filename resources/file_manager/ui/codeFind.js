// Find and replace for the editor (and the regex sandbox). Patterns typed by a person can be wrong or can take
// forever to match ("catastrophic backtracking"), so every pattern is checked first and every search has a count
// limit and a time limit. Nothing here ever throws: problems come back as plain-language `error` text.
import { buildLineStarts, lineAt } from "./codeLines.js";

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BROAD = /^(\.|\[|\\[wWsSdD])/;

/** Describes a quantifier at `src[i]`: its length and whether it can repeat without limit. */
function quantifierAt(src, i) {
  const c = src[i];
  if (c === "*" || c === "+") return { len: 1, unbounded: true };
  if (c === "?") return { len: 1, unbounded: false };
  if (c === "{") {
    const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i, i + 24));
    if (m) return { len: m[0].length, unbounded: m[2] !== undefined && m[3] === "" };
  }
  return null;
}

/**
 * Looks for the pattern shapes that can make a regular expression run for minutes: a repeated group that holds
 * another repetition, like (a+)+ or (\w+\s?)*, and a repeated choice whose branches can start the same way, like
 * (a|a)* or (x|.)+. Returns a plain-language reason, or "" when the pattern looks safe.
 */
export function regexRisk(src) {
  const stack = [];
  const top = () => stack[stack.length - 1];
  const startAlt = (g) => g.keys.push(null);
  const note = (key) => {
    const g = top();
    if (g && g.keys[g.keys.length - 1] === null) g.keys[g.keys.length - 1] = key;
  };
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === "\\") {
      note(src.slice(i, i + 2));
      i += 2;
    } else if (c === "[") {
      let j = i + 1;
      if (src[j] === "^") j++;
      if (src[j] === "]") j++;
      while (j < src.length && src[j] !== "]") j += src[j] === "\\" ? 2 : 1;
      note("[");
      i = j + 1;
    } else if (c === "(") {
      const g = { hasUnbounded: false, keys: [] };
      startAlt(g);
      stack.push(g);
      i++;
      if (src[i] === "?") {
        const m = /^\?(?:<[=!]|[:=!]|<[A-Za-z_]\w*>)/.exec(src.slice(i, i + 40));
        i += m ? m[0].length : 1;
      }
    } else if (c === ")") {
      const g = stack.pop();
      i++;
      if (!g) continue;
      const q = quantifierAt(src, i);
      if (q?.unbounded) {
        if (g.hasUnbounded) return "That pattern repeats a part that already repeats (like (a+)+), which can make it run for a very long time. Try a simpler pattern.";
        if (g.keys.length > 1 && (g.keys.some((k) => k === null || BROAD.test(k)) || new Set(g.keys).size < g.keys.length)) {
          return "That pattern repeats a choice whose options can start the same way (like (a|a)*), which can make it run for a very long time. Try a simpler pattern.";
        }
      }
      const parent = top();
      if (parent && (g.hasUnbounded || q?.unbounded)) parent.hasUnbounded = true;
      note("(");
    } else if (c === "|") {
      const g = top();
      if (g) startAlt(g);
      i++;
    } else if (c === "*" || c === "+" || c === "{") {
      const q = quantifierAt(src, i);
      if (q) {
        if (q.unbounded && top()) top().hasUnbounded = true;
        i += q.len;
      } else {
        note(c);
        i++;
      }
    } else {
      note(c === "." ? "." : c);
      i++;
    }
  }
  return "";
}

/**
 * Builds the regular expression for a search. Returns { re } (global, always a new object), { empty: true }
 * when there is nothing to look for, or { error } in plain words.
 */
export function compileSearch({ query = "", regex = false, caseSensitive = false, wholeWord = false } = {}) {
  if (!query) return { empty: true };
  if (query.length > 1000) return { error: "That search is too long." };
  if (regex) {
    const risk = regexRisk(query);
    if (risk) return { error: risk };
  }
  let source = regex ? query : escapeRegExp(query);
  if (wholeWord) source = `(?<![\\w$])(?:${source})(?![\\w$])`;
  try {
    return { re: new RegExp(source, `g${caseSensitive ? "" : "i"}${regex ? "m" : ""}`) };
  } catch (err) {
    return { error: `That pattern isn't valid: ${String(err?.message ?? err).replace(/^Invalid regular expression:?\s*/i, "").slice(0, 120)}` };
  }
}

const MAX_MATCHES = 20_000;

/**
 * Every match in `text`: [{ index, length, text, groups, named }]. Stops at `limit` matches or `budgetMs`
 * and says so (`truncated`, `timedOut`). Empty matches are skipped unless `allowEmpty`.
 */
export function findAll(text, search, { limit = MAX_MATCHES, budgetMs = 1500, allowEmpty = false } = {}) {
  const compiled = compileSearch(search);
  if (compiled.error || compiled.empty) return { matches: [], error: compiled.error ?? "", truncated: false, timedOut: false };
  const { re } = compiled;
  const matches = [];
  const started = Date.now();
  let truncated = false;
  let timedOut = false;
  for (let m = re.exec(text), n = 0; m !== null; m = re.exec(text), n++) {
    if (m[0] === "") {
      re.lastIndex++;
      if (!allowEmpty) continue;
    }
    matches.push({ index: m.index, length: m[0].length, text: m[0], groups: m.slice(1), named: m.groups ?? null });
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    if ((n & 255) === 255 && Date.now() - started > budgetMs) {
      timedOut = true;
      break;
    }
    if (re.lastIndex > text.length) break;
  }
  return { matches, error: "", truncated, timedOut };
}

/** The first match at or after `from` (wrapping to the top when `wrap`), or null. */
export function nextMatch(text, from, search, wrap = true) {
  const compiled = compileSearch(search);
  if (!compiled.re) return null;
  const { re } = compiled;
  for (const start of wrap && from > 0 ? [from, 0] : [from]) {
    re.lastIndex = Math.min(start, text.length);
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[0] !== "") return { index: m.index, length: m[0].length };
      re.lastIndex++;
      if (re.lastIndex > text.length) break;
    }
  }
  return null;
}

/** The last match that starts before `before` (wrapping to the bottom when `wrap`), or null. */
export function previousMatch(text, before, search, wrap = true) {
  const { matches } = findAll(text, search, { limit: MAX_MATCHES });
  let found = null;
  for (const m of matches) if (m.index < before) found = m;
  if (!found && wrap) found = matches[matches.length - 1] ?? null;
  return found ? { index: found.index, length: found.length } : null;
}

/** Fills in a replacement: $1..$99, $<name>, $& and $$ — only when the search is a regular expression; \n and \t too. */
export function expandReplacement(template, match, regex) {
  if (!regex) return template;
  const groups = match.slice(1);
  let out = "";
  for (let i = 0; i < template.length; i++) {
    const c = template[i];
    if (c === "\\" && i + 1 < template.length) {
      const n = template[i + 1];
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "\\") out += "\\";
      else out += c + n;
      i++;
    } else if (c === "$" && i + 1 < template.length) {
      const n = template[i + 1];
      if (n === "$") { out += "$"; i++; }
      else if (n === "&") { out += match[0]; i++; }
      else if (n === "<") {
        const end = template.indexOf(">", i + 2);
        const name = end > 0 ? template.slice(i + 2, end) : "";
        if (end > 0 && match.groups && name in match.groups) { out += match.groups[name] ?? ""; i = end; } else out += c;
      } else if (n >= "0" && n <= "9") {
        const two = /^\d\d/.exec(template.slice(i + 1, i + 3));
        const k = two && Number(two[0]) <= groups.length && Number(two[0]) > 0 ? two[0] : n;
        if (Number(k) >= 1 && Number(k) <= groups.length) { out += groups[Number(k) - 1] ?? ""; i += k.length; } else out += c;
      } else out += c;
    } else out += c;
  }
  return out;
}

/** The text that replaces the match found at `index` (null when there is no match there any more). */
export function replacementAt(text, index, search, replacement) {
  const compiled = compileSearch(search);
  if (!compiled.re) return null;
  compiled.re.lastIndex = index;
  const m = compiled.re.exec(text);
  if (!m || m.index !== index) return null;
  return { length: m[0].length, insert: expandReplacement(replacement, m, search.regex === true) };
}

/** Replaces every match. { text, count } or { error }. Stops after 100,000 replacements or 3 seconds. */
export function replaceAll(text, search, replacement) {
  const compiled = compileSearch(search);
  if (compiled.error) return { text, count: 0, error: compiled.error };
  if (compiled.empty) return { text, count: 0, error: "" };
  const { re } = compiled;
  const parts = [];
  let last = 0;
  let count = 0;
  const started = Date.now();
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m[0] === "") {
      re.lastIndex++;
      if (re.lastIndex > text.length + 1) break;
      continue;
    }
    parts.push(text.slice(last, m.index), expandReplacement(replacement, m, search.regex === true));
    last = m.index + m[0].length;
    count++;
    if (count >= 100_000 || ((count & 255) === 0 && Date.now() - started > 3000)) return { text, count: 0, error: "There are too many matches to replace in one go. Try a more specific search." };
  }
  if (!count) return { text, count: 0, error: "" };
  parts.push(text.slice(last));
  return { text: parts.join(""), count, error: "" };
}

/** For the regex sandbox: runs `pattern` with `flags` over `text` and lists each match with its position and groups. */
export function runRegexSandbox(pattern, flags, text) {
  if (!pattern) return { matches: [], error: "", truncated: false, timedOut: false };
  const given = String(flags).split("");
  const clean = [...new Set(given)].filter((f) => "dgimsuvy".includes(f)).join("");
  if (clean.length !== given.length) return { matches: [], error: "The flags can only use the letters d g i m s u v y, each once.", truncated: false, timedOut: false };
  const risk = regexRisk(pattern);
  if (risk) return { matches: [], error: risk, truncated: false, timedOut: false };
  let re;
  try {
    re = new RegExp(pattern, clean.includes("g") || clean.includes("y") ? clean : `${clean}g`);
  } catch (err) {
    return { matches: [], error: `That pattern isn't valid: ${String(err?.message ?? err).replace(/^Invalid regular expression:?\s*/i, "").slice(0, 120)}`, truncated: false, timedOut: false };
  }
  const starts = buildLineStarts(text);
  const matches = [];
  const started = Date.now();
  let truncated = false;
  let timedOut = false;
  for (let m = re.exec(text), n = 0; m !== null; m = re.exec(text), n++) {
    const line = lineAt(starts, m.index);
    matches.push({ index: m.index, text: m[0], line: line + 1, col: m.index - starts[line] + 1, groups: m.slice(1), named: m.groups ?? null });
    if (m[0] === "") re.lastIndex++;
    if (matches.length >= 500) { truncated = true; break; }
    if ((n & 63) === 63 && Date.now() - started > 1000) { timedOut = true; break; }
    if (!re.global) break;
  }
  return { matches, error: "", truncated, timedOut };
}

/**
 * How well `query` matches `text` as a "fuzzy" search (letters in order, not necessarily together), or -1 when it doesn't.
 * Higher is better: matches that start words or follow each other, and shorter texts, score more. Linear time.
 */
export function fuzzyScore(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  let at = 0;
  let streak = 0;
  for (let i = 0; i < q.length; i++) {
    const found = t.indexOf(q[i], at);
    if (found < 0) return -1;
    const startsWord = found === 0 || "/\\-_. ".includes(t[found - 1]);
    streak = found === at && i > 0 ? streak + 1 : 0;
    score += 1 + streak * 2 + (startsWord ? 4 : 0) - Math.min(3, (found - at) * 0.1);
    at = found + 1;
  }
  const base = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\")) + 1;
  if (t.slice(base).startsWith(q)) score += 8;
  return score - t.length * 0.02;
}
