import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { buildLaunch, resolveConnection } from "../src/features/filemanager/fmDbResolve";
import { buildEnvView } from "../src/features/filemanager/fmDbEnvView";
import { defaultSettings } from "../src/features/filemanager/fmDbStore";
import { DB_ENGINES, isAnyConnectionVariable } from "../src/features/filemanager/fmDbModel";
import { dbComputer, FAKE_STUDIO, type DbComputer } from "./helpers/db_fm";
import { rmDir } from "./helpers/rm";

/**
 * "A connection saved in the File Manager replaces environment variables." Each test starts the stand-in studio
 * (a real child process that reports what it was given) with hostile conflicting variables and `.env` files around.
 */
const PROFILE_PW = "profile-PW-1111";
const ENV_PW = "env-PW-2222";
const computers: DbComputer[] = [];
afterAll(() => computers.forEach((c) => c.remove()));

const sqliteFile = join(mkdtempSync(join(tmpdir(), "fm-db-prec-")), "p.sqlite");
{ const db = new Database(sqliteFile); db.run("create table t(x)"); db.close(); }
afterAll(() => rmDir(join(sqliteFile, "..")));

/** Variables that point every studio somewhere wrong. */
const hostile = (): Record<string, string> => ({
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  MSQL_HOST: "env-mysql-host", MYSQL_HOST: "env-mysql-host-2", DB_HOST: "env-db-host", MSQL_PORT: "3999", MYSQL_PORT: "3998", DB_PORT: "3997",
  MSQL_USER: "env-mysql-user", DB_USER: "env-db-user", MSQL_PASSWORD: ENV_PW, MYSQL_PASSWORD: ENV_PW, DB_PASSWORD: ENV_PW,
  MSQL_NAME: "env-mysql-db", MYSQL_DATABASE: "env-mysql-db-2", DB_NAME: "env-db-name", MSQL_TLS: "true", MYSQL_STUDIO_DB: "env-studio-db",
  MSQL_URL: `mysql://urluser:${ENV_PW}@mysql-url-host:3996/url-db`, DATABASE_URL: `postgres://pgurl:${ENV_PW}@pg-url-host:5996/pg-url-db`,
  PG_HOST: "env-pg-host", PGHOST: "env-libpq-host", PG_PORT: "5999", PG_USER: "env-pg-user", PG_PASSWORD: ENV_PW, PGPASSWORD: ENV_PW, POSTGRES_PASSWORD: ENV_PW,
  PG_DATABASE: "env-pg-db", PG_SCHEMA: "env-schema", PG_TLS: "true", PG_URL: `postgres://pu:${ENV_PW}@pg-url2:5995/db`, POSTGRES_URL: `postgres://x:${ENV_PW}@pg-url3/db`,
  REDIS_URL: `redis://envuser:${ENV_PW}@env-redis:6999/5`, REDIS_DB: "9", REDIS_PASSWORD: ENV_PW, VALKEY_URL: `redis://:${ENV_PW}@valkey/1`, REDISCLI_AUTH: ENV_PW,
  SQLITE_STUDIO_DB: "/env/not-this.db", SQLITE_DB_PATH: "/env/not-this-either.db",
  PORT: "1234", PG_STUDIO_PORT: "4321", STUDIO_WORKER: "other", FM_SESSION_TOKEN: "do-not-pass", FILE_MANAGER_TOKEN: "do-not-pass-2", FM_PRIVATE: "x",
});

