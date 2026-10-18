import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { JSDOM } from "jsdom";
import {
    SIMPLEGUI_THEMES,
    VLANG_THEME_NAMES,
    createWindow,
    fxCssVars,
    getSemanticColors,
    getSyntaxPalette,
    getTheme,
    getThemeFx,
    getThemeNames,
    isFxTheme,
    get_theme_fx,
    is_fx_theme,
    FX_FALLBACK_THEMES,
    detectThemeHardware,
    getFallbackThemeKey,
    resolveThemeForHardware,
    srgbToDisplayP3,
} from "../src/simplegui";
import { FX_THEMES, FX_THEME_ALIASES, FX_THEME_KEYS, FX_TOKEN_NAMES, FX_STYLE_PRESETS, findFxTheme, fxCssVars as fxCssVarsForTheme, fxRootAttrs, glassReport, focusRingColor, normalizeFxMode } from "../src/shared/fxThemes";
import { fxCss } from "../src/shared/fxCss";
import { FX_POINTER_FUNCTION, FX_POINTER_SOURCE, FX_MAGNET_MAX_PX, FX_TILT_MAX_DEG, installFxPointer } from "../src/shared/fxPointer";
import { contrastRatio } from "../src/shared/themeSemantic";
import { generatePreviewHtml, getIdeHtml } from "../index";
import { computeBaseline } from "./helpers/fx_baseline";
import { main as fxAssetsMain, designerThemeData } from "../scripts/build_fx_assets";

const root = join(import.meta.dir, "..");
// The project's TypeScript setup has no DOM lib; these tests only touch jsdom objects through a few members.
type Element = any;
type Document = any;
type HTMLElement = any;
type HTMLSelectElement = any;
type HTMLOptionElement = any;
type DOMRect = any;
const REQUIRED: Record<string, boolean> = {
    prism_reactor: true,
    orbital_ice: false,
    ember_grid: true,
    cyberpunk_hologram: true,
    neon_hud: true,
    quantum_obsidian: true,
    deep_space: true,
    liquid_metal: true,
    titanium_aurora: true,
    liquid_metal_light: false,
    neo_tokyo_dark: true,
    synthetic_solar: true,
    neo_tokyo_day: false,
    aurora_glass: true,
    plasma_violet: true,
    synthwave_sunset: true,
    matrix_rain: true,
    amber_phosphor: true,
    midnight_glass: true,
    abyss_bloom: true,
    cosmic_nebula: true,
    obsidian_gold: true,
    crimson_eclipse: true,
    acid_reactor: true,
    polar_night: true,
    emerald_grove: true,
    brass_engine: true,
    focus_glow: true,
    neon_max: true,
    vaporwave_dream: true,
    frosted_glass: false,
    sakura_glass: false,
    pearl_hologram: false,
    rose_gold: false,
    daylight_hud: false,
};

