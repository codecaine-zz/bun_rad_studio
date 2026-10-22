import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { analyzeSource, readRows } from "../../src/db/staging/reader";
import { memorySource, fileSource } from "../../src/db/staging/source";
import { parseUniversalTable } from "../../src/db/importParser";
import { writeXlsx } from "../../src/features/filemanager/fmConvSheet";
import { Notes } from "../../src/features/filemanager/fmConvCommon";
import { zipBuffer } from "../../src/features/filemanager/fmConvZip";
import { IMPORT_EXTENSIONS } from "../../src/features/filemanager/fmDbImport";
import { parseRedisImportPayload } from "../../src/redis_helpers";
import { startSqliteStudioServer } from "../../applications/sqlite_studio_server";
import { rmDir } from "../helpers/rm";

function stringSource(text: string, name: string) {
  return memorySource(text, name);
}

function makeOdsBuffer(sheets: Array<{ name: string; rows: Array<Array<string | number | boolean>> }>): Buffer {
  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const tablesXml = sheets
    .map((sh) => {
      const rowsXml = sh.rows
        .map((r) => {
          const cellsXml = r
            .map((cell) => {
              if (typeof cell === "number") {
                return `<table:table-cell office:value-type="float" office:value="${cell}"><text:p>${cell}</text:p></table:table-cell>`;
              }
              if (typeof cell === "boolean") {
                return `<table:table-cell office:value-type="boolean" office:boolean-value="${cell}"><text:p>${cell}</text:p></table:table-cell>`;
              }
              return `<table:table-cell office:value-type="string"><text:p>${escXml(String(cell))}</text:p></table:table-cell>`;
            })
            .join("");
          return `<table:table-row>${cellsXml}</table:table-row>`;
        })
        .join("");
      return `<table:table table:name="${escXml(sh.name)}">${rowsXml}</table:table>`;
    })
    .join("");
  const content = `<office:document-content><office:body><office:spreadsheet>${tablesXml}</office:spreadsheet></office:body></office:document-content>`;
  return zipBuffer([
    { name: "mimetype", data: Buffer.from("application/vnd.oasis.opendocument.spreadsheet") },
    { name: "content.xml", data: Buffer.from(content) },
  ]);
}

async function collectRows(src: any, settings: any) {
  const a = await analyzeSource(src, settings);
  const colNames = a.columns.map((c) => c.name);
  const out: Record<string, string | null>[] = [];
  for await (const rec of readRows(src, a.settings, colNames)) {
    const obj: Record<string, string | null> = {};
    colNames.forEach((col, idx) => {
      obj[col] = rec.cells[idx] ?? null;
    });
    out.push(obj);
  }
  return out;
}

