// The Themes menu of the ribbon: standard light and dark, the themes used lately, and the way into the gallery and the editor,
// so colors can be changed without going through Settings.
import { saveSettings } from "./nav.js";
import { chooseTheme, favoriteThemes, pasteImportThemesFromClipboard, recentThemes } from "./themes.js";
import { emit, state } from "./state.js";

/** The items of the menu for the colors in force now. */
export async function themeMenuItems() {
  const s = state.settings;
  const custom = !!s.palette;
  const standard = (value, label) => ({ label, checked: !custom && s.theme === value, action: () => saveSettings({ palette: "", theme: value }) });
  const items = [
    standard("auto", "Standard: follow my computer"),
    standard("light", "Standard light"),
    standard("dark", "Standard dark"),
  ];
  const favorites = await favoriteThemes();
  const favKeys = new Set(favorites.map((t) => t.key));
  if (favorites.length) {
    items.push({ separator: true }, { header: "Favorites" });
    for (const t of favorites) items.push({ label: t.name, icon: "★", checked: s.palette === t.key, tip: t.description, action: () => chooseTheme(t.key) });
  }
  const recent = (await recentThemes()).filter((t) => !favKeys.has(t.key));
  if (recent.length) {
    items.push({ separator: true });
    if (favorites.length) items.push({ header: "Recent" });
    for (const t of recent) items.push({ label: t.name, checked: s.palette === t.key, tip: t.description, action: () => chooseTheme(t.key) });
  }
  items.push(
    { separator: true },
    { label: "All themes…", icon: "🎨", tip: "Look through more than 175 themes: dark, light, 3D folders & pictures, futuristic special effects, Linux, Windows, macOS, rare classic systems and editor favorites.", action: () => emit("theme-picker") },
    { label: "Paste theme from clipboard (⌘V / ⌘⇧V)…", icon: "📋", tip: "Instantly import and apply any CCFM-THEME-v1 share code, CCFM-PACK-v1 bundle, or Theme JSON copied to your clipboard.", action: () => { void pasteImportThemesFromClipboard({ applyFirst: true }); } },
    { label: "Share / Bulk Import themes…", icon: "📤", tip: "Share any premade or custom theme code, export bundles, or bulk-import themes with automatic conflict resolution.", action: () => emit("theme-share", {}) },
    { label: "Theme Show & Screensaver Studio…", icon: "🎬", tip: "Launch the interactive Theme Show & Screensaver Studio — cycle themes, storms, 4D tesseracts, and retro XScreenSaver OSDs.", action: () => emit("theme-show") },
    { label: "Atmospheric effects (rain, smoke…)…", icon: "🌧️", tip: "Add rain, smoke screen, digital code rain, snowfall, embers, fireflies, cyber storm, quantum nebula or aurora — with Low, Medium and Modern ARM Ultra graphics tiers.", action: () => emit("atmosphere-picker") },
    { label: "Day / Night theme pair…", icon: "🌓", tip: "Pick a Light theme for daytime and a Dark theme for nighttime so the File Manager switches automatically with your computer.", action: () => emit("theme-day-night") },
    { label: "Make my own theme…", icon: "✏️", tip: "Make a theme, or start from one and change its colors.", action: () => emit("theme-editor", {}) },
  );
  return items;
}

