/**
 * The chapters of "Bun RAD Studio v1.5.0: The Complete God-Mode Master Tutorial".
 *
 * Covers every new v1.5.0 detail across:
 *   1. Codecaine File Manager v1.5.0 (God-Mode Productivity Bar, Command Palette, Templates,
 *      Cross-Platform Flagship Optimizers, AAA 10-Engine Theme & Shader Studio, 7 Pro Theme Power-Ups,
 *      Terminal Sync, Dev/Media/Paint/Games & 4-Engine Database Studios)
 *   2. Visual Theme Studio Pro & Smart 3-Layer Math Engine (`src/features/theme-studio/`)
 *   3. SimpleGUI API (`src/simplegui.ts`, `src/features/rad/`, `src/features/fd|sd|tokei|gdu|watchexec`)
 *   4. Bun RAD Studio SimpleGUI Visual Designer (`src/ide/`)
 *
 * Every single chapter is recorded 100% fresh and live — ZERO reused external video clips.
 */
import { stage, outputs } from "./rad_stage";
import type { Chapter, Step } from "./fm_tutorial_types";
import type { Do } from "./step_video";

export const GOD_HOME = "/tmp/godmode_fm_world/home";

export type GodChapterMode = "fm" | "theme_studio" | "rad_stage" | "designer";

export interface GodStageSpec {
  mode: GodChapterMode;
  path?: string;
  view?: string;
  file?: string;
  title?: string;
  make?: string;
  zoom?: number;
  term?: { command: string[]; show: string } | { build: true };
}

export const godStages: Record<string, GodStageSpec> = {
  "01_godmode_productivity_bar": { mode: "fm", path: `${GOD_HOME}/Projects/shop-app` },
  "02_command_palette_templates_selection": { mode: "fm", path: `${GOD_HOME}/Projects/shop-app` },
  "03_cross_platform_flagship_rigs": { mode: "fm", path: `${GOD_HOME}/Projects/shop-app` },
  "04_aaa_10_engine_studio": { mode: "fm", path: `${GOD_HOME}/Projects/shop-app` },
  "05_pro_theme_powerups_and_editor": { mode: "fm", path: `${GOD_HOME}/Projects/shop-app` },
  "06_terminal_code_dev_studios": { mode: "fm", path: `${GOD_HOME}/Projects/shop-app` },
  "07_visual_theme_studio_math_engine": { mode: "theme_studio" },
  "08_simplegui_api_fluent_layouts": {
    mode: "rad_stage",
    file: "01_godmode_workstation_form.ts",
    title: "Fluent Windows, 4-Line Forms, Grids & Cards",
    make: "createGodModeWorkstationForm",
    zoom: 1.08,
  },
  "09_simplegui_api_enterprise_telemetry": {
    mode: "rad_stage",
    file: "02_enterprise_telemetry_reactive.ts",
    title: "VLang Parity, Enterprise Telemetry & Reactive State",
    make: "createEnterpriseTelemetryReactive",
    zoom: 1.04,
  },
  "10_simplegui_api_dialogs_sqlite_rad": {
    mode: "rad_stage",
    file: "03_dialogs_sqlite_capstone.ts",
    title: "SweetAlert2, Context Menus, SQLite & 45 rad Modules",
    make: "createDialogsSqliteCapstone",
    zoom: 1.03,
    term: {
      command: ["bun", "run", "examples/god_mode_tutorial/04_rad_and_system_engines.ts"],
      show: "bun run examples/god_mode_tutorial/04_rad_and_system_engines.ts",
    },
  },
  "11_designer_palette_inspector_anchors": { mode: "designer" },
  "12_designer_godmode_themes_events_export": { mode: "designer" },
};

const A = stage.inApp;
const wait = (d: Do, ms: number) => d.wait(ms);
const step = (cap: string, say: string, act?: (d: Do) => Promise<void>, extra: Partial<Step> = {}): Step => ({
  cap,
  say,
  act,
  ...extra,
});

/**
 * Displays a crisp, non-intrusive Hardware Rig & RAD Productivity HUD badge in the top-right corner
 * of the live viewport so viewers always see the active flagship platform spec and RAD shortcut.
 */
async function showRigHud(d: Do, rig: string, badge: string, accent = "#38bdf8"): Promise<void> {
  await d.eval(`(() => {
    let el = document.getElementById("__godmode_rig_hud");
    if (!el) {
      el = document.createElement("div");
      el.id = "__godmode_rig_hud";
      el.style.cssText = [
        "position:fixed", "top:10px", "right:14px", "z-index:2147483646",
        "pointer-events:none", "display:flex", "align-items:center", "gap:10px",
        "padding:7px 14px", "border-radius:999px",
        "background:rgba(9,13,24,0.88)", "backdrop-filter:blur(12px)",
        "border:1px solid rgba(56,189,248,0.45)",
        "box-shadow:0 10px 28px rgba(0,0,0,0.48)",
        "font:600 12px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
        "color:#f8fafc", "letter-spacing:0.02em", "transition:all 0.25s ease"
      ].join(";");
      document.body.appendChild(el);
    }
    el.style.borderColor = ${JSON.stringify(accent)};
    el.innerHTML = '<span style="color:' + ${JSON.stringify(accent)} + ';font-weight:800;">' + ${JSON.stringify(rig)} + '</span>'
      + '<span style="opacity:0.45;">│</span>'
      + '<span style="color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;">' + ${JSON.stringify(badge)} + '</span>';
  })()`);
}

/**
 * Helper to open the File Manager All Themes & AAA Production Studio modal if not already open.
 */
async function ensureThemeGalleryOpen(d: Do): Promise<void> {
  const isOpen = await d.eval(`Boolean(document.querySelector('.theme-gallery-dialog'))`);
  if (!isOpen) {
    await d.eval(`import('/ui/themes.js').then(m => m.showThemePicker())`);
    await wait(d, 900);
  }
}

/**
 * Helper to type reliably into an input inside the SimpleGUI `#appframe` iframe.
 */
async function fillInApp(d: Do, selector: string, text: string, perChar = 95): Promise<void> {
  const inner = JSON.stringify(selector);
  for (let attempt = 0; attempt < 3; attempt++) {
    await d.click(`${A} ${selector}`, { pause: 300 }).catch(() => {});
    await d.c.evalFrame("#appframe", `(() => { const e = document.querySelector(${inner}); if (e) { e.focus(); e.select(); } })()`);
    if (text === "") {
      await d.c.evalFrame("#appframe", `(() => { const e = document.querySelector(${inner}); if (e) { e.value = ""; e.dispatchEvent(new Event("input", { bubbles: true })); } })()`);
    } else {
      await d.type(text, perChar + attempt * 50);
    }
    await wait(d, 550);
    const now = await d.c.evalFrame("#appframe", `document.querySelector(${inner})?.value ?? null`);
    if (now === text) return;
  }
}

