/**
 * Standalone HTML Page Generator & Local Web Server for the Visual Theme Studio
 */

import { guardLocalRequest } from "../../localGuard";
import {
  calculateThemeSystem,
  DEFAULT_SURFACE_CONFIG,
  SHADE_STEPS_10,
  SHADE_STEPS_ALL,
  THEME_VARIABLE_CATALOG,
} from "./mathEngine";
import { THEME_STUDIO_PRESETS } from "./presets";
import { generateThemeStudioStyles } from "./studioUi";
import { INSPECTOR_CATEGORIES, type ThemeSurfaceConfig } from "./types";

export interface ThemeStudioPageOptions {
  title?: string;
  initialSurface?: Partial<ThemeSurfaceConfig>;
  initialOverrides?: Record<string, string>;
}

/**
 * Produces a complete, self-contained HTML document containing the 3-Layer Theme Engine,
 * the Theme Customizer Drawer (Quick Studio + Pro Inspector), Persistence (localStorage + JSON Export/Import),
 * and the Live Preview Playground.
 */
export function generateThemeStudioPageHtml(options: ThemeStudioPageOptions = {}): string {
  const title =
    options.title ?? "Visual Theme Studio Pro — 3-Layer High-Abstraction Theme Engine";
  const initialSystem = calculateThemeSystem(
    options.initialSurface ?? DEFAULT_SURFACE_CONFIG,
    options.initialOverrides ?? {}
  );

  const rootVarsInline = Object.entries(initialSystem.variables)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");

  const bootPayload = JSON.stringify({
    defaultSurface: initialSystem.surface,
    initialOverrides: initialSystem.overrides,
    presets: THEME_STUDIO_PRESETS,
    catalog: THEME_VARIABLE_CATALOG,
    categories: INSPECTOR_CATEGORIES,
    shadeSteps10: SHADE_STEPS_10,
    shadeStepsAll: SHADE_STEPS_ALL,
  })
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return `<!DOCTYPE html>
<html lang="en" data-base-mode="${initialSystem.surface.baseMode}" data-surface-vibe="${initialSystem.surface.surfaceVibe}" data-density="${initialSystem.surface.density}" style="color-scheme: ${initialSystem.colorScheme}; ${rootVarsInline}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style id="bun-rad-theme-studio-styles">
${generateThemeStudioStyles()}
  </style>
</head>
<body>
  <div id="themeStudioRoot"></div>
  <script id="themeStudioBootData" type="application/json">${bootPayload}</script>
  <script>
  (function() {
    var boot = JSON.parse(document.getElementById("themeStudioBootData").textContent);
    var STORAGE_SAVED = "bun_rad_theme_studio_saved_v1";
    var STORAGE_ACTIVE = "bun_rad_theme_studio_active_v1";

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function clampByte(n) { return clamp(Math.round(n), 0, 255); }

    function parseColorToRgb(input, fallback) {
      fallback = fallback || { r: 59, g: 130, b: 246 };
      if (!input || typeof input !== "string") return fallback;
      var s = input.trim();
      var hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
      if (hexMatch) {
        var hex = hexMatch[1];
        if (hex.length === 3) hex = hex.split("").map(function(c) { return c + c; }).join("");
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16)
        };
      }
      var rgbMatch = /^rgba?\\(\\s*(\\d{1,3})[\\s,]+(\\d{1,3})[\\s,]+(\\d{1,3})/i.exec(s);
      if (rgbMatch) {
        return { r: clampByte(Number(rgbMatch[1])), g: clampByte(Number(rgbMatch[2])), b: clampByte(Number(rgbMatch[3])) };
      }
      return fallback;
    }

    function rgbToHex(rgb) {
      function p(n) { return clampByte(n).toString(16).padStart(2, "0"); }
      return "#" + p(rgb.r) + p(rgb.g) + p(rgb.b);
    }

    function normalizeHex(input, fallback) {
      return rgbToHex(parseColorToRgb(input, parseColorToRgb(fallback || "#3b82f6")));
    }

    function rgbToHsl(rgb) {
      var r = clampByte(rgb.r) / 255, g = clampByte(rgb.g) / 255, b = clampByte(rgb.b) / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var l = (max + min) / 2, d = max - min;
      if (d === 0) return { h: 0, s: 0, l: Math.round(l * 1000) / 10 };
      var s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      var h = 0;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
      return { h: Math.round(h * 10) / 10, s: Math.round(s * 1000) / 10, l: Math.round(l * 1000) / 10 };
    }

    function hslToRgb(hsl) {
      var hue = ((hsl.h % 360) + 360) % 360;
      var sat = clamp(hsl.s, 0, 100) / 100;
      var light = clamp(hsl.l, 0, 100) / 100;
      var c = (1 - Math.abs(2 * light - 1)) * sat;
      var x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
      var m = light - c / 2;
      var rp = 0, gp = 0, bp = 0;
      if (hue < 60) { rp = c; gp = x; bp = 0; }
      else if (hue < 120) { rp = x; gp = c; bp = 0; }
      else if (hue < 180) { rp = 0; gp = c; bp = x; }
      else if (hue < 240) { rp = 0; gp = x; bp = c; }
      else if (hue < 300) { rp = x; gp = 0; bp = c; }
      else { rp = c; gp = 0; bp = x; }
      return { r: clampByte((rp + m) * 255), g: clampByte((gp + m) * 255), b: clampByte((bp + m) * 255) };
    }

    function hexToHsl(hex) { return rgbToHsl(parseColorToRgb(hex)); }
    function hslToHex(h, s, l) { return rgbToHex(hslToRgb({ h: h, s: s, l: l })); }
    function rgba(hex, alpha) {
      var c = parseColorToRgb(hex);
      var a = Math.round(clamp(alpha, 0, 1) * 1000) / 1000;
      return "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + a + ")";
    }
    function mixHexColors(ca, cb, t) {
      var a = parseColorToRgb(ca), b = parseColorToRgb(cb), r = clamp(t, 0, 1);
      return rgbToHex({ r: a.r + (b.r - a.r) * r, g: a.g + (b.g - a.g) * r, b: a.b + (b.b - a.b) * r });
    }
    function getRelativeLuminance(hex) {
      var rgb = parseColorToRgb(hex);
      function tr(ch) { var c = ch / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
      return 0.2126 * tr(rgb.r) + 0.7152 * tr(rgb.g) + 0.0722 * tr(rgb.b);
    }
    function getContrastRatio(fg, bg) {
      var l1 = getRelativeLuminance(fg), l2 = getRelativeLuminance(bg);
      return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
    }
    function ensureContrastRatio(fg, bg, minRatio, preferLight) {
      var nFg = normalizeHex(fg), nBg = normalizeHex(bg);
      if (getContrastRatio(nFg, nBg) >= minRatio) return nFg;
      var goLight = preferLight !== undefined ? preferLight : getRelativeLuminance(nBg) < 0.42;
      var p1 = goLight ? "#ffffff" : "#000000", p2 = goLight ? "#000000" : "#ffffff";
      for (var i = 1; i <= 25; i++) {
        var m1 = mixHexColors(nFg, p1, i / 25);
        if (getContrastRatio(m1, nBg) >= minRatio) return m1;
      }
      for (var j = 1; j <= 25; j++) {
        var m2 = mixHexColors(nFg, p2, j / 25);
        if (getContrastRatio(m2, nBg) >= minRatio) return m2;
      }
      return getContrastRatio("#ffffff", nBg) >= getContrastRatio("#000000", nBg) ? "#ffffff" : "#000000";
    }
    function pickReadableOnColor(solidBg, baseMode) {
      var minT = baseMode === "high-contrast" ? 7.0 : 4.5;
      var wc = getContrastRatio("#ffffff", solidBg), dc = getContrastRatio("#090d16", solidBg);
      if (wc >= minT && wc >= dc) return "#ffffff";
      if (dc >= minT) return "#090d16";
      return wc >= dc ? "#ffffff" : "#000000";
    }

    function generateNeutralShadeScale(primaryColor, baseMode) {
      var hsl = hexToHsl(primaryColor);
      var lMap = {
        light: { 50:98.5, 100:95.5, 200:90.5, 300:83, 400:68, 500:52, 600:39, 700:28, 800:18, 900:11, 950:6 },
        dark: { 50:96, 100:90, 200:80, 300:67, 400:53, 500:41, 600:30, 700:21.5, 800:15, 900:10.5, 950:7 },
        midnight: { 50:96.5, 100:91, 200:81, 300:68, 400:54, 500:40, 600:27, 700:17.5, 800:11, 900:6.2, 950:3.2 },
        "high-contrast": { 50:100, 100:95, 200:87, 300:76, 400:62, 500:48, 600:33, 700:20, 800:10, 900:4, 950:0.8 }
      };
      var satF = { light: 0.22, dark: 0.28, midnight: 0.42, "high-contrast": 0.12 };
      var baseSat = clamp(hsl.s * (satF[baseMode] || 0.28), 4, baseMode === "midnight" ? 38 : 26);
      var out = {};
      boot.shadeStepsAll.forEach(function(step) {
        var l = lMap[baseMode][step];
        var damp = (l > 92 || l < 5) ? 0.65 : 1.0;
        var s = (baseMode === "high-contrast" && (step === 50 || step === 950)) ? 0 : baseSat * damp;
        out[step] = hslToHex(hsl.h, s, l);
      });
      return out;
    }

    function generateBrandShadeScale(brandHex) {
      var hsl = hexToHsl(brandHex);
      var baseSat = clamp(hsl.s, 35, 96);
      var sL = { 50:96.5, 100:91.5, 200:83, 300:72, 400:61, 500:clamp(hsl.l,42,58), 600:44, 700:35, 800:26.5, 900:18.5, 950:11 };
      var out = {};
      boot.shadeStepsAll.forEach(function(step) {
        if (step === 500) out[step] = normalizeHex(brandHex);
        else out[step] = hslToHex(hsl.h, step <= 100 ? baseSat * 0.82 : step >= 900 ? baseSat * 0.88 : baseSat, sL[step]);
      });
      return out;
    }

    function calculateSystem(surface, overrides) {
      var isLight = surface.baseMode === "light";
      var isMidnight = surface.baseMode === "midnight";
      var isHC = surface.baseMode === "high-contrast";
      var colorScheme = isLight ? "light" : "dark";
      var nScale = generateNeutralShadeScale(surface.primaryColor, surface.baseMode);
      var pScale = generateBrandShadeScale(surface.primaryColor);
      var aScale = generateBrandShadeScale(surface.accentColor);

      var bgAppSolid = isLight ? nScale[50] : isHC ? "#000000" : isMidnight ? nScale[950] : nScale[900];
      var bgPanelSolid = isLight ? "#ffffff" : isHC ? "#07090e" : isMidnight ? nScale[900] : nScale[800];
      var bgElevatedSolid = isLight ? "#ffffff" : isHC ? "#0f131d" : isMidnight ? nScale[800] : nScale[700];
      var bgSurfaceSolid = isLight ? nScale[100] : isHC ? "#111622" : isMidnight ? nScale[900] : nScale[800];

      var shadowInk = isLight ? "15, 23, 42" : "0, 0, 0";
      var pRgb = parseColorToRgb(surface.primaryColor);
      var vibe = {};
      if (surface.surfaceVibe === "flat") {
        vibe = {
          shadowXs: "none",
          shadowSm: isHC ? "none" : "0 1px 2px rgba(" + shadowInk + ", " + (isLight ? 0.04 : 0.18) + ")",
          shadowMd: isHC ? "none" : "0 2px 4px rgba(" + shadowInk + ", " + (isLight ? 0.06 : 0.24) + ")",
          shadowElevated: isHC ? "0 0 0 2px " + surface.primaryColor : "0 4px 12px rgba(" + shadowInk + ", " + (isLight ? 0.08 : 0.32) + ")",
          shadowModal: "0 16px 36px rgba(" + shadowInk + ", " + (isLight ? 0.14 : 0.55) + ")",
          shadowGlow: "0 0 0 transparent",
          shadowInset: "none",
          glassBlur: "0px",
          glassSaturate: "100%",
          surfaceBackdrop: "none",
          borderGlow: "transparent",
          panelAlpha: 1,
          elevatedAlpha: 1
        };
      } else if (surface.surfaceVibe === "frosted-glass") {
        var blurPx = isMidnight ? "22px" : "16px";
        var satPct = isLight ? "160%" : "180%";
        var rimA = isLight ? 0.65 : 0.14;
        vibe = {
          shadowXs: "0 1px 2px rgba(" + shadowInk + ", " + (isLight ? 0.05 : 0.25) + ")",
          shadowSm: "0 4px 12px rgba(" + shadowInk + ", " + (isLight ? 0.07 : 0.32) + "), inset 0 1px 0 rgba(255,255,255," + rimA + ")",
          shadowMd: "0 8px 24px rgba(" + shadowInk + ", " + (isLight ? 0.1 : 0.4) + "), inset 0 1px 0 rgba(255,255,255," + rimA + ")",
          shadowElevated: "0 16px 40px -4px rgba(" + shadowInk + ", " + (isLight ? 0.14 : 0.52) + "), inset 0 1px 0 rgba(255,255,255," + rimA + ")",
          shadowModal: "0 24px 64px -8px rgba(" + shadowInk + ", " + (isLight ? 0.22 : 0.68) + "), inset 0 1px 0 rgba(255,255,255," + rimA + ")",
          shadowGlow: "0 0 24px rgba(" + pRgb.r + "," + pRgb.g + "," + pRgb.b + "," + (isLight ? 0.18 : 0.28) + ")",
          shadowInset: "inset 0 1px 0 rgba(255,255,255," + rimA + ")",
          glassBlur: blurPx,
          glassSaturate: satPct,
          surfaceBackdrop: "blur(" + blurPx + ") saturate(" + satPct + ")",
          borderGlow: rgba(surface.primaryColor, isLight ? 0.28 : 0.38),
          panelAlpha: isHC ? 0.94 : isLight ? 0.76 : 0.72,
          elevatedAlpha: isHC ? 0.96 : isLight ? 0.86 : 0.82
        };
      } else if (surface.surfaceVibe === "matte") {
        var topR = isLight ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.04)";
        vibe = {
          shadowXs: "0 1px 2px rgba(" + shadowInk + ", " + (isLight ? 0.05 : 0.22) + ")",
          shadowSm: "0 2px 5px rgba(" + shadowInk + ", " + (isLight ? 0.07 : 0.28) + "), inset 0 1px 0 " + topR,
          shadowMd: "0 6px 14px -2px rgba(" + shadowInk + ", " + (isLight ? 0.09 : 0.36) + "), inset 0 1px 0 " + topR,
          shadowElevated: "0 12px 26px -4px rgba(" + shadowInk + ", " + (isLight ? 0.12 : 0.45) + "), inset 0 1px 0 " + topR,
          shadowModal: "0 22px 48px -6px rgba(" + shadowInk + ", " + (isLight ? 0.18 : 0.6) + ")",
          shadowGlow: "0 0 0 transparent",
          shadowInset: "inset 0 1px 2px rgba(" + shadowInk + ", " + (isLight ? 0.06 : 0.28) + ")",
          glassBlur: "0px",
          glassSaturate: "100%",
          surfaceBackdrop: "none",
          borderGlow: "transparent",
          panelAlpha: 1,
          elevatedAlpha: 1
        };
      } else {
        var pGS = rgba(surface.primaryColor, isLight ? 0.42 : 0.58);
        var pGSoft = rgba(surface.primaryColor, isLight ? 0.22 : 0.32);
        var aGSoft = rgba(surface.accentColor, isLight ? 0.18 : 0.28);
        vibe = {
          shadowXs: "0 0 0 1px " + pGSoft,
          shadowSm: "0 0 0 1px " + pGSoft + ", 0 0 12px " + pGSoft,
          shadowMd: "0 0 0 1px " + pGS + ", 0 0 18px " + pGSoft,
          shadowElevated: "0 0 0 1px " + pGS + ", 0 0 24px " + pGSoft + ", 0 0 42px " + aGSoft,
          shadowModal: "0 0 0 1.5px " + surface.primaryColor + ", 0 0 36px " + pGS + ", 0 0 64px " + aGSoft,
          shadowGlow: "0 0 0 1px " + pGS + ", 0 0 18px " + pGS + ", 0 0 34px " + aGSoft,
          shadowInset: "inset 0 0 12px " + rgba(surface.primaryColor, isLight ? 0.08 : 0.14),
          glassBlur: "10px",
          glassSaturate: "140%",
          surfaceBackdrop: "blur(10px) saturate(140%)",
          borderGlow: surface.primaryColor,
          panelAlpha: isLight ? 0.92 : 0.88,
          elevatedAlpha: isLight ? 0.96 : 0.92
        };
      }

      var textPrimary = ensureContrastRatio(isLight ? nScale[950] : nScale[50], bgPanelSolid, isHC ? 12 : 7, !isLight);
      var textSecondary = ensureContrastRatio(isLight ? nScale[700] : nScale[200], bgPanelSolid, isHC ? 7.5 : 4.6, !isLight);
      var textMuted = ensureContrastRatio(isLight ? nScale[500] : nScale[400], bgPanelSolid, isHC ? 5.5 : 3.6, !isLight);

      function interactive(baseHex) {
        var safe = ensureContrastRatio(baseHex, bgPanelSolid, isHC ? 4.5 : 2.6, !isLight);
        var hsl = hexToHsl(safe);
        var hover = hslToHex(hsl.h, clamp(hsl.s + 4, 0, 100), isLight ? clamp(hsl.l - 6, 12, 88) : clamp(hsl.l + 7, 18, 92));
        var active = hslToHex(hsl.h, clamp(hsl.s + 6, 0, 100), isLight ? clamp(hsl.l - 12, 8, 82) : clamp(hsl.l - 7, 10, 86));
        var focusBorder = isHC ? ensureContrastRatio(safe, bgPanelSolid, 7, true) : hslToHex(hsl.h, clamp(hsl.s + 10, 50, 100), isLight ? clamp(hsl.l, 35, 55) : clamp(hsl.l + 10, 55, 80));
        return {
          base: safe,
          hover: hover,
          active: active,
          focusBorder: focusBorder,
          focusRing: "0 0 0 3px " + rgba(focusBorder, isHC ? 0.65 : isLight ? 0.28 : 0.38),
          disabledBg: isLight ? nScale[200] : nScale[800],
          disabledText: isLight ? nScale[400] : nScale[600],
          textOnBase: pickReadableOnColor(safe, surface.baseMode)
        };
      }

      var pState = interactive(surface.primaryColor);
      var aState = interactive(surface.accentColor);

      var c = clamp(Math.round(surface.cornerSharpness), 0, 24);
      var corners = c === 0 ? {
        xs:"0px", sm:"0px", md:"0px", lg:"0px", xl:"0px", pill:"0px", btn:"0px", input:"0px"
      } : {
        xs: Math.max(1, Math.round(c * 0.35)) + "px",
        sm: Math.max(2, Math.round(c * 0.65)) + "px",
        md: c + "px",
        lg: Math.round(c * 1.35) + "px",
        xl: Math.round(c * 1.75) + "px",
        pill: "9999px",
        btn: c >= 22 ? "9999px" : c + "px",
        input: c >= 22 ? "9999px" : Math.max(2, Math.round(c * 0.65)) + "px"
      };

      var densMap = {
        compact: { hSm:"26px", hMd:"30px", hLg:"36px", pxSm:"8px", pxMd:"10px", pxLg:"14px", pySm:"4px", pyMd:"6px", gXs:"4px", gSm:"6px", gMd:"10px", gLg:"14px", gXl:"20px", pad:"12px", cell:"6px 10px", fXs:"11px", fSm:"12px", fBase:"13px", fLg:"15px", fXl:"18px", lh:"1.4" },
        comfortable: { hSm:"30px", hMd:"36px", hLg:"42px", pxSm:"10px", pxMd:"14px", pxLg:"18px", pySm:"6px", pyMd:"8px", gXs:"6px", gSm:"8px", gMd:"14px", gLg:"20px", gXl:"28px", pad:"18px", cell:"10px 14px", fXs:"11.5px", fSm:"13px", fBase:"14px", fLg:"16px", fXl:"20px", lh:"1.5" },
        spacious: { hSm:"34px", hMd:"42px", hLg:"50px", pxSm:"14px", pxMd:"18px", pxLg:"24px", pySm:"8px", pyMd:"12px", gXs:"8px", gSm:"12px", gMd:"18px", gLg:"26px", gXl:"36px", pad:"24px", cell:"14px 18px", fXs:"12px", fSm:"13.5px", fBase:"15px", fLg:"18px", fXl:"22px", lh:"1.6" }
      };
      var d = densMap[surface.density] || densMap.comfortable;

      var seeds = isLight ? { s:"#16a34a", w:"#d97706", d:"#dc2626", i:"#0284c7" } : { s:"#34d399", w:"#fbbf24", d:"#f87171", i:"#38bdf8" };
      var stMin = isHC ? 7 : 4.5;
      var tSucc = ensureContrastRatio(seeds.s, bgPanelSolid, stMin, !isLight);
      var tWarn = ensureContrastRatio(seeds.w, bgPanelSolid, stMin, !isLight);
      var tDang = ensureContrastRatio(seeds.d, bgPanelSolid, stMin, !isLight);
      var tInfo = ensureContrastRatio(seeds.i, bgPanelSolid, stMin, !isLight);

      var borderSubtle = isHC ? nScale[300] : surface.surfaceVibe === "neon-border" ? rgba(surface.primaryColor, isLight ? 0.28 : 0.35) : isLight ? nScale[200] : nScale[800];
      var borderDefault = isHC ? "#ffffff" : surface.surfaceVibe === "neon-border" ? rgba(surface.primaryColor, isLight ? 0.52 : 0.62) : isLight ? nScale[300] : nScale[700];
      var borderStrong = isHC ? pState.focusBorder : surface.surfaceVibe === "neon-border" ? surface.primaryColor : isLight ? nScale[400] : nScale[600];

      var codeBg = isLight ? nScale[100] : isHC ? "#000000" : isMidnight ? "#03050a" : nScale[950];
      var sbTrack = isLight ? nScale[100] : nScale[900];
      var sbThumb = ensureContrastRatio(isLight ? nScale[400] : nScale[600], sbTrack, 3.1, !isLight);

      var vars = {
        "--theme-color-scheme": colorScheme,
        "--primary-color": surface.primaryColor,
        "--accent-color": surface.accentColor,
        "--bg-app": bgAppSolid,
        "--bg-panel": vibe.panelAlpha < 1 ? rgba(bgPanelSolid, vibe.panelAlpha) : bgPanelSolid,
        "--bg-elevated": vibe.elevatedAlpha < 1 ? rgba(bgElevatedSolid, vibe.elevatedAlpha) : bgElevatedSolid,
        "--bg-surface": bgSurfaceSolid,
        "--bg-hover": rgba(surface.primaryColor, isHC ? 0.28 : isLight ? 0.08 : 0.14),
        "--bg-active": rgba(surface.primaryColor, isHC ? 0.4 : isLight ? 0.15 : 0.22),
        "--bg-selected": rgba(surface.primaryColor, isHC ? 0.35 : isLight ? 0.12 : 0.18),
        "--bg-glass": rgba(bgPanelSolid, isLight ? 0.75 : 0.68),
        "--bg-overlay": isLight ? "rgba(15, 23, 42, 0.45)" : "rgba(2, 6, 23, 0.72)",
        "--text-primary": textPrimary,
        "--text-secondary": textSecondary,
        "--text-muted": textMuted,
        "--text-on-primary": pState.textOnBase,
        "--text-on-accent": aState.textOnBase,
        "--text-link": ensureContrastRatio(surface.primaryColor, bgPanelSolid, stMin, !isLight),
        "--text-success": tSucc,
        "--text-warning": tWarn,
        "--text-danger": tDang,
        "--text-info": tInfo,
        "--font-sans": 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        "--font-mono": '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        "--font-size-xs": d.fXs,
        "--font-size-sm": d.fSm,
        "--font-size-base": d.fBase,
        "--font-size-lg": d.fLg,
        "--font-size-xl": d.fXl,
        "--line-height-base": d.lh,
        "--border-subtle": borderSubtle,
        "--border-default": borderDefault,
        "--border-strong": borderStrong,
        "--border-focus": pState.focusBorder,
        "--border-glow": vibe.borderGlow,
        "--border-width": isHC ? "1.5px" : "1px",
        "--radius-xs": corners.xs,
        "--radius-sm": corners.sm,
        "--radius-md": corners.md,
        "--radius-lg": corners.lg,
        "--radius-xl": corners.xl,
        "--radius-pill": corners.pill,
        "--focus-ring": pState.focusRing,
        "--btn-primary-bg": pState.base,
        "--btn-primary-hover": pState.hover,
        "--btn-primary-active": pState.active,
        "--btn-primary-text": pState.textOnBase,
        "--btn-primary-border": surface.surfaceVibe === "neon-border" ? pScale[400] : pState.base,
        "--btn-accent-bg": aState.base,
        "--btn-accent-hover": aState.hover,
        "--btn-accent-active": aState.active,
        "--btn-accent-text": aState.textOnBase,
        "--btn-secondary-bg": isLight ? nScale[100] : nScale[800],
        "--btn-secondary-hover": isLight ? nScale[200] : nScale[700],
        "--btn-secondary-active": isLight ? nScale[300] : nScale[600],
        "--btn-secondary-text": textPrimary,
        "--btn-secondary-border": borderDefault,
        "--btn-disabled-bg": pState.disabledBg,
        "--btn-disabled-text": pState.disabledText,
        "--btn-height": d.hMd,
        "--btn-padding-x": d.pxMd,
        "--btn-radius": corners.btn,
        "--input-bg": isLight ? "#ffffff" : isMidnight ? nScale[950] : nScale[900],
        "--input-hover-bg": isLight ? nScale[50] : nScale[800],
        "--input-focus-bg": isLight ? "#ffffff" : nScale[900],
        "--input-text": textPrimary,
        "--input-placeholder": textMuted,
        "--input-border": borderDefault,
        "--input-hover-border": borderStrong,
        "--input-focus-border": pState.focusBorder,
        "--input-focus-ring": pState.focusRing,
        "--input-disabled-bg": pState.disabledBg,
        "--input-disabled-text": pState.disabledText,
        "--input-height": d.hMd,
        "--input-padding-x": d.pxSm,
        "--input-radius": corners.input,
        "--code-bg": codeBg,
        "--code-border": borderSubtle,
        "--code-text": ensureContrastRatio(isLight ? nScale[900] : nScale[100], codeBg, 7, !isLight),
        "--code-keyword": ensureContrastRatio(aState.base, codeBg, 4.5, !isLight),
        "--code-string": ensureContrastRatio(seeds.s, codeBg, 4.5, !isLight),
        "--code-number": ensureContrastRatio(seeds.w, codeBg, 4.5, !isLight),
        "--code-function": ensureContrastRatio(pState.base, codeBg, 4.5, !isLight),
        "--code-comment": ensureContrastRatio(isLight ? nScale[500] : nScale[400], codeBg, 3.5, !isLight),
        "--terminal-bg": isLight ? nScale[900] : "#05070d",
        "--terminal-text": isLight ? nScale[100] : "#e2e8f0",
        "--terminal-cursor": aState.base,
        "--scrollbar-track": sbTrack,
        "--scrollbar-thumb": sbThumb,
        "--scrollbar-thumb-hover": ensureContrastRatio(pState.base, sbTrack, 3.5, !isLight),
        "--scrollbar-width": surface.density === "compact" ? "6px" : "8px",
        "--scrollbar-width-keyword": "thin",
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
        "--density-control-sm": d.hSm,
        "--density-control-md": d.hMd,
        "--density-control-lg": d.hLg,
        "--density-pad-x-sm": d.pxSm,
        "--density-pad-x-md": d.pxMd,
        "--density-pad-x-lg": d.pxLg,
        "--density-pad-y-sm": d.pySm,
        "--density-pad-y-md": d.pyMd,
        "--density-gap-xs": d.gXs,
        "--density-gap-sm": d.gSm,
        "--density-gap-md": d.gMd,
        "--density-gap-lg": d.gLg,
        "--density-gap-xl": d.gXl,
        "--density-panel-padding": d.pad,
        "--density-table-cell-padding": d.cell,
        "--status-success-bg": rgba(seeds.s, isLight ? 0.14 : 0.18),
        "--status-success-border": rgba(seeds.s, isLight ? 0.38 : 0.45),
        "--status-success-text": tSucc,
        "--status-warning-bg": rgba(seeds.w, isLight ? 0.15 : 0.18),
        "--status-warning-border": rgba(seeds.w, isLight ? 0.4 : 0.45),
        "--status-warning-text": tWarn,
        "--status-danger-bg": rgba(seeds.d, isLight ? 0.14 : 0.18),
        "--status-danger-border": rgba(seeds.d, isLight ? 0.38 : 0.45),
        "--status-danger-text": tDang,
        "--status-info-bg": rgba(seeds.i, isLight ? 0.14 : 0.18),
        "--status-info-border": rgba(seeds.i, isLight ? 0.38 : 0.45),
        "--status-info-text": tInfo
      };

      boot.shadeStepsAll.forEach(function(st) {
        vars["--shade-" + st] = nScale[st];
        vars["--primary-" + st] = pScale[st];
        vars["--accent-" + st] = aScale[st];
      });

      Object.keys(overrides || {}).forEach(function(k) {
        if (k.indexOf("--") === 0 && overrides[k]) vars[k] = overrides[k];
      });

      var root = document.documentElement;
      root.style.setProperty("color-scheme", colorScheme);
      root.dataset.baseMode = surface.baseMode;
      root.dataset.surfaceVibe = surface.surfaceVibe;
      root.dataset.density = surface.density;
      Object.keys(vars).forEach(function(k) { root.style.setProperty(k, vars[k]); });

      return {
        surface: surface,
        colorScheme: colorScheme,
        neutralScale: nScale,
        variables: vars,
        panelContrast: getContrastRatio(textPrimary, bgPanelSolid),
        primaryBtnContrast: getContrastRatio(pState.textOnBase, pState.base),
        accentBtnContrast: getContrastRatio(aState.textOnBase, aState.base)
      };
    }

    // State initialization
    var surface = Object.assign({}, boot.defaultSurface);
    var overrides = Object.assign({}, boot.initialOverrides || {});
    var currentName = "Obsidian Glass";
    var activePresetId = "obsidian-glass";
    var expandedCats = { Backgrounds: true, Typography: true };
    var inspectorFilter = "";

    try {
      var savedActive = localStorage.getItem(STORAGE_ACTIVE);
      if (savedActive) {
        var parsed = JSON.parse(savedActive);
        if (parsed && parsed.surface) {
          surface = Object.assign({}, surface, parsed.surface);
          overrides = Object.assign({}, parsed.overrides || {});
          currentName = parsed.name || currentName;
          activePresetId = parsed.activePresetId || null;
        }
      }
    } catch (e) {}

    var rootEl = document.getElementById("themeStudioRoot");
    rootEl.innerHTML = ${JSON.stringify(getStudioBodyTemplate())};

    var system = calculateSystem(surface, overrides);

    function loadSavedList() {
      try {
        var raw = localStorage.getItem(STORAGE_SAVED);
        return raw ? JSON.parse(raw) : [];
      } catch (e) { return []; }
    }

    function saveList(list) {
      try { localStorage.setItem(STORAGE_SAVED, JSON.stringify(list)); } catch (e) {}
    }

    function renderPresets() {
      var g = document.getElementById("tsPresetGrid");
      g.innerHTML = boot.presets.map(function(p) {
        var act = activePresetId === p.id ? "true" : "false";
        return '<button type="button" class="ts-preset-card" data-preset-id="' + p.id + '" data-active="' + act + '" title="' + p.tagline + '">' +
          '<div style="display:flex;width:100%;align-items:center;justify-content:space-between;">' +
            '<strong style="font-size:var(--font-size-xs);">' + p.name + '</strong>' +
            '<div class="ts-preset-dots">' +
              '<span class="ts-preset-dot" style="background:' + p.surface.primaryColor + ';"></span>' +
              '<span class="ts-preset-dot" style="background:' + p.surface.accentColor + ';"></span>' +
            '</div>' +
          '</div>' +
          '<span style="font-size:10.5px;color:var(--text-muted);">' + p.badge + '</span>' +
        '</button>';
      }).join("");
    }

    function renderShades() {
      var sg = document.getElementById("tsShadeScaleGrid");
      sg.innerHTML = boot.shadeSteps10.map(function(step) {
        var hex = system.neutralScale[step];
        var fg = step <= 400 ? system.neutralScale[950] : system.neutralScale[50];
        return '<div class="ts-shade-swatch" data-shade-step="' + step + '" style="background:' + hex + ';color:' + fg + ';"><strong>' + step + '</strong><span>' + hex + '</span></div>';
      }).join("");
    }

    function renderInspector() {
      var tree = document.getElementById("tsInspectorAccordionTree");
      var q = inspectorFilter.trim().toLowerCase();
      tree.innerHTML = boot.categories.map(function(cat) {
        var items = boot.catalog.filter(function(d) {
          return d.category === cat && (!q || d.name.toLowerCase().indexOf(q) >= 0 || d.label.toLowerCase().indexOf(q) >= 0);
        });
        if (!items.length) return "";
        var open = q.length > 0 || !!expandedCats[cat];
        var ovCount = items.filter(function(d) { return Object.prototype.hasOwnProperty.call(overrides, d.name); }).length;
        var rows = items.map(function(d) {
          var val = system.variables[d.name] || "";
          var isOv = Object.prototype.hasOwnProperty.call(overrides, d.name);
          var hexVal = /^#[0-9a-f]{6}$/i.test(val.trim()) ? val.trim() : normalizeHex(val, surface.primaryColor);
          return '<div class="ts-var-row" data-var-name="' + d.name + '">' +
            '<div class="ts-var-header">' +
              '<div><div style="font-size:var(--font-size-xs);font-weight:600;">' + d.label + '</div><code class="ts-var-code">' + d.name + '</code></div>' +
              '<div style="display:flex;align-items:center;gap:4px;">' +
                (isOv ? '<span class="ts-badge ts-badge-warning" style="padding:1px 6px;font-size:10px;">Overridden</span>' : '') +
                '<button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" data-reset-var="' + d.name + '" ' + (isOv ? '' : 'disabled') + '>↺</button>' +
              '</div>' +
            '</div>' +
            '<div class="ts-var-controls">' +
              (d.kind === "color" ? '<input type="color" class="ts-color-swatch-input" style="width:34px;height:30px;" data-var-color="' + d.name + '" value="' + hexVal + '" aria-label="' + d.label + ' color picker" />' : '') +
              '<input type="text" class="ts-input" style="height:30px;font-family:var(--font-mono);font-size:11.5px;" data-var-input="' + d.name + '" value="' + String(val).replace(/"/g, "&quot;") + '" aria-label="' + d.name + ' value" />' +
            '</div>' +
          '</div>';
        }).join("");
        return '<div class="ts-accordion-item" data-inspector-category="' + cat + '">' +
          '<button type="button" class="ts-accordion-summary" data-toggle-category="' + cat + '" aria-expanded="' + (open ? "true" : "false") + '">' +
            '<span>' + (open ? "▾ " : "▸ ") + cat + ' <span style="color:var(--text-muted);font-weight:400;">(' + items.length + ')</span></span>' +
            (ovCount > 0 ? '<span class="ts-badge ts-badge-warning">' + ovCount + ' custom</span>' : '<span class="ts-badge ts-badge-neutral">Auto</span>') +
          '</button>' +
          '<div class="ts-accordion-body" ' + (open ? '' : 'hidden') + '>' + rows + '</div>' +
        '</div>';
      }).join("");
    }

    function renderSavedDropdown() {
      var sel = document.getElementById("ctrlSavedThemesSelect");
      var list = loadSavedList();
      sel.innerHTML = '<option value="">Saved Themes (' + list.length + ')...</option>' +
        list.map(function(t) { return '<option value="' + t.id + '">' + t.name + ' (' + t.surface.baseMode + ' • ' + t.surface.surfaceVibe + ')</option>'; }).join("");
    }

    function syncAll(rebuildInspector) {
      system = calculateSystem(surface, overrides);
      try {
        localStorage.setItem(STORAGE_ACTIVE, JSON.stringify({ name: currentName, activePresetId: activePresetId, surface: surface, overrides: overrides }));
      } catch (e) {}

      document.getElementById("lblBaseModeVal").textContent = surface.baseMode;
      document.getElementById("lblPrimaryColorVal").textContent = surface.primaryColor;
      document.getElementById("lblAccentColorVal").textContent = surface.accentColor;
      document.getElementById("lblSurfaceVibeVal").textContent = surface.surfaceVibe;
      document.getElementById("lblCornerSharpnessVal").textContent = surface.cornerSharpness + "px";
      document.getElementById("lblDensityVal").textContent = surface.density;

      document.getElementById("ctrlPrimaryColorPicker").value = surface.primaryColor;
      document.getElementById("ctrlPrimaryColorHex").value = surface.primaryColor;
      document.getElementById("ctrlAccentColorPicker").value = surface.accentColor;
      document.getElementById("ctrlAccentColorHex").value = surface.accentColor;
      document.getElementById("ctrlCornerSharpness").value = String(surface.cornerSharpness);

      document.querySelectorAll("[data-base-mode]").forEach(function(b) { b.dataset.active = b.dataset.baseMode === surface.baseMode ? "true" : "false"; });
      document.querySelectorAll("[data-surface-vibe]").forEach(function(b) { b.dataset.active = b.dataset.surfaceVibe === surface.surfaceVibe ? "true" : "false"; });
      document.querySelectorAll("[data-density]").forEach(function(b) { b.dataset.active = b.dataset.density === surface.density ? "true" : "false"; });

      var ovLen = Object.keys(overrides).length;
      document.getElementById("tsContrastBadge").textContent = "Contrast: " + system.panelContrast + ":1 (" + (system.panelContrast >= 7 ? "AAA" : "AA") + ")";
      document.getElementById("tsOverrideCountBadge").textContent = ovLen + " Override" + (ovLen === 1 ? "" : "s");
      document.getElementById("tsBtnContrastReadout").textContent = "Primary " + system.primaryBtnContrast + ":1 • Accent " + system.accentBtnContrast + ":1";
      document.getElementById("tsVibeReadout").textContent = surface.surfaceVibe + " • " + surface.cornerSharpness + "px • " + surface.density;
      document.getElementById("tsBaseModeBadge").textContent = surface.baseMode;
      document.getElementById("tsActiveThemeLabel").textContent = "Active: " + currentName;

      var keys = ["--bg-app","--bg-panel","--bg-hover","--border-subtle","--border-focus","--text-primary","--text-muted","--radius-sm","--radius-md","--shadow-elevated"];
      document.getElementById("previewCodeBlock").innerHTML =
        '<span class="ts-tok-cmt">/* Auto-generated by Smart Math Engine (' + Object.keys(system.variables).length + ' total tokens) */</span>\\n' +
        '<span class="ts-tok-kw">:root</span> {\\n' +
        keys.map(function(k) { return '  <span class="ts-tok-fn">' + k + '</span>: <span class="ts-tok-str">' + system.variables[k] + '</span>;'; }).join("\\n") +
        '\\n}';

      renderPresets();
      renderShades();
      if (rebuildInspector !== false) renderInspector();
      renderSavedDropdown();
    }

    document.addEventListener("click", function(e) {
      var btn = e.target.closest("button, tr");
      if (!btn) return;
      if (btn.dataset.presetId) {
        var found = boot.presets.find(function(p) { return p.id === btn.dataset.presetId; });
        if (found) {
          activePresetId = found.id;
          currentName = found.name;
          surface = Object.assign({}, found.surface);
          overrides = Object.assign({}, found.overrides || {});
          document.getElementById("ctrlSaveThemeName").value = currentName;
          syncAll(true);
        }
        return;
      }
      if (btn.dataset.baseMode) { activePresetId = null; surface.baseMode = btn.dataset.baseMode; syncAll(true); return; }
      if (btn.dataset.surfaceVibe) { activePresetId = null; surface.surfaceVibe = btn.dataset.surfaceVibe; syncAll(true); return; }
      if (btn.dataset.density) { activePresetId = null; surface.density = btn.dataset.density; syncAll(true); return; }
      if (btn.dataset.studioTab) {
        var isQ = btn.dataset.studioTab === "quick";
        document.getElementById("tabBtnQuickStudio").setAttribute("aria-selected", isQ ? "true" : "false");
        document.getElementById("tabBtnProInspector").setAttribute("aria-selected", !isQ ? "true" : "false");
        document.getElementById("tabPanelQuickStudio").hidden = !isQ;
        document.getElementById("tabPanelProInspector").hidden = isQ;
        if (!isQ) renderInspector();
        return;
      }
      if (btn.dataset.pgTab) {
        var tab = btn.dataset.pgTab;
        document.querySelectorAll("[data-pg-tab]").forEach(function(b) { b.setAttribute("aria-selected", b.dataset.pgTab === tab ? "true" : "false"); });
        var all = tab === "components";
        document.getElementById("pgSectionComponents").hidden = !all;
        document.getElementById("pgSectionData").hidden = !all && tab !== "data";
        document.getElementById("pgSectionCode").hidden = !all && tab !== "code";
        return;
      }
      if (btn.dataset.toggleCategory) {
        var c = btn.dataset.toggleCategory;
        expandedCats[c] = !expandedCats[c];
        renderInspector();
        return;
      }
      if (btn.dataset.resetVar) {
        delete overrides[btn.dataset.resetVar];
        syncAll(true);
        return;
      }
      if (btn.tagName === "TR" && btn.closest("#previewDataTable tbody")) {
        document.querySelectorAll("#previewDataTable tbody tr").forEach(function(r) { r.dataset.selected = r === btn ? "true" : "false"; });
      }
    });

    document.getElementById("ctrlPrimaryColorPicker").addEventListener("input", function(e) { activePresetId = null; surface.primaryColor = normalizeHex(e.target.value); syncAll(true); });
    document.getElementById("ctrlPrimaryColorHex").addEventListener("change", function(e) { activePresetId = null; surface.primaryColor = normalizeHex(e.target.value); syncAll(true); });
    document.getElementById("ctrlAccentColorPicker").addEventListener("input", function(e) { activePresetId = null; surface.accentColor = normalizeHex(e.target.value); syncAll(true); });
    document.getElementById("ctrlAccentColorHex").addEventListener("change", function(e) { activePresetId = null; surface.accentColor = normalizeHex(e.target.value); syncAll(true); });
    document.getElementById("ctrlCornerSharpness").addEventListener("input", function(e) { activePresetId = null; surface.cornerSharpness = Number(e.target.value); syncAll(true); });
    document.getElementById("ctrlInspectorSearch").addEventListener("input", function(e) { inspectorFilter = e.target.value; renderInspector(); });

    document.getElementById("tsInspectorAccordionTree").addEventListener("input", function(e) {
      var t = e.target;
      if (t.dataset.varColor) {
        overrides[t.dataset.varColor] = t.value;
        var inp = document.querySelector('[data-var-input="' + t.dataset.varColor + '"]');
        if (inp) inp.value = t.value;
        syncAll(false);
      } else if (t.dataset.varInput && t.value.trim()) {
        overrides[t.dataset.varInput] = t.value.trim();
        syncAll(false);
      }
    });

    document.getElementById("btnToggleDrawer").addEventListener("click", function() {
      var shell = document.getElementById("tsAppShell");
      shell.dataset.drawerOpen = shell.dataset.drawerOpen === "false" ? "true" : "false";
    });
    document.getElementById("btnResetAllOverrides").addEventListener("click", function() { overrides = {}; syncAll(true); });

    var liveModal = document.getElementById("tsLivePreviewModal");
    document.getElementById("btnOpenLiveModal").addEventListener("click", function() { liveModal.hidden = false; });
    document.getElementById("btnCloseLiveModal").addEventListener("click", function() { liveModal.hidden = true; });
    document.getElementById("btnCancelLiveModal").addEventListener("click", function() { liveModal.hidden = true; });
    document.getElementById("btnConfirmLiveModal").addEventListener("click", function() { liveModal.hidden = true; });

    var jsonModal = document.getElementById("tsJsonModal");
    var jsonTxt = document.getElementById("txtThemeJsonPayload");
    var jsonErr = document.getElementById("tsJsonErrorBanner");

    function buildExportJson() {
      return JSON.stringify({
        schemaVersion: 1,
        format: "bun-rad-theme-studio",
        id: "theme-" + currentName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: currentName,
        updatedAt: new Date().toISOString(),
        surface: surface,
        overrides: overrides
      }, null, 2);
    }

    document.getElementById("btnOpenJsonModal").addEventListener("click", function() {
      jsonErr.style.display = "none";
      jsonTxt.value = buildExportJson();
      jsonModal.hidden = false;
    });
    document.getElementById("btnCloseJsonModal").addEventListener("click", function() { jsonModal.hidden = true; });
    document.getElementById("btnApplyJsonPayload").addEventListener("click", function() {
      try {
        var p = JSON.parse(jsonTxt.value);
        var s = p.surface || p;
        if (!s || typeof s !== "object") throw new Error("Missing surface configuration");
        surface = {
          baseMode: s.baseMode || "dark",
          primaryColor: normalizeHex(s.primaryColor, "#3b82f6"),
          accentColor: normalizeHex(s.accentColor, "#8b5cf6"),
          surfaceVibe: s.surfaceVibe || "frosted-glass",
          cornerSharpness: clamp(Number(s.cornerSharpness) || 0, 0, 24),
          density: s.density || "comfortable"
        };
        overrides = p.overrides && typeof p.overrides === "object" ? p.overrides : {};
        currentName = p.name || "Imported Theme";
        document.getElementById("ctrlSaveThemeName").value = currentName;
        jsonModal.hidden = true;
        syncAll(true);
      } catch (err) {
        jsonErr.textContent = err.message || "Invalid JSON";
        jsonErr.style.display = "inline-flex";
      }
    });

    document.getElementById("btnSaveThemeLocal").addEventListener("click", function() {
      var nameInput = document.getElementById("ctrlSaveThemeName").value.trim() || "Custom Theme";
      currentName = nameInput;
      var list = loadSavedList();
      var doc = {
        schemaVersion: 1,
        format: "bun-rad-theme-studio",
        id: "theme-" + nameInput.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36),
        name: nameInput,
        updatedAt: new Date().toISOString(),
        surface: Object.assign({}, surface),
        overrides: Object.assign({}, overrides)
      };
      var idx = list.findIndex(function(item) { return item.name.toLowerCase() === nameInput.toLowerCase(); });
      if (idx >= 0) list[idx] = doc; else list.unshift(doc);
      saveList(list);
      syncAll(false);
    });

    document.getElementById("btnLoadSavedTheme").addEventListener("click", function() {
      var id = document.getElementById("ctrlSavedThemesSelect").value;
      var found = loadSavedList().find(function(item) { return item.id === id; });
      if (found) {
        currentName = found.name;
        surface = Object.assign({}, found.surface);
        overrides = Object.assign({}, found.overrides || {});
        document.getElementById("ctrlSaveThemeName").value = currentName;
        syncAll(true);
      }
    });

    document.getElementById("btnDeleteSavedTheme").addEventListener("click", function() {
      var id = document.getElementById("ctrlSavedThemesSelect").value;
      if (!id) return;
      saveList(loadSavedList().filter(function(item) { return item.id !== id; }));
      renderSavedDropdown();
    });

    syncAll(true);
  })();
  </script>
</body>
</html>`;
}

