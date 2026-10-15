#!/usr/bin/env bun
/**
 * The complete Bun RAD Studio tutorial video.
 *
 *   bun scripts/tutorial.ts audio              write/cached narration for every scene
 *   bun scripts/tutorial.ts record [ids,...]   record the live clips (needs the audio: clip length follows the narration)
 *   bun scripts/tutorial.ts build              assemble youtube_production/bun_rad_studio_tutorial.mp4 and its notes
 *   bun scripts/tutorial.ts all                the three above
 *
 * Scenes show the real programs doing real things: desktop apps are run through the hosted bridge (the same one the
 * File Manager uses) in headless Chrome with a visible cursor, the File Manager's terminal runs real commands, and
 * the games run in their own server mode. Nothing is faked; a scene that fails stops the recording.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { hostApp, hostDesigner } from "./lib/host_app";
import { seedDemoWorkspace } from "./lib/demo_workspace";
import { FFMPEG, cardHtml, durationOf, fmtTime, narrate, overlayHtml, screenshotHtml, sh } from "./lib/video_pipeline";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const OUT = join(PROD, "tutorial");
const AUDIO = join(OUT, "audio");
const LIVE = join(OUT, "live");
const SEG = join(OUT, "segments");
const ASSETS = join(OUT, "assets");
const FINAL = join(PROD, "bun_rad_studio_tutorial.mp4");
const NOTES = join(PROD, "TUTORIAL_NOTES.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
const RELEASE_URL = `${REPO}/releases/tag/v1.0.0`;

interface Scene {
  id: string;
  chapter: string;
  title: string;
  bullets: string;
  narration: string;
  /** "card" = a full-screen title card (no recording). "live" scenes are recorded by `run`. */
  kind: "card" | "live";
  card?: { kicker: string; title: string; lines: string[] };
  run?: (env: Env, dur: number) => Promise<void>;
}

/* ------------------------------------------------------------------------------------------------ environment */

const HOME = "/tmp/tut_home";
const DATA = "/tmp/tut_data";
const GRAVE = "/tmp/tut_grave";
const WORK = "/tmp/tut_work";

class Env {
  c!: Cdp;
  fm: ReturnType<typeof Bun.spawn> | null = null;
  fmPort = 51555;
  private fmPath = "";
  private extra: Array<() => void> = [];

  async start() {
    this.c = await Cdp.launch(9333, "/tmp/tut_chrome");
  }
  onStop(fn: () => void) { this.extra.push(fn); }
  async stop() {
    resetSavedTheme();
    for (const f of this.extra.splice(0)) { try { f(); } catch {} }
    try { this.fm?.kill(9); } catch {}
    this.fm = null;
    this.c.close();
  }

  /** The File Manager (a throwaway copy with sample files), opened on its start screen. */
  async fileManager(path = `${HOME}/Projects/shop-app`) {
    if (this.fm && this.fmPath !== path) { try { this.fm.kill(9); } catch {} this.fm = null; await sleep(600); }
    if (!this.fm) {
      this.fmPath = path;
      this.fm = Bun.spawn([process.execPath, join(ROOT, "applications", "file_manager_studio.ts"), "--server", "--port", String(this.fmPort), "--home", HOME, "--data-dir", DATA, "--path", path],
        { cwd: "/tmp", stdout: "ignore", stderr: "ignore", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GRAVEYARD: GRAVE } });
      for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${this.fmPort}/`)).ok) break; } catch {} await sleep(250); }
    }
    await this.c.goto(`http://127.0.0.1:${this.fmPort}/`);
    await this.c.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')?.click()`);
    await sleep(500);
  }

  /** A desktop app (SimpleGUI) shown through the hosted bridge. */
  async app(stem: string, fn: string, opts: { theme?: string } = {}) {
    const mod: any = await import(`../applications/${stem}.ts`);
    const host = await hostApp(() => mod[fn]({ fullscreen: false, ...(opts.theme ? { theme: opts.theme } : {}) }));
    this.onStop(() => host.stop());
    await this.c.goto(host.url, null);
    await sleep(1500);
    return host;
  }
}

/** Switching themes on camera saves the choice globally; drop it so the recording leaves the user's setup as it found it. */
const resetSavedTheme = () => rmSync(join(process.env.HOME ?? "", ".config", "simplegui", "theme.txt"), { force: true });

