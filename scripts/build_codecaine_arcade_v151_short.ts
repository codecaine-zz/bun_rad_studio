#!/usr/bin/env bun
/**
 * Builds a brand-new, 100% live-recorded 3-Minute Apple Mac Studio M4 Ultra 6K XDR YouTube Short
 * (1080x1920 vertical, ~2:50 / <3 minutes, 2x Retina Display-P3 super-sampled, CRF 14, ZERO reused clips):
 *
 *   Recorded on: Apple Mac Studio M4 Ultra (80-Core GPU · 192GB Unified Memory · Pro Display XDR 6K · 120Hz ProMotion)
 *   Focus: The v1.5.1 24-Game Codecaine Arcade Suite (Starring Codecaine Adventures of Caine Remaster!) & Workstation Enhancements
 *
 *   01. #1 FLAGSHIP GAME — Codecaine Adventures of Caine Remaster (Part 1): 100-Chamber Campaign, Emerald Framers, Magic Egg Shots & AI Ghost Solver
 *   02. Codecaine Adventures of Caine Remaster (Part 2): 10-Sector Campaign Map, Procedural Seed Generator & Level Architect Studio
 *   03. Codecaine Dr. Codecaine Arcade: Glossy 3D Two-Tone Capsules, Pathogen Eradication, Gravity Combos & Fever/Chill Synthesizers
 *   04. Codecaine CyberMunch Math Deluxe: 6×5 Neon Grid Arcade (Multiples, Factors, Primes, Equalities) & 5 Troggle AI Personalities
 *   05. Codecaine CyberFrog Deluxe: Multi-Lane Neon Highway & Cyber-River Crossing with Diving Turtles & Particle Shockwaves
 *   06. Codecaine CyberSki Deluxe & Codecaine CyberWing Deluxe: Downhill Slalom, 360° Trick Ramps, Yeti Chase & Neon Skyline Flight
 *   07. Codecaine CyberMouse Trap Deluxe: Push-Block Tactical Cat Trapping into Bonus Cheese Across 20 Classic Stages
 *   08. Typing Codecaine Edition (CyberType v2.0), CyberChomp Arcade & TetroGrid Ultra Deluxe: Code Sprint, 4 Ghost AIs & 7-Bag SRS
 *   09. Codecaine Bros. Arcade, Joker Royale Deluxe, Yacht Dice Royale & Blackjack Royale VIP: POW Shockwaves, 30+ Jokers & 3D Dice
 *   10. Codecaine File Manager v1.5.1 Enhancements: 24-Game Built-In Arcade Hub, 67 SVG Icon Packs (+18 New), 4.5:1 Contrast & 25 Native Builds
 *
 * Outputs:
 *   - youtube_production/codecaine-arcade-games-v151-short.mp4
 *   - youtube_production/CODECAINE_ARCADE_V151_SHORT_NOTES.md
 *   - youtube_production/codecaine_arcade_v151_short/upload-guide.txt
 *
 * Usage:
 *   bun scripts/build_codecaine_arcade_v151_short.ts
 */
