import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import {
  analyzeVoiceSamplePcm,
  applyCustomVoiceTransferToWav,
  applyFormantEnvelopeTransferPcm,
  AUDIO_FORMAT_INFO,
  buildAtempoFilter,
  buildCustomVoiceSafetensor,
  buildReadAlongSlideSvg,
  buildReadAlongVisualSlides,
  cleanRecordedVoicePcm,
  cleanTextForSpeech,
  computeEffectiveAtempoSpeed,
  computeReadAlongTimeline,
  computeWordTimingsForText,
  convertWavFileToAiffNative,
  createWavHeader,
  decodeAndResampleWavTo24kMono,
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
  sanitizeCustomVoiceId,
  splitTextForPhonon,
  startPhononInstall,
  stripNonSpeechChars,
  VIDEO_ASPECT_INFO,
  VIDEO_FORMAT_INFO,
  VOICE_CALIBRATION_SCRIPTS,
  wsolaPitchShiftPcm,
} from "../src/features/filemanager/fmPhonon";
import {
  cleanEpubAndPandocClutter,
  stripBackMatterPromoAndDuplicateChapters,
} from "../src/features/filemanager/fmPreview";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { resolveTool } from "../src/features/filemanager/fmToolDetect";
import {
  installPlan,
  TOOLS,
  TOOL_IDS,
} from "../src/features/filemanager/fmTools";
import { rmDir } from "./helpers/rm";

const root = mkdtempSync(join(tmpdir(), "fm-phonon-test-"));
afterAll(() => rmDir(root));

