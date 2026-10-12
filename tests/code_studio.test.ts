import { describe, expect, test, afterAll } from "bun:test";
import {
  createCodeStudio,
  startCodeStudioServer,
  generateCodeStudioHtml,
  getCodeEditorAssetsDir,
} from "../applications/code_studio.ts";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

describe("NovaCode Studio Pro — Developer Workstation Contracts", () => {
  let server: any;
  let baseUrl: string;

  test("resolves code editor assets directory correctly", () => {
    const dir = getCodeEditorAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);
  });

  test("generates complete HTML with storage polyfill and desktop shortcuts", () => {
    const html = generateCodeStudioHtml();
    expect(html).toContain("NovaCode Studio Pro");
    expect(html).toContain("localStorage");
    expect(html).toContain("brand-logo");
    expect(html).toContain("<!DOCTYPE html>");
  });

  test("creates a valid native desktop instance", () => {
    const app = createCodeStudio({
      fullscreen: false,
      width: 1400,
      height: 900,
      workspaceRoot: process.cwd(),
    });

    expect(app.title).toContain("NovaCode Studio Pro");
    expect(app.width).toBe(1400);
    expect(app.height).toBe(900);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  test("starts server on dynamic port and answers health check", async () => {
    server = startCodeStudioServer({ port: 0, host: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${server.port}`;

    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.app).toBe("code_studio");
    expect(data.name).toContain("NovaCode Studio Pro");
    expect(data.workspaceRoot).toBeDefined();
  });

  test("serves root HTML page and favicon", async () => {
    const htmlRes = await fetch(`${baseUrl}/`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get("Content-Type")).toContain("text/html");
    const html = await htmlRes.text();
    expect(html).toContain("NovaCode Studio Pro");

    const favRes = await fetch(`${baseUrl}/favicon.svg`);
    expect(favRes.status).toBe(200);
    expect(favRes.headers.get("Content-Type")).toContain("image/svg+xml");
  });

  test("scans workspace files through /api/fs/workspace", async () => {
    const res = await fetch(`${baseUrl}/api/fs/workspace`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files.length).toBeGreaterThan(0);

    // Verify package.json is detected in workspace
    const pkg = data.files.find((f: any) => f.path === "package.json");
    expect(pkg).toBeDefined();
    expect(pkg.isDirectory).toBe(false);
  });

  test("searches workspace files with /api/fs/search", async () => {
    const res = await fetch(`${baseUrl}/api/fs/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "NovaCode Studio Pro",
        matchCase: false,
      }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.totalMatches).toBeGreaterThan(0);
    expect(data.fileCount).toBeGreaterThan(0);
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results[0].matches.length).toBeGreaterThan(0);
  });

  test("supports filesystem lifecycle: new, read, save, rename, delete", async () => {
    const testFileRel = "scratch/test_code_studio_temp.txt";
    const testFileRenamedRel = "scratch/test_code_studio_renamed.txt";

    // 1. New file
    const newRes = await fetch(`${baseUrl}/api/fs/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testFileRel, type: "file" }),
    });
    expect(newRes.status).toBe(200);
    const newData = await newRes.json();
    expect(newData.success).toBe(true);

    // 2. Save content
    const saveRes = await fetch(`${baseUrl}/api/fs/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: testFileRel,
        content: "export const NOVA_TEST = 'active';",
      }),
    });
    expect(saveRes.status).toBe(200);
    const saveData = await saveRes.json();
    expect(saveData.success).toBe(true);
    expect(saveData.size).toBeGreaterThan(0);

    // 3. Read content
    const readRes = await fetch(`${baseUrl}/api/fs/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testFileRel }),
    });
    expect(readRes.status).toBe(200);
    const readData = await readRes.json();
    expect(readData.success).toBe(true);
    expect(readData.content).toBe("export const NOVA_TEST = 'active';");

    // 4. Rename file
    const renameRes = await fetch(`${baseUrl}/api/fs/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPath: testFileRel, newPath: testFileRenamedRel }),
    });
    expect(renameRes.status).toBe(200);
    const renameData = await renameRes.json();
    expect(renameData.success).toBe(true);

    // 5. Delete file
    const delRes = await fetch(`${baseUrl}/api/fs/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: testFileRenamedRel }),
    });
    expect(delRes.status).toBe(200);
    const delData = await delRes.json();
    expect(delData.success).toBe(true);
  });

  test("executes shell commands through /api/exec", async () => {
    const res = await fetch(`${baseUrl}/api/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "echo 'NovaCode Studio Runner OK'" }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.exitCode).toBe(0);
    expect(data.stdout).toContain("NovaCode Studio Runner OK");
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
  });

  afterAll(() => {
    try {
      server?.stop();
    } catch {}
  });
});
