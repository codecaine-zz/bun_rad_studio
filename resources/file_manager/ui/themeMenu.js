// The Themes menu of the ribbon: standard light and dark, the themes used lately, and the way into the gallery and the editor,
// so colors can be changed without going through Settings.
import { saveSettings } from "./nav.js";
import { applyThemeColorsKeepingCurrentEffects, chooseTheme, cycleHighEnd3dFolderAnimation, cycleScreenFilter, disableAllThemeAnimations, favoriteThemes, isKeepEffectsColorSwapMode, isKeepIconsOnThemeSwitchMode, isTelemetryPopoutHudOpen, pasteImportThemesFromClipboard, randomColorsKeepCurrentEffects, randomScreenFilter, randomTheme, recentThemes, shuffleSystemIconsKeepTheme, toggleCurrentThemeEffects, toggleKeepEffectsColorSwapMode, toggleKeepIconsOnThemeSwitchMode, toggleTelemetryPopoutHud } from "./themes.js";
import { emit, state } from "./state.js";

/** The items of the menu for the colors in force now. */
export async function themeMenuItems() {
  const s = state.settings;
  const custom = !!s.palette;
  const keepFxLocked = isKeepEffectsColorSwapMode();
  const keepIconsLocked = isKeepIconsOnThemeSwitchMode();
  const standard = (value, label) => ({
    label,
    checked: !custom && s.theme === value,
    action: async () => {
      await disableAllThemeAnimations({ quiet: true, stripThemeEffects: true });
      await saveSettings({ palette: "", theme: value });
    },
  });
  const items = [
    standard("auto", "Standard: follow my computer"),
    standard("light", "Standard light"),
    standard("dark", "Standard dark"),
    { separator: true },
    {
      label: "Swap random colors — keep current effects (⌥C)",
      icon: "🌈",
      tip: "Pick a random color palette from all 310 themes while keeping your active background weather, 3D folder shader, icon pack, and icon animations unchanged (Alt+C / ⌥C).",
      action: () => { void randomColorsKeepCurrentEffects(); },
    },
    {
      label: keepFxLocked ? "Unlock current effects (normal theme switch)" : "Lock current effects (swap colors only)",
      icon: keepFxLocked ? "🔒" : "🔓",
      checked: keepFxLocked,
      tip: "When locked, picking any theme from Favorites, Recent, or the Theme Gallery changes ONLY the color palette while keeping your current active effects!",
      action: () => { toggleKeepEffectsColorSwapMode(); },
    },
    {
      label: "Shuffle system icons — keep current theme & FX (⌥I)",
      icon: "🎭",
      tip: "Shuffle across 49 custom system icon packs, 3D icon glows & animations while keeping your current theme colors and effects intact (Alt+I / ⌥I).",
      action: () => { void shuffleSystemIconsKeepTheme(); },
    },
    {
      label: keepIconsLocked ? "Unlock system icons on theme switch (⌥⇧I)" : "Lock system icons on theme switch (⌥⇧I)",
      icon: keepIconsLocked ? "🔒" : "📌",
      checked: keepIconsLocked,
      tip: "When locked, switching themes preserves your chosen system icon pack, icon glow, and 3D icon animation (Alt+Shift+I / ⌥⇧I).",
      action: () => { toggleKeepIconsOnThemeSwitchMode(); },
    },
    {
      label: "3D Spinning Folders & Futuristic Flash 3000 (⌥3)",
      icon: "💿",
      tip: "Cycle High-End 120Hz 3D Spinning Folder Turntables, 2Advanced v3 Vector HUDs, Gyro Cube Matrices & Liquid Metal Morphs (Alt+3 / ⌥3).",
      action: () => { void cycleHighEnd3dFolderAnimation(1); },
    },
    {
      label: "Cycle CRT / Cinema / Retro Screen Filter (⌥F)",
      icon: "📺",
      tip: "Cycle built-in CRT Trinitron, Green/Amber Phosphor, 1999 VHS, Game Boy DMG, Cyber NVG, Matrix & Thermal Screen Filters (Alt+F / ⌥F).",
      action: () => { void cycleScreenFilter(1); },
    },
    {
      label: "Random CRT / Cinema / Retro Screen Filter (⌥⇧F)",
      icon: "🎞️",
      tip: "Apply a random CRT, Cinema, Retro Handheld, Analog or Optical Screen Filter (Alt+Shift+F / ⌥⇧F).",
      action: () => { void randomScreenFilter(); },
    },
    { separator: true },
    { label: "Quick random theme (any · ⌥R)", icon: "🎲", tip: "Instantly apply a random theme from all 310 themes with no dialog needed (Alt+R / ⌥R).", action: () => { void randomTheme({ mode: "any" }); } },
    { label: "Quick random FX theme (with effects · ⌥E)", icon: "✨", tip: "Instantly apply a random animated / 3D FX theme with no dialog needed (Alt+E / ⌥E or ⌥⇧R).", action: () => { void randomTheme({ mode: "fx" }); } },
    { label: "Quick random plain theme (no effects · ⌥P)", icon: "⏹️", tip: "Instantly apply a random clean, static color theme with 0.0% GPU load and no dialog needed (Alt+P / ⌥P).", action: () => { void randomTheme({ mode: "plain" }); } },
    { label: "Quick random Ultra / God-Mode theme (⌥U)", icon: "🚀", tip: "Instantly apply a random Ultra / Year 3000+ God-Mode / M4 XDR theme with no dialog needed (Alt+U / ⌥U).", action: () => { void randomTheme({ mode: "ultra" }); } },
    { label: "Toggle or turn off animations & FX (⌥0)", icon: "🛑", tip: "Immediately toggle or stop all background canvas animations, floating particles, and 3D folder effects with no dialog needed (Alt+0 / ⌥0).", action: () => { void toggleCurrentThemeEffects(); } },
    { separator: true },
    { label: "Plain themes (no animations)…", icon: "⏹️", tip: "Browse 142+ clean, static color themes (Dracula, Nord, Tokyo Night, Solarized, macOS, Windows, Linux, Retro) with zero animations or GPU effects.", action: () => emit("theme-picker", { filter: "plain" }) },
    { label: "Plain dark themes (no FX)…", icon: "🌙", tip: "Browse only dark static color themes without animations or special effects.", action: () => emit("theme-picker", { filter: "plain-dark" }) },
    { label: "Plain light themes (no FX)…", icon: "☀️", tip: "Browse only light static color themes without animations or special effects.", action: () => emit("theme-picker", { filter: "plain-light" }) },
    { label: "Turn off all animations & FX", icon: "🛑", tip: "Immediately stop all background canvas animations, floating particles, and 3D folder effects while keeping your current colors.", action: () => { void disableAllThemeAnimations(); } },
  ];
  const favorites = await favoriteThemes();
  const favKeys = new Set(favorites.map((t) => t.key));
  const pickMenuTheme = (key) => (keepFxLocked ? applyThemeColorsKeepingCurrentEffects(key) : chooseTheme(key));
  if (favorites.length) {
    items.push({ separator: true }, { header: "Favorites" });
    for (const t of favorites) items.push({ label: t.name, icon: "★", checked: s.palette === t.key, tip: t.description, action: () => pickMenuTheme(t.key) });
  }
  const recent = (await recentThemes()).filter((t) => !favKeys.has(t.key));
  if (recent.length) {
    items.push({ separator: true });
    if (favorites.length) items.push({ header: "Recent" });
    for (const t of recent) items.push({ label: t.name, checked: s.palette === t.key, tip: t.description, action: () => pickMenuTheme(t.key) });
  }
  const hudOpen = isTelemetryPopoutHudOpen();
  items.push(
    { separator: true },
    { label: "All themes…", icon: "🎨", tip: "Look through all 298+ themes: plain colors, dark, light, 3D folders & pictures, US holidays, nerd & horror worlds, Linux, Windows, macOS, rare classic systems and editor favorites.", action: () => emit("theme-picker") },
    {
      label: hudOpen ? "Hide Live CPU & GPU Telemetry HUD" : "Live CPU & GPU Telemetry Monitor…",
      icon: "📟",
      checked: hudOpen,
      tip: "Toggle the floating VFD & Oscilloscope Telemetry HUD on or off.",
      action: () => { void toggleTelemetryPopoutHud(); },
    },
    { label: "Paste theme from clipboard (⌘V / ⌘⇧V)…", icon: "📋", tip: "Instantly import and apply any CCFM-THEME-v1 share code, CCFM-PACK-v1 bundle, or Theme JSON copied to your clipboard.", action: () => { void pasteImportThemesFromClipboard({ applyFirst: true }); } },
    { label: "Share / Bulk Import themes…", icon: "📤", tip: "Share any premade or custom theme code, export bundles, or bulk-import themes with automatic conflict resolution.", action: () => emit("theme-share", {}) },
    { label: "Theme Show & Screensaver Studio…", icon: "🎬", tip: "Launch the interactive Theme Show & Screensaver Studio — cycle themes, storms, 4D tesseracts, and retro XScreenSaver OSDs.", action: () => emit("theme-show") },
    { label: "Atmospheric effects (rain, smoke…)…", icon: "🌧️", tip: "Add rain, smoke screen, digital code rain, snowfall, embers, fireflies, cyber storm, quantum nebula or aurora — with Low, Medium and Modern ARM Ultra graphics tiers.", action: () => emit("atmosphere-picker") },
    { label: "Day / Night theme pair…", icon: "🌓", tip: "Pick a Light theme for daytime and a Dark theme for nighttime so the File Manager switches automatically with your computer.", action: () => emit("theme-day-night") },
    { label: "Make my own theme…", icon: "✏️", tip: "Make a theme, or start from one and change its colors.", action: () => emit("theme-editor", {}) },
  );
  return items;
}

