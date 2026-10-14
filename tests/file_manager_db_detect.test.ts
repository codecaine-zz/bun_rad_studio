import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";
import { dbComputer, type DbComputer } from "./helpers/db_fm";

const PW = "s3cr3t-MARKER-4242";
const PW2 = "another-MARKER-9999";
const computers: DbComputer[] = [];
const computer = (o: Parameters<typeof dbComputer>[0] = {}) => {
  const c = dbComputer(o);
  computers.push(c);
  return c;
};
afterAll(() => computers.forEach((c) => c.remove()));

const cards = async (c: DbComputer, body: Record<string, unknown> = { manual: true }) => (await c.ok("db/detect", body)).cards as any[];
const byEngine = (list: any[], engine: string) => list.filter((x) => x.engine === engine);
const filesUnder = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]));
const diskHolds = (c: DbComputer, text: string) => filesUnder(c.dir).filter((f) => readFileSync(f).includes(text));

describe("finding connections in the environment", () => {
  test("MySQL: the studio's own variables, with where each came from and the password hidden", async () => {
    const c = computer({ env: { MSQL_HOST: "db.example.com", MSQL_PORT: "3307", MSQL_USER: "app", MSQL_PASSWORD: PW, MSQL_NAME: "shop", MSQL_TLS: "true" } });
    const res = await c.api("db/detect", { manual: true });
    expect(res.text).not.toContain(PW);
    const [card] = byEngine(res.json.cards, "mysql");
    expect(res.json.cards).toHaveLength(1);
    expect(card.fields.host).toMatchObject({ value: "db.example.com", name: "MSQL_HOST", source: "environment variable MSQL_HOST" });
    expect(card.fields.port.value).toBe(3307);
    expect(card.fields.user.value).toBe("app");
    expect(card.fields.database.value).toBe("shop");
    expect(card.fields.tls.value).toBe(true);
    expect(card.password).toEqual({ present: true, name: "MSQL_PASSWORD", source: "environment variable MSQL_PASSWORD" });
    expect(card.variables).toEqual(["MSQL_HOST", "MSQL_NAME", "MSQL_PASSWORD", "MSQL_PORT", "MSQL_TLS", "MSQL_USER"]);
    expect(card.status).toBe("new");
  });

  test("PostgreSQL, Redis and SQLite: each engine's names (also the libpq and MariaDB ones)", async () => {
    const sqlite = join(computer().dir, "x.sqlite");
    new Database(sqlite).run("create table t(x)");
    const c = computer({
      env: { PGHOST: "pg.example", PGPORT: "5433", PGUSER: "me", PGDATABASE: "rep", PGPASSWORD: PW, PG_SCHEMA: "audit", REDIS_HOST: "cache", REDIS_PORT: "6380", REDIS_PASSWORD: PW2, REDIS_DB: "2", SQLITE_PATH: sqlite, MARIADB_HOST: "maria", MARIADB_USER: "mu", MARIADB_DATABASE: "md" },
    });
    const list = await cards(c);
    expect(JSON.stringify(list)).not.toContain(PW);
    expect(JSON.stringify(list)).not.toContain(PW2);
    expect(byEngine(list, "postgres")[0].fields).toMatchObject({ host: { value: "pg.example", name: "PGHOST" }, port: { value: 5433 }, user: { value: "me" }, database: { value: "rep" }, schema: { value: "audit" } });
    expect(byEngine(list, "redis")[0].fields).toMatchObject({ host: { value: "cache" }, port: { value: 6380 }, dbIndex: { value: 2 } });
    expect(byEngine(list, "redis")[0].password.present).toBe(true);
    expect(byEngine(list, "sqlite")[0]).toMatchObject({ fileExists: true, fields: { path: { value: sqlite, name: "SQLITE_PATH" } } });
    expect(byEngine(list, "mysql")[0].fields).toMatchObject({ host: { value: "maria", name: "MARIADB_HOST" }, user: { value: "mu" }, database: { value: "md" } });
  });

  test("DATABASE_URL is given to the engine its scheme names, and the studio's rule 'the address wins' is followed", async () => {
    for (const [url, engine, host] of [["mysql://u:p@mysql.example:3308/shop", "mysql", "mysql.example"], ["mariadb://u@maria.example/x", "mysql", "maria.example"], ["postgres://u:p@pg.example/x", "postgres", "pg.example"], ["postgresql://u@pg2.example/x", "postgres", "pg2.example"], ["rediss://:p@redis.example:6380/1", "redis", "redis.example"]] as const) {
      const c = computer({ env: { DATABASE_URL: url } });
      const list = await cards(c);
      expect(list.map((x) => x.engine), url).toEqual([engine]);
      expect(list[0].fields.host).toMatchObject({ value: host, name: "DATABASE_URL" });
    }
    const lite = join(computer().dir, "u.sqlite");
    new Database(lite).run("create table t(x)");
    const l = await cards(computer({ env: { DATABASE_URL: `sqlite://${lite}` } }));
    expect(l.map((x) => x.engine)).toEqual(["sqlite"]);
    // conflicting: the address overrides MSQL_HOST, as it does in the studio, and the other variable is listed as not used
    const conflict = await cards(computer({ env: { DATABASE_URL: "mysql://u:p@url-host.example/db", MSQL_HOST: "env-host.example", MSQL_USER: "env-user" } }));
    expect(conflict).toHaveLength(1);
    expect(conflict[0].fields.host).toMatchObject({ value: "url-host.example", name: "DATABASE_URL" });
    expect(conflict[0].fields.user).toMatchObject({ value: "u", name: "DATABASE_URL" });
    expect(conflict[0].ignored).toEqual(["MSQL_HOST", "MSQL_USER"]);
    // a DATABASE_URL for another engine is not used for this one
    const mixed = await cards(computer({ env: { DATABASE_URL: "postgres://u@pg.example/x", MSQL_HOST: "m.example" } }));
    expect(mixed.map((x) => x.engine).sort()).toEqual(["mysql", "postgres"]);
    expect(byEngine(mixed, "mysql")[0].warnings.join(" ")).toContain("PostgreSQL address");
  });

  test("generic DB_* names alone could be MySQL or PostgreSQL: both are offered, marked as a guess", async () => {
    const list = await cards(computer({ env: { DB_HOST: "g.example", DB_USER: "gu", DB_PASSWORD: PW, DB_NAME: "gd" } }));
    expect(list.map((x) => x.engine).sort()).toEqual(["mysql", "postgres"]);
    expect(list.every((x) => x.ambiguous)).toBe(true);
    // with an engine-specific variable present, DB_* belong to that engine only
    const specific = await cards(computer({ env: { DB_HOST: "g.example", PG_USER: "x" } }));
    expect(specific.map((x) => x.engine)).toEqual(["postgres"]);
    expect(specific[0].fields.host.name).toBe("DB_HOST");
  });

  test("conflicting and broken values are explained, never fatal", async () => {
    const list = await cards(computer({ env: { MSQL_HOST: "a.example", MYSQL_HOST: "b.example", MSQL_PORT: "notaport", MYSQL_PORT: "3310", PG_HOST: "bad host!", REDIS_URL: "redis://h/99", SQLITE_STUDIO_DB: "/definitely/not/here.db" } }));
    const my = byEngine(list, "mysql")[0];
    expect(my.fields.host.value).toBe("a.example");
    expect(my.warnings.join(" ")).toContain("MSQL_HOST, MYSQL_HOST disagree");
    expect(my.warnings.join(" ")).toContain("MSQL_PORT isn't a valid port");
    expect(my.fields.port.value).toBe(3310);
    expect(byEngine(list, "postgres")).toHaveLength(0);
    expect(byEngine(list, "redis")).toHaveLength(0);
    expect(byEngine(list, "sqlite")[0]).toMatchObject({ fileExists: false });
    expect(byEngine(list, "sqlite")[0].warnings).toContain("That file doesn't exist (yet).");
  });

  test("nothing in the environment: no cards, no error. Detection never connects to anything", async () => {
    let tests = 0;
    const c = computer({ env: { PATH: "/bin", HOME: "/h", MSQL_HOST: "unreachable.invalid" }, hooks: { testConnection: async () => (tests++, { ok: true, ms: 1, message: "", facts: [] }) } });
    expect((await c.ok("db/detect", { manual: true })).cards).toHaveLength(1);
    expect((await computer({ env: { PATH: "/bin" } }).ok("db/detect", { manual: true })).cards).toEqual([]);
    expect(tests).toBe(0);
  });
});

