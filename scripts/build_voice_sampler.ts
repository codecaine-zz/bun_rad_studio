// Voice sampler: every candidate narrator reads the same passage on a numbered title card,
// so you can compare them back to back and pick one. Output: youtube_production/voice_sampler.mp4
//
//   bun scripts/build_voice_sampler.ts            all Gemini voices (needs GEMINI_API_KEY) + Edge neural voices
//   bun scripts/build_voice_sampler.ts --edge     only the free Edge voices
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { Sys } from "../src/simplecli/sys";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "youtube_production", "voice_samples");
const FINAL = join(ROOT, "youtube_production", "voice_sampler.mp4");
const LIST = join(ROOT, "youtube_production", "voice_sampler_voices.md");
const FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UVX = "/Users/codecaine/.local/bin/uvx";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const EDGE_ONLY = process.argv.includes("--edge");

mkdirSync(OUT_DIR, { recursive: true });

const SAMPLE =
  "Welcome to Codecaine File Manager, the next-generation developer workstation built on Bun. " +
  "It is a complete, private, cross-platform power tool for macOS, Windows, and Linux.";
// What the voice is told to say, with pronunciation spelled out the way the real narration does.
const SPOKEN = SAMPLE.replace("macOS", "mac O S").replace("Codecaine", "Code caine");

interface Voice {
  provider: "Google Gemini" | "Microsoft Edge";
  id: string;
  label: string;
  traits: string;
}

const GEMINI_VOICES: [string, string][] = [
  ["Zephyr", "Bright"], ["Puck", "Upbeat"], ["Charon", "Informative"], ["Kore", "Firm"], ["Fenrir", "Excitable"],
  ["Leda", "Youthful"], ["Orus", "Firm"], ["Aoede", "Breezy"], ["Callirrhoe", "Easy-going"], ["Autonoe", "Bright"],
  ["Enceladus", "Breathy"], ["Iapetus", "Clear"], ["Umbriel", "Easy-going"], ["Algieba", "Smooth"], ["Despina", "Smooth"],
  ["Erinome", "Clear"], ["Algenib", "Gravelly"], ["Rasalgethi", "Informative"], ["Laomedeia", "Upbeat"], ["Achernar", "Soft"],
  ["Alnilam", "Firm"], ["Schedar", "Even"], ["Gacrux", "Mature"], ["Pulcherrima", "Forward"], ["Achird", "Friendly"],
  ["Zubenelgenubi", "Casual"], ["Vindemiatrix", "Gentle"], ["Sadachbia", "Lively"], ["Sadaltager", "Knowledgeable"], ["Sulafat", "Warm"],
];

const EDGE_WANTED = [
  "en-US-AndrewMultilingualNeural", "en-US-AvaMultilingualNeural", "en-US-BrianMultilingualNeural", "en-US-EmmaMultilingualNeural",
  "en-US-AndrewNeural", "en-US-AvaNeural", "en-US-BrianNeural", "en-US-EmmaNeural", "en-US-JennyNeural", "en-US-AriaNeural",
  "en-US-GuyNeural", "en-US-ChristopherNeural", "en-US-EricNeural", "en-US-MichelleNeural", "en-US-RogerNeural", "en-US-SteffanNeural",
  "en-GB-RyanNeural", "en-GB-SoniaNeural", "en-GB-LibbyNeural", "en-GB-ThomasNeural", "en-AU-WilliamNeural", "en-AU-NatashaNeural",
];

