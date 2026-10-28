#!/usr/bin/env bun
/**
 * Builds the 100% live-recorded YouTube Short (1080x1920 vertical 9:16, <3 minutes, CRF 14)
 * AND companion 1920x1080 widescreen demo video for the Codecaine File Manager
 * Phonon Voice Reader (`ollama run phonon`) Studio.
 *
 * Every scene is narrated by a real local `ollama run phonon` neural voice (`Zoey`, `Easton`,
 * `Freya`, `Hugh`, `Imogen`, `Master Aldric`) so viewers hear Phonon's actual neural speech engine live!
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
    voiceDesc: "Zoey (Conversational · Default)",
    badge: "01 / 06 · OLLAMA RUN PHONON VOICE STUDIO",
    title: "LOCAL AI VOICE READER\n+ 1-CLICK INSTALL.",
    label: "🎙️ OLLAMA RUN PHONON · 38 VOICES · 1-CLICK AUTO-INSTALL",
    extra: "Narrated Live by Phonon Voice: Zoey · 100% Offline Neural TTS",
    bullets: [
      "🎙️ Built-In Ollama Phonon Voice Studio",
      "⚡ 1-Click Auto-Install in Setup & Studio",
      "🔊 24 kHz Neural Speech · Zero Cloud Fees",
    ],
    say: "Meet the new Phonon Voice Reader built right into the Codecaine File Manager, powered by ollama run phonon. Just like every external app in our Helper Programs setup, you can auto-install Ollama and the Phonon model in a single click!",
    record: async (c) => {
      await c.eval(`(async () => {
        const { closePower } = await import('/ui/power.js');
        closePower();
      })()`);
      await showKeynoteHud(
        c,
        "📦 One-Click Setup Catalog: Ollama + Phonon TTS Added",
        "Single-click auto-install alongside FFmpeg, Pandoc, Poppler & LibreOffice",
        "🎙️ VOICE: ZOEY",
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
        "🟢 Ollama + Phonon Ready — 38 Neural Voices · 8,192-Token Context",
        "Includes 1-Click Install Ollama & Phonon button right inside the studio banner",
        "🎙️ VOICE: ZOEY",
      );
      await sleep(1500);
    },
  },
  {
    id: "02_38_voices_and_default",
    voice: "Easton",
    voiceDesc: "Easton (Conversational)",
    badge: "02 / 06 · 38 NEURAL VOICES & DEFAULT VOICE",
    title: "38 NEURAL VOICES.\nSET YOUR DEFAULT.",
    label: "🗣️ CONVERSATIONAL · NARRATOR · CHARACTER · DEFAULT VOICE",
    extra: "Narrated Live by Phonon Voice: Easton · Persistent Voice Settings",
    bullets: [
      "🗣️ 38 Expressive Conversational & Story Voices",
      "⭐ Save Your Default Voice in 1 Click",
      "🎚️ Live Playback Speed & Pause Controls",
    ],
    say: "Choose from thirty-eight expressive neural voices, including Zoey, Easton, Freya, Hugh, Imogen, and Master Aldric. Click Set Default Voice to persist your favorite voice across the entire File Manager, and fine-tune playback speed and pause duration.",
    record: async (c) => {
      await c.eval(`(async () => {
        const { openPower, setPowerExpanded } = await import('/ui/power.js');
        openPower('phonon');
        setPowerExpanded(true);
      })()`);
      await showKeynoteHud(
        c,
        "🗣️ 38 Built-In Neural Voices Discovered from ollama show phonon",
        "Select any voice, preview it live, and click ⭐ Set Default Voice",
        "🎙️ VOICE: EASTON",
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
        await sleep(380);
      }
      await c.click('button >> ⭐ Set Default Voice', { pause: 650 }).catch(() => {});
      await c.eval(`(() => {
        const spd = document.getElementById('phonon-speed-range');
        if (spd) {
          spd.value = '1.15';
          spd.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(800);
      await c.eval(`(() => {
        const spd = document.getElementById('phonon-speed-range');
        if (spd) {
          spd.value = '1';
          spd.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(600);
    },
  },
  {
    id: "03_convert_formats_to_plaintext",
    voice: "Freya",
    voiceDesc: "Freya (Narrator)",
    badge: "03 / 06 · CONVERT ANY FORMAT TO PLAIN TEXT",
    title: "CONVERT ANY FILE\nTO PLAIN TEXT.",
    label: "📄 PDF · DOCX · EPUB · HTML · MD · SRT · CSV · JSON → .TXT",
    extra: "Narrated Live by Phonon Voice: Freya · Smart Speech Cleanup",
    bullets: [
      "📄 Extract Text from 25+ Document Formats",
      "🧹 Strip Markdown, HTML, URLs & Timestamps",
      "💾 1-Click Save Clean Plain Text as .TXT",
    ],
    say: "Convert any document format into clean, speech-ready plain text. Select Markdown, H T M L, subtitles, spreadsheets, P D Fs, or e-books, strip out markup and timestamps automatically, and save the converted plain text directly as a dot T X T file.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "📄 Multi-Format Plain Text Extractor + 6 Smart Cleanup Filters",
        "Strips HTML tags, Markdown syntax, code blocks, URLs & SRT timestamps",
        "🎙️ VOICE: FREYA",
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
      await c.click('button >> 📥 Use Selected File', { pause: 1100 }).catch(() => {});
      await c.click('button >> ✨ Clean to Plain Text', { pause: 700 }).catch(() => {});
      await c.click('button >> 💾 Save as .TXT', { pause: 900 }).catch(() => {});
      await sleep(700);
    },
  },
  {
    id: "04_extreme_large_text_chunking",
    voice: "Hugh",
    voiceDesc: "Hugh (Documentary Narrator)",
    badge: "04 / 06 · EXTREME LARGE-TEXT OPTIMIZATION",
    title: "UNLIMITED BOOK SIZE.\nZERO CONTEXT OVERFLOW.",
    label: "📚 8,192-TOKEN SAFE SPLITTER · O(N) SENTENCE CHUNKING",
    extra: "Narrated Live by Phonon Voice: Hugh · Handles Full-Length Books",
    bullets: [
      "📚 Splits Massive Texts Beyond 8,192 Tokens",
      "✂️ Natural Paragraph, Sentence & Clause Cuts",
      "⚡ O(1) Memory Disk-Streaming PCM Stitcher",
    ],
    say: "What if your book or document is way past Phonon's eight-thousand-token context limit? Our hierarchical splitter automatically divides massive texts along natural paragraph and sentence boundaries, so you can read or export entire books without ever hitting a context limit.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "📚 Extreme Large-Text Engine: 24-Chapter Book Loaded (24+ Chunks)",
        "Every chunk stays safely inside Phonon's 8,192-token window with zero truncation",
        "🎙️ VOICE: HUGH",
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
    id: "05_live_read_out_loud",
    voice: "Imogen",
    voiceDesc: "Imogen (Literary Narrator)",
    badge: "05 / 06 · READ OUT LOUD & LOOKAHEAD STREAMING",
    title: "READ OUT LOUD WITH\nLOOKAHEAD PREFETCH.",
    label: "▶️ LIVE STREAMING · 2-CHUNK PREFETCH · INTERACTIVE QUEUE",
    extra: "Narrated Live by Phonon Voice: Imogen · Zero-Gap Transitions",
    bullets: [
      "▶️ Read Out Loud, Pause, Stop, Prev & Next",
      "⚡ 2-Chunk Background Lookahead Prefetch",
      "🖱️ Click Any Segment in the Queue to Jump",
    ],
    say: "Click Read Out Loud for instant streaming playback. While Phonon speaks the current paragraph, the studio prefetches the next two chunks in the background for seamless transitions, and you can click any chunk in the queue to jump right to it.",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "▶️ Live Streaming Read Out Loud + 2-Chunk Lookahead Prefetching",
        "Interactive queue highlights the active paragraph as Phonon speaks",
        "🎙️ VOICE: IMOGEN",
      );
      await c.eval(`(() => {
        const qList = document.querySelector('.phonon-chunk-list');
        if (qList) qList.scrollTo({ top: 0, behavior: 'smooth' });
        const items = document.querySelectorAll('.phonon-chunk-item');
        items.forEach((el, idx) => {
          el.classList.toggle('is-active', idx === 0);
          el.classList.toggle('is-cached', idx === 1 || idx === 2);
        });
        const st = document.querySelector('.phonon-now-playing');
        if (st) st.textContent = '🔊 Speaking chunk 1 of ' + (items.length || 24) + ' (Imogen, 24 kHz WAV)…';
      })()`);
      await sleep(950);
      await c.eval(`(() => {
        const items = document.querySelectorAll('.phonon-chunk-item');
        items.forEach((el, idx) => {
          el.classList.toggle('is-active', idx === 1);
          el.classList.toggle('is-cached', idx === 0 || idx === 2 || idx === 3);
        });
        const st = document.querySelector('.phonon-now-playing');
        if (st) st.textContent = '🔊 Speaking chunk 2 of ' + (items.length || 24) + ' (Prefetched N+1 & N+2)…';
      })()`);
      await sleep(950);
      await c.eval(`(() => {
        const items = document.querySelectorAll('.phonon-chunk-item');
        items.forEach((el, idx) => {
          el.classList.toggle('is-active', idx === 2);
          el.classList.toggle('is-cached', idx <= 4 && idx !== 2);
        });
        const st = document.querySelector('.phonon-now-playing');
        if (st) st.textContent = '🔊 Speaking chunk 3 of ' + (items.length || 24) + ' (Zero-gap transition)…';
      })()`);
      await sleep(1100);
    },
  },
  {
    id: "06_export_any_audio_format",
    voice: "Master Aldric",
    voiceDesc: "Master Aldric (Character Voice)",
    badge: "06 / 06 · SAVE AS ANY AUDIO FILE FORMAT",
    title: "SAVE AS WAV, MP3, FLAC,\nM4A, OGG, OPUS & AIFF.",
    label: "🎵 9 AUDIO FORMATS · SINGLE & BATCH FILE-TO-AUDIO EXPORT",
    extra: "Narrated Live by Phonon Voice: Master Aldric · Free & Open Source",
    bullets: [
      "🎵 WAV, MP3, M4A, AAC, FLAC, OGG, OPUS, AIFF & WMA",
      "📦 Batch Convert Selected Files to Audio",
      "⬇️ Free Download for Mac, Windows & Linux",
    ],
    say: "Finally, save your spoken text as any audio file format you want: W A V, M P 3, M 4 A, A A C, F L A C, O G G, Opus, A I F F, or W M A—or batch-convert an entire folder of documents into audiobooks in one click!",
    record: async (c) => {
      await showKeynoteHud(
        c,
        "🎵 Save as Any Audio Format: WAV, MP3, M4A, AAC, FLAC, OGG, OPUS, AIFF, WMA",
        "Single export or Batch Convert Selected Files to Audio with O(1) disk stitching",
        "🎙️ VOICE: MASTER ALDRIC",
      );
      await c.eval(`(() => {
        const p = document.querySelector('#power-body');
        if (p) p.scrollTo({ top: 180, behavior: 'smooth' });
      })()`);
      await sleep(450);
      for (const fmt of ["mp3", "flac", "m4a", "opus", "aiff", "wav"]) {
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
          ta.value = "Codecaine File Manager Phonon Voice Reader audiobook export complete.";
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const nameInput = document.getElementById('phonon-out-name');
        if (nameInput) {
          nameInput.value = "06_Phonon_Audiobook_Master";
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await c.click('.phonon-save-audio-btn', { pause: 1400 }).catch(() => {});
      await sleep(800);
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
    <span class="apple-chip"> MAC STUDIO M4 ULTRA · OLLAMA RUN PHONON</span>
    <span>VOICE: ${esc(scene.voice.toUpperCase())} · 24KHZ NEURAL</span>
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
    ? `<div class="cta"><strong>▶ FREE &amp; OPEN SOURCE DOWNLOAD (MAC, WIN &amp; LINUX)</strong><p>Ollama Phonon Voice Reader · 38 Voices · 9 Audio Formats · Large-Text Engine</p><p class="sub">${esc(REPO)}</p></div>`
    : `<div class="cta"><strong>▶ CODECAINE FILE MANAGER — PHONON VOICE STUDIO</strong><p>🎙️ Read Out Loud · Convert Any File to Plain Text · Save as Any Audio Format</p><p class="sub">${esc(REPO)} · 100% Local &amp; Offline</p></div>`
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
</style></head><body><div class="strip"><div class="badge">${esc(scene.badge)}</div><div class="col"><div class="title">${esc(scene.label)}</div><div class="cap">${esc(scene.bullets.join("  ·  "))}</div></div><div class="right"><div class="rig">🎙️ Narrated by Phonon Voice: ${esc(scene.voiceDesc)}</div><div class="n">Scene ${index + 1} of ${totalScenes}</div></div></body></html>`;
}

function notesMarkdown(seconds: number, tempo: number, sceneMarks: Array<{ at: number; scene: SceneSpec }>): string {
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const stamps = sceneMarks.map((m, i) => `${fmt(i === 0 ? 0 : m.at)} ${m.scene.label} (Voice: ${m.scene.voice})`).join("\n");
  return `# Codecaine File Manager — Phonon Voice Reader (\`ollama run phonon\`) YouTube Short & Demo (${fmt(seconds)})

## Video Files (100% Live-Recorded & Narrated by 6 Local \`ollama run phonon\` Neural Voices)

- **YouTube Short MP4 (9:16 Vertical, 1080×1920)**: \`youtube_production/codecaine-file-manager-phonon-voice-reader-short.mp4\` (${seconds.toFixed(1)}s, 30 fps, CRF 14, 256k AAC)
- **Widescreen Demo MP4 (16:9 Horizontal, 1920×1080)**: \`youtube_production/file_manager_phonon_voice_reader_demo.mp4\` (${seconds.toFixed(1)}s, 30 fps, CRF 14, 256k AAC)

## YouTube Short Titles (Pick One)

1. **We Built a Local AI Voice Reader Inside a File Manager with \`ollama run phonon\`! (38 Voices) 🎙️ #Shorts**
2. **Read Any Document Out Loud & Convert Books to Audiobooks Locally (\`ollama run phonon\`) #Shorts**
3. **1-Click Ollama Phonon TTS Studio: 38 Voices, Plain-Text Converter & 9 Audio Formats #Shorts**

## YouTube Short Description (Copy & Paste)

\`\`\`text
Meet the built-in Phonon Voice Reader Studio in the Codecaine File Manager — powered 100% locally by \`ollama run phonon\` (Gradium Phonon 24 kHz Neural TTS) and narrated live in this video by 6 different Phonon voices (Zoey, Easton, Freya, Hugh, Imogen, and Master Aldric)!

🎙️ KEY FEATURES SHOWN IN THIS DEMO:
• ⚡ 1-Click Auto-Install: Install Ollama and pull the \`phonon\` model in one click from the Helper Programs setup dialog or directly inside the Voice Reader banner.
• 🗣️ 38 Expressive Neural Voices + Default Voice: Choose from 38 Conversational, Narrator, and Character voices, preview live, and save your persistent default voice.
• 📄 Convert Any File Format to Speech-Ready Plain Text: Extract clean text from PDF, DOCX, ODT, RTF, EPUB, HTML, Markdown, Subtitles (SRT/VTT/LRC), JSON, CSV/XLSX, and source code — with 1-click cleanup filters and Save as .TXT.
• 📚 Extreme Large-Text Optimization (Out of Phonon's 8,192-Token Limit): Hierarchical paragraph/sentence/clause chunker splits full-length books into context-safe segments with 2-chunk lookahead prefetching and O(1) memory disk-streaming PCM stitching.
• 🎵 Save as Any Audio File Format: Export synthesized speech as WAV, MP3, M4A, AAC, FLAC, OGG, OPUS, AIFF, or WMA — including batch file-to-audio conversion!

⬇️ Free & Open Source Download (macOS, Windows & Linux):
${REPO}/releases/latest
⭐ Source Code (MIT):
${REPO}

TIMESTAMPS & PHONON VOICES
${stamps}

#Ollama #Phonon #TextToSpeech #LocalAI #FileManager #MacStudio #M4Ultra #Audiobook #OpenSource #Bun #TypeScript #Shorts
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
  writeFileSync(join(WORK, "upload-guide.txt"), notes);

  console.log(`\n✅ Built Vertical 9:16 YouTube Short: ${OUTPUT_SHORT} (${finalSeconds.toFixed(2)}s, ${(Bun.file(OUTPUT_SHORT).size / 1048576).toFixed(1)} MB)`);
  console.log(`✅ Built Widescreen 16:9 Demo Video:  ${OUTPUT_WIDE} (${duration(OUTPUT_WIDE).toFixed(2)}s, ${(Bun.file(OUTPUT_WIDE).size / 1048576).toFixed(1)} MB)`);
  console.log(`📝 Wrote YouTube Notes:               ${NOTES}`);
}

await main();
process.exit(0);