describe("saving what was found", () => {
  const env = () => ({ MSQL_HOST: "db.example.com", MSQL_USER: "app", MSQL_PASSWORD: PW, MSQL_NAME: "shop", PG_HOST: "pg.example", PG_USER: "me", PG_PASSWORD: PW2, REDIS_URL: `redis://:${PW}@cache.example:6380/2` });

  test("one click saves a normal connection; the password goes to the keychain and nowhere else", async () => {
    const c = computer({ env: env() });
    const list = await cards(c);
    const r = await c.api("db/detect/save", { key: byEngine(list, "mysql")[0].key });
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(PW);
    expect(r.json.profile).toMatchObject({ engine: "mysql", host: "db.example.com", user: "app", database: "shop", folder: "From environment", hasPassword: true, meta: { source: "environment", variables: ["MSQL_HOST", "MSQL_NAME", "MSQL_PASSWORD", "MSQL_USER"] } });
    expect(c.keychain.map.get(r.json.profile.id)).toBe(PW);
    expect(r.json.already).toBe(false);
    expect(r.json.noLongerNeeded.map((n: any) => n.name)).toEqual(["MSQL_HOST", "MSQL_NAME", "MSQL_PASSWORD", "MSQL_USER"]);
    for (const text of [PW, PW2]) expect(diskHolds(c, text)).toEqual([]);
    // the redis one, whose password was inside an address
    const red = await c.ok("db/detect/save", { key: byEngine(list, "redis")[0].key });
    expect(red.profile).toMatchObject({ engine: "redis", host: "cache.example", port: 6380, dbIndex: 2 });
    expect(c.keychain.map.get(red.profile.id)).toBe(PW);
    expect(JSON.stringify(await c.ok("db/overview"))).not.toContain(PW);
  });

  test("saving the same connection twice (or from two places) leaves one profile", async () => {
    const c = computer({ env: env() });
    const key = byEngine(await cards(c), "mysql")[0].key;
    const a = await c.ok("db/detect/save", { key });
    const b = await c.ok("db/detect/save", { key });
    expect(b.already).toBe(true);
    expect(b.profile.id).toBe(a.profile.id);
    expect((await c.ok("db/overview")).profiles.filter((p: any) => p.engine === "mysql")).toHaveLength(1);
    // the same connection made by hand also counts as saved
    const hand = computer({ env: env() });
    await hand.ok("db/profile/save", { profile: { engine: "mysql", name: "mine", host: "DB.example.com", user: "app", database: "shop" } });
    const list = await cards(hand);
    expect(byEngine(list, "mysql")[0]).toMatchObject({ status: "saved", profileName: "mine" });
    const again = await hand.ok("db/detect/save", { key: byEngine(list, "mysql")[0].key });
    expect(again.already).toBe(true);
    expect((await hand.ok("db/overview")).profiles.filter((p: any) => p.engine === "mysql")).toHaveLength(1);
  });

  test("the banner list hides what is saved; asking for everything lists it as saved", async () => {
    const c = computer({ env: env() });
    const first = (await c.ok("db/detect", {})).cards;
    expect(first.map((x: any) => x.engine).sort()).toEqual(["mysql", "postgres", "redis"]);
    await c.ok("db/detect/save", { key: first[0].key });
    const second = (await c.ok("db/detect", {})).cards;
    expect(second).toHaveLength(2);
    const all = (await c.ok("db/detect", { manual: true })).cards;
    expect(all.find((x: any) => x.key === first[0].key).status).toBe("saved");
  });

  test("'Never for this one' is remembered across restarts; 'Not now' lasts until the File Manager is opened again", async () => {
    const c = computer({ env: env() });
    const list = await cards(c);
    const [mysql, pg] = [byEngine(list, "mysql")[0], byEngine(list, "postgres")[0]];
    await c.ok("db/detect/dismiss", { key: mysql.key, forever: true });
    await c.ok("db/detect/dismiss", { key: pg.key });
    const now = (await c.ok("db/detect", {})).cards.map((x: any) => x.engine);
    expect(now).toEqual(["redis"]);
    c.stop();
    const restarted = computer({ env: env(), dir: c.dir });
    const after = (await restarted.ok("db/detect", {})).cards.map((x: any) => x.engine).sort();
    expect(after).toEqual(["postgres", "redis"]);
    expect((await restarted.ok("db/detect", {})).dismissed).toBe(1);
    await restarted.ok("db/detect/restore");
    expect((await restarted.ok("db/detect", {})).cards).toHaveLength(3);
    expect(JSON.parse(readFileSync(join(c.dataDir, "file_manager_databases.json"), "utf8")).dismissed).toEqual([]);
  });

  test("automatic saving is off unless turned on, and then needs no click", async () => {
    const c = computer({ env: env() });
    expect((await c.ok("db/overview")).settings.detect).toEqual({ auto: true, autoSave: false });
    const quiet = await c.ok("db/detect", { quiet: true });
    expect(quiet.autoSaved).toEqual([]);
    expect(quiet.announce).toBe(true);
    expect((await c.ok("db/overview")).profiles).toEqual([]);
    expect((await c.ok("db/detect", { quiet: true })).announce).toBe(false);
    await c.ok("db/detect/settings", { autoSave: true });
    const auto = await c.ok("db/detect", { quiet: true });
    expect(auto.autoSaved.map((x: any) => x.engine).sort()).toEqual(["mysql", "postgres", "redis"]);
    expect(auto.cards.filter((x: any) => x.status === "new")).toEqual([]);
    expect((await c.ok("db/overview")).profiles).toHaveLength(3);
    expect([...c.keychain.map.values()].sort()).toEqual([PW, PW, PW2].sort());
    expect((await c.ok("db/detect", { quiet: true })).autoSaved).toEqual([]);
    expect((await c.ok("db/overview")).profiles).toHaveLength(3);
    // the setting survives a restart, and "detect automatically" off means nothing is looked at unless asked
    c.stop();
    const again = computer({ env: env(), dir: c.dir });
    expect((await again.ok("db/overview")).settings.detect.autoSave).toBe(true);
    await again.ok("db/detect/settings", { auto: false, autoSave: false });
    expect(await again.ok("db/detect", { quiet: true })).toMatchObject({ enabled: false, cards: [] });
    expect((await again.ok("db/detect", { manual: true })).cards).toHaveLength(3);
  });

  test("the environment changing later is noticed: a field-by-field notice, secrets compared but never shown", async () => {
    const live: Record<string, string> = { MSQL_HOST: "db.example.com", MSQL_USER: "app", MSQL_PASSWORD: PW, MSQL_NAME: "shop" };
    const c = computer({ env: live });
    const first = byEngine(await cards(c), "mysql")[0];
    const saved = (await c.ok("db/detect/save", { key: first.key })).profile;
    // unchanged: nothing to say
    expect((await c.ok("db/detect", {})).cards).toEqual([]);
    // only the password changed
    live.MSQL_PASSWORD = PW2;
    let notice = await c.api("db/detect", {});
    expect(notice.text).not.toContain(PW);
    expect(notice.text).not.toContain(PW2);
    expect(notice.json.cards[0]).toMatchObject({ status: "changed", profileId: saved.id, passwordChanged: true, diff: [] });
    // host and user changed too
    live.MSQL_HOST = "new-db.example.com";
    live.MSQL_USER = "app2";
    notice = await c.api("db/detect", {});
    expect(notice.json.cards[0].diff).toEqual([{ field: "host", saved: "db.example.com", now: "new-db.example.com" }, { field: "user", saved: "app", now: "app2" }]);
    expect(notice.json.cards[0].key).not.toBe(first.key);
    // updating applies the new values to the same profile and the keychain
    const upd = await c.ok("db/detect/update", { id: saved.id });
    expect(upd.profile).toMatchObject({ id: saved.id, host: "new-db.example.com", user: "app2" });
    expect(c.keychain.map.get(saved.id)).toBe(PW2);
    expect((await c.ok("db/detect", {})).cards).toEqual([]);
    expect((await c.ok("db/overview")).profiles).toHaveLength(1);
    expect(diskHolds(c, PW2)).toEqual([]);
  });

  test("an environment variable that is gone changes nothing: the saved connection stays", async () => {
    const live: Record<string, string> = { MSQL_HOST: "db.example.com", MSQL_NAME: "shop" };
    const c = computer({ env: live });
    await c.ok("db/detect/save", { key: (await cards(c))[0].key });
    delete live.MSQL_HOST;
    delete live.MSQL_NAME;
    expect((await c.ok("db/detect", { manual: true })).cards).toEqual([]);
    const id = (await c.ok("db/overview")).profiles[0].id;
    expect((await c.api("db/detect/update", { id })).status).toBe(400);
    expect((await c.ok("db/overview")).profiles).toHaveLength(1);
  });

  test("nothing sensitive reaches a response or the console during all of this", async () => {
    const logs = [spyOn(console, "log"), spyOn(console, "info"), spyOn(console, "warn"), spyOn(console, "error"), spyOn(console, "debug")];
    try {
      const c = computer({ env: env() });
      const seen: string[] = [];
      for (const [op, body] of [["db/detect", { manual: true }], ["db/overview", {}], ["db/effective", { engine: "mysql" }], ["db/detect/settings", { autoSave: true }], ["db/detect", { quiet: true }], ["db/overview", {}]] as const) seen.push((await c.api(op, body as Record<string, unknown>)).text);
      const id = (await c.ok("db/overview")).profiles[0].id;
      seen.push((await c.api("db/effective", { id })).text, (await c.api("db/studio/list")).text);
      for (const text of seen) for (const secret of [PW, PW2]) expect(text).not.toContain(secret);
      for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/MARKER/);
    } finally {
      logs.forEach((s) => s.mockRestore());
    }
  });
});

