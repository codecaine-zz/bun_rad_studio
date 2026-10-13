import { describe, expect, test } from "bun:test";
import { networkInterfaces } from "os";
import { join } from "path";

const APPS = ["task_manager", "fd_studio", "rip_studio"] as const;

function lanAddress(): string | undefined {
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return undefined;
}

async function readyPort(proc: ReturnType<typeof Bun.spawn>): Promise<number> {
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    const m = buffer.match(/READY:(\d+)/);
    if (m) {
      reader.releaseLock();
      return Number(m[1]);
    }
  }
  throw new Error(`no READY line, output was: ${buffer}`);
}

describe("Headless --server mode listens on the loopback interface only", () => {
  const lan = lanAddress();

  for (const app of APPS) {
    test.skipIf(!lan)(`${app} is reachable on 127.0.0.1 but not on the LAN address`, async () => {
      const port = 20000 + Math.floor(Math.random() * 20000);
      const proc = Bun.spawn(["bun", join(import.meta.dir, "..", "applications", `${app}.ts`), "--server"], {
        env: { ...process.env, PORT: String(port) },
        stdout: "pipe",
        stderr: "ignore",
      });
      try {
        const bound = await readyPort(proc);
        const local = await fetch(`http://127.0.0.1:${bound}/`);
        expect(local.status).toBeLessThan(500);
        await expect(fetch(`http://${lan}:${bound}/`, { signal: AbortSignal.timeout(3000) })).rejects.toThrow();
      } finally {
        proc.kill();
        await proc.exited;
      }
    }, 30_000);
  }
});
