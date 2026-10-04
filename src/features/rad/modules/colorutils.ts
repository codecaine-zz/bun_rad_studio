/**
 * colorutils — Colour science & terminal colour toolkit.
 *
 * Parses any CSS colour via native `Bun.color` (hex, rgb(), hsl(), named, …), converts between
 * RGB / HSL / HSV / CIE-Lab, manipulates (lighten, saturate, rotate, mix, invert), measures
 * (WCAG 2.1 luminance & contrast, ΔE76 distance), generates palettes, and emits 24-bit ANSI.
 *
 * Conventions: RGB channels `0–255`; HSL/HSV `h` in degrees `0–360`, `s`/`l`/`v` in `0–1`;
 * alpha `0–1`.
 *
 * @example
 * import { colorutils } from "./src/features/rad/index.ts";
 * const brand = colorutils.parseColor("rebeccapurple");
 * colorutils.bestTextColor(brand); // { r: 255, g: 255, b: 255 }
 */

/** Red/green/blue, each `0–255`. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** RGB plus alpha `0–1`. */
export interface RGBA extends RGB {
  a: number;
}

/** Hue `0–360`, saturation & lightness `0–1`. */
export interface HSL {
  h: number;
  s: number;
  l: number;
}

/** Hue `0–360`, saturation & value `0–1`. */
export interface HSV {
  h: number;
  s: number;
  v: number;
}

/** CIE L*a*b* (D65). */
export interface LAB {
  l: number;
  a: number;
  b: number;
}

/** WCAG conformance target. `*-large` = ≥18pt or ≥14pt bold text. */
export type WcagLevel = "AA" | "AAA" | "AA-large" | "AAA-large";

const WCAG_THRESHOLDS: Record<WcagLevel, number> = { AA: 4.5, AAA: 7, "AA-large": 3, "AAA-large": 4.5 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
const normHue = (h: number) => ((h % 360) + 360) % 360;

/**
 * Parse any CSS colour string (or RGB object) into RGBA.
 * @throws `[colorutils.parseColor]` on unrecognised input.
 * @example colorutils.parseColor("hsl(120 100% 50% / 0.5)"); // { r: 0, g: 255, b: 0, a: 0.5 }
 */
export function parseColor(input: string | RGB | RGBA): RGBA {
  const out = Bun.color(input as any, "{rgba}") as RGBA | null;
  if (!out) throw new Error(`[colorutils.parseColor] Unrecognised colour: ${JSON.stringify(input)}`);
  return { r: out.r, g: out.g, b: out.b, a: Math.round(out.a * 1000) / 1000 };
}

/** `true` if `Bun.color` understands the input. @example colorutils.isValidColor("tomato"); // true */
export function isValidColor(input: string): boolean {
  return Bun.color(input, "{rgb}") !== null;
}

/** Hex (`#rgb`, `#rrggbb`, also any CSS colour) → RGB. @throws on invalid input. @example colorutils.hexToRgb("#ff5733"); // { r: 255, g: 87, b: 51 } */
export function hexToRgb(hex: string): RGB {
  const out = Bun.color(hex, "{rgb}") as RGB | null;
  if (!out) throw new Error(`[colorutils] Invalid hex color: "${hex}"`);
  return { r: out.r, g: out.g, b: out.b };
}

/** RGB(A) → lowercase `#rrggbb` (or `#rrggbbaa` when `includeAlpha` and `a < 1`). @example colorutils.rgbToHex({ r: 255, g: 255, b: 255 }); // "#ffffff" */
export function rgbToHex(rgb: RGB | RGBA, includeAlpha = false): string {
  const hex = [rgb.r, rgb.g, rgb.b].map((c) => clamp255(c).toString(16).padStart(2, "0")).join("");
  const a = (rgb as RGBA).a;
  const alpha = includeAlpha && a !== undefined && a < 1 ? clamp255(a * 255).toString(16).padStart(2, "0") : "";
  return `#${hex}${alpha}`;
}

/** RGB → `rgb(r, g, b)` / `rgba(r, g, b, a)` CSS string. @example colorutils.toCssRgb({ r: 1, g: 2, b: 3, a: 0.5 }); // "rgba(1, 2, 3, 0.5)" */
export function toCssRgb(rgb: RGB | RGBA): string {
  const a = (rgb as RGBA).a;
  const ch = `${clamp255(rgb.r)}, ${clamp255(rgb.g)}, ${clamp255(rgb.b)}`;
  return a !== undefined && a < 1 ? `rgba(${ch}, ${a})` : `rgb(${ch})`;
}

/** HSL → `hsl(h s% l%)` CSS string. @example colorutils.toCssHsl({ h: 210, s: 0.5, l: 0.4 }); // "hsl(210 50% 40%)" */
export function toCssHsl(hsl: HSL): string {
  return `hsl(${Math.round(hsl.h)} ${Math.round(hsl.s * 100)}% ${Math.round(hsl.l * 100)}%)`;
}

/** RGB → HSL (hue rounded to whole degrees). @example colorutils.rgbToHsl({ r: 255, g: 0, b: 0 }); // { h: 0, s: 1, l: 0.5 } */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return { h: Math.round(h * 360), s, l };
}

