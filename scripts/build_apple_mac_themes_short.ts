#!/usr/bin/env bun
/**
 * Builds a brand-new, 100% live-recorded 3-Minute Apple Keynote-Grade YouTube Short
 * (1080x1920 vertical, ~2:54 / <3 minutes, 2x Retina Display-P3 super-sampled, ZERO reused clips):
 *
 *   01. Flagship Mac Studio M4 Ultra & macOS Tahoe 3D Liquid Glass + 1-Click "🍎 Optimize for Mac"
 *   02. Pro Display XDR 6K, 5K Studio Display, iMac 24 M4 Spectrum P3 & Apple Vision Spatial Glass 8K
 *   03. Year 3000+ Post-Singularity God-Mode Collection (Omega Point Singularity, Photonic 3099, Matrioshka Dyson Brain, Chrono-Crystalline)
 *   04. Random FX Finder & 1-Click Individual Effect Remover (`[data-active-fx-strip="true"]` — roll random FX & strip individual effects in 1 click)
 *   05. 120Hz ProMotion Physics: EF5 Debris Tornado, Tesla Coil Plasma, Compiz Fire Folders & 1967 Haight-Ashbury Tie-Dye
 *   06. Creating "Cupertino Titanium XDR Pro" in the Big-Screen Theme Editor (Always-Visible Top Name Bar, 40-char Auto-Fit & Visual Template Grid)
 *   07. Crafting & Saving Custom 3D Folders, Style Presets, Random FX Mix & 1-Click FX Trimming in the Theme Editor
 *   08. 6-Layer Atmospheric Shader Studio & Apple HIG Studio XDR Live CPU/GPU Telemetry Monitor (8P+8E Cores & 16-Band Spectrum)
 *   09. Split-Screen Theme Comparator, OKLab Perceptual Crossfader & 🎬 Cinema HUD Screensaver Show
 *   10. Zero-Dialog Mac Shortcuts (`⌥U`, `⌥E`, `⌥P`, `⌥0`, `⌥]`) + Universal Command Palette (`⌘⇧P`) & Smart Kind-Chips Finale
 *
 * Outputs:
 *   - youtube_production/codecaine-file-manager-apple-mac-themes-short.mp4
 *   - youtube_production/codecaine-file-manager-themes-short.mp4 (updated with fresh build)
 *   - youtube_production/APPLE_MAC_THEMES_SHORT_NOTES.md
 *   - youtube_production/apple_mac_themes_short/upload-guide.txt
 *
 * Usage:
 *   bun scripts/build_apple_mac_themes_short.ts
 */
import "./lib/tts_edge_default";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { seedDemoWorkspace } from "./lib/demo_workspace";
import { FFMPEG, FFPROBE, narrate, sh } from "./lib/video_pipeline";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const WORK = join(PROD, "apple_mac_themes_short");
const OUTPUT = join(PROD, "codecaine-file-manager-apple-mac-themes-short.mp4");
const OUTPUT_THEMES_SHORT = join(PROD, "codecaine-file-manager-themes-short.mp4");
const NOTES = join(PROD, "APPLE_MAC_THEMES_SHORT_NOTES.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";

const FM_PORT = 51689;
const CDP_REC_PORT = 9384;
const CDP_OVL_PORT = 9385;
const VIEW_W = 1920;
const VIEW_H = 972;

const ROOT_DIR = "/tmp/fm_apple_mac_short";
const HOME = process.platform === "darwin" ? "/private/tmp/fm_apple_mac_short/home" : "/tmp/fm_apple_mac_short/home";
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
  if (result.exitCode !== 0) throw new Error(`${args[0]} failed:\n${result.stderr.toString().slice(-4000)}`);
  return result.stdout.toString();
}

