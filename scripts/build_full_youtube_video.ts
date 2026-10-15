// Master Video Assembly Pipeline for Codecaine File Manager YouTube Demo
// Powered by Gemini TTS (optional, GEMINI_API_KEY) or Edge-TTS Neural Multilingual Voice & FFmpeg High-Profile Encoding
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { Sys } from "../src/simplecli/sys";

const ROOT = process.cwd();
const FRAMES_DIR = join(ROOT, "youtube_production", "frames");
const AUDIO_DIR = join(ROOT, "youtube_production", "audio");
const ASSETS_DIR = join(ROOT, "youtube_production", "assets");
const LIVE_DIR = join(ROOT, "youtube_production", "live");
const REUSE_AUDIO = process.argv.includes("--reuse-audio");
const STILLS_ONLY = process.argv.includes("--stills");
const SEGMENTS_DIR = join(ROOT, "youtube_production", "segments");
const FINAL_VIDEO = join(ROOT, "youtube_production", "codecaine_file_manager_youtube_demo.mp4");
const RELEASE_KIT = join(ROOT, "youtube_production", "YOUTUBE_RELEASE_KIT.md");

const FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UVX = "/Users/codecaine/.local/bin/uvx";

mkdirSync(SEGMENTS_DIR, { recursive: true });
mkdirSync(AUDIO_DIR, { recursive: true });
mkdirSync(ASSETS_DIR, { recursive: true });

interface SceneDef {
  id: string;
  frame: string;
  chapter: string;
  title: string;
  bullets: string;
  narration: string;
}

