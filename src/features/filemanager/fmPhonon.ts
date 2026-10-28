/**
 * Ollama Phonon Voice Reader, Universal Format-to-Plain-Text Converter, Large-Text Chunker, and Multi-Format Audio Exporter.
 *
 * Powers the built-in Voice Reader & Audio Exporter in the File Manager using `ollama run phonon`:
 *   1. Discovers Ollama & Phonon installation status and all 38+ built-in voices (`ollama show phonon`).
 *   2. Provides single-click auto-install for both `ollama` and the `phonon` model (`ollama pull phonon`).
 *   3. Converts documents and files of any format (PDF, DOCX, ODT, RTF, EPUB, FB2, PPTX, XLSX, CSV, HTML, Markdown,
 *      JSON, YAML, TOML, XML, Jupyter .ipynb, SRT/VTT/LRC subtitles, ICS, VCF, and source code) into clean plain text.
 *   4. Splits arbitrarily large texts (books, long logs, multi-megabyte documents) into natural sentence/paragraph
 *      chunks guaranteed to fit within Phonon's 8,192-token context window.
 *   5. Streams chunk-by-chunk WAV synthesis via `stdin` (`ollama run phonon --voice <voice>`) for live reading aloud
 *      and stitches multi-chunk PCM audio on disk with O(1) memory overhead to export as WAV, AIFF, MP3, M4A, AAC,
 *      FLAC, OGG, Opus, or WMA.
 */
import { randomBytes, createHash } from "crypto";
import { existsSync, mkdirSync, rmSync, promises as fsp } from "fs";
import { tmpdir } from "os";
import * as nodePath from "path";
import { absolutePath, type FmContext, type FmHandler } from "./fmCore";
import { decodeBytes, htmlToText } from "./fmConvText";
import { readSpreadsheet } from "./fmConvSheet";
import { extensionOf, FmError, protectedReason, splitName, uniqueName } from "./fmPaths";

async function publishStagedFile(srcPath: string, destPath: string): Promise<void> {
  try {
    await fsp.rename(srcPath, destPath);
  } catch {
    await fsp.copyFile(srcPath, destPath);
    await fsp.rm(srcPath, { force: true }).catch(() => {});
  }
}

function uniqueOutputFilePath(dir: string, desiredName: string): string {
  const chosen = uniqueName(desiredName, (candidate) => existsSync(nodePath.join(dir, candidate)));
  return nodePath.join(dir, chosen);
}
import { inspectRichPreview, type DocBlock, type RichPreview } from "./fmPreview";
import { loadSettings, PHONON_AUDIO_FORMATS, updateSettings, type PhononAudioFormat } from "./fmSettings";
import { detectManagers, explainFailure, resolveTool } from "./fmToolDetect";
import { findExecutable, installPlan, searchDirs, TOOLS } from "./fmTools";

export interface PhononVoiceInfo {
  id: string;
  label: string;
  category: "Conversational" | "Narrator" | "Character";
  desc: string;
}

/**
 * All 38 voices built into Ollama's `phonon` (Gradium Phonon TTS) model, verified from `ollama show phonon`.
 */
export const DEFAULT_PHONON_VOICES: PhononVoiceInfo[] = [
  { id: "Zoey", label: "Zoey", category: "Conversational", desc: "Clear, warm everyday voice (Default)" },
  { id: "default", label: "Default", category: "Conversational", desc: "Standard balanced Phonon reference voice" },
  { id: "Alfie", label: "Alfie", category: "Conversational", desc: "Friendly, upbeat conversational voice" },
  { id: "Bryony", label: "Bryony", category: "Conversational", desc: "Crisp, articulate studio voice" },
  { id: "Delia", label: "Delia", category: "Conversational", desc: "Smooth, expressive reading voice" },
  { id: "Easton", label: "Easton", category: "Conversational", desc: "Calm, modern conversational voice" },
  { id: "Edwin", label: "Edwin", category: "Narrator", desc: "Measured, classic audiobook narrator" },
  { id: "Elodie-Rose", label: "Elodie-Rose", category: "Narrator", desc: "Gentle, poised storytelling voice" },
  { id: "Everly", label: "Everly", category: "Conversational", desc: "Bright, natural speaking voice" },
  { id: "Freya", label: "Freya", category: "Narrator", desc: "Rich, steady narrative voice" },
  { id: "Hadley", label: "Hadley", category: "Conversational", desc: "Relaxed, clear reading voice" },
  { id: "Harper", label: "Harper", category: "Conversational", desc: "Direct, engaging modern voice" },
  { id: "Hugh", label: "Hugh", category: "Narrator", desc: "Deep, composed documentary narrator" },
  { id: "Imogen", label: "Imogen", category: "Narrator", desc: "Polished, expressive literary voice" },
  { id: "Juniper", label: "Juniper", category: "Conversational", desc: "Lively, warm conversational voice" },
  { id: "Lottie", label: "Lottie", category: "Conversational", desc: "Light, cheerful speaking voice" },
  { id: "Maeve", label: "Maeve", category: "Narrator", desc: "Warm, resonant storytelling voice" },
  { id: "Micah", label: "Micah", category: "Conversational", desc: "Smooth, balanced everyday reader" },
  { id: "Miles", label: "Miles", category: "Conversational", desc: "Crisp, steady technical & article reader" },
  { id: "Pippa", label: "Pippa", category: "Conversational", desc: "Bright, spirited reading voice" },
  { id: "Preston", label: "Preston", category: "Narrator", desc: "Authoritative, clear announcer voice" },
  { id: "Russell", label: "Russell", category: "Narrator", desc: "Grounded, mature narrative voice" },
  { id: "Spencer", label: "Spencer", category: "Conversational", desc: "Natural, easygoing speaking voice" },
  { id: "Teddy", label: "Teddy", category: "Conversational", desc: "Warm, approachable storyteller" },
  { id: "Toby", label: "Toby", category: "Conversational", desc: "Energetic, clear conversational voice" },
  { id: "Trevor", label: "Trevor", category: "Narrator", desc: "Steady, classic broadcast reader" },
  { id: "Captain Silas Blackwater", label: "Captain Silas Blackwater", category: "Character", desc: "Weathered maritime captain character voice" },
  { id: "Fairy Godmother", label: "Fairy Godmother", category: "Character", desc: "Whimsical, magical fairytale character voice" },
  { id: "Fennick the Young Elf", label: "Fennick the Young Elf", category: "Character", desc: "Youthful fantasy adventurer voice" },
  { id: "Grub the Ogre", label: "Grub the Ogre", category: "Character", desc: "Heavy, gravelly fantasy ogre voice" },
  { id: "Master Aldric", label: "Master Aldric", category: "Character", desc: "Wise scholar & arcane mentor voice" },
  { id: "Morwenna of the Deep", label: "Morwenna of the Deep", category: "Character", desc: "Ethereal, mythic oceanic character voice" },
  { id: "Old Mortlake", label: "Old Mortlake", category: "Character", desc: "Aged, atmospheric tale-teller voice" },
  { id: "Sir Bramwell", label: "Sir Bramwell", category: "Character", desc: "Noble chivalric knight character voice" },
  { id: "The Snow Queen", label: "The Snow Queen", category: "Character", desc: "Regal, crystalline dramatic voice" },
  { id: "The Thing Under the Stairs", label: "The Thing Under the Stairs", category: "Character", desc: "Eerie, whispered gothic creature voice" },
  { id: "Vyrmathrax the Ancient", label: "Vyrmathrax the Ancient", category: "Character", desc: "Booming, ancient dragon character voice" },
  { id: "Azgorath", label: "Azgorath", category: "Character", desc: "Dark, cinematic fantasy villain voice" },
];

export interface PhononFormatInfo {
  id: PhononAudioFormat;
  label: string;
  ext: string;
  mime: string;
  needsFfmpeg: boolean;
  isVideo?: boolean;
  desc: string;
}

export const AUDIO_FORMAT_INFO: PhononFormatInfo[] = [
  { id: "wav", label: "WAV (24 kHz PCM — Native)", ext: "wav", mime: "audio/wav", needsFfmpeg: false, isVideo: false, desc: "Uncompressed studio-grade 24 kHz 16-bit mono WAV directly from Phonon. Works without ffmpeg." },
  { id: "mp3", label: "MP3 (Universal Audio)", ext: "mp3", mime: "audio/mpeg", needsFfmpeg: true, isVideo: false, desc: "Compact MP3 audio file playable on every phone, car, and media player (uses ffmpeg)." },
  { id: "m4a", label: "M4A / AAC (Apple & Podcast)", ext: "m4a", mime: "audio/mp4", needsFfmpeg: true, isVideo: false, desc: "High-efficiency AAC audio in an M4A container for Apple devices and audiobooks (uses ffmpeg)." },
  { id: "aac", label: "AAC (Raw ADTS Stream)", ext: "aac", mime: "audio/aac", needsFfmpeg: true, isVideo: false, desc: "Advanced Audio Coding stream (uses ffmpeg)." },
  { id: "flac", label: "FLAC (Lossless Compressed)", ext: "flac", mime: "audio/flac", needsFfmpeg: true, isVideo: false, desc: "Archival lossless compression, ~50% smaller than WAV with identical audio quality (uses ffmpeg)." },
  { id: "ogg", label: "OGG Vorbis", ext: "ogg", mime: "audio/ogg", needsFfmpeg: true, isVideo: false, desc: "Open-source Ogg Vorbis audio format (uses ffmpeg)." },
  { id: "opus", label: "Opus (Best Speech Compression)", ext: "opus", mime: "audio/opus", needsFfmpeg: true, isVideo: false, desc: "Modern low-bitrate voice codec ideal for long audiobooks and voice notes (uses ffmpeg)." },
  { id: "aiff", label: "AIFF (Apple Uncompressed PCM)", ext: "aiff", mime: "audio/aiff", needsFfmpeg: false, isVideo: false, desc: "Uncompressed PCM AIFF audio file. Works natively even without ffmpeg." },
  { id: "wma", label: "WMA (Windows Media Audio)", ext: "wma", mime: "audio/x-ms-wma", needsFfmpeg: true, isVideo: false, desc: "Windows Media Audio format (uses ffmpeg)." },
];

export const VIDEO_FORMAT_INFO: PhononFormatInfo[] = [
  { id: "mp4", label: "MP4 Read-Along Video (H.264 + Highlighted Text)", ext: "mp4", mime: "video/mp4", needsFfmpeg: true, isVideo: true, desc: "Universal 1080p MP4 Read-Along Video with synchronized word-by-word karaoke text highlighting and companion .SRT/.VTT subtitles." },
  { id: "webm", label: "WebM Read-Along Video (VP9 + Highlighted Text)", ext: "webm", mime: "video/webm", needsFfmpeg: true, isVideo: true, desc: "Open-web VP9/Opus Read-Along Video with synchronized word-by-word text highlighting." },
  { id: "mov", label: "MOV QuickTime Read-Along Video (Apple H.264)", ext: "mov", mime: "video/quicktime", needsFfmpeg: true, isVideo: true, desc: "Apple QuickTime MOV Read-Along Video with synchronized text highlighting for macOS, iPad, and Final Cut." },
  { id: "mkv", label: "MKV Matroska Read-Along Video (H.264 + Subtitles)", ext: "mkv", mime: "video/x-matroska", needsFfmpeg: true, isVideo: true, desc: "Archival MKV Read-Along Video with synchronized burned-in text highlighting and companion subtitle files." },
];

export const ALL_MEDIA_FORMAT_INFO: PhononFormatInfo[] = [...AUDIO_FORMAT_INFO, ...VIDEO_FORMAT_INFO];

export function isPhononVideoFormat(format: string): format is "mp4" | "webm" | "mov" | "mkv" {
  return format === "mp4" || format === "webm" || format === "mov" || format === "mkv";
}

export const PHONON_VIDEO_ASPECTS = ["16:9", "9:16", "1:1"] as const;
export type PhononVideoAspect = (typeof PHONON_VIDEO_ASPECTS)[number];

export interface PhononVideoAspectInfo {
  id: PhononVideoAspect;
  label: string;
  width: number;
  height: number;
  maxLineChars: number;
  maxWordsPerCue: number;
  fontSize: number;
  contextFontSize: number;
  headerFontSize: number;
  lineSpacingPx: number;
}

export const VIDEO_ASPECT_INFO: Record<PhononVideoAspect, PhononVideoAspectInfo> = {
  "16:9": {
    id: "16:9",
    label: "16:9 Widescreen (1920×1080 — YouTube / Desktop)",
    width: 1920,
    height: 1080,
    maxLineChars: 54,
    maxWordsPerCue: 9,
    fontSize: 56,
    contextFontSize: 34,
    headerFontSize: 28,
    lineSpacingPx: 118,
  },
  "9:16": {
    id: "9:16",
    label: "9:16 Vertical Short (1080×1920 — Shorts / Reels / TikTok)",
    width: 1080,
    height: 1920,
    maxLineChars: 30,
    maxWordsPerCue: 6,
    fontSize: 58,
    contextFontSize: 36,
    headerFontSize: 30,
    lineSpacingPx: 140,
  },
  "1:1": {
    id: "1:1",
    label: "1:1 Square (1080×1080 — Social Feed / Audiobook Card)",
    width: 1080,
    height: 1080,
    maxLineChars: 36,
    maxWordsPerCue: 7,
    fontSize: 50,
    contextFontSize: 32,
    headerFontSize: 26,
    lineSpacingPx: 115,
  },
};

export const PHONON_VIDEO_THEMES = ["midnight", "parchment", "cyber", "high_contrast"] as const;
export type PhononVideoTheme = (typeof PHONON_VIDEO_THEMES)[number];

export interface PhononVideoThemeInfo {
  id: PhononVideoTheme;
  label: string;
  bgHex: string;
  assPrimary: string;
  assSecondary: string;
  assContext: string;
  assHeader: string;
  assBack: string;
  assOutline: string;
}

