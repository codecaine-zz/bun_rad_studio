import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { EMBEDDED_APPS, alternateOrigin, startFileManagerServer } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-embed-"));
const TOKEN = "embed-token";
let server: ReturnType<typeof startFileManagerServer>;
let port = 0;

beforeAll(() => {
  mkdirSync(join(root, "home"));
  server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home: join(root, "home"), dataDir: join(root, "data") } });
  port = server.port!;
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

// Asking for the other spelling of the address: the server sees a Host of localhost:PORT, like a browser frame would.
const asAlt = (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { Host: `localhost:${port}`, ...(init.headers ?? {}) } });
const asMain = (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${port}${path}`, init);

describe("alternateOrigin", () => {
  test("swaps 127.0.0.1 and localhost and keeps the port", () => {
    expect(alternateOrigin("127.0.0.1:4000")).toBe("http://localhost:4000");
    expect(alternateOrigin("localhost:4000")).toBe("http://127.0.0.1:4000");
    expect(alternateOrigin("LOCALHOST")).toBe("http://127.0.0.1");
    expect(alternateOrigin("evil.example:80")).toBeNull();
  });
});

describe("the page lets the frames in, and only them", () => {
  test("its policy names the other origin as the only frame source", async () => {
    const csp = (await asMain("/")).headers.get("content-security-policy")!;
    expect(csp).toContain(`frame-src http://localhost:${port}`);
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("embedded apps", () => {
  test("the calculator and the timer are served with their own policy and the page hides its hub links", async () => {
    for (const id of ["calc", "timer"]) {
      const res = await asAlt(`/app/${id}/`);
      expect(res.status, id).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      const csp = res.headers.get("content-security-policy")!;
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      // Only the graphing calculator turns typed formulas into functions.
      expect(csp.includes("'unsafe-eval'"), id).toBe(id === "calc");
      expect(csp).toContain(`frame-ancestors http://127.0.0.1:${port} http://localhost:${port}`);
      expect(csp).toContain("form-action 'none'");
      expect(csp).toContain("connect-src 'self'");
      const html = await res.text();
      expect(html).toContain("display:none!important");
      expect(html.length).toBeGreaterThan(50_000);
      expect(html).not.toContain(TOKEN);
    }
  });

  test("each app may reach only the sites it needs", () => {
    expect(EMBEDDED_APPS.calc!.script).toEqual(["https://cdn.jsdelivr.net"]);
    // The timer only links to YouTube; nothing from YouTube runs or is framed inside it.
    expect(EMBEDDED_APPS.timer!.frame).toEqual([]);
    expect(EMBEDDED_APPS.timer!.script.join(" ")).not.toContain("youtube");
    for (const app of Object.values(EMBEDDED_APPS)) for (const list of [app.script, app.style, app.font, app.img, app.frame, app.connect]) for (const origin of list) expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+$/);
  });

  test("their own files load, and unknown or odd paths do not", async () => {
    expect((await asAlt("/app/calc/app.js")).status).toBe(200);
    expect((await asAlt("/app/calc/styles.css")).headers.get("content-type")).toContain("text/css");
    expect((await asAlt("/app/calc/intuitionlab/index.html")).status).toBe(200);
    for (const bad of ["/app/calc/../../package.json", "/app/calc/%2e%2e/%2e%2e/package.json", "/app/calc/..%2f..%2fpackage.json", "/app/calc/a%00b.js", "/app/calc/sw.js.map", "/app/calc/nope.js", "/app/nothing/", "/app/Calc/", "/app/calc/app.js%5c..%5c..", "/app/calc//etc/passwd"]) {
      const res = await asAlt(bad);
      expect(res.status, bad).toBe(404);
      expect(await res.text()).not.toContain("\"name\": \"bun");
    }
  });

  test("only GET is allowed", async () => {
    expect((await asAlt("/app/calc/", { method: "POST" })).status).toBe(405);
  });

  test("the timer's playlist question is answered from its own file", async () => {
    const res = await asAlt("/app/timer/index.html?action=sync_codecaine_playlist");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.tracks)).toBe(true);
    expect(data.count).toBe(data.tracks.length);
  });

  test("a page on the other origin can't get the File Manager, its token or its API", async () => {
    for (const path of ["/", "/index.html", "/api/health", "/ui/main.js", "/vendor/xterm.mjs", "/api/raw?path=/etc/hosts&token=x", "/api/terminal"]) {
      const res = await asAlt(path);
      expect(res.status, path).toBe(404);
      expect(await res.text()).not.toContain(TOKEN);
    }
    const post = await asAlt("/api/places", { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: "{}" });
    expect(post.status).toBe(404);
  });

  test("the File Manager itself still works on its own address", async () => {
    expect((await asMain("/")).status).toBe(200);
    expect((await asMain("/api/health")).status).toBe(200);
  });

  test("foreign Host headers are still refused", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/app/calc/`, { headers: { Host: "evil.example" } });
    expect(res.status).toBe(403);
  });
});