function setup(extra: { env?: Record<string, string>; startEnvFile?: string; installEnvFile?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fm-db-prec-c-"));
  const start = join(dir, "start");
  const install = join(dir, "install");
  mkdirSync(start, { recursive: true });
  mkdirSync(install, { recursive: true });
  if (extra.startEnvFile) writeFileSync(join(start, ".env"), extra.startEnvFile);
  if (extra.installEnvFile) writeFileSync(join(install, ".env"), extra.installEnvFile);
  const c = dbComputer({ dir, env: extra.env ?? hostile(), cwd: start, roots: [install], hooks: { pid: process.pid } });
  computers.push(c);
  return { c, start, install };
}

async function run(c: DbComputer, body: Record<string, unknown>) {
  const r = await c.ok("db/studio/start", body);
  expect(r.studio.state).toBe("running");
  const seen = (await (await fetch(`http://127.0.0.1:${r.studio.port}/__env`)).json()) as Record<string, unknown>;
  await c.ok("db/studio/stop", { id: r.studio.id });
  return { studio: r.studio, ...seen } as { studio: any; env: Record<string, string>; argv: string[]; args: string[]; cwd: string; execArgv: string[] };
}

const connectionVars = (env: Record<string, string>) => Object.keys(env).filter(isAnyConnectionVariable).sort();
const neutral = (c: DbComputer) => realpathSync(join(c.dataDir, "db_studios", "files"));

describe("a saved connection replaces the environment (every engine, hostile variables around)", () => {
  test("MySQL: only the profile's values reach the studio, under every name it reads", async () => {
    const { c } = setup({ startEnvFile: "MSQL_HOST=cwd-file-host\nMYSQL_PASSWORD=cwd-file-pw\n", installEnvFile: "MSQL_HOST=install-file-host\n" });
    const id = (await c.ok("db/profile/save", { profile: { engine: "mysql", name: "p", host: "profile-mysql", port: 3307, user: "pu", database: "pdb", tls: true }, password: PROFILE_PW })).profile.id;
    const r = await run(c, { profileId: id });
    expect(r.env).toMatchObject({ MSQL_HOST: "profile-mysql", MYSQL_HOST: "profile-mysql", MSQL_PORT: "3307", MYSQL_PORT: "3307", MSQL_USER: "pu", MYSQL_USER: "pu", MSQL_PASSWORD: PROFILE_PW, MYSQL_PASSWORD: PROFILE_PW, MSQL_NAME: "pdb", MYSQL_DATABASE: "pdb", MYSQL_STUDIO_DB: "pdb", MSQL_TLS: "true", MYSQL_TLS: "true" });
    // nothing else about connections: no address that could override the host, no other engine's variables, no generic names
    expect(connectionVars(r.env)).toEqual(["MSQL_HOST", "MSQL_NAME", "MSQL_PASSWORD", "MSQL_PORT", "MSQL_TLS", "MSQL_USER", "MYSQL_DATABASE", "MYSQL_HOST", "MYSQL_PASSWORD", "MYSQL_PORT", "MYSQL_STUDIO_DB", "MYSQL_TLS", "MYSQL_USER"].sort());
    expect(JSON.stringify(r.env)).not.toContain(ENV_PW);
    expect(JSON.stringify(r.env)).not.toContain("cwd-file");
    expect(r.cwd).toBe(neutral(c));
    expect(r.execArgv).toContain("--no-env-file");
    expect(r.args).toEqual(["--server"]);
  });

  test("PostgreSQL", async () => {
    const { c } = setup({ startEnvFile: "PG_HOST=cwd-file-host\n" });
    const id = (await c.ok("db/profile/save", { profile: { engine: "postgres", name: "p", host: "profile-pg", port: 5433, user: "pu", database: "pdb", schema: "pschema", tls: false }, password: PROFILE_PW })).profile.id;
    const r = await run(c, { profileId: id });
    expect(r.env).toMatchObject({ PG_HOST: "profile-pg", PG_PORT: "5433", PG_USER: "pu", PG_PASSWORD: PROFILE_PW, PG_DATABASE: "pdb", PG_STUDIO_DB: "pdb", PG_SCHEMA: "pschema", PG_TLS: "false", PG_STUDIO_PORT: "0" });
    expect(connectionVars(r.env)).toEqual(["PG_DATABASE", "PG_HOST", "PG_PASSWORD", "PG_PORT", "PG_SCHEMA", "PG_STUDIO_DB", "PG_STUDIO_PORT", "PG_TLS", "PG_USER"]);
    expect(JSON.stringify(r.env)).not.toContain(ENV_PW);
    expect(r.env.PORT).toBeUndefined();
    expect(r.cwd).toBe(neutral(c));
  });

  test("Redis: one address built from the profile, with the credentials percent-encoded", async () => {
    const { c } = setup();
    const id = (await c.ok("db/profile/save", { profile: { engine: "redis", name: "p", host: "profile-redis", port: 6380, user: "acl user", dbIndex: 3, tls: true }, password: "p@ss:/w" })).profile.id;
    const r = await run(c, { profileId: id });
    expect(r.env.REDIS_URL).toBe("rediss://acl%20user:p%40ss%3A%2Fw@profile-redis:6380");
    expect(r.env.REDIS_DB).toBe("3");
    expect(connectionVars(r.env)).toEqual(["REDIS_DB", "REDIS_URL"]);
    expect(JSON.stringify(r.env)).not.toContain(ENV_PW);
  });

  test("SQLite: the profile's file, on a port the system chooses", async () => {
    const { c } = setup();
    const id = (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "p", path: sqliteFile } })).profile.id;
    const r = await run(c, { profileId: id });
    expect(r.env.SQLITE_STUDIO_DB).toBe(sqliteFile);
    expect(connectionVars(r.env)).toEqual(["SQLITE_STUDIO_DB"]);
    expect(r.args).toEqual(["--server", "--port", "0"]);
    // opened directly (no saved connection) it is the same
    const direct = await run(c, { engine: "sqlite", path: sqliteFile });
    expect(direct.env.SQLITE_STUDIO_DB).toBe(sqliteFile);
  });

  test("the File Manager's own settings and the start-up steering variables never reach a studio", async () => {
    const { c } = setup();
    for (const profile of [{ engine: "mysql", name: "a", host: "h" }, { engine: "postgres", name: "b", host: "h" }, { engine: "redis", name: "c", host: "h" }, { engine: "sqlite", name: "d", path: sqliteFile }]) {
      const id = (await c.ok("db/profile/save", { profile })).profile.id;
      const r = await run(c, { profileId: id });
      for (const name of ["FM_SESSION_TOKEN", "FILE_MANAGER_TOKEN", "FM_PRIVATE", "PORT", "STUDIO_WORKER"]) expect(r.env[name], `${profile.engine} ${name}`).toBeUndefined();
      expect(r.env.STUDIO_PARENT_PID).toBe(String(process.pid));
      expect(r.env.STUDIO_EXPORT_DIR).toBe(join(c.dataDir, "db_studios", "files"));
      expect(r.env.PATH).toBe(hostile().PATH);
    }
  }, 30_000);
});

