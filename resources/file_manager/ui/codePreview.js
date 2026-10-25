// Previews. Markdown is turned into page elements from the reader's tree (never from HTML text); links and
// pictures are shown as text with their address in the tooltip, so nothing in a document can make the app navigate or
// load anything. HTML is shown as colored source. JSON gets an interactive tree explorer, CSV/TSV gets a sortable
// table, and code files get a live inspector (unsaved diff summary, outline, and TODOs).
import { h } from "./dom.js";
import { computeLineDiff, extractSymbols, extractTodos, parseCsvTable, parseMarkdown, tokenizeText } from "./codeLogic.js";

const PLAIN_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "hr", "em", "strong", "del", "thead", "tbody", "tr", "ul", "ol", "li", "table"]);

function safeLinkHref(href) {
  if (typeof href !== "string") return "";
  const trimmed = href.trim();
  const normalized = trimmed.replace(/[\u0000-\u0020]+/g, "");
  if (!normalized || /^(?:javascript|vbscript|data|file|blob):/i.test(normalized)) return "";
  return trimmed;
}

export function slugifyMarkdownHeading(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

export function normalizeMarkdownSlug(text) {
  return slugifyMarkdownHeading(text)
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nodePlainText(node) {
  if (!node) return "";
  if (node.tag === "#text" || node.tag === "code") return String(node.text ?? "");
  if (node.tag === "img") return String(node.alt ?? "");
  return (node.children ?? []).map(nodePlainText).join("");
}

/**
 * Opens a full-window interactive zoom lightbox for a Markdown or SVG preview image.
 * Supports a 25%–800% zoom slider, +/- buttons, 100% reset, mouse-wheel zoom, drag-to-pan, and keyboard shortcuts.
 */
export function openMarkdownImageLightbox(src, altText = "Picture") {
  document.querySelector(".code-md-lightbox")?.remove();
  let lbZoom = 100;
  const lbImg = h("img", {
    class: "code-md-lb-img",
    src,
    alt: altText,
  });
  const lbStage = h("div", { class: "code-md-lb-stage", tabindex: "0", "aria-label": `Zoomed view of ${altText}` }, lbImg);
  const lbRange = h("input", {
    type: "range",
    class: "code-md-lb-range",
    min: "25",
    max: "800",
    step: "25",
    value: "100",
    "aria-label": "Lightbox zoom level",
    title: "Slide to zoom image (25% – 800%)",
  });
  const lbReset = h("button", {
    type: "button",
    class: "code-btn code-small code-md-lb-reset",
    title: "Reset zoom to 100% (0)",
    "aria-label": "Reset zoom",
    onclick: () => setLbZoom(100),
  }, "100%");
  const lbOut = h("button", {
    type: "button",
    class: "code-btn code-small code-md-lb-out",
    title: "Zoom out (−)",
    "aria-label": "Zoom out",
    onclick: () => setLbZoom(lbZoom - 25),
  }, "−");
  const lbIn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-lb-in",
    title: "Zoom in (+)",
    "aria-label": "Zoom in",
    onclick: () => setLbZoom(lbZoom + 25),
  }, "+");
  const closeLb = () => {
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
  };
  const lbClose = h("button", {
    type: "button",
    class: "code-btn code-small code-md-lb-close",
    title: "Close zoom viewer (Esc)",
    "aria-label": "Close zoom viewer",
    onclick: closeLb,
  }, "✕ Close");

  function setLbZoom(next) {
    lbZoom = Math.max(25, Math.min(800, Math.round(next)));
    lbRange.value = String(lbZoom);
    lbReset.textContent = `${lbZoom}%`;
    overlay.dataset.zoom = String(lbZoom);
    if (lbZoom === 100) {
      lbImg.style.width = "";
      lbImg.style.maxWidth = "";
      lbImg.style.maxHeight = "";
    } else {
      lbImg.style.width = `${lbZoom}%`;
      lbImg.style.maxWidth = "none";
      lbImg.style.maxHeight = "none";
    }
  }

  lbRange.addEventListener("input", () => setLbZoom(Number(lbRange.value)));
  lbStage.addEventListener("wheel", (e) => {
    e.preventDefault();
    setLbZoom(lbZoom + (e.deltaY < 0 ? 25 : -25));
  }, { passive: false });

  let pan = null;
  lbStage.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    pan = { x: e.clientX, y: e.clientY, sl: lbStage.scrollLeft, st: lbStage.scrollTop };
  });
  lbStage.addEventListener("mousemove", (e) => {
    if (!pan) return;
    lbStage.scrollLeft = pan.sl - (e.clientX - pan.x);
    lbStage.scrollTop = pan.st - (e.clientY - pan.y);
  });
  const endPan = () => { pan = null; };
  lbStage.addEventListener("mouseup", endPan);
  lbStage.addEventListener("mouseleave", endPan);

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeLb();
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setLbZoom(lbZoom + 25);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setLbZoom(lbZoom - 25);
    } else if (e.key === "0") {
      e.preventDefault();
      setLbZoom(100);
    }
  }
  window.addEventListener("keydown", onKey, true);

  const bar = h("div", { class: "code-md-lb-bar", role: "toolbar", "aria-label": "Lightbox zoom controls" },
    h("strong", { class: "code-md-lb-title" }, altText),
    h("span", { class: "code-grow" }),
    lbOut,
    lbRange,
    lbIn,
    lbReset,
    lbClose,
  );
  const overlay = h("div", {
    class: "code-md-lightbox",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": `Image zoom viewer: ${altText}`,
    dataset: { zoom: "100" },
    onclick: (e) => { if (e.target === overlay) closeLb(); },
  }, bar, lbStage);

  document.body.append(overlay);
  lbStage.focus();
  return overlay;
}

