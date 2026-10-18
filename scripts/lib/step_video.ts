// A step-by-step tutorial video engine: every step is "say this" plus "do this" in a real program driven through Chrome.
// The voice starts, the action starts a moment later, and the step ends when both are finished. The recording is
// 1920x972 and sits above its own caption strip, so nothing is ever drawn over the program.
//   <script> list | audio [--shard i/n] | record [ids,...] | build | all
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { Cdp, sleep } from "./cdp_recorder";
import { FFMPEG, cardHtml, durationOf, fmtTime, narrate, screenshotHtml, sh } from "./video_pipeline";
import type { Chapter, Step, World } from "./fm_tutorial_types";

export interface Suite {
  /** Folder and file names under youtube_production/. */
  name: string;
  chapters: Chapter[];
  /** A fresh throwaway world for a chapter. */
  seedWorld(): World;
  /** Starts the program for a chapter and shows it in the browser. */
  open(ch: Chapter, world: World): Promise<void>;
  /** Starts Chrome (and anything else) before recording; the browser it drives. */
  start(): Promise<void>;
  stop(): void;
  cdp(): Cdp;
  /** The notes file (title, description, chapters). */
  notes(marks: Array<{ at: number; title: string }>, total: number): string;
  rate?: string;
  gap?: number;
  viewHeight?: number;
}

/** The helpers a step's action can use. Anything that can't find what it was told to click stops the recording. */
export interface Do {
  c: Cdp;
  world: World;
  click(selector: string, opts?: { ms?: number; pause?: number; dx?: number; dy?: number }): Promise<void>;
  dblclick(selector: string, opts?: { ms?: number; pause?: number }): Promise<void>;
  rclick(selector: string, opts?: { ms?: number; pause?: number }): Promise<void>;
  hover(selector: string, ms?: number): Promise<void>;
  type(text: string, perChar?: number): Promise<void>;
  key(combo: string, label?: string): Promise<void>;
  scroll(selector: string, dy: number, steps?: number): Promise<void>;
  wait(ms: number): Promise<void>;
  waitFor(selector: string, ms?: number): Promise<void>;
  /** Clicks an item of the right-click or other menu that is open. */
  menu(text: string, opts?: { pause?: number }): Promise<void>;
  /** Clicks a file or folder row in the open list by (part of) its name. */
  row(name: string, how?: "click" | "dblclick" | "rclick" | "hover", opts?: { pause?: number; extend?: "ctrl" | "shift" }): Promise<void>;
  /** Clicks a button of the open dialog by its text. */
  dialog(text: string, opts?: { pause?: number }): Promise<void>;
  eval<T = any>(expr: string): Promise<T>;
}


