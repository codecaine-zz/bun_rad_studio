/**
 * Planning and running conversions: which files an action applies to, which engine does the work for each file,
 * what the new files will be called, and the job steps that make them.
 *
 * Nothing here builds a shell command: an engine gives a list of arguments, and every value that came from a person
 * has been through `fmConvOptions.ts` first. New files never replace anything: names are made unique, the finished
 * result is put in place only if its name is still free, and a failed step removes what it made.
 */
import { existsSync, promises as fsp } from "fs";
import { CATALOG, CATALOG_BY_ID } from "./fmConvCatalog";
import type { BuiltinJob } from "./fmConvBuiltin";
import { EXTRACT_LIMITS, Stage, publishFile, publishFolder, removeQuietly, runCommands, sanitizeExtracted, siblingTemp } from "./fmConvExec";
import { applyPattern, validateOptions, validatePattern, type OptionDef, type OptionValues } from "./fmConvOptions";
import { runBuiltinInWorker } from "./fmConvRun";
import { CONV_GROUPS, defAccepts, extOf, freeName, outExtOf, plannedName, type BuildContext, type ConvDef, type ConvGroup, type Engine } from "./fmConvTypes";
import { absolutePath, assertCreatable, pathApi, type FmContext } from "./fmCore";
import type { JobStepSpec, JobView, PreparedStep } from "./fmJobs";
import { FmError, validateName } from "./fmPaths";
import { explainFailure, pdfEngineFor, resolveTool, toolStatus, type ToolStatus } from "./fmToolDetect";
import { TOOLS, childEnv, missingCapability, type ToolId } from "./fmTools";

export const MAX_FILES = 500;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type Status = Awaited<ReturnType<typeof toolStatus>>;

// ---------------------------------------------------------------------------------------------------------------
// The selection
// ---------------------------------------------------------------------------------------------------------------

export interface Selection {
  files: string[];
  dirs: string[];
}

/** The files and folders among the paths (anything that doesn't exist is ignored). */
export async function classifyPaths(ctx: FmContext, paths: unknown): Promise<Selection> {
  if (!Array.isArray(paths)) throw new FmError("BAD_REQUEST", "No files were given.");
  if (paths.length > MAX_FILES) throw new FmError("TOO_MANY", `Please choose at most ${MAX_FILES} files at a time.`);
  const sel: Selection = { files: [], dirs: [] };
  const seen = new Set<string>();
  for (const raw of paths) {
    const p = absolutePath(ctx, raw);
    if (seen.has(p)) continue;
    seen.add(p);
    const st = await fsp.stat(p).catch(() => null);
    if (st?.isFile()) sel.files.push(p);
    else if (st?.isDirectory()) sel.dirs.push(p);
  }
  return sel;
}

// ---------------------------------------------------------------------------------------------------------------
// Which engine can do it
// ---------------------------------------------------------------------------------------------------------------

const toolOf = (st: Status, id: ToolId): ToolStatus => st.tools.find((t) => t.id === id)!;
const needList = (engine: Engine, ext: string, opts: OptionValues): string[] => {
  const n = typeof engine.needs === "function" ? engine.needs(ext, opts) : engine.needs;
  return n === undefined ? [] : Array.isArray(n) ? n : [n];
};

/** Does the program have this capability? A list of formats we couldn't read never blocks. */
function hasCapability(caps: string[], need: string): boolean {
  if (need.startsWith("reader-") || need.startsWith("writer-")) {
    const prefix = need.slice(0, need.indexOf("-") + 1);
    if (!caps.some((c) => c.startsWith(prefix))) return true;
  }
  return caps.includes(need);
}

interface Usable {
  ok: boolean;
  /** This engine doesn't apply to the file at all (not a reason to report). */
  skip: boolean;
  why: string;
  /** The reason is a program that isn't installed. */
  missing: boolean;
  /** The programs to install to make it work. */
  install: ToolId[];
}

function engineUsable(ctx: FmContext, st: Status, engine: Engine, ext: string, opts: OptionValues): Usable {
  const no = (why: string, missing = false, install: ToolId[] = []): Usable => ({ ok: false, skip: false, why, missing, install });
  if (engine.accepts && !engine.accepts.has(ext)) return { ok: false, skip: true, why: "", missing: false, install: [] };
  if (engine.tool === "builtin") return { ok: true, skip: false, why: "", missing: false, install: [] };
  const tool = toolOf(st, engine.tool);
  if (!tool.installed) return no(`${tool.name} isn't installed yet. Install it below.`, true, [tool.id]);
  if (engine.program && !resolveTool(ctx, engine.tool, engine.program)) return no(`${tool.name} is installed, but its "${engine.program}" program wasn't found.`);
  const also = typeof engine.also === "function" ? engine.also(ext) : engine.also ?? [];
  for (const id of also) {
    const t = toolOf(st, id);
    if (!t.installed) return no(`This also needs ${t.name}, which isn't installed yet. Install it below.`, true, [id]);
  }
  if (tool.capabilitiesKnown) {
    for (const need of needList(engine, ext, opts)) {
      if (!hasCapability(tool.capabilities, need)) return no(missingCapability({ needs: need }, tool.capabilities, tool.id) ?? "That isn't available with the installed program.");
    }
  }
  return { ok: true, skip: false, why: "", missing: false, install: [] };
}

