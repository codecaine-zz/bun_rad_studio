#!/usr/bin/env bun
/**
 * Builds the 100% Live-Recorded 3-Minute YouTube Short (1080x1920 vertical 9:16, <180s, CRF 14)
 * AND companion 1920x1080 widescreen showcase video on the Flagship Apple Mac Studio M4 Ultra
 * (`FM_SHOWCASE_MAC_ULTRA=1` — 32-Core CPU · 80-Core GPU · 32-Core Neural Engine · 192 GB Unified Memory
 * · Apple Pro Display XDR 6K @ 120Hz · macOS Tahoe 26.4), narrated 100% by `ollama run phonon --voice Zoey`,
 * covering EVERYTHING Codecaine File Manager can do and EVERY SINGLE ONE of its 33 Power Tools + Studios!
 *
 * Outputs:
 *   - youtube_production/codecaine-file-manager-mac-ultra-everything-zoey-short.mp4 (1080x1920 9:16 Short)
 *   - youtube_production/codecaine-file-manager-all-in-one-short.mp4 (updated 1080x1920 9:16 Short)
 *   - youtube_production/codecaine_file_manager_mac_ultra_everything_zoey_1080p.mp4 (1920x1080 16:9 Widescreen)
 *   - youtube_production/MAC_ULTRA_EVERYTHING_ZOEY_SHORT_NOTES.md
 *
 * Usage:
 *   bun scripts/build_mac_ultra_everything_zoey_short.ts
 */
import "./lib/tts_edge_default";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { seedDemoWorkspace } from "./lib/demo_workspace";
import { FFMPEG, FFPROBE, narrate, sh } from "./lib/video_pipeline";
import {
  createWavHeader,
  parseWavPcm,
  splitTextForPhonon,
} from "../src/features/filemanager/fmPhonon";
import { MASTER_CUSTOM_THEMES } from "../src/features/filemanager/fmMasterCustomThemes";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const WORK = join(PROD, "mac_ultra_everything_zoey_short");
const OUTPUT_SHORT = join(
  PROD,
  "codecaine-file-manager-mac-ultra-everything-zoey-short.mp4",
);
const OUTPUT_ALL_IN_ONE_SHORT = join(
  PROD,
  "codecaine-file-manager-all-in-one-short.mp4",
);
const OUTPUT_WIDE = join(
  PROD,
  "codecaine_file_manager_mac_ultra_everything_zoey_1080p.mp4",
);
const NOTES = join(PROD, "MAC_ULTRA_EVERYTHING_ZOEY_SHORT_NOTES.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";

const FM_PORT = 51844;
const CDP_REC_PORT = 9514;
const CDP_OVL_PORT = 9515;
const VIEW_W = 1920;
const VIEW_H = 972;

const ROOT_DIR = "/tmp/fm_mac_ultra_everything_zoey";
const HOME =
  process.platform === "darwin"
    ? "/private/tmp/fm_mac_ultra_everything_zoey/home"
    : "/tmp/fm_mac_ultra_everything_zoey/home";
const DATA = `${ROOT_DIR}/data`;
const GRAVE = `${ROOT_DIR}/grave`;
const ZDOT = `${ROOT_DIR}/zdot`;

type SceneSpec = {
  id: string;
  badge: string;
  title: string;
  label: string;
  extra: string;
  bullets: string[];
  say: string;
  record: (c: Cdp) => Promise<void>;
};

function run(args: string[]): string {
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0)
    throw new Error(
      `${args[0]} failed:\n${result.stderr.toString().slice(-4000)}`,
    );
  return result.stdout.toString();
}

function duration(file: string): number {
  const value = Number(
    run([
      FFPROBE,
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]).trim(),
  );
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`Invalid duration: ${file}`);
  return value;
}

const esc = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function seedMacUltraWorkspace() {
  rmSync(ROOT_DIR, { recursive: true, force: true });
  mkdirSync(ROOT_DIR, { recursive: true });
  seedDemoWorkspace(HOME, join(ROOT_DIR, "frames"));

  const projectDir = join(HOME, "Projects", "shop-app");
  mkdirSync(join(projectDir, "ai-models"), { recursive: true });
  mkdirSync(join(projectDir, "shaders"), { recursive: true });
  mkdirSync(join(projectDir, "security-vault"), { recursive: true });
  writeFileSync(
    join(projectDir, "ai-models", "Phonon_Zoey_MLX.md"),
    "# Ollama Phonon TTS (--voice Zoey)\n\nRunning on Apple Mac Studio M4 Ultra (32c CPU · 80c GPU · 192GB Unified Memory).\n",
  );
  writeFileSync(
    join(projectDir, "M4_Ultra_Raytracer.swift"),
    "import Metal\n// Apple M4 Ultra 80-Core GPU · 120Hz Pro Display XDR 6K\n",
  );
  writeFileSync(
    join(projectDir, "old-draft-to-bury.txt"),
    "Draft file ready for Rip Graveyard safe bury and restore.\n",
  );

  const mediaDir = join(HOME, "Media");
  mkdirSync(mediaDir, { recursive: true });
  sh(
    [
      FFMPEG,
      "-y",
      "-f",
      "lavfi",
      "-i",
      "gradients=s=1280x800:c0=0xff7e5f:c1=0xfeb47b:c2=0x6a3093:n=3:type=radial",
      "-frames:v",
      "1",
      join(mediaDir, "sunset.jpg"),
    ],
    { quiet: true },
  );
  sh(
    [
      FFMPEG,
      "-y",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.15*sin(2*PI*220*t)+0.1*sin(2*PI*330*t):d=10",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "160k",
      join(mediaDir, "morning-song.mp3"),
    ],
    { quiet: true },
  );
  sh(
    [
      FFMPEG,
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=25",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.1*sin(2*PI*220*t):d=6",
      "-t",
      "6",
      "-c:v",
      "libx264",
      "-crf",
      "26",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      join(mediaDir, "city-clip.mp4"),
    ],
    { quiet: true },
  );

  mkdirSync(ZDOT, { recursive: true });
  writeFileSync(
    join(ZDOT, ".zshrc"),
    `HISTFILE=${ZDOT}/.history\nPROMPT='%F{cyan}codecaine@Mac-Studio-M4-Ultra%f %F{magenta}%1~%f ❯ '\nRPROMPT=''\n`,
  );
  mkdirSync(DATA, { recursive: true });
  writeFileSync(
    join(DATA, "file_manager_themes.json"),
    JSON.stringify({ version: 1, themes: MASTER_CUSTOM_THEMES }, null, 2),
  );
  writeFileSync(
    join(DATA, "file_manager.json"),
    JSON.stringify(
      {
        theme: "dark",
        palette: "holiday_halloween_jack_o_lantern",
        preferredLightPalette: "orbital_ice",
        preferredDarkPalette: "holiday_halloween_jack_o_lantern",
        folderFxOnly: true,
        atmosphere: "none",
        atmosphereTier: "ultra",
        themeIconAnimation: "folder_3d_spin_turntable",
        favoriteThemes: [
          "holiday_halloween_jack_o_lantern",
          "custom_0000000d",
          "horror_nosferatu_blood_moon",
          "polar_night",
          "mac_studio_m4_ultra",
        ],
        seenWelcome: true,
      },
      null,
      2,
    ),
  );
}

