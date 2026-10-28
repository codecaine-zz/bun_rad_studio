import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import {
  AUDIO_FORMAT_INFO,
  buildAtempoFilter,
  cleanTextForSpeech,
  computeReadAlongTimeline,
  computeWordTimingsForText,
  convertWavFileToAiffNative,
  createWavHeader,
  DEFAULT_PHONON_VOICES,
  estimateSpokenWordWeight,
  extractPlainTextFromFile,
  formatAssKaraokeSubtitles,
  formatSrtSubtitles,
  formatVttSubtitles,
  getPhononStatus,
  isPhononSupportedPlatform,
  isPhononVideoFormat,
  parseVoicesFromModelfile,
  parseWavPcm,
  PHONON_HARD_MAX_CHUNK_CHARS,
  splitTextForPhonon,
  startPhononInstall,
  VIDEO_FORMAT_INFO,
} from "../src/features/filemanager/fmPhonon";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { resolveTool } from "../src/features/filemanager/fmToolDetect";
import { installPlan, TOOLS, TOOL_IDS } from "../src/features/filemanager/fmTools";
import { rmDir } from "./helpers/rm";

const root = mkdtempSync(join(tmpdir(), "fm-phonon-test-"));
afterAll(() => rmDir(root));

describe("Ollama & Phonon tool registration and 38 voices catalog", () => {
  test("ollama is registered in TOOLS with one-click package manager plans", () => {
    expect(TOOL_IDS).toContain("ollama");
    expect(TOOLS.ollama.executables).toEqual(["ollama"]);
    expect(installPlan("darwin", "ollama", { brew: "/opt/homebrew/bin/brew" })).toMatchObject({
      method: "brew",
      argv: ["/opt/homebrew/bin/brew", "install", "ollama"],
      auto: true,
    });
    expect(installPlan("win32", "ollama", { winget: "C:\\winget.exe" }).auto).toBe(true);
    expect(installPlan("win32", "ollama", { scoop: "C:\\scoop.cmd" }).auto).toBe(true);

    // Phonon requires Apple's MLX runtime and is enabled only on macOS ARM64 (hidden on Windows, Linux, and Intel macOS)
    expect(isPhononSupportedPlatform("darwin", "arm64")).toBe(true);
    expect(isPhononSupportedPlatform("darwin", "x64")).toBe(false);
    expect(isPhononSupportedPlatform("win32", "x64")).toBe(false);
    expect(isPhononSupportedPlatform("win32", "arm64")).toBe(false);
    expect(isPhononSupportedPlatform("linux", "x64")).toBe(false);
    expect(isPhononSupportedPlatform("linux", "arm64")).toBe(false);
  });

  test("all 38 built-in Phonon voices are present and Modelfile voice output is parsed", () => {
    expect(DEFAULT_PHONON_VOICES.length).toBe(38);
    const ids = DEFAULT_PHONON_VOICES.map((v) => v.id);
    expect(ids).toContain("Zoey");
    expect(ids).toContain("default");
    expect(ids).toContain("Captain Silas Blackwater");
    expect(ids).toContain("Vyrmathrax the Ancient");

    const sampleShowOutput = [
      "  Model",
      "    architecture        gradium_phonon_tts",
      "    context length      8192",
      "",
      "  Voices",
      "    Alfie                          4096 tokens",
      "    Captain Silas Blackwater       4096 tokens",
      "    Zoey                           4096 tokens",
      "    CustomFutureVoice              4096 tokens",
      "",
      "  Parameters",
      "    temperature    0.7",
    ].join("\n");
    const parsed = parseVoicesFromModelfile(sampleShowOutput);
    expect(parsed).toEqual(["Alfie", "Captain Silas Blackwater", "Zoey", "CustomFutureVoice"]);
  });

  test("all 9 target audio formats and 4 Read-Along Video formats are offered", () => {
    expect(AUDIO_FORMAT_INFO.map((f) => f.id)).toEqual(["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "aiff", "wma"]);
    expect(AUDIO_FORMAT_INFO.find((f) => f.id === "wav")!.needsFfmpeg).toBe(false);
    expect(AUDIO_FORMAT_INFO.find((f) => f.id === "aiff")!.needsFfmpeg).toBe(false);
    expect(AUDIO_FORMAT_INFO.find((f) => f.id === "mp3")!.needsFfmpeg).toBe(true);

    expect(VIDEO_FORMAT_INFO.map((f) => f.id)).toEqual(["mp4", "webm", "mov", "mkv"]);
    expect(isPhononVideoFormat("mp4")).toBe(true);
    expect(isPhononVideoFormat("webm")).toBe(true);
    expect(isPhononVideoFormat("wav")).toBe(false);
  });

  test("computes word-by-word timings and generates SRT, VTT, and ASS karaoke subtitles for Read-Along Video", () => {
    const words = computeWordTimingsForText("Hello world, follow along with every word!", 2400, 100, 0);
    expect(words.length).toBe(7);
    expect(words[0]!.word).toBe("Hello");
    expect(words[0]!.startMs).toBe(100);
    expect(words[words.length - 1]!.endMs).toBe(2500);
    for (let i = 1; i < words.length; i++) {
      expect(words[i]!.startMs).toBeGreaterThanOrEqual(words[i - 1]!.endMs);
    }

    const timeline = computeReadAlongTimeline(
      [
        {
          index: 0,
          paragraphIndex: 0,
          text: "Welcome to Codecaine Phonon Read-Along Video. Every word lights up in sync!",
          startMs: 0,
          endMs: 3200,
          durationMs: 3200,
        },
        {
          index: 1,
          paragraphIndex: 1,
          text: "Convert any document into both speech audio and synchronized video.",
          startMs: 3400,
          endMs: 6200,
          durationMs: 2800,
        },
      ],
      { aspectRatio: "16:9" },
    );

    expect(timeline.totalDurationMs).toBe(6200);
    expect(timeline.cues.length).toBeGreaterThanOrEqual(2);
    expect(timeline.words.length).toBe(22);

    const srt = formatSrtSubtitles(timeline);
    expect(srt).toContain("1\n00:00:00,000 -->");
    expect(srt).toContain("Welcome to Codecaine Phonon Read-Along Video.");

    const vtt = formatVttSubtitles(timeline);
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt).toContain("00:00:00.000 -->");

    const ass = formatAssKaraokeSubtitles(timeline, {
      voice: "Zoey",
      title: "Demo Read-Along",
      aspectRatio: "16:9",
      videoTheme: "midnight",
    });
    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("PlayResX: 1920");
    expect(ass).toContain("PlayResY: 1080");
    expect(ass).toContain("Style: ActiveKaraoke");
    expect(ass).toMatch(/\{\\kf\d+\}Welcome/);
    expect(ass).toMatch(/\{\\kf\d+\}video\./);
  });

  test("aligns word timings to 16-bit PCM speech waveform, pitch-inflection pause valleys, and spelled-out acronyms", () => {
    // 1. Spelled-out acronyms (TTS, MLX, MP4) get higher spoken syllable weight than short function words
    expect(estimateSpokenWordWeight("TTS").weight).toBeGreaterThan(estimateSpokenWordWeight("the").weight * 4);
    expect(estimateSpokenWordWeight("MP4").weight).toBeGreaterThan(estimateSpokenWordWeight("and").weight * 4);

    // 2. Build a 3.0s (24kHz) 16-bit PCM waveform with:
    //    - 0..160ms: leading pre-roll silence
    //    - 160..1200ms: Clause 1 ("Hello TTS world,") high-pitched voiced speech
    //    - 1200..1720ms: 520ms mid-sentence pitch/prosody pause valley at the comma
    //    - 1720..2600ms: Clause 2 ("follow along now.") lower-amplitude sentence-final pitch drop
    //    - 2600..3000ms: trailing post-roll silence
    const sampleRate = 24000;
    const totalSamples = sampleRate * 3; // 3000ms
    const pcm = Buffer.alloc(totalSamples * 2);
    for (let i = 0; i < totalSamples; i++) {
      const ms = (i / sampleRate) * 1000;
      let amp = 0;
      if (ms >= 160 && ms <= 1200) {
        amp = 9000;
      } else if (ms >= 1720 && ms <= 2600) {
        // Sentence-final pitch drop has lower RMS amplitude (~1800) but is still actively voiced
        amp = 1800;
      }
      const val = amp > 0 ? Math.round(Math.sin(i * 0.17) * amp) : 0;
      pcm.writeInt16LE(val, i * 2);
    }

    const aligned = computeWordTimingsForText(
      "Hello TTS world, follow along now.",
      3000,
      0,
      0,
      { pcmData: pcm, sampleRate, speed: 1 },
    );
    expect(aligned.length).toBe(6);
    // Word 0 ("Hello") waits until pre-roll silence ends (~160ms)
    expect(aligned[0]!.startMs).toBeGreaterThanOrEqual(140);
    expect(aligned[0]!.startMs).toBeLessThanOrEqual(210);
    // Word 2 ("world,") ends right at the start of the 1200..1720ms comma pause valley
    expect(aligned[2]!.word).toBe("world,");
    expect(aligned[2]!.endMs).toBeGreaterThanOrEqual(1160);
    expect(aligned[2]!.endMs).toBeLessThanOrEqual(1240);
    // Word 3 ("follow") does NOT start until the 520ms pause valley finishes at ~1720ms!
    expect(aligned[3]!.word).toBe("follow");
    expect(aligned[3]!.startMs).toBeGreaterThanOrEqual(1680);
    expect(aligned[3]!.startMs).toBeLessThanOrEqual(1760);
    // Word 5 ("now.") finishes near the end of voiced speech (~2600ms), before trailing silence
    expect(aligned[5]!.endMs).toBeGreaterThanOrEqual(2560);
    expect(aligned[5]!.endMs).toBeLessThanOrEqual(2650);

    // 3. ASS karaoke subtitles emit {\k<gapCs>} pause holds during acoustic gaps
    const timeline = computeReadAlongTimeline([
      {
        index: 0,
        paragraphIndex: 0,
        text: "Hello TTS world, follow along now.",
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        pcmData: pcm,
        sampleRate,
        speed: 1,
      },
    ]);
    const ass = formatAssKaraokeSubtitles(timeline, { voice: "Zoey", title: "Pause Hold Test" });
    expect(ass).toMatch(/\{\\kf\d+\}/);

    // 4. Time-locked pitch filter preserves duration via asetrate + aresample + atempo
    const pitchUpFilter = buildAtempoFilter(1.0, 3, 24000).join(" ");
    expect(pitchUpFilter).toContain("asetrate=");
    expect(pitchUpFilter).toContain("aresample=24000");
    expect(pitchUpFilter).toContain("atempo=");
    expect(buildAtempoFilter(1.0, 0, 24000)).toEqual([]);
  });
});

describe("Large-text chunker optimization for Phonon's 8,192-token context limit", () => {
  test("splits a 250,000+ character book into natural chunks that never exceed maxChars", () => {
    const chapter =
      "In the quiet light of the observatory, the instruments recorded every subtle oscillation of the signal. " +
      "Dr. Elena Vance adjusted the frequency dial, listening closely as the harmonic pattern repeated across the channel! " +
      "Could a local neural speech synthesis model read an entire multi-hundred-thousand-character book without overflowing its context window? " +
      "Yes: by splitting paragraphs along sentence and clause boundaries, each chunk stays compact and responsive.\n\n";
    const hugeBook = chapter.repeat(650); // ~280,000 characters
    expect(hugeBook.length).toBeGreaterThan(250_000);

    const t0 = performance.now();
    const chunks = splitTextForPhonon(hugeBook, { maxChars: 500 });
    const elapsedMs = performance.now() - t0;

    expect(elapsedMs).toBeLessThan(500);
    expect(chunks.length).toBeGreaterThan(500);
    for (const c of chunks) {
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.text.length).toBeLessThanOrEqual(500);
      expect(c.charCount).toBe(c.text.length);
      expect(c.wordCount).toBeGreaterThan(0);
    }
  });

  test("handles pathological unbroken paragraphs and 10,000-char spaceless tokens without exceeding Phonon limits", () => {
    // 1. 20,000 chars with commas and words but no sentence-ending periods
    const runOnClause = "words flowing without a period, another clause following right behind, ";
    const longNoPeriods = runOnClause.repeat(300);
    const clauseChunks = splitTextForPhonon(longNoPeriods, { maxChars: 450 });
    expect(clauseChunks.length).toBeGreaterThan(40);
    for (const c of clauseChunks) {
      expect(c.text.length).toBeLessThanOrEqual(450);
    }

    // 2. 10,000 chars with no spaces at all
    const unbroken = "A".repeat(10_000);
    const hardChunks = splitTextForPhonon(unbroken, { maxChars: 9999 }); // clamped to PHONON_HARD_MAX_CHUNK_CHARS (1200)
    for (const c of hardChunks) {
      expect(c.text.length).toBeLessThanOrEqual(PHONON_HARD_MAX_CHUNK_CHARS);
    }
    expect(hardChunks.map((c) => c.text).join("")).toBe(unbroken);
  });
});

