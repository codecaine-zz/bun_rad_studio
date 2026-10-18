// The theme editor: make your own color theme, or start from any other theme and change it. The whole window shows
// the theme while you edit (the server keeps text and buttons readable), and nothing is kept until you press Save.
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { debounce, h } from "./dom.js";
import { toast } from "./menus.js";
import { saveSettings } from "./nav.js";
import { emit, on, state } from "./state.js";
import { applyPalette, forgetThemeList, paint } from "./themes.js";
import { ATMOSPHERE_IDS, ATMOSPHERE_MIX_PRESETS } from "./atmosphereCatalog.js";

const EXPORT_FORMAT = "bun-rad-studio-file-manager-theme";

/** The colors people can change, with what each one does. `secondary` isn't shown: this window has no use for it. */
const FIELDS = [
  ["background", "Window background", "The main color behind the list of files."],
  ["card", "Panels", "The toolbar, side panel, menus and dialogs."],
  ["text", "Text", "Names, labels and everything you read. It is adjusted a little if it would be hard to read."],
  ["accent", "Accent", "Selected items, links and the main buttons."],
  ["border", "Lines", "Borders and dividers."],
  ["danger", "Errors (red)", "Delete buttons and error messages."],
  ["warning", "Warnings (amber)", "Warnings, such as a file that isn't what its name says."],
  ["success", "Good news (green)", "Free space and finished jobs."],
  ["info", "Notes (blue)", "Hints and information."],
];

const STANDARD = {
  "standard-dark": { name: "Standard dark", dark: true, colors: { background: "#16191d", card: "#1e2329", text: "#e8eaed", accent: "#6ea8ff", border: "#353c46", danger: "#ff8a80", warning: "#fbbf24", success: "#7ee2a0", info: "#38bdf8" } },
  "standard-light": { name: "Standard light", dark: false, colors: { background: "#ffffff", card: "#f3f5f8", text: "#1b1f24", accent: "#0b5cd5", border: "#ccd2db", danger: "#b42318", warning: "#b45309", success: "#166534", info: "#0369a1" } },
};

const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v);

