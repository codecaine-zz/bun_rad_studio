#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const app = SimpleCLI.newApp('appbundler-cli', '1.0.0')
  .setDescription('macOS Native .app Bundle Packager & Generator CLI');

app.addFlagString('bin', 'b', '', 'Path to compiled executable binary');
app.addFlagString('name', 'n', 'MyApp', 'Application bundle display name');
app.addFlagString('id', 'i', 'com.simplcli.app', 'Bundle identifier (CFBundleIdentifier)');
app.addFlagString('version', 'v', '1.0.0', 'Bundle version (CFBundleShortVersionString)');
app.addFlagString('out', 'o', '.', 'Output destination directory for .app bundle');
app.addFlagBool('interactive', 'x', false, 'Launch interactive app bundler wizard');

if (!app.parseCli()) process.exit(0);

app.banner('App Bundler Studio CLI', 'v1.0.0 - macOS Native .app Packager');

async function main() {
  let binPath = app.getFlagString('bin');
  let appName = app.getFlagString('name');
  let bundleId = app.getFlagString('id');
  let version = app.getFlagString('version');
  let outDir = app.getFlagString('out');

  if (app.getFlagBool('interactive')) {
    app.panel('App Bundler Wizard', 'Package your compiled binary into a macOS .app application bundle.');
    binPath = await app.prompt('Path to binary executable', 'bin/simplcli.ts');
    appName = await app.prompt('Application Name', 'MyAwesomeApp');
    bundleId = await app.prompt('Bundle ID', 'com.mycompany.myapp');
    version = await app.prompt('Version', '1.0.0');
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

  const bundlePath = path.resolve(outDir, `${appName}.app`);
  const macosDir = path.join(bundlePath, 'Contents', 'MacOS');
  const resDir = path.join(bundlePath, 'Contents', 'Resources');

  app.info(`Creating bundle directories: ${bundlePath}...`);
  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resDir, { recursive: true });

  const targetBin = path.join(macosDir, appName);
  fs.copyFileSync(fullBin, targetBin);
  fs.chmodSync(targetBin, 0o755);

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>${appName}</string>
	<key>CFBundleIdentifier</key>
	<string>${bundleId}</string>
	<key>CFBundleName</key>
	<string>${appName}</string>
	<key>CFBundleDisplayName</key>
	<string>${appName}</string>
	<key>CFBundleVersion</key>
	<string>${version}</string>
	<key>CFBundleShortVersionString</key>
	<string>${version}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>11.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>`;

  fs.writeFileSync(path.join(bundlePath, 'Contents', 'Info.plist'), plistContent, 'utf8');
  app.success(`Successfully generated macOS .app bundle at: ${bundlePath}`);
}

main();