describe("Ollama & Phonon tool registration and 38 voices catalog", () => {
  test("ollama is registered in TOOLS with one-click package manager plans", () => {
    expect(TOOL_IDS).toContain("ollama");
    expect(TOOLS.ollama.executables).toEqual(["ollama"]);
    expect(
      installPlan("darwin", "ollama", { brew: "/opt/homebrew/bin/brew" }),
    ).toMatchObject({
      method: "brew",
      argv: ["/opt/homebrew/bin/brew", "install", "ollama"],
      auto: true,
    });
    expect(
      installPlan("win32", "ollama", { winget: "C:\\winget.exe" }).auto,
    ).toBe(true);
    expect(
      installPlan("win32", "ollama", { scoop: "C:\\scoop.cmd" }).auto,
    ).toBe(true);

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
    expect(parsed).toEqual([
      "Alfie",
      "Captain Silas Blackwater",
      "Zoey",
      "CustomFutureVoice",
    ]);
  });

  test("all 10 target audio formats (including chaptered M4B) and 4 Read-Along Video formats are offered", () => {
    expect(AUDIO_FORMAT_INFO.map((f) => f.id)).toEqual([
      "wav",
      "mp3",
      "m4a",
      "m4b",
      "aac",
      "flac",
      "ogg",
      "opus",
      "aiff",
      "wma",
    ]);
    expect(AUDIO_FORMAT_INFO.find((f) => f.id === "wav")!.needsFfmpeg).toBe(
      false,
    );
    expect(AUDIO_FORMAT_INFO.find((f) => f.id === "aiff")!.needsFfmpeg).toBe(
      false,
    );
    expect(AUDIO_FORMAT_INFO.find((f) => f.id === "mp3")!.needsFfmpeg).toBe(
      true,
    );

    expect(VIDEO_FORMAT_INFO.map((f) => f.id)).toEqual([
      "mp4",
      "webm",
      "mov",
      "mkv",
    ]);
    expect(isPhononVideoFormat("mp4")).toBe(true);
    expect(isPhononVideoFormat("webm")).toBe(true);
    expect(isPhononVideoFormat("wav")).toBe(false);
  });

  test("computes word-by-word timings and generates SRT, VTT, and ASS karaoke subtitles for Read-Along Video", () => {
    const words = computeWordTimingsForText(
      "Hello world, follow along with every word!",
      2400,
      100,
      0,
    );
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
    expect(vtt).toContain("line:50% position:50% align:center");

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
    expect(ass).toContain("\\pos(960,540)");
    expect(ass).toMatch(/\{\\kf\d+\}Welcome/);
    expect(ass).toMatch(/\{\\kf\d+\}video\./);

    const slides = buildReadAlongVisualSlides(
      timeline,
      timeline.totalDurationMs,
    );
    expect(slides.length).toBeGreaterThanOrEqual(timeline.words.length);
    const activeSlide = slides.find((s) => s.activeWordInCue >= 0)!;
    expect(activeSlide).toBeDefined();
    const svg = buildReadAlongSlideSvg({
      timeline,
      slide: activeSlide,
      aspect: VIDEO_ASPECT_INFO["16:9"],
      videoTheme: "midnight",
      voice: "Zoey",
      title: "Demo Read-Along",
      totalDurationMs: timeline.totalDurationMs,
    });
    expect(svg).toContain('viewBox="0 0 1920 1080"');
    // Active cue line is rendered at exact vertical center y=540
    expect(svg).toContain('y="540"');
    expect(computeEffectiveAtempoSpeed(1.25, 2, 24000)).toBeCloseTo(1.25, 2);
  });

  test("aligns word timings to 16-bit PCM speech waveform, pitch-inflection pause valleys, and spelled-out acronyms", () => {
    // 1. Spelled-out acronyms (TTS, MLX, MP4) get higher spoken syllable weight than short function words
    expect(estimateSpokenWordWeight("TTS").weight).toBeGreaterThan(
      estimateSpokenWordWeight("the").weight * 4,
    );
    expect(estimateSpokenWordWeight("MP4").weight).toBeGreaterThan(
      estimateSpokenWordWeight("and").weight * 4,
    );

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
    const ass = formatAssKaraokeSubtitles(timeline, {
      voice: "Zoey",
      title: "Pause Hold Test",
    });
    expect(ass).toMatch(/\{\\kf\d+\}/);

    // 4. Time-locked pitch filter preserves duration via asetrate + aresample + atempo
    const pitchUpFilter = buildAtempoFilter(1.0, 3, 24000).join(" ");
    expect(pitchUpFilter).toContain("asetrate=");
    expect(pitchUpFilter).toContain("aresample=24000");
    expect(pitchUpFilter).toContain("atempo=");
    expect(buildAtempoFilter(1.0, 0, 24000)).toEqual([]);

    // 5. Multi-clause alignment across unpunctuated newline headings, ellipses, and long silence valleys never drifts
    const multiDurMs = 6000;
    const multiSamples = sampleRate * 6;
    const multiPcm = Buffer.alloc(multiSamples * 2);
    // Island 0 (100..900ms): "BOOK ONE:"
    // Island 1 (1350..2550ms): "WINTER'S RISING"
    // Island 2 (3100..4300ms): "The world was..."
    // Island 3 (4800..5500ms): "dead."
    for (let i = 0; i < multiSamples; i++) {
      const ms = (i / sampleRate) * 1000;
      const inIsland =
        (ms >= 100 && ms <= 900) ||
        (ms >= 1350 && ms <= 2550) ||
        (ms >= 3100 && ms <= 4300) ||
        (ms >= 4800 && ms <= 5500);
      const val = inIsland ? Math.round(Math.sin(i * 0.17) * 8000) : 0;
      multiPcm.writeInt16LE(val, i * 2);
    }
    const multiText = "BOOK ONE: WINTER'S RISING\nThe world was... dead.";
    const multiWords = computeWordTimingsForText(multiText, multiDurMs, 0, 0, {
      pcmData: multiPcm,
      sampleRate,
      speed: 1,
    });
    expect(multiWords.map((w) => w.word)).toEqual([
      "BOOK",
      "ONE:",
      "WINTER'S",
      "RISING",
      "The",
      "world",
      "was...",
      "dead.",
    ]);
    // "ONE:" ends at ~900ms before the 450ms pause
    expect(multiWords[1]!.endMs).toBeGreaterThanOrEqual(860);
    expect(multiWords[1]!.endMs).toBeLessThanOrEqual(940);
    // "RISING" ends at ~2550ms before the 550ms newline pause
    expect(multiWords[3]!.endMs).toBeGreaterThanOrEqual(2500);
    expect(multiWords[3]!.endMs).toBeLessThanOrEqual(2600);
    // "The" starts at ~3100ms after the newline pause
    expect(multiWords[4]!.startMs).toBeGreaterThanOrEqual(3060);
    expect(multiWords[4]!.startMs).toBeLessThanOrEqual(3150);
    // "dead." starts at ~4800ms after the ellipsis pause and finishes at ~5500ms
    expect(multiWords[7]!.startMs).toBeGreaterThanOrEqual(4760);
    expect(multiWords[7]!.startMs).toBeLessThanOrEqual(4850);
    expect(multiWords[7]!.endMs).toBeGreaterThanOrEqual(5460);
    expect(multiWords[7]!.endMs).toBeLessThanOrEqual(5550);

    // And computeReadAlongTimeline keeps "The world was... dead." together as one complete sentence cue!
    const multiTimeline = computeReadAlongTimeline([
      {
        index: 0,
        paragraphIndex: 0,
        text: multiText,
        startMs: 0,
        endMs: multiDurMs,
        durationMs: multiDurMs,
        words: multiWords,
      },
    ]);
    expect(multiTimeline.cues.map((c) => c.text)).toContain(
      "The world was... dead.",
    );
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
    const runOnClause =
      "words flowing without a period, another clause following right behind, ";
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
  const ctx = createContext({
    home: dir,
    dataDir: join(root, "fmt-data"),
    toolDirs: [],
  });

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
    expect(cleaned).toContain(
      "Visit Codecaine Documentation for important details.",
    );
    expect(cleaned).not.toContain("https://docs.example.com");
    expect(cleaned).not.toContain("const secret = 42");
    expect(cleaned).not.toContain("00:01:12,400");
    expect(cleaned).toContain("This subtitle line should be spoken clearly!");
    expect(cleaned).not.toContain("==========");
  });

  test("strips non-speech dividers (======, ------), Calibre/Pandoc EPUB clutter, and back-matter promo/duplicate chapters while preserving Author's Notes", () => {
    // 1. Non-speech separators (======, ------, box drawing) stripped while preserving hyphenated words
    const rawWithDividers =
      "Section One ====== Introduction ------ Welcome to our twenty-one day read-along program!\n──────────\n══════";
    const strippedDividers = stripNonSpeechChars(rawWithDividers);
    expect(strippedDividers).not.toContain("======");
    expect(strippedDividers).not.toContain("------");
    expect(strippedDividers).not.toContain("────");
    expect(strippedDividers).toContain("twenty-one");
    expect(strippedDividers).toContain("read-along");

    const wordTimings = computeWordTimingsForText(rawWithDividers, 2500, 0, 0);
    expect(wordTimings.some((w) => /^[=\-─═]+$/.test(w.word))).toBe(false);

    // 2. Zero Conversion Clutter: Calibre/Pandoc artifacts ({.calibre*}, :::, []{#...}, <svg>, \', stray backslashes)
    const calibrePandocDirty = [
      "::: {.calibre1}",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><path d="M0 0"/></svg>',
      "[]{#chapter_1 .calibre2}",
      "## [Chapter One]{.calibre3} {.calibre4 #ch1}",
      "She whispered, \\'Don\\'t look back!\\' and stepped through the doorway.\\",
      "::::::",
    ].join("\n");
    const clutterFree = cleanEpubAndPandocClutter(calibrePandocDirty);
    expect(clutterFree).not.toContain(".calibre");
    expect(clutterFree).not.toContain(":::");
    expect(clutterFree).not.toContain("[]{#");
    expect(clutterFree).not.toContain("<svg");
    expect(clutterFree).not.toContain("\\'");
    expect(clutterFree).toContain("## Chapter One");
    expect(clutterFree).toContain(
      "She whispered, 'Don't look back!' and stepped through the doorway.",
    );

    // 3. Deadlocked 5.md: removes the appended Deadlocked 6 sneak-peek chapter while preserving Author's Note & Introduction
    const deadlocked5Md = [
      "# Deadlocked 5",
      "",
      "## Introduction",
      "Thank you for picking up the fifth installment of this series.",
      "",
      "## Chapter 1",
      "The storm hit the harbor before dawn, rattling every window along the pier.",
      "",
      "## Chapter 2",
      "By noon the lighthouse keeper knew they were completely cut off from the mainland.",
      "",
      "## Author's Note",
      "I am deeply grateful to everyone who followed the crew through Book 5.",
      "",
      "## Deadlocked 6",
      "Keep reading for a sneak peek of Deadlocked 6! The next morning, a new ship appeared on the horizon.",
    ].join("\n");
    const cleanedDeadlocked5 = stripBackMatterPromoAndDuplicateChapters(
      deadlocked5Md,
      "Deadlocked 5.md",
    );
    expect(cleanedDeadlocked5).toContain("Thank you for picking up the fifth");
    expect(cleanedDeadlocked5).toContain(
      "I am deeply grateful to everyone who followed the crew through Book 5.",
    );
    expect(cleanedDeadlocked5).not.toContain("Deadlocked 6");
    expect(cleanedDeadlocked5).not.toContain(
      "new ship appeared on the horizon",
    );

    // 4. Djinn_ An Extreme Horror Novel - Sam West.md: removes unrelated Suffer Hard promo chapter while preserving Author's Note
    const djinnMd = [
      "# Djinn: An Extreme Horror Novel",
      "",
      "## Author's Note",
      "This novel explores ancient folklore in a modern desert setting.",
      "",
      "## Chapter 1",
      "The desert wind carried embers across the highway at midnight.",
      "",
      "## Chapter 2",
      "When the lantern finally went out, the shadows along the canyon wall stopped moving.",
      "",
      "## Epilogue",
      "Nothing remained in the sand except the brass lamp.",
      "",
      "## Suffer Hard",
      "Turn the page for a sample chapter from Suffer Hard! Rain hammered the neon signs of the downtown alley.",
    ].join("\n");
    const cleanedDjinn = stripBackMatterPromoAndDuplicateChapters(
      djinnMd,
      "Djinn_ An Extreme Horror Novel - Sam West.md",
    );
    expect(cleanedDjinn).toContain(
      "This novel explores ancient folklore in a modern desert setting.",
    );
    expect(cleanedDjinn).toContain(
      "Nothing remained in the sand except the brass lamp.",
    );
    expect(cleanedDjinn).not.toContain("Suffer Hard");
    expect(cleanedDjinn).not.toContain("Rain hammered the neon signs");

    // 5. Real-book edge cases: dotted/bang IDs {#part0000_split_004.html_calibre_pb_10 .calibre15},
    //    {=html} raw spans, TOC anchor links [Title](#part0000...), curly Author’s Note mentioning sequel in prose,
    //    and embedded post-"THE END." Suffer Hard promo blurbs
    const complexMd = [
      '`<image width="563" xlink:href="cover.jpeg">`{=html}`</image>`{=html}',
      "[[PROLOGUE -- Stepping into a New World]{.calibre13}](#part0000_split_003.html__Toc379203062)",
      "# [[1 -- Surviving in a Dead World]{.calibre19}]{#part0000_split_004.html__Toc379203063 .calibre18} {#part0000_split_004.html_calibre_pb_10 .calibre15}",
      "First chapter body with ***WARNING*** and *italic* text in Some Kind of Cu*t.\\",
      "</p>",
      "# 16 – Deeper and Deeper {#CR!NSKYNPP_split_016.html .mbppagebreak}",
      "Chapter sixteen body text with en-dash title.",
      "# CHAPTER THIRTY-FIVE",
      "Chapter thirty-five body text.",
      "THE END.",
      "",
      "Thank you for reading, dear reader. Here is the introduction and the first chapter of SUFFER HARD: AN EXTREME HORROR NOVELLA.",
      "INTRODUCTION BY SAM WEST: Unrelated novella promo text.",
      "# Author’s Note",
      "That character will return in future stories (expect to learn more about Stitch in Deadlocked 7), because there is a lot to tell! I love hearing from readers at the end of the book.",
      "# DEADLOCKED 6 Sneak Peak",
      "# PRELUDE",
      "Sneak peek chapter body that should be stripped.",
    ].join("\n\n");
    const cleanedComplex = stripBackMatterPromoAndDuplicateChapters(
      complexMd,
      "Deadlocked 5.md",
    );
    expect(cleanedComplex).not.toContain("{#part0000");
    expect(cleanedComplex).not.toContain("{#CR!");
    expect(cleanedComplex).not.toContain("{=html}");
    expect(cleanedComplex).not.toContain("](#part0000");
    expect(cleanedComplex).not.toContain("</p>");
    expect(cleanedComplex).toContain("# 16 – Deeper and Deeper");
    expect(cleanedComplex).toContain("# CHAPTER THIRTY-FIVE");
    expect(cleanedComplex).toContain(
      "expect to learn more about Stitch in Deadlocked 7",
    );
    expect(cleanedComplex).toContain(
      "I love hearing from readers at the end of the book.",
    );
    expect(cleanedComplex).not.toContain("SUFFER HARD");
    expect(cleanedComplex).not.toContain("Sneak peek chapter body");

    // 6. Verify every single word in Read-Along .mp4 visual slides gets highlighted (no skipped words even > 250 words)
    const longSentenceWords = Array.from({ length: 260 }, (_, i) =>
      i % 5 === 0
        ? "the"
        : i % 5 === 1
          ? "quick"
          : i % 5 === 2
            ? "in"
            : i % 5 === 3
              ? "of"
              : `word${i}.`,
    ).join(" ");
    const longDurMs = 65_000;
    const sr = 24000;
    const pcmSamples = Math.floor(sr * 8.0);
    const pcmBuf = Buffer.alloc(pcmSamples * 2);
    for (let i = 0; i < pcmSamples; i++) {
      const t = i / sr;
      const env = Math.max(0.02, 0.5 + 0.48 * Math.sin(2 * Math.PI * 3.5 * t));
      pcmBuf.writeInt16LE(
        Math.round(env * 14000 * Math.sin(2 * Math.PI * 180 * t)),
        i * 2,
      );
    }
    const shortWordsCheck = computeWordTimingsForText(
      "The quick brown fox jumps over the lazy dog in the middle of the night.",
      4000,
      0,
      0,
      { pcmData: pcmBuf, sampleRate: sr },
    );
    expect(shortWordsCheck.length).toBe(15);
    for (const w of shortWordsCheck) {
      expect(w.durationMs).toBeGreaterThanOrEqual(85);
    }

    const longWords = computeWordTimingsForText(
      longSentenceWords,
      longDurMs,
      0,
      0,
    );
    expect(longWords.length).toBe(260);
    const longTl = computeReadAlongTimeline([
      {
        index: 0,
        paragraphIndex: 0,
        text: longSentenceWords,
        startMs: 0,
        endMs: longDurMs,
        durationMs: longDurMs,
        words: longWords,
      },
    ]);
    const longSlides = buildReadAlongVisualSlides(longTl, longDurMs, 40);
    // Count how many distinct (cueIndex, activeWordInCue) pairs are highlighted across all slides
    const highlightedWordPairs = new Set<string>();
    for (const s of longSlides) {
      if (s.activeWordInCue >= 0) {
        highlightedWordPairs.add(`${s.cueIndex}:${s.activeWordInCue}`);
        expect(s.endMs - s.startMs).toBeGreaterThanOrEqual(80);
      }
    }
    expect(highlightedWordPairs.size).toBe(260);
  });

  test("extracts plain text from HTML, Markdown, SRT subtitles, JSON, Jupyter .ipynb, RTF, and FB2 files", async () => {
    // 1. HTML
    const htmlFile = join(dir, "article.html");
    writeFileSync(
      htmlFile,
      "<!doctype html><html><head><title>Ignore</title><style>body{color:red}</style></head><body><h1>Hello World</h1><p>First paragraph &amp; more.</p></body></html>",
    );
    const htmlRes = await extractPlainTextFromFile(ctx, htmlFile);
    expect(htmlRes.text).toContain("Hello World");
    expect(htmlRes.text).toContain("First paragraph & more.");
    expect(htmlRes.text).not.toContain("<style>");

    // 2. SRT Subtitles
    const srtFile = join(dir, "captions.srt");
    writeFileSync(
      srtFile,
      "1\n00:00:01,000 --> 00:00:03,000\nWelcome to the show.\n\n2\n00:00:03,500 --> 00:00:06,000\nToday we explore neural speech.\n",
    );
    const srtRes = await extractPlainTextFromFile(ctx, srtFile);
    expect(srtRes.text).toContain("Welcome to the show.");
    expect(srtRes.text).toContain("Today we explore neural speech.");
    expect(srtRes.text).not.toContain("00:00:01");

    // 3. JSON
    const jsonFile = join(dir, "items.json");
    writeFileSync(
      jsonFile,
      JSON.stringify([
        { title: "First Note", summary: "Ready for reading" },
        { title: "Second Note", summary: "All systems go" },
      ]),
    );
    const jsonRes = await extractPlainTextFromFile(ctx, jsonFile);
    expect(jsonRes.text).toContain("title: First Note");
    expect(jsonRes.text).toContain("summary: Ready for reading");

    // 4. Jupyter Notebook (.ipynb)
    const nbFile = join(dir, "demo.ipynb");
    writeFileSync(
      nbFile,
      JSON.stringify({
        cells: [
          {
            cell_type: "markdown",
            source: ["# Notebook Intro\n", "This is a notebook cell."],
          },
          {
            cell_type: "code",
            source: ["print('hello')"],
            outputs: [{ output_type: "stream", text: ["hello\n"] }],
          },
        ],
      }),
    );
    const nbRes = await extractPlainTextFromFile(ctx, nbFile);
    expect(nbRes.text).toContain("Notebook Intro");
    expect(nbRes.text).toContain("This is a notebook cell.");

    // 5. RTF Document (.rtf)
    const rtfFile = join(dir, "letter.rtf");
    writeFileSync(
      rtfFile,
      "{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}\\f0\\fs24 Dear Reader,\\par This RTF document was converted to plain text.}",
    );
    const rtfRes = await extractPlainTextFromFile(ctx, rtfFile);
    expect(rtfRes.text).toContain("Dear Reader");
    expect(rtfRes.text).toContain(
      "This RTF document was converted to plain text.",
    );

    // 6. FictionBook E-Book (.fb2)
    const fb2File = join(dir, "book.fb2");
    writeFileSync(
      fb2File,
      `<?xml version="1.0" encoding="utf-8"?><FictionBook><description><title-info><book-title>Starlight Odyssey</book-title></title-info></description><body><section><title><p>Chapter One</p></title><p>The starship left orbit at dawn.</p></section></body></FictionBook>`,
    );
    const fb2Res = await extractPlainTextFromFile(ctx, fb2File);
    expect(fb2Res.text).toContain("Chapter One");
    expect(fb2Res.text).toContain("The starship left orbit at dawn.");

    // 7. Unpacked macOS .epub package directory bundle (Apple Books format)
    const epubPkgDir = join(dir, "SampleNovel.epub");
    mkdirSync(join(epubPkgDir, "META-INF"), { recursive: true });
    writeFileSync(
      join(epubPkgDir, "META-INF", "container.xml"),
      `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    );
    writeFileSync(
      join(epubPkgDir, "content.opf"),
      `<?xml version="1.0" encoding="UTF-8"?><package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Sample Novel</dc:title><dc:creator>Jane Doe</dc:creator></metadata><manifest><item id="ch1" href="split_000.html" media-type="application/xhtml+xml"/><item id="ch2" href="split_001.html" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>`,
    );
    writeFileSync(
      join(epubPkgDir, "split_000.html"),
      `<html><head><title>Sample Novel</title></head><body><p><span>CHAPTER ONE – THE BEGINNING</span></p><p>It was a bright cold morning in April.</p></body></html>`,
    );
    writeFileSync(
      join(epubPkgDir, "split_001.html"),
      `<html><head><title>Sample Novel</title></head><body><p><span>CHAPTER TWO – THE JOURNEY</span></p><p>The train pulled out of the station at noon.</p></body></html>`,
    );
    const epubPkgRes = await extractPlainTextFromFile(ctx, epubPkgDir);
    expect(epubPkgRes.title).toBe("Sample Novel");
    expect(epubPkgRes.formatLabel).toBe("E-Book (EPUB)");
    expect(epubPkgRes.text).toContain("CHAPTER ONE – THE BEGINNING");
    expect(epubPkgRes.text).toContain("It was a bright cold morning in April.");
    expect(epubPkgRes.text).toContain("CHAPTER TWO – THE JOURNEY");
    expect(epubPkgRes.text).toContain(
      "The train pulled out of the station at noon.",
    );
  });
});

describe.skipIf(process.platform === "win32")(
  "WAV & AIFF PCM synthesis, multi-chunk stitching, and HTTP API operations",
  () => {
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
      writeFileSync(join(binDir, "ollama.exe"), fakeOllama);
      chmodSync(join(binDir, "ollama.exe"), 0o755);

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
      writeFileSync(join(binDir, "ffmpeg.exe"), fakeFfmpeg);
      chmodSync(join(binDir, "ffmpeg.exe"), 0o755);

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
      const speak = await post("phonon/speak", {
        text: "Testing live read out loud synthesis.",
        voice: "Zoey",
      });
      expect(speak.status).toBe(200);
      expect(speak.json.audioId).toMatch(/^[a-f0-9]+$/);
      expect(speak.json.sampleRate).toBe(24000);
      expect(speak.json.durationSec).toBeGreaterThan(0);
      expect(Array.isArray(speak.json.words)).toBe(true);
      expect(speak.json.words.length).toBe(6);
      expect(speak.json.words[0].word).toBe("Testing");
      expect(Array.isArray(speak.json.cues)).toBe(true);
      expect(speak.json.cues.length).toBeGreaterThanOrEqual(1);

      const audioRes = await fetch(
        `http://127.0.0.1:${server.port}${speak.json.url}&token=${TOKEN}`,
      );
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
        const job = list.json.jobs.find(
          (j: any) => j.id === videoRes.json.job.id,
        );
        if (job && job.state === "done") break;
        await Bun.sleep(40);
      }

      expect(existsSync(outVideoPath)).toBe(true);
      expect(readFileSync(outVideoPath, "utf8")).toContain("[Script Info]");

      const srtPath = outVideoPath.replace(/\.mp4$/, ".srt");
      const vttPath = outVideoPath.replace(/\.mp4$/, ".vtt");
      expect(existsSync(srtPath)).toBe(true);
      expect(existsSync(vttPath)).toBe(true);
      expect(readFileSync(srtPath, "utf8")).toContain(
        "First sentence of the read-along video.",
      );
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
        const job = list.json.jobs.find(
          (j: any) => j.id === saveWav.json.job.id,
        );
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
      expect(readFileSync(res.json.path, "utf8")).toBe(
        "Clean plain text ready for reading.\n",
      );
    });

    test("AI Voice Recorder: analyzes baritone vs soprano F0 pitch, builds [1, 512, 125] F32 safetensor, clones custom voice, speaks with it, and deletes it", async () => {
      // Helper to synthesize a harmonic human-like voice WAV sample at a target fundamental frequency (F0 Hz)
      const makeSyntheticVoiceWav = (
        f0Hz: number,
        sampleRate = 24000,
        durationSec = 2.5,
      ): Buffer => {
        const numSamples = Math.round(sampleRate * durationSec);
        const pcm = Buffer.alloc(numSamples * 2);
        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          // Syllabic envelope (4 syllables/sec)
          const sylEnv =
            0.35 +
            0.65 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * 4.0 * t)), 0.6);
          // Fundamental + 3 harmonics
          const wave =
            0.55 * Math.sin(2 * Math.PI * f0Hz * t) +
            0.25 * Math.sin(2 * Math.PI * f0Hz * 2 * t) +
            0.12 * Math.sin(2 * Math.PI * f0Hz * 3 * t) +
            0.08 * Math.sin(2 * Math.PI * f0Hz * 4 * t);
          const val = Math.max(-1, Math.min(1, wave * sylEnv * 0.75));
          pcm.writeInt16LE(Math.round(val * 32767), i * 2);
        }
        return Buffer.concat([
          createWavHeader(pcm.length, sampleRate, 1, 16),
          pcm,
        ]);
      };

      expect(VOICE_CALIBRATION_SCRIPTS.length).toBeGreaterThanOrEqual(3);
      expect(sanitizeCustomVoiceId("Zoey")).toBe("Zoey-Custom");
      expect(sanitizeCustomVoiceId("My Studio Voice!")).toBe("My-Studio-Voice");

      const baritoneWav = makeSyntheticVoiceWav(115, 44100, 2.5);
      const decodedBaritone = decodeAndResampleWavTo24kMono(baritoneWav);
      expect(decodedBaritone.originalSampleRate).toBe(44100);
      expect(decodedBaritone.durationSec).toBeCloseTo(2.5, 1);

      const cleanedBaritone = cleanRecordedVoicePcm(
        decodedBaritone.pcm24k,
        24000,
      );
      const baritoneProfile = analyzeVoiceSamplePcm(cleanedBaritone, 24000);
      expect(baritoneProfile.medianF0Hz).toBeGreaterThan(105);
      expect(baritoneProfile.medianF0Hz).toBeLessThan(125);
      expect(baritoneProfile.voiceRegister).toContain("Baritone");
      expect(baritoneProfile.blendComponents.length).toBe(4);
      expect(baritoneProfile.prosodyContour125.length).toBe(125);

      const sopranoWav = makeSyntheticVoiceWav(235, 24000, 2.5);
      const sopranoProfile = analyzeVoiceSamplePcm(
        parseWavPcm(sopranoWav).pcmData,
        24000,
      );
      expect(sopranoProfile.medianF0Hz).toBeGreaterThan(220);
      expect(sopranoProfile.medianF0Hz).toBeLessThan(250);
      expect(sopranoProfile.medianF0Hz).toBeGreaterThan(
        baritoneProfile.medianF0Hz + 90,
      );

      // Closed-loop acoustic voice transfer: convert a 170 Hz mid-high voice WAV to match the 115 Hz baritone profile
      const midVoiceWav = makeSyntheticVoiceWav(170, 24000, 2.5);
      const transferredWav = applyCustomVoiceTransferToWav(
        midVoiceWav,
        baritoneProfile,
      );
      const transferredParsed = parseWavPcm(transferredWav);
      expect(transferredParsed.pcmData.length).toBe(
        parseWavPcm(midVoiceWav).pcmData.length,
      );
      const transferredProfile = analyzeVoiceSamplePcm(
        transferredParsed.pcmData,
        24000,
      );
      expect(
        Math.abs(transferredProfile.medianF0Hz - baritoneProfile.medianF0Hz),
      ).toBeLessThan(8);
      expect(
        wsolaPitchShiftPcm(transferredParsed.pcmData, 1.0, 24000).length,
      ).toBe(transferredParsed.pcmData.length);
      expect(
        applyFormantEnvelopeTransferPcm(
          transferredParsed.pcmData,
          baritoneProfile.formantBands,
          24000,
        ).length,
      ).toBe(transferredParsed.pcmData.length);

      // Clone custom voice via API
      const cloneRes = await post("phonon/clone-voice", {
        name: "Alex Studio Voice",
        audioBase64: baritoneWav.toString("base64"),
      });
      expect(cloneRes.status).toBe(200);
      expect(cloneRes.json.voice.id).toBe("Alex-Studio-Voice");
      expect(cloneRes.json.voice.label).toBe("Alex Studio Voice");
      expect(cloneRes.json.voice.profile.medianF0Hz).toBeGreaterThan(105);
      expect(cloneRes.json.voice.safetensorSha256).toMatch(/^[a-f0-9]{64}$/);

      // Verify the [1, 512, 125] F32 .safetensors file on disk
      const stFile = join(
        dataDir,
        "phonon-custom-voices",
        "Alex-Studio-Voice.safetensors",
      );
      expect(existsSync(stFile)).toBe(true);
      const stBuf = readFileSync(stFile);
      const headerLen = Number(stBuf.readBigUInt64LE(0));
      const headerJson = JSON.parse(
        stBuf
          .subarray(8, 8 + headerLen)
          .toString("utf8")
          .trim(),
      );
      expect(headerJson["voices.Alex-Studio-Voice"]).toEqual({
        dtype: "F32",
        shape: [1, 512, 125],
        data_offsets: [0, 256000],
      });
      expect(stBuf.length - 8 - headerLen).toBe(256000);

      // Fetch recorded voice sample via /api/phonon/audio?id=voice-sample:Alex-Studio-Voice
      const sampleRes = await fetch(
        `http://127.0.0.1:${server.port}${cloneRes.json.voice.sampleUrl}&token=${TOKEN}`,
      );
      expect(sampleRes.status).toBe(200);
      expect(sampleRes.headers.get("content-type")).toBe("audio/wav");

      // Speak with the cloned custom voice
      const speakCustom = await post("phonon/speak", {
        text: "Reading aloud with my own recorded AI voice.",
        voice: "Alex-Studio-Voice",
      });
      expect(speakCustom.status).toBe(200);
      expect(speakCustom.json.voice).toBe("Alex-Studio-Voice");
      expect(speakCustom.json.words.length).toBe(8);

      // Delete the custom voice
      const delRes = await post("phonon/delete-voice", {
        id: "Alex-Studio-Voice",
      });
      expect(delRes.status).toBe(200);
      expect(delRes.json.deletedId).toBe("Alex-Studio-Voice");
      expect(delRes.json.voices.length).toBe(0);
      expect(existsSync(stFile)).toBe(false);
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
      writeFileSync(
        join(archiveStaging, "lib", "ollama", "libggml-cpu.so"),
        "fake-so",
      );

      const tarPath = join(linuxDir, "ollama-linux.tar");
      const tarRes = Bun.spawnSync([
        "tar",
        "-cf",
        tarPath,
        "-C",
        archiveStaging,
        "bin",
        "lib",
      ]);
      expect(tarRes.exitCode).toBe(0);
      const zstBytes = Bun.zstdCompressSync(readFileSync(tarPath));

      // Mock global fetch for https://ollama.com/download/ollama-linux-*.tar.zst
      const origFetch = globalThis.fetch;
      globalThis.fetch = (async (input: any, init?: any) => {
        const url = typeof input === "string" ? input : (input?.url ?? "");
        if (
          url.startsWith("https://ollama.com/download/ollama-linux-") &&
          url.endsWith(".tar.zst")
        ) {
          return new Response(new Uint8Array(zstBytes), {
            status: 200,
            headers: { "Content-Type": "application/zstd" },
          });
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
        expect(existsSync(join(linuxHome, ".local", "bin", "ollama"))).toBe(
          true,
        );
        expect(
          existsSync(
            join(linuxHome, ".local", "lib", "ollama", "libggml-cpu.so"),
          ),
        ).toBe(true);
        expect(readFileSync(linuxLog, "utf8")).toContain(
          "linux-ollama pull phonon",
        );

        const statusAfter = await getPhononStatus(linuxCtx);
        expect(statusAfter.ollamaInstalled).toBe(true);
        expect(statusAfter.modelInstalled).toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    test("cross-platform QA matrix: darwin (arm64/x64), linux (x64/arm64), and win32 (x64/arm64) status, CRLF/Windows paths, and audio/video export", async () => {
      const {
        synthesizePhononChunkWav,
        synthesizeAndExportAudioFile,
        resolveCrossPlatformVoiceSpec,
        synthesizePureBunWordCadenceWav,
        buildReadAlongSlideBmpFallback,
        VIDEO_ASPECT_INFO,
        speakChunk,
      } = await import("../src/features/filemanager/fmPhonon");

      // 1. Platform & architecture matrix for getPhononStatus
      const matrix: Array<{
        platform: "darwin" | "linux" | "win32";
        arch: string;
        expectedSupported: boolean;
      }> = [
        { platform: "darwin", arch: "arm64", expectedSupported: true },
        { platform: "darwin", arch: "x64", expectedSupported: false },
        { platform: "linux", arch: "x64", expectedSupported: false },
        { platform: "linux", arch: "arm64", expectedSupported: false },
        { platform: "win32", arch: "x64", expectedSupported: false },
        { platform: "win32", arch: "arm64", expectedSupported: false },
      ];

      for (const item of matrix) {
        const baseCtx = createContext({
          home: homeDir,
          dataDir: join(dataDir, `status-${item.platform}-${item.arch}`),
          toolDirs: [binDir],
        });
        const pCtx = {
          ...baseCtx,
          platform: item.platform,
          arch: item.arch,
        };
        const st = await getPhononStatus(pCtx);
        expect(st.supported).toBe(item.expectedSupported);
        expect(st.crossPlatformTtsReady).toBe(true);
        expect(st.activeTtsEngine).toBeTruthy();
        expect(st.ttsEngineLabel).toBeTruthy();
        expect(st.ollamaInstalled).toBe(true);
        expect(st.ffmpegInstalled).toBe(true);
        expect(st.modelInstalled).toBe(true);
        expect(st.ready).toBe(item.expectedSupported);
        expect(st.install.canAutoInstallOllama).toBe(item.expectedSupported);
      }

      // 1b. Cross-Platform Voice Spec & Non-MLX Fallback Synthesis on Linux & Windows (without Ollama or when MLX is unsupported)
      const russellSpec = resolveCrossPlatformVoiceSpec("Russell");
      expect(russellSpec.gender).toBe("male");
      expect(russellSpec.f0Hz).toBe(116);
      expect(russellSpec.edgeVoice).toBe("en-AU-WilliamNeural");

      const zoeySpec = resolveCrossPlatformVoiceSpec("Zoey");
      expect(zoeySpec.gender).toBe("female");
      expect(zoeySpec.f0Hz).toBe(194);

      const cadenceWav = synthesizePureBunWordCadenceWav(
        "The world was dead, and winter was rising.",
        "Russell",
      );
      const parsedCadence = parseWavPcm(cadenceWav);
      expect(parsedCadence.sampleRate).toBe(24000);
      expect(parsedCadence.pcmData.length).toBeGreaterThan(24000);
      const cadenceTimings = computeWordTimingsForText(
        "The world was dead, and winter was rising.",
        Math.round((parsedCadence.pcmData.length / 48000) * 1000),
        0,
        0,
        { pcmData: parsedCadence.pcmData, sampleRate: 24000, speed: 1 },
      );
      expect(cadenceTimings.length).toBe(8);
      expect(cadenceTimings[0]!.word).toBe("The");
      expect(cadenceTimings[7]!.word).toBe("rising.");

      // Verify Linux & Windows synthesize speech & Read-Along MP4 even when Ollama is absent (non-MLX fallback)
      for (const nonMlxPlat of ["linux", "win32"] as const) {
        const fbDir = join(root, `fallback-${nonMlxPlat}`);
        const fbBin = join(fbDir, "bin-ffmpeg-only");
        mkdirSync(fbBin, { recursive: true });
        writeFileSync(
          join(fbBin, nonMlxPlat === "win32" ? "ffmpeg.exe" : "ffmpeg"),
          readFileSync(join(binDir, "ffmpeg")),
        );
        chmodSync(
          join(fbBin, nonMlxPlat === "win32" ? "ffmpeg.exe" : "ffmpeg"),
          0o755,
        );
        const fbCtx = {
          ...createContext({
            home: homeDir,
            dataDir: join(fbDir, "data"),
            toolDirs: [fbBin],
          }),
          platform: nonMlxPlat,
        };
        const spk = await speakChunk(fbCtx, {
          text: `Native cross-platform speech on ${nonMlxPlat} without MLX.`,
          voice: "Russell",
        });
        expect(spk.sampleRate).toBe(24000);
        expect(spk.words.length).toBe(7);
        expect(spk.cues.length).toBeGreaterThanOrEqual(1);

        const fbMp4 = join(fbDir, `fallback-${nonMlxPlat}.mp4`);
        const fbExport = await synthesizeAndExportAudioFile(fbCtx, {
          ollamaExe: "",
          ffmpegExe: resolveTool(fbCtx, "ffmpeg"),
          chunks: splitTextForPhonon(
            `Cross-platform Read-Along MP4 on ${nonMlxPlat} with Russell voice.`,
            { maxChars: 520, mergeShortParagraphs: true },
          ),
          voice: "Russell",
          format: "mp4",
          speed: 1,
          pauseMs: 140,
          outputPath: fbMp4,
          aspectRatio: "16:9",
          videoTheme: "midnight",
          saveSubtitles: true,
          title: `Fallback (${nonMlxPlat})`,
        });
        expect(existsSync(fbExport.outputPath)).toBe(true);
        expect(fbExport.srtPath && existsSync(fbExport.srtPath)).toBe(true);
        expect(fbExport.vttPath && existsSync(fbExport.vttPath)).toBe(true);
      }

      // 1c. Verify Linux espeak-ng and Windows PowerShell System.Speech CLI synthesis via toolDirs + lfm3-omni detection
      const linuxCliDir = join(root, "linux-espeak-cli");
      mkdirSync(linuxCliDir, { recursive: true });
      const fakeEspeak = `#!/usr/bin/env bun
import { writeFileSync } from "fs";
const args = process.argv.slice(2);
const wIdx = args.indexOf("-w");
const outPath = wIdx >= 0 ? args[wIdx + 1] : "";
if (outPath) {
  const pcm = Buffer.alloc(24000 * 2);
  for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round(Math.sin(i * 0.08) * 14000), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(outPath, Buffer.concat([header, pcm]));
}
process.exit(0);
`;
      writeFileSync(join(linuxCliDir, "espeak-ng"), fakeEspeak);
      chmodSync(join(linuxCliDir, "espeak-ng"), 0o755);
      const fakeLfmOllama = `#!/bin/sh
if [ "$1" = "--version" ]; then echo "ollama version is 0.40.12"; exit 0; fi
if [ "$1" = "show" ]; then exit 1; fi
if [ "$1" = "list" ]; then echo "lfm3-omni:latest"; exit 0; fi
exit 1
`;
      writeFileSync(join(linuxCliDir, "ollama"), fakeLfmOllama);
      chmodSync(join(linuxCliDir, "ollama"), 0o755);

      const linuxCliCtx = {
        ...createContext({
          home: homeDir,
          dataDir: join(linuxCliDir, "data"),
          toolDirs: [linuxCliDir],
        }),
        platform: "linux" as const,
        arch: "x64",
      };
      const linuxLfmStatus = await getPhononStatus(linuxCliCtx);
      expect(linuxLfmStatus.modelInstalled).toBe(true);
      expect(linuxLfmStatus.crossPlatformTtsReady).toBe(true);
      const linuxEspeakSpk = await speakChunk(linuxCliCtx, {
        text: "Linux espeak-ng synthesis verified.",
        voice: "Russell",
      });
      expect(linuxEspeakSpk.sampleRate).toBe(24000);
      expect(linuxEspeakSpk.words.length).toBe(4);

      // 1d. Verify 5x7 ASCII bitmap font BMP fallback renderer for clean Windows/Linux systems without Cairo/Pango
      const sampleTl = computeReadAlongTimeline([
        {
          index: 0,
          paragraphIndex: 0,
          text: "Hello Linux and Windows Read-Along Video!",
          startMs: 0,
          endMs: 2400,
          durationMs: 2400,
          pcmData: parsedCadence.pcmData,
          sampleRate: 24000,
          speed: 1,
        },
      ]);
      const bmpBuf = buildReadAlongSlideBmpFallback({
        timeline: sampleTl,
        slide: {
          slideIndex: 0,
          startMs: 0,
          endMs: 400,
          cueIndex: 0,
          activeWordInCue: 1,
          spokenWordsInCue: 1,
        },
        aspect: VIDEO_ASPECT_INFO["16:9"],
        videoTheme: "midnight",
      });
      expect(bmpBuf.subarray(0, 2).toString("ascii")).toBe("BM");
      expect(bmpBuf.readInt32LE(18)).toBe(1920);
      expect(Math.abs(bmpBuf.readInt32LE(22))).toBe(1080);

      // 1e. Verify UI api.js enables Voice Reader across darwin, linux, and win32
      const apiJsText = readFileSync(
        "resources/file_manager/ui/api.js",
        "utf8",
      );
      expect(apiJsText).toContain(
        'p === "darwin" || p === "linux" || p === "win32"',
      );

      // 2. Synthesis and Read-Along MP4 Video + SRT/VTT export across darwin, linux, and win32 contexts
      for (const plat of ["darwin", "linux", "win32"] as const) {
        const pDir = join(root, `export-${plat}`);
        mkdirSync(pDir, { recursive: true });
        const baseCtx = createContext({
          home: homeDir,
          dataDir: join(pDir, "data"),
          toolDirs: [binDir],
        });
        const pCtx = { ...baseCtx, platform: plat };
        const ollamaExe = resolveTool(pCtx, "ollama");
        const ffmpegExe = resolveTool(pCtx, "ffmpeg");
        expect(ollamaExe).toBeTruthy();
        expect(ffmpegExe).toBeTruthy();

        const wavBuf = await synthesizePhononChunkWav(
          pCtx,
          ollamaExe!,
          `Cross-platform speech check on ${plat}.`,
          "Zoey",
        );
        expect(wavBuf.subarray(0, 4).toString("ascii")).toBe("RIFF");

        const chunks = splitTextForPhonon(
          `# BOOK ONE: WINTER'S RISING\r\n\r\n## Chapter One - "The Wasteland"\r\n\r\nThe world was... dead. Not the kind of dead that says: zombies.`,
          { maxChars: 520, mergeShortParagraphs: true },
        );
        const outMp4 = join(pDir, `read-along-${plat}.mp4`);
        const res = await synthesizeAndExportAudioFile(pCtx, {
          ollamaExe: ollamaExe!,
          ffmpegExe,
          chunks,
          voice: "Zoey",
          format: "mp4",
          speed: 1,
          pauseMs: 140,
          outputPath: outMp4,
          aspectRatio: "16:9",
          videoTheme: "midnight",
          saveSubtitles: true,
          title: `Read-Along (${plat})`,
        });
        expect(existsSync(res.outputPath)).toBe(true);
        expect(res.srtPath && existsSync(res.srtPath)).toBe(true);
        expect(res.vttPath && existsSync(res.vttPath)).toBe(true);
      }

      // 3. CRLF (\r\n) & Windows file paths (C:\Users\..., \\server\share\...) preservation across text cleaners and aligner
      const winTextCrlf =
        "# Chapter 1\r\n\r\nOpen C:\\Users\\alice\\Documents\\book.epub or \\\\server\\share\\notes.txt.\r\n====\r\nThe world was... dead.\r\n";
      const winTextLf = winTextCrlf.replace(/\r\n/g, "\n");
      expect(cleanEpubAndPandocClutter(winTextCrlf)).toBe(
        cleanEpubAndPandocClutter(winTextLf),
      );
      expect(cleanEpubAndPandocClutter(winTextCrlf)).toContain(
        "C:\\Users\\alice\\Documents\\book.epub",
      );
      expect(cleanEpubAndPandocClutter(winTextCrlf)).toContain(
        "\\\\server\\share\\notes.txt",
      );
      expect(cleanTextForSpeech(winTextCrlf)).toBe(
        cleanTextForSpeech(winTextLf),
      );
      expect(cleanTextForSpeech(winTextCrlf)).toContain(
        "C:\\Users\\alice\\Documents\\book.epub",
      );

      const timingsCrlf = computeWordTimingsForText(winTextCrlf, 4000, 0, 0);
      const timingsLf = computeWordTimingsForText(winTextLf, 4000, 0, 0);
      expect(timingsCrlf).toEqual(timingsLf);
    });
  },
);

// Real Ollama + Phonon integration test when installed on the host machine
const realCtx = createContext({});
const realOllama = resolveTool(realCtx, "ollama");
const hasRealPhonon = (() => {
  if (!realOllama) return false;
  try {
    const r = Bun.spawnSync([realOllama, "list"], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 4000,
    });
    return r.exitCode === 0 && /\bphonon\b/i.test(r.stdout.toString());
  } catch {
    return false;
  }
})();

