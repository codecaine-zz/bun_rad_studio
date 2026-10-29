/**
 * Pure report helpers for System Studio.
 *
 * IMPORTANT: every function here is self-contained (no module-level references other than other functions in
 * `SYSTEM_REPORT_FUNCTIONS`), because the same source is injected into the studio's web page via `Function.toString()`
 * and is also unit-tested directly in Bun.
 */

export function flattenData(value: any, prefix: string = "", out: Record<string, any> = {}, limit: number = 5000): Record<string, any> {
  let count = Object.keys(out).length;
  function walk(v: any, p: string): void {
    if (count >= limit) return;
    if (Array.isArray(v)) {
      if (v.length === 0 && p) {
        if (!(p in out)) count++;
        out[p] = "[]";
      }
      for (let i = 0; i < v.length; i++) {
        if (count >= limit) break;
        walk(v[i], p + "[" + i + "]");
      }
    } else if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length === 0 && p) {
        if (!(p in out)) count++;
        out[p] = "{}";
      }
      for (const k of keys) {
        if (count >= limit) break;
        walk(v[k], p ? p + "." + k : k);
      }
    } else {
      const targetKey = p || "value";
      if (!(targetKey in out)) count++;
      out[targetKey] = v;
    }
  }
  walk(value, prefix);
  return out;
}

export interface DataDiff {
  added: { path: string; value: any }[];
  removed: { path: string; value: any }[];
  changed: { path: string; from: any; to: any }[];
  unchanged: number;
}

/** Compare two telemetry payloads path-by-path (`before` = snapshot, `after` = current). */
export function diffData(before: any, after: any): DataDiff {
  const a = flattenData(before);
  const b = flattenData(after);
  const d: DataDiff = { added: [], removed: [], changed: [], unchanged: 0 };
  for (const k of Object.keys(b)) {
    if (!(k in a)) d.added.push({ path: k, value: b[k] });
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) d.changed.push({ path: k, from: a[k], to: b[k] });
    else d.unchanged++;
  }
  for (const k of Object.keys(a)) if (!(k in b)) d.removed.push({ path: k, value: a[k] });
  return d;
}

export function toCsv(data: any): string {
  const cell = (v: any): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  if (Array.isArray(data) && data.length > 0 && data.every((r: any) => r && typeof r === "object" && !Array.isArray(r))) {
    const headers: string[] = [];
    for (const r of data) for (const k of Object.keys(r)) if (headers.indexOf(k) < 0) headers.push(k);
    return [headers.map(cell).join(","), ...data.map((r: any) => headers.map((h) => cell(r[h])).join(","))].join("\n");
  }
  const flat = flattenData(data);
  return ["path,value", ...Object.keys(flat).map((k) => cell(k) + "," + cell(flat[k]))].join("\n");
}

export function toMarkdown(method: string, data: any, meta: { platform?: string; generated?: string } = {}): string {
  const md = (v: any): string => String(v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lines: string[] = [];
  lines.push("# System report: `" + method + "`", "");
  lines.push("- Generated: " + (meta.generated || new Date().toISOString()));
  if (meta.platform) lines.push("- Platform: " + meta.platform);
  lines.push("");
  if (Array.isArray(data) && data.length > 0 && data.every((r: any) => r && typeof r === "object" && !Array.isArray(r))) {
    const headers: string[] = [];
    for (const r of data) for (const k of Object.keys(r)) if (headers.indexOf(k) < 0) headers.push(k);
    lines.push("| " + headers.join(" | ") + " |", "| " + headers.map(() => "---").join(" | ") + " |");
    for (const r of data) lines.push("| " + headers.map((h) => md(r[h])).join(" | ") + " |");
    return lines.join("\n") + "\n";
  }
  const flat = flattenData(data);
  const groups: Record<string, string[]> = {};
  for (const k of Object.keys(flat)) {
    const top = k.split(/[.\[]/)[0] || "value";
    (groups[top] = groups[top] || []).push("| `" + k + "` | " + md(flat[k]) + " |");
  }
  for (const g of Object.keys(groups)) {
    lines.push("## " + g, "", "| Field | Value |", "| --- | --- |", ...groups[g]!, "");
  }
  return lines.join("\n");
}

export function toHtmlReport(method: string, data: any, meta: { platform?: string; generated?: string } = {}): string {
  const esc = (v: any): string =>
    String(v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const flat = flattenData(data);
  const groups: Record<string, string[]> = {};
  for (const k of Object.keys(flat)) {
    const top = k.split(/[.\[]/)[0] || "value";
    (groups[top] = groups[top] || []).push("<tr><td>" + esc(k) + "</td><td>" + esc(flat[k]) + "</td></tr>");
  }
  const sections = Object.keys(groups)
    .map((g) => "<h2>" + esc(g) + "</h2><table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>" + groups[g]!.join("") + "</tbody></table>")
    .join("");
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>System report: ' + esc(method) + "</title>" +
    "<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:32px;color:#0f172a}h1{margin-bottom:4px}h2{margin-top:28px;border-bottom:2px solid #38bdf8;padding-bottom:4px;text-transform:capitalize}" +
    "table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left;vertical-align:top;word-break:break-word}th{background:#f1f5f9}td:first-child{font-family:Menlo,monospace;width:34%;color:#475569}.meta{color:#64748b}</style></head><body>" +
    "<h1>System report: " + esc(method) + '</h1><div class="meta">Generated ' + esc(meta.generated || new Date().toISOString()) +
    (meta.platform ? " &middot; " + esc(meta.platform) : "") + "</div>" + sections + "</body></html>"
  );
}

/** Functions that get embedded into the studio page (order matters only for readability). */
export const SYSTEM_REPORT_FUNCTIONS = [flattenData, diffData, toCsv, toMarkdown, toHtmlReport];

/** Source text of all helpers, ready to drop inside a <script> tag. */
export function systemReportClientSource(): string {
  return SYSTEM_REPORT_FUNCTIONS.map((f) => f.toString()).join("\n\n");
}

/** File extension + mime for an export format. */
export function exportFormatInfo(format: string): { ext: string; mime: string } {
  switch (format) {
    case "csv": return { ext: "csv", mime: "text/csv" };
    case "md": return { ext: "md", mime: "text/markdown" };
    case "html": return { ext: "html", mime: "text/html" };
    default: return { ext: "json", mime: "application/json" };
  }
}
