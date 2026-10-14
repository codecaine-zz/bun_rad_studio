// Turns a piece of the page (a section, a table, a list of facts, a log) into clean text for the clipboard.
// Nothing here touches the clipboard or changes the page: give it an element, get strings back.
// Rules: headings become lines, paragraphs become lines, tables keep their rows and columns, "Name: value" lists keep
// their pairs, pre blocks keep every space, and anything hidden, decorative (aria-hidden) or clickable (buttons) is left out.

export const MAX_CHARS = 100_000;
const NOTE = "\n(shortened)";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "SVG", "BUTTON", "OPTION", "OPTGROUP", "DATALIST", "CANVAS", "IFRAME", "AUDIO", "VIDEO", "METER", "PROGRESS", "IMG", "HR"]);
const BLOCK_TAGS = new Set(["P", "DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "NAV", "MAIN", "LI", "FIGURE", "FIGCAPTION", "FORM", "FIELDSET", "LEGEND", "DD", "DT", "ADDRESS", "BLOCKQUOTE", "CAPTION", "DETAILS", "SUMMARY", "TR", "TD", "TH", "OUTPUT", "LABEL"]);

const str = (v) => (v === null || v === undefined ? "" : String(v));
const squash = (s) => str(s).replace(/\s+/g, " ").trim();

/** True when an element must not appear in copied text. */
export function isSkipped(el) {
  if (el.nodeType !== 1) return false;
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.hasAttribute("hidden") || el.hasAttribute("data-copy-ui") || el.hasAttribute("data-copy-skip")) return true;
  if (el.getAttribute("aria-hidden") === "true" && !el.hasAttribute("data-copy-keep")) return true;
  return el.style?.display === "none";
}

/** The text of an element on one line (whitespace collapsed), without hidden or decorative parts. */
export function inlineText(el) {
  let out = "";
  const visit = (n) => {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeType === 1 && !isSkipped(n)) {
      const tag = n.tagName.toUpperCase();
      if (tag === "BR" || BLOCK_TAGS.has(tag) || /^H[1-6]$/.test(tag)) out += " ";
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (n.readOnly && n.type !== "checkbox" && n.type !== "radio") out += ` ${str(n.value)} `;
        return;
      }
      for (const c of n.childNodes) visit(c);
      if (BLOCK_TAGS.has(tag)) out += " ";
    }
  };
  visit(el);
  return squash(out);
}

function rawText(el) {
  let out = "";
  const visit = (n) => {
    if (n.nodeType === 3) out += n.nodeValue;
    else if (n.nodeType === 1 && !isSkipped(n)) {
      if (n.tagName.toUpperCase() === "BR") out += "\n";
      else for (const c of n.childNodes) visit(c);
    }
  };
  visit(el);
  return out.replace(/\r\n?/g, "\n");
}

function readTable(table, controls) {
  const trs = [...table.querySelectorAll("tr")].filter((tr) => {
    if (tr.closest("table") !== table) return false;
    for (let p = tr; p && p !== table; p = p.parentElement) if (isSkipped(p)) return false;
    return true;
  });
  const grid = [];
  const firstIsTh = [];
  const pending = [];
  let headerRows = 0;
  trs.forEach((tr, r) => {
    const row = [];
    let col = 0;
    const take = () => {
      while (pending[col] > 0) {
        pending[col]--;
        row[col++] = "";
      }
    };
    let first = true;
    for (const cell of tr.children) {
      if (!/^(TD|TH)$/.test(cell.tagName.toUpperCase()) || isSkipped(cell)) continue;
      take();
      if (first) firstIsTh[r] = cell.tagName.toUpperCase() === "TH" && cell.getAttribute("scope") !== "col";
      first = false;
      const colspan = Math.max(1, Math.min(100, parseInt(cell.getAttribute("colspan") ?? "1", 10) || 1));
      const rowspan = Math.max(1, Math.min(100, parseInt(cell.getAttribute("rowspan") ?? "1", 10) || 1));
      row[col] = cellText(cell, controls);
      for (let k = 1; k < colspan; k++) row[col + k] = "";
      if (rowspan > 1) for (let k = 0; k < colspan; k++) pending[col + k] = rowspan - 1;
      col += colspan;
    }
    take();
    if (row.length === 0) return;
    if (tr.parentElement?.tagName.toUpperCase() === "THEAD") headerRows = grid.length + 1;
    grid.push(row);
  });
  const width = Math.max(0, ...grid.map((r) => r.length));
  for (const row of grid) for (let i = 0; i < width; i++) row[i] = str(row[i]);
  const captionEl = [...table.children].find((c) => c.tagName.toUpperCase() === "CAPTION" && !isSkipped(c));
  const caption = captionEl ? inlineText(captionEl) : "";
  if (grid.length === 0) return caption ? { kind: "text", text: caption } : null;
  let header = null;
  let body = grid;
  if (headerRows > 0) {
    header = grid[headerRows - 1];
    body = grid.slice(headerRows);
  } else if (grid.length > 1 && trs.length > 0) {
    const firstRowCells = [...trs[0].children].filter((c) => /^(TD|TH)$/.test(c.tagName.toUpperCase()) && !isSkipped(c));
    if (firstRowCells.length > 0 && firstRowCells.every((c) => c.tagName.toUpperCase() === "TH" && c.getAttribute("scope") !== "row")) {
      header = grid[0];
      body = grid.slice(1);
    }
  }
  if (!header && width === 2 && body.length > 0 && body.every((_r, i) => firstIsTh[i])) return { kind: "pairs", caption, pairs: body.map((r) => [r[0], r[1]]) };
  return { kind: "table", caption, header, body };
}

