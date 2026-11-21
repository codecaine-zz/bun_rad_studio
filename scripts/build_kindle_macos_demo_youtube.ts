#!/usr/bin/env bun
/**
 * High-Production 1080p YouTube Demo Video Builder for Codecaine File Manager:
 *   "Kindle Open-Book Reader for macOS"
 * Narrated 100% locally by AI Russell (`ollama run phonon --voice Russell`).
 *
 * Deliverables:
 *   - youtube_production/codecaine_file_manager_kindle_macos_demo_1080p.mp4
 *   - youtube_production/codecaine_file_manager_kindle_macos_demo_thumbnail.png
 *   - youtube_production/kindle_macos_demo/qa_frames/*.png
 *   - youtube_production/KINDLE_MACOS_DEMO_YOUTUBE_NOTES.md
 *
 * Usage:
 *   bun run scripts/build_kindle_macos_demo_youtube.ts --audio-only   # Pre-synthesize AI Russell WAVs + Read-Along clip
 *   bun run scripts/build_kindle_macos_demo_youtube.ts                # Full build (live UI + 1080p master + thumbnail + notes)
 */
import { createHash } from "crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { FFMPEG, FFPROBE, fmtTime } from "./lib/video_pipeline";
import { createContext } from "../src/features/filemanager/fmCore";
import {
  computeReadAlongTimeline,
  computeWordTimingsForText,
  createWavHeader,
  formatSrtSubtitles,
  formatVttSubtitles,
  parseWavPcm,
  renderBurnedInReadAlongVideoParallel,
  splitTextForPhonon,
} from "../src/features/filemanager/fmPhonon";

const AUDIO_ONLY = process.argv.includes("--audio-only");
const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const PROJ = join(PROD, "kindle_macos_demo");
const AUDIO_DIR = join(PROJ, "audio");
const QA_FRAMES_DIR = join(PROJ, "qa_frames");
const BUILD_DIR = join(PROJ, "build");
const STORYBOARD_PATH = join(PROJ, "storyboard.json");
const OUTPUT_MP4 = join(
  PROD,
  "codecaine_file_manager_kindle_macos_demo_1080p.mp4",
);
const OUTPUT_THUMB = join(
  PROD,
  "codecaine_file_manager_kindle_macos_demo_thumbnail.png",
);
const NOTES_PATH = join(PROD, "KINDLE_MACOS_DEMO_YOUTUBE_NOTES.md");
const ANTHEM_MP3 = join(
  ROOT,
  "youtube_ready_mp3",
  "Codecaine File Manager Anthem.mp3",
);

const FM_PORT = 51874;
const CDP_REC_PORT = 9574;
const CDP_GFX_PORT = 9575;
const VIEW_W = 1920;
const VIEW_H = 972;
const HUD_H = 108;

// Strictly isolated /tmp workspace — ZERO real user paths, real books, or personal identifiers
const WORKSPACE_ROOT = "/tmp/fm_kindle_yt_demo";
const HOME =
  process.platform === "darwin"
    ? "/private/tmp/fm_kindle_yt_demo/home"
    : "/tmp/fm_kindle_yt_demo/home";
const DATA = `${WORKSPACE_ROOT}/data`;
const GRAVE = `${WORKSPACE_ROOT}/grave`;
const ZDOT = `${WORKSPACE_ROOT}/zdot`;
const BOOKS_DIR = join(HOME, "Books");
const DEMO_AUDIO_DIR = join(HOME, "Music");
const LISTEN_PREVIEW_WAV = join(DEMO_AUDIO_DIR, "ch1_russell_preview.wav");

const BOOK_TITLE = "The Art of Local-First Computing";
const BOOK_AUTHOR = "Alex Rivera";
const BOOK_WINDOW_TITLE = "The Art of Local-First Computing (1728x1084)";

const PAGE_INTRO = [
  "Introduction",
  "",
  "Modern software often locks your thoughts behind remote servers, unstable subscriptions, and sluggish web wrappers. Local-first computing returns ownership of every document, note, and book back to the machine on your desk.",
].join("\n");

const PAGE_CH1_SPREAD = [
  "Chapter 1: Your Files Belong on Your Machine",
  "",
  "Local-first software keeps your reading library fast, private, and durable offline — turning open Kindle pages into synchronized audio and cinema-grade Read-Along video right on Apple Silicon.",
  "",
  "When every paragraph stays on local NVMe storage, search is instantaneous, text-to-speech runs with zero network round-trips, and your personal reading habits never leave your Mac.",
].join("\n");

const PAGE_CH2 = [
  "Chapter 2: Offline Memory & Instant Search",
  "",
  "Great tools respect attention. By reading two-column book spreads cleanly from left column to right and stripping distracting header chrome, your e-book archive becomes plain, portable Markdown and chaptered audio.",
].join("\n");

const PAGE_CH3 = [
  "Chapter 3: Listening Without Giving Up Ownership",
  "",
  "Whether you follow along word by word inside Book View or render a 1080p Read-Along MP4 for study on the go, every subtitle track, M4B chapter marker, and audio file belongs solely to you.",
].join("\n");

const FULL_SYNTHETIC_BOOK = [
  `# ${BOOK_TITLE}`,
  `By ${BOOK_AUTHOR}`,
  "",
  PAGE_INTRO,
  "",
  PAGE_CH1_SPREAD,
  "",
  PAGE_CH2,
  "",
  PAGE_CH3,
].join("\n");

type StoryboardScene = {
  id: string;
  chapter: string;
  kind:
    | "title_card"
    | "live_ui"
    | "hybrid_mp4_folder"
    | "feature_card"
    | "outro_card";
  badge: string;
  title: string;
  subtitle: string;
  keycaps: string[];
  hudStep: string;
  visualDirection: string;
  excerptText?: string;
  narration: string;
  narrationPartB?: string;
};

type Storyboard = {
  meta: Record<string, any>;
  scenes: StoryboardScene[];
};

function run(args: string[], opts: { cwd?: string } = {}): string {
  const res = Bun.spawnSync(args, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (res.exitCode !== 0) {
    throw new Error(
      `${args[0]} failed (${res.exitCode}):\n${res.stderr.toString().slice(-3500)}`,
    );
  }
  return res.stdout.toString();
}

function duration(file: string): number {
  const v = Number(
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
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`Invalid media duration for ${file}`);
  }
  return v;
}

const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

// ---------------------------------------------------------------------------
// 1. 100% Local AI Russell Narration Synthesis (`ollama run phonon --voice Russell`)
// ---------------------------------------------------------------------------
function runOllamaPhononRussell(text: string, outWav: string): void {
  const chunks = splitTextForPhonon(text, { maxChars: 420 });
  if (!chunks.length) throw new Error("Empty narration text for Phonon");
  const pcmParts: Buffer[] = [];
  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;

  const ollamaEnv = {
    ...process.env,
    HOME: process.env.HOME || "/Users/codecaine",
    OLLAMA_MODELS:
      process.env.OLLAMA_MODELS ||
      `${process.env.HOME || "/Users/codecaine"}/.ollama/models`,
  };

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    let ok = false;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      const res = Bun.spawnSync(
        ["ollama", "run", "phonon", "--voice", "Russell"],
        {
          stdin: new TextEncoder().encode(c.text + "\n"),
          stdout: "pipe",
          stderr: "pipe",
          timeout: 90_000,
          env: ollamaEnv,
        },
      );
      if (res.exitCode === 0 && res.stdout.byteLength > 200) {
        try {
          const parsed = parseWavPcm(Buffer.from(res.stdout));
          sampleRate = parsed.sampleRate;
          numChannels = parsed.numChannels;
          bitsPerSample = parsed.bitsPerSample;
          pcmParts.push(parsed.pcmData);
          ok = true;
        } catch (e) {
          lastErr = String(e);
        }
      } else {
        lastErr = `exit=${res.exitCode} stderr=${res.stderr.toString().slice(-300)}`;
      }
    }
    if (!ok) {
      throw new Error(
        `AI Russell (ollama run phonon --voice Russell) failed on chunk ${i + 1}/${chunks.length}: ${lastErr}`,
      );
    }
    if (i + 1 < chunks.length) {
      const gapSamples = Math.round(sampleRate * 0.14);
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

function masterRussellWav(
  key: string,
  text: string,
  padAfterSec = 0.45,
): { rawWav: string; masterWav: string; seconds: number } {
  mkdirSync(AUDIO_DIR, { recursive: true });
  const rawWav = join(AUDIO_DIR, `raw_${key}_Russell.wav`);
  const masterWav = join(AUDIO_DIR, `master_${key}_Russell.wav`);
  const hashFile = join(AUDIO_DIR, `${key}_Russell.sha1`);
  const textHash = createHash("sha1")
    .update(`Russell|v1|pad=${padAfterSec}|${text}`)
    .digest("hex");

  const cached =
    existsSync(rawWav) &&
    existsSync(masterWav) &&
    existsSync(hashFile) &&
    readFileSync(hashFile, "utf8").trim() === textHash;

  if (!cached) {
    console.log(`🎙️  [AI Russell] Synthesizing ${key}...`);
    runOllamaPhononRussell(text, rawWav);
    run([
      FFMPEG,
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      rawWav,
      "-af",
      `highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,adelay=180|180,apad=pad_dur=${padAfterSec.toFixed(2)}`,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      masterWav,
    ]);
    writeFileSync(hashFile, textHash);
  } else {
    console.log(`✅ [AI Russell] Cached ${key}`);
  }

  return { rawWav, masterWav, seconds: duration(masterWav) };
}

function synthesizeSceneAudio(scene: StoryboardScene): {
  rawWav: string;
  masterWav: string;
  seconds: number;
  partARawWav?: string;
  partAMasterWav?: string;
  partASeconds?: number;
  partBSeconds?: number;
} {
  if (scene.kind === "hybrid_mp4_folder" && scene.narrationPartB) {
    const partA = masterRussellWav(`${scene.id}_partA`, scene.narration, 0.35);
    const partB = masterRussellWav(
      `${scene.id}_partB`,
      scene.narrationPartB,
      0.45,
    );
    const combinedMaster = join(AUDIO_DIR, `master_${scene.id}_Russell.wav`);
    const hashFile = join(AUDIO_DIR, `${scene.id}_Russell.sha1`);
    const combinedHash = createHash("sha1")
      .update(
        `Russell|hybrid|${scene.narration}|${scene.narrationPartB}`,
      )
      .digest("hex");
    if (
      !existsSync(combinedMaster) ||
      !existsSync(hashFile) ||
      readFileSync(hashFile, "utf8").trim() !== combinedHash
    ) {
      const concatTxt = join(AUDIO_DIR, `${scene.id}_concat.txt`);
      writeFileSync(
        concatTxt,
        `file '${partA.masterWav}'\nfile '${partB.masterWav}'\n`,
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
        concatTxt,
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        combinedMaster,
      ]);
      writeFileSync(hashFile, combinedHash);
    }
    return {
      rawWav: partA.rawWav,
      masterWav: combinedMaster,
      seconds: duration(combinedMaster),
      partARawWav: partA.rawWav,
      partAMasterWav: partA.masterWav,
      partASeconds: partA.seconds,
      partBSeconds: partB.seconds,
    };
  }
  return masterRussellWav(scene.id, scene.narration, 0.45);
}