describe("the order: connection, then the engine's defaults, then the environment, then the studio's own", () => {
  test("blank fields fall back step by step", async () => {
    const { c } = setup();
    const id = (await c.ok("db/profile/save", { profile: { engine: "mysql", name: "p", host: "h" } })).profile.id;
    // 1. the environment fills what the connection leaves blank (a plain MSQL_PORT; the address variables are only used as the studio uses them)
    let r = await run(c, { profileId: id });
    expect(r.env).toMatchObject({ MSQL_HOST: "h", MSQL_PORT: "3996", MSQL_USER: "urluser", MSQL_NAME: "url-db", MSQL_TLS: "true" });
    // no password crosses from the environment into a saved connection
    expect(r.env.MSQL_PASSWORD).toBeUndefined();
    expect(JSON.stringify(r.env)).not.toContain(ENV_PW);
    // 2. the engine's defaults beat the environment
    await c.ok("db/engine/save", { engine: "mysql", defaults: { port: 3310, user: "default-user", database: "default-db", tls: false } });
    r = await run(c, { profileId: id });
    expect(r.env).toMatchObject({ MSQL_HOST: "h", MSQL_PORT: "3310", MSQL_USER: "default-user", MSQL_NAME: "default-db", MSQL_TLS: "false" });
    // 3. the connection beats the defaults
    await c.ok("db/profile/save", { id, profile: { engine: "mysql", name: "p", host: "h", port: 3311, user: "mine" } });
    r = await run(c, { profileId: id });
    expect(r.env).toMatchObject({ MSQL_PORT: "3311", MSQL_USER: "mine", MSQL_NAME: "default-db" });
    // 4. environment variables turned off: the studio's own defaults, not the environment
    await c.ok("db/engine/save", { engine: "mysql", useEnv: true, defaults: {} });
    await c.ok("db/engine/save", { engine: "mysql", useEnv: false });
    await c.ok("db/profile/save", { id, profile: { engine: "mysql", name: "p", host: "h" } });
    r = await run(c, { profileId: id });
    expect(r.env).toMatchObject({ MSQL_HOST: "h", MSQL_PORT: "3306", MSQL_USER: "root", MSQL_TLS: "false", MSQL_NAME: "my_app_dev" });
    expect(connectionVars(r.env).filter((n) => n.includes("URL"))).toEqual([]);
  }, 30_000);

  test("a DATABASE_URL that would override the host does not, and is not even passed along", async () => {
    const env = { ...hostile(), DATABASE_URL: "mysql://sneaky:pw@evil-host:3306/evil-db", MSQL_URL: "" };
    delete (env as Record<string, string | undefined>).MSQL_URL;
    const { c } = setup({ env });
    const id = (await c.ok("db/profile/save", { profile: { engine: "mysql", name: "p", host: "h", user: "good" } })).profile.id;
    await c.ok("db/profile/save", { id, profile: { engine: "mysql", name: "p", host: "good-host", user: "good" } });
    const r = await run(c, { profileId: id });
    expect(r.env.MSQL_HOST).toBe("good-host");
    expect(r.env.DATABASE_URL).toBeUndefined();
    expect(r.env.MSQL_URL).toBeUndefined();
    const eff = (await c.ok("db/effective", { id })).effective;
    const host = eff.fields.find((f: any) => f.field === "host");
    expect(host).toMatchObject({ value: "good-host", source: { kind: "profile" } });
    expect(eff.ignored.map((i: any) => i.name)).toEqual(expect.arrayContaining(["MSQL_HOST", "MYSQL_HOST", "DB_HOST"]));
    expect(JSON.stringify(eff)).not.toContain("evil-host");
  });

  test("each engine: every blank field falls back to the environment's own value, with where it came from", async () => {
    const { c } = setup({ env: { PATH: "/bin", PG_PORT: "5999", PG_USER: "env-pg-user", PG_DATABASE: "env-pg-db", PG_SCHEMA: "env-schema", PG_TLS: "1", REDIS_URL: "redis://envuser:x@env-redis:6999/5", SQLITE_STUDIO_DB: "/env/db.sqlite" } });
    const pg = (await c.ok("db/profile/save", { profile: { engine: "postgres", name: "p", host: "h" } })).profile.id;
    const eff = (await c.ok("db/effective", { id: pg })).effective;
    const by = Object.fromEntries(eff.fields.map((f: any) => [f.field, f]));
    expect(by.port).toMatchObject({ value: "5999", source: { kind: "env", name: "PG_PORT", text: "environment variable PG_PORT" } });
    expect(by.user).toMatchObject({ value: "env-pg-user", source: { name: "PG_USER" } });
    expect(by.schema.value).toBe("env-schema");
    expect(by.tls).toMatchObject({ value: "on", source: { name: "PG_TLS" } });
    expect(by.host.source.kind).toBe("profile");
    expect(by.password).toMatchObject({ present: false, value: null, secret: true });
    const redis = (await c.ok("db/profile/save", { profile: { engine: "redis", name: "r", host: "h" } })).profile.id;
    const er = Object.fromEntries((await c.ok("db/effective", { id: redis })).effective.fields.map((f: any) => [f.field, f]));
    expect(er.port).toMatchObject({ value: "6999", source: { name: "REDIS_URL" } });
    expect(er.dbIndex.value).toBe("5");
    expect(er.user.value).toBe("envuser");
  });
});

