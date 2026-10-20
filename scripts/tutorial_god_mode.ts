#!/usr/bin/env bun
/**
 * "Bun RAD Studio v1.5.0: The Complete God-Mode Master Tutorial"
 *
 * Covers every new v1.5.0 feature across:
 *   1. Codecaine File Manager v1.5.0 (God-Mode Productivity Bar, Command Palette, RAD Templates,
 *      Cross-Platform Mac M4 Ultra / Windows 11 Dual RTX 5090 / Linux 96-Core Optimizers,
 *      AAA 10-Engine Theme & Shader Studio, 7 Pro Power-Ups, Synced Terminal, 30+ Studios & 4-Engine Databases)
 *   2. Visual Theme Studio Pro & 3-Layer Smart Math Engine (`src/features/theme-studio/`)
 *   3. SimpleGUI API (`src/simplegui.ts`, `src/features/rad/`, `src/features/fd|sd|tokei|gdu|watchexec`)
 *   4. Bun RAD Studio SimpleGUI Visual Designer (`src/ide/`)
 *
 * Usage:
 *   bun scripts/tutorial_god_mode.ts list
 *   bun scripts/tutorial_god_mode.ts audio [--shard i/n]
 *   bun scripts/tutorial_god_mode.ts record [ids,...]
 *   bun scripts/tutorial_god_mode.ts build
 *   bun scripts/tutorial_god_mode.ts all
 *
 * Every chapter is recorded 100% fresh and live — ZERO reused external video clips.
 */
import "./lib/tts_edge_default";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { seedDemoWorkspace } from "./lib/demo_workspace";
import { hostApp, hostDesigner, type HostedApp } from "./lib/host_app";
import { loadStage, outputs, serveStage, type StageServer } from "./lib/rad_stage";
import { EDGE_VOICE, FFMPEG, fmtTime, sh } from "./lib/video_pipeline";
import { runTutorial, type Suite } from "./lib/step_video";
import { GOD_HOME, godModeChapters, godStages } from "./lib/god_mode_tutorial_script";
import type { Chapter, World } from "./lib/fm_tutorial_types";
import { startThemeStudioServer } from "../src/features/theme-studio";

// Isolate SimpleGUI theme persistence to a throwaway directory during recording
mkdirSync("/tmp/godmode_rad_home", { recursive: true });

const ROOT = process.cwd();
const ROOT_DIR = "/tmp/godmode_fm_world";
const HOME = GOD_HOME;
const DATA = `${ROOT_DIR}/data`;
const GRAVE = `${ROOT_DIR}/grave`;
const ZDOT = `${ROOT_DIR}/zdot`;
const EXAMPLES = join(ROOT, "examples", "god_mode_tutorial");
const FM_PORT = 51688;
const CDP_PORT = 9388;
const VIEW_H = 972;

const clean = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+$/, "");

function capture(cmd: string[], cwd: string): string {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  return clean(r.stdout.toString() + r.stderr.toString());
}

function seedWorld(): World {
  rmSync(ROOT_DIR, { recursive: true, force: true });
  mkdirSync(ROOT_DIR, { recursive: true });
  seedDemoWorkspace(HOME, join(ROOT_DIR, "frames"));
  const put = (rel: string, body: string) => {
    const p = join(HOME, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, body);
  };

  // Seed fresh God-Mode sample files inside Projects/shop-app
  put("Projects/shop-app/godmode-cluster.json", JSON.stringify({
    version: "1.5.0",
    rigs: ["Mac Studio M4 Ultra 6K XDR", "Windows 11 Dual RTX 5090", "Linux Threadripper PRO 96-Core"],
    refreshRateHz: 120,
  }, null, 2));
  put("Projects/shop-app/README-GODMODE.md", "# Flagship Workstation Suite v1.5.0\n\n- 120Hz ProMotion / OLED / Wayland\n- 310 Themes & 194 Shaders\n");

  mkdirSync(ZDOT, { recursive: true });
  writeFileSync(
    join(ZDOT, ".zshrc"),
    `HISTFILE=${ZDOT}/.history\nPROMPT='%F{cyan}%1~%f %F{magenta}❯%f '\nRPROMPT=''\n`,
  );
  return { home: HOME, data: DATA, put, big: "" };
}

