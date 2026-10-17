import { afterAll, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { rm } from "fs/promises";
import { Data, Resource } from "resedit";
import { ROOT, TARGETS, listSourceApps, zipEntries } from "../scripts/release/common";
import { WINDOWS_SETUP, desktopInfo, embedWindowsIcon, stageDesktopIcons, windowsDesktopLauncher, windowsInstallCommand, windowsInstallScript, windowsResources } from "../scripts/release/desktop";
import { DOWNLOADS, LAUNCHER_STUB, MAC_README, WINDOWS_TROUBLESHOOT, downloadPage, linuxInstallScript, readmeFor } from "../scripts/release/build_file_manager";
import { bundleApps, installScript, windowsLauncher } from "../scripts/release/suite";

const dirs: string[] = [];
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "desktop-release-"));
  dirs.push(dir);
  return dir;
}
afterAll(async () => {
  Bun.gc(true);
  for (const dir of dirs) {
    for (let attempt = 0; ; attempt++) {
      try {
        await rm(dir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || !["EPERM", "EBUSY"].includes(String(error.code)) || attempt >= 20) throw error;
        await Bun.sleep(200);
      }
    }
  }
}, 30000);

describe("matching Mac artwork", () => {
  test("every released desktop app and alias has PNG and multi-resolution ICO artwork", () => {
    for (const app of listSourceApps().filter(a => a.kind === "gui")) {
      const info = desktopInfo(app.name);
      const png = readFileSync(info.png);
      expect(png.readUInt32BE(16)).toBe(1024);
      const ico = Data.IconFile.from(readFileSync(info.ico));
      expect(ico.icons.map(i => i.width || 256)).toEqual([32, 64, 128, 256]);
      expect(info.title.length).toBeGreaterThan(0);
    }
    expect(() => desktopInfo("missing-artwork")).toThrow("No Mac artwork");
  }, 30000);

  test("suite icons are copied even on a host without Mac drawing tools", () => {
    const dir = workspace();
    stageDesktopIcons(dir, ["file-manager-studio", "sqlite-studio"]);
    for (const id of ["file-manager-studio", "sqlite-studio"]) {
      const icon = desktopInfo(id);
      for (const format of ["png", "ico"] as const) {
        expect(readFileSync(join(dir, "share", "icons", `${id}.${format}`))).toEqual(readFileSync(icon[format]));
      }
    }
  });
});

