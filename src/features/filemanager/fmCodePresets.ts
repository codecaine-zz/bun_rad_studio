/**
 * "Run presets" of the Code tab: named commands saved for a file (or for every file with the same ending), kept in
 * one small JSON file in the app's data folder. The server only STORES these. It never runs one: the page types
 * the command into the File Manager's own terminal when the person clicks Run.
 *
 * Everything is checked on every read and write: names and commands are limited in length and may not hold control
 * characters (a tab is fine), so a preset can never carry a hidden second command on another line.
 */
import * as fs from "fs";
import { promises as fsp } from "fs";
import { randomBytes } from "crypto";
import * as nodePath from "path";
import { absolutePath, pathApi, type FmContext } from "./fmCore";
import { FmError } from "./fmPaths";

export const PRESETS_FORMAT = "bun-rad-file-manager-run-presets";
export const MAX_PRESETS_PER_ENTRY = 20;
export const MAX_FILE_ENTRIES = 500;
export const MAX_TYPE_ENTRIES = 60;
export const MAX_PRESET_BYTES = 500 * 1024;
export const MAX_COMMAND = 2000;
export const MAX_NAME = 60;

export interface Preset {
  id: string;
  name: string;
  command: string;
  cwd: "file" | "workspace" | "root";
  kind: "run" | "build";
  ask: boolean;
  lastRun: string;
  runCount: number;
}

export interface Entry {
  path: string;
  presets: Preset[];
  defaultRun: string;
  defaultBuild: string;
  last: string;
  touched: string;
}

export interface PresetDoc {
  version: 1;
  files: Record<string, Entry>;
  types: Record<string, Entry>;
}

const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/;

/** Commands that deserve a second look before they run: deleting, moving, super-user, redirects, piping into a shell, forcing. */
export function defaultAsk(command: string): boolean {
  return /(^|[\s;&|(])(rm|rmdir|sudo|mv|dd|mkfs[\w.]*)(\s|$)|>|\|\s*(sudo\s+)?(sh|bash|zsh|dash|ksh)\b|--force\b|\s-rf?\b|(^|\s)-fr\b/.test(command);
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const newId = () => `p${randomBytes(5).toString("hex")}`;
const validId = (v: unknown): v is string => typeof v === "string" && /^[\w-]{1,40}$/.test(v);

/** A preset made from untrusted input: the preset, or the reason (in plain words) it isn't acceptable. */
export function checkPreset(raw: unknown, keep?: Partial<Preset>): Preset | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "That preset isn't valid.";
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) return "Give the preset a name.";
  if (r.name.length > MAX_NAME || CONTROL.test(r.name)) return `The name must be ${MAX_NAME} characters or fewer, on one line.`;
  if (typeof r.command !== "string" || !r.command.trim()) return "Type the command to run.";
  if (r.command.length > MAX_COMMAND) return `The command is too long (the limit is ${MAX_COMMAND} characters).`;
  if (CONTROL.test(r.command)) return "The command must be on a single line (no line breaks or hidden control characters).";
  const cwd = oneOf(r.cwd, ["file", "workspace", "root"] as const, "file");
  const kind = oneOf(r.kind, ["run", "build"] as const, "run");
  const id = validId(r.id) ? r.id : keep?.id && validId(keep.id) ? keep.id : newId();
  const count = typeof r.runCount === "number" && Number.isFinite(r.runCount) ? Math.min(1e9, Math.max(0, Math.floor(r.runCount))) : 0;
  const lastRun = typeof r.lastRun === "string" && !isNaN(Date.parse(r.lastRun)) ? r.lastRun : "";
  return {
    id,
    name: r.name.trim(),
    command: r.command.trim(),
    cwd,
    kind,
    ask: typeof r.ask === "boolean" ? r.ask : defaultAsk(r.command),
    lastRun: keep ? keep.lastRun ?? "" : lastRun,
    runCount: keep ? keep.runCount ?? 0 : count,
  };
}

const keyOf = (ctx: FmContext, path: string) => (ctx.platform === "win32" ? path.toLowerCase() : path);
export const extensionKey = (name: string): string => {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  return /^\.[a-z0-9_+-]{1,16}$/.test(ext) ? ext : "";
};

