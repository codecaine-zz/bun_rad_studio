import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const script = resolve(import.meta.dir, "../applications/file_manager_studio.ts");

test("the server process started by the window stops when the window's process is gone", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fm-studio-"));
  const parent = Bun.spawn([process.execPath, "-e", "setTimeout(() => {}, 3000)"], { stdout: "ignore", stderr: "ignore" });
  const child = Bun.spawn(
    [process.execPath, script, "--server", "--port", "0", "--parent-pid", String(parent.pid), "--home", dir, "--data-dir", dir],
    { stdout: "pipe", stderr: "ignore" },
  );
  try {
    const reader = child.stdout.getReader();
    let text = "";
    while (!/READY:\d+/.test(text)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    expect(text).toMatch(/READY:\d+/);
    reader.releaseLock();
    parent.kill();
    await parent.exited;
    const result = await Promise.race([child.exited, Bun.sleep(8000).then(() => "still running")]);
    expect(result).not.toBe("still running");
  } finally {
    child.kill();
    parent.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
