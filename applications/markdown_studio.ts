import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { writeFileSync } from "fs";
import { resolve, basename } from "path";

const DEFAULT_MARKDOWN = `# Enterprise Systems Architecture Blueprint

## Executive Overview
Bun RAD Studio provides **zero-dependency**, native desktop GUI engineering with microsecond response times and rich developer workstations.

> [!NOTE]
> All workstations operate with 100% native Bun and operating system APIs. No Homebrew or external runtimes are required.

### Core Architecture Highlights
- **Engine**: Native Cocoa / WebKit rendering engine
- **IPC Protocol**: Direct synchronous bridge messaging
- **Persistence**: Atomic local storage & reactive form state auto-binding
- **Tooling**: Built-in SQLite, Network Diagnostics, Git Controller, and Crypto Lab

### Key System Metrics
| Component | Status | Latency | Memory Footprint |
| :--- | :--- | :--- | :--- |
| **SimpleGUI** | Production Ready | 0.08ms | ~14 MB |
| **bun:sqlite** | Enterprise Embedded | 0.04ms | ~6 MB |
| **fs.watch** | High-Resolution Daemon | 0.15ms | ~4 MB |

\`\`\`typescript
import { newSimpleWindow } from "./src/simplegui";

const win = newSimpleWindow("Enterprise App", 1200, 800);
win.addHeading("Mission Critical Dashboard");
win.run();
\`\`\`
`;

const ALLOWED_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "a",
  "img",
  "span",
  "div",
  "sup",
  "sub",
  "kbd",
  "mark",
  "details",
  "summary",
  "input",
]);

const VOID_TAGS = new Set(["br", "hr", "img", "input"]);

const DROP_SUBTREE_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "svg",
  "math",
  "noscript",
  "template",
  "textarea",
  "title",
  "xmp",
]);

function escapeHtmlText(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(val: string): string {
  return val
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    colon: ":",
    tab: "\t",
    newline: "\n",
    nbsp: " ",
  };
  return input
    .replace(/&#[xX]([0-9a-fA-F]{1,6});?/g, (_m, hex: string) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : "";
    })
    .replace(/&#([0-9]{1,7});?/g, (_m, dec: string) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : "";
    })
    .replace(/&([a-zA-Z]+);?/g, (full, name: string) => {
      const lower = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(named, lower)
        ? named[lower]!
        : full;
    });
}