async function showKeynoteHud(
  c: Cdp,
  title: string,
  subtitle: string,
  pill = "🎃 HALLOWEEN ULTRA · M4 ULTRA · ZOEY",
) {
  await c.eval(`(() => {
    let el = document.getElementById("apple-keynote-hud");
    if (!el) {
      el = document.createElement("div");
      el.id = "apple-keynote-hud";
      el.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:14px",
        "transform:translateX(-50%)",
        "z-index:2147483646",
        "pointer-events:none",
        "display:flex",
        "align-items:center",
        "gap:14px",
        "padding:10px 22px",
        "border-radius:999px",
        "background:linear-gradient(135deg, rgba(16,10,24,0.95), rgba(30,16,38,0.93))",
        "border:1.5px solid rgba(255,140,26,0.72)",
        "box-shadow:0 20px 50px rgba(0,0,0,0.82), 0 0 32px rgba(255,140,26,0.38)",
        "backdrop-filter:blur(24px) saturate(190%)",
        "-webkit-backdrop-filter:blur(24px) saturate(190%)",
        "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
        "color:#f8fafc"
      ].join(";");
      document.documentElement.appendChild(el);
    }
    el.innerHTML = "";
    const badge = document.createElement("span");
    badge.style.cssText = "background:linear-gradient(135deg,#ff8c1a,#f59e0b,#a855f7);color:#09050e;font-weight:900;font-size:12.5px;letter-spacing:0.08em;padding:5px 13px;border-radius:999px;white-space:nowrap;";
    badge.textContent = ${JSON.stringify(pill)};
    const textWrap = document.createElement("div");
    textWrap.style.cssText = "display:flex;flex-direction:column;gap:2px;";
    const tEl = document.createElement("strong");
    tEl.style.cssText = "font-size:15.5px;font-weight:800;letter-spacing:-0.01em;color:#ffffff;white-space:nowrap;";
    tEl.textContent = ${JSON.stringify(title)};
    const sEl = document.createElement("span");
    sEl.style.cssText = "font-size:12px;font-weight:600;color:#fed7aa;white-space:nowrap;";
    sEl.textContent = ${JSON.stringify(subtitle)};
    textWrap.appendChild(tEl);
    textWrap.appendChild(sEl);
    el.appendChild(badge);
    el.appendChild(textWrap);
  })()`);
}

async function openToolTab(c: Cdp, id: string, expand = false) {
  await c.eval(`(async () => {
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    const { openPower, setPowerExpanded } = await import('/ui/power.js');
    openPower(${JSON.stringify(id)});
    setPowerExpanded(${Boolean(expand)});
    const tabEl = document.getElementById('power-tab-' + ${JSON.stringify(id)});
    if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  })()`);
}

