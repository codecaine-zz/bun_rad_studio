/**
 * ⚡ Bun RAD Studio - Enterprise Icon Generator
 * Generates high-resolution macOS .icns and .png application icons for RAD Studio apps.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ICONS_DIR = resolve(process.cwd(), "icons");
mkdirSync(ICONS_DIR, { recursive: true });

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(
  width: number,
  height: number,
  getRgba: (x: number, y: number) => [number, number, number, number]
): Buffer {
  const rowLen = width * 4 + 1;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getRgba(x, y);
      const off = y * rowLen + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const idatData = deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idatData),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

interface IconSpec {
  name: string;
  bg1: [number, number, number];
  bg2: [number, number, number];
  accent: [number, number, number];
  symbol: "lightning" | "database" | "redis" | "chip" | "terminal" | "network" | "git" | "shield" | "palette";
}

const specs: IconSpec[] = [
  { name: "app_default", bg1: [15, 23, 42], bg2: [14, 116, 144], accent: [56, 189, 248], symbol: "lightning" },
  { name: "database_studio", bg1: [15, 23, 42], bg2: [13, 148, 136], accent: [45, 212, 191], symbol: "database" },
  { name: "redis_studio", bg1: [69, 10, 10], bg2: [185, 28, 28], accent: [248, 113, 113], symbol: "redis" },
  { name: "system_studio", bg1: [10, 15, 29], bg2: [30, 58, 138], accent: [96, 165, 250], symbol: "chip" },
  { name: "devtools_studio", bg1: [24, 24, 27], bg2: [63, 63, 70], accent: [251, 146, 60], symbol: "terminal" },
  { name: "api_studio", bg1: [46, 16, 101], bg2: [109, 40, 217], accent: [192, 132, 252], symbol: "lightning" },
  { name: "network_studio", bg1: [12, 74, 110], bg2: [3, 105, 161], accent: [56, 189, 248], symbol: "network" },
  { name: "git_studio", bg1: [67, 20, 7], bg2: [194, 65, 12], accent: [251, 146, 60], symbol: "git" },
  { name: "crypto_studio", bg1: [24, 24, 27], bg2: [161, 98, 7], accent: [250, 204, 21], symbol: "shield" },
  { name: "color_studio", bg1: [15, 23, 42], bg2: [126, 34, 206], accent: [236, 72, 153], symbol: "palette" },
];

function renderIconPixel(x: number, y: number, spec: IconSpec, size = 512): [number, number, number, number] {
  // Center is 256, 256
  const cx = size / 2;
  const cy = size / 2;
  const pad = 36;
  const radius = 96;

  // Squircle (macOS Big Sur rounded rect)
  const left = pad;
  const right = size - pad;
  const top = pad;
  const bottom = size - pad;

  let inside = false;
  if (x >= left + radius && x <= right - radius && y >= top && y <= bottom) {
    inside = true;
  } else if (x >= left && x <= right && y >= top + radius && y <= bottom - radius) {
    inside = true;
  } else {
    // Check 4 corners
    const corners = [
      [left + radius, top + radius],
      [right - radius, top + radius],
      [left + radius, bottom - radius],
      [right - radius, bottom - radius],
    ];
    for (const [cornX, cornY] of corners) {
      const dx = x - cornX;
      const dy = y - cornY;
      if (dx * dx + dy * dy <= radius * radius) {
        inside = true;
        break;
      }
    }
  }

  if (!inside) {
    // Subtle drop shadow outside
    const shadowDist = Math.hypot(x - cx, y - cy - 12);
    if (shadowDist < (size / 2) - 10) {
      return [0, 0, 0, Math.max(0, Math.min(80, Math.floor((1 - shadowDist / (size / 2)) * 140)))];
    }
    return [0, 0, 0, 0];
  }

  // Linear gradient background
  const t = (y - top) / (bottom - top);
  const r = Math.round(spec.bg1[0] * (1 - t) + spec.bg2[0] * t);
  const g = Math.round(spec.bg1[1] * (1 - t) + spec.bg2[1] * t);
  const b = Math.round(spec.bg1[2] * (1 - t) + spec.bg2[2] * t);

  // Glossy rim highlight
  const isRim = (y === top || y === top + 1 || x === left || x === right) && t < 0.3;
  if (isRim) {
    return [255, 255, 255, 180];
  }

  // Draw Symbol Badge
  const [ar, ag, ab] = spec.accent;
  const dx = x - cx;
  const dy = y - cy;

  if (spec.symbol === "lightning") {
    // Bold diagonal bolt
    const inBolt =
      (dx > -30 && dx < 40 && dy > -120 && dy < 10 && dx + dy * 0.3 < 15) ||
      (dx > -50 && dx < 20 && dy >= 0 && dy < 130 && dx + dy * 0.4 > -20);
    if (inBolt) return [ar, ag, ab, 255];
  } else if (spec.symbol === "database") {
    // 3 stacked horizontal database cylinders
    const inCylinder =
      (Math.abs(dy + 60) < 22 && Math.abs(dx) < 90) ||
      (Math.abs(dy) < 22 && Math.abs(dx) < 90) ||
      (Math.abs(dy - 60) < 22 && Math.abs(dx) < 90);
    if (inCylinder) return [ar, ag, ab, 255];
  } else if (spec.symbol === "redis") {
    // Layered isometric diamond/blocks
    const inDiamond = Math.abs(dx) * 1.5 + Math.abs(dy) < 110 && Math.abs(dy % 40) > 8;
    if (inDiamond) return [255, 255, 255, 240];
  } else if (spec.symbol === "chip") {
    // Central CPU square with pins
    const inCore = Math.abs(dx) < 70 && Math.abs(dy) < 70;
    const inPins = (Math.abs(dx) < 90 && Math.abs(dy) < 50 && (dx % 20) === 0) || (Math.abs(dy) < 90 && Math.abs(dx) < 50 && (dy % 20) === 0);
    if (inCore || inPins) return [ar, ag, ab, 255];
  } else if (spec.symbol === "terminal") {
    // '>_' prompt
    const inPrompt = (dx > -80 && dx < -20 && Math.abs(dy + (dx + 50)) < 15 && dy < 40 && dy > -40) || (dx > 0 && dx < 70 && dy > 20 && dy < 38);
    if (inPrompt) return [ar, ag, ab, 255];
  } else if (spec.symbol === "network") {
    // Radial concentric rings
    const dist = Math.hypot(dx, dy);
    const inRing = (dist > 25 && dist < 35) || (dist > 65 && dist < 77) || (dist > 105 && dist < 118);
    if (inRing) return [ar, ag, ab, 255];
  } else if (spec.symbol === "git") {
    // Git branch circles and vertical stem
    const inStem = Math.abs(dx + 30) < 8 && Math.abs(dy) < 90;
    const inBranch = Math.abs(dx - 30) < 8 && dy > -30 && dy < 90;
    const inDiag = Math.abs((dy + 30) - (dx + 30)) < 12 && dx > -30 && dx < 30;
    const inNodes = Math.hypot(dx + 30, dy + 70) < 22 || Math.hypot(dx + 30, dy - 70) < 22 || Math.hypot(dx - 30, dy + 10) < 22;
    if (inStem || inBranch || inDiag || inNodes) return [ar, ag, ab, 255];
  } else if (spec.symbol === "shield") {
    const inShield = Math.abs(dx) < 80 && dy > -80 && (dy < 20 || Math.abs(dx) < 80 - (dy - 20) * 0.8);
    if (inShield) return [ar, ag, ab, 255];
  } else {
    // Palette
    const dist = Math.hypot(dx, dy);
    if (dist < 85 && (dx < 30 || dy < 30)) return [ar, ag, ab, 255];
  }

  return [r, g, b, 255];
}

console.log("🎨 Generating Enterprise Icon Suite in ./icons/...");

for (const spec of specs) {
  const pngPath = join(ICONS_DIR, `${spec.name}.png`);
  const icnsPath = join(ICONS_DIR, `${spec.name}.icns`);

  const png = createPng(512, 512, (x, y) => renderIconPixel(x, y, spec, 512));
  await Bun.write(pngPath, png);

  // Generate macOS .icns using native sips & iconutil
  if (process.platform === "darwin") {
    const iconsetDir = join(ICONS_DIR, `${spec.name}.iconset`);
    mkdirSync(iconsetDir, { recursive: true });

    const sizes = [
      [16, "icon_16x16.png"],
      [32, "icon_16x16@2x.png"],
      [32, "icon_32x32.png"],
      [64, "icon_32x32@2x.png"],
      [128, "icon_128x128.png"],
      [256, "icon_128x128@2x.png"],
      [256, "icon_256x256.png"],
      [512, "icon_256x256@2x.png"],
      [512, "icon_512x512.png"],
    ];

    for (const [sz, file] of sizes) {
      spawnSync("sips", ["-z", String(sz), String(sz), pngPath, "--out", join(iconsetDir, file)], { stdio: "ignore" });
    }

    spawnSync("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath], { stdio: "ignore" });
    rmSync(iconsetDir, { recursive: true, force: true });
    console.log(`  ✓ ${spec.name}.icns (${(Bun.file(icnsPath).size / 1024).toFixed(1)} KB) + ${spec.name}.png`);
  } else {
    console.log(`  ✓ ${spec.name}.png`);
  }
}

// Write README in ./icons
const readmeContent = `# 🎨 Bun RAD Studio - Application Icons Directory

This directory contains application icons for compiling standalone macOS \`.app\` bundles, Windows executables, and Linux desktop packages.

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

## 📥 Adding Custom Icons
You can drop any custom \`.icns\` or \`.png\` (512x512 recommended) file into this folder.
In **App Bundler Studio Pro**, select your custom icon from the dropdown or click **📂 Browse Icon...** to pick any icon from disk.
When packaging a macOS \`.app\` bundle, PNG icons are automatically converted to native multi-resolution Apple \`.icns\` bundles.
`;

await Bun.write(join(ICONS_DIR, "README.md"), readmeContent);
console.log("✨ Enterprise icon suite successfully generated!");
