import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";
import {
  DEFAULT_WINDOW_SIZE,
  MAX_WINDOW_SIZE,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  WINDOW_FILE,
  mergeNormalBounds,
  planWindow,
  readWindowPrefs,
  reduceReport,
  resetWindowPrefs,
  sanitizeWindowPrefs,
  sanitizeWindowState,
  windowDataDir,
  writeWindowPrefs,
  type FmScreen,
  type WindowPrefs,
  type WindowState,
} from "../src/features/filemanager/fmWindow";
import { bindWindowControl, createWindowController, openManagedWindow } from "../src/features/filemanager/fmWindowControl";
import { parseMacFrame, parseMacScreens, parseXrandr, type FrameInfo, type WindowBounds, type WindowNative } from "../src/windowNative";

// Scratch folders live inside the project (cleaned up below), never in the system's temporary folder.
const root = mkdtempSync(join(import.meta.dir, ".fm-window-test-"));
let counter = 0;
const folder = () => join(root, `d${++counter}`);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const state = (over: Partial<WindowState> = {}): WindowState => ({ x: 100, y: 80, width: 1000, height: 700, maximized: false, fullscreen: false, screenWidth: 1728, screenHeight: 1117, dpr: 2, ...over });
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
/** A MacBook: a 1728 × 1117 screen with a 33 px menu bar and a Dock at the bottom. */
const mac: FmScreen = { ...rect(0, 0, 1728, 1117), work: rect(0, 33, 1728, 1005) };
/** A 1920 × 1080 monitor to the left of the MacBook (negative x) and one above it (negative y). */
const left: FmScreen = { ...rect(-1920, 0, 1920, 1080), work: rect(-1920, 25, 1920, 1055) };
const above: FmScreen = { ...rect(0, -1080, 1920, 1080), work: rect(0, -1080, 1920, 1080) };

describe("validating a remembered window", () => {
  test("a good window passes through unchanged, with whole numbers", () => {
    expect(sanitizeWindowState(state())).toEqual(state());
    expect(sanitizeWindowState({ ...state(), x: 100.6, y: 80.4, width: 999.5 })).toMatchObject({ x: 101, y: 80, width: 1000 });
  });

  test("anything that isn't a usable window gives null", () => {
    const base = state();
    const broken: unknown[] = [
      null, undefined, 0, "", "x", [], true, () => 1,
      {}, { x: 1, y: 2 }, { ...base, x: undefined }, { ...base, y: null }, { ...base, width: undefined }, { ...base, height: "tall" },
      { ...base, x: NaN }, { ...base, y: Infinity }, { ...base, width: -Infinity }, { ...base, height: NaN },
      { ...base, x: "100" }, { ...base, width: "1000" }, { ...base, width: {} }, { ...base, height: [700] },
    ];
    for (const b of broken) expect(sanitizeWindowState(b), JSON.stringify(b)).toBeNull();
  });

  test("sizes are brought into range: at least 640 × 420, at most 16384; coordinates stay sane", () => {
    expect(sanitizeWindowState({ ...state(), width: 1, height: 1 })).toMatchObject({ width: MIN_WINDOW_WIDTH, height: MIN_WINDOW_HEIGHT });
    expect(sanitizeWindowState({ ...state(), width: -500, height: -9 })).toMatchObject({ width: MIN_WINDOW_WIDTH, height: MIN_WINDOW_HEIGHT });
    expect(sanitizeWindowState({ ...state(), width: 1e9, height: 99999 })).toMatchObject({ width: MAX_WINDOW_SIZE, height: MAX_WINDOW_SIZE });
    expect(sanitizeWindowState({ ...state(), x: 1e12, y: -1e12 })).toMatchObject({ x: 100000, y: -100000 });
    expect(sanitizeWindowState({ ...state(), x: -3000 })).toMatchObject({ x: -3000 });
  });

  test("flags, screen size and pixel density fall back to safe values", () => {
    const s = sanitizeWindowState({ x: 1, y: 2, width: 800, height: 600, maximized: "yes", fullscreen: 1, screenWidth: "wide", screenHeight: NaN, dpr: "2" });
    expect(s).toEqual({ x: 1, y: 2, width: 800, height: 600, maximized: false, fullscreen: false, screenWidth: 0, screenHeight: 0, dpr: 1 });
    for (const [given, wanted] of [[1, 1], [2, 2], [3, 3], [1.5, 1.5], [0, 0.5], [-4, 0.5], [99, 8], [NaN, 1], [Infinity, 1]] as const) {
      expect(sanitizeWindowState({ ...state(), dpr: given })!.dpr, `dpr ${given}`).toBe(wanted);
    }
    expect(sanitizeWindowState({ ...state(), maximized: true, fullscreen: true })).toMatchObject({ maximized: true, fullscreen: true });
  });

  test("fuzz: whatever comes in, the result is null or fully valid", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const junk = [NaN, Infinity, -Infinity, 0, -1, 1, 639, 640, 16384, 16385, 1e300, -1e300, "1", "", null, undefined, true, {}, [], 0.5, 1.5, 2 ** 53];
    const pick = () => junk[Math.floor(rnd() * junk.length)];
    for (let i = 0; i < 2000; i++) {
      const raw = { x: pick(), y: pick(), width: pick(), height: pick(), maximized: pick(), fullscreen: pick(), screenWidth: pick(), screenHeight: pick(), dpr: pick() };
      const s = sanitizeWindowState(raw);
      if (!s) continue;
      for (const n of [s.x, s.y, s.width, s.height, s.screenWidth, s.screenHeight, s.dpr]) expect(Number.isFinite(n)).toBe(true);
      expect(s.width).toBeGreaterThanOrEqual(MIN_WINDOW_WIDTH);
      expect(s.width).toBeLessThanOrEqual(MAX_WINDOW_SIZE);
      expect(s.height).toBeGreaterThanOrEqual(MIN_WINDOW_HEIGHT);
      expect(s.height).toBeLessThanOrEqual(MAX_WINDOW_SIZE);
      expect(s.dpr).toBeGreaterThanOrEqual(0.5);
      expect(s.dpr).toBeLessThanOrEqual(8);
      expect(typeof s.maximized).toBe("boolean");
      expect(typeof s.fullscreen).toBe("boolean");
      // and planning with it always gives a window that fits on the screen
      const plan = planWindow({ mode: "remember", state: s }, [mac]);
      expect(plan.width).toBeLessThanOrEqual(mac.work.width);
      expect(plan.height).toBeLessThanOrEqual(mac.work.height);
      expect(plan.x!).toBeGreaterThanOrEqual(mac.work.x);
      expect(plan.y!).toBeGreaterThanOrEqual(mac.work.y);
      expect(plan.x! + plan.width).toBeLessThanOrEqual(mac.work.x + mac.work.width);
      expect(plan.y! + plan.height).toBeLessThanOrEqual(mac.work.y + mac.work.height);
    }
  });

  test("the preference: an unknown mode is 'fill', a bad state is dropped, the mode stays", () => {
    expect(sanitizeWindowPrefs(null)).toEqual({ mode: "fill", state: null });
    expect(sanitizeWindowPrefs({ mode: "huge", state: state() })).toEqual({ mode: "fill", state: state() });
    expect(sanitizeWindowPrefs({ mode: "fullscreen", state: { x: NaN } })).toEqual({ mode: "fullscreen", state: null });
    expect(sanitizeWindowPrefs({ mode: "remember", state: state() })).toEqual({ mode: "remember", state: state() });
    expect(sanitizeWindowPrefs([])).toEqual({ mode: "fill", state: null });
  });
});

