/**
 * The built-in line counter ("tokei-like"): splits a text into code, comment and blank lines for a language from
 * fmDevLangs. A line that holds any code counts as code, even when it also has a comment; a line that only has a
 * comment (or sits inside a block comment) is a comment line; a line with only white space is blank.
 * Strings are understood, so a `//` inside "http://..." does not start a comment, and block comments can nest for
 * the languages that allow it (Rust, Haskell, V, Kotlin ...).
 */
import { languageByName, type LangDef } from "./fmDevLangs";

export interface Counts {
  code: number;
  comments: number;
  blanks: number;
  /** Lines of other languages embedded in this one (JavaScript in HTML ...), by language name. */
  children?: Record<string, Counts>;
}

interface Tok {
  kind: "line" | "block" | "quote";
  open: string;
  close: string;
  nested: boolean;
  doc: boolean;
  multiline: boolean;
  verbatim: boolean;
  lineStart: boolean;
}

interface Compiled {
  tokens: Tok[];
  starts: Set<string>;
  charLit: boolean;
  hashBoundary: boolean;
  literate: boolean;
}

const cache = new WeakMap<LangDef, Compiled>();

function compile(lang: LangDef): Compiled {
  const hit = cache.get(lang);
  if (hit) return hit;
  const tokens: Tok[] = [];
  const base = { nested: false, doc: false, multiline: false, verbatim: false, lineStart: false };
  for (const open of lang.line ?? []) tokens.push({ ...base, kind: "line", open, close: "" });
  for (const open of lang.docLine ?? []) tokens.push({ ...base, kind: "line", open, close: "", doc: true });
  for (const [open, close] of lang.block ?? []) tokens.push({ ...base, kind: "block", open, close, nested: !!lang.nested });
  for (const [open, close] of lang.docBlock ?? []) tokens.push({ ...base, kind: "block", open, close, nested: !!lang.nested, doc: true });
  for (const [open, close] of lang.lineStart ?? []) tokens.push({ ...base, kind: "block", open, close, lineStart: true });
  for (const q of lang.quotes ?? []) tokens.push({ ...base, kind: "quote", open: q.open, close: q.close, multiline: !!q.multiline, verbatim: !!q.verbatim, doc: !!q.doc });
  // The longest opener wins (`"""` before `"`, `///` before `//`).
  tokens.sort((a, b) => b.open.length - a.open.length);
  const starts = new Set(tokens.map((t) => t.open[0]!));
  if (lang.charLit) starts.add("'");
  const out = { tokens, starts, charLit: !!lang.charLit, hashBoundary: !!lang.hashBoundary, literate: !!lang.literate };
  cache.set(lang, out);
  return out;
}

/** Where a `'x'` or `'\n'` character literal ends (the index after it), or -1 when this quote is not one (a Rust lifetime, say). */
function charLiteralEnd(raw: string, i: number): number {
  if (raw[i + 1] === "\\") {
    const end = raw.indexOf("'", i + 3);
    return end >= 0 && end - i <= 12 ? end + 1 : -1;
  }
  return raw[i + 2] === "'" && raw[i + 1] !== "'" ? i + 3 : -1;
}

function matchToken(c: Compiled, raw: string, i: number): Tok | null {
  for (const t of c.tokens) {
    if (!raw.startsWith(t.open, i)) continue;
    if (t.lineStart && i !== 0) continue;
    if (t.doc && t.kind !== "quote") {
      // `////`, `/***` and `/**/` are ordinary comments, not documentation.
      const next = raw[i + t.open.length];
      if (next === t.open[t.open.length - 1] || (t.kind === "block" && next === "/")) continue;
    }
    return t;
  }
  return null;
}

/**
 * Counts the lines of `text`. `docAsComment` (default on): documentation comments and docstrings count as comments;
 * off, they count as code.
 */
