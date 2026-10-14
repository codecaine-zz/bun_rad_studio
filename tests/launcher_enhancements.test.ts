import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  parseArgs, shellQuote, buildShellCommand, windowsCmdQuote, buildWindowsCommand, searchScore, sortApps, sortModeFromLabel, SORT_LABELS,
  relativeTime, usageLabel, isScriptProcess, type LauncherApp,
} from "../src/launcher_tools";
import {
  createLauncherStudio, launchApplication, scanAllApplications, stopAllApplications, getAliveChildren,
  loadHistory, saveHistory, toggleFavorite, clearLaunchHistory, killApplication, getBunExecutable, ensureWebView2Loader,
} from "../applications/launcher_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, id: string, event = "click", val?: any) {
  const h = win.eventHandlersMap.get(`${id}:on${event}`) || win.eventHandlersMap.get(`${id}:${event}`) || win.eventHandlersMap.get(id);
  if (!h) throw new Error(`no handler for ${id}`);
  return await h(win, val);
}

const A = (o: Partial<LauncherApp> & { id: string }): LauncherApp => ({
  name: o.id, displayName: o.id, category: "RAD Studio", displayPath: `./applications/${o.id}.ts`, ...o,
});

describe("parseArgs / quoting", () => {
  test("splits on whitespace and honours quotes and escapes", () => {
    expect(parseArgs("--a 1  --b")).toEqual(["--a", "1", "--b"]);
    expect(parseArgs(`--name "hello world" 'x y'`)).toEqual(["--name", "hello world", "x y"]);
    expect(parseArgs(`a\\ b "c\\"d"`)).toEqual(["a b", 'c"d']);
    expect(parseArgs(`""`)).toEqual([""]);
    expect(parseArgs("   ")).toEqual([]);
    expect(parseArgs(`unterminated "quote here`)).toEqual(["unterminated", "quote here"]);
  });
  test("shellQuote neutralises shell metacharacters", () => {
    expect(shellQuote("plain-1.2/x")).toBe("plain-1.2/x");
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("; rm -rf ~")).toBe("'; rm -rf ~'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(shellQuote("")).toBe("''");
    expect(buildShellCommand(["bun", "run", "/p a/t.ts", "$(id)"])).toBe("bun run '/p a/t.ts' '$(id)'");
  });
  test("quoted command round-trips through a real shell without executing anything", () => {
    const evil = ["x; echo PWNED", "$(echo PWNED)", "`echo PWNED`", "a'b\"c", "two  spaces"];
    const cmd = "printf '%s\\n' " + buildShellCommand(evil);
    const out = Bun.spawnSync(["sh", "-c", cmd]).stdout.toString().trimEnd().split("\n");
    expect(out).toEqual(evil);
  });
});

describe("search, sort, time", () => {
  const apps = [
    A({ id: "task_manager", displayName: "Task Manager", description: "process monitor", launchCount: 2, lastLaunched: 1000 }),
    A({ id: "task_watcher", displayName: "Task Watcher", launchCount: 9, lastLaunched: 500 }),
    A({ id: "redis_studio", displayName: "Redis Studio", category: "Database", launchCount: 0, isFavorite: true }),
    A({ id: "fd_cli", displayName: "Fd CLI", category: "CLI Utilities", isRunning: true }),
  ];
  test("multi-word AND, order-independent, and description/category aware", () => {
    expect(searchScore(apps[0]!, "task manager")).toBeGreaterThan(0);
    expect(searchScore(apps[0]!, "manager task")).toBeGreaterThan(0);
    expect(searchScore(apps[1]!, "task manager")).toBe(0);
    expect(searchScore(apps[0]!, "monitor")).toBeGreaterThan(0);
    expect(searchScore(apps[2]!, "database")).toBeGreaterThan(0);
    expect(searchScore(apps[0]!, "")).toBeGreaterThan(0);
  });
  test("exact and prefix matches outrank loose ones; fuzzy subsequence works", () => {
    expect(searchScore(apps[0]!, "task_manager")).toBeGreaterThan(searchScore(apps[0]!, "manag"));
    expect(searchScore(apps[0]!, "tskmgr")).toBeGreaterThan(0);
    expect(searchScore(apps[2]!, "zzz")).toBe(0);
  });
  test("sort modes", () => {
    expect(sortApps(apps, "recent").map((a) => a.id)[0]).toBe("task_manager");
    expect(sortApps(apps, "most_used").map((a) => a.id)[0]).toBe("task_watcher");
    expect(sortApps(apps, "name").map((a) => a.id)).toEqual(["fd_cli", "redis_studio", "task_manager", "task_watcher"]);
    const d = sortApps(apps, "default").map((a) => a.id);
    expect(d[0]).toBe("redis_studio"); // favourite first
    expect(d[1]).toBe("fd_cli"); // then running
    expect(sortModeFromLabel(SORT_LABELS.most_used)).toBe("most_used");
    expect(sortModeFromLabel("garbage")).toBe("default");
  });
  test("relative time and usage label", () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(undefined, now)).toBe("never");
    expect(relativeTime(now - 5_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(relativeTime(now - 3 * 3600_000, now)).toBe("3h ago");
    expect(relativeTime(now - 2 * 86400_000, now)).toBe("2d ago");
    expect(usageLabel(A({ id: "x" }), now)).toBe("—");
    expect(usageLabel(A({ id: "x", launchCount: 4, lastLaunched: now - 3600_000 }), now)).toBe("4× · 1h ago");
  });
});

