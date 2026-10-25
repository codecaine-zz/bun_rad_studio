import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext, type FmContext } from "../src/features/filemanager/fmCore";
import { serveOperations } from "../src/features/filemanager/fmServeOps";
import { DEV_INI, explainPhpFailure, killTree, phpEnv, portInUse } from "../src/features/filemanager/fmServePhp";
import { getServeRegistry } from "../src/features/filemanager/fmServeRegistry";

const root = mkdtempSync(join(tmpdir(), "fm-serve-php-"));
const home = join(root, "home");
mkdirSync(home);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WINDOWS = process.platform === "win32";
const HAS_PHP = !!Bun.which("php");
if (!HAS_PHP) console.log("NOTE: php is not installed on this computer, so the tests that run the real PHP server are skipped.");
const real = test.skipIf(!HAS_PHP);
const posix = test.skipIf(WINDOWS);

let counter = 0;
const contexts: FmContext[] = [];
function newCtx(options: Parameters<typeof createContext>[0] = {}): FmContext & { launched: string[][] } {
  const launched: string[][] = [];
  const ctx = createContext({ home, dataDir: join(root, `data${++counter}`), launch: async (c, a) => { launched.push([c, ...a]); }, ...options });
  contexts.push(ctx);
  return Object.assign(ctx, { launched });
}
function folder(name = "php"): string {
  const dir = join(root, `${name}${++counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
const op = (ctx: FmContext, name: string, body: Record<string, any> = {}): Promise<any> => serveOperations[name]!(ctx, body) as Promise<any>;
const fails = async (promise: Promise<any>, code: string, message?: RegExp) => {
  const err: any = await promise.then(() => null, (e) => e);
  expect(err, `expected ${code}`).not.toBeNull();
  expect(err.code).toBe(code);
  if (message) expect(err.message).toMatch(message);
  expect(err.message).not.toMatch(/\bnull\b|\bundefined\b|\[object/);
  return err;
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function until<T>(fn: () => T | Promise<T>, what: string, ms = 8000): Promise<NonNullable<T>> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as NonNullable<T>;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(50);
  }
}
async function freePort(): Promise<number> {
  const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
  const port = s.port!;
  await s.stop(true);
  return port;
}
const text = async (url: string, init?: RequestInit) => (await fetch(url, { ...init, headers: { Connection: "close", ...(init?.headers as any) } })).text();

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await getServeRegistry(ctx).stopAll();
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A stand-in for the php program, so the stop and environment rules can be tested without the real thing. */
function fakePhp(mode: "fail" | "stubborn"): string {
  const dir = folder(`fake-${mode}-`);
  const file = join(dir, "php");
  writeFileSync(file, `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === "-v") { console.log("PHP 8.9.9 (cli) (built: fake)"); process.exit(0); }
if (${JSON.stringify(mode)} === "fail") { console.error("PHP Fatal error: boom in the router"); process.exit(3); }
process.on("SIGTERM", () => {});
const [host, port] = args[args.indexOf("-S") + 1].split(":");
Bun.serve({ hostname: host, port: Number(port), fetch: () => Response.json({ argv: args, env: process.env, cwd: process.cwd(), pid: process.pid }) });
console.error("[fake] started");
`);
  chmodSync(file, 0o755);
  return file;
}

describe("PHP server: when PHP is missing or odd", () => {
  test("a message explains a taken port in plain words", () => {
    expect(explainPhpFailure("Failed to listen on 127.0.0.1:8000 (reason: Address already in use)", "127.0.0.1", 8000)).toMatch(/Port 8000 is already used by another program/);
    expect(explainPhpFailure("bind: Permission denied", "127.0.0.1", 80)).toMatch(/isn't allowed to use port 80/);
    expect(explainPhpFailure("", "127.0.0.1", 8000)).toContain('php -S 127.0.0.1:8000');
    expect(explainPhpFailure("a\nsyntax problem here", "127.0.0.1", 8000)).toContain("It said: a syntax problem here");
  });

  test("the program path override is checked", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.php"), "<?php echo 1;");
    await fails(op(ctx, "serve/start", { root: dir, kind: "php", phpPath: "php" }), "BAD_REQUEST", /full path/);
    await fails(op(ctx, "serve/start", { root: dir, kind: "php", phpPath: "/bin/sh" }), "BAD_REQUEST", /doesn't look like a PHP program/);
    await fails(op(ctx, "serve/start", { root: dir, kind: "php", phpPath: join(root, "nowhere", "php") }), "NO_PHP", /no program at that PHP path/);
    await fails(op(ctx, "serve/start", { root: dir, kind: "php", phpPath: `${join(root, "x")}\0/php` }), "BAD_REQUEST");
    if (!WINDOWS) {
      // A program that is called php but isn't PHP can't be used.
      const imposter = join(folder("imposter"), "php");
      writeFileSync(imposter, "#!/bin/sh\necho 'not what you think'\n");
      chmodSync(imposter, 0o755);
      await fails(op(ctx, "serve/start", { root: dir, kind: "php", phpPath: imposter }), "NO_PHP", /didn't answer like PHP/);
    }
    expect((await op(ctx, "serve/status")).servers).toEqual([]);
  });

  posix("PHP that stops as soon as it starts shows what it said", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.php"), "<?php echo 1;");
    const err = await fails(op(ctx, "serve/start", { root: dir, kind: "php", phpPath: fakePhp("fail") }), "PHP_FAILED", /PHP stopped as soon as it started\. It said: .*PHP Fatal error: boom in the router/);
    expect(err.message).not.toContain("[fake]");
    expect((await op(ctx, "serve/status")).servers).toEqual([]);
  });
});

describe("PHP server: stopping for sure, and what PHP is told", () => {
  posix("a PHP that ignores the polite request is ended by force after about two seconds, and gets only a minimal environment", async () => {
    process.env.FM_TOKEN_TEST = "super-secret-token";
    process.env.SECRET_THING = "do-not-pass-on";
    try {
      const ctx = newCtx();
      const dir = folder();
      writeFileSync(join(dir, "index.php"), "<?php echo 1;");
      const fake = fakePhp("stubborn");
      const { server } = await op(ctx, "serve/start", { root: dir, kind: "php", phpPath: fake });
      expect(server).toMatchObject({ kind: "php", status: "running", phpVersion: "PHP 8.9.9 (cli)", host: "127.0.0.1" });
      expect(server.port).toBeGreaterThanOrEqual(8000);
      const seen: any = await (await fetch(server.url)).json();
      // Started with an argument list, in the served folder.
      expect(seen.argv).toEqual([...DEV_INI, "-S", `127.0.0.1:${server.port}`, "-t", dir]);
      expect(await Bun.file(seen.cwd).exists() || existsSync(seen.cwd)).toBe(true);
      // Nothing from this program's environment is passed on.
      expect(Object.keys(seen.env).sort().every((k) => ["PATH", "HOME", "LANG", "TMPDIR", "PWD"].includes(k)), JSON.stringify(Object.keys(seen.env))).toBe(true);
      expect(JSON.stringify(seen.env)).not.toMatch(/super-secret-token|do-not-pass-on|FM_TOKEN/);
      expect(seen.env.PATH).toBeTruthy();
      const pid = server.pid as number;
      expect(pid).toBe(seen.pid);
      expect(alive(pid)).toBe(true);
      const started = Date.now();
      const stopped = await op(ctx, "serve/stop", { id: server.id });
      const took = Date.now() - started;
      expect(stopped.server.status).toBe("stopped");
      expect(took).toBeGreaterThanOrEqual(1800);
      expect(took).toBeLessThan(5000);
      expect(alive(pid)).toBe(false);
      expect(await portInUse("127.0.0.1", server.port)).toBe(false);
    } finally {
      delete process.env.FM_TOKEN_TEST;
      delete process.env.SECRET_THING;
    }
  });

  test("phpEnv holds only what PHP needs", () => {
    process.env.FM_TOKEN_TEST = "x";
    try {
      const env = phpEnv({ platform: process.platform === "win32" ? "win32" : "linux", home, toolDirs: [home] });
      expect(Object.keys(env).every((k) => ["PATH", "Path", "HOME", "LANG", "TMPDIR", "SystemRoot", "TEMP", "TMP", "windir", "USERPROFILE"].includes(k))).toBe(true);
      expect(env).not.toHaveProperty("FM_TOKEN_TEST");
    } finally {
      delete process.env.FM_TOKEN_TEST;
    }
  });

  test("killTree ignores bad process numbers", () => {
    expect(() => killTree(0, "SIGKILL")).not.toThrow();
    expect(() => killTree(-5, "SIGTERM")).not.toThrow();
  });
});

describe("the real PHP server", () => {
  real("is found, with its version", async () => {
    const status = await op(newCtx(), "serve/status");
    expect(status.php.available).toBe(true);
    expect(status.php.version).toMatch(/^PHP \d+\.\d+\.\d+\S* \(cli\)$/);
    expect(status.php.path).toMatch(/php/);
    expect(status.php.hints).toEqual([]);
  });

  real("starts, shows the page, counts requests and keeps PHP's own messages in the log", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.php"), "<?php echo 1+1;");
    writeFileSync(join(dir, "warn.php"), '<?php error_log("hello-from-test"); echo "done";');
    writeFileSync(join(dir, "page.html"), "<p>plain</p>");
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "php", openBrowser: true });
    expect(server).toMatchObject({ kind: "php", status: "running", host: "127.0.0.1", lan: false, liveReload: false });
    expect(server.port).toBeGreaterThanOrEqual(8000);
    expect(server.phpVersion).toMatch(/^PHP \d/);
    expect(alive(server.pid)).toBe(true);
    expect(ctx.launched.at(-1)!.join(" ")).toContain(server.url);
    expect(await text(server.url)).toBe("2");
    expect(await text(`${server.url}warn.php`)).toBe("done");
    expect(await text(`${server.url}page.html`)).toBe("<p>plain</p>");
    const status = await until(async () => {
      const s = (await op(ctx, "serve/status")).servers[0];
      return s.requests >= 3 ? s : null;
    }, "the request count");
    expect(status.lastRequestAt).not.toBeNull();
    const logText = await until(async () => {
      const t = (await op(ctx, "serve/log", { id: server.id })).lines.map((l: any) => l.text).join("\n");
      return t.includes("hello-from-test") ? t : null;
    }, "the log lines");
    expect(logText).toContain("Development Server");
    expect(logText).toContain("-S 127.0.0.1:");
    expect(logText).toMatch(/\[200\]: GET \/warn\.php/);
    expect((await op(ctx, "serve/detect", { path: dir })).running.php.id).toBe(server.id);
    await fails(op(ctx, "serve/start", { root: dir, kind: "php" }), "ALREADY_RUNNING");
  });

  real("uses a router script and a document folder, and keeps files outside the document folder away", async () => {
    const ctx = newCtx();
    const dir = folder();
    mkdirSync(join(dir, "public"));
    writeFileSync(join(dir, "public", "index.php"), "<?php echo 'public index';");
    writeFileSync(join(dir, "secret.php"), "<?php echo 'OUTSIDE';");
    writeFileSync(join(dir, "router.php"), '<?php if ($_SERVER["REQUEST_URI"] === "/routed") { echo "routed!"; return true; } return false;');
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "php", docroot: "public", router: "router.php" });
    expect(server.docroot).toBe(join(dir, "public"));
    expect(server.router).toBe(join(dir, "router.php"));
    expect(await text(server.url)).toBe("public index");
    expect(await text(`${server.url}routed`)).toBe("routed!");
    // Depending on the PHP version an unknown address gets the document folder's index.php or a 404 page; what matters is that the file outside is never run.
    const outside = await fetch(`${server.url}secret.php`);
    const outsideBody = await outside.text();
    expect(outsideBody).not.toContain("OUTSIDE");
    expect([200, 404]).toContain(outside.status);
    if (outside.status === 200) expect(outsideBody).toBe("public index");
    await op(ctx, "serve/stop", { id: server.id });

    await fails(op(ctx, "serve/start", { root: dir, kind: "php", router: "missing.php" }), "NOT_FOUND", /router script doesn't exist/);
    await fails(op(ctx, "serve/start", { root: dir, kind: "php", router: "public" }), "NOT_A_FILE");
    await fails(op(ctx, "serve/start", { root: dir, kind: "php", router: "../outside.php" }), "BAD_REQUEST", /inside the folder/);
    await fails(op(ctx, "serve/start", { root: dir, kind: "php", router: join(dir, "router.php") }), "BAD_REQUEST", /not a full path/);
    writeFileSync(join(dir, "notes.txt"), "x");
    await fails(op(ctx, "serve/start", { root: dir, kind: "php", router: "notes.txt" }), "BAD_REQUEST", /must be a PHP file/);
    if (!WINDOWS) {
      writeFileSync(join(root, "outside-router.php"), "<?php return false;");
      symlinkSync(join(root, "outside-router.php"), join(dir, "linked.php"));
      await fails(op(ctx, "serve/start", { root: dir, kind: "php", router: "linked.php" }), "BAD_REQUEST", /outside/);
    }
  });

  real("a taken port is explained, and Auto goes around it", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.php"), "<?php echo 1;");
    const port = await freePort();
    const blocker = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("busy") });
    try {
      expect(await portInUse("127.0.0.1", port)).toBe(true);
      const err = await fails(op(ctx, "serve/start", { root: dir, kind: "php", port }), "PORT_IN_USE", /already used by another program on this computer/);
      expect(err.message).toContain(String(port));
      expect((await op(ctx, "serve/status")).servers).toEqual([]);
    } finally {
      await blocker.stop(true);
    }
    expect(await portInUse("127.0.0.1", port)).toBe(false);
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "php", port: String(port) });
    expect(server.port).toBe(port);
    // A second PHP server on the same port is turned away by us, before PHP is asked.
    const other = folder();
    writeFileSync(join(other, "index.php"), "<?php echo 2;");
    await fails(op(ctx, "serve/start", { root: other, kind: "php", port }), "PORT_IN_USE");
    // Auto picks another one.
    const auto = (await op(ctx, "serve/start", { root: other, kind: "php" })).server;
    expect(auto.port).not.toBe(port);
    expect(await text(auto.url)).toBe("2");
  });

  real("a script with a syntax error runs the server but shows PHP's message, in the page and in the log", async () => {
    const ctx = newCtx();
    const dir = folder();
    // The script is a page, not the router: PHP 8.3 stays silent about a parse error in a router script, newer versions report it.
    writeFileSync(join(dir, "index.php"), "<?php\n  if (true {\n");
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "php" });
    const body = await text(server.url);
    expect(body).toMatch(/Parse error/i);
    const logText = await until(async () => {
      const t = (await op(ctx, "serve/log", { id: server.id })).lines.map((l: any) => l.text).join("\n");
      return /Parse error/.test(t) ? t : null;
    }, "the parse error in the log");
    expect(logText).toMatch(/PHP Parse error/);
  });

  real("stopping ends the process and frees the port; the folder can be served again", async () => {
    // The step markers are for the Windows CI run, where this test once stopped without any message.
    const step = (what: string) => console.log(`[php-stop] ${what}`);
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.php"), "<?php echo 'again';");
    step("start");
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "php" });
    const pid = server.pid as number;
    step(`started pid ${pid}`);
    expect(alive(pid)).toBe(true);
    const started = Date.now();
    step("stop");
    await op(ctx, "serve/stop", { id: server.id });
    step("stopped");
    expect(Date.now() - started).toBeLessThan(2500);
    expect(alive(pid)).toBe(false);
    step("port check");
    expect(await portInUse("127.0.0.1", server.port)).toBe(false);
    step("start again");
    const again = (await op(ctx, "serve/start", { root: dir, kind: "php" })).server;
    expect(again.pid).not.toBe(pid);
    step("get page");
    expect(await text(again.url)).toBe("again");
    // Restart = stop and start with the same choices.
    step("stop again");
    await op(ctx, "serve/stop", { id: again.id });
    step("start on the same port");
    const third = (await op(ctx, "serve/start", { root: dir, kind: "php", port: again.port })).server;
    expect(third.port).toBe(again.port);
    step("stop all");
    expect(await op(ctx, "serve/stopAll")).toEqual({ stopped: 1 });
    expect(alive(third.pid)).toBe(false);
    step("done");
  }, 20000);

  real("a PHP that dies by itself is shown as stopped, with the log kept, and can be removed or started again", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.php"), "<?php echo 1;");
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "php" });
    process.kill(server.pid, "SIGKILL");
    const failed = await until(async () => {
      const s = (await op(ctx, "serve/status")).servers[0];
      return s?.status === "failed" ? s : null;
    }, "the failure to be noticed");
    expect(failed.message).toMatch(/PHP stopped by itself/);
    expect((await op(ctx, "serve/log", { id: server.id })).status).toBe("failed");
    const again = (await op(ctx, "serve/start", { root: dir, kind: "php" })).server;
    expect(again.status).toBe("running");
    expect((await op(ctx, "serve/status")).servers).toHaveLength(1);
  });

  real("closing the File Manager leaves no PHP behind", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.php"), "<?php echo 1;");
    const a = (await op(ctx, "serve/start", { root: dir, kind: "php" })).server;
    const b = (await op(ctx, "serve/start", { root: folder(), kind: "php" })).server;
    expect([alive(a.pid), alive(b.pid)]).toEqual([true, true]);
    for (const dispose of ctx.disposers.splice(0)) dispose();
    await until(() => !alive(a.pid) && !alive(b.pid), "both PHP processes to end", 3000);
    await until(async () => !(await portInUse("127.0.0.1", a.port)), "port to be freed", 3000);
    expect(await portInUse("127.0.0.1", a.port)).toBe(false);
    expect((await op(ctx, "serve/status")).servers).toEqual([]);
  });

  real("PHP only gets a minimal environment: nothing from this program's secrets", async () => {
    process.env.FM_TOKEN_TEST = "super-secret-token";
    process.env.SECRET_THING = "do-not-pass-on";
    try {
      const ctx = newCtx();
      const dir = folder();
      writeFileSync(join(dir, "env.php"), '<?php header("Content-Type: application/json"); echo json_encode(getenv());');
      const { server } = await op(ctx, "serve/start", { root: dir, kind: "php" });
      const raw = await text(`${server.url}env.php`);
      expect(raw).not.toMatch(/super-secret-token|do-not-pass-on|FM_TOKEN|SECRET_THING/);
      const env = JSON.parse(raw);
      expect(env.PATH ?? env.Path).toBeTruthy();
      // macOS adds __CF_USER_TEXT_ENCODING to every process by itself; Windows PHP populates basic user/system vars from the process token.
      expect(Object.keys(env).every((k) => ["PATH", "Path", "HOME", "LANG", "TMPDIR", "PWD", "SystemRoot", "TEMP", "TMP", "windir", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "SYSTEMDRIVE", "USERDOMAIN", "USERNAME", "__CF_USER_TEXT_ENCODING"].includes(k)), Object.keys(env).join(",")).toBe(true);
    } finally {
      delete process.env.FM_TOKEN_TEST;
      delete process.env.SECRET_THING;
    }
  });

  real("the network option makes PHP listen on every interface, and says it is for development only", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.php"), "<?php echo 'net';");
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "php", lan: true });
    expect(server).toMatchObject({ host: "0.0.0.0", lan: true });
    expect(await text(server.url)).toBe("net");
    const logText = (await op(ctx, "serve/log", { id: server.id })).lines.map((l: any) => l.text).join("\n");
    expect(logText).toContain("-S 0.0.0.0:");
    const local = (await op(ctx, "serve/start", { root: folder(), kind: "php" })).server;
    expect(local.host).toBe("127.0.0.1");
    expect((await op(ctx, "serve/log", { id: local.id })).lines.map((l: any) => l.text).join("\n")).toContain("-S 127.0.0.1:");
  });

  real("odd folder names can't change how PHP is started", async () => {
    const ctx = newCtx();
    const names = ["-evil", "--version", "my dir", "a'b", "-S", "$(touch pwned)", "`touch pwned`", "semi;colon", "ünï"];
    if (!WINDOWS) names.push('say "hi"');
    const base = folder("odd");
    for (const [i, name] of names.entries()) {
      const dir = join(base, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "index.php"), `<?php echo "ok-${i}";`);
      const { server } = await op(ctx, "serve/start", { root: dir, kind: "php" });
      expect(await text(server.url), name).toBe(`ok-${i}`);
      await op(ctx, "serve/stop", { id: server.id });
    }
    // A document folder and a router whose names look like options.
    const dir = folder("odd-inner");
    mkdirSync(join(dir, "-t"));
    writeFileSync(join(dir, "-t", "index.php"), "<?php echo 'dash-t';");
    writeFileSync(join(dir, "-r.php"), '<?php if ($_SERVER["REQUEST_URI"] === "/r") { echo "router-r"; return true; } return false;');
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "php", docroot: "-t", router: "-r.php" });
    expect(await text(server.url)).toBe("dash-t");
    expect(await text(`${server.url}r`)).toBe("router-r");
    expect(existsSync(join(base, "pwned"))).toBe(false);
    expect(existsSync(join(process.cwd(), "pwned"))).toBe(false);
    for (const bad of ["a\nb", "a\rb"]) await fails(op(ctx, "serve/start", { root: join(base, bad), kind: "php" }), "BAD_PATH");
  });

  real("folders that are too broad or belong to the system are refused for PHP too, and nothing is started", async () => {
    const ctx = newCtx();
    // Only places that exist on this computer: a missing folder is refused as "not found" before the system check.
    for (const path of ["/", home, "/etc", "/usr/lib", "/System"].filter((p) => existsSync(p))) await fails(op(ctx, "serve/start", { root: path, kind: "php" }), "PROTECTED", /too broad or belongs to the system/);
    const own = join(import.meta.dir, "..", "resources", "file_manager");
    await fails(op(ctx, "serve/start", { root: own, kind: "php" }), "PROTECTED", /own files/);
    expect((await op(ctx, "serve/status")).servers).toEqual([]);
  });

  real("the automatic choice picks PHP for a folder with PHP and the live server for plain pages", async () => {
    const ctx = newCtx();
    const phpDir = folder();
    writeFileSync(join(phpDir, "index.php"), "<?php echo 'php!';");
    const html = folder();
    writeFileSync(join(html, "index.html"), "<p>html!</p>");
    const a = (await op(ctx, "serve/start", { root: phpDir })).server;
    const b = (await op(ctx, "serve/start", { root: html })).server;
    expect([a.kind, b.kind]).toEqual(["php", "static"]);
    expect(await text(a.url)).toBe("php!");
    expect(await text(b.url)).toContain("html!");
    expect(a.port).toBeGreaterThanOrEqual(8000);
    expect(b.port).toBeGreaterThanOrEqual(5500);
    expect(b.port).toBeLessThan(8000);
  });
});
