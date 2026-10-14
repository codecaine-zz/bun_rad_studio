// A simple HTML/XML tidier: each block element goes on its own line, indented by depth; paragraphs of text and
// inline tags (a, b, span ...) stay together on one line. Scripts and styles are formatted with the helpers given.
// It never changes attribute text, and <pre> and <textarea> are left exactly as written.

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "big", "cite", "code", "data", "del", "dfn", "em", "font", "i", "img", "input", "ins", "kbd", "label", "mark", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "tt", "u", "var", "br", "wbr", "button", "select"]);
const RAW = new Set(["script", "style", "pre", "textarea"]);
const MAX_DEPTH = 300;

/** Splits markup into nodes: { t: "text"|"comment"|"decl"|"open"|"close"|"raw", ... }. */
function lex(text) {
  const nodes = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    if (text[i] !== "<") {
      const end = text.indexOf("<", i);
      nodes.push({ t: "text", raw: text.slice(i, end < 0 ? n : end) });
      i = end < 0 ? n : end;
    } else if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      nodes.push({ t: "comment", raw: text.slice(i, end < 0 ? n : end + 3) });
      i = end < 0 ? n : end + 3;
    } else if (text[i + 1] === "!" || text[i + 1] === "?") {
      const end = text.indexOf(">", i);
      nodes.push({ t: "decl", raw: text.slice(i, end < 0 ? n : end + 1) });
      i = end < 0 ? n : end + 1;
    } else if (/[A-Za-z/]/.test(text[i + 1] ?? "")) {
      let j = i + 1;
      let quote = "";
      for (; j < n; j++) {
        const c = text[j];
        if (quote) { if (c === quote) quote = ""; } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      const raw = text.slice(i, Math.min(n, j + 1));
      const closing = raw[1] === "/";
      const name = /^<\/?([\w:.-]+)/.exec(raw)?.[1]?.toLowerCase() ?? "";
      i = Math.min(n, j + 1);
      if (closing) nodes.push({ t: "close", raw: raw.replace(/\s+/g, " "), name });
      else {
        const selfClosing = raw.endsWith("/>") || VOID.has(name);
        nodes.push({ t: "open", raw: raw.replace(/\s*\n\s*/g, " "), name, selfClosing, children: [] });
        if (!selfClosing && RAW.has(name)) {
          const close = text.toLowerCase().indexOf(`</${name}`, i);
          const end = close < 0 ? n : close;
          nodes.push({ t: "raw", raw: text.slice(i, end), name });
          i = end;
        }
      }
    } else {
      nodes.push({ t: "text", raw: "<" });
      i++;
    }
  }
  return nodes;
}

/** Builds a tree. Closing tags without a matching opening tag are kept as plain nodes; unclosed tags close at the end. */
function build(nodes) {
  const root = { t: "root", children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  for (const node of nodes) {
    if (node.t === "open") {
      top().children.push(node);
      if (!node.selfClosing) stack.push(node);
    } else if (node.t === "close") {
      let k = stack.length - 1;
      while (k > 0 && stack[k].name !== node.name) k--;
      if (k > 0) { stack[k].closeRaw = node.raw; stack.length = k; } else top().children.push({ t: "stray", raw: node.raw });
    } else top().children.push(node);
  }
  return root;
}

const squash = (s) => s.replace(/\s+/g, " ");

const isInlineNode = (node) => node.t === "text" || node.t === "stray" || (node.t === "open" && INLINE.has(node.name) && !RAW.has(node.name) && node.children.every(isInlineNode));

function inlineText(node) {
  if (node.t === "text") return squash(node.raw);
  if (node.t === "stray") return node.raw;
  if (node.t === "raw") return node.raw;
  const inner = node.children.map(inlineText).join("");
  return node.selfClosing ? node.raw : `${node.raw}${inner}${node.closeRaw ?? ""}`;
}

/**
 * Tidies HTML or XML. `formatCss(text)` and `formatJs(text)` return { text } or something else on failure.
 * @returns {{ text: string } | { error: { message: string } }}
 */
export function formatHtml(text, unit, formatCss, formatJs) {
  const root = build(lex(text));
  const lines = [];
  const pad = (depth) => unit.repeat(depth);
  let tooDeep = false;

  function emitChildren(children, depth) {
    let run = [];
    const flush = () => {
      const joined = run.map(inlineText).join("").trim();
      if (joined) lines.push(pad(depth) + joined);
      run = [];
    };
    for (const child of children) {
      if (child.t === "text" || child.t === "stray" || (child.t === "open" && isInlineNode(child))) run.push(child);
      else {
        flush();
        emit(child, depth);
      }
    }
    flush();
  }

  function emit(node, depth) {
    if (depth > MAX_DEPTH) { tooDeep = true; return; }
    if (node.t === "comment" || node.t === "decl") return void lines.push(pad(depth) + node.raw.trim());
    if (node.t === "text") { const s = squash(node.raw).trim(); if (s) lines.push(pad(depth) + s); return; }
    if (node.t === "stray") return void lines.push(pad(depth) + node.raw);
    if (node.t !== "open") return;
    if (node.selfClosing) return void lines.push(pad(depth) + node.raw);
    const [first] = node.children;
    if (first?.t === "raw") {
      if (node.name === "pre" || node.name === "textarea") return void lines.push(pad(depth) + node.raw + first.raw + (node.closeRaw ?? ""));
      const body = first.raw.trim();
      lines.push(pad(depth) + node.raw);
      if (body) {
        const result = (node.name === "style" ? formatCss : formatJs)(body);
        const tidy = typeof result?.text === "string" ? result.text.replace(/\n+$/, "") : body;
        for (const l of tidy.split("\n")) lines.push(l.trim() ? pad(depth + 1) + l : "");
      }
      lines.push(pad(depth) + (node.closeRaw ?? `</${node.name}>`));
      return;
    }
    if (node.children.every(isInlineNode)) {
      const inner = node.children.map(inlineText).join("").trim();
      const one = `${node.raw}${inner}${node.closeRaw ?? ""}`;
      if (one.length + depth * unit.length <= 110 && !inner.includes("\n")) return void lines.push(pad(depth) + one);
    }
    lines.push(pad(depth) + node.raw);
    emitChildren(node.children, depth + 1);
    if (node.closeRaw) lines.push(pad(depth) + node.closeRaw);
  }

  emitChildren(root.children, 0);
  if (tooDeep) return { error: { message: "This document is nested too deeply to tidy up." } };
  return { text: lines.join("\n") + (lines.length ? "\n" : "") };
}