class GodModeEnv {
  c!: Cdp;
  fmProc: ReturnType<typeof Bun.spawn> | null = null;
  themeServer: ReturnType<typeof startThemeStudioServer> | null = null;
  host: HostedApp | null = null;
  stageServer: StageServer | null = null;

  async start() {
    this.c = await Cdp.launch(CDP_PORT, "/tmp/godmode_chrome_profile", 1920, VIEW_H);
  }

  stopServers() {
    try { this.fmProc?.kill(9); } catch {}
    this.fmProc = null;
    try { this.themeServer?.stop(true); } catch {}
    this.themeServer = null;
    try { this.host?.stop(); } catch {}
    this.host = null;
    try { this.stageServer?.stop(); } catch {}
    this.stageServer = null;
  }

  stop() {
    this.stopServers();
    this.c.close();
  }

  async open(ch: Chapter, _world: World) {
    this.stopServers();
    await sleep(450);
    const spec = godStages[ch.id];
    if (!spec) return;

    if (spec.mode === "fm") {
      const path = spec.path ?? `${HOME}/Projects/shop-app`;
      this.fmProc = Bun.spawn(
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
          path,
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
        await sleep(250);
      }
      await this.c.goto(`http://127.0.0.1:${FM_PORT}/`);
      await this.c.eval(
        `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')?.click()`,
      );
      await sleep(700);
      if (spec.view) {
        await this.c.eval(`document.querySelector(${JSON.stringify(spec.view)})?.click()`);
        await sleep(600);
      }
      return;
    }

    if (spec.mode === "theme_studio") {
      this.themeServer = startThemeStudioServer({ port: 0, host: "127.0.0.1" });
      await this.c.goto(`http://127.0.0.1:${this.themeServer.port}/`, null);
      await sleep(1200);
      return;
    }

    if (spec.mode === "designer") {
      rmSync(`${ROOT_DIR}/designer_draft`, { recursive: true, force: true });
      this.host = hostDesigner(`${ROOT_DIR}/designer_draft`);
      await this.c.goto(this.host.url, null);
      await sleep(1800);
      return;
    }

    if (spec.mode === "rad_stage") {
      if (spec.term && "command" in spec.term) {
        outputs[ch.id] = capture(spec.term.command, ROOT);
      }
      this.stageServer = serveStage();
      let app: string | undefined;
      if (spec.make && spec.file) {
        const mod: any = await import(join(EXAMPLES, spec.file));
        this.host = await hostApp(() => mod[spec.make!]());
        app = this.host.url;
      }
      await this.c.goto(this.stageServer.url, null);
      await sleep(600);
      await loadStage(
        { c: this.c },
        { file: resolve(EXAMPLES, spec.file ?? ""), title: spec.title ?? ch.title, app, layout: "split" },
      );
      if (!app) await this.c.eval("window.__stage.idle()");
      await sleep(1400);
      if (app) {
        await this.c.evalFrame(
          "#appframe",
          `document.documentElement.style.zoom = ${JSON.stringify(String(spec.zoom ?? 1.1))}`,
        );
        await sleep(450);
      }
    }
  }
}