interface Picked {
  engine: Engine | null;
  why: string;
  missing: boolean;
  install: ToolId[];
}

/** The first engine that works for every one of these file types. */
function pickEngine(ctx: FmContext, st: Status, def: ConvDef, exts: string[], opts: OptionValues): Picked {
  let first: Usable | null = null;
  for (const engine of def.engines) {
    let verdict: Usable | null = null;
    for (const ext of exts) {
      const u = engineUsable(ctx, st, engine, ext, opts);
      if (!u.ok) { verdict = u; break; }
    }
    if (!verdict) return { engine, why: "", missing: false, install: [] };
    if (!verdict.skip && !first) first = verdict;
  }
  return { engine: null, why: first?.why || "No installed program can do this with these files.", missing: first?.missing ?? false, install: first?.install ?? [] };
}

// ---------------------------------------------------------------------------------------------------------------
// What the window shows
// ---------------------------------------------------------------------------------------------------------------

export interface ChoiceView {
  value: string;
  label: string;
  available: boolean;
  why: string;
}

export interface OptionView extends Omit<OptionDef, "choices"> {
  choices?: ChoiceView[];
}

export interface ActionInfo {
  id: string;
  label: string;
  hint: string;
  group: ConvGroup;
  /** The program that does the work (or would, once installed); "builtin" when nothing needs installing. */
  tool: ToolId | "builtin";
  /** How many of the selected files (and folders, where they count) this applies to. */
  count: number;
  available: boolean;
  /** Why it can't be used, in plain words. */
  why: string;
  /** Built in: needs nothing installed. */
  builtin: boolean;
  /** Programs that would make it available. */
  installTools: ToolId[];
  mode: "each" | "all";
  outKind: "file" | "folder";
  /** Extension of the new file ("" when it keeps the original's, or for a folder). */
  out: string;
  options: OptionView[];
  keywords: string;
  note: string;
  /** All the engines that apply to the selected files, best first, as plain names. */
  engines: Array<{ tool: ToolId | "builtin"; name: string; usable: boolean }>;
  minFiles: number;
}

function toolsOfDef(def: ConvDef, st: Status): ToolStatus[] {
  const ids = new Set<ToolId>();
  for (const e of def.engines) if (e.tool !== "builtin") ids.add(e.tool);
  return [...ids].map((id) => toolOf(st, id));
}

function choiceAvailable(def: ConvDef, st: Status, need: string | undefined): { ok: boolean; why: string } {
  if (!need) return { ok: true, why: "" };
  const tools = toolsOfDef(def, st).filter((t) => t.installed);
  if (!tools.length) return { ok: true, why: "" };
  if (tools.some((t) => !t.capabilitiesKnown || hasCapability(t.capabilities, need))) return { ok: true, why: "" };
  return { ok: false, why: missingCapability({ needs: need }, tools[0]!.capabilities, tools[0]!.id) ?? "Not available with the installed program." };
}

/** The values each choice option may have right now: narrowed by what the installed programs can do. */
function dynamicChoices(def: ConvDef, st: Status): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const opt of def.options ?? []) {
    if (opt.kind !== "choice") continue;
    if (opt.choicesFromCaps) {
      const tools = toolsOfDef(def, st).filter((t) => t.installed && t.capabilitiesKnown);
      const prefix = opt.choicesFromCaps.prefix;
      const fromCaps = tools.flatMap((t) => t.capabilities.filter((c) => c.startsWith(prefix)).map((c) => c.slice(prefix.length)));
      if (fromCaps.length) out[opt.id] = fromCaps;
    } else if (opt.choices?.some((c) => c.needs)) {
      out[opt.id] = opt.choices.filter((c) => choiceAvailable(def, st, c.needs).ok).map((c) => c.value);
    }
  }
  return out;
}