const scenes: SceneDef[] = [
  {
    id: "00_intro",
    frame: "00_title_card.png",
    chapter: "INTRODUCTION",
    title: "The Ultimate Developer Workstation",
    bullets: "Cross-Platform · Built on Bun v1.4.2 · Zero-Data-Loss Architecture",
    narration: "Welcome to Codecaine File Manager, the next-generation developer workstation built on Bun version 1.4.2. This is not just a file browser. It is a complete, private, cross-platform power tool for macOS, Windows, and Linux that replaces dozens of standalone utilities."
  },
  {
    id: "01_install",
    frame: "01_windows_install.png",
    chapter: "GETTING STARTED",
    title: "First-Time Install: Windows & *Nix",
    bullets: "bun install · Windows Auto WebView2 · macOS & Linux Native",
    narration: "Whether you are on Windows, macOS, or Linux, getting started with Codecaine File Manager is completely straightforward. First, run bun install. On Windows, the automated postinstall script immediately verifies and patches the Microsoft Edge WebView2 runtime, and you can launch with PowerShell using run.ps1 or bun run app:files. On macOS and Linux, bun install resolves all dependencies in milliseconds, and bun run app:files launches the native desktop window right away, with optional macOS application bundlers and headless server modes."
  },
  {
    id: "02_home",
    frame: "01_home_dashboard.png",
    chapter: "CHAPTER 01",
    title: "Home Dashboard & Quick Launch",
    bullets: "Pinned Favorites · Disk Meters · One-Click Tool Tiles",
    narration: "The Home Dashboard welcomes you with a birds-eye view of your entire system. Pinned favorites, disk storage meters, recent files, and one-click launch tiles for every developer tool. Everything is visible, labeled, and instantly accessible."
  },
  {
    id: "03_files",
    frame: "02_files_workspace.png",
    chapter: "CHAPTER 02",
    title: "Everyday Files Workspace",
    bullets: "Breadcrumbs · Details / List / Icons · Live File Previews",
    narration: "In the main files workspace, enjoy crystal-clear breadcrumb navigation, instant search with wildcards, and three view modes: Details, List, and Icons. The side details panel provides live image and text previews, file stats, and deep metadata inspection."
  },
  {
    id: "04_dual",
    frame: "03_dual_pane.png",
    chapter: "CHAPTER 03",
    title: "Dual-Pane Productivity Flow",
    bullets: "Two Folders Side-by-Side · F5 Copy · F6 Move · Undo",
    narration: "Power users get a true dual-pane workspace. Browse two independent directories side by side, navigate with Tab, and transfer files instantly using F5 to copy and F6 to move, complete with collision handling and one-touch undo."
  },
  {
    id: "05_split",
    frame: "04_split_view.png",
    chapter: "CHAPTER 04",
    title: "Split View Workspace",
    bullets: "Side-by-Side Tools · Synchronized Navigation · Adjustable Divider",
    narration: "With Split View, you never lose your context. Keep your active file list on one side while running any developer tool on the other, stacked horizontally or side-by-side with an adjustable divider."
  },
  {
    id: "06_code",
    frame: "05_code_studio.png",
    chapter: "CHAPTER 05",
    title: "Built-In Code Studio",
    bullets: "Syntax Highlighting · Multi-Tab Editor · V-Lang · Markdown Preview",
    narration: "The built-in Code Studio gives you a multi-tab code editor with syntax highlighting, autocomplete snippets, Markdown live preview, run presets, and full support for V-Lang formatting."
  },
  {
    id: "07_dev",
    frame: "06_dev_station.png",
    chapter: "CHAPTER 06",
    title: "Developer Station (Tokei & Git)",
    bullets: "100+ Languages Counted · Git Insights · Heavy Folder Bloat Scanner",
    narration: "The Dev tab brings deep repository insights. Run instant lines-of-code counts across one hundred languages powered by Tokei, inspect Git commit history, identify bloated directories like node_modules, and scan for TODO notes."
  },
  {
    id: "08_database",
    frame: "07_database_hub.png",
    chapter: "CHAPTER 07",
    title: "Database Studio Hub",
    bullets: "SQLite Studio Pro · MySQL · PostgreSQL · Redis · Staging Imports",
    narration: "The Database Hub automatically connects your local and remote databases. Here, SQLite Studio Pro is connected directly to our analytics database, giving you visual table designers, raw SQL query runners, and PRAGMA performance tuning."
  },
  {
    id: "09_secrets",
    frame: "08_secrets_vault.png",
    chapter: "CHAPTER 08",
    title: "Secrets & Encrypted Vaults",
    bullets: "Argon2id + AES-256-GCM · 2FA TOTP · Recovery Keys · Zero Plaintext",
    narration: "Keep your credentials secure with Secrets and Encrypted Vaults. Store passwords, secure notes, and 2FA TOTP authenticator tokens encrypted with Argon2id and AES-256-GCM. Plus, lock any sensitive file or folder into a protected archive."
  },
  {
    id: "10_crypto",
    frame: "09_crypto_tools.png",
    chapter: "CHAPTER 09",
    title: "Crypto & Multi-Hash Verifier",
    bullets: "MD5 · SHA-256 · Blake3 · rapidhash · Argon2id · Color Converter",
    narration: "The Crypto suite lets you verify checksums across MD5, SHA-256, Blake3, and rapidhash. Hash passwords with Argon2id and bcrypt, generate cryptographically secure keys, and convert CSS color tokens."
  },
  {
    id: "11_serve",
    frame: "10_live_server.png",
    chapter: "CHAPTER 10",
    title: "Zero-Config Live & PHP Server",
    bullets: "Live Reload on Save · Built-in PHP Server · Real-Time Request Logs",
    narration: "Need to preview a web project? Launch the zero-config Live Server with instant hot reload on file saves, or boot a local PHP development server with real-time streaming request logs."
  },
  {
    id: "12_net",
    frame: "11_network_ip.png",
    chapter: "CHAPTER 11",
    title: "Network & Subnet CIDR IP Tools",
    bullets: "Subnet Calculator · Port Probing · DNS Verification · Diagnostics",
    narration: "The Network suite provides CIDR subnet calculators, IP address lookups, live port probes, and connectivity diagnostics to troubleshoot web services without leaving your file manager."
  },
  {
    id: "13_subs",
    frame: "12_subfinder_recon.png",
    chapter: "CHAPTER 12",
    title: "Subdomain Recon (Subfinder)",
    bullets: "Certificate Logs · Passive DNS · Live HTTP Probing · Markdown Reports",
    narration: "For security research, the Subdomains tool integrates the Subfinder engine to discover subdomains from public certificate logs and passive DNS, with live HTTP status probing and exportable reports."
  },
  {
    id: "14_grave",
    frame: "13_rip_graveyard.png",
    chapter: "CHAPTER 13",
    title: "Rip Graveyard & Safe Undo",
    bullets: "Quarantine Before Delete · Instant Undo · Manifest Verification",
    narration: "Never lose a file again. Every delete moves items to the Recycle Bin or Rip Graveyard with one-touch Ctrl-Z undo. Inspect buried files before restoring, or verify graveyard integrity with automated manifest repair."
  },
  {
    id: "15_find",
    frame: "14_find_replace.png",
    chapter: "CHAPTER 14",
    title: "Deep Find & Regex Replace",
    bullets: "Archive Search · Multi-File Search & Replace · Live Diff Previews",
    narration: "Search your entire filesystem with regex, size, and date filters, search inside compressed archives, or perform blazing-fast multi-file search and replace using the integrated sd engine with live diff previews."
  },
  {
    id: "16_cyberpunk",
    frame: "15_theme_cyberpunk.png",
    chapter: "CHAPTER 15",
    title: "Futuristic Cyberpunk Themes",
    bullets: "Neon Accents · Custom Glassmorphism · High Contrast Dark Mode",
    narration: "Personalize your workspace with over 135 built-in themes. From Cyberpunk neon glows to retro terminals and minimalist slate palettes, switch themes with zero lag."
  },
  {
    id: "17_sonoma",
    frame: "16_theme_sonoma.png",
    chapter: "CHAPTER 16",
    title: "Apple Sonoma & Custom Designer",
    bullets: "Emerald Accents · Live CSS Variables · Export Custom Palettes",
    narration: "Enjoy native OS aesthetics with Apple Sonoma Emerald, or open the built-in Theme Designer to customize every border, accent, and contrast token to match your exact taste."
  },
  {
    id: "18_outro",
    frame: "17_outro_card.png",
    chapter: "CONCLUSION",
    title: "Ready to Supercharge Your Workflow?",
    bullets: "Clone on GitHub · Run with Bun v1.4.2 · Star the Repository",
    narration: "Codecaine File Manager is fast, private, and open-source. Clone the repository today, run bun install, and experience the ultimate developer workstation on macOS, Windows, and Linux. Star the repository on GitHub, and subscribe for more developer tool showcases."
  }
];