describe("planning where the window goes", () => {
  const fill: WindowPrefs = { mode: "fill", state: null };

  test("the default fills the usable screen: maximise, with a centered 1280 × 820 to go back to", () => {
    expect(planWindow(fill, [mac])).toEqual({ mode: "maximize", x: 224, y: 125, width: 1280, height: 820, work: mac.work, reason: "default" });
  });

  test("on a small screen the default size shrinks to fit; no screens means 'let the system center it'", () => {
    const small: FmScreen = { ...rect(0, 0, 1024, 768), work: rect(0, 25, 1024, 743) };
    expect(planWindow(fill, [small])).toMatchObject({ mode: "maximize", width: 1024, height: 743, x: 0, y: 25 });
    expect(planWindow(fill, [])).toEqual({ mode: "maximize", x: null, y: null, width: DEFAULT_WINDOW_SIZE.width, height: DEFAULT_WINDOW_SIZE.height, work: null, reason: "no-screens" });
    expect(planWindow(fill, [{ x: NaN, y: 0, width: 1, height: 1, work: rect(0, 0, 1, 1) }])).toMatchObject({ reason: "no-screens" });
  });

  test("'True full screen' plans full screen; 'Remember' with nothing saved plans the default", () => {
    expect(planWindow({ mode: "fullscreen", state: null }, [mac])).toMatchObject({ mode: "fullscreen", reason: "default", width: 1280, height: 820 });
    expect(planWindow({ mode: "remember", state: null }, [mac])).toMatchObject({ mode: "maximize", reason: "default" });
  });

  test("a saved window that is on the screen comes back exactly as it was", () => {
    for (const dpr of [1, 2, 3]) {
      expect(planWindow({ mode: "remember", state: state({ dpr }) }, [mac])).toEqual({ mode: "normal", x: 100, y: 80, width: 1000, height: 700, work: mac.work, reason: "saved" });
    }
  });

  test("a saved window that sticks out of the screen is pulled back in, and one that is too big is shrunk", () => {
    expect(planWindow({ mode: "remember", state: state({ x: 1500, y: 900 }) }, [mac])).toMatchObject({ x: 728, y: 338, width: 1000, height: 700, reason: "adjusted" });
    expect(planWindow({ mode: "remember", state: state({ x: -300, y: -50 }) }, [mac])).toMatchObject({ x: 0, y: 33, reason: "adjusted" });
    expect(planWindow({ mode: "remember", state: state({ x: 0, y: 0, width: 5000, height: 4000 }) }, [mac])).toMatchObject({ x: 0, y: 33, width: 1728, height: 1005, reason: "adjusted" });
  });

  test("maximised and full screen are restored as such, keeping the size to un-maximise to", () => {
    expect(planWindow({ mode: "remember", state: state({ maximized: true }) }, [mac])).toMatchObject({ mode: "maximize", width: 1000, height: 700, x: 100, y: 80 });
    expect(planWindow({ mode: "remember", state: state({ fullscreen: true }) }, [mac])).toMatchObject({ mode: "fullscreen", width: 1000, height: 700 });
  });

  test("a window on a second monitor (negative coordinates) stays there while that monitor exists", () => {
    const s = state({ x: -1500, y: 100, width: 1200, height: 800 });
    expect(planWindow({ mode: "remember", state: s }, [mac, left])).toMatchObject({ mode: "normal", x: -1500, y: 100, width: 1200, height: 800, work: left.work, reason: "saved" });
    expect(planWindow({ mode: "remember", state: state({ x: 200, y: -900, width: 1200, height: 800 }) }, [mac, above])).toMatchObject({ x: 200, y: -900, reason: "saved", work: above.work });
  });

  test("a window saved on a monitor that is gone comes back centered on the primary screen, fully visible", () => {
    const s = state({ x: -1500, y: 100, width: 1200, height: 800 });
    const plan = planWindow({ mode: "remember", state: s }, [mac]);
    expect(plan).toEqual({ mode: "normal", x: 264, y: 135, width: 1200, height: 800, work: mac.work, reason: "offscreen" });
    expect(planWindow({ mode: "remember", state: state({ x: 90000, y: 90000 }) }, [mac])).toMatchObject({ reason: "offscreen", x: 364, y: 185 });
    expect(planWindow({ mode: "remember", state: state({ x: -3000, y: 100, maximized: true }) }, [mac])).toMatchObject({ mode: "maximize", reason: "offscreen" });
    // only a sliver left on the screen doesn't count as being on it
    expect(planWindow({ mode: "remember", state: state({ x: 1700, y: 100 }) }, [mac])).toMatchObject({ reason: "offscreen" });
  });

  test("it picks the monitor holding most of the window", () => {
    const straddling = state({ x: -400, y: 100, width: 1000, height: 700 }); // 400 px on the left monitor, 600 on the primary
    expect(planWindow({ mode: "remember", state: straddling }, [mac, left])).toMatchObject({ x: 0, y: 100, work: mac.work, reason: "adjusted" });
  });

  test("planning never throws on odd screens", () => {
    expect(() => planWindow({ mode: "remember", state: state() }, null as unknown as FmScreen[])).not.toThrow();
    expect(() => planWindow({ mode: "remember", state: state() }, [{ x: 0, y: 0, width: 0, height: 0, work: rect(0, 0, 0, 0) }])).not.toThrow();
    expect(planWindow({ mode: "remember", state: state() }, [mac], { width: NaN, height: -5 }).reason).toBe("saved");
  });
});

