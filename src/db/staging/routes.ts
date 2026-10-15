/**
 * HTTP surface of the staging import, mounted by the SQLite, MySQL and PostgreSQL studio servers under `/api/staging/`.
 *
 * Protection (same as the studios' other routes, plus two more): the studio server already refuses non-loopback Host headers and
 * cross-origin requests (`guardLocalRequest`); here every request must also carry `X-Studio-Staging: 1` (a custom header cannot be
 * sent cross-site without a CORS pre-flight, which these servers never approve), JSON bodies must be `application/json`,
 * uploaded bytes are written to a private scratch folder and nowhere else, and a file is only read from disk after the File
 * Manager (which holds a secret token) grants that exact path.
 */
import { randomBytes, timingSafeEqual } from "crypto";
import { appendFileSync, chmodSync, closeSync, mkdirSync, openSync, readdirSync, realpathSync, rmSync, statSync, writeSync } from "fs";
import { tmpdir } from "os";
import { extname, join } from "path";
import type { StageDb } from "./db";
import { isOwnTable } from "./dialect";
import { StagingError, limitMessage, limits } from "./limits";
import { getBatch, updateBatch, type BatchRecord } from "./ledger";
import { autoMap, compileRules, sanitizeRules } from "./mapping";
import { checkNewTableName, newTableTarget, sanitizeNewTable, suggestNewTable } from "./newtable";
import { checkCell } from "./validate";
import { executePromote, previewPromote, MODE_LABELS, testDatabaseRules, undoBatch } from "./promote";
import { analyzeSource, isEncodingName, type Analysis, type SourceSettings } from "./reader";
import { dropStaging, fixCell, forgetBatch, listProblems, listStagedRows, rejectsCsv, setSkipped, stagingArea, stagingDataColumns, transformColumn } from "./review";
import { fileSource, memorySource, type ByteSource } from "./source";
import { loadIntoStaging, LoadCancelled } from "./staging";
import type { ImportPlan, PromoteMode, Step, TargetTable, UserRule } from "./types";
import { validateStaging } from "./validate";

export interface StagingContext {
  engine: "sqlite" | "mysql" | "postgres";
  /** The studio's current database. Called on every request so a switched database is picked up. */
  getDb(): Promise<StageDb>;
  /** Marked production, or read-only, by the File Manager: promoting needs a typed confirmation. */
  guarded?(): { production: boolean; readOnlyMarked: boolean };
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const fail = (e: unknown): Response => {
  if (e instanceof StagingError) return reply({ ok: false, error: { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}) } }, e.status);
  const msg = String((e as any)?.message ?? e);
  return reply({ ok: false, error: { code: "ERROR", message: msg.replace(/(password|pwd)=[^\s&]+/gi, "$1=***") } }, 400);
};

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const ALLOWED_EXT = new Set(["csv", "tsv", "txt", "tab", "psv", "dat", "json", "ndjson", "jsonl", "log"]);
const MAX_JSON_BODY = 64 * 1024 * 1024;
const MAX_CHUNK = 16 * 1024 * 1024;

interface SourceEntry {
  id: string;
  path: string;
  name: string;
  size: number;
  /** A scratch copy we made (deleted on release) or a file somebody else owns (never touched). */
  owned: boolean;
  created: number;
}

interface JobState {
  id: string;
  kind: string;
  state: "running" | "done" | "failed" | "cancelled";
  phase: string;
  rows: number;
  fraction: number;
  result?: unknown;
  error?: { code: string; message: string; hint?: string };
  controller: AbortController;
  startedAt: number;
  finishedAt?: number;
}

export interface StagingHandler {
  /** Returns null for paths it does not own. */
  handle(req: Request): Promise<Response | null>;
  /** Called by the File Manager (through the secret-protected grant route) or at start-up from the environment. */
  setPending(p: { open?: boolean; path?: string } | null): { ok: true } | { ok: false; error: string };
  dispose(): void;
}

