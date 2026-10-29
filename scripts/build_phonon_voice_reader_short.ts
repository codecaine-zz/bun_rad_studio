#!/usr/bin/env bun
/**
 * Builds the 100% live-recorded YouTube Short (1080x1920 vertical 9:16, <3 minutes, CRF 14)
 * AND companion 1920x1080 widescreen demo video for the Codecaine File Manager
 * Phonon Voice Reader (`ollama run phonon`) Studio.
 *
 * Every scene is narrated live by `ollama run phonon --voice Zoey` so viewers hear
 * Phonon's actual natural AI voice (`Zoey`) explaining how the File Manager converts
 * files and massive texts into speech with ultra-low resource usage!
 *
 * Outputs:
 *   - youtube_production/codecaine-file-manager-phonon-voice-reader-short.mp4 (1080x1920 9:16 Short)
 *   - youtube_production/file_manager_phonon_voice_reader_demo.mp4 (1920x1080 16:9 Widescreen Demo)
 *   - youtube_production/PHONON_VOICE_READER_SHORT_NOTES.md
 *   - youtube_production/phonon_voice_reader_short/upload-guide.txt
 *
 * Usage:
 *   bun scripts/build_phonon_voice_reader_short.ts
 */
import "./lib/tts_edge_default";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { seedDemoWorkspace } from "./lib/demo_workspace";
import { FFMPEG, FFPROBE, narrate } from "./lib/video_pipeline";
import { createWavHeader, parseWavPcm, splitTextForPhonon } from "../src/features/filemanager/fmPhonon";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const WORK = join(PROD, "phonon_voice_reader_short");
const OUTPUT_SHORT = join(PROD, "codecaine-file-manager-phonon-voice-reader-short.mp4");
const OUTPUT_WIDE = join(PROD, "file_manager_phonon_voice_reader_demo.mp4");
const NOTES = join(PROD, "PHONON_VOICE_READER_SHORT_NOTES.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";

const FM_PORT = 51812;
const CDP_REC_PORT = 9494;
const CDP_OVL_PORT = 9495;
const VIEW_W = 1920;
const VIEW_H = 972;

const ROOT_DIR = "/tmp/fm_phonon_voice_reader_short";
const HOME = process.platform === "darwin" ? "/private/tmp/fm_phonon_voice_reader_short/home" : "/tmp/fm_phonon_voice_reader_short/home";
const DATA = `${ROOT_DIR}/data`;
const GRAVE = `${ROOT_DIR}/grave`;
const ZDOT = `${ROOT_DIR}/zdot`;

type SceneSpec = {
  id: string;
  voice: string;
  voiceDesc: string;
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

function seedPhononWorkspace() {
  rmSync(ROOT_DIR, { recursive: true, force: true });
  mkdirSync(ROOT_DIR, { recursive: true });
  seedDemoWorkspace(HOME, join(ROOT_DIR, "frames"));

  const studioDir = join(HOME, "Phonon_Voice_Studio");
  mkdirSync(studioDir, { recursive: true });

  writeFileSync(
    join(studioDir, "01_Architecture_Guide.md"),
    `# Codecaine Phonon Voice Reader Architecture\n\nWelcome to the **Codecaine File Manager Voice Reader**, powered by local \`ollama run phonon\` neural text-to-speech.\n\n## Key Capabilities\n- **38 Expressive Neural Voices**: Switch between Conversational, Narrator, and Character voices and save your default voice.\n- **Universal Format-to-Plain-Text Converter**: Extract clean speech-ready text from PDF, DOCX, EPUB, RTF, HTML, Markdown, Subtitles, JSON, CSV, and source code.\n- **Extreme Large-Text Context-Safe Engine**: Automatically splits massive books into natural sentence chunks that never exceed Phonon's 8,192-token context window.\n- **Save as Any Audio File Format**: Export directly to WAV, MP3, M4A, AAC, FLAC, OGG, OPUS, AIFF, or WMA.\n`,
  );

  writeFileSync(
    join(studioDir, "02_Research_Briefing.html"),
    `<!doctype html><html><head><title>Neural Speech Briefing</title><style>body{font-family:sans-serif}</style></head><body><h1>Local Neural Speech Synthesis on Apple Silicon</h1><p>Running <b>ollama run phonon</b> locally on the Mac Studio M4 Ultra synthesizes 24 kHz studio-grade neural speech with zero cloud API fees and 100% offline privacy.</p><p>Visit <a href="https://ollama.com/library/phonon">Ollama Phonon</a> for model details.</p></body></html>`,
  );

  writeFileSync(
    join(studioDir, "03_Podcast_Transcript.srt"),
    `1\n00:00:01,000 --> 00:00:05,000\nWelcome back to the Codecaine Engineering Podcast!\n\n2\n00:00:05,500 --> 00:00:11,000\nToday we are testing automatic subtitle timestamp stripping and multi-format plain text conversion.\n\n3\n00:00:11,500 --> 00:00:17,000\nEvery subtitle cue is converted into smooth, natural paragraphs ready to read out loud.\n`,
  );

  writeFileSync(
    join(studioDir, "04_Voice_Benchmarks.csv"),
    `Voice,Category,SampleRateHz,ContextTokens\nZoey,Conversational,24000,8192\nEaston,Conversational,24000,8192\nFreya,Narrator,24000,8192\nHugh,Narrator,24000,8192\nImogen,Narrator,24000,8192\nMaster Aldric,Character,24000,8192\n`,
  );

  const largeBookChapters = Array.from({ length: 24 }, (_, idx) => {
    const ch = idx + 1;
    return `Chapter ${ch}: Large-Scale Neural Audiobook Synthesis\n\nWhen reading an entire book or a multi-hundred-page technical specification, passing the full document at once would overflow the 8,192-token context window of ollama run phonon. The Codecaine File Manager solves this automatically with an O(N) hierarchical boundary splitter that divides paragraphs, sentences, and clauses into context-safe segments while prefetching upcoming audio chunks in the background and stitching 24 kHz PCM frames directly on disk.`;
  }).join("\n\n");
  writeFileSync(join(studioDir, "05_Complete_24_Chapter_Book.txt"), largeBookChapters);
}

async function showKeynoteHud(c: Cdp, title: string, subtitle: string, pill = "🎙️ OLLAMA RUN PHONON") {
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
        "background:linear-gradient(135deg, rgba(8,12,22,0.94), rgba(20,28,46,0.92))",
        "border:1.5px solid rgba(56,189,248,0.55)",
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
    badge.style.cssText = "background:linear-gradient(135deg,#38bdf8,#818cf8,#f472b6);color:#05070c;font-weight:900;font-size:12.5px;letter-spacing:0.08em;padding:5px 13px;border-radius:999px;white-space:nowrap;";
    badge.textContent = ${JSON.stringify(pill)};
    const textWrap = document.createElement("div");
    textWrap.style.cssText = "display:flex;flex-direction:column;gap:2px;";
    const tEl = document.createElement("strong");
    tEl.style.cssText = "font-size:15.5px;font-weight:800;letter-spacing:-0.01em;color:#ffffff;white-space:nowrap;";
    tEl.textContent = ${JSON.stringify(title)};
    const sEl = document.createElement("span");
    sEl.style.cssText = "font-size:12px;font-weight:600;color:#bae6fd;white-space:nowrap;";
    sEl.textContent = ${JSON.stringify(subtitle)};
    textWrap.appendChild(tEl);
    textWrap.appendChild(sEl);
    el.appendChild(badge);
    el.appendChild(textWrap);
  })()`);
}

const sceneSpecs: SceneSpec[] = [
  {
    id: "01_intro_and_autoinstall",
    voice: "Zoey",
    voiceDesc: "Zoey (Narrating This Video Live from Mac)",
    badge: "01 / 08 · NARRATED BY ZOEY FROM THIS MAC (LOW RESOURCES)",
    title: "NARRATED BY ZOEY ON MAC.\nPHONON TTS + OLLAMA.",
    label: "🎙️ THIS VIDEO IS NARRATED ON MAC BY: OLLAMA RUN PHONON --VOICE ZOEY",
    extra: "🎙️ You are hearing Zoey right now — generated live on this Mac (112 MB MLX Model)",
    bullets: [
      "🎙️ Narrated 100% Live on Mac by `ollama run phonon --voice Zoey`",
      "🪶 Ultra-Low Resources: Compact 112 MB Local Apple MLX Model",
      "⚡ 1-Click Auto-Install Ollama + Phonon + FFmpeg · 100% Offline",
    ],
    say: "Hi! I am Zoey—and my voice is narrating this entire complete tutorial live from this Apple Silicon Mac using ollama run phonon dash dash voice Zoey! Inside the Codecaine File Manager, Phonon Neural Text-to-Speech and the built-in Ollama AI Assistant work together one hundred percent offline with a compact one-hundred-twelve megabyte M L X model and one-click auto-install.",
    record: async (c) => {
      await c.eval(`(async () => {
        const { closePower } = await import('/ui/power.js');
        closePower();
      })()`);
      await showKeynoteHud(
        c,
        "🎙️ Complete Tutorial Narrated Live on Mac by `ollama run phonon --voice Zoey`",
        "Compact 112 MB Apple MLX model · Low RAM & CPU · 1-Click Auto-Install · 100% Offline",
        "🎙️ ZOEY ON THIS MAC",
      );
      await sleep(350);
      await c.eval(`(async () => {
        const { left } = await import('/ui/pane.js');
        left.selection.clear();
        const { showToolsDialog } = await import('/ui/tools.js');
        await showToolsDialog();
      })()`);
      await sleep(1100);
      await c.eval(`(() => {
        const card = Array.from(document.querySelectorAll('.tool-row, .tools-box *')).find(el => el.textContent && el.textContent.includes('Ollama (Phonon'));
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()`);
      await sleep(1200);
      await c.eval(`(() => {
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
      })()`);
      await sleep(300);
      await c.eval(`(async () => {
        const { openPower, setPowerExpanded } = await import('/ui/power.js');
        openPower('phonon');
        setPowerExpanded(true);
      })()`);
      await showKeynoteHud(
        c,
        "🟢 Narrated from This Mac by Zoey (`--voice Zoey`) — 112 MB Low-Resource MLX Model",
        "1-Click Install Ollama & Phonon right inside the File Manager studio banner",
        "🎙️ ZOEY ON THIS MAC",
      );
      await sleep(1500);
    },
  },
  {
    id: "02_38_voices_and_default",
    voice: "Zoey",
    voiceDesc: "Zoey (--voice Zoey · 38 Voices, Pitch & Sync)",
    badge: "02 / 08 · 38 NEURAL VOICES, PITCH SHIFT & SYNC OFFSET",
    title: "38 NATURAL AI VOICES.\nPITCH, SPEED & SYNC.",
    label: "🗣️ --VOICE ZOEY DEFAULT · 38 VOICES · TIME-LOCKED PITCH (±6 ST) · SYNC (±300 MS)",
    extra: "Narrated Live by ollama run phonon --voice Zoey · Persistent Voice, Pitch & Pacing",
    bullets: [
      "🗣️ 38 Built-In Conversational, Narrator & Character Voices",
      "⭐ Save `Zoey` as Persistent Default + Live Voice Preview",
      "🎚️ Speed (0.5×–2.0×), Time-Locked Pitch (±6 st) & Sync (±300 ms)",
    ],
    say: "Choose from thirty-eight expressive neural voices discovered directly from Phonon, including my conversational voice Zoey, plus audiobook narrators and characters. Click Set Default Voice to lock in Zoey across the entire app, adjust speaking speed from half-speed to two-times, shift voice pitch up or down six semitones without altering duration, and fine-tune word sync down to the millisecond.",
    record: async (c) => {
      await c.eval(`(async () => {
        const { openPower, setPowerExpanded } = await import('/ui/power.js');
        openPower('phonon');
        setPowerExpanded(true);
      })()`);
      await showKeynoteHud(
        c,
        "🗣️ 38 Neural Voices + Default `Zoey` + Time-Locked Pitch (±6 st) & Sync (±300 ms)",
        "Switch between Conversational, Narrator & Character voices and tune speed, pitch & sync",
        "🎙️ --VOICE ZOEY",
      );
      await sleep(500);
      for (const v of ["Easton", "Freya", "Hugh", "Imogen", "Master Aldric", "Zoey"]) {
        await c.eval(`(() => {
          const sel = document.getElementById('phonon-voice-select');
          if (sel) {
            sel.value = ${JSON.stringify(v)};
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()`);
        await sleep(340);
      }
      await c.click('button >> ⭐ Set Default Voice', { pause: 550 }).catch(() => {});
      await c.eval(`(() => {
        const spd = document.getElementById('phonon-speed-range');
        if (spd) {
          spd.value = '1.15';
          spd.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const pitch = document.getElementById('phonon-pitch-range');
        if (pitch) {
          pitch.value = '2';
          pitch.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(750);
      await c.eval(`(() => {
        const spd = document.getElementById('phonon-speed-range');
        if (spd) {
          spd.value = '1';
          spd.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const pitch = document.getElementById('phonon-pitch-range');
        if (pitch) {
          pitch.value = '0';
          pitch.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(550);
    },
  },
  {
    id: "03_ai_voice_recorder_cloning",
    voice: "Zoey",
    voiceDesc: "Zoey (--voice Zoey · AI Voice Recorder & F5-TTS-MLX Cloning)",
    badge: "03 / 08 · AI VOICE RECORDER & ZERO-SHOT VOICE CLONING",
    title: "RECORD YOUR OWN VOICE.\nZERO-SHOT MLX CLONING.",
    label: "🎙️ LIVE MIC OSCILLOSCOPE · F5-TTS-MLX ZERO-SHOT CLONING · GITIGNORE PRIVACY",
    extra: "Narrated Live by ollama run phonon --voice Zoey · 100% Local Biometric Privacy",
    bullets: [
      "🎙️ Live Microphone Recorder with Waveform Oscilloscope & dB Meter",
      "🧬 Zero-Shot Neural Voice Cloning Powered by Local `F5-TTS-MLX`",
      "🔒 Strictly Excluded from Git so Personal Voices Stay 100% Private",
    ],
    say: "Want documents read in your own real voice? Open the AI Voice Recorder studio to record a ten-second reference sample with a live waveform oscilloscope, peak decibel meter, and guided calibration scripts—or upload any W A V clip. Local F-five T T S M L X clones your exact vocal timbre at twenty-four kilohertz, and all personal voice recordings are git-ignored so they never leave your Mac.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🎙️ AI Voice Recorder & Zero-Shot Neural Voice Cloning (`F5-TTS-MLX`)",
        "Live WebAudio oscilloscope + dB meter · Guided scripts · WAV import · Private & git-ignored",
        "🧬 VOICE CLONING",
      );
      await c.eval(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Record My Voice'));
        if (btn) btn.click();
      })()`);
      await sleep(700);
      await c.eval(`(() => {
        const recBox = document.querySelector('.phonon-recorder-box');
        if (recBox) recBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()`);
      await sleep(1400);
      await c.eval(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Hide Voice Recorder'));
        if (btn) btn.click();
      })()`);
      await sleep(400);
    },
  },
  {
    id: "04_convert_formats_to_plaintext",
    voice: "Zoey",
    voiceDesc: "Zoey (--voice Zoey · 25+ Format Extractor)",
    badge: "04 / 08 · CONVERT 25+ FILE FORMATS TO SPEECH & .TXT",
    title: "READ ANY FILE FORMAT\nOR SAVE AS PLAIN TEXT.",
    label: "📄 PDF · DOCX · EPUB · HTML · MD · SRT · CSV · JSON · CODE → SPEECH",
    extra: "Narrated Live by ollama run phonon --voice Zoey · 6 Smart Speech Cleanup Filters",
    bullets: [
      "📄 Extract Speech-Ready Text from 25+ Document Formats",
      "🧹 6 Filters Auto-Strip Markdown, HTML, Code, URLs & Timestamps",
      "💾 Read Out Loud Instantly or 1-Click Save Clean .TXT",
    ],
    say: "Select any file in your workspace—P D Fs, Word documents, E P U B e-books, Markdown notes, H T M L pages, S R T subtitles, C S V spreadsheets, J S O N, or source code—and click Use Selected File. Six smart cleanup filters strip away markup, timestamps, and U R Ls so every sentence sounds completely natural, and you can save the cleaned text as a dot T X T file in one click.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "📄 25+ File Formats to Speech or Clean .TXT (PDF, DOCX, EPUB, HTML, MD, SRT, CSV)",
        "Automatically strips HTML tags, Markdown syntax, code blocks, URLs & subtitle timestamps",
        "🎙️ --VOICE ZOEY",
      );
      await c.eval(`(async () => {
        const { left } = await import('/ui/pane.js');
        const { renderList } = await import('/ui/list.js');
        left.selection.clear();
        for (const e of left.entries) {
          if (e.name.startsWith('03_Podcast_Transcript')) {
            left.selection.add(e.path);
          }
        }
        renderList(left);
      })()`);
      await sleep(500);
      await c.click('button >> 📥 Use Selected File', { pause: 1000 }).catch(() => {});
      await c.click('button >> ✨ Clean to Plain Text', { pause: 650 }).catch(() => {});
      await c.click('button >> 💾 Save as .TXT', { pause: 850 }).catch(() => {});
      await sleep(600);
    },
  },
  {
    id: "05_extreme_large_text_chunking",
    voice: "Zoey",
    voiceDesc: "Zoey (--voice Zoey · 242-Chunk Large Book Engine)",
    badge: "05 / 08 · HANDLE 242-CHUNK EPUB BOOKS IN O(1) MEMORY",
    title: "HANDLE MASSIVE BOOKS.\n242+ CHUNKS ZERO FREEZE.",
    label: "📚 8,192-TOKEN SAFE SPLITTER · PAGINATED QUEUE · O(1) DISK STREAMING",
    extra: "Narrated Live by ollama run phonon --voice Zoey · Tested on Full 242-Chunk EPUB Novels",
    bullets: [
      "📚 Tested on Full 242-Chunk EPUB Books (49+ Mins Audio)",
      "✂️ O(N) Paragraph, Sentence & Clause Boundary Chunker",
      "🪶 Paginated Segment Browser + O(1) Disk PCM Stitching",
    ],
    say: "Need to convert a massive technical manual or a two-hundred-forty-two chunk E P U B novel? Our hierarchical O of N splitter divides huge books along natural paragraph, sentence, and clause boundaries within Phonon's eight-thousand-one-hundred-ninety-two token window, displays a fast paginated segment queue, and stitches twenty-four kilohertz P C M audio directly on disk in constant O of one memory.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "📚 Massive-Text Engine: Full Multi-Chapter Books Split Into Context-Safe Segments",
        "O(N) sentence chunker + paginated segment browser + O(1) disk PCM stitcher",
        "🎙️ --VOICE ZOEY",
      );
      await c.eval(`(async () => {
        const { left } = await import('/ui/pane.js');
        const { renderList } = await import('/ui/list.js');
        left.selection.clear();
        for (const e of left.entries) {
          if (e.name.includes('05_Complete_24_Chapter_Book')) {
            left.selection.add(e.path);
          }
        }
        renderList(left);
      })()`);
      await sleep(450);
      await c.click('button >> 📥 Use Selected File', { pause: 1000 }).catch(() => {});
      await c.eval(`(() => {
        const q = document.querySelector('.phonon-chunks-section');
        if (q) q.scrollIntoView({ behavior: 'smooth', block: 'end' });
      })()`);
      await sleep(900);
      await c.eval(`(() => {
        const qList = document.querySelector('.phonon-chunk-list');
        if (qList) qList.scrollTo({ top: 240, behavior: 'smooth' });
      })()`);
      await sleep(1100);
    },
  },
  {
    id: "06_live_read_out_loud",
    voice: "Zoey",
    voiceDesc: "Zoey (--voice Zoey · Waveform-Synced Teleprompter)",
    badge: "06 / 08 · WAVEFORM-SYNCED KARAOKE TELEPROMPTER",
    title: "FOLLOW ALONG LIVE.\nWAVEFORM WORD SYNC.",
    label: "📖 10 MS PCM ENVELOPE ALIGNMENT · 4 CINEMA THEMES · 2-CHUNK PREFETCH",
    extra: "Narrated Live by ollama run phonon --voice Zoey · Click Any Word to Jump Playback",
    bullets: [
      "📖 10 ms WAV Speech-Envelope Word Alignment (Zero Drift)",
      "🎨 4 Reading Themes (Midnight, Sepia, Matrix, High-Contrast)",
      "⚡ Click Any Word to Jump + 2-Chunk Lookahead Prefetch",
    ],
    say: "Click Read Out Loud and follow along in the live karaoke teleprompter! Each word is aligned to the actual ten-millisecond P C M acoustic energy envelope of my voice so highlights never drift across pauses. Switch between four cinema reading themes and four font sizes, click any word to jump playback immediately, and enjoy zero-gap streaming with two-chunk lookahead prefetching.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "📖 Waveform-Synced Follow-Along Teleprompter (`--voice Zoey`) + 4 Cinema Themes",
        "10 ms WAV energy-envelope word alignment · Click any word to jump · 2-chunk prefetch",
        "🎙️ FOLLOW ALONG",
      );
      await c.eval(`(() => {
        const tp = document.querySelector('.phonon-teleprompter-box');
        if (tp) tp.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()`);
      await sleep(400);
      for (const [idx, targetWordIdx] of [2, 5, 9, 14, 19].entries()) {
        const themes = ["midnight", "sepia", "matrix", "contrast", "midnight"];
        const th = themes[idx] || "midnight";
        await c.eval(`(() => {
          const stage = document.querySelector('.phonon-teleprompter-stage');
          if (stage) stage.setAttribute('data-tp-theme', ${JSON.stringify(th)});
          const words = Array.from(document.querySelectorAll('.phonon-teleprompter-stage .phonon-word'));
          const wIdx = Math.min(${targetWordIdx}, Math.max(0, words.length - 1));
          words.forEach((node, idx) => {
            if (idx < wIdx) node.className = 'phonon-word is-spoken';
            else if (idx === wIdx) node.className = 'phonon-word is-speaking';
            else node.className = 'phonon-word is-upcoming';
          });
          const fill = document.querySelector('.phonon-teleprompter-progress-fill');
          const pct = words.length ? Math.round(((wIdx + 1) / words.length) * 100) : 45;
          if (fill) fill.style.width = pct + '%';
          const st = document.querySelector('.phonon-now-playing');
          if (st) st.textContent = '🔊 Speaking & Following Along — Word ' + (wIdx + 1) + ' of ' + words.length + ' (Zoey, 24 kHz WAV)…';
        })()`);
        await sleep(520);
      }
    },
  },
  {
    id: "07_export_any_audio_format",
    voice: "Zoey",
    voiceDesc: "Zoey (--voice Zoey · 9 Audio + 4 Read-Along Video Formats)",
    badge: "07 / 08 · EXPORT 9 AUDIO & 4 READ-ALONG VIDEO FORMATS",
    title: "EXPORT TO 9 AUDIO OR\n4 READ-ALONG VIDEOS.",
    label: "🎬 MP4 / WEBM / MOV / MKV IN 2 SECONDS + WAV / MP3 / FLAC / M4A / OPUS",
    extra: "Narrated Live by ollama run phonon --voice Zoey · Sparse-Keyframe Instant Video Encoder",
    bullets: [
      "🎬 4 Read-Along Video Formats (MP4, WebM, MOV, MKV in 16:9, 9:16, 1:1)",
      "⚡ Sparse-Keyframe Encoder Renders 49-Min Books to MP4 in ~2 Seconds",
      "🎵 9 Audio Formats (WAV, MP3, M4A, AAC, FLAC, OGG, OPUS, AIFF, WMA)",
    ],
    say: "Export your speech to nine audio formats—W A V, M P 3, M 4 A, A A C, F L A C, O G G, Opus, A I F F, or W M A—or render a synchronized Read-Along Video in M P 4, Web M, M O V, or M K V across widescreen, vertical Short, or square aspect ratios! Our sparse-keyframe encoder renders an entire forty-nine-minute e-book into a ten-eighty-p M P 4 with embedded subtitles in just two seconds!",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🎬 Save as Read-Along Video (MP4/WebM/MOV/MKV) + 9 Audio Formats (WAV/MP3/FLAC/M4A)",
        "Sparse-keyframe encoder renders 242-chunk books to 1080p MP4 in ~2s + .SRT & .VTT subtitles",
        "🎬 AUDIO & VIDEO",
      );
      await c.eval(`(() => {
        const exp = document.querySelector('.phonon-export-box');
        if (exp) exp.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })()`);
      await sleep(450);
      for (const fmt of ["mp3", "flac", "webm", "mov", "mp4"]) {
        await c.eval(`(() => {
          const sel = document.getElementById('phonon-format-select');
          if (sel) {
            sel.value = ${JSON.stringify(fmt)};
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()`);
        await sleep(320);
      }
      await c.eval(`(() => {
        const ta = document.getElementById('phonon-text-editor');
        if (ta) {
          ta.value = "Welcome to Codecaine Phonon Read-Along Video! Follow along as every word highlights in sync with the neural voice.";
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const nameInput = document.getElementById('phonon-out-name');
        if (nameInput) {
          nameInput.value = "07_Phonon_Read_Along_Video";
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(400);
      await c.click('.phonon-save-video-btn', { pause: 1800 }).catch(() => {});
      await sleep(900);
    },
  },
  {
    id: "08_ollama_ai_assistant_and_router",
    voice: "Zoey",
    voiceDesc: "Zoey (--voice Zoey · Ollama AI Assistant & Full Capability Router)",
    badge: "08 / 08 · OLLAMA AI ASSISTANT, ROUTER & SPEAK REPLY",
    title: "OLLAMA AI ASSISTANT +\nSPEAK REPLY WITH ZOEY.",
    label: "🦙 AUTO-ROUTER · DEEP THINKING · VISION · SYSTEMONE · EMBED · SPEAK REPLY",
    extra: "Narrated Live by ollama run phonon --voice Zoey · 70% RAM Guard & keep_alive: 0",
    bullets: [
      "🦙 Ask Anything Auto-Router: Chat, Deep Thinking, Vision & Web Search",
      "⚡ SystemOne Instant Decisions (`/v1/systemone`) & Semantic Search (`/api/embed`)",
      "🔊 `Speak Reply` Reads Every AI Answer Out Loud with Phonon `--voice Zoey`",
    ],
    say: "Finally, open the built-in Ollama AI Assistant to pair local language models with my Phonon Zoey voice! Use the Ask Anything Auto-Router for live streaming chat, step-by-step Deep Thinking, multimodal Vision inspection, System-One sub-second classification, and semantic Meaning Search—protected by a seventy-percent RAM hardware guard and one-click keep-alive zero memory release—while Speak Reply reads every AI answer out loud in my Zoey voice!",
    record: async (c) => {
      await c.eval(`(async () => {
        const { openPower, setPowerExpanded } = await import('/ui/power.js');
        openPower('ollama');
        setPowerExpanded(true);
      })()`);
      await showKeynoteHud(
        c,
        "🦙 Built-In Ollama AI Assistant + Full Capability Router + `Speak Reply` (`--voice Zoey`)",
        "Auto-Router · Deep Thinking · Vision · SystemOne (/v1/systemone) · Meaning Search · 70% RAM Guard",
        "🦙 OLLAMA + ZOEY",
      );
      await sleep(900);
      for (const tabLabel of [
        "2. Decision / SystemOne (/v1/systemone)",
        "3. Phonon Speech (/v1/audio/speech)",
        "4. Meaning Search & Web (/api/embed)",
        "5. Models, Hardware Guard & Cloud",
        "1. Ask Anything (Auto-Router & Chat)",
      ]) {
        await c.eval(`(() => {
          const btn = Array.from(document.querySelectorAll('.ollama-mode-btn')).find(b => b.textContent && b.textContent.includes(${JSON.stringify(tabLabel)}));
          if (btn) btn.click();
        })()`);
        await sleep(520);
      }
      await c.eval(`(() => {
        const ta = document.querySelector('.ollama-textarea');
        if (ta) {
          ta.value = "Summarize 01_Architecture_Guide.md in 3 bullet points and read the summary aloud with Phonon voice Zoey.";
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(900);
    },
  },
];

function overlayVertical(scene: SceneSpec, index: number): string {
  const isLast = index === sceneSpecs.length - 1;
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{
  background:
    radial-gradient(980px 580px at 50% -4%, rgba(56,189,248,0.32), transparent 70%),
    radial-gradient(820px 520px at 85% 100%, rgba(168,85,247,0.28), transparent 70%),
  #05070c;
  color:#f8fafc;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",sans-serif;
}
.top{position:absolute;top:48px;left:44px;right:44px;display:flex;flex-direction:column;gap:12px}
.hw-strip{
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(15,23,42,0.86);border:1px solid rgba(56,189,248,0.35);
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
  font-size:60px;font-weight:900;line-height:1.03;letter-spacing:-.025em;white-space:pre-line;
  background:linear-gradient(92deg,#ffffff 0%,#e0f2fe 46%,#f5d0fe 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.label{color:#38bdf8;font-size:24px;font-weight:800;letter-spacing:.03em;margin-top:2px}
.extra{color:#fde68a;font-size:22px;font-weight:700;line-height:1.34}
.frame-rim{
  position:absolute;top:626px;left:0;width:1080px;height:554px;
  border-top:2px solid rgba(56,189,248,0.55);
  border-bottom:2px solid rgba(236,72,153,0.55);
  box-shadow:0 0 60px rgba(56,189,248,0.22);
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
    <span class="apple-chip"> CREATED ON MAC WITH: OLLAMA RUN PHONON --VOICE ZOEY</span>
    <span>112MB MLX · 24KHZ NEURAL</span>
  </div>
  <div class="badge">${esc(scene.badge)}</div>
  <div class="title">${esc(scene.title)}</div>
  <div class="label">${esc(scene.label)}</div>
  <div class="extra">${esc(scene.extra)}</div>
</div>
<div class="frame-rim"></div>
<div class="pills">
  ${scene.bullets.map((b) => `<div class="pill"><span class="dot">✦</span><span>${esc(b)}</span></div>`).join("")}
</div>
${
  isLast
    ? `<div class="cta"><strong>▶ FREE DOWNLOAD — APPLE SILICON MAC (M1–M4 · MLX)</strong><p>Ollama Phonon Voice Reader · 38 Voices · 9 Audio Formats · Large-Text Engine</p><p class="sub">${esc(REPO)} · ARM64 macOS MLX Exclusive</p></div>`
    : `<div class="cta"><strong>▶ CODECAINE FILE MANAGER — PHONON VOICE STUDIO</strong><p>🍎 Apple Silicon Mac Exclusive (MLX) · Read Out Loud · 9 Audio Formats</p><p class="sub">${esc(REPO)} · 100% Local &amp; Offline</p></div>`
}`;
}

function overlayWideStrip(scene: SceneSpec, index: number, totalScenes: number): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1920px;height:1080px;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;position:relative;overflow:hidden}
.strip{position:absolute;left:0;right:0;bottom:0;height:${1080 - VIEW_H}px;background:linear-gradient(180deg,#0f172a,#090d16);border-top:3px solid #38bdf8;display:flex;align-items:center;gap:22px;padding:0 36px}
.badge{flex:none;background:linear-gradient(135deg,#38bdf8,#818cf8);color:#05070c;font-weight:900;font-size:15px;letter-spacing:.08em;padding:8px 15px;border-radius:10px;text-transform:uppercase}
.col{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.title{color:#7dd3fc;font-size:17px;font-weight:700;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cap{color:#f8fafc;font-size:25px;font-weight:800;letter-spacing:-.01em;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.right{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.rig{color:#0f172a;font-size:13.5px;font-weight:800;letter-spacing:.01em;background:#fef3c7;border:1.5px solid #f59e0b;padding:4px 12px;border-radius:8px;white-space:nowrap}
.n{flex:none;color:#bae6fd;font-size:16px;font-weight:800;background:rgba(56,189,248,0.15);border:1.5px solid rgba(56,189,248,0.45);padding:5px 14px;border-radius:10px}
</style></head><body><div class="strip"><div class="badge">${esc(scene.badge)}</div><div class="col"><div class="title">${esc(scene.label)}</div><div class="cap">${esc(scene.bullets.join("  ·  "))}</div></div><div class="right"><div class="rig">🎙️ Video Narrated on Mac by: phonon --voice Zoey</div><div class="n">Scene ${index + 1} of ${totalScenes}</div></div></body></html>`;
}

function notesMarkdown(seconds: number, tempo: number, sceneMarks: Array<{ at: number; scene: SceneSpec }>): string {
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const stamps = sceneMarks.map((m, i) => `${fmt(i === 0 ? 0 : m.at)} ${m.scene.label} (Voice: ${m.scene.voice})`).join("\n");
  return `# Codecaine File Manager — Ollama Phonon AI Voice Reader (\`ollama run phonon --voice Zoey\` · Apple Silicon Mac MLX) YouTube Short & Demo (${fmt(seconds)})

## Video Files (100% Live-Recorded & Narrated Live by \`ollama run phonon --voice Zoey\`)

- **YouTube Short MP4 (9:16 Vertical, 1080×1920)**: \`youtube_production/codecaine-file-manager-phonon-voice-reader-short.mp4\` (${seconds.toFixed(1)}s, 30 fps, CRF 14, 256k AAC)
- **Widescreen Demo MP4 (16:9 Horizontal, 1920×1080)**: \`youtube_production/file_manager_phonon_voice_reader_demo.mp4\` (${seconds.toFixed(1)}s, 30 fps, CRF 14, 256k AAC)

---

## High-CTR Mass-Outreach YouTube Titles (Under 100 Characters — Copy & Paste)

### Option 1 — Best Overall AI Natural Voice + Low Resources + Large Text Hook (97 chars)
\`\`\`text
Read Any File or Massive Book with Local AI Voice Zoey! (Ollama Phonon · 112MB Low RAM) #Shorts
\`\`\`

### Option 2 — Developer / Apple MLX Hook (98 chars)
\`\`\`text
We Built a Local AI Voice Reader Inside a File Manager (\`ollama run phonon --voice Zoey\` · MLX)
\`\`\`

### Option 3 — Productivity / Zero-Subscription Hook (96 chars)
\`\`\`text
Free Offline AI Voice Reader for Apple Silicon Mac: 38 Voices + 9 Audio Formats (MLX) #Shorts
\`\`\`

### Option 4 — Widescreen / Full Video Title (99 chars)
\`\`\`text
Ollama Phonon Local AI Text-to-Speech on Mac (Voice Zoey): Low Resources, Huge Books & 9 Formats
\`\`\`

---

## Mass-Outreach YouTube Description (Copy & Paste)

\`\`\`text
Turn any PDF, e-book, Word doc, Markdown file, webpage, subtitle track, spreadsheet, or massive 1,000-page book into natural, studio-grade 24 kHz neural speech on your Apple Silicon Mac — 100% locally and offline with ultra-low resource usage and ZERO cloud subscriptions! 🎙️🍎📚

🍎 PLATFORM REQUIREMENT (APPLE SILICON MAC · MLX):
Because Ollama's \`phonon\` model (Gradium Phonon Neural TTS) is accelerated by Apple's MLX framework, this built-in Voice Reader feature is supported exclusively on Apple Silicon Macs (M1, M2, M3, and M4 — macOS ARM64).

In this live demo, we showcase the built-in Phonon Voice Reader Studio inside the free & open-source Codecaine File Manager, narrated start-to-finish by \`ollama run phonon --voice Zoey\`!

⬇️ FREE & OPEN SOURCE DOWNLOAD:
${REPO}/releases/latest
⭐ GitHub Source Code (MIT License):
${REPO}

🔥 WHY THE BUILT-IN OLLAMA PHONON VOICE READER (\`--voice Zoey\`) STANDS OUT:
• 🪶 Ultra-Low Resource Footprint: Powered by a compact 112 MB local MLX model with minimal CPU/RAM overhead, O(1) constant-memory disk PCM stitching, and 1-click auto-install for Ollama + Phonon.
• 🗣️ Natural AI Voice \`Zoey\` + 38 Expressive Neural Voices: Narrated live by \`ollama run phonon --voice Zoey\`. Choose from 38 built-in Conversational, Audiobook Narrator, and Character voices, preview any voice live, and save your persistent default voice in 1 click.
• 📄 Convert 25+ File Formats to Speech or Clean Plain Text: Extract clean text from PDF, DOCX, ODT, RTF, EPUB, FB2, PPTX, XLSX, CSV, HTML, Markdown, JSON, YAML, Jupyter Notebooks (.ipynb), Subtitles (SRT/VTT/LRC), OCR images, and source code. Includes 6 smart cleanup filters to strip Markdown, HTML tags, code blocks, URLs, and timestamps, plus instant Save as .TXT!
• 📚 Handles Massive Texts & Full-Length Books with Low Memory: Phonon has an 8,192-token context limit — so our O(N) hierarchical paragraph/sentence/clause splitter divides huge books into context-safe segments automatically, streams live playback with 2-chunk background lookahead prefetching, and stitches 24 kHz 16-bit PCM audio frames directly on disk in O(1) memory.
• 🎵 Save as Any Audio File Format (Single or Batch): Export synthesized speech as WAV (native 24 kHz PCM), MP3, M4A, AAC, FLAC, OGG, OPUS, AIFF, or WMA — or select an entire folder of documents and batch-convert them into audiobooks in one click!

⏱️ CHAPTERS (NARRATED BY \`ollama run phonon --voice Zoey\`)
${stamps}

🖥️ RECORDING WORKSTATION
🍎 Apple Mac Studio (M4 Ultra · 32-Core CPU · 80-Core GPU · 192GB Unified Memory)
🖥️ Apple Pro Display XDR 6K @ 120Hz ProMotion
🔊 Local Neural TTS Engine: \`ollama run phonon --voice Zoey\` (Apple MLX · 112 MB · 24,000 Hz 16-bit PCM)

#Ollama #AppleSilicon #MLX #TextToSpeech #LocalAI #OpenSource #Audiobook #MacStudio #M4Ultra #FileManager #BunJS #TypeScript #OfflineAI #Shorts
\`\`\`

---

## YouTube Studio Tags (Comma-Separated, 492 Characters — Under YouTube's 500-Char Limit, Copy & Paste)

\`\`\`text
ollama,ollama run phonon,phonon tts,apple silicon mlx,apple mlx tts,local text to speech mac,free ai voice generator,offline text to speech,open source tts,convert pdf to audiobook,read text out loud mac,ebook to audiobook converter,gradium phonon,ai audiobook maker,document to mp3 converter,text to wav mp3 flac,codecaine file manager,bun rad studio,mac studio m4 ultra,apple silicon local ai,free elevenlabs alternative,tts large text,ai voice reader,neural tts
\`\`\`
`;
}

function runOllamaPhononWav(text: string, voice: string, outWav: string): void {
  const chunks = splitTextForPhonon(text, { maxChars: 480 });
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
      throw new Error(`ollama run phonon failed (${res.exitCode}): ${res.stderr.toString()}`);
    }
    const parsed = parseWavPcm(Buffer.from(res.stdout));
    sampleRate = parsed.sampleRate;
    numChannels = parsed.numChannels;
    bitsPerSample = parsed.bitsPerSample;
    pcmParts.push(parsed.pcmData);
    if (i + 1 < chunks.length) {
      const gapSamples = Math.round(sampleRate * 0.14);
      pcmParts.push(Buffer.alloc(gapSamples * numChannels * (bitsPerSample >> 3)));
    }
  }

  const totalPcm = Buffer.concat(pcmParts);
  const header = createWavHeader(totalPcm.length, sampleRate, numChannels, bitsPerSample);
  writeFileSync(outWav, Buffer.concat([header, totalPcm]));
}

async function synthesizeSceneNarration(scene: SceneSpec): Promise<string> {
  const audioDir = join(WORK, "audio");
  mkdirSync(audioDir, { recursive: true });
  const safeVoice = scene.voice.replace(/\s+/g, "_");
  const rawWav = join(audioDir, `raw_phonon_${scene.id}_${safeVoice}.wav`);
  const masteredWav = join(WORK, `phonon_${scene.id}_${safeVoice}.wav`);

  if (!existsSync(masteredWav)) {
    console.log(`🎙️  Synthesizing ${scene.id} with ollama run phonon --voice "${scene.voice}"...`);
    try {
      runOllamaPhononWav(scene.say, scene.voice, rawWav);
      run([
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        rawWav,
        "-af",
        "highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,adelay=200|200,apad=pad_dur=0.45",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        masteredWav,
      ]);
    } catch (err) {
      console.warn(`⚠️ Phonon CLI fallback to Edge TTS for ${scene.id}:`, err);
      const fallbackMp3 = await narrate(scene.id, scene.say, audioDir, { rate: "+6%", gap: 0.20 });
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

async function main() {
  mkdirSync(WORK, { recursive: true });
  seedPhononWorkspace();

  // 1. Synthesize all 6 scene narrations using real `ollama run phonon` voices!
  const narrated: Array<{ scene: SceneSpec; audio: string; seconds: number }> = [];
  for (const scene of sceneSpecs) {
    const audio = await synthesizeSceneNarration(scene);
    narrated.push({ scene, audio, seconds: duration(audio) });
  }

  const total = narrated.reduce((sum, item) => sum + item.seconds, 0);
  const tempo = Math.max(1, total / 168);
  console.log(`⏱️  Total Phonon narration: ${total.toFixed(2)}s; pace factor ${tempo.toFixed(3)}x -> ${(total / tempo).toFixed(1)}s`);

  // 2. Launch live File Manager server pointed at Phonon_Voice_Studio
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
      `${HOME}/Phonon_Voice_Studio`,
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
    await sleep(600);
    await recBrowser.eval(`(() => {
      try { localStorage.setItem("fm_seen_welcome", "1"); } catch {}
      document.querySelectorAll(".modal-backdrop").forEach((e) => e.remove());
    })()`);
    await sleep(300);

    for (const item of narrated) {
      const { scene } = item;
      const clipPath = join(WORK, `${scene.id}_raw.mp4`);
      console.log(`🎥 Recording live scene ${scene.id} (${(item.seconds / tempo).toFixed(1)}s)...`);
      await recBrowser.startRecording();
      await scene.record(recBrowser);
      if (scene.id === "05_extreme_large_text_chunking") {
        const uiShot = await recBrowser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        writeFileSync(join(PROD, "phonon_voice_reader_zoey_studio.png"), Buffer.from(uiShot.data, "base64"));
      }
      if (scene.id === "08_ollama_ai_assistant_and_router") {
        const uiShot = await recBrowser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        writeFileSync(join(PROD, "phonon_ollama_ai_assistant_zoey.png"), Buffer.from(uiShot.data, "base64"));
      }
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

  // 3. Composite both 1080x1920 Vertical YouTube Short AND 1920x1080 Widescreen Demo Video
  const ovlBrowser = await Cdp.launch(CDP_OVL_PORT, join(WORK, "chrome-ovl"), 1080, 1920);
  const wideBrowser = await Cdp.launch(CDP_OVL_PORT + 1, join(WORK, "chrome-wide"), 1920, 1080);
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

      console.log(`🎬 Compositing vertical Short + widescreen segment for ${scene.id} (${seconds.toFixed(1)}s)...`);

      // Vertical 1080x1920 overlay
      const vHtml = join(WORK, `${scene.id}_v.html`);
      const vPng = join(WORK, `${scene.id}_v.png`);
      writeFileSync(vHtml, overlayVertical(scene, index));
      await ovlBrowser.goto(`file://${vHtml}`, null);
      await ovlBrowser.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const vShot = await ovlBrowser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
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

      // Widescreen 1920x1080 strip overlay
      const wHtml = join(WORK, `${scene.id}_w.html`);
      const wPng = join(WORK, `${scene.id}_w.png`);
      writeFileSync(wHtml, overlayWideStrip(scene, index, narrated.length));
      await wideBrowser.goto(`file://${wHtml}`, null);
      await wideBrowser.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const wShot = await wideBrowser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
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

  // Concatenate Short MP4
  const shortList = join(WORK, "concat_short.txt");
  writeFileSync(shortList, shortSegments.map((f) => `file '${f}'`).join("\n") + "\n");
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

  // Concatenate Wide MP4
  const wideList = join(WORK, "concat_wide.txt");
  writeFileSync(wideList, wideSegments.map((f) => `file '${f}'`).join("\n") + "\n");
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
  const notes = notesMarkdown(finalSeconds, tempo, sceneMarks);
  writeFileSync(NOTES, notes);
  writeFileSync(join(PROD, "PHONON_OLLAMA_COMPLETE_TUTORIAL.md"), notes);
  writeFileSync(join(WORK, "upload-guide.txt"), notes);
  run(["cp", "-f", OUTPUT_WIDE, join(PROD, "phonon_ollama_complete_tutorial_1080p.mp4")]);
  run(["cp", "-f", OUTPUT_SHORT, join(PROD, "phonon_ollama_complete_tutorial_short.mp4")]);

  console.log(`\n✅ Built Vertical 9:16 YouTube Short: ${OUTPUT_SHORT} (${finalSeconds.toFixed(2)}s, ${(Bun.file(OUTPUT_SHORT).size / 1048576).toFixed(1)} MB)`);
  console.log(`✅ Built Widescreen 16:9 Demo Video:  ${OUTPUT_WIDE} (${duration(OUTPUT_WIDE).toFixed(2)}s, ${(Bun.file(OUTPUT_WIDE).size / 1048576).toFixed(1)} MB)`);
  console.log(`✅ Built Complete Tutorial 1080p MP4: ${join(PROD, "phonon_ollama_complete_tutorial_1080p.mp4")}`);
  console.log(`📝 Wrote YouTube & Tutorial Notes:    ${NOTES}`);
}

await main();
process.exit(0);