function sanitizeAllowedUri(raw: string, allowMailto: boolean): string | null {
  // Iteratively decode entities (up to 3 passes) and strip ASCII control + whitespace chars
  let decoded = raw;
  for (let pass = 0; pass < 3; pass++) {
    const next = decodeHtmlEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  const stripped = decoded.replace(/[\u0000-\u0020\u007f]+/g, "");
  if (!stripped) return null;
  if (stripped.startsWith("#")) {
    return raw.trim();
  }
  // Reject protocol-relative URLs (e.g. //host/path which resolves to file:// in local webviews)
  if (stripped.startsWith("//") || stripped.startsWith("\\\\")) {
    return null;
  }
  const firstDelimiter = stripped.search(/[/?#]/);
  const colonIdx = stripped.indexOf(":");
  if (colonIdx !== -1 && (firstDelimiter === -1 || colonIdx < firstDelimiter)) {
    const scheme = stripped.slice(0, colonIdx).toLowerCase();
    if (scheme === "http" || scheme === "https") {
      return raw.trim();
    }
    if (allowMailto && scheme === "mailto") {
      return raw.trim();
    }
    return null;
  }
  return raw.trim();
}

function parseTagAttributes(attrSource: string): Map<string, string> {
  const attrs = new Map<string, string>();
  let i = 0;
  const n = attrSource.length;
  while (i < n) {
    // Skip whitespace and stray slashes (handles <svg/onload=...> or <img src="x"/>)
    while (i < n && /[\s/]/.test(attrSource[i]!)) i++;
    if (i >= n) break;

    const nameStart = i;
    while (i < n && !/[\s=/>"']/.test(attrSource[i]!)) i++;
    const rawName = attrSource.slice(nameStart, i).toLowerCase();
    if (!rawName) {
      i++;
      continue;
    }

    while (i < n && /\s/.test(attrSource[i]!)) i++;
    let val = "";
    if (i < n && attrSource[i] === "=") {
      i++; // consume '='
      while (i < n && /\s/.test(attrSource[i]!)) i++;
      if (i < n && (attrSource[i] === '"' || attrSource[i] === "'")) {
        const q = attrSource[i]!;
        i++;
        const valStart = i;
        while (i < n && attrSource[i] !== q) i++;
        val = attrSource.slice(valStart, i);
        if (i < n && attrSource[i] === q) i++;
      } else {
        const valStart = i;
        while (i < n && !/[\s>]/.test(attrSource[i]!)) i++;
        val = attrSource.slice(valStart, i);
      }
    }
    if (!attrs.has(rawName)) {
      attrs.set(rawName, val);
    }
  }
  return attrs;
}

function serializeAllowedStartTag(
  tag: string,
  attrs: Map<string, string>,
): string {
  if (tag === "input") {
    const inputType = decodeHtmlEntities(attrs.get("type") || "")
      .trim()
      .toLowerCase();
    if (inputType !== "checkbox") {
      return "";
    }
    const checked = attrs.has("checked") ? ' checked="checked"' : "";
    return `<input type="checkbox" disabled="disabled"${checked}>`;
  }

  const parts: string[] = [];

  for (const [name, rawVal] of attrs.entries()) {
    // Unconditionally reject event handlers and active/style attributes
    if (
      name.startsWith("on") ||
      name === "style" ||
      name === "srcdoc" ||
      name === "formaction" ||
      name === "xlink:href" ||
      name === "action"
    ) {
      continue;
    }

    if (tag === "a" && name === "href") {
      const safeHref = sanitizeAllowedUri(rawVal, true);
      parts.push(`href="${escapeHtmlAttr(safeHref ?? "#")}"`);
      parts.push(`rel="noopener noreferrer"`);
      continue;
    }

    if (tag === "img") {
      if (name === "src") {
        const safeSrc = sanitizeAllowedUri(rawVal, false);
        if (!safeSrc) return "";
        parts.push(`src="${escapeHtmlAttr(safeSrc)}"`);
        continue;
      }
      if (name === "alt") {
        parts.push(`alt="${escapeHtmlAttr(decodeHtmlEntities(rawVal))}"`);
        continue;
      }
      if (
        (name === "width" || name === "height") &&
        /^\d{1,4}%?$/.test(rawVal.trim())
      ) {
        parts.push(`${name}="${rawVal.trim()}"`);
        continue;
      }
    }

    if (tag === "th" || tag === "td") {
      if (name === "align") {
        const align = rawVal.trim().toLowerCase();
        if (align === "left" || align === "center" || align === "right") {
          parts.push(`align="${align}"`);
        }
        continue;
      }
      if (
        (name === "colspan" || name === "rowspan") &&
        /^\d{1,3}$/.test(rawVal.trim())
      ) {
        parts.push(`${name}="${rawVal.trim()}"`);
        continue;
      }
    }

    if (tag === "details" && name === "open") {
      parts.push(`open="open"`);
      continue;
    }

    if (tag === "ol" && name === "start" && /^\d{1,6}$/.test(rawVal.trim())) {
      parts.push(`start="${rawVal.trim()}"`);
      continue;
    }

    if (name === "title") {
      parts.push(`title="${escapeHtmlAttr(decodeHtmlEntities(rawVal))}"`);
      continue;
    }

    if (
      (tag === "code" || tag === "pre" || tag === "span" || tag === "div") &&
      name === "class"
    ) {
      const cleanCls = rawVal.trim();
      if (/^[A-Za-z0-9_ -]{1,80}$/.test(cleanCls)) {
        parts.push(`class="${escapeHtmlAttr(cleanCls)}"`);
      }
      continue;
    }
  }

  return parts.length > 0 ? `<${tag} ${parts.join(" ")}>` : `<${tag}>`;
}

/**
 * Strict state-machine HTML tokenizer and allowlist sanitizer.
 * Strips disallowed elements (`<script>`, `<style>`, `<iframe>`, `<svg>`, `<math>`, `<object>`, `<embed>`, `<form>`, `<base>`, `<meta>`, `<link>`),
 * all `on*` / `style` / `srcdoc` / `formaction` attributes, and unsafe URI schemes (even entity-encoded).
 */
export function sanitizeHtml(html: string): string {
  const out: string[] = [];
  const n = html.length;
  let i = 0;
  const droppedTagStack: string[] = [];

  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      if (droppedTagStack.length === 0) {
        out.push(escapeHtmlText(html.slice(i)));
      }
      break;
    }

    if (lt > i && droppedTagStack.length === 0) {
      out.push(escapeHtmlText(html.slice(i, lt)));
    }

    // HTML comment: <!-- ... -->
    if (html.startsWith("<!--", lt)) {
      const endComment = html.indexOf("-->", lt + 4);
      i = endComment === -1 ? n : endComment + 3;
      continue;
    }

    // Declarations or processing instructions: <!DOCTYPE ...> / <?xml ...?>
    if (lt + 1 < n && (html[lt + 1] === "!" || html[lt + 1] === "?")) {
      const closeDecl = html.indexOf(">", lt + 2);
      i = closeDecl === -1 ? n : closeDecl + 1;
      continue;
    }

    // Scan tag until '>' while respecting quoted attribute values
    let cursor = lt + 1;
    let isClosing = false;
    if (cursor < n && html[cursor] === "/") {
      isClosing = true;
      cursor++;
    }

    // Tag name must begin with ASCII letter
    if (cursor >= n || !/[a-zA-Z]/.test(html[cursor]!)) {
      if (droppedTagStack.length === 0) {
        out.push("&lt;");
      }
      i = lt + 1;
      continue;
    }

    const nameStart = cursor;
    while (cursor < n && /[a-zA-Z0-9:-]/.test(html[cursor]!)) {
      cursor++;
    }
    const tagName = html.slice(nameStart, cursor).toLowerCase();

    const attrStart = cursor;
    let quote: '"' | "'" | null = null;
    while (cursor < n) {
      const ch = html[cursor]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      cursor++;
    }

    // Unclosed tag at EOF: never emit raw '<'
    if (cursor >= n) {
      break;
    }

    const rawAttrs = html.slice(attrStart, cursor);
    const selfClosing = !isClosing && /\/\s*$/.test(rawAttrs);
    i = cursor + 1;

    if (isClosing) {
      if (droppedTagStack.length > 0) {
        const matchIdx = droppedTagStack.lastIndexOf(tagName);
        if (matchIdx !== -1) {
          droppedTagStack.length = matchIdx;
        }
        continue;
      }
      if (ALLOWED_TAGS.has(tagName) && !VOID_TAGS.has(tagName)) {
        out.push(`</${tagName}>`);
      }
      continue;
    }

    if (droppedTagStack.length > 0) {
      if (DROP_SUBTREE_TAGS.has(tagName) && !selfClosing) {
        droppedTagStack.push(tagName);
      }
      continue;
    }

    if (DROP_SUBTREE_TAGS.has(tagName)) {
      if (!selfClosing) {
        droppedTagStack.push(tagName);
      }
      continue;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      continue;
    }

    const parsedAttrs = parseTagAttributes(rawAttrs);
    const serialized = serializeAllowedStartTag(tagName, parsedAttrs);
    if (serialized) {
      out.push(serialized);
    }
  }

  return out.join("");
}

const MD_ALERTS: Record<string, [string, string]> = {
  NOTE: ["#0284c7", "rgba(2,132,199,0.15)"],
  TIP: ["#16a34a", "rgba(22,163,74,0.15)"],
  IMPORTANT: ["#9333ea", "rgba(147,51,234,0.15)"],
  WARNING: ["#d97706", "rgba(217,119,6,0.15)"],
  CAUTION: ["#dc2626", "rgba(220,38,38,0.15)"],
};

export function simpleMarkdownToHtml(md: string): string {
  // Full CommonMark + GFM (tables, task lists, strikethrough, autolinks, nested lists) via Bun's native renderer.
  let html = sanitizeHtml((Bun as any).markdown.html(md) as string);

  // GitHub-style alert callouts: > [!NOTE]
  html = html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
    (_m, kind: string, text: string) => {
      const [fg, bg] = MD_ALERTS[kind.toUpperCase()]!;
      return `<div style="background:${bg};border-left:4px solid ${fg};padding:10px 14px;border-radius:6px;margin:10px 0;color:#e2e8f0;font-size:13px;"><strong style="color:${fg};">${kind.toUpperCase()}:</strong> ${text}</div>`;
    },
  );

  const th = `border:1px solid rgba(255,255,255,0.15);padding:6px 10px;font-size:12px;text-align:left;`;
  html = html
    .replace(
      /<h1>/g,
      '<h1 style="color:#f8fafc;margin:16px 0 10px 0;font-size:24px;">',
    )
    .replace(
      /<h2>/g,
      '<h2 style="color:#0284c7;margin:16px 0 8px 0;font-size:20px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;">',
    )
    .replace(
      /<h([3-6])>/g,
      '<h$1 style="color:#38bdf8;margin:12px 0 6px 0;font-size:16px;">',
    )
    .replace(/<strong>/g, '<strong style="color:#fff;">')
    .replace(
      /<table>/g,
      '<table style="width:100%;border-collapse:collapse;margin:12px 0;border:1px solid rgba(255,255,255,0.15);">',
    )
    .replace(
      /<th(\s[^>]*)?>/g,
      `<th$1 style="${th}background:rgba(255,255,255,0.06);color:#38bdf8;">`,
    )
    .replace(/<td(\s[^>]*)?>/g, `<td$1 style="${th}">`)
    .replace(
      /<pre>/g,
      '<pre style="background:#0f172a;color:#38bdf8;padding:12px;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:12px;margin:12px 0;">',
    )
    .replace(
      /<code>/g,
      '<code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;color:#38bdf8;font-family:monospace;">',
    )
    .replace(
      /<blockquote>/g,
      '<blockquote style="border-left:3px solid #64748b;margin:8px 0;padding-left:12px;color:#94a3b8;font-style:italic;">',
    )
    .replace(/<a /g, '<a style="color:#38bdf8;" ')
    .replace(
      /<hr\s*\/?>/g,
      '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:16px 0;">',
    )
    .replace(/<img /g, '<img style="max-width:100%;" ');

  return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#cbd5e1;line-height:1.6;font-size:14px;padding:8px;">${html}</div>`;
}

export function createMarkdownStudio(
  options: { fullscreen?: boolean; theme?: string } = {},
): SimpleWindow {
  const win = newSimpleWindow(
    "Markdown & Documentation Studio Pro -- Real-Time Preview Workbench",
    1160,
    980,
    {
      appId: "markdown_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
      fullscreen: options.fullscreen ?? true,
    },
  );

  // Top Bar
  win.beginRow();
  win.addHeading("Markdown Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption(
    "Enterprise Technical Documentation, Real-Time HTML Preview & Article Workbench",
  );

  // Metrics Card
  win.beginCard("Document Telemetry & Statistics");
  win.beginRow();
  win.addLabel("lbl_words", "Words: 110");
  win.addLabel("lbl_chars", "Characters: 820");
  win.addLabel("lbl_lines", "Lines: 24");
  win.addLabel("lbl_read_time", "Reading Time: ~1 min");
  win.endRow();
  win.endCard();

  // Snippet Helpers Toolbar
  win.beginGroupBox("Documentation Snippets & Format Actions");
  win.beginRow();
  win.addButton("btn_render", "⚡ Render Preview");
  win.addButton("btn_insert_table", "📊 Insert Table");
  win.addButton("btn_insert_code", "💻 Insert Code Block");
  win.addButton("btn_insert_alert", "💡 Insert Alert Callout");
  win.addButton("btn_reset_doc", "Reset Template");
  win.addButton("btn_export_html", "📋 Export Standalone HTML");
  win.endRow();
  win.endGroupBox();

  // Markdown Editor
  win.beginGroupBox("Markdown Source Editor");
  win.addTextarea("txt_md_input", DEFAULT_MARKDOWN).height(150);
  win.endGroupBox();

  // Live HTML Preview
  win.beginGroupBox("Real-Time Rendered Document Preview");
  win
    .addHtmlView(simpleMarkdownToHtml(DEFAULT_MARKDOWN), 1088, 180, {
      id: "txt_md_preview",
    })
    .id("txt_md_preview")
    .height(180);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Document Parser Telemetry & Audit Log");
  win.addConsole("md_console", 100);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel(
    "lbl_status",
    "Status: Ready  |  Syntax: Valid Markdown  |  Zero Homebrew",
  );
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Markdown document saved!");
  });

  const renderDocument = () => {
    const text = win.getValue("txt_md_input") || "";
    const t0 = performance.now();
    const rendered = simpleMarkdownToHtml(text);
    const elapsed = (performance.now() - t0).toFixed(2);

    win.setHtml("txt_md_preview", rendered);

    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const lines = text.split("\n").length;
    const readMin = Math.max(1, Math.ceil(words / 200));

    win.setText("lbl_words", `Words: ${words}`);
    win.setText("lbl_chars", `Characters: ${chars}`);
    win.setText("lbl_lines", `Lines: ${lines}`);
    win.setText("lbl_read_time", `Reading Time: ~${readMin} min`);

    win.appendConsole(
      "md_console",
      `[Markdown Render] Parsed ${words} words, ${lines} lines in ${elapsed}ms\n`,
      0,
    );
    win.setText(
      "lbl_status",
      `Words: ${words}  |  Rendered in ${elapsed}ms  |  Status: OK`,
    );
    win.setStatus(`Rendered in ${elapsed}ms`);
  };

  win.onChange("txt_md_input", renderDocument);
  win.onClick("btn_render", renderDocument);

  win.onClick("btn_reset_doc", () => {
    win.setText("txt_md_input", DEFAULT_MARKDOWN);
    renderDocument();
    win.toast("Reset to enterprise blueprint");
  });

  win.onClick("btn_insert_table", () => {
    const cur = win.getValue("txt_md_input") || "";
    const snippet = `\n| Feature | Tier 1 | Tier 2 | Status |\n| :--- | :--- | :--- | :--- |\n| Hardware Acceleration | Enabled | Enabled | Active |\n| IPC Throughput | 240k ops/sec | 350k ops/sec | Verified |\n`;
    win.setText("txt_md_input", cur + snippet);
    renderDocument();
    win.toast("Inserted Markdown table");
  });

  win.onClick("btn_insert_code", () => {
    const cur = win.getValue("txt_md_input") || "";
    const snippet = `\n\`\`\`typescript\n// Enterprise Utility Function\nexport function computeHash(data: string): string {\n  const hasher = new Bun.CryptoHasher("sha256");\n  return hasher.update(data).digest("hex");\n}\n\`\`\`\n`;
    win.setText("txt_md_input", cur + snippet);
    renderDocument();
    win.toast("Inserted code snippet");
  });

  win.onClick("btn_insert_alert", () => {
    const cur = win.getValue("txt_md_input") || "";
    const snippet = `\n> [!NOTE]\n> Enterprise applications should maintain zero external dependencies and utilize native operating system APIs.\n`;
    win.setText("txt_md_input", cur + snippet);
    renderDocument();
    win.toast("Inserted note alert");
  });

  // Perform initial render
  renderDocument();

  win.onClick("btn_export_html", () => {
    const text = win.getValue("txt_md_input") || "";
    const bodyHtml = simpleMarkdownToHtml(text);
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Enterprise Document Export</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #cbd5e1; max-width: 860px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid rgba(255,255,255,0.15); padding: 8px 12px; text-align: left; }
    th { background: rgba(255,255,255,0.06); color: #38bdf8; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

    const outPath = resolve(process.cwd(), "document_export.html");
    try {
      writeFileSync(outPath, fullHtml, "utf8");
      win.appendConsole(
        "md_console",
        `[Export HTML] Document successfully exported to ${outPath}\n`,
        2,
      );
      win.toast(`Exported HTML: ${basename(outPath)}`);
    } catch (e: any) {
      win.appendConsole("md_console", `[Export Error] ${e.message}\n`, 3);
    }
  });

  win.onClick("btn_fullscreen", (w) => {
    w.toggleFullscreen();
  });

  return win;
}

if (import.meta.main) {
  const win = createMarkdownStudio({ fullscreen: true });
  console.log("⚡ Launching Markdown & Documentation Studio...");
  win.run();
}
