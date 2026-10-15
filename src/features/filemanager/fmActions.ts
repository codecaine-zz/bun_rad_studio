/**
 * Saved file actions: a named recipe that runs the same steps on the files you choose, every time.
 *
 * "Prepare images for website": take the selected pictures, make copies no wider than 1600 px, turn the copies into
 * WebP, put them in ./optimized, show that folder. The originals are never touched.
 *
 * An action says (and the checks below enforce) which inputs it accepts, which steps it runs, which settings you can
 * change, where the results go, what happens when a name is taken, and that it does not modify the originals.
 *
 * How a run works (tests/file_manager_actions.test.ts):
 *  - Before anything runs, `preflight` checks the definition, the files, the settings and the helper programs, and says
 *    in plain words what is wrong, per step and per file. Nothing is run for an action that fails its check.
 *  - Each step is a conversion from the Convert & process catalog (so the same code, the same helper programs, the same
 *    quality checks) run through the shared task queue. Step results go to a private working folder; the next step reads
 *    them. Step settings can be fixed values or `{ "$param": "name" }` for a setting the person fills in.
 *  - A step that fails, or is cancelled, stops the run. The message names the step and the files. Nothing has been written
 *    to the output folder, and the working folder is removed.
 *  - After the last step, the results are copied to the output folder through an operation plan (fmPlan.ts): never
 *    overwriting (a taken name gets a number, or the file is skipped, as the action says), visible in the task list, and
 *    reversible with Undo.
 *  - No shell is ever involved: steps are catalog actions with validated options. A step of type "command" can be written in
 *    an action file so it is not lost, but it is shown disabled and never runs.
 *  - Actions from an imported file are marked imported; they cannot do more than any other action, because nothing in an
 *    action can run an arbitrary program.
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, assertCreatable, lstatOrNull, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { CATALOG, CATALOG_BY_ID } from "./fmConvCatalog";
import { dynamicChoices, pickEngine, startConvert } from "./fmConvert";
import { validateOptions, type OptionValue, type OptionValues } from "./fmConvOptions";
import { defAccepts, extOf, outExtOf } from "./fmConvTypes";
import { toolStatus } from "./fmToolDetect";
import { createPlan, type ExplicitItem } from "./fmPlan";
import { applyPlan } from "./fmPlanRun";
import { FmError, describeFsError, uniqueName } from "./fmPaths";
import { secretIn } from "./fmWorkspaces";

export const ACTION_VERSION = 1;
export const ACTION_FORMAT = "bun-rad-file-manager-action";
export const MAX_ACTIONS = 100;
const MAX_STEPS = 8;
const MAX_PARAMS = 10;
const MAX_INPUTS = 500;
const MAX_RUNS = 20;
const STALE_WORK_MS = 24 * 60 * 60 * 1000;

export interface ActionParam {
  id: string;
  label: string;
  kind: "number" | "choice" | "text" | "toggle";
  default: string | number | boolean;
  min?: number;
  max?: number;
  choices?: Array<{ value: string; label: string }>;
}

export type ActionStep =
  | { type: "convert"; label: string; action: string; options: Record<string, unknown> }
  | { type: "command"; label: string; command: string };

export interface ActionDef {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "local" | "imported";
  input: { extensions: string[]; min: number; max: number };
  params: ActionParam[];
  steps: ActionStep[];
  output: { folder: string; conflict: "rename" | "skip" };
  revealOutput: boolean;
  /** Always false: no step can change an original file. */
  modifiesOriginals: false;
}

// ---------------------------------------------------------------------------------------------------------------
// Checking a definition
// ---------------------------------------------------------------------------------------------------------------

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\0\r\n]/g, " ").trim().slice(0, max) : "");
const bad = (message: string): never => { throw new FmError("BAD_ACTION", message); };

