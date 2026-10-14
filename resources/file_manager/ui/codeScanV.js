// The V-language parts of the code scanner: nested block comments, strings with $name / ${expression} interpolation
// (expressions may contain strings of their own), prefixed strings (r'..', c'..', js'..'), attributes and the
// compile-time $if / $for words. Everything reads each character once, so the time is proportional to the line length.

const isIdentStart = (c) => c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c > "\u007f");
const isIdentPart = (c) => isIdentStart(c) || (c !== undefined && c >= "0" && c <= "9");

/** Scans a possibly nested /* ... *\/ comment from `from`, with `depth` comments already open. */
export function nestedComment(line, from, depth, block) {
  const [open, close] = block;
  let i = from;
  let d = depth;
  while (i < line.length && d > 0) {
    if (line.startsWith(open, i)) { d++; i += open.length; } else if (line.startsWith(close, i)) { d--; i += close.length; } else i++;
  }
  return { end: i, depth: d };
}

/** Index just after the "}" that closes an interpolation `${ ... }` whose body starts at `i`. */
function skipExpr(line, i, depth) {
  let d = 1;
  while (i < line.length) {
    const c = line[i];
    if (c === "{") d++;
    else if (c === "}") {
      d--;
      if (d === 0) return i + 1;
    } else if ((c === "'" || c === '"') && depth < 6) {
      i = skipString(line, i, depth + 1);
      continue;
    } else if (c === "`") {
      const end = line.indexOf("`", i + 1);
      i = end < 0 ? line.length : end + 1;
      continue;
    }
    i++;
  }
  return line.length;
}

function skipString(line, i, depth) {
  const q = line[i];
  i++;
  while (i < line.length) {
    const c = line[i];
    if (c === "\\") { i += 2; continue; }
    if (c === q) return i + 1;
    if (c === "$" && line[i + 1] === "{") { i = skipExpr(line, i + 2, depth); continue; }
    i++;
  }
  return line.length;
}

/** What starts at `i` if it is the beginning of a V string: { quoteAt, quote, raw } or null. Prefixes: r'..' and c'..' are raw, js'..' is not. */
export function vStringStart(line, i) {
  const c = line[i];
  if (c === "'" || c === '"') return { quoteAt: i, quote: c, raw: false };
  if ((c === "r" || c === "c") && (line[i + 1] === "'" || line[i + 1] === '"')) return { quoteAt: i + 1, quote: line[i + 1], raw: true };
  if (c === "j" && line[i + 1] === "s" && (line[i + 2] === "'" || line[i + 2] === '"')) return { quoteAt: i + 2, quote: line[i + 2], raw: false };
  return null;
}

/**
 * Scans the body of a string (after its opening quote, or from the start of a continuation line) and adds string and
 * interpolation tokens to `out` through `push`. Returns { i, closed }.
 */
export function vBody(out, push, line, i, quote, raw) {
  const n = line.length;
  let segStart = i;
  const flush = (to) => push(out, line.slice(segStart, to), "string");
  while (i < n) {
    const c = line[i];
    if (c === "\\" && !raw) { i += 2; continue; }
    if (c === quote) {
      flush(i + 1);
      return { i: i + 1, closed: true };
    }
    if (c === "$" && !raw) {
      let end = -1;
      if (line[i + 1] === "{") end = skipExpr(line, i + 2, 0);
      else if (isIdentStart(line[i + 1])) {
        end = i + 1;
        while (end < n && isIdentPart(line[end])) end++;
        while (line[end] === "." && isIdentStart(line[end + 1])) {
          end++;
          while (end < n && isIdentPart(line[end])) end++;
        }
      }
      if (end > 0) {
        flush(i);
        push(out, line.slice(i, end), "variable");
        i = end;
        segStart = i;
        continue;
      }
    }
    i++;
  }
  flush(n);
  return { i: n, closed: false };
}

const LEGACY_ATTRIBUTE = /^\s*\[[A-Za-z_][\w:; '"-]*\]\s*$/;
export const isLegacyAttribute = (line) => LEGACY_ATTRIBUTE.test(line);

/** `@[inline; deprecated: 'x']` starting at i: the index after the closing bracket (end of line when there is none). */
export function attributeEnd(line, i) {
  const end = line.indexOf("]", i);
  return end < 0 ? line.length : end + 1;
}

/** `?T`, `!T`, `?[]T`: the end of such an option / result type starting at i, or -1 when this is not one. */
export function optionTypeEnd(line, i) {
  let j = i + 1;
  while (line[j] === "[" && line[j + 1] === "]") j += 2;
  while (line[j] === "&") j++;
  if (!isIdentStart(line[j])) return -1;
  while (j < line.length && (isIdentPart(line[j]) || (line[j] === "." && isIdentStart(line[j + 1])))) j++;
  return j;
}
