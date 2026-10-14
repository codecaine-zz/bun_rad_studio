// Previews. Markdown is turned into page elements from the reader's tree (never from HTML text); links and
// pictures are shown as text with their address in the tooltip, so nothing in a document can make the app navigate or
// load anything. HTML is shown as coloured source (the page can't embed it safely).
import { h } from "./dom.js";
import { parseMarkdown, tokenizeText } from "./codeLogic.js";

const PLAIN_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "hr", "em", "strong", "del", "thead", "tbody", "tr", "ul", "ol", "li", "table"]);

function build(node) {
  switch (node.tag) {
    case "#text": return document.createTextNode(node.text);
    case "#inline": {
      const frag = document.createDocumentFragment();
      for (const c of node.children) frag.append(build(c));
      return frag;
    }
    case "br": return h("br");
    case "code": return h("code", { class: "code-md-code" }, node.text);
    case "pre": return h("pre", { class: "code-md-pre", "data-lang": node.lang || null }, h("code", {}, node.text));
    case "a": return h("span", { class: "code-md-link", title: node.href ? `Link to ${node.href}` : "Link", tabindex: "0" }, node.children.map(build));
    case "img": return h("span", { class: "code-md-img", title: node.src ? `Picture: ${node.src}` : "Picture" }, `[picture${node.alt ? `: ${node.alt}` : ""}]`);
    case "th":
    case "td": return h(node.tag, { class: node.align ? `code-al-${node.align}` : null }, node.children.map(build));
    case "li": return h("li", { class: node.checked !== undefined ? "code-md-task" : null }, node.checked !== undefined ? h("span", { "aria-label": node.checked ? "done" : "not done" }, node.checked ? "☑ " : "☐ ") : null, node.children.map(build));
    case "ol": return h("ol", { start: node.start > 1 ? String(node.start) : null }, node.children.map(build));
    default:
      if (PLAIN_TAGS.has(node.tag)) return h(node.tag, {}, (node.children ?? []).map(build));
      return h("span", {}, (node.children ?? []).map(build));
  }
}

/** Fills `container` with the formatted Markdown. */
export function renderMarkdown(container, source) {
  const { nodes, truncated } = parseMarkdown(source);
  container.replaceChildren(...nodes.map(build));
  if (truncated) container.append(h("p", { class: "code-hint" }, "The preview shows only the first part of this long document."));
}

const MAX_LINES = 5000;

/** Fills `container` with coloured, read-only source text. */
export function renderSource(container, text, lang) {
  const lines = tokenizeText(lang, text.length > 2_000_000 ? text.slice(0, 2_000_000) : text);
  const frag = document.createDocumentFragment();
  lines.slice(0, MAX_LINES).forEach((tokens, i) => {
    const row = h("div", { class: "code-pv-line" }, h("span", { class: "code-pv-ln" }, String(i + 1)));
    for (const t of tokens) row.append(t.type ? h("span", { class: `code-t-${t.type}` }, t.text) : document.createTextNode(t.text));
    frag.append(row);
  });
  container.replaceChildren(frag);
  if (lines.length > MAX_LINES) container.append(h("p", { class: "code-hint" }, `Only the first ${MAX_LINES.toLocaleString()} lines are shown here.`));
}