export function scratchDir(): string {
  const dir = join(tmpdir(), `bunrad-staging-${process.getuid?.() ?? "user"}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* not supported here */
  }
  return dir;
}

function sweepScratch(dir: string): void {
  try {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (Date.now() - statSync(p).mtimeMs > 24 * 3600 * 1000) rmSync(p, { force: true });
    }
  } catch {
    /* ignore */
  }
}

export function createStagingHandler(ctx: StagingContext, opts: { token?: string; scratch?: string } = {}): StagingHandler {
  const sources = new Map<string, SourceEntry>();
  const uploads = new Map<string, { path: string; name: string; size: number; received: number; fd: number }>();
  const jobs = new Map<string, JobState>();
  const scratch = opts.scratch ?? scratchDir();
  if (!opts.scratch) sweepScratch(scratch);
  mkdirSync(scratch, { recursive: true, mode: 0o700 });
  const token = opts.token ?? process.env.STUDIO_STAGING_TOKEN ?? "";
  const guarded = () => ctx.guarded?.() ?? { production: process.env.STUDIO_ENVIRONMENT === "production", readOnlyMarked: process.env.STUDIO_READONLY === "1" };
  let pending: { open: boolean; path?: string; name?: string; size?: number } | null = null;

  const setPending: StagingHandler["setPending"] = (p) => {
    if (!p) {
      pending = null;
      return { ok: true };
    }
    if (p.path) {
      const v = validatePath(p.path);
      if (!v.ok) return v;
      pending = { open: true, path: v.path, name: v.name, size: v.size };
    } else pending = { open: !!p.open };
    return { ok: true };
  };
  if (process.env.STUDIO_IMPORT_FILE) setPending({ open: true, path: process.env.STUDIO_IMPORT_FILE });
  else if (process.env.STUDIO_IMPORT_OPEN === "1") setPending({ open: true });

  function validatePath(raw: string): { ok: true; path: string; name: string; size: number } | { ok: false; error: string } {
    try {
      if (typeof raw !== "string" || !raw || raw.length > 4096 || raw.includes("\0")) return { ok: false, error: "That is not a file path." };
      if (!/^([A-Za-z]:[\\/]|\/|\\\\)/.test(raw)) return { ok: false, error: "The file path must be absolute." };
      const real = realpathSync(raw);
      const st = statSync(real);
      if (!st.isFile()) return { ok: false, error: "That is not a file." };
      const ext = extname(real).slice(1).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) return { ok: false, error: "Only CSV, TSV, text, JSON and JSON Lines files can be loaded." };
      if (st.size > limits.maxFileBytes) return { ok: false, error: limitMessage("file") };
      return { ok: true, path: real, name: real.split(/[\\/]/).pop()!, size: st.size };
    } catch {
      return { ok: false, error: "That file could not be found or read." };
    }
  }

  const sourceOf = (id: unknown): { entry: SourceEntry; src: ByteSource } => {
    const entry = typeof id === "string" ? sources.get(id) : undefined;
    if (!entry) throw new StagingError("That file is not available any more. Choose it again.", "NO_SOURCE", 404);
    return { entry, src: fileSource(entry.path, entry.name) };
  };

  const release = (id: string) => {
    const e = sources.get(id);
    if (!e) return;
    sources.delete(id);
    if (e.owned) rmSync(e.path, { force: true });
  };

  function settingsFrom(raw: unknown): Partial<SourceSettings> {
    if (!isObj(raw)) return {};
    const out: Partial<SourceSettings> = {};
    if (raw.format === "csv" || raw.format === "json" || raw.format === "ndjson") out.format = raw.format;
    if (typeof raw.delimiter === "string" && raw.delimiter.length <= 1) out.delimiter = raw.delimiter;
    if (typeof raw.quote === "string" && ['"', "'", ""].includes(raw.quote)) out.quote = raw.quote;
    if (typeof raw.hasHeader === "boolean") out.hasHeader = raw.hasHeader;
    if (isEncodingName(raw.encoding)) out.encoding = raw.encoding;
    return out;
  }

  const tableList = async (db: StageDb) => (await db.tables()).filter((t) => !isOwnTable(t));

  async function planFrom(db: StageDb, raw: unknown, sourceNames: string[]): Promise<{ plan: ImportPlan; target: TargetTable }> {
    if (!isObj(raw)) throw new StagingError("The import plan is missing.", "BAD_REQUEST");
    const createTable = raw.createTable === true;
    const name = String(raw.target ?? "");
    const userRules = sanitizeUserRules(raw.userRules);
    let target: TargetTable;
    let plan: ImportPlan;
    if (createTable) {
      const existing = await db.tables();
      const tname = checkNewTableName(name, existing);
      const spec = sanitizeNewTable(raw.newTable);
      const keyColumns = Array.isArray(raw.keyColumns) ? raw.keyColumns.map(String) : [];
      const built = newTableTarget(db, tname, spec, keyColumns);
      target = built.target;
      const rules = sanitizeRules(raw.rules, sourceNames, spec.columns.map((c) => c.name));
      plan = { target: tname, createTable: true, rules, keyColumns: keyColumns.filter((k) => spec.columns.some((c) => c.name === k)), userRules, newTable: { columns: spec.columns.map((c) => ({ name: c.name, kind: c.kind, nullable: c.nullable, ...(c.length ? { length: c.length } : {}), ...(c.precision ? { precision: c.precision, scale: c.scale } : {}) })), autoId: spec.autoId } as ImportPlan["newTable"] };
    } else {
      if (isOwnTable(name)) throw new StagingError("That table belongs to the import itself and cannot be a target.", "BAD_TABLE");
      target = await db.describe(name);
      const rules = sanitizeRules(raw.rules, sourceNames, target.columns.map((c) => c.name));
      const keyColumns = (Array.isArray(raw.keyColumns) ? raw.keyColumns.map(String) : []).filter((k) => target.columns.some((c) => c.name === k));
      plan = { target: name, createTable: false, rules, keyColumns, userRules };
    }
    plan.userRules = plan.userRules.filter((r) => target.columns.some((c) => c.name === r.column));
    return { plan, target };
  }

  function sanitizeUserRules(raw: unknown): UserRule[] {
    if (!Array.isArray(raw)) return [];
    if (raw.length > 100) throw new StagingError("Too many rules (100 at most).", "BAD_REQUEST");
    return raw.map((r: any) => {
      if (!isObj(r) || typeof r.column !== "string" || !["regex", "min", "max", "oneof", "length", "notempty"].includes(r.kind)) throw new StagingError("A rule is not complete.", "BAD_REQUEST");
      return { column: r.column, kind: r.kind, value: String(r.value ?? "").slice(0, 500), ...(typeof r.message === "string" && r.message ? { message: r.message.slice(0, 200) } : {}) };
    });
  }

  async function batchPlan(db: StageDb, batch: BatchRecord): Promise<{ plan: ImportPlan; target: TargetTable; dataColumns: string[] }> {
    const plan = batch.config?.plan as ImportPlan | undefined;
    if (!plan) throw new StagingError("This import has no saved plan.", "NO_PLAN", 409);
    const dataColumns = await stagingDataColumns(db, batch);
    let target: TargetTable;
    if (plan.createTable && batch.status !== "promoted" && batch.status !== "undone") {
      const spec = sanitizeNewTable(plan.newTable);
      target = newTableTarget(db, plan.target, spec, plan.keyColumns).target;
      if ((await db.tables()).includes(plan.target)) throw new StagingError(`A table called “${plan.target}” exists now, so this batch can no longer create it. Open the import again and choose that table as the target, or pick another name.`, "NAME_TAKEN", 409);
    } else target = await db.describe(plan.target);
    return { plan, target, dataColumns };
  }

  const guardedConfirm = (typed: unknown, tableName: string) => {
    const g = guarded();
    if (!(g.production || g.readOnlyMarked)) return;
    if (typed !== tableName) {
      throw new StagingError(g.production ? `This is a production connection. To go on, type the table name “${tableName}” to confirm.` : `This connection is marked read-only. To go on anyway, type the table name “${tableName}” to confirm.`, "NEEDS_CONFIRM", 403, tableName);
    }
  };

  function assertIdle(): void {
    for (const j of jobs.values()) if (j.state === "running") throw new StagingError("Another import step is still running. Wait for it to finish or cancel it.", "BUSY", 409);
  }

  function startJob(kind: string, fn: (job: JobState) => Promise<unknown>): JobState {
    assertIdle();
    const job: JobState = { id: randomBytes(8).toString("hex"), kind, state: "running", phase: "Starting", rows: 0, fraction: 0, controller: new AbortController(), startedAt: Date.now() };
    jobs.set(job.id, job);
    for (const [id, j] of jobs) if (j.finishedAt && Date.now() - j.finishedAt > 10 * 60_000) jobs.delete(id);
    fn(job)
      .then((result) => {
        job.result = result;
        job.state = "done";
      })
      .catch((e) => {
        if (e instanceof LoadCancelled || job.controller.signal.aborted) {
          job.state = "cancelled";
          job.error = { code: "CANCELLED", message: "Cancelled. Nothing was kept." };
        } else {
          job.state = "failed";
          const f = e instanceof StagingError ? { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}) } : { code: "ERROR", message: String(e?.message ?? e) };
          job.error = f;
        }
      })
      .finally(() => {
        job.finishedAt = Date.now();
        job.fraction = job.state === "done" ? 1 : job.fraction;
      });
    return job;
  }

  const publicJob = (j: JobState) => ({ id: j.id, kind: j.kind, state: j.state, phase: j.phase, rows: j.rows, fraction: j.fraction, result: j.result, error: j.error, seconds: Math.round(((j.finishedAt ?? Date.now()) - j.startedAt) / 100) / 10 });

  async function readJson(req: Request): Promise<Record<string, any>> {
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new StagingError("Content-Type must be application/json.", "BAD_REQUEST", 415);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_JSON_BODY) throw new StagingError("That request is too large.", "TOO_BIG", 413);
    const text = await req.text();
    if (text.length > MAX_JSON_BODY) throw new StagingError("That request is too large.", "TOO_BIG", 413);
    try {
      const v = text ? JSON.parse(text) : {};
      if (!isObj(v)) throw new Error("not an object");
      return v;
    } catch {
      throw new StagingError("The request is not valid JSON.", "BAD_REQUEST");
    }
  }

  const describeShort = (t: TargetTable) => ({ name: t.name, primaryKey: t.primaryKey, uniques: t.uniques, foreignKeys: t.foreignKeys, columns: t.columns.map((c) => ({ name: c.name, type: c.dataType, cls: c.cls, nullable: c.nullable, required: !c.nullable && !c.hasDefault && !c.auto && !c.generated, auto: c.auto, generated: c.generated, pk: c.pkPosition, ...(c.enumValues ? { enumValues: c.enumValues.slice(0, 30) } : {}) })) });

  function defaultKey(target: TargetTable, mappedTargets: Set<string>): string[] {
    if (target.primaryKey.length && target.primaryKey.every((c) => mappedTargets.has(c))) return target.primaryKey;
    for (const u of target.uniques) if (u.every((c) => mappedTargets.has(c))) return u;
    return [];
  }

  async function route(path: string, req: Request): Promise<Response> {
    const db = async () => ctx.getDb();

    if (path === "info" && req.method === "GET") {
      const d = await db();
      const g = guarded();
      return reply({ ok: true, engine: ctx.engine, database: d.label, schema: d.schema ?? null, shared: d.shared, production: g.production, readOnlyMarked: g.readOnlyMarked, limits: { maxFileBytes: limits.maxFileBytes, maxRows: limits.maxRows, retainDays: limits.retainDays, maxPasteChars: limits.maxPasteChars }, modes: MODE_LABELS, pending });
    }
    if (path === "pending" && req.method === "GET") return reply({ ok: true, pending });
    if (path === "pending/clear" && req.method === "POST") {
      pending = null;
      return reply({ ok: true });
    }
    if (path === "grant" && req.method === "POST") {
      const got = Buffer.from(req.headers.get("x-staging-grant") ?? "");
      const want = Buffer.from(token);
      if (!token || got.length !== want.length || !timingSafeEqual(got, want)) return reply({ ok: false, error: { code: "FORBIDDEN", message: "Not allowed." } }, 403);
      const b = await readJson(req);
      const r = setPending(typeof b.path === "string" ? { path: b.path } : { open: true });
      return r.ok ? reply({ ok: true }) : reply({ ok: false, error: { code: "BAD_FILE", message: r.error } }, 400);
    }
    if (req.method === "GET" && path !== "tables" && path !== "job") throw new StagingError("Not found.", "NOT_FOUND", 404);

    // ---- getting the data in
    if (path === "upload/start") {
      const b = await readJson(req);
      const size = Number(b.size);
      const name = String(b.name ?? "upload").replace(/[\\/\0]/g, "_").slice(0, 200) || "upload";
      if (!Number.isFinite(size) || size < 0) throw new StagingError("The file size is missing.", "BAD_REQUEST");
      if (size > limits.maxFileBytes) throw new StagingError(limitMessage("file"), "FILE_TOO_BIG", 413);
      if (uploads.size >= 4) throw new StagingError("Too many uploads at once.", "BUSY", 429);
      const id = randomBytes(12).toString("hex");
      const p = join(scratch, `${id}.upload`);
      const fd = openSync(p, "wx", 0o600);
      uploads.set(id, { path: p, name, size, received: 0, fd });
      return reply({ ok: true, uploadId: id, chunkBytes: 8 * 1024 * 1024 });
    }
    if (path === "upload/chunk") {
      const u = new URL(req.url);
      const up = uploads.get(u.searchParams.get("id") ?? "");
      if (!up) throw new StagingError("That upload is not open.", "NO_UPLOAD", 404);
      if (Number(req.headers.get("content-length") ?? 0) > MAX_CHUNK) throw new StagingError("That piece is too large.", "TOO_BIG", 413);
      const offset = Number(u.searchParams.get("offset"));
      if (offset !== up.received) throw new StagingError("An upload piece arrived out of order. Try the upload again.", "OUT_OF_ORDER", 409);
      const buf = new Uint8Array(await req.arrayBuffer());
      if (buf.byteLength > MAX_CHUNK || up.received + buf.byteLength > Math.min(up.size, limits.maxFileBytes)) {
        closeSync(up.fd);
        rmSync(up.path, { force: true });
        uploads.delete(u.searchParams.get("id")!);
        throw new StagingError(limitMessage("file"), "FILE_TOO_BIG", 413);
      }
      writeSync(up.fd, buf);
      up.received += buf.byteLength;
      return reply({ ok: true, received: up.received });
    }
    if (path === "upload/finish") {
      const b = await readJson(req);
      const up = uploads.get(String(b.uploadId));
      if (!up) throw new StagingError("That upload is not open.", "NO_UPLOAD", 404);
      uploads.delete(String(b.uploadId));
      closeSync(up.fd);
      if (up.received !== up.size) {
        rmSync(up.path, { force: true });
        throw new StagingError("The upload did not arrive completely. Try again.", "INCOMPLETE", 409);
      }
      const id = randomBytes(8).toString("hex");
      sources.set(id, { id, path: up.path, name: up.name, size: up.size, owned: true, created: Date.now() });
      return reply({ ok: true, sourceId: id, name: up.name, size: up.size });
    }
    if (path === "upload/cancel") {
      const b = await readJson(req);
      const up = uploads.get(String(b.uploadId));
      if (up) {
        closeSync(up.fd);
        rmSync(up.path, { force: true });
        uploads.delete(String(b.uploadId));
      }
      return reply({ ok: true });
    }
    if (path === "paste") {
      const b = await readJson(req);
      if (typeof b.text !== "string" || !b.text.trim()) throw new StagingError("Paste some text first.", "BAD_REQUEST");
      const mem = memorySource(b.text, "pasted text");
      const id = randomBytes(8).toString("hex");
      const p = join(scratch, `${id}.paste`);
      const fd = openSync(p, "wx", 0o600);
      try {
        appendFileSync(fd, b.text, "utf8");
      } finally {
        closeSync(fd);
      }
      sources.set(id, { id, path: p, name: "pasted text", size: mem.size, owned: true, created: Date.now() });
      return reply({ ok: true, sourceId: id, name: "pasted text", size: mem.size });
    }
    if (path === "source/grant") {
      if (!pending?.path) throw new StagingError("No file is waiting to be loaded.", "NO_GRANT", 404);
      const v = validatePath(pending.path);
      if (!v.ok) throw new StagingError(v.error, "BAD_FILE");
      const id = randomBytes(8).toString("hex");
      sources.set(id, { id, path: v.path, name: v.name, size: v.size, owned: false, created: Date.now() });
      pending = { open: true };
      return reply({ ok: true, sourceId: id, name: v.name, size: v.size });
    }
    if (path === "source/release") {
      const b = await readJson(req);
      release(String(b.sourceId));
      return reply({ ok: true });
    }

    // ---- looking at it and mapping it
    if (path === "tables") {
      const d = await db();
      return reply({ ok: true, tables: await tableList(d) });
    }
    if (path === "describe") {
      const b = await readJson(req);
      const d = await db();
      if (isOwnTable(String(b.table))) throw new StagingError("That table belongs to the import itself.", "BAD_TABLE");
      return reply({ ok: true, table: describeShort(await d.describe(String(b.table))) });
    }
    if (path === "analyze") {
      const b = await readJson(req);
      const { src } = sourceOf(b.sourceId);
      const a = await analyzeSource(src, settingsFrom(b.settings));
      return reply({ ok: true, analysis: a });
    }
    if (path === "suggest") {
      const b = await readJson(req);
      const { src } = sourceOf(b.sourceId);
      const d = await db();
      const a: Analysis = await analyzeSource(src, settingsFrom(b.settings));
      if (b.table === null || b.table === undefined || b.table === "") {
        const s = suggestNewTable(a.columns);
        const base = String(b.newName || (src.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "t_$1") || "imported_data")).slice(0, 50);
        return reply({ ok: true, analysis: a, newTable: { name: base, spec: s.spec, rules: s.rules } });
      }
      if (isOwnTable(String(b.table))) throw new StagingError("That table belongs to the import itself.", "BAD_TABLE");
      const target = await d.describe(String(b.table));
      const m = autoMap(a.columns, target);
      const mappedTargets = new Set(m.rules.filter((r) => r.source.kind !== "skip").map((r) => r.target));
      return reply({ ok: true, analysis: a, table: describeShort(target), mapping: m, keyColumns: defaultKey(target, mappedTargets) });
    }

    if (path === "map/sample") {
      const b = await readJson(req);
      const { src } = sourceOf(b.sourceId);
      const d = await db();
      const a = await analyzeSource(src, settingsFrom(b.settings), 12);
      const { plan, target } = await planFrom(d, b.plan, a.columns.map((c) => c.name));
      const builder = compileRules(plan.rules, a.columns.map((c) => c.name));
      const byName = new Map(target.columns.map((c) => [c.name, c]));
      const rows = a.rows.map((r) => {
        const built = builder.build(r.cells);
        const problems: { column: string; message: string }[] = [];
        builder.columns.forEach((name, i) => {
          const col = byName.get(name);
          const v = built.values[i];
          if (!col || v === null || v === undefined) return;
          const textual = col.cls === "text" || col.cls === "other" || col.cls === "binary";
          if (v.trim() === "" && !textual) return;
          const p = checkCell(col, v, ctx.engine);
          if (p) problems.push({ column: name, message: p.m });
        });
        return { n: r.n, values: built.values, problems, damaged: r.problem ?? null };
      });
      return reply({ ok: true, columns: builder.columns, rows, unused: builder.unusedSource });
    }

    // ---- loading, checking, promoting (jobs)
    if (path === "load") {
      assertIdle();
      const b = await readJson(req);
      const { entry, src } = sourceOf(b.sourceId);
      const d = await db();
      const analysis = await analyzeSource(src, settingsFrom(b.settings));
      const settings = analysis.settings;
      const { plan } = await planFrom(d, b.plan, analysis.columns.map((c) => c.name));
      const job = startJob("load", async (j) => {
        j.phase = "Loading rows into the staging table";
        const res = await loadIntoStaging({
          db: d,
          src,
          settings,
          sourceColumns: analysis.columns.map((c) => c.name),
          plan,
          fileName: entry.name,
          signal: j.controller.signal,
          onProgress: (p) => {
            j.rows = p.rows;
            j.fraction = p.fraction;
          },
        });
        release(entry.id);
        return { batch: res.batch, stagingTable: res.stagingTable, rowsLoaded: res.rowsLoaded, problemRows: res.problemRows, warnings: res.warnings };
      });
      return reply({ ok: true, job: publicJob(job) });
    }
    if (path === "job") {
      const u = new URL(req.url);
      const b = req.method === "POST" ? await readJson(req) : {};
      const j = jobs.get(String(b.id ?? u.searchParams.get("id")));
      if (!j) throw new StagingError("That step is not running.", "NO_JOB", 404);
      return reply({ ok: true, job: publicJob(j) });
    }
    if (path === "job/cancel") {
      const b = await readJson(req);
      jobs.get(String(b.id))?.controller.abort();
      return reply({ ok: true });
    }
    if (path === "batch/open") {
      const b = await readJson(req);
      const d = await db();
      const batch = await getBatch(d, String(b.batchId));
      if (!batch) throw new StagingError("That import was not found.", "NOT_FOUND", 404);
      let table: unknown = null;
      try {
        const bp = await batchPlan(d, batch);
        table = describeShort(bp.target);
      } catch {
        table = null;
      }
      return reply({ ok: true, batch, table, dataColumns: batch.stagingTable && !batch.droppedAt ? await stagingDataColumns(d, batch) : [] });
    }
    if (path === "validate") {
      assertIdle();
      const b = await readJson(req);
      const d = await db();
      const batch = await getBatch(d, String(b.batchId));
      if (!batch) throw new StagingError("That import was not found.", "NOT_FOUND", 404);
      const bp = await batchPlan(d, batch);
      const plan: ImportPlan = { ...bp.plan };
      if (Array.isArray(b.keyColumns)) plan.keyColumns = b.keyColumns.map(String).filter((k) => bp.dataColumns.includes(k));
      if (b.userRules !== undefined) plan.userRules = sanitizeUserRules(b.userRules).filter((r) => bp.target.columns.some((c) => c.name === r.column));
      const job = startJob("validate", async (j) => {
        j.phase = "Checking";
        const summary = await validateStaging({
          db: d,
          batch,
          target: bp.target,
          dataColumns: bp.dataColumns,
          plan,
          signal: j.controller.signal,
          onProgress: (phase, done, total) => {
            j.phase = phase;
            j.rows = done;
            j.fraction = total ? Math.min(0.99, done / total) : j.fraction;
          },
        });
        const fresh = await getBatch(d, batch.batchId);
        if (fresh) await saveConfig(d, fresh, { ...(fresh.config ?? {}), plan });
        const g = guarded();
        if (g.production || g.readOnlyMarked) return { ...summary, notes: [...summary.notes, "The table's own rules (checks, triggers) are not tried in advance on a protected connection, because that would briefly write to the table. If the database refuses a row, promoting stops and nothing is changed."] };
        j.phase = "Trying the table's own rules";
        return await testDatabaseRules({ db: d, batch: fresh ?? batch, target: bp.target, dataColumns: bp.dataColumns, plan }, summary);
      });
      return reply({ ok: true, job: publicJob(job) });
    }
    if (path === "problems") {
      const b = await readJson(req);
      return reply({ ok: true, ...(await listProblems(await db(), String(b.batchId), { column: typeof b.column === "string" ? b.column : undefined, code: typeof b.code === "string" ? b.code : undefined, after: Number(b.after) || 0 })) });
    }
    if (path === "rows") {
      const b = await readJson(req);
      return reply({ ok: true, ...(await listStagedRows(await db(), String(b.batchId), { status: typeof b.status === "string" ? b.status : Array.isArray(b.status) ? b.status.map(String) : undefined, match: typeof b.match === "string" ? b.match : undefined, after: Number(b.after) || 0, limit: Number(b.limit) || undefined })) });
    }
    if (path === "fix") {
      const b = await readJson(req);
      await fixCell(await db(), String(b.batchId), Number(b.rowId), String(b.column), b.value === null ? null : String(b.value));
      return reply({ ok: true });
    }
    if (path === "skip") {
      const b = await readJson(req);
      const n = await setSkipped(await db(), String(b.batchId), { skip: b.skip !== false, ...(Array.isArray(b.rowIds) ? { rowIds: b.rowIds.map(Number) } : {}), ...(b.status === "invalid" || b.status === "duplicate" ? { status: b.status } : {}) });
      return reply({ ok: true, changed: n });
    }
    if (path === "transform") {
      assertIdle();
      const b = await readJson(req);
      const d = await db();
      const [rule] = sanitizeRules([{ target: "x", source: { kind: "constant", value: null }, steps: [b.step] }], [], null);
      const step = rule!.steps[0] as Step | undefined;
      if (!step) throw new StagingError("Choose a clean-up step.", "BAD_REQUEST");
      const job = startJob("transform", async (j) => {
        j.phase = "Cleaning the column";
        return { changed: await transformColumn(d, String(b.batchId), String(b.column), step, (n) => (j.rows = n)) };
      });
      return reply({ ok: true, job: publicJob(job) });
    }
    if (path === "rejects") {
      const b = await readJson(req);
      const d = await db();
      const it = rejectsCsv(d, String(b.batchId));
      const stream = new ReadableStream({
        async pull(controller) {
          const r = await it.next();
          if (r.done) controller.close();
          else controller.enqueue(new TextEncoder().encode(r.value));
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="rejected-rows.csv"', "Cache-Control": "no-store" } });
    }
    if (path === "preview") {
      const b = await readJson(req);
      const d = await db();
      const batch = await getBatch(d, String(b.batchId));
      if (!batch) throw new StagingError("That import was not found.", "NOT_FOUND", 404);
      const bp = await batchPlan(d, batch);
      const mode = String(b.mode) as PromoteMode;
      if (!(mode in MODE_LABELS)) throw new StagingError("Choose what to do with the rows.", "BAD_REQUEST");
      const g = guarded();
      const preview = await previewPromote({ db: d, batch, target: bp.target, dataColumns: bp.dataColumns, plan: bp.plan, mode, ...(Array.isArray(b.updateColumns) ? { updateColumns: b.updateColumns.map(String) } : {}) });
      if (b.rehearse === true && !(g.production || g.readOnlyMarked)) {
        try {
          await executePromote({ db: d, batch, target: bp.target, dataColumns: bp.dataColumns, plan: bp.plan, mode, rehearse: true, ...(Array.isArray(b.updateColumns) ? { updateColumns: b.updateColumns.map(String) } : {}) });
          preview.rehearsal = { ok: true };
        } catch (e) {
          preview.rehearsal = e instanceof StagingError && e.code === "NO_REHEARSAL" ? { ok: true, skipped: e.message } : { ok: false, error: (e as Error).message };
        }
      } else if (b.rehearse === true) preview.rehearsal = { ok: true, skipped: "This is a protected connection, so the test run that would change data (and then roll back) is not done. The counts above are exact." };
      return reply({ ok: true, preview, guarded: g.production || g.readOnlyMarked, table: bp.plan.target });
    }
    if (path === "promote") {
      assertIdle();
      const b = await readJson(req);
      const d = await db();
      const batch = await getBatch(d, String(b.batchId));
      if (!batch) throw new StagingError("That import was not found.", "NOT_FOUND", 404);
      const bp = await batchPlan(d, batch);
      guardedConfirm(b.confirmTyped, bp.plan.target);
      const mode = String(b.mode) as PromoteMode;
      if (!(mode in MODE_LABELS)) throw new StagingError("Choose what to do with the rows.", "BAD_REQUEST");
      const job = startJob("promote", async (j) => {
        j.phase = "Promoting in one transaction";
        const res = await executePromote({ db: d, batch, target: bp.target, dataColumns: bp.dataColumns, plan: bp.plan, mode, ...(Array.isArray(b.updateColumns) ? { updateColumns: b.updateColumns.map(String) } : {}), signal: j.controller.signal, onProgress: (p) => (j.phase = p) });
        return { batch: res.batch, counts: res.counts, undo: res.undo };
      });
      return reply({ ok: true, job: publicJob(job) });
    }
    if (path === "undo") {
      const b = await readJson(req);
      const d = await db();
      const batch = await getBatch(d, String(b.batchId));
      if (!batch) throw new StagingError("That import was not found.", "NOT_FOUND", 404);
      if (batch.targetTable) guardedConfirm(b.confirmTyped, batch.targetTable);
      let target: TargetTable | null = null;
      try {
        target = batch.targetTable ? await d.describe(batch.targetTable) : null;
      } catch {
        target = null;
      }
      const r = await undoBatch(d, target, batch.batchId);
      return reply({ ok: true, result: r });
    }
    if (path === "area") {
      const d = await db();
      return reply({ ok: true, ...(await stagingArea(d)) });
    }
    if (path === "drop") {
      const b = await readJson(req);
      await dropStaging(await db(), String(b.batchId));
      return reply({ ok: true });
    }
    if (path === "forget") {
      const b = await readJson(req);
      await forgetBatch(await db(), String(b.batchId));
      return reply({ ok: true });
    }
    throw new StagingError("Not found.", "NOT_FOUND", 404);
  }

  return {
    setPending,
    dispose() {
      for (const id of [...sources.keys()]) release(id);
      for (const [id, u] of uploads) {
        try {
          closeSync(u.fd);
        } catch {
          /* closed */
        }
        rmSync(u.path, { force: true });
        uploads.delete(id);
      }
    },
    async handle(req: Request): Promise<Response | null> {
      const url = new URL(req.url);
      if (!url.pathname.startsWith("/api/staging/")) return null;
      try {
        if (req.headers.get("x-studio-staging") !== "1" && url.pathname !== "/api/staging/grant") throw new StagingError("This request did not come from the studio page.", "FORBIDDEN", 403);
        const path = url.pathname.slice("/api/staging/".length);
        if (req.method === "POST" && path !== "upload/chunk" && !(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new StagingError("Content-Type must be application/json.", "BAD_REQUEST", 415);
        return await route(path, req);
      } catch (e) {
        return fail(e);
      }
    },
  };
}

async function saveConfig(db: StageDb, batch: BatchRecord, config: unknown): Promise<void> {
  const c = await db.open();
  try {
    await updateBatch(db, c, batch.batchId, { config });
  } finally {
    await c.release();
  }
}

