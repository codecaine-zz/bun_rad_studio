/**
 * "Import with staging" from the File Manager: handing a data file (or just "open the wizard") to a database studio.
 *
 * The File Manager starts every studio with a random secret (STUDIO_STAGING_TOKEN) that only it and that studio know. A studio
 * that is not running yet gets the request in its environment; a studio that is already running is told through its
 * `/api/staging/grant` route, which refuses anything without the secret. The studio only reads a file after being granted
 * that exact path, and never writes to it. Paths are checked here (a real file of an importable kind, not too big) and again by the studio.
 */
import { randomBytes } from "crypto";
import { promises as fsp, realpathSync } from "fs";
import { extname } from "path";
import { limits } from "../../db/staging/limits";
import { absolutePath, type FmContext, type FmHandler } from "./fmCore";
import { isObject } from "./fmDbCommon";
import type { StudioInfo } from "./fmDbStudios";
import { FmError } from "./fmPaths";

export const IMPORT_EXTENSIONS = new Set([
  "csv",
  "tsv",
  "tab",
  "txt",
  "psv",
  "ssv",
  "dat",
  "json",
  "jsonc",
  "json5",
  "ndjson",
  "jsonl",
  "log",
  "yaml",
  "yml",
  "toml",
  "xml",
  "plist",
  "ini",
  "cfg",
  "conf",
  "env",
  "properties",
  "md",
  "markdown",
  "html",
  "htm",
  "sql",
  "xlsx",
  "ods",
]);

export interface ImportAsk {
  /** A data file the wizard should start with. */
  file?: string;
  /** Open the wizard (without a file). */
  open: boolean;
}

/** studio id -> the secret that studio was started with */
const tokens = new Map<string, string>();

export const newStagingToken = (): string => randomBytes(18).toString("hex");
export const rememberStagingToken = (studioId: string, token: string): void => void tokens.set(studioId, token);
export const forgetStagingToken = (studioId: string): void => void tokens.delete(studioId);

/** A real, readable data file the person chose. Read-only: nothing here writes to it. */
export async function checkImportFile(ctx: FmContext, input: unknown): Promise<{ path: string; name: string; size: number }> {
  const path = absolutePath(ctx, input);
  const st = await fsp.stat(path).catch(() => null);
  if (!st) throw new FmError("NOT_FOUND", "That file isn't there any more.");
  if (!st.isFile()) throw new FmError("NOT_A_FILE", "That isn't a file.");
  const ext = extname(path).slice(1).toLowerCase();
  const base = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (!IMPORT_EXTENSIONS.has(ext) && base !== ".env" && !base.startsWith(".env.")) {
    throw new FmError(
      "NOT_DATA",
      "Only CSV, TSV, text, JSON, JSON Lines, Excel (.xlsx), ODS, YAML, TOML, XML, SQL, Markdown, HTML, INI, .env and .properties files can be loaded this way. (Legacy Excel .xls files can't be read: save them as “CSV UTF-8” first.)",
    );
  }
  if (ext === "xlsx" || ext === "ods") {
    if (st.size < 22) {
      throw new FmError("NOT_DATA", "This spreadsheet file is damaged or not a valid .xlsx/.ods archive. (In Excel you can also save as “CSV UTF-8” first.)");
    }
  }
  if (st.size > limits.maxFileBytes) throw new FmError("TOO_BIG", `That file is bigger than ${Math.round(limits.maxFileBytes / 1024 ** 3)} GB, which is more than one import can hold. Split it into smaller files.`);
  const real = realpathSync(path);
  return { path: real, name: real.split(/[\\/]/).pop()!, size: st.size };
}

/** Reads `importFile` / `importOpen` from a request. Returns what the studio should be told, or nothing. */
export async function importAsk(ctx: FmContext, b: Record<string, any>): Promise<ImportAsk | null> {
  if (typeof b.importFile === "string" && b.importFile) return { file: (await checkImportFile(ctx, b.importFile)).path, open: true };
  if (b.importOpen === true) return { open: true };
  return null;
}

/** The extra environment a new studio gets: the secret, what to open, and whether the connection is marked production or read-only. */
export function stagingEnv(token: string, ask: ImportAsk | null, writesNeeded: "production" | "readonly" | null): Record<string, string> {
  const env: Record<string, string> = { STUDIO_STAGING_TOKEN: token };
  if (ask?.file) env.STUDIO_IMPORT_FILE = ask.file;
  else if (ask?.open) env.STUDIO_IMPORT_OPEN = "1";
  if (writesNeeded === "production") env.STUDIO_ENVIRONMENT = "production";
  if (writesNeeded === "readonly") env.STUDIO_READONLY = "1";
  return env;
}

/** Tells a studio that is already running to open the wizard (with a file). Failures are reported, never hidden. */
export async function grantImport(info: StudioInfo, ask: ImportAsk | null): Promise<void> {
  if (!ask) return;
  const token = tokens.get(info.id);
  if (!info.url || info.state !== "running") return; // a studio that is still starting reads it from its environment
  if (!token) throw new FmError("NOT_AVAILABLE", "This studio was started before the import feature was available. Stop it and open it again.");
  const res = await fetch(`${info.url.replace(/\/$/, "")}/api/staging/grant`, { method: "POST", headers: { "content-type": "application/json", "x-staging-grant": token }, body: JSON.stringify(ask.file ? { path: ask.file } : {}) }).catch(() => null);
  if (!res) throw new FmError("OPEN_FAILED", "The studio didn't answer. Try again in a moment.");
  if (!res.ok) {
    const j: any = await res.json().catch(() => null);
    throw new FmError("OPEN_FAILED", j?.error?.message ?? "The studio refused that file.");
  }
}

export const importOperations: Record<string, FmHandler> = {
  /** Is this a file the import can read? (Used before the person picks where it should go.) */
  async "db/import/check"(ctx, b) {
    const f = await checkImportFile(ctx, isObject(b) ? b.path : undefined);
    return { file: { name: f.name, size: f.size } };
  },
};