function cleanEntry(raw: unknown, path: string, dropped: { n: number }): Entry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const presets: Preset[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(r.presets) ? r.presets : []) {
    const c = checkPreset(p);
    if (typeof c === "string" || presets.length >= MAX_PRESETS_PER_ENTRY) { dropped.n++; continue; }
    if (seen.has(c.id)) c.id = newId();
    seen.add(c.id);
    presets.push(c);
  }
  const pick = (v: unknown, kind: Preset["kind"]) => (validId(v) && presets.some((p) => p.id === v && p.kind === kind) ? v : "");
  const touched = typeof r.touched === "string" && !isNaN(Date.parse(r.touched)) ? r.touched : new Date(0).toISOString();
  // a default or "last used" preset may live in the other list (for example an "all .ts files" preset), so ids are kept as given
  const loose = (v: unknown) => (validId(v) ? v : "");
  const entry: Entry = { path, presets, defaultRun: pick(r.defaultRun, "run") || loose(r.defaultRun), defaultBuild: pick(r.defaultBuild, "build") || loose(r.defaultBuild), last: loose(r.last), touched };
  return presets.length || entry.defaultRun || entry.defaultBuild || entry.last ? entry : null;
}

export function sanitizeDoc(raw: unknown, ctx: FmContext): { doc: PresetDoc; dropped: number } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const p = pathApi(ctx);
  const dropped = { n: 0 };
  const doc: PresetDoc = { version: 1, files: {}, types: {} };
  const files = r.files && typeof r.files === "object" && !Array.isArray(r.files) ? r.files : {};
  for (const name of Object.keys(files)) {
    if (Object.keys(doc.files).length >= MAX_FILE_ENTRIES * 2) break;
    const given = typeof files[name]?.path === "string" ? files[name].path : name;
    if (typeof given !== "string" || !given || given.length > 4096 || given.includes("\0") || !p.isAbsolute(given)) { dropped.n++; continue; }
    const path = p.resolve(given);
    const entry = cleanEntry(files[name], path, dropped);
    if (entry) doc.files[keyOf(ctx, path)] = entry;
  }
  const types = r.types && typeof r.types === "object" && !Array.isArray(r.types) ? r.types : {};
  for (const ext of Object.keys(types)) {
    if (!/^\.[a-z0-9_+-]{1,16}$/.test(ext) || Object.keys(doc.types).length >= MAX_TYPE_ENTRIES) { dropped.n++; continue; }
    const entry = cleanEntry(types[ext], ext, dropped);
    if (entry) doc.types[ext] = entry;
  }
  return { doc, dropped: dropped.n };
}

const presetsFile = (ctx: FmContext) => nodePath.join(ctx.dataDir, "file_manager_code_presets.json");

async function loadDoc(ctx: FmContext): Promise<{ doc: PresetDoc; corrupt: boolean }> {
  let text: string;
  try {
    text = await fsp.readFile(presetsFile(ctx), "utf8");
  } catch {
    return { doc: sanitizeDoc({}, ctx).doc, corrupt: false };
  }
  try {
    if (text.length > MAX_PRESET_BYTES * 2) throw new Error("too big");
    return { doc: sanitizeDoc(JSON.parse(text), ctx).doc, corrupt: false };
  } catch {
    return { doc: sanitizeDoc({}, ctx).doc, corrupt: true };
  }
}

/** Oldest entries go first when there are too many, or the file would be too big. */
export function prune(doc: PresetDoc): void {
  const oldest = () => Object.entries(doc.files).sort((a, b) => Date.parse(a[1].touched) - Date.parse(b[1].touched))[0]?.[0];
  while (Object.keys(doc.files).length > MAX_FILE_ENTRIES) delete doc.files[oldest()!];
  while (JSON.stringify(doc).length > MAX_PRESET_BYTES && Object.keys(doc.files).length) delete doc.files[oldest()!];
  if (JSON.stringify(doc).length > MAX_PRESET_BYTES) throw new FmError("TOO_LARGE", "There are too many saved presets to remember. Delete some you don't need.");
}

let writing: Promise<unknown> = Promise.resolve();