describe("what a report from the page means", () => {
  const fill: WindowPrefs = { mode: "fill", state: null };

  test("in 'fill' mode a window that still fills the screen changes nothing", () => {
    const r = reduceReport(fill, state({ maximized: true }));
    expect(r.save).toBe(false);
    expect(r.prefs).toBe(fill);
  });

  test("in 'fill' mode a resize, a move or un-maximising switches to 'remember' and saves that window", () => {
    const r = reduceReport(fill, state({ x: 10, y: 20 }));
    expect(r).toEqual({ prefs: { mode: "remember", state: state({ x: 10, y: 20 }) }, save: true, modeSwitched: true });
    expect(reduceReport(fill, state({ fullscreen: true })).modeSwitched).toBe(true);
  });

  test("in 'fullscreen' mode staying in full screen changes nothing, leaving it switches to 'remember'", () => {
    const fs: WindowPrefs = { mode: "fullscreen", state: null };
    expect(reduceReport(fs, state({ fullscreen: true })).save).toBe(false);
    expect(reduceReport(fs, state())).toMatchObject({ save: true, modeSwitched: true, prefs: { mode: "remember" } });
  });

  test("in 'remember' mode only a different window is saved, and the mode doesn't switch again", () => {
    const remembered: WindowPrefs = { mode: "remember", state: state() };
    expect(reduceReport(remembered, state()).save).toBe(false);
    expect(reduceReport(remembered, { ...state(), junk: 1 }).save).toBe(false);
    expect(reduceReport(remembered, state({ width: 1100 }))).toMatchObject({ save: true, modeSwitched: false, prefs: { mode: "remember", state: { width: 1100 } } });
  });

  test("a report that isn't a usable window is ignored", () => {
    for (const bad of [null, {}, "x", { x: NaN, y: 0, width: 800, height: 600 }]) expect(reduceReport(fill, bad).save).toBe(false);
  });

  test("while maximised or full screen, the window's own size and position are kept to un-maximise to", () => {
    const remembered: WindowPrefs = { mode: "remember", state: state() };
    const r = reduceReport(remembered, state({ x: 0, y: 33, width: 1728, height: 1005, maximized: true }));
    expect(r.prefs.state).toMatchObject({ x: 100, y: 80, width: 1000, height: 700, maximized: true });
    expect(mergeNormalBounds(null, state({ maximized: true }))).toEqual(state({ maximized: true }));
    expect(mergeNormalBounds(state(), state({ x: 5, y: 6 }))).toEqual(state({ x: 5, y: 6 }));
  });
});