export async function runTutorial(S: Suite, argv: string[]) {
const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const OUT = join(PROD, `${S.name}_tutorial`);
const AUDIO = join(OUT, "audio");
const LIVE = join(OUT, "live");
const SEG = join(OUT, "segments");
const ASSETS = join(OUT, "assets");
const TIMELINES = join(OUT, "timelines");
const FINAL = join(PROD, `${S.name}_tutorial.mp4`);
const NOTES = join(PROD, `${S.name.toUpperCase()}_TUTORIAL_NOTES.md`);
const RATE = S.rate ?? "+8%";
const GAP = S.gap ?? 0.4;
const VIEW_H = S.viewHeight ?? 972;
const chapters = S.chapters;
const stepId = (ch: Chapter, i: number) => `${ch.id}_${String(i).padStart(2, "0")}`;

/* ------------------------------------------------------------------------------------------------ audio */

interface Spoken { file: string; seconds: number }

async function makeAudio(shard: [number, number] | null) {
  mkdirSync(AUDIO, { recursive: true });
  let n = 0;
  for (const ch of chapters) {
    for (let i = 0; i < ch.steps.length; i++) {
      if (shard && n++ % shard[1] !== shard[0]) continue;
      const id = stepId(ch, i);
      const t0 = performance.now();
      const file = await narrate(id, ch.steps[i]!.say, AUDIO, { rate: RATE, gap: GAP });
      console.log(`  ♪ ${id}  ${durationOf(file).toFixed(1)}s  (${((performance.now() - t0) / 1000).toFixed(1)}s to make)`);
    }
  }
}

function spoken(ch: Chapter, i: number): Spoken {
  const file = join(AUDIO, `narration_${stepId(ch, i)}.mp3`);
  if (!existsSync(file)) throw new Error(`no narration for ${stepId(ch, i)}: run "audio" first`);
  return { file, seconds: durationOf(file) };
}

/* ------------------------------------------------------------------------------------------------ recording */

interface StepTime { start: number; end: number; cap: string }
interface Timeline { id: string; chapter: string; title: string; clip: string; steps: StepTime[]; seconds: number }

function makeDo(c: Cdp, world: World): Do {
  const need = async (ok: boolean, what: string) => { if (!ok) throw new Error(`could not find ${what}`); };
  const self: Do = {
    c, world,
    click: async (s, o) => need(await c.click(s, o), s),
    dblclick: async (s, o) => need(await c.dblclick(s, o), s),
    rclick: async (s, o) => need(await c.rclick(s, o), s),
    hover: async (s, ms) => { await need(await c.exists(s), s); await c.hover(s, ms); },
    type: (t, per) => c.type(t, per),
    key: (k, l) => c.key(k, l),
    scroll: (s, dy, steps) => c.scroll(s, dy, steps),
    wait: (ms) => sleep(ms),
    waitFor: async (s, ms) => need(await c.waitFor(s, ms ?? 8000), s),
    menu: (t, o) => self.click(`.menu [role^=menuitem] >> ${t}`, { pause: o?.pause ?? 700 }),
    row: async (name, how = "click", o) => {
      const sel = `#list .row >> ${name}`;
      if (o?.extend) {
        const r = await c.rect(sel);
        if (!r) throw new Error(`could not find row ${name}`);
        await c.moveTo(r.x, r.y, 600);
        await c.eval(`window.__cc.ripple(${r.x}, ${r.y})`);
        const mod = o.extend === "ctrl" ? 4 : 8; // the page runs as macOS: Command toggles, Shift extends
        await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", buttons: 1, clickCount: 1, modifiers: mod });
        await sleep(60);
        await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", buttons: 0, clickCount: 1, modifiers: mod });
        await sleep(o.pause ?? 500);
        return;
      }
      if (how === "hover") return self.hover(sel, 600);
      return self[how](sel, { pause: o?.pause });
    },
    dialog: (t, o) => self.click(`.dialog button >> ${t}`, { pause: o?.pause ?? 800 }),
    eval: (e) => c.eval(e),
  };
  return self;
}

async function runStep(d: Do, step: Step, spokenSeconds: number): Promise<void> {
  const lead = step.lead ?? 900;
  const talk = sleep(spokenSeconds * 1000);
  const act = (async () => { if (step.act) { await sleep(lead); await step.act(d); } })();
  await Promise.all([talk, act]);
  await sleep(step.hold ?? 500);
}

async function recordChapter(ch: Chapter) {
  console.log(`\n● ${ch.id}  ${ch.title}`);
  if (ch.kind === "external") { console.log("  (joined from another tutorial when building)"); return; }
  if (ch.kind === "card") { writeTimeline(ch, null, ch.steps.map((s, i) => ({ start: 0, end: spoken(ch, i).seconds + 0.5, cap: s.cap })), 0); return; }
  const world = S.seedWorld();
  ch.setup?.(world);
  await S.open(ch, world);
  const d = makeDo(S.cdp(), world);
  if (ch.before) await ch.before(d);
  await S.cdp().startRecording();
  const t0 = performance.now();
  const steps: StepTime[] = [];
  try {
    for (let i = 0; i < ch.steps.length; i++) {
      const step = ch.steps[i]!;
      const sp = spoken(ch, i);
      const start = (performance.now() - t0) / 1000;
      console.log(`  ${String(i).padStart(2, "0")} ${sp.seconds.toFixed(1)}s  ${step.cap}`);
      await runStep(d, step, sp.seconds);
      steps.push({ start, end: (performance.now() - t0) / 1000, cap: step.cap });
    }
  } catch (e) {
    try { await S.cdp().screenshot(join(OUT, `${ch.id}.failed.png`)); } catch {}
    try { await S.cdp().stopRecording(join(LIVE, `${ch.id}.failed.mp4`), join(OUT, "frames_tmp"), 1); } catch {}
    throw e;
  }
  const seconds = steps.at(-1)!.end;
  mkdirSync(LIVE, { recursive: true });
  const clip = join(LIVE, `${ch.id}.mp4`);
  const r = await S.cdp().stopRecording(clip, join(OUT, "frames_tmp"), seconds);
  console.log(`  ✓ ${seconds.toFixed(1)}s, ${r.frames} frames${r.speed > 1 ? `, sped up ${r.speed.toFixed(2)}x` : ""}`);
  writeTimeline(ch, clip, steps, seconds);
}

function writeTimeline(ch: Chapter, clip: string | null, steps: StepTime[], seconds: number) {
  mkdirSync(TIMELINES, { recursive: true });
  const t: Timeline = { id: ch.id, chapter: ch.chapter, title: ch.title, clip: clip ?? "", steps, seconds };
  writeFileSync(join(TIMELINES, `${ch.id}.json`), JSON.stringify(t, null, 2));
}

/* ------------------------------------------------------------------------------------------------ assembling */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The caption strip: its own 108 pixel band under the recording. Nothing is drawn over the program. */
function stripHtml(chapter: string, title: string, caption: string, n: number, of: number): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1920px;height:1080px;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;position:relative;overflow:hidden}
.strip{position:absolute;left:0;right:0;bottom:0;height:${1080 - VIEW_H}px;background:linear-gradient(180deg,#111a33,#0b1020);border-top:3px solid #6366f1;display:flex;align-items:center;gap:28px;padding:0 44px}
.badge{flex:none;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-weight:800;font-size:17px;letter-spacing:.09em;padding:8px 16px;border-radius:10px;text-transform:uppercase}
.col{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.title{color:#94a3b8;font-size:20px;font-weight:700;letter-spacing:.01em}
.cap{color:#fff;font-size:34px;font-weight:700;letter-spacing:-.01em;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.n{flex:none;color:#38bdf8;font-size:20px;font-weight:700;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.3);padding:8px 16px;border-radius:12px}
</style></head><body><div class="strip"><div class="badge">${esc(chapter)}</div><div class="col"><div class="title">${esc(title)}</div><div class="cap">${esc(caption)}</div></div><div class="n">Step ${n} of ${of}</div></div></body></html>`;
}

function stripPng(chapter: string, title: string, caption: string, n: number, of: number): string {
  const key = createHash("sha1").update(`${chapter}|${title}|${caption}|${n}|${of}|v3`).digest("hex").slice(0, 16);
  const png = join(ASSETS, `strip_${key}.png`);
  if (!existsSync(png)) screenshotHtml(stripHtml(chapter, title, caption, n, of), png, ASSETS);
  return png;
}

function buildChapter(ch: Chapter, tl: Timeline): string {
  mkdirSync(SEG, { recursive: true });
  mkdirSync(ASSETS, { recursive: true });
  const out = join(SEG, `${ch.id}.mp4`);
  // The narration, one piece per step, each padded to the measured length of its step, then joined.
  const work = join(SEG, `_${ch.id}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const lines: string[] = [];
  tl.steps.forEach((st, i) => {
    const piece = join(work, `a${i}.wav`);
    sh([FFMPEG, "-y", "-i", spoken(ch, i).file, "-af", `apad=pad_dur=${(st.end - st.start + 1).toFixed(3)}`, "-t", (st.end - st.start).toFixed(3), "-ar", "48000", "-ac", "2", piece], { quiet: true });
    lines.push(`file '${piece}'`);
  });
  writeFileSync(join(work, "list.txt"), lines.join("\n"));
  const audio = join(work, "audio.m4a");
  sh([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", join(work, "list.txt"), "-c:a", "aac", "-b:a", "192k", audio], { quiet: true });

  const total = tl.steps.at(-1)!.end;
  if (ch.kind === "card") {
    const png = join(ASSETS, `card_${ch.id}.png`);
    screenshotHtml(cardHtml(ch.card!.kicker, ch.card!.title, ch.card!.lines), png, ASSETS);
    sh([FFMPEG, "-y", "-loop", "1", "-i", png, "-i", audio, "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p", "-t", total.toFixed(3), "-r", "30", out], { quiet: true });
  } else {
    const strips = tl.steps.map((st, i) => ({ png: stripPng(ch.chapter, ch.title, st.cap, i + 1, tl.steps.length), st }));
    const inputs = ["-i", tl.clip, ...strips.flatMap((s) => ["-i", s.png]), "-i", audio];
    let graph = `[0:v]fps=30,pad=1920:1080:0:0:color=0x0b1020[b0]`;
    strips.forEach((s, i) => {
      const t1 = i === 0 ? 0 : s.st.start;
      const t2 = i === strips.length - 1 ? total + 1 : s.st.end;
      graph += `;[b${i}][${i + 1}:v]overlay=0:0:enable='between(t,${t1.toFixed(3)},${t2.toFixed(3)})'[b${i + 1}]`;
    });
    sh([FFMPEG, "-y", ...inputs, "-filter_complex", graph, "-map", `[b${strips.length}]`, "-map", `${strips.length + 1}:a`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-t", total.toFixed(3), out], { quiet: true });
  }
  rmSync(work, { recursive: true, force: true });
  return out;
}

/** A short chapter title between chapters: it is also what YouTube shows as a chapter. */
function chapterCard(ch: Chapter, n: number, of: number): string {
  const out = join(SEG, `${ch.id}_card.mp4`);
  const png = join(ASSETS, `chapter_${ch.id}.png`);
  screenshotHtml(cardHtml(`Chapter ${n} of ${of}`, ch.title, ch.blurb ? [ch.blurb] : []), png, ASSETS);
  sh([FFMPEG, "-y", "-loop", "1", "-i", png, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "192k", "-pix_fmt", "yuv420p", "-t", "3.5", "-r", "30", out], { quiet: true });
  return out;
}

/** The content segments of another finished tutorial, in its own order, without its intro, outro and title cards. */
function externalSegments(ch: Chapter): Array<{ file: string; title: string }> {
  const dir = join(PROD, ch.external!.dir);
  const listFile = join(dir, "segments", "list.txt");
  if (!existsSync(listFile)) throw new Error(`${ch.id}: ${listFile} is missing; build that tutorial first`);
  const files = [...readFileSync(listFile, "utf8").matchAll(/^file '(.+)'$/gm)].map((m) => m[1]!);
  const parts = files.flatMap((file) => {
    const id = file.split("/").pop()!.replace(/\.mp4$/, "");
    const tlFile = join(dir, "timelines", `${id}.json`);
    if (id.endsWith("_card") && !existsSync(tlFile)) return [];
    const tl = existsSync(tlFile) ? JSON.parse(readFileSync(tlFile, "utf8")) as Timeline : null;
    if (!tl) return [];
    if (!tl.clip && /^(00_intro|01_server)$|_outro$/.test(id)) return []; // a spoken title card (the intro or the outro)
    if (!existsSync(file)) throw new Error(`${ch.id}: ${file} is missing; rebuild ${ch.external!.dir}`);
    return [{ file, title: tl.title }];
  });
  if (!parts.length) throw new Error(`${ch.id}: no segments found in ${dir}`);
  return parts;
}

function assemble() {
  mkdirSync(SEG, { recursive: true });
  const list: string[] = [];
  const marks: Array<{ at: number; title: string }> = [];
  let at = 0;
  const numbered = chapters.filter((c) => c.kind !== "card");
  for (const ch of chapters) {
    if (ch.kind === "external") {
      const parts = externalSegments(ch);
      list.push(`file '${chapterCard(ch, numbered.indexOf(ch) + 1, numbered.length)}'`);
      parts.forEach((p, i) => {
        // The first part's chapter mark starts at the title card, like every other chapter.
        marks.push({ at, title: `${ch.external!.label}: ${p.title}` });
        if (i === 0) at += 3.5;
        list.push(`file '${p.file}'`);
        at += durationOf(p.file);
      });
      console.log(`  ✓ ${ch.id}  ${fmtTime(at)}  (${parts.length} parts from ${ch.external!.dir})`);
      continue;
    }
    const tlFile = join(TIMELINES, `${ch.id}.json`);
    if (!existsSync(tlFile)) throw new Error(`chapter ${ch.id} has not been recorded`);
    const tl: Timeline = JSON.parse(readFileSync(tlFile, "utf8"));
    if (ch.kind !== "card") {
      const card = chapterCard(ch, numbered.indexOf(ch) + 1, numbered.length);
      marks.push({ at, title: ch.title });
      list.push(`file '${card}'`);
      at += 3.5;
    } else {
      marks.push({ at, title: ch.title });
    }
    const seg = buildChapter(ch, tl);
    list.push(`file '${seg}'`);
    at += durationOf(seg);
    console.log(`  ✓ ${ch.id}  ${fmtTime(at)}`);
  }
  writeFileSync(join(SEG, "list.txt"), list.join("\n"));
  const merged = join(SEG, "merged.mp4");
  sh([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", join(SEG, "list.txt"), "-c", "copy", merged]);
  const total = durationOf(merged);
  // A very quiet, steady chord underneath: enough to make the silences feel intended, never loud enough to compete with the voice.
  const bed = join(SEG, "bed.m4a");
  sh([FFMPEG, "-y", "-f", "lavfi", "-i", `aevalsrc=sin(130.81*2*PI*t)*0.015+sin(196*2*PI*t)*0.012+sin(261.63*2*PI*t)*0.015+sin(329.63*2*PI*t)*0.01:s=48000:d=${total.toFixed(1)}`, "-af", "lowpass=f=900,afade=t=in:d=3,afade=t=out:st=" + (total - 4).toFixed(1) + ":d=4", "-c:a", "aac", bed], { quiet: true });
  sh([FFMPEG, "-y", "-i", merged, "-i", bed, "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:weights=1.0 0.09[a]", "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", FINAL]);
  rmSync(merged, { force: true });
  rmSync(bed, { force: true });
  mkdirSync(PROD, { recursive: true });
  writeFileSync(NOTES, S.notes(marks, total));
  console.log(`\n✔ ${FINAL}  ${fmtTime(total)}  ${(Bun.file(FINAL).size / 1048576).toFixed(0)} MB`);
}


const [phase = "all", ...rest] = argv;
const shardArg = rest.find((a) => /^--shard$/.test(a)) ? rest[rest.indexOf("--shard") + 1] : undefined;
const shard = shardArg ? (shardArg.split("/").map(Number) as [number, number]) : null;
const only = rest.filter((a) => !a.startsWith("--") && a !== shardArg).flatMap((a) => a.split(",")).filter(Boolean);

if (phase === "list") {
  for (const ch of chapters) console.log(`${ch.id.padEnd(16)} ${String(ch.steps.length).padStart(3)} steps  ${ch.title}`);
} else {
  mkdirSync(OUT, { recursive: true });
  const selected = chapters.filter((c) => !only.length || only.includes(c.id));
  if (phase === "audio" || phase === "all") await makeAudio(shard);
  if (phase === "record" || phase === "all") {
    await S.start();
    try { for (const ch of selected) await recordChapter(ch); } finally { S.stop(); }
  }
  if (phase === "build" || phase === "all") assemble();
  void chmodSync;
  void sleep;
  void FFMPEG;
}
}