/**
 * Builds an inline zoomable image wrapper with a zoom toolbar (−, range slider, +, 100% reset, and ⛶ Fullscreen Lightbox),
 * plus click-to-zoom, wheel zoom, and drag-to-pan when zoomed in.
 */
export function createZoomableImage(resolved, altText = "Picture", titleText = "Picture", rawAlt = "") {
  let zoom = 100;
  let dragged = false;
  const wrap = h("span", {
    class: "code-md-img",
    dataset: { zoom: "100" },
    title: titleText,
  });
  const img = h("img", {
    class: "code-md-image",
    src: resolved,
    alt: altText,
    title: "Click to toggle zoom (100% / 200%), double-click to open full zoom viewer, or use the zoom controls below",
    onerror: () => {
      if (!img.dataset.retried && resolved.includes("/api/raw?")) {
        img.dataset.retried = "1";
        img.src = `${resolved}&convert=1`;
        return;
      }
      wrap.replaceChildren(`[picture${rawAlt ? `: ${rawAlt}` : ""}]`);
    },
    onclick: (e) => {
      if (dragged) {
        dragged = false;
        return;
      }
      e.stopPropagation();
      setZoom(zoom === 100 ? 200 : 100);
    },
    ondblclick: (e) => {
      e.stopPropagation();
      openMarkdownImageLightbox(img.src || resolved, altText);
    },
  });
  const stage = h("span", { class: "code-md-img-stage" }, img);
  const zoomOutBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-zoom-out",
    title: "Zoom out (−25%)",
    "aria-label": "Zoom out",
    onclick: (e) => { e.stopPropagation(); setZoom(zoom - 25); },
  }, "−");
  const zoomRange = h("input", {
    type: "range",
    class: "code-md-zoom-range",
    min: "25",
    max: "400",
    step: "25",
    value: "100",
    title: "Slide to zoom image (25% – 400%)",
    "aria-label": "Image zoom level",
    oninput: (e) => { e.stopPropagation(); setZoom(Number(zoomRange.value)); },
    onclick: (e) => e.stopPropagation(),
  });
  const zoomInBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-zoom-in",
    title: "Zoom in (+25%)",
    "aria-label": "Zoom in",
    onclick: (e) => { e.stopPropagation(); setZoom(zoom + 25); },
  }, "+");
  const zoomPctBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-zoom-pct",
    title: "Click to reset image zoom to 100%",
    "aria-label": "Reset image zoom",
    onclick: (e) => { e.stopPropagation(); setZoom(100); },
  }, "100%");
  const lightboxBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-zoom-lightbox",
    title: "Open image in full zoom viewer",
    "aria-label": "Expand image",
    onclick: (e) => { e.stopPropagation(); openMarkdownImageLightbox(img.src || resolved, altText); },
  }, "⛶");

  function setZoom(next) {
    zoom = Math.max(25, Math.min(400, Math.round(next)));
    wrap.dataset.zoom = String(zoom);
    wrap.classList.toggle("is-zoomed", zoom !== 100);
    zoomRange.value = String(zoom);
    zoomPctBtn.textContent = `${zoom}%`;
    if (zoom === 100) {
      img.style.width = "";
      img.style.maxWidth = "";
      img.style.maxHeight = "";
    } else {
      img.style.width = `${zoom}%`;
      img.style.maxWidth = "none";
      img.style.maxHeight = "none";
    }
  }

  stage.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey && zoom === 100) return;
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 25 : -25));
  }, { passive: false });

  let pan = null;
  stage.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || zoom <= 100) return;
    pan = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop };
    dragged = false;
  });
  stage.addEventListener("mousemove", (e) => {
    if (!pan) return;
    const dx = e.clientX - pan.x;
    const dy = e.clientY - pan.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged = true;
    stage.scrollLeft = pan.sl - dx;
    stage.scrollTop = pan.st - dy;
  });
  const stopPan = () => { pan = null; };
  stage.addEventListener("mouseup", stopPan);
  stage.addEventListener("mouseleave", stopPan);

  const bar = h("span", { class: "code-md-img-bar", role: "toolbar", "aria-label": "Image zoom controls" },
    zoomOutBtn,
    zoomRange,
    zoomInBtn,
    zoomPctBtn,
    lightboxBtn,
  );
  wrap.append(stage, bar);
  return wrap;
}

