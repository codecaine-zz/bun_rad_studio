import { describe, it, expect, afterAll } from "bun:test";
import { startPostgresStudioServer } from "../applications/postgres_studio_server.ts";
import { generatePostgresStudioHtml, createPostgresStudio } from "../applications/postgres_studio.ts";
import { provisionTestDb } from "./helpers/testdb.ts";

// Runs against a throwaway database (TEST_PG_URL); skipped when it is not configured.
const testDb = await provisionTestDb("postgres");
const suite = testDb ? describe : describe.skip;

suite("🐘 Postgres Studio Pro - Workstation & Server Diagnostics Suite", () => {
  const server = testDb ? startPostgresStudioServer({ port: 0, config: testDb.config }) : (null as any);
  const baseUrl = `http://127.0.0.1:${server?.port}`;

  afterAll(async () => {
    try {
      server?.stop(true);
    } catch {}
    await testDb?.drop();
  });

  it("1. GET / serves complete Postgres Studio HTML with advanced PostgreSQL capabilities", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // Verify Brand & PostgreSQL Aesthetics
    expect(html).toContain("Postgres Studio Pro");
    expect(html).toContain("🐘");
    expect(html).toContain("--pg-blue: #336791");

    // Verify Advanced PostgreSQL Tabs
    expect(html).toContain("tabBtnExtensions");
    expect(html).toContain("Extensions Manager");
    expect(html).toContain("tabBtnActivity");
    expect(html).toContain("Live Activity Monitor");
    expect(html).toContain("tabBtnExplain");
    expect(html).toContain("EXPLAIN");

    // Verify Schema Switcher & Materialized Views Elements
    expect(html).toContain("schemaSelect");
    expect(html).toContain("sidebarMatViewsList");
    expect(html).toContain("Materialized Views");
    expect(html).toContain("refreshMatView");

    // Verify Access-style Visual Designer & FULL OUTER JOIN support
    expect(html).toContain("FULL OUTER JOIN (Postgres Native)");
    expect(html).toContain("qbe-viewport");
    expect(html).toContain("qbe-canvas-stage");
    expect(html).toContain("autoJoinDesignerTables");

    // Verify Connection Workbench Modal
    expect(html).toContain("connModal");
    expect(html).toContain("cfgHost");
    expect(html).toContain("cfgPort");
    expect(html).toContain("cfgSchema");
    expect(html).toContain("cfgTls");
    expect(html).toContain("testManualConnection");
    expect(html).toContain("resetToEnvConfig");
  });

  it("2. GET /api/config returns sanitized connection details without exposing raw password", async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.config).toBeDefined();
    expect(body.config.host).toBe(testDb!.config.host);
    expect(body.config.port).toBe(testDb!.config.port);
    expect(body.config.user).toBe(testDb!.config.user);
    expect(body.config.database).toBe(testDb!.name);
    expect(body.config.schema).toBe("public");
    expect(typeof body.config.hasPassword).toBe("boolean");
    expect(body.config.password).toBeUndefined(); // Raw password must not be exposed
    expect(body.config.source).toBe("manual");
  });

  it("3. POST /api/test-config performs safe non-destructive credential verification", async () => {
    const testPayload = {
      host: "127.0.0.1",
      port: 5432,
      user: "root",
      password: "invalid_non_existent_password_xyz987",
      database: "mydb",
      schema: "public",
    };

    const res = await fetch(`${baseUrl}/api/test-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toBeDefined();
    // In environments with invalid credentials, it returns an explicit error
    if (!body.success) {
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    } else {
      expect(body.version).toBeDefined();
      expect(typeof body.latencyMs).toBe("number");
    }
  });

  it("4. POST /api/config with resetToEnv restores environment configuration", async () => {
    const res = await fetch(`${baseUrl}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetToEnv: true }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.config).toBeDefined();
    expect(body.config.source).toBe("env");
  });

  it("5. POST /api/create-database validates database names and rejects unsafe characters", async () => {
    // Rejects invalid characters like quotes, backticks, spaces, or semicolons
    const unsafeRes = await fetch(`${baseUrl}/api/create-database`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "drop database; --" }),
    });
    expect(unsafeRes.status).toBe(400);
    const unsafeBody = (await unsafeRes.json()) as any;
    expect(unsafeBody.success).toBe(false);
    expect(unsafeBody.error).toContain("Invalid database name");

    // Empty name rejected
    const emptyRes = await fetch(`${baseUrl}/api/create-database`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(emptyRes.status).toBe(400);
  });

  it("6. GET /api/schemas returns list of PostgreSQL schemas", async () => {
    const res = await fetch(`${baseUrl}/api/schemas`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.schemas)).toBe(true);
    expect(body.schemas).toContain("public");
    expect(body.activeSchema).toBe("public");
  });

  it("7. GET /api/extensions returns available PostgreSQL extensions catalog", async () => {
    const res = await fetch(`${baseUrl}/api/extensions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.extensions)).toBe(true);
    if (body.extensions.length > 0) {
      const ext = body.extensions[0];
      expect(ext.name).toBeDefined();
      expect(typeof ext.isInstalled).toBe("boolean");
    }
  });

  it("8. GET /api/activity returns active PostgreSQL cluster processes from pg_stat_activity", async () => {
    const res = await fetch(`${baseUrl}/api/activity`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.activity)).toBe(true);
    if (body.activity.length > 0) {
      const p = body.activity[0];
      expect(typeof p.pid).toBe("number");
      expect(p.state).toBeDefined();
    }
  });

  it("9. POST /api/vacuum runs PostgreSQL maintenance without failure", async () => {
    const res = await fetch(`${baseUrl}/api/vacuum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full: false, analyze: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.details).toContain("VACUUM");
  });

  it("10. GET /api/workspace-databases lists PostgreSQL cluster databases", async () => {
    const res = await fetch(`${baseUrl}/api/workspace-databases`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.databases)).toBe(true);
    const dbPaths = body.databases.map((d: any) => d.path);
    expect(dbPaths).toContain(testDb!.name);
  });

  it("11. createPostgresStudio factory initializes proper defaults and window dimensions", () => {
    const app = createPostgresStudio({
      fullscreen: false,
      width: 1400,
      height: 950,
      initialDbPath: testDb!.name,
      initialSchema: "public",
    });

    expect(app.title).toContain("Postgres Studio Pro");
    expect(app.width).toBe(1400);
    expect(app.height).toBe(950);
    expect(app.fullscreen).toBe(false);
    expect(app.activeDbPath).toBe(testDb!.name);
    expect(app.activeSchema).toBe("public");
    expect(typeof app.run).toBe("function");
    expect(typeof app.generateHtml).toBe("function");

    const html = app.generateHtml();
    expect(html).toContain("Postgres Studio Pro");
  });

  it("12. POST /api/seed-sample creates rich PostgreSQL sample dataset (customers, products, orders, views, matviews)", async () => {
    const res = await fetch(`${baseUrl}/api/seed-sample`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);

    // Verify schema reflects seeded objects
    const schemaRes = await fetch(`${baseUrl}/api/schema`);
    expect(schemaRes.status).toBe(200);
    const schema = (await schemaRes.json()) as any;
    expect(schema.success).toBe(true);
    expect(schema.tables.some((t: any) => t.name === "customers")).toBe(true);
    expect(schema.tables.some((t: any) => t.name === "products")).toBe(true);
    expect(schema.tables.some((t: any) => t.name === "orders")).toBe(true);
    expect(schema.views.some((v: any) => v.name === "v_customer_order_summary")).toBe(true);
    expect(schema.matviews.some((m: any) => m.name === "mv_daily_sales_analytics")).toBe(true);
  });
});
