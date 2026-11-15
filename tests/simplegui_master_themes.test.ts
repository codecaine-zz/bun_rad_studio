import { describe, expect, test } from "bun:test";
import {
  SIMPLEGUI_THEMES,
  MASTER_THEME_KEYS,
} from "../src/shared/simpleguiThemes";
import {
  FX_MASTER_THEMES,
  FX_MASTER_THEME_KEYS,
  FX_MASTER_THEME_ALIASES,
  FX_FALLBACK_THEMES,
  FX_TOKEN_NAMES,
  findFxTheme,
  resolveFxThemeKey,
  getFallbackThemeKey,
  resolveThemeForHardware,
  fxCssVars,
  fxRootAttrs,
  glassReport,
  focusRingColor,
  syntaxPalette,
} from "../src/shared/fxThemes";
import { fxCss } from "../src/shared/fxCss";
import {
  NAMED_SEMANTICS,
  contrastRatio,
} from "../src/shared/themeSemantic";
import {
  simplegui,
  getTheme,
  getThemeKeys,
  listThemes,
  isFxTheme,
  getThemeFx,
  getSemanticColors,
} from "../src/simplegui";

describe("SimpleGUI Flagship Master Themes & Audited Catalog", () => {
  test("exports all 12 flagship Master themes covering both dark and light design excellence", () => {
    expect(MASTER_THEME_KEYS).toEqual([
      "alabaster_studio_light",
      "cyberdeck_pro",
      "kyoto_matcha_studio",
      "kyoto_washi_daylight",
      "liquid_glass_noir",
      "liquid_glass_studio",
      "nordic_daylight_studio",
      "oled_obsidian_pro",
      "solaris_aurora_pro",
      "sovereign_gold_pro",
      "studio_graphite_pro",
      "warm_paper_editorial",
    ]);
    expect(FX_MASTER_THEME_KEYS.length).toBe(10);

    const darkMasters = MASTER_THEME_KEYS.filter(
      (k) => SIMPLEGUI_THEMES[k]!.is_dark,
    );
    const lightMasters = MASTER_THEME_KEYS.filter(
      (k) => !SIMPLEGUI_THEMES[k]!.is_dark,
    );
    expect(darkMasters.length).toBe(7);
    expect(lightMasters.length).toBe(5);

    const themeNames = listThemes();
    const themeKeys = getThemeKeys();
    for (const key of MASTER_THEME_KEYS) {
      const theme = SIMPLEGUI_THEMES[key]!;
      expect(theme, key).toBeDefined();
      expect(themeKeys).toContain(key);
      expect(themeNames).toContain(theme.name);
      expect(getTheme(key)).toBe(theme);
      expect(getTheme(theme.name)).toBe(theme);
    }
  });

  test("every flagship Master theme meets strict WCAG AAA text, AA accent/border, and focus contrast", () => {
    for (const key of MASTER_THEME_KEYS) {
      const t = SIMPLEGUI_THEMES[key]!;
      const card = t.card_background!;
      const border = t.card_border!;
      const secondary = t.secondary_accent!;

      // Polarity matches actual canvas luminance against pure black / pure white
      if (t.is_dark) {
        expect(
          contrastRatio("#ffffff", t.background_color),
          `${key} dark canvas polarity`,
        ).toBeGreaterThan(15.0);
      } else {
        expect(
          contrastRatio("#000000", t.background_color),
          `${key} light canvas polarity`,
        ).toBeGreaterThan(16.0);
      }

      // WCAG AAA (>= 7:1; flagship studio bar >= 14.5:1) for body text on canvas and card
      expect(
        contrastRatio(t.font_color, t.background_color),
        `${key} font vs canvas`,
      ).toBeGreaterThanOrEqual(14.5);
      expect(
        contrastRatio(t.font_color, card),
        `${key} font vs card`,
      ).toBeGreaterThanOrEqual(15.0);

      // WCAG AA (>= 4.5:1; flagship bar >= 5.5:1) for primary and secondary accents
      expect(
        contrastRatio(t.accent_color, t.background_color),
        `${key} accent vs canvas`,
      ).toBeGreaterThanOrEqual(5.5);
      expect(
        contrastRatio(t.accent_color, card),
        `${key} accent vs card`,
      ).toBeGreaterThanOrEqual(6.0);
      expect(
        contrastRatio(secondary, card),
        `${key} secondary vs card`,
      ).toBeGreaterThanOrEqual(5.0);

      // Non-text UI boundary contrast >= 3:1 (flagship bar >= 4.0:1)
      expect(
        contrastRatio(border, t.background_color),
        `${key} border vs canvas`,
      ).toBeGreaterThanOrEqual(4.0);
      expect(
        contrastRatio(border, card),
        `${key} border vs card`,
      ).toBeGreaterThanOrEqual(4.0);

      // Focus ring contrast >= 4.5:1 on both surfaces
      const ring = focusRingColor({
        accent_color: t.accent_color,
        background_color: t.background_color,
        card_background: card,
        is_dark: t.is_dark,
      });
      expect(
        contrastRatio(ring, t.background_color),
        `${key} focus ring vs canvas`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(ring, card),
        `${key} focus ring vs card`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("FX-backed Master themes pass worst-case glass contrast, emit all FX CSS tokens, and resolve hardware fallbacks", () => {
    for (const key of FX_MASTER_THEME_KEYS) {
      const t = FX_MASTER_THEMES[key]!;
      expect(isFxTheme(key)).toBe(true);
      expect(getThemeFx(key)).toEqual(t.fx);
      expect(findFxTheme(key)).toBe(t);
      expect(findFxTheme(t.name)).toBe(t);
      expect(resolveFxThemeKey(key)).toBe(key);

      // Glass worst-case contrast over pure black & pure white backdrops >= 4.5:1
      const gr = glassReport({ ...t, fx: t.fx! });
      expect(gr.worstContrast, `${key} glass worstContrast`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(t.fx!.blur).toBeGreaterThanOrEqual(0);
      expect(t.fx!.blur).toBeLessThanOrEqual(32);
      expect(t.fx!.glass).toBeGreaterThanOrEqual(0);
      expect(t.fx!.glass).toBeLessThanOrEqual(1);

      // Complete CSS token generation
      const vars = fxCssVars(t);
      for (const tokenName of FX_TOKEN_NAMES) {
        expect(vars, `${key} missing ${tokenName}`).toContain(`${tokenName}:`);
      }
      expect(vars).toContain("--fx-noise:");

      // Hardware fallback matches dark/light polarity and points to a non-FX theme
      const fbKey = FX_FALLBACK_THEMES[key];
      expect(fbKey, `${key} fallback`).toBeTruthy();
      expect(getFallbackThemeKey(key)).toBe(fbKey!);
      const fbTheme = SIMPLEGUI_THEMES[fbKey!]!;
      expect(fbTheme, `${key} -> ${fbKey}`).toBeDefined();
      expect(fbTheme.fx).toBeUndefined();
      expect(fbTheme.is_dark).toBe(t.is_dark);

      // Low-end software GPU downgrades cleanly; Apple Silicon M4 Pro keeps full FX
      const swResolved = resolveThemeForHardware(key, getTheme, {
        gpuRenderer: "llvmpipe (LLVM 15.0.7, 256 bits)",
        platform: "linux",
        cores: 2,
      });
      expect(swResolved.downgraded).toBe(true);
      expect(swResolved.revertedToFallback).toBe(true);
      expect(swResolved.appliedKey).toBe(fbKey!);
      expect(swResolved.theme.is_dark).toBe(t.is_dark);

      const ultraResolved = resolveThemeForHardware(key, getTheme, {
        gpuRenderer: "Apple M4 Max",
        platform: "darwin",
        cores: 14,
        devicePixelRatio: 2,
        colorGamutP3: true,
        hdrDynamicRange: true,
      });
      expect(ultraResolved.downgraded).toBe(false);
      expect(ultraResolved.revertedToFallback).toBe(false);
      expect(ultraResolved.fxMode).toBe("on");
      expect(ultraResolved.theme).toBe(t);
    }

    // Matte non-FX Studio Master themes produce zero FX overhead
    for (const matteKey of ["studio_graphite_pro", "alabaster_studio_light"]) {
      expect(isFxTheme(matteKey)).toBe(false);
      expect(fxCssVars(SIMPLEGUI_THEMES[matteKey])).toBe("");
      expect(fxRootAttrs(SIMPLEGUI_THEMES[matteKey])).toEqual({});
    }
  });

  test("shorthand aliases resolve cleanly across getTheme, findFxTheme, and hardware fallbacks", () => {
    for (const [alias, canonical] of Object.entries(FX_MASTER_THEME_ALIASES)) {
      const target = FX_MASTER_THEMES[canonical]!;
      expect(SIMPLEGUI_THEMES[alias]).toBe(target);
      expect(getTheme(alias)).toBe(target);
      expect(findFxTheme(alias)).toBe(target);
      expect(resolveFxThemeKey(alias)).toBe(canonical);
      expect(getFallbackThemeKey(alias)).toBe(FX_FALLBACK_THEMES[canonical]!);
    }
    expect(getTheme("graphite_pro")).toEqual(
      SIMPLEGUI_THEMES.studio_graphite_pro!,
    );
    expect(getTheme("alabaster_studio")).toEqual(
      SIMPLEGUI_THEMES.alabaster_studio_light!,
    );
  });

  test("SimpleWindow renders flagship FX and Matte Master themes across full, reduced, and off effects modes", () => {
    const fxWin = simplegui.createWindow("Liquid Glass Check", 800, 520, {
      theme: "liquid_glass_studio",
      effects: "full",
    });
    fxWin.addButton("btn1", "Primary Action");
    const fullHtml = fxWin.generateHtml();
    expect(fullHtml).toContain('data-fx="on"');
    expect(fullHtml).toContain('data-fx-backdrop="liquid"');
    expect(fullHtml).toContain('data-fx-prism="on"');
    expect(fullHtml).toContain('id="simplegui-fx-vars"');
    expect(fullHtml).toContain('id="simplegui-fx-css"');

    fxWin.setEffects("reduced");
    expect(fxWin.generateHtml()).toContain('data-fx="reduced"');

    fxWin.setEffects("off");
    expect(fxWin.generateHtml()).toContain('data-fx="off"');

    const matteWin = simplegui.createWindow("Graphite Matte Check", 800, 520, {
      theme: "studio_graphite_pro",
    });
    const matteHtml = matteWin.generateHtml();
    expect(matteHtml).not.toContain('id="simplegui-fx-css"');
    expect(matteHtml).toContain("color-scheme: dark");
  });

  test("every built-in theme in SIMPLEGUI_THEMES has complete valid hex tokens, semantic colors, and readable syntax palettes", () => {
    const hex6 = /^#[0-9a-f]{6}$/i;
    let darkCount = 0;
    let lightCount = 0;

    for (const [key, t] of Object.entries(SIMPLEGUI_THEMES)) {
      expect(t.name.length, `${key} name`).toBeGreaterThan(0);
      expect(t.description.length, `${key} description`).toBeGreaterThan(5);
      expect(typeof t.is_dark, `${key} is_dark`).toBe("boolean");
      expect(t.background_color, `${key} bg`).toMatch(hex6);
      expect(t.font_color, `${key} fg`).toMatch(hex6);
      expect(t.accent_color, `${key} accent`).toMatch(hex6);
      expect(t.secondary_accent, `${key} secondary`).toMatch(hex6);
      expect(t.card_background, `${key} card_bg`).toMatch(hex6);
      expect(t.card_border, `${key} card_border`).toMatch(hex6);

      if (t.is_dark) darkCount++;
      else lightCount++;

      // Every non-vintage-Win95 theme reaches >= 4.5:1 primary text legibility on card
      const cardContrast = contrastRatio(t.font_color, t.card_background!);
      expect(cardContrast, `${key} font vs card`).toBeGreaterThanOrEqual(4.5);
    }

    expect(darkCount).toBeGreaterThan(250);
    expect(lightCount).toBeGreaterThan(60);

    // Semantic and syntax readability across all Master & newly curated named palettes
    for (const key of [
      ...MASTER_THEME_KEYS,
      "rose_pine",
      "linear_dark",
      "supabase",
      "raycast_dark",
      "cobalt2",
      "jetbrains_darcula",
      "horizon",
      "tailwind_dark",
    ]) {
      const t = SIMPLEGUI_THEMES[key]!;
      expect(NAMED_SEMANTICS[t.name], `${t.name} NAMED_SEMANTICS`).toBeDefined();

      const sem = getSemanticColors(key);
      for (const kind of ["danger", "warning", "success", "info"] as const) {
        const entry = sem[kind];
        expect(
          contrastRatio(entry.on, entry.solid),
          `${key}.${kind} on/solid`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(entry.solid, t.card_background!),
          `${key}.${kind} solid/card`,
        ).toBeGreaterThanOrEqual(3.0);
        expect(
          contrastRatio(entry.text, t.card_background!),
          `${key}.${kind} text/card`,
        ).toBeGreaterThanOrEqual(4.5);
      }

      const syn = syntaxPalette(t);
      for (const [slot, hex] of Object.entries(syn)) {
        expect(
          contrastRatio(hex, t.background_color),
          `${key} syntax.${slot}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("upgraded classic SimpleGUI themes eliminate low-contrast secondary accents and muddy borders", () => {
    const upgradedClassicKeys = [
      "sonoma_dark",
      "sonoma_light",
      "fluent_dark",
      "fluent_light",
      "commodore64",
      "crimson",
      "charcoal",
      "slate",
      "light",
      "windows_95",
      "linear_dark",
      "unreal_engine",
      "jetbrains_darcula",
      "gruvbox_light",
      "kanagawa",
      "win11_slate",
      "win11_light",
      "ubuntu_dark",
      "adwaita_dark",
      "fedora_dark",
      "gameboy",
      "system7",
      "amiga",
      "nextstep",
      "mac_os_aqua",
    ];

    for (const key of upgradedClassicKeys) {
      const t = SIMPLEGUI_THEMES[key]!;
      expect(
        contrastRatio(t.font_color, t.background_color),
        `${key} fg/bg`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(t.font_color, t.card_background!),
        `${key} fg/card`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(t.accent_color, t.card_background!),
        `${key} accent/card`,
      ).toBeGreaterThanOrEqual(3.5);
      expect(
        contrastRatio(t.secondary_accent!, t.card_background!),
        `${key} secondary/card`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(t.card_border!, t.card_background!),
        `${key} border/card`,
      ).toBeGreaterThanOrEqual(1.35);
    }
  });

  test("fxCss() includes composite rim+inner-glow layers, prismatic edge dispersion, composite atmospheres, and accessibility guards", () => {
    const css = fxCss();
    expect(css).toContain('[data-fx-inner-glow="on"][data-fx-rim="on"]');
    expect(css).toContain('[data-fx-border="neon"][data-fx-inner-glow="on"][data-fx-rim="on"]');
    expect(css).toContain('[data-fx-backdrop="oled"][data-fx-inner-glow="on"][data-fx-rim="on"]');
    expect(css).toContain('[data-fx-prism="on"]:not([data-fx-border="flat"])');
    expect(css).toContain('[data-fx-cursor="magnetic"]');
    for (const atm of [
      "nebula",
      "grid",
      "aurora",
      "horizon",
      "caustics",
      "prism",
      "sunbeams",
      "reticle",
    ]) {
      expect(css).toContain(`[data-fx-atmosphere*="${atm}"]:not([data-fx-tier="low"])`);
    }
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('[data-fx][data-fx-tier="low"]');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (forced-colors: active)');
  });
});
