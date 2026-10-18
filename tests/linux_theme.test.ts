import { describe, expect, test } from "bun:test";
import { createThemeShowcase } from "../demos/23_all_themes_all_controls_showcase";
import { getTheme, getThemeKeys } from "../src/simplegui";

function rethemeScript(from: string, to: string): string {
  const win: any = createThemeShowcase(from);
  let captured = "";
  win.isWindowRunning = true;
  win.evalJS = (js: string) => { captured = js; };
  win.setTheme(to, false);
  return captured;
}

describe("Linux theme support (WebKitGTK paints some controls from the desktop theme)", () => {
  test("the page declares its color scheme only on Linux, matching the theme", () => {
    const dark = createThemeShowcase("ubuntu_dark").generateHtml();
    const light = createThemeShowcase("ubuntu_light").generateHtml();
    expect(dark).toContain("classList.add('rad-linux')");
    expect(dark).toContain("html.rad-linux { color-scheme: dark; }");
    expect(light).toContain("html.rad-linux { color-scheme: light; }");
    // Other systems get no rule at all, so nothing changes for macOS and Windows.
    expect(dark).not.toMatch(/^\s*html \{ color-scheme/m);
  });

  test("switching themes at run time moves the old surfaces to the new theme and fixes unreadable text", () => {
    const js = rethemeScript("ubuntu_dark", "ubuntu_light");
    expect(js).toContain("html.rad-linux { color-scheme: light !important; }");
    expect(js).toContain('["#303030","#ffffff"]'); // old card color -> new card color
    expect(js).toContain("transition: none"); // computed colors lag behind while controls animate
    expect(() => new Function(js)).not.toThrow(); // the injected script parses
  });

  test("switching dark to light and back maps in both directions", () => {
    expect(rethemeScript("ubuntu_light", "ubuntu_dark")).toContain('["#ffffff","#1e293b"]');
  });

  test("every theme's page agrees with the theme about light or dark (Windows 95's teal background with silver cards is light)", () => {
    const seen = new Set<string>();
    for (const key of getThemeKeys()) {
      const theme = getTheme(key);
      if (seen.has(theme.name)) continue;
      seen.add(theme.name);
      const html = createThemeShowcase(key).generateHtml();
      expect(html, `${key}`).toContain(`html.rad-linux { color-scheme: ${theme.is_dark ? "dark" : "light"}; }`);
    }
    expect(seen.size).toBeGreaterThan(60);
  });

  test("text boxes have a placeholder color from the theme, so it is readable on every theme and system", () => {
    expect(createThemeShowcase("win95").generateHtml()).toContain("input::placeholder, textarea::placeholder { color: var(--theme-muted)");
    expect(rethemeScript("ubuntu_dark", "win95")).toContain("input::placeholder, textarea::placeholder { color: var(--theme-muted) !important");
  });
});