describe("platform launchers", () => {
  test("release entrypoints start directly but imported entrypoints do not run", async () => {
    const dir = workspace();
    const source = join(dir, "entry.ts");
    writeFileSync(source, '#!/usr/bin/env bun\nif (import.meta.main) console.log("entry started");\n');
    const bundles = await bundleApps([{ name: "entry", entry: relative(ROOT, source), kind: "cli" }], join(dir, "bundles"), 1);
    expect(bundles.failed).toEqual([]);
    const script = join(dir, "bundles", "cli", "entry.js");
    const direct = Bun.spawnSync([process.execPath, script], { env: { ...process.env, BUN_BE_BUN: "1" } });
    expect(direct.exitCode, direct.stderr.toString()).toBe(0);
    expect(direct.stdout.toString().trim()).toBe("entry started");
    const importer = join(dir, "importer.js");
    writeFileSync(importer, 'await import("./bundles/cli/entry.js"); console.log("imported only");');
    const imported = Bun.spawnSync([process.execPath, importer], { env: { ...process.env, BUN_BE_BUN: "1" } });
    expect(imported.exitCode, imported.stderr.toString()).toBe(0);
    expect(imported.stdout.toString().trim()).toBe("imported only");
  });

  test.skipIf(process.platform !== "win32" || !process.env.BUN_RAD_TEST_UNC_DIR)("release entrypoints start from a mixed-case UNC server path", async () => {
    const dir = workspace();
    const shared = mkdtempSync(join(process.env.BUN_RAD_TEST_UNC_DIR!, "bun-rad-entry-"));
    dirs.push(shared);
    const source = join(dir, "entry.ts");
    writeFileSync(source, 'if (import.meta.main) console.log("UNC entry started");');
    const bundles = await bundleApps([{ name: "entry", entry: relative(ROOT, source), kind: "cli" }], dir + "-bundles", 1);
    dirs.push(dir + "-bundles");
    expect(bundles.failed).toEqual([]);
    const script = join(shared, "entry.js");
    copyFileSync(join(dir + "-bundles", "cli", "entry.js"), script);
    const launched = Bun.spawnSync([process.execPath, script], { env: { ...process.env, BUN_BE_BUN: "1" } });
    expect(launched.exitCode, launched.stderr.toString()).toBe(0);
    expect(launched.stdout.toString().trim()).toBe("UNC entry started");
  });

  test("Windows console launchers enter UNC directories and preserve the application exit code", () => {
    const target = TARGETS.find(t => t.id === "windows-arm64")!;
    const desktop = windowsLauncher({ name: "file-manager-studio", entry: "", kind: "gui" }, target);
    for (const launcher of [desktop, WINDOWS_TROUBLESHOOT]) {
      expect(launcher).toContain("pushd");
      expect(launcher).toContain('set "EXIT_CODE=%errorlevel%"');
      expect(launcher).toContain("popd");
      expect(launcher).toContain("exit /b %EXIT_CODE%");
      expect(launcher).not.toContain("cd /d");
    }
    expect(windowsLauncher({ name: "fd-cli", entry: "", kind: "cli" }, target)).not.toContain("pushd");
  });

  test.skipIf(process.platform !== "win32")("Windows ZIP archives round-trip single and multiple literal folder names", async () => {
    const dir = workspace();
    const names = ["one [folder]'s files", "second folder"];
    for (const name of names) {
      mkdirSync(join(dir, name));
      writeFileSync(join(dir, name, "contents.txt"), name);
    }
    for (const entries of [[names[0]!], names]) {
      const zip = join(dir, `${entries.length}.zip`);
      await zipEntries(dir, entries, zip);
      const out = join(dir, `extracted-${entries.length}`);
      const unpacked = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command",
        "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $env:TEST_ZIP -DestinationPath $env:TEST_OUT"],
      { env: { ...process.env, TEST_ZIP: zip, TEST_OUT: out } });
      expect(unpacked.exitCode, unpacked.stderr.toString()).toBe(0);
      for (const name of entries) expect(readFileSync(join(out, name, "contents.txt"), "utf8")).toBe(name);
    }
  }, 30000);

  test.skipIf(process.platform !== "win32")("Windows setup detects prerequisites without downloading or installing silently", () => {
    const dir = workspace();
    const script = join(dir, "setup.ps1");
    writeFileSync(script, WINDOWS_SETUP);
    const mocks = `
function Test-Path { param($Path, $LiteralPath) return ($env:TEST_INSTALLED -eq '1') }
function Get-ItemProperty { [CmdletBinding()] param($LiteralPath, $Name) return @{ Installed = [int]$env:TEST_INSTALLED } }
function Invoke-WebRequest { throw 'Unexpected download' }
& $env:TEST_SCRIPT
`;
    for (const installed of ["0", "1"]) {
      const checked = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command", mocks],
        { env: { ...process.env, TEST_SCRIPT: script, TEST_INSTALLED: installed } });
      const output = checked.stdout.toString() + checked.stderr.toString();
      expect(checked.exitCode, output).toBe(installed === "1" ? 0 : 1);
      expect(output).toContain(installed === "1" ? "prerequisites are installed" : "Missing:");
      expect(output).not.toContain("Unexpected download");
    }
    expect(WINDOWS_SETUP).toContain("Get-AuthenticodeSignature");
    expect(WINDOWS_SETUP).toContain("Read-Host");
    expect(WINDOWS_SETUP).toContain("vc_redist.x64.exe");
    expect(windowsInstallCommand(true)).toContain('if errorlevel 1 goto failed');
    expect(windowsInstallCommand(true)).toContain('goto shortcuts');
    expect(windowsInstallCommand(false)).not.toContain('install.ps1');
    const parsed = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command",
      "$errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:TEST_SCRIPT, [ref]$null, [ref]$errors); if ($errors) { $errors | Out-String | Write-Error; exit 1 }"],
    { env: { ...process.env, TEST_SCRIPT: join(ROOT, "scripts", "build_windows.ps1") } });
    expect(parsed.exitCode, parsed.stderr.toString()).toBe(0);
  }, 30000);

  test.skipIf(process.platform !== "win32")("Windows setup requires consent and valid signatures, checks installer failures, and verifies installation", () => {
    const dir = workspace();
    const script = join(dir, "setup.ps1");
    writeFileSync(script, WINDOWS_SETUP);
    const mocks = `
$script:installs = 0
function Test-Path {
  param($Path, $LiteralPath)
  if ($Path -like '*EdgeWebView*') { return ($script:installs -eq 2 -and $env:TEST_MODE -ne 'still-missing') }
  return (Microsoft.PowerShell.Management\\Test-Path -LiteralPath $LiteralPath)
}
function Get-ItemProperty { [CmdletBinding()] param($LiteralPath, $Name) return @{ Installed = [int]($script:installs -eq 2) } }
function Read-Host { param($Prompt) if ($env:TEST_MODE -eq 'decline') { return 'n' }; return 'y' }
function Invoke-WebRequest {
  param($Uri, $OutFile, [switch]$UseBasicParsing)
  Add-Content -LiteralPath $env:TEST_ACTIONS -Value ('download ' + $Uri)
  [IO.File]::WriteAllText($OutFile, 'mock Microsoft installer')
}
function Get-AuthenticodeSignature {
  param($LiteralPath)
  return @{ Status = $(if ($env:TEST_MODE -eq 'invalid-signature') { 'NotSigned' } else { 'Valid' }); SignerCertificate = @{ Subject = 'CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond' } }
}
function Start-Process {
  param($FilePath, $ArgumentList, [switch]$Wait, [switch]$PassThru)
  $script:installs++
  Add-Content -LiteralPath $env:TEST_ACTIONS -Value ('install ' + [IO.Path]::GetFileName($FilePath))
  return @{ ExitCode = $(if ($env:TEST_MODE -eq 'installer-failure') { 1603 } else { 0 }) }
}
& $env:TEST_SCRIPT -InstallDependencies
`;
    for (const mode of ["success", "decline", "invalid-signature", "installer-failure", "still-missing"]) {
      const actions = join(dir, `${mode}.txt`);
      const checked = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command", mocks],
        { env: { ...process.env, TEST_SCRIPT: script, TEST_MODE: mode, TEST_ACTIONS: actions } });
      const output = checked.stdout.toString() + checked.stderr.toString();
      expect(checked.exitCode, output).toBe(mode === "success" ? 0 : 1);
      const performed = existsSync(actions) ? readFileSync(actions, "utf8") : "";
      if (mode === "success") {
        expect(output).toContain("setup completed");
        expect(performed).toContain("install vc_redist.x64.exe");
        expect(performed).toContain("install MicrosoftEdgeWebview2Setup.exe");
      } else {
        expect(output).not.toContain("setup completed");
        if (mode === "decline") expect(performed).toBe("");
        if (mode === "invalid-signature") expect(performed).not.toContain("install ");
        if (mode === "installer-failure") expect(output).toContain("1603");
        if (mode === "still-missing") expect(output).toContain("still missing");
      }
    }
  }, 60000);

  test("ARM desktop apps use baseline x64 with the x64 DLL, while CLI tools remain native", () => {
    expect(DOWNLOADS.find(d => d.id === "windows-arm64")!.from).toBe("windows-x64-baseline");
    const target = TARGETS.find(t => t.id === "windows-arm64")!;
    expect(target.gui).toBe(true);
    expect(target.guiRuntime).toBe("windows-x64-baseline");
    expect(windowsLauncher({ name: "file-manager-studio", entry: "", kind: "gui" }, target)).toContain("runtime\\bun-gui.exe");
    expect(windowsLauncher({ name: "fd-cli", entry: "", kind: "cli" }, target)).toContain("runtime\\bun.exe");
  });

  test("Windows menu shortcuts have Mac names, icons and a hidden launcher with errors logged", () => {
    const installer = windowsInstallScript(["file-manager-studio", "calculator-studio"]);
    expect(installer).toContain("Codecaine File Manager");
    expect(installer).toContain(".ico");
    expect(installer).toContain("powershell.exe");
    expect(installer).toContain("-WindowStyle Hidden");
    expect(installer).toContain("$Uninstall");
    const launcher = windowsDesktopLauncher("file-manager-studio");
    expect(launcher).toContain('*> $logFile');
    expect(launcher).toContain("MessageBox");
    expect(launcher).toContain("file-manager-studio.log");
    if (process.platform === "win32") {
      const dir = workspace();
      const file = join(dir, "install.ps1");
      writeFileSync(file, installer);
      const parsed = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command",
        "$errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:SCRIPT, [ref]$null, [ref]$errors); if ($errors) { $errors | Out-String | Write-Error; exit 1 }"],
      { env: { ...process.env, SCRIPT: file } });
      expect(parsed.exitCode, parsed.stderr.toString()).toBe(0);
    }
  }, 30000);

  test.skipIf(process.platform !== "win32")("Windows installs real icon shortcuts and launches the shared runtime without losing stderr", () => {
    const dir = workspace();
    mkdirSync(join(dir, "bin"));
    mkdirSync(join(dir, "runtime"));
    mkdirSync(join(dir, "apps"));
    const names = ["file-manager-studio"];
    stageDesktopIcons(dir, names);
    copyFileSync(process.execPath, join(dir, "runtime", "bun.exe"));
    writeFileSync(join(dir, "apps", "file-manager-studio.js"), 'console.log("shared runtime works"); console.warn("warning retained");');
    writeFileSync(join(dir, "bin", "file-manager-studio.ps1"), windowsDesktopLauncher(names[0]!));
    const installer = join(dir, "install.ps1");
    writeFileSync(installer, windowsInstallScript(names).replace("[Environment]::GetFolderPath('Programs')", "$env:TEST_MENU"));
    const env = { ...process.env, USERPROFILE: dir, TEST_MENU: join(dir, "programs"), TEST_ROOT: dir };
    const installed = Bun.spawnSync(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installer], { env });
    expect(installed.exitCode, installed.stderr.toString()).toBe(0);
    const linkPath = join(dir, "programs", "Bun RAD Studio", "Codecaine File Manager.lnk");
    expect(existsSync(linkPath)).toBe(true);
    const shortcut = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command",
      "$link = (New-Object -ComObject WScript.Shell).CreateShortcut($env:TEST_LINK); @{ icon = $link.IconLocation; args = $link.Arguments } | ConvertTo-Json -Compress"],
    { env: { ...env, TEST_LINK: linkPath } });
    const link = JSON.parse(shortcut.stdout.toString());
    expect(link.icon.endsWith("\\share\\icons\\file-manager-studio.ico,0")).toBe(true);
    expect(readFileSync(link.icon.slice(0, -2))).toEqual(readFileSync(desktopInfo(names[0]!).ico));
    expect(link.args).toContain("-WindowStyle Hidden");
    const launched = Bun.spawnSync(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(dir, "bin", "file-manager-studio.ps1")], { env });
    expect(launched.exitCode, launched.stderr.toString()).toBe(0);
    const log = readFileSync(join(dir, ".bun_rad_studio", "logs", "file-manager-studio.log"));
    const text = log.toString(log[0] === 0xff ? "utf16le" : "utf8");
    expect(text).toContain("shared runtime works");
    expect(text).toContain("warning retained");
    const uninstalled = Bun.spawnSync(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installer, "-Uninstall"], { env });
    expect(uninstalled.exitCode, uninstalled.stderr.toString()).toBe(0);
    expect(existsSync(linkPath)).toBe(false);
  }, 30000);

  test("Linux installers restore permission, quote paths and use the same application names", () => {
    expect(linuxInstallScript()).toContain('chmod +x "$ROOT/codecaine-file-manager"');
    expect(linuxInstallScript()).toContain('Exec="$ESCAPED_ROOT/codecaine-file-manager"');
    const script = installScript(["file-manager-studio"]);
    expect(script).toContain("Codecaine File Manager");
    expect(script).toContain('Exec="$ESCAPED_ROOT/bin/$name"');
    expect(script).toContain('chmod +x "$ROOT/runtime/bun"');
    const sh = Bun.which("sh") ?? (existsSync("C:\\Program Files\\Git\\bin\\bash.exe") ? "C:\\Program Files\\Git\\bin\\bash.exe" : null);
    if (sh) for (const text of [script, linuxInstallScript()]) {
      const parsed = Bun.spawnSync([sh, "-n"], { stdin: Buffer.from(text) });
      expect(parsed.exitCode, parsed.stderr.toString()).toBe(0);
    }
  });

  test("download instructions explain actual prerequisites and Mac quarantine", () => {
    expect(MAC_README).toContain("right-click > Open does not work");
    expect(MAC_README).toContain('xattr -dr com.apple.quarantine "/Applications/Codecaine File Manager.app"');
    for (const d of DOWNLOADS.filter(d => d.os !== "macos")) {
      const readme = readmeFor(d);
      expect(readme).toContain(d.os === "windows" ? "vc_redist.x64.exe" : "libwebkitgtk-6.0-4");
      expect(readme).toContain("troubleshoot");
    }
    const page = downloadPage([]);
    expect(page).toContain("Standalone .app downloads are being built on macOS");
    expect(page).toContain("macOS full-suite archive");
    expect(page).toContain("troubleshoot.cmd");
    expect(page).toContain("troubleshoot.sh");
  });
});