function build(node, ctx) {
  const { onOpenLink, resolveImageSrc, onAnchorClick, nextHeadingMeta } = ctx;
  switch (node.tag) {
    case "#text": return document.createTextNode(node.text);
    case "#inline": {
      const frag = document.createDocumentFragment();
      for (const c of node.children) frag.append(build(c, ctx));
      return frag;
    }
    case "br": return h("br");
    case "code": return h("code", { class: "code-md-code" }, node.text);
    case "pre": return h("pre", { class: "code-md-pre", "data-lang": node.lang || null }, h("code", {}, node.text));
    case "a": {
      const href = safeLinkHref(node.href);
      const clickable = Boolean(href && onOpenLink);
      const activate = clickable
        ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (href.startsWith("#") && onAnchorClick) {
              if (onAnchorClick(href.slice(1))) return;
            }
            onOpenLink(href);
          }
        : null;
      return h("span", {
        class: "code-md-link",
        role: clickable ? "link" : null,
        title: href ? (clickable ? `Click to open ${href}` : `Link to ${href}`) : "Link",
        tabindex: "0",
        onclick: activate,
        onkeydown: clickable ? (e) => { if (e.key === "Enter" || e.key === " ") activate(e); } : null,
      }, node.children.map((c) => build(c, ctx)));
    }
    case "img": {
      const resolved = resolveImageSrc ? resolveImageSrc(node.src) : "";
      if (resolved) {
        return createZoomableImage(resolved, node.alt || node.src || "Picture", node.src ? `Picture: ${node.src}` : "Picture", node.alt);
      }
      return h("span", { class: "code-md-img", title: node.src ? `Picture: ${node.src}` : "Picture" }, `[picture${node.alt ? `: ${node.alt}` : ""}]`);
    }
    case "th":
    case "td": return h(node.tag, { class: node.align ? `code-al-${node.align}` : null }, node.children.map((c) => build(c, ctx)));
    case "li": return h("li", { class: node.checked !== undefined ? "code-md-task" : null }, node.checked !== undefined ? h("span", { "aria-label": node.checked ? "done" : "not done" }, node.checked ? "☑ " : "☐ ") : null, node.children.map((c) => build(c, ctx)));
    case "ol": return h("ol", { start: node.start > 1 ? String(node.start) : null }, node.children.map((c) => build(c, ctx)));
    default:
      if (/^h[1-6]$/.test(node.tag) && nextHeadingMeta) {
        const meta = nextHeadingMeta(node);
        const anchor = h("button", {
          type: "button",
          class: "code-md-anchor",
          title: `Jump to section "${meta.text}"`,
          "aria-label": `Jump to section ${meta.text}`,
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            meta.onJump?.();
          },
        }, "#");
        const el = h(node.tag, {
          class: "code-md-heading",
          dataset: { slug: meta.slug, line: String(meta.line) },
        }, anchor, ...(node.children ?? []).map((c) => build(c, ctx)));
        meta.el = el;
        return el;
      }
      if (node.tag === "p" && onAnchorClick && node.children?.length === 1 && node.children[0].tag === "#text") {
        const rawP = String(node.children[0].text ?? "");
        const anchorMatch = /^\s*<a\s+(?:id|name)=["']([^"']+)["']\s*>\s*<\/a>\s*$/i.exec(rawP);
        if (anchorMatch) {
          return h("span", { class: "code-md-anchor-target", dataset: { anchorId: anchorMatch[1] }, hidden: true });
        }
        const linkMatch = /^\s*(?:<div[^>]*>\s*)?<a\s+href=["'](#[^"']+)["']\s*>([^<]+)<\/a>(?:\s*<\/div>)?\s*$/i.exec(rawP);
        if (linkMatch) {
          return h("p", {}, build({ tag: "a", href: linkMatch[1], children: [{ tag: "#text", text: linkMatch[2] }] }, ctx));
        }
      }
      if (PLAIN_TAGS.has(node.tag)) return h(node.tag, {}, (node.children ?? []).map((c) => build(c, ctx)));
      return h("span", {}, (node.children ?? []).map((c) => build(c, ctx)));
  }
}

/**
 * Fills `container` with the formatted Markdown.
 * When `options` is omitted (e.g. Secrets notes), renders plain static nodes with no links, images or navigation toolbar.
 * When `options` is provided, renders GitHub-style easy navigation (Outline TOC, Prev/Next section, Back, Top, heading
 * `#` anchors, and Preview / Plain text toggle) plus clickable links and inline image previews.
 */
