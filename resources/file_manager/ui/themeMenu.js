// The Themes menu of the ribbon: standard light and dark, the themes used lately, and the way into the gallery and the editor,
// so colors can be changed without going through Settings.
import { saveSettings } from "./nav.js";
import {
  applyThemeColorsKeepingCurrentEffects,
  chooseTheme,
  cycleChameleonFolderMood,
  cycleColorTempMode,
  cycleColorVisionMode,
  cycleDualPaneFocusMode,
  cycleHighEnd3dFolderAnimation,
  cycleScreenFilter,
  cycleZeroWattGovernorMode,
  disableAllThemeAnimations,
  downloadThemePosterCard,
  favoriteThemes,
  getThemeHistoryState,
  isKeepEffectsColorSwapMode,
  isKeepIconsOnThemeSwitchMode,
  isTelemetryPopoutHudOpen,
  pasteImportThemesFromClipboard,
  randomColorsKeepCurrentEffects,
  randomScreenFilter,
  randomTheme,
  recentThemes,
  redoThemeHistory,
  shuffleSystemIconsKeepTheme,
  toggleCurrentThemeEffects,
  toggleKeepEffectsColorSwapMode,
  toggleKeepIconsOnThemeSwitchMode,
  toggleTelemetryPopoutHud,
  undoThemeHistory,
} from "./themes.js";
import { emit, state } from "./state.js";

