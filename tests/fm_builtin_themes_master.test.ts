import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext } from "../src/features/filemanager/fmCore";
import {
  DEFAULT_FAVORITE_THEMES,
  DEFAULT_FAVORITE_THEME_IDS as SETTINGS_DEFAULT_FAVORITE_THEME_IDS,
  DEFAULT_SETTINGS,
  loadSettings,
  sanitizeSettings,
  updateSettings,
} from "../src/features/filemanager/fmSettings";
import {
  DEFAULT_FAVORITE_THEME_IDS,
  FM_BUILTIN_MASTER_THEMES,
  FM_BUILTIN_MASTER_THEME_SPECS,
  getThemeColours,
  getThemeColoursForHardware,
  listThemes,
  sourceOf,
  themeVars,
} from "../src/features/filemanager/fmThemes";
import {
  MASTER_CUSTOM_THEMES,
  MASTER_CUSTOM_THEME_ENTRIES,
  FM_BUILTIN_MASTER_FALLBACKS,
  FM_BUILTIN_MASTER_GROUPS,
  FM_BUILTIN_MASTER_HARDWARE_TIERS,
} from "../src/features/filemanager/fmMasterCustomThemes";
import {
  encodeThemeShareCode,
  exportThemeCss,
  parseShared,
  toSimpleTheme,
  validateDraft,
} from "../src/features/filemanager/fmThemeStore";
import { SIMPLEGUI_THEMES } from "../src/shared/simpleguiThemes";
import { contrastRatio, parseColor } from "../src/shared/themeSemantic";
import {
  DEFAULT_FAVORITE_THEMES as FE_DEFAULT_FAVORITE_THEMES,
  FM_BUILTIN_MASTER_CATALOG,
  OPTION_BRACKET_SHOWCASE_TEMPLATES,
  POPULAR_PLAIN_THEME_PICKS,
  QUICK_COLOR_PALETTE_SWATCHES,
  JUMPSTART_WORKSTATION_KITS,
  THEME_SHOW_CHANNELS_META,
  computeSubStudioThemeTokens,
  favoriteKeys,
  favoriteThemeKeys,
  favoriteThemes,
} from "../resources/file_manager/ui/themes.js";
import { themeMenuItems } from "../resources/file_manager/ui/themeMenu.js";
import { state as uiState } from "../resources/file_manager/ui/state.js";

const HEX_RE = /^#[0-9a-f]{6}$/;

