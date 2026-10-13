import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const dir = mkdtempSync(join(tmpdir(), "studio-mount-"));
process.env.STUDIO_DB_PROFILE_DIR = dir;
process.env.STUDIO_MACRO_STORE_DIR = join(dir, "macros");

const { startSqliteStudioServer } = await import("../../applications/sqlite_studio_server.ts");
const { generateSqliteStudioHtml } = await import("../../applications/sqlite_studio.ts");
const { generateMysqlStudioHtml } = await import("../../applications/mysql_studio.ts");
const { generatePostgresStudioHtml } = await import("../../applications/postgres_studio.ts");

describe("workbench mounted in the existing studios", () => {
  const server = startSqliteStudioServer({ port: 0, initialDbPath: ":memory:" });
  const base = `http://127.0.0.1:${server.port}`;
  afterAll(() => {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves /workbench and a token-protected /api/v2 next to the legacy API", async () => {
    const page = await fetch(base + "/workbench");
    expect(page.status).toBe(200);
    const token = /name="wb-token" content="([0-9a-f]+)"/.exec(await page.text())?.[1];
    expect(token).toBeTruthy();
    expect((await fetch(base + "/api/v2/profiles")).status).toBe(403);
    const ok = await fetch(base + "/api/v2/profiles", { headers: { "x-workbench-token": token! } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).ok).toBe(true);
    // legacy routes are unaffected
    expect((await fetch(base + "/api/schema")).status).toBe(200);
  });

  it("legacy studios no longer keep passwords in the browser's localStorage", () => {
    expect(generateMysqlStudioHtml()).not.toMatch(/user: cfg\.user,\s*password: cfg\.password/);
    expect(generateMysqlStudioHtml()).toContain("delete p.password");
    expect(generatePostgresStudioHtml()).toContain('new RegExp("//[^@/]*@")');
  });

  it("legacy studios link to the workbench", () => {
    for (const html of [generateSqliteStudioHtml(), generateMysqlStudioHtml(), generatePostgresStudioHtml()]) {
      expect(html).toContain('id="openWorkbench"');
      expect(html).toContain('href="/workbench"');
    }
  });
});
