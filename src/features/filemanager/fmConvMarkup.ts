/**
 * XML, plist, INI, .env, .properties, Markdown tables, HTML tables and SQL INSERT statements: reading and writing as
 * plain values (see `fmConvCommon.ts`). Nothing here fetches anything: XML entities and external references are never
 * expanded, so a hostile file can't read other files or blow up in memory.
 */
import { ConvError, MAX_DEPTH, Notes, flatten, inferScalar, isObj, newObj, recordsFromRows, scalarText, setKey, toTable, uniqueHeaders, type Obj, type Value } from "./fmConvCommon";

// ---------------------------------------------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------------------------------------------

export interface XNode {
  name: string;
  attrs: Array<[string, string]>;
  children: XNode[];
  /** The text directly inside, pieces joined, not yet trimmed. */
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z0-9]{1,10});/g, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body] ?? m;
  });
}

export function parseXmlTree(source: string): XNode {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  let i = 0;
  const lineOf = (at: number) => text.slice(0, at).split("\n").length;
  const err = (what: string, at = i): never => {
    throw new ConvError(`This isn't valid XML: ${what} (line ${lineOf(at)}).`);
  };
  const stack: XNode[] = [];
  let root: XNode | null = null;
  const NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*/;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    const chunk = text.slice(i, lt < 0 ? text.length : lt);
    if (chunk) {
      if (stack.length) stack[stack.length - 1]!.text += decodeEntities(chunk);
      else if (chunk.trim()) err("there is text outside the main element");
    }
    if (lt < 0) break;
    i = lt;
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end < 0) err("a comment is never closed");
      i = end + 3;
    } else if (text.startsWith("<![CDATA[", i)) {
      const end = text.indexOf("]]>", i + 9);
      if (end < 0) err("a CDATA section is never closed");
      if (!stack.length) err("CDATA outside the main element");
      stack[stack.length - 1]!.text += text.slice(i + 9, end);
      i = end + 3;
    } else if (text.startsWith("<?", i)) {
      const end = text.indexOf("?>", i + 2);
      if (end < 0) err("an instruction is never closed");
      i = end + 2;
    } else if (text.startsWith("<!", i)) {
      // DOCTYPE: skipped, including an internal subset in [ ]; its entity definitions are never used.
      let depth = 0;
      let j = i + 2;
      for (; j < text.length; j++) {
        const c = text[j];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
      }
      if (j >= text.length) err("a declaration is never closed");
      i = j + 1;
    } else if (text[i + 1] === "/") {
      const m = NAME.exec(text.slice(i + 2, i + 300));
      const end = text.indexOf(">", i);
      if (!m || end < 0) err("a closing tag is broken");
      const open = stack.pop();
      if (!open) err(`</${m![0]}> has no matching opening tag`);
      if (open!.name !== m![0]) err(`<${open!.name}> is closed by </${m![0]}>`);
      i = end + 1;
      if (!stack.length) {
        const rest = text.slice(i);
        // after the root: only whitespace, comments and instructions may follow
        if (rest.replace(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g, "").trim()) err("there is more content after the main element", i);
        return open!;
      }
    } else {
      const m = NAME.exec(text.slice(i + 1, i + 300));
      if (!m) err("a tag name was expected");
      const node: XNode = { name: m![0], attrs: [], children: [], text: "" };
      let j = i + 1 + m![0].length;
      for (;;) {
        while (/\s/.test(text[j] ?? "")) j++;
        if (j >= text.length) err("a tag is never closed", i);
        if (text[j] === ">") { j++; break; }
        if (text[j] === "/" && text[j + 1] === ">") { j += 2; node.text = "\u0000selfclosed"; break; }
        const a = NAME.exec(text.slice(j, j + 300));
        if (!a) err("an attribute name was expected", j);
        j += a![0].length;
        while (/\s/.test(text[j] ?? "")) j++;
        if (text[j] !== "=") err(`the attribute "${a![0]}" has no value`, j);
        j++;
        while (/\s/.test(text[j] ?? "")) j++;
        const q = text[j];
        if (q !== '"' && q !== "'") err(`the value of "${a![0]}" must be in quotes`, j);
        const end = text.indexOf(q!, j + 1);
        if (end < 0) err("an attribute value is never closed", j);
        node.attrs.push([a![0], decodeEntities(text.slice(j + 1, end))]);
        j = end + 1;
      }
      if (stack.length >= MAX_DEPTH) err("the elements are nested more than 200 levels deep");
      i = j;
      if (stack.length) stack[stack.length - 1]!.children.push(node);
      else if (root) err("there is more than one main element");
      else root = node;
      if (node.text === "\u0000selfclosed") {
        node.text = "";
        if (!stack.length) {
          if (text.slice(i).replace(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g, "").trim()) err("there is more content after the main element", i);
          return node;
        }
      } else stack.push(node);
    }
  }
  if (stack.length) throw new ConvError(`This isn't valid XML: <${stack[stack.length - 1]!.name}> is never closed.`);
  if (!root) throw new ConvError("The file is empty: there is no XML to convert.");
  return root;
}