export function renderMarkdown(container, source, options) {
  const { nodes, truncated } = parseMarkdown(source);
  if (!options) {
    container.replaceChildren(...nodes.map((n) => build(n, {})));
    if (truncated) container.append(h("p", { class: "code-hint" }, "The preview shows only the first part of this long document."));
    return;
  }

  const {
    onOpenLink,
    onGoLine,
    resolveImageSrc,
    mode: initialMode = "preview",
    onModeChange,
    syncScroll: initialSyncScroll = true,
    onSyncScrollChange,
    nav = true,
  } = options;

  const mdSymbols = extractSymbols(source ?? "", "markdown");
  let symCursor = 0;
  const slugCounts = new Map();
  const headings = [];
  const navStack = [];
  let activeIdx = -1;
  let currentMode = initialMode === "plain" ? "plain" : "preview";
  let syncScrollOn = initialSyncScroll !== false;

  function nextHeadingMeta(node) {
    const level = Number(node.tag.slice(1)) || 1;
    const text = nodePlainText(node).trim() || `Section ${headings.length + 1}`;
    const baseSlug = slugifyMarkdownHeading(text) || `section-${headings.length + 1}`;
    const seen = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, seen + 1);
    const slug = seen === 0 ? baseSlug : `${baseSlug}-${seen}`;
    let line = 1;
    for (let i = symCursor; i < mdSymbols.length; i++) {
      if (mdSymbols[i].name.trim() === text || slugifyMarkdownHeading(mdSymbols[i].name) === baseSlug) {
        line = mdSymbols[i].line;
        symCursor = i + 1;
        break;
      }
    }
    const idx = headings.length;
    const meta = {
      idx,
      level,
      text,
      slug,
      line,
      el: null,
      onJump: () => jumpToHeadingIndex(idx, { recordHistory: true }),
    };
    headings.push(meta);
    return meta;
  }

  function jumpToSlug(rawFrag) {
    let frag = String(rawFrag ?? "").trim();
    try { frag = decodeURIComponent(frag); } catch {}
    const wanted = slugifyMarkdownHeading(frag);
    const wantedNorm = normalizeMarkdownSlug(frag);
    if (!wanted && !wantedNorm) return false;
    const found =
      headings.find(
        (item) =>
          item.slug === wanted ||
          (wantedNorm && normalizeMarkdownSlug(item.slug) === wantedNorm) ||
          slugifyMarkdownHeading(item.text) === wanted ||
          (wantedNorm && normalizeMarkdownSlug(item.text) === wantedNorm) ||
          item.text.toLowerCase() === frag.toLowerCase(),
      ) ??
      (wantedNorm && wantedNorm.length >= 3
        ? headings.find(
            (item) =>
              item.slug.startsWith(`${wanted}-`) ||
              normalizeMarkdownSlug(item.slug).startsWith(`${wantedNorm}-`),
          )
        : null);
    if (found) {
      jumpToHeadingIndex(found.idx, { recordHistory: true });
      return true;
    }
    if (wantedNorm === "top") {
      if (activeIdx >= 0) {
        navStack.push(activeIdx);
        backBtn.hidden = false;
      }
      activeIdx = -1;
      container.scrollTop = 0;
      contentEl.scrollTop = 0;
      if (headings[0]?.el) headings[0].el.scrollIntoView?.({ behavior: "smooth", block: "start" });
      updateNavState();
      onGoLine?.(1, 1);
      return true;
    }
    const esc = frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const anchorRe = new RegExp(`(?:id|name)=["']${esc}["']`, "i");
    const srcLines = String(source ?? "").split(/\r\n|\r|\n/);
    const anchorLineIdx = srcLines.findIndex((l) => anchorRe.test(l));
    if (anchorLineIdx >= 0) {
      const anchorLine = anchorLineIdx + 1;
      const near = headings.find((hItem) => hItem.line >= anchorLine) ?? headings.at(-1);
      if (near) jumpToHeadingIndex(near.idx, { recordHistory: true });
      onGoLine?.(anchorLine, 1);
      return true;
    }
    return false;
  }

  const ctx = {
    onOpenLink,
    resolveImageSrc,
    onAnchorClick: (frag) => jumpToSlug(frag),
    nextHeadingMeta: nav ? nextHeadingMeta : null,
  };

  const contentEl = h("div", { class: "code-md-content" }, ...nodes.map((n) => build(n, ctx)));
  if (truncated) contentEl.append(h("p", { class: "code-hint" }, "The preview shows only the first part of this long document."));

  if (!nav) {
    container.replaceChildren(contentEl);
    return;
  }

  const plainEl = options.plainEl ?? h("pre", {
    class: "code-md-plain",
    tabindex: "0",
    "aria-label": "Markdown plain text",
  }, source || "(An empty file.)");
  plainEl.hidden = currentMode !== "plain";
  contentEl.hidden = currentMode === "plain";

  const tocFilter = h("input", {
    type: "text",
    class: "code-in code-md-toc-filter",
    placeholder: "Filter headings…",
    "aria-label": "Filter headings",
  });
  const tocList = h("div", { class: "code-md-toc-list", role: "navigation", "aria-label": "Table of contents" });
  const tocDrawer = h("div", { class: "code-md-toc", hidden: true }, tocFilter, tocList);

  const tocBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-toc-btn",
    "aria-expanded": "false",
    disabled: headings.length === 0,
    title: headings.length ? "Show or hide the GitHub-style Table of Contents outline" : "No headings in this Markdown file",
    onclick: () => {
      if (!headings.length) return;
      tocDrawer.hidden = !tocDrawer.hidden;
      tocBtn.setAttribute("aria-expanded", String(!tocDrawer.hidden));
      if (!tocDrawer.hidden) {
        renderTocItems();
        tocFilter.focus();
      }
    },
  }, `☰ Outline (${headings.length})`);

  const prevBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-prev-btn",
    disabled: headings.length === 0,
    title: "Jump to the previous heading section",
    "aria-label": "Previous heading",
    onclick: () => {
      if (!headings.length) return;
      const nextIdx = activeIdx <= 0 ? 0 : activeIdx - 1;
      jumpToHeadingIndex(nextIdx, { recordHistory: false });
    },
  }, "↑ Prev");

  const nextBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-next-btn",
    disabled: headings.length === 0,
    title: "Jump to the next heading section",
    "aria-label": "Next heading",
    onclick: () => {
      if (!headings.length) return;
      const nextIdx = activeIdx < 0 ? 0 : Math.min(headings.length - 1, activeIdx + 1);
      jumpToHeadingIndex(nextIdx, { recordHistory: false });
    },
  }, "↓ Next");

  const backBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-back-btn",
    hidden: true,
    title: "Go back to the previous section before your last jump",
    "aria-label": "Back to previous section",
    onclick: () => {
      if (!navStack.length) return;
      const prev = navStack.pop();
      backBtn.hidden = navStack.length === 0;
      if (typeof prev === "number" && prev >= 0 && headings[prev]) {
        jumpToHeadingIndex(prev, { recordHistory: false });
      } else {
        activeIdx = -1;
        container.scrollTop = 0;
        contentEl.scrollTop = 0;
        updateNavState();
        onGoLine?.(1, 1);
      }
    },
  }, "← Back");

  const topBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-top-btn",
    title: "Scroll back to the top of the document",
    "aria-label": "Back to top",
    onclick: () => {
      if (activeIdx >= 0) {
        navStack.push(activeIdx);
        backBtn.hidden = false;
      }
      activeIdx = -1;
      container.scrollTop = 0;
      contentEl.scrollTop = 0;
      if (headings[0]?.el) headings[0].el.scrollIntoView?.({ behavior: "smooth", block: "start" });
      updateNavState();
      onGoLine?.(1, 1);
    },
  }, "↑ Top");

  const sectionLabel = h("span", { class: "code-md-cur-sec", title: "Current section" }, headings[0] ? headings[0].text : "");

  const syncBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-sync-btn",
    "aria-pressed": String(syncScrollOn),
    title: "Synchronize preview scrolling with the code editor",
    onclick: () => {
      syncScrollOn = !syncScrollOn;
      syncBtn.setAttribute("aria-pressed", String(syncScrollOn));
      onSyncScrollChange?.(syncScrollOn);
    },
  }, "⇅ Sync");

  const previewModeBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-mode-btn",
    dataset: { mdMode: "preview" },
    "aria-pressed": String(currentMode === "preview"),
    title: "Show formatted Markdown preview",
    onclick: () => setMode("preview"),
  }, "Preview");

  const plainModeBtn = h("button", {
    type: "button",
    class: "code-btn code-small code-md-mode-btn",
    dataset: { mdMode: "plain" },
    "aria-pressed": String(currentMode === "plain"),
    title: "Show raw Markdown plain text",
    onclick: () => setMode("plain"),
  }, "Plain text");

  const modeGroup = h("span", { class: "code-md-mode-group", role: "group", "aria-label": "Markdown view mode" }, previewModeBtn, plainModeBtn);

  function setMode(nextMode) {
    currentMode = nextMode === "plain" ? "plain" : "preview";
    const isPlain = currentMode === "plain";
    contentEl.hidden = isPlain;
    plainEl.hidden = !isPlain;
    if (isPlain) {
      tocDrawer.hidden = true;
      tocBtn.setAttribute("aria-expanded", "false");
    }
    previewModeBtn.setAttribute("aria-pressed", String(!isPlain));
    plainModeBtn.setAttribute("aria-pressed", String(isPlain));
    onModeChange?.(currentMode);
  }

  function updateNavState() {
    const cur = activeIdx >= 0 ? headings[activeIdx] : null;
    sectionLabel.textContent = cur ? cur.text : headings[0]?.text ?? "";
    for (const item of headings) {
      item.el?.classList.toggle("code-md-heading-active", item.idx === activeIdx);
    }
    for (const btn of tocList.querySelectorAll(".code-md-toc-item")) {
      btn.classList.toggle("active", Number(btn.dataset.idx) === activeIdx);
    }
  }

  let suppressSyncUntil = 0;

  function jumpToHeadingIndex(idx, { recordHistory = true } = {}) {
    const target = headings[idx];
    if (!target) return;
    if (currentMode === "plain") setMode("preview");
    if (recordHistory && activeIdx !== idx) {
      navStack.push(activeIdx);
      backBtn.hidden = false;
    }
    activeIdx = idx;
    suppressSyncUntil = Date.now() + 250;
    target.el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    updateNavState();
    onGoLine?.(target.line, 1);
  }

  function syncToEditor(topLine = 1, ratio = 0) {
    if (!syncScrollOn || Date.now() < suppressSyncUntil) return;
    let bestIdx = -1;
    for (let i = 0; i < headings.length; i++) {
      if (headings[i].line <= topLine) bestIdx = i;
      else break;
    }
    if (bestIdx !== activeIdx) {
      activeIdx = bestIdx;
      updateNavState();
    }
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    if (maxScroll > 0) {
      container.scrollTop = Math.round(maxScroll * Math.max(0, Math.min(1, ratio)));
    }
  }

  function renderTocItems() {
    const q = tocFilter.value.trim().toLowerCase();
    const minLevel = headings.reduce((m, item) => Math.min(m, item.level), 6);
    const filtered = q ? headings.filter((item) => item.text.toLowerCase().includes(q)) : headings;
    if (!filtered.length) {
      tocList.replaceChildren(h("p", { class: "code-hint" }, "No matching headings."));
      return;
    }
    tocList.replaceChildren(
      ...filtered.map((item) => {
        const indent = Math.max(0, item.level - minLevel);
        const btn = h("button", {
          type: "button",
          class: `code-md-toc-item code-md-toc-lvl-${indent}${item.idx === activeIdx ? " active" : ""}`,
          dataset: { idx: String(item.idx), slug: item.slug },
          title: `Jump to ${item.text} (line ${item.line})`,
          onclick: () => {
            jumpToHeadingIndex(item.idx, { recordHistory: true });
          },
        },
          h("span", { class: "code-md-toc-badge" }, `H${item.level}`),
          h("span", { class: "code-md-toc-text" }, item.text),
          h("span", { class: "code-res-ln" }, `L${item.line}`),
        );
        return btn;
      }),
    );
  }

  tocFilter.addEventListener("input", renderTocItems);
  renderTocItems();

  const toolbar = h("div", { class: "code-md-toolbar", role: "toolbar", "aria-label": "Markdown navigation" },
    tocBtn,
    prevBtn,
    nextBtn,
    backBtn,
    topBtn,
    sectionLabel,
    h("span", { class: "code-grow" }),
    syncBtn,
    modeGroup,
  );

  container.replaceChildren(toolbar, tocDrawer, contentEl, plainEl);
  return {
    setMode,
    getMode: () => currentMode,
    toggleMode: () => setMode(currentMode === "plain" ? "preview" : "plain"),
    syncToEditor,
    jumpToSlug,
  };
}

