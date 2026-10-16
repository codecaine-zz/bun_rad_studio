import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { createContext } from "../src/features/filemanager/fmCore";
import { getThemeColours, listThemes, themeVars } from "../src/features/filemanager/fmThemes";
import { sanitizeSettings } from "../src/features/filemanager/fmSettings";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { SIMPLEGUI_THEMES } from "../src/simplegui";
import { contrastRatio } from "../src/shared/themeSemantic";
import { exportTheme, parseShared, toSimpleTheme, validateDraft } from "../src/features/filemanager/fmThemeStore";
import { FX_THEMES, fxCssVars, glassReport } from "../src/shared/fxThemes";

// The same pairs tests/file_manager_ui_theme.test.ts demands of the built-in light and dark colours.
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
      expect(["Futuristic", "Linux", "Windows", "macOS", "Editors and classics"]).toContain(t.group);
    }
    for (const g of ["Futuristic", "Linux", "Windows", "macOS", "Editors and classics"]) expect(list.some((t) => t.group === g), g).toBe(true);
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

  test("a theme whose background can't hold any text colour beside its panel takes the panel's colour", () => {
    const v = themeVars({ name: "x", background_color: "#008080", card_background: "#c0c0c0", font_color: "#000000", accent_color: "#000080", description: "", is_dark: false }).vars;
    expect(v.bg).toBe("#c0c0c0");
  });

  test("junk colours fall back instead of throwing", () => {
    const v = themeVars({ name: "x", background_color: "nonsense", font_color: "", accent_color: "rgb(1,2,3)", description: "", is_dark: true }).vars;
    for (const n of ["bg", "text", "accent"]) expect(v[n]).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("unknown or odd keys give nothing", () => {
    for (const k of ["nope", "", null, 5, "__proto__", "constructor", "../x"]) expect(getThemeColours(k as any)).toBeNull();
  });
});

describe("the saved choice", () => {
  const ctx = createContext({ platform: "linux", home: "/home/u", dataDir: "/tmp/x" });
  test("a key is kept when it looks like one, and anything else becomes none", () => {
    expect(sanitizeSettings({ palette: "nord" }, ctx).palette).toBe("nord");
    for (const bad of ["Nord", "a b", "../x", "x".repeat(61), 5, null, "", "<script>"]) expect(sanitizeSettings({ palette: bad }, ctx).palette).toBe("");
    expect(sanitizeSettings({}, ctx).palette).toBe("");
  });

  describe("custom theme effects", () => {
    const draft = { name: "Custom glass", dark: true, colors: { background: "#060918", card: "#101a30", text: "#edf8ff", accent: "#53f4ff" }, fx: FX_THEMES.prism_reactor!.fx! };

    test("effects survive validation, export and import without changing old colour-only themes", () => {
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

  test("clicking a theme applies its colours at once and saves the choice; Standard takes them off again", async () => {
    card("Cyberpunk Hologram").click();
    for (let i = 0; i < 30 && doc.documentElement.dataset.palette !== "cyberpunk_hologram"; i++) await sleep(50);
    expect(doc.documentElement.dataset.palette).toBe("cyberpunk_hologram");
    expect(rootVar("bg")).toMatch(/^#[0-9a-f]{6}$/);
    expect(rootVar("accent")).toBe(getThemeColours("cyberpunk_hologram")!.vars.accent!);
    expect(doc.documentElement.dataset.theme).toBe("dark");
    expect(doc.documentElement.style.getPropertyValue("color-scheme")).toBe("dark");
    expect((await api.call("settings")).settings.palette).toBe("cyberpunk_hologram");
    expect(card("Cyberpunk Hologram").getAttribute("aria-pressed")).toBe("true");
    expect(await themes.currentThemeName()).toBe("Cyberpunk Hologram");

    card("Liquid Metal Light").click();
    for (let i = 0; i < 30 && doc.documentElement.dataset.palette !== "liquid_metal_light"; i++) await sleep(50);
    expect(doc.documentElement.dataset.theme).toBe("light");
    expect(rootVar("accent")).toBe(getThemeColours("liquid_metal_light")!.vars.accent!);

    card("Standard").click();
    await sleep(300);
    expect(doc.documentElement.dataset.palette).toBeUndefined();
    expect(rootVar("bg")).toBe("");
    expect(rootVar("accent")).toBe("");
    expect((await api.call("settings")).settings.palette).toBe("");
    closeDialogs();
  });

  test("a saved theme that no longer exists falls back to the standard colours", async () => {
    state.settings.palette = "gone_theme";
    const name = await themes.applyPalette("gone_theme");
    expect(name).toBe("");
    expect(doc.documentElement.dataset.palette).toBeUndefined();
    expect(rootVar("bg")).toBe("");
    state.settings.palette = "";
  });

  test("cycling themes wraps, applies colours and persists the selected theme", async () => {
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
  test("a draft is checked: name, colours and the colours that must be there", async () => {
    const bad: Array<[any, RegExp]> = [
      [null, /form/], [{ ...MINE, name: "   " }, /name/], [{ ...MINE, name: "x".repeat(41) }, /40/],
      [{ ...MINE, colors: { ...MINE.colors, accent: "orange" } }, /accent colour must look like/],
      [{ ...MINE, colors: { ...MINE.colors, text: "#fff" } }, /text colour must look like/],
      [{ ...MINE, colors: { background: "#000000", text: "#ffffff" } }, /accent/],
      [{ ...MINE, colors: { ...MINE.colors, danger: 5 } }, /danger/],
    ];
    for (const [input, message] of bad) {
      const res = await api.call("themes/preview", { theme: input }).then(() => null, (e: any) => e.message);
      expect(res, JSON.stringify(input)).toMatch(message);
    }
  });

  test("preview works out the page colours without saving, and says when it changed a colour", async () => {
    const { theme } = await api.call("themes/preview", { theme: { name: "Low", dark: false, colors: { background: "#ffffff", text: "#f0f0f0", accent: "#ffff00" } } });
    expect(theme.scheme).toBe("light");
    for (const [a, b, min] of PAIRS) expect(contrastRatio(theme.vars[a], theme.vars[b]), `${a} on ${b}`).toBeGreaterThanOrEqual(min);
    expect(theme.notes.join(" ")).toMatch(/text colour was adjusted/);
    expect(theme.notes.join(" ")).toMatch(/accent colour was adjusted/);
    expect((await api.call("themes/list")).themes.some((t: any) => t.name === "Low")).toBe(false);
  });

  test("save, list under My themes, get with its colours, update in place, copy, delete", async () => {
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

  test("starting from another theme loads its colours; Save keeps a new theme, applies it, and lists it first", async () => {
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
});
