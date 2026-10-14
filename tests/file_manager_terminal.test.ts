import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { clampSize, createTerminalHub, pickShell, shellFolder, terminalSupported } from "../src/features/filemanager/fmTerminal";

// A terminal needs a pseudo-terminal, which exists on macOS and Linux only.
const posix = process.platform !== "win32";
const suite = posix ? describe : describe.skip;

const root = mkdtempSync(join(tmpdir(), "fm-term-"));
const home = join(root, "home");
const work = join(root, "work with spaces");
const TOKEN = "term-token-123";
let server: ReturnType<typeof startFileManagerServer>;
let base: string;

beforeAll(() => {
  mkdirSync(home);
  mkdirSync(work);
  server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home, dataDir: join(root, "data"), launch: async () => {} } });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

interface Client {
  ws: WebSocket;
  messages: any[];
  text: () => string;
  waitFor: (pattern: RegExp, ms?: number) => Promise<string>;
  closed: Promise<void>;
}

function connect(query: Record<string, string>, origin = base): Promise<Client> {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams(query).toString();
    const ws = new (WebSocket as any)(`ws://127.0.0.1:${server.port}/api/terminal?${q}`, { headers: { Origin: origin } }) as WebSocket;
    const messages: any[] = [];
    let closeNow: () => void = () => {};
    const closed = new Promise<void>((r) => (closeNow = r));
    const text = () => messages.filter((m) => m.type === "output").map((m) => m.data).join("");
    ws.onmessage = (e) => messages.push(JSON.parse(String(e.data)));
    ws.onclose = () => closeNow();
    ws.onerror = () => reject(new Error("The connection was refused"));
    ws.onopen = () => resolve({
      ws, messages, text, closed,
      waitFor: async (pattern, ms = 8000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          if (pattern.test(text())) return text();
          await Bun.sleep(25);
        }
        throw new Error(`Timed out waiting for ${pattern}. Got: ${JSON.stringify(text().slice(-300))}`);
      },
    });
  });
}

describe("terminal helpers", () => {
  test("only Windows lacks terminals", () => {
    expect(terminalSupported("darwin")).toBe(true);
    expect(terminalSupported("linux")).toBe(true);
    expect(terminalSupported("win32")).toBe(false);
  });

  test("pickShell uses the user's shell when it exists, otherwise one every system has", () => {
    expect(pickShell("linux", { SHELL: "/bin/sh" })).toBe("/bin/sh");
    expect(["/bin/zsh", "/bin/bash", "/bin/sh"]).toContain(pickShell("darwin", { SHELL: "relative/zsh" }));
    expect(["/bin/bash", "/bin/sh"]).toContain(pickShell("linux", { SHELL: "/no/such/shell" }));
    expect(["/bin/bash", "/bin/sh"]).toContain(pickShell("linux", {}));
  });

  test("clampSize keeps sizes sane and ignores junk", () => {
    expect(clampSize(80, 1, 2, 500)).toBe(80);
    expect(clampSize("120", 1, 2, 500)).toBe(120);
    expect(clampSize(9999, 1, 2, 500)).toBe(500);
    expect(clampSize(-4, 24, 1, 200)).toBe(1);
    expect(clampSize("abc", 24, 1, 200)).toBe(24);
    expect(clampSize(NaN, 24, 1, 200)).toBe(24);
    expect(clampSize(undefined, 24, 1, 200)).toBe(24);
  });
});

suite("terminal hub", () => {
  test("a shell starts in the given folder, and closing the hub ends it", async () => {
    const hub = createTerminalHub(2);
    const ctx = createContext({ home, dataDir: join(root, "data") });
    let out = "";
    const s = hub.open(ctx, { cwd: work, cols: 80, rows: 24, onData: (t) => (out += t), onExit: () => {} });
    expect(s).not.toBeNull();
    expect(hub.count).toBe(1);
    s!.write("echo cwd=$(basename \"$PWD\")\r");
    const end = Date.now() + 8000;
    while (!/cwd=work with spaces/.test(out) && Date.now() < end) await Bun.sleep(25);
    expect(out).toContain("cwd=work with spaces");
    hub.closeAll();
    expect(hub.count).toBe(0);
    const stop = Date.now() + 5000;
    let alive = true;
    while (alive && Date.now() < stop) {
      try { process.kill(s!.pid, 0); await Bun.sleep(50); } catch { alive = false; }
    }
    expect(alive).toBe(false);
  });

  test("the number of open terminals is limited, and a closed one frees its place", () => {
    const hub = createTerminalHub(2);
    const ctx = createContext({ home, dataDir: join(root, "data") });
    const open = () => hub.open(ctx, { cwd: work, cols: 80, rows: 24, onData: () => {}, onExit: () => {} });
    const a = open();
    const b = open();
    expect(a && b).toBeTruthy();
    expect(open()).toBeNull();
    a!.close();
    const c = open();
    expect(c).not.toBeNull();
    hub.closeAll();
  });

  test("a file is not a folder", () => {
    const hub = createTerminalHub();
    const ctx = createContext({ home, dataDir: join(root, "data") });
    expect(() => hub.open(ctx, { cwd: join(root, "nothing-here"), cols: 80, rows: 24, onData: () => {}, onExit: () => {} })).toThrow();
  });
});