function optionViews(def: ConvDef, st: Status): OptionView[] {
  return (def.options ?? []).map((opt): OptionView => {
    const { choices, ...rest } = opt;
    if (opt.kind !== "choice") return rest;
    if (opt.choicesFromCaps) {
      const dyn = dynamicChoices(def, st)[opt.id];
      if (dyn) return { ...rest, choices: dyn.map((v) => ({ value: v, label: v, available: true, why: "" })) };
    }
    return { ...rest, choices: (choices ?? []).map((c) => { const a = choiceAvailable(def, st, c.needs); return { value: c.value, label: c.label, available: a.ok, why: a.why }; }) };
  });
}

export function defaultOptions(def: ConvDef): OptionValues {
  return validateOptions(def.options, {});
}

const engineName = (e: Engine) => (e.tool === "builtin" ? "Built in" : TOOLS[e.tool].name);

export async function overview(ctx: FmContext, paths: unknown) {
  const status = await toolStatus(ctx);
  const sel = Array.isArray(paths) && paths.length ? await classifyPaths(ctx, paths) : { files: [], dirs: [] };
  const p = pathApi(ctx);
  const actions: ActionInfo[] = [];
  for (const def of CATALOG) {
    const accepted = [...sel.files.filter((f) => defAccepts(def, p.basename(f))), ...(def.dirs ? sel.dirs : [])];
    const minFiles = def.mode === "all" ? def.minFiles ?? 1 : 1;
    if (!accepted.length || (def.mode === "all" && accepted.length < minFiles)) continue;
    const opts = defaultOptions(def);
    const exts = [...new Set(accepted.map((f) => (sel.dirs.includes(f) ? "" : extOf(p.basename(f)))))];
    let picked: Picked;
    if (def.mode === "all") picked = pickEngine(ctx, status, def, exts, opts);
    else {
      // Available when it works for at least one of the files; each file's own problem is reported when it runs.
      const each = exts.map((e) => pickEngine(ctx, status, def, [e], opts));
      picked = each.find((x) => x.engine) ?? each[0]!;
    }
    const applicable = def.engines.filter((e) => !e.accepts || exts.some((x) => e.accepts!.has(x)));
    const first = picked.engine ?? applicable[0] ?? def.engines[0]!;
    actions.push({
      id: def.id, label: def.label, hint: def.hint, group: def.group, tool: first.tool, count: accepted.length, available: !!picked.engine, why: picked.engine ? "" : picked.why,
      builtin: first.tool === "builtin", installTools: picked.engine ? [] : picked.install, mode: def.mode, outKind: def.outKind ?? "file", out: typeof def.out === "string" ? def.out : "",
      options: optionViews(def, status), keywords: def.keywords ?? "", note: def.note ?? "", minFiles,
      engines: applicable.map((e) => ({ tool: e.tool, name: engineName(e), usable: exts.some((x) => engineUsable(ctx, status, e, x, opts).ok) })),
    });
  }
  return { ...status, selected: sel.files.length, folders: sel.dirs.length, groups: CONV_GROUPS, actions };
}

// ---------------------------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------------------------

export interface ConvertRequest {
  action?: unknown;
  paths?: unknown;
  options?: unknown;
  outputDir?: unknown;
  pattern?: unknown;
}

export interface PlanItem {
  /** The original files (or folders) this item uses, in order. */
  originals: string[];
  dir: string;
  name: string;
  path: string;
  engine: Engine | null;
  /** Why no engine can do this item (when `engine` is null). */
  why: string;
  missing: boolean;
}

export interface Plan {
  def: ConvDef;
  opts: OptionValues;
  items: PlanItem[];
  /** How many of the selected files this action can't use. */
  skipped: number;
  status: Status;
}

async function mtimeOf(p: string): Promise<number> {
  return (await fsp.stat(p).catch(() => null))?.mtimeMs ?? 0;
}

