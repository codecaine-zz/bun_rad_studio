// Futuristic themes plus the `fx` descriptor that turns a theme into a token set for the motion/interaction layer.
// A theme without `fx` produces no fx output at all; see src/shared/fxCss.ts for the CSS and fxPointer.ts for the helper.
import type { SimpleGUITheme } from "../simplegui";
import { buildSemanticPalette, contrastRatio, overridesForTheme, parseColor, toHex } from "./themeSemantic";

export type FxGlow = "none" | "soft" | "neon" | "bloom" | "aurora" | "laser" | "plasma" | "ember";
export type FxRadius = "sharp" | "soft" | "round" | "pill" | "squircle";
export type FxBorder = "flat" | "gradient" | "metal" | "hologram" | "neon" | "iridescent" | "bevel" | "double";
export type FxMotion = "calm" | "spring" | "snappy" | "elastic" | "cinematic" | "zero";
export type FxGrain = "none" | "subtle" | "film" | "halftone";
export type FxScanlines = "none" | "subtle" | "crt" | "interlace";
export type FxBackdropStyle = "glass" | "liquid" | "mica" | "acrylic" | "frosted" | "oled" | "matte";
export type FxCursorEffect = "none" | "spotlight" | "ripple" | "magnetic" | "prism";
export type FxVignette = "none" | "subtle" | "cinema" | "ambient";
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
    /** Film grain / halftone texture over the page, at most 4% opacity. */
    grain: FxGrain;
    /** Scanlines / CRT interlace over the page, at most 4% opacity, never intercepting the pointer. */
    scanlines: FxScanlines;
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
    /** Surface material shader style (Liquid Glass, Windows 11 Mica/Acrylic, Frosted Crystal, OLED, Matte). */
    backdropStyle?: FxBackdropStyle;
    /** Interactive pointer lighting mode (Spotlight, Ripple, Magnetic, Prismatic). */
    cursorEffect?: FxCursorEffect;
    /** Screen-edge framing vignette (Subtle, Anamorphic Cinema, or Ambient Edge Glow). */
    vignette?: FxVignette;
    /** Prismatic rainbow dispersion line along top edges of cards and dialogs. */
    prismEdge?: boolean;
    /** Inset luminous aura inside cards, panels, and dialogs. */
    innerGlow?: boolean;
    /** Crisp 1px top/left specular crystal rim on glass surfaces. */
    frostedRim?: boolean;
    /** Gentle breathing glow on active selections and primary buttons. */
    neonPulse?: boolean;
    /** Retro CRT phosphor bloom & subtle edge framing. */
    crtCurve?: boolean;
    /** 3D perspective tilt and depth response on cards. */
    parallax?: boolean;
    /** Backdrop saturation percentage (50 to 250). */
    saturation?: number;
    /** Built-in File Manager UI element shader ("fire_folders", "slime_drip", "cryo_frost", "tesla_arcs", "storm_wind", "mercury_chrome", "holo_glitch", "void_tentacles"). */
    uiElementFx?: string;
    /** Built-in File Manager custom icon pack look ("inferno", "slime", "storm_tempest", "neon_cyber", "liquid_gems", "cryo_crystal", "retro_pixel", "xenotech_2126"). */
    iconPackStyle?: string;
    /** Per-theme typography profile ("default", "scifi", "terminal", "editorial", "rounded"). */
    fontProfile?: string;
    /** Per-theme corner geometry profile ("default", "sharp", "rounded", "pill"). */
    cornerProfile?: string;
    /** Per-theme icon glow intensity ("off", "subtle", "neon", "hyper"). */
    iconGlow?: string;
    /** Direct per-token overrides for any File Manager `--*` CSS custom property. */
    customVars?: Record<string, string>;
    /** Personal custom CSS / keyframe shader overrides injected when this theme is active. */
    customCss?: string;
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
        fx: { glow: "neon", glowColor: "#53f4ff", glowColor2: "#ff67d8", glowIntensity: 0.8, blur: 28, glass: 0.8, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", borderOpacity: 0.35, motion: "spring", ambient: true, chromatic: true, backdropStyle: "liquid", cursorEffect: "prism", vignette: "ambient", prismEdge: true, innerGlow: true, frostedRim: true, neonPulse: true, parallax: true, atmosphere: "m4_raytrace_prism+prism_spectrum", uiElementFx: "holo_glitch", iconPackStyle: "liquid_gems", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
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
        fx: { glow: "soft", glowColor: "#165ba3", glowColor2: "#7255a8", glowIntensity: 0.45, blur: 24, glass: 0.7, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", borderOpacity: 0.3, motion: "calm", ambient: true, backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "subtle", frostedRim: true, innerGlow: true, atmosphere: "northern_pillars+snow", uiElementFx: "cryo_frost", iconPackStyle: "cryo_crystal", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "neon", glowColor: "#ffb454", glowColor2: "#ff6178", glowIntensity: 0.65, blur: 8, glass: 0.25, grain: "subtle", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", borderOpacity: 0.5, motion: "snappy", ambient: true, backdropStyle: "oled", cursorEffect: "magnetic", vignette: "subtle", innerGlow: true, neonPulse: true, iconPackStyle: "inferno", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "neon" },
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
        fx: { glow: "neon", glowColor: "#00e5ff", glowColor2: "#ff4fd8", blur: 16, glass: 0.55, grain: "none", scanlines: "subtle", sheen: true, radius: "soft", border: "gradient", motion: "snappy", chromatic: true, ambient: true, backdropStyle: "glass", cursorEffect: "prism", vignette: "cinema", prismEdge: true, innerGlow: true, neonPulse: true, parallax: true, atmosphere: "cyberstorm+outrun_grid", uiElementFx: "holo_glitch", iconPackStyle: "neon_cyber", fontProfile: "scifi", cornerProfile: "sharp", iconGlow: "hyper" },
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
        fx: { glow: "neon", glowColor: "#19f5d6", glowColor2: "#ff3d8b", blur: 10, glass: 0.45, grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", chromatic: true, backdropStyle: "oled", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, neonPulse: true, atmosphere: "tactical_hud", uiElementFx: "holo_glitch", iconPackStyle: "neon_cyber", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "neon" },
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
        fx: { glow: "soft", glowColor: "#2dd4bf", glowColor2: "#a78bfa", blur: 20, glass: 0.6, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "spring", noise: true, ambient: true, backdropStyle: "oled", cursorEffect: "spotlight", vignette: "subtle", frostedRim: true, innerGlow: true, parallax: true, atmosphere: "singularity_core+quantum_foam", uiElementFx: "void_tentacles", iconPackStyle: "xenotech_2126", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
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
        fx: { glow: "soft", glowColor: "#a78bfa", glowColor2: "#60a5fa", blur: 18, glass: 0.5, grain: "subtle", scanlines: "none", sheen: false, radius: "round", border: "gradient", motion: "spring", ambient: true, backdropStyle: "oled", cursorEffect: "spotlight", vignette: "cinema", innerGlow: true, parallax: true, atmosphere: "nebula+wormhole_transit", uiElementFx: "void_tentacles", iconPackStyle: "xenotech_2126", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
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
        fx: { glow: "soft", glowColor: "#c9d4e0", glowColor2: "#7fb0e0", blur: 14, glass: 0.35, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "spring", noise: true, backdropStyle: "liquid", cursorEffect: "magnetic", vignette: "subtle", frostedRim: true, innerGlow: true, parallax: true, atmosphere: "ferrofluid_spikes", uiElementFx: "mercury_chrome", iconPackStyle: "liquid_gems", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#34d399", glowColor2: "#a78bfa", blur: 20, glass: 0.5, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "calm", ambient: true, backdropStyle: "mica", cursorEffect: "spotlight", vignette: "ambient", frostedRim: true, innerGlow: true, atmosphere: "aurora+northern_pillars", uiElementFx: "mercury_chrome", iconPackStyle: "cryo_crystal", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
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
        fx: { glow: "none", glowColor: "#2b4a6b", glowColor2: "#7a8a9a", blur: 16, glass: 0.4, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "spring", noise: true, backdropStyle: "liquid", cursorEffect: "spotlight", vignette: "subtle", frostedRim: true, atmosphere: "liquid_glass_caustics", uiElementFx: "mercury_chrome", iconPackStyle: "liquid_gems", fontProfile: "default", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#ff6ac1", glowColor2: "#2de2c9", blur: 12, glass: 0.4, grain: "none", scanlines: "none", sheen: false, radius: "soft", border: "gradient", motion: "snappy", backdropStyle: "acrylic", cursorEffect: "spotlight", vignette: "subtle", innerGlow: true, neonPulse: true, iconPackStyle: "neon_cyber", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
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
        fx: { glow: "soft", glowColor: "#ffb347", glowColor2: "#ff5fa2", blur: 12, glass: 0.4, grain: "subtle", scanlines: "none", sheen: false, radius: "soft", border: "gradient", motion: "snappy", ambient: true, backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "cinema", innerGlow: true, frostedRim: true, iconPackStyle: "inferno", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#b3135f", glowColor2: "#4f46e5", blur: 14, glass: 0.35, grain: "none", scanlines: "none", sheen: false, radius: "soft", border: "gradient", motion: "spring", backdropStyle: "mica", cursorEffect: "ripple", vignette: "subtle", frostedRim: true, iconPackStyle: "liquid_gems", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#5ef2d0", glowColor2: "#7aa8ff", blur: 24, glass: 0.62, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "spring", ambient: true, backdropStyle: "liquid", cursorEffect: "ripple", vignette: "ambient", frostedRim: true, innerGlow: true, prismEdge: true, atmosphere: "aurora_australis+caustics", uiElementFx: "cryo_frost", iconPackStyle: "liquid_gems", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "neon" },
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
        fx: { glow: "neon", glowColor: "#d28bff", glowColor2: "#ff6b9d", blur: 14, glass: 0.45, grain: "none", scanlines: "none", sheen: true, radius: "pill", border: "gradient", motion: "spring", ambient: true, backdropStyle: "acrylic", cursorEffect: "magnetic", vignette: "ambient", innerGlow: true, neonPulse: true, iconPackStyle: "neon_cyber", fontProfile: "rounded", cornerProfile: "pill", iconGlow: "neon" },
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
        fx: { glow: "neon", glowColor: "#ff7edb", glowColor2: "#72f1b8", glowIntensity: 0.85, blur: 14, glass: 0.45, grain: "none", scanlines: "subtle", sheen: true, radius: "soft", border: "gradient", motion: "snappy", ambient: true, chromatic: true, backdropStyle: "acrylic", cursorEffect: "prism", vignette: "cinema", prismEdge: true, innerGlow: true, neonPulse: true, crtCurve: true, atmosphere: "outrun_grid+laser_show", uiElementFx: "holo_glitch", iconPackStyle: "retro_pixel", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
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
        fx: { glow: "neon", glowColor: "#39ff6a", glowColor2: "#00c8a0", glowIntensity: 0.7, blur: 6, glass: 0.3, grain: "subtle", scanlines: "subtle", sheen: false, radius: "sharp", border: "flat", motion: "snappy", chromatic: true, backdropStyle: "oled", cursorEffect: "magnetic", vignette: "cinema", crtCurve: true, innerGlow: true, neonPulse: true, atmosphere: "omega_matrix", uiElementFx: "holo_glitch", iconPackStyle: "neon_cyber", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "hyper" },
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
        fx: { glow: "soft", glowColor: "#ffb000", glowColor2: "#ff8a2a", glowIntensity: 0.6, blur: 4, glass: 0.2, grain: "subtle", scanlines: "subtle", sheen: false, radius: "sharp", border: "flat", motion: "calm", backdropStyle: "oled", cursorEffect: "spotlight", vignette: "cinema", crtCurve: true, innerGlow: true, iconPackStyle: "retro_pixel", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#8ab4ff", glowColor2: "#c4a1ff", glowIntensity: 0.6, blur: 30, glass: 0.8, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", borderOpacity: 0.3, motion: "spring", ambient: true, noise: true, backdropStyle: "liquid", cursorEffect: "prism", vignette: "subtle", frostedRim: true, innerGlow: true, prismEdge: true, parallax: true, atmosphere: "liquid_glass_caustics+aurora", uiElementFx: "mercury_chrome", iconPackStyle: "liquid_gems", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "neon" },
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
        fx: { glow: "soft", glowColor: "#3cf0ff", glowColor2: "#b06bff", glowIntensity: 0.75, blur: 22, glass: 0.6, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "calm", ambient: true, backdropStyle: "liquid", cursorEffect: "ripple", vignette: "ambient", innerGlow: true, frostedRim: true, neonPulse: true, atmosphere: "abyssal_trench+jellyfish_glow", uiElementFx: "void_tentacles", iconPackStyle: "slime", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "neon" },
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
        fx: { glow: "neon", glowColor: "#ff9ef5", glowColor2: "#7cc4ff", glowIntensity: 0.75, blur: 18, glass: 0.55, grain: "subtle", scanlines: "none", sheen: true, radius: "pill", border: "gradient", motion: "spring", ambient: true, chromatic: true, backdropStyle: "glass", cursorEffect: "prism", vignette: "ambient", prismEdge: true, innerGlow: true, neonPulse: true, parallax: true, atmosphere: "spiral_galaxy+supernova", uiElementFx: "void_tentacles", iconPackStyle: "xenotech_2126", fontProfile: "rounded", cornerProfile: "pill", iconGlow: "hyper" },
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
        fx: { glow: "soft", glowColor: "#e6c068", glowColor2: "#d39a62", glowIntensity: 0.55, blur: 12, glass: 0.35, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "calm", noise: true, backdropStyle: "oled", cursorEffect: "spotlight", vignette: "subtle", frostedRim: true, innerGlow: true, iconPackStyle: "liquid_gems", fontProfile: "editorial", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "neon", glowColor: "#ff5c6c", glowColor2: "#ff9a3d", glowIntensity: 0.75, blur: 10, glass: 0.35, grain: "subtle", scanlines: "none", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", ambient: true, backdropStyle: "oled", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, neonPulse: true, iconPackStyle: "inferno", fontProfile: "scifi", cornerProfile: "sharp", iconGlow: "neon" },
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
        fx: { glow: "neon", glowColor: "#b6ff3b", glowColor2: "#3bffd0", glowIntensity: 0.8, blur: 8, glass: 0.35, grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", chromatic: true, backdropStyle: "oled", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, neonPulse: true, atmosphere: "molecular_lattice+quantum_cpu", uiElementFx: "slime_drip", iconPackStyle: "slime", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "hyper" },
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
        fx: { glow: "soft", glowColor: "#8fe3ff", glowColor2: "#b9c7ff", glowIntensity: 0.6, blur: 24, glass: 0.65, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "calm", ambient: true, backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "ambient", frostedRim: true, innerGlow: true, atmosphere: "blizzard+aurora_australis", uiElementFx: "cryo_frost", iconPackStyle: "cryo_crystal", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
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
        fx: { glow: "soft", glowColor: "#4ff0a0", glowColor2: "#c3f56a", glowIntensity: 0.6, blur: 16, glass: 0.5, grain: "none", scanlines: "none", sheen: false, radius: "round", border: "gradient", motion: "calm", ambient: true, noise: true, backdropStyle: "frosted", cursorEffect: "ripple", vignette: "ambient", innerGlow: true, frostedRim: true, iconPackStyle: "slime", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#e0a85a", glowColor2: "#d48a5c", glowIntensity: 0.5, blur: 6, glass: 0.25, grain: "subtle", scanlines: "none", sheen: true, radius: "sharp", border: "metal", motion: "calm", backdropStyle: "matte", cursorEffect: "spotlight", vignette: "cinema", frostedRim: true, innerGlow: true, iconPackStyle: "retro_pixel", fontProfile: "editorial", cornerProfile: "sharp", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#7fb2ff", glowColor2: "#a8c7fa", glowIntensity: 0.3, blur: 10, glass: 0.3, grain: "none", scanlines: "none", sheen: false, radius: "soft", border: "flat", motion: "calm", backdropStyle: "matte", cursorEffect: "spotlight", vignette: "subtle", frostedRim: true, fontProfile: "default", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "neon", glowColor: "#00ffff", glowColor2: "#ff4dff", glowIntensity: 1, blur: 0, glass: 0, grain: "none", scanlines: "none", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", backdropStyle: "oled", cursorEffect: "magnetic", vignette: "none", neonPulse: true, iconPackStyle: "neon_cyber", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "hyper" },
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
        fx: { glow: "soft", glowColor: "#ff9de2", glowColor2: "#8ef6e4", glowIntensity: 0.7, blur: 14, glass: 0.45, grain: "subtle", scanlines: "subtle", sheen: true, radius: "pill", border: "gradient", motion: "spring", ambient: true, backdropStyle: "acrylic", cursorEffect: "prism", vignette: "ambient", innerGlow: true, neonPulse: true, iconPackStyle: "retro_pixel", fontProfile: "rounded", cornerProfile: "pill", iconGlow: "neon" },
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
        fx: { glow: "soft", glowColor: "#2457c5", glowColor2: "#7a4fc4", glowIntensity: 0.45, blur: 28, glass: 0.7, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", borderOpacity: 0.35, motion: "spring", ambient: true, backdropStyle: "liquid", cursorEffect: "prism", vignette: "subtle", frostedRim: true, innerGlow: true, prismEdge: true, atmosphere: "liquid_glass_caustics+win11_mica_bloom", uiElementFx: "cryo_frost", iconPackStyle: "liquid_gems", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#b0245e", glowColor2: "#6b4fa8", glowIntensity: 0.4, blur: 20, glass: 0.6, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "calm", ambient: true, backdropStyle: "frosted", cursorEffect: "ripple", vignette: "subtle", frostedRim: true, innerGlow: true, atmosphere: "sakura+fireflies", uiElementFx: "storm_wind", iconPackStyle: "liquid_gems", fontProfile: "editorial", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#6a3fd1", glowColor2: "#00808a", glowIntensity: 0.45, blur: 18, glass: 0.55, grain: "none", scanlines: "none", sheen: true, radius: "pill", border: "gradient", motion: "spring", ambient: true, backdropStyle: "liquid", cursorEffect: "prism", vignette: "ambient", prismEdge: true, frostedRim: true, innerGlow: true, atmosphere: "bifrost+prism_spectrum", uiElementFx: "holo_glitch", iconPackStyle: "liquid_gems", fontProfile: "rounded", cornerProfile: "pill", iconGlow: "neon" },
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
        fx: { glow: "soft", glowColor: "#9c4a3a", glowColor2: "#c08a6a", glowIntensity: 0.35, blur: 14, glass: 0.45, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "calm", noise: true, backdropStyle: "mica", cursorEffect: "spotlight", vignette: "subtle", frostedRim: true, innerGlow: true, iconPackStyle: "liquid_gems", fontProfile: "editorial", cornerProfile: "rounded", iconGlow: "subtle" },
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
        fx: { glow: "soft", glowColor: "#0b6e5f", glowColor2: "#8a2d6b", glowIntensity: 0.4, blur: 8, glass: 0.3, grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", backdropStyle: "acrylic", cursorEffect: "magnetic", vignette: "subtle", frostedRim: true, iconPackStyle: "neon_cyber", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "subtle" },
    }),
    tesla_coil_plasma: T({
        name: "Tesla Coil Plasma",
        short_name: "Tesla Plasma",
        background_color: "#070412",
        font_color: "#f3ecff",
        accent_color: "#c77dff",
        secondary_accent: "#3bf0ff",
        card_background: "#120a24",
        card_border: "#7652a8",
        description: "High-voltage Tesla coil discharge: branching violet and electric-cyan corona filaments over dark dielectric glass",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#c77dff", glowColor2: "#3bf0ff", glowIntensity: 0.9, blur: 18, glass: 0.5, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "gradient", motion: "snappy", chromatic: true, ambient: true, backdropStyle: "glass", cursorEffect: "magnetic", vignette: "ambient", innerGlow: true, neonPulse: true, parallax: true, atmosphere: "plasma_storm", uiElementFx: "tesla_arcs", iconPackStyle: "neon_cyber", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    wardenclyffe_tower: T({
        name: "Wardenclyffe Megacoil",
        short_name: "Wardenclyffe",
        background_color: "#09060f",
        font_color: "#f7f0ff",
        accent_color: "#e09eff",
        secondary_accent: "#ffb84d",
        card_background: "#161022",
        card_border: "#85639e",
        description: "Nikola Tesla's magnifying transmitter: 12-million-volt lavender plasma arcs and spun brass toroid terminals",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#e09eff", glowColor2: "#ffb84d", glowIntensity: 0.85, blur: 16, glass: 0.45, grain: "subtle", scanlines: "none", sheen: true, radius: "sharp", border: "metal", motion: "snappy", ambient: true, backdropStyle: "oled", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, neonPulse: true, frostedRim: true, atmosphere: "tesla_megacoil", uiElementFx: "tesla_arcs", iconPackStyle: "inferno", fontProfile: "editorial", cornerProfile: "sharp", iconGlow: "hyper" },
    }),
    nikola_plasma_globe: T({
        name: "Nikola Plasma Sphere",
        short_name: "Plasma Globe",
        background_color: "#0b0414",
        font_color: "#fcebff",
        accent_color: "#ff66d9",
        secondary_accent: "#66d9ff",
        card_background: "#180b29",
        card_border: "#8f4f99",
        description: "Noble-gas dielectric plasma orb: neon rose-magenta and xenon-blue tendrils that lock onto your cursor",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ff66d9", glowColor2: "#66d9ff", glowIntensity: 0.85, blur: 22, glass: 0.58, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "spring", ambient: true, backdropStyle: "liquid", cursorEffect: "magnetic", vignette: "ambient", innerGlow: true, neonPulse: true, prismEdge: true, parallax: true, atmosphere: "plasma_globe", uiElementFx: "tesla_arcs", iconPackStyle: "liquid_gems", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    jacobs_ladder_arc: T({
        name: "Jacob's Ladder Arc",
        short_name: "Jacob's Arc",
        background_color: "#0c0804",
        font_color: "#fff3e0",
        accent_color: "#ffbe55",
        secondary_accent: "#9d7bff",
        card_background: "#1b1209",
        card_border: "#8f6d3d",
        description: "Climbing high-voltage electric arcs rising between diverging V-shaped copper electrodes in ionized ozone air",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ffbe55", glowColor2: "#9d7bff", glowIntensity: 0.8, blur: 12, glass: 0.4, grain: "subtle", scanlines: "none", sheen: true, radius: "sharp", border: "metal", motion: "snappy", backdropStyle: "oled", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, neonPulse: true, atmosphere: "jacobs_ladder", uiElementFx: "tesla_arcs", iconPackStyle: "inferno", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "neon" },
    }),
    ball_lightning_storm: T({
        name: "Ball Lightning Plasmoid",
        short_name: "Plasmoid",
        background_color: "#050a14",
        font_color: "#eaf4ff",
        accent_color: "#66e3ff",
        secondary_accent: "#ff94e8",
        card_background: "#0f192b",
        card_border: "#4f78a6",
        description: "Autonomous spherical ball-lightning plasmoids crackling with internal filaments and inter-orb voltage arcs",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#66e3ff", glowColor2: "#ff94e8", glowIntensity: 0.85, blur: 20, glass: 0.52, grain: "none", scanlines: "none", sheen: true, radius: "pill", border: "gradient", motion: "spring", ambient: true, backdropStyle: "glass", cursorEffect: "magnetic", vignette: "ambient", innerGlow: true, neonPulse: true, parallax: true, atmosphere: "ball_lightning", uiElementFx: "tesla_arcs", iconPackStyle: "storm_tempest", fontProfile: "scifi", cornerProfile: "pill", iconGlow: "hyper" },
    }),
    tokamak_fusion: T({
        name: "Tokamak Fusion Torus",
        short_name: "Tokamak",
        background_color: "#11050c",
        font_color: "#ffeaf4",
        accent_color: "#ff6b9d",
        secondary_accent: "#4de8ff",
        card_background: "#210c18",
        card_border: "#964b6a",
        description: "ITER magnetic fusion confinement: 150-million-kelvin deuterium-tritium plasma spiraling inside superconducting field coils",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ff6b9d", glowColor2: "#4de8ff", glowIntensity: 0.9, blur: 18, glass: 0.48, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "snappy", chromatic: true, ambient: true, backdropStyle: "glass", cursorEffect: "magnetic", vignette: "ambient", innerGlow: true, neonPulse: true, prismEdge: true, atmosphere: "tokamak_fusion", uiElementFx: "fire_folders", iconPackStyle: "inferno", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    cherenkov_reactor: T({
        name: "Cherenkov Blue Reactor",
        short_name: "Cherenkov",
        background_color: "#020b18",
        font_color: "#e6f6ff",
        accent_color: "#38b6ff",
        secondary_accent: "#5ce1e6",
        card_background: "#07182e",
        card_border: "#3d76a8",
        description: "Submerged nuclear core: phase-coherent Cerenkov radiation blue shockcones and heavy-water refraction",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#38b6ff", glowColor2: "#5ce1e6", glowIntensity: 0.85, blur: 22, glass: 0.58, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "gradient", motion: "calm", ambient: true, backdropStyle: "liquid", cursorEffect: "ripple", vignette: "ambient", innerGlow: true, frostedRim: true, neonPulse: true, atmosphere: "cherenkov_glow", uiElementFx: "cryo_frost", iconPackStyle: "cryo_crystal", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    cern_synchrotron: T({
        name: "CERN Hadron Collider",
        short_name: "Synchrotron",
        background_color: "#080c12",
        font_color: "#edf5ff",
        accent_color: "#ffd15c",
        secondary_accent: "#4ddbff",
        card_background: "#121a26",
        card_border: "#5a7394",
        description: "Relativistic proton beam collisions bursting into curved Lorentz-force bubble-chamber decay spirals",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ffd15c", glowColor2: "#4ddbff", glowIntensity: 0.8, blur: 14, glass: 0.42, grain: "none", scanlines: "subtle", sheen: true, radius: "sharp", border: "metal", motion: "snappy", backdropStyle: "acrylic", cursorEffect: "magnetic", vignette: "subtle", innerGlow: true, frostedRim: true, atmosphere: "hadron_collider", uiElementFx: "tesla_arcs", iconPackStyle: "xenotech_2126", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "neon" },
    }),
    lorentz_chaos: T({
        name: "Lorenz Strange Attractor",
        short_name: "Lorenz Chaos",
        background_color: "#04110e",
        font_color: "#e6fff9",
        accent_color: "#3df5c4",
        secondary_accent: "#ffb86c",
        card_background: "#0b211c",
        card_border: "#3d8573",
        description: "Chaotic phase-space butterfly trajectories integrated in real time with glowing phosphor emerald and amber ribbons",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#3df5c4", glowColor2: "#ffb86c", glowIntensity: 0.75, blur: 16, glass: 0.48, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "spring", ambient: true, backdropStyle: "glass", cursorEffect: "prism", vignette: "ambient", innerGlow: true, parallax: true, atmosphere: "lorentz_attractor", uiElementFx: "void_tentacles", iconPackStyle: "xenotech_2126", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    ferrofluid_spike: T({
        name: "Ferrofluid Neodymium",
        short_name: "Ferrofluid",
        background_color: "#090a0d",
        font_color: "#eef2f9",
        accent_color: "#94b8ff",
        secondary_accent: "#d4a5ff",
        card_background: "#14171f",
        card_border: "#5e6a82",
        description: "Rosensweig instability liquid-metal magnetic peaks that bristle and orient toward your cursor's magnetic dipole",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#94b8ff", glowColor2: "#d4a5ff", glowIntensity: 0.65, blur: 16, glass: 0.45, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "spring", noise: true, backdropStyle: "liquid", cursorEffect: "magnetic", vignette: "subtle", frostedRim: true, innerGlow: true, parallax: true, atmosphere: "ferrofluid_spikes", uiElementFx: "mercury_chrome", iconPackStyle: "liquid_gems", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    hawking_horizon: T({
        name: "Hawking Event Horizon",
        short_name: "Event Horizon",
        background_color: "#06040a",
        font_color: "#f4eeff",
        accent_color: "#ffa654",
        secondary_accent: "#b388ff",
        card_background: "#120d1c",
        card_border: "#6d578f",
        description: "Schwarzschild black hole boundary with Doppler-beamed accretion gold and quantum Hawking pair radiation",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ffa654", glowColor2: "#b388ff", glowIntensity: 0.85, blur: 20, glass: 0.52, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "calm", ambient: true, backdropStyle: "oled", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, prismEdge: true, parallax: true, atmosphere: "hawking_horizon", uiElementFx: "void_tentacles", iconPackStyle: "xenotech_2126", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    ligo_gravwave: T({
        name: "LIGO Spacetime Wave",
        short_name: "LIGO Wave",
        background_color: "#030d14",
        font_color: "#e8f8ff",
        accent_color: "#47e5bc",
        secondary_accent: "#7ab8ff",
        card_background: "#0a1c29",
        card_border: "#3f7894",
        description: "Binary black-hole merger quadrupolar spacetime metric ripples measured by orthogonal Fabry-Perot laser arms",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#47e5bc", glowColor2: "#7ab8ff", glowIntensity: 0.7, blur: 14, glass: 0.45, grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", ambient: true, backdropStyle: "glass", cursorEffect: "ripple", vignette: "subtle", innerGlow: true, atmosphere: "gravitational_waves", uiElementFx: "holo_glitch", iconPackStyle: "neon_cyber", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "neon" },
    }),
    meissner_superconductor: T({
        name: "Meissner Levitation",
        short_name: "Meissner",
        background_color: "#031017",
        font_color: "#e6f9ff",
        accent_color: "#6ef2ff",
        secondary_accent: "#a3b8ff",
        card_background: "#0a1f2b",
        card_border: "#457f99",
        description: "Cryogenic liquid-nitrogen YBCO superconductor with Abrikosov flux pinning and diamagnetic levitation",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#6ef2ff", glowColor2: "#a3b8ff", glowIntensity: 0.7, blur: 24, glass: 0.62, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "spring", ambient: true, backdropStyle: "frosted", cursorEffect: "magnetic", vignette: "ambient", frostedRim: true, innerGlow: true, parallax: true, atmosphere: "meissner_levitation", uiElementFx: "cryo_frost", iconPackStyle: "cryo_crystal", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    antimatter_penning: T({
        name: "Antimatter Penning Trap",
        short_name: "Antimatter",
        background_color: "#12040a",
        font_color: "#ffebf2",
        accent_color: "#ff5c8a",
        secondary_accent: "#70e1ff",
        card_background: "#240b16",
        card_border: "#994964",
        description: "High-vacuum quadrupole magnetic bottle confining positrons and antiprotons with gamma annihilation flashes",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ff5c8a", glowColor2: "#70e1ff", glowIntensity: 0.9, blur: 16, glass: 0.46, grain: "none", scanlines: "none", sheen: true, radius: "sharp", border: "gradient", motion: "snappy", chromatic: true, ambient: true, backdropStyle: "oled", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, neonPulse: true, prismEdge: true, atmosphere: "antimatter_trap", uiElementFx: "tesla_arcs", iconPackStyle: "xenotech_2126", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "hyper" },
    }),
    dyson_megastructure: T({
        name: "Dyson Sphere Swarm",
        short_name: "Dyson Swarm",
        background_color: "#0f0903",
        font_color: "#fff4e4",
        accent_color: "#ffc44d",
        secondary_accent: "#ff7b54",
        card_background: "#1f1408",
        card_border: "#8f6834",
        description: "Kardashev Type-II stellar harvesting megastructure with orbital solar-collector mirrors and power beams",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#ffc44d", glowColor2: "#ff7b54", glowIntensity: 0.75, blur: 14, glass: 0.42, grain: "subtle", scanlines: "none", sheen: true, radius: "soft", border: "metal", motion: "calm", ambient: true, backdropStyle: "oled", cursorEffect: "spotlight", vignette: "cinema", innerGlow: true, frostedRim: true, atmosphere: "dyson_swarm", uiElementFx: "fire_folders", iconPackStyle: "inferno", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    alcubierre_metric: T({
        name: "Alcubierre Warp Drive",
        short_name: "Alcubierre",
        background_color: "#040816",
        font_color: "#ebf1ff",
        accent_color: "#6ba4ff",
        secondary_accent: "#ff7a90",
        card_background: "#0c142b",
        card_border: "#4d699e",
        description: "Superluminal Alcubierre metric tensor: blue-shifted contracting bow wave and red-shifted expanding spacetime wake",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#6ba4ff", glowColor2: "#ff7a90", glowIntensity: 0.85, blur: 18, glass: 0.5, grain: "none", scanlines: "none", sheen: true, radius: "pill", border: "gradient", motion: "snappy", chromatic: true, ambient: true, backdropStyle: "liquid", cursorEffect: "prism", vignette: "ambient", prismEdge: true, innerGlow: true, neonPulse: true, parallax: true, atmosphere: "alcubierre_warp", uiElementFx: "void_tentacles", iconPackStyle: "xenotech_2126", fontProfile: "scifi", cornerProfile: "pill", iconGlow: "hyper" },
    }),
    lissajous_scope: T({
        name: "Tektronix Vector Scope",
        short_name: "Lissajous",
        background_color: "#03120c",
        font_color: "#e6fff5",
        accent_color: "#2ef2a0",
        secondary_accent: "#6be8ff",
        card_background: "#082419",
        card_border: "#398768",
        description: "P31 phosphor X-Y vector oscilloscope rendering phase-locked 3D Lissajous harmonic laser figures",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#2ef2a0", glowColor2: "#6be8ff", glowIntensity: 0.8, blur: 10, glass: 0.35, grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", backdropStyle: "oled", cursorEffect: "spotlight", vignette: "cinema", crtCurve: true, innerGlow: true, neonPulse: true, atmosphere: "lissajous_harmonics", uiElementFx: "holo_glitch", iconPackStyle: "retro_pixel", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "neon" },
    }),
    quark_chromodynamics: T({
        name: "Quark-Gluon Plasma",
        short_name: "Quark-Gluon",
        background_color: "#0d0614",
        font_color: "#f6edff",
        accent_color: "#ff75d8",
        secondary_accent: "#59f0c8",
        card_background: "#190e26",
        card_border: "#7c549e",
        description: "Primordial relativistic color-charge confinement with snapping gluon flux tubes and hadronization jets",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#ff75d8", glowColor2: "#59f0c8", glowIntensity: 0.85, blur: 18, glass: 0.5, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "spring", chromatic: true, ambient: true, backdropStyle: "glass", cursorEffect: "prism", vignette: "ambient", prismEdge: true, innerGlow: true, neonPulse: true, atmosphere: "quark_gluon_plasma", uiElementFx: "void_tentacles", iconPackStyle: "xenotech_2126", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    arc_reactor_mk: T({
        name: "Palladium Arc Reactor",
        short_name: "Arc Reactor",
        background_color: "#030c14",
        font_color: "#eaf7ff",
        accent_color: "#52dcff",
        secondary_accent: "#a6e3ff",
        card_background: "#091929",
        card_border: "#467c9e",
        description: "Toroidal palladium induction core with ten segmented copper-iridium coils and radial high-current plasma arcs",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#52dcff", glowColor2: "#a6e3ff", glowIntensity: 0.9, blur: 16, glass: 0.5, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "metal", motion: "snappy", ambient: true, backdropStyle: "glass", cursorEffect: "magnetic", vignette: "subtle", frostedRim: true, innerGlow: true, neonPulse: true, atmosphere: "arc_reactor_core", uiElementFx: "tesla_arcs", iconPackStyle: "neon_cyber", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    st_elmos_corona: T({
        name: "St. Elmo's Brush Fire",
        short_name: "St. Elmo",
        background_color: "#060913",
        font_color: "#edf2ff",
        accent_color: "#8caeff",
        secondary_accent: "#d19cff",
        card_background: "#101729",
        card_border: "#546896",
        description: "Atmospheric masthead brush corona: luminous periwinkle-blue and violet electric plumes in stormy air",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#8caeff", glowColor2: "#d19cff", glowIntensity: 0.7, blur: 18, glass: 0.5, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "gradient", motion: "calm", ambient: true, backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "ambient", innerGlow: true, frostedRim: true, atmosphere: "st_elmos_corona", uiElementFx: "tesla_arcs", iconPackStyle: "storm_tempest", fontProfile: "editorial", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    van_de_graaff_day: T({
        name: "Van de Graaff Lab Light",
        short_name: "Van de Graaff",
        background_color: "#f5f2eb",
        font_color: "#1f1912",
        accent_color: "#9e4700",
        secondary_accent: "#5c33a8",
        card_background: "#ffffff",
        card_border: "#8c7b68",
        description: "Daylight high-voltage electrostatics lab: porcelain insulators, spun copper spheres and crisp violet-amber sparks",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#9e4700", glowColor2: "#5c33a8", glowIntensity: 0.4, blur: 14, glass: 0.45, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "metal", motion: "snappy", backdropStyle: "mica", cursorEffect: "magnetic", vignette: "subtle", frostedRim: true, atmosphere: "static_sparks", uiElementFx: "tesla_arcs", iconPackStyle: "liquid_gems", fontProfile: "editorial", cornerProfile: "rounded", iconGlow: "subtle" },
    }),
    cern_control_day: T({
        name: "CERN Control Room Light",
        short_name: "CERN Day",
        background_color: "#edf3f8",
        font_color: "#102030",
        accent_color: "#0058a6",
        secondary_accent: "#007060",
        card_background: "#ffffff",
        card_border: "#6e8499",
        description: "Bright accelerator control deck: high-contrast cobalt and teal telemetry, crisp vector borders and oscilloscope traces",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#0058a6", glowColor2: "#007060", glowIntensity: 0.4, blur: 12, glass: 0.4, grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", backdropStyle: "acrylic", cursorEffect: "spotlight", vignette: "subtle", frostedRim: true, atmosphere: "oscilloscope_lite", uiElementFx: "holo_glitch", iconPackStyle: "neon_cyber", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "subtle" },
    }),
    ef5_debris_tornado: T({
        name: "EF5 Debris Tornado",
        short_name: "EF5 Tornado",
        background_color: "#040d09",
        font_color: "#e8fff2",
        accent_color: "#34d399",
        secondary_accent: "#38bdf8",
        card_background: "#0b1c14",
        card_border: "#2d7a58",
        description: "Violent EF5 wedge tornado with 3D-tumbling leaves, shingles, flyers, lightning strobes, and wind-buffeted folders & toolbars",
        is_dark: true,
        fx: { glow: "plasma", glowColor: "#34d399", glowColor2: "#38bdf8", glowIntensity: 0.9, blur: 22, glass: 0.56, grain: "film", scanlines: "none", sheen: true, radius: "soft", border: "neon", motion: "elastic", chromatic: true, ambient: true, backdropStyle: "glass", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, neonPulse: true, parallax: true, atmosphere: "debris_tornado_ef5", uiElementFx: "storm_wind", iconPackStyle: "storm_tempest", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    inferno_fire_folders: T({
        name: "Inferno Blazing Folders",
        short_name: "Fire Folders",
        background_color: "#110502",
        font_color: "#fff1e6",
        accent_color: "#ff6b1a",
        secondary_accent: "#fbbf24",
        card_background: "#220c05",
        card_border: "#a84414",
        description: "Molten volcanic forge where File Manager folders, toolbars, breadcrumbs, and icons visibly burn with rising ember flames",
        is_dark: true,
        fx: { glow: "ember", glowColor: "#ff6b1a", glowColor2: "#fbbf24", glowIntensity: 0.95, blur: 18, glass: 0.5, grain: "subtle", scanlines: "none", sheen: true, radius: "soft", border: "neon", motion: "snappy", ambient: true, backdropStyle: "oled", cursorEffect: "spotlight", vignette: "cinema", innerGlow: true, neonPulse: true, atmosphere: "volcanic_lightning", uiElementFx: "fire_folders", iconPackStyle: "inferno", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    toxic_slime_ooze: T({
        name: "Radioactive Slime Bio-Vat",
        short_name: "Slime Drip",
        background_color: "#050f04",
        font_color: "#ecfccb",
        accent_color: "#a3e635",
        secondary_accent: "#22c55e",
        card_background: "#0d210a",
        card_border: "#4d8f26",
        description: "Glowing neon-chartreuse radioactive slime dripping off folders, toolbars, and breadcrumbs with bio-gel capsule icons",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#a3e635", glowColor2: "#22c55e", glowIntensity: 0.9, blur: 20, glass: 0.55, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "elastic", ambient: true, backdropStyle: "liquid", cursorEffect: "ripple", vignette: "ambient", innerGlow: true, neonPulse: true, atmosphere: "venus_acid_lightning", uiElementFx: "slime_drip", iconPackStyle: "slime", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    urban_street_cyclone: T({
        name: "Street-Canyon Cyclone",
        short_name: "Street Cyclone",
        background_color: "#060b12",
        font_color: "#eaf4ff",
        accent_color: "#38bdf8",
        secondary_accent: "#f59e0b",
        card_background: "#0f1926",
        card_border: "#3b6994",
        description: "Downtown urban wind-tunnel tempest whipping flying newspapers, leaves, trash wrappers, and transformer arcs across toolbars",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#38bdf8", glowColor2: "#f59e0b", glowIntensity: 0.85, blur: 20, glass: 0.52, grain: "subtle", scanlines: "none", sheen: true, radius: "soft", border: "gradient", motion: "snappy", ambient: true, backdropStyle: "acrylic", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, parallax: true, atmosphere: "urban_cyclone_debris", uiElementFx: "storm_wind", iconPackStyle: "storm_tempest", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    autumn_noreaster_gale: T({
        name: "October Nor'easter Leaf Gale",
        short_name: "Leaf Gale",
        background_color: "#120904",
        font_color: "#fff3e6",
        accent_color: "#f97316",
        secondary_accent: "#eab308",
        card_background: "#211209",
        card_border: "#9c5928",
        description: "Howling Atlantic autumn gale blowing 1,000 3D-tumbling maple & oak leaves, twigs, and rain sheets across the File Manager",
        is_dark: true,
        fx: { glow: "ember", glowColor: "#f97316", glowColor2: "#eab308", glowIntensity: 0.8, blur: 18, glass: 0.48, grain: "subtle", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "spring", ambient: true, backdropStyle: "frosted", cursorEffect: "ripple", vignette: "cinema", innerGlow: true, parallax: true, atmosphere: "autumn_noreaster_gale", uiElementFx: "storm_wind", iconPackStyle: "storm_tempest", fontProfile: "editorial", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    supercell_emerald_vortex: T({
        name: "Supercell Mesocyclone",
        short_name: "Supercell",
        background_color: "#04100d",
        font_color: "#e6fff8",
        accent_color: "#10b981",
        secondary_accent: "#6ee7b7",
        card_background: "#0a211b",
        card_border: "#2e7d67",
        description: "Rotating hail-core green mesocyclone with barometric radar HUD borders, wall-cloud lightning, and storm-swept folders",
        is_dark: true,
        fx: { glow: "neon", glowColor: "#10b981", glowColor2: "#6ee7b7", glowIntensity: 0.85, blur: 20, glass: 0.54, grain: "subtle", scanlines: "subtle", sheen: true, radius: "sharp", border: "neon", motion: "snappy", chromatic: true, ambient: true, backdropStyle: "glass", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, neonPulse: true, parallax: true, atmosphere: "supercell_tornado", uiElementFx: "storm_wind", iconPackStyle: "storm_tempest", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "hyper" },
    }),
    category_5_eyewall: T({
        name: "Category 5 Hurricane Eyewall",
        short_name: "Cat-5 Eyewall",
        background_color: "#030c17",
        font_color: "#e8f6ff",
        accent_color: "#00d4ff",
        secondary_accent: "#60a5fa",
        card_background: "#091b2e",
        card_border: "#2e6d9e",
        description: "Deep oceanic cyclone stadium eyewall with 185-mph whiteout sea-spray squalls, pressure isobars, and rain-slicked glass",
        is_dark: true,
        fx: { glow: "bloom", glowColor: "#00d4ff", glowColor2: "#60a5fa", glowIntensity: 0.85, blur: 26, glass: 0.62, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "iridescent", motion: "spring", backdropStyle: "liquid", cursorEffect: "ripple", vignette: "cinema", ambient: true, frostedRim: true, innerGlow: true, parallax: true, atmosphere: "category5_hurricane", uiElementFx: "storm_wind", iconPackStyle: "storm_tempest", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    mesosphere_red_sprite: T({
        name: "Mesosphere Red Sprite Storm",
        short_name: "Red Sprite",
        background_color: "#09030d",
        font_color: "#ffeef4",
        accent_color: "#ff3366",
        secondary_accent: "#60a5fa",
        card_background: "#170821",
        card_border: "#b84372",
        description: "Upper-atmospheric 80-km crimson jellyfish sprites and blue starter jets discharging above a nocturnal anvil storm",
        is_dark: true,
        fx: { glow: "laser", glowColor: "#ff3366", glowColor2: "#60a5fa", glowIntensity: 0.9, blur: 20, glass: 0.52, grain: "none", scanlines: "subtle", sheen: true, radius: "sharp", border: "hologram", motion: "snappy", chromatic: true, ambient: true, backdropStyle: "oled", cursorEffect: "prism", vignette: "cinema", prismEdge: true, innerGlow: true, neonPulse: true, atmosphere: "red_sprite_storm", uiElementFx: "tesla_arcs", iconPackStyle: "neon_cyber", fontProfile: "scifi", cornerProfile: "sharp", iconGlow: "hyper" },
    }),
    cryo_icicle_blizzard: T({
        name: "Cryo-Glacier Icicle Storm",
        short_name: "Cryo Icicles",
        background_color: "#030e18",
        font_color: "#ecfeff",
        accent_color: "#67e8f9",
        secondary_accent: "#93c5fd",
        card_background: "#081e30",
        card_border: "#3b82a6",
        description: "Sub-zero freezing ice storm with crystalline icicles hanging off toolbars and folders, diamond rime, and cryo-crystal icons",
        is_dark: true,
        fx: { glow: "aurora", glowColor: "#67e8f9", glowColor2: "#93c5fd", glowIntensity: 0.8, blur: 28, glass: 0.65, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "iridescent", motion: "calm", backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "ambient", ambient: true, frostedRim: true, innerGlow: true, prismEdge: true, atmosphere: "freezing_ice_storm", uiElementFx: "cryo_frost", iconPackStyle: "cryo_crystal", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    scrapyard_shrapnel_vortex: T({
        name: "Junkyard Magnetic Maelstrom",
        short_name: "Scrap Maelstrom",
        background_color: "#0d0906",
        font_color: "#f5efe6",
        accent_color: "#fb923c",
        secondary_accent: "#38bdf8",
        card_background: "#1c140e",
        card_border: "#8c6749",
        description: "Industrial electromagnet maelstrom ripping corrugated metal shingles, copper arcs, and welding sparks across steel chrome",
        is_dark: true,
        fx: { glow: "plasma", glowColor: "#fb923c", glowColor2: "#38bdf8", glowIntensity: 0.85, blur: 16, glass: 0.45, grain: "film", scanlines: "none", sheen: true, radius: "sharp", border: "metal", motion: "snappy", ambient: true, backdropStyle: "oled", cursorEffect: "magnetic", vignette: "cinema", innerGlow: true, frostedRim: true, parallax: true, atmosphere: "junkyard_maelstrom", uiElementFx: "tesla_arcs", iconPackStyle: "inferno", fontProfile: "terminal", cornerProfile: "sharp", iconGlow: "neon" },
    }),
    jovian_red_spot_storm: T({
        name: "Jupiter Great Red Spot",
        short_name: "Jovian Storm",
        background_color: "#120704",
        font_color: "#fff2eb",
        accent_color: "#ff7849",
        secondary_accent: "#fbbf24",
        card_background: "#24100a",
        card_border: "#a8573c",
        description: "400-year anticyclonic gas-giant vortex with turbulent ammonia cloud bands, Galilean super-bolts, and liquid-mercury chrome",
        is_dark: true,
        fx: { glow: "bloom", glowColor: "#ff7849", glowColor2: "#fbbf24", glowIntensity: 0.85, blur: 22, glass: 0.52, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "calm", ambient: true, backdropStyle: "liquid", cursorEffect: "magnetic", vignette: "ambient", innerGlow: true, frostedRim: true, parallax: true, atmosphere: "jupiter_red_spot", uiElementFx: "mercury_chrome", iconPackStyle: "liquid_gems", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "neon" },
    }),
    neptune_diamond_squall: T({
        name: "Neptune Supersonic Diamond Rain",
        short_name: "Diamond Rain",
        background_color: "#02081a",
        font_color: "#eef6ff",
        accent_color: "#60a5fa",
        secondary_accent: "#c084fc",
        card_background: "#071433",
        card_border: "#3b62a6",
        description: "2,000-km/h ice-giant methane gale precipitating glittering octahedral diamond crystals and 3D liquid-gem icons",
        is_dark: true,
        fx: { glow: "aurora", glowColor: "#60a5fa", glowColor2: "#c084fc", glowIntensity: 0.85, blur: 24, glass: 0.6, grain: "none", scanlines: "none", sheen: true, radius: "squircle", border: "iridescent", motion: "spring", backdropStyle: "liquid", cursorEffect: "prism", vignette: "ambient", prismEdge: true, frostedRim: true, innerGlow: true, parallax: true, ambient: true, atmosphere: "neptune_diamond_rain", uiElementFx: "cryo_frost", iconPackStyle: "liquid_gems", fontProfile: "scifi", cornerProfile: "rounded", iconGlow: "hyper" },
    }),
    tahoe_studio_3d: T({
        name: "macOS Tahoe 3D Glass & Picture Studio",
        short_name: "Tahoe 3D Studio",
        background_color: "#081426",
        font_color: "#f2f8ff",
        accent_color: "#38bdf8",
        secondary_accent: "#818cf8",
        card_background: "#10233d",
        card_border: "#4b83bd",
        description: "High-end macOS Tahoe 3D sculpted regular folders with translucent Liquid Glass pockets, studio-framed picture icons, and Display-P3 caustics",
        is_dark: true,
        fx: { glow: "bloom", glowColor: "#38bdf8", glowColor2: "#818cf8", glowIntensity: 0.8, blur: 30, glass: 0.72, grain: "none", scanlines: "none", sheen: true, radius: "squircle", border: "iridescent", motion: "spring", backdropStyle: "liquid", cursorEffect: "prism", vignette: "ambient", prismEdge: true, frostedRim: true, innerGlow: true, parallax: true, ambient: true, atmosphere: "liquid_glass_caustics+prism_spectrum", uiElementFx: "tahoe_glass_folders", iconPackStyle: "macos_tahoe_3d", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "subtle" },
    }),
    m4_pro_display_xdr: T({
        name: "M4 Max Pro Display XDR Titanium",
        short_name: "M4 Max XDR",
        background_color: "#050609",
        font_color: "#f4f7fb",
        accent_color: "#60a5fa",
        secondary_accent: "#c084fc",
        card_background: "#0d111a",
        card_border: "#566890",
        description: "Space-Black machined titanium workstation with 1600-nit XDR specular rim folders, 8K RAW camera picture plates, and 120Hz ProMotion raytraced prisms",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#60a5fa", glowColor2: "#c084fc", glowIntensity: 0.75, blur: 28, glass: 0.64, grain: "subtle", scanlines: "none", sheen: true, radius: "round", border: "metal", motion: "spring", backdropStyle: "oled", cursorEffect: "spotlight", vignette: "subtle", prismEdge: true, frostedRim: true, innerGlow: true, parallax: true, ambient: true, atmosphere: "m4_raytrace_prism", uiElementFx: "xdr_titanium_folders", iconPackStyle: "pro_studio_xdr", fontProfile: "default", cornerProfile: "rounded", iconGlow: "subtle" },
    }),
    win11_rtx_fluent_3d: T({
        name: "Windows 11 Fluent 3D & RTX Studio",
        short_name: "Win11 Fluent 3D",
        background_color: "#0b101b",
        font_color: "#f1f5f9",
        accent_color: "#60cdff",
        secondary_accent: "#fbbf24",
        card_background: "#151e30",
        card_border: "#5271a3",
        description: "Layered Windows 11 Fluent 3D amber-and-cobalt regular folders, DirectX 12 Mica & Acrylic depth cards, and framed gallery picture icons",
        is_dark: true,
        fx: { glow: "bloom", glowColor: "#60cdff", glowColor2: "#fbbf24", glowIntensity: 0.78, blur: 26, glass: 0.62, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "gradient", motion: "spring", backdropStyle: "mica", cursorEffect: "spotlight", vignette: "ambient", frostedRim: true, innerGlow: true, parallax: true, ambient: true, atmosphere: "aurora", uiElementFx: "fluent_mica_folders", iconPackStyle: "win11_fluent_pro", fontProfile: "default", cornerProfile: "rounded", iconGlow: "subtle" },
    }),
    hdr_cinema_gallery: T({
        name: "8K HDR Photo & Cinema Studio",
        short_name: "8K Photo Studio",
        background_color: "#09080c",
        font_color: "#f8f5ff",
        accent_color: "#f59e0b",
        secondary_accent: "#38bdf8",
        card_background: "#15131c",
        card_border: "#856f56",
        description: "Color-calibrated darkroom & cinema suite with gallery-framed picture icons, 35mm contact-sheet folders, and Display-P3 warm specular highlights",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#f59e0b", glowColor2: "#38bdf8", glowIntensity: 0.72, blur: 24, glass: 0.58, grain: "subtle", scanlines: "none", sheen: true, radius: "round", border: "metal", motion: "cinematic", backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "cinema", frostedRim: true, innerGlow: true, ambient: true, atmosphere: "liquid_glass_caustics", uiElementFx: "tahoe_glass_folders", iconPackStyle: "hdr_photo_studio", fontProfile: "editorial", cornerProfile: "rounded", iconGlow: "subtle" },
    }),
    linux_workstation_hidpi: T({
        name: "Linux Papirus HiDPI Workstation",
        short_name: "Linux HiDPI",
        background_color: "#0c1418",
        font_color: "#ecfdf5",
        accent_color: "#10b981",
        secondary_accent: "#38bdf8",
        card_background: "#132229",
        card_border: "#3c8c84",
        description: "Crisp Linux KDE Breeze & Papirus HiDPI workstation with emerald/teal regular folders, developer topic badges, and low-latency snappy glass",
        is_dark: true,
        fx: { glow: "soft", glowColor: "#10b981", glowColor2: "#38bdf8", glowIntensity: 0.74, blur: 22, glass: 0.56, grain: "none", scanlines: "none", sheen: true, radius: "soft", border: "gradient", motion: "snappy", backdropStyle: "glass", cursorEffect: "spotlight", vignette: "subtle", frostedRim: true, innerGlow: true, ambient: true, atmosphere: "northern_pillars", uiElementFx: "tahoe_glass_folders", iconPackStyle: "linux_papirus_pro", fontProfile: "default", cornerProfile: "rounded", iconGlow: "subtle" },
    }),
    studio_architect_minimal: T({
        name: "Studio Architect Minimal",
        short_name: "Studio Minimal",
        background_color: "#f4f6f9",
        font_color: "#111827",
        accent_color: "#0369a1",
        secondary_accent: "#4f46e5",
        card_background: "#ffffff",
        card_border: "#5b6b82",
        description: "Bright architectural studio with tactile 3D paper-and-glass regular folders, gallery picture frames, and calm daylight ergonomics",
        is_dark: false,
        fx: { glow: "soft", glowColor: "#0369a1", glowColor2: "#4f46e5", glowIntensity: 0.45, blur: 22, glass: 0.68, grain: "none", scanlines: "none", sheen: true, radius: "round", border: "metal", motion: "calm", backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "subtle", frostedRim: true, innerGlow: true, ambient: true, uiElementFx: "fluent_mica_folders", iconPackStyle: "nordic_minimal", fontProfile: "rounded", cornerProfile: "rounded", iconGlow: "off" },
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
    tesla: "tesla_coil_plasma",
    tesla_coil: "tesla_coil_plasma",
    wardenclyffe: "wardenclyffe_tower",
    plasma_globe: "nikola_plasma_globe",
    jacobs_ladder: "jacobs_ladder_arc",
    tokamak: "tokamak_fusion",
    cherenkov: "cherenkov_reactor",
    hadron_collider: "cern_synchrotron",
    lorenz: "lorentz_chaos",
    ferrofluid: "ferrofluid_spike",
    hawking: "hawking_horizon",
    gravwave: "ligo_gravwave",
    meissner: "meissner_superconductor",
    antimatter: "antimatter_penning",
    dyson: "dyson_megastructure",
    alcubierre: "alcubierre_metric",
    lissajous: "lissajous_scope",
    arc_reactor: "arc_reactor_mk",
    tornado: "ef5_debris_tornado",
    fire_folders: "inferno_fire_folders",
    slime: "toxic_slime_ooze",
    cyclone: "urban_street_cyclone",
    noreaster: "autumn_noreaster_gale",
    supercell: "supercell_emerald_vortex",
    hurricane: "category_5_eyewall",
    red_sprite: "mesosphere_red_sprite",
    icicle: "cryo_icicle_blizzard",
    maelstrom: "scrapyard_shrapnel_vortex",
    jupiter: "jovian_red_spot_storm",
    neptune: "neptune_diamond_squall",
    tahoe_3d: "tahoe_studio_3d",
    m4_xdr: "m4_pro_display_xdr",
    win11_3d: "win11_rtx_fluent_3d",
    photo_studio: "hdr_cinema_gallery",
    linux_hidpi: "linux_workstation_hidpi",
    studio_minimal: "studio_architect_minimal",
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
    tesla_coil_plasma: "dracula",
    wardenclyffe_tower: "amethyst",
    nikola_plasma_globe: "cyberpunk",
    jacobs_ladder_arc: "amber_crt",
    ball_lightning_storm: "tokyo_night",
    tokamak_fusion: "rose_pine",
    cherenkov_reactor: "midnight",
    cern_synchrotron: "tokyo_night",
    lorentz_chaos: "sonoma_emerald",
    ferrofluid_spike: "titanium_slate",
    hawking_horizon: "oled_black",
    ligo_gravwave: "nord",
    meissner_superconductor: "abyss",
    antimatter_penning: "rose_pine",
    dyson_megastructure: "ventura_amber",
    alcubierre_metric: "tokyo_night",
    lissajous_scope: "matrix_phosphor",
    quark_chromodynamics: "dracula",
    arc_reactor_mk: "midnight",
    st_elmos_corona: "tokyo_night",
    van_de_graaff_day: "solarized_light",
    cern_control_day: "github_light",
    ef5_debris_tornado: "sonoma_emerald",
    inferno_fire_folders: "sunset_orange",
    toxic_slime_ooze: "matrix_phosphor",
    urban_street_cyclone: "tokyo_night",
    autumn_noreaster_gale: "ventura_amber",
    supercell_emerald_vortex: "emerald",
    category_5_eyewall: "midnight",
    mesosphere_red_sprite: "rose_pine",
    cryo_icicle_blizzard: "nord",
    scrapyard_shrapnel_vortex: "amber_crt",
    jovian_red_spot_storm: "sunset_orange",
    neptune_diamond_squall: "abyss",
    tahoe_studio_3d: "apple_dark",
    m4_pro_display_xdr: "oled_black",
    win11_rtx_fluent_3d: "midnight",
    hdr_cinema_gallery: "ventura_amber",
    linux_workstation_hidpi: "sonoma_emerald",
    studio_architect_minimal: "nordic_paper",
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
    squircle: [5, 10, 14, 20, 28, 999],
};

const MOTION: Record<FxMotion, { instant: number; fast: number; base: number; slow: number; ambient: number; stagger: number; hover: number; press: number; ease: string }> = {
    calm: { instant: 80, fast: 180, base: 320, slow: 560, ambient: 12000, stagger: 45, hover: 1.01, press: 0.99, ease: "cubic-bezier(0.4, 0, 0.2, 1)" },
    spring: { instant: 70, fast: 150, base: 280, slow: 500, ambient: 9000, stagger: 50, hover: 1.02, press: 0.98, ease: "cubic-bezier(0.16, 1, 0.3, 1)" },
    snappy: { instant: 50, fast: 100, base: 180, slow: 320, ambient: 6000, stagger: 28, hover: 1.03, press: 0.97, ease: "cubic-bezier(0.22, 1, 0.36, 1)" },
    elastic: { instant: 60, fast: 140, base: 260, slow: 480, ambient: 7500, stagger: 38, hover: 1.035, press: 0.965, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    cinematic: { instant: 110, fast: 240, base: 440, slow: 760, ambient: 16000, stagger: 65, hover: 1.015, press: 0.99, ease: "cubic-bezier(0.25, 1, 0.5, 1)" },
    zero: { instant: 0, fast: 0, base: 0, slow: 0, ambient: 0, stagger: 0, hover: 1, press: 1, ease: "linear" },
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
    const rad = RADII[fx.radius] ?? RADII.round;
    const mo = MOTION[fx.motion] ?? MOTION.spring;
    const none = "0 0 0 0 rgba(0, 0, 0, 0)";
    const intensity = clamp(fx.glowIntensity ?? 1, 0, 1);
    const glowRgba = (color: string, alpha: number) => rgba(color, alpha * intensity);
    const neon = fx.glow === "neon" || fx.glow === "laser" || fx.glow === "plasma";
    const bloom = fx.glow === "bloom" || fx.glow === "aurora" || fx.glow === "ember";
    const glowSoft =
        fx.glow === "none"
            ? none
            : fx.glow === "laser"
              ? `0 0 0 1px ${glowRgba(g1, 0.65)}, 0 0 6px ${glowRgba(g1, 0.55)}`
              : bloom
                ? `0 0 0 1px ${glowRgba(g1, 0.28)}, 0 0 18px ${glowRgba(g1, 0.32)}, 0 0 36px ${glowRgba(g2, 0.2)}`
                : `0 0 0 1px ${glowRgba(g1, neon ? 0.35 : 0.22)}, 0 0 ${neon ? 14 : 10}px ${glowRgba(g1, neon ? 0.38 : 0.22)}`;
    const glowMed =
        fx.glow === "none"
            ? none
            : fx.glow === "laser"
              ? `0 0 0 1.5px ${glowRgba(g1, 0.85)}, 0 0 10px ${glowRgba(g1, 0.72)}, 0 0 24px ${glowRgba(g2, 0.38)}`
              : bloom
                ? `0 0 0 1px ${glowRgba(g1, 0.44)}, 0 0 28px ${glowRgba(g1, 0.45)}, 0 0 64px ${glowRgba(g2, 0.32)}`
                : `0 0 0 1px ${glowRgba(g1, neon ? 0.55 : 0.34)}, 0 0 ${neon ? 22 : 16}px ${glowRgba(g1, neon ? 0.5 : 0.32)}, 0 0 ${neon ? 48 : 32}px ${glowRgba(g2, neon ? 0.26 : 0.14)}`;
    const glowStrong =
        fx.glow === "none"
            ? none
            : fx.glow === "laser"
              ? `0 0 0 2px ${glowRgba(g1, 0.95)}, 0 0 16px ${glowRgba(g1, 0.88)}, 0 0 42px ${glowRgba(g2, 0.52)}`
              : bloom
                ? `0 0 0 1px ${glowRgba(g1, 0.62)}, 0 0 40px ${glowRgba(g1, 0.6)}, 0 0 96px ${glowRgba(g2, 0.46)}`
                : `0 0 0 1px ${glowRgba(g1, neon ? 0.8 : 0.5)}, 0 0 ${neon ? 30 : 22}px ${glowRgba(g1, neon ? 0.68 : 0.42)}, 0 0 ${neon ? 72 : 48}px ${glowRgba(g2, neon ? 0.4 : 0.2)}`;
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
              : fx.border === "hologram" || fx.border === "iridescent"
                ? `linear-gradient(135deg, ${rgba(g1, 0.95)}, rgba(255, 120, 220, 0.72) 25%, ${rgba(g2, 0.9)} 50%, rgba(90, 255, 210, 0.75) 75%, ${rgba(g1, 0.95)})`
                : fx.border === "neon"
                  ? `linear-gradient(135deg, ${rgba(g1, 1)}, ${rgba(g2, 0.95)})`
                  : fx.border === "bevel"
                    ? isDark
                        ? "linear-gradient(180deg, rgba(255, 255, 255, 0.48), rgba(255, 255, 255, 0.08) 45%, rgba(0, 0, 0, 0.55))"
                        : "linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(140, 155, 175, 0.25) 45%, rgba(30, 45, 65, 0.38))"
                    : `linear-gradient(135deg, ${rgba(g1, 0.9)}, ${rgba(g2, 0.45)} 48%, ${rgba(g2, 0.9)})`;
    const sheen = isDark
        ? `linear-gradient(115deg, transparent 38%, ${rgba(g1, 0.16)} 50%, transparent 62%)`
        : `linear-gradient(115deg, transparent 38%, rgba(255, 255, 255, 0.7) 50%, transparent 62%)`;
    const focus = focusRingColor({ accent_color: theme.accent_color, background_color: theme.background_color, card_background: card, is_dark: isDark });
    const sh = shadowStack(isDark, g1);
    const borderAlpha = clamp(fx.borderOpacity ?? (isDark ? (fx.border === "metal" ? 0.2 : 0.13) : (fx.border === "metal" ? 0.22 : 0.16)), 0, 1);
    const glassBorder = isDark ? `rgba(255, 255, 255, ${borderAlpha})` : `rgba(20, 30, 40, ${borderAlpha})`;
    const satBase = fx.saturation !== undefined ? String(Math.round(clamp(fx.saturation, 0.5, 2.2) * 100) / 100) : fx.glass > 0.3 ? "1.35" : "1.1";
    const satUltra = fx.saturation !== undefined ? String(Math.round(clamp(fx.saturation * 1.22, 0.6, 2.5) * 100) / 100) : fx.glass > 0.3 ? "1.65" : "1.28";
    const scanOpacity = fx.scanlines === "subtle" ? "0.035" : fx.scanlines === "crt" ? "0.04" : fx.scanlines === "interlace" ? "0.03" : "0";
    const grainOpacity = fx.grain === "subtle" ? "0.035" : fx.grain === "film" ? "0.04" : fx.grain === "halftone" ? "0.038" : "0";
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
        ["--fx-saturate", satBase],
        ["--fx-saturate-ultra", satUltra],
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
        ["--fx-scanline-opacity", scanOpacity],
        ["--fx-grain-opacity", grainOpacity],
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
    else if (fx.scanlines && fx.scanlines !== "none") a["data-fx-scan"] = fx.scanlines;
    if (fx.grain === "subtle") a["data-fx-grain"] = "on";
    else if (fx.grain && fx.grain !== "none") a["data-fx-grain"] = fx.grain;
    if (fx.sheen) a["data-fx-sheen"] = "on";
    if (fx.noise) a["data-fx-noise"] = "on";
    if (fx.chromatic) a["data-fx-ca"] = "on";
    if (fx.ambient) a["data-fx-ambient"] = "on";
    if (fx.atmosphere && fx.atmosphere !== "none") a["data-fx-atmosphere"] = fx.atmosphere;
    if (fx.backdropStyle && fx.backdropStyle !== "glass") a["data-fx-backdrop"] = fx.backdropStyle;
    if (fx.cursorEffect && fx.cursorEffect !== "none") a["data-fx-cursor"] = fx.cursorEffect;
    if (fx.vignette && fx.vignette !== "none") a["data-fx-vignette"] = fx.vignette;
    if (fx.prismEdge) a["data-fx-prism"] = "on";
    if (fx.innerGlow) a["data-fx-inner-glow"] = "on";
    if (fx.frostedRim) a["data-fx-rim"] = "on";
    if (fx.neonPulse) a["data-fx-pulse"] = "on";
    if (fx.crtCurve) a["data-fx-crt"] = "on";
    if (fx.parallax) a["data-fx-parallax"] = "on";
    if (fx.uiElementFx && fx.uiElementFx !== "off") a["data-fx-element"] = fx.uiElementFx;
    if (fx.iconPackStyle && fx.iconPackStyle !== "default") a["data-fx-icon-pack"] = fx.iconPackStyle;
    if (fx.fontProfile && fx.fontProfile !== "default") a["data-fx-font-profile"] = fx.fontProfile;
    if (fx.cornerProfile && fx.cornerProfile !== "default") a["data-fx-corner-profile"] = fx.cornerProfile;
    if (fx.iconGlow && fx.iconGlow !== "off") a["data-fx-icon-glow"] = fx.iconGlow;
    return a;
}

export function fxRootAttrString(theme: SimpleGUITheme | undefined | null, mode: FxMode = "on", tier?: FxHardwareTier): string {
    return Object.entries(fxRootAttrs(theme, mode, tier)).map(([k, v]) => `${k}="${v}"`).join(" ");
}

/**
 * 12 curated 1-click Effect Style Presets that can be applied on top of any color palette
 * in the Theme Editor without overwriting the user's primary colors.
 */
export interface FxStylePreset {
    id: string;
    label: string;
    summary: string;
    fx: Partial<ThemeFx>;
}

export const FX_STYLE_PRESETS: readonly FxStylePreset[] = [
    {
        id: "liquid_glass",
        label: "Tahoe Liquid Glass",
        summary: "macOS 26 specular refraction, frosted rim, and fluid spring motion",
        fx: { glass: 0.68, blur: 28, glow: "bloom", radius: "squircle", border: "iridescent", motion: "spring", backdropStyle: "liquid", cursorEffect: "prism", vignette: "subtle", sheen: true, frostedRim: true, innerGlow: true, ambient: true },
    },
    {
        id: "m4_xdr_pro",
        label: "M4 Space Black XDR",
        summary: "OLED carbon surface, brushed titanium border, and Display-P3 bloom",
        fx: { glass: 0.56, blur: 24, glow: "soft", radius: "round", border: "metal", motion: "spring", backdropStyle: "oled", cursorEffect: "spotlight", vignette: "subtle", sheen: true, noise: true, frostedRim: true, ambient: true },
    },
    {
        id: "win11_mica",
        label: "Windows 11 Mica Alt",
        summary: "DirectComposition high-saturation tinted backdrop with crisp Fluent bevel",
        fx: { glass: 0.52, blur: 26, glow: "soft", radius: "soft", border: "bevel", motion: "calm", backdropStyle: "mica", cursorEffect: "spotlight", vignette: "none", sheen: false, noise: true, ambient: true, saturation: 1.55 },
    },
    {
        id: "win11_acrylic",
        label: "Windows 11 Acrylic",
        summary: "Translucent Gaussian blur with micro-noise grain and Reveal highlight",
        fx: { glass: 0.62, blur: 22, glow: "soft", radius: "soft", border: "gradient", motion: "snappy", backdropStyle: "acrylic", cursorEffect: "ripple", grain: "subtle", sheen: true, noise: true, frostedRim: true },
    },
    {
        id: "cyber_hologram",
        label: "Cyberpunk Hologram",
        summary: "Chromatic dispersion, hologram border, laser glow, and CRT scanlines",
        fx: { glass: 0.58, blur: 20, glow: "laser", radius: "sharp", border: "hologram", motion: "snappy", backdropStyle: "glass", cursorEffect: "prism", vignette: "cinema", scanlines: "subtle", chromatic: true, prismEdge: true, neonPulse: true, sheen: true },
    },
    {
        id: "prismatic_crystal",
        label: "Prismatic Crystal",
        summary: "Iridescent diamond edges, chromatic aberration, and elastic bounce",
        fx: { glass: 0.65, blur: 26, glow: "aurora", radius: "round", border: "iridescent", motion: "elastic", backdropStyle: "frosted", cursorEffect: "prism", vignette: "ambient", chromatic: true, prismEdge: true, innerGlow: true, frostedRim: true, sheen: true },
    },
    {
        id: "retro_crt",
        label: "Retro CRT Phosphor",
        summary: "Curved CRT scanlines, analog film grain, and warm phosphor bloom",
        fx: { glass: 0.35, blur: 10, glow: "ember", radius: "soft", border: "double", motion: "snappy", backdropStyle: "oled", cursorEffect: "spotlight", vignette: "cinema", scanlines: "crt", grain: "film", crtCurve: true, innerGlow: true, neonPulse: true },
    },
    {
        id: "plasma_reactor",
        label: "Plasma Reactor",
        summary: "High-energy plasma halo, pulsing neon border, and ambient blooms",
        fx: { glass: 0.55, blur: 24, glow: "plasma", radius: "round", border: "neon", motion: "elastic", backdropStyle: "glass", cursorEffect: "magnetic", vignette: "ambient", sheen: true, innerGlow: true, neonPulse: true, ambient: true, parallax: true },
    },
    {
        id: "velvet_cinema",
        label: "Velvet Cinema",
        summary: "Deep theatrical vignette, 35mm film grain, and slow cinematic easing",
        fx: { glass: 0.45, blur: 20, glow: "bloom", radius: "round", border: "gradient", motion: "cinematic", backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "cinema", grain: "film", ambient: true, innerGlow: true },
    },
    {
        id: "halftone_zine",
        label: "Halftone Pop Zine",
        summary: "Halftone dot texture, double borders, crisp corners, and snappy motion",
        fx: { glass: 0.25, blur: 8, glow: "neon", radius: "sharp", border: "double", motion: "snappy", backdropStyle: "matte", cursorEffect: "magnetic", grain: "halftone", chromatic: true },
    },
    {
        id: "aurora_silk",
        label: "Aurora Silk",
        summary: "Soft northern-lights diffusion, pill corners, and calm ambient drift",
        fx: { glass: 0.6, blur: 30, glow: "aurora", radius: "pill", border: "gradient", motion: "calm", backdropStyle: "liquid", cursorEffect: "spotlight", vignette: "ambient", sheen: true, innerGlow: true, ambient: true },
    },
    {
        id: "zen_matte",
        label: "Zen Matte Studio",
        summary: "Zero-distraction opaque matte finish with instant response and crisp borders",
        fx: { glass: 0, blur: 0, glow: "none", radius: "soft", border: "flat", motion: "calm", backdropStyle: "matte", cursorEffect: "none", vignette: "none", scanlines: "none", grain: "none", sheen: false, noise: false, chromatic: false, ambient: false },
    },
];

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
