// Semantic status colors (danger, warning, success, info) derived per theme.
// Every pair is contrast-checked: `text` reads on the page and card, `on` reads on `solid`.

export type SemanticKind = "danger" | "warning" | "success" | "info";

export interface SemanticColor {
    /** Fill for buttons, badges and dots. */
    solid: string;
    /** Readable foreground on `solid`. */
    on: string;
    /** Readable foreground on the theme background or card. */
    text: string;
    /** Translucent tint for banners and pill backgrounds. */
    soft: string;
    /** Translucent border that goes with `soft`. */
    border: string;
}

export type SemanticPalette = Record<SemanticKind, SemanticColor>;
export type SemanticOverrides = Partial<Record<SemanticKind, string>>;

// Published status colors of well-known palettes, keyed by theme display name (aliases share the name).
export const NAMED_SEMANTICS: Record<string, SemanticOverrides> = {
    "Dracula": { danger: "#ff5555", warning: "#f1fa8c", success: "#50fa7b", info: "#8be9fd" },
    "Nord": { danger: "#bf616a", warning: "#ebcb8b", success: "#a3be8c", info: "#88c0d0" },
    "Gruvbox Dark": { danger: "#fb4934", warning: "#fabd2f", success: "#b8bb26", info: "#83a598" },
    "Gruvbox Light": { danger: "#9d0006", warning: "#b57614", success: "#79740e", info: "#076678" },
    "Solarized Dark": { danger: "#dc322f", warning: "#b58900", success: "#859900", info: "#268bd2" },
    "Solarized Light": { danger: "#dc322f", warning: "#b58900", success: "#859900", info: "#268bd2" },
    "Catppuccin Mocha": { danger: "#f38ba8", warning: "#f9e2af", success: "#a6e3a1", info: "#74c7ec" },
    "Monokai Pro": { danger: "#ff6188", warning: "#ffd866", success: "#a9dc76", info: "#78dce8" },
    "Tokyo Night": { danger: "#f7768e", warning: "#e0af68", success: "#9ece6a", info: "#7dcfff" },
    "One Dark Pro": { danger: "#e06c75", warning: "#e5c07b", success: "#98c379", info: "#61afef" },
    "GitHub Dark": { danger: "#f85149", warning: "#d29922", success: "#3fb950", info: "#58a6ff" },
    "GitHub Light": { danger: "#cf222e", warning: "#9a6700", success: "#1a7f37", info: "#0969da" },
    "Everforest Dark": { danger: "#e67e80", warning: "#dbbc7f", success: "#a7c080", info: "#7fbbb3" },
    "Kanagawa": { danger: "#e82424", warning: "#ff9e3b", success: "#98bb6c", info: "#7e9cd8" },
    "Windows 3.1": { danger: "#c00000", warning: "#ffff00", success: "#008000", info: "#0000ff" },
    "Windows 95": { danger: "#c00000", warning: "#ffff00", success: "#008000", info: "#0000ff" },
    "Windows 98": { danger: "#c00000", warning: "#ffff00", success: "#008000", info: "#0000ff" },
    "Windows High Contrast": { danger: "#ff6e6e", warning: "#ffff00", success: "#3ff23f", info: "#1aebff" },
    "Windows Terminal Campbell": { danger: "#e74856", warning: "#f9f1a5", success: "#16c60c", info: "#61d6d6" },
};

export function overridesForTheme(theme: { name: string; semantic?: SemanticOverrides }): SemanticOverrides | undefined {
    return theme.semantic ?? NAMED_SEMANTICS[theme.name];
}

export const SEMANTIC_KINDS: readonly SemanticKind[] = ["danger", "warning", "success", "info"];

// Light themes need deeper tones, dark ones need lighter tones, so each mode has its own base.
const BASE_ON_LIGHT: Record<SemanticKind, string> = { danger: "#dc2626", warning: "#d97706", success: "#16a34a", info: "#0284c7" };
const BASE_ON_DARK: Record<SemanticKind, string> = { danger: "#f87171", warning: "#fbbf24", success: "#4ade80", info: "#38bdf8" };

