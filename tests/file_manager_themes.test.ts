import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { createContext } from "../src/features/filemanager/fmCore";
import { getThemeColours, getThemeColoursForHardware, listThemes, themeVars } from "../src/features/filemanager/fmThemes";
import { sanitizeSettings } from "../src/features/filemanager/fmSettings";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { SIMPLEGUI_THEMES } from "../src/shared/simpleguiThemes";
import { contrastRatio } from "../src/shared/themeSemantic";
import { exportTheme, exportThemeCss, exportThemePack, parseShared, parseThemePack, toSimpleTheme, validateDraft } from "../src/features/filemanager/fmThemeStore";
import { FX_THEMES, fxCssVars, glassReport } from "../src/shared/fxThemes";

// The same pairs tests/file_manager_ui_theme.test.ts demands of the built-in light and dark colors.
const PAIRS: Array<[string, string, number]> = [
  ["text", "bg", 4.5], ["text", "panel", 4.5], ["muted", "bg", 4.5], ["muted", "panel", 4.5], ["text", "hover", 4.5], ["muted", "hover", 4.5],
  ["selected-text", "selected", 4.5], ["accent-text", "accent", 4.5], ["accent", "bg", 4.5], ["accent", "panel", 4.5],
  ["danger", "bg", 4.5], ["danger", "hover", 4.5], ["danger-text", "danger-bg", 4.5], ["danger", "danger-bg", 3],
  ["toast-text", "toast-bg", 4.5], ["toast-action", "toast-bg", 4.5], ["warn-text", "warn-bg", 4.5], ["toast-good", "toast-bg", 3], ["toast-bad", "toast-bg", 3], ["good", "panel", 3],
  ["muted", "selected", 3],
];
const CSS_VARS = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "ui", "style.css"), "utf8");