function paramOf(raw: unknown): ActionParam {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const id = typeof p.id === "string" && /^[a-z][a-z0-9_]{0,23}$/.test(p.id) ? p.id : bad("A setting needs an id of lower-case letters, digits and underscores, starting with a letter.");
  const kind = ["number", "choice", "text", "toggle"].includes(p.kind) ? (p.kind as ActionParam["kind"]) : bad(`The setting "${id}" has an unknown type.`);
  const label = text(p.label, 60) || id;
  const out: ActionParam = { id, label, kind, default: "" };
  if (kind === "number") {
    const min = Number.isFinite(Number(p.min)) ? Number(p.min) : 0;
    const max = Number.isFinite(Number(p.max)) ? Number(p.max) : 100_000;
    if (min > max) bad(`The setting "${id}" has a minimum above its maximum.`);
    const d = Number(p.default);
    if (!Number.isFinite(d) || d < min || d > max) bad(`The default of "${id}" is not between ${min} and ${max}.`);
    Object.assign(out, { min, max, default: d });
  } else if (kind === "choice") {
    const choices = (Array.isArray(p.choices) ? p.choices : []).slice(0, 40).map((c: any) => ({ value: text(c?.value, 60), label: text(c?.label, 80) || text(c?.value, 60) })).filter((c) => c.value);
    if (!choices.length) bad(`The setting "${id}" needs at least one choice.`);
    const d = String(p.default ?? choices[0]!.value);
    if (!choices.some((c) => c.value === d)) bad(`The default of "${id}" is not one of its choices.`);
    Object.assign(out, { choices, default: d });
  } else if (kind === "toggle") out.default = p.default === true;
  else out.default = text(p.default, 100);
  return out;
}

function stepOf(raw: unknown, index: number): ActionStep {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const where = `Step ${index + 1}`;
  if (s.type === "convert") {
    if (typeof s.action !== "string" || !CATALOG_BY_ID.has(s.action)) bad(`${where} uses "${text(s.action, 40)}", which isn't a known conversion.`);
    const options: Record<string, unknown> = {};
    if (s.options && typeof s.options === "object") {
      for (const [k, v] of Object.entries(s.options as Record<string, unknown>).slice(0, 30)) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(k)) bad(`${where} has an invalid setting name.`);
        if (v && typeof v === "object") {
          const ref = (v as { $param?: unknown }).$param;
          if (typeof ref !== "string") bad(`${where}: the value of "${k}" must be a number, text, true/false or {"$param": "name"}.`);
          options[k] = { $param: ref };
        } else if (["string", "number", "boolean"].includes(typeof v)) options[k] = v;
        else bad(`${where}: the value of "${k}" isn't usable.`);
      }
    }
    return { type: "convert", label: text(s.label, 80) || CATALOG_BY_ID.get(s.action)!.label, action: s.action, options };
  }
  if (s.type === "command") {
    const command = text(s.command, 1000);
    const found = secretIn(command, true);
    if (found) bad(`${where} seems to contain ${found}. Actions never store passwords or tokens.`);
    return { type: "command", label: text(s.label, 80) || "Custom command", command };
  }
  return bad(`${where} has an unknown type.`);
}

/** `id` fixes the action's id (stored and built-in actions); without one a new id is made. */
export function sanitizeAction(ctx: FmContext, raw: unknown, source: ActionDef["source"], id?: string): ActionDef {
  if (!raw || typeof raw !== "object") bad("That isn't an action.");
  const a = raw as Record<string, any>;
  const name = text(a.name, 80);
  if (!name) bad("Give the action a name.");
  if (a.modifiesOriginals === true) bad("Saved actions never change your original files. They work on copies.");
  const steps = (Array.isArray(a.steps) ? a.steps : []).slice(0, MAX_STEPS + 1).map(stepOf);
  if (!steps.length) bad("An action needs at least one step.");
  if (steps.length > MAX_STEPS) bad(`An action can have at most ${MAX_STEPS} steps.`);
  const params = (Array.isArray(a.params) ? a.params : []).slice(0, MAX_PARAMS + 1).map(paramOf);
  if (params.length > MAX_PARAMS) bad(`An action can have at most ${MAX_PARAMS} settings.`);
  if (new Set(params.map((p) => p.id)).size !== params.length) bad("Two settings have the same id.");
  for (const s of steps) {
    if (s.type !== "convert") continue;
    for (const v of Object.values(s.options)) {
      const ref = (v as { $param?: string } | null)?.$param;
      if (typeof ref === "string" && !params.some((p) => p.id === ref)) bad(`A step uses the setting "${ref}", which the action doesn't have.`);
    }
  }
  const folder = text(a.output?.folder, 400) || "./output";
  if (folder.split(/[\\/]/).includes("..")) bad("The output folder can't use '..'. Use a folder inside the files' folder (like ./optimized) or a full path.");
  void ctx;
  const input = (a.input && typeof a.input === "object" ? a.input : {}) as Record<string, any>;
  const extensions = [...new Set((Array.isArray(input.extensions) ? input.extensions : []).slice(0, 40).map((e: unknown) => text(e, 12).toLowerCase().replace(/^\./, "")).filter((e: string) => /^[a-z0-9.]{1,12}$/.test(e)))];
  const min = Math.max(1, Math.min(MAX_INPUTS, Math.floor(Number(input.min)) || 1));
  const max = Math.max(min, Math.min(MAX_INPUTS, Math.floor(Number(input.max)) || MAX_INPUTS));
  return {
    id: id && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : randomBytes(6).toString("hex"),
    name,
    description: text(a.description, 300),
    source,
    input: { extensions, min, max },
    params,
    steps,
    output: { folder, conflict: a.output?.conflict === "skip" ? "skip" : "rename" },
    revealOutput: a.revealOutput !== false,
    modifiesOriginals: false,
  };
}

