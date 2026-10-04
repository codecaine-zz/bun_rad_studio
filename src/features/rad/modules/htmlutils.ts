/**
 * htmlutils — HTML escaping, text extraction, scraping and safe generation.
 *
 * Extraction helpers (`selectAll`, `extractLinks`, `extractMeta`, …) run on Bun's native,
 * spec-compliant streaming `HTMLRewriter`, so they cope with real-world markup (attribute
 * order, unquoted values, odd whitespace). `getElementById`/`getElementsByTag` remain
 * regex-based because they return the element's raw source.
 *
 * Generation helpers (`safeHtml`, `buildTag`) escape every interpolated value by default —
 * wrap trusted markup in {@link rawHtml} to opt out.
 *
 * @example
 * import { htmlutils } from "./src/features/rad/index.ts";
 * const card = htmlutils.safeHtml`<p class="bio">${userInput}</p>`; // userInput escaped
 */

/** Element snapshot produced by {@link selectAll}. */
export interface HtmlElementInfo {
  tag: string;
  attrs: Record<string, string>;
  text: string;
}

/** Hyperlink extracted by {@link extractLinks}. */
export interface HtmlLink {
  href: string;
  text: string;
  /** Present only when the anchor has a `rel` attribute. */
  rel?: string;
}

/** Page metadata extracted by {@link extractMeta}. */
export interface HtmlMeta {
  title?: string;
  description?: string;
  canonical?: string;
  lang?: string;
  /** All `<meta name|property=… content=…>` pairs (e.g. `og:title`, `twitter:card`). */
  tags: Record<string, string>;
}

/** Marker for trusted HTML that must not be escaped. */
export interface RawHtml {
  readonly __rawHtml: string;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", euro: "€", deg: "°",
};
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape `& < > " '` (native `Bun.escapeHTML`). @example htmlutils.escapeHtml("<script>"); // "&lt;script&gt;" */
export function escapeHtml(str: string): string {
  return Bun.escapeHTML(str);
}

/**
 * Decode named (`&amp;`, `&nbsp;`, `&copy;`…), decimal (`&#39;`) and hex (`&#x27;`) entities in one pass
 * (no double-decoding of `&amp;lt;`). Unknown entities are left untouched.
 * @example htmlutils.unescapeHtml("&lt;b&gt;Tom &amp; Jerry&#x27;s&lt;/b&gt;"); // "<b>Tom & Jerry's</b>"
 */
export function unescapeHtml(str: string): string {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

/** Remove all tags (content kept) and trim. @example htmlutils.stripTags("<p>Hello <b>World</b></p>"); // "Hello World" */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Readable plain text: drops `<script>/<style>/<head>`/comments, turns block elements and `<br>`
 * into newlines, list items into `• `, decodes entities and collapses whitespace.
 * @example htmlutils.htmlToText("<h1>Hi</h1><p>a&nbsp;b</p><ul><li>x</li></ul>"); // "Hi\n\na b\n\n• x"
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head|noscript|template)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/?(p|div|section|article|header|footer|h[1-6]|ul|ol|table|tr|blockquote|pre)\b[^>]*>/gi, "\n\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]*>/g, "");
  return unescapeHtml(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, (m) => (m.includes("\t") ? "\t" : " "))
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse an attribute string (or full opening tag) into a record. Valueless attributes map to `""`.
 * @example htmlutils.parseAttributes('<input type="checkbox" checked data-id=7>'); // { type: "checkbox", checked: "", "data-id": "7" }
 */