function xnodeValue(node: XNode): Value {
  const text = node.text.trim();
  if (!node.attrs.length && !node.children.length) return text;
  const out = newObj();
  for (const [k, v] of node.attrs) setKey(out, `@${k}`, v);
  const groups = new Map<string, XNode[]>();
  for (const c of node.children) (groups.get(c.name) ?? groups.set(c.name, []).get(c.name)!).push(c);
  for (const [name, list] of groups) setKey(out, name, list.length === 1 ? xnodeValue(list[0]!) : list.map(xnodeValue));
  if (text) setKey(out, "#text", text);
  return out;
}

export function parseXml(text: string): Value {
  const root = parseXmlTree(text);
  const out = newObj();
  setKey(out, root.name, xnodeValue(root));
  return out;
}

const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => escXml(s).replace(/"/g, "&quot;").replace(/\r?\n/g, "&#10;");
// eslint-disable-next-line no-control-regex
const XML_BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

export function writeXml(v: Value, opts: { rootName: string; itemName: string }, notes: Notes): string {
  const clean = (s: string) => {
    if (XML_BAD.test(s)) notes.add("Control characters that XML can't hold were removed.");
    return s.replace(XML_BAD, "");
  };
  const name = (raw: string): string => {
    let n = raw.replace(/[^A-Za-z0-9_.-]/g, "_");
    if (!/^[A-Za-z_]/.test(n)) n = `_${n}`;
    if (/^xml/i.test(n)) n = `_${n}`;
    if (n !== raw) notes.add("Some names weren't allowed in XML and were changed (for example spaces became _).");
    return n;
  };
  const text = (x: Value): string => clean(scalarText(x));
  const lines: string[] = [];
  const element = (tag: string, x: Value, level: number) => {
    if (level > MAX_DEPTH) throw new ConvError("The data is nested too deeply (more than 200 levels).");
    const pad = "  ".repeat(level);
    const t = name(tag);
    if (Array.isArray(x)) {
      if (x.length === 0) lines.push(`${pad}<${t}/>`);
      for (const item of x) element(tag, item, level);
      return;
    }
    if (isObj(x)) {
      const attrs: string[] = [];
      const kids: Array<[string, Value]> = [];
      let body = "";
      for (const [k, val] of Object.entries(x)) {
        if (k.startsWith("@") && k.length > 1 && !isObj(val) && !Array.isArray(val)) attrs.push(` ${name(k.slice(1))}="${escAttr(text(val))}"`);
        else if (k === "#text") body = text(val);
        else kids.push([k, val]);
      }
      const open = `${pad}<${t}${attrs.join("")}`;
      if (!kids.length) lines.push(body ? `${open}>${escXml(body)}</${t}>` : `${open}/>`);
      else {
        lines.push(`${open}>`);
        if (body) lines.push(`${pad}  ${escXml(body)}`);
        for (const [k, val] of kids) element(k, val, level + 1);
        lines.push(`${pad}</${t}>`);
      }
      return;
    }
    if (x === null || scalarText(x) === "") lines.push(`${pad}<${t}/>`);
    else lines.push(`${pad}<${t}>${escXml(text(x))}</${t}>`);
  };
  const single = isObj(v) && Object.keys(v).length === 1 ? Object.entries(v)[0]! : null;
  if (single && !Array.isArray(single[1]) && isObj(single[1]) && !single[0].startsWith("@") && single[0] !== "#text") element(single[0], single[1], 0);
  else if (single && !single[0].startsWith("@") && single[0] !== "#text" && Array.isArray(single[1])) {
    lines.push(`<${name(opts.rootName)}>`);
    element(single[0], single[1], 1);
    lines.push(`</${name(opts.rootName)}>`);
  } else if (Array.isArray(v)) {
    lines.push(`<${name(opts.rootName)}>`);
    for (const item of v) element(opts.itemName, item, 1);
    lines.push(`</${name(opts.rootName)}>`);
  } else element(opts.rootName, v, 0);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// plist (XML property lists)
// ---------------------------------------------------------------------------------------------------------------

export function parsePlist(text: string, notes: Notes): Value {
  if (text.startsWith("bplist00")) throw new ConvError("This is a binary property list. Convert it to XML first (on a Mac: plutil -convert xml1 file.plist), then try again.");
  const root = parseXmlTree(text);
  if (root.name !== "plist") throw new ConvError("This XML isn't a property list (its main element should be <plist>).");
  const first = root.children[0];
  if (!first) throw new ConvError("This property list is empty.");
  const go = (n: XNode, depth: number): Value => {
    if (depth > MAX_DEPTH) throw new ConvError("The property list is nested too deeply.");
    switch (n.name) {
      case "dict": {
        const out = newObj();
        for (let k = 0; k < n.children.length; k += 2) {
          const key = n.children[k]!;
          const val = n.children[k + 1];
          if (key.name !== "key" || !val) throw new ConvError("This property list is damaged (a <dict> doesn't alternate <key> and values).");
          setKey(out, key.text, go(val, depth + 1));
        }
        return out;
      }
      case "array": return n.children.map((c) => go(c, depth + 1));
      case "string": return n.text;
      case "integer": {
        const t = n.text.trim();
        if (!/^-?\d+$/.test(t)) throw new ConvError(`"${t.slice(0, 20)}" isn't a whole number in this property list.`);
        const num = Number(t);
        return Number.isSafeInteger(num) ? num : BigInt(t);
      }
      case "real": {
        const num = Number(n.text.trim());
        if (!Number.isFinite(num)) throw new ConvError("A decimal number in this property list isn't valid.");
        return num;
      }
      case "true": return true;
      case "false": return false;
      case "date": return n.text.trim();
      case "data": notes.add("Binary data (<data>) was kept as base64 text."); return n.text.replace(/\s+/g, "");
      default: throw new ConvError(`This property list has an unknown item <${n.name}>.`);
    }
  };
  return go(first, 0);
}

export function writePlist(v: Value, notes: Notes): string {
  const out: string[] = [];
  const go = (x: Value, level: number) => {
    if (level > MAX_DEPTH) throw new ConvError("The data is nested too deeply (more than 200 levels).");
    const pad = "\t".repeat(level);
    if (x === null) { notes.add("A property list has no null, so empty values were written as empty text."); out.push(`${pad}<string></string>`); }
    else if (typeof x === "string") out.push(`${pad}<string>${escXml(x.replace(XML_BAD, ""))}</string>`);
    else if (typeof x === "boolean") out.push(`${pad}<${x}/>`);
    else if (typeof x === "bigint") out.push(`${pad}<integer>${x}</integer>`);
    else if (typeof x === "number") {
      if (!Number.isFinite(x)) { notes.add("A number that isn't finite was written as 0."); out.push(`${pad}<real>0</real>`); }
      else out.push(Number.isInteger(x) ? `${pad}<integer>${x}</integer>` : `${pad}<real>${x}</real>`);
    } else if (Array.isArray(x)) {
      if (!x.length) out.push(`${pad}<array/>`);
      else { out.push(`${pad}<array>`); for (const e of x) go(e, level + 1); out.push(`${pad}</array>`); }
    } else {
      const entries = Object.entries(x);
      if (!entries.length) out.push(`${pad}<dict/>`);
      else {
        out.push(`${pad}<dict>`);
        for (const [k, e] of entries) { out.push(`${pad}\t<key>${escXml(k.replace(XML_BAD, ""))}</key>`); go(e, level + 1); }
        out.push(`${pad}</dict>`);
      }
    }
  };
  go(v, 0);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${out.join("\n")}\n</plist>\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// INI
// ---------------------------------------------------------------------------------------------------------------

function unquoteValue(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && t[0] === '"' && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  if (t.length >= 2 && t[0] === "'" && t.endsWith("'")) return t.slice(1, -1);
  return t;
}

export function parseIni(text: string, infer: boolean, notes: Notes): Value {
  const root = newObj();
  let cur: Obj = root;
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/);
  let any = false;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!.trim();
    if (!line || line[0] === ";" || line[0] === "#") continue;
    any = true;
    const section = /^\[([^\]]*)\]$/.exec(line);
    if (section) {
      const name = section[1]!.trim();
      const existing = root[name];
      if (isObj(existing)) cur = existing;
      else { cur = newObj(); setKey(root, name, cur); }
      continue;
    }
    const m = /^([^=:]+?)\s*[=:]\s*(.*)$/.exec(line);
    if (!m) throw new ConvError(`Line ${n + 1} isn't a setting (it should look like name = value).`);
    let key = m[1]!.trim();
    const val = unquoteValue(m[2]!);
    const v: Value = infer ? inferScalar(val) : val;
    if (key.endsWith("[]")) {
      key = key.slice(0, -2);
      const list = cur[key];
      if (Array.isArray(list)) list.push(v);
      else setKey(cur, key, [v]);
    } else {
      if (Object.prototype.hasOwnProperty.call(cur, key)) notes.add(`The setting "${key.slice(0, 40)}" appears more than once; the last value was kept.`);
      setKey(cur, key, v);
    }
  }
  if (!any) throw new ConvError("The file is empty: there are no settings to convert.");
  return root;
}