suite("terminal over WebSocket", () => {
  test("runs commands in the folder it was opened at", async () => {
    const c = await connect({ token: TOKEN, path: work, cols: "100", rows: "30" });
    c.ws.send(JSON.stringify({ type: "input", data: "echo here=$(basename \"$PWD\") size=$(stty size | tr ' ' x)\r" }));
    const out = await c.waitFor(/here=work with spaces size=30x100/);
    expect(out).toContain("here=work with spaces");
    c.ws.send(JSON.stringify({ type: "resize", cols: 90, rows: 20 }));
    c.ws.send(JSON.stringify({ type: "input", data: "echo now=$(stty size | tr ' ' x)\r" }));
    await c.waitFor(/now=20x90/);
    c.ws.close();
  });

  test("tells the page when the shell ends", async () => {
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "exit 3\r" }));
    await c.closed;
    expect(c.messages.some((m) => m.type === "exit" && m.code === 3)).toBe(true);
  });

  test("garbage, oversized and unknown messages are ignored and the shell keeps working", async () => {
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send("not json");
    c.ws.send(JSON.stringify({ type: "input", data: 42 }));
    c.ws.send(JSON.stringify({ type: "format-the-disk" }));
    c.ws.send(JSON.stringify({ type: "input", data: "x".repeat(70 * 1024) }));
    c.ws.send(JSON.stringify({ type: "input", data: "echo alive=$((20+22))\r" }));
    await c.waitFor(/alive=42/);
    c.ws.close();
  });

  test("refuses a missing or wrong token, a foreign origin, a missing origin, a non-folder, and a plain request", async () => {
    await expect(connect({ path: work })).rejects.toThrow();
    await expect(connect({ token: "wrong", path: work })).rejects.toThrow();
    await expect(connect({ token: TOKEN, path: work }, "https://evil.example")).rejects.toThrow();
    await expect(connect({ token: TOKEN, path: join(root, "nothing-here") })).rejects.toThrow();
    const plain = await fetch(`${base}/api/terminal?token=${TOKEN}&path=${encodeURIComponent(work)}`);
    expect(plain.status).toBe(403);
    const noToken = await fetch(`${base}/api/terminal?path=${encodeURIComponent(work)}`);
    expect(noToken.status).toBe(401);
    const noOrigin = await fetch(`${base}/api/terminal?token=${TOKEN}&path=${encodeURIComponent(work)}`, { headers: { Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version": "13" } });
    expect(noOrigin.status).toBe(403);
  });

  test("the fifth terminal is refused with a clear message", async () => {
    const open: Client[] = [];
    for (let i = 0; i < 4; i++) open.push(await connect({ token: TOKEN, path: work }));
    const fifth = await connect({ token: TOKEN, path: work });
    await fifth.closed;
    expect(fifth.messages.some((m) => m.type === "error" && /Too many terminals/.test(m.message))).toBe(true);
    open.forEach((c) => c.ws.close());
  });

  test("closing the page's connection ends the shell", async () => {
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "echo pid=$$\r" }));
    const out = await c.waitFor(/pid=\d+/);
    const pid = Number(/pid=(\d+)/.exec(out)![1]);
    c.ws.close();
    const end = Date.now() + 5000;
    let alive = true;
    while (alive && Date.now() < end) {
      try { process.kill(pid, 0); await Bun.sleep(50); } catch { alive = false; }
    }
    expect(alive).toBe(false);
  });
});

