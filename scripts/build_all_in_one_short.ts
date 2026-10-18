#!/usr/bin/env bun
/**
 * Builds the Codecaine File Manager All-in-One YouTube Short (1080x1920 vertical, ~2:56 / <3 minutes)
 * covering every major capability in Codecaine File Manager and pointing viewers to the
 * full 2h 11m All-in-One Master Tutorial (`youtube_production/all_in_one_tutorial.mp4`).
 *
 * Outputs:
 *   - youtube_production/codecaine-file-manager-all-in-one-short.mp4
 *   - youtube_production/ALL_IN_ONE_SHORT_NOTES.md
 *   - youtube_production/all_in_one_short/upload-guide.txt
 *
 * Usage:
 *   bun scripts/build_all_in_one_short.ts
 */
import "./lib/tts_edge_default";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp } from "./lib/cdp_recorder";
import { EDGE_VOICE, FFMPEG, FFPROBE, narrate } from "./lib/video_pipeline";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const WORK = join(PROD, "all_in_one_short");
const OUTPUT = join(PROD, "codecaine-file-manager-all-in-one-short.mp4");
const NOTES = join(PROD, "ALL_IN_ONE_SHORT_NOTES.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";

type Scene = {
  id: string;
  badge: string;
  title: string;
  label: string;
  extra: string;
  bullets: string[];
  say: string;
  file: string;
  suite?: string;
  start: number;
  length: number;
};

const scenes: Scene[] = [
  {
    id: "01_hook",
    badge: "01 / 19 · CROSS-PLATFORM WORKSTATION",
    title: "THIS IS A\nFILE MANAGER?!",
    label: "WINDOWS · macOS · LINUX · x64 & ARM64",
    extra: "Free & Open-Source · 100% Local · PowerShell + WSL on Windows",
    bullets: ["Zero Telemetry", "Instant Startup on Bun", "Full Keyboard Navigation"],
    say: "Meet the Codecaine File Manager. Free, open source, and built for Windows, macOS, and Linux, on Intel, A M D, and ARM.",
    file: "18_terminal",
    start: 0.2,
    length: 10,
  },
  {
    id: "02_tabs_tree_tags",
    badge: "02 / 19 · NAVIGATION & ORGANIZATION",
    title: "TABS, TREES\n& COLOR TAGS.",
    label: "FOLDER TABS · SIDEBAR TREE · COLOR TAGS",
    extra: "Multi-Tab Browsing · Expandable Folder Tree · Group by Kind",
    bullets: ["Breadcrumbs & Favorites", "Sidebar Folder Tree", "Color Tag Filters & Grouping"],
    say: "Open multiple folder tabs, expand the sidebar folder tree, tag files with colors, and group by file kind.",
    file: "04b_tabs_tree_tags",
    start: 0.5,
    length: 24,
  },
  {
    id: "03_dual_safety",
    badge: "03 / 19 · DUAL-PANE & ZERO DATA LOSS",
    title: "DUAL PANES.\nSAFE BY DEFAULT.",
    label: "DUAL PANE · F5 COPY · F6 MOVE · RECYCLE BIN",
    extra: "Live Progress · Collision Protection · Safe Restore & Undo",
    bullets: ["Side-by-Side Dual Pane", "F5 Copy / F6 Move", "Recycle Bin & Rip Graveyard"],
    say: "Work across two folders side by side with F5 copy and F6 move. And if you delete something, restore it from the Recycle Bin.",
    file: "07_move",
    start: 39,
    length: 24,
  },
  {
    id: "04_quicklook",
    badge: "04 / 19 · SPACEBAR QUICK LOOK",
    title: "PRESS SPACE.\nINSTANT PREVIEW.",
    label: "PHOTOS · PDF · DOCX · XLSX · ARCHIVES · CODE",
    extra: "Flip Through Folders With Arrow Keys · Copy Image or Text Instantly",
    bullets: ["Instant Spacebar Preview", "Arrow Keys Flip Files", "Zero External Apps Needed"],
    say: "Press Space to preview photos, documents, spreadsheets, and archives right in place, and use the arrow keys to flip through the folder.",
    file: "09_quicklook",
    start: 0.5,
    length: 24,
  },
  {
    id: "05_perms_lock",
    badge: "05 / 19 · METADATA, PERMISSIONS & LOCK",
    title: "VISUAL CHMOD &\nAES-256 LOCK.",
    label: "DEEP FILE INFO · OCTAL PERMISSIONS · .radenc LOCK",
    extra: "SHA-256 Fingerprints · Color Palettes · Password File Encryption",
    bullets: ["Dominant Color & Hashes", "Owner / Group / Others Grid", "AES-256-GCM File Encryption"],
    say: "Inspect file hashes and color palettes, edit Unix permissions visually, or lock sensitive files with A E S 256 password encryption.",
    file: "09b_perms_info_lock",
    start: 44,
    length: 20,
  },
  {
    id: "06_find_rename",
    badge: "06 / 19 · DEEP FIND & BULK RENAME",
    title: "FIND MATCHES.\nRENAME IN BULK.",
    label: "FAST SEARCH + LIVE RENAME PREVIEW",
    extra: "Every New Name Checked Before Anything Changes on Disk",
    bullets: ["Wildcard & Content Search", "Batch Rename Rules", "Full Before/After Review"],
    say: "Find matching files across folders, then bulk-rename them with a full before-and-after review before a single file is touched.",
    file: "11_find",
    start: 38.6,
    length: 16,
  },
  {
    id: "07_compare_projects",
    badge: "07 / 19 · COMPARE, PROJECTS & ACTIONS",
    title: "COMPARE FOLDERS\n& SAVE WORKSPACES.",
    label: "TWO-FOLDER DIFF · PROJECTS · ACTION RECIPES",
    extra: "Side-by-Side Folder Sync · Saved Project Tabs · One-Click Recipes",
    bullets: ["5-Group Folder Diff", "Safe Copy Without Deleting", "Saved Projects & Actions"],
    say: "Compare two folders side by side to sync differences safely, and save your favorite workspaces as Projects and reusable Action recipes.",
    file: "13_compare",
    start: 32,
    length: 24,
  },
  {
    id: "08_terminal_sync",
    badge: "08 / 19 · TWO-WAY SYNCED TERMINAL",
    title: "TYPE cd.\nYOUR FILES FOLLOW.",
    label: "SYNCED TERMINAL + QUOTED PATH INSERTION",
    extra: "PowerShell · CMD · Git Bash · WSL · zsh · bash",
    bullets: ["cd Syncs File List", "Open Terminal Here", "One-Click Quoted Paths"],
    say: "In the built-in terminal, type cd and the file list follows automatically. Or select files and insert safely quoted paths in one click.",
    file: "18_terminal",
    start: 54,
    length: 22,
  },
  {
    id: "09_code_dev",
    badge: "09 / 19 · CODE EDITOR & DEV STATION",
    title: "CODE EDITOR,\nGIT & CODE STATS.",
    label: "70+ TEXT TRANSFORMS · MULTI-FILE REPLACE · DEV TAB",
    extra: "Zen Mode · Regex Replace with Undo · Tokei Code Stats · Git · QR",
    bullets: ["Built-in Code Editor & Zen Mode", "Multi-File Replace + Undo", "Tokei Stats, Git & QR Studio"],
    say: "Edit code with seventy text conversions and Zen mode, replace across files with undo, generate Q R codes, and inspect Git and Tokei code stats.",
    file: "19_dev",
    start: 87,
    length: 24,
  },
  {
    id: "10_toolbox_serve",
    badge: "10 / 19 · SERVE, WATCH & POWER TOOLBOX",
    title: "A FULL DEVELOPER\nTOOLBOX INSIDE.",
    label: "LIVE SERVER · CRYPTO · SECRETS VAULT · CLOCKS",
    extra: "Watch Automation · Multi-Connection Downloads · API Studio · CLI Tools",
    bullets: ["Zero-Config Live & PHP Server", "Crypto, Secrets & .env", "World Clocks & CLI Utilities"],
    say: "Spin up a live web server, watch files, manage secrets and hashes, test A P Is, check world clocks, and run built-in C L I tools.",
    file: "21a_home_split_clock_cli",
    start: 21,
    length: 22,
  },
  {
    id: "10b_tasks_sysinfo",
    badge: "11 / 19 · TASKS & SYSTEM TELEMETRY",
    title: "PROCESS MANAGER\n& SYSTEM INFO.",
    label: "PROCESS & TASK MANAGER · HARDWARE TELEMETRY",
    extra: "Live CPU & RAM · TCP Port Bindings · Per-Core Bars · Baseline Diff",
    bullets: ["Live Processes, Tree & Port Map", "Per-Core CPU, GPU, Disks & Net", "Pin & Compare Telemetry Baseline"],
    say: "Monitor live processes, port bindings, and process trees in the Task Manager, and inspect per-core C P U, G P U, disks, and baseline diffs in System Info.",
    file: "21aa_tasks_sysinfo",
    start: 1,
    length: 24,
  },
  {
    id: "11_image_media_studios",
    badge: "12 / 19 · IMAGE & MEDIA STUDIOS",
    title: "EDIT PHOTOS,\nVIDEO & AUDIO.",
    label: "IMAGE STUDIO · MEDIA STUDIO · BATCH PRESETS",
    extra: "Live Sliders · Trim, Speed & Fades · Apply Saved Presets in Bulk",
    bullets: ["Non-Destructive Photo Sliders", "Video Trim, Speed & Audio Fades", "Reusable Batch Presets"],
    say: "Adjust photos in Image Studio, or trim video, change speed, and add fades in Media Studio, then save a preset to process dozens of files at once.",
    file: "21d_media_studio",
    start: 14.3,
    length: 24,
  },
  {
    id: "12_ampdeck_paint_games",
    badge: "13 / 19 · AMPDECK, PAINT & 24 GAMES",
    title: "MEDIA DECK, PAINT\n& 24 ARCADE GAMES.",
    label: "10-BAND EQ · 108 VISUALIZERS · PAINT · 24 GAMES",
    extra: "Synced Lyrics Player · Vector Coloring Book · Retro Arcade Suite",
    bullets: ["AmpDeck Player + Synced Lyrics", "Paint Studio + Coloring Library", "24 Built-in Arcade Games"],
    say: "Play music with a ten-band equalizer, visualizers, and synced lyrics in Media Deck, paint in Paint Studio, or launch twenty-four built-in arcade games.",
    file: "21g_player_paint_games",
    start: 0.5,
    length: 25,
  },
  {
    id: "13_themes_gallery",
    badge: "14 / 19 · 200+ THEMES, COMPARATOR & SOLAR CYCLE",
    title: "200+ THEMES.\nBeOS TO TESLA PLASMA.",
    label: "5-ROW FILTERS · FOLDER PINNING · SPLIT COMPARATOR · SOLAR CYCLE",
    extra: "Tesla Plasma · Tokamak · Hawking · BeOS · OS/2 Warp · Palm OS",
    bullets: ["200+ Themes & 5-Row Filter Pills", "Folder Pinning & Split Comparator", "4-Stage Solar Cycle Schedule"],
    say: "Switch across two hundred themes with five-row filter pills, pin themes to folders, compare two looks side by side, or schedule a four-stage Solar Cycle.",
    file: "22_themes",
    start: 75,
    length: 85,
  },
  {
    id: "14_theme_editor",
    badge: "15 / 19 · 194 LIVE SHADERS & THEME EDITOR v2",
    title: "194 LIVE SHADERS.\n6-LAYER FX MIXER.",
    label: "EF5 TORNADOES · 4D TESSERACT · 6-LAYER MIXER · THEME EDITOR",
    extra: "M4 120Hz Shaders · Reactive Physics · 12 Style Presets · WCAG Contrast",
    bullets: ["194 Shaders (EF5 Tornado, 4D, Tesla)", "6-Layer Mixer & 48 Signature Mixes", "Theme Editor v2 & Custom Shortcuts"],
    say: "Unleash one hundred and ninety-four live shaders with a six-layer mixer, from EF5 Tornadoes to 4D Tesseracts, or design custom Liquid Glass themes.",
    file: "22_themes",
    start: 183,
    length: 103,
  },
  {
    id: "15_databases_clone",
    badge: "16 / 19 · 4 DATABASES & CROSS-ENGINE CLONING",
    title: "4 DATABASE ENGINES.\nCROSS-ENGINE CLONING.",
    label: "SQLite · MySQL · PostgreSQL · Redis",
    extra: "Keychain Security · Clone Tables, Views, Indexes, FKs & Redis Hashes",
    bullets: ["Auto-Detect .env Connections", "Clone SQLite ⇄ Postgres ⇄ MySQL", "Clone SQL Tables ⇄ Redis Hashes"],
    say: "Open the Databases Hub to connect SQLite, MySQL, PostgreSQL, and Redis with keychain security, and clone entire databases or tables across engines and Redis Hashes.",
    suite: "databases_masterclass_tutorial",
    file: "03_clone_sql_to_postgres_and_mysql",
    start: 24.5,
    length: 26,
  },
  {
    id: "16_db_macros_ide",
    badge: "17 / 19 · BUN JS MACROS & STUDIO IDE v2",
    title: "BUN JS MACROS,\nER DIAGRAMS & CODEGEN.",
    label: "DAO / DoCmd MACROS · 15-FORMAT STAGING · STUDIO IDE v2",
    extra: "Visual Query Designer · Full ER Diagram · Schema Diff · 5-Language Codegen",
    bullets: ["Bun JS & Visual Action Macros", "15-Format Staging Import Wizard", "ER Diagram, Diff & Codegen"],
    say: "Automate queries with Bun JavaScript and visual macros, import fifteen file formats with staging validation, and use Studio I D E version two with E R diagrams, schema diff, and code generation.",
    suite: "databases_masterclass_tutorial",
    file: "08_sql_ide_er_diff_codegen",
    start: 24.4,
    length: 26,
  },
  {
    id: "17_simplegui_rad",
    badge: "18 / 19 · SIMPLEGUI TYPESCRIPT RAD",
    title: "BUILD DESKTOP APPS\nIN TYPESCRIPT.",
    label: "SIMPLEGUI API · 45 RAD MODULES · SINGLE BINARY",
    extra: "Reactive State · SweetAlert2 · SQLite Apps · Compile Standalone Executables",
    bullets: ["100+ SimpleGUI Controls", "45 RAD Modules & 10 System Tools", "Compile Single-File Binaries"],
    say: "And because it's part of Bun R A D Studio, you can build your own desktop apps in TypeScript with SimpleGUI and compile them into single-file executables.",
    suite: "rad_tutorial",
    file: "07_capstone",
    start: 40.5,
    length: 24,
  },
  {
    id: "18_all_in_one_cta",
    badge: "19 / 19 · FULL ALL-IN-ONE MASTER TUTORIAL",
    title: "WATCH THE FULL\nALL-IN-ONE COURSE.",
    label: "FILE MANAGER + 4 DATABASES + VISUAL DESIGNER + RAD",
    extra: "2+ Hours · 106 Step-by-Step Chapters · Every Click Shown Live",
    bullets: ["Codecaine File Manager Complete Guide", "All 4 Databases & Cloning Masterclass", "Visual Designer & SimpleGUI RAD Course"],
    say: "Plus the no-code Visual Designer that exports TypeScript, React, Vue, and Python. Watch the complete two-hour All-in-One Master Tutorial with all one hundred and six chapters: tap the related video below my name.",
    suite: "designer_tutorial",
    file: "01_tour",
    start: 20.7,
    length: 18,
  },
];

function run(args: string[]): string {
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`${args[0]} failed:\n${result.stderr.toString().slice(-4000)}`);
  return result.stdout.toString();
}