function duration(file: string): number {
  const value = Number(run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid duration: ${file}`);
  return value;
}

const esc = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function seedAppleMacStudioWorkspace() {
  rmSync(ROOT_DIR, { recursive: true, force: true });
  mkdirSync(ROOT_DIR, { recursive: true });
  seedDemoWorkspace(HOME, join(ROOT_DIR, "frames"));

  const studioDir = join(HOME, "Cupertino_XDR_Studio");
  mkdirSync(join(studioDir, "01_Metal4_Shaders"), { recursive: true });
  mkdirSync(join(studioDir, "02_ProRes_8K_Masters"), { recursive: true });
  mkdirSync(join(studioDir, "03_VisionOS_Spatial_Assets"), { recursive: true });
  mkdirSync(join(studioDir, "04_Dolby_Atmos_Stems"), { recursive: true });

  writeFileSync(
    join(studioDir, "M4_Ultra_Raytracer.swift"),
    `import Metal\nimport MetalKit\n\n// Apple M4 Ultra 80-Core GPU · 120Hz ProMotion Display-P3 Pipeline\npublic final class CupertinoXDRRenderer {\n  public let device = MTLCreateSystemDefaultDevice()!\n  public var targetNitLuminance: Float = 1600.0\n}\n`,
  );
  writeFileSync(
    join(studioDir, "LiquidGlass_Caustics.metal"),
    `#include <metal_stdlib>\nusing namespace metal;\n\nkernel void tahoe_liquid_glass(texture2d<half, access::write> out [[texture(0)]], uint2 gid [[thread_position_in_grid]]) {\n  out.write(half4(0.32h, 0.78h, 1.0h, 1.0h), gid);\n}\n`,
  );
  writeFileSync(
    join(studioDir, "ProDisplay_XDR_Calibration.json"),
    JSON.stringify({ display: "Apple Pro Display XDR 6K", peakNits: 1600, colorSpace: "Display-P3", refreshRateHz: 120, gpu: "Apple M4 Ultra 80-Core" }, null, 2),
  );
  writeFileSync(
    join(studioDir, "Keynote_Design_Notes.md"),
    `# Cupertino XDR Theme Architecture\n\n- **310 Built-in Themes** (168 Live 120Hz FX Themes)\n- **194 Procedural Atmospheric Shaders** (Up to 6 Simultaneous Layers)\n- **1-Click Active FX Remover** & Big-Screen Theme Designer\n`,
  );

  for (let i = 1; i <= 3; i++) {
    sh(
      [
        FFMPEG,
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=1280x800:rate=1`,
        "-frames:v",
        "1",
        "-vf",
        `hue=h=${i * 68},drawtext=text='XDR 6K Render ${i}':fontcolor=white:fontsize=88:x=(w-text_w)/2:y=(h-text_h)/2`,
        join(studioDir, `XDR_6K_Frame_0${i}.jpg`),
      ],
      { quiet: true },
    );
  }

  mkdirSync(ZDOT, { recursive: true });
  writeFileSync(
    join(ZDOT, ".zshrc"),
    `HISTFILE=${ZDOT}/.history\nPROMPT='%F{cyan}codecaine@Mac-Studio-M4-Ultra%f %F{magenta}%1~%f %% '\nRPROMPT=''\n`,
  );
}

/**
 * Injects an Apple Keynote-style floating glass callout banner inside the live recorded viewport
 * so each scene looks like an official Cupertino product film.
 */
async function showAppleKeynoteBanner(c: Cdp, title: string, subtitle: string, pill = " M4 ULTRA · 6K XDR · 120HZ") {
  await c.eval(`(() => {
    let el = document.getElementById("apple-keynote-hud");
    if (!el) {
      el = document.createElement("div");
      el.id = "apple-keynote-hud";
      el.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:22px",
        "transform:translateX(-50%)",
        "z-index:2147483645",
        "pointer-events:none",
        "display:flex",
        "align-items:center",
        "gap:16px",
        "padding:12px 24px",
        "border-radius:999px",
        "background:linear-gradient(135deg, rgba(12,16,24,0.88), rgba(24,32,48,0.86))",
        "border:1px solid rgba(255,255,255,0.24)",
        "box-shadow:0 20px 50px rgba(0,0,0,0.65), 0 0 28px rgba(56,189,248,0.28)",
        "backdrop-filter:blur(24px) saturate(190%)",
        "-webkit-backdrop-filter:blur(24px) saturate(190%)",
        "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
        "color:#f8fafc",
        "transition:opacity 0.25s ease, transform 0.25s ease"
      ].join(";");
      document.documentElement.appendChild(el);
    }
    el.innerHTML = "";
    const badge = document.createElement("span");
    badge.style.cssText = "background:linear-gradient(135deg,#38bdf8,#818cf8,#c084fc);color:#060913;font-weight:800;font-size:13px;letter-spacing:0.08em;padding:5px 12px;border-radius:999px;white-space:nowrap;";
    badge.textContent = ${JSON.stringify(pill)};
    const textWrap = document.createElement("div");
    textWrap.style.cssText = "display:flex;flex-direction:column;gap:2px;";
    const tEl = document.createElement("strong");
    tEl.style.cssText = "font-size:16px;font-weight:800;letter-spacing:-0.01em;color:#ffffff;white-space:nowrap;";
    tEl.textContent = ${JSON.stringify(title)};
    const sEl = document.createElement("span");
    sEl.style.cssText = "font-size:12.5px;font-weight:600;color:#bae6fd;white-space:nowrap;";
    sEl.textContent = ${JSON.stringify(subtitle)};
    textWrap.appendChild(tEl);
    textWrap.appendChild(sEl);
    el.appendChild(badge);
    el.appendChild(textWrap);
  })()`);
}

const sceneSpecs: SceneSpec[] = [
  {
    id: "01_mac_studio_m4_ultra_tahoe",
    badge: "01 / 10 · SHOT ON MAC STUDIO M4 ULTRA 6K XDR",
    title: "DESIGNED FOR MAC.\n310 LIVE THEMES.",
    label: " MAC STUDIO M4 ULTRA · 80-CORE GPU · 120HZ PROMOTION",
    extra: "macOS Tahoe 3D Liquid Glass, Big-Screen Gallery & 1-Click Optimize for Mac",
    bullets: [
      "🍎 1-Click Optimize for Mac (120Hz Metal 3)",
      "🧊 Mac Studio M4 Ultra Silver Vault Kit",
      "🖤 MacBook Pro 16 M4 Max Space Black Kit",
    ],
    say: "Welcome to Codecaine File Manager on macOS, running on an Apple M4 Ultra with Pro Display X D R. Open the Themes menu—with zero scroll bleed into your files—launch the expansive big-screen gallery, click Optimize for Mac, and switch between macOS Tahoe 3D Glass, Mac Studio M4 Ultra Silver Vault, and MacBook Pro Space Black.",
    record: async (c) => {
      await c.eval(`(async () => {
        const tm = await import('/ui/themes.js');
        await tm.applyJumpstartKit('macos_tahoe_3d_kit');
      })()`);
      await showAppleKeynoteBanner(c, "macOS Tahoe 3D Glass & Pictures", "3D Sculpted Regular Folders · Display-P3 Caustics · 120Hz ProMotion");
      await sleep(1100);

      // Open Themes dropdown menu first to show scroll-isolated menu, then open full Theme Gallery
      await c.click("#tool-themes", { pause: 800 });
      await showAppleKeynoteBanner(c, "Scroll-Isolated Themes Menu", "Mouse Wheel Scrolls Menu Only — Zero Pass-Through to Files");
      await sleep(700);
      await c.eval(`(async () => {
        const menus = await import('/ui/menus.js');
        menus.closeMenu?.();
        const tm = await import('/ui/themes.js');
        void tm.showThemePicker();
      })()`);
      await sleep(800);
      await c.eval(`(() => {
        const drawer = document.querySelector('[data-fx-studio-drawer="true"]');
        if (drawer) drawer.open = true;
      })()`);
      await sleep(250);

      await c.click('[data-optimize-platform="macos"]', { pause: 900 });
      await showAppleKeynoteBanner(c, "1-Click Optimize for Mac", "Metal 3 Zero-Readback Compositor · Ultra Hardware Budget");
      await c.click('[data-jumpstart-kit="mac_studio_m4_ultra_kit"]', { pause: 1300 });
      await showAppleKeynoteBanner(c, "Mac Studio M4 Ultra Silver Vault", "CNC Anodized Silver-Graphite · 3D Titanium XDR Folders");
      await c.click('[data-jumpstart-kit="macbook_pro_space_black_kit"]', { pause: 1300 });
      await showAppleKeynoteBanner(c, "MacBook Pro 16 M4 Max Space Black", "Mini-LED XDR Deep Blacks · Display-P3 Indigo Bloom");
    },
  },
  {
    id: "02_pro_display_xdr_studio_5k",
    badge: "02 / 10 · PRO DISPLAY XDR 6K & STUDIO DISPLAY 5K",
    title: "6K XDR MASTERING &\n5K STUDIO DAYLIGHT.",
    label: "🖥️ MAC PRO 6K XDR · ☀️ 5K STUDIO DISPLAY · 🥽 VISION SPATIAL 8K",
    extra: "1600-Nit Reference Mastering, 5K Nano-Texture Daylight & visionOS Glass",
    bullets: [
      "🖥️ Mac Pro Afterburner & 6K XDR (1600 Nits)",
      "☀️ Apple Studio Display 5K Daylight Reference",
      "🥽 Apple Vision Pro Spatial Glass & iMac M4 P3",
    ],
    say: "Every Apple display has a calibrated workstation profile. Try Mac Pro Afterburner with six-K X D R reference mastering, switch to Apple Studio Display five-K Daylight with nano-texture balance, or explore iMac M4 Spectrum P3 and Apple Vision Spatial Glass.",
    record: async (c) => {
      await showAppleKeynoteBanner(c, "Mac Pro Afterburner & 6K XDR", "1600-Nit Reference Mastering · PCIe Gen5 Gold Accents");
      await c.click('[data-jumpstart-kit="mac_pro_xdr_kit"]', { pause: 1400 });
      await showAppleKeynoteBanner(c, "Apple Studio Display 5K Daylight", "600-Nit 5K Retina Daylight · Nano-Texture Anti-Reflective Glass");
      await c.click('[data-jumpstart-kit="apple_studio_display_5k_kit"]', { pause: 1400 });

      await c.click('[data-collection-pill="flagship_mac_xdr"]', { pause: 900 });
      await showAppleKeynoteBanner(c, "Flagship Mac XDR Collection (10)", "iMac 24 M4 P3 · Sequoia Redwood XDR · Mac Spatial Vision 8K");
      await c.click('.theme-card[data-key="imac_m4_spectrum_p3"]', { pause: 1200 });
      await c.click('.theme-card[data-key="macos_vision_spatial_mac"]', { pause: 1300 });
    },
  },
  {
    id: "03_godmode_year_3000_singularity",
    badge: "03 / 10 · YEAR 3000+ POST-SINGULARITY GOD-MODE",
    title: "OMEGA SINGULARITY\n& PHOTONIC 3099.",
    label: "🌌 OMEGA POINT · 💎 PHOTONIC 3099 · ☀️ DYSON BRAIN · ⏳ AETHELGARD",
    extra: "12 Post-Singularity Hyper-Material Themes With 3D Crown Halos & Prism Optics",
    bullets: [
      "🌌 Omega Point Singularity (24K Gold & Violet Halo)",
      "💎 Photonic Metamaterial 3099 (Dichroic Crystal)",
      "☀️ Matrioshka Dyson Brain & Chrono-Crystalline",
    ],
    say: "Want next-century industrial design? Click the God-Mode Three Thousand collection to experience twelve post-singularity architectures: Omega Point Singularity with twenty-four-karat event-horizon halos, Photonic Metamaterial thirty-ninety-nine, Matrioshka Dyson Brain, and Chrono-Crystalline Aethelgard.",
    record: async (c) => {
      await c.click('[data-collection-pill="god_mode_3000"]', { pause: 900 });
      await showAppleKeynoteBanner(c, "Omega Point Singularity", "24K Celestial Gold & Event-Horizon Crown Halos · 4D Tesseract");
      await c.click('.theme-card[data-key="omega_point_singularity"]', { pause: 1450 });
      await showAppleKeynoteBanner(c, "Photonic Metamaterial 3099", "Negative-Index Photonic Crystal · Display-P3 Dichroic Caustics");
      await c.click('.theme-card[data-key="photonic_metamaterial_3099"]', { pause: 1450 });
      await showAppleKeynoteBanner(c, "Matrioshka Dyson Brain", "Kardashev Type-II Stellar Megastructure · Computronium Lattice");
      await c.click('.theme-card[data-key="matrioshka_dyson_brain"]', { pause: 1400 });
      await showAppleKeynoteBanner(c, "Chrono-Crystalline Aethelgard", "Time-Dilated Horological Sapphire Crystal · Retrocausal Shimmer");
      await c.click('.theme-card[data-key="chrono_crystalline_aethelgard"]', { pause: 1300 });
    },
  },
  {
    id: "04_random_fx_finder_1click_remover",
    badge: "04 / 10 · AAA 10-ENGINE DIRECTOR'S CUT, ⌥C SWAP COLORS & ⌥I ICONS",
    title: "AAA 10-ENGINE STUDIO,\n⌥C COLORS & ⌥I ICONS.",
    label: "🏆 ⌥M DIRECTOR'S CUT · 🌈 ⌥C KEEP FX SWAP COLORS · 🎭 ⌥I 49 ICON PACKS",
    extra: "6 Icon Material Finishes, 3D Desktop Stage (⌥S), 8K Wallpapers (⌥W) & 1-Click FX Remover",
    bullets: [
      "🏆 10-Engine AAA Director's Cut Switchboard (⌥M)",
      "🌈 Swap Colors Keep FX (⌥C) & 49 Icon Packs (⌥I)",
      "💎 6 Icon Material Finishes, 3D Stage (⌥S) & 8K Wallpapers",
    ],
    say: "Inside the ten-engine Triple-A Production Studio, click any Master Director's Cut preset or press Option M to orchestrate 3D Desktop Stage tilt, Ambilux backlight, 8K Wallpaper backplates, and six computer icon material finishes like 24-Karat Gold and Liquid Glass. Press Option C to swap colors while keeping your active effects, press Option I to shuffle forty-nine icon packs, or click X on any effect pill to drop it!",
    record: async (c) => {
      await c.click('[data-collection-pill="all"]', { pause: 450 });
      await showAppleKeynoteBanner(c, "AAA 10-Engine Production Studio (⌥M)", "Cupertino M4 Ultra Keynote · 3D Stage Tilt · 24K Gold & Liquid Glass Icons");
      await c.click('[data-aaa-director-preset]', { pause: 950 });
      await c.click('[data-icon-finish-pill]', { pause: 750 });
      await c.click('[data-stage-mode-pill]', { pause: 750 });
      await showAppleKeynoteBanner(c, "Keep Active FX — Swap Colors Only (⌥C) & Shuffle 49 Icons (⌥I)", "Change Theme Colors Instantly While Preserving All Shaders & 3D Folders");
      await c.click('[data-swap-color-only="dracula"]', { pause: 850 });
      await c.click('[data-picker-shuffle-icons="true"]', { pause: 850 });

      // Apply Compiz Inferno Kit so multiple distinct FX pills are clearly visible, then remove individual pills
      await c.eval(`(async () => {
        const tm = await import('/ui/themes.js');
        await tm.applyWorkspaceStageMode('off', { quiet: true });
        await tm.applyJumpstartKit('compiz_inferno_kit');
      })()`);
      await c.click('.theme-card[data-key="inferno_fire_folders"]', { pause: 750 });
      await showAppleKeynoteBanner(c, "1-Click Individual Effect Removal", "Click ✕ on Any Active FX Pill to Strip Only What You Don't Want");
      await c.click('[data-remove-active-fx="uiElementFx"]', { pause: 850 });
    },
  },
  {
    id: "05_extreme_120hz_storms_tiedye",
    badge: "05 / 10 · 18 ANIMATED HOLIDAY BURSTS (⌥H), TORNADO & TIE-DYE",
    title: "18 HOLIDAY BURSTS (⌥H),\nEF5 TORNADO & TIE-DYE.",
    label: "🎆 ⌥H 18 HOLIDAY CELEBRATIONS · 🌪️ EF5 TORNADO · 🔥 COMPIZ · 🌈 MANDALA",
    extra: "Interactive Holiday Firework & Confetti Bursts, Custom Holiday Crests & 120Hz Physics",
    bullets: [
      "🎆 18 Animated US Holiday Themes + Particle Bursts (⌥H)",
      "🌪️ EF5 Tornado Debris & Compiz Blazing Fire Folders",
      "🌈 Kaleidoscope Fractal Mandala & '67 Tie-Dye",
    ],
    say: "Celebrate all eighteen U S Holidays with bespoke multi-layer animations, custom 3D folder holiday crests, and interactive firework, confetti, snow, and shamrock celebration bursts via Option H! Then push Apple Silicon's eighty-core G P U with E F 5 Tornado Debris, Compiz Fire Folders, and Kaleidoscope Fractal Mandala.",
    record: async (c) => {
      await showAppleKeynoteBanner(c, "18 Animated US Holiday Themes & Particle Bursts (⌥H)", "Custom Folder Holiday Crests · Fireworks, Snowflakes & Confetti Finale");
      await c.click('[data-holiday-pill="holiday_fourth_of_july_fireworks"]', { pause: 1200 });
      await c.click('[data-holiday-pill="holiday_christmas_nutcracker_hearth"]', { pause: 1200 });
      await showAppleKeynoteBanner(c, "EF5 Tornado & 3D Storm Debris", "Tumbling Leaves, Newspapers & Wind-Buffeted Folders at 120Hz");
      await c.click('[data-jumpstart-kit="storm_overdrive_kit"]', { pause: 1300 });
      await showAppleKeynoteBanner(c, "Compiz Fire Folders & Kaleidoscope Mandala", "Blazing Molten Folders, Inferno Icons & 11D Prism Refraction");
      await c.click('[data-jumpstart-kit="compiz_inferno_kit"]', { pause: 1200 });
      await c.click('[data-jumpstart-kit="kaleidoscope_trip_kit"]', { pause: 1200 });
    },
  },
  {
    id: "06_create_theme_identity_bar_templates",
    badge: "06 / 10 · BIG-SCREEN THEME DESIGNER & TEMPLATES",
    title: "CREATE YOUR OWN\nAPPLE MASTERPIECE.",
    label: "🏷️ STICKY NAME BAR (N/40) · 🖼️ VISUAL STARTING TEMPLATES GRID",
    extra: "Always-Visible Name Input, Automatic 40-Char Fit & Big-Screen Template Grid",
    bullets: [
      "🏷️ Always-Visible Top Name Input + Live 40-Char Badge",
      "🖼️ Visual Starting Templates Grid (310 Templates)",
      "✨ Auto-Fits Long Template Names to <= 40 Letters",
    ],
    say: "Now let's create our own custom Mac theme in the redesigned big-screen Theme Editor. The Theme Name input and live forty-character counter stay pinned right at the top—and starting from any template automatically fits the name so it never overflows forty letters. Browse the visual Starting Templates grid, filter to F X templates, and name your creation Cupertino Titanium X D R Pro.",
    record: async (c) => {
      await c.eval(`(async () => {
        document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
        const ed = await import('/ui/themeEditor.js');
        void ed.openEditor({ from: 'mac_studio_m4_ultra' });
      })()`);
      await sleep(900);
      await showAppleKeynoteBanner(c, "Always-Visible Theme Name & Active FX Bar", "Pinned at the Top of the Big-Screen Editor · Auto-Clamped to 40 Chars");

      // Filter visual template browser grid to FX templates and click template cards
      await c.click('[data-editor-template-filter="fx"]', { pause: 900 });
      await c.click('[data-editor-template-card="tahoe_liquid_glass"], [data-editor-template-card]', { pause: 1000 });
      await showAppleKeynoteBanner(c, "40-Character Auto-Fit Name Guard", "Long Template Names Automatically Fit <= 40 Characters Cleanly");
      await c.click('[data-prebuilt-picture="godmode_photonic_3099_scene"], [data-editor-template-card]', { pause: 900 });

      // Type custom name "Cupertino Titanium XDR Pro" into the always-visible top name input
      await c.eval(`(() => {
        const inp = document.querySelector('.theme-editor [aria-label="Theme name"]');
        if (inp) {
          inp.focus();
          inp.value = "Cupertino Titanium XDR Pro";
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        }
      })()`);
      await showAppleKeynoteBanner(c, 'Custom Name: "Cupertino Titanium XDR Pro"', "26 / 40 Characters · Live Preview Updates Across Window");
      await sleep(1200);
    },
  },
  {
    id: "07_custom_theme_presets_fx_save",
    badge: "07 / 10 · 1-CLICK STYLE PRESETS, FX MIX & SAVE",
    title: "CUSTOM 3D FOLDERS,\nFX MIX & 1-CLICK SAVE.",
    label: "⚡ GOD-MODE STYLE PRESET · 🎲 RANDOM FX MIX · ✕ TRIM FX · 💾 SAVE",
    extra: "Mix Shaders, Remove Unwanted Effects in 1 Click & Save to My Themes",
    bullets: [
      "⚡ Apply God-Mode Photonic & Tahoe Style Presets",
      "🎲 Roll Random FX Mix & Click ✕ on Unwanted FX",
      "💾 Save 'Cupertino Titanium XDR Pro' Instantly",
    ],
    say: "Switch across any editor tab—your Theme Name and Active Effects bar stay visible at the top. Apply a God-Mode style preset, click Roll Random F X Mix to layer atmospheric shaders, click X on any effect pill you want to remove, and click Save Theme to apply Cupertino Titanium X D R Pro across your Mac!",
    record: async (c) => {
      await c.click('[data-editor-focus-tab="effects"]', { pause: 800 });
      await showAppleKeynoteBanner(c, "Section 3: Glass, 3D & Folder FX", "Top Identity & Name Bar Stays Pinned While Switching Tabs");
      await c.click('[data-fx-preset="godmode_photonic_3099"]', { pause: 1000 });

      await c.click('[data-editor-random-fx-mix="true"]', { pause: 1000 });
      await showAppleKeynoteBanner(c, "1-Click FX Trimming Inside Theme Editor", "Roll Random FX Mix -> Click ✕ to Drop Any Single Effect");
      await c.click('[data-editor-remove-fx="iconPackStyle"]', { pause: 900 });

      // Ensure signature Apple XDR look before saving
      await c.eval(`(() => {
        const uiSel = document.querySelector('[aria-label="Folder & toolbar shader"]');
        if (uiSel) { uiSel.value = "xdr_titanium_folders"; uiSel.dispatchEvent(new Event("change", { bubbles: true })); }
        const icSel = document.querySelector('[aria-label="Custom icon pack"]');
        if (icSel) { icSel.value = "pro_studio_xdr"; icSel.dispatchEvent(new Event("change", { bubbles: true })); }
      })()`);
      await sleep(600);

      await c.eval(`(() => {
        const btn = [...document.querySelectorAll(".modal-backdrop button")].find((b) => b.textContent.trim() === "Save theme" || b.textContent.trim() === "Save");
        btn?.click();
      })()`);
      await showAppleKeynoteBanner(c, 'Saved "Cupertino Titanium XDR Pro"!', "Listed First Under My Themes · Active Across File Manager & Terminal");
      await sleep(1400);
    },
  },
  {
    id: "08_atmosphere_6layer_vfd_telemetry",
    badge: "08 / 10 · 6-LAYER SHADER MIXER & VFD TELEMETRY",
    title: "6-LAYER SHADERS &\nAPPLE HIG TELEMETRY.",
    label: "🌌 194 PROCEDURAL SHADERS · 📟 P/E CORES & 16-BAND SPECTRUM",
    extra: "Combine Up to 6 Simultaneous Shaders + Live Apple HIG Studio XDR Telemetry",
    bullets: [
      "🌌 Mix Up to 6 Simultaneous 120Hz GPU Shaders",
      "📟 Live 8 P-Core + 8 E-Core + 8 GPU Core Bars",
      "📊 16-Band Shader Spectrum & 0% GPU Eco Shedder",
    ],
    say: "Open the Atmospheric Special Effects Studio to layer up to six simultaneous one-hundred-and-twenty-Hertz shaders—like Liquid Glass Caustics, M4 Raytrace Prism, and Aurora—and step through live mixes. Then pop out the live Hardware Telemetry Monitor in Apple H I G Studio X D R mode to watch all eight P-cores, eight E-cores, and the sixteen-band shader spectrum in real time.",
    record: async (c) => {
      await c.eval(`(async () => {
        const st = await import('/ui/state.js');
        st.emit('atmosphere-picker');
      })()`);
      await sleep(900);
      await showAppleKeynoteBanner(c, "6-Layer Atmospheric Special Effects Studio", "194 Procedural Shaders · Per-Layer Hue, Speed & Opacity");
      await c.click('[data-atmo-step="1"]', { pause: 900 });
      await c.eval(`(() => {
        document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove());
      })()`);
      await sleep(400);

      await c.eval(`(async () => {
        const tm = await import('/ui/themes.js');
        await tm.showTelemetryPopoutHud();
      })()`);
      await sleep(900);
      await showAppleKeynoteBanner(c, "Live CPU & GPU Hardware Telemetry HUD", "8 P-Cores · 8 E-Cores · 8 GPU Shader Cores · Dual-Trace Scope");
      await c.click('[data-telemetry-phosphor-btn="cupertino_hig"]', { pause: 900 });
      await c.click('[data-telemetry-skin-btn="winamp_spectrum"]', { pause: 1000 });
      await c.click('[data-telemetry-skin-btn="quadrant_gauges"]', { pause: 950 });
      await c.eval(`(async () => {
        const tm = await import('/ui/themes.js');
        tm.closeTelemetryPopoutHud?.();
      })()`);
      await sleep(400);
    },
  },
  {
    id: "09_split_comparator_oklab_screensaver",
    badge: "09 / 10 · SPLIT COMPARATOR, OKLAB & SCREENSAVER",
    title: "SPLIT WIPE, OKLAB\n& 120HZ SCREENSAVER.",
    label: "⚖️ SPLIT-SCREEN COMPARATOR · 🧬 OKLAB BLEND · 🎬 CINEMA HUD SHOW",
    extra: "Compare Any 2 Themes Side-by-Side, Crossfade in OKLab & Launch Theme Show",
    bullets: [
      "⚖️ Interactive Split-Screen Theme Wipe Slider",
      "🧬 Perceptual OKLab Color & Shader Crossfader",
      "🎬 Full-Bleed 120Hz Cinema HUD Screensaver Show",
    ],
    say: "Want to compare two themes side by side? Open the Split-Screen Comparator to drag a live wipe slider between Mac Studio M4 Ultra and Omega Point Singularity, or crossfade them in perceptual O K Lab color space. You can even turn your Mac into a living one-hundred-and-twenty-Hertz Cinema Screensaver showcase.",
    record: async (c) => {
      await c.eval(`(async () => {
        const tm = await import('/ui/themes.js');
        void tm.showThemeCompareDialog(undefined, 'mac_studio_m4_ultra', 'omega_point_singularity');
      })()`);
      await sleep(1000);
      await showAppleKeynoteBanner(c, "Side-by-Side Split-Screen Comparator", "Mac Studio M4 Ultra vs. Omega Point Singularity · Live Wipe");
      await c.eval(`(() => {
        const slider = document.querySelector('[data-compare-split]');
        if (slider) {
          slider.value = "28"; slider.dispatchEvent(new Event("input", { bubbles: true }));
          setTimeout(() => { slider.value = "74"; slider.dispatchEvent(new Event("input", { bubbles: true })); }, 550);
        }
      })()`);
      await sleep(1300);
      await c.click('[data-preview-blend="true"]', { pause: 900 });
      await c.eval(`(() => { document.querySelectorAll('.modal-backdrop').forEach((e) => e.remove()); })()`);
      await sleep(400);

      // Launch 🎬 Theme Show in Cinema HUD mode briefly
      await c.eval(`(async () => {
        const tm = await import('/ui/themes.js');
        await tm.startThemeShow({ mode: 'cinema_hud', channel: 'all_ultra', intervalSec: 8, boostTier: 'extreme', showClock: true });
      })()`);
      await showAppleKeynoteBanner(c, "🎬 120Hz Cinema HUD Screensaver Show", "Full-Bleed M4 Ultra Showcase With Ambient Glass Clock & Telemetry");
      await sleep(1700);
      await c.eval(`(() => {
        document.querySelector('[data-theme-show-exit]')?.click();
        document.getElementById('fm-theme-show-overlay')?.remove();
      })()`);
      await sleep(400);
    },
  },
  {
    id: "10_mac_hotkeys_command_palette_cta",
    badge: "10 / 10 · ⌥3 3D SPIN & FLASH 3000, ⌥F CRT, ⌥T TRAILS & ⌘⇧P",
    title: "⌥3 3D SPIN & FLASH,\n⌥F CRT & ⌥T TRAILS.",
    label: "💿 ⌥3 3D FOLDERS · 📺 ⌥F 34 FILTERS · 🌠 ⌥T CURSOR TRAILS · 🏆 ⌥M",
    extra: "3D Spinning Folders, Flash 2Advanced 3000, 34 Screen Filters & Cursor Trails",
    bullets: [
      "💿 ⌥3 3D Spinning Folders, Flash 3000 & C4D MoGraph",
      "📺 ⌥F 34 Screen Filters (Trinitron CRT, ACEScct, VHS)",
      "🌠 ⌥T Cursor Trails · 🎆 ⌥H Holiday Burst · 🏆 ⌥M",
    ],
    say: "On high-end Macs, press Option 3 to cycle fourteen one-hundred-and-twenty-Hertz 3D folder and motion-designer animations—including 3D Spinning Folder Turntables and Futuristic Flash Two-Advanced Vector H U D. Press Option F for thirty-four screen filters like Sony Trinitron C R T, Option T for holographic cursor trails, Option H for holiday firework bursts, or Command Shift P for the Universal Command Palette. Download Codecaine File Manager v1.5.0 free on GitHub today!",
    record: async (c) => {
      const fireAltKey = async (label: string, key: string, code: string) => {
        await c.eval(`window.__cc.keys(${JSON.stringify([label])})`);
        await c.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, altKey: true, bubbles: true }))`);
        await sleep(780);
      };
      await showAppleKeynoteBanner(c, "High-End 3D Folders, Flash 3000 & C4D MoGraph (⌥3)", "3D Spinning Folder Turntable · 2Advanced Vector HUD · C4D Step-Effector");
      await fireAltKey("⌥ + 3  (3D Spinning Folder Turntable)", "3", "Digit3");
      await fireAltKey("⌥ + 3  (Futuristic Flash 2Advanced HUD)", "3", "Digit3");

      await showAppleKeynoteBanner(c, "34 Screen Filters (⌥F), Cursor Trails (⌥T) & Holiday Burst (⌥H)", "Sony Trinitron CRT '95 · Holographic Cursor Spotlight · Holiday Fireworks");
      await fireAltKey("⌥ + F  (Sony Trinitron CRT '95 Filter)", "f", "KeyF");
      await fireAltKey("⌥ + T  (Holographic Cursor Trail)", "t", "KeyT");
      await fireAltKey("⌥ + H  (Holiday Celebration Burst)", "h", "KeyH");

      // Clear screen filter, apply Cupertino M4 Ultra Keynote Director's Cut and open Command Palette (⌘⇧P)
      await c.eval(`(async () => {
        const tm = await import('/ui/themes.js');
        await tm.applyScreenFilter('off', { quiet: true });
        await tm.applyAaaDirectorCutPreset(tm.AAA_DIRECTOR_CUT_PRESETS[0].id, { quiet: true });
        const cp = await import('/ui/commandPalette.js');
        cp.openCommandPalette?.("");
      })()`);
      await showAppleKeynoteBanner(c, "Universal Command Palette (⌘⇧P) — v1.5.0 AAA Release", "Search Actions, Starter Templates, Places, Tools & 310 Themes");
      await sleep(1400);
    },
  },
];

