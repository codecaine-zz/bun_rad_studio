/**
 * Markdown to a web page with Bun's own renderer (`Bun.markdown.html`), which understands more than the built-in
 * one: nested lists, tables, task lists, strikethrough, web addresses that become links, reference-style links
 * and "Title\n=====" headings. The built-in renderer (fmConvText.markdownToHtml) stays as the fallback.
 *
 * Bun's renderer is not made to be safe by itself: it writes `javascript:` and `data:` addresses as they are. So
 * raw HTML in the Markdown is switched off (it comes out as plain text), every address is checked with `safeUrl`,
 * and the result is checked once more for any tag or attribute the renderer should never produce. If anything is
 * wrong, or Bun can't render, the built-in renderer is used instead.
 */
import { markdownPage, markdownToHtml, safeUrl } from "./fmConvText";

export type MarkdownEngine = "bun" | "builtin";

const OPTIONS = { noHtmlBlocks: true, noHtmlSpans: true, tagFilter: true, autolinks: true, headings: { ids: true } } as const;

const TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "em", "strong", "code", "pre", "img", "br", "hr", "ul", "ol", "li", "blockquote", "del", "table", "thead", "tbody", "tr", "th", "td", "input"]);
const ATTRIBUTES = new Set(["href", "src", "alt", "title", "id", "class", "align", "rel", "type", "disabled", "checked", "start"]);

const decodeAttribute = (value: string) => value.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Makes every link and picture address safe, adds rel="noopener noreferrer" to links. */
export function sanitizeRenderedHtml(html: string): string {
  return html
    .replace(/<a href="([^"]*)"/g, (_m, url: string) => (safeUrl(decodeAttribute(url)) !== null ? `<a href="${url}" rel="noopener noreferrer"` : "<a"))
    .replace(/<img src="([^"]*)"/g, (_m, url: string) => (safeUrl(decodeAttribute(url), true) !== null ? `<img src="${url}"` : "<img"));
}

/** True when the HTML contains only the tags and attributes the Markdown renderer is expected to write. */
export function onlyExpectedMarkup(html: string): boolean {
  for (const m of html.matchAll(/<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[^<>]*?)?)\s*\/?>/g)) {
    if (!TAGS.has(m[2]!.toLowerCase())) return false;
    for (const a of m[3]!.matchAll(/\s([^\s=]+)(?:="[^"]*")?/g)) if (!ATTRIBUTES.has(a[1]!.toLowerCase())) return false;
  }
  // Every "<" that starts something must have been matched above: a stray one means a tag the pattern didn't understand.
  return !/<(?![/]?(?:h[1-6]|p|a|em|strong|code|pre|img|br|hr|ul|ol|li|blockquote|del|table|thead|tbody|tr|th|td|input)[\s>/])/i.test(html);
}

/** The Markdown as a finished web page, and which renderer made it. */
export function renderMarkdownPage(md: string, title: string): { html: string; engine: MarkdownEngine } {
  const text = md.replace(/^\ufeff/, "");
  try {
    const rendered = (Bun as { markdown?: { html(input: string, options?: object): string } }).markdown?.html(text, OPTIONS);
    if (typeof rendered === "string") {
      const fragment = sanitizeRenderedHtml(rendered).trim();
      if (onlyExpectedMarkup(fragment)) return { html: markdownPage(fragment, title), engine: "bun" };
    }
  } catch {
    // fall through to the built-in renderer
  }
  return { html: markdownToHtml(text, title).html, engine: "builtin" };
}