describe("Universal Multi-Format Database Import Suite", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rad-multifmt-"));
  });

  afterEach(() => {
    rmDir(dir);
  });

  test("1. Excel (.xlsx) & OpenDocument (.ods) spreadsheets (including multi-sheet selection)", async () => {
    const xlsxPath = join(dir, "workbook.xlsx");
    const odsPath = join(dir, "workbook.ods");
    const xlsxBuf = writeXlsx(
      [
        {
          name: "Employees",
          columns: ["id", "name", "salary", "active"],
          rows: [
            [1, "Ada Lovelace", 145000.5, true],
            [2, "Alan Turing", 152000, false],
          ],
        },
        {
          name: "Departments",
          columns: ["dept_id", "title"],
          rows: [
            ["ENG", "Engineering"],
            ["RES", "Research"],
          ],
        },
      ],
      new Notes(),
    );
    writeFileSync(xlsxPath, xlsxBuf);
    writeFileSync(
      odsPath,
      makeOdsBuffer([
        {
          name: "Employees",
          rows: [
            ["id", "name", "salary", "active"],
            [1, "Ada Lovelace", 145000.5, true],
            [2, "Alan Turing", 152000, false],
          ],
        },
        {
          name: "Departments",
          rows: [
            ["dept_id", "title"],
            ["ENG", "Engineering"],
            ["RES", "Research"],
          ],
        },
      ]),
    );

    // Analyze & read XLSX default sheet
    const xlsxSrc = fileSource(xlsxPath, "workbook.xlsx");
    const aXlsx = await analyzeSource(xlsxSrc, {}, 50);
    expect(aXlsx.settings.format).toBe("xlsx");
    expect(aXlsx.sheets).toEqual(["Employees", "Departments"]);
    expect(aXlsx.columns.map((c) => c.name)).toEqual(["id", "name", "salary", "active"]);
    const rowsXlsx = await collectRows(xlsxSrc, aXlsx.settings);
    expect(rowsXlsx.length).toBe(2);
    expect(rowsXlsx[0]).toEqual({ id: "1", name: "Ada Lovelace", salary: "145000.5", active: "true" });

    // Select second sheet ("Departments") in XLSX
    const aXlsxDept = await analyzeSource(xlsxSrc, { format: "xlsx", sheet: "Departments" });
    expect(aXlsxDept.columns.map((c) => c.name)).toEqual(["dept_id", "title"]);
    const rowsDept = await collectRows(xlsxSrc, aXlsxDept.settings);
    expect(rowsDept).toEqual([
      { dept_id: "ENG", title: "Engineering" },
      { dept_id: "RES", title: "Research" },
    ]);

    // Analyze & read ODS
    const odsSrc = fileSource(odsPath, "workbook.ods");
    const aOds = await analyzeSource(odsSrc, {}, 50);
    expect(aOds.settings.format).toBe("ods");
    expect(aOds.sheets).toEqual(["Employees", "Departments"]);
    const rowsOds = await collectRows(odsSrc, aOds.settings);
    expect(rowsOds.length).toBe(2);
    expect(rowsOds[1]?.name).toBe("Alan Turing");

    // In-memory base64 parsing via parseUniversalTable (used by Studio CRUD wizards)
    const xlsxBase64 = Buffer.from(readFileSync(xlsxPath)).toString("base64");
    const parsedFromB64 = await parseUniversalTable({ base64: xlsxBase64, fileName: "workbook.xlsx", sheet: "Departments" });
    expect(parsedFromB64.format).toBe("xlsx");
    expect(parsedFromB64.columns).toEqual(["dept_id", "title"]);
    expect(parsedFromB64.rows.length).toBe(2);
  });

  test("2. YAML (.yaml / .yml) sequences, nested tables, and config maps", async () => {
    const yamlList = `---
- id: 10
  service: auth
  port: 8080
- id: 20
  service: billing
  port: 9090
`;
    const src = stringSource(yamlList, "services.yaml");
    const a = await analyzeSource(src);
    expect(a.settings.format).toBe("yaml");
    expect(a.columns.map((c) => c.name)).toEqual(["id", "service", "port"]);
    const rows = await collectRows(src, a.settings);
    expect(rows).toEqual([
      { id: "10", service: "auth", port: "8080" },
      { id: "20", service: "billing", port: "9090" },
    ]);

    // Nested multi-table YAML
    const yamlMulti = `
users:
  - id: 1
    username: root
roles:
  - role_id: admin
    level: 99
`;
    const mSrc = stringSource(yamlMulti, "app.yml");
    const aMulti = await analyzeSource(mSrc, { sheet: "roles" });
    expect(aMulti.sheets).toEqual(["users", "roles"]);
    expect(aMulti.columns.map((c) => c.name)).toEqual(["role_id", "level"]);
  });

  test("3. TOML (.toml) array of tables and config sections", async () => {
    const tomlText = `
[[servers]]
name = "alpha"
ip = "10.0.0.1"
cores = 16

[[servers]]
name = "beta"
ip = "10.0.0.2"
cores = 32
`;
    const src = stringSource(tomlText, "cluster.toml");
    const a = await analyzeSource(src);
    expect(a.settings.format).toBe("toml");
    expect(a.columns.map((c) => c.name)).toEqual(["name", "ip", "cores"]);
    const rows = await collectRows(src, a.settings);
    expect(rows).toEqual([
      { name: "alpha", ip: "10.0.0.1", cores: "16" },
      { name: "beta", ip: "10.0.0.2", cores: "32" },
    ]);
  });

  test("4. XML (.xml) repeating record elements with attributes and child tags", async () => {
    const xmlText = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="bk101" category="cs">
    <title>Compilers</title>
    <price>59.95</price>
  </book>
  <book id="bk102" category="math">
    <title>Linear Algebra</title>
    <price>45.00</price>
  </book>
</catalog>`;
    const src = stringSource(xmlText, "books.xml");
    const a = await analyzeSource(src);
    expect(a.settings.format).toBe("xml");
    expect(a.columns.map((c) => c.name)).toEqual(["@id", "@category", "title", "price"]);
    const rows = await collectRows(src, a.settings);
    expect(rows).toEqual([
      { "@id": "bk101", "@category": "cs", title: "Compilers", price: "59.95" },
      { "@id": "bk102", "@category": "math", title: "Linear Algebra", price: "45.00" },
    ]);
  });

  test("5. Apple Property List (.plist) array of dicts and single dict", async () => {
    const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
  <dict>
    <key>BundleId</key>
    <string>com.rad.studio</string>
    <key>Build</key>
    <integer>42</integer>
    <key>Active</key>
    <true/>
  </dict>
  <dict>
    <key>BundleId</key>
    <string>com.rad.cli</string>
    <key>Build</key>
    <integer>43</integer>
    <key>Active</key>
    <false/>
  </dict>
</array>
</plist>`;
    const src = stringSource(plistXml, "Info.plist");
    const a = await analyzeSource(src);
    expect(a.settings.format).toBe("plist");
    const rows = await collectRows(src, a.settings);
    expect(rows).toEqual([
      { BundleId: "com.rad.studio", Build: "42", Active: "true" },
      { BundleId: "com.rad.cli", Build: "43", Active: "false" },
    ]);
  });

  test("6. SQL dumps (.sql) with CREATE TABLE + INSERT INTO and PostgreSQL COPY ... FROM stdin", async () => {
    const sqlDump = `
CREATE TABLE customers (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  tier VARCHAR(20)
);
INSERT INTO customers VALUES (1, 'Acme Corp', 'enterprise'), (2, 'Globex', 'pro');

COPY orders (order_id, customer_id, total) FROM stdin;
1001\t1\t250.75
1002\t2\t99.00
\\.
`;
    const src = stringSource(sqlDump, "backup.sql");
    const aCustomers = await analyzeSource(src);
    expect(aCustomers.settings.format).toBe("sql");
    expect(aCustomers.sheets).toEqual(["customers", "orders"]);
    expect(aCustomers.columns.map((c) => c.name)).toEqual(["id", "name", "tier"]);
    const custRows = await collectRows(src, aCustomers.settings);
    expect(custRows).toEqual([
      { id: "1", name: "Acme Corp", tier: "enterprise" },
      { id: "2", name: "Globex", tier: "pro" },
    ]);

    const aOrders = await analyzeSource(src, { format: "sql", sheet: "orders" });
    expect(aOrders.columns.map((c) => c.name)).toEqual(["order_id", "customer_id", "total"]);
    const orderRows = await collectRows(src, aOrders.settings);
    expect(orderRows).toEqual([
      { order_id: "1001", customer_id: "1", total: "250.75" },
      { order_id: "1002", customer_id: "2", total: "99.00" },
    ]);
  });

  test("7. Markdown pipe tables (.md) and HTML <table> (.html)", async () => {
    const mdText = `
# Benchmark Results

| Engine | QPS | Latency_ms |
| :--- | :---: | ---: |
| SQLite | 48000 | 0.21 |
| Postgres | 35000 | 0.45 |
`;
    const mdSrc = stringSource(mdText, "bench.md");
    const aMd = await analyzeSource(mdSrc);
    expect(aMd.settings.format).toBe("markdown");
    const mdRows = await collectRows(mdSrc, aMd.settings);
    expect(mdRows).toEqual([
      { Engine: "SQLite", QPS: "48000", Latency_ms: "0.21" },
      { Engine: "Postgres", QPS: "35000", Latency_ms: "0.45" },
    ]);

    const htmlText = `<!DOCTYPE html>
<html><body>
  <table id="metrics">
    <thead><tr><th>Host</th><th>CPU</th></tr></thead>
    <tbody>
      <tr><td>node-1</td><td>12.4%</td></tr>
      <tr><td>node-2</td><td>43.1%</td></tr>
    </tbody>
  </table>
</body></html>`;
    const htmlSrc = stringSource(htmlText, "report.html");
    const aHtml = await analyzeSource(htmlSrc);
    expect(aHtml.settings.format).toBe("html");
    const htmlRows = await collectRows(htmlSrc, aHtml.settings);
    expect(htmlRows).toEqual([
      { Host: "node-1", CPU: "12.4%" },
      { Host: "node-2", CPU: "43.1%" },
    ]);
  });

  test("8. INI (.ini), Dotenv (.env), Java .properties, and JSON5/JSONC", async () => {
    const iniText = `
[database]
host = 127.0.0.1
port = 5432

[cache]
ttl = 300
`;
    const iniSrc = stringSource(iniText, "config.ini");
    const aIni = await analyzeSource(iniSrc);
    expect(aIni.settings.format).toBe("ini");
    const iniRows = await collectRows(iniSrc, aIni.settings);
    expect(iniRows).toEqual([
      { section: "database", host: "127.0.0.1", port: "5432", ttl: null },
      { section: "cache", host: null, port: null, ttl: "300" },
    ]);

    const envText = `
# App settings
export APP_ENV="production"
PORT=3000
`;
    const envSrc = stringSource(envText, ".env");
    const aEnv = await analyzeSource(envSrc);
    expect(aEnv.settings.format).toBe("env");
    const envRows = await collectRows(envSrc, aEnv.settings);
    expect(envRows).toEqual([
      { key: "APP_ENV", value: "production" },
      { key: "PORT", value: "3000" },
    ]);

    const propText = `
app.name = Bun RAD Studio
app.threads : 8
`;
    const propSrc = stringSource(propText, "application.properties");
    const aProp = await analyzeSource(propSrc);
    expect(aProp.settings.format).toBe("properties");
    const propRows = await collectRows(propSrc, aProp.settings);
    expect(propRows).toEqual([
      { key: "app.name", value: "Bun RAD Studio" },
      { key: "app.threads", value: "8" },
    ]);

    const json5Text = `{
      // JSON5 with comments and wrapper key
      items: [
        { id: 1, label: 'Alpha', },
        { id: 2, label: 'Beta', },
      ],
    }`;
    const j5Src = stringSource(json5Text, "data.json5");
    const aJ5 = await analyzeSource(j5Src);
    expect(aJ5.settings.format).toBe("json");
    const j5Rows = await collectRows(j5Src, aJ5.settings);
    expect(j5Rows).toEqual([
      { id: "1", label: "Alpha" },
      { id: "2", label: "Beta" },
    ]);
  });

  test("9. End-to-End SQLite Staging & Direct Studio Import API across formats", async () => {
    const dbPath = join(dir, "studio.sqlite");
    const srv = startSqliteStudioServer({ initialDbPath: dbPath, port: 0 });
    const baseUrl = `http://127.0.0.1:${srv.port}`;
    try {
      // 1. Direct import of YAML via POST /api/import
      const yamlRes = await fetch(`${baseUrl}/api/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "yaml_items",
          create: true,
          fileName: "items.yaml",
          content: "- code: A1\n  qty: 5\n- code: B2\n  qty: 12\n",
        }),
      }).then((r) => r.json() as Promise<any>);
      expect(yamlRes.success).toBe(true);
      expect(yamlRes.inserted).toBe(2);

      // 2. Direct import of XLSX via POST /api/import (binary base64)
      const xlsxPath = join(dir, "products.xlsx");
      writeFileSync(
        xlsxPath,
        writeXlsx(
          [
            {
              name: "Products",
              columns: ["sku", "title", "price"],
              rows: [
                ["SKU-1", "Keyboard", 99.5],
                ["SKU-2", "Monitor", 299.0],
              ],
            },
          ],
          new Notes(),
        ),
      );
      const base64 = Buffer.from(readFileSync(xlsxPath)).toString("base64");
      const xlsxRes = await fetch(`${baseUrl}/api/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "xlsx_products",
          create: true,
          fileName: "products.xlsx",
          base64,
        }),
      }).then((r) => r.json() as Promise<any>);
      expect(xlsxRes.success).toBe(true);
      expect(xlsxRes.inserted).toBe(2);

      // Verify rows in SQLite database
      const checkDb = new Database(dbPath, { readonly: true });
      const items = checkDb.query("SELECT code, qty FROM yaml_items ORDER BY code").all();
      expect(items.length).toBe(2);
      const prods = checkDb.query("SELECT sku, title, price FROM xlsx_products ORDER BY sku").all();
      expect(prods.length).toBe(2);
      checkDb.close();
    } finally {
      srv.stop();
    }
  });

  test("10. File Manager IMPORT_EXTENSIONS and fileSource support all new formats", async () => {
    for (const ext of ["xlsx", "ods", "yaml", "yml", "toml", "xml", "plist", "sql", "md", "html", "ini", "env", "properties", "json5", "jsonc", "psv"]) {
      expect(IMPORT_EXTENSIONS.has(ext)).toBe(true);
    }
    const yamlFile = join(dir, "sample.yaml");
    writeFileSync(yamlFile, "- a: 1\n  b: hello\n");
    const info = await analyzeSource(fileSource(yamlFile, "sample.yaml"));
    expect(info.settings.format).toBe("yaml");
    expect(info.columns.length).toBe(2);
  });

  test("11. Redis Multi-Format Import (JSON, CSV, YAML, TOML, XML, SQL, INI, .env, XLSX, Redis CLI)", async () => {
    // CSV with key,value
    const csvRes = await parseRedisImportPayload("key,value\ncache:a,100\ncache:b,200", { format: "csv" });
    expect(csvRes.ok).toBe(true);
    expect(csvRes.doc?.keys).toEqual([
      { key: "cache:a", type: "string", ttl: -1, value: "100" },
      { key: "cache:b", type: "string", ttl: -1, value: "200" },
    ]);

    // General tabular CSV -> Redis Hash keys per row
    const tableCsv = await parseRedisImportPayload("id,name,role\n101,Alice,admin\n102,Bob,user", {
      fileName: "users.csv",
    });
    expect(tableCsv.ok).toBe(true);
    expect(tableCsv.doc?.keys).toEqual([
      { key: "users:101", type: "hash", ttl: -1, value: { id: "101", name: "Alice", role: "admin" } },
      { key: "users:102", type: "hash", ttl: -1, value: { id: "102", name: "Bob", role: "user" } },
    ]);

    // YAML key-value map
    const yamlRes = await parseRedisImportPayload(
      `---
app:title: Bun RAD
user:profile:
  name: Ada
  role: architect
tags:
  - fast
  - native
`,
      { format: "yaml" },
    );
    expect(yamlRes.ok).toBe(true);
    expect(yamlRes.doc?.keys).toEqual([
      { key: "app:title", type: "string", ttl: -1, value: "Bun RAD" },
      { key: "user:profile", type: "hash", ttl: -1, value: { name: "Ada", role: "architect" } },
      { key: "tags", type: "list", ttl: -1, value: ["fast", "native"] },
    ]);

    // INI sections -> Redis hashes
    const iniRes = await parseRedisImportPayload("[db]\nhost=localhost\nport=5432\n", {
      format: "ini",
      keyPrefix: "cfg:",
    });
    expect(iniRes.ok).toBe(true);
    expect(iniRes.doc?.keys).toEqual([
      { key: "cfg:db", type: "hash", ttl: -1, value: { host: "localhost", port: "5432" } },
    ]);

    // Redis CLI command script
    const cliRes = await parseRedisImportPayload(`
SET session:1 "active user" EX 120
HSET profile:1 name "Grace Hopper" rank "Rear Admiral"
RPUSH queue:jobs job1 job2
SADD perms:1 read write
ZADD leaderboard 99.5 alice 88.0 bob
`);
    expect(cliRes.ok).toBe(true);
    expect(cliRes.doc?.keys.length).toBe(5);
    expect(cliRes.doc?.keys[0]).toEqual({ key: "session:1", type: "string", ttl: 120, value: "active user" });
    expect(cliRes.doc?.keys[1]).toEqual({
      key: "profile:1",
      type: "hash",
      ttl: -1,
      value: { name: "Grace Hopper", rank: "Rear Admiral" },
    });
  });
});
