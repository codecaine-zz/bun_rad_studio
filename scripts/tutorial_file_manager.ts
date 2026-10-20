#!/usr/bin/env bun
/**
 * The Codecaine File Manager, explained slowly and completely: the basics, the terminal and the file list working together,
 * every tool, themes, and the SQLite and MySQL studios (joined from their own tutorials). A calm, step-by-step tutorial in
 * the style of the old "show every click" training videos.
 *
 *   bun scripts/tutorial_file_manager.ts list                  the chapters
 *   bun scripts/tutorial_file_manager.ts audio [--shard i/n]   write (or reuse) the narration for every step
 *   bun scripts/tutorial_file_manager.ts record [ids,...]      record the chapters (each starts from a fresh, throwaway world)
 *   bun scripts/tutorial_file_manager.ts build                 assemble youtube_production/file_manager_tutorial.mp4 and its notes
 *   bun scripts/tutorial_file_manager.ts all                   audio, record, build
 *
 * The engine is scripts/lib/step_video.ts (shared with the designer tutorial). Everything happens in /tmp with sample
 * files; no real file, setting or password is shown or changed.
 */
import "./lib/tts_edge_default";
import { mkdirSync, rmSync, truncateSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { seedDemoWorkspace } from "./lib/demo_workspace";
import { EDGE_VOICE, FFMPEG, fmtTime, sh } from "./lib/video_pipeline";
import { runTutorial, type Suite, type Do } from "./lib/step_video";
import { FM_HOME, chapters, type Chapter, type World } from "./lib/fm_tutorial_script";
import {
  MASTER_CUSTOM_THEMES,
  getMasterCustomThemeExports,
  getMasterCustomThemesPackJson,
  getMasterCustomThemesPackShareCode,
} from "../src/features/filemanager/fmMasterCustomThemes";

export type { Do };
const ROOT = process.cwd();
const RATE = "+3%";
const GAP = 0.45;
const VIEW_H = 972;
const ROOT_DIR = "/tmp/fmv";
const HOME = FM_HOME;
const DATA = `${ROOT_DIR}/data`;
const GRAVE = `${ROOT_DIR}/grave`;
const ZDOT = `${ROOT_DIR}/zdot`;
const FM_PORT = 51666;
const CDP_PORT = 9344;

function seedWorld(): World {
  rmSync(ROOT_DIR, { recursive: true, force: true });
  mkdirSync(ROOT_DIR, { recursive: true });
  seedDemoWorkspace(HOME, join(ROOT_DIR, "frames"));
  const put = (rel: string, body: string) => { const p = join(HOME, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, body); };

  // Eight holiday photos (a different color each), so thumbnails, sorting and bulk rename have something to show.
  mkdirSync(join(HOME, "Documents", "Trip"), { recursive: true });
  for (let i = 1; i <= 8; i++) {
    sh([FFMPEG, "-y", "-f", "lavfi", "-i", `testsrc2=size=1280x800:rate=1`, "-frames:v", "1", "-vf", `hue=h=${i * 40},drawtext=text='Photo ${i}':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2`, join(HOME, "Documents", "Trip", `IMG_${String(i).padStart(4, "0")}.jpg`)], { quiet: true });
  }
  // A picture, a song and a short video for Convert, the Image and Media Studios and Recent.
  const media = join(HOME, "Media");
  mkdirSync(media, { recursive: true });
  sh([FFMPEG, "-y", "-f", "lavfi", "-i", "gradients=s=1600x1000:c0=0xff7e5f:c1=0xfeb47b:c2=0x6a3093:n=3:type=radial:x0=800:y0=700:x1=1600:y1=0", "-frames:v", "1", "-vf", "drawtext=text='Golden hour':fontsize=120:fontcolor=white@0.9:x=(w-text_w)/2:y=h*0.72", join(media, "sunset.jpg")], { quiet: true });
  sh([FFMPEG, "-y", "-f", "lavfi", "-i", "aevalsrc=0.16*sin(2*PI*220*t)*(1+0.3*sin(2*PI*0.5*t))+0.1*sin(2*PI*277.2*t)+0.08*sin(2*PI*329.6*t):d=24", "-af", "afade=t=in:d=1,afade=t=out:st=22:d=2", "-c:a", "libmp3lame", "-b:a", "160k", join(media, "morning-song.mp3")], { quiet: true });
  sh([FFMPEG, "-y", "-f", "lavfi", "-i", "mandelbrot=size=1280x720:rate=25", "-f", "lavfi", "-i", "aevalsrc=0.15*sin(2*PI*220*t)*(1+0.3*sin(2*PI*0.5*t))+0.1*sin(2*PI*330*t):d=12", "-t", "12", "-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(media, "city-clip.mp4")], { quiet: true });
  put("Documents/Trip/itinerary.txt", "Day 1  Arrive, check in\nDay 2  Old town walking tour\nDay 3  Boat trip\nDay 4  Fly home\n");
  put("Documents/Trip/packing-list.md", "# Packing list\n\n- Passport\n- Charger\n- Camera\n- Sunscreen\n");
  // A file that already exists in the Backup folder with different contents: the same-name conflict example.
  put("Desktop/Backup/budget.csv", "month,income,expenses\nJan,1,1\n");
  // A big file for a copy long enough to watch (sparse: it costs no disk space until it is copied; the tutorial cancels the copy within seconds).
  mkdirSync(join(HOME, "Downloads"), { recursive: true });
  const big = join(HOME, "Downloads", "holiday-video.mov");
  writeFileSync(big, "");
  truncateSync(big, 12 * 1024 * 1024 * 1024);
  mkdirSync(join(HOME, "Desktop", "Archive"), { recursive: true });
  mkdirSync(join(HOME, "Desktop", "Copies"), { recursive: true });
  // Seed custom_themes folder (in both HOME and Projects/shop-app) with single & bulk custom theme files across Low/Medium/High/Ultra tiers
  const customExports = getMasterCustomThemeExports();
  for (const baseDir of [join(HOME, "custom_themes"), join(HOME, "Projects", "shop-app", "custom_themes")]) {
    mkdirSync(baseDir, { recursive: true });
    for (const item of customExports) {
      writeFileSync(join(baseDir, `${item.slug}.json`), JSON.stringify(item.jsonPayload, null, 2) + "\n");
    }
    writeFileSync(join(baseDir, "master_all_systems_20_themes_pack.json"), JSON.stringify(getMasterCustomThemesPackJson(), null, 2) + "\n");
    writeFileSync(join(baseDir, "master_all_systems_20_themes_pack.ccfm.txt"), getMasterCustomThemesPackShareCode() + "\n");
    writeFileSync(join(baseDir, "pack_tier_1_low_featherweight.json"), JSON.stringify(getMasterCustomThemesPackJson("low"), null, 2) + "\n");
    writeFileSync(join(baseDir, "pack_tier_2_medium_balanced_60fps.json"), JSON.stringify(getMasterCustomThemesPackJson("medium"), null, 2) + "\n");
    writeFileSync(join(baseDir, "pack_tier_3_high_spec_120hz.json"), JSON.stringify(getMasterCustomThemesPackJson("high"), null, 2) + "\n");
    writeFileSync(join(baseDir, "pack_tier_4_ultra_6k_xdr_120hz.json"), JSON.stringify(getMasterCustomThemesPackJson("ultra"), null, 2) + "\n");
  }
  // The terminal's shell reads this instead of the real ~/.zshrc: a short, clean prompt and no history written anywhere real.
  mkdirSync(ZDOT, { recursive: true });
  writeFileSync(join(ZDOT, ".zshrc"), `HISTFILE=${ZDOT}/.history\nPROMPT='%F{blue}%1~%f %F{magenta}❯%f '\nRPROMPT=''\n`);
  mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, "file_manager_themes.json"), JSON.stringify({
    version: 1,
    themes: MASTER_CUSTOM_THEMES,
  }, null, 2));
  writeFileSync(join(DATA, "file_manager.json"), JSON.stringify({
    theme: "dark",
    palette: "holiday_halloween_jack_o_lantern",
    preferredLightPalette: "orbital_ice",
    preferredDarkPalette: "holiday_halloween_jack_o_lantern",
    atmosphereTier: "ultra",
    themeIconAnimation: "folder_3d_spin_turntable",
    favoriteThemes: [
      "holiday_halloween_jack_o_lantern",
      "polar_night",
      "mac_studio_m4_ultra",
      "custom_0000000d",
      "custom_0000000e",
      "holiday_christmas_nutcracker_hearth",
      "holiday_fourth_of_july_fireworks",
      "holiday_thanksgiving_harvest_hearth",
    ],
    seenWelcome: false,
  }, null, 2));
  return { home: HOME, data: DATA, put, big };
}

/**
 * Curated 100% Ultra-Tier (`tier: "ultra"`) theme + 120Hz 3D icon animation rotation across every chapter
 * on our Apple Mac Studio M4 Ultra (32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K @ 120Hz):
 * - Starts on `holiday_halloween_jack_o_lantern` for Halloween month!
 * - Features `polar_night` (`Polar Night` Ultra) and `cryo_icicle_blizzard`
 * - Showcases all 18 US Holiday Celebration Ultra themes (`holiday_*`) and our Master Designer Ultra Custom Themes!
 */
const CHAPTER_ULTRA_THEME_MAP: Record<string, { palette: string; anim: string }> = {
  "01_window":                              { palette: "holiday_halloween_jack_o_lantern",    anim: "folder_3d_spin_turntable" },
  "02_moving":                              { palette: "polar_night",                         anim: "raytraced_caustic_refraction" },
  "03_views":                               { palette: "mac_studio_m4_ultra",                 anim: "m4_liquid_metal_morph" },
  "04_select_create":                       { palette: "holiday_christmas_nutcracker_hearth", anim: "godmode_pantheon_ascend" },
  "04b_tabs_tree_tags":                     { palette: "custom_0000000e",                     anim: "raytraced_caustic_refraction" },
  "04c_quickbar_palette_templates_extract": { palette: "holiday_fourth_of_july_fireworks",    anim: "houdini_vex_particle_burst" },
  "05_copy":                                { palette: "holiday_thanksgiving_harvest_hearth", anim: "fire_ember_flicker" },
  "06_queue":                               { palette: "cryo_icicle_blizzard",                anim: "raytraced_caustic_refraction" },
  "07_move":                                { palette: "holiday_new_years_times_square",      anim: "raytraced_caustic_refraction" },
  "08_delete":                              { palette: "horror_nosferatu_blood_moon",         anim: "folder_3d_flip_origami" },
  "09_quicklook":                           { palette: "holiday_valentines_velvet_rose",      anim: "heartbeat_biolum" },
  "09b_perms_info_lock":                    { palette: "holiday_st_patricks_emerald_clover",  anim: "holo_foil_shimmer" },
  "10_convert":                             { palette: "holiday_dia_de_los_muertos_marigold", anim: "blender_geometry_nodes_bloom" },
  "11_find":                                { palette: "holiday_mlk_dream_memorial",          anim: "orbital_halo_spin" },
  "12_review":                              { palette: "holiday_presidents_mount_rushmore",   anim: "c4d_mograph_cloner_wave" },
  "13_compare":                             { palette: "custom_0000000f",                     anim: "folder_3d_spin_turntable" },
  "14_projects":                            { palette: "holiday_easter_pastel_egg_hunt",      anim: "spring_pop_3d" },
  "15_actions":                             { palette: "holiday_mothers_day_botanical_tea",   anim: "blender_geometry_nodes_bloom" },
  "16_qr":                                  { palette: "holiday_memorial_day_poppy_honor",    anim: "orbital_halo_spin" },
  "17_code":                                { palette: "custom_00000010",                     anim: "m4_liquid_metal_morph" },
  "18_terminal":                            { palette: "flash_2advanced_v3_studio",           anim: "flash_2advanced_vector_hud" },
  "19_dev":                                 { palette: "holiday_juneteenth_jubilee_star",     anim: "houdini_vex_particle_burst" },
  "20_automate":                            { palette: "holiday_fathers_day_leather_den",     anim: "clockwork_gear_tick" },
  "21_toolbox":                             { palette: "holiday_labor_day_rivet_forge",       anim: "fire_ember_flicker" },
  "21a_home_split_clock_cli":               { palette: "holiday_veterans_day_valor_medallion",anim: "c4d_mograph_cloner_wave" },
  "21aa_tasks_sysinfo":                     { palette: "holiday_hanukkah_menorah_sapphire",   anim: "raytraced_caustic_refraction" },
  "21b_convert_more":                       { palette: "custom_00000011",                     anim: "folder_3d_flip_origami" },
  "21c_image_studio":                       { palette: "c4d_mograph_studio",                  anim: "c4d_mograph_cloner_wave" },
  "21d_media_studio":                       { palette: "custom_00000012",                     anim: "fire_ember_flicker" },
  "21e_presets_bulk":                       { palette: "ef5_debris_tornado",                  anim: "gyro_3d_cube_matrix" },
  "21f_recent":                             { palette: "custom_00000013",                     anim: "liquid_jelly_morph" },
  "21g_player_paint_games":                 { palette: "custom_00000014",                     anim: "godmode_pantheon_ascend" },
  "22_themes":                              { palette: "holiday_halloween_jack_o_lantern",    anim: "folder_3d_spin_turntable" },
  "23_databases":                           { palette: "custom_0000000d",                     anim: "folder_3d_spin_turntable" },
};

class Env {
  c!: Cdp;
  fm: ReturnType<typeof Bun.spawn> | null = null;

  async start() { this.c = await Cdp.launch(CDP_PORT, "/tmp/fmv_chrome", 1920, VIEW_H); }
  stopServer() { try { this.fm?.kill(9); } catch {} this.fm = null; }
  stop() { this.stopServer(); this.c.close(); }

  /** A new throwaway world and a fresh File Manager server, opened on `path`. */
  async open(ch: Chapter, world: World) {
    this.stopServer();
    await sleep(500);
    const themeSpec = CHAPTER_ULTRA_THEME_MAP[ch.id] ?? { palette: "holiday_halloween_jack_o_lantern", anim: "folder_3d_spin_turntable" };
    writeFileSync(join(DATA, "file_manager.json"), JSON.stringify({
      theme: "dark",
      palette: themeSpec.palette,
      preferredLightPalette: "orbital_ice",
      preferredDarkPalette: "holiday_halloween_jack_o_lantern",
      atmosphereTier: "ultra",
      themeIconAnimation: themeSpec.anim,
      favoriteThemes: [
        "holiday_halloween_jack_o_lantern",
        "polar_night",
        "mac_studio_m4_ultra",
        "custom_0000000d",
        "custom_0000000e",
        "holiday_christmas_nutcracker_hearth",
        "holiday_fourth_of_july_fireworks",
        "holiday_thanksgiving_harvest_hearth",
      ],
      seenWelcome: !ch.welcome,
    }, null, 2));
    const path = ch.path ?? `${HOME}/Projects/shop-app`;
    this.fm = Bun.spawn([process.execPath, join(ROOT, "applications", "file_manager_studio.ts"), "--server", "--port", String(FM_PORT), "--home", HOME, "--data-dir", DATA, "--path", path],
      { cwd: "/tmp", stdout: "ignore", stderr: "ignore", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GRAVEYARD: GRAVE, SHELL: "/bin/zsh", ZDOTDIR: ZDOT, FM_SHOWCASE_MAC_ULTRA: "1" } });
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${FM_PORT}/`)).ok) break; } catch {} await sleep(250); }
    await this.c.goto(`http://127.0.0.1:${FM_PORT}/`);
    if (!ch.welcome) {
      await this.c.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')?.click()`);
      await sleep(600);
    }
    if (ch.view) await this.c.eval(`document.querySelector(${JSON.stringify(ch.view)})?.click()`);
    if (ch.view) await sleep(600);
    void world;
  }
}

