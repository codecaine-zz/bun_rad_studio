// A small Markdown reader. It turns text into a plain tree of nodes { tag, text?, attrs?, children? } (no HTML is
// ever produced or trusted); the page then builds elements from the tree. Supported: headings, paragraphs,
// emphasis, strong, strikethrough, code, fenced code, lists (nested, ordered, task), links, images (shown as their
// description), block quotes, tables and rules. Raw HTML is shown as plain text.

const MAX_CHARS = 500_000;
const MAX_INLINE = 20_000;
const MAX_DEPTH = 6;

const text = (t) => ({ tag: "#text", text: t });

/** Inline formatting inside one paragraph, heading or table cell. */
export function parseInline(src, depth = 0) {
  if (depth > MAX_DEPTH || src.length > MAX_INLINE) return [text(src)];
  const out = [];
  let buf = "";
  const flush = () => { if (buf) out.push(text(buf)); buf = ""; };
  const n = src.length;
  for (let i = 0; i < n; ) {
    const c = src[i];
    if (c === "\\" && i + 1 < n && /[\\`*_{}[\]()#+\-.!|~<>]/.test(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
    if (c === " " && src.startsWith("  \n", i)) { flush(); out.push({ tag: "br" }); i += 3; continue; }
    if (c === "\n") { buf += " "; i++; continue; }
    if (c === "`") {
      let ticks = 1;
      while (src[i + ticks] === "`") ticks++;
      const fence = "`".repeat(ticks);
      const end = src.indexOf(fence, i + ticks);
      if (end > 0) { flush(); out.push({ tag: "code", text: src.slice(i + ticks, end).replace(/^ (.*) $/, "$1") }); i = end + ticks; continue; }
      buf += fence;
      i += ticks;
      continue;
    }
    if ((c === "*" || c === "_") && src[i + 1] === c) {
      const end = src.indexOf(c + c, i + 2);
      if (end > i + 2) { flush(); out.push({ tag: "strong", children: parseInline(src.slice(i + 2, end), depth + 1) }); i = end + 2; continue; }
    } else if ((c === "*" || c === "_") && src[i + 1] !== " " && src[i + 1] !== undefined && (c === "*" || !/\w/.test(src[i - 1] ?? " "))) {
      let end = src.indexOf(c, i + 1);
      while (end > 0 && (src[end - 1] === " " || (c === "_" && /\w/.test(src[end + 1] ?? " ")))) end = src.indexOf(c, end + 1);
      if (end > i + 1) { flush(); out.push({ tag: "em", children: parseInline(src.slice(i + 1, end), depth + 1) }); i = end + 1; continue; }
    } else if (c === "~" && src[i + 1] === "~") {
      const end = src.indexOf("~~", i + 2);
      if (end > i + 2) { flush(); out.push({ tag: "del", children: parseInline(src.slice(i + 2, end), depth + 1) }); i = end + 2; continue; }
    } else if (c === "[" || (c === "!" && src[i + 1] === "[")) {
      const image = c === "!";
      const open = image ? i + 1 : i;
      const mid = src.indexOf("](", open);
      let close = mid > open ? src.indexOf(")", mid + 2) : -1;
      if (close > mid && src.slice(mid + 2, close).includes("(")) {
        let paren = 1;
        close = -1;
        for (let k = mid + 2; k < n && k < mid + 2048; k++) {
          if (src[k] === "\n") break;
          if (src[k] === "(") paren++;
          else if (src[k] === ")" && --paren === 0) { close = k; break; }
        }
      }
      if (mid > open && close > mid) {
        const label = src.slice(open + 1, mid);
        const target = src.slice(mid + 2, close).trim().replace(/\s+"[^"]*"$/, "");
        flush();
        out.push(image ? { tag: "img", alt: label, src: target } : { tag: "a", href: target, children: parseInline(label, depth + 1) });
        i = close + 1;
        continue;
      }
    } else if (c === "<") {
      const end = src.indexOf(">", i + 1);
      const inner = end > 0 ? src.slice(i + 1, end) : "";
      if (/^https?:\/\/[^\s<>]+$/.test(inner)) { flush(); out.push({ tag: "a", href: inner, children: [text(inner)] }); i = end + 1; continue; }
    } else if (depth === 0 && (c === "h" || c === "H") && (src.startsWith("https://", i) || src.startsWith("http://", i)) && (i === 0 || /[\s([{:;,]/.test(src[i - 1]))) {
      const m = /^https?:\/\/[^\s<>[\]"'`]+/i.exec(src.slice(i));
      if (m) {
        let raw = m[0];
        while (/[.,;:!?)]$/.test(raw)) {
          if (raw.endsWith(")") && (raw.match(/\(/g)?.length ?? 0) >= (raw.match(/\)/g)?.length ?? 0)) break;
          raw = raw.slice(0, -1);
        }
        if (raw.length > 8) {
          flush();
          out.push({ tag: "a", href: raw, children: [text(raw)] });
          i += raw.length;
          continue;
        }
      }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])( ?\1){2,} *$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const isBlank = (l) => l.trim() === "";

const startsBlock = (l) => FENCE.test(l) || HEADING.test(l) || RULE.test(l) || /^ {0,3}>/.test(l) || /^\s{0,3}([-*+]|1[.)])\s+\S/.test(l);

function splitRow(row) {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function parseBlocks(lines, depth) {
  const out = [];
  const n = lines.length;
  let i = 0;
  while (i < n) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    const fence = FENCE.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < n && !(lines[i].trimStart().startsWith(fence[1]) && /^[`~]+\s*$/.test(lines[i].trim()))) body.push(lines[i++]);
      i++;
      out.push({ tag: "pre", lang: fence[2], text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) { out.push({ tag: `h${heading[1].length}`, children: parseInline(heading[2]) }); i++; continue; }
    if (RULE.test(line)) { out.push({ tag: "hr" }); i++; continue; }
    if (/^ {0,3}>/.test(line) && depth < MAX_DEPTH) {
      const inner = [];
      while (i < n && !isBlank(lines[i]) && (/^ {0,3}>/.test(lines[i]) || inner.length)) inner.push(lines[i++].replace(/^ {0,3}> ?/, ""));
      out.push({ tag: "blockquote", children: parseBlocks(inner, depth + 1) });
      continue;
    }
    const item = ITEM.exec(line);
    if (item && depth < MAX_DEPTH) {
      const ordered = /\d/.test(item[2]);
      const baseIndent = item[1].length;
      const list = { tag: ordered ? "ol" : "ul", start: ordered ? Number(item[2].replace(/\D/g, "")) : undefined, children: [] };
      while (i < n) {
        const m = ITEM.exec(lines[i]);
        if (!m || m[1].length !== baseIndent || /\d/.test(m[2]) !== ordered) break;
        const width = m[1].length + m[2].length + 1;
        const body = [m[3]];
        i++;
        while (i < n) {
          const l = lines[i];
          if (isBlank(l)) {
            let k = i;
            while (k < n && isBlank(lines[k])) k++;
            if (k < n && /^\s/.test(lines[k]) && lines[k].search(/\S/) > baseIndent) { body.push(""); i++; continue; }
            break;
          }
          const sub = ITEM.exec(l);
          if (sub && sub[1].length <= baseIndent) break;
          if (lines[i].search(/\S/) <= baseIndent && startsBlock(l)) break;
          body.push(l.length >= width && /^\s*$/.test(l.slice(0, width)) ? l.slice(width) : l.trimStart());
          i++;
        }
        const task = /^\[([ xX])\]\s+/.exec(body[0]);
        if (task) body[0] = body[0].slice(task[0].length);
        let children = parseBlocks(body, depth + 1);
        if (children.length && children[0].tag === "p") children = [...children[0].children.length ? [{ tag: "#inline", children: children[0].children }] : [], ...children.slice(1)];
        list.children.push({ tag: "li", checked: task ? task[1] !== " " : undefined, children });
        while (i < n && isBlank(lines[i]) && ITEM.test(lines[i + 1] ?? "")) i++;
      }
      out.push(list);
      continue;
    }
    if (line.includes("|") && i + 1 < n && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : ""));
      i += 2;
      const rows = [];
      while (i < n && !isBlank(lines[i]) && lines[i].includes("|")) rows.push(splitRow(lines[i++]));
      const cell = (tag, c, k) => ({ tag, align: aligns[k] || "", children: parseInline(c ?? "") });
      out.push({ tag: "table", children: [{ tag: "thead", children: [{ tag: "tr", children: head.map((c, k) => cell("th", c, k)) }] }, { tag: "tbody", children: rows.map((r) => ({ tag: "tr", children: head.map((_, k) => cell("td", r[k], k)) })) }] });
      continue;
    }
    if (/^( {4}|\t)/.test(line) && !out.length || (/^( {4}|\t)/.test(line) && out[out.length - 1]?.tag !== "p")) {
      const body = [];
      while (i < n && (/^( {4}|\t)/.test(lines[i]) || (isBlank(lines[i]) && /^( {4}|\t)/.test(lines[i + 1] ?? "")))) body.push(lines[i++].replace(/^( {4}|\t)/, ""));
      out.push({ tag: "pre", lang: "", text: body.join("\n") });
      continue;
    }
    const para = [line];
    i++;
    while (i < n && !isBlank(lines[i]) && !startsBlock(lines[i]) && !(/^ {0,3}=+ *$/.test(lines[i]))) para.push(lines[i++]);
    const setext = i < n && /^ {0,3}(=+|-+) *$/.test(lines[i]) && para.length >= 1 ? lines[i] : "";
    if (setext) { i++; out.push({ tag: setext.trim().startsWith("=") ? "h1" : "h2", children: parseInline(para.join("\n").trim()) }); continue; }
    out.push({ tag: "p", children: parseInline(para.map((l, k) => (k < para.length - 1 ? l.replace(/\s+$/, (s) => (s.length >= 2 ? "  " : "")) : l.trimEnd())).join("\n").trim()) });
  }
  return out;
}

/** @returns {{ nodes: Array<object>, truncated: boolean }} the document as a tree. */
export function parseMarkdown(source) {
  const truncated = source.length > MAX_CHARS;
  const lines = (truncated ? source.slice(0, MAX_CHARS) : source).split(/\r\n|\r|\n/);
  return { nodes: parseBlocks(lines, 0), truncated };
}
