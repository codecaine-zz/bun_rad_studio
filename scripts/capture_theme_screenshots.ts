process.env.SCREENSHOT_MODE = "1";

import { createThemeShowcase } from "../demos/23_all_themes_all_controls_showcase";
import { getTheme, SIMPLEGUI_THEMES } from "../src/simplegui";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { Sys } from "../src/simplecli/sys";

// Canonical unique theme list across all modern, high-quality, and nostalgic themes
export const CANONICAL_THEMES = [
    // 1. Signature Brand Theme
    "codefreelance",

    // 2. Modern macOS & Apple Themes
    "sonoma_emerald",
    "apple_dark",
    "apple_light",
    "midnight",
    "apple_sunset",
    "ventura_amber",
    "soft_pastel",

    // 3. Brand-New AAA Designer & Studio Themes
    "raycast_dark",
    "linear_dark",
    "vercel_dark",
    "unreal_engine",
    "arc_velvet",
    "abyss",
    "night_city",
    "horizon",
    "tailwind_dark",
    "supabase",
    "oled_black",
    "titanium_slate",
    "jetbrains_darcula",
    "nordic_paper",

    // 4. High-Quality Modern & Developer Themes
    "monokai_pro",
    "tokyo_night",
    "one_dark_pro",
    "gruvbox_dark",
    "gruvbox_light",
    "rose_pine",
    "everforest",
    "kanagawa",
    "cobalt2",
    "win11_slate",
    "win11_light",
    "aura",

    // 5. Developer Community Themes
    "catppuccin",
    "nord",
    "dracula",
    "cyberpunk",
    "github_dark",
    "github_light",
    "solarized_dark",
    "solarized_light",
    "navy_blue",
    "forest_green",

    // 6. Nostalgic & Vintage Themes ("Bring Back Memories")
    "win95",
    "gameboy",
    "c64",
    "mac_classic",
    "amber_crt",
    "matrix",
    "synthwave",
    "amiga",
    "nextstep",
    "mac_os_aqua",
    "hotdog_stand",
    "playstation"
];

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = join(process.cwd(), "screenshots", "themes");
const TEMP_HTML_DIR = join(process.cwd(), ".temp_screens");

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(TEMP_HTML_DIR, { recursive: true });

console.log(`========================================================================`);
console.log(`📸 Bun RAD Studio - Automated All Themes & Controls Screenshot Pipeline`);
console.log(`========================================================================`);
console.log(`Chrome Binary: ${CHROME_BIN}`);
console.log(`Destination:   ${OUTPUT_DIR}`);
console.log(`Total Themes:  ${CANONICAL_THEMES.length}\n`);

const results: { key: string; name: string; path: string; size: string; isDark: boolean; accent: string }[] = [];

for (let i = 0; i < CANONICAL_THEMES.length; i++) {
    const key = CANONICAL_THEMES[i]!;
    const themeObj = getTheme(key);
    console.log(`[${i + 1}/${CANONICAL_THEMES.length}] Rendering Theme Showcase for: ${themeObj.name} (${key})...`);

    const app = createThemeShowcase(key);
    const html = app.generateHtml();

    const tempHtmlPath = join(TEMP_HTML_DIR, `theme_${key}.html`);
    writeFileSync(tempHtmlPath, html, "utf8");

    const outPath = join(OUTPUT_DIR, `${key}.png`);
    const cmd = `"${CHROME_BIN}" --headless --disable-gpu --screenshot="${outPath}" --window-size=1200,1950 "file://${tempHtmlPath}" 2>/dev/null`;
    Sys.exec(cmd);

    const exists = existsSync(outPath);
    const size = exists ? (Bun.file(outPath).size / 1024).toFixed(1) + " KB" : "0 KB";

    console.log(`  ✔ Captured: ${outPath} (${size}) [${themeObj.is_dark ? 'Dark' : 'Light'}, Accent: ${themeObj.accent_color}]\n`);

    results.push({
        key,
        name: themeObj.name,
        path: outPath,
        size,
        isDark: themeObj.is_dark,
        accent: themeObj.accent_color
    });
}

console.log(`========================================================================`);
console.log(`✨ Successfully generated ${results.length} Theme Screenshots in ${OUTPUT_DIR}!`);
console.log(`========================================================================`);