function overlay(scene: SceneSpec, index: number): string {
  const isLast = index === sceneSpecs.length - 1;
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{
  background:
    radial-gradient(980px 580px at 50% -4%, rgba(56,189,248,0.28), transparent 70%),
    radial-gradient(820px 520px at 85% 100%, rgba(168,85,247,0.24), transparent 70%),
  #05070c;
  color:#f8fafc;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",sans-serif;
}
.top{position:absolute;top:48px;left:44px;right:44px;display:flex;flex-direction:column;gap:12px}
.hw-strip{
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(15,23,42,0.78);border:1px solid rgba(255,255,255,0.18);
  border-radius:999px;padding:7px 18px;font-size:17px;font-weight:700;color:#e2e8f0;
  box-shadow:0 8px 24px rgba(0,0,0,0.45);
}
.hw-strip .apple-chip{color:#38bdf8;font-weight:800;letter-spacing:0.04em}
.badge{
  align-self:flex-start;
  background:linear-gradient(135deg,#38bdf8,#6366f1,#c084fc);
  color:#05070c;font-weight:900;font-size:21px;letter-spacing:.1em;
  padding:7px 18px;border-radius:999px;text-transform:uppercase;
}
.title{
  font-size:62px;font-weight:900;line-height:1.03;letter-spacing:-.025em;white-space:pre-line;
  background:linear-gradient(92deg,#ffffff 0%,#e0f2fe 48%,#c4b5fd 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.label{color:#38bdf8;font-size:24px;font-weight:800;letter-spacing:.03em;margin-top:2px}
.extra{color:#cbd5e1;font-size:22px;font-weight:600;line-height:1.34}
.frame-rim{
  position:absolute;top:626px;left:0;width:1080px;height:554px;
  border-top:2px solid rgba(56,189,248,0.45);
  border-bottom:2px solid rgba(168,85,247,0.45);
  box-shadow:0 0 60px rgba(56,189,248,0.18);
  pointer-events:none;
}
.pills{position:absolute;top:1215px;left:44px;right:44px;display:flex;flex-direction:column;gap:14px}
.pill{
  background:linear-gradient(135deg,rgba(15,23,42,0.92),rgba(17,24,39,0.88));
  border:1px solid rgba(255,255,255,0.18);border-left:6px solid #38bdf8;
  border-radius:16px;padding:16px 22px;font-size:25px;font-weight:700;color:#f1f5f9;
  display:flex;align-items:center;gap:14px;
  box-shadow:0 12px 28px rgba(0,0,0,0.45);
}
.dot{color:#38bdf8;font-weight:900;font-size:26px}
.cta{
  position:absolute;top:1505px;left:36px;right:36px;
  background:linear-gradient(135deg,rgba(12,24,48,0.96),rgba(24,16,48,0.96));
  border:1.5px solid rgba(56,189,248,0.65);border-radius:22px;padding:24px 28px;
  box-shadow:0 20px 48px rgba(0,0,0,0.72);
}
.cta strong{font-size:28px;color:#7dd3fc;display:block;letter-spacing:.02em}
.cta p{font-size:23px;margin-top:8px;color:#f8fafc;font-weight:600}
.cta .sub{font-size:20px;color:#94a3b8;margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
</style>
<div class="top">
  <div class="hw-strip">
    <span class="apple-chip"> MAC STUDIO M4 ULTRA · 80-CORE GPU · 192GB</span>
    <span>PRO DISPLAY XDR 6K · 120HZ PROMOTION</span>
  </div>
  <div class="badge">${esc(scene.badge)}</div>
  <div class="title">${esc(scene.title)}</div>
  <div class="label">${esc(scene.label)}</div>
  <div class="extra">${esc(scene.extra)}</div>
</div>
<div class="frame-rim"></div>
<div class="pills">
  ${scene.bullets.map((b) => `<div class="pill"><span class="dot"></span><span>${esc(b)}</span></div>`).join("")}
</div>
${
  isLast
    ? `<div class="cta"><strong>▶ FREE DOWNLOAD FOR MAC, WINDOWS &amp; LINUX</strong><p>310 Themes · 10 AAA Engines · 194 Live 120Hz Shaders · 34 Screen Filters</p><p class="sub">${esc(REPO)}/releases/tag/v1.5.0</p></div>`
    : `<div class="cta"><strong>▶ CODECAINE FILE MANAGER — AAA 10-ENGINE EDITION (v1.5.0)</strong><p>18 Holiday Celebrations (⌥H) · 3D Spin &amp; Flash 3000 (⌥3) · 34 Filters (⌥F)</p><p class="sub">${esc(REPO)}/releases/latest · MIT Open Source</p></div>`
}`;
}

function notesMarkdown(seconds: number, tempo: number, sceneMarks: Array<{ at: number; scene: SceneSpec }>): string {
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const stamps = sceneMarks.map((m, i) => `${fmt(i === 0 ? 0 : m.at)} ${m.scene.label}`).join("\n");
  return `# Codecaine File Manager v1.5.0 on Mac Studio M4 Ultra 6K XDR — AAA 10-Engine Theme Studio, 18 Holiday Celebrations & 120Hz Shaders (Short, ${fmt(seconds)})

## Video Files (100% Freshly Recorded at Highest Quality CRF 14, Zero Reused Clips)

- **Apple Mac Keynote Short MP4 (< 3 min)**: \`youtube_production/codecaine-file-manager-apple-mac-themes-short.mp4\` (${seconds.toFixed(1)}s, 1080×1920 vertical, 30 fps, 2x Retina Display-P3 super-sampled, CRF 14 / 256k AAC)
- **Themes Short Mirror MP4**: \`youtube_production/codecaine-file-manager-themes-short.mp4\`

## YouTube Short Titles (Pick One)

1. **If Apple Made a 120Hz AAA Theme Engine: Mac Studio M4 Ultra 6K XDR & 310 Themes! 🍎✨ #Shorts**
2. **Codecaine File Manager v1.5.0: 10 AAA Engines, 18 Animated Holidays & 3D Spinning Folders #Shorts**
3. **Mac Studio M4 Ultra File Manager: Tahoe 3D Glass, Flash 2Advanced 3000 & 34 Screen Filters #Shorts**

## YouTube Short Description (< 5,000 chars, Copy & Paste)

\`\`\`text
Recorded 100% live from scratch at master quality (2x Retina Display-P3 HDR · CRF 14) on a flagship Mac Studio M4 Ultra (80-Core GPU · 192GB Unified Memory · Pro Display XDR 6K · 120Hz ProMotion): experience the v1.5.0 AAA 10-Engine Production Studio, 18 Super-Special Animated US Holiday Themes with particle bursts (⌥H), 14 High-End 3D Folder & Flash 2Advanced 3000 animations (⌥3), 34 CRT/Cinema/VFX Screen Filters (⌥F), Keep FX Color Swap (⌥C), 49 System Icon Packs (⌥I), and 8 Master Director's Cut presets (⌥M)!

⬇️ Free Download for macOS (Apple Silicon & Intel), Windows (x64 & ARM64) & Linux:
${REPO}/releases/tag/v1.5.0
⭐ Source Code (MIT Open Source):
${REPO}

TIMESTAMPS
${stamps}

#MacStudio #M4Ultra #macOS #AppleSilicon #ProDisplayXDR #FileManager #UIUX #Themes #Shaders #DeveloperTools #OpenSource #Bun #TypeScript #Shorts
\`\`\`
`;
}

async function main() {
  // Always wipe WORK completely so ZERO old clips or audio are ever reused!
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  seedAppleMacStudioWorkspace();

  // 1. Generate fresh voice narration for all 10 scenes
  const narrated: Array<{ scene: SceneSpec; audio: string; seconds: number }> = [];
  for (const scene of sceneSpecs) {
    console.log(`🎙️  Narrating ${scene.id}...`);
    const narration = await narrate(scene.id, scene.say, join(WORK, "audio"), { rate: "+4%", gap: 0.22 });
    const audio = join(WORK, `${scene.id}.wav`);
    const seconds = Math.max(4.0, duration(narration) - 0.85);
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
  // Target ~172-176s (< 180s 3-minute YouTube Short cap)
  const tempo = Math.max(1, total / 173);
  console.log(`⏱️  Total narration ${total.toFixed(2)}s; pace factor ${tempo.toFixed(3)}x -> target ${(total / tempo).toFixed(1)}s`);

  // 2. Start live File Manager server and record every scene fresh in 2x Retina Display-P3 (1920x972 @ 2x DPR)
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
      `${HOME}/Cupertino_XDR_Studio`,
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
      },
    },
  );

  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${FM_PORT}/`)).ok) break;
    } catch {}
    await sleep(200);
  }

  const recBrowser = await Cdp.launch(CDP_REC_PORT, join(WORK, "chrome-rec"), VIEW_W, VIEW_H);
  const rawClips: Map<string, string> = new Map();

  try {
    await recBrowser.goto(`http://127.0.0.1:${FM_PORT}/`);
    await sleep(900);
    await recBrowser.eval(`(() => {
      try { localStorage.setItem("fm_seen_welcome", "1"); } catch {}
      const startBtn = [...document.querySelectorAll(".modal-backdrop button")].find((b) => b.textContent.trim() === "Start");
      startBtn?.click();
      document.querySelectorAll(".modal-backdrop").forEach((e) => e.remove());
    })()`);
    await sleep(400);
    for (const item of narrated) {
      const { scene } = item;
      const clipPath = join(WORK, `${scene.id}_raw.mp4`);
      console.log(`🎥 Recording fresh live scene ${scene.id}...`);
      await recBrowser.startRecording();
      await scene.record(recBrowser);
      await sleep(350);
      await recBrowser.stopRecording(clipPath, join(WORK, `frames_${scene.id}`), item.seconds / tempo);
      rawClips.set(scene.id, clipPath);
    }
  } finally {
    recBrowser.close();
    try {
      fm.kill(9);
    } catch {}
  }

  // 3. Render vertical 1080x1920 Apple Keynote overlays and composite each segment
  const ovlBrowser = await Cdp.launch(CDP_OVL_PORT, join(WORK, "chrome-ovl"), 1080, 1920);
  const segments: string[] = [];
  const sceneMarks: Array<{ at: number; scene: SceneSpec }> = [];
  let at = 0;

  try {
    for (const [index, item] of narrated.entries()) {
      const { scene, audio } = item;
      const rawClip = rawClips.get(scene.id)!;
      const clipDur = duration(rawClip);
      const seconds = item.seconds / tempo;

      console.log(`🎬 Compositing ${scene.id} (${seconds.toFixed(1)}s)...`);
      const html = join(WORK, `${scene.id}.html`);
      const png = join(WORK, `${scene.id}.png`);
      writeFileSync(html, overlay(scene, index));
      await ovlBrowser.goto(`file://${html}`, null);
      await ovlBrowser.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const screenshot = await ovlBrowser.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      writeFileSync(png, Buffer.from(screenshot.data, "base64"));

      const segment = join(WORK, `${scene.id}.mp4`);
      const ptsScale = (seconds / clipDur).toFixed(5);
      const filter = `[0:v]setpts=(PTS-STARTPTS)*${ptsScale},fps=30,scale=1080:-2:flags=lanczos[demo];[2:v]scale=1080:1920:flags=lanczos[bg];[bg][demo]overlay=0:628:shortest=1,format=yuv420p[v]`;

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
        png,
        "-filter_complex",
        `${filter};[1:a]atempo=${tempo.toFixed(4)},aresample=48000,pan=stereo|c0=c0|c1=c0[a]`,
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
        segment,
      ]);
      sceneMarks.push({ at, scene });
      at += duration(segment);
      segments.push(segment);
    }
  } finally {
    ovlBrowser.close();
  }

  const list = join(WORK, "concat.txt");
  writeFileSync(list, segments.map((file) => `file '${file}'`).join("\n") + "\n");
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
    OUTPUT,
  ]);

  copyFileSync(OUTPUT, OUTPUT_THEMES_SHORT);

  const finalSeconds = duration(OUTPUT);
  const notes = notesMarkdown(finalSeconds, tempo, sceneMarks);
  writeFileSync(NOTES, notes);
  writeFileSync(join(WORK, "upload-guide.txt"), notes);
  console.log(`✅ Built fresh Apple Mac Keynote Short: ${OUTPUT} (${finalSeconds.toFixed(2)}s)`);
  console.log(`✅ Updated ${OUTPUT_THEMES_SHORT}`);
  console.log(`📝 Wrote ${NOTES}`);
}

await main();
process.exit(0);
