import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { resolveSayCliDelegatedArgs } from "../cli_apps/say_cli";
import {
  cleanDocumentForTts,
  cleanDocumentWithOllamaLlm,
  runTtsCli,
} from "../cli_apps/tts_cli";
import { createContext } from "../src/features/filemanager/fmCore";
import {
  analyzeAudioMasteringMetrics,
  applyDualTrackLexicon,
  applyMasterChainPcm,
  applyMasterChainStereoPcm,
  buildFfmetadataChapters,
  cleanTextForSpeech,
  computeDiscoursePauseMs,
  computeFrameSpectralFlux,
  computeWordTimingsForText,
  createComfortRoomTonePcm,
  createWavHeader,
  escapeFfmetadataValue,
  expandTechnicalAndNumericForSpeech,
  extractCoverFromEpubArchive,
  formatLrcSyncedLyrics,
  generateAudiobookCoverBmp,
  generatePodcastScriptFromDocument,
  getEmotionProsodyModifiers,
  isAbbreviationOrInitialBeforePeriod,
  levelChunksSpeechRmsPcm,
  loadPronunciationLexicon,
  masterChunkSeamPcm,
  matchParagraphProsodyContinuityPcm,
  panMonoToStereoPcm,
  parseStageAndDialogueSegments,
  parseWavPcm,
  PHONON_OPS,
  PhononDiskCheckpoint,
  pitchShiftFormantPreservedPcm,
  remapWordsToDisplayLexicon,
  sanitizeSafeFilenameStem,
  selectOptimalCloningWindowPcm,
  speakChunk,
  splitFirstClauseForFastStart,
  splitTextForPhonon,
  stripStageDirectionTags,
  synthesizeAndExportAudioFile,
  timeStretchSpeechPcm,
  verifyLlmCleanedFidelity,
  verifySynthesizedChunkPcm,
} from "../src/features/filemanager/fmPhonon";
import { rmDir } from "./helpers/rm";

const root = mkdtempSync(join(tmpdir(), "tts-master-qa-"));
const home = join(root, "home");
const dataDir = join(root, "data");
const toolDir = join(root, "tools");
const workDir = join(root, "work");

function makeHarmonicSpeechLikePcm(opts: {
  durationSec?: number;
  sampleRate?: number;
  f0Hz?: number;
  amp?: number;
  dcOffset?: number;
  leadSilenceSec?: number;
  tailSilenceSec?: number;
  sibilantBurst?: boolean;
}): Buffer {
  const sampleRate = opts.sampleRate ?? 24000;
  const speechSamples = Math.max(
    240,
    Math.round(sampleRate * (opts.durationSec ?? 0.8)),
  );
  const leadSamples = Math.round(sampleRate * (opts.leadSilenceSec ?? 0));
  const tailSamples = Math.round(sampleRate * (opts.tailSilenceSec ?? 0));
  const totalSamples = leadSamples + speechSamples + tailSamples;
  const amp = opts.amp ?? 0.32;
  const dc = opts.dcOffset ?? 0;
  const f0 = opts.f0Hz ?? 185;
  const pcm = Buffer.alloc(totalSamples * 2);

  for (let i = 0; i < totalSamples; i++) {
    let val = dc;
    if (i >= leadSamples && i < leadSamples + speechSamples) {
      const k = i - leadSamples;
      const t = k / sampleRate;
      const sylEnv = 0.65 + 0.35 * Math.sin(2 * Math.PI * 3.8 * t);
      const edgeDist = Math.min(k, speechSamples - 1 - k);
      const edgeEnv =
        edgeDist >= 400 ? 1.0 : Math.sin((Math.PI * edgeDist) / 800);
      let harmonic =
        Math.sin(2 * Math.PI * f0 * t) * 0.55 +
        Math.sin(2 * Math.PI * f0 * 2 * t) * 0.25 +
        Math.sin(2 * Math.PI * f0 * 3 * t) * 0.12 +
        Math.sin(2 * Math.PI * f0 * 5 * t) * 0.08;
      if (
        opts.sibilantBurst &&
        k > speechSamples * 0.4 &&
        k < speechSamples * 0.55
      ) {
        harmonic += Math.sin(2 * Math.PI * 6800 * t) * 0.9;
      }
      val += harmonic * amp * sylEnv * Math.max(0.15, edgeEnv);
    }
    const clamped = Math.max(-32767, Math.min(32767, Math.round(val * 32767)));
    pcm.writeInt16LE(clamped, i * 2);
  }
  return pcm;
}

function wrapMonoWav(pcm: Buffer, sampleRate = 24000): Buffer {
  return Buffer.concat([createWavHeader(pcm.length, sampleRate, 1, 16), pcm]);
}

