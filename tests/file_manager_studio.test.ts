import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { bundleApps, copyAppBundle } from "../scripts/release/suite";
import { LAUNCHER_STUB } from "../scripts/release/build_file_manager";
import {
  PE_MACHINE_ARM64,
  PE_MACHINE_X64,
  PE_MACHINE_X86,
  ensureValidWindowsWebViewLoader,
  getPeMachineType,
  isPeX64,
} from "../scripts/fix_windows_webview_runtime";

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

test("the packaged File Manager never opens a browser unless --browser is explicitly passed", async () => {
  if (process.platform === "win32") return;
  const dir = mkdtempSync(join(tmpdir(), "fm-no-webview-"));
  let child: ReturnType<typeof Bun.spawn> | undefined;
  try {
    const bundles = await bundleApps([{ name: "file-manager-studio", entry: "applications/file_manager_studio.ts", kind: "gui" }], dir, 1);
    expect(bundles.failed).toEqual([]);
    const relocated = join(dir, "Applications", "Codecaine File Manager.app", "Contents", "Resources", "app");
    mkdirSync(relocated, { recursive: true });
    copyAppBundle(bundles.built[0]!, relocated, dir);
    rmSync(join(dir, "apps"), { recursive: true });
    const app = join(relocated, "file-manager-studio.js");
    expect(existsSync(join(relocated, "fmFindWorker.ts"))).toBe(true);
    const needle = join(dir, "packaged-find-needle.txt");
    writeFileSync(needle, "packaged worker search\n");
    const urlFile = join(dir, "opened-url");
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, process.platform === "darwin" ? "open" : "xdg-open"), '#!/bin/sh\nprintf "%s" "$1" > "$FM_TEST_URL"\n', { mode: 0o755 });
    const env = { ...process.env, WEBVIEW_PATH: join(dir, "missing-native-library"), PATH: `${bin}:${process.env.PATH}`, FM_TEST_URL: urlFile };
    const server = Bun.spawn([process.execPath, app, "--server", "--home", dir, "--data-dir", dir], { env, stdout: "pipe", stderr: "pipe" });
    child = server;
    const reader = server.stdout.getReader();
    let output = "";
    while (!/READY:\d+/.test(output)) {
      const { value, done } = await reader.read();
      if (done) break;
      output += new TextDecoder().decode(value);
    }
    reader.releaseLock();
    expect(output).toMatch(/READY:\d+/);
    const serverUrl = `http://127.0.0.1:${/READY:(\d+)/.exec(output)![1]}`;
    const page = await (await fetch(serverUrl)).text();
    const token = /<meta name="fm-token" content="([^"]+)">/.exec(page)?.[1];
    expect(token).toBeDefined();
    const search = await fetch(`${serverUrl}/api/find/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fm-token": token! },
      body: JSON.stringify({ root: dir, pattern: "packaged-find-needle.txt", mode: "fixed", type: "file" }),
      signal: AbortSignal.timeout(10000),
    });
    expect(search.status).toBe(200);
    const result = await search.json();
    expect(result.ok).toBe(true);
    expect(result.items.map((item: { path: string }) => item.path)).toEqual([needle]);
    child.kill();
    await child.exited;

    // 1. Default invocation (without --browser): must NOT open a web browser when native library is missing
    const desktopNoBrowser = Bun.spawn([process.execPath, app, "--home", dir, "--data-dir", dir], { env, stdout: "pipe", stderr: "pipe" });
    child = desktopNoBrowser;
    const exitCode = await desktopNoBrowser.exited;
    expect(exitCode).not.toBe(0);
    expect(existsSync(urlFile)).toBe(false);
    const noBrowserErrors = await new Response(desktopNoBrowser.stderr).text();
    expect(noBrowserErrors).toContain("The desktop window isn't available");
    expect(noBrowserErrors).toContain("--browser");

    // 2. Explicit --browser invocation: serves and opens the URL in the browser
    const desktopWithBrowser = Bun.spawn([process.execPath, app, "--browser", "--home", dir, "--data-dir", dir], { env, stdout: "pipe", stderr: "pipe" });
    child = desktopWithBrowser;
    for (let i = 0; i < 150 && !existsSync(urlFile); i++) await Bun.sleep(100);
    expect(existsSync(urlFile)).toBe(true);
    const url = readFileSync(urlFile, "utf8");
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Codecaine File Manager");
    child.kill();
    await child.exited;
    const browserStdout = await new Response(desktopWithBrowser.stdout).text();
    expect(browserStdout).toContain("Opening the File Manager in your browser");
  } finally {
    child?.kill();
    if (child) await child.exited;
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);

test("Windows WebView runtime validator accepts only x64 (0x8664) PE DLLs and removes ARM64/x86 WebView2Loader.dll", () => {
  const realLibwebview = resolve(import.meta.dir, "../node_modules/webview-bun/build/libwebview.dll");
  expect(getPeMachineType(realLibwebview)).toBe(PE_MACHINE_X64);
  expect(isPeX64(realLibwebview)).toBe(true);

  const dir = mkdtempSync(join(tmpdir(), "fm-win-pe-"));
  try {
    const buildFakePe = (machine: number): Buffer => {
      const buf = Buffer.alloc(128);
      buf[0] = 0x4d; // 'M'
      buf[1] = 0x5a; // 'Z'
      buf.writeUInt32LE(0x40, 0x3c); // e_lfanew = 0x40
      buf[0x40] = 0x50; // 'P'
      buf[0x41] = 0x45; // 'E'
      buf[0x42] = 0x00;
      buf[0x43] = 0x00;
      buf.writeUInt16LE(machine, 0x44);
      return buf;
    };

    const arm64Dll = join(dir, "arm64.dll");
    const x86Dll = join(dir, "x86.dll");
    const x64Dll = join(dir, "x64.dll");
    writeFileSync(arm64Dll, buildFakePe(PE_MACHINE_ARM64));
    writeFileSync(x86Dll, buildFakePe(PE_MACHINE_X86));
    writeFileSync(x64Dll, buildFakePe(PE_MACHINE_X64));

    expect(getPeMachineType(arm64Dll)).toBe(PE_MACHINE_ARM64);
    expect(isPeX64(arm64Dll)).toBe(false);
    expect(getPeMachineType(x86Dll)).toBe(PE_MACHINE_X86);
    expect(isPeX64(x86Dll)).toBe(false);
    expect(getPeMachineType(x64Dll)).toBe(PE_MACHINE_X64);
    expect(isPeX64(x64Dll)).toBe(true);

    // Verify ensureValidWindowsWebViewLoader removes a wrong-arch ARM64 WebView2Loader.dll
    const buildDir = join(dir, "node_modules", "webview-bun", "build");
    mkdirSync(buildDir, { recursive: true });
    const targetLoader = join(buildDir, "WebView2Loader.dll");
    writeFileSync(targetLoader, buildFakePe(PE_MACHINE_ARM64));
    expect(isPeX64(targetLoader)).toBe(false);
    ensureValidWindowsWebViewLoader(dir);
    if (existsSync(targetLoader)) {
      expect(isPeX64(targetLoader)).toBe(true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the compiled download launcher records hidden startup failures and preserves server output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fm-launcher-"));
  try {
    mkdirSync(join(dir, "app"));
    mkdirSync(join(dir, "resources"));
    const stub = join(dir, "launcher.ts");
    writeFileSync(stub, LAUNCHER_STUB);
    const exe = join(dir, process.platform === "win32" ? "launcher.exe" : "launcher");
    const build = Bun.spawnSync([process.execPath, "build", "--compile", `--outfile=${exe}`, stub]);
    expect(build.exitCode, build.stderr.toString()).toBe(0);
    writeFileSync(join(dir, "app", "file-manager-studio.js"), 'console.log("fixture started"); console.error("fixture failure"); process.exitCode = 17;');
    const env = { ...process.env, HOME: dir, USERPROFILE: dir, BUN_BE_BUN: undefined, FM_START_NO_DIALOG: "1" };
    const run = Bun.spawnSync([exe], { env });
    expect(run.exitCode).toBe(17);
    const log = join(dir, ".bun_rad_studio", "file-manager-startup.log");
    expect(readFileSync(log, "utf8")).toContain("fixture started");
    expect(readFileSync(log, "utf8")).toContain("fixture failure");
    expect(readFileSync(log, "utf8")).toContain("File Manager exited with 17");
    const server = Bun.spawnSync([exe, "--server"], { env });
    expect(server.exitCode).toBe(17);
    expect(server.stdout.toString()).toContain("fixture started");
    expect(server.stderr.toString()).toContain("fixture failure");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