function notesText(marks: Array<{ at: number; title: string }>, total: number): string {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const chaptersText = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  return `# Codecaine File Manager: the complete, step-by-step MacAcademy-style guide (${fmtTime(total)})

## Reference & Hardware Workstation Mark

- **Tutorial Style:** Calm, methodical, unhurried "show every click" walkthrough inspired by the classic 1989 MacAcademy training series
- **Workstation Hardware Mark:** \`🍎 Apple Mac Studio M4 Ultra · 32-Core CPU (24P + 8E) · 80-Core GPU · 32-Core Neural Engine · 192GB Unified Memory (819 GB/s LPDDR5X) · Apple Pro Display XDR 6K (6016×3384) @ 120Hz ProMotion · Display-P3 1600-nit HDR\`

## YouTube title (92 chars — under YouTube's 100-char limit)

Codecaine File Manager Full Tutorial (Mac Studio M4 Ultra 6K): Every Tool, Theme & DB Studio

## YouTube description (copy and paste — strictly under 5,000 chars with all 72 chapter timestamps)

\`\`\`text
The complete, step-by-step MacAcademy-style guide to the Codecaine File Manager — recorded on an Apple Mac Studio M4 Ultra (32-Core CPU · 80-Core GPU · 192GB Unified Memory · Apple Pro Display XDR 6K @ 120Hz ProMotion). Free & open-source for macOS, Windows, and Linux.

⬇️ Download (free): ${REPO}/releases/latest
🎨 Custom Themes Vault (Low/Med/High/Ultra + 41 Screenshots): ${REPO}/tree/main/custom_themes
📐 Theme Design Style Guide: ${REPO}/blob/main/custom_themes/THEME_DESIGN_STYLE_GUIDE.md
⭐ Source Code: ${REPO}

HIGHLIGHTS
• 🎃 Unobstructed Icons View (#list.view-icons) showcase: Halloween Ultra intro, Polar Night & Cryo-Glacier, all 18 US Holiday Celebration Ultra themes (⌥H), 120Hz 3D spinning folders (⌥9), 20 Master Custom Themes across Low/Medium/High/Ultra tiers, Single & Bulk Folder Import (📁 Load Current Folder Themes), and 🤖 Google Gemini AI Theme Customizer
• 📁 8 Views (⌥1–⌥8), Tabs, Folder Tree, Color Tags, Quick-Filter Bar (⌘⌥F), Command Palette (⌘⇧P), 12 Starter Templates (⌘⌥K), Archive Extract (⌘⇧E), Recycle Bin, Undo, Quick Look, Disguised-File Sniffing, Open With & AES-256-GCM Encryption
• ⌨️ Two-way synced Terminal + Code Editor IDE (70+ conversions, Outline, Git, History, TODOs, Split & Live Preview), Folder & Data Compare, Find & Bulk Rename, Image/Media/Paint Studios, AmpDeck (10-band EQ & 108 visualizers), 24 Arcade Games, and SQLite, MySQL, PostgreSQL & Redis Studios

CHAPTERS
${chaptersText}

#FileManager #MacStudio #M4Ultra #OpenSource #Tutorial #Themes #GoogleGemini #SQLite #MySQL #PostgreSQL #Redis #BunJS
\`\`\`

## YouTube tags (copy and paste — comma-separated, under 500 chars)

\`\`\`text
Codecaine File Manager, File Manager Tutorial, MacAcademy Tutorial, Mac Studio M4 Ultra, Pro Display XDR 6K 120Hz, Open Source File Manager, Dual Pane File Manager, File Manager Themes, Unobstructed Icons View, Halloween Theme, Polar Night Theme, US Holiday Themes, Custom Themes GitHub, Google Gemini AI Theme, 3D Folder Icons, SQLite Studio, MySQL Studio, PostgreSQL Studio, Redis Studio, Bun RAD Studio
\`\`\`

## Notes

- Recorded from the real program in headless Chrome with a visible cursor; nothing is faked. Each chapter starts from a fresh throwaway world in /tmp, so no real file or setting appears. The terminal uses a throwaway shell profile.
- Every chapter card and caption strip is marked with \`🍎 Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K 120Hz\`.
- The Databases Masterclass, SQLite, and MySQL chapters are the recorded chapters of \`databases_masterclass_tutorial\`, \`sqlite_studio_tutorial\`, and \`mysql_studio_tutorial\`, joined in without their own intro and outro.
- The desktop-only keys (Right Option + ] / [ / /, Command+Q) are shown on screen; the theme change is the real one.
- The picture is 1920x972 above its own caption strip, so the captions never cover the program.
- Narration: Edge neural voice (${EDGE_VOICE}, female) at ${RATE} speed with ${GAP}s between sentences, cleaned up with a gentle compressor and loudness normalized to -16 LUFS.
- Rebuild: \`bun scripts/tutorial_file_manager.ts all\` (needs Google Chrome, ffmpeg-full from Homebrew and the internet for the voice). Re-record one chapter: \`... record 18_terminal\` then \`... build\`.
`;
}

const env = new Env();
const suite: Suite = {
  name: "file_manager",
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
  rigMark: "🍎 Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K 120Hz",
};

await runTutorial(suite, process.argv.slice(2));
process.exit(0);
