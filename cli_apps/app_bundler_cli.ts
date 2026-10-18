#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';
import {
  bundleIcon,
  bundleLinuxIcon,
  bundleWindowsIcon,
  generateLinuxDesktopEntry,
  generatePlist,
  generateWindowsManifest,
} from '../applications/app_bundler_studio.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const app = SimpleCLI.newApp('appbundler-cli', '1.0.0')
  .setDescription('Cross-Platform Desktop Application Bundle Packager CLI (macOS .app, Windows, Linux .AppDir)');

app.addFlagString('bin', 'b', '', 'Path to compiled executable binary');
app.addFlagString('name', 'n', 'MyApp', 'Application bundle display name');
app.addFlagString('id', 'i', 'com.simplcli.app', 'Bundle identifier (e.g. com.company.app)');
app.addFlagString('version', 'v', '1.0.0', 'Bundle version');
app.addFlagString('platform', 'p', 'macos', 'Target platform bundle: macos, windows, linux, or all');
app.addFlagString('icon', 'c', '', 'Optional path to application icon (.icns, .png, .ico)');
app.addFlagString('out', 'o', '.', 'Output destination directory for application bundle');
app.addFlagBool('interactive', 'x', false, 'Launch interactive app bundler wizard');

if (!app.parseCli()) process.exit(0);

app.banner('App Bundler Studio CLI', 'v1.0.0 - Cross-Platform Desktop App Packager');

function packageMacBundle(fullBin: string, appName: string, bundleId: string, version: string, outDir: string, iconPath: string) {
  const bundlePath = path.resolve(outDir, `${appName}.app`);
  const macosDir = path.join(bundlePath, 'Contents', 'MacOS');
  const resDir = path.join(bundlePath, 'Contents', 'Resources');

  app.info(`Creating macOS bundle directories: ${bundlePath}...`);
  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resDir, { recursive: true });

  const targetBin = path.join(macosDir, appName);
  fs.copyFileSync(fullBin, targetBin);
  try { fs.chmodSync(targetBin, 0o755); } catch {}

  if (iconPath) {
    const iconRes = bundleIcon(iconPath, bundlePath);
    if (iconRes.success) app.info(iconRes.message);
    else app.warn(iconRes.message);
  }

  const plistContent = generatePlist(appName, bundleId, version, true);
  fs.writeFileSync(path.join(bundlePath, 'Contents', 'Info.plist'), plistContent, 'utf8');
  app.success(`Successfully generated macOS .app bundle at: ${bundlePath}`);
}

function packageWindowsBundle(fullBin: string, appName: string, bundleId: string, version: string, outDir: string, iconPath: string) {
  const bundlePath = path.resolve(outDir, `${appName}-windows`);
  app.info(`Creating Windows bundle directory: ${bundlePath}...`);
  fs.mkdirSync(bundlePath, { recursive: true });

  const targetExe = path.join(bundlePath, `${appName}.exe`);
  fs.copyFileSync(fullBin, targetExe);

  const manifestXml = generateWindowsManifest(appName, bundleId, version, true);
  fs.writeFileSync(path.join(bundlePath, `${appName}.exe.manifest`), manifestXml, 'utf8');

  if (iconPath) {
    const iconRes = bundleWindowsIcon(iconPath, bundlePath, appName, targetExe);
    if (iconRes.success) app.info(iconRes.message);
    else app.warn(iconRes.message);
  }

  const launchBatch = `@echo off\r\nsetlocal\r\npushd "%~dp0" || exit /b 1\r\nset "BUN_BE_BUN=1"\r\nif not defined WEBVIEW_PATH if exist "%~dp0lib\\libwebview.dll" set "WEBVIEW_PATH=%~dp0lib\\libwebview.dll"\r\n"%~dp0${appName}.exe" %*\r\nset "EXIT_CODE=%errorlevel%"\r\npopd\r\nexit /b %EXIT_CODE%\r\n`;
  fs.writeFileSync(path.join(bundlePath, 'launch.cmd'), launchBatch, 'utf8');

  const shortcutScript = `param([switch]$Uninstall, [switch]$Desktop)\r\n$ErrorActionPreference = 'Stop'\r\n$root = $PSScriptRoot\r\n$folders = @([Environment]::GetFolderPath('Programs'))\r\nif ($Desktop) { $folders += [Environment]::GetFolderPath('Desktop') }\r\n$shell = New-Object -ComObject WScript.Shell\r\nforeach ($folder in $folders) {\r\n  $lnkPath = Join-Path $folder '${appName}.lnk'\r\n  if ($Uninstall) {\r\n    if (Test-Path -LiteralPath $lnkPath) { Remove-Item -LiteralPath $lnkPath }\r\n    continue\r\n  }\r\n  New-Item -ItemType Directory -Path $folder -Force | Out-Null\r\n  $link = $shell.CreateShortcut($lnkPath)\r\n  $link.TargetPath = Join-Path $root '${appName}.exe'\r\n  $link.WorkingDirectory = $root\r\n  $ico = Join-Path $root '${appName}.ico'\r\n  if (Test-Path -LiteralPath $ico) { $link.IconLocation = "$ico,0" }\r\n  $link.Description = '${appName} (v${version})'\r\n  $link.Save()\r\n}\r\n`;
  fs.writeFileSync(path.join(bundlePath, 'install-shortcuts.ps1'), shortcutScript, 'utf8');

  app.success(`Successfully generated Windows application bundle at: ${bundlePath}`);
}

