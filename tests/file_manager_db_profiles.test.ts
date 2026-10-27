import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { createServer } from "net";
import { join } from "path";
import { Database } from "bun:sqlite";
import { ProfileStore } from "../src/db/profiles";
import { connectionFingerprint, engineOfScheme, isScrubbedVariable, maskUrl, parseConnectionUrl, type ParsedConnectionUrl } from "../src/features/filemanager/fmDbModel";
import { API_OPERATIONS } from "../src/features/filemanager/fmServer";
import { FakeKeychain, dbComputer, type DbComputer } from "./helpers/db_fm";

const MARK = "pw-MARKER-7391!x";
const computers: DbComputer[] = [];
const computer = (...a: Parameters<typeof dbComputer>) => {
  const c = dbComputer(...a);
  computers.push(c);
  return c;
};
afterAll(() => computers.forEach((c) => c.remove()));

const parsed = (text: string): ParsedConnectionUrl => {
  const r = parseConnectionUrl(text);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const failure = (text: unknown) => {
  const r = parseConnectionUrl(text);
  return r.ok ? null : r.error;
};

describe("connection addresses", () => {
  test("every kind is understood, with the password kept apart", () => {
    expect(parsed("mysql://app:p%40ss%3Aw@db.example.com:3307/shop?tls=true")).toMatchObject({ engine: "mysql", host: "db.example.com", port: 3307, user: "app", password: "p@ss:w", database: "shop", tls: true });
    expect(parsed("mariadb://root@localhost/x").engine).toBe("mysql");
    expect(parsed("postgres://bob:secret@h.example:5433/app?sslmode=require&schema=audit&connect_timeout=5")).toMatchObject({ engine: "postgres", tls: true, schema: "audit", connectTimeoutMs: 5000, port: 5433 });
    expect(parsed("postgresql://[::1]:5433/x")).toMatchObject({ engine: "postgres", host: "::1", port: 5433, database: "x" });
    expect(parsed("postgres://u@h/db?sslmode=disable").tls).toBe(false);
    expect(parsed("rediss://:pw@cache.example:6380/3")).toMatchObject({ engine: "redis", tls: true, dbIndex: 3, password: "pw", port: 6380 });
    expect(parsed("redis://default:pw@127.0.0.1?db=2")).toMatchObject({ user: "default", dbIndex: 2 });
    expect(parsed("sqlite:///Users/me/a b/data.db")).toMatchObject({ engine: "sqlite", path: "/Users/me/a b/data.db" });
    expect(parsed("sqlite:/Users/me/data.sqlite").path).toBe("/Users/me/data.sqlite");
    expect(parsed("sqlite:///C:/data/x.db").path).toBe("C:/data/x.db");
    expect(parsed("sqlite::memory:")).toMatchObject({ path: ":memory:", sqliteMode: "memory" });
    expect(parsed("/Users/me/My Docs/books.db")).toMatchObject({ engine: "sqlite", path: "/Users/me/My Docs/books.db" });
    expect(parsed("file:///Users/me/f.db").path).toBe("/Users/me/f.db");
  });

  test("strict: anything doubtful is refused in plain words", () => {
    expect(failure("")).toContain("Paste");
    expect(failure("   ")).toContain("Paste");
    expect(failure(42)).toContain("Paste");
    expect(failure("ftp://h/x")).toContain("isn't a kind of database address");
    expect(failure("postgres://h:70000/x")).toContain("port");
    expect(failure("postgres://h:12ab/x")).toContain("port");
    expect(failure("postgres://u:%ZZ@h/x")).toContain("%");
    expect(failure("mysql://h/a/b")).toContain("slash");
    expect(failure("redis://h/16")).toContain("0 to 15");
    expect(failure("redis://h/x")).toContain("0 to 15");
    expect(failure("mysql://ho st/x")).toContain("spaces");
    expect(failure("mysql://h_o$t/x")).toContain("host name");
    expect(failure("mysql://h/x\u0000y")).toContain("control");
    expect(failure("mysql:h/x")).toContain("//");
    expect(failure("sqlite:data.db")).toContain("full path");
    expect(failure("sqlite://remote.example/x.db")).toContain("this computer");
    expect(failure("mysql://h/" + "x".repeat(3000))).toContain("too long");
    expect(failure("mysql://" + "u".repeat(200) + "@h/x")).toContain("too long");
  });

  test("notes and errors never contain the password", () => {
    const r = parsed(`postgres://u:${MARK}@h/db?application_name=${MARK}&sslmode=prefer`);
    expect(JSON.stringify({ ...r, password: undefined })).not.toContain(MARK);
    expect(r.password).toBe(MARK);
    expect(failure(`mysql://u:${MARK}@h:99999/x`)).not.toContain(MARK);
    expect(maskUrl(`postgres://u:${MARK}@h/db`)).toBe("postgres://u:••••@h/db");
    expect(maskUrl("mysql://h/db?password=abc&x=1")).toBe("mysql://h/db?password=••••&x=1");
  });

  test("fuzz: nothing throws, and a password never lands in another field", () => {
    let seed = 987654321;
    const rnd = (n: number) => (seed = (seed * 1664525 + 1013904223) >>> 0) % n;
    const pieces = ["mysql://", "postgres://", "redis://", "sqlite:", "://", "@", ":", "/", "?", "#", "&", "=", "%", "%2", "%40", "[", "]", "::1", "host", "user", "pa ss", "\u0000", "é", "999999", "db", "sslmode=require", "db=3", "x".repeat(300), "..", "\\", "\n"];
    for (let i = 0; i < 4000; i++) {
      let text = "";
      for (let j = 0, n = 1 + rnd(9); j < n; j++) text += pieces[rnd(pieces.length)];
      let r;
      expect(() => (r = parseConnectionUrl(text)), JSON.stringify(text)).not.toThrow();
      const result = r as unknown as ReturnType<typeof parseConnectionUrl>;
      if (result.ok && result.value.password && result.value.password.length >= 4) {
        const { password, ...rest } = result.value;
        expect(JSON.stringify(rest), JSON.stringify(text)).not.toContain(password);
      }
    }
    for (let i = 0; i < 500; i++) {
      const bytes = Array.from({ length: rnd(60) }, () => String.fromCharCode(rnd(0x250)));
      expect(() => parseConnectionUrl(bytes.join(""))).not.toThrow();
    }
  });

  test("an address's engine, and the fingerprint of where a connection goes", () => {
    expect(engineOfScheme("MariaDB://x")).toBe("mysql");
    expect(engineOfScheme("postgresql://x")).toBe("postgres");
    expect(engineOfScheme("rediss://x")).toBe("redis");
    expect(engineOfScheme("nonsense")).toBeNull();
    const a = connectionFingerprint("mysql", { host: "DB.example.com", user: "app", database: "shop" });
    expect(a).toBe(connectionFingerprint("mysql", { host: "db.example.com", port: 3306, user: "app", database: "shop" }));
    expect(a).not.toBe(connectionFingerprint("mysql", { host: "db.example.com", user: "app", database: "other" }));
    expect(a).not.toBe(connectionFingerprint("postgres", { host: "db.example.com", user: "app", database: "shop" }));
    expect(connectionFingerprint("redis", { host: "c", dbIndex: 0 })).toBe(connectionFingerprint("redis", { host: "c", port: 6379 }));
  });

  test("the variables removed from a studio's environment cover every engine's names", () => {
    for (const name of ["MSQL_HOST", "MYSQL_PWD", "MARIADB_PASSWORD", "DB_PASSWORD", "DATABASE_URL", "PGPASSWORD", "PG_URL", "POSTGRES_DB", "REDIS_URL", "REDIS_ANYTHING", "VALKEY_URL", "REDISCLI_AUTH", "SQLITE_STUDIO_DB", "SQLITE_ANYTHING", "PORT", "PG_STUDIO_PORT", "STUDIO_WORKER", "FM_TOKEN", "FILE_MANAGER_SESSION"]) expect(isScrubbedVariable(name), name).toBe(true);
    for (const name of ["PATH", "HOME", "NODE_ENV", "LANG", "BUN_BE_BUN", "WEBVIEW_PATH", "TERM"]) expect(isScrubbedVariable(name), name).toBe(false);
  });
});

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]));
}
const diskHolds = (c: DbComputer, text: string) => filesUnder(c.dir).filter((f) => readFileSync(f).includes(text));

