#!/usr/bin/env bun
/**
 * The Codecaine File Manager, explained slowly and completely (a calm, step-by-step tutorial in the style of the old
 * "show every click" training videos).
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
const RATE = "+8%";
const GAP = 0.4;
const VIEW_H = 972;
const ROOT_DIR = "/tmp/fmv";
const HOME = FM_HOME;
const DATA = `${ROOT_DIR}/data`;
const GRAVE = `${ROOT_DIR}/grave`;
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
      { cwd: "/tmp", stdout: "ignore", stderr: "ignore", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GRAVEYARD: GRAVE } });
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
  return `# Codecaine File Manager: the complete, slow walkthrough (${fmtTime(total)})

## YouTube title

The Codecaine File Manager, Explained Step by Step (every button, nothing skipped)

## YouTube description (copy and paste)

\`\`\`text
A calm, complete, step-by-step tour of the Codecaine File Manager from Bun RAD Studio. Every button is shown and explained in real time, on a throwaway folder of sample files: the window and toolbar, getting around, the views, choosing files, copying and moving with the task panel (progress, Cancel, Retry) and name clashes, the Recycle Bin and Undo, Quick Look, converting files, Find and bulk rename, reviewing changes before they happen, comparing two folders, saved Projects and Actions, QR codes, the built-in code editor with its text conversions, then themes, keyboard shortcuts and the terminal.

Free and open source: ${REPO}
Download: ${REPO}/releases/latest

Chapters
${chaptersText}
\`\`\`

## Notes

- Recorded from the real program in headless Chrome with a visible cursor; nothing is faked. Each chapter starts from a fresh throwaway world in /tmp, so no real file or setting appears.
- The picture is 1920x972 above its own caption strip, so the captions never cover the program.
- Narration: Edge neural voice (${EDGE_VOICE}, female) at ${RATE} speed with ${GAP}s between sentences.
- Rebuild: \`bun scripts/tutorial_file_manager.ts all\` (needs Google Chrome, ffmpeg-full from Homebrew and the internet for the voice). Re-record one chapter: \`... record 04_copy\` then \`... build\`.
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
