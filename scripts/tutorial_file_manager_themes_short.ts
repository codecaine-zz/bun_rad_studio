#!/usr/bin/env bun
/**
 * Codecaine File Manager — Themes & Shader Studio Tutorial (SHORT VERSION)
 *
 * A crisp, high-impact quickstart tour dedicated 100% to the Codecaine File Manager
 * Theme & Atmospheric Shader Studio, recorded on the Apple Mac Studio M4 Ultra (6K 120Hz):
 *   - Unobstructed Icons View (#list.view-icons) showcase (no modal blocking the view!)
 *   - Halloween Carved Jack-O'-Lantern Ultra & Polar Night / Sub-Zero Cryo-Glacier
 *   - All 18 US Holiday Celebration Ultra themes with 3D folder crests & bursts
 *   - 20 Master Designer Custom Themes across Low, Medium, High & Ultra system tiers
 *   - Single Custom Theme Import, Bulk custom_themes/ Folder Import & Google Gemini AI Customizer
 *   - 194 Shaders, OKLab Blender, Theme Hacker Lab & Zero-Dialog Shortcuts
 *
 * Usage:
 *   bun scripts/tutorial_file_manager_themes_short.ts all
 */
import "./lib/tts_edge_default";
import { EDGE_VOICE, fmtTime } from "./lib/video_pipeline";
import { runTutorial, type Suite } from "./lib/step_video";
import type { Chapter } from "./lib/fm_tutorial_types";
import {
  GAP,
  RATE,
  RIG_MARK,
  VIEW_H,
  clearUnobstructedBanner,
  closeDialogs,
  createThemesTutorialEnv,
  pick,
  showKeys,
  showThemeUnobstructed,
  slide,
} from "./lib/fm_themes_tutorial_shared";

const { seedWorld, env } = createThemesTutorialEnv({
  tmpDir: "/tmp/cc_fm_themes_short_tutorial",
  cdpPort: 19360,
  fmPort: 19490,
});

const SHORT_RATE = "+14%";
const SHORT_GAP = 0.28;

