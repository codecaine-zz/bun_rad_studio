import { afterAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startSqliteStudioServer } from "../../applications/sqlite_studio_server";
import { startMysqlStudioServer } from "../../applications/mysql_studio_server";
import { startPostgresStudioServer } from "../../applications/postgres_studio_server";
import { makeRig, type Rig } from "../helpers/staging";
import { generateSqliteStudioHtml } from "../../applications/sqlite_studio";
import { rmDir } from "../helpers/rm";

const CSV = "\uFEFFCustomer ID;Full Name;E-mail Address;Age;Balance;Date joined;Active?;Plan\r\n1;Ann Lee;ann@example.com;30;\"1.510,00\";01/01/2020;yes;free\r\n2;Bobby Ray;bob@example.com;41;20,00;02/02/2021;no;pro\r\n3;\"Cy\nDee\";cy@example.com;x;5,5;31/12/2022;y;team\r\n4;Di Fox;ann@example.com;22;5,5;31/12/2022;1;team\r\n5;Ed Mo;ed@example.com;200;1,5;2022-12-31;y;free\r\n6;Fay;fay@example.com;33;\"2.000,25\";15/03/2023;N;pro\r\n7;Gus;gus@example.com;29;7;not a date;yes;gold\r\n8;short\r\n";

const dir = mkdtempSync(join(tmpdir(), "staging-ui-"));
const servers: ReturnType<typeof Bun.serve>[] = [];
afterAll(() => {
  for (const s of servers) s.stop(true);
  rmDir(dir);
});

describe("Import with staging: studio page", () => {
  it("the page carries the wizard script and style, parses, and uses no external resources", () => {
    const html = generateSqliteStudioHtml();
    expect(html).toContain("btnStagingImport");
    expect(html).toContain("/api/staging/");
    expect(html).toContain(".stg-dialog");
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1]!)).not.toThrow();
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });

  it("walks the whole wizard in jsdom against the real SQLite studio server (node:test)", async () => {
    const dbPath = join(dir, "shop.db");
    const db = new Database(dbPath);
    db.run("CREATE TABLE customers (id INTEGER PRIMARY KEY, name VARCHAR(50) NOT NULL, email VARCHAR(100) UNIQUE, age INTEGER CHECK (age >= 0 AND age < 150), balance DECIMAL(10,2), joined DATE, active BOOLEAN, tier TEXT CHECK (tier IN ('free','pro','team')))");
    db.run("INSERT INTO customers VALUES (1,'Ann Lee','ann@example.com',30,10.50,'2020-01-01',1,'free'),(2,'Bob Ray','bob@example.com',40,20,'2021-02-02',0,'pro')");
    db.close();
    const server = startSqliteStudioServer({ port: 0, initialDbPath: dbPath });
    servers.push(server);
    // a second studio that the File Manager started with a data file to import (the environment is read when the studio starts)
    const csvPath = join(dir, "from_file_manager.csv");
    writeFileSync(csvPath, "id,name,email,age\n40,Fm,fm@x.com,33\n");
    process.env.STUDIO_IMPORT_FILE = csvPath;
    const granted = startSqliteStudioServer({ port: 0, initialDbPath: dbPath });
    delete process.env.STUDIO_IMPORT_FILE;
    servers.push(granted);
    const targets = [{ label: "SQLite", base: `http://127.0.0.1:${server.port}`, grantedBase: `http://127.0.0.1:${granted.port}` }];
    // MySQL and PostgreSQL studios too, when a throwaway server is configured
    const rigs: Rig[] = [];
    for (const name of ["mysql", "postgres"] as const) {
      const rig = await makeRig(name);
      if (!rig) continue;
      rigs.push(rig);
      await rig.sql(`INSERT INTO customers (id, name, email, age, balance, joined, active, tier) VALUES (1,'Ann Lee','ann@example.com',30,10.50,'2020-01-01',${name === "postgres" ? "true" : "1"},'free'), (2,'Bob Ray','bob@example.com',40,20,'2021-02-02',${name === "postgres" ? "false" : "0"},'pro')`);
      const config = name === "mysql" ? { ...rig.config } : { ...rig.config, schema: "public" };
      const srv = name === "mysql" ? startMysqlStudioServer({ port: 0, initialDbPath: rig.config!.database, config: config as any }) : startPostgresStudioServer({ port: 0, initialDbPath: rig.config!.database, config: config as any });
      servers.push(srv);
      process.env.STUDIO_IMPORT_FILE = csvPath;
      const srv2 = name === "mysql" ? startMysqlStudioServer({ port: 0, initialDbPath: rig.config!.database, config: config as any }) : startPostgresStudioServer({ port: 0, initialDbPath: rig.config!.database, config: config as any });
      delete process.env.STUDIO_IMPORT_FILE;
      servers.push(srv2);
      targets.push({ label: name === "mysql" ? "MySQL" : "PostgreSQL", base: `http://127.0.0.1:${srv.port}`, grantedBase: `http://127.0.0.1:${srv2.port}` });
    }
    const proc = Bun.spawn(["node", "--test", "--test-reporter=spec", join(import.meta.dir, "staging_ui.node.mjs")], {
      env: { ...process.env, STG_TARGETS: JSON.stringify(targets), STG_CSV: Buffer.from(CSV, "utf8").toString("base64"), NODE_NO_WARNINGS: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    for (const r of rigs) await r.close();
    if (code !== 0 || process.env.STG_VERBOSE) console.log(out + err);
    expect(code).toBe(0);
  }, 180_000);
});
