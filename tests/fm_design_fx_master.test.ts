import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const UI_DIR = join(ROOT, "resources", "file_manager", "ui");

const styleCss = readFileSync(join(UI_DIR, "style.css"), "utf8");
const viewsCss = readFileSync(join(UI_DIR, "views.css"), "utf8");
const themeEffectsCss = readFileSync(join(UI_DIR, "themeEffects.css"), "utf8");
const themeMenuSrc = readFileSync(join(UI_DIR, "themeMenu.js"), "utf8");
const themeEditorSrc = readFileSync(join(UI_DIR, "themeEditor.js"), "utf8");

describe("Codecaine File Manager Master Design, Chrome & Shader/FX Suite", () => {
  test("1. Core Chrome, Specular Highlights, Tactile Controls & Typography (style.css & views.css)", () => {
    // Specular 1px top-edge light catch & tactile press states
    expect(styleCss).toContain(".tool:active:not(:disabled)");
    expect(styleCss).toContain(".btn:active:not(:disabled)");
    expect(viewsCss).toContain(".vb-btn:active");
    expect(styleCss).toMatch(/#toolbar\s*\{[^}]*box-shadow:\s*inset 0 1px 0/);
    expect(viewsCss).toMatch(/#viewbar\s*\{[^}]*box-shadow:\s*inset 0 1px 0/);

    // Breadcrumb chip, active sidebar pill, and studio folder tabs
    expect(styleCss).toMatch(/\.crumb\.current\s*\{[^}]*background:/);
    expect(styleCss).toMatch(
      /\.side-item\.active\s*\{[^}]*inset 3px 0 0 0 var\(--accent\)/,
    );
    expect(viewsCss).toMatch(
      /\.fm-tab\.active\s*\{[^}]*inset 0 2px 0 0 var\(--accent\)/,
    );

    // Tabular numeric alignment on sizes, dates, badges, shortcuts & status bar
    expect(styleCss).toMatch(
      /\.row \.c-date,\s*\.row \.c-size\s*\{\s*font-variant-numeric:\s*tabular-nums;/,
    );
    expect(styleCss).toMatch(
      /#status\s*\{[^}]*font-variant-numeric:\s*tabular-nums/,
    );
    expect(styleCss).toMatch(
      /\.menu-shortcut\s*\{[^}]*font-variant-numeric:\s*tabular-nums/,
    );

    // Floating glass selection action bar preserves layout stability invariants
    expect(viewsCss).toMatch(/\.selection-bar\s*\{[^}]*position:\s*absolute/);
    expect(viewsCss).toMatch(/\.selection-bar\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(styleCss).toMatch(
      /#list\.view-list,\s*#dual-list\.view-list\s*\{\s*display:\s*grid;/,
    );
  });

  test("2. Unmistakable Single-Select, Multi-Select, Hover & Keyboard :focus-visible States", () => {
    // Contiguous multi-select stack polish in Details view
    expect(styleCss).toContain(".view-details .row.selected + .row.selected");
    expect(styleCss).toContain(
      ".view-details .row.selected:has(+ .row.selected)",
    );

    // Selected + focused ring uses high-contrast --selected-text inside accent bar
    expect(styleCss).toContain(".row.selected.focused");
    expect(styleCss).toContain(".row:focus-visible");
    expect(styleCss).toContain(".tool:focus-visible");
    expect(styleCss).toContain(".btn:focus-visible");
    expect(styleCss).toContain(".side-item:focus-visible");
    expect(viewsCss).toContain(".vb-btn:focus-visible");
    expect(viewsCss).toContain(".status-view:focus-visible");
    expect(viewsCss).toContain(".home-tile:focus-visible");

    // Icons grid card elevation & top accent selection bar
    expect(styleCss).toContain(".view-icons .row.selected");
    expect(styleCss).toContain(".view-icons .row.selected .name-text");
    expect(styleCss).toContain(".view-list .row.selected .name-text");
  });

  test("3. Multi-Stop Studio Theme Swatches, Glows, Borders & Non-Overlapping Quick Actions", () => {
    // Multi-stop spectrum ribbon (::after) and specular glass sheen (::before)
    expect(styleCss).toContain(".theme-swatch::before");
    expect(styleCss).toContain(".theme-swatch::after");
    expect(styleCss).toContain("--sw-bg");
    expect(styleCss).toContain("--sw-panel");
    expect(styleCss).toContain("--sw-selected");
    expect(styleCss).toContain("--sw-accent");
    expect(styleCss).toContain("--sw-glow");

    // Every data-sw-glow and data-sw-border variant styled
    for (const glow of [
      "soft",
      "neon",
      "bloom",
      "aurora",
      "ember",
      "plasma",
      "laser",
    ]) {
      expect(styleCss).toContain(`data-sw-glow="${glow}"`);
    }
    for (const border of [
      "sharp",
      "double",
      "bevel",
      "gradient",
      "metal",
      "hologram",
      "iridescent",
      "neon",
    ]) {
      expect(styleCss).toContain(`data-sw-border="${border}"`);
    }

    // Tier badges and non-overlapping quick action buttons
    for (const tier of ["low", "medium", "high", "ultra"]) {
      expect(styleCss).toContain(`.theme-tier-badge.theme-tier-${tier}`);
    }
    expect(styleCss).toContain(".theme-keep-fx-color-quick");
    expect(styleCss).toContain(".theme-plain-only-quick");
    expect(styleCss).toContain(".theme-share-quick");
    expect(styleCss).toContain(".theme-edit-quick");
    expect(styleCss).toContain(
      '.theme-card[aria-pressed="true"] .theme-name::after',
    );
  });

  test("4. Master-Level Theme FX, Glassmorphism, Folder Selection Invariants & GPU/Motion Guards (themeEffects.css)", () => {
    // Critical folder & icon selection invariants preserved
    expect(themeEffectsCss).toContain(
      "html[data-ui-fx] .row.is-folder.selected",
    );
    expect(themeEffectsCss).toContain(
      ":root[data-ui-fx] .row.is-folder.selected",
    );
    expect(themeEffectsCss).toContain("#list.view-icons .row.selected");
    expect(themeEffectsCss).toContain(
      "LINUX / UBUNTU WEBKITGTK & VIRTIO GPU 60-120HZ AAA STUDIO OPTIMIZATIONS",
    );

    // Master glassmorphism backdrops scoped to floating overlays (.dialog, .menu, .selection-bar, .ql)
    expect(themeEffectsCss).toContain('[data-fx-backdrop="liquid"]');
    expect(themeEffectsCss).toContain('[data-fx-backdrop="mica"]');
    expect(themeEffectsCss).toContain('[data-fx-backdrop="oled"]');

    // High/Ultra specular folder highlights strictly exclude .selected so selection never washes out
    expect(themeEffectsCss).toContain(
      '.row.is-folder:not(.selected):not([aria-selected="true"])',
    );

    // Hardware tier, Zero-Watt, reduced-motion, and reduced-transparency guards
    expect(themeEffectsCss).toContain(
      "@media (prefers-reduced-transparency: reduce)",
    );
    expect(themeEffectsCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(themeEffectsCss).toContain(':root[data-fx-tier="low"]');
    expect(themeEffectsCss).toContain('html[data-zero-watt-paused="true"]');
  });

  test("5. Theme Menu Studio Badges, Keycap Shortcuts & Gallery Filter Actions (themeMenu.js)", async () => {
    const menuMod = (await import(
      "../resources/file_manager/ui/themeMenu.js"
    )) as any;

    expect(typeof menuMod.formatThemeMenuBadge).toBe("function");
    expect(
      menuMod.formatThemeMenuBadge({
        dark: true,
        tier: "ultra",
        hasEffects: true,
      }),
    ).toBe("🌙 Dark · 🚀 Ultra");
    expect(
      menuMod.formatThemeMenuBadge({
        dark: false,
        tier: "low",
        hasEffects: false,
      }),
    ).toBe("☀️ Light · ⏹ Plain");
    expect(
      menuMod.formatThemeMenuBadge({
        dark: true,
        tier: "medium",
        hasEffects: true,
      }),
    ).toBe("🌙 Dark · ✨ FX");

    const items = await menuMod.themeMenuItems();
    const labels = items.map((i: any) => i.label).filter(Boolean);

    // Required preserved labels
    expect(labels).toContain("Plain themes (no animations)…");
    expect(labels).toContain("Plain dark themes (no FX)…");
    expect(labels).toContain("Plain light themes (no FX)…");
    expect(labels).toContain("Turn off all animations & FX");
    expect(labels).toContain("All themes…");
    expect(labels).toContain("Make my own theme…");

    // New flagship studio filter launchers
    expect(labels).toContain("FX & 3D Shader themes…");
    expect(labels).toContain("Ultra & XDR Flagship themes…");

    // Shortcut keycap metadata attached for .menu-shortcut pills
    const shortcuts = items.map((i: any) => i.shortcut).filter(Boolean);
    expect(shortcuts).toContain("⌥Z");
    expect(shortcuts).toContain("⌥C");
    expect(shortcuts).toContain("⌥R");
    expect(shortcuts).toContain("⌥E");
    expect(shortcuts).toContain("⌥P");
    expect(shortcuts).toContain("⌥U");
    expect(themeMenuSrc).toContain('emit("theme-picker", { filter: "fx" })');
    expect(themeMenuSrc).toContain(
      '.dialog select[aria-label="Filter templates by tier"]',
    );
    expect(typeof menuMod.openUltraThemePicker).toBe("function");

    // Verify openUltraThemePicker emits theme-picker and sets the mounted dialog's tier select & pill to "ultra"
    let emittedEvent = "";
    let emittedDetail: any = null;
    let changed = false;
    const mockSelect: any = {
      value: "all",
      dispatchEvent: (ev: any) => {
        if (ev?.type === "change") changed = true;
        return true;
      },
    };
    const mockPill: any = {
      pressed: "false",
      getAttribute(attr: string) {
        return attr === "aria-pressed" ? this.pressed : null;
      },
      click() {
        this.pressed = "true";
      },
    };
    const mockDoc = {
      querySelector: (sel: string) => {
        if (sel === '.dialog select[aria-label="Filter templates by tier"]')
          return mockSelect;
        if (sel === '.dialog [data-tier-pill="ultra"]') return mockPill;
        return null;
      },
    };
    const ultraItem = items.find(
      (i: any) => i.label === "Ultra & XDR Flagship themes…",
    );
    expect(ultraItem).toBeDefined();
    menuMod.openUltraThemePicker({
      doc: mockDoc,
      emitFn: (ev: string, detail: any) => {
        emittedEvent = ev;
        emittedDetail = detail;
      },
    });
    await new Promise((r) => setTimeout(r, 35));
    expect(emittedEvent).toBe("theme-picker");
    expect(emittedDetail).toEqual({ filter: "fx" });
    expect(mockSelect.value).toBe("ultra");
    expect(changed).toBe(true);
    expect(mockPill.pressed).toBe("true");
  });

  test("6. Theme Editor Multi-Stop Template Browser & Tier/Mode Badges (themeEditor.js)", () => {
    expect(themeEditorSrc).toContain("tpl-swatch-window");
    expect(themeEditorSrc).toContain("tpl-swatch-ribbon");
    expect(themeEditorSrc).toContain("tpl-badge-row");
    expect(themeEditorSrc).toContain("data-template-tier");
    expect(themeEditorSrc).toContain("data-template-mode");
    expect(themeEditorSrc).toContain(
      'makeTemplateFilterBtn("ultra", "🚀 Ultra / High")',
    );
    expect(themeEditorSrc).toContain('title: "Folder / Glow"');
  });
});
