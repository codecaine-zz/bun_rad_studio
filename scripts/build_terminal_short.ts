#!/usr/bin/env bun
// Reuses the tutorial's sample-workspace recordings; no personal files are recorded.
import "./lib/tts_edge_default";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp } from "./lib/cdp_recorder";
import { EDGE_VOICE, FFMPEG, FFPROBE, narrate } from "./lib/video_pipeline";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const WORK = join(PROD, "terminal_short");
const OUTPUT = join(PROD, "codecaine-file-manager-terminal-short.mp4");
const GUIDE = "https://www.youtube.com/watch?v=uPrlPMj_uK4";

type Scene = {
  id: string;
  title: string;
  label: string;
  extra?: string;
  code?: string;
  say: string;
  file: string;
  suite?: string;
  start: number;
  length: number;
  crop: string;
};

const scenes: Scene[] = [
  {
    id: "01_hook", title: "THIS IS A\nFILE MANAGER?!", label: "WINDOWS / macOS / LINUX",
    extra: "x64 (Intel/AMD) + ARM64 builds / PowerShell + WSL on Windows",
    say: "Codecaine File Manager. Windows, macOS, Linux. Intel, A M D, ARM. PowerShell and W S L on Windows.",
    file: "18_terminal", start: 0, length: 8, crop: "1050:300:0:642",
  },
  {
    id: "navigation", title: "GET AROUND.\nWITHOUT FRICTION.", label: "BACK / FORWARD / UP / BREADCRUMBS",
    say: "Navigate with Back, Forward, Up, and folder breadcrumbs. Pin favorite folders for quick access.",
    file: "02_moving", start: 13, length: 23, crop: "1200:230:0:0",
  },
  {
    id: "recent", title: "BACK TO WHAT\nYOU JUST OPENED.", label: "PLACES > RECENT",
    say: "In Places, find Recent. Click a recent file to reopen it, right here.",
    file: "21f_recent", start: 0.1, length: 9, crop: "620:400:0:460",
  },
  {
    id: "views", title: "YOUR FILES.\nYOUR VIEW.", label: "ICONS / LIST / DETAILS",
    say: "Switch between icons, list, and details. Choose the view that fits your work.",
    file: "03_views", start: 0.1, length: 16, crop: "1100:600:220:160",
  },
  {
    id: "dual", title: "TWO FOLDERS.\nONE WORKFLOW.", label: "DUAL PANE / F5 COPY / F6 MOVE",
    say: "Open two folders side by side. F5 copies between panes. F6 moves. Both locations stay visible.",
    file: "07_move", start: 39, length: 28, crop: "1600:540:240:150",
  },
  {
    id: "find", title: "FIND IT.\nRENAME IN BULK.", label: "SEARCH + RENAME PREVIEW",
    say: "Find matching files, then bulk-rename with a preview. Check changes before applying them.",
    file: "11_find", start: 38.7, length: 13, crop: "1300:500:310:200",
  },
  {
    id: "preview", title: "PRESS SPACE.\nTAKE A LOOK.", label: "QUICK LOOK",
    say: "Press Space to preview files. Arrow keys flip through pictures. No extra app needed.",
    file: "09_quicklook", start: 0.1, length: 26, crop: "1250:650:330:150",
  },
  {
    id: "safety", title: "DELETED IT?\nBRING IT BACK.", label: "RECYCLE BIN + RESTORE",
    say: "File Manager deletes go to its Recycle Bin. Restore files to their original folders.",
    file: "08_delete", start: 16.7, length: 22, crop: "1400:550:270:210",
  },
  {
    id: "themes_open", title: "CHANGE THE\nWHOLE LOOK.", label: "THEMES > ALL THEMES",
    say: "Click Themes, then All themes. Search the gallery. Click any theme to apply it instantly.",
    file: "22_themes", start: 0.1, length: 25, crop: "900:600:570:110",
  },
  {
    id: "themes_retro", title: "WAIT... BeOS?\nOS/2 WARP?", label: "RETRO LOOKS YOU DIDN'T EXPECT",
    say: "Remember BeOS? OS 2 Warp? Try both. Explore Palm OS, Solaris, and Zune-inspired colors too.",
    file: "22_themes", start: 57.9, length: 14, crop: "720:380:600:220",
  },
  {
    id: "themes_future", title: "ICE-COOL GLASS.\nWARM NEON GLOW.", label: "ORBITAL ICE / EMBER GRID",
    say: "Orbital Ice feels cool and frosted. Ember Grid brings warm glowing edges. Watch the whole workspace change.",
    file: "22_themes", start: 79.8, length: 14, crop: "1200:500:360:100",
  },
  {
    id: "themes_edit", title: "DON'T JUST PICK.\nMAKE YOUR OWN.", label: "CREATE OR EDIT A THEME",
    say: "Click Create or edit a theme. It starts with your current look.",
    file: "22_themes", start: 146.7, length: 14, crop: "1000:600:460:130",
  },
  {
    id: "themes_custom", title: "YOUR GLASS.\nYOUR RULES.", label: "LIVE THEME EDITOR",
    say: "Adjust panel opacity and glass blur. Watch the live preview, then save your own theme.",
    file: "22_themes", start: 168.8, length: 17, crop: "1050:450:430:350",
  },
  {
    id: "02_follow", title: "TYPE cd.\nFILES FOLLOW.", label: "TURN ON FOLLOW TERMINAL",
    say: "Turn on Follow terminal. Type cd to change directories. The file pane follows automatically.",
    file: "18_terminal", start: 54, length: 9, crop: "1050:300:0:642",
  },
  {
    id: "03_folder", title: "BROWSE FIRST.\nTERMINAL NEXT.", label: "GO TO THIS FOLDER",
    say: "Browse to a folder, then press Go to this folder. The terminal follows.",
    file: "18_terminal", start: 95.6, length: 10, crop: "1050:300:870:570",
  },
  {
    id: "04_here", title: "RIGHT-CLICK.\nYOU'RE THERE.", label: "OPEN TERMINAL HERE",
    say: "Or right-click a folder. Choose Open terminal here. You're ready to work.",
    file: "18_terminal", start: 116.85, length: 9, crop: "1050:450:190:200",
  },
  {
    id: "05_paths", title: "SELECT FILES.\nINSERT PATHS.", label: "LESS TYPING. FEWER MISTAKES.",
    say: "Select files. Choose Insert paths in Terminal. Paths are safely quoted. Nothing runs until you press Enter.",
    file: "18_terminal", start: 137.3, length: 16, crop: "1050:300:0:642",
  },
  {
    id: "06_spaces", title: "SPACES?\nNO PROBLEM.", label: "QUOTED PATHS, NOT GUESSWORK",
    say: "Spaces and brackets are handled too. Remember: terminal deletes bypass the File Manager's Recycle Bin.",
    file: "18_terminal", start: 171.5, length: 16, crop: "1050:300:0:642",
  },
  {
    id: "convert", title: "CONVERT FILES.\nIN BATCHES.", label: "IMAGES / VIDEO / AUDIO / DOCUMENTS",
    say: "Select files, open Convert and process, pick your options, and run the batch.",
    file: "10_convert", start: 19.8, length: 25, crop: "1100:550:400:170",
  },
  {
    id: "07_image", title: "MORE THAN\nMOVING FILES.", label: "BUILT-IN IMAGE STUDIO",
    say: "Edit pictures with Image Studio's live sliders. Save a copy. Keep your original.",
    file: "21c_image_studio", start: 15.85, length: 10, crop: "1200:500:360:220",
  },
  {
    id: "09_sqlite", title: "BUILD QUERIES.\nVISUALLY.", label: "SQLITE VISUAL QUERY DESIGNER",
    say: "SQLite Studio is built in. Add tables to the visual designer. Auto-detect joins to connect them.",
    suite: "sqlite_studio_tutorial", file: "09_designer", start: 16.55, length: 12, crop: "1280:320:350:560",
  },
  {
    id: "10_sql", title: "SEE THE DATA.\nSEE THE SQL.", label: "RUN THE QUERY + INSPECT THE SQL",
    say: "Run your query. View the results, or inspect the generated SQL and open it in the editor.",
    suite: "sqlite_studio_tutorial", file: "09_designer", start: 51.14, length: 12, crop: "1400:470:340:410",
  },
  {
    id: "settings", title: "SET IT UP.\nYOUR WAY.", label: "SETTINGS / PREFERENCES",
    say: "Open Settings for preferences, keyboard customization, and protection against accidentally closing the window.",
    file: "22_themes", start: 278.2, length: 10, crop: "600:190:710:440",
  },
  {
    id: "help", title: "NEED A HAND?\nPRESS F1.", label: "HELP + CUSTOM KEYBOARD SHORTCUTS",
    say: "Press F1 for Help. Find shortcuts and practical tips whenever you get stuck.",
    file: "22_themes", start: 296.1, length: 11, crop: "720:230:600:390",
  },
  {
    id: "gui_events", title: "A BUTTON.\nA CLICK HANDLER.", label: "SIMPLEGUI / REAL RUNNABLE TYPESCRIPT",
    say: "Create a window. Add a button. Its click handler updates the label. That's SimpleGUI.",
    code: readFileSync(join(ROOT, "examples", "short_gui_events.ts"), "utf8"),
    suite: "designer_tutorial", file: "01_tour", start: 20.7, length: 8, crop: "1250:500:280:220",
  },
  {
    id: "11_guide", title: "ONE PROJECT.\nA WHOLE TOOLBOX.", label: "BUN RAD STUDIO / SIMPLEGUI / VISUAL DESIGNER",
    say: "Explore Bun RAD Studio and the SimpleGUI visual designer. For the full File Manager cookbook guide, tap the related video below my name.",
    suite: "designer_tutorial", file: "01_tour", start: 20.7, length: 14, crop: "1250:500:280:220",
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
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{background:#0b1120;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
.label{position:absolute;top:54px;left:36px;width:960px;color:#67e8f9;font-size:32px;font-weight:700}
.extra{position:absolute;top:104px;left:36px;color:#cbd5e1;font-size:23px}
.code{position:absolute;left:0;top:160px;width:1080px;height:1600px;padding:52px 36px;background:#101827}
.code pre{font:32px/1.7 Menlo,monospace;color:#bae6fd;white-space:pre-wrap}
.code p{margin-top:40px;font:28px/1.4 Menlo,monospace;color:#67e8f9}
.cta{position:absolute;top:1530px;left:24px;width:960px;background:#0b1120ed;border-radius:12px;padding:22px}
.cta strong{font-size:29px;color:#67e8f9}.cta p{font-size:27px;margin-top:10px;color:#e2e8f0}
.url{font-size:23px!important;color:#94a3b8!important}
</style><div class="label">${esc(scene.label)}</div>${scene.extra ? `<div class="extra">${esc(scene.extra)}</div>` : ""}
${scene.code ? `<div class="code"><pre>${esc(scene.code)}</pre><p>bun run examples/short_gui_events.ts</p></div>` : ""}
${index === scenes.length - 1 ? '<div class="cta"><strong>FULL TUTORIAL + COOKBOOK GUIDE</strong><p>Tap the related video below my name</p><p class="url">youtube.com/watch?v=uPrlPMj_uK4</p></div>' : ""}`;
}

function demoFilter(scene: Scene, seconds: number): string {
  if (scene.code) return "[2:v]format=yuv420p[v]";
  const timing = `[0:v]setpts=(PTS-STARTPTS)*${seconds / scene.length},fps=30`;
  return `${timing},scale=1080:-2[demo];` +
    `[2:v][demo]overlay=0:(H-h)/2:shortest=1,format=yuv420p[v]`;
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  for (const scene of scenes) {
    const source = sourceOf(scene);
    if (!existsSync(source)) throw new Error(`Missing tutorial recording: ${source}`);
    if (scene.start + scene.length > duration(source)) throw new Error(`Scene exceeds source: ${scene.id}`);
  }
  const narrated: Array<{ scene: Scene; audio: string; seconds: number }> = [];
  for (const scene of scenes) {
    console.log(`Narrating ${scene.id}`);
    const narration = await narrate(scene.id, scene.say, join(WORK, "audio"), { rate: "+3%", gap: 0.22 });
    const audio = join(WORK, `${scene.id}.wav`);
    // The shared tutorial narrator pads each clip by 1.1s; Shorts need tighter scene transitions.
    const seconds = duration(narration) - 0.85;
    if (seconds <= 0) throw new Error(`Narration is too short to trim: ${scene.id}`);
    run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.25", "-i", narration,
      "-t", seconds.toFixed(3), "-c:a", "pcm_s16le", audio]);
    narrated.push({ scene, audio, seconds: duration(audio) });
  }
  const total = narrated.reduce((sum, item) => sum + item.seconds, 0);
  const tempo = Math.max(1, total / 176);
  if (tempo > 1.12) throw new Error(`Narration is too long (${total.toFixed(1)} seconds); shorten the script rather than rushing it.`);
  console.log(`Narration ${total.toFixed(2)}s; final pace adjustment ${tempo.toFixed(3)}x`);
  const browser = await Cdp.launch(9357, join(WORK, "chrome-profile"), 1080, 1920);
  const segments: string[] = [];
  try {
    for (const [index, item] of narrated.entries()) {
      const { scene, audio } = item;
      console.log(`Building ${scene.id}`);
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
      run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", String(scene.start), "-t", String(scene.length),
        "-i", sourceOf(scene), "-i", audio, "-loop", "1", "-framerate", "30", "-i", png,
        "-filter_complex", filters, "-map", "[v]", "-map", "1:a", "-af", `atempo=${tempo}`, "-t", seconds.toFixed(3),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", segment]);
      segments.push(segment);
    }
  } finally {
    browser.close();
  }
  const list = join(WORK, "concat.txt");
  writeFileSync(list, segments.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
  run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list,
    "-c", "copy", "-movflags", "+faststart", OUTPUT]);
  const seconds = duration(OUTPUT);
  if (seconds >= 180) throw new Error(`Short exceeds three minutes: ${seconds}`);
  writeFileSync(join(WORK, "upload-guide.txt"), `TITLE
Retro Themes, Glowing Glass & a Synced Terminal?! #Shorts

DESCRIPTION
Codecaine File Manager runs on Windows, macOS, and Linux, with PowerShell and WSL terminal support on Windows.
x64 (Intel/AMD) and ARM64 builds are available. The Windows ARM package includes native CLI tools and x64 desktop apps running through Windows 11 emulation; this is not a claim of native ARM desktop apps on Windows. x86 here means x86-64, not 32-bit x86.
Browse with Back, Forward, Up, breadcrumbs and favorites. Reopen files from Places > Recent. Switch views, copy and move in dual panes, search and bulk-rename, preview with Space, and restore deleted files. Open Settings for preferences and custom keyboard shortcuts, or press F1 for Help.
See exactly how to open Themes > All themes, apply a theme, and choose Create or edit a theme to adjust opacity and blur. From BeOS and OS/2 Warp-inspired colors to Orbital Ice and Ember Grid: this is more than dark mode.
Change directories in the terminal and watch your files follow. Browse a folder and send the terminal there. Insert safely quoted file paths, batch-convert files, edit pictures, and build SQLite queries visually with automatic joins and generated SQL.
Part of Bun RAD Studio, which also includes SimpleGUI and the SimpleGUI visual designer for building desktop applications. The ending shows the designer so you can see the broader project.
The on-screen button event example is runnable from this checkout: bun run examples/short_gui_events.ts

Full tutorial / cookbook guide: ${GUIDE}
Free downloads: https://github.com/codecaine-zz/bun_rad_studio/releases/latest

#FileManager #Terminal #OpenSource #Shorts

REQUIRED: MAKE THE IN-PLAYER LINK CLICKABLE
1. Upload codecaine-file-manager-terminal-short.mp4 as a Short.
2. In YouTube Studio, open this Short's details and select Related video.
3. Choose the full tutorial with video ID uPrlPMj_uK4, then save.
4. Check playback: the clickable related-video link should appear below your channel handle.

YouTube requires advanced feature access for Related video. The target must be an eligible public or unlisted video from your channel.
A URL drawn into an MP4 is not interactive. URLs in Shorts descriptions and comments are not clickable; the description URL is only a copyable fallback.
This render does not upload or configure your YouTube account. Set Related video before publishing so the spoken call-to-action works.
Help: https://support.google.com/youtube/answer/14075157

BUILD
bun scripts/build_terminal_short.ts
Requires the existing tutorial recordings, Chrome, ffmpeg-full, and uvx edge-tts (network access for narration).
Duration: ${seconds.toFixed(2)} seconds. 1080x1920, 30 fps, H.264/AAC.
Narrator: ${EDGE_VOICE}, +3% delivery rate, 0.22s sentence gaps; final pace adjustment ${tempo.toFixed(3)}x.
Layout: the entire app is scaled proportionally to the full 1080px width and centered in the vertical frame, with empty space above and below. No cropping, split/rearranged panels, persistent footer, duplicate desktop inset, or narration paragraphs. The related-video call-to-action appears only at the end.
`);
  console.log(`Created ${OUTPUT} (${seconds.toFixed(2)} seconds)`);
}

await main();
