import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { ProfileStore, MemorySecretStore } from "../../src/db/profiles";
import { WorkbenchService } from "../../src/db/service";
import { createWorkbenchHandler } from "../../src/db/workbench_http";

let dir: string;
let base: string;
let server: ReturnType<typeof Bun.serve>;
let handler: ReturnType<typeof createWorkbenchHandler>;
let secrets: MemorySecretStore;
let service: WorkbenchService;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "workbench-http-"));
  secrets = new MemorySecretStore();
  service = new WorkbenchService(new ProfileStore(join(dir, "profiles"), secrets));
  handler = createWorkbenchHandler(service);
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => (await handler.handle(req)) ?? new Response("nf", { status: 404 }) });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(async () => {
  await service.closeAll();
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});

const call = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-workbench-token": handler.token, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, json: type.includes("json") ? ((await res.json()) as any) : null, res };
};

const dbFile = (name: string, sql: string) => {
  const path = join(dir, name);
  const db = new Database(path);
  db.run(sql);
  db.close();
  return path;
};
const profile = (path: string, extra: Record<string, unknown> = {}) => ({ name: "Test SQLite", engine: "sqlite", path, sqliteMode: "readwrite", environment: "development", ...extra });
const connect = async (path: string, extra: Record<string, unknown> = {}) => (await call("/api/v2/connect", { profile: profile(path, extra) })).json.connection.connectionId as string;
const T = (name: string) => ({ name, type: "table" });

describe("workbench HTTP security", () => {
  it("serves the page with the token and a strict CSP, and nothing secret", async () => {
    const res = await fetch(base + "/workbench");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(handler.token);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(html).not.toMatch(/password\s*[:=]\s*["'][^"']+["']/i);
  });

  it("rejects API calls without the token, with the wrong token, and cross-origin requests", async () => {
    expect((await fetch(base + "/api/v2/profiles")).status).toBe(403);
    expect((await call("/api/v2/profiles", undefined, { "x-workbench-token": "nope" })).status).toBe(403);
    expect((await call("/api/v2/profiles", undefined, { origin: "http://evil.example" })).status).toBe(403);
    expect((await call("/api/v2/profiles", undefined, { host: "evil.example" })).status).toBe(403);
  });

  it("requires JSON bodies and validates input", async () => {
    const r = await fetch(base + "/api/v2/connect", { method: "POST", headers: { "x-workbench-token": handler.token, "content-type": "text/plain" }, body: "{}" });
    expect(r.status).toBe(400);
    expect((await call("/api/v2/browse", { connectionId: 5 })).status).toBe(400);
    expect((await call("/api/v2/browse", { connectionId: "x", table: { name: "t" }, limit: 99999 })).status).toBe(400);
    expect((await call("/api/v2/profiles/save", { profile: { engine: "oracle", name: "x" } })).json.error.code).toBe("INVALID_REQUEST");
    expect((await call("/api/v2/nope", {})).status).toBe(404);
  });
});

