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

  // Eight holiday photos (a different colour each), so thumbnails, sorting and bulk rename have something to show.
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
  // The terminal's shell reads this instead of the real ~/.zshrc: a short, clean prompt and no history written anywhere real.
  mkdirSync(ZDOT, { recursive: true });
  writeFileSync(join(ZDOT, ".zshrc"), `HISTFILE=${ZDOT}/.history\nPROMPT='%F{cyan}%1~%f %F{magenta}❯%f '\nRPROMPT=''\n`);
  return { home: HOME, data: DATA, put, big };
}

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
    const path = ch.path ?? `${HOME}/Projects/shop-app`;
    this.fm = Bun.spawn([process.execPath, join(ROOT, "applications", "file_manager_studio.ts"), "--server", "--port", String(FM_PORT), "--home", HOME, "--data-dir", DATA, "--path", path],
      { cwd: "/tmp", stdout: "ignore", stderr: "ignore", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GRAVEYARD: GRAVE, SHELL: "/bin/zsh", ZDOTDIR: ZDOT } });
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
  return `# Codecaine File Manager: the complete, step-by-step guide (${fmtTime(total)})

## YouTube title

Codecaine File Manager: Terminal + Files Together, Image & Media Studios, Every Tool, Themes and Databases (complete guide)

## YouTube description (copy and paste)

\`\`\`text
A calm, complete, step-by-step guide to the Codecaine File Manager from Bun RAD Studio, made so anyone can follow along. Every button is shown and explained in real time, on a throwaway folder of sample files.

What you will learn:
- The basics: the window, getting around, views, selecting, copying and moving with the task panel (progress, Cancel, Retry), name clashes, the Recycle Bin and Undo, Quick Look.
- Work faster with the terminal: the file list follows the terminal when you cd, "Go to this folder" and "Open terminal here" move the terminal to your files, and "Insert paths in Terminal" types safely quoted paths of the selected files and folders for you. "Copy paths for Terminal" does the same for any other terminal app. On Windows it follows PowerShell, the Command Prompt and WSL, writing each path the way that shell needs (C:\\Users becomes /mnt/c/Users in WSL).
- Every tool: Convert, Find and bulk rename, Review, Compare, Projects, Actions, QR codes, the code editor, Replace across files with preview and Undo, the Dev tab (code stats, Git, TODO), Watch, Serve, Crypto, Secrets, Env, IP info, Network, Subdomains, Downloads, Calculator, Timer, API, Bundler and the Graveyard.
- Edit pictures, songs and videos: dozens of one-click edits (black and white, round pictures, sepia, shapes, GIFs), the Image Studio and Media Studio with live sliders, hold to compare, trim, speed, fades and quick recipes, saved presets applied to many files at once, and Recent files that open right inside the File Manager.
- Make it yours: futuristic themes, the theme editor with panel opacity, glass blur, glow, corners, borders and scanlines, Right Option + ] / [ to flip through themes, Right Option + / for full screen (Esc never leaves it), Command+Q to quit, and editable keyboard shortcuts.
- The database studios: complete SQLite Studio and MySQL Studio walkthroughs.

Free and open source: ${REPO}
Download: ${REPO}/releases/latest

Chapters
${chaptersText}
\`\`\`

## Notes

- Recorded from the real program in headless Chrome with a visible cursor; nothing is faked. Each chapter starts from a fresh throwaway world in /tmp, so no real file or setting appears. The terminal uses a throwaway shell profile.
- The SQLite and MySQL chapters are the recorded chapters of \`sqlite_studio_tutorial\` and \`mysql_studio_tutorial\`, joined in without their own intro and outro (build those first).
- The desktop-only keys (Right Option + ] / [ / /, Command+Q) are shown on screen; the theme change is the real one.
- The picture is 1920x972 above its own caption strip, so the captions never cover the program.
- Narration: Edge neural voice (${EDGE_VOICE}, female) at ${RATE} speed with ${GAP}s between sentences, cleaned up with a gentle compressor and loudness normalised to -16 LUFS.
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
};

await runTutorial(suite, process.argv.slice(2));
process.exit(0);