const MAX_LINES = 5000;

/** Fills `container` with colored, read-only source text. */
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

function buildJsonTreeNode(key, value, depth, filterText) {
  const labelKey = key !== null ? h("span", { class: "code-t-property" }, `${JSON.stringify(String(key))}: `) : null;
  if (value === null || typeof value !== "object") {
    const type = value === null ? "constant" : typeof value === "string" ? "string" : typeof value === "number" ? "number" : "keyword";
    const text = JSON.stringify(value);
    if (filterText && !`${key ?? ""} ${text}`.toLowerCase().includes(filterText)) return null;
    return h("div", { class: "code-json-leaf" }, labelKey, h("span", { class: `code-t-${type}` }, text));
  }
  const isArr = Array.isArray(value);
  const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
  const summary = isArr ? `Array(${entries.length})` : `{${entries.length} ${entries.length === 1 ? "key" : "keys"}}`;
  if (depth > 8) return h("div", { class: "code-json-leaf" }, labelKey, h("span", { class: "code-hint" }, summary));
  const children = [];
  for (const [k, v] of entries.slice(0, 300)) {
    const child = buildJsonTreeNode(isArr ? k : k, v, depth + 1, filterText);
    if (child) children.push(child);
  }
  if (filterText && !children.length && !String(key ?? "").toLowerCase().includes(filterText)) return null;
  if (entries.length > 300) children.push(h("div", { class: "code-hint" }, `… ${entries.length - 300} more items`));
  return h("details", { class: "code-json-branch", open: depth < 2 || Boolean(filterText) },
    h("summary", { class: "code-json-sum" }, labelKey, h("span", { class: "code-badge code-badge-quiet" }, summary)),
    h("div", { class: "code-json-children" }, children),
  );
}