type RGB = [number, number, number];

function clamp(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

export function parseColor(input: string | undefined, fallback: RGB = [128, 128, 128]): RGB {
    if (!input) return fallback;
    const s = input.trim();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (hex) {
        let h = hex[1] as string;
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
    if (rgb) return [clamp(Number(rgb[1])), clamp(Number(rgb[2])), clamp(Number(rgb[3]))];
    return fallback;
}

export function toHex([r, g, b]: RGB): string {
    return "#" + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
}

function luminance([r, g, b]: RGB): number {
    const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
    const la = luminance(parseColor(a));
    const lb = luminance(parseColor(b));
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: RGB, b: RGB, t: number): RGB {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Moves a color toward white or black in small steps until it meets the ratio against every surface.
function reach(color: RGB, surfaces: string[], target: number, toward: RGB): RGB {
    let out = color;
    for (let i = 0; i <= 20; i++) {
        out = mix(color, toward, i * 0.05);
        const hex = toHex(out);
        if (surfaces.every((s) => contrastRatio(hex, s) >= target)) return out;
    }
    return out;
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function pickOn(solid: string): string {
    return contrastRatio(solid, "#ffffff") >= contrastRatio(solid, "#111111") ? "#ffffff" : "#111111";
}

export interface SemanticInput {
    background: string;
    card?: string;
    isDark: boolean;
    overrides?: SemanticOverrides;
}

export function buildSemanticPalette(input: SemanticInput): SemanticPalette {
    const bg = parseColor(input.background, input.isDark ? [15, 23, 42] : [248, 250, 252]);
    const cardRgb = parseColor(input.card, bg);
    const surfaces = [toHex(bg), toHex(cardRgb)];
    const out = {} as SemanticPalette;
    for (const kind of SEMANTIC_KINDS) {
        const base = parseColor(input.overrides?.[kind] ?? (input.isDark ? BASE_ON_DARK[kind] : BASE_ON_LIGHT[kind]));
        const text = reach(base, surfaces, 4.5, input.isDark ? WHITE : BLACK);
        // A fill must stay visible against the card it sits on.
        const solid = toHex(base);
        const solidSafe = contrastRatio(solid, surfaces[1] as string) >= 3 ? solid : toHex(reach(base, surfaces, 3, input.isDark ? WHITE : BLACK));
        let fill = solidSafe;
        let on = pickOn(fill);
        // Nudge the fill away from its label until the pair reaches 4.5:1.
        for (let i = 1; i <= 10 && contrastRatio(on, fill) < 4.5; i++) {
            fill = toHex(mix(parseColor(solidSafe), on === "#ffffff" ? BLACK : WHITE, i * 0.04));
            on = pickOn(fill);
        }
        const [r, g, b] = base;
        out[kind] = {
            solid: fill,
            on,
            text: toHex(text),
            soft: `rgba(${r}, ${g}, ${b}, ${input.isDark ? 0.18 : 0.14})`,
            border: `rgba(${r}, ${g}, ${b}, 0.5)`,
        };
    }
    return out;
}

/** CSS custom properties for a palette (`--danger`, `--danger-on`, `--danger-text`, `--danger-soft`, `--danger-border`, ...). */
export function semanticCssVars(p: SemanticPalette): string {
    return SEMANTIC_KINDS.map((k) => {
        const c = p[k];
        return `--${k}: ${c.solid}; --${k}-on: ${c.on}; --${k}-text: ${c.text}; --${k}-soft: ${c.soft}; --${k}-border: ${c.border};`;
    }).join(" ");
}

export function normalizeKind(v: unknown): SemanticKind | null {
    switch (String(v ?? "").toLowerCase()) {
        case "danger":
        case "error":
        case "critical":
        case "destructive":
            return "danger";
        case "warning":
        case "warn":
        case "caution":
            return "warning";
        case "success":
        case "ok":
        case "good":
            return "success";
        case "info":
        case "information":
            return "info";
        default:
            return null;
    }
}
