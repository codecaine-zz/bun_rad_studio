import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startStaticStudioServer } from "../src/studio_server.ts";

describe("shared static studio server", () => {
  let root: string;
  let assets: string;
  let server: ReturnType<typeof startStaticStudioServer>;
  let base: string;
  let renders = 0;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "studio-server-"));
    assets = join(root, "assets");
    mkdirSync(join(assets, "sub"), { recursive: true });
    writeFileSync(join(assets, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
    writeFileSync(join(assets, "game.js"), "console.log('game');");
    writeFileSync(join(assets, "sub", "data.txt"), "nested");
    writeFileSync(join(root, "secret.txt"), "outside the assets folder");
    server = startStaticStudioServer({
      app: "sample_studio",
      name: "Sample Studio",
      version: "9.9.9",
      assetsDir: assets,
      generateHtml: () => `<!DOCTYPE html><title>Sample</title><p>render ${++renders}</p>`,
    });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
    rmSync(root, { recursive: true, force: true });
  });

  test("serves the generated page on / and /index.html, rendering it per request", async () => {
    const a = await fetch(`${base}/`);
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toContain("text/html");
    const first = await a.text();
    const b = await (await fetch(`${base}/index.html`)).text();
    expect(first).toContain("render ");
    expect(b).not.toBe(first);
  });

  test("health reports the configured identity", async () => {
    const body = (await (await fetch(`${base}/api/health`)).json()) as any;
    expect(body).toMatchObject({ status: "ok", app: "sample_studio", name: "Sample Studio", version: "9.9.9" });
    expect(typeof body.timestamp).toBe("number");
  });

  test("serves the favicon and other files from the assets folder, including nested ones", async () => {
    const icon = await fetch(`${base}/favicon.svg`);
    expect(icon.headers.get("content-type")).toBe("image/svg+xml");
    expect(await (await fetch(`${base}/game.js`)).text()).toContain("game");
    expect(await (await fetch(`${base}/sub/data.txt`)).text()).toBe("nested");
  });

  test("answers 404 for a missing file", async () => {
    expect((await fetch(`${base}/nope.txt`)).status).toBe(404);
  });

  test("never serves a file from outside the assets folder, even for raw traversal requests", async () => {
    // fetch() normalizes ".." before sending, so write the request line ourselves.
    const raw = (path: string) =>
      new Promise<string>((resolve) => {
        let out = "";
        Bun.connect({
          hostname: "127.0.0.1",
          port: server.port!,
          socket: {
            open(socket) {
              socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nConnection: close\r\n\r\n`);
            },
            data(_socket, chunk) {
              out += chunk.toString();
            },
            close() {
              resolve(out);
            },
            error() {
              resolve(out);
            },
          },
        });
      });
    for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/sub/../../secret.txt", "/..%2fsecret.txt"]) {
      const response = await raw(path);
      expect(response.startsWith("HTTP/1.1"), path).toBe(true);
      expect(response, path).not.toContain("outside the assets folder");
    }
  });

  test("refuses foreign origins and hosts with 403, and allows its own origin", async () => {
    expect((await fetch(`${base}/api/health`, { headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${base}/api/health`, { headers: { Host: "attacker.example" } })).status).toBe(403);
    expect((await fetch(`${base}/api/health`, { headers: { Origin: base } })).status).toBe(200);
  });

  test("answers OPTIONS without a body", async () => {
    const r = await fetch(`${base}/`, { method: "OPTIONS" });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("");
  });

  test("binds to loopback by default and honours an explicit port 0", () => {
    expect(server.hostname).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
  });
});