function buildMinimalZipWithDeflatedEntry(
  entryName: string,
  payload: Buffer,
): Buffer {
  const nameBuf = Buffer.from(entryName, "utf8");
  const compressed = deflateRawSync(payload);
  // CRC32 calculation
  let crc = 0xffffffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload[i]!;
    for (let b = 0; b < 8; b++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  crc = (crc ^ 0xffffffff) >>> 0;

  const localHeader = Buffer.alloc(30 + nameBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8); // Deflate
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(payload.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  nameBuf.copy(localHeader, 30);

  const cdOffset = localHeader.length + compressed.length;
  const cdHeader = Buffer.alloc(46 + nameBuf.length);
  cdHeader.writeUInt32LE(0x02014b50, 0);
  cdHeader.writeUInt16LE(20, 4);
  cdHeader.writeUInt16LE(20, 6);
  cdHeader.writeUInt16LE(8, 10);
  cdHeader.writeUInt32LE(crc, 16);
  cdHeader.writeUInt32LE(compressed.length, 20);
  cdHeader.writeUInt32LE(payload.length, 24);
  cdHeader.writeUInt16LE(nameBuf.length, 28);
  cdHeader.writeUInt32LE(0, 42);
  nameBuf.copy(cdHeader, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdHeader.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);

  return Buffer.concat([localHeader, compressed, cdHeader, eocd]);
}

beforeAll(() => {
  process.env.TTS_CLI_NO_AUDIO = "1";
  mkdirSync(home, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(toolDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });

  const samplePcm = makeHarmonicSpeechLikePcm({
    durationSec: 0.65,
    sampleRate: 24000,
    f0Hz: 190,
    amp: 0.3,
  });
  const sampleWavHex = wrapMonoWav(samplePcm, 24000).toString("hex");
  const promptLogPath = join(root, "ollama_prompts.jsonl");

  const ollamaJs = join(toolDir, "ollama_qa_mock.js");
  writeFileSync(
    ollamaJs,
    `#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "--version" || args[0] === "-v") {
  console.log("ollama version is 0.40.16");
  process.exit(0);
}
if (args[0] === "show") {
  console.log("  Model\\n    architecture        gradium_phonon_tts\\n    context length      8192\\n\\n  Voices\\n    Zoey          4096 tokens\\n    Russell       4096 tokens\\n    Easton        4096 tokens\\n    Freya         4096 tokens\\n    Edwin         4096 tokens\\n    Maeve         4096 tokens\\n");
  process.exit(0);
}
if (args[0] === "list") {
  console.log("NAME             ID              SIZE      MODIFIED\\nphonon:latest    58f58601e4e8    112 MB    1 day ago\\n");
  process.exit(0);
}
if (args[0] === "run") {
  const model = args[1] || "";
  let stdinText = "";
  try {
    stdinText = await Bun.stdin.text();
  } catch {}
  const prompt = (args.slice(2).join(" ") + " " + stdinText).trim();
  try {
    appendFileSync(${JSON.stringify(promptLogPath)}, JSON.stringify({ model, prompt }) + "\\n");
  } catch {}
  if (model.startsWith("phonon")) {
    process.stdout.write(Buffer.from("${sampleWavHex}", "hex"));
    process.exit(0);
  }
}
process.exit(0);
`,
    "utf8",
  );

  const ffmpegJs = join(toolDir, "ffmpeg_qa_mock.js");
  writeFileSync(
    ffmpegJs,
    `#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const outArg = args[args.length - 1] || "out.mp3";
writeFileSync(outArg, Buffer.from("${sampleWavHex}", "hex"));
process.exit(0);
`,
    "utf8",
  );

  if (process.platform === "win32") {
    writeFileSync(
      join(toolDir, "ollama.cmd"),
      `@echo off\r\n"${process.execPath}" "${ollamaJs}" %*\r\n`,
    );
    writeFileSync(
      join(toolDir, "ffmpeg.cmd"),
      `@echo off\r\n"${process.execPath}" "${ffmpegJs}" %*\r\n`,
    );
    // Extensionless shims so simulated darwin/linux FmContexts also resolve tools on Windows runners
    writeFileSync(join(toolDir, "ollama"), readFileSync(ollamaJs, "utf8"));
    writeFileSync(join(toolDir, "ffmpeg"), readFileSync(ffmpegJs, "utf8"));
  } else {
    const ollamaSh = join(toolDir, "ollama");
    const ffmpegSh = join(toolDir, "ffmpeg");
    const ollamaExeShim = join(toolDir, "ollama.exe");
    const ffmpegExeShim = join(toolDir, "ffmpeg.exe");
    const ollamaScript = `#!/usr/bin/env sh\nexec "${process.execPath}" "${ollamaJs}" "$@"\n`;
    const ffmpegScript = `#!/usr/bin/env sh\nexec "${process.execPath}" "${ffmpegJs}" "$@"\n`;
    writeFileSync(ollamaSh, ollamaScript);
    writeFileSync(ffmpegSh, ffmpegScript);
    writeFileSync(ollamaExeShim, ollamaScript);
    writeFileSync(ffmpegExeShim, ffmpegScript);
    chmodSync(ollamaSh, 0o755);
    chmodSync(ffmpegSh, 0o755);
    chmodSync(ollamaExeShim, 0o755);
    chmodSync(ffmpegExeShim, 0o755);
  }
});

afterAll(() => {
  rmDir(root);
});

async function waitForJobDone(
  ctx: ReturnType<typeof createContext>,
  jobId: string,
  timeoutMs = 25000,
) {
  const deadline = Date.now() + timeoutMs;
  const findState = () => ctx.jobs.list().find((j) => j.id === jobId)?.state;
  let state = findState();
  while (
    (state === "waiting" || state === "running") &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 40));
    state = findState();
  }
  expect(state).toBe("done");
}