describe("the theme table", () => {
  test("every theme of the SimpleGUI table is offered once, grouped, with a preview", () => {
    const list = listThemes();
    const names = new Set(Object.values(SIMPLEGUI_THEMES).map((t) => t.name));
    expect(list.length).toBe(names.size);
    expect(new Set(list.map((t) => t.key)).size).toBe(list.length);
    expect(list.length).toBeGreaterThanOrEqual(130);
    for (const t of list) {
      expect(t.swatch.every((c) => /^#[0-9a-f]{6}$/.test(c)), t.key).toBe(true);
      expect(["Futuristic", "Linux", "Windows", "macOS", "Editors and classics", "Rare and beloved systems"]).toContain(t.group);
    }
    for (const g of ["Futuristic", "Linux", "Windows", "macOS", "Editors and classics", "Rare and beloved systems"]) expect(list.some((t) => t.group === g), g).toBe(true);
    expect(list.some((t) => t.dark)).toBe(true);
    expect(list.some((t) => !t.dark)).toBe(true);
  });

  test("the groups hold what their names say", () => {
    const by = (name: string) => listThemes().find((t) => t.name === name)?.group;
    expect(by("Cyberpunk Hologram")).toBe("Futuristic");
    expect(by("Debian Dark")).toBe("Linux");
    expect(by("Windows 95")).toBe("Windows");
    expect(by("macOS Sonoma Dark")).toBe("macOS");
    expect(by("Dracula")).toBe("Editors and classics");
  });

  test("rare systems have their own group, and every theme says whether it has special effects", () => {
    const by = (key: string) => listThemes().find((t) => t.key === key);
    for (const k of ["beos_r5", "os2_warp", "solaris_cde", "palm_os", "zune_desktop"]) expect(by(k)?.group, k).toBe("Rare and beloved systems");
    for (const k of ["synthwave_sunset", "matrix_rain", "frosted_glass", "focus_glow", "prism_reactor"]) expect(by(k)?.hasEffects, k).toBe(true);
    for (const k of ["dracula", "win95", "beos_r5"]) expect(by(k)?.hasEffects, k).toBe(false);
    expect(listThemes().filter((t) => t.hasEffects).length).toBeGreaterThanOrEqual(35);
  });

  test("every theme gives every variable the page uses, and all of them are readable", () => {
    const needed = [...CSS_VARS.slice(0, CSS_VARS.indexOf(":root[data-theme")).matchAll(/--([\w-]+):/g)].map((m) => m[1]!).filter((n) => n !== "fm-scale");
    const failures: string[] = [];
    for (const t of listThemes()) {
      const c = getThemeColours(t.key)!;
      for (const n of needed) if (!c.vars[n]) failures.push(`${t.key}: no --${n}`);
      for (const [a, b, min] of PAIRS) {
        const r = contrastRatio(c.vars[a]!, c.vars[b]!);
        if (r < min) failures.push(`${t.key}: ${a} on ${b} is ${r.toFixed(2)}, needs ${min}`);
      }
      expect(c.scheme).toBe(t.dark ? "dark" : "light");
    }
    expect(failures).toEqual([]);
  });

  test("a theme whose background can't hold any text color beside its panel takes the panel's color", () => {
    const v = themeVars({ name: "x", background_color: "#008080", card_background: "#c0c0c0", font_color: "#000000", accent_color: "#000080", description: "", is_dark: false }).vars;
    expect(v.bg).toBe("#c0c0c0");
  });

  test("junk colors fall back instead of throwing", () => {
    const v = themeVars({ name: "x", background_color: "nonsense", font_color: "", accent_color: "rgb(1,2,3)", description: "", is_dark: true }).vars;
    for (const n of ["bg", "text", "accent"]) expect(v[n]).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("unknown or odd keys give nothing", () => {
    for (const k of ["nope", "", null, 5, "__proto__", "constructor", "../x"]) expect(getThemeColours(k as any)).toBeNull();
  });

  test("effects themes include Display-P3 accent tokens and revert to lightweight fallback themes on constrained systems", () => {
    for (const t of listThemes().filter((x) => x.hasEffects)) {
      expect(t.fallbackKey, t.key).toBeTruthy();
      expect(t.fallbackName, t.key).toBeTruthy();
      const fb = getThemeColours(t.fallbackKey!);
      expect(fb, `${t.key} -> ${t.fallbackKey}`).not.toBeNull();
      expect(fb!.hasEffects).toBe(false);
      expect(fb!.dark).toBe(t.dark);
    }
    const ultra = getThemeColoursForHardware("quantum_obsidian", {
      gpuRenderer: "Apple M4 Pro",
      platform: "darwin",
      colorGamutP3: true,
      hdrDynamicRange: true,
    })!;
    expect(ultra.revertedToFallback).toBe(false);
    expect(ultra.appliedKey).toBe("quantum_obsidian");
    expect(ultra.hardware.tier).toBe("ultra");
    expect(ultra.theme.vars["accent-p3"]).toMatch(/^color\(display-p3 /);

    const low = getThemeColoursForHardware("quantum_obsidian", {
      gpuRenderer: "Microsoft Basic Render Driver",
      platform: "win32",
    })!;
    expect(low.revertedToFallback).toBe(true);
    expect(low.appliedKey).toBe("oled_black");
    expect(low.theme.hasEffects).toBe(false);
    expect(low.theme.notes.some((n) => n.includes("Automatically switched"))).toBe(true);
  });
});

describe("the saved choice", () => {
  const ctx = createContext({ platform: "linux", home: "/home/u", dataDir: "/tmp/x" });
  test("a key is kept when it looks like one, and anything else becomes none", () => {
    expect(sanitizeSettings({ palette: "nord" }, ctx).palette).toBe("nord");
    for (const bad of ["Nord", "a b", "../x", "x".repeat(61), 5, null, "", "<script>"]) expect(sanitizeSettings({ palette: bad }, ctx).palette).toBe("");
    expect(sanitizeSettings({}, ctx).palette).toBe("");
  });

  test("favoriteThemes keeps valid unique theme keys, drops bad ones, and caps at 50", () => {
    const cleaned = sanitizeSettings({ favoriteThemes: ["nord", "dracula", "nord", "Bad Key", "../x", 42, "", "user_1"] }, ctx);
    expect(cleaned.favoriteThemes).toEqual(["nord", "dracula", "user_1"]);
    const many = Array.from({ length: 65 }, (_, i) => `theme_${i}`);
    expect(sanitizeSettings({ favoriteThemes: many }, ctx).favoriteThemes.length).toBe(50);
  });

  test("preferredLightPalette and preferredDarkPalette keep valid palette keys and drop invalid ones", () => {
    const cleaned = sanitizeSettings({ preferredLightPalette: "solarized_light", preferredDarkPalette: "nord" }, ctx);
    expect(cleaned.preferredLightPalette).toBe("solarized_light");
    expect(cleaned.preferredDarkPalette).toBe("nord");
    const bad = sanitizeSettings({ preferredLightPalette: "Bad Key!", preferredDarkPalette: "../hack" }, ctx);
    expect(bad.preferredLightPalette).toBe("");
    expect(bad.preferredDarkPalette).toBe("");
  });

  test("parseShared and parseThemePack migrate 3-digit hex codes, SimpleGUI legacy fields, and multi-theme packs", () => {
    const legacy = JSON.stringify({
      name: "Legacy Short Hex",
      is_dark: true,
      background_color: "#123",
      font_color: "#fed",
      accent_color: "#0af",
      future_unknown_field: { nested: true },
    });
    const migrated = parseShared(legacy);
    expect(migrated.name).toBe("Legacy Short Hex");
    expect(migrated.dark).toBe(true);
    expect(migrated.colors.background).toBe("#112233");
    expect(migrated.colors.text).toBe("#ffeedd");
    expect(migrated.colors.accent).toBe("#00aaff");

    const packText = exportThemePack([
      migrated,
      validateDraft({ name: "Second Theme", dark: false, colors: { background: "#ffffff", text: "#111111", accent: "#0055cc" } }),
    ]);
    const parsedPack = parseThemePack(packText);
    expect(parsedPack.length).toBe(2);
    expect(parsedPack[0]!.name).toBe("Legacy Short Hex");
    expect(parsedPack[1]!.name).toBe("Second Theme");
  });

  test("exportThemeCss formats a standalone :root CSS variables block and themeVars includes WCAG contrast telemetry", () => {
    const c = getThemeColours("nord")!;
    expect(c.contrast.length).toBeGreaterThanOrEqual(6);
    for (const item of c.contrast) {
      expect(item.ratio).toBeGreaterThanOrEqual(4.5);
      expect(["AAA", "AA"]).toContain(item.grade);
    }
    const cssText = exportThemeCss(c.name, c.scheme, c.vars, c.effects?.css);
    expect(cssText).toContain(":root {");
    expect(cssText).toContain("color-scheme: dark;");
    expect(cssText).toContain(`--bg: ${c.vars.bg};`);
    expect(cssText).toContain(`--surface-elevated: ${c.vars["surface-elevated"]};`);
    expect(cssText).toContain(`--focus-ring: ${c.vars["focus-ring"]};`);
  });

  describe("custom theme effects", () => {
    const draft = { name: "Custom glass", dark: true, colors: { background: "#060918", card: "#101a30", text: "#edf8ff", accent: "#53f4ff" }, fx: FX_THEMES.prism_reactor!.fx! };

    test("effects survive validation, export and import without changing old color-only themes", () => {
      const checked = validateDraft(draft);
      expect(parseShared(exportTheme(checked))).toEqual(checked);
      expect(toSimpleTheme(checked).fx).toEqual(checked.fx);
      const { fx, ...old } = draft;
      expect(validateDraft(old).fx).toBeUndefined();
      expect(themeVars(toSimpleTheme(validateDraft(old))).effects).toBeUndefined();
    });

    test("invalid effect values are rejected instead of becoming CSS", () => {
      for (const bad of [{ blur: 33 }, { glass: -1 }, { glass: "0.5" }, { glow: "bad" }, { radius: "url(x)" }, { glowColor: "red;display:none" }, { glowIntensity: NaN }, { borderOpacity: Infinity }, { ambient: "yes" }]) {
        expect(() => validateDraft({ ...draft, fx: { ...draft.fx, ...bad } })).toThrow();
      }
    });

    test("opacity stays above the contrast floor, and glow intensity can be turned off", () => {
      const theme = toSimpleTheme(validateDraft({ ...draft, fx: { ...draft.fx, glass: 1, glowIntensity: 0 } }));
      expect(glassReport({ ...theme, fx: theme.fx! }).worstContrast).toBeGreaterThanOrEqual(4.5);
      const css = fxCssVars(theme);
      expect(css.match(/--fx-glow-strong: ([^;]+)/)?.[1]).toContain("rgba(83, 244, 255, 0)");
      const computed = themeVars(theme);
      expect(computed.effects!.attrs["data-fx"]).toBe("on");
      expect(computed.notes.join(" ")).toContain("opacity");
      expect(computed.effects!.css).not.toContain("NaN");
    });
  });
});

// ---- the page --------------------------------------------------------------------------------------------------
const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-theme-ui-"));
const home = join(root, "home");
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let themes: any;
let state: any;
let api: any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rootVar = (name: string): string => doc.documentElement.style.getPropertyValue(`--${name}`);
const card = (name: string): any => [...doc.querySelectorAll(".theme-card")].find((c: any) => c.querySelector(".theme-name")?.textContent.startsWith(name));
const closeDialogs = () => doc.querySelectorAll(".modal-backdrop").forEach((e: any) => e.remove());
async function waitForSavedPalette(palette: string) {
  for (let i = 0; i < 50; i++) {
    if ((await api.call("settings")).settings.palette === palette) return;
    await sleep(50);
  }
  expect((await api.call("settings")).settings.palette).toBe(palette);
}

beforeAll(async () => {
  mkdirSync(home, { recursive: true });
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data") } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  const stateModule = await import("../resources/file_manager/ui/state.js");
  state = stateModule.state;
  api = await import("../resources/file_manager/ui/api.js");
  themes = await import("../resources/file_manager/ui/themes.js");
  await import("../resources/file_manager/ui/themeEditor.js");
  state.settings = (await api.call("settings")).settings;
  // main.js does this when the settings change; the page's startup isn't run here.
  stateModule.on("settings", () => themes.applyPalette(state.settings.palette));
});

afterAll(() => {
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const d = saved.get(key);
    if (d) Object.defineProperty(g, key, d);
    else delete g[key];
  }
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("the theme gallery in the page", () => {
  test("lists the groups, with Standard selected to begin with", async () => {
    await themes.showThemePicker();
    await sleep(100);
    const headings = [...doc.querySelectorAll(".theme-list h3")].map((h: any) => h.textContent);
    expect(headings[0]).toBe("Default");
    expect(headings.some((h: string) => h.startsWith("Futuristic"))).toBe(true);
    expect(headings.some((h: string) => h.startsWith("Windows"))).toBe(true);
    expect(card("Standard").getAttribute("aria-pressed")).toBe("true");
    expect(doc.querySelectorAll(".theme-card").length).toBeGreaterThan(130);
    for (const c of doc.querySelectorAll(".theme-card")) expect(c.title, c.textContent).toBeTruthy();
  });

  test("search and the light/dark filter narrow the list", async () => {
    const search = doc.querySelector(".theme-tools input");
    search.value = "windows 95";
    search.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    await sleep(250);
    expect([...doc.querySelectorAll(".theme-name")].map((e: any) => e.textContent.replace(" ✓", ""))).toContain("Windows 95");
    expect(doc.querySelectorAll(".theme-card").length).toBeLessThan(5);
    search.value = "zzzzzz";
    search.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    await sleep(250);
    expect(doc.querySelector(".theme-list").textContent).toContain("No theme matches");
    search.value = "";
    search.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    const mode = doc.querySelector(".theme-tools select");
    mode.value = "light";
    mode.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await sleep(250);
    const kinds = [...doc.querySelectorAll(".theme-kind")].map((e: any) => e.textContent);
    expect(kinds.every((k: string) => k === "Light" || k === "Light or dark")).toBe(true);
    mode.value = "all";
    mode.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await sleep(250);
  });

  test("the effects menu shows only effects themes or only plain ones, and each card says which it is", async () => {
    const fx = doc.querySelector('.theme-tools select[aria-label^="Show themes with or without"]');
    expect(fx).toBeTruthy();
    expect(doc.querySelectorAll(".theme-fx-badge").length).toBeGreaterThanOrEqual(35);
    expect(doc.querySelectorAll(".theme-plain-badge").length).toBeGreaterThan(100);
    fx.value = "fx";
    fx.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await sleep(250);
    const cards = [...doc.querySelectorAll(".theme-card")];
    expect(cards.length).toBeGreaterThanOrEqual(35);
    expect(cards.every((c: any) => c.querySelector(".theme-fx-badge"))).toBe(true);
    expect(doc.querySelector('.dialog [role="status"]')?.textContent ?? doc.body.textContent).toMatch(/with special effects/);
    fx.value = "plain";
    fx.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await sleep(250);
    const plain = [...doc.querySelectorAll(".theme-card")];
    expect(plain.some((c: any) => c.querySelector(".theme-fx-badge"))).toBe(false);
    expect(plain.some((c: any) => c.querySelector(".theme-plain-badge"))).toBe(true);
    fx.value = "any";
    fx.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await sleep(250);
  });

  test("each card renders a miniature window swatch preview with sidebar, selected row pill, text row, and glow/border attributes", async () => {
    const holoCard = card("Cyberpunk Hologram");
    const sw = holoCard.querySelector(".theme-swatch");
    expect(sw).toBeTruthy();
    expect(sw.querySelector(".theme-swatch-side")).toBeTruthy();
    expect(sw.querySelector(".theme-swatch-main")).toBeTruthy();
    expect(sw.querySelector(".theme-swatch-pill")).toBeTruthy();
    expect(sw.querySelector(".theme-swatch-row")).toBeTruthy();
    expect(sw.style.getPropertyValue("--sw-bg")).toMatch(/^#[0-9a-f]{6}$/);
    expect(sw.style.getPropertyValue("--sw-panel")).toMatch(/^#[0-9a-f]{6}$/);
    expect(sw.style.getPropertyValue("--sw-selected")).toMatch(/^#[0-9a-f]{6}$/);
    expect(sw.getAttribute("data-sw-glow")).toBeTruthy();

    const win95Sw = card("Windows 95").querySelector(".theme-swatch");
    expect(win95Sw.getAttribute("data-sw-border")).toBeTruthy();
  });

  test("category filter narrows themes to a single group or to favorites, and pinning a theme places it in a Favorites section at the top", async () => {
    const catSelect = doc.querySelector('.theme-tools select[aria-label="Show themes from a category"]');
    expect(catSelect).toBeTruthy();
    catSelect.value = "Windows";
    catSelect.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await sleep(200);
    const winHeadings = [...doc.querySelectorAll(".theme-list h3")].map((h: any) => h.textContent);
    expect(winHeadings.length).toBe(1);
    expect(winHeadings[0]).toMatch(/^Windows \(\d+\)$/);
    expect(card("Windows 95")).toBeTruthy();
    expect(card("Dracula")).toBeUndefined();

    catSelect.value = "all";
    catSelect.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await sleep(200);

    // Pin Nord as a favorite
    const nordItem = card("Nord").closest(".theme-card-item");
    const pinBtn = nordItem.querySelector(".theme-pin");
    expect(pinBtn.getAttribute("aria-pressed")).toBe("false");
    pinBtn.click();
    await sleep(250);

    const headingsAfterPin = [...doc.querySelectorAll(".theme-list h3")].map((h: any) => h.textContent);
    expect(headingsAfterPin[0]).toBe("Favorites (1)");
    expect(state.settings.favoriteThemes).toContain("nord");
    expect((await api.call("settings")).settings.favoriteThemes).toContain("nord");

    // Filter by ★ Favorites
    catSelect.value = "favorites";
    catSelect.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await sleep(200);
    expect([...doc.querySelectorAll(".theme-card")].map((c: any) => c.querySelector(".theme-name")?.textContent)).toEqual(["Nord"]);

    // Unpin Nord
    const unpinBtn = doc.querySelector(".theme-card-item .theme-pin");
    expect(unpinBtn.getAttribute("aria-pressed")).toBe("true");
    unpinBtn.click();
    await sleep(250);
    expect(state.settings.favoriteThemes).toEqual([]);
    expect(doc.querySelector(".theme-list").textContent).toContain("No favorite themes yet");

    catSelect.value = "all";
    catSelect.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await sleep(200);
  });

  test("clicking a theme applies its colors at once and saves the choice; Standard takes them off again", async () => {
    card("Cyberpunk Hologram").click();
    for (let i = 0; i < 30 && doc.documentElement.dataset.palette !== "cyberpunk_hologram"; i++) await sleep(50);
    expect(doc.documentElement.dataset.palette).toBe("cyberpunk_hologram");
    expect(rootVar("bg")).toMatch(/^#[0-9a-f]{6}$/);
    expect(rootVar("accent")).toBe(getThemeColours("cyberpunk_hologram")!.vars.accent!);
    expect(doc.documentElement.dataset.theme).toBe("dark");
    expect(doc.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");
    await waitForSavedPalette("cyberpunk_hologram");
    expect((await api.call("settings")).settings.palette).toBe("cyberpunk_hologram");
    expect(card("Cyberpunk Hologram").getAttribute("aria-pressed")).toBe("true");
    expect(await themes.currentThemeName()).toBe("Cyberpunk Hologram");

    card("Liquid Metal Light").click();
    for (let i = 0; i < 30 && doc.documentElement.dataset.palette !== "liquid_metal_light"; i++) await sleep(50);
    expect(doc.documentElement.dataset.theme).toBe("light");
    expect(rootVar("accent")).toBe(getThemeColours("liquid_metal_light")!.vars.accent!);
    await waitForSavedPalette("liquid_metal_light");

    card("Standard").click();
    await waitForSavedPalette("");
    await sleep(300);
    expect(doc.documentElement.dataset.palette).toBeUndefined();
    expect(rootVar("bg")).toBe("");
    expect(rootVar("accent")).toBe("");
    expect((await api.call("settings")).settings.palette).toBe("");
    closeDialogs();
  });

  test("a saved theme that no longer exists falls back to the standard colors", async () => {
    state.settings.palette = "gone_theme";
    const name = await themes.applyPalette("gone_theme");
    expect(name).toBe("");
    expect(doc.documentElement.dataset.palette).toBeUndefined();
    expect(rootVar("bg")).toBe("");
    state.settings.palette = "";
  });

  test("cycling themes wraps, applies colors and persists the selected theme", async () => {
    const all = (await api.call("themes/list")).themes;
    await themes.chooseTheme("");
    await themes.cycleTheme(1);
    expect(state.settings.palette).toBe(all[0].key);
    expect((await api.call("settings")).settings.palette).toBe(all[0].key);
    await sleep(100);
    expect(doc.documentElement.dataset.palette).toBe(all[0].key);
    await themes.cycleTheme(-1);
    expect(state.settings.palette).toBe("");
    await themes.cycleTheme(-1);
    expect(state.settings.palette).toBe(all.at(-1).key);
    await themes.cycleTheme(1);
    expect(state.settings.palette).toBe("");
    expect((await api.call("settings")).settings.palette).toBe("");
  });

  test("effects are applied with the response nonce, then fully removed by a plain theme or Standard", async () => {
    await themes.applyPalette("prism_reactor");
    expect(doc.documentElement.dataset.fx).toBe("on");
    expect(doc.querySelector("#fm-theme-effects").getAttribute("nonce")).toBe("n");
    expect(doc.querySelector("#fm-theme-effects").textContent).toContain("--fx-glass-bg");
    await themes.applyPalette("dracula");
    expect(doc.documentElement.dataset.fx).toBeUndefined();
    expect(doc.querySelector("#fm-theme-effects")).toBeNull();
    await themes.applyPalette("orbital_ice");
    await themes.applyPalette("");
    expect(doc.documentElement.dataset.fx).toBeUndefined();
    expect(doc.querySelector("#fm-theme-effects")).toBeNull();
  });
});

// ---- the theme editor ------------------------------------------------------------------------------------------
const MINE = { name: "  Night   Owl  ", dark: true, base: "Dracula", colors: { background: "#101820", text: "#e6edf3", accent: "#ff9f1c", card: "#17212b", border: "#2b3a48" } };

describe("your own themes, on the server", () => {
  test("a draft is checked: name, colors and the colors that must be there", async () => {
    const bad: Array<[any, RegExp]> = [
      [null, /form/], [{ ...MINE, name: "   " }, /name/], [{ ...MINE, name: "x".repeat(41) }, /40/],
      [{ ...MINE, colors: { ...MINE.colors, accent: "orange" } }, /accent color must look like/],
      [{ ...MINE, colors: { ...MINE.colors, text: "#fff" } }, /text color must look like/],
      [{ ...MINE, colors: { background: "#000000", text: "#ffffff" } }, /accent/],
      [{ ...MINE, colors: { ...MINE.colors, danger: 5 } }, /danger/],
    ];
    for (const [input, message] of bad) {
      const res = await api.call("themes/preview", { theme: input }).then(() => null, (e: any) => e.message);
      expect(res, JSON.stringify(input)).toMatch(message);
    }
  });

  test("preview works out the page colors without saving, and says when it changed a color", async () => {
    const { theme } = await api.call("themes/preview", { theme: { name: "Low", dark: false, colors: { background: "#ffffff", text: "#f0f0f0", accent: "#ffff00" } } });
    expect(theme.scheme).toBe("light");
    for (const [a, b, min] of PAIRS) expect(contrastRatio(theme.vars[a], theme.vars[b]), `${a} on ${b}`).toBeGreaterThanOrEqual(min);
    expect(theme.notes.join(" ")).toMatch(/text color was adjusted/);
    expect(theme.notes.join(" ")).toMatch(/accent color was adjusted/);
    expect((await api.call("themes/list")).themes.some((t: any) => t.name === "Low")).toBe(false);
  });

  test("save, list under My themes, get with its colors, update in place, copy, delete", async () => {
    const made = await api.call("themes/custom/save", { theme: MINE });
    expect(made.id).toMatch(/^custom_[0-9a-f]{8}$/);
    expect(made.name).toBe("Night Owl");
    let list = (await api.call("themes/list")).themes;
    expect(list[0].key).toBe(made.id);
    expect(list[0].group).toBe("My themes");
    const got = await api.call("themes/get", { key: made.id });
    expect(got.custom).toEqual({ id: made.id, name: "Night Owl", base: "Dracula" });
    expect(got.source.colors.background).toBe("#101820");
    expect(got.source.colors.danger).toMatch(/^#[0-9a-f]{6}$/);
    expect(got.theme.dark).toBe(true);

    const same = await api.call("themes/custom/save", { id: made.id, theme: { ...MINE, name: "Night Owl 2", colors: { ...MINE.colors, accent: "#00ffcc" } } });
    expect(same.id).toBe(made.id);
    expect((await api.call("themes/get", { key: made.id })).theme.name).toBe("Night Owl 2");
    const copy = await api.call("themes/custom/save", { theme: { ...MINE, name: "Copy" } });
    expect(copy.id).not.toBe(made.id);
    expect((await api.call("themes/list")).themes.filter((t: any) => t.group === "My themes").length).toBe(2);

    await api.call("themes/custom/delete", { id: copy.id });
    await api.call("themes/custom/delete", { id: made.id });
    expect((await api.call("themes/list")).themes.some((t: any) => t.group === "My themes")).toBe(false);
    expect(await api.call("themes/get", { key: made.id }).then(() => "found", (e: any) => e.message)).toMatch(/isn't available/);
    expect(await api.call("themes/custom/delete", { id: made.id }).then(() => "ok", (e: any) => e.message)).toMatch(/already been deleted/);
  });

  test("ids can't be forged, and a built-in theme can't be overwritten or deleted", async () => {
    for (const id of ["dracula", "../x", "custom_zzzzzzzz", "custom_1234567"]) {
      expect(await api.call("themes/custom/save", { theme: MINE, id }).then(() => "ok", (e: any) => e.message), id).toMatch(/isn't one of your themes|deleted/);
      expect(await api.call("themes/custom/delete", { id }).then(() => "ok", (e: any) => e.message), id).toMatch(/isn't one of your themes/);
    }
  });

  test("shared text round-trips, and bad text is explained", async () => {
    const made = await api.call("themes/custom/save", { theme: MINE });
    const { text } = await api.call("themes/custom/export", { id: made.id });
    const back = await api.call("themes/custom/import", { text });
    expect(back.theme.colors).toEqual({ background: "#101820", text: "#e6edf3", accent: "#ff9f1c", card: "#17212b", border: "#2b3a48" });
    const bare = await api.call("themes/custom/import", { text: JSON.stringify({ name: "Bare", dark: false, colors: { background: "#ffffff", text: "#000000", accent: "#0000ff" } }) });
    expect(bare.theme.name).toBe("Bare");
    for (const [t, m] of [["", /Paste/], ["not json", /isn't a theme/], [JSON.stringify({ format: "other", name: "x" }), /isn't a File Manager theme/], ["x".repeat(30000), /too long/]] as const) {
      expect(await api.call("themes/custom/import", { text: t }).then(() => "ok", (e: any) => e.message), t.slice(0, 12)).toMatch(m);
    }
    await api.call("themes/custom/delete", { id: made.id });
  });

  test("a damaged themes file is ignored, and there is a limit of 50", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) ids.push((await api.call("themes/custom/save", { theme: { ...MINE, name: `T${i}` } })).id);
    expect(await api.call("themes/custom/save", { theme: MINE }).then(() => "ok", (e: any) => e.message)).toMatch(/up to 50/);
    for (const id of ids) await api.call("themes/custom/delete", { id });
    writeFileSync(join(root, "data", "file_manager_themes.json"), "{ nope");
    expect((await api.call("themes/list")).themes.some((t: any) => t.group === "My themes")).toBe(false);
    rmSync(join(root, "data", "file_manager_themes.json"), { force: true });
  });
});

describe("the theme editor in the page", () => {
  const editorButton = (text: string): any => [...doc.querySelectorAll(".modal-backdrop button")].find((b: any) => b.textContent.trim() === text);
  const field = (label: string) => doc.querySelector(`.theme-editor [aria-label="${label} as a hex code"]`);
  const setHex = (label: string, value: string) => {
    const el = field(label);
    el.value = value;
    el.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
  };

  test("Create or edit opens the editor on the current theme, and changes show in the window at once", async () => {
    await themes.showThemePicker();
    await sleep(100);
    [...doc.querySelectorAll(".theme-tools button")].find((b: any) => b.textContent.includes("Create or edit")).click();
    await sleep(400);
    expect(doc.querySelector(".dialog-title").textContent).toBe("Theme editor");
    expect(doc.querySelector(".theme-editor").textContent).toContain("started from Standard");
    expect(doc.querySelectorAll(".theme-field").length).toBe(9);
    for (const c of doc.querySelectorAll(".theme-editor input, .theme-editor select")) expect(c.getAttribute("aria-label") || c.labels?.length, c.outerHTML.slice(0, 100)).toBeTruthy();
    setHex("Accent", "#880044");
    await sleep(500);
    expect(doc.documentElement.dataset.palette).toBe("preview");
    expect(rootVar("accent")).toBe("#880044");
    setHex("Accent", "#zzzzzz");
    expect(field("Accent").getAttribute("aria-invalid")).toBe("true");
    expect(rootVar("accent")).toBe("#880044");
  });

  test("Cancel puts the saved look back", async () => {
    editorButton("Cancel").click();
    await sleep(600);
    expect(doc.documentElement.dataset.palette).toBeUndefined();
    expect(rootVar("accent")).toBe("");
    closeDialogs();
  });

  test("starting from another theme loads its colors; Save keeps a new theme, applies it, and lists it first", async () => {
    themes.forgetThemeList();
    state.settings.palette = "";
    const { emit } = await import("../resources/file_manager/ui/state.js");
    emit("theme-editor", { from: "dracula" });
    await sleep(500);
    expect(field("Window background").value).toBe(getThemeColours("dracula") ? (await api.call("themes/get", { key: "dracula" })).source.colors.background : "");
    const name = doc.querySelector('.theme-editor [aria-label="Theme name"]');
    expect(name.value).toBe("Dracula (mine)");
    name.value = "My Dracula";
    name.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    setHex("Accent", "#12ab34");
    const enabled = doc.querySelector('[aria-label="Enable visual effects"]');
    enabled.checked = true;
    enabled.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    const opacity = doc.querySelector('[aria-label="Panel opacity"]');
    opacity.value = "65";
    opacity.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    const blur = doc.querySelector('[aria-label="Glass blur"]');
    blur.value = "24";
    blur.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    await sleep(400);
    editorButton("Save theme").click();
    await sleep(800);
    const mine = (await api.call("themes/list")).themes[0];
    expect(mine.name).toBe("My Dracula");
    expect(state.settings.palette).toBe(mine.key);
    expect(doc.documentElement.dataset.palette).toBe(mine.key);
    expect(rootVar("accent")).not.toBe("");
    const savedTheme = await api.call("themes/get", { key: mine.key });
    expect(savedTheme.source.fx.blur).toBe(24);
    expect(savedTheme.source.fx.glass).toBeCloseTo(35 / 60);
    expect(doc.documentElement.dataset.fx).toBe("on");
    closeDialogs();
  });

  test("editing your own theme offers Save, Save as a copy and Delete; Delete asks first and takes the theme off", async () => {
    const key = state.settings.palette;
    const { emit } = await import("../resources/file_manager/ui/state.js");
    emit("theme-editor", { from: key });
    await sleep(500);
    expect(doc.querySelector(".theme-editor").textContent).toContain('You are changing your theme "My Dracula"');
    for (const b of ["Save", "Save as a copy", "Delete theme", "Import…", "Export…", "Cancel"]) expect(editorButton(b), b).toBeTruthy();
    editorButton("Export…").click();
    await sleep(200);
    expect(doc.querySelector("textarea.theme-export").value).toContain("bun-rad-studio-file-manager-theme");
    expect(JSON.parse(doc.querySelector("textarea.theme-export").value).fx.blur).toBe(24);
    editorButton("Close").click();
    await sleep(300);
    editorButton("Delete theme").click();
    await sleep(200);
    expect(doc.querySelector(".modal-backdrop:last-child").textContent).toMatch(/deleted for good/);
    [...doc.querySelectorAll(".modal-backdrop button")].find((b: any) => b.textContent.trim() === "Delete theme" && b.classList.contains("danger") && b.closest(".modal-backdrop") === doc.querySelector(".modal-backdrop:last-child"))?.click();
    await sleep(800);
    expect((await api.call("themes/list")).themes.some((t: any) => t.group === "My themes")).toBe(false);
    expect(state.settings.palette).toBe("");
    expect(doc.documentElement.dataset.palette).toBeUndefined();
    closeDialogs();
  });

  test("theme editor displays live WCAG contrast badges and supports CSS variables and Theme Pack export/import", async () => {
    const { emit } = await import("../resources/file_manager/ui/state.js");
    emit("theme-editor", { from: "nord" });
    await sleep(450);
    const chips = [...doc.querySelectorAll(".theme-contrast-inspector .theme-contrast-chip")];
    expect(chips.length).toBeGreaterThanOrEqual(6);
    expect(chips[0].textContent).toContain(":1");
    expect(chips[0].querySelector(".theme-contrast-grade")?.textContent).toMatch(/^AA/);

    editorButton("Export…").click();
    await sleep(200);
    const cssTab = [...doc.querySelectorAll(".theme-export-tab")].find((b: any) => b.textContent.includes("CSS variables"));
    expect(cssTab).toBeTruthy();
    cssTab.click();
    await sleep(250);
    expect(doc.querySelector("textarea.theme-export").value).toContain(":root {");
    expect(doc.querySelector("textarea.theme-export").value).toContain("--surface-elevated:");
    editorButton("Close").click();
    await sleep(250);
    editorButton("Cancel").click();
    await sleep(400);
    closeDialogs();

    // Server pack import & export round-trip
    const packInput = exportThemePack([
      validateDraft({ name: "Pack One", dark: true, colors: { background: "#101418", text: "#f0f4f8", accent: "#4da3ff" } }),
      validateDraft({ name: "Pack Two", dark: false, colors: { background: "#fafafa", text: "#18181b", accent: "#2563eb" } }),
    ]);
    const imported = await api.call("themes/custom/import-pack", { text: packInput });
    expect(imported.count).toBe(2);
    const exportedPack = await api.call("themes/custom/export-pack", {});
    expect(exportedPack.count).toBe(2);
    expect(JSON.parse(exportedPack.text).themes.length).toBe(2);
    for (const item of imported.imported) await api.call("themes/custom/delete", { id: item.id });
  });

  test("Auto Day/Night pairing resolves preferredLightPalette and preferredDarkPalette and syncs terminal/frame theme payload", async () => {
    state.settings.theme = "auto";
    state.settings.palette = "";
    state.settings.preferredLightPalette = "liquid_metal_light";
    state.settings.preferredDarkPalette = "nord";
    expect(themes.effectiveAutoPalette(false)).toBe("liquid_metal_light");
    expect(themes.effectiveAutoPalette(true)).toBe("nord");

    await themes.applyPalette(themes.effectiveAutoPalette(true));
    const payload = themes.currentThemePayload();
    expect(payload.palette).toBe("nord");
    expect(payload.scheme).toBe("dark");
    expect(payload.vars["surface-sunken"]).toMatch(/^#[0-9a-f]{6}$/);
    const termColors = themes.terminalTheme(payload);
    expect(termColors.background).toBe(payload.vars["surface-sunken"]);
    expect(termColors.foreground).toBe(payload.vars.text);
    expect(termColors.cursor).toBe(payload.vars.accent);

    state.settings.preferredLightPalette = "";
    state.settings.preferredDarkPalette = "";
    await themes.applyPalette("");
    expect(themes.terminalTheme().background).toBe("#1e1e1e");
  });

  test("Atmospheric Special Effects engine supports 110 effects across Low, Medium, and Modern ARM Ultra tiers plus Multi-Effect Layer Mixing", async () => {
    const atmo = await import("../resources/file_manager/ui/atmosphereFx.js");
    expect(atmo.ATMOSPHERE_OPTIONS.length).toBe(110);
    expect(atmo.ATMOSPHERE_MIX_PRESETS.length).toBeGreaterThanOrEqual(10);

    // Hardware tier auto-detection
    expect(atmo.detectHardwareTier({ hardwareConcurrency: 2, userAgent: "Linux x86_64" }, { devicePixelRatio: 1 })).toBe("low");
    expect(atmo.detectHardwareTier({ hardwareConcurrency: 4, userAgent: "Windows NT 10.0" }, { devicePixelRatio: 1 })).toBe("medium");
    expect(atmo.detectHardwareTier({ hardwareConcurrency: 8, userAgent: "Windows NT 10.0; Win64; x64" }, { devicePixelRatio: 1 })).toBe("high");
    expect(atmo.detectHardwareTier({ hardwareConcurrency: 10, userAgent: "Mozilla/5.0 (Macintosh; ARM Mac OS X 14_5)" }, { devicePixelRatio: 2 })).toBe("ultra");

    // Open the Atmospheric Special Effects dialog
    void atmo.showAtmosphereDialog();
    await sleep(200);
    expect(doc.querySelector(".dialog-title").textContent).toBe("Atmospheric special effects");
    const sections = doc.querySelectorAll(".fm-atmo-section");
    expect(sections.length).toBe(3);
    expect(sections[0].getAttribute("data-tier-section")).toBe("low");
    expect(sections[1].getAttribute("data-tier-section")).toBe("medium");
    expect(sections[2].getAttribute("data-tier-section")).toBe("ultra");
    expect(sections[2].textContent).toContain("Modern ARM");

    const tierBtns = doc.querySelectorAll(".fm-atmo-tier-btn");
    expect(tierBtns.length).toBe(5);
    expect(doc.querySelectorAll(".fm-atmo-card .fm-atmo-preview").length).toBe(110);
    expect(doc.querySelector(".fm-atmo-theme-sync")).toBeTruthy();
    expect(doc.querySelector(".fm-atmo-mixer-dock")).toBeTruthy();

    // Select Modern ARM / Ultra tier and test effects across multiple procedural engines
    doc.querySelector('.fm-atmo-tier-btn[data-tier="ultra"]').click();
    for (const effectId of ["rain", "smoke", "cyberstorm", "nebula", "aurora", "outrun_grid", "neural_nexus", "dna_helix", "quantum_cpu", "black_hole"]) {
      doc.querySelector(`.fm-atmo-card[data-atmo="${effectId}"]`).click();
      expect(doc.documentElement.dataset.atmosphere).toBe(effectId);
      expect(doc.documentElement.dataset.atmosphereTier).toBe("ultra");
      expect(doc.getElementById("fm-atmosphere-layer")?.getAttribute("data-effect")).toBe(effectId);
    }

    // Multi-effect layer mixing: click a Signature Mix preset (3 simultaneous layers)
    doc.querySelector('.fm-atmo-preset-btn[data-mix="sakura+fireflies+aurora"]').click();
    expect(doc.documentElement.dataset.atmosphere).toBe("sakura+fireflies+aurora");
    expect(doc.documentElement.dataset.atmosphereLayers).toBe("3");
    expect(doc.querySelectorAll(".fm-atmo-layer-chip").length).toBe(3);

    // Add a 4th layer via the + Mix chip on a card
    const rainMixChip = doc.querySelector('.fm-atmo-card[data-atmo="rain"] .fm-atmo-mix-chip');
    rainMixChip.click();
    expect(doc.documentElement.dataset.atmosphere).toBe("sakura+fireflies+aurora+rain");
    expect(doc.documentElement.dataset.atmosphereLayers).toBe("4");

    // Category filter narrows the visible cards and "all" restores all 110
    doc.querySelector('.fm-atmo-cat-btn[data-cat="cosmic"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBeLessThan(40);
    doc.querySelector('.fm-atmo-cat-btn[data-cat="all"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(110);

    // Switching themes automatically re-harmonizes --fm-atmo-c1, --fm-atmo-c2, and --fm-atmo-c3
    const c1Before = doc.documentElement.style.getPropertyValue("--fm-atmo-c1");
    await themes.applyPalette("dracula");
    const c1After = doc.documentElement.style.getPropertyValue("--fm-atmo-c1");
    expect(c1After).toMatch(/^rgb\(/);
    expect(c1After).not.toBe(c1Before);
    expect(doc.documentElement.style.getPropertyValue("--fm-atmo-c2")).toMatch(/^rgb\(/);
    expect(doc.documentElement.style.getPropertyValue("--fm-atmo-c3")).toMatch(/^rgb\(/);
    await themes.applyPalette("");

    editorButton("Apply effect").click();
    await sleep(300);
    expect(state.settings.atmosphere).toBe("sakura+fireflies+aurora+rain");
    expect(state.settings.atmosphereTier).toBe("ultra");

    // Turn off cleanly
    atmo.applyAtmosphere("none");
    expect(doc.documentElement.dataset.atmosphere).toBeUndefined();
    expect(doc.getElementById("fm-atmosphere-layer")).toBeNull();
    closeDialogs();
  });
});

