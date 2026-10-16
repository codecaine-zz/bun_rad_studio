// The Themes menu of the ribbon: standard light and dark, the themes used lately, and the way into the gallery and the editor,
// so colours can be changed without going through Settings.
import { saveSettings } from "./nav.js";
import { chooseTheme, recentThemes } from "./themes.js";
import { emit, state } from "./state.js";

/** The items of the menu for the colours in force now. */
export async function themeMenuItems() {
  const s = state.settings;
  const custom = !!s.palette;
  const standard = (value, label) => ({ label, checked: !custom && s.theme === value, action: () => saveSettings({ palette: "", theme: value }) });
  const items = [
    standard("auto", "Standard: follow my computer"),
    standard("light", "Standard light"),
    standard("dark", "Standard dark"),
  ];
  const recent = await recentThemes();
  if (recent.length) {
    items.push({ separator: true });
    for (const t of recent) items.push({ label: t.name, checked: s.palette === t.key, tip: t.description, action: () => chooseTheme(t.key) });
  }
  items.push(
    { separator: true },
    { label: "All themes…", icon: "🎨", tip: "Look through more than 170 themes: dark, light, futuristic special effects, Linux, Windows, macOS, rare classic systems and editor favourites.", action: () => emit("theme-picker") },
    { label: "Make my own theme…", icon: "✏️", tip: "Make a theme, or start from one and change its colours.", action: () => emit("theme-editor", {}) },
  );
  return items;
}
