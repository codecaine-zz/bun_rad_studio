// Atmospheric weather, shader, and particle effects engine for the File Manager:
// Supports 110 options ("none" + 109 live procedural effects) across Low Graphics, Medium Graphics,
// and High-End / Modern ARM Ultra tiers, plus real-time Multi-Effect Layer Mixing (up to 4 simultaneous effects).
// Uses pre-rendered offscreen volumetric sprites and multi-tone harmonic theme palettes so every single effect
// and multi-layer combination looks modern, cinematic, and cohesive with the active theme at high frame rates.
import { openDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { saveSettings } from "./nav.js";
import { on, state } from "./state.js";
import {
  ATMOSPHERE_BY_ID,
  ATMOSPHERE_CATEGORIES,
  ATMOSPHERE_IDS,
  ATMOSPHERE_MIX_PRESETS,
  ATMOSPHERE_OPTIONS,
  MAX_ATMOSPHERE_LAYERS,
  formatAtmosphereLabel,
  normalizeAtmosphereSpec,
  parseAtmosphereIds,
} from "./atmosphereCatalog.js";

export {
  ATMOSPHERE_BY_ID,
  ATMOSPHERE_CATEGORIES,
  ATMOSPHERE_IDS,
  ATMOSPHERE_MIX_PRESETS,
  ATMOSPHERE_OPTIONS,
  MAX_ATMOSPHERE_LAYERS,
  formatAtmosphereLabel,
  normalizeAtmosphereSpec,
  parseAtmosphereIds,
};

export const HARDWARE_TIERS = [
  {
    id: "auto",
    label: "Auto-detect",
    badge: "Smart",
    desc: "Automatically selects Low, Medium, High-End or Modern ARM Ultra based on your CPU/GPU cores and display.",
  },
  {
    id: "low",
    label: "Low Graphics",
    badge: "Eco · Integrated GPU",
    desc: "Lightweight particle budget, 1x resolution and zero blur overhead for older or battery-powered computers.",
  },
  {
    id: "medium",
    label: "Medium Graphics",
    badge: "Balanced · 60 FPS",
    desc: "Full weather and particle simulation with soft volumetric sprites and surface splash ripples.",
  },
  {
    id: "high",
    label: "High-End Graphics",
    badge: "Dedicated GPU",
    desc: "High particle density, volumetric depth layers, screen-space glow and interactive cursor wake.",
  },
  {
    id: "ultra",
    label: "Modern ARM / Ultra",
    badge: "Apple Silicon · ARM64 · Out of This World",
    desc: "Multi-layer parallax depth, volumetric bokeh sprites, cursor vortex physics and harmonic theme shaders.",
  },
];

export const ATMOSPHERE_SECTIONS = [
  {
    tier: "low",
    title: "Low Graphics — Lightweight & Battery Friendly",
    subtitle: "Engineered for integrated graphics and low power consumption while keeping a crisp, modern ambient vibe.",
    badge: "Eco Tier · 40 Effects",
  },
  {
    tier: "medium",
    title: "Medium Graphics — Volumetric Weather, High-Voltage & Particles",
    subtitle: "Multi-depth weather, Jacob’s Ladder arcs, Nikola plasma globes, Cherenkov cores, silk mist layers and glyph streams.",
    badge: "Balanced Tier · 55 Effects",
  },
  {
    tier: "ultra",
    title: "High-End & Modern ARM — Sci-Fi Physics, Tesla Coils & Relativistic Shaders",
    subtitle: "Unleashes unified-memory ARM64 / Apple Silicon and high-end GPUs with interactive Tesla coil plasma arcs, Tokamak fusion toruses, CERN hadron colliders, Lorenz strange attractors, ferrofluid spikes, Hawking event horizons, and Year-2126 4D/11D hyper-dimensional projections.",
    badge: "ARM64 / Ultra Tier · 77 Effects",
  },
];

export const REACTIVE_MODES = [
  {
    id: "off",
    label: "Steady",
    badge: "Constant",
    desc: "Smooth, steady atmospheric and physics simulation speed.",
  },
  {
    id: "activity",
    label: "⚡ Typing & Cursor Velocity",
    badge: "Interactive Surge",
    desc: "Tesla arcs, Tokamak plasma, and particles surge dynamically as you type, click, or sweep the cursor.",
  },
  {
    id: "telemetry",
    label: "📊 System Telemetry Pulse",
    badge: "Harmonic Load",
    desc: "Modulates arc branching, collider cadence, and glow with real-time system telemetry harmonics.",
  },
  {
    id: "audio",
    label: "🎵 Audio & Synth Beat",
    badge: "Rhythmic",
    desc: "Pulses high-voltage arcs, ferrofluid spikes, and aurora waves to rhythmic bass and synth harmonics.",
  },
];

const VALID_TIERS = new Set(HARDWARE_TIERS.map((t) => t.id));
const VALID_REACTIVE_MODES = new Set(REACTIVE_MODES.map((m) => m.id));
const DEFAULT_GLYPHS = "0123456789ABCDEFZ<>:+*=-ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";

export const TIER_PROFILES = {
  low: { density: 0.5, dpr: 1, bloom: false, interactive: false, lightning: false, ribbons: 2 },
  medium: { density: 0.85, dpr: 1, bloom: true, interactive: true, lightning: true, ribbons: 3 },
  high: { density: 1.15, dpr: 1, bloom: true, interactive: true, lightning: true, ribbons: 4 },
  ultra: { density: 1.45, dpr: 1, bloom: true, interactive: true, lightning: true, ribbons: 5 },
};

/** Natural back-to-front rendering order when mixing multiple effects simultaneously. */
const ENGINE_DEPTH_ORDER = {
  grid: 1,
  nebula: 2,
  aurora: 3,
  waves: 4,
  beams: 5,
  portal: 6,
  radar: 7,
  physics: 8,
  future2126: 9,
  stars: 10,
  mist: 11,
  network: 12,
  geometry: 13,
  dna: 14,
  circuit: 15,
  tesla: 16,
  precip: 17,
  snow: 18,
  ember: 19,
  orbs: 20,
  glyph: 21,
};

const MAX_CANVAS_W = 1440;
const MAX_CANVAS_H = 900;
const FRAME_INTERVAL_MS = 30;

let rafId = 0;
let activeEffect = "none";
let activeLayers = [];
let activeIntensity = 60;
let activeTier = "medium";
let activeReactiveMode = "off";
let reactiveImpulse = 0;
let frameTick = 0;
let lastFrameAt = 0;
let scrollPauseUntil = 0;
let resizeBound = false;
let cachedColors = {
  isDark: true,
  accent: [110, 168, 255],
  secondary: [188, 120, 255],
  tertiary: [72, 228, 210],
  highlight: [235, 246, 255],
};
let spriteBank = null;
const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };

/** Detects the machine's graphics tier (`"low" | "medium" | "high" | "ultra"`), recognizing Apple Silicon & modern ARM64 systems. */
export function detectHardwareTier(navOverride, winOverride) {
  try {
    const nav = navOverride || (typeof navigator !== "undefined" ? navigator : {});
    const win = winOverride || (typeof window !== "undefined" ? window : {});
    const cores = Number(nav.hardwareConcurrency) || 4;
    const mem = Number(nav.deviceMemory) || 0;
    const dpr = Number(win.devicePixelRatio) || 1;
    const ua = `${nav.userAgent || ""} ${nav.platform || ""} ${nav.userAgentData?.architecture || ""} ${nav.userAgentData?.platform || ""}`.toLowerCase();
    const isModernArm = /arm|aarch64|apple/.test(ua) || (/mac/.test(ua) && dpr >= 2 && cores >= 8);
    if (isModernArm && cores >= 8) return "ultra";
    if (cores >= 12 || (cores >= 8 && dpr >= 2 && mem >= 8)) return "ultra";
    if (cores >= 8 || mem >= 8) return "high";
    if (cores >= 4) return "medium";
    return "low";
  } catch {
    return "medium";
  }
}

export function effectiveAtmosphereTier() {
  const raw = state.settings?.atmosphereTier;
  if (typeof raw === "string" && VALID_TIERS.has(raw) && raw !== "auto") return raw;
  return detectHardwareTier();
}

export function effectiveAtmosphereReactive() {
  const raw = state.settings?.atmosphereReactive;
  return typeof raw === "string" && VALID_REACTIVE_MODES.has(raw) ? raw : "off";
}

/** Triggers an immediate high-voltage / physics surge across all active atmospheric layers. */
export function triggerReactiveImpulse(boost = 1.15) {
  reactiveImpulse = Math.min(2.0, Math.max(reactiveImpulse, Number(boost) || 1.15));
  if (typeof document !== "undefined") {
    document.documentElement.dataset.atmosphereSurge = "true";
  }
  if (activeEffect !== "none") drawFrame();
  return reactiveImpulse;
}

/** Computes the current real-time reactive multiplier for particle & plasma energy. */
export function computeReactiveMultiplier(tick = frameTick) {
  reactiveImpulse *= 0.92;
  if (reactiveImpulse < 0.01) reactiveImpulse = 0;
  let mod = 1.0 + reactiveImpulse * 0.65;
  if (activeReactiveMode === "activity") {
    const speed = Math.min(40, Math.hypot(pointer.vx, pointer.vy));
    mod += (speed / 40) * 0.45;
  } else if (activeReactiveMode === "telemetry") {
    mod += 0.22 + 0.2 * Math.sin(tick * 0.08) + 0.12 * Math.cos(tick * 0.21);
  } else if (activeReactiveMode === "audio") {
    const beat = Math.pow(Math.max(0, Math.sin(tick * 0.19)), 4);
    const sub = 0.5 + 0.5 * Math.sin(tick * 0.05);
    mod += beat * 0.55 + sub * 0.18;
  }
  return Math.min(2.2, Math.max(0.5, mod));
}

function parseColorRgb(raw, fallback = null) {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  const s = raw.trim();
  const hex = s.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbMatch = s.match(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (rgbMatch) {
    return [
      Math.min(255, Number(rgbMatch[1]) || 0),
      Math.min(255, Number(rgbMatch[2]) || 0),
      Math.min(255, Number(rgbMatch[3]) || 0),
    ];
  }
  return fallback;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function shiftHarmony(rgb, hueDelta, minSat = 0.65, targetLight = 0.62) {
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return hslToRgb(h + hueDelta, Math.max(minSat, Math.min(0.95, s * 1.15)), Math.max(0.42, Math.min(0.76, (l + targetLight) / 2)));
}

function colorDist(a, b) {
  if (!a || !b) return 0;
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/** Pre-renders reusable offscreen radial bokeh, volumetric cloud, and diffraction star-flare sprites for zero-cost GPU blitting. */
function buildSpriteBank(colors) {
  if (typeof document === "undefined") return null;
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "")) return null;
  const makeCanvas = (size) => {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    let ctx = null;
    try { ctx = c.getContext("2d"); } catch { return null; }
    return ctx ? { c, ctx, size } : null;
  };

  const makeBokehOrb = (rgb, coreRgb = [255, 255, 255]) => {
    const item = makeCanvas(96);
    if (!item) return null;
    const { c, ctx, size } = item;
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, `rgba(${coreRgb[0]}, ${coreRgb[1]}, ${coreRgb[2]}, 0.98)`);
    g.addColorStop(0.16, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.86)`);
    g.addColorStop(0.42, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.34)`);
    g.addColorStop(0.72, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.08)`);
    g.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  };

  const makeVolumetricCloud = (rgb) => {
    const item = makeCanvas(128);
    if (!item) return null;
    const { c, ctx, size } = item;
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.55)`);
    g.addColorStop(0.32, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.32)`);
    g.addColorStop(0.64, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.1)`);
    g.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return c;
  };

  const makeStarFlare = (rgb) => {
    const item = makeCanvas(96);
    if (!item) return null;
    const { c, ctx, size } = item;
    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r * 0.75);
    g.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    g.addColorStop(0.2, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.65)`);
    g.addColorStop(0.55, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.12)`);
    g.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.translate(r, r);
    for (let rot = 0; rot < 2; rot++) {
      const spike = ctx.createLinearGradient(-r, 0, r, 0);
      spike.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
      spike.addColorStop(0.38, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.35)`);
      spike.addColorStop(0.5, "rgba(255, 255, 255, 0.95)");
      spike.addColorStop(0.62, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.35)`);
      spike.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
      ctx.fillStyle = spike;
      ctx.fillRect(-r, -1.2, size, 2.4);
      ctx.rotate(Math.PI / 2);
    }
    ctx.restore();
    return c;
  };

  const warmEmber = [
    Math.min(255, Math.round(colors.accent[0] * 0.35 + 255 * 0.65)),
    Math.min(255, Math.round(colors.accent[1] * 0.3 + 140 * 0.7)),
    Math.min(255, Math.round(colors.accent[2] * 0.2 + 45 * 0.8)),
  ];
  const mistTone = colors.isDark
    ? [
        Math.round((colors.accent[0] + 195) / 2),
        Math.round((colors.accent[1] + 210) / 2),
        Math.round((colors.accent[2] + 230) / 2),
      ]
    : [
        Math.round((colors.accent[0] + 120) / 2),
        Math.round((colors.accent[1] + 135) / 2),
        Math.round((colors.accent[2] + 155) / 2),
      ];

  return {
    orbPrimary: makeBokehOrb(colors.accent, colors.highlight),
    orbSecondary: makeBokehOrb(colors.secondary, colors.highlight),
    orbTertiary: makeBokehOrb(colors.tertiary, colors.highlight),
    orbWarm: makeBokehOrb(warmEmber, [255, 248, 220]),
    orbSnow: makeBokehOrb(colors.isDark ? [230, 242, 255] : [115, 145, 185], [255, 255, 255]),
    cloudPrimary: makeVolumetricCloud(colors.accent),
    cloudSecondary: makeVolumetricCloud(colors.secondary),
    cloudMist: makeVolumetricCloud(mistTone),
    starPrimary: makeStarFlare(colors.accent),
    starSecondary: makeStarFlare(colors.secondary),
  };
}

function refreshThemeColors() {
  const root = document.documentElement;
  const fxStyleText = document.getElementById("fm-theme-effects")?.textContent || "";
  const fromFxCss = (name) => {
    const m = fxStyleText.match(new RegExp(`${name}\\s*:\\s*([^;\\}]+)`, "i"));
    return m ? m[1].trim() : "";
  };
  const cs = typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
  const get = (name) => root.style.getPropertyValue(name)?.trim() || fromFxCss(name) || cs?.getPropertyValue(name)?.trim() || "";
  const bgRgb = parseColorRgb(get("--bg"), null);
  const isDark = bgRgb
    ? (0.299 * bgRgb[0] + 0.587 * bgRgb[1] + 0.114 * bgRgb[2]) < 140
    : root.dataset.theme !== "light";

  const accent = parseColorRgb(get("--fx-glow-color") || get("--accent"), isDark ? [110, 168, 255] : [37, 99, 235]);
  const rawSecondary = parseColorRgb(get("--fx-glow-color-2") || get("--link") || get("--selected"), null);
  const secondary = rawSecondary && colorDist(accent, rawSecondary) > 45
    ? rawSecondary
    : shiftHarmony(accent, 52, 0.72, isDark ? 0.64 : 0.52);
  const tertiary = shiftHarmony(accent, -46, 0.68, isDark ? 0.66 : 0.54);
  const highlight = [
    Math.min(255, Math.round(accent[0] * 0.28 + 255 * 0.72)),
    Math.min(255, Math.round(accent[1] * 0.28 + 255 * 0.72)),
    Math.min(255, Math.round(accent[2] * 0.28 + 255 * 0.72)),
  ];

  cachedColors = { isDark, accent, secondary, tertiary, highlight };
  root.style.setProperty("--fm-atmo-c1", `rgb(${accent[0]}, ${accent[1]}, ${accent[2]})`);
  root.style.setProperty("--fm-atmo-c2", `rgb(${secondary[0]}, ${secondary[1]}, ${secondary[2]})`);
  root.style.setProperty("--fm-atmo-c3", `rgb(${tertiary[0]}, ${tertiary[1]}, ${tertiary[2]})`);
  spriteBank = buildSpriteBank(cachedColors);
  return cachedColors;
}

