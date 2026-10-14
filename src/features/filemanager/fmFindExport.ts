/**
 * Results as text (JSON, CSV, TSV, Markdown or a plain list of paths), and saving that text as a NEW file.
 */
import { promises as fsp } from "fs";
import { toMarkdownTable, toTsv, type ExportRow } from "../../../applications/fd_ops";
import { formatHumanSize } from "../../../applications/fd_engine";
import { exportFileName } from "../../fd_helpers";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext } from "./fmCore";
import { FmError, uniqueName, validateName } from "./fmPaths";
import type { FindItem } from "./fmFindShared";

export const EXPORT_FORMATS = ["json", "csv", "tsv", "md", "paths"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
const EXTENSION: Record<ExportFormat, string> = { json: "json", csv: "csv", tsv: "tsv", md: "md", paths: "txt" };
/** The most text that can be put on the clipboard in one go (the page's own limit is lower still). */
export const MAX_EXPORT_TEXT = 100_000;

const iso = (ms: number) => new Date(ms).toISOString();

/** A spreadsheet runs a cell that starts with = + @ as a formula, so such text gets a leading apostrophe. */
function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsOf(items: FindItem[]): ExportRow[] {
  const flat = (v: string) => v.replace(/[\r\n]+/g, " ");
  return items.map((i) => ({ name: flat(i.name), type: i.type, humanSize: formatHumanSize(i.sizeBytes), relativePath: flat(i.relativePath), mtimeStr: iso(i.mtimeMs), permStr: i.permStr }));
}

export function formatResults(items: FindItem[], format: ExportFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(
        items.map((i) => ({ name: i.name, type: i.type, sizeBytes: i.sizeBytes, relativePath: i.relativePath, path: i.path, modified: iso(i.mtimeMs), permissions: i.permStr })),
        null,
        2,
      ) + "\n";
    case "csv":
      return ["Name,Type,SizeBytes,HumanSize,RelativePath,FullPath,Modified,Permissions", ...items.map((i) => [i.name, i.type, i.sizeBytes, formatHumanSize(i.sizeBytes), i.relativePath, i.path, iso(i.mtimeMs), i.permStr].map(csvCell).join(","))].join("\n") + "\n";
    case "tsv":
      return toTsv(rowsOf(items));
    case "md":
      return toMarkdownTable(rowsOf(items).map((r) => ({ ...r, name: r.name.replace(/\|/g, "\\|") })));
    case "paths":
      return items.map((i) => i.path).join("\n") + "\n";
  }
}

export function exportFormat(value: unknown): ExportFormat {
  if (typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value)) return value as ExportFormat;
  throw new FmError("BAD_FORMAT", `Choose a format: ${EXPORT_FORMATS.join(", ")}.`);
}

/** Saves `text` as a new file in `destInput`; a taken name gets "(2)". Never overwrites. */
export async function saveNewFile(ctx: FmContext, destInput: unknown, format: ExportFormat, text: string, nameInput?: unknown): Promise<{ path: string; name: string; bytes: number }> {
  const dest = absolutePath(ctx, destInput);
  await assertFolder(dest, "The folder to save in");
  assertCreatable(ctx, dest);
  const p = pathApi(ctx);
  const ext = EXTENSION[format];
  let wanted = typeof nameInput === "string" && nameInput.trim() ? nameInput.trim() : exportFileName(ext);
  if (!/\.[A-Za-z0-9]{1,5}$/.test(wanted)) wanted = `${wanted}.${ext}`;
  const reason = validateName(wanted, ctx.platform);
  if (reason) throw new FmError("BAD_NAME", reason);
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = new Set(await fsp.readdir(dest));
    const name = uniqueName(wanted, (n) => taken.has(n));
    const path = p.join(dest, name);
    try {
      await fsp.writeFile(path, text, { flag: "wx" });
      return { path, name, bytes: Buffer.byteLength(text) };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
    }
  }
  throw new FmError("EXISTS", "A file with that name keeps appearing. Try again.");
}
