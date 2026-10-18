// The theme editor: make your own color theme, or start from any other theme and change it. The whole window shows
// the theme while you edit (the server keeps text and buttons readable), and nothing is kept until you press Save.
import { ApiError, call } from "./api.js";
import { copyToClipboard, flashCopied, readFromClipboard } from "./copyclip.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { debounce, h } from "./dom.js";
import { toast } from "./menus.js";
import { saveSettings } from "./nav.js";
import { emit, on, state } from "./state.js";
import { applyPalette, downloadThemeFileInBrowser, extractPaletteFromPixels, forgetThemeList, paint, pasteImportThemesFromClipboard, runBulkThemeImportFlow, saveThemeFileToFolder } from "./themes.js";
import { ATMOSPHERE_IDS, ATMOSPHERE_MIX_PRESETS } from "./atmosphereCatalog.js";

const EXPORT_FORMAT = "bun-rad-studio-file-manager-theme";

/** The colors people can change, with what each one does. `secondary` isn't shown: this window has no use for it. */
const FIELDS = [
  ["background", "Window background", "The main color behind the list of files."],
  ["card", "Panels", "The toolbar, side panel, menus and dialogs."],
  ["text", "Text", "Names, labels and everything you read. It is adjusted a little if it would be hard to read."],
  ["accent", "Accent", "Selected items, links and the main buttons."],
  ["border", "Lines", "Borders and dividers."],
  ["danger", "Errors (red)", "Delete buttons and error messages."],
  ["warning", "Warnings (amber)", "Warnings, such as a file that isn't what its name says."],
  ["success", "Good news (green)", "Free space and finished jobs."],
  ["info", "Notes (blue)", "Hints and information."],
];

const STANDARD = {
  "standard-dark": { name: "Standard dark", dark: true, colors: { background: "#16191d", card: "#1e2329", text: "#e8eaed", accent: "#6ea8ff", border: "#353c46", danger: "#ff8a80", warning: "#fbbf24", success: "#7ee2a0", info: "#38bdf8" } },
  "standard-light": { name: "Standard light", dark: false, colors: { background: "#ffffff", card: "#f3f5f8", text: "#1b1f24", accent: "#0b5cd5", border: "#ccd2db", danger: "#b42318", warning: "#b45309", success: "#166534", info: "#0369a1" } },
};

const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v);