describe("connection profiles and credentials", () => {
  it("stores the password in the secret store, never in the profile file, responses or errors", async () => {
    const secret = "S3cret-Passw0rd-XYZ";
    const saved = await call("/api/v2/profiles/save", { profile: { name: "Prod DB", engine: "postgres", host: "db.example.test", port: 5432, user: "app", database: "app", environment: "production", tags: ["a", "b"] }, password: secret });
    expect(saved.json.ok).toBe(true);
    expect(saved.json.profile.hasPassword).toBe(true);
    expect(JSON.stringify(saved.json)).not.toContain(secret);
    const id = saved.json.profile.id as string;
    expect(await secrets.get(id)).toBe(secret);
    const file = readFileSync(join(dir, "profiles", "connections.json"), "utf8");
    expect(file).not.toContain(secret);
    expect((await call("/api/v2/profiles")).json.profiles.some((p: any) => p.password !== undefined)).toBe(false);
    // failing connection: the error must not echo the password
    const fail = await call("/api/v2/connect", { profileId: id });
    expect(fail.json.ok).toBe(false);
    expect(JSON.stringify(fail.json)).not.toContain(secret);
    // duplicate keeps the secret, delete removes it
    const dup = await call("/api/v2/profiles/duplicate", { id });
    expect(await secrets.get(dup.json.profile.id)).toBe(secret);
    await call("/api/v2/profiles/delete", { id });
    await call("/api/v2/profiles/delete", { id: dup.json.profile.id });
    expect(await secrets.get(id)).toBeNull();
    expect(await secrets.get(dup.json.profile.id)).toBeNull();
  });

  it("keeps recent connections", async () => {
    const path = dbFile("recent.db", "CREATE TABLE t (a)");
    const saved = (await call("/api/v2/profiles/save", { profile: profile(path, { name: "Recent one" }) })).json.profile;
    const conn = await call("/api/v2/connect", { profileId: saved.id });
    await call("/api/v2/disconnect", { connectionId: conn.json.connection.connectionId });
    expect((await call("/api/v2/profiles")).json.recent[0].id).toBe(saved.id);
    await call("/api/v2/profiles/delete", { id: saved.id });
  });

  it("SQLite: no implicit file creation; explicit create makes a new file; memory warns", async () => {
    const path = join(dir, "created.db");
    const miss = await call("/api/v2/connect", { profile: profile(path) });
    expect(miss.json.error.code).toBe("DATABASE_NOT_FOUND");
    expect(existsSync(path)).toBe(false);
    const created = await call("/api/v2/connect", { profile: profile(path, { sqliteMode: "create" }) });
    expect(created.json.ok).toBe(true);
    expect(existsSync(path)).toBe(true);
    const mem = await call("/api/v2/connect", { profile: { name: "Mem", engine: "sqlite", sqliteMode: "memory", environment: "test" } });
    expect(mem.json.connection.temporary).toBe(true);
    expect(mem.json.connection.capabilities.notes.temporary).toContain("lost");
  });
});

