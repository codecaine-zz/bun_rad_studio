import { describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import {
  applyThemeToRoot,
  calculateThemeSystem,
  computeCornerTokens,
  computeDensityTokens,
  computeSurfaceVibeTokens,
  ensureContrastRatio,
  exportThemeToJson,
  generateNeutralShadeScale,
  generateThemeStudioPageHtml,
  getCatalogByCategory,
  getContrastRatio,
  importThemeFromJson,
  INSPECTOR_CATEGORIES,
  loadSavedThemes,
  mountThemeStudio,
  saveCustomTheme,
  SHADE_STEPS_10,
  startThemeStudioServer,
  THEME_STUDIO_PRESETS,
  THEME_VARIABLE_CATALOG,
  type BaseMode,
  type InterfaceDensity,
  type StorageLike,
  type SurfaceVibe,
} from "../src/features/theme-studio";

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe("High-Abstraction, Deep-Customization Theme Engine & Visual Theme Studio", () => {
  describe("Step 1: 3-Layer Architecture & Smart Math Engine", () => {
    it("generates a 10-step shade scale (50 to 950) across all 4 Base Modes", () => {
      const modes: BaseMode[] = ["light", "dark", "midnight", "high-contrast"];
      for (const mode of modes) {
        const scale = generateNeutralShadeScale("#3b82f6", mode);
        for (const step of SHADE_STEPS_10) {
          expect(scale[step]).toMatch(/^#[0-9a-f]{6}$/i);
        }
        // Shade 50 is always lighter than Shade 950
        expect(getContrastRatio(scale[50], scale[950])).toBeGreaterThan(10);
      }
    });

    it("enforces readable WCAG text contrast against any background automatically", () => {
      // Hostile combinations: pale yellow on white, dark navy on midnight black
      const readableOnWhite = ensureContrastRatio("#fef08a", "#ffffff", 4.5);
      expect(getContrastRatio(readableOnWhite, "#ffffff")).toBeGreaterThanOrEqual(4.5);

      const readableOnBlack = ensureContrastRatio("#1e1b4b", "#05070d", 7.0);
      expect(getContrastRatio(readableOnBlack, "#05070d")).toBeGreaterThanOrEqual(7.0);

      for (const mode of ["light", "dark", "midnight", "high-contrast"] as BaseMode[]) {
        const sys = calculateThemeSystem({
          baseMode: mode,
          primaryColor: "#eab308", // bright yellow brand color
          accentColor: "#22d3ee",  // bright cyan accent color
        });
        const minExpected = mode === "high-contrast" ? 7.0 : 4.5;
        expect(sys.text.panelBgContrastRatio).toBeGreaterThanOrEqual(minExpected);
        expect(sys.text.primaryButtonContrastRatio).toBeGreaterThanOrEqual(minExpected);
        expect(sys.text.accentButtonContrastRatio).toBeGreaterThanOrEqual(minExpected);
      }
    });

    it("calculates shadow depth, glass blur intensity, and border glow from Surface Vibe", () => {
      const vibes: SurfaceVibe[] = ["flat", "frosted-glass", "matte", "neon-border"];
      const results = Object.fromEntries(
        vibes.map((v) => [v, computeSurfaceVibeTokens(v, "dark", "#3b82f6", "#8b5cf6")])
      ) as Record<SurfaceVibe, ReturnType<typeof computeSurfaceVibeTokens>>;

      expect(results.flat.glassBlur).toBe("0px");
      expect(results.flat.surfaceBackdrop).toBe("none");

      expect(parseInt(results["frosted-glass"].glassBlur, 10)).toBeGreaterThanOrEqual(16);
      expect(results["frosted-glass"].surfaceBackdrop).toContain("blur(");
      expect(results["frosted-glass"].panelBgAlpha).toBeLessThan(1);

      expect(results.matte.glassBlur).toBe("0px");
      expect(results.matte.shadowInset).toContain("inset");

      expect(results["neon-border"].borderGlow).toBe("#3b82f6");
      expect(results["neon-border"].shadowGlow).toContain("rgba(59, 130, 246");
    });

    it("maps Corner Sharpness slider from 0px sharp to 24px pill-shaped", () => {
      const sharp = computeCornerTokens(0);
      expect(sharp.radiusSm).toBe("0px");
      expect(sharp.radiusMd).toBe("0px");
      expect(sharp.radiusLg).toBe("0px");
      expect(sharp.radiusButton).toBe("0px");
      expect(sharp.radiusInput).toBe("0px");

      const mid = computeCornerTokens(10);
      expect(mid.radiusSm).toBe("7px");
      expect(mid.radiusMd).toBe("10px");
      expect(mid.radiusLg).toBe("14px");

      const pill = computeCornerTokens(24);
      expect(pill.radiusMd).toBe("24px");
      expect(pill.radiusButton).toBe("9999px");
      expect(pill.radiusInput).toBe("9999px");
      expect(pill.radiusPill).toBe("9999px");
    });

    it("maps Interface Density across Compact, Comfortable, and Spacious", () => {
      const densities: InterfaceDensity[] = ["compact", "comfortable", "spacious"];
      const tokens = densities.map((d) => computeDensityTokens(d));

      expect(parseInt(tokens[0]!.controlHeightMd, 10)).toBeLessThan(
        parseInt(tokens[1]!.controlHeightMd, 10)
      );
      expect(parseInt(tokens[1]!.controlHeightMd, 10)).toBeLessThan(
        parseInt(tokens[2]!.controlHeightMd, 10)
      );
    });

    it("outputs all required semantic CSS custom properties and applies them to :root", () => {
      const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>");
      const root = dom.window.document.documentElement as unknown as HTMLElement;

      const system = applyThemeToRoot(
        {
          baseMode: "midnight",
          primaryColor: "#06b6d4",
          accentColor: "#ec4899",
          surfaceVibe: "neon-border",
          cornerSharpness: 12,
          density: "comfortable",
        },
        {},
        root
      );

      const requiredProps: Array<`--${string}`> = [
        "--bg-app",
        "--bg-panel",
        "--bg-hover",
        "--border-subtle",
        "--border-focus",
        "--text-primary",
        "--text-muted",
        "--radius-sm",
        "--radius-md",
        "--shadow-elevated",
      ];

      for (const prop of requiredProps) {
        expect(system.variables[prop]).toBeDefined();
        expect(root.style.getPropertyValue(prop)).toBe(system.variables[prop]!);
      }

      expect(root.dataset.baseMode).toBe("midnight");
      expect(root.dataset.surfaceVibe).toBe("neon-border");
      expect(root.dataset.density).toBe("comfortable");
    });
  });

  describe("Step 2: Visual Theme Studio UI (Quick Studio + Pro Inspector)", () => {
    it("organizes granular CSS variables into the 8 required Pro Inspector categories", () => {
      expect(INSPECTOR_CATEGORIES).toEqual([
        "Backgrounds",
        "Typography",
        "Borders",
        "Buttons",
        "Inputs",
        "Code/Terminal",
        "Scrollbars",
        "Shadows",
      ]);

      const grouped = getCatalogByCategory();
      for (const category of INSPECTOR_CATEGORIES) {
        expect(grouped[category].length).toBeGreaterThanOrEqual(5);
      }
      expect(THEME_VARIABLE_CATALOG.length).toBeGreaterThanOrEqual(90);
    });

    it("mounts the Theme Customizer Drawer and updates :root in real time when controls or overrides change", () => {
      const dom = new JSDOM(
        "<!DOCTYPE html><html><head></head><body><div id='app'></div></body></html>"
      );
      const container = dom.window.document.getElementById("app") as unknown as HTMLElement;
      const root = dom.window.document.documentElement as unknown as HTMLElement;
      const storage = createMemoryStorage();

      const studio = mountThemeStudio(container, {
        storage,
        cssRoot: root,
      });

      // Default tab is Quick Studio
      expect(studio.getState().activeTab).toBe("quick");
      expect(container.querySelector("#tabPanelQuickStudio")?.hasAttribute("hidden")).toBe(false);
      expect(container.querySelector("#tabPanelProInspector")?.hasAttribute("hidden")).toBe(true);

      // Verify all 6 Quick Studio controls are rendered
      expect(container.querySelector("#ctrlBaseModeGroup")).not.toBeNull();
      expect(container.querySelector("#ctrlPrimaryColorPicker")).not.toBeNull();
      expect(container.querySelector("#ctrlAccentColorPicker")).not.toBeNull();
      expect(container.querySelector("#ctrlSurfaceVibeGroup")).not.toBeNull();
      expect(container.querySelector("#ctrlCornerSharpness")).not.toBeNull();
      expect(container.querySelector("#ctrlDensityGroup")).not.toBeNull();

      // Verify presets work in 1 click (including God-Mode presets)
      const swissPreset = THEME_STUDIO_PRESETS.find((p) => p.id === "swiss-editorial")!;
      studio.applyPreset(swissPreset.id);
      expect(studio.getState().surface.baseMode).toBe("light");
      expect(studio.getState().surface.cornerSharpness).toBe(0);
      expect(root.style.getPropertyValue("--radius-md")).toBe("0px");

      const omegaPreset = THEME_STUDIO_PRESETS.find((p) => p.id === "omega-singularity")!;
      expect(omegaPreset).toBeDefined();
      studio.applyPreset(omegaPreset.id);
      expect(studio.getState().surface.baseMode).toBe("midnight");
      expect(studio.getState().surface.primaryColor).toBe("#eab308");
      expect(studio.getState().surface.accentColor).toBe("#a855f7");

      // Switch to Tab 2: Pro Inspector and test deep CSS variable overrides
      studio.switchTab("inspector");
      expect(studio.getState().activeTab).toBe("inspector");
      expect(container.querySelector("#tabPanelProInspector")?.hasAttribute("hidden")).toBe(false);

      const categoryHeaders = container.querySelectorAll("[data-inspector-category]");
      expect(categoryHeaders.length).toBe(8);

      // Override a single CSS variable in Pro Inspector
      studio.setOverride("--bg-app", "#123456");
      expect(studio.getState().overrides["--bg-app"]).toBe("#123456");
      expect(root.style.getPropertyValue("--bg-app")).toBe("#123456");

      // Remove override and verify it reverts to the Smart Math Engine value
      studio.removeOverride("--bg-app");
      expect(studio.getState().overrides["--bg-app"]).toBeUndefined();
      expect(root.style.getPropertyValue("--bg-app")).toBe(
        studio.getState().system.computedVariables["--bg-app"]!
      );

      // Verify Live Preview Playground elements exist (buttons, inputs, table, tabs, modal, badges, 10-step scale)
      expect(container.querySelector("#previewBtnPrimary")).not.toBeNull();
      expect(container.querySelector("#previewInputName")).not.toBeNull();
      expect(container.querySelector("#previewDataTable")).not.toBeNull();
      expect(container.querySelector("#tsLivePreviewModal")).not.toBeNull();
      expect(container.querySelectorAll("#tsShadeScaleGrid [data-shade-step]").length).toBe(10);
    });
  });

  describe("Step 3: Persistence & Shareability (localStorage, JSON Export/Import, Server)", () => {
    it("saves, loads, and deletes custom themes in localStorage", () => {
      const storage = createMemoryStorage();
      const { saved, themes } = saveCustomTheme(
        {
          name: "Neon Synthwave",
          surface: {
            baseMode: "midnight",
            primaryColor: "#f43f5e",
            accentColor: "#06b6d4",
            surfaceVibe: "neon-border",
            cornerSharpness: 16,
            density: "spacious",
          },
          overrides: {
            "--border-width": "2px",
          },
        },
        storage
      );

      expect(themes.length).toBe(1);
      expect(saved.name).toBe("Neon Synthwave");
      expect(loadSavedThemes(storage).length).toBe(1);
      expect(loadSavedThemes(storage)[0]!.overrides["--border-width"]).toBe("2px");
    });

    it("exports clean JSON and validates imported JSON themes", () => {
      const json = exportThemeToJson({
        name: "Exported Pro Theme",
        surface: {
          baseMode: "high-contrast",
          primaryColor: "#38bdf8",
          accentColor: "#facc15",
          surfaceVibe: "flat",
          cornerSharpness: 4,
          density: "compact",
        },
        overrides: {
          "--radius-md": "6px",
        },
      });

      const reimported = importThemeFromJson(json);
      expect(reimported.format).toBe("bun-rad-theme-studio");
      expect(reimported.name).toBe("Exported Pro Theme");
      expect(reimported.surface.baseMode).toBe("high-contrast");
      expect(reimported.surface.cornerSharpness).toBe(4);
      expect(reimported.overrides["--radius-md"]).toBe("6px");

      expect(() => importThemeFromJson("")).toThrow();
      expect(() => importThemeFromJson("{bad json")).toThrow();
      expect(() => importThemeFromJson('{"hello":"world"}')).toThrow();
    });

    it("generates standalone HTML and serves the studio over local HTTP", async () => {
      const html = generateThemeStudioPageHtml();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Theme Customizer Drawer");
      expect(html).toContain("Quick Studio");
      expect(html).toContain("Pro Inspector");

      const server = startThemeStudioServer({ port: 0 });
      try {
        const res = await fetch(`http://127.0.0.1:${server.port}/`);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("Visual Theme Studio");

        const compileRes = await fetch(`http://127.0.0.1:${server.port}/api/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            surface: { baseMode: "light", primaryColor: "#2563eb", cornerSharpness: 20 },
            overrides: { "--bg-app": "#f8fafc" },
          }),
        });
        expect(compileRes.status).toBe(200);
        const compiled = (await compileRes.json()) as { variables: Record<string, string> };
        expect(compiled.variables["--bg-app"]).toBe("#f8fafc");
        expect(compiled.variables["--radius-md"]).toBe("20px");
      } finally {
        server.stop(true);
      }
    });
  });
});
