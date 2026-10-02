export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

// Doer: Parse Hex color string (#RGB or #RRGGBB) to RGB powered by native Bun.color
export function hexToRgb(hex: string): RGB {
  const rgbStr = Bun.color(hex, "rgb");
  if (!rgbStr) {
    throw new Error(`[colorutils] Invalid hex color: "${hex}"`);
  }
  const match = rgbStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) {
    throw new Error(`[colorutils] Invalid hex color: "${hex}"`);
  }
  return {
    r: parseInt(match[1]!, 10),
    g: parseInt(match[2]!, 10),
    b: parseInt(match[3]!, 10),
  };
}

// Doer: Convert RGB to 6-character Hex string powered by native Bun.color
export function rgbToHex(rgb: RGB): string {
  const hex = Bun.color(`rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`, "hex");
  return hex || `#000000`;
}

// Doer: Convert RGB to HSL (H: 0-360, S: 0-1, L: 0-1)
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s, l };
}

// Doer: Convert HSL to RGB
export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const { s, l } = hsl;
  if (s === 0) {
    const val = Math.round(l * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let cur = t;
    if (cur < 0) cur += 1;
    if (cur > 1) cur -= 1;
    if (cur < 1 / 6) return p + (q - p) * 6 * cur;
    if (cur < 1 / 2) return q;
    if (cur < 2 / 3) return p + (q - p) * (2 / 3 - cur) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

// Doer: Lighten color by percentage (0.0 to 1.0)
export function lighten(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.min(1, Math.max(0, hsl.l + amount));
  return hslToRgb(hsl);
}

// Doer: Darken color by percentage (0.0 to 1.0)
export function darken(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.min(1, Math.max(0, hsl.l - amount));
  return hslToRgb(hsl);
}

// Doer: Calculate relative luminance per WCAG 2.1
export function luminance(rgb: RGB): number {
  const a = [rgb.r, rgb.g, rgb.b].map((v) => {
    const val = v / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return a[0]! * 0.2126 + a[1]! * 0.7152 + a[2]! * 0.0722;
}

// Doer: Calculate WCAG 2.1 contrast ratio between two colors (1:1 to 21:1)
export function contrastRatio(c1: RGB, c2: RGB): number {
  const lum1 = luminance(c1);
  const lum2 = luminance(c2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

// Doer: Check if contrast meets WCAG AA (4.5:1) or AAA (7.0:1) threshold
export function isAccessible(c1: RGB, c2: RGB, level: "AA" | "AAA" = "AA"): boolean {
  const ratio = contrastRatio(c1, c2);
  const threshold = level === "AAA" ? 7.0 : 4.5;
  return ratio >= threshold;
}

// Doer: Format 24-bit Truecolor terminal foreground escape sequence
export function fgRgb(text: string, rgb: RGB): string {
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m`;
}

// Doer: Format 24-bit Truecolor terminal background escape sequence
export function bgRgb(text: string, rgb: RGB): string {
  return `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m`;
}

export const colorutils = {
  color: Bun.color,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  lighten,
  darken,
  luminance,
  contrastRatio,
  isAccessible,
  fgRgb,
  bgRgb,
};