function reducedMotion() {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Resolves the active atmosphere effect or multi-effect combo from settings or the current theme's `data-fx-atmosphere`. */
export function effectiveAtmosphere() {
  const fromSettings = normalizeAtmosphereSpec(state.settings?.atmosphere);
  if (fromSettings && fromSettings !== "none") return fromSettings;
  const fromTheme = normalizeAtmosphereSpec(document.documentElement.getAttribute("data-fx-atmosphere"));
  if (fromTheme && fromTheme !== "none") return fromTheme;
  return "none";
}

export function effectiveAtmosphereIntensity() {
  const raw = state.settings?.atmosphereIntensity;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.min(100, Math.max(10, Math.round(raw))) : 60;
}

function stopLoop() {
  if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
  rafId = 0;
}

function ensureLayer() {
  let layer = document.getElementById("fm-atmosphere-layer");
  if (!layer) {
    const veil = h("div", { class: "fm-atmosphere-veil" },
      h("div", { class: "fm-smoke-plume fm-smoke-plume-1" }),
      h("div", { class: "fm-smoke-plume fm-smoke-plume-2" }),
      h("div", { class: "fm-smoke-plume fm-smoke-plume-3" }),
    );
    const canvas = h("canvas", { id: "fm-atmosphere-canvas", class: "fm-atmosphere-canvas" });
    layer = h("div", { id: "fm-atmosphere-layer", class: "fm-atmosphere-layer", "aria-hidden": "true" }, veil, canvas);
    document.body.append(layer);
  }
  if (!resizeBound && typeof window !== "undefined") {
    resizeBound = true;
    window.addEventListener("resize", () => {
      if (activeEffect !== "none") syncCanvasSize();
    }, { passive: true });
    window.addEventListener("pointermove", (e) => {
      if (activeEffect === "none") return;
      const w = Math.max(320, window.innerWidth || 1280);
      const h = Math.max(240, window.innerHeight || 800);
      const sx = Math.min(MAX_CANVAS_W, w) / w;
      const sy = Math.min(MAX_CANVAS_H, h) / h;
      const nx = e.clientX * sx;
      const ny = e.clientY * sy;
      pointer.vx = nx - pointer.x;
      pointer.vy = ny - pointer.y;
      pointer.x = nx;
      pointer.y = ny;
      pointer.active = true;
    }, { passive: true });
    window.addEventListener("pointerdown", () => {
      if (activeEffect !== "none" && activeReactiveMode === "activity") {
        reactiveImpulse = Math.min(2.0, reactiveImpulse + 0.35);
      }
    }, { passive: true });
    window.addEventListener("keydown", () => {
      if (activeEffect !== "none" && activeReactiveMode === "activity") {
        reactiveImpulse = Math.min(2.0, reactiveImpulse + 0.16);
      }
    }, { passive: true });
    document.addEventListener("scroll", () => {
      if (activeEffect !== "none") scrollPauseUntil = performance.now() + 120;
    }, { capture: true, passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopLoop();
      else if (activeEffect !== "none" && !reducedMotion()) startLoop();
    });
  }
  return layer;
}

function syncCanvasSize() {
  const canvas = document.getElementById("fm-atmosphere-canvas");
  if (!canvas) return { w: 1280, h: 800, dpr: 1 };
  const rawW = Math.max(320, window.innerWidth || 1280);
  const rawH = Math.max(240, window.innerHeight || 800);
  const w = Math.min(MAX_CANVAS_W, rawW);
  const h = Math.min(MAX_CANVAS_H, rawH);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return { w, h, dpr: 1 };
}

function createLightningBolt(w, h) {
  const startX = w * (0.12 + Math.random() * 0.76);
  const segments = [];
  let cx = startX;
  let cy = 0;
  const steps = 11 + Math.floor(Math.random() * 6);
  const stepY = (h * (0.58 + Math.random() * 0.35)) / steps;
  for (let i = 0; i < steps; i++) {
    const nx = cx + (Math.random() - 0.5) * 68;
    const ny = cy + stepY;
    segments.push({ x1: cx, y1: cy, x2: nx, y2: ny, branch: false });
    if (Math.random() < 0.38 && i > 1 && i < steps - 2) {
      let bx = nx;
      let by = ny;
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let b = 0; b < 3; b++) {
        const nbx = bx + dir * (14 + Math.random() * 28);
        const nby = by + stepY * 0.85;
        segments.push({ x1: bx, y1: by, x2: nbx, y2: nby, branch: true });
        bx = nbx;
        by = nby;
      }
    }
    cx = nx;
    cy = ny;
  }
  return { segments, alpha: 1.0, flash: 0.25, impactX: cx, impactY: cy };
}

function seedSingleLayer(opt, w, h, baseDensity) {
  const engine = opt.engine;
  const params = opt.params || {};
  const density = baseDensity * (params.densityMul || 1);
  const particles = [];
  const ripples = [];
  const lightningBolts = [];
  const meteors = [];

  if (engine === "precip") {
    const isCyber = !!params.cyber;
    const baseCount = isCyber ? 90 : 68;
    const count = Math.max(14, Math.round(baseCount * density));
    for (let i = 0; i < count; i++) {
      const depth = 0.35 + Math.random() * 0.65;
      particles.push({
        kind: "streak",
        depth,
        x: Math.random() * (w + 260) - 130,
        y: Math.random() * h,
        len: ((params.len ?? 22) + Math.random() * 20) * depth,
        speed: ((params.speed ?? 13) + (Math.random() * 8)) * (params.horizontal ? 0 : (0.55 + depth * 0.65)),
        drift: ((params.drift ?? 1.9) + (Math.random() - 0.3) * 0.8) * (0.6 + depth * 0.5),
        alpha: (0.2 + Math.random() * 0.45) * depth,
        thick: (0.75 + Math.random() * (isCyber ? 1.4 : 1.0)) * depth,
        tone: i % 3,
      });
    }
    if (activeTier !== "low" && (params.bokehDrops !== false && !params.horizontal)) {
      const bokehCount = Math.max(4, Math.round(11 * density));
      for (let i = 0; i < bokehCount; i++) {
        particles.push({
          kind: "bokeh",
          x: Math.random() * w,
          y: Math.random() * h,
          r: 10 + Math.random() * 20,
          speed: 0.35 + Math.random() * 0.65,
          phase: Math.random() * Math.PI * 2,
          alpha: 0.08 + Math.random() * 0.12,
          tone: i % 2,
        });
      }
    }
  } else if (engine === "mist") {
    const count = Math.max(6, Math.round(18 * density));
    const cScale = params.cloudScale || 1.0;
    for (let i = 0; i < count; i++) {
      const depth = 0.4 + Math.random() * 0.6;
      particles.push({
        x: Math.random() * w,
        y: h * (0.1 + Math.random() * 0.9),
        r: (90 + Math.random() * 155) * depth * cScale,
        vx: (Math.random() - 0.38) * 0.55 * depth * (params.speedMul || 1),
        vy: (params.rising ? -0.35 - Math.random() * 0.45 : -0.1 - Math.random() * 0.2) * depth,
        alpha: 0.06 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
        tone: i % 3,
      });
    }
  } else if (engine === "glyph") {
    const colWidth = activeTier === "low" ? 26 : 20;
    const cols = Math.max(10, Math.floor(w / colWidth));
    const activeCols = Math.max(6, Math.round(cols * Math.min(0.9, 0.3 + density * 0.38)));
    for (let i = 0; i < activeCols; i++) {
      const foreground = i % 3 !== 0;
      particles.push({
        x: ((i * Math.max(1, Math.floor(cols / activeCols)) + Math.floor(Math.random() * 3)) % cols) * colWidth + 4,
        y: params.direction === "up" ? Math.random() * h + h * 0.5 : Math.random() * h - h * 0.5,
        speed: ((foreground ? 3.1 : 1.8) + Math.random() * 3.2) * (params.direction === "up" ? -0.65 : 1),
        len: (foreground ? 7 : 5) + Math.floor(Math.random() * 8),
        seed: Math.floor(Math.random() * 1000),
        foreground,
        tone: i % 2,
      });
    }
  } else if (engine === "snow") {
    const count = Math.max(16, Math.round(56 * density));
    const sizeMul = params.sizeMul || 1;
    const shape = params.shape || "crystal";
    for (let i = 0; i < count; i++) {
      const depth = 0.3 + Math.random() * 0.7;
      const isBokeh = activeTier !== "low" && shape !== "petal" && shape !== "leaf" && i % 6 === 1;
      particles.push({
        kind: isBokeh ? "bokeh" : shape,
        x: Math.random() * w,
        y: Math.random() * h,
        r: (isBokeh ? 8 + Math.random() * 13 : (3.2 + Math.random() * 3.4) * depth) * sizeMul,
        speed: (params.speed ?? 1.0) * (0.65 + Math.random() * 0.9) * (isBokeh ? 0.55 : depth),
        phase: Math.random() * Math.PI * 2,
        sway: (params.sway ?? 0.7) * (0.45 + Math.random() * 0.85) * depth,
        spin: (params.spin ?? 0.025) * (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8),
        angle: Math.random() * Math.PI * 2,
        alpha: isBokeh ? 0.14 + Math.random() * 0.16 : 0.38 + Math.random() * 0.5,
        tone: i % 3,
      });
    }
  } else if (engine === "ember") {
    const count = Math.max(14, Math.round(44 * density));
    const spd = params.speed ?? 1.4;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      particles.push({
        x,
        y,
        px: x,
        py: y + 6,
        r: (params.bubbleMode ? 3.2 : 2.2) + Math.random() * (params.bubbleMode ? 6.5 : 4.2),
        vy: (0.7 + Math.random() * 1.4) * spd,
        vx: (Math.random() - 0.5) * 1.0,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.42 + Math.random() * 0.5,
        tone: i % 3,
      });
    }
  } else if (engine === "stars") {
    const count = Math.max(22, Math.round(72 * density));
    const flareRatio = params.flareRatio ?? 0.15;
    for (let i = 0; i < count; i++) {
      const flare = Math.random() < flareRatio;
      const inBand = params.milkyWay && i % 2 === 0;
      const bandT = Math.random();
      const x = inBand ? bandT * w + (Math.random() - 0.5) * w * 0.22 : Math.random() * w;
      const y = inBand ? (1 - bandT) * h + (Math.random() - 0.5) * h * 0.25 : Math.random() * h;
      particles.push({
        flare,
        x: (x + w) % w,
        y: (y + h) % h,
        vx: params.constellationDist ? (Math.random() - 0.5) * 0.22 : 0,
        vy: params.constellationDist ? (Math.random() - 0.5) * 0.22 : 0,
        r: flare ? 8.5 + Math.random() * 10 : 0.9 + Math.random() * 1.9,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.045,
        alpha: flare ? 0.45 + Math.random() * 0.45 : 0.28 + Math.random() * 0.58,
        tone: i % 3,
      });
    }
  } else if (engine === "orbs") {
    const count = Math.max(10, Math.round(28 * density));
    const sizeScale = params.sizeScale ?? 1.0;
    const tCount = params.trailCount ?? 3;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const trail = [];
      for (let t = 0; t < tCount; t++) trail.push({ x, y });
      particles.push({
        x,
        y,
        trail,
        r: (6.5 + Math.random() * 10) * sizeScale,
        vx: (Math.random() - 0.5) * 0.8,
        vy: params.rising ? -0.55 - Math.random() * 0.85 : (Math.random() - 0.5) * 0.7,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: (params.pulseSpeed ?? 0.03) * (0.75 + Math.random() * 0.5),
        tone: i % 3,
      });
    }
  } else if (engine === "nebula") {
    const cloudCount = Math.max(4, Math.round((params.cloudCount || 9) * Math.min(1.3, density)));
    for (let i = 0; i < cloudCount; i++) {
      particles.push({
        kind: "cloud",
        x: Math.random() * w,
        y: Math.random() * h,
        r: 120 + Math.random() * 185,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.28,
        phase: Math.random() * Math.PI * 2,
        secondary: i % 2 === 1,
        alpha: 0.11 + Math.random() * 0.14,
      });
    }
    const starCount = Math.max(24, Math.round(72 * density));
    for (let i = 0; i < starCount; i++) {
      particles.push({
        kind: "warpstar",
        angle: Math.random() * Math.PI * 2,
        dist: 14 + Math.random() * Math.max(w, h) * 0.62,
        speed: (1.4 + Math.random() * 3.6) * (params.starSpeedMul || 1),
        r: 1.1 + Math.random() * 2.1,
        alpha: 0.4 + Math.random() * 0.55,
        tone: i % 3,
      });
    }
  } else if (engine === "aurora") {
    const moteCount = Math.max(14, Math.round(38 * density));
    for (let i = 0; i < moteCount; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 4.5 + Math.random() * 7.5,
        vy: 0.3 + Math.random() * 0.65,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.35 + Math.random() * 0.5,
        tone: i % 3,
      });
    }
  } else if (engine === "network") {
    const count = Math.max(14, Math.round((params.nodeCount || 36) * Math.min(1.25, density)));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.75,
        vy: (Math.random() - 0.5) * 0.75,
        r: 2.2 + Math.random() * 2.6,
        phase: Math.random() * Math.PI * 2,
        tone: i % 3,
      });
    }
  } else if (engine === "geometry") {
    const shape = params.shape || "shards";
    const count = shape === "dots" || shape === "hex" ? 0 : Math.max(12, Math.round(26 * density));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.55 * (params.speed || 1),
        vy: (-0.25 - Math.random() * 0.45) * (params.speed || 1),
        r: 12 + Math.random() * 22,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.024 * (params.speed || 1),
        sides: shape === "diamonds" ? 4 : shape === "cubes" ? 6 : 3 + (i % 3),
        alpha: 0.22 + Math.random() * 0.38,
        tone: i % 3,
      });
    }
  } else if (engine === "beams") {
    const beamCount = params.beamCount || 8;
    for (let i = 0; i < beamCount; i++) {
      particles.push({
        kind: "beam",
        x: (i + 0.5) * (w / beamCount) + (Math.random() - 0.5) * 60,
        width: 38 + Math.random() * 68,
        angle: (params.style === "pillars" ? 0 : -0.32) + (Math.random() - 0.5) * 0.16,
        phase: Math.random() * Math.PI * 2,
        speed: 0.012 + Math.random() * 0.018,
        tone: i % 3,
      });
    }
    const moteCount = Math.max(12, Math.round(28 * density));
    for (let i = 0; i < moteCount; i++) {
      particles.push({
        kind: "mote",
        x: Math.random() * w,
        y: Math.random() * h,
        r: 3.5 + Math.random() * 6,
        vy: -0.2 - Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2,
        tone: i % 3,
      });
    }
  } else if (engine === "circuit") {
    const count = Math.max(10, Math.round(22 * density * (params.density || 1)));
    const step = 48;
    for (let i = 0; i < count; i++) {
      const gx = Math.floor((Math.random() * w) / step) * step;
      const gy = Math.floor((Math.random() * h) / step) * step;
      const segs = [{ x: gx, y: gy }];
      let cx = gx, cy = gy;
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]];
      let dIdx = i % 4;
      for (let s = 0; s < 4; s++) {
        dIdx = (dIdx + (Math.random() < 0.5 ? 1 : 0)) % dirs.length;
        const len = (1 + Math.floor(Math.random() * 3)) * step;
        cx += dirs[dIdx][0] * len;
        cy += dirs[dIdx][1] * len;
        segs.push({ x: cx, y: cy });
      }
      particles.push({
        segs,
        progress: Math.random(),
        speed: (0.006 + Math.random() * 0.01) * (params.speed || 1),
        tone: i % 3,
      });
    }
  } else if (engine === "tesla") {
    const mode = params.mode || "coil";
    const orbCount = mode === "ball" ? (params.orbs || 5) : Math.max(8, Math.round(18 * density));
    for (let i = 0; i < orbCount; i++) {
      particles.push({
        x: w * (0.1 + Math.random() * 0.8),
        y: h * (0.12 + Math.random() * 0.76),
        vx: (Math.random() - 0.5) * (mode === "ball" ? 1.35 : 0.8),
        vy: mode === "jacobs" ? -(1.4 + Math.random() * 1.2) : (Math.random() - 0.5) * (mode === "ball" ? 1.15 : 0.75),
        r: mode === "ball" ? 18 + Math.random() * 14 : 4 + Math.random() * 6,
        phase: Math.random() * Math.PI * 2,
        progress: i / Math.max(1, orbCount),
        tone: i % 3,
      });
    }
  } else if (engine === "physics") {
    const mode = params.mode || "tokamak";
    if (mode === "lorentz") {
      const trailCount = Math.max(8, Math.round((params.trails || 22) * Math.min(1.3, density)));
      for (let i = 0; i < trailCount; i++) {
        const lx = (Math.random() - 0.5) * 16 + 0.1;
        const ly = (Math.random() - 0.5) * 16 + 0.1;
        const lz = 12 + Math.random() * 24;
        const history = [];
        let cx = lx, cy = ly, cz = lz;
        const dt = 0.0065;
        for (let s = 0; s < 26; s++) {
          const dx = 10 * (cy - cx);
          const dy = cx * (28 - cz) - cy;
          const dz = cx * cy - (8 / 3) * cz;
          cx += dx * dt;
          cy += dy * dt;
          cz += dz * dt;
          history.push({ x: cx, y: cy, z: cz });
        }
        particles.push({ lx: cx, ly: cy, lz: cz, history, tone: i % 3 });
      }
    } else if (mode === "collider") {
      const trackCount = Math.max(12, Math.round(28 * density));
      for (let i = 0; i < trackCount; i++) {
        particles.push({
          angle: (i / trackCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.25,
          curvature: (i % 2 === 0 ? 1 : -1) * (0.012 + Math.random() * 0.026),
          speed: 0.014 + Math.random() * 0.018,
          progress: Math.random(),
          maxR: Math.min(w, h) * (0.24 + Math.random() * 0.24),
          tone: i % 3,
        });
      }
    } else {
      const count = Math.max(14, Math.round(32 * density));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          angle: (i / count) * Math.PI * 2,
          phase: Math.random() * Math.PI * 2,
          speed: 0.015 + Math.random() * 0.025,
          r: 3.5 + Math.random() * 6,
          tone: i % 3,
        });
      }
    }
  } else if (engine === "future2126") {
    const count = Math.max(16, Math.round(36 * density));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 1.1,
        vy: (Math.random() - 0.5) * 1.1,
        angle: (i / count) * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.012 + Math.random() * 0.024,
        r: 3 + Math.random() * 7,
        sides: 5 + (i % 4),
        tone: i % 3,
      });
    }
  }

  return {
    id: opt.id,
    opt,
    engine,
    params,
    particles,
    ripples,
    lightningBolts,
    meteors,
  };
}