const VOICE = "en-US-AndrewMultilingualNeural";
const VOICE_RATE = "-4%";
const SENTENCE_GAP_SEC = 0.42;

// Spell out tokens that neural voices tend to read awkwardly.
function spokenText(text: string): string {
  return text
    .replace(/v?1\.4\.2/g, "one point four point two")
    .replace(/AES-256-GCM/g, "A E S 256 G C M")
    .replace(/\bF5\b/g, "F five")
    .replace(/\bF6\b/g, "F six")
    .replace(/Ctrl-Z/g, "Control Z")
    .replace(/\bTOTP\b/g, "T O T P")
    .replace(/\b2FA\b/g, "two factor")
    .replace(/\bsd\b/g, "S D")
    .replace(/\bCIDR\b/g, "C I D R")
    .replace(/\bDNS\b/g, "D N S")
    .replace(/\bPHP\b/g, "P H P")
    .replace(/\bSQL\b/g, "sequel")
    .replace(/\bSQLite\b/g, "sequel-lite")
    .replace(/V-Lang/g, "V Lang")
    .replace(/run\.ps1/g, "run dot P S one")
    .replace(/\bMD5\b/g, "M D 5")
    .replace(/\bSHA-256\b/g, "SHA 256")
    .replace(/\bBlake3\b/g, "Blake three")
    .replace(/\bArgon2id\b/g, "Argon two I D")
    .replace(/\bbcrypt\b/g, "B crypt")
    .replace(/\bCSS\b/g, "C S S")
    .replace(/\bGitHub\b/g, "Git Hub")
    .replace(/\bnode_modules\b/g, "node modules")
    .replace(/\bTODO\b/g, "to-do")
    .replace(/\bmacOS\b/g, "mac O S")
    .replace(/\bPRAGMA\b/g, "pragma")
    .replace(/\b135\b/g, "one hundred thirty five");
}

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const GEMINI_VOICE = process.env.GEMINI_TTS_VOICE ?? "Kore";