describe("saved connections", () => {
  test("every engine can be saved; the password goes to the keychain and nowhere else", async () => {
    const c = computer();
    const made = [];
    for (const profile of [
      { engine: "mysql", name: "Shop DB", host: "db.example.com", port: 3307, user: "app", database: "shop", environment: "staging", tags: ["work"], folder: "Clients", tls: true },
      { engine: "postgres", name: "Reports", host: "pg.local", user: "me", database: "rep", schema: "audit", tls: { verify: false } },
      { engine: "redis", name: "Cache", host: "127.0.0.1", port: 6380, user: "acl", dbIndex: 3, keyPrefix: "app:", tls: false },
    ]) {
      const r = await c.ok("db/profile/save", { profile, password: MARK });
      expect(r.profile.hasPassword).toBe(true);
      expect(r.text ?? JSON.stringify(r)).not.toContain(MARK);
      made.push(r.profile);
    }
    const sqlite = join(c.dir, "books.sqlite");
    { const db = new Database(sqlite); db.run("create table t(x)"); db.close(); }
    const lite = (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "Books", path: sqlite, sqliteMode: "readonly" } })).profile;
    expect(lite.readOnly).toBe(true);

    const overview = await c.api("db/overview");
    expect(overview.text).not.toContain(MARK);
    expect(overview.json.profiles.map((p: any) => p.name).sort()).toEqual(["Books", "Cache", "Reports", "Shop DB"]);
    expect(overview.json.profiles.every((p: any) => !("password" in p))).toBe(true);
    // the keychain holds the three passwords, keyed by profile id
    expect([...c.keychain.map.values()]).toEqual([MARK, MARK, MARK]);
    expect(new Set(c.keychain.map.keys())).toEqual(new Set(made.map((p) => p.id)));
    // and no file on this computer does
    expect(diskHolds(c, MARK)).toEqual([]);
    if (process.platform !== "win32") {
      for (const f of filesUnder(c.dataDir).filter((x) => /connections|file_manager_databases/.test(x))) expect(statSync(f).mode & 0o077, f).toBe(0);
    }
  });

  test("the shared connection file is the one the Database Workbench reads; Redis is kept beside it", async () => {
    const c = computer();
    await c.ok("db/profile/save", { profile: { engine: "mysql", name: "A", host: "h" }, password: MARK });
    await c.ok("db/profile/save", { profile: { engine: "redis", name: "R", host: "h" }, password: MARK });
    const workbench = await new ProfileStore(c.dataDir, c.keychain).list();
    expect(workbench.map((p) => p.name)).toEqual(["A"]);
    expect(JSON.parse(readFileSync(join(c.dataDir, "connections_redis.json"), "utf8")).profiles.map((p: any) => p.name)).toEqual(["R"]);
  });

  test("editing keeps the password unless a new one is typed; removing and deleting clear the keychain", async () => {
    const c = computer();
    const p = (await c.ok("db/profile/save", { profile: { engine: "postgres", name: "One", host: "h" }, password: MARK })).profile;
    const edited = (await c.ok("db/profile/save", { id: p.id, profile: { engine: "postgres", name: "Renamed", host: "h2", database: "d" } })).profile;
    expect(edited).toMatchObject({ id: p.id, name: "Renamed", host: "h2", hasPassword: true });
    expect(c.keychain.map.get(p.id)).toBe(MARK);
    await c.ok("db/profile/save", { id: p.id, profile: { engine: "postgres", name: "Renamed", host: "h2" }, password: "new-secret-1" });
    expect(c.keychain.map.get(p.id)).toBe("new-secret-1");
    expect((await c.api("db/password/clear", { id: p.id })).status).toBe(409);
    await c.ok("db/password/clear", { id: p.id, confirm: true });
    expect(c.keychain.map.has(p.id)).toBe(false);
    expect((await c.ok("db/overview")).profiles[0].hasPassword).toBe(false);
    await c.ok("db/profile/save", { id: p.id, profile: { engine: "postgres", name: "Renamed", host: "h2" }, password: MARK });
    expect((await c.api("db/profile/delete", { id: p.id })).status).toBe(409);
    await c.ok("db/profile/delete", { id: p.id, confirm: true });
    expect(c.keychain.map.size).toBe(0);
    expect((await c.ok("db/overview")).profiles).toEqual([]);
  });

  test("copying copies the password only when asked to", async () => {
    const c = computer();
    for (const engine of ["mysql", "redis"]) {
      const p = (await c.ok("db/profile/save", { profile: { engine, name: engine, host: "h" }, password: MARK })).profile;
      const without = (await c.ok("db/profile/duplicate", { id: p.id })).profile;
      expect(without.hasPassword).toBe(false);
      expect(without.name).toBe(`${engine} (copy)`);
      const also = (await c.ok("db/profile/duplicate", { id: p.id, copyPassword: true })).profile;
      expect(also.hasPassword).toBe(true);
      expect(c.keychain.map.get(also.id)).toBe(MARK);
      expect(c.keychain.map.has(without.id)).toBe(false);
    }
  });

  test("the keychain being unavailable is reported (the password then lasts only this session)", async () => {
    const c = computer({ keychain: new FakeKeychain("memory") });
    const o = await c.ok("db/overview");
    expect(o.secretStore).toEqual({ kind: "memory", persistent: false });
    const ok = computer();
    expect((await ok.ok("db/overview")).secretStore).toEqual({ kind: "os-keychain", persistent: true });
  });

  test("everything a person types is checked", async () => {
    const c = computer();
    const bad = async (profile: Record<string, unknown>, text: RegExp) => {
      const r = await c.api("db/profile/save", { profile });
      expect(r.status, JSON.stringify(profile)).toBe(400);
      expect(r.json.error.message).toMatch(text);
    };
    await bad({ engine: "mysql", name: "x", host: "bad host!" }, /host/);
    await bad({ engine: "mysql", name: "x", host: "h", port: 70000 }, /port/);
    await bad({ engine: "mysql", name: "", host: "h" }, /name/);
    await bad({ engine: "oracle", name: "x" }, /kind of database/);
    await bad({ engine: "redis", name: "x", host: "h", dbIndex: 16 }, /0 to 15/);
    await bad({ engine: "redis", name: "x", host: "h", port: 0 }, /port/);
    await bad({ engine: "redis", name: "x", host: "h;rm -rf" }, /host/);
    await bad({ engine: "postgres", name: "x", host: "h", environment: "prod" }, /environment/);
    await bad({ engine: "mysql", name: "x", host: "h", connectTimeoutMs: 5 }, /connectTimeoutMs/);
    await bad({ engine: "sqlite", name: "x", path: "relative/file.db" }, /full path/);
    const p = (await c.ok("db/profile/save", { profile: { engine: "mysql", name: "x", host: "h" } })).profile;
    const r = await c.api("db/profile/save", { id: p.id, profile: { engine: "postgres", name: "x", host: "h" } });
    expect(r.status).toBe(400);
    expect((await c.api("db/profile/save", { profile: { engine: "sqlite", name: "x", path: "/x.db" }, password: "p" })).status).toBe(400);
    const gone = await c.api("db/profile/delete", { id: "nope", confirm: true });
    expect(gone.json.error.code).toBe("NOT_FOUND");
  });

  test("SQLite paths: a real database, or a place a new one may be made, and nothing else", async () => {
    const c = computer();
    const dir = join(c.dir, "dbs");
    mkdirSync(dir);
    const real = join(dir, "real.sqlite");
    { const db = new Database(real); db.run("create table t(x)"); db.close(); }
    const notDb = join(dir, "notes.db");
    writeFileSync(notDb, "this is just text, not a database");
    const empty = join(dir, "empty.db");
    writeFileSync(empty, "");
    const save = (profile: Record<string, unknown>) => c.api("db/profile/save", { profile: { engine: "sqlite", name: "s", ...profile } });
    expect((await save({ path: real })).status).toBe(200);
    expect((await save({ path: empty, sqliteMode: "create" })).status).toBe(200);
    const text = await save({ path: notDb });
    expect(text.status).toBe(400);
    expect(text.json.error.code).toBe("NOT_SQLITE");
    expect((await save({ path: join(dir, "missing.db") })).json.error.code).toBe("NOT_FOUND");
    expect((await save({ path: join(dir, "new.db"), sqliteMode: "create" })).status).toBe(200);
    expect((await save({ path: join(dir, "nofolder", "new.db"), sqliteMode: "create" })).json.error.code).toBe("NOT_FOUND");
    expect((await save({ path: dir })).json.error.code).toBe("NOT_A_FILE");
    expect((await save({ path: "x\u0000y" })).status).toBe(400);
    const mem = await save({ sqliteMode: "memory" });
    expect(mem.json.profile).toMatchObject({ path: ":memory:", sqliteMode: "memory" });
    // a read-only file may be opened read-only
    const locked = join(dir, "locked.sqlite");
    { const db = new Database(locked); db.run("create table t(x)"); db.close(); }
    chmodSync(locked, 0o444);
    expect((await save({ path: locked, sqliteMode: "readonly" })).status).toBe(200);
  });

  test("an address from the page: the password is held by the server and used once saved", async () => {
    const c = computer();
    const r = await c.ok("db/url/parse", { text: `postgres://bob:${MARK}@h.example:5433/app?sslmode=require` });
    expect(r.hasPassword).toBe(true);
    expect(JSON.stringify(r)).not.toContain(MARK);
    expect(r.fields).toMatchObject({ engine: "postgres", host: "h.example", port: 5433, user: "bob", database: "app", tls: true });
    const saved = (await c.ok("db/profile/save", { profile: { engine: "postgres", name: "From URL", host: "h.example", port: 5433, user: "bob", database: "app" }, passwordToken: r.passwordToken, source: "url" })).profile;
    expect(c.keychain.map.get(saved.id)).toBe(MARK);
    expect(saved.meta.source).toBe("url");
    expect(diskHolds(c, MARK)).toEqual([]);
    const wrongEngine = await c.api("db/profile/save", { profile: { engine: "mysql", name: "x", host: "h" }, passwordToken: r.passwordToken });
    expect(wrongEngine.status).toBe(400);
    expect((await c.api("db/profile/save", { profile: { engine: "mysql", name: "x", host: "h" }, passwordToken: "made-up" })).status).toBe(400);
    expect((await c.api("db/url/parse", { text: "nonsense" })).json.error.code).toBe("BAD_ADDRESS");
  });
});

