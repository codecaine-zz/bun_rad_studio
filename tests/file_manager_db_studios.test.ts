import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { realLayout, resolveStudioCommand, installRoot, type StudioLayout } from "../src/features/filemanager/fmDbHooks";
import { explainExit, scrubLog } from "../src/features/filemanager/fmDbStudios";
import { STUDIO_SANDBOX } from "../src/features/filemanager/fmDbFrame";
import { FAKE_STUDIO, FakeKeychain, dbComputer, sleep, until, type DbComputer } from "./helpers/db_fm";

const computers: DbComputer[] = [];
afterAll(() => computers.forEach((c) => c.remove()));
const computer = (o: Parameters<typeof dbComputer>[0] = {}) => {
  const c = dbComputer(o);
  computers.push(c);
  return c;
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const gone = (pid: number, ms = 8000) => until(() => !alive(pid), `process ${pid} to end`, ms);

const layout = (existing: string[], over: Partial<StudioLayout> = {}): StudioLayout => ({
  execPath: "/opt/bun/bin/bun",
  argv1: "/repo/applications/file_manager_studio.ts",
  repoRoot: "/repo",
  exists: (p) => existing.includes(p),
  readdir: (p) => existing.filter((e) => e.startsWith(p + "/")).map((e) => e.slice(p.length + 1).split("/")[0]!).filter((v, i, a) => a.indexOf(v) === i),
  ...over,
});

describe("where the studios are found", () => {
  test("from source: applications/<name>.ts run by Bun, with Bun's flags before the script", () => {
    const l = layout(["/repo/applications/sqlite_studio.ts", "/repo/applications/mysql_studio.ts", "/repo/applications"]);
    const cmd = resolveStudioCommand("sqlite", l)!;
    expect(cmd.kind).toBe("dev");
    expect(cmd.build(["--no-env-file"], ["--server", "--port", "0"])).toEqual(["/opt/bun/bin/bun", "--no-env-file", "/repo/applications/sqlite_studio.ts", "--server", "--port", "0"]);
    expect(resolveStudioCommand("redis", l)).toBeNull();
    expect(installRoot(l)).toBe("/repo");
  });

  test("a release folder: the studio's bundle next to this program's, run by the bundled runtime", () => {
    const l = layout(["/rel/apps/file-manager-studio.js", "/rel/apps/mysql-studio.js", "/rel/runtime/bun"], { execPath: "/rel/runtime/bun", argv1: "/rel/apps/file-manager-studio.js", repoRoot: "/nowhere" });
    const cmd = resolveStudioCommand("mysql", l)!;
    expect(cmd.kind).toBe("bundle");
    expect(cmd.build(["--no-env-file"], ["--server"])).toEqual(["/rel/runtime/bun", "--no-env-file", "/rel/apps/mysql-studio.js", "--server"]);
    expect(resolveStudioCommand("postgres", l)).toBeNull();
    expect(installRoot(l)).toBe("/rel");
  });

  test("the Mac downloads, one .app per tool: the sibling app's bundle and its own runtime", () => {
    const res = "/Applications/Bun RAD";
    const files = [`${res}/File Manager.app/Contents/Resources/app/file-manager-studio.js`, `${res}/File Manager.app/Contents/Resources/runtime/bun`, `${res}/PostgreSQL Studio.app/Contents/Resources/app/postgres-studio.js`, `${res}/PostgreSQL Studio.app/Contents/Resources/runtime/bun`];
    const l = layout(files, { execPath: files[1]!, argv1: files[0]!, repoRoot: "/nowhere" });
    const cmd = resolveStudioCommand("postgres", l)!;
    expect(cmd.kind).toBe("app");
    expect(cmd.build([], ["--server"])).toEqual([`${res}/PostgreSQL Studio.app/Contents/Resources/runtime/bun`, `${res}/PostgreSQL Studio.app/Contents/Resources/app/postgres-studio.js`, "--server"]);
    expect(resolveStudioCommand("redis", l)).toBeNull();
    expect(installRoot(l)).toBe(`${res}/File Manager.app/Contents/Resources`);
  });

  test("a compiled executable of the studio beside this one (no Bun flags: they would reach the studio)", () => {
    const l = layout(["/apps/redis-studio", "/apps/file-manager"], { execPath: "/apps/file-manager", argv1: "/apps/file-manager", repoRoot: "/nowhere" });
    const cmd = resolveStudioCommand("redis", l)!;
    expect(cmd.kind).toBe("executable");
    expect(cmd.build(["--no-env-file"], ["--server"])).toEqual(["/apps/redis-studio", "--server"]);
  });

  test("a bundle next to this program wins over a source tree", () => {
    const l = layout(["/x/apps/sqlite-studio.js", "/repo/applications/sqlite_studio.ts"], { argv1: "/x/apps/file-manager-studio.js", execPath: "/x/runtime/bun" });
    expect(resolveStudioCommand("sqlite", l)!.kind).toBe("bundle");
  });

  test("in this checkout every studio is found", () => {
    for (const engine of ["sqlite", "mysql", "postgres", "redis"] as const) {
      const cmd = resolveStudioCommand(engine, realLayout())!;
      expect(cmd, engine).not.toBeNull();
      expect(cmd.build([], ["--server"]).at(-2)).toMatch(new RegExp(`${engine}_studio\\.ts$`));
    }
  });
});

describe("log lines and crash messages", () => {
  test("known secrets and passwords in addresses are hidden, control characters removed, long lines cut", () => {
    expect(scrubLog("connecting with hunter2-secret now", ["hunter2-secret"])).toBe("connecting with •••• now");
    expect(scrubLog("postgres://user:pw123@host/db", [])).toBe("postgres://user:••••@host/db");
    expect(scrubLog("password=abc123 and PASSWD: 'zzz'", [])).not.toMatch(/abc123|zzz/);
    expect(scrubLog("bell\u0007 esc\u001b[31mred", [])).not.toMatch(/[\u0007\u001b]/);
    expect(scrubLog("x".repeat(2000), []).length).toBeLessThan(450);
    expect(scrubLog("ab and abc", ["ab"])).toBe("ab and abc");
  });

  test("a crash is explained in plain words", () => {
    expect(explainExit(["error: listen EADDRINUSE: address already in use"], 1, "SQLite Studio")).toContain("port");
    expect(explainExit(["error: Cannot find module './x'"], 1, "SQLite Studio")).toContain("files couldn't be found");
    expect(explainExit(["libwebview error"], 1, "MySQL Studio")).toContain("window library");
    expect(explainExit(["boom"], 3, "Redis Studio")).toBe("Redis Studio stopped unexpectedly (exit code 3). The last lines of its log are shown below.");
  });
});

describe("running studios (real child processes standing in for the studios)", () => {
  async function started(c: DbComputer, body: Record<string, unknown> = { engine: "sqlite", path: "" }) {
    const r = await c.ok("db/studio/start", body);
    return r;
  }
  const memory = async (c: DbComputer, name = "m") => (await c.ok("db/profile/save", { profile: { engine: "sqlite", name, sqliteMode: "memory" } })).profile.id as string;

  test("start, reuse, stop: one studio per connection, on 127.0.0.1, and the process really ends", async () => {
    const c = computer();
    const id = await memory(c);
    const a = await started(c, { profileId: id });
    expect(a.studio).toMatchObject({ state: "running", engine: "sqlite", profileId: id, writesConfirmed: false });
    expect(a.studio.url).toBe(`http://127.0.0.1:${a.studio.port}/`);
    expect(a.frame).toBe(`/app/dbstudio/${a.studio.id}/`);
    const page = await fetch(a.studio.url);
    expect(page.status).toBe(200);
    // asking again gives the same studio
    const b = await started(c, { profileId: id });
    expect(b.reused).toBe(true);
    expect(b.studio.id).toBe(a.studio.id);
    expect((await c.ok("db/studio/list")).studios).toHaveLength(1);
    const pid = a.studio.pid;
    expect(alive(pid)).toBe(true);
    const stopped = await c.ok("db/studio/stop", { id: a.studio.id });
    expect(stopped.studio.state).toBe("stopped");
    await gone(pid);
    expect((await fetch(a.studio.url).catch(() => null))?.status).toBeUndefined();
  });

  test("at most the allowed number at once, a different connection each", async () => {
    const c = computer({ hooks: { maxStudios: 2 } });
    const ids = [await memory(c, "a"), await memory(c, "b"), await memory(c, "c")];
    const one = await started(c, { profileId: ids[0] });
    await started(c, { profileId: ids[1] });
    const third = await c.api("db/studio/start", { profileId: ids[2] });
    expect(third.status).toBe(400);
    expect(third.json.error).toMatchObject({ code: "TOO_MANY", message: "2 studios are already open. Stop one first." });
    await c.ok("db/studio/stop", { id: one.studio.id });
    expect((await started(c, { profileId: ids[2] })).studio.state).toBe("running");
  });

  test("restart gives a new process with the connection's settings read again", async () => {
    const c = computer();
    const id = await memory(c);
    const a = await started(c, { profileId: id });
    const r = await c.ok("db/studio/restart", { id: a.studio.id });
    expect(r.studio.state).toBe("running");
    expect(r.studio.id).not.toBe(a.studio.id);
    expect(r.studio.pid).not.toBe(a.studio.pid);
    await gone(a.studio.pid);
    expect(alive(r.studio.pid)).toBe(true);
  });

  test("a crash is noticed and explained, with the last log lines, and the port is released", async () => {
    const c = computer({ env: { FAKE_MODE: "crash", PATH: process.env.PATH } });
    const id = await memory(c);
    const a = await started(c, { profileId: id });
    const final = await until(async () => (await c.ok("db/studio/list")).studios.find((s: any) => s.id === a.studio.id && s.state === "crashed"), "the crash to be noticed");
    expect(final.message).toBe("SQLite Studio stopped unexpectedly (exit code 3). The last lines of its log are shown below.");
    expect(final.exitCode).toBe(3);
    expect(final.url).toBeUndefined();
    const logs = await c.ok("db/studio/logs", { id: a.studio.id });
    expect(logs.lines.some((l: string) => l.startsWith("READY:"))).toBe(true);
    // a crashed studio can be started again
    const again = await c.api("db/studio/start", { profileId: id });
    expect(again.status).toBe(200);
  });

  test("a studio that never says READY is given up on, and killed", async () => {
    const c = computer({ env: { FAKE_MODE: "silent", PATH: process.env.PATH }, hooks: { startTimeoutMs: 700, killGraceMs: 300 } });
    const id = await memory(c);
    const r = await started(c, { profileId: id });
    expect(r.studio).toMatchObject({ state: "crashed", message: "SQLite Studio didn't become ready within 1 seconds." });
    await gone(r.studio.pid);
    expect(r.frame).toBeNull();
  });

  test("a studio that ignores the polite stop is killed after the grace period", async () => {
    const c = computer({ env: { FAKE_MODE: "stubborn", PATH: process.env.PATH }, hooks: { killGraceMs: 400 } });
    const a = await started(c, { profileId: await memory(c) });
    const t = Date.now();
    await c.ok("db/studio/stop", { id: a.studio.id });
    expect(Date.now() - t).toBeGreaterThanOrEqual(350);
    await gone(a.studio.pid);
  });

  test("stopping the File Manager stops every studio; none is left behind", async () => {
    const c = computer();
    const pids: number[] = [];
    for (const name of ["a", "b", "c"]) pids.push((await started(c, { profileId: await memory(c, name) })).studio.pid);
    expect(pids.every(alive)).toBe(true);
    c.stop();
    for (const pid of pids) await gone(pid);
  });

  test("a forgotten studio is stopped after the time limit, and a studio that isn't part of this copy says so", async () => {
    const c = computer({ hooks: { maxLifetimeMs: 600 } });
    const a = await started(c, { profileId: await memory(c) });
    const ended = await until(async () => (await c.ok("db/studio/list")).studios.find((s: any) => s.id === a.studio.id && s.state === "stopped"), "the time limit");
    expect(ended.message).toBe("Stopped after 1 minute, so a forgotten studio doesn't run for days.");
    await gone(a.studio.pid);
    const none = computer({ hooks: { studioCommand: () => null } });
    const r = await none.api("db/studio/start", { profileId: await memory(none) });
    expect(r.json.error).toMatchObject({ code: "NOT_AVAILABLE", message: "SQLite Studio isn't part of this copy of the program, so it can't be opened here." });
    expect((await none.ok("db/overview")).engines.every((e: any) => e.studioAvailable === false)).toBe(true);
  });

  test("a studio whose File Manager vanished ends by itself (the parent-process watch)", async () => {
    const parent = Bun.spawn([process.execPath, "-e", "setTimeout(() => {}, 500)"], { stdout: "ignore", stderr: "ignore" });
    const env = { PATH: process.env.PATH ?? "", STUDIO_PARENT_PID: String(parent.pid) };
    const child = Bun.spawn([process.execPath, FAKE_STUDIO, "--server"], { env, stdout: "pipe", stderr: "ignore" });
    try {
      await parent.exited;
      const t = Date.now();
      await Promise.race([child.exited, sleep(9000)]);
      expect(alive(child.pid)).toBe(false);
      expect(Date.now() - t).toBeLessThan(8000);
    } finally {
      try {
        child.kill();
      } catch {}
    }
  });

  test("the log never shows the password, wherever the studio prints it", async () => {
    const PW = "log-SECRET-5150";
    const c = computer({ env: { FAKE_MODE: "leak", FAKE_SECRET: PW, PATH: process.env.PATH } });
    const prof = (await c.ok("db/profile/save", { profile: { engine: "mysql", name: "leaky", host: "h" }, password: PW })).profile.id;
    const a = await started(c, { profileId: prof });
    await until(async () => (await c.ok("db/studio/logs", { id: a.studio.id })).lines.length >= 2, "the log lines");
    const logs = await c.api("db/studio/logs", { id: a.studio.id });
    expect(logs.text).not.toContain(PW);
    expect(logs.text).toContain("••••");
    expect(JSON.stringify(await c.ok("db/studio/list"))).not.toContain(PW);
  });

  test("production and read-only connections ask first, because a studio can change data", async () => {
    const c = computer();
    const prod = (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "prod", sqliteMode: "memory", environment: "production" } })).profile.id;
    const ro = (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "ro", sqliteMode: "memory", readOnly: true } })).profile.id;
    for (const [id, reason] of [[prod, "production"], [ro, "readonly"]] as const) {
      const refused = await c.api("db/studio/start", { profileId: id });
      expect(refused.status).toBe(409);
      expect(refused.json.error).toMatchObject({ code: "NEEDS_CONFIRM", details: { reason } });
      expect(refused.json.error.message).toContain("no read-only mode");
      expect((await c.ok("db/studio/list")).studios).toEqual([]);
      const win = await c.api("db/studio/window", { profileId: id });
      expect(win.status).toBe(409);
    }
    const ok = await c.ok("db/studio/start", { profileId: prod, confirmWrites: true });
    expect(ok.studio.writesConfirmed).toBe(true);
    // restarting remembers the answer
    expect((await c.ok("db/studio/restart", { id: ok.studio.id })).studio.writesConfirmed).toBe(true);
  });

  test("the separate window: a desktop program of its own, with the same connection and no parent watch", async () => {
    const calls: Array<{ command: string[]; env: Record<string, string>; cwd: string }> = [];
    const c = computer({ hooks: { spawnWindow: async (command, o) => (calls.push({ command, ...o }), { ok: true }) } });
    const file = join(c.dir, "w.sqlite");
    { const db = new Database(file); db.run("create table t(x)"); db.close(); }
    const id = (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "w", path: file } })).profile.id;
    await c.ok("db/studio/window", { profileId: id });
    expect(calls[0]!.command.slice(-2)).toEqual([FAKE_STUDIO, file]);
    expect(calls[0]!.command).not.toContain("--server");
    expect(calls[0]!.env.SQLITE_STUDIO_DB).toBe(file);
    expect(calls[0]!.env.STUDIO_PARENT_PID).toBeUndefined();
    const my = (await c.ok("db/profile/save", { profile: { engine: "mysql", name: "m", host: "h", database: "shop" }, password: "pw-for-window-1" })).profile.id;
    await c.ok("db/studio/window", { profileId: my });
    expect(calls[1]!.command.slice(-2)).toEqual([FAKE_STUDIO, "shop"]);
    expect(calls[1]!.command.join(" ")).not.toContain("pw-for-window-1");
    expect(calls[1]!.env.MSQL_PASSWORD).toBe("pw-for-window-1");
    // Redis Studio's window takes its address on the command line: a password must not go there
    const red = (await c.ok("db/profile/save", { profile: { engine: "redis", name: "r", host: "h" }, password: "pw-for-window-2" })).profile.id;
    const refused = await c.api("db/studio/window", { profileId: red });
    expect(refused.status).toBe(400);
    expect(refused.json.error.message).toContain("command line");
    expect(calls).toHaveLength(2);
    const failing = computer({ hooks: { spawnWindow: async () => ({ ok: false, reason: "The window closed again straight away." }) } });
    const fid = (await failing.ok("db/profile/save", { profile: { engine: "sqlite", name: "f", sqliteMode: "memory" } })).profile.id;
    expect((await failing.api("db/studio/window", { profileId: fid })).json.error.code).toBe("OPEN_FAILED");
  });

  test("db/shortcuts lists the saved connections without a password, and a SQLite file can be opened in a window by its path", async () => {
    const calls: Array<{ command: string[] }> = [];
    const c = computer({ hooks: { spawnWindow: async (command) => (calls.push({ command }), { ok: true }) } });
    const file = join(c.dir, "s.sqlite");
    { const db = new Database(file); db.run("create table t(x)"); db.close(); }
    await c.ok("db/profile/save", { profile: { engine: "mysql", name: "shop", host: "h", database: "shop", favorite: true }, password: "pw-for-shortcut-1" });
    const list = (await c.ok("db/shortcuts")).shortcuts;
    expect(list.map((s: any) => [s.name, s.label, s.studioAvailable])).toEqual([["shop", "MySQL / MariaDB", true]]);
    expect(JSON.stringify(list)).not.toContain("pw-for-shortcut-1");
    await c.ok("db/studio/window", { engine: "sqlite", path: file });
    expect(calls[0]!.command.slice(-2)).toEqual([FAKE_STUDIO, file]);
    const none = computer({ hooks: { studioCommand: () => null } });
    await none.ok("db/profile/save", { profile: { engine: "sqlite", name: "x", sqliteMode: "memory" } });
    expect((await none.ok("db/shortcuts")).shortcuts[0].studioAvailable).toBe(false);
    expect((await c.ok("settings")).settings.dbShortcut).toBe("window");
    expect((await c.ok("settings", { set: { dbShortcut: "browser" } })).settings.dbShortcut).toBe("browser");
    expect((await c.ok("settings", { set: { dbShortcut: "nonsense" } })).settings.dbShortcut).toBe("window");
  });

  test("'Open in my browser' opens only the address of a running studio of ours", async () => {
    const launched: string[][] = [];
    const c = computer({ hooks: {} });
    (c.server.context as { launch: unknown }).launch = async (command: string, args: string[]) => void launched.push([command, ...args]);
    const a = await started(c, { profileId: await memory(c) });
    await c.ok("db/studio/browser", { id: a.studio.id });
    expect(launched[0]!.join(" ")).toContain(`http://127.0.0.1:${a.studio.port}/`);
    expect((await c.api("db/studio/browser", { id: "st1-made-up" })).json.error.code).toBe("NOT_FOUND");
    await c.ok("db/studio/stop", { id: a.studio.id });
    expect((await c.api("db/studio/browser", { id: a.studio.id })).json.error.code).toBe("NOT_RUNNING");
  });
});