describe("AI TTS Master Suite — All 17 Improvements & Cross-Platform QA", () => {
  test("1 & 2. Seam Mastering (`masterChunkSeamPcm`) & Comfort Room Tone (`createComfortRoomTonePcm`)", () => {
    const rawWithDcAndDeadAir = makeHarmonicSpeechLikePcm({
      durationSec: 0.5,
      sampleRate: 24000,
      amp: 0.35,
      dcOffset: 0.08,
      leadSilenceSec: 0.25,
      tailSilenceSec: 0.3,
    });

    const seam = masterChunkSeamPcm(rawWithDcAndDeadAir, 24000, {
      trimSilence: true,
      padMs: 22,
      fadeMs: 6,
    });

    expect(seam.trimmedLeadSamples).toBeGreaterThan(2000);
    expect(seam.trimmedTailSamples).toBeGreaterThan(2500);
    // Raised-cosine micro-fade starts at zero and ends near zero -> zero boundary clicks!
    expect(Math.abs(seam.pcmData.readInt16LE(0))).toBeLessThanOrEqual(2);
    expect(
      Math.abs(seam.pcmData.readInt16LE(seam.pcmData.length - 2)),
    ).toBeLessThanOrEqual(5);

    const postMetrics = analyzeAudioMasteringMetrics(seam.pcmData, 24000);
    expect(Math.abs(postMetrics.dcOffset)).toBeLessThan(0.002);

    // Comfort room tone (~ -62 dBFS non-zero pink noise floor instead of harsh 0x0000 digital black)
    const roomTone = createComfortRoomTonePcm(24000, 24000, -62, 42);
    expect(roomTone.length).toBe(48000);
    let nonZeroCount = 0;
    for (let i = 0; i < 24000; i++) {
      if (roomTone.readInt16LE(i * 2) !== 0) nonZeroCount++;
    }
    expect(nonZeroCount).toBeGreaterThan(12000);
    const roomMetrics = analyzeAudioMasteringMetrics(roomTone, 24000);
    expect(roomMetrics.rmsDbfs).toBeLessThan(-58);
    expect(roomMetrics.rmsDbfs).toBeGreaterThan(-78);
  });

  test("3. Discourse-Aware Pause Scaling (`computeDiscoursePauseMs`)", () => {
    const base = 300;
    const commaPause = computeDiscoursePauseMs({
      prevText: "First,",
      nextText: "we initialize the audio buffer.",
      prevParagraphIndex: 0,
      nextParagraphIndex: 0,
      basePauseMs: base,
    });
    const periodPause = computeDiscoursePauseMs({
      prevText: "We initialize the audio buffer.",
      nextText: "Next we run mastering.",
      prevParagraphIndex: 0,
      nextParagraphIndex: 0,
      basePauseMs: base,
    });
    const questionPause = computeDiscoursePauseMs({
      prevText: "Did the mastering pass succeed?",
      nextText: "Yes, every metric passed.",
      prevParagraphIndex: 0,
      nextParagraphIndex: 0,
      basePauseMs: base,
    });
    const paraPause = computeDiscoursePauseMs({
      prevText: "End of first paragraph.",
      nextText: "Start of second paragraph.",
      prevParagraphIndex: 0,
      nextParagraphIndex: 1,
      basePauseMs: base,
    });
    const headingPause = computeDiscoursePauseMs({
      prevText: "End of prologue.",
      nextText: "Chapter 2: The Acoustic Engine",
      prevParagraphIndex: 0,
      nextParagraphIndex: 1,
      basePauseMs: base,
    });
    const explicitPause = computeDiscoursePauseMs({
      prevText: "Wait right here.",
      nextText: "Now continue.",
      prevParagraphIndex: 0,
      nextParagraphIndex: 0,
      basePauseMs: base,
      explicitPauseAfterMs: 650,
    });

    expect(commaPause).toBeLessThan(periodPause);
    expect(periodPause).toBeLessThan(questionPause);
    expect(questionPause).toBeLessThan(paraPause);
    expect(paraPause).toBeLessThan(headingPause);
    expect(explicitPause).toBe(650);
  });

  test("4. Broadcast & Audible ACX Mastering Chain (`levelChunksSpeechRmsPcm` + `applyMasterChainPcm`)", () => {
    const quietChunk = makeHarmonicSpeechLikePcm({
      durationSec: 0.7,
      amp: 0.08,
    });
    const loudChunk = makeHarmonicSpeechLikePcm({
      durationSec: 0.7,
      amp: 0.65,
      sibilantBurst: true,
    });

    const leveled = levelChunksSpeechRmsPcm(
      [quietChunk, loudChunk],
      24000,
      -19.5,
      11.0,
    );
    const m0 = analyzeAudioMasteringMetrics(leveled[0]!, 24000);
    const m1 = analyzeAudioMasteringMetrics(leveled[1]!, 24000);
    expect(Math.abs(m0.speechRmsDbfs - m1.speechRmsDbfs)).toBeLessThan(3.5);

    // Combine with 15% comfort room tone so noise floor is measurable & realistic
    const roomGap = createComfortRoomTonePcm(4800, 24000, -65, 99);
    const stitched = Buffer.concat([
      leveled[0]!,
      roomGap,
      leveled[1]!,
      roomGap,
    ]);

    const acxMastered = applyMasterChainPcm(stitched, 24000, "acx");
    // Zero sample-count drift (critical for Read-Along karaoke synchronization)
    expect(acxMastered.length).toBe(stitched.length);

    const acxMetrics = analyzeAudioMasteringMetrics(acxMastered, 24000);
    expect(acxMetrics.rmsDbfs).toBeGreaterThanOrEqual(-23.0);
    expect(acxMetrics.rmsDbfs).toBeLessThanOrEqual(-18.0);
    expect(acxMetrics.peakDbfs).toBeLessThanOrEqual(-3.0);
    expect(acxMetrics.noiseFloorDbfs).toBeLessThanOrEqual(-60.0);
    expect(acxMetrics.acxCompliant).toBe(true);

    const podcastMastered = applyMasterChainPcm(stitched, 24000, "podcast");
    const broadcastMastered = applyMasterChainPcm(stitched, 24000, "broadcast");
    const podMetrics = analyzeAudioMasteringMetrics(podcastMastered, 24000);
    const bcastMetrics = analyzeAudioMasteringMetrics(broadcastMastered, 24000);
    expect(podMetrics.rmsDbfs).toBeGreaterThan(bcastMetrics.rmsDbfs);
    expect(podMetrics.peakDbfs).toBeLessThanOrEqual(-1.4);
  });

  test("5 & 6. Formant-Preserved Pitch Shift & Cross-Chunk Prosody Continuity (`--continuity`)", () => {
    const src = makeHarmonicSpeechLikePcm({
      durationSec: 0.6,
      f0Hz: 180,
      amp: 0.3,
    });
    const shiftedDown = pitchShiftFormantPreservedPcm(src, -2.5, 24000);
    const shiftedUp = pitchShiftFormantPreservedPcm(src, 2.5, 24000);
    expect(shiftedDown.length).toBe(src.length);
    expect(shiftedUp.length).toBe(src.length);
    expect(Buffer.compare(shiftedDown, src)).not.toBe(0);

    // Prosody continuity across chunks inside the same paragraph vs across paragraphs
    const firstChunk = makeHarmonicSpeechLikePcm({
      durationSec: 0.6,
      amp: 0.42,
    });
    const suddenQuietSamePara = makeHarmonicSpeechLikePcm({
      durationSec: 0.6,
      amp: 0.16,
    });
    const nextParaQuiet = makeHarmonicSpeechLikePcm({
      durationSec: 0.6,
      amp: 0.16,
    });

    const matched = matchParagraphProsodyContinuityPcm(
      [
        { pcmData: firstChunk, paragraphIndex: 0 },
        { pcmData: suddenQuietSamePara, paragraphIndex: 0 },
        { pcmData: nextParaQuiet, paragraphIndex: 1 },
      ],
      24000,
    );
    const origQuietRms = analyzeAudioMasteringMetrics(
      suddenQuietSamePara,
      24000,
    ).rmsDbfs;
    const matchedSameParaRms = analyzeAudioMasteringMetrics(
      matched[1]!,
      24000,
    ).rmsDbfs;
    const matchedNextParaRms = analyzeAudioMasteringMetrics(
      matched[2]!,
      24000,
    ).rmsDbfs;

    expect(matchedSameParaRms).toBeGreaterThan(origQuietRms + 1.0);
    // Paragraph 1 starts fresh and is NOT forced up to paragraph 0's energy
    expect(matchedNextParaRms).toBeCloseTo(origQuietRms, 1);
  });

  test("7 & 8. Abbreviation Split Guard & Linguistic Technical/Currency/Roman Normalization", () => {
    const tricky =
      "Dr. Sarah Connor met Mr. J. R. R. Tolkien on St. Louis Ave. inside the U.S. Dept. of Defense during v1.5.4 testing. Then they reviewed the acoustic telemetry.";
    const drDotIdx = tricky.indexOf(".");
    expect(isAbbreviationOrInitialBeforePeriod(tricky, drDotIdx)).toBe(true);

    const chunks = splitTextForPhonon(tricky, { maxChars: 125 });
    // Must NEVER split right after "Dr.", "Mr.", "J.", "St.", "Ave.", "U.S.", "Dept.", or inside "v1.5.4"
    for (const c of chunks) {
      expect(/\b(Dr|Mr|St|Ave|Dept)\.$/i.test(c.text.trim())).toBe(false);
    }

    const techText =
      "Chapter IV covers Henry VIII, World War II, $1.5M seed funding, $42.50/mo pricing, €100k grants, v1.5.4, --llm-clean at 24kHz on x86_64 and aarch64 with 32× throughput at 99.9% uptime.";
    const expanded = expandTechnicalAndNumericForSpeech(techText);
    expect(expanded).toContain("Chapter Four");
    expect(expanded).toContain("Henry the Eighth");
    expect(expanded).toContain("World War Two");
    expect(expanded).toContain("1.5 million dollars");
    expect(expanded).toContain("42 dollars and 50 cents");
    expect(expanded).toContain("100 thousand euros");
    expect(expanded).toContain("version 1 point 5 point 4");
    expect(expanded).toContain("dash dash llm clean");
    expect(expanded).toContain("24 kilohertz");
    expect(expanded).toContain("x86 64");
    expect(expanded).toContain("arm 64");
    expect(expanded).toContain("32 times");
    expect(expanded).toContain("99.9%");
  });

  test("9. Dual-Track Pronunciation Lexicon (spoken phonetic audio vs original subtitle spelling)", async () => {
    const dictPath = join(workDir, ".ttsdict.json");
    writeFileSync(
      dictPath,
      JSON.stringify({ Codecaine: "code cane", BunJS: "bun J S" }, null, 2),
      "utf8",
    );

    const lex = loadPronunciationLexicon({
      cwd: workDir,
      includeBuiltins: true,
      inlineEntries: ["FastAPI=fast A P I"],
    });
    const dual = applyDualTrackLexicon(
      "Deploy SQLite and FastAPI on Codecaine with kubectl!",
      lex,
    );
    expect(dual.spokenText).toBe(
      "Deploy sequel lite and fast A P I on code cane with kube control!",
    );
    expect(dual.displayText).toBe(
      "Deploy SQLite and FastAPI on Codecaine with kubectl!",
    );

    const rawWordTimings = computeWordTimingsForText(
      dual.spokenText,
      3200,
      0,
      0,
    );
    const displayWords = remapWordsToDisplayLexicon(
      rawWordTimings,
      dual.spans,
      dual.displayText,
    );
    expect(displayWords.map((w) => w.word)).toEqual([
      "Deploy",
      "SQLite",
      "and",
      "FastAPI",
      "on",
      "Codecaine",
      "with",
      "kubectl!",
    ]);

    // End-to-end export check: Ollama receives "sequel lite", while SRT/VTT show "SQLite"
    const ctx = createContext({
      home,
      dataDir,
      toolDirs: [toolDir],
      platform: "darwin",
      arch: "arm64",
    });
    const outWav = join(workDir, "lexicon-dual-track.wav");
    const ollamaExe = join(
      toolDir,
      process.platform === "win32" ? "ollama.cmd" : "ollama",
    );
    const res = await synthesizeAndExportAudioFile(ctx, {
      ollamaExe,
      ffmpegExe: null,
      chunks: splitTextForPhonon("SQLite powers kubectl smoothly.", {
        maxChars: 200,
      }),
      voice: "Zoey",
      format: "wav",
      speed: 1.0,
      pauseMs: 200,
      outputPath: outWav,
      saveSubtitles: true,
      lexicon: lex,
    });
    expect(existsSync(outWav)).toBe(true);
    expect(res.srtPath && existsSync(res.srtPath)).toBe(true);
    const srtContent = readFileSync(res.srtPath!, "utf8");
    expect(srtContent).toContain("SQLite");
    expect(srtContent).toContain("kubectl");
    expect(srtContent).not.toContain("sequel lite");

    const promptsLog = readFileSync(join(root, "ollama_prompts.jsonl"), "utf8");
    expect(promptsLog).toContain("sequel lite");
  });

  test("10. Verbatim Diff Guard for `--llm-clean` (`verifyLlmCleanedFidelity`)", async () => {
    const sourceProse =
      "The distributed database replicates write-ahead transaction logs across three geographic availability zones using Raft consensus to guarantee zero data loss.";
    const faithfulLlm =
      "The distributed database replicates write-ahead transaction logs across three geographic availability zones using Raft consensus, guaranteeing zero data loss.";
    const hallucinatedSummary =
      "Summary: This short paragraph talks about cloud storage.";

    expect(verifyLlmCleanedFidelity(sourceProse, faithfulLlm).accepted).toBe(
      true,
    );
    const badCheck = verifyLlmCleanedFidelity(sourceProse, hallucinatedSummary);
    expect(badCheck.accepted).toBe(false);
    expect(badCheck.wordRecall).toBeLessThan(0.45);

    // Mock HTTP server returning hallucinated summary -> `cleanDocumentWithOllamaLlm` must reject & preserve source!
    const mockServer = Bun.serve({
      port: 0,
      fetch() {
        return Response.json({
          response: "Here is a brief summary: databases are fast.",
        });
      },
    });
    try {
      const ctx = createContext({
        home,
        dataDir,
        toolDirs: [toolDir],
        platform: "darwin",
        arch: "arm64",
      });
      const llmRes = await cleanDocumentWithOllamaLlm(ctx, sourceProse, {
        cleanModel: "qwen2.5:3b",
        ollamaBaseUrl: `http://127.0.0.1:${mockServer.port}`,
      });
      expect(llmRes.rejectedChunks).toBeGreaterThanOrEqual(1);
      expect(llmRes.text).toContain("Raft consensus");
    } finally {
      mockServer.stop(true);
    }
  });

  test("11. Inline Stage-Direction DSL & Multi-Voice Dialogue Casting (`parseStageAndDialogueSegments`)", () => {
    const stageScript = [
      "[voice: Zoey][emotion: calm] Welcome to the midnight audio drama. [pause: 650ms] Listen closely.",
      "",
      "**Russell:** [emotion: serious] Did you check the perimeter sensors?",
      "**Freya:** [emotion: excited][speed: 1.05] Everything is online and Nominal!",
      "",
      '"Stand fast at the helm," shouted Silas, gripping the wheel.',
    ].join("\n");

    // Ensure `cleanTextForSpeech` preserves inline stage tags rather than stripping them as markdown links
    const cleaned = cleanTextForSpeech(stageScript);
    expect(cleaned).toContain("[voice: Zoey]");
    expect(cleaned).toContain("[pause: 650ms]");

    const parsed = parseStageAndDialogueSegments(stageScript, {
      defaultVoice: "Zoey",
      multiVoice: true,
    });

    expect(parsed.segments.length).toBeGreaterThanOrEqual(5);
    expect(parsed.segments[0]!.voice).toBe("Zoey");
    expect(parsed.segments[0]!.emotion).toBe("calm");
    expect(parsed.segments[0]!.pauseAfterMs).toBe(650);

    const russellSeg = parsed.segments.find((s) =>
      s.text.includes("perimeter sensors"),
    );
    expect(russellSeg?.voice).toBe("Russell");
    expect(russellSeg?.emotion).toBe("serious");

    const silasSeg = parsed.segments.find((s) =>
      s.text.includes("Stand fast at the helm"),
    );
    expect(silasSeg).toBeDefined();
    expect(silasSeg?.voice).not.toBe("Zoey");
    expect(parsed.castUsed.Silas).toBeDefined();

    expect(
      stripStageDirectionTags("[voice: Russell][pause: 400ms] Hello there!"),
    ).toBe("Hello there!");
    expect(getEmotionProsodyModifiers("excited").speedMul).toBeGreaterThan(1.0);
    expect(getEmotionProsodyModifiers("calm").speedMul).toBeLessThan(1.0);
  });

  test("12. Two-Host Conversational AI Podcast Generator & Stereo Panning (`podcast` CLI + `PHONON_OPS`)", async () => {
    const docText = [
      "# Edge Neural Speech Architecture",
      "",
      "Local text-to-speech synthesis eliminates cloud round-trip latency and keeps sensitive documents completely private.",
      "By combining discourse-aware pause scaling with broadcast loudness normalization, generated audio rivals studio narration.",
      "Dual-track pronunciation lexicons ensure technical terms sound natural while keeping visual subtitles accurate.",
    ].join("\n");

    const script = await generatePodcastScriptFromDocument({
      cleanedText: cleanDocumentForTts(docText),
      title: "Edge Neural Speech",
      hostAVoice: "Zoey",
      hostBVoice: "Russell",
      targetTurns: 6,
    });
    expect(script.turns.length).toBeGreaterThanOrEqual(4);
    expect(script.turns.some((t) => t.voice === "Zoey" && t.pan < 0)).toBe(
      true,
    );
    expect(script.turns.some((t) => t.voice === "Russell" && t.pan > 0)).toBe(
      true,
    );

    // Constant-power stereo panning asymmetry check
    const mono = makeHarmonicSpeechLikePcm({ durationSec: 0.2, amp: 0.4 });
    const pannedLeft = panMonoToStereoPcm(mono, -0.5);
    expect(pannedLeft.length).toBe(mono.length * 2);
    let leftEnergy = 0;
    let rightEnergy = 0;
    const frames = Math.floor(mono.length / 2);
    for (let i = 0; i < frames; i++) {
      const l = pannedLeft.readInt16LE(i * 4);
      const r = pannedLeft.readInt16LE(i * 4 + 2);
      leftEnergy += l * l;
      rightEnergy += r * r;
    }
    expect(leftEnergy).toBeGreaterThan(rightEnergy * 2);

    // Test CLI `podcast` subcommand producing a true 2-channel stereo WAV + transcript
    const srcMd = join(workDir, "podcast-brief.md");
    const outPodcastWav = join(workDir, "podcast-episode.wav");
    writeFileSync(srcMd, docText, "utf8");

    const logs: string[] = [];
    const code = await runTtsCli(
      [
        "podcast",
        srcMd,
        "-o",
        outPodcastWav,
        "--hosts",
        "Zoey,Russell",
        "--turns",
        "4",
        "--master",
        "podcast",
      ],
      {
        contextOptions: {
          home,
          dataDir,
          toolDirs: [toolDir],
          platform: "darwin",
          arch: "arm64",
        },
        stdout: (t) => logs.push(t),
        stderr: (t) => logs.push(t),
      },
    );
    expect(code).toBe(0);
    expect(existsSync(outPodcastWav)).toBe(true);
    const wavBuf = readFileSync(outPodcastWav);
    expect(wavBuf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    // Standard WAV `fmt ` header offset 22 = NumChannels (2 = stereo 2-host podcast)
    expect(wavBuf.readUInt16LE(22)).toBe(2);
  });

  test("13. True `.M4B` Chaptered Audiobook (`FFMETADATA1`, EPUB ZIP Cover Extractor, Procedural BMP Cover, Synced LRC)", () => {
    const ffmeta = buildFfmetadataChapters({
      bookTitle: "Systems Design: Volume 1",
      author: "Ada Lovelace",
      narratorVoice: "Zoey",
      chapters: [
        {
          number: 1,
          title: "Chapter 1: Foundations",
          startMs: 0,
          endMs: 12500,
        },
        {
          number: 2,
          title: "Chapter 2: Consensus",
          startMs: 12500,
          endMs: 28900,
        },
      ],
      syncedLyricsLrc: formatLrcSyncedLyrics([
        { startMs: 0, text: "Chapter 1: Foundations" },
        { startMs: 12500, text: "Chapter 2: Consensus" },
      ]),
    });
    expect(ffmeta).toContain(";FFMETADATA1");
    expect(ffmeta).toContain("[CHAPTER]");
    expect(ffmeta).toContain("START=0");
    expect(ffmeta).toContain("END=12500");
    expect(ffmeta).toContain("title=Chapter 2: Consensus");
    expect(ffmeta).toContain("[00:12.50] Chapter 2: Consensus");

    const bmp = generateAudiobookCoverBmp({
      title: "Systems Design",
      voice: "Zoey",
    });
    expect(bmp.subarray(0, 2).toString("ascii")).toBe("BM");
    expect(bmp.readInt32LE(18)).toBe(600);
    expect(bmp.readInt32LE(22)).toBe(600);

    // Zero-dependency EPUB ZIP cover extractor
    const fakePngPayload = Buffer.alloc(1200, 0x89);
    const epubZip = buildMinimalZipWithDeflatedEntry(
      "OEBPS/images/cover.png",
      fakePngPayload,
    );
    const epubFile = join(workDir, "sample-book.epub");
    writeFileSync(epubFile, epubZip);
    const extractedCover = extractCoverFromEpubArchive(epubFile);
    expect(extractedCover).not.toBeNull();
    expect(extractedCover!.ext).toBe("png");
    expect(Buffer.compare(extractedCover!.data, fakePngPayload)).toBe(0);
  });

  test("14 & 15. Crash-Resumable Disk Checkpointing (`--resume`) & Closed-Loop Acoustic QA (`--verify`)", async () => {
    // Closed-loop acoustic QA detector
    const deadAir = Buffer.alloc(24000 * 2, 0);
    expect(
      verifySynthesizedChunkPcm(deadAir, 24000, "Hello world this should speak")
        .ok,
    ).toBe(false);

    const clipped = Buffer.alloc(24000 * 2);
    for (let i = 0; i < 24000; i++) {
      clipped.writeInt16LE(i % 2 === 0 ? 32767 : -32767, i * 2);
    }
    expect(
      verifySynthesizedChunkPcm(clipped, 24000, "Clipped distortion burst").ok,
    ).toBe(false);

    const babble = makeHarmonicSpeechLikePcm({ durationSec: 16.0, amp: 0.3 });
    expect(verifySynthesizedChunkPcm(babble, 24000, "Hi there!").ok).toBe(
      false,
    );

    const healthy = makeHarmonicSpeechLikePcm({ durationSec: 1.5, amp: 0.3 });
    expect(
      verifySynthesizedChunkPcm(
        healthy,
        24000,
        "A clean natural spoken sentence.",
      ).ok,
    ).toBe(true);

    // Crash-resume disk checkpoint test
    const ckptDir = join(workDir, "resume-ckpt");
    const ckpt = new PhononDiskCheckpoint(ckptDir);
    const chunks = splitTextForPhonon(
      "First paragraph cached before simulated crash.\n\nSecond paragraph synthesized on resume.",
      { maxChars: 60 },
    );
    expect(chunks.length).toBe(2);

    // Pre-seed chunk 0 in checkpoint cache
    const preCachedWav = wrapMonoWav(healthy, 24000);
    const key0 = ckpt.chunkKey("Zoey", chunks[0]!.text, 1.0, 0);
    await ckpt.saveChunkWav(key0, preCachedWav);

    const ctx = createContext({
      home,
      dataDir,
      toolDirs: [toolDir],
      platform: "darwin",
      arch: "arm64",
    });
    const outResumed = join(workDir, "resumed-output.wav");
    const ollamaExe = join(
      toolDir,
      process.platform === "win32" ? "ollama.cmd" : "ollama",
    );
    const exportRes = await synthesizeAndExportAudioFile(ctx, {
      ollamaExe,
      ffmpegExe: null,
      chunks,
      voice: "Zoey",
      format: "wav",
      speed: 1.0,
      pauseMs: 220,
      outputPath: outResumed,
      checkpointDir: ckptDir,
      keepCheckpoint: false,
      verifyChunks: true,
    });
    expect(exportRes.resumedChunks).toBe(1);
    expect(existsSync(outResumed)).toBe(true);
    // Checkpoint directory is automatically cleaned up after successful completion!
    expect(existsSync(ckptDir)).toBe(false);
  });

  test("16 & 17. Sub-250ms Fast-Start Clause Split, Cloning Optimal Window, & Spectral-Flux Word Alignment", () => {
    // Fast-start clause split
    const longLead =
      "Welcome to the interactive voice studio, where the opening clause plays almost instantaneously while downstream paragraphs prefetch concurrently.";
    const split = splitFirstClauseForFastStart(longLead, 85);
    expect(split.length).toBe(2);
    expect(split[0]).toBe("Welcome to the interactive voice studio,");
    expect(split[1]).toContain("where the opening clause");

    // Never splits on honorific "Dr." inside fast-start window
    const honorificLead =
      "Yesterday afternoon in Boston, Dr. Elizabeth Montgomery presented the complete acoustic benchmark suite to the engineering council.";
    const hSplit = splitFirstClauseForFastStart(honorificLead, 85);
    expect(hSplit[0]!.endsWith("Dr.")).toBe(false);

    // Optimal 9.0s cloning window selection on a 16s recording with 5s of leading dead air + 10s speech
    const longRef = makeHarmonicSpeechLikePcm({
      leadSilenceSec: 5.5,
      durationSec: 9.5,
      tailSilenceSec: 1.5,
      sampleRate: 24000,
      amp: 0.35,
    });
    const conditioned = selectOptimalCloningWindowPcm(
      longRef,
      24000,
      9.0,
      11.5,
    );
    const condDuration = conditioned.length / 2 / 24000;
    expect(condDuration).toBeGreaterThan(7.5);
    expect(condDuration).toBeLessThanOrEqual(9.5);
    const condMetrics = analyzeAudioMasteringMetrics(conditioned, 24000);
    expect(condMetrics.speechRmsDbfs).toBeGreaterThan(-20);

    // Spectral-flux word-boundary alignment on constant-amplitude vowel -> fricative transition
    const sampleRate = 24000;
    const totalSamples = sampleRate; // 1.0s
    const constAmpPcm = Buffer.alloc(totalSamples * 2);
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      // Switch at 0.50s from low 200 Hz vowel to 5500 Hz fricative AT IDENTICAL AMPLITUDE
      const freq = i < totalSamples / 2 ? 200 : 5500;
      const v = Math.sin(2 * Math.PI * freq * t) * 0.35;
      constAmpPcm.writeInt16LE(Math.round(v * 32767), i * 2);
    }
    const frameSamples = 240; // 10ms
    const flux = computeFrameSpectralFlux(constAmpPcm, frameSamples, 100);
    // Frame 50 (0.50s) should exhibit the peak spectral flux spike!
    expect(flux[50]!).toBeGreaterThan(0.85);

    const alignedWords = computeWordTimingsForText("see shine", 1000, 0, 0, {
      pcmData: constAmpPcm,
      sampleRate,
    });
    expect(alignedWords.length).toBe(2);
    expect(alignedWords[0]!.endMs).toBeGreaterThanOrEqual(450);
    expect(alignedWords[0]!.endMs).toBeLessThanOrEqual(550);
  });

  test("Cross-Platform Matrix (`darwin`, `linux`, `win32` x `arm64`/`x64`) across `PHONON_OPS` & `.M4B` Audiobook", async () => {
    const platforms: Array<{
      platform: "darwin" | "linux" | "win32";
      arch: string;
    }> = [
      { platform: "darwin", arch: "arm64" },
      { platform: "darwin", arch: "x64" },
      { platform: "linux", arch: "x64" },
      { platform: "linux", arch: "arm64" },
      { platform: "win32", arch: "x64" },
      { platform: "win32", arch: "arm64" },
    ];

    for (const target of platforms) {
      const platDir = join(root, `plat-${target.platform}-${target.arch}`);
      mkdirSync(platDir, { recursive: true });
      const ctx = createContext({
        home: join(platDir, "home"),
        dataDir: join(platDir, "data"),
        sandboxRoot: platDir,
        toolDirs: [toolDir],
        platform: target.platform,
        arch: target.arch,
      });

      // 1. `phonon/voice` with `masterPreset`
      const voiceRes = (await PHONON_OPS["phonon/voice"]!(ctx, {
        voice: "Zoey",
        format: "m4b",
        masterPreset: "acx",
      })) as Record<string, unknown>;
      expect(voiceRes.format).toBe("m4b");
      expect(voiceRes.masterPreset).toBe("acx");

      // 2. `phonon/lexicon` persistence & reload
      const lexRes = (await PHONON_OPS["phonon/lexicon"]!(ctx, {
        entries: { CrossPlatDB: "cross plat D B" },
      })) as {
        path: string;
        entries: Array<{ display: string; spoken: string }>;
      };
      expect(existsSync(lexRes.path)).toBe(true);
      expect(
        lexRes.entries.some(
          (e) => e.display === "CrossPlatDB" && e.spoken === "cross plat D B",
        ),
      ).toBe(true);

      // 3. CRLF manuscript with stage directions & multi-chapter `.m4b` audiobook job
      const bookMd = join(platDir, "crlf-novel.md");
      writeFileSync(
        bookMd,
        [
          "# Chapter I: Arrival",
          "",
          "[voice: Zoey][emotion: calm] Dr. Evelyn Vance arrived with $1.5M in research equipment on CrossPlatDB.",
          "",
          "# Chapter II: Discovery",
          "",
          '"We have signal lock!" shouted Russell across the observatory.',
        ].join("\r\n"),
        "utf8",
      );

      const abookRes = (await PHONON_OPS["phonon/audiobook"]!(ctx, {
        path: bookMd,
        format: "wav",
        singleM4b: true,
        masterPreset: "acx",
        multiVoice: true,
        continuity: true,
        verifyChunks: true,
      })) as {
        job: { id: string; state: string };
        m4bPath?: string;
        chapterCount: number;
      };
      expect(abookRes.chapterCount).toBe(2);
      expect(abookRes.m4bPath).toBeDefined();
      await waitForJobDone(ctx, abookRes.job.id);
      expect(existsSync(abookRes.m4bPath!)).toBe(true);
      expect(existsSync(join(abookRes.m4bPath!, "..", "cast.json"))).toBe(true);
    }
  });

  test("Real Ollama (`phonon`) + Real `ffmpeg`/`ffprobe` End-to-End `.M4B` Chapters & Cover Art Verification", async () => {
    const realOllama = Bun.which("ollama");
    const realFfmpeg = Bun.which("ffmpeg");
    const realFfprobe = Bun.which("ffprobe");
    if (
      !realOllama ||
      !realFfmpeg ||
      !realFfprobe ||
      process.platform !== "darwin" ||
      process.arch !== "arm64"
    ) {
      return;
    }

    // Verify `phonon` model is installed in real Ollama before running live neural synthesis
    const listProc = Bun.spawnSync([realOllama, "list"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (!listProc.stdout.toString().includes("phonon")) {
      return;
    }

    const liveDir = join(root, "live-real-m4b");
    mkdirSync(liveDir, { recursive: true });
    const manuscriptPath = join(liveDir, "Mini_Book.md");
    writeFileSync(
      manuscriptPath,
      [
        "# Chapter 1: Dawn",
        "",
        "SQLite and v1.5 systems power this studio test.",
        "",
        "# Chapter 2: Horizon",
        "",
        "[voice: Russell] Every chapter marker is embedded cleanly.",
      ].join("\n"),
      "utf8",
    );

    const fullM4b = join(liveDir, "Mini_Book_Combined.m4b");
    const code = await runTtsCli(
      [
        "audiobook",
        manuscriptPath,
        "-f",
        "m4b",
        "-o",
        fullM4b,
        "--master",
        "acx",
        "--pronounce",
        "SQLite=sequel lite",
        "--multi-voice",
      ],
      {
        contextOptions: {
          home: process.env.HOME || home,
          dataDir: join(liveDir, "data"),
          platform: "darwin",
          arch: "arm64",
        },
        stdout: () => {},
        stderr: () => {},
      },
    );
    expect(code).toBe(0);
    expect(existsSync(fullM4b)).toBe(true);

    const probe = Bun.spawnSync(
      [
        realFfprobe,
        "-v",
        "quiet",
        "-show_chapters",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        fullM4b,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(probe.exitCode).toBe(0);
    const probeJson = JSON.parse(probe.stdout.toString("utf8"));
    expect(Array.isArray(probeJson.chapters)).toBe(true);
    expect(probeJson.chapters.length).toBe(2);
    expect(probeJson.chapters[0].tags.title).toContain("Chapter 1");
    expect(probeJson.chapters[1].tags.title).toContain("Chapter 2");

    // Verify embedded audio stream + attached cover picture stream (`attached_pic === 1`)
    const hasAudio = probeJson.streams.some(
      (s: any) => s.codec_type === "audio",
    );
    const hasCoverPic = probeJson.streams.some(
      (s: any) => s.disposition?.attached_pic === 1,
    );
    expect(hasAudio).toBe(true);
    expect(hasCoverPic).toBe(true);
  }, 60_000);

  test("QA Remediation Suite: `speakChunk` Stage/Emotion/Lexicon, Tiny PCM Bounds, Short-Chunk `--verify` Retry, Stereo Podcast Mastering, ACX Room Tone, CLI & NTFS Guards", async () => {
    // 1. Tiny 0 B / 1 B / 2 B PCM buffers must never throw RangeError
    for (const len of [0, 1, 2]) {
      const tiny = Buffer.alloc(len);
      expect(() => analyzeAudioMasteringMetrics(tiny, 24000)).not.toThrow();
      expect(() =>
        verifySynthesizedChunkPcm(tiny, 24000, "hello"),
      ).not.toThrow();
      expect(() => computeFrameSpectralFlux(tiny, 240, 1)).not.toThrow();
    }

    // 2. `speakChunk` with inline [voice], [emotion], [pitch], [pause], [speed] + Dual-Track Lexicon
    const speakDir = join(root, "qa-speak-chunk");
    mkdirSync(speakDir, { recursive: true });
    const speakCtx = createContext({
      home: join(speakDir, "home"),
      dataDir: join(speakDir, "data"),
      sandboxRoot: speakDir,
      toolDirs: [toolDir],
      platform: "darwin",
      arch: "arm64",
    });
    const spokenRes = await speakChunk(speakCtx, {
      text: "[voice: Russell][emotion: serious][pitch: -1.0][pause: 300ms][speed: 1.1] SQLite powers v2.4.1.",
      lexicon: "SQLite=sequel lite",
    });
    expect(spokenRes.voice).toBe("Russell");
    expect(spokenRes.pitch).toBeLessThan(0);
    expect(spokenRes.durationMs).toBeGreaterThan(300);
    // Display words keep "SQLite" while audio spoke "sequel lite" and "version 2 point 4 point 1."
    expect(spokenRes.words.some((w) => w.word.includes("SQLite"))).toBe(true);
    expect(spokenRes.words.some((w) => w.word.toLowerCase() === "sequel")).toBe(
      false,
    );

    // 3. Sentence-final semver (`v2.4.1.`), `[Speaker]:` markdown preservation, CR FFMETADATA, & shorter fast-start clause
    expect(expandTechnicalAndNumericForSpeech("Upgrade to v2.4.1.")).toContain(
      "version 2 point 4 point 1.",
    );
    expect(
      cleanTextForSpeech("[Russell]: Welcome back!\n[Zoey]: Glad to be here!"),
    ).toContain("[Russell]: Welcome back!");
    expect(escapeFfmetadataValue("Part 1\rPart 2")).not.toContain("\r");
    const shortLeadSplit = splitFirstClauseForFastStart(
      "Welcome to the studio, where the first clause streams immediately while the rest prefetches.",
    );
    expect(shortLeadSplit.length).toBe(2);
    expect(shortLeadSplit[0]).toBe("Welcome to the studio,");

    // 4. Dense zero-gap speech ACX compliance (`acxCompliant === true` with head/tail room tone & noise expander)
    const denseSpeech = makeHarmonicSpeechLikePcm({
      durationSec: 2.0,
      leadSilenceSec: 0,
      tailSilenceSec: 0,
      amp: 0.42,
    });
    const acxOutPath = join(speakDir, "dense-acx.wav");
    const ollamaShim = join(
      toolDir,
      process.platform === "win32" ? "ollama.cmd" : "ollama",
    );
    const acxExport = await synthesizeAndExportAudioFile(speakCtx, {
      ollamaExe: ollamaShim,
      ffmpegExe: null,
      chunks: splitTextForPhonon("Continuous dense narration for ACX check."),
      voice: "Zoey",
      speed: 1,
      pauseMs: 180,
      format: "wav",
      outputPath: acxOutPath,
      masterPreset: "acx",
    });
    expect(acxExport.masteringMetrics).toBeDefined();
    expect(acxExport.masteringMetrics!.acxCompliant).toBe(true);
    expect(acxExport.masteringMetrics!.noiseFloorDbfs).toBeLessThanOrEqual(-60);
    // Verify pure `applyMasterChainPcm` + room-tone pads also satisfy ACX directly
    const padHead = createComfortRoomTonePcm(12000, 24000, -65, 11);
    const padTail = createComfortRoomTonePcm(18000, 24000, -65, 22);
    const masteredDirect = applyMasterChainPcm(
      Buffer.concat([padHead, denseSpeech, padTail]),
      24000,
      "acx",
    );
    expect(
      analyzeAudioMasteringMetrics(masteredDirect, 24000).acxCompliant,
    ).toBe(true);

    // 5. Stereo-linked Podcast Mastering (`applyMasterChainStereoPcm` + `stereoPanByChunk`)
    const quietLeft = panMonoToStereoPcm(
      makeHarmonicSpeechLikePcm({ durationSec: 1.2, amp: 0.08 }),
      -0.22,
    );
    const masteredStereo = applyMasterChainStereoPcm(
      quietLeft,
      24000,
      "podcast",
    );
    expect(masteredStereo.length).toBe(quietLeft.length);
    // Verify L channel remains louder than R channel (~3.06 dB pan preserved!)
    let sumL = 0;
    let sumR = 0;
    const frames = Math.floor(masteredStereo.length / 4);
    for (let f = 0; f < frames; f++) {
      const l = masteredStereo.readInt16LE(f * 4) / 32768;
      const r = masteredStereo.readInt16LE(f * 4 + 2) / 32768;
      sumL += l * l;
      sumR += r * r;
    }
    const panDiffDb = 10 * Math.log10(sumL / Math.max(1e-12, sumR));
    expect(panDiffDb).toBeGreaterThan(2.5);
    expect(panDiffDb).toBeLessThan(3.6);

    // Time-stretch helper (`timeStretchSpeechPcm`)
    const stretchedFaster = timeStretchSpeechPcm(denseSpeech, 1.25, 24000);
    expect(stretchedFaster.length).toBeLessThan(denseSpeech.length);

    // 6. Closed-loop `--verify` short-chunk dead-air retry (`bypassCache: true` bypasses Attempt 1 cached dead air!)
    const flakyToolDir = join(root, "flaky-tools");
    mkdirSync(flakyToolDir, { recursive: true });
    const countFile = join(flakyToolDir, "calls.txt");
    writeFileSync(countFile, "0", "utf8");
    const flakyJs = join(flakyToolDir, "flaky_ollama.mjs");
    writeFileSync(
      flakyJs,
      [
        'import { readFileSync, writeFileSync } from "node:fs";',
        `const cf = ${JSON.stringify(countFile)};`,
        "const args = process.argv.slice(2);",
        'if (args[0] === "--version" || args[0] === "-v") { process.stdout.write("ollama version is 0.40.0\\n"); process.exit(0); }',
        'if (args[0] === "list") { process.stdout.write("NAME ID SIZE MODIFIED\\nphonon:latest abc 80 MB now\\n"); process.exit(0); }',
        "const chunks = []; for await (const c of process.stdin) chunks.push(c);",
        "const n = Number(readFileSync(cf, 'utf8').trim() || '0') + 1;",
        "writeFileSync(cf, String(n), 'utf8');",
        "const sr = 24000; const dur = 0.9; const samples = Math.floor(sr * dur);",
        "const pcm = Buffer.alloc(samples * 2);",
        "// Attempt 1 returns 100% dead air; Attempt 2 returns healthy speech!",
        "if (n >= 2) {",
        "  for (let i = 0; i < samples; i++) {",
        "    pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 190 * (i / sr)) * 10000), i * 2);",
        "  }",
        "}",
        "const h = Buffer.alloc(44);",
        'h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8);',
        "h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);",
        "h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);",
        'h.write("data", 36); h.writeUInt32LE(pcm.length, 40);',
        "process.stdout.write(Buffer.concat([h, pcm]));",
      ].join("\n"),
      "utf8",
    );
    const flakyOllamaBin = join(
      flakyToolDir,
      process.platform === "win32" ? "ollama.cmd" : "ollama",
    );
    if (process.platform === "win32") {
      writeFileSync(
        flakyOllamaBin,
        `@echo off\r\n"${process.execPath}" "${flakyJs}" %*\r\n`,
        "utf8",
      );
    } else {
      writeFileSync(
        flakyOllamaBin,
        `#!/bin/sh\nexec "${process.execPath}" "${flakyJs}" "$@"\n`,
        "utf8",
      );
      chmodSync(flakyOllamaBin, 0o755);
    }
    const flakyCtx = createContext({
      home: join(speakDir, "flaky-home"),
      dataDir: join(speakDir, "flaky-data"),
      toolDirs: [flakyToolDir],
      platform: "darwin",
      arch: "arm64",
    });
    const recoveredWav = join(speakDir, "recovered-short.wav");
    const retryRes = await synthesizeAndExportAudioFile(flakyCtx, {
      ollamaExe: flakyOllamaBin,
      ffmpegExe: null,
      chunks: splitTextForPhonon("Short unsplittable QA test line."),
      voice: "Zoey",
      speed: 1,
      pauseMs: 180,
      format: "wav",
      outputPath: recoveredWav,
      verifyChunks: true,
    });
    expect(retryRes.retriedChunks).toBe(1);
    const recoveredPcm = parseWavPcm(readFileSync(recoveredWav)).pcmData;
    expect(
      verifySynthesizedChunkPcm(
        recoveredPcm,
        24000,
        "Short unsplittable QA test line.",
      ).ok,
    ).toBe(true);

    // 7. Win32 NTFS reserved stems, `say_cli` routing, `tts_cli` `-i -` stdin & multi-format subtitle deduplication
    expect(sanitizeSafeFilenameStem("CON")).toBe("_CON");
    expect(sanitizeSafeFilenameStem("com1.txt")).toBe("_com1.txt");
    expect(sanitizeSafeFilenameStem('Bad<>:"/\\|?*Name. ')).toBe("Bad_Name");

    expect(
      resolveSayCliDelegatedArgs(["--emotion", "excited", "Hello world"], root),
    ).toEqual(["speak", "--emotion", "excited", "Hello world"]);
    expect(
      resolveSayCliDelegatedArgs(
        ["--emotion", "excited", "-o", "out.wav", "Hello"],
        root,
      ),
    ).toEqual(["--emotion", "excited", "-o", "out.wav", "Hello"]);

    const cliSubDir = join(root, "cli-dedup-subs");
    mkdirSync(cliSubDir, { recursive: true });
    const ffmpegShim = join(
      toolDir,
      process.platform === "win32" ? "ffmpeg.cmd" : "ffmpeg",
    );
    expect(existsSync(ffmpegShim)).toBe(true);
    const stdinCode = await runTtsCli(
      [
        "export",
        "-i",
        "-",
        "-f",
        "wav,mp3",
        "--subtitles",
        "-o",
        join(cliSubDir, "stdin-multi"),
        "--tool-dirs",
        toolDir,
      ],
      {
        cwd: cliSubDir,
        stdinText: "Reading from standard input across WAV and MP3.",
        stdout: () => {},
        stderr: () => {},
      },
    );
    expect(stdinCode).toBe(0);
    expect(existsSync(join(cliSubDir, "stdin-multi.wav"))).toBe(true);
    expect(existsSync(join(cliSubDir, "stdin-multi.mp3"))).toBe(true);
    const srtFiles = readdirSync(cliSubDir).filter((f) => f.endsWith(".srt"));
    expect(srtFiles).toEqual(["stdin-multi.srt"]);

    // 8. `phonon/lexicon` + `phonon/save` without `sandboxRoot`, `phonon/podcast` `hostA`/`hostB`, & `phonon/audiobook` re-run/resume
    const noSandboxDir = join(root, "no-sandbox-ctx");
    mkdirSync(noSandboxDir, { recursive: true });
    const noSandboxCtx = createContext({
      home: join(noSandboxDir, "home"),
      dataDir: join(noSandboxDir, "data"),
      toolDirs: [toolDir],
      platform: "darwin",
      arch: "arm64",
    });
    const savedLex = (await PHONON_OPS["phonon/lexicon"]!(noSandboxCtx, {
      entries: { NoSandboxTerm: "no sandbox spoken" },
    })) as { customEntries: Record<string, string> };
    expect(savedLex.customEntries.NoSandboxTerm).toBe("no sandbox spoken");

    const podJobRes = (await PHONON_OPS["phonon/podcast"]!(noSandboxCtx, {
      text: "SQLite and modern neural codecs enable instant multi-host studio podcasts.",
      hostA: { name: "Alex", voice: "Russell" },
      hostB: "Freya",
      format: "wav",
      outputDir: noSandboxDir,
      title: "CON",
    })) as {
      job: { id: string };
      outputPath: string;
      hostA: { name: string; voice: string };
      hostB: { name: string; voice: string };
    };
    expect(podJobRes.hostA).toEqual({ name: "Alex", voice: "Russell" });
    expect(podJobRes.hostB).toEqual({ name: "Freya", voice: "Freya" });
    expect(podJobRes.outputPath).toContain("_CON (Podcast).wav");
    await waitForJobDone(noSandboxCtx, podJobRes.job.id);
    expect(existsSync(podJobRes.outputPath)).toBe(true);

    // `phonon/audiobook` re-export (creates `(2)`) and `resume: true` (reuses existing directory without collision)
    const abReDir = join(root, "abook-rerun");
    mkdirSync(abReDir, { recursive: true });
    const abMd = join(abReDir, "TinyBook.md");
    writeFileSync(
      abMd,
      "# Chapter 1: One\n\nShort chapter one.\n\n# Chapter 2: Two\n\nShort chapter two.\n",
      "utf8",
    );
    const ab1 = (await PHONON_OPS["phonon/audiobook"]!(noSandboxCtx, {
      path: abMd,
      format: "wav",
      resume: true,
    })) as { job: { id: string }; audiobookDir: string };
    await waitForJobDone(noSandboxCtx, ab1.job.id);
    // Re-running with `resume: true` succeeds without output collision!
    const abResume = (await PHONON_OPS["phonon/audiobook"]!(noSandboxCtx, {
      path: abMd,
      format: "wav",
      resume: true,
    })) as { job: { id: string }; audiobookDir: string };
    expect(abResume.audiobookDir).toBe(ab1.audiobookDir);
    await waitForJobDone(noSandboxCtx, abResume.job.id);
    // Re-running with `resume: false` creates a fresh `(2)` folder cleanly!
    const abFresh = (await PHONON_OPS["phonon/audiobook"]!(noSandboxCtx, {
      path: abMd,
      format: "wav",
      resume: false,
    })) as { job: { id: string }; audiobookDir: string };
    expect(abFresh.audiobookDir).toContain("(2)");
    await waitForJobDone(noSandboxCtx, abFresh.job.id);
  });
});
