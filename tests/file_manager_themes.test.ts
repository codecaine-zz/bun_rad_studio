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

  test("Atmospheric Special Effects engine supports 194 effects (including Weather/Storm 3D Debris and Year-2126 Hyper-Dimensional presets) across Low, Medium, Modern ARM Ultra, and M4 Max Extreme tiers plus 6-Layer Mixing and User-Named Custom Presets", async () => {
    const atmo = await import("../resources/file_manager/ui/atmosphereFx.js");
    expect(atmo.ATMOSPHERE_OPTIONS.length).toBe(194);
    expect(atmo.ATMOSPHERE_MIX_PRESETS.length).toBe(48);

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
    expect(tierBtns.length).toBe(6);
    expect(doc.querySelectorAll(".fm-atmo-card .fm-atmo-preview").length).toBe(194);
    expect(doc.querySelector(".fm-atmo-theme-sync")).toBeTruthy();
    expect(doc.querySelector(".fm-atmo-mixer-dock")).toBeTruthy();

    // Select Modern ARM / Ultra tier and test effects across multiple procedural engines including Weather/Storm Debris, Tesla, Sci-Fi Physics, and Year-2126 Hyper-Dimensional
    doc.querySelector('.fm-atmo-tier-btn[data-tier="ultra"]').click();
    for (const effectId of ["rain", "smoke", "cyberstorm", "nebula", "aurora", "outrun_grid", "neural_nexus", "dna_helix", "quantum_cpu", "black_hole", "liquid_glass_caustics", "m4_raytrace_prism", "win11_mica_bloom", "plasma_storm", "tesla_megacoil", "jacobs_ladder", "plasma_globe", "tokamak_fusion", "lorentz_attractor", "hadron_collider", "cherenkov_glow", "ferrofluid_spikes", "gravitational_waves", "hawking_horizon", "tesseract_4d", "calabi_yau", "penrose_quasicrystal", "klein_mobius", "chronos_retrocausal", "eigen_consciousness", "strangelet_condensate", "metric_fold_origami", "tachyon_braid_2126", "void_metamaterial", "omega_point_2126", "xenotech_biolith", "supercell_tornado", "category5_hurricane", "derecho_squall", "debris_tornado_ef5", "urban_cyclone_debris", "autumn_noreaster_gale", "junkyard_maelstrom", "forest_canopy_tempest", "cyber_alley_typhoon"]) {
      doc.querySelector(`.fm-atmo-card[data-atmo="${effectId}"]`).click();
      expect(doc.documentElement.dataset.atmosphere).toBe(effectId);
      expect(doc.documentElement.dataset.atmosphereTier).toBe("ultra");
      expect(doc.getElementById("fm-atmosphere-layer")?.getAttribute("data-effect")).toBe(effectId);
    }

    // Select M4 Max / Extreme Uncapped tier
    doc.querySelector('.fm-atmo-tier-btn[data-tier="extreme"]').click();
    expect(doc.documentElement.dataset.atmosphereTier).toBe("extreme");
    doc.querySelector('.fm-atmo-tier-btn[data-tier="ultra"]').click();

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

    // Save & Name a custom user preset in the dialog, switch away, recall it in 1 click, then delete it
    const presetInput = doc.querySelector("[data-user-preset-name]") as any;
    expect(presetInput).toBeTruthy();
    presetInput.value = "Hyper-Singularity 2126";
    doc.querySelector('.fm-atmo-preset-btn[data-mix="tesseract_4d+calabi_yau+chronos_retrocausal"]').click();
    const intensityInput = doc.querySelector('.fm-atmo-intensity input[type="range"]') as any;
    intensityInput.value = "85";
    intensityInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    doc.querySelector("[data-save-user-preset]").click();
    await sleep(120);

    const savedChipBtn = doc.querySelector('[data-user-preset="Hyper-Singularity 2126"]') as any;
    expect(savedChipBtn).toBeTruthy();
    expect(atmo.savedAtmospherePresets()[0]?.name).toBe("Hyper-Singularity 2126");
    expect(atmo.savedAtmospherePresets()[0]?.effect).toBe("tesseract_4d+calabi_yau+chronos_retrocausal");
    expect(atmo.savedAtmospherePresets()[0]?.intensity).toBe(85);

    // Switch to "none" and different intensity, then click the saved user preset to restore the 3-layer 2126 mix + 85% intensity
    doc.querySelector('.fm-atmo-card[data-atmo="none"]').click();
    intensityInput.value = "40";
    intensityInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    expect(doc.documentElement.dataset.atmosphere).toBeUndefined();
    (doc.querySelector('[data-user-preset="Hyper-Singularity 2126"]') as any).click();
    expect(doc.documentElement.dataset.atmosphere).toBe("tesseract_4d+calabi_yau+chronos_retrocausal");
    expect(Number(intensityInput.value)).toBe(85);

    // Delete the custom preset via the × button
    (doc.querySelector('[data-delete-user-preset="Hyper-Singularity 2126"]') as any).click();
    await sleep(100);
    expect(doc.querySelector('[data-user-preset="Hyper-Singularity 2126"]')).toBeNull();
    expect(atmo.savedAtmospherePresets().length).toBe(0);

    // Restore sakura+fireflies+aurora+rain for final Apply assertion
    doc.querySelector('.fm-atmo-preset-btn[data-mix="sakura+fireflies+aurora"]').click();
    doc.querySelector('.fm-atmo-card[data-atmo="rain"] .fm-atmo-mix-chip').click();

    // Category filter narrows the visible cards (including Year 2126 and Weather/Storms) and "all" restores all 194
    doc.querySelector('.fm-atmo-cat-btn[data-cat="future2126"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(13); // "none" + 12 Year-2126 effects
    doc.querySelector('.fm-atmo-cat-btn[data-cat="weather"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(37); // "none" + 36 Weather & Storm effects
    doc.querySelector('.fm-atmo-cat-btn[data-cat="physics"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(27);
    doc.querySelector('.fm-atmo-cat-btn[data-cat="cosmic"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBeLessThan(45);
    doc.querySelector('.fm-atmo-cat-btn[data-cat="all"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(194);

    // Tier filter and Animation Engine filter narrow sections/cards and "all" restores all 194
    doc.querySelector('[data-tier-filter="ultra"]').click();
    expect(doc.querySelectorAll(".fm-atmo-section").length).toBe(1);
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(99);
    doc.querySelector('[data-tier-filter="medium"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(55);
    doc.querySelector('[data-tier-filter="low"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(40);
    doc.querySelector('[data-tier-filter="all"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(194);

    doc.querySelector('[data-anim-filter="weather_storm"]').click();
    expect(doc.querySelectorAll('.fm-atmo-card[data-atmo-engine="weather_storm"]').length).toBe(22);
    doc.querySelector('[data-anim-filter="future2126"]').click();
    expect(doc.querySelectorAll('.fm-atmo-card[data-atmo-engine="future2126"]').length).toBe(12);
    doc.querySelector('[data-anim-filter="tesla"]').click();
    expect(doc.querySelectorAll('.fm-atmo-card[data-atmo-engine="tesla"]').length).toBeGreaterThanOrEqual(8);
    doc.querySelector('[data-anim-filter="physics"]').click();
    expect(doc.querySelectorAll('.fm-atmo-card[data-atmo-engine="physics"]').length).toBeGreaterThanOrEqual(14);
    doc.querySelector('[data-anim-filter="all"]').click();
    expect(doc.querySelectorAll(".fm-atmo-card").length).toBe(194);

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

  test("Theme gallery Quick-Jump Category Pills, Template Tier Pills, Animation Pills, Surface Shader Pills, Color Vibe Pills, Sort Order, and Theme Editor Style Presets & Color Harmony Generator work end-to-end", async () => {
    themes.forgetThemeList();
    await themes.showThemePicker();
    await sleep(150);
    expect(doc.querySelectorAll("[data-cat-pill]").length).toBeGreaterThanOrEqual(8);
    expect(doc.querySelectorAll("[data-tier-pill]").length).toBe(4);
    expect(doc.querySelectorAll("[data-anim-pill]").length).toBe(7);
    expect(doc.querySelectorAll("[data-material-pill]").length).toBe(5);
    expect(doc.querySelectorAll("[data-vibe-pill]").length).toBe(7);
    expect(doc.querySelector("[data-reset-filters]")).toBeTruthy();
    expect(doc.querySelector("[data-hw-recommend]")).toBeTruthy();
    expect(doc.querySelector(".theme-random-btn")).toBeTruthy();

    // Filter by Template Tier: Ultra Tier vs Medium vs Low
    doc.querySelector('[data-tier-pill="ultra"]').click();
    await sleep(100);
    const ultraCards = [...doc.querySelectorAll(".theme-card")];
    expect(ultraCards.length).toBeGreaterThanOrEqual(25);
    expect(ultraCards.every((c: any) => c.dataset.tier === "ultra")).toBe(true);

    doc.querySelector('[data-tier-pill="medium"]').click();
    await sleep(100);
    const medCards = [...doc.querySelectorAll(".theme-card")];
    expect(medCards.length).toBeGreaterThanOrEqual(15);
    expect(medCards.every((c: any) => c.dataset.tier === "medium")).toBe(true);

    doc.querySelector('[data-tier-pill="low"]').click();
    await sleep(100);
    const lowCards = [...doc.querySelectorAll(".theme-card")];
    expect(lowCards.length).toBeGreaterThanOrEqual(50);
    expect(lowCards.every((c: any) => c.dataset.tier === "low")).toBe(true);

    // Filter by Animations: Tesla & Sci-Fi Physics and Live Canvas FX
    doc.querySelector('[data-tier-pill="all"]').click();
    doc.querySelector('[data-anim-pill="physics"]').click();
    await sleep(100);
    const physicsCards = [...doc.querySelectorAll(".theme-card")];
    expect(physicsCards.length).toBeGreaterThanOrEqual(22);

    doc.querySelector('[data-anim-pill="atmosphere"]').click();
    await sleep(100);
    const liveFxCards = [...doc.querySelectorAll(".theme-card")];
    expect(liveFxCards.length).toBeGreaterThanOrEqual(22);
    expect(liveFxCards.every((c: any) => c.querySelector(".theme-anim-badge")?.textContent === "🌌 Live FX")).toBe(true);

    // Filter by Surface Material Shader: Liquid Glass
    doc.querySelector('[data-anim-pill="all"]').click();
    doc.querySelector('[data-material-pill="liquid"]').click();
    await sleep(100);
    const liquidCards = [...doc.querySelectorAll(".theme-card")];
    expect(liquidCards.length).toBeGreaterThanOrEqual(5);

    // Filter by OLED Black color vibe, then reset all filters in 1 click
    doc.querySelector('[data-vibe-pill="oled"]').click();
    await sleep(100);
    doc.querySelector("[data-reset-filters]").click();
    await sleep(150);
    expect(doc.querySelectorAll(".theme-card").length).toBeGreaterThanOrEqual(200);

    // Quick Customize (✎) on a card
    const editBtn = doc.querySelector('.theme-edit-quick[data-edit-key="m4_space_black"]') || doc.querySelector(".theme-edit-quick");
    expect(editBtn).toBeTruthy();
    editBtn.click();
    await sleep(450);

    expect(doc.querySelector(".dialog-title").textContent).toBe("Theme editor");
    expect(doc.querySelectorAll("[data-fx-preset]").length).toBe(16);
    expect(doc.querySelectorAll("[data-harmony]").length).toBe(3);

    // Click Tahoe Liquid Glass preset and Auto-harmonize from Accent
    doc.querySelector('[data-fx-preset="liquid_glass"]').click();
    doc.querySelector('[data-harmony="accent"]').click();
    await sleep(450);
    expect(doc.documentElement.getAttribute("data-fx-backdrop")).toBe("liquid");
    expect(doc.documentElement.getAttribute("data-fx-glow")).toBe("bloom");
    expect(doc.documentElement.getAttribute("data-fx-border")).toBe("iridescent");
    expect(doc.documentElement.getAttribute("data-fx-rim")).toBe("on");
    expect(doc.documentElement.getAttribute("data-fx-inner-glow")).toBe("on");

    editorButton("Cancel").click();
    await sleep(400);
    closeDialogs();
  });

  test("Reactive Physics & Arc Surge, Side-by-Side Split-Screen Theme Comparator, 4-Stage Solar Cycle Schedule, and Per-Folder Theme Profiles work end-to-end", async () => {
    const atmo = await import("../resources/file_manager/ui/atmosphereFx.js") as any;
    const testCtx = createContext({ platform: "linux", home: "/home/u", dataDir: "/tmp/x" });

    // 1. Settings sanitization for reactive mode, solar schedule, and folderThemes
    const cleaned = sanitizeSettings({
      atmosphereReactive: "telemetry",
      solarScheduleEnabled: true,
      solarDawnPalette: "van_de_graaff_day",
      solarDayPalette: "liquid_metal_light",
      solarDuskPalette: "tokamak_fusion",
      solarNightPalette: "tesla_coil_plasma",
      folderThemes: {
        "/Users/alice/projects/physics/": "tesla_coil_plasma",
        "/Users/alice/docs": "nord",
        "relative/bad": "dracula",
        "/Users/alice/invalid": "../../bad key",
      },
    }, testCtx);
    expect(cleaned.atmosphereReactive).toBe("telemetry");
    expect(cleaned.solarScheduleEnabled).toBe(true);
    expect(cleaned.solarNightPalette).toBe("tesla_coil_plasma");
    expect(cleaned.folderThemes).toEqual({
      "/Users/alice/projects/physics": "tesla_coil_plasma",
      "/Users/alice/docs": "nord",
    });

    // 2. Reactive Physics & Arc Surge in Atmospheric Special Effects studio
    void atmo.showAtmosphereDialog();
    await sleep(180);
    expect(doc.querySelectorAll("[data-reactive-mode]").length).toBe(4);
    doc.querySelector('.fm-atmo-card[data-atmo="tesla_megacoil"]').click();
    doc.querySelector('[data-reactive-mode="telemetry"]').click();
    expect(doc.documentElement.dataset.atmosphereReactive).toBe("telemetry");

    const surgeBtn = doc.querySelector("[data-surge-btn]");
    expect(surgeBtn).toBeTruthy();
    surgeBtn.click();
    expect(doc.documentElement.dataset.atmosphereSurge).toBe("true");
    expect(atmo.computeReactiveMultiplier(10, "telemetry")).toBeGreaterThan(1.3);

    // 2b. Fast keyboard navigation & live previewing across atmospheric effects
    const teslaCard = doc.querySelector('.fm-atmo-card[data-atmo="tesla_megacoil"]') as any;
    teslaCard.focus();
    teslaCard.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(doc.documentElement.dataset.atmosphere).not.toBe("tesla_megacoil");
    const afterRight = doc.documentElement.dataset.atmosphere;

    const focusedCard = doc.activeElement as any;
    focusedCard.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    expect(doc.documentElement.dataset.atmosphere).not.toBe(afterRight);

    // [ and ] bracket keys step backward/forward anywhere in the dialog
    doc.querySelector(".modal-backdrop").dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "]", bubbles: true }));
    const afterBracketRight = doc.documentElement.dataset.atmosphere;
    doc.querySelector('[data-atmo-step="-1"]').click();
    expect(doc.documentElement.dataset.atmosphere).not.toBe(afterBracketRight);

    // + key nudges intensity up by 5% while previewing on a focused card
    const beforeIntensity = Number((doc.querySelector('.fm-atmo-intensity input[type="range"]') as any).value);
    (doc.activeElement as any).dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "+", bubbles: true }));
    expect(Number((doc.querySelector('.fm-atmo-intensity input[type="range"]') as any).value)).toBe(Math.min(100, beforeIntensity + 5));

    editorButton("Apply effect").click();
    await sleep(250);
    expect(state.settings.atmosphereReactive).toBe("telemetry");

    // Global cycleAtmosphere steps through effects and persists
    const cycled = await atmo.cycleAtmosphere(1, { category: "physics" });
    expect(cycled?.cat).toBe("physics");
    expect(doc.documentElement.dataset.atmosphere).toBe(cycled?.id);
    atmo.applyAtmosphere("none");
    closeDialogs();

    // 3. 4-Stage Solar Cycle Schedule resolution & dialog preset
    state.settings.palette = "";
    state.settings.theme = "auto";
    state.settings.solarScheduleEnabled = true;
    state.settings.solarDawnPalette = "van_de_graaff_day";
    state.settings.solarDayPalette = "liquid_metal_light";
    state.settings.solarDuskPalette = "tokamak_fusion";
    state.settings.solarNightPalette = "tesla_coil_plasma";

    expect(themes.resolveSolarPalette(6)).toBe("van_de_graaff_day");
    expect(themes.resolveSolarPalette(13)).toBe("liquid_metal_light");
    expect(themes.resolveSolarPalette(19)).toBe("tokamak_fusion");
    expect(themes.resolveSolarPalette(23)).toBe("tesla_coil_plasma");
    expect(themes.effectiveAutoPalette(false, 23)).toBe("tesla_coil_plasma");
    expect(themes.effectiveAutoPalette(true, 7)).toBe("van_de_graaff_day");

    void themes.showDayNightPairDialog();
    await sleep(200);
    expect(doc.querySelector("[data-solar-enabled]")).toBeTruthy();
    expect(doc.querySelectorAll("[data-solar-stage]").length).toBe(4);
    const solarPresetBtn = doc.querySelector("[data-solar-preset]");
    expect(solarPresetBtn).toBeTruthy();
    solarPresetBtn.click();
    expect((doc.querySelector('[data-solar-stage="night"]') as any).value).toBe("tesla_coil_plasma");
    editorButton("Clear pair").click();
    await sleep(250);
    expect(state.settings.solarScheduleEnabled).toBe(false);
    closeDialogs();

    // 4. Per-Folder / Workspace Directory Theme Profiles (with subfolder inheritance)
    state.settings.folderThemes = {
      "/workspace/reactor": "tokamak_fusion",
      "/workspace/reactor/cryo": "meissner_superconductor",
    };
    expect(themes.resolveFolderPalette("/workspace/reactor")).toBe("tokamak_fusion");
    expect(themes.resolveFolderPalette("/workspace/reactor/logs/2026")).toBe("tokamak_fusion");
    expect(themes.resolveFolderPalette("/workspace/reactor/cryo/chamber")).toBe("meissner_superconductor");
    expect(themes.resolveFolderPalette("/workspace/other")).toBe("");
    state.settings.folderThemes = {};

    // 5. Side-by-Side Split-Screen Theme Comparator
    void themes.showThemeCompareDialog(undefined, "tesla_coil_plasma", "nord");
    await sleep(200);
    expect(doc.querySelector(".dialog-title")?.textContent).toBe("Compare themes side-by-side");
    const stage = doc.querySelector(".theme-compare-stage");
    const slider = doc.querySelector(".theme-compare-slider") as any;
    expect(stage).toBeTruthy();
    expect(slider).toBeTruthy();
    slider.value = "72";
    slider.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    expect(stage.style.getPropertyValue("--compare-split")).toBe("72%");
    expect(doc.querySelectorAll(".theme-compare-table tbody tr").length).toBe(7);

    doc.querySelector("[data-swap-compare]").click();
    expect((doc.querySelector('[data-compare-select="a"]') as any).value).toBe("nord");
    expect((doc.querySelector('[data-compare-select="b"]') as any).value).toBe("tesla_coil_plasma");

    doc.querySelector('[data-apply-compare="b"]').click();
    await sleep(350);
    expect(state.settings.palette).toBe("tesla_coil_plasma");
    await themes.applyPalette("");
    state.settings.palette = "";
    closeDialogs();
  });

  test("Weather & 3D Debris Storms, File Manager UI Element FX, Custom Icon Packs, Per-Layer Modifiers, Shareable Preset Codes, Universal Premade/Custom Theme Share Codes (CCFM-THEME-v1 / CCFM-PACK-v1), and Theme Hacker Lab work end-to-end", async () => {
    const atmo = await import("../resources/file_manager/ui/atmosphereFx.js") as any;
    const domMod = await import("../resources/file_manager/ui/dom.js") as any;
    const themeStore = await import("../src/features/filemanager/fmThemeStore.ts");

    // 1. Export & import shareable Atmospheric Preset Codes with per-layer modifiers
    const presetCode = atmo.exportAtmospherePresetCode({
      name: "EF5 Leaf & Newspaper Squall",
      effect: "debris_tornado_ef5+autumn_noreaster_gale+urban_cyclone_debris",
      intensity: 94,
      tier: "extreme",
      reactive: "activity",
      layerMods: {
        debris_tornado_ef5: { color: "#38bdf8", opacity: 120, speed: 150 },
        autumn_noreaster_gale: { color: "#f97316", opacity: 105, speed: 135 },
      },
    });
    expect(presetCode).toContain('"format":"bun-rad-studio-atmosphere-preset"');
    const importedPreset = await atmo.importAtmospherePresetCode(presetCode);
    expect(importedPreset).toBeTruthy();
    expect(importedPreset.name).toBe("EF5 Leaf & Newspaper Squall");
    expect(importedPreset.effect).toBe("debris_tornado_ef5+autumn_noreaster_gale+urban_cyclone_debris");
    expect(importedPreset.tier).toBe("extreme");
    expect(importedPreset.layerMods.debris_tornado_ef5.color).toBe("#38bdf8");
    expect(importedPreset.layerMods.autumn_noreaster_gale.speed).toBe(135);

    // 2. Built-in Weather/Storm & Visceral File Manager Themes apply UI Element FX & Custom Icon Packs
    await themes.applyPalette("inferno_fire_folders");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("fire_folders");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("inferno");
    expect(domMod.iconForEntry({ isDirectory: true, name: "src" })).toBe("🔥");
    expect(domMod.iconForEntry({ isDirectory: false, name: "main.ts" })).toBe("⚡");

    await themes.applyPalette("toxic_slime_ooze");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("slime_drip");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("slime");
    expect(domMod.iconForEntry({ isDirectory: true, name: "mutants" })).toBe("🧪");

    await themes.applyPalette("ef5_debris_tornado");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("storm_wind");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("storm_tempest");
    expect(domMod.iconForEntry({ isDirectory: true, name: "tornado_alley" })).toBe("🌪️");

    // 3. Universal Premade & Custom Theme Share Codes (CCFM-THEME-v1 & CCFM-PACK-v1)
    const premadeExport = await api.call("themes/custom/export", { key: "inferno_fire_folders" });
    expect(premadeExport.shareCode?.startsWith("CCFM-THEME-v1:")).toBe(true);
    expect(premadeExport.theme.name).toContain("Inferno");

    // Anyone with Codecaine File Manager can import that 1-line CCFM-THEME-v1 share code directly
    const importedFromCode = await api.call("themes/custom/import", { json: premadeExport.shareCode });
    expect(importedFromCode.importedCount).toBe(1);
    expect(importedFromCode.theme.fx?.uiElementFx).toBe("fire_folders");
    expect(importedFromCode.theme.fx?.iconPackStyle).toBe("inferno");

    // Export a curated Storm & Debris Pack as CCFM-PACK-v1 and import it
    const packExport = await api.call("themes/custom/export-pack", {
      keys: ["ef5_debris_tornado", "inferno_fire_folders", "toxic_slime_ooze", "urban_street_cyclone"],
      packName: "Storm & Visceral Pack",
    });
    expect(packExport.count).toBe(4);
    expect(packExport.shareCode?.startsWith("CCFM-PACK-v1:")).toBe(true);
    const reimportedPack = await api.call("themes/custom/import-pack", { json: packExport.shareCode });
    expect(reimportedPack.importedCount).toBe(4);

    // 4. Theme Hacker Lab: customVars, customCss sanitization, and 1-click nostalgic mutators
    expect(themeStore.validateCustomVars({
      "--row-h": "32px",
      "--radius": "0px",
      "--toolbar-bg": "linear-gradient(90deg, #ff4500, #111)",
    })).toEqual({
      "row-h": "32px",
      radius: "0px",
      "toolbar-bg": "linear-gradient(90deg, #ff4500, #111)",
    });
    expect(() => themeStore.validateCustomVars({ "--evil": "url(javascript:alert(1))" })).toThrow(/disallowed/i);

    const cleanCss = themeStore.sanitizeCustomCss(".row.is-folder { transform: skewX(-3deg); }");
    expect(cleanCss).toContain("skewX(-3deg)");
    const strippedImport = themeStore.sanitizeCustomCss("@import url('https://evil.example/x.css'); .row { opacity: 0.95; }");
    expect(strippedImport).not.toContain("@import");
    expect(strippedImport).toContain("opacity: 0.95");

    // Open Theme Editor and test the 🛠️ Theme Hacker Lab + 1-click Mutators + customVars + customCss
    const editorMod = await import("../resources/file_manager/ui/themeEditor.js") as any;
    expect(editorMod.THEME_HACK_MUTATORS.length).toBeGreaterThanOrEqual(7);

    void editorMod.openThemeEditor({ seedKey: "ef5_debris_tornado" });
    await sleep(300);
    expect(doc.querySelector(".theme-hacker-studio")).toBeTruthy();

    // Click the "🐧 90s Linux / CDE / BeOS Chisel" nostalgic mutator
    const retroMutator = doc.querySelector('[data-hack-mutator="retro_linux_cde"]') as any;
    expect(retroMutator).toBeTruthy();
    retroMutator.click();
    await sleep(250);
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("retro_pixel");
    expect(doc.documentElement.getAttribute("data-corner-profile")).toBe("sharp");

    // Append a CSS snippet chip and save the hacked theme
    const snippetBtn = doc.querySelector('[data-css-snippet="retro_bevel"]') as any;
    expect(snippetBtn).toBeTruthy();
    snippetBtn.click();

    const nameInput = doc.querySelector(".theme-editor input[type='text']") as any;
    nameInput.value = "My Nostalgic CDE Hacked Theme";
    nameInput.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));

    editorButton("Save theme").click();
    await sleep(350);
    closeDialogs();

    const savedCustom = await api.call("themes/list", {});
    const hacked = savedCustom.themes.find((t: any) => t.name === "My Nostalgic CDE Hacked Theme");
    expect(hacked).toBeTruthy();
    const hackedDetail = await api.call("themes/get", { key: hacked.key });
    expect(hackedDetail.source?.fx?.iconPackStyle).toBe("retro_pixel");
    expect(hackedDetail.source?.fx?.customVars?.radius).toBe("0px");
    expect(hackedDetail.source?.fx?.customCss).toContain("inset 1px 1px 0");

    // 5. 🎬 Theme Show & Screensaver Studio (modes, channels, HUD, stepping, pause/resume, and restore on exit)
    expect((themes as any).THEME_SHOW_MODES_META.length).toBe(4);
    expect((themes as any).THEME_SHOW_CHANNELS_META.length).toBe(11);

    void (themes as any).showThemeShowDialog();
    await sleep(200);
    expect(doc.querySelector(".dialog-title")?.textContent).toBe("Theme Show & Screensaver Studio");
    expect(doc.querySelectorAll("[data-show-mode-card]").length).toBe(4);
    expect(doc.querySelectorAll("[data-show-channel-card]").length).toBe(11);
    (doc.querySelector('[data-show-mode-card="retro_afterdark"]') as any).click();
    (doc.querySelector('[data-show-channel-card="storms_debris"]') as any).click();
    editorButton("🎬 Launch Theme Show Now").click();
    await sleep(350);

    expect((themes as any).isThemeShowActive()).toBe(true);
    expect(doc.documentElement.dataset.themeShow).toBe("retro_afterdark");
    expect(doc.getElementById("fm-theme-show-overlay")).toBeTruthy();
    expect(doc.querySelector("[data-theme-show-retro-badge]")).toBeTruthy();
    expect(doc.querySelector("[data-theme-show-clock]")?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    const firstSceneText = doc.querySelector("[data-theme-show-now-playing]")?.textContent;
    await (themes as any).stepThemeShow(1);
    const secondSceneText = doc.querySelector("[data-theme-show-now-playing]")?.textContent;
    expect(secondSceneText).not.toBe(firstSceneText);

    expect((themes as any).togglePauseThemeShow()).toBe(true);
    expect(doc.querySelector("[data-theme-show-pause]")?.textContent).toContain("Resume");
    expect((themes as any).togglePauseThemeShow()).toBe(false);

    await (themes as any).stopThemeShow({ keepCurrent: false });
    expect((themes as any).isThemeShowActive()).toBe(false);
    expect(doc.getElementById("fm-theme-show-overlay")).toBeNull();
    expect(doc.documentElement.dataset.themeShow).toBeUndefined();

    // 6. 📦 Bulk Theme Import & Auto-Prompt Conflict Resolution (replace, keep_both/rename, merge_fx, skip)
    const codeA = themeStore.encodeThemeShareCode(validateDraft({
      name: "My Nostalgic CDE Hacked Theme", // Conflicts with existing custom theme!
      dark: true,
      colors: { background: "#05070a", card: "#101622", text: "#f0f6ff", accent: "#00ffaa" },
      fx: { glow: "plasma", glowColor: "#00ffaa", glowColor2: "#00ffaa", blur: 24, glass: 0.65, glowIntensity: 0.9, borderOpacity: 0.4, grain: "none", scanlines: "none", radius: "round", border: "neon", motion: "spring", sheen: true, noise: false, chromatic: true, ambient: true, atmosphere: "debris_tornado_ef5+cyberstorm", uiElementFx: "fire_folders", iconPackStyle: "inferno" },
    }));
    const codeB = themeStore.encodeThemeShareCode(validateDraft({
      name: "Brand New Storm Theme", // Clean (no conflict)
      dark: true,
      colors: { background: "#080c14", card: "#121a28", text: "#e8f0ff", accent: "#38bdf8" },
    }));
    const codeDuplicateB = themeStore.encodeThemeShareCode(validateDraft({
      name: "Brand New Storm Theme", // Batch duplicate conflict!
      dark: true,
      colors: { background: "#0a101d", card: "#162032", text: "#ffffff", accent: "#f43f5e" },
    }));

    const multiLineBulkPayload = `${codeA}\n${codeB}\n${codeDuplicateB}`;
    const inspection = await api.call("themes/custom/inspect-pack", { text: multiLineBulkPayload });
    expect(inspection.totalCount).toBe(3);
    expect(inspection.conflictCount).toBe(2);
    expect(inspection.cleanCount).toBe(1);
    expect(inspection.items[0].conflictKind).toBe("existing_custom");
    expect(inspection.items[0].changedColors).toContain("accent");
    expect(inspection.items[1].conflictKind).toBe("none");
    expect(inspection.items[2].conflictKind).toBe("batch_duplicate");

    // Trigger runBulkThemeImportFlow: since conflictCount > 0, it MUST auto-prompt the Conflict Resolution Dialog!
    const flowPromise = (themes as any).runBulkThemeImportFlow(multiLineBulkPayload, { applyFirst: false });
    await sleep(250);

    expect(doc.querySelector("[data-conflict-summary]")).toBeTruthy();
    expect(doc.querySelectorAll("[data-conflict-row]").length).toBe(2);

    // Choose "keep_both" with custom rename for item 0, and "skip" for item 2 (batch duplicate)
    const select0 = doc.querySelector('[data-conflict-action="0"]') as any;
    const rename0 = doc.querySelector('[data-conflict-rename="0"]') as any;
    expect(select0).toBeTruthy();
    select0.value = "keep_both";
    select0.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    expect(rename0.disabled).toBe(false);
    rename0.value = "My Nostalgic CDE (Storm Edition)";

    const select2 = doc.querySelector('[data-conflict-action="2"]') as any;
    select2.value = "skip";
    select2.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));

    editorButton("✅ Apply Resolutions & Import").click();
    const flowOut = await flowPromise;
    expect(flowOut.completed).toBe(true);
    expect(flowOut.result.addedCount).toBe(2);
    expect(flowOut.result.renamedCount).toBe(1);
    expect(flowOut.result.skippedCount).toBe(1);

    // Also test "replace" and "merge_fx" resolution policies via themes/custom/import-pack
    const replaceRes = await api.call("themes/custom/import-pack", {
      text: codeA,
      resolutions: [{ index: 0, action: "merge_fx" }],
    });
    expect(replaceRes.mergedCount).toBe(1);
    const mergedDetail = await api.call("themes/get", { key: hacked.key });
    expect(mergedDetail.source?.fx?.uiElementFx).toBe("fire_folders");
    expect(mergedDetail.source?.colors?.accent).toBe("#ffbe0b"); // Kept existing CDE accent color while merging Inferno FX!

    // 7. 🍎 High-End 3D Regular Folders & Pictures, 1-Click Jumpstart Kits, Option+] Selection Templates HUD, and Instant Keyboard Paste Import
    const { entryIcon, classifyFolderTopic } = await import("../resources/file_manager/ui/dom.js");
    expect(classifyFolderTopic("Pictures")).toBe("pictures");
    expect(classifyFolderTopic("4K_Camera_Roll")).toBe("pictures");
    expect(classifyFolderTopic("Videos")).toBe("video");
    expect(classifyFolderTopic("Music")).toBe("music");
    expect(classifyFolderTopic("src")).toBe("code");
    expect(classifyFolderTopic("Blender_3D_Assets")).toBe("3d");

    doc.documentElement.setAttribute("data-icon-pack", "macos_tahoe_3d");
    expect(entryIcon({ isDirectory: true, name: "Pictures" })).toBe("🖼️");
    expect(entryIcon({ isDirectory: true, name: "RegularProject" })).toBe("📁");
    expect(entryIcon({ isDirectory: false, kind: "image", name: "hero_8k.png" })).toBe("🏞️");

    doc.documentElement.setAttribute("data-icon-pack", "hdr_photo_studio");
    expect(entryIcon({ isDirectory: true, name: "Photos_RAW" })).toBe("📸");
    expect(entryIcon({ isDirectory: false, kind: "image", name: "portrait.cr3" })).toBe("🖼️");

    // 1-Click Jumpstart Workstation Kits (including Flagship Mac Computers)
    expect((themes as any).JUMPSTART_WORKSTATION_KITS.length).toBeGreaterThanOrEqual(12);
    const kitApplied = await (themes as any).applyJumpstartKit("macos_tahoe_3d_kit");
    expect(kitApplied?.palette).toBe("tahoe_studio_3d");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("tahoe_glass_folders");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("macos_tahoe_3d");

    const macStudioKit = await (themes as any).applyJumpstartKit("mac_studio_m4_ultra_kit");
    expect(macStudioKit?.palette).toBe("mac_studio_m4_ultra");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("xdr_titanium_folders");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("pro_studio_xdr");

    const studioDisplayKit = await (themes as any).applyJumpstartKit("apple_studio_display_5k_kit");
    expect(studioDisplayKit?.palette).toBe("apple_studio_display_5k");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("tahoe_glass_folders");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("macos_tahoe_3d");

    // Option + ] / [ Quick-Switcher HUD & Flagship Selection Templates
    expect((themes as any).OPTION_BRACKET_SHOWCASE_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    expect((themes as any).OPTION_BRACKET_SHOWCASE_TEMPLATES.map((t: any) => t.key)).toEqual(
      expect.arrayContaining([
        "mac_studio_m4_ultra",
        "mac_pro_rack_xdr",
        "macbook_pro_space_black",
        "apple_studio_display_5k",
        "imac_m4_spectrum_p3",
        "macos_sequoia_redwood_xdr",
        "macos_vision_spatial_mac",
        "mac_mini_m4_pro_carbon",
      ]),
    );
    const cycledName = await themes.cycleTheme(1, { showcaseOnly: true, showHud: true });
    expect(cycledName.length).toBeGreaterThan(0);
    const quickHud = doc.getElementById("fm-quick-cycle-hud");
    expect(quickHud).toBeTruthy();
    expect(quickHud?.querySelectorAll("[data-quick-cycle-tpl]").length).toBeGreaterThanOrEqual(10);
    (themes as any).hideQuickCycleHud();
    expect(doc.getElementById("fm-quick-cycle-hud")).toBeNull();

    // Instant Keyboard Paste Theme Import (⌘V / Ctrl+V & looksLikeThemeImportPayload)
    const pasteShareCode = themeStore.encodeThemeShareCode(validateDraft({
      name: "Pasted Instant Mac XDR Theme",
      dark: true,
      colors: { background: "#05070e", card: "#0e1320", text: "#f2f6ff", accent: "#38bdf8" },
      fx: { glow: "bloom", glowColor: "#38bdf8", glowColor2: "#818cf8", blur: 26, glass: 0.65, glowIntensity: 0.85, borderOpacity: 0.3, grain: "none", scanlines: "none", radius: "squircle", border: "iridescent", motion: "spring", sheen: true, noise: false, chromatic: false, ambient: true, atmosphere: "none", uiElementFx: "tahoe_glass_folders", iconPackStyle: "macos_tahoe_3d" },
    }));
    expect((themes as any).looksLikeThemeImportPayload(pasteShareCode)).toBe(true);
    expect((themes as any).looksLikeThemeImportPayload("just normal file name text")).toBe(false);

    const pasteOut = await (themes as any).pasteImportThemesFromText(pasteShareCode, { applyFirst: true });
    expect(pasteOut.completed).toBe(true);
    expect(pasteOut.result.addedCount).toBe(1);
    expect(pasteOut.result.first.name).toBe("Pasted Instant Mac XDR Theme");
    expect(state.settings.palette).toBe(pasteOut.result.first.id);

    // 8. Verify single-select and multi-select visibility rules exist in themeEffects.css and style.css
    const fxCss = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "ui", "themeEffects.css"), "utf8");
    expect(fxCss).toContain("html[data-ui-fx] .row.is-folder.selected");
    expect(fxCss).toContain(":root[data-ui-fx] .row.is-folder.selected");
    expect(fxCss).toContain("#list.view-icons .row.selected");

    // 9. Verify Markdown-wrapped share codes, :root CSS variable blocks, built-in theme export, and disk file export/import
    const mdWrappedCode = "Here is my theme:\n```text\n" + pasteShareCode + "\n```\nEnjoy!";
    expect((themes as any).looksLikeThemeImportPayload(mdWrappedCode)).toBe(true);
    const mdImport = await api.call("themes/custom/import-pack", { text: mdWrappedCode });
    expect(mdImport.inspection.conflictCount).toBe(1);

    const cssBlock = `:root {\n  /* Cyber Sunset CSS — exported from File Manager */\n  --bg: #0b0716;\n  --panel: #161029;\n  --text: #f8f5ff;\n  --accent: #f43f5e;\n  --border: #2e1d4a;\n}`;
    expect((themes as any).looksLikeThemeImportPayload(cssBlock)).toBe(true);
    const cssImported = await api.call("themes/custom/import-pack", { text: cssBlock });
    expect(cssImported.addedCount).toBe(1);
    expect(cssImported.first?.colors?.accent).toBe("#f43f5e");

    // Exporting a built-in theme (e.g. tahoe_studio_3d) works via themes/custom/export
    const builtinExport = await api.call("themes/custom/export", { id: "tahoe_studio_3d" });
    expect(builtinExport.shareCode).toStartWith("CCFM-THEME-v1:");
    expect(builtinExport.text).toContain("Tahoe");

    // Saving a theme file directly to disk via themes/custom/save-file and reading it via themes/custom/read-file
    const savedFile = await api.call("themes/custom/save-file", {
      folder: root,
      name: "test-exported-theme",
      content: builtinExport.text,
    });
    expect(savedFile.path).toContain("test-exported-theme.theme.json");
    const readBack = await api.call("themes/custom/read-file", { path: savedFile.path });
    expect(readBack.text).toContain("Tahoe");
    const importedFromFile = await api.call("themes/custom/import-pack", { text: readBack.text });
    expect(importedFromFile.addedCount + importedFromFile.inspection.conflictCount).toBeGreaterThanOrEqual(1);

    // 10. Verify every UI_ELEMENT_FX_OPTIONS & ICON_PACK_OPTIONS applies cleanly with single-select & multi-select rows
    for (const fxOpt of (themes as any).UI_ELEMENT_FX_OPTIONS) {
      (themes as any).applyUiImmersionProfiles({ uiElementFx: fxOpt.id });
      if (fxOpt.id === "off") {
        expect(doc.documentElement.hasAttribute("data-ui-fx")).toBe(false);
      } else if (fxOpt.id !== "auto") {
        expect(doc.documentElement.getAttribute("data-ui-fx")).toBe(fxOpt.id);
      }
    }
    for (const iconOpt of (themes as any).ICON_PACK_OPTIONS) {
      (themes as any).applyUiImmersionProfiles({ iconPackStyle: iconOpt.id });
      if (iconOpt.id === "default") {
        expect(doc.documentElement.hasAttribute("data-icon-pack")).toBe(false);
      } else {
        expect(doc.documentElement.getAttribute("data-icon-pack")).toBe(iconOpt.id);
      }
    }

    // 11. Verify Tripped & Psychedelic themes, Google Flagship themes, Unique Complete Worlds, 120+ System Icons, Jumpstart Kits, and Theme Hacker Mutators
    const trippyAndUniqueKeys = [
      "kaleidoscope_mandala",
      "lava_lamp_groovy_69",
      "dmt_hyperspace_lattice",
      "holographic_oil_slick",
      "electric_mycelium_forest",
      "optical_moire_hypnosis",
      "acid_house_rave_92",
      "mobius_wormhole_odyssey",
      "pastel_dreamcore_cloud",
      "solarpunk_kaleidoscope_day",
      "google_gemini_ultra",
      "google_material_you_3d",
      "google_pixel_amoled",
      "google_deepmind_quantum",
      "google_cloud_vertex_pro",
      "google_project_idx_studio",
      "google_chromeos_aurora",
      "google_workspace_daylight",
      "ayahuasca_vine_vision",
      "alex_grey_astral_cathedral",
      "summer_of_love_tiedye_67",
      "vaporwave_mall_plaza_95",
      "frutiger_aero_aqua_2007",
      "steampunk_chronometer_foundry",
      "art_deco_metropolis_1929",
      "synth_arcade_crt_1984",
      "mariana_bioluminescent_trench",
      "kyoto_zen_karesansui_day",
    ];
    const { themes: allThemes } = await api.call("themes/list");
    for (const tk of trippyAndUniqueKeys) {
      const found = allThemes.find((t: any) => t.key === tk);
      expect(found).toBeDefined();
      expect(found!.hasEffects).toBe(true);
    }
    expect((domMod as any).SYSTEM_ICON_CATALOG.length).toBeGreaterThanOrEqual(120);
    expect((domMod as any).resolveSystemIcon("Dockerfile", false)?.id).toBe("exact_dockerfile");
    expect((domMod as any).resolveSystemIcon("bun.lockb", false)?.id).toBe("exact_bun_lock");
    expect((domMod as any).resolveSystemIcon("model.safetensors", false)?.id).toBe("ext_ai_weights");
    expect((domMod as any).resolveSystemIcon("kubernetes", true)?.topic).toBe("kubernetes");
    expect(domMod.iconFor("Dockerfile", false, "google_material_3d")).toBe("🐳");
    expect(domMod.iconFor("models", true, "google_material_3d")).toBe("✨");

    const geminiKit = await (themes as any).applyJumpstartKit("google_gemini_ultra_kit");
    expect(geminiKit?.palette).toBe("google_gemini_ultra");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("google_material_folders");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("google_material_3d");

    const kaleidoKit = await (themes as any).applyJumpstartKit("kaleidoscope_trip_kit");
    expect(kaleidoKit?.palette).toBe("kaleidoscope_mandala");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("kaleidoscope_prism");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("psychedelic_trip");
    expect(domMod.iconFor("Photos", true, "psychedelic_trip")).toBe("🌈");
    expect(domMod.iconFor("Music", true, "lava_groovy")).toBe("🎸");
    expect(domMod.iconFor("Videos", true, "op_art_illusion")).toBe("🌀");
    expect(fxCss).toContain('html[data-ui-fx="kaleidoscope_prism"]');
    expect(fxCss).toContain('html[data-ui-fx="lava_wax"]');
    expect(fxCss).toContain('html[data-ui-fx="acid_warp"]');
    expect(fxCss).toContain('html[data-ui-fx="oil_slick_chrome"]');
    expect(fxCss).toContain('html[data-ui-fx="shroom_spores"]');
    expect(fxCss).toContain(':root[data-ui-fx="google_material_folders"]');

    // 12. Verify US Holidays (18), Nerd Complete (10), Horror (10), Real-World Objects (6), Authentic Folder/File Silhouettes, Screen-Melting Distortion, and Special Effects Design Wizard
    const newExpansionKeys = [
      // US Holidays (18)
      "holiday_new_years_times_square",
      "holiday_mlk_dream_memorial",
      "holiday_valentines_velvet_rose",
      "holiday_presidents_mount_rushmore",
      "holiday_st_patricks_emerald_clover",
      "holiday_easter_pastel_egg_hunt",
      "holiday_mothers_day_botanical_tea",
      "holiday_memorial_day_poppy_honor",
      "holiday_juneteenth_jubilee_star",
      "holiday_fathers_day_leather_den",
      "holiday_fourth_of_july_fireworks",
      "holiday_labor_day_rivet_forge",
      "holiday_halloween_jack_o_lantern",
      "holiday_dia_de_los_muertos_marigold",
      "holiday_veterans_day_valor_medallion",
      "holiday_thanksgiving_harvest_hearth",
      "holiday_hanukkah_menorah_sapphire",
      "holiday_christmas_nutcracker_hearth",
      // Nerd Complete (10)
      "nerd_dnd_arcane_grimoire",
      "nerd_starfleet_lcars_bridge",
      "nerd_kyber_holocron_forge",
      "nerd_lotr_mithril_elven",
      "nerd_mecha_eva_nerv_hud",
      "nerd_defcon_blackhat_mainframe",
      "nerd_16bit_snes_jrpg_cartridge",
      "nerd_golden_age_comic_halftone",
      "nerd_apollo_11_dsky_guidance",
      "nerd_enigma_bletchley_cipher",
      // Horror (10)
      "horror_nosferatu_blood_moon",
      "horror_lovecraft_eldritch_rlyeh",
      "horror_vhs_found_footage_1999",
      "horror_silent_fog_asylum",
      "horror_biohazard_containment_lab",
      "horror_camp_crystal_slasher_80s",
      "horror_haunted_victorian_seance",
      "horror_necronomicon_parchment_day",
      "horror_thalassophobia_abyssal_jaw",
      "horror_cursed_carnival_calliope",
      // Real-World Tactile Objects (6)
      "realworld_grandfather_clockwork_mahogany",
      "realworld_vinyl_jukebox_wurlitzer",
      "realworld_stained_glass_cathedral",
      "realworld_murano_blown_glass_day",
      "realworld_katana_urushi_forge",
      "realworld_pinball_wizard_arcade",
    ];
    for (const nk of newExpansionKeys) {
      const found = allThemes.find((t: any) => t.key === nk);
      expect(found).toBeDefined();
      expect(found!.hasEffects).toBe(true);
      expect(found!.uiElementFx).toBeTruthy();
      expect(found!.iconPackStyle).toBeTruthy();
    }

    // Verify all prebuilt EDITOR_FX_PRESETS and PREBUILT_WALLPAPER_SCENES have 3D effects baked in out of the box
    for (const preset of editorMod.EDITOR_FX_PRESETS) {
      if (preset.id !== "off") {
        expect(preset.fx?.uiElementFx).toBeTruthy();
        expect(preset.fx?.iconPackStyle).toBeTruthy();
      }
    }
    expect(editorMod.PREBUILT_WALLPAPER_SCENES.length).toBeGreaterThanOrEqual(16);
    for (const scene of editorMod.PREBUILT_WALLPAPER_SCENES) {
      expect(scene.fx?.uiElementFx).toBeTruthy();
      expect(scene.fx?.iconPackStyle).toBeTruthy();
    }

    // Authentic Folder & File Silhouettes: folders remain recognizable folders (📁/📂/🗂️) and files remain recognizable files (📄/📝/🖼️/💻/📦)
    for (const pack of ["us_holidays_festive", "nerd_rpg_arcane", "nerd_scifi_fleet", "nerd_hacker_retro", "horror_crypt", "realworld_objects"]) {
      expect(["📁", "📂", "🗂️"]).toContain(domMod.iconFor("Documents", true, pack));
      expect(["📁", "📂", "🗂️"]).toContain(domMod.iconFor("RegularFolder", true, pack));
      expect(["📄", "📃", "📝"]).toContain(domMod.iconFor("notes.txt", false, pack));
      expect(["💻", "📄"]).toContain(domMod.iconFor("index.ts", false, pack));
      expect(["📦"]).toContain(domMod.iconFor("archive.zip", false, pack));
    }
    expect(fxCss).toContain('.row.is-folder .c-icon[data-is-folder="1"]::before');
    expect(fxCss).toContain('.row:not(.is-folder) .c-icon[data-is-folder="0"]::after');

    // Screen-Melting & Optical Distortion Shaders + SVG Displacement Filters
    const meltKit = await (themes as any).applyJumpstartKit("screen_melt_distortion_kit");
    expect(meltKit?.palette).toBe("horror_biohazard_containment_lab");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("screen_melt_ooze");
    expect(doc.getElementById("fm-svg-distortion-filters")).toBeTruthy();
    expect(doc.getElementById("fm-filter-screen-melt")).toBeTruthy();
    expect(doc.getElementById("fm-filter-molten-glass")).toBeTruthy();
    expect(doc.getElementById("fm-filter-liquid-ripple")).toBeTruthy();
    expect(fxCss).toContain(':root[data-ui-fx="screen_melt_ooze"]');
    expect(fxCss).toContain(':root[data-ui-fx="molten_lava_melt"]');
    expect(fxCss).toContain(':root[data-ui-fx="crt_magnetic_warp"]');
    expect(fxCss).toContain(':root[data-ui-fx="fever_dream_ripple"]');

    // Special Effects Design Wizard recipes
    expect(editorMod.SPECIAL_EFFECTS_DESIGN_WIZARD_RECIPES.length).toBeGreaterThanOrEqual(12);
    expect(editorMod.SPECIAL_EFFECTS_DESIGN_WIZARD_RECIPES.map((r: any) => r.id)).toEqual(
      expect.arrayContaining([
        "wizard_mahogany_clockwork",
        "wizard_cathedral_stained_glass",
        "wizard_holiday_fireworks_gala",
        "wizard_dnd_arcane_grimoire",
        "wizard_nosferatu_blood_moon",
        "wizard_dali_screen_melt",
        "wizard_molten_furnace_melt",
      ]),
    );

    // 13. Plain Themes (No Animations) Browse Mode Bar, Instant Plain Picks, Section Jump Bar, Kill Animations button & Themes Menu
    const menuMod = await import("../resources/file_manager/ui/themeMenu.js") as any;
    const menuItems = await menuMod.themeMenuItems();
    const menuLabels = menuItems.map((it: any) => it.label).filter(Boolean);
    expect(menuLabels).toContain("Plain themes (no animations)…");
    expect(menuLabels).toContain("Plain dark themes (no FX)…");
    expect(menuLabels).toContain("Plain light themes (no FX)…");
    expect(menuLabels).toContain("Turn off all animations & FX");

    // Open Theme Gallery directly in Plain Themes mode
    closeDialogs();
    await (themes as any).showThemePicker({ filter: "plain" });
    await sleep(120);
    expect(doc.querySelector('[data-browse-mode="plain"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(doc.querySelector("details[data-fx-studio-drawer]")?.hasAttribute("open")).toBe(false);
    expect(doc.querySelectorAll("[data-plain-quick]").length).toBeGreaterThanOrEqual(15);
    expect(doc.querySelectorAll("[data-jump-section]").length).toBeGreaterThanOrEqual(5);

    const plainGalleryCards = [...doc.querySelectorAll(".theme-card")];
    expect(plainGalleryCards.length).toBeGreaterThanOrEqual(140);
    expect(plainGalleryCards.some((c: any) => c.querySelector(".theme-fx-badge"))).toBe(false);
    const plainHeadings = [...doc.querySelectorAll(".theme-list h3")].map((h: any) => h.textContent);
    expect(plainHeadings.some((h: string) => h.startsWith("Futuristic"))).toBe(false);
    expect(plainHeadings.some((h: string) => h.startsWith("Editors and classics"))).toBe(true);

    // Switch to Plain Dark, Plain Light, Plain Editors, and Plain OS Classics via 1-click Browse Mode tabs
    (doc.querySelector('[data-browse-mode="plain-dark"]') as any).click();
    await sleep(80);
    const plainDarkCards = [...doc.querySelectorAll(".theme-card")];
    expect(plainDarkCards.length).toBeGreaterThanOrEqual(100);
    expect(plainDarkCards.every((c: any) => c.querySelector(".theme-kind")?.textContent === "Dark")).toBe(true);

    (doc.querySelector('[data-browse-mode="plain-light"]') as any).click();
    await sleep(80);
    const plainLightCards = [...doc.querySelectorAll(".theme-card")];
    expect(plainLightCards.length).toBeGreaterThanOrEqual(25);
    expect(plainLightCards.every((c: any) => c.querySelector(".theme-kind")?.textContent === "Light")).toBe(true);

    (doc.querySelector('[data-browse-mode="plain-os"]') as any).click();
    await sleep(80);
    const plainOsHeadings = [...doc.querySelectorAll(".theme-list h3")].map((h: any) => h.textContent);
    expect(plainOsHeadings.some((h: string) => h.startsWith("macOS"))).toBe(true);
    expect(plainOsHeadings.some((h: string) => h.startsWith("Windows"))).toBe(true);
    expect(plainOsHeadings.some((h: string) => h.startsWith("Futuristic"))).toBe(false);

    // Apply an FX theme's colors only (without animations or special effects) via applyThemePlainColorsOnly
    await (themes as any).applyThemePlainColorsOnly("holiday_christmas_nutcracker_hearth", { quiet: true });
    expect(state.settings.palette).toBe("holiday_christmas_nutcracker_hearth");
    expect(doc.documentElement.dataset.fx).toBeUndefined();
    expect(doc.getElementById("fm-theme-effects")).toBeNull();
    expect(doc.documentElement.hasAttribute("data-ui-fx")).toBe(false);
    expect(doc.documentElement.dataset.atmosphere).toBeUndefined();

    // Activate an animated Jumpstart Kit, then click an Instant Plain Theme chip ([data-plain-quick="dracula"]) and verify all animations stop
    await (themes as any).applyJumpstartKit("screen_melt_distortion_kit");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("screen_melt_ooze");
    (doc.querySelector('[data-plain-quick="dracula"]') as any).click();
    await sleep(120);
    expect(state.settings.palette).toBe("dracula");
    expect(doc.documentElement.hasAttribute("data-ui-fx")).toBe(false);
    expect(doc.documentElement.dataset.atmosphere).toBeUndefined();
    expect(doc.documentElement.dataset.fx).toBeUndefined();

    // 14. Massive Apple-Level Customization Pack (Shaders, Icon Packs, Typography/Corner/Glow Profiles, Mutators, Snippets, Wizards, Wallpapers)
    for (const appleFx of [
      "cupertino_ceramic_bevel",
      "swiss_sapphire_chronograph",
      "teenage_field_anodized",
      "blueprint_cad_cyanotype",
      "kyoto_washi_sumi",
      "carbon_kevlar_weave",
    ]) {
      (themes as any).applyUiImmersionProfiles({ uiElementFx: appleFx });
      expect(doc.documentElement.getAttribute("data-ui-fx")).toBe(appleFx);
      expect(fxCss).toContain(`[data-ui-fx="${appleFx}"]`);
    }
    for (const applePack of [
      "cupertino_hig_studio",
      "swiss_horology_gold",
      "teenage_field_synth",
      "blueprint_cad_pro",
      "kyoto_zen_ink",
      "carbon_aerospace",
    ]) {
      (themes as any).applyUiImmersionProfiles({ iconPackStyle: applePack });
      expect(doc.documentElement.getAttribute("data-icon-pack")).toBe(applePack);
      expect(["📁", "📂", "🗂️"]).toContain(domMod.iconFor("Projects", true, applePack));
      expect(["💻", "🧑‍💻", "📄"]).toContain(domMod.iconFor("main.ts", false, applePack));
    }
    for (const fp of ["humanist_hig", "swiss_grotesk", "drafting_cad"]) {
      (themes as any).applyUiImmersionProfiles({ themeFontProfile: fp });
      expect(doc.documentElement.getAttribute("data-font-profile")).toBe(fp);
      expect(fxCss).toContain(`[data-font-profile="${fp}"]`);
    }
    for (const cp of ["squircle_hig", "chamfered"]) {
      (themes as any).applyUiImmersionProfiles({ themeCornerProfile: cp });
      expect(doc.documentElement.getAttribute("data-corner-profile")).toBe(cp);
      expect(fxCss).toContain(`[data-corner-profile="${cp}"]`);
    }
    for (const gp of ["ambient_p3", "xdr_specular"]) {
      (themes as any).applyUiImmersionProfiles({ themeIconGlow: gp });
      expect(doc.documentElement.getAttribute("data-icon-glow")).toBe(gp);
      expect(fxCss).toContain(`[data-icon-glow="${gp}"]`);
    }
    expect(editorMod.THEME_HACK_MUTATORS.length).toBeGreaterThanOrEqual(16);
    expect(editorMod.CUSTOM_CSS_SNIPPETS.length).toBeGreaterThanOrEqual(12);
    expect(editorMod.SPECIAL_EFFECTS_DESIGN_WIZARD_RECIPES.length).toBeGreaterThanOrEqual(20);
    expect(editorMod.PREBUILT_WALLPAPER_SCENES.length).toBeGreaterThanOrEqual(20);

    // 15. Live CPU & GPU Telemetry Studio (VFD P/E Core Bars, Oscilloscope, 4-Quadrant Dials, 16-Band Spectrum, Load Shedder — Zero TMOG references)
    expect((themes as any).TELEMETRY_PHOSPHOR_MODES.length).toBe(6);
    expect((themes as any).TELEMETRY_INSTRUMENT_SKINS.length).toBe(4);
    expect(JSON.stringify((themes as any).TELEMETRY_PHOSPHOR_MODES).toLowerCase()).not.toContain("tmog");
    expect(JSON.stringify((themes as any).TELEMETRY_INSTRUMENT_SKINS).toLowerCase()).not.toContain("tmog");

    const plainTele = (themes as any).estimateThemeResourceTelemetry({ key: "dracula", name: "Dracula", hasEffects: false });
    expect(plainTele.gpuPct).toBe(0);
    expect(plainTele.grade).toBe("ZERO-OVERHEAD");
    expect(plainTele.pCores.length).toBe(8);
    expect(plainTele.eCores.length).toBe(8);
    expect(plainTele.gpuCores.length).toBe(8);
    expect(plainTele.spectrumBands.length).toBe(16);

    const fxTele = (themes as any).estimateThemeResourceTelemetry({
      key: "macos_tahoe_liquid_aurora",
      name: "macOS Tahoe Liquid Aurora",
      hasEffects: true,
      backdropStyle: "liquid",
      uiElementFx: "cupertino_ceramic_bevel",
      atmosphere: "aurora_borealis",
    });
    expect(fxTele.gpuPct).toBeGreaterThan(plainTele.gpuPct);
    expect(fxTele.cpuPct).toBeGreaterThan(plainTele.cpuPct);

    const hudEl = await (themes as any).showTelemetryPopoutHud();
    expect(hudEl).toBeTruthy();
    expect(doc.getElementById("fm-telemetry-popout-hud")).toBeTruthy();
    expect((themes as any).isTelemetryPopoutHudOpen()).toBe(true);
    expect(hudEl.textContent.toLowerCase()).not.toContain("tmog");
    const skinBtns = [...hudEl.querySelectorAll("[data-telemetry-skin-btn]")];
    expect(skinBtns.length).toBe(4);
    (hudEl.querySelector('[data-telemetry-skin-btn="quadrant_gauges"]') as any).click();
    expect(hudEl.querySelectorAll("[data-telemetry-dial]").length).toBe(4);
    (hudEl.querySelector('[data-telemetry-skin-btn="winamp_spectrum"]') as any).click();
    expect(hudEl.querySelectorAll("[data-telemetry-spectrum-band]").length).toBe(16);
    (hudEl.querySelector('[data-telemetry-skin-btn="subsystem_profiler"]') as any).click();
    expect(hudEl.querySelectorAll("[data-telemetry-subsystem-row]").length).toBe(6);

    // Top close button dismisses the floating HUD immediately
    const topCloseBtn = hudEl.querySelector('[data-telemetry-top-close="true"]') as any;
    expect(topCloseBtn).toBeTruthy();
    topCloseBtn.click();
    expect(doc.getElementById("fm-telemetry-popout-hud")).toBeNull();
    expect((themes as any).isTelemetryPopoutHudOpen()).toBe(false);

    // toggleTelemetryPopoutHud opens when closed and closes when open
    await (themes as any).toggleTelemetryPopoutHud();
    expect((themes as any).isTelemetryPopoutHudOpen()).toBe(true);
    await (themes as any).toggleTelemetryPopoutHud();
    expect((themes as any).isTelemetryPopoutHudOpen()).toBe(false);
    expect(doc.getElementById("fm-telemetry-popout-hud")).toBeNull();

    // disableAllThemeAnimations also dismisses any open floating HUD
    await (themes as any).showTelemetryPopoutHud();
    expect(doc.getElementById("fm-telemetry-popout-hud")).toBeTruthy();
    await (themes as any).disableAllThemeAnimations();
    expect(doc.getElementById("fm-telemetry-popout-hud")).toBeNull();

    // 16. Apple-Style Live Custom Theme Preview Stage & Section Focus / View Mover in Theme Editor
    closeDialogs();
    void editorMod.openThemeEditor({ from: "dracula" });
    await sleep(120);

    const livePreviewStage = doc.querySelector('[data-editor-live-preview="true"]') as any;
    expect(livePreviewStage).toBeTruthy();
    expect(doc.querySelectorAll("[data-preview-row]").length).toBe(5);
    expect(doc.querySelectorAll("button[data-preview-dock]").length).toBe(3);
    expect(doc.querySelector('[data-editor-peek-btn="true"]')).toBeTruthy();

    // Clicking a sample file row in the Live Preview Stage updates selection state immediately
    const secondPreviewRow = doc.querySelectorAll("[data-preview-row]")[1] as any;
    secondPreviewRow.click();
    expect(secondPreviewRow.classList.contains("selected")).toBe(true);
    expect(secondPreviewRow.getAttribute("aria-pressed")).toBe("true");

    // Switching Live Preview dock mode (Top Stage -> Split View -> Compact)
    const splitDockBtn = doc.querySelector('button[data-preview-dock="split"]') as any;
    splitDockBtn.click();
    expect(doc.querySelector(".theme-editor")?.getAttribute("data-preview-dock")).toBe("split");
    const topDockBtn = doc.querySelector('button[data-preview-dock="top"]') as any;
    topDockBtn.click();
    expect(doc.querySelector(".theme-editor")?.getAttribute("data-preview-dock")).toBe("top");

    // Toggling Peek Full Workspace makes dialog translucent so background File Manager is visible
    const peekBtn = doc.querySelector('[data-editor-peek-btn="true"]') as any;
    peekBtn.click();
    expect(peekBtn.getAttribute("aria-pressed")).toBe("true");
    peekBtn.click();
    expect(peekBtn.getAttribute("aria-pressed")).toBe("false");

    // Section Focus & View Mover: supports Apple Simple Essentials mode (basics + colors + effects focused, hacker unfocused)
    expect(editorMod.EDITOR_FOCUS_SECTIONS.length).toBe(7);
    expect(doc.querySelector('[data-editor-focus-tab="all"]')?.getAttribute("aria-pressed")).toBe("true");
    (doc.querySelector('[data-editor-focus-tab="simple"]') as any).click();
    expect(doc.querySelector('[data-editor-focus-tab="simple"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(doc.querySelector('[data-editor-section="basics"]')?.getAttribute("data-section-focused")).toBe("true");
    expect(doc.querySelector('[data-editor-section="colors"]')?.getAttribute("data-section-focused")).toBe("true");
    expect(doc.querySelector('[data-editor-section="hacker"]')?.getAttribute("data-section-focused")).toBe("false");
    expect(doc.querySelector('[data-editor-section="hacker"]')?.classList.contains("is-unfocused-section")).toBe(true);

    // Focusing a specific section ("effects") isolates that section when Isolate mode is active
    (doc.querySelector('[data-editor-focus-tab="effects"]') as any).click();
    expect(doc.querySelector('[data-editor-section="effects"]')?.getAttribute("data-section-focused")).toBe("true");
    expect(doc.querySelector('[data-editor-section="basics"]')?.getAttribute("data-section-focused")).toBe("false");

    // Next Section ▶ and ◀ Prev Section buttons move the user's view between sections
    (doc.querySelector('[data-editor-next-section="true"]') as any).click();
    expect(doc.querySelector(".theme-editor")?.getAttribute("data-editor-focus")).toBe("wizard");
    expect(doc.querySelector('[data-editor-section="wizard"]')?.getAttribute("data-section-focused")).toBe("true");

    (doc.querySelector('[data-editor-prev-section="true"]') as any).click();
    expect(doc.querySelector(".theme-editor")?.getAttribute("data-editor-focus")).toBe("effects");

    // Clicking "All Sections" shows all 5 editor sections at once
    (doc.querySelector('[data-editor-focus-tab="all"]') as any).click();
    for (const secId of ["basics", "colors", "effects", "wizard", "hacker"]) {
      expect(doc.querySelector(`[data-editor-section="${secId}"]`)?.getAttribute("data-section-focused")).toBe("true");
    }

    // Per-section Collapse/Expand button works cleanly
    const collapseBasicsBtn = doc.querySelector('[data-collapse-section-btn="basics"]') as any;
    collapseBasicsBtn.click();
    expect(doc.querySelector('[data-editor-section="basics"]')?.getAttribute("data-section-collapsed")).toBe("true");
    collapseBasicsBtn.click();
    expect(doc.querySelector('[data-editor-section="basics"]')?.getAttribute("data-section-collapsed")).toBe("false");

    await themes.applyPalette("");
    atmo.applyAtmosphere("none");
    (themes as any).applyUiImmersionProfiles({ uiElementFx: "off", iconPackStyle: "default" });
    closeDialogs();
  });

  test("God-Mode Year 3000+ post-singularity themes, shaders, 3D icon packs, and workstation kits apply cleanly", async () => {
    const kits = (themes as any).JUMPSTART_WORKSTATION_KITS as any[];
    const omegaKit = kits.find((k) => k.id === "godmode_omega_singularity_kit");
    expect(omegaKit).toBeDefined();
    expect(omegaKit.palette).toBe("omega_point_singularity");
    expect(omegaKit.uiElementFx).toBe("godmode_omega_halo");
    expect(omegaKit.iconPackStyle).toBe("godmode_celestial");

    const photonicKit = kits.find((k) => k.id === "godmode_photonic_3099_kit");
    expect(photonicKit).toBeDefined();
    expect(photonicKit.palette).toBe("photonic_metamaterial_3099");
    expect(photonicKit.uiElementFx).toBe("godmode_photonic_crystal");
    expect(photonicKit.iconPackStyle).toBe("godmode_photonic");

    await themes.applyPalette("omega_point_singularity");
    (themes as any).applyUiImmersionProfiles({
      uiElementFx: "godmode_omega_halo",
      iconPackStyle: "godmode_celestial",
    });
    expect(doc.documentElement.getAttribute("data-palette")).toBe("omega_point_singularity");
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("godmode_omega_halo");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("godmode_celestial");

    const domMod = await import("../resources/file_manager/ui/dom.js");
    expect(domMod.iconForEntry({ isDirectory: true, name: "singularity" })).toBe("🪐");
    expect(domMod.iconForEntry({ isDirectory: false, name: "kernel.ts" })).toBe("⚡");

    (themes as any).applyUiImmersionProfiles({
      uiElementFx: "godmode_chrono_crystal",
      iconPackStyle: "godmode_chrono",
    });
    expect(doc.documentElement.getAttribute("data-ui-fx")).toBe("godmode_chrono_crystal");
    expect(doc.documentElement.getAttribute("data-icon-pack")).toBe("godmode_chrono");
    expect(domMod.iconForEntry({ isDirectory: true, name: "vault" })).toBe("⏳");

    // Cross-platform hardware optimization presets (macOS Metal, Windows DirectX 12, Linux WebKitGTK / Parallels VM)
    const platformPresets = (themes as any).OPTIMIZE_PLATFORM_PRESETS as any[];
    expect(platformPresets.map((p) => p.id)).toEqual(["macos", "windows", "linux"]);
    await (themes as any).applyPlatformOptimizationPreset("linux", { quiet: true });
    expect(doc.documentElement.dataset.platform).toBe("linux");
    expect(doc.documentElement.classList.contains("rad-linux")).toBe(true);
    expect(state.settings.platformProfile).toBe("linux");
    expect(state.settings.atmosphereTier).toBe("medium");
    await (themes as any).applyPlatformOptimizationPreset("windows", { quiet: true });
    expect(doc.documentElement.dataset.platform).toBe("windows");
    expect(doc.documentElement.classList.contains("rad-windows")).toBe(true);
    expect(state.settings.platformProfile).toBe("windows");
    expect(state.settings.atmosphereTier).toBe("high");
    await (themes as any).applyPlatformOptimizationPreset("macos", { quiet: true });
    expect(doc.documentElement.dataset.platform).toBe("macos");
    expect(doc.documentElement.classList.contains("rad-macos")).toBe(true);
    expect(state.settings.platformProfile).toBe("macos");
    expect(state.settings.atmosphereTier).toBe("ultra");

    // Dialog-free Quick Random Themes (Any, With Effects, Plain No-Effects, Ultra) & Toggle FX (Alt+R / Alt+E / Alt+P / Alt+U / Alt+0)
    closeDialogs();
    expect(doc.querySelector(".modal-backdrop")).toBeNull();

    const fxPicked = await (themes as any).randomTheme({ mode: "fx", quiet: true });
    expect(fxPicked).toBeTruthy();
    expect(fxPicked.hasEffects).toBe(true);
    expect(state.settings.palette).toBe(fxPicked.key);
    expect(doc.documentElement.getAttribute("data-fx")).toBe("on");
    expect(doc.querySelector(".modal-backdrop")).toBeNull();
    expect(doc.getElementById("fm-quick-cycle-hud")).toBeTruthy();

    // Toggle FX off (Alt+0) strips effects while keeping colors and opening no modal dialog
    const toggledOff = await (themes as any).toggleCurrentThemeEffects({ quiet: true });
    expect(toggledOff.fxEnabled).toBe(false);
    expect(doc.documentElement.getAttribute("data-fx")).toBeNull();
    expect(doc.querySelector(".modal-backdrop")).toBeNull();

    // Toggle FX back on (Alt+0) restores full effects on the current FX theme
    const toggledOn = await (themes as any).toggleCurrentThemeEffects({ quiet: true });
    expect(toggledOn.fxEnabled).toBe(true);
    expect(doc.documentElement.getAttribute("data-fx")).toBe("on");

    // Quick Random Plain Theme (Alt+P) picks a static theme with hasEffects=false and clears all FX
    const plainPicked = await (themes as any).randomTheme({ mode: "plain", quiet: true });
    expect(plainPicked).toBeTruthy();
    expect(plainPicked.hasEffects).toBe(false);
    expect(state.settings.palette).toBe(plainPicked.key);
    expect(doc.documentElement.getAttribute("data-fx")).toBeNull();
    expect(doc.querySelector(".modal-backdrop")).toBeNull();

    // Quick Random Ultra Theme (Alt+U) picks an Ultra-tier theme
    const ultraPicked = await (themes as any).randomTheme({ mode: "ultra", quiet: true });
    expect(ultraPicked).toBeTruthy();
    expect((themes as any).resolveTemplateTier(ultraPicked)).toBe("ultra");
    expect(doc.querySelector(".modal-backdrop")).toBeNull();

    // Quick Random Any Theme (Alt+R)
    const anyPicked = await (themes as any).randomTheme({ mode: "any", quiet: true });
    expect(anyPicked).toBeTruthy();
    expect(doc.querySelector(".modal-backdrop")).toBeNull();

    (themes as any).hideQuickCycleHud();
    await themes.applyPalette("");
    (themes as any).applyUiImmersionProfiles({ uiElementFx: "off", iconPackStyle: "default" });
  });
});