describe("browse, safe edit, export", () => {
  it("browses with paging, sorting and filtering and explains read-only results", async () => {
    const path = dbFile("browse.db", "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, note TEXT); WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n<120) INSERT INTO items (name) SELECT 'item ' || n FROM c; CREATE VIEW v_items AS SELECT * FROM items;");
    const id = await connect(path);
    const objs = (await call("/api/v2/objects", { connectionId: id })).json.objects.map((o: any) => o.name);
    expect(objs).toEqual(expect.arrayContaining(["items", "v_items"]));
    const p2 = (await call("/api/v2/browse", { connectionId: id, table: T("items"), limit: 50, offset: 50 })).json;
    expect(p2.total).toBe(120);
    expect(p2.rows[0].id).toBe(51);
    expect(p2.editable.ok).toBe(true);
    const f = (await call("/api/v2/browse", { connectionId: id, table: T("items"), limit: 10, offset: 0, filters: [{ column: "name", op: "contains", value: "item 11" }], orderBy: [{ column: "id", direction: "desc" }] })).json;
    expect(f.total).toBe(11); // item 11, 110..119
    const v = (await call("/api/v2/browse", { connectionId: id, table: { name: "v_items", type: "view" }, limit: 5, offset: 0 })).json;
    expect(v.editable.ok).toBe(false);
    expect(v.editable.reason).toContain("Views are read-only");
  });

  it("edits only the intended row and reports conflicts", async () => {
    const path = dbFile("edit.db", "CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO people (name) VALUES ('Ann'),('Bob'),('Cy')");
    const id = await connect(path);
    const ok = await call("/api/v2/row/update", { connectionId: id, table: T("people"), key: { id: 2 }, expected: { name: "Bob" }, changes: { name: "Robert" } });
    expect(ok.json.ok).toBe(true);
    const bad = await call("/api/v2/row/update", { connectionId: id, table: T("people"), key: { id: 2 }, expected: { name: "Bob" }, changes: { name: "Other" } });
    expect(bad.status).toBe(409);
    expect(bad.json.error.code).toBe("CONFLICT");
    const check = new Database(path, { readonly: true });
    expect(check.query("SELECT name FROM people ORDER BY id").all().map((r: any) => r.name)).toEqual(["Ann", "Robert", "Cy"]);
    check.close();
    expect((await call("/api/v2/row/update", { connectionId: id, table: T("people"), key: {}, expected: {}, changes: { name: "x" } })).json.error.code).toBe("INVALID_REQUEST");
  });

  it("deleting a row needs a server-side confirmation bound to that exact operation", async () => {
    const path = dbFile("del.db", "CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t (v) VALUES ('a'),('b')");
    const id = await connect(path);
    const body = { connectionId: id, table: T("t"), key: { id: 1 } };
    const first = await call("/api/v2/row/delete", body);
    expect(first.json.needsConfirmation).toBe(true);
    expect(first.json.summary.statements[0]).toContain("DELETE FROM t");
    // a token for another row is rejected
    const other = await call("/api/v2/row/delete", { ...body, key: { id: 2 }, confirmToken: first.json.token });
    expect(other.json.error.code).toBe("INVALID_REQUEST");
    const again = await call("/api/v2/row/delete", body);
    const done = await call("/api/v2/row/delete", { ...body, confirmToken: again.json.token });
    expect(done.json.ok).toBe(true);
    expect(done.json.result.affectedRows).toBe(1);
    // tokens are single-use
    const reuse = await call("/api/v2/row/delete", { ...body, key: { id: 2 }, confirmToken: again.json.token });
    expect(reuse.json.error.code).toBe("INVALID_REQUEST");
    const check = new Database(path, { readonly: true });
    expect(check.query("SELECT COUNT(*) AS n FROM t").get()).toEqual({ n: 1 });
    check.close();
  });

  it("exports CSV streamed, escaped, NULL vs empty, with excluded columns", async () => {
    const path = dbFile("csv.db", "CREATE TABLE c (id INTEGER PRIMARY KEY, s TEXT, secret TEXT); INSERT INTO c (s, secret) VALUES ('say \"hi\", ok', 'x'), (NULL, 'y'), ('', 'z')");
    const id = await connect(path);
    const res = await fetch(base + "/api/v2/export/csv", { method: "POST", headers: { "x-workbench-token": handler.token, "content-type": "application/json" }, body: JSON.stringify({ connectionId: id, table: T("c"), excludeColumns: ["secret"] }) });
    expect(res.headers.get("content-disposition")).toContain('filename="c.csv"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM so spreadsheets read Unicode correctly
    expect(new TextDecoder("utf-8", { ignoreBOM: false }).decode(bytes)).toBe('id,s\r\n1,"say ""hi"", ok"\r\n2,\r\n3,""\r\n');
    const missing = await call("/api/v2/export/csv", { connectionId: id, table: T("nope") });
    expect(missing.json.error.code).toBe("OBJECT_NOT_FOUND");
  });
});

describe("SQL execution, transactions and safety", () => {
  it("runs one statement with parameters and splits scripts safely (stop vs continue)", async () => {
    const id = await connect(":memory:", { sqliteMode: "memory" });
    const q = await call("/api/v2/query", { connectionId: id, sql: "SELECT ? AS a, ? AS b", params: [{ $bigint: "9223372036854775807" }, "x;y"] });
    expect(q.json.result.rows[0]).toEqual({ a: "9223372036854775807", b: "x;y" });
    expect((await call("/api/v2/query", { connectionId: id, sql: "SELECT 1; SELECT 2" })).json.error.code).toBe("INVALID_REQUEST");
    const script = "CREATE TABLE s (id INTEGER PRIMARY KEY, v TEXT NOT NULL); INSERT INTO s (v) VALUES ('a;b'); INSERT INTO s (v) VALUES (NULL); INSERT INTO s (v) VALUES ('c');";
    const stop = (await call("/api/v2/script", { connectionId: id, sql: script, onError: "stop" })).json.script;
    expect(stop.statements.map((s: any) => s.ok)).toEqual([true, true, false]);
    expect(stop.stoppedAt).toBe(2);
    expect(stop.statements[2].error.code).toBe("CONSTRAINT_VIOLATION");
    const cont = (await call("/api/v2/script", { connectionId: id, sql: "INSERT INTO s (v) VALUES (NULL); INSERT INTO s (v) VALUES ('d');", onError: "continue" })).json.script;
    expect(cont.statements.map((s: any) => s.ok)).toEqual([false, true]);
    expect((await call("/api/v2/query", { connectionId: id, sql: "SELECT COUNT(*) AS n FROM s" })).json.result.rows[0].n).toBe(2);
  });

  it("all-or-nothing scripts roll back on failure", async () => {
    const id = await connect(":memory:", { sqliteMode: "memory" });
    await call("/api/v2/query", { connectionId: id, sql: "CREATE TABLE a (v TEXT NOT NULL)" });
    const r = (await call("/api/v2/script", { connectionId: id, atomic: true, sql: "INSERT INTO a VALUES ('1'); INSERT INTO a VALUES (NULL);" })).json.script;
    expect(r.rolledBack).toBe(true);
    expect((await call("/api/v2/query", { connectionId: id, sql: "SELECT COUNT(*) AS n FROM a" })).json.result.rows[0].n).toBe(0);
  });

  it("destructive statements need confirmation; DELETE/UPDATE without WHERE too", async () => {
    const id = await connect(":memory:", { sqliteMode: "memory" });
    await call("/api/v2/query", { connectionId: id, sql: "CREATE TABLE d (v INT)" });
    await call("/api/v2/query", { connectionId: id, sql: "INSERT INTO d VALUES (1),(2)" });
    for (const sql of ["DELETE FROM d", "UPDATE d SET v = 0", "DROP TABLE d", "ALTER TABLE d DROP COLUMN v"]) {
      const r = await call("/api/v2/query", { connectionId: id, sql });
      expect(r.json.needsConfirmation).toBe(true);
    }
    expect((await call("/api/v2/query", { connectionId: id, sql: "SELECT COUNT(*) AS n FROM d" })).json.result.rows[0].n).toBe(2);
    expect((await call("/api/v2/query", { connectionId: id, sql: "DELETE FROM d WHERE v = 1" })).json.result.affectedRows).toBe(1);
    const t = await call("/api/v2/query", { connectionId: id, sql: "DROP TABLE d" });
    const ok = await call("/api/v2/query", { connectionId: id, sql: "DROP TABLE d", confirmToken: t.json.token });
    expect(ok.json.ok).toBe(true);
  });

  it("production connections confirm every write and require the typed connection name", async () => {
    const path = dbFile("prod.db", "CREATE TABLE p (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO p (v) VALUES ('a')");
    const id = await connect(path, { name: "Prod SQLite", environment: "production" });
    const first = await call("/api/v2/query", { connectionId: id, sql: "INSERT INTO p (v) VALUES ('b')" });
    expect(first.json.needsConfirmation).toBe(true);
    expect(first.json.requireTyped).toBe("Prod SQLite");
    const wrong = await call("/api/v2/query", { connectionId: id, sql: "INSERT INTO p (v) VALUES ('b')", confirmToken: first.json.token, confirmTyped: "prod sqlite" });
    expect(wrong.json.ok).toBe(false);
    const again = await call("/api/v2/query", { connectionId: id, sql: "INSERT INTO p (v) VALUES ('b')" });
    const ok = await call("/api/v2/query", { connectionId: id, sql: "INSERT INTO p (v) VALUES ('b')", confirmToken: again.json.token, confirmTyped: "Prod SQLite" });
    expect(ok.json.ok).toBe(true);
    // reads never need confirmation
    expect((await call("/api/v2/query", { connectionId: id, sql: "SELECT COUNT(*) AS n FROM p" })).json.result.rows[0].n).toBe(2);
    // a row edit on production also confirms
    expect((await call("/api/v2/row/update", { connectionId: id, table: T("p"), key: { id: 1 }, expected: { v: "a" }, changes: { v: "z" } })).json.needsConfirmation).toBe(true);
  });

  it("read-only profiles are enforced by the engine, not only by the buttons", async () => {
    const path = dbFile("ro.db", "CREATE TABLE r (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO r (v) VALUES ('a')");
    const id = await connect(path, { sqliteMode: "readonly" });
    expect((await call("/api/v2/query", { connectionId: id, sql: "INSERT INTO r (v) VALUES ('b')" })).json.error.code).toBe("READ_ONLY");
    expect((await call("/api/v2/row/update", { connectionId: id, table: T("r"), key: { id: 1 }, expected: {}, changes: { v: "z" } })).json.error.code).toBe("READ_ONLY");
    expect((await call("/api/v2/script", { connectionId: id, sql: "SELECT 1; DROP TABLE r" })).json.error.code).toBe("READ_ONLY");
    expect((await call("/api/v2/browse", { connectionId: id, table: T("r"), limit: 5, offset: 0 })).json.rows.length).toBe(1);
    const check = new Database(path, { readonly: true });
    expect(check.query("SELECT COUNT(*) AS n FROM r").get()).toEqual({ n: 1 });
    check.close();
  });

  it("transactions: commit, rollback, and unsaved-work protection on disconnect", async () => {
    const path = dbFile("tx.db", "CREATE TABLE x (v INT)");
    const id = await connect(path);
    await call("/api/v2/transaction", { connectionId: id, action: "begin" });
    await call("/api/v2/query", { connectionId: id, sql: "INSERT INTO x VALUES (1)" });
    expect((await call("/api/v2/connections", {})).json.connections.find((c: any) => c.connectionId === id).inTransaction).toBe(true);
    const refused = await call("/api/v2/disconnect", { connectionId: id });
    expect(refused.json.error.message).toContain("open transaction");
    await call("/api/v2/transaction", { connectionId: id, action: "rollback" });
    expect((await call("/api/v2/query", { connectionId: id, sql: "SELECT COUNT(*) AS n FROM x" })).json.result.rows[0].n).toBe(0);
    await call("/api/v2/transaction", { connectionId: id, action: "begin" });
    await call("/api/v2/query", { connectionId: id, sql: "INSERT INTO x VALUES (2)" });
    await call("/api/v2/transaction", { connectionId: id, action: "commit" });
    expect((await call("/api/v2/disconnect", { connectionId: id })).json.ok).toBe(true);
    const check = new Database(path, { readonly: true });
    expect(check.query("SELECT v FROM x").all()).toEqual([{ v: 2 }]);
    check.close();
  });

  it("explains that SQLite cannot cancel a running statement", async () => {
    const id = await connect(":memory:", { sqliteMode: "memory" });
    const r = await call("/api/v2/cancel", { connectionId: id });
    expect(r.json.canceled).toBe(false);
    expect(r.json.explanation).toContain("cannot be interrupted");
  });
});

describe("SQLite backup and restore", () => {
  it("backs up a live WAL database consistently, verifies it, and restores only into a new file", async () => {
    const path = join(dir, "live.db");
    const seed = new Database(path);
    seed.run("PRAGMA journal_mode = WAL");
    seed.run("CREATE TABLE k (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO k (v) VALUES ('one'),('two'),('three')");
    // keep this handle open so committed pages stay in the -wal file (a plain file copy would miss them)
    const id = await connect(path);
    seed.run("INSERT INTO k (v) VALUES ('four')");
    const dest = join(dir, "live.backup.db");
    const bk = await call("/api/v2/sqlite/backup", { connectionId: id, path: dest });
    expect(bk.json.ok).toBe(true);
    expect(bk.json.backup.integrityOk).toBe(true);
    expect(bk.json.backup.tables).toEqual([{ name: "k", rows: 4 }]);
    expect((await call("/api/v2/sqlite/backup", { connectionId: id, path: dest })).json.error.message).toContain("already exists");
    seed.close();

    const target = join(dir, "restored.db");
    const preview = await call("/api/v2/sqlite/restore/preview", { backupPath: dest, targetPath: target });
    expect(preview.json.preview.willOverwrite).toBe(false);
    expect(preview.json.preview.tables).toEqual([{ name: "k", rows: 4 }]);
    // wrong token / existing target are refused
    expect((await call("/api/v2/sqlite/restore/execute", { backupPath: dest, targetPath: target, token: "bogus" })).json.error.code).toBe("INVALID_REQUEST");
    expect((await call("/api/v2/sqlite/restore/preview", { backupPath: dest, targetPath: path })).json.error.message).toContain("never overwritten");
    const done = await call("/api/v2/sqlite/restore/execute", { backupPath: dest, targetPath: target, token: preview.json.preview.token });
    expect(done.json.restored.integrityOk).toBe(true);
    const r = new Database(target, { readonly: true });
    expect(r.query("SELECT v FROM k ORDER BY id").all().map((x: any) => x.v)).toEqual(["one", "two", "three", "four"]);
    r.close();
  });

  it("refuses a corrupt backup", async () => {
    const bad = join(dir, "corrupt.db");
    writeFileSync(bad, Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(4096, 7)]));
    const res = await call("/api/v2/sqlite/restore/preview", { backupPath: bad, targetPath: join(dir, "never.db") });
    expect(res.json.ok).toBe(false);
    expect(existsSync(join(dir, "never.db"))).toBe(false);
  });
});
