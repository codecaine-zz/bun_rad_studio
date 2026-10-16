// Shared pieces for building a narrated video from scenes: the voice (Gemini TTS when a key is set, Edge neural
// otherwise, with a cache so rebuilds never pay twice), title cards, the on-screen title bar, and final assembly.
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

export const FFMPEG = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
export const FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
export const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UVX = "/Users/codecaine/.local/bin/uvx";

// TTS_ENGINE=edge (what the tutorial scripts set) ignores any Gemini key, so a video is never narrated by two voices.
export const GEMINI_KEY = process.env.TTS_ENGINE === "edge" ? "" : (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "");
export const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
/** Speed-up applied to a Gemini narration afterwards (1 = as spoken). Gemini voices read slowly, so the default is a little faster. */
export const TTS_TEMPO = Number(process.env.TTS_TEMPO ?? "1.12");
export const GEMINI_VOICE = process.env.GEMINI_TTS_VOICE ?? "Kore";
export const EDGE_VOICE = process.env.EDGE_TTS_VOICE ?? "en-US-AndrewMultilingualNeural";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function sh(cmd: string[], opts: { cwd?: string; quiet?: boolean } = {}): string {
  const r = Bun.spawnSync(cmd, { cwd: opts.cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0 && !opts.quiet) throw new Error(`${cmd[0]} failed (${r.exitCode}): ${r.stderr.toString().slice(-400)}`);
  return r.stdout.toString();
}

export function durationOf(file: string): number {
  return parseFloat(sh([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { quiet: true }).trim()) || 0;
}

/** Spells out tokens a voice tends to read badly (names, acronyms, commands). */
export function spokenText(text: string): string {
  return text
    .replace(/\bBun RAD Studio\b/g, "Bun RAD Studio")
    .replace(/\bRAD\b/g, "rad")
    .replace(/Codecaine/g, "Code caine")
    .replace(/\bmacOS\b/g, "mac O S")
    .replace(/\bSQLite\b/g, "sequel-lite")
    .replace(/\bMySQL\b/g, "my S Q L")
    .replace(/\bPostgreSQL\b/g, "Postgres Q L")
    .replace(/\bSQL\b/g, "sequel")
    .replace(/\bCLI\b/g, "C L I")
    .replace(/\bGUI\b/g, "G U I")
    .replace(/\bAPI\b/g, "A P I")
    .replace(/\bJSON\b/g, "jason")
    .replace(/\bCSS\b/g, "C S S")
    .replace(/\bHTML\b/g, "H T M L")
    .replace(/\bJWT\b/g, "J W T")
    .replace(/\bDNS\b/g, "D N S")
    .replace(/\bIDE\b/g, "I D E")
    .replace(/\bTS\b/g, "type script")
    .replace(/\bURL\b/g, "U R L")
    .replace(/\bPHP\b/g, "P H P")
    .replace(/\bCIDR\b/g, "C I D R")
    .replace(/\bTOTP\b/g, "T O T P")
    .replace(/AES-256-GCM/g, "A E S 256 G C M")
    .replace(/\bSHA-256\b/g, "SHA 256")
    .replace(/\bUI\b/g, "U I")
    .replace(/\bWebView2\b/g, "Web View 2")
    .replace(/\bGitHub\b/g, "Git Hub")
    .replace(/(\d+)\+/g, "$1 plus")
    .replace(/\bx64\b/g, "x sixty four")
    .replace(/\barm64\b/g, "arm sixty four");
}

async function gemini(text: string, out: string): Promise<boolean> {
  if (!GEMINI_KEY) return false;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: `Read this as a friendly, upbeat, clear YouTube tutorial narrator at a brisk, energetic conversational pace (never drawn out), with only short natural pauses between sentences:\n\n${text}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } } },
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_KEY }, body: JSON.stringify(body) });
      if (!res.ok) {
        console.warn(`    ⚠ Gemini TTS HTTP ${res.status}`);
        if ([400, 401, 403, 404].includes(res.status)) return false;
        await sleep(res.status === 429 ? 25000 : 4000);
        continue;
      }
      const json: any = await res.json();
      const b64 = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!b64) continue;
      const pcm = out.replace(/\.mp3$/, ".pcm");
      await Bun.write(pcm, Buffer.from(b64, "base64"));
      // ffmpeg's mp3 encoder now and then fails on a perfectly good file; the same input works when tried again.
      for (let t = 0; t < 4; t++) {
        const r = Bun.spawnSync([FFMPEG, "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", pcm, "-c:a", "libmp3lame", "-q:a", "2", out], { stdout: "ignore", stderr: "ignore" });
        if (r.exitCode === 0 && existsSync(out)) return true;
        await sleep(500);
      }
      continue;
    } catch (e) {
      console.warn(`    ⚠ Gemini TTS: ${e}`);
      await sleep(2000);
    }
  }
  return false;
}

function edge(text: string, out: string, dir: string, rate: string, gapSeconds: number): void {
  const parts = (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []).map((x) => x.trim()).filter(Boolean);
  const gap = join(dir, "gap.wav");
  sh([FFMPEG, "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(gapSeconds), gap], { quiet: true });
  const lines: string[] = [];
  parts.forEach((p, i) => {
    const mp3 = join(dir, `${i}.mp3`);
    const wav = join(dir, `${i}.wav`);
    let ok = false;
    for (let a = 0; a < 4 && !ok; a++) {
      const r = Bun.spawnSync([UVX, "edge-tts", "--voice", EDGE_VOICE, `--rate=${rate}`, "--text", p, "--write-media", mp3], { stdout: "ignore", stderr: "ignore" });
      ok = r.exitCode === 0 && existsSync(mp3) && Bun.file(mp3).size > 1000;
    }
    if (!ok) throw new Error(`edge-tts failed: ${p}`);
    sh([FFMPEG, "-y", "-i", mp3, "-ar", "24000", "-ac", "1", wav]);
    lines.push(`file '${wav}'`);
    if (i < parts.length - 1) lines.push(`file '${gap}'`);
  });
  writeFileSync(join(dir, "list.txt"), lines.join("\n"));
  sh([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-c:a", "libmp3lame", "-q:a", "2", out]);
}

/**
 * The narration for one scene, post-processed (EQ, level) with a little lead-in and tail. Cached by a hash of the
 * text and the voice: unchanged scenes are never synthesized (and never billed) again.
 */
export async function narrate(id: string, narration: string, audioDir: string, opts: { rate?: string; gap?: number } = {}): Promise<string> {
  const rate = opts.rate ?? "-4%";
  const gap = opts.gap ?? 0.42;
  mkdirSync(audioDir, { recursive: true });
  const raw = join(audioDir, `raw_${id}.mp3`);
  const final = join(audioDir, `narration_${id}.mp3`);
  const keyFile = `${raw}.key`;
  const text = spokenText(narration);
  const key = createHash("sha1").update(`${GEMINI_KEY ? `gemini:${GEMINI_MODEL}:${GEMINI_VOICE}:${TTS_TEMPO}:brisk` : `edge:${EDGE_VOICE}${rate === "-4%" && gap === 0.42 ? "" : `:${rate}:${gap}`}`}|${text}`).digest("hex");
  const cached = existsSync(raw) && existsSync(final) && existsSync(keyFile) && readFileSync(keyFile, "utf8") === key;
  if (!cached) {
    if (!(await gemini(text, raw))) {
      // A narrator that changes voice half way through a video is worse than a stopped build, so a chosen voice can forbid the fallback.
      if (GEMINI_KEY && process.env.TTS_STRICT === "1") throw new Error(`Gemini voice ${GEMINI_VOICE} failed for ${id}; not falling back to Edge (TTS_STRICT=1). Re-run "audio" later: finished scenes are cached.`);
      const work = join(audioDir, `_edge_${id}`);
      mkdirSync(work, { recursive: true });
      edge(text, raw, work, rate, gap);
    }
    // Speeding up in the same ffmpeg run as the encoder can make some clips fail, so it is a step of its own.
    let source = raw;
    if (GEMINI_KEY && TTS_TEMPO !== 1) {
      source = `${raw}.tempo.wav`;
      sh([FFMPEG, "-y", "-i", raw, "-af", `atempo=${TTS_TEMPO}`, "-ar", "24000", source], { quiet: true });
    }
    // The filters write plain audio first: ffmpeg's mp3 encoder rejects some filtered clips when fed straight from the chain.
    const polished = `${raw}.polished.wav`;
    sh([FFMPEG, "-y", "-i", source, "-af", "highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=20:release=250,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,adelay=350|350,apad=pad_dur=0.75", "-ar", "48000", polished], { quiet: true });
    sh([FFMPEG, "-y", "-i", polished, "-c:a", "libmp3lame", "-q:a", "2", final]);
    rmSync(polished, { force: true });
    if (source !== raw) rmSync(source, { force: true });
    writeFileSync(keyFile, key);
  }
  return final;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The glass bar shown at the bottom of a recorded scene: chapter, title and a short list of what is on screen. */
export function overlayHtml(chapter: string, title: string, bullets: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1920px;height:1080px;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;position:relative;overflow:hidden}
.hud{position:absolute;bottom:30px;left:45px;right:45px;background:rgba(15,23,42,.9);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:15px 26px;display:flex;justify-content:space-between;align-items:center;gap:24px;box-shadow:0 20px 50px rgba(0,0,0,.7),0 0 30px rgba(99,102,241,.2)}
.left{display:flex;align-items:center;gap:18px;min-width:0}
.badge{flex:none;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-weight:800;font-size:14px;letter-spacing:.08em;padding:6px 14px;border-radius:10px;text-transform:uppercase}
.title{color:#fff;font-size:24px;font-weight:800;letter-spacing:-.01em;white-space:nowrap}
.bullets{color:#38bdf8;font-size:16px;font-weight:600;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.3);padding:8px 18px;border-radius:12px;text-align:right}
</style></head><body><div class="hud"><div class="left"><div class="badge">${esc(chapter)}</div><div class="title">${esc(title)}</div></div><div class="bullets">${esc(bullets)}</div></div></body></html>`;
}

/** A full-screen title card (intro, chapter break, outro). */
export function cardHtml(kicker: string, title: string, lines: string[], accent = "#6366f1"): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1920px;height:1080px;overflow:hidden;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
background:radial-gradient(1300px 800px at 15% 0%,${accent}66,transparent),radial-gradient(1100px 800px at 100% 100%,#0e7490aa,transparent),#0b1020;
display:flex;flex-direction:column;justify-content:center;padding:0 150px;gap:26px}
.k{font-size:30px;font-weight:800;letter-spacing:.2em;color:#93c5fd;text-transform:uppercase}
h1{font-size:132px;line-height:1.02;font-weight:900;letter-spacing:-.03em;background:linear-gradient(90deg,#fff,#c7d2fe 60%,#7dd3fc);-webkit-background-clip:text;background-clip:text;color:transparent}
p{font-size:44px;color:#cbd5e1;line-height:1.35;max-width:1500px}
.pill{display:inline-block;margin:8px 12px 0 0;padding:10px 24px;border-radius:999px;border:2px solid #38bdf8aa;background:#0ea5e922;font-size:30px;font-weight:700;color:#e0f2fe}
</style></head><body><div class="k">${esc(kicker)}</div><h1>${esc(title)}</h1>${lines.length ? `<div>${lines.map((l) => `<span class="pill">${esc(l)}</span>`).join("")}</div>` : ""}</body></html>`;
}

export function screenshotHtml(html: string, png: string, workDir: string): void {
  mkdirSync(workDir, { recursive: true });
  const f = png.replace(/\.png$/, ".html").replace(/^.*\//, workDir + "/");
  writeFileSync(f, html);
  sh([CHROME, "--headless=new", "--disable-gpu", "--user-data-dir=/tmp/video_pipeline_chrome", "--no-first-run", "--default-background-color=00000000", "--hide-scrollbars", `--screenshot=${png}`, "--window-size=1920,1080", `file://${f}`], { quiet: true });
  if (!existsSync(png)) throw new Error(`could not render ${png}`);
}

export const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
