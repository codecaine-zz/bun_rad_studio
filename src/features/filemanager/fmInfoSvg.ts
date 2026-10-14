/** SVG pictures: a few facts read with a plain tokenizer. Nothing is run, no entity is expanded, nothing is fetched. */
import { clip, Rows, type InfoGroup } from "./fmInfoCommon";
import { decodeEntities } from "./fmInfoMeta";

export interface SvgInfo {
  width: string;
  height: string;
  viewBox: string;
  pixelWidth: number | null;
  pixelHeight: number | null;
  elements: number;
  title: string;
  scripts: number;
  eventAttributes: number;
  externalRefs: number;
  hasDoctype: boolean;
  entities: number;
  foreignObjects: number;
}

const UNIT: Record<string, number> = { "": 1, px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

function pixels(value: string): number | null {
  const m = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]) * (UNIT[(m[2] ?? "").toLowerCase()] ?? 1);
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
}

/** The attributes of the first `<svg ...>` tag; quotes are respected so a ">" inside a value doesn't end the tag. */
function rootAttributes(xml: string): Record<string, string> | null {
  const m = /<svg(?=[\s>/])/i.exec(xml);
  if (!m) return null;
  const attrs: Record<string, string> = {};
  let i = m.index + 4;
  let guard = 0;
  while (i < xml.length && guard++ < 200) {
    while (i < xml.length && /\s/.test(xml[i]!)) i++;
    if (xml[i] === ">" || xml[i] === "/") break;
    const name = /^[^\s=>/]+/.exec(xml.slice(i, i + 80))?.[0];
    if (!name) break;
    i += name.length;
    while (i < xml.length && /\s/.test(xml[i]!)) i++;
    if (xml[i] !== "=") { attrs[name] = ""; continue; }
    i++;
    while (i < xml.length && /\s/.test(xml[i]!)) i++;
    const q = xml[i];
    if (q === '"' || q === "'") {
      const end = xml.indexOf(q, i + 1);
      if (end < 0) break;
      attrs[name] = decodeEntities(xml.slice(i + 1, end));
      i = end + 1;
    } else {
      const v = /^[^\s>]+/.exec(xml.slice(i, i + 200))?.[0] ?? "";
      attrs[name] = v;
      i += v.length;
    }
  }
  return attrs;
}

export function looksLikeSvg(text: string): boolean {
  return /<svg(?=[\s>/])/i.test(text.slice(0, 8192));
}

function asciiLower(text: string): string {
  return text.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/** Removes every `open ... close` block in one pass; an unclosed block runs to the end. */
function removeBlocks(text: string, open: string, close: string): string {
  const lower = asciiLower(text);
  let out = "";
  let i = 0;
  for (;;) {
    const s = lower.indexOf(open, i);
    if (s < 0) return out + text.slice(i);
    out += text.slice(i, s);
    const e = lower.indexOf(close, s + open.length);
    if (e < 0) return out;
    i = e + close.length;
  }
}

/** Removes `<!DOCTYPE ...>`, including an internal `[...]` part, without ever expanding what it defines. */
function removeDoctypes(text: string): string {
  const lower = asciiLower(text);
  let out = "";
  let i = 0;
  for (;;) {
    const s = lower.indexOf("<!doctype", i);
    if (s < 0) return out + text.slice(i);
    out += text.slice(i, s);
    let j = s + 9;
    while (j < text.length && text[j] !== ">" && text[j] !== "[") j++;
    if (text[j] === "[") {
      const close = text.indexOf("]", j);
      j = close < 0 ? text.length : close;
      while (j < text.length && text[j] !== ">") j++;
    }
    i = j + 1;
  }
}

export function parseSvg(text: string): SvgInfo | null {
  const xml = text.slice(0, 2 * 1024 * 1024);
  const root = rootAttributes(xml);
  if (!root) return null;
  const hasDoctype = /<!DOCTYPE/i.test(xml);
  const entities = (xml.match(/<!ENTITY/gi) ?? []).length;
  // Comments, CDATA and the DOCTYPE are removed before counting, so what is counted are the picture's own tags.
  const body = removeDoctypes(removeBlocks(removeBlocks(xml, "<!--", "-->"), "<![cdata[", "]]>"));
  const elements = (body.match(/<[A-Za-z][\w:.-]*/g) ?? []).length;
  const vb = (root.viewBox ?? "").trim();
  const vbNums = vb.split(/[\s,]+/).map(Number);
  const hasVb = vbNums.length === 4 && vbNums.every(Number.isFinite) && vbNums[2]! > 0 && vbNums[3]! > 0;
  const w = root.width ?? "", h = root.height ?? "";
  const refs = [...body.matchAll(/\b(?:xlink:)?href\s*=\s*["']\s*(?:https?:|ftp:|\/\/|file:)/gi)].length + (body.match(/url\(\s*["']?\s*https?:/gi) ?? []).length + (body.match(/@import/gi) ?? []).length;
  return {
    width: w, height: h, viewBox: hasVb ? vb : "",
    pixelWidth: pixels(w) ?? (hasVb && !w ? vbNums[2]! : null), pixelHeight: pixels(h) ?? (hasVb && !h ? vbNums[3]! : null),
    elements,
    title: clip(decodeEntities(/<title[^>]{0,200}>([\s\S]{0,400}?)<\/title>/i.exec(body)?.[1]?.replace(/<[^>]{0,200}>/g, "") ?? ""), 200).trim(),
    scripts: (body.match(/<script[\s>]/gi) ?? []).length,
    eventAttributes: (body.match(/\son[a-z]+\s*=/gi) ?? []).length,
    externalRefs: refs,
    hasDoctype, entities,
    foreignObjects: (body.match(/<foreignObject[\s>]/gi) ?? []).length,
  };
}

export function svgGroups(s: SvgInfo): { rows: Rows; groups: InfoGroup[] } {
  const rows = new Rows();
  rows.add("Width", s.width || "not set", "The size the picture asks for. Without it, programs use the viewBox.");
  rows.add("Height", s.height || "not set").add("viewBox", s.viewBox, "The drawing area the shapes are placed in. It decides how the picture scales.");
  rows.add("Shapes and tags", s.elements.toLocaleString("en-US"), "How many tags (shapes, groups, text) the file has.");
  rows.add("Title inside", s.title);
  const safety = new Rows();
  safety.add("Scripts", s.scripts ? `${s.scripts} script tag${s.scripts === 1 ? "" : "s"}. They are NOT run here.` : "None", "SVG files can contain programs. Web browsers ignore them in a picture, but some programs run them.", s.scripts ? "warn" : "good");
  safety.add("Event handlers", s.eventAttributes ? `${s.eventAttributes} (like onclick)` : "None", "Little bits of code attached to shapes.", s.eventAttributes ? "warn" : undefined);
  safety.add("Links to other sites", s.externalRefs ? `${s.externalRefs}. Nothing was fetched.` : "None", "Pictures that load things from the internet can tell the other site you opened them.", s.externalRefs ? "warn" : undefined);
  safety.add("Entity definitions", s.hasDoctype && s.entities ? `${s.entities} (not expanded)` : s.hasDoctype ? "Has a DOCTYPE, ignored" : "None", "A trick that can make a small file expand into gigabytes. It was ignored.", s.entities ? "warn" : undefined);
  safety.add("Embedded web content", s.foreignObjects ? `${s.foreignObjects} foreignObject` : "", "HTML placed inside the picture.", "warn");
  const g = safety.group("svg-safety", "SVG safety check", "What the picture file contains that could be risky. Nothing was run.");
  return { rows, groups: g ? [g] : [] };
}
