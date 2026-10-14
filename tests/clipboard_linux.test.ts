import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// On Linux, `xclip` and `wl-copy` keep a background process alive to serve the clipboard, and that process
// keeps the caller's output pipes open. A synchronous spawn that captures output then waits for it (until the
// clipboard changes). The fakes below reproduce that on any platform.
const dirs: string[] = [];
const realPath = process.env.PATH;
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function fakeClipboardTools() {
  const dir = mkdtempSync(join(tmpdir(), "fake-clip-"));
  dirs.push(dir);
  const sink = join(dir, "received.txt");
  // wl-copy is absent or failing on a typical X11 machine, so the code falls through to xclip.
  writeFileSync(join(dir, "wl-copy"), "#!/bin/sh\nexit 1\n");
  writeFileSync(join(dir, "xclip"), `#!/bin/sh\ncat > ${JSON.stringify(sink)}\n( sleep 8 ) &\nexit 0\n`);
  chmodSync(join(dir, "wl-copy"), 0o755);
  chmodSync(join(dir, "xclip"), 0o755);
  return { dir, sink };
}

describe("writeClipboardSync on Linux", () => {
  test.skipIf(process.platform === "win32")("does not wait for the clipboard-serving background process that xclip leaves behind", () => {
    const { dir, sink } = fakeClipboardTools();
    // A fresh process, started with the fakes already on PATH and pretending to be Linux.
    const script = `
      Object.defineProperty(process, "platform", { value: "linux" });
      const { writeClipboardSync } = await import(${JSON.stringify(join(import.meta.dir, "..", "src", "localGuard.ts"))});
      const started = Date.now();
      const ok = writeClipboardSync("hello clipboard");
      console.log(JSON.stringify({ ok, elapsed: Date.now() - started }));
    `;
    const r = Bun.spawnSync([process.execPath, "-e", script], { env: { ...process.env, PATH: `${dir}:${realPath}` }, stdout: "pipe", stderr: "pipe" });
    const result = JSON.parse(r.stdout.toString().trim().split("\n").pop()!);
    expect(result.ok).toBe(true);
    expect(readFileSync(sink, "utf8")).toBe("hello clipboard");
    expect(result.elapsed).toBeLessThan(3000);
  }, 30_000);
});