describe("Format-to-plain-text conversion and speech cleanup across file formats", () => {
  const dir = join(root, "formats");
  const ctx = createContext({ home: dir, dataDir: join(root, "fmt-data"), toolDirs: [] });

  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
  });

  test("cleanTextForSpeech strips Markdown, HTML, URLs, code blocks, and subtitle timestamps", () => {
    const dirty = [
      "# Chapter 1: Getting Started",
      "",
      "Visit [Codecaine Documentation](https://docs.example.com/v2/guide?token=abcdef12345) for **important** details.",
      "",
      "```ts",
      "const secret = 42;",
      "```",
      "",
      "1",
      "00:01:12,400 --> 00:01:15,800",
      "This subtitle line should be spoken clearly!",
      "",
      "==========================================",
    ].join("\n");

    const cleaned = cleanTextForSpeech(dirty, {
      stripMarkdown: true,
      stripHtml: true,
      stripCodeBlocks: true,
      simplifyUrls: true,
      stripTimestamps: true,
    });

    expect(cleaned).toContain("Chapter 1: Getting Started");
    expect(cleaned).toContain("Visit Codecaine Documentation for important details.");
    expect(cleaned).not.toContain("https://docs.example.com");
    expect(cleaned).not.toContain("const secret = 42");
    expect(cleaned).not.toContain("00:01:12,400");
    expect(cleaned).toContain("This subtitle line should be spoken clearly!");
    expect(cleaned).not.toContain("==========");
  });

  test("extracts plain text from HTML, Markdown, SRT subtitles, JSON, Jupyter .ipynb, RTF, and FB2 files", async () => {
    // 1. HTML
    const htmlFile = join(dir, "article.html");
    writeFileSync(htmlFile, "<!doctype html><html><head><title>Ignore</title><style>body{color:red}</style></head><body><h1>Hello World</h1><p>First paragraph &amp; more.</p></body></html>");
    const htmlRes = await extractPlainTextFromFile(ctx, htmlFile);
    expect(htmlRes.text).toContain("Hello World");
    expect(htmlRes.text).toContain("First paragraph & more.");
    expect(htmlRes.text).not.toContain("<style>");

    // 2. SRT Subtitles
    const srtFile = join(dir, "captions.srt");
    writeFileSync(srtFile, "1\n00:00:01,000 --> 00:00:03,000\nWelcome to the show.\n\n2\n00:00:03,500 --> 00:00:06,000\nToday we explore neural speech.\n");
    const srtRes = await extractPlainTextFromFile(ctx, srtFile);
    expect(srtRes.text).toContain("Welcome to the show.");
    expect(srtRes.text).toContain("Today we explore neural speech.");
    expect(srtRes.text).not.toContain("00:00:01");

    // 3. JSON
    const jsonFile = join(dir, "items.json");
    writeFileSync(jsonFile, JSON.stringify([{ title: "First Note", summary: "Ready for reading" }, { title: "Second Note", summary: "All systems go" }]));
    const jsonRes = await extractPlainTextFromFile(ctx, jsonFile);
    expect(jsonRes.text).toContain("title: First Note");
    expect(jsonRes.text).toContain("summary: Ready for reading");

    // 4. Jupyter Notebook (.ipynb)
    const nbFile = join(dir, "demo.ipynb");
    writeFileSync(nbFile, JSON.stringify({
      cells: [
        { cell_type: "markdown", source: ["# Notebook Intro\n", "This is a notebook cell."] },
        { cell_type: "code", source: ["print('hello')"], outputs: [{ output_type: "stream", text: ["hello\n"] }] },
      ],
    }));
    const nbRes = await extractPlainTextFromFile(ctx, nbFile);
    expect(nbRes.text).toContain("Notebook Intro");
    expect(nbRes.text).toContain("This is a notebook cell.");

    // 5. RTF Document (.rtf)
    const rtfFile = join(dir, "letter.rtf");
    writeFileSync(rtfFile, "{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}\\f0\\fs24 Dear Reader,\\par This RTF document was converted to plain text.}");
    const rtfRes = await extractPlainTextFromFile(ctx, rtfFile);
    expect(rtfRes.text).toContain("Dear Reader");
    expect(rtfRes.text).toContain("This RTF document was converted to plain text.");

    // 6. FictionBook E-Book (.fb2)
    const fb2File = join(dir, "book.fb2");
    writeFileSync(fb2File, `<?xml version="1.0" encoding="utf-8"?><FictionBook><description><title-info><book-title>Starlight Odyssey</book-title></title-info></description><body><section><title><p>Chapter One</p></title><p>The starship left orbit at dawn.</p></section></body></FictionBook>`);
    const fb2Res = await extractPlainTextFromFile(ctx, fb2File);
    expect(fb2Res.text).toContain("Chapter One");
    expect(fb2Res.text).toContain("The starship left orbit at dawn.");
  });
});