export function parseAttributes(tagOrAttrs: string): Record<string, string> {
  const body = tagOrAttrs.replace(/^\s*<\s*[\w:-]+/, "").replace(/\/?>\s*$/, "");
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    out[m[1]!.toLowerCase()] = unescapeHtml(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/**
 * CSS-selector query over HTML via native `HTMLRewriter` (supports tag, `.class`, `#id`, `[attr=v]`,
 * descendant & child combinators, `:nth-child`, …). Text is the decoded, trimmed inner text.
 * @example htmlutils.selectAll('<ul><li class="x">A</li><li>B</li></ul>', "li.x"); // [{ tag: "li", attrs: { class: "x" }, text: "A" }]
 */
export function selectAll(html: string, selector: string): HtmlElementInfo[] {
  const found: HtmlElementInfo[] = [];
  const open: HtmlElementInfo[] = [];
  new HTMLRewriter()
    .on(selector, {
      element(el) {
        const info: HtmlElementInfo = { tag: el.tagName.toLowerCase(), attrs: Object.fromEntries(el.attributes), text: "" };
        found.push(info);
        if (el.selfClosing || VOID_TAGS.has(info.tag)) return;
        open.push(info);
        el.onEndTag(() => { open.splice(open.indexOf(info), 1); });
      },
      text(chunk) {
        for (const info of open) info.text += chunk.text;
      },
    })
    .transform(html);
  for (const f of found) f.text = unescapeHtml(f.text).replace(/\s+/g, " ").trim();
  return found;
}

/** First match of {@link selectAll} or `null`. @example htmlutils.selectFirst(html, "title")?.text; */
export function selectFirst(html: string, selector: string): HtmlElementInfo | null {
  return selectAll(html, selector)[0] ?? null;
}

/**
 * All `<a href>` links. Pass `baseUrl` to resolve relative hrefs to absolute URLs.
 * @example htmlutils.extractLinks('<a href="/docs">Docs</a>', "https://bun.sh"); // [{ href: "https://bun.sh/docs", text: "Docs" }]
 */
export function extractLinks(html: string, baseUrl?: string): HtmlLink[] {
  return selectAll(html, "a[href]").map((a) => {
    let href = a.attrs.href ?? "";
    if (baseUrl) {
      try { href = new URL(href, baseUrl).href; } catch { /* keep raw href */ }
    }
    return a.attrs.rel !== undefined ? { href, text: a.text, rel: a.attrs.rel } : { href, text: a.text };
  });
}

/** All `<img>` sources with alt text. @example htmlutils.extractImages('<img src="a.png" alt="A">'); // [{ src: "a.png", alt: "A" }] */
export function extractImages(html: string, baseUrl?: string): { src: string; alt: string }[] {
  return selectAll(html, "img[src]").map((img) => {
    let src = img.attrs.src ?? "";
    if (baseUrl) {
      try { src = new URL(src, baseUrl).href; } catch { /* keep raw src */ }
    }
    return { src, alt: img.attrs.alt ?? "" };
  });
}

/** Outline of `<h1>`–`<h6>`. @example htmlutils.extractHeadings("<h1>A</h1><h2>B</h2>"); // [{ level: 1, text: "A" }, { level: 2, text: "B" }] */
export function extractHeadings(html: string): { level: number; text: string }[] {
  return selectAll(html, "h1, h2, h3, h4, h5, h6").map((h) => ({ level: Number(h.tag.slice(1)), text: h.text }));
}

/**
 * SEO / social metadata: `<title>`, description, canonical, `<html lang>`, and every meta tag.
 * @example htmlutils.extractMeta('<title>Bun</title><meta property="og:type" content="website">').tags["og:type"]; // "website"
 */
export function extractMeta(html: string): HtmlMeta {
  const meta: HtmlMeta = { tags: {} };
  for (const m of selectAll(html, "meta[content]")) {
    const key = m.attrs.name ?? m.attrs.property ?? m.attrs["http-equiv"];
    if (key) meta.tags[key] = m.attrs.content ?? "";
  }
  const title = selectFirst(html, "title")?.text;
  if (title) meta.title = title;
  const description = meta.tags.description ?? meta.tags["og:description"];
  if (description) meta.description = description;
  const canonical = selectFirst(html, 'link[rel="canonical"]')?.attrs.href;
  if (canonical) meta.canonical = canonical;
  const lang = selectFirst(html, "html[lang]")?.attrs.lang;
  if (lang) meta.lang = lang;
  return meta;
}

/** First element with `id` (regex-based; returns raw source). @example htmlutils.getElementById('<div id="main">Hi</div>', "main")?.text; // "Hi" */
export function getElementById(html: string, id: string): { id: string; tag: string; text: string; raw: string } | null {
  const regex = new RegExp(`<([a-zA-Z0-9]+)[^>]*\\bid=["']${escapeRe(id)}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  const match = html.match(regex);
  if (!match) return null;
  return { id, tag: match[1]!.toLowerCase(), text: stripTags(match[2]!), raw: match[0]! };
}

/** Every `<tag>…</tag>` (regex-based; nested same-name tags are not balanced). @example htmlutils.getElementsByTag("<li>a</li><li>b</li>", "li").length; // 2 */
export function getElementsByTag(html: string, tag: string): { tag: string; text: string; raw: string }[] {
  const t = escapeRe(tag);
  const regex = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`, "gi");
  return Array.from(html.matchAll(regex), (m) => ({ tag: tag.toLowerCase(), text: stripTags(m[1] ?? ""), raw: m[0] ?? "" }));
}

/** Mark trusted markup so {@link safeHtml}/{@link buildTag} don't escape it. @example htmlutils.rawHtml("<b>ok</b>"); */
export function rawHtml(html: string): RawHtml {
  return { __rawHtml: html };
}

function renderValue(v: unknown): string {
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.map(renderValue).join("");
  if (typeof v === "object" && "__rawHtml" in (v as object)) return (v as RawHtml).__rawHtml;
  return Bun.escapeHTML(String(v));
}

/**
 * Tagged template that escapes every interpolation (arrays are joined; `null`/`false` render nothing).
 * Returns a {@link RawHtml} so results compose without double-escaping; call `.toString()` / `String()` for text.
 * @example String(htmlutils.safeHtml`<ul>${["<a>", "b"].map((x) => htmlutils.safeHtml`<li>${x}</li>`)}</ul>`); // "<ul><li>&lt;a&gt;</li><li>b</li></ul>"
 */
export function safeHtml(strings: TemplateStringsArray, ...values: unknown[]): RawHtml & { toString(): string } {
  const out = strings.reduce((acc, s, i) => acc + s + (i < values.length ? renderValue(values[i]) : ""), "");
  return { __rawHtml: out, toString: () => out };
}

/**
 * Build one element. Attribute values are escaped; `true` → bare attribute, `false`/`null` → omitted.
 * Children are escaped unless wrapped with {@link rawHtml}. Void tags (`img`, `br`, …) never get children.
 * @example htmlutils.buildTag("a", { href: "/x?a=1&b=2", target: "_blank" }, "Go"); // '<a href="/x?a=1&amp;b=2" target="_blank">Go</a>'
 */
export function buildTag(tag: string, attrs: Record<string, string | number | boolean | null | undefined> = {}, ...children: unknown[]): string {
  if (!/^[a-zA-Z][\w:-]*$/.test(tag)) throw new Error(`[htmlutils.buildTag] Invalid tag name "${tag}"`);
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== false && v != null)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${Bun.escapeHTML(String(v))}"`))
    .join("");
  if (VOID_TAGS.has(tag.toLowerCase())) return `<${tag}${attrStr}>`;
  return `<${tag}${attrStr}>${children.map(renderValue).join("")}</${tag}>`;
}

/** Namespace bundle. */
export const htmlutils = {
  escapeHtml,
  unescapeHtml,
  stripTags,
  htmlToText,
  parseAttributes,
  selectAll,
  selectFirst,
  extractLinks,
  extractImages,
  extractHeadings,
  extractMeta,
  getElementById,
  getElementsByTag,
  rawHtml,
  safeHtml,
  buildTag,
};
