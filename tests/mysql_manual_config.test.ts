import { describe, it, expect, afterAll } from "bun:test";
import { startMysqlStudioServer } from "../applications/mysql_studio_server.ts";
import { generateMysqlStudioHtml, createMysqlStudio } from "../applications/mysql_studio.ts";

describe("🔌 MySQL Manual Connection Configuration & Workbench Suite", () => {
  const server = startMysqlStudioServer({
    port: 0,
    config: {
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      database: "test_db",
    },
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;

  afterAll(() => {
    try {
      server.stop(true);
    } catch {}
  });

  it("1. GET /api/config returns sanitized connection details without exposing raw password", async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.config).toBeDefined();
    expect(body.config.host).toBe("127.0.0.1");
    expect(body.config.port).toBe(3306);
    expect(body.config.user).toBe("root");
    expect(body.config.database).toBe("test_db");
    expect(typeof body.config.hasPassword).toBe("boolean");
    expect(body.config.password).toBeUndefined(); // Raw password must not be exposed over GET
    expect(body.config.source).toBe("manual");
  });

  it("2. POST /api/test-config performs safe non-destructive credential verification", async () => {
    const testPayload = {
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      password: "non_existent_fake_password_12345",
      database: "test_db",
    };

    const res = await fetch(`${baseUrl}/api/test-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toBeDefined();
    // In environments without a live MySQL instance or with invalid credentials, it returns an explicit error
    if (!body.success) {
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    } else {
      expect(body.version).toBeDefined();
      expect(typeof body.latencyMs).toBe("number");
    }
  });

  it("3. POST /api/config with resetToEnv restores environment configuration", async () => {
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

  it("4. POST /api/create-database validates database names and rejects unsafe characters", async () => {
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

  it("5. MySQL Studio HTML contains all manual connection controls, tabs, and presets", () => {
    const html = generateMysqlStudioHtml();

    // Modal shell and tabs
    expect(html).toContain('id="dbBrowserModal"');
    expect(html).toContain('id="connSourceBadge"');
    expect(html).toContain('id="btnConnTabConfig"');
    expect(html).toContain('id="btnConnTabDatabases"');
    expect(html).toContain('id="btnConnTabProfiles"');
    expect(html).toContain('id="connPanelConfig"');
    expect(html).toContain('id="connPanelDatabases"');
    expect(html).toContain('id="connPanelProfiles"');

    // Input mode switchers
    expect(html).toContain('id="btnModeForm"');
    expect(html).toContain('id="btnModeUrl"');
    expect(html).toContain('id="connModeFormContainer"');
    expect(html).toContain('id="connModeUrlContainer"');

    // Form inputs
    expect(html).toContain('id="cfgHost"');
    expect(html).toContain('id="cfgPort"');
    expect(html).toContain('id="cfgUser"');
    expect(html).toContain('id="cfgPass"');
    expect(html).toContain('id="cfgDb"');
    expect(html).toContain('id="cfgTls"');
    expect(html).toContain('id="cfgUrl"');

    // Preset buttons and actions
    expect(html).toContain("applyConnPreset('localhost')");
    expect(html).toContain("applyConnPreset('docker')");
    expect(html).toContain("applyConnPreset('alt_port')");
    expect(html).toContain("applyConnPreset('rds')");
    expect(html).toContain("resetToEnvConfig()");
    expect(html).toContain("testManualConnection()");
    expect(html).toContain("applyManualConnection()");
    expect(html).toContain("promptSaveProfile()");
    expect(html).toContain("handleCreateDatabase()");

    // Header & Sidebar launcher buttons
    expect(html).toContain("openDatabaseDialog('config')");
    expect(html).toContain("openDatabaseDialog('databases')");
    expect(html).toContain("🔌 Connection Config...");
    expect(html).toContain("📂 Databases...");
  });

  it("6. Embedded client scripts compile with zero syntax errors", () => {
    const html = generateMysqlStudioHtml();
    const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match;
    let count = 0;

    while ((match = scriptRegex.exec(html)) !== null) {
      const code = match[1];
      count++;
      expect(() => new Function(code)).not.toThrow();
    }

    expect(count).toBeGreaterThan(0);
  });

  it("7. Connection URL parsing and serialization round-trip logic", () => {
    // Parse URL into connection components
    const parseUrl = (urlStr: string) => {
      const normalized = urlStr.trim().replace(/^mysql:\/\//i, "http://");
      const dummyUrl = new URL(normalized);
      const host = dummyUrl.hostname || "127.0.0.1";
      const port = dummyUrl.port ? parseInt(dummyUrl.port, 10) : 3306;
      const user = decodeURIComponent(dummyUrl.username || "");
      const pass = decodeURIComponent(dummyUrl.password || "");
      let db = dummyUrl.pathname ? dummyUrl.pathname.replace(/^\//, "") : "";
      db = decodeURIComponent(db);
      const tls = dummyUrl.searchParams.get("tls") === "true" || dummyUrl.searchParams.get("ssl") === "true";
      return { host, port, user, pass, db, tls };
    };

    // Serialize connection components into URL
    const serializeUrl = (c: { host: string; port: number; user?: string; pass?: string; db?: string; tls?: boolean }) => {
      let auth = "";
      if (c.user) {
        auth = encodeURIComponent(c.user);
        if (c.pass) auth += ":" + encodeURIComponent(c.pass);
        auth += "@";
      }
      let url = `mysql://${auth}${c.host}:${c.port}`;
      if (c.db) url += `/${encodeURIComponent(c.db)}`;
      if (c.tls) url += `?tls=true`;
      return url;
    };

    const parsed = parseUrl("mysql://app_user:p%40ssw%3Ard@10.0.0.5:3307/ecommerce_db?tls=true");
    expect(parsed.host).toBe("10.0.0.5");
    expect(parsed.port).toBe(3307);
    expect(parsed.user).toBe("app_user");
    expect(parsed.pass).toBe("p@ssw:rd");
    expect(parsed.db).toBe("ecommerce_db");
    expect(parsed.tls).toBe(true);

    const serialized = serializeUrl(parsed);
    expect(serialized).toBe("mysql://app_user:p%40ssw%3Ard@10.0.0.5:3307/ecommerce_db?tls=true");
  });

  it("8. Programmatic creation via createMysqlStudio accepts manual connection options", () => {
    const app = createMysqlStudio({
      host: "db.staging.internal",
      mysqlPort: 3308,
      user: "devops",
      password: "secretpassword",
      database: "staging_data",
      tls: true,
      fullscreen: false,
    });

    expect(app.title).toContain("MySQL Studio Pro");
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });
});
