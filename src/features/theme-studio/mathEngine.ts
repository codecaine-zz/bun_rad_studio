/**
 * Layer 2: The Smart Math Engine & Layer 3: Granular CSS Custom Properties Generator
 *
 * Takes the 6 high-level surface inputs (Base Mode, Primary Brand Color, Accent/Action Color,
 * Surface Vibe, Corner Sharpness, Interface Density) and deterministically computes a complete,
 * WCAG contrast-verified design system with 110+ semantic CSS custom properties.
 */

import {
  type BaseMode,
  type CalculatedThemeSystem,
  type CornerRadiusTokens,
  type DensityTokens,
  type InspectorCategory,
  type InteractiveStateTokens,
  type InterfaceDensity,
  SHADE_STEPS_10,
  SHADE_STEPS_ALL,
  type ShadeScale,
  type ShadeStep,
  type SurfaceVibe,
  type SurfaceVibeTokens,
  type TextContrastTokens,
  type ThemeCssVariables,
  type ThemeSurfaceConfig,
  type ThemeVariableDescriptor,
} from "./types";

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampByte(n: number): number {
  return clamp(Math.round(n), 0, 255);
}

/**
 * Normalizes any hex or rgb() string into a valid 6-digit lowercase `#rrggbb` hex string.
 */
export function normalizeHex(input: string | undefined, fallback = "#3b82f6"): string {
  const rgb = parseColorToRgb(input, parseColorToRgb(fallback, { r: 59, g: 130, b: 246 }));
  return rgbToHex(rgb);
}

/**
 * Parses `#rgb`, `#rrggbb`, `#rrggbbaa`, or `rgb()/rgba()` into `{ r, g, b }`.
 */
export function parseColorToRgb(input: string | undefined, fallback: RGB = { r: 59, g: 130, b: 246 }): RGB {
  if (!input || typeof input !== "string") return fallback;
  const s = input.trim();

  const hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (hexMatch) {
    let hex = hexMatch[1]!;
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbMatch = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(s);
  if (rgbMatch) {
    return {
      r: clampByte(Number(rgbMatch[1])),
      g: clampByte(Number(rgbMatch[2])),
      b: clampByte(Number(rgbMatch[3])),
    };
  }

  return fallback;
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toPair = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${toPair(r)}${toPair(g)}${toPair(b)}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = clampByte(r) / 255;
  const gn = clampByte(g) / 255;
  const bn = clampByte(b) / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return { h: 0, s: 0, l: Math.round(l * 1000) / 10 };
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60;
  } else {
    h = ((rn - gn) / d + 4) * 60;
  }

  return {
    h: Math.round(h * 10) / 10,
    s: Math.round(s * 1000) / 10,
    l: Math.round(l * 1000) / 10,
  };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) [rPrime, gPrime, bPrime] = [c, x, 0];
  else if (hue < 120) [rPrime, gPrime, bPrime] = [x, c, 0];
  else if (hue < 180) [rPrime, gPrime, bPrime] = [0, c, x];
  else if (hue < 240) [rPrime, gPrime, bPrime] = [0, x, c];
  else if (hue < 300) [rPrime, gPrime, bPrime] = [x, 0, c];
  else [rPrime, gPrime, bPrime] = [c, 0, x];

  return {
    r: clampByte((rPrime + m) * 255),
    g: clampByte((gPrime + m) * 255),
    b: clampByte((bPrime + m) * 255),
  };
}

export function hexToHsl(hex: string): HSL {
  return rgbToHsl(parseColorToRgb(hex));
}

export function hslToHex(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb({ h, s, l }));
}

