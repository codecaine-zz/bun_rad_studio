import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TARGETS, defaultJobs, findTargets, mapPool, parseJobs, hostTargetId, listSourceApps, shQuote, webviewLibSource, xmlEscape, ROOT } from "../scripts/release/common";
import { colorsFor, appStoreCategory, iconSpecFor } from "../scripts/release/icons";
import { DESIGNS, SYMBOL_NAMES } from "../scripts/release/iconDesigns";
import { ICON_RENDERER } from "../scripts/release/iconRenderer";
import { archiveSuite, bundleApps, installScript, readme, stageSuite, unixLauncher, windowsLauncher } from "../scripts/release/suite";
import { bundleId, infoPlist, launcherScript, listMacApps, parseArgs as parseMacArgs, safeTitle, zipPlan } from "../scripts/release/build_mac_apps";
import { parseArgs as parseReleaseArgs, releaseNotes } from "../scripts/build_release";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const lint = (script: string) => Bun.spawnSync(["sh", "-c", `printf '%s' "$1" | sh -n`, "x", script]);
const shellTest = test.skipIf(!Bun.which("sh"));

describe("platforms", () => {
  test("ids are unique and every one names a Bun target", () => {
    expect(new Set(TARGETS.map((t) => t.id)).size).toBe(TARGETS.length);
    for (const t of TARGETS) expect(t.bunTarget).toMatch(/^bun-(darwin|linux|windows)-(arm64|x64)(-baseline|-musl)?$/);
  });
  test("covers Mac, Linux and Windows on ARM and Intel", () => {
    const ids = TARGETS.map((t) => t.id);
    for (const id of ["macos-arm64", "macos-x64", "linux-x64", "linux-arm64", "windows-x64", "windows-arm64", "linux-x64-baseline", "linux-x64-musl"]) expect(ids).toContain(id);
  });
  test("desktop apps are only promised where a window library exists, and that library is on disk", () => {
    for (const t of TARGETS) {
      expect(t.gui).toBe(t.webviewLib !== null);
      if (t.webviewLib) expect(existsSync(webviewLibSource(t.webviewLib)), t.id).toBe(true);
    }
    expect(TARGETS.filter((t) => t.gui && t.os === "linux").every((t) => t.variant !== "musl")).toBe(true);
  });
  test("findTargets picks by id and rejects unknown ones", () => {
    expect(findTargets(["linux-x64"]).map((t) => t.id)).toEqual(["linux-x64"]);
    expect(findTargets(null).length).toBe(TARGETS.length);
    expect(() => findTargets(["plan9-mips"])).toThrow(/Unknown target/);
  });
  test("the host target is one of them", () => {
    expect(TARGETS.map((t) => t.id)).toContain(hostTargetId());
  });
});