function packageLinuxBundle(fullBin: string, appName: string, bundleId: string, version: string, outDir: string, iconPath: string) {
  const bundlePath = path.resolve(outDir, `${appName}.AppDir`);
  const binDir = path.join(bundlePath, 'usr', 'bin');
  const appsDir = path.join(bundlePath, 'usr', 'share', 'applications');

  app.info(`Creating Linux .AppDir bundle directories: ${bundlePath}...`);
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(appsDir, { recursive: true });

  const targetBin = path.join(binDir, appName);
  fs.copyFileSync(fullBin, targetBin);
  try { fs.chmodSync(targetBin, 0o755); } catch {}

  if (iconPath) {
    const iconRes = bundleLinuxIcon(iconPath, bundlePath, appName);
    if (iconRes.success) app.info(iconRes.message);
    else app.warn(iconRes.message);
  }

  const desktopEntry = generateLinuxDesktopEntry(appName, bundleId, version);
  fs.writeFileSync(path.join(bundlePath, `${appName}.desktop`), desktopEntry, 'utf8');
  fs.writeFileSync(path.join(appsDir, `${appName}.desktop`), desktopEntry, 'utf8');

  const appRunScript = `#!/bin/sh\nHERE="$(cd "$(dirname "$0")" && pwd -P)"\nexport BUN_BE_BUN=1\nexec "$HERE/usr/bin/${appName}" "$@"\n`;
  const appRunPath = path.join(bundlePath, 'AppRun');
  fs.writeFileSync(appRunPath, appRunScript, { mode: 0o755 });
  try { fs.chmodSync(appRunPath, 0o755); } catch {}

  const installSh = `#!/bin/sh\nset -e\nHERE="$(cd "$(dirname "$0")" && pwd -P)"\nBIN_DIR="\${HOME}/.local/bin"\nAPPS_DIR="\${HOME}/.local/share/applications"\nICON_DIR="\${HOME}/.local/share/icons/hicolor/256x256/apps"\nif [ "\${1:-}" = "--uninstall" ]; then\n  rm -f "$BIN_DIR/${appName}" "$APPS_DIR/${appName}.desktop" "$ICON_DIR/${appName}.png"\n  echo "Uninstalled ${appName}."\n  exit 0\nfi\nmkdir -p "$BIN_DIR" "$APPS_DIR" "$ICON_DIR"\nchmod +x "$HERE/AppRun" "$HERE/usr/bin/${appName}"\nln -sf "$HERE/AppRun" "$BIN_DIR/${appName}"\nif [ -f "$HERE/${appName}.png" ]; then\n  cp "$HERE/${appName}.png" "$ICON_DIR/${appName}.png"\nfi\nsed "s|^Exec=.*|Exec=\\"$HERE/AppRun\\" %F|; s|^Icon=.*|Icon=$HERE/${appName}.png|" "$HERE/${appName}.desktop" > "$APPS_DIR/${appName}.desktop"\necho "Installed ${appName} to $APPS_DIR/${appName}.desktop and $BIN_DIR/${appName}."\n`;
  const installShPath = path.join(bundlePath, 'install.sh');
  fs.writeFileSync(installShPath, installSh, { mode: 0o755 });
  try { fs.chmodSync(installShPath, 0o755); } catch {}

  app.success(`Successfully generated Linux .AppDir bundle at: ${bundlePath}`);
}

async function main() {
  let binPath = app.getFlagString('bin');
  let appName = app.getFlagString('name');
  let bundleId = app.getFlagString('id');
  let version = app.getFlagString('version');
  let platform = app.getFlagString('platform').toLowerCase();
  let iconPath = app.getFlagString('icon');
  let outDir = app.getFlagString('out');

  if (app.getFlagBool('interactive')) {
    app.panel('App Bundler Wizard', 'Package your compiled binary into a macOS, Windows, or Linux application bundle.');
    binPath = await app.prompt('Path to binary executable', 'bin/simplcli.ts');
    appName = await app.prompt('Application Name', 'MyAwesomeApp');
    bundleId = await app.prompt('Bundle ID', 'com.mycompany.myapp');
    version = await app.prompt('Version', '1.0.0');
    platform = (await app.prompt('Target Platform (macos, windows, linux, all)', 'macos')).toLowerCase();
    iconPath = await app.prompt('Icon Path (optional)', '');
    outDir = await app.prompt('Output directory', '.');
  }

  if (!binPath) {
    app.warn('No binary specified. Pass -b <binary> or -x for interactive wizard.');
    return;
  }

  const fullBin = path.resolve(binPath);
  if (!fs.existsSync(fullBin)) {
    app.error(`Binary file not found: ${binPath} (${fullBin})`);
    return;
  }

  if (platform === 'macos' || platform === 'darwin' || platform === 'all') {
    packageMacBundle(fullBin, appName, bundleId, version, outDir, iconPath);
  }
  if (platform === 'windows' || platform === 'win32' || platform === 'win' || platform === 'all') {
    packageWindowsBundle(fullBin, appName, bundleId, version, outDir, iconPath);
  }
  if (platform === 'linux' || platform === 'appdir' || platform === 'all') {
    packageLinuxBundle(fullBin, appName, bundleId, version, outDir, iconPath);
  }
}

main();