// ---------------------------------------------------------------------------
// 2. Render Real Burned-In Read-Along .MP4 Excerpt (Cairo + Pango + AI Russell)
// ---------------------------------------------------------------------------
async function buildRealReadAlongExcerpt(
  excerptText: string,
  partARawWav: string,
  partAMasterWav: string,
  partASec: number,
): Promise<{
  mp4Path: string;
  srtText: string;
  vttText: string;
}> {
  const outMp4 = join(BUILD_DIR, "read_along_excerpt.mp4");
  const outSrt = join(BUILD_DIR, "read_along_excerpt.srt");
  const outVtt = join(BUILD_DIR, "read_along_excerpt.vtt");
  const hashFile = join(BUILD_DIR, "read_along_excerpt.sha1");
  const clipHash = createHash("sha1")
    .update(`${excerptText}|${partASec.toFixed(3)}|${BOOK_TITLE}`)
    .digest("hex");

  if (
    existsSync(outMp4) &&
    existsSync(outSrt) &&
    existsSync(outVtt) &&
    existsSync(hashFile) &&
    readFileSync(hashFile, "utf8").trim() === clipHash
  ) {
    console.log(`✅ Cached real Read-Along .MP4 excerpt (${partASec.toFixed(2)}s)`);
    return {
      mp4Path: outMp4,
      srtText: readFileSync(outSrt, "utf8"),
      vttText: readFileSync(outVtt, "utf8"),
    };
  }

  console.log(
    `🎬 Rendering real Native Cairo + Pango Read-Along .MP4 excerpt (${partASec.toFixed(2)}s)...`,
  );
  const rawBuf = Buffer.from(await Bun.file(partARawWav).arrayBuffer());
  const parsed = parseWavPcm(rawBuf);
  const rawDur =
    parsed.pcmData.length /
    (parsed.sampleRate * parsed.numChannels * (parsed.bitsPerSample >> 3));

  const s6Tmp = join(BUILD_DIR, "read_along_tmp");
  rmSync(s6Tmp, { recursive: true, force: true });
  mkdirSync(s6Tmp, { recursive: true });
  copyFileSync(partAMasterWav, join(s6Tmp, "stitched.wav"));

  const timeline = computeReadAlongTimeline(
    [
      {
        index: 0,
        paragraphIndex: 0,
        text: excerptText,
        startMs: 180,
        endMs: 180 + Math.round(rawDur * 1000),
        durationMs: Math.round(rawDur * 1000),
        pcmData: parsed.pcmData,
        sampleRate: parsed.sampleRate,
      },
    ],
    { aspectRatio: "16:9" },
  );
  const srtText = formatSrtSubtitles(timeline);
  const vttText = formatVttSubtitles(timeline);
  writeFileSync(join(s6Tmp, "subtitles.srt"), srtText);
  writeFileSync(outSrt, srtText);
  writeFileSync(outVtt, vttText);

  const ctx = createContext({ home: HOME, dataDir: DATA });
  await renderBurnedInReadAlongVideoParallel({
    ctx,
    ffmpegExe: FFMPEG,
    tmpDir: s6Tmp,
    timeline,
    format: "mp4",
    aspectRatio: "16:9",
    videoTheme: "midnight",
    voice: "Russell",
    title: `${BOOK_TITLE} — Chapter 1`,
    speed: 1,
    pitch: 0,
    sampleRate: 48000,
    expectedDurationSec: partASec,
    hasSrtFile: true,
    runFfmpegWithAbort: async (ffArgs, cwd) => {
      const p = Bun.spawnSync([FFMPEG, ...ffArgs], {
        cwd: cwd ?? s6Tmp,
        stdout: "pipe",
        stderr: "pipe",
      });
      return {
        outText: p.stdout.toString(),
        errText: p.stderr.toString(),
        exitCode: p.exitCode,
      };
    },
  });

  copyFileSync(join(s6Tmp, "out.mp4"), outMp4);
  writeFileSync(hashFile, clipHash);
  rmSync(s6Tmp, { recursive: true, force: true });

  return { mp4Path: outMp4, srtText, vttText };
}