describe("the frame a studio is shown in (the page's policy for it)", () => {
  test("the frame page allows exactly the running studio's address, only on the other loopback address", async () => {
    const c = computer();
    const id = (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: 'x"><script>alert(1)</script>', sqliteMode: "memory" } })).profile.id;
    const a = (await c.ok("db/studio/start", { profileId: id })).studio;
    const primary = `127.0.0.1:${c.server.port}`;
    const other = `localhost:${c.server.port}`;
    const fetchFrame = (host: string, path: string) => fetch(`http://127.0.0.1:${c.server.port}${path}`, { headers: { Host: host } });
    const frame = await fetchFrame(other, `/app/dbstudio/${a.id}/`);
    expect(frame.status).toBe(200);
    const csp = frame.headers.get("content-security-policy")!;
    expect(csp).toContain(`frame-src http://127.0.0.1:${a.port};`);
    expect(csp).toContain(`frame-ancestors http://${primary}`);
    expect(csp).not.toMatch(/\*/);
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("unsafe");
    const html = await frame.text();
    expect(html).toContain(`<iframe title="`);
    expect(html).toContain(`src="http://127.0.0.1:${a.port}/"`);
    expect(html).toContain(`sandbox="${STUDIO_SANDBOX}"`);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("allow-top-navigation");
    // Esc leaves a browser full screen, and the studios use Esc themselves: the frame never gets full screen
    expect(html).toContain('allow="clipboard-write"');
    expect(html).not.toContain("fullscreen");
    expect(html).not.toContain("allow-popups");
    expect(STUDIO_SANDBOX.split(" ").sort()).toEqual(["allow-downloads", "allow-forms", "allow-modals", "allow-same-origin", "allow-scripts"]);
    // not on the File Manager's own address, not for unknown or stopped studios, never with a token in the way
    expect((await fetchFrame(primary, `/app/dbstudio/${a.id}/`)).status).toBe(404);
    const unknown = await fetchFrame(other, "/app/dbstudio/st1-nope/");
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("content-security-policy")).not.toContain("frame-src");
    expect((await fetch(`http://127.0.0.1:${c.server.port}/app/dbstudio/${a.id}/`, { method: "POST", headers: { Host: other } })).status).toBe(405);
    await c.ok("db/studio/stop", { id: a.id });
    const stopped = await fetchFrame(other, `/app/dbstudio/${a.id}/`);
    expect(stopped.status).toBe(404);
    expect(stopped.headers.get("content-security-policy")).not.toContain("frame-src");
    expect(await stopped.text()).not.toContain("<iframe");
    // the page itself is still only allowed to frame its other address
    const index = await fetch(`http://127.0.0.1:${c.server.port}/`);
    expect(index.headers.get("content-security-policy")).toContain(`frame-src http://localhost:${c.server.port}`);
    expect(index.headers.get("content-security-policy")).not.toContain(String(a.port));
  });

  test("two studios get two different frames, each pointing only at its own port", async () => {
    const c = computer();
    const one = (await c.ok("db/studio/start", { profileId: (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "1", sqliteMode: "memory" } })).profile.id })).studio;
    const two = (await c.ok("db/studio/start", { profileId: (await c.ok("db/profile/save", { profile: { engine: "sqlite", name: "2", sqliteMode: "memory" } })).profile.id })).studio;
    const get = async (s: any) => (await fetch(`http://127.0.0.1:${c.server.port}/app/dbstudio/${s.id}/`, { headers: { Host: `localhost:${c.server.port}` } })).headers.get("content-security-policy")!;
    expect(await get(one)).toContain(`frame-src http://127.0.0.1:${one.port};`);
    expect(await get(two)).toContain(`frame-src http://127.0.0.1:${two.port};`);
    expect(await get(one)).not.toContain(String(two.port));
  });
});