function notesText(marks: Array<{ at: number; title: string }>, total: number): string {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const chaptersText = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  return `# Bun RAD Studio v1.5.0: The Complete God-Mode Master Tutorial (${fmtTime(total)})

## 🏆 Best YouTube Titles (High-CTR + Search SEO Optimized)

### Option 1 — Primary Recommended (Best Balance of Curiosity + High-Volume Dev Keywords)
\`\`\`text
Build Native Desktop Apps in Seconds With Bun & TypeScript (Full v1.5 God-Mode Tutorial)
\`\`\`

### Option 2 — Feature-Packed Power-User Hook (High CTR for IDE / Tooling / Linux / Mac / Windows Devs)
\`\`\`text
I Built an Entire Desktop IDE, 120Hz File Manager & Visual Form Designer in Bun (Open Source)
\`\`\`

### Option 3 — Direct Product + Hardware Flagship Title
\`\`\`text
Bun RAD Studio v1.5 God-Mode Tutorial: File Manager, SimpleGUI API & Visual Designer (Mac/Win/Linux)
\`\`\`

### Thumbnail Text Ideas (3–5 Words Max for High Mobile CTR)
- \`DELPHI FOR TYPESCRIPT?! ⚡\`
- \`1 FILE = NATIVE APP\`
- \`BUN v1.5 GOD MODE 🔥\`
- \`310 THEMES • 101 WIDGETS\`

---

## 📋 Copy-and-Paste YouTube Description (Algorithm & Search Optimized)

\`\`\`text
Build native cross-platform desktop apps in seconds with Bun and TypeScript — no Electron bloat, no webpack config, and zero setup. In this complete v1.5.0 God-Mode Masterclass, we tour every new feature of the open-source Bun RAD Studio suite across macOS (Mac Studio M4 Ultra 6K XDR), Windows 11 Pro (Threadripper PRO + Dual RTX 5090), and Linux Wayland HiDPI (96-Core Workstation).

⬇️ FREE DOWNLOAD & SOURCE CODE (MIT Open Source)
🔥 GitHub Repository: ${REPO}
📦 Latest Releases (Mac / Windows / Linux): ${REPO}/releases/latest
💻 Run the Examples from this Video: ${REPO}/tree/main/examples/god_mode_tutorial
📖 SimpleGUI API Reference: ${REPO}/blob/main/docs/SIMPLEGUI_API.md
🎨 Visual Designer & Codegen Guide: ${REPO}/blob/main/docs/API.md
🧰 System CLI Engines API: ${REPO}/blob/main/docs/SYSTEM_UTILITIES_API.md

⏱️ TIMESTAMPS / CHAPTERS
${chaptersText}

🚀 WHAT YOU WILL LEARN IN THIS TUTORIAL

1️⃣ CODECAINE FILE MANAGER v1.5.0 (GOD-MODE PRODUCTIVITY & 10-ENGINE SHADER STUDIO)
• Instant top-bar view switching (⌥1–⌥8: List, Icons, Details, Files, Home, Tools, Split View, Dual Pane)
• God-Mode Productivity Bar: 1-click file-kind filter chips, instant substring filter (⌘⌥F), row grouping & density
• Universal Command Palette (⌘⇧P) with mode prefixes (>, @, ?, +, #) & 12 RAD New-From-Template scaffolds (⌘⌥K)
• Floating Selection Action Bar with 1-click color tags, Quick Look, Code Editor & Universal Archive Extraction (⌘⇧E)
• 1-Click Hardware Optimizers for Apple Silicon Mac M4 Ultra (120Hz ProMotion / Display-P3), Windows 11 DirectX 12 WebView2 (Mica/Acrylic), and Linux Wayland HiDPI
• AAA 10-Engine Immersion Studio: 310 themes, 194 procedural shaders, 8 Master Director's Cut presets (⌥M), 14 3D spinning folder & Flash 2Advanced 3000 animations (⌥9), 34 CRT/Cinema/VFX screen filters (⌥F), 3D stage tilt (⌥S), 120Hz cursor trails (⌥T), 8K wallpapers (⌥W) & 18 animated US holidays (⌥H)
• 7 Pro Theme Power-Ups: 25-step Undo/Redo (⌥Z/⌥Y), Keep FX Swap Colors (⌥C), 49 vector icon packs (⌥I), Hold-to-Peek plain readability (⌥\\), and zero-dialog random hotkeys (⌥R / ⌥E / ⌥P / ⌥U / ⌥0)
• 2-Way Synced Terminal (Ctrl+\`) with safe cross-shell quoted paths (⌘⌥V) for zsh, bash, PowerShell, CMD, Git Bash & WSL
• 30+ Built-in Studios (Code Editor, Multi-File Replace, Git/LOC Dev Tab, AmpDeck 10-Band EQ + 108 Visualizers, Paint Studio, 24 Arcade Games) & 4-Engine Database Hub (SQLite, MySQL, PostgreSQL, Redis)

2️⃣ VISUAL THEME STUDIO PRO & 3-LAYER SMART MATH ENGINE
• Generate complete WCAG AA/AAA contrast-validated design systems from 3 inputs (Base Mode, Primary, Accent)
• Auto-calculated 10-step neutral shade scales, surface vibes (Frosted Glass, Neon Border, Matte, Flat), Pro Token Inspector & 1-click JSON export

3️⃣ SIMPLEGUI API, 45 RAD MODULES & 10 SYSTEM CLI ENGINES
• Build native desktop windows in a single TypeScript file with \`newSimpleWindow()\`
• 4-line compound form helpers (\`addFormField\`, \`addFormDropdown\`, \`addFormSlider\`, \`addFormSwitch\`), rows, auto-wrapping grids & cards
• 100+ controls including VLang parity & enterprise telemetry widgets (Hero Banners, Score Cards, Donut Charts, Activity Rings, Knobs, Gauges, Status Docks)
• Two-way reactive state store (\`bindState\`, \`onStateChange\`, \`setState\`), SweetAlert2 \`fire()\` modals, per-control right-click context menus & \`withBusyState()\`
• Native SQLite apps with \`rad.sqliteutils\`, 45 zero-dependency \`rad.*\` modules, 10 system tools (\`fd\`, \`sd\`, \`tokei\`, \`gdu\`, \`watchexec\`) as plain functions, and \`bun build --compile\` single-binary packaging

4️⃣ BUN RAD STUDIO SIMPLEGUI VISUAL DESIGNER (DELPHI / VB WYSIWYG IDE)
• Drag-and-drop 101 controls, 10 ready-made starter templates, pixel rulers & Object Inspector
• Semantic style presets, Delphi-style Top/Bottom/Left/Right anchors, live hover testing & 1-click alignment/distribution
• 168+ futuristic, holiday & flagship workstation form themes, Layout Audit modal & MS Access-style CRUD Database Wizard
• Real-time 6-language code generation: Bun TypeScript, HTML5, React, Vue 3, Python & JSON

⚡ QUICK START
git clone ${REPO}.git
cd bun_rad_studio
bun install
bun run examples/god_mode_tutorial/01_godmode_workstation_form.ts

#BunJS #TypeScript #DesktopApps #OpenSource #Programming #WebDev #FileManager #SQLite #DeveloperTools #Linux #macOS #Windows11 #GUI #RAD #SoftwareEngineering
\`\`\`

---

## 🏷️ Copy-and-Paste YouTube Studio Tags (500-Character Limit Optimized)

\`\`\`text
bun,bun js,typescript,typescript gui,bun rad studio,simplegui,desktop app development,electron alternative,tauri alternative,delphi ide,visual basic form designer,wysiwyg form builder,open source file manager,macos file manager,windows 11 file manager,linux file manager,sqlite gui,mysql gui,postgresql gui,redis gui,rapid application development,bun build compile,single binary typescript,webview bun,developer productivity tools,codecaine file manager,react code generator
\`\`\`

## Production Notes

- **100% Fresh Live Recording**: Every chapter in this tutorial was recorded live in headless Chrome at 2x Retina scale (\`1920x972\` above a \`108px\` dedicated caption strip = \`1920x1080\` Full HD at 30fps, CRF 14, Lanczos scaling, Display-P3 color). Zero reused external clips.
- **Audio**: Microsoft Edge Neural TTS (${EDGE_VOICE}) normalized to \`-16 LUFS\` stereo \`256 kbps\` AAC over an ambient generative chord bed.
- **Reproduce / Rebuild**:
  - \`bun scripts/tutorial_god_mode.ts list\`
  - \`bun scripts/tutorial_god_mode.ts audio\`
  - \`bun scripts/tutorial_god_mode.ts record\`
  - \`bun scripts/tutorial_god_mode.ts build\`
  - \`bun scripts/tutorial_god_mode.ts all\`
`;
}

const env = new GodModeEnv();
const suite: Suite = {
  name: "god_mode",
  chapters: godModeChapters,
  seedWorld,
  open: (ch, world) => env.open(ch, world),
  start: () => env.start(),
  stop: () => env.stop(),
  cdp: () => env.c,
  notes: notesText,
  rate: "+4%",
  gap: 0.4,
  viewHeight: VIEW_H,
};

await runTutorial(suite, process.argv.slice(2));
process.exit(0);