function edgeVoices(): Voice[] {
  const [table] = Sys.exec(`"${UVX}" edge-tts --list-voices 2>/dev/null`);
  const info = new Map<string, { gender: string; traits: string }>();
  for (const line of table.split("\n")) {
    const m = line.match(/^(\S+)\s+(Male|Female)\s+(.*)$/);
    if (!m) continue;
    const cols = m[3]!.trim().split(/\s{2,}/);
    info.set(m[1]!, { gender: m[2]!, traits: (cols[1] ?? cols[0] ?? "").replace(/\s+/g, " ") });
  }
  return EDGE_WANTED.filter((n) => info.has(n)).map((n) => {
    const i = info.get(n)!;
    const short = n.replace(/^en-/, "").replace(/Neural$/, "").replace("Multilingual", " Multilingual").replace("-", " · ");
    return { provider: "Microsoft Edge", id: n, label: short, traits: `${i.gender} · ${i.traits}` };
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function geminiSample(v: Voice, out: string): Promise<boolean> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: `Read this as a warm, natural, conversational YouTube narrator, with relaxed pacing:\n\n${SPOKEN}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.id } } } },
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY }, body: JSON.stringify(body) });
      if (!res.ok) {
        console.warn(`    ⚠ ${v.id}: HTTP ${res.status}`);
        if ([400, 401, 403, 404].includes(res.status)) return false;
        await sleep(res.status === 429 ? 25000 : 3000);
        continue;
      }
      const json: any = await res.json();
      const b64 = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!b64) continue;
      const pcm = out.replace(/\.mp3$/, ".pcm");
      await Bun.write(pcm, Buffer.from(b64, "base64"));
      Sys.exec(`"${FFMPEG}" -y -f s16le -ar 24000 -ac 1 -i "${pcm}" -c:a libmp3lame -q:a 2 "${out}" 2>/dev/null`);
      return existsSync(out);
    } catch (e) {
      console.warn(`    ⚠ ${v.id}: ${e}`);
    }
  }
  return false;
}

function edgeSample(v: Voice, out: string): boolean {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = Bun.spawnSync([UVX, "edge-tts", "--voice", v.id, "--rate=-4%", "--text", SPOKEN, "--write-media", out], { stdout: "ignore", stderr: "ignore" });
    if (r.exitCode === 0 && existsSync(out) && Bun.file(out).size > 1000) return true;
  }
  return false;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function cardHtml(n: number, total: number, v: Voice): string {
  const gem = v.provider === "Google Gemini";
  const accent = gem ? "#a855f7" : "#38bdf8";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1920px;height:1080px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#fff;
    background:radial-gradient(1200px 700px at 20% 10%,rgba(99,102,241,.35),transparent),radial-gradient(1000px 700px at 90% 90%,${accent}44,transparent),#0b1020;position:relative}
  .num{position:absolute;left:110px;top:90px;font-size:44px;font-weight:700;letter-spacing:.08em;color:#94a3b8}
  .num b{color:#fff}
  .badge{position:absolute;right:110px;top:84px;font-size:30px;font-weight:800;padding:12px 28px;border-radius:999px;background:${accent}33;border:2px solid ${accent};color:#fff}
  .big{position:absolute;left:110px;top:280px;font-size:300px;font-weight:900;letter-spacing:-.04em;line-height:1;
    background:linear-gradient(135deg,#fff,${accent});-webkit-background-clip:text;color:transparent}
  .name{position:absolute;left:110px;top:620px;font-size:112px;font-weight:800;letter-spacing:-.02em}
  .traits{position:absolute;left:110px;top:770px;font-size:46px;font-weight:600;color:${accent}}
  .id{position:absolute;left:110px;top:840px;font-size:28px;font-family:ui-monospace,Menlo,monospace;color:#64748b}
  .cap{position:absolute;left:110px;right:110px;bottom:70px;font-size:30px;line-height:1.45;color:#cbd5e1;border-left:6px solid ${accent};padding-left:28px}
  </style></head><body>
  <div class="num">VOICE <b>${n}</b> / ${total}</div><div class="badge">${esc(v.provider)}</div>
  <div class="big">${String(n).padStart(2, "0")}</div>
  <div class="name">${esc(v.label)}</div><div class="traits">${esc(v.traits)}</div><div class="id">${esc(v.id)}</div>
  <div class="cap">${esc(SAMPLE)}</div></body></html>`;
}

function titleHtml(lines: string[]): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}body{width:1920px;height:1080px;background:#0b1020;color:#fff;font-family:-apple-system,Helvetica,Arial,sans-serif;
  display:flex;flex-direction:column;justify-content:center;padding:0 160px;gap:22px}
  h1{font-size:110px;font-weight:900}p{font-size:42px;color:#94a3b8;line-height:1.4}</style></head><body>${lines.map((l, i) => (i === 0 ? `<h1>${esc(l)}</h1>` : `<p>${esc(l)}</p>`)).join("")}</body></html>`;
}

async function renderCard(html: string, png: string) {
  const htmlPath = png.replace(/\.png$/, ".html");
  await Bun.write(htmlPath, html);
  Sys.exec(`"${CHROME}" --headless --disable-gpu --user-data-dir=/tmp/voice_sampler_chrome --no-first-run --screenshot="${png}" --window-size=1920,1080 "file://${htmlPath}" 2>/dev/null`);
  if (!existsSync(png)) throw new Error(`card render failed: ${png}`);
}

const dur = (f: string) => parseFloat(Sys.exec(`"${FFPROBE}" -v error -show_entries format=duration -of csv=p=0 "${f}"`)[0].trim()) || 8;

async function main() {
  const voices: Voice[] = [];
  if (!EDGE_ONLY && GEMINI_KEY) GEMINI_VOICES.forEach(([id, t]) => voices.push({ provider: "Google Gemini", id, label: id, traits: t }));
  else if (!EDGE_ONLY) console.warn("No GEMINI_API_KEY found: sampling the Edge voices only.");
  voices.push(...edgeVoices());
  console.log(`🎙️ Sampling ${voices.length} voices`);

  const segs: string[] = [];
  const kept: { v: Voice; start: number }[] = [];
  let t = 0;

  const intro = join(OUT_DIR, "intro.png");
  await renderCard(titleHtml(["Voice Sampler", `${voices.length} narrator voices read the same passage. Note the number of the one you like best.`, "Google Gemini voices first, then Microsoft Edge neural voices."]), intro);
  const introSeg = join(OUT_DIR, "seg_intro.mp4");
  Sys.exec(`"${FFMPEG}" -y -loop 1 -i "${intro}" -f lavfi -i anullsrc=r=48000:cl=mono -c:v libx264 -tune stillimage -pix_fmt yuv420p -c:a aac -t 5 -r 30 "${introSeg}" 2>/dev/null`);
  segs.push(introSeg);
  t += 5;

  for (let i = 0; i < voices.length; i++) {
    const v = voices[i]!;
    const n = i + 1;
    const safe = v.id.replace(/[^\w-]/g, "_");
    const mp3 = join(OUT_DIR, `${safe}.mp3`);
    console.log(`[${n}/${voices.length}] ${v.provider}: ${v.label}`);
    if (!(existsSync(mp3) && Bun.file(mp3).size > 1000)) {
      const ok = v.provider === "Google Gemini" ? await geminiSample(v, mp3) : edgeSample(v, mp3);
      if (!ok) { console.warn(`    ✗ skipped ${v.id}`); continue; }
    }
    const padded = join(OUT_DIR, `${safe}_pad.wav`);
    Sys.exec(`"${FFMPEG}" -y -i "${mp3}" -af "loudnorm=I=-16:TP=-1.5:LRA=11,adelay=500|500,apad=pad_dur=1.0" -ar 48000 -ac 1 "${padded}" 2>/dev/null`);
    const png = join(OUT_DIR, `${safe}.png`);
    await renderCard(cardHtml(kept.length + 1, voices.length, v), png);
    const seg = join(OUT_DIR, `seg_${safe}.mp4`);
    const d = dur(padded);
    Sys.exec(`"${FFMPEG}" -y -loop 1 -i "${png}" -i "${padded}" -filter_complex "[1:a]showwaves=s=1700x120:mode=cline:colors=white@0.9:rate=30,format=yuva420p[w];[0:v][w]overlay=110:830:shortest=1,format=yuv420p[v]" -map "[v]" -map 1:a -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 192k -t ${d.toFixed(3)} -r 30 "${seg}" 2>/dev/null`);
    if (!existsSync(seg)) { console.warn(`    ✗ encode failed ${v.id}`); continue; }
    kept.push({ v, start: t });
    segs.push(seg);
    t += d;
  }

  const listFile = join(OUT_DIR, "concat.txt");
  writeFileSync(listFile, segs.map((s) => `file '${s}'`).join("\n"));
  Sys.exec(`"${FFMPEG}" -y -f concat -safe 0 -i "${listFile}" -c copy -movflags +faststart "${FINAL}" 2>/dev/null`);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const md = [
    "# Voice sampler: pick a narrator",
    "",
    `Everyone reads: "${SAMPLE}"`,
    "",
    "| # | Time | Provider | Voice | Style |",
    "|---|------|----------|-------|-------|",
    ...kept.map((k, i) => `| ${i + 1} | ${fmt(k.start)} | ${k.v.provider} | \`${k.v.id}\` | ${k.v.traits} |`),
    "",
    "Use a Gemini voice: `GEMINI_TTS_VOICE=<name> bun scripts/build_full_youtube_video.ts`",
    "Use an Edge voice: remove GEMINI_API_KEY from the environment and set `VOICE` in scripts/build_full_youtube_video.ts.",
    "",
  ].join("\n");
  writeFileSync(LIST, md);
  console.log(`\n🎉 ${FINAL}\n📋 ${LIST}\n⏱️ ${fmt(t)} · ${kept.length} voices`);
}

main().catch((e) => { console.error(e); process.exit(1); });
