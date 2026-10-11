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

/** Removes active content (scripts, inline handlers, javascript: URLs) from rendered HTML. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\/?(script|iframe|object|embed|style|link|meta|base|form)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, '$1="#"');
}

const MD_ALERTS: Record<string, [string, string]> = {
  NOTE: ["#0284c7", "rgba(2,132,199,0.15)"],
  TIP: ["#16a34a", "rgba(22,163,74,0.15)"],
  IMPORTANT: ["#9333ea", "rgba(147,51,234,0.15)"],
  WARNING: ["#d97706", "rgba(217,119,6,0.15)"],
  CAUTION: ["#dc2626", "rgba(220,38,38,0.15)"],
};

function simpleMarkdownToHtml(md: string): string {
  // Full CommonMark + GFM (tables, task lists, strikethrough, autolinks, nested lists) via Bun's native renderer.
  let html = sanitizeHtml((Bun as any).markdown.html(md) as string);

  // GitHub-style alert callouts: > [!NOTE]
  html = html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
    (_m, kind: string, text: string) => {
      const [fg, bg] = MD_ALERTS[kind.toUpperCase()]!;
      return `<div style="background:${bg};border-left:4px solid ${fg};padding:10px 14px;border-radius:6px;margin:10px 0;color:#e2e8f0;font-size:13px;"><strong style="color:${fg};">${kind.toUpperCase()}:</strong> ${text}</div>`;
    }
  );

  const th = `border:1px solid rgba(255,255,255,0.15);padding:6px 10px;font-size:12px;text-align:left;`;
  html = html
    .replace(/<h1>/g, '<h1 style="color:#f8fafc;margin:16px 0 10px 0;font-size:24px;">')
    .replace(/<h2>/g, '<h2 style="color:#0284c7;margin:16px 0 8px 0;font-size:20px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;">')
    .replace(/<h([3-6])>/g, '<h$1 style="color:#38bdf8;margin:12px 0 6px 0;font-size:16px;">')
    .replace(/<strong>/g, '<strong style="color:#fff;">')
    .replace(/<table>/g, '<table style="width:100%;border-collapse:collapse;margin:12px 0;border:1px solid rgba(255,255,255,0.15);">')
    .replace(/<th(\s[^>]*)?>/g, `<th$1 style="${th}background:rgba(255,255,255,0.06);color:#38bdf8;">`)
    .replace(/<td(\s[^>]*)?>/g, `<td$1 style="${th}">`)
    .replace(/<pre>/g, '<pre style="background:#0f172a;color:#38bdf8;padding:12px;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:12px;margin:12px 0;">')
    .replace(/<code>/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;color:#38bdf8;font-family:monospace;">')
    .replace(/<blockquote>/g, '<blockquote style="border-left:3px solid #64748b;margin:8px 0;padding-left:12px;color:#94a3b8;font-style:italic;">')
    .replace(/<a /g, '<a style="color:#38bdf8;" ')
    .replace(/<hr\s*\/?>/g, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:16px 0;">')
    .replace(/<img /g, '<img style="max-width:100%;" ');

  return `<div style="font-family:system-ui,-apple-system,sans-serif;color:#cbd5e1;line-height:1.6;font-size:14px;padding:8px;">${html}</div>`;
}

export function createMarkdownStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("Markdown & Documentation Studio Pro -- Real-Time Preview Workbench", 1160, 980, {
    appId: "markdown_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen: options.fullscreen ?? true,
  });

  // Top Bar
  win.beginRow();
  win.addHeading("Markdown Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("Enterprise Technical Documentation, Real-Time HTML Preview & Article Workbench");

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
  win.addHtmlView(simpleMarkdownToHtml(DEFAULT_MARKDOWN), 1088, 180, { id: "txt_md_preview" }).id("txt_md_preview").height(180);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Document Parser Telemetry & Audit Log");
  win.addConsole("md_console", 100);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Syntax: Valid Markdown  |  Zero Homebrew");
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

    win.appendConsole("md_console", `[Markdown Render] Parsed ${words} words, ${lines} lines in ${elapsed}ms\n`, 0);
    win.setText("lbl_status", `Words: ${words}  |  Rendered in ${elapsed}ms  |  Status: OK`);
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
      win.appendConsole("md_console", `[Export HTML] Document successfully exported to ${outPath}\n`, 2);
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