function seedAllLayers(layerIds, w, h, scale) {
  const profile = TIER_PROFILES[activeTier] || TIER_PROFILES.medium;
  const multiBalance = layerIds.length > 1 ? 1 / Math.pow(layerIds.length, 0.45) : 1;
  const baseDensity = scale * profile.density * multiBalance;
  const defs = layerIds
    .map((id) => ATMOSPHERE_BY_ID.get(id))
    .filter((opt) => opt && opt.engine !== "none")
    .sort((a, b) => (ENGINE_DEPTH_ORDER[a.engine] || 50) - (ENGINE_DEPTH_ORDER[b.engine] || 50));
  activeLayers = defs.map((opt) => seedSingleLayer(opt, w, h, baseDensity));
}

function applyPointerForce(p, strength = 1.2) {
  if (!pointer.active) return;
  const dx = p.x - pointer.x;
  const dy = p.y - pointer.y;
  const distSq = dx * dx + dy * dy;
  if (distSq > 0 && distSq < 170 * 170) {
    const dist = Math.sqrt(distSq);
    const pull = (1 - dist / 170) * strength;
    p.x += (dx / dist) * pull + pointer.vx * 0.045;
    p.y += (dy / dist) * pull + pointer.vy * 0.045;
  }
}

function drawBokehSprite(ctx, sprite, x, y, r, fallbackRgb, alpha) {
  if (alpha <= 0.005) return;
  if (sprite) {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = prevAlpha;
    return;
  }
  const [cr, cg, cb] = fallbackRgb;
  ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.35})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrystalSnowflake(ctx, x, y, r, angle, rgb, alpha) {
  const [cr, cg, cb] = rgb;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.rotate(Math.PI / 3);
  }
  ctx.restore();
}

function drawBotanicalShape(ctx, kind, x, y, r, angle, rgb, alpha) {
  const [cr, cg, cb] = rgb;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
  ctx.beginPath();
  if (kind === "petal") {
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r * 0.9, -r * 0.5, r * 0.85, r * 0.7, 0, r);
    ctx.bezierCurveTo(-r * 0.85, r * 0.7, -r * 0.9, -r * 0.5, 0, -r);
  } else if (kind === "leaf") {
    ctx.moveTo(0, -r * 1.25);
    ctx.quadraticCurveTo(r * 0.85, 0, 0, r * 1.25);
    ctx.quadraticCurveTo(-r * 0.85, 0, 0, -r * 1.25);
  } else {
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.7, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.7, 0);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