describe("Codecaine File Manager Master Built-in Themes & Palette Color Science", () => {
  test("curates 14 studio-grade Flagship Master Built-in Themes balanced 7 Dark + 7 Light across all 4 hardware tiers", () => {
    expect(FM_BUILTIN_MASTER_THEME_SPECS.length).toBe(14);
    expect(Object.keys(FM_BUILTIN_MASTER_THEMES).length).toBe(14);

    const darkSpecs = FM_BUILTIN_MASTER_THEME_SPECS.filter((s) => s.draft.dark);
    const lightSpecs = FM_BUILTIN_MASTER_THEME_SPECS.filter(
      (s) => !s.draft.dark,
    );
    expect(darkSpecs.length).toBe(7);
    expect(lightSpecs.length).toBe(7);

    for (const hwTier of ["low", "medium", "high", "ultra"] as const) {
      const inTier = FM_BUILTIN_MASTER_THEME_SPECS.filter(
        (s) => s.hardwareTier === hwTier,
      );
      expect(inTier.length, `tier ${hwTier} count`).toBeGreaterThanOrEqual(3);
      expect(
        inTier.some((s) => s.draft.dark),
        `tier ${hwTier} has dark theme`,
      ).toBe(true);
      expect(
        inTier.some((s) => !s.draft.dark),
        `tier ${hwTier} has light theme`,
      ).toBe(true);
    }

    // Zero key or display-name collisions against SIMPLEGUI_THEMES
    const simpleGuiNames = new Set(
      Object.values(SIMPLEGUI_THEMES).map((t) => t.name.toLowerCase()),
    );
    for (const spec of FM_BUILTIN_MASTER_THEME_SPECS) {
      expect(SIMPLEGUI_THEMES[spec.key]).toBeUndefined();
      expect(simpleGuiNames.has(spec.draft.name.toLowerCase())).toBe(false);
      expect(spec.draft.name.length).toBeLessThanOrEqual(40);
      expect(() => validateDraft(spec.draft)).not.toThrow();

      // Semantic colors in draft are 100% distinct from accent
      const { accent, danger, warning, success, info } = spec.draft.colors;
      expect(danger).not.toBe(accent);
      expect(warning).not.toBe(accent);
      expect(success).not.toBe(accent);
      expect(info).not.toBe(accent);
    }
  });

  test("every built-in theme has monotonic surface elevation stepping, crisp hairline borders, and zero dead dark grays", () => {
    const all = listThemes();
    expect(all.length).toBeGreaterThanOrEqual(324);

    const elevationIssues: string[] = [];
    const borderIssues: string[] = [];
    const deadGrayIssues: string[] = [];

    for (const summary of all) {
      const full = getThemeColours(summary.key)!;
      expect(full, summary.key).not.toBeNull();
      const v = full.vars;

      for (const token of [
        "bg",
        "bg2",
        "bg3",
        "card",
        "panel",
        "surface-elevated",
        "surface-sunken",
        "hover",
        "selected",
        "border",
        "border-subtle",
        "border-strong",
      ]) {
        if (!HEX_RE.test(v[token] ?? "")) {
          elevationIssues.push(`${summary.key}: invalid --${token}=${v[token]}`);
        }
      }

      if (v.bg === v.bg2 || v.bg2 === v.bg3) {
        elevationIssues.push(
          `${summary.key}: non-distinct bg->bg2->bg3 (${v.bg}, ${v.bg2}, ${v.bg3})`,
        );
      }
      if (v.panel === v.hover) {
        elevationIssues.push(`${summary.key}: panel === hover (${v.panel})`);
      }
      if (v.panel === v["surface-elevated"]) {
        elevationIssues.push(
          `${summary.key}: panel === surface-elevated (${v.panel})`,
        );
      }

      // Check strict monotonic luminance progression on bg -> bg2 -> bg3
      const lBg = contrastRatio(v.bg!, "#000000");
      const lBg2 = contrastRatio(v.bg2!, "#000000");
      const lBg3 = contrastRatio(v.bg3!, "#000000");
      if (summary.dark) {
        if (!(lBg < lBg2 && lBg2 < lBg3)) {
          elevationIssues.push(
            `${summary.key}: dark bg->bg2->bg3 not ascending (${lBg.toFixed(3)}, ${lBg2.toFixed(3)}, ${lBg3.toFixed(3)})`,
          );
        }
      } else {
        const monotonic =
          (lBg > lBg2 && lBg2 > lBg3) || (lBg < lBg2 && lBg2 < lBg3);
        if (!monotonic) {
          elevationIssues.push(
            `${summary.key}: light bg->bg2->bg3 not monotonic (${lBg.toFixed(3)}, ${lBg2.toFixed(3)}, ${lBg3.toFixed(3)})`,
          );
        }
      }

      // Crisp hairline border window (no harsh neon clashing, ordered subtle <= border <= strong)
      const crSubtle = contrastRatio(v["border-subtle"]!, v.panel!);
      const crBorder = contrastRatio(v.border!, v.panel!);
      const crStrong = contrastRatio(v["border-strong"]!, v.panel!);
      if (crBorder < 1.14 || crBorder > 1.85) {
        borderIssues.push(
          `${summary.key}: border/panel contrast ${crBorder.toFixed(2)} out of [1.14, 1.85]`,
        );
      }
      if (crSubtle > crBorder + 0.02 || crBorder > crStrong + 0.02) {
        borderIssues.push(
          `${summary.key}: border hierarchy out of order (${crSubtle.toFixed(2)}, ${crBorder.toFixed(2)}, ${crStrong.toFixed(2)})`,
        );
      }

      // Non-black dark themes with chromatic accents should not be dead R===G===B gray
      const [aR, aG, aB] = parseColor(v.accent!);
      const accentChromatic = aR !== aG || aG !== aB;
      if (summary.dark && v.bg !== "#000000" && accentChromatic) {
        const [bR, bG, bB] = parseColor(v.bg!);
        if (bR === bG && bG === bB) {
          deadGrayIssues.push(`${summary.key}: dead gray bg ${v.bg}`);
        }
      }
    }

    expect(elevationIssues).toEqual([]);
    expect(borderIssues).toEqual([]);
    expect(deadGrayIssues).toEqual([]);
  });

  test("enforces WCAG AAA primary text contrast, AA+ muted contrast, balanced semantic tokens, and folder styling across all themes", () => {
    const all = listThemes();
    const contrastFailures: string[] = [];
    let aaaCount = 0;

    for (const summary of all) {
      const full = getThemeColours(summary.key)!;
      const v = full.vars;

      // 9-item contrast telemetry report
      expect(full.contrast.length).toBe(9);

      const crTextBg = contrastRatio(v.text!, v.bg!);
      const crTextPanel = contrastRatio(v.text!, v.panel!);
      if (crTextBg >= 7 && crTextPanel >= 7) aaaCount++;

      // Flagship master built-in themes must achieve strict WCAG AAA (>= 7.0:1) on primary text
      if (summary.key.startsWith("ccfm_")) {
        if (crTextBg < 7 || crTextPanel < 7) {
          contrastFailures.push(
            `${summary.key}: flagship primary text below AAA (${crTextBg.toFixed(2)} / ${crTextPanel.toFixed(2)})`,
          );
        }
      }

      const pairs: Array<[string, string, number]> = [
        ["text", "bg", 4.5],
        ["text", "bg2", 4.5],
        ["text", "bg3", 4.5],
        ["text", "panel", 4.5],
        ["text", "hover", 4.5],
        ["text", "surface-elevated", 4.5],
        ["text", "surface-sunken", 4.5],
        ["muted", "bg", 4.5],
        ["muted", "bg2", 4.5],
        ["muted", "panel", 4.5],
        ["muted", "hover", 4.5],
        ["muted", "surface-elevated", 4.5],
        ["muted", "selected", 3.0],
        ["accent", "bg", 4.5],
        ["accent", "panel", 4.5],
        ["accent-text", "accent", 4.5],
        ["selected-text", "selected", 4.5],
        ["ok", "bg", 4.5],
        ["ok", "panel", 4.5],
        ["ok", "hover", 4.5],
        ["ok-text", "ok-bg", 4.5],
        ["warn", "bg", 4.5],
        ["warn", "panel", 4.5],
        ["warn", "hover", 4.5],
        ["warn-text", "warn-bg", 4.5],
        ["danger", "bg", 4.5],
        ["danger", "panel", 4.5],
        ["danger", "hover", 4.5],
        ["danger-text", "danger-bg", 4.5],
        ["info", "bg", 4.5],
        ["info", "panel", 4.5],
        ["info", "hover", 4.5],
        ["info-text", "info-bg", 4.5],
      ];

      for (const [fgKey, bgKey, minRatio] of pairs) {
        const ratio = contrastRatio(v[fgKey]!, v[bgKey]!);
        if (ratio < minRatio) {
          contrastFailures.push(
            `${summary.key}: --${fgKey} (${v[fgKey]}) on --${bgKey} (${v[bgKey]}) = ${ratio.toFixed(2)} < ${minRatio}`,
          );
        }
      }

      // Harmonious folder tokens & preview parity
      expect(v["folder-color"]).toMatch(HEX_RE);
      expect(v["folder-tab"]).toMatch(HEX_RE);
      expect(v["folder-glow"]).toMatch(/^rgba\(/);
      expect(summary.preview.folderColor).toBe(v["folder-color"]);
      expect(summary.preview.folderTab).toBe(v["folder-tab"]);
      expect(summary.preview.bg2).toBe(v.bg2);
      expect(summary.preview.bg3).toBe(v.bg3);
    }

    expect(contrastFailures).toEqual([]);
    expect(aaaCount / all.length).toBeGreaterThanOrEqual(0.985);
  });

  test("all 20 MASTER_CUSTOM_THEME_ENTRIES preserve IDs, have distinct semantic colors, and pass full themeVars contrast", () => {
    expect(MASTER_CUSTOM_THEMES.length).toBe(20);
    expect(MASTER_CUSTOM_THEME_ENTRIES.length).toBe(20);

    for (const entry of MASTER_CUSTOM_THEME_ENTRIES) {
      expect(entry.id).toMatch(/^custom_000000[0-9a-f]{2}$/);
      const c = entry.theme.colors;
      expect(c.danger, `${entry.id} danger !== accent`).not.toBe(c.accent);
      expect(c.warning, `${entry.id} warning !== accent`).not.toBe(c.accent);
      expect(c.success, `${entry.id} success !== accent`).not.toBe(c.accent);
      expect(c.info, `${entry.id} info !== accent`).not.toBe(c.accent);

      const computed = themeVars(toSimpleTheme(entry.theme));
      for (const item of computed.contrast) {
        expect(
          item.ratio,
          `${entry.id} ${item.pair} (${item.ratio})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("Flagship Master Built-in Themes support hardware fallback downgrades, share-code round-trips, and CSS import/export", () => {
    for (const spec of FM_BUILTIN_MASTER_THEME_SPECS) {
      const full = getThemeColours(spec.key)!;
      expect(full).not.toBeNull();
      expect(full.group).toBe(FM_BUILTIN_MASTER_GROUPS[spec.key]!);
      expect(full.hardwareTier).toBe(
        FM_BUILTIN_MASTER_HARDWARE_TIERS[spec.key]!,
      );

      if (spec.draft.fx) {
        expect(full.hasEffects).toBe(true);
        expect(full.fallbackKey).toBe(FM_BUILTIN_MASTER_FALLBACKS[spec.key]);
        const downgraded = getThemeColoursForHardware(spec.key, {
          gpuRenderer: "Microsoft Basic Render Driver",
          platform: "win32",
        })!;
        expect(downgraded.revertedToFallback).toBe(true);
        expect(downgraded.theme.hasEffects).toBe(false);
        expect(downgraded.theme.dark).toBe(spec.draft.dark);
      } else {
        expect(full.hasEffects).toBe(false);
      }

      // Share code & CSS stylesheet round-trip
      const src = sourceOf(FM_BUILTIN_MASTER_THEMES[spec.key]!);
      const draft = validateDraft({
        name: full.name,
        dark: src.dark,
        base: full.name,
        colors: src.colors,
        ...(src.fx ? { fx: src.fx } : {}),
      });
      const code = encodeThemeShareCode(draft);
      const decoded = parseShared(code);
      expect(decoded.name).toBe(full.name);
      expect(decoded.dark).toBe(full.dark);

      // Pure CSS import (without embedded share code) preserves semantic & folder colors
      const pureCss = exportThemeCss(
        full.name,
        full.scheme,
        full.vars,
        full.effects?.css,
      );
      const fromCss = parseShared(pureCss);
      expect(fromCss.name).toBe(full.name);
      expect(fromCss.dark).toBe(full.dark);
      expect(fromCss.colors.success).toBe(full.vars.ok);
      expect(fromCss.colors.warning).toBe(full.vars.warn);
      expect(fromCss.colors.info).toBe(full.vars.info);
    }
  });

  test("maintains 1:1 parity between backend fmThemes.ts and frontend resources/file_manager/ui/themes.js", () => {
    expect(FM_BUILTIN_MASTER_CATALOG.length).toBe(
      FM_BUILTIN_MASTER_THEME_SPECS.length,
    );

    const specByKey = new Map(
      FM_BUILTIN_MASTER_THEME_SPECS.map((s) => [s.key, s]),
    );
    for (const feEntry of FM_BUILTIN_MASTER_CATALOG) {
      const beSpec = specByKey.get(feEntry.key);
      expect(beSpec, `missing backend spec for ${feEntry.key}`).toBeDefined();
      const beSummary = getThemeColours(feEntry.key)!;
      expect(feEntry.name).toBe(beSummary.name);
      expect(feEntry.dark).toBe(beSummary.dark);
      expect(feEntry.group).toBe(beSummary.group);
      expect(feEntry.tier).toBe(beSummary.tier);
      expect(feEntry.hardwareTier).toBe(String(beSummary.hardwareTier));
      expect(feEntry.colors).toEqual(beSpec!.draft.colors as any);
      if (feEntry.fallbackKey) {
        expect(feEntry.fallbackKey).toBe(String(beSummary.fallbackKey));
      }
    }

    // Verify all ccfm_* flagship entries in showcase & quick-pick frontend arrays resolve cleanly
    for (const pick of POPULAR_PLAIN_THEME_PICKS) {
      if (pick.key?.startsWith("ccfm_")) {
        expect(getThemeColours(pick.key), `plain pick ${pick.key}`).not.toBeNull();
      }
    }
    for (const tmpl of OPTION_BRACKET_SHOWCASE_TEMPLATES) {
      if (tmpl.key?.startsWith("ccfm_")) {
        expect(getThemeColours(tmpl.key), `showcase ${tmpl.key}`).not.toBeNull();
      }
    }
    for (const sw of QUICK_COLOR_PALETTE_SWATCHES) {
      if (sw.key?.startsWith("ccfm_")) {
        expect(getThemeColours(sw.key), `swatch ${sw.key}`).not.toBeNull();
      }
    }
    for (const kit of JUMPSTART_WORKSTATION_KITS) {
      if (kit.palette?.startsWith("ccfm_")) {
        expect(getThemeColours(kit.palette), `kit ${kit.id}`).not.toBeNull();
      }
    }
    expect(THEME_SHOW_CHANNELS_META.length).toBe(11);

    // Sub-studio token sync emits surface, folder, and semantic tokens
    const sample = getThemeColours("ccfm_tahoe_liquid_glass_xdr")!;
    const subTokens = computeSubStudioThemeTokens(sample.vars, true);
    expect(subTokens["--fm-surface-bg2"]).toBe(sample.vars.bg2);
    expect(subTokens["--fm-surface-bg3"]).toBe(sample.vars.bg3);
    expect(subTokens["--fm-folder-color"]).toBe(sample.vars["folder-color"]);
    expect(subTokens["--fm-folder-tab"]).toBe(sample.vars["folder-tab"]);
    expect(subTokens["--fm-status-ok"]).toBe(sample.vars.ok);
    expect(subTokens["--fm-status-warn"]).toBe(sample.vars.warn);
    expect(subTokens["--fm-status-danger"]).toBe(sample.vars.danger);
    expect(subTokens["--fm-status-info"]).toBe(sample.vars.info);
  });

  test("DEFAULT_FAVORITE_THEMES curates 10 balanced Flagship Master themes across all 4 hardware tiers and Dark/Light with 1:1 parity", () => {
    expect(DEFAULT_FAVORITE_THEMES.length).toBe(10);
    expect(new Set(DEFAULT_FAVORITE_THEMES).size).toBe(
      DEFAULT_FAVORITE_THEMES.length,
    );
    expect(DEFAULT_FAVORITE_THEME_IDS).toEqual(DEFAULT_FAVORITE_THEMES);
    expect(SETTINGS_DEFAULT_FAVORITE_THEME_IDS).toEqual(
      DEFAULT_FAVORITE_THEMES,
    );
    expect([...FE_DEFAULT_FAVORITE_THEMES]).toEqual([
      ...DEFAULT_FAVORITE_THEMES,
    ]);
    expect(DEFAULT_SETTINGS.favoriteThemes).toEqual([
      ...DEFAULT_FAVORITE_THEMES,
    ]);

    const summaries = DEFAULT_FAVORITE_THEMES.map((k) => {
      expect(k).toMatch(/^ccfm_[a-z0-9_]+$/);
      const full = getThemeColours(k);
      expect(full, `default favorite ${k} must exist`).not.toBeNull();
      return full!;
    });

    const darkFavs = summaries.filter((t) => t.dark);
    const lightFavs = summaries.filter((t) => !t.dark);
    expect(darkFavs.length).toBeGreaterThanOrEqual(4);
    expect(lightFavs.length).toBeGreaterThanOrEqual(4);

    // Every hardware tier (ultra, high, medium, low) has both Dark and Light representation in Default Favorites
    for (const hwTier of ["ultra", "high", "medium", "low"] as const) {
      const inTier = summaries.filter((t) => t.hardwareTier === hwTier);
      expect(inTier.length, `default favorites tier ${hwTier}`).toBeGreaterThan(
        0,
      );
      expect(
        inTier.some((t) => t.dark),
        `default favorites tier ${hwTier} dark`,
      ).toBe(true);
      expect(
        inTier.some((t) => !t.dark),
        `default favorites tier ${hwTier} light`,
      ).toBe(true);
    }

    // Includes both GPU FX shaders and 0% GPU static themes
    expect(summaries.some((t) => t.hasEffects)).toBe(true);
    expect(summaries.some((t) => !t.hasEffects)).toBe(true);
  });

  test("sanitizeSettings, loadSettings, and updateSettings seed DEFAULT_FAVORITE_THEMES on fresh profiles while preserving explicit empty []", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "fm-default-favs-"));
    try {
      const ctx = createContext({
        home: join(tmp, "home"),
        dataDir: join(tmp, "data"),
      });

      // Fresh / omitted / non-array favoriteThemes seed DEFAULT_FAVORITE_THEMES
      expect(sanitizeSettings({}, ctx).favoriteThemes).toEqual([
        ...DEFAULT_FAVORITE_THEMES,
      ]);
      expect(
        sanitizeSettings({ favoriteThemes: undefined }, ctx).favoriteThemes,
      ).toEqual([...DEFAULT_FAVORITE_THEMES]);
      expect(
        sanitizeSettings({ favoriteThemes: "corrupt" }, ctx).favoriteThemes,
      ).toEqual([...DEFAULT_FAVORITE_THEMES]);
      expect(await loadSettings(ctx)).toEqual(DEFAULT_SETTINGS);

      // Explicit empty array [] (user unpinned all favorites) is preserved across normalization & partial updates
      expect(sanitizeSettings({ favoriteThemes: [] }, ctx).favoriteThemes).toEqual(
        [],
      );
      const cleared = await updateSettings(ctx, { favoriteThemes: [] });
      expect(cleared.favoriteThemes).toEqual([]);
      expect((await loadSettings(ctx)).favoriteThemes).toEqual([]);

      const afterUnrelatedPatch = await updateSettings(ctx, { theme: "dark" });
      expect(afterUnrelatedPatch.theme).toBe("dark");
      expect(afterUnrelatedPatch.favoriteThemes).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("frontend favoriteKeys, favoriteThemes, and themeMenuItems immediately surface Flagship Master Favorites while respecting explicit []", async () => {
    const prevSettings = uiState.settings;
    try {
      // Before settings load (undefined favoriteThemes), fallback returns DEFAULT_FAVORITE_THEMES
      uiState.settings = { theme: "auto", palette: "" } as any;
      expect(favoriteKeys()).toEqual([...DEFAULT_FAVORITE_THEMES]);
      expect(favoriteThemeKeys()).toEqual([...DEFAULT_FAVORITE_THEMES]);

      const resolvedFavs = await favoriteThemes();
      expect(resolvedFavs.map((t: any) => t.key)).toEqual([
        ...DEFAULT_FAVORITE_THEMES,
      ]);

      const menuItems = await themeMenuItems();
      const headers = menuItems
        .filter((i: any) => i.header)
        .map((i: any) => i.header);
      expect(headers).toContain("Favorites");

      const labels = menuItems.map((i: any) => i.label).filter(Boolean);
      for (const fav of resolvedFavs) {
        expect(labels).toContain(fav.name);
      }

      // High-tier Master themes receive the 💎 High menu badge alongside Ultra, FX, and Plain
      const badges = menuItems.map((i: any) => i.shortcut).filter(Boolean);
      expect(badges).toContain("🌙 Dark · 🚀 Ultra");
      expect(badges).toContain("🌙 Dark · 💎 High");
      expect(badges).toContain("☀️ Light · 🚀 Ultra");
      expect(badges).toContain("☀️ Light · ⏹ Plain");

      // Explicit empty array [] hides Favorites from menu non-destructively
      uiState.settings = {
        theme: "auto",
        palette: "",
        favoriteThemes: [],
      } as any;
      expect(favoriteKeys()).toEqual([]);
      expect(await favoriteThemes()).toEqual([]);
      const emptyMenuItems = await themeMenuItems();
      expect(emptyMenuItems.some((i: any) => i.header === "Favorites")).toBe(
        false,
      );
    } finally {
      uiState.settings = prevSettings;
    }
  });
});