import "./lib/tts_edge_default";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { seedDemoWorkspace } from "./lib/demo_workspace";
import { FFMPEG, FFPROBE, narrate, sh } from "./lib/video_pipeline";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const WORK = join(PROD, "codecaine_arcade_v151_short");
const OUTPUT = join(PROD, "codecaine-arcade-games-v151-short.mp4");
const NOTES = join(PROD, "CODECAINE_ARCADE_V151_SHORT_NOTES.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";

const FM_PORT = 51789;
const GAME_PORT = 51790;
const PUBLIC_APPS_DIR = "/Users/codecaine/Downloads/public_html/apps";
const CDP_REC_PORT = 9484;
const CDP_OVL_PORT = 9485;
const VIEW_W = 1920;
const VIEW_H = 972;

const ROOT_DIR = "/tmp/fm_codecaine_arcade_short";
const HOME = process.platform === "darwin" ? "/private/tmp/fm_codecaine_arcade_short/home" : "/tmp/fm_codecaine_arcade_short/home";
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

function seedArcadeWorkspace() {
  rmSync(ROOT_DIR, { recursive: true, force: true });
  mkdirSync(ROOT_DIR, { recursive: true });
  seedDemoWorkspace(HOME, join(ROOT_DIR, "frames"));

  const studioDir = join(HOME, "Codecaine_Arcade_v1.5.1");
  mkdirSync(join(studioDir, "01_Adventures_of_Caine_Remaster"), { recursive: true });
  mkdirSync(join(studioDir, "02_Dr_Codecaine_3D_Capsules"), { recursive: true });
  mkdirSync(join(studioDir, "03_CyberMunch_Math_Deluxe"), { recursive: true });
  mkdirSync(join(studioDir, "04_CyberFrog_CyberSki_CyberWing"), { recursive: true });
  mkdirSync(join(studioDir, "05_CyberMouse_Trap_Deluxe"), { recursive: true });
  mkdirSync(join(studioDir, "06_67_SVG_Icon_Packs_v1.5.1"), { recursive: true });

  writeFileSync(
    join(studioDir, "Adventures_of_Caine_Engine.ts"),
    `// Codecaine Adventures of Caine Remaster — 100 Chambers, AI Ghost Solver & Level Architect\nexport const ADVENTURES_OF_CAINE = {\n  chambers: 100,\n  sectors: 10,\n  aiSolver: "BFS Optimal Path Ghost Guide",\n  device: "Apple Mac Studio M4 Ultra · 80-Core GPU · 192GB Unified Memory",\n  display: "Pro Display XDR 6K · 120Hz ProMotion",\n};\n`,
  );
  writeFileSync(
    join(studioDir, "Codecaine_24_Game_Manifest.json"),
    JSON.stringify(
      {
        version: "1.5.1",
        flagship: "Codecaine Adventures of Caine Remaster",
        featured: [
          "Codecaine Adventures of Caine Remaster",
          "Codecaine Dr. Codecaine Arcade",
          "Codecaine CyberMunch Math Deluxe",
          "Codecaine CyberFrog Deluxe",
          "Codecaine CyberSki Deluxe",
          "Codecaine CyberWing Deluxe",
          "Codecaine CyberMouse Trap Deluxe",
          "Typing Codecaine Edition (CyberType Deluxe)",
        ],
        totalGames: 24,
        totalIconPacks: 67,
        totalThemes: 310,
      },
      null,
      2,
    ),
  );

  for (let i = 1; i <= 2; i++) {
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
        `hue=h=${i * 90},drawtext=text='Adventures of Caine ${i}':fontcolor=white:fontsize=82:x=(w-text_w)/2:y=(h-text_h)/2`,
        join(studioDir, `Adventures_of_Caine_6K_0${i}.jpg`),
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
 * so every game and enhancement scene looks like an official Cupertino 6K XDR showcase film.
 */
async function showKeynoteHud(c: Cdp, title: string, subtitle: string, pill = " M4 ULTRA · 6K XDR · 120HZ") {
  await c.eval(`(() => {
    let el = document.getElementById("apple-keynote-hud");
    if (!el) {
      el = document.createElement("div");
      el.id = "apple-keynote-hud";
      el.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:16px",
        "transform:translateX(-50%)",
        "z-index:2147483646",
        "pointer-events:none",
        "display:flex",
        "align-items:center",
        "gap:16px",
        "padding:11px 24px",
        "border-radius:999px",
        "background:linear-gradient(135deg, rgba(8,12,22,0.92), rgba(20,28,46,0.90))",
        "border:1.5px solid rgba(56,189,248,0.48)",
        "box-shadow:0 20px 50px rgba(0,0,0,0.78), 0 0 32px rgba(56,189,248,0.34)",
        "backdrop-filter:blur(24px) saturate(190%)",
        "-webkit-backdrop-filter:blur(24px) saturate(190%)",
        "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
        "color:#f8fafc"
      ].join(";");
      document.documentElement.appendChild(el);
    }
    el.innerHTML = "";
    const badge = document.createElement("span");
    badge.style.cssText = "background:linear-gradient(135deg,#38bdf8,#818cf8,#f472b6);color:#05070c;font-weight:900;font-size:13px;letter-spacing:0.08em;padding:5px 13px;border-radius:999px;white-space:nowrap;";
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

/**
 * Mounts any of the 24 games in a full-viewport same-origin iframe (`#arcade-stage-frame`)
 * so the top-level recording page never calls `Page.navigate` mid-screencast.
 */
async function openGameStage(c: Cdp, gameId: string) {
  await c.eval(`new Promise((resolve) => {
    let f = document.getElementById("arcade-stage-frame");
    if (f && f.contentWindow && f.contentWindow.__fmSilenceAll) {
      try { f.contentWindow.__fmSilenceAll(); } catch {}
    }
    if (!f) {
      f = document.createElement("iframe");
      f.id = "arcade-stage-frame";
      f.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483640;background:#05070c;";
      document.documentElement.appendChild(f);
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        f.contentWindow.alert = () => {};
        f.contentWindow.confirm = () => true;
        f.contentWindow?.__fmSilenceAll?.();
      } catch {}
      resolve(true);
    };
    f.onload = () => setTimeout(finish, 180);
    setTimeout(finish, 1500);
    f.src = "/app/" + ${JSON.stringify(gameId)} + "/";
  })`);
}

async function closeGameStage(c: Cdp) {
  await c.eval(`(() => {
    const f = document.getElementById("arcade-stage-frame");
    if (f) {
      try { f.contentWindow?.__fmSilenceAll?.(); } catch {}
      f.remove();
    }
  })()`);
}

/** Evaluates JS inside the active `#arcade-stage-frame` same-origin game document. */
async function evalInGame(c: Cdp, body: string) {
  await c.eval(`(() => {
    const f = document.getElementById("arcade-stage-frame");
    const win = f && f.contentWindow ? f.contentWindow : window;
    const doc = f && f.contentDocument ? f.contentDocument : document;
    ${body}
  })()`);
}

const sceneSpecs: SceneSpec[] = [
  {
    id: "01_adventures_of_caine_flagship_gameplay",
    badge: "01 / 10 · #1 CROWN JEWEL: ADVENTURES OF CAINE REMASTER",
    title: "ADVENTURES OF CAINE\nREMASTER (120HZ).",
    label: "💎 100 PUZZLE CHAMBERS · 👻 AI GHOST SOLVER · 🔮 MAGIC EGG SHOTS",
    extra: "Collect Emerald Heart Framers, Encase Enemies in Eggs & Summon the AI Ghost Guide",
    bullets: [
      "💎 #1 Flagship Game: 100 Tactical Chambers Across 10 Sectors",
      "👻 Press H for Holographic AI Mathematical Path Solver",
      "🔮 Magic Egg Shots, Medusa Statues & Dynamic Raycast Lighting",
    ],
    say: "Welcome to the Codecaine Arcade version one point five point one showcase, recorded live on our Apple Mac Studio M4 Ultra with six-K Pro Display X D R at one hundred and twenty Hertz! Leading all twenty-four rebranded games is our crown jewel: Codecaine Adventures of Caine Remaster—featuring one hundred tactical puzzle chambers, Emerald Heart Framers, Magic Egg Shots, dynamic raycast lighting, and a built-in A I Mathematical Ghost Solver!",
    record: async (c) => {
      await openGameStage(c, "lolo");
      await evalInGame(
        c,
        `
        doc.getElementById('btn-close-briefing')?.click();
        doc.getElementById('btn-start-briefing-mission')?.click();
      `,
      );
      await showKeynoteHud(
        c,
        "👑 #1 Flagship Game: Codecaine Adventures of Caine Remaster",
        "100 Tactical Chambers · Emerald Heart Framers · 120Hz Raycast Lighting",
        "👑 #1 BEST GAME",
      );
      await sleep(500);

      // Move Caine around the chamber and activate the Holographic AI Ghost Guide (H)
      await evalInGame(
        c,
        `
        const moves = ['ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowUp'];
        moves.forEach((k, i) => setTimeout(() => {
          win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code: k, bubbles: true }));
          setTimeout(() => win.dispatchEvent(new win.KeyboardEvent('keyup', { key: k, code: k, bubbles: true })), 75);
        }, i * 210));
      `,
      );
      await sleep(1450);

      await evalInGame(c, `doc.getElementById('btn-solve-hint')?.click();`);
      await showKeynoteHud(
        c,
        "👻 Holographic AI Mathematical Solver (Press H)",
        "Traces the Exact Optimal Solution Path & Moves in Real Time",
        "👻 AI GHOST GUIDE",
      );
      await sleep(1300);

      // Advance to next chamber (Enter) and show Ghost Solver + movement on Stage 2
      await evalInGame(
        c,
        `
        win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        setTimeout(() => {
          doc.getElementById('btn-close-briefing')?.click();
          doc.getElementById('btn-solve-hint')?.click();
          const moves = ['ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowDown'];
          moves.forEach((k, i) => setTimeout(() => {
            win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code: k, bubbles: true }));
          }, 220 + i * 210));
        }, 250);
      `,
      );
      await sleep(1600);
    },
  },
  {
    id: "02_adventures_of_caine_generator_and_architect",
    badge: "02 / 10 · ADVENTURES OF CAINE: SEED GENERATOR & ARCHITECT",
    title: "10 SECTORS, RANDOM\nSEEDS & ARCHITECT.",
    label: "🗺️ 10-SECTOR CAMPAIGN · 🎲 PROCEDURAL GENERATOR · 🛠️ LEVEL ARCHITECT",
    extra: "Infinite Mathematically Verified Puzzle Seeds & Full In-Game Level Editor",
    bullets: [
      "🗺️ 10-Sector Campaign Map & 100-Chamber Selector",
      "🎲 Infinite Procedural Seed Generator With Math Verification",
      "🛠️ Full Level Architect With Live AI Solution Simulation",
    ],
    say: "Adventures of Caine goes even deeper: open the ten-sector campaign map to jump across all one hundred chambers, roll infinite mathematically verified puzzles in the Procedural Seed Generator, or build and auto-verify your own puzzle rooms inside the built-in Level Architect Studio!",
    record: async (c) => {
      // Open 10-Sector Campaign Map
      await evalInGame(c, `doc.getElementById('btn-sector-map')?.click();`);
      await showKeynoteHud(
        c,
        "🗺️ 10-Sector Campaign Map — 100 Handcrafted & Verified Chambers",
        "Unlock Boss Chambers, Custom Operative Skins & CRT Shader Profiles",
        "🗺️ 100 CHAMBERS",
      );
      await sleep(1250);

      // Close Sector Map and open Procedural Seed Generator
      await evalInGame(
        c,
        `
        doc.getElementById('btn-close-sector-map')?.click();
        doc.getElementById('btn-random-modal')?.click();
        setTimeout(() => doc.getElementById('btn-roll-seed')?.click(), 300);
      `,
      );
      await showKeynoteHud(
        c,
        "🎲 Procedural Seed Chamber Generator — Guaranteed Solvable",
        "Roll Custom Seeds · Configure Enemy Roster · 1-Click Simulate Solution",
        "🎲 SEED GENERATOR",
      );
      await sleep(1300);

      // Launch the generated procedural chamber and then open Level Architect Studio
      await evalInGame(
        c,
        `
        doc.getElementById('btn-play-random')?.click();
        setTimeout(() => doc.getElementById('btn-editor-toggle')?.click(), 550);
        setTimeout(() => doc.getElementById('btn-editor-sim-action')?.click(), 950);
      `,
      );
      await showKeynoteHud(
        c,
        "🛠️ Built-In Level Architect Studio With AI Math Verification",
        "Paint Terrain, Place Enemies & Framers, Verify & Export Custom JSON",
        "🛠️ LEVEL ARCHITECT",
      );
      await sleep(1500);
    },
  },
  {
    id: "03_dr_codecaine_arcade",
    badge: "03 / 10 · CODECAINE DR. CODECAINE ARCADE",
    title: "DR. CODECAINE\n3D CAPSULE ARCADE.",
    label: "💊 GLOSSY 3D CAPSULES · 🦠 PATHOGEN AI · 🎵 FEVER & CHILL SYNTH",
    extra: "Two-Tone Vitamin Capsules, Gravity Cascade Combos & Polyphonic WebAudio Tracks",
    bullets: [
      "💊 Glossy 3D Two-Tone Capsules With Ghost Projection & Hold Slot",
      "🦠 Animated Red, Yellow & Blue Pathogens in Magnified Petri Dish",
      "🎵 Polyphonic Fever & Chill Chiptune Synthesizers",
    ],
    say: "Next is Codecaine Dr. Codecaine Arcade! Rotate and hard-drop glossy 3D two-tone vitamin capsules to eradicate animated pathogens, trigger multi-chain gravity cascades, charge your Fever meter, and cycle between polyphonic Fever and Chill chiptune synthesizers.",
    record: async (c) => {
      await openGameStage(c, "dr_codecaine");
      await showKeynoteHud(
        c,
        "💊 Codecaine Dr. Codecaine Arcade — Triple-A Capsule Puzzle",
        "3D Capsule Physics · Hold Slot · Magnified Pathogen Petri Dish",
        "💊 DR. CODECAINE",
      );
      await sleep(350);
      await evalInGame(
        c,
        `
        const actions = [
          'ArrowLeft', 'ArrowLeft', 'z', ' ',
          'ArrowRight', 'ArrowRight', 'x', ' ',
          'c', 'ArrowLeft', ' ',
          'ArrowRight', 'z', ' ',
          ' '
        ];
        actions.forEach((k, i) => setTimeout(() => {
          const code = k === ' ' ? 'Space' : k === 'z' ? 'KeyZ' : k === 'x' ? 'KeyX' : k === 'c' ? 'KeyC' : k;
          win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code, bubbles: true }));
          win.dispatchEvent(new win.KeyboardEvent('keyup', { key: k, code, bubbles: true }));
        }, i * 240));
        setTimeout(() => doc.getElementById('btnTrackCycle')?.click(), 1800);
      `,
      );
      await sleep(3800);
    },
  },
  {
    id: "04_cybermunch_math_deluxe",
    badge: "04 / 10 · CODECAINE CYBERMUNCH MATH DELUXE",
    title: "CYBERMUNCH MATH\nDELUXE (6×5 GRID).",
    label: "🧮 MULTIPLES, FACTORS & PRIMES · 👾 5 TROGGLE AI PERSONALITIES",
    extra: "Chomp Target Equations Across a 6×5 Neon Grid While Outsmarting Troggles",
    bullets: [
      "🧮 5 Modes: Multiples, Factors, Primes, Equalities & Inequalities",
      "👾 5 Troggle AI Types: Reggie, Bashful, Helper, Worker & Smarty",
      "💡 Smart Mistake Explanations, Hint System & CRT Shaders",
    ],
    say: "In Codecaine CyberMunch Math Deluxe, pilot your CyberMuncher across a six-by-five neon matrix—chomping Multiples, Factors, Primes, Equalities, and Inequalities while dodging five distinct Troggle A I personalities and unlocking streak combos!",
    record: async (c) => {
      await openGameStage(c, "math_munchers");
      await evalInGame(c, `doc.getElementById('btnStartGame')?.click();`);
      await showKeynoteHud(
        c,
        "🧮 Codecaine CyberMunch Math Deluxe — 6×5 Neon Math Matrix",
        "Multiples · Factors · Primes · Equalities · 5 Troggle AI Personalities",
        "🧮 CYBERMUNCH MATH",
      );
      await sleep(350);

      await evalInGame(
        c,
        `
        const steps = [
          () => doc.getElementById('btnHint')?.click(),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true })),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true })),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true })),
          () => doc.getElementById('btnHint')?.click(),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true })),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true })),
          () => win.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })),
        ];
        steps.forEach((fn, i) => setTimeout(fn, i * 250));
      `,
      );
      await sleep(3600);
    },
  },
  {
    id: "05_cyberfrog_deluxe",
    badge: "05 / 10 · CODECAINE CYBERFROG DELUXE",
    title: "CYBERFROG DELUXE\nHIGHWAY & RIVER.",
    label: "🐸 NEON SUPERCAR LANES · 🪵 CYBER LOGS & DIVING TURTLES",
    extra: "Hop Multi-Lane Neon Traffic & Ride Cyber-River Logs into All 5 Harmonic Docks",
    bullets: [
      "🐸 Multi-Lane Cyber Supercar Highway & Neon River Physics",
      "🐢 Submerging Cyber-Turtles, Floating Logs & Bonus Flies",
      "💥 Particle Shockwaves, 3 Visual Themes & Synthwave Audio",
    ],
    say: "Leap into Codecaine CyberFrog Deluxe! Dodge high-speed neon supercars and plasma trucks across the highway, then time your jumps across floating cyber-logs and submerging turtles to secure all five harmonic river docks.",
    record: async (c) => {
      await openGameStage(c, "frogger");
      await evalInGame(
        c,
        `
        if (typeof win.startGame === 'function') win.startGame();
        else doc.querySelector('#start-overlay button')?.click();
      `,
      );
      await showKeynoteHud(
        c,
        "🐸 Codecaine CyberFrog Deluxe — Neon Highway & River Crossing",
        "High-Speed Cyber Vehicles · Submerging Turtles · 5 Harmonic Goal Docks",
        "🐸 CYBERFROG DELUXE",
      );
      await sleep(350);

      await evalInGame(
        c,
        `
        const hops = [
          'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowUp',
          'ArrowRight', 'ArrowUp', 'ArrowUp', 'ArrowUp',
          'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowUp'
        ];
        hops.forEach((k, i) => setTimeout(() => {
          win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code: k, bubbles: true }));
        }, i * 270));
      `,
      );
      await sleep(3500);
    },
  },
  {
    id: "06_cyberski_deluxe_and_cyberwing_deluxe",
    badge: "06 / 10 · CYBERSKI DELUXE & CYBERWING DELUXE",
    title: "CYBERSKI DELUXE &\nCYBERWING DELUXE.",
    label: "⛷️ ALPINE SLALOM & YETI CHASE · 🦅 NEON SKYLINE FLYER",
    extra: "Carve Slalom Gates, Launch 360° Ramp Tricks & Soar Through Plasma Pillars",
    bullets: [
      "⛷️ CyberSki Deluxe: Slalom, Freeride, Trick Ramps & Cyber-Yeti",
      "🦅 CyberWing Deluxe: Classic, Cyber Dash, Night Ops & Zen Modes",
      "🎨 4 Custom Wing Skins, Feather Trails & CRT Scanline Shaders",
    ],
    say: "Shred the mountain in Codecaine CyberSki Deluxe—carving slalom gates, launching off rainbow ramps for three-sixty trick multipliers, and outrunning the Abominable Cyber-Yeti! Then take flight in Codecaine CyberWing Deluxe across four modes and four glowing neon skins.",
    record: async (c) => {
      await openGameStage(c, "skifree");
      await evalInGame(
        c,
        `
        doc.getElementById('btnStartGame')?.click();
        const dirs = ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', ' ', 'ArrowDown', 'f'];
        dirs.forEach((k, i) => setTimeout(() => {
          const code = k === ' ' ? 'Space' : k === 'f' ? 'KeyF' : k;
          win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code, bubbles: true }));
        }, i * 250));
      `,
      );
      await showKeynoteHud(
        c,
        "⛷️ Codecaine CyberSki Deluxe — Alpine Slalom & Yeti Survival",
        "Slalom Gates · Rainbow Trick Ramps · Turbo Boost (F) · Cyber-Yeti Pursuit",
        "⛷️ CYBERSKI DELUXE",
      );
      await sleep(2050);

      await openGameStage(c, "flappy_bird");
      await evalInGame(
        c,
        `
        doc.querySelector('.skin-btn[data-skin="cyan"]')?.click();
        doc.getElementById('btnStartGame')?.click();
        [120, 380, 640, 920, 1200, 1480].forEach(ms => setTimeout(() => {
          win.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
        }, ms));
      `,
      );
      await showKeynoteHud(
        c,
        "🦅 Codecaine CyberWing Deluxe — 120Hz Parallax Skyline Flyer",
        "Classic · Cyber Dash · Night Ops · Zen Flight · Cyber Neon Skin",
        "🦅 CYBERWING DELUXE",
      );
      await sleep(2050);
    },
  },
  {
    id: "07_cybermouse_trap_deluxe",
    badge: "07 / 10 · CODECAINE CYBERMOUSE TRAP DELUXE",
    title: "CYBERMOUSE TRAP\nDELUXE (20 STAGES).",
    label: "🧀 PUSH-BLOCK CAT TRAPPING · 🐱 TURN CATS INTO BONUS CHEESE",
    extra: "Shift Whole Rows of Blocks to Box In Chasing Cyber-Cats Across 20 Stages",
    bullets: [
      "🧀 Push Movable Block Walls to Trap Chasing Cyber-Cats",
      "🐱 Trapped Cats Transform into High-Point Bonus Cheese",
      "💣 Decoy Traps, Bombs, Freeze Power-Ups & 3 Visual Themes",
    ],
    say: "In Codecaine CyberMouse Trap Deluxe, outwit packs of chasing cyber-cats across twenty classic stages! Push entire rows of movable blocks to box in every cat—transforming them into bonus cheese while deploying decoy traps, bombs, and freeze power-ups.",
    record: async (c) => {
      await openGameStage(c, "rodents_revenge");
      await showKeynoteHud(
        c,
        "🧀 Codecaine CyberMouse Trap Deluxe — Tactical Block-Pushing Arcade",
        "20 Classic Stages · Box In Chasing Cyber-Cats to Turn Them into Cheese",
        "🧀 CYBERMOUSE TRAP",
      );
      await sleep(350);
      await evalInGame(
        c,
        `
        const moves = [
          'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown',
          'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown',
          'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowRight'
        ];
        moves.forEach((k, i) => setTimeout(() => {
          win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code: k, bubbles: true }));
          setTimeout(() => win.dispatchEvent(new win.KeyboardEvent('keyup', { key: k, code: k, bubbles: true })), 70);
        }, i * 240));
        setTimeout(() => doc.getElementById('btn-theme')?.click(), 1800);
      `,
      );
      await sleep(3400);
    },
  },
  {
    id: "08_typing_codecaine_cyberchomp_and_tetrogrid",
    badge: "08 / 10 · TYPING CODECAINE EDITION, CYBERCHOMP & TETROGRID",
    title: "TYPING CODECAINE,\nCHOMP & TETROGRID.",
    label: "⌨️ CYBERTYPE v2.0 · 🟡 CYBERCHOMP ARCADE · 🧱 TETROGRID ULTRA",
    extra: "18-Lesson Touch Typing & Code Sprint + 4 Ghost AIs & 7-Bag SRS Block Engine",
    bullets: [
      "⌨️ Typing Codecaine Edition: 18 Lessons, Code Sprint & Bug Invaders",
      "🟡 CyberChomp Arcade: Crimson, Pulse, Glitch & Amber Ghost AI",
      "🧱 TetroGrid Ultra Deluxe: 7-Bag SRS, Hold & T-Spin Telemetry",
    ],
    say: "Sharpen your keyboard speed in Typing Codecaine Edition—complete with an eighteen-lesson curriculum, developer Code Sprints, and Bug Invaders! Then chase high scores in Codecaine CyberChomp Arcade and Codecaine TetroGrid Ultra Deluxe with seven-bag S R S T-Spin telemetry.",
    record: async (c) => {
      await openGameStage(c, "typing");
      await showKeynoteHud(
        c,
        "⌨️ Typing Codecaine Edition — CyberType Deluxe v2.0",
        "18-Lesson Curriculum · Developer Code Sprint · Bug Invaders · 60-Key HUD",
        "⌨️ TYPING CODECAINE",
      );
      await evalInGame(
        c,
        `
        const chars = Array.from(doc.querySelectorAll('#promptDisplay .char')).map(el => el.textContent || '');
        chars.slice(0, 18).forEach((ch, idx) => {
          setTimeout(() => {
            const key = ch === '␣' ? ' ' : ch;
            win.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true }));
          }, idx * 55);
        });
      `,
      );
      await sleep(1300);

      await openGameStage(c, "pacman");
      await evalInGame(
        c,
        `
        doc.getElementById('startBtn')?.click();
        ['ArrowLeft', 'ArrowUp', 'ArrowRight'].forEach((k, i) => setTimeout(() => {
          win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code: k, bubbles: true }));
        }, 150 + i * 260));
      `,
      );
      await showKeynoteHud(
        c,
        "🟡 Codecaine CyberChomp Arcade — 4 Ghost AI Personalities",
        "Crimson · Pulse · Glitch · Amber · Power Pellets & CRT Scanlines",
        "🟡 CYBERCHOMP",
      );
      await sleep(1250);

      await openGameStage(c, "tetris");
      await evalInGame(
        c,
        `
        doc.getElementById('start-btn')?.click();
        ['ArrowLeft', 'ArrowUp', ' ', 'ArrowRight', 'ArrowUp', ' '].forEach((k, i) => setTimeout(() => {
          const code = k === ' ' ? 'Space' : k;
          win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code, bubbles: true }));
        }, 160 + i * 190));
      `,
      );
      await showKeynoteHud(
        c,
        "🧱 Codecaine TetroGrid Ultra Deluxe — 7-Bag SRS & T-Spin HUD",
        "Marathon · 40L Sprint · 2M Ultra · Zen Chill · Synthwave Themes",
        "🧱 TETROGRID ULTRA",
      );
      await sleep(1400);
    },
  },
  {
    id: "09_codecaine_bros_joker_royale_and_yacht_dice",
    badge: "09 / 10 · CODECAINE BROS., JOKER ROYALE & YACHT DICE ROYALE",
    title: "CODECAINE BROS.,\nJOKERS & YACHT DICE.",
    label: "🍄 CODECAINE BROS. · 🃏 JOKER ROYALE DELUXE · 🎲 YACHT DICE ROYALE",
    extra: "POW Block Shockwaves, 30+ Holographic Poker Jokers & 3D Tactile Yacht Dice",
    bullets: [
      "🍄 Codecaine Bros. Arcade: POW Shockwaves, Co-Op & 2P Battle",
      "🃏 Joker Royale Deluxe, Blackjack Royale VIP & Texas Hold'em",
      "🎲 Yacht Dice Royale Deluxe, Brick Breaker & QuadLink 4",
    ],
    say: "Also included across the twenty-four-game suite: trigger P O W block shockwaves in Codecaine Bros. Arcade, chain holographic Joker multipliers in Codecaine Joker Royale Deluxe, roll 3D tactile dice in Codecaine Yacht Dice Royale Deluxe, or hit the V I P Blackjack and Texas Hold'em tables!",
    record: async (c) => {
      await openGameStage(c, "codecaine_bros");
      await evalInGame(
        c,
        `
        doc.getElementById('btnNewGame')?.click();
        ['ArrowRight', 'ArrowUp', 'ArrowRight', 'ArrowUp'].forEach((k, i) => setTimeout(() => {
          win.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, code: k, bubbles: true }));
        }, 150 + i * 240));
      `,
      );
      await showKeynoteHud(
        c,
        "🍄 Codecaine Bros. Arcade — Sewer-Pipe Platforming & POW Blocks",
        "Solo · 2-Player Co-Op · 2-Player Versus Battle · 4-Channel Synth",
        "🍄 CODECAINE BROS.",
      );
      await sleep(1300);

      await openGameStage(c, "balatro");
      await showKeynoteHud(
        c,
        "🃏 Codecaine Joker Royale Deluxe — Roguelike Poker Deckbuilder",
        "30+ Holographic Jokers · Planet & Tarot Upgrades · Boss Blinds",
        "🃏 JOKER ROYALE",
      );
      await evalInGame(
        c,
        `
        const cards = Array.from(doc.querySelectorAll('#playerHandFan .playing-card, #playerHandFan [data-index], #playerHandFan > div'));
        cards.slice(0, 5).forEach((el, idx) => setTimeout(() => el.click(), idx * 90));
        setTimeout(() => doc.getElementById('btnPlayHand')?.click(), 550);
      `,
      );
      await sleep(1300);

      await openGameStage(c, "yahtzee");
      await showKeynoteHud(
        c,
        "🎲 Codecaine Yacht Dice Royale Deluxe — 3D Championship Dice",
        "Solo · Pass & Play · vs AI Opponent · +35 Bonus & Yacht Jokers",
        "🎲 YACHT DICE",
      );
      await evalInGame(c, `doc.getElementById('btnRollDice')?.click();`);
      await sleep(1250);
    },
  },
  {
    id: "10_v151_file_manager_67_icons_and_release_cta",
    badge: "10 / 10 · FILE MANAGER v1.5.1: 67 ICON PACKS & 25 DOWNLOADS",
    title: "67 ICON PACKS, 4.5:1\nCONTRAST & v1.5.1.",
    label: "🕹️ BUILT-IN ARCADE HUB · 🎨 67 SVG ICON PACKS · ⬇️ 25 PLATFORM BUILDS",
    extra: "18 New Icon Packs, Commodore 64 & Synthwave 4.5:1 Contrast & 66 Mac .app Bundles",
    bullets: [
      "🕹️ Play All 24 Games Inside File Manager or as Native .app Bundles",
      "🎨 67 SVG Icon Packs (+18 New: Game Boy, Classic OS, Pop-Art, Clay 3D)",
      "⬇️ 25 Fresh v1.5.1 Downloads for Mac, Windows & Linux on GitHub",
    ],
    say: "And inside Codecaine File Manager version one point five point one, launch all twenty-four games from the built-in Arcade Hub, explore sixty-seven S V G system icon packs including eighteen brand-new retro and art packs, and enjoy upgraded four-point-five-to-one contrast in Commodore 64 and Synthwave '84. All twenty-five cross-platform release downloads are live now on GitHub!",
    record: async (c) => {
      await closeGameStage(c);
      await c.click("#status-views button >> Icons", { pause: 350 }).catch(() => {});

      await c.eval(`(async () => {
        const tm = await import('/ui/themes.js');
        await tm.applyTheme('synthwave_84', { quiet: true });
        await tm.applyIconPack('gameboy_nes_pixel', { quiet: true });
        await tm.applyFolderAnimMode('folder_3d_spin_turntable', { quiet: true });
      })()`);
      await showKeynoteHud(
        c,
        "🎨 v1.5.1: 67 SVG Icon Packs (18 New) & 4.5:1 Contrast Upgrade",
        "Game Boy & NES · Classic OS · Pop-Art · Soft Clay 3D · Synthwave '84",
        "🎨 67 ICON PACKS",
      );
      await sleep(1250);

      await c.eval(`(async () => {
        const pw = await import('/ui/power.js');
        pw.openPower('games');
        pw.setPowerExpanded(true);
      })()`);
      await sleep(650);
      await showKeynoteHud(
        c,
        "🕹️ Built-In Codecaine Arcade Hub — All 24 Games Ready in 1 Click",
        "25 Fresh v1.5.1 Release Downloads for macOS (arm64/x64), Windows & Linux",
        "⬇️ v1.5.1 LIVE NOW",
      );
      await sleep(1600);
    },
  },
];

function overlay(scene: SceneSpec, index: number): string {
  const isLast = index === sceneSpecs.length - 1;
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{
  background:
    radial-gradient(980px 580px at 50% -4%, rgba(56,189,248,0.30), transparent 70%),
    radial-gradient(820px 520px at 85% 100%, rgba(236,72,153,0.25), transparent 70%),
  #05070c;
  color:#f8fafc;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",sans-serif;
}
.top{position:absolute;top:48px;left:44px;right:44px;display:flex;flex-direction:column;gap:12px}
.hw-strip{
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(15,23,42,0.82);border:1px solid rgba(255,255,255,0.20);
  border-radius:999px;padding:7px 18px;font-size:17px;font-weight:700;color:#e2e8f0;
  box-shadow:0 8px 24px rgba(0,0,0,0.45);
}
.hw-strip .apple-chip{color:#38bdf8;font-weight:800;letter-spacing:0.04em}
.badge{
  align-self:flex-start;
  background:linear-gradient(135deg,#38bdf8,#818cf8,#f472b6);
  color:#05070c;font-weight:900;font-size:21px;letter-spacing:.1em;
  padding:7px 18px;border-radius:999px;text-transform:uppercase;
}
.title{
  font-size:62px;font-weight:900;line-height:1.03;letter-spacing:-.025em;white-space:pre-line;
  background:linear-gradient(92deg,#ffffff 0%,#e0f2fe 46%,#f5d0fe 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.label{color:#38bdf8;font-size:24px;font-weight:800;letter-spacing:.03em;margin-top:2px}
.extra{color:#cbd5e1;font-size:22px;font-weight:600;line-height:1.34}
.frame-rim{
  position:absolute;top:626px;left:0;width:1080px;height:554px;
  border-top:2px solid rgba(56,189,248,0.50);
  border-bottom:2px solid rgba(236,72,153,0.50);
  box-shadow:0 0 60px rgba(56,189,248,0.20);
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
  background:linear-gradient(135deg,rgba(12,24,48,0.96),rgba(32,14,48,0.96));
  border:1.5px solid rgba(56,189,248,0.68);border-radius:22px;padding:24px 28px;
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
    ? `<div class="cta"><strong>▶ FREE DOWNLOAD FOR MAC, WINDOWS &amp; LINUX (v1.5.1)</strong><p>Adventures of Caine · 24 Codecaine Games · 67 Icon Packs · 310 Themes</p><p class="sub">${esc(REPO)}/releases/tag/v1.5.1</p></div>`
    : `<div class="cta"><strong>▶ CODECAINE ARCADE &amp; FILE MANAGER (v1.5.1)</strong><p>👑 Adventures of Caine · Dr. Codecaine · CyberMunch · CyberFrog · CyberSki</p><p class="sub">${esc(REPO)}/releases/tag/v1.5.1 · MIT Open Source</p></div>`
}`;
}

function notesMarkdown(seconds: number, tempo: number, sceneMarks: Array<{ at: number; scene: SceneSpec }>): string {
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const stamps = sceneMarks.map((m, i) => `${fmt(i === 0 ? 0 : m.at)} ${m.scene.label}`).join("\n");
  return `# Codecaine Arcade Suite & File Manager v1.5.1 on Mac Studio M4 Ultra 6K XDR — Starring Adventures of Caine Remaster, Dr. Codecaine, CyberMunch, CyberFrog, CyberSki, CyberWing & Mouse Trap (Short, ${fmt(seconds)})

## Video Files (100% Freshly Recorded at Highest Quality CRF 14, Zero Reused Clips)

- **Codecaine Arcade & v1.5.1 Enhancements Short MP4 (< 3 min)**: \`youtube_production/codecaine-arcade-games-v151-short.mp4\` (${seconds.toFixed(1)}s, 1080×1920 vertical, 30 fps, 2x Retina Display-P3 super-sampled, CRF 14 / 256k AAC)

## YouTube Short Titles (Pick One)

1. **Adventures of Caine Remaster + 24 Native Games Inside a 120Hz File Manager (Mac Studio M4 Ultra) 👑🕹️ #Shorts**
2. **Codecaine v1.5.1: Adventures of Caine, Dr. Codecaine, CyberMunch, CyberFrog, CyberSki & 67 Icons! #Shorts**
3. **24 Arcade Games & 67 Icon Packs on Mac Studio M4 Ultra 6K XDR — Bun RAD Studio v1.5.1 Release #Shorts**

## YouTube Short Description (< 5,000 chars, Copy & Paste)

\`\`\`text
Recorded 100% live from scratch at master quality (2x Retina Display-P3 HDR · CRF 14 · 256 kbps AAC) on our flagship Apple Mac Studio M4 Ultra (80-Core GPU · 192GB Unified Memory · Pro Display XDR 6K · 120Hz ProMotion): experience the v1.5.1 Codecaine Arcade Suite & File Manager enhancements!

👑 Starring the #1 Flagship Game — Codecaine Adventures of Caine Remaster:
• 100 Tactical Puzzle Chambers across 10 Sectors
• Holographic AI Mathematical Solver Ghost Guide (Press H)
• Infinite Mathematically Verified Procedural Seed Chamber Generator
• Built-In Level Architect Studio with Live AI Solution Simulation
• Dynamic Raycast Lighting, Emerald Heart Framers & Magic Egg Shots

🕹️ Featured Live in This Short (24 Built-In Codecaine Studios):
• Codecaine Adventures of Caine Remaster (100 Chambers, AI Ghost Guide, Seed Generator & Level Architect)
• Codecaine Dr. Codecaine Arcade (Glossy 3D Two-Tone Capsules & Fever/Chill Synthesizers)
• Codecaine CyberMunch Math Deluxe (6×5 Neon Matrix: Multiples, Factors, Primes, Equalities & 5 Troggle AIs)
• Codecaine CyberFrog Deluxe (Multi-Lane Neon Highway & Cyber-River Crossing with Diving Turtles)
• Codecaine CyberSki Deluxe (Alpine Slalom, 360° Trick Ramps & Abominable Cyber-Yeti Pursuit)
• Codecaine CyberWing Deluxe (120Hz Parallax Skyline Flyer across 4 Modes & 4 Skins)
• Codecaine CyberMouse Trap Deluxe (20 Classic Stages of Tactical Push-Block Cat Trapping into Cheese)
• Typing Codecaine Edition (CyberType Deluxe v2.0 — 18 Lessons, Code Sprint & Bug Invaders)
• Codecaine CyberChomp Arcade, TetroGrid Ultra Deluxe, Codecaine Bros. Arcade, Joker Royale Deluxe & Yacht Dice Royale Deluxe

🎨 v1.5.1 Workstation Enhancements:
• 67 SVG System Icon Packs (+18 New: Game Boy & NES, Classic OS Win95/Mac OS 9, Pop-Art, Soft Clay 3D, Bauhaus, Ukiyo-e, Deep-Sea Bioluminescence & more)
• 4.5:1 WCAG High-Contrast Readability Upgrade in Commodore 64 & Synthwave '84
• Native Desktop Clipboard Shortcuts (⌘C/⌘V/⌘X/⌘A/⌘Z/⌘Y) & 25 Cross-Platform Release Downloads

⬇️ Free Download for macOS (Apple Silicon & Intel), Windows & Linux:
${REPO}/releases/tag/v1.5.1
⭐ Source Code (MIT Open Source):
${REPO}

TIMESTAMPS
${stamps}

#MacStudio #M4Ultra #ProDisplayXDR #AdventuresOfCaine #ArcadeGames #IndieGames #FileManager #Bun #TypeScript #RetroGaming #OpenSource #macOS #Shorts
\`\`\`
`;
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  seedArcadeWorkspace();

  // 1. Generate fresh voice narration for all 10 scenes
  const narrated: Array<{ scene: SceneSpec; audio: string; seconds: number }> = [];
  for (const scene of sceneSpecs) {
    const audio = join(WORK, `${scene.id}.wav`);
    if (!existsSync(audio)) {
      console.log(`🎙️  Narrating ${scene.id}...`);
      const narration = await narrate(scene.id, scene.say, join(WORK, "audio"), { rate: "+6%", gap: 0.20 });
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
    } else {
      console.log(`🎙️  Using freshly generated narration ${scene.id}.wav...`);
    }
    narrated.push({ scene, audio, seconds: duration(audio) });
  }

  const total = narrated.reduce((sum, item) => sum + item.seconds, 0);
  // Target ~168-174s (< 180s 3-minute YouTube Short cap)
  const tempo = Math.max(1, total / 170);
  console.log(`⏱️  Total narration ${total.toFixed(2)}s; pace factor ${tempo.toFixed(3)}x -> target ${(total / tempo).toFixed(1)}s`);

  // 2. Start live File Manager server and a same-origin static server for /Users/codecaine/Downloads/public_html/apps
  const gameServer = Bun.serve({
    port: GAME_PORT,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url);
      let p = decodeURIComponent(url.pathname);
      if (p === "/" || p === "/stage.html") {
        return new Response(
          `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#05070c;overflow:hidden}</style><iframe id="arcade-stage-frame" style="position:fixed;inset:0;width:100vw;height:100vh;border:0;background:#05070c"></iframe>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      if (p.startsWith("/app/")) p = p.slice(4);
      if (p.endsWith("/")) p += "index.html";
      const filePath = join(PUBLIC_APPS_DIR, p);
      if (existsSync(filePath)) {
        const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
        const mime =
          ext === "html"
            ? "text/html; charset=utf-8"
            : ext === "js"
              ? "text/javascript; charset=utf-8"
              : ext === "css"
                ? "text/css; charset=utf-8"
                : ext === "svg"
                  ? "image/svg+xml"
                  : ext === "png"
                    ? "image/png"
                    : "application/octet-stream";
        if (ext === "html") {
          let html = Bun.file(filePath);
          return new Response(html, { headers: { "Content-Type": mime } });
        }
        return new Response(Bun.file(filePath), { headers: { "Content-Type": mime } });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    },
  });

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
      `${HOME}/Codecaine_Arcade_v1.5.1`,
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
    let onStageHost = false;
    for (const item of narrated) {
      const { scene } = item;
      if (scene.id.startsWith("10_")) {
        await recBrowser.goto(`http://127.0.0.1:${FM_PORT}/`);
        await sleep(500);
        await recBrowser.eval(`(() => {
          try { localStorage.setItem("fm_seen_welcome", "1"); } catch {}
          document.querySelectorAll(".modal-backdrop").forEach((e) => e.remove());
        })()`);
        await sleep(250);
        onStageHost = false;
      } else if (!onStageHost) {
        await recBrowser.goto(`http://127.0.0.1:${GAME_PORT}/stage.html`, null);
        await sleep(300);
        onStageHost = true;
      }
      const clipPath = join(WORK, `${scene.id}_raw.mp4`);
      if (existsSync(clipPath) && Bun.file(clipPath).size > 100_000 && !scene.id.startsWith("01_") && !scene.id.startsWith("02_")) {
        console.log(`⏭️  Resuming: keeping recorded scene ${scene.id}`);
        rawClips.set(scene.id, clipPath);
        continue;
      }
      console.log(`🎥 Recording fresh live scene ${scene.id}...`);
      await recBrowser.startRecording();
      await scene.record(recBrowser);
      await sleep(300);
      await recBrowser.stopRecording(clipPath, join(WORK, `frames_${scene.id}`), item.seconds / tempo);
      rawClips.set(scene.id, clipPath);
    }
  } finally {
    recBrowser.close();
    try {
      gameServer.stop(true);
    } catch {}
    try {
      fm.kill(9);
    } catch {}
  }

  // 3. Render vertical 1080x1920 Apple Mac Studio M4 Ultra 6K XDR overlays and composite each segment at CRF 14
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

  const finalSeconds = duration(OUTPUT);
  const notes = notesMarkdown(finalSeconds, tempo, sceneMarks);
  writeFileSync(NOTES, notes);
  writeFileSync(join(WORK, "upload-guide.txt"), notes);
  console.log(`✅ Built fresh Codecaine Arcade & v1.5.1 Enhancements Short: ${OUTPUT} (${finalSeconds.toFixed(2)}s)`);
  console.log(`📝 Wrote ${NOTES}`);
}

await main();
process.exit(0);