function drawSingleLayer(ctx, layer, w, h, scale, profile) {
  const { engine, params, particles, ripples, lightningBolts, meteors } = layer;
  const { isDark, accent, secondary, tertiary, highlight } = cachedColors;
  const [ar, ag, ab] = accent;
  const [sr, sg, sb] = secondary;
  const [tr, tg, tb] = tertiary;
  const [hr, hg, hb] = highlight;
  const toneRgb = (tone) => (tone === 1 ? secondary : tone === 2 ? tertiary : accent);

  if (engine === "precip") {
    const isCyber = !!params.cyber;
    ctx.lineCap = "round";
    for (const p of particles) {
      if (p.kind === "bokeh") {
        p.phase += 0.015;
        p.y += p.speed;
        p.x += Math.sin(p.phase) * 0.22;
        if (p.y - p.r > h) { p.y = -p.r; p.x = Math.random() * w; }
        const sp = p.tone === 0 ? spriteBank?.orbPrimary : spriteBank?.orbSecondary;
        drawBokehSprite(ctx, sp, p.x, p.y, p.r, p.tone === 0 ? accent : secondary, Math.min(0.42, p.alpha * scale));
        continue;
      }
      if (profile.interactive) applyPointerForce(p, 1.8);
      const [cr, cg, cb] = isCyber
        ? toneRgb(p.tone)
        : params.warm
          ? [255, 200, 115]
          : isDark
            ? [Math.round((ar + 175) / 2), Math.round((ag + 210) / 2), Math.round((ab + 255) / 2)]
            : [65, 115, 180];
      const x2 = params.horizontal ? p.x + p.len : p.x + p.drift * 2.4;
      const y2 = params.horizontal ? p.y : p.y + p.len;
      const alpha = Math.min(0.9, p.alpha * scale);

      const grad = ctx.createLinearGradient(p.x, p.y, x2, y2);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      grad.addColorStop(0.72, `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.72})`);
      grad.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, ${Math.min(1, alpha * 1.15)})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = p.thick;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      p.x += p.drift;
      p.y += p.speed;
      if (params.horizontal) {
        if (p.x + p.len < 0) { p.x = w + p.len; p.y = Math.random() * h; }
        if (p.x - p.len > w) { p.x = -p.len; p.y = Math.random() * h; }
      } else if (p.y > h) {
        const maxRipples = isCyber ? 34 : 22;
        if (params.ripples !== false && activeTier !== "low" && ripples.length < maxRipples && Math.random() < (isCyber ? 0.48 : 0.32)) {
          ripples.push({
            x: x2,
            y: h - 4 - Math.random() * 34,
            rx: 1.5,
            maxRx: (isCyber ? 16 : 10) + Math.random() * 16,
            alpha: (isCyber ? 0.55 : 0.36) * scale * p.depth,
            tone: p.tone,
          });
        }
        p.y = -p.len - Math.random() * 45;
        p.x = Math.random() * (w + 260) - 130;
      }
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      const [cr, cg, cb] = isCyber && rp.tone === 1 ? [sr, sg, sb] : [ar, ag, ab];
      const progress = rp.rx / rp.maxRx;
      const fade = rp.alpha * (1 - progress);
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${fade})`;
      ctx.lineWidth = isCyber ? 1.35 : 1.0;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.rx, rp.rx * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (progress > 0.25) {
        ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${fade * 0.45})`;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rp.rx * 0.58, rp.rx * 0.15, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      rp.rx += isCyber ? 0.8 : 0.52;
      if (rp.rx >= rp.maxRx) ripples.splice(i, 1);
    }
    if (params.lightning && profile.lightning) {
      const rate = params.lightningRate || 0.024;
      if (lightningBolts.length < 2 && Math.random() < rate * scale) {
        const bolt = createLightningBolt(w, h);
        lightningBolts.push(bolt);
        ripples.push({ x: bolt.impactX, y: Math.min(h - 10, bolt.impactY), rx: 4, maxRx: 52, alpha: 0.78 * scale, tone: 1 });
      }
      for (let i = lightningBolts.length - 1; i >= 0; i--) {
        const bolt = lightningBolts[i];
        if (bolt.flash > 0) {
          const flashGrad = ctx.createRadialGradient(bolt.impactX, bolt.impactY * 0.35, 10, bolt.impactX, bolt.impactY * 0.5, w * 0.75);
          flashGrad.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${bolt.flash * scale * 0.36})`);
          flashGrad.addColorStop(0.5, `rgba(${ar}, ${ag}, ${ab}, ${bolt.flash * scale * 0.16})`);
          flashGrad.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, 0)`);
          ctx.fillStyle = flashGrad;
          ctx.fillRect(0, 0, w, h);
        }
        for (const seg of bolt.segments) {
          ctx.strokeStyle = seg.branch
            ? `rgba(${sr}, ${sg}, ${sb}, ${bolt.alpha * 0.35})`
            : `rgba(${ar}, ${ag}, ${ab}, ${bolt.alpha * 0.48})`;
          ctx.lineWidth = seg.branch ? 4.2 : 7.5;
          ctx.beginPath();
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();
        }
        for (const seg of bolt.segments) {
          ctx.strokeStyle = seg.branch
            ? `rgba(${hr}, ${hg}, ${hb}, ${bolt.alpha * 0.78})`
            : `rgba(255, 255, 255, ${bolt.alpha})`;
          ctx.lineWidth = seg.branch ? 1.1 : 2.1;
          ctx.beginPath();
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();
        }
        bolt.alpha -= 0.085;
        bolt.flash = Math.max(0, bolt.flash - 0.045);
        if (bolt.alpha <= 0) lightningBolts.splice(i, 1);
      }
    }
  } else if (engine === "mist") {
    const t = frameTick * 0.012;
    const waveCount = params.waveCount ?? 2;
    for (let layerIdx = 0; layerIdx < waveCount; layerIdx++) {
      const [cr, cg, cb] = toneRgb(layerIdx % 3);
      const baseY = h * (0.54 + layerIdx * 0.14);
      const mistGrad = ctx.createLinearGradient(0, baseY - 110, 0, h);
      mistGrad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      mistGrad.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, ${0.075 * scale})`);
      mistGrad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, ${0.02 * scale})`);
      ctx.fillStyle = mistGrad;
      ctx.beginPath();
      ctx.moveTo(0, h);
      const step = Math.max(40, Math.floor(w / 12));
      for (let x = 0; x <= w + step; x += step) {
        const y = baseY + Math.sin(x * 0.0035 + t + layerIdx * 1.7) * 34 + Math.cos(x * 0.0018 - t * 0.8) * 22;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    for (const p of particles) {
      if (profile.interactive) applyPointerForce(p, 0.9);
      p.phase += 0.01;
      p.x += p.vx + Math.sin(p.phase) * 0.32;
      p.y += p.vy;
      if (p.x - p.r > w) p.x = -p.r;
      if (p.x + p.r < 0) p.x = w + p.r;
      if (p.y + p.r < 0) {
        p.y = h + p.r * 0.6;
        p.x = Math.random() * w;
      }
      const a = Math.min(0.42, p.alpha * 2.4 * scale * (0.82 + 0.18 * Math.sin(p.phase)));
      const sprite = p.tone === 0 ? spriteBank?.cloudPrimary : p.tone === 1 ? spriteBank?.cloudSecondary : spriteBank?.cloudMist;
      drawBokehSprite(ctx, sprite, p.x, p.y, p.r, toneRgb(p.tone), a);
    }
  } else if (engine === "glyph") {
    const glyphs = params.charset || DEFAULT_GLYPHS;
    const isUp = params.direction === "up";
    for (const p of particles) {
      const fontSize = p.foreground ? 13 : 10;
      ctx.font = `600 ${fontSize}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      const [cr, cg, cb] = p.tone === 1 ? [sr, sg, sb] : [ar, ag, ab];
      const streamHeight = p.len * (fontSize + 2);
      if (params.beamGlow !== false && p.foreground && p.y > 0 && p.y - streamHeight < h) {
        const beam = ctx.createLinearGradient(p.x, p.y - streamHeight, p.x, p.y + 8);
        beam.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        beam.addColorStop(0.8, `rgba(${cr}, ${cg}, ${cb}, ${0.08 * scale})`);
        beam.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, ${0.22 * scale})`);
        ctx.fillStyle = beam;
        ctx.fillRect(p.x - 2, p.y - streamHeight, fontSize, streamHeight + 10);
      }
      for (let j = 0; j < p.len; j++) {
        const gy = isUp ? p.y + j * (fontSize + 2) : p.y - j * (fontSize + 2);
        if (gy < -20 || gy > h + 20) continue;
        const idx = Math.abs(p.seed + j * 7 + Math.floor(p.y * 0.16)) % glyphs.length;
        const ch = glyphs[idx] || "0";
        const head = j === 0;
        const ratio = 1 - j / p.len;
        const alpha = ratio * (p.foreground ? 0.55 : 0.28) * scale;
        ctx.fillStyle = head
          ? `rgba(${hr}, ${hg}, ${hb}, ${Math.min(0.95, (p.foreground ? 0.82 : 0.45) * scale)})`
          : `rgba(${cr}, ${cg}, ${cb}, ${Math.min(0.82, alpha)})`;
        ctx.fillText(ch, p.x, gy);
      }
      if (params.beamGlow !== false && p.foreground && spriteBank?.orbPrimary) {
        drawBokehSprite(ctx, spriteBank.orbPrimary, p.x + 4, p.y - 4, 11, accent, 0.28 * scale);
      }
      p.y += p.speed;
      if (!isUp && p.y - streamHeight > h) {
        p.y = -Math.random() * 180;
        p.seed = Math.floor(Math.random() * 1000);
      } else if (isUp && p.y + streamHeight < 0) {
        p.y = h + Math.random() * 180;
        p.seed = Math.floor(Math.random() * 1000);
      }
    }
  } else if (engine === "snow") {
    const snowRgb = isDark ? [236, 245, 255] : [95, 128, 175];
    for (const p of particles) {
      if (profile.interactive) applyPointerForce(p, 1.4);
      p.phase += 0.022;
      p.x += Math.sin(p.phase) * p.sway;
      p.y += p.speed;
      if (p.speed >= 0 && p.y > h + 18) { p.y = -18; p.x = Math.random() * w; }
      if (p.speed < 0 && p.y < -18) { p.y = h + 18; p.x = Math.random() * w; }
      if (p.x > w + 18) p.x = -18;
      if (p.x < -18) p.x = w + 18;
      const twinkle = params.sparkle ? 0.35 + 0.65 * Math.abs(Math.sin(p.phase * 2.5)) : 1;
      const a = Math.min(0.92, p.alpha * twinkle * scale);
      if (p.kind === "bokeh") {
        drawBokehSprite(ctx, spriteBank?.orbSnow, p.x, p.y, p.r, snowRgb, a);
      } else if (p.kind === "crystal") {
        p.angle += p.spin;
        drawCrystalSnowflake(ctx, p.x, p.y, p.r, p.angle, highlight, a);
      } else if (p.kind === "petal" || p.kind === "leaf" || p.kind === "diamond") {
        p.angle += p.spin;
        drawBotanicalShape(ctx, p.kind, p.x, p.y, p.r * 1.4, p.angle, toneRgb(p.tone), a);
      } else {
        drawBokehSprite(ctx, spriteBank?.orbSnow, p.x, p.y, p.r * 1.8, snowRgb, a);
      }
    }
  } else if (engine === "ember") {
    if (params.horizonGlow) {
      const horizon = ctx.createLinearGradient(0, h * 0.72, 0, h);
      horizon.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0)`);
      horizon.addColorStop(1, `rgba(255, 110, 35, ${0.1 * scale})`);
      ctx.fillStyle = horizon;
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
    }
    ctx.lineCap = "round";
    for (const p of particles) {
      p.px = p.x;
      p.py = p.y;
      if (profile.interactive) applyPointerForce(p, 1.6);
      p.phase += 0.065;
      p.x += p.vx + Math.sin(p.phase) * 0.55;
      p.y -= p.vy;
      if (p.y < -16) {
        p.y = h + 14;
        p.x = Math.random() * w;
        p.px = p.x;
        p.py = p.y + 6;
      }
      const flicker = 0.62 + 0.38 * Math.sin(p.phase * 2.1);
      const a = Math.min(0.95, p.alpha * flicker * scale);
      if (params.bubbleMode) {
        const [cr, cg, cb] = toneRgb(p.tone);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${a * 0.75})`;
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${hr}, ${hg}, ${hb}, ${a * 0.55})`;
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.32, p.y - p.r * 0.32, Math.max(0.8, p.r * 0.24), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const tLen = params.trailLen ?? 3.4;
        if (tLen > 0) {
          const dx = p.x - p.px;
          const dy = p.y - p.py;
          ctx.strokeStyle = p.tone === 0
            ? `rgba(${ar}, ${ag}, ${ab}, ${a * 0.55})`
            : `rgba(255, 155, 55, ${a * 0.6})`;
          ctx.lineWidth = Math.max(1, p.r * 0.42);
          ctx.beginPath();
          ctx.moveTo(p.x - dx * tLen, p.y - dy * tLen);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        const sp = p.tone === 0 ? spriteBank?.orbPrimary : spriteBank?.orbWarm;
        drawBokehSprite(ctx, sp, p.x, p.y, p.r * 2.1, [255, 150, 50], a);
      }
    }
  } else if (engine === "stars") {
    if (params.milkyWay) {
      drawBokehSprite(ctx, spriteBank?.cloudPrimary, w * 0.35, h * 0.62, Math.max(w, h) * 0.32, accent, 0.14 * scale);
      drawBokehSprite(ctx, spriteBank?.cloudSecondary, w * 0.68, h * 0.32, Math.max(w, h) * 0.3, secondary, 0.14 * scale);
    }
    const cDist = params.constellationDist || 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.phase += p.speed;
      if (p.vx || p.vy) {
        p.x = (p.x + p.vx + w) % w;
        p.y = (p.y + p.vy + h) % h;
      }
      const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(p.phase));
      const a = Math.min(0.95, p.alpha * twinkle * scale);
      if (cDist > 0 && i % 2 === 0) {
        for (let j = i + 1; j < Math.min(particles.length, i + 10); j++) {
          const q = particles[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < cDist) {
            ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${(1 - d / cDist) * 0.25 * scale})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      if (p.flare) {
        const sp = p.tone === 1 ? spriteBank?.starSecondary : spriteBank?.starPrimary;
        drawBokehSprite(ctx, sp, p.x, p.y, p.r, p.tone === 1 ? secondary : accent, a);
      } else {
        const [cr, cg, cb] = p.tone === 1 ? secondary : p.tone === 2 ? tertiary : highlight;
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const meteorRate = params.meteorRate ?? 0.018;
    if (meteorRate > 0 && meteors.length < 3 && Math.random() < meteorRate * scale) {
      meteors.push({
        x: w * (0.2 + Math.random() * 0.7),
        y: h * (0.04 + Math.random() * 0.32),
        vx: -9 - Math.random() * 6,
        vy: 4.5 + Math.random() * 3.5,
        len: 65 + Math.random() * 55,
        alpha: 0.95,
      });
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      const tailX = m.x - m.vx * (m.len / 12);
      const tailY = m.y - m.vy * (m.len / 12);
      const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0)`);
      grad.addColorStop(0.65, `rgba(${ar}, ${ag}, ${ab}, ${m.alpha * 0.5 * scale})`);
      grad.addColorStop(1, `rgba(255, 255, 255, ${m.alpha * scale})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      drawBokehSprite(ctx, spriteBank?.starPrimary, m.x, m.y, 10, highlight, m.alpha * scale);
      m.x += m.vx;
      m.y += m.vy;
      m.alpha -= 0.032;
      if (m.alpha <= 0 || m.x < -100 || m.y > h + 100) meteors.splice(i, 1);
    }
  } else if (engine === "orbs") {
    for (const p of particles) {
      if (profile.interactive) applyPointerForce(p, 1.3);
      p.phase += p.pulseSpeed;
      if (p.trail.length) {
        p.trail.pop();
        p.trail.unshift({ x: p.x, y: p.y });
      }
      p.x += p.vx + Math.cos(p.phase * 0.7) * 0.42;
      p.y += p.vy + (params.rising ? 0 : Math.sin(p.phase * 0.9) * 0.42);
      if (p.x < -28) p.x = w + 28;
      if (p.x > w + 28) p.x = -28;
      if (p.y < -28) p.y = h + 28;
      if (p.y > h + 28) p.y = -28;
      const pulse = 0.24 + 0.76 * (0.5 + 0.5 * Math.sin(p.phase));
      const a = Math.min(0.92, 0.68 * pulse * scale);
      const sp = p.tone === 0 ? spriteBank?.orbPrimary : p.tone === 1 ? spriteBank?.orbSecondary : spriteBank?.orbTertiary;
      const fallback = toneRgb(p.tone);
      for (let tIdx = 0; tIdx < p.trail.length; tIdx++) {
        const pt = p.trail[tIdx];
        drawBokehSprite(ctx, sp, pt.x, pt.y, p.r * (0.65 - tIdx * 0.12), fallback, a * (0.28 - tIdx * 0.06));
      }
      drawBokehSprite(ctx, sp, p.x, p.y, p.r * 1.45, fallback, a);
    }
  } else if (engine === "nebula") {
    const cx = profile.interactive && pointer.active ? w * 0.5 + (pointer.x - w * 0.5) * 0.24 : w * 0.5;
    const cy = profile.interactive && pointer.active ? h * 0.5 + (pointer.y - h * 0.5) * 0.24 : h * 0.5;
    const maxDist = Math.max(w, h) * 0.72;
    const mode = params.mode || "warp";
    drawBokehSprite(ctx, spriteBank?.cloudPrimary, cx, cy, 190, accent, 0.22 * scale);

    if (layer.id === "black_hole") {
      ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${0.55 * scale})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 38, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const p of particles) {
      if (p.kind === "cloud") {
        p.phase += 0.008;
        p.x += p.vx + Math.cos(p.phase) * 0.28;
        p.y += p.vy + Math.sin(p.phase) * 0.28;
        if (p.x - p.r > w) p.x = -p.r;
        if (p.x + p.r < 0) p.x = w + p.r;
        if (p.y - p.r > h) p.y = -p.r;
        if (p.y + p.r < 0) p.y = h + p.r;
        const a = Math.min(0.45, p.alpha * 2.2 * scale * (0.8 + 0.2 * Math.sin(p.phase)));
        const sp = p.secondary ? spriteBank?.cloudSecondary : spriteBank?.cloudPrimary;
        drawBokehSprite(ctx, sp, p.x, p.y, p.r, p.secondary ? secondary : accent, a);
      } else if (mode === "orbit") {
        const spin = params.spinSpeed || 0.018;
        const prevAngle = p.angle;
        p.angle += spin * (140 / Math.max(45, p.dist));
        const tilt = 0.52;
        const x1 = cx + Math.cos(prevAngle) * p.dist;
        const y1 = cy + Math.sin(prevAngle) * p.dist * tilt;
        const x2 = cx + Math.cos(p.angle) * p.dist;
        const y2 = cy + Math.sin(p.angle) * p.dist * tilt;
        const [cr, cg, cb] = toneRgb(p.tone);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${Math.min(0.9, p.alpha * scale)})`;
        ctx.lineWidth = p.r;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else {
        const prevDist = p.dist;
        const step = p.speed * (0.55 + p.dist / 210);
        p.dist += step;
        const streakLen = step * 2.8 + p.r * 3;
        const x1 = cx + Math.cos(p.angle) * Math.max(4, prevDist - streakLen);
        const y1 = cy + Math.sin(p.angle) * Math.max(4, prevDist - streakLen);
        const x2 = cx + Math.cos(p.angle) * p.dist;
        const y2 = cy + Math.sin(p.angle) * p.dist;
        const [cr, cg, cb] = toneRgb(p.tone);
        const a = Math.min(0.95, p.alpha * scale * Math.min(1, p.dist / 85));
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        grad.addColorStop(0.7, `rgba(${cr}, ${cg}, ${cb}, ${a * 0.7})`);
        grad.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, ${a})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.r;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (p.dist > maxDist) {
          p.dist = 6 + Math.random() * 42;
          p.angle = Math.random() * Math.PI * 2;
        }
      }
    }
  } else if (engine === "aurora") {
    const ribbons = Math.min(params.ribbons || profile.ribbons || 4, (profile.ribbons || 4) + 1);
    const t = frameTick * 0.016;
    const stepX = Math.max(28, Math.floor(w / 16));
    for (let r = 0; r < ribbons; r++) {
      const baseY = h * (0.2 + r * 0.12);
      const curtainHeight = h * ((params.curtainHeight || 0.25) + (r % 2) * 0.05);
      const amp = 24 + r * 9;
      const [cr, cg, cb] = params.warm ? [255, 145, 55] : toneRgb(r % 3);
      const [cr2, cg2, cb2] = toneRgb((r + 1) % 3);
      const a = Math.min(0.36, (0.22 - r * 0.022) * scale);

      const curtainGrad = ctx.createLinearGradient(0, baseY - curtainHeight * 0.65, 0, baseY + curtainHeight * 0.55);
      curtainGrad.addColorStop(0, `rgba(${cr2}, ${cg2}, ${cb2}, 0)`);
      curtainGrad.addColorStop(0.38, `rgba(${cr2}, ${cg2}, ${cb2}, ${a * 0.45})`);
      curtainGrad.addColorStop(0.76, `rgba(${cr}, ${cg}, ${cb}, ${a})`);
      curtainGrad.addColorStop(0.9, `rgba(${hr}, ${hg}, ${hb}, ${a * 0.65})`);
      curtainGrad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);

      const lowerPts = [];
      const upperPts = [];
      for (let x = 0; x <= w + stepX; x += stepX) {
        const pointerLift = profile.interactive && pointer.active
          ? Math.exp(-Math.pow((x - pointer.x) / 220, 2)) * ((pointer.y - h * 0.45) * 0.18)
          : 0;
        const wave = Math.sin(x * 0.0042 + t + r * 1.35) * amp
          + Math.cos(x * 0.0021 - t * 0.75 + r) * (amp * 0.62)
          + pointerLift;
        const ly = baseY + wave;
        const uy = ly - curtainHeight * (0.72 + 0.28 * Math.sin(x * 0.003 - t * 0.5 + r));
        lowerPts.push({ x, y: ly });
        upperPts.push({ x, y: uy });
      }

      ctx.fillStyle = curtainGrad;
      ctx.beginPath();
      ctx.moveTo(upperPts[0].x, upperPts[0].y);
      for (let i = 1; i < upperPts.length; i++) ctx.lineTo(upperPts[i].x, upperPts[i].y);
      for (let i = lowerPts.length - 1; i >= 0; i--) ctx.lineTo(lowerPts[i].x, lowerPts[i].y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${a * 0.55})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(lowerPts[0].x, lowerPts[0].y);
      for (let i = 1; i < lowerPts.length; i++) ctx.lineTo(lowerPts[i].x, lowerPts[i].y);
      ctx.stroke();
    }
    for (const p of particles) {
      if (profile.interactive) applyPointerForce(p, 1.2);
      p.phase += 0.032;
      p.x += Math.sin(p.phase) * 0.45;
      p.y -= p.vy;
      if (p.y < -16) { p.y = h + 16; p.x = Math.random() * w; }
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.phase));
      const a = Math.min(0.92, p.alpha * twinkle * scale);
      const sp = p.tone === 0 ? spriteBank?.starPrimary : p.tone === 1 ? spriteBank?.starSecondary : spriteBank?.orbTertiary;
      drawBokehSprite(ctx, sp, p.x, p.y, p.r, toneRgb(p.tone), a);
    }
  } else if (engine === "grid") {
    const horizonY = h * 0.56;
    const vx = profile.interactive && pointer.active ? w * 0.5 + (pointer.x - w * 0.5) * 0.18 : w * 0.5;
    if (params.sun) {
      const sunR = Math.min(w, h) * 0.14;
      const sunGrad = ctx.createLinearGradient(vx, horizonY - sunR * 1.8, vx, horizonY);
      sunGrad.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, ${0.52 * scale})`);
      sunGrad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, ${0.12 * scale})`);
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(vx, horizonY - sunR * 0.55, sunR, Math.PI, 0);
      ctx.fill();
    }
    ctx.lineWidth = 1.1;
    const rayCount = 16;
    for (let i = -rayCount; i <= rayCount; i++) {
      const ratio = i / rayCount;
      ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${(1 - Math.abs(ratio) * 0.65) * 0.32 * scale})`;
      ctx.beginPath();
      ctx.moveTo(vx + ratio * w * 0.12, horizonY);
      ctx.lineTo(vx + ratio * w * 1.45, h);
      ctx.stroke();
      if (params.ceiling) {
        ctx.beginPath();
        ctx.moveTo(vx + ratio * w * 0.12, h - horizonY);
        ctx.lineTo(vx + ratio * w * 1.45, 0);
        ctx.stroke();
      }
    }
    const offset = ((frameTick * 0.022 * (params.speed || 1)) % 1);
    for (let r = 0; r < 10; r++) {
      const p = Math.pow((r + offset) / 10, 2.1);
      const y = horizonY + p * (h - horizonY);
      ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${p * 0.42 * scale})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (engine === "network") {
    const linkDist = params.linkDist || 140;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (profile.interactive) applyPointerForce(p, 1.3);
      p.phase += 0.03;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < linkDist) {
          const linkAlpha = (1 - d / linkDist) * 0.38 * scale;
          ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${linkAlpha})`;
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
          if (params.pulses && (i + j) % 5 === 0) {
            const pulseT = ((frameTick * 0.018 + i * 0.2) % 1);
            const px = p.x + dx * pulseT;
            const py = p.y + dy * pulseT;
            drawBokehSprite(ctx, spriteBank?.orbSecondary, px, py, 5.5, secondary, linkAlpha * 1.8);
          }
        }
      }
      const sp = p.tone === 0 ? spriteBank?.orbPrimary : spriteBank?.orbSecondary;
      drawBokehSprite(ctx, sp, p.x, p.y, p.r * 3.2, toneRgb(p.tone), 0.65 * scale);
    }
  } else if (engine === "waves") {
    const waveCount = params.waveCount || 5;
    const amp = params.amp || 24;
    const t = frameTick * (params.speed || 0.018);
    const stepX = Math.max(24, Math.floor(w / 24));
    for (let i = 0; i < waveCount; i++) {
      const baseY = h * (0.32 + (i / waveCount) * 0.55);
      const [cr, cg, cb] = toneRgb(i % 3);
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${(0.22 + (i / waveCount) * 0.25) * scale})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w + stepX; x += stepX) {
        const y = baseY + Math.sin(x * 0.0045 + t + i * 0.9) * amp + Math.cos(x * 0.002 - t * 1.2 + i) * (amp * 0.5);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        if (params.sparkles && x % (stepX * 4) === 0 && (i + frameTick) % 2 === 0) {
          drawBokehSprite(ctx, spriteBank?.orbPrimary, x, y, 5, highlight, 0.32 * scale);
        }
      }
      ctx.stroke();
    }
  } else if (engine === "geometry") {
    const shape = params.shape || "shards";
    const t = frameTick * 0.015 * (params.speed || 1);
    if (shape === "dots" || shape === "hex") {
      const spacing = shape === "hex" ? 64 : 48;
      for (let x = spacing / 2; x < w; x += spacing) {
        for (let y = spacing / 2; y < h; y += spacing) {
          const wave = 0.5 + 0.5 * Math.sin(x * 0.006 + y * 0.006 - t * 2);
          const a = (0.08 + wave * 0.28) * scale;
          if (shape === "dots") {
            ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${a})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.5 + wave * 1.6, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${a * 0.75})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let s = 0; s < 6; s++) {
              const ang = (s * Math.PI) / 3;
              const hx = x + Math.cos(ang) * (spacing * 0.38);
              const hy = y + Math.sin(ang) * (spacing * 0.38);
              if (s === 0) ctx.moveTo(hx, hy);
              else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
    } else if (shape === "mandala") {
      const cx = w * 0.5, cy = h * 0.5;
      for (let r = 1; r <= 5; r++) {
        const rad = r * Math.min(w, h) * 0.075;
        const petals = 8 + r * 4;
        const [cr, cg, cb] = toneRgb(r % 3);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * (r % 2 === 0 ? 0.4 : -0.4));
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.28 * scale})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let p = 0; p <= petals; p++) {
          const ang = (p / petals) * Math.PI * 2;
          const pr = rad * (0.78 + 0.22 * Math.cos(ang * (petals / 2)));
          const px = Math.cos(ang) * pr;
          const py = Math.sin(ang) * pr;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    } else {
      for (const p of particles) {
        if (profile.interactive) applyPointerForce(p, 1.2);
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        if (p.y + p.r < 0) { p.y = h + p.r; p.x = Math.random() * w; }
        if (p.x - p.r > w) p.x = -p.r;
        if (p.x + p.r < 0) p.x = w + p.r;
        const [cr, cg, cb] = toneRgb(p.tone);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${p.alpha * scale})`;
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${p.alpha * 0.18 * scale})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let s = 0; s < p.sides; s++) {
          const ang = (s / p.sides) * Math.PI * 2;
          const vx = Math.cos(ang) * p.r;
          const vy = Math.sin(ang) * p.r;
          if (s === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  } else if (engine === "beams") {
    for (const p of particles) {
      if (p.kind === "beam") {
        p.phase += p.speed;
        const swayX = p.x + Math.sin(p.phase) * 55;
        const [cr, cg, cb] = toneRgb(p.tone);
        const a = (0.09 + 0.06 * Math.sin(p.phase)) * scale;
        ctx.save();
        ctx.translate(swayX, 0);
        ctx.rotate(p.angle + Math.sin(p.phase * 0.7) * 0.05);
        const g = ctx.createLinearGradient(0, 0, 0, h * 1.25);
        g.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${a * 1.4})`);
        g.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${a})`);
        g.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(-p.width / 2, -40, p.width, h * 1.35);
        ctx.restore();
      } else {
        p.phase += 0.025;
        p.y += p.vy;
        p.x += Math.sin(p.phase) * 0.35;
        if (p.y < -12) { p.y = h + 12; p.x = Math.random() * w; }
        drawBokehSprite(ctx, spriteBank?.orbPrimary, p.x, p.y, p.r, highlight, 0.38 * scale);
      }
    }
  } else if (engine === "dna") {
    const strands = params.strands || 2;
    const t = frameTick * (params.speed || 0.025);
    const cy = h * 0.5;
    const amp = Math.min(h * 0.22, 130);
    const nodes = 28;
    for (let i = 0; i < nodes; i++) {
      const x = (i / (nodes - 1)) * w;
      const basePhase = i * 0.34 - t;
      const pts = [];
      for (let s = 0; s < strands; s++) {
        const ang = basePhase + (s * Math.PI * 2) / strands;
        const y = cy + Math.sin(ang) * amp;
        const z = Math.cos(ang);
        pts.push({ x, y, z, tone: s % 3 });
      }
      if (params.rungs && pts.length >= 2) {
        ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.24 * scale})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
      }
      for (const pt of pts) {
        const r = 5.5 + (pt.z + 1) * 3.5;
        const sp = pt.tone === 0 ? spriteBank?.orbPrimary : pt.tone === 1 ? spriteBank?.orbSecondary : spriteBank?.orbTertiary;
        drawBokehSprite(ctx, sp, pt.x, pt.y, r, toneRgb(pt.tone), (0.35 + (pt.z + 1) * 0.25) * scale);
      }
    }
  } else if (engine === "circuit") {
    for (const p of particles) {
      const [cr, cg, cb] = toneRgb(p.tone);
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.22 * scale})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < p.segs.length; i++) {
        const pt = p.segs[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      p.progress = (p.progress + p.speed) % 1;
      const totalSegs = p.segs.length - 1;
      const exact = p.progress * totalSegs;
      const idx = Math.min(totalSegs - 1, Math.floor(exact));
      const frac = exact - idx;
      const a = p.segs[idx], b = p.segs[idx + 1];
      const px = a.x + (b.x - a.x) * frac;
      const py = a.y + (b.y - a.y) * frac;
      drawBokehSprite(ctx, spriteBank?.orbPrimary, px, py, 7.5, highlight, 0.78 * scale);
    }
  } else if (engine === "radar") {
    const cx = w * 0.5, cy = h * 0.5;
    const rings = params.rings || 5;
    const maxR = Math.min(w, h) * 0.42;
    const t = frameTick * (params.speed || 0.012);
    for (let r = 1; r <= rings; r++) {
      const rad = (r / rings) * maxR;
      const [cr, cg, cb] = toneRgb(r % 3);
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.26 * scale})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
      if (params.planets) {
        const ang = t * (rings - r + 1) * 0.45 + r * 1.3;
        const px = cx + Math.cos(ang) * rad;
        const py = cy + Math.sin(ang) * rad;
        drawBokehSprite(ctx, spriteBank?.starPrimary, px, py, 8 + (r % 3) * 2.5, highlight, 0.82 * scale);
      }
    }
    if (params.sweep) {
      const sweepAng = t * 2.2;
      ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${0.55 * scale})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAng) * maxR, cy + Math.sin(sweepAng) * maxR);
      ctx.stroke();
    }
  } else if (engine === "portal") {
    const cx = profile.interactive && pointer.active ? w * 0.5 + (pointer.x - w * 0.5) * 0.22 : w * 0.5;
    const cy = profile.interactive && pointer.active ? h * 0.5 + (pointer.y - h * 0.5) * 0.22 : h * 0.5;
    const rings = params.rings || 8;
    const maxR = Math.min(w, h) * 0.45;
    const t = (frameTick * 0.012 * (params.speed || 1)) % 1;
    for (let r = 0; r < rings; r++) {
      const prog = (r / rings + t) % 1;
      const rad = prog * maxR;
      const [cr, cg, cb] = toneRgb(r % 3);
      const a = Math.sin(prog * Math.PI) * 0.45 * scale;
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${a})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (engine === "tesla") {
    const mode = params.mode || "coil";
    const t = frameTick * 0.04;
    const drawPlasmaArc = (x1, y1, x2, y2, jitterAmp, tone, branchDepth = 1) => {
      const dx = x2 - x1, dy = y2 - y1;
      const dist = Math.hypot(dx, dy) || 1;
      const steps = Math.max(6, Math.min(20, Math.floor(dist / 24)));
      const nx = -dy / dist, ny = dx / dist;
      const pts = [{ x: x1, y: y1 }];
      for (let s = 1; s < steps; s++) {
        const u = s / steps;
        const env = Math.sin(u * Math.PI);
        const wave = Math.sin(u * 12 + t * 2.3 + s * 1.7) * 0.55 + (Math.random() - 0.5) * 0.95;
        const offset = wave * jitterAmp * env;
        pts.push({
          x: x1 + dx * u + nx * offset,
          y: y1 + dy * u + ny * offset,
        });
      }
      pts.push({ x: x2, y: y2 });
      const [cr, cg, cb] = toneRgb(tone);
      // Outer ionized violet/accent plasma sheath
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.26 * scale})`;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      // Mid corona filament
      ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${0.58 * scale})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      // White-hot core channel
      ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${0.92 * scale})`;
      ctx.lineWidth = 1.0;
      ctx.stroke();

      if (branchDepth > 0 && steps >= 8) {
        const bIdx = Math.floor(steps * (0.35 + (frameTick % 5) * 0.08));
        const bp = pts[bIdx];
        if (bp) {
          const bAng = Math.atan2(dy, dx) + (tone % 2 === 0 ? 0.65 : -0.65);
          const bLen = dist * 0.34;
          drawPlasmaArc(bp.x, bp.y, bp.x + Math.cos(bAng) * bLen, bp.y + Math.sin(bAng) * bLen, jitterAmp * 0.55, (tone + 1) % 3, branchDepth - 1);
        }
      }
    };

    if (mode === "globe") {
      const cx = w * 0.5, cy = h * 0.5;
      const globeR = Math.min(w, h) * 0.41;
      // Outer dielectric glass sphere rim
      ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.32 * scale})`;
      ctx.lineWidth = params.reactor ? 3.2 : 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, globeR, 0, Math.PI * 2);
      ctx.stroke();
      if (params.reactor) {
        ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${0.42 * scale})`;
        ctx.lineWidth = 6;
        for (let seg = 0; seg < 10; seg++) {
          const a0 = (seg / 10) * Math.PI * 2 + t * 0.08;
          ctx.beginPath();
          ctx.arc(cx, cy, globeR * 0.86, a0, a0 + 0.38);
          ctx.stroke();
        }
      }
      drawBokehSprite(ctx, spriteBank?.orbPrimary, cx, cy, 42, accent, 0.78 * scale);
      const tendrils = params.tendrils || 12;
      for (let i = 0; i < tendrils; i++) {
        const ang = (i / tendrils) * Math.PI * 2 + Math.sin(t * 0.3 + i) * 0.25 + t * 0.06;
        let tx = cx + Math.cos(ang) * globeR;
        let ty = cy + Math.sin(ang) * globeR;
        if (profile.interactive && pointer.active && i < 3) {
          const pdx = pointer.x - cx, pdy = pointer.y - cy;
          const pDist = Math.min(globeR, Math.hypot(pdx, pdy) || 1);
          const pAng = Math.atan2(pdy, pdx) + (i - 1) * 0.06;
          tx = cx + Math.cos(pAng) * pDist;
          ty = cy + Math.sin(pAng) * pDist;
        }
        drawPlasmaArc(cx, cy, tx, ty, 24, i % 3, 1);
        drawBokehSprite(ctx, spriteBank?.orbSecondary, tx, ty, 13, secondary, 0.75 * scale);
      }
    } else if (mode === "jacobs") {
      const cx = w * 0.5;
      const botY = h * 0.9, topY = h * 0.08;
      // V-shaped copper/rod electrodes
      ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.38 * scale})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 28, botY);
      ctx.lineTo(cx - w * 0.24, topY);
      ctx.moveTo(cx + 28, botY);
      ctx.lineTo(cx + w * 0.24, topY);
      ctx.stroke();
      const arcCount = params.arcs || 3;
      for (let i = 0; i < arcCount; i++) {
        const prog = ((frameTick * 0.0065 + i / arcCount) % 1);
        const y = botY - prog * (botY - topY);
        const halfSpan = 28 + prog * (w * 0.24 - 28);
        const bow = Math.sin(prog * Math.PI) * 38;
        drawPlasmaArc(cx - halfSpan, y, cx, y - bow, 16, i % 3, 0);
        drawPlasmaArc(cx, y - bow, cx + halfSpan, y, 16, (i + 1) % 3, 0);
        drawBokehSprite(ctx, spriteBank?.orbPrimary, cx - halfSpan, y, 11, highlight, 0.7 * scale);
        drawBokehSprite(ctx, spriteBank?.orbPrimary, cx + halfSpan, y, 11, highlight, 0.7 * scale);
      }
    } else if (mode === "ball") {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (profile.interactive) applyPointerForce(p, -0.9);
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 40 || p.x > w - 40) p.vx *= -1;
        if (p.y < 40 || p.y > h - 40) p.vy *= -1;
        drawBokehSprite(ctx, i % 2 === 0 ? spriteBank?.orbPrimary : spriteBank?.orbSecondary, p.x, p.y, p.r * 1.9, toneRgb(p.tone), 0.75 * scale);
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          if (Math.hypot(q.x - p.x, q.y - p.y) < Math.min(w, h) * 0.42) {
            drawPlasmaArc(p.x, p.y, q.x, q.y, 18, (i + j) % 3, 1);
          }
        }
        if (profile.interactive && pointer.active && i < 2) {
          drawPlasmaArc(p.x, p.y, pointer.x, pointer.y, 22, i % 3, 1);
        }
      }
    } else if (mode === "cage") {
      const spacing = 78;
      ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.15 * scale})`;
      ctx.lineWidth = 1;
      for (let x = spacing / 2; x < w; x += spacing) {
        for (let y = spacing / 2; y < h; y += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      const arcs = params.arcs || 5;
      for (let i = 0; i < arcs; i++) {
        const x1 = ((i * 211 + frameTick * 3) % w);
        const y1 = ((i * 149 + frameTick * 2) % h);
        const ang = t * 0.4 + i * 1.7;
        const span = 120 + (i % 3) * 55;
        drawPlasmaArc(x1, y1, x1 + Math.cos(ang) * span, y1 + Math.sin(ang) * span, 20, i % 3, 1);
      }
    } else {
      // Default "coil" mode: Tesla Coil Plasma Arcs & Wardenclyffe Magnifying Transmitter
      const coilCount = params.coils || 2;
      const arcCount = params.arcs || 7;
      for (let c = 0; c < coilCount; c++) {
        const cx = w * ((c + 1) / (coilCount + 1));
        const cy = h * (c % 2 === 0 ? 0.28 : 0.72);
        // Toroid terminal rings
        ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.48 * scale})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.stroke();
        drawBokehSprite(ctx, spriteBank?.orbPrimary, cx, cy, 34, accent, 0.82 * scale);

        const perCoil = Math.max(3, Math.ceil(arcCount / coilCount));
        for (let a = 0; a < perCoil; a++) {
          const ang = (a / perCoil) * Math.PI * 2 + t * 0.14 * (c % 2 === 0 ? 1 : -1) + Math.sin(t * 0.5 + a) * 0.35;
          const reach = Math.min(w, h) * (params.mega ? 0.46 : 0.34) * (0.7 + 0.3 * Math.sin(t * 0.9 + a * 2.1));
          let tx = cx + Math.cos(ang) * reach;
          let ty = cy + Math.sin(ang) * reach;
          if (profile.interactive && pointer.active && a === 0) {
            tx = pointer.x;
            ty = pointer.y;
          }
          drawPlasmaArc(cx, cy, tx, ty, params.mega ? 34 : 24, (c + a) % 3, 1);
          drawBokehSprite(ctx, spriteBank?.starPrimary, tx, ty, 12, highlight, 0.72 * scale);
        }
      }
      // Inter-coil resonance arc
      if (coilCount >= 2) {
        drawPlasmaArc(w / (coilCount + 1), h * 0.28, (w * 2) / (coilCount + 1), h * 0.72, 32, 1, 1);
      }
    }
  } else if (engine === "physics") {
    const mode = params.mode || "tokamak";
    const t = frameTick * 0.025;
    const cx = w * 0.5, cy = h * 0.5;

    if (mode === "tokamak") {
      const R = Math.min(w, h) * 0.27;
      const rMinor = Math.min(w, h) * 0.11;
      const lines = 14;
      for (let l = 0; l < lines; l++) {
        const [cr, cg, cb] = toneRgb(l % 3);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.34 * scale})`;
        ctx.lineWidth = params.cryo ? 1.8 : 1.4;
        ctx.beginPath();
        const steps = 64;
        for (let s = 0; s <= steps; s++) {
          const phi = (s / steps) * Math.PI * 2;
          const theta = phi * 3 + (l / lines) * Math.PI * 2 + t;
          const rad = R + rMinor * Math.cos(theta);
          const x = cx + rad * Math.cos(phi);
          const y = cy + rad * Math.sin(phi) * 0.62 + rMinor * Math.sin(theta) * 0.48;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (const p of particles) {
        p.angle += p.speed;
        const phi = p.angle;
        const theta = phi * 3 + p.phase + t * 1.5;
        const rad = R + rMinor * Math.cos(theta);
        const px = cx + rad * Math.cos(phi);
        const py = cy + rad * Math.sin(phi) * 0.62 + rMinor * Math.sin(theta) * 0.48;
        drawBokehSprite(ctx, spriteBank?.orbPrimary, px, py, p.r * 1.8, toneRgb(p.tone), 0.78 * scale);
      }
    } else if (mode === "lorentz") {
      const scaleXY = Math.min(w, h) * 0.0145;
      const dt = 0.0055;
      for (const p of particles) {
        const dx = 10 * (p.ly - p.lx);
        const dy = p.lx * (28 - p.lz) - p.ly;
        const dz = p.lx * p.ly - (8 / 3) * p.lz;
        p.lx += dx * dt;
        p.ly += dy * dt;
        p.lz += dz * dt;
        p.history.push({ x: p.lx, y: p.ly, z: p.lz });
        if (p.history.length > 28) p.history.shift();
        const [cr, cg, cb] = toneRgb(p.tone);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.48 * scale})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < p.history.length; i++) {
          const pt = p.history[i];
          const sx = cx + pt.x * scaleXY * 1.35;
          const sy = cy + (pt.z - 25) * scaleXY * 1.1;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        const head = p.history[p.history.length - 1];
        if (head) {
          drawBokehSprite(ctx, spriteBank?.orbPrimary, cx + head.x * scaleXY * 1.35, cy + (head.z - 25) * scaleXY * 1.1, 8, highlight, 0.85 * scale);
        }
      }
    } else if (mode === "collider") {
      // Detector calorimeter rings & beamline
      ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.18 * scale})`;
      ctx.lineWidth = 1;
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * 0.13 * r, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawBokehSprite(ctx, spriteBank?.starPrimary, cx, cy, 26, highlight, 0.85 * scale);
      for (const p of particles) {
        p.progress = (p.progress + p.speed) % 1;
        const [cr, cg, cb] = toneRgb(p.tone);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${(1 - p.progress * 0.5) * 0.62 * scale})`;
        ctx.lineWidth = params.qcd ? 2.2 : 1.5;
        ctx.beginPath();
        const steps = 28;
        let tipX = cx, tipY = cy;
        for (let s = 0; s <= steps; s++) {
          const u = (s / steps) * p.progress;
          const rad = u * p.maxR;
          const ang = p.angle + u * u * p.curvature * 55;
          tipX = cx + Math.cos(ang) * rad;
          tipY = cy + Math.sin(ang) * rad;
          if (s === 0) ctx.moveTo(tipX, tipY);
          else ctx.lineTo(tipX, tipY);
        }
        ctx.stroke();
        drawBokehSprite(ctx, spriteBank?.orbSecondary, tipX, tipY, 7, highlight, 0.78 * scale);
      }
    } else if (mode === "cherenkov") {
      const hexR = 68;
      for (let row = -2; row <= 2; row++) {
        for (let col = -3; col <= 3; col++) {
          const hx = cx + col * hexR * 1.5 + (row % 2) * hexR * 0.75;
          const hy = cy + row * hexR * 1.3;
          const pulse = 0.55 + 0.45 * Math.sin(t * 2 + row * 0.8 + col * 0.6);
          drawBokehSprite(ctx, spriteBank?.orbPrimary, hx, hy, 38 * pulse, accent, 0.42 * scale);
          ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${0.32 * pulse * scale})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(hx, hy, 18 + pulse * 14, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if (mode === "ferrofluid") {
      const cols = 11, rows = 7;
      const stepX = w / (cols + 1), stepY = h / (rows + 1);
      const mx = profile.interactive && pointer.active ? pointer.x : cx + Math.cos(t) * w * 0.22;
      const my = profile.interactive && pointer.active ? pointer.y : cy + Math.sin(t) * h * 0.22;
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const bx = c * stepX, by = r * stepY;
          const dx = mx - bx, dy = my - by;
          const dist = Math.hypot(dx, dy) || 1;
          const pull = Math.max(0.2, 1 - dist / (Math.max(w, h) * 0.55));
          const spikeLen = 12 + pull * 36;
          const ang = Math.atan2(dy, dx);
          const tipX = bx + Math.cos(ang) * spikeLen;
          const tipY = by + Math.sin(ang) * spikeLen;
          const perpX = -Math.sin(ang) * (4 + pull * 6);
          const perpY = Math.cos(ang) * (4 + pull * 6);
          const [cr, cg, cb] = toneRgb((r + c) % 3);
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${(0.22 + pull * 0.45) * scale})`;
          ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${(0.35 + pull * 0.5) * scale})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(bx + perpX, by + perpY);
          ctx.lineTo(tipX, tipY);
          ctx.lineTo(bx - perpX, by - perpY);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    } else if (mode === "lissajous") {
      const curves = params.curves || 2;
      const rx = Math.min(w, h) * 0.34, ry = Math.min(w, h) * 0.3;
      for (let c = 0; c < curves; c++) {
        const [cr, cg, cb] = toneRgb(c % 3);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.52 * scale})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        const freqX = 3 + c, freqY = 2 + c;
        const delta = t * (0.7 + c * 0.25);
        const steps = 140;
        for (let s = 0; s <= steps; s++) {
          const u = (s / steps) * Math.PI * 2;
          const x = cx + Math.sin(freqX * u + delta) * rx;
          const y = cy + Math.sin(freqY * u) * ry;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        const headU = (t * 1.4) % (Math.PI * 2);
        drawBokehSprite(ctx, spriteBank?.orbPrimary, cx + Math.sin(freqX * headU + delta) * rx, cy + Math.sin(freqY * headU) * ry, 10, highlight, 0.85 * scale);
      }
    } else if (mode === "gravwave") {
      // Spacetime quadrupolar strain grid + orthogonal interferometer arms
      const step = 56;
      ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.24 * scale})`;
      ctx.lineWidth = 1;
      for (let y = step; y < h; y += step) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 28) {
          const dist = Math.hypot(x - cx, y - cy);
          const strain = Math.sin(dist * 0.035 - t * 2.4) * (params.warpBubble ? 16 : 9);
          const wy = y + strain * Math.cos(Math.atan2(y - cy, x - cx) * 2);
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
      // LIGO orthogonal laser beams
      ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${0.58 * scale})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, h);
      ctx.stroke();
    } else if (mode === "hawking") {
      const rShadow = Math.min(w, h) * 0.11;
      // Relativistic accretion disk ellipses
      for (let d = 1; d <= 5; d++) {
        const [cr, cg, cb] = toneRgb(d % 3);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${(0.62 - d * 0.08) * scale})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rShadow * (1.35 + d * 0.38), rShadow * (0.35 + d * 0.1), -0.22, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Photon sphere ring
      ctx.strokeStyle = `rgba(${hr}, ${hg}, ${hb}, ${0.88 * scale})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(cx, cy, rShadow, 0, Math.PI * 2);
      ctx.stroke();
      // Hawking quantum pair radiation escaping horizon
      for (const p of particles) {
        p.phase += p.speed;
        const rad = rShadow + ((p.phase * 45) % (Math.min(w, h) * 0.32));
        const px = cx + Math.cos(p.angle + t * 0.3) * rad;
        const py = cy + Math.sin(p.angle + t * 0.3) * rad;
        drawBokehSprite(ctx, spriteBank?.orbPrimary, px, py, 6.5, highlight, 0.75 * scale);
      }
    }
  } else if (engine === "future2126") {
    const mode = params.mode || "tesseract";
    const t = frameTick * 0.024;
    const cx = w * 0.5, cy = h * 0.5;
    const mx = profile.interactive && pointer.active ? pointer.x : cx;
    const my = profile.interactive && pointer.active ? pointer.y : cy;

    if (mode === "tesseract") {
      // 16-vertex, 32-edge 4D Hypercube rotated across XW, YW, ZW and XY planes with stereographic projection
      const size = Math.min(w, h) * 0.22;
      const tiltX = ((mx - cx) / Math.max(1, w)) * 1.2;
      const tiltY = ((my - cy) / Math.max(1, h)) * 1.2;
      const aXW = t * 0.9 + tiltX;
      const aYW = t * 0.65 + tiltY;
      const aZW = t * 0.45;
      const aXY = t * 0.35;
      const verts2D = [];
      for (let i = 0; i < 16; i++) {
        let x = (i & 1) ? 1 : -1;
        let y = (i & 2) ? 1 : -1;
        let z = (i & 4) ? 1 : -1;
        let w4 = (i & 8) ? 1 : -1;
        // XW rotation
        let nx = x * Math.cos(aXW) - w4 * Math.sin(aXW);
        let nw = x * Math.sin(aXW) + w4 * Math.cos(aXW);
        x = nx; w4 = nw;
        // YW rotation
        let ny = y * Math.cos(aYW) - w4 * Math.sin(aYW);
        nw = y * Math.sin(aYW) + w4 * Math.cos(aYW);
        y = ny; w4 = nw;
        // ZW rotation
        let nz = z * Math.cos(aZW) - w4 * Math.sin(aZW);
        nw = z * Math.sin(aZW) + w4 * Math.cos(aZW);
        z = nz; w4 = nw;
        // XY rotation
        nx = x * Math.cos(aXY) - y * Math.sin(aXY);
        ny = x * Math.sin(aXY) + y * Math.cos(aXY);
        x = nx; y = ny;
        // 4D -> 3D -> 2D stereographic projection
        const wFactor = 1 / (2.7 - w4 * 0.65);
        const zFactor = 1 / (3.1 - z * wFactor * 0.6);
        const px = cx + x * wFactor * zFactor * size * 3.1;
        const py = cy + y * wFactor * zFactor * size * 3.1;
        verts2D.push({ x: px, y: py, w4 });
      }
      for (let i = 0; i < 16; i++) {
        for (let bit = 0; bit < 4; bit++) {
          const j = i ^ (1 << bit);
          if (i < j) {
            const [cr, cg, cb] = toneRgb(bit % 3);
            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.52 * scale})`;
            ctx.lineWidth = bit === 3 ? 2.1 : 1.4;
            ctx.beginPath();
            ctx.moveTo(verts2D[i].x, verts2D[i].y);
            ctx.lineTo(verts2D[j].x, verts2D[j].y);
            ctx.stroke();
          }
        }
        drawBokehSprite(ctx, spriteBank?.orbPrimary, verts2D[i].x, verts2D[i].y, 7 + (verts2D[i].w4 + 1) * 3.5, toneRgb(i % 3), 0.72 * scale);
      }
    } else if (mode === "calabi_yau") {
      // 11D Calabi-Yau manifold cross-section: 6-fold complex Riemann sheets
      const rad = Math.min(w, h) * 0.3;
      const folds = 6;
      for (let k = 0; k < folds; k++) {
        const [cr, cg, cb] = toneRgb(k % 3);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.46 * scale})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const phase = (k / folds) * Math.PI * 2 + t * 0.4;
        const steps = 90;
        for (let s = 0; s <= steps; s++) {
          const u = (s / steps) * Math.PI * 2;
          const rMod = rad * (0.45 + 0.55 * Math.cos(folds * 0.5 * u + t) * Math.sin(u * 2 + phase));
          const x = cx + Math.cos(u + phase) * rMod + Math.sin(u * 3 - t) * 28;
          const y = cy + Math.sin(u + phase) * rMod + Math.cos(u * 3 + t) * 28;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (mode === "quasicrystal") {
      // 5-fold Penrose aperiodic quasicrystal rings & golden-ratio vertices
      const phi = 1.61803398875;
      const baseR = Math.min(w, h) * 0.065;
      for (let shell = 1; shell <= 5; shell++) {
        const r = baseR * Math.pow(phi, shell * 0.68);
        const sym = 10;
        const [cr, cg, cb] = toneRgb(shell % 3);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.42 * scale})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let k = 0; k <= sym; k++) {
          const ang = (k / sym) * Math.PI * 2 + (shell % 2 === 0 ? t * 0.3 : -t * 0.3);
          const wave = 1 + 0.14 * Math.cos(5 * ang + t * 2);
          const px = cx + Math.cos(ang) * r * wave;
          const py = cy + Math.sin(ang) * r * wave;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
          if (k < sym) drawBokehSprite(ctx, spriteBank?.orbPrimary, px, py, 6, toneRgb(k % 3), 0.55 * scale);
        }
        ctx.stroke();
      }
    } else if (mode === "klein") {
      // Non-orientable figure-8 Klein bottle immersion ribs
      const scaleR = Math.min(w, h) * 0.12;
      const ribs = 16;
      for (let r = 0; r < ribs; r++) {
        const u = (r / ribs) * Math.PI * 2 + t * 0.35;
        const [cr, cg, cb] = toneRgb(r % 3);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.44 * scale})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let s = 0; s <= 48; s++) {
          const v = (s / 48) * Math.PI * 2;
          const rad = 2.2 + Math.cos(u * 0.5) * Math.sin(v) - Math.sin(u * 0.5) * Math.sin(2 * v) * 0.5;
          const x = cx + rad * Math.cos(u) * scaleR;
          const y = cy + (rad * Math.sin(u) * 0.75 + Math.cos(u * 0.5) * Math.sin(2 * v) * 0.6) * scaleR;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else if (mode === "retrocausal") {
      // Closed timelike curves: particles + future ghost echo ahead of trajectory
      for (let c = 1; c <= 3; c++) {
        const [cr, cg, cb] = toneRgb(c % 3);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.32 * scale})`;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * (0.12 * c), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const p of particles) {
        p.angle += p.speed;
        const r = Math.min(w, h) * (0.14 + (p.tone + 1) * 0.08);
        const nowX = cx + Math.cos(p.angle) * r;
        const nowY = cy + Math.sin(p.angle * 2) * r * 0.65;
        const futAngle = p.angle + 0.42;
        const futX = cx + Math.cos(futAngle) * r;
        const futY = cy + Math.sin(futAngle * 2) * r * 0.65;
        const [cr, cg, cb] = toneRgb(p.tone);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.38 * scale})`;
        ctx.beginPath();
        ctx.moveTo(nowX, nowY);
        ctx.lineTo(futX, futY);
        ctx.stroke();
        drawBokehSprite(ctx, spriteBank?.orbPrimary, futX, futY, p.r * 1.4, highlight, 0.35 * scale);
        drawBokehSprite(ctx, spriteBank?.orbPrimary, nowX, nowY, p.r * 2.1, toneRgb(p.tone), 0.85 * scale);
      }
    } else {
      // Matrioshka Brain, Supersolid, Spacetime Origami, Anyon Braid, Metamaterial Cloak, Omega Point & Xenotech Biolith
      const rings = 5;
      for (let m = 1; m <= rings; m++) {
        const [cr, cg, cb] = toneRgb(m % 3);
        const rad = Math.min(w, h) * (0.07 * m);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.42 * scale})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const segs = mode === "origami_metric" ? 8 : mode === "xenotech" ? 6 : 48;
        for (let s = 0; s <= segs; s++) {
          const a = (s / segs) * Math.PI * 2 + (m % 2 === 0 ? t * 0.4 : -t * 0.4);
          const mod = 1 + 0.16 * Math.sin(a * (m + 2) + t * 2);
          const px = mx + Math.cos(a) * rad * mod;
          const py = my + Math.sin(a) * rad * mod;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      for (const p of particles) {
        p.angle += p.speed;
        const orbitR = Math.min(w, h) * (0.09 + ((p.phase * 0.5 + t * 0.2) % 0.34));
        const px = mx + Math.cos(p.angle + p.phase) * orbitR;
        const py = my + Math.sin(p.angle * (mode === "anyon_braid" ? 1.5 : 1) + p.phase) * orbitR;
        drawBokehSprite(ctx, spriteBank?.orbPrimary, px, py, p.r * 2, toneRgb(p.tone), 0.78 * scale);
      }
    }
  }
}

function drawFrame() {
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "")) return false;
  const canvas = document.getElementById("fm-atmosphere-canvas");
  if (!canvas || typeof canvas.getContext !== "function") return false;
  let ctx = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    return false;
  }
  if (!ctx) return false;
  frameTick++;
  const profile = TIER_PROFILES[activeTier] || TIER_PROFILES.medium;
  const w = canvas.width;
  const h = canvas.height;
  const reactiveMul = computeReactiveMultiplier(frameTick);
  const scale = (activeIntensity / 60) * reactiveMul;
  const { isDark } = cachedColors;

  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = isDark && profile.bloom ? "screen" : "source-over";

  for (const layer of activeLayers) {
    drawSingleLayer(ctx, layer, w, h, scale, profile);
  }

  ctx.globalCompositeOperation = "source-over";
  return true;
}

function startLoop() {
  stopLoop();
  if (activeEffect === "none" || !activeLayers.length) return;
  if (!drawFrame() || reducedMotion()) return;
  const tick = (now = 0) => {
    if (activeEffect === "none" || document.hidden) {
      rafId = 0;
      return;
    }
    if (now >= scrollPauseUntil && (!lastFrameAt || now - lastFrameAt >= FRAME_INTERVAL_MS)) {
      lastFrameAt = now;
      if (!drawFrame()) {
        rafId = 0;
        return;
      }
    }
    if (typeof requestAnimationFrame === "function") rafId = requestAnimationFrame(tick);
  };
  if (typeof requestAnimationFrame === "function") rafId = requestAnimationFrame(tick);
}

/** Applies the chosen atmospheric effect (or `+`-combined multi-effect mix), graphics hardware tier, and reactive physics mode. */
export function applyAtmosphere(overrideEffect, overrideIntensity, overrideTier, overrideReactive) {
  const effect = overrideEffect !== undefined
    ? normalizeAtmosphereSpec(overrideEffect)
    : effectiveAtmosphere();
  const layerIds = parseAtmosphereIds(effect);
  const intensity = overrideIntensity !== undefined
    ? Math.min(100, Math.max(10, Math.round(Number(overrideIntensity) || 60)))
    : effectiveAtmosphereIntensity();
  const rawTier = overrideTier !== undefined && VALID_TIERS.has(overrideTier)
    ? overrideTier
    : (state.settings?.atmosphereTier || "auto");
  const resolvedTier = rawTier === "auto" ? detectHardwareTier() : rawTier;
  const resolvedReactive = overrideReactive !== undefined && VALID_REACTIVE_MODES.has(overrideReactive)
    ? overrideReactive
    : effectiveAtmosphereReactive();

  activeEffect = layerIds.length ? layerIds.join("+") : "none";
  activeIntensity = intensity;
  activeTier = TIER_PROFILES[resolvedTier] ? resolvedTier : "medium";
  activeReactiveMode = resolvedReactive;
  const root = document.documentElement;

  refreshThemeColors();

  if (activeEffect === "none") {
    stopLoop();
    activeLayers = [];
    delete root.dataset.atmosphere;
    delete root.dataset.atmosphereTier;
    delete root.dataset.atmosphereLayers;
    delete root.dataset.atmosphereReactive;
    delete root.dataset.atmosphereSurge;
    root.style.removeProperty("--fm-atmosphere-intensity");
    document.getElementById("fm-atmosphere-layer")?.remove();
    return;
  }

  root.dataset.atmosphere = activeEffect;
  root.dataset.atmosphereTier = activeTier;
  root.dataset.atmosphereLayers = String(layerIds.length);
  root.dataset.atmosphereReactive = activeReactiveMode;
  root.style.setProperty("--fm-atmosphere-intensity", String(Math.round((intensity / 100) * 100) / 100));
  const layer = ensureLayer();
  layer.dataset.effect = activeEffect;
  layer.dataset.tier = activeTier;
  layer.dataset.reactive = activeReactiveMode;
  const hasMist = layerIds.some((id) => ATMOSPHERE_BY_ID.get(id)?.engine === "mist");
  if (hasMist) layer.dataset.mist = "true";
  else delete layer.dataset.mist;
  const { w, h } = syncCanvasSize();
  seedAllLayers(layerIds, w, h, intensity / 60);
  startLoop();
}

/** Opens the interactive Atmospheric Special Effects Studio with 160 effects, Multi-Effect Layer Mixer, Signature Mixes, Reactive Physics, and Tier/Animation filtering. */
export async function showAtmosphereDialog() {
  const savedEffect = normalizeAtmosphereSpec(state.settings?.atmosphere || "none");
  const savedIntensity = effectiveAtmosphereIntensity();
  const savedTier = VALID_TIERS.has(state.settings?.atmosphereTier) ? state.settings.atmosphereTier : "auto";
  const savedReactive = effectiveAtmosphereReactive();
  const detectedTier = detectHardwareTier();
  let pickedEffect = savedEffect;
  let pickedIntensity = savedIntensity;
  let pickedTier = savedTier;
  let pickedReactive = savedReactive;
  let mixMode = parseAtmosphereIds(savedEffect).length > 1;
  let activeCat = "all";
  let searchQuery = "";

  refreshThemeColors();

  const toggleLayerInMix = (id) => {
    if (id === "none") {
      pickedEffect = "none";
      return;
    }
    const current = parseAtmosphereIds(pickedEffect);
    const idx = current.indexOf(id);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else if (current.length >= MAX_ATMOSPHERE_LAYERS) {
      current.shift();
      current.push(id);
    } else {
      current.push(id);
    }
    pickedEffect = current.length ? current.join("+") : "none";
  };

  const intensitySlider = h("input", {
    type: "range",
    min: "10",
    max: "100",
    step: "5",
    value: String(pickedIntensity),
    "aria-label": "Effect intensity",
  });
  const intensityOut = h("output", { class: "fm-atmo-output" }, `${pickedIntensity}%`);
  intensitySlider.addEventListener("input", () => {
    pickedIntensity = Number(intensitySlider.value);
    intensityOut.textContent = `${pickedIntensity}%`;
    applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
  });

  const tierBar = h("div", { class: "fm-atmo-tier-bar", role: "radiogroup", "aria-label": "Hardware graphics tier" });
  const tierHint = h("p", { class: "hint fm-atmo-tier-hint", role: "status" });

  const updateTierHint = () => {
    const chosen = HARDWARE_TIERS.find((t) => t.id === pickedTier) || HARDWARE_TIERS[0];
    const resolved = pickedTier === "auto" ? detectedTier : pickedTier;
    const resolvedLabel = HARDWARE_TIERS.find((t) => t.id === resolved)?.label || resolved;
    tierHint.textContent = pickedTier === "auto"
      ? `Auto-detected profile: ${resolvedLabel}. ${chosen.desc}`
      : `${chosen.label} (${chosen.badge}): ${chosen.desc}`;
  };

  const renderTiers = () => {
    tierBar.replaceChildren(...HARDWARE_TIERS.map((tier) => {
      const active = pickedTier === tier.id;
      return h("button", {
        type: "button",
        class: `fm-atmo-tier-btn${active ? " is-active" : ""}`,
        "data-tier": tier.id,
        "aria-pressed": String(active),
        onclick: () => {
          pickedTier = tier.id;
          renderTiers();
          updateTierHint();
          applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
        },
      },
      h("span", { class: "fm-atmo-tier-name" }, tier.label),
      h("span", { class: "fm-atmo-tier-badge" }, tier.id === "auto" ? `Auto (${detectedTier.toUpperCase()})` : tier.badge));
    }));
  };

  // -- Reactive Physics & Telemetry Modulation Bar -------------------------------------------------------------------
  const reactiveBar = h("div", { class: "fm-atmo-tier-bar fm-atmo-reactive-bar", role: "radiogroup", "aria-label": "Reactive physics modulation" });
  const reactiveHint = h("p", { class: "hint fm-atmo-tier-hint", role: "status" });
  const surgeBtn = h("button", {
    type: "button",
    class: "fm-atmo-random-mix fm-atmo-surge-btn",
    "data-surge-btn": "true",
    title: "Discharge an immediate high-voltage / relativistic energy impulse across active layers",
    onclick: () => {
      if (pickedEffect === "none") pickedEffect = "tesla_megacoil";
      applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
      triggerReactiveImpulse(1.55);
      renderMixer();
      renderCards();
    },
  }, "⚡ Trigger Arc Surge");

  const updateReactiveHint = () => {
    const chosen = REACTIVE_MODES.find((m) => m.id === pickedReactive) || REACTIVE_MODES[0];
    reactiveHint.textContent = `${chosen.label} (${chosen.badge}): ${chosen.desc}`;
  };

  const renderReactiveBar = () => {
    reactiveBar.replaceChildren(
      ...REACTIVE_MODES.map((rm) => {
        const active = pickedReactive === rm.id;
        return h("button", {
          type: "button",
          class: `fm-atmo-reactive-btn fm-atmo-cat-btn${active ? " is-active" : ""}`,
          "data-reactive-mode": rm.id,
          "aria-pressed": String(active),
          onclick: () => {
            pickedReactive = rm.id;
            renderReactiveBar();
            updateReactiveHint();
            applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
          },
        },
        h("span", { class: "fm-atmo-tier-name" }, rm.label),
        h("span", { class: "fm-atmo-tier-badge" }, rm.badge));
      }),
      surgeBtn,
    );
  };

  // -- Multi-Effect Layer Mixer Dock & User Custom Presets -----------------------------------------------------------
  const mixerDock = h("div", { class: "fm-atmo-mixer-dock" });
  const presetNameInput = h("input", {
    type: "text",
    class: "prop-input fm-atmo-preset-name-input",
    "data-user-preset-name": "true",
    maxlength: "48",
    placeholder: "Name your custom effect preset (e.g. Hyper-Tesla 2126)…",
    "aria-label": "Custom special effect preset name",
  });

  const handleSaveUserPreset = async () => {
    const rawName = presetNameInput.value.trim();
    const defaultLabel = formatAtmosphereLabel(pickedEffect);
    const chosenName = (rawName || `My ${defaultLabel}`).slice(0, 48);
    await saveCustomAtmospherePreset({
      name: chosenName,
      effect: pickedEffect,
      intensity: pickedIntensity,
      tier: pickedTier,
      reactive: pickedReactive,
    });
    presetNameInput.value = "";
    renderMixer();
    toast(`Saved custom preset "${chosenName}".`, { kind: "info" });
  };

  presetNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void handleSaveUserPreset();
    }
  });

  const renderMixer = () => {
    const activeIds = parseAtmosphereIds(pickedEffect);
    const mixToggleBtn = h("button", {
      type: "button",
      class: `fm-atmo-mix-toggle${mixMode ? " is-active" : ""}`,
      "aria-pressed": String(mixMode),
      onclick: () => {
        mixMode = !mixMode;
        renderMixer();
        syncCardStates();
      },
    }, mixMode ? `🔀 Mix Mode: ON (${activeIds.length}/${MAX_ATMOSPHERE_LAYERS} layers)` : "🔀 Mix Mode: Layer up to 4 effects");

    const surpriseBtn = h("button", {
      type: "button",
      class: "fm-atmo-random-mix",
      title: "Generate a creative 3-layer atmospheric combination",
      onclick: () => {
        const backdrops = ATMOSPHERE_OPTIONS.filter((o) => ["grid", "nebula", "aurora", "waves", "beams", "portal", "radar", "physics", "future2126"].includes(o.engine));
        const mids = ATMOSPHERE_OPTIONS.filter((o) => ["stars", "mist", "network", "geometry", "dna", "circuit", "tesla", "future2126"].includes(o.engine));
        const fronts = ATMOSPHERE_OPTIONS.filter((o) => ["precip", "snow", "ember", "orbs", "glyph", "tesla"].includes(o.engine));
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]?.id;
        const combo = [pick(backdrops), pick(mids), pick(fronts)].filter(Boolean);
        mixMode = true;
        pickedEffect = combo.join("+");
        renderMixer();
        syncCardStates();
        applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
      },
    }, "🎲 Surprise Mix");

    const activeLayersRow = h("div", { class: "fm-atmo-active-layers", role: "region", "aria-label": "Active atmospheric layers" },
      activeIds.length === 0
        ? h("span", { class: "fm-atmo-layer-empty" }, "No active layers — pick any effect below, click + Mix on cards, or try a Signature Mix.")
        : activeIds.map((id, idx) => {
            const opt = ATMOSPHERE_BY_ID.get(id);
            return h("button", {
              type: "button",
              class: "fm-atmo-layer-chip",
              "data-layer-id": id,
              title: `Remove ${opt?.label || id} from mix`,
              onclick: () => {
                toggleLayerInMix(id);
                renderMixer();
                syncCardStates();
                applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
              },
            },
            h("span", { class: "fm-atmo-layer-num" }, String(idx + 1)),
            h("span", {}, `${opt?.icon || "✨"} ${opt?.label || id}`),
            h("span", { class: "fm-atmo-layer-remove", "aria-hidden": "true" }, "×"));
          }),
    );

    const presetsRow = h("div", { class: "fm-atmo-preset-row", role: "group", "aria-label": "Signature multi-effect mixes" },
      ...ATMOSPHERE_MIX_PRESETS.map((preset) => {
        const isCurrent = pickedEffect === preset.id;
        return h("button", {
          type: "button",
          class: `fm-atmo-preset-btn${isCurrent ? " is-active" : ""}`,
          "data-mix": preset.id,
          title: preset.desc,
          "aria-pressed": String(isCurrent),
          onclick: () => {
            mixMode = true;
            pickedEffect = preset.id;
            renderMixer();
            syncCardStates();
            applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
          },
        }, h("span", { class: "fm-atmo-preset-icon" }, preset.icon), h("span", {}, preset.label));
      }),
    );

    const userPresets = savedAtmospherePresets();
    const savePresetBtn = h("button", {
      type: "button",
      class: "btn fm-atmo-save-preset-btn",
      "data-save-user-preset": "true",
      title: "Save current effect, layer mix, intensity, tier, and reactive mode as a named preset",
      onclick: () => { void handleSaveUserPreset(); },
    }, "💾 Save Preset");

    const userPresetsList = h("div", { class: "fm-atmo-user-presets-list", role: "group", "aria-label": "My saved special effects presets" },
      userPresets.length === 0
        ? h("span", { class: "fm-atmo-layer-empty", "data-user-presets-empty": "true" }, "No custom presets saved yet — name & save your favorite effect, layer mix, and intensity above for 1-click recall.")
        : userPresets.map((up) => {
            const isCurrent = pickedEffect === up.effect && pickedIntensity === up.intensity;
            const summary = `${formatAtmosphereLabel(up.effect)} · ${up.intensity}%`;
            return h("span", { class: `fm-atmo-user-preset-chip${isCurrent ? " is-active" : ""}` },
              h("button", {
                type: "button",
                class: `fm-atmo-user-preset-btn${isCurrent ? " is-active" : ""}`,
                "data-user-preset": up.name,
                "aria-pressed": String(isCurrent),
                title: `Apply "${up.name}" (${summary})`,
                onclick: () => {
                  pickedEffect = normalizeAtmosphereSpec(up.effect);
                  pickedIntensity = Math.max(10, Math.min(100, Number(up.intensity) || 60));
                  if (up.tier && VALID_TIERS.has(up.tier)) pickedTier = up.tier;
                  if (up.reactive && VALID_REACTIVE_MODES.has(up.reactive)) pickedReactive = up.reactive;
                  mixMode = parseAtmosphereIds(pickedEffect).length > 1;
                  intensitySlider.value = String(pickedIntensity);
                  intensityOut.textContent = `${pickedIntensity}%`;
                  renderTiers();
                  updateTierHint();
                  renderReactiveBar();
                  updateReactiveHint();
                  renderMixer();
                  syncCardStates();
                  applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
                },
              },
              h("span", { class: "fm-atmo-user-preset-star" }, "⭐"),
              h("span", { class: "fm-atmo-user-preset-title" }, up.name),
              h("span", { class: "fm-atmo-user-preset-meta" }, `${up.intensity}%`)),
              h("button", {
                type: "button",
                class: "fm-atmo-user-preset-del",
                "data-delete-user-preset": up.name,
                title: `Delete preset "${up.name}"`,
                "aria-label": `Delete preset ${up.name}`,
                onclick: async (e) => {
                  e.stopPropagation();
                  await deleteCustomAtmospherePreset(up.name);
                  renderMixer();
                  toast(`Deleted preset "${up.name}".`, { kind: "info" });
                },
              }, "×"),
            );
          }),
    );

    const userPresetsBar = h("div", { class: "fm-atmo-user-presets-bar" },
      h("div", { class: "fm-atmo-user-presets-form" },
        h("strong", { class: "fm-atmo-user-presets-label" }, "💾 My Custom Presets:"),
        presetNameInput,
        savePresetBtn,
      ),
      userPresetsList,
    );

    mixerDock.replaceChildren(
      h("div", { class: "fm-atmo-mixer-head" },
        h("strong", {}, "Multi-Effect Layer Mixer — Combine up to 4 effects simultaneously"),
        h("div", { class: "fm-atmo-mixer-actions" }, mixToggleBtn, surpriseBtn),
      ),
      activeLayersRow,
      presetsRow,
      userPresetsBar,
    );
  };

  // -- Search, Category, Tier & Animation Engine Filter Bar ----------------------------------------------------------
  let activeTierFilter = "all";
  let activeAnimFilter = "all";

  const ATMO_TIER_FILTERS = [
    { id: "all", label: "All Tiers (172)" },
    { id: "ultra", label: "🚀 Ultra / Modern ARM Tier (77)" },
    { id: "medium", label: "✨ Medium / Balanced Tier (55)" },
    { id: "low", label: "⚡ Low / Eco Tier (40)" },
  ];

  const ATMO_ANIM_FILTERS = [
    { id: "all", label: "All Animations" },
    { id: "future2126", label: "🛸 Year 2126 Hyper-Dimensional" },
    { id: "tesla", label: "⚡ High-Voltage Arcs (Tesla)" },
    { id: "physics", label: "⚛️ Relativistic & Chaos Physics" },
    { id: "interactive", label: "🎯 Cursor-Interactive" },
    { id: "particles", label: "🌧️ Falling & Rising Particles" },
    { id: "waves", label: "🌌 Waves, Beams & Nebulae" },
    { id: "rings", label: "🌀 Grids, Portals & Helices" },
  ];

  const matchesAtmoAnim = (opt, anim) => {
    if (!anim || anim === "all" || opt.id === "none") return true;
    const e = opt.engine;
    if (anim === "future2126") return e === "future2126";
    if (anim === "tesla") return e === "tesla";
    if (anim === "physics") return e === "physics";
    if (anim === "interactive") return ["tesla", "physics", "future2126", "orbs", "network", "portal", "radar"].includes(e);
    if (anim === "particles") return ["precip", "snow", "ember", "stars", "glyph"].includes(e);
    if (anim === "waves") return ["waves", "beams", "aurora", "nebula", "mist"].includes(e);
    if (anim === "rings") return ["grid", "portal", "radar", "dna", "circuit", "geometry"].includes(e);
    return true;
  };

  const searchInput = h("input", {
    type: "search",
    class: "prop-input fm-atmo-search",
    placeholder: "Search 172 effects (e.g. tesseract, calabi-yau, penrose, klein, tesla, tokamak, cherenkov, collider)…",
    "aria-label": "Search atmospheric effects",
  });
  const catBar = h("div", { class: "fm-atmo-cat-bar", role: "tablist", "aria-label": "Effect categories" });
  const tierFilterBar = h("div", { class: "fm-atmo-cat-bar fm-atmo-tier-filter-bar", role: "tablist", "aria-label": "Filter effects by tier" });
  const animFilterBar = h("div", { class: "fm-atmo-cat-bar fm-atmo-anim-filter-bar", role: "tablist", "aria-label": "Filter effects by animation style" });

  const renderCatBar = () => {
    catBar.replaceChildren(...ATMOSPHERE_CATEGORIES.map((cat) => {
      const active = activeCat === cat.id;
      return h("button", {
        type: "button",
        class: `fm-atmo-cat-btn${active ? " is-active" : ""}`,
        "data-cat": cat.id,
        "aria-pressed": String(active),
        onclick: () => {
          activeCat = cat.id;
          renderCatBar();
          renderCards();
        },
      }, cat.label);
    }));
  };

  const renderTierFilterBar = () => {
    tierFilterBar.replaceChildren(...ATMO_TIER_FILTERS.map((tf) => {
      const active = activeTierFilter === tf.id;
      return h("button", {
        type: "button",
        class: `fm-atmo-cat-btn${active ? " is-active" : ""}`,
        "data-tier-filter": tf.id,
        "aria-pressed": String(active),
        onclick: () => {
          activeTierFilter = tf.id;
          renderTierFilterBar();
          renderCards();
        },
      }, tf.label);
    }));
  };

  const renderAnimFilterBar = () => {
    animFilterBar.replaceChildren(...ATMO_ANIM_FILTERS.map((af) => {
      const active = activeAnimFilter === af.id;
      return h("button", {
        type: "button",
        class: `fm-atmo-cat-btn${active ? " is-active" : ""}`,
        "data-anim-filter": af.id,
        "aria-pressed": String(active),
        onclick: () => {
          activeAnimFilter = af.id;
          renderAnimFilterBar();
          renderCards();
        },
      }, af.label);
    }));
  };

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderCards();
  });

  const sectionsContainer = h("div", { class: "fm-atmo-sections" });
  const kbStatusText = h("span", { class: "fm-atmo-kb-status", "data-atmo-kb-status": "true" });

  const allVisibleCards = () => [...sectionsContainer.querySelectorAll(".fm-atmo-card")];

  const updateKbStatus = () => {
    const cards = allVisibleCards();
    const activeIds = parseAtmosphereIds(pickedEffect);
    const primaryId = activeIds[0] || "none";
    const idx = cards.findIndex((c) => c.dataset.atmo === primaryId);
    const posLabel = idx >= 0 ? `${idx + 1} / ${cards.length}` : `${cards.length} shown`;
    kbStatusText.textContent = `⚡ Live Preview: ${formatAtmosphereLabel(pickedEffect)} (${posLabel}) · Keys: ← ↑ ↓ → · PgUp/PgDn (±8) · [ / ] step · + / - intensity · Shift+Space layer`;
  };

  const syncCardStates = () => {
    const activeIds = parseAtmosphereIds(pickedEffect);
    const cards = allVisibleCards();
    let anyTabZero = false;
    for (const card of cards) {
      const id = card.dataset.atmo || "none";
      const layerIdx = activeIds.indexOf(id);
      const active = id === "none" ? activeIds.length === 0 : layerIdx >= 0;
      card.classList.toggle("is-active", active);
      card.setAttribute("aria-pressed", String(active));
      const isPrimary = (id === "none" && activeIds.length === 0) || layerIdx === 0;
      if (isPrimary && !anyTabZero) {
        card.setAttribute("tabindex", "0");
        anyTabZero = true;
      } else {
        card.setAttribute("tabindex", "-1");
      }
      const chip = card.querySelector(".fm-atmo-mix-chip");
      if (chip) {
        chip.classList.toggle("is-layered", layerIdx >= 0);
        chip.textContent = layerIdx >= 0 ? `Layer ${layerIdx + 1}` : "+ Mix";
        chip.title = layerIdx >= 0 ? `Layer ${layerIdx + 1} in mix (click to toggle)` : "Add/toggle this effect as a layer";
      }
    }
    if (!anyTabZero && cards[0]) cards[0].setAttribute("tabindex", "0");
    updateKbStatus();
  };

  const renderCards = () => {
    const activeIds = parseAtmosphereIds(pickedEffect);
    const visibleSections = ATMOSPHERE_SECTIONS.filter((sec) => activeTierFilter === "all" || sec.tier === activeTierFilter);
    sectionsContainer.replaceChildren(...visibleSections.map((sec) => {
      const sectionOptions = ATMOSPHERE_OPTIONS.filter((opt) => {
        if (opt.section !== sec.tier) return false;
        if (activeCat !== "all" && opt.cat !== activeCat && opt.id !== "none") return false;
        if (!matchesAtmoAnim(opt, activeAnimFilter)) return false;
        if (searchQuery) {
          const hay = `${opt.id} ${opt.label} ${opt.badge} ${opt.desc} ${opt.cat} ${opt.engine} ${opt.section}`.toLowerCase();
          if (!hay.includes(searchQuery)) return false;
        }
        return true;
      });
      const grid = h("div", { class: "fm-atmo-grid", role: "group", "aria-label": sec.title },
        ...sectionOptions.map((opt) => {
          const layerIdx = activeIds.indexOf(opt.id);
          const active = opt.id === "none" ? activeIds.length === 0 : layerIdx >= 0;
          const mixChip = opt.id !== "none"
            ? h("span", {
                class: `fm-atmo-mix-chip${layerIdx >= 0 ? " is-layered" : ""}`,
                title: layerIdx >= 0 ? `Layer ${layerIdx + 1} in mix (click to toggle)` : "Add/toggle this effect as a layer",
                onclick: (e) => {
                  e.stopPropagation();
                  toggleLayerInMix(opt.id);
                  if (parseAtmosphereIds(pickedEffect).length > 1) mixMode = true;
                  renderMixer();
                  syncCardStates();
                  applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
                },
              }, layerIdx >= 0 ? `Layer ${layerIdx + 1}` : "+ Mix")
            : null;
          return h("button", {
            type: "button",
            class: `fm-atmo-card fm-atmo-card-${sec.tier}${active ? " is-active" : ""}`,
            "data-atmo": opt.id,
            "data-atmo-tier": sec.tier,
            "data-atmo-engine": opt.engine,
            "aria-pressed": String(active),
            onclick: (e) => {
              if (opt.id === "none") {
                pickedEffect = "none";
              } else if (mixMode || e?.shiftKey || e?.metaKey || e?.ctrlKey) {
                toggleLayerInMix(opt.id);
              } else {
                pickedEffect = opt.id;
              }
              renderMixer();
              syncCardStates();
              applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
            },
          },
          h("div", { class: "fm-atmo-preview", "data-preview": opt.id, "data-engine": opt.engine, "aria-hidden": "true" },
            h("span", { class: "fm-atmo-preview-layer fm-atmo-preview-a" }),
            h("span", { class: "fm-atmo-preview-layer fm-atmo-preview-b" }),
            h("span", { class: "fm-atmo-icon" }, opt.icon),
            h("span", { class: "fm-atmo-chip" }, opt.badge),
            mixChip,
          ),
          h("div", { class: "fm-atmo-card-body" },
            h("span", { class: "fm-atmo-label" }, opt.label),
            h("span", { class: "fm-atmo-desc" }, opt.desc),
          ));
        }),
      );
      return h("section", { class: `fm-atmo-section fm-atmo-section-${sec.tier}`, "data-tier-section": sec.tier },
        h("div", { class: "fm-atmo-section-head" },
          h("h3", {}, sec.title),
          h("span", { class: "fm-atmo-section-badge" }, sec.badge),
        ),
        h("p", { class: "hint fm-atmo-section-sub" }, sec.subtitle),
        grid,
      );
    }));
    syncCardStates();
  };

  const previewCardElement = (card, focusIt = true) => {
    if (!card) return;
    const id = card.dataset.atmo || "none";
    pickedEffect = id;
    renderMixer();
    syncCardStates();
    applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
    if (focusIt) {
      card.setAttribute("tabindex", "0");
      card.focus({ preventScroll: true });
      card.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  };

  const stepCardFrom = (fromCard, key) => {
    const all = allVisibleCards();
    if (!all.length) return null;
    const i = Math.max(0, all.indexOf(fromCard));
    if (key === "Home") return all[0];
    if (key === "End") return all[all.length - 1];
    if (key === "ArrowLeft") return all[(i - 1 + all.length) % all.length];
    if (key === "ArrowRight") return all[(i + 1) % all.length];
    if (key === "PageUp") return all[Math.max(0, i - 8)];
    if (key === "PageDown") return all[Math.min(all.length - 1, i + 8)];
    const r = fromCard.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
    const down = key === "ArrowDown";
    if (r.width > 0 && r.height > 0) {
      const x = r.left + r.width / 2;
      const rows = all.map((c) => [c, c.getBoundingClientRect()]).filter(([, b]) => (down ? b.top > r.top + 4 : b.top < r.top - 4));
      if (rows.length) {
        const rowTop = down ? Math.min(...rows.map(([, b]) => b.top)) : Math.max(...rows.map(([, b]) => b.top));
        const row = rows.filter(([, b]) => Math.abs(b.top - rowTop) < 8);
        return row.reduce((best, cur) => (Math.abs(cur[1].left + cur[1].width / 2 - x) < Math.abs(best[1].left + best[1].width / 2 - x) ? cur : best))[0];
      }
    }
    return all[Math.max(0, Math.min(all.length - 1, i + (down ? 4 : -4)))];
  };

  const stepByDelta = (delta) => {
    const all = allVisibleCards();
    if (!all.length) return;
    const activeIds = parseAtmosphereIds(pickedEffect);
    const primaryId = activeIds[0] || "none";
    const curIdx = all.findIndex((c) => c.dataset.atmo === primaryId);
    const nextIdx = curIdx < 0 ? (delta > 0 ? 0 : all.length - 1) : (curIdx + delta + all.length) % all.length;
    previewCardElement(all[nextIdx], true);
  };

  sectionsContainer.addEventListener("focusin", (e) => {
    const card = e.target.closest?.(".fm-atmo-card");
    if (!card) return;
    const id = card.dataset.atmo || "none";
    if (!mixMode && pickedEffect !== id) {
      pickedEffect = id;
      renderMixer();
      syncCardStates();
      applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
    }
  });

  sectionsContainer.addEventListener("keydown", (e) => {
    const card = e.target.closest?.(".fm-atmo-card");
    if (!card || e.altKey || e.ctrlKey || e.metaKey) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
      e.preventDefault();
      const target = stepCardFrom(card, e.key);
      if (target) previewCardElement(target, true);
      return;
    }
    if ((e.key === " " || e.key === "Enter") && e.shiftKey) {
      e.preventDefault();
      const id = card.dataset.atmo || "none";
      if (id !== "none") {
        toggleLayerInMix(id);
        if (parseAtmosphereIds(pickedEffect).length > 1) mixMode = true;
        renderMixer();
        syncCardStates();
        applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
      }
      return;
    }
    if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") {
      e.preventDefault();
      const step = (e.key === "+" || e.key === "=") ? 5 : -5;
      pickedIntensity = Math.max(10, Math.min(100, pickedIntensity + step));
      intensitySlider.value = String(pickedIntensity);
      intensityOut.textContent = `${pickedIntensity}%`;
      applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
    }
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const all = allVisibleCards();
      const activeCard = sectionsContainer.querySelector(".fm-atmo-card.is-active") || all[0];
      if (activeCard) previewCardElement(activeCard, true);
    }
  });

  renderTiers();
  updateTierHint();
  renderReactiveBar();
  updateReactiveHint();
  renderMixer();
  renderCatBar();
  renderTierFilterBar();
  renderAnimFilterBar();
  renderCards();

  const kbScrubberBar = h("div", { class: "fm-atmo-kb-bar" },
    h("div", { class: "fm-atmo-kb-btns" },
      h("button", {
        type: "button",
        class: "btn fm-atmo-step-btn",
        "data-atmo-step": "-1",
        title: "Preview previous effect ( [ or Left Arrow )",
        onclick: () => stepByDelta(-1),
      }, "◀ Prev Effect"),
      h("button", {
        type: "button",
        class: "btn fm-atmo-step-btn",
        "data-atmo-step": "1",
        title: "Preview next effect ( ] or Right Arrow )",
        onclick: () => stepByDelta(1),
      }, "Next Effect ▶"),
    ),
    kbStatusText,
  );

  const themeSyncBar = h("div", { class: "fm-atmo-theme-sync" },
    h("span", { class: "fm-atmo-sync-dots", "aria-hidden": "true" },
      h("span", { class: "fm-atmo-sync-dot fm-atmo-sync-dot-1" }),
      h("span", { class: "fm-atmo-sync-dot fm-atmo-sync-dot-2" }),
      h("span", { class: "fm-atmo-sync-dot fm-atmo-sync-dot-3" }),
    ),
    h("span", { class: "fm-atmo-sync-text" }, "172 Procedural Effects + 36 Signature Mixes · Harmonized with your active theme’s palette"),
  );

  const filterBar = h("div", { class: "fm-atmo-filter-bar" },
    searchInput,
    kbScrubberBar,
    catBar,
    tierFilterBar,
    animFilterBar,
  );

  const dlg = openDialog({
    title: "Atmospheric special effects",
    wide: true,
    body: [
      themeSyncBar,
      h("div", { class: "fm-atmo-tier-box" },
        h("strong", {}, "Hardware graphics tier"),
        tierBar,
        tierHint,
      ),
      h("div", { class: "fm-atmo-tier-box fm-atmo-reactive-box" },
        h("strong", {}, "Reactive physics & telemetry modulation"),
        reactiveBar,
        reactiveHint,
      ),
      mixerDock,
      filterBar,
      sectionsContainer,
      h("label", { class: "fm-atmo-intensity" },
        h("span", {}, "Intensity & particle density"),
        intensitySlider,
        intensityOut,
      ),
    ],
    buttons: [
      { label: "Turn off", value: "off" },
      { label: "Cancel", value: null },
      { label: "Apply effect", value: "save", primary: true },
    ],
    initialFocus: searchInput,
  });

  // Allow [ and ] anywhere in the dialog (when not typing in search or preset name) to rapid-step through visible effects
  const dialogEl = sectionsContainer.closest(".modal-backdrop") || sectionsContainer.parentElement;
  dialogEl?.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target === searchInput || e.target === presetNameInput) return;
    if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      stepByDelta(e.key === "]" ? 1 : -1);
    }
  });

  const choice = await dlg.result;
  if (choice === "save") {
    await saveSettings({ atmosphere: pickedEffect, atmosphereIntensity: pickedIntensity, atmosphereTier: pickedTier, atmosphereReactive: pickedReactive });
    applyAtmosphere(pickedEffect, pickedIntensity, pickedTier, pickedReactive);
    const label = formatAtmosphereLabel(pickedEffect);
    const tierLabel = HARDWARE_TIERS.find((t) => t.id === (pickedTier === "auto" ? detectedTier : pickedTier))?.label || pickedTier;
    toast(pickedEffect === "none" ? "Atmospheric effects turned off." : `Atmosphere set to ${label} (${tierLabel}).`, { kind: "info" });
  } else if (choice === "off") {
    await saveSettings({ atmosphere: "none" });
    applyAtmosphere("none", pickedIntensity, pickedTier, pickedReactive);
    toast("Atmospheric effects turned off.", { kind: "info" });
  } else {
    applyAtmosphere(savedEffect, savedIntensity, savedTier, savedReactive);
  }
}

/** Returns the sanitized list of user-saved custom atmospheric presets from `state.settings.atmospherePresets`. */
export function savedAtmospherePresets() {
  const raw = state.settings?.atmospherePresets;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 48) : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const effect = normalizeAtmosphereSpec(typeof item.effect === "string" ? item.effect : "none");
    const intensity = Math.max(10, Math.min(100, Math.round(Number(item.intensity) || 60)));
    const tier = typeof item.tier === "string" && VALID_TIERS.has(item.tier) ? item.tier : "auto";
    const reactive = typeof item.reactive === "string" && VALID_REACTIVE_MODES.has(item.reactive) ? item.reactive : "off";
    out.push({ name, effect, intensity, tier, reactive });
  }
  return out;
}

/** Saves or updates a user-named custom atmospheric preset in `state.settings.atmospherePresets` and persists to server. */
export async function saveCustomAtmospherePreset({ name, effect, intensity, tier, reactive } = {}) {
  const cleanName = typeof name === "string" ? name.trim().slice(0, 48) : "";
  if (!cleanName) return savedAtmospherePresets();
  const entry = {
    name: cleanName,
    effect: normalizeAtmosphereSpec(effect ?? effectiveAtmosphere()),
    intensity: Math.max(10, Math.min(100, Math.round(Number(intensity ?? effectiveIntensity()) || 60))),
    tier: typeof tier === "string" && VALID_TIERS.has(tier) ? tier : (state.settings?.atmosphereTier || "auto"),
    reactive: typeof reactive === "string" && VALID_REACTIVE_MODES.has(reactive) ? reactive : effectiveAtmosphereReactive(),
  };
  const existing = savedAtmospherePresets().filter((p) => p.name.toLowerCase() !== cleanName.toLowerCase());
  const next = [entry, ...existing].slice(0, 50);
  if (state.settings) state.settings.atmospherePresets = next;
  await saveSettings({ atmospherePresets: next });
  return next;
}

/** Deletes a user-saved custom atmospheric preset by name and persists to server. */
export async function deleteCustomAtmospherePreset(name) {
  const cleanName = typeof name === "string" ? name.trim().toLowerCase() : "";
  const next = savedAtmospherePresets().filter((p) => p.name.toLowerCase() !== cleanName);
  if (state.settings) state.settings.atmospherePresets = next;
  await saveSettings({ atmospherePresets: next });
  return next;
}

/** Rapidly cycles to the next (`direction = 1`) or previous (`direction = -1`) atmospheric effect and persists it. */
export async function cycleAtmosphere(direction = 1, { category = "all", tier = "all" } = {}) {
  const pool = ATMOSPHERE_OPTIONS.filter((opt) =>
    (category === "all" || opt.cat === category || opt.id === "none")
    && (tier === "all" || opt.section === tier),
  );
  if (!pool.length) return null;
  const currentIds = parseAtmosphereIds(effectiveAtmosphere());
  const currentPrimary = currentIds[0] || "none";
  const curIdx = pool.findIndex((o) => o.id === currentPrimary);
  const step = direction >= 0 ? 1 : -1;
  const nextIdx = curIdx < 0 ? (step > 0 ? 0 : pool.length - 1) : (curIdx + step + pool.length) % pool.length;
  const chosen = pool[nextIdx];
  if (state.settings) state.settings.atmosphere = chosen.id;
  applyAtmosphere(chosen.id);
  await saveSettings({ atmosphere: chosen.id });
  return chosen;
}

if (typeof window !== "undefined") {
  window.cycleAtmosphereFx = cycleAtmosphere;
}

on("theme-changed", () => {
  refreshThemeColors();
  const next = effectiveAtmosphere();
  if (next !== activeEffect) {
    applyAtmosphere();
  } else if (activeEffect !== "none") {
    drawFrame();
  }
});

on("atmosphere-picker", () => { void showAtmosphereDialog(); });