describe("the window file", () => {
  test("a missing file is the default; nothing is created by reading", () => {
    const dir = folder();
    expect(readWindowPrefs(dir)).toEqual({ mode: "fill", state: null });
    expect(existsSync(dir)).toBe(false);
  });

  test("it is written privately (0600), atomically, and read back", () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state() });
    const file = join(dir, WINDOW_FILE);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ version: 1, mode: "remember", state: state() });
    expect(readWindowPrefs(dir)).toEqual({ mode: "remember", state: state() });
    expect(readdirSync(dir)).toEqual([WINDOW_FILE]); // no temporary file is left behind
  });

  test("a damaged or wrong file is ignored and then replaced", () => {
    for (const text of ["{ not json", "", "null", "[]", '{"mode":"fill","state":{"x":"a"}}', "\u0000\u0001", "{".repeat(10000)]) {
      const dir = folder();
      writeWindowPrefs(dir, defaultThenBreak(dir, text));
      expect(readWindowPrefs(dir)).toEqual({ mode: "fill", state: null });
      writeWindowPrefs(dir, { mode: "remember", state: state() });
      expect(readWindowPrefs(dir)).toEqual({ mode: "remember", state: state() });
    }
  });

  test("it is written validated: a bad state can't be stored", () => {
    const dir = folder();
    const saved = writeWindowPrefs(dir, { mode: "remember", state: { ...state(), width: NaN } as unknown as WindowState });
    expect(saved).toEqual({ mode: "remember", state: null });
    expect(JSON.parse(readFileSync(join(dir, WINDOW_FILE), "utf8")).state).toBeNull();
  });

  test("the last writer wins and the file is never half-written", async () => {
    const dir = folder();
    await Promise.all(Array.from({ length: 40 }, async (_, i) => writeWindowPrefs(dir, { mode: "remember", state: state({ width: 700 + i }) })));
    const prefs = readWindowPrefs(dir);
    expect(prefs.mode).toBe("remember");
    expect(prefs.state!.width).toBeGreaterThanOrEqual(700);
    expect(readdirSync(dir)).toEqual([WINDOW_FILE]);
  });

  test.skipIf(process.platform !== "win32")("a short Windows file lock does not lose the saved preference", async () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state() });
    const proc = Bun.spawn(["powershell.exe", "-NoProfile", "-Command",
      "$file = [IO.File]::Open($env:WINDOW_PREFS_FILE, 'Open', 'Read', 'ReadWrite'); try { [Console]::WriteLine('LOCKED'); Start-Sleep -Milliseconds 100 } finally { $file.Dispose() }"],
    { env: { ...process.env, WINDOW_PREFS_FILE: join(dir, WINDOW_FILE) }, stdout: "pipe", stderr: "pipe" });
    try {
      const reader = proc.stdout.getReader();
      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toContain("LOCKED");
      reader.releaseLock();
      writeWindowPrefs(dir, { mode: "remember", state: state({ width: 1100 }) });
      expect(readWindowPrefs(dir).state?.width).toBe(1100);
      expect(readdirSync(dir)).toEqual([WINDOW_FILE]);
      expect(await proc.exited, await new Response(proc.stderr).text()).toBe(0);
    } finally {
      proc.kill();
      await proc.exited;
    }
  });

  test.skipIf(process.platform !== "win32")("a persistent Windows lock reports the error and preserves the previous preference", async () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state() });
    const proc = Bun.spawn(["powershell.exe", "-NoProfile", "-Command",
      "$file = [IO.File]::Open($env:WINDOW_PREFS_FILE, 'Open', 'Read', 'ReadWrite'); try { [Console]::WriteLine('LOCKED'); [Console]::ReadLine() | Out-Null } finally { $file.Dispose() }"],
    { env: { ...process.env, WINDOW_PREFS_FILE: join(dir, WINDOW_FILE) }, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    try {
      const reader = proc.stdout.getReader();
      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toContain("LOCKED");
      reader.releaseLock();
      expect(() => writeWindowPrefs(dir, { mode: "remember", state: state({ width: 1100 }) })).toThrow();
      expect(readWindowPrefs(dir).state?.width).toBe(1000);
      expect(readdirSync(dir)).toEqual([WINDOW_FILE]);
      proc.stdin.write("\n");
      proc.stdin.end();
      expect(await proc.exited, await new Response(proc.stderr).text()).toBe(0);
    } finally {
      proc.kill();
      await proc.exited;
    }
  });

  test("a write that can't happen throws and leaves no temporary file", () => {
    const dir = folder();
    writeFileSync(dir, "a file, not a folder");
    expect(() => writeWindowPrefs(dir, { mode: "fill", state: null })).toThrow();
  });

  test("reset deletes the file, also when there is none", () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state() });
    expect(resetWindowPrefs(dir)).toEqual({ mode: "fill", state: null });
    expect(existsSync(join(dir, WINDOW_FILE))).toBe(false);
    expect(() => resetWindowPrefs(dir)).not.toThrow();
  });

  test("the data folder is the one the server uses (--data-dir, else ~/.bun_rad_studio)", () => {
    expect(windowDataDir({ dataDir: "/a/b" })).toBe(resolve("/a/b"));
    expect(windowDataDir({ home: "/h" })).toBe(resolve("/h/.bun_rad_studio"));
    expect(windowDataDir({ home: "/h", dataDir: "/d" })).toBe(resolve("/d"));
  });
});

/** Writes a damaged file into `dir` and returns the (valid) prefs to write over it afterwards. */
function defaultThenBreak(dir: string, text: string): WindowPrefs {
  writeWindowPrefs(dir, { mode: "fill", state: null });
  writeFileSync(join(dir, WINDOW_FILE), text);
  return { mode: "fill", state: null };
}

describe("reading the screens", () => {
  test("macOS: bottom-left coordinates become top-left ones measured from the primary screen", () => {
    // The MacBook, and a 1920 × 1080 monitor whose bottom edge lines up with the MacBook's bottom, to its left.
    const screens = parseMacScreens("0,0,1728,1117,0,79,1728,1005;-1920,0,1920,1080,-1920,0,1920,1055");
    expect(screens[0]).toEqual({ x: 0, y: 0, width: 1728, height: 1117, work: { x: 0, y: 33, width: 1728, height: 1005 } });
    expect(screens[1]).toEqual({ x: -1920, y: 37, width: 1920, height: 1080, work: { x: -1920, y: 62, width: 1920, height: 1055 } });
    expect(parseMacScreens("")).toEqual([]);
    expect(parseMacScreens("garbage;1,2")).toEqual([]);
  });

  test("macOS: a saved window frame (text) becomes a top-left frame", () => {
    expect(parseMacFrame("364 306 1000 700 0 0 1728 1084", 1117)).toEqual({ x: 364, y: 111, width: 1000, height: 700 });
    expect(parseMacFrame("nope", 1117)).toBeNull();
    expect(parseMacFrame("1 2 3 4", NaN)).toBeNull();
  });

  test("Linux: xrandr's monitors, the primary first", () => {
    const text = "Screen 0: minimum 320 x 200\nHDMI-1 connected 1920x1080+1920+0 (normal left inverted) 527mm x 296mm\neDP-1 connected primary 1920x1080+0+0 (normal) 344mm x 193mm\nDP-1 disconnected (normal)\n";
    const screens = parseXrandr(text);
    expect(screens.map((s) => [s.x, s.y, s.width, s.height])).toEqual([[0, 0, 1920, 1080], [1920, 0, 1920, 1080]]);
    expect(screens[0]!.work.y).toBeGreaterThan(0);
    expect(parseXrandr("")).toEqual([]);
  });
});