export function rgba(hexOrRgb: string | RGB, alpha: number): string {
  const rgb = typeof hexOrRgb === "string" ? parseColorToRgb(hexOrRgb) : hexOrRgb;
  const a = Math.round(clamp(alpha, 0, 1) * 1000) / 1000;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

/**
 * Linear interpolation between two colors in RGB space (`t = 0` -> `colorA`, `t = 1` -> `colorB`).
 */
export function mixHexColors(colorA: string, colorB: string, t: number): string {
  const a = parseColorToRgb(colorA);
  const b = parseColorToRgb(colorB);
  const ratio = clamp(t, 0, 1);
  return rgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

/**
 * WCAG 2.1 relative luminance (0.0 darkest black to 1.0 brightest white).
 */
export function getRelativeLuminance(color: string | RGB): number {
  const { r, g, b } = typeof color === "string" ? parseColorToRgb(color) : color;
  const transform = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

/**
 * WCAG 2.1 contrast ratio between two colors (1.0 to 21.0).
 */
export function getContrastRatio(foreground: string, background: string): number {
  const l1 = getRelativeLuminance(foreground);
  const l2 = getRelativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

/**
 * Automatically shifts `candidateFg` toward white or black until it meets `minRatio` against `bgHex`.
 */
export function ensureContrastRatio(
  candidateFg: string,
  bgHex: string,
  minRatio = 4.5,
  preferLight?: boolean
): string {
  const normalizedFg = normalizeHex(candidateFg);
  const normalizedBg = normalizeHex(bgHex);
  if (getContrastRatio(normalizedFg, normalizedBg) >= minRatio) {
    return normalizedFg;
  }

  const bgLum = getRelativeLuminance(normalizedBg);
  const goLight = preferLight !== undefined ? preferLight : bgLum < 0.42;
  const primaryPole = goLight ? "#ffffff" : "#000000";
  const fallbackPole = goLight ? "#000000" : "#ffffff";

  for (let step = 1; step <= 25; step++) {
    const mixed = mixHexColors(normalizedFg, primaryPole, step / 25);
    if (getContrastRatio(mixed, normalizedBg) >= minRatio) {
      return mixed;
    }
  }

  for (let step = 1; step <= 25; step++) {
    const mixed = mixHexColors(normalizedFg, fallbackPole, step / 25);
    if (getContrastRatio(mixed, normalizedBg) >= minRatio) {
      return mixed;
    }
  }

  return getContrastRatio("#ffffff", normalizedBg) >= getContrastRatio("#000000", normalizedBg)
    ? "#ffffff"
    : "#000000";
}

/**
 * Picks optimal readable foreground text (`on` color) for solid fills such as buttons and badges.
 */
export function pickReadableOnColor(solidBgHex: string, baseMode: BaseMode = "dark"): string {
  const minTarget = baseMode === "high-contrast" ? 7.0 : 4.5;
  const whiteContrast = getContrastRatio("#ffffff", solidBgHex);
  const darkInk = "#090d16";
  const darkContrast = getContrastRatio(darkInk, solidBgHex);

  if (whiteContrast >= minTarget && whiteContrast >= darkContrast) {
    return "#ffffff";
  }
  if (darkContrast >= minTarget) {
    return darkInk;
  }
  return whiteContrast >= darkContrast ? "#ffffff" : "#000000";
}

/**
 * Generates the 10-step (50 to 950, plus 900) background/panel/border neutral shade scale
 * tinted by the Primary Brand Color and calibrated for the selected Base Mode.
 */
export function generateNeutralShadeScale(primaryColor: string, baseMode: BaseMode): ShadeScale {
  const { h, s } = hexToHsl(primaryColor);

  // Calibrate saturation & lightness curves per Base Mode
  const lightnessMap: Record<BaseMode, Record<ShadeStep, number>> = {
    light: {
      50: 98.5,
      100: 95.5,
      200: 90.5,
      300: 83.0,
      400: 68.0,
      500: 52.0,
      600: 39.0,
      700: 28.0,
      800: 18.0,
      900: 11.0,
      950: 6.0,
    },
    dark: {
      50: 96.0,
      100: 90.0,
      200: 80.0,
      300: 67.0,
      400: 53.0,
      500: 41.0,
      600: 30.0,
      700: 21.5,
      800: 15.0,
      900: 10.5,
      950: 7.0,
    },
    midnight: {
      50: 96.5,
      100: 91.0,
      200: 81.0,
      300: 68.0,
      400: 54.0,
      500: 40.0,
      600: 27.0,
      700: 17.5,
      800: 11.0,
      900: 6.2,
      950: 3.2,
    },
    "high-contrast": {
      50: 100.0,
      100: 95.0,
      200: 87.0,
      300: 76.0,
      400: 62.0,
      500: 48.0,
      600: 33.0,
      700: 20.0,
      800: 10.0,
      900: 4.0,
      950: 0.8,
    },
  };

  const saturationFactor: Record<BaseMode, number> = {
    light: 0.22,
    dark: 0.28,
    midnight: 0.42,
    "high-contrast": 0.12,
  };

  const baseSat = clamp(s * saturationFactor[baseMode], 4, baseMode === "midnight" ? 38 : 26);
  const scale = {} as ShadeScale;

  for (const step of SHADE_STEPS_ALL) {
    const l = lightnessMap[baseMode][step];
    // Slightly boost saturation in deep mid-darks for richness, taper at extremes
    const extremityDampener = l > 92 || l < 5 ? 0.65 : 1.0;
    const stepSat = baseMode === "high-contrast" && (step === 50 || step === 950) ? 0 : baseSat * extremityDampener;
    scale[step] = hslToHex(h, stepSat, l);
  }

  return scale;
}

/**
 * Generates a 10-step (50 to 950, plus 900) chromatic shade scale for Primary or Accent colors.
 */
export function generateBrandShadeScale(brandHex: string): ShadeScale {
  const { h, s, l } = hexToHsl(brandHex);
  const baseSat = clamp(s, 35, 96);

  const stepLightness: Record<ShadeStep, number> = {
    50: 96.5,
    100: 91.5,
    200: 83.0,
    300: 72.0,
    400: 61.0,
    500: clamp(l, 42, 58),
    600: 44.0,
    700: 35.0,
    800: 26.5,
    900: 18.5,
    950: 11.0,
  };

  const scale = {} as ShadeScale;
  for (const step of SHADE_STEPS_ALL) {
    if (step === 500) {
      scale[step] = normalizeHex(brandHex);
    } else {
      const targetL = stepLightness[step];
      const satAdjust = step <= 100 ? baseSat * 0.82 : step >= 900 ? baseSat * 0.88 : baseSat;
      scale[step] = hslToHex(h, satAdjust, targetL);
    }
  }
  return scale;
}

/**
 * Computes hover, active, focus-ring, and disabled states for an interactive color token.
 */
export function computeInteractiveStates(
  baseColorHex: string,
  baseMode: BaseMode,
  surfaceBgHex: string,
  neutralScale: ShadeScale
): InteractiveStateTokens {
  const isLight = baseMode === "light";
  const isHighContrast = baseMode === "high-contrast";

  // Ensure the interactive base color stands out clearly against the surface
  const minSurfaceContrast = isHighContrast ? 4.5 : 2.6;
  const safeBase = ensureContrastRatio(baseColorHex, surfaceBgHex, minSurfaceContrast, !isLight);
  const { h, s, l } = hexToHsl(safeBase);

  const hoverL = isLight ? clamp(l - 6, 12, 88) : clamp(l + 7, 18, 92);
  const activeL = isLight ? clamp(l - 12, 8, 82) : clamp(l - 7, 10, 86);

  const hover = hslToHex(h, clamp(s + 4, 0, 100), hoverL);
  const active = hslToHex(h, clamp(s + 6, 0, 100), activeL);

  const focusBorder = isHighContrast
    ? ensureContrastRatio(safeBase, surfaceBgHex, 7.0, true)
    : hslToHex(h, clamp(s + 10, 50, 100), isLight ? clamp(l, 35, 55) : clamp(l + 10, 55, 80));

  const focusRingAlpha = isHighContrast ? 0.65 : isLight ? 0.28 : 0.38;
  const focusRingWidth = isHighContrast ? "3px" : "3px";
  const focusRing = `0 0 0 ${focusRingWidth} ${rgba(focusBorder, focusRingAlpha)}`;

  const disabledBg = isLight ? neutralScale[200] : neutralScale[800];
  const disabledText = isLight ? neutralScale[400] : neutralScale[600];
  const textOnBase = pickReadableOnColor(safeBase, baseMode);

  const subtleAlpha = isHighContrast ? 0.24 : isLight ? 0.12 : 0.16;
  const borderAlpha = isHighContrast ? 0.75 : isLight ? 0.32 : 0.42;

  return {
    base: safeBase,
    hover,
    active,
    focusRing,
    focusBorder,
    disabledBg,
    disabledText,
    textOnBase,
    subtleBg: rgba(safeBase, subtleAlpha),
    subtleBorder: rgba(safeBase, borderAlpha),
  };
}

/**
 * Calculates shadow depth, glass blur intensity, and border glow based on the Surface Vibe.
 */
export function computeSurfaceVibeTokens(
  vibe: SurfaceVibe,
  baseMode: BaseMode,
  primaryColor: string,
  accentColor: string
): SurfaceVibeTokens {
  const isLight = baseMode === "light";
  const isMidnight = baseMode === "midnight";
  const isHighContrast = baseMode === "high-contrast";

  const shadowInk = isLight ? "15, 23, 42" : "0, 0, 0";
  const primaryRgb = parseColorToRgb(primaryColor);
  const accentRgb = parseColorToRgb(accentColor);

  switch (vibe) {
    case "flat": {
      return {
        shadowXs: "none",
        shadowSm: isHighContrast ? "none" : `0 1px 2px rgba(${shadowInk}, ${isLight ? 0.04 : 0.18})`,
        shadowMd: isHighContrast ? "none" : `0 2px 4px rgba(${shadowInk}, ${isLight ? 0.06 : 0.24})`,
        shadowElevated: isHighContrast
          ? `0 0 0 2px ${primaryColor}`
          : `0 4px 12px rgba(${shadowInk}, ${isLight ? 0.08 : 0.32})`,
        shadowModal: `0 16px 36px rgba(${shadowInk}, ${isLight ? 0.14 : 0.55})`,
        shadowGlow: "0 0 0 transparent",
        shadowInset: "none",
        glassBlur: "0px",
        glassSaturate: "100%",
        surfaceBackdrop: "none",
        borderGlow: "transparent",
        panelBgAlpha: 1,
        elevatedBgAlpha: 1,
      };
    }

    case "frosted-glass": {
      const blurPx = isMidnight ? "22px" : "16px";
      const satPct = isLight ? "160%" : "180%";
      const rimAlpha = isLight ? 0.65 : 0.14;
      return {
        shadowXs: `0 1px 2px rgba(${shadowInk}, ${isLight ? 0.05 : 0.25})`,
        shadowSm: `0 4px 12px rgba(${shadowInk}, ${isLight ? 0.07 : 0.32}), inset 0 1px 0 rgba(255, 255, 255, ${rimAlpha})`,
        shadowMd: `0 8px 24px rgba(${shadowInk}, ${isLight ? 0.1 : 0.4}), inset 0 1px 0 rgba(255, 255, 255, ${rimAlpha})`,
        shadowElevated: `0 16px 40px -4px rgba(${shadowInk}, ${isLight ? 0.14 : 0.52}), 0 4px 12px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, ${isLight ? 0.08 : 0.16}), inset 0 1px 0 rgba(255, 255, 255, ${rimAlpha})`,
        shadowModal: `0 24px 64px -8px rgba(${shadowInk}, ${isLight ? 0.22 : 0.68}), inset 0 1px 0 rgba(255, 255, 255, ${rimAlpha})`,
        shadowGlow: `0 0 24px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, ${isLight ? 0.18 : 0.28})`,
        shadowInset: `inset 0 1px 0 rgba(255, 255, 255, ${rimAlpha})`,
        glassBlur: blurPx,
        glassSaturate: satPct,
        surfaceBackdrop: `blur(${blurPx}) saturate(${satPct})`,
        borderGlow: rgba(primaryColor, isLight ? 0.28 : 0.38),
        panelBgAlpha: isHighContrast ? 0.94 : isLight ? 0.76 : 0.72,
        elevatedBgAlpha: isHighContrast ? 0.96 : isLight ? 0.86 : 0.82,
      };
    }

    case "matte": {
      const matteTopRim = isLight ? "rgba(255, 255, 255, 0.5)" : "rgba(255, 255, 255, 0.04)";
      const matteBottomRim = isLight ? "rgba(15, 23, 42, 0.05)" : "rgba(0, 0, 0, 0.35)";
      return {
        shadowXs: `0 1px 2px rgba(${shadowInk}, ${isLight ? 0.05 : 0.22})`,
        shadowSm: `0 2px 5px rgba(${shadowInk}, ${isLight ? 0.07 : 0.28}), inset 0 1px 0 ${matteTopRim}`,
        shadowMd: `0 6px 14px -2px rgba(${shadowInk}, ${isLight ? 0.09 : 0.36}), inset 0 1px 0 ${matteTopRim}, inset 0 -1px 0 ${matteBottomRim}`,
        shadowElevated: `0 12px 26px -4px rgba(${shadowInk}, ${isLight ? 0.12 : 0.45}), inset 0 1px 0 ${matteTopRim}`,
        shadowModal: `0 22px 48px -6px rgba(${shadowInk}, ${isLight ? 0.18 : 0.6})`,
        shadowGlow: "0 0 0 transparent",
        shadowInset: `inset 0 1px 2px rgba(${shadowInk}, ${isLight ? 0.06 : 0.28})`,
        glassBlur: "0px",
        glassSaturate: "100%",
        surfaceBackdrop: "none",
        borderGlow: "transparent",
        panelBgAlpha: 1,
        elevatedBgAlpha: 1,
      };
    }

    case "neon-border": {
      const pGlowStrong = rgba(primaryColor, isLight ? 0.42 : 0.58);
      const pGlowSoft = rgba(primaryColor, isLight ? 0.22 : 0.32);
      const aGlowSoft = rgba(accentColor, isLight ? 0.18 : 0.28);
      return {
        shadowXs: `0 0 0 1px ${pGlowSoft}`,
        shadowSm: `0 0 0 1px ${pGlowSoft}, 0 0 12px ${pGlowSoft}`,
        shadowMd: `0 0 0 1px ${pGlowStrong}, 0 0 18px ${pGlowSoft}, 0 4px 16px rgba(${shadowInk}, ${isLight ? 0.1 : 0.45})`,
        shadowElevated: `0 0 0 1px ${pGlowStrong}, 0 0 24px ${pGlowSoft}, 0 0 42px ${aGlowSoft}, 0 12px 32px rgba(${shadowInk}, ${isLight ? 0.14 : 0.58})`,
        shadowModal: `0 0 0 1.5px ${primaryColor}, 0 0 36px ${pGlowStrong}, 0 0 64px ${aGlowSoft}, 0 24px 60px rgba(${shadowInk}, 0.72)`,
        shadowGlow: `0 0 0 1px ${pGlowStrong}, 0 0 18px ${pGlowStrong}, 0 0 34px ${aGlowSoft}`,
        shadowInset: `inset 0 0 12px ${rgba(primaryColor, isLight ? 0.08 : 0.14)}`,
        glassBlur: "10px",
        glassSaturate: "140%",
        surfaceBackdrop: "blur(10px) saturate(140%)",
        borderGlow: primaryColor,
        panelBgAlpha: isLight ? 0.92 : 0.88,
        elevatedBgAlpha: isLight ? 0.96 : 0.92,
      };
    }
  }
}

/**
 * Maps Corner Sharpness slider (0px sharp to 24px pill-shaped) into semantic radius tokens.
 */
export function computeCornerTokens(cornerSharpness: number): CornerRadiusTokens {
  const c = clamp(Math.round(cornerSharpness), 0, 24);
  if (c === 0) {
    return {
      radiusXs: "0px",
      radiusSm: "0px",
      radiusMd: "0px",
      radiusLg: "0px",
      radiusXl: "0px",
      radiusPill: "0px",
      radiusButton: "0px",
      radiusInput: "0px",
      radiusCard: "0px",
      radiusModal: "0px",
      radiusBadge: "0px",
    };
  }

  const xs = Math.max(1, Math.round(c * 0.35));
  const sm = Math.max(2, Math.round(c * 0.65));
  const md = c;
  const lg = Math.round(c * 1.35);
  const xl = Math.round(c * 1.75);
  const pill = c >= 20 ? "9999px" : `${Math.max(c * 2, 16)}px`;

  return {
    radiusXs: `${xs}px`,
    radiusSm: `${sm}px`,
    radiusMd: `${md}px`,
    radiusLg: `${lg}px`,
    radiusXl: `${xl}px`,
    radiusPill: "9999px",
    radiusButton: c >= 22 ? "9999px" : `${md}px`,
    radiusInput: c >= 22 ? "9999px" : `${sm}px`,
    radiusCard: `${lg}px`,
    radiusModal: `${xl}px`,
    radiusBadge: c >= 14 ? "9999px" : `${xs}px`,
  };
}

/**
 * Maps Interface Density (Compact, Comfortable, Spacious) into spacing, sizing, and typography tokens.
 */
export function computeDensityTokens(density: InterfaceDensity): DensityTokens {
  switch (density) {
    case "compact":
      return {
        controlHeightSm: "26px",
        controlHeightMd: "30px",
        controlHeightLg: "36px",
        paddingXSm: "8px",
        paddingXMd: "10px",
        paddingXLg: "14px",
        paddingYSm: "4px",
        paddingYMd: "6px",
        gapXs: "4px",
        gapSm: "6px",
        gapMd: "10px",
        gapLg: "14px",
        gapXl: "20px",
        panelPadding: "12px",
        tableCellPadding: "6px 10px",
        fontSizeXs: "11px",
        fontSizeSm: "12px",
        fontSizeBase: "13px",
        fontSizeLg: "15px",
        fontSizeXl: "18px",
        lineHeightBase: "1.4",
      };

    case "comfortable":
      return {
        controlHeightSm: "30px",
        controlHeightMd: "36px",
        controlHeightLg: "42px",
        paddingXSm: "10px",
        paddingXMd: "14px",
        paddingXLg: "18px",
        paddingYSm: "6px",
        paddingYMd: "8px",
        gapXs: "6px",
        gapSm: "8px",
        gapMd: "14px",
        gapLg: "20px",
        gapXl: "28px",
        panelPadding: "18px",
        tableCellPadding: "10px 14px",
        fontSizeXs: "11.5px",
        fontSizeSm: "13px",
        fontSizeBase: "14px",
        fontSizeLg: "16px",
        fontSizeXl: "20px",
        lineHeightBase: "1.5",
      };

    case "spacious":
      return {
        controlHeightSm: "34px",
        controlHeightMd: "42px",
        controlHeightLg: "50px",
        paddingXSm: "14px",
        paddingXMd: "18px",
        paddingXLg: "24px",
        paddingYSm: "8px",
        paddingYMd: "12px",
        gapXs: "8px",
        gapSm: "12px",
        gapMd: "18px",
        gapLg: "26px",
        gapXl: "36px",
        panelPadding: "24px",
        tableCellPadding: "14px 18px",
        fontSizeXs: "12px",
        fontSizeSm: "13.5px",
        fontSizeBase: "15px",
        fontSizeLg: "18px",
        fontSizeXl: "22px",
        lineHeightBase: "1.6",
      };
  }
}

/**
 * Default Surface Configuration (Layer 1).
 */
export const DEFAULT_SURFACE_CONFIG: ThemeSurfaceConfig = {
  baseMode: "dark",
  primaryColor: "#3b82f6",
  accentColor: "#8b5cf6",
  surfaceVibe: "frosted-glass",
  cornerSharpness: 10,
  density: "comfortable",
};

/**
 * Complete Pro Inspector Variable Catalog (Layer 3)
 * Grouped into the 8 required collapsible accordion sections:
 * Backgrounds, Typography, Borders, Buttons, Inputs, Code/Terminal, Scrollbars, Shadows.
 */
export const THEME_VARIABLE_CATALOG: readonly ThemeVariableDescriptor[] = [
  // 1. Backgrounds
  { name: "--bg-app", label: "App Canvas Background", category: "Backgrounds", kind: "color", description: "Primary application viewport background" },
  { name: "--bg-panel", label: "Panel Surface", category: "Backgrounds", kind: "color", description: "Cards, drawers, sidebars, and primary containers" },
  { name: "--bg-elevated", label: "Elevated Surface", category: "Backgrounds", kind: "color", description: "Popovers, dropdowns, modals, and floating cards" },
  { name: "--bg-surface", label: "Subtle Section Fill", category: "Backgrounds", kind: "color", description: "Secondary content wells, table headers, and toolbars" },
  { name: "--bg-hover", label: "Interactive Hover Fill", category: "Backgrounds", kind: "color", description: "Row, tab, and list item hover background" },
  { name: "--bg-active", label: "Interactive Active Fill", category: "Backgrounds", kind: "color", description: "Pressed or active surface background" },
  { name: "--bg-selected", label: "Selected Item Fill", category: "Backgrounds", kind: "color", description: "Selected table row or active navigation item tint" },
  { name: "--bg-glass", label: "Translucent Glass Fill", category: "Backgrounds", kind: "color", description: "Frosted glass surface background with alpha" },
  { name: "--bg-overlay", label: "Modal Backdrop Overlay", category: "Backgrounds", kind: "color", description: "Dimmed scrim behind modal dialogs and drawers" },
  { name: "--shade-50", label: "Shade 50 (Lightest)", category: "Backgrounds", kind: "color", description: "Step 50 in the 10-step neutral shade scale" },
  { name: "--shade-100", label: "Shade 100", category: "Backgrounds", kind: "color", description: "Step 100 in the 10-step neutral shade scale" },
  { name: "--shade-200", label: "Shade 200", category: "Backgrounds", kind: "color", description: "Step 200 in the 10-step neutral shade scale" },
  { name: "--shade-300", label: "Shade 300", category: "Backgrounds", kind: "color", description: "Step 300 in the 10-step neutral shade scale" },
  { name: "--shade-400", label: "Shade 400", category: "Backgrounds", kind: "color", description: "Step 400 in the 10-step neutral shade scale" },
  { name: "--shade-500", label: "Shade 500 (Midpoint)", category: "Backgrounds", kind: "color", description: "Step 500 in the 10-step neutral shade scale" },
  { name: "--shade-600", label: "Shade 600", category: "Backgrounds", kind: "color", description: "Step 600 in the 10-step neutral shade scale" },
  { name: "--shade-700", label: "Shade 700", category: "Backgrounds", kind: "color", description: "Step 700 in the 10-step neutral shade scale" },
  { name: "--shade-800", label: "Shade 800", category: "Backgrounds", kind: "color", description: "Step 800 in the 10-step neutral shade scale" },
  { name: "--shade-900", label: "Shade 900", category: "Backgrounds", kind: "color", description: "Step 900 deep surface shade" },
  { name: "--shade-950", label: "Shade 950 (Deepest)", category: "Backgrounds", kind: "color", description: "Step 950 in the 10-step neutral shade scale" },

  // 2. Typography
  { name: "--text-primary", label: "Primary Text", category: "Typography", kind: "color", description: "High-contrast headings and body copy" },
  { name: "--text-secondary", label: "Secondary Text", category: "Typography", kind: "color", description: "Subtitles, supporting descriptions, and labels" },
  { name: "--text-muted", label: "Muted / Caption Text", category: "Typography", kind: "color", description: "Timestamps, metadata, and helper captions" },
  { name: "--text-on-primary", label: "Text on Primary Brand", category: "Typography", kind: "color", description: "Auto-contrasted foreground on primary fills" },
  { name: "--text-on-accent", label: "Text on Accent Action", category: "Typography", kind: "color", description: "Auto-contrasted foreground on accent fills" },
  { name: "--text-link", label: "Hyperlink Text", category: "Typography", kind: "color", description: "Interactive anchor and breadcrumb links" },
  { name: "--text-success", label: "Success Status Text", category: "Typography", kind: "color", description: "Contrast-checked positive status foreground" },
  { name: "--text-warning", label: "Warning Status Text", category: "Typography", kind: "color", description: "Contrast-checked caution status foreground" },
  { name: "--text-danger", label: "Danger Status Text", category: "Typography", kind: "color", description: "Contrast-checked error/destructive foreground" },
  { name: "--text-info", label: "Info Status Text", category: "Typography", kind: "color", description: "Contrast-checked informational foreground" },
  { name: "--font-sans", label: "Sans-Serif Font Stack", category: "Typography", kind: "font", description: "Primary UI font family" },
  { name: "--font-mono", label: "Monospace Font Stack", category: "Typography", kind: "font", description: "Code, token, and terminal font family" },
  { name: "--font-size-xs", label: "Font Size XS", category: "Typography", kind: "length", description: "Micro badges and dense metadata" },
  { name: "--font-size-sm", label: "Font Size SM", category: "Typography", kind: "length", description: "Secondary controls and table cells" },
  { name: "--font-size-base", label: "Font Size Base", category: "Typography", kind: "length", description: "Default body and control font size" },
  { name: "--font-size-lg", label: "Font Size LG", category: "Typography", kind: "length", description: "Card titles and section headers" },
  { name: "--font-size-xl", label: "Font Size XL", category: "Typography", kind: "length", description: "Primary view headings" },
  { name: "--line-height-base", label: "Base Line Height", category: "Typography", kind: "text", description: "Typographic vertical rhythm multiplier" },

  // 3. Borders
  { name: "--border-subtle", label: "Subtle Hairline Border", category: "Borders", kind: "color", description: "Low-contrast dividers, table cells, and card outlines" },
  { name: "--border-default", label: "Default Structural Border", category: "Borders", kind: "color", description: "Standard panel, group, and toolbar border" },
  { name: "--border-strong", label: "Strong Emphasized Border", category: "Borders", kind: "color", description: "Hovered cards and active dividers" },
  { name: "--border-focus", label: "Keyboard Focus Border", category: "Borders", kind: "color", description: "Focused input, button, and control outline color" },
  { name: "--border-glow", label: "Surface Vibe Border Glow", category: "Borders", kind: "color", description: "Chromatic neon or glass rim border highlight" },
  { name: "--border-width", label: "Structural Border Width", category: "Borders", kind: "length", description: "Default border stroke thickness" },
  { name: "--radius-xs", label: "Radius XS", category: "Borders", kind: "length", description: "Extra-small corner radius (badges, code tags)" },
  { name: "--radius-sm", label: "Radius SM", category: "Borders", kind: "length", description: "Small corner radius (inputs, inner controls)" },
  { name: "--radius-md", label: "Radius MD", category: "Borders", kind: "length", description: "Medium corner radius (buttons, tabs, dropdowns)" },
  { name: "--radius-lg", label: "Radius LG", category: "Borders", kind: "length", description: "Large corner radius (panels, cards, tables)" },
  { name: "--radius-xl", label: "Radius XL", category: "Borders", kind: "length", description: "Extra-large corner radius (modals, drawers)" },
  { name: "--radius-pill", label: "Radius Pill", category: "Borders", kind: "length", description: "Full capsule radius for pills and tags" },
  { name: "--focus-ring", label: "Focus Ring Shadow", category: "Borders", kind: "shadow", description: "Accessible keyboard focus halo box-shadow" },

  // 4. Buttons
  { name: "--btn-primary-bg", label: "Primary Button Fill", category: "Buttons", kind: "color", description: "Default background for primary CTA buttons" },
  { name: "--btn-primary-hover", label: "Primary Button Hover", category: "Buttons", kind: "color", description: "Hovered background for primary CTA buttons" },
  { name: "--btn-primary-active", label: "Primary Button Active", category: "Buttons", kind: "color", description: "Pressed background for primary CTA buttons" },
  { name: "--btn-primary-text", label: "Primary Button Text", category: "Buttons", kind: "color", description: "Contrast-checked label color on primary buttons" },
  { name: "--btn-primary-border", label: "Primary Button Border", category: "Buttons", kind: "color", description: "Border color for primary buttons" },
  { name: "--btn-accent-bg", label: "Accent Button Fill", category: "Buttons", kind: "color", description: "Default background for accent/action buttons" },
  { name: "--btn-accent-hover", label: "Accent Button Hover", category: "Buttons", kind: "color", description: "Hovered background for accent/action buttons" },
  { name: "--btn-accent-active", label: "Accent Button Active", category: "Buttons", kind: "color", description: "Pressed background for accent/action buttons" },
  { name: "--btn-accent-text", label: "Accent Button Text", category: "Buttons", kind: "color", description: "Contrast-checked label color on accent buttons" },
  { name: "--btn-secondary-bg", label: "Secondary Button Fill", category: "Buttons", kind: "color", description: "Neutral surface button background" },
  { name: "--btn-secondary-hover", label: "Secondary Button Hover", category: "Buttons", kind: "color", description: "Neutral surface button hover background" },
  { name: "--btn-secondary-active", label: "Secondary Button Active", category: "Buttons", kind: "color", description: "Neutral surface button active background" },
  { name: "--btn-secondary-text", label: "Secondary Button Text", category: "Buttons", kind: "color", description: "Label color on secondary buttons" },
  { name: "--btn-secondary-border", label: "Secondary Button Border", category: "Buttons", kind: "color", description: "Border stroke on secondary buttons" },
  { name: "--btn-disabled-bg", label: "Disabled Button Fill", category: "Buttons", kind: "color", description: "Background of disabled interactive buttons" },
  { name: "--btn-disabled-text", label: "Disabled Button Text", category: "Buttons", kind: "color", description: "Muted foreground of disabled buttons" },
  { name: "--btn-height", label: "Button Control Height", category: "Buttons", kind: "length", description: "Standard button height derived from density" },
  { name: "--btn-padding-x", label: "Button Horizontal Padding", category: "Buttons", kind: "length", description: "Horizontal internal button padding" },
  { name: "--btn-radius", label: "Button Corner Radius", category: "Buttons", kind: "length", description: "Corner sharpness applied to buttons" },

  // 5. Inputs
  { name: "--input-bg", label: "Input Field Fill", category: "Inputs", kind: "color", description: "Text input, select, and textarea background" },
  { name: "--input-hover-bg", label: "Input Hover Fill", category: "Inputs", kind: "color", description: "Background when hovering over an input field" },
  { name: "--input-focus-bg", label: "Input Focus Fill", category: "Inputs", kind: "color", description: "Background when an input field is focused" },
  { name: "--input-text", label: "Input Value Text", category: "Inputs", kind: "color", description: "Typed value color inside form controls" },
  { name: "--input-placeholder", label: "Input Placeholder Text", category: "Inputs", kind: "color", description: "Placeholder hint text inside empty inputs" },
  { name: "--input-border", label: "Input Resting Border", category: "Inputs", kind: "color", description: "Default border stroke on form controls" },
  { name: "--input-hover-border", label: "Input Hover Border", category: "Inputs", kind: "color", description: "Hovered border stroke on form controls" },
  { name: "--input-focus-border", label: "Input Focus Border", category: "Inputs", kind: "color", description: "Active border stroke when input has focus" },
  { name: "--input-focus-ring", label: "Input Focus Halo", category: "Inputs", kind: "shadow", description: "Outer focus ring box-shadow on inputs" },
  { name: "--input-disabled-bg", label: "Disabled Input Fill", category: "Inputs", kind: "color", description: "Background for disabled form fields" },
  { name: "--input-disabled-text", label: "Disabled Input Text", category: "Inputs", kind: "color", description: "Text color for disabled form fields" },
  { name: "--input-height", label: "Input Control Height", category: "Inputs", kind: "length", description: "Standard single-line input height" },
  { name: "--input-padding-x", label: "Input Horizontal Padding", category: "Inputs", kind: "length", description: "Horizontal padding inside inputs" },
  { name: "--input-radius", label: "Input Corner Radius", category: "Inputs", kind: "length", description: "Corner radius for inputs and selects" },

  // 6. Code/Terminal
  { name: "--code-bg", label: "Code Block Background", category: "Code/Terminal", kind: "color", description: "Preformatted code editor and snippet canvas" },
  { name: "--code-border", label: "Code Block Border", category: "Code/Terminal", kind: "color", description: "Border around code and terminal blocks" },
  { name: "--code-text", label: "Code Default Foreground", category: "Code/Terminal", kind: "color", description: "Default identifier and punctuation color" },
  { name: "--code-keyword", label: "Syntax Keyword Color", category: "Code/Terminal", kind: "color", description: "Language keywords (const, export, return)" },
  { name: "--code-string", label: "Syntax String Color", category: "Code/Terminal", kind: "color", description: "String literals and template values" },
  { name: "--code-number", label: "Syntax Number Color", category: "Code/Terminal", kind: "color", description: "Numeric constants, booleans, and units" },
  { name: "--code-function", label: "Syntax Function Color", category: "Code/Terminal", kind: "color", description: "Function, method, and class names" },
  { name: "--code-comment", label: "Syntax Comment Color", category: "Code/Terminal", kind: "color", description: "Inline and docblock code comments" },
  { name: "--terminal-bg", label: "Terminal Viewport Fill", category: "Code/Terminal", kind: "color", description: "Console and shell output background" },
  { name: "--terminal-text", label: "Terminal Output Text", category: "Code/Terminal", kind: "color", description: "Primary stdout text inside terminal" },
  { name: "--terminal-cursor", label: "Terminal Cursor Color", category: "Code/Terminal", kind: "color", description: "Active caret and prompt indicator color" },

  // 7. Scrollbars
  { name: "--scrollbar-track", label: "Scrollbar Track Fill", category: "Scrollbars", kind: "color", description: "Background channel behind scrollbars" },
  { name: "--scrollbar-thumb", label: "Scrollbar Thumb Fill", category: "Scrollbars", kind: "color", description: "Draggable scrollbar thumb indicator" },
  { name: "--scrollbar-thumb-hover", label: "Scrollbar Thumb Hover", category: "Scrollbars", kind: "color", description: "Hovered or active scrollbar thumb color" },
  { name: "--scrollbar-width", label: "Scrollbar Pixel Width", category: "Scrollbars", kind: "length", description: "Scrollbar thickness for WebKit/Blink fallback" },
  { name: "--scrollbar-width-keyword", label: "Standard Scrollbar Width", category: "Scrollbars", kind: "text", description: "CSS scrollbar-width keyword (thin or auto)" },

  // 8. Shadows
  { name: "--shadow-xs", label: "Shadow XS (Hairline)", category: "Shadows", kind: "shadow", description: "Micro-elevation for badges and subtle controls" },
  { name: "--shadow-sm", label: "Shadow SM (Low)", category: "Shadows", kind: "shadow", description: "Resting card and button elevation" },
  { name: "--shadow-md", label: "Shadow MD (Medium)", category: "Shadows", kind: "shadow", description: "Hovered card and dropdown elevation" },
  { name: "--shadow-elevated", label: "Shadow Elevated (High)", category: "Shadows", kind: "shadow", description: "Floating panels, popovers, and drawers" },
  { name: "--shadow-modal", label: "Shadow Modal (Dialog)", category: "Shadows", kind: "shadow", description: "Deep dialog and command palette shadow" },
  { name: "--shadow-glow", label: "Shadow Chromatic Glow", category: "Shadows", kind: "shadow", description: "Ambient or neon border luminescence" },
  { name: "--shadow-inset", label: "Shadow Specular Inset", category: "Shadows", kind: "shadow", description: "Inner glass rim or matte top highlight" },
  { name: "--glass-blur", label: "Glass Blur Radius", category: "Shadows", kind: "length", description: "Backdrop blur intensity in pixels" },
  { name: "--glass-saturate", label: "Glass Backdrop Saturation", category: "Shadows", kind: "text", description: "Backdrop color saturation multiplier" },
  { name: "--surface-backdrop", label: "Surface Backdrop Filter", category: "Shadows", kind: "text", description: "Composite CSS backdrop-filter value" },
] as const;

/**
 * Returns the catalog descriptors grouped by the 8 Pro Inspector categories.
 */
export function getCatalogByCategory(): Record<InspectorCategory, ThemeVariableDescriptor[]> {
  const grouped: Record<InspectorCategory, ThemeVariableDescriptor[]> = {
    Backgrounds: [],
    Typography: [],
    Borders: [],
    Buttons: [],
    Inputs: [],
    "Code/Terminal": [],
    Scrollbars: [],
    Shadows: [],
  };
  for (const item of THEME_VARIABLE_CATALOG) {
    grouped[item.category].push(item);
  }
  return grouped;
}

/**
 * Core Layer 2 Smart Math Engine:
 * Takes the 6 simple surface controls (plus any optional Pro Inspector deep overrides)
 * and computes the entire harmonious design system and `:root` CSS variables.
 */
export function calculateThemeSystem(
  surfaceInput: Partial<ThemeSurfaceConfig> = {},
  rawOverrides: Record<string, string> = {}
): CalculatedThemeSystem {
  const surface: ThemeSurfaceConfig = {
    baseMode: surfaceInput.baseMode ?? DEFAULT_SURFACE_CONFIG.baseMode,
    primaryColor: normalizeHex(surfaceInput.primaryColor, DEFAULT_SURFACE_CONFIG.primaryColor),
    accentColor: normalizeHex(surfaceInput.accentColor, DEFAULT_SURFACE_CONFIG.accentColor),
    surfaceVibe: surfaceInput.surfaceVibe ?? DEFAULT_SURFACE_CONFIG.surfaceVibe,
    cornerSharpness: clamp(
      typeof surfaceInput.cornerSharpness === "number" && !Number.isNaN(surfaceInput.cornerSharpness)
        ? Math.round(surfaceInput.cornerSharpness)
        : DEFAULT_SURFACE_CONFIG.cornerSharpness,
      0,
      24
    ),
    density: surfaceInput.density ?? DEFAULT_SURFACE_CONFIG.density,
  };

  const isLight = surface.baseMode === "light";
  const isMidnight = surface.baseMode === "midnight";
  const isHighContrast = surface.baseMode === "high-contrast";
  const isDark = !isLight;
  const colorScheme: "light" | "dark" = isLight ? "light" : "dark";

  // 1. 10-step (50..950) shade scales for Neutral surfaces, Primary Brand, and Accent
  const neutralScale = generateNeutralShadeScale(surface.primaryColor, surface.baseMode);
  const primaryScale = generateBrandShadeScale(surface.primaryColor);
  const accentScale = generateBrandShadeScale(surface.accentColor);

  // 2. Surface Backgrounds derived from Base Mode & Neutral Shade Scale
  const bgAppSolid = isLight
    ? neutralScale[50]
    : isHighContrast
      ? "#000000"
      : isMidnight
        ? neutralScale[950]
        : neutralScale[900];

  const bgPanelSolid = isLight
    ? "#ffffff"
    : isHighContrast
      ? "#07090e"
      : isMidnight
        ? neutralScale[900]
        : neutralScale[800];

  const bgElevatedSolid = isLight
    ? "#ffffff"
    : isHighContrast
      ? "#0f131d"
      : isMidnight
        ? neutralScale[800]
        : neutralScale[700];

  const bgSurfaceSolid = isLight
    ? neutralScale[100]
    : isHighContrast
      ? "#111622"
      : isMidnight
        ? neutralScale[900]
        : neutralScale[800];

  // 3. Surface Vibe physics (Shadow depth, glass blur, border glow)
  const vibe = computeSurfaceVibeTokens(
    surface.surfaceVibe,
    surface.baseMode,
    surface.primaryColor,
    surface.accentColor
  );

  const bgPanel =
    vibe.panelBgAlpha < 1 ? rgba(bgPanelSolid, vibe.panelBgAlpha) : bgPanelSolid;
  const bgElevated =
    vibe.elevatedBgAlpha < 1 ? rgba(bgElevatedSolid, vibe.elevatedBgAlpha) : bgElevatedSolid;
  const bgGlass = rgba(bgPanelSolid, isLight ? 0.75 : 0.68);

  // 4. Contrast-verified Typography colors
  const minPrimaryTextContrast = isHighContrast ? 12.0 : 7.0;
  const minSecondaryTextContrast = isHighContrast ? 7.5 : 4.6;
  const minMutedTextContrast = isHighContrast ? 5.5 : 3.6;

  const rawTextPrimary = isLight ? neutralScale[950] : neutralScale[50];
  const rawTextSecondary = isLight ? neutralScale[700] : neutralScale[200];
  const rawTextMuted = isLight ? neutralScale[500] : neutralScale[400];

  const textPrimary = ensureContrastRatio(rawTextPrimary, bgPanelSolid, minPrimaryTextContrast, !isLight);
  const textSecondary = ensureContrastRatio(rawTextSecondary, bgPanelSolid, minSecondaryTextContrast, !isLight);
  const textMuted = ensureContrastRatio(rawTextMuted, bgPanelSolid, minMutedTextContrast, !isLight);

  // 5. Interactive states for Primary, Accent, and Neutral elements
  const primaryStates = computeInteractiveStates(
    surface.primaryColor,
    surface.baseMode,
    bgPanelSolid,
    neutralScale
  );
  const accentStates = computeInteractiveStates(
    surface.accentColor,
    surface.baseMode,
    bgPanelSolid,
    neutralScale
  );
  const neutralStates = computeInteractiveStates(
    isLight ? neutralScale[200] : neutralScale[700],
    surface.baseMode,
    bgPanelSolid,
    neutralScale
  );

  const textLink = ensureContrastRatio(
    surface.primaryColor,
    bgPanelSolid,
    isHighContrast ? 7.0 : 4.5,
    !isLight
  );

  const textTokens: TextContrastTokens = {
    textPrimary,
    textSecondary,
    textMuted,
    textOnPrimary: primaryStates.textOnBase,
    textOnAccent: accentStates.textOnBase,
    textInverse: isLight ? neutralScale[50] : neutralScale[950],
    textLink,
    appBgContrastRatio: getContrastRatio(textPrimary, bgAppSolid),
    panelBgContrastRatio: getContrastRatio(textPrimary, bgPanelSolid),
    primaryButtonContrastRatio: getContrastRatio(primaryStates.textOnBase, primaryStates.base),
    accentButtonContrastRatio: getContrastRatio(accentStates.textOnBase, accentStates.base),
  };

  // 6. Semantic status colors (Success, Warning, Danger, Info) contrast-checked against panel
  const statusSeeds = isLight
    ? { success: "#16a34a", warning: "#d97706", danger: "#dc2626", info: "#0284c7" }
    : { success: "#34d399", warning: "#fbbf24", danger: "#f87171", info: "#38bdf8" };

  const statusTextMin = isHighContrast ? 7.0 : 4.5;
  const textSuccess = ensureContrastRatio(statusSeeds.success, bgPanelSolid, statusTextMin, !isLight);
  const textWarning = ensureContrastRatio(statusSeeds.warning, bgPanelSolid, statusTextMin, !isLight);
  const textDanger = ensureContrastRatio(statusSeeds.danger, bgPanelSolid, statusTextMin, !isLight);
  const textInfo = ensureContrastRatio(statusSeeds.info, bgPanelSolid, statusTextMin, !isLight);

  // 7. Borders & Dividers
  const borderSubtle = isHighContrast
    ? neutralScale[300]
    : surface.surfaceVibe === "neon-border"
      ? rgba(surface.primaryColor, isLight ? 0.28 : 0.35)
      : isLight
        ? neutralScale[200]
        : neutralScale[800];

  const borderDefault = isHighContrast
    ? "#ffffff"
    : surface.surfaceVibe === "neon-border"
      ? rgba(surface.primaryColor, isLight ? 0.52 : 0.62)
      : isLight
        ? neutralScale[300]
        : neutralScale[700];

  const borderStrong = isHighContrast
    ? primaryStates.focusBorder
    : surface.surfaceVibe === "neon-border"
      ? surface.primaryColor
      : isLight
        ? neutralScale[400]
        : neutralScale[600];

  // 8. Corner Sharpness & Interface Density tokens
  const corners = computeCornerTokens(surface.cornerSharpness);
  const density = computeDensityTokens(surface.density);

  // 9. Hover & Selection surface states
  const bgHover = isHighContrast
    ? rgba(surface.primaryColor, 0.28)
    : isLight
      ? rgba(surface.primaryColor, 0.08)
      : rgba(surface.primaryColor, 0.14);

  const bgActive = isHighContrast
    ? rgba(surface.primaryColor, 0.4)
    : isLight
      ? rgba(surface.primaryColor, 0.15)
      : rgba(surface.primaryColor, 0.22);

  const bgSelected = isHighContrast
    ? rgba(surface.primaryColor, 0.35)
    : isLight
      ? rgba(surface.primaryColor, 0.12)
      : rgba(surface.primaryColor, 0.18);

  // 10. Code & Terminal tokens harmonized with theme
  const codeBg = isLight
    ? neutralScale[100]
    : isHighContrast
      ? "#000000"
      : isMidnight
        ? "#03050a"
        : neutralScale[950];
  const codeText = ensureContrastRatio(isLight ? neutralScale[900] : neutralScale[100], codeBg, 7.0, !isLight);
  const codeKeyword = ensureContrastRatio(accentStates.base, codeBg, 4.5, !isLight);
  const codeFunction = ensureContrastRatio(primaryStates.base, codeBg, 4.5, !isLight);
  const codeString = ensureContrastRatio(statusSeeds.success, codeBg, 4.5, !isLight);
  const codeNumber = ensureContrastRatio(statusSeeds.warning, codeBg, 4.5, !isLight);
  const codeComment = ensureContrastRatio(isLight ? neutralScale[500] : neutralScale[400], codeBg, 3.5, !isLight);

  // 11. Scrollbar tokens (≥3:1 thumb contrast against track per modern-web-guidance)
  const scrollbarTrack = isLight ? neutralScale[100] : neutralScale[900];
  const scrollbarThumbCandidate = isLight ? neutralScale[400] : neutralScale[600];
  const scrollbarThumb = ensureContrastRatio(scrollbarThumbCandidate, scrollbarTrack, 3.1, !isLight);
  const scrollbarThumbHover = ensureContrastRatio(primaryStates.base, scrollbarTrack, 3.5, !isLight);

  // 12. Assemble Granular CSS Custom Properties (Layer 3)
  const computedVariables: ThemeCssVariables = {
    // Surface Metadata & Native Browser UI Integration
    "--theme-color-scheme": colorScheme,
    "--primary-color": surface.primaryColor,
    "--accent-color": surface.accentColor,

    // 10-Step Neutral Shade Scale (50 to 950)
    "--shade-50": neutralScale[50],
    "--shade-100": neutralScale[100],
    "--shade-200": neutralScale[200],
    "--shade-300": neutralScale[300],
    "--shade-400": neutralScale[400],
    "--shade-500": neutralScale[500],
    "--shade-600": neutralScale[600],
    "--shade-700": neutralScale[700],
    "--shade-800": neutralScale[800],
    "--shade-900": neutralScale[900],
    "--shade-950": neutralScale[950],

    // 10-Step Primary Brand Scale
    "--primary-50": primaryScale[50],
    "--primary-100": primaryScale[100],
    "--primary-200": primaryScale[200],
    "--primary-300": primaryScale[300],
    "--primary-400": primaryScale[400],
    "--primary-500": primaryScale[500],
    "--primary-600": primaryScale[600],
    "--primary-700": primaryScale[700],
    "--primary-800": primaryScale[800],
    "--primary-900": primaryScale[900],
    "--primary-950": primaryScale[950],

    // 10-Step Accent Action Scale
    "--accent-50": accentScale[50],
    "--accent-100": accentScale[100],
    "--accent-200": accentScale[200],
    "--accent-300": accentScale[300],
    "--accent-400": accentScale[400],
    "--accent-500": accentScale[500],
    "--accent-600": accentScale[600],
    "--accent-700": accentScale[700],
    "--accent-800": accentScale[800],
    "--accent-900": accentScale[900],
    "--accent-950": accentScale[950],

    // Group 1: Backgrounds
    "--bg-app": bgAppSolid,
    "--bg-panel": bgPanel,
    "--bg-panel-solid": bgPanelSolid,
    "--bg-elevated": bgElevated,
    "--bg-elevated-solid": bgElevatedSolid,
    "--bg-surface": bgSurfaceSolid,
    "--bg-hover": bgHover,
    "--bg-active": bgActive,
    "--bg-selected": bgSelected,
    "--bg-glass": bgGlass,
    "--bg-overlay": isLight ? "rgba(15, 23, 42, 0.45)" : "rgba(2, 6, 23, 0.72)",

    // Group 2: Typography
    "--text-primary": textTokens.textPrimary,
    "--text-secondary": textTokens.textSecondary,
    "--text-muted": textTokens.textMuted,
    "--text-on-primary": textTokens.textOnPrimary,
    "--text-on-accent": textTokens.textOnAccent,
    "--text-inverse": textTokens.textInverse,
    "--text-link": textTokens.textLink,
    "--text-success": textSuccess,
    "--text-warning": textWarning,
    "--text-danger": textDanger,
    "--text-info": textInfo,
    "--font-sans": 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    "--font-mono": '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    "--font-size-xs": density.fontSizeXs,
    "--font-size-sm": density.fontSizeSm,
    "--font-size-base": density.fontSizeBase,
    "--font-size-lg": density.fontSizeLg,
    "--font-size-xl": density.fontSizeXl,
    "--line-height-base": density.lineHeightBase,

    // Group 3: Borders & Radii
    "--border-subtle": borderSubtle,
    "--border-default": borderDefault,
    "--border-strong": borderStrong,
    "--border-focus": primaryStates.focusBorder,
    "--border-glow": vibe.borderGlow,
    "--border-width": isHighContrast ? "1.5px" : "1px",
    "--radius-xs": corners.radiusXs,
    "--radius-sm": corners.radiusSm,
    "--radius-md": corners.radiusMd,
    "--radius-lg": corners.radiusLg,
    "--radius-xl": corners.radiusXl,
    "--radius-pill": corners.radiusPill,
    "--focus-ring": primaryStates.focusRing,
    "--focus-ring-offset": "2px",

    // Group 4: Buttons
    "--btn-primary-bg": primaryStates.base,
    "--btn-primary-hover": primaryStates.hover,
    "--btn-primary-active": primaryStates.active,
    "--btn-primary-text": primaryStates.textOnBase,
    "--btn-primary-border": surface.surfaceVibe === "neon-border" ? primaryScale[400] : primaryStates.base,
    "--btn-accent-bg": accentStates.base,
    "--btn-accent-hover": accentStates.hover,
    "--btn-accent-active": accentStates.active,
    "--btn-accent-text": accentStates.textOnBase,
    "--btn-secondary-bg": isLight ? neutralScale[100] : neutralScale[800],
    "--btn-secondary-hover": isLight ? neutralScale[200] : neutralScale[700],
    "--btn-secondary-active": isLight ? neutralScale[300] : neutralScale[600],
    "--btn-secondary-text": textTokens.textPrimary,
    "--btn-secondary-border": borderDefault,
    "--btn-disabled-bg": primaryStates.disabledBg,
    "--btn-disabled-text": primaryStates.disabledText,
    "--btn-height": density.controlHeightMd,
    "--btn-padding-x": density.paddingXMd,
    "--btn-radius": corners.radiusButton,

    // Group 5: Inputs
    "--input-bg": isLight ? "#ffffff" : isMidnight ? neutralScale[950] : neutralScale[900],
    "--input-hover-bg": isLight ? neutralScale[50] : neutralScale[800],
    "--input-focus-bg": isLight ? "#ffffff" : neutralScale[900],
    "--input-text": textTokens.textPrimary,
    "--input-placeholder": textTokens.textMuted,
    "--input-border": borderDefault,
    "--input-hover-border": borderStrong,
    "--input-focus-border": primaryStates.focusBorder,
    "--input-focus-ring": primaryStates.focusRing,
    "--input-disabled-bg": primaryStates.disabledBg,
    "--input-disabled-text": primaryStates.disabledText,
    "--input-height": density.controlHeightMd,
    "--input-padding-x": density.paddingXSm,
    "--input-radius": corners.radiusInput,

    // Group 6: Code/Terminal
    "--code-bg": codeBg,
    "--code-border": borderSubtle,
    "--code-text": codeText,
    "--code-keyword": codeKeyword,
    "--code-string": codeString,
    "--code-number": codeNumber,
    "--code-function": codeFunction,
    "--code-comment": codeComment,
    "--terminal-bg": isLight ? neutralScale[900] : "#05070d",
    "--terminal-text": isLight ? neutralScale[100] : "#e2e8f0",
    "--terminal-cursor": accentStates.base,

    // Group 7: Scrollbars
    "--scrollbar-track": scrollbarTrack,
    "--scrollbar-thumb": scrollbarThumb,
    "--scrollbar-thumb-hover": scrollbarThumbHover,
    "--scrollbar-width": surface.density === "compact" ? "6px" : "8px",
    "--scrollbar-width-keyword": "thin",

    // Group 8: Shadows & Glass Physics
    "--shadow-xs": vibe.shadowXs,
    "--shadow-sm": vibe.shadowSm,
    "--shadow-md": vibe.shadowMd,
    "--shadow-elevated": vibe.shadowElevated,
    "--shadow-modal": vibe.shadowModal,
    "--shadow-glow": vibe.shadowGlow,
    "--shadow-inset": vibe.shadowInset,
    "--glass-blur": vibe.glassBlur,
    "--glass-saturate": vibe.glassSaturate,
    "--surface-backdrop": vibe.surfaceBackdrop,

    // Density & Spacing Helpers
    "--density-control-sm": density.controlHeightSm,
    "--density-control-md": density.controlHeightMd,
    "--density-control-lg": density.controlHeightLg,
    "--density-pad-x-sm": density.paddingXSm,
    "--density-pad-x-md": density.paddingXMd,
    "--density-pad-x-lg": density.paddingXLg,
    "--density-pad-y-sm": density.paddingYSm,
    "--density-pad-y-md": density.paddingYMd,
    "--density-gap-xs": density.gapXs,
    "--density-gap-sm": density.gapSm,
    "--density-gap-md": density.gapMd,
    "--density-gap-lg": density.gapLg,
    "--density-gap-xl": density.gapXl,
    "--density-panel-padding": density.panelPadding,
    "--density-table-cell-padding": density.tableCellPadding,

    // Semantic Status Badges (Soft Fill + Border + Readable Text)
    "--status-success-bg": rgba(statusSeeds.success, isLight ? 0.14 : 0.18),
    "--status-success-border": rgba(statusSeeds.success, isLight ? 0.38 : 0.45),
    "--status-success-text": textSuccess,
    "--status-warning-bg": rgba(statusSeeds.warning, isLight ? 0.15 : 0.18),
    "--status-warning-border": rgba(statusSeeds.warning, isLight ? 0.4 : 0.45),
    "--status-warning-text": textWarning,
    "--status-danger-bg": rgba(statusSeeds.danger, isLight ? 0.14 : 0.18),
    "--status-danger-border": rgba(statusSeeds.danger, isLight ? 0.38 : 0.45),
    "--status-danger-text": textDanger,
    "--status-info-bg": rgba(statusSeeds.info, isLight ? 0.14 : 0.18),
    "--status-info-border": rgba(statusSeeds.info, isLight ? 0.38 : 0.45),
    "--status-info-text": textInfo,
  };

  // Sanitize and merge Layer 3 Deep Overrides from Pro Inspector
  const sanitizedOverrides: Record<string, string> = {};
  for (const [key, val] of Object.entries(rawOverrides || {})) {
    const trimmedKey = key.trim();
    const trimmedVal = String(val ?? "").trim();
    if (trimmedKey.startsWith("--") && trimmedVal.length > 0 && !/[{};<>]/.test(trimmedVal)) {
      sanitizedOverrides[trimmedKey] = trimmedVal;
    }
  }

  const variables: ThemeCssVariables = {
    ...computedVariables,
    ...(sanitizedOverrides as ThemeCssVariables),
  };

  const cssLines = Object.entries(variables).map(([k, v]) => `  ${k}: ${v};`);
  const cssText = `:root {\n  color-scheme: ${colorScheme};\n${cssLines.join("\n")}\n}`;

  return {
    surface,
    isDark,
    colorScheme,
    neutralScale,
    primaryScale,
    accentScale,
    text: textTokens,
    states: {
      primary: primaryStates,
      accent: accentStates,
      neutral: neutralStates,
    },
    vibe,
    corners,
    density,
    computedVariables,
    overrides: sanitizedOverrides,
    variables,
    cssText,
  };
}

/**
 * Applies all calculated CSS custom properties to the `:root` element (or a provided target element)
 * synchronously in real time with zero lag.
 */
export function applyThemeToRoot(
  systemOrSurface: CalculatedThemeSystem | ThemeSurfaceConfig,
  overrides: Record<string, string> = {},
  targetElement?: HTMLElement | null
): CalculatedThemeSystem {
  const system =
    "variables" in systemOrSurface
      ? systemOrSurface
      : calculateThemeSystem(systemOrSurface, overrides);

  const root =
    targetElement ??
    (typeof document !== "undefined" ? document.documentElement : null);

  if (root && root.style) {
    root.style.setProperty("color-scheme", system.colorScheme);
    root.dataset.baseMode = system.surface.baseMode;
    root.dataset.surfaceVibe = system.surface.surfaceVibe;
    root.dataset.density = system.surface.density;

    for (const [prop, value] of Object.entries(system.variables)) {
      root.style.setProperty(prop, value);
    }
  }

  return system;
}

export { SHADE_STEPS_10, SHADE_STEPS_ALL };