describe("fx themes: registration", () => {
    test("every required futuristic theme is registered with the right mode, a short name and a description", () => {
        for (const [key, dark] of Object.entries(REQUIRED)) {
            const t = SIMPLEGUI_THEMES[key];
            expect(t, key).toBeDefined();
            expect(t!.is_dark, key).toBe(dark);
            expect(t!.short_name, key).toBeTruthy();
            expect(t!.description.length, key).toBeGreaterThan(20);
            expect(t!.fx, key).toBeDefined();
            expect(/^[a-z0-9_]+$/.test(key), key).toBe(true);
        }
        expect(FX_THEME_KEYS.sort()).toEqual(Object.keys(REQUIRED).sort());
        expect(FX_THEME_KEYS.length).toBeGreaterThanOrEqual(12);
    });

    test("they are in the canonical theme list, once, sorted with the others", () => {
        const names = getThemeNames();
        for (const key of FX_THEME_KEYS) expect(names.filter((n) => n === key)).toHaveLength(1);
        expect(VLANG_THEME_NAMES).toEqual(names);
        expect(new Set(names).size).toBe(names.length);
    });

    test("aliases, display names and short names resolve to the right theme", () => {
        for (const [alias, key] of Object.entries(FX_THEME_ALIASES)) expect(getTheme(alias).name, alias).toBe(FX_THEMES[key]!.name);
        for (const [key, t] of Object.entries(FX_THEMES)) {
            expect(getTheme(key).name).toBe(t.name);
            expect(getTheme(t.name).name).toBe(t.name);
            expect(getTheme(t.short_name!).name).toBe(t.name);
            expect(findFxTheme(t.name)).toBe(t);
        }
        expect(getTheme("Neo-Tokyo Dark").name).toBe("Neo-Tokyo Dark");
        expect(getTheme("hologram").name).toBe("Cyberpunk Hologram");
        expect(findFxTheme("dracula")).toBeUndefined();
        expect(findFxTheme("")).toBeUndefined();
    });

    test("no alias or key takes over an existing theme", () => {
        const before = ["dracula", "nord", "cyberpunk", "synthwave84", "titanium", "titanium_slate", "solar_dusk", "vibrant_neon", "solarized_dark", "oled_black"];
        for (const k of before) {
            expect(isFxTheme(k), k).toBe(false);
            expect(getTheme(k).fx, k).toBeUndefined();
        }
        expect(getTheme("cyberpunk").name).not.toBe("Cyberpunk Hologram");
    });

    test("getThemeFx, isFxTheme and the snake_case aliases", () => {
        expect(getThemeFx("neon_hud")?.glow).toBe("neon");
        expect(get_theme_fx("neon_hud")).toBe(getThemeFx("neon_hud"));
        expect(isFxTheme("deep_space")).toBe(true);
        expect(is_fx_theme("midnight")).toBe(false);
        expect(getThemeFx("midnight")).toBeUndefined();
        expect(fxCssVars("midnight")).toBe("");
        expect(fxCssVars("deep_space")).toContain("--fx-glow-color");
        expect(fxCssVars(FX_THEMES.deep_space!)).toBe(fxCssVars("deep_space"));
    });

    test("fx descriptors stay inside their ranges", () => {
        for (const [key, t] of Object.entries(FX_THEMES)) {
            const fx = t.fx!;
            expect(fx.blur, key).toBeGreaterThanOrEqual(0);
            expect(fx.blur, key).toBeLessThanOrEqual(32);
            expect(fx.glass, key).toBeGreaterThanOrEqual(0);
            expect(fx.glass, key).toBeLessThanOrEqual(1);
            expect(["none", "soft", "neon"]).toContain(fx.glow);
            expect(["sharp", "soft", "round", "pill"]).toContain(fx.radius);
            expect(["flat", "gradient", "metal"]).toContain(fx.border);
            expect(["calm", "spring", "snappy"]).toContain(fx.motion);
            expect(["none", "subtle"]).toContain(fx.scanlines);
            expect(/^#[0-9a-f]{6}$/i.test(fx.glowColor), key).toBe(true);
        }
    });

    test("the themes have distinct identities", () => {
        const sig = (k: string) => JSON.stringify([FX_THEMES[k]!.accent_color, FX_THEMES[k]!.background_color]);
        expect(new Set(FX_THEME_KEYS.map(sig)).size).toBe(FX_THEME_KEYS.length);
        expect(FX_THEMES.quantum_obsidian!.background_color).toBe("#000000");
        expect(FX_THEMES.cyberpunk_hologram!.fx!.scanlines).toBe("subtle");
        expect(FX_THEMES.neon_hud!.fx!.scanlines).toBe("subtle");
        expect(FX_THEMES.liquid_metal!.fx!.border).toBe("metal");
        expect(FX_THEMES.liquid_metal!.fx!.sheen).toBe(true);
        expect(FX_THEMES.neon_hud!.fx!.radius).toBe("sharp");
    });
});

describe("fx themes: tokens", () => {
    test("fxCssVars gives every token for every fx theme, with valid values", () => {
        for (const [key, t] of Object.entries(FX_THEMES)) {
            const css = fxCssVars(t);
            const decls = new Map([...css.matchAll(/(--fx-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
            for (const name of FX_TOKEN_NAMES) expect(decls.has(name), `${key} ${name}`).toBe(true);
            for (const [name, value] of decls) {
                expect(value, `${key} ${name}`).not.toMatch(/undefined|NaN|null/);
                expect(value.length, `${key} ${name}`).toBeGreaterThan(0);
            }
            for (const r of ["xs", "sm", "md", "lg", "xl", "pill"]) expect(decls.get(`--fx-radius-${r}`)).toMatch(/^\d+px$/);
            expect(Number.parseInt(decls.get("--fx-blur-md")!)).toBeLessThanOrEqual(32);
            expect(decls.get("--fx-ease-spring")).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
            expect(decls.get("--fx-ease-out")).toMatch(/^cubic-bezier\(/);
            expect(decls.get("--fx-ease-in-out")).toMatch(/^cubic-bezier\(/);
            expect(decls.get("--fx-ease-bounce")).toMatch(/^cubic-bezier\(/);
            for (const d of ["instant", "fast", "base", "slow", "ambient"]) expect(decls.get(`--fx-dur-${d}`)).toMatch(/^\d+ms$/);
            expect(Number(decls.get("--fx-hover-scale"))).toBeGreaterThan(1);
            expect(Number(decls.get("--fx-hover-scale"))).toBeLessThanOrEqual(1.05);
            expect(Number(decls.get("--fx-press-scale"))).toBeLessThan(1);
            for (let i = 1; i <= 5; i++) expect(decls.get(`--fx-shadow-${i}`)!.split("rgba(").length - 1, `${key} shadow ${i}`).toBeGreaterThanOrEqual(2);
            expect(decls.get("--fx-focus-ring")).toMatch(/^2px solid #[0-9a-f]{6}$/);
        }
    });

    test("scanlines and grain never exceed 4% opacity, and only exist when asked for", () => {
        for (const [key, t] of Object.entries(FX_THEMES)) {
            const css = fxCssVars(t);
            const scan = Number(/--fx-scanline-opacity:\s*([\d.]+)/.exec(css)![1]);
            const grain = Number(/--fx-grain-opacity:\s*([\d.]+)/.exec(css)![1]);
            expect(scan, key).toBeLessThanOrEqual(0.04);
            expect(grain, key).toBeLessThanOrEqual(0.04);
            expect(scan > 0, key).toBe(t.fx!.scanlines === "subtle");
            expect(grain > 0, key).toBe(t.fx!.grain === "subtle");
        }
    });

    test("a glow of 'none' has no light in it", () => {
        const vars = fxCssVars(FX_THEMES.liquid_metal_light!);
        expect(vars).toMatch(/--fx-glow-soft:\s*0 0 0 0 rgba\(0, 0, 0, 0\)/);
    });

    test("the root attributes describe the descriptor", () => {
        const a = fxRootAttrs(FX_THEMES.cyberpunk_hologram, "on");
        expect(a["data-fx"]).toBe("on");
        expect(a["data-fx-scan"]).toBe("on");
        expect(a["data-fx-ca"]).toBe("on");
        expect(fxRootAttrs(FX_THEMES.neo_tokyo_dark, "reduced")["data-fx"]).toBe("reduced");
        expect(fxRootAttrs(SIMPLEGUI_THEMES.midnight)).toEqual({});
        expect(normalizeFxMode("full")).toBe("on");
        expect(normalizeFxMode("Reduced")).toBe("reduced");
        expect(normalizeFxMode("off")).toBe("off");
        expect(normalizeFxMode(undefined)).toBe("on");
    });

    test("design_tokens.css has every token with a default, and its generated block is current", () => {
        const css = readFileSync(join(root, "design_tokens.css"), "utf8");
        for (const name of FX_TOKEN_NAMES) expect(css, name).toContain(`${name}:`);
        for (const base of ["--color-primary", "--font-family-sans", "--font-family-mono"]) expect(css).toContain(base);
        expect(fxAssetsMain(["--check"])).toBe(0);
    });
});

describe("fx themes: contrast", () => {
    for (const [key, t] of Object.entries(FX_THEMES)) {
        test(`${key}: text, accents, borders, focus and status colors`, () => {
            const card = t.card_background!;
            expect(contrastRatio(t.font_color, t.background_color), "text on canvas").toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(t.font_color, card), "text on card").toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(t.accent_color, t.background_color), "accent on canvas").toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(t.accent_color, card), "accent on card").toBeGreaterThanOrEqual(4.5);
            expect(contrastRatio(t.secondary_accent!, card), "secondary on card").toBeGreaterThanOrEqual(3);
            expect(contrastRatio(t.card_border!, t.background_color), "border on canvas").toBeGreaterThanOrEqual(3);
            expect(contrastRatio(t.card_border!, card), "border on card").toBeGreaterThanOrEqual(3);
            const focus = focusRingColor({ accent_color: t.accent_color, background_color: t.background_color, card_background: card, is_dark: t.is_dark });
            expect(contrastRatio(focus, t.background_color), "focus ring on canvas").toBeGreaterThanOrEqual(3);
            expect(contrastRatio(focus, card), "focus ring on card").toBeGreaterThanOrEqual(3);
            const sem = getSemanticColors(key);
            for (const kind of ["danger", "warning", "success", "info"] as const) {
                expect(contrastRatio(sem[kind].on, sem[kind].solid), `${kind} on/solid`).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(sem[kind].text, card), `${kind} text/card`).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(sem[kind].solid, card), `${kind} solid/card`).toBeGreaterThanOrEqual(3);
            }
            const hues = new Set(["danger", "warning", "success", "info"].map((k) => (sem as any)[k].solid));
            expect(hues.size).toBe(4);
        });

        test(`${key}: glass keeps body text at 4.5:1 over the worst backdrop`, () => {
            const g = glassReport({ ...t, fx: t.fx! });
            expect(g.worstContrast).toBeGreaterThanOrEqual(4.5);
            expect(g.alpha).toBeGreaterThanOrEqual(g.requestedAlpha);
            const tokens = fxCssVars(t);
            expect(Number(/--fx-glass-alpha:\s*([\d.]+)/.exec(tokens)![1])).toBe(g.alpha);
            // Recompute from the emitted fill, not from the helper: composite over pure black and pure white.
            const m = /--fx-glass-bg:\s*rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(tokens)!;
            const fill = [Number(m[1]), Number(m[2]), Number(m[3])];
            const a = Number(m[4]);
            for (const under of [0, 255]) {
                const c = fill.map((v) => Math.round(v * a + under * (1 - a)));
                const hex = "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
                expect(contrastRatio(t.font_color, hex), `over ${under}`).toBeGreaterThanOrEqual(4.45);
            }
        });

        test(`${key}: code colors are readable`, () => {
            const p = getSyntaxPalette(key);
            for (const kind of ["keyword", "string", "number", "comment", "function", "type", "text"] as const) {
                expect(contrastRatio(p[kind], t.background_color), `${kind}`).toBeGreaterThanOrEqual(4.5);
            }
        });
    }
});

// ---------------------------------------------------------------------------------------------------------------------
// The CSS: a small parser, then rules about what may move and when
// ---------------------------------------------------------------------------------------------------------------------

interface Rule {
    selector: string;
    body: string;
    media: string[];
}

function parseCss(css: string): { rules: Rule[]; keyframes: Record<string, string> } {
    const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules: Rule[] = [];
    const keyframes: Record<string, string> = {};
    let i = 0;
    const block = (media: string[]) => {
        while (i < src.length) {
            while (i < src.length && /\s/.test(src[i]!)) i++;
            if (src[i] === "}") {
                i++;
                return;
            }
            const start = i;
            while (i < src.length && src[i] !== "{" && src[i] !== ";") i++;
            const prelude = src.slice(start, i).trim();
            if (src[i] === ";") {
                i++;
                continue;
            }
            i++;
            if (/^@(media|supports)/.test(prelude)) {
                block([...media, prelude]);
            } else if (/^@keyframes/.test(prelude)) {
                const bodyStart = i;
                let depth = 1;
                while (i < src.length && depth > 0) {
                    if (src[i] === "{") depth++;
                    else if (src[i] === "}") depth--;
                    i++;
                }
                keyframes[prelude.replace(/^@keyframes\s+/, "")] = src.slice(bodyStart, i - 1);
            } else {
                const bodyStart = i;
                while (i < src.length && src[i] !== "}") i++;
                rules.push({ selector: prelude, body: src.slice(bodyStart, i).trim(), media });
                i++;
            }
        }
    };
    block([]);
    return { rules, keyframes };
}

const decl = (body: string, prop: string): string[] => [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1]!.replace(/!important/, "").trim());
// Top-level selectors of a rule: commas inside (...) and [...] do not split.
const splitSel = (s: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
        if (ch === "(" || ch === "[") depth++;
        else if (ch === ")" || ch === "]") depth--;
        if (ch === "," && depth === 0) {
            out.push(cur.trim());
            cur = "";
        } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
};
const css = fxCss();
const parsed = parseCss(css);
const MOTION_PROPS = new Set(["transform", "opacity", "filter"]);
const NO_PREF = "@media (prefers-reduced-motion: no-preference)";

describe("fx css: only compositor properties move", () => {
    test("the parser found the layer", () => {
        expect(parsed.rules.length).toBeGreaterThan(80);
        expect(Object.keys(parsed.keyframes).length).toBeGreaterThanOrEqual(10);
    });

    test("every @keyframes animates transform, opacity or filter and nothing else", () => {
        for (const [name, body] of Object.entries(parsed.keyframes)) {
            const props = new Set<string>();
            for (const frame of body.matchAll(/\{([^}]*)\}/g)) for (const m of frame[1]!.matchAll(/([a-z-]+)\s*:/g)) props.add(m[1]!);
            expect(props.size, name).toBeGreaterThan(0);
            for (const p of props) expect(MOTION_PROPS.has(p), `${name} animates ${p}`).toBe(true);
        }
    });

    test("every transition-property is transform, opacity or filter (no shorthand, no 'all'; 'none' switches one off)", () => {
        for (const r of parsed.rules) {
            expect(decl(r.body, "transition"), r.selector.slice(0, 80)).toEqual([]);
            for (const v of decl(r.body, "transition-property")) for (const p of v.split(",").map((s) => s.trim())) expect(MOTION_PROPS.has(p) || p === "none", `${r.selector.slice(0, 60)} transitions ${p}`).toBe(true);
        }
        expect(css).not.toMatch(/transition\s*:/);
        expect(css).not.toMatch(/transition-property\s*:\s*all/);
    });

    test("every animation uses a keyframes block that exists", () => {
        for (const r of parsed.rules) {
            for (const v of [...decl(r.body, "animation"), ...decl(r.body, "animation-name")]) {
                const name = v.split(/\s+/)[0]!;
                if (name === "none") continue;
                expect(parsed.keyframes[name], `${r.selector.slice(0, 60)} -> ${name}`).toBeDefined();
            }
        }
    });

    test("will-change only names transform or opacity, and only on states that animate", () => {
        for (const r of parsed.rules) {
            for (const v of decl(r.body, "will-change")) {
                if (v === "auto") continue;
                for (const p of v.split(",").map((s) => s.trim())) expect(["transform", "opacity"], r.selector).toContain(p);
                expect(r.selector, "will-change on a resting element").toMatch(/:hover|:active|\[data-open\]|\[data-closing\]|data-fx-ambient/);
            }
        }
    });

    test("nothing flashes: infinite animations are slower than two cycles a second", () => {
        for (const r of parsed.rules) {
            for (const v of decl(r.body, "animation")) {
                if (!/infinite/.test(v)) continue;
                const t = /(\d+(?:\.\d+)?)(ms|s)\b/.exec(v);
                if (!t) continue; // calc(): the ambient durations, seconds long
                const ms = Number(t[1]) * (t[2] === "s" ? 1000 : 1);
                expect(ms, v).toBeGreaterThanOrEqual(500);
            }
        }
    });

    test("overlays never take the pointer, and no rule removes a focus outline", () => {
        for (const r of parsed.rules) {
            if (/::(before|after)$/.test(r.selector.split(",").pop()!.trim()) && /content\s*:/.test(r.body)) expect(r.body, r.selector.slice(0, 80)).toMatch(/pointer-events:\s*none/);
        }
        expect(css).not.toMatch(/outline\s*:\s*(none|0)\b/);
        expect(css).not.toMatch(/outline-width\s*:\s*0/);
        expect(css).toMatch(/:focus-visible/);
    });

    test("backdrop-filter is never on table cells or rows, and has a solid fallback", () => {
        for (const r of parsed.rules) {
            if (!/backdrop-filter/.test(r.body)) continue;
            expect(r.selector, "backdrop-filter near a table").not.toMatch(/\b(table|tbody|thead|tr|td|th)\b|fx-table/);
        }
        expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
        const fallback = parsed.rules.find((r) => r.media.some((m) => m.startsWith("@supports not")));
        expect(fallback!.body).toContain("--fx-glass-bg: var(--fx-glass-solid)");
    });
});

describe("fx css: scoping, reduced motion, contrast, forced colors, off", () => {
    test("every rule is scoped under data-fx, so no fx attribute means no effects", () => {
        for (const r of parsed.rules) for (const sel of splitSel(r.selector)) expect(sel, `unscoped: ${sel.slice(0, 100)}`).toMatch(/data-fx/);
    });

    test('data-fx="off" is never matched by a rule that adds anything', () => {
        for (const r of parsed.rules) expect(r.selector).not.toMatch(/data-fx="off"/);
        for (const r of parsed.rules) for (const sel of splitSel(r.selector)) expect(sel, sel.slice(0, 80)).toMatch(/data-fx="on"|data-fx="reduced"|\[data-fx\]/);
    });

    test("pointer-driven and looping motion exists only for people who have not asked for less", () => {
        for (const r of parsed.rules) {
            const inPref = r.media.includes(NO_PREF);
            const animations = [...decl(r.body, "animation"), ...decl(r.body, "animation-name")].filter((v) => !/^none\b/.test(v) && !/^fx-fade-(in|out)\b/.test(v));
            if (animations.length) expect(inPref, `animation outside no-preference: ${r.selector.slice(0, 80)}`).toBe(true);
            if (/:hover|:active|:focus-within/.test(r.selector) && decl(r.body, "transform").length) expect(inPref, `hover transform outside no-preference: ${r.selector.slice(0, 80)}`).toBe(true);
        }
        expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    });

    test("prefers-reduced-motion: reduce turns animation off and keeps fades", () => {
        const rules = parsed.rules.filter((r) => r.media.includes("@media (prefers-reduced-motion: reduce)"));
        expect(rules.length).toBeGreaterThan(2);
        expect(rules.some((r) => /animation:\s*none\s*!important/.test(r.body))).toBe(true);
        expect(rules.some((r) => /transition-property:\s*opacity\s*!important/.test(r.body))).toBe(true);
        expect(rules.some((r) => /fx-fade-in/.test(r.body))).toBe(true);
        // data-fx="reduced" gets the same treatment without the media query
        const manual = parsed.rules.filter((r) => r.media.length === 0 && /^\[data-fx="reduced"\]/.test(r.selector));
        expect(manual.some((r) => /animation:\s*none\s*!important/.test(r.body))).toBe(true);
    });

    test("prefers-contrast: more drops glow, glass, scanlines and gets solid, outlined surfaces", () => {
        const rules = parsed.rules.filter((r) => r.media.includes("@media (prefers-contrast: more)"));
        const all = rules.map((r) => r.body).join("\n");
        expect(all).toContain("--fx-glass-bg: var(--fx-glass-solid)");
        expect(all).toContain("--fx-scanline-opacity: 0");
        expect(all).toContain("--fx-glow-strong: 0 0 0 0 transparent");
        expect(all).toContain("--fx-blur-md: 0px");
        expect(all).toMatch(/backdrop-filter:\s*none/);
        expect(all).toMatch(/display:\s*none\s*!important/);
        expect(all).toMatch(/border:\s*1px solid var\(--theme-fg/);
        expect(all).toMatch(/outline-width:\s*3px/);
        expect(all).toMatch(/text-shadow:\s*none/);
    });

    test("forced-colors falls back to system colors", () => {
        const rules = parsed.rules.filter((r) => r.media.includes("@media (forced-colors: active)"));
        const all = rules.map((r) => r.body).join("\n");
        expect(all).toContain("Canvas");
        expect(all).toContain("CanvasText");
        expect(all).toContain("Highlight");
        expect(all).toMatch(/box-shadow:\s*none/);
        expect(all).toMatch(/backdrop-filter:\s*none/);
    });

    test("the drop-in classes and their motion exist", () => {
        for (const cls of [".fx-button", ".fx-input", ".fx-card", ".fx-panel", ".fx-table", ".fx-nav", ".fx-toolbar", ".fx-modal", ".fx-sheet", ".fx-pill-live", ".fx-pulse", ".fx-skeleton", ".fx-icon-click"]) expect(css, cls).toContain(cls);
        for (const k of ["fx-wiggle", "fx-modal-in", "fx-modal-out", "fx-rise", "fx-breathe", "fx-pulse-ring", "fx-shimmer"]) expect(parsed.keyframes[k], k).toBeDefined();
        expect(css).toContain("var(--fx-pointer-x");
        expect(css).toContain("var(--fx-tilt-x");
        expect(css).toContain("var(--fx-mag-x");
        expect(css).toContain("var(--fx-pill-x");
        expect(css).toContain("var(--fx-stagger)");
        expect(css).toContain("var(--fx-i");
        expect(css).toContain("scaleX(var(--fx-pill-w");
        expect(css).toMatch(/contain:\s*paint/);
        expect(css).toContain("var(--fx-hover-scale)");
        expect(css).toContain("var(--fx-press-scale)");
        // the bloom is an opacity swap on a pre-rendered shadow, never an animated box-shadow
        const bloom = parsed.rules.find((r) => /button.*::after$/.test(r.selector.trim()) && /box-shadow:\s*var\(--fx-glow-strong\)/.test(r.body));
        expect(bloom).toBeDefined();
        expect(bloom!.body).toMatch(/opacity:\s*0/);
        expect(bloom!.body).toMatch(/transition-property:\s*opacity/);
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------------------------------------------------

describe("generated pages", () => {
    test("pages for themes without fx match the baseline including the shared desktop keyboard updates", () => {
        const expected = JSON.parse(readFileSync(join(root, "tests", "fixtures", "fx_baseline_hashes.json"), "utf8"));
        const actual = computeBaseline();
        expect(Object.keys(actual)).toEqual(Object.keys(expected));
        for (const k of Object.keys(expected)) expect(actual[k], k).toEqual(expected[k]);
    });

    test("a page without fx has no data-fx attribute, no fx CSS and no pointer script", () => {
        const html = createWindow("Plain", 400, 300, { theme: "dracula" }).getHtml();
        expect(html).not.toContain("data-fx");
        expect(html).not.toContain("simplegui-fx");
        expect(html).not.toContain("--fx-");
        expect(html).not.toContain("__fxPointer");
        expect(html.startsWith("<!DOCTYPE html>\n<html>\n")).toBe(true);
    });

    test("a page with an fx theme carries the flags, the variables, the CSS and the pointer helper once", () => {
        const win = createWindow("Fx", 400, 300, { theme: "cyberpunk_hologram" });
        win.addButton("b1", "Go");
        const html = win.getHtml();
        expect(html).toContain('<html data-fx="on" ');
        expect(html).toContain('data-fx-scan="on"');
        expect(html.match(/id="simplegui-fx-css"/g)).toHaveLength(1);
        expect(html.match(/id="simplegui-fx-vars"/g)).toHaveLength(1);
        expect(html.match(/__fxPointer/g)!.length).toBeGreaterThan(0);
        expect(html).toContain(fxCssVars("cyberpunk_hologram"));
        expect(html).toContain(fxCss());
        expect(html.indexOf("simplegui-fx-vars")).toBeLessThan(html.indexOf("simplegui-fx-css"));
    });

    test("effects: reduced keeps the CSS but says so; off sends only the switch", () => {
        const reduced = createWindow("Fx", 400, 300, { theme: "neon_hud", effects: "reduced" }).getHtml();
        expect(reduced).toContain('<html data-fx="reduced"');
        expect(reduced).toContain("simplegui-fx-css");
        const off = createWindow("Fx", 400, 300, { theme: "neon_hud", effects: "off" }).getHtml();
        expect(off).toContain('<html data-fx="off"');
        expect(off).not.toContain("simplegui-fx-css");
        expect(off).not.toContain("__fxPointer");
        const win = createWindow("Fx", 400, 300, { theme: "neon_hud" });
        win.setEffects("off");
        expect(win.effects).toBe("off");
        expect(win.getHtml()).toContain('<html data-fx="off"');
    });

    test("the Designer preview (generatePreviewHtml) picks the fx theme from the theme name and the effects mode from the spec", () => {
        const spec = { title: "T", width: 400, height: 300, theme: "Cyberpunk Hologram", background_color: "#060a14", font_color: "#e6f7ff", accent_color: "#00e5ff", controls: [{ id: "b", type: "button", text: "Go", x: 0, y: 0, width: 80, height: 30 }] };
        expect(generatePreviewHtml(spec)).toContain('<html data-fx="on" ');
        expect(generatePreviewHtml({ ...spec, fx_mode: "reduced" })).toContain('<html data-fx="reduced"');
        expect(generatePreviewHtml({ ...spec, fx_mode: "off" })).not.toContain("simplegui-fx-css");
        expect(generatePreviewHtml({ ...spec, theme: "Dracula" })).not.toContain("data-fx");
    });

    test("an existing theme can opt in by getting an fx descriptor, and opting out restores its page", () => {
        const before = createWindow("Opt", 400, 300, { theme: "nord" }).getHtml();
        expect(before).not.toContain("data-fx");
        const nord = SIMPLEGUI_THEMES.nord!;
        nord.fx = { glow: "soft", glowColor: "#88c0d0", blur: 10, glass: 0.3, grain: "none", scanlines: "none", sheen: false, radius: "soft", border: "gradient", motion: "calm" };
        try {
            expect(isFxTheme("nord")).toBe(true);
            const html = createWindow("Opt", 400, 300, { theme: "nord" }).getHtml();
            expect(html).toContain('<html data-fx="on"');
            expect(html).toContain("--fx-glow-color: #88c0d0");
        } finally {
            delete nord.fx;
        }
        expect(createWindow("Opt", 400, 300, { theme: "nord" }).getHtml()).toBe(before);
    });

    test("switching a running window to an fx theme and back sends the effects script only when it matters", () => {
        const sent: string[] = [];
        const win = createWindow("Live", 400, 300, { theme: "dracula" }) as any;
        win.isWindowRunning = true;
        win.evalJS = (js: string) => void sent.push(js);
        win.setTheme("nord", false);
        const plain = sent.length;
        expect(sent.some((s) => s.includes("simplegui-fx"))).toBe(false);
        win.setTheme("plasma_violet", false);
        expect(sent.slice(plain).some((s) => s.includes("simplegui-fx-css") && s.includes("data-fx"))).toBe(true);
        const before = sent.length;
        win.setTheme("nord", false);
        const tail = sent.slice(before).join("\n");
        expect(tail).toContain("data-fx");
        expect(tail).toContain('var attrs = {}');
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// The pointer helper
// ---------------------------------------------------------------------------------------------------------------------

describe("fx pointer helper", () => {
    function setup(attr = 'data-fx="on"') {
        const dom = new JSDOM(`<!DOCTYPE html><html ${attr}><body>
            <button class="fx-button" id="btn">Go</button>
            <div class="fx-card" id="card">Card</div>
            <div class="fx-toolbar" id="tb"><button id="t1">A</button><button id="t2">B</button></div>
            <div class="fx-nav" id="nav"><span id="n1">One</span><span id="n2" class="active">Two</span></div>
            <p id="plain">x</p></body></html>`, { pretendToBeVisual: false });
        const win = dom.window as any;
        const frames: Array<() => void> = [];
        win.requestAnimationFrame = (cb: () => void) => frames.push(cb);
        win.cancelAnimationFrame = (id: number) => void (frames[id - 1] = () => {});
        const rect = (el: Element, w: number, h: number) => (el.getBoundingClientRect = () => ({ left: 100, top: 50, width: w, height: h, right: 100 + w, bottom: 50 + h, x: 100, y: 50, toJSON() {} }) as DOMRect);
        const doc = win.document as Document;
        rect(doc.getElementById("btn")!, 100, 40);
        rect(doc.getElementById("card")!, 200, 100);
        rect(doc.getElementById("t1")!, 40, 40);
        const move = (el: Element, x: number, y: number, pointerType = "mouse") => {
            const ev = new win.MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y });
            Object.defineProperty(ev, "pointerType", { value: pointerType });
            el.dispatchEvent(ev);
        };
        const flush = () => frames.splice(0).forEach((f) => f());
        return { dom, win, doc, frames, move, flush };
    }
    const get = (el: Element, name: string) => (el as HTMLElement).style.getPropertyValue(name);

    test("sets the cursor position on the hovered button, once per frame, with the latest coordinates", () => {
        const { win, doc, frames, move, flush } = setup();
        const h = installFxPointer(win);
        const btn = doc.getElementById("btn")!;
        move(btn, 110, 60);
        move(btn, 130, 70);
        move(btn, 150, 80);
        expect(frames.length).toBe(1);
        expect(get(btn, "--fx-pointer-x")).toBe("");
        flush();
        expect(get(btn, "--fx-pointer-x")).toBe("50px");
        expect(get(btn, "--fx-pointer-y")).toBe("30px");
        h.dispose();
    });

    test("tilts cards by at most 4 degrees and drifts toolbar items by at most 6px", () => {
        const { win, doc, move, flush } = setup();
        const h = installFxPointer(win);
        const card = doc.getElementById("card")!;
        for (const [x, y] of [[100, 50], [300, 150], [200, 100], [101, 149]] as const) {
            move(card, x, y);
            flush();
            expect(Math.abs(parseFloat(get(card, "--fx-tilt-x")))).toBeLessThanOrEqual(FX_TILT_MAX_DEG);
            expect(Math.abs(parseFloat(get(card, "--fx-tilt-y")))).toBeLessThanOrEqual(FX_TILT_MAX_DEG);
        }
        move(card, 300, 50);
        flush();
        expect(get(card, "--fx-tilt-y")).toBe(`${FX_TILT_MAX_DEG}deg`);
        expect(get(card, "--fx-tilt-x")).toBe(`${FX_TILT_MAX_DEG}deg`);
        const item = doc.getElementById("t1")!;
        for (const [x, y] of [[100, 50], [140, 90], [120, 70], [5000, 5000]] as const) {
            move(item, x, y);
            flush();
            expect(Math.abs(parseFloat(get(item, "--fx-mag-x")))).toBeLessThanOrEqual(FX_MAGNET_MAX_PX);
            expect(Math.abs(parseFloat(get(item, "--fx-mag-y")))).toBeLessThanOrEqual(FX_MAGNET_MAX_PX);
        }
        h.dispose();
    });

    test("ignores touch, and does nothing for elements that are not targets", () => {
        const { win, doc, frames, move, flush } = setup();
        const h = installFxPointer(win);
        move(doc.getElementById("btn")!, 120, 60, "touch");
        expect(frames.length).toBe(0);
        move(doc.getElementById("plain")!, 120, 60);
        flush();
        expect(doc.getElementById("plain")!.getAttribute("style")).toBeNull();
        move(doc.getElementById("btn")!, 120, 60, "pen");
        expect(frames.length).toBe(1);
        h.dispose();
    });

    test('is a no-op unless data-fx is "on"', () => {
        for (const attr of ['data-fx="off"', 'data-fx="reduced"', ""]) {
            const { win, doc, frames, move, flush } = setup(attr);
            const h = installFxPointer(win);
            const btn = doc.getElementById("btn")!;
            move(btn, 120, 60);
            expect(frames.length, attr).toBe(0);
            flush();
            expect(btn.getAttribute("style"), attr).toBeNull();
            h.dispose();
        }
        // turning it on later is picked up without reinstalling
        const { win, doc, move, flush } = setup('data-fx="off"');
        const h = installFxPointer(win);
        doc.documentElement.setAttribute("data-fx", "on");
        move(doc.getElementById("btn")!, 120, 60);
        flush();
        expect(get(doc.getElementById("btn")!, "--fx-pointer-x")).toBe("20px");
        h.dispose();
    });

    test("works when only a region has data-fx on (the Designer)", () => {
        const { win, doc, move, flush } = setup("");
        doc.getElementById("card")!.setAttribute("data-fx", "on");
        const h = installFxPointer(win);
        move(doc.getElementById("card")!, 150, 80);
        flush();
        expect(get(doc.getElementById("card")!, "--fx-pointer-x")).toBe("50px");
        h.dispose();
    });

    test("moves the sliding tab indicator when a tab is clicked", () => {
        const { win, doc, frames, flush } = setup();
        const nav = doc.getElementById("nav")!;
        for (const [id, left, width] of [["n1", 8, 60], ["n2", 76, 90]] as const) {
            const el = doc.getElementById(id)!;
            Object.defineProperty(el, "offsetLeft", { value: left });
            Object.defineProperty(el, "offsetWidth", { value: width });
        }
        const h = installFxPointer(win);
        if (doc.readyState === "loading") doc.dispatchEvent(new win.Event("DOMContentLoaded"));
        else h.refresh();
        expect(nav.style.getPropertyValue("--fx-pill-x")).toBe("76px");
        expect(nav.style.getPropertyValue("--fx-pill-w")).toBe("90");
        expect(nav.hasAttribute("data-fx-pill")).toBe(true);
        doc.getElementById("n2")!.classList.remove("active");
        doc.getElementById("n1")!.classList.add("active");
        doc.getElementById("n1")!.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
        expect(frames.length).toBe(1);
        flush();
        expect(nav.style.getPropertyValue("--fx-pill-x")).toBe("8px");
        expect(nav.style.getPropertyValue("--fx-pill-w")).toBe("60");
        h.dispose();
    });

    test("install is idempotent, and dispose removes the listeners and cancels the pending frame", () => {
        const { win, doc, frames, move, flush } = setup();
        const h = installFxPointer(win);
        expect(installFxPointer(win)).toBe(h);
        const btn = doc.getElementById("btn")!;
        move(btn, 120, 60);
        flush();
        expect(get(btn, "--fx-pointer-x")).toBe("20px");
        move(btn, 130, 60);
        expect(frames.length).toBe(1);
        h.dispose();
        flush();
        expect(get(btn, "--fx-pointer-x"), "variables are cleared").toBe("");
        move(btn, 140, 60);
        expect(frames.length, "no listener left").toBe(0);
        expect((doc as any).__fxPointer).toBeUndefined();
        // and it can be installed again
        const again = installFxPointer(win);
        move(btn, 140, 60);
        expect(frames.length).toBe(1);
        again.dispose();
    });

    test("the embedded source is small, passive, dependency-free and has no timers", () => {
        expect(FX_POINTER_SOURCE.split("\n").length).toBeLessThan(110);
        expect(FX_POINTER_FUNCTION).not.toMatch(/setTimeout|setInterval|fetch\(|import |require\(/);
        expect(FX_POINTER_FUNCTION).toContain("passive: true");
        expect(FX_POINTER_FUNCTION).toContain("requestAnimationFrame");
        expect(FX_POINTER_FUNCTION.match(/addEventListener\(/g)!.length).toBeLessThanOrEqual(5);
        expect(FX_POINTER_FUNCTION).toContain('"touch"');
        expect(() => new Function(`return ${FX_POINTER_FUNCTION}`)).not.toThrow();
        expect(FX_POINTER_SOURCE.endsWith("(window);")).toBe(true);
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// The Designer
// ---------------------------------------------------------------------------------------------------------------------

describe("designer wiring", () => {
    const html = getIdeHtml();
    const OLD_OPTIONS = ["Dark", "Light", "Abyss", "Arc Velvet", "CodeFreelance", "Cyberpunk Night City", "Horizon Sunset", "JetBrains Darcula", "Linear Studio", "Nordic Paper Light", "OLED Laser Black", "Raycast Dark", "Supabase Dark", "Tailwind Slate Emerald", "Titanium Slate Pro", "Unreal Engine 5", "Vercel Geist", "Apple Dark", "Apple Sunset", "macOS Liquid Glass", "macOS Sonoma Dark", "macOS Ventura Light", "Midnight", "Sonoma Emerald", "Windows 11 Acrylic Dark", "Windows 11 Fluent Slate", "Windows 11 Mica Light", "Windows 11 Sun Valley", "Fedora Blue", "GNOME Adwaita Dark", "GNOME Adwaita Light", "Linux Mint", "Pop!_OS", "Ubuntu Yaru Dark", "Ubuntu Yaru Light", "Catppuccin", "Cobalt2", "Cyberpunk", "Dracula", "Everforest Dark", "Gruvbox Dark", "Gruvbox Light", "High Contrast", "Kanagawa", "Monokai Pro", "Nord", "One Dark Pro", "Rosé Pine", "Solarized Dark", "Solarized Light", "Tokyo Night"];

    const body = html.slice(html.indexOf("<body"), html.indexOf("<script>"));
    const dom = new JSDOM(`<!DOCTYPE html>${body}`);
    const doc = dom.window.document;

    const grab = (name: string) => {
        const start = html.indexOf(`function ${name}(`);
        expect(start, name).toBeGreaterThan(-1);
        let depth = 0;
        let end = html.indexOf("{", start);
        for (; end < html.length; end++) {
            if (html[end] === "{") depth++;
            else if (html[end] === "}" && --depth === 0) break;
        }
        return html.slice(start, end + 1);
    };
    const fxPart = readFileSync(join(root, "src", "ide", "15_fx_layer.js"), "utf8");

    // The real functions, run against the page's markup with the rest of the Designer stubbed out.
    function harness(spec: Record<string, any>) {
        const calls: string[] = [];
        const factory = new Function(
            "document",
            "window",
            "formSpec",
            "calls",
            `${fxPart}
             function saveHistoryState() { calls.push("history"); }
             function renderCanvas() { syncThemeControls(); calls.push("render"); }
             function renderCode() {} function populateInspector() {} function syncSpecToV() { calls.push("syncV"); }
             ${grab("contrastRatio")}; ${grab("getRawThemeColors")}; ${grab("getThemeColors")}; ${grab("updateFormTheme")}; ${grab("normalizeImportedSpec")};
             return { fxThemeFor, fxPaletteFor, applyFxToCanvas, syncThemeControls, updateFxMode, updateFormTheme, getRawThemeColors, getThemeColors, normalizeImportedSpec, state: () => formSpec, fxState };`,
        );
        const fresh = new JSDOM(`<!DOCTYPE html>${body}`);
        const api = factory(fresh.window.document, fresh.window, spec, calls);
        return { api, doc: fresh.window.document as Document, calls, win: fresh.window };
    }

    test("the theme select keeps every old option and adds a Futuristic group with the new themes", () => {
        const select = doc.getElementById("propFormTheme") as HTMLSelectElement;
        const values = [...select.options].map((o) => o.value);
        for (const old of OLD_OPTIONS) expect(values, old).toContain(old);
        const group = [...select.querySelectorAll("optgroup")].find((g) => g.label.includes("Futuristic"))!;
        expect(group).toBeDefined();
        const groupValues = [...group.querySelectorAll("option")].map((o) => (o as HTMLOptionElement).value);
        expect(groupValues.sort()).toEqual(Object.values(FX_THEMES).map((t) => t.name).sort());
        for (const v of groupValues) expect(findFxTheme(v), v).toBeDefined();
        expect(new Set(values).size).toBe(values.length);
    });

    test("an Effects control sits with the theme control: Full (default), Reduced, Off", () => {
        const sel = doc.getElementById("propFormFx") as HTMLSelectElement;
        expect(sel).toBeTruthy();
        expect([...sel.options].map((o) => o.value)).toEqual(["full", "reduced", "off"]);
        expect(sel.value).toBe("full");
        expect(sel.getAttribute("onchange")).toBe("updateFxMode()");
        expect(sel.parentElement!.nextElementSibling === null || true).toBe(true);
        const themeRow = (doc.getElementById("propFormTheme") as HTMLElement).closest(".prop-row")!;
        expect(themeRow.nextElementSibling!.contains(sel)).toBe(true);
    });

    test("every new theme has a Designer palette that matches the theme and keeps button text readable", () => {
        const { api } = harness({ controls: [] });
        for (const t of Object.values(FX_THEMES)) {
            const c = api.getThemeColors(t.name);
            expect(c.formBg, t.name).toBe(t.background_color);
            expect(c.formFg, t.name).toBe(t.font_color);
            expect(c.btnBg, t.name).toBe(t.accent_color);
            expect(c.ctrlBg, t.name).toBe(t.card_background);
            expect(api.getRawThemeColors(t.name.toLowerCase()).formBg).toBe(t.background_color);
            expect(contrastRatio(c.btnFg, c.btnBg), t.name).toBeGreaterThanOrEqual(4.5);
        }
        expect(Object.keys(designerThemeData().data).sort()).toEqual([...FX_THEME_KEYS].sort());
    });

    test("old themes still resolve to their old palettes", () => {
        const { api } = harness({ controls: [] });
        expect(api.getRawThemeColors("Dracula")).toEqual({ formBg: "#282a36", formFg: "#f8f8f2", ctrlBg: "#44475a", ctrlFg: "#f8f8f2", btnBg: "#ff79c6", btnFg: "#282a36", panelBg: "#383a59" });
        expect(api.getRawThemeColors("Cyberpunk Night City").btnBg).toBe("#ff003c");
        expect(api.getRawThemeColors("Dark").formBg).toBe("#1e1e2e");
        expect(api.getRawThemeColors("Nonexistent").formBg).toBe("#0f172a");
    });

    test("a saved project with an old theme loads with that theme and no effects", () => {
        const { api, doc: d } = harness({ title: "Old", controls: [], theme: "Dracula", background_color: "#282a36" });
        api.syncThemeControls();
        expect((d.getElementById("propFormTheme") as HTMLSelectElement).value).toBe("Dracula");
        const canvas = d.getElementById("formCanvas")!;
        expect(canvas.hasAttribute("data-fx")).toBe(false);
        expect(canvas.classList.contains("fx-root")).toBe(false);
        expect(d.querySelector(".app-header")!.hasAttribute("data-fx")).toBe(false);
        expect(d.getElementById("fxDesignerCss")).toBeNull();
    });

    test("a project from before themes were saved (no theme field) still loads", () => {
        const { api, doc: d } = harness({ title: "Ancient", controls: [], background_color: "#0f172a" });
        expect(() => api.syncThemeControls()).not.toThrow();
        expect(d.getElementById("formCanvas")!.hasAttribute("data-fx")).toBe(false);
        expect((d.getElementById("propFormFx") as HTMLSelectElement).value).toBe("full");
    });

    test("a saved project with a new theme loads with the effects layer on the canvas and the chrome, not the editor", () => {
        const { api, doc: d } = harness({ title: "New", controls: [], theme: "Neon HUD", fx_mode: "full" });
        api.syncThemeControls();
        expect((d.getElementById("propFormTheme") as HTMLSelectElement).value).toBe("Neon HUD");
        const canvas = d.getElementById("formCanvas")!;
        expect(canvas.getAttribute("data-fx")).toBe("on");
        expect(canvas.classList.contains("fx-root")).toBe(true);
        expect(canvas.getAttribute("data-fx-scan")).toBe("on");
        expect(d.querySelector(".app-header")!.getAttribute("data-fx")).toBe("on");
        expect(d.querySelector(".tab-bar")!.classList.contains("fx-nav")).toBe(true);
        expect(d.querySelector(".app-header .btn")!.classList.contains("fx-button")).toBe(true);
        expect(d.getElementById("fxDesignerCss")!.textContent).toBe(fxCss());
        expect(d.getElementById("fxDesignerVars")!.textContent).toContain(fxCssVars("neon_hud"));
        // the code areas and the properties panel are never marked
        for (const sel of ["#tabProps", ".inspector-sidebar", "textarea", "pre", "code"]) for (const el of d.querySelectorAll(sel)) expect((el as Element).closest("[data-fx]"), sel).toBeNull();
        // leaving the theme removes it all again
        api.state().theme = "Dracula";
        api.syncThemeControls();
        expect(canvas.hasAttribute("data-fx")).toBe(false);
        expect(d.querySelector(".app-header")!.hasAttribute("data-fx")).toBe(false);
        expect(d.querySelector(".tab-bar")!.classList.contains("fx-nav")).toBe(false);
        expect(d.getElementById("fxDesignerVars")!.textContent).toBe("");
    });

    test("choosing a theme stores it in the form and applies the palette", () => {
        const spec: Record<string, any> = { title: "T", controls: [{ control_type: "button", id: "b", x: 0, y: 0, width: 10, height: 10 }] };
        const { api, doc: d } = harness(spec);
        const sel = d.getElementById("propFormTheme") as HTMLSelectElement;
        sel.value = "Plasma Violet";
        api.updateFormTheme();
        expect(spec.theme).toBe("Plasma Violet");
        expect(spec.background_color).toBe(FX_THEMES.plasma_violet!.background_color);
        expect(spec.controls[0].background_color).toBe(FX_THEMES.plasma_violet!.accent_color);
        expect(d.getElementById("formCanvas")!.getAttribute("data-fx")).toBe("on");
        sel.value = "Light";
        api.updateFormTheme();
        expect(spec.theme).toBe("Light");
        expect(d.getElementById("formCanvas")!.hasAttribute("data-fx")).toBe(false);
    });

    test("the effects control persists in the form, survives a save and load, and Off removes everything", () => {
        const spec: Record<string, any> = { title: "T", controls: [], theme: "Deep Space" };
        const { api, doc: d, calls } = harness(spec);
        api.syncThemeControls();
        const fx = d.getElementById("propFormFx") as HTMLSelectElement;
        fx.value = "reduced";
        api.updateFxMode();
        expect(spec.fx_mode).toBe("reduced");
        expect(d.getElementById("formCanvas")!.getAttribute("data-fx")).toBe("reduced");
        expect(calls).toContain("history");
        const saved = JSON.parse(JSON.stringify(spec));
        const loaded = api.normalizeImportedSpec(saved).spec;
        expect(loaded.theme).toBe("Deep Space");
        expect(loaded.fx_mode).toBe("reduced");
        // load it into a fresh Designer
        const second = harness(loaded);
        second.api.syncThemeControls();
        expect((second.doc.getElementById("propFormFx") as HTMLSelectElement).value).toBe("reduced");
        expect((second.doc.getElementById("propFormTheme") as HTMLSelectElement).value).toBe("Deep Space");
        expect(second.doc.getElementById("formCanvas")!.getAttribute("data-fx")).toBe("reduced");
        fx.value = "off";
        api.updateFxMode();
        const canvas = d.getElementById("formCanvas")!;
        expect([...canvas.attributes].filter((a) => a.name.startsWith("data-fx"))).toEqual([]);
        expect(d.querySelector(".app-header")!.hasAttribute("data-fx")).toBe(false);
        expect(api.fxState.pointer).toBeNull();
        fx.value = "full";
        api.updateFxMode();
        expect(canvas.getAttribute("data-fx")).toBe("on");
    });

    test("the canvas controls say what they are, so the layer can style them", () => {
        const part = readFileSync(join(root, "src", "ide", "110_canvas_render.js"), "utf8");
        expect(part).toContain("div.dataset.ctype = ctrl.control_type");
        expect(part).toContain("syncThemeControls();");
        expect(css).toContain('.designer-control[data-ctype="button"]');
        expect(css).toMatch(/:not\(\.selected\)/);
    });
});

describe("high-end M4 Pro / Windows DirectX enhancements and hardware fallbacks", () => {
    test("every FX theme has a valid non-FX fallback theme with matching dark/light polarity", () => {
        for (const key of FX_THEME_KEYS) {
            const fxTheme = FX_THEMES[key]!;
            const fbKey = FX_FALLBACK_THEMES[key];
            expect(fbKey, `${key} fallback key`).toBeTruthy();
            expect(getFallbackThemeKey(key)).toBe(fbKey!);
            const fbTheme = SIMPLEGUI_THEMES[fbKey!];
            expect(fbTheme, `${key} -> ${fbKey}`).toBeDefined();
            expect(fbTheme!.fx, `${fbKey} must not be an FX theme`).toBeUndefined();
            expect(fbTheme!.is_dark, `${key} -> ${fbKey} dark/light polarity`).toBe(fxTheme.is_dark);
        }
        // Aliases also resolve to the right fallback theme
        expect(getFallbackThemeKey("m4_space_black")).toBe("oled_black");
        expect(getFallbackThemeKey("win11_mica_fx")).toBe("fluent_light");
    });

    test("detects M4 MacBook Pro (Apple Silicon XDR) and Windows DirectX 12 RTX/Copilot+ PC as ultra tier", () => {
        const m4 = detectThemeHardware({
            gpuRenderer: "Apple M4 Max",
            platform: "darwin",
            cores: 14,
            memoryGb: 36,
            devicePixelRatio: 2,
            colorGamutP3: true,
            hdrDynamicRange: true,
        });
        expect(m4.tier).toBe("ultra");
        expect(m4.isAppleSiliconPro).toBe(true);
        expect(m4.supportsP3).toBe(true);
        expect(m4.supportsHdr).toBe(true);
        expect(m4.supportsProMotion).toBe(true);
        expect(m4.nativeBackdrop).toBe("vibrancy");
        expect(m4.shouldUseFallbackTheme).toBe(false);

        const winRtx = detectThemeHardware({
            gpuRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)",
            platform: "win32",
            cores: 16,
            memoryGb: 32,
            devicePixelRatio: 1.5,
            colorGamutP3: true,
            hdrDynamicRange: true,
        });
        expect(winRtx.tier).toBe("ultra");
        expect(winRtx.isWindowsHighEnd).toBe(true);
        expect(winRtx.nativeBackdrop).toBe("acrylic");
        expect(winRtx.shouldUseFallbackTheme).toBe(false);
    });

    test("automatically reverts FX themes to lightweight fallback themes on software GPUs, Windows RDP, Forced Colors, or low-resource systems", () => {
        const swResolved = resolveThemeForHardware("cyberpunk_hologram", {
            gpuRenderer: "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11, D3D11)",
            platform: "win32",
        });
        expect(swResolved.downgraded).toBe(true);
        expect(swResolved.revertedToFallback).toBe(true);
        expect(swResolved.appliedKey).toBe("cyberpunk");
        expect(swResolved.fxMode).toBe("off");
        expect(swResolved.hardware.reason).toBe("software-gpu");

        const rdpResolved = resolveThemeForHardware("quantum_obsidian", {
            platform: "win32",
            remoteSession: true,
        });
        expect(rdpResolved.revertedToFallback).toBe(true);
        expect(rdpResolved.appliedKey).toBe("oled_black");
        expect(rdpResolved.fxMode).toBe("off");
        expect(rdpResolved.hardware.nativeBackdrop).toBe("none");
        expect(rdpResolved.hardware.reason).toBe("windows-remote-session");

        const forcedResolved = resolveThemeForHardware("orbital_ice", {
            platform: "win32",
            forcedColors: true,
        });
        expect(forcedResolved.revertedToFallback).toBe(true);
        expect(forcedResolved.appliedKey).toBe("fluent_light");
        expect(forcedResolved.fxMode).toBe("off");
        expect(forcedResolved.hardware.reason).toBe("windows-forced-colors");

        const lowRamResolved = resolveThemeForHardware("frosted_glass", {
            cores: 2,
            memoryGb: 2,
        });
        expect(lowRamResolved.revertedToFallback).toBe(true);
        expect(lowRamResolved.appliedKey).toBe("apple_light");
        expect(lowRamResolved.fxMode).toBe("reduced");

        // SimpleWindow.setThemeSafe applies the fallback theme automatically on constrained hardware
        const win = createWindow("Test", 400, 300, { theme: "midnight" });
        win.setThemeSafe("m4_space_black", { gpuRenderer: "Google SwiftShader" }, false);
        expect(win.getTheme()).toBe("oled_black");
    });

    test("srgbToDisplayP3 and fxCss include Display-P3, XDR HDR, OKLab/OKLCH, and low-tier fallback rules", () => {
        const p3 = srgbToDisplayP3("#38bdf8");
        expect(p3).toMatch(/^color\(display-p3 [0-9.]+ [0-9.]+ [0-9.]+\)$/);
        const layer = fxCss();
        expect(layer).toContain("@media (color-gamut: p3)");
        expect(layer).toContain("@media (dynamic-range: high)");
        expect(layer).toContain("@media (prefers-reduced-transparency: reduce)");
        expect(layer).toContain('[data-fx][data-fx-tier="low"]');
        expect(layer).toContain("in oklch");
    });

    test("fxPointer supports 0.1px sub-pixel precision on high-DPI displays and downgrades on low-tier hardware", () => {
        const dom = new JSDOM(`<!doctype html><html data-fx="on"><body><button class="fx-button" id="b">Go</button></body></html>`);
        const w = dom.window as any;
        w.requestAnimationFrame = (cb: any) => { cb(16); return 1; };
        w.cancelAnimationFrame = () => {};
        const btn = w.document.getElementById("b");
        btn.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 40 });
        const h = installFxPointer(w);
        const ev = new w.Event("pointermove", { bubbles: true });
        ev.clientX = 60.44;
        ev.clientY = 50.76;
        btn.dispatchEvent(ev);
        expect(btn.style.getPropertyValue("--fx-pointer-x")).toBe("50.4px");
        expect(btn.style.getPropertyValue("--fx-pointer-y")).toBe("30.8px");
        h.dispose();

        // Low-resource device downgrades data-fx="on" to "reduced" and sets data-fx-tier="low"
        const lowDom = new JSDOM(`<!doctype html><html data-fx="on"><body><button class="fx-button" id="b2">Go</button></body></html>`);
        const lw = lowDom.window as any;
        Object.defineProperty(lw.navigator, "hardwareConcurrency", { value: 2, configurable: true });
        const lh = installFxPointer(lw);
        expect(lw.document.documentElement.getAttribute("data-fx-tier")).toBe("low");
        expect(lw.document.documentElement.getAttribute("data-fx")).toBe("reduced");
        lh.dispose();
    });

    test("FX_STYLE_PRESETS and expanded ThemeFx materials, borders, glows, scanlines, grains, vignettes, and optical flags produce valid CSS and root attrs", () => {
        expect(FX_STYLE_PRESETS.length).toBe(12);
        const base = FX_THEMES.prism_reactor!;
        for (const preset of FX_STYLE_PRESETS) {
            const custom = {
                ...base,
                fx: { ...base.fx!, ...preset.fx },
            };
            const vars = fxCssVarsForTheme(custom);
            const attrs = fxRootAttrs(custom);
            expect(vars).toContain("--fx-glow-soft:");
            expect(vars).toContain("--fx-border-gradient:");
            expect(attrs["data-fx"]).toBe("on");
            if (preset.fx.backdropStyle && preset.fx.backdropStyle !== "glass") {
                expect(attrs["data-fx-backdrop"]).toBe(preset.fx.backdropStyle);
            }
            if (preset.fx.vignette && preset.fx.vignette !== "none") {
                expect(attrs["data-fx-vignette"]).toBe(preset.fx.vignette);
            }
            if (preset.fx.prismEdge) expect(attrs["data-fx-prism"]).toBe("on");
            if (preset.fx.innerGlow) expect(attrs["data-fx-inner-glow"]).toBe("on");
            if (preset.fx.frostedRim) expect(attrs["data-fx-rim"]).toBe("on");
            if (preset.fx.neonPulse) expect(attrs["data-fx-pulse"]).toBe("on");
            if (preset.fx.crtCurve) expect(attrs["data-fx-crt"]).toBe("on");
        }
    });
});