describe("isScriptProcess", () => {
  test("matches runtimes running the script, rejects editors and look-alikes", () => {
    const rel = "./applications/fd_studio.ts";
    expect(isScriptProcess("bun", "bun run /p/applications/fd_studio.ts", rel)).toBe(true);
    expect(isScriptProcess("/opt/homebrew/bin/bun", "/opt/homebrew/bin/bun run ./applications/fd_studio.ts", rel)).toBe(true);
    expect(isScriptProcess("node", "node applications/fd_studio.ts", rel)).toBe(true);
    expect(isScriptProcess("vim", "vim applications/fd_studio.ts", rel)).toBe(false);
    expect(isScriptProcess("tail", "tail -f /p/applications/fd_studio.ts", rel)).toBe(false);
    expect(isScriptProcess("bun", "bun run /p/applications/old_fd_studio.ts", rel)).toBe(false);
    expect(isScriptProcess("bun", "bun run /p/applications/fd_studio.ts.bak", rel)).toBe(false);
    // Windows bun.exe and backslash support
    expect(isScriptProcess("bun.exe", "bun.exe run .\\applications\\fd_studio.ts", rel)).toBe(true);
    expect(isScriptProcess("C:\\Users\\user\\.bun\\bin\\bun.exe", "\"C:\\Users\\user\\.bun\\bin\\bun.exe\" run C:\\repo\\applications\\fd_studio.ts", rel)).toBe(true);
  });

  test("Windows command quoting and formatting", () => {
    expect(windowsCmdQuote("simple")).toBe("simple");
    expect(windowsCmdQuote("path with spaces")).toBe(`"path with spaces"`);
    expect(windowsCmdQuote("")).toBe('""');
    expect(buildWindowsCommand(["C:\\Program Files\\bun.exe", "run", "C:\\app.ts", "--flag"])).toBe(
      `"C:\\Program Files\\bun.exe" run C:\\app.ts --flag`
    );
  });

  test("Windows helper utilities resolve safely", () => {
    const bun = getBunExecutable();
    expect(bun.length).toBeGreaterThan(0);
    expect(typeof ensureWebView2Loader()).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// Real launches in an isolated throw-away project
// ---------------------------------------------------------------------------
const origCwd = process.cwd();
const origHist = process.env.LAUNCHER_HISTORY_FILE;
const proj = fs.mkdtempSync(path.join(os.tmpdir(), "launcher-proj-"));
const spawned: any[] = [];
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function waitDead(pid: number, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms && alive(pid)) await Bun.sleep(30); return !alive(pid); }

beforeAll(() => {
  for (const d of ["applications", "cli_apps", "demos"]) fs.mkdirSync(path.join(proj, d));
  const keep = "setInterval(() => {}, 1000);\n";
  fs.writeFileSync(path.join(proj, "applications/zz_alpha_studio.ts"), keep);
  fs.writeFileSync(path.join(proj, "applications/zz_beta_studio.ts"), keep);
  fs.writeFileSync(path.join(proj, "applications/zz_ext_studio.ts"), keep);
  fs.writeFileSync(path.join(proj, "applications/zz_crash_studio.ts"), `console.error("boom: missing dependency");\nprocess.exit(3);\n`);
  fs.writeFileSync(path.join(proj, "cli_apps/zz_echo_cli.ts"), `console.log(JSON.stringify(process.argv.slice(2)));\n`);
  fs.writeFileSync(path.join(proj, "demos/zz_demo.ts"), keep);
  process.chdir(proj);
  process.env.LAUNCHER_HISTORY_FILE = path.join(proj, "history.json");
});
afterAll(() => {
  for (const p of spawned) { try { p.kill(9); } catch {} }
  for (const a of scanAllApplications().apps) { for (const c of getAliveChildren(a.id)) { try { process.kill(c.pid, "SIGKILL"); } catch {} } }
  process.chdir(origCwd);
  if (origHist === undefined) delete process.env.LAUNCHER_HISTORY_FILE; else process.env.LAUNCHER_HISTORY_FILE = origHist;
  fs.rmSync(proj, { recursive: true, force: true });
});

describe("launcher backend in an isolated project", () => {
  test("scan finds only the throw-away tools", () => {
    const ids = scanAllApplications().apps.map((a) => a.id);
    expect(ids).toContain("rad_zz_alpha_studio");
    expect(ids).toContain("cli_zz_echo_cli");
    expect(ids).toContain("demo_zz_demo");
    expect(ids.some((i) => i.includes("task_manager"))).toBe(false);
  });

  test("CLI args: quotes are honoured and shell metacharacters stay inert", async () => {
    const r = await launchApplication("zz_echo_cli", `--name "hello world" ; echo PWNED $(id)`, { timeoutMs: 8000 });
    expect(r.success).toBe(true);
    expect(JSON.parse(r.output!)).toEqual(["--name", "hello world", ";", "echo", "PWNED", "$(id)"]);
  });

  test("GUI launch registers an instance, records history, and Stop terminates it", async () => {
    const r = await launchApplication("zz_alpha_studio");
    expect(r.success).toBe(true);
    expect(alive(r.pid!)).toBe(true);
    expect(getAliveChildren("rad_zz_alpha_studio").length).toBe(1);
    const h = loadHistory().launchHistory["rad_zz_alpha_studio"]!;
    expect(h.count).toBe(1);
    const a = scanAllApplications().apps.find((x) => x.id === "rad_zz_alpha_studio")!;
    expect(a.isRunning).toBe(true);
    expect(a.launchCount).toBe(1);
    expect(killApplication("rad_zz_alpha_studio").success).toBe(true);
    expect(await waitDead(r.pid!)).toBe(true);
  });

  test("an app that crashes on startup is reported with its error output and not counted as a launch", async () => {
    const r = await launchApplication("zz_crash_studio");
    expect(r.success).toBe(false);
    expect(r.message).toContain("exited immediately");
    expect(r.message).toContain("code 3");
    expect(r.output).toContain("boom: missing dependency");
    expect(loadHistory().launchHistory["rad_zz_crash_studio"]).toBeUndefined();
    expect(getAliveChildren("rad_zz_crash_studio").length).toBe(0);
  });

  test("externally started instances are detected; look-alike processes are not", async () => {
    const real = Bun.spawn([process.execPath, "run", path.join(proj, "applications/zz_ext_studio.ts")], { stdout: "ignore", stderr: "ignore" });
    spawned.push(real);
    // a shell whose $0 mentions the script must NOT count as running
    const decoy = Bun.spawn(["sh", "-c", "sleep 300", "./applications/zz_beta_studio.ts"], { stdout: "ignore", stderr: "ignore" });
    spawned.push(decoy);
    await Bun.sleep(500);
    const apps = scanAllApplications().apps;
    expect(apps.find((a) => a.id === "rad_zz_ext_studio")!.isRunning).toBe(true);
    expect(apps.find((a) => a.id === "rad_zz_beta_studio")!.isRunning).toBe(false);
    real.kill(9); decoy.kill(9);
  });

  test("stopAllApplications stops every running instance", async () => {
    const a = await launchApplication("zz_alpha_studio");
    const b = await launchApplication("zz_beta_studio");
    expect(a.success && b.success).toBe(true);
    const res = stopAllApplications();
    expect(res.stopped).toBeGreaterThanOrEqual(2);
    expect(await waitDead(a.pid!)).toBe(true);
    expect(await waitDead(b.pid!)).toBe(true);
  });

  test("history survives garbage, clear keeps favourites, favourites toggle", () => {
    fs.writeFileSync(process.env.LAUNCHER_HISTORY_FILE!, `{"favorites":"oops","launchHistory":null}`);
    expect(loadHistory()).toEqual({ favorites: [], launchHistory: {} });
    fs.writeFileSync(process.env.LAUNCHER_HISTORY_FILE!, "not json");
    expect(loadHistory()).toEqual({ favorites: [], launchHistory: {} });
    saveHistory({ favorites: [], launchHistory: { x: { lastLaunched: 1, count: 3 } } });
    expect(toggleFavorite("rad_zz_alpha_studio")).toBe(true);
    clearLaunchHistory();
    const h = loadHistory();
    expect(h.launchHistory).toEqual({});
    expect(h.favorites).toEqual(["rad_zz_alpha_studio"]);
    expect(toggleFavorite("rad_zz_alpha_studio")).toBe(false);
    expect(fs.readdirSync(proj).filter((f) => f.endsWith(".tmp")).length).toBe(0);
  });
});

describe("launcher window", () => {
  const make = () => createLauncherStudio({ fullscreen: false });
  const rows = (w: SimpleWindow) => w.getValue("tbl_apps") as string[][];
  const names = (w: SimpleWindow) => rows(w).map((r) => r[0]);
  const confirmAs = (w: SimpleWindow, v: boolean) => { (w as any).confirm = async () => v; };

  test("renders the new controls and Used column", () => {
    const html = make().generateHtml();
    for (const id of ["dd_sort", "btn_edit", "btn_copy_path", "btn_stop_all", "btn_clear_history"]) expect(html).toContain(id);
    expect(html).toContain("Recently Used");
    expect(html).toContain("Used");
  });

  test("multi-word search ranks best match first and filters others out", async () => {
    clearLaunchHistory();
    const w = make();
    w.setValue("txt_search", "zz studio alpha");
    await trigger(w, "btn_filter");
    expect(names(w)).toEqual(["rad_zz_alpha_studio"]);
    w.setValue("txt_search", "zz_echo");
    await trigger(w, "btn_filter");
    expect(names(w)).toEqual(["cli_zz_echo_cli"]);
    w.setValue("txt_search", "nothing-matches-this");
    await trigger(w, "btn_filter");
    expect(names(w)).toEqual([]);
  });

  test("sort and 'Recently Used' use launch history; Used column shows it", async () => {
    clearLaunchHistory();
    saveHistory({ favorites: [], launchHistory: {
      rad_zz_beta_studio: { lastLaunched: Date.now() - 60_000, count: 7 },
      rad_zz_alpha_studio: { lastLaunched: Date.now() - 3600_000, count: 2 },
    } });
    const w = make();
    w.setValue("dd_category", "🕘 Recently Used");
    await trigger(w, "btn_filter");
    expect(names(w)).toEqual(["rad_zz_beta_studio", "rad_zz_alpha_studio"]);
    expect(rows(w)[0]![6]).toBe("7× · 1m ago");

    w.setValue("dd_category", "🌟 All Project Tools");
    w.setValue("dd_sort", SORT_LABELS.most_used);
    await trigger(w, "btn_filter");
    expect(names(w).slice(0, 2)).toEqual(["rad_zz_beta_studio", "rad_zz_alpha_studio"]);
    w.setValue("dd_sort", SORT_LABELS.name);
    await trigger(w, "btn_filter");
    const sorted = rows(w).map((r) => r[3]!.replace(/^\S+\s/, ""));
    expect(sorted).toEqual(sorted.slice().sort((a, b) => a.localeCompare(b)));
  });

  test("Stop All asks first, honours a refusal, and clear history needs confirmation", async () => {
    const w = make();
    const r = await launchApplication("zz_alpha_studio");
    expect(r.success).toBe(true);
    confirmAs(w, false);
    await trigger(w, "btn_stop_all");
    expect(alive(r.pid!)).toBe(true);
    expect(String(w.getValue("launcher_console"))).toContain("[Stop All] Cancelled");
    confirmAs(w, true);
    await trigger(w, "btn_stop_all");
    expect(await waitDead(r.pid!)).toBe(true);

    saveHistory({ favorites: [], launchHistory: { a: { lastLaunched: 1, count: 1 } } });
    confirmAs(w, false);
    await trigger(w, "btn_clear_history");
    expect(Object.keys(loadHistory().launchHistory)).toEqual(["a"]);
    confirmAs(w, true);
    await trigger(w, "btn_clear_history");
    expect(loadHistory().launchHistory).toEqual({});
  });

  test("a crashing launch shows the captured error in the output pane", async () => {
    const w = make();
    w.setValue("txt_search", "zz_crash");
    await trigger(w, "btn_filter");
    await trigger(w, "btn_launch");
    for (let i = 0; i < 40 && !String(w.getValue("txt_output")).includes("boom"); i++) await Bun.sleep(100);
    expect(String(w.getValue("txt_output"))).toContain("boom: missing dependency");
  });
});