// Optional: Google Gemini TTS (free AI Studio key). Returns true when the narration was written.
async function synthesizeWithGemini(sc: SceneDef, outPath: string): Promise<boolean> {
  if (!GEMINI_KEY) return false;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: `Read this as a warm, natural, conversational YouTube narrator, with relaxed pacing:\n\n${spokenText(sc.narration)}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } },
    },
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY }, body: JSON.stringify(body) });
      if (!res.ok) {
        console.warn(`  ⚠ Gemini TTS HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
        if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) return false;
        await Bun.sleep(res.status === 429 ? 25000 : 3000);
        continue;
      }
      const json: any = await res.json();
      const b64 = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!b64) continue;
      const pcm = join(AUDIO_DIR, `gemini_${sc.id}.pcm`);
      await Bun.write(pcm, Buffer.from(b64, "base64"));
      Sys.exec(`"${FFMPEG}" -y -f s16le -ar 24000 -ac 1 -i "${pcm}" -c:a libmp3lame -q:a 2 "${outPath}" 2>/dev/null`);
      if (existsSync(outPath)) return true;
    } catch (e) {
      console.warn(`  ⚠ Gemini TTS error: ${e}`);
    }
  }
  return false;
}

// Synthesize sentence by sentence so we can insert natural pauses between them.
function synthesizeNarration(sc: SceneDef, outPath: string): void {
  const sentences = (spokenText(sc.narration).match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((x) => x.trim())
    .filter(Boolean);
  const partDir = join(AUDIO_DIR, "parts");
  mkdirSync(partDir, { recursive: true });
  const gap = join(partDir, "gap.wav");
  Sys.exec(`"${FFMPEG}" -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${SENTENCE_GAP_SEC} "${gap}" 2>/dev/null`);

  const lines: string[] = [];
  sentences.forEach((sentence, idx) => {
    const mp3 = join(partDir, `${sc.id}_${idx}.mp3`);
    const wav = join(partDir, `${sc.id}_${idx}.wav`);
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      const r = Bun.spawnSync([UVX, "edge-tts", "--voice", VOICE, `--rate=${VOICE_RATE}`, "--text", sentence, "--write-media", mp3], { stdout: "ignore", stderr: "ignore" });
      ok = r.exitCode === 0 && existsSync(mp3) && Bun.file(mp3).size > 1000;
    }
    if (!ok) throw new Error(`edge-tts failed for ${sc.id} sentence ${idx}: ${sentence}`);
    Sys.exec(`"${FFMPEG}" -y -i "${mp3}" -ar 24000 -ac 1 "${wav}" 2>/dev/null`);
    lines.push(`file '${wav}'`);
    if (idx < sentences.length - 1) lines.push(`file '${gap}'`);
  });

  const list = join(partDir, `${sc.id}_list.txt`);
  require("fs").writeFileSync(list, lines.join("\n"));
  Sys.exec(`"${FFMPEG}" -y -f concat -safe 0 -i "${list}" -c:a libmp3lame -q:a 2 "${outPath}" 2>/dev/null`);
  if (!existsSync(outPath)) throw new Error(`narration concat failed for ${sc.id}`);
}

