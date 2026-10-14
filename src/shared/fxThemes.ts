// Futuristic themes plus the `fx` descriptor that turns a theme into a token set for the motion/interaction layer.
// A theme without `fx` produces no fx output at all; see src/shared/fxCss.ts for the CSS and fxPointer.ts for the helper.
import type { SimpleGUITheme } from "../simplegui";
import { buildSemanticPalette, contrastRatio, overridesForTheme, parseColor, toHex } from "./themeSemantic";

export type FxGlow = "none" | "soft" | "neon";
export type FxRadius = "sharp" | "soft" | "round" | "pill";
export type FxBorder = "flat" | "gradient" | "metal";
export type FxMotion = "calm" | "spring" | "snappy";
export type FxMode = "on" | "reduced" | "off";

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
};

export const FX_THEME_KEYS: string[] = Object.keys(FX_THEMES);

/** Short, memorable alternative names, resolved by getTheme() like the other theme aliases. */
export const FX_THEME_ALIASES: Record<string, string> = {
    hologram: "cyberpunk_hologram",
    cyberpunk_holo: "cyberpunk_hologram",
    holo: "cyberpunk_hologram",
    hud: "neon_hud",
    obsidian: "quantum_obsidian",
    quantum: "quantum_obsidian",
    oled_obsidian: "quantum_obsidian",
    nebula: "deep_space",
    space: "deep_space",
    titanium_metal: "liquid_metal",
    liquid_metal_dark: "liquid_metal",
    aurora: "titanium_aurora",
    metal_light: "liquid_metal_light",
    liquid_metal_day: "liquid_metal_light",
    neo_tokyo: "neo_tokyo_dark",
    neotokyo: "neo_tokyo_dark",
    neo_tokyo_night: "neo_tokyo_dark",
    neo_tokyo_light: "neo_tokyo_day",
    solar: "synthetic_solar",
    synthetic_sun: "synthetic_solar",
    glass_aurora: "aurora_glass",
    violet_plasma: "plasma_violet",
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

/** Colour of the focus ring: the accent, moved toward white or black only if it does not reach 3:1 on both surfaces. */
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
    "--fx-glow-color", "--fx-glow-color-2", "--fx-glow-soft", "--fx-glow-med", "--fx-glow-strong",
    "--fx-blur-sm", "--fx-blur-md", "--fx-blur-lg", "--fx-glass-bg", "--fx-glass-bg-strong", "--fx-glass-solid", "--fx-glass-border", "--fx-glass-alpha", "--fx-saturate",
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
    const neon = fx.glow === "neon";
    const glowSoft = fx.glow === "none" ? none : `0 0 0 1px ${rgba(g1, neon ? 0.35 : 0.22)}, 0 0 ${neon ? 14 : 10}px ${rgba(g1, neon ? 0.38 : 0.22)}`;
    const glowMed = fx.glow === "none" ? none : `0 0 0 1px ${rgba(g1, neon ? 0.55 : 0.34)}, 0 0 ${neon ? 22 : 16}px ${rgba(g1, neon ? 0.5 : 0.32)}, 0 0 ${neon ? 48 : 32}px ${rgba(g2, neon ? 0.26 : 0.14)}`;
    const glowStrong = fx.glow === "none" ? none : `0 0 0 1px ${rgba(g1, neon ? 0.8 : 0.5)}, 0 0 ${neon ? 30 : 22}px ${rgba(g1, neon ? 0.68 : 0.42)}, 0 0 ${neon ? 72 : 48}px ${rgba(g2, neon ? 0.4 : 0.2)}`;
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
    const glassBorder = isDark ? `rgba(255, 255, 255, ${fx.border === "metal" ? 0.2 : 0.13})` : `rgba(20, 30, 40, ${fx.border === "metal" ? 0.22 : 0.16})`;
    const vars: Array<[string, string]> = [
        ["--fx-glow-color", g1],
        ["--fx-glow-color-2", g2],
        ["--fx-glow-soft", glowSoft],
        ["--fx-glow-med", glowMed],
        ["--fx-glow-strong", glowStrong],
        ["--fx-blur-sm", `${Math.round(blur * 0.4)}px`],
        ["--fx-blur-md", `${blur}px`],
        ["--fx-blur-lg", `${Math.min(40, Math.round(blur * 1.6))}px`],
        ["--fx-glass-bg", rgba(card, glass.alpha)],
        ["--fx-glass-bg-strong", rgba(card, Math.min(1, glass.alpha + 0.12))],
        ["--fx-glass-solid", toHex(parseColor(card))],
        ["--fx-glass-border", glassBorder],
        ["--fx-glass-alpha", String(glass.alpha)],
        ["--fx-saturate", fx.glass > 0.3 ? "1.35" : "1.1"],
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
export function fxRootAttrs(theme: SimpleGUITheme | undefined | null, mode: FxMode = "on"): Record<string, string> {
    const fx = theme?.fx;
    if (!fx) return {};
    const a: Record<string, string> = { "data-fx": mode };
    a["data-fx-border"] = fx.border;
    a["data-fx-glow"] = fx.glow;
    a["data-fx-motion"] = fx.motion;
    if (fx.scanlines === "subtle") a["data-fx-scan"] = "on";
    if (fx.grain === "subtle") a["data-fx-grain"] = "on";
    if (fx.sheen) a["data-fx-sheen"] = "on";
    if (fx.noise) a["data-fx-noise"] = "on";
    if (fx.chromatic) a["data-fx-ca"] = "on";
    if (fx.ambient) a["data-fx-ambient"] = "on";
    return a;
}

export function fxRootAttrString(theme: SimpleGUITheme | undefined | null, mode: FxMode = "on"): string {
    return Object.entries(fxRootAttrs(theme, mode)).map(([k, v]) => `${k}="${v}"`).join(" ");
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
 * Code colours for a theme, worked out from its accent, secondary and status colours. There is no per-theme syntax
 * table in the Designer, so editors that want one use this; every colour reads at 4.5:1 or better on the theme's canvas.
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
