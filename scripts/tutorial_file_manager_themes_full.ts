#!/usr/bin/env bun
/**
 * Codecaine File Manager — Themes & Shader Studio Complete Masterclass (FULL VERSION)
 *
 * A calm, methodical, step-by-step MacAcademy-style tutorial dedicated 100% to the
 * Codecaine File Manager Theme & Atmospheric Shader Studio, recorded on the
 * Apple Mac Studio M4 Ultra (32-Core CPU · 80-Core GPU · 192GB Unified · Pro Display XDR 6K 120Hz):
 *
 *   Chapter 00: Welcome & M4 Ultra 6K 120Hz Workstation Overview
 *   Chapter 01: Unobstructed Icons View: Halloween Witching Hour & Polar Night Ultra
 *   Chapter 02: All 18 US Holiday Celebration Ultra Themes in Unobstructed Icons View
 *   Chapter 03: 120Hz 3D Icon Animations & Visceral 3D Folder Shaders in Icons View
 *   Chapter 04: 20 Master Designer Custom Themes Across Low, Medium, High & Ultra System Tiers
 *   Chapter 05: Single Theme Import, Bulk custom_themes/ Folder Import & Conflict Resolution
 *   Chapter 06: Google Gemini AI Theme Customizer, Master LLM Prompt & Style Guide
 *   Chapter 07: Theme Gallery Filters, Hardware Optimizers, Jumpstart Kits & VFD Telemetry
 *   Chapter 08: Split-Screen Comparator, Live OKLab Blender, 4-Stage Solar Cycle & Playlist
 *   Chapter 09: 194 Real-Time Atmospheric Shaders, 6-Layer Mixer & Reactive Physics
 *   Chapter 10: Theme Editor v2, WCAG Contrast Inspector, Theme Hacker Lab & Custom CSS
 *   Chapter 11: Theme Show Screensaver Studio & Zero-Dialog Keyboard Power-Ups
 *   Chapter 12: Course Summary & GitHub Custom Themes Vault Reference
 *
 * Usage:
 *   bun scripts/tutorial_file_manager_themes_full.ts all
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
  tmpDir: "/tmp/cc_fm_themes_full_tutorial",
  cdpPort: 19370,
  fmPort: 19500,
});

const chapters: Chapter[] = [
  {
    id: "00_intro",
    chapter: "THEMES MASTERCLASS",
    title: "Codecaine File Manager — Complete Themes & Shaders Masterclass (M4 Ultra 6K 120Hz)",
    kind: "card",
    card: {
      kicker: "Complete Step-by-Step MacAcademy Course · Apple Mac Studio M4 Ultra · Pro Display XDR 6K 120Hz",
      title: "The Complete Codecaine Theme & Shader Studio Masterclass",
      lines: [
        "Unobstructed Icons View: See Every Theme, 3D Folder Shader & 120Hz Icon Animation Clearly",
        "🎃 Halloween Ultra · ❄️ Polar Night & Cryo-Glacier · 🎆 All 18 US Holiday Celebration Themes",
        "👑 20 Master Custom Themes (Low / Medium / High / Ultra) · Single & Bulk Import · 🤖 Google Gemini AI",
      ],
    },
    steps: [
      {
        cap: "Welcome to the Complete Codecaine Themes & Shaders Masterclass",
        say: "Hello, and welcome to the complete, step-by-step MacAcademy-style masterclass on the Codecaine File Manager Theme and Atmospheric Shader Studio. We are recording on our flagship Apple Mac Studio M4 Ultra with a thirty-two-core C P U, an eighty-core hardware-ray-traced G P U, one hundred and ninety-two gigabytes of unified memory, and an Apple Pro Display X D R six-K running at an uncapped one hundred and twenty Hertz ProMotion. In this course, we never leave a large theme dialog blocking the screen while showing you a theme. Instead, we switch to Icons View and close the dialog so you can see every color, 3D folder shader, holiday corner crest, cryo icicle, and one hundred and twenty Hertz 3D icon animation across the entire workspace.",
      },
    ],
  },

  {
    id: "01_halloween_polar_icons",
    chapter: "HALLOWEEN & POLAR NIGHT",
    title: "Unobstructed Icons View: Halloween Witching Hour & Polar Night Ultra",
    blurb: "Starting in Halloween month with Jack-O'-Lantern Ultra, Nosferatu Blood-Moon, Polar Night, and Sub-Zero Cryo-Glacier",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🎃 Halloween Carved Jack-O'-Lantern Ultra & Nosferatu Blood-Moon in Icons View",
        say: "Because it is Halloween month, we begin in Icons View with Halloween Carved Jack-O'-Lantern and Witching Hour Ultra. Notice that with the theme window closed, you have an unobstructed view of every folder in our project: each folder carries a bobbing 3D carved pumpkin crest, files carry bat badges, and hovering any folder triggers a silky-smooth one hundred and twenty Hertz 3D turntable rotation. Next, watch Nosferatu Crimson Blood-Moon Vampire transform the workspace into deep Gothic obsidian velvet with 3D levitating folders.",
        act: async (d) => {
          await d.click("#status-views button >> Icons", { pause: 1000 }).catch(() => {});
          await showThemeUnobstructed(
            d,
            "holiday_halloween_jack_o_lantern",
            "🎃 Halloween Carved Jack-O'-Lantern & Witching Hour",
            "Unobstructed Icons View · 120Hz 3D Turntable Folders · 🎃 Pumpkin Crests & 🦇 Bat Badges",
            { anim: "folder_3d_spin_turntable", holidayBurst: true, hoverRow: "custom_themes", waitMs: 2400 },
          );
          await d.hover('#list .row[data-name="shaders"]', 1400).catch(() => {});
          await showThemeUnobstructed(
            d,
            "horror_nosferatu_blood_moon",
            "🧛 Nosferatu Crimson Blood-Moon Vampire",
            "Gothic Obsidian Velvet · 3D Levitating Crypt Folders · Blood-Moon Eclipse",
            { anim: "neon_levitate_3d", hoverRow: "security-vault", waitMs: 2200 },
          );
        },
      },
      {
        cap: "❄️ Polar Night, Cryo-Glacier & Custom Polar 6K Ultra Collection",
        say: "Now let's explore the Polar collection in unobstructed Icons View. First is Polar Night, combining deep Arctic midnight slate with shimmering Nordic aurora ribbons and frost-rimmed glass cards. Next is Sub-Zero Cryo-Glacier, which hangs three-dimensional crystalline ice spikes along the top edge of every folder. Then we preview our two Master Custom Polar creations: Polar Aurora Borealis six-K Ultra and Polar Daylight Glacier six-K Ultra.",
        act: async (d) => {
          await showThemeUnobstructed(
            d,
            "polar_night",
            "🌌 Polar Night (Nordic Aurora & Cryo-Frost Ultra)",
            "Arctic Midnight Slate (#090D16) · Shimmering Aurora Ribbons · Cryo-Frost 3D Folders",
            { anim: "folder_3d_spin_turntable", hoverRow: "camera-raw", waitMs: 2400 },
          );
          await showThemeUnobstructed(
            d,
            "cryo_icicle_blizzard",
            "🧊 Sub-Zero Cryo-Glacier & Hanging Icicles",
            "Glacial Cyan Ice · Hanging 3D Icicles on Every Folder · 3D Gyro Cube",
            { anim: "cube_3d_rotate", hoverRow: "music-stems", waitMs: 2400 },
          );
          await showThemeUnobstructed(
            d,
            "custom_0000000e",
            "🌌 Polar Aurora Borealis 6K Ultra (Master Custom #14)",
            "3-Layer Aurora + Blizzard + Liquid Caustics · Cryo-Frost 3D Turntable Folders",
            { anim: "folder_3d_spin_turntable", hoverRow: "ai-models", waitMs: 2200 },
          );
          await showThemeUnobstructed(
            d,
            "custom_0000000f",
            "🏔️ Polar Daylight Glacier 6K Ultra (Master Custom #15)",
            "High-Contrast Glacial Daylight (#EEF6FF) · Raytraced Prism · Origami 3D Fold",
            { anim: "origami_fold_flip", hoverRow: "docker", waitMs: 2200 },
          );
        },
      },
    ],
  },

  {
    id: "02_us_holidays_all_18",
    chapter: "ALL 18 US HOLIDAYS",
    title: "All 18 US Holiday Celebration Ultra Themes in Unobstructed Icons View",
    blurb: "Every US Holiday theme shown with the dialog closed so you can see its 3D folder crests, file badges, and particle bursts",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🥂🕊️💝🦅☘️🥚 US Holidays 1 to 6: New Year's through Easter Sunday",
        say: "Codecaine Studio includes eighteen bespoke U S Holiday Celebration Ultra themes. With the theme window closed in Icons View, let's inspect the first six in detail: New Year's Eve Midnight Champagne with gold firework bursts and champagne flute crests; Martin Luther King Junior Day Sunrise Dream with peace dove crests; Valentine's Day Velvet Rose with ribbon heart crests; Presidents' Day Constitutional Parchment with eagle crests; Saint Patrick's Day Emerald Clover with shamrock crests; and Easter Sunday Pastel Bloom with painted egg crests.",
        act: async (d) => {
          const h1to6: Array<[string, string, string, string]> = [
            ["holiday_new_years_midnight_champagne", "🥂 1/18 · New Year's Eve Midnight Champagne", "3D 🥂 Champagne Crests · Gold Firework Burst · Art-Deco Obsidian", "folder_3d_spin_turntable"],
            ["holiday_mlk_dream_sunrise", "🕊️ 2/18 · MLK Jr. Day Sunrise Dream & Unity Gold", "3D 🕊️ Peace Dove Crests · Warm Amber Dawn Aurora", "neon_levitate_3d"],
            ["holiday_valentines_velvet_rose", "💝 3/18 · Valentine's Day Velvet Rose & Gold", "3D 💝 Ribbon Heart Crests · Rose-Petal Bokeh Shimmer", "jelly_squish_3d"],
            ["holiday_presidents_day_parchment", "🦅 4/18 · Presidents' Day Constitutional Brass", "3D 🦅 Presidential Eagle Crests · Navy & Gold Leaf", "origami_fold_flip"],
            ["holiday_st_patricks_emerald_clover", "☘️ 5/18 · St. Patrick's Day Celtic Emerald Clover", "3D ☘️ Shamrock Crests · Rainbow Pot-of-Gold Shimmer", "folder_3d_spin_turntable"],
            ["holiday_easter_pastel_bloom", "🥚 6/18 · Easter Sunday Pastel Egg & Cherry Blossom", "3D 🥚 Painted Egg Crests · Spring Blossom Breeze", "jelly_squish_3d"],
          ];
          for (const [key, title, sub, anim] of h1to6) {
            await showThemeUnobstructed(d, key, title, sub, { anim, holidayBurst: true, hoverRow: "custom_themes", waitMs: 1850 });
          }
        },
      },
      {
        cap: "🌸🌺🌟⌚🎆⚒️ US Holidays 7 to 12: Mother's Day through Labor Day",
        say: "Continuing through holidays seven to twelve in unobstructed Icons View: Mother's Day Botanical Rose Garden with peony crests; Memorial Day Remembrance Red Poppy and White Marble; Juneteenth Emancipation Starburst with Pan-African jubilee fireworks; Father's Day Horology Chronograph and Smoked Mahogany; Fourth of July Grand Finale Fireworks with red, white, and blue sky shells; and Labor Day Steel Foundry and Rivet Forge with molten spark streams.",
        act: async (d) => {
          const h7to12: Array<[string, string, string, string]> = [
            ["holiday_mothers_day_botanical_tea", "🌸 7/18 · Mother's Day Botanical Rose Garden", "3D 🌸 Peony Blossom Crests · Warm Sunbeam Dust", "neon_levitate_3d"],
            ["holiday_memorial_day_poppy_honor", "🌺 8/18 · Memorial Day Remembrance Poppy & Marble", "3D 🌺 Red Poppy Crests · Twilight Starlight", "origami_fold_flip"],
            ["holiday_juneteenth_freedom_starburst", "🌟 9/18 · Juneteenth Emancipation Starburst", "3D 🌟 Nova Star Crests · Pan-African Jubilee Fireworks", "folder_3d_spin_turntable"],
            ["holiday_fathers_day_chronograph_denim", "⌚ 10/18 · Father's Day Chronograph & Mahogany", "3D ⌚ Tourbillon Gear Crests · Brushed Steel & Espresso", "cube_3d_rotate"],
            ["holiday_fourth_of_july_fireworks", "🎆 11/18 · Fourth of July Grand Finale Fireworks", "3D 🎆 Liberty Rocket Crests · Red-White-Blue Sky Shells", "folder_3d_spin_turntable"],
            ["holiday_labor_day_foundry_forge", "⚒️ 12/18 · Labor Day Steel Foundry & Rivet Forge", "3D ⚒️ Crossed Hammer Crests · Molten Spark Stream", "c4d_mograph_extrude"],
          ];
          for (const [key, title, sub, anim] of h7to12) {
            await showThemeUnobstructed(d, key, title, sub, { anim, holidayBurst: true, hoverRow: "shaders", waitMs: 1850 });
          }
        },
      },
      {
        cap: "🧭🎃🎖️🦃🕎🎄 US Holidays 13 to 18: Indigenous Peoples' Day through Christmas",
        say: "And here are holidays thirteen through eighteen in unobstructed Icons View: Indigenous Peoples' and Columbus Day Autumn Star-Compass; Halloween Carved Jack-O'-Lantern and Witching Hour; Veterans Day Valor Medal and Honor Guard Gold; Thanksgiving Harvest Cornucopia and Maple Hearth; Hanukkah Festival of Lights Menorah and Starlight Sapphire; and Christmas Nutcracker Fireside Hearth with evergreen wreath crests and gentle snowfall.",
        act: async (d) => {
          const h13to18: Array<[string, string, string, string]> = [
            ["holiday_indigenous_autumn_compass", "🧭 13/18 · Indigenous Peoples' & Columbus Day Compass", "3D 🧭 Celestial Compass Crests · Terracotta Turquoise", "origami_fold_flip"],
            ["holiday_halloween_jack_o_lantern", "🎃 14/18 · Halloween Carved Jack-O'-Lantern", "3D 🎃 Pumpkin & 🦇 Bat Crests · Witching Hour Fog", "folder_3d_spin_turntable"],
            ["holiday_veterans_day_valor_medal", "🎖️ 15/18 · Veterans Day Valor Medal & Honor Gold", "3D 🎖️ Dress Ribbon Crests · Honor Guard Gold", "neon_levitate_3d"],
            ["holiday_thanksgiving_harvest_hearth", "🦃 16/18 · Thanksgiving Harvest Cornucopia", "3D 🦃 Autumn Maple Crests · Falling Leaves & Hearth", "origami_fold_flip"],
            ["holiday_hanukkah_menorah_starlight", "🕎 17/18 · Hanukkah Festival of Lights Menorah", "3D 🕎 Nine-Branch Menorah Crests · Sapphire & Silver", "folder_3d_spin_turntable"],
            ["holiday_christmas_nutcracker_hearth", "🎄 18/18 · Christmas Nutcracker Fireside Hearth", "3D 🎄 Evergreen Wreath Crests · Snowfall & Warm Ember", "folder_3d_spin_turntable"],
          ];
          for (const [key, title, sub, anim] of h13to18) {
            await showThemeUnobstructed(d, key, title, sub, { anim, holidayBurst: true, hoverRow: "games", waitMs: 1850 });
          }
        },
      },
    ],
  },

  {
    id: "03_3d_folder_icon_animations",
    chapter: "3D ICONS & SHADERS",
    title: "120Hz 3D Icon Animations & Visceral 3D Folder Shaders in Icons View",
    blurb: "Turntable spin, origami flip, 6-DOF gyro cube, Flash 3000 orbital rings, C4D MoGraph, blazing fire folders & toxic slime",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🌀 14 Hardware-Accelerated 120Hz 3D Icon Animations in Icons View",
        say: "In Icons View, every folder and file icon supports fourteen hardware-accelerated 3D motion profiles that you can cycle anytime with Option 9. Watch as we hover over our project folders across 3D Turntable Spin, Origami Isometric Fold, Six-Degree-of-Freedom Gyro Cube, Two-Advanced Year Three Thousand Orbital Rings, Cinema 4D MoGraph Extrude, Magnetic Neon Levitation, and Elastic 3D Jelly Squish.",
        act: async (d) => {
          const anims: Array<[string, string, string]> = [
            ["folder_3d_spin_turntable", "🌀 3D Turntable Spin (folder_3d_spin_turntable)", "ai-models"],
            ["origami_fold_flip", "🦢 3D Origami Isometric Fold (origami_fold_flip)", "camera-raw"],
            ["cube_3d_rotate", "🎲 6-DOF 3D Gyro Cube (cube_3d_rotate)", "docker"],
            ["flash_3000_orbital", "⚡ 2Advanced Flash-3000 Orbital HUD (flash_3000_orbital)", "games"],
            ["c4d_mograph_extrude", "🎬 Cinema 4D MoGraph Extrude (c4d_mograph_extrude)", "music-stems"],
            ["neon_levitate_3d", "🛸 Magnetic Neon Levitation (neon_levitate_3d)", "security-vault"],
            ["jelly_squish_3d", "🍮 Elastic 3D Jelly Squish (jelly_squish_3d)", "shaders"],
          ];
          for (const [anim, label, rowName] of anims) {
            await showThemeUnobstructed(
              d,
              "mac_studio_m4_ultra",
              label,
              "Apple Mac Studio M4 Ultra 6K XDR · Unobstructed Icons View",
              { anim, hoverRow: rowName, waitMs: 1700 },
            );
          }
        },
      },
      {
        cap: "🔥 Visceral 3D Folder Material Shaders: Fire, Slime, Tornado, Tie-Dye & Singularity",
        say: "Beyond motion, themes can attach visceral 3D material shaders directly to every folder card: Compiz Fusion Blazing Fire Folders with rising flames, Toxic Bio-Slime dripping neon green ooze, E F 5 Debris Tornado swirling folders in a supercell vortex, Haight-Ashbury Tie-Dye sixty-seven lava-wax folders, Two-Advanced Year Three Thousand vector HUDs, and Omega Point Singularity.",
        act: async (d) => {
          await showThemeUnobstructed(d, "inferno_fire_folders", "🔥 Inferno Blazing Folders", "Compiz Fusion Flame Shader · Rising Embers on Every Folder", { anim: "c4d_mograph_extrude", hoverRow: "docker", waitMs: 1950 });
          await showThemeUnobstructed(d, "toxic_slime_ooze", "🧪 Toxic Bio-Slime Ooze", "Dripping Radioactive Slime Folders · Elastic 3D Jelly Squish", { anim: "jelly_squish_3d", hoverRow: "games", waitMs: 1950 });
          await showThemeUnobstructed(d, "ef5_debris_tornado", "🌪️ EF5 Debris Tornado Supercell", "Swirling Vortex Wind · 3D Gyro Cube Folders", { anim: "cube_3d_rotate", hoverRow: "shaders", waitMs: 1950 });
          await showThemeUnobstructed(d, "summer_of_love_tiedye_67", "☮️ Haight-Ashbury Tie-Dye '67 (120Hz Lava-Wax)", "Psychedelic Tie-Dye Silk · 120Hz Turntable Spin", { anim: "folder_3d_spin_turntable", hoverRow: "music-stems", waitMs: 1950 });
          await showThemeUnobstructed(d, "flash_2advanced_v3_studio", "⚡ 2Advanced Studios v3 (Year 3000 Flash HUD)", "Orbital Vector Sweeps · Flash-3000 3D Rings", { anim: "flash_3000_orbital", hoverRow: "ai-models", waitMs: 1950 });
          await showThemeUnobstructed(d, "omega_point_singularity", "🌌 Omega Point Singularity (Year 3099)", "11D Calabi-Yau Manifold · Photonic 3D Folders", { anim: "folder_3d_spin_turntable", hoverRow: "custom_themes", waitMs: 1950 });
        },
      },
    ],
  },

  {
    id: "04_master_custom_themes_tiers",
    chapter: "20 MASTER CUSTOM THEMES",
    title: "20 Master Designer Custom Themes Across Low, Medium, High & Ultra Tiers",
    blurb: "Custom themes engineered for every class of computer, showcased unobstructed in Icons View",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🟢 Tier 1 Low (0% GPU) & 🟡 Tier 2 Medium (60fps) Master Custom Themes",
        say: "Not every computer has an eighty-core G P U, so we engineered twenty Master Designer Custom Themes across all four hardware tiers in the custom themes folder on GitHub. First, in unobstructed Icons View, are our four Tier 1 Low Featherweight themes with zero percent G P U load and zero blur for VMs, SSH sessions, and battery saving—followed by our four Tier 2 Medium Balanced themes running a single sixty-frames-per-second shader layer.",
        act: async (d) => {
          const lowAndMed: Array<[string, string, string, string, string]> = [
            ["custom_00000001", "📄 #01 · Featherweight E-Ink Paper Daylight", "0% GPU · Zero Blur · 14.8:1 WCAG AAA Daylight Paper", "none", "🟢 TIER 1 LOW · 0% GPU FEATHERWEIGHT"],
            ["custom_00000002", "🌑 #02 · Featherweight OLED Pitch-Black", "0% GPU · True #000000 OLED Battery Saver · Crisp 1px Grid", "none", "🟢 TIER 1 LOW · 0% GPU FEATHERWEIGHT"],
            ["custom_00000003", "🎃 #03 · Featherweight Halloween Pumpkin Lite", "0% GPU · Spooky Harvest Amber without Canvas Shaders", "none", "🟢 TIER 1 LOW · 0% GPU FEATHERWEIGHT"],
            ["custom_00000004", "❄️ #04 · Featherweight Polar Ice Lite", "0% GPU · Crisp Nordic Slate & Glacial Cyan", "none", "🟢 TIER 1 LOW · 0% GPU FEATHERWEIGHT"],
            ["custom_00000005", "🍎 #05 · Balanced Cupertino Sequoia Studio", "60fps 1-Layer Sunbeams · Frosted Acrylic Glass", "spring_pop_hover", "🟡 TIER 2 MEDIUM · BALANCED 60FPS"],
            ["custom_00000006", "❄️ #06 · Balanced Polar Nordic Frost 60fps", "60fps 1-Layer Snowfall · Frosted Arctic Slate", "spring_pop_hover", "🟡 TIER 2 MEDIUM · BALANCED 60FPS"],
            ["custom_00000007", "🎃 #07 · Balanced Autumn Halloween Lantern", "60fps 1-Layer Firefly Embers · Warm Pumpkin Glass", "spring_pop_hover", "🟡 TIER 2 MEDIUM · BALANCED 60FPS"],
            ["custom_00000008", "🍵 #08 · Balanced Kyoto Matcha Botanical", "60fps 1-Layer Bamboo Fireflies · Jade Botanical Slate", "spring_pop_hover", "🟡 TIER 2 MEDIUM · BALANCED 60FPS"],
          ];
          for (const [key, title, sub, anim, tierLabel] of lowAndMed) {
            await showThemeUnobstructed(d, key, title, sub, { anim, tierLabel, hoverRow: "custom_themes", waitMs: 1450 });
          }
        },
      },
      {
        cap: "🟠 Tier 3 High-Spec (60–120Hz) & 🔴 Tier 4 Ultra (120Hz 6K XDR) Custom Themes",
        say: "Next in unobstructed Icons View are our four Tier 3 High-Spec themes with dual-layer shaders for Apple M-Series and modern gaming PCs, followed by all eight Tier 4 Ultra themes engineered for uncapped one hundred and twenty Hertz ProMotion on six-K X D R displays: All Hallows Eve six-K X D R Ultra, Polar Aurora Borealis six-K Ultra, Polar Daylight Glacier six-K Ultra, M4 Ultra Liquid Titanium, Crimson Blood-Moon Crypt Ultra, Compiz Hellfire Forge, Bio-Hazard Dalí Screen-Melt, and Omega Pantheon thirty-ninety-nine.",
        act: async (d) => {
          const highAndUltra: Array<[string, string, string, string, string]> = [
            ["custom_00000009", "💧 #09 · High-Spec Tahoe Liquid Glass Pro", "Dual-Layer Liquid Caustics + Aurora · Specular Glass", "neon_levitate_3d", "🟠 TIER 3 HIGH · 60–120HZ PRO"],
            ["custom_0000000a", "🧊 #10 · High-Spec Polar Glacier Sub-Zero", "Dual-Layer Blizzard + Aurora · Hanging Cryo Icicles", "origami_fold_flip", "🟠 TIER 3 HIGH · 60–120HZ PRO"],
            ["custom_0000000b", "💚 #11 · High-Spec Cyberdeck Matrix HUD", "Dual-Layer Matrix Rain + Synthwave Grid · Holo Glitch", "flash_3000_orbital", "🟠 TIER 3 HIGH · 60–120HZ PRO"],
            ["custom_0000000c", "👑 #12 · High-Spec Sovereign 24K Gold", "Dual-Layer Golden Dust + Warm Bokeh · 24K Bullion Folders", "c4d_mograph_extrude", "🟠 TIER 3 HIGH · 60–120HZ PRO"],
            ["custom_0000000d", "🎃 #13 · All Hallows Eve 6K XDR Ultra", "3-Layer Jack-O'-Lantern + Blood Moon + Fireflies · 3D Turntable", "folder_3d_spin_turntable", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_0000000e", "🌌 #14 · Polar Aurora Borealis 6K Ultra", "3-Layer Aurora + Blizzard + Caustics · Cryo-Frost 3D Turntable", "folder_3d_spin_turntable", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_0000000f", "🏔️ #15 · Polar Daylight Glacier 6K Ultra", "3-Layer Glacial Daylight + Raytraced Prism · Origami 3D", "origami_fold_flip", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_00000010", "🍎 #16 · M4 Ultra Liquid Titanium 6K", "3-Layer Raytraced Prism + Caustics + Starfield · C4D MoGraph", "c4d_mograph_extrude", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_00000011", "🧛 #17 · Crimson Blood-Moon Crypt Ultra", "3-Layer Blood Moon + Tesla Plasma + Fog · 3D Levitate", "neon_levitate_3d", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_00000012", "🔥 #18 · Compiz Hellfire Forge 120Hz", "3-Layer Volcanic Lightning + Plasma + Fire · 3D Gyro Cube", "cube_3d_rotate", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_00000013", "🧪 #19 · Bio-Hazard Dalí Screen-Melt", "3-Layer Ferrofluid + Klein Bottle + Matrix · Jelly 3D Squish", "jelly_squish_3d", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
            ["custom_00000014", "🌌 #20 · Omega Pantheon 3099 Singularity", "3-Layer Calabi-Yau + 4D Tesseract + Tokamak · Flash-3000 Orbital", "flash_3000_orbital", "🔴 TIER 4 ULTRA · 120HZ 6K XDR"],
          ];
          for (const [key, title, sub, anim, tierLabel] of highAndUltra) {
            await showThemeUnobstructed(d, key, title, sub, { anim, tierLabel, hoverRow: "shaders", waitMs: 1450 });
          }
          await clearUnobstructedBanner(d);
        },
      },
    ],
  },

  {
    id: "05_single_and_bulk_folder_import",
    chapter: "SINGLE & BULK IMPORT",
    title: "Single Custom Theme Import & Bulk custom_themes/ Folder Import",
    blurb: "Import one theme file or bulk-load an entire custom_themes/ directory in one click with Conflict Resolution",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "📂 Inside the custom_themes/ Folder: Individual Files & Tier Packs",
        say: "Let's double-click the custom themes folder right inside the File Manager. Here you find each of the twenty custom themes saved as both a J S O N file and a one-line C C F M share code, alongside our four hardware-tier packs—Low, Medium, High, and Ultra—plus the complete twenty-theme master pack and the Professional Theme Design Style Guide.",
        act: async (d) => {
          await d.row("custom_themes", "dblclick", { pause: 1600 });
          await d.hover('#list .row[data-name="ultra_all_hallows_eve_6k_xdr.json"]', 1300).catch(() => {});
          await d.hover('#list .row[data-name="ultra_polar_aurora_borealis_6k.json"]', 1300).catch(() => {});
          await d.hover('#list .row[data-name="pack_tier_4_ultra_6k_xdr_120hz.json"]', 1300).catch(() => {});
          await d.hover('#list .row[data-name="master_all_systems_20_themes_pack.json"]', 1300).catch(() => {});
        },
      },
      {
        cap: "📄 Single Custom Theme Import (JSON / CCFM Code / ⌘V Paste)",
        say: "First, let's do a Single Custom Theme Import. I open Themes, click Share and Import, and load a single custom theme definition into the import box—or you can press Command V anywhere in the File Manager. Clicking Parse and Import Theme immediately validates its W C A G contrast ratios and saves it under My Themes. I close the window so we can see our newly imported single theme unobstructed!",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.click('[data-share-hub="true"]', { pause: 1300 });
          await d.waitFor('[data-share-import-box="true"]', 6000);
          await d.eval(`(() => {
            const box = document.querySelector('[data-share-import-box="true"]');
            if (!box) return;
            box.value = JSON.stringify({
              format: 'bun-rad-studio-file-manager-theme',
              version: 1,
              name: "Polar Jack-O'-Lantern 6K",
              dark: true,
              base: 'Custom Import',
              colors: { background: '#070b14', card: '#111a2e', text: '#f8fafc', accent: '#ff8c1a', secondary: '#38bdf8', border: '#38bdf8', danger: '#ff4d6d', warning: '#fbbf24', success: '#34d399', info: '#38bdf8' },
              fx: {
                glow: 'ember',
                glowColor: '#ff8c1a',
                glowColor2: '#38bdf8',
                blur: 28,
                glass: 0.74,
                glowIntensity: 1,
                borderOpacity: 0.34,
                grain: 'subtle',
                scanlines: 'none',
                radius: 'squircle',
                border: 'iridescent',
                motion: 'spring',
                sheen: true,
                noise: true,
                chromatic: false,
                ambient: true,
                atmosphere: 'autumn_leaves+embers+aurora_australis',
                uiElementFx: 'holiday_festive_glow',
                iconPackStyle: 'us_holidays_festive',
                iconAnimation: 'folder_3d_spin_turntable'
              }
            }, null, 2);
            box.dispatchEvent(new Event('input', { bubbles: true }));
          })()`);
          await d.wait(1100);
          await d.click('[data-share-import-apply="true"]', { pause: 1400 });
          if (await d.eval<boolean>(`!!document.querySelector('[data-conflict-summary="true"]')`)) {
            await d.click('[data-conflict-bulk="replace"]', { pause: 700 }).catch(() => {});
            await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="confirm"]', { pause: 1000 }).catch(() => {});
          }
          await closeDialogs(d);
          await d.wait(1500);
        },
      },
      {
        cap: "📁 Bulk Folder Import: Load Current Folder Themes & Conflict Resolution",
        say: "Now let's do a Bulk Folder Import of the entire custom themes directory! In Share and Import, I click Load Current Folder Themes. It automatically scans the open custom themes folder, reads every J S O N and C C F M file, and loads all twenty themes into the staging box. When I click Parse and Import, the Conflict Resolution modal appears for any existing theme names—letting you Replace, Keep Both with auto-rename, Merge FX, or Skip in one click!",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.click('[data-share-hub="true"]', { pause: 1300 });
          await d.waitFor('[data-share-import-current-folder-btn="true"]', 6000);
          await d.hover('[data-share-import-current-folder-btn="true"]', 1000).catch(() => {});
          await d.click('[data-share-import-current-folder-btn="true"]', { pause: 1600 }).catch(() => {});
          await d.click('[data-share-import-apply="true"]', { pause: 1600 }).catch(() => {});
          if (await d.eval<boolean>(`!!document.querySelector('[data-conflict-summary="true"]')`)) {
            await d.hover('[data-conflict-row="0"]', 1000).catch(() => {});
            await d.click('[data-conflict-bulk="replace"]', { pause: 1100 }).catch(() => {});
            await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="confirm"]', { pause: 1500 }).catch(() => {});
          }
          await closeDialogs(d);
          await d.click("#tool-up", { pause: 1100 }).catch(() => {});
          await showThemeUnobstructed(
            d,
            "custom_0000000e",
            "📦 Bulk Folder Import Complete · 20 Master Custom Themes Ready",
            "Showing Polar Aurora Borealis 6K Ultra in Unobstructed Icons View",
            { anim: "folder_3d_spin_turntable", hoverRow: "custom_themes", waitMs: 1800 },
          );
          await clearUnobstructedBanner(d);
        },
      },
    ],
  },

  {
    id: "06_gemini_ai_theme_customizer",
    chapter: "GEMINI AI & STYLE GUIDE",
    title: "🤖 Google Gemini AI Theme Customizer, Master LLM Prompt & Style Guide",
    blurb: "Generate custom themes from natural language with Google Gemini AI and inspect the Professional Theme Design Style Guide",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🤖 Synthesize Custom Themes with the Google Gemini AI Theme Customizer",
        say: "Inside Share and Import, scroll to the Google Gemini A I Theme Customizer and Prompt Studio. Type any natural-language theme idea—such as Halloween Jack-O'-Lantern meets Polar Night Aurora with one hundred and twenty Hertz 3D spinning folders—choose your target hardware tier from Low to Ultra, and click Generate with Gemini A I. It synthesizes a complete, W C A G-verified theme JSON, populates the import box, and saves and applies it immediately. Let's close the dialog so you can see the Gemini-crafted theme across the full Icons View!",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.click('[data-share-hub="true"]', { pause: 1300 });
          await d.waitFor('[data-gemini-theme-prompt="true"]', 6000);
          await d.eval(`(() => {
            const p = document.querySelector('[data-gemini-theme-prompt="true"]');
            if (p) {
              p.scrollIntoView({ behavior: 'instant', block: 'center' });
              p.value = "Halloween Jack-O'-Lantern meets Polar Night Aurora with 120Hz 3D spinning folders";
              p.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const t = document.querySelector('[data-gemini-theme-tier="true"]');
            if (t) {
              t.value = 'ultra';
              t.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()`);
          await d.wait(1000);
          await d.hover('[data-gemini-copy-prompt-btn="true"]', 900).catch(() => {});
          await d.click('[data-gemini-generate-btn="true"]', { pause: 1300 }).catch(() => {});
          await d.click('[data-share-import-apply="true"]', { pause: 1300 }).catch(() => {});
          if (await d.eval<boolean>(`!!document.querySelector('[data-conflict-summary="true"]')`)) {
            await d.click('[data-conflict-bulk="replace"]', { pause: 700 }).catch(() => {});
            await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="confirm"]', { pause: 1000 }).catch(() => {});
          }
          await closeDialogs(d);
          await d.hover('#list .row[data-name="shaders"]', 1400).catch(() => {});
          await d.hover('#list .row[data-name="ai-models"]', 1400).catch(() => {});
        },
      },
      {
        cap: "📐 Inspecting the Professional Theme Design Style Guide in Live Preview",
        say: "You can also click Copy Gemini L L M Master Prompt to paste our full schema specification into Google Gemini Chat or Google A I Studio, or open the Professional Theme Design Style Guide right inside the custom themes folder to review the color tokens, W C A G contrast floors, and Low, Medium, High, and Ultra G P U budgets.",
        act: async (d) => {
          await closeDialogs(d);
          await d.row("THEME_DESIGN_STYLE_GUIDE.md", "dblclick", { pause: 1600 }).catch(async () => {
            await d.click("#view-tools", { pause: 900 });
            await d.click("#power-tab-code", { pause: 1200 });
          });
          await d.waitFor(".code-root, .code-editor", 8000);
          await d.click("#power-body button >> Preview", { pause: 1600 }).catch(() => {});
          await d.hover(".code-root", 1800);
          await d.click("#view-files", { pause: 1100 });
        },
      },
    ],
  },

  {
    id: "07_gallery_jumpstart_telemetry",
    chapter: "GALLERY & JUMPSTART KITS",
    title: "Theme Gallery Filters, Hardware Optimizers, Jumpstart Kits & VFD Telemetry",
    blurb: "One-click platform optimizers, Winamp VFD telemetry deck, and Jumpstart Workstation Kits",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "Cross-Platform Mac/Windows/Linux Optimizers & Live VFD Telemetry Deck",
        say: "In the Theme Gallery top bar, you have one-click Optimize buttons for macOS ProMotion, Windows DirectX 12 WebView2, and Linux, plus a live Hardware V F D and Winamp Spectrum Telemetry Deck that measures real-time frame pacing.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1300 });
          await d.waitFor(".theme-card", 6000);
          await d.click('[data-optimize-platform="linux"]', { pause: 700 }).catch(() => {});
          await d.click('[data-optimize-platform="windows"]', { pause: 700 }).catch(() => {});
          await d.click('[data-optimize-platform="macos"]', { pause: 700 }).catch(() => {});
          await d.click('[data-open-telemetry-studio="true"]', { pause: 1000 }).catch(() => {});
          await d.click('[data-telemetry-skin-btn="winamp_spectrum"]', { pause: 900 }).catch(() => {});
          await d.click('[data-open-telemetry-studio="true"]', { pause: 700 }).catch(() => {});
        },
      },
      {
        cap: "⚡ One-Click Jumpstart Workstation Kits — Shown Unobstructed!",
        say: "Click any One-Click Jumpstart Workstation Kit—like Year Three Thousand Omega Singularity, Mac Studio M4 Ultra six-K X D R, or macOS Tahoe 3D Glass—and then close the gallery to see the complete transformation across your Icons View workspace.",
        act: async (d) => {
          await d.eval(`(() => { const det = document.querySelector('[data-fx-studio-drawer="true"]'); if (det) det.open = true; })()`);
          await d.wait(300);
          await d.click('[data-jumpstart-kit="godmode_omega_singularity_kit"]', { pause: 1200 }).catch(() => {});
          await d.click('[data-jumpstart-kit="mac_studio_m4_ultra_kit"]', { pause: 1200 }).catch(() => {});
          await d.click('[data-jumpstart-kit="macos_tahoe_3d_kit"]', { pause: 1200 }).catch(() => {});
          await closeDialogs(d);
          await d.hover('#list .row[data-name="camera-raw"]', 1500).catch(() => {});
          await d.hover('#list .row[data-name="music-stems"]', 1500).catch(() => {});
        },
      },
    ],
  },

  {
    id: "08_compare_oklab_solar",
    chapter: "COMPARE, OKLAB & SOLAR",
    title: "Split-Screen Comparator, Live OKLab Blender, Solar Cycle & Playlist",
    blurb: "Compare any two themes side-by-side, blend them in OKLab color space, and automate 4-stage solar schedules",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "⚖️ Split-Screen Wipe Comparator & Live OKLab Perceptual Theme Blender",
        say: "Open Compare and Blend to drag a live split-screen wipe across Polar Night and Halloween Jack-O'-Lantern, inspect the token diff table, or use the Live O K Lab Theme Blender to crossfade both themes at any percentage ratio—then close the dialog to see the blended result!",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.click('[data-compare-themes="true"]', { pause: 1400 });
          await d.waitFor(".theme-compare-slider", 6000);
          await pick(d, "Left theme (Theme A)", "polar_night");
          await pick(d, "Right theme (Theme B)", "holiday_halloween_jack_o_lantern");
          await slide(d, "Split comparison wipe position", 50, 22, 4);
          await slide(d, "Split comparison wipe position", 22, 78, 4);
          await slide(d, "Split comparison wipe position", 78, 50, 4);
          await slide(d, "OKLab Theme Blend Ratio (0% = A, 100% = B)", 50, 65, 5).catch(() => {});
          await d.click('[data-preview-blend="true"]', { pause: 1300 }).catch(() => {});
          await closeDialogs(d);
          await d.wait(1200);
        },
      },
      {
        cap: "🌅 Day / Night Pairing, 4-Stage Solar Cycle & Ambient Playlist Rotation",
        say: "In Day Night and Playlist, pair your favorite light and dark themes, click Auto-Fill Sci-Fi Solar Cycle for Dawn, Day, Dusk, and Midnight transitions, or turn on Ambient Playlist Auto-Rotation.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.click(".theme-tools button >> Day / Night", { pause: 1400 });
          await d.waitFor('[data-solar-preset="scifi"]', 6000);
          await d.click('[data-solar-preset="scifi"]', { pause: 1400 });
          await d.click('[data-playlist-enabled="true"]', { pause: 1100 }).catch(() => {});
          await closeDialogs(d);
          await d.wait(1000);
        },
      },
    ],
  },

  {
    id: "09_atmosphere_194_shaders",
    chapter: "194 ATMOSPHERIC SHADERS",
    title: "194 Real-Time Atmospheric Shaders, 6-Layer Mixer & Reactive Physics",
    blurb: "Combine up to 6 procedural shaders simultaneously and modulate them by typing speed, CPU load, or audio beat",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🌪️ 194 Shaders, 6-Layer Mixer & 48 Signature Mixes — Shown Unobstructed",
        say: "In Atmosphere FX, choose from one hundred and ninety-four procedural shaders across ten categories—including E F 5 Debris Tornadoes, 4D Hypercubes, Tesla Megacoils, and Liquid Glass Caustics—or combine up to six layers at once with forty-eight Signature Mixes and Reactive Physics Modulation. Watch as we apply a multi-layer mix and close the window so you can see the full shader canvas unobstructed!",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1100 });
          await d.click(".theme-tools button >> Atmosphere FX", { pause: 1400 });
          await d.waitFor(".fm-atmo-card", 6000);
          await d.click('.fm-atmo-tier-btn[data-tier="extreme"]', { pause: 1100 });
          await d.click('.fm-atmo-preset-btn[data-mix="tesseract_4d+calabi_yau+chronos_retrocausal"]', { pause: 1600 });
          await d.click('.fm-atmo-preset-btn[data-mix="liquid_glass_caustics+m4_raytrace_prism+aurora"]', { pause: 1600 });
          await d.click('[data-surge-btn="true"]', { pause: 1200 });
          await d.click(".modal-backdrop:last-child .dialog button >> Apply effect", { pause: 1400 });
          await closeDialogs(d);
          await d.hover('#list .row[data-name="shaders"]', 1800).catch(() => {});
        },
      },
    ],
  },

  {
    id: "10_theme_editor_hacker_lab",
    chapter: "THEME EDITOR & HACKER LAB",
    title: "Theme Editor v2, WCAG Contrast Inspector, Theme Hacker Lab & Custom CSS",
    blurb: "Design custom themes with 8K studio backplates, live WCAG contrast checks, Compiz mutators, and custom CSS",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🎨 Theme Editor v2, WCAG Inspector & 🛠️ Theme Hacker Lab",
        say: "In Create or edit a theme, pick a pre-built 8K studio picture, harmonize colors with live W C A G contrast verification, open the Theme Hacker Lab for one-click Compiz Burn and custom C S S snippets, and save your custom theme—then close the dialog to admire your creation unobstructed in Icons View!",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.click(".dialog button >> Create or edit a theme", { pause: 1500 });
          await d.waitFor(".dialog input[aria-label='Theme name']", 6000);
          await d.click('[data-prebuilt-picture="pro_display_xdr_nebula"]', { pause: 1200 }).catch(() => {});
          await d.click('[data-fx-preset="liquid_glass"]', { pause: 1200 });
          await d.hover(".theme-contrast-inspector", 1200);
          await d.eval(`(() => {
            const det = document.querySelector('[data-hacker-studio]');
            if (det) { det.open = true; det.scrollIntoView({ behavior: 'instant', block: 'center' }); }
          })()`);
          await d.wait(400);
          await d.click('[data-css-snippet="neon_folders"]', { pause: 1000 }).catch(() => {});
          await d.eval(`(() => { const e = document.querySelector(".dialog input[aria-label='Theme name']"); if (e) { e.value = 'M4 Ultra Nebula Glass'; e.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
          await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="save"]', { pause: 1600 });
          await closeDialogs(d);
          await d.hover('#list .row[data-name="custom_themes"]', 1600).catch(() => {});
        },
      },
    ],
  },

  {
    id: "11_screensaver_zero_dialog_keys",
    chapter: "SCREENSAVER & SHORTCUTS",
    title: "Theme Show Screensaver Studio & Zero-Dialog Keyboard Power-Ups",
    blurb: "Full-bleed Theme Show screensaver and zero-dialog keyboard shortcuts in unobstructed Icons View",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "🎬 Theme Show & Screensaver Studio + Zero-Dialog Keyboard Control",
        say: "Finally, launch the Theme Show and Screensaver Studio for a full-screen visual showcase, or stay in unobstructed Icons View and control all ten engines from the keyboard with zero dialogs: Option M for Director's Cut, Option 9 for 3D folder spin, Option H to cycle all eighteen U S Holiday themes with firework bursts, Option F for CRT filters, Option S for 3D stage tilt, Option C to swap colors while keeping your shaders, Option I to shuffle icon packs, and Option Z to undo!",
        act: async (d) => {
          await closeDialogs(d);
          await showKeys(d, ["⌥", "M"]);
          await d.eval(`window.cycleAppAaaDirectorCut?.(1)`);
          await d.wait(1100);
          await showKeys(d, ["⌥", "9"]);
          await d.eval(`window.cycleAppHighEndAnimation?.(1)`);
          await d.wait(1100);
          await showKeys(d, ["⌥", "H"]);
          await d.eval(`window.cycleAppHolidayTheme?.(1)`);
          await d.wait(1200);
          await showKeys(d, ["⌥", "C"]);
          await d.eval(`window.cycleAppColorKeepFx?.(1)`);
          await d.wait(1000);
          await showKeys(d, ["⌥", "I"]);
          await d.eval(`window.shuffleAppIconPack?.()`);
          await d.wait(1000);
          await showKeys(d, ["⌥", "Z"]);
          await d.eval(`import('/ui/themes.js').then((m) => m.undoThemeHistory?.())`).catch(() => {});
          await d.wait(1000);
          await showThemeUnobstructed(
            d,
            "holiday_halloween_jack_o_lantern",
            "🎃 Halloween Carved Jack-O'-Lantern & Witching Hour",
            "Complete Themes Masterclass · Unobstructed 6K XDR Icons View",
            { anim: "folder_3d_spin_turntable", holidayBurst: true, hoverRow: "custom_themes", waitMs: 1800 },
          );
          await clearUnobstructedBanner(d);
        },
      },
    ],
  },

  {
    id: "12_outro",
    chapter: "MASTERCLASS COMPLETE",
    title: "Thank You — Download All 20 Custom Themes & Style Guide on GitHub",
    kind: "card",
    card: {
      kicker: "Free & Open Source · Recorded on Apple Mac Studio M4 Ultra · Pro Display XDR 6K 120Hz",
      title: "Thank You for Watching the Complete Themes Masterclass",
      lines: [
        "📦 Custom Themes Vault (Low / Medium / High / Ultra): custom_themes/README.md",
        "📐 Professional Theme Design Style Guide: custom_themes/THEME_DESIGN_STYLE_GUIDE.md",
        "🍎 Apple Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K 120Hz",
      ],
    },
    steps: [
      {
        cap: "Thank You for Watching the Complete Codecaine Themes Masterclass",
        say: "And that completes our full, step-by-step masterclass on the Codecaine File Manager Theme and Atmospheric Shader Studio. Every custom theme for Low, Medium, High, and Ultra systems, all eighteen U S Holiday Ultra themes, the Polar Night and Halloween collections, all forty-one unobstructed Icons View screenshots, the Google Gemini L L M prompt, and our Professional Theme Design Style Guide are waiting for you in the custom themes folder on GitHub. Thank you so much for watching!",
      },
    ],
  },
];

function notesText(marks: Array<{ at: number; title: string }>, total: number): string {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const chaptersText = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  return `# Codecaine File Manager — Complete Themes & Shaders Masterclass (${fmtTime(total)})

## Reference & Hardware Workstation Mark
- **Workstation Hardware Mark:** \`${RIG_MARK}\`
- **Custom Themes Vault:** [\`custom_themes/README.md\`](../custom_themes/README.md)
- **Professional Theme Design Style Guide:** [\`custom_themes/THEME_DESIGN_STYLE_GUIDE.md\`](../custom_themes/THEME_DESIGN_STYLE_GUIDE.md)
- **Written Companion Guide:** [\`docs/userguides/file-manager-themes-complete-tutorial.md\`](../docs/userguides/file-manager-themes-complete-tutorial.md)

## YouTube Title (92 chars — under YouTube's 100-char limit, copy and paste)
\`\`\`text
Codecaine File Manager Themes Masterclass (M4 Ultra 6K): 310 Themes, 194 Shaders & Gemini AI
\`\`\`

## YouTube Description (copy and paste)
\`\`\`text
The complete, step-by-step MacAcademy-style masterclass dedicated 100% to the Codecaine File Manager Theme & Atmospheric Shader Studio — recorded and marked on our flagship Apple Mac Studio M4 Ultra (32-Core CPU · 80-Core GPU · 192GB Unified Memory · Apple Pro Display XDR 6K @ 120Hz ProMotion).

To make sure you can see every theme in complete detail without a large dialog window blocking your view, we switch the File Manager to Icons View (#list.view-icons) and close the theme modal whenever showcasing themes—revealing every 3D folder shader, bobbing holiday corner crest (🎃 🎄 🎆 🦃 ☘️), hanging cryo icicle, and 120Hz 3D icon animation across the full canvas!

⬇️ Download Codecaine File Manager (free & open source): ${REPO}/releases/latest
🎨 Custom Themes Vault (Low / Medium / High / Ultra + 41 Screenshots): ${REPO}/tree/main/custom_themes
📐 Professional Theme Design Style Guide: ${REPO}/blob/main/custom_themes/THEME_DESIGN_STYLE_GUIDE.md
📘 Complete Written Companion Manual: ${REPO}/blob/main/docs/userguides/file-manager-themes-complete-tutorial.md
⭐ Source Code: ${REPO}

RECORDING WORKSTATION
🍎 Apple Mac Studio (M4 Ultra · Mac16,14)
⚡ 32-Core CPU · 80-Core Hardware-Ray-Traced GPU · 32-Core Neural Engine
🧠 192 GB Unified LPDDR5X-8533 Memory (819 GB/s Unified Fabric)
🖥️ Apple Pro Display XDR 6K (6016×3384) @ 120Hz ProMotion · Display-P3 1600-nit HDR

WHAT YOU WILL MASTER IN THIS 12-CHAPTER COURSE
🎃 Chapter 01 — Unobstructed Icons View: Halloween Carved Jack-O'-Lantern Ultra, Nosferatu Blood-Moon Crypt, Polar Night, Sub-Zero Cryo-Glacier, Polar Aurora Borealis 6K Ultra, and Polar Daylight Glacier 6K Ultra.
🎆 Chapter 02 — All 18 US Holiday Celebration Ultra Themes: New Year's Eve Champagne, MLK Jr. Sunrise Dream, Valentine's Velvet Rose, Presidents' Day Brass, St. Patrick's Emerald Clover, Easter Pastel Bloom, Mother's Day Botanical, Memorial Day Poppy, Juneteenth Starburst, Father's Day Chronograph, Fourth of July Fireworks, Labor Day Steel Forge, Indigenous Star-Compass, Halloween Jack-O'-Lantern, Veterans Day Valor Medal, Thanksgiving Harvest Cornucopia, Hanukkah Menorah, and Christmas Nutcracker Hearth.
🌀 Chapter 03 — 14 Hardware-Accelerated 120Hz 3D Icon Animations (Turntable Spin, Origami Fold, 6-DOF Gyro Cube, 2Advanced Flash-3000 Orbital, C4D MoGraph Extrude, Magnetic Neon Levitate, Jelly 3D Squish) & Visceral 3D Folder Shaders (Inferno Fire Folders, Toxic Bio-Slime, EF5 Debris Tornado, Haight-Ashbury Tie-Dye '67, Omega Point Singularity).
👑 Chapter 04 — 20 Master Designer Custom Themes Across All 4 System Tiers:
  • 🟢 Tier 1 Low (0% GPU Featherweight: E-Ink Paper, OLED Pitch-Black, Halloween Pumpkin Lite, Polar Ice Lite)
  • 🟡 Tier 2 Medium (Balanced 60fps: Cupertino Sequoia, Polar Nordic Frost, Autumn Halloween Lantern, Kyoto Matcha)
  • 🟠 Tier 3 High-Spec (60–120Hz: Tahoe Liquid Glass Pro, Polar Glacier Sub-Zero, Cyberdeck Matrix HUD, Sovereign 24K Gold)
  • 🔴 Tier 4 Ultra (120Hz 6K XDR: All Hallows Eve 6K, Polar Aurora Borealis 6K, Polar Daylight Glacier 6K, M4 Ultra Liquid Titanium, Crimson Blood-Moon Crypt, Compiz Hellfire Forge, Bio-Hazard Dalí Screen-Melt, Omega Pantheon 3099)
📦 Chapter 05 — Single Custom Theme Import (JSON / CCFM-THEME-v1 / ⌘V Paste) & Bulk Folder Import (📁 Load Current Folder Themes) with automatic Conflict Resolution (Replace, Keep Both, Merge FX, Skip).
🤖 Chapter 06 — Built-in Google Gemini AI Theme Customizer, Master LLM Prompt Studio, and the Professional Theme Design Style Guide.
⚡ Chapter 07 — Theme Gallery Filters, Mac/Windows/Linux Optimizers, Winamp VFD Telemetry Deck & One-Click Jumpstart Kits.
⚖️ Chapter 08 — Side-by-Side Split-Screen Wipe Comparator, Live OKLab Perceptual Theme Blender, 4-Stage Solar Cycle & Ambient Playlist.
🌪️ Chapter 09 — 194 Real-Time Atmospheric Shaders, 6-Layer Multi-Effect Mixer, 48 Signature Mixes & Reactive Physics Modulation.
🎨 Chapter 10 — Theme Editor v2, 8K Studio Backplates, Live WCAG Contrast Inspector, Theme Hacker Lab & Custom CSS Snippets.
🎬 Chapter 11 — Theme Show & Screensaver Studio + Zero-Dialog Keyboard Shortcuts (⌥M, ⌥9, ⌥H, ⌥F, ⌥S, ⌥C, ⌥I, ⌥R, ⌥U, ⌥P, ⌥Z).

CHAPTERS
${chaptersText}

#FileManager #Themes #MacStudio #M4Ultra #GoogleGemini #UIUX #Shaders #OpenSource #BunJS #Tutorial
\`\`\`

## YouTube Tags (copy and paste — comma-separated, under 500 chars)
\`\`\`text
Codecaine File Manager, File Manager Themes Tutorial, Complete Theme Masterclass, Mac Studio M4 Ultra, Pro Display XDR 6K 120Hz, Unobstructed Icons View, Halloween Theme, Polar Night Theme, All 18 US Holiday Themes, Custom Themes GitHub, Google Gemini AI Theme, 3D Folder Icons, 2Advanced Flash HUD, Compiz Fire Folders, OKLab Blender, 194 Shaders, Theme Style Guide, Bun RAD Studio
\`\`\`
`;
}

const suite: Suite = {
  name: "file_manager_themes_full",
  chapters,
  seedWorld,
  open: (ch, world) => env.open(ch, world),
  start: () => env.start(),
  stop: () => env.stop(),
  cdp: () => env.c,
  notes: notesText,
  rate: RATE,
  gap: GAP,
  viewHeight: VIEW_H,
  rigMark: RIG_MARK,
};

await runTutorial(suite, process.argv.slice(2));
process.exit(0);