/** A native layer that only writes down what it was asked to do. */
function fakeNative(options: { screens?: FmScreen[]; maximizeWorks?: boolean; throwOn?: string[]; frame?: () => FrameInfo | null; fullscreenWorks?: boolean } = {}) {
  const log: string[] = [];
  const bounds: WindowBounds[] = [];
  const native: WindowNative = {
    getScreens() {
      log.push("screens");
      if (options.throwOn?.includes("screens")) throw new Error("no screens");
      return options.screens ?? [mac];
    },
    hide() { log.push("hide"); if (options.throwOn?.includes("hide")) throw new Error("x"); },
    show() { log.push("show"); if (options.throwOn?.includes("show")) throw new Error("x"); },
    setBounds(b) { log.push("setBounds"); bounds.push(b); if (options.throwOn?.includes("setBounds")) throw new Error("x"); },
    maximize() { log.push("maximize"); if (options.throwOn?.includes("maximize")) throw new Error("x"); return options.maximizeWorks !== false; },
    unmaximize() { log.push("unmaximize"); },
    setFullscreen(on) { log.push(`fullscreen:${on}`); if (options.throwOn?.includes("fullscreen")) throw new Error("x"); return options.fullscreenWorks !== false; },
    getFrame() { log.push("getFrame"); if (options.throwOn?.includes("getFrame")) throw new Error("x"); return options.frame ? options.frame() : null; },
  };
  return { native, log, bounds };
}

const only = (log: string[], names: string[]) => log.filter((l) => names.includes(l));

describe("opening the window", () => {
  test("the order: create, size and place, maximise, then show; the window is hidden before anything is drawn", () => {
    const dir = folder();
    const f = fakeNative();
    const calls: string[] = f.log;
    const opened = openManagedWindow({
      createWindow: () => { calls.push("create"); return { bind: (name: string) => void calls.push(`bind:${name}`) }; },
      createNative: () => f.native,
      dataDir: dir,
    });
    expect(opened.plan).toMatchObject({ mode: "maximize", x: 224, y: 125, width: 1280, height: 820 });
    expect(only(calls, ["create", "hide", "setBounds", "maximize", "show"])).toEqual(["create", "hide", "hide", "setBounds", "maximize", "show"]);
    expect(calls.indexOf("create")).toBeLessThan(calls.indexOf("hide"));
    expect(calls.indexOf("setBounds")).toBeLessThan(calls.indexOf("maximize"));
    expect(calls.indexOf("maximize")).toBeLessThan(calls.lastIndexOf("show"));
    expect(f.bounds).toEqual([{ x: 224, y: 125, width: 1280, height: 820 }]);
    expect(calls.filter((c) => c.startsWith("bind:"))).toEqual(["bind:fmWindowPoll", "bind:fmWindowChanged", "bind:fmWindowSave", "bind:fmWindowReset", "bind:fmWindowApply", "bind:fmWindowAlwaysOnTop"]);
    expect(existsSync(join(dir, WINDOW_FILE))).toBe(false); // opening at the default writes nothing
  });

  test("a remembered window: size and place it, no maximise, then show", () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state() });
    const f = fakeNative();
    openManagedWindow({ createWindow: () => ({ bind() {} }), createNative: () => f.native, dataDir: dir });
    expect(only(f.log, ["setBounds", "maximize", "show", "fullscreen:true"])).toEqual(["setBounds", "show"]);
    expect(f.bounds).toEqual([{ x: 100, y: 80, width: 1000, height: 700 }]);
  });

  test("remembered full screen and 'True full screen' enter full screen before the window is shown", () => {
    for (const prefs of [{ mode: "fullscreen", state: null }, { mode: "remember", state: state({ fullscreen: true }) }] as WindowPrefs[]) {
      const dir = folder();
      writeWindowPrefs(dir, prefs);
      const f = fakeNative();
      openManagedWindow({ createWindow: () => ({ bind() {} }), createNative: () => f.native, dataDir: dir });
      expect(only(f.log, ["setBounds", "fullscreen:true", "show"])).toEqual(["setBounds", "fullscreen:true", "show"]);
    }
  });

  test("if maximising isn't possible the window is sized to the usable screen instead, and tried again later", () => {
    const f = fakeNative({ maximizeWorks: false });
    const c = createWindowController({ native: f.native, dataDir: folder() });
    c.open(c.plan());
    expect(f.bounds.at(-1)).toEqual({ x: mac.work.x, y: mac.work.y, width: mac.work.width, height: mac.work.height });
    expect(only(f.log, ["maximize"]).length).toBe(1);
    c.poll();
    expect(only(f.log, ["maximize"]).length).toBe(2); // the page's next poll tries again
  });

  test("if pre-runloop full screen is dropped by macOS before the window loop starts, poll() re-enters full screen and entering full screen persists immediately", () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state({ fullscreen: true }) });
    let isFull = false;
    let callCount = 0;
    const f = fakeNative({
      frame: () => ({ x: 100, y: 80, width: 1000, height: 700, maximized: false, fullscreen: isFull }),
    });
    f.native.setFullscreen = (on) => {
      f.log.push(`fullscreen:${on}`);
      callCount++;
      // Simulate macOS ignoring the pre-runloop call (#1) and accepting the in-runloop poll() call (#2)
      if (callCount >= 2) isFull = on;
      return true;
    };
    const c = createWindowController({ native: f.native, dataDir: dir });
    c.open(c.plan());
    expect(only(f.log, ["fullscreen:true"]).length).toBe(1);
    expect(isFull).toBe(false);
    const polled = c.poll();
    expect(only(f.log, ["fullscreen:true"]).length).toBe(2);
    expect(polled?.fullscreen).toBe(true);

    // Entering full screen from normal/fill mode persists fullscreen:true on the next poll even during the grace period
    const dir2 = folder();
    let full2 = false;
    const f2 = fakeNative({
      frame: () => ({ x: 224, y: 77, width: 1280, height: 820, maximized: false, fullscreen: full2 }),
    });
    const c2 = createWindowController({ native: f2.native, dataDir: dir2 });
    c2.open(c2.plan());
    full2 = true;
    c2.poll();
    expect(readWindowPrefs(dir2)).toMatchObject({ mode: "remember", state: { fullscreen: true } });
  });

  test("a native call that throws never stops the window from opening: the others still happen and it is shown", () => {
    for (const call of ["screens", "hide", "setBounds", "maximize", "show", "getFrame"]) {
      const f = fakeNative({ throwOn: [call] });
      const dir = folder();
      let opened: ReturnType<typeof openManagedWindow> | undefined;
      expect(() => { opened = openManagedWindow({ createWindow: () => ({ bind() {} }), createNative: () => f.native, dataDir: dir }); }, call).not.toThrow();
      expect(f.log, call).toContain("show");
      expect(opened!.plan.mode, call).toBe("maximize");
      expect(opened!.controller.poll, call).toBeDefined();
    }
  });

  test("when full screen isn't possible, the window fills the screen instead", () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "fullscreen", state: null });
    const f = fakeNative({ fullscreenWorks: false });
    openManagedWindow({ createWindow: () => ({ bind() {} }), createNative: () => f.native, dataDir: dir });
    expect(f.bounds.at(-1)).toMatchObject({ width: mac.work.width, height: mac.work.height });
  });

  test("a screen list that can't be read still opens a window at the default size", () => {
    const f = fakeNative({ throwOn: ["screens"] });
    const opened = openManagedWindow({ createWindow: () => ({ bind() {} }), createNative: () => f.native, dataDir: folder() });
    expect(opened.plan).toMatchObject({ x: null, y: null, width: 1280, height: 820, reason: "no-screens" });
  });

  test("an explicit size (--width/--height) is used once: no maximising, nothing restored, nothing saved", () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state() });
    const f = fakeNative();
    const opened = openManagedWindow({ createWindow: () => ({ bind() {} }), createNative: () => f.native, dataDir: dir, fixedSize: { width: 900, height: 600 } });
    expect(opened.plan).toMatchObject({ mode: "normal", width: 900, height: 600 });
    expect(f.log).not.toContain("maximize");
    expect(opened.controller.changed(state({ width: 777 }))).toMatchObject({ saved: false });
    expect(readWindowPrefs(dir).state).toEqual(state()); // untouched
    expect(opened.controller.save(state()).ok).toBe(false);
  });

  test("--reset-window forgets the remembered window before opening", () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state() });
    const f = fakeNative();
    const opened = openManagedWindow({ createWindow: () => ({ bind() {} }), createNative: () => f.native, dataDir: dir, reset: true });
    expect(existsSync(join(dir, WINDOW_FILE))).toBe(false);
    expect(opened.plan.mode).toBe("maximize");
  });
});