/** Interactive JSON Tree Explorer with key filter and syntax error diagnostics. */
export function renderJsonPreview(container, text, { onGoLine } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const msg = String(err?.message ?? err);
    const posMatch = /position\s+(\d+)/i.exec(msg);
    let line = 1;
    let col = 1;
    if (posMatch) {
      const idx = Math.min(text.length, Number(posMatch[1]));
      const before = text.slice(0, idx).split("\n");
      line = before.length;
      col = before[before.length - 1].length + 1;
    }
    container.replaceChildren(
      h("div", { class: "code-pv-card code-bad" },
        h("strong", {}, "Invalid JSON"),
        h("p", {}, msg),
        onGoLine ? h("button", { type: "button", class: "code-btn code-small", title: `Jump to line ${line}, column ${col}`, onclick: () => onGoLine(line, col) }, `Go to line ${line}:${col}`) : null,
      ),
    );
    return;
  }
  const filter = h("input", { type: "text", class: "code-in", placeholder: "Filter JSON keys or values…", "aria-label": "Filter JSON keys or values", title: "Type to filter keys and values in the JSON tree" });
  const treeHost = h("div", { class: "code-json-tree" });
  const draw = () => {
    const node = buildJsonTreeNode(null, parsed, 0, filter.value.trim().toLowerCase());
    treeHost.replaceChildren(node ?? h("p", { class: "code-hint" }, "Nothing matches the filter."));
  };
  filter.addEventListener("input", draw);
  draw();
  container.replaceChildren(h("div", { class: "code-pv-bar" }, filter), treeHost);
}

