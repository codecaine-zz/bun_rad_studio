import { afterAll, describe, expect, test } from "bun:test";
import { parseConnectionUrl } from "../src/features/filemanager/fmDbModel";
import { dbComputer, type DbComputer } from "./helpers/db_fm";

/**
 * The real studios against real servers, started by the File Manager from a saved connection while the environment
 * says something else entirely. Only runs when TEST_MYSQL_URL / TEST_PG_URL / TEST_REDIS_URL name throwaway servers
 * (see docs/testing/database-tests.md); otherwise each part is skipped.
 */
const computers: DbComputer[] = [];
afterAll(() => computers.forEach((c) => c.remove()));

const WRONG_ENV = {
  PATH: process.env.PATH ?? "",
  MSQL_HOST: "wrong-mysql.invalid", MYSQL_HOST: "wrong-mysql.invalid", MSQL_PORT: "1", MSQL_USER: "wrong", MSQL_PASSWORD: "wrong", MSQL_NAME: "wrong", DATABASE_URL: "mysql://wrong:wrong@wrong-mysql.invalid:1/wrong",
  PG_HOST: "wrong-pg.invalid", PG_PORT: "1", PG_USER: "wrong", PG_PASSWORD: "wrong", PG_DATABASE: "wrong", PGHOST: "wrong-pg.invalid",
  REDIS_URL: "redis://:wrong@wrong-redis.invalid:1/9",
};

function target(envName: string) {
  const url = process.env[envName];
  if (!url) return null;
  const r = parseConnectionUrl(url);
  if (!r.ok) throw new Error(`${envName}: ${r.error}`);
  return r.value;
}

async function open(engine: string, t: NonNullable<ReturnType<typeof target>>, extra: Record<string, unknown> = {}) {
  const c = dbComputer({ env: WRONG_ENV, hooks: { studioCommand: undefined, startTimeoutMs: 40_000 } });
  computers.push(c);
  delete (c.server.context.databases as Record<string, unknown>).studioCommand;
  const profile = { engine, name: `real ${engine}`, host: t.host, port: t.port, user: t.user, database: t.database, ...extra };
  const saved = (await c.ok("db/profile/save", { profile, password: t.password ?? "" })).profile;
  const r = await c.api("db/studio/start", { profileId: saved.id });
  expect(r.status, r.text).toBe(200);
  expect(`${(r.json as any).studio.state}: ${(r.json as any).studio.message ?? ""}`).toMatch(/^running/);
  return { c, studio: r.json.studio, saved };
}

const post = async (url: string, body: unknown) => (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json() as Promise<any>;

const mysql = target("TEST_MYSQL_URL");
(mysql ? describe : describe.skip)("MySQL Studio against a real MySQL server, with the wrong environment around", () => {
  test("it connects with the saved connection's values, not the environment's", async () => {
    const { c, studio } = await open("mysql", mysql!);
    const config = ((await (await fetch(`${studio.url}api/config`)).json()) as { config: Record<string, unknown> }).config;
    expect(config).toMatchObject({ host: mysql!.host, port: mysql!.port, user: mysql!.user, hasPassword: true });
    const rows = await post(`${studio.url}api/query`, { sql: "select 1 + 1 as n, current_user() as who" });
    expect(JSON.stringify(rows)).toContain('"n":2');
    expect(JSON.stringify(rows)).not.toContain("wrong");
    expect(JSON.stringify(config)).not.toContain(mysql!.password ?? "no-password-here");
    await c.ok("db/studio/stop", { id: studio.id });
  });
});

const pg = target("TEST_PG_URL");
(pg ? describe : describe.skip)("PostgreSQL Studio against a real PostgreSQL server, with the wrong environment around", () => {
  test("it connects with the saved connection's values, not the environment's", async () => {
    const { c, studio } = await open("postgres", pg!, { schema: "public" });
    const rows = await post(`${studio.url}api/query`, { sql: "select 1 + 1 as n, current_user as who" });
    expect(JSON.stringify(rows)).toContain('"n":2');
    expect(JSON.stringify(rows)).toContain(pg!.user ?? "postgres");
    expect(JSON.stringify(rows)).not.toContain("wrong");
    await c.ok("db/studio/stop", { id: studio.id });
  });
});

const redis = target("TEST_REDIS_URL");
(redis ? describe : describe.skip)("Redis Studio against a real Redis server, with the wrong environment around", () => {
  test("it connects with the saved connection's values, not the environment's", async () => {
    const { c, studio } = await open("redis", redis!, { dbIndex: redis!.dbIndex ?? 0 });
    const kpis: any = await (await fetch(`${studio.url}api/kpis`)).json();
    expect(kpis.connected, JSON.stringify(kpis)).toBe(true);
    expect(JSON.stringify(kpis)).not.toContain("wrong-redis");
    expect(JSON.stringify(kpis)).not.toContain(redis!.password ?? "no-password-here");
    await c.ok("db/studio/stop", { id: studio.id });
  });
});