describe("assets for the terminal", () => {
  test("the page allows a WebSocket to its own address only", async () => {
    const csp = (await fetch(`${base}/`)).headers.get("content-security-policy")!;
    expect(csp).toContain(`connect-src 'self' ws://127.0.0.1:${server.port}`);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toMatch(/ws:\/\/\*|ws:;/);
  });

  test("the terminal library is served from a fixed list of files", async () => {
    for (const [name, type] of [["xterm.mjs", "javascript"], ["addon-fit.mjs", "javascript"], ["xterm.css", "css"], ["LICENSE-xterm.txt", "plain"]] as const) {
      const res = await fetch(`${base}/vendor/${name}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain(type);
    }
    expect((await fetch(`${base}/vendor/xterm.mjs.map`)).status).toBe(404);
    expect((await fetch(`${base}/vendor/..%2Fui%2Fmain.js`)).status).toBe(404);
    expect((await fetch(`${base}/vendor/other.mjs`)).status).toBe(404);
  });
});

describe("the terminal library and the page's policy", () => {
  test("each page load gets its own style nonce, used in the policy and in the page", async () => {
    const a = await fetch(`${base}/`);
    const b = await fetch(`${base}/`);
    const nonceOf = (csp: string) => /style-src 'self' 'nonce-([^']+)'/.exec(csp)?.[1];
    const csp = a.headers.get("content-security-policy")!;
    const nonce = nonceOf(csp);
    expect(nonce).toBeTruthy();
    expect(await a.text()).toContain(`name="fm-nonce" content="${nonce}"`);
    expect(nonceOf(b.headers.get("content-security-policy")!)).not.toBe(nonce);
    expect(csp).not.toContain("unsafe-inline");
  });

  test("the vendored xterm.mjs applies that nonce to every style element it makes", async () => {
    const text = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "vendor", "xterm.mjs"), "utf8");
    expect(text.match(/__fmStyle\(/g)?.length).toBe(3);
    expect(text.match(/createElement\("style"\)/g)?.length).toBe(1); // only inside __fmStyle itself
    expect(text).not.toContain("sourceMappingURL");
  });
});

suite("the file list can follow the shell", () => {
  const cwdMessages = (c: Client) => c.messages.filter((m) => m.type === "cwd").map((m) => m.path as string);
  async function waitForCwd(c: Client, path: string, ms = 8000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (cwdMessages(c).includes(path)) return;
      await Bun.sleep(25);
    }
    throw new Error(`No cwd message for ${path}. Got ${JSON.stringify(cwdMessages(c))}`);
  }

  test("shellFolder reads another process's folder, and refuses what it can't use", async () => {
    expect(await shellFolder(process.platform === "darwin" ? "darwin" : "linux", process.pid)).toBe(realpathSync(process.cwd()));
    expect(await shellFolder("linux", 0)).toBeNull();
    expect(await shellFolder("linux", -5)).toBeNull();
    expect(await shellFolder("linux", 1.5)).toBeNull();
    expect(await shellFolder("win32", process.pid)).toBeNull();
    expect(await shellFolder("linux", 2 ** 22 + 12345)).toBeNull();
  });

  test("typing cd moves the reported folder, including names with spaces and quotes", async () => {
    const sub = join(work, "it's a sub folder");
    mkdirSync(sub, { recursive: true });
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "cd \"it's a sub folder\"\r" }));
    await waitForCwd(c, realpathSync(sub));
    c.ws.send(JSON.stringify({ type: "input", data: "cd ..\r" }));
    await waitForCwd(c, realpathSync(work));
    c.ws.close();
  });

  test("nothing is sent while the shell stays where it started", async () => {
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "echo staying\r" }));
    await c.waitFor(/staying/);
    await Bun.sleep(1600);
    expect(cwdMessages(c)).toEqual([]);
    c.ws.close();
  });

  test("only the shell's own folder counts, not a subshell's", async () => {
    const other = join(work, "elsewhere");
    mkdirSync(other, { recursive: true });
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "( cd elsewhere && sleep 0.4 )\r" }));
    // A subshell moves, but the shell itself does not: nothing must be reported.
    await Bun.sleep(1500);
    expect(cwdMessages(c)).toEqual([]);
    c.ws.send(JSON.stringify({ type: "input", data: "cd elsewhere\r" }));
    await waitForCwd(c, realpathSync(other));
    c.ws.close();
  });

  test("a folder that is removed is not reported", async () => {
    const gone = join(work, "will vanish");
    mkdirSync(gone, { recursive: true });
    const c = await connect({ token: TOKEN, path: work });
    c.ws.send(JSON.stringify({ type: "input", data: "cd 'will vanish' && rmdir \"$PWD\"\r" }));
    await Bun.sleep(2800);
    expect(cwdMessages(c).some((p) => p.includes("will vanish"))).toBe(false);
    c.ws.close();
  });
});
