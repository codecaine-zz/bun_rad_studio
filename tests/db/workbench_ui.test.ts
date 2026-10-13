import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { ProfileStore, MemorySecretStore } from "../../src/db/profiles";
import { WorkbenchService } from "../../src/db/service";
import { createWorkbenchHandler } from "../../src/db/workbench_http";
import { generateWorkbenchHtml } from "../../src/db/workbench_ui";
import { createAdapter } from "../../src/db";
import { provisionTestDb, type TestDb } from "../helpers/testdb";

describe("workbench page", () => {
  it("the inline script parses and the page has no framework or remote script dependencies", () => {
    const html = generateWorkbenchHtml({ token: "t" });
    const scripts = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi) ?? [];
    expect(scripts.length).toBe(1);
    for (const tag of scripts) expect(() => new Function(tag.replace(/<\/?script[^>]*>/gi, ""))).not.toThrow();
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });

  it("escapes the title and token in the page shell", () => {
    const html = generateWorkbenchHtml({ token: '"><script>x</script>', title: "<b>x</b>" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toContain('"><script>x</script>');
  });
});

describe("workbench UI workflow (jsdom under Node against the real server)", () => {
  let dir: string;
  let server: ReturnType<typeof Bun.serve>;
  let service: WorkbenchService;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "workbench-ui-"));
    service = new WorkbenchService(new ProfileStore(join(dir, "profiles"), new MemorySecretStore()));
  });
  afterAll(async () => {
    await service.closeAll();
    server?.stop(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes the node:test suite in workbench_ui.node.mjs on SQLite, and on MySQL/PostgreSQL when configured", async () => {
    const handler = createWorkbenchHandler(service);
    server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => (await handler.handle(req)) ?? new Response("nf", { status: 404 }) });
    const seed = `INSERT INTO people (name, note) VALUES ('Ann', NULL), ('Bob', 'hello'), ('<img src=x onerror="window.__xss=1">', '<script>window.__xss=1</script>')`;
    const targets: unknown[] = [];

    const dbPath = join(dir, "ui.db");
    const db = new Database(dbPath);
    db.run("CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL, note TEXT)");
    db.run(seed);
    db.run("CREATE VIEW v_people AS SELECT id, name FROM people");
    db.close();
    targets.push({ label: "SQLite", prefix: "", profile: { engine: "sqlite", path: dbPath, sqliteMode: "readwrite" } });

    const provisioned: TestDb[] = [];
    for (const [engine, label, ddl] of [
      ["mysql", "MySQL", "CREATE TABLE people (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(200) NOT NULL, note VARCHAR(200) NULL)"],
      ["postgres", "PostgreSQL", "CREATE TABLE people (id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, note VARCHAR(200))"],
    ] as const) {
      const t = await provisionTestDb(engine);
      if (!t) continue;
      provisioned.push(t);
      const a = createAdapter({ engine, ...t.config, allowPublicKeyRetrieval: true });
      await a.connect();
      await a.query(ddl);
      await a.query(seed);
      await a.query("CREATE VIEW v_people AS SELECT id, name FROM people");
      await a.close();
      const { password, ...rest } = t.config;
      targets.push({ label, prefix: engine === "postgres" ? "public." : "", password, profile: { engine, ...rest, allowPublicKeyRetrieval: true } });
    }

    const prodPath = join(dir, "prod-ui.db");
    const prod = new Database(prodPath);
    prod.run("CREATE TABLE z (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO z (v) VALUES ('a')");
    prod.close();

    // async spawn: the server lives in this process and must keep serving while node runs
    try {
      const proc = Bun.spawn(["node", "--test", "--test-reporter=spec", join(import.meta.dir, "workbench_ui.node.mjs")], {
        env: { ...process.env, WB_BASE: `http://127.0.0.1:${server.port}`, WB_TOKEN: handler.token, WB_TARGETS: JSON.stringify(targets), WB_PROD_DB: prodPath, NODE_NO_WARNINGS: "1" },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      if (code !== 0 || process.env.WB_VERBOSE) console.log(out + err);
      expect(code).toBe(0);
    } finally {
      await service.closeAll();
      for (const t of provisioned) await t.drop();
    }
  }, 120_000);
});