function getStudioBodyTemplate(): string {
  return `
    <div class="ts-app-shell" id="tsAppShell" data-drawer-open="true">
      <main class="ts-playground-main" id="tsPlaygroundMain">
        <header class="ts-topbar">
          <div class="ts-brand-cluster">
            <div class="ts-brand-orb" aria-hidden="true">⚡</div>
            <div class="ts-title-stack">
              <h1>Visual Theme Studio &amp; Smart Math Engine</h1>
              <p id="tsHeaderSummary">3-Layer Architecture • Real-Time :root CSS Custom Properties • WCAG Auto-Contrast</p>
            </div>
          </div>
          <div class="ts-toolbar-actions">
            <span class="ts-badge ts-badge-info" id="tsContrastBadge">Contrast: --</span>
            <span class="ts-badge ts-badge-neutral" id="tsOverrideCountBadge">0 Overrides</span>
            <button type="button" class="ts-btn ts-btn-secondary" id="btnOpenJsonModal">⇄ Export / Import JSON</button>
            <button type="button" class="ts-btn ts-btn-secondary" id="btnOpenLiveModal">❐ Preview Modal</button>
            <button type="button" class="ts-btn ts-btn-primary" id="btnToggleDrawer">⚙ Toggle Studio Drawer</button>
          </div>
        </header>

        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div class="ts-tabs-bar" role="tablist" aria-label="Playground Preview Sections">
            <button type="button" class="ts-tab-btn" role="tab" id="pgTabAll" data-pg-tab="components" aria-selected="true">All Components</button>
            <button type="button" class="ts-tab-btn" role="tab" id="pgTabData" data-pg-tab="data" aria-selected="false">Tables &amp; Badges</button>
            <button type="button" class="ts-tab-btn" role="tab" id="pgTabCode" data-pg-tab="code" aria-selected="false">10-Step Scale &amp; Code</button>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;" id="tsStatusBadgesStrip">
            <span class="ts-badge ts-badge-success">● System Healthy</span>
            <span class="ts-badge ts-badge-warning">▲ Latency 42ms</span>
            <span class="ts-badge ts-badge-danger">✖ 2 Build Alerts</span>
            <span class="ts-badge ts-badge-info">ℹ v1.4.9 Active</span>
          </div>
        </div>

        <div class="ts-grid-2" id="pgSectionComponents">
          <section class="ts-panel" aria-labelledby="headingButtons">
            <div class="ts-panel-header">
              <div>
                <h2 class="ts-panel-title" id="headingButtons">Interactive Buttons &amp; States</h2>
                <p class="ts-panel-subtitle">Auto-computed hover, active, focus-ring, and WCAG on-color tokens</p>
              </div>
              <span class="ts-badge ts-badge-info" id="tsBtnContrastReadout">AA Pass</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:var(--density-gap-sm);">
              <button type="button" class="ts-btn ts-btn-primary" id="previewBtnPrimary">Primary Action</button>
              <button type="button" class="ts-btn ts-btn-accent" id="previewBtnAccent">Accent CTA</button>
              <button type="button" class="ts-btn ts-btn-secondary" id="previewBtnSecondary">Secondary</button>
              <button type="button" class="ts-btn ts-btn-ghost" id="previewBtnGhost">Ghost Button</button>
              <button type="button" class="ts-btn ts-btn-danger" id="previewBtnDanger">Destructive</button>
              <button type="button" class="ts-btn ts-btn-primary" id="previewBtnDisabled" disabled>Disabled</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; padding-top:6px;">
              <div class="ts-field-label">
                <span>Inline Modal &amp; Surface Elevation Preview</span>
                <span id="tsVibeReadout" style="font-family:var(--font-mono);">frosted-glass</span>
              </div>
              <div class="ts-panel ts-panel-elevated" style="padding:var(--density-gap-md);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                  <strong>Elevated Dialog Card (--shadow-elevated)</strong>
                  <span class="ts-badge ts-badge-success">Live Surface</span>
                </div>
                <p style="margin:4px 0 0; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  Reacts immediately to Surface Vibe (Flat, Frosted Glass, Matte, Neon Border), Corner Sharpness, and Density.
                </p>
              </div>
            </div>
          </section>

          <section class="ts-panel" aria-labelledby="headingInputs">
            <div class="ts-panel-header">
              <div>
                <h2 class="ts-panel-title" id="headingInputs">Form Controls &amp; Validation</h2>
                <p class="ts-panel-subtitle">Themed inputs, native accent-color controls, and focus halos</p>
              </div>
              <span class="ts-badge ts-badge-neutral">Inputs</span>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--density-gap-sm);">
              <div>
                <label class="ts-field-label" for="previewInputName">Workspace Name</label>
                <input id="previewInputName" class="ts-input" type="text" value="Apollo Design System" placeholder="Enter workspace name..." />
              </div>
              <div>
                <label class="ts-field-label" for="previewSelectEnv">Target Environment</label>
                <select id="previewSelectEnv" class="ts-select">
                  <option value="prod">Production Cluster (US-East)</option>
                  <option value="staging">Staging Canary</option>
                  <option value="dev">Local Dev Sandbox</option>
                </select>
              </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--density-gap-sm);">
              <div>
                <label class="ts-field-label" for="previewInputEmail">Contact Email (:user-valid)</label>
                <input id="previewInputEmail" class="ts-input" type="email" value="architect@bunrad.dev" required placeholder="name@domain.com" />
              </div>
              <div>
                <label class="ts-field-label" for="previewInputDisabled">Read-Only Token</label>
                <input id="previewInputDisabled" class="ts-input" type="text" value="tok_live_98a7f6d5e4" disabled />
              </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:var(--density-gap-sm); align-items:center;">
              <label class="ts-check-label">
                <input type="checkbox" id="previewCheckAutoContrast" checked />
                <span>WCAG Auto-Contrast</span>
              </label>
              <label class="ts-check-label">
                <input type="checkbox" id="previewCheckGpuBlur" checked />
                <span>GPU Backdrop Filter</span>
              </label>
              <label class="ts-check-label">
                <input type="radio" name="previewRadioTier" id="previewRadioPro" checked />
                <span>Enterprise Tier</span>
              </label>
            </div>
          </section>
        </div>

        <section class="ts-panel" id="pgSectionData" aria-labelledby="headingTable">
          <div class="ts-panel-header">
            <div>
              <h2 class="ts-panel-title" id="headingTable">Live Tokenized Data Table</h2>
              <p class="ts-panel-subtitle">Click any row to test selection state (--bg-selected) and hover highlights (--bg-hover)</p>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <span class="ts-badge ts-badge-success">4 Services Online</span>
              <span class="ts-badge ts-badge-warning">1 Degraded</span>
            </div>
          </div>
          <div class="ts-table-wrap">
            <table class="ts-table" id="previewDataTable">
              <thead>
                <tr>
                  <th>Service Node</th>
                  <th>Region</th>
                  <th>Surface Token</th>
                  <th>P95 Latency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr data-selected="true">
                  <td><strong>theme-math-engine-01</strong></td>
                  <td>us-east-va</td>
                  <td><code>--bg-selected</code></td>
                  <td>0.4 ms</td>
                  <td><span class="ts-badge ts-badge-success">Healthy</span></td>
                </tr>
                <tr>
                  <td><strong>token-compiler-edge</strong></td>
                  <td>eu-central-fra</td>
                  <td><code>--bg-panel</code></td>
                  <td>1.2 ms</td>
                  <td><span class="ts-badge ts-badge-info">Syncing</span></td>
                </tr>
                <tr>
                  <td><strong>wcag-contrast-auditor</strong></td>
                  <td>ap-northeast-tyo</td>
                  <td><code>--text-primary</code></td>
                  <td>18.7 ms</td>
                  <td><span class="ts-badge ts-badge-warning">Elevated Load</span></td>
                </tr>
                <tr>
                  <td><strong>legacy-stylesheet-proxy</strong></td>
                  <td>us-west-sfo</td>
                  <td><code>--status-danger-bg</code></td>
                  <td>142.0 ms</td>
                  <td><span class="ts-badge ts-badge-danger">Deprecated</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="ts-grid-2" id="pgSectionCode">
          <section class="ts-panel" aria-labelledby="headingShades">
            <div class="ts-panel-header">
              <div>
                <h2 class="ts-panel-title" id="headingShades">Auto-Generated 10-Step Shade Scale (50–950)</h2>
                <p class="ts-panel-subtitle">Derived from Base Mode + Primary Brand Color hue &amp; saturation</p>
              </div>
              <span class="ts-badge ts-badge-neutral" id="tsBaseModeBadge">dark</span>
            </div>
            <div class="ts-shade-grid" id="tsShadeScaleGrid"></div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <span class="ts-field-label">Terminal Output &amp; Custom Scrollbar Viewport</span>
              <div class="ts-terminal-box ts-scrollable" style="max-height:110px; overflow-y:auto;" id="previewTerminalBox">
                <div>$ bun run theme:compile --mode=dark --vibe=frosted-glass</div>
                <div style="color:var(--text-success);">✔ Generated 10-step neutral, primary &amp; accent shade scales (50..950)</div>
                <div style="color:var(--text-info);">ℹ Verified WCAG contrast ratio on panel surface</div>
                <div>✔ Applied CSS custom properties to :root in 0.2ms<span class="ts-terminal-cursor"></span></div>
              </div>
            </div>
          </section>

          <section class="ts-panel" aria-labelledby="headingCode">
            <div class="ts-panel-header">
              <div>
                <h2 class="ts-panel-title" id="headingCode">Live :root CSS Variables Stream</h2>
                <p class="ts-panel-subtitle">Real-time semantic output applied to document.documentElement</p>
              </div>
              <button type="button" class="ts-btn ts-btn-secondary ts-btn-sm" id="btnCopyRootCss">📋 Copy :root CSS</button>
            </div>
            <pre class="ts-code-pre" id="previewCodeBlock" style="max-height:210px; overflow:auto;"></pre>
          </section>
        </div>
      </main>

      <aside class="ts-drawer" id="tsCustomizerDrawer" aria-label="Theme Customizer Drawer">
        <div class="ts-drawer-header">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div>
              <strong style="font-size:var(--font-size-base);">Theme Customizer Drawer</strong>
              <div style="font-size:var(--font-size-xs); color:var(--text-muted);" id="tsActiveThemeLabel">Active: Obsidian Glass</div>
            </div>
            <button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" id="btnResetAllOverrides">↺ Reset</button>
          </div>
          <div class="ts-drawer-tabs" role="tablist" aria-label="Theme Studio Modes">
            <button type="button" class="ts-tab-btn" role="tab" id="tabBtnQuickStudio" data-studio-tab="quick" aria-selected="true">
              ⚡ Quick Studio
            </button>
            <button type="button" class="ts-tab-btn" role="tab" id="tabBtnProInspector" data-studio-tab="inspector" aria-selected="false">
              🎛 Pro Inspector
            </button>
          </div>
        </div>

        <div class="ts-drawer-body" id="tabPanelQuickStudio" role="tabpanel" aria-labelledby="tabBtnQuickStudio">
          <div>
            <div class="ts-field-label">
              <span>One-Click Pro Presets</span>
              <span>8 Curated</span>
            </div>
            <div class="ts-preset-grid" id="tsPresetGrid"></div>
          </div>

          <div>
            <div class="ts-field-label">
              <span>1. Base Mode</span>
              <code id="lblBaseModeVal" style="font-family:var(--font-mono);">dark</code>
            </div>
            <div class="ts-segmented-grid" id="ctrlBaseModeGroup">
              <button type="button" class="ts-seg-btn" data-base-mode="light">☀ Light</button>
              <button type="button" class="ts-seg-btn" data-base-mode="dark">🌙 Dark</button>
              <button type="button" class="ts-seg-btn" data-base-mode="midnight">🌌 Midnight</button>
              <button type="button" class="ts-seg-btn" data-base-mode="high-contrast">◑ High-Contrast</button>
            </div>
          </div>

          <div>
            <label class="ts-field-label" for="ctrlPrimaryColorHex">
              <span>2. Primary Brand Color</span>
              <code id="lblPrimaryColorVal" style="font-family:var(--font-mono);">#3b82f6</code>
            </label>
            <div class="ts-color-picker-row">
              <input type="color" id="ctrlPrimaryColorPicker" class="ts-color-swatch-input" value="#3b82f6" aria-label="Primary Brand Color Picker" />
              <input type="text" id="ctrlPrimaryColorHex" class="ts-input" value="#3b82f6" maxlength="7" aria-label="Primary Brand Color Hex" />
            </div>
          </div>

          <div>
            <label class="ts-field-label" for="ctrlAccentColorHex">
              <span>3. Accent / Action Color</span>
              <code id="lblAccentColorVal" style="font-family:var(--font-mono);">#8b5cf6</code>
            </label>
            <div class="ts-color-picker-row">
              <input type="color" id="ctrlAccentColorPicker" class="ts-color-swatch-input" value="#8b5cf6" aria-label="Accent Action Color Picker" />
              <input type="text" id="ctrlAccentColorHex" class="ts-input" value="#8b5cf6" maxlength="7" aria-label="Accent Action Color Hex" />
            </div>
          </div>

          <div>
            <div class="ts-field-label">
              <span>4. Surface Vibe</span>
              <code id="lblSurfaceVibeVal" style="font-family:var(--font-mono);">frosted-glass</code>
            </div>
            <div class="ts-segmented-grid" id="ctrlSurfaceVibeGroup">
              <button type="button" class="ts-seg-btn" data-surface-vibe="flat">⬜ Flat</button>
              <button type="button" class="ts-seg-btn" data-surface-vibe="frosted-glass">🧊 Frosted Glass</button>
              <button type="button" class="ts-seg-btn" data-surface-vibe="matte">🪨 Matte</button>
              <button type="button" class="ts-seg-btn" data-surface-vibe="neon-border">⚡ Neon Border</button>
            </div>
          </div>

          <div>
            <label class="ts-field-label" for="ctrlCornerSharpness">
              <span>5. Corner Sharpness</span>
              <code id="lblCornerSharpnessVal" style="font-family:var(--font-mono);">10px</code>
            </label>
            <input type="range" id="ctrlCornerSharpness" min="0" max="24" step="1" value="10" style="width:100%;" aria-label="Corner Sharpness Slider" />
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted);">
              <span>0px Sharp</span>
              <span>8px Rounded</span>
              <span>16px Soft</span>
              <span>24px Pill</span>
            </div>
          </div>

          <div>
            <div class="ts-field-label">
              <span>6. Interface Density</span>
              <code id="lblDensityVal" style="font-family:var(--font-mono);">comfortable</code>
            </div>
            <div class="ts-segmented-grid-3" id="ctrlDensityGroup">
              <button type="button" class="ts-seg-btn" data-density="compact">Compact</button>
              <button type="button" class="ts-seg-btn" data-density="comfortable">Comfortable</button>
              <button type="button" class="ts-seg-btn" data-density="spacious">Spacious</button>
            </div>
          </div>
        </div>

        <div class="ts-drawer-body" id="tabPanelProInspector" role="tabpanel" aria-labelledby="tabBtnProInspector" hidden>
          <div>
            <label class="ts-field-label" for="ctrlInspectorSearch">
              <span>Filter Granular CSS Variables</span>
              <span>${THEME_VARIABLE_CATALOG.length} tokens</span>
            </label>
            <input type="search" id="ctrlInspectorSearch" class="ts-input" placeholder="Search --bg-app, --text-primary, --radius..." />
          </div>
          <div id="tsInspectorAccordionTree" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>

        <div class="ts-drawer-footer">
          <div style="display:grid; grid-template-columns: 1fr auto; gap:6px;">
            <input type="text" id="ctrlSaveThemeName" class="ts-input" value="Obsidian Glass" placeholder="Custom theme name..." aria-label="Custom theme name" />
            <button type="button" class="ts-btn ts-btn-primary" id="btnSaveThemeLocal">💾 Save Theme</button>
          </div>
          <div style="display:grid; grid-template-columns: 1fr auto auto; gap:6px; align-items:center;">
            <select id="ctrlSavedThemesSelect" class="ts-select" aria-label="Saved Custom Themes">
              <option value="">Saved Themes (localStorage)...</option>
            </select>
            <button type="button" class="ts-btn ts-btn-secondary ts-btn-sm" id="btnLoadSavedTheme">Load</button>
            <button type="button" class="ts-btn ts-btn-danger ts-btn-sm" id="btnDeleteSavedTheme">Delete</button>
          </div>
        </div>
      </aside>

      <div class="ts-modal-backdrop" id="tsLivePreviewModal" role="dialog" aria-modal="true" aria-labelledby="liveModalTitle" hidden>
        <div class="ts-modal-dialog">
          <div class="ts-panel-header">
            <h3 class="ts-panel-title" id="liveModalTitle">Live Themed Modal Dialog</h3>
            <button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" id="btnCloseLiveModal">✕ Close</button>
          </div>
          <p style="margin:0; color:var(--text-secondary); font-size:var(--font-size-sm);">
            This modal inherits <code>--bg-elevated</code>, <code>--shadow-modal</code>, <code>--radius-xl</code>, and <code>--bg-overlay</code> directly from the <code>:root</code> theme engine.
          </p>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="ts-btn ts-btn-secondary" id="btnCancelLiveModal">Cancel</button>
            <button type="button" class="ts-btn ts-btn-primary" id="btnConfirmLiveModal">Confirm Action</button>
          </div>
        </div>
      </div>

      <div class="ts-modal-backdrop" id="tsJsonModal" role="dialog" aria-modal="true" aria-labelledby="jsonModalTitle" hidden>
        <div class="ts-modal-dialog">
          <div class="ts-panel-header">
            <h3 class="ts-panel-title" id="jsonModalTitle">Export / Import Theme JSON</h3>
            <button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" id="btnCloseJsonModal">✕ Close</button>
          </div>
          <textarea id="txtThemeJsonPayload" class="ts-textarea" style="min-height:180px; font-family:var(--font-mono); font-size:12px;" aria-label="Theme JSON Payload"></textarea>
          <div id="tsJsonErrorBanner" class="ts-badge ts-badge-danger" style="display:none;"></div>
          <div style="display:flex; justify-content:flex-end; gap:6px;">
            <button type="button" class="ts-btn ts-btn-primary ts-btn-sm" id="btnApplyJsonPayload">✔ Import &amp; Apply JSON</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Starts a local loopback HTTP server serving the Visual Theme Studio UI and JSON compilation endpoints.
 */
export function startThemeStudioServer(options: { port?: number; host?: string } = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";

  return Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const blocked = guardLocalRequest(req);
      if (blocked) return blocked;

      const url = new URL(req.url);
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(generateThemeStudioPageHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (url.pathname === "/api/health") {
        return Response.json({
          status: "ok",
          app: "theme_studio",
          name: "Visual Theme Studio Pro",
          timestamp: Date.now(),
        });
      }

      if (url.pathname === "/api/compile" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            surface?: Partial<ThemeSurfaceConfig>;
            overrides?: Record<string, string>;
          };
          const compiled = calculateThemeSystem(body.surface ?? {}, body.overrides ?? {});
          return Response.json(compiled);
        } catch (err: any) {
          return Response.json(
            { error: err?.message || "Invalid theme compilation payload" },
            { status: 400 }
          );
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}