/** Interactive sortable & filterable table preview for CSV and TSV files. */
export function renderCsvPreview(container, text) {
  const { headers, rows, colCount, rowCount, delimiter } = parseCsvTable(text, undefined, 400);
  if (!headers.length && !rows.length) {
    container.replaceChildren(h("p", { class: "code-hint" }, "This table is empty."));
    return;
  }
  const delimName = delimiter === "\t" ? "TSV (tab-separated)" : delimiter === ";" ? "CSV (semicolon)" : "CSV (comma)";
  const filter = h("input", { type: "text", class: "code-in", placeholder: "Filter rows…", "aria-label": "Filter table rows", title: "Type to filter rows in the table" });
  const meta = h("span", { class: "code-hint" }, `${rowCount} ${rowCount === 1 ? "row" : "rows"} · ${colCount} ${colCount === 1 ? "column" : "columns"} · ${delimName}`);
  const tableWrap = h("div", { class: "code-csv-wrap" });
  let sortCol = -1;
  let sortDesc = false;

  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    let list = q ? rows.filter((r) => r.some((c) => String(c).toLowerCase().includes(q))) : [...rows];
    if (sortCol >= 0) {
      list.sort((a, b) => {
        const va = String(a[sortCol] ?? "").trim();
        const vb = String(b[sortCol] ?? "").trim();
        const na = Number(va);
        const nb = Number(vb);
        const cmp = !Number.isNaN(na) && !Number.isNaN(nb) && va !== "" && vb !== "" ? na - nb : va.localeCompare(vb);
        return sortDesc ? -cmp : cmp;
      });
    }
    const ths = Array.from({ length: colCount }, (_, c) => {
      const name = headers[c] || `Col ${c + 1}`;
      const arrow = sortCol === c ? (sortDesc ? " ↓" : " ↑") : "";
      return h("th", {}, h("button", {
        type: "button",
        class: "code-csv-th",
        title: `Sort by ${name}`,
        onclick: () => {
          if (sortCol === c) sortDesc = !sortDesc;
          else { sortCol = c; sortDesc = false; }
          draw();
        },
      }, `${name}${arrow}`));
    });
    const trs = list.slice(0, 250).map((r, idx) =>
      h("tr", {}, h("td", { class: "code-pv-ln" }, String(idx + 1)), ...Array.from({ length: colCount }, (_, c) => h("td", {}, String(r[c] ?? "")))),
    );
    tableWrap.replaceChildren(
      h("table", { class: "code-csv-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "#"), ...ths)),
        h("tbody", {}, ...trs),
      ),
    );
  };
  filter.addEventListener("input", draw);
  draw();
  container.replaceChildren(h("div", { class: "code-pv-bar" }, filter, meta), tableWrap);
}

/** Live Inspector for code files: unsaved diff hunks, outline symbols, and TODO tasks. */
export function renderCodeInspectorPreview(container, doc, { onGoLine, onOpenDiff } = {}) {
  const diff = computeLineDiff(doc.savedText ?? "", doc.text ?? "", { oldLabel: `${doc.name} (saved)`, newLabel: `${doc.name} (current)` });
  const symbols = extractSymbols(doc.text, doc.lang);
  const todos = extractTodos(doc.text);

  const diffCard = h("section", { class: "code-pv-card" },
    h("div", { class: "code-pv-card-head" },
      h("strong", {}, "Unsaved changes"),
      !diff.identical && onOpenDiff ? h("button", { type: "button", class: "code-btn code-small", title: "Open the full unified diff in a tab", onclick: onOpenDiff }, "Open diff tab") : null,
    ),
    diff.identical
      ? h("p", { class: "code-hint" }, "No unsaved changes compared to the saved file.")
      : h("div", {},
          h("p", { class: "code-hint" }, `+${diff.added} added · −${diff.removed} removed across ${diff.hunks.length} ${diff.hunks.length === 1 ? "hunk" : "hunks"}`),
          ...diff.hunks.slice(0, 12).map((hunk) =>
            h("div", { class: "code-pv-hunk" },
              h("button", { type: "button", class: "code-res-line", title: `Jump to line ${hunk.newStart}`, onclick: () => onGoLine?.(hunk.newStart, 1) }, h("code", {}, hunk.header)),
              ...hunk.lines.filter((l) => l.type !== " ").slice(0, 6).map((l) =>
                h("div", { class: `code-pv-line ${l.type === "+" ? "code-t-inserted" : "code-t-deleted"}` }, `${l.type}${l.line}`),
              ),
            ),
          ),
        ),
  );

  const todoCard = h("section", { class: "code-pv-card" },
    h("strong", {}, `Tasks & notes (${todos.length})`),
    todos.length
      ? h("div", { class: "code-results" },
          ...todos.slice(0, 40).map((t) =>
            h("button", { type: "button", class: "code-res-line", title: `Jump to line ${t.line}`, onclick: () => onGoLine?.(t.line, t.col) },
              h("span", { class: `code-todo-tag code-todo-${t.tag.toLowerCase()}` }, t.tag),
              h("span", {}, t.text),
              h("span", { class: "code-res-ln" }, String(t.line)),
            ),
          ),
        )
      : h("p", { class: "code-hint" }, "No TODO, FIXME, BUG, HACK or NOTE comments in this file."),
  );

  const symCard = h("section", { class: "code-pv-card" },
    h("strong", {}, `Outline (${symbols.length})`),
    symbols.length
      ? h("div", { class: "code-results" },
          ...symbols.slice(0, 60).map((s) =>
            h("button", { type: "button", class: "code-res-line", title: `${s.kind} on line ${s.line}`, onclick: () => onGoLine?.(s.line, 1) },
              h("span", { class: "code-out-icon" }, s.kind.slice(0, 3)),
              h("span", {}, s.name),
              h("span", { class: "code-res-ln" }, String(s.line)),
            ),
          ),
        )
      : h("p", { class: "code-hint" }, "No functions, classes or headings detected."),
  );

  container.replaceChildren(diffCard, todoCard, symCard);
}

