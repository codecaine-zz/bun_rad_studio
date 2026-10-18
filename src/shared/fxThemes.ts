// Futuristic themes plus the `fx` descriptor that turns a theme into a token set for the motion/interaction layer.
// A theme without `fx` produces no fx output at all; see src/shared/fxCss.ts for the CSS and fxPointer.ts for the helper.
import type { SimpleGUITheme } from "../simplegui";
import { buildSemanticPalette, contrastRatio, overridesForTheme, parseColor, toHex } from "./themeSemantic";

export type FxGlow = "none" | "soft" | "neon";
export type FxRadius = "sharp" | "soft" | "round" | "pill";
export type FxBorder = "flat" | "gradient" | "metal";
export type FxMotion = "calm" | "spring" | "snappy";
export type FxMode = "on" | "reduced" | "off";
export type FxAtmosphere = string;

export interface ThemeFx {
    glow: FxGlow;
    glowColor: string;
    glowColor2?: string;
    /** Backdrop blur behind glass surfaces in px, 0 to 32. */
    blur: number;
    /** Surface translucency, 0 (opaque) to 1 (as clear as the contrast floor allows). */
    glass: number;
    /** Film grain over the page, at most 4% opacity. */
    grain: "none" | "subtle";
    /** Scanlines over the page, at most 4% opacity, never intercepting the pointer. */
    scanlines: "none" | "subtle";
    /** Slow drifting highlight on borders and cards. */
    sheen: boolean;
    radius: FxRadius;
    border: FxBorder;
    motion: FxMotion;
    /** Noise texture on glass surfaces. */
    noise?: boolean;
    /** Chromatic-aberration text-shadow on headings only. */
    chromatic?: boolean;
    /** Aurora/nebula backdrop behind the page that drifts slowly. */
    ambient?: boolean;
    /** Glow strength, 0 to 1. Defaults to 1. */
    glowIntensity?: number;
    /** Glass border opacity, 0 to 1. Defaults to the theme's border style. */
    borderOpacity?: number;
    /** Optional weather or particle atmosphere effect. */
    atmosphere?: FxAtmosphere;
}

/** The page-level effects switch: Full = "on", Reduced keeps looks but no motion, Off removes everything. */
export function normalizeFxMode(v: unknown): FxMode {
    const s = String(v ?? "").toLowerCase();
    if (s === "off" || s === "none" || s === "false") return "off";
    if (s === "reduced" || s === "reduce" || s === "calm") return "reduced";
    return "on";
}

type Fx = ThemeFx;
const T = (t: Omit<SimpleGUITheme, "is_dark"> & { is_dark: boolean; fx: Fx }): SimpleGUITheme => t;

