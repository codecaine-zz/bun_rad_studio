// App icons: one picture per application that says what the app is. Each is a glowing "liquid glass" tile (see
// iconRenderer.ts) with a symbol chosen for the app (iconDesigns.ts) in its category's colors, drawn by macOS's own
// graphics through a short JavaScript-for-Automation program (osascript) and turned into a .icns file with sips and
// iconutil. If drawing fails the Mac apps use the project's generic icon, and the apps still work.
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { DESIGNS } from "./iconDesigns";
import { ICON_RENDERER } from "./iconRenderer";
import { ROOT, mapPool, run } from "./common";

export interface IconSpec {
  /** File name without extension. */
  name: string;
  symbol?: string;
  custom?: string;
  text?: string;
  /** Deep color in the top left, vivid color in the bottom right, the glow around the glyph, and the glyph's lower tint. */
  dark: string;
  vivid: string;
  glow: string;
  tint: string;
}

interface Palette {
  dark: string;
  vivid: string;
  glow: string;
  tint: string;
}

const PALETTES: Record<string, Palette> = {
  "File & Directory Tools": { dark: "#1c0f04", vivid: "#f59e0b", glow: "#fb7185", tint: "#fde68a" },
  "Developer Tools": { dark: "#070b1d", vivid: "#3b82f6", glow: "#22d3ee", tint: "#bfdbfe" },
  "Database & Storage": { dark: "#031219", vivid: "#14b8a6", glow: "#6366f1", tint: "#99f6e4" },
  "Network & Cloud": { dark: "#04101f", vivid: "#06b6d4", glow: "#3b82f6", tint: "#a5f3fc" },
  "Security & Crypto": { dark: "#12051f", vivid: "#a855f7", glow: "#ec4899", tint: "#e9d5ff" },
  "System & Hardware": { dark: "#08130e", vivid: "#22c55e", glow: "#06b6d4", tint: "#bbf7d0" },
  "Productivity & Text": { dark: "#06140f", vivid: "#10b981", glow: "#facc15", tint: "#d1fae5" },
  "Design & Media": { dark: "#1a0518", vivid: "#ec4899", glow: "#f97316", tint: "#fbcfe8" },
  "Design & UX": { dark: "#1a0a12", vivid: "#fb7185", glow: "#a78bfa", tint: "#fecdd3" },
  "RAD Studio": { dark: "#060a22", vivid: "#6366f1", glow: "#22d3ee", tint: "#c7d2fe" },
  "Games & Entertainment": { dark: "#1c0606", vivid: "#ef4444", glow: "#f59e0b", tint: "#fecaca" },
};
const FALLBACK: Palette = { dark: "#0b1020", vivid: "#6b7280", glow: "#38bdf8", tint: "#e5e7eb" };

/** The Finder category each group of apps belongs to. */
export function appStoreCategory(category: string): string {
  const map: Record<string, string> = {
    "Games & Entertainment": "public.app-category.games",
    "Developer Tools": "public.app-category.developer-tools",
    "RAD Studio": "public.app-category.developer-tools",
    "Database & Storage": "public.app-category.developer-tools",
    "Design & Media": "public.app-category.graphics-design",
    "Design & UX": "public.app-category.graphics-design",
    "Productivity & Text": "public.app-category.productivity",
    "File & Directory Tools": "public.app-category.utilities",
  };
  return map[category] ?? "public.app-category.utilities";
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function hslToHex([h, s, l]: [number, number, number]): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}

/** The category's colors, turned by an amount that depends on the app's name so neighbours are still told apart (games turn furthest, so they span red to violet). */
export function colorsFor(category: string, id: string): Palette {
  const base = PALETTES[category] ?? FALLBACK;
  const range = category === "Games & Entertainment" ? 90 : 40;
  const shift = (hash(id) % (range + 1)) - range / 2;
  const turn = (hex: string) => {
    const [h, s, l] = rgbToHsl(hexToRgb(hex));
    return hslToHex([(h + shift + 360) % 360, s, l]);
  };
  return { dark: turn(base.dark), vivid: turn(base.vivid), glow: turn(base.glow), tint: turn(base.tint) };
}

export function iconSpecFor(app: { id: string; category: string }): IconSpec {
  const design = DESIGNS[app.id] ?? { symbol: "app.dashed" };
  return { name: app.id, ...design, ...colorsFor(app.category, app.id) };
}

export const ICONS_OUT = join(ROOT, "release", ".cache", "icons");

/** Draws a 1024-pixel PNG for each spec into `outDir`. Returns the names that were drawn. */
export async function renderPngs(specs: IconSpec[], outDir = join(ICONS_OUT, "png"), jobs = 1): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  const dir = join(ICONS_OUT, "tmp");
  mkdirSync(dir, { recursive: true });
  const script = join(dir, "render.js");
  writeFileSync(script, ICON_RENDERER);
  // The drawing script handles a list of icons one by one, so a long list is cut into pieces that are drawn at the same time.
  const pieces = Math.max(1, Math.min(Math.floor(jobs), Math.ceil(specs.length / 6)));
  const size = Math.ceil(specs.length / pieces);
  const chunks = Array.from({ length: pieces }, (_, i) => specs.slice(i * size, (i + 1) * size)).filter((c) => c.length);
  await mapPool(chunks, pieces, async (chunk, i) => {
    const json = join(dir, `specs-${i}.json`);
    writeFileSync(json, JSON.stringify(chunk));
    await run(["osascript", "-l", "JavaScript", script, json, outDir]);
  });
  return specs.map((s) => s.name).filter((n) => existsSync(join(outDir, `${n}.png`)));
}

const ICONSET_SIZES: Array<[number, string]> = [
  [16, "icon_16x16.png"], [32, "icon_16x16@2x.png"], [32, "icon_32x32.png"], [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"], [256, "icon_128x128@2x.png"], [256, "icon_256x256.png"], [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"], [1024, "icon_512x512@2x.png"],
];

/** Turns a 1024 PNG into a .icns file with sips and iconutil (macOS only). */
export async function makeIcns(png: string, icns: string): Promise<void> {
  const set = icns.replace(/\.icns$/, ".iconset");
  rmSync(set, { recursive: true, force: true });
  mkdirSync(set, { recursive: true });
  for (const [px, file] of ICONSET_SIZES) await run(["sips", "-z", String(px), String(px), png, "--out", join(set, file)]);
  await run(["iconutil", "-c", "icns", set, "-o", icns]);
  rmSync(set, { recursive: true, force: true });
}

/** The icon to use for everything when drawing is not possible. */
export const GENERIC_ICNS = join(ROOT, "icons", "app_default.icns");
export const copyGeneric = (to: string) => copyFileSync(GENERIC_ICNS, to);
