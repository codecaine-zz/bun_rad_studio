import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { makeSqliteFile } from "../src/features/filemanager/fmNewSqlite";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-newsqlite-"));
const home = join(root, "home");
const work = join(home, "work");
mkdirSync(work, { recursive: true });
const ctx = createContext({ home, dataDir: join(root, "data") });
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("New SQLite database", () => {
  test("makes a real, empty, usable database with a free name each time", async () => {
    const a = await makeSqliteFile(ctx, work);
    expect(a.name).toBe("New database.sqlite");
    expect(readFileSync(a.path).subarray(0, 15).toString()).toBe("SQLite format 3");
    expect(statSync(a.path).size).toBe(4096);
    const db = new Database(a.path);
    expect(db.query("pragma integrity_check").get()).toEqual({ integrity_check: "ok" });
    db.run("create table t(x integer primary key, y text)");
    db.run("insert into t(y) values ('hello')");
    expect(db.query("select y from t").get()).toEqual({ y: "hello" });
    db.close();
    const b = await makeSqliteFile(ctx, work);
    expect(b.name).toBe("New database (2).sqlite");
  });

  test("a chosen name gets .sqlite when it has no ending, never overwrites, and refuses bad names and places", async () => {
    expect((await makeSqliteFile(ctx, work, "orders")).name).toBe("orders.sqlite");
    expect((await makeSqliteFile(ctx, work, "orders.db")).name).toBe("orders.db");
    writeFileSync(join(work, "mine.sqlite"), "precious");
    await expect(makeSqliteFile(ctx, work, "mine.sqlite")).rejects.toThrow(/already exists/);
    expect(readFileSync(join(work, "mine.sqlite"), "utf8")).toBe("precious");
    await expect(makeSqliteFile(ctx, work, "a/b")).rejects.toThrow();
    await expect(makeSqliteFile(ctx, work, "..")).rejects.toThrow();
    await expect(makeSqliteFile(ctx, join(work, "missing"))).rejects.toThrow();
  });

  test("the newsqlite operation needs the token and answers with the path", async () => {
    const server = startFileManagerServer({ port: 0, token: "tok", context: { home, dataDir: join(root, "data2") } });
    try {
      const url = `http://127.0.0.1:${server.port}/api/newsqlite`;
      const denied = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parent: work }) });
      expect(denied.status).toBe(401);
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-fm-token": "tok" }, body: JSON.stringify({ parent: work }) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { path: string };
      expect(body.path).toMatch(/New database( \(\d+\))?\.sqlite$/);
      expect(readFileSync(body.path).subarray(0, 15).toString()).toBe("SQLite format 3");
    } finally {
      server.stop(true);
    }
  });
});
