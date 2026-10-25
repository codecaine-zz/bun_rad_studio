// The hosted studios (API Studio, App Bundler, Env Studio) and the download API: who may reach them.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { HOSTED_STUDIOS } from "../src/features/filemanager/fmHostedStudios";
import { createHostedHub, hostedPage, HostedSession } from "../src/simplegui_host";

const HOME = fs.mkdtempSync(join(tmpdir(), "fm-hosted-home-"));
const DATA = fs.mkdtempSync(join(tmpdir(), "fm-hosted-data-"));
let fm: ReturnType<typeof startFileManagerServer>;
let primary = "";
let other = "";
const spawnedWindows: Array<{ command: string[]; cwd: string }> = [];
const launchedUrls: Array<{ cmd: string; args: string[] }> = [];
const post = (op: string, body: object, token = fm?.token) => fetch(`${primary}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-fm-token": token } : {}) }, body: JSON.stringify(body) });

beforeAll(() => {
  fm = startFileManagerServer({
    port: 0,
    context: {
      home: HOME,
      dataDir: DATA,
      launch: async (cmd, args) => { launchedUrls.push({ cmd, args }); },
      databases: {
        spawnWindow: async (command, options) => {
          spawnedWindows.push({ command, cwd: options.cwd });
          return { ok: true };
        },
      },
    },
  });
  primary = `http://127.0.0.1:${fm.port}`;
  other = `http://localhost:${fm.port}`;
});
afterAll(() => {
  fm.stop(true);
  fs.rmSync(HOME, { recursive: true, force: true });
  fs.rmSync(DATA, { recursive: true, force: true });
});

describe("opening a hosted studio", () => {
  test("needs the session token", async () => {
    expect((await post("studios/open", { id: "env" }, "")).status).toBe(401);
    expect((await post("studios/open", { id: "env" }, "wrong")).status).toBe(401);
  });
  test("only known tools", async () => {
    expect((await post("studios/open", { id: "../etc/passwd" })).status).toBe(400);
    expect((await post("studios/open", { id: "constructor" })).status).toBe(400);
    expect((await post("studios/open", {})).status).toBe(400);
  });
  test("lists the three tools", async () => {
    const r: any = await (await post("studios/list", {})).json();
    expect(r.studios.map((s: any) => s.id).sort()).toEqual(Object.keys(HOSTED_STUDIOS).sort());
  });
});

