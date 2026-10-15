/**
 * HTTP API for the "Sample databases" dialog, shared by the SQLite, MySQL and PostgreSQL studios.
 *
 *   GET  /api/samples/catalog                         datasets, counts per scale, queries, target wording
 *   POST /api/samples/seed   {datasetId, scale, target, mode, confirm?, wait?}   starts a job (409 for collisions)
 *   GET  /api/samples/job?id=...                      progress of a job
 *   POST /api/samples/cancel {jobId}                  stops a running job (everything it created is removed again)
 *   POST /api/samples/open   {target}                 points the studio at the created sample
 */
import { catalog, getDataset, datasetCounts } from "./catalog";
import { sqlHelpers } from "./dialect";
import { SCALES, type Dialect, type Scale } from "./model";
import {
  SampleError, SeedCancelled, dialectTargetLabel, type SeedMode, type SeedRequest,
} from "./targets";
import type { SeedHooks, SeedProgress, SeedSummary } from "./runner";

export interface PreparedSeed {
  /** The name the sample will be created under (database, schema or file path). */
  target: string;
  run(hooks: SeedHooks): Promise<SeedSummary>;
}

export interface QueryPreview {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  ms: number;
}

export interface SampleHost {
  dialect: Dialect;
  /** Runs one catalog query (a read-only SELECT) inside the created sample and returns a preview of the rows. */
  runQuery(target: string, sql: string): Promise<QueryPreview>;
  /** Extra wording / options for the dialog (default target, folder, whether "current database" is offered ...). */
  describe(): Record<string, unknown>;
  defaultTarget(datasetId: string): string;
  prepare(req: SeedRequest): Promise<PreparedSeed>;
  open(target: string, datasetId: string): Promise<{ success: boolean; error?: string; path?: string }>;
}

export interface SampleJob {
  id: string;
  datasetId: string;
  scale: Scale;
  target: string;
  mode: SeedMode;
  status: "running" | "done" | "error" | "cancelled";
  phase: SeedProgress["phase"] | "starting";
  table: string | null;
  rowsDone: number;
  rowsTotal: number;
  percent: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  result: (SeedSummary & { target: string }) | null;
}

export interface SampleApi {
  handle(req: Request, url: URL, headers?: Record<string, string>): Promise<Response | null>;
  jobs: Map<string, SampleJob>;
}

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

/** True for a single SELECT / WITH statement (comments allowed) that contains no data-changing or DDL keyword. */
export function isReadOnlySelect(sql: string): boolean {
  const code = sql.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''").trim().replace(/;\s*$/, "");
  if (!/^(WITH|SELECT)\b/i.test(code) || code.includes(";")) return false;
  return !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|REPLACE|MERGE|CALL|EXEC)\b/i.test(code);
}