function hslToHex(hDeg, sPct, lPct) {
  const h = ((hDeg % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, sPct)) / 100;
  const l = Math.max(0, Math.min(100, lPct)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hexToHsl(hexStr) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hexStr || "").trim());
  if (!m) return { h: 210, s: 80, l: 55 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Generates a full harmonious theme color table from a single accent hex and dark/light flag. */
export function harmonizeFromAccent(accentHex, dark = true) {
  const { h, s } = hexToHsl(accentHex);
  const sat = Math.max(45, s);
  const secHue = (h + 48) % 360;
  if (dark) {
    return {
      background: hslToHex(h, Math.min(34, Math.round(sat * 0.35)), 7),
      card: hslToHex(h, Math.min(36, Math.round(sat * 0.38)), 12),
      text: hslToHex(h, 24, 94),
      accent: isHex(accentHex) ? accentHex.toLowerCase() : hslToHex(h, sat, 62),
      secondary: hslToHex(secHue, Math.max(65, sat), 64),
      border: hslToHex(h, 26, 24),
      danger: "#ff6b81",
      warning: "#fbbf24",
      success: "#34d399",
      info: "#38bdf8",
    };
  }
  return {
    background: hslToHex(h, 25, 98),
    card: hslToHex(h, 28, 93),
    text: hslToHex(h, 35, 11),
    accent: isHex(accentHex) ? accentHex.toLowerCase() : hslToHex(h, sat, 44),
    secondary: hslToHex(secHue, Math.max(60, sat), 42),
    border: hslToHex(h, 22, 80),
    danger: "#b42318",
    warning: "#b45309",
    success: "#166534",
    info: "#0369a1",
  };
}

export const EDITOR_FX_PRESETS = [
  { id: "liquid_glass", label: "✨ Tahoe Liquid Glass", fx: { glass: 0.68, blur: 28, glow: "bloom", radius: "squircle", border: "iridescent", motion: "spring", backdropStyle: "liquid", cursorEffect: "prism", vignette: "subtle", sheen: true, frostedRim: true, innerGlow: true, ambient: true } },
  { id: "m4_xdr_pro", label: "🍎 M4 Space Black XDR", fx: { glass: 0.56, blur: 24, glow: "soft", radius: "round", border: "metal", motion: "spring", backdropStyle: "oled", cursorEffect: "spotlight", vignette: "subtle", sheen: true, noise: true, frostedRim: true, ambient: true } },
  { id: "win11_mica", label: "🪟 Win 11 Mica Alt", fx: { glass: 0.52, blur: 26, glow: "soft", radius: "soft", border: "bevel", motion: "calm", backdropStyle: "mica", cursorEffect: "spotlight", vignette: "none", sheen: false, noise: true, ambient: true, saturation: 1.55 } },
  { id: "win11_acrylic", label: "🪟 Win 11 Acrylic", fx: { glass: 0.62, blur: 22, glow: "soft", radius: "soft", border: "gradient", motion: "snappy", backdropStyle: "acrylic", cursorEffect: "ripple", grain: "subtle", sheen: true, noise: true, frostedRim: true } },
  { id: "cyber_hologram", label: "🔮 Cyberpunk Hologram", fx: { glass: 0.58, blur: 20, glow: "laser", radius: "sharp", border: "hologram", motion: "snappy", backdropStyle: "glass", cursorEffect: "prism", vignette: "cinema", scanlines: "subtle", chromatic: true, prismEdge: true, neonPulse: true, sheen: true } },
  { id: "prismatic_crystal", label: "💎 Prismatic Crystal", fx: { glass: 0.65, blur: 26, glow: "aurora", radius: "round", border: "iridescent", motion: "elastic", backdropStyle: "frosted", cursorEffect: "prism", vignette: "ambient", chromatic: true, prismEdge: true, innerGlow: true, frostedRim: true, sheen: true } },
  { id: "retro_crt", label: "📺 Retro CRT Phosphor", fx: { glass: 0.35, blur: 10, glow: "ember", radius: "soft", border: "double", motion: "snappy", backdropStyle: "oled", cursorEffect: "spotlight", vignette: "cinema", scanlines: "crt", grain: "film", crtCurve: true, innerGlow: true, neonPulse: true } },
  { id: "plasma_reactor", label: "⚡ Plasma Reactor", fx: { glass: 0.55, blur: 24, glow: "plasma", radius: "round", border: "neon", motion: "elastic", backdropStyle: "glass", cursorEffect: "magnetic", vignette: "ambient", sheen: true, innerGlow: true, neonPulse: true, ambient: true, parallax: true } },
  { id: "velvet_cinema", label: "🎬 Velvet Cinema", fx: { glass: 0.45, blur: 20, glow: "bloom", radius: "round", border: "gradient", motion: "cinematic", backdropStyle: "frosted", cursorEffect: "spotlight", vignette: "cinema", grain: "film", ambient: true, innerGlow: true } },
  { id: "halftone_zine", label: "📰 Halftone Pop Zine", fx: { glass: 0.25, blur: 8, glow: "neon", radius: "sharp", border: "double", motion: "snappy", backdropStyle: "matte", cursorEffect: "magnetic", grain: "halftone", chromatic: true } },
  { id: "aurora_silk", label: "🌌 Aurora Silk", fx: { glass: 0.6, blur: 30, glow: "aurora", radius: "pill", border: "gradient", motion: "calm", backdropStyle: "liquid", cursorEffect: "spotlight", vignette: "ambient", sheen: true, innerGlow: true, ambient: true } },
  { id: "zen_matte", label: "🪨 Zen Matte Studio", fx: { glass: 0, blur: 0, glow: "none", radius: "soft", border: "flat", motion: "calm", backdropStyle: "matte", cursorEffect: "none", vignette: "none", scanlines: "none", grain: "none", sheen: false, noise: false, chromatic: false, ambient: false } },
];

async function loadStart(key) {
  if (STANDARD[key]) return { ...structuredClone(STANDARD[key]), base: STANDARD[key].name, editingId: null };
  const r = await call("themes/get", { key });
  const custom = r.custom;
  return { name: custom ? custom.name : `${r.theme.name} (mine)`, dark: r.source.dark, colors: { ...r.source.colors }, fx: r.source.fx ? { ...r.source.fx } : undefined, base: custom ? custom.base : r.theme.name, editingId: custom ? custom.id : null };
}

async function openEditor({ from = "" } = {}) {
  let themes;
  try {
    themes = (await call("themes/list")).themes;
  } catch (err) {
    toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
    return;
  }
  const isDark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  let start;
  try {
    start = await loadStart(from || (isDark ? "standard-dark" : "standard-light"));
  } catch {
    start = await loadStart("standard-dark");
  }
  let draft = start;
  let closed = false;
  let previewVersion = 0;
  const defaultEffects = () => ({
    glow: "soft", glowColor: draft.colors.accent, glowColor2: draft.colors.secondary || draft.colors.accent,
    blur: 16, glass: 0.4, glowIntensity: 1, borderOpacity: 0.16,
    grain: "none", scanlines: "none", sheen: false, radius: "soft", border: "flat", motion: "calm",
    noise: false, chromatic: false, ambient: false, atmosphere: "none",
  });
  const FIELD_FALLBACKS = {
    backdropStyle: "glass",
    cursorEffect: "spotlight",
    vignette: "none",
    saturation: 1.35,
  };

  // -- the form ----------------------------------------------------------------------------------------------------
  const nameInput = h("input", { type: "text", class: "prop-input", maxlength: "40", "aria-label": "Theme name", title: "The name shown in the theme gallery.", value: draft.name });
  const darkBox = h("input", { type: "checkbox", checked: draft.dark, title: "Tick this when the background is dark. It decides the shadows and the color of the browser's own controls." });
  const notes = h("p", { class: "hint theme-notes", role: "status" });
  const status = h("p", { class: "dialog-error", role: "alert", hidden: true });
  const startSelect = h("select", { class: "prop-input", "aria-label": "Start from", title: "Copy the colors of another theme to work from." });
  const heading = h("p", { class: "hint" });
  const effectsEnabled = h("input", { type: "checkbox", checked: !!draft.fx, "aria-label": "Enable visual effects" });
  const effectControls = h("fieldset", { class: "theme-effect-controls" });
  const effectInputs = new Map();
  const effectField = (key, label, choices, range) => {
    const input = choices
      ? h("select", { class: "prop-input", "aria-label": label }, choices.map((value) => h("option", { value }, value)))
      : h("input", { type: range ? "range" : "color", min: range?.[0], max: range?.[1], step: range?.[2], "aria-label": label });
    const output = h("output", {});
    const read = () => {
      const fx = draft.fx || defaultEffects();
      const value = key === "opacity" ? Math.round((1 - fx.glass * 0.6) * 100) : fx[key] ?? defaultEffects()[key] ?? FIELD_FALLBACKS[key];
      input.value = String(value);
      output.textContent = range ? `${value}${key === "opacity" ? "%" : key === "blur" ? "px" : key === "saturation" ? "x" : ""}` : "";
    };
    input.addEventListener("input", () => {
      if (!draft.fx) return;
      const value = range ? Number(input.value) : input.value;
      if (key === "opacity") draft.fx.glass = (100 - Number(value)) / 60;
      else draft.fx[key] = value;
      output.textContent = range ? `${value}${key === "opacity" ? "%" : key === "blur" ? "px" : key === "saturation" ? "x" : ""}` : "";
      refresh();
    });
    effectInputs.set(key, read);
    return h("label", {}, h("span", {}, label), input, output);
  };
  effectControls.append(
    effectField("opacity", "Panel opacity", null, [40, 100, 1]),
    effectField("blur", "Glass blur", null, [0, 32, 1]),
    effectField("glowIntensity", "Glow intensity", null, [0, 1, 0.05]),
    effectField("borderOpacity", "Border strength", null, [0, 1, 0.05]),
    effectField("saturation", "Backdrop saturation", null, [0.5, 2.2, 0.05]),
    effectField("backdropStyle", "Surface material", ["glass", "liquid", "mica", "acrylic", "frosted", "oled", "matte"]),
    effectField("glow", "Glow style", ["none", "soft", "neon", "bloom", "aurora", "laser", "plasma", "ember"]),
    effectField("glowColor", "Glow color"),
    effectField("glowColor2", "Secondary glow color"),
    effectField("radius", "Corner style", ["sharp", "soft", "round", "pill", "squircle"]),
    effectField("border", "Border style", ["flat", "gradient", "metal", "hologram", "neon", "iridescent", "bevel", "double"]),
    effectField("motion", "Animation feel", ["calm", "spring", "snappy", "elastic", "cinematic", "zero"]),
    effectField("cursorEffect", "Cursor interaction", ["spotlight", "ripple", "magnetic", "prism", "none"]),
    effectField("vignette", "Screen vignette", ["none", "subtle", "cinema", "ambient"]),
  );
  const effectFlags = [
    ["ambient", "Ambient"],
    ["sheen", "Sheen"],
    ["chromatic", "Chromatic"],
    ["noise", "Noise"],
    ["prismEdge", "Prismatic edge"],
    ["innerGlow", "Inner glow"],
    ["frostedRim", "Specular XDR rim"],
    ["neonPulse", "Neon pulse"],
    ["crtCurve", "CRT curvature"],
    ["parallax", "3D Parallax"],
  ];
  for (const [key, labelText] of effectFlags) {
    const input = h("input", { type: "checkbox", "aria-label": `${key} effect` });
    effectInputs.set(key, () => { input.checked = draft.fx?.[key] ?? false; });
    input.addEventListener("change", () => { if (draft.fx) { draft.fx[key] = input.checked; refresh(); } });
    effectControls.append(h("label", { class: "check" }, input, h("span", {}, labelText)));
  }
  effectControls.append(
    effectField("grain", "Film grain", ["none", "subtle", "film", "halftone"]),
    effectField("scanlines", "Scanlines", ["none", "subtle", "crt", "interlace"]),
    effectField("atmosphere", "Atmospheric effect", [...ATMOSPHERE_IDS, ...ATMOSPHERE_MIX_PRESETS.map((m) => m.id)]),
  );
  effectsEnabled.addEventListener("change", () => {
    draft.fx = effectsEnabled.checked ? defaultEffects() : undefined;
    effectControls.disabled = !draft.fx;
    for (const read of effectInputs.values()) read();
    refresh();
  });

  const rows = new Map();
  const field = ([key, label, tip]) => {
    const picker = h("input", { type: "color", class: "theme-color", "aria-label": `${label} color picker`, title: tip, value: draft.colors[key] ?? "#808080" });
    const text = h("input", { type: "text", class: "prop-input theme-hex", maxlength: "7", spellcheck: "false", "aria-label": `${label} as a hex code`, title: `${tip} Type a code like #1a2b3c.`, value: draft.colors[key] ?? "" });
    const set = (value) => {
      if (!isHex(value)) { text.setAttribute("aria-invalid", "true"); return; }
      text.removeAttribute("aria-invalid");
      draft.colors[key] = value.toLowerCase();
      picker.value = draft.colors[key];
      text.value = draft.colors[key];
      refresh();
    };
    picker.addEventListener("input", () => set(picker.value));
    text.addEventListener("input", () => { if (isHex(text.value)) set(text.value); else text.setAttribute("aria-invalid", String(text.value !== "")); });
    rows.set(key, { picker, text });
    return h("div", { class: "theme-field" }, h("span", { class: "theme-field-label", title: tip }, label), picker, text);
  };

  const applyColorHarmony = (nextColors, nextDark = draft.dark) => {
    draft.dark = nextDark;
    darkBox.checked = nextDark;
    draft.colors = { ...draft.colors, ...nextColors };
    if (draft.fx) {
      draft.fx.glowColor = draft.colors.accent;
      draft.fx.glowColor2 = draft.colors.secondary || draft.colors.accent;
    }
    for (const [key, { picker, text }] of rows) {
      const v = draft.colors[key] ?? "";
      text.removeAttribute("aria-invalid");
      text.value = v;
      if (isHex(v)) picker.value = v;
    }
    for (const read of effectInputs.values()) read();
    refresh();
  };

  const harmonyBar = h("div", { class: "theme-harmony-bar", role: "group", "aria-label": "Color harmony tools" },
    h("span", { class: "theme-pill-label" }, "Palette tools:"),
    h("button", {
      type: "button",
      class: "btn",
      "data-harmony": "accent",
      title: "Generate harmonious background, panel, border, text and status colors from your current Accent color.",
      onclick: () => applyColorHarmony(harmonizeFromAccent(draft.colors.accent || "#6ea8ff", darkBox.checked), darkBox.checked),
    }, "🎨 Auto-harmonize from Accent"),
    h("button", {
      type: "button",
      class: "btn",
      "data-harmony": "invert",
      title: "Flip this theme between Dark and Light mode while keeping your Accent color harmony.",
      onclick: () => {
        const nextDark = !darkBox.checked;
        applyColorHarmony(harmonizeFromAccent(draft.colors.accent || "#6ea8ff", nextDark), nextDark);
      },
    }, "🔄 Invert Dark / Light"),
    h("button", {
      type: "button",
      class: "btn",
      "data-harmony": "random",
      title: "Generate a fresh random accent and harmonized color palette.",
      onclick: () => {
        const rndAccent = hslToHex(Math.floor(Math.random() * 360), 82, darkBox.checked ? 62 : 45);
        applyColorHarmony(harmonizeFromAccent(rndAccent, darkBox.checked), darkBox.checked);
      },
    }, "🎲 Randomize palette"),
  );

  const presetStrip = h("div", { class: "theme-preset-strip", role: "group", "aria-label": "Effect style presets" },
    ...EDITOR_FX_PRESETS.map((preset) =>
      h("button", {
        type: "button",
        class: "theme-preset-pill",
        "data-fx-preset": preset.id,
        title: `Apply ${preset.label} effect settings while keeping your current colors.`,
        onclick: () => {
          effectsEnabled.checked = true;
          effectControls.disabled = false;
          const curAtmo = draft.fx?.atmosphere;
          draft.fx = {
            ...defaultEffects(),
            ...preset.fx,
            glowColor: draft.colors.accent || "#6ea8ff",
            glowColor2: draft.colors.secondary || draft.colors.accent || "#6ea8ff",
            ...(curAtmo && curAtmo !== "none" ? { atmosphere: curAtmo } : {}),
          };
          for (const read of effectInputs.values()) read();
          refresh();
        },
      }, preset.label),
    ),
  );

  /** Fills the form from `next` (a theme to start from, or imported text). */
  const load = (next) => {
    draft = next;
    nameInput.value = draft.name;
    darkBox.checked = draft.dark;
    effectsEnabled.checked = !!draft.fx;
    effectControls.disabled = !draft.fx;
    for (const read of effectInputs.values()) read();
    for (const [key, { picker, text }] of rows) {
      const v = draft.colors[key] ?? "";
      text.removeAttribute("aria-invalid");
      text.value = v;
      if (isHex(v)) picker.value = v;
    }
    heading.textContent = draft.editingId ? `You are changing your theme "${draft.name}". Save replaces it; Save as a copy keeps it.` : draft.base ? `This is a new theme, started from ${draft.base}.` : "This is a new theme.";
    refresh();
  };

  const contrastBar = h("div", { class: "theme-contrast-inspector", "aria-label": "WCAG contrast ratios" });
  const renderContrast = (items) => {
    if (!Array.isArray(items) || !items.length) {
      contrastBar.replaceChildren();
      return;
    }
    contrastBar.replaceChildren(
      h("span", { class: "theme-contrast-title" }, "WCAG contrast:"),
      ...items.map((item) => {
        const dot = h("span", { class: "theme-contrast-dot" });
        dot.style.background = item.fg;
        dot.style.boxShadow = `inset 0 0 0 2px ${item.bg}`;
        return h("span", {
          class: "theme-contrast-chip",
          title: `${item.label}: ${item.fg} on ${item.bg} — contrast ratio ${item.ratio}:1 (${item.grade})`,
        },
          dot,
          h("span", {}, item.label),
          h("span", { class: "theme-contrast-ratio" }, `${item.ratio}:1`),
          h("span", { class: "theme-contrast-grade", "data-grade": item.grade }, item.grade),
        );
      }),
    );
  };

  const draftBody = () => ({ name: nameInput.value, dark: darkBox.checked, base: draft.base ?? "", colors: draft.colors, ...(draft.fx ? { fx: draft.fx } : {}) });
  const refresh = debounce(async () => {
    if (closed) return;
    const version = ++previewVersion;
    try {
      const { theme } = await call("themes/preview", { theme: { ...draftBody(), name: nameInput.value.trim() || "Untitled" } });
      if (closed || version !== previewVersion) return;
      paint(theme, "preview");
      renderContrast(theme.contrast);
      notes.textContent = theme.notes.join(" ");
      status.hidden = true;
    } catch (err) {
      if (closed || version !== previewVersion) return;
      status.textContent = err instanceof ApiError ? err.message : "That color can't be shown.";
      status.hidden = false;
    }
  }, 120);
  darkBox.addEventListener("change", () => { draft.dark = darkBox.checked; refresh(); });
  nameInput.addEventListener("input", () => { draft.name = nameInput.value; });

  const groups = new Map();
  for (const t of themes) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  startSelect.append(
    h("optgroup", { label: "Plain" }, Object.entries(STANDARD).map(([k, v]) => h("option", { value: k }, v.name))),
    ...[...groups].map(([group, list]) => h("optgroup", { label: group }, list.map((t) => h("option", { value: t.key }, t.name)))),
  );
  startSelect.value = STANDARD[from] || themes.some((t) => t.key === from) ? from : isDark ? "standard-dark" : "standard-light";
  startSelect.addEventListener("change", async () => {
    try {
      load(await loadStart(startSelect.value));
    } catch (err) {
      toast(err?.message || "That theme couldn't be loaded.", { kind: "error" });
    }
  });

  const body = h("div", { class: "theme-editor" },
    heading,
    h("div", { class: "theme-meta" },
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Name"), nameInput),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "Start from"), startSelect),
      h("label", { class: "check" }, darkBox, h("span", {}, "This is a dark theme"))),
    harmonyBar,
    h("div", { class: "theme-fields" }, FIELDS.map(field)),
    contrastBar,
    h("h3", {}, "Glass, glow, materials and motion"),
    h("p", { class: "hint" }, "Pick a 1-click Effect Style Preset below, or fine-tune every shader, surface material, border, glow, texture and optical effect."),
    presetStrip,
    h("label", { class: "check" }, effectsEnabled, h("span", {}, "Enable visual effects")),
    effectControls,
    h("p", { class: "hint" }, "Opacity affects panels, not text or the native window. The preview raises opacity when needed for readable text. Motion follows your computer's reduced-motion preference."),
    h("div", { class: "theme-sample", "aria-label": "Sample of the colors" },
      h("button", { type: "button", class: "btn primary", tabindex: "-1" }, "Main button"),
      h("button", { type: "button", class: "btn", tabindex: "-1" }, "Button"),
      h("button", { type: "button", class: "btn danger", tabindex: "-1" }, "Delete"),
      h("span", { class: "hint" }, "Sample text in a hint")),
    notes, status,
    h("p", { class: "hint" }, "The whole window shows your colors while you edit. Nothing is kept until you press Save."));
  load(draft);

  // -- the buttons -------------------------------------------------------------------------------------------------
  const currentButtons = () => [
    { label: "Cancel", value: "cancel" },
    { label: "Import…", value: "import" },
    { label: "Export…", value: "export" },
    ...(draft.editingId ? [{ label: "Delete theme", value: "delete", danger: true }, { label: "Save as a copy", value: "copy" }] : []),
    { label: draft.editingId ? "Save" : "Save theme", value: "save", primary: true },
  ];

  // The import and export windows open over this one, so this one is shown again afterwards.
  const run = async () => {
    for (;;) {
      const answer = await openDialog({ title: "Theme editor", wide: true, body, buttons: currentButtons(), initialFocus: nameInput }).result;
      if (answer === "import") { await importText(); continue; }
      if (answer === "export") { await exportText(); continue; }
      if (answer === "delete") { if (await removeTheme()) return; continue; }
      if (answer === "save" || answer === "copy") { if (await save(answer === "copy")) return; continue; }
      return;
    }
  };
  async function save(asCopy) {
    try {
      const res = await call("themes/custom/save", { theme: draftBody(), id: asCopy ? undefined : draft.editingId ?? undefined });
      forgetThemeList();
      await saveSettings({ palette: res.id });
      toast(`Saved the theme "${res.name}".`, { kind: "success" });
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The theme couldn't be saved.", { kind: "error" });
      return false;
    }
  }

  async function removeTheme() {
    if (!(await confirmBox({ title: "Delete this theme?", message: `"${draft.name}" will be deleted for good. Export it first if you may want it back.`, confirmLabel: "Delete theme", danger: true }))) return false;
    try {
      await call("themes/custom/delete", { id: draft.editingId });
      forgetThemeList();
      if (state.settings.palette === draft.editingId) await saveSettings({ palette: "" });
      toast("The theme was deleted.", { kind: "success" });
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The theme couldn't be deleted.", { kind: "error" });
      return false;
    }
  }

  async function exportText() {
    const currentDraft = { ...draftBody(), name: nameInput.value.trim() || "Untitled" };
    const jsonText = JSON.stringify({ format: EXPORT_FORMAT, version: 1, ...currentDraft }, null, 2);
    const box = h("textarea", { class: "prop-input theme-export", readonly: true, rows: "10", "aria-label": "The theme as text", title: "Copy this text and keep it, or send it to someone. Import… turns it back into a theme." }, jsonText);
    const setActiveTab = (activeBtn) => {
      for (const b of tabs.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === activeBtn));
    };
    const jsonBtn = h("button", {
      type: "button", class: "btn theme-export-tab", "aria-pressed": "true",
      onclick: () => { setActiveTab(jsonBtn); box.value = jsonText; },
    }, "Theme JSON");
    const cssBtn = h("button", {
      type: "button", class: "btn theme-export-tab", "aria-pressed": "false",
      onclick: async () => {
        setActiveTab(cssBtn);
        try {
          const { css } = await call("themes/custom/export-css", { theme: currentDraft });
          box.value = css;
        } catch (err) {
          toast(err instanceof ApiError ? err.message : "Couldn't generate CSS variables.", { kind: "error" });
        }
      },
    }, "CSS variables (:root)");
    const packBtn = h("button", {
      type: "button", class: "btn theme-export-tab", "aria-pressed": "false",
      onclick: async () => {
        setActiveTab(packBtn);
        try {
          const { text } = await call("themes/custom/export-pack", { theme: currentDraft });
          box.value = text;
        } catch (err) {
          toast(err instanceof ApiError ? err.message : "Couldn't export theme pack.", { kind: "error" });
        }
      },
    }, "Theme pack (all my themes)");
    const tabs = h("div", { class: "theme-export-tabs" }, jsonBtn, cssBtn, packBtn);
    const d = openDialog({ title: "Export theme", body: [h("p", {}, "Copy this text to keep or share the theme, export a standalone CSS variables block, or export all your custom themes as a pack."), tabs, box], buttons: [{ label: "Close", value: false }, { label: "Copy", value: true, primary: true }], initialFocus: box });
    if (await d.result) {
      try {
        await call("copytext", { text: box.value });
        toast("The theme text was copied.", { kind: "success" });
      } catch {
        toast("Couldn't copy. Select the text and copy it yourself.", { kind: "error" });
      }
    }
  }

  async function importText() {
    const box = h("textarea", { class: "prop-input theme-export", rows: "10", "aria-label": "Theme text to import", title: "Paste text that was made with Export…", placeholder: "Paste the theme or theme pack JSON here" });
    const d = openDialog({ title: "Import theme", body: [h("p", {}, "Paste a single theme or a multi-theme pack that was exported from this editor. You can look at a single theme and change it before saving, or import a whole pack at once."), box], buttons: [{ label: "Cancel", value: false }, { label: "Use this theme", value: true, primary: true }], initialFocus: box });
    if (!(await d.result)) return;
    let parsed = null;
    try {
      parsed = JSON.parse(box.value);
    } catch { /* let the server return its plain-words error */ }
    if (parsed && typeof parsed === "object" && parsed.format === "bun-rad-studio-file-manager-theme-pack" && Array.isArray(parsed.themes) && parsed.themes.length > 1) {
      try {
        const res = await call("themes/custom/import-pack", { text: box.value });
        forgetThemeList();
        if (res.first) {
          load({ name: res.first.name, dark: res.first.dark, colors: { ...draft.colors, ...res.first.colors }, fx: res.first.fx, base: res.first.base || "an imported theme pack", editingId: res.first.id });
        }
        toast(`Imported ${res.count} themes into My themes.`, { kind: "success" });
        return;
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "That theme pack couldn't be imported.", { kind: "error" });
        return;
      }
    }
    try {
      const { theme } = await call("themes/custom/import", { text: box.value });
      load({ name: theme.name, dark: theme.dark, colors: { ...draft.colors, ...theme.colors }, fx: theme.fx, base: "an imported theme", editingId: null });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "That text isn't a theme.", { kind: "error" });
    }
  }

  try {
    await run();
  } finally {
    closed = true;
    // Back to the saved choice: the new theme after Save, otherwise what was chosen before.
    await applyPalette(state.settings.palette || "");
    emit("theme-picker");
  }
}

on("theme-editor", (detail) => { openEditor(detail ?? {}); });
