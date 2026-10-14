/** Turns a table of results into CSV, JSON or a Markdown table, and saves the text beside the scanned files without overwriting anything. */
import { promises as fsp } from "fs";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext } from "./fmCore";
import { FmError, uniqueName, validateName } from "./fmPaths";

export type Cell = string | number | null;
export interface Table {
  title: string;
  columns: string[];
  rows: Cell[][];
  /** Facts about the scan (engine, folder, date) kept in the JSON form. */
  meta?: Record<string, unknown>;
}

export const EXPORT_FORMATS = ["csv", "json", "md"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const MAX_EXPORT_ROWS = 100_000;

export const parseFormat = (v: unknown): ExportFormat => {
  if (typeof v === "string" && (EXPORT_FORMATS as readonly string[]).includes(v)) return v as ExportFormat;
  throw new FmError("BAD_FORMAT", "Choose CSV, JSON or Markdown.");
};

/** Spreadsheet programs run text that starts with = + - @ as a formula, so such text gets a leading apostrophe. */
function csvCell(c: Cell): string {
  if (c === null) return "";
  let s = String(c);
  if (typeof c === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(t: Table): string {
  return `${[t.columns, ...t.rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const mdCell = (c: Cell) => (c === null ? "" : String(c).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " "));

export function toMarkdown(t: Table): string {
  const numeric = t.columns.map((_, i) => t.rows.length > 0 && t.rows.every((r) => typeof r[i] === "number" || r[i] === null));
  const head = `| ${t.columns.map(mdCell).join(" | ")} |`;
  const sep = `| ${numeric.map((n) => (n ? "---:" : "---")).join(" | ")} |`;
  const body = t.rows.map((r) => `| ${r.map((c, i) => (typeof c === "number" && numeric[i] ? c.toLocaleString("en-US") : mdCell(c))).join(" | ")} |`);
  return `${[head, sep, ...body].join("\n")}\n`;
}

export function toJson(t: Table): string {
  const rows = t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])));
  return `${JSON.stringify({ title: t.title, ...(t.meta ?? {}), rows }, null, 2)}\n`;
}

export function render(t: Table, format: ExportFormat): string {
  const capped = t.rows.length > MAX_EXPORT_ROWS ? { ...t, rows: t.rows.slice(0, MAX_EXPORT_ROWS) } : t;
  return format === "csv" ? toCsv(capped) : format === "md" ? toMarkdown(capped) : toJson(capped);
}

/** Writes `text` as a new file in `folder`. An existing file of that name stays untouched: the new one gets "(2)" and so on. */
export async function saveText(ctx: FmContext, input: { folder: unknown; name: string; format: ExportFormat; text: string }): Promise<{ path: string; name: string }> {
  const folder = absolutePath(ctx, input.folder);
  await assertFolder(folder, "That folder");
  assertCreatable(ctx, folder);
  const p = pathApi(ctx);
  const wanted = `${input.name}.${input.format}`;
  const problem = validateName(wanted, ctx.platform);
  if (problem) throw new FmError("BAD_NAME", problem);
  const existing = new Set(await fsp.readdir(folder));
  for (let attempt = 0; attempt < 20; attempt++) {
    const name = uniqueName(wanted, (n) => existing.has(n));
    try {
      await fsp.writeFile(p.join(folder, name), input.text, { flag: "wx" });
      return { path: p.join(folder, name), name };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
      existing.add(name);
    }
  }
  throw new FmError("EXISTS", "Couldn't find a free file name. Move the older exports away first.");
}