/** Ready-made actions. They are checked like any other, so a missing helper program is reported the same way. */
export function builtinActions(ctx: FmContext): ActionDef[] {
  const defs: unknown[] = [
    {
      id: "builtin-images-web", name: "Prepare images for a website", description: "Makes copies no wider than the size you choose, turns them into WebP, and puts them in ./optimized. Your originals stay as they are.",
      input: { extensions: ["jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "heic", "avif"], min: 1, max: 500 },
      params: [{ id: "width", label: "Widest picture (pixels)", kind: "number", min: 100, max: 8000, default: 1600 }],
      steps: [
        { type: "convert", label: "Make copies no wider than the size", action: "img-resize", options: { mode: "width", size: { $param: "width" } } },
        { type: "convert", label: "Turn the copies into WebP", action: "img-webp", options: {} },
      ],
      output: { folder: "./optimized", conflict: "rename" }, revealOutput: true,
    },
    {
      id: "builtin-data-yaml", name: "Turn data files into YAML", description: "Reads JSON, CSV and similar files and writes YAML copies into ./yaml. Needs no extra programs.",
      input: { extensions: ["json", "json5", "jsonc", "csv", "tsv", "toml", "yaml", "yml"], min: 1, max: 500 },
      params: [], steps: [{ type: "convert", label: "Convert to YAML", action: "data-yaml", options: {} }],
      output: { folder: "./yaml", conflict: "rename" }, revealOutput: true,
    },
    {
      id: "builtin-text-plain", name: "Make accent-free copies of text files", description: "Writes copies of text files with é turned into e, and so on, into ./plain-text. Needs no extra programs.",
      input: { extensions: ["txt", "md", "csv", "json", "html", "xml", "log"], min: 1, max: 500 },
      params: [], steps: [{ type: "convert", label: "Remove accents", action: "text-diacritics", options: {} }],
      output: { folder: "./plain-text", conflict: "rename" }, revealOutput: true,
    },
  ];
  return defs.map((d) => sanitizeAction(ctx, d, "builtin", (d as { id: string }).id));
}

// ---------------------------------------------------------------------------------------------------------------
// Saved actions
// ---------------------------------------------------------------------------------------------------------------

export const actionsFile = (ctx: FmContext) => nodePath.join(ctx.dataDir, "file_manager_actions.json");

interface Loaded { actions: ActionDef[]; newer: boolean; skipped: number }

async function load(ctx: FmContext): Promise<Loaded> {
  let raw: string;
  try { raw = await fsp.readFile(actionsFile(ctx), "utf8"); } catch (err: any) {
    if (err?.code === "ENOENT") return { actions: [], newer: false, skipped: 0 };
    throw new FmError("READ_FAILED", "The saved actions couldn't be read.");
  }
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* damaged */ }
  if (!data || typeof data !== "object") return { actions: [], newer: false, skipped: 1 };
  if (typeof data.version === "number" && data.version > ACTION_VERSION) return { actions: [], newer: true, skipped: 0 };
  const actions: ActionDef[] = [];
  let skipped = 0;
  for (const a of (Array.isArray(data.actions) ? data.actions : []).slice(0, MAX_ACTIONS)) {
    try { actions.push(sanitizeAction(ctx, a, a?.source === "imported" ? "imported" : "local", String(a?.id ?? ""))); } catch { skipped++; }
  }
  return { actions, newer: false, skipped };
}

async function save(ctx: FmContext, loaded: Loaded, actions: ActionDef[]): Promise<void> {
  if (loaded.newer) throw new FmError("NEWER_FILE", "The saved actions were written by a newer version of the app. They were left untouched.");
  await fsp.mkdir(ctx.dataDir, { recursive: true });
  const file = actionsFile(ctx);
  if (loaded.skipped) await fsp.copyFile(file, `${file}.damaged`).catch(() => {});
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify({ version: ACTION_VERSION, actions }, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, file);
}

async function find(ctx: FmContext, id: unknown): Promise<ActionDef> {
  const all = [...builtinActions(ctx), ...(await load(ctx)).actions];
  const a = typeof id === "string" ? all.find((x) => x.id === id) : undefined;
  if (!a) throw new FmError("NOT_FOUND", "That action doesn't exist (any more).");
  return a;
}

// ---------------------------------------------------------------------------------------------------------------
// Checking before running
// ---------------------------------------------------------------------------------------------------------------

export interface Problem {
  level: "block" | "warn";
  code: string;
  message: string;
  step?: number;
  paths?: string[];
}

export interface Preflight {
  ok: boolean;
  problems: Problem[];
  steps: Array<{ index: number; label: string; supported: boolean; available: boolean; note: string }>;
  accepted: string[];
  rejected: Array<{ path: string; reason: string }>;
  outputFolder: string | null;
  outputFolderExists: boolean;
  modifiesOriginals: false;
  recovery: string;
}

function resolveParams(def: ActionDef, given: unknown): Record<string, OptionValue> {
  const g = (given && typeof given === "object" ? given : {}) as Record<string, unknown>;
  for (const k of Object.keys(g)) if (!def.params.some((p) => p.id === k)) throw new FmError("BAD_PARAM", `"${k}" isn't a setting of this action.`);
  const out: Record<string, OptionValue> = {};
  for (const p of def.params) {
    const v = g[p.id] ?? p.default;
    if (p.kind === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < (p.min ?? 0) || n > (p.max ?? 100_000)) throw new FmError("BAD_PARAM", `${p.label}: use a number from ${p.min} to ${p.max}.`);
      out[p.id] = n;
    } else if (p.kind === "choice") {
      if (!p.choices!.some((c) => c.value === String(v))) throw new FmError("BAD_PARAM", `${p.label}: choose one of the listed values.`);
      out[p.id] = String(v);
    } else if (p.kind === "toggle") out[p.id] = v === true;
    else {
      const t = String(v);
      if (t.length > 100 || /[\u0000-\u001f\u007f]/.test(t)) throw new FmError("BAD_PARAM", `${p.label}: use plain text of at most 100 characters.`);
      out[p.id] = t;
    }
  }
  return out;
}