describe.skipIf(process.platform === "win32")("WAV & AIFF PCM synthesis, multi-chunk stitching, and HTTP API operations", () => {
  const standinDir = join(root, "standin");
  const binDir = join(standinDir, "bin");
  const homeDir = join(standinDir, "home");
  const dataDir = join(standinDir, "data");
  const logFile = join(standinDir, "calls.log");
  let server: ReturnType<typeof startFileManagerServer>;
  const TOKEN = "phonon-test-token";

  beforeAll(() => {
    mkdirSync(binDir, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });

    // Create a stand-in `ollama` executable that supports `--version`, `list`, `show phonon`, `pull phonon`, and `run phonon` (generating a valid 24kHz 16-bit mono WAV)
    const fakeOllama = `#!/usr/bin/env bun
import { appendFileSync } from "fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(logFile)}, "ollama " + args.join(" ") + "\\n");
if (args[0] === "--version") {
  console.log("ollama version is 0.40.12");
  process.exit(0);
}
if (args[0] === "list") {
  console.log("NAME             ID              SIZE      MODIFIED\\nphonon:latest    58f58601e4e8    112 MB    Just now");
  process.exit(0);
}
if (args[0] === "show" && args[1] === "phonon") {
  console.log("  Model\\n    architecture        gradium_phonon_tts\\n    context length      8192\\n\\n  Voices\\n    Zoey          4096 tokens\\n    Alfie         4096 tokens\\n");
  process.exit(0);
}
if (args[0] === "pull" && args[1] === "phonon") {
  console.log("pulling manifest... success");
  process.exit(0);
}
if (args[0] === "run" && args[1] === "phonon") {
  const stdinText = await new Response(Bun.stdin.stream()).text();
  appendFileSync(${JSON.stringify(logFile)}, "stdin-len:" + stdinText.length + "\\n");
  // Generate 2400 samples (0.1s at 24kHz) of 16-bit mono PCM sine/tone
  const numSamples = 2400;
  const pcm = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    pcm.writeInt16LE(Math.round(Math.sin(i * 0.1) * 8000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  process.stdout.write(Buffer.concat([header, pcm]));
  process.exit(0);
}
process.exit(0);
`;
    writeFileSync(join(binDir, "ollama"), fakeOllama);
    chmodSync(join(binDir, "ollama"), 0o755);

    const fakeFfmpeg = `#!/usr/bin/env bun
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(logFile)}, "ffmpeg " + args.join(" ") + "\\n");
const outArg = args[args.length - 1] ?? "";
const outFile = outArg.startsWith("file:") ? outArg.slice(5) : resolve(process.cwd(), outArg);
const inIdx = args.lastIndexOf("-i");
const inArg = inIdx >= 0 ? (args[inIdx + 1] ?? "") : "";
const inFile = inArg.startsWith("file:") ? inArg.slice(5) : resolve(process.cwd(), inArg);
if (outFile.endsWith(".wav") && existsSync(inFile)) {
  copyFileSync(inFile, outFile);
  process.exit(0);
}
const assExists = existsSync(resolve(process.cwd(), "subtitles.ass"));
const assBytes = assExists ? readFileSync(resolve(process.cwd(), "subtitles.ass"), "utf8") : "";
writeFileSync(outFile, "FAKE_MP4_VIDEO\\n" + assBytes.slice(0, 200));
process.exit(0);
`;
    writeFileSync(join(binDir, "ffmpeg"), fakeFfmpeg);
    chmodSync(join(binDir, "ffmpeg"), 0o755);

    server = startFileManagerServer({
      port: 0,
      host: "127.0.0.1",
      token: TOKEN,
      context: {
        platform: "darwin",
        home: homeDir,
        dataDir,
        toolDirs: [binDir],
      },
    });
  });

  afterAll(() => {
    server.stop(true);
  });

  const post = async (op: string, body: unknown = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/${op}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fm-token": TOKEN },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };

  test("phonon/status detects Ollama, Phonon model, and all 38 voices", async () => {
    const res = await post("phonon/status");
    expect(res.status).toBe(200);
    expect(res.json.ollamaInstalled).toBe(true);
    expect(res.json.modelInstalled).toBe(true);
    expect(res.json.ready).toBe(true);
    expect(res.json.voices.length).toBeGreaterThanOrEqual(38);
  });

  test("phonon/voice saves and persists the default voice in File Manager settings", async () => {
    const res = await post("phonon/voice", {
      voice: "Captain Silas Blackwater",
      format: "aiff",
      speed: 1.15,
      pitch: 1.5,
      syncOffsetMs: -40,
      pauseMs: 300,
    });
    expect(res.status).toBe(200);
    expect(res.json.voice).toBe("Captain Silas Blackwater");
    expect(res.json.format).toBe("aiff");
    expect(res.json.speed).toBe(1.15);
    expect(res.json.pitch).toBe(1.5);
    expect(res.json.syncOffsetMs).toBe(-40);

    const statusAfter = await post("phonon/status");
    expect(statusAfter.json.settings.voice).toBe("Captain Silas Blackwater");
    expect(statusAfter.json.settings.format).toBe("aiff");
    expect(statusAfter.json.settings.pitch).toBe(1.5);
    expect(statusAfter.json.settings.syncOffsetMs).toBe(-40);
  });

  test("phonon/speak synthesizes a chunk, returns word-level follow-along timings, and serves cached WAV audio over /api/phonon/audio", async () => {
    const speak = await post("phonon/speak", { text: "Testing live read out loud synthesis.", voice: "Zoey" });
    expect(speak.status).toBe(200);
    expect(speak.json.audioId).toMatch(/^[a-f0-9]+$/);
    expect(speak.json.sampleRate).toBe(24000);
    expect(speak.json.durationSec).toBeGreaterThan(0);
    expect(Array.isArray(speak.json.words)).toBe(true);
    expect(speak.json.words.length).toBe(6);
    expect(speak.json.words[0].word).toBe("Testing");
    expect(Array.isArray(speak.json.cues)).toBe(true);
    expect(speak.json.cues.length).toBeGreaterThanOrEqual(1);

    const audioRes = await fetch(`http://127.0.0.1:${server.port}${speak.json.url}&token=${TOKEN}`);
    expect(audioRes.status).toBe(200);
    expect(audioRes.headers.get("content-type")).toBe("audio/wav");
    const wavBytes = Buffer.from(await audioRes.arrayBuffer());
    const parsed = parseWavPcm(wavBytes);
    expect(parsed.sampleRate).toBe(24000);
    expect(parsed.pcmData.length).toBe(4800);
  });

  test("phonon/video converts multi-chunk text into a synchronized Read-Along MP4 Video + companion .srt and .vtt subtitles", async () => {
    const videoRes = await post("phonon/video", {
      text: "First sentence of the read-along video. Second sentence lights up word by word as you follow along!",
      voice: "Zoey",
      format: "mp4",
      aspectRatio: "16:9",
      videoTheme: "midnight",
      saveSubtitles: true,
      outputDir: homeDir,
      outputName: "follow-along-demo",
      maxChunkChars: 120,
    });
    expect(videoRes.status).toBe(200);
    expect(videoRes.json.isVideo).toBe(true);
    const outVideoPath = videoRes.json.outputs[0];
    expect(outVideoPath.endsWith(".mp4")).toBe(true);

    for (let i = 0; i < 60; i++) {
      const list = await post("jobs/list");
      const job = list.json.jobs.find((j: any) => j.id === videoRes.json.job.id);
      if (job && job.state === "done") break;
      await Bun.sleep(40);
    }

    expect(existsSync(outVideoPath)).toBe(true);
    expect(readFileSync(outVideoPath, "utf8")).toContain("[Script Info]");

    const srtPath = outVideoPath.replace(/\.mp4$/, ".srt");
    const vttPath = outVideoPath.replace(/\.mp4$/, ".vtt");
    expect(existsSync(srtPath)).toBe(true);
    expect(existsSync(vttPath)).toBe(true);
    expect(readFileSync(srtPath, "utf8")).toContain("First sentence of the read-along video.");
    expect(readFileSync(vttPath, "utf8")).toContain("WEBVTT");
  });

  test("phonon/save stitches multi-chunk large text into a continuous WAV and AIFF audio file on disk", async () => {
    const longParagraphs = [
      "Paragraph one is long enough to be its own Phonon synthesis chunk when we set a compact chunk size limit for testing.",
      "Paragraph two follows right after paragraph one, and its PCM audio samples will be stitched seamlessly with a silence gap.",
      "Paragraph three concludes our multi-chunk audio file export test without needing ffmpeg for WAV or AIFF.",
    ].join("\n\n");

    const saveWav = await post("phonon/save", {
      text: longParagraphs,
      voice: "Zoey",
      format: "wav",
      pauseMs: 100,
      outputDir: homeDir,
      outputName: "stitched-book",
      maxChunkChars: 150,
    });
    expect(saveWav.status).toBe(200);
    const outWavPath = saveWav.json.outputs[0];

    // Wait for background job to finish
    for (let i = 0; i < 60; i++) {
      const list = await post("jobs/list");
      const job = list.json.jobs.find((j: any) => j.id === saveWav.json.job.id);
      if (job && job.state === "done") break;
      await Bun.sleep(40);
    }

    expect(existsSync(outWavPath)).toBe(true);
    const stitchedBuf = readFileSync(outWavPath);
    const parsedWav = parseWavPcm(stitchedBuf);
    expect(parsedWav.sampleRate).toBe(24000);
    // 3 chunks * 4800 bytes + 2 silence gaps of 100ms (2400 samples * 2 bytes = 4800 bytes each) = 24000 bytes
    expect(parsedWav.pcmData.length).toBeGreaterThanOrEqual(3 * 4800);

    // Also test native AIFF conversion
    const aiffPath = join(homeDir, "stitched-book.aiff");
    await convertWavFileToAiffNative(outWavPath, aiffPath);
    expect(existsSync(aiffPath)).toBe(true);
    const aiffBuf = readFileSync(aiffPath);
    expect(aiffBuf.subarray(0, 4).toString("ascii")).toBe("FORM");
    expect(aiffBuf.subarray(8, 12).toString("ascii")).toBe("AIFF");
  });

  test("phonon/savetxt saves converted plain text to a .txt file", async () => {
    const res = await post("phonon/savetxt", {
      text: "Clean plain text ready for reading.",
      outputDir: homeDir,
      outputName: "converted-note",
    });
    expect(res.status).toBe(200);
    expect(existsSync(res.json.path)).toBe(true);
    expect(readFileSync(res.json.path, "utf8")).toBe("Clean plain text ready for reading.\n");
  });

  test("phonon/install runs one-click auto-install of Ollama and pulls the Phonon model", async () => {
    const instDir = join(root, "auto-install");
    const instBin = join(instDir, "bin");
    mkdirSync(instBin, { recursive: true });
    const instLog = join(instDir, "install.log");

    // Fake Homebrew that installs `ollama` when `brew install ollama` runs
    const fakeBrew = `#!/bin/sh
echo "brew $@" >> "${instLog}"
cat << 'EOF' > "${instBin}/ollama"
#!/bin/sh
echo "ollama $@" >> "${instLog}"
if [ "$1" = "--version" ]; then echo "ollama version is 0.40.12"; exit 0; fi
if [ "$1" = "list" ]; then echo "phonon:latest"; exit 0; fi
if [ "$1" = "pull" ]; then echo "pulled $2"; exit 0; fi
exit 0
EOF
chmod +x "${instBin}/ollama"
`;
    writeFileSync(join(instBin, "brew"), fakeBrew);
    chmodSync(join(instBin, "brew"), 0o755);

    const instCtx = createContext({
      platform: "darwin",
      home: instDir,
      dataDir: join(instDir, "data"),
      toolDirs: [instBin],
    });

    const statusBefore = await getPhononStatus(instCtx);
    expect(statusBefore.ollamaInstalled).toBe(false);
    expect(statusBefore.install.canAutoInstallOllama).toBe(true);

    const job = startPhononInstall(instCtx, { confirm: true });
    const done = await instCtx.jobs.whenDone(job.id);
    expect(done.state).toBe("done");

    const logContent = readFileSync(instLog, "utf8");
    expect(logContent).toContain("brew install ollama");
    expect(logContent).toContain("ollama pull phonon");

    const statusAfter = await getPhononStatus(instCtx);
    expect(statusAfter.ollamaInstalled).toBe(true);
    expect(statusAfter.modelInstalled).toBe(true);
  });

  test("Linux 1-click install extracts ollama-linux-arm64.tar.zst into ~/.local/bin/ollama without sudo or zstd CLI", async () => {
    const linuxDir = join(root, "linux-install");
    const linuxHome = join(linuxDir, "home");
    const linuxBin = join(linuxDir, "bin");
    const archiveStaging = join(linuxDir, "archive-src");
    mkdirSync(join(archiveStaging, "bin"), { recursive: true });
    mkdirSync(join(archiveStaging, "lib", "ollama"), { recursive: true });
    mkdirSync(linuxHome, { recursive: true });
    mkdirSync(linuxBin, { recursive: true });
    const linuxLog = join(linuxDir, "linux-install.log");

    // Build a stand-in `bin/ollama` inside a tar archive and compress with Bun.zstdCompressSync
    const fakeLinuxOllama = `#!/bin/sh
echo "linux-ollama $@" >> "${linuxLog}"
if [ "$1" = "--version" ]; then echo "ollama version is 0.40.12"; exit 0; fi
if [ "$1" = "serve" ]; then sleep 2; exit 0; fi
if [ "$1" = "list" ]; then echo "phonon:latest"; exit 0; fi
if [ "$1" = "pull" ]; then echo "pulled $2"; exit 0; fi
exit 0
`;
    writeFileSync(join(archiveStaging, "bin", "ollama"), fakeLinuxOllama);
    chmodSync(join(archiveStaging, "bin", "ollama"), 0o755);
    writeFileSync(join(archiveStaging, "lib", "ollama", "libggml-cpu.so"), "fake-so");

    const tarPath = join(linuxDir, "ollama-linux.tar");
    const tarRes = Bun.spawnSync(["tar", "-cf", tarPath, "-C", archiveStaging, "bin", "lib"]);
    expect(tarRes.exitCode).toBe(0);
    const zstBytes = Bun.zstdCompressSync(readFileSync(tarPath));

    // Mock global fetch for https://ollama.com/download/ollama-linux-*.tar.zst
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.startsWith("https://ollama.com/download/ollama-linux-") && url.endsWith(".tar.zst")) {
        return new Response(new Uint8Array(zstBytes), { status: 200, headers: { "Content-Type": "application/zstd" } });
      }
      return origFetch(input, init);
    }) as typeof fetch;

    try {
      const linuxCtx = createContext({
        platform: "linux",
        home: linuxHome,
        dataDir: join(linuxDir, "data"),
        toolDirs: [linuxBin, join(linuxHome, ".local", "bin")],
      });

      const job = startPhononInstall(linuxCtx, { confirm: true });
      const done = await linuxCtx.jobs.whenDone(job.id);
      expect(done.state).toBe("done");
      expect(existsSync(join(linuxHome, ".local", "bin", "ollama"))).toBe(true);
      expect(existsSync(join(linuxHome, ".local", "lib", "ollama", "libggml-cpu.so"))).toBe(true);
      expect(readFileSync(linuxLog, "utf8")).toContain("linux-ollama pull phonon");

      const statusAfter = await getPhononStatus(linuxCtx);
      expect(statusAfter.ollamaInstalled).toBe(true);
      expect(statusAfter.modelInstalled).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// Real Ollama + Phonon integration test when installed on the host machine
const realCtx = createContext({});
const realOllama = resolveTool(realCtx, "ollama");
const hasRealPhonon = (() => {
  if (!realOllama) return false;
  try {
    const r = Bun.spawnSync([realOllama, "list"], { stdout: "pipe", stderr: "pipe", timeout: 4000 });
    return r.exitCode === 0 && /\bphonon\b/i.test(r.stdout.toString());
  } catch {
    return false;
  }
})();

describe("with real Ollama & Phonon model", () => {
  test.skipIf(!hasRealPhonon)("synthesizes real speech audio and exports a real Read-Along MP4 Video with `ollama run phonon --voice Zoey`", async () => {
    const ctx = createContext({ home: root, dataDir: join(root, "real-data") });
    const status = await getPhononStatus(ctx);
    expect(status.ready).toBe(true);
    expect(status.voices.length).toBeGreaterThanOrEqual(38);

    const { synthesizePhononChunkWav, synthesizeAndExportAudioFile } = await import("../src/features/filemanager/fmPhonon");
    const wav = await synthesizePhononChunkWav(ctx, status.ollamaPath!, "Hello from Codecaine File Manager.", "Zoey");
    const parsed = parseWavPcm(wav);
    expect(parsed.sampleRate).toBe(24000);
    expect(parsed.bitsPerSample).toBe(16);
    expect(parsed.pcmData.length).toBeGreaterThan(10_000);

    const ffmpegExe = resolveTool(ctx, "ffmpeg");
    if (ffmpegExe) {
      const outMp4 = join(root, "real-read-along.mp4");
      const chunks = splitTextForPhonon("Welcome to Codecaine Phonon Read-Along Video! Follow along word by word.", { maxChars: 200 });
      const videoOut = await synthesizeAndExportAudioFile(ctx, {
        ollamaExe: status.ollamaPath!,
        ffmpegExe,
        chunks,
        voice: "Zoey",
        format: "mp4",
        speed: 1,
        pauseMs: 150,
        outputPath: outMp4,
        aspectRatio: "16:9",
        videoTheme: "midnight",
        saveSubtitles: true,
        title: "Real Read-Along Demo",
      });
      expect(existsSync(videoOut.outputPath)).toBe(true);
      expect(videoOut.sizeBytes).toBeGreaterThan(1000);
      expect(videoOut.srtPath && existsSync(videoOut.srtPath)).toBe(true);
      expect(videoOut.vttPath && existsSync(videoOut.vttPath)).toBe(true);
    }
  });
});