async function update<T>(ctx: FmContext, change: (doc: PresetDoc) => T): Promise<T> {
  const run = async () => {
    const { doc, corrupt } = await loadDoc(ctx);
    const result = change(doc);
    prune(doc);
    await fsp.mkdir(ctx.dataDir, { recursive: true });
    if (corrupt) await fsp.rename(presetsFile(ctx), `${presetsFile(ctx)}.damaged`).catch(() => {});
    const tmp = `${presetsFile(ctx)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(doc), { mode: 0o600 });
    await fsp.rename(tmp, presetsFile(ctx));
    return result;
  };
  const result = writing.then(run, run);
  writing = result.catch(() => {});
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Looking presets up
// ---------------------------------------------------------------------------------------------------------------

export interface ResolvedPreset extends Preset { scope: "file" | "ext"; ext: string }
export interface ResolvedList { path: string; presets: ResolvedPreset[]; defaultRun: string; defaultBuild: string; last: string }

/** This file's presets first, then the ones for every file with the same ending. */
export function resolve(ctx: FmContext, doc: PresetDoc, path: string): ResolvedList {
  const p = pathApi(ctx);
  const file = doc.files[keyOf(ctx, path)];
  const ext = extensionKey(p.basename(path));
  const type = ext ? doc.types[ext] : undefined;
  const presets: ResolvedPreset[] = [];
  const ids = new Set<string>();
  for (const [entry, scope] of [[file, "file"], [type, "ext"]] as const) {
    for (const x of entry?.presets ?? []) if (!ids.has(x.id)) { ids.add(x.id); presets.push({ ...x, scope, ext: scope === "ext" ? ext : "" }); }
  }
  const alive = (id: string | undefined, kind: Preset["kind"]) => (id && presets.some((x) => x.id === id && x.kind === kind) ? id : "");
  return { path, presets, defaultRun: alive(file?.defaultRun, "run"), defaultBuild: alive(file?.defaultBuild, "build"), last: alive(file?.last, "run") || alive(file?.last, "build") };
}

function touchEntry(ctx: FmContext, doc: PresetDoc, path: string): Entry {
  const key = keyOf(ctx, path);
  const entry = doc.files[key] ?? (doc.files[key] = { path, presets: [], defaultRun: "", defaultBuild: "", last: "", touched: "" });
  entry.touched = new Date().toISOString();
  return entry;
}

function dropIfEmpty(ctx: FmContext, doc: PresetDoc, path: string, ext: string): void {
  const f = doc.files[keyOf(ctx, path)];
  if (f && !f.presets.length && !f.defaultRun && !f.defaultBuild && !f.last) delete doc.files[keyOf(ctx, path)];
  const t = doc.types[ext];
  if (t && !t.presets.length) delete doc.types[ext];
}

function findOwner(ctx: FmContext, doc: PresetDoc, path: string, id: string): { entry: Entry; scope: "file" | "ext" } | null {
  const file = doc.files[keyOf(ctx, path)];
  if (file?.presets.some((x) => x.id === id)) return { entry: file, scope: "file" };
  const ext = extensionKey(pathApi(ctx).basename(path));
  const type = ext ? doc.types[ext] : undefined;
  if (type?.presets.some((x) => x.id === id)) return { entry: type, scope: "ext" };
  return null;
}

export const listPresets = async (ctx: FmContext, body: Record<string, any>) => resolve(ctx, (await loadDoc(ctx)).doc, absolutePath(ctx, body.path));

export async function savePreset(ctx: FmContext, body: Record<string, any>): Promise<ResolvedList> {
  const path = absolutePath(ctx, body.path);
  const scope = body.scope === "ext" ? "ext" : "file";
  const ext = extensionKey(pathApi(ctx).basename(path));
  if (scope === "ext" && !ext) throw new FmError("NO_EXTENSION", "This file has no ending like .ts or .py, so a preset for all files of its type isn't possible.");
  return await update(ctx, (doc) => {
    const existing = validId(body.preset?.id) ? findOwner(ctx, doc, path, body.preset.id) : null;
    const old = existing?.entry.presets.find((x) => x.id === body.preset.id);
    const checked = checkPreset(body.preset, old);
    if (typeof checked === "string") throw new FmError("BAD_PRESET", checked);
    const oldIndex = existing ? existing.entry.presets.findIndex((x) => x.id === checked.id) : -1;
    if (existing) existing.entry.presets = existing.entry.presets.filter((x) => x.id !== checked.id);
    const target = scope === "file" ? touchEntry(ctx, doc, path) : (doc.types[ext] ??= { path: ext, presets: [], defaultRun: "", defaultBuild: "", last: "", touched: "" });
    if (target.presets.length >= MAX_PRESETS_PER_ENTRY) throw new FmError("TOO_MANY", `You can keep up to ${MAX_PRESETS_PER_ENTRY} presets ${scope === "file" ? "per file" : "per file type"}. Delete one first.`);
    if (scope === "ext" && Object.keys(doc.types).length > MAX_TYPE_ENTRIES) throw new FmError("TOO_MANY", "There are too many file types with presets. Delete some first.");
    // keep the position when editing in the same list
    const at = existing && existing.scope === scope && oldIndex >= 0 ? Math.min(oldIndex, target.presets.length) : target.presets.length;
    target.presets.splice(at, 0, checked);
    target.touched = new Date().toISOString();
    if (existing && existing.scope !== scope) {
      for (const e of [existing.entry]) {
        if (e.defaultRun === checked.id) e.defaultRun = "";
        if (e.defaultBuild === checked.id) e.defaultBuild = "";
      }
    }
    return resolve(ctx, doc, path);
  });
}

export async function deletePreset(ctx: FmContext, body: Record<string, any>): Promise<ResolvedList> {
  const path = absolutePath(ctx, body.path);
  return await update(ctx, (doc) => {
    const owner = validId(body.id) ? findOwner(ctx, doc, path, body.id) : null;
    if (!owner) throw new FmError("NOT_FOUND", "That preset doesn't exist any more.");
    owner.entry.presets = owner.entry.presets.filter((x) => x.id !== body.id);
    for (const e of [doc.files[keyOf(ctx, path)]]) {
      if (!e) continue;
      if (e.defaultRun === body.id) e.defaultRun = "";
      if (e.defaultBuild === body.id) e.defaultBuild = "";
      if (e.last === body.id) e.last = "";
    }
    dropIfEmpty(ctx, doc, path, extensionKey(pathApi(ctx).basename(path)));
    return resolve(ctx, doc, path);
  });
}

export async function reorderPresets(ctx: FmContext, body: Record<string, any>): Promise<ResolvedList> {
  const path = absolutePath(ctx, body.path);
  if (!Array.isArray(body.ids) || body.ids.length > MAX_PRESETS_PER_ENTRY * 2) throw new FmError("BAD_REQUEST", "That order isn't valid.");
  return await update(ctx, (doc) => {
    const ext = extensionKey(pathApi(ctx).basename(path));
    const entry = body.scope === "ext" ? doc.types[ext] : doc.files[keyOf(ctx, path)];
    if (entry) {
      const rank = new Map<string, number>((body.ids as unknown[]).map((id, i) => [String(id), i]));
      entry.presets = entry.presets.map((x, i) => ({ x, i })).sort((a, b) => (rank.get(a.x.id) ?? 1e6 + a.i) - (rank.get(b.x.id) ?? 1e6 + b.i)).map((o) => o.x);
    }
    return resolve(ctx, doc, path);
  });
}

/** Marks one preset per file as its default Run preset, or its Build preset. An empty id clears it. */
export async function setDefaultPreset(ctx: FmContext, body: Record<string, any>): Promise<ResolvedList> {
  const path = absolutePath(ctx, body.path);
  const kind = oneOf(body.kind, ["run", "build"] as const, "run");
  return await update(ctx, (doc) => {
    const id = typeof body.id === "string" ? body.id : "";
    if (id) {
      const owner = findOwner(ctx, doc, path, id);
      const preset = owner?.entry.presets.find((x) => x.id === id);
      if (!preset) throw new FmError("NOT_FOUND", "That preset doesn't exist any more.");
      if (preset.kind !== kind) throw new FmError("WRONG_KIND", kind === "run" ? "Only a Run preset can be the default Run preset." : "Only a Build preset can be the Build preset.");
    }
    const entry = touchEntry(ctx, doc, path);
    if (kind === "run") entry.defaultRun = id;
    else entry.defaultBuild = id;
    dropIfEmpty(ctx, doc, path, "");
    return resolve(ctx, doc, path);
  });
}

/** Records that the person ran a preset (time, count, and "last used" for the file). Nothing is executed here. */
export async function recordRun(ctx: FmContext, body: Record<string, any>): Promise<ResolvedList> {
  const path = absolutePath(ctx, body.path);
  return await update(ctx, (doc) => {
    const owner = validId(body.id) ? findOwner(ctx, doc, path, body.id) : null;
    const preset = owner?.entry.presets.find((x) => x.id === body.id);
    if (!preset) throw new FmError("NOT_FOUND", "That preset doesn't exist any more.");
    preset.lastRun = new Date().toISOString();
    preset.runCount = Math.min(1e9, preset.runCount + 1);
    touchEntry(ctx, doc, path).last = preset.id;
    return resolve(ctx, doc, path);
  });
}

/** A renamed or moved file keeps its presets. */
export async function movePresets(ctx: FmContext, body: Record<string, any>): Promise<{ moved: boolean }> {
  const from = absolutePath(ctx, body.from);
  const to = absolutePath(ctx, body.to);
  return await update(ctx, (doc) => {
    const a = keyOf(ctx, from);
    const b = keyOf(ctx, to);
    const source = doc.files[a];
    if (!source || a === b) return { moved: false };
    const target = doc.files[b];
    delete doc.files[a];
    if (!target) doc.files[b] = { ...source, path: to, touched: new Date().toISOString() };
    else {
      for (const x of source.presets) if (target.presets.length < MAX_PRESETS_PER_ENTRY && !target.presets.some((y) => y.name === x.name && y.command === x.command)) target.presets.push(x.id && target.presets.some((y) => y.id === x.id) ? { ...x, id: newId() } : x);
      target.defaultRun ||= source.defaultRun;
      target.defaultBuild ||= source.defaultBuild;
      target.touched = new Date().toISOString();
    }
    return { moved: true };
  });
}

export async function exportPresets(ctx: FmContext): Promise<{ data: Record<string, unknown> }> {
  const { doc } = await loadDoc(ctx);
  return { data: { format: PRESETS_FORMAT, version: 1, exportedAt: new Date().toISOString(), files: doc.files, types: doc.types } };
}

/** Reads presets from an exported file. They are checked like any others and are never run. */
export async function importPresets(ctx: FmContext, body: Record<string, any>): Promise<{ imported: number; skipped: number; files: number; types: number }> {
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data) || (data.format !== undefined && data.format !== PRESETS_FORMAT)) throw new FmError("BAD_FILE", "That isn't a Run presets file made by this editor.");
  const incoming = sanitizeDoc(data, ctx);
  const count = (d: PresetDoc) => [...Object.values(d.files), ...Object.values(d.types)].reduce((n, e) => n + e.presets.length, 0);
  const total = count(incoming.doc);
  if (!total) throw new FmError("EMPTY", "That file doesn't contain any usable presets.");
  const mode = body.mode === "replace" ? "replace" : "merge";
  return await update(ctx, (doc) => {
    if (mode === "replace") {
      doc.files = incoming.doc.files;
      doc.types = incoming.doc.types;
      return { imported: total, skipped: incoming.dropped, files: Object.keys(doc.files).length, types: Object.keys(doc.types).length };
    }
    let imported = 0;
    let skipped = incoming.dropped;
    const remap = new Map<string, string>();
    const mergeInto = (target: Record<string, Entry>, key: string, entry: Entry) => {
      const have = target[key] ?? (target[key] = { ...entry, presets: [], defaultRun: "", defaultBuild: "", last: "" });
      for (const x of entry.presets) {
        const twin = have.presets.find((y) => y.name === x.name && y.command === x.command && y.kind === x.kind);
        if (twin) { remap.set(x.id, twin.id); skipped++; continue; }
        if (have.presets.length >= MAX_PRESETS_PER_ENTRY) { skipped++; continue; }
        const fresh = { ...x, id: newId() };
        remap.set(x.id, fresh.id);
        have.presets.push(fresh);
        imported++;
      }
      have.defaultRun ||= remap.get(entry.defaultRun) ?? "";
      have.defaultBuild ||= remap.get(entry.defaultBuild) ?? "";
      if (!have.presets.length) delete target[key];
    };
    // the ".ts" presets go in first, so a file's default can point at one of them
    for (const [k, e] of Object.entries(incoming.doc.types)) if (doc.types[k] || Object.keys(doc.types).length < MAX_TYPE_ENTRIES) mergeInto(doc.types, k, e);
    for (const [k, e] of Object.entries(incoming.doc.files)) mergeInto(doc.files, k, e);
    return { imported, skipped, files: Object.keys(doc.files).length, types: Object.keys(doc.types).length };
  });
}

const ROOT_MARKERS = ["package.json", ".git", "Cargo.toml", "go.mod", "pyproject.toml", "Makefile", "v.mod"];

/** The nearest folder at or above the file that has package.json, .git, Cargo.toml, go.mod, pyproject.toml, Makefile or v.mod ("" when none). */
export async function findProjectRoot(ctx: FmContext, body: Record<string, any>): Promise<{ root: string }> {
  const p = pathApi(ctx);
  let dir = p.dirname(absolutePath(ctx, body.path));
  for (let i = 0; i < 40; i++) {
    for (const marker of ROOT_MARKERS) {
      try {
        await fsp.access(p.join(dir, marker), fs.constants.F_OK);
        return { root: dir };
      } catch {
        // not here
      }
    }
    const up = p.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return { root: "" };
}