/** Open the Theme Gallery pre-filtered to Ultra-tier flagship themes without modifying themes.js. */
export function openUltraThemePicker(opts = {}) {
  const emitEvent = typeof opts.emitFn === "function" ? opts.emitFn : emit;
  const doc =
    opts.doc !== undefined
      ? opts.doc
      : typeof document !== "undefined"
        ? document
        : null;
  emitEvent("theme-picker", { filter: "fx" });
  if (!doc || typeof doc.querySelector !== "function") return;
  let attempts = 0;
  const maxAttempts = 30;
  const applyUltraTierFilter = () => {
    const tierSelect = doc.querySelector(
      '.dialog select[aria-label="Filter templates by tier"]',
    );
    const ultraPill = doc.querySelector('.dialog [data-tier-pill="ultra"]');
    if (tierSelect) {
      tierSelect.value = "ultra";
      if (
        typeof Event === "function" &&
        typeof tierSelect.dispatchEvent === "function"
      ) {
        tierSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (ultraPill && ultraPill.getAttribute?.("aria-pressed") !== "true") {
        ultraPill.click?.();
      }
      return;
    }
    if (ultraPill) {
      ultraPill.click?.();
      return;
    }
    attempts += 1;
    if (attempts < maxAttempts) {
      setTimeout(applyUltraTierFilter, 20);
    }
  };
  setTimeout(applyUltraTierFilter, 15);
}

/** Format a compact mode + tier/FX studio badge for Favorites and Recent menu items. */
export function formatThemeMenuBadge(t) {
  if (!t || typeof t !== "object") return "";
  const mode = t.dark === false ? "☀️ Light" : "🌙 Dark";
  const tier = String(t.hardwareTier || t.tier || "").toLowerCase();
  const fxTag =
    tier === "ultra"
      ? "🚀 Ultra"
      : tier === "high"
        ? "💎 High"
        : t.hasEffects
          ? "✨ FX"
          : "⏹ Plain";
  return `${mode} · ${fxTag}`;
}

/** The items of the menu for the colors in force now. */
export async function themeMenuItems() {
  const s = state.settings;
  const custom = !!s.palette;
  const keepFxLocked = isKeepEffectsColorSwapMode();
  const keepIconsLocked = isKeepIconsOnThemeSwitchMode();
  const hist = getThemeHistoryState();
  const standard = (value, label) => ({
    label,
    checked: !custom && s.theme === value,
    action: async () => {
      if (isKeepEffectsColorSwapMode()) {
        await saveSettings({ palette: "", theme: value });
        await applyThemeColorsKeepingCurrentEffects("");
        return;
      }
      await disableAllThemeAnimations({
        quiet: true,
        stripThemeEffects: true,
        preserveLockedIcons: true,
      });
      await saveSettings({ palette: "", theme: value });
    },
  });
  const items = [
    standard("auto", "Standard: follow my computer"),
    standard("light", "Standard light"),
    standard("dark", "Standard dark"),
    { separator: true },
    {
      label:
        hist.undoCount > 0
          ? `Undo previous theme / FX roll (${hist.undoCount} · ⌥Z)`
          : "Undo previous theme / FX roll (⌥Z)",
      icon: "⏪",
      shortcut: "⌥Z",
      disabled: !hist.canUndo,
      tip: "Step backward through up to 25 previous theme switches, random rolls, and FX changes (Alt+Z / ⌥Z).",
      action: () => {
        void undoThemeHistory();
      },
    },
    {
      label:
        hist.redoCount > 0
          ? `Redo theme / FX roll (${hist.redoCount} · ⌥⇧Z)`
          : "Redo theme / FX roll (⌥⇧Z)",
      icon: "⏩",
      shortcut: "⌥⇧Z",
      disabled: !hist.canRedo,
      tip: "Step forward to restore an undone theme or FX roll (Alt+Shift+Z / ⌥⇧Z).",
      action: () => {
        void redoThemeHistory();
      },
    },
    { separator: true },
    {
      label: "Swap random colors — keep current effects (⌥C)",
      icon: "🌈",
      shortcut: "⌥C",
      tip: "Pick a random color palette from all 310 themes while keeping your active background weather, 3D folder shader, icon pack, and icon animations unchanged (Alt+C / ⌥C).",
      action: () => {
        void randomColorsKeepCurrentEffects();
      },
    },
    {
      label: keepFxLocked
        ? "Unlock current effects (normal theme switch)"
        : "Lock current effects (swap colors only)",
      icon: keepFxLocked ? "🔒" : "🔓",
      shortcut: keepFxLocked ? "Locked" : undefined,
      checked: keepFxLocked,
      tip: "When locked, picking any theme from Favorites, Recent, or the Theme Gallery changes ONLY the color palette while keeping your current active effects!",
      action: () => {
        toggleKeepEffectsColorSwapMode();
      },
    },
    {
      label: "Shuffle system icons — keep current theme & FX (⌥I)",
      icon: "🎭",
      shortcut: "⌥I",
      tip: "Shuffle across 49 custom system icon packs, 3D icon glows & animations while keeping your current theme colors and effects intact (Alt+I / ⌥I).",
      action: () => {
        void shuffleSystemIconsKeepTheme();
      },
    },
    {
      label: keepIconsLocked
        ? "Unlock system icons on theme switch (⌥⇧I)"
        : "Lock system icons on theme switch (⌥⇧I)",
      icon: keepIconsLocked ? "🔒" : "📌",
      shortcut: "⌥⇧I",
      checked: keepIconsLocked,
      tip: "When locked, switching themes preserves your chosen system icon pack, icon glow, and 3D icon animation (Alt+Shift+I / ⌥⇧I).",
      action: () => {
        toggleKeepIconsOnThemeSwitchMode();
      },
    },
    {
      label: "3D Spinning Folders & Futuristic Flash 3000 (⌥9)",
      icon: "💿",
      shortcut: "⌥9",
      tip: "Cycle High-End 120Hz 3D Spinning Folder Turntables, 2Advanced v3 Vector HUDs, Gyro Cube Matrices & Liquid Metal Morphs (Alt+9 / ⌥9).",
      action: () => {
        void cycleHighEnd3dFolderAnimation(1);
      },
    },
    {
      label: "Cycle CRT / Cinema / Retro Screen Filter (⌥F)",
      icon: "📺",
      shortcut: "⌥F",
      tip: "Cycle built-in CRT Trinitron, Green/Amber Phosphor, 1999 VHS, Game Boy DMG, Cyber NVG, Matrix & Thermal Screen Filters (Alt+F / ⌥F).",
      action: () => {
        void cycleScreenFilter(1);
      },
    },
    {
      label: "Random CRT / Cinema / Retro Screen Filter (⌥⇧F)",
      icon: "🎞️",
      shortcut: "⌥⇧F",
      tip: "Apply a random CRT, Cinema, Retro Handheld, Analog or Optical Screen Filter (Alt+Shift+F / ⌥⇧F).",
      action: () => {
        void randomScreenFilter();
      },
    },
    {
      label: "Cycle Dual-Pane Active Focus Spotlight",
      icon: "🧭",
      tip: "Cycle Dual-Pane Source vs. Target Active Focus Spotlight modes (Spotlight, Neon Rim, Dim Inactive, Source/Target Badges, Off).",
      action: () => {
        void cycleDualPaneFocusMode(1);
      },
    },
    {
      label: "Cycle Chameleon Folder Mood (Auto-Accent)",
      icon: "🦎",
      tip: "Cycle Chameleon Folder Mood (Auto-Detect by Folder Contents, Code, Media, Data & AI, Docs, Archives, Security Vault, Off).",
      action: () => {
        void cycleChameleonFolderMood(1);
      },
    },
    {
      label: "Cycle Smart Zero-Watt Power Governor",
      icon: "🔋",
      tip: "Cycle Smart Unfocused Window & Battery Zero-Watt Governor (Smart Auto Pause on Blur, Always 120Hz, Battery Eco Saver).",
      action: () => {
        void cycleZeroWattGovernorMode(1);
      },
    },
    {
      label: "Cycle Kelvin White-Point & OLED Mastering",
      icon: "🌡️",
      tip: "Cycle Color-Temperature Mastering across 2700K Candlelight, 3500K Golden Hour, 4300K Warm Halogen, 5000K D50 Print, 6500K D65 Neutral, 7500K Cyber Cool, 9300K Trinitron & True OLED Pitch-Black.",
      action: () => {
        void cycleColorTempMode(1);
      },
    },
    {
      label: "Cycle Color-Vision & AAA Contrast Guard",
      icon: "👁️‍🗨️",
      tip: "Cycle Daltonism-Safe & WCAG AAA High-Contrast Vision Modes (Protanopia Safe, Deuteranopia Safe, Tritanopia Safe, Monochromacy, WCAG AAA 7:1 High-Contrast, Standard Vision).",
      action: () => {
        void cycleColorVisionMode(1);
      },
    },
    { separator: true },
    {
      label: "Quick random theme (any · ⌥R)",
      icon: "🎲",
      shortcut: "⌥R",
      tip: "Instantly apply a random theme from all 310 themes with no dialog needed (Alt+R / ⌥R).",
      action: () => {
        void randomTheme({ mode: "any" });
      },
    },
    {
      label: "Quick random FX theme (with effects · ⌥E)",
      icon: "✨",
      shortcut: "⌥E",
      tip: "Instantly apply a random animated / 3D FX theme with no dialog needed (Alt+E / ⌥E or ⌥⇧R).",
      action: () => {
        void randomTheme({ mode: "fx" });
      },
    },
    {
      label: "Quick random plain theme (no effects · ⌥P)",
      icon: "⏹️",
      shortcut: "⌥P",
      tip: "Instantly apply a random clean, static color theme with 0.0% GPU load and no dialog needed (Alt+P / ⌥P).",
      action: () => {
        void randomTheme({ mode: "plain" });
      },
    },
    {
      label: "Quick random Ultra / God-Mode theme (⌥U)",
      icon: "🚀",
      shortcut: "⌥U",
      tip: "Instantly apply a random Ultra / Year 3000+ God-Mode / M4 XDR theme with no dialog needed (Alt+U / ⌥U).",
      action: () => {
        void randomTheme({ mode: "ultra" });
      },
    },
    {
      label: "Toggle or turn off animations & FX (⌘0 / ⌥0)",
      icon: "🛑",
      shortcut: "⌘0 / ⌥0",
      tip: "Immediately toggle or stop all background canvas animations, floating particles, and 3D folder effects with no dialog needed (Cmd+0 / Ctrl+0 or Alt+0 / ⌥0).",
      action: () => {
        void toggleCurrentThemeEffects();
      },
    },
    { separator: true },
    {
      label: "Plain themes (no animations)…",
      icon: "⏹️",
      shortcut: "0% GPU",
      tip: "Browse 142+ clean, static color themes (Dracula, Nord, Tokyo Night, Solarized, macOS, Windows, Linux, Retro) with zero animations or GPU effects.",
      action: () => emit("theme-picker", { filter: "plain" }),
    },
    {
      label: "Plain dark themes (no FX)…",
      icon: "🌙",
      shortcut: "Dark · Plain",
      tip: "Browse only dark static color themes without animations or special effects.",
      action: () => emit("theme-picker", { filter: "plain-dark" }),
    },
    {
      label: "Plain light themes (no FX)…",
      icon: "☀️",
      shortcut: "Light · Plain",
      tip: "Browse only light static color themes without animations or special effects.",
      action: () => emit("theme-picker", { filter: "plain-light" }),
    },
    {
      label: "Turn off all animations & FX",
      icon: "🛑",
      tip: "Immediately stop all background canvas animations, floating particles, and 3D folder effects while keeping your current colors.",
      action: () => {
        void disableAllThemeAnimations();
      },
    },
  ];
  const favorites = await favoriteThemes();
  const favKeys = new Set(favorites.map((t) => t.key));
  const pickMenuTheme = (key) =>
    keepFxLocked
      ? applyThemeColorsKeepingCurrentEffects(key)
      : chooseTheme(key);
  if (favorites.length) {
    items.push({ separator: true }, { header: "Favorites" });
    for (const t of favorites)
      items.push({
        label: t.name,
        icon: "★",
        shortcut: formatThemeMenuBadge(t),
        checked: s.palette === t.key,
        tip: t.description,
        action: () => pickMenuTheme(t.key),
      });
  }
  const recent = (await recentThemes()).filter((t) => !favKeys.has(t.key));
  if (recent.length) {
    items.push({ separator: true }, { header: "Recent" });
    for (const t of recent)
      items.push({
        label: t.name,
        icon: t.hasEffects ? "✨" : t.dark === false ? "☀️" : "🌙",
        shortcut: formatThemeMenuBadge(t),
        checked: s.palette === t.key,
        tip: t.description,
        action: () => pickMenuTheme(t.key),
      });
  }
  const hudOpen = isTelemetryPopoutHudOpen();
  items.push(
    { separator: true },
    {
      label: "All themes…",
      icon: "🎨",
      shortcut: "Gallery",
      tip: "Look through all 298+ themes: plain colors, dark, light, 3D folders & pictures, US holidays, nerd & horror worlds, Linux, Windows, macOS, rare classic systems and editor favorites.",
      action: () => emit("theme-picker"),
    },
    {
      label: "FX & 3D Shader themes…",
      icon: "✨",
      shortcut: "Shaders",
      tip: "Browse animated atmospheres, 3D specular folders, glassmorphism, and bespoke UI shaders.",
      action: () => emit("theme-picker", { filter: "fx" }),
    },
    {
      label: "Ultra & XDR Flagship themes…",
      icon: "🚀",
      shortcut: "Ultra",
      tip: "Browse flagship High & Ultra tier studio themes engineered for 60-120fps GPU compositing.",
      action: () => openUltraThemePicker(),
    },
    {
      label: hudOpen
        ? "Hide Live CPU & GPU Telemetry HUD"
        : "Live CPU & GPU Telemetry Monitor…",
      icon: "📟",
      checked: hudOpen,
      tip: "Toggle the floating VFD & Oscilloscope Telemetry HUD on or off.",
      action: () => {
        void toggleTelemetryPopoutHud();
      },
    },
    {
      label: "Export 1920×1080 Theme Poster Card (.svg)…",
      icon: "📸",
      tip: "Download a 1920×1080 high-resolution vector SVG Theme Poster Card with 3D folder specimens, AAA Studio Score, and 1-line Share Code.",
      action: () => {
        void downloadThemePosterCard();
      },
    },
    {
      label: "Paste theme from clipboard (⌘V / ⌘⇧V)…",
      icon: "📋",
      shortcut: "⌘V",
      tip: "Instantly import and apply any CCFM-THEME-v1 share code, CCFM-PACK-v1 bundle, or Theme JSON copied to your clipboard.",
      action: () => {
        void pasteImportThemesFromClipboard({ applyFirst: true });
      },
    },
    {
      label: "Share / Bulk Import themes…",
      icon: "📤",
      tip: "Share any premade or custom theme code, export bundles, or bulk-import themes with automatic conflict resolution.",
      action: () => emit("theme-share", {}),
    },
    {
      label: "Theme Show & Screensaver Studio…",
      icon: "🎬",
      tip: "Launch the interactive Theme Show & Screensaver Studio — cycle themes, storms, 4D tesseracts, and retro XScreenSaver OSDs.",
      action: () => emit("theme-show"),
    },
    {
      label: "Atmospheric effects (rain, smoke…)…",
      icon: "🌧️",
      tip: "Add rain, smoke screen, digital code rain, snowfall, embers, fireflies, cyber storm, quantum nebula or aurora — with Low, Medium and Modern ARM Ultra graphics tiers.",
      action: () => emit("atmosphere-picker"),
    },
    {
      label: "Day / Night theme pair…",
      icon: "🌓",
      tip: "Pick a Light theme for daytime and a Dark theme for nighttime so the File Manager switches automatically with your computer.",
      action: () => emit("theme-day-night"),
    },
    {
      label: "Make my own theme…",
      icon: "✏️",
      tip: "Make a theme, or start from one and change its colors.",
      action: () => emit("theme-editor", {}),
    },
  );
  return items;
}
