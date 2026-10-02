// Doer: Escape HTML entities (&, <, >, ", ') using native Bun.escapeHTML
export function escapeHtml(str: string): string {
  return Bun.escapeHTML(str);
}

// Doer: Unescape HTML entities
export function unescapeHtml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Doer: Strip all HTML markup tags from string
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// Coordinator: Extract all hyperlinks from HTML
export function extractLinks(html: string): { href: string; text: string }[] {
  const regex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
  const links: { href: string; text: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    links.push({
      href: match[1] || "",
      text: stripTags(match[2] || ""),
    });
  }
  return links;
}

// Coordinator: Find element by id attribute
export function getElementById(
  html: string,
  id: string
): { id: string; tag: string; text: string; raw: string } | null {
  const regex = new RegExp(`<([a-zA-Z0-9]+)[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  const match = html.match(regex);
  if (!match) return null;
  return {
    id,
    tag: match[1]!.toLowerCase(),
    text: stripTags(match[2]!),
    raw: match[0]!,
  };
}

// Coordinator: Find all elements by HTML tag name
export function getElementsByTag(
  html: string,
  tag: string
): { tag: string; text: string; raw: string }[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const elements: { tag: string; text: string; raw: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    elements.push({
      tag: tag.toLowerCase(),
      text: stripTags(match[1] || ""),
      raw: match[0] || "",
    });
  }
  return elements;
}

export const htmlutils = {
  escapeHtml,
  unescapeHtml,
  stripTags,
  extractLinks,
  getElementById,
  getElementsByTag,
};