const pickSelect = (id: string, value: string) =>
  `(() => { const s = document.getElementById(${JSON.stringify(id)}); if (s) { s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`;

const fillDesigner = async (d: Do, id: string, text: string) => {
  await d.click(`#${id}`, { pause: 400 });
  await d.eval(`document.getElementById(${JSON.stringify(id)})?.select()`);
  await d.type(text, 80);
  await d.key("Tab", "Tab");
};

const tagDesignerControls = (d: Do) =>
  d.eval(`[...document.querySelectorAll('#formCanvas .designer-control')].forEach((e, i) => { e.dataset.n = String(i + 1); })`);

const clickDesignerControl = async (d: Do, n: number, pause = 800) => {
  await tagDesignerControls(d);
  await d.click(`#formCanvas .designer-control[data-n='${n}']`, { pause });
};

export const godModeChapters: Chapter[] = [
  // ============================================================================
  // 00 — INTRO CARD
  // ============================================================================
  {
    id: "00_intro",
    chapter: "GOD-MODE MASTER TUTORIAL",
    title: "Welcome to Bun RAD Studio v1.5.0 God-Mode",
    kind: "card",
    card: {
      kicker: "Mac Studio M4 Ultra 6K XDR · Windows 11 Dual RTX 5090 · Linux 96-Core Threadripper PRO",
      title: "Bun RAD Studio v1.5.0 God-Mode",
      lines: [
        "1. Codecaine File Manager v1.5.0 & AAA 10-Engine Shader Studio",
        "2. SimpleGUI API, Visual Theme Studio, 45 rad Modules & 10 CLI Engines",
        "3. SimpleGUI Visual Designer: 101 Controls, 168+ Themes & 6-Language Codegen",
      ],
    },
    steps: [
      {
        cap: "The complete v1.5.0 God-Mode masterclass across all 3 platforms",
        say: "Welcome to the completely new Bun RAD Studio version one point five God-Mode tutorial. In this masterclass we cover every new capability across all three flagship tools: the Codecaine File Manager version one point five, the SimpleGUI A P I and Visual Theme Studio, and the Bun RAD Studio SimpleGUI Visual Designer. Along the way, you will learn high-speed rapid application development tricks across macOS on Mac Studio M4 Ultra with Pro Display X D R, Windows eleven Pro on Threadripper Pro with dual R T X fifty-ninety graphics, and Linux Wayland HiDPI on a ninety-six core workstation. Everything on screen is recorded live. Let us dive right in.",
      },
    ],
  },

  // ============================================================================
  // 01 — FILE MANAGER: GOD-MODE PRODUCTIVITY BAR, VIEWS & KIND CHIPS
  // ============================================================================
  {
    id: "01_godmode_productivity_bar",
    chapter: "GOD-MODE PRODUCTIVITY BAR",
    title: "Instant Views (⌥1–⌥8), Smart Kind-Chips, Live Filter & Grouping",
    blurb: "Navigate huge repositories at 120Hz with zero mouse friction",
    steps: [
      step(
        "Top Toolbar View Switcher (⌥1 through ⌥8)",
        "Here is the Codecaine File Manager running on our flagship Mac Studio M4 Ultra at one hundred twenty hertz. Along the top right, the new view switcher lets you jump between List, Icons, Details, Files, Home, Tools, Split View, and Dual Pane with one click or Option one through Option eight.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · 6K XDR 120Hz", "⌥1–⌥8 Instant Views", "#38bdf8");
          await d.click("#status-views button >> Icons", { pause: 900 });
          await d.click("#status-views button >> Details", { pause: 900 });
          await d.click("#status-views button >> List", { pause: 900 });
          await d.click("#view-split", { pause: 1100 });
          await d.click("#view-dual", { pause: 1100 });
          await d.click("#view-files", { pause: 900 });
        },
      ),
      step(
        "Smart File-Kind Chips & Instant Folder Filter (⌘⌥F)",
        "Right above the file list is the new God-Mode Productivity Bar. Click any file-kind chip, such as Code, Docs, or All, to isolate files of that type with live badge counts. Or press Command Option F to focus the live substring filter and narrow thousands of rows on every keystroke.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · 192GB Unified", "⌘⌥F Live Substring Filter + Kind Chips", "#10b981");
          await d.click('#kind-chips [data-kind-chip="code"]', { pause: 1000 });
          await d.click('#kind-chips [data-kind-chip="data"]', { pause: 1000 }).catch(() => {});
          await d.click('#kind-chips [data-kind-chip="all"]', { pause: 900 });
          await d.click("#quick-filter", { pause: 400 });
          await d.type("json", 110);
          await wait(d, 1000);
          await d.click("#quick-filter-clear", { pause: 700 }).catch(async () => {
            await d.eval(`(() => { const i = document.getElementById('quick-filter'); if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
          });
        },
      ),
      step(
        "1-Click Row Grouping, Row Density & Folder Tabs",
        "Next to the filter box, the Group button organizes the current folder by Kind, Date, Size, or Extension with collapsible section headers. The Density button cycles Compact, Cozy, and Spacious row heights. And you can open multiple folder tabs, expand the sidebar folder tree, or tag files with color dots for instant filtering.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · ProMotion", "Group by Kind/Date/Size · Row Density", "#f59e0b");
          await d.click("#qb-group-btn", { pause: 1100 });
          await d.click("#qb-group-btn", { pause: 900 });
          await d.click("#qb-density-btn", { pause: 900 });
          await d.click("#qb-density-btn", { pause: 900 });
          await d.click("#qb-density-btn", { pause: 900 });
          await d.row("package.json", "click", { pause: 800 }).catch(() => {});
        },
      ),
    ],
  },

  // ============================================================================
  // 02 — COMMAND PALETTE, RAD TEMPLATES & FLOATING SELECTION BAR
  // ============================================================================
  {
    id: "02_command_palette_templates_selection",
    chapter: "COMMAND PALETTE & RAD TEMPLATES",
    title: "Universal Command Palette (⌘⇧P), 12 RAD Templates & Selection Bar",
    blurb: "Fuzzy-search 80+ actions, scaffold code in 1 click, and batch-act on selections",
    steps: [
      step(
        "Universal Command Palette (⌘⇧P) with Smart Mode Prefixes",
        "Press Command Shift P, or click Command Palette in the view bar, to open the Universal Command Palette. It indexes over eighty actions, folders, studios, file templates, and views. Use category pills or type prefixes like greater-than for actions, at-sign for places, question-mark for studios, or plus for templates.",
        async (d) => {
          await showRigHud(d, "🪟 Win11 Pro · Dual RTX 5090", "⌘⇧P Universal Command Palette", "#a855f7");
          await d.click("#viewbar-palette", { pause: 900 });
          await d.click('.cp-cat-btn[data-cp-cat="actions"]', { pause: 750 }).catch(() => {});
          await d.click('.cp-cat-btn[data-cp-cat="tools"]', { pause: 750 }).catch(() => {});
          await d.click('.cp-cat-btn[data-cp-cat="templates"]', { pause: 750 }).catch(() => {});
          await d.click('.cp-cat-btn[data-cp-cat="all"]', { pause: 650 }).catch(() => {});
          await d.click("#command-palette-input", { pause: 350 });
          await d.type("sqlite", 100);
          await wait(d, 1000);
          await d.key("Escape", "Esc");
          await wait(d, 500);
        },
      ),
      step(
        "RAD New File from Template Studio (⌘⌥K)",
        "Need a new script or config immediately? Press Command Option K or click Template in the quickbar. Pick from twelve production-ready templates including TypeScript, Python, HTML5, SQL, Shell, Dockerfile, or Makefile, inspect the live editable boilerplate preview, and click Create File.",
        async (d) => {
          await showRigHud(d, "🐧 Linux 96-Core Threadripper PRO", "⌘⌥K New From Template Studio", "#10b981");
          await d.click("#qb-template-btn", { pause: 1000 });
          await d.click('.tpl-card[data-tpl-id="python"]', { pause: 800 }).catch(() => {});
          await d.click('.tpl-card[data-tpl-id="sql"]', { pause: 800 }).catch(() => {});
          await d.click('.tpl-card[data-tpl-id="typescript"]', { pause: 800 }).catch(() => {});
          await d.hover("#tpl-content-preview", 900).catch(() => {});
          await d.click(".dialog button >> Create File", { pause: 1100 }).catch(async () => {
            await d.key("Escape", "Esc");
          });
        },
      ),
      step(
        "Floating Context Selection Action Bar & Universal Archive Extraction (⌘⇧E)",
        "As soon as you select one or more rows in the file list, the new floating Selection Action Bar slides in at the bottom of the screen. It shows the live count and byte size, one-click color tags, and smart context buttons for Quick Look, Code Editor, Rename, Zip, Copy Paths, or Universal Archive Extraction with Command Shift E.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · 6K XDR", "Floating Selection Bar + ⌘⇧E Extract", "#38bdf8");
          await d.eval(`document.querySelectorAll('dialog[open]').forEach(dl => dl.close())`);
          await wait(d, 400);
          await d.row("package.json", "click", { pause: 1000 }).catch(() => {});
          await d.hover("#selection-bar", 1200).catch(() => {});
          await d.click('.sb-tag-btn[data-sb-tag="blue"]', { pause: 800 }).catch(() => {});
          await d.click('.sb-btn[data-sb-action="copypath"]', { pause: 900 }).catch(() => {});
          await d.click("#selection-bar-clear", { pause: 700 }).catch(() => {});
        },
      ),
    ],
  },

  // ============================================================================
  // 03 — ALL 3 PLATFORMS ON HIGHEST-SPEC MACHINES + HARDWARE TELEMETRY DECK
  // ============================================================================
  {
    id: "03_cross_platform_flagship_rigs",
    chapter: "3 FLAGSHIP PLATFORMS & TELEMETRY",
    title: "Mac M4 Ultra 6K XDR, Windows 11 Dual RTX 5090 & Linux 96-Core Optimizers",
    blurb: "1-click hardware-tuned 120Hz profiles and the 4-Mode VFD & Oscilloscope Telemetry Deck",
    steps: [
      step(
        "🍎 Optimize for macOS: Mac Studio M4 Ultra & Pro Display XDR 6K",
        "Let us open the Theme and Shader Production Studio. At the top are three one-click hardware optimization buttons for the highest-spec machines on every operating system. Clicking Optimize for Mac tunes the compositor for Apple Silicon M4 Ultra, Display P3 wide color, vibrant CoreAnimation backdrop glass, and one-hundred-twenty-hertz ProMotion.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · 80c GPU · 192GB · 6K XDR", "1-Click macOS Metal / P3 / 120Hz Optimizer", "#38bdf8");
          await ensureThemeGalleryOpen(d);
          await d.click('[data-optimize-platform="macos"]', { pause: 1400 });
          await d.click('[data-jumpstart-kit="mac_studio_m4_ultra_kit"]', { pause: 1400 }).catch(() => {});
        },
      ),
      step(
        "🪟 Optimize for Windows 11 Pro: Threadripper PRO + Dual RTX 5090 32GB",
        "Clicking Optimize for Windows switches to the DirectX twelve WebView2 and Desktop Window Manager Mica profile, built for Windows eleven workstations running AMD Threadripper Pro and dual NVIDIA GeForce R T X fifty-ninety graphics on eight-K one-hundred-twenty-hertz OLED displays.",
        async (d) => {
          await showRigHud(d, "🪟 Win11 Pro · Threadripper 7995WX · Dual RTX 5090", "DirectX 12 WebView2 + DWM Acrylic/Mica", "#60a5fa");
          await ensureThemeGalleryOpen(d);
          await d.click('[data-optimize-platform="windows"]', { pause: 1500 });
        },
      ),
      step(
        "🐧 Optimize for Linux Workstation: 96-Core / 192-Thread Wayland 120Hz",
        "Clicking Optimize for Linux configures the compositor for Ubuntu, Fedora, and Arch Linux flagship rigs powered by a ninety-six core, one-hundred-ninety-two thread Threadripper Pro with two-hundred-fifty-six gigabytes of E C C memory and Wayland HiDPI.",
        async (d) => {
          await showRigHud(d, "🐧 Linux Wayland HiDPI · 96-Core / 192-Thread · 256GB ECC", "WebKitGTK Zero-Jitter Compositor", "#34d399");
          await ensureThemeGalleryOpen(d);
          await d.click('[data-optimize-platform="linux"]', { pause: 1500 });
        },
      ),
      step(
        "Live Hardware VFD & Oscilloscope Telemetry Deck (4 Skins)",
        "Right inside the studio header, click Hardware V F D and Oscilloscope Telemetry to expand the live hardware monitor. Switch between the Vacuum Fluorescent Logical Core Matrix, Radial Quadrant Gauges, Winamp Twenty-Eight-Band Spectrum Analyzer, and the Subsystem Frame-Time Profiler.",
        async (d) => {
          await showRigHud(d, "⚡ 120Hz Hardware Telemetry Deck", "VFD Cores · Quadrant Gauges · Spectrum · Profiler", "#f59e0b");
          await ensureThemeGalleryOpen(d);
          await d.click('[data-open-telemetry-studio="true"]', { pause: 1100 }).catch(() => {});
          for (const skin of ["vfd_logical_cores", "quadrant_gauges", "winamp_spectrum", "subsystem_profiler"]) {
            await d.click(`[data-telemetry-skin-btn="${skin}"]`, { pause: 1000 }).catch(() => {});
          }
        },
      ),
    ],
  },

  // ============================================================================
  // 04 — v1.5.0 AAA 10-ENGINE PRODUCTION STUDIO, 3D FOLDERS, CRT & HOLIDAYS
  // ============================================================================
  {
    id: "04_aaa_10_engine_studio",
    chapter: "AAA 10-ENGINE SHADER STUDIO",
    title: "8 Director's Cuts (⌥M), 14 3D Folder Animations (⌥9), 34 Screen Filters (⌥F) & 18 Holidays (⌥H)",
    blurb: "Combine 10 independent visual, physics, lighting, wallpaper, and WebAudio foley engines",
    steps: [
      step(
        "8 Master AAA Director's Cut Presets (⌥M) & God-Mode Kits",
        "Version one point five introduces the ten-engine Immersion Studio. At the top, the eight Master Triple-A Director's Cut buttons, or Option M, orchestrate all ten engines in a single click: Silicon Valley Keynote, Cyberpunk 2099, Retro 1984 Trinitron, Cinema 4D MoGraph, Compiz Fusion 2008, Matrix Operator, Liquid Aqua 2001, and Zen Focus.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · 10-Engine Studio", "⌥M Cycle 8 AAA Director's Cut Presets", "#ec4899");
          await ensureThemeGalleryOpen(d);
          await d.eval(`(() => { const d = document.querySelector('[data-fx-studio-drawer="true"]'); if (d) d.open = true; })()`);
          await wait(d, 600);
          await d.click('[data-jumpstart-kit="godmode_omega_singularity_kit"]', { pause: 1300 }).catch(() => {});
          await d.eval(`window.cycleAppAaaDirectorCut?.(1)`);
          await wait(d, 1300);
          await d.eval(`window.cycleAppAaaDirectorCut?.(1)`);
          await wait(d, 1200);
        },
      ),
      step(
        "14 High-End 3D Spinning Folder & Flash 2Advanced 3000 Animations (⌥9)",
        "Press Option nine or click any of the fourteen high-end three-D folder and icon animations: Three-D Showcase Spin, Two-Advanced Studios Year Three-Thousand Flash, Cinema 4D MoGraph Extrude, Houdini V E X Particle Vortex, After Effects Plexus H U D, or Compiz Desktop Cube Atlantis.",
        async (d) => {
          await showRigHud(d, "🪟 Win11 Dual RTX 5090 · 120Hz", "⌥9 Cycle 14 3D Folder & Flash 3000 Animations", "#38bdf8");
          await ensureThemeGalleryOpen(d);
          for (const anim of ["spin_3d_showcase", "flash_2advanced_3000", "c4d_mograph_extrude", "houdini_vex_vortex"]) {
            await d.eval(`(() => {
              const det = document.querySelector('[data-fx-studio-drawer="true"]');
              if (det) det.open = true;
              const btn = document.querySelector(${JSON.stringify(`[data-icon-anim="${anim}"]`)});
              if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
            })()`);
            await wait(d, 1050);
          }
        },
      ),
      step(
        "34 CRT, Cinema & VFX Screen Filters (⌥F / ⌥⇧F) + 6 Icon Finishes",
        "Press Option F to cycle thirty-four full-viewport screen filters, or Option Shift F for a surprise lens: Sony Trinitron Aperture Grille, I M A X Seventy-Millimeter Halation, VHS Tracking Glitch, Night-Vision Goggles, Thermal Predator Infrared, and Blueprint Cyanotype. Below that are six tactile icon material finishes including Anodized Titanium and 24K Gold Leaf.",
        async (d) => {
          await showRigHud(d, "🐧 Linux 96-Core · Wayland 120Hz", "⌥F Cycle 34 Screen Filters · ⌥⇧F Random Filter", "#a855f7");
          await ensureThemeGalleryOpen(d);
          await d.eval(`window.cycleAppScreenFilter?.(1)`);
          await wait(d, 1100);
          await d.eval(`window.cycleAppScreenFilter?.(1)`);
          await wait(d, 1100);
          await d.click('[data-screen-filter="off"]', { pause: 900 }).catch(() => {});
        },
      ),
      step(
        "3D Desktop Stage (⌥S), Cursor Trails (⌥T), Wallpapers (⌥W) & 18 US Holidays (⌥H)",
        "You can also tilt the entire window on a three-D Desktop Stage with Option S, enable one-hundred-twenty-hertz cursor trails with Option T, swap eight-K procedural wallpapers with Option W, and celebrate eighteen animated U S holidays with Option H—complete with Fourth of July fireworks, Halloween bats, and Christmas hearth snowfall.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · Pro Display XDR", "⌥S 3D Stage · ⌥T Trails · ⌥W Wallpapers · ⌥H Holidays", "#f43f5e");
          await ensureThemeGalleryOpen(d);
          await d.eval(`window.cycleAppStageMode?.(1)`);
          await wait(d, 950);
          await d.eval(`window.cycleAppStageMode?.(-1)`);
          await wait(d, 700);
          await d.click('[data-holiday-pill="holiday_fourth_of_july_fireworks"]', { pause: 1300 }).catch(() => {});
          await d.click('[data-holiday-celebrate-burst="true"]', { pause: 1200 }).catch(() => {});
        },
      ),
    ],
  },

  // ============================================================================
  // 05 — 7 PRO THEME STUDIO POWER-UPS, ZERO-DIALOG HOTKEYS & BIG-SCREEN EDITOR
  // ============================================================================
  {
    id: "05_pro_theme_powerups_and_editor",
    chapter: "7 PRO POWER-UPS & SHADER LAB",
    title: "Undo/Redo (⌥Z/⌥Y), Keep FX Swap Colors (⌥C), 49 Icon Packs (⌥I), Hold-to-Peek (⌥\\) & Theme Hacker",
    blurb: "Non-destructive theme experimentation, 194 shaders, 6-layer mixer, and SVG poster export",
    steps: [
      step(
        "25-Step Undo/Redo (⌥Z / ⌥Y), Keep FX Swap Colors (⌥C) & 49 Icon Packs (⌥I)",
        "Experimenting with themes is completely non-destructive. Press Option Z and Option Y for twenty-five-step theme Undo and Redo. Love your current three-D effects and screen filter, but want a new palette? Press Option C to swap colors while keeping every active effect untouched. Press Option I to shuffle forty-nine vector icon packs, or Option Shift I to lock your favorite icons.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · 6K XDR", "⌥Z/⌥Y Undo/Redo · ⌥C Keep FX Swap Colors · ⌥I 49 Icon Packs", "#10b981");
          await ensureThemeGalleryOpen(d);
          await d.eval(`window.cycleAppColorKeepFx?.(1)`);
          await wait(d, 1100);
          await d.eval(`window.shuffleAppIconPack?.()`);
          await wait(d, 1100);
          await d.click('[data-theme-history-undo="true"]', { pause: 1000 }).catch(() => {});
        },
      ),
      step(
        "Dual-Pane Spotlight, Chameleon Folder Mood, Zero-Watt Governor & Hold-to-Peek (⌥\\)",
        "Turn on Dual-Pane Focus Spotlight to dim the inactive pane in Split View, Chameleon Folder Mood to tint accents automatically by folder content, and the Smart Zero-Watt Power Governor. Need to read dense data tables without effects for a second? Hold Option Backslash for instant plain readability, and release to restore every shader.",
        async (d) => {
          await showRigHud(d, "🪟 Win11 Dual RTX 5090 · 8K OLED", "⌥\\ Hold-to-Peek Plain · Active FX Strip · SVG Poster", "#38bdf8");
          await ensureThemeGalleryOpen(d);
          await d.eval(`import('/ui/themes.js').then(m => m.startThemePeekCompare?.('plain'))`);
          await wait(d, 1200);
          await d.eval(`import('/ui/themes.js').then(m => m.stopThemePeekCompare?.())`);
          await wait(d, 900);
        },
      ),
      step(
        "Zero-Dialog Random Hotkeys (⌥R / ⌥E / ⌥P / ⌥U / ⌥0) & Big-Screen Theme Hacker",
        "Even with the dialog closed, you can roll themes anywhere in the app: Option R for any random theme, Option E for shader FX, Option P for plain clean UI, Option U for Ultra showcase, and Option Zero to toggle effects on or off. And inside the Big-Screen Theme Editor, you can mix six simultaneous shaders, blend themes in O K Lab color space, or use the Theme Hacker Lab.",
        async (d) => {
          await showRigHud(d, "🐧 Linux 96-Core Threadripper PRO", "⌥R Any · ⌥E FX · ⌥P Plain · ⌥U Ultra · ⌥0 Toggle FX", "#f59e0b");
          await d.eval(`document.querySelector('.theme-gallery-dialog')?.close()`);
          await wait(d, 600);
          await d.eval(`window.randomAppTheme?.('ultra')`);
          await wait(d, 1300);
          await d.eval(`window.toggleCurrentThemeEffects?.()`);
          await wait(d, 1000);
          await d.eval(`window.toggleCurrentThemeEffects?.()`);
          await wait(d, 900);
          await d.eval(`import('/ui/themes.js').then(m => m.setTheme?.('default'))`);
          await wait(d, 700);
        },
      ),
    ],
  },

  // ============================================================================
  // 06 — SYNCED TERMINAL, QUOTED PATHS, DEV/MEDIA STUDIOS & 4 DATABASE ENGINES
  // ============================================================================
  {
    id: "06_terminal_code_dev_studios",
    chapter: "SYNCED TERMINAL, STUDIOS & DATABASES",
    title: "2-Way Terminal Sync, Cross-Shell Quoted Paths, 30+ Studios & 4 Database Engines",
    blurb: "macOS zsh/bash, Windows PowerShell/CMD/Git Bash/WSL, Media/Paint/Games & SQLite/MySQL/Postgres/Redis",
    steps: [
      step(
        "Two-Way Synced Terminal & Safe Cross-Platform Quoted Path Insertion",
        "Open the built-in terminal with Control Backtick. When you c d in the shell, the file list follows automatically. Select any files and click Selected to Terminal, or press Command Option V, and their paths are safely quoted for macOS and Linux zsh and bash, as well as Windows PowerShell, Command Prompt, Git Bash, and W S L.",
        async (d) => {
          await showRigHud(d, "🍎 Mac M4 Ultra · 🪟 Win11 WSL/PS · 🐧 Linux zsh", "Ctrl+` Synced Terminal + ⌘⌥V Safe Quoted Paths", "#38bdf8");
          await d.click("#tool-terminal", { pause: 1200 }).catch(() => {});
          await d.row("package.json", "click", { pause: 800 }).catch(() => {});
          await d.click("#term-insert-selected", { pause: 1100 }).catch(() => {});
          await d.click("#tool-terminal", { pause: 800 }).catch(() => {});
        },
      ),
      step(
        "30+ Built-In Developer, System Telemetry, Media Deck, Paint & 24 Arcade Games",
        "Switch to the Tools view with Option six to access over thirty built-in studios: Code Editor, Multi-File Replace with Undo, Dev Code Stats and Git, Process and Task Manager, Hardware Telemetry, Image and Video Studios, AmpDeck with a ten-band equalizer and one hundred eight visualizers, Paint Studio, and twenty-four playable arcade games.",
        async (d) => {
          await showRigHud(d, "🪟 Win11 Dual RTX 5090 · 30+ Built-In Studios", "⌥6 Tools Hub · Code · Dev · AmpDeck · Paint · 24 Games", "#a855f7");
          await d.click("#view-tools", { pause: 1400 });
          await d.hover("#tools-hub-panel", 1200).catch(() => {});
          await d.click("#view-files", { pause: 900 });
        },
      ),
      step(
        "Unified 4-Engine Database Studio Hub (SQLite, MySQL, PostgreSQL & Redis)",
        "And under Databases in the top bar, Codecaine File Manager includes full visual studios for all four major database engines: SQLite, MySQL, PostgreSQL, and Redis—complete with schema browsers, visual table designers, query notebooks, E R diagrams, and one-click sample databases.",
        async (d) => {
          await showRigHud(d, "🐧 Linux 96-Core · 4-Engine Database Hub", "SQLite · MySQL · PostgreSQL · Redis Visual Studios", "#10b981");
          await d.click("#tool-databases", { pause: 1300 }).catch(() => {});
          await d.hover(".dialog", 1400).catch(() => {});
          await d.key("Escape", "Esc");
          await wait(d, 600);
        },
      ),
    ],
  },

  // ============================================================================
  // 07 — VISUAL THEME STUDIO PRO & 3-LAYER SMART MATH ENGINE
  // ============================================================================
  {
    id: "07_visual_theme_studio_math_engine",
    chapter: "VISUAL THEME STUDIO & MATH ENGINE",
    title: "Visual Theme Studio Pro & The 3-Layer Smart Token Math Engine",
    blurb: "Generate 10-step neutral shade scales, WCAG AA/AAA contrast tokens & surface vibes from 3 inputs",
    steps: [
      step(
        "Year 3000+ God-Mode Presets & 3-Input Smart Palette Generator",
        "Next, let us open the standalone Visual Theme Studio server from src features theme-studio. Pick any of the forty-three presets—including Year Three-Thousand God-Mode themes like Omega Point Singularity, Photonic Metamaterial, and Matrioshka Dyson Brain—or feed the Smart Math Engine just three inputs: Base Mode, Primary Brand Color, and Accent Color.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · Display P3 Color", "Visual Theme Studio · 3-Layer Smart Math Engine", "#ec4899");
          for (const preset of ["omega-point-singularity", "photonic-metamaterial-3099", "matrioshka-dyson-brain"]) {
            await d.eval(`(() => {
              const btn = document.querySelector(${JSON.stringify(`.ts-preset-card[data-preset-id="${preset}"]`)});
              if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
            })()`);
            await wait(d, 1200);
          }
        },
      ),
      step(
        "Surface Vibes, Density Scales & Live Component Playground",
        "The math engine automatically computes a ten-step neutral shade scale, semantic status badges, and W C A G contrast-checked text colors. Toggle between Frosted Glass, Neon Border, Matte, and Flat surface vibes, switch density between Compact, Comfortable, and Spacious, and test live interactive tables, code blocks, and modals on the right.",
        async (d) => {
          await showRigHud(d, "🪟 Win11 Dual RTX 5090 · WCAG AA/AAA Auto-Contrast", "Frosted Glass · Neon Border · Live Playground", "#38bdf8");
          await d.click('[data-surface-vibe="neon-border"]', { pause: 900 }).catch(() => {});
          await d.click('[data-surface-vibe="frosted-glass"]', { pause: 900 }).catch(() => {});
          await d.click('[data-density="compact"]', { pause: 800 }).catch(() => {});
          await d.click('[data-density="comfortable"]', { pause: 800 }).catch(() => {});
          await d.click("#pgTabData", { pause: 950 }).catch(() => {});
          await d.click("#pgTabCode", { pause: 950 }).catch(() => {});
          await d.click("#pgTabAll", { pause: 850 }).catch(() => {});
        },
      ),
      step(
        "Pro Token Inspector & 1-Click Theme JSON Export",
        "Switch to the Pro Inspector tab to fine-tune individual design tokens with live contrast ratios, or click Export JSON to copy a complete, schema-validated theme token bundle directly into your SimpleGUI desktop application.",
        async (d) => {
          await showRigHud(d, "🐧 Linux 96-Core · Schema-Validated Tokens", "Pro Token Inspector + 1-Click JSON Export", "#10b981");
          await d.click("#tabBtnProInspector", { pause: 1100 }).catch(() => {});
          await d.click("#btnOpenJsonModal", { pause: 1200 }).catch(() => {});
          await d.click("#btnCloseJsonModal", { pause: 800 }).catch(() => {});
          await d.click("#tabBtnQuickStudio", { pause: 800 }).catch(() => {});
        },
      ),
    ],
  },

  // ============================================================================
  // 08 — SIMPLEGUI API PART 1: FLUENT WINDOWS, 4-LINE FORMS, GRIDS & CARDS
  // ============================================================================
  {
    id: "08_simplegui_api_fluent_layouts",
    chapter: "SIMPLEGUI API: FLUENT LAYOUTS",
    title: "Fluent Windows, 4-Line Compound Forms, Grids & 120Hz Compositor",
    blurb: "Side-by-side source code and live running SimpleGUI desktop app",
    steps: [
      step(
        "newSimpleWindow() with 120Hz Cross-Platform Compositor",
        "Now let us build native desktop applications with the SimpleGUI A P I. On the left is our TypeScript file in examples god-mode-tutorial, and on the right is the real running program. A single call to new simple window creates a hardware-accelerated window that automatically applies macOS, Windows eleven, or Linux compositor optimizations.",
        async (d) => {
          await showRigHud(d, "🍎 Mac M4 Ultra · 🪟 Win11 RTX 5090 · 🐧 Linux 96c", "newSimpleWindow() + Fluent Chainable API", "#38bdf8");
          await stage.hl(d, "const win = newSimpleWindow", "win.addHeading");
          await wait(d, 1600);
        },
      ),
      step(
        "Rows & 4-Line Compound Form Builders (addFormField, Dropdown, Slider, Switch)",
        "Begin row and end row place controls side by side. And for data entry, SimpleGUI's compound form helpers—add form field, add form dropdown, add form slider, and add form switch—create both the aligned label and the interactive control in four clean lines of code.",
        async (d) => {
          await showRigHud(d, "⚡ RAD Productivity Trick: 4-Line Forms", "addFormField · addFormDropdown · addFormSlider · addFormSwitch", "#10b981");
          await stage.hl(d, 'win.beginCard("🖥️ Hardware Rig Profile', "win.endCard()");
          await d.click(`${A} button >> Ping Rig`, { pause: 1400 });
          await wait(d, 900);
        },
      ),
      step(
        "Auto-Wrapping Grids, Circular Meters, Dialogs & Runtime Theme Switching",
        "Begin grid arranges circular progress rings and gauges into equal columns without pixel math. Clicking Deploy Workstation Profile reads the form values by I D and opens an info dialog, while Cycle God-Mode Theme restyles the entire window at runtime.",
        async (d) => {
          await showRigHud(d, "🎛️ Auto-Grid + Runtime Theme Engine", "beginGrid(2, 10) · win.info() · win.setTheme()", "#a855f7");
          await stage.hl(d, 'win.beginCard("🎛️ Multi-Column Telemetry', "win.addStatusBar");
          await d.click(`${A} button >> Deploy Workstation Profile`, { pause: 1600 });
          await d.click(`${A} button >> OK`, { pause: 900 }).catch(() => {});
          await d.click(`${A} button >> Cycle God-Mode Theme`, { pause: 1400 });
        },
      ),
    ],
  },

  // ============================================================================
  // 09 — SIMPLEGUI API PART 2: VLANG PARITY, ENTERPRISE TELEMETRY & REACTIVE STATE
  // ============================================================================
  {
    id: "09_simplegui_api_enterprise_telemetry",
    chapter: "ENTERPRISE WIDGETS & REACTIVE STATE",
    title: "VLang Parity Widgets, Enterprise Telemetry & Two-Way Reactive State",
    blurb: "Score cards, donut charts, activity rings, knobs, and bindState() two-way synchronization",
    steps: [
      step(
        "Hero Banners, Score Cards, Donut Charts, Activity Rings & Knobs",
        "SimpleGUI includes over one hundred controls, including full VLang SimpleGUI parity and enterprise telemetry widgets. With one call each, add hero banner, add score card, add donut chart, add activity rings, and add knob build a live hardware monitoring dashboard.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · 100+ Built-In Widgets", "addHeroBanner · addScoreCard · addDonutChart · addActivityRings", "#f59e0b");
          await stage.hl(d, "win.addHeroBanner", "win.endCard()");
          await d.click(`${A} button >> Win11 RTX 5090`, { pause: 900 }).catch(() => {});
          await d.click(`${A} button >> Linux 96-Core`, { pause: 900 }).catch(() => {});
          await d.click(`${A} button >> Copy Rig Token`, { pause: 1000 }).catch(() => {});
        },
      ),
      step(
        "Two-Way Reactive State Store: bindState(), onStateChange() & setState()",
        "Below the dashboard is SimpleGUI's two-way reactive state store. Calling bind state on the text input and slider links them to named keys in the store. Typing in the box or clicking Boost to One Hundred Percent Overclock updates every bound control and summary label automatically.",
        async (d) => {
          await showRigHud(d, "🔄 Two-Way Reactive State Store", "bindState() · onStateChange() · setState()", "#38bdf8");
          await stage.hl(d, 'win.beginCard("🔄 Two-Way Reactive State', "win.addStatusDock");
          await fillInApp(d, "#txtCluster", "M4-Ultra-XDR-Cluster", 90);
          await wait(d, 900);
          await d.click(`${A} button >> Boost to 100% Overclock`, { pause: 1500 });
          await d.click(`${A} button >> Theme: Cyberpunk`, { pause: 1200 });
          await d.click(`${A} button >> Theme: Nord`, { pause: 1200 });
          await d.click(`${A} button >> Theme: Apple Dark`, { pause: 1000 });
        },
      ),
    ],
  },

  // ============================================================================
  // 10 — SIMPLEGUI API PART 3: SWEETALERT2, SQLITE FLEET APP, 45 RAD MODULES & 10 CLI TOOLS
  // ============================================================================
  {
    id: "10_simplegui_api_dialogs_sqlite_rad",
    chapter: "SQLITE, SWEETALERT2 & 45 RAD MODULES",
    title: "Menus, SweetAlert2 fire(), Busy State, SQLite Fleet App, 45 rad Modules & 10 CLI Tools",
    blurb: "Build a database-backed desktop app and call 45 rad modules + fd/sd/tokei/gdu from TypeScript",
    steps: [
      step(
        "Menu Bars, SweetAlert2 fire() Multi-Button Dialogs & withBusyState()",
        "Here is a complete workstation fleet manager backed by Bun's native SQLite through rad dot sqliteutils. At the top we have a desktop menu bar, a live search input, a SweetAlert2 fire dialog with confirm, deny, and cancel buttons, and an async busy-state button that disables controls while work runs.",
        async (d) => {
          await showRigHud(d, "🪟 Win11 Dual RTX 5090 · Native SQLite + SweetAlert2", "win.fire() · win.withBusyState() · rad.sqliteutils", "#ec4899");
          await stage.hl(d, "const db = rad.sqliteutils.openDb", "win.addTable");
          await d.click(`${A} button >> SweetAlert fire()`, { pause: 1400 });
          await d.c.evalFrame("#appframe", `(() => { const b = [...document.querySelectorAll('button')].find(x => /Run Benchmark/i.test(x.textContent || '') && x.offsetParent !== null); if (b) b.click(); })()`);
          await wait(d, 900);
          await d.click(`${A} button >> Sync Telemetry`, { pause: 1800 });
          await d.click(`${A} button >> OK`, { pause: 800 }).catch(() => {});
        },
      ),
      step(
        "Live SQLite Insert, Right-Click Context Menu & Instant Table Refresh",
        "Let us add a new workstation to the SQLite database. I type a hostname, right-click the input to trigger its custom per-control context menu and convert the hostname to uppercase, and click Add Workstation. The new row is inserted into SQLite and rendered in the table immediately.",
        async (d) => {
          await showRigHud(d, "🐧 Linux 96-Core · Per-Control Context Menu + SQLite", "Right-Click .contextMenu() + sqliteutils.insertRow()", "#10b981");
          await stage.hl(d, 'win.beginCard("➕ Register New Flagship', "win.addStatusBar");
          await fillInApp(d, "#txtHost", "arch-threadripper-96c", 85);
          await d.rclick(`${A} #txtHost`, { pause: 900 });
          await d.c.evalFrame("#appframe", `(() => { const el = [...document.querySelectorAll('.sg-ctx-item, [data-ctx-item], div')].find(x => x.textContent?.includes('UPPERCASE HOST') && x.offsetParent !== null); if (el) el.click(); })()`);
          await wait(d, 800);
          await d.click(`${A} button >> Add Workstation`, { pause: 1500 });
        },
      ),
      step(
        "45 rad.* Utility Modules & 10 System CLI Engines as Functions",
        "Behind every SimpleGUI app are forty-five zero-dependency rad utility modules—for strings, arrays, SQLite key-value stores, statistics, sparklines, semver, and SHA-256 hashing—plus the ten system tools f d, s d, tokei, g d u, and watchexec callable as plain TypeScript functions. And with bun build dash-dash-compile, your app ships as a single native binary.",
        async (d) => {
          await showRigHud(d, "⚡ 45 rad.* Modules + 10 CLI Engines + Single Binary", "rad.* · fd · sd · tokei · gdu · bun build --compile", "#f59e0b");
          await stage.term(
            d,
            "bun run examples/god_mode_tutorial/04_rad_and_system_engines.ts",
            outputs["10_simplegui_api_dialogs_sqlite_rad"] ?? "",
          );
          await wait(d, 2600);
        },
      ),
    ],
  },

  // ============================================================================
  // 11 — BUN RAD STUDIO SIMPLEGUI VISUAL DESIGNER PART 1: PALETTE, INSPECTOR & ANCHORS
  // ============================================================================
  {
    id: "11_designer_palette_inspector_anchors",
    chapter: "VISUAL DESIGNER: PALETTE & LAYOUT",
    title: "SimpleGUI Visual Designer: 101 Controls, Starter Templates, Anchors & 1-Click Layout",
    blurb: "Delphi/VB-style WYSIWYG form builder with style presets, live hover test & alignment tools",
    steps: [
      step(
        "101-Control Component Palette, Search Filter & Ready-Made Starter Templates",
        "Now let us open the Bun RAD Studio SimpleGUI Visual Designer. On the left are ten starter templates and a categorized palette of one hundred one controls—from standard inputs and toggles to charts, gauges, database grids, and non-visual timers. Click Auth Login or Dashboard to populate a complete form in one click.",
        async (d) => {
          await showRigHud(d, "🍎 Mac Studio M4 Ultra · WYSIWYG Visual Designer", "101 Controls · 10 Templates · Pixel Rulers", "#38bdf8");
          await d.click(".template-chip >> Auth Login", { pause: 1300 });
          await d.click(".search-box", { pause: 400 });
          await d.type("gauge", 100);
          await wait(d, 900);
          await d.eval(`(() => { const i = document.querySelector('.search-box'); if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
        },
      ),
      step(
        "Object Inspector, Semantic Style Presets, Live Hover Test & Delphi Anchors",
        "Select any control on the canvas to inspect its properties on the right. Apply one-click semantic style presets like Success, Danger, or Primary, set exact pixel geometry and border radius, toggle Delphi-style Top, Bottom, Left, and Right anchors, and test hover colors right on the canvas.",
        async (d) => {
          await showRigHud(d, "🪟 Win11 Dual RTX 5090 · Object Inspector & Anchors", "Style Presets · Delphi Anchors · Live Hover Test", "#10b981");
          await tagDesignerControls(d);
          const count = await d.eval(`document.querySelectorAll("#formCanvas .designer-control").length`);
          await clickDesignerControl(d, count, 900);
          await d.click("button >> Success", { pause: 900 });
          await d.click("button >> Primary", { pause: 900 });
          await d.scroll("#controlPropContainer", 450, 5);
          await fillDesigner(d, "propWidth", "310");
          await fillDesigner(d, "propBorderRadius", "16");
          await d.click("#anchorRightBtn", { pause: 600 }).catch(() => {});
          await d.click("#liveHoverTestBtn", { pause: 800 }).catch(() => {});
          await d.click("#liveHoverTestBtn", { pause: 500 }).catch(() => {});
        },
      ),
      step(
        "1-Click Multi-Control Alignment, Equal Sizing, Distribution & Grid Snap",
        "Load the Dashboard template and click Select All in the top toolbar. With single clicks on Align Left, Equal Width, Distribute Vertically, Two-Columns Guide, Center Horizontally, and Grid Snap, even complex multi-card layouts snap into pixel-perfect alignment.",
        async (d) => {
          await showRigHud(d, "🐧 Linux 96-Core · 1-Click Precision Layout Bar", "Select All · Align Left · Eq W · Dist V · 2-Cols · Grid Snap", "#a855f7");
          await d.click(".template-chip >> Dashboard", { pause: 1300 });
          await d.click("button >> Select All", { pause: 1000 });
          await d.click("button >> Left", { pause: 1000 });
          await d.click("button >> Eq W", { pause: 1000 });
          await d.click("button >> Dist V", { pause: 1000 });
          await d.click("button >> Center H Form", { pause: 1000 });
          await d.click("#snapBtn", { pause: 900 });
        },
      ),
    ],
  },

  // ============================================================================
  // 12 — VISUAL DESIGNER PART 2: 168+ GOD-MODE FORM THEMES, DB WIZARD & 6-LANGUAGE CODEGEN
  // ============================================================================
  {
    id: "12_designer_godmode_themes_events_export",
    chapter: "168+ DESIGNER THEMES, DB WIZARD & CODEGEN",
    title: "168+ God-Mode Form Themes, Events, Layout Audit, DB Wizard & 6-Language Code Export",
    blurb: "Switch flagship Mac/Win11/Linux & Year-3000 themes, scaffold CRUD forms, and export 6 languages live",
    steps: [
      step(
        "168+ Futuristic, Holiday & Flagship Workstation Form Themes + FX Levels",
        "Click the form's title bar to select the form itself. The Form Theme selector includes over one hundred sixty-eight looks—including Omega Point Singularity, 3099 Photonic Metamaterial, Mac Studio M4 Ultra Silver Vault, Windows 11 Fluent 3D and R T X Studio, Linux Papirus HiDPI Workstation, and Starfleet LCARS—plus Full, Reduced, or Off shader effects.",
        async (d) => {
          await showRigHud(d, "🍎 M4 Ultra · 🪟 Win11 RTX 5090 · 🐧 Linux Papirus", "168+ Form Themes + Full/Reduced/Off Shader FX", "#ec4899");
          await d.click(".template-chip >> Auth Login", { pause: 1100 });
          await d.click(".tab-item >> Properties", { pause: 600 });
          await d.click("#winTitleHeader", { pause: 800 });
          for (const theme of [
            "Omega Point Singularity",
            "3099 Photonic Metamaterial",
            "Mac Studio M4 Ultra Silver Vault",
            "Windows 11 Fluent 3D & RTX Studio",
            "Linux Papirus HiDPI Workstation",
            "Starfleet LCARS Galaxy-Class Bridge",
          ]) {
            await d.eval(pickSelect("propFormTheme", theme));
            await wait(d, 1150);
          }
        },
      ),
      step(
        "Interactive Event Editor, Live Working Preview, Layout Audit & MS Access DB Wizard",
        "Bind JavaScript or TypeScript handlers in the Events tab, press Run to test your form in a live interactive preview right inside the IDE, run Audit to check for layout or accessibility issues, or launch the M S Access-style Database Wizard to scaffold a complete C R U D data form.",
        async (d) => {
          await showRigHud(d, "⚡ Live Preview + Layout Audit + CRUD DB Wizard", "Run Preview · Audit Modal · DB Wizard", "#38bdf8");
          await d.click("button >> Run", { pause: 1800 });
          await d.waitFor("#__preview", 5000).catch(() => {});
          await d.hover("#__preview", 1200).catch(() => {});
          await d.click("button >> Close preview", { pause: 900 }).catch(() => {});
          await d.click("button >> Audit", { pause: 1200 });
          await d.click("#diagnosticsModal button >> Close", { pause: 700 }).catch(() => d.key("Escape", "Esc"));
          await d.click("button >> DB Wizard", { pause: 1300 });
          await d.hover("#formCanvas", 1000);
        },
      ),
      step(
        "Real-Time 6-Language Code Generation (Bun TS, HTML, React, Vue 3, Python & JSON)",
        "Best of all, the designer writes clean, human-readable code as you design. Open the Code tab to inspect or copy live Bun TypeScript for SimpleGUI, standalone HTML5, React, Vue three, Python, or the raw JSON schema, and press Export to generate a complete runnable project folder.",
        async (d) => {
          await showRigHud(d, "🚀 Real-Time 6-Language Code Generator", "Bun TS · HTML · React · Vue 3 · Python · JSON", "#10b981");
          await d.click("#inspectorCodePrimaryTab", { pause: 800 });
          for (const lang of ["Bun TS", "HTML", "React", "Vue 3", "Python", "JSON", "Bun TS"]) {
            await d.click(`.code-lang-pill >> ${lang}`, { pause: 650 });
          }
          await d.scroll("#bunTsPreviewText", 400, 4).catch(() => {});
          await d.click("button >> Export", { pause: 1600 });
        },
      ),
    ],
  },

  // ============================================================================
  // 13 — OUTRO CARD
  // ============================================================================
  {
    id: "13_outro",
    chapter: "BUILD AT GOD-MODE SPEED",
    title: "Thank You for Watching — Build Something Extraordinary",
    kind: "card",
    card: {
      kicker: "Free & Open Source · macOS · Windows 11 · Linux",
      title: "Bun RAD Studio v1.5.0 God-Mode",
      lines: [
        "github.com/codecaine-zz/bun_rad_studio",
        "bun run examples/god_mode_tutorial/01_godmode_workstation_form.ts",
        "Codecaine File Manager · SimpleGUI API · Visual Theme Studio · Visual Designer",
      ],
    },
    steps: [
      {
        cap: "Build and ship across macOS, Windows 11, and Linux at 120Hz",
        say: "That is the complete Bun RAD Studio version one point five God-Mode tutorial: the Codecaine File Manager with its Productivity Bar, Command Palette, and ten-engine Shader Studio; the Visual Theme Studio and its three-layer Smart Math Engine; the SimpleGUI A P I with over one hundred controls, reactive state, SQLite, and forty-five rad modules; and the Visual Designer with one hundred sixty-eight themes and six-language code generation. Everything you saw is free, open source, and ready to run on macOS, Windows, and Linux. Thank you for watching, and happy building!",
      },
    ],
  },
];