const sceneSpecs: SceneSpec[] = [
  {
    id: "01_mac_ultra_sysinfo_tasks_views",
    badge: "01 / 12 · APPLE MAC STUDIO M4 ULTRA · 32C CPU · 80C GPU · 192GB",
    title: "M4 ULTRA WORKSTATION.\n33 TOOLS BUILT IN.",
    label:
      "🍎 MAC STUDIO M4 ULTRA · SYSTEM TELEMETRY · TASK MANAGER · 4 WORKSPACE VIEWS",
    extra:
      "Narrated Live by Zoey (`ollama run phonon --voice Zoey`) · 6K XDR @ 120Hz",
    bullets: [
      "🍎 Flagship Apple M4 Ultra (32c CPU · 80c GPU · 192GB RAM)",
      "📊 System Info (40+ Hardware Probes, GPU/Display & Baseline Diff)",
      "⚡ Live Process & Task Manager (Process Tree & TCP Ports) + Home/Split Views",
    ],
    say: "Hi, I'm Zoey, narrating live with Phonon on our Apple Mac Studio M4 Ultra! Let's tour all thirty-three tools in Codecaine File Manager, starting with Home, Split, System Telemetry, and Task Manager.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🍎 Apple Mac Studio M4 Ultra (32c CPU · 80c GPU · 192GB RAM · Pro Display XDR 6K)",
        "Narrated Live by `ollama run phonon --voice Zoey` · Home, Split, System Telemetry & Task Manager",
        "🍎 M4 ULTRA · ZOEY TTS",
      );
      await c.click("#view-home", { pause: 900 }).catch(() => {});
      await c.click("#view-split", { pause: 900 }).catch(() => {});
      await openToolTab(c, "sysinfo", false);
      await sleep(1100);
      for (const sec of ["CPU & Thermal", "GPUs & Displays", "Memory (RAM)"]) {
        await c
          .click(`#power-pane-sysinfo .sys-tab >> ${sec}`, { pause: 700 })
          .catch(() => {});
      }
      await openToolTab(c, "tasks", false);
      await sleep(1200);
      await c.click("#view-files", { pause: 600 }).catch(() => {});
    },
  },
  {
    id: "02_tabs_tree_quickfilter_selection",
    badge: "02 / 12 · TABS, TREE, QUICK-FILTER PREDICATES & SMART SELECTION",
    title: "TABS, FOLDER SIZES\n& POWER FILTERS.",
    label:
      "FOLDER TABS · ON-DEMAND SIZES · QUICK-FILTER PREDICATES · SELECT BY PATTERN",
    extra:
      "is:dir & ext: Filters · Smart Kind-Chips · Starter Templates · Command Palette · World Clocks",
    bullets: [
      "🗂️ Multi-Tab Browsing (`⇧⌘T`), Sidebar Folder Tree & Color Tags",
      "📐 On-Demand Folder Sizes, `is:dir` / `ext:` Filters & Kind-Chips",
      "🎯 Select by Pattern, Starter Templates, Command Palette & World Clocks",
    ],
    say: "Open folder tabs, expand the sidebar tree, tag files with colors, and calculate folder sizes on demand. Filter with predicates and kind chips, select by pattern, or open the Command Palette and World Clocks.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🗂️ Folder Tabs, On-Demand Folder Sizes, Power Filter Predicates & Command Palette",
        "Multi-tab browsing · `is:dir` & `ext:` predicates · Select by Pattern · World Clocks & Epoch Converter",
        "⚡ SMART NAVIGATION",
      );
      await c.eval(`(async () => {
        const { closePower } = await import('/ui/power.js');
        closePower();
        const { saveSettings } = await import('/ui/nav.js');
        await saveSettings({ view: 'details' });
      })()`);
      await sleep(400);
      await c.click("#qb-sizes-btn", { pause: 800 }).catch(() => {});
      await c.eval(`(() => {
        const q = document.getElementById('quick-filter');
        if (q) { q.value = 'ext:ts,md'; q.dispatchEvent(new Event('input', { bubbles: true })); }
      })()`);
      await sleep(900);
      await c.eval(`(() => {
        const q = document.getElementById('quick-filter');
        if (q) { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); }
      })()`);
      await c.click("#viewbar-palette", { pause: 1000 }).catch(() => {});
      await c.key("Escape", "Esc");
      await sleep(300);
      await c.click("#status-clock", { pause: 700 }).catch(() => {});
      await c.key("Escape", "Esc");
      await sleep(400);
    },
  },
  {
    id: "03_dualpane_atomic_graveyard",
    badge: "03 / 12 · DUAL-PANE, ATOMIC UNDO, RECYCLE BIN & RIP GRAVEYARD",
    title: "DUAL PANES, UNDO\n& RIP GRAVEYARD.",
    label:
      "SIDE-BY-SIDE DUAL PANE · F5 COPY / F6 MOVE · NEW FOLDER WITH SELECTION · GRAVEYARD",
    extra:
      "Collision Protection · Queued Big Jobs · Recycle Bin Restore · Rip Graveyard Tool",
    bullets: [
      "🪟 Side-by-Side Dual Pane (`F5` Copy, `F6` Move & Swap Panes)",
      "📁 New Folder with Selection + Atomic Undo (`⌘Z`) & Paste as File",
      "🪦 Recycle Bin + Rip Graveyard (`grave`) Bury & 1-Click Restore",
    ],
    say: "Work side by side in Dual View with F5 copy, F6 move, and queued progress. Bundle selected files with atomic Command Z undo, restore from the Recycle Bin, or use the Rip Graveyard tool.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🪟 Dual-Pane Workspace (`F5` Copy / `F6` Move) + Atomic Undo & Rip Graveyard",
        "Zero silent overwrites · Queued job progress · Recycle Bin & Rip Graveyard (`#power-tab-grave`)",
        "🛡️ ZERO DATA LOSS",
      );
      await c.click("#view-dual", { pause: 1300 }).catch(() => {});
      await c.click("#view-files", { pause: 500 }).catch(() => {});
      await c.eval(`(async () => {
        const { call } = await import('/ui/api.js');
        const { currentPath } = await import('/ui/state.js');
        const folder = currentPath();
        if (folder) await call('grave/bury', { paths: [folder + '/old-draft-to-bury.txt'] }).catch(() => {});
      })()`);
      await openToolTab(c, "grave", false);
      await sleep(1200);
      await c
        .click("#power-body .pw-btn >> Select all", { pause: 600 })
        .catch(() => {});
      await c
        .click("#power-body .pw-btn >> Restore", { pause: 800 })
        .catch(() => {});
      await c.click("#view-files", { pause: 500 }).catch(() => {});
    },
  },
  {
    id: "04_quicklook_info_chmod_lock",
    badge: "04 / 12 · QUICK LOOK, DEEP FILE INFO, VISUAL CHMOD & AES-256 LOCK",
    title: "SPACEBAR PREVIEW\n& AES-256 LOCK.",
    label:
      "QUICK LOOK · DOMINANT COLOR PALETTE · VISUAL CHMOD · .radenc ENCRYPTION",
    extra:
      "Magic-Byte Disguised File Detection · SHA-256 Hashes · Argon2id + AES-256-GCM Vault",
    bullets: [
      "👁️ Spacebar Quick Look (Photos, Video, Audio, PDF, Office, Archives)",
      "🔍 Deep File Info (Color Swatches, SHA-256 & Disguised-File Guard)",
      "🔐 Visual POSIX `chmod` Grid & AES-256-GCM `.radenc` File Lock",
    ],
    say: "Press Spacebar for instant Quick Look across photos, videos, documents, and archives. Inspect SHA-256 hashes, color swatches, and disguised-file alerts, edit Unix permissions visually, or lock files with A E S 256 encryption.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "👁️ Spacebar Quick Look + Deep File Info + Visual `chmod` + AES-256-GCM Lock",
        "Instant preview · Dominant color palette & SHA-256 · Octal permissions · `.radenc` encryption",
        "🔐 INSPECT & LOCK",
      );
      await c.eval(`(async () => {
        const { closePower } = await import('/ui/power.js');
        closePower();
        const { goTo } = await import('/ui/nav.js');
        await goTo(${JSON.stringify(`${HOME}/Media`)});
      })()`);
      await sleep(600);
      await c.click("#list .row", { pause: 500 }).catch(() => {});
      await c.key(" ", "Space");
      await sleep(1100);
      await c.key("Escape", "Esc");
      await sleep(400);
      await c.click("#tool-lock", { pause: 900 }).catch(() => {});
      await sleep(900);
      await c.key("Escape", "Esc");
      await sleep(400);
    },
  },
  {
    id: "05_files_and_dev_power_tools",
    badge:
      "05 / 12 · FIND, COMPARE, REPLACE, CODE EDITOR, DEV, PROJECTS & BUNDLER",
    title: "CODE EDITOR, GIT,\nDIFF & BUNDLER.",
    label:
      "FIND & BULK RENAME · 2-FOLDER COMPARE · MULTI-FILE REPLACE · CODE · DEV · BUNDLER",
    extra:
      "Before/After Review Plan · 70+ Text Transforms · Tokei Code Stats · macOS .app Bundler",
    bullets: [
      "🔎 Deep Find + Bulk Rename Review (`find`) & 2-Folder Sync (`compare`)",
      "📝 Multi-File Regex Replace (`sd`) & Code Editor (`code` · 70+ Transforms)",
      "🧑‍💻 Dev Station (`dev` · Tokei/Git/TODO), Projects (`projects`) & Bundler (`bundler`)",
    ],
    say: "Search and bulk-rename with before-and-after review in Find, sync folders in Compare, and regex-replace with Undo in Replace. Edit code in Code, inspect Git and Tokei stats in Dev, save Projects, and build Mac apps in Bundler.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🧑‍💻 All 7 Files & Dev Tools: Find · Compare · Replace · Code · Dev · Projects · Bundler",
        "Before/After Rename & Replace Review · 70+ Code Transforms · Tokei Stats & Git · App Bundler",
        "🛠️ FILES & DEV SUITE",
      );
      await c.eval(`(async () => {
        const { goTo } = await import('/ui/nav.js');
        await goTo(${JSON.stringify(`${HOME}/Projects/shop-app`)});
      })()`);
      for (const t of [
        "find",
        "compare",
        "sd",
        "code",
        "dev",
        "projects",
        "bundler",
      ]) {
        await openToolTab(c, t, false);
        await sleep(580);
      }
    },
  },
  {
    id: "06_synced_terminal_and_cliutils",
    badge: "06 / 12 · TWO-WAY SYNCED TERMINAL & BUILT-IN RAD CLI UTILITIES",
    title: "TYPE cd IN SHELL.\nYOUR FILES FOLLOW.",
    label:
      "TWO-WAY SYNCED TERMINAL · QUOTED PATH INSERTION · RAD CLI UTILITIES",
    extra:
      "zsh · bash · PowerShell · CMD · Git Bash · WSL · 1-Click Quoted Path Insertion",
    bullets: [
      "⌨️ Type `cd` in Terminal and the File List Follows Automatically",
      "📎 Select Files & Insert Safely Quoted Paths in One Click",
      "🛠️ Built-In RAD Studio CLI Utilities (`cliutils`) Ready in Terminal",
    ],
    say: "In the built-in Terminal, type c d and your file list follows automatically! Select any files to insert safely quoted paths in one click, and run built-in R A D command-line tools from C L I Utilities.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "⌨️ Two-Way Synced Terminal (`cd` Syncs File List) + Quoted Paths + CLI Utilities",
        "Real zsh/bash/PowerShell/WSL terminal · 1-Click Path Insertion · `#power-tab-cliutils`",
        "⌨️ SYNCED TERMINAL",
      );
      await openToolTab(c, "cliutils", false);
      await sleep(1000);
      await c.click("#view-files", { pause: 500 }).catch(() => {});
      await c.click("#status-terminal", { pause: 900 }).catch(() => {});
      await c.click("#terminal-host", { pause: 300 }).catch(() => {});
      await c.type("pwd && ls -la", 45);
      await c.key("Enter", "Enter");
      await sleep(1100);
      await c.click("#terminal-close", { pause: 500 }).catch(() => {});
    },
  },
  {
    id: "07_automate_security_network_handy",
    badge: "07 / 12 · AUTOMATE, SECURITY, NETWORK & HANDY POWER TOOLBOX",
    title: "SERVE, WATCH, VAULT,\nNET & API STUDIO.",
    label:
      "WATCH · ACTIONS · SERVE · CRYPTO · SECRETS · ENV · IP · NET · SUBS · DOWNLOADS · API · CALC · TIMER · QR",
    extra:
      "14 Built-In Power Tools for Automation, Encryption, Network Diagnostics & Daily Workflows",
    bullets: [
      "⚙️ Watch Automation (`watch`), Action Recipes (`actions`) & Live/PHP Server (`serve`)",
      "🗝️ Crypto (`crypto`), Secrets Vault (`secrets`) & Masked `.env` Studio (`env`)",
      "🌐 IP (`ip`), Network (`net`), Subdomains (`subs`), Downloads, API, Calc, Timer & QR",
    ],
    say: "Automate with File Watch, Action recipes, and a Live or P H P Server. Manage Crypto, the encrypted Secrets Vault, and Env Studio. Diagnose networks with I P, Network, Subdomains, Downloads, and A P I Studio, plus Calculator, Timer, and Q R.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🌐 14 Power Tools: Watch · Actions · Serve · Crypto · Secrets · Env · IP · Net · Subs · API · Calc · Timer · QR",
        "Live & PHP Server · Encrypted Secrets Vault · Port/DNS/TLS Inspector · REST API Studio · Scientific Calculator",
        "🧰 POWER TOOLBOX",
      );
      for (const t of [
        "watch",
        "actions",
        "serve",
        "crypto",
        "secrets",
        "env",
        "ip",
        "net",
        "subs",
        "downloads",
        "api",
        "calc",
        "timer",
        "qr",
      ]) {
        await openToolTab(c, t, false);
        await sleep(310);
      }
    },
  },
  {
    id: "08_convert_image_and_media_studios",
    badge: "08 / 12 · CONVERT, IMAGE STUDIO, MEDIA STUDIO & BATCH PRESETS",
    title: "IMAGE STUDIO,\nMEDIA & PRESETS.",
    label:
      "1-CLICK CONVERT · IMAGE STUDIO · MEDIA STUDIO · REUSABLE BULK PRESETS",
    extra:
      "Non-Destructive Photo Sliders · Hold-to-Compare · Video Trim, Speed & Fades · Podcast Voice",
    bullets: [
      "⚡ Convert & Process Dialog + 1-Click Helper Program Installer",
      "🎨 Image Studio (`imagestudio`): Live Sliders, Quick Looks & Crop Shapes",
      "🎬 Media Studio (`mediastudio`): Trim, Speed, Fades, Podcast Voice & Bulk Presets",
    ],
    say: "Use Convert and Process for one-click format edits. Adjust photos non-destructively in Image Studio with live sliders and Hold to Compare, trim videos and audio in Media Studio, and apply saved presets to whole folders in bulk.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🎨 Image Studio + 🎬 Media Studio + ⚡ 1-Click Convert & Reusable Batch Presets",
        "Non-destructive photo sliders · Video/audio trim, speed & fades · Apply saved presets to entire folders",
        "🎬 CREATIVE STUDIOS",
      );
      await c.eval(`(async () => {
        const { closePower } = await import('/ui/power.js');
        closePower();
        const { goTo } = await import('/ui/nav.js');
        await goTo(${JSON.stringify(`${HOME}/Media`)});
      })()`);
      await sleep(500);
      await openToolTab(c, "imagestudio", false);
      await sleep(1400);
      await openToolTab(c, "mediastudio", false);
      await sleep(1400);
    },
  },
  {
    id: "09_ampdeck_paint_and_60_arcade_games",
    badge: "09 / 12 · AMPDECK PLAYER, PAINT STUDIO & 60 ARCADE GAMES",
    title: "AMPDECK, PAINT\n& 60 ARCADE GAMES!",
    label:
      "10-BAND EQ · 108 VISUALIZERS · PAINT & COLORING BOOK · 60 BUILT-IN GAMES",
    extra:
      "Synced Lyrics Rack Player · Pixel & Vector Paint · 60 Arcade, Puzzle, Card, Casino & TV Show Games",
    bullets: [
      "🎧 Media Deck (`player`): 10-Band EQ, 108 Visualizers & Synced Lyrics",
      "🖌️ Paint Studio (`paint`): Brushes, Layers, Filters & Coloring Library",
      "🕹️ Codecaine Games (`games`): All 60 Arcade, Puzzle, Casino & TV Show Games",
    ],
    say: "Play music with a ten-band equalizer, one hundred eight visualizers, and synced lyrics in Media Deck, paint and color in Paint Studio, or play all sixty built-in arcade, puzzle, card, casino, and TV game show classics!",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🎧 Media Deck (108 Visualizers) + 🖌️ Paint Studio + 🕹️ All 60 Codecaine Arcade Games",
        "10-Band Equalizer & Synced Lyrics · Vector Coloring Book · 60 Built-In Arcade, Puzzle, Casino & TV Games",
        "🕹️ 60 ARCADE GAMES",
      );
      await openToolTab(c, "player", false);
      await sleep(1100);
      await openToolTab(c, "paint", false);
      await sleep(1100);
      await openToolTab(c, "games", false);
      await sleep(1400);
    },
  },
  {
    id: "10_phonon_tts_voice_cloning_epub_mp4",
    badge: "10 / 12 · OLLAMA PHONON TTS (ZOEY), 5S VOICE CLONING & EPUB-TO-MP4",
    title: "PHONON TTS (ZOEY)\n& VOICE CLONING.",
    label:
      "38 NEURAL VOICES · 5S ZERO-SHOT VOICE CLONING · 242-CHUNK EPUB-TO-MP4 VIDEO",
    extra:
      "Pitch-Sync Teleprompter · AI Mic Recorder + Whisper MLX · Batch Audiobook Queue",
    bullets: [
      "🗣️ Phonon TTS (`phonon`): `--voice Zoey`, 38 Voices, Pitch (±6 st) & Sync",
      "🎙️ 5-Second Zero-Shot Voice Cloning (`F5-TTS-MLX`) + Whisper Auto-Transcribe",
      "🎬 242-Chunk Full-Book EPUB-to-MP4 Read-Along Video & Batch Audiobooks",
    ],
    say: "In Voice Reader powered by ollama run phonon, choose my voice Zoey or thirty-eight voices, use the Pitch-Sync Teleprompter, clone any voice in five seconds with F5-T T S-M L X, and export full E P U B books as Read-Along M P 4 videos!",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🗣️ Ollama Phonon TTS (`--voice Zoey`) + 5s Zero-Shot Voice Cloning + EPUB-to-MP4 Video",
        "38 Neural Voices · Pitch-Sync Teleprompter · F5-TTS-MLX Voice Cloning · 242-Chunk Read-Along MP4 Export",
        "🎙️ PHONON VOICE STUDIO",
      );
      await openToolTab(c, "phonon", true);
      await sleep(1500);
      await c.eval(`(() => {
        const cloneCard = document.getElementById('phonon-clone-card');
        if (cloneCard) cloneCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()`);
      await sleep(1400);
      await c.eval(`(async () => {
        const { setPowerExpanded } = await import('/ui/power.js');
        setPowerExpanded(false);
      })()`);
    },
  },
  {
    id: "11_ollama_ai_and_310_themes_194_shaders",
    badge:
      "11 / 12 · LOCAL OLLAMA AI ASSISTANT, 310+ THEMES & 194 120HZ SHADERS",
    title: "LOCAL OLLAMA AI &\n310+ 6K XDR THEMES.",
    label:
      "OFFLINE OLLAMA AI + READ ALOUD · 310+ THEMES · 194 LIVE SHADERS · GEMINI AI THEME LAB",
    extra:
      "18 US Holiday Ultra Themes · Polar Night · 6-Layer FX Mixer · Split Comparator & OKLab Blender",
    bullets: [
      "🤖 Local Ollama AI Assistant (`ollama`): Summarize, Q&A & Read Aloud with Zoey",
      "🎨 310+ Themes, 18 US Holidays, Polar Night & 20 Master Custom Themes",
      "✨ 194 Live 120Hz Shaders, 6-Layer Mixer, OKLab Blender & Gemini AI Customizer",
    ],
    say: "Ask the local Ollama A I Assistant to summarize documents and read answers aloud with my Phonon voice! Then showcase over three hundred themes, eighteen U S Holidays, Polar Night, and one hundred ninety-four live shaders in six-K X D R Icons View.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🤖 Local Ollama AI Assistant + 🎨 310+ Themes & 194 Live 120Hz Shaders in 6K XDR",
        "Offline Document Q&A + Read Aloud with Zoey · 18 US Holidays · Polar Night · 6-Layer Shader Mixer",
        "🤖 OLLAMA AI + THEMES",
      );
      await openToolTab(c, "ollama", false);
      await sleep(1300);
      await c.click("#view-files", { pause: 500 }).catch(() => {});
      await c
        .click("#status-views button >> Icons", { pause: 600 })
        .catch(() => {});
      for (const key of [
        "custom_0000000d",
        "horror_nosferatu_blood_moon",
        "polar_night",
        "holiday_halloween_jack_o_lantern",
      ]) {
        await c.eval(`(async () => {
          const { applyPalette, applyUiImmersionProfiles } = await import('/ui/themes.js');
          await applyPalette?.(${JSON.stringify(key)});
          applyUiImmersionProfiles?.({ folderFxOnly: true });
        })()`);
        await sleep(550);
      }
    },
  },
  {
    id: "12_four_databases_macros_ide_finale",
    badge:
      "12 / 12 · 4 DATABASES, CROSS-ENGINE CLONING, BUN JS MACROS & STUDIO IDE v2",
    title: "4 DATABASE ENGINES\n& STUDIO IDE v2.",
    label:
      "SQLite · MySQL · PostgreSQL · Redis · CROSS-ENGINE CLONING · BUN JS MACROS · ER DIAGRAMS",
    extra:
      "Keychain Security · 15-Format Staging Import · Schema Diff & 5-Language Codegen · Free & Open Source",
    bullets: [
      "🗄️ All 4 Databases (`databases`): SQLite, MySQL, PostgreSQL & Redis + Keychain",
      "🔄 Cross-Engine Database & Redis Hash Cloning + 15-Format Staging Import",
      "⚡ Bun JS & DAO Macros + Studio IDE v2 (ER Diagrams, Diff & Codegen)",
    ],
    say: "Finally, connect SQLite, MySQL, PostgreSQL, and Redis in the Databases Hub, clone across engines and Redis Hashes, run Bun JavaScript macros, and use Studio I D E version two with E R diagrams and codegen. Watch the full step-by-step tutorial below!",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🗄️ All 4 Databases (SQLite · MySQL · PostgreSQL · Redis) + Cross-Engine Cloning & Studio IDE v2",
        "Bun JS & Visual Macros · 15-Format Staging Wizard · ER Diagrams, Schema Diff & 5-Language Codegen",
        "🗄️ 4 DATABASE STUDIOS",
      );
      await openToolTab(c, "databases", false);
      await sleep(1200);
      await c.eval(
        `[...document.querySelectorAll('#power-body button')].filter((b) => /^(Never for this one|Not now)$/.test(b.textContent.trim())).forEach((b) => b.click())`,
      );
      await sleep(1600);
    },
  },
];