describe("the window process and the page's reports", () => {
  let clock = 0;
  const make = (prefs?: WindowPrefs, native = fakeNative()) => {
    const dir = folder();
    if (prefs) writeWindowPrefs(dir, prefs);
    clock = 10_000;
    const c = createWindowController({ native: native.native, dataDir: dir, now: () => clock, graceMs: 1500 });
    c.open(c.plan());
    return { c, dir, native };
  };

  test("reports right after the app itself moved the window are ignored (the page sends them again)", () => {
    const { c, dir } = make();
    expect(c.changed(state({ x: 1 }))).toMatchObject({ ok: true, saved: false, ignored: true });
    expect(existsSync(join(dir, WINDOW_FILE))).toBe(false);
    clock += 1600;
    expect(c.changed(state({ x: 1 }))).toMatchObject({ saved: true, ignored: false, modeSwitched: true, mode: "remember" });
  });

  test("opening at the default doesn't write; a real change does, once, and switches the mode", () => {
    const { c, dir } = make();
    clock += 2000;
    expect(c.changed(state({ maximized: true }))).toMatchObject({ saved: false });
    expect(existsSync(join(dir, WINDOW_FILE))).toBe(false);
    expect(c.changed(state({ x: 7 }))).toMatchObject({ saved: true, modeSwitched: true });
    expect(readWindowPrefs(dir)).toEqual({ mode: "remember", state: state({ x: 7 }) });
    expect(c.changed(state({ x: 7 }))).toMatchObject({ saved: false, modeSwitched: false });
    expect(c.changed(state({ x: 8 }))).toMatchObject({ saved: true, modeSwitched: false });
  });

  test("the mode is read from the file each time, so a change made in Settings is respected", () => {
    const { c, dir } = make();
    clock += 2000;
    writeWindowPrefs(dir, { mode: "fullscreen", state: null }); // Settings → True full screen (a different process)
    expect(c.changed(state({ fullscreen: true }))).toMatchObject({ saved: false });
    expect(readWindowPrefs(dir).mode).toBe("fullscreen");
  });

  test("a report that can't be saved answers { ok: false } instead of throwing", () => {
    const dir = folder();
    clock = 0;
    const c = createWindowController({ native: fakeNative().native, dataDir: join(dir, "x", "y"), now: () => clock });
    writeFileSync(dir, "a file where the folder should be");
    clock = 99_999;
    expect(c.changed(state())).toMatchObject({ ok: false, saved: false });
  });

  test("'Use this window as my preference now' saves the real frame, switching to 'remember'", () => {
    const { c, dir } = make(undefined, fakeNative({ frame: () => ({ x: 50, y: 60, width: 1100, height: 750, maximized: false, fullscreen: false }) }));
    expect(c.save({ screenWidth: 1728, screenHeight: 1117, dpr: 2 })).toEqual({ ok: true, mode: "remember" });
    expect(readWindowPrefs(dir)).toEqual({ mode: "remember", state: state({ x: 50, y: 60, width: 1100, height: 750 }) });
  });

  test("saving without a readable frame uses the page's numbers; without either it says no", () => {
    const { c, dir } = make();
    expect(c.save(state({ x: 5 })).ok).toBe(true);
    expect(readWindowPrefs(dir).state).toMatchObject({ x: 5 });
    const nothing = make();
    expect(nothing.c.save({}).ok).toBe(false);
    expect(nothing.c.save(null).ok).toBe(false);
  });

  test("reset forgets the saved window, goes back to 'fill' and maximises now", () => {
    const { c, dir, native } = make({ mode: "remember", state: state() });
    native.log.length = 0;
    expect(c.reset()).toEqual({ ok: true, settled: true, mode: "fill" });
    expect(existsSync(join(dir, WINDOW_FILE))).toBe(false);
    expect(native.log).toContain("maximize");
    expect(c.prefs()).toEqual({ mode: "fill", state: null });
  });

  test("reset from full screen leaves it first and says 'not settled yet'; asking again then maximises", () => {
    let full = true;
    const native = fakeNative({ frame: () => ({ x: 0, y: 0, width: 1728, height: 1117, maximized: false, fullscreen: full }) });
    const { c } = make({ mode: "remember", state: state({ fullscreen: true }) }, native);
    native.log.length = 0;
    expect(c.reset()).toMatchObject({ ok: true, settled: false });
    expect(native.log).toContain("fullscreen:false");
    expect(native.log).not.toContain("maximize");
    full = false;
    expect(c.apply("fill")).toMatchObject({ ok: true, settled: true });
    expect(native.log).toContain("maximize");
  });

  test("applying a mode: fill maximises, remember does nothing, full screen enters it (or falls back)", () => {
    const a = make();
    a.native.log.length = 0;
    expect(a.c.apply("remember")).toMatchObject({ ok: true, settled: true });
    expect(a.native.log).toEqual([]);
    expect(a.c.apply("fullscreen")).toMatchObject({ ok: true, settled: true, mode: "fullscreen" });
    expect(a.native.log).toContain("fullscreen:true");
    const b = make(undefined, fakeNative({ fullscreenWorks: false }));
    expect(b.c.apply("fullscreen")).toMatchObject({ ok: true, fellBack: true });
    expect(a.c.apply("sideways")).toMatchObject({ ok: false });
    expect(a.c.apply(undefined)).toMatchObject({ ok: false });
  });

  test("applying a mode starts a quiet period, so the app's own change isn't taken for the person's", () => {
    const { c, dir } = make();
    clock += 5000;
    c.apply("fullscreen");
    expect(c.changed(state({ fullscreen: false }))).toMatchObject({ ignored: true });
    expect(existsSync(join(dir, WINDOW_FILE))).toBe(false);
  });

  test("the functions the page can call exist, answer with plain data and never throw", () => {
    const bound = new Map<string, (...a: any[]) => unknown>();
    const { c, native } = make();
    bindWindowControl({ bind: (name, fn) => void bound.set(name, fn) }, c);
    expect([...bound.keys()]).toEqual(["fmWindowPoll", "fmWindowChanged", "fmWindowSave", "fmWindowReset", "fmWindowApply", "fmWindowAlwaysOnTop"]);
    expect(bound.get("fmWindowPoll")!()).toBeNull();
    expect(bound.get("fmWindowApply")!("fill")).toMatchObject({ ok: true });
    expect(bound.get("fmWindowChanged")!(undefined)).toMatchObject({ ok: true, saved: false });
    native.native.getFrame = () => { throw new Error("boom"); };
    native.native.maximize = () => { throw new Error("boom"); };
    for (const name of bound.keys()) expect(() => JSON.stringify(bound.get(name)!({}))).not.toThrow();
    const broken = { ...c, poll() { throw new Error("x"); }, changed() { throw new Error("x"); }, reset() { throw new Error("x"); } };
    bindWindowControl({ bind: (name, fn) => void bound.set(name, fn) }, broken as typeof c);
    expect(bound.get("fmWindowPoll")!()).toBeNull();
    expect(bound.get("fmWindowChanged")!({})).toMatchObject({ ok: false });
    expect(bound.get("fmWindowReset")!()).toMatchObject({ ok: false });
  });
});