describe("`.env` files in the application's folders", () => {
  function app() {
    const c = computer();
    const start = join(c.dir, "start");
    const install = join(c.dir, "install");
    mkdirSync(start, { recursive: true });
    mkdirSync(install, { recursive: true });
    return { c, start, install };
  }

  test("values Bun loaded are attributed to their file, values it did not load are marked, a real variable overrides a file", async () => {
    const { start, install } = app();
    writeFileSync(join(start, ".env"), `MSQL_HOST=start-host\nMSQL_USER=file-user\nMSQL_PASSWORD=${PW}\nMSQL_NAME=file-db\n`);
    writeFileSync(join(start, ".env.local"), "MSQL_NAME=local-db\n");
    writeFileSync(join(install, ".env"), "PG_HOST=install-host\nPG_USER=pg-user\n");
    // Bun loaded the start folder's files into the environment (but MSQL_USER was overridden by a real variable)
    const live = { MSQL_HOST: "start-host", MSQL_USER: "real-user", MSQL_PASSWORD: PW, MSQL_NAME: "local-db" };
    const c = computer({ env: live, cwd: start, roots: [install] });
    const res = await c.api("db/detect", { manual: true });
    expect(res.text).not.toContain(PW);
    const my = byEngine(res.json.cards, "mysql")[0];
    expect(my.fields.host.source).toMatch(/^`\.env` in the start folder \(.*start\), variable MSQL_HOST$/);
    expect(my.fields.database.source).toContain("`.env.local` in the start folder");
    expect(my.fields.database.loaded).toBe(true);
    expect(my.fields.user.source).toBe("environment variable MSQL_USER (overrides .env)");
    expect(my.password.source).toContain("`.env` in the start folder");
    expect(my.files.map((f: any) => [f.file, f.where, f.loaded])).toEqual([[".env", "start", true], [".env.local", "start", true]]);
    // the install folder's file was not loaded by Bun, yet it is found and can be saved
    const pg = byEngine(res.json.cards, "postgres")[0];
    expect(pg.fields.host).toMatchObject({ value: "install-host", loaded: false });
    expect(pg.fields.host.source).toContain("in the install folder");
    expect(pg.fields.host.source).toContain("found in the file but not loaded into the environment");
    const saved = await c.ok("db/detect/save", { key: pg.key });
    expect(saved.profile).toMatchObject({ host: "install-host", user: "pg-user", meta: { source: "dotenv" } });
    expect(saved.noLongerNeeded.map((n: any) => n.name)).toEqual(["PG_HOST", "PG_USER"]);
    expect(saved.noLongerNeeded[0].origin).toContain("`.env` in the install folder");
    // the file itself is never touched
    expect(readFileSync(join(install, ".env"), "utf8")).toBe("PG_HOST=install-host\nPG_USER=pg-user\n");
  });

  test("a file Bun was told not to load, or a different start folder, is still found", async () => {
    const { start } = app();
    writeFileSync(join(start, ".env.production"), "REDIS_URL=redis://prod-cache:6379/4\n");
    const c = computer({ env: { NODE_ENV: "production" }, cwd: start });
    const card = (await cards(c))[0];
    expect(card).toMatchObject({ engine: "redis", fields: { host: { value: "prod-cache", loaded: false } } });
    expect(card.fields.host.source).toContain("`.env.production`");
    const dev = computer({ env: {}, cwd: start });
    expect(await cards(dev)).toEqual([]);
  });

  test("other folders are never scanned: only the start and install folders", async () => {
    const { c, start } = app();
    const other = join(c.dir, "elsewhere");
    mkdirSync(other);
    writeFileSync(join(other, ".env"), "MSQL_HOST=other-host\n");
    writeFileSync(join(c.dir, ".env"), "MSQL_HOST=parent-host\n");
    mkdirSync(join(start, "sub"));
    writeFileSync(join(start, "sub", ".env"), "MSQL_HOST=sub-host\n");
    expect(await cards(computer({ cwd: start }))).toEqual([]);
  });

  test("hostile files in those folders: a link to outside, a huge file, a binary file are skipped, and said so", async () => {
    const { c, start } = app();
    const outside = join(c.dir, "outside.env");
    writeFileSync(outside, "MSQL_HOST=stolen.example\n");
    symlinkSync(outside, join(start, ".env"));
    writeFileSync(join(start, ".env.local"), "X=" + "a".repeat(300_000));
    writeFileSync(join(start, ".env.development"), Buffer.from("MSQL_HOST=bin\u0000ary"));
    const comp = computer({ cwd: start });
    const res = await comp.ok("db/detect", { manual: true });
    expect(res.cards).toEqual([]);
    expect(res.files.map((f: any) => [f.file, f.skipped]).sort()).toEqual([[".env", "link"], [".env.development", "binary"], [".env.local", "too-big"]]);
    const eff = await comp.ok("db/effective", { engine: "mysql" });
    expect(eff.files.map((f: any) => f.skipped).sort()).toEqual(["binary", "link", "too-big"]);
  });

  test("references inside values are expanded for display, never executed", async () => {
    const { c, start } = app();
    const marker = join(c.dir, "should-not-exist");
    writeFileSync(join(start, ".env"), `PG_HOST=$(touch ${marker})\nPG_USER=\${PGBASE:-fallback}\nPGBASE=base\nPG_DATABASE="\${PGBASE}-db"\n`);
    const card = (await cards(computer({ cwd: start })))[0];
    expect(card.fields.host).toBeUndefined();
    expect(card.fields.user.value).toBe("fallback");
    expect(card.fields.database.value).toBe("base-db");
    expect(statSyncOrNull(marker)).toBeNull();
  });

  test("on its own, detection reads only those folders", async () => {
    const { c, start } = app();
    const before = readdirSync(c.dir).sort();
    await c.ok("db/detect", { manual: true });
    await c.ok("db/overview");
    expect(readdirSync(c.dir).sort()).toEqual(before);
    expect(start).toBeTruthy();
  });
});