const chapters: Chapter[] = [
  {
    id: "00_intro",
    chapter: "3-MIN YOUTUBE SHORT",
    title: "Codecaine File Manager Themes — 3-Minute Tour (M4 Ultra 6K 120Hz)",
    kind: "card",
    card: {
      kicker: "3-Minute YouTube Short · Apple Mac Studio M4 Ultra · Pro Display XDR 6K 120Hz",
      title: "God-Mode Themes, 18 US Holidays, Polar Night & Custom Themes Vault",
      lines: [
        "Unobstructed Icons View: 120Hz 3D Spinning Folders, Crests & Shaders in Full Detail",
        "🎃 Halloween Ultra · ❄️ Polar Night & Cryo-Glacier · 🎆 All 18 US Holiday Themes",
        "👑 20 Master Custom Themes (Low / Medium / High / Ultra) · Single & Bulk Import · 🤖 Gemini AI",
      ],
    },
    steps: [
      {
        cap: "Welcome to the 3-Minute Codecaine Themes & Shaders Tour",
        say: "Welcome to the Codecaine File Manager Theme Studio on our Apple Mac Studio M4 Ultra at one hundred and twenty Hertz ProMotion. Watch every theme in unobstructed Icons View—starting with Halloween Ultra, Polar Night, all eighteen U S Holidays, twenty Custom Themes from Low to Ultra, and Google Gemini A I.",
      },
    ],
  },

  {
    id: "01_unobstructed_icons",
    chapter: "UNOBSTRUCTED ICONS VIEW",
    title: "Halloween Ultra, Polar Night & All 18 US Holiday Themes in Icons View",
    blurb: "See every 3D folder shader, holiday crest, cryo icicle, and 120Hz icon animation without a dialog window in the way",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🎃 Halloween Ultra & ❄️ Polar Night / Cryo-Glacier in Unobstructed Icons View",
        say: "With the theme window closed in Icons View, nothing blocks the screen. Here is Halloween Carved Jack-O'-Lantern Ultra with 120 Hertz 3D spinning turntable folders and pumpkin crests, followed by Polar Night with Nordic aurora ribbons, and Sub-Zero Cryo-Glacier with hanging 3D ice spikes.",
        act: async (d) => {
          await d.click("#status-views button >> Icons", { pause: 600 }).catch(() => {});
          await showThemeUnobstructed(
            d,
            "holiday_halloween_jack_o_lantern",
            "🎃 Halloween Carved Jack-O'-Lantern & Witching Hour",
            "Unobstructed Icons View · 120Hz 3D Turntable Folders · 🎃 Pumpkin Crests",
            { anim: "folder_3d_spin_turntable", holidayBurst: true, hoverRow: "custom_themes", waitMs: 1500 },
          );
          await showThemeUnobstructed(
            d,
            "polar_night",
            "🌌 Polar Night (Nordic Aurora & Cryo-Frost Ultra)",
            "Arctic Midnight Slate · Shimmering Aurora Ribbons · Cryo-Frost 3D Folders",
            { anim: "folder_3d_spin_turntable", hoverRow: "camera-raw", waitMs: 1500 },
          );
          await showThemeUnobstructed(
            d,
            "cryo_icicle_blizzard",
            "🧊 Sub-Zero Cryo-Glacier & Hanging Icicles",
            "Glacial Cyan Ice · Hanging 3D Icicles on Every Folder · 3D Gyro Cube",
            { anim: "cube_3d_rotate", hoverRow: "shaders", waitMs: 1400 },
          );
        },
      },
      {
        cap: "🎆 All 18 US Holiday Celebration Ultra Themes — Rapid Unobstructed Parade",
        say: "Now watch all eighteen U S Holiday Ultra themes in unobstructed Icons View—each with custom 3D folder crests and Option H celebration bursts: New Year's, M L K Day, Valentine's, Presidents' Day, Saint Patrick's, Easter, Mother's Day, Memorial Day, Juneteenth, Father's Day, Fourth of July, Labor Day, Indigenous Peoples' Day, Halloween, Veterans Day, Thanksgiving, Hanukkah, and Christmas!",
        act: async (d) => {
          const all18: Array<[string, string, string, string]> = [
            ["holiday_new_years_midnight_champagne", "🥂 1/18 · New Year's Eve Champagne", "3D 🥂 Crests · Gold Fireworks", "folder_3d_spin_turntable"],
            ["holiday_mlk_dream_sunrise", "🕊️ 2/18 · MLK Jr. Sunrise Dream", "3D 🕊️ Crests · Dawn Aurora", "neon_levitate_3d"],
            ["holiday_valentines_velvet_rose", "💝 3/18 · Valentine's Velvet Rose", "3D 💝 Crests · Rose Bokeh", "jelly_squish_3d"],
            ["holiday_presidents_day_parchment", "🦅 4/18 · Presidents' Day Brass", "3D 🦅 Crests · Gold Leaf", "origami_fold_flip"],
            ["holiday_st_patricks_emerald_clover", "☘️ 5/18 · St. Patrick's Clover", "3D ☘️ Crests · Emerald Gold", "folder_3d_spin_turntable"],
            ["holiday_easter_pastel_bloom", "🥚 6/18 · Easter Pastel Bloom", "3D 🥚 Crests · Blossom Breeze", "jelly_squish_3d"],
            ["holiday_mothers_day_botanical_tea", "🌸 7/18 · Mother's Day Botanical", "3D 🌸 Crests · Sunbeam Dust", "neon_levitate_3d"],
            ["holiday_memorial_day_poppy_honor", "🌺 8/18 · Memorial Day Poppy", "3D 🌺 Crests · Marble Honor", "origami_fold_flip"],
            ["holiday_juneteenth_freedom_starburst", "🌟 9/18 · Juneteenth Starburst", "3D 🌟 Crests · Jubilee Fireworks", "folder_3d_spin_turntable"],
            ["holiday_fathers_day_chronograph_denim", "⌚ 10/18 · Father's Day Chronograph", "3D ⌚ Crests · Mahogany Steel", "cube_3d_rotate"],
            ["holiday_fourth_of_july_fireworks", "🎆 11/18 · Fourth of July Fireworks", "3D 🎆 Crests · Liberty Sky Shells", "folder_3d_spin_turntable"],
            ["holiday_labor_day_foundry_forge", "⚒️ 12/18 · Labor Day Steel Forge", "3D ⚒️ Crests · Molten Sparks", "c4d_mograph_extrude"],
            ["holiday_indigenous_autumn_compass", "🧭 13/18 · Indigenous Star-Compass", "3D 🧭 Crests · Turquoise Sun", "origami_fold_flip"],
            ["holiday_halloween_jack_o_lantern", "🎃 14/18 · Halloween Jack-O'-Lantern", "3D 🎃 Crests · Witching Hour", "folder_3d_spin_turntable"],
            ["holiday_veterans_day_valor_medal", "🎖️ 15/18 · Veterans Day Valor Medal", "3D 🎖️ Crests · Honor Gold", "neon_levitate_3d"],
            ["holiday_thanksgiving_harvest_hearth", "🦃 16/18 · Thanksgiving Cornucopia", "3D 🦃 Crests · Maple Hearth", "origami_fold_flip"],
            ["holiday_hanukkah_menorah_starlight", "🕎 17/18 · Hanukkah Menorah", "3D 🕎 Crests · Sapphire Silver", "folder_3d_spin_turntable"],
            ["holiday_christmas_nutcracker_hearth", "🎄 18/18 · Christmas Fireside Hearth", "3D 🎄 Crests · Evergreen Snow", "folder_3d_spin_turntable"],
          ];
          for (const [key, title, sub, anim] of all18) {
            await showThemeUnobstructed(d, key, title, sub, { anim, holidayBurst: true, waitMs: 550 });
          }
        },
      },
    ],
  },

  {
    id: "02_custom_themes_gemini",
    chapter: "CUSTOM THEMES & GEMINI AI",
    title: "20 Master Custom Themes (Low–Ultra), Single/Bulk Import & Gemini AI",
    blurb: "Master custom themes for every hardware tier, single & bulk folder importing, and Google Gemini AI theme synthesis",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "👑 20 Master Custom Themes Across Low, Medium, High & Ultra Systems",
        say: "In the custom themes folder on GitHub, we include twenty Master Custom Themes for Low zero-G P U, Medium sixty-F P S, High one-twenty-Hertz, and Ultra six-K X D R systems—including All Hallows Eve six-K, Polar Aurora Borealis six-K, Polar Daylight Glacier six-K, M4 Ultra Liquid Titanium, Compiz Hellfire, and Omega Pantheon thirty-ninety-nine.",
        act: async (d) => {
          const showcase: Array<[string, string, string, string, string]> = [
            ["custom_00000003", "🎃 Featherweight Halloween Pumpkin Lite", "Tier 1 LOW · 0% GPU Load · Zero Blur · WCAG AAA", "none", "🟢 TIER 1 LOW · 0% GPU FEATHERWEIGHT"],
            ["custom_00000006", "❄️ Balanced Polar Nordic Frost 60fps", "Tier 2 MEDIUM · 1-Layer Snowfall · Frosted Glass", "spring_pop_hover", "🟡 TIER 2 MEDIUM · BALANCED 60FPS"],
            ["custom_0000000a", "🧊 High-Spec Polar Glacier Sub-Zero", "Tier 3 HIGH · Dual-Layer Blizzard + Aurora · Cryo Icicles", "origami_fold_flip", "🟠 TIER 3 HIGH · 60–120HZ PRO"],
            ["custom_0000000d", "🎃 All Hallows Eve 6K XDR Ultra", "Tier 4 ULTRA · 3-Layer Jack-O'-Lantern + Blood Moon · 3D Turntable", "folder_3d_spin_turntable", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_0000000e", "🌌 Polar Aurora Borealis 6K Ultra", "Tier 4 ULTRA · 3-Layer Aurora + Blizzard + Cryo-Frost · 3D Turntable", "folder_3d_spin_turntable", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_0000000f", "🏔️ Polar Daylight Glacier 6K Ultra", "Tier 4 ULTRA · Glacial Daylight + Raytraced Prism · Origami 3D", "origami_fold_flip", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_00000010", "🍎 M4 Ultra Liquid Titanium 6K", "Tier 4 ULTRA · Space-Black Titanium + 6K XDR Caustics · C4D MoGraph", "c4d_mograph_extrude", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_00000012", "🔥 Compiz Hellfire Forge 120Hz", "Tier 4 ULTRA · Blazing Fire Folders + Volcanic Lightning · 3D Cube", "cube_3d_rotate", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_00000014", "🌌 Omega Pantheon 3099 Singularity", "Tier 4 ULTRA · 11D Calabi-Yau + 4D Tesseract · Flash-3000 Orbital", "flash_3000_orbital", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
          ];
          for (const [key, title, sub, anim, tierLabel] of showcase) {
            await showThemeUnobstructed(d, key, title, sub, { anim, tierLabel, hoverRow: "custom_themes", waitMs: 900 });
          }
          await clearUnobstructedBanner(d);
        },
      },
      {
        cap: "📄 Single Import, 📁 Bulk Folder Import & 🤖 Google Gemini AI Customizer",
        say: "Open the custom themes folder and click Share and Import: import a single file, click Load Current Folder Themes to bulk-import the entire folder, or type a prompt into the Google Gemini A I Theme Customizer to generate a custom hybrid theme—then close the window to see it unobstructed!",
        act: async (d) => {
          await d.row("custom_themes", "dblclick", { pause: 800 });
          await d.click("#tool-themes", { pause: 600 });
          await d.menu("All themes", { pause: 800 });
          await d.click('[data-share-hub="true"]', { pause: 800 });
          await d.waitFor('[data-share-import-box="true"]', 6000);
          await d.click('[data-share-import-current-folder-btn="true"]', { pause: 900 }).catch(() => {});
          await d.click('[data-share-import-apply="true"]', { pause: 900 }).catch(() => {});
          if (await d.eval<boolean>(`!!document.querySelector('[data-conflict-summary="true"]')`)) {
            await d.click('[data-conflict-bulk="replace"]', { pause: 600 }).catch(() => {});
            await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="confirm"]', { pause: 800 }).catch(() => {});
          }
          await closeDialogs(d);
          await d.click("#tool-themes", { pause: 500 });
          await d.menu("All themes", { pause: 700 });
          await d.click('[data-share-hub="true"]', { pause: 700 });
          await d.eval(`(() => {
            const p = document.querySelector('[data-gemini-theme-prompt="true"]');
            if (p) {
              p.scrollIntoView({ behavior: 'instant', block: 'center' });
              p.value = "Halloween Jack-O'-Lantern meets Polar Night Aurora with 120Hz 3D spinning folders";
              p.dispatchEvent(new Event('input', { bubbles: true }));
            }
          })()`);
          await d.wait(500);
          await d.click('[data-gemini-generate-btn="true"]', { pause: 800 }).catch(() => {});
          await d.click('[data-share-import-apply="true"]', { pause: 800 }).catch(() => {});
          if (await d.eval<boolean>(`!!document.querySelector('[data-conflict-summary="true"]')`)) {
            await d.click('[data-conflict-bulk="replace"]', { pause: 500 }).catch(() => {});
            await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="confirm"]', { pause: 700 }).catch(() => {});
          }
          await closeDialogs(d);
          await d.click("#tool-up", { pause: 600 }).catch(() => {});
          await d.hover('#list .row[data-name="shaders"]', 900).catch(() => {});
        },
      },
    ],
  },

  {
    id: "03_shaders_editor_keys",
    chapter: "SHADERS & SHORTCUTS",
    title: "Zero-Dialog Keyboard Shortcuts (⌥M, ⌥9, ⌥H, ⌥Z)",
    blurb: "Control 194 shaders, 3D folder spin, and holiday firework bursts directly from the keyboard",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "⌨️ Zero-Dialog Shortcuts: ⌥M Director's Cut, ⌥9 3D Spin, ⌥H Holidays & ⌥Z Undo",
        say: "Best of all, control everything from the keyboard with zero dialogs blocking your view: press Option M for Master Director's Cut, Option 9 for 3D folder spin, Option H for holiday firework bursts, and Option Z to undo.",
        act: async (d) => {
          await closeDialogs(d);
          await showKeys(d, ["⌥", "M"]);
          await d.eval(`window.cycleAppAaaDirectorCut?.(1)`);
          await d.wait(700);
          await showKeys(d, ["⌥", "9"]);
          await d.eval(`window.cycleAppHighEndAnimation?.(1)`);
          await d.wait(700);
          await showKeys(d, ["⌥", "H"]);
          await d.eval(`window.cycleAppHolidayTheme?.(1)`);
          await d.wait(800);
          await showKeys(d, ["⌥", "Z"]);
          await d.eval(`import('/ui/themes.js').then((m) => m.undoThemeHistory?.())`).catch(() => {});
          await d.wait(600);
          await showThemeUnobstructed(
            d,
            "polar_night",
            "🌌 Polar Night · Unobstructed 6K XDR Icons View",
            "Download all 20 Custom Themes & Style Guide in custom_themes/ on GitHub",
            { anim: "folder_3d_spin_turntable", hoverRow: "custom_themes", waitMs: 900 },
          );
          await clearUnobstructedBanner(d);
        },
      },
    ],
  },

  {
    id: "04_outro",
    chapter: "DOWNLOAD ON GITHUB",
    title: "Get All 20 Custom Themes & the Theme Design Style Guide on GitHub",
    kind: "card",
    card: {
      kicker: "Free & Open Source · Recorded on Apple Mac Studio M4 Ultra · Pro Display XDR 6K 120Hz",
      title: "Download Custom Themes & Watch the Full Masterclass!",
      lines: [
        "📦 Custom Themes Vault (Low / Medium / High / Ultra): custom_themes/README.md",
        "📐 Professional Theme Design Style Guide: custom_themes/THEME_DESIGN_STYLE_GUIDE.md",
        "🍎 Apple Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K 120Hz",
      ],
    },
    steps: [
      {
        cap: "Download the Custom Themes Vault & Watch the Full Masterclass",
        say: "Download all twenty custom themes for Low, Medium, High, and Ultra computers plus our Theme Design Style Guide in the custom themes folder on GitHub, and watch our Full Themes Masterclass next!",
      },
    ],
  },
];