describe("with no connection chosen", () => {
  test("by default the studio is started with the environment as before (minus start-up steering and the File Manager's own settings)", async () => {
    for (const engine of DB_ENGINES) {
      const { c } = setup();
      const r = await run(c, { engine });
      for (const [k, v] of Object.entries(hostile())) {
        if (k === "PG_STUDIO_PORT") continue; // always set to 0 so the system picks the port (checked below)
        if (["PORT", "STUDIO_WORKER", "FM_SESSION_TOKEN", "FILE_MANAGER_TOKEN", "FM_PRIVATE"].includes(k)) expect(r.env[k], `${engine} ${k}`).toBeUndefined();
        else expect(r.env[k], `${engine} ${k}`).toBe(v);
      }
      expect(r.execArgv).not.toContain("--no-env-file");
      expect(r.env.PG_STUDIO_PORT).toBe(engine === "postgres" ? "0" : undefined);
    }
  }, 30_000);

  test("and it then reads `.env` files of its start folder, as it always did", async () => {
    const { c } = setup({ env: { PATH: process.env.PATH ?? "" }, startEnvFile: "PG_HOST=dotenv-host\nPG_PASSWORD=dotenv-pw\n" });
    const r = await run(c, { engine: "postgres" });
    expect(r.env.PG_HOST).toBe("dotenv-host");
    const eff = (await c.ok("db/effective", { engine: "postgres" })).effective;
    expect(eff.mode).toBe("environment");
    expect(eff.fields.find((f: any) => f.field === "host").source.text).toContain("`.env` in the start folder");
  });

  test("turning environment variables off for the engine also stops the studio reading `.env` files", async () => {
    const dotenv = "PG_HOST=dotenv-host\nPG_USER=dotenv-user\nPG_PASSWORD=dotenv-pw\nMSQL_HOST=dotenv-mysql\nREDIS_URL=redis://dotenv:pw@dotenv-redis\nSQLITE_STUDIO_DB=/dotenv/x.db\n";
    for (const engine of DB_ENGINES) {
      const { c } = setup({ env: { PATH: process.env.PATH ?? "", HOME: "/h", PG_HOST: "env-host", MSQL_HOST: "env-mysql" }, startEnvFile: dotenv, installEnvFile: dotenv });
      // before: the studio sees the values (from the real environment, and from the .env in the folder it starts in)
      const before = await run(c, { engine });
      if (engine === "postgres") expect(before.env.PG_HOST).toBe("env-host");
      if (engine === "mysql") expect(before.env.MSQL_HOST).toBe("env-mysql");
      await c.ok("db/engine/save", { engine, useEnv: false });
      const after = await run(c, { engine });
      expect(connectionVars(after.env).filter((n) => n !== "PG_STUDIO_PORT"), engine).toEqual([]);
      expect(JSON.stringify(after.env)).not.toContain("dotenv");
      expect(after.execArgv).toContain("--no-env-file");
      expect(after.cwd).toBe(neutral(c));
    }
  }, 60_000);

  test("defaults without a connection: the defaults win over the environment, which fills the rest", async () => {
    const { c } = setup();
    await c.ok("db/engine/save", { engine: "mysql", defaults: { host: "default-host", database: "default-db" } });
    const r = await run(c, { engine: "mysql" });
    expect(r.env).toMatchObject({ MSQL_HOST: "default-host", MSQL_NAME: "default-db", MSQL_PORT: "3996", MSQL_USER: "urluser" });
    expect(r.env.MSQL_PASSWORD).toBe(ENV_PW);
    expect(r.env.DATABASE_URL).toBeUndefined();
    expect(r.execArgv).toContain("--no-env-file");
  });
});

