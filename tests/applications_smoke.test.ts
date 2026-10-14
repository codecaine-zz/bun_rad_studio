import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { NON_APP_MODULES } from "../applications/launcher_studio.ts";
import { isHeadless } from "../scripts/app_status.ts";

const ROOT = join(import.meta.dir, "..");
const APPS_DIR = join(ROOT, "applications");

const SKIPPED_SUFFIXES = ["_server", "_crud", "_engine", "_ops"];
const appFiles = readdirSync(APPS_DIR)
  .filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"))
  .filter((f) => !NON_APP_MODULES.has(f) && f !== "launcher_studio.ts")
  .filter((f) => !SKIPPED_SUFFIXES.some((s) => f.replace(/\.(ts|js)$/, "").endsWith(s)));

// Servers announce themselves with "READY:<port>" or "... server running at: http://127.0.0.1:<port>/".
const ANNOUNCE = /READY:(\d+)|running at:? http:\/\/127\.0\.0\.1:(\d+)/;
const headless = appFiles.filter((f) => isHeadless(readFileSync(join(APPS_DIR, f), "utf8")));

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

describe("every application module loads", () => {
  test("the scan finds the applications", () => {
    expect(appFiles.length).toBeGreaterThan(60);
  });

  test("importing each one in a fresh process neither throws nor opens a window", async () => {
    const failures: string[] = [];
    await inBatches(appFiles, 8, async (file) => {
      const proc = Bun.spawn([process.execPath, "-e", `await import(${JSON.stringify(join(APPS_DIR, file))}); console.log("IMPORTED");`], {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
      const timer = setTimeout(() => proc.kill(), 30_000);
      const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      clearTimeout(timer);
      const code = await proc.exited;
      if (code !== 0 || !out.includes("IMPORTED")) failures.push(`${file}: exit ${code} ${(err || out).split("\n")[0]}`);
    });
    expect(failures).toEqual([]);
  }, 180_000);
});

describe("headless mode (--server)", () => {
  test("the scan finds the headless applications", () => {
    expect(headless.length).toBeGreaterThan(25);
  });

  test("each starts, announces a port and serves its page", async () => {
    const failures: string[] = [];
    await inBatches(headless, 6, async (file) => {
      const proc = Bun.spawn([process.execPath, join(APPS_DIR, file), "--server", "--port", "0"], {
        cwd: ROOT,
        env: { ...process.env, SERVER_MODE: "1", PORT: "0" },
        stdout: "pipe",
        stderr: "pipe",
      });
      try {
        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let port = 0;
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline && !port) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value);
          const m = ANNOUNCE.exec(buffer);
          if (m) port = Number(m[1] ?? m[2]);
        }
        if (!port) {
          failures.push(`${file}: no port announced (${buffer.split("\n")[0] ?? ""})`);
          return;
        }
        const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5000) });
        if (res.status !== 200) failures.push(`${file}: GET / returned ${res.status}`);
        else if (!(res.headers.get("content-type") ?? "").includes("text/html")) failures.push(`${file}: GET / is not HTML`);
      } catch (e: any) {
        failures.push(`${file}: ${e.message}`);
      } finally {
        proc.kill();
        await proc.exited;
      }
    });
    expect(failures).toEqual([]);
  }, 180_000);
});