describe("the real SQLite Studio, started by the File Manager (no stand-in)", () => {
  test("a real .sqlite file is opened in the studio on its own port and the studio answers with its data", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-db-sqlite-e2e-"));
    const file = join(dir, "people.sqlite");
    const db = new Database(file);
    db.run("create table people(id integer primary key, name text)");
    db.run("insert into people(name) values ('Ada'), ('Grace')");
    db.close();
    const c = computer({ dir, hooks: { studioCommand: undefined, startTimeoutMs: 30_000 } });
    // the default command resolver finds applications/sqlite_studio.ts in this checkout
    delete (c.server.context.databases as Record<string, unknown>).studioCommand;
    try {
      const r = await c.api("db/studio/start", { engine: "sqlite", path: file });
      expect(r.status, r.text).toBe(200);
      const studio = r.json.studio;
      expect(studio.message ?? "").toBe("");
      expect(studio.state).toBe("running");
      const page = await fetch(studio.url);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("SQLite Studio");
      const schema = await (await fetch(`${studio.url}api/schema`)).json();
      expect(JSON.stringify(schema)).toContain("people");
      const rows = await (await fetch(`${studio.url}api/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql: "select name from people order by id" }) })).json();
      expect(JSON.stringify(rows)).toContain("Grace");
      // a request that isn't from the studio's own address is refused by the studio's guard
      const foreign = await fetch(`${studio.url}api/schema`, { headers: { Origin: "http://evil.example" } });
      expect(foreign.status).toBe(403);
      // and the studio is bound to the loopback address only
      expect(studio.url.startsWith("http://127.0.0.1:")).toBe(true);
      const pid = studio.pid;
      await c.ok("db/studio/stop", { id: studio.id });
      await gone(pid);
    } finally {
      c.remove();
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
    }
  });

  test("a file that isn't a SQLite database is refused before any studio starts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fm-db-sqlite-e2e2-"));
    const file = join(dir, "notes.db");
    writeFileSync(file, "just some notes");
    const c = computer({ dir, keychain: new FakeKeychain() });
    const r = await c.api("db/studio/start", { engine: "sqlite", path: file });
    expect(r.json.error.code).toBe("NOT_SQLITE");
    expect((await c.ok("db/studio/list")).studios).toEqual([]);
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
  });
});