const until = async (t0: number, seconds: number) => { const left = seconds * 1000 - (performance.now() - t0); if (left > 0) await sleep(left); };

/** Pick an option of a <select> the way a person would: glide to it, click it, then set the value. */
async function choose(c: Cdp, selector: string, optionText: string) {
  await c.click(selector, { pause: 250 });
  await c.eval(`(() => { const s = document.querySelector(${JSON.stringify(selector.split(" >> ")[0])}); if (!s) return;
    const o = [...s.options].find(o => o.text.includes(${JSON.stringify(optionText)})); if (!o) return;
    s.value = o.value; s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await sleep(700);
}

/** Types into the File Manager's terminal and waits for the command to finish talking. */
async function term(c: Cdp, cmd: string, wait: number, perChar = 55) {
  await c.type(cmd, perChar);
  await sleep(250);
  await c.key("Enter", "Enter");
  await sleep(wait);
}

/* ------------------------------------------------------------------------------------------------ scenes */

const scenes: Scene[] = [
  {
    id: "00_intro", chapter: "INTRODUCTION", title: "Bun RAD Studio", bullets: "", kind: "card",
    card: { kicker: "The complete tutorial", title: "Bun RAD Studio", lines: ["65 desktop apps", "79 command-line tools", "A visual designer", "SimpleGUI"] },
    narration: "Welcome to Bun RAD Studio, a toolbox of desktop apps, command line tools, and a visual form designer, all written in TypeScript and powered by Bun. In this tutorial you will install it, tour the apps, design a window by dragging, write your own app in a few lines, and package it for other people. Let's start.",
  },
  {
    id: "01_overview", chapter: "THE LAUNCHER", title: "The Launcher: One App for Everything", bullets: "172 tools found automatically · Search · Categories · Launch or run inline", kind: "live",
    narration: "Bun RAD Studio is a collection of real desktop apps: database studios, developer tools, network and security tools, system monitors, and even games. Each one runs on your own computer, with no account and nothing sent anywhere. This is the launcher, the main app. It scans the project and finds every app and command line tool automatically, a hundred and seventy two in all, sorted into categories. Click a category, or search by name. Select a tool and press Launch to open it in its own window, or run a command line tool inline and read the output right here.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await env.app("launcher_studio", "createLauncherStudio");
      await c.startRecording();
      await sleep(1500);
      await c.hover("#lbl_kpi_total", 900);
      await c.hover("#btn_quick_sqlite", 700);
      await c.hover("#btn_quick_api", 500);
      await c.scroll("body", 520, 8);
      await sleep(700);
      for (const cat of ["#btn_cat_games", "#btn_cat_db", "#btn_cat_cli"]) await c.click(cat, { pause: 1500 });
      await c.click("#txt_search", { pause: 200 });
      await c.type("crypto", 120);
      await c.click("#btn_filter", { pause: 1200 });
      await choose(c, "#lst_apps", "CLI");
      await c.eval(`(() => { const i = document.querySelector("#txt_cli_args"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
      await c.click("#txt_cli_args", { pause: 200 });
      await c.type("hash sha256 hello", 70);
      await c.click("#btn_run_inline", { pause: 2500 });
      await c.scroll("body", 1200, 12);
      await until(t0, dur);
    },
  },
  {
    id: "02_download", chapter: "GET IT", title: "Download or Install", bullets: "No coding needed · macOS · Windows · Linux · Intel & ARM", kind: "live",
    narration: "There are two ways to get it. If you just want to use the apps, open the latest release on GitHub, pick the download for your computer, unzip it, and open it. There is a double click app for every Mac, and downloads for Windows and Linux, on both Intel and ARM. Nothing to compile. If you want to build with it, you can install from source.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await c.goto(RELEASE_URL, null);
      await sleep(2000);
      await c.startRecording();
      await sleep(1200);
      for (let i = 0; i < 5; i++) { await c.scroll("body", 520, 8); await sleep(1100); }
      await c.scroll("body", -2600, 10);
      await until(t0, dur);
    },
  },
  {
    id: "03_install", chapter: "INSTALL", title: "Install from Source", bullets: "git clone · bun install · one command per app", kind: "live",
    narration: "To install from source you need Bun, then clone the repository and run bun install. That takes a few seconds, because there are only a handful of dependencies. Every app has a bun run command, and the launcher can list everything it found: well over a hundred and seventy tools.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await env.fileManager(WORK);
      await c.click("#tool-terminal", { pause: 1800 });
      await c.click("#terminal-host", { pause: 300 });
      await c.startRecording();
      await term(c, "git clone --depth 1 -q https://github.com/codecaine-zz/bun_rad_studio && cd bun_rad_studio", 9500, 15);
      await term(c, "bun install", 2500, 30);
      await term(c, "bun run cli:launcher --list | head -14", 3500, 25);
      await until(t0, dur);
    },
  },
  {
    id: "04_cli", chapter: "COMMAND LINE", title: "79 Command-Line Tools", bullets: "Hashing · Calculator · Code stats · JSON · Network · Git", kind: "live",
    narration: "Every studio has a command line twin. These are fast, scriptable tools, with the same engine behind them. Here is a SHA 256 hash, a calculator, and a line count of the whole project across every language. You can pipe them together, use them in scripts, and they all answer dash dash help.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await env.fileManager(`${WORK}/bun_rad_studio`);
      await c.click("#tool-terminal", { pause: 1800 });
      await c.click("#terminal-host", { pause: 300 });
      await c.startRecording();
      await term(c, "bun run cli:crypto hash sha256 hello", 1800, 25);
      await term(c, 'bun run cli:calc "(19.99 * 3) * 1.08"', 1800, 25);
      await term(c, "bun run cli:tokei . | head -12", 2500, 25);
      await term(c, "bun run cli:crypto --help | head -14", 2000, 25);
      await until(t0, dur);
    },
  },
  {
    id: "05_designer", chapter: "VISUAL DESIGNER", title: "Drag, Drop, Preview, Export", bullets: "Delphi / VB style · 40+ controls · Templates · Live preview · Bun TS code", kind: "live",
    narration: "The visual designer works like Delphi or Visual Basic. Start from a template or drag controls from the palette, click one to edit its properties, and see the form take shape. Press Run for a live preview. The designer writes the code for you, as Bun TypeScript, plain HTML, React, Vue, or Python, ready to copy or export as a project.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      rmSync("/tmp/tut_designer", { recursive: true, force: true });
      const host = hostDesigner("/tmp/tut_designer");
      env.onStop(() => host.stop());
      await c.goto(host.url, null);
      await sleep(1800);
      await c.startRecording();
      await sleep(900);
      await c.click(".template-chip >> Auth Login", { pause: 1500 });
      await c.click(".palette-item >> Checkbox", { pause: 900 });
      await c.click("button >> Bun TS", { pause: 1600 });
      await c.click("button >> HTML", { pause: 1400 });
      await c.click("button >> Run", { pause: 2600 });
      await c.click("button >> Close preview", { pause: 700 });
      await c.click(".template-chip >> Dashboard", { pause: 1600 });
      await c.click("button >> Export", { pause: 1500 });
      await until(t0, dur);
    },
  },
  {
    id: "06_code", chapter: "SIMPLEGUI", title: "Your First App in 15 Lines", bullets: "newSimpleWindow · addLabel · addInput · addButton · toast", kind: "live",
    narration: "You can also write windows in code with SimpleGUI. This is a complete app: a window, a title, an input, and a button that greets you. It is plain TypeScript with chained calls, and you run it with one command. Here it is in the code editor, running, and responding when we type a name and click the button.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      // The example is new, so a clone of the published repository may not have it yet.
      copyFileSync(join(ROOT, "examples", "hello_simplegui.ts"), join(WORK, "bun_rad_studio", "examples", "hello_simplegui.ts"));
      await env.fileManager(`${WORK}/bun_rad_studio/examples`);
      await c.click("#view-tools", { pause: 400 });
      await c.click("#power-tab-code", { pause: 1000 });
      await c.startRecording();
      await sleep(800);
      await c.click(".code-tn >> hello_simplegui.ts", { pause: 2500 });
      await c.scroll(".code-ta", 240, 6);
      await sleep(1500);
      await until(t0, dur * 0.5);
      const sg: any = await import("../src/simplegui.ts");
      rmSync(sg.getAppConfigDir("my_first_app"), { recursive: true, force: true });
      rmSync(sg.getAppStateDir("my_first_app"), { recursive: true, force: true });
      const hello: any = await import("../examples/hello_simplegui.ts");
      const h = await hostApp(() => hello.createHello());
      env.onStop(() => { h.stop(); rmSync(sg.getAppConfigDir("my_first_app"), { recursive: true, force: true }); rmSync(sg.getAppStateDir("my_first_app"), { recursive: true, force: true }); });
      await c.goto(h.url, null);
      await sleep(1200);
      await c.click("input", { pause: 300 });
      await c.type("Alex", 140);
      await c.click("button >> Say hello", { pause: 2200 });
      await c.click("input", { pause: 200 });
      await c.type(" and friends", 90);
      await c.click("button >> Say hello", { pause: 1500 });
      await until(t0, dur);
    },
  },
  {
    id: "07_devtools", chapter: "DEVELOPER TOOLS", title: "Regex, JSON, Git and More", bullets: "Regex Studio · JQ Studio · Git Studio · Data Converter · API Studio", kind: "live",
    narration: "The developer studios are where it gets useful every day. The regex tester highlights matches and explains patterns in plain words. The J Q studio runs queries on J S O N, formats it, and converts it to Y A M L. And the data converter turns a C S V table into J S O N, Markdown, or whatever format you need.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await env.app("regex_studio", "createRegexStudio");
      await c.startRecording();
      await sleep(800);
      await c.click("#btn_test", { pause: 1500 });
      await c.click("#btn_explain", { pause: 1800 });
      await env.app("jq_studio", "createJqStudio");
      await c.click("#btn_execute", { pause: 1100 });
      await c.click("#btn_to_yaml", { pause: 1600 });
      await env.app("dataconvert_studio", "createDataConvertStudio");
      await choose(c, "#dd_to", "Markdown");
      await c.click("#btn_convert", { pause: 1800 });
      await choose(c, "#dd_to", "YAML");
      await c.click("#btn_convert", { pause: 1500 });
      await until(t0, dur);
    },
  },
  {
    id: "08_filemanager", chapter: "FILE MANAGER", title: "The File Manager", bullets: "Dual pane · Code editor · Databases · Vault · Downloads · API Studio", kind: "live",
    narration: "The flagship app is the File Manager. It has a dual pane view, an undoable recycle bin, a code editor, a terminal, database studios, an encrypted password vault, a live web server, and a download manager that splits files over several connections and resumes them. The API Studio, App Bundler, and Environment Studio also live inside it as tabs.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await env.fileManager();
      await c.startRecording();
      await sleep(1200);
      await c.click("#view-dual", { pause: 2400 });
      await c.click("#view-tools", { pause: 700 });
      await c.click("#power-tab-downloads", { pause: 2600 });
      await c.click("#power-tab-api", { pause: 3200 });
      await c.click("#power-tab-env", { pause: 3000 });
      await c.click("#power-tab-bundler", { pause: 2800 });
      await c.click("#power-tab-code", { pause: 2000 });
      await until(t0, dur);
    },
  },
  {
    id: "09_security", chapter: "SECURITY & CRYPTO", title: "Hashes, Keys and Secrets", bullets: "SHA-256 · HMAC · AES · UUID · JWT · Passwords", kind: "live",
    narration: "For security work there is the crypto studio. It calculates hashes and H MAC signatures at once, encrypts and decrypts text with A E S, decodes J W T tokens, and generates U U I Ds, random keys, and strong passwords. Everything is computed on your machine, so your secrets never leave it.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await env.app("crypto_studio", "createCryptoStudio");
      await c.startRecording();
      await sleep(600);
      await c.click("#txt_hash_input", { pause: 300 });
      await c.key("Meta+a", "⌘ A");
      await c.type("Bun RAD Studio", 70);
      await c.click("#btn_calc_hashes", { pause: 1800 });
      await c.click("#btn_gen_uuid", { pause: 1200 });
      await c.click("#btn_gen_hex32", { pause: 1200 });
      await c.click("#btn_gen_password", { pause: 1500 });
      await c.scroll("body", 500, 8);
      await until(t0, dur);
    },
  },
  {
    id: "10_system", chapter: "SYSTEM & FILES", title: "Disk Usage and Code Statistics", bullets: "Gdu Studio · Tokei Studio · Process monitors · Fd search", kind: "live",
    narration: "There are system tools too. This disk usage studio shows where your space went, folder by folder, and the code statistics studio counts lines of code across more than a hundred languages. There are also process monitors, a fast file finder, a Git workbench, a Homebrew manager, and a network diagnostics studio.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await env.app("tokei_studio", "createTokeiStudio");
      await c.startRecording();
      await c.eval(`(() => { const i = document.querySelector("#txt_path"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
      await c.click("#txt_path", { pause: 200 });
      await c.type(`${WORK}/bun_rad_studio`, 12);
      await c.click("#btn_analyze", { pause: 3500 });
      await c.scroll("body", 400, 8);
      await sleep(900);
      process.chdir(`${WORK}/bun_rad_studio`);
      await env.app("gdu_studio", "createGduStudio");
      process.chdir(ROOT);
      await c.eval(`(() => { const i = document.querySelector("#txt_path"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
      await c.click("#txt_path", { pause: 200 });
      await c.type(`${WORK}/bun_rad_studio`, 12);
      await c.click("#btn_scan", { pause: 2500 });
      await c.scroll("body", 500, 8);
      await until(t0, dur);
    },
  },
  {
    id: "11_games", chapter: "GAMES", title: "24 Games Built the Same Way", bullets: "Pong · Pac-Man · Tetris · Snake · Poker · Minesweeper and more", kind: "live",
    narration: "And yes, there are games. Twenty four of them, including Pong, Pac-Man, Tetris, Snake, Poker, and Minesweeper, all built with the same tools, and all playable right now. They are a good way to see what a SimpleGUI or web based window can do, and every one is open source, so you can read how it works.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      const startGame = async (stem: string) => {
        const p = Bun.spawn([process.execPath, join(ROOT, "applications", `${stem}.ts`), "--server"], { cwd: ROOT, stdout: "pipe", stderr: "ignore", env: { ...process.env, PORT: "0" } });
        env.onStop(() => { try { p.kill(9); } catch {} });
        let out = "";
        const reader = (p.stdout as ReadableStream<Uint8Array>).getReader();
        const t = Date.now();
        while (Date.now() - t < 12000 && !/READY:(\d+)/.test(out)) {
          const r = await Promise.race([reader.read(), sleep(12000 - (Date.now() - t)).then(() => null)]);
          if (!r || r.done) break;
          out += new TextDecoder().decode(r.value);
        }
        const port = /READY:(\d+)/.exec(out)?.[1];
        if (!port) throw new Error(`${stem} did not start`);
        await c.goto(`http://127.0.0.1:${port}/`, null);
        await sleep(800);
      };
      await startGame("pong_studio");
      await c.startRecording();
      await sleep(900);
      await c.click("#startMatchBtn", { pause: 800 });
      const cv = await c.rect("canvas");
      if (cv) {
        for (const f of [0.2, 0.8, 0.35, 0.7, 0.15, 0.85, 0.5, 0.25, 0.75]) {
          await c.moveTo(cv.x - cv.w * 0.3, cv.y - cv.h / 2 + cv.h * f, 380);
          await sleep(300);
        }
      }
      await startGame("pacman_studio");
      await sleep(900);
      await c.click("#startBtn", { pause: 800 });
      for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "ArrowRight"]) { await c.key(k, k.replace("Arrow", "")); await sleep(350); }
      await until(t0, dur);
    },
  },
  {
    id: "12_themes", chapter: "THEMES", title: "Over 100 Themes", bullets: "Cyberpunk · Neon · Apple Sonoma · Light & Dark · Live switching", kind: "live",
    narration: "Every app shares the same theme engine, with well over a hundred themes: Apple style light and dark, neon and cyberpunk, retro terminals, and calm minimal palettes. Switch themes with a dropdown, live, with no restart. Your choice is remembered the next time you open the app.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await env.app("jq_studio", "createJqStudio");
      await c.startRecording();
      await sleep(700);
      for (const t of ["Cyberpunk", "Neon", "Sonoma", "Dracula", "Solarized"]) {
        await choose(c, "#dd_theme", t);
        await sleep(900);
      }
      await until(t0, dur);
    },
  },
  {
    id: "13_ship", chapter: "SHIP IT", title: "Bundle and Share Your App", bullets: "App Bundler · Standalone binaries · macOS .app · Windows & Linux", kind: "live",
    narration: "When your app is ready, the App Bundler packages it. It can produce a single bundled file, a standalone program that needs no Bun on the user's computer, or a macOS app with its own icon. The same tooling built every download in the release. Anyone can run the result, without knowing what TypeScript is.",
    async run(env, dur) {
      const t0 = performance.now();
      const { c } = env;
      await env.app("app_bundler_studio", "createAppBundlerStudio");
      await c.startRecording();
      await sleep(1200);
      await c.scroll("body", 450, 8);
      await sleep(1500);
      await c.scroll("body", -450, 8);
      await sleep(900);
      await c.goto(RELEASE_URL, null);
      await sleep(1500);
      await c.scroll("body", 900, 10);
      await until(t0, dur);
    },
  },
  {
    id: "14_outro", chapter: "CONCLUSION", title: "Start Building", bullets: "", kind: "card",
    card: { kicker: "Get started", title: "github.com/codecaine-zz/bun_rad_studio", lines: ["Download the release", "Star the repo", "Build something"] },
    narration: "That was Bun RAD Studio. You can download the apps today from the releases page, or clone the repository and build your own. Everything is open source under the M I T license. If this was useful, star the project on GitHub, and subscribe for deeper dives into each studio. Thanks for watching.",
  },
];