describe("safety of the operations", () => {
  test("every database operation needs the session token, and answers errors as plain JSON", async () => {
    const c = computer();
    const ops = API_OPERATIONS.filter((o) => o.startsWith("db/"));
    expect(ops.length).toBeGreaterThan(25);
    for (const op of ops) {
      const res = await fetch(`${c.base}/api/${op}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      expect(res.status, op).toBe(401);
      const wrong = await fetch(`${c.base}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", "x-fm-token": "nope" }, body: "{}" });
      expect(wrong.status, op).toBe(401);
      const foreign = await fetch(`${c.base}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", "x-fm-token": "db-token", origin: "http://evil.example" }, body: "{}" });
      expect(foreign.status, op).toBe(403);
    }
    // bad bodies never crash the server
    for (const op of ops) {
      for (const body of [{}, { id: 5 }, { engine: "x" }, { path: 7 }, { profile: "no" }, { key: "../../etc" }, { paths: "x" }]) {
        const r = await c.api(op, body as Record<string, unknown>);
        expect([200, 400, 404, 409, 413]).toContain(r.status);
        expect(r.text, `${op} ${JSON.stringify(body)}`).not.toContain("at /");
      }
    }
  });

  test("Test connection never echoes the password, says what is wrong in plain words, and calls a production test only a test", async () => {
    const c = computer();
    // a port nothing listens on
    const port = await new Promise<number>((resolve) => {
      const s = createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => resolve(p));
      });
    });
    for (const engine of ["mysql", "postgres", "redis"]) {
      const saved = (await c.ok("db/profile/save", { profile: { engine, name: engine, host: "127.0.0.1", port, user: "u", database: "d" }, password: MARK })).profile;
      const r = await c.ok("db/test", { id: saved.id });
      expect(r.result.ok, engine).toBe(false);
      expect(r.result.message, engine).toContain(`127.0.0.1:${port}`);
      expect(r.result.message).toContain("Is the server running");
      expect(JSON.stringify(r)).not.toContain(MARK);
    }
    // an unsaved draft, with the password typed in the editor
    const draft = await c.ok("db/test", { profile: { engine: "mysql", name: "d", host: "127.0.0.1", port, environment: "production" }, password: MARK });
    expect(JSON.stringify(draft)).not.toContain(MARK);
    expect(draft.result.ok).toBe(false);
  });

  test("Test connection on SQLite opens the real file read-only and reports what is in it", async () => {
    const c = computer();
    const file = join(c.dir, "t.sqlite");
    const db = new Database(file);
    db.run("create table a(x); create table b(y); create view v as select * from a");
    db.close();
    const saved = (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "t", path: file, environment: "production" } })).profile;
    const r = (await c.ok("db/test", { id: saved.id })).result;
    expect(r).toMatchObject({ ok: true });
    expect(r.message).toContain("only a test");
    expect(r.facts.join(" ")).toContain("3 tables and views");
    // the file is gone: a plain message
    new Database(join(c.dir, "gone.db"), { create: true }).close();
    const gone = (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "g", path: join(c.dir, "gone.db") } })).profile;
    (await import("fs")).rmSync(join(c.dir, "gone.db"));
    expect((await c.ok("db/test", { id: gone.id })).result).toMatchObject({ ok: false, code: "NOT_FOUND", message: "That database file doesn't exist." });
  });

  test("the ops answer for a missing profile with 404 and never leak a stack trace", async () => {
    const c = computer();
    for (const op of ["db/test", "db/effective", "db/profile/duplicate", "db/profile/favorite", "db/studio/start"]) {
      const r = await c.api(op, { id: "nope", profileId: "nope" });
      expect([400, 404]).toContain(r.status);
      expect(r.text).not.toContain("node_modules");
    }
  });
});

// Real servers: only when TEST_MYSQL_URL / TEST_PG_URL / TEST_REDIS_URL point at throwaway ones (see docs/testing/database-tests.md).
for (const [engine, envName] of [["mysql", "TEST_MYSQL_URL"], ["postgres", "TEST_PG_URL"], ["redis", "TEST_REDIS_URL"]] as const) {
  const url = process.env[envName];
  (url ? describe : describe.skip)(`against a real ${engine} server (${envName})`, () => {
    test("Test connection works with the saved password, and a wrong password is explained", async () => {
      const c = computer();
      const u = parsed(url!);
      const profile = { engine, name: "real", host: u.host, port: u.port, user: u.user, database: u.database, ...(u.dbIndex !== undefined ? { dbIndex: u.dbIndex } : {}) };
      const saved = (await c.ok("db/profile/save", { profile, password: u.password ?? "" })).profile;
      const good = (await c.ok("db/test", { id: saved.id })).result;
      expect(good.ok, JSON.stringify(good)).toBe(true);
      expect(good.version).toBeTruthy();
      const wrong = (await c.ok("db/test", { profile, password: "definitely-wrong-password" })).result;
      expect(JSON.stringify(wrong)).not.toContain("definitely-wrong-password");
      // A throwaway server started without a password accepts any (Redis then ignores the password it was given).
      if (u.password) {
        expect(wrong.ok).toBe(false);
        expect(wrong.code).toBe("AUTH_FAILED");
      }
    });
  });
}