function statSyncOrNull(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

describe("importing a .env file that was chosen", () => {
  test("preview first, nothing written until the button is pressed, the file is never changed", async () => {
    const c = computer({ env: { MSQL_HOST: "must-not-leak.example" } });
    const dir = join(c.dir, "project");
    mkdirSync(dir);
    const file = join(dir, ".env.staging");
    const body = `# database\nexport PG_HOST=pg.staging.example\nPG_USER=deploy\nPG_PASSWORD="${PW}"\nPG_DATABASE=app\nREDIS_URL='redis://:${PW2}@r.staging.example:6379/1'\nUNRELATED=1\nMSQL_PASSWORD=$(rm -rf ~)\n`;
    writeFileSync(file, body);
    const before = statSync(file).mtimeMs;
    const preview = await c.api("db/envfile/preview", { path: file });
    expect(preview.status).toBe(200);
    expect(preview.text).not.toContain(PW);
    expect(preview.text).not.toContain(PW2);
    expect(preview.json.file.name).toBe(".env.staging");
    // MSQL_PASSWORD alone is not a connection, so no MySQL card
    expect(preview.json.cards.map((x: any) => x.engine).sort()).toEqual(["postgres", "redis"]);
    expect(preview.text).not.toContain("rm -rf");
    const pg = byEngine(preview.json.cards, "postgres")[0];
    expect(pg.fields.host).toMatchObject({ value: "pg.staging.example", source: expect.stringContaining("the file you chose") });
    // the program's own environment is not mixed in
    expect(byEngine(preview.json.cards, "mysql")).toEqual([]);
    expect((await c.ok("db/overview")).profiles).toEqual([]);
    const done = await c.ok("db/envfile/import", { path: file, key: pg.key });
    expect(done.profile).toMatchObject({ engine: "postgres", host: "pg.staging.example", user: "deploy", database: "app", meta: { source: "envfile" } });
    expect(c.keychain.map.get(done.profile.id)).toBe(PW);
    expect(JSON.stringify(done)).not.toContain(PW);
    expect(diskHolds(c, PW).filter((f) => f !== file)).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe(body);
    expect(statSync(file).mtimeMs).toBe(before);
    // twice is still one profile
    const twice = await c.ok("db/envfile/import", { path: file, key: pg.key });
    expect(twice.already).toBe(true);
    expect((await c.ok("db/overview")).profiles).toHaveLength(1);
  });

  test("only .env-style names, real files, full paths", async () => {
    const c = computer();
    const dir = join(c.dir, "p");
    mkdirSync(dir);
    writeFileSync(join(dir, "notes.txt"), "PG_HOST=x\n");
    writeFileSync(join(dir, ".env"), "PG_HOST=x\n");
    writeFileSync(join(dir, "prod.env"), "PG_HOST=x\n");
    writeFileSync(join(dir, ".env.big"), "A=" + "b".repeat(300_000));
    writeFileSync(join(dir, ".env.bin"), Buffer.from([0, 1, 2, 3]));
    symlinkSync(join(dir, ".env"), join(dir, ".env.link"));
    mkdirSync(join(dir, ".env.dir"));
    const code = async (path: string) => (await c.api("db/envfile/preview", { path })).json.error?.code ?? "ok";
    expect(await code(join(dir, "notes.txt"))).toBe("BAD_REQUEST");
    expect(await code(join(dir, ".env"))).toBe("ok");
    expect(await code(join(dir, "prod.env"))).toBe("ok");
    expect(await code(join(dir, ".env.big"))).toBe("BAD_FILE");
    expect(await code(join(dir, ".env.bin"))).toBe("BAD_FILE");
    expect(await code(join(dir, ".env.link"))).toBe("BAD_FILE");
    expect(await code(join(dir, ".env.dir"))).toBe("BAD_FILE");
    expect(await code(join(dir, ".env.nothere"))).toBe("NOT_FOUND");
    expect(await code(".env")).toBe("BAD_PATH");
    expect(await code("")).toBe("BAD_PATH");
    expect((await c.api("db/envfile/import", { path: join(dir, ".env"), key: "../../x" })).status).toBe(400);
  });
});