/* ------------------------------------------------------------------------------------------------ phases */

async function phaseAudio() {
  for (const sc of scenes) {
    process.stdout.write(`🎙️  ${sc.id} … `);
    const f = await narrate(sc.id, sc.narration, AUDIO);
    console.log(`${durationOf(f).toFixed(1)}s`);
  }
}

async function phaseRecord(only: string[]) {
  mkdirSync(LIVE, { recursive: true });
  rmSync(HOME, { recursive: true, force: true });
  seedDemoWorkspace(HOME, join(PROD, "frames"));
  rmSync(DATA, { recursive: true, force: true });
  rmSync(GRAVE, { recursive: true, force: true });
  // Later scenes browse the clone made in 03_install, so keep it unless that scene is being redone.
  if (!only.length || only.includes("03_install")) rmSync(WORK, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  mkdirSync(WORK, { recursive: true });
  // Examples and the one folder the code scene browses are real files from this repository's own working tree.
  resetSavedTheme();
  const env = new Env();
  await env.start();
  try {
    for (const sc of scenes) {
      if (sc.kind !== "live" || (only.length && !only.includes(sc.id))) continue;
      const dur = durationOf(join(AUDIO, `narration_${sc.id}.mp3`));
      if (!dur) throw new Error(`No narration for ${sc.id}. Run: bun scripts/tutorial.ts audio`);
      resetSavedTheme();
      console.log(`🎬 ${sc.id} (${dur.toFixed(1)}s)`);
      const t0 = performance.now();
      let err: unknown;
      try { await sc.run!(env, dur); } catch (e) { err = e; }
      const took = (performance.now() - t0) / 1000;
      const r = await env.c.stopRecording(join(LIVE, `live_${sc.id}.mp4`), join(LIVE, `_w_${sc.id}`), dur);
      console.log(`   ${took.toFixed(1)}s of action, ${r.frames} frames${r.speed > 1 ? `, sped up ${r.speed.toFixed(2)}x` : ""}`);
      if (err) throw err;
    }
  } finally {
    await env.stop();
  }
}

async function phaseBuild() {
  for (const d of [SEG, ASSETS]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }
  const parts: string[] = [];
  const chapters: Array<{ t: number; title: string }> = [];
  let t = 0;
  for (const sc of scenes) {
    const audio = join(AUDIO, `narration_${sc.id}.mp3`);
    const dur = durationOf(audio);
    if (!dur) throw new Error(`No narration for ${sc.id}`);
    const seg = join(SEG, `seg_${sc.id}.mp4`);
    if (sc.kind === "card") {
      const png = join(ASSETS, `${sc.id}.png`);
      screenshotHtml(cardHtml(sc.card!.kicker, sc.card!.title, sc.card!.lines), png, ASSETS);
      sh([FFMPEG, "-y", "-loop", "1", "-i", png, "-i", audio, "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p", "-t", dur.toFixed(3), "-r", "30", seg]);
    } else {
      const clip = join(LIVE, `live_${sc.id}.mp4`);
      if (!existsSync(clip)) throw new Error(`No recording for ${sc.id}. Run: bun scripts/tutorial.ts record ${sc.id}`);
      const hud = join(ASSETS, `hud_${sc.id}.png`);
      screenshotHtml(overlayHtml(sc.chapter, sc.title, sc.bullets), hud, ASSETS);
      sh([FFMPEG, "-y", "-i", clip, "-i", hud, "-i", audio, "-filter_complex", "[0:v]fps=30,scale=1920:1080,tpad=stop_mode=clone:stop_duration=3[bg];[bg][1:v]overlay=0:0[v]", "-map", "[v]", "-map", "2:a",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p", "-t", dur.toFixed(3), "-r", "30", seg]);
    }
    console.log(`✔ ${sc.id} ${dur.toFixed(1)}s`);
    chapters.push({ t, title: sc.kind === "card" && sc.id === "00_intro" ? "Introduction" : `${sc.title}` });
    parts.push(seg);
    t += dur;
  }
  const list = join(SEG, "list.txt");
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  const merged = join(SEG, "merged.mp4");
  sh([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", merged]);
  const music = join(AUDIO, "bed.mp3");
  const total = t + 2;
  sh([FFMPEG, "-y", "-f", "lavfi", "-i", `aevalsrc=sin(130.81*2*PI*t)*0.015+sin(196*2*PI*t)*0.012+sin(261.63*2*PI*t)*0.015+sin(329.63*2*PI*t)*0.01:s=48000:d=${total.toFixed(1)}`,
    "-af", `lowpass=f=700,tremolo=f=0.15:d=0.35,aecho=0.8:0.7:60|120:0.3|0.2,volume=0.30,afade=t=in:ss=0:d=2,afade=t=out:st=${(total - 3).toFixed(1)}:d=3`, music]);
  sh([FFMPEG, "-y", "-i", merged, "-i", music, "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:weights=1.0 0.09[a]", "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", FINAL]);
  writeFileSync(NOTES, notesFile(chapters, t));
  console.log(`\n🎉 ${FINAL}  (${(statSync(FINAL).size / 1048576).toFixed(1)} MB, ${fmtTime(t)})\n📝 ${NOTES}`);
}

function notesFile(chapters: Array<{ t: number; title: string }>, total: number): string {
  const stamps = chapters.map((c) => `${fmtTime(c.t)} ${c.title}`).join("\n");
  return `# Bun RAD Studio: the complete tutorial (${fmtTime(total)})

## YouTube description (copy and paste)

\`\`\`text
Bun RAD Studio: the complete tutorial. Install it, tour the apps, design a window by dragging, write your own app in 15 lines, and ship it.

Bun RAD Studio is an open-source toolbox written in TypeScript and powered by Bun: 65 desktop apps (databases, developer tools, security, system tools, 24 games), 79 command-line tools, a Delphi/Visual Basic style visual form designer, and SimpleGUI, a small library for writing windows in code. Everything runs on your own computer: no account, nothing sent anywhere.

⬇️ DOWNLOAD (no coding, no compiling): ${RELEASE_URL}
Mac (Apple silicon + Intel), Windows (x64 + ARM) and Linux (x86-64 + ARM).
⭐ SOURCE (MIT license): ${REPO}

⏱️ CHAPTERS
${stamps}

🚀 INSTALL FROM SOURCE
git clone ${REPO}.git
cd bun_rad_studio
bun install
bun run cli:launcher --list      # list every app and tool
bun run app:files                # the File Manager
bun run examples/hello_simplegui.ts

Everything in this video is the real software running on a real computer.

#bun #typescript #opensource #developertools #gui #rad #desktopapps #macos #windows #linux
\`\`\`
`;
}

const [phase = "all", ...rest] = process.argv.slice(2);
const only = (rest[0] ?? "").split(",").filter(Boolean);
if (phase === "audio" || phase === "all") await phaseAudio();
if (phase === "record" || phase === "all") await phaseRecord(only);
if (phase === "build" || phase === "all") await phaseBuild();
if (!["audio", "record", "build", "all"].includes(phase)) { console.error("Usage: bun scripts/tutorial.ts audio|record [ids]|build|all"); process.exit(1); }
process.exit(0);
