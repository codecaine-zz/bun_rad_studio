/**
 * What a conversion is: the shapes the catalog (`fmConvCatalog.ts`) is made of, and the small pure functions that
 * decide which files an action accepts and what its new files are called.
 *
 * One action has one or more engines, best first. An engine is either "built in" (no install; it runs in a worker)
 * or one helper program with the exact arguments to give it. The first engine that can do the job for a file with the
 * installed programs is used; when none can, the action is shown as unavailable with the reason.
 */
import { splitName, uniqueName } from "./fmPaths";
import type { OptionDef, OptionValues } from "./fmConvOptions";
import type { ToolId } from "./fmTools";

export type ConvGroup = "Pictures" | "Video" | "Sound" | "Documents" | "Data & text" | "Archives" | "PDF tools" | "Ebooks" | "Fonts" | "Other";

export const CONV_GROUPS: ConvGroup[] = ["Pictures", "Video", "Sound", "Documents", "Data & text", "Archives", "PDF tools", "Ebooks", "Fonts", "Other"];

export interface BuildContext {
  /** The program to start (the first element of the command). */
  exe: string;
  /** Input files; for "stage" engines these have safe names (in0001.png). */
  inputs: string[];
  /** The file or folder to make; for "stage" engines a temporary place that is copied to the final name afterwards. */
  output: string;
  opts: OptionValues;
  /** A PDF engine for pandoc, when one is installed. */
  pdfEngine?: string;
  /** Name of the (first) original file without its extension. */
  title: string;
  /** The original (not staged) input files. */
  originals: string[];
  platform: "win32" | "darwin" | "linux";
  /** The full path of another installed program (for steps that use two), or null. */
  program(tool: ToolId, name?: string): string | null;
  /** Makes a file with this content in a private temporary folder, and returns its path. */
  tmpFile(name: string, content: string): string;
  /** Makes an empty private temporary folder and returns its path. */
  tmpDir(name: string): string;
  /** Copies a file to a safe name inside a private temporary folder, and returns the new path. */
  tmpCopy(source: string, name: string): string;
  /** What the installed program can do (capability names). */
  caps: string[];
}

export type Argv = string[];
export type Need = string | string[] | undefined;

export interface Engine {
  tool: ToolId | "builtin";
  /** A capability the installed program must have (see `capabilitiesOf` in fmBatch); may depend on the file and options. */
  needs?: Need | ((ext: string, opts: OptionValues) => Need);
  /** Other programs that must be installed too. */
  also?: ToolId[] | ((ext: string) => ToolId[]);
  /** Use this exact program of the tool (for tools with several, like poppler or ImageMagick's `magick`). */
  program?: string;
  /** Only for files with these extensions. */
  accepts?: Set<string>;
  /** Give the program safe temporary names for its input and output (for programs that read `[ ] * % @ :` in names). */
  stage?: boolean;
  /** The base name of a staged single input ("out" makes programs that name their output after the input produce out.ext). */
  stageBase?: string;
  /** The extension of the temporary result file of a staged engine, when it isn't the new file's extension (a program that names its own output). */
  outputExt?: string;
  /** The arguments after the program, or a list of command lines (each starting with its own program) to run one after another. */
  argv?: (c: BuildContext) => Argv | Array<Argv | (() => Argv)>;
  /** The command's output text is the result file. */
  stdoutIsOutput?: boolean;
  /** Run in the folder holding the first original (for programs that must be given relative names). */
  cwdIsInputFolder?: boolean;
  /** A built-in converter: the kind (see fmConvBuiltin) and its fixed settings. */
  builtin?: { kind: string; params?: Record<string, string | number | boolean> };
  /** Stop the program if what it writes grows beyond the safety limits (archive extractors). */
  limitOutput?: boolean;
  timeoutMs?: number;
}

