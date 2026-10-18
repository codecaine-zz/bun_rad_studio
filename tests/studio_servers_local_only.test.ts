import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { startBalatroServer } from "../applications/balatro_studio.ts";
import { startIntervalTimerStudioServer } from "../applications/interval_timer_studio.ts";
import { startMazeStudioServer } from "../applications/maze_generator_studio.ts";
import { startMediaPlayerStudioServer } from "../applications/media_player_studio.ts";

const APPS_DIR = join(import.meta.dir, "..", "applications");

describe("Every studio HTTP server is local-only (static rules)", () => {
  const sources = [
    ...readdirSync(APPS_DIR)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({ file: f, text: readFileSync(join(APPS_DIR, f), "utf8") })),
    // The shared server that most game studios delegate to.
    { file: "../src/studio_server.ts", text: readFileSync(join(import.meta.dir, "..", "src", "studio_server.ts"), "utf8") },
  ];
  const delegating = sources.filter((s) => s.text.includes("startStaticStudioServer("));
  const withServer = sources.filter((s) => /\bBun\.serve\(\{/.test(s.text));

  test("the scan finds the servers", () => {
    // Files with their own Bun.serve plus the studios that use the shared server.
    expect(withServer.length + delegating.length - 1).toBeGreaterThan(30);
    expect(delegating.length).toBeGreaterThan(10);
    expect(withServer.some((s) => s.file === "../src/studio_server.ts")).toBe(true);
  });

  test("every file that starts a Bun.serve server uses guardLocalRequest", () => {
    // A call, not just an import: an unused import must not satisfy the rule.
    const unguarded = withServer.filter((s) => !/guardLocalRequest\(/.test(s.text)).map((s) => s.file);
    expect(unguarded).toEqual([]);
  });

  test("no file binds a server to all network interfaces", () => {
    const open = sources.filter((s) => /["']0\.0\.0\.0["']/.test(s.text.replace(/command: "vite[^"]*"/g, ""))).map((s) => s.file);
    expect(open).toEqual([]);
  });
});

describe("Every Bun.serve call names the interface it listens on", () => {
  // Without `hostname`, Bun listens on all network interfaces. Port probes count too.
  function filesUnder(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : filesUnder(full);
      return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [full] : [];
    });
  }
  const root = join(import.meta.dir, "..");
  const missing: string[] = [];
  let calls = 0;
  for (const file of [...filesUnder(join(root, "applications")), ...filesUnder(join(root, "src"))]) {
    const text = readFileSync(file, "utf8");
    for (let i = text.indexOf("Bun.serve"); i >= 0; i = text.indexOf("Bun.serve", i + 1)) {
      const open = text.indexOf("(", i);
      const between = open >= 0 ? text.slice(i + "Bun.serve".length, open) : "";
      if (open < 0 || open - i > 70 || !/^\s*(?:<[^>()]+>)?\s*$/.test(between)) continue; // `Bun.serve<T>(` is matched; prose is skipped
      let depth = 0;
      let j = open;
      for (; j < text.length; j++) {
        if (text[j] === "(") depth++;
        else if (text[j] === ")" && --depth === 0) break;
      }
      calls++;
      if (!/\bhostname\b|\bhost\b/.test(text.slice(open, j + 1))) missing.push(`${file.slice(root.length + 1)}:${text.slice(0, i).split("\n").length}`);
    }
  }

  test("the scan finds the calls", () => {
    expect(calls).toBeGreaterThanOrEqual(28);
  });

  test("none is missing a hostname", () => {
    expect(missing).toEqual([]);
  });
});

describe("Game and tool servers refuse other web pages", () => {
  const cases: Array<[string, () => { port: number; stop: (force?: boolean) => void }]> = [
    ["balatro", () => startBalatroServer({ port: 0, host: "127.0.0.1" }) as any],
    ["interval timer", () => startIntervalTimerStudioServer({ port: 0, host: "127.0.0.1" }) as any],
    ["maze generator", () => startMazeStudioServer({ port: 0, host: "127.0.0.1" }) as any],
    ["media player", () => {
      const s = startMediaPlayerStudioServer({ port: 0, host: "127.0.0.1" });
      return { port: s.port, stop: (force?: boolean) => s.server.stop(force) };
    }],
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