const optionsFor = (step: ActionStep & { type: "convert" }, params: Record<string, OptionValue>) =>
  Object.fromEntries(Object.entries(step.options).map(([k, v]) => [k, v && typeof v === "object" ? params[(v as { $param: string }).$param] : v]));

export function outputFolderFor(ctx: FmContext, def: ActionDef, firstInput: string): string {
  const p = pathApi(ctx);
  return p.isAbsolute(def.output.folder) ? p.resolve(def.output.folder) : p.resolve(p.dirname(firstInput), def.output.folder);
}

export async function preflight(ctx: FmContext, body: Record<string, any>): Promise<Preflight> {
  const def = await find(ctx, body.action);
  const problems: Problem[] = [];
  const block = (code: string, message: string, extra: Partial<Problem> = {}) => problems.push({ level: "block", code, message, ...extra });
  const p = pathApi(ctx);
  let params: Record<string, OptionValue> = {};
  try { params = resolveParams(def, body.params); } catch (err) { block("BAD_PARAM", err instanceof FmError ? err.message : "A setting isn't valid."); }

  const given = Array.isArray(body.inputs) ? body.inputs : [];
  if (!given.length) block("NO_INPUT", "Select the files this action should work on first.");
  if (given.length > MAX_INPUTS) block("TOO_MANY", `Choose at most ${MAX_INPUTS} files at once.`);
  const accepted: string[] = [];
  const rejected: Array<{ path: string; reason: string }> = [];
  const wanted = new Set(def.input.extensions);
  for (const raw of given.slice(0, MAX_INPUTS)) {
    let path: string;
    try { path = absolutePath(ctx, raw); } catch { rejected.push({ path: String(raw), reason: "That isn't a full path." }); continue; }
    const st = await lstatOrNull(path);
    if (!st) rejected.push({ path, reason: "It no longer exists." });
    else if (!st.isFile()) rejected.push({ path, reason: "Only files can be used here, not folders or links." });
    else if (wanted.size && !wanted.has(extOf(p.basename(path)))) rejected.push({ path, reason: `This action takes ${[...wanted].map((e) => `.${e}`).join(", ")} files.` });
    else accepted.push(path);
  }
  if (rejected.length) problems.push({ level: accepted.length ? "warn" : "block", code: "REJECTED", message: `${rejected.length} ${rejected.length === 1 ? "file can't be used" : "files can't be used"} and will be left out.`, paths: rejected.map((r) => r.path) });
  if (accepted.length < def.input.min && given.length) block("TOO_FEW", `This action needs at least ${def.input.min} usable ${def.input.min === 1 ? "file" : "files"}.`);
  if (accepted.length > def.input.max) block("TOO_MANY", `This action takes at most ${def.input.max} files at once.`);

  const status = await toolStatus(ctx);
  const steps: Preflight["steps"] = [];
  let ext: string | null = null;
  def.steps.forEach((step, index) => {
    if (step.type === "command") {
      steps.push({ index, label: step.label, supported: false, available: false, note: "Custom commands are not supported in actions yet. This step is disabled and will not run." });
      block("UNSUPPORTED_STEP", `Step ${index + 1} ("${step.label}") is a custom command. Those are not supported, so this action can't run.`, { step: index });
      return;
    }
    const conv = CATALOG_BY_ID.get(step.action)!;
    let opts: OptionValues;
    try { opts = validateOptions(conv.options, optionsFor(step, params), dynamicChoices(conv, status)); const why = conv.check?.(opts); if (why) throw new FmError("BAD_OPTION", why); }
    catch (err) {
      const message = err instanceof FmError ? err.message : "A setting isn't valid.";
      steps.push({ index, label: step.label, supported: true, available: false, note: message });
      block("BAD_OPTION", `Step ${index + 1} ("${step.label}"): ${message}`, { step: index });
      return;
    }
    const exts = ext ? [ext] : [...new Set(accepted.map((a) => extOf(p.basename(a))))];
    const badInputs = ext ? [] : accepted.filter((a) => !defAccepts(conv, p.basename(a), opts));
    if (badInputs.length) {
      steps.push({ index, label: step.label, supported: true, available: false, note: `It can't use ${badInputs.length === 1 ? "this file" : "these files"}.` });
      block("STEP_INPUT", `Step ${index + 1} ("${step.label}") can't use ${badInputs.map((b) => p.basename(b)).join(", ")}.`, { step: index, paths: badInputs });
      return;
    }
    const picked = pickEngine(ctx, status, conv, exts.length ? exts : [""], opts);
    if (!picked.engine) {
      steps.push({ index, label: step.label, supported: true, available: false, note: picked.why });
      block(picked.missing ? "TOOL_MISSING" : "UNAVAILABLE", `Step ${index + 1} ("${step.label}") can't run: ${picked.why}`, { step: index });
      return;
    }
    steps.push({ index, label: step.label, supported: true, available: true, note: picked.engine.tool === "builtin" ? "Built in." : `Uses ${picked.engine.tool}.` });
    const out = outExtOf(conv, opts);
    ext = out || ext;
    if (!ext && accepted.length) ext = extOf(p.basename(accepted[0]!));
  });

  let outputFolder: string | null = null;
  let outputFolderExists = false;
  if (accepted.length) {
    outputFolder = outputFolderFor(ctx, def, accepted[0]!);
    try { assertCreatable(ctx, p.dirname(outputFolder)); assertCreatable(ctx, outputFolder); } catch (err) { block("PROTECTED", err instanceof FmError ? err.message : "The output folder can't be used."); }
    const st = await lstatOrNull(outputFolder);
    outputFolderExists = !!st;
    if (st && !st.isDirectory()) block("NOT_A_FOLDER", `"${p.basename(outputFolder)}" exists but isn't a folder, so the results can't be put there.`);
    if (accepted.some((a) => outputFolder === a)) block("OUTPUT_IS_INPUT", "The output folder can't be one of the files.");
  }
  return {
    ok: !problems.some((x) => x.level === "block"),
    problems, steps, accepted, rejected, outputFolder, outputFolderExists, modifiesOriginals: false,
    recovery: "Your original files are never changed. New files are added to the output folder; Undo moves them to the Recycle Bin. Nothing is ever overwritten.",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------------------------

export type RunState = "running" | "publishing" | "done" | "failed" | "cancelled";

export interface RunStepView {
  index: number;
  label: string;
  state: "waiting" | "running" | "done" | "failed" | "cancelled";
  message: string;
  jobId: string | null;
  /** The files the step could not do, with why. */
  failedFiles: Array<{ path: string; message: string }>;
}

export interface RunView {
  id: string;
  actionId: string;
  name: string;
  state: RunState;
  message: string;
  steps: RunStepView[];
  /** The files copied to the output folder. */
  published: string[];
  /** Results that were made but did not reach the output folder (cancelled or failed while publishing). */
  notPublished: string[];
  outputFolder: string;
  reveal: boolean;
  planId: string | null;
  publishJobId: string | null;
  startedAt: number;
  finishedAt: number | null;
}

interface RunRecord extends RunView {
  cancelled: boolean;
  stage: string;
}

const runs = new WeakMap<FmContext, Map<string, RunRecord>>();
const runsOf = (ctx: FmContext) => { let m = runs.get(ctx); if (!m) runs.set(ctx, (m = new Map())); return m; };
const workRoot = (ctx: FmContext) => nodePath.join(ctx.dataDir, "file_manager_actions_work");

function viewOf(r: RunRecord): RunView {
  const { cancelled: _c, stage: _s, ...view } = r;
  return view;
}

async function removeStale(ctx: FmContext): Promise<void> {
  try {
    for (const name of await fsp.readdir(workRoot(ctx))) {
      const dir = nodePath.join(workRoot(ctx), name);
      const st = await fsp.stat(dir).catch(() => null);
      if (st && Date.now() - st.mtimeMs > STALE_WORK_MS) await fsp.rm(dir, { recursive: true, force: true });
    }
  } catch { /* no working folder yet */ }
}

export async function startRun(ctx: FmContext, body: Record<string, any>): Promise<RunView> {
  const def = await find(ctx, body.action);
  const check = await preflight(ctx, body);
  if (!check.ok) throw new FmError("CHECK_FAILED", check.problems.find((p) => p.level === "block")?.message ?? "This action can't run.");
  const params = resolveParams(def, body.params);
  await removeStale(ctx);
  const id = randomBytes(6).toString("hex");
  const stage = nodePath.join(workRoot(ctx), id);
  await fsp.mkdir(stage, { recursive: true, mode: 0o700 });
  const run: RunRecord = {
    id, actionId: def.id, name: def.name, state: "running", message: "", cancelled: false, stage,
    steps: def.steps.map((s, index) => ({ index, label: s.label, state: "waiting", message: "", jobId: null, failedFiles: [] })),
    published: [], notPublished: [], outputFolder: check.outputFolder!, reveal: def.revealOutput, planId: null, publishJobId: null, startedAt: Date.now(), finishedAt: null,
  };
  const registry = runsOf(ctx);
  registry.set(id, run);
  while (registry.size > MAX_RUNS) { const oldest = [...registry.values()].find((r) => r.finishedAt) ?? registry.values().next().value!; registry.delete(oldest.id); }
  void execute(ctx, def, params, check.accepted, run);
  return viewOf(run);
}

async function execute(ctx: FmContext, def: ActionDef, params: Record<string, OptionValue>, inputs: string[], run: RunRecord): Promise<void> {
  const p = pathApi(ctx);
  const finish = async (state: RunState, message: string) => {
    await fsp.rm(run.stage, { recursive: true, force: true }).catch(() => {});
    run.state = state;
    run.message = message;
    run.finishedAt = Date.now();
  };
  try {
    let current = inputs;
    for (let i = 0; i < def.steps.length; i++) {
      const step = def.steps[i] as ActionStep & { type: "convert" };
      const view = run.steps[i]!;
      if (run.cancelled) return void (await finish("cancelled", `Cancelled before step ${i + 1}. Nothing was written to the output folder.`));
      view.state = "running";
      const outDir = nodePath.join(run.stage, `step${i + 1}`);
      await fsp.mkdir(outDir, { recursive: true });
      let job;
      try {
        // In-between results keep the original's name; only the last step adds its own ("photo.webp", not "photo (resized).webp").
        job = await startConvert(ctx, { action: step.action, paths: current, options: optionsFor(step, params), outputDir: outDir, ...(i < def.steps.length - 1 ? { pattern: "{name}" } : {}) });
      } catch (err) {
        view.state = "failed";
        view.message = err instanceof FmError ? err.message : describeFsError(err, "start that step").message;
        return void (await finish("failed", `Step ${i + 1} ("${step.label}") could not start: ${view.message} Nothing was written to the output folder.`));
      }
      view.jobId = job.id;
      const done = await ctx.jobs.whenDone(job.id);
      // A conversion step is labelled "original → new name"; the original is the file that failed.
      view.failedFiles = done.steps.filter((s) => s.state === "failed").map((s) => ({ path: s.item?.source ?? s.label.split(" → ")[0]!, message: s.message }));
      if (done.state === "cancelled" || run.cancelled) {
        view.state = "cancelled";
        view.message = "Cancelled.";
        return void (await finish("cancelled", `Cancelled during step ${i + 1} ("${step.label}"). Nothing was written to the output folder.`));
      }
      if (done.state !== "done" || done.failed > 0) {
        view.state = "failed";
        view.message = `${done.failed} of ${done.total} ${done.total === 1 ? "file" : "files"} failed.`;
        return void (await finish("failed", `Step ${i + 1} ("${step.label}") failed for ${view.failedFiles.map((f) => p.basename(f.path)).join(", ") || "some files"}. Nothing was written to the output folder.`));
      }
      view.state = "done";
      current = done.outputs;
      if (!current.length) return void (await finish("failed", `Step ${i + 1} ("${step.label}") made no files. Nothing was written to the output folder.`));
    }
    if (run.cancelled) return void (await finish("cancelled", "Cancelled before the results were copied. Nothing was written to the output folder."));

    // Publish: copy the results into the output folder through a plan, so nothing is overwritten and Undo works.
    const claimed = new Set<string>();
    const taken = new Set<string>(await fsp.readdir(run.outputFolder).catch(() => []));
    const items: ExplicitItem[] = current.map((source) => {
      const base = p.basename(source);
      const name = def.output.conflict === "rename" ? uniqueName(base, (n) => taken.has(n) || claimed.has(n)) : base;
      claimed.add(name);
      return { action: "copy", source, destination: p.join(run.outputFolder, name) };
    });
    run.state = "publishing";
    const plan = await createPlan(ctx, { type: "items", title: `${def.name}: copy the results to "${p.basename(run.outputFolder)}"`, items });
    run.planId = plan.id;
    const blocked = plan.items.filter((i) => i.issues.some((x) => x.level === "block"));
    if (plan.needsApproval || blocked.length) {
      run.notPublished = current;
      return void (await finish("failed", plan.needsApproval ? "Copying the results would replace something, which saved actions never do." : `The results could not be copied: ${blocked[0]!.reason}`));
    }
    if (!plan.canApply) {
      // Every name was taken and the action says to leave such files alone: nothing to copy, and that is not an error.
      run.notPublished = current;
      return void (await finish("done", `0 files added: all ${current.length} ${current.length === 1 ? "name was" : "names were"} already taken in "${p.basename(run.outputFolder)}", so ${current.length === 1 ? "it was" : "they were"} left alone, as this action says. Your originals were not changed.`));
    }
    const { job } = await applyPlan(ctx, plan.id, {});
    run.publishJobId = job.id;
    const final = await ctx.jobs.whenDone(job.id);
    run.published = final.steps.filter((s) => s.state === "done" && s.item?.destination).map((s) => s.item!.destination!);
    run.notPublished = final.steps.filter((s) => s.state !== "done").map((s) => s.item?.source ?? s.label);
    const skipped = final.steps.filter((s) => s.state === "skipped" && s.skipReason === "policy").length;
    if (final.state === "done") await finish("done", `${run.published.length} ${run.published.length === 1 ? "file" : "files"} added to "${p.basename(run.outputFolder)}"${skipped ? `, ${skipped} left alone because the name was taken` : ""}. Your originals were not changed.`);
    else if (final.state === "cancelled" || run.cancelled) await finish("cancelled", `Cancelled while copying the results: ${run.published.length} copied, ${run.notPublished.length} not copied. Copied files stay in the output folder.`);
    else await finish("failed", `${run.published.length} copied, ${final.failed} failed: ${final.steps.find((s) => s.state === "failed")?.message ?? ""}`);
  } catch (err) {
    await finish("failed", `The action stopped unexpectedly: ${err instanceof Error ? err.message : String(err)}. Your originals were not changed.`);
  }
}

export function cancelRun(ctx: FmContext, id: unknown): RunView {
  const run = typeof id === "string" ? runsOf(ctx).get(id) : undefined;
  if (!run) throw new FmError("NOT_FOUND", "That run isn't available any more.");
  if (!run.finishedAt) {
    run.cancelled = true;
    for (const s of run.steps) if (s.state === "running" && s.jobId) ctx.jobs.cancel(s.jobId);
    if (run.publishJobId) ctx.jobs.cancel(run.publishJobId);
  }
  return viewOf(run);
}

export function getRun(ctx: FmContext, id: unknown): RunView {
  const run = typeof id === "string" ? runsOf(ctx).get(id) : undefined;
  if (!run) throw new FmError("NOT_FOUND", "That run isn't available any more.");
  return viewOf(run);
}

/** Resolves when the run is over (for scripts and tests). */
export async function whenRunDone(ctx: FmContext, id: string): Promise<RunView> {
  for (;;) {
    const v = getRun(ctx, id);
    if (v.finishedAt) return v;
    await new Promise((r) => setTimeout(r, 15));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------------------------

/** What the action editor offers for a step: each conversion with the settings it has (fixed lists only; others are plain text). */
export function stepCatalog() {
  return CATALOG.map((d) => ({
    id: d.id, label: d.label, hint: d.hint, group: d.group, inputs: d.inputs ? [...d.inputs] : null, mode: d.mode,
    options: (d.options ?? []).filter((o) => !o.choicesFromCaps).map((o) => ({
      id: o.id, label: o.label, hint: o.hint, kind: o.kind, default: o.default, min: o.min, max: o.max,
      choices: o.choices?.map((c) => ({ value: c.value, label: c.label })),
    })),
  }));
}

export const actionOperations: Record<string, FmHandler> = {
  async "actions/catalog"() {
    return { steps: stepCatalog() };
  },
  async "actions/list"(ctx) {
    const loaded = await load(ctx);
    return { actions: [...builtinActions(ctx), ...loaded.actions], readOnly: loaded.newer, skipped: loaded.skipped, version: ACTION_VERSION };
  },
  async "actions/save"(ctx, b) {
    const loaded = await load(ctx);
    const previous = typeof b.action?.id === "string" ? loaded.actions.find((a) => a.id === b.action.id) : undefined;
    if (!previous && loaded.actions.length >= MAX_ACTIONS) throw new FmError("TOO_MANY", `You can keep up to ${MAX_ACTIONS} actions.`);
    const a = sanitizeAction(ctx, { ...b.action }, previous?.source === "imported" ? "imported" : "local", previous?.id);
    if ([...builtinActions(ctx), ...loaded.actions].some((x) => x.id !== a.id && x.name.toLowerCase() === a.name.toLowerCase())) throw new FmError("EXISTS", `An action named "${a.name}" already exists. Choose another name.`);
    await save(ctx, loaded, previous ? loaded.actions.map((x) => (x.id === a.id ? a : x)) : [...loaded.actions, a]);
    return { action: a };
  },
  async "actions/delete"(ctx, b) {
    const loaded = await load(ctx);
    const a = loaded.actions.find((x) => x.id === b.id);
    if (!a) throw new FmError("NOT_FOUND", "That action doesn't exist, or it is a built-in one that can't be deleted.");
    await save(ctx, loaded, loaded.actions.filter((x) => x.id !== a.id));
    return { deleted: a.id };
  },
  async "actions/preflight"(ctx, b) {
    return { check: await preflight(ctx, b) };
  },
  async "actions/run"(ctx, b) {
    return { run: await startRun(ctx, b) };
  },
  async "actions/run/get"(ctx, b) {
    return { run: getRun(ctx, b.id) };
  },
  async "actions/run/cancel"(ctx, b) {
    return { run: cancelRun(ctx, b.id) };
  },
  async "actions/export"(ctx, b) {
    const a = await find(ctx, b.id);
    const { id: _i, source: _s, ...rest } = a;
    return { text: JSON.stringify({ format: ACTION_FORMAT, version: ACTION_VERSION, action: rest }, null, 2), fileName: `${a.name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "action"}.action.json` };
  },
  async "actions/import"(ctx, b) {
    if (typeof b.text !== "string" || !b.text.trim()) throw new FmError("BAD_REQUEST", "Paste or open an action file first.");
    if (Buffer.byteLength(b.text) > 128 * 1024) throw new FmError("TOO_BIG", "That file is too big to be an action file.");
    let data: any;
    try { data = JSON.parse(b.text); } catch { throw new FmError("BAD_FILE", "That isn't an action file (it isn't valid JSON)."); }
    if (!data || data.format !== ACTION_FORMAT) throw new FmError("BAD_FILE", "That isn't a File Manager action file.");
    if (typeof data.version !== "number" || data.version > ACTION_VERSION) throw new FmError("NEWER_FILE", "That action file was made by a newer version of the app.");
    const loaded = await load(ctx);
    if (loaded.actions.length >= MAX_ACTIONS) throw new FmError("TOO_MANY", `You can keep up to ${MAX_ACTIONS} actions.`);
    const a = sanitizeAction(ctx, { ...data.action, id: undefined }, "imported");
    let name = a.name;
    const all = [...builtinActions(ctx), ...loaded.actions];
    for (let i = 2; all.some((x) => x.name.toLowerCase() === name.toLowerCase()); i++) name = `${a.name} (${i})`;
    a.name = name;
    await save(ctx, loaded, [...loaded.actions, a]);
    return { action: a, disabledSteps: a.steps.filter((s) => s.type === "command").length };
  },
};