export async function planConvert(ctx: FmContext, req: ConvertRequest): Promise<Plan> {
  const def = typeof req.action === "string" ? CATALOG_BY_ID.get(req.action) : undefined;
  if (!def) throw new FmError("UNKNOWN_ACTION", "That action isn't known.");
  const sel = await classifyPaths(ctx, req.paths);
  const status = await toolStatus(ctx);
  const opts = validateOptions(def.options, req.options, dynamicChoices(def, status));
  const problem = def.check?.(opts);
  if (problem) throw new FmError("BAD_OPTION", problem);
  const pattern = validatePattern(req.pattern);
  const p = pathApi(ctx);

  const files = sel.files.filter((f) => defAccepts(def, p.basename(f), opts));
  const accepted = [...files, ...(def.dirs ? sel.dirs : [])];
  if (!accepted.length) throw new FmError("NOTHING_TO_DO", "None of the selected files can be used for this.");
  const skipped = sel.files.length + (def.dirs ? sel.dirs.length : 0) - accepted.length;
  const minFiles = def.mode === "all" ? def.minFiles ?? 1 : 1;
  if (accepted.length < minFiles) throw new FmError("NOTHING_TO_DO", `Select at least ${minFiles} ${minFiles === 2 ? "files" : "items"} for this.`);

  let outDir: string | null = null;
  if (req.outputDir !== undefined && req.outputDir !== null && req.outputDir !== "") {
    outDir = absolutePath(ctx, req.outputDir);
    const st = await fsp.stat(outDir).catch(() => null);
    if (!st?.isDirectory()) throw new FmError("NOT_A_FOLDER", "The folder for the new files doesn't exist. Choose another one.");
    assertCreatable(ctx, outDir);
  }

  const taken = new Set<string>();
  const free = (dir: string) => (name: string) => taken.has(p.join(dir, name)) || existsSync(p.join(dir, name));
  const items: PlanItem[] = [];
  const makeItem = (originals: string[], dir: string, wanted: string): PlanItem => {
    assertCreatable(ctx, dir);
    const name = freeName(wanted, free(dir));
    const reason = validateName(name, ctx.platform);
    if (reason) throw new FmError("BAD_NAME", `The new file's name "${name}" can't be used: ${reason}`);
    const path = p.join(dir, name);
    taken.add(path);
    const exts = [...new Set(originals.map((o) => (sel.dirs.includes(o) ? "" : extOf(p.basename(o)))))];
    const picked = pickEngine(ctx, status, def, exts, opts);
    return { originals, dir, name, path, engine: picked.engine, why: picked.why, missing: picked.missing };
  };

  if (def.mode === "all") {
    const ordered = [...accepted];
    const order = String(opts.order ?? "name");
    if (order === "selected") {
      const index = new Map((req.paths as unknown[]).map((x, i) => [typeof x === "string" ? p.resolve(x) : "", i]));
      ordered.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
    } else if (order === "modified") {
      const times = new Map<string, number>();
      for (const f of ordered) times.set(f, await mtimeOf(f));
      ordered.sort((a, b) => times.get(a)! - times.get(b)! || collator.compare(p.basename(a), p.basename(b)));
    } else ordered.sort((a, b) => collator.compare(p.basename(a), p.basename(b)));
    const bad = def.checkFiles?.(ordered);
    if (bad) throw new FmError("BAD_OPTION", bad);
    const dir = outDir ?? p.dirname(ordered[0]!);
    items.push(makeItem(ordered, dir, plannedName(def, p.basename(ordered[0]!), opts, ordered, pattern, 1, applyPattern)));
  } else {
    accepted.forEach((f, i) => {
      items.push(makeItem([f], outDir ?? p.dirname(f), plannedName(def, p.basename(f), opts, [f], pattern, i + 1, applyPattern)));
    });
  }
  return { def, opts, items, skipped, status };
}

export interface PreviewItem {
  from: string[];
  to: string;
  folder: string;
  /** The name of the program that will do it ("Built in" for converters that need nothing). */
  engine: string;
  /** Set when this one can't be done, in plain words. */
  problem: string;
}

/** What would be made, without making anything. */
export async function previewConvert(ctx: FmContext, req: ConvertRequest) {
  const plan = await planConvert(ctx, req);
  const p = pathApi(ctx);
  const items: PreviewItem[] = plan.items.map((it) => ({
    from: it.originals.map((o) => p.basename(o)), to: it.name, folder: it.dir, engine: it.engine ? engineName(it.engine) : "", problem: it.engine ? "" : it.why,
  }));
  return { action: plan.def.id, mode: plan.def.mode, outKind: plan.def.outKind ?? "file", items, skipped: plan.skipped, options: plan.opts };
}

// ---------------------------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------------------------