export function countPlain(text: string, lang: LangDef, docAsComment = true): Counts {
  const c = compile(lang);
  const lines = text.split("\n");
  let total = lines.length;
  if (total > 0 && lines[total - 1] === "") total--;
  let code = 0;
  let comments = 0;
  let blanks = 0;
  if (c.literate) {
    for (let k = 0; k < total; k++) {
      if (lines[k]!.trim()) comments++;
      else blanks++;
    }
    return { code, comments, blanks };
  }
  const stack: Tok[] = [];
  let str: { tok: Tok; asComment: boolean } | null = null;
  for (let k = 0; k < total; k++) {
    const raw = lines[k]!;
    if (!raw.trim()) {
      // Like tokei: a blank line inside a block comment is a comment line, inside a multi-line string it is code.
      if (stack.length) {
        if (stack[stack.length - 1]!.doc && !docAsComment) code++;
        else comments++;
      } else if (str) {
        if (str.asComment) comments++;
        else code++;
      } else blanks++;
      continue;
    }
    let hasCode = false;
    let hasComment = false;
    let i = 0;
    const n = raw.length;
    while (i < n) {
      if (str) {
        const t = str.tok;
        let j = i;
        let closed = false;
        while (j < n) {
          if (!t.verbatim && raw[j] === "\\") {
            j += 2;
            continue;
          }
          if (raw.startsWith(t.close, j)) {
            j += t.close.length;
            closed = true;
            break;
          }
          j++;
        }
        if (str.asComment) hasComment = true;
        else hasCode = true;
        if (closed || !t.multiline) str = null;
        i = Math.min(j, n);
        continue;
      }
      if (stack.length) {
        const top = stack[stack.length - 1]!;
        if (top.doc && !docAsComment) hasCode = true;
        else hasComment = true;
        let j = i;
        while (j < n) {
          if (raw.startsWith(top.close, j)) {
            j += top.close.length;
            stack.pop();
            break;
          }
          if (top.nested && raw.startsWith(top.open, j)) {
            stack.push(top);
            j += top.open.length;
            continue;
          }
          j++;
        }
        i = j;
        continue;
      }
      const ch = raw[i]!;
      if (ch === " " || ch === "\t" || ch === "\r") {
        i++;
        continue;
      }
      if (!c.starts.has(ch)) {
        hasCode = true;
        i++;
        continue;
      }
      if (c.charLit && ch === "'") {
        const end = charLiteralEnd(raw, i);
        hasCode = true;
        i = end > 0 ? end : i + 1;
        continue;
      }
      const tok = matchToken(c, raw, i);
      if (!tok) {
        hasCode = true;
        i++;
        continue;
      }
      if (tok.kind === "line") {
        if (c.hashBoundary && tok.open === "#" && i > 0 && !/[\s;&|(]/.test(raw[i - 1]!)) {
          hasCode = true;
          i++;
          continue;
        }
        if (tok.doc && !docAsComment) hasCode = true;
        else hasComment = true;
        break;
      }
      if (tok.kind === "block") {
        stack.push(tok);
        if (tok.doc && !docAsComment) hasCode = true;
        else hasComment = true;
        i += tok.open.length;
        continue;
      }
      const asComment = tok.doc && docAsComment && !hasCode;
      str = { tok, asComment };
      if (asComment) hasComment = true;
      else hasCode = true;
      i += tok.open.length;
    }
    if (hasCode || !hasComment) code++;
    else comments++;
  }
  return { code, comments, blanks };
}

const lowerNames = new Map<string, LangDef>();
function langByTag(tag: string): LangDef | null {
  if (!lowerNames.size) for (const name of ["JSON", "JavaScript", "TypeScript", "Python", "Rust", "BASH", "Shell", "HTML", "CSS", "YAML", "Go", "C", "C++", "Java", "Kotlin", "Swift", "Ruby", "PHP", "Lua", "Perl", "SQL", "TOML", "XML", "Zig", "Dart", "Haskell", "Julia", "Elixir", "Erlang", "Scala", "Makefile", "Dockerfile", "TSX", "JSX", "Sass", "LESS", "V", "Nim", "Zsh", "Fish", "PowerShell", "Batch", "R", "INI", "GraphQL", "Markdown", "OCaml", "Clojure", "Lisp"]) {
    const def = languageByName(name);
    if (def) lowerNames.set(name.toLowerCase(), def);
  }
  return lowerNames.get(tag.toLowerCase()) ?? null;
}

const add = (into: Counts, c: Counts) => {
  into.code += c.code;
  into.comments += c.comments;
  into.blanks += c.blanks;
};

function addChild(children: Record<string, Counts>, lang: LangDef, lines: string[], docAsComment: boolean): void {
  if (!lines.length) return;
  const c = countPlain(`${lines.join("\n")}\n`, lang, docAsComment);
  add((children[lang.name] ??= { code: 0, comments: 0, blanks: 0 }), c);
}

/** The language of the code inside a `<script ...>` or `<style ...>` tag, or null when it isn't code (a template, say). */
function embeddedLanguage(tag: string, attrs: string): LangDef | null {
  const lang = /\blang\s*=\s*["']?([\w-]+)/i.exec(attrs)?.[1]?.toLowerCase();
  const type = /\btype\s*=\s*["']?([\w/+.-]+)/i.exec(attrs)?.[1]?.toLowerCase() ?? "";
  if (tag === "style") return languageByName(lang === "scss" || lang === "sass" ? "Sass" : lang === "less" ? "LESS" : lang === "stylus" ? "Stylus" : "CSS") ?? null;
  if (/json|importmap/.test(type)) return languageByName("JSON") ?? null;
  if (type && !/javascript|ecmascript|module|typescript/.test(type)) return null;
  return languageByName(lang === "ts" || lang === "typescript" || type.includes("typescript") ? "TypeScript" : lang === "tsx" ? "TSX" : lang === "jsx" ? "JSX" : "JavaScript") ?? null;
}

/** Splits off the embedded code: returns the lines that stay with the host language and the lines of each embedded block. */
function splitEmbedded(lines: string[], mode: "html" | "markdown"): { own: string[]; blocks: Array<{ lang: LangDef; lines: string[] }> } {
  const own: string[] = [];
  const blocks: Array<{ lang: LangDef; lines: string[] }> = [];
  let current: { lang: LangDef; lines: string[]; close: RegExp } | null = null;
  let inComment = false;
  for (const line of lines) {
    if (current) {
      if (current.close.test(line)) {
        blocks.push({ lang: current.lang, lines: current.lines });
        current = null;
        own.push(line);
      } else current.lines.push(line);
      continue;
    }
    if (mode === "markdown") {
      const fence = /^\s{0,3}(`{3,}|~{3,})\s*([\w#+.-]*)/.exec(line);
      const child = fence ? langByTag(fence[2]!) : null;
      own.push(line);
      if (fence && child) {
        const marker = fence[1]!;
        current = { lang: child, lines: [], close: new RegExp(`^\\s{0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`) };
      }
      continue;
    }
    const open = !inComment ? /<(script|style)\b([^>]*)>/i.exec(line) : null;
    if (open && !line.slice(0, open.index).includes("<!--") && !new RegExp(`</${open[1]}`, "i").test(line.slice(open.index + open[0].length))) {
      const lang = embeddedLanguage(open[1]!.toLowerCase(), open[2]!);
      if (lang) current = { lang, lines: [], close: new RegExp(`</${open[1]}\\s*>`, "i") };
    }
    own.push(line);
    const lastOpen = line.lastIndexOf("<!--");
    const lastClose = line.lastIndexOf("-->");
    if (lastOpen > lastClose) inComment = true;
    else if (lastClose > lastOpen) inComment = false;
  }
  // A block that never closes belongs to the host.
  if (current) own.push(...current.lines);
  return { own, blocks };
}

/**
 * Counts the lines of `text` as `lang`. Markup and Markdown files also report the code embedded in them
 * (`children`), the way tokei does; their own numbers cover only the host language. `docAsComment` (default on):
 * documentation comments and docstrings count as comments; off, they count as code.
 */
export function countText(text: string, lang: LangDef, docAsComment = true): Counts {
  if (!lang.embeds) return countPlain(text, lang, docAsComment);
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const { own, blocks } = splitEmbedded(lines, lang.embeds);
  const result = countPlain(own.length ? `${own.join("\n")}\n` : "", lang, docAsComment);
  if (blocks.length) {
    const children: Record<string, Counts> = {};
    for (const b of blocks) addChild(children, b.lang, b.lines, docAsComment);
    result.children = children;
  }
  return result;
}
