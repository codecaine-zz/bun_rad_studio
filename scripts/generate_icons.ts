/**
 * ⚡ Bun RAD Studio - Enterprise Icon Generator
 * Generates high-resolution 1024x1024 .png, macOS .icns, and multi-resolution Windows .ico
 * application icons across ./icons/ and ./icons/desktop/.
 */

import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { listMacApps } from "./release/build_mac_apps";
import { iconSpecFor, makeIcns, makeIco, renderPngs } from "./release/icons";

const ICONS_DIR = resolve(process.cwd(), "icons");
const DESKTOP_ICONS_DIR = join(ICONS_DIR, "desktop");
mkdirSync(ICONS_DIR, { recursive: true });
mkdirSync(DESKTOP_ICONS_DIR, { recursive: true });

const apps = listMacApps();
const appById = new Map(apps.map((a) => [a.id, a]));

console.log(`🎨 Generating ${apps.length} high-detail 1024x1024 desktop icons (.png + .ico) in ./icons/desktop/...`);
const desktopSpecs = apps.map(iconSpecFor);
await renderPngs(desktopSpecs, DESKTOP_ICONS_DIR, 4);

for (const app of apps) {
  const pngPath = join(DESKTOP_ICONS_DIR, `${app.id}.png`);
  const icoPath = join(DESKTOP_ICONS_DIR, `${app.id}.ico`);
  await makeIco(pngPath, icoPath);
}
console.log(`  ✓ Rendered ${apps.length} PNGs (1024x1024) and ${apps.length} multi-res ICOs ([32, 64, 128, 256]) in ./icons/desktop/`);

const presetMappings: Array<{ presetName: string; appId: string }> = [
  { presetName: "app_default", appId: "rad-studio" },
  { presetName: "database_studio", appId: "sqlite-studio" },
  { presetName: "redis_studio", appId: "redis-studio" },
  { presetName: "system_studio", appId: "system-studio" },
  { presetName: "devtools_studio", appId: "devtools-studio" },
  { presetName: "api_studio", appId: "api-studio" },
  { presetName: "network_studio", appId: "network-studio" },
  { presetName: "git_studio", appId: "git-studio" },
  { presetName: "crypto_studio", appId: "crypto-studio" },
  { presetName: "color_studio", appId: "color-studio" },
];

console.log("🎨 Generating Enterprise Preset Icons (.png + .icns) in ./icons/...");
for (const { presetName, appId } of presetMappings) {
  const srcPng = join(DESKTOP_ICONS_DIR, `${appId}.png`);
  const dstPng = join(ICONS_DIR, `${presetName}.png`);
  const dstIcns = join(ICONS_DIR, `${presetName}.icns`);
  copyFileSync(srcPng, dstPng);
  if (process.platform === "darwin" && appById.has(appId)) {
    await makeIcns(dstPng, dstIcns);
    console.log(`  ✓ ${presetName}.icns (${(Bun.file(dstIcns).size / 1024).toFixed(1)} KB) + ${presetName}.png`);
  } else {
    console.log(`  ✓ ${presetName}.png`);
  }
}

const readmeContent = `# 🎨 Bun RAD Studio - Application Icons Directory

This directory contains high-detail 1024x1024 application icons for compiling standalone macOS \`.app\` bundles, Windows executables, and Linux desktop packages.

## 📂 Available Pre-Configured Icons
- **\`app_default.icns\` / \`.png\`**: Universal Bun RAD Studio application icon.
- **\`database_studio.icns\` / \`.png\`**: SQLite Studio Pro & Database Studio icon.
- **\`redis_studio.icns\` / \`.png\`**: Redis Studio Pro in-memory workstation icon.
- **\`system_studio.icns\` / \`.png\`**: System Information & Hardware Telemetry Studio icon.
- **\`devtools_studio.icns\` / \`.png\`**: DevTools & Developer CLI Studio icon.
- **\`api_studio.icns\` / \`.png\`**: API Testing Studio Pro icon.
- **\`network_studio.icns\` / \`.png\`**: Network Diagnostics & Forensics Studio icon.
- **\`git_studio.icns\` / \`.png\`**: Git Version Control Studio icon.
- **\`crypto_studio.icns\` / \`.png\`**: Cryptography & Hashing Studio icon.
- **\`color_studio.icns\` / \`.png\`**: Color Palette & Design Token Studio icon.
- **\`desktop/*.png\` & \`desktop/*.ico\`**: Full suite of 66 application-specific 1024x1024 PNGs and multi-resolution Windows \`.ico\` icons.

## 📥 Adding Custom Icons
You can drop any custom \`.icns\`, \`.png\` (1024x1024 recommended), or \`.ico\` file into this folder.
In **App Bundler Studio Pro**, select your custom icon from the dropdown or click **📂 Browse Icon...** to pick any icon from disk.
When packaging a macOS \`.app\` bundle, PNG icons are automatically converted to native multi-resolution Apple \`.icns\` bundles. When compiling or packaging Windows \`.exe\` executables, multi-resolution \`.ico\` resources are embedded directly into the PE header.
`;

await Bun.write(join(ICONS_DIR, "README.md"), readmeContent);
console.log("✨ Enterprise icon suite successfully generated!");