describe("with real Ollama & Phonon model", () => {
  test.skipIf(!hasRealPhonon)(
    "synthesizes real speech audio and exports a real Read-Along MP4 Video with `ollama run phonon --voice Zoey`",
    async () => {
      const ctx = createContext({
        home: root,
        dataDir: join(root, "real-data"),
      });
      const status = await getPhononStatus(ctx);
      expect(status.ready).toBe(true);
      expect(status.voices.length).toBeGreaterThanOrEqual(38);

      const { synthesizePhononChunkWav, synthesizeAndExportAudioFile } =
        await import("../src/features/filemanager/fmPhonon");
      const wav = await synthesizePhononChunkWav(
        ctx,
        status.ollamaPath!,
        "Hello from Codecaine File Manager.",
        "Zoey",
      );
      const parsed = parseWavPcm(wav);
      expect(parsed.sampleRate).toBe(24000);
      expect(parsed.bitsPerSample).toBe(16);
      expect(parsed.pcmData.length).toBeGreaterThan(10_000);

      const ffmpegExe = resolveTool(ctx, "ffmpeg");
      if (ffmpegExe) {
        const outMp4 = join(root, "real-read-along.mp4");
        const chunks = splitTextForPhonon(
          "Welcome to Codecaine Phonon Read-Along Video! Follow along word by word.",
          { maxChars: 200 },
        );
        const stageLines: string[] = [];
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
          onStageLog: (line) => stageLines.push(line),
        });
        expect(existsSync(videoOut.outputPath)).toBe(true);
        expect(videoOut.sizeBytes).toBeGreaterThan(1000);
        expect(videoOut.srtPath && existsSync(videoOut.srtPath)).toBe(true);
        expect(videoOut.vttPath && existsSync(videoOut.vttPath)).toBe(true);
        expect(
          stageLines.some((l) => /All \d+ chunks? synthesized/i.test(l)),
        ).toBe(true);
        expect(
          stageLines.some((l) => /Finalizing real-read-along\.mp4/i.test(l)),
        ).toBe(true);

        // Verify that the exported .mp4 has burned-in Read-Along text & highlight in the exact center of the screen (960, 540)
        const probeCenter = Bun.spawnSync(
          [
            ffmpegExe,
            "-v",
            "error",
            "-ss",
            "0.8",
            "-i",
            videoOut.outputPath,
            "-vf",
            "crop=400:160:760:460",
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
          ],
          { stdout: "pipe", stderr: "pipe", timeout: 10_000 },
        );
        expect(probeCenter.exitCode).toBe(0);
        const rgb = Buffer.from(probeCenter.stdout);
        expect(rgb.length).toBe(400 * 160 * 3);
        let maxLuma = 0;
        for (let i = 0; i < rgb.length; i++) {
          if (rgb[i]! > maxLuma) maxLuma = rgb[i]!;
        }
        // Bright white/cyan text and highlight pill at screen center must exceed 200 (vs dark #0b1020 background ~32)
        expect(maxLuma).toBeGreaterThan(200);
      }
    },
  );

  test("cross-platform Text/Voice Reader Studio synthesizes real 24 kHz speech and exports Read-Along MP4 on non-MLX platforms (Windows/Linux/macOS)", async () => {
    const {
      resolveCrossPlatformVoiceSpec,
      synthesizeCrossPlatformTtsChunkWav,
      speakChunk,
      synthesizeAndExportAudioFile,
    } = await import("../src/features/filemanager/fmPhonon");
    const { getBionicTtsConfigAndVoices, runBionicSpeech } =
      await import("../src/features/filemanager/fmBionic");

    // 1. Verify all 38 built-in Phonon voices have valid cross-platform voice specs
    for (const v of DEFAULT_PHONON_VOICES) {
      const spec = resolveCrossPlatformVoiceSpec(v.id);
      expect(["male", "female"]).toContain(spec.gender);
      expect(spec.f0Hz).toBeGreaterThanOrEqual(85);
      expect(spec.f0Hz).toBeLessThanOrEqual(250);
      expect(spec.edgeVoice.length).toBeGreaterThan(5);
      expect(spec.espeakVoice.length).toBeGreaterThan(3);
      expect(spec.macSayVoice.length).toBeGreaterThan(2);
    }

    // 2. Synthesize 24 kHz speech chunk on current host platform
    const xplatDir = mkdtempSync(join(tmpdir(), "fm-xplat-host-"));
    try {
      const hostCtx = createContext({
        home: realCtx.home,
        dataDir: join(xplatDir, "data"),
      });

      const wavRussell = await synthesizeCrossPlatformTtsChunkWav(
        hostCtx,
        "Hello from Windows ARM64 Text and Voice Reader Studio.",
        "Russell",
      );
      const parsedRussell = parseWavPcm(wavRussell);
      expect(parsedRussell.sampleRate).toBe(24000);
      expect(parsedRussell.bitsPerSample).toBe(16);
      expect(parsedRussell.numChannels).toBe(1);
      expect(parsedRussell.pcmData.length).toBeGreaterThan(10_000);

      const spkZoey = await speakChunk(hostCtx, {
        text: "Follow along word by word on Windows and Linux without MLX.",
        voice: "Zoey",
      });
      expect(spkZoey.sampleRate).toBe(24000);
      expect(spkZoey.words.length).toBe(11);
      expect(spkZoey.cues.length).toBeGreaterThanOrEqual(1);

      // 3. If Bionic native TTS (`xn-ptts`) is installed on this host, verify native Bionic speech synthesis across voices and Linux/Windows backends
      const bionicTts = getBionicTtsConfigAndVoices(hostCtx);
      if (bionicTts.engineInstalled) {
        expect(bionicTts.voices.length).toBeGreaterThanOrEqual(37);
        const bionicRes = await runBionicSpeech(hostCtx, {
          input:
            "Native Bionic Phonon 40M Multilingual speech on Windows ARM64.",
          voice: "Russell",
        });
        expect(bionicRes.ok).toBe(true);
        expect(bionicRes.sampleRate).toBe(24000);
        expect(bionicRes.voice).toBe("Russell");
        expect(bionicRes.engine).toContain("xn-ptts-");

        // Verify Linux ARM64 & Linux x64 Bionic TTS backend resolution
        const linuxArmCfg = getBionicTtsConfigAndVoices({
          ...hostCtx,
          platform: "linux",
          arch: "arm64",
        });
        expect(linuxArmCfg.voices.length).toBeGreaterThanOrEqual(37);
        if (linuxArmCfg.engineInstalled) {
          expect(linuxArmCfg.enginePath).toContain("xn-ptts-linux-arm64");
        }
        const linuxX64Cfg = getBionicTtsConfigAndVoices({
          ...hostCtx,
          platform: "linux",
          arch: "x64",
        });
        if (linuxX64Cfg.engineInstalled) {
          expect(linuxX64Cfg.enginePath).toContain("xn-ptts-linux-x86_64");
        }

        // Verify clause-locked Read-Out-Loud word highlight synchronization on multi-clause acronym-heavy text
        const multiClauseSample =
          "Welcome to the Codecaine Phonon Voice Studio! Powered by Ollama and Gradium Phonon TTS on Apple Silicon MLX, you can follow along word by word as your document is read out loud, convert any file format into clean plain text, and export synchronized Read-Along Videos in MP4, WebM, MOV, or MKV alongside WAV, MP3, M4A, and FLAC audio.";
        const spkSync = await speakChunk(hostCtx, {
          text: multiClauseSample,
          voice: "Zoey",
        });
        expect(spkSync.words.length).toBe(58);
        // Verify >20s chunks are never truncated at 20.0s during 24 kHz WAV normalization
        expect(spkSync.durationSec).toBeGreaterThan(22);
        // Verify fast function words ("to", "the") do not delay "Codecaine"
        expect(spkSync.words[1]?.word).toBe("to");
        expect(spkSync.words[1]!.durationMs).toBeLessThanOrEqual(150);
        expect(spkSync.words[3]?.word).toBe("Codecaine");
        expect(spkSync.words[3]!.startMs).toBeLessThanOrEqual(820);
        const loudWord = spkSync.words.find((w) => w.word === "loud,");
        const textWord = spkSync.words.find((w) => w.word === "text,");
        const mp4Word = spkSync.words.find((w) => w.word === "MP4,");
        expect(loudWord).toBeDefined();
        expect(textWord).toBeDefined();
        expect(mp4Word).toBeDefined();
        // Because the final clause spells out 8 uppercase acronyms (~11s), unanchored global alignment
        // would push "loud," and "text," 1.5-2.0s too early; clause-locked alignment keeps them in exact lockstep.
        expect(textWord!.startMs).toBeGreaterThan(loudWord!.endMs + 100);
        expect(mp4Word!.startMs).toBeGreaterThan(textWord!.endMs + 1500);
      }

      // 4. If ffmpeg is installed on the host, verify Read-Along MP4 Video export on non-MLX platform
      const ffmpegExe = resolveTool(hostCtx, "ffmpeg");
      if (ffmpegExe) {
        const outMp4 = join(xplatDir, "xplat-read-along.mp4");
        const chunks = splitTextForPhonon(
          "Cross-platform Read-Along Video works natively on Windows, Linux, and macOS.",
          { maxChars: 200 },
        );
        const videoOut = await synthesizeAndExportAudioFile(hostCtx, {
          ollamaExe: "",
          ffmpegExe,
          chunks,
          voice: "Russell",
          format: "mp4",
          speed: 1,
          pauseMs: 150,
          outputPath: outMp4,
          aspectRatio: "16:9",
          videoTheme: "midnight",
          saveSubtitles: true,
          title: "Cross-Platform Read-Along",
        });
        expect(existsSync(videoOut.outputPath)).toBe(true);
        expect(videoOut.sizeBytes).toBeGreaterThan(1000);
        expect(videoOut.srtPath && existsSync(videoOut.srtPath)).toBe(true);
        expect(videoOut.vttPath && existsSync(videoOut.vttPath)).toBe(true);
      }
    } finally {
      rmSync(xplatDir, { recursive: true, force: true });
    }
  });

  test("Linux Piper --json-input per-clause synthesis & Windows SAPI SpeakProgress prevent Russell voice speed-up and keep word sync", async () => {
    const { speakChunk } = await import("../src/features/filemanager/fmPhonon");
    const testDir = mkdtempSync(join(tmpdir(), "fm-linux-win-russell-"));
    try {
      const multiClauseSample =
        "Welcome to the Codecaine Phonon Voice Studio! Powered by Ollama and Gradium Phonon TTS on Apple Silicon MLX, you can follow along word by word as your document is read out loud, convert any file format into clean plain text, and export synchronized Read-Along Videos in MP4, WebM, MOV, or MKV alongside WAV, MP3, M4A, and FLAC audio.";

      // 1. Linux (`linux/x64` & `linux/arm64`) with Piper `--json-input` per-clause synthesizer
      const linuxBinDir = join(testDir, "linux-bin");
      mkdirSync(linuxBinDir, { recursive: true });
      const piperArgsLog = join(testDir, "piper-args.log");
      const piperJsonLog = join(testDir, "piper-json.log");
      const piperStubPath = join(linuxBinDir, "piper");
      writeFileSync(
        piperStubPath,
        `#!/usr/bin/env bun
import { appendFileSync, writeFileSync } from "fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(piperArgsLog)}, args.join(" ") + "\\n");
const stdinText = await new Response(Bun.stdin.stream()).text();
appendFileSync(${JSON.stringify(piperJsonLog)}, stdinText);

function writeMonoWav(outPath: string, durationSec: number, freqHz: number) {
  const sr = 22050;
  const numSamples = Math.round(sr * durationSec);
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sr;
    // Pad 60ms leading & 80ms trailing silence around clear speech envelope
    const inSpeech = t >= 0.06 && t <= durationSec - 0.08;
    const sample = inSpeech ? Math.round(Math.sin(2 * Math.PI * freqHz * t) * 12000) : 0;
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  writeFileSync(outPath, buf);
}

if (args.includes("--json-input")) {
  const lines = stdinText.split(/\\r?\\n/).filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const item = JSON.parse(line);
    const words = String(item.text || "").trim().split(/\\s+/).filter(Boolean).length;
    // Steady 0.38s per word for every clause (verifies clauses are <= 15 words so Ryan/Russell never collapses)
    if (words > 15) process.exit(99);
    writeMonoWav(item.output_file, Math.max(0.6, words * 0.38), 120);
  }
  process.exit(0);
}
const outIdx = args.indexOf("--output_file");
if (outIdx >= 0 && args[outIdx + 1]) {
  writeMonoWav(args[outIdx + 1], 3.5, 120);
  process.exit(0);
}
process.exit(1);
`,
      );
      chmodSync(piperStubPath, 0o755);

      const linuxCtx = createContext({
        home: join(testDir, "linux-home"),
        dataDir: join(testDir, "linux-data"),
        platform: "linux",
        toolDirs: [linuxBinDir],
      });

      for (const voiceName of ["Russell", "Zoey", "default"]) {
        const spk = await speakChunk(linuxCtx, {
          text: multiClauseSample,
          voice: voiceName,
        });
        expect(spk.sampleRate).toBe(24000);
        expect(spk.words.length).toBe(58);
        expect(spk.durationSec).toBeGreaterThan(18);
        for (let i = 1; i < spk.words.length; i++) {
          expect(spk.words[i]!.startMs).toBeGreaterThanOrEqual(
            spk.words[i - 1]!.startMs,
          );
        }
      }
      if (process.platform !== "win32") {
        const loggedJsonLines = readFileSync(piperJsonLog, "utf8")
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        expect(loggedJsonLines.length).toBeGreaterThanOrEqual(6);
        for (const line of loggedJsonLines) {
          const parsedLine = JSON.parse(line);
          const wordCount = String(parsedLine.text)
            .trim()
            .split(/\s+/)
            .filter(Boolean).length;
          expect(wordCount).toBeLessThanOrEqual(15);
        }
      }

      // 2. Windows (`win32/x64` & `win32/arm64`) with System.Speech.Synthesis.SpeechSynthesizer + SpeakProgress word anchors
      if (process.platform !== "win32") {
        const winBinDir = join(testDir, "win-bin");
        mkdirSync(winBinDir, { recursive: true });
        const psLog = join(testDir, "win-ps.log");
        for (const stubName of ["pwsh", "pwsh.exe"]) {
          const p = join(winBinDir, stubName);
          writeFileSync(
            p,
            `#!/usr/bin/env bun
import { appendFileSync, writeFileSync } from "fs";
const cmd = process.argv.join(" ");
appendFileSync(${JSON.stringify(psLog)}, cmd + "\\n");
const outWav = process.env.FM_TTS_OUT || "";
const outWords = process.env.FM_TTS_WORDS || "";
const txt = process.env.FM_TTS_TEXT || "";
const words = txt.trim().split(/\\s+/).filter(Boolean);
const sr = 24000;
const durSec = Math.max(1.5, words.length * 0.36);
const numSamples = Math.round(sr * durSec);
const dataBytes = numSamples * 2;
const buf = Buffer.alloc(44 + dataBytes);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24);
buf.writeUInt32LE(sr * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < numSamples; i++) {
  buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 140 * i) / sr) * 10000), 44 + i * 2);
}
writeFileSync(outWav, buf);
if (outWords) {
  const wordBounds = words.map((w, idx) => ({
    startMs: Math.round(idx * 360),
    endMs: Math.round(idx * 360 + 300),
    text: w.replace(/[^\\p{L}\\p{N}]/gu, ""),
  }));
  writeFileSync(outWords, JSON.stringify(wordBounds));
}
`,
          );
          chmodSync(p, 0o755);
        }

        const winCtx = createContext({
          home: join(testDir, "win-home"),
          dataDir: join(testDir, "win-data"),
          platform: "win32",
          toolDirs: [winBinDir],
        });

        for (const voiceName of ["Russell", "Zoey", "default"]) {
          const spkWin = await speakChunk(winCtx, {
            text: multiClauseSample,
            voice: voiceName,
          });
          expect(spkWin.sampleRate).toBe(24000);
          expect(spkWin.words.length).toBe(58);
          expect(spkWin.durationSec).toBeGreaterThan(18);
        }
        const psLogTxt = readFileSync(psLog, "utf8");
        expect(psLogTxt).toContain("$s.Rate = 0;");
        expect(psLogTxt).toContain("VoiceGender]::Male");
        expect(psLogTxt).toContain("VoiceGender]::Female");
      }
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