/** HSL → RGB. @example colorutils.hslToRgb({ h: 120, s: 1, l: 0.5 }); // { r: 0, g: 255, b: 0 } */
export function hslToRgb(hsl: HSL): RGB {
  const h = normHue(hsl.h) / 360, s = clamp01(hsl.s), l = clamp01(hsl.l);
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    const c = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (c < 1 / 6) return p + (q - p) * 6 * c;
    if (c < 1 / 2) return q;
    if (c < 2 / 3) return p + (q - p) * (2 / 3 - c) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255) };
}

/** RGB → HSV. @example colorutils.rgbToHsv({ r: 0, g: 0, b: 255 }); // { h: 240, s: 1, v: 1 } */
export function rgbToHsv(rgb: RGB): HSV {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: Math.round(normHue(h * 60)), s: max === 0 ? 0 : d / max, v: max };
}

/** HSV → RGB. @example colorutils.hsvToRgb({ h: 240, s: 1, v: 1 }); // { r: 0, g: 0, b: 255 } */
export function hsvToRgb(hsv: HSV): RGB {
  const h = normHue(hsv.h), s = clamp01(hsv.s), v = clamp01(hsv.v);
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return { r: f(5), g: f(3), b: f(1) };
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** RGB → CIE Lab (D65). @example colorutils.rgbToLab({ r: 255, g: 255, b: 255 }).l; // ≈ 100 */
export function rgbToLab(rgb: RGB): LAB {
  const [r, g, b] = [srgbToLinear(rgb.r), srgbToLinear(rgb.g), srgbToLinear(rgb.b)];
  const xyz = [(r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, r * 0.2126 + g * 0.7152 + b * 0.0722, (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883];
  const [fx, fy, fz] = xyz.map((t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)) as [number, number, number];
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Perceptual distance ΔE76 (≈2.3 = just noticeable). @example colorutils.deltaE({ r: 255, g: 0, b: 0 }, { r: 250, g: 0, b: 0 }) < 3; // true */
export function deltaE(c1: RGB, c2: RGB): number {
  const a = rgbToLab(c1), b = rgbToLab(c2);
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

/** Increase HSL lightness by `amount` (0–1). @example colorutils.lighten({ r: 0, g: 0, b: 128 }, 0.2); */
export function lighten(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ ...hsl, l: clamp01(hsl.l + amount) });
}

/** Decrease HSL lightness by `amount` (0–1). @example colorutils.darken({ r: 200, g: 200, b: 255 }, 0.2); */
export function darken(rgb: RGB, amount: number): RGB {
  return lighten(rgb, -amount);
}

/** Increase saturation by `amount` (negative desaturates). @example colorutils.saturate({ r: 150, g: 120, b: 120 }, 0.3); */
export function saturate(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ ...hsl, s: clamp01(hsl.s + amount) });
}

/** Decrease saturation by `amount`. @example colorutils.desaturate({ r: 255, g: 0, b: 0 }, 1); // gray */
export function desaturate(rgb: RGB, amount: number): RGB {
  return saturate(rgb, -amount);
}

/** Rotate hue by `degrees`. @example colorutils.rotateHue({ r: 255, g: 0, b: 0 }, 120); // { r: 0, g: 255, b: 0 } */
export function rotateHue(rgb: RGB, degrees: number): RGB {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ ...hsl, h: normHue(hsl.h + degrees) });
}

/** Opposite hue. @example colorutils.complement({ r: 255, g: 0, b: 0 }); // { r: 0, g: 255, b: 255 } */
export function complement(rgb: RGB): RGB {
  return rotateHue(rgb, 180);
}

/** Channel inversion. @example colorutils.invertColor({ r: 0, g: 0, b: 0 }); // { r: 255, g: 255, b: 255 } */
export function invertColor(rgb: RGB): RGB {
  return { r: 255 - rgb.r, g: 255 - rgb.g, b: 255 - rgb.b };
}

/** Luminance-weighted grayscale. @example colorutils.grayscale({ r: 255, g: 0, b: 0 }); // { r: 54, g: 54, b: 54 } */
export function grayscale(rgb: RGB): RGB {
  const y = clamp255(0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b);
  return { r: y, g: y, b: y };
}

/** Linear RGB blend; `weight` = share of `c2` (0–1). @example colorutils.mix({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5); // { r: 128, g: 128, b: 128 } */
export function mix(c1: RGB, c2: RGB, weight = 0.5): RGB {
  const w = clamp01(weight);
  return { r: clamp255(c1.r + (c2.r - c1.r) * w), g: clamp255(c1.g + (c2.g - c1.g) * w), b: clamp255(c1.b + (c2.b - c1.b) * w) };
}