function cellText(cell, controls) {
  const pieces = [];
  const visit = (n) => {
    if (n.nodeType === 3) pieces.push(n.nodeValue);
    else if (n.nodeType === 1 && !isSkipped(n)) {
      const tag = n.tagName.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        const t = controlText(n, controls);
        if (t) pieces.push(` ${t} `);
        return;
      }
      if (tag === "BR" || BLOCK_TAGS.has(tag)) pieces.push(" ");
      for (const c of n.childNodes) visit(c);
      if (BLOCK_TAGS.has(tag)) pieces.push(" ");
    }
  };
  visit(cell);
  return squash(pieces.join(""));
}

/** What a form control says about itself, or "" when it should not be copied. */
function controlText(el, controls) {
  const tag = el.tagName.toUpperCase();
  const type = str(el.type).toLowerCase();
  if (type === "checkbox" || type === "radio") return controls ? (el.checked ? "[x]" : "[ ]") : "";
  if (type === "password" || type === "hidden" || type === "file") return "";
  if (!controls && !el.readOnly) return "";
  if (tag === "SELECT") return squash(el.selectedOptions?.[0]?.textContent);
  return squash(el.value);
}

function readPairs(dl) {
  const pairs = [];
  let name = null;
  const flush = (value) => {
    if (name !== null || value) pairs.push([name ?? "", value]);
    name = null;
  };
  const visit = (parent) => {
    for (const c of parent.children) {
      if (isSkipped(c)) continue;
      const tag = c.tagName.toUpperCase();
      if (tag === "DT") {
        if (name !== null) flush("");
        name = inlineText(c);
      } else if (tag === "DD") flush(inlineText(c));
      else if (tag === "DIV") visit(c);
    }
  };
  visit(dl);
  if (name !== null) flush("");
  return pairs.filter(([k, v]) => k || v);
}

function collect(root, controls) {
  const blocks = [];
  let buf = "";
  const flush = () => {
    const t = squash(buf);
    buf = "";
    if (t) blocks.push({ kind: "text", text: t });
  };
  const readList = (list, depth) => {
    let n = 0;
    const ordered = list.tagName.toUpperCase() === "OL";
    for (const li of list.children) {
      if (isSkipped(li) || li.tagName.toUpperCase() !== "LI") continue;
      let own = "";
      const nested = [];
      const part = (node) => {
        if (node.nodeType === 3) own += node.nodeValue;
        else if (node.nodeType === 1 && !isSkipped(node)) {
          if (/^(UL|OL)$/.test(node.tagName.toUpperCase())) nested.push(node);
          else if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName.toUpperCase())) own += ` ${controlText(node, controls)} `;
          else {
            own += " ";
            for (const c of node.childNodes) part(c);
            own += " ";
          }
        }
      };
      for (const c of li.childNodes) part(c);
      const text = squash(own);
      n++;
      if (text) blocks.push({ kind: "item", text, depth, bullet: ordered ? `${n}.` : "-" });
      for (const sub of nested) readList(sub, depth + 1);
    }
  };
  const visit = (node) => {
    if (node.nodeType === 3) {
      buf += node.nodeValue;
      return;
    }
    if (node.nodeType !== 1 || isSkipped(node)) return;
    const tag = node.tagName.toUpperCase();
    if (tag === "BR") return flush();
    if (/^H[1-6]$/.test(tag)) {
      flush();
      const text = inlineText(node);
      if (text) blocks.push({ kind: "heading", level: Number(tag[1]), text });
      return;
    }
    if (tag === "PRE") {
      flush();
      const text = rawText(node);
      if (text.trim()) blocks.push({ kind: "pre", text });
      return;
    }
    if (tag === "TABLE") {
      flush();
      const t = readTable(node, controls);
      if (t) blocks.push(t);
      return;
    }
    if (tag === "DL") {
      flush();
      const pairs = readPairs(node);
      if (pairs.length) blocks.push({ kind: "pairs", caption: "", pairs });
      return;
    }
    if (tag === "UL" || tag === "OL") {
      flush();
      readList(node, 0);
      return;
    }
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      const t = controlText(node, controls);
      if (!t) return;
      if (controls && /^(checkbox|radio)$/.test(str(node.type))) buf += `${t} `;
      else if (node.tagName.toUpperCase() === "TEXTAREA" && node.readOnly) {
        flush();
        blocks.push({ kind: "pre", text: str(node.value).replace(/\r\n?/g, "\n") });
      } else buf += ` ${t} `;
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) flush();
    for (const c of node.childNodes) visit(c);
    if (block) flush();
  };
  visit(root);
  flush();
  return blocks;
}

