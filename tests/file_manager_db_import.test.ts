import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";
import { resetLimits, setLimits } from "../src/db/staging/limits";
import { dbComputer, type DbComputer } from "./helpers/db_fm";

const FAKE = join(import.meta.dir, "helpers", "fake_studio_staging.ts");
const studioCommand = () => ({ kind: "dev" as const, where: FAKE, build: (bunArgs: string[], studioArgs: string[]) => [process.execPath, ...bunArgs, FAKE, ...studioArgs] });

const computers: DbComputer[] = [];
afterAll(async () => {
  resetLimits();
  for (const c of computers) {
    for (const studio of (await c.ok("db/studio/list")).studios) await c.ok("db/studio/stop", { id: studio.id });
    c.remove();
  }
});
const computer = (o: Parameters<typeof dbComputer>[0] = {}) => {
  const c = dbComputer({ ...o, hooks: { studioCommand, ...o.hooks } });
  computers.push(c);
  return c;
};
const getJson = async (url: string) => (await fetch(url)).json() as Promise<any>;

async function sqliteProfile(c: DbComputer, extra: Record<string, unknown> = {}) {
  const file = join(c.dir, `shop-${Math.random().toString(36).slice(2, 6)}.sqlite`);
  const db = new Database(file);
  try {
    db.run("create table customers(id integer primary key, name text)");
  } finally {
    db.close();
  }
  const id = (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "shop", path: file, sqliteMode: "readwrite", ...extra } })).profile.id;
  return { id, file };
}

describe("importing a data file into a studio, from the File Manager", () => {
  test("a studio that starts for the import gets the file, a secret and the marks in its environment; the file is never touched", async () => {
    const c = computer();
    const { id } = await sqliteProfile(c);
    const data = join(c.dir, "people.csv");
    writeFileSync(data, "id,name\n1,Ann\n");
    const before = readFileSync(data, "utf8");
    const r = await c.ok("db/studio/start", { profileId: id, importFile: data });
    const env = (await getJson(`${r.studio.url}__env`)).env;
    expect(env.STUDIO_IMPORT_FILE).toBe(realpathSync(data));
    expect(env.STUDIO_STAGING_TOKEN).toMatch(/^[a-f0-9]{36}$/);
    expect(env.STUDIO_ENVIRONMENT).toBeUndefined();
    expect(readFileSync(data, "utf8")).toBe(before);
    // the same (already running) studio: told through the secret-protected grant route instead
    const data2 = join(c.dir, "more.tsv");
    writeFileSync(data2, "id\tname\n2\tBob\n");
    const again = await c.ok("db/studio/start", { profileId: id, importFile: data2 });
    expect(again.reused).toBe(true);
    const grants = await getJson(`${r.studio.url}__grants`);
    expect(grants).toEqual([{ secret: env.STUDIO_STAGING_TOKEN, body: { path: realpathSync(data2) } }]);
    // only the wizard, no file
    await c.ok("db/studio/start", { profileId: id, importOpen: true });
    expect((await getJson(`${r.studio.url}__grants`)).at(-1)).toEqual({ secret: env.STUDIO_STAGING_TOKEN, body: {} });
    // a plain open (no import) sends nothing
    await c.ok("db/studio/start", { profileId: id });
    expect(await getJson(`${r.studio.url}__grants`)).toHaveLength(2);
    // the secret is not shown in the studio's list or log
    const listed = JSON.stringify((await c.ok("db/studio/list")).studios);
    expect(listed).not.toContain(env.STUDIO_STAGING_TOKEN);
  });

  test("a studio that starts only to open the wizard is told so", async () => {
    const c = computer();
    const { id } = await sqliteProfile(c);
    const r = await c.ok("db/studio/start", { profileId: id, importOpen: true });
    const env = (await getJson(`${r.studio.url}__env`)).env;
    expect(env.STUDIO_IMPORT_OPEN).toBe("1");
    expect(env.STUDIO_IMPORT_FILE).toBeUndefined();
  });

  test("production and read-only connections tell the studio, after the usual confirmation", async () => {
    const c = computer();
    const prod = await sqliteProfile(c, { name: "prod", environment: "production" });
    const refused = await c.api("db/studio/start", { profileId: prod.id, importOpen: true });
    expect(refused.json.error.code).toBe("NEEDS_CONFIRM");
    const ok = await c.ok("db/studio/start", { profileId: prod.id, importOpen: true, confirmWrites: true });
    expect((await getJson(`${ok.studio.url}__env`)).env.STUDIO_ENVIRONMENT).toBe("production");
    const ro = await sqliteProfile(c, { name: "ro", readOnly: true });
    const ok2 = await c.ok("db/studio/start", { profileId: ro.id, importOpen: true, confirmWrites: true });
    expect((await getJson(`${ok2.studio.url}__env`)).env.STUDIO_READONLY).toBe("1");
  });

  test("the separate window gets the file through its environment and no secret", async () => {
    const calls: { env: Record<string, string> }[] = [];
    const c = computer({ hooks: { spawnWindow: async (_cmd, o) => (calls.push({ env: o.env }), { ok: true }) } });
    const { id } = await sqliteProfile(c);
    const data = join(c.dir, "w.ndjson");
    writeFileSync(data, '{"id":1}\n');
    await c.ok("db/studio/window", { profileId: id, importFile: data });
    expect(calls[0]!.env.STUDIO_IMPORT_FILE).toBe(realpathSync(data));
    expect(calls[0]!.env.STUDIO_STAGING_TOKEN).toBe("");
    await c.ok("db/studio/window", { profileId: id, importOpen: true });
    expect(calls[1]!.env.STUDIO_IMPORT_OPEN).toBe("1");
    expect(calls[1]!.env.STUDIO_IMPORT_FILE).toBeUndefined();
  });

  test("only real, importable, not-too-big files are handed over", async () => {
    const c = computer();
    const { id } = await sqliteProfile(c);
    const bad = async (path: unknown, message: RegExp) => {
      const r = await c.api("db/studio/start", { profileId: id, importFile: path });
      expect(r.status, String(path)).toBe(400);
      expect(r.json.error.message).toMatch(message);
      expect(r.json.error.code).not.toBe("NEEDS_CONFIRM");
    };
    await bad(join(c.dir, "missing.csv"), /isn't there/);
    await bad(c.dir, /isn't a file/);
    const sheet = join(c.dir, "book.xlsx");
    writeFileSync(sheet, "PK");
    await bad(sheet, /CSV UTF-8/);
    writeFileSync(join(c.dir, "notes.docx"), "x");
    await bad(join(c.dir, "notes.docx"), /Only CSV/);
    await bad("relative.csv", /full path|absolute|path/i);
    const big = join(c.dir, "big.csv");
    writeFileSync(big, "id\n1\n");
    setLimits({ maxFileBytes: 3 });
    try {
      await bad(big, /bigger than/);
    } finally {
      resetLimits();
    }
    // nothing started for any of them
    expect((await c.ok("db/studio/list")).studios).toEqual([]);
    const check = await c.ok("db/import/check", { path: big });
    expect(check.file).toMatchObject({ name: "big.csv", size: 5 });
    expect((await c.api("db/import/check", { path: sheet })).status).toBe(400);
    if (process.platform !== "win32") {
      mkdirSync(join(c.dir, "real"));
      writeFileSync(join(c.dir, "real", "t.csv"), "a\n1\n");
      symlinkSync(join(c.dir, "real", "t.csv"), join(c.dir, "link.csv"));
      expect((await c.ok("db/import/check", { path: join(c.dir, "link.csv") })).file.name).toBe("t.csv");
    }
  });
});