function stepFor(ctx: FmContext, plan: Plan, item: PlanItem, pdfEngine: string | undefined, env: Record<string, string>): JobStepSpec {
  const { def, opts, status } = plan;
  const p = pathApi(ctx);
  const engine = item.engine!;
  const folder = def.outKind === "folder";
  const outExt = engine.outputExt ?? (outExtOf(def, opts) || extOf(item.name));
  const title = p.basename(item.originals[0]!).replace(/\.[^.]*$/, "");
  const label = `${item.originals.length === 1 ? p.basename(item.originals[0]!) : `${item.originals.length} files`} → ${item.name}`;
  const toolId = engine.tool === "builtin" ? null : engine.tool;
  const caps = toolId ? toolOf(status, toolId).capabilities : [];
  const spec: JobStepSpec = {
    label, output: item.path, outputKind: folder ? "folder" : "file", env,
    explain: (text, code) => explainFailure(engine.tool, text, code),
    timeoutMs: engine.timeoutMs ?? (engine.tool === "builtin" ? 60 * 60 * 1000 : undefined),
    ...(engine.cwdIsInputFolder ? { cwd: p.dirname(item.originals[0]!) } : {}),
  };
  spec.prepare = async (): Promise<PreparedStep> => {
    const stage = new Stage();
    let tmpOut = "";
    let published = false;
    const cleanup = async () => {
      stage.cleanup();
      if (folder && tmpOut && !published) await removeQuietly(tmpOut);
    };
    try {
      const staged = !!engine.stage;
      const viaFile = staged || !!engine.stdoutIsOutput || engine.tool === "builtin";
      if (folder) tmpOut = siblingTemp(item.path);
      else if (viaFile) tmpOut = p.join(stage.dir(), `${staged && engine.stageBase ? engine.stageBase : "out"}${outExt ? `.${outExt}` : ""}`);
      else tmpOut = item.path;
      const inputs = staged
        ? item.originals.map((o, i) => stage.safeInput(o, engine.stageBase && item.originals.length === 1 ? engine.stageBase : `in${String(i + 1).padStart(4, "0")}`, extOf(p.basename(o)).replace(/[^.a-z0-9]/g, "")))
        : item.originals;
      const publish = async () => {
        if (folder) {
          if (engine.limitOutput) await sanitizeExtracted(tmpOut, EXTRACT_LIMITS);
          publishFolder(tmpOut, item.path);
          published = true;
        } else if (tmpOut !== item.path) publishFile(tmpOut, item.path);
      };

      if (engine.tool === "builtin") {
        const job: BuiltinJob = { kind: engine.builtin!.kind, inputs: item.originals, output: tmpOut, opts, params: engine.builtin!.params ?? {}, platform: ctx.platform, home: ctx.home };
        return { work: (signal) => runBuiltinInWorker(job, signal), publish, cleanup };
      }

      const exe = resolveTool(ctx, engine.tool, engine.program);
      if (!exe) throw new Error("The program could not be found. Was it moved or uninstalled?");
      const bc: BuildContext = {
        exe, inputs, output: tmpOut, opts, pdfEngine, title, originals: item.originals, platform: ctx.platform, caps,
        program: (tool, name) => resolveTool(ctx, tool, name),
        tmpFile: (name, content) => stage.file(name, content),
        tmpDir: (name) => stage.subDir(name),
        tmpCopy: (source, name) => stage.copy(source, name),
      };
      const built = engine.argv!(bc);
      const pipeline = built.length > 0 && (Array.isArray(built[0]) || typeof built[0] === "function");
      if (!pipeline && !engine.stdoutIsOutput && !engine.limitOutput) return { argv: [exe, ...(built as string[])], publish, cleanup };
      const steps = (pipeline ? built : [[exe, ...(built as string[])]]) as Array<string[] | (() => string[])>;
      return {
        work: async (signal, log) => {
          await runCommands(steps, {
            env, cwd: spec.cwd, signal, log, explain: spec.explain!, stdoutTo: engine.stdoutIsOutput ? tmpOut : undefined,
            watch: engine.limitOutput ? { dir: tmpOut, limits: EXTRACT_LIMITS } : undefined,
          });
        },
        publish, cleanup,
      };
    } catch (err) {
      await cleanup();
      throw err;
    }
  };
  return spec;
}

export async function startConvert(ctx: FmContext, req: ConvertRequest): Promise<JobView> {
  const plan = await planConvert(ctx, req);
  const failing = plan.items.filter((i) => !i.engine);
  if (failing.length === plan.items.length) {
    const first = failing[0]!;
    throw new FmError(first.missing ? "TOOL_MISSING" : "UNAVAILABLE", first.missing ? `${first.why.replace(/ Install it below\.$/, "")} Choose Install in the Convert & process window.` : first.why);
  }
  const env = childEnv(ctx);
  const pdfEngine = pdfEngineFor(ctx) ?? undefined;
  const p = pathApi(ctx);
  const steps: JobStepSpec[] = plan.items.map((item) =>
    item.engine
      ? stepFor(ctx, plan, item, pdfEngine, env)
      : { label: `${p.basename(item.originals[0]!)} → ${item.name}`, prepare: async (): Promise<PreparedStep> => { throw new Error(item.why); } });
  const total = plan.items.reduce((n, i) => n + i.originals.length, 0);
  return ctx.jobs.start({ kind: "convert", title: `${plan.def.label}: ${total} ${total === 1 ? "file" : "files"}`, steps });
}