describe("the resolution itself (no processes)", () => {
  test("every field says where it came from, and the answer matches what the studio is started with", async () => {
    const env = { PATH: "/bin", MSQL_HOST: "envh", MSQL_PORT: "3999", DB_USER: "dbu", MSQL_PASSWORD: ENV_PW };
    const view = await buildEnvView({ env, cwd: "/nowhere", roots: [], home: "/h" });
    const settings = defaultSettings().engines.mysql;
    const noProfile = resolveConnection({ engine: "mysql", settings, view });
    expect(noProfile.mode).toBe("environment");
    expect(noProfile.sources.host).toMatchObject({ kind: "env", name: "MSQL_HOST" });
    expect(noProfile.sources.user).toMatchObject({ kind: "env", name: "DB_USER" });
    expect(noProfile.sources.database).toMatchObject({ kind: "builtin" });
    expect(noProfile.values.password).toBe(ENV_PW);
    const profile = { id: "x", name: "n", engine: "mysql" as const, tags: [], favorite: false, environment: "development" as const, readOnly: false, host: "ph", createdAt: "" };
    const withProfile = resolveConnection({ engine: "mysql", profile, password: "pp", settings, view });
    expect(withProfile.mode).toBe("profile");
    expect(withProfile.values).toMatchObject({ host: "ph", port: 3999, user: "dbu", password: "pp", database: "my_app_dev" });
    expect(withProfile.ignored.map((i) => i.name).sort()).toEqual(["MSQL_HOST", "MSQL_PASSWORD"]);
    const launch = buildLaunch(withProfile, { baseEnv: env, parentPid: 7, filesDir: "/files" });
    expect(launch).toMatchObject({ explicit: true, cwd: "neutral", bunArgs: ["--no-env-file"] });
    expect(launch.env.MSQL_HOST).toBe("ph");
    expect(launch.env.MSQL_PASSWORD).toBe("pp");
    expect(launch.env.PATH).toBe("/bin");
    expect(buildLaunch(noProfile, { baseEnv: env, parentPid: 7, filesDir: "/files" })).toMatchObject({ explicit: false, cwd: "inherit", bunArgs: [] });
  });

  test("a stand-in studio started in a folder with .env files sees them unless told not to (the test is sensitive)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-db-prec-d-"));
    writeFileSync(join(dir, ".env"), "PG_HOST=from-dotenv\n");
    try {
      const env = { PATH: process.env.PATH ?? "" };
      const sees = (flags: string[]) => {
        const out = Bun.spawnSync([process.execPath, ...flags, "-e", "console.log(process.env.PG_HOST ?? 'none')"], { cwd: dir, env, stdout: "pipe" });
        return out.stdout.toString().trim();
      };
      expect(sees([])).toBe("from-dotenv");
      expect(sees(["--no-env-file"])).toBe("none");
      expect(FAKE_STUDIO.endsWith("fake_studio.ts")).toBe(true);
    } finally {
      rmDir(dir);
    }
  });
});
