import { randomBytes, timingSafeEqual } from "crypto";
import { DbError, normalizeError } from "./errors";
import type { BrowseFilter, ObjectRef, Param } from "./types";
import { WorkbenchService } from "./service";
import { guardLocalRequest } from "../localGuard";
import { generateWorkbenchHtml } from "./workbench_ui";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

const HTTP_STATUS: Partial<Record<DbError["code"], number>> = {
  INVALID_REQUEST: 400,
  NOT_EDITABLE: 409,
  CONFLICT: 409,
  READ_ONLY: 403,
  PERMISSION_DENIED: 403,
  AUTH_FAILED: 401,
  OBJECT_NOT_FOUND: 404,
  DATABASE_NOT_FOUND: 404,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function fail(e: unknown): Response {
  const err = e instanceof DbError ? e : normalizeError("sqlite", e);
  return json({ ok: false, error: err.toJSON() }, HTTP_STATUS[err.code] ?? 400);
}

const bad = (m: string) => new DbError("INVALID_REQUEST", m);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function reqStr(o: Record<string, unknown>, k: string, max = 4096): string {
  const v = o[k];
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw bad(`"${k}" must be a non-empty string`);
  return v;
}
function optStr(o: Record<string, unknown>, k: string, max = 4096): string | undefined {
  const v = o[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || v.length > max) throw bad(`"${k}" must be a string`);
  return v;
}
function optInt(o: Record<string, unknown>, k: string, min: number, max: number): number | undefined {
  const v = o[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw bad(`"${k}" must be an integer from ${min} to ${max}`);
  return v;
}
function reqRef(v: unknown): ObjectRef {
  if (!isObj(v)) throw bad('"table" must be an object');
  const type = v.type === "view" ? "view" : "table";
  const name = reqStr(v, "name", 256);
  const schema = optStr(v, "schema", 256);
  return { name, type, ...(schema ? { schema } : {}) };
}
function reqRecord(v: unknown, what: string): Record<string, Param> {
  if (!isObj(v)) throw bad(`"${what}" must be an object`);
  return v as Record<string, Param>;
}
function params(v: unknown): Param[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 1000) throw bad('"params" must be an array of up to 1000 values');
  return v as Param[];
}
function confirmOf(o: Record<string, unknown>) {
  return { token: optStr(o, "confirmToken", 100), typed: optStr(o, "confirmTyped", 200) };
}

export interface WorkbenchHandlerOptions {
  /** Per-process secret that the page must send back. Generated when omitted. */
  token?: string;
  /** Shown in the page header, e.g. "MySQL Studio". */
  title?: string;
}

export interface WorkbenchHandler {
  token: string;
  service: WorkbenchService;
  /** Returns null for paths it does not own, so it can be mounted in front of another router. */
  handle(req: Request): Promise<Response | null>;
}

/**
 * HTTP surface of the shared database workbench (`/workbench` page and `/api/v2/*`). Every request is
 * checked for loopback Host / same Origin, an API token, a JSON content type and a body-size limit.
 */
export function createWorkbenchHandler(service: WorkbenchService, options: WorkbenchHandlerOptions = {}): WorkbenchHandler {
  const token = options.token ?? randomBytes(24).toString("hex");
  const tokenBuf = Buffer.from(token);

  const tokenOk = (req: Request) => {
    const got = Buffer.from(req.headers.get("x-workbench-token") ?? "");
    return got.length === tokenBuf.length && timingSafeEqual(got, tokenBuf);
  };

  async function body(req: Request): Promise<Record<string, unknown>> {
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw bad("Content-Type must be application/json");
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_BODY_BYTES) throw bad("Request body is too large");
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw bad("Request body is too large");
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw bad("Request body is not valid JSON");
    }
    if (!isObj(parsed)) throw bad("Request body must be a JSON object");
    return parsed;
  }

  async function route(path: string, req: Request): Promise<Response> {
    if (path === "/api/v2/profiles" && req.method === "GET") {
      return json({ ok: true, profiles: await service.profiles.list(), recent: await service.profiles.recent(), secretStore: service.profiles.secretStoreKind });
    }
    if (req.method !== "POST") return json({ ok: false, error: { code: "INVALID_REQUEST", message: "Method not allowed" } }, 405);
    const b = await body(req);

    switch (path) {
      case "/api/v2/profiles/save": {
        const password = b.password === undefined ? undefined : typeof b.password === "string" ? b.password : (() => { throw bad('"password" must be a string'); })();
        const saved = await service.profiles.save(b.profile, password, optStr(b, "id", 64));
        return json({ ok: true, profile: saved });
      }
      case "/api/v2/profiles/delete":
        await service.profiles.remove(reqStr(b, "id", 64));
        return json({ ok: true });
      case "/api/v2/profiles/duplicate":
        return json({ ok: true, profile: await service.profiles.duplicate(reqStr(b, "id", 64)) });
      case "/api/v2/test": {
        const r = await service.test({ profileId: optStr(b, "profileId", 64), profile: b.profile, password: optStr(b, "password", 1024) });
        return json({ ok: true, ...r });
      }
      case "/api/v2/connect": {
        const c = await service.connect({ profileId: optStr(b, "profileId", 64), profile: b.profile, password: optStr(b, "password", 1024) });
        return json({ ok: true, connection: c });
      }
      case "/api/v2/disconnect":
        await service.disconnect(reqStr(b, "connectionId", 64), { discardTransaction: b.discardTransaction === true });
        return json({ ok: true });
      case "/api/v2/connections":
        return json({ ok: true, connections: service.list() });
      case "/api/v2/objects":
        return json({ ok: true, objects: await service.objects(reqStr(b, "connectionId", 64)) });
      case "/api/v2/describe":
        return json({ ok: true, table: await service.describe(reqStr(b, "connectionId", 64), reqRef(b.table)) });
      case "/api/v2/browse": {
        const filters = Array.isArray(b.filters) ? (b.filters as BrowseFilter[]) : [];
        if (filters.length > 50) throw bad("Too many filters");
        const orderBy = Array.isArray(b.orderBy) ? (b.orderBy as { column: string; direction: "asc" | "desc" }[]) : [];
        if (orderBy.length > 10) throw bad("Too many sort columns");
        const result = await service.browse(reqStr(b, "connectionId", 64), {
          table: reqRef(b.table),
          limit: optInt(b, "limit", 1, 5000) ?? 50,
          offset: optInt(b, "offset", 0, 2_000_000_000) ?? 0,
          filters,
          orderBy,
        });
        return json({ ok: true, ...result });
      }
      case "/api/v2/row/update": {
        const r = await service.updateRow(reqStr(b, "connectionId", 64), { table: reqRef(b.table), key: reqRecord(b.key, "key"), expected: reqRecord(b.expected ?? {}, "expected"), changes: reqRecord(b.changes, "changes") }, confirmOf(b));
        return json({ ok: true, ...("needsConfirmation" in r ? r : { result: r }) });
      }
      case "/api/v2/row/delete": {
        const r = await service.deleteRow(reqStr(b, "connectionId", 64), { table: reqRef(b.table), key: reqRecord(b.key, "key"), expected: b.expected === undefined ? undefined : reqRecord(b.expected, "expected") }, confirmOf(b));
        return json({ ok: true, ...("needsConfirmation" in r ? r : { result: r }) });
      }
      case "/api/v2/row/insert": {
        const r = await service.insertRow(reqStr(b, "connectionId", 64), { table: reqRef(b.table), values: reqRecord(b.values, "values") }, confirmOf(b));
        return json({ ok: true, ...("needsConfirmation" in r ? r : { result: r }) });
      }
      case "/api/v2/query": {
        const r = await service.query(reqStr(b, "connectionId", 64), reqStr(b, "sql", 1_000_000), params(b.params), { maxRows: optInt(b, "maxRows", 1, 100_000), ...confirmOf(b) });
        return json({ ok: true, ...("needsConfirmation" in r ? r : { result: r }) });
      }
      case "/api/v2/script": {
        const onError = b.onError === "continue" ? "continue" : "stop";
        const r = await service.script(reqStr(b, "connectionId", 64), reqStr(b, "sql", 5_000_000), { onError, atomic: b.atomic === true, maxRows: optInt(b, "maxRows", 1, 100_000), ...confirmOf(b) });
        return json({ ok: true, ...("needsConfirmation" in r ? r : { script: r }) });
      }
      case "/api/v2/transaction": {
        const action = b.action;
        if (action !== "begin" && action !== "commit" && action !== "rollback") throw bad('"action" must be begin, commit or rollback');
        return json({ ok: true, ...(await service.transaction(reqStr(b, "connectionId", 64), action)) });
      }
      case "/api/v2/cancel":
        return json({ ok: true, ...(await service.cancel(reqStr(b, "connectionId", 64))) });
      case "/api/v2/export/csv": {
        const id = reqStr(b, "connectionId", 64);
        const source = b.sql !== undefined ? { sql: reqStr(b, "sql", 1_000_000), params: params(b.params) } : { table: reqRef(b.table), excludeColumns: Array.isArray(b.excludeColumns) ? (b.excludeColumns as unknown[]).filter((x): x is string => typeof x === "string") : [] };
        const iter = service.exportCsv(id, source);
        const first = await iter.next(); // surface errors (unknown table, ...) as a normal JSON error before streaming
        const name = ("table" in source ? source.table.name : "query").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "export";
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const enc = new TextEncoder();
            if (!first.done) controller.enqueue(enc.encode("\ufeff" + first.value));
            try {
              for await (const chunk of iter) controller.enqueue(enc.encode(chunk));
              controller.close();
            } catch (e) {
              controller.error(e);
            }
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      }
      case "/api/v2/sqlite/backup":
        return json({ ok: true, backup: await service.sqliteBackup(reqStr(b, "connectionId", 64), reqStr(b, "path", 2048)) });
      case "/api/v2/sqlite/restore/preview":
        return json({ ok: true, preview: service.sqliteRestorePreview(reqStr(b, "backupPath", 2048), reqStr(b, "targetPath", 2048)) });
      case "/api/v2/sqlite/restore/execute":
        return json({ ok: true, restored: service.sqliteRestoreExecute(reqStr(b, "backupPath", 2048), reqStr(b, "targetPath", 2048), reqStr(b, "token", 100)) });
      default:
        return json({ ok: false, error: { code: "INVALID_REQUEST", message: "Unknown endpoint" } }, 404);
    }
  }

  return {
    token,
    service,
    async handle(req: Request): Promise<Response | null> {
      const url = new URL(req.url);
      const path = url.pathname;
      const isPage = path === "/workbench" || path === "/workbench/";
      if (!isPage && !path.startsWith("/api/v2/")) return null;
      const blocked = guardLocalRequest(req);
      if (blocked) return blocked;
      if (isPage) {
        return new Response(generateWorkbenchHtml({ token, title: options.title }), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" },
        });
      }
      if (!tokenOk(req)) return json({ ok: false, error: { code: "AUTH_FAILED", message: "Missing or invalid workbench token. Reload the page." } }, 403);
      try {
        return await route(path, req);
      } catch (e) {
        return fail(e);
      }
    },
  };
}