export const VIDEO_THEME_INFO: Record<PhononVideoTheme, PhononVideoThemeInfo> = {
  midnight: {
    id: "midnight",
    label: "Midnight Studio (Electric Cyan Highlight)",
    bgHex: "0b1020",
    assPrimary: "&H00F8BD38", // #38BDF8 (BGR)
    assSecondary: "&H00F8FAFC", // #FCFAF8
    assContext: "&H55B8A394", // #94A3B8
    assHeader: "&H00F8BD38",
    assBack: "&H5520130C",
    assOutline: "&H00180D07",
  },
  parchment: {
    id: "parchment",
    label: "Warm Book Page (Amber Gold Highlight)",
    bgHex: "1c1611",
    assPrimary: "&H000B9EF5", // #F59E0B (BGR)
    assSecondary: "&H00C7F3FE", // #FEF3C7
    assContext: "&H558A9CA8", // #A89C8A
    assHeader: "&H0024BBFB",
    assBack: "&H550C0907",
    assOutline: "&H00090705",
  },
  cyber: {
    id: "cyber",
    label: "Cyber Neon (Neon Cyan & Violet Highlight)",
    bgHex: "070812",
    assPrimary: "&H00EED322", // #22D3EE (BGR)
    assSecondary: "&H00FFECFA", // #FAECFF
    assContext: "&H55B572A8", // #A872B5
    assHeader: "&H00F755A8", // #A855F7
    assBack: "&H55180914",
    assOutline: "&H0012050E",
  },
  high_contrast: {
    id: "high_contrast",
    label: "Accessible High Contrast (WCAG AAA Yellow)",
    bgHex: "000000",
    assPrimary: "&H0015CCFA", // #FACC15 (BGR)
    assSecondary: "&H00FFFFFF", // #FFFFFF
    assContext: "&H35D4D4D4", // #D4D4D4
    assHeader: "&H0015CCFA",
    assBack: "&H30000000",
    assOutline: "&H00000000",
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Synchronized Word-by-Word & Phrase Timing Engine (for Live Teleprompter + Read-Along Video & Subtitles)
// ---------------------------------------------------------------------------------------------------------------

export interface PhononWordTiming {
  word: string;
  wordIndex: number;
  chunkIndex: number;
  cueIndex: number;
  charStart: number;
  charEnd: number;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface PhononReadAlongCue {
  index: number;
  chunkIndex: number;
  paragraphIndex: number;
  text: string;
  startMs: number;
  endMs: number;
  words: PhononWordTiming[];
}

export interface PhononTimedChunk {
  index: number;
  paragraphIndex: number;
  text: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Optional 16-bit signed little-endian mono PCM audio samples for exact waveform-aligned word timings. */
  pcmData?: Buffer;
  /** Sample rate of `pcmData` (default 24000). */
  sampleRate?: number;
  /** Playback/export speed multiplier applied to this chunk (default 1). */
  speed?: number;
}

export interface PhononReadAlongTimeline {
  totalDurationMs: number;
  chunks: PhononTimedChunk[];
  cues: PhononReadAlongCue[];
  words: PhononWordTiming[];
}

const FAST_FUNCTION_WORDS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "by", "for", "as", "is", "be", "or", "and", "so", "if", "it", "us", "we",
]);

/**
 * Estimates the spoken syllable/phoneme weight and punctuation pause affinity of a word token.
 * Accurately accounts for uppercase/alphanumeric acronyms (`TTS`, `MLX`, `MP4`, `MKV`, `MP3`, `M4A`) that neural TTS
 * spells out letter-by-letter with distinct pitch inflections, spoken digits, hyphenated compounds, and fast function words.
 */
export function estimateSpokenWordWeight(rawWord: string): { weight: number; pauseAffinity: number; textOnlyWeight: number } {
  const stripped = rawWord.replace(/^['"“‘(\[]+|['"”’)\].!?,;:—–…]+$/g, "");
  let pauseAffinity = 0;
  if (/[.!?…]['"”’)\]]*$/.test(rawWord) || rawWord.endsWith("...")) pauseAffinity = 3.0;
  else if (/[;:—–]['"”’)\]]*$/.test(rawWord)) pauseAffinity = 2.2;
  else if (/,['"”’)\]]*$/.test(rawWord)) pauseAffinity = 1.8;

  if (!stripped) {
    return { weight: 1.0, pauseAffinity, textOnlyWeight: 1.0 + pauseAffinity };
  }

  const subParts = stripped.split(/[-/—–:]+/).filter(Boolean);
  let totalSyllables = 0;

  for (const part of subParts) {
    const digits = (part.match(/\d/g) || []).length;
    const letters = part.replace(/[^A-Za-z\u00C0-\u024F]/g, "");
    const upperCount = (letters.match(/[A-Z]/g) || []).length;
    const isAllCaps = letters.length >= 2 && upperCount === letters.length;
    const isMixedAcronym = letters.length >= 2 && (upperCount >= 2 || (upperCount >= 1 && digits >= 1));

    if (isAllCaps || isMixedAcronym) {
      const vowelCount = (letters.match(/[AEIOUYaeiouy]/g) || []).length;
      if (vowelCount === 0 || letters.length <= 3 || digits > 0) {
        totalSyllables += letters.length * 1.15 + digits * 1.35;
      } else {
        totalSyllables += Math.max(1.8, letters.length * 0.75) + digits * 1.35;
      }
    } else {
      const lower = letters.toLowerCase();
      const vowelGroups = (lower.match(/[aeiouy\u00E0-\u00FC]+/g) || []).length;
      const silentE = lower.endsWith("e") && !lower.endsWith("le") && vowelGroups > 1 ? 1 : 0;
      const wordSyllables = letters.length > 0 ? Math.max(1, vowelGroups - silentE) : 0;
      totalSyllables += wordSyllables + digits * 1.35;
    }
  }

  const lowerClean = stripped.toLowerCase();
  if (FAST_FUNCTION_WORDS.has(lowerClean) && pauseAffinity === 0) {
    return { weight: 0.72, pauseAffinity: 0, textOnlyWeight: 0.9 };
  }

  const charFactor = Math.pow(Math.max(1, stripped.length), 0.45) * 0.35;
  const weight = Math.max(0.85, totalSyllables * 0.95 + charFactor);
  return {
    weight,
    pauseAffinity,
    textOnlyWeight: weight + pauseAffinity,
  };
}

/**
 * Computes natural phoneme/syllable-weighted, punctuation-aware, and (when `pcmOptions.pcmData` is provided)
 * pitch-invariant acoustic-waveform-aligned word timings within `[startOffsetMs, startOffsetMs + durationMs]`.
 *
 * When `pcmData` is supplied, this function:
 *   1. Trims leading pre-roll and trailing silence so Word 1 highlights at the exact speech onset (`speechStartMs`).
 *   2. Uses a pitch-invariant voiced-time curve so low-pitched or softer sentence-final words are never rushed past.
 *   3. Anchors punctuated clause breaks to real acoustic pause valleys via monotonic Dynamic Programming so the text
 *      selection waits during breath/pitch-change pauses instead of racing ahead of the voice.
 *   4. Snaps interior word boundaries to local energy minima (consonant closures / micro-dips) in the PCM envelope.
 */
export function computeWordTimingsForText(
  text: string,
  durationMs: number,
  startOffsetMs = 0,
  chunkIndex = 0,
  pcmOptions?: { pcmData?: Buffer; sampleRate?: number; speed?: number },
): PhononWordTiming[] {
  const safeDuration = Math.max(20, Math.round(durationMs));
  const rawTokens: Array<{
    word: string;
    charStart: number;
    charEnd: number;
    weight: number;
    pauseAffinity: number;
    textOnlyWeight: number;
  }> = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const word = match[0];
    const charStart = match.index;
    const charEnd = charStart + word.length;
    const { weight, pauseAffinity, textOnlyWeight } = estimateSpokenWordWeight(word);
    rawTokens.push({ word, charStart, charEnd, weight, pauseAffinity, textOnlyWeight });
  }

  if (rawTokens.length === 0) return [];

  const pcmData = pcmOptions?.pcmData;
  const sampleRate = Math.max(8000, pcmOptions?.sampleRate || 24000);
  const safeSpeed = Math.max(0.25, Math.min(4.0, pcmOptions?.speed || 1));
  const frameMs = 10;
  const samplesPerFrame = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const totalSamples = pcmData ? Math.floor(pcmData.length / 2) : 0;
  const numFrames = totalSamples > 0 ? Math.ceil(totalSamples / samplesPerFrame) : 0;

  // Use high-resolution PCM waveform alignment whenever we have real speech frames (>= 4 frames per word)
  if (pcmData && numFrames >= Math.max(16, rawTokens.length * 4)) {
    const rawRms = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
      let sum = 0;
      let cnt = 0;
      const base = f * samplesPerFrame;
      for (let i = 0; i < samplesPerFrame && base + i < totalSamples; i++) {
        const s = pcmData.readInt16LE((base + i) * 2) / 32768;
        sum += s * s;
        cnt++;
      }
      rawRms[f] = cnt > 0 ? Math.sqrt(sum / cnt) : 0;
    }

    const env = new Float32Array(numFrames);
    let maxEnv = 0;
    let minEnv = Infinity;
    for (let f = 0; f < numFrames; f++) {
      const prev = rawRms[Math.max(0, f - 1)]!;
      const cur = rawRms[f]!;
      const next = rawRms[Math.min(numFrames - 1, f + 1)]!;
      const v = 0.25 * prev + 0.5 * cur + 0.25 * next;
      env[f] = v;
      if (v > maxEnv) maxEnv = v;
      if (v < minEnv) minEnv = v;
    }

    // Check that the waveform has real speech envelope modulation (not a flat synthetic test tone)
    if (maxEnv >= 0.002 && minEnv < maxEnv * 0.75) {
      // 5.5% threshold ensures low-pitched / softer sentence-final pitch drops are still recognized as voiced speech
      const voiceThresh = Math.max(0.003, maxEnv * 0.055);
      let startF = 0;
      while (startF < numFrames && env[startF]! < voiceThresh) startF++;
      startF = Math.max(0, startF - 1);

      let endF = numFrames - 1;
      while (endF > startF && env[endF]! < voiceThresh) endF--;
      endF = Math.min(numFrames, endF + 2);

      if (endF - startF >= rawTokens.length * 2) {
        // 1. Find acoustic pause valleys >= 110ms (11 frames) inside [startF, endF]
        const valleys: Array<{ startF: number; endF: number; lenF: number }> = [];
        let inVal = false;
        let vStart = 0;
        for (let f = startF; f <= endF; f++) {
          const silent = f < endF ? env[f]! < voiceThresh : false;
          if (silent && !inVal) {
            inVal = true;
            vStart = f;
          } else if (!silent && inVal) {
            inVal = false;
            const lenF = f - vStart;
            if (lenF >= 11) valleys.push({ startF: vStart, endF: f, lenF });
          }
        }

        // 2. Pitch-invariant voiced-time cumulative curve (active voiced frames = 1.0 regardless of pitch amplitude)
        const voicedCum = new Float64Array(numFrames + 1);
        for (let f = 0; f < numFrames; f++) {
          const active = f >= startF && f < endF && env[f]! >= voiceThresh;
          voicedCum[f + 1] = voicedCum[f]! + (active ? 1.0 : 0.01);
        }
        const totalVoiced = Math.max(0.001, voicedCum[endF]! - voicedCum[startF]!);
        const totalWordWeight = rawTokens.reduce((s, t) => s + t.weight, 0) || 1;

        const wordCumFrac: number[] = [];
        let wCum = 0;
        for (let i = 0; i < rawTokens.length; i++) {
          wCum += rawTokens[i]!.weight;
          wordCumFrac.push(wCum / totalWordWeight);
        }

        // 3. Dynamic Programming monotonic sequence alignment between punctuated words and acoustic pause valleys
        const punctIndices = rawTokens
          .map((t, idx) => ({ idx, frac: wordCumFrac[idx]!, affinity: t.pauseAffinity }))
          .filter((p) => p.idx < rawTokens.length - 1 && p.affinity >= 1.5);

        const vFracs = valleys.map((v) => (voicedCum[v.startF]! - voicedCum[startF]!) / totalVoiced);
        const P = punctIndices.length;
        const V = valleys.length;

        const dp: number[][] = Array.from({ length: P }, () => new Array(V).fill(-Infinity));
        const parent: Array<Array<{ pi: number; vj: number } | null>> = Array.from({ length: P }, () => new Array(V).fill(null));
        let bestEndScore = 0;
        let bestEndPair: { pi: number; vj: number } | null = null;

        for (let i = 0; i < P; i++) {
          const p = punctIndices[i]!;
          for (let j = 0; j < V; j++) {
            const v = valleys[j]!;
            const vf = vFracs[j]!;
            const absDist = Math.abs(vf - p.frac);
            if (absDist > 0.16) continue;

            const baseReward = p.affinity * 0.10 + Math.min(0.08, v.lenF * 0.002) - absDist * 1.1;
            if (baseReward > dp[i]![j]!) {
              dp[i]![j] = baseReward;
              parent[i]![j] = null;
            }

            for (let pi = 0; pi < i; pi++) {
              const prevP = punctIndices[pi]!;
              const expectedDelta = p.frac - prevP.frac;
              for (let vj = 0; vj < j; vj++) {
                const prevScore = dp[pi]![vj]!;
                if (prevScore === -Infinity) continue;
                if (v.startF <= valleys[vj]!.endF) continue;
                const actualDelta = vf - vFracs[vj]!;
                const deltaDiff = Math.abs(actualDelta - expectedDelta);
                if (deltaDiff > Math.max(0.13, expectedDelta * 1.1)) continue;
                const transScore = prevScore + baseReward - deltaDiff * 2.0;
                if (transScore > dp[i]![j]!) {
                  dp[i]![j] = transScore;
                  parent[i]![j] = { pi, vj };
                }
              }
            }

            if (dp[i]![j]! > bestEndScore) {
              bestEndScore = dp[i]![j]!;
              bestEndPair = { pi: i, vj: j };
            }
          }
        }

        const anchors: Array<{ wordIdx: number; valleyStartF: number; valleyEndF: number }> = [];
        let cur = bestEndPair;
        while (cur) {
          const p = punctIndices[cur.pi]!;
          const v = valleys[cur.vj]!;
          anchors.push({ wordIdx: p.idx, valleyStartF: v.startF, valleyEndF: v.endF });
          cur = parent[cur.pi]![cur.vj]!;
        }
        anchors.reverse();

        const segs: Array<{ wStart: number; wEnd: number; fStart: number; fEnd: number }> = [];
        let prevW = 0;
        let prevF = startF;
        for (const a of anchors) {
          segs.push({ wStart: prevW, wEnd: a.wordIdx, fStart: prevF, fEnd: a.valleyStartF });
          prevW = a.wordIdx + 1;
          prevF = a.valleyEndF;
        }
        segs.push({ wStart: prevW, wEnd: rawTokens.length - 1, fStart: prevF, fEnd: endF });

        const words: PhononWordTiming[] = [];
        for (const seg of segs) {
          const segTokens = rawTokens.slice(seg.wStart, seg.wEnd + 1);
          const segWTotal = segTokens.reduce((s, t) => s + t.weight, 0) || 1;
          const segVoicedStart = voicedCum[seg.fStart]!;
          const segVoicedTotal = Math.max(0.001, voicedCum[seg.fEnd]! - segVoicedStart);

          const boundaryFrames: number[] = [seg.fStart];
          let localCum = 0;
          for (let k = 0; k < segTokens.length - 1; k++) {
            localCum += segTokens[k]!.weight;
            const targetV = segVoicedStart + (localCum / segWTotal) * segVoicedTotal;
            let fB = seg.fStart;
            while (fB < seg.fEnd && voicedCum[fB]! < targetV) fB++;
            boundaryFrames.push(fB);
          }
          boundaryFrames.push(seg.fEnd);

          // 4. Snap interior word boundaries to local energy minima (consonant closures / dips)
          for (let k = 1; k < boundaryFrames.length - 1; k++) {
            const estF = boundaryFrames[k]!;
            const prevBound = boundaryFrames[k - 1]!;
            const nextBound = boundaryFrames[k + 1]!;
            const minSearch = Math.max(prevBound + 3, estF - 8);
            const maxSearch = Math.min(nextBound - 3, estF + 8);
            if (minSearch <= maxSearch) {
              let bestF = estF;
              let bestCost = Infinity;
              for (let f = minSearch; f <= maxSearch; f++) {
                const distPenalty = Math.abs(f - estF) * (maxEnv * 0.02);
                const cost = env[f]! + distPenalty;
                if (cost < bestCost) {
                  bestCost = cost;
                  bestF = f;
                }
              }
              boundaryFrames[k] = bestF;
            }
          }

          for (let k = 0; k < segTokens.length; k++) {
            const tok = segTokens[k]!;
            const globalIdx = seg.wStart + k;
            let fS = boundaryFrames[k]!;
            const fE = Math.max(fS + 1, boundaryFrames[k + 1]!);
            while (fS < fE - 1 && env[fS]! < voiceThresh) fS++;
            let fEndVoiced = fE;
            while (fEndVoiced > fS + 1 && env[fEndVoiced - 1]! < voiceThresh * 0.8) fEndVoiced--;

            const prevEnd = words.length > 0 ? words[words.length - 1]!.endMs : startOffsetMs;
            const rawStartMs = startOffsetMs + Math.round((fS * frameMs) / safeSpeed);
            const rawEndMs = startOffsetMs + Math.round((fEndVoiced * frameMs) / safeSpeed);
            const startMs = Math.max(prevEnd, Math.min(startOffsetMs + safeDuration - 1, rawStartMs));
            const endMs = Math.max(startMs + 1, Math.min(startOffsetMs + safeDuration, Math.max(startMs + 20, rawEndMs)));

            words.push({
              word: tok.word,
              wordIndex: globalIdx,
              chunkIndex,
              cueIndex: 0,
              charStart: tok.charStart,
              charEnd: tok.charEnd,
              startMs,
              endMs,
              durationMs: Math.max(1, endMs - startMs),
            });
          }
        }
        return words;
      }
    }
  }

  // Analytical fallback when raw PCM samples are not provided (or for synthetic short test buffers)
  const totalWeight = rawTokens.reduce((sum, t) => sum + t.textOnlyWeight, 0) || 1;
  const words: PhononWordTiming[] = [];
  let cumWeight = 0;

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i]!;
    const startMs = i === 0
      ? startOffsetMs
      : Math.max(words[i - 1]!.endMs, startOffsetMs + Math.round((cumWeight / totalWeight) * safeDuration));
    cumWeight += tok.textOnlyWeight;
    const endMs = i === rawTokens.length - 1
      ? Math.max(startMs + 1, startOffsetMs + safeDuration)
      : Math.max(startMs + 1, startOffsetMs + Math.round((cumWeight / totalWeight) * safeDuration));
    words.push({
      word: tok.word,
      wordIndex: i,
      chunkIndex,
      cueIndex: 0,
      charStart: tok.charStart,
      charEnd: tok.charEnd,
      startMs,
      endMs,
      durationMs: Math.max(1, endMs - startMs),
    });
  }
  return words;
}

/**
 * Builds a complete synchronized Read-Along Timeline across all synthesized chunks, grouping words into readable
 * caption lines (`cues`) while preserving exact millisecond start/end times for every word.
 */
export function computeReadAlongTimeline(
  timedChunks: PhononTimedChunk[],
  options: { aspectRatio?: PhononVideoAspect; maxLineChars?: number; maxWordsPerCue?: number } = {},
): PhononReadAlongTimeline {
  const aspect = VIDEO_ASPECT_INFO[options.aspectRatio ?? "16:9"] ?? VIDEO_ASPECT_INFO["16:9"];
  const maxLineChars = options.maxLineChars ?? aspect.maxLineChars;
  const maxWordsPerCue = options.maxWordsPerCue ?? aspect.maxWordsPerCue;

  const allWords: PhononWordTiming[] = [];
  const allCues: PhononReadAlongCue[] = [];
  let globalWordIdx = 0;

  for (const chunk of timedChunks) {
    const chunkWords = computeWordTimingsForText(
      chunk.text,
      Math.max(20, chunk.endMs - chunk.startMs),
      chunk.startMs,
      chunk.index,
      chunk.pcmData
        ? { pcmData: chunk.pcmData, sampleRate: chunk.sampleRate, speed: chunk.speed }
        : undefined,
    );
    if (!chunkWords.length) continue;

    let currentCueWords: PhononWordTiming[] = [];
    let currentCueChars = 0;

    const flushCue = () => {
      if (!currentCueWords.length) return;
      const cueIdx = allCues.length;
      for (const w of currentCueWords) {
        w.cueIndex = cueIdx;
      }
      allCues.push({
        index: cueIdx,
        chunkIndex: chunk.index,
        paragraphIndex: chunk.paragraphIndex,
        text: currentCueWords.map((w) => w.word).join(" "),
        startMs: currentCueWords[0]!.startMs,
        endMs: currentCueWords[currentCueWords.length - 1]!.endMs,
        words: currentCueWords,
      });
      currentCueWords = [];
      currentCueChars = 0;
    };

    for (let k = 0; k < chunkWords.length; k++) {
      const w = chunkWords[k]!;
      w.wordIndex = globalWordIdx++;
      allWords.push(w);

      // If there was a major acoustic pause (>= 280ms) before this word and current cue already has >= 2 words, start a fresh cue
      const prevInCue = currentCueWords[currentCueWords.length - 1];
      if (prevInCue && w.startMs - prevInCue.endMs >= 280 && currentCueWords.length >= 2) {
        flushCue();
      }

      const nextLen = currentCueChars === 0 ? w.word.length : currentCueChars + 1 + w.word.length;
      if (currentCueWords.length >= maxWordsPerCue || (currentCueWords.length > 0 && nextLen > maxLineChars)) {
        flushCue();
      }
      currentCueWords.push(w);
      currentCueChars = currentCueChars === 0 ? w.word.length : currentCueChars + 1 + w.word.length;

      // Break naturally at sentence boundaries once the line has at least 3 words or 16 chars
      if (/[.!?…]['"”’)\]]*$/.test(w.word) && (currentCueWords.length >= 3 || currentCueChars >= 16)) {
        flushCue();
      }
    }
    flushCue();
  }

  const totalDurationMs = timedChunks.length > 0
    ? Math.max(...timedChunks.map((c) => c.endMs), allWords[allWords.length - 1]?.endMs ?? 0)
    : 0;

  return {
    totalDurationMs,
    chunks: timedChunks,
    cues: allCues,
    words: allWords,
  };
}

function formatSrtTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hrs = Math.floor(clamped / 3_600_000);
  const mins = Math.floor((clamped % 3_600_000) / 60_000);
  const secs = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function formatVttTime(ms: number): string {
  return formatSrtTime(ms).replace(",", ".");
}

function formatAssTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hrs = Math.floor(clamped / 3_600_000);
  const mins = Math.floor((clamped % 3_600_000) / 60_000);
  const secs = Math.floor((clamped % 60_000) / 1000);
  const cs = Math.floor((clamped % 1000) / 10);
  return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Formats a `PhononReadAlongTimeline` as a standard SubRip (`.srt`) subtitle file.
 */
export function formatSrtSubtitles(timeline: PhononReadAlongTimeline): string {
  if (!timeline.cues.length) return "";
  return timeline.cues
    .map((cue, idx) => `${idx + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}\n`)
    .join("\n");
}

/**
 * Formats a `PhononReadAlongTimeline` as a WebVTT (`.vtt`) subtitle file with word-level timestamps so HTML5 video
 * players and follow-along readers can track every word.
 */
export function formatVttSubtitles(timeline: PhononReadAlongTimeline): string {
  const lines = ["WEBVTT", ""];
  for (const cue of timeline.cues) {
    lines.push(`${cue.index + 1}`);
    lines.push(`${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs)}`);
    lines.push(cue.text);
    lines.push("");
  }
  return lines.join("\n");
}

function escapeAssText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\r?\n/g, "\\N");
}

/**
 * Formats a `PhononReadAlongTimeline` as an Advanced SubStation Alpha (`.ass`) karaoke script with smooth `{\kf<cs>}`
 * word-by-word highlighting, `{\k<gapCs>}` inter-word pause holds, previous/next line teleprompter context, voice/title header, and progress indicator.
 */
export function formatAssKaraokeSubtitles(
  timeline: PhononReadAlongTimeline,
  options: {
    voice?: string;
    title?: string;
    aspectRatio?: PhononVideoAspect;
    videoTheme?: PhononVideoTheme;
  } = {},
): string {
  const aspect = VIDEO_ASPECT_INFO[options.aspectRatio ?? "16:9"] ?? VIDEO_ASPECT_INFO["16:9"];
  const theme = VIDEO_THEME_INFO[options.videoTheme ?? "midnight"] ?? VIDEO_THEME_INFO.midnight;
  const voiceLabel = escapeAssText((options.voice || "Zoey").trim());
  const titleLabel = escapeAssText((options.title || "Ollama Phonon Read-Along").trim().slice(0, 72));
  const cx = Math.round(aspect.width / 2);
  const cy = Math.round(aspect.height * 0.52);
  const prevY = cy - aspect.lineSpacingPx;
  const nextY = cy + aspect.lineSpacingPx;
  const progressY = aspect.height - Math.round(aspect.height * 0.08);
  const totalSec = Math.max(1, Math.round(timeline.totalDurationMs / 1000));

  const endAss = formatAssTime(Math.max(1000, timeline.totalDurationMs + 250));

  const lines: string[] = [
    "[Script Info]",
    `; Generated by Codecaine File Manager — Ollama Phonon Read-Along Video Studio`,
    `Title: ${titleLabel}`,
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${aspect.width}`,
    `PlayResY: ${aspect.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Header,Arial,${aspect.headerFontSize},${theme.assHeader},${theme.assHeader},${theme.assOutline},${theme.assBack},-1,0,0,0,100,100,0.5,0,3,10,0,8,60,60,48,1`,
    `Style: ActiveKaraoke,Arial,${aspect.fontSize},${theme.assPrimary},${theme.assSecondary},${theme.assOutline},${theme.assBack},-1,0,0,0,100,100,0,0,3,16,0,5,90,90,40,1`,
    `Style: ContextLine,Arial,${aspect.contextFontSize},${theme.assContext},${theme.assContext},${theme.assOutline},&HFF000000,0,0,0,0,100,100,0,0,1,2,0,5,110,110,40,1`,
    `Style: ProgressHud,Arial,${Math.max(22, aspect.headerFontSize - 2)},${theme.assSecondary},${theme.assSecondary},${theme.assOutline},${theme.assBack},0,0,0,0,100,100,0.5,0,3,8,0,2,60,60,36,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,0:00:00.00,${endAss},Header,,0,0,0,,${titleLabel}  •  Voice: ${voiceLabel}  •  Follow Along`,
  ];

  const totalCues = timeline.cues.length;
  for (let i = 0; i < totalCues; i++) {
    const cue = timeline.cues[i]!;
    const startStr = formatAssTime(cue.startMs);
    const endStr = formatAssTime(cue.endMs);

    // 1. Previous line context (above active line)
    if (i > 0) {
      const prevText = escapeAssText(timeline.cues[i - 1]!.text);
      lines.push(`Dialogue: 1,${startStr},${endStr},ContextLine,,0,0,0,,{\\pos(${cx},${prevY})}${prevText}`);
    }

    // 2. Active Karaoke Read-Along Line (center stage, word-by-word highlight via \kf + \k pause hold)
    const karaokeParts: string[] = [];
    let cursorCs = Math.floor(Math.max(0, cue.startMs) / 10);
    for (const w of cue.words) {
      const wordStartCs = Math.max(cursorCs, Math.round(w.startMs / 10));
      const wordEndCs = Math.max(wordStartCs + 2, Math.round(w.endMs / 10));
      const gapCs = Math.max(0, wordStartCs - cursorCs);
      const wordCs = Math.max(2, wordEndCs - wordStartCs);
      const prefix = gapCs > 0 ? `{\\k${gapCs}}` : "";
      karaokeParts.push(`${prefix}{\\kf${wordCs}}${escapeAssText(w.word)}`);
      cursorCs = wordEndCs;
    }
    lines.push(`Dialogue: 2,${startStr},${endStr},ActiveKaraoke,,0,0,0,,{\\pos(${cx},${cy})}${karaokeParts.join(" ")}`);

    // 3. Next line preview (below active line)
    if (i + 1 < totalCues) {
      const nextText = escapeAssText(timeline.cues[i + 1]!.text);
      lines.push(`Dialogue: 1,${startStr},${endStr},ContextLine,,0,0,0,,{\\pos(${cx},${nextY})}${nextText}`);
    }

    // 4. Bottom progress indicator
    const pct = Math.min(100, Math.round(((i + 1) / Math.max(1, totalCues)) * 100));
    const filledBars = Math.round((pct / 100) * 16);
    const bar = `${"█".repeat(filledBars)}${"░".repeat(Math.max(0, 16 - filledBars))}`;
    const curSec = Math.round(cue.endMs / 1000);
    lines.push(
      `Dialogue: 1,${startStr},${endStr},ProgressHud,,0,0,0,,{\\pos(${cx},${progressY})}${bar}  ${pct}%   •   Line ${i + 1} of ${totalCues}   •   ${curSec}s / ${totalSec}s`,
    );
  }

  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Smart Large-Text Chunker (Optimized for Phonon's 8,192-Token Context Window)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Phonon's `gradium_phonon_tts` architecture has an 8,192-token context window shared between input text tokens
 * and output audio codec frames (~12.5–25 codec frames per second of speech).
 * Keeping chunks around 450–600 characters for live streaming playback (and <= 1,100 characters for batch export)
 * guarantees that Phonon never hits its context limit, avoids voice drift, and keeps per-chunk latency low.
 */
export const PHONON_DEFAULT_CHUNK_CHARS = 520;
export const PHONON_BATCH_CHUNK_CHARS = 900;
export const PHONON_HARD_MAX_CHUNK_CHARS = 1200;

export interface PhononTextChunk {
  index: number;
  paragraphIndex: number;
  text: string;
  charCount: number;
  wordCount: number;
}

export interface SplitTextOptions {
  /** Maximum characters per chunk (clamped to 120..1200, default 520). */
  maxChars?: number;
  /** Whether to merge very short consecutive paragraphs into one chunk up to `maxChars * 0.65`. */
  mergeShortParagraphs?: boolean;
}

function countWords(s: string): number {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const isSpace = code <= 32 || code === 160;
    if (!isSpace && !inWord) {
      inWord = true;
      count++;
    } else if (isSpace) {
      inWord = false;
    }
  }
  return count;
}

/**
 * Splits a single long string into pieces no longer than `maxChars`, preferring:
 *   1. Sentence endings (`.`, `!`, `?`, `…`, `;` followed by space/quote)
 *   2. Clause breaks (`,`, `:`, `—`, `–`, `-` followed by space)
 *   3. Word boundaries (spaces)
 *   4. Hard character slice (for unbroken tokens like long base64/URLs)
 * Runs in O(N) linear time with no backtracking regexes, so it safely handles multi-megabyte strings.
 */
function splitLongParagraph(para: string, maxChars: number): string[] {
  const trimmed = para.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const results: string[] = [];
  let pos = 0;
  const len = trimmed.length;

  while (pos < len) {
    while (pos < len && trimmed.charCodeAt(pos) <= 32) pos++;
    if (pos >= len) break;

    if (len - pos <= maxChars) {
      const tail = trimmed.slice(pos).trim();
      if (tail) results.push(tail);
      break;
    }

    const windowEnd = pos + maxChars;
    const minCut = pos + Math.max(40, Math.floor(maxChars * 0.35));

    // 1. Look backwards from windowEnd for a sentence-ending punctuation followed by whitespace
    let cut = -1;
    for (let i = windowEnd; i >= minCut; i--) {
      const ch = trimmed[i - 1];
      const next = trimmed[i] ?? " ";
      if ((ch === "." || ch === "!" || ch === "?" || ch === "…" || ch === ";" || ch === "\n") && /\s/.test(next)) {
        cut = i;
        break;
      }
      if ((ch === '"' || ch === "'" || ch === ")" || ch === "]") && i >= 2) {
        const prev = trimmed[i - 2];
        if ((prev === "." || prev === "!" || prev === "?" || prev === "…") && /\s/.test(next)) {
          cut = i;
          break;
        }
      }
    }

    // 2. Look backwards for a clause break (, : — – -) followed by whitespace
    if (cut === -1) {
      for (let i = windowEnd; i >= minCut; i--) {
        const ch = trimmed[i - 1];
        const next = trimmed[i] ?? " ";
        if ((ch === "," || ch === ":" || ch === "—" || ch === "–" || ch === "-") && /\s/.test(next)) {
          cut = i;
          break;
        }
      }
    }

    // 3. Look backwards for any whitespace (word boundary)
    if (cut === -1) {
      for (let i = windowEnd; i > pos; i--) {
        if (trimmed.charCodeAt(i) <= 32) {
          cut = i;
          break;
        }
      }
    }

    // 4. Hard cut if a single token has no spaces at all
    if (cut === -1 || cut <= pos) {
      cut = windowEnd;
    }

    const piece = trimmed.slice(pos, cut).trim();
    if (piece) results.push(piece);
    pos = cut;
  }

  return results;
}

/**
 * Splits arbitrarily large text into Phonon-safe chunks with paragraph tracking and word/character counts.
 */
export function splitTextForPhonon(rawText: string, options: SplitTextOptions = {}): PhononTextChunk[] {
  const maxChars = Math.min(
    PHONON_HARD_MAX_CHUNK_CHARS,
    Math.max(120, Math.round(options.maxChars ?? PHONON_DEFAULT_CHUNK_CHARS)),
  );
  const mergeShort = options.mergeShortParagraphs ?? false;
  const normalized = rawText.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  if (!normalized.trim()) return [];

  const rawParagraphs = normalized.split(/\n{2,}/);
  const chunks: PhononTextChunk[] = [];
  let paragraphIndex = 0;

  let pendingText = "";
  let pendingParaIdx = 0;

  const flushPending = () => {
    if (!pendingText) return;
    chunks.push({
      index: chunks.length,
      paragraphIndex: pendingParaIdx,
      text: pendingText,
      charCount: pendingText.length,
      wordCount: countWords(pendingText),
    });
    pendingText = "";
  };

  for (const rawPara of rawParagraphs) {
    const cleanPara = rawPara.replace(/[ \t]+/g, " ").trim();
    if (!cleanPara) continue;

    const pieces = splitLongParagraph(cleanPara, maxChars);
    for (const piece of pieces) {
      if (mergeShort && pendingText && pendingText.length + 1 + piece.length <= Math.floor(maxChars * 0.75)) {
        pendingText = `${pendingText}\n${piece}`;
      } else {
        flushPending();
        if (mergeShort && piece.length < Math.floor(maxChars * 0.4)) {
          pendingText = piece;
          pendingParaIdx = paragraphIndex;
        } else {
          chunks.push({
            index: chunks.length,
            paragraphIndex,
            text: piece,
            charCount: piece.length,
            wordCount: countWords(piece),
          });
        }
      }
    }
    paragraphIndex++;
  }
  flushPending();
  return chunks;
}

// ---------------------------------------------------------------------------------------------------------------
// Speech Text Normalization & Markup/Format Cleanup
// ---------------------------------------------------------------------------------------------------------------

export interface CleanTextOptions {
  /** Strip Markdown formatting (# headings, **bold**, links, tables, etc.). Default true. */
  stripMarkdown?: boolean;
  /** Strip HTML/XML tags and decode entities. Default true. */
  stripHtml?: boolean;
  /** Omit fenced code blocks (``` ... ```) so Phonon doesn't read raw code syntax aloud. Default false. */
  stripCodeBlocks?: boolean;
  /** Simplify or strip raw HTTP/HTTPS URLs so Phonon doesn't spell out query strings. Default true. */
  simplifyUrls?: boolean;
  /** Strip SRT/VTT/LRC subtitle timestamps. Default true. */
  stripTimestamps?: boolean;
  /** Unwrap single line breaks inside paragraphs into flowing sentences. Default false. */
  unwrapLines?: boolean;
}

/**
 * Cleans and normalizes text from Markdown, HTML, subtitles, logs, or documents so it reads naturally aloud.
 */
export function cleanTextForSpeech(input: string, opts: CleanTextOptions = {}): string {
  const stripMarkdown = opts.stripMarkdown ?? true;
  const stripHtml = opts.stripHtml ?? true;
  const stripCodeBlocks = opts.stripCodeBlocks ?? false;
  const simplifyUrls = opts.simplifyUrls ?? true;
  const stripTimestamps = opts.stripTimestamps ?? true;
  const unwrapLines = opts.unwrapLines ?? false;

  let s = input.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");

  // 1. Handle fenced code blocks first
  if (stripCodeBlocks) {
    s = s.replace(/^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1\s*$/gm, "\n[Code block omitted]\n");
  } else if (stripMarkdown) {
    s = s.replace(/^ {0,3}(?:`{3,}|~{3,})[^\n]*\n([\s\S]*?)^ {0,3}(?:`{3,}|~{3,})\s*$/gm, "\n$1\n");
  }

  // 2. Strip subtitle timestamps (SRT / VTT / LRC)
  if (stripTimestamps) {
    s = s.replace(/^WEBVTT[^\n]*\n+/i, "");
    s = s.replace(/^\d+\s*\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}[^\n]*\n/gm, "");
    s = s.replace(/^\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}[^\n]*\n/gm, "");
    s = s.replace(/^\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]\s*/gm, "");
  }

  // 3. Strip HTML comments, script/style tags, and inline HTML tags if requested
  if (stripHtml) {
    s = s.replace(/<!--[\s\S]*?-->/g, "");
    s = s.replace(/<(script|style|head|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, "");
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<\/(p|div|h[1-6]|tr|li|blockquote|section|article)\s*>/gi, "\n\n");
    s = s.replace(/<[^>]{1,200}>/g, " ");
    s = s
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&mdash;/gi, " — ")
      .replace(/&ndash;/gi, " – ")
      .replace(/&hellip;/gi, "…")
      .replace(/&#(\d{1,7});/g, (m, d) => {
        const n = Number(d);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      });
  }

  // 4. Strip Markdown syntax
  if (stripMarkdown) {
    // Images: ![alt](url) -> alt
    s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
    // Links: [text](url) -> text
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    // Reference links: [text][id] -> text
    s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
    // Link definitions: [id]: http...
    s = s.replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, "");
    // Headings: ### Heading -> Heading.
    s = s.replace(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/gm, "$1");
    // Setext underlines and horizontal rules (===, ---, ***, ___)
    s = s.replace(/^ {0,3}(?:[-=_*][ \t]*){3,}$/gm, "");
    // Blockquotes: > text -> text
    s = s.replace(/^ {0,3}>\s?/gm, "");
    // Task checkboxes: - [x] item -> item
    s = s.replace(/^(\s*[-+*]|\s*\d+[.)])\s+\[[ xX]\]\s+/gm, "$1 ");
    // Bullet points: - item -> item
    s = s.replace(/^ {0,3}[-+*]\s+/gm, "");
    // Bold/italic/strikethrough/inline code
    s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
    s = s.replace(/__([^_]+)__/g, "$1");
    s = s.replace(/~~([^~]+)~~/g, "$1");
    s = s.replace(/`([^`\n]+)`/g, "$1");
    // Markdown table separator rows
    s = s.replace(/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/gm, "");
    // Markdown table pipes -> commas/spaces
    s = s.replace(/^\s*\|\s*(.*?)\s*\|\s*$/gm, (_m, row: string) => row.split(/\s*\|\s*/).filter(Boolean).join(", "));
  }

  // 5. Simplify URLs so Phonon doesn't read 100-character query strings character by character
  if (simplifyUrls) {
    s = s.replace(/https?:\/\/([^\s/$.?#].[^\s)>\]"']*)/gi, (_m, rest: string) => {
      const host = rest.split("/")[0]?.replace(/^www\./i, "") ?? "website";
      return host;
    });
  }

  // 6. Collapse repeated ASCII box-drawing or divider symbols (e.g. "========", "--------", "********")
  s = s.replace(/([=\-*_#~+^]{4,})/g, " ");

  // 7. Unwrap single newlines inside paragraphs if requested
  if (unwrapLines) {
    s = s
      .split(/\n{2,}/)
      .map((para) => para.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean)
      .join("\n\n");
  }

  // 8. Final whitespace normalization
  s = s
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Universal Format-to-Plain-Text Extractor (Any Document / Data / Subtitle / E-Book / Text File)
// ---------------------------------------------------------------------------------------------------------------

export interface ExtractedPlainText {
  text: string;
  rawText: string;
  formatLabel: string;
  method: string;
  charCount: number;
  wordCount: number;
  chunkCount: number;
  estimatedSeconds: number;
  title?: string;
}

function docBlocksToPlainText(blocks: DocBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if ("rows" in b) {
      for (const row of b.rows) {
        const line = row.map((c) => c.trim()).filter(Boolean).join(", ");
        if (line) parts.push(line);
      }
    } else if (b.text.trim()) {
      parts.push(b.text.trim());
    }
  }
  return parts.join("\n\n");
}

function richPreviewToPlainText(rich: RichPreview): { text: string; formatLabel: string; title?: string } | null {
  switch (rich.kind) {
    case "document": {
      const text = rich.plainText?.trim() || docBlocksToPlainText(rich.blocks);
      if (!text) return null;
      return { text, formatLabel: rich.formatLabel, ...(rich.title ? { title: rich.title } : {}) };
    }
    case "pdf": {
      const text = rich.extractedText?.trim();
      if (!text) return null;
      return { text, formatLabel: rich.formatLabel };
    }
    case "presentation": {
      const slidesText = rich.slides
        .map((s) => {
          const lines = [`Slide ${s.number}${s.title ? `: ${s.title}` : ""}.`, ...s.bullets];
          if (s.notes) lines.push(`Notes: ${s.notes}`);
          return lines.join("\n");
        })
        .join("\n\n");
      const text = slidesText.trim() || rich.plainText?.trim();
      if (!text) return null;
      return { text, formatLabel: rich.formatLabel };
    }
    case "spreadsheet": {
      const parts: string[] = [];
      for (const sheet of rich.sheets) {
        parts.push(`Sheet: ${sheet.name}.`);
        for (const row of sheet.rows) {
          const pairs: string[] = [];
          for (let i = 0; i < row.length; i++) {
            const val = row[i]?.trim();
            if (!val) continue;
            const hdr = sheet.headers[i]?.trim();
            pairs.push(hdr ? `${hdr}: ${val}` : val);
          }
          if (pairs.length) parts.push(pairs.join(", "));
        }
      }
      const text = parts.join("\n");
      if (!text.trim()) return null;
      return { text, formatLabel: rich.formatLabel };
    }
    case "notebook": {
      const parts: string[] = [];
      for (const cell of rich.cells) {
        if (cell.cellType === "markdown" && cell.source.trim()) {
          parts.push(cell.source.trim());
        } else if (cell.cellType === "code" && cell.source.trim()) {
          parts.push(cell.source.trim());
          for (const out of cell.outputs ?? []) {
            if (out.text?.trim()) parts.push(`Output: ${out.text.trim()}`);
          }
        }
      }
      const text = parts.join("\n\n");
      if (!text.trim()) return null;
      return { text, formatLabel: rich.formatLabel };
    }
    case "subtitles": {
      const text = rich.cues
        .map((c) => (c.speaker ? `${c.speaker}: ${c.text}` : c.text))
        .filter(Boolean)
        .join("\n");
      if (!text.trim()) return null;
      return { text, formatLabel: rich.formatLabel };
    }
    case "calendar": {
      const text = rich.events
        .map((ev) => [ev.summary, ev.start ? `When: ${ev.start}` : "", ev.location ? `Where: ${ev.location}` : "", ev.description || ""].filter(Boolean).join(". "))
        .join("\n\n");
      if (!text.trim()) return null;
      return { text, formatLabel: rich.formatLabel };
    }
    case "contact": {
      const text = rich.contacts
        .map((c) => [c.fullName, c.org, c.title, ...(c.emails ?? []), ...(c.phones ?? []), c.note || ""].filter(Boolean).join(", "))
        .join("\n\n");
      if (!text.trim()) return null;
      return { text, formatLabel: rich.formatLabel };
    }
    case "playlist": {
      const text = rich.tracks.map((t) => `${t.index}. ${t.title || t.path}`).join("\n");
      if (!text.trim()) return null;
      return { text, formatLabel: rich.formatLabel };
    }
    case "structured": {
      if (rich.table && rich.table.rows.length > 0) {
        const lines = rich.table.rows.map((r) =>
          r
            .map((v, i) => (v ? (rich.table!.headers[i] ? `${rich.table!.headers[i]}: ${v}` : v) : ""))
            .filter(Boolean)
            .join(", "),
        );
        return { text: lines.join("\n"), formatLabel: rich.formatLabel };
      }
      if (rich.formattedText) return { text: rich.formattedText, formatLabel: rich.formatLabel };
      if (rich.data !== undefined) return { text: structuredDataToProse(rich.data), formatLabel: rich.formatLabel };
      return null;
    }
    case "archive": {
      if (rich.innerText?.trim()) {
        return { text: rich.innerText.trim(), formatLabel: rich.formatLabel, ...(rich.innerName ? { title: rich.innerName } : {}) };
      }
      return null;
    }
    default:
      return null;
  }
}

function structuredDataToProse(data: unknown, depth = 0): string {
  if (depth > 8 || data === null || data === undefined) return "";
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") return String(data);
  if (Array.isArray(data)) {
    return data
      .map((item) => structuredDataToProse(item, depth + 1))
      .filter(Boolean)
      .join(depth === 0 ? "\n\n" : ", ");
  }
  if (typeof data === "object") {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (v === null || v === undefined || v === "") continue;
      const humanizedKey = k.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
      if (typeof v === "object") {
        const sub = structuredDataToProse(v, depth + 1);
        if (sub) lines.push(`${humanizedKey}: ${sub}`);
      } else {
        lines.push(`${humanizedKey}: ${String(v)}`);
      }
    }
    return lines.join(depth === 0 ? "\n" : "; ");
  }
  return "";
}

async function runExternalTextExtractor(
  ctx: FmContext,
  filePath: string,
  ext: string,
): Promise<{ text: string; method: string; formatLabel: string } | null> {
  // 1. PDF via poppler (pdftotext) or Ghostscript
  if (ext === "pdf") {
    const pdftotext = resolveTool(ctx, "poppler");
    if (pdftotext) {
      const res = Bun.spawnSync([pdftotext, "-enc", "UTF-8", filePath, "-"], { stdout: "pipe", stderr: "pipe", timeout: 60_000 });
      const out = res.stdout.toString("utf8").trim();
      if (res.exitCode === 0 && out) {
        return { text: out, method: "Poppler (pdftotext)", formatLabel: "PDF Document" };
      }
    }
    const gs = resolveTool(ctx, "ghostscript");
    if (gs) {
      const res = Bun.spawnSync([gs, "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=txtwrite", "-sOutputFile=-", filePath], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 60_000,
      });
      const out = res.stdout.toString("utf8").trim();
      if (res.exitCode === 0 && out) {
        return { text: out, method: "Ghostscript (txtwrite)", formatLabel: "PDF Document" };
      }
    }
  }

  // 2. Images via Tesseract OCR
  if (["png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp", "gif"].includes(ext)) {
    const tesseract = resolveTool(ctx, "tesseract");
    if (tesseract) {
      const res = Bun.spawnSync([tesseract, filePath, "stdout"], { stdout: "pipe", stderr: "pipe", timeout: 60_000 });
      const out = res.stdout.toString("utf8").trim();
      if (res.exitCode === 0 && out) {
        return { text: out, method: "Tesseract OCR", formatLabel: `Image OCR (${ext.toUpperCase()})` };
      }
    }
  }

  // 3. Pandoc for markup / documents (.docx, .odt, .rtf, .epub, .tex, .rst, .org, .adoc, .wiki, .textile)
  if (["docx", "odt", "rtf", "epub", "fb2", "tex", "rst", "org", "adoc", "asciidoc", "wiki", "mediawiki", "textile", "ipynb"].includes(ext)) {
    const pandoc = resolveTool(ctx, "pandoc");
    if (pandoc) {
      const res = Bun.spawnSync([pandoc, "--wrap=none", "-t", "plain", filePath], { stdout: "pipe", stderr: "pipe", timeout: 60_000 });
      const out = res.stdout.toString("utf8").trim();
      if (res.exitCode === 0 && out) {
        return { text: out, method: "Pandoc", formatLabel: `${ext.toUpperCase()} Document` };
      }
    }
  }

  // 4. Calibre ebook-convert for MOBI / AZW3 / EPUB / FB2
  if (["mobi", "azw", "azw3", "azw4", "epub", "fb2", "lit", "pdb"].includes(ext)) {
    const calibre = resolveTool(ctx, "calibre");
    if (calibre) {
      const tmpTxt = nodePath.join(tmpdir(), `fm-phonon-eb-${process.pid}-${randomBytes(4).toString("hex")}.txt`);
      try {
        const res = Bun.spawnSync([calibre, filePath, tmpTxt], { stdout: "pipe", stderr: "pipe", timeout: 90_000 });
        if (res.exitCode === 0 && existsSync(tmpTxt)) {
          const out = (await fsp.readFile(tmpTxt, "utf8")).trim();
          if (out) return { text: out, method: "Calibre (ebook-convert)", formatLabel: `E-Book (${ext.toUpperCase()})` };
        }
      } finally {
        await fsp.rm(tmpTxt, { force: true }).catch(() => {});
      }
    }
  }

  // 5. LibreOffice for legacy Office (.doc, .wps, .pages, .ppt)
  if (["doc", "dot", "wps", "wpd", "sxw", "pages"].includes(ext)) {
    const lo = resolveTool(ctx, "libreoffice");
    if (lo) {
      const tmpDir = nodePath.join(tmpdir(), `fm-phonon-lo-${process.pid}-${randomBytes(4).toString("hex")}`);
      mkdirSync(tmpDir, { recursive: true });
      try {
        const res = Bun.spawnSync([lo, "--headless", "--norestore", "--nolockcheck", "--convert-to", "txt:Text (encoded):UTF8", "--outdir", tmpDir, filePath], {
          stdout: "pipe",
          stderr: "pipe",
          timeout: 90_000,
        });
        if (res.exitCode === 0) {
          const files = await fsp.readdir(tmpDir);
          const txtFile = files.find((f) => f.endsWith(".txt"));
          if (txtFile) {
            const out = (await fsp.readFile(nodePath.join(tmpDir, txtFile), "utf8")).trim();
            if (out) return { text: out, method: "LibreOffice", formatLabel: `Office Document (${ext.toUpperCase()})` };
          }
        }
      } finally {
        await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  return null;
}

/**
 * Extracts readable plain text from any supported file on disk, handling documents, PDFs, e-books, spreadsheets,
 * presentations, HTML, Markdown, subtitles, JSON/YAML/TOML/XML, and arbitrary character encodings.
 */
export async function extractPlainTextFromFile(
  ctx: FmContext,
  inputPath: unknown,
  cleanOpts: CleanTextOptions & { clean?: boolean; maxChars?: number } = {},
): Promise<ExtractedPlainText> {
  const filePath = absolutePath(ctx, inputPath);
  const st = await fsp.stat(filePath).catch(() => null);
  if (!st || st.isDirectory()) throw new FmError("NOT_A_FILE", "Choose a file (not a folder) to read or convert to plain text.");
  if (st.size === 0) throw new FmError("EMPTY_FILE", "This file is empty.");

  const name = nodePath.basename(filePath);
  const ext = extensionOf(name);
  const lastExt = ext.includes(".") ? ext.slice(ext.lastIndexOf(".") + 1) : ext;

  let rawText = "";
  let formatLabel = lastExt ? `${lastExt.toUpperCase()} File` : "Text File";
  let method = "Built-in Text Decoder";
  let title: string | undefined;

  // 1. Spreadsheets (.xlsx, .xlsm, .ods, .csv, .tsv) via full built-in reader
  if (["xlsx", "xlsm", "ods", "csv", "tsv"].includes(lastExt) && st.size <= 50 * 1024 * 1024) {
    try {
      const kind = lastExt === "ods" ? "ods" : lastExt === "csv" ? "csv" : lastExt === "tsv" ? "tsv" : "xlsx";
      if (kind === "xlsx" || kind === "ods") {
        const sheets = await readSpreadsheet(filePath);
        const lines: string[] = [];
        for (const sheet of sheets) {
          if (sheets.length > 1 && sheet.name) lines.push(`Sheet: ${sheet.name}.`);
          const headerRow = sheet.rows[0] ?? [];
          const dataRows = sheet.rows.length > 1 ? sheet.rows.slice(1) : sheet.rows;
          for (const row of dataRows) {
            const line = row
              .map((v, i) => {
                const s = v === null || v === undefined ? "" : String(v).trim();
                if (!s) return "";
                const col = sheet.rows.length > 1 && headerRow[i] !== null && headerRow[i] !== undefined ? String(headerRow[i]).trim() : "";
                return col ? `${col}: ${s}` : s;
              })
              .filter(Boolean)
              .join(", ");
            if (line) lines.push(line);
          }
        }
        rawText = lines.join("\n");
        formatLabel = kind === "ods" ? "OpenDocument Spreadsheet (ODS)" : "Excel Workbook (XLSX)";
        method = "Built-in Spreadsheet Reader";
      }
    } catch {
      // fall through to rich preview / plain text
    }
  }

  // 2. For PDFs or OCR images or legacy Office/E-Books, try external helper first if installed (gets all pages of huge PDFs)
  if (!rawText && ["pdf", "png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp", "gif", "mobi", "azw", "azw3", "doc", "pages"].includes(lastExt)) {
    const extRes = await runExternalTextExtractor(ctx, filePath, lastExt);
    if (extRes) {
      rawText = extRes.text;
      formatLabel = extRes.formatLabel;
      method = extRes.method;
    }
  }

  // 3. Built-in Universal Rich Preview Inspector (handles DOCX, ODT, RTF, EPUB, FB2, PPTX, ODP, PDF, IPYNB, SRT, VTT, LRC, ICS, VCF, JSON, YAML, TOML, XML, Plist, GZ, ZST)
  if (!rawText) {
    const handle = await fsp.open(filePath, "r");
    try {
      const headLen = Math.min(st.size, 256 * 1024);
      const headBuf = Buffer.alloc(headLen);
      const { bytesRead } = await handle.read(headBuf, 0, headLen, 0);
      const head = headBuf.subarray(0, bytesRead);
      const isBin = head.subarray(0, 8192).includes(0);
      const headText = !isBin ? decodeBytes(head, "auto", true).text : null;
      const rich = await inspectRichPreview(handle, filePath, st.size, head, headText, false).catch(() => null);
      if (rich) {
        const extracted = richPreviewToPlainText(rich);
        if (extracted && extracted.text.trim()) {
          rawText = extracted.text;
          formatLabel = extracted.formatLabel;
          method = `Built-in ${rich.kind.toUpperCase()} Extractor`;
          title = extracted.title;
        }
      }
    } finally {
      await handle.close();
    }
  }

  // 4. Try external Pandoc / LibreOffice / Calibre if built-in inspector didn't extract text
  if (!rawText) {
    const extRes = await runExternalTextExtractor(ctx, filePath, lastExt);
    if (extRes) {
      rawText = extRes.text;
      formatLabel = extRes.formatLabel;
      method = extRes.method;
    }
  }

  // 5. HTML / XHTML / SVG files or general plain text / source code files (supports multi-megabyte files)
  if (!rawText) {
    const maxReadBytes = 25 * 1024 * 1024; // Up to 25 MB of text
    const handle = await fsp.open(filePath, "r");
    try {
      const readLen = Math.min(st.size, maxReadBytes);
      const buf = Buffer.alloc(readLen);
      const { bytesRead } = await handle.read(buf, 0, readLen, 0);
      const slice = buf.subarray(0, bytesRead);
      // Reject true binary files (e.g. MP4, ZIP, EXE) that could not be extracted
      if (slice.subarray(0, 4096).includes(0)) {
        const sniffed = decodeBytes(slice, "auto", true);
        if (sniffed.encoding !== "utf-16le" && sniffed.encoding !== "utf-16be") {
          throw new FmError("BINARY_FILE", `"${name}" is a binary file (${formatLabel}) that doesn't contain readable text.`);
        }
      }
      const decoded = decodeBytes(slice, "auto", true);
      method = `Built-in Text Decoder (${decoded.encoding.toUpperCase()})`;
      if (["html", "htm", "xhtml", "svg"].includes(lastExt)) {
        formatLabel = "Web Page (HTML)";
        method = "Built-in HTML-to-Text Converter";
        try {
          rawText = htmlToText(decoded.text);
        } catch {
          rawText = decoded.text;
        }
      } else {
        if (["md", "markdown"].includes(lastExt)) formatLabel = "Markdown Document";
        else if (lastExt === "txt") formatLabel = "Plain Text";
        rawText = decoded.text;
      }
    } finally {
      await handle.close();
    }
  }

  const shouldClean = cleanOpts.clean ?? true;
  const text = shouldClean ? cleanTextForSpeech(rawText, cleanOpts) : rawText.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new FmError("EMPTY_TEXT", `No readable words were found in "${name}".`);

  const chunks = splitTextForPhonon(text, { maxChars: cleanOpts.maxChars ?? PHONON_DEFAULT_CHUNK_CHARS });
  const wordCount = chunks.reduce((acc, c) => acc + c.wordCount, 0);
  const estimatedSeconds = Math.max(1, Math.round((wordCount / 155) * 60));

  return {
    text,
    rawText,
    formatLabel,
    method,
    charCount: text.length,
    wordCount,
    chunkCount: chunks.length,
    estimatedSeconds,
    ...(title ? { title } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// WAV & AIFF PCM Audio Parsing and Disk-Backed Multi-Chunk Stitching
// ---------------------------------------------------------------------------------------------------------------

export interface ParsedWav {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  pcmData: Buffer;
}

/**
 * Extracts the PCM audio format and raw sample payload from a RIFF/WAVE buffer produced by `ollama run phonon`.
 */
export function parseWavPcm(wav: Buffer): ParsedWav {
  if (wav.length < 44 || wav.subarray(0, 4).toString("ascii") !== "RIFF" || wav.subarray(8, 12).toString("ascii") !== "WAVE") {
    throw new FmError("BAD_WAV", "Phonon did not return valid WAV audio data.");
  }
  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let offset = 12;

  while (offset + 8 <= wav.length) {
    const chunkId = wav.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = wav.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (chunkId === "fmt " && bodyStart + 16 <= wav.length) {
      numChannels = wav.readUInt16LE(bodyStart + 2) || 1;
      sampleRate = wav.readUInt32LE(bodyStart + 4) || 24000;
      bitsPerSample = wav.readUInt16LE(bodyStart + 14) || 16;
    } else if (chunkId === "data") {
      // Streaming WAV writers sometimes set chunkSize to 0xFFFFFFFF or larger than remaining buffer; clamp safely.
      const available = wav.length - bodyStart;
      const actualSize = chunkSize > 0 && chunkSize <= available ? chunkSize : available;
      const alignedSize = actualSize - (actualSize % 2);
      return {
        sampleRate,
        numChannels,
        bitsPerSample,
        pcmData: wav.subarray(bodyStart, bodyStart + alignedSize),
      };
    }
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  // Fallback if standard 44-byte header
  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    pcmData: wav.subarray(44),
  };
}

/**
 * Creates a standard 44-byte RIFF/WAVE header for 16-bit mono/stereo PCM audio.
 */
export function createWavHeader(pcmByteLength: number, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * numChannels * (bitsPerSample >> 3);
  const blockAlign = numChannels * (bitsPerSample >> 3);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(Math.min(0xffffffff, 36 + pcmByteLength), 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(Math.min(0xffffffff, pcmByteLength), 40);
  return header;
}

/**
 * Writes an uncompressed Apple AIFF file directly from 16-bit signed little-endian PCM samples (no ffmpeg needed).
 */
export async function convertWavFileToAiffNative(wavPath: string, aiffPath: string): Promise<void> {
  const wavBuf = await fsp.readFile(wavPath);
  const { sampleRate, numChannels, bitsPerSample, pcmData } = parseWavPcm(wavBuf);
  const bytesPerSample = bitsPerSample >> 3;
  const numSampleFrames = Math.floor(pcmData.length / (numChannels * bytesPerSample));

  // AIFF uses big-endian signed 16-bit samples
  const bePcm = Buffer.from(pcmData);
  if (bytesPerSample === 2) {
    bePcm.swap16();
  }

  // Encode sampleRate as 80-bit IEEE 754 extended precision float
  const srExtended = Buffer.alloc(10);
  let sr = sampleRate;
  let exp = 16383 + 31;
  while (sr < 0x80000000 && exp > 0) {
    sr *= 2;
    exp--;
  }
  srExtended.writeUInt16BE(exp, 0);
  srExtended.writeUInt32BE(Math.floor(sr) >>> 0, 2);
  srExtended.writeUInt32BE(0, 6);

  // COMM chunk (18 bytes body) + SSND chunk (8 + bePcm.length bytes body)
  const commSize = 18;
  const ssndSize = 8 + bePcm.length;
  const formSize = 4 + (8 + commSize) + (8 + ssndSize);
  const header = Buffer.alloc(12 + 8 + commSize + 8 + 8);
  let o = 0;
  header.write("FORM", o, "ascii"); o += 4;
  header.writeUInt32BE(formSize, o); o += 4;
  header.write("AIFF", o, "ascii"); o += 4;
  header.write("COMM", o, "ascii"); o += 4;
  header.writeUInt32BE(commSize, o); o += 4;
  header.writeUInt16BE(numChannels, o); o += 2;
  header.writeUInt32BE(numSampleFrames, o); o += 4;
  header.writeUInt16BE(bitsPerSample, o); o += 2;
  srExtended.copy(header, o); o += 10;
  header.write("SSND", o, "ascii"); o += 4;
  header.writeUInt32BE(ssndSize, o); o += 4;
  header.writeUInt32BE(0, o); o += 4; // offset
  header.writeUInt32BE(0, o); o += 4; // blockSize

  const outHandle = await fsp.open(aiffPath, "w");
  try {
    await outHandle.write(header, 0, header.length, 0);
    await outHandle.write(bePcm, 0, bePcm.length, header.length);
  } finally {
    await outHandle.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Ollama & Phonon Discovery, Voice Parsing, and Synthesis
// ---------------------------------------------------------------------------------------------------------------

export function parseVoicesFromModelfile(showOutput: string): string[] {
  const found = new Set<string>();
  const lines = showOutput.split(/\r?\n/);
  let inVoicesSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Voices\b/i.test(trimmed)) {
      inVoicesSection = true;
      continue;
    }
    if (inVoicesSection) {
      if (!trimmed) continue;
      if (/^[A-Z][a-z]+:$/.test(trimmed) || /^(Parameters|System|Template|License)\b/i.test(trimmed)) {
        inVoicesSection = false;
        continue;
      }
      // Match lines like "    Zoey                    4096 tokens"
      const m = /^\s{2,}([A-Za-z0-9][A-Za-z0-9 _-]*?)\s+\d+\s+tokens\s*$/i.exec(line);
      if (m?.[1]) {
        found.add(m[1].trim());
      }
    }
  }
  return [...found];
}

function buildExecEnv(ctx: FmContext): Record<string, string> {
  const dirs = searchDirs(ctx);
  const sep = ctx.platform === "win32" ? ";" : ":";
  return {
    ...process.env,
    PATH: [...dirs, process.env.PATH ?? ""].filter(Boolean).join(sep),
    NO_COLOR: "1",
    TERM: "dumb",
  } as Record<string, string>;
}

async function runOllamaCommand(
  ctx: FmContext,
  ollamaExe: string,
  args: string[],
  timeoutMs = 8000,
): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  const env = buildExecEnv(ctx);
  try {
    const proc = Bun.spawn([ollamaExe, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {}
    }, timeoutMs);
    const [outBuf, errBuf, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    return {
      code: timedOut ? null : code,
      stdout: Buffer.from(outBuf),
      stderr: errBuf,
    };
  } catch (err) {
    return { code: null, stdout: Buffer.alloc(0), stderr: (err as Error)?.message ?? String(err) };
  }
}

/**
 * Ensures the local Ollama background server is running before executing `pull` or `run`.
 */
export async function ensureOllamaDaemon(ctx: FmContext, ollamaExe: string): Promise<boolean> {
  const check = await runOllamaCommand(ctx, ollamaExe, ["list"], 3500);
  if (check.code === 0) return true;

  // Try starting `ollama serve` in the background
  try {
    const env = buildExecEnv(ctx);
    const proc = Bun.spawn([ollamaExe, "serve"], {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
      env,
    });
    proc.unref?.();
  } catch {
    return false;
  }

  for (let i = 0; i < 12; i++) {
    await Bun.sleep(350);
    const retry = await runOllamaCommand(ctx, ollamaExe, ["list"], 2500);
    if (retry.code === 0) return true;
  }
  return false;
}

export interface PhononStatusReport {
  supported: boolean;
  ollamaInstalled: boolean;
  ollamaPath: string | null;
  ollamaVersion: string | null;
  daemonRunning: boolean;
  modelInstalled: boolean;
  ffmpegInstalled: boolean;
  ready: boolean;
  voices: PhononVoiceInfo[];
  audioFormats: typeof AUDIO_FORMAT_INFO;
  videoFormats: typeof VIDEO_FORMAT_INFO;
  videoAspects: PhononVideoAspectInfo[];
  videoThemes: PhononVideoThemeInfo[];
  settings: {
    voice: string;
    format: PhononAudioFormat;
    speed: number;
    pitch: number;
    syncOffsetMs: number;
    cleanText: boolean;
    pauseMs: number;
  };
  install: {
    canAutoInstallOllama: boolean;
    method: string | null;
    displayCommand: string;
    note: string;
    website: string;
  };
}

/**
 * Ollama's `phonon` (`gradium_phonon_tts`) model requires Apple's MLX framework and is only supported on
 * Apple Silicon Macs (`darwin` + `arm64`). Windows, Linux, and Intel macOS builds hide the feature to avoid confusion.
 */
export function isPhononSupportedPlatform(platform: string = process.platform, arch: string = process.arch): boolean {
  return platform === "darwin" && arch === "arm64";
}

export async function getPhononStatus(ctx: FmContext): Promise<PhononStatusReport> {
  const effectiveArch = ctx.platform === "darwin" && process.platform !== "darwin" ? "arm64" : process.arch;
  const supported = isPhononSupportedPlatform(ctx.platform, effectiveArch);
  const settings = await loadSettings(ctx);
  const managers = detectManagers(ctx);
  const plan = installPlan(ctx.platform, "ollama", managers);
  const ollamaExe = resolveTool(ctx, "ollama");
  const ffmpegExe = resolveTool(ctx, "ffmpeg");

  let ollamaVersion: string | null = null;
  let daemonRunning = false;
  let modelInstalled = false;
  const voiceMap = new Map<string, PhononVoiceInfo>(DEFAULT_PHONON_VOICES.map((v) => [v.id, v]));

  if (ollamaExe) {
    const [verRes, showRes] = await Promise.all([
      runOllamaCommand(ctx, ollamaExe, ["--version"], 3500),
      runOllamaCommand(ctx, ollamaExe, ["show", "phonon"], 4500),
    ]);
    const verText = `${verRes.stdout.toString("utf8")}\n${verRes.stderr}`.trim();
    const verMatch = /ollama version is ([0-9A-Za-z._-]+)/i.exec(verText) ?? /([0-9]+\.[0-9]+\.[0-9]+)/.exec(verText);
    ollamaVersion = verMatch?.[1] ?? (verText.split(/\r?\n/)[0]?.slice(0, 60) || "installed");

    if (showRes.code === 0) {
      daemonRunning = true;
      modelInstalled = true;
      const discovered = parseVoicesFromModelfile(showRes.stdout.toString("utf8"));
      for (const v of discovered) {
        if (!voiceMap.has(v)) {
          voiceMap.set(v, { id: v, label: v, category: "Conversational", desc: "Phonon neural voice" });
        }
      }
    } else {
      const listRes = await runOllamaCommand(ctx, ollamaExe, ["list"], 3500);
      if (listRes.code === 0) {
        daemonRunning = true;
        modelInstalled = /\bphonon\b/i.test(listRes.stdout.toString("utf8"));
      }
    }
  }

  return {
    supported,
    ollamaInstalled: !!ollamaExe,
    ollamaPath: ollamaExe,
    ollamaVersion,
    daemonRunning,
    modelInstalled,
    ffmpegInstalled: !!ffmpegExe,
    ready: supported && !!ollamaExe && modelInstalled,
    voices: [...voiceMap.values()],
    audioFormats: AUDIO_FORMAT_INFO,
    videoFormats: VIDEO_FORMAT_INFO,
    videoAspects: Object.values(VIDEO_ASPECT_INFO),
    videoThemes: Object.values(VIDEO_THEME_INFO),
    settings: {
      voice: settings.phononVoice || "Zoey",
      format: settings.phononFormat || "wav",
      speed: settings.phononSpeed || 1,
      pitch: settings.phononPitch ?? 0,
      syncOffsetMs: settings.phononSyncOffsetMs ?? 0,
      cleanText: settings.phononCleanText ?? true,
      pauseMs: settings.phononPauseMs ?? 200,
    },
    install: {
      canAutoInstallOllama: supported,
      method: plan.method ?? "official-installer",
      displayCommand: !ollamaExe
        ? plan.display || "brew install ollama && ollama pull phonon"
        : "ollama pull phonon",
      note: !supported
        ? "Ollama Phonon text-to-speech requires Apple's MLX framework and is only supported on Apple Silicon Macs (macOS ARM64)."
        : !ollamaExe
          ? plan.auto
            ? `${plan.note} Then automatically downloads the Phonon voice model (112 MB).`
            : "Installs Ollama into your user profile (no administrator password required) and downloads the Phonon voice model (112 MB)."
          : modelInstalled
            ? "Ollama and the Phonon voice model are installed and ready (Apple Silicon Mac · MLX Framework)."
            : "Ollama is installed. Click once to download the Phonon voice model (112 MB, Apple Silicon MLX).",
      website: TOOLS.ollama.website,
    },
  };
}

/**
 * Synthesizes a single text chunk to a 24 kHz 16-bit mono WAV buffer using `ollama run phonon --voice <voice>`.
 * Passes text via `stdin` (never CLI args) so arbitrary characters, quotes, and large chunks are 100% safe.
 */
export async function synthesizePhononChunkWav(
  ctx: FmContext,
  ollamaExe: string,
  text: string,
  voice: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const cleanVoice = /^[A-Za-z0-9 _-]{1,48}$/.test(voice.trim()) ? voice.trim() : "Zoey";
  const payload = text.trim();
  if (!payload) throw new FmError("EMPTY_TEXT", "There is no text in this chunk to read.");

  const env = buildExecEnv(ctx);
  const args = ["run", "phonon"];
  if (cleanVoice && cleanVoice !== "default") {
    args.push("--voice", cleanVoice);
  }

  const proc = Bun.spawn([ollamaExe, ...args], {
    stdin: new TextEncoder().encode(payload),
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    try {
      proc.kill();
    } catch {}
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {}
  }, 180_000);

  try {
    const [outBuf, errText, exitCode] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (aborted) throw new FmError("CANCELLED", "Speech synthesis was cancelled.");
    if (timedOut) throw new FmError("TIMEOUT", "Phonon took too long to synthesize this text chunk.");

    const wav = Buffer.from(outBuf);
    // Find RIFF header in stdout (in case Ollama emitted any spinner text before the RIFF header)
    const riffIdx = wav.indexOf("RIFF");
    if (riffIdx >= 0 && wav.length - riffIdx >= 44) {
      const sliced = riffIdx === 0 ? wav : wav.subarray(riffIdx);
      if (sliced.subarray(8, 12).toString("ascii") === "WAVE") {
        return sliced;
      }
    }

    const reason = explainFailure("ollama", errText || wav.toString("utf8"), exitCode);
    throw new FmError("SYNTHESIS_FAILED", reason);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Live Audio Chunk Cache for Read-Out-Loud Streaming
// ---------------------------------------------------------------------------------------------------------------

interface CachedAudioItem {
  id: string;
  filePath: string;
  createdAt: number;
  durationSec: number;
  durationMs: number;
  sampleRate: number;
  byteLength: number;
  words: PhononWordTiming[];
  cues: PhononReadAlongCue[];
}

const MAX_CACHED_CHUNKS = 60;
const audioCaches = new WeakMap<FmContext, { dir: string; items: Map<string, CachedAudioItem> }>();

function getAudioCache(ctx: FmContext) {
  let cache = audioCaches.get(ctx);
  if (!cache) {
    const dir = nodePath.join(tmpdir(), `fm-phonon-cache-${process.pid}-${randomBytes(4).toString("hex")}`);
    mkdirSync(dir, { recursive: true });
    const items = new Map<string, CachedAudioItem>();
    cache = { dir, items };
    audioCaches.set(ctx, cache);
    ctx.disposers.push(() => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    });
  }
  return cache;
}

/**
 * Synthesizes a chunk for live "Read Out Loud" playback (or returns it immediately from cache if already prefetched),
 * along with waveform-synchronized word-level (`words`) and phrase-level (`cues`) timings for the Live Follow-Along Teleprompter.
 */
export async function speakChunk(
  ctx: FmContext,
  input: { text?: unknown; voice?: unknown; pitch?: unknown },
): Promise<{
  audioId: string;
  url: string;
  durationSec: number;
  durationMs: number;
  sampleRate: number;
  byteLength: number;
  voice: string;
  pitch: number;
  pcmAligned: boolean;
  words: PhononWordTiming[];
  cues: PhononReadAlongCue[];
}> {
  const rawText = typeof input.text === "string" ? input.text.trim() : "";
  if (!rawText) throw new FmError("BAD_REQUEST", "Provide text to read out loud.");

  const settings = await loadSettings(ctx);
  const voice = typeof input.voice === "string" && /^[A-Za-z0-9 _-]{1,48}$/.test(input.voice.trim()) ? input.voice.trim() : settings.phononVoice || "Zoey";
  const pitch = typeof input.pitch === "number" && isFinite(input.pitch)
    ? Math.round(Math.min(6, Math.max(-6, input.pitch)) * 2) / 2
    : (settings.phononPitch ?? 0);

  // Ensure the chunk is within Phonon's context window even if the caller passed a longer string
  const safeChunks = splitTextForPhonon(rawText, { maxChars: PHONON_HARD_MAX_CHUNK_CHARS });
  const chunkText = safeChunks[0]?.text ?? rawText.slice(0, PHONON_HARD_MAX_CHUNK_CHARS);

  const cache = getAudioCache(ctx);
  const key = createHash("sha256").update(`${voice}\0${pitch}\0${chunkText}`).digest("hex").slice(0, 24);
  const existing = cache.items.get(key);
  if (existing && existsSync(existing.filePath)) {
    return {
      audioId: existing.id,
      url: `/api/phonon/audio?id=${encodeURIComponent(existing.id)}`,
      durationSec: existing.durationSec,
      durationMs: existing.durationMs,
      sampleRate: existing.sampleRate,
      byteLength: existing.byteLength,
      voice,
      pitch,
      pcmAligned: true,
      words: existing.words,
      cues: existing.cues,
    };
  }

  const ollamaExe = resolveTool(ctx, "ollama");
  if (!ollamaExe) {
    throw new FmError("MISSING_TOOL", "Ollama isn't installed yet. Click the Install Ollama & Phonon button to add it in one click.");
  }
  await ensureOllamaDaemon(ctx, ollamaExe);

  const wavBuf = await synthesizePhononChunkWav(ctx, ollamaExe, chunkText, voice);
  let parsed = parseWavPcm(wavBuf);
  let cleanWav = Buffer.concat([createWavHeader(parsed.pcmData.length, parsed.sampleRate, parsed.numChannels, parsed.bitsPerSample), parsed.pcmData]);

  // If pitch shift is requested and ffmpeg is installed, apply time-locked pitch shift (`asetrate` + `aresample` + `atempo`)
  // so the pitch-shifted WAV keeps the exact speaking duration and we align word timings against the pitch-shifted PCM waveform.
  const ffmpegExe = resolveTool(ctx, "ffmpeg");
  if (Math.abs(pitch) >= 0.25 && ffmpegExe) {
    const rawTmp = nodePath.join(cache.dir, `${key}-raw.wav`);
    const pitchedTmp = nodePath.join(cache.dir, `${key}-pitched.wav`);
    try {
      await fsp.writeFile(rawTmp, cleanWav);
      const env = buildExecEnv(ctx);
      const filterArgs = buildAtempoFilter(1.0, pitch, parsed.sampleRate);
      const proc = Bun.spawn(
        [ffmpegExe, "-hide_banner", "-nostdin", "-y", "-i", rawTmp, ...filterArgs, "-c:a", "pcm_s16le", pitchedTmp],
        { stdout: "ignore", stderr: "ignore", stdin: "ignore", env },
      );
      const exitCode = await proc.exited;
      if (exitCode === 0 && existsSync(pitchedTmp)) {
        const pitchedBuf = await fsp.readFile(pitchedTmp);
        if (pitchedBuf.length > 44 && pitchedBuf.subarray(0, 4).toString("ascii") === "RIFF") {
          parsed = parseWavPcm(pitchedBuf);
          cleanWav = Buffer.concat([
            createWavHeader(parsed.pcmData.length, parsed.sampleRate, parsed.numChannels, parsed.bitsPerSample),
            parsed.pcmData,
          ]);
        }
      }
    } catch {
      // Keep original WAV if ffmpeg pitch filter is unavailable
    } finally {
      await fsp.rm(rawTmp, { force: true }).catch(() => {});
      await fsp.rm(pitchedTmp, { force: true }).catch(() => {});
    }
  }

  const bytesPerSec = Math.max(1, parsed.sampleRate * parsed.numChannels * (parsed.bitsPerSample >> 3));
  const durationMs = Math.max(50, Math.round((parsed.pcmData.length / bytesPerSec) * 1000));
  const durationSec = Math.round((durationMs / 1000) * 1000) / 1000;

  // Evict oldest if cache is full
  if (cache.items.size >= MAX_CACHED_CHUNKS) {
    const oldestKey = cache.items.keys().next().value;
    if (oldestKey) {
      const old = cache.items.get(oldestKey);
      cache.items.delete(oldestKey);
      if (old) await fsp.rm(old.filePath, { force: true }).catch(() => {});
    }
  }

  const tl = computeReadAlongTimeline([
    {
      index: 0,
      paragraphIndex: 0,
      text: chunkText,
      startMs: 0,
      endMs: durationMs,
      durationMs,
      pcmData: parsed.pcmData,
      sampleRate: parsed.sampleRate,
      speed: 1,
    },
  ]);

  const filePath = nodePath.join(cache.dir, `${key}.wav`);
  await fsp.writeFile(filePath, cleanWav);
  const item: CachedAudioItem = {
    id: key,
    filePath,
    createdAt: Date.now(),
    durationSec,
    durationMs,
    sampleRate: parsed.sampleRate,
    byteLength: cleanWav.length,
    words: tl.words,
    cues: tl.cues,
  };
  cache.items.set(key, item);

  return {
    audioId: key,
    url: `/api/phonon/audio?id=${encodeURIComponent(key)}`,
    durationSec,
    durationMs,
    sampleRate: parsed.sampleRate,
    byteLength: cleanWav.length,
    voice,
    pitch,
    pcmAligned: true,
    words: tl.words,
    cues: tl.cues,
  };
}

export function getCachedAudioFile(ctx: FmContext, id: string): string | null {
  if (!/^[a-f0-9]{16,40}$/.test(id)) return null;
  const cache = audioCaches.get(ctx);
  const item = cache?.items.get(id);
  if (!item || !existsSync(item.filePath)) return null;
  return item.filePath;
}

// ---------------------------------------------------------------------------------------------------------------
// One-Click Auto-Install for Ollama + Phonon Voice Model (Linux x64/ARM64, Windows x64/ARM64, macOS ARM64/x64)
// ---------------------------------------------------------------------------------------------------------------

async function runSpawnLogged(
  argv: string[],
  env: Record<string, string>,
  signal: AbortSignal,
  log: (text: string) => void,
): Promise<{ code: number | null; out: string; err: string }> {
  try {
    const proc = Bun.spawn(argv, {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      env,
      windowsHide: true,
    });
    const onAbort = () => {
      try {
        proc.kill();
      } catch {}
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (out) log(out);
      if (err) log(err);
      return { code, out, err };
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    log(`${msg}\n`);
    return { code: null, out: "", err: msg };
  }
}

async function downloadFileToPath(
  ctx: FmContext,
  url: string,
  destPath: string,
  env: Record<string, string>,
  signal: AbortSignal,
  log: (text: string) => void,
): Promise<void> {
  if (signal.aborted) throw new Error("Cancelled");
  const curlExe = findExecutable(
    ctx.platform,
    ["curl"],
    searchDirs(ctx),
  );
  if (curlExe) {
    log(`Downloading ${url}…\n`);
    const res = await runSpawnLogged(
      [curlExe, "--fail", "--location", "--silent", "--show-error", "-o", destPath, url],
      env,
      signal,
      log,
    );
    if (signal.aborted) throw new Error("Cancelled");
    if (res.code === 0 && existsSync(destPath)) {
      const st = await fsp.stat(destPath).catch(() => null);
      if (st && st.size > 1024) return;
    }
  }

  // Fallback to Bun's native streaming fetch
  log(`Downloading ${url} via HTTP stream…\n`);
  const res = await fetch(url, { redirect: "follow", signal });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status} ${res.statusText}) from ${url}`);
  }
  const fh = await fsp.open(destPath, "w");
  try {
    let offset = 0;
    const reader = res.body.getReader();
    while (true) {
      if (signal.aborted) throw new Error("Cancelled");
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        await fh.write(value, 0, value.byteLength, offset);
        offset += value.byteLength;
      }
    }
  } finally {
    await fh.close();
  }
}

function detectCpuArch(): "arm64" | "amd64" {
  const arch = (process.arch || "").toLowerCase();
  const winArch = `${process.env.PROCESSOR_ARCHITECTURE || ""} ${process.env.PROCESSOR_ARCHITEW6432 || ""}`.toLowerCase();
  if (arch === "arm64" || arch === "aarch64" || winArch.includes("arm64")) {
    return "arm64";
  }
  return "amd64";
}

/**
 * Installs Ollama across Linux (x64 & ARM64 Parallels), Windows (x64 & ARM64 Parallels), and macOS without requiring
 * an interactive root/sudo password prompt or pre-installed zstd.
 */
export async function installOllamaBinaryCrossPlatform(
  ctx: FmContext,
  signal: AbortSignal,
  log: (text: string) => void,
): Promise<string> {
  const existing = resolveTool(ctx, "ollama");
  if (existing) return existing;

  const managers = detectManagers(ctx);
  const plan = installPlan(ctx.platform, "ollama", managers);
  const env = buildExecEnv(ctx);
  const arch = detectCpuArch();

  // 1. Try package manager first when available and non-interactive (brew on macOS / x64 Linux, winget/scoop on Windows)
  if (plan.argv && plan.auto && !(ctx.platform === "linux" && arch === "arm64" && plan.method === "brew")) {
    log(`Running ${plan.display}…\n`);
    await runSpawnLogged(plan.argv, env, signal, log);
    if (signal.aborted) throw new Error("Cancelled");
    const resolvedAfterPlan = resolveTool(ctx, "ollama");
    if (resolvedAfterPlan) return resolvedAfterPlan;
  }

  // 2. Platform-specific zero-password user-space installation fallback
  if (ctx.platform === "linux") {
    const installRoot = nodePath.join(ctx.home, ".local");
    const binDir = nodePath.join(installRoot, "bin");
    const libDir = nodePath.join(installRoot, "lib", "ollama");
    const stageDir = nodePath.join(installRoot, "share", `ollama-install-${process.pid}-${randomBytes(4).toString("hex")}`);
    await fsp.mkdir(binDir, { recursive: true });
    await fsp.mkdir(libDir, { recursive: true });
    await fsp.mkdir(stageDir, { recursive: true });

    try {
      const url = `https://ollama.com/download/ollama-linux-${arch}.tar.zst`;
      const archiveZst = nodePath.join(stageDir, `ollama-linux-${arch}.tar.zst`);
      log(`Installing Ollama for Linux (${arch}) into ${installRoot} (no root password needed)…\n`);
      await downloadFileToPath(ctx, url, archiveZst, env, signal, log);
      if (signal.aborted) throw new Error("Cancelled");

      const search = searchDirs(ctx);
      const zstdExe = findExecutable("linux", ["zstd", "unzstd"], search);
      const bsdtarExe = findExecutable("linux", ["bsdtar"], search);
      const tarExe = findExecutable("linux", ["tar"], [...search, "/usr/bin", "/bin"]) ?? "/bin/tar";
      const shExe = findExecutable("linux", ["bash", "sh"], ["/bin", "/usr/bin"]) ?? "/bin/sh";

      let extracted = false;
      if (zstdExe) {
        log("Extracting archive with zstd + tar…\n");
        const cmd = `"$1" -dc "$2" | "$3" -xf - -C "$4"`;
        const r = await runSpawnLogged([shExe, "-c", cmd, "--", zstdExe, archiveZst, tarExe, installRoot], env, signal, log);
        extracted = r.code === 0;
      }
      if (!extracted && bsdtarExe) {
        log("Extracting archive with bsdtar…\n");
        const r = await runSpawnLogged([bsdtarExe, "-xf", archiveZst, "-C", installRoot], env, signal, log);
        extracted = r.code === 0;
      }
      if (!extracted) {
        log("Decompressing .tar.zst with built-in Zstandard decoder…\n");
        const zstBytes = await fsp.readFile(archiveZst);
        await fsp.rm(archiveZst, { force: true }).catch(() => {});
        const tarBytes = Bun.zstdDecompressSync(zstBytes);
        const archiveTar = nodePath.join(stageDir, `ollama-linux-${arch}.tar`);
        await fsp.writeFile(archiveTar, tarBytes);
        const r = await runSpawnLogged([tarExe, "-xf", archiveTar, "-C", installRoot], env, signal, log);
        await fsp.rm(archiveTar, { force: true }).catch(() => {});
        extracted = r.code === 0;
      }

      const binOllama = nodePath.join(binDir, "ollama");
      const rootOllama = nodePath.join(installRoot, "ollama");
      if (!existsSync(binOllama) && existsSync(rootOllama)) {
        await fsp.rename(rootOllama, binOllama).catch(() => {});
      }
      if (existsSync(binOllama)) {
        await fsp.chmod(binOllama, 0o755).catch(() => {});
      }
    } finally {
      await fsp.rm(stageDir, { recursive: true, force: true }).catch(() => {});
    }
  } else if (ctx.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || nodePath.win32.join(ctx.home, "AppData", "Local");
    const installDir = nodePath.win32.join(localAppData, "Programs", "Ollama");
    const stageDir = nodePath.win32.join(localAppData, "Temp", `ollama-install-${process.pid}-${randomBytes(4).toString("hex")}`);
    await fsp.mkdir(installDir, { recursive: true });
    await fsp.mkdir(stageDir, { recursive: true });

    try {
      const zipUrl = `https://ollama.com/download/ollama-windows-${arch}.zip`;
      const zipPath = nodePath.win32.join(stageDir, `ollama-windows-${arch}.zip`);
      log(`Downloading Ollama for Windows (${arch}) into ${installDir}…\n`);
      await downloadFileToPath(ctx, zipUrl, zipPath, env, signal, log);
      if (signal.aborted) throw new Error("Cancelled");

      const sys32 = "C:\\Windows\\System32";
      const tarExe = findExecutable("win32", ["tar"], [sys32, ...searchDirs(ctx)]);
      let extracted = false;
      if (tarExe) {
        log("Extracting Ollama archive with Windows tar…\n");
        const r = await runSpawnLogged([tarExe, "-xf", zipPath, "-C", installDir], env, signal, log);
        extracted = r.code === 0;
      }
      if (!extracted) {
        const psExe = findExecutable("win32", ["powershell", "pwsh"], [
          `${sys32}\\WindowsPowerShell\\v1.0`,
          ...searchDirs(ctx),
        ]) ?? "powershell.exe";
        log("Extracting Ollama archive with PowerShell Expand-Archive…\n");
        const r = await runSpawnLogged(
          [psExe, "-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${installDir.replace(/'/g, "''")}' -Force`],
          env,
          signal,
          log,
        );
        extracted = r.code === 0;
      }

      if (!resolveTool(ctx, "ollama")) {
        // Fallback to silent Inno Setup installer
        const setupExe = nodePath.win32.join(stageDir, "OllamaSetup.exe");
        await downloadFileToPath(ctx, "https://ollama.com/download/OllamaSetup.exe", setupExe, env, signal, log);
        log("Running OllamaSetup.exe silently…\n");
        await runSpawnLogged([setupExe, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"], env, signal, log);
      }
    } finally {
      await fsp.rm(stageDir, { recursive: true, force: true }).catch(() => {});
    }
  } else if (ctx.platform === "darwin") {
    const stageDir = nodePath.join(tmpdir(), `ollama-mac-install-${process.pid}-${randomBytes(4).toString("hex")}`);
    await fsp.mkdir(stageDir, { recursive: true });
    try {
      const zipPath = nodePath.join(stageDir, "Ollama-darwin.zip");
      log("Downloading Ollama for macOS…\n");
      await downloadFileToPath(ctx, "https://ollama.com/download/Ollama-darwin.zip", zipPath, env, signal, log);
      if (signal.aborted) throw new Error("Cancelled");
      const unzipExe = findExecutable("darwin", ["unzip"], ["/usr/bin", "/bin", ...searchDirs(ctx)]) ?? "/usr/bin/unzip";
      await runSpawnLogged([unzipExe, "-q", zipPath, "-d", stageDir], env, signal, log);
      const extractedApp = nodePath.join(stageDir, "Ollama.app");
      if (existsSync(extractedApp)) {
        const userApps = nodePath.join(ctx.home, "Applications");
        await fsp.mkdir(userApps, { recursive: true });
        const targetSystem = "/Applications/Ollama.app";
        const targetUser = nodePath.join(userApps, "Ollama.app");
        let moved = false;
        try {
          if (existsSync(targetSystem)) await fsp.rm(targetSystem, { recursive: true, force: true });
          await fsp.rename(extractedApp, targetSystem);
          moved = true;
        } catch {
          try {
            if (existsSync(targetUser)) await fsp.rm(targetUser, { recursive: true, force: true });
            await fsp.rename(extractedApp, targetUser);
            moved = true;
          } catch {}
        }
        if (!moved) {
          await runSpawnLogged(["/bin/cp", "-R", extractedApp, targetUser], env, signal, log);
        }
      }
    } finally {
      await fsp.rm(stageDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const found = resolveTool(ctx, "ollama");
  if (!found) {
    throw new Error(`Ollama could not be installed automatically. Download it from ${TOOLS.ollama.website} and try again.`);
  }
  return found;
}

export function createOllamaInstallStep(ctx: FmContext) {
  return {
    label: "Install Ollama",
    timeoutMs: 30 * 60 * 1000,
    prepare: async () => ({
      work: async (signal: AbortSignal, log: (text: string) => void) => {
        const exe = await installOllamaBinaryCrossPlatform(ctx, signal, log);
        log(`Ollama installed at ${exe}\n`);
      },
    }),
  };
}

export function createPhononPullStep(ctx: FmContext) {
  const env = buildExecEnv(ctx);
  return {
    label: "Download Phonon Voice Model (ollama pull phonon)",
    timeoutMs: 25 * 60 * 1000,
    prepare: async () => ({
      work: async (signal: AbortSignal, log: (text: string) => void) => {
        const ollamaExe = resolveTool(ctx, "ollama");
        if (!ollamaExe) {
          throw new Error("Ollama could not be found after installation. Check that Ollama is installed and try again.");
        }
        log("Starting Ollama service & pulling Phonon voice model…\n");
        await ensureOllamaDaemon(ctx, ollamaExe);
        const res = await runSpawnLogged([ollamaExe, "pull", "phonon"], env, signal, log);
        if (signal.aborted) throw new Error("Cancelled");
        if (res.code !== 0) {
          throw new Error(explainFailure("ollama", `${res.out}\n${res.err}`, res.code));
        }
      },
    }),
  };
}

export function startPhononInstall(ctx: FmContext, body: { confirm?: unknown }): ReturnType<FmContext["jobs"]["start"]> {
  if (body.confirm !== true) {
    throw new FmError("NEEDS_CONFIRM", "Confirm to install Ollama and download the Phonon voice model.");
  }

  const existingOllama = resolveTool(ctx, "ollama");
  const steps = [
    ...(!existingOllama ? [createOllamaInstallStep(ctx)] : []),
    createPhononPullStep(ctx),
  ];

  return ctx.jobs.start({
    kind: "install",
    title: existingOllama ? "Download Phonon Voice Model" : "Install Ollama & Phonon Voice Model",
    steps,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Multi-Chunk Synthesis + Any-Audio-Format Export Job (`phonon/save`)
// ---------------------------------------------------------------------------------------------------------------

export function buildAtempoFilter(speed: number, pitchSemitones = 0, sampleRate = 24000): string[] {
  const s = Math.min(2.5, Math.max(0.5, speed || 1));
  const p = Math.min(6, Math.max(-6, pitchSemitones || 0));
  const hasSpeed = Math.abs(s - 1) >= 0.01;
  const hasPitch = Math.abs(p) >= 0.25;
  if (!hasSpeed && !hasPitch) return [];

  const parts: string[] = [];
  let targetTempo = s;

  if (hasPitch) {
    const pitchFactor = Math.pow(2, p / 12);
    const shiftedRate = Math.max(4000, Math.round(sampleRate * pitchFactor));
    parts.push(`asetrate=${shiftedRate}`, `aresample=${sampleRate}`);
    // Compensate tempo by 1 / pitchFactor so changing voice pitch NEVER slows down or speeds up the audio relative to the text!
    targetTempo = s / pitchFactor;
  }

  if (Math.abs(targetTempo - 1) >= 0.008) {
    let rem = targetTempo;
    while (rem > 2.0) {
      parts.push("atempo=2.0");
      rem /= 2.0;
    }
    while (rem < 0.5) {
      parts.push("atempo=0.5");
      rem /= 0.5;
    }
    parts.push(`atempo=${Math.round(rem * 1000) / 1000}`);
  }

  return parts.length ? ["-af", parts.join(",")] : [];
}

function ffmpegEncoderArgsForFormat(format: PhononAudioFormat, speed: number, pitchSemitones = 0, sampleRate = 24000): string[] {
  const filter = buildAtempoFilter(speed, pitchSemitones, sampleRate);
  switch (format) {
    case "wav":
      return [...filter, "-c:a", "pcm_s16le"];
    case "mp3":
      return [...filter, "-vn", "-c:a", "libmp3lame", "-q:a", "2"];
    case "m4a":
      return [...filter, "-vn", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"];
    case "aac":
      return [...filter, "-vn", "-c:a", "aac", "-b:a", "192k", "-f", "adts"];
    case "flac":
      return [...filter, "-vn", "-c:a", "flac"];
    case "ogg":
      return [...filter, "-vn", "-c:a", "libvorbis", "-q:a", "5"];
    case "opus":
      return [...filter, "-vn", "-c:a", "libopus", "-b:a", "96k"];
    case "aiff":
      return [...filter, "-vn", "-c:a", "pcm_s16be"];
    case "wma":
      return [...filter, "-vn", "-c:a", "wmav2", "-b:a", "160k"];
    case "mp4":
    case "mov":
      return [
        ...filter,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "21",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
      ];
    case "webm":
      return [
        ...filter,
        "-c:v", "libvpx-vp9",
        "-b:v", "1200k",
        "-deadline", "realtime",
        "-cpu-used", "4",
        "-pix_fmt", "yuv420p",
        "-c:a", "libopus",
        "-b:a", "128k",
      ];
    case "mkv":
      return [
        ...filter,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "21",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
      ];
  }
}

/**
 * Synthesizes an arbitrarily long list of text chunks using `ollama run phonon`, stitches their 24 kHz 16-bit mono
 * PCM samples directly on disk (inserting `pauseMs` of silence between paragraphs), and converts to the requested
 * target audio format (`wav`, `mp3`, `m4a`, `aac`, `flac`, `ogg`, `opus`, `aiff`, `wma`) or Read-Along Video format
 * (`mp4`, `webm`, `mov`, `mkv`) with synchronized word-by-word karaoke text highlighting and companion `.srt`/`.vtt` subtitles.
 */
export async function synthesizeAndExportAudioFile(
  ctx: FmContext,
  params: {
    ollamaExe: string;
    ffmpegExe: string | null;
    chunks: PhononTextChunk[];
    voice: string;
    format: PhononAudioFormat;
    speed: number;
    pitch?: number;
    pauseMs: number;
    outputPath: string;
    aspectRatio?: PhononVideoAspect;
    videoTheme?: PhononVideoTheme;
    saveSubtitles?: boolean;
    title?: string;
    signal?: AbortSignal;
    onChunkProgress?: (doneChunks: number, totalChunks: number) => void;
  },
): Promise<{
  outputPath: string;
  srtPath?: string;
  vttPath?: string;
  chunkCount: number;
  durationSec: number;
  sizeBytes: number;
  timeline?: PhononReadAlongTimeline;
}> {
  const {
    ollamaExe,
    ffmpegExe,
    chunks,
    voice,
    format,
    speed,
    pitch = 0,
    pauseMs,
    outputPath,
    aspectRatio = "16:9",
    videoTheme = "midnight",
    saveSubtitles = true,
    title,
    signal,
    onChunkProgress,
  } = params;
  if (!chunks.length) throw new FmError("EMPTY_TEXT", "There is no text to synthesize.");

  const tmpDir = nodePath.join(tmpdir(), `fm-phonon-export-${process.pid}-${randomBytes(6).toString("hex")}`);
  await fsp.mkdir(tmpDir, { recursive: true });
  const stitchedWavPath = nodePath.join(tmpDir, "stitched.wav");
  const stagedOutPath = nodePath.join(tmpDir, `out.${format}`);

  try {
    const wavHandle = await fsp.open(stitchedWavPath, "w");
    let totalPcmBytes = 0;
    let sampleRate = 24000;
    let numChannels = 1;
    let bitsPerSample = 16;
    const timedChunks: PhononTimedChunk[] = [];
    const safeSpeed = Math.max(0.5, Math.min(2.5, speed || 1));

    try {
      // Reserve 44 bytes at the start of stitched.wav for the final RIFF/WAVE header
      await wavHandle.write(Buffer.alloc(44), 0, 44, 0);

      for (let i = 0; i < chunks.length; i++) {
        if (signal?.aborted) throw new Error("Cancelled");
        const chunk = chunks[i]!;
        const wavBuf = await synthesizePhononChunkWav(ctx, ollamaExe, chunk.text, voice, signal);
        const parsed = parseWavPcm(wavBuf);
        if (i === 0) {
          sampleRate = parsed.sampleRate;
          numChannels = parsed.numChannels;
          bitsPerSample = parsed.bitsPerSample;
        }

        const bytesPerSec = Math.max(1, sampleRate * numChannels * (bitsPerSample >> 3));
        const chunkStartMs = Math.round(((totalPcmBytes / bytesPerSec) * 1000) / safeSpeed);

        if (parsed.pcmData.length > 0) {
          await wavHandle.write(parsed.pcmData, 0, parsed.pcmData.length, 44 + totalPcmBytes);
          totalPcmBytes += parsed.pcmData.length;
        }

        const chunkEndMs = Math.max(
          chunkStartMs + 20,
          Math.round(((totalPcmBytes / bytesPerSec) * 1000) / safeSpeed),
        );
        timedChunks.push({
          index: chunk.index,
          paragraphIndex: chunk.paragraphIndex,
          text: chunk.text,
          startMs: chunkStartMs,
          endMs: chunkEndMs,
          durationMs: chunkEndMs - chunkStartMs,
          pcmData: parsed.pcmData,
          sampleRate: parsed.sampleRate,
          speed: safeSpeed,
        });

        // Insert natural silence gap between chunks (longer pause between different paragraphs, short pause within a paragraph)
        if (i + 1 < chunks.length && pauseMs > 0) {
          const nextChunk = chunks[i + 1]!;
          const gapMs = nextChunk.paragraphIndex !== chunk.paragraphIndex ? pauseMs : Math.min(120, Math.round(pauseMs * 0.5));
          const bytesPerSample = numChannels * (bitsPerSample >> 3);
          const silenceSamples = Math.round((sampleRate * gapMs) / 1000);
          const silenceBytes = silenceSamples * bytesPerSample;
          if (silenceBytes > 0) {
            const silenceBuf = Buffer.alloc(silenceBytes);
            await wavHandle.write(silenceBuf, 0, silenceBuf.length, 44 + totalPcmBytes);
            totalPcmBytes += silenceBuf.length;
          }
        }

        onChunkProgress?.(i + 1, chunks.length);
      }

      // Write final 44-byte RIFF/WAVE header at offset 0
      const finalHeader = createWavHeader(totalPcmBytes, sampleRate, numChannels, bitsPerSample);
      await wavHandle.write(finalHeader, 0, 44, 0);
    } finally {
      await wavHandle.close();
    }

    const timeline = computeReadAlongTimeline(timedChunks, { aspectRatio });
    let srtPath: string | undefined;
    let vttPath: string | undefined;

    // Publish companion .srt and .vtt subtitle files when exporting a Read-Along Video (or when saveSubtitles === true)
    if (isPhononVideoFormat(format) && saveSubtitles) {
      const outDir = nodePath.dirname(outputPath);
      const outStem = splitName(nodePath.basename(outputPath))[0] || "speech";
      srtPath = nodePath.join(outDir, `${outStem}.srt`);
      vttPath = nodePath.join(outDir, `${outStem}.vtt`);
      await fsp.writeFile(srtPath, formatSrtSubtitles(timeline), "utf8");
      await fsp.writeFile(vttPath, formatVttSubtitles(timeline), "utf8");
    }

    const needsSpeedOrPitchFilter = Math.abs(speed - 1) >= 0.01 || Math.abs(pitch) >= 0.25;
    if (format === "wav" && (!needsSpeedOrPitchFilter || !ffmpegExe)) {
      await publishStagedFile(stitchedWavPath, outputPath);
    } else if (format === "aiff" && !ffmpegExe) {
      await convertWavFileToAiffNative(stitchedWavPath, stagedOutPath);
      await publishStagedFile(stagedOutPath, outputPath);
    } else if (isPhononVideoFormat(format)) {
      if (!ffmpegExe) {
        throw new FmError("MISSING_TOOL", `Saving a Read-Along Video (.${format.toUpperCase()}) requires ffmpeg. Click 1-Click Install ffmpeg first.`);
      }
      const env = buildExecEnv(ctx);
      const aspect = VIDEO_ASPECT_INFO[aspectRatio] ?? VIDEO_ASPECT_INFO["16:9"];
      const theme = VIDEO_THEME_INFO[videoTheme] ?? VIDEO_THEME_INFO.midnight;
      const docTitle = title || splitName(nodePath.basename(outputPath))[0] || "Phonon Read-Along";
      const assPath = nodePath.join(tmpDir, "subtitles.ass");
      await fsp.writeFile(
        assPath,
        formatAssKaraokeSubtitles(timeline, { voice, title: docTitle, aspectRatio, videoTheme }),
        "utf8",
      );

      // 1. Primary render: 24fps studio canvas + burned-in ASS word-by-word karaoke text + audio
      const primaryArgs = [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-f", "lavfi",
        "-i", `color=c=0x${theme.bgHex}:s=${aspect.width}x${aspect.height}:r=24`,
        "-i", "stitched.wav",
        "-shortest",
        "-vf", "ass=subtitles.ass",
        ...ffmpegEncoderArgsForFormat(format, speed, pitch, sampleRate),
        `out.${format}`,
      ];
      let proc = Bun.spawn([ffmpegExe, ...primaryArgs], { cwd: tmpDir, stdout: "pipe", stderr: "pipe", stdin: "ignore", env });
      let [outText, errText, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      // 2. Fallback if this ffmpeg build does not have `libass` (`ass` filter) compiled in
      if (exitCode !== 0 || !existsSync(stagedOutPath)) {
        const fallbackCanvasArgs = [
          "-hide_banner",
          "-nostdin",
          "-y",
          "-f", "lavfi",
          "-i", `color=c=0x${theme.bgHex}:s=${aspect.width}x${aspect.height}:r=24`,
          "-i", "stitched.wav",
          "-shortest",
          ...ffmpegEncoderArgsForFormat(format, speed, pitch, sampleRate),
          `out.${format}`,
        ];
        proc = Bun.spawn([ffmpegExe, ...fallbackCanvasArgs], { cwd: tmpDir, stdout: "pipe", stderr: "pipe", stdin: "ignore", env });
        [outText, errText, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
      }

      if (exitCode !== 0 || !existsSync(stagedOutPath)) {
        throw new Error(explainFailure("ffmpeg", `${outText}\n${errText}`, exitCode));
      }
      await publishStagedFile(stagedOutPath, outputPath);
    } else {
      if (!ffmpegExe) {
        throw new FmError("MISSING_TOOL", `Saving as .${format.toUpperCase()} requires ffmpeg. Install ffmpeg with one click, or choose WAV or AIFF.`);
      }
      const env = buildExecEnv(ctx);
      const ffArgs = [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        `file:${stitchedWavPath}`,
        ...ffmpegEncoderArgsForFormat(format, speed, pitch, sampleRate),
        `file:${stagedOutPath}`,
      ];
      const proc = Bun.spawn([ffmpegExe, ...ffArgs], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env });
      const [outText, errText, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (exitCode !== 0 || !existsSync(stagedOutPath)) {
        throw new Error(explainFailure("ffmpeg", `${outText}\n${errText}`, exitCode));
      }
      await publishStagedFile(stagedOutPath, outputPath);
    }

    const finalStat = await fsp.stat(outputPath);
    const bytesPerSec = Math.max(1, sampleRate * numChannels * (bitsPerSample >> 3));
    const durationSec = Math.round((totalPcmBytes / bytesPerSec / Math.max(0.5, speed)) * 100) / 100;
    return {
      outputPath,
      ...(srtPath ? { srtPath } : {}),
      ...(vttPath ? { vttPath } : {}),
      chunkCount: chunks.length,
      durationSec,
      sizeBytes: finalStat.size,
      timeline,
    };
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function startPhononAudioExportJob(
  ctx: FmContext,
  body: {
    text?: unknown;
    paths?: unknown;
    voice?: unknown;
    format?: unknown;
    speed?: unknown;
    pitch?: unknown;
    pauseMs?: unknown;
    cleanText?: unknown;
    outputDir?: unknown;
    outputName?: unknown;
    maxChunkChars?: unknown;
    aspectRatio?: unknown;
    videoTheme?: unknown;
    saveSubtitles?: unknown;
    title?: unknown;
  },
): Promise<{ job: ReturnType<FmContext["jobs"]["start"]>; outputs: string[]; isVideo: boolean }> {
  const settings = await loadSettings(ctx);
  const voice = typeof body.voice === "string" && /^[A-Za-z0-9 _-]{1,48}$/.test(body.voice.trim()) ? body.voice.trim() : settings.phononVoice || "Zoey";
  const format: PhononAudioFormat = (PHONON_AUDIO_FORMATS as readonly string[]).includes(String(body.format ?? ""))
    ? (body.format as PhononAudioFormat)
    : settings.phononFormat || "wav";
  const speed = typeof body.speed === "number" && isFinite(body.speed) ? Math.min(2.5, Math.max(0.5, body.speed)) : settings.phononSpeed || 1;
  const pitch = typeof body.pitch === "number" && isFinite(body.pitch)
    ? Math.round(Math.min(6, Math.max(-6, body.pitch)) * 2) / 2
    : (settings.phononPitch ?? 0);
  const pauseMs = typeof body.pauseMs === "number" && isFinite(body.pauseMs) ? Math.min(2000, Math.max(0, Math.round(body.pauseMs))) : settings.phononPauseMs ?? 200;
  const cleanText = typeof body.cleanText === "boolean" ? body.cleanText : (settings.phononCleanText ?? true);
  const maxChunkChars = typeof body.maxChunkChars === "number" && isFinite(body.maxChunkChars)
    ? Math.min(PHONON_HARD_MAX_CHUNK_CHARS, Math.max(150, Math.round(body.maxChunkChars)))
    : PHONON_BATCH_CHUNK_CHARS;
  const aspectRatio: PhononVideoAspect = (PHONON_VIDEO_ASPECTS as readonly string[]).includes(String(body.aspectRatio ?? ""))
    ? (body.aspectRatio as PhononVideoAspect)
    : "16:9";
  const videoTheme: PhononVideoTheme = (PHONON_VIDEO_THEMES as readonly string[]).includes(String(body.videoTheme ?? ""))
    ? (body.videoTheme as PhononVideoTheme)
    : "midnight";
  const saveSubtitles = typeof body.saveSubtitles === "boolean" ? body.saveSubtitles : true;
  const customTitle = typeof body.title === "string" ? body.title.trim() : "";

  const ollamaExe = resolveTool(ctx, "ollama");
  if (!ollamaExe) {
    throw new FmError("MISSING_TOOL", "Ollama isn't installed yet. Click Install Ollama & Phonon first.");
  }
  const ffmpegExe = resolveTool(ctx, "ffmpeg");
  const fmtInfo = ALL_MEDIA_FORMAT_INFO.find((f) => f.id === format) ?? AUDIO_FORMAT_INFO[0]!;
  if (fmtInfo.needsFfmpeg && !ffmpegExe) {
    throw new FmError("MISSING_TOOL", `Saving as .${format.toUpperCase()} needs ffmpeg. Install ffmpeg or choose WAV / AIFF.`);
  }

  const rawPaths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string" && p.trim().length > 0) : [];
  const directText = typeof body.text === "string" ? body.text.trim() : "";

  if (!directText && rawPaths.length === 0) {
    throw new FmError("BAD_REQUEST", "Provide text or select at least one file to save as audio or read-along video.");
  }

  const targetDir = typeof body.outputDir === "string" && body.outputDir.trim()
    ? absolutePath(ctx, body.outputDir)
    : rawPaths.length > 0
      ? nodePath.dirname(absolutePath(ctx, rawPaths[0]!))
      : ctx.home;

  const protectWhy = protectedReason(targetDir, { platform: ctx.platform, home: ctx.home, extraProtected: [ctx.trashRoot] }, "create");
  if (protectWhy) {
    throw new FmError("PROTECTED_PATH", protectWhy);
  }
  await fsp.mkdir(targetDir, { recursive: true });

  const outputs: string[] = [];
  const steps: Array<{
    label: string;
    output: string;
    timeoutMs: number;
    prepare: () => Promise<{ work: (signal: AbortSignal, log: (text: string) => void) => Promise<string | void> }>;
  }> = [];

  const isVideo = isPhononVideoFormat(format);

  if (directText) {
    const cleaned = cleanText ? cleanTextForSpeech(directText) : directText;
    const chunks = splitTextForPhonon(cleaned, { maxChars: maxChunkChars, mergeShortParagraphs: true });
    if (!chunks.length) throw new FmError("EMPTY_TEXT", "There are no readable words to save.");

    const rawBase = typeof body.outputName === "string" && body.outputName.trim()
      ? splitName(nodePath.basename(body.outputName.trim()))[0] || "speech"
      : "speech";
    const safeStem = rawBase.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "speech";
    const outPath = uniqueOutputFilePath(targetDir, `${safeStem}.${fmtInfo.ext}`);
    outputs.push(outPath);

    steps.push({
      label: `${nodePath.basename(outPath)} (${chunks.length} chunk${chunks.length === 1 ? "" : "s"}, voice: ${voice}${isVideo ? `, ${aspectRatio} Read-Along Video` : ""})`,
      output: outPath,
      timeoutMs: Math.max(10 * 60 * 1000, chunks.length * 90_000),
      prepare: async () => ({
        work: async (signal: AbortSignal, log: (text: string) => void) => {
          await ensureOllamaDaemon(ctx, ollamaExe);
          const res = await synthesizeAndExportAudioFile(ctx, {
            ollamaExe,
            ffmpegExe,
            chunks,
            voice,
            format,
            speed,
            pitch,
            pauseMs,
            outputPath: outPath,
            aspectRatio,
            videoTheme,
            saveSubtitles,
            title: customTitle || safeStem,
            signal,
            onChunkProgress: (done, total) => {
              log(`Synthesized chunk ${done} of ${total} (${voice})\n`);
            },
          });
          if (res.srtPath) log(`Saved synchronized subtitles: ${nodePath.basename(res.srtPath)} & ${nodePath.basename(res.vttPath || "")}\n`);
        },
      }),
    });
  } else {
    for (const rawP of rawPaths) {
      const srcPath = absolutePath(ctx, rawP);
      const stem = splitName(nodePath.basename(srcPath))[0] || "speech";
      const outDir = typeof body.outputDir === "string" && body.outputDir.trim() ? targetDir : nodePath.dirname(srcPath);
      const outPath = uniqueOutputFilePath(outDir, `${stem}.${fmtInfo.ext}`);
      outputs.push(outPath);

      steps.push({
        label: `${nodePath.basename(srcPath)} → ${nodePath.basename(outPath)} (${voice}${isVideo ? `, ${aspectRatio} Video` : ""})`,
        output: outPath,
        timeoutMs: 60 * 60 * 1000,
        prepare: async () => ({
          work: async (signal: AbortSignal, log: (text: string) => void) => {
            await ensureOllamaDaemon(ctx, ollamaExe);
            const extracted = await extractPlainTextFromFile(ctx, srcPath, { clean: cleanText, maxChars: maxChunkChars });
            const chunks = splitTextForPhonon(extracted.text, { maxChars: maxChunkChars, mergeShortParagraphs: true });
            if (!chunks.length) throw new Error(`No readable text in ${nodePath.basename(srcPath)}.`);
            const res = await synthesizeAndExportAudioFile(ctx, {
              ollamaExe,
              ffmpegExe,
              chunks,
              voice,
              format,
              speed,
              pitch,
              pauseMs,
              outputPath: outPath,
              aspectRatio,
              videoTheme,
              saveSubtitles,
              title: customTitle || extracted.title || stem,
              signal,
              onChunkProgress: (done, total) => {
                log(`Synthesized chunk ${done} of ${total} for ${nodePath.basename(srcPath)}\n`);
              },
            });
            if (res.srtPath) log(`Saved synchronized subtitles: ${nodePath.basename(res.srtPath)}\n`);
          },
        }),
      });
    }
  }

  const job = ctx.jobs.start({
    kind: "convert",
    title: isVideo
      ? `Phonon Read-Along Video to ${format.toUpperCase()} (${voice}, ${aspectRatio})`
      : `Phonon Speech to ${format.toUpperCase()} (${voice})`,
    steps,
  });

  return { job, outputs, isVideo };
}

/**
 * Saves converted plain text to a `.txt` file on disk.
 */
export async function savePlainTextToFile(
  ctx: FmContext,
  body: { text?: unknown; sourcePath?: unknown; outputDir?: unknown; outputName?: unknown },
): Promise<{ path: string; size: number }> {
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) throw new FmError("EMPTY_TEXT", "There is no plain text to save.");

  const srcPath = typeof body.sourcePath === "string" && body.sourcePath.trim() ? absolutePath(ctx, body.sourcePath) : "";
  const dir = typeof body.outputDir === "string" && body.outputDir.trim()
    ? absolutePath(ctx, body.outputDir)
    : srcPath
      ? nodePath.dirname(srcPath)
      : ctx.home;

  const protectWhy = protectedReason(dir, { platform: ctx.platform, home: ctx.home, extraProtected: [ctx.trashRoot] }, "create");
  if (protectWhy) {
    throw new FmError("PROTECTED_PATH", protectWhy);
  }
  await fsp.mkdir(dir, { recursive: true });

  const defaultStem = srcPath ? `${splitName(nodePath.basename(srcPath))[0]} (plain text)` : "plain-text";
  const rawStem = typeof body.outputName === "string" && body.outputName.trim()
    ? splitName(nodePath.basename(body.outputName.trim()))[0] || defaultStem
    : defaultStem;
  const safeStem = rawStem.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "plain-text";
  const outPath = uniqueOutputFilePath(dir, `${safeStem}.txt`);
  const normalized = `${text.replace(/\r\n?/g, "\n").trim()}\n`;
  await fsp.writeFile(outPath, normalized, "utf8");
  const st = await fsp.stat(outPath);
  return { path: outPath, size: st.size };
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP Operations Table (`PHONON_OPS`)
// ---------------------------------------------------------------------------------------------------------------

export const PHONON_OPS: Record<string, FmHandler> = {
  "phonon/status": (ctx) => getPhononStatus(ctx),
  "phonon/install": async (ctx, b) => ({ job: startPhononInstall(ctx, (b ?? {}) as { confirm?: unknown }) }),
  "phonon/voice": async (ctx, b) => {
    const rec = (b ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof rec.voice === "string") patch.phononVoice = rec.voice;
    if (typeof rec.format === "string") patch.phononFormat = rec.format;
    if (typeof rec.speed === "number") patch.phononSpeed = rec.speed;
    if (typeof rec.pitch === "number") patch.phononPitch = rec.pitch;
    if (typeof rec.syncOffsetMs === "number") patch.phononSyncOffsetMs = rec.syncOffsetMs;
    if (typeof rec.cleanText === "boolean") patch.phononCleanText = rec.cleanText;
    if (typeof rec.pauseMs === "number") patch.phononPauseMs = rec.pauseMs;
    const settings = await updateSettings(ctx, patch);
    return {
      voice: settings.phononVoice,
      format: settings.phononFormat,
      speed: settings.phononSpeed,
      pitch: settings.phononPitch,
      syncOffsetMs: settings.phononSyncOffsetMs,
      cleanText: settings.phononCleanText,
      pauseMs: settings.phononPauseMs,
      settings,
    };
  },
  "phonon/extract": async (ctx, b) => {
    const rec = (b ?? {}) as Record<string, unknown>;
    const maxChars = typeof rec.maxChars === "number" ? rec.maxChars : PHONON_DEFAULT_CHUNK_CHARS;
    const cleanOpts: CleanTextOptions & { clean?: boolean; maxChars?: number } = {
      clean: typeof rec.clean === "boolean" ? rec.clean : true,
      stripMarkdown: typeof rec.stripMarkdown === "boolean" ? rec.stripMarkdown : true,
      stripHtml: typeof rec.stripHtml === "boolean" ? rec.stripHtml : true,
      stripCodeBlocks: typeof rec.stripCodeBlocks === "boolean" ? rec.stripCodeBlocks : false,
      simplifyUrls: typeof rec.simplifyUrls === "boolean" ? rec.simplifyUrls : true,
      stripTimestamps: typeof rec.stripTimestamps === "boolean" ? rec.stripTimestamps : true,
      unwrapLines: typeof rec.unwrapLines === "boolean" ? rec.unwrapLines : false,
      maxChars,
    };
    if (typeof rec.path === "string" && rec.path.trim()) {
      const extracted = await extractPlainTextFromFile(ctx, rec.path, cleanOpts);
      const chunks = splitTextForPhonon(extracted.text, { maxChars });
      // Cap returned full text at 600 KB in JSON response if huge, while still returning all chunk objects
      const maxInlineText = 600 * 1024;
      const textTruncated = extracted.text.length > maxInlineText;
      return {
        ...extracted,
        text: textTruncated ? extracted.text.slice(0, maxInlineText) : extracted.text,
        rawText: extracted.rawText.length > maxInlineText ? extracted.rawText.slice(0, maxInlineText) : extracted.rawText,
        textTruncated,
        chunks,
      };
    }
    if (typeof rec.text === "string") {
      const rawText = rec.text;
      const text = cleanOpts.clean ? cleanTextForSpeech(rawText, cleanOpts) : rawText.replace(/\r\n?/g, "\n").trim();
      const chunks = splitTextForPhonon(text, { maxChars });
      const wordCount = chunks.reduce((acc, c) => acc + c.wordCount, 0);
      return {
        text,
        rawText,
        formatLabel: "Direct Text",
        method: cleanOpts.clean ? "Speech Text Cleaner" : "Raw Text",
        charCount: text.length,
        wordCount,
        chunkCount: chunks.length,
        estimatedSeconds: Math.max(1, Math.round((wordCount / 155) * 60)),
        textTruncated: false,
        chunks,
      };
    }
    throw new FmError("BAD_REQUEST", "Provide a file path or text to convert.");
  },
  "phonon/chunk": async (_ctx, b) => {
    const rec = (b ?? {}) as Record<string, unknown>;
    const raw = typeof rec.text === "string" ? rec.text : "";
    const maxChars = typeof rec.maxChars === "number" ? rec.maxChars : PHONON_DEFAULT_CHUNK_CHARS;
    const mergeShortParagraphs = typeof rec.mergeShortParagraphs === "boolean" ? rec.mergeShortParagraphs : false;
    const chunks = splitTextForPhonon(raw, { maxChars, mergeShortParagraphs });
    const wordCount = chunks.reduce((acc, c) => acc + c.wordCount, 0);
    return {
      charCount: raw.length,
      wordCount,
      chunkCount: chunks.length,
      estimatedSeconds: Math.max(1, Math.round((wordCount / 155) * 60)),
      chunks,
    };
  },
  "phonon/speak": (ctx, b) => speakChunk(ctx, (b ?? {}) as { text?: unknown; voice?: unknown; pitch?: unknown }),
  "phonon/save": (ctx, b) => startPhononAudioExportJob(ctx, (b ?? {}) as Record<string, unknown>),
  "phonon/video": (ctx, b) => {
    const rec = (b ?? {}) as Record<string, unknown>;
    const fmt = isPhononVideoFormat(String(rec.format ?? "")) ? rec.format : "mp4";
    return startPhononAudioExportJob(ctx, { ...rec, format: fmt });
  },
  "phonon/savetxt": (ctx, b) => savePlainTextToFile(ctx, (b ?? {}) as Record<string, unknown>),
};
