/**
 * Detecting the helper programs, listing what they can do with the selected files, and turning a choice into a job.
 * The pure parts (catalog, command building, install plans) are in `fmTools.ts`; running is in `fmJobs.ts`.
 */
import { copyFileSync, constants as fsConstants, existsSync, mkdtempSync, rmSync, statSync, symlinkSync } from "fs";
import { promises as fsp } from "fs";
import { tmpdir } from "os";
import * as nodePath from "path";
import { absolutePath, assertCreatable, pathApi, type FmContext } from "./fmCore";
import type { JobStepSpec, JobView } from "./fmJobs";
import { lastLines } from "./fmJobs";
import { FmError, uniqueName } from "./fmPaths";
import {
  ACTIONS, ACTION_BY_ID, PDF_ENGINES, TOOLS, TOOL_IDS, actionAccepts, buildArgs, childEnv, ffmpegCapabilities, findExecutable, imageMagickCapabilities,
  installPlan, missingCapability, outputName, searchDirs, type ActionDef, type InstallPlan, type ManagerId, type Managers, type ToolId,
} from "./fmTools";

const MAX_FILES = 500;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// ---------------------------------------------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------------------------------------------

async function capture(argv: string[], env: Record<string, string>, timeoutMs = 8000): Promise<{ code: number | null; text: string }> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", env });
  } catch {
    return { code: null, text: "" };
  }
  const timer = setTimeout(() => { try { proc.kill(); } catch {} }, timeoutMs);
  try {
    const [out, err, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
    return { code, text: out + (err ? `\n${err}` : "") };
  } catch {
    return { code: null, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

const MANAGER_PROGRAMS: Record<ManagerId, string[]> = { brew: ["brew"], winget: ["winget"], scoop: ["scoop"], choco: ["choco"], apt: ["apt-get"], dnf: ["dnf"], pacman: ["pacman"] };

export function detectManagers(ctx: FmContext): Managers {
  const dirs = searchDirs(ctx);
  const found: Managers = {};
  for (const [id, names] of Object.entries(MANAGER_PROGRAMS) as Array<[ManagerId, string[]]>) {
    const p = findExecutable(ctx.platform, names, dirs);
    if (p) found[id] = id === "apt" ? p.replace(/apt-get(\.exe)?$/, "apt") : p;
  }
  return found;
}

/** The program for a tool, or null. ImageMagick 6 calls itself `convert`, which on Windows is something else, so it is only tried elsewhere. */
export function resolveTool(ctx: FmContext, tool: ToolId): string | null {
  const dirs = searchDirs(ctx);
  const names = TOOLS[tool].executables.filter((n) => !(ctx.platform === "win32" && n === "convert"));
  return findExecutable(ctx.platform, names, dirs);
}

export interface ToolStatus {
  id: ToolId;
  name: string;
  what: string;
  website: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  capabilities: string[];
  /** False when the program could not be asked what it can do; nothing is then reported as missing. */
  capabilitiesKnown: boolean;
  plan: InstallPlan;
}

function parseVersion(text: string): string | null {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return /(\d+\.\d+(?:\.\d+)*[\w.+-]*)/.exec(first)?.[1] ?? null;
}

async function probe(ctx: FmContext, id: ToolId, managers: Managers): Promise<ToolStatus> {
  const def = TOOLS[id];
  const env = childEnv(ctx);
  const plan = installPlan(ctx.platform, id, managers);
  const base: ToolStatus = { id, name: def.name, what: def.what, website: def.website, installed: false, path: null, version: null, capabilities: [], capabilitiesKnown: false, plan };
  const path = resolveTool(ctx, id);
  if (!path) return base;
  const v = await capture([path, ...def.versionArgs], env);
  if (v.code !== 0 && !v.text.trim()) return base;
  // "convert" might be another program that happens to have that name.
  if (id === "imagemagick" && !/ImageMagick/i.test(v.text)) return base;
  const caps = await capabilitiesOf(ctx, id, path, env);
  return { ...base, installed: true, path, version: parseVersion(v.text), capabilities: caps ?? [], capabilitiesKnown: caps !== null };
}

// What a program can do rarely changes, and asking takes a moment, so the answer is kept until the file changes.
const capabilityCache = new Map<string, string[]>();

async function capabilitiesOf(ctx: FmContext, id: ToolId, path: string, env: Record<string, string>): Promise<string[] | null> {
  if (id === "pandoc") return pdfEngineFor(ctx) ? ["pdfengine"] : [];
  const mtime = statSync(path).mtimeMs;
  const key = `${path}|${mtime}`;
  const cached = capabilityCache.get(key);
  if (cached) return cached;
  const asked = id === "ffmpeg" ? await capture([path, "-hide_banner", "-encoders"], env, 30000) : await capture([path, "-list", "format"], env, 30000);
  if (asked.code !== 0 || !asked.text.trim()) return null;
  const caps = id === "ffmpeg" ? ffmpegCapabilities(asked.text) : imageMagickCapabilities(asked.text);
  capabilityCache.set(key, caps);
  return caps;
}

export function pdfEngineFor(ctx: FmContext): string | null {
  const dirs = searchDirs(ctx);
  for (const e of PDF_ENGINES) if (findExecutable(ctx.platform, [e], dirs)) return e;
  return null;
}

export async function toolStatus(ctx: FmContext): Promise<{ platform: string; managers: Managers; tools: ToolStatus[] }> {
  const managers = detectManagers(ctx);
  const tools = await Promise.all(TOOL_IDS.map((id) => probe(ctx, id, managers)));
  return { platform: ctx.platform, managers, tools };
}

// ---------------------------------------------------------------------------------------------------------------
// What can be done with these files
// ---------------------------------------------------------------------------------------------------------------

export interface ActionInfo {
  id: string;
  label: string;
  hint: string;
  group: ActionDef["group"];
  tool: ToolId;
  /** How many of the selected files this applies to. */
  count: number;
  available: boolean;
  /** Why it can't be used, in plain words. */
  why: string;
}

async function filesOnly(ctx: FmContext, paths: unknown): Promise<string[]> {
  if (!Array.isArray(paths)) throw new FmError("BAD_REQUEST", "No files were given.");
  if (paths.length > MAX_FILES) throw new FmError("TOO_MANY", `Please choose at most ${MAX_FILES} files at a time.`);
  const files: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const p = absolutePath(ctx, raw);
    if (seen.has(p)) continue;
    seen.add(p);
    const st = await fsp.stat(p).catch(() => null);
    if (st?.isFile()) files.push(p);
  }
  return files;
}

export async function overview(ctx: FmContext, paths: unknown) {
  const status = await toolStatus(ctx);
  const files = Array.isArray(paths) && paths.length ? await filesOnly(ctx, paths) : [];
  const p = pathApi(ctx);
  const actions: ActionInfo[] = [];
  for (const a of ACTIONS) {
    const count = files.filter((f) => actionAccepts(a, p.basename(f))).length;
    if (!count || (a.combine && count < 2)) continue;
    const tool = status.tools.find((t) => t.id === a.tool)!;
    let why = "";
    if (!tool.installed) why = `${tool.name} isn't installed yet. Install it below.`;
    else why = tool.capabilitiesKnown ? missingCapability(a, tool.capabilities, a.tool) ?? "" : "";
    actions.push({ id: a.id, label: a.label, hint: a.hint, group: a.group, tool: a.tool, count, available: !why, why });
  }
  return { ...status, selected: files.length, actions };
}

// ---------------------------------------------------------------------------------------------------------------
// Making a job
// ---------------------------------------------------------------------------------------------------------------

export function explainFailure(tool: ToolId, text: string, code: number | null): string {
  const t = text.replace(/\r/g, "\n");
  const generic = lastLines(t, 2) || `It stopped with an error (code ${code}).`;
  if (/No space left on device|disk is full|ENOSPC/i.test(t)) return "The disk is full.";
  if (/Permission denied|Access is denied|EACCES/i.test(t)) return "No permission to write in this folder.";
  if (tool === "ffmpeg") {
    if (/Unknown encoder|Encoder .* not found|Automatic encoder selection failed/i.test(t)) return `This ffmpeg can't make that format. The "ffmpeg-full" build can.`;
    if (/moov atom not found|Invalid data found|could not find codec parameters/i.test(t)) return "ffmpeg can't read this file. It may be damaged, unfinished, or not really a video.";
    if (/No such file or directory/i.test(t)) return "The file could not be found. Was it moved?";
  }
  if (tool === "imagemagick") {
    if (/no decode delegate|NoDecodeDelegateForThisImageFormat/i.test(t)) return `ImageMagick can't read this kind of picture. The "imagemagick-full" build reads more formats (for example HEIC).`;
    if (/no encode delegate|NoEncodeDelegateForThisImageFormat/i.test(t)) return `ImageMagick can't write that format. The "imagemagick-full" build writes more.`;
    if (/not authorized|policy/i.test(t)) return "ImageMagick's security policy blocks this format. Its policy.xml file can allow it.";
    if (/unable to open image|no such file/i.test(t)) return "The picture could not be opened. It may be damaged.";
  }
  if (tool === "pandoc") {
    if (/Unknown (reader|writer)/i.test(t)) return "pandoc doesn't know that file format.";
    if (/pdflatex|xelatex|lualatex|typst|pdf-engine|not found/i.test(t) && /pdf/i.test(t)) return "pandoc needs a PDF engine such as Typst or LaTeX to make a PDF.";
    if (/invalid byte sequence|UTF-8|hGetContents/i.test(t)) return "This file isn't plain text that pandoc can read (it is not UTF-8).";
  }
  return generic;
}

/** A name that needs no care when handed to ImageMagick, which reads `[`, `*`, `%` and `:` in file names as instructions. */
function stageFor(ctx: FmContext, inputs: string[], outExt: string) {
  const dir = mkdtempSync(nodePath.join(tmpdir(), "fm-magick-"));
  const staged: string[] = [];
  inputs.forEach((input, i) => {
    const ext = nodePath.extname(input).toLowerCase().replace(/[^.a-z0-9]/g, "");
    const target = nodePath.join(dir, `in${String(i + 1).padStart(4, "0")}${ext}`);
    try {
      symlinkSync(input, target);
    } catch {
      copyFileSync(input, target);
    }
    staged.push(target);
  });
  const out = nodePath.join(dir, `out.${outExt}`);
  return { dir, staged, out, cleanup: async () => { rmSync(dir, { recursive: true, force: true }); } };
}

function publishTo(out: string, final: string) {
  return async () => {
    // COPYFILE_EXCL: never replace a file that appeared while we were working.
    copyFileSync(out, final, fsConstants.COPYFILE_EXCL);
  };
}

export async function startBatch(ctx: FmContext, actionId: unknown, paths: unknown): Promise<JobView> {
  const action = typeof actionId === "string" ? ACTION_BY_ID.get(actionId) : undefined;
  if (!action) throw new FmError("UNKNOWN_ACTION", "That action isn't known.");
  const exe = resolveTool(ctx, action.tool);
  if (!exe) throw new FmError("TOOL_MISSING", `${TOOLS[action.tool].name} isn't installed yet. Choose Install in the Convert & process window.`);
  const p = pathApi(ctx);
  const all = await filesOnly(ctx, paths);
  const files = all.filter((f) => actionAccepts(action, p.basename(f)));
  if (!files.length) throw new FmError("NOTHING_TO_DO", "None of the selected files can be used for this.");
  const env = childEnv(ctx);
  const pdfEngine = action.out === "pdf" && action.tool === "pandoc" ? pdfEngineFor(ctx) ?? undefined : undefined;
  if (action.needs === "pdfengine" && !pdfEngine) throw new FmError("TOOL_MISSING", "Making a PDF needs a PDF engine such as Typst or LaTeX.");
  const explain = (text: string, code: number | null) => explainFailure(action.tool, text, code);
  const taken = new Set<string>();
  const free = (dir: string) => (name: string) => taken.has(p.join(dir, name)) || existsSync(p.join(dir, name));
  const steps: JobStepSpec[] = [];

  if (action.combine) {
    if (files.length < 2) throw new FmError("NOTHING_TO_DO", "Select at least two pictures to combine.");
    const sorted = [...files].sort((a, b) => collator.compare(p.basename(a), p.basename(b)));
    const dir = p.dirname(sorted[0]!);
    assertCreatable(ctx, dir);
    const finalName = uniqueName("Combined pictures.pdf", free(dir));
    const final = p.join(dir, finalName);
    steps.push({
      label: `${sorted.length} pictures → ${finalName}`,
      output: final,
      env,
      explain,
      prepare: async () => {
        const st = stageFor(ctx, sorted, action.out);
        return { argv: [exe, ...buildArgs(action, st.staged, st.out)], publish: publishTo(st.out, final), cleanup: st.cleanup };
      },
    });
  } else {
    for (const file of files) {
      const dir = p.dirname(file);
      assertCreatable(ctx, dir);
      const name = outputName(action, p.basename(file), free(dir));
      const final = p.join(dir, name);
      taken.add(final);
      const label = `${p.basename(file)} → ${name}`;
      if (action.tool === "imagemagick") {
        steps.push({
          label, output: final, env, explain,
          prepare: async () => {
            const st = stageFor(ctx, [file], nodePath.extname(name).slice(1));
            return { argv: [exe, ...buildArgs(action, st.staged[0]!, st.out)], publish: publishTo(st.out, final), cleanup: st.cleanup };
          },
        });
      } else {
        steps.push({ label, output: final, env, explain, argv: [exe, ...buildArgs(action, file, final, { pdfEngine, title: splitBase(p.basename(file)) })] });
      }
    }
  }
  const title = `${action.label}: ${files.length} ${files.length === 1 ? "file" : "files"}`;
  return ctx.jobs.start({ kind: "convert", title, steps });
}

function splitBase(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

// ---------------------------------------------------------------------------------------------------------------
// Installing
// ---------------------------------------------------------------------------------------------------------------

export function startInstall(ctx: FmContext, tools: unknown): JobView {
  const wanted = (Array.isArray(tools) ? tools : [tools]).filter((t): t is ToolId => typeof t === "string" && (TOOL_IDS as string[]).includes(t));
  if (!wanted.length) throw new FmError("UNKNOWN_TOOL", "Choose a program to install.");
  const managers = detectManagers(ctx);
  const env = childEnv(ctx);
  const steps: JobStepSpec[] = [];
  for (const id of [...new Set(wanted)]) {
    if (resolveTool(ctx, id)) continue;
    const plan = installPlan(ctx.platform, id, managers);
    if (!plan.auto || !plan.argv) throw new FmError("MANUAL_INSTALL", plan.missingManager ? `${plan.missingManager.name} isn't installed, so ${TOOLS[id].name} can't be installed from here. ${plan.missingManager.note}` : `${TOOLS[id].name} needs your administrator password, so install it in a terminal: ${plan.display}`);
    steps.push({
      label: `Installing ${TOOLS[id].name} (${plan.display})`,
      argv: plan.argv,
      env,
      timeoutMs: 60 * 60 * 1000,
      explain: (text) => (/already installed|up-to-date/i.test(text) ? "" : lastLines(text, 3) || "The installer stopped with an error."),
    });
  }
  if (!steps.length) throw new FmError("ALREADY_INSTALLED", "That program is already installed.");
  return ctx.jobs.start({ kind: "install", title: steps.length === 1 ? steps[0]!.label : `Installing ${steps.length} programs`, steps });
}