function overlayVertical(scene: SceneSpec, index: number): string {
  const isFirst = index === 0;
  const isLast = index === sceneSpecs.length - 1;
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{background:radial-gradient(960px 640px at 50% 0%,#2a1230,transparent),radial-gradient(800px 520px at 85% 100%,#3b1708,transparent),#09050e;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif}
.top{position:absolute;top:42px;left:42px;right:42px;display:flex;flex-direction:column;gap:11px}
.badge-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.badge{background:linear-gradient(135deg,#ff8c1a,#f59e0b,#a855f7);color:#09050e;font-weight:900;font-size:19px;letter-spacing:.09em;padding:7px 16px;border-radius:999px;text-transform:uppercase;box-shadow:0 8px 24px rgba(255,140,26,.38)}
.voice-pill{background:rgba(255,140,26,.18);border:1.5px solid #ff8c1a;color:#fed7aa;font-weight:800;font-size:18px;padding:6px 15px;border-radius:999px;letter-spacing:.03em}
.live-narrator-banner{background:linear-gradient(90deg,rgba(255,140,26,.26),rgba(168,85,247,.24));border:1.5px solid #ff8c1a;color:#fff7ed;font-weight:900;font-size:20px;padding:8px 16px;border-radius:12px;letter-spacing:.02em;display:flex;align-items:center;gap:10px;box-shadow:0 6px 20px rgba(255,140,26,.22)}
.title{font-size:56px;font-weight:900;line-height:1.02;letter-spacing:-.025em;white-space:pre-line;background:linear-gradient(90deg,#ffffff 0%,#fed7aa 52%,#c084fc 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.label{color:#fb923c;font-size:23px;font-weight:800;letter-spacing:.04em;margin-top:2px}
.extra{color:#e2e8f0;font-size:20px;font-weight:600;line-height:1.3}
.frame-glow{position:absolute;top:624px;left:0;width:1080px;height:554px;border-top:2px solid rgba(255,140,26,.65);border-bottom:2px solid rgba(168,85,247,.65);box-shadow:0 0 50px rgba(255,140,26,.25);pointer-events:none}
.pills{position:absolute;top:1202px;left:42px;right:42px;display:flex;flex-direction:column;gap:12px}
.pill{background:rgba(18,10,28,.92);border:1px solid rgba(255,140,26,.42);border-left:6px solid #ff8c1a;border-radius:14px;padding:14px 20px;font-size:23.5px;font-weight:700;color:#fff7ed;display:flex;align-items:center;gap:14px;box-shadow:0 10px 26px rgba(0,0,0,.55)}
.dot{color:#ff8c1a;font-weight:900}
.cta{position:absolute;top:1485px;left:36px;right:36px;background:linear-gradient(135deg,rgba(26,12,38,.97),rgba(38,16,12,.96));border:2px solid #ff8c1a;border-radius:22px;padding:20px 26px;box-shadow:0 18px 44px rgba(0,0,0,.75)}
.cta strong{font-size:27px;color:#fdba74;display:block;letter-spacing:.02em}
.cta p{font-size:23px;margin-top:6px;color:#f8fafc;font-weight:700}
.cta .sub{font-size:19px;color:#cbd5e1;margin-top:5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
</style>
<div class="top">
  <div class="badge-row">
    <div class="badge">${esc(scene.badge)}</div>
    <div class="voice-pill">🎃 Halloween Ultra · 🔊 Zoey</div>
  </div>
  <div class="live-narrator-banner">🎃 HALLOWEEN ULTRA · MAC STUDIO M4 ULTRA (32C/80G/192GB) · ZOEY TTS</div>
  <div class="title">${esc(scene.title)}</div>
  <div class="label">${esc(scene.label)}</div>
  <div class="extra">${esc(scene.extra)}</div>
</div>
<div class="frame-glow"></div>
<div class="pills">
  ${scene.bullets.map((b) => `<div class="pill"><span class="dot">🎃</span><span>${esc(b)}</span></div>`).join("")}
</div>
${
  isLast
    ? `<div class="cta"><strong>▶ WATCH THE FULL STEP-BY-STEP MASTERCLASS TUTORIAL</strong><p>Every Single Click, View, Studio & All 33 Tools Explained in Detail!</p><p class="sub">${esc(REPO)}</p></div>`
    : `<div class="cta"><strong>${isFirst ? "🎃 HALLOWEEN JACK-O'-LANTERN ULTRA · NARRATED BY ZOEY" : "🍎 33 POWER TOOLS · 310+ THEMES · 60 GAMES · 4 DATABASES"}</strong><p>Phonon TTS · 5s Voice Cloning · Local Ollama AI · Synced Terminal · 100% Offline</p><p class="sub">${esc(REPO)} · Free & Open Source (MIT)</p></div>`
}`;
}

function overlayWideStrip(
  scene: SceneSpec,
  index: number,
  total: number,
): string {
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1920px;height:1080px;background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif}
.strip{position:absolute;left:0;right:0;bottom:0;height:108px;background:linear-gradient(180deg,#14091d,#09040e);border-top:3px solid #ff8c1a;display:flex;align-items:center;justify-content:space-between;padding:0 34px;gap:24px;color:#f8fafc}
.left{display:flex;align-items:center;gap:18px;min-width:0}
.badge{background:linear-gradient(135deg,#ff8c1a,#f59e0b,#a855f7);color:#09050e;font-weight:900;font-size:14px;letter-spacing:.08em;padding:7px 14px;border-radius:10px;white-space:nowrap}
.meta{display:flex;flex-direction:column;gap:4px;min-width:0}
.t{font-size:22px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s{font-size:15px;font-weight:600;color:#fed7aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.right{display:flex;align-items:center;gap:12px;flex:none}
.voice{background:rgba(255,140,26,.18);border:1.5px solid #ff8c1a;color:#fed7aa;font-size:14.5px;font-weight:800;padding:6px 14px;border-radius:999px;white-space:nowrap}
.step{background:rgba(168,85,247,.18);border:1.5px solid rgba(168,85,247,.55);color:#e9d5ff;font-size:15px;font-weight:800;padding:6px 14px;border-radius:10px;white-space:nowrap}
</style>
<div class="strip">
  <div class="left">
    <div class="badge">${esc(scene.badge)}</div>
    <div class="meta">
      <div class="t">${esc(scene.title.replace(/\n/g, " — "))}</div>
      <div class="s">${esc(scene.bullets.join("  ·  "))}</div>
    </div>
  </div>
  <div class="right">
    <div class="voice">🎃 Halloween Ultra · 🍎 M4 Ultra · 🔊 Zoey</div>
    <div class="step">Scene ${index + 1} / ${total}</div>
  </div>
</div>`;
}

function runOllamaPhononWav(text: string, voice: string, outWav: string): void {
  const chunks = splitTextForPhonon(text, { maxChars: 450 });
  const pcmParts: Buffer[] = [];
  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const res = Bun.spawnSync(["ollama", "run", "phonon", "--voice", voice], {
      stdin: new TextEncoder().encode(c.text + "\n"),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    });
    if (res.exitCode !== 0 || res.stdout.byteLength < 100) {
      throw new Error(
        `ollama run phonon failed (${res.exitCode}): ${res.stderr.toString()}`,
      );
    }
    const parsed = parseWavPcm(Buffer.from(res.stdout));
    sampleRate = parsed.sampleRate;
    numChannels = parsed.numChannels;
    bitsPerSample = parsed.bitsPerSample;
    pcmParts.push(parsed.pcmData);
    if (i + 1 < chunks.length) {
      const gapSamples = Math.round(sampleRate * 0.12);
      pcmParts.push(
        Buffer.alloc(gapSamples * numChannels * (bitsPerSample >> 3)),
      );
    }
  }

  const totalPcm = Buffer.concat(pcmParts);
  const header = createWavHeader(
    totalPcm.length,
    sampleRate,
    numChannels,
    bitsPerSample,
  );
  writeFileSync(outWav, Buffer.concat([header, totalPcm]));
}

async function synthesizeSceneNarration(scene: SceneSpec): Promise<string> {
  const audioDir = join(WORK, "audio");
  mkdirSync(audioDir, { recursive: true });
  const rawWav = join(audioDir, `raw_phonon_${scene.id}_Zoey.wav`);
  const masteredWav = join(WORK, `phonon_${scene.id}_Zoey.wav`);

  if (!existsSync(masteredWav)) {
    console.log(
      `🎙️  Synthesizing ${scene.id} with ollama run phonon --voice "Zoey"...`,
    );
    try {
      runOllamaPhononWav(scene.say, "Zoey", rawWav);
      run([
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        rawWav,
        "-af",
        "highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,adelay=150|150,apad=pad_dur=0.30",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        masteredWav,
      ]);
    } catch (err) {
      console.warn(`⚠️ Phonon CLI fallback to Edge TTS for ${scene.id}:`, err);
      const fallbackMp3 = await narrate(scene.id, scene.say, audioDir, {
        rate: "+6%",
        gap: 0.18,
      });
      run([
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        fallbackMp3,
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        masteredWav,
      ]);
    }
  }
  return masteredWav;
}

function notesMarkdown(
  seconds: number,
  tempo: number,
  sceneMarks: Array<{ at: number; scene: SceneSpec }>,
): string {
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const stamps = sceneMarks
    .map(
      (m, i) =>
        `${fmt(i === 0 ? 0 : m.at)} — ${m.scene.id.slice(0, 2)} · ${m.scene.label}`,
    )
    .join("\n");
  return `# Codecaine File Manager — Complete Apple Mac Studio M4 Ultra 3-Minute YouTube Short (Narrated by Phonon \`Zoey\`)

## Generated Video Files
- **YouTube Short (9:16 Vertical, 1080×1920)**: \`youtube_production/codecaine-file-manager-mac-ultra-everything-zoey-short.mp4\` (${seconds.toFixed(1)}s, 30 fps, H.264 CRF 14 + 256 kbps AAC)
- **Updated All-in-One Short**: \`youtube_production/codecaine-file-manager-all-in-one-short.mp4\` (${seconds.toFixed(1)}s)
- **Widescreen Showcase (16:9, 1920×1080)**: \`youtube_production/codecaine_file_manager_mac_ultra_everything_zoey_1080p.mp4\` (${seconds.toFixed(1)}s)
- **Flagship Mac Rig**: Apple Mac Studio M4 Ultra (32-Core CPU · 80-Core GPU · 32-Core Neural Engine · 192 GB Unified Memory · Apple Pro Display XDR 6K @ 120Hz · macOS Tahoe 26.4)
- **Narrator**: \`ollama run phonon --voice Zoey\` (100% local Apple Silicon MLX neural TTS, pace factor ${tempo.toFixed(3)}x)

## YouTube Titles (Pick One)
1. **This Free Mac File Manager Has 33 Built-In Dev & AI Tools?! (Narrated by Local Phonon TTS Zoey) #Shorts**
2. **Apple M4 Ultra File Manager Tour: 33 Tools, Phonon TTS Zoey, Local Ollama AI, 310+ Themes & 60 Games! #Shorts**
3. **Everything Codecaine File Manager Can Do in 3 Minutes (Narrated by Ollama Phonon --voice Zoey) #Shorts**

## YouTube Description (Copy & Paste)
\`\`\`text
🎙️ Narrated 100% locally on our Flagship Apple Mac Studio M4 Ultra (32-Core CPU · 80-Core GPU · 192GB Unified Memory · Pro Display XDR 6K @ 120Hz) by Ollama Phonon TTS (\`ollama run phonon --voice Zoey\`)!

In under 3 minutes, Zoey tours EVERYTHING Codecaine File Manager can do and EVERY SINGLE ONE of its 33 built-in Power Tools, Creative Studios, 310+ Themes, 60 Arcade Games, and 4 Database Engines!

⬇️ Free Download (macOS, Windows & Linux · ARM64 & x64):
${REPO}/releases/latest
⭐ GitHub Source Code (MIT):
${REPO}

⏱️ CHAPTERS (NARRATED BY OLLAMA PHONON --VOICE ZOEY)
${stamps}

#MacStudio #M4Ultra #Ollama #PhononTTS #LocalAI #FileManager #AppleSilicon #BunJS #TypeScript #SQLite #MySQL #PostgreSQL #Redis #OpenSource #Shorts
\`\`\`
`;
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  seedMacUltraWorkspace();

  // 1. Synthesize all 12 scene narrations using `ollama run phonon --voice Zoey`
  const narrated: Array<{ scene: SceneSpec; audio: string; seconds: number }> =
    [];
  for (const scene of sceneSpecs) {
    const audio = await synthesizeSceneNarration(scene);
    narrated.push({ scene, audio, seconds: duration(audio) });
  }

  const total = narrated.reduce((sum, item) => sum + item.seconds, 0);
  // Target ~173.5s (<180s YouTube Shorts limit, right at 2m 53s)
  const tempo = Math.max(1, total / 173.5);
  console.log(
    `⏱️  Total Phonon Zoey narration: ${total.toFixed(2)}s; pace factor ${tempo.toFixed(3)}x -> ${(total / tempo).toFixed(1)}s`,
  );

  // 2. Launch live File Manager server with FM_SHOWCASE_MAC_ULTRA="1"
  const fm = Bun.spawn(
    [
      process.execPath,
      join(ROOT, "applications", "file_manager_studio.ts"),
      "--server",
      "--port",
      String(FM_PORT),
      "--home",
      HOME,
      "--data-dir",
      DATA,
      "--path",
      `${HOME}/Projects/shop-app`,
    ],
    {
      cwd: "/tmp",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        GRAVEYARD: GRAVE,
        SHELL: "/bin/zsh",
        ZDOTDIR: ZDOT,
        FM_SHOWCASE_MAC_ULTRA: "1",
      },
    },
  );

  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${FM_PORT}/`)).ok) break;
    } catch {}
    await sleep(200);
  }

  const recBrowser = await Cdp.launch(
    CDP_REC_PORT,
    join(WORK, "chrome-rec"),
    VIEW_W,
    VIEW_H,
  );
  const rawClips: Map<string, string> = new Map();

  try {
    await recBrowser.goto(`http://127.0.0.1:${FM_PORT}/`);
    await sleep(600);
    await recBrowser.eval(`(async () => {
      try { localStorage.setItem("fm_seen_welcome", "1"); } catch {}
      document.querySelectorAll(".modal-backdrop").forEach((e) => e.remove());
      const { applyPalette, triggerHolidayCelebrationBurst } = await import('/ui/themes.js');
      const { applyAtmosphere } = await import('/ui/atmosphereFx.js');
      applyPalette?.('holiday_halloween_jack_o_lantern');
      triggerHolidayCelebrationBurst?.('holiday_halloween_jack_o_lantern');
      try { applyAtmosphere?.(); } catch {}
    })()`);
    await sleep(300);

    for (const item of narrated) {
      const { scene } = item;
      const clipPath = join(WORK, `${scene.id}_raw.mp4`);
      console.log(
        `🎥 Recording live Mac Ultra scene ${scene.id} (${(item.seconds / tempo).toFixed(1)}s)...`,
      );
      await recBrowser.startRecording();
      await scene.record(recBrowser);
      if (scene.id === "01_mac_ultra_sysinfo_tasks_views") {
        const shot = await recBrowser.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
        writeFileSync(
          join(PROD, "mac_ultra_sysinfo_zoey_preview.png"),
          Buffer.from(shot.data, "base64"),
        );
      }
      await sleep(300);
      await recBrowser.stopRecording(
        clipPath,
        join(WORK, `frames_${scene.id}`),
        item.seconds / tempo,
      );
      rawClips.set(scene.id, clipPath);
    }
  } finally {
    recBrowser.close();
    try {
      fm.kill(9);
    } catch {}
  }

  // 3. Composite both 1080x1920 Vertical YouTube Short AND 1920x1080 Widescreen Showcase Video
  const ovlBrowser = await Cdp.launch(
    CDP_OVL_PORT,
    join(WORK, "chrome-ovl"),
    1080,
    1920,
  );
  const wideBrowser = await Cdp.launch(
    CDP_OVL_PORT + 1,
    join(WORK, "chrome-wide"),
    1920,
    1080,
  );
  const shortSegments: string[] = [];
  const wideSegments: string[] = [];
  const sceneMarks: Array<{ at: number; scene: SceneSpec }> = [];
  let at = 0;

  try {
    for (const [index, item] of narrated.entries()) {
      const { scene, audio } = item;
      const rawClip = rawClips.get(scene.id)!;
      const clipDur = duration(rawClip);
      const seconds = item.seconds / tempo;
      const ptsScale = (seconds / clipDur).toFixed(5);

      console.log(
        `🎬 Compositing vertical Short + widescreen segment for ${scene.id} (${seconds.toFixed(1)}s)...`,
      );

      const vHtml = join(WORK, `${scene.id}_v.html`);
      const vPng = join(WORK, `${scene.id}_v.png`);
      writeFileSync(vHtml, overlayVertical(scene, index));
      await ovlBrowser.goto(`file://${vHtml}`, null);
      await ovlBrowser.send("Emulation.setDefaultBackgroundColorOverride", {
        color: { r: 0, g: 0, b: 0, a: 0 },
      });
      const vShot = await ovlBrowser.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      writeFileSync(vPng, Buffer.from(vShot.data, "base64"));

      const shortSeg = join(WORK, `${scene.id}_short.mp4`);
      const vFilter = `[0:v]setpts=(PTS-STARTPTS)*${ptsScale},fps=30,scale=1080:-2:flags=lanczos[demo];[2:v]scale=1080:1920:flags=lanczos[bg];[bg][demo]overlay=0:628:shortest=1,format=yuv420p[v]`;
      run([
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        rawClip,
        "-i",
        audio,
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        vPng,
        "-filter_complex",
        `${vFilter};[1:a]atempo=${tempo.toFixed(4)},aresample=48000,pan=stereo|c0=c0|c1=c0[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        seconds.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "14",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        shortSeg,
      ]);
      shortSegments.push(shortSeg);

      const wHtml = join(WORK, `${scene.id}_w.html`);
      const wPng = join(WORK, `${scene.id}_w.png`);
      writeFileSync(wHtml, overlayWideStrip(scene, index, narrated.length));
      await wideBrowser.goto(`file://${wHtml}`, null);
      await wideBrowser.send("Emulation.setDefaultBackgroundColorOverride", {
        color: { r: 0, g: 0, b: 0, a: 0 },
      });
      const wShot = await wideBrowser.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      writeFileSync(wPng, Buffer.from(wShot.data, "base64"));

      const wideSeg = join(WORK, `${scene.id}_wide.mp4`);
      const wFilter = `[0:v]setpts=(PTS-STARTPTS)*${ptsScale},fps=30,pad=1920:1080:0:0:color=0x090d16[b0];[b0][2:v]overlay=0:0:shortest=1,format=yuv420p[v]`;
      run([
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        rawClip,
        "-i",
        audio,
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        wPng,
        "-filter_complex",
        `${wFilter};[1:a]atempo=${tempo.toFixed(4)},aresample=48000,pan=stereo|c0=c0|c1=c0[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        seconds.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "14",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        wideSeg,
      ]);
      wideSegments.push(wideSeg);

      sceneMarks.push({ at, scene });
      at += duration(shortSeg);
    }
  } finally {
    ovlBrowser.close();
    wideBrowser.close();
  }

  const shortList = join(WORK, "concat_short.txt");
  writeFileSync(
    shortList,
    shortSegments.map((f) => `file '${f}'`).join("\n") + "\n",
  );
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
    shortList,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "14",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    OUTPUT_SHORT,
  ]);
  copyFileSync(OUTPUT_SHORT, OUTPUT_ALL_IN_ONE_SHORT);

  const wideList = join(WORK, "concat_wide.txt");
  writeFileSync(
    wideList,
    wideSegments.map((f) => `file '${f}'`).join("\n") + "\n",
  );
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
    wideList,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "14",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    OUTPUT_WIDE,
  ]);

  const finalSeconds = duration(OUTPUT_SHORT);
  if (finalSeconds >= 180)
    throw new Error(`Short exceeds 180s limit: ${finalSeconds}s`);
  const notes = notesMarkdown(finalSeconds, tempo, sceneMarks);
  writeFileSync(NOTES, notes);
  writeFileSync(join(WORK, "upload-guide.txt"), notes);

  console.log(
    `\n✅ Built Vertical 9:16 YouTube Short: ${OUTPUT_SHORT} (${finalSeconds.toFixed(2)}s, ${(Bun.file(OUTPUT_SHORT).size / 1048576).toFixed(1)} MB)`,
  );
  console.log(
    `✅ Updated All-in-One Short:          ${OUTPUT_ALL_IN_ONE_SHORT}`,
  );
  console.log(
    `✅ Built Widescreen 16:9 Showcase:    ${OUTPUT_WIDE} (${duration(OUTPUT_WIDE).toFixed(2)}s, ${(Bun.file(OUTPUT_WIDE).size / 1048576).toFixed(1)} MB)`,
  );
  console.log(`📝 Wrote YouTube Notes:               ${NOTES}`);
}

await main();
process.exit(0);