/** Turns a driver error into a sentence a person can act on. */
export function plainQueryError(message: string): string {
  const m = message.replace(/\s+/g, " ").trim();
  if (/does not exist|doesn't exist|no such table|unknown table|unknown column|no such column/i.test(m)) return `A table or column the query needs was not found (${m}). Is the sample still there, and is it the one that is open?`;
  if (/timeout|canceling statement|max_execution_time/i.test(m)) return "The query took too long and was stopped.";
  if (/read-only|readonly|read only/i.test(m)) return "The query tried to change data, which example queries never do.";
  return `The query could not run: ${m}`;
}

export function createSampleApi(host: SampleHost): SampleApi {
  const jobs = new Map<string, SampleJob>();
  const cancelFlags = new Set<string>();
  let counter = 0;

  const json = (body: unknown, status: number, headers?: Record<string, string>) => Response.json(body, { status, headers });
  const fail = (e: unknown, headers?: Record<string, string>) => {
    if (e instanceof SampleError) return json({ success: false, error: e.message, code: e.code }, e.status, headers);
    return json({ success: false, error: (e as Error)?.message ?? String(e), code: "error" }, 500, headers);
  };

  async function runJob(job: SampleJob, prepared: PreparedSeed, forceNoYield: boolean): Promise<void> {
    try {
      const summary = await prepared.run({
        isCancelled: () => cancelFlags.has(job.id),
        yieldNow: forceNoYield ? undefined : yieldNow,
        onProgress: (p) => {
          job.phase = p.phase;
          job.table = p.table ?? job.table;
          job.rowsDone = p.rowsDone;
          job.rowsTotal = p.rowsTotal;
          job.percent = p.percent;
        },
      });
      job.status = "done";
      job.percent = 100;
      job.result = { ...summary, target: prepared.target };
    } catch (e) {
      if (e instanceof SeedCancelled) job.status = "cancelled";
      else {
        job.status = "error";
        job.error = (e as Error)?.message ?? String(e);
      }
    } finally {
      job.finishedAt = Date.now();
      cancelFlags.delete(job.id);
      while (jobs.size > 20) jobs.delete(jobs.keys().next().value as string);
    }
  }

  return {
    jobs,
    async handle(req, url, headers) {
      const path = url.pathname;
      if (!path.startsWith("/api/samples/")) return null;
      try {
        if (path === "/api/samples/catalog" && req.method === "GET") {
          const datasets = catalog(host.dialect);
          return json({
            success: true, dialect: host.dialect, targetLabel: dialectTargetLabel(host.dialect), scales: SCALES,
            defaultTargets: Object.fromEntries(datasets.map((d) => [d.id, host.defaultTarget(d.id)])),
            host: host.describe(), datasets,
          }, 200, headers);
        }

        if (path === "/api/samples/seed" && req.method === "POST") {
          const body = (await req.json().catch(() => ({}))) as Partial<SeedRequest> & { wait?: boolean };
          const ds = getDataset(String(body.datasetId ?? ""));
          if (!ds) throw new SampleError(`Unknown sample dataset "${body.datasetId}".`, 404, "unknown_dataset");
          const scale = (body.scale ?? "small") as Scale;
          if (!SCALES.includes(scale)) throw new SampleError(`Unknown scale "${body.scale}". Use small, medium or large.`, 400, "bad_scale");
          const mode = (body.mode ?? "new") as SeedMode;
          if (mode !== "new" && mode !== "replace-sample-tables") throw new SampleError(`Unknown mode "${body.mode}".`, 400, "bad_mode");
          if (body.seed !== undefined && !Number.isInteger(body.seed)) throw new SampleError("seed must be an integer.", 400, "bad_seed");
          for (const j of jobs.values()) if (j.status === "running") throw new SampleError("Another sample is still being created. Wait for it or cancel it.", 409, "busy");

          const prepared = await host.prepare({
            datasetId: ds.id, scale, mode, confirm: body.confirm === true, seed: body.seed,
            target: String(body.target ?? "").trim() || host.defaultTarget(ds.id),
          });
          const total = Object.values(datasetCounts(ds)[scale]).reduce((a, b) => a + b, 0);
          const job: SampleJob = {
            id: `job${++counter}_${Date.now().toString(36)}`, datasetId: ds.id, scale, target: prepared.target, mode, status: "running", phase: "starting", table: null,
            rowsDone: 0, rowsTotal: total, percent: 0, startedAt: Date.now(), finishedAt: null, error: null, result: null,
          };
          jobs.set(job.id, job);
          const done = runJob(job, prepared, host.dialect === "sqlite" && String(body.target ?? "").trim() === "current");
          if (body.wait) {
            await done;
            return json({ success: job.status === "done", ...job }, job.status === "done" ? 200 : job.status === "cancelled" ? 409 : 500, headers);
          }
          return json({ success: true, jobId: job.id, status: job.status, target: job.target }, 202, headers);
        }

        if (path === "/api/samples/job" && req.method === "GET") {
          const job = jobs.get(url.searchParams.get("id") ?? "");
          if (!job) throw new SampleError("Unknown job.", 404, "unknown_job");
          return json({ success: true, ...job, elapsedMs: (job.finishedAt ?? Date.now()) - job.startedAt }, 200, headers);
        }

        if (path === "/api/samples/cancel" && req.method === "POST") {
          const body = (await req.json().catch(() => ({}))) as { jobId?: string };
          const job = jobs.get(String(body.jobId ?? ""));
          if (!job) throw new SampleError("Unknown job.", 404, "unknown_job");
          if (job.status === "running") cancelFlags.add(job.id);
          return json({ success: true, ...job }, 200, headers);
        }

        if (path === "/api/samples/open" && req.method === "POST") {
          const body = (await req.json().catch(() => ({}))) as { target?: string; datasetId?: string };
          if (!body.target) throw new SampleError("target is required.", 400, "bad_request");
          const r = await host.open(String(body.target), String(body.datasetId ?? ""));
          return json(r, r.success ? 200 : 400, headers);
        }
        if (path === "/api/samples/run" && req.method === "POST") {
          const body = (await req.json().catch(() => ({}))) as { datasetId?: string; queryId?: string; target?: string };
          const ds = getDataset(String(body.datasetId ?? ""));
          if (!ds) throw new SampleError(`Unknown sample dataset "${body.datasetId}".`, 404, "unknown_dataset");
          const q = ds.queries.find((x) => x.id === body.queryId);
          if (!q) throw new SampleError(`Unknown example query "${body.queryId}".`, 404, "unknown_query");
          if (!body.target) throw new SampleError("target is required.", 400, "bad_request");
          // The SQL always comes from the catalog (never from the request) and runs in a read-only transaction.
          const sql = q.sql(sqlHelpers(host.dialect)).trim();
          if (!isReadOnlySelect(sql)) throw new SampleError("Only read-only SELECT queries can be run here.", 400, "not_read_only");
          try {
            return json({ success: true, queryId: q.id, title: q.title, ...(await host.runQuery(String(body.target), sql)) }, 200, headers);
          } catch (e) {
            if (e instanceof SampleError) throw e;
            throw new SampleError(plainQueryError((e as Error)?.message ?? String(e)), 400, "query_failed");
          }
        }
        return json({ success: false, error: "Not found" }, 404, headers);
      } catch (e) {
        return fail(e, headers);
      }
    },
  };
}