describe("a running tool's page and socket", () => {
  let secret = "";
  beforeAll(async () => {
    const r: any = await (await post("studios/open", { id: "env" })).json();
    expect(r.ok).toBe(true);
    secret = r.secret;
  });

  test("the page is served on the other loopback spelling with the secret", async () => {
    const res = await fetch(`${other}/app/hosted/env/?s=${encodeURIComponent(secret)}`);
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain(`connect-src ws://localhost:${fm.port}`);
    expect(csp).toContain(`frame-ancestors ${primary}`);
    // The only addresses named are this server's own two spellings.
    expect([...csp.matchAll(/(?:https?|wss?):\/\/[^\s;]+/g)].map((m) => m[0]).sort()).toEqual([`http://127.0.0.1:${fm.port}`, `ws://localhost:${fm.port}`]);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("__hosted");
  });
  test("never on the File Manager's own address", async () => {
    expect((await fetch(`${primary}/app/hosted/env/?s=${encodeURIComponent(secret)}`)).status).toBe(404);
    expect((await fetch(`${primary}/app/hostedws/env?s=${encodeURIComponent(secret)}`, { headers: { Upgrade: "websocket", Connection: "Upgrade", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version": "13", Origin: primary } })).status).toBe(404);
  });
  test("a missing or wrong secret gets nothing", async () => {
    const wrong = `${secret.slice(0, -1)}${secret.endsWith("x") ? "y" : "x"}`;
    expect((await fetch(`${other}/app/hosted/env/`)).status).toBe(404);
    expect((await fetch(`${other}/app/hosted/env/?s=nope`)).status).toBe(404);
    expect((await fetch(`${other}/app/hosted/env/?s=${wrong}`)).status).toBe(404);
  });
  test("an unknown tool or a tool that isn't running gets nothing", async () => {
    expect((await fetch(`${other}/app/hosted/api/?s=${encodeURIComponent(secret)}`)).status).toBe(404);
    expect((await fetch(`${other}/app/hosted/toString/?s=x`)).status).toBe(404);
  });
  test("the page only takes GET", async () => {
    expect((await fetch(`${other}/app/hosted/env/?s=${encodeURIComponent(secret)}`, { method: "POST" })).status).toBe(405);
  });

  const ws = (id: string, s: string, origin: string | null, host = `localhost:${fm.port}`) =>
    new Promise<{ opened: boolean; code?: number }>((resolve) => {
      const sock = new WebSocket(`ws://${host}/app/hostedws/${id}?s=${encodeURIComponent(s)}`, origin ? ({ headers: { Origin: origin } } as any) : undefined);
      sock.onopen = () => { sock.close(); resolve({ opened: true }); };
      sock.onerror = () => resolve({ opened: false });
      sock.onclose = (e) => resolve({ opened: false, code: e.code });
    });

  test("the socket opens with the secret and its own origin", async () => {
    expect((await ws("env", secret, `http://localhost:${fm.port}`)).opened).toBe(true);
  });
  test("the socket refuses another origin, no origin, or a wrong secret", async () => {
    expect((await ws("env", secret, "http://evil.example")).opened).toBe(false);
    expect((await ws("env", secret, `http://127.0.0.1:${fm.port}`)).opened).toBe(false);
    expect((await ws("env", secret, null)).opened).toBe(false);
    expect((await ws("env", "wrong", `http://localhost:${fm.port}`)).opened).toBe(false);
  });
  test("a call over the socket reaches the tool, and unknown names are refused", async () => {
    const answers: any[] = [];
    await new Promise<void>((resolve) => {
      const sock = new WebSocket(`ws://localhost:${fm.port}/app/hostedws/env?s=${encodeURIComponent(secret)}`, { headers: { Origin: `http://localhost:${fm.port}` } } as any);
      sock.onopen = () => {
        sock.send(JSON.stringify({ t: "call", id: 1, name: "on_btn_center_click", args: [] }));
        sock.send(JSON.stringify({ t: "call", id: 2, name: "process_exit_now", args: [] }));
        sock.send("not json");
        sock.send(JSON.stringify({ t: "call", id: "x", name: "on_btn_center_click" }));
      };
      sock.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.t === "res") answers.push(m);
        if (answers.length === 2) { sock.close(); resolve(); }
      };
    });
    expect(answers.find((a) => a.id === 1)?.ok).toBe(true);
    const bad = answers.find((a) => a.id === 2);
    expect(bad.ok).toBe(false);
    expect(bad.e).toContain("No such function");
  });
  test("closing the tool ends its page", async () => {
    await post("studios/close", { id: "env" });
    expect((await fetch(`${other}/app/hosted/env/?s=${encodeURIComponent(secret)}`)).status).toBe(404);
  });
  test("opening again gives a new secret and the old one stops working", async () => {
    const a: any = await (await post("studios/open", { id: "env" })).json();
    const b: any = await (await post("studios/open", { id: "env" })).json();
    expect(a.secret).not.toBe(b.secret);
    expect((await fetch(`${other}/app/hosted/env/?s=${encodeURIComponent(a.secret)}`)).status).toBe(404);
    expect((await fetch(`${other}/app/hosted/env/?s=${encodeURIComponent(b.secret)}`)).status).toBe(200);
  });
});

describe("the bridge", () => {
  test("a hosted window never exits the program and runs without a native window", async () => {
    const hub = createHostedHub();
    const { createEnvStudio } = await import("../applications/env_studio");
    const session = hub.open("t", () => createEnvStudio({ fullscreen: false }));
    expect(session.binds.size).toBeGreaterThan(20);
    expect(session.html).toContain("<html");
    hub.close("t");
    expect(hub.get("t")).toBeUndefined();
    expect(process.exitCode ?? 0).toBe(0);
  });
  test("messages sent before a page connects are delivered when it does", () => {
    const s = new HostedSession("x");
    s.webview.eval("1+1");
    const got: string[] = [];
    s.attach({ send: (t) => void got.push(t) });
    expect(got.map((t) => JSON.parse(t))).toEqual([{ t: "eval", code: "1+1" }]);
  });
  test("a closed session ignores everything", async () => {
    const s = new HostedSession("y");
    s.close();
    const got: string[] = [];
    s.attach({ send: (t) => void got.push(t) });
    s.webview.eval("x");
    await s.handleMessage({ send: (t) => void got.push(t) }, JSON.stringify({ t: "call", id: 1, name: "a", args: [] }));
    expect(got).toEqual([]);
  });
  test("the page cannot break out of its script tag", () => {
    const s = new HostedSession("z");
    s.html = "<html><head></head><body>hi</body></html>";
    const page = hostedPage(s, 'ws://x/</script><script>alert(1)</script>');
    expect(page.match(/<\/script>/g)?.length).toBe(1);
  });
});

describe("the download API", () => {
  test("needs the token", async () => {
    expect((await post("dl/list", {}, "")).status).toBe(401);
    expect((await post("dl/add", { urls: "http://127.0.0.1:1/x" }, "bad")).status).toBe(401);
  });
  test("refuses addresses that are not web addresses", async () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "ftp://x/y", "not a url"]) {
      const res = await post("dl/add", { urls: url });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });
  test("refuses protected folders", async () => {
    const protectedDir = process.platform === "win32" ? (process.env.SystemRoot || "C:\\Windows") : "/etc";
    const res = await post("dl/add", { urls: "http://127.0.0.1:9/x", folder: protectedDir, start: false });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(((await res.json()) as any).error.code).toBe("PROTECTED");
  });
  test("keeps request headers out of the listing", async () => {
    const r: any = await (await post("dl/add", { urls: "http://127.0.0.1:9/secret.bin", headers: { Authorization: "Bearer topsecret" }, start: false })).json();
    expect(JSON.stringify(r)).not.toContain("topsecret");
    await post("dl/clear", {});
    for (const i of r.items) await post("dl/remove", { id: i.id });
  });
  test("settings are clamped", async () => {
    const r: any = await (await post("dl/settings", { settings: { connections: 9999, maxConcurrent: -4, speedLimit: -1, retries: 1000 } })).json();
    expect(r.settings.connections).toBe(32);
    expect(r.settings.maxConcurrent).toBe(1);
    expect(r.settings.speedLimit).toBe(0);
    expect(r.settings.retries).toBe(20);
  });
});

describe("window mode and browser mode for all tools", () => {
  test("studios/window spawns standalone studio windows and File Manager tool windows, and every configured script exists on disk", async () => {
    spawnedWindows.length = 0;
    const paintRes: any = await (await post("studios/window", { id: "paint" })).json();
    expect(paintRes.ok).toBe(true);
    expect(paintRes.title).toBe("Paint Studio");
    expect(spawnedWindows.at(-1)?.command.some((part) => part.includes("paint_studio"))).toBe(true);

    const fixedMappings: Array<[string, string]> = [
      ["timer", "interval_timer_studio"],
      ["find", "fd_studio"],
      ["sd", "sd_studio"],
      ["dev", "devtools_studio"],
      ["watch", "watchexec_studio"],
      ["ip", "ipinfo_studio"],
      ["net", "network_studio"],
      ["subs", "subfinder_studio"],
      ["player", "media_player_studio"],
      ["grave", "rip_studio"],
    ];
    for (const [id, expectedScript] of fixedMappings) {
      const res: any = await (await post("studios/window", { id })).json();
      expect(res.ok).toBe(true);
      const cmd = spawnedWindows.at(-1)?.command ?? [];
      expect(cmd.some((part) => part.includes(expectedScript))).toBe(true);
      const scriptPath = cmd.find((part) => part.endsWith(".ts"));
      expect(scriptPath && fs.existsSync(scriptPath)).toBe(true);
    }

    const cliRes: any = await (await post("studios/window", { id: "cliutils", path: HOME })).json();
    expect(cliRes.ok).toBe(true);
    expect(cliRes.title).toBe("CLI Utilities");
    expect(spawnedWindows.at(-1)?.command).toEqual(expect.arrayContaining(["--tool", "cliutils", "--max", "--path", HOME]));

    const qrRes: any = await (await post("studios/window", { id: "qr", path: HOME })).json();
    expect(qrRes.ok).toBe(true);
    expect(qrRes.title).toBe("QR Code");
    expect(spawnedWindows.at(-1)?.command).toEqual(expect.arrayContaining(["--tool", "qr", "--max", "--path", HOME]));

    expect((await post("studios/window", { id: "unknown-tool" })).status).toBe(400);
  });

  test("studios/browser opens valid http/https tool addresses in the system browser and refuses invalid ones", async () => {
    launchedUrls.length = 0;
    const okRes: any = await (await post("studios/browser", { id: "paint", url: `${other}/app/paint/` })).json();
    expect(okRes.ok).toBe(true);
    expect(okRes.opened).toBe(`${other}/app/paint/`);
    expect(launchedUrls.at(-1)?.args.join(" ")).toContain(`${other}/app/paint/`);

    expect((await post("studios/browser", { id: "paint", url: "javascript:alert(1)" })).status).toBe(400);
    expect((await post("studios/browser", { id: "paint", url: "" })).status).toBe(400);
  });
});