export const FX_THEMES: Record<string, SimpleGUITheme> = {
    prism_reactor: T({
        name: "Prism Reactor",
        short_name: "Prism Reactor",
        background_color: "#060918",
        font_color: "#edf8ff",
        accent_color: "#53f4ff",
        secondary_accent: "#ff67d8",
        card_background: "#101a30",
        card_border: "#59759c",
        description: "A cyan reactor core in prismatic glass, magenta edge light, soft round panels and a slow holographic atmosphere",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#53f4ff", glowColor2: "#ff67d8", glowIntensity: 0.8, blur: 28, glass: 0.8, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", borderOpacity: 0.35, motion: "spring", ambient: true, chromatic: true },
    }),
    orbital_ice: T({
        name: "Orbital Ice",
        short_name: "Orbital Ice",
        background_color: "#e8f2fa",
        font_color: "#132b43",
        accent_color: "#165ba3",
        secondary_accent: "#7255a8",
        card_background: "#f7fbff",
        card_border: "#64849e",
        description: "A bright orbital observatory with ice-blue frosted glass, polished metal borders and calm, readable instrumentation",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#165ba3", glowColor2: "#7255a8", glowIntensity: 0.45, blur: 24, glass: 0.7, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", borderOpacity: 0.3, motion: "calm", ambient: true },
    }),
    ember_grid: T({
        name: "Ember Grid",
        short_name: "Ember Grid",
        background_color: "#100905",
        font_color: "#fff0dc",
        accent_color: "#ffb454",
        secondary_accent: "#ff6178",
        card_background: "#24150c",
        card_border: "#98603b",
        description: "An amber command deck with sharp copper edges, low scanlines, restrained glow and fast tactical controls",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ffb454", glowColor2: "#ff6178", glowIntensity: 0.65, blur: 8, glass: 0.25, grain: "subtle", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", borderOpacity: 0.5, motion: "snappy", ambient: true },
    }),
    cyberpunk_hologram: T({
        name: "Cyberpunk Hologram",
        short_name: "Hologram",
        background_color: "#060a14",
        font_color: "#e6f7ff",
        accent_color: "#00e5ff",
        secondary_accent: "#ff4fd8",
        card_background: "#0d1626",
        card_border: "#3d6a91",
        description: "Translucent holographic glass over deep navy with cyan and magenta edge glow, a faint scanline layer and chromatic-aberration headings",
        is_dark: true,
        semantic: { danger: "#ff4d6d", warning: "#ffc233", success: "#2dffa4", info: "#4dc3ff" },
        fx: { glow: "neon", glowColor: "#00e5ff", glowColor2: "#ff4fd8", blur: 16, glass: 0.55, grain: "none", scanlines: "subtle", sheen: true, radius: "soft", border: "gradient", motion: "snappy", chromatic: true, ambient: true },
    }),
    neon_hud: T({
        name: "Neon HUD",
        short_name: "Neon HUD",
        background_color: "#03090c",
        font_color: "#dffff8",
        accent_color: "#19f5d6",
        secondary_accent: "#ff3d8b",
        card_background: "#07171b",
        card_border: "#1f7f80",
        description: "Tactical heads-up display: square corners, teal and magenta edge light, scanlines and instant, snappy motion",
        is_dark: true,
        semantic: { danger: "#ff4466", warning: "#ffd23d", success: "#3dff9a", info: "#3ddcff" },
        fx: { glow: "neon", glowColor: "#19f5d6", glowColor2: "#ff3d8b", blur: 10, glass: 0.45, grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", chromatic: true },
    }),
    quantum_obsidian: T({
        name: "Quantum Obsidian",
        short_name: "Obsidian",
        background_color: "#000000",
        font_color: "#eaf6f4",
        accent_color: "#2dd4bf",
        secondary_accent: "#a78bfa",
        card_background: "#0a0d10",
        card_border: "#4e6569",
        description: "OLED pure black with teal and violet bioluminescent gradients, deep glass and a slow living backdrop",
        is_dark: true,
        semantic: { danger: "#ff6b81", warning: "#fbbf24", success: "#34d399", info: "#60a5fa" },
        fx: { glow: "soft", glowColor: "#2dd4bf", glowColor2: "#a78bfa", blur: 20, glass: 0.6, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "spring", noise: true, ambient: true },
    }),
    deep_space: T({
        name: "Deep Space",
        short_name: "Deep Space",
        background_color: "#05060f",
        font_color: "#e8eaff",
        accent_color: "#a78bfa",
        secondary_accent: "#60a5fa",
        card_background: "#0d1030",
        card_border: "#585ea4",
        description: "Blue-black void with nebula violet light, soft glow and a faint star-grain texture",
        is_dark: true,
        semantic: { danger: "#fb7185", warning: "#fcd34d", success: "#6ee7b7", info: "#7dd3fc" },
        fx: { glow: "soft", glowColor: "#a78bfa", glowColor2: "#60a5fa", blur: 18, glass: 0.5, grain: "subtle", scanlines: "none", sheen: false, radius: "round", border: "gradient", motion: "spring", ambient: true },
    }),
    liquid_metal: T({
        name: "Liquid Metal",
        short_name: "Liquid Metal",
        background_color: "#101214",
        font_color: "#eef1f4",
        accent_color: "#c9d4e0",
        secondary_accent: "#7fb0e0",
        card_background: "#1a1e22",
        card_border: "#656f79",
        description: "Brushed titanium gradients with frosted glass and a fluid sheen that drifts along the metal borders",
        is_dark: true,
        semantic: { danger: "#ff7a7a", warning: "#f5c04a", success: "#5fd38d", info: "#6cb6ff" },
        fx: { glow: "soft", glowColor: "#c9d4e0", glowColor2: "#7fb0e0", blur: 14, glass: 0.35, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "spring", noise: true },
    }),
    titanium_aurora: T({
        name: "Titanium Aurora",
        short_name: "Aurora",
        background_color: "#0b1014",
        font_color: "#e9f1f5",
        accent_color: "#34d399",
        secondary_accent: "#a78bfa",
        card_background: "#141c22",
        card_border: "#576b7a",
        description: "Cool steel surfaces lit by an aurora of green and violet, calm motion and a drifting backdrop",
        is_dark: true,
        semantic: { danger: "#fb7185", warning: "#fbbf24", success: "#4ade80", info: "#67e8f9" },
        fx: { glow: "soft", glowColor: "#34d399", glowColor2: "#a78bfa", blur: 20, glass: 0.5, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "calm", ambient: true },
    }),
    liquid_metal_light: T({
        name: "Liquid Metal Light",
        short_name: "Metal Light",
        background_color: "#e7ebef",
        font_color: "#14181d",
        accent_color: "#2b4a6b",
        secondary_accent: "#5b6b7c",
        card_background: "#f6f8fa",
        card_border: "#79848f",
        description: "Polished brushed-steel light theme: frosted white glass, a deep steel-blue accent and a gentle metal sheen",
        is_dark: false,
        fx: { glow: "none", glowColor: "#2b4a6b", glowColor2: "#7a8a9a", blur: 16, glass: 0.4, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "spring", noise: true },
    }),
    neo_tokyo_dark: T({
        name: "Neo-Tokyo Dark",
        short_name: "Neo-Tokyo",
        background_color: "#0f1021",
        font_color: "#eceaff",
        accent_color: "#ff6ac1",
        secondary_accent: "#2de2c9",
        card_background: "#191a33",
        card_border: "#6466b0",
        description: "Cyber-cool night city in indigo with pink neon and teal highlights, tuned for code",
        is_dark: true,
        semantic: { danger: "#ff5c7a", warning: "#ffcb6b", success: "#2de2c9", info: "#7aa2ff" },
        fx: { glow: "soft", glowColor: "#ff6ac1", glowColor2: "#2de2c9", blur: 12, glass: 0.4, grain: "none", scanlines: "none", sheen: false, radius: "soft", border: "gradient", motion: "snappy" },
    }),
    synthetic_solar: T({
        name: "Synthetic Solar",
        short_name: "Solar",
        background_color: "#140c0a",
        font_color: "#fff1e6",
        accent_color: "#ffb347",
        secondary_accent: "#ff5fa2",
        card_background: "#211410",
        card_border: "#8a604f",
        description: "Cyber-warm: amber and coral light with magenta edges on warm black, with a hint of film grain",
        is_dark: true,
        semantic: { danger: "#ff6b6b", warning: "#ffd166", success: "#8de06b", info: "#6ec1ff" },
        fx: { glow: "soft", glowColor: "#ffb347", glowColor2: "#ff5fa2", blur: 12, glass: 0.4, grain: "subtle", scanlines: "none", sheen: false, radius: "soft", border: "gradient", motion: "snappy", ambient: true },
    }),
    neo_tokyo_day: T({
        name: "Neo-Tokyo Day",
        short_name: "Neo-Tokyo Day",
        background_color: "#f1effa",
        font_color: "#1c1a33",
        accent_color: "#b3135f",
        secondary_accent: "#00796b",
        card_background: "#ffffff",
        card_border: "#8683b8",
        description: "Neo-Tokyo in daylight: lavender paper, deep pink and teal accents with soft frosted glass",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#b3135f", glowColor2: "#4f46e5", blur: 14, glass: 0.35, grain: "none", scanlines: "none", sheen: false, radius: "soft", border: "gradient", motion: "spring" },
    }),
    aurora_glass: T({
        name: "Aurora Glass",
        short_name: "Aurora Glass",
        background_color: "#07131c",
        font_color: "#e6fbf7",
        accent_color: "#5ef2d0",
        secondary_accent: "#7aa8ff",
        card_background: "#0f202b",
        card_border: "#3c7a93",
        description: "Deep-sea glass in mint and periwinkle with heavy blur, a drifting aurora behind it and a slow border sheen",
        is_dark: true,
        semantic: { danger: "#ff7b8b", warning: "#ffd27a", success: "#5ef2a0", info: "#7ad0ff" },
        fx: { glow: "soft", glowColor: "#5ef2d0", glowColor2: "#7aa8ff", blur: 24, glass: 0.62, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "spring", ambient: true },
    }),
    plasma_violet: T({
        name: "Plasma Violet",
        short_name: "Plasma Violet",
        background_color: "#0d0716",
        font_color: "#f3e9ff",
        accent_color: "#d28bff",
        secondary_accent: "#ff6b9d",
        card_background: "#1a1028",
        card_border: "#7e4dba",
        description: "Electric violet plasma with rose edge light, pill-shaped controls and a bold neon glow",
        is_dark: true,
        semantic: { danger: "#ff5c8a", warning: "#ffc861", success: "#5be8a8", info: "#7fb4ff" },
        fx: { glow: "neon", glowColor: "#d28bff", glowColor2: "#ff6b9d", blur: 14, glass: 0.45, grain: "none", scanlines: "none", sheen: true, radius: "pill", border: "gradient", motion: "spring", ambient: true },
    }),
    synthwave_sunset: T({
        name: "Synthwave Sunset",
        short_name: "Synthwave Sunset",
        background_color: "#1a0b2e",
        font_color: "#fdf0ff",
        accent_color: "#ff7edb",
        secondary_accent: "#72f1b8",
        card_background: "#261447",
        card_border: "#9a6fd0",
        description: "Outrun nights: a purple sky, hot pink neon and mint edges with scanlines, chromatic headings and a drifting sunset glow",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ff7edb", glowColor2: "#72f1b8", glowIntensity: 0.85, blur: 14, glass: 0.45, grain: "none", scanlines: "subtle", sheen: true, radius: "soft", border: "gradient", motion: "snappy", ambient: true, chromatic: true },
    }),
    matrix_rain: T({
        name: "Matrix Rain",
        short_name: "Matrix Rain",
        background_color: "#020a04",
        font_color: "#c8ffd4",
        accent_color: "#39ff6a",
        secondary_accent: "#00c8a0",
        card_background: "#071a0c",
        card_border: "#3a9a56",
        description: "A green phosphor terminal: square corners, bright code-green glow, scanlines and film grain over pitch black",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#39ff6a", glowColor2: "#00c8a0", glowIntensity: 0.7, blur: 6, glass: 0.3, grain: "subtle", scanlines: "subtle", sheen: false, radius: "sharp", border: "flat", motion: "snappy", chromatic: true },
    }),
    amber_phosphor: T({
        name: "Amber Phosphor",
        short_name: "Amber Phosphor",
        background_color: "#0e0800",
        font_color: "#ffe2b0",
        accent_color: "#ffb000",
        secondary_accent: "#ff8a2a",
        card_background: "#1c1104",
        card_border: "#9a6c24",
        description: "A warm amber monitor from the 1980s: soft phosphor glow, scanlines and grain, sharp edges and calm motion",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#ffb000", glowColor2: "#ff8a2a", glowIntensity: 0.6, blur: 4, glass: 0.2, grain: "subtle", scanlines: "subtle", sheen: false, radius: "sharp", border: "flat", motion: "calm" },
    }),
    midnight_glass: T({
        name: "Midnight Glass",
        short_name: "Midnight Glass",
        background_color: "#0b0f1a",
        font_color: "#eef2ff",
        accent_color: "#8ab4ff",
        secondary_accent: "#c4a1ff",
        card_background: "#161c2e",
        card_border: "#5d6a8a",
        description: "Pure glassmorphism at night: heavy frosted blur, very clear panels, periwinkle light and a slow drifting glow",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#8ab4ff", glowColor2: "#c4a1ff", glowIntensity: 0.6, blur: 30, glass: 0.8, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", borderOpacity: 0.3, motion: "spring", ambient: true, noise: true },
    }),
    abyss_bloom: T({
        name: "Abyss Bloom",
        short_name: "Abyss Bloom",
        background_color: "#020b12",
        font_color: "#dff9ff",
        accent_color: "#3cf0ff",
        secondary_accent: "#b06bff",
        card_background: "#08202c",
        card_border: "#2f8099",
        description: "Bioluminescent deep sea: cyan and violet creatures glowing through dark water glass, with a slow living backdrop",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#3cf0ff", glowColor2: "#b06bff", glowIntensity: 0.75, blur: 22, glass: 0.6, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "calm", ambient: true },
    }),
    cosmic_nebula: T({
        name: "Cosmic Nebula",
        short_name: "Cosmic Nebula",
        background_color: "#0a0614",
        font_color: "#f1e9ff",
        accent_color: "#ff9ef5",
        secondary_accent: "#7cc4ff",
        card_background: "#170f2a",
        card_border: "#7258aa",
        description: "A pink and blue galaxy: star-grain texture, neon nebula glow, chromatic headings and pill-shaped controls",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ff9ef5", glowColor2: "#7cc4ff", glowIntensity: 0.75, blur: 18, glass: 0.55, grain: "subtle", scanlines: "none", sheen: true, radius: "pill", border: "gradient", motion: "spring", ambient: true, chromatic: true },
    }),
    obsidian_gold: T({
        name: "Obsidian Gold",
        short_name: "Gold",
        background_color: "#0c0a07",
        font_color: "#f7efdc",
        accent_color: "#e6c068",
        secondary_accent: "#d39a62",
        card_background: "#1a160f",
        card_border: "#8f7849",
        description: "Luxury black and gold: polished metal borders, a slow gold sheen, soft warm glow and calm motion",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#e6c068", glowColor2: "#d39a62", glowIntensity: 0.55, blur: 12, glass: 0.35, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "calm", noise: true },
    }),
    crimson_eclipse: T({
        name: "Crimson Eclipse",
        short_name: "Eclipse",
        background_color: "#0e0405",
        font_color: "#ffe6e8",
        accent_color: "#ff5c6c",
        secondary_accent: "#ff9a3d",
        card_background: "#1e0a0d",
        card_border: "#a8505a",
        description: "A blood moon: red and ember neon over black, sharp edges, grain and a dark drifting glow",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ff5c6c", glowColor2: "#ff9a3d", glowIntensity: 0.75, blur: 10, glass: 0.35, grain: "subtle", scanlines: "none", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", ambient: true },
    }),
    acid_reactor: T({
        name: "Acid Reactor",
        short_name: "Acid",
        background_color: "#070a02",
        font_color: "#f2ffd8",
        accent_color: "#b6ff3b",
        secondary_accent: "#3bffd0",
        card_background: "#121a06",
        card_border: "#64922a",
        description: "Toxic lime and aqua neon: a hazard-lab console with scanlines, chromatic headings and fast controls",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#b6ff3b", glowColor2: "#3bffd0", glowIntensity: 0.8, blur: 8, glass: 0.35, grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", chromatic: true },
    }),
    polar_night: T({
        name: "Polar Night",
        short_name: "Polar Night",
        background_color: "#07101a",
        font_color: "#e8f6ff",
        accent_color: "#8fe3ff",
        secondary_accent: "#b9c7ff",
        card_background: "#0f1d2b",
        card_border: "#527a99",
        description: "Arctic night: icy frosted glass, metal borders, a cold blue glow and a slow drifting aurora",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#8fe3ff", glowColor2: "#b9c7ff", glowIntensity: 0.6, blur: 24, glass: 0.65, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "calm", ambient: true },
    }),
    emerald_grove: T({
        name: "Emerald Grove",
        short_name: "Emerald Grove",
        background_color: "#04100b",
        font_color: "#e3fff1",
        accent_color: "#4ff0a0",
        secondary_accent: "#c3f56a",
        card_background: "#0b2019",
        card_border: "#3b8262",
        description: "A glowing forest at night: emerald and lime light, soft textured glass, round corners and gentle motion",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#4ff0a0", glowColor2: "#c3f56a", glowIntensity: 0.6, blur: 16, glass: 0.5, grain: "none", scanlines: "none", sheen: false, radius: "round", border: "gradient", motion: "calm", ambient: true, noise: true },
    }),
    brass_engine: T({
        name: "Brass Engine",
        short_name: "Brass",
        background_color: "#140e08",
        font_color: "#f5e6cc",
        accent_color: "#e0a85a",
        secondary_accent: "#d48a5c",
        card_background: "#22180f",
        card_border: "#937048",
        description: "Steampunk brass and copper: metal borders, film grain, a soft furnace glow and steady, calm motion",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#e0a85a", glowColor2: "#d48a5c", glowIntensity: 0.5, blur: 6, glass: 0.25, grain: "subtle", scanlines: "none", sheen: true, radius: "sharp", border: "metal", motion: "calm" },
    }),
    focus_glow: T({
        name: "Focus Glow",
        short_name: "Focus",
        background_color: "#111318",
        font_color: "#e8eaed",
        accent_color: "#7fb2ff",
        secondary_accent: "#a8c7fa",
        card_background: "#1b1e24",
        card_border: "#6b7284",
        description: "Effects for people who want them quiet: a faint blue glow and light glass, with no moving light, texture or sheen",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#7fb2ff", glowColor2: "#a8c7fa", glowIntensity: 0.3, blur: 10, glass: 0.3, grain: "none", scanlines: "none", sheen: false, radius: "soft", border: "flat", motion: "calm" },
    }),
    neon_max: T({
        name: "Neon Max",
        short_name: "Neon Max",
        background_color: "#000000",
        font_color: "#ffffff",
        accent_color: "#00ffff",
        secondary_accent: "#ff4dff",
        card_background: "#0a0a0a",
        card_border: "#9a9a9a",
        description: "Maximum contrast neon: white text on pure black with full-strength cyan and magenta glow and instant motion",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#00ffff", glowColor2: "#ff4dff", glowIntensity: 1, blur: 0, glass: 0, grain: "none", scanlines: "none", sheen: false, radius: "sharp", border: "gradient", motion: "snappy" },
    }),
    vaporwave_dream: T({
        name: "Vaporwave Dream",
        short_name: "Vaporwave",
        background_color: "#2a1b3d",
        font_color: "#fbe9ff",
        accent_color: "#ff9de2",
        secondary_accent: "#8ef6e4",
        card_background: "#36244f",
        card_border: "#9f7cc9",
        description: "A 90s vaporwave mall: pastel pink and aqua neon on purple, pill controls, grain, scanlines and a dreamy glow",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#ff9de2", glowColor2: "#8ef6e4", glowIntensity: 0.7, blur: 14, glass: 0.45, grain: "subtle", scanlines: "subtle", sheen: true, radius: "pill", border: "gradient", motion: "spring", ambient: true },
    }),
    frosted_glass: T({
        name: "Frosted Glass",
        short_name: "Frosted",
        background_color: "#eef2f8",
        font_color: "#18202e",
        accent_color: "#2457c5",
        secondary_accent: "#7a4fc4",
        card_background: "#ffffff",
        card_border: "#7c8aa3",
        description: "Bright glassmorphism: clear frosted white panels, heavy blur, a blue and violet glow and a soft moving light",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#2457c5", glowColor2: "#7a4fc4", glowIntensity: 0.45, blur: 28, glass: 0.7, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", borderOpacity: 0.35, motion: "spring", ambient: true },
    }),
    sakura_glass: T({
        name: "Sakura Glass",
        short_name: "Sakura",
        background_color: "#fbf0f4",
        font_color: "#2d1a24",
        accent_color: "#b0245e",
        secondary_accent: "#6b4fa8",
        card_background: "#ffffff",
        card_border: "#a37f8e",
        description: "Cherry blossom light: pink frosted glass, a soft petal glow, round corners and a calm drifting light",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#b0245e", glowColor2: "#6b4fa8", glowIntensity: 0.4, blur: 20, glass: 0.6, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "calm", ambient: true },
    }),
    pearl_hologram: T({
        name: "Pearl Hologram",
        short_name: "Pearl",
        background_color: "#f2f0fa",
        font_color: "#1f1c33",
        accent_color: "#6a3fd1",
        secondary_accent: "#00808a",
        card_background: "#fbfaff",
        card_border: "#8a86ad",
        description: "Iridescent pearl: a light holographic theme with violet and teal shimmer, pill controls and a moving sheen",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#6a3fd1", glowColor2: "#00808a", glowIntensity: 0.45, blur: 18, glass: 0.55, grain: "none", scanlines: "none", sheen: true, radius: "pill", border: "gradient", motion: "spring", ambient: true },
    }),
    rose_gold: T({
        name: "Rose Gold",
        short_name: "Rose Gold",
        background_color: "#f8efea",
        font_color: "#2b1c18",
        accent_color: "#9c4a3a",
        secondary_accent: "#8a5a78",
        card_background: "#fffaf7",
        card_border: "#977468",
        description: "Soft rose gold: warm light glass, polished metal borders, a gentle sheen and calm motion",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#9c4a3a", glowColor2: "#c08a6a", glowIntensity: 0.35, blur: 14, glass: 0.45, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "calm", noise: true },
    }),
    daylight_hud: T({
        name: "Daylight HUD",
        short_name: "Day HUD",
        background_color: "#eef5f3",
        font_color: "#0f2420",
        accent_color: "#0b6e5f",
        secondary_accent: "#8a2d6b",
        card_background: "#ffffff",
        card_border: "#6f8f88",
        description: "A light tactical display: sharp corners, crisp teal edge light, faint scanlines and fast motion",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#0b6e5f", glowColor2: "#8a2d6b", glowIntensity: 0.4, blur: 8, glass: 0.3, grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy" },
    }),
};

export const FX_THEME_KEYS: string[] = Object.keys(FX_THEMES);

/** Short, memorable alternative names, resolved by getTheme() like the other theme aliases. */
export const FX_THEME_ALIASES: Record<string, string> = {
    hologram: "cyberpunk_hologram",
    cyberpunk_holo: "cyberpunk_hologram",
    holo: "cyberpunk_hologram",
    rtx_neon: "cyberpunk_hologram",
    hud: "neon_hud",
    directx_hud: "neon_hud",
    obsidian: "quantum_obsidian",
    quantum: "quantum_obsidian",
    oled_obsidian: "quantum_obsidian",
    m4_space_black: "quantum_obsidian",
    space_black_pro: "quantum_obsidian",
    xdr_obsidian: "quantum_obsidian",
    nebula: "deep_space",
    space: "deep_space",
    titanium_metal: "liquid_metal",
    liquid_metal_dark: "liquid_metal",
    m4_max: "liquid_metal",
    aurora: "titanium_aurora",
    m4_pro: "titanium_aurora",
    copilot_pc: "titanium_aurora",
    metal_light: "liquid_metal_light",
    liquid_metal_day: "liquid_metal_light",
    neo_tokyo: "neo_tokyo_dark",
    neotokyo: "neo_tokyo_dark",
    neo_tokyo_night: "neo_tokyo_dark",
    neo_tokyo_light: "neo_tokyo_day",
    solar: "synthetic_solar",
    synthetic_sun: "synthetic_solar",
    glass_aurora: "aurora_glass",
    retina_xdr: "aurora_glass",
    violet_plasma: "plasma_violet",
    tahoe_liquid_glass: "frosted_glass",
    tahoe_dark_glass: "midnight_glass",
    win11_mica_fx: "orbital_ice",
    win11_mica_dark: "polar_night",
    win11_acrylic: "midnight_glass",
    fluent_acrylic: "frosted_glass",
};

/**
 * Maps every futuristic/FX theme key to a lightweight, non-FX theme key with matching dark/light polarity
 * and colour family so low-end, software-rendered, or battery/accessibility-constrained systems can
 * automatically revert to a theme they can render at full frame rate without GPU glass/glow overhead.
 */
export const FX_FALLBACK_THEMES: Record<string, string> = {
    prism_reactor: "tokyo_night",
    orbital_ice: "fluent_light",
    ember_grid: "sunset_orange",
    cyberpunk_hologram: "cyberpunk",
    neon_hud: "midnight",
    quantum_obsidian: "oled_black",
    deep_space: "abyss",
    liquid_metal: "titanium_slate",
    titanium_aurora: "tokyo_night",
    liquid_metal_light: "apple_light",
    neo_tokyo_dark: "tokyo_night",
    synthetic_solar: "ventura_amber",
    neo_tokyo_day: "nordic_paper",
    aurora_glass: "nord",
    plasma_violet: "dracula",
    synthwave_sunset: "synthwave84",
    matrix_rain: "matrix_phosphor",
    amber_phosphor: "amber_crt",
    midnight_glass: "apple_dark",
    abyss_bloom: "abyss",
    cosmic_nebula: "amethyst",
    obsidian_gold: "oled_black",
    crimson_eclipse: "rose_pine",
    acid_reactor: "emerald",
    polar_night: "nord",
    emerald_grove: "sonoma_emerald",
    brass_engine: "kanagawa",
    focus_glow: "midnight",
    neon_max: "cyberpunk",
    vaporwave_dream: "synthwave84",
    frosted_glass: "apple_light",
    sakura_glass: "soft_pastel",
    pearl_hologram: "fluent_light",
    rose_gold: "solarized_light",
    daylight_hud: "github_light",
};

const keyOf = (s: string) => s.toLowerCase().trim().replace(/[\s\-_]+/g, "_");

/** Finds an fx theme by key, display name, short name or alias. Returns undefined for every other theme. */
export function findFxTheme(nameOrKey: string | undefined | null): SimpleGUITheme | undefined {
    if (!nameOrKey) return undefined;
    const key = keyOf(String(nameOrKey));
    if (FX_THEMES[key]) return FX_THEMES[key];
    const aliased = FX_THEME_ALIASES[key];
    if (aliased && FX_THEMES[aliased]) return FX_THEMES[aliased];
    for (const t of Object.values(FX_THEMES)) {
        if (keyOf(t.name) === key || (t.short_name && keyOf(t.short_name) === key)) return t;
    }
    return undefined;
}

/** Resolves any FX theme key, alias, or display name to its canonical FX key, or undefined if not an FX theme. */
export function resolveFxThemeKey(nameOrKey: string | undefined | null): string | undefined {
    if (!nameOrKey) return undefined;
    const key = keyOf(String(nameOrKey));
    if (FX_THEMES[key]) return key;
    const aliased = FX_THEME_ALIASES[key];
    if (aliased && FX_THEMES[aliased]) return aliased;
    for (const [k, t] of Object.entries(FX_THEMES)) {
        if (keyOf(t.name) === key || (t.short_name && keyOf(t.short_name) === key)) return k;
    }
    return undefined;
}

/** Returns the lightweight non-FX fallback theme key for an FX theme, or the normalized input key if already non-FX. */
export function getFallbackThemeKey(nameOrKey: string | undefined | null): string {
    if (!nameOrKey) return "midnight";
    const fxKey = resolveFxThemeKey(nameOrKey);
    if (fxKey && FX_FALLBACK_THEMES[fxKey]) return FX_FALLBACK_THEMES[fxKey];
    return keyOf(String(nameOrKey));
}

export type FxHardwareTier = "ultra" | "high" | "balanced" | "low";
export type FxNativeBackdrop = "vibrancy" | "mica-alt" | "acrylic" | "none";

export interface FxHardwareInput {
    /** Logical CPU core count (`navigator.hardwareConcurrency`). */
    cores?: number;
    /** Approximate RAM in GB (`navigator.deviceMemory`). */
    memoryGb?: number;
    /** Device pixel ratio (`window.devicePixelRatio`). */
    devicePixelRatio?: number;
    /** GPU renderer string (e.g. `"Apple M4 Max"`, `"NVIDIA GeForce RTX 4090"`, `"Microsoft Basic Render Driver"`). */
    gpuRenderer?: string;
    /** User agent or platform string. */
    userAgent?: string;
    /** OS platform (`"darwin"`, `"win32"`, `"linux"`). */
    platform?: string;
    /** Display-P3 wide color gamut support (`matchMedia("(color-gamut: p3)")`). */
    colorGamutP3?: boolean;
    /** High Dynamic Range / XDR / Windows Auto HDR support (`matchMedia("(dynamic-range: high)")`). */
    hdrDynamicRange?: boolean;
    /** OS/browser reduced motion preference (`matchMedia("(prefers-reduced-motion: reduce)")`). */
    prefersReducedMotion?: boolean;
    /** OS/browser reduced transparency preference (`matchMedia("(prefers-reduced-transparency: reduce)")`). */
    prefersReducedTransparency?: boolean;
    /** Windows High Contrast / forced-colors active (`matchMedia("(forced-colors: active)")`). */
    forcedColors?: boolean;
    /** Windows Remote Desktop (RDP) / Terminal Services session (`GetSystemMetrics(SM_REMOTESESSION)`). */
    remoteSession?: boolean;
    /** Network/battery data-saver hint (`navigator.connection?.saveData`). */
    saveData?: boolean;
    /** Measured frame delta in ms when a runtime frame-budget monitor is active. */
    frameBudgetMs?: number;
}

export interface FxHardwareProfile {
    tier: FxHardwareTier;
    recommendedFxMode: FxMode;
    shouldUseFallbackTheme: boolean;
    supportsP3: boolean;
    supportsHdr: boolean;
    supportsBackdropBlur: boolean;
    supportsPointerGlow: boolean;
    supportsProMotion: boolean;
    isAppleSiliconPro: boolean;
    isWindowsHighEnd: boolean;
    nativeBackdrop: FxNativeBackdrop;
    reason: string;
}

const SOFTWARE_GPU_RE =
    /swiftshader|llvmpipe|softpipe|software|basic render driver|microsoft basic|\bwarp\b|d3d11 warp|gdi generic|hyper-v|rdpudd|citrix|virtualbox|vmware|parallels|qemu/i;
const APPLE_SILICON_RE = /apple\s+m[1-9](\s+(pro|max|ultra))?|macintosh.*arm64/i;
const WINDOWS_HIGH_END_GPU_RE =
    /rtx\s*[345]\d{2,3}|radeon\s+rx\s+[6789]\d{2,3}|intel.*arc\s+[ab]\d{3}|adreno\s+x1|snapdragon\s+x/i;

/**
 * Evaluates system capability across macOS (M4 Pro/Max, Liquid Retina XDR) and Windows 11/10 (DirectX 12 RTX/Radeon/Arc,
 * DWM Mica/Acrylic, Windows HDR, or fallback cases like Microsoft Basic Render Driver, WARP, Remote Desktop, and High Contrast).
 */
export function detectThemeHardware(input: FxHardwareInput = {}): FxHardwareProfile {
    const nav: any = typeof globalThis !== "undefined" ? (globalThis as any).navigator : undefined;
    const win: any = typeof globalThis !== "undefined" ? (globalThis as any).window : undefined;
    const mm = (q: string): boolean => {
        try {
            if (typeof win?.matchMedia === "function") return Boolean(win.matchMedia(q)?.matches);
            if (typeof (globalThis as any).matchMedia === "function") return Boolean((globalThis as any).matchMedia(q)?.matches);
        } catch {}
        return false;
    };

    const cores = input.cores ?? (typeof nav?.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 8);
    const memoryGb = input.memoryGb ?? (typeof nav?.deviceMemory === "number" ? nav.deviceMemory : undefined);
    const dpr = input.devicePixelRatio ?? (typeof win?.devicePixelRatio === "number" ? win.devicePixelRatio : 1);
    const gpu = input.gpuRenderer ?? "";
    const ua = input.userAgent ?? (typeof nav?.userAgent === "string" ? nav.userAgent : "");
    const plat = (input.platform ?? (typeof nav?.platform === "string" ? nav.platform : typeof process !== "undefined" ? process.platform : "")).toLowerCase();
    const isWin = plat.includes("win") || /windows/i.test(ua);
    const isMac = plat.includes("mac") || plat.includes("darwin") || /macintosh|mac os x/i.test(ua);

    const p3 = input.colorGamutP3 ?? mm("(color-gamut: p3)");
    const hdr = input.hdrDynamicRange ?? mm("(dynamic-range: high)");
    const reducedMotion = input.prefersReducedMotion ?? mm("(prefers-reduced-motion: reduce)");
    const reducedTransparency = input.prefersReducedTransparency ?? mm("(prefers-reduced-transparency: reduce)");
    const forcedColors = input.forcedColors ?? mm("(forced-colors: active)");
    const remoteSession = Boolean(input.remoteSession);
    const saveData = input.saveData ?? Boolean(nav?.connection?.saveData);
    const frameMs = input.frameBudgetMs;

    const isSoftwareGpu = gpu.length > 0 && SOFTWARE_GPU_RE.test(gpu);
    const isLowMemory = memoryGb !== undefined && memoryGb <= 2;
    const isLowCores = cores > 0 && cores <= 2;
    const isFrameStarved = frameMs !== undefined && frameMs > 36;

    if (forcedColors || remoteSession || isSoftwareGpu || isLowMemory || isLowCores || saveData || reducedTransparency || isFrameStarved) {
        const reason = forcedColors
            ? "windows-forced-colors"
            : remoteSession
              ? "windows-remote-session"
              : isSoftwareGpu
                ? "software-gpu"
                : reducedTransparency
                  ? "prefers-reduced-transparency"
                  : isFrameStarved
                    ? "frame-budget-exceeded"
                    : isLowCores || isLowMemory
                      ? "low-hardware-resources"
                      : "save-data";
        return {
            tier: "low",
            recommendedFxMode: forcedColors || remoteSession || isSoftwareGpu || (reducedMotion && reducedTransparency) ? "off" : "reduced",
            shouldUseFallbackTheme: true,
            supportsP3: false,
            supportsHdr: false,
            supportsBackdropBlur: false,
            supportsPointerGlow: false,
            supportsProMotion: false,
            isAppleSiliconPro: false,
            isWindowsHighEnd: false,
            nativeBackdrop: "none",
            reason,
        };
    }

    if (reducedMotion) {
        return {
            tier: "balanced",
            recommendedFxMode: "reduced",
            shouldUseFallbackTheme: false,
            supportsP3: p3,
            supportsHdr: hdr,
            supportsBackdropBlur: true,
            supportsPointerGlow: false,
            supportsProMotion: false,
            isAppleSiliconPro: false,
            isWindowsHighEnd: false,
            nativeBackdrop: isMac ? "vibrancy" : isWin ? "mica-alt" : "none",
            reason: "prefers-reduced-motion",
        };
    }

    const isAppleSiliconPro =
        APPLE_SILICON_RE.test(`${gpu} ${ua}`) ||
        (isMac && p3 && hdr && cores >= 8 && dpr >= 2);
    const isWindowsHighEnd =
        WINDOWS_HIGH_END_GPU_RE.test(gpu) ||
        (isWin && (hdr || p3) && cores >= 8);

    if (isAppleSiliconPro || isWindowsHighEnd || (p3 && hdr && cores >= 8)) {
        return {
            tier: "ultra",
            recommendedFxMode: "on",
            shouldUseFallbackTheme: false,
            supportsP3: p3 || isAppleSiliconPro,
            supportsHdr: hdr || isAppleSiliconPro,
            supportsBackdropBlur: true,
            supportsPointerGlow: true,
            supportsProMotion: true,
            isAppleSiliconPro,
            isWindowsHighEnd,
            nativeBackdrop: isMac || isAppleSiliconPro ? "vibrancy" : isWin || isWindowsHighEnd ? "acrylic" : "none",
            reason: isAppleSiliconPro
                ? "apple-silicon-xdr"
                : isWindowsHighEnd
                  ? "windows-directx-ultra"
                  : "wide-gamut-hdr-high-core",
        };
    }

    if (cores >= 8 || p3 || dpr >= 2) {
        return {
            tier: "high",
            recommendedFxMode: "on",
            shouldUseFallbackTheme: false,
            supportsP3: p3,
            supportsHdr: hdr,
            supportsBackdropBlur: true,
            supportsPointerGlow: true,
            supportsProMotion: dpr >= 1.25 && cores >= 8,
            isAppleSiliconPro: false,
            isWindowsHighEnd: false,
            nativeBackdrop: isMac ? "vibrancy" : isWin ? "mica-alt" : "none",
            reason: "capable-gpu",
        };
    }

    return {
        tier: "balanced",
        recommendedFxMode: "on",
        shouldUseFallbackTheme: false,
        supportsP3: p3,
        supportsHdr: hdr,
        supportsBackdropBlur: true,
        supportsPointerGlow: cores >= 4,
        supportsProMotion: false,
        isAppleSiliconPro: false,
        isWindowsHighEnd: false,
        nativeBackdrop: isMac ? "vibrancy" : isWin ? "mica-alt" : "none",
        reason: "standard-hardware",
    };
}

export interface HardwareResolvedTheme<T extends SimpleGUITheme = SimpleGUITheme> {
    theme: T;
    requestedKey: string;
    appliedKey: string;
    fallbackKey: string;
    downgraded: boolean;
    revertedToFallback: boolean;
    fxMode: FxMode;
    hardware: FxHardwareProfile;
}

/**
 * Resolves a theme by name/key and automatically downgrades or reverts to a lightweight non-FX fallback
 * theme when the system cannot sustain glassmorphism, multi-stop blurs, or ambient shader layers.
 */
export function resolveThemeForHardware<T extends SimpleGUITheme = SimpleGUITheme>(
    nameOrKey: string,
    lookupTheme: (key: string) => T,
    hw?: FxHardwareInput,
    opts?: { revertToFallbackTheme?: boolean }
): HardwareResolvedTheme<T> {
    const requestedKey = keyOf(nameOrKey || "midnight");
    const requestedTheme = lookupTheme(nameOrKey);
    const fallbackKey = getFallbackThemeKey(nameOrKey);
    const hardware = detectThemeHardware(hw);
    const revert = opts?.revertToFallbackTheme !== false;

    if (requestedTheme?.fx && hardware.shouldUseFallbackTheme) {
        if (revert && fallbackKey !== requestedKey) {
            const fbTheme = lookupTheme(fallbackKey);
            return {
                theme: fbTheme,
                requestedKey,
                appliedKey: fallbackKey,
                fallbackKey,
                downgraded: true,
                revertedToFallback: true,
                fxMode: hardware.recommendedFxMode,
                hardware,
            };
        }
        return {
            theme: requestedTheme,
            requestedKey,
            appliedKey: resolveFxThemeKey(nameOrKey) ?? requestedKey,
            fallbackKey,
            downgraded: true,
            revertedToFallback: false,
            fxMode: hardware.recommendedFxMode,
            hardware,
        };
    }

    return {
        theme: requestedTheme,
        requestedKey,
        appliedKey: resolveFxThemeKey(nameOrKey) ?? requestedKey,
        fallbackKey,
        downgraded: hardware.recommendedFxMode !== "on" && Boolean(requestedTheme?.fx),
        revertedToFallback: false,
        fxMode: hardware.recommendedFxMode,
        hardware,
    };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------------------------------------------------

type RGB = [number, number, number];
const rgba = (hex: string, a: number) => {
    const [r, g, b] = parseColor(hex);
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
};
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Converts an sRGB hex color into a CSS Color 4 `color(display-p3 r g b)` value with a controlled chroma expansion
 * along the dominant channels so wide-gamut Liquid Retina XDR / Display-P3 panels unlock deeper neon and aurora
 * primaries while standard sRGB panels ignore the `@media (color-gamut: p3)` override.
 */
export function srgbToDisplayP3(hex: string, boost = 0.14): string {
    const [r8, g8, b8] = parseColor(hex);
    const r = r8 / 255;
    const g = g8 / 255;
    const b = b8 / 255;
    const avg = (r + g + b) / 3;
    const k = clamp(boost, 0, 0.35);
    const rp = clamp(r + (r - avg) * k, 0, 1);
    const gp = clamp(g + (g - avg) * k, 0, 1);
    const bp = clamp(b + (b - avg) * k, 0, 1);
    const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
    return `color(display-p3 ${fmt(rp)} ${fmt(gp)} ${fmt(bp)})`;
}

const RADII: Record<FxRadius, [number, number, number, number, number, number]> = {
    sharp: [1, 2, 3, 4, 6, 6],
    soft: [3, 6, 8, 12, 16, 999],
    round: [4, 8, 12, 18, 26, 999],
    pill: [6, 12, 18, 24, 34, 9999],
};

const MOTION: Record<FxMotion, { instant: number; fast: number; base: number; slow: number; ambient: number; stagger: number; hover: number; press: number; ease: string }> = {
    calm: { instant: 80, fast: 180, base: 320, slow: 560, ambient: 12000, stagger: 45, hover: 1.01, press: 0.99, ease: "cubic-bezier(0.4, 0, 0.2, 1)" },
    spring: { instant: 70, fast: 150, base: 280, slow: 500, ambient: 9000, stagger: 50, hover: 1.02, press: 0.98, ease: "cubic-bezier(0.16, 1, 0.3, 1)" },
    snappy: { instant: 50, fast: 100, base: 180, slow: 320, ambient: 6000, stagger: 28, hover: 1.03, press: 0.97, ease: "cubic-bezier(0.22, 1, 0.36, 1)" },
};

export interface GlassReport {
    /** Opacity of the glass fill after the contrast floor was applied. */
    alpha: number;
    /** The opacity the theme asked for. */
    requestedAlpha: number;
    /** Lowest text contrast over a black or a white page behind the glass. */
    worstContrast: number;
}

const over = (fill: RGB, alpha: number, under: RGB): RGB => mixRgb(under, fill, alpha);

/**
 * Text on glass is judged against the worst thing that can sit behind it, pure white or pure black, so the fill gets
 * opaque enough that body text stays at 4.5:1 whatever the backdrop is.
 */
export function glassReport(t: Pick<SimpleGUITheme, "font_color" | "card_background" | "background_color" | "is_dark"> & { fx: ThemeFx }): GlassReport {
    const card = parseColor(t.card_background ?? t.background_color);
    const requested = Math.round(clamp(1 - clamp(t.fx.glass, 0, 1) * 0.6, 0.4, 1) * 100) / 100;
    const worst = (a: number) => Math.min(contrastRatio(t.font_color, toHex(over(card, a, [0, 0, 0]))), contrastRatio(t.font_color, toHex(over(card, a, [255, 255, 255]))));
    let alpha = requested;
    while (alpha < 1 && worst(alpha) < 4.5) alpha = Math.round((alpha + 0.01) * 100) / 100;
    return { alpha, requestedAlpha: requested, worstContrast: worst(alpha) };
}

function shadowStack(isDark: boolean, tint: string): string[] {
    const k = isDark ? 1 : 0.55;
    const tintA = isDark ? 0.0 : 0.06;
    const layer = (y: number, blur: number, a: number, spread = 0) => `0 ${y}px ${blur}px ${spread}px rgba(0, 0, 0, ${Math.round(a * k * 1000) / 1000})`;
    const t = tintA ? `, 0 ${6}px ${24}px ${rgba(tint, tintA)}` : "";
    return [
        `${layer(1, 2, 0.3)}, ${layer(1, 1, 0.2)}`,
        `${layer(2, 4, 0.28)}, ${layer(4, 10, 0.22)}${t}`,
        `${layer(4, 8, 0.26)}, ${layer(10, 22, 0.24)}, ${layer(2, 3, 0.18)}${t}`,
        `${layer(8, 14, 0.26)}, ${layer(18, 36, 0.26)}, ${layer(30, 64, 0.2)}${t}`,
        `${layer(12, 22, 0.28)}, ${layer(28, 52, 0.28)}, ${layer(48, 96, 0.24)}${t}`,
    ];
}

/** Color of the focus ring: the accent, moved toward white or black only if it does not reach 3:1 on both surfaces. */
export function focusRingColor(t: { accent_color: string; background_color: string; card_background?: string; is_dark: boolean }): string {
    const surfaces = [t.background_color, t.card_background ?? t.background_color];
    const base = parseColor(t.accent_color);
    for (let i = 0; i <= 20; i++) {
        const c = toHex(mixRgb(base, t.is_dark ? [255, 255, 255] : [0, 0, 0], i * 0.05));
        if (surfaces.every((s) => contrastRatio(c, s) >= 3)) return c;
    }
    return t.is_dark ? "#ffffff" : "#000000";
}

export const FX_TOKEN_NAMES = [
    "--fx-glow-color", "--fx-glow-color-2", "--fx-glow-p3", "--fx-glow-2-p3", "--fx-accent-p3",
    "--fx-glow-soft", "--fx-glow-med", "--fx-glow-strong", "--fx-specular-rim",
    "--fx-blur-sm", "--fx-blur-md", "--fx-blur-lg", "--fx-blur-ultra", "--fx-glass-bg", "--fx-glass-bg-strong", "--fx-glass-solid", "--fx-glass-border", "--fx-glass-alpha", "--fx-saturate", "--fx-saturate-ultra",
    "--fx-radius-xs", "--fx-radius-sm", "--fx-radius-md", "--fx-radius-lg", "--fx-radius-xl", "--fx-radius-pill",
    "--fx-shadow-1", "--fx-shadow-2", "--fx-shadow-3", "--fx-shadow-4", "--fx-shadow-5",
    "--fx-border-gradient", "--fx-sheen", "--fx-row-hover", "--fx-accent-soft",
    "--fx-ease-spring", "--fx-ease-out", "--fx-ease-in-out", "--fx-ease-bounce", "--fx-ease",
    "--fx-dur-instant", "--fx-dur-fast", "--fx-dur-base", "--fx-dur-slow", "--fx-dur-ambient", "--fx-stagger",
    "--fx-hover-scale", "--fx-press-scale",
    "--fx-focus-color", "--fx-on-accent", "--fx-focus-ring", "--fx-focus-offset", "--fx-focus-halo",
    "--fx-scanline-opacity", "--fx-grain-opacity", "--fx-ca-1", "--fx-ca-2", "--fx-ambient-1", "--fx-ambient-2",
    "--fx-pointer-x", "--fx-pointer-y", "--fx-pointer-size",
] as const;

const NOISE_URI =
    "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0.14 0 0 0 -0.03'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** The per-theme custom properties (`--fx-*`) as CSS declarations; empty for a theme without `fx`. */
export function fxCssVars(theme: SimpleGUITheme | undefined | null): string {
    const fx = theme?.fx;
    if (!theme || !fx) return "";
    const isDark = theme.is_dark;
    const g1 = fx.glowColor;
    const g2 = fx.glowColor2 ?? fx.glowColor;
    const card = theme.card_background ?? theme.background_color;
    const glass = glassReport({ ...theme, fx });
    const blur = clamp(Math.round(fx.blur), 0, 32);
    const rad = RADII[fx.radius];
    const mo = MOTION[fx.motion];
    const none = "0 0 0 0 rgba(0, 0, 0, 0)";
    const intensity = clamp(fx.glowIntensity ?? 1, 0, 1);
    const glowRgba = (color: string, alpha: number) => rgba(color, alpha * intensity);
    const neon = fx.glow === "neon";
    const glowSoft = fx.glow === "none" ? none : `0 0 0 1px ${glowRgba(g1, neon ? 0.35 : 0.22)}, 0 0 ${neon ? 14 : 10}px ${glowRgba(g1, neon ? 0.38 : 0.22)}`;
    const glowMed = fx.glow === "none" ? none : `0 0 0 1px ${glowRgba(g1, neon ? 0.55 : 0.34)}, 0 0 ${neon ? 22 : 16}px ${glowRgba(g1, neon ? 0.5 : 0.32)}, 0 0 ${neon ? 48 : 32}px ${glowRgba(g2, neon ? 0.26 : 0.14)}`;
    const glowStrong = fx.glow === "none" ? none : `0 0 0 1px ${glowRgba(g1, neon ? 0.8 : 0.5)}, 0 0 ${neon ? 30 : 22}px ${glowRgba(g1, neon ? 0.68 : 0.42)}, 0 0 ${neon ? 72 : 48}px ${glowRgba(g2, neon ? 0.4 : 0.2)}`;
    const specularRim = isDark
        ? "inset 0 1px 0 0 rgba(255, 255, 255, 0.38), inset 0 0 0 0.5px rgba(255, 255, 255, 0.2)"
        : "inset 0 1px 0 0 rgba(255, 255, 255, 0.92), inset 0 0 0 0.5px rgba(255, 255, 255, 0.55)";
    const borderGradient =
        fx.border === "flat"
            ? `linear-gradient(${theme.card_border ?? g1}, ${theme.card_border ?? g1})`
            : fx.border === "metal"
              ? isDark
                  ? "linear-gradient(135deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.08) 28%, rgba(255, 255, 255, 0.4) 52%, rgba(255, 255, 255, 0.06) 78%, rgba(255, 255, 255, 0.5))"
                  : "linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(60, 72, 84, 0.3) 28%, rgba(255, 255, 255, 0.8) 52%, rgba(60, 72, 84, 0.26) 78%, rgba(255, 255, 255, 0.9))"
              : `linear-gradient(135deg, ${rgba(g1, 0.9)}, ${rgba(g2, 0.45)} 48%, ${rgba(g2, 0.9)})`;
    const sheen = isDark
        ? `linear-gradient(115deg, transparent 38%, ${rgba(g1, 0.16)} 50%, transparent 62%)`
        : `linear-gradient(115deg, transparent 38%, rgba(255, 255, 255, 0.7) 50%, transparent 62%)`;
    const focus = focusRingColor({ accent_color: theme.accent_color, background_color: theme.background_color, card_background: card, is_dark: isDark });
    const sh = shadowStack(isDark, g1);
    const borderAlpha = clamp(fx.borderOpacity ?? (isDark ? (fx.border === "metal" ? 0.2 : 0.13) : (fx.border === "metal" ? 0.22 : 0.16)), 0, 1);
    const glassBorder = isDark ? `rgba(255, 255, 255, ${borderAlpha})` : `rgba(20, 30, 40, ${borderAlpha})`;
    const vars: Array<[string, string]> = [
        ["--fx-glow-color", g1],
        ["--fx-glow-color-2", g2],
        ["--fx-glow-p3", srgbToDisplayP3(g1, neon ? 0.18 : 0.12)],
        ["--fx-glow-2-p3", srgbToDisplayP3(g2, neon ? 0.18 : 0.12)],
        ["--fx-accent-p3", srgbToDisplayP3(theme.accent_color, 0.14)],
        ["--fx-glow-soft", glowSoft],
        ["--fx-glow-med", glowMed],
        ["--fx-glow-strong", glowStrong],
        ["--fx-specular-rim", specularRim],
        ["--fx-blur-sm", `${Math.round(blur * 0.4)}px`],
        ["--fx-blur-md", `${blur}px`],
        ["--fx-blur-lg", `${Math.min(40, Math.round(blur * 1.6))}px`],
        ["--fx-blur-ultra", `${Math.min(48, Math.round(blur * 1.45))}px`],
        ["--fx-glass-bg", rgba(card, glass.alpha)],
        ["--fx-glass-bg-strong", rgba(card, Math.min(1, glass.alpha + 0.12))],
        ["--fx-glass-solid", toHex(parseColor(card))],
        ["--fx-glass-border", glassBorder],
        ["--fx-glass-alpha", String(glass.alpha)],
        ["--fx-saturate", fx.glass > 0.3 ? "1.35" : "1.1"],
        ["--fx-saturate-ultra", fx.glass > 0.3 ? "1.65" : "1.28"],
        ["--fx-radius-xs", `${rad[0]}px`],
        ["--fx-radius-sm", `${rad[1]}px`],
        ["--fx-radius-md", `${rad[2]}px`],
        ["--fx-radius-lg", `${rad[3]}px`],
        ["--fx-radius-xl", `${rad[4]}px`],
        ["--fx-radius-pill", `${rad[5]}px`],
        ...sh.map((s, i): [string, string] => [`--fx-shadow-${i + 1}`, s]),
        ["--fx-border-gradient", borderGradient],
        ["--fx-sheen", sheen],
        ["--fx-row-hover", rgba(g1, isDark ? 0.1 : 0.08)],
        ["--fx-accent-soft", rgba(theme.accent_color, isDark ? 0.18 : 0.12)],
        ["--fx-ease-spring", "cubic-bezier(0.16, 1, 0.3, 1)"],
        ["--fx-ease-out", "cubic-bezier(0.22, 1, 0.36, 1)"],
        ["--fx-ease-in-out", "cubic-bezier(0.65, 0, 0.35, 1)"],
        ["--fx-ease-bounce", "cubic-bezier(0.34, 1.56, 0.64, 1)"],
        ["--fx-ease", mo.ease],
        ["--fx-dur-instant", `${mo.instant}ms`],
        ["--fx-dur-fast", `${mo.fast}ms`],
        ["--fx-dur-base", `${mo.base}ms`],
        ["--fx-dur-slow", `${mo.slow}ms`],
        ["--fx-dur-ambient", `${mo.ambient}ms`],
        ["--fx-stagger", `${mo.stagger}ms`],
        ["--fx-hover-scale", String(mo.hover)],
        ["--fx-press-scale", String(mo.press)],
        ["--fx-focus-color", focus],
        ["--fx-on-accent", contrastRatio(theme.accent_color, "#ffffff") >= contrastRatio(theme.accent_color, "#0b0b0f") ? "#ffffff" : "#0b0b0f"],
        ["--fx-focus-ring", `2px solid ${focus}`],
        ["--fx-focus-offset", "2px"],
        ["--fx-focus-halo", `0 0 0 4px ${rgba(focus, 0.28)}`],
        ["--fx-scanline-opacity", fx.scanlines === "subtle" ? "0.035" : "0"],
        ["--fx-grain-opacity", fx.grain === "subtle" ? "0.035" : "0"],
        ["--fx-ca-1", rgba(g2, 0.6)],
        ["--fx-ca-2", rgba(g1, 0.6)],
        ["--fx-ambient-1", rgba(g1, isDark ? 0.2 : 0.14)],
        ["--fx-ambient-2", rgba(g2, isDark ? 0.17 : 0.1)],
        ["--fx-pointer-x", "50%"],
        ["--fx-pointer-y", "50%"],
        ["--fx-pointer-size", "180px"],
        ["--fx-noise", NOISE_URI],
    ];
    return vars.map(([k, v]) => `${k}: ${v};`).join(" ");
}

/** Attributes for the root element: `data-fx` plus one flag per feature, so the shared CSS can switch each one on or off. */
export function fxRootAttrs(theme: SimpleGUITheme | undefined | null, mode: FxMode = "on", tier?: FxHardwareTier): Record<string, string> {
    const fx = theme?.fx;
    if (!fx) return {};
    const a: Record<string, string> = { "data-fx": mode };
    if (tier) a["data-fx-tier"] = tier;
    a["data-fx-border"] = fx.border;
    a["data-fx-glow"] = fx.glow;
    a["data-fx-motion"] = fx.motion;
    if (fx.scanlines === "subtle") a["data-fx-scan"] = "on";
    if (fx.grain === "subtle") a["data-fx-grain"] = "on";
    if (fx.sheen) a["data-fx-sheen"] = "on";
    if (fx.noise) a["data-fx-noise"] = "on";
    if (fx.chromatic) a["data-fx-ca"] = "on";
    if (fx.ambient) a["data-fx-ambient"] = "on";
    if (fx.atmosphere && fx.atmosphere !== "none") a["data-fx-atmosphere"] = fx.atmosphere;
    return a;
}

export function fxRootAttrString(theme: SimpleGUITheme | undefined | null, mode: FxMode = "on", tier?: FxHardwareTier): string {
    return Object.entries(fxRootAttrs(theme, mode, tier)).map(([k, v]) => `${k}="${v}"`).join(" ");
}

export interface SyntaxPalette {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    function: string;
    type: string;
    text: string;
}

/**
 * Code colors for a theme, worked out from its accent, secondary and status colors. There is no per-theme syntax
 * table in the Designer, so editors that want one use this; every color reads at 4.5:1 or better on the theme's canvas.
 */
export function syntaxPalette(theme: SimpleGUITheme): SyntaxPalette {
    const sem = buildSemanticPalette({ background: theme.background_color, card: theme.card_background, isDark: theme.is_dark, overrides: overridesForTheme(theme) });
    const bg = theme.background_color;
    const reach = (hex: string) => {
        const base = parseColor(hex);
        const to: RGB = theme.is_dark ? [255, 255, 255] : [0, 0, 0];
        for (let i = 0; i <= 20; i++) {
            const c = toHex(mixRgb(base, to, i * 0.05));
            if (contrastRatio(c, bg) >= 4.5) return c;
        }
        return toHex(to);
    };
    let comment = theme.font_color;
    for (let t = 0.55; t >= 0; t -= 0.05) {
        const c = toHex(mixRgb(parseColor(theme.font_color), parseColor(bg), t));
        if (contrastRatio(c, bg) >= 4.6) { comment = c; break; }
    }
    return {
        keyword: reach(theme.accent_color),
        string: sem.success.text,
        number: sem.warning.text,
        comment,
        function: reach(theme.secondary_accent ?? theme.accent_color),
        type: sem.info.text,
        text: theme.font_color,
    };
}
