#!/usr/bin/env bun
/**
 * Builds the dedicated 3-Minute In-Depth Themes & Atmospheric Shaders YouTube Short
 * (1080x1920 vertical, ~2:56 / <3 minutes) showcasing every new theme, filter, comparator,
 * solar cycle, 172 procedural shaders, 4-layer mixer, and Theme Editor v2 enhancement in detail.
 *
 * Outputs:
 *   - youtube_production/codecaine-file-manager-themes-short.mp4
 *   - youtube_production/THEMES_SHORT_NOTES.md
 *   - youtube_production/themes_short/upload-guide.txt
 *
 * Usage:
 *   bun scripts/build_themes_short.ts
 */
import "./lib/tts_edge_default";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp } from "./lib/cdp_recorder";
import { EDGE_VOICE, FFMPEG, FFPROBE, narrate } from "./lib/video_pipeline";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const WORK = join(PROD, "themes_short");
const OUTPUT = join(PROD, "codecaine-file-manager-themes-short.mp4");
const NOTES = join(PROD, "THEMES_SHORT_NOTES.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
const SOURCE_MP4 = join(PROD, "file_manager_tutorial", "live", "22_themes.mp4");
const TIMELINE_JSON = join(PROD, "file_manager_tutorial", "timelines", "22_themes.json");

type SceneSpec = {
  id: string;
  stepIndex: number;
  badge: string;
  title: string;
  label: string;
  extra: string;
  bullets: string[];
  say: string;
};

type ResolvedScene = SceneSpec & {
  start: number;
  length: number;
};

const sceneSpecs: SceneSpec[] = [
  {
    id: "01_hook_menu",
    stepIndex: 0,
    badge: "01 / 17 · GOD-MODE THEMES & SHADER STUDIO",
    title: "310 THEMES.\n194 LIVE SHADERS.",
    label: "APPLE M4 ULTRA 80-CORE · 192GB RAM · PRO DISPLAY XDR 6K 120HZ",
    extra: "Recorded on Flagship Mac Studio M4 Ultra 6K XDR · Windows, macOS & Linux",
    bullets: ["310 Themes + Year 3000+ God-Mode", "🍎 Flagship Mac M4 Ultra 6K XDR", "⚡ 120Hz ProMotion Zero-Lag Shaders"],
    say: "Wait until you see the new God-Mode Theme and Shader Studio in the Codecaine File Manager, recorded on an Apple M4 Ultra six-K Pro Display X D R with three hundred and ten themes and one hundred and ninety-four live shaders.",
  },
  {
    id: "02_gallery_badges",
    stepIndex: 1,
    badge: "02 / 17 · MAC, WINDOWS & LINUX ZERO-LAG",
    title: "MAC, WIN & LINUX\nZERO-LAG + VFD.",
    label: "🍎 MAC METAL · 🪟 WIN11 DX12 · 🐧 UBUNTU/VM · 📟 VFD TELEMETRY",
    extra: "1-Click Optimize for Mac, Windows & Linux/VM + Pop-Out VFD Telemetry HUD",
    bullets: ["🍎 Optimize for Mac M4 ProMotion", "🪟 Optimize for Windows 11 DX12", "🐧 Optimize for Ubuntu Linux & VM"],
    say: "Browse three hundred and ten zero-lag themes with one-click Optimize for Mac, Windows, and Linux buttons, plus a live V F D Telemetry Deck.",
  },
  {
    id: "03_filter_pills",
    stepIndex: 2,
    badge: "03 / 17 · YEAR 3000+ & FLAGSHIP MAC KITS",
    title: "YEAR 3000+ KITS &\nMAC M4 ULTRA 6K.",
    label: "🪐 OMEGA SINGULARITY · 💎 PHOTONIC 3099 · 🖥️ M4 ULTRA 6K XDR",
    extra: "1-Click Workstation Jumpstart Kits for Year 3000+ & Flagship Mac Displays",
    bullets: ["🪐 Year 3000+ Omega & Photonic Kits", "🖥️ Mac Studio M4 Ultra 6K XDR Kit", "🍎 5K Studio Display & Tahoe 3D"],
    say: "Click any One-Click Jumpstart Kit to transform your entire desktop: try Year Three Thousand Omega Point Singularity and Photonic Metamaterial, or Mac Studio M4 Ultra six-K X D R and five-K Studio Display.",
  },
  {
    id: "04_scifi_liquid_glass",
    stepIndex: 3,
    badge: "04 / 17 · SINGULARITY, M4 XDR & 120HZ TIE-DYE",
    title: "OMEGA 3000, M4 XDR\n& 120HZ TIE-DYE.",
    label: "OMEGA POINT · MATRIOSHKA DYSON · M4 ULTRA · 120HZ TIE-DYE '67",
    extra: "Post-Singularity Hyper-Materials, 120Hz Lava-Wax Tie-Dye & EF5 Tornado",
    bullets: ["🪐 Omega Point & Dyson Brain 3000", "🫧 120Hz Haight-Ashbury Tie-Dye '67", "🔥 Inferno Fire & 🌪️ EF5 Tornado"],
    say: "Test Omega Point Singularity and Matrioshka Dyson Brain, switch to Mac Studio M4 Ultra, then run Haight-Ashbury Tie-Dye sixty-seven at a locked one hundred and twenty Hertz alongside Inferno Fire and E F 5 Tornado.",
  },
  {
    id: "05_rare_classic_os",
    stepIndex: 4,
    badge: "05 / 17 · NERD, HOLIDAYS, HORROR & CLASSICS",
    title: "D&D GRIMOIRE, LCARS,\nBeOS & OS/2 WARP.",
    label: "🎲 NERD COMPLETE · 🎄 18 US HOLIDAYS · 🧛 HORROR · 🕹️ CLASSIC OS",
    extra: "D&D Arcane Grimoire, Starfleet LCARS, BeOS R5, OS/2 Warp & Surprise Me",
    bullets: ["🎲 D&D Grimoire & Starfleet LCARS", "🎄 18 US Holidays & 🧛 Screen-Melt", "🕹️ BeOS R5, OS/2 Warp & Surprise Me"],
    say: "Explore eighteen U S Holiday themes, ten Nerd Complete themes like D and D Arcane Grimoire and Starfleet L C A R S Bridge, Horror screen-melt themes, and classics like BeOS R 5 and O S 2 Warp 4.",
  },
  {
    id: "06_pin_to_folder",
    stepIndex: 5,
    badge: "06 / 17 · ⌘V PASTE, BULK IMPORT & CONFLICTS",
    title: "⌘V PASTE, BULK IMPORT\n& CONFLICT MODAL.",
    label: "📋 ⌘V CLIPBOARD PASTE · 📦 BULK IMPORT · ⚠️ AUTO CONFLICT MODAL",
    extra: "Paste With ⌘V or Bulk Import Files With Replace, Keep Both, Merge FX or Skip",
    bullets: ["📋 ⌘V Instant Clipboard Paste", "📦 Bulk Import Codes & Packs", "⚠️ Replace, Keep Both or Merge FX"],
    say: "Pin themes per folder, press Command V anywhere to paste a theme code from your clipboard, or bulk-import packs with an automatic Conflict Resolution modal.",
  },
  {
    id: "07_split_comparator",
    stepIndex: 6,
    badge: "07 / 17 · SPLIT COMPARATOR & OKLAB BLENDER",
    title: "COMPARE & BLEND\n2 THEMES LIVE.",
    label: "⚖️ SPLIT-SCREEN WIPE · 🧬 LIVE OKLAB THEME BLENDER",
    extra: "Drag Wipe Slider or Perceptually Crossfade Theme A × Theme B",
    bullets: ["Live Split-Screen Wipe Slider", "🧬 OKLab Perceptual Crossfader", "Preview & Save Hybrid Themes"],
    say: "Open Compare and Blend to drag a live split-screen wipe slider across any two themes, or use the O K Lab Theme Blender to perceptually crossfade them into a brand-new hybrid.",
  },
  {
    id: "08_solar_cycle",
    stepIndex: 7,
    badge: "08 / 17 · 4-STAGE SOLAR CYCLE & PLAYLIST",
    title: "SOLAR SCHEDULE &\nAMBIENT PLAYLIST.",
    label: "🌅 DAWN · ☀️ DAY · 🌆 DUSK · 🌌 MIDNIGHT · 📻 AUTO-PLAYLIST",
    extra: "✨ Auto-Fill Sci-Fi Solar Cycle + Timed Theme & Shader Rotation",
    bullets: ["4-Stage Solar Clock Schedule", "✨ 1-Click Sci-Fi Solar Preset", "📻 Ambient Playlist Rotation"],
    say: "In Day Night and Playlist, link light and dark themes, auto-fill the four-stage Solar Cycle for Dawn, Day, Dusk, and Midnight, or enable Ambient Playlist auto-rotation.",
  },
  {
    id: "09_atmosphere_tiers",
    stepIndex: 8,
    badge: "09 / 17 · 194 SHADERS & EF5 TORNADOES",
    title: "194 SHADERS, M4 120HZ\n& EF5 TORNADOES.",
    label: "M4 MAX EXTREME 120HZ · EF5 DEBRIS TORNADO · NOR'EASTER GALE",
    extra: "3D-Tumbling Leaves, Roof Shingles, Flying Papers & Cat 5 Hurricanes",
    bullets: ["194 Real-Time 2D Shaders", "M4 Max Extreme Uncapped 120Hz", "EF5 Tornado & Autumn Leaf Gale"],
    say: "Open Atmosphere FX for one hundred and ninety-four live shaders up to M4 Max Extreme 120 Hertz, including E F 5 Debris Tornadoes, October Nor'easter Leaf Gales, and Category 5 Hurricanes.",
  },
  {
    id: "10_hyper_2126_physics",
    stepIndex: 9,
    badge: "10 / 17 · YEAR 2126 & TESLA PHYSICS FX",
    title: "4D TESSERACTS &\n12M-VOLT TESLA ARCS.",
    label: "🛸 YEAR 2126 HYPER-DIMENSIONAL · ⚡ SCI-FI PHYSICS",
    extra: "11D Calabi-Yau · Klein Bottle · Wardenclyffe · Tokamak · Ferrofluid",
    bullets: ["4D Tesseract & 11D Calabi-Yau", "Wardenclyffe Mega-Tesla Coils", "ITER Tokamak & Ferrofluid Spikes"],
    say: "Explore Year 2126 Hyper-Dimensional effects like the 4D Tesseract and 11D Calabi-Yau Manifold, or Tesla and Physics simulations like Wardenclyffe Coils, ITER Tokamak, and Ferrofluid Spikes.",
  },
  {
    id: "11_reactive_surge",
    stepIndex: 10,
    badge: "11 / 17 · REACTIVE PHYSICS & ARC SURGE",
    title: "REACT TO TYPING,\nCPU LOAD & AUDIO.",
    label: "⚡ TYPING VELOCITY · 📊 TELEMETRY PULSE · 🎵 SYNTH BEAT",
    extra: "Plus ⚡ Trigger Arc Surge for an Instant High-Voltage Impulse",
    bullets: ["⚡ Typing & Cursor Velocity", "📊 Live System Telemetry Pulse", "🎵 Audio Beat & ⚡ Arc Surge"],
    say: "Turn on Reactive Physics so shaders accelerate with your typing and cursor velocity, pulse with live C P U telemetry, or sync to audio beats, and click Trigger Arc Surge anytime.",
  },
  {
    id: "12_layer_mixer_presets",
    stepIndex: 11,
    badge: "12 / 17 · 6-LAYER MIXER & LAYER MODIFIERS",
    title: "STACK 6 SHADERS\n& TINT EACH LAYER.",
    label: "🔀 6-LAYER MIXER · PER-LAYER COLOR/SPEED · 48 SIGNATURE MIXES",
    extra: "Combine Up to 6 Shaders With Per-Layer Modifiers & Shareable Codes",
    bullets: ["Stack Up to 6 Live Layers", "Per-Layer Tint, Opacity & Speed", "48 Curated Signature Mixes"],
    say: "With the Multi-Effect Layer Mixer, stack up to six shaders at once with per-layer color tint and speed sliders, pick from forty-eight Signature Mixes, and save named presets.",
  },
  {
    id: "13_keyboard_shortcuts",
    stepIndex: 12,
    badge: "13 / 17 · THEME SHOW SCREENSAVER & ⌘⇧T",
    title: "THEME SHOW OSD,\nSCREENSAVER & ⌘⇧T.",
    label: "🎬 4 SHOW MODES · 7 CHANNELS · RETRO XSCREENSAVER OSD · ⌘⇧T",
    extra: "Full-Bleed Cinema HUD, Living File Manager & Retro After Dark Mode",
    bullets: ["🎬 4 Modes & 7 Show Channels", "📺 Retro XScreenSaver OSD", "⌘⇧T & Right ⌥ + T Anywhere"],
    say: "Launch the Theme Show and Screensaver Studio with Cinema H U D, Living File Manager, and Retro XScreenSaver modes across seven channels, or press Command Shift T anytime.",
  },
  {
    id: "14_editor_harmony_wcag",
    stepIndex: 13,
    badge: "14 / 17 · PRE-BUILT STUDIO PICTURES & WCAG",
    title: "PRE-BUILT PICTURES,\nHARMONY & WCAG.",
    label: "🖼️ PRE-BUILT 8K STUDIO PICTURES · 🎨 HARMONY · WCAG AA/AAA",
    extra: "1-Click Tahoe 8K, Pro Display XDR Nebula & Hasselblad Golden Hour",
    bullets: ["🖼️ 6 Pre-Built Studio Pictures", "🎨 Auto-Harmonize & Wallpaper Extract", "Live WCAG AA / AAA Inspector"],
    say: "In the Theme Editor, click Pre-Built Studio Pictures like Tahoe Aerial Coast 8K or Pro Display X D R Nebula, auto-harmonize from accent, and verify live W C A G contrast grades.",
  },
  {
    id: "15_fx_presets_shaders",
    stepIndex: 14,
    badge: "15 / 17 · 12 PRESETS & THEME HACKER LAB",
    title: "COMPIZ BURN, 90S\nCDE & CUSTOM CSS.",
    label: "🛠️ THEME HACKER LAB · 8 MUTATORS · --* TOKENS · CUSTOM CSS",
    extra: "Hack Any Theme With Compiz Burn, 90s Linux CDE Bevels & Wobbly Hover",
    bullets: ["🔥 Compiz Burn & 🧪 Bio-Slime", "🐧 90s Linux / CDE 3D Chisel", "💉 Custom --* Tokens & CSS"],
    say: "Pick from twelve Effect Style Presets, then open the Theme Hacker Lab to inject Compiz burning folders, 90s Linux C D E bevels, green-phosphor C R T shaders, and custom C S S snippets.",
  },
  {
    id: "16_save_export_theme",
    stepIndex: 15,
    badge: "16 / 17 · ATTACH SHADERS, EXPORT & SAVE",
    title: "BIND SHADER MIXES,\nEXPORT & SHARE.",
    label: "ATTACH ANY OF 194 SHADERS OR 48 MIXES · CCFM-THEME-v1 EXPORT",
    extra: "Save Custom Hacked Themes to Your Gallery or Share as 1-Line Codes",
    bullets: ["Bind Multi-Layer FX to Theme", "Save to My Themes Gallery", "1-Click CCFM-THEME-v1 Share"],
    say: "Bind any atmospheric effect or multi-layer mix directly to your custom theme, name it Midnight Liquid Glass, export as a one-line C C F M Theme share code, and save it.",
  },
  {
    id: "17_desktop_cycling_cta",
    stepIndex: 16,
    badge: "17 / 17 · ⌥R / ⌥E / ⌥P RANDOM & ⌥] HUD",
    title: "⌥R / ⌥E / ⌥P RANDOM\n& ⌥] LIVE HUD!",
    label: "🎲 ⌥R ANY · ✨ ⌥E FX · ⏹️ ⌥P PLAIN · 🚀 ⌥U ULTRA · 🛑 ⌥0 TOGGLE · ⌥] HUD",
    extra: "Zero-Dialog Instant Random Themes + Watch Full Master Tutorial Below!",
    bullets: ["🎲 ⌥R Random · ✨ ⌥E FX · ⏹️ ⌥P Plain", "🚀 ⌥U Ultra · 🛑 ⌥0 Toggle FX", "🎛️ Right ⌥ + ] Live Swatch HUD"],
    say: "Press Option R, E, P, or Zero for instant random themes with zero dialogs, or Right Option and brackets for the live H U D! Tap below for the full tutorial!",
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

function overlay(scene: ResolvedScene, index: number): string {
  const isLast = index === sceneSpecs.length - 1;
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{background:radial-gradient(900px 600px at 50% 0%,#31104b,transparent),#090d16;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.top{position:absolute;top:56px;left:44px;right:44px;display:flex;flex-direction:column;gap:14px}
.badge{align-self:flex-start;background:linear-gradient(135deg,#ec4899,#8b5cf6,#06b6d4);color:#fff;font-weight:800;font-size:22px;letter-spacing:.1em;padding:8px 18px;border-radius:999px;text-transform:uppercase}
.title{font-size:62px;font-weight:900;line-height:1.04;letter-spacing:-.02em;white-space:pre-line;background:linear-gradient(90deg,#ffffff,#a5f3fc 60%,#f0abfc);-webkit-background-clip:text;background-clip:text;color:transparent}
.label{color:#38bdf8;font-size:27px;font-weight:800;letter-spacing:.03em;margin-top:4px}
.extra{color:#cbd5e1;font-size:23px;font-weight:600;line-height:1.35}
.pills{position:absolute;top:1270px;left:44px;right:44px;display:flex;flex-direction:column;gap:14px}
.pill{background:rgba(15,23,42,.88);border:1px solid rgba(168,85,247,.4);border-left:6px solid #c084fc;border-radius:14px;padding:16px 22px;font-size:26px;font-weight:700;color:#f3e8ff;display:flex;align-items:center;gap:14px}
.dot{color:#38bdf8;font-weight:900}
.cta{position:absolute;top:1525px;left:36px;right:36px;background:linear-gradient(135deg,rgba(49,16,75,.96),rgba(15,23,42,.96));border:2px solid #c084fc;border-radius:20px;padding:24px 28px;box-shadow:0 16px 40px rgba(0,0,0,.65)}
.cta strong{font-size:30px;color:#f0abfc;display:block;letter-spacing:.02em}
.cta p{font-size:25px;margin-top:8px;color:#f1f5f9;font-weight:600}
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
    ? `<div class="cta"><strong>▶ FULL STEP-BY-STEP MASTER TUTORIAL (106 CHAPTERS)</strong><p>Tap the related video link right below my channel name!</p><p class="sub">${esc(REPO)}</p></div>`
    : `<div class="cta"><strong>▶ FULL 310 THEMES & GOD-MODE SHADERS GUIDE BELOW</strong><p>310 Themes · Year 3000+ God-Mode · M4 Ultra 6K XDR · 194 Shaders</p><p class="sub">Tap the related video below my channel name · Free & Open Source</p></div>`
}`;
}

function demoFilter(scene: ResolvedScene, seconds: number): string {
  const timing = `[0:v]setpts=(PTS-STARTPTS)*${seconds / scene.length},fps=30`;
  return `${timing},scale=1080:-2:flags=lanczos[demo];[2:v]scale=1080:1920:flags=lanczos[bg];[bg][demo]overlay=0:630:shortest=1,format=yuv420p[v]`;
}

function notesMarkdown(seconds: number, tempo: number, sceneMarks: Array<{ at: number; scene: ResolvedScene }>): string {
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const stamps = sceneMarks.map((m, i) => `${fmt(i === 0 ? 0 : m.at)} ${m.scene.label}`).join("\n");
  return `# Codecaine File Manager — 310 Themes, Year 3000+ God-Mode & Flagship Mac M4 Ultra 6K XDR Short (${fmt(seconds)})

## Video Files

- **Short MP4 (< 3 min)**: \`youtube_production/codecaine-file-manager-themes-short.mp4\` (${seconds.toFixed(1)}s, 1080×1920 vertical, 30 fps, 2x Retina Display-P3 HDR super-sampled)
- **Standalone Long-Form Themes Masterclass MP4**: \`youtube_production/codecaine-file-manager-themes-tutorial.mp4\` (1920×1080 16:9, recorded on Flagship Apple M4 Ultra 80-Core GPU · 192GB Unified Memory · Pro Display XDR 6K 120Hz ProMotion profile)
- **Full File Manager Master Tutorial MP4**: \`youtube_production/file_manager_tutorial.mp4\`
- **All-in-One Complete Suite Master Tutorial MP4**: \`youtube_production/all_in_one_tutorial.mp4\`

## YouTube Short Titles (Pick One)

1. **310 Themes & 194 Live Shaders on an M4 Ultra 6K Pro Display XDR?! (Year 3000+ God-Mode & 120Hz Tie-Dye) #Shorts**
2. **Inside Codecaine File Manager’s God-Mode Theme & 6-Layer Shader Studio (Apple M4 Ultra 6K XDR) #Shorts**
3. **From Year 3000+ Omega Singularity & Mac Studio M4 Ultra to 120Hz Tie-Dye '67 & BeOS — 310 Themes #Shorts**

## YouTube Short Description (Copy & Paste)

\`\`\`text
A complete 3-minute flagship Retina showcase of the God-Mode Themes & Atmospheric Shader Studio in the Codecaine File Manager — recorded on an Apple M4 Ultra (80-Core GPU · 192GB Unified Memory · Pro Display XDR 6K · 5K Studio Display · Display-P3 1600-nit HDR · 120Hz ProMotion) profile!

▶ WATCH THE FULL STEP-BY-STEP MASTER TUTORIAL:
Tap the clickable Related Video link right below my channel name in the Shorts player!

⬇️ Free Download (Windows, macOS & Linux · x64 & ARM64): ${REPO}/releases/latest
⭐ Source Code (MIT): ${REPO}

WHAT'S NEW IN v1.4.9 GOD-MODE THEMES & SHADER STUDIO:
• 310 Built-in Themes (168 Futuristic FX Themes) engineered for zero-lag 120Hz ProMotion on Apple Silicon M4 Pro / Max / Ultra and Windows RTX workstations
• 🌌 Year 3000+ Post-Singularity Collection (12 Themes): Omega Point Singularity, Matrioshka Dyson Brain, Photonic Metamaterial 3099, Chrono-Crystalline Aethelgard, Akashic Neural Noosphere, Zero-Point Vacuum Genesis, Kardashev Type III Citadel, Hyperborean Aether Sanctum, Tachyon Slipstream Navigator, Seraphim Halo Relativity, Quantum Superposition Cathedral & Eden Solarpunk Archology 3000
• 🍎 Flagship Mac Computers & XDR Displays (10 Themes): Mac Studio M4 Ultra 6K XDR, Mac Pro Rack XDR, MacBook Pro M4 Max Space Black, Apple Studio Display 5K, iMac M4 Spectrum P3, macOS Sequoia Redwood XDR, Vision Spatial Mac & Mac mini M4 Pro Carbon
• ⚡ 120Hz Zero-Lag GPU Optimization: silky-smooth Haight-Ashbury Tie-Dye '67 lava-wax folders, Kaleidoscope Mandala, Dalí Screen-Melt Ooze, Inferno Blazing Folders, Radioactive Slime Bio-Vat & EF5 Debris Tornadoes
• 📟 Hardware VFD & Oscilloscope Live CPU/GPU Telemetry Deck + Floating Pop-Out Monitor
• ⚡ 24 1-Click Workstation Jumpstart Kits, 194 Live Procedural Shaders, 6-Layer Multi-Effect Mixer, 🪄 Special Effects Design Wizard & 🛠️ Theme Hacker Lab

SHORT TIMESTAMPS
${stamps}

#FileManager #Themes #Shaders #AppleM4 #MacBookPro #MacStudio #ProDisplayXDR #UIUX #LiquidGlass #OpenSource #Bun #TypeScript #Shorts
\`\`\`

## Build Notes

- Rebuild: \`bun scripts/build_themes_short.ts\`
- Duration: ${seconds.toFixed(2)} seconds (<180s YouTube Shorts limit), 1080×1920 vertical, 30 fps, H.264 High + 48kHz stereo AAC.
- Narrator: ${EDGE_VOICE}, +3% delivery rate, 0.22s sentence gaps, pace factor ${tempo.toFixed(3)}x.
`;
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  if (!existsSync(SOURCE_MP4)) throw new Error(`Missing source video: ${SOURCE_MP4}`);
  if (!existsSync(TIMELINE_JSON)) throw new Error(`Missing timeline JSON: ${TIMELINE_JSON}`);

  const srcDur = duration(SOURCE_MP4);
  const timeline = JSON.parse(readFileSync(TIMELINE_JSON, "utf8")) as {
    steps: Array<{ start: number; end: number; cap: string }>;
  };

  const scenes: ResolvedScene[] = sceneSpecs.map((spec) => {
    const step = timeline.steps[spec.stepIndex];
    if (!step) {
      throw new Error(`Step index ${spec.stepIndex} not found in ${TIMELINE_JSON} (has ${timeline.steps.length} steps)`);
    }
    const start = Math.max(0, Math.min(srcDur - 1, Number(step.start.toFixed(2))));
    const rawLen = Math.max(2, Number((step.end - step.start).toFixed(2)));
    const length = Math.min(rawLen, Number((srcDur - start).toFixed(2)));
    return { ...spec, start, length };
  });

  const narrated: Array<{ scene: ResolvedScene; audio: string; seconds: number }> = [];
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
  if (tempo > 1.22) {
    throw new Error(`Narration is too long (${total.toFixed(1)}s); shorten the script rather than rushing it.`);
  }
  console.log(`⏱️  Raw narration ${total.toFixed(2)}s; pace adjustment ${tempo.toFixed(3)}x`);

  const browser = await Cdp.launch(9361, join(WORK, "chrome-profile"), 1080, 1920);
  const segments: string[] = [];
  const sceneMarks: Array<{ at: number; scene: ResolvedScene }> = [];
  let at = 0;

  try {
    for (const [index, item] of narrated.entries()) {
      const { scene, audio } = item;
      console.log(`🎬 Building ${scene.id} (clip ${scene.start.toFixed(1)}s + ${scene.length.toFixed(1)}s)...`);
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
        SOURCE_MP4,
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
        "18",
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

  // Also package the standalone Long-Form Themes Masterclass MP4 + Notes from the built 22_themes segment
  const segCard = join(PROD, "file_manager_tutorial", "segments", "22_themes_card.mp4");
  const segBody = join(PROD, "file_manager_tutorial", "segments", "22_themes.mp4");
  const longOut = join(PROD, "codecaine-file-manager-themes-tutorial.mp4");
  const longNotes = join(PROD, "THEMES_TUTORIAL_NOTES.md");
  if (existsSync(segCard) && existsSync(segBody)) {
    const longList = join(WORK, "concat_long.txt");
    writeFileSync(longList, `file '${segCard.replaceAll("'", "'\\''")}'\nfile '${segBody.replaceAll("'", "'\\''")}'\n`);
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
      longList,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      longOut,
    ]);
    const longDur = duration(longOut);
    const fmt = (sec: number) => {
      const s = Math.floor(sec);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    const longStamps = timeline.steps.map((st, idx) => `${fmt(idx === 0 ? 0 : st.start + 3.5)} ${st.cap}`).join("\n");
    const longMd = `# Codecaine File Manager — Complete Themes & Atmospheric Shader Studio Masterclass (${fmt(longDur)})

## Video File
- **Long-Form Masterclass MP4**: \`youtube_production/codecaine-file-manager-themes-tutorial.mp4\` (${longDur.toFixed(1)}s / ${fmt(longDur)}, 1920×1080 16:9, recorded on High-End Apple M4 Max Pro Display XDR 2x Retina Display-P3 HDR profile)
- **Companion 3-Minute YouTube Short**: \`youtube_production/codecaine-file-manager-themes-short.mp4\` (${seconds.toFixed(1)}s, 1080×1920 vertical)
- **Full File Manager Tutorial (with Chapter 22 Updated)**: \`youtube_production/file_manager_tutorial.mp4\`
- **All-in-One Master Tutorial (with Chapter 22 Updated)**: \`youtube_production/all_in_one_tutorial.mp4\`

## Chapters & Step Timestamps
\`\`\`text
${longStamps}
\`\`\`
`;
    writeFileSync(longNotes, longMd);
    console.log(`✔ Created standalone Long-Form Themes Masterclass: ${longOut} (${longDur.toFixed(1)}s, ${(Bun.file(longOut).size / 1048576).toFixed(1)} MB)`);
    console.log(`📝 ${longNotes}`);
  }
}

await main();