/** `steps` evenly spaced colours from `from` to `to` (inclusive). @example colorutils.gradient({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 3).length; // 3 */
export function gradient(from: RGB, to: RGB, steps: number): RGB[] {
  if (steps < 2) return [mix(from, to, 0)];
  return Array.from({ length: steps }, (_, i) => mix(from, to, i / (steps - 1)));
}

/** Tailwind-style scale: `count` shades from light tint to dark shade. @example colorutils.shades({ r: 52, g: 152, b: 219 }, 5).length; // 5 */
export function shades(rgb: RGB, count = 9): RGB[] {
  const hsl = rgbToHsl(rgb);
  return Array.from({ length: count }, (_, i) => hslToRgb({ ...hsl, l: 0.95 - (0.85 * i) / Math.max(1, count - 1) }));
}

/** Harmony palettes. @example colorutils.harmony({ r: 255, g: 0, b: 0 }, "triadic").length; // 3 */
export function harmony(rgb: RGB, scheme: "complementary" | "analogous" | "triadic" | "tetradic" | "split"): RGB[] {
  const offsets = { complementary: [0, 180], analogous: [-30, 0, 30], triadic: [0, 120, 240], tetradic: [0, 90, 180, 270], split: [0, 150, 210] }[scheme];
  return offsets.map((o) => (o === 0 ? { ...rgb } : rotateHue(rgb, o)));
}

/** WCAG 2.1 relative luminance (0–1). @example colorutils.luminance({ r: 255, g: 255, b: 255 }); // 1 */
export function luminance(rgb: RGB): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/** WCAG contrast ratio rounded to 2 dp (1–21). @example colorutils.contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }); // 21 */
export function contrastRatio(c1: RGB, c2: RGB): number {
  const [hi, lo] = [luminance(c1), luminance(c2)].sort((a, b) => b - a) as [number, number];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

/** Meets WCAG level? (`AA` 4.5, `AAA` 7, `AA-large` 3, `AAA-large` 4.5). @example colorutils.isAccessible(fg, bg, "AA-large"); */
export function isAccessible(c1: RGB, c2: RGB, level: WcagLevel = "AA"): boolean {
  return contrastRatio(c1, c2) >= WCAG_THRESHOLDS[level];
}

/** `true` when luminance > 0.179 (black text reads better). @example colorutils.isLight({ r: 250, g: 250, b: 210 }); // true */
export function isLight(rgb: RGB): boolean {
  return luminance(rgb) > 0.179;
}

/** Inverse of {@link isLight}. @example colorutils.isDark({ r: 20, g: 20, b: 40 }); // true */
export function isDark(rgb: RGB): boolean {
  return !isLight(rgb);
}

/** Black or white — whichever contrasts more with `bg`. @example colorutils.bestTextColor({ r: 52, g: 152, b: 219 }); // { r: 0, g: 0, b: 0 } */
export function bestTextColor(bg: RGB): RGB {
  return contrastRatio(bg, BLACK) >= contrastRatio(bg, WHITE) ? { ...BLACK } : { ...WHITE };
}

/** Random colour (pass a seeded rng for determinism). @example colorutils.randomColor(); */
export function randomColor(rng: () => number = Math.random): RGB {
  return { r: Math.floor(rng() * 256), g: Math.floor(rng() * 256), b: Math.floor(rng() * 256) };
}

/** 24-bit ANSI foreground. @example console.log(colorutils.fgRgb("ok", { r: 0, g: 200, b: 0 })); */
export function fgRgb(text: string, rgb: RGB): string {
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m`;
}

/** 24-bit ANSI background. @example console.log(colorutils.bgRgb(" ", { r: 255, g: 0, b: 0 })); */
export function bgRgb(text: string, rgb: RGB): string {
  return `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m`;
}

/** Foreground from any CSS colour string. @example console.log(colorutils.fgColor("warn", "orange")); */
export function fgColor(text: string, color: string): string {
  return fgRgb(text, parseColor(color));
}

/** Per-character colour gradient for terminal banners. @example console.log(colorutils.gradientText("BUN RAD", "#f472b6", "#60a5fa")); */
export function gradientText(text: string, from: string | RGB, to: string | RGB): string {
  const chars = Array.from(text);
  const stops = gradient(parseColor(from), parseColor(to), Math.max(2, chars.length));
  return chars.map((ch, i) => `\x1b[38;2;${stops[i]!.r};${stops[i]!.g};${stops[i]!.b}m${ch}`).join("") + "\x1b[0m";
}

/** Namespace bundle (`color` is native `Bun.color`). */
export const colorutils = {
  color: Bun.color,
  parseColor,
  isValidColor,
  hexToRgb,
  rgbToHex,
  toCssRgb,
  toCssHsl,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  hsvToRgb,
  rgbToLab,
  deltaE,
  lighten,
  darken,
  saturate,
  desaturate,
  rotateHue,
  complement,
  invertColor,
  grayscale,
  mix,
  gradient,
  shades,
  harmony,
  luminance,
  contrastRatio,
  isAccessible,
  isLight,
  isDark,
  bestTextColor,
  randomColor,
  fgRgb,
  bgRgb,
  fgColor,
  gradientText,
};