describe("always on top", () => {
  test("off by default, saved when enabled, restored on reopening, and preserved by frame reports", () => {
    const dir = folder();
    const f = fakeNative({ frame: () => state() });
    const changes: boolean[] = [];
    f.native.setAlwaysOnTop = (on) => { changes.push(on); return true; };
    const c = createWindowController({ native: f.native, dataDir: dir, graceMs: 0 });
    c.open(c.plan());
    expect(changes).toEqual([]);
    expect(c.setAlwaysOnTop(true)).toEqual({ ok: true, alwaysOnTop: true });
    expect(readWindowPrefs(dir).alwaysOnTop).toBe(true);
    c.changed(state());
    expect(readWindowPrefs(dir).alwaysOnTop).toBe(true);
    expect(c.save()).toMatchObject({ ok: true });
    expect(readWindowPrefs(dir).alwaysOnTop).toBe(true);
    const reopened = createWindowController({ native: f.native, dataDir: dir });
    reopened.open(reopened.plan());
    expect(changes).toEqual([true, true]);
    expect(reopened.setAlwaysOnTop(false)).toEqual({ ok: true, alwaysOnTop: false });
    expect(readWindowPrefs(dir).alwaysOnTop).not.toBe(true);
    expect(changes).toEqual([true, true, false]);
    expect(reopened.setAlwaysOnTop(true).ok).toBe(true);
    expect(reopened.reset().ok).toBe(true);
    expect(changes.at(-1)).toBe(false);
    expect(readWindowPrefs(dir).alwaysOnTop).not.toBe(true);
  });

  test("unsupported or invalid requests report failure without saving", () => {
    const dir = folder();
    const f = fakeNative();
    const c = createWindowController({ native: f.native, dataDir: dir });
    expect(c.setAlwaysOnTop(true)).toMatchObject({ ok: false, alwaysOnTop: false });
    expect(c.setAlwaysOnTop("yes")).toMatchObject({ ok: false, alwaysOnTop: false });
    expect(existsSync(join(dir, WINDOW_FILE))).toBe(false);
  });

  test("a failed save restores native stacking and reports the error", () => {
    const blocked = join(root, "not-a-directory");
    writeFileSync(blocked, "");
    const f = fakeNative();
    const changes: boolean[] = [];
    f.native.setAlwaysOnTop = (on) => { changes.push(on); return true; };
    const c = createWindowController({ native: f.native, dataDir: blocked });
    expect(c.setAlwaysOnTop(true)).toMatchObject({ ok: false, alwaysOnTop: false });
    expect(changes).toEqual([true, false]);
  });
});