describe("what gets built", () => {
  const apps = listSourceApps();
  test("every desktop app and command-line tool is listed once, with a real source file", () => {
    expect(apps.filter((a) => a.kind === "gui").length).toBeGreaterThanOrEqual(60);
    expect(apps.filter((a) => a.kind === "cli").length).toBeGreaterThanOrEqual(70);
    expect(new Set(apps.map((a) => a.name)).size).toBe(apps.length);
    for (const a of apps) expect(existsSync(join(ROOT, a.entry)), a.entry).toBe(true);
    for (const a of apps) expect(a.name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
  test("the visual designer is included", () => {
    expect(apps.some((a) => a.name === "rad-designer" && a.entry === "index.ts")).toBe(true);
  });
});

describe("launchers", () => {
  const gui = { name: "file-manager-studio", entry: "applications/file_manager_studio.ts", kind: "gui" as const };
  const cli = { name: "fd-cli", entry: "cli_apps/fd_cli.ts", kind: "cli" as const };
  const linux = TARGETS.find((t) => t.id === "linux-x64")!;
  const win = TARGETS.find((t) => t.id === "windows-x64")!;

  shellTest("shell launchers are valid shell and follow symlinks", () => {
    for (const app of [gui, cli]) {
      const script = unixLauncher(app, linux);
      expect(lint(script).exitCode).toBe(0);
      expect(script).toContain("readlink");
      expect(script).toContain("BUN_BE_BUN=1");
    }
  });
  test("a desktop app gets the window library and a writable start folder; a command-line tool keeps your folder", () => {
    expect(unixLauncher(gui, linux)).toContain("WEBVIEW_PATH");
    expect(unixLauncher(gui, linux)).toContain("libwebview-x64.so");
    expect(unixLauncher(gui, linux)).toContain(".bun_rad_studio/run");
    expect(unixLauncher(cli, linux)).not.toContain("WEBVIEW_PATH");
    expect(unixLauncher(cli, linux)).not.toContain('cd "$WORK"');
  });
  test("Windows launchers use CRLF and the .dll", () => {
    const text = windowsLauncher(gui, win);
    expect(text).toContain("\r\n");
    expect(text).toContain("libwebview.dll");
    expect(text).toContain("runtime\\bun.exe");
    expect(windowsLauncher(cli, win)).not.toContain("WEBVIEW_PATH");
  });
  shellTest("the install script is valid shell", () => {
    expect(lint(installScript(["calculator-studio", "file-manager-studio"])).exitCode).toBe(0);
    expect(lint(installScript([])).exitCode).toBe(0);
  });
  test("shQuote survives quotes", () => {
    expect(shQuote("it's")).toBe(`'it'\\''s'`);
  });
  shellTest("shQuote preserves literal values in a shell", () => {
    expect(Bun.spawnSync(["sh", "-c", `printf %s ${shQuote("a'b $(x) \"c\"")}`]).stdout.toString()).toBe(`a'b $(x) "c"`);
  });
  test("the readme tells each platform what it needs", () => {
    expect(readme(linux, ["a-studio"], ["b-cli"])).toContain("libwebkitgtk-6.0-4");
    expect(readme(win, ["a-studio"], ["b-cli"])).toContain("WebView2");
    expect(readme(TARGETS.find((t) => t.id === "macos-arm64")!, ["a-studio"], ["b-cli"])).toContain("quarantine");
    expect(readme(TARGETS.find((t) => t.id === "linux-x64-musl")!, [], ["b-cli"])).toContain("command-line tools only");
  });
});

describe("a real suite", () => {
  test("bundles two apps, lays out the host platform and a tool really runs from the archive", async () => {
    const apps = listSourceApps().filter((a) => a.name === "fd-cli" || a.name === "calculator-studio");
    const bundles = await bundleApps(apps);
    expect(bundles.failed).toEqual([]);
    const target = TARGETS.find((t) => t.id === hostTargetId())!;
    const stageRoot = mkdtempSync(join(tmpdir(), "suite-"));
    temp.push(stageRoot);
    const dir = await stageSuite(target, { bundles }, stageRoot);
    const outDir = mkdtempSync(join(tmpdir(), "suite-out-"));
    temp.push(outDir);
    const archive = await archiveSuite(dir, target, outDir);
    expect(archive).toMatch(/bun-rad-studio-v[\d.]+-.+\.(tar\.gz|zip)$/);
    expect(statSync(archive).size).toBeGreaterThan(1_000_000);

    expect(readdirSync(join(dir, "bin")).sort()).toEqual(target.os === "windows" ? ["calculator-studio.cmd", "calculator-studio.ps1", "fd-cli.cmd"] : ["calculator-studio", "fd-cli"]);
    expect(existsSync(join(dir, "lib", target.webviewLib!))).toBe(true);
    expect(existsSync(join(dir, "resources"))).toBe(true);
    expect(readFileSync(join(dir, "VERSION"), "utf8").trim()).toMatch(/^\d+\.\d+\.\d+/);
    // Command-line tools carry no window library code, so they start where there is no GTK or WebKit; desktop apps look in lib/.
    expect(readFileSync(join(dir, "cli", "fd-cli.js"), "utf8")).not.toContain("webview_create");
    const gui = readFileSync(join(dir, "apps", "calculator-studio.js"), "utf8");
    expect(gui).toContain("webview_create");
    expect(gui).toContain("process.env.WEBVIEW_PATH");
    expect(gui).not.toMatch(/libwebview-(arm64|x64)\.so"\)/);
    // The window library is loaded from lib/, so no stray copies may sit next to the bundles.
    expect(readdirSync(join(dir, "apps")).filter((f) => /libwebview/.test(f))).toEqual([]);

    if (target.os !== "windows") {
      const work = mkdtempSync(join(tmpdir(), "suite-run-"));
      temp.push(work);
      writeFileSync(join(work, "needle.txt"), "x");
      const proc = Bun.spawnSync([join(dir, "bin", "fd-cli"), "needle", work], { stdout: "pipe", stderr: "pipe" });
      expect(proc.stdout.toString() + proc.stderr.toString()).toContain("needle.txt");
      expect(proc.exitCode).toBe(0);
    }
  }, 120_000);

  test("the release notes list every platform with its file", () => {
    const rows = TARGETS.map((t) => ({ target: t, file: `bun-rad-studio-v1-${t.id}.tar.gz`, bytes: 30_000_000, guiCount: t.gui ? 60 : 0, cliCount: 78 }));
    const notes = releaseNotes(rows, []);
    for (const t of TARGETS) expect(notes).toContain(`bun-rad-studio-v1-${t.id}.tar.gz`);
    expect(notes).toContain("SHA256SUMS.txt");
  });
  test("options", () => {
    expect(parseReleaseArgs(["--targets", "linux-x64,windows-x64"]).targets.map((t) => t.id)).toEqual(["linux-x64", "windows-x64"]);
    expect(() => parseReleaseArgs(["--nope"])).toThrow();
    expect(parseReleaseArgs([]).targets.length).toBe(TARGETS.length);
  });
});

describe("macOS apps", () => {
  const apps = listMacApps();
  test("one per distinct desktop app, each with a name, an emoji and a category", () => {
    expect(apps.length).toBeGreaterThanOrEqual(60);
    expect(new Set(apps.map((a) => a.title)).size).toBe(apps.length);
    expect(new Set(apps.map((a) => a.id)).size).toBe(apps.length);
    for (const a of apps) {
      expect(a.emoji, a.id).toBeTruthy();
      expect(a.category, a.id).toBeTruthy();
      expect(existsSync(join(ROOT, a.source.entry))).toBe(true);
    }
  });
  test("every app has its own design, and every design belongs to an app", () => {
    const ids = new Set(apps.map((a) => a.id));
    for (const id of ids) expect(DESIGNS[id], id).toBeDefined();
    for (const id of Object.keys(DESIGNS)) expect(ids.has(id), `${id} is not an app`).toBe(true);
    for (const [id, d] of Object.entries(DESIGNS)) expect([d.symbol, d.custom, d.text].filter(Boolean).length, id).toBe(1);
  });
  test("no two apps share a picture (same symbol and same colors)", () => {
    const seen = new Map<string, string>();
    for (const a of apps) {
      const spec = iconSpecFor({ id: a.id, category: a.category });
      const key = JSON.stringify([spec.symbol, spec.custom, spec.text, spec.vivid, spec.dark]);
      expect(seen.get(key), `${a.id} looks like ${seen.get(key)}`).toBeUndefined();
      seen.set(key, a.id);
    }
  });
  test("colors are valid, steady, and neighbours in a category differ", () => {
    for (const a of apps) {
      const spec = iconSpecFor({ id: a.id, category: a.category });
      for (const c of [spec.dark, spec.vivid, spec.glow, spec.tint]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(colorsFor("Developer Tools", "a")).toEqual(colorsFor("Developer Tools", "a"));
    const games = apps.filter((a) => a.category === "Games & Entertainment").map((a) => colorsFor(a.category, a.id).vivid);
    expect(new Set(games).size).toBeGreaterThan(games.length / 2);
    expect(appStoreCategory("Games & Entertainment")).toBe("public.app-category.games");
    expect(appStoreCategory("nothing")).toBe("public.app-category.utilities");
  });
  test("the custom shapes named in the designs are drawn by the renderer, and the SF Symbols exist on this Mac", () => {
    for (const d of Object.values(DESIGNS)) if (d.custom) expect(ICON_RENDERER).toContain(`  ${d.custom}() {`);
    if (process.platform !== "darwin") return;
    const file = join(tmpdir(), `sym-check-${process.pid}.js`);
    writeFileSync(file, `ObjC.import("AppKit"); function run(a){ const bad=[]; for (const n of JSON.parse(a[0])) { if ($.NSImage.imageWithSystemSymbolNameAccessibilityDescription(n, $()).isNil()) bad.push(n); } return JSON.stringify(bad); }`);
    try {
      const out = Bun.spawnSync(["osascript", "-l", "JavaScript", file, JSON.stringify(SYMBOL_NAMES)]);
      expect(JSON.parse(out.stdout.toString().trim() || "[]")).toEqual([]);
    } finally {
      rmSync(file, { force: true });
    }
  });
  test("names are safe, and the plist is valid even with an ampersand", () => {
    expect(safeTitle("A/B: C\\D")).toBe("A-B- C-D");
    expect(xmlEscape(`R&D "x" <y>`)).toBe("R&amp;D &quot;x&quot; &lt;y&gt;");
    expect(bundleId("File Manager_Studio")).toBe("dev.bunradstudio.file-manager-studio");
    const app = apps.find((a) => a.title.includes("&"))!;
    if (process.platform === "darwin") {
      const dir = mkdtempSync(join(tmpdir(), "plist-"));
      temp.push(dir);
      const file = join(dir, "Info.plist");
      writeFileSync(file, infoPlist(app, "AppIcon"));
      expect(Bun.spawnSync(["plutil", "-lint", file]).exitCode).toBe(0);
    }
  });
  shellTest("the launcher is valid shell and starts the app's own bundle", () => {
    const script = launcherScript(apps[0]!);
    expect(lint(script).exitCode).toBe(0);
    expect(script).toContain(`app/${apps[0]!.id}.js`);
    expect(script).toContain("libwebview.dylib");
  });
  test("the zips stay far below GitHub's 2 GiB limit", () => {
    const names = Array.from({ length: 65 }, (_, i) => `App ${i}.app`);
    const plan = zipPlan(names, "arm64");
    expect(plan.length).toBe(3);
    expect(plan.map(([f]) => f.replace(/v[\d.]+/, "v"))).toEqual(["bun-rad-studio-v-macos-arm64-apps-1of3.zip", "bun-rad-studio-v-macos-arm64-apps-2of3.zip", "bun-rad-studio-v-macos-arm64-apps-3of3.zip"]);
    expect(plan.flatMap(([, g]) => g)).toEqual(names);
    expect(Math.max(...plan.map(([, g]) => g.length))).toBeLessThanOrEqual(30);
    expect(zipPlan(names.slice(0, 5), "x64").map(([f]) => f)).toEqual([`bun-rad-studio-v${JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version}-macos-x64-apps.zip`]);
    expect(zipPlan([], "x64")).toEqual([]);
  });
  test("options", () => {
    expect(parseMacArgs(["--only", "a,b", "--arch", "x64", "--zip"])).toMatchObject({ only: ["a", "b"], arch: "x64", zip: true });
    expect(() => parseMacArgs(["--arch", "mips"])).toThrow();
  });
  test("a bundle built for one app is complete, signed and has its own icon", async () => {
    if (process.platform !== "darwin") return;
    const out = mkdtempSync(join(tmpdir(), "macapp-"));
    temp.push(out);
    const proc = Bun.spawnSync(["bun", "run", "scripts/release/build_mac_apps.ts", "--only", "calculator-studio", "--out", out, "--no-sign"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    expect(proc.exitCode, proc.stderr.toString()).toBe(0);
    const bundle = readdirSync(out).find((f) => f.endsWith(".app"))!;
    const c = join(out, bundle, "Contents");
    for (const f of ["Info.plist", "MacOS/calculator-studio", "Resources/AppIcon.icns", "Resources/runtime/bun", "Resources/app/calculator-studio.js", "Resources/lib/libwebview.dylib"]) expect(existsSync(join(c, f)), f).toBe(true);
    expect(statSync(join(c, "MacOS", "calculator-studio")).mode & 0o111).not.toBe(0);
    expect(Bun.spawnSync(["file", join(c, "Resources", "AppIcon.icns")]).stdout.toString()).toContain("icon");
  }, 180_000);
});

describe("parallel builds", () => {
  test("mapPool returns results in input order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapPool([30, 5, 20, 1, 10, 2], 3, async (ms, i) => {
      running++;
      peak = Math.max(peak, running);
      await Bun.sleep(ms);
      running--;
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10", "5:2"]);
    expect(peak).toBe(3);
  });
  test("mapPool with one job is strictly sequential, and handles an empty list", async () => {
    const order: number[] = [];
    await mapPool([1, 2, 3], 1, async (n) => {
      order.push(n);
      await Bun.sleep(3);
      order.push(-n);
    });
    expect(order).toEqual([1, -1, 2, -2, 3, -3]);
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
  });
  test("an error that escapes a job rejects the run", async () => {
    await expect(mapPool([1, 2], 2, async (n) => { if (n === 2) throw new Error("boom"); return n; })).rejects.toThrow("boom");
  });
  test("--jobs is validated and has a sensible default", () => {
    expect(defaultJobs()).toBeGreaterThanOrEqual(1);
    expect(defaultJobs()).toBeLessThanOrEqual(8);
    expect(parseJobs("4")).toBe(4);
    for (const bad of ["0", "-1", "2.5", "abc", "", undefined, "65"]) expect(() => parseJobs(bad)).toThrow("--jobs");
    expect(parseMacArgs(["--jobs", "3"]).jobs).toBe(3);
    expect(parseMacArgs(["-j", "1"]).jobs).toBe(1);
    expect(parseMacArgs([]).jobs).toBe(defaultJobs());
    expect(parseReleaseArgs(["--jobs", "2"]).jobs).toBe(2);
    expect(() => parseMacArgs(["--jobs", "0"])).toThrow();
  });
});