function duration(file: string): number {
  const value = Number(run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid duration: ${file}`);
  return value;
}

const esc = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const sourceOf = (scene: Scene) => join(PROD, scene.suite ?? "file_manager_tutorial", "live", `${scene.file}.mp4`);

function overlay(scene: Scene, index: number): string {
  const isLast = index === scenes.length - 1;
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{background:radial-gradient(900px 600px at 50% 0%,#1e1b4b,transparent),#090d16;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.top{position:absolute;top:56px;left:44px;right:44px;display:flex;flex-direction:column;gap:14px}
.badge{align-self:flex-start;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-weight:800;font-size:22px;letter-spacing:.1em;padding:8px 18px;border-radius:999px;text-transform:uppercase}
.title{font-size:64px;font-weight:900;line-height:1.04;letter-spacing:-.02em;white-space:pre-line;background:linear-gradient(90deg,#ffffff,#bae6fd 65%,#c084fc);-webkit-background-clip:text;background-clip:text;color:transparent}
.label{color:#38bdf8;font-size:28px;font-weight:800;letter-spacing:.03em;margin-top:4px}
.extra{color:#cbd5e1;font-size:23px;font-weight:600;line-height:1.35}
.pills{position:absolute;top:1270px;left:44px;right:44px;display:flex;flex-direction:column;gap:14px}
.pill{background:rgba(15,23,42,.88);border:1px solid rgba(56,189,248,.35);border-left:6px solid #38bdf8;border-radius:14px;padding:16px 22px;font-size:26px;font-weight:700;color:#e0f2fe;display:flex;align-items:center;gap:14px}
.dot{color:#38bdf8;font-weight:900}
.cta{position:absolute;top:1525px;left:36px;right:36px;background:linear-gradient(135deg,rgba(30,27,75,.96),rgba(15,23,42,.96));border:2px solid #38bdf8;border-radius:20px;padding:24px 28px;box-shadow:0 16px 40px rgba(0,0,0,.65)}
.cta strong{font-size:31px;color:#67e8f9;display:block;letter-spacing:.02em}
.cta p{font-size:26px;margin-top:8px;color:#f1f5f9;font-weight:600}
.cta .sub{font-size:22px;color:#94a3b8;margin-top:6px}
</style>
<div class="top">
  <div class="badge">${esc(scene.badge)}</div>
  <div class="title">${esc(scene.title)}</div>
  <div class="label">${esc(scene.label)}</div>
  <div class="extra">${esc(scene.extra)}</div>
</div>
<div class="pills">
  ${scene.bullets.map((b) => `<div class="pill"><span class="dot">✦</span><span>${esc(b)}</span></div>`).join("")}
</div>
${
  isLast
    ? `<div class="cta"><strong>▶ FULL ALL-IN-ONE MASTER TUTORIAL (106 CHAPTERS)</strong><p>Tap the related video link right below my channel name!</p><p class="sub">${esc(REPO)}</p></div>`
    : `<div class="cta"><strong>▶ FULL 2h+ ALL-IN-ONE TUTORIAL BELOW</strong><p>File Manager · 4 Databases · Visual Designer · SimpleGUI RAD</p><p class="sub">Tap the related video below my channel name · 106 chapters</p></div>`
}`;
}

function demoFilter(scene: Scene, seconds: number): string {
  const timing = `[0:v]setpts=(PTS-STARTPTS)*${seconds / scene.length},fps=30`;
  return `${timing},scale=1080:-2[demo];[2:v][demo]overlay=0:630:shortest=1,format=yuv420p[v]`;
}

function notesMarkdown(seconds: number, tempo: number, sceneMarks: Array<{ at: number; scene: Scene }>): string {
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const stamps = sceneMarks.map((m, i) => `${fmt(i === 0 ? 0 : m.at)} ${m.scene.label}`).join("\n");
  return `# Codecaine File Manager — All-in-One Overview YouTube Short (${fmt(seconds)})

## Video File

- **Short MP4**: \`youtube_production/codecaine-file-manager-all-in-one-short.mp4\` (${seconds.toFixed(1)}s, 1080×1920 vertical, 30 fps)
- **Target Related Video**: \`youtube_production/all_in_one_tutorial.mp4\` (106 chapters — see \`youtube_production/ALL_IN_ONE_TUTORIAL_NOTES.md\`)

## YouTube Short Titles (Pick One)

1. **This Free File Manager Replaced 15 Developer Tools?! (Full 2h Course Below) #Shorts**
2. **Codecaine File Manager: Dual Pane, Synced Terminal, 200+ Themes & 4 Databases #Shorts**
3. **200+ Themes, 194 Live Shaders, 4 Databases, Task Manager & Media Studios in One File Manager?! #Shorts**

## YouTube Short Description (Copy & Paste)

\`\`\`text
Everything you can do in the Codecaine File Manager — and where to watch the complete All-in-One Master Tutorial (106 chapters)!

▶ WATCH THE FULL ALL-IN-ONE MASTER TUTORIAL:
Tap the clickable Related Video link right below my channel name in the Shorts player!

⬇️ Free Download (Windows, macOS & Linux · x64 & ARM64): ${REPO}/releases/latest
⭐ Source Code (MIT): ${REPO}

WHAT'S INSIDE CODECAINE FILE MANAGER & BUN RAD STUDIO:
• Folder Tabs, Sidebar Folder Tree, Color Tags & Group by Kind
• Dual-Pane Workspace (F5 Copy / F6 Move), Collision Handling, Recycle Bin & Rip Graveyard
• Spacebar Quick Look (Images, PDF, DOCX, XLSX, Archives, Media) & Visual chmod + AES-256-GCM File Encryption (.radenc)
• Deep Find, Bulk Rename with Before/After Review, Two-Folder Compare, Saved Projects & Action Recipes
• Two-Way Synced Terminal (PowerShell, CMD, Git Bash, WSL, zsh, bash) + Safely Quoted Path Insertion
• Built-in Code Editor (70+ Text Conversions, Zen Mode), Multi-File Regex Replace with Undo, QR Codes & Dev Station (Tokei + Git)
• Live Web & PHP Server, Watch Automation, Crypto, Secrets Vault, World Clocks & Built-in CLI Utilities
• Process & Task Manager (Live Processes, Process Tree, TCP Port Bindings) + System Information & Hardware Telemetry (Per-Core CPU, GPU, Disks, Baseline Diff)
• Batch Converter, Image Studio, Media Studio, Presets, AmpDeck Media Player (Synced Lyrics), Paint Studio & 24 Arcade Games
• 200+ Themes (5-Row Filter Pills, Folder Pinning, Split Comparator, 4-Stage Solar Cycle, Tesla Coil Plasma, Tokamak Fusion, BeOS, OS/2 Warp) + 194 Live Shaders (EF5 Debris Tornadoes, 4D Tesseract, 11D Calabi-Yau, 6-Layer Mixer) + Theme Editor v2 & Custom Shortcuts
• All 4 Databases Built In (SQLite, MySQL, PostgreSQL, Redis) + Cross-Engine Database & Redis Hash Cloning
• Bun JavaScript & Visual Macro Studio + 15-Format Staging Import Wizard + Studio IDE v2 (ER Diagrams, Schema Diff & 5-Language Codegen)
• SimpleGUI TypeScript RAD Framework + SimpleGUI Visual Designer (No-Code App Builder)!

SHORT TIMESTAMPS
${stamps}

#FileManager #Bun #TypeScript #SQLite #MySQL #PostgreSQL #Redis #OpenSource #DevTools #Shorts
\`\`\`

## How to Link This Short to the Full All-in-One Tutorial in YouTube Studio

1. Upload \`youtube_production/all_in_one_tutorial.mp4\` using \`youtube_production/ALL_IN_ONE_TUTORIAL_NOTES.md\`.
2. Upload \`youtube_production/codecaine-file-manager-all-in-one-short.mp4\` as a YouTube Short.
3. In **YouTube Studio → Content → Shorts**, open this Short's details and click **Related video**.
4. Select your uploaded **Codecaine File Manager & Bun RAD Studio Full Course** video and click **Save**.
5. Viewers watching the Short can now tap the related-video pill right below your channel handle to jump straight into the full 106-chapter All-in-One Master Tutorial.

## Build Notes

- Rebuild: \`bun scripts/build_all_in_one_short.ts\`
- Duration: ${seconds.toFixed(2)} seconds (<180s YouTube Shorts limit), 1080×1920 vertical, 30 fps, H.264 High + 48kHz stereo AAC.
- Narrator: ${EDGE_VOICE}, +3% delivery rate, 0.22s sentence gaps, pace factor ${tempo.toFixed(3)}x.
`;
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  for (const scene of scenes) {
    const source = sourceOf(scene);
    if (!existsSync(source)) throw new Error(`Missing tutorial recording: ${source}`);
    const srcDur = duration(source);
    if (scene.start + scene.length > srcDur) {
      throw new Error(`Scene ${scene.id} (${scene.start}+${scene.length}s) exceeds source (${srcDur.toFixed(1)}s): ${source}`);
    }
  }

  const narrated: Array<{ scene: Scene; audio: string; seconds: number }> = [];
  for (const scene of scenes) {
    console.log(`🎙️  Narrating ${scene.id}...`);
    const narration = await narrate(scene.id, scene.say, join(WORK, "audio"), { rate: "+3%", gap: 0.22 });
    const audio = join(WORK, `${scene.id}.wav`);
    const seconds = duration(narration) - 0.85;
    if (seconds <= 0) throw new Error(`Narration is too short to trim: ${scene.id}`);
    run([
      FFMPEG,
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      "0.25",
      "-i",
      narration,
      "-t",
      seconds.toFixed(3),
      "-c:a",
      "pcm_s16le",
      audio,
    ]);
    narrated.push({ scene, audio, seconds: duration(audio) });
  }

  const total = narrated.reduce((sum, item) => sum + item.seconds, 0);
  const tempo = Math.max(1, total / 176.5);
  if (tempo > 1.18) {
    throw new Error(`Narration is too long (${total.toFixed(1)}s); shorten the script rather than rushing it.`);
  }
  console.log(`⏱️  Raw narration ${total.toFixed(2)}s; pace adjustment ${tempo.toFixed(3)}x`);

  const browser = await Cdp.launch(9359, join(WORK, "chrome-profile"), 1080, 1920);
  const segments: string[] = [];
  const sceneMarks: Array<{ at: number; scene: Scene }> = [];
  let at = 0;

  try {
    for (const [index, item] of narrated.entries()) {
      const { scene, audio } = item;
      console.log(`🎬 Building ${scene.id}...`);
      const seconds = item.seconds / tempo;
      const html = join(WORK, `${scene.id}.html`);
      const png = join(WORK, `${scene.id}.png`);
      writeFileSync(html, overlay(scene, index));
      await browser.goto(`file://${html}`, null);
      await browser.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const screenshot = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(png, Buffer.from(screenshot.data, "base64"));

      const segment = join(WORK, `${scene.id}.mp4`);
      const filters = demoFilter(scene, seconds);
      run([
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(scene.start),
        "-t",
        String(scene.length),
        "-i",
        sourceOf(scene),
        "-i",
        audio,
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        png,
        "-filter_complex",
        filters,
        "-map",
        "[v]",
        "-map",
        "1:a",
        "-af",
        `atempo=${tempo}`,
        "-t",
        seconds.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        segment,
      ]);
      sceneMarks.push({ at, scene });
      at += duration(segment);
      segments.push(segment);
    }
  } finally {
    browser.close();
  }

  const list = join(WORK, "concat.txt");
  writeFileSync(list, segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
  run([
    FFMPEG,
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    OUTPUT,
  ]);

  const seconds = duration(OUTPUT);
  if (seconds >= 180) throw new Error(`Short exceeds three minutes: ${seconds}`);

  const md = notesMarkdown(seconds, tempo, sceneMarks);
  writeFileSync(NOTES, md);
  writeFileSync(join(WORK, "upload-guide.txt"), md);
  console.log(`\n✔ Created ${OUTPUT} (${seconds.toFixed(2)}s, ${(Bun.file(OUTPUT).size / 1048576).toFixed(1)} MB)`);
  console.log(`📝 ${NOTES}`);
}

await main();