export interface ConvDef {
  id: string;
  label: string;
  /** One plain sentence. */
  hint: string;
  group: ConvGroup;
  /** Extensions (lower case, no dot, "tar.gz" counts as one) of the files this applies to; null means any file. */
  inputs: Set<string> | null;
  /** Folders can be selected too (archives). */
  dirs?: boolean;
  /** Extension of the new file ("" keeps the original's extension); a function when an option decides it. */
  out: string | ((opts: OptionValues) => string);
  /** Used in the new file's name when the format stays the same: "photo (smaller).jpg". */
  suffix: string;
  /** One new file for each selected file, or one for all of them together. */
  mode: "each" | "all";
  /** The new thing is a folder (pages, frames, unpacked files). */
  outKind?: "file" | "folder";
  /** Skip files that already have the output's extension (a same-format conversion makes no sense). */
  rejectSame?: boolean;
  /** Name for "all" actions: "Combined pictures". */
  allName?: string;
  /** With one selected item, name the result after it ("photos.zip") instead of `allName`. */
  singleName?: boolean;
  /** At least this many files for an "all" action. */
  minFiles?: number;
  options?: OptionDef[];
  engines: Engine[];
  /** Extra words for the search box. */
  keywords?: string;
  /** A plain explanation of a bad combination of options, or null. */
  check?: (opts: OptionValues) => string | null;
  /** A plain explanation when the selected files don't fit together (for "all" actions), or null. */
  checkFiles?: (files: string[]) => string | null;
  /** The new file's name (before it is made unique); overrides the usual naming. */
  outName?: (inputName: string, opts: OptionValues, files: string[]) => string;
  /** The label of the "Other" group's button wording for what is made (shown in the preview), e.g. "folder of pictures". */
  makes?: string;
  /** Plain-language note shown with the action (what is lost, what is slow). */
  note?: string;
  /** Not listed in the Convert window; started by another part of the page (the Image and Media Studios). */
  hidden?: boolean;
}

/** The lower-case extension of a file name without the dot ("a.tar.gz" gives "tar.gz"). */
export function extOf(name: string): string {
  return splitName(name)[1].replace(/^\./, "").toLowerCase();
}

export function outExtOf(def: ConvDef, opts: OptionValues): string {
  return typeof def.out === "function" ? def.out(opts) : def.out;
}

/** Can this action be applied to a file with this name? */
export function defAccepts(def: ConvDef, fileName: string, opts: OptionValues = {}): boolean {
  const e = extOf(fileName);
  if (def.inputs && !def.inputs.has(e)) return false;
  if (def.rejectSame) {
    const out = outExtOf(def, opts);
    if (out && out === e) return false;
  }
  return true;
}

/** The new file's (or folder's) name before it is made unique. `files` are all the inputs, for "all" actions. */
export function plannedName(def: ConvDef, inputName: string, opts: OptionValues, files: string[], pattern: string, index: number, apply: (pattern: string, base: string, index: number) => string): string {
  if (def.outName) return def.outName(inputName, opts, files);
  const [base, dotExt] = splitName(inputName);
  const ext = outExtOf(def, opts);
  if (def.outKind === "folder") return pattern ? apply(pattern, base, index) : `${base} (${def.suffix})`;
  if (def.mode === "all") {
    const first = def.singleName && files.length === 1 ? base : def.allName ?? "Combined";
    const stem = pattern ? apply(pattern, first, index) : first;
    return `${stem}.${ext || dotExt.replace(/^\./, "") || "out"}`;
  }
  const inExt = dotExt.replace(/^\./, "").toLowerCase();
  const sameFormat = !ext || ext === inExt;
  if (pattern) return `${apply(pattern, base, index)}${ext ? `.${ext}` : dotExt}`;
  return sameFormat ? `${base} (${def.suffix})${dotExt}` : `${base}.${ext}`;
}

/** A name that doesn't exist yet. */
export function freeName(name: string, exists: (candidate: string) => boolean): string {
  return uniqueName(name, exists);
}

/** Shorthand for a set of extensions written as one string. */
export const exts = (list: string): Set<string> => new Set(list.split(/\s+/).filter(Boolean));

// ---------------------------------------------------------------------------------------------------------------
// Shorthands for describing options
// ---------------------------------------------------------------------------------------------------------------

export const numberOpt = (id: string, label: string, hint: string, min: number, max: number, def: number, unit = "", step = 1): OptionDef => ({ id, label, hint, kind: "number", min, max, step, unit, default: def });
export const choiceOpt = (id: string, label: string, hint: string, choices: Array<[string, string] | [string, string, string]>, def: string): OptionDef => ({
  id, label, hint, kind: "choice", default: def, choices: choices.map(([value, text, needs]) => ({ value, label: text, ...(needs ? { needs } : {}) })),
});
export const timeOpt = (id: string, label: string, hint: string): OptionDef => ({ id, label, hint, kind: "time", default: "" });
export const toggleOpt = (id: string, label: string, hint: string, def = false): OptionDef => ({ id, label, hint, kind: "toggle", default: def });
export const textOpt = (id: string, label: string, hint: string, def = "", maxLength = 100): OptionDef => ({ id, label, hint, kind: "text", default: def, maxLength });
export const pagesOpt = (id: string, label: string, hint: string, def = ""): OptionDef => ({ id, label, hint, kind: "pages", default: def });
