/**
 * Where the connection settings in this program's environment really come from. Bun copies `.env` files from its
 * start folder into `process.env` before any code runs, so a variable may be a real one, one Bun loaded from a file,
 * or (in the app's install folder, or when Bun was told not to load files) one that is only written in a file.
 * This module reads those files (read-only, see fmDbDotenv.ts) and says where each value came from.
 */
import { promises as fsp } from "fs";
import { readDotenvFolder, type DotenvFolder } from "./fmDbDotenv";
import { isAnyConnectionVariable } from "./fmDbModel";

export interface Provenance {
  kind: "process" | "file";
  variable: string;
  /** ".env", ".env.local" ... for a value that came from a file. */
  file?: string;
  /** "application": start folder and install folder are the same; otherwise "start" (where the program was started) or "install". */
  where?: "application" | "start" | "install" | "chosen";
  /** The folder, with the home folder written as ~. */
  shown?: string;
  /** For a file value: the value is really in the environment (Bun loaded it). */
  loaded?: boolean;
  /** For a real variable that hides a value written in a file: the file names (never the values). */
  overrides?: string[];
}

export interface EnvVar {
  name: string;
  value: string;
  prov: Provenance;
}

export interface FileNote {
  file: string;
  where: "application" | "start" | "install";
  shown: string;
  /** Skipped for a safety reason (a link is never followed). */
  skipped?: string;
  count: number;
}

export interface EnvView {
  vars: Map<string, EnvVar>;
  files: FileNote[];
  nodeEnv: string;
}

export interface EnvViewInput {
  env: Record<string, string | undefined>;
  cwd: string;
  roots: string[];
  home: string;
}

export const tilde = (path: string, home: string) => (home && (path === home || path.startsWith(home + "/") || path.startsWith(home + "\\")) ? "~" + path.slice(home.length) : path);

async function real(path: string): Promise<string> {
  try {
    return await fsp.realpath(path);
  } catch {
    return path;
  }
}

export async function buildEnvView(input: EnvViewInput): Promise<EnvView> {
  const dirs: Array<{ real: string; shown: string }> = [];
  for (const d of [input.cwd, ...input.roots]) {
    if (!d) continue;
    const r = await real(d);
    if (!dirs.some((x) => x.real === r)) dirs.push({ real: r, shown: d });
  }
  const single = dirs.length <= 1;
  const folders: DotenvFolder[] = [];
  for (const d of dirs) folders.push(await readDotenvFolder(d.real, input.env.NODE_ENV, input.env));
  const shownDir = (i: number) => tilde(dirs[i]!.shown, input.home);
  const whereOf = (i: number): "application" | "start" | "install" => (single ? "application" : i === 0 ? "start" : "install");

  const files: FileNote[] = [];
  folders.forEach((f, i) => {
    for (const file of f.files) files.push({ file: file.name, where: whereOf(i), shown: shownDir(i), skipped: file.skipped, count: file.count });
  });

  const names = new Set<string>();
  for (const n of Object.keys(input.env)) if (isAnyConnectionVariable(n)) names.add(n);
  for (const f of folders) for (const n of f.values.keys()) if (isAnyConnectionVariable(n)) names.add(n);

  const vars = new Map<string, EnvVar>();
  for (const name of names) {
    const proc = input.env[name];
    const hits: Array<{ hit: NonNullable<ReturnType<DotenvFolder["values"]["get"]>>; i: number }> = [];
    folders.forEach((f, i) => {
      const hit = f.values.get(name);
      if (hit) hits.push({ hit, i });
    });
    const fileProv = (x: (typeof hits)[number], loaded: boolean): Provenance => ({ kind: "file", variable: name, file: x.hit.file, where: whereOf(x.i), shown: shownDir(x.i), loaded });
    if (proc !== undefined) {
      const first = hits[0];
      if (first && first.i === 0 && first.hit.value === proc) vars.set(name, { name, value: proc, prov: fileProv(first, true) });
      else vars.set(name, { name, value: proc, prov: { kind: "process", variable: name, ...(hits.length ? { overrides: hits.map((x) => x.hit.file) } : {}) } });
    } else if (hits.length) {
      vars.set(name, { name, value: hits[0]!.hit.value, prov: fileProv(hits[0]!, false) });
    }
  }
  return { vars, files, nodeEnv: input.env.NODE_ENV ?? "" };
}

/** "environment variable NAME", or "`.env.local` in the start folder (~/app), variable NAME" and what is special about it. */
export function provenanceText(p: Provenance): string {
  if (p.kind === "process") return `environment variable ${p.variable}${p.overrides?.length ? ` (overrides ${p.overrides.join(", ")})` : ""}`;
  if (p.where === "chosen") return `the file you chose (${p.shown}), variable ${p.variable}`;
  const place = p.where === "application" ? "the application folder" : p.where === "install" ? "the install folder" : "the start folder";
  const base = `\`${p.file}\` in ${place} (${p.shown}), variable ${p.variable}`;
  return p.loaded ? base : `${base}; found in the file but not loaded into the environment`;
}
