import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { startBalatroServer } from "../applications/balatro_studio.ts";
import { startIntervalTimerStudioServer } from "../applications/interval_timer_studio.ts";
import { startMazeStudioServer } from "../applications/maze_generator_studio.ts";

const APPS_DIR = join(import.meta.dir, "..", "applications");

describe("Every studio HTTP server is local-only (static rules)", () => {
  const sources = readdirSync(APPS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: f, text: readFileSync(join(APPS_DIR, f), "utf8") }));
  const withServer = sources.filter((s) => /\bBun\.serve\(\{/.test(s.text));

  test("the scan finds the servers", () => {
    expect(withServer.length).toBeGreaterThan(30);
  });

  test("every file that starts a Bun.serve server uses guardLocalRequest", () => {
    const unguarded = withServer.filter((s) => !s.text.includes("guardLocalRequest")).map((s) => s.file);
    expect(unguarded).toEqual([]);
  });

  test("no file binds a server to all network interfaces", () => {
    const open = sources.filter((s) => /["']0\.0\.0\.0["']/.test(s.text.replace(/command: "vite[^"]*"/g, ""))).map((s) => s.file);
    expect(open).toEqual([]);
  });
});

describe("Game and tool servers refuse other web pages", () => {
  const cases: Array<[string, () => { port: number; stop: (force?: boolean) => void }]> = [
    ["balatro", () => startBalatroServer({ port: 0, host: "127.0.0.1" }) as any],
    ["interval timer", () => startIntervalTimerStudioServer({ port: 0, host: "127.0.0.1" }) as any],
    ["maze generator", () => startMazeStudioServer({ port: 0, host: "127.0.0.1" }) as any],
  ];

  for (const [name, start] of cases) {
    test(`${name}: foreign Origin and foreign Host get 403; own origin and plain requests work`, async () => {
      const server = start();
      const base = `http://127.0.0.1:${server.port}`;
      try {
        const foreignOrigin = await fetch(`${base}/api/health`, { headers: { Origin: "https://evil.example" } });
        expect(foreignOrigin.status).toBe(403);
        const foreignHost = await fetch(`${base}/api/health`, { headers: { Host: "attacker.example" } });
        expect(foreignHost.status).toBe(403);
        const ownOrigin = await fetch(`${base}/`, { headers: { Origin: base } });
        expect(ownOrigin.status).toBe(200);
        const plain = await fetch(`${base}/`);
        expect(plain.status).toBe(200);
      } finally {
        server.stop(true);
      }
    });
  }

  test("maze generator: a cross-origin page cannot overwrite the saved state", async () => {
    const server = startMazeStudioServer({ port: 0, host: "127.0.0.1" }) as any;
    const base = `http://127.0.0.1:${server.port}`;
    try {
      const res = await fetch(`${base}/api/state`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", Origin: "https://evil.example" },
        body: JSON.stringify({ pwned: true }),
      });
      expect(res.status).toBe(403);
    } finally {
      server.stop(true);
    }
  });
});
