import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
  createWindow,
  getTheme,
  SIMPLEGUI_THEMES,
  VLANG_THEME_NAMES,
} from "../src/simplegui.ts";
import { DEFAULT_FAVORITE_SIMPLEGUI_THEMES } from "../src/shared/simpleguiThemes.ts";
import { UI_CLIENT_HTML } from "../src/simplegui_components.ts";
import { DIALOG_CLIENT_HTML } from "../src/simplegui_dialogs.ts";
import {
  createThemeShowcase,
  getShowcaseThemeCatalog,
} from "../demos/23_all_themes_all_controls_showcase.ts";

function extractStyleById(html: string, id: string): string {
  const re = new RegExp(`<style[^>]*id="${id}"[^>]*>([\\s\\S]*?)</style>`);
  const m = html.match(re);
  return m ? m[1]! : "";
}

describe("SimpleGUI Studio Control Polish, Chrome & Theme Rendering", () => {
  test("1. Studio polish stylesheet & color-mix semantic tokens render across Dark, Light, OS & FX themes", () => {
    const sampleThemes = [
      { key: "midnight", dark: true, fx: false },
      { key: "apple_light", dark: false, fx: false },
      { key: "nordic_paper", dark: false, fx: false },
      { key: "win95", dark: false, fx: false },
      { key: "ubuntu_dark", dark: true, fx: false },
      { key: "cyberpunk_hologram", dark: true, fx: true },
    ];

    for (const item of sampleThemes) {
      const win = createWindow("Studio Polish Check", 640, 480, {
        theme: item.key,
      });
      win.addButton("Primary", () => {}).id("btnPri");
      win
        .addButton("Danger", () => {}, { variant: "danger" })
        .id("btnDanger");
      win.addTextInput("Search...").id("inpSearch");
      const html = win.generateHtml();

      const polishCss = extractStyleById(html, "simplegui-studio-polish");
      expect(polishCss.length, `missing polish style for ${item.key}`).toBeGreaterThan(500);
      expect(polishCss).toContain("--sg-radius-md");
      expect(polishCss).toContain("--sg-hairline");
      expect(polishCss).toContain("--sg-focus-ring");
      expect(polishCss).toContain("--sg-focus-glow");
      expect(polishCss).toContain("--sg-specular-top");
      expect(polishCss).toContain("--sg-shadow-lg");
      expect(polishCss).toContain("color-mix(in srgb");

      // Polarity-calibrated specular rim: brighter white rim on light themes, subtler rim on dark themes
      if (item.dark) {
        expect(polishCss).toContain("--sg-specular-top: rgba(255, 255, 255, 0.16)");
      } else {
        expect(polishCss).toContain("--sg-specular-top: rgba(255, 255, 255, 0.72)");
      }

      // Linux color-scheme rule remains strictly scoped to html.rad-linux
      expect(html).not.toMatch(/^\s*html \{ color-scheme/m);

      // Non-FX pages must remain 100% clean of any FX markers
      if (!item.fx) {
        expect(html).not.toContain("data-fx");
        expect(html).not.toContain("simplegui-fx");
        expect(html).not.toContain("--fx-");
        expect(html).not.toContain("__fxPointer");
      } else {
        expect(html).toContain("data-fx-backdrop");
      }
    }
  });

  test("2. Button variants, inputs, sticky data tables, scrollbars, focus-visible & prefers-reduced-motion rules", () => {
    const win = createWindow("Controls CSS Audit", 800, 600, {
      theme: "tokyo_night",
    });
    win.addButton("Save", () => {}).id("btnSave");
    win
      .addButton("Delete", () => {}, { variant: "danger" })
      .id("btnDelete");
    win
      .addButton("Ghost", () => {}, { variant: "ghost" })
      .id("btnGhost");
    win.addTextInput("Enter name...").id("txtName");
    win.addSlider(0, 100, 50).id("sldLevel");
    win.addSwitch("Enable", true).id("swtEnable");
    win.addTable(["Col A", "Col B"], [["1", "2"]]).id("tblAudit");

    const html = win.generateHtml();
    const polishCss = extractStyleById(html, "simplegui-studio-polish");

    // Button variants & specular / tactile states
    expect(polishCss).toContain("button.btn-theme-accent");
    expect(polishCss).toContain('button[data-variant="danger"]');
    expect(polishCss).toContain('button[data-variant="ghost"]');
    expect(polishCss).toContain('button[data-variant="secondary"]');
    expect(polishCss).toContain("button:disabled");

    // Unmistakable accessibility :focus-visible ring
    expect(polishCss).toContain("button:focus-visible");
    expect(polishCss).toContain("[role=\"tab\"]:focus-visible");
    expect(polishCss).toContain("outline: 2px solid var(--sg-focus-ring");

    // Inputs, placeholders, sliders, switches & steppers
    expect(html).toContain(
      "input::placeholder, textarea::placeholder { color: var(--theme-muted)",
    );
    expect(polishCss).toContain('input[type="range"]::-webkit-slider-thumb');
    expect(polishCss).toContain('input[type="range"]::-moz-range-thumb');

    // Sticky table headers, zebra striping, hover & selected row subtlety
    expect(polishCss).toContain("table thead th");
    expect(polishCss).toContain("position: sticky");
    expect(polishCss).toContain("tbody tr:nth-child(even)");
    expect(polishCss).toContain("tbody tr.selected-tr");

    // Polished scrollbars & strict prefers-reduced-motion support
    expect(polishCss).toContain("::-webkit-scrollbar-thumb");
    expect(polishCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("3. Enterprise UI_CLIENT_HTML & DIALOG_CLIENT_HTML honor theme variables, dark select options & reduced motion", () => {
    const sguCss = extractStyleById(UI_CLIENT_HTML, "sgu-style");
    expect(sguCss).toContain("var(--card-bg");
    expect(sguCss).toContain("var(--input-bg");
    expect(sguCss).toContain("color-mix(in srgb");
    expect(sguCss).toContain(":focus-visible");
    expect(sguCss).toContain("@media (prefers-reduced-motion:reduce)");
    expect(sguCss).not.toContain("--fx-");
    expect(sguCss).not.toContain("data-fx");

    const sgdCss = extractStyleById(DIALOG_CLIENT_HTML, "sgd-style");
    // Regression guard: dialog <select> options must inherit dialog foreground/background in dark & light themes
    expect(sgdCss).toContain(
      "select.sgd-input option,select.sgd-input optgroup{color:var(--sgd-fg,#e2e8f0);background:var(--sgd-bg,#1e293b)}",
    );
    expect(sgdCss).not.toContain("color:#111827;background:#fff");
    expect(sgdCss).toContain(".sgd-btn:focus-visible");
    expect(sgdCss).toContain(".sgd-close:focus-visible");
    expect(sgdCss).toContain("@media (prefers-reduced-motion:reduce)");
    expect(sgdCss).not.toContain("--fx-");
    expect(sgdCss).not.toContain("data-fx");

    // Both embedded client scripts must parse cleanly with zero syntax or template errors
    const sguJs = UI_CLIENT_HTML.match(
      /<script id="sgu-script">([\s\S]*?)<\/script>/,
    )![1]!;
    const sgdJs = DIALOG_CLIENT_HTML.match(
      /<script id="sgd-script">([\s\S]*?)<\/script>/,
    )![1]!;
    expect(() => new Function(sguJs)).not.toThrow();
    expect(() => new Function(sgdJs)).not.toThrow();
    expect(sgdJs).toContain("--card-border");
    expect(sgdJs).toContain("--input-bg");
    expect(sgdJs).toContain("--theme-muted");
  });

  test("4. Live setTheme() updates studio elevation tokens, showcase metadata hook & dynamic addThemeSelector discovery", () => {
    const win: any = createThemeShowcase("tokyo_night");
    const evalCalls: string[] = [];
    win.isWindowRunning = true;
    win.evalJS = (code: string) => {
      evalCalls.push(code);
    };

    win.setTheme("nordic_paper", false);
    expect(evalCalls.length).toBeGreaterThan(0);
    const rethemeJs = evalCalls[0]!;
    expect(() => new Function(rethemeJs)).not.toThrow();
    expect(rethemeJs).toContain("--sg-specular-top");
    expect(rethemeJs).toContain("--sg-shadow-lg");
    expect(rethemeJs).toContain("__sgSyncShowcaseThemeMeta");
    expect(rethemeJs).toContain("Nordic Paper Light");

    // Dynamic discovery of newly added SIMPLEGUI_THEMES entries without touching VLANG_THEME_NAMES
    const vlangSnapshot = [...VLANG_THEME_NAMES];
    const tempKey = "synthetic_aurora_studio_test";
    SIMPLEGUI_THEMES[tempKey] = {
      name: "Synthetic Aurora Studio Test",
      short_name: "SynAurora",
      is_dark: true,
      background_color: "#0b1020",
      font_color: "#e2e8f0",
      accent_color: "#38bdf8",
      secondary_accent: "#a855f7",
      card_background: "#131c31",
      card_border: "rgba(148,163,184,0.22)",
      description: "Temporary synthetic theme for dynamic discovery test",
    };

    try {
      const testWin = createWindow("Selector Check", 500, 300, {
        theme: "midnight",
      });
      testWin.addThemeSelector("dd_dyn_short", "Theme:", false, 180, true);
      testWin.addThemeSelector("dd_dyn_full", "Full:", false, 180, false);
      const selectorHtml = testWin.generateHtml();
      expect(selectorHtml).toContain(tempKey);
      expect(selectorHtml).toContain("SynAurora");
      expect(selectorHtml).toContain("Synthetic Aurora Studio Test");

      const catalog = getShowcaseThemeCatalog();
      expect(catalog.entries.some((e) => e.key === tempKey)).toBe(true);
      expect(VLANG_THEME_NAMES).toEqual(vlangSnapshot);
    } finally {
      delete SIMPLEGUI_THEMES[tempKey];
      // Refresh memoized showcase catalog after cleanup
      getShowcaseThemeCatalog();
    }
  });

  test("5. All Themes & Controls Showcase surfaces every unique SIMPLEGUI_THEMES entry, live swatches/tiers & synthetic-only data", () => {
    const catalog = getShowcaseThemeCatalog();
    const uniqueThemeNames = new Set(
      Object.values(SIMPLEGUI_THEMES).map((t) => t.name),
    );
    expect(catalog.total).toBe(uniqueThemeNames.size);
    expect(catalog.darkCount + catalog.lightCount).toBe(catalog.total);
    expect(catalog.osCount).toBeGreaterThan(5);
    expect(catalog.fxCount).toBeGreaterThan(5);

    // Check dark, light, OS, and FX showcase renders
    const fxShowcase = createThemeShowcase("cyberpunk_hologram");
    const fxHtml = fxShowcase.generateHtml();
    const fxTheme = getTheme("cyberpunk_hologram");
    expect(fxHtml).toContain("sg_showcase_strip");
    expect(fxHtml).toContain("FX Shader");
    expect(fxHtml).toContain(fxTheme.accent_color);
    expect(fxHtml).toContain(`All (${catalog.total})`);
    expect(fxHtml).toContain(`FX (${catalog.fxCount})`);

    const osShowcase = createThemeShowcase("win95");
    const osHtml = osShowcase.generateHtml();
    expect(osHtml).toContain("OS &amp; Heritage");

    const lightShowcase = createThemeShowcase("nordic_paper");
    const lightHtml = lightShowcase.generateHtml();
    expect(lightHtml).toContain("Studio Light");

    // Verify every canonical theme key appears in the interactive gallery rail
    for (const entry of catalog.entries) {
      expect(lightHtml).toContain(`data-theme-key="${entry.key}"`);
    }

    // Verify inline showcase script parses cleanly
    const stripScripts = [
      ...lightHtml.matchAll(/<script>([\s\S]*?)<\/script>/g),
    ].map((m) => m[1]!);
    expect(stripScripts.length).toBeGreaterThan(0);
    for (const sc of stripScripts) {
      expect(() => new Function(sc)).not.toThrow();
    }

    // Privacy & synthetic demo data check (zero personal usernames or /Users/ paths)
    const pathWin = createWindow("Path Default Check", 500, 200);
    pathWin.addPathControl("pcDefault", []);
    const combinedHtml = fxHtml + "\n" + pathWin.generateHtml();
    expect(combinedHtml.toLowerCase()).not.toContain("codecaine");
    expect(combinedHtml).not.toContain("/Users/");
  });

  test("6. Showcase ★ Favorites filter rail defaults to the 12 Master themes and supports interactive star toggling", () => {
    const catalog = getShowcaseThemeCatalog();
    expect(catalog.favoritesCount).toBe(12);
    expect(catalog.entries.slice(0, 12).map((e) => e.key)).toEqual(
      DEFAULT_FAVORITE_SIMPLEGUI_THEMES,
    );

    const defaultShowcase = createThemeShowcase();
    expect(defaultShowcase.theme).toBe(DEFAULT_FAVORITE_SIMPLEGUI_THEMES[0]!);
    const html = defaultShowcase.generateHtml();
    expect(html).toContain(`★ Favorites (12)`);

    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "http://localhost/",
    });
    const doc = dom.window.document;

    const favFilterBtn = doc.getElementById("sg_flt_favorites")!;
    expect(favFilterBtn).toBeTruthy();
    expect(favFilterBtn.classList.contains("is-on")).toBe(true);
    expect(favFilterBtn.textContent).toBe("★ Favorites (12)");

    const visibleKeys = () =>
      [...doc.querySelectorAll<HTMLElement>("#sg_gal_rail .sg-gal-pill")]
        .filter((el) => el.style.display !== "none")
        .map((el) => el.getAttribute("data-theme-key")!);

    // Out-of-the-box: the 12 flagship Master themes are surfaced front-and-center
    expect(visibleKeys()).toEqual(DEFAULT_FAVORITE_SIMPLEGUI_THEMES);

    // Active theme pin button reflects favorite status and toggles cleanly
    const activeFavBtn = doc.getElementById("sg_toggle_active_fav")!;
    expect(activeFavBtn.getAttribute("aria-pressed")).toBe("true");
    expect(activeFavBtn.textContent).toBe("★ Favorited");

    activeFavBtn.click();
    expect(activeFavBtn.getAttribute("aria-pressed")).toBe("false");
    expect(activeFavBtn.textContent).toBe("☆ Favorite");
    expect(favFilterBtn.textContent).toBe("★ Favorites (11)");
    expect(visibleKeys()).not.toContain(DEFAULT_FAVORITE_SIMPLEGUI_THEMES[0]!);

    // Re-pinning restores all 12 favorites
    activeFavBtn.click();
    expect(favFilterBtn.textContent).toBe("★ Favorites (12)");
    expect(visibleKeys()).toEqual(DEFAULT_FAVORITE_SIMPLEGUI_THEMES);

    // Switching to All filter shows all catalog entries; clicking a chip's star pins a non-default theme
    const allFilterBtn = doc.querySelector<HTMLElement>(
      '.sg-flt-btn[data-filter="all"]',
    )!;
    allFilterBtn.click();
    expect(visibleKeys().length).toBe(catalog.total);

    const tokyoStar = doc.querySelector<HTMLElement>(
      '.sg-gal-pill[data-theme-key="tokyo_night"] [data-fav-star]',
    )!;
    expect(tokyoStar.textContent).toBe("☆");
    tokyoStar.click();
    expect(tokyoStar.textContent).toBe("★");
    expect(favFilterBtn.textContent).toBe("★ Favorites (13)");

    favFilterBtn.click();
    expect(visibleKeys().length).toBe(13);
    expect(visibleKeys()).toContain("tokyo_night");

    dom.window.close();
  });
});