test.skipIf(process.platform !== "win32")("a compiled baseline Windows launcher retains its program after embedding the Mac icon, runs on ARM and logs failures", async () => {
  const dir = workspace();
  mkdirSync(join(dir, "app"));
  const stub = join(dir, "launcher.ts");
  const exe = join(dir, "Codecaine File Manager.exe");
  writeFileSync(stub, LAUNCHER_STUB);
  const compile = Bun.spawnSync([process.execPath, "build", "--compile", "--windows-hide-console", "--target=bun-windows-x64-baseline", `--outfile=${exe}`, stub]);
  expect(compile.exitCode, compile.stderr.toString()).toBe(0);
  embedWindowsIcon(exe, desktopInfo("file-manager-studio").ico);
  const resources = windowsResources(readFileSync(exe));
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  expect(groups.some(g => g.icons.length === 4)).toBe(true);
  const script = join(dir, "app", "file-manager-studio.js");
  writeFileSync(script, 'console.log(JSON.stringify({arch: process.arch, args: process.argv.slice(2), runtime: process.env.BUN_BE_BUN}));');
  const env = { ...process.env, USERPROFILE: dir, HOME: dir, BUN_BE_BUN: "" };
  const success = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command", "& $env:TEST_EXE --server --path 'folder with spaces' | Out-Host; exit $LASTEXITCODE"], { env: { ...env, TEST_EXE: exe } });
  expect(success.exitCode, success.stderr.toString()).toBe(0);
  expect(JSON.parse(success.stdout.toString())).toEqual({ arch: "x64", args: ["--server", "--path", "folder with spaces"], runtime: "1" });
  writeFileSync(script, 'console.error("simulated missing native dependency"); process.exit(23);');
  const failure = Bun.spawnSync(["powershell.exe", "-NoProfile", "-Command", "& $env:TEST_EXE --server | Out-Host; exit $LASTEXITCODE"], { env: { ...env, TEST_EXE: exe } });
  expect(failure.exitCode).toBe(1);
  expect(failure.stderr.toString()).toContain("code 23");
  const logs = join(dir, ".bun_rad_studio", "logs");
  expect(readdirSync(logs).some(f => readFileSync(join(logs, f), "utf8").includes("simulated missing native dependency"))).toBe(true);
}, 120_000);

test("File Manager server starts and serves the page without loading a native webview", async () => {
  const dir = workspace();
  const child = Bun.spawn([process.execPath, join(ROOT, "applications", "file_manager_studio.ts"), "--server", "--port", "0", "--home", dir, "--data-dir", dir],
    { env: { ...process.env, WEBVIEW_PATH: join(dir, "does-not-exist.dll") }, stdout: "pipe", stderr: "pipe" });
  let output = "";
  const timer = setTimeout(() => child.kill(), 15000);
  try {
    const reader = child.stdout.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      output += new TextDecoder().decode(value);
      const ready = /READY:(\d+)/.exec(output);
      if (ready) {
        const response = await fetch(`http://127.0.0.1:${ready[1]}/`);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("Codecaine File Manager");
        return;
      }
    }
    throw new Error("Server did not become ready: " + output + await new Response(child.stderr).text());
  } finally {
    clearTimeout(timer);
    child.kill();
    await child.exited;
  }
}, 20000);