describe("the window operations over HTTP", () => {
  let server: ReturnType<typeof startFileManagerServer>;
  let base = "";
  let dataDir = "";
  const TOKEN = "window-token";
  const api = async (op: string, body: unknown = {}, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, ...headers }, body: JSON.stringify(body) });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json };
  };
  beforeAll(() => {
    dataDir = folder();
    server = startFileManagerServer({ port: 0, token: TOKEN, context: { home: root, dataDir } });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));

  test("the operations are part of the API", () => {
    for (const op of ["window/get", "window/set", "window/reset"]) expect(API_OPERATIONS).toContain(op);
  });

  test("a token is required and the server is loopback-only", async () => {
    for (const op of ["window/get", "window/set", "window/reset"]) {
      expect((await api(op, { mode: "fill" }, { "x-fm-token": "wrong" })).status).toBe(401);
      expect((await api(op, { mode: "fill" }, { "x-fm-token": "" })).status).toBe(401);
      expect((await api(op, { mode: "fill" }, { Origin: "https://evil.example" })).status).toBe(403);
    }
    expect(String(server.hostname)).toBe("127.0.0.1");
    expect(existsSync(join(dataDir, WINDOW_FILE))).toBe(false);
  });

  test("get: the default when nothing is saved", async () => {
    const r = await api("window/get");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, mode: "fill", state: null, saved: false });
  });

  test("set: choosing a mode is saved to the same file the window process reads", async () => {
    const r = await api("window/set", { mode: "fullscreen" });
    expect(r.json).toMatchObject({ ok: true, mode: "fullscreen", saved: false });
    expect(readWindowPrefs(dataDir)).toEqual({ mode: "fullscreen", state: null });
    if (process.platform !== "win32") expect(statSync(join(dataDir, WINDOW_FILE)).mode & 0o777).toBe(0o600);
    expect((await api("window/get")).json.mode).toBe("fullscreen");
  });

  test("set: a window can be stored too, and the mode kept when only the window is given", async () => {
    const r = await api("window/set", { state: state({ x: 11 }) });
    expect(r.json).toMatchObject({ ok: true, mode: "fullscreen", saved: true });
    expect(r.json.state).toEqual(state({ x: 11 }));
    const both = await api("window/set", { mode: "remember", state: { x: 1, y: 2, width: 100, height: 100 } });
    expect(both.json.state).toMatchObject({ width: MIN_WINDOW_WIDTH, height: MIN_WINDOW_HEIGHT });
    const fillAgain = await api("window/set", { mode: "fill" });
    expect(fillAgain.json).toMatchObject({ mode: "fill", saved: true }); // the saved window is kept for later
  });

  test("set: bad input is refused with a plain message and changes nothing", async () => {
    const before = readFileSync(join(dataDir, WINDOW_FILE), "utf8");
    for (const body of [{}, { mode: "maximum" }, { mode: 3 }, { mode: null, state: null }, { state: { x: "a" } }, { state: 5 }, { mode: "fill", state: { width: NaN } }]) {
      const r = await api("window/set", body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.json.ok).toBe(false);
      expect(typeof r.json.error.message).toBe("string");
    }
    expect(readFileSync(join(dataDir, WINDOW_FILE), "utf8")).toBe(before);
  });

  test("a damaged file is ignored by get and replaced by the next set", async () => {
    writeFileSync(join(dataDir, WINDOW_FILE), "{ broken");
    expect((await api("window/get")).json).toMatchObject({ mode: "fill", state: null });
    expect((await api("window/set", { mode: "remember" })).json).toMatchObject({ ok: true, mode: "remember" });
    expect(() => JSON.parse(readFileSync(join(dataDir, WINDOW_FILE), "utf8"))).not.toThrow();
  });

  test("reset: deletes the file and answers with the default; also when there is no file", async () => {
    await api("window/set", { mode: "remember", state: state() });
    const r = await api("window/reset");
    expect(r.json).toMatchObject({ ok: true, mode: "fill", state: null, saved: false });
    expect(existsSync(join(dataDir, WINDOW_FILE))).toBe(false);
    expect((await api("window/reset")).json.ok).toBe(true);
  });

  test("the window file is separate from the File Manager's settings file", async () => {
    await api("window/set", { mode: "fullscreen" });
    await api("settings", { set: { view: "list" } });
    expect(readdirSync(dataDir).filter((f) => f.endsWith(".json")).sort()).toEqual(["file_manager.json", WINDOW_FILE]);
    expect(readWindowPrefs(dataDir).mode).toBe("fullscreen");
    expect(JSON.parse(readFileSync(join(dataDir, "file_manager.json"), "utf8"))).not.toHaveProperty("mode");
  });
});

describe("the --reset-window flag", () => {
  const script = resolve(import.meta.dir, "../applications/file_manager_studio.ts");

  async function startsAndReads(args: string[]) {
    const child = Bun.spawn([process.execPath, script, "--server", "--port", "0", ...args], { stdout: "pipe", stderr: "ignore" });
    try {
      const reader = child.stdout.getReader();
      let text = "";
      while (!/READY:\d+/.test(text)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
      reader.releaseLock();
      return text;
    } finally {
      child.kill();
    }
  }

  test("forgets the remembered window before starting", async () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state() });
    const text = await startsAndReads(["--home", dir, "--data-dir", dir, "--reset-window"]);
    expect(text).toMatch(/READY:\d+/);
    expect(text).toContain("remembered window was forgotten");
    expect(existsSync(join(dir, WINDOW_FILE))).toBe(false);
  }, 20000);

  test("without the flag the remembered window stays", async () => {
    const dir = folder();
    writeWindowPrefs(dir, { mode: "remember", state: state() });
    const text = await startsAndReads(["--home", dir, "--data-dir", dir]);
    expect(text).toMatch(/READY:\d+/);
    expect(readWindowPrefs(dir).state).toEqual(state());
  }, 20000);
});