// ---------------------------------------------------------------------------
// 3. Seed Isolated Privacy-Safe Workspace + Real Output Artifacts
// ---------------------------------------------------------------------------
function seedIsolatedWorkspace(opts: {
  excerptMp4: string;
  excerptSrt: string;
  excerptVtt: string;
  partAMasterWav: string;
}) {
  rmSync(WORKSPACE_ROOT, { recursive: true, force: true });
  mkdirSync(WORKSPACE_ROOT, { recursive: true });
  mkdirSync(DATA, { recursive: true });
  mkdirSync(GRAVE, { recursive: true });
  mkdirSync(ZDOT, { recursive: true });
  mkdirSync(BOOKS_DIR, { recursive: true });
  mkdirSync(DEMO_AUDIO_DIR, { recursive: true });
  mkdirSync(join(HOME, "Documents"), { recursive: true });

  // Starter reading notes inside Books so the folder looks alive from frame 1
  writeFileSync(
    join(BOOKS_DIR, "Reading_Queue_Notes.md"),
    [
      "# Local-First Reading List",
      "",
      `- **${BOOK_TITLE}** — ${BOOK_AUTHOR}`,
      "- Format: Kindle Open-Book Reader (macOS Apple Vision OCR)",
      "- Audio Voice: AI Russell (Ollama Phonon MLX)",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(HOME, "Documents", "Local_First_Manifesto.md"),
    "# Local-First Principles\n\nFast offline software with full user data ownership.\n",
  );

  // Pre-synthesize or copy the Scene 5 chunk preview WAV for real Follow-Along Teleprompter playback
  copyFileSync(opts.partAMasterWav, LISTEN_PREVIEW_WAV);
}

function materializeBooksFolderOutputs(opts: {
  excerptMp4: string;
  excerptSrt: string;
  excerptVtt: string;
  partAMasterWav: string;
}) {
  const stem = BOOK_TITLE;
  const mp4Dest = join(BOOKS_DIR, `${stem}.mp4`);
  const srtDest = join(BOOKS_DIR, `${stem}.srt`);
  const vttDest = join(BOOKS_DIR, `${stem}.vtt`);
  const mp3Dest = join(BOOKS_DIR, `${stem}.mp3`);
  const m4bDest = join(BOOKS_DIR, `${stem}.m4b`);
  const mdDest = join(BOOKS_DIR, `${stem}.md`);

  copyFileSync(opts.excerptMp4, mp4Dest);
  writeFileSync(srtDest, opts.excerptSrt);
  writeFileSync(vttDest, opts.excerptVtt);

  // Mastered .MP3 from AI Russell audio
  run([
    FFMPEG,
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    opts.partAMasterWav,
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    "-metadata",
    `title=${BOOK_TITLE}`,
    "-metadata",
    `artist=${BOOK_AUTHOR}`,
    mp3Dest,
  ]);

  // Chaptered .M4B audiobook with FFMETADATA1 chapters
  const metaPath = join(BUILD_DIR, "m4b_chapters.txt");
  const totalMs = Math.max(3000, Math.round(duration(opts.partAMasterWav) * 1000));
  const c1 = Math.round(totalMs * 0.25);
  const c2 = Math.round(totalMs * 0.6);
  const c3 = Math.round(totalMs * 0.85);
  writeFileSync(
    metaPath,
    [
      ";FFMETADATA1",
      `title=${BOOK_TITLE}`,
      `artist=${BOOK_AUTHOR}`,
      "genre=Audiobook",
      "",
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      "START=0",
      `END=${c1}`,
      "title=Introduction",
      "",
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      `START=${c1}`,
      `END=${c2}`,
      "title=Chapter 1: Your Files Belong on Your Machine",
      "",
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      `START=${c2}`,
      `END=${c3}`,
      "title=Chapter 2: Offline Memory & Instant Search",
      "",
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      `START=${c3}`,
      `END=${totalMs}`,
      "title=Chapter 3: Listening Without Giving Up Ownership",
      "",
    ].join("\n"),
  );
  run([
    FFMPEG,
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    opts.partAMasterWav,
    "-i",
    metaPath,
    "-map",
    "0:a",
    "-map_metadata",
    "1",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-f",
    "mp4",
    m4bDest,
  ]);

  if (!existsSync(mdDest)) {
    writeFileSync(mdDest, `${FULL_SYNTHETIC_BOOK}\n`);
  }
}

// ---------------------------------------------------------------------------
// 4. Studio HTML→PNG Cards & Bottom HUD Bar (Display P3 Obsidian / Gold / Cyan)
// ---------------------------------------------------------------------------
const BASE_CARD_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter","Segoe UI",sans-serif;color:#f8fafc;background:#050811;}
.bg{
  position:relative;width:1920px;height:1080px;overflow:hidden;
  background:
    radial-gradient(1200px 720px at 14% 8%, rgba(56,189,248,0.22), transparent 65%),
    radial-gradient(1000px 700px at 88% 92%, rgba(245,158,11,0.18), transparent 65%),
    radial-gradient(900px 600px at 78% 12%, rgba(129,140,248,0.16), transparent 60%),
    linear-gradient(160deg, #050811 0%, #0b1121 55%, #070b15 100%);
  display:flex;flex-direction:column;justify-content:space-between;padding:72px 102px 60px;
}
.grid-lines{
  position:absolute;inset:0;pointer-events:none;opacity:0.08;
  background-image:linear-gradient(rgba(148,163,184,0.4) 1px, transparent 1px),linear-gradient(90deg, rgba(148,163,184,0.4) 1px, transparent 1px);
  background-size:64px 64px;
}
.top-bar{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2}
.pill-badge{
  display:inline-flex;align-items:center;gap:10px;
  background:linear-gradient(135deg,rgba(56,189,248,0.2),rgba(245,158,11,0.18));
  border:1.5px solid rgba(56,189,248,0.58);color:#e0f2fe;
  font-size:20px;font-weight:800;letter-spacing:0.11em;text-transform:uppercase;
  padding:11px 24px;border-radius:999px;box-shadow:0 12px 32px rgba(0,0,0,0.4);
}
.russell-chip{
  display:inline-flex;align-items:center;gap:10px;
  background:rgba(15,23,42,0.88);border:1.5px solid rgba(245,158,11,0.58);
  color:#fef3c7;font-size:19px;font-weight:700;padding:11px 22px;border-radius:999px;
}
.main{position:relative;z-index:2;display:flex;flex-direction:column;gap:26px}
.hero-title{
  font-size:94px;font-weight:900;line-height:1.04;letter-spacing:-0.03em;
  background:linear-gradient(95deg,#ffffff 0%,#e0f2fe 52%,#fde68a 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.hero-sub{font-size:33px;font-weight:500;line-height:1.38;color:#cbd5e1;max-width:1600px}
.chips{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px}
.chip{
  background:rgba(15,23,42,0.84);border:1.5px solid rgba(148,163,184,0.28);
  border-left:5px solid #38bdf8;border-radius:16px;padding:15px 24px;
  font-size:24px;font-weight:700;color:#f1f5f9;box-shadow:0 12px 30px rgba(0,0,0,0.38);
}
.chip.gold{border-left-color:#f59e0b}
.chip.violet{border-left-color:#818cf8}
.footer{
  position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;
  border-top:1px solid rgba(148,163,184,0.22);padding-top:22px;font-size:20px;color:#94a3b8;font-weight:600;
}
.progress{display:flex;gap:8px;align-items:center}
.dot{width:34px;height:7px;border-radius:999px;background:rgba(148,163,184,0.25)}
.dot.active{background:linear-gradient(90deg,#38bdf8,#f59e0b);width:54px}
.dot.done{background:rgba(56,189,248,0.6)}
`;

function progressDots(stepNum: number): string {
  return [1, 2, 3, 4, 5, 6, 7, 8]
    .map((n) => {
      const cls = n === stepNum ? "dot active" : n < stepNum ? "dot done" : "dot";
      return `<span class="${cls}"></span>`;
    })
    .join("");
}

function buildTitleCardHtml(scene: StoryboardScene): string {
  const chips = [
    "🍎 macOS Exclusive (Apple Vision + CoreGraphics)",
    "📖 2-Column Spread OCR & Book Title Detection",
    "⏭️ Auto Front-Fluff Skip & Back-Matter Stop",
    "🔊 Book View Live Word-by-Word Teleprompter",
    "🎬 Synced Read-Along .MP4 + .SRT + .VTT + .M4B",
    "🔒 100% Local on Apple Silicon · Zero Cloud",
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CARD_CSS}
.hero-title{font-size:96px}
.kicker{font-size:24px;font-weight:800;letter-spacing:0.16em;color:#38bdf8;text-transform:uppercase}
</style></head><body><div class="bg"><div class="grid-lines"></div>
<div class="top-bar">
  <div class="pill-badge">${esc(scene.badge)}</div>
  <div class="russell-chip">🎙️ Narrated by AI Russell · Ollama Phonon MLX</div>
</div>
<div class="main">
  <div class="kicker">CODECAINE FILE MANAGER · PHONON VOICE STUDIO</div>
  <div class="hero-title">${esc(scene.title)}</div>
  <div class="hero-sub">${esc(scene.subtitle)}</div>
  <div class="chips">${chips.map((c, i) => `<div class="chip ${i % 3 === 1 ? "gold" : i % 3 === 2 ? "violet" : ""}">${esc(c)}</div>`).join("")}</div>
</div>
<div class="footer">
  <span>github.com/codecaine-zz/bun_rad_studio · macOS Exclusive Feature</span>
  <div class="progress">${progressDots(1)}</div>
</div>
</div></body></html>`;
}

function buildFeatureCardHtml(scene: StoryboardScene): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CARD_CSS}
.hero-title{font-size:66px}
.hero-sub{font-size:26px}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:8px}
.card{
  background:linear-gradient(155deg,rgba(15,23,42,0.9),rgba(11,17,33,0.84));
  border:1.5px solid rgba(148,163,184,0.25);border-radius:24px;padding:30px 32px;
  box-shadow:0 22px 48px rgba(0,0,0,0.45);display:flex;flex-direction:column;gap:14px;
}
.card-tag{
  align-self:flex-start;font-size:15px;font-weight:900;letter-spacing:0.1em;
  padding:6px 14px;border-radius:999px;text-transform:uppercase;
}
.card-tag.cyan{background:rgba(56,189,248,0.18);color:#7dd3fc;border:1px solid rgba(56,189,248,0.45)}
.card-tag.gold{background:rgba(245,158,11,0.18);color:#fde68a;border:1px solid rgba(245,158,11,0.45)}
.card-tag.violet{background:rgba(129,140,248,0.18);color:#c7d2fe;border:1px solid rgba(129,140,248,0.45)}
.card h3{font-size:29px;font-weight:800;color:#ffffff;line-height:1.2}
.card p,.card li{font-size:21px;line-height:1.45;color:#cbd5e1}
.card ul{padding-left:22px;display:flex;flex-direction:column;gap:10px}
code{background:rgba(56,189,248,0.14);color:#7dd3fc;padding:3px 8px;border-radius:6px;font-size:18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.cli-box{
  margin-top:6px;background:rgba(6,10,20,0.95);border:1.5px solid rgba(56,189,248,0.5);
  border-radius:14px;padding:16px 18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:18px;line-height:1.48;color:#7dd3fc;word-break:break-word;
}
</style></head><body><div class="bg"><div class="grid-lines"></div>
<div class="top-bar">
  <div class="pill-badge">${esc(scene.badge)}</div>
  <div class="russell-chip">🎙️ AI Russell · ${esc(scene.hudStep)}</div>
</div>
<div class="main">
  <div class="hero-title">${esc(scene.title)}</div>
  <div class="hero-sub">${esc(scene.subtitle)}</div>
  <div class="cols3">
    <div class="card">
      <div class="card-tag cyan">MACOS PERMISSIONS &amp; FOCUS</div>
      <h3>Screen Recording &amp; Accessibility</h3>
      <ul>
        <li><b>Screen Recording:</b> Captures open &amp; off-Space Kindle windows cleanly for Apple Vision OCR</li>
        <li><b>Accessibility:</b> Sends reliable page-turn keys across macOS Spaces with 3-step duplicate retry</li>
        <li><b>Auto Focus Return:</b> Automatically switches focus back to Codecaine File Manager when finished</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-tag gold">MACOS EXCLUSIVE BY DESIGN</div>
      <h3>Clean Cross-Platform Gating</h3>
      <ul>
        <li>Built natively on <code>CGWindowListCopyWindowInfo</code>, <code>VNRecognizeTextRequest</code> &amp; AppleScript</li>
        <li><b>macOS:</b> Full Kindle panel, Command Palette actions &amp; CLI enabled automatically</li>
        <li><b>Linux &amp; Windows:</b> Stay clutter-free — Kindle controls &amp; prompts stay completely hidden</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-tag violet">AUTOMATED CLI WORKFLOW</div>
      <h3>Headless Whole-Book Pipeline</h3>
      <p>Automate single-page or 5,000-page Kindle capture &amp; Read-Along video rendering directly from zsh:</p>
      <div class="cli-box">$ bun run cli:tts kindle --all-pages --start-at intro --skip-fluff --voice Russell -f mp4</div>
      <p>Outputs <code>.mp4</code>, <code>.srt</code>, <code>.vtt</code>, <code>.mp3</code>, <code>.m4b</code> &amp; <code>.md</code> straight into your target folder.</p>
    </div>
  </div>
</div>
<div class="footer">
  <span>Codecaine File Manager · Kindle Open-Book Reader (macOS Exclusive)</span>
  <div class="progress">${progressDots(7)}</div>
</div>
</div></body></html>`;
}

function buildOutroCardHtml(scene: StoryboardScene): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CARD_CSS}
.hero-title{font-size:80px}
.term-box{
  background:rgba(8,13,26,0.95);border:1.5px solid rgba(56,189,248,0.55);border-radius:20px;
  padding:26px 32px;display:flex;flex-direction:column;gap:12px;max-width:1160px;
  box-shadow:0 24px 60px rgba(0,0,0,0.6);
}
.term-cmd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:30px;font-weight:800;color:#38bdf8}
.term-url{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:23px;color:#fde68a}
.pillars{display:flex;gap:14px;flex-wrap:wrap;max-width:1360px}
.plat{background:rgba(15,23,42,0.88);border:1.5px solid rgba(148,163,184,0.32);padding:13px 22px;border-radius:14px;font-size:21px;font-weight:700;color:#e2e8f0}
</style></head><body><div class="bg"><div class="grid-lines"></div>
<div class="top-bar">
  <div class="pill-badge">${esc(scene.badge)}</div>
  <div class="russell-chip">🎙️ Narrated by AI Russell · Ollama Phonon MLX</div>
</div>
<div class="main">
  <div class="hero-title">${esc(scene.title)}</div>
  <div class="hero-sub">${esc(scene.subtitle)}</div>
  <div class="term-box">
    <div class="term-cmd">$ brew install --cask codecaine-file-manager</div>
    <div class="term-url">https://github.com/codecaine-zz/bun_rad_studio/releases/latest</div>
  </div>
  <div class="pillars">
    <div class="plat">🍎 Apple Vision OCR (2-Column Spreads)</div>
    <div class="plat">🎙️ Apple Silicon MLX Phonon TTS</div>
    <div class="plat">🎬 Native Cairo + Pango .MP4</div>
    <div class="plat">🔒 Zero Cloud Uploads · MIT License</div>
  </div>
</div>
<div class="footer">
  <span>Like, Subscribe &amp; Try Kindle Open-Book Reader on macOS · Music by Codecaine (CC BY 4.0)</span>
  <div class="progress">${progressDots(8)}</div>
</div>
</div></body></html>`;
}

function buildBottomHudHtml(
  scene: StoryboardScene,
  index: number,
  total: number,
): string {
  const keycapHtml = scene.keycaps.length
    ? scene.keycaps.map((k) => `<span class="kbd">${esc(k)}</span>`).join("")
    : `<span class="pill-tag">SCREENSHOT_MODE=1 · DEMO</span>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1920px;height:1080px;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;position:relative;overflow:hidden}
.strip{
  position:absolute;left:0;right:0;bottom:0;height:${HUD_H}px;
  background:linear-gradient(180deg,rgba(11,17,33,0.97),rgba(5,8,17,0.99));
  border-top:2.5px solid #38bdf8;
  display:flex;align-items:center;justify-content:space-between;gap:22px;padding:0 36px;
}
.left{display:flex;align-items:center;gap:20px;min-width:0;flex:1}
.badge{
  flex:none;background:linear-gradient(135deg,#38bdf8,#818cf8);color:#040814;
  font-weight:900;font-size:13.5px;letter-spacing:0.08em;padding:8px 16px;border-radius:10px;text-transform:uppercase;
}
.text-col{display:flex;flex-direction:column;gap:3px;min-width:0}
.title{color:#ffffff;font-size:21px;font-weight:800;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{color:#94a3b8;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.right{flex:none;display:flex;align-items:center;gap:12px}
.kbd{
  background:rgba(56,189,248,0.16);border:1.5px solid rgba(56,189,248,0.6);color:#7dd3fc;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;font-weight:800;padding:6px 13px;border-radius:9px;
}
.pill-tag{
  background:rgba(52,211,153,0.14);border:1px solid rgba(52,211,153,0.45);color:#6ee7b7;
  font-size:13.5px;font-weight:700;padding:6px 13px;border-radius:9px;
}
.russell{
  background:rgba(245,158,11,0.16);border:1.5px solid rgba(245,158,11,0.55);color:#fef3c7;
  font-size:14.5px;font-weight:800;padding:7px 15px;border-radius:10px;white-space:nowrap;
}
.step{
  background:rgba(15,23,42,0.9);border:1px solid rgba(148,163,184,0.35);color:#e2e8f0;
  font-size:14px;font-weight:700;padding:7px 14px;border-radius:10px;white-space:nowrap;
}
</style></head><body><div class="strip">
  <div class="left">
    <div class="badge">${esc(scene.badge)}</div>
    <div class="text-col">
      <div class="title">${esc(scene.title)}</div>
      <div class="sub">${esc(scene.subtitle)}</div>
    </div>
  </div>
  <div class="right">
    ${keycapHtml}
    <div class="russell">🎙️ AI Russell</div>
    <div class="step">${index + 1} / ${total}</div>
  </div>
</div></body></html>`;
}

async function renderHtmlToPng(
  browser: Cdp,
  html: string,
  outPng: string,
  transparent = false,
): Promise<void> {
  const htmlFile = outPng.replace(/\.png$/, ".html");
  writeFileSync(htmlFile, html);
  await browser.goto(`file://${htmlFile}`, null);
  await browser.eval(`(() => {
    document.querySelectorAll('div, svg').forEach((el) => {
      if (el instanceof HTMLElement && el.style.zIndex === '2147483647') el.remove();
    });
  })()`);
  await browser.send("Emulation.setDefaultBackgroundColorOverride", {
    color: transparent
      ? { r: 0, g: 0, b: 0, a: 0 }
      : { r: 5, g: 8, b: 17, a: 1 },
  });
  const shot = await browser.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(outPng, Buffer.from(shot.data, "base64"));
}

// ---------------------------------------------------------------------------
// 5. CDP window.fetch Wrapper for 100% Synthetic Isolated Kindle Demo
// ---------------------------------------------------------------------------
function buildSyntheticFetchWrapperScript(opts: {
  listenPreviewWavPath: string;
  listenPreviewDurSec: number;
  listenWords: any[];
  listenCues: any[];
  booksDir: string;
  excerptMp4Dest: string;
}): string {
  const syntheticWindows = [
    {
      id: 9041,
      ownerName: "Kindle",
      title: BOOK_WINDOW_TITLE,
      pid: 4102,
      bounds: { x: 0, y: 0, width: 1728, height: 1084 },
      isKindle: true,
      score: 148,
      onScreen: false,
    },
    {
      id: 9042,
      ownerName: "Safari",
      title: `Kindle Cloud Reader — ${BOOK_TITLE}`,
      pid: 4188,
      bounds: { x: 80, y: 60, width: 1440, height: 900 },
      isKindle: true,
      score: 118,
      onScreen: true,
    },
  ];

  const payload = {
    windows: syntheticWindows,
    bookTitle: BOOK_TITLE,
    singlePageText: PAGE_CH1_SPREAD,
    singlePageWords: countWords(PAGE_CH1_SPREAD),
    steps: [
      {
        status: "running",
        phase: "skipping_front",
        currentPage: 2,
        skippedFrontPages: 2,
        capturedPagesCount: 0,
        combinedText: "",
        wordCount: 0,
        twoColumn: true,
      },
      {
        status: "running",
        phase: "skipping_front",
        currentPage: 3,
        skippedFrontPages: 3,
        capturedPagesCount: 0,
        combinedText: "",
        wordCount: 0,
        twoColumn: true,
      },
      {
        status: "running",
        phase: "capturing",
        currentPage: 4,
        skippedFrontPages: 3,
        startHeading: "Introduction",
        capturedPagesCount: 1,
        combinedText: PAGE_INTRO,
        wordCount: countWords(PAGE_INTRO),
        twoColumn: true,
      },
      {
        status: "running",
        phase: "retrying",
        currentPage: 5,
        skippedFrontPages: 3,
        startHeading: "Introduction",
        capturedPagesCount: 2,
        combinedText: `${PAGE_INTRO}\n\n${PAGE_CH1_SPREAD}`,
        wordCount: countWords(`${PAGE_INTRO}\n\n${PAGE_CH1_SPREAD}`),
        twoColumn: true,
      },
      {
        status: "running",
        phase: "capturing",
        currentPage: 6,
        skippedFrontPages: 3,
        startHeading: "Introduction",
        capturedPagesCount: 3,
        combinedText: `${PAGE_INTRO}\n\n${PAGE_CH1_SPREAD}\n\n${PAGE_CH2}`,
        wordCount: countWords(
          `${PAGE_INTRO}\n\n${PAGE_CH1_SPREAD}\n\n${PAGE_CH2}`,
        ),
        twoColumn: true,
      },
      {
        status: "completed",
        phase: "done",
        currentPage: 8,
        skippedFrontPages: 3,
        startHeading: "Introduction",
        stoppedHeading: "Acknowledgments",
        stoppedReason: "Stopped at back matter: Acknowledgments & Index",
        capturedPagesCount: 4,
        combinedText: `${PAGE_INTRO}\n\n${PAGE_CH1_SPREAD}\n\n${PAGE_CH2}\n\n${PAGE_CH3}`,
        wordCount: countWords(
          `${PAGE_INTRO}\n\n${PAGE_CH1_SPREAD}\n\n${PAGE_CH2}\n\n${PAGE_CH3}`,
        ),
        twoColumn: true,
      },
    ],
    listenPreviewWavPath: opts.listenPreviewWavPath,
    listenPreviewDurSec: opts.listenPreviewDurSec,
    listenWords: opts.listenWords,
    listenCues: opts.listenCues,
    booksDir: opts.booksDir,
    excerptMp4Dest: opts.excerptMp4Dest,
  };

  return `(() => {
    if (window.__kindleYtFetchWrapped) return;
    window.__kindleYtFetchWrapped = true;
    const CFG = ${JSON.stringify(payload)};
    const origFetch = window.fetch.bind(window);
    const jsonResp = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" }
    });
    const sessionState = { id: "yt-demo-kindle-sess", poll: 0, stopped: false };
    const demoJobs = [];

    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const pathOnly = url.split("?")[0];
      const parseBody = () => {
        try {
          return init && typeof init.body === "string" ? JSON.parse(init.body) : {};
        } catch { return {}; }
      };

      if (pathOnly.endsWith("/api/kindle/status")) {
        return jsonResp({
          ok: true,
          supported: true,
          platform: "darwin",
          visionAvailable: true,
          tesseractAvailable: true,
          screencaptureAvailable: true,
          osascriptAvailable: true,
          kindleWindowCount: CFG.windows.length,
          windowsCount: CFG.windows.length
        });
      }

      if (pathOnly.endsWith("/api/kindle/windows")) {
        return jsonResp({ ok: true, windows: CFG.windows });
      }

      if (pathOnly.endsWith("/api/kindle/capture-page")) {
        await new Promise((r) => setTimeout(r, 550));
        return jsonResp({
          ok: true,
          window: CFG.windows[0],
          bookTitle: CFG.bookTitle,
          page: {
            pageIndex: 0,
            text: CFG.singlePageText,
            rawText: CFG.singlePageText,
            engine: "vision",
            wordCount: CFG.singlePageWords,
            charCount: CFG.singlePageText.length,
            windowTitle: CFG.windows[0].title,
            bookTitle: CFG.bookTitle,
            twoColumn: true,
            durationMs: 412
          }
        });
      }

      if (pathOnly.endsWith("/api/kindle/start-capture")) {
        const b = parseBody();
        sessionState.poll = 0;
        sessionState.stopped = false;
        return jsonResp({
          ok: true,
          sessionId: sessionState.id,
          status: "running",
          totalPages: b.readAllPages ? 2500 : (b.pages || 5),
          readAllPages: Boolean(b.readAllPages),
          window: CFG.windows[0],
          bookTitle: CFG.bookTitle
        });
      }

      if (pathOnly.endsWith("/api/kindle/session")) {
        const idx = Math.min(sessionState.poll, CFG.steps.length - 1);
        sessionState.poll += 1;
        const st = CFG.steps[idx];
        return jsonResp({
          ok: true,
          sessionId: sessionState.id,
          status: sessionState.stopped ? "stopped" : st.status,
          phase: st.phase,
          currentPage: st.currentPage,
          totalPages: 2500,
          readAllPages: true,
          skippedFrontPages: st.skippedFrontPages,
          ...(st.startHeading ? { startHeading: st.startHeading } : {}),
          ...(st.stoppedHeading ? { stoppedHeading: st.stoppedHeading } : {}),
          ...(st.stoppedReason ? { stoppedReason: st.stoppedReason } : {}),
          capturedPagesCount: st.capturedPagesCount,
          latestPage: {
            pageIndex: Math.max(0, st.capturedPagesCount - 1),
            text: st.combinedText,
            rawText: st.combinedText,
            engine: "vision",
            wordCount: st.wordCount,
            charCount: st.combinedText.length,
            windowTitle: CFG.windows[0].title,
            bookTitle: CFG.bookTitle,
            twoColumn: true,
            durationMs: 390
          },
          combinedText: st.combinedText,
          wordCount: st.wordCount,
          windowTitle: CFG.windows[0].title,
          bookTitle: CFG.bookTitle
        });
      }

      if (pathOnly.endsWith("/api/kindle/stop-capture")) {
        sessionState.stopped = true;
        return jsonResp({
          ok: true,
          sessionId: sessionState.id,
          status: "stopped",
          phase: "done",
          capturedPagesCount: 4,
          combinedText: CFG.steps[CFG.steps.length - 1].combinedText,
          wordCount: CFG.steps[CFG.steps.length - 1].wordCount,
          bookTitle: CFG.bookTitle
        });
      }

      if (pathOnly.endsWith("/api/phonon/speak") && window.__useDemoSpeakStub) {
        const token = document.querySelector('meta[name="fm-token"]')?.getAttribute("content") || "";
        return jsonResp({
          ok: true,
          audioId: "demo-russell-ch1",
          url: "/api/raw?path=" + encodeURIComponent(CFG.listenPreviewWavPath),
          durationSec: CFG.listenPreviewDurSec,
          durationMs: Math.round(CFG.listenPreviewDurSec * 1000),
          sampleRate: 48000,
          byteLength: 240000,
          voice: "Russell",
          pitch: 0,
          pcmAligned: true,
          words: CFG.listenWords,
          cues: CFG.listenCues,
          token
        });
      }

      if (pathOnly.endsWith("/api/phonon/video") && window.__useDemoVideoStub) {
        const job = {
          id: "demo-readalong-mp4-job",
          kind: "phonon-video",
          label: "Read-Along Video (.MP4)",
          state: "done",
          outputs: [CFG.excerptMp4Dest],
          log: "Rendered 1920x1080 Read-Along .MP4 + .SRT + .VTT into Books"
        };
        demoJobs.push(job);
        return jsonResp({ ok: true, job, outputs: [CFG.excerptMp4Dest] });
      }

      if (pathOnly.endsWith("/api/jobs/list") && demoJobs.length > 0) {
        const res = await origFetch(input, init);
        const data = await res.json();
        return jsonResp({
          ...data,
          jobs: [...demoJobs, ...(Array.isArray(data.jobs) ? data.jobs : [])]
        });
      }

      return origFetch(input, init);
    };
  })();`;
}

// ---------------------------------------------------------------------------
// 6. Live UI Helpers & Scene Choreography (1920x972)
// ---------------------------------------------------------------------------
async function prepCleanPage(c: Cdp) {
  await c.eval(`(() => {
    try { localStorage.setItem("fm_seen_welcome", "1"); } catch {}
    document.querySelectorAll(".modal-backdrop").forEach((e) => e.remove());
    const t = document.getElementById("toasts");
    if (t) t.style.cssText = "display:none !important;opacity:0 !important;pointer-events:none !important;";
  })()`);
}

async function applyDemoTheme(c: Cdp) {
  await c.eval(`(async () => {
    try {
      const t = await import('/ui/themes.js');
      if (t.applyTheme) await t.applyTheme('ccfm_xdr_oled_titanium_pro');
    } catch {}
  })()`);
}

async function spotlight(
  c: Cdp,
  selector: string,
  label?: string,
  tagPos: "above" | "below" | "inside-bottom" = "above",
) {
  await c.eval(`(() => {
    let ring = document.getElementById("yt-spotlight");
    if (!ring) {
      ring = document.createElement("div");
      ring.id = "yt-spotlight";
      ring.style.cssText = "position:fixed;z-index:2147483645;pointer-events:none;border:3px solid #38bdf8;border-radius:12px;box-shadow:0 0 0 4px rgba(56,189,248,0.28),0 0 28px rgba(56,189,248,0.75);transition:all 0.25s cubic-bezier(0.22,1,0.36,1)";
      document.documentElement.appendChild(ring);
    }
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) { ring.style.opacity = "0"; return; }
    const r = target.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) { ring.style.opacity = "0"; return; }
    ring.style.opacity = "1";
    ring.style.left = Math.max(4, r.left - 5) + "px";
    ring.style.top = Math.max(4, r.top - 5) + "px";
    ring.style.width = Math.min(r.width + 10, 1912 - Math.max(4, r.left - 5)) + "px";
    ring.style.height = Math.min(r.height + 10, 958 - Math.max(4, r.top - 5)) + "px";
    ring.innerHTML = "";
    if (${JSON.stringify(label ?? "")}) {
      const tag = document.createElement("div");
      const mode = ${JSON.stringify(tagPos)};
      const posCss = mode === "inside-bottom"
        ? "position:absolute;bottom:10px;right:12px;"
        : (mode === "below" || r.top < 42)
          ? "position:absolute;bottom:-30px;right:8px;"
          : "position:absolute;top:-30px;right:8px;";
      tag.style.cssText = posCss +
        "background:#38bdf8;color:#04101f;font-weight:900;font-size:12px;padding:3px 11px;border-radius:6px;white-space:nowrap;box-shadow:0 6px 16px rgba(0,0,0,0.55);font-family:-apple-system,sans-serif;";
      tag.textContent = ${JSON.stringify(label ?? "")};
      ring.appendChild(tag);
    }
  })()`);
  await sleep(300);
}

async function clearSpotlight(c: Cdp) {
  await c.eval(`(() => { const r = document.getElementById("yt-spotlight"); if (r) r.style.opacity = "0"; })()`);
}

async function hoverEl(c: Cdp, selector: string, ms = 480) {
  const pos = (await c.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { x: Math.round(r.left + Math.min(r.width * 0.5, 220)), y: Math.round(r.top + Math.min(r.height * 0.5, 45)) };
  })()`)) as { x: number; y: number } | null;
  if (pos) await c.moveTo(pos.x, pos.y, ms);
}

async function saveQaFrame(c: Cdp, name: string) {
  mkdirSync(QA_FRAMES_DIR, { recursive: true });
  await c.screenshot(join(QA_FRAMES_DIR, name));
}

async function waitRemaining(t0: number, targetSec: number) {
  const elapsed = (Date.now() - t0) / 1000;
  const remain = Math.max(0.25, targetSec - elapsed - 0.3);
  await sleep(Math.round(remain * 1000));
}

async function prepLiveScene(
  c: Cdp,
  sceneId: string,
  baseUrl: string,
): Promise<void> {
  if (sceneId === "02_command_palette") {
    await c.goto(`${baseUrl}/`, "#view-tools");
    await applyDemoTheme(c);
    await prepCleanPage(c);
    await sleep(600);
    return;
  }

  if (sceneId === "03_detect_two_column") {
    if (!(await c.exists("#phonon-kindle-panel"))) {
      await c.goto(`${baseUrl}/`, "#view-tools");
      await applyDemoTheme(c);
      await prepCleanPage(c);
      await c.eval(`(async () => {
        const { openPower } = await import('/ui/power.js');
        openPower('phonon', { focusKindle: true });
      })()`);
      await c.waitFor("#phonon-kindle-detect-btn", 8000);
    }
    // Switch to full-width Tools view cleanly (no floating #power-max-bar pill)
    await c.click("#view-tools", { ms: 200, pause: 350 }).catch(() => {});
    await sleep(350);
    return;
  }

  if (sceneId === "04_whole_book_fluff") {
    if (!(await c.exists("#phonon-kindle-capture-all-btn"))) {
      await prepLiveScene(c, "03_detect_two_column", baseUrl);
    }
    await sleep(300);
    return;
  }

  if (sceneId === "05_book_view_listen") {
    if (!(await c.exists("#phonon-book-view-btn"))) {
      await prepLiveScene(c, "04_whole_book_fluff", baseUrl);
    }
    // Load the Chapter 1 Read-Along excerpt as 1 clean chunk so Book View has zero clipped "Next" cue
    await c.eval(`(() => {
      window.__useDemoSpeakStub = true;
      const vs = document.getElementById("phonon-voice-select");
      if (vs) {
        vs.value = "Russell";
        vs.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const ed = document.getElementById("phonon-text-editor");
      if (ed) {
        ed.value = ${JSON.stringify("Chapter One: Your Files Belong on Your Machine. Local-first software keeps your reading library fast, private, and durable offline, turning open Kindle pages into synchronized audio and cinema-grade Read-Along video right on Apple Silicon.")};
        ed.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const outName = document.getElementById("phonon-out-name");
      if (outName) {
        outName.value = ${JSON.stringify(BOOK_TITLE)};
      }
    })()`);
    await sleep(450);
    return;
  }

  if (sceneId === "06_read_along_mp4") {
    // Part B: Show the live File Manager Books folder with all 6 generated files (.mp4, .mp3, .m4b, .md, .srt, .vtt)
    await c.eval(`(async () => {
      const { closePower } = await import('/ui/power.js');
      const { goTo, refresh } = await import('/ui/nav.js');
      closePower();
      await goTo(${JSON.stringify(BOOKS_DIR)});
      await refresh({ keepSelection: false });
    })()`);
    await sleep(900);
  }
}

async function recordLiveScene(
  c: Cdp,
  scene: StoryboardScene,
  durationSec: number,
  _baseUrl: string,
): Promise<void> {
  const t0 = Date.now();

  if (scene.id === "02_command_palette") {
    await spotlight(c, "#viewbar-palette", "⌘K Command Palette");
    await hoverEl(c, "#viewbar-palette", 550);
    await c.eval(`window.__cc.keys(["⌘", "K"])`);
    await c.click("#viewbar-palette", { pause: 650 });
    await c.waitFor(".cp-input", 5000);
    await c.click(".cp-input", { ms: 250, pause: 150 });
    await c.type("Kindle", 75);
    await sleep(1100);
    await spotlight(
      c,
      ".cp-list",
      "macOS-Only Kindle Actions (Read & MP4)",
    );
    await saveQaFrame(c, "02_command_palette.png");
    await sleep(2200);
    await clearSpotlight(c);

    // Click "Kindle: Read Open Book Pages & Create Audio…"
    await c.click('.cp-item >> Kindle: Read Open Book Pages', { pause: 700 });
    await c.waitFor("#phonon-kindle-panel", 6000);
    await c.click("#view-tools", { ms: 200, pause: 350 }).catch(() => {});
    await sleep(800);
    await spotlight(
      c,
      "#phonon-kindle-panel",
      "Expanded Kindle Panel + Synced Books Folder",
      "below",
    );
    await sleep(1800);
    await c.eval(`(() => {
      const d = document.getElementById("phonon-out-dir");
      if (d) d.scrollIntoView({ behavior: "smooth", block: "center" });
    })()`);
    await sleep(600);
    await spotlight(
      c,
      "#phonon-out-dir",
      "Auto-Synced to Active Books Folder",
    );
    await waitRemaining(t0, durationSec);
    await clearSpotlight(c);
    return;
  }

  if (scene.id === "03_detect_two_column") {
    await c.eval(`(() => {
      const p = document.getElementById("phonon-kindle-panel");
      if (p) p.scrollIntoView({ behavior: "instant", block: "start" });
    })()`);
    await sleep(350);
    await spotlight(
      c,
      "#phonon-kindle-detect-btn",
      "Scan All macOS Spaces (Incl. Full-Screen)",
    );
    await c.click("#phonon-kindle-detect-btn", { pause: 800 });
    await sleep(1000);
    await spotlight(
      c,
      "#phonon-kindle-window",
      "Kindle — The Art of Local-First Computing (Full Screen / Other Space)",
    );
    await sleep(2400);

    await hoverEl(c, "#phonon-kindle-capture-one-btn", 500);
    await spotlight(
      c,
      "#phonon-kindle-capture-one-btn",
      "Apple Vision 2-Column Spread OCR",
    );
    await c.click("#phonon-kindle-capture-one-btn", { pause: 1000 });
    await sleep(1400);
    await spotlight(
      c,
      "#phonon-kindle-status",
      "✔ 2-Column Spread + Auto Book Title Detected",
      "below",
    );
    await saveQaFrame(c, "03_detect_two_column.png");
    await sleep(2400);

    await c.eval(`(() => {
      const n = document.getElementById("phonon-out-name");
      if (n) n.scrollIntoView({ behavior: "smooth", block: "center" });
    })()`);
    await sleep(650);
    await spotlight(
      c,
      "#phonon-out-name",
      'Output Filename Auto-Set: "The Art of Local-First Computing"',
    );
    await waitRemaining(t0, durationSec);
    await clearSpotlight(c);
    return;
  }

  if (scene.id === "04_whole_book_fluff") {
    await c.eval(`(() => {
      const p = document.getElementById("phonon-kindle-panel");
      if (p) p.scrollIntoView({ behavior: "instant", block: "start" });
    })()`);
    await sleep(400);

    await hoverEl(c, "#phonon-kindle-start-mode", 450);
    await spotlight(
      c,
      "#phonon-kindle-start-mode",
      "Start at Intro / Ch. 1 (Skip Cover, Copyright & TOC)",
    );
    await sleep(1800);

    await hoverEl(c, "#phonon-kindle-all-pages-toggle", 450);
    await c.click("#phonon-kindle-all-pages-toggle", { pause: 550 });
    await spotlight(
      c,
      "#phonon-kindle-all-pages-toggle",
      "Read All Pages (Up to 5,000 Pages)",
    );
    await sleep(1600);

    await hoverEl(c, "#phonon-kindle-capture-all-btn", 500);
    await spotlight(
      c,
      "#phonon-kindle-capture-all-btn",
      "Auto-Turn Across Spaces + 3-Step Retry + Back-Matter Stop",
    );
    await c.click("#phonon-kindle-capture-all-btn", { pause: 400 });

    // Watch live polling phases unfold in #phonon-kindle-status & #phonon-kindle-progress
    await sleep(4800);
    await spotlight(
      c,
      "#phonon-kindle-status",
      "Stopped Automatically at Back Matter (Acknowledgments & Index)",
      "below",
    );
    await saveQaFrame(c, "04_whole_book_fluff.png");
    await sleep(2000);

    // Click Save Book as .MD so real .md file lands in Books!
    await hoverEl(c, "#phonon-kindle-save-md-btn", 450);
    await spotlight(
      c,
      "#phonon-kindle-save-md-btn",
      "Save Cleaned Book as .MD in Current Folder",
    );
    await c.click("#phonon-kindle-save-md-btn", { pause: 800 });
    await waitRemaining(t0, durationSec);
    await clearSpotlight(c);
    return;
  }

  if (scene.id === "05_book_view_listen") {
    await c.eval(`(() => {
      const bv = document.getElementById("phonon-book-view-btn");
      if (bv && bv.getAttribute("aria-pressed") !== "true") bv.click();
      const box = document.querySelector(".phonon-teleprompter-box");
      if (box) box.scrollIntoView({ behavior: "instant", block: "center" });
    })()`);
    await sleep(500);
    await spotlight(
      c,
      "#phonon-book-view-btn",
      "📖 Book View — Wide Left-Aligned E-Book Stage",
    );
    await sleep(1800);

    await hoverEl(c, ".phonon-play-btn", 450);
    await spotlight(
      c,
      ".phonon-teleprompter-box",
      "AI Russell Narrating · Real-Time Word Highlighting",
    );
    await c.click(".phonon-play-btn", { pause: 400 });
    await sleep(3200);

    // Ensure at least one word visibly shows active speaking highlight if headless audio clock lagged
    await c.eval(`(() => {
      const speaking = document.querySelector(".phonon-word.is-speaking");
      if (!speaking) {
        const words = [...document.querySelectorAll(".phonon-teleprompter-cues .phonon-word")];
        words.forEach((w, idx) => {
          if (idx < 7) w.className = "phonon-word is-spoken";
          else if (idx === 7) w.className = "phonon-word is-speaking";
          else w.className = "phonon-word is-upcoming";
        });
      }
    })()`);
    await saveQaFrame(c, "05_book_view_listen.png");

    await waitRemaining(t0, durationSec);
    await clearSpotlight(c);
    await c.eval(`(() => {
      const stopBtn = document.querySelector(".phonon-transport-btns button:nth-child(3)");
      if (stopBtn && !stopBtn.disabled) stopBtn.click();
    })()`);
    return;
  }

  if (scene.id === "06_read_along_mp4") {
    // Select all 6 generated files in Books folder and highlight the active Books output view
    await c.eval(`(async () => {
      const { left } = await import('/ui/pane.js');
      const { renderList } = await import('/ui/list.js');
      if (left && Array.isArray(left.entries)) {
        left.selection.clear();
        for (const e of left.entries) {
          if (e.name.startsWith(${JSON.stringify(BOOK_TITLE)})) {
            left.selection.add(e.path);
          }
        }
        renderList(left);
      }
    })()`);
    await sleep(700);
    await spotlight(
      c,
      "#list",
      "All 6 Files Saved in Active Books Folder (.mp4 · .mp3 · .m4b · .md · .srt · .vtt)",
      "inside-bottom",
    );
    await saveQaFrame(c, "06_books_folder.png");
    await sleep(3200);

    // Also open Quick Look on the generated .md for crisp visual confirmation
    await c.eval(`(async () => {
      const { left } = await import('/ui/pane.js');
      const { openQuickLook } = await import('/ui/quicklook.js');
      const mdEntry = left?.entries?.find((e) => e.name.endsWith('.md') && e.name.startsWith(${JSON.stringify(BOOK_TITLE)}));
      if (mdEntry) openQuickLook(mdEntry);
    })()`);
    await sleep(1600);
    await spotlight(
      c,
      "#quicklook",
      "Quick Look Preview · Zero-PII Markdown & Subtitles Ready",
    );
    await waitRemaining(t0, durationSec);
    await c.eval(`(async () => {
      const { closeQuickLook } = await import('/ui/quicklook.js');
      closeQuickLook();
    })()`);
    await clearSpotlight(c);
  }
}

// ---------------------------------------------------------------------------
// 7. High-CTR 1280x720 YouTube Thumbnail Generator
// ---------------------------------------------------------------------------
async function generateThumbnail(browser: Cdp) {
  const toDataUrl = (p: string) =>
    existsSync(p)
      ? `data:image/png;base64,${readFileSync(p).toString("base64")}`
      : "";
  const img1 = toDataUrl(join(QA_FRAMES_DIR, "03_detect_two_column.png"));
  const img2 = toDataUrl(join(QA_FRAMES_DIR, "05_book_view_listen.png"));
  const rawThumbMp4 = join(BUILD_DIR, "read_along_thumb_raw.png");
  const img3 = toDataUrl(
    existsSync(rawThumbMp4) ? rawThumbMp4 : join(QA_FRAMES_DIR, "06_read_along_mp4.png"),
  );

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1280px;height:720px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter",sans-serif;color:#fff;background:#050811}
.wrap{
  position:relative;width:1280px;height:720px;overflow:hidden;
  background:
    radial-gradient(780px 560px at 14% 12%, rgba(56,189,248,0.34), transparent 65%),
    radial-gradient(660px 500px at 88% 88%, rgba(245,158,11,0.28), transparent 65%),
    linear-gradient(135deg,#040710 0%,#0b1326 55%,#070b15 100%);
  padding:44px 52px;display:flex;align-items:center;
}
.left{width:645px;position:relative;z-index:5;display:flex;flex-direction:column;gap:18px}
.badges{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.b-ver{
  background:linear-gradient(135deg,#38bdf8,#818cf8);color:#040814;
  font-size:20px;font-weight:900;letter-spacing:0.06em;padding:8px 18px;border-radius:12px;
}
.b-rus{
  background:rgba(245,158,11,0.22);border:2px solid #f59e0b;color:#fef3c7;
  font-size:20px;font-weight:900;letter-spacing:0.05em;padding:7px 16px;border-radius:12px;
}
.headline{
  font-size:80px;font-weight:900;line-height:0.98;letter-spacing:-0.03em;
  text-shadow:0 12px 34px rgba(0,0,0,0.8);
}
.headline .hl{
  background:linear-gradient(92deg,#38bdf8 0%,#fde68a 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.sub{font-size:26px;font-weight:700;color:#cbd5e1;line-height:1.28}
.pills{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
.pill{
  background:rgba(15,23,42,0.92);border:1.5px solid rgba(56,189,248,0.55);
  color:#e0f2fe;font-size:18px;font-weight:800;padding:8px 15px;border-radius:12px;
}
.pill.gold{border-color:rgba(245,158,11,0.65);color:#fef3c7}
.collage{position:absolute;right:-24px;top:34px;width:640px;height:652px;z-index:2}
.shot{
  position:absolute;border-radius:18px;overflow:hidden;
  border:2.5px solid rgba(56,189,248,0.68);box-shadow:0 26px 60px rgba(0,0,0,0.85);
}
.shot img{display:block;width:100%;height:100%;object-fit:cover}
.s1{width:540px;height:282px;right:40px;top:18px;transform:rotate(-2.4deg);z-index:2;border-color:rgba(56,189,248,0.75)}
.s2{width:556px;height:290px;right:70px;top:214px;transform:rotate(1.8deg);z-index:3;border-color:rgba(245,158,11,0.82)}
.s3{width:500px;height:262px;right:26px;top:418px;transform:rotate(-1.5deg);z-index:4;border-color:rgba(129,140,248,0.78)}
</style></head><body><div class="wrap">
  <div class="left">
    <div class="badges">
      <div class="b-ver">🍎 macOS EXCLUSIVE</div>
      <div class="b-rus">🎙️ AI RUSSELL</div>
    </div>
    <div class="headline">KINDLE<br><span class="hl">OPEN-BOOK</span><br>TO .MP4</div>
    <div class="sub">Codecaine File Manager · 100% Local on Apple Silicon</div>
    <div class="pills">
      <div class="pill">📖 2-Column Vision OCR</div>
      <div class="pill gold">⏭️ Skip Front &amp; Back Fluff</div>
      <div class="pill">🔊 Book View Reader</div>
      <div class="pill gold">🎬 Synced .MP4 + .M4B</div>
    </div>
  </div>
  <div class="collage">
    ${img1 ? `<div class="shot s1"><img src="${img1}"></div>` : ""}
    ${img2 ? `<div class="shot s2"><img src="${img2}"></div>` : ""}
    ${img3 ? `<div class="shot s3"><img src="${img3}"></div>` : ""}
  </div>
</div></body></html>`;

  const htmlPath = join(BUILD_DIR, "thumbnail.html");
  writeFileSync(htmlPath, html);
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.goto(`file://${htmlPath}`, null);
  await browser.eval(`(() => {
    document.querySelectorAll('div, svg').forEach((el) => {
      if (el instanceof HTMLElement && el.style.zIndex === '2147483647') el.remove();
    });
  })()`);
  const shot = await browser.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(OUTPUT_THUMB, Buffer.from(shot.data, "base64"));
}

// ---------------------------------------------------------------------------
// 8. YouTube Notes Generator (Zero PII, Exact Rendered MM:SS Chapters)
// ---------------------------------------------------------------------------
function buildNotesMarkdown(
  finalSec: number,
  sizeMb: string,
  chapterMarks: Map<string, number>,
  storyboard: Storyboard,
): string {
  const padTs = (sec: number) => {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };

  const chaptersBlock = storyboard.scenes
    .map((sc) => `${padTs(chapterMarks.get(sc.chapter) ?? 0)} ${sc.chapter}`)
    .join("\n");

  return `# Codecaine File Manager — Kindle Open-Book Reader for macOS · YouTube Upload Notes

## Rendered Master Deliverables

- **Master 1080p MP4**: \`youtube_production/codecaine_file_manager_kindle_macos_demo_1080p.mp4\`
  - **Resolution & FPS**: 1920×1080 (16:9), 30 fps
  - **Video Codec**: H.264 High Profile, \`yuv420p\`, CRF 13, \`+faststart\`
  - **Audio Track**: 320 kbps AAC-LC, 48 kHz stereo (AI Russell mastered + ducked Anthem bed)
  - **Duration & Size**: ${fmtTime(finalSec)} (${sizeMb} MB)
- **YouTube Thumbnail (1280×720)**: \`youtube_production/codecaine_file_manager_kindle_macos_demo_thumbnail.png\`
- **QA Verification Frames**: \`youtube_production/kindle_macos_demo/qa_frames/*.png\`
- **Storyboard Script**: \`youtube_production/kindle_macos_demo/storyboard.json\`

---

## High-CTR YouTube Title Ideas (Under 100 Characters)

1. \`Kindle Open-Book Reader for macOS: Read Word-by-Word & Export Synced Read-Along .MP4 (100% Local)\`
2. \`Turn Any Open Kindle Book into Synced Read-Along .MP4 Videos & .M4B Audiobooks on Apple Silicon\`
3. \`Codecaine File Manager for macOS: 2-Column Kindle Vision OCR, Book View & Local AI Narration\`

---

## YouTube Description (Copy & Paste)

\`\`\`text
Introducing the macOS-exclusive Kindle Open-Book Reader inside Codecaine File Manager! Turn any open Amazon Kindle or Kindle Cloud Reader book into word-by-word Book View reading, synced 1080p Read-Along .MP4 videos, chaptered .M4B audiobooks, mastered .MP3 audio, .SRT/.VTT subtitles, and clean Markdown — 100% locally on Apple Silicon with zero cloud uploads.

🍎 macOS EXCLUSIVE FEATURE:
• Uses native CoreGraphics (CGWindowListCopyWindowInfo), Apple Vision OCR (VNRecognizeTextRequest), and AppleScript across desktop Spaces — while keeping Linux & Windows builds completely clean and uncluttered.
• Full-Screen Space Detection: Finds open Kindle windows even on other Spaces (e.g. 1728×1084) while ignoring toolbar strips and File Manager itself.
• 2-Column Spread OCR & Header Book Title Extraction: Reads left column completely before right column and auto-fills Output Filename from the clean book title.
• Whole-Book Capture (Up to 5,000 Pages): Skip Cover/Copyright/TOC front fluff (Start at Intro or Chapter 1), recover cleanly with 3-step duplicate page-turn retry, and stop automatically at Acknowledgments / Index back matter.
• In-App Book View + Live Follow-Along Teleprompter: Read and listen word-by-word with local Ollama Phonon TTS (narrated here by AI Russell).
• Real Read-Along .MP4 Cinema Output: Native Cairo + Pango burned-in word highlighting alongside .SRT, .VTT, .MP3, .M4B, and .MD saved directly into your active folder.
• Automated CLI:
  bun run cli:tts kindle --all-pages --start-at intro --skip-fluff --voice Russell -f mp4

⬇️ FREE & OPEN SOURCE DOWNLOAD (MIT License):
• macOS Homebrew Cask: brew install --cask codecaine-file-manager
• GitHub Releases: https://github.com/codecaine-zz/bun_rad_studio/releases/latest
• Source Code: https://github.com/codecaine-zz/bun_rad_studio

⏱️ CHAPTERS (NARRATED BY AI RUSSELL)
${chaptersBlock}

🎙️ NARRATION CREDIT:
Narrated 100% locally and offline by AI Russell using Ollama Gradium Phonon TTS (\`ollama run phonon --voice Russell\`).

🎵 MUSIC ATTRIBUTION:
Music by Codecaine — https://github.com/codecaine-zz/bun_rad_studio (CC BY 4.0)

#macOS #AppleSilicon #Kindle #LocalAI #Ollama #PhononTTS #CodecaineFileManager #ReadAlongMP4 #Audiobook #VisionOCR #OpenSource #BunJS
\`\`\`

---

## YouTube Tags (Under 500 Characters)

\`\`\`text
kindle reader macos,kindle to mp4,kindle to audiobook,apple vision ocr,local ai tts,ollama phonon,ai russell,read along mp4,book view teleprompter,m4b audiobook creator,codecaine file manager,bun rad studio,apple silicon mlx,open source mac app,offline text to speech
\`\`\`

---

## Privacy & Verification Checklist

- Synthesized and recorded exclusively inside an isolated \`/tmp/fm_kindle_yt_demo\` workspace with \`SCREENSHOT_MODE=1\`.
- Uses 100% synthetic demo book *"${BOOK_TITLE}"* by *"${BOOK_AUTHOR}"*.
- Zero personal usernames, real Kindle books, local IP addresses, hostnames, or hardware serials appear in any video frame, audio segment, thumbnail, or note.
`;
}

// ---------------------------------------------------------------------------
// 9. Main Pipeline
// ---------------------------------------------------------------------------
async function main() {
  mkdirSync(AUDIO_DIR, { recursive: true });
  mkdirSync(QA_FRAMES_DIR, { recursive: true });
  mkdirSync(BUILD_DIR, { recursive: true });

  const storyboard = JSON.parse(
    readFileSync(STORYBOARD_PATH, "utf8"),
  ) as Storyboard;
  console.log(
    `🎬 Building ${storyboard.meta.project} (${storyboard.scenes.length} scenes, AI Russell)...`,
  );

  // Step 1: Synthesize 100% AI Russell narration WAVs for all scenes (cached in audio/)
  const narrated = storyboard.scenes.map((scene) => ({
    scene,
    ...synthesizeSceneAudio(scene),
  }));
  const totalNarrationSec = narrated.reduce((a, b) => a + b.seconds, 0);
  console.log(
    `⏱️  Total AI Russell narration: ${totalNarrationSec.toFixed(2)}s (${fmtTime(totalNarrationSec)})`,
  );

  // Step 2: Render the real Native Cairo + Pango Read-Along .MP4 excerpt for Scene 6 Part A
  const s6 = narrated.find((n) => n.scene.id === "06_read_along_mp4")!;
  const excerptText = s6.scene.excerptText || s6.scene.narration;
  const excerptAssets = await buildRealReadAlongExcerpt(
    excerptText,
    s6.partARawWav!,
    s6.partAMasterWav!,
    s6.partASeconds!,
  );

  if (AUDIO_ONLY) {
    console.log(
      `\n✅ --audio-only finished: AI Russell WAVs + real Read-Along .MP4 excerpt ready in ${PROJ}`,
    );
    return;
  }

  // Step 3: Seed strictly isolated /tmp/fm_kindle_yt_demo workspace
  seedIsolatedWorkspace({
    excerptMp4: excerptAssets.mp4Path,
    excerptSrt: excerptAssets.srtText,
    excerptVtt: excerptAssets.vttText,
    partAMasterWav: s6.partAMasterWav!,
  });

  // Compute real word timings for Scene 5 Book View live follow-along WAV
  const listenText =
    "Chapter One: Your Files Belong on Your Machine. Local-first software keeps your reading library fast, private, and durable offline, turning open Kindle pages into synchronized audio and cinema-grade Read-Along video right on Apple Silicon.";
  const s5RawBuf = Buffer.from(
    await Bun.file(s6.partARawWav!).arrayBuffer(),
  );
  const s5Parsed = parseWavPcm(s5RawBuf);
  const s5RawDurMs = Math.round(
    (s5Parsed.pcmData.length /
      (s5Parsed.sampleRate *
        s5Parsed.numChannels *
        (s5Parsed.bitsPerSample >> 3))) *
      1000,
  );
  const listenTimeline = computeReadAlongTimeline([
    {
      index: 0,
      paragraphIndex: 0,
      text: listenText,
      startMs: 180,
      endMs: 180 + s5RawDurMs,
      durationMs: s5RawDurMs,
      pcmData: s5Parsed.pcmData,
      sampleRate: s5Parsed.sampleRate,
      words: computeWordTimingsForText(listenText, s5RawDurMs, 180, 0, {
        pcmData: s5Parsed.pcmData,
        sampleRate: s5Parsed.sampleRate,
        speed: 1,
      }),
    },
  ]);

  const wrapperScript = buildSyntheticFetchWrapperScript({
    listenPreviewWavPath: LISTEN_PREVIEW_WAV,
    listenPreviewDurSec: s6.partASeconds!,
    listenWords: listenTimeline.words,
    listenCues: listenTimeline.cues,
    booksDir: BOOKS_DIR,
    excerptMp4Dest: join(BOOKS_DIR, `${BOOK_TITLE}.mp4`),
  });

  // Step 4: Launch isolated File Manager server with SCREENSHOT_MODE=1
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
      BOOKS_DIR,
    ],
    {
      cwd: "/tmp",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        PATH: process.env.PATH ?? "",
        HOME,
        USER: "developer",
        LOGNAME: "developer",
        SCREENSHOT_MODE: "1",
        GRAVEYARD: GRAVE,
        SHELL: "/bin/zsh",
        ZDOTDIR: ZDOT,
        OLLAMA_MODELS:
          process.env.OLLAMA_MODELS ||
          `${process.env.HOME || "/Users/codecaine"}/.ollama/models`,
      },
    },
  );

  let serverUp = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${FM_PORT}/`)).ok) {
        serverUp = true;
        break;
      }
    } catch {}
    await sleep(200);
  }
  if (!serverUp) throw new Error("File Manager server failed to start");
  const baseUrl = `http://127.0.0.1:${FM_PORT}`;

  // Step 5: Record all live UI scenes (1920x972)
  const recBrowser = await Cdp.launch(
    CDP_REC_PORT,
    join(BUILD_DIR, "chrome-rec"),
    VIEW_W,
    VIEW_H,
  );
  await recBrowser.send("Page.addScriptToEvaluateOnNewDocument", {
    source: wrapperScript,
  });

  const rawClips = new Map<string, string>();

  try {
    for (const item of narrated) {
      if (item.scene.kind === "live_ui") {
        const clipPath = join(BUILD_DIR, `${item.scene.id}_raw.mp4`);
        console.log(
          `🎥 Recording live UI: ${item.scene.id} (${item.seconds.toFixed(1)}s)...`,
        );
        await prepLiveScene(recBrowser, item.scene.id, baseUrl);
        await recBrowser.startRecording();
        await recordLiveScene(recBrowser, item.scene, item.seconds, baseUrl);
        await sleep(200);
        await recBrowser.stopRecording(
          clipPath,
          join(BUILD_DIR, `frames_${item.scene.id}`),
          item.seconds,
        );
        rawClips.set(item.scene.id, clipPath);
      } else if (item.scene.kind === "hybrid_mp4_folder") {
        // Materialize all 6 real outputs into /private/tmp/fm_kindle_yt_demo/home/Books before Scene 6 Part B!
        materializeBooksFolderOutputs({
          excerptMp4: excerptAssets.mp4Path,
          excerptSrt: excerptAssets.srtText,
          excerptVtt: excerptAssets.vttText,
          partAMasterWav: s6.partAMasterWav!,
        });
        const partBSec = item.partBSeconds!;
        const partBClip = join(BUILD_DIR, `${item.scene.id}_partB_raw.mp4`);
        console.log(
          `🎥 Recording live Books folder UI: ${item.scene.id} Part B (${partBSec.toFixed(1)}s)...`,
        );
        await prepLiveScene(recBrowser, item.scene.id, baseUrl);
        await recBrowser.startRecording();
        await recordLiveScene(recBrowser, item.scene, partBSec, baseUrl);
        await sleep(200);
        await recBrowser.stopRecording(
          partBClip,
          join(BUILD_DIR, `frames_${item.scene.id}_partB`),
          partBSec,
        );
        rawClips.set(`${item.scene.id}_partB`, partBClip);
      }
    }
  } finally {
    recBrowser.close();
    try {
      fm.kill(9);
    } catch {}
  }

  // Step 6: Render studio cards + bottom HUD overlays & assemble per-scene segments
  const gfxBrowser = await Cdp.launch(
    CDP_GFX_PORT,
    join(BUILD_DIR, "chrome-gfx"),
    1920,
    1080,
  );
  const segmentPaths: string[] = [];
  const chapterMarks = new Map<string, number>();
  let cursorSec = 0;

  try {
    for (let i = 0; i < narrated.length; i++) {
      const item = narrated[i]!;
      const { scene, masterWav, seconds } = item;
      if (!chapterMarks.has(scene.chapter)) {
        chapterMarks.set(scene.chapter, cursorSec);
      }

      const segPath = join(BUILD_DIR, `seg_${scene.id}.mp4`);

      if (scene.kind === "live_ui") {
        const rawClip = rawClips.get(scene.id)!;
        const clipDur = duration(rawClip);
        const ptsScale = (seconds / clipDur).toFixed(5);
        const hudPng = join(BUILD_DIR, `hud_${scene.id}.png`);
        await renderHtmlToPng(
          gfxBrowser,
          buildBottomHudHtml(scene, i, narrated.length),
          hudPng,
          true,
        );
        run([
          FFMPEG,
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          rawClip,
          "-i",
          masterWav,
          "-loop",
          "1",
          "-framerate",
          "30",
          "-i",
          hudPng,
          "-filter_complex",
          `[0:v]setpts=(PTS-STARTPTS)*${ptsScale},fps=30,pad=1920:1080:0:0:color=0x050811[b];[b][2:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
          "-map",
          "[v]",
          "-map",
          "1:a",
          "-t",
          seconds.toFixed(3),
          "-c:v",
          "libx264",
          "-profile:v",
          "high",
          "-preset",
          "medium",
          "-crf",
          "13",
          "-r",
          "30",
          "-c:a",
          "aac",
          "-b:a",
          "320k",
          "-ar",
          "48000",
          "-ac",
          "2",
          segPath,
        ]);
      } else if (scene.kind === "hybrid_mp4_folder") {
        const partASec = item.partASeconds!;
        const partBSec = item.partBSeconds!;
        const partBClip = rawClips.get(`${scene.id}_partB`)!;
        const partBClipDur = duration(partBClip);
        const partBPts = (partBSec / partBClipDur).toFixed(5);

        const hudA = join(BUILD_DIR, `hud_${scene.id}_A.png`);
        await renderHtmlToPng(
          gfxBrowser,
          buildBottomHudHtml(
            {
              ...scene,
              badge: "CHAPTER 06 · REAL READ-ALONG .MP4 OUTPUT",
              title: `Real Cairo + Pango Read-Along .MP4 — "${BOOK_TITLE}"`,
              subtitle:
                "Rendered locally with renderBurnedInReadAlongVideoParallel & AI Russell",
            },
            i,
            narrated.length,
          ),
          hudA,
          true,
        );

        const hudB = join(BUILD_DIR, `hud_${scene.id}_B.png`);
        await renderHtmlToPng(
          gfxBrowser,
          buildBottomHudHtml(scene, i, narrated.length),
          hudB,
          true,
        );

        // Scale the 1920x1080 Read-Along .MP4 into 1728x972 centered over #060913 so top pill & progress bar stay 100% visible above the 108px HUD
        const partAScaled = join(BUILD_DIR, `seg_${scene.id}_A.mp4`);
        run([
          FFMPEG,
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          excerptAssets.mp4Path,
          "-loop",
          "1",
          "-framerate",
          "30",
          "-i",
          hudA,
          "-filter_complex",
          `[0:v]scale=-2:${VIEW_H}:flags=lanczos,pad=${VIEW_W}:${VIEW_H}:(ow-iw)/2:0:color=0x060913,fps=30,pad=1920:1080:0:0:color=0x050811[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
          "-map",
          "[v]",
          "-t",
          partASec.toFixed(3),
          "-c:v",
          "libx264",
          "-profile:v",
          "high",
          "-preset",
          "medium",
          "-crf",
          "13",
          "-r",
          "30",
          "-an",
          partAScaled,
        ]);

        // Extract QA frame from the real Read-Along .MP4 cinema output at 64% duration (active cyan pill on "pages")
        run([
          FFMPEG,
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          (partASec * 0.64).toFixed(2),
          "-i",
          partAScaled,
          "-frames:v",
          "1",
          join(QA_FRAMES_DIR, "06_read_along_mp4.png"),
        ]);
        run([
          FFMPEG,
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          (partASec * 0.64).toFixed(2),
          "-i",
          excerptAssets.mp4Path,
          "-frames:v",
          "1",
          join(BUILD_DIR, "read_along_thumb_raw.png"),
        ]);

        const partBScaled = join(BUILD_DIR, `seg_${scene.id}_B.mp4`);
        run([
          FFMPEG,
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          partBClip,
          "-loop",
          "1",
          "-framerate",
          "30",
          "-i",
          hudB,
          "-filter_complex",
          `[0:v]setpts=(PTS-STARTPTS)*${partBPts},fps=30,pad=1920:1080:0:0:color=0x050811[b];[b][1:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
          "-map",
          "[v]",
          "-t",
          partBSec.toFixed(3),
          "-c:v",
          "libx264",
          "-profile:v",
          "high",
          "-preset",
          "medium",
          "-crf",
          "13",
          "-r",
          "30",
          "-an",
          partBScaled,
        ]);

        const hybridList = join(BUILD_DIR, `hybrid_${scene.id}.txt`);
        writeFileSync(
          hybridList,
          `file '${partAScaled}'\nfile '${partBScaled}'\n`,
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
          hybridList,
          "-i",
          masterWav,
          "-map",
          "0:v",
          "-map",
          "1:a",
          "-t",
          seconds.toFixed(3),
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "320k",
          "-ar",
          "48000",
          "-ac",
          "2",
          segPath,
        ]);
      } else {
        const cardPng = join(BUILD_DIR, `card_${scene.id}.png`);
        const html =
          scene.kind === "title_card"
            ? buildTitleCardHtml(scene)
            : scene.kind === "outro_card"
              ? buildOutroCardHtml(scene)
              : buildFeatureCardHtml(scene);
        await renderHtmlToPng(gfxBrowser, html, cardPng, false);
        copyFileSync(cardPng, join(QA_FRAMES_DIR, `${scene.id}.png`));
        const fadeOutStart = Math.max(0.2, seconds - 0.35).toFixed(2);
        run([
          FFMPEG,
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-loop",
          "1",
          "-framerate",
          "30",
          "-i",
          cardPng,
          "-i",
          masterWav,
          "-vf",
          `fps=30,fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOutStart}:d=0.35,format=yuv420p`,
          "-map",
          "0:v",
          "-map",
          "1:a",
          "-t",
          seconds.toFixed(3),
          "-c:v",
          "libx264",
          "-profile:v",
          "high",
          "-preset",
          "medium",
          "-crf",
          "13",
          "-r",
          "30",
          "-c:a",
          "aac",
          "-b:a",
          "320k",
          "-ar",
          "48000",
          "-ac",
          "2",
          segPath,
        ]);
      }

      segmentPaths.push(segPath);
      cursorSec += duration(segPath);
    }

    // Step 7: Generate 1280x720 High-CTR Thumbnail from real masked UI + Read-Along frames
    console.log(`🖼️  Generating 1280x720 YouTube thumbnail...`);
    await generateThumbnail(gfxBrowser);
  } finally {
    gfxBrowser.close();
  }

  // Step 8: Concatenate segments & mix subtle ducked Anthem music bed
  const concatList = join(BUILD_DIR, "concat_all.txt");
  writeFileSync(
    concatList,
    segmentPaths.map((p) => `file '${p}'`).join("\n") + "\n",
  );
  const voiceOnlyMp4 = join(BUILD_DIR, "voice_only.mp4");
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
    concatList,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "13",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "320k",
    "-ar",
    "48000",
    "-ac",
    "2",
    voiceOnlyMp4,
  ]);

  const totalDur = duration(voiceOnlyMp4);
  const fadeOutMusicAt = Math.max(1, totalDur - 3.0).toFixed(2);

  if (existsSync(ANTHEM_MP3)) {
    console.log(`🎵 Mixing gentle ducked background bed (${ANTHEM_MP3})...`);
    run([
      FFMPEG,
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      voiceOnlyMp4,
      "-stream_loop",
      "-1",
      "-i",
      ANTHEM_MP3,
      "-filter_complex",
      `[1:a]highpass=f=90,lowpass=f=2200,volume=0.06,afade=t=in:st=0:d=2.0,afade=t=out:st=${fadeOutMusicAt}:d=3.0,atrim=0:${totalDur.toFixed(3)},asetpts=PTS-STARTPTS[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.84[a]`,
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "320k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      OUTPUT_MP4,
    ]);
  } else {
    copyFileSync(voiceOnlyMp4, OUTPUT_MP4);
  }

  // Step 9: Write KINDLE_MACOS_DEMO_YOUTUBE_NOTES.md with exact rendered timestamps & specs
  const finalSec = duration(OUTPUT_MP4);
  const sizeMb = (Bun.file(OUTPUT_MP4).size / 1048576).toFixed(1);
  writeFileSync(
    NOTES_PATH,
    buildNotesMarkdown(finalSec, sizeMb, chapterMarks, storyboard),
  );

  // Step 10: Cleanup temporary isolated workspace & temp Chrome profiles
  rmSync(join(BUILD_DIR, "chrome-rec"), { recursive: true, force: true });
  rmSync(join(BUILD_DIR, "chrome-gfx"), { recursive: true, force: true });
  rmSync(WORKSPACE_ROOT, { recursive: true, force: true });

  console.log(
    `\n✅ Master MP4:  ${OUTPUT_MP4} (${fmtTime(finalSec)}, ${sizeMb} MB)`,
  );
  console.log(`✅ Thumbnail:   ${OUTPUT_THUMB}`);
  console.log(`✅ QA Frames:   ${QA_FRAMES_DIR}`);
  console.log(`✅ Notes:       ${NOTES_PATH}`);
}

await main();
process.exit(0);