function parseScalarValue(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s === "~" || s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    return inner ? inner.split(",").map((x) => parseScalarValue(x)) : [];
  }
  return s;
}

function parseSimpleStructured(text, kind) {
  if (kind === "jsonl") {
    const out = [];
    for (const line of String(text ?? "").split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try { out.push(JSON.parse(t)); } catch { out.push({ _raw: t }); }
      if (out.length >= 250) break;
    }
    return out;
  }
  if (kind === "ini" || kind === "toml") {
    const root = {};
    let cur = root;
    for (const rawLine of String(text ?? "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith(";")) continue;
      const sec = /^\[+([^\]]+)\]+$/.exec(line);
      if (sec) {
        const parts = sec[1].trim().split(".");
        cur = root;
        for (const p of parts) {
          if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
          cur = cur[p];
        }
        continue;
      }
      const eq = line.indexOf("=");
      if (eq > 0) {
        const k = line.slice(0, eq).trim().replace(/^export\s+/, "");
        const v = line.slice(eq + 1).trim();
        cur[k] = parseScalarValue(v);
      }
    }
    return root;
  }
  // YAML
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#") || rawLine.trim() === "---") continue;
    const indent = rawLine.match(/^ */)?.[0].length ?? 0;
    const trimmed = rawLine.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (trimmed.startsWith("- ")) {
      const rest = trimmed.slice(2).trim();
      if (Array.isArray(parent)) parent.push(parseScalarValue(rest));
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon > 0) {
      const key = trimmed.slice(0, colon).trim().replace(/^['"]|['"]$/g, "");
      const rest = trimmed.slice(colon + 1).trim();
      if (!rest) {
        const child = {};
        if (parent && typeof parent === "object" && !Array.isArray(parent)) parent[key] = child;
        stack.push({ indent, obj: child });
      } else if (parent && typeof parent === "object" && !Array.isArray(parent)) {
        parent[key] = parseScalarValue(rest);
      }
    }
  }
  return root;
}

/** Interactive structured tree explorer for YAML, TOML, INI/.env, and JSONL files in the Code Editor. */
export function renderStructuredDataPreview(container, text, kind = "yaml") {
  const parsed = parseSimpleStructured(text, kind);
  const filter = h("input", { type: "text", class: "code-in", placeholder: "Filter keys or values…", "aria-label": "Filter keys or values" });
  const treeHost = h("div", { class: "code-json-tree" });
  const draw = () => {
    const node = buildJsonTreeNode(null, parsed, 0, filter.value.trim().toLowerCase());
    treeHost.replaceChildren(node ?? h("p", { class: "code-hint" }, "Nothing matches the filter."));
  };
  filter.addEventListener("input", draw);
  draw();
  container.replaceChildren(h("div", { class: "code-pv-bar" }, filter), treeHost);
}

/** Renders a Jupyter Notebook (.ipynb) preview with formatted Markdown cells, highlighted code cells, and outputs. */
export function renderNotebookPreview(container, text) {
  let nb;
  try {
    nb = JSON.parse(text);
  } catch (err) {
    container.replaceChildren(h("div", { class: "code-pv-card code-bad" }, h("strong", {}, "Invalid Notebook JSON"), h("p", {}, String(err?.message ?? err))));
    return;
  }
  const cells = Array.isArray(nb?.cells) ? nb.cells : [];
  if (!cells.length) {
    container.replaceChildren(h("p", { class: "code-hint" }, "This Jupyter notebook has no cells."));
    return;
  }
  const nodes = cells.slice(0, 100).map((c, idx) => {
    const src = Array.isArray(c.source) ? c.source.join("") : String(c.source ?? "");
    if (c.cell_type === "markdown") {
      const mdBox = h("div", { class: "code-pv-card" });
      renderMarkdown(mdBox, src);
      return mdBox;
    }
    const codeBox = h("div", { class: "code-nb-code" });
    renderSource(codeBox, src, "python");
    const outputs = Array.isArray(c.outputs) ? c.outputs : [];
    const outEls = outputs.slice(0, 6).map((o) => {
      if (o.output_type === "error") {
        return h("pre", { class: "code-bad" }, `${o.ename || "Error"}: ${o.evalue || ""}`);
      }
      const txt = Array.isArray(o.text) ? o.text.join("") : Array.isArray(o.data?.["text/plain"]) ? o.data["text/plain"].join("") : String(o.text ?? o.data?.["text/plain"] ?? "");
      return txt ? h("pre", { class: "code-md-pre" }, txt) : null;
    }).filter(Boolean);
    return h("section", { class: "code-pv-card" },
      h("div", { class: "code-pv-card-head" }, h("strong", {}, `In [${c.execution_count ?? idx + 1}]`)),
      codeBox,
      ...outEls,
    );
  });
  container.replaceChildren(...nodes);
}