export function writeIni(v: Value, notes: Notes): string {
  if (!isObj(v)) throw new ConvError("An INI file needs named settings. This data is a list or a single value, so it can't be written as INI. Convert it from JSON with an object at the top.");
  const q = (x: string) => (/^\s|\s$|^["';#]|[\r\n]/.test(x) ? JSON.stringify(x) : x);
  const setting = (key: string, x: Value, out: string[]) => {
    if (Array.isArray(x) && x.every((e) => typeof e !== "object" || e === null)) for (const e of x) out.push(`${key}[] = ${q(scalarText(e))}`);
    else if (typeof x === "object" && x !== null) {
      notes.add("Nested data inside a section was flattened into dotted names.");
      for (const [k, e] of Object.entries(flatten(x))) out.push(`${key}.${k} = ${q(scalarText(e))}`);
    } else out.push(`${key} = ${q(scalarText(x))}`);
  };
  const head: string[] = [];
  const blocks: string[][] = [];
  for (const [k, x] of Object.entries(v)) {
    if (isObj(x) && Object.keys(x).length) {
      const block: string[] = [`[${k}]`];
      for (const [k2, y] of Object.entries(x)) setting(k2, y, block);
      blocks.push(block);
    } else setting(k, x, head);
  }
  return `${[head.length ? head.join("\n") : "", ...blocks.map((b) => b.join("\n"))].filter(Boolean).join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------------------------------------------

export function parseEnv(text: string, infer: boolean): Value {
  const out = newObj();
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/);
  let any = false;
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n]!;
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    any = true;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!m) throw new ConvError(`Line ${n + 1} isn't a setting (it should look like NAME=value).`);
    let rest = m[2]!;
    let value: string;
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      let body = rest.slice(1);
      let end = -1;
      for (let guard = 0; guard < 10_000; guard++) {
        for (let k = 0; k < body.length; k++) {
          if (quote === '"' && body[k] === "\\") { k++; continue; }
          if (body[k] === quote) { end = k; break; }
        }
        if (end >= 0 || n + 1 >= lines.length) break;
        body += `\n${lines[++n]!}`;
      }
      if (end < 0) throw new ConvError(`The quoted value of ${m[1]} never ends.`);
      value = body.slice(0, end);
      if (quote === '"') value = value.replace(/\\(["\\nrt$])/g, (_x, c: string) => (c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c));
    } else {
      rest = rest.replace(/\s+#.*$/, "");
      value = rest.trim();
    }
    setKey(out, m[1]!, infer && quote === undefined ? inferScalar(value) : value);
  }
  if (!any) throw new ConvError("The file is empty: there are no settings to convert.");
  return out;
}

export function writeEnv(v: Value, notes: Notes): string {
  const flat = isObj(v) ? flatten(v, "_") : flatten({ value: v } as Obj, "_");
  if (!isObj(v) || Object.values(v).some((x) => typeof x === "object" && x !== null)) notes.add("Nested data was flattened, joining the names with _.");
  const lines: string[] = [];
  for (const [k, x] of Object.entries(flat)) {
    const key = k.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");
    if (key !== k) notes.add("Some names weren't allowed in an .env file and were changed (for example . became _).");
    const s = scalarText(x);
    const out = s === "" ? "" : /^[A-Za-z0-9_./:@%+,=-]+$/.test(s) ? s : !/['\r\n]/.test(s) ? `'${s}'` : `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
    lines.push(`${key}=${out}`);
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// .properties
// ---------------------------------------------------------------------------------------------------------------

function propUnescape(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (_m, c: string) => (c[0] === "u" && c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c === "f" ? "\f" : c));
}

export function parseProperties(text: string, infer: boolean): Value {
  const out = newObj();
  const physical = text.replace(/^\ufeff/, "").split(/\r?\n|\r/);
  let any = false;
  for (let n = 0; n < physical.length; n++) {
    let line = physical[n]!.replace(/^[ \t\f]+/, "");
    if (!line || line[0] === "#" || line[0] === "!") continue;
    while (/(?:^|[^\\])(?:\\\\)*\\$/.test(line) && n + 1 < physical.length) line = line.slice(0, -1) + physical[++n]!.replace(/^[ \t\f]+/, "");
    any = true;
    let k = 0;
    while (k < line.length && !/[=:\s]/.test(line[k]!)) k += line[k] === "\\" ? 2 : 1;
    const key = propUnescape(line.slice(0, k));
    let rest = line.slice(k).replace(/^[ \t\f]*/, "");
    if (rest[0] === "=" || rest[0] === ":") rest = rest.slice(1).replace(/^[ \t\f]*/, "");
    const value = propUnescape(rest);
    setKey(out, key, infer ? inferScalar(value) : value);
  }
  if (!any) throw new ConvError("The file is empty: there are no settings to convert.");
  return out;
}

export function writeProperties(v: Value, notes: Notes): string {
  const flat = isObj(v) ? flatten(v) : flatten({ value: v } as Obj);
  if (!isObj(v) || Object.values(v).some((x) => typeof x === "object" && x !== null)) notes.add("Nested data was flattened into dotted names (like server.port).");
  const esc = (s: string, key: boolean) => {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i]!;
      const code = c.charCodeAt(0);
      if (c === "\\") out += "\\\\";
      else if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\t") out += "\\t";
      else if (c === "\f") out += "\\f";
      else if (code < 0x20 || code > 0x7e) out += `\\u${code.toString(16).padStart(4, "0")}`;
      else if (key && (c === " " || c === "=" || c === ":" || c === "#" || c === "!")) out += `\\${c}`;
      else if (!key && c === " " && i === 0) out += "\\ ";
      else out += c;
    }
    return out;
  };
  return `${Object.entries(flat).map(([k, x]) => `${esc(k, true)}=${esc(scalarText(x), false)}`).join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Markdown and HTML tables
// ---------------------------------------------------------------------------------------------------------------

function splitPipes(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === "\\" && line[i + 1] === "|") { cur += "|"; i++; }
    else if (c === "|") { cells.push(cur); cur = ""; }
    else cur += c;
  }
  cells.push(cur);
  if (cells[0]!.trim() === "") cells.shift();
  if (cells.length && cells[cells.length - 1]!.trim() === "") cells.pop();
  return cells.map((c) => c.trim().replace(/<br\s*\/?>/gi, "\n"));
}

export function parseMarkdownTable(text: string, infer: boolean, notes: Notes): Value {
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/);
  const sep = (l: string) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(l) && l.includes("-") && (l.includes("|") || /^\s*:?-+:?\s*$/.test(l));
  let start = -1;
  let tables = 0;
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i]!.includes("|") && sep(lines[i + 1]!) && lines[i + 1]!.includes("|")) {
      tables++;
      if (start < 0) start = i;
      i++;
    }
  }
  if (start < 0) throw new ConvError("No table was found in this file. A Markdown table looks like: | name | age |  followed by  | --- | --- |.");
  if (tables > 1) notes.add("The file has more than one table; only the first was used.");
  const header = splitPipes(lines[start]!);
  const rows: string[][] = [];
  for (let i = start + 2; i < lines.length && lines[i]!.trim() && lines[i]!.includes("|"); i++) rows.push(splitPipes(lines[i]!));
  return recordsFromRows(header, rows, infer);
}

export function writeMarkdownTable(v: Value, flatOpt: boolean, notes: Notes): string {
  const t = toTable(v, { flatten: flatOpt, notes });
  const cell = (x: Value) => scalarText(x).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  const header = t.columns.map((c) => cell(c));
  const body = t.rows.map((r) => r.map(cell));
  const widths = header.map((h, i) => Math.min(40, Math.max(3, h.length, ...body.map((r) => r[i]!.length))));
  const fmt = (r: string[]) => `| ${r.map((c, i) => c.padEnd(widths[i]!)).join(" | ")} |`;
  return `${[fmt(header), `| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`, ...body.map(fmt)].join("\n")}\n`;
}

const stripTags = (s: string) => decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")).replace(/[ \t\r\f\v\u00a0]+/g, " ").replace(/ ?\n ?/g, "\n").trim();

export function parseHtmlTable(text: string, header: boolean, infer: boolean, notes: Notes): Value {
  const tables = [...text.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)];
  if (!tables.length) throw new ConvError("No table was found in this file (there is no <table> in it).");
  if (tables.length > 1) notes.add("The file has more than one table; only the first was used.");
  const body = tables[0]![1]!;
  if (/\b(?:rowspan|colspan)\s*=/i.test(body)) notes.add("Merged cells (rowspan, colspan) aren't supported: each cell was read as one cell.");
  const rows: string[][] = [];
  let hasTh = false;
  for (const tr of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = [...tr[1]!.matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)];
    if (!cells.length) continue;
    if (rows.length === 0 && cells.some((c) => c[1]!.toLowerCase() === "th")) hasTh = true;
    rows.push(cells.map((c) => stripTags(c[2]!)));
  }
  if (!rows.length) throw new ConvError("The table has no rows.");
  if (hasTh || header) return recordsFromRows(rows[0]!, rows.slice(1), infer);
  return rows.map((r) => r.map((c) => (infer ? inferScalar(c) : c)));
}

export function writeHtmlTable(v: Value, flatOpt: boolean, title: string, notes: Notes): string {
  const t = toTable(v, { flatten: flatOpt, notes });
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cell = (x: Value) => esc(scalarText(x)).replace(/\r?\n/g, "<br>");
  const rows = t.rows.map((r) => `      <tr>${r.map((x) => `<td>${cell(x)}</td>`).join("")}</tr>`);
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>${esc(title)}</title>\n</head>\n<body>\n  <table border="1" cellspacing="0" cellpadding="4">\n    <thead>\n      <tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>\n    </thead>\n    <tbody>\n${rows.join("\n")}\n    </tbody>\n  </table>\n</body>\n</html>\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// SQL INSERT statements
// ---------------------------------------------------------------------------------------------------------------

export type Dialect = "ansi" | "mysql" | "sqlserver";

export function writeSql(v: Value, o: { table: string; dialect: Dialect; createTable: boolean; flatten: boolean }, notes: Notes): string {
  const t = toTable(v, { flatten: o.flatten, notes });
  const ident = (s: string) => (o.dialect === "mysql" ? `\`${s.replace(/`/g, "``")}\`` : o.dialect === "sqlserver" ? `[${s.replace(/\]/g, "]]")}]` : `"${s.replace(/"/g, '""')}"`);
  const lit = (x: Value): string => {
    if (x === null) return "NULL";
    if (typeof x === "boolean") return o.dialect === "sqlserver" ? (x ? "1" : "0") : x ? "TRUE" : "FALSE";
    if (typeof x === "number") {
      if (!Number.isFinite(x)) { notes.add("A number that isn't finite was written as NULL."); return "NULL"; }
      return String(x);
    }
    if (typeof x === "bigint") return x.toString();
    let s = (typeof x === "string" ? x : JSON.stringify(x)).replace(/\0/g, "");
    if (o.dialect === "mysql") s = s.replace(/\\/g, "\\\\");
    return `${o.dialect === "sqlserver" ? "N" : ""}'${s.replace(/'/g, "''")}'`;
  };
  const out: string[] = [];
  const table = ident(o.table);
  if (o.createTable) {
    const types = t.columns.map((_c, i) => {
      const col = t.rows.map((r) => r[i]!).filter((x) => x !== null);
      if (col.length && col.every((x) => typeof x === "boolean")) return o.dialect === "sqlserver" ? "BIT" : "BOOLEAN";
      if (col.length && col.every((x) => typeof x === "number" && Number.isInteger(x) || typeof x === "bigint")) return "BIGINT";
      if (col.length && col.every((x) => typeof x === "number" || typeof x === "bigint")) return o.dialect === "ansi" ? "DOUBLE PRECISION" : o.dialect === "mysql" ? "DOUBLE" : "FLOAT";
      return o.dialect === "sqlserver" ? "NVARCHAR(MAX)" : "TEXT";
    });
    out.push(`CREATE TABLE ${table} (\n${t.columns.map((c, i) => `  ${ident(c)} ${types[i]}`).join(",\n")}\n);`);
  }
  const cols = t.columns.map(ident).join(", ");
  const batch = 100;
  for (let i = 0; i < t.rows.length; i += batch) {
    const rows = t.rows.slice(i, i + batch).map((r) => `  (${r.map(lit).join(", ")})`);
    out.push(`INSERT INTO ${table} (${cols}) VALUES\n${rows.join(",\n")};`);
  }
  return `${out.join("\n\n")}\n`;
}

/** Reads INSERT ... VALUES statements into rows. Other statements (CREATE TABLE and so on) are skipped. */
export function parseSql(source: string, _infer: boolean, notes: Notes): Value {
  const s = source.replace(/^\ufeff/, "");
  let i = 0;
  const n = s.length;
  const tables = new Map<string, Obj[]>();
  const skipSpace = () => {
    for (;;) {
      while (i < n && /\s/.test(s[i]!)) i++;
      if (s.startsWith("--", i) || s[i] === "#") { while (i < n && s[i] !== "\n") i++; }
      else if (s.startsWith("/*", i)) { const e = s.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; }
      else return;
    }
  };
  const ident = (): string => {
    skipSpace();
    const open = s[i];
    const close = open === "`" ? "`" : open === '"' ? '"' : open === "[" ? "]" : null;
    let name = "";
    if (close) {
      i++;
      while (i < n && s[i] !== close) name += s[i++];
      i++;
    } else {
      const m = /^[A-Za-z_][\w$]*/.exec(s.slice(i, i + 200));
      if (!m) throw new ConvError(`The SQL isn't understood near "${s.slice(i, i + 20).replace(/\s+/g, " ")}".`);
      name = m[0];
      i += name.length;
    }
    skipSpace();
    if (s[i] === ".") { i++; return `${name}.${ident()}`; }
    return name;
  };
  const skipStatement = () => {
    while (i < n && s[i] !== ";") {
      if (s[i] === "'" || s[i] === '"' || s[i] === "`") { const q = s[i]!; i++; while (i < n && s[i] !== q) { if (s[i] === "\\" && q === "'") i++; i++; } }
      i++;
    }
    i++;
  };
  const literal = (): Value => {
    skipSpace();
    const c = s[i];
    if (c === "'" || ((c === "N" || c === "n") && s[i + 1] === "'")) {
      if (c !== "'") i++;
      i++;
      let out = "";
      for (;;) {
        if (i >= n) throw new ConvError("A text value in the SQL never ends (a closing ' is missing).");
        if (s[i] === "'") { if (s[i + 1] === "'") { out += "'"; i += 2; continue; } i++; break; }
        if (s[i] === "\\" && (s[i + 1] === "'" || s[i + 1] === "\\")) { out += s[i + 1]; i += 2; continue; }
        out += s[i++];
      }
      return out;
    }
    const m = /^[^,)\s]+(?:\([^)]*\))?/.exec(s.slice(i, i + 400));
    if (!m) throw new ConvError(`A value in the SQL isn't understood near "${s.slice(i, i + 20).replace(/\s+/g, " ")}".`);
    i += m[0].length;
    const tok = m[0];
    if (/^null$/i.test(tok)) return null;
    if (/^true$/i.test(tok)) return true;
    if (/^false$/i.test(tok)) return false;
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(tok)) {
      if (/^-?\d+$/.test(tok) && !Number.isSafeInteger(Number(tok))) return BigInt(tok);
      return Number(tok);
    }
    notes.add("Some SQL expressions (like NOW()) can't be evaluated and were kept as text.");
    return tok;
  };
  while (i < n) {
    skipSpace();
    if (i >= n) break;
    const m = /^insert\s+(?:ignore\s+)?(?:or\s+\w+\s+)?into\s+/i.exec(s.slice(i, i + 80));
    if (!m) { skipStatement(); continue; }
    i += m[0].length;
    const table = ident();
    skipSpace();
    let cols: string[] | null = null;
    if (s[i] === "(") {
      i++;
      cols = [];
      for (;;) {
        cols.push(ident());
        skipSpace();
        if (s[i] === ",") { i++; continue; }
        if (s[i] === ")") { i++; break; }
        throw new ConvError("The column list in the SQL isn't understood.");
      }
    }
    skipSpace();
    if (!/^values?\b/i.test(s.slice(i, i + 7))) { skipStatement(); continue; }
    i += /^values/i.test(s.slice(i, i + 6)) ? 6 : 5;
    const list = tables.get(table) ?? tables.set(table, []).get(table)!;
    for (;;) {
      skipSpace();
      if (s[i] !== "(") break;
      i++;
      const vals: Value[] = [];
      for (;;) {
        vals.push(literal());
        skipSpace();
        if (s[i] === ",") { i++; continue; }
        if (s[i] === ")") { i++; break; }
        throw new ConvError("A row of values in the SQL isn't understood (a , or ) was expected).");
      }
      const names = uniqueHeaders(cols ?? vals.map((_v, k) => `column${k + 1}`));
      if (cols && vals.length !== cols.length) throw new ConvError(`A row has ${vals.length} values but the column list has ${cols.length}.`);
      const rec = newObj();
      names.forEach((name, k) => setKey(rec, name, vals[k]!));
      list.push(rec);
      skipSpace();
      if (s[i] === ",") { i++; continue; }
      break;
    }
    skipStatement();
  }
  if (!tables.size) throw new ConvError("No INSERT statements were found in this file.");
  if (tables.size === 1) return [...tables.values()][0]!;
  notes.add("The file inserts into more than one table, so the result has one list for each table.");
  const out = newObj();
  for (const [name, rows] of tables) setKey(out, name, rows);
  return out;
}