const cleanLine = (s) => s.replace(/[ \t]+$/g, "");
const flat = (s) => str(s).replace(/\s+/g, " ").trim();
const mdCell = (s) => flat(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
/** A spreadsheet cell: quoted (with doubled quotes) only when it holds a double quote. */
const tsvCell = (s) => {
  const t = flat(s);
  return t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
};

function textOf(blocks) {
  const out = [];
  const blank = () => {
    if (out.length && out.at(-1) !== "") out.push("");
  };
  blocks.forEach((b, i) => {
    const last = i === blocks.length - 1;
    const afterHeading = blocks[i - 1]?.kind === "heading";
    if (b.kind === "heading") {
      if (!afterHeading) blank();
      out.push(b.text);
    } else if (b.kind === "text") out.push(cleanLine(b.text));
    else if (b.kind === "item") out.push(`${"  ".repeat(b.depth)}${b.bullet} ${b.text}`);
    else if (b.kind === "pre") {
      if (!afterHeading) blank();
      out.push(last ? b.text : b.text.replace(/\n+$/, ""));
      if (!last) out.push("");
    } else if (b.kind === "pairs") {
      if (b.caption) out.push(b.caption);
      for (const [k, v] of b.pairs) out.push(cleanLine(k && v ? `${flat(k)}: ${flat(v)}` : k ? `${flat(k)}:` : flat(v)));
    } else if (b.kind === "table") {
      if (!afterHeading) blank();
      if (b.caption) out.push(b.caption);
      for (const row of [b.header, ...b.body]) if (row) out.push(row.map(flat).join("\t"));
      if (!last) out.push("");
    }
  });
  let text = out.join("\n");
  if (blocks.at(-1)?.kind !== "pre") text = text.replace(/\n+$/, "");
  return text.replace(/^\n+/, "");
}

function markdownOf(blocks) {
  const parts = [];
  for (const b of blocks) {
    if (b.kind === "heading") parts.push(`${"#".repeat(b.level)} ${b.text}`);
    else if (b.kind === "text") parts.push(b.text);
    else if (b.kind === "item") {
      const line = `${"  ".repeat(b.depth)}${b.bullet} ${b.text}`;
      if (typeof parts.at(-1) === "object") parts.at(-1).lines.push(line);
      else parts.push({ lines: [line] });
    } else if (b.kind === "pre") {
      const longest = Math.max(2, ...[...b.text.matchAll(/`+/g)].map((m) => m[0].length));
      const fence = "`".repeat(longest + 1);
      parts.push(`${fence}\n${b.text.replace(/\n+$/, "")}\n${fence}`);
    } else if (b.kind === "pairs") {
      if (b.caption) parts.push(`**${b.caption}**`);
      parts.push(b.pairs.map(([k, v]) => `- **${mdCell(k)}:** ${mdCell(v)}`).join("\n"));
    } else if (b.kind === "table") {
      if (b.caption) parts.push(`**${b.caption}**`);
      const head = b.header ?? b.body[0]?.map((_c, i) => `Column ${i + 1}`) ?? [];
      parts.push([`| ${head.map(mdCell).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...b.body.map((r) => `| ${r.map(mdCell).join(" | ")} |`)].join("\n"));
    }
  }
  return parts.map((p) => (typeof p === "string" ? p : p.lines.join("\n"))).join("\n\n");
}

/** Rows of every table and pair list, as tab-separated lines. Null when there is nothing tabular. */
function tsvOf(blocks, maxRows = Infinity) {
  const groups = [];
  for (const b of blocks) {
    if (b.kind === "table") groups.push([b.header, ...b.body].filter(Boolean));
    else if (b.kind === "pairs") groups.push(b.pairs);
  }
  if (groups.length === 0) return null;
  return groups.map((rows) => rows.slice(0, maxRows).map((r) => r.map(tsvCell).join("\t")).join("\n")).join("\n\n");
}

const uniqueKey = (key, seen, fallback) => {
  const base = flat(key) || fallback;
  let name = base;
  for (let n = 2; seen.has(name); n++) name = `${base} (${n})`;
  seen.add(name);
  return name;
};

function jsonValue(blocks, maxRows = Infinity) {
  const values = [];
  let heading = "";
  for (const b of blocks) {
    if (b.kind === "heading") heading = b.text;
    if (b.kind === "pairs") {
      const seen = new Set();
      const obj = {};
      for (const [k, v] of b.pairs.slice(0, maxRows)) obj[uniqueKey(k, seen, "value")] = flat(v);
      values.push([b.caption || heading, obj]);
    } else if (b.kind === "table") {
      const width = b.header?.length ?? b.body[0]?.length ?? 0;
      const seen = new Set();
      const keys = Array.from({ length: width }, (_x, i) => uniqueKey(b.header?.[i] ?? "", seen, `Column ${i + 1}`));
      values.push([b.caption || heading, b.body.slice(0, maxRows).map((r) => Object.fromEntries(keys.map((k, i) => [k, flat(r[i])])))]);
    }
  }
  if (values.length === 0) return undefined;
  if (values.length === 1) return values[0][1];
  const seen = new Set();
  return Object.fromEntries(values.map(([name, v], i) => [uniqueKey(name, seen, `Table ${i + 1}`), v]));
}

function cap(text) {
  return text.length <= MAX_CHARS ? { text, shortened: false } : { text: text.slice(0, MAX_CHARS - NOTE.length) + NOTE, shortened: true };
}

/** Renders with fewer and fewer rows until the result fits in the clipboard limit. Returns { text, shortened } or null. */
function fit(render) {
  let rows = Infinity;
  for (let i = 0; i < 40; i++) {
    const text = render(rows);
    if (text === null || text === undefined) return null;
    if (text.length <= MAX_CHARS) return { text, shortened: rows !== Infinity };
    rows = rows === Infinity ? 100_000 : Math.floor(rows / 2);
    if (rows < 1) return null;
  }
  return null;
}

/**
 * Reads an element and returns every form it can be copied as:
 * { text, markdown, tsv, json, shortened, tabular }. `tsv` and `json` are null when there is no table or list of facts.
 * Options: heading (default true) keeps heading lines, controls (default false) also shows form fields ([x] / [ ] and values).
 * @param {Element} el
 * @param {{ heading?: boolean, controls?: boolean }} [options]
 */
export function extractSection(el, { heading = true, controls = false } = {}) {
  let blocks = collect(el, controls);
  if (!heading) {
    if (blocks[0]?.kind === "heading") blocks = blocks.slice(1);
    blocks = blocks.map((b) => ((b.kind === "table" || b.kind === "pairs") && b.caption ? { ...b, caption: "" } : b));
  }
  const text = cap(textOf(blocks));
  const markdown = cap(markdownOf(blocks));
  const tsv = fit((rows) => tsvOf(blocks, rows));
  const json = fit((rows) => {
    const v = jsonValue(blocks, rows);
    return v === undefined ? null : JSON.stringify(v, null, 2);
  });
  return {
    text: text.text,
    markdown: markdown.text,
    tsv: tsv?.text ?? null,
    json: json?.text ?? null,
    tabular: tsv !== null,
    shortened: text.shortened || markdown.shortened || !!tsv?.shortened || !!json?.shortened,
  };
}

/** Cuts text to the clipboard limit. Returns { text, shortened }. */
export const capText = cap;

/** Rows (arrays of strings) to tab-separated text, quoting cells that hold a double quote. */
export const rowsToTsv = (rows) => rows.map((r) => r.map(tsvCell).join("\t")).join("\n");

/** Rows to a Markdown table; the first row is the header. */
export function rowsToMarkdown(rows) {
  if (rows.length === 0) return "";
  const [head, ...body] = rows;
  return [`| ${head.map(mdCell).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.map(mdCell).join(" | ")} |`)].join("\n");
}

/** Rows to JSON: an array of objects named by the first row. */
export function rowsToJson(rows) {
  if (rows.length === 0) return "[]";
  const seen = new Set();
  const keys = rows[0].map((k, i) => uniqueKey(k, seen, `Column ${i + 1}`));
  return JSON.stringify(rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k, flat(r[i])]))), null, 2);
}