function notesText(marks: Array<{ at: number; title: string }>, total: number): string {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const chaptersText = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  return `# Codecaine File Manager Themes — Short Quickstart Tutorial (${fmtTime(total)})

## Reference & Hardware Workstation Mark
- **Workstation Hardware Mark:** \`${RIG_MARK}\`
- **Custom Themes Vault:** [\`custom_themes/README.md\`](../custom_themes/README.md)
- **Professional Theme Design Style Guide:** [\`custom_themes/THEME_DESIGN_STYLE_GUIDE.md\`](../custom_themes/THEME_DESIGN_STYLE_GUIDE.md)

## YouTube Title (87 chars — under YouTube's 100-char limit, copy and paste)
\`\`\`text
Codecaine File Manager Themes Short Tour (M4 Ultra 6K): 18 Holidays & Gemini AI #Shorts
\`\`\`

## YouTube Description (copy and paste)
\`\`\`text
A fast-paced, unobstructed Icons View quickstart tour of the Codecaine File Manager Theme & Atmospheric Shader Studio — recorded and marked on our flagship Apple Mac Studio M4 Ultra (32-Core CPU · 80-Core GPU · 192GB Unified Memory · Apple Pro Display XDR 6K @ 120Hz ProMotion).

Instead of leaving a large theme picker dialog blocking the screen, we switch to Icons View (#list.view-icons) and close the dialog so you can see every 3D folder shader, bobbing holiday corner crest, hanging cryo icicle, and 120Hz 3D icon animation across the full workspace!

⬇️ Download Codecaine File Manager (free & open source): ${REPO}/releases/latest
🎨 Custom Themes Vault (Low / Medium / High / Ultra + 41 Screenshots): ${REPO}/tree/main/custom_themes
📐 Professional Theme Design Style Guide: ${REPO}/blob/main/custom_themes/THEME_DESIGN_STYLE_GUIDE.md
⭐ Source Code: ${REPO}

RECORDING WORKSTATION
🍎 Apple Mac Studio (M4 Ultra · Mac16,14)
⚡ 32-Core CPU · 80-Core Hardware-Ray-Traced GPU · 32-Core Neural Engine
🧠 192 GB Unified LPDDR5X-8533 Memory (819 GB/s Unified Fabric)
🖥️ Apple Pro Display XDR 6K (6016×3384) @ 120Hz ProMotion · Display-P3 1600-nit HDR

WHAT YOU WILL SEE IN THIS SHORT TOUR
🎃 Unobstructed Icons View: Halloween Carved Jack-O'-Lantern Ultra (120Hz 3D spinning turntable folders, 🎃 crests, 🦇 badges), Polar Night (Nordic aurora ribbons), and Sub-Zero Cryo-Glacier (hanging 3D icicles).
🎆 All 18 US Holiday Celebration Ultra Themes: New Year's Champagne, MLK Jr. Sunrise, Valentine's Velvet Rose, Presidents' Day Brass, St. Patrick's Clover, Easter Pastel Bloom, Mother's Day Botanical, Memorial Day Poppy, Juneteenth Starburst, Father's Day Chronograph, Fourth of July Fireworks, Labor Day Steel Forge, Indigenous Star-Compass, Halloween Jack-O'-Lantern, Veterans Day Valor Medal, Thanksgiving Harvest Cornucopia, Hanukkah Menorah, and Christmas Nutcracker Hearth.
👑 20 Master Designer Custom Themes Across All 4 System Tiers:
  • 🟢 Tier 1 Low (0% GPU Featherweight, Zero Blur)
  • 🟡 Tier 2 Medium (Balanced 60fps, 1-Layer Shader)
  • 🟠 Tier 3 High-Spec (60–120Hz Dual-Layer Shaders)
  • 🔴 Tier 4 Ultra (Uncapped 120Hz 6K XDR: All Hallows Eve 6K, Polar Aurora Borealis 6K, Polar Daylight Glacier 6K, M4 Ultra Liquid Titanium, Crimson Blood-Moon Crypt, Compiz Hellfire Forge, Bio-Hazard Dalí Screen-Melt, Omega Pantheon 3099)
📦 Single Custom Theme Import & Bulk Folder Import (📁 Load Current Folder Themes) with automatic Conflict Resolution.
🤖 Built-in Google Gemini AI Theme Customizer & Master LLM Prompt Studio.
⌨️ Zero-Dialog Keyboard Power-Ups: ⌥M Director's Cut, ⌥9 3D Folder Spin, ⌥H Holiday Firework Bursts, ⌥Z 25-Step Theme Undo.

CHAPTERS
${chaptersText}

#FileManager #Themes #UIUX #MacStudio #M4Ultra #GoogleGemini #OpenSource #BunJS #WebGL #Shaders
\`\`\`

## YouTube Tags (copy and paste — comma-separated, under 500 chars)
\`\`\`text
Codecaine File Manager, File Manager Themes, UI Theme Design, Mac Studio M4 Ultra, Pro Display XDR 6K, 120Hz ProMotion, Halloween Theme, Polar Night Theme, US Holiday Themes, Custom Themes GitHub, Google Gemini AI Theme, 3D Folder Icons, Compiz Fire Folders, OKLab Color Blender, Atmospheric Shaders, Open Source File Manager, Bun RAD Studio, WCAG AAA Theme Design
\`\`\`
`;
}

const suite: Suite = {
  name: "file_manager_themes_short",
  chapters,
  seedWorld,
  open: (ch, world) => env.open(ch, world),
  start: () => env.start(),
  stop: () => env.stop(),
  cdp: () => env.c,
  notes: notesText,
  rate: SHORT_RATE,
  gap: SHORT_GAP,
  viewHeight: VIEW_H,
  rigMark: RIG_MARK,
};

await runTutorial(suite, process.argv.slice(2));
process.exit(0);