function hslToHex(hDeg, sPct, lPct) {
  const h = ((hDeg % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, sPct)) / 100;
  const l = Math.max(0, Math.min(100, lPct)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hexToHsl(hexStr) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hexStr || "").trim());
  if (!m) return { h: 210, s: 80, l: 55 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Generates a full harmonious theme color table from a single accent hex and dark/light flag. */
export function harmonizeFromAccent(accentHex, dark = true) {
  const { h, s } = hexToHsl(accentHex);
  const sat = Math.max(45, s);
  const secHue = (h + 48) % 360;
  if (dark) {
    return {
      background: hslToHex(h, Math.min(34, Math.round(sat * 0.35)), 7),
      card: hslToHex(h, Math.min(36, Math.round(sat * 0.38)), 12),
      text: hslToHex(h, 24, 94),
      accent: isHex(accentHex) ? accentHex.toLowerCase() : hslToHex(h, sat, 62),
      secondary: hslToHex(secHue, Math.max(65, sat), 64),
      border: hslToHex(h, 26, 24),
      danger: "#ff6b81",
      warning: "#fbbf24",
      success: "#34d399",
      info: "#38bdf8",
    };
  }
  return {
    background: hslToHex(h, 25, 98),
    card: hslToHex(h, 28, 93),
    text: hslToHex(h, 35, 11),
    accent: isHex(accentHex) ? accentHex.toLowerCase() : hslToHex(h, sat, 44),
    secondary: hslToHex(secHue, Math.max(60, sat), 42),
    border: hslToHex(h, 22, 80),
    danger: "#b42318",
    warning: "#b45309",
    success: "#166534",
    info: "#0369a1",
  };
}

export const EDITOR_FX_PRESETS = [
  { id: "liquid_glass", label: "✨ Tahoe Liquid Glass", fx: { glass: 0.68, blur: 28, glow: "bloom", radius: "squircle", border: "iridescent", motion: "spring", backdropStyle: "liquid", cursorEffect: "prism", vignette: "subtle", sheen: true, frostedRim: true, innerGlow: true, ambient: true } },
  { id: "m4_xdr_pro", label: "🍎 M4 Space Black XDR", fx: { glass: 0.56, blur: 24, glow: "soft", radius: "round", border: "metal", motion: "spring", backdropStyle: "oled", cursorEffect: "spotlight", vignette: "subtle", sheen: true, noise: true, frostedRim: true, ambient: true } },
  { id: "win11_mica", label: "🪟 Win 11 Mica Alt", fx: { glass: 0.52, blur: 26, glow: "soft", radius: "soft", border: "bevel", motion: "calm", backdropStyle: "mica", cursorEffect: "spotlight", vignette: "none", sheen: false, noise: true, ambient: true, saturation: 1.55 } },
  { id: "win11_acrylic", label: "🪟 Win 11 Acrylic", fx: { glass: 0.62, blur: 22, glow: "soft", radius: "soft", border: "gradient", motion: "snappy", backdropStyle: "acrylic", cursorEffect: "ripple", grain: "subtle", sheen: true, noise: true, frostedRim: true } },
  { id: "cyber_hologram", label: "🔮 Cyberpunk Hologram", fx: { glass: 0.58, blur: 20, glow: "laser", radius: "sharp", border: "hologram", motion: "snappy", backdropStyle: "glass", cursorEffect: "prism", vignette: "cinema", scanlines: "subtle", chromatic: true, prismEdge: true, neonPulse: true, sheen: true } },
  { id: "prismatic_crystal", label: "💎 Prismatic Crystal", fx: { glass: 0.65, blur: 26, glow: "aurora", radius: "round", border: "iridescent", motion: "elastic", backdropStyle: "frosted", cursorEffect: "prism", vignette: "ambient", chromatic: true, prismEdge: true, innerGlow: true, frostedRim: true, sheen: true } },
  { id: "retro_crt", label: "📺 Retro CRT Phosphor", fx: { glass: 0.35, blur: 10, glow: "ember", radius: "soft", border: "double", motion: "snappy", backdropStyle: "oled", cursorEffect: "spotlight", vignette: "cinema", scanlines: "crt", grain: "film", crtCurve: true, innerGlow: true, neonPulse: true } },
  { id: "plasma_reactor", label: "⚡ Plasma Reactor", fx: { glass: 0.55, blur: 24, glow: "plasma", radius: "round", border: "neon", motion: "elastic", backdropStyle: "glass", cursorEffect: "magnetic", vignette: "ambient", sheen: true, innerGlow: true, neonPulse: true, ambient: true, parallax: true } },
  { id: "velvet_cinema", label: "🎬 Velvet Cinema", fx: { glass: 0.45, blur: 20, glow: "bloom", radius: "round", border: "gradient", motion: "cinematic", backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "cinema", grain: "film", ambient: true, innerGlow: true } },
  { id: "halftone_zine", label: "📰 Halftone Pop Zine", fx: { glass: 0.25, blur: 8, glow: "neon", radius: "sharp", border: "double", motion: "snappy", backdropStyle: "matte", cursorEffect: "magnetic", grain: "halftone", chromatic: true } },
  { id: "aurora_silk", label: "🌌 Aurora Silk", fx: { glass: 0.6, blur: 30, glow: "aurora", radius: "pill", border: "gradient", motion: "calm", backdropStyle: "liquid", cursorEffect: "spotlight", vignette: "ambient", sheen: true, innerGlow: true, ambient: true } },
  { id: "zen_matte", label: "🪨 Zen Matte Studio", fx: { glass: 0, blur: 0, glow: "none", radius: "soft", border: "flat", motion: "calm", backdropStyle: "matte", cursorEffect: "none", vignette: "none", scanlines: "none", grain: "none", sheen: false, noise: false, chromatic: false, ambient: false } },
];

/** 1-Click Theme Hacker Mutators for deep nostalgic Linux/Compiz, Retro Workstation, and Extreme Storm personalization. */
export const THEME_HACK_MUTATORS = [
  {
    id: "compiz_burn",
    label: "🔥 Compiz Burn & Inferno",
    desc: "Classic Linux Compiz Fusion 'Burn' plugin homage: blazing folders & toolbars, molten inferno icons, and volcanic ash lightning.",
    colors: { background: "#0b0402", card: "#180804", text: "#ffefe6", accent: "#ff5500", secondary: "#ffbb00", border: "#4d1a08", danger: "#ff3300", warning: "#ffaa00", success: "#34d399", info: "#ff7733" },
    dark: true,
    fx: { glow: "ember", glowColor: "#ff5500", glowColor2: "#ffbb00", glowIntensity: 0.95, blur: 20, glass: 0.62, border: "neon", borderOpacity: 0.45, radius: "round", motion: "spring", backdropStyle: "glass", cursorEffect: "spotlight", sheen: true, innerGlow: true, neonPulse: true, ambient: true, atmosphere: "volcanic_lightning+embers", uiElementFx: "fire_folders", iconPackStyle: "inferno", iconGlow: "hyper" },
    customCss: ".row.is-folder:hover { transform: translateY(-1px) scale(1.006); }",
  },
  {
    id: "bio_slime",
    label: "🧪 Bio-Slime & Acid Vat",
    desc: "Radioactive neon-green ooze dripping from folders, toolbars, and breadcrumbs with bio-vat flask icons.",
    colors: { background: "#040d06", card: "#091a0d", text: "#e6ffeb", accent: "#39ff14", secondary: "#a3e635", border: "#194222", danger: "#ff5577", warning: "#facc15", success: "#22c55e", info: "#38bdf8" },
    dark: true,
    fx: { glow: "plasma", glowColor: "#39ff14", glowColor2: "#a3e635", glowIntensity: 0.92, blur: 22, glass: 0.64, border: "neon", borderOpacity: 0.42, radius: "squircle", motion: "elastic", backdropStyle: "liquid", cursorEffect: "ripple", sheen: true, innerGlow: true, neonPulse: true, ambient: true, atmosphere: "abyssal_trench+fireflies", uiElementFx: "slime_drip", iconPackStyle: "slime", iconGlow: "neon" },
    customCss: "#toolbar-row, .row.is-folder { border-color: rgba(57, 255, 20, 0.5); }",
  },
  {
    id: "ef5_storm",
    label: "🌪️ EF5 Cyclone & Debris",
    desc: "Full M4 storm immersion: tumbling leaves, flying newspapers, shingles & twigs with wind-buffeted folders.",
    colors: { background: "#070c10", card: "#101920", text: "#e6f2f5", accent: "#2dd4bf", secondary: "#94a3b8", border: "#233642", danger: "#f87171", warning: "#fbbf24", success: "#34d399", info: "#38bdf8" },
    dark: true,
    fx: { glow: "aurora", glowColor: "#2dd4bf", glowColor2: "#38bdf8", glowIntensity: 0.85, blur: 24, glass: 0.66, border: "iridescent", borderOpacity: 0.35, radius: "round", motion: "spring", backdropStyle: "frosted", cursorEffect: "magnetic", sheen: true, innerGlow: true, ambient: true, atmosphere: "debris_tornado_ef5+derecho_squall+cyberstorm", uiElementFx: "storm_wind", iconPackStyle: "storm_tempest", iconGlow: "neon" },
    customCss: "",
  },
  {
    id: "cryo_shatter",
    label: "❄️ Cryo-Glacier & Icicles",
    desc: "Sub-zero glacier blizzard with frosted rim folders, hanging icicle crystals, and polar aurora ribbons.",
    colors: { background: "#050d18", card: "#0b1a2e", text: "#e8f6ff", accent: "#38bdf8", secondary: "#7dd3fc", border: "#1e3a5f", danger: "#fb7185", warning: "#fcd34d", success: "#34d399", info: "#38bdf8" },
    dark: true,
    fx: { glow: "aurora", glowColor: "#38bdf8", glowColor2: "#7dd3fc", glowIntensity: 0.88, blur: 28, glass: 0.72, border: "crystal", borderOpacity: 0.42, radius: "round", motion: "calm", backdropStyle: "frosted", cursorEffect: "prism", frostedRim: true, innerGlow: true, sheen: true, ambient: true, atmosphere: "cryo_blizzard_2126+aurora_ribbons", uiElementFx: "cryo_frost", iconPackStyle: "cryo_crystal", iconGlow: "neon" },
    customCss: "",
  },
  {
    id: "retro_linux_cde",
    label: "🐧 90s Linux / CDE / BeOS Chisel",
    desc: "Nostalgic Unix workstation & classic WindowMaker / CDE / BeOS 3D bevels, sharp tactical corners, and pixel icons.",
    colors: { background: "#24303c", card: "#324152", text: "#f2f5f8", accent: "#ffbe0b", secondary: "#3a86ff", border: "#5c7085", danger: "#ff6b6b", warning: "#ffd166", success: "#06d6a0", info: "#4cc9f0" },
    dark: true,
    fx: { glow: "soft", glowColor: "#ffbe0b", glowColor2: "#3a86ff", glowIntensity: 0.35, blur: 0, glass: 0.1, border: "bevel", borderOpacity: 0.65, radius: "sharp", motion: "snappy", backdropStyle: "matte", cursorEffect: "none", sheen: false, ambient: false, atmosphere: "none", uiElementFx: "off", iconPackStyle: "retro_pixel", fontProfile: "terminal", cornerProfile: "sharp", customVars: { "--radius": "0px" } },
    customCss: "#toolbar-row, .row, .tool, .crumb { box-shadow: inset 1px 1px 0 rgba(255,255,255,0.28), inset -1px -1px 0 rgba(0,0,0,0.65); }",
  },
  {
    id: "amiga_workbench",
    label: "🕹️ Amiga Workbench & Copper Bars",
    desc: "Classic Amiga Workbench royal-blue & safety-orange aesthetic with retro pixel icons and crisp beveled chrome.",
    colors: { background: "#0055aa", card: "#004488", text: "#ffffff", accent: "#ff8800", secondary: "#000022", border: "#ffffff", danger: "#ff4444", warning: "#ffcc00", success: "#44ff88", info: "#88ccff" },
    dark: true,
    fx: { glow: "soft", glowColor: "#ff8800", glowColor2: "#ffffff", glowIntensity: 0.45, blur: 0, glass: 0.15, border: "bevel", borderOpacity: 0.85, radius: "sharp", motion: "snappy", backdropStyle: "matte", cursorEffect: "none", sheen: false, ambient: false, atmosphere: "retro_grid", uiElementFx: "off", iconPackStyle: "retro_pixel", fontProfile: "terminal", cornerProfile: "sharp", customVars: { "--radius": "0px" } },
    customCss: "#toolbar-row, .row, .tool { border-style: outset; }",
  },
  {
    id: "crt_hacker",
    label: "📺 Green-Phosphor CRT Hacker",
    desc: "Old-school VT100 / Matrix terminal phosphor bloom, CRT scanlines, monospace HUD font, and holo-glitch folders.",
    colors: { background: "#020804", card: "#051409", text: "#b8ffcc", accent: "#00ff66", secondary: "#00cc52", border: "#0d381a", danger: "#ff4d4d", warning: "#ffcc00", success: "#00ff66", info: "#00e5ff" },
    dark: true,
    fx: { glow: "laser", glowColor: "#00ff66", glowColor2: "#00e5ff", glowIntensity: 0.9, blur: 12, glass: 0.45, border: "double", borderOpacity: 0.5, radius: "sharp", motion: "snappy", scanlines: "crt", grain: "film", crtCurve: true, neonPulse: true, backdropStyle: "oled", atmosphere: "matrix+omega_matrix", uiElementFx: "holo_glitch", iconPackStyle: "neon_cyber", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "hyper" },
    customCss: ".name-text, .crumb, .tool .tl { text-shadow: 0 0 6px rgba(0, 255, 102, 0.55); }",
  },
  {
    id: "cyber_overdrive",
    label: "⚡ Tesla Cyber Overdrive",
    desc: "High-voltage violet/cyan Tesla coil arcs on folders & toolbars, chromatic hologram edges, and 2.1x saturation.",
    colors: { background: "#06040f", card: "#110a26", text: "#f3eeff", accent: "#00f5d4", secondary: "#f15bb5", border: "#3b2370", danger: "#ff4d6d", warning: "#fee440", success: "#00f5d4", info: "#00bbf9" },
    dark: true,
    fx: { glow: "plasma", glowColor: "#00f5d4", glowColor2: "#f15bb5", glowIntensity: 1, blur: 26, glass: 0.7, saturation: 2.1, border: "hologram", borderOpacity: 0.5, radius: "round", motion: "spring", chromatic: true, prismEdge: true, innerGlow: true, neonPulse: true, sheen: true, ambient: true, backdropStyle: "liquid", atmosphere: "plasma_storm+cyberstorm", uiElementFx: "tesla_arcs", iconPackStyle: "xenotech_2126", iconGlow: "hyper" },
    customCss: "",
  },
];

export const CUSTOM_CSS_SNIPPETS = [
  { id: "compiz_wobbly", label: "+ Compiz Wobbly Hover", css: ".row:hover { transform: perspective(500px) rotateX(2deg) scale(1.008) !important; transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1) !important; }" },
  { id: "retro_bevel", label: "+ SGI / CDE 3D Chisel Bevels", css: "#toolbar-row, .row, .tool, .crumb { border: 1px outset rgba(255,255,255,0.28); box-shadow: inset 1px 1px 0 rgba(255,255,255,0.32), inset -1px -1px 0 rgba(0,0,0,0.7) !important; }" },
  { id: "neon_folders", label: "+ Neon Pulsing Folders", css: ".row.is-folder .name-text { text-shadow: 0 0 8px var(--accent), 0 0 18px var(--accent); font-weight: 700; }" },
  { id: "scanline_bar", label: "+ Retro Scanline Addressbar", css: "#addressbar { background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px) !important; }" },
  { id: "ultra_glass", label: "+ Ultra Glass Floating Rows", css: ".row { margin-block: 2px; border-radius: 8px; backdrop-filter: blur(12px); }" },
];

export const PREBUILT_WALLPAPER_SCENES = [
  {
    id: "tahoe_aerial_coast",
    label: "🍎 Tahoe Aerial Coast 8K",
    dark: true,
    colors: { background: "#060e1c", card: "#0d1b30", text: "#eef6ff", accent: "#00c8ff", secondary: "#3b82f6", border: "#1f385c", danger: "#ff6b81", warning: "#fbbf24", success: "#34d399", info: "#38bdf8" },
    fx: { uiElementFx: "tahoe_glass_folders", iconPackStyle: "macos_tahoe_3d", backdropStyle: "liquid", radius: "squircle", glow: "bloom", glowColor: "#00c8ff", glowColor2: "#3b82f6", blur: 28, glass: 0.68, sheen: true, frostedRim: true },
  },
  {
    id: "pro_display_xdr_nebula",
    label: "💻 Pro Display XDR Nebula",
    dark: true,
    colors: { background: "#05060a", card: "#0d1018", text: "#f5f7ff", accent: "#5e9eff", secondary: "#a855f7", border: "#242c40", danger: "#ff6b81", warning: "#fbbf24", success: "#34d399", info: "#38bdf8" },
    fx: { uiElementFx: "xdr_titanium_folders", iconPackStyle: "pro_studio_xdr", backdropStyle: "oled", radius: "round", glow: "bloom", glowColor: "#5e9eff", glowColor2: "#a855f7", blur: 26, glass: 0.6, sheen: true, frostedRim: true, innerGlow: true },
  },
  {
    id: "win11_bloom_rtx",
    label: "🪟 Win 11 Bloom RTX 5090",
    dark: true,
    colors: { background: "#080d1a", card: "#10192e", text: "#eef4ff", accent: "#60cdff", secondary: "#8b5cf6", border: "#243556", danger: "#ff7b72", warning: "#f2cc60", success: "#3fb950", info: "#58a6ff" },
    fx: { uiElementFx: "fluent_mica_folders", iconPackStyle: "win11_fluent_pro", backdropStyle: "mica", radius: "round", glow: "aurora", glowColor: "#60cdff", glowColor2: "#8b5cf6", blur: 28, glass: 0.62, sheen: true, frostedRim: true },
  },
  {
    id: "hasselblad_golden_hour",
    label: "📸 8K Hasselblad Golden Hour",
    dark: true,
    colors: { background: "#0b0907", card: "#16120e", text: "#faf4ed", accent: "#f59e0b", secondary: "#ec4899", border: "#332920", danger: "#fb7185", warning: "#fbbf24", success: "#34d399", info: "#38bdf8" },
    fx: { uiElementFx: "xdr_titanium_folders", iconPackStyle: "hdr_photo_studio", backdropStyle: "frosted", radius: "round", glow: "bloom", glowColor: "#f59e0b", glowColor2: "#ec4899", blur: 24, glass: 0.56, sheen: true, frostedRim: true },
  },
  {
    id: "dolomites_alpine_light",
    label: "🏔️ Dolomites Studio Daylight",
    dark: false,
    colors: { background: "#f5f8fc", card: "#ffffff", text: "#0f172a", accent: "#0284c7", secondary: "#4f46e5", border: "#cbd5e1", danger: "#dc2626", warning: "#d97706", success: "#059669", info: "#0284c7" },
    fx: { uiElementFx: "tahoe_glass_folders", iconPackStyle: "nordic_minimal", backdropStyle: "liquid", radius: "round", glow: "soft", glowColor: "#0284c7", glowColor2: "#4f46e5", blur: 24, glass: 0.52, sheen: true, frostedRim: true },
  },
  {
    id: "linux_papirus_workstation",
    label: "🐧 Linux Papirus 4K HiDPI",
    dark: true,
    colors: { background: "#0d131a", card: "#151f2b", text: "#e6edf3", accent: "#10b981", secondary: "#06b6d4", border: "#26374a", danger: "#f87171", warning: "#fbbf24", success: "#34d399", info: "#38bdf8" },
    fx: { uiElementFx: "tahoe_glass_folders", iconPackStyle: "linux_papirus_pro", backdropStyle: "frosted", radius: "round", glow: "soft", glowColor: "#10b981", glowColor2: "#06b6d4", blur: 20, glass: 0.54, sheen: true },
  },
];

async function loadStart(key) {
  if (STANDARD[key]) return { ...structuredClone(STANDARD[key]), base: STANDARD[key].name, editingId: null };
  const r = await call("themes/get", { key });
  const custom = r.custom;
  return { name: custom ? custom.name : `${r.theme.name} (mine)`, dark: r.source.dark, colors: { ...r.source.colors }, fx: r.source.fx ? structuredClone(r.source.fx) : undefined, base: custom ? custom.base : r.theme.name, editingId: custom ? custom.id : null };
}

export async function openEditor({ from = "", seedKey = "" } = {}) {
  const initialKey = from || seedKey;
  let themes;
  try {
    themes = (await call("themes/list")).themes;
  } catch (err) {
    toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
    return;
  }
  const isDark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  let start;
  try {
    start = await loadStart(initialKey || (isDark ? "standard-dark" : "standard-light"));
  } catch {
    start = await loadStart("standard-dark");
  }
  let draft = start;
  let closed = false;
  let previewVersion = 0;
  const defaultEffects = () => ({
    glow: "soft", glowColor: draft.colors.accent, glowColor2: draft.colors.secondary || draft.colors.accent,
    blur: 16, glass: 0.4, glowIntensity: 1, borderOpacity: 0.16,
    grain: "none", scanlines: "none", sheen: false, radius: "soft", border: "flat", motion: "calm",
    noise: false, chromatic: false, ambient: false, atmosphere: "none",
    uiElementFx: "off", iconPackStyle: "default", fontProfile: "default", cornerProfile: "default", iconGlow: "off",
  });
  const FIELD_FALLBACKS = {
    backdropStyle: "glass",
    cursorEffect: "spotlight",
    vignette: "none",
    saturation: 1.35,
    uiElementFx: "off",
    iconPackStyle: "default",
    fontProfile: "default",
    cornerProfile: "default",
    iconGlow: "off",
  };

  // -- the form ----------------------------------------------------------------------------------------------------
  const nameInput = h("input", { type: "text", class: "prop-input", maxlength: "40", "aria-label": "Theme name", title: "The name shown in the theme gallery.", value: draft.name });
  const darkBox = h("input", { type: "checkbox", checked: draft.dark, title: "Tick this when the background is dark. It decides the shadows and the color of the browser's own controls." });
  const notes = h("p", { class: "hint theme-notes", role: "status" });
  const status = h("p", { class: "dialog-error", role: "alert", hidden: true });
  const startSelect = h("select", { class: "prop-input", "aria-label": "Start from", title: "Copy the colors of another theme to work from." });
  const heading = h("p", { class: "hint" });
  const effectsEnabled = h("input", { type: "checkbox", checked: !!draft.fx, "aria-label": "Enable visual effects" });
  const effectControls = h("fieldset", { class: "theme-effect-controls" });
  const effectInputs = new Map();
  const effectField = (key, label, choices, range) => {
    const input = choices
      ? h("select", { class: "prop-input", "aria-label": label }, choices.map((value) => h("option", { value }, value)))
      : h("input", { type: range ? "range" : "color", min: range?.[0], max: range?.[1], step: range?.[2], "aria-label": label });
    const output = h("output", {});
    const read = () => {
      const fx = draft.fx || defaultEffects();
      const value = key === "opacity" ? Math.round((1 - fx.glass * 0.6) * 100) : fx[key] ?? defaultEffects()[key] ?? FIELD_FALLBACKS[key];
      input.value = String(value);
      output.textContent = range ? `${value}${key === "opacity" ? "%" : key === "blur" ? "px" : key === "saturation" ? "x" : ""}` : "";
    };
    input.addEventListener("input", () => {
      if (!draft.fx) return;
      const value = range ? Number(input.value) : input.value;
      if (key === "opacity") draft.fx.glass = (100 - Number(value)) / 60;
      else draft.fx[key] = value;
      output.textContent = range ? `${value}${key === "opacity" ? "%" : key === "blur" ? "px" : key === "saturation" ? "x" : ""}` : "";
      refresh();
    });
    effectInputs.set(key, read);
    return h("label", {}, h("span", {}, label), input, output);
  };
  effectControls.append(
    effectField("opacity", "Panel opacity", null, [40, 100, 1]),
    effectField("blur", "Glass blur", null, [0, 32, 1]),
    effectField("glowIntensity", "Glow intensity", null, [0, 1, 0.05]),
    effectField("borderOpacity", "Border strength", null, [0, 1, 0.05]),
    effectField("saturation", "Backdrop saturation", null, [0.5, 2.2, 0.05]),
    effectField("backdropStyle", "Surface material", ["glass", "liquid", "mica", "acrylic", "frosted", "oled", "matte"]),
    effectField("glow", "Glow style", ["none", "soft", "neon", "bloom", "aurora", "laser", "plasma", "ember"]),
    effectField("glowColor", "Glow color"),
    effectField("glowColor2", "Secondary glow color"),
    effectField("radius", "Corner style", ["sharp", "soft", "round", "pill", "squircle"]),
    effectField("border", "Border style", ["flat", "gradient", "metal", "hologram", "neon", "iridescent", "bevel", "double"]),
    effectField("motion", "Animation feel", ["calm", "spring", "snappy", "elastic", "cinematic", "zero"]),
    effectField("cursorEffect", "Cursor interaction", ["spotlight", "ripple", "magnetic", "prism", "none"]),
    effectField("vignette", "Screen vignette", ["none", "subtle", "cinema", "ambient"]),
  );
  const effectFlags = [
    ["ambient", "Ambient"],
    ["sheen", "Sheen"],
    ["chromatic", "Chromatic"],
    ["noise", "Noise"],
    ["prismEdge", "Prismatic edge"],
    ["innerGlow", "Inner glow"],
    ["frostedRim", "Specular XDR rim"],
    ["neonPulse", "Neon pulse"],
    ["crtCurve", "CRT curvature"],
    ["parallax", "3D Parallax"],
  ];
  for (const [key, labelText] of effectFlags) {
    const input = h("input", { type: "checkbox", "aria-label": `${key} effect` });
    effectInputs.set(key, () => { input.checked = draft.fx?.[key] ?? false; });
    input.addEventListener("change", () => { if (draft.fx) { draft.fx[key] = input.checked; refresh(); } });
    effectControls.append(h("label", { class: "check" }, input, h("span", {}, labelText)));
  }
  effectControls.append(
    effectField("grain", "Film grain", ["none", "subtle", "film", "halftone"]),
    effectField("scanlines", "Scanlines", ["none", "subtle", "crt", "interlace"]),
    effectField("atmosphere", "Atmospheric effect", [...ATMOSPHERE_IDS, ...ATMOSPHERE_MIX_PRESETS.map((m) => m.id)]),
    effectField("uiElementFx", "Folder & toolbar shader", ["off", "tahoe_glass_folders", "fluent_mica_folders", "xdr_titanium_folders", "fire_folders", "slime_drip", "storm_wind", "cryo_frost", "tesla_arcs", "mercury_chrome", "holo_glitch", "void_tentacles"]),
    effectField("iconPackStyle", "Custom icon pack", ["default", "macos_tahoe_3d", "win11_fluent_pro", "pro_studio_xdr", "hdr_photo_studio", "linux_papirus_pro", "nordic_minimal", "inferno", "slime", "storm_tempest", "neon_cyber", "liquid_gems", "cryo_crystal", "retro_pixel", "xenotech_2126"]),
    effectField("fontProfile", "Typography profile", ["default", "scifi", "terminal", "editorial", "rounded"]),
    effectField("cornerProfile", "Corner geometry", ["default", "sharp", "rounded", "pill"]),
    effectField("iconGlow", "Icon glow", ["off", "subtle", "neon", "hyper"]),
  );

  // -- Theme Hacker Studio: Deep CSS Token Overrides (customVars) & Personal Custom CSS (customCss) ----------------
  const HACKABLE_TOKENS = [
    ["surface-elevated", "Elevated surface (--surface-elevated)"],
    ["surface-sunken", "Sunken surface (--surface-sunken)"],
    ["selected", "Selected row fill (--selected)"],
    ["selected-text", "Selected row text (--selected-text)"],
    ["hover", "Row hover fill (--hover)"],
    ["border-strong", "Strong border (--border-strong)"],
    ["shadow", "Window shadow (--shadow)"],
  ];
  const customVarInputs = new Map();
  const customVarGrid = h("div", { class: "theme-hacker-tokens" },
    ...HACKABLE_TOKENS.map(([tokenKey, labelText]) => {
      const inp = h("input", {
        type: "text",
        class: "prop-input",
        "data-custom-var": tokenKey,
        "aria-label": labelText,
        maxlength: "120",
        placeholder: "Auto (or #hex / rgba / shadow)…",
      });
      inp.addEventListener("input", () => {
        effectsEnabled.checked = true;
        effectControls.disabled = false;
        draft.fx ??= defaultEffects();
        draft.fx.customVars ??= {};
        const val = inp.value.trim();
        if (val) draft.fx.customVars[tokenKey] = val;
        else delete draft.fx.customVars[tokenKey];
        if (!Object.keys(draft.fx.customVars).length) delete draft.fx.customVars;
        refresh();
      });
      customVarInputs.set(tokenKey, inp);
      return h("label", { class: "field" }, h("span", { class: "field-label" }, labelText), inp);
    }),
  );

  const customCssInput = h("textarea", {
    class: "prop-input theme-export",
    rows: "4",
    "data-custom-css-input": "true",
    "aria-label": "Personal custom CSS overrides",
    maxlength: "6000",
    placeholder: "/* Hack any File Manager selector! e.g. .row.is-folder, #toolbar-row, .c-icon */\n.row.is-folder:hover { transform: scale(1.01); }",
  });
  customCssInput.addEventListener("input", () => {
    effectsEnabled.checked = true;
    effectControls.disabled = false;
    draft.fx ??= defaultEffects();
    const val = customCssInput.value.trim();
    if (val) draft.fx.customCss = val;
    else delete draft.fx.customCss;
    refresh();
  });

  const syncHackerInputs = () => {
    const cv = draft.fx?.customVars ?? {};
    for (const [k, inp] of customVarInputs) {
      inp.value = cv[k] ?? "";
    }
    customCssInput.value = draft.fx?.customCss ?? "";
  };

  const applyHackMutator = (mut) => {
    effectsEnabled.checked = true;
    effectControls.disabled = false;
    draft.dark = mut.dark;
    darkBox.checked = mut.dark;
    draft.colors = { ...draft.colors, ...mut.colors };
    draft.fx = {
      ...defaultEffects(),
      ...(draft.fx ?? {}),
      ...structuredClone(mut.fx),
      ...(mut.customCss ? { customCss: mut.customCss } : {}),
    };
    for (const [key, { picker, text }] of rows) {
      const v = draft.colors[key] ?? "";
      text.removeAttribute("aria-invalid");
      text.value = v;
      if (isHex(v)) picker.value = v;
    }
    for (const read of effectInputs.values()) read();
    syncHackerInputs();
    refresh();
    toast(`Injected hack preset: ${mut.label}`, { kind: "info" });
  };

  const hackerStudio = h("details", { class: "theme-hacker-studio", "data-hacker-studio": "true", open: true },
    h("summary", { class: "theme-hacker-summary" }, "🛠️ Theme Hacker Lab — 1-Click Nostalgia/Storm Mutators, Deep Token Overrides & Custom CSS"),
    h("p", { class: "hint" }, "Hack any premade or custom theme to death! Inject Compiz burning folders, 90s Linux/CDE bevels, green-phosphor CRT shaders, override internal --* design tokens, or write custom CSS rules that travel with your theme when shared."),
    h("div", { class: "theme-preset-strip", role: "group", "aria-label": "1-Click Theme Hacker Mutators" },
      ...THEME_HACK_MUTATORS.map((mut) =>
        h("button", {
          type: "button",
          class: "theme-preset-pill",
          "data-hack-mutate": mut.id,
          "data-hack-mutator": mut.id,
          title: mut.desc,
          onclick: () => applyHackMutator(mut),
        }, mut.label),
      ),
      h("button", {
        type: "button",
        class: "theme-preset-pill",
        "data-hack-mutate": "chaos_hack",
        title: "Randomize colors, multi-layer weather/storm FX, folder shader, and icon pack for a 1-of-a-kind personal creation.",
        onclick: () => {
          const rndMut = THEME_HACK_MUTATORS[Math.floor(Math.random() * THEME_HACK_MUTATORS.length)];
          const rndHue = Math.floor(Math.random() * 360);
          const nextCols = harmonizeFromAccent(hslToHex(rndHue, 90, 60), true);
          applyHackMutator({
            ...rndMut,
            label: "🎲 Chaos Hack",
            colors: nextCols,
            fx: { ...rndMut.fx, glowColor: nextCols.accent, glowColor2: nextCols.secondary },
          });
        },
      }, "🎲 Total Chaos Mutator"),
    ),
    customVarGrid,
    h("div", { class: "theme-hacker-css-wrap" },
      h("div", { class: "theme-pill-row" },
        h("span", { class: "theme-pill-label" }, "💉 Inject CSS Snippet:"),
        ...CUSTOM_CSS_SNIPPETS.map((snip) =>
          h("button", {
            type: "button",
            class: "theme-filter-pill",
            "data-css-snippet": snip.id || snip.label,
            onclick: () => {
              effectsEnabled.checked = true;
              effectControls.disabled = false;
              draft.fx ??= defaultEffects();
              const cur = customCssInput.value.trim();
              customCssInput.value = cur ? `${cur}\n${snip.css}` : snip.css;
              draft.fx.customCss = customCssInput.value;
              refresh();
            },
          }, snip.label),
        ),
      ),
      customCssInput,
    ),
  );

  effectsEnabled.addEventListener("change", () => {
    draft.fx = effectsEnabled.checked ? defaultEffects() : undefined;
    effectControls.disabled = !draft.fx;
    for (const read of effectInputs.values()) read();
    syncHackerInputs();
    refresh();
  });

  const rows = new Map();
  const field = ([key, label, tip]) => {
    const picker = h("input", { type: "color", class: "theme-color", "aria-label": `${label} color picker`, title: tip, value: draft.colors[key] ?? "#808080" });
    const text = h("input", { type: "text", class: "prop-input theme-hex", maxlength: "7", spellcheck: "false", "aria-label": `${label} as a hex code`, title: `${tip} Type a code like #1a2b3c.`, value: draft.colors[key] ?? "" });
    const set = (value) => {
      if (!isHex(value)) { text.setAttribute("aria-invalid", "true"); return; }
      text.removeAttribute("aria-invalid");
      draft.colors[key] = value.toLowerCase();
      picker.value = draft.colors[key];
      text.value = draft.colors[key];
      refresh();
    };
    picker.addEventListener("input", () => set(picker.value));
    text.addEventListener("input", () => { if (isHex(text.value)) set(text.value); else text.setAttribute("aria-invalid", String(text.value !== "")); });
    rows.set(key, { picker, text });
    return h("div", { class: "theme-field" }, h("span", { class: "theme-field-label", title: tip }, label), picker, text);
  };

  const applyColorHarmony = (nextColors, nextDark = draft.dark) => {
    draft.dark = nextDark;
    darkBox.checked = nextDark;
    draft.colors = { ...draft.colors, ...nextColors };
    if (draft.fx) {
      draft.fx.glowColor = draft.colors.accent;
      draft.fx.glowColor2 = draft.colors.secondary || draft.colors.accent;
    }
    for (const [key, { picker, text }] of rows) {
      const v = draft.colors[key] ?? "";
      text.removeAttribute("aria-invalid");
      text.value = v;
      if (isHex(v)) picker.value = v;
    }
    for (const read of effectInputs.values()) read();
    refresh();
  };

  // Wallpaper / Image Chameleon Palette Extractor input
  const imageInput = h("input", {
    type: "file",
    accept: "image/*",
    "data-extract-image-input": "true",
    "aria-label": "Choose an image or wallpaper to extract theme colors from",
    style: "display:none",
  });
  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = 64;
          c.height = 64;
          const ctx2d = c.getContext("2d");
          ctx2d.drawImage(img, 0, 0, 64, 64);
          const pixels = ctx2d.getImageData(0, 0, 64, 64).data;
          const extracted = extractPaletteFromPixels(pixels, { name: file.name.replace(/\.[^.]+$/, "").slice(0, 32) || "Wallpaper Theme" });
          applyColorHarmony(extracted.colors, extracted.dark);
          toast(`Extracted theme palette from "${file.name}"!`, { kind: "success" });
        } catch {
          toast("Could not sample image pixels.", { kind: "error" });
        }
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });

  const harmonyBar = h("div", { class: "theme-harmony-bar", role: "group", "aria-label": "Color harmony tools" },
    h("span", { class: "theme-pill-label" }, "Palette tools:"),
    h("button", {
      type: "button",
      class: "btn",
      "data-harmony": "accent",
      title: "Generate harmonious background, panel, border, text and status colors from your current Accent color.",
      onclick: () => applyColorHarmony(harmonizeFromAccent(draft.colors.accent || "#6ea8ff", darkBox.checked), darkBox.checked),
    }, "🎨 Auto-harmonize from Accent"),
    h("button", {
      type: "button",
      class: "btn",
      "data-harmony": "invert",
      title: "Flip this theme between Dark and Light mode while keeping your Accent color harmony.",
      onclick: () => {
        const nextDark = !darkBox.checked;
        applyColorHarmony(harmonizeFromAccent(draft.colors.accent || "#6ea8ff", nextDark), nextDark);
      },
    }, "🔄 Invert Dark / Light"),
    h("button", {
      type: "button",
      class: "btn",
      "data-harmony": "random",
      title: "Generate a fresh random accent and harmonized color palette.",
      onclick: () => {
        const rndAccent = hslToHex(Math.floor(Math.random() * 360), 82, darkBox.checked ? 62 : 45);
        applyColorHarmony(harmonizeFromAccent(rndAccent, darkBox.checked), darkBox.checked);
      },
    }, "🎲 Randomize palette"),
    h("button", {
      type: "button",
      class: "btn",
      "data-extract-image-btn": "true",
      title: "Pick any wallpaper or image file to automatically extract a matching OKLab theme palette.",
      onclick: () => imageInput.click(),
    }, "🖼️ Extract from Wallpaper…"),
    h("button", {
      type: "button",
      class: "btn",
      "data-editor-paste-theme": "true",
      title: "Paste a CCFM-THEME-v1 code, CCFM-PACK-v1 bundle, CSS, or Theme JSON directly from your clipboard (⌘V / Ctrl+V).",
      onclick: async () => {
        await pasteImportThemesFromClipboard({
          applyFirst: true,
          onImported: (res) => {
            if (res?.first) {
              load({ name: res.first.name, dark: res.first.dark, colors: { ...draft.colors, ...res.first.colors }, fx: res.first.fx, base: res.first.base || "Clipboard Paste", editingId: res.first.id });
            }
          },
        });
      },
    }, "📋 Paste Theme (⌘V)"),
    h("button", {
      type: "button",
      class: "btn",
      "data-editor-copy-share": "true",
      title: "Copy a 1-line CCFM-THEME-v1 share code for the theme you are currently editing to your clipboard.",
      onclick: async (e) => {
        try {
          const currentDraft = { ...draftBody(), name: nameInput.value.trim() || "Untitled" };
          const { shareCode } = await call("themes/custom/export", { theme: currentDraft });
          const ok = await copyToClipboard(shareCode);
          if (ok) {
            flashCopied(e.currentTarget, "✓ Copied Code!");
            toast("Copied 1-line CCFM-THEME-v1 share code to clipboard!", { kind: "success" });
          } else {
            await exportText();
          }
        } catch (err) {
          toast(err?.message || "Could not copy share code.", { kind: "error" });
        }
      },
    }, "📤 Copy Share Code"),
    h("button", {
      type: "button",
      class: "btn",
      "data-editor-save-file": "true",
      title: "Save the current theme as a .theme.json file directly into your active folder.",
      onclick: async (e) => {
        const currentDraft = { ...draftBody(), name: nameInput.value.trim() || "Untitled" };
        const jsonText = JSON.stringify({ format: EXPORT_FORMAT, version: 1, ...currentDraft }, null, 2);
        const slug = (currentDraft.name || "custom-theme").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "custom-theme";
        const saved = await saveThemeFileToFolder({ filename: `${slug}.theme.json`, content: jsonText });
        if (saved) flashCopied(e.currentTarget, "✓ Saved File!");
      },
    }, "💾 Save .theme.json"),
    imageInput,
  );

  const prebuiltPictureStrip = h("div", { class: "theme-preset-strip", role: "group", "aria-label": "Pre-built high-end picture and wallpaper palettes" },
    h("span", { class: "theme-pill-label" }, "🖼️ Pre-Built Studio Pictures & 3D Folders:"),
    ...PREBUILT_WALLPAPER_SCENES.map((scene) =>
      h("button", {
        type: "button",
        class: "theme-preset-pill",
        "data-prebuilt-picture": scene.id,
        title: `Apply pre-built ${scene.label} wallpaper palette + matching 3D Regular Folder & Picture Icon Pack with zero manual setup.`,
        onclick: () => {
          effectsEnabled.checked = true;
          effectControls.disabled = false;
          draft.fx = {
            ...defaultEffects(),
            ...(draft.fx ?? {}),
            ...structuredClone(scene.fx),
          };
          applyColorHarmony(scene.colors, scene.dark);
          syncHackerInputs();
          toast(`Applied pre-built studio picture & 3D folder kit: ${scene.label}`, { kind: "success" });
        },
      }, scene.label),
    ),
  );

  const presetStrip = h("div", { class: "theme-preset-strip", role: "group", "aria-label": "Effect style presets" },
    ...EDITOR_FX_PRESETS.map((preset) =>
      h("button", {
        type: "button",
        class: "theme-preset-pill",
        "data-fx-preset": preset.id,
        title: `Apply ${preset.label} effect settings while keeping your current colors.`,
        onclick: () => {
          effectsEnabled.checked = true;
          effectControls.disabled = false;
          const curAtmo = draft.fx?.atmosphere;
          draft.fx = {
            ...defaultEffects(),
            ...preset.fx,
            glowColor: draft.colors.accent || "#6ea8ff",
            glowColor2: draft.colors.secondary || draft.colors.accent || "#6ea8ff",
            ...(curAtmo && curAtmo !== "none" ? { atmosphere: curAtmo } : {}),
          };
          for (const read of effectInputs.values()) read();
          syncHackerInputs();
          refresh();
        },
      }, preset.label),
    ),
  );

  /** Fills the form from `next` (a theme to start from, or imported text). */
  const load = (next) => {
    draft = next;
    nameInput.value = draft.name;
    darkBox.checked = draft.dark;
    effectsEnabled.checked = !!draft.fx;
    effectControls.disabled = !draft.fx;
    for (const read of effectInputs.values()) read();
    syncHackerInputs();
    for (const [key, { picker, text }] of rows) {
      const v = draft.colors[key] ?? "";
      text.removeAttribute("aria-invalid");
      text.value = v;
      if (isHex(v)) picker.value = v;
    }
    heading.textContent = draft.editingId ? `You are changing your theme "${draft.name}". Save replaces it; Save as a copy keeps it.` : draft.base ? `This is a new theme, started from ${draft.base}.` : "This is a new theme.";
    refresh();
  };

  const contrastBar = h("div", { class: "theme-contrast-inspector", "aria-label": "WCAG contrast ratios" });
  const renderContrast = (items) => {
    if (!Array.isArray(items) || !items.length) {
      contrastBar.replaceChildren();
      return;
    }
    contrastBar.replaceChildren(
      h("span", { class: "theme-contrast-title" }, "WCAG contrast:"),
      ...items.map((item) => {
        const dot = h("span", { class: "theme-contrast-dot" });
        dot.style.background = item.fg;
        dot.style.boxShadow = `inset 0 0 0 2px ${item.bg}`;
        return h("span", {
          class: "theme-contrast-chip",
          title: `${item.label}: ${item.fg} on ${item.bg} — contrast ratio ${item.ratio}:1 (${item.grade})`,
        },
          dot,
          h("span", {}, item.label),
          h("span", { class: "theme-contrast-ratio" }, `${item.ratio}:1`),
          h("span", { class: "theme-contrast-grade", "data-grade": item.grade }, item.grade),
        );
      }),
    );
  };

  const draftBody = () => ({ name: nameInput.value, dark: darkBox.checked, base: draft.base ?? "", colors: draft.colors, ...(draft.fx ? { fx: draft.fx } : {}) });
  const refresh = debounce(async () => {
    if (closed) return;
    const version = ++previewVersion;
    try {
      const { theme } = await call("themes/preview", { theme: { ...draftBody(), name: nameInput.value.trim() || "Untitled" } });
      if (closed || version !== previewVersion) return;
      paint(theme, "preview");
      renderContrast(theme.contrast);
      notes.textContent = theme.notes.join(" ");
      status.hidden = true;
    } catch (err) {
      if (closed || version !== previewVersion) return;
      status.textContent = err instanceof ApiError ? err.message : "That color can't be shown.";
      status.hidden = false;
    }
  }, 120);
  darkBox.addEventListener("change", () => { draft.dark = darkBox.checked; refresh(); });
  nameInput.addEventListener("input", () => { draft.name = nameInput.value; });

  const groups = new Map();
  for (const t of themes) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  startSelect.append(
    h("optgroup", { label: "Plain" }, Object.entries(STANDARD).map(([k, v]) => h("option", { value: k }, v.name))),
    ...[...groups].map(([group, list]) => h("optgroup", { label: group }, list.map((t) => h("option", { value: t.key }, t.name)))),
  );
  startSelect.value = STANDARD[from] || themes.some((t) => t.key === from) ? from : isDark ? "standard-dark" : "standard-light";
  startSelect.addEventListener("change", async () => {
    try {
      load(await loadStart(startSelect.value));
    } catch (err) {
      toast(err?.message || "That theme couldn't be loaded.", { kind: "error" });
    }
  });

  const body = h("div", { class: "theme-editor" },
    heading,
    h("div", { class: "theme-meta" },
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Name"), nameInput),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Start from"), startSelect),
      h("label", { class: "check" }, darkBox, h("span", {}, "This is a dark theme"))),
    harmonyBar,
    prebuiltPictureStrip,
    h("div", { class: "theme-fields" }, FIELDS.map(field)),
    contrastBar,
    h("h3", {}, "Glass, glow, materials and motion"),
    h("p", { class: "hint" }, "Pick a 1-click Effect Style Preset below, or fine-tune every shader, surface material, border, glow, texture and optical effect."),
    presetStrip,
    h("label", { class: "check" }, effectsEnabled, h("span", {}, "Enable visual effects")),
    effectControls,
    hackerStudio,
    h("p", { class: "hint" }, "Opacity affects panels, not text or the native window. The preview raises opacity when needed for readable text. Motion follows your computer's reduced-motion preference."),
    h("div", { class: "theme-sample", "aria-label": "Sample of the colors" },
      h("button", { type: "button", class: "btn primary", tabindex: "-1" }, "Main button"),
      h("button", { type: "button", class: "btn", tabindex: "-1" }, "Button"),
      h("button", { type: "button", class: "btn danger", tabindex: "-1" }, "Delete"),
      h("span", { class: "hint" }, "Sample text in a hint")),
    notes, status,
    h("p", { class: "hint" }, "The whole window shows your colors while you edit. Nothing is kept until you press Save."));
  load(draft);

  // -- the buttons -------------------------------------------------------------------------------------------------
  const currentButtons = () => [
    { label: "Cancel", value: "cancel" },
    { label: "Import…", value: "import" },
    { label: "Export…", value: "export" },
    ...(draft.editingId ? [{ label: "Delete theme", value: "delete", danger: true }, { label: "Save as a copy", value: "copy" }] : []),
    { label: draft.editingId ? "Save" : "Save theme", value: "save", primary: true },
  ];

  // The import and export windows open over this one, so this one is shown again afterwards.
  const run = async () => {
    for (;;) {
      const answer = await openDialog({ title: "Theme editor", wide: true, body, buttons: currentButtons(), initialFocus: nameInput }).result;
      if (answer === "import") { await importText(); continue; }
      if (answer === "export") { await exportText(); continue; }
      if (answer === "delete") { if (await removeTheme()) return; continue; }
      if (answer === "save" || answer === "copy") { if (await save(answer === "copy")) return; continue; }
      return;
    }
  };
  async function save(asCopy) {
    try {
      const res = await call("themes/custom/save", { theme: draftBody(), id: asCopy ? undefined : draft.editingId ?? undefined });
      forgetThemeList();
      await saveSettings({ palette: res.id });
      toast(`Saved the theme "${res.name}".`, { kind: "success" });
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The theme couldn't be saved.", { kind: "error" });
      return false;
    }
  }

  async function removeTheme() {
    if (!(await confirmBox({ title: "Delete this theme?", message: `"${draft.name}" will be deleted for good. Export it first if you may want it back.`, confirmLabel: "Delete theme", danger: true }))) return false;
    try {
      await call("themes/custom/delete", { id: draft.editingId });
      forgetThemeList();
      if (state.settings.palette === draft.editingId) await saveSettings({ palette: "" });
      toast("The theme was deleted.", { kind: "success" });
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The theme couldn't be deleted.", { kind: "error" });
      return false;
    }
  }

  async function exportText() {
    const currentDraft = { ...draftBody(), name: nameInput.value.trim() || "Untitled" };
    const jsonText = JSON.stringify({ format: EXPORT_FORMAT, version: 1, ...currentDraft }, null, 2);
    let currentExt = ".theme.json";
    const box = h("textarea", {
      class: "prop-input theme-export",
      readonly: true,
      rows: "10",
      "aria-label": "The theme as text",
      title: "Copy this text and keep it, or send it to someone. Import… turns it back into a theme.",
      onclick: () => box.select?.(),
    }, jsonText);
    const setActiveTab = (activeBtn, ext) => {
      currentExt = ext;
      for (const b of tabs.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === activeBtn));
    };
    const jsonBtn = h("button", {
      type: "button", class: "btn theme-export-tab", "aria-pressed": "true",
      onclick: () => { setActiveTab(jsonBtn, ".theme.json"); box.value = jsonText; },
    }, "Theme JSON");
    const codeBtn = h("button", {
      type: "button", class: "btn theme-export-tab", "aria-pressed": "false",
      onclick: async () => {
        setActiveTab(codeBtn, ".ccfm.txt");
        try {
          const { shareCode } = await call("themes/custom/export", { theme: currentDraft });
          box.value = shareCode;
        } catch (err) {
          toast(err instanceof ApiError ? err.message : "Couldn't generate share code.", { kind: "error" });
        }
      },
    }, "1-Line Share Code (CCFM-THEME-v1)");
    const cssBtn = h("button", {
      type: "button", class: "btn theme-export-tab", "aria-pressed": "false",
      onclick: async () => {
        setActiveTab(cssBtn, ".theme.css");
        try {
          const { css } = await call("themes/custom/export-css", { theme: currentDraft });
          box.value = css;
        } catch (err) {
          toast(err instanceof ApiError ? err.message : "Couldn't generate CSS variables.", { kind: "error" });
        }
      },
    }, "CSS variables (:root)");
    const packBtn = h("button", {
      type: "button", class: "btn theme-export-tab", "aria-pressed": "false",
      onclick: async () => {
        setActiveTab(packBtn, ".theme-pack.json");
        try {
          const { text } = await call("themes/custom/export-pack", { theme: currentDraft });
          box.value = text;
        } catch (err) {
          toast(err instanceof ApiError ? err.message : "Couldn't export theme pack.", { kind: "error" });
        }
      },
    }, "Theme pack (all my themes)");
    const saveFileBtn = h("button", {
      type: "button",
      class: "btn",
      "data-export-save-file": "true",
      onclick: async () => {
        const slug = (currentDraft.name || "custom-theme").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "custom-theme";
        await saveThemeFileToFolder({ filename: `${slug}${currentExt}`, content: box.value });
      },
    }, "💾 Save to Folder");
    const downloadFileBtn = h("button", {
      type: "button",
      class: "btn",
      "data-export-download-file": "true",
      onclick: () => {
        const slug = (currentDraft.name || "custom-theme").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "custom-theme";
        downloadThemeFileInBrowser(`${slug}${currentExt}`, box.value);
      },
    }, "⬇️ Download File");
    const tabs = h("div", { class: "theme-export-tabs" }, jsonBtn, codeBtn, cssBtn, packBtn, saveFileBtn, downloadFileBtn);
    const d = openDialog({ title: "Export theme", body: [h("p", {}, "Copy this text or 1-line CCFM-THEME-v1 Share Code to share with any user, or save it directly to your folder / download as a file."), tabs, box], buttons: [{ label: "Close", value: false }, { label: "Copy", value: true, primary: true }], initialFocus: box });
    if (await d.result) {
      const ok = await copyToClipboard(box.value);
      if (ok) {
        toast("The theme text was copied.", { kind: "success" });
      } else {
        toast("Couldn't copy. Select the text and copy it yourself.", { kind: "error" });
      }
    }
  }

  async function importText() {
    const box = h("textarea", { class: "prop-input theme-export", rows: "10", "aria-label": "Theme text to import", title: "Paste text or CCFM-THEME-v1 / CCFM-PACK-v1 codes that were made with Export…", placeholder: "Paste one or more CCFM-THEME-v1:... share codes, CCFM-PACK-v1:... bundle codes, CSS, or theme JSON here" });
    const filePicker = h("input", {
      type: "file",
      accept: ".json,.txt,.ccfm,.css,application/json,text/plain,text/css",
      style: "display:none",
    });
    const quickBar = h("div", { class: "theme-export-tabs" },
      filePicker,
      h("button", {
        type: "button",
        class: "btn",
        "data-import-paste-clipboard": "true",
        onclick: async () => {
          const clip = (await readFromClipboard())?.trim();
          if (clip) {
            box.value = clip;
            d.close(true);
            return;
          }
          box.focus();
          toast("Press ⌘V / Ctrl+V in the box below to paste your theme.", { kind: "info" });
        },
      }, "📋 Paste from Clipboard & Import"),
      h("button", {
        type: "button",
        class: "btn",
        "data-import-choose-file": "true",
        onclick: () => filePicker.click(),
      }, "📂 Choose Theme File…"),
    );
    filePicker.addEventListener("change", async () => {
      const f = filePicker.files?.[0];
      if (!f) return;
      try {
        box.value = (await f.text()).trim();
        if (box.value) d.close(true);
      } catch {
        toast("Could not read the selected file.", { kind: "error" });
      }
    });
    const d = openDialog({ title: "Import theme", body: [h("p", {}, "Paste a 1-line CCFM-THEME-v1 share code, a single theme JSON, standalone CSS, or a multi-theme pack — or click a button below to import from your clipboard or a file."), quickBar, box], buttons: [{ label: "Cancel", value: false }, { label: "Use this theme", value: true, primary: true }], initialFocus: box });
    if (!(await d.result)) return;
    const rawText = box.value.trim();
    if (!rawText) return;
    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch { /* may be a CCFM-THEME-v1, CCFM-PACK-v1, or CSS */ }
    const shareCodeCount = [...rawText.matchAll(/CCFM-(?:THEME|PACK)-v1:\s*[A-Za-z0-9+/=_-]+/g)].length;
    const isBulk =
      rawText.includes("CCFM-PACK-v1:") ||
      shareCodeCount > 1 ||
      Array.isArray(parsed) ||
      (parsed && typeof parsed === "object" && parsed.format === "bun-rad-studio-file-manager-theme-pack" && Array.isArray(parsed.themes) && parsed.themes.length > 1);
    if (isBulk) {
      const out = await runBulkThemeImportFlow(box.value, {
        applyFirst: true,
        onImported: (res) => {
          if (res?.first) {
            load({ name: res.first.name, dark: res.first.dark, colors: { ...draft.colors, ...res.first.colors }, fx: res.first.fx, base: res.first.base || "an imported theme pack", editingId: res.first.id });
          }
        },
      });
      if (out?.completed) return;
      return;
    }
    try {
      const { theme } = await call("themes/custom/import", { text: box.value });
      load({ name: theme.name, dark: theme.dark, colors: { ...draft.colors, ...theme.colors }, fx: theme.fx, base: "an imported theme", editingId: null });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That text isn't a theme.", { kind: "error" });
    }
  }

  try {
    await run();
  } finally {
    closed = true;
    // Back to the saved choice: the new theme after Save, otherwise what was chosen before.
    await applyPalette(state.settings.palette || "");
    emit("theme-picker");
  }
}

  on("theme-editor", (detail) => { openEditor(detail ?? {}); });
export const openThemeEditor = openEditor;