function getAudioDuration(filePath: string): number {
  const [out] = Sys.exec(`"${FFPROBE}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
  return parseFloat(out.trim()) || 10.0;
}

function makeOverlayHtml(chapter: string, title: string, bullets: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1920px;
    height: 1080px;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    position: relative;
    overflow: hidden;
  }
  .hud-banner {
    position: absolute;
    bottom: 35px;
    left: 45px;
    right: 45px;
    background: rgba(15, 23, 42, 0.88);
    backdrop-filter: blur(25px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    padding: 16px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(99, 102, 241, 0.2);
  }
  .left {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .badge {
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
    color: #fff;
    font-weight: 800;
    font-size: 14px;
    letter-spacing: 0.08em;
    padding: 6px 14px;
    border-radius: 10px;
    text-transform: uppercase;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }
  .title {
    color: #ffffff;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  .bullets {
    color: #38bdf8;
    font-size: 16px;
    font-weight: 600;
    background: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 8px 18px;
    border-radius: 12px;
  }
</style>
</head>
<body>
  <div class="hud-banner">
    <div class="left">
      <div class="badge">${chapter}</div>
      <div class="title">${title}</div>
    </div>
    <div class="bullets">${bullets}</div>
  </div>
</body>
</html>`;
}

async function renderOverlay(sc: SceneDef, outPath: string) {
  const htmlPath = join(ASSETS_DIR, `overlay_${sc.id}.html`);
  await Bun.write(htmlPath, makeOverlayHtml(sc.chapter, sc.title, sc.bullets));
  const cmd = `"${CHROME}" --headless --disable-gpu --user-data-dir=/tmp/isolated_chrome_screens --no-first-run --default-background-color=00000000 --screenshot="${outPath}" --window-size=1920,1080 "file://${htmlPath}" 2>/dev/null`;
  Sys.exec(cmd);
}

async function main() {
  console.log("🎬 ========================================================================");
  console.log("🚀 CODECAINE FILE MANAGER - HIGH LEVEL PRODUCTION VIDEO COMPILATION");
  console.log("🎙️ AI Neural Voice Synthesis (en-US-AndrewMultilingualNeural) + Full Feature Tour");
  console.log("🎬 ========================================================================\n");

  const segmentFiles: string[] = [];
  const chaptersList: { time: number; title: string }[] = [];
  let currentTime = 0;

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i]!;
    console.log(`[${i + 1}/${scenes.length}] Processing Scene: ${sc.title}...`);

    // 1. Generate Voiceover Audio using Neural AI Voice (Edge-TTS AndrewMultilingualNeural)
    const rawAudioPath = join(AUDIO_DIR, `raw_${sc.id}.mp3`);
    const mp3Path = join(AUDIO_DIR, `narration_${sc.id}.mp3`);

    console.log(`  🎙️ Generating AI voice: ${sc.title}...`);
    // Narration is only regenerated when its text or voice changed (every Gemini call is billed).
    const keyFile = `${rawAudioPath}.key`;
    const voiceKey = createHash("sha1").update(`${GEMINI_KEY ? `gemini:${GEMINI_MODEL}:${GEMINI_VOICE}` : `edge:${VOICE}:${VOICE_RATE}`}|${spokenText(sc.narration)}`).digest("hex");
    const cached = existsSync(rawAudioPath) && Bun.file(rawAudioPath).size > 1000 && (REUSE_AUDIO || (existsSync(keyFile) && readFileSync(keyFile, "utf8") === voiceKey));
    if (cached) console.log("  ♻ Reusing existing narration audio");
    else if (await synthesizeWithGemini(sc, rawAudioPath)) console.log("  ✨ Voice: Google Gemini TTS");
    else synthesizeNarration(sc, rawAudioPath);
    writeFileSync(keyFile, voiceKey);

    // Gentle EQ + level-matching (no extra gain stage) with lead-in / lead-out padding
    Sys.exec(`"${FFMPEG}" -y -i "${rawAudioPath}" -af "highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11,adelay=350|350,apad=pad_dur=0.75" -ar 48000 "${mp3Path}" 2>/dev/null`);
    if (!existsSync(mp3Path)) throw new Error(`audio post-processing failed for ${sc.id}`);

    const dur = getAudioDuration(mp3Path);
    console.log(`  🎙️ AI Voice duration: ${dur.toFixed(2)}s`);
    chaptersList.push({ time: currentTime, title: `${sc.chapter}: ${sc.title}` });
    currentTime += dur;

    // 2. Generate Transparent HUD Overlay (Skip on pure title/outro cards)
    const framePath = join(FRAMES_DIR, sc.frame);
    const segPath = join(SEGMENTS_DIR, `seg_${sc.id}.mp4`);

    if (sc.id === "00_intro" || sc.id === "18_outro") {
      const cmd = `"${FFMPEG}" -y -loop 1 -i "${framePath}" -i "${mp3Path}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -t ${dur.toFixed(3)} -r 30 "${segPath}" 2>/dev/null`;
      Sys.exec(cmd);
    } else {
      const overlayPath = join(ASSETS_DIR, `overlay_${sc.id}.png`);
      await renderOverlay(sc, overlayPath);
      const liveClip = join(LIVE_DIR, `live_${sc.id}.mp4`);
      if (!STILLS_ONLY && existsSync(liveClip)) {
        // Real recorded screen action, held / trimmed to the narration length, with the glass HUD on top.
        console.log("  🎥 Using live screen recording");
        const cmd = `"${FFMPEG}" -y -i "${liveClip}" -i "${overlayPath}" -i "${mp3Path}" -filter_complex "[0:v]fps=30,scale=1920:1080,tpad=stop_mode=clone:stop_duration=3[bg];[bg][1:v]overlay=0:0[v]" -map "[v]" -map 2:a -c:v libx264 -preset medium -crf 18 -c:a aac -b:a 192k -pix_fmt yuv420p -t ${dur.toFixed(3)} -r 30 "${segPath}" 2>/dev/null`;
        Sys.exec(cmd);
      } else {
        const cmd = `"${FFMPEG}" -y -loop 1 -i "${framePath}" -i "${overlayPath}" -i "${mp3Path}" -filter_complex "[0:v]scale=1920:1080[bg];[bg][1:v]overlay=0:0" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -t ${dur.toFixed(3)} -r 30 "${segPath}" 2>/dev/null`;
        Sys.exec(cmd);
      }
    }

    console.log(`  ✔ Segment created: seg_${sc.id}.mp4`);
    segmentFiles.push(segPath);
  }

  // 3. Create Concat List
  console.log("\n📦 Assembling Master Timeline...");
  const listFile = join(SEGMENTS_DIR, "concat_list.txt");
  const listContent = segmentFiles.map((f) => `file '${f}'`).join("\n");
  await Bun.write(listFile, listContent);

  // 4. Generate Ambient Background Music Bed (Subtle harmonic synth pad)
  console.log("🎵 Synthesizing Ambient Soundbed...");
  const totalDuration = currentTime + 3;
  const musicPath = join(AUDIO_DIR, "ambient_bed.mp3");
  const synthCmd = `"${FFMPEG}" -y -f lavfi -i "aevalsrc=sin(130.81*2*PI*t)*0.015 + sin(196*2*PI*t)*0.012 + sin(261.63*2*PI*t)*0.015 + sin(329.63*2*PI*t)*0.01:s=48000:d=${totalDuration.toFixed(1)}" -af "lowpass=f=700,tremolo=f=0.15:d=0.35,aecho=0.8:0.7:60|120:0.3|0.2,volume=0.30,afade=t=in:ss=0:d=2,afade=t=out:st=${(totalDuration - 3).toFixed(1)}:d=3" "${musicPath}" 2>/dev/null`;
  Sys.exec(synthCmd);

  // 5. Final Concat & Audio Mixing
  console.log("🎬 Rendering Master 1080p MP4 with Audio Mix...");
  const tempMerged = join(SEGMENTS_DIR, "merged_video.mp4");
  Sys.exec(`"${FFMPEG}" -y -f concat -safe 0 -i "${listFile}" -c copy "${tempMerged}" 2>/dev/null`);

  // Mix merged video with ambient music
  const finalCmd = `"${FFMPEG}" -y -i "${tempMerged}" -i "${musicPath}" -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=1.0 0.09[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 256k -movflags +faststart "${FINAL_VIDEO}" 2>/dev/null`;
  Sys.exec(finalCmd);

  const finalSize = (Bun.file(FINAL_VIDEO).size / (1024 * 1024)).toFixed(2);
  console.log(`\n✨ ========================================================================`);
  console.log(`🎉 Master Video Successfully Rendered!`);
  console.log(`📁 File: ${FINAL_VIDEO} (${finalSize} MB)`);
  console.log(`⏱️ Duration: ${Math.floor(currentTime / 60)}m ${Math.floor(currentTime % 60)}s`);
  console.log(`✨ ========================================================================\n`);

  // 6. Write YouTube Release Kit Markdown with Exact Clickable Timestamps
  console.log("📝 Generating YouTube Publishing Kit...");
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const timestamps = chaptersList.map((c) => `${formatTime(c.time)} ${c.title}`).join("\n");

  const releaseKitContent = `# 🎬 Codecaine File Manager — Official YouTube Release Kit

## 🏆 Top 5 High-CTR YouTube Video Titles
1. **The File Manager That Replaced 10 Apps (Cross-Platform & 100% Private)**
2. **Codecaine File Manager: The Ultimate Developer Workstation (Built on Bun 1.4.2)**
3. **Why This Free Open-Source File Manager Destroys Default Explorer & Finder**
4. **Dual-Pane, Embedded Databases, Terminal & Encryption: Codecaine File Manager**
5. **I Built The Ultimate Developer File Manager in Bun (And It's Insane)**

---

## 📋 Full YouTube Video Description (Copy & Paste Ready)

Discover **Codecaine File Manager**, the all-in-one developer workstation and file manager built with speed, safety, and privacy in mind. Running natively on macOS, Windows, and Linux powered by the high-performance **Bun runtime (v1.4.2)**, Codecaine File Manager combines dual-pane productivity with built-in converter suites, database hubs, code editors, encrypted vaults, and live servers.

⭐ **Star the Project on GitHub**: https://github.com/codecaine-zz/bun_rad_studio
📖 **Documentation**: https://github.com/codecaine-zz/bun_rad_studio/tree/main/docs

---

### ⏱️ Video Chapters & Timestamps
${timestamps}

---

### ⚡ Key Features Highlighted
- 🚀 **Built on Bun v1.4.2**: Blazing fast runtime with instant startup and zero lag across macOS, Windows, and Linux.
- 🪟 **First-Time Windows Setup**: Simple \`bun install\` with automatic Microsoft Edge WebView2 runtime detection and patching.
- 🗂️ **Dual-Pane Productivity**: Side-by-side folder navigation with F5/F6 copy/move and collision protection.
- 💻 **Built-In Code Studio**: In-app multi-tab code editor with syntax highlighting, autocomplete, run presets, and V-Lang formatting.
- 🗄️ **Database Studio Hub**: Zero-config embedded SQLite Studio Pro, MySQL, PostgreSQL, and Redis studios with live table grids and query runners.
- 🔒 **Secrets & Encrypted Vaults**: Password manager, secure notes, TOTP 2FA authenticator, and Argon2id + AES-256-GCM file vaults.
- 📊 **Developer Suite (Dev Tab)**: Tokei lines of code counter across 100+ languages, Git commit insights, and disk bloat analyzer.
- 🌐 **Live Web & PHP Development Server**: Zero-config static HTTP server with live reload on file save, plus PHP server with streaming request logs.
- 🔄 **Universal Batch Converter**: Batch convert Audio (FFmpeg), Video (H.264/VP9/GIF), Images (ImageMagick), Documents (Pandoc), Data (JSON ⇄ YAML ⇄ TOML ⇄ CSV ⇄ TSV ⇄ XML), Zstandard (.zst), and OCR (Tesseract).
- 🛡️ **Zero-Data-Loss Safety Shield**: Recycle Bin + Rip Graveyard quarantine with one-touch Ctrl+Z undo and repairable manifests.
- 🎨 **135+ Gorgeous Themes**: Codefreelance, Cyberpunk, Apple Sonoma, Retro Win95/C64, and custom Live Theme Editor.

---

### 🚀 Quick Start / Installation

#### Windows 10/11:
\`\`\`powershell
# 1. Clone repository
git clone https://github.com/codecaine-zz/bun_rad_studio.git
cd bun_rad_studio

# 2. Install dependencies (auto-patches Edge WebView2 runtime)
bun install

# 3. Launch Codecaine File Manager
powershell -ExecutionPolicy Bypass -File .\\run.ps1
# Or launch directly:
bun run app:files
\`\`\`

#### macOS & Linux:
\`\`\`bash
# 1. Clone repository
git clone https://github.com/codecaine-zz/bun_rad_studio.git
cd bun_rad_studio

# 2. Install & Launch
bun install
bun run app:files
\`\`\`

---

### 🏷️ YouTube Search Tags & Keywords
\`\`\`
codecaine file manager, bun 1.4.2, bun rad studio, developer workstation, file manager macos, file manager windows, dual pane file manager, open source file manager, bun runtime, sqlite studio, postgres studio, developer productivity tools, privacy file manager, ffmpeg batch converter, argon2id vault, tokei lines of code, subfinder recon, linux file manager, windows file manager
\`\`\`

---

### 🎥 ScreenFlow Production Stems & Assets
If you want to edit or customize this video further inside **ScreenFlow**:
- **Master Render**: \`youtube_production/codecaine_file_manager_youtube_demo.mp4\`
- **High-Res Thumbnail**: \`youtube_production/youtube_thumbnail.png\` (1280x720)
- **Live Screen Recordings** (real mouse/keyboard action, no HUD): \`youtube_production/live/live_*.mp4\`
- **1080p Video Segments**: \`youtube_production/segments/seg_*.mp4\`
- **Neural AI Voiceover Tracks**: \`youtube_production/audio/narration_*.mp3\`
- **Ambient Soundtrack**: \`youtube_production/audio/ambient_bed.mp3\`
- **Glassmorphic Overlays**: \`youtube_production/assets/overlay_*.png\`
`;

  await Bun.write(RELEASE_KIT, releaseKitContent);
  console.log("✔ YOUTUBE_RELEASE_KIT.md updated successfully!");
}

main().catch(console.error);
