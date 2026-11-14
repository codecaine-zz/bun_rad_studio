/**
 * 🎙️ Phonon AI TTS Master Suite (`fmPhononMaster.ts`)
 *
 * Studio-grade Speech DSP, Linguistic Text Normalization (TN/G2P), Dual-Track Pronunciation Lexicon,
 * Stage-Direction & Multi-Voice Dialogue Engine, 2-Host AI Podcast Generator, True `.M4B` Chaptered
 * Audiobook Packager (FFMETADATA1 + Cover Art), Crash-Resumable Disk Checkpointing, Closed-Loop QA
 * Verification, Sub-250ms Fast-Start Clause Streaming, and Spectral-Flux Word-Boundary Alignment.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";
import { inflateRawSync } from "node:zlib";

// ============================================================================
// 1. Types & Constants
// ============================================================================

export const PHONON_MASTER_PRESETS = [
  "none",
  "podcast",
  "acx",
  "broadcast",
] as const;

export type PhononMasterPreset = (typeof PHONON_MASTER_PRESETS)[number];

export const PHONON_EMOTION_PROFILES = [
  "neutral",
  "calm",
  "excited",
  "serious",
  "whisper",
] as const;

export type PhononEmotionProfile = (typeof PHONON_EMOTION_PROFILES)[number];

export interface AudioMasteringMetrics {
  rmsDbfs: number;
  speechRmsDbfs: number;
  peakDbfs: number;
  noiseFloorDbfs: number;
  dcOffset: number;
  durationSec: number;
  acxCompliant: boolean;
}

export interface SeamMasteredChunkResult {
  pcmData: Buffer;
  trimmedLeadSamples: number;
  trimmedTailSamples: number;
  originalSamples: number;
  speechRmsDbfs: number;
}

export interface PhononLexiconEntry {
  /** Exact word or pattern as displayed in text/subtitles (e.g. "SQLite", "kubectl"). */
  display: string;
  /** Spoken phonetic respelling sent to TTS (e.g. "sequel lite", "kube control"). */
  spoken: string;
  /** Case-sensitive matching when true (default: false unless uppercase acronym). */
  caseSensitive?: boolean;
}

export interface DualTrackWordSpan {
  /** Index in spoken whitespace-delimited token array where replacement starts. */
  spokenTokenStart: number;
  /** Number of spoken words produced by this lexicon entry. */
  spokenTokenCount: number;
  /** Original visual display token to restore in SRT/VTT/ASS/MP4 captions. */
  displayToken: string;
}

export interface DualTrackLexiconResult {
  spokenText: string;
  displayText: string;
  replacementsApplied: number;
  spans: DualTrackWordSpan[];
}

export interface StageDirectedSegment {
  text: string;
  displayText: string;
  voice?: string;
  speakerLabel?: string;
  speedMultiplier?: number;
  pitchDelta?: number;
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  emotion?: PhononEmotionProfile;
  paragraphIndex: number;
}

export interface PodcastDialogueTurn {
  speaker: string;
  voice: string;
  text: string;
  pan: number; // -1.0 (left) to +1.0 (right)
}

export interface M4bChapterSpec {
  number: number;
  title: string;
  startMs: number;
  endMs: number;
}

export interface ChunkVerificationReport {
  ok: boolean;
  reason?: string;
  durationSec: number;
  charsPerSec: number;
  peakDbfs: number;
  speechRatio: number;
  asrTranscript?: string;
  asrWordRecall?: number;
}

// ============================================================================
// 2. Speech DSP: Seam Micro-Fades, Silence Trimming, Room Tone & Mastering
// ============================================================================

function linearToDb(amp: number): number {
  if (amp <= 1e-7) return -120;
  return Math.round(20 * Math.log10(amp) * 100) / 100;
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Removes DC offset, trims unpredictable leading/trailing neural vocoder dead air below `-50 dBFS`
 * down to a uniform `padMs` breath pad, and applies a raised-cosine (Hann) micro-fade (`fadeMs`)
 * at both ends so stitched chunks never click or pop at boundaries.
 */
export function masterChunkSeamPcm(
  pcmData: Buffer,
  sampleRate = 24000,
  opts: {
    trimSilence?: boolean;
    silenceThresholdDbfs?: number;
    padMs?: number;
    fadeMs?: number;
  } = {},
): SeamMasteredChunkResult {
  const numSamples = Math.floor(pcmData.length / 2);
  if (numSamples < 64) {
    return {
      pcmData,
      trimmedLeadSamples: 0,
      trimmedTailSamples: 0,
      originalSamples: numSamples,
      speechRmsDbfs: -60,
    };
  }

  const trimSilence = opts.trimSilence !== false;
  const threshLin = dbToLinear(opts.silenceThresholdDbfs ?? -50);
  const padSamples = Math.max(
    0,
    Math.round(((opts.padMs ?? 22) / 1000) * sampleRate),
  );
  const fadeSamples = Math.min(
    Math.floor(numSamples / 4),
    Math.max(16, Math.round(((opts.fadeMs ?? 6) / 1000) * sampleRate)),
  );

  // 1. Decode to Float64 & compute DC offset
  const samples = new Float64Array(numSamples);
  let sum = 0;
  for (let i = 0; i < numSamples; i++) {
    const v = pcmData.readInt16LE(i * 2) / 32768;
    samples[i] = v;
    sum += v;
  }
  const dcMean = sum / numSamples;
  for (let i = 0; i < numSamples; i++) {
    samples[i] = samples[i]! - dcMean;
  }

  // 2. Locate active speech region using 10ms RMS windows
  const winLen = Math.max(32, Math.round(sampleRate * 0.01));
  const numWins = Math.max(1, Math.floor(numSamples / winLen));
  let firstActiveWin = 0;
  let lastActiveWin = numWins - 1;
  let activeRmsSumSq = 0;
  let activeWinCount = 0;

  for (let w = 0; w < numWins; w++) {
    let sq = 0;
    const base = w * winLen;
    for (let j = 0; j < winLen; j++) {
      const s = samples[base + j]!;
      sq += s * s;
    }
    const rms = Math.sqrt(sq / winLen);
    if (rms >= threshLin * 1.8) {
      activeRmsSumSq += sq / winLen;
      activeWinCount++;
    }
  }

  if (trimSilence && numWins > 4 && activeWinCount > 0) {
    for (let w = 0; w < numWins; w++) {
      let sq = 0;
      const base = w * winLen;
      for (let j = 0; j < winLen; j++) {
        const s = samples[base + j]!;
        sq += s * s;
      }
      if (Math.sqrt(sq / winLen) >= threshLin) {
        firstActiveWin = w;
        break;
      }
    }
    for (let w = numWins - 1; w >= firstActiveWin; w--) {
      let sq = 0;
      const base = w * winLen;
      for (let j = 0; j < winLen; j++) {
        const s = samples[base + j]!;
        sq += s * s;
      }
      if (Math.sqrt(sq / winLen) >= threshLin) {
        lastActiveWin = w;
        break;
      }
    }
  }

  const startIdx = trimSilence
    ? Math.max(0, firstActiveWin * winLen - padSamples)
    : 0;
  const endIdx = trimSilence
    ? Math.min(numSamples, (lastActiveWin + 1) * winLen + padSamples)
    : numSamples;

  const finalStart =
    endIdx - startIdx >= Math.min(numSamples, 120) ? startIdx : 0;
  const finalEnd =
    endIdx - startIdx >= Math.min(numSamples, 120) ? endIdx : numSamples;
  const outLen = Math.max(1, finalEnd - finalStart);

  // 3. Apply raised-cosine (Hann) micro-fades at start & end
  const effFade = Math.min(fadeSamples, Math.floor(outLen / 3));
  const outBuf = Buffer.alloc(outLen * 2);
  for (let i = 0; i < outLen; i++) {
    let s = samples[finalStart + i]!;
    if (i < effFade) {
      const gain = 0.5 * (1 - Math.cos((Math.PI * i) / effFade));
      s *= gain;
    } else if (i >= outLen - effFade) {
      const rem = outLen - 1 - i;
      const gain = 0.5 * (1 - Math.cos((Math.PI * rem) / effFade));
      s *= gain;
    }
    const clamped = Math.max(-32767, Math.min(32767, Math.round(s * 32767)));
    outBuf.writeInt16LE(clamped, i * 2);
  }

  const speechRms =
    activeWinCount > 0 ? Math.sqrt(activeRmsSumSq / activeWinCount) : 0;

  return {
    pcmData: outBuf,
    trimmedLeadSamples: finalStart,
    trimmedTailSamples: numSamples - finalEnd,
    originalSamples: numSamples,
    speechRmsDbfs: linearToDb(speechRms),
  };
}

/**
 * Generates warm shaped pink/comfort room tone around `-62 dBFS` (instead of harsh `0x0000` digital black)
 * so headphones never experience uncanny noise-gate pumping between stitched neural TTS chunks.
 */
export function createComfortRoomTonePcm(
  numSamples: number,
  sampleRate = 24000,
  floorDbfs = -62,
  seed = 1337,
): Buffer {
  if (numSamples <= 0) return Buffer.alloc(0);
  const out = Buffer.alloc(numSamples * 2);
  const targetAmp = dbToLinear(floorDbfs);
  const fadeSamples = Math.min(
    Math.floor(numSamples / 4),
    Math.max(8, Math.round(sampleRate * 0.004)),
  );

  // Deterministic LCG + 3-pole Paul Kellet pink-noise filter for warm, hiss-free studio room tone
  let rng = seed >>> 0 || 0x9e3779b9;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < numSamples; i++) {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const white = (rng / 0xffffffff) * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    let pink = (b0 + b1 + b2 + white * 0.1848) * 0.22 * targetAmp;

    if (i < fadeSamples) {
      pink *= 0.5 * (1 - Math.cos((Math.PI * i) / fadeSamples));
    } else if (i >= numSamples - fadeSamples) {
      const rem = numSamples - 1 - i;
      pink *= 0.5 * (1 - Math.cos((Math.PI * rem) / fadeSamples));
    }
    const sampleInt = Math.max(
      -32767,
      Math.min(32767, Math.round(pink * 32767)),
    );
    out.writeInt16LE(sampleInt, i * 2);
  }
  return out;
}

/**
 * Computes natural discourse-aware silence gap in milliseconds between chunk `i` and chunk `i+1`
 * based on terminal punctuation, paragraph transitions, headings, and scene breaks.
 */
export function computeDiscoursePauseMs(params: {
  prevText: string;
  nextText: string;
  prevParagraphIndex: number;
  nextParagraphIndex: number;
  basePauseMs: number;
  explicitPauseAfterMs?: number;
  explicitPauseBeforeMs?: number;
}): number {
  const {
    prevText,
    nextText,
    prevParagraphIndex,
    nextParagraphIndex,
    basePauseMs,
    explicitPauseAfterMs,
    explicitPauseBeforeMs,
  } = params;

  if (
    typeof explicitPauseAfterMs === "number" ||
    typeof explicitPauseBeforeMs === "number"
  ) {
    return Math.min(
      5000,
      Math.max(
        0,
        Math.round((explicitPauseAfterMs ?? 0) + (explicitPauseBeforeMs ?? 0)),
      ),
    );
  }
  if (basePauseMs <= 0) return 0;

  const pTrim = prevText.trim();
  const nTrim = nextText.trim();

  // Scene break or chapter/section heading transition
  const nextLooksLikeHeading =
    /^(?:chapter|part|book|section|prologue|epilogue|act|scene)\b/i.test(
      nTrim,
    ) && nTrim.length <= 90;
  if (nextLooksLikeHeading) {
    return Math.min(2400, Math.max(420, Math.round(basePauseMs * 2.6)));
  }

  // Different paragraph
  if (nextParagraphIndex !== prevParagraphIndex) {
    if (/[?!]["')\]]*$/.test(pTrim)) {
      return Math.min(2000, Math.round(basePauseMs * 1.45));
    }
    if (/[:—–]["')\]]*$/.test(pTrim)) {
      return Math.min(2000, Math.round(basePauseMs * 1.1));
    }
    return Math.min(2000, Math.round(basePauseMs * 1.25));
  }

  // Intra-paragraph boundaries: scale by terminal punctuation
  if (/[?!]["')\]]*$/.test(pTrim)) {
    return Math.min(900, Math.round(basePauseMs * 0.95));
  }
  if (/[.…]["')\]]*$/.test(pTrim)) {
    return Math.min(800, Math.round(basePauseMs * 0.75));
  }
  if (/[;:—–]["')\]]*$/.test(pTrim)) {
    return Math.min(500, Math.round(basePauseMs * 0.55));
  }
  if (/[,]["')\]]*$/.test(pTrim)) {
    return Math.min(350, Math.round(basePauseMs * 0.4));
  }
  return Math.min(180, Math.round(basePauseMs * 0.3));
}

/**
 * Computes comprehensive audio mastering and ACX audiobook compliance metrics on 16-bit mono PCM.
 */
export function analyzeAudioMasteringMetrics(
  pcmData: Buffer,
  sampleRate = 24000,
): AudioMasteringMetrics {
  const numSamples = Math.floor(pcmData.length / 2);
  if (numSamples === 0) {
    return {
      rmsDbfs: -120,
      speechRmsDbfs: -120,
      peakDbfs: -120,
      noiseFloorDbfs: -120,
      dcOffset: 0,
      durationSec: 0,
      acxCompliant: false,
    };
  }

  let totalSq = 0;
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < numSamples; i++) {
    const v = pcmData.readInt16LE(i * 2) / 32768;
    sum += v;
    totalSq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }

  const winLen = Math.min(
    numSamples,
    Math.max(1, Math.round(sampleRate * 0.025)),
  );
  const numWins = Math.max(1, Math.floor(numSamples / winLen));
  const winRms: number[] = [];
  for (let w = 0; w < numWins; w++) {
    let sq = 0;
    const base = w * winLen;
    let cnt = 0;
    for (let j = 0; j < winLen; j++) {
      const byteOff = (base + j) * 2;
      if (byteOff + 2 > pcmData.length) break;
      const v = pcmData.readInt16LE(byteOff) / 32768;
      sq += v * v;
      cnt++;
    }
    winRms.push(cnt > 0 ? Math.sqrt(sq / cnt) : 0);
  }
  winRms.sort((a, b) => a - b);

  // Measure room-tone noise floor at the 2nd percentile of quietest windows so dense speech
  // with short (~5%) inter-sentence pauses measures actual silence/room-tone rather than breaths.
  const floorIdx = Math.min(
    winRms.length - 1,
    Math.floor(winRms.length * 0.02),
  );
  const noiseFloorLin = winRms[floorIdx] ?? 0;

  const speechGate = Math.max(dbToLinear(-46), peak * 0.06);
  const activeWins = winRms.filter((r) => r >= speechGate);
  const speechRmsLin =
    activeWins.length > 0
      ? Math.sqrt(activeWins.reduce((s, r) => s + r * r, 0) / activeWins.length)
      : Math.sqrt(totalSq / numSamples);

  const rmsDbfs = linearToDb(Math.sqrt(totalSq / numSamples));
  const speechRmsDbfs = linearToDb(speechRmsLin);
  const peakDbfs = linearToDb(peak);
  const noiseFloorDbfs = linearToDb(noiseFloorLin);
  const durationSec = Math.round((numSamples / sampleRate) * 1000) / 1000;

  // ACX spec: overall RMS between -23 dBFS and -18 dBFS, peak <= -3.0 dBFS, noise floor <= -60 dBFS
  const acxCompliant =
    rmsDbfs >= -23.2 &&
    rmsDbfs <= -17.8 &&
    peakDbfs <= -2.95 &&
    noiseFloorDbfs <= -59.5;

  return {
    rmsDbfs,
    speechRmsDbfs,
    peakDbfs,
    noiseFloorDbfs,
    dcOffset: Math.round((sum / numSamples) * 100000) / 100000,
    durationSec,
    acxCompliant,
  };
}

/**
 * Levels per-chunk speech-active RMS across an array of chunks so emphatic short chunks and
 * quiet narrative chunks sit at a uniform vocal loudness before stitching.
 */
export function levelChunksSpeechRmsPcm(
  chunksPcm: Buffer[],
  sampleRate = 24000,
  targetSpeechRmsDbfs = -19.5,
  maxGainDb = 7.5,
): Buffer[] {
  if (chunksPcm.length === 0) return [];
  const targetLin = dbToLinear(targetSpeechRmsDbfs);
  const maxGain = dbToLinear(maxGainDb);
  const minGain = dbToLinear(-maxGainDb);

  return chunksPcm.map((buf) => {
    const numSamples = Math.floor(buf.length / 2);
    if (numSamples < 120) return buf;
    const metrics = analyzeAudioMasteringMetrics(buf, sampleRate);
    const curLin = dbToLinear(metrics.speechRmsDbfs);
    if (curLin <= 1e-4) return buf;

    const rawGain = targetLin / curLin;
    const gain = Math.max(minGain, Math.min(maxGain, rawGain));
    if (Math.abs(gain - 1) < 0.03) return buf;

    const out = Buffer.alloc(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
      let s = (buf.readInt16LE(i * 2) / 32768) * gain;
      // Soft-knee saturation above 0.82 to prevent inter-chunk clipping
      const a = Math.abs(s);
      if (a > 0.82) {
        const sign = s < 0 ? -1 : 1;
        s = sign * (0.82 + 0.16 * Math.tanh((a - 0.82) / 0.16));
      }
      out.writeInt16LE(
        Math.max(-32767, Math.min(32767, Math.round(s * 32767))),
        i * 2,
      );
    }
    return out;
  });
}

/**
 * Applies a zero-duration-drift pure-TypeScript broadcast/audiobook mastering chain directly on 16-bit PCM:
 *  1. 80 Hz 1st-order high-pass rumble/plosive filter + DC removal
 *  2. Dynamic 6.8 kHz vocal sibilance de-esser (tames harsh neural vocoder 's'/'sh' spikes)
 *  3. Gentle 2.2:1 vocal leveling compressor
 *  4. Exact target RMS calibration + brickwall soft-knee true-peak ceiling
 *     - `podcast`: `-16.5 dBFS` RMS, `-1.5 dBFS` peak ceiling
 *     - `acx`:     `-20.0 dBFS` overall RMS (`-23` to `-18 dB` Audible ACX window), `-3.2 dBFS` peak ceiling, `<-62 dBFS` floor
 *     - `broadcast`: `-23.0 dBFS` EBU R128 RMS, `-1.5 dBFS` peak ceiling
 */
export function applyMasterChainPcm(
  pcmData: Buffer,
  sampleRate = 24000,
  preset: PhononMasterPreset = "podcast",
): Buffer {
  if (preset === "none") return pcmData;
  const numSamples = Math.floor(pcmData.length / 2);
  if (numSamples < 64) return pcmData;

  const targetOverallRmsDb =
    preset === "acx" ? -20.0 : preset === "broadcast" ? -23.0 : -16.5;
  const ceilingDb = preset === "acx" ? -3.2 : -1.5;
  const ceilingLin = dbToLinear(ceilingDb);

  const buf = new Float64Array(numSamples);
  let dcSum = 0;
  for (let i = 0; i < numSamples; i++) {
    const v = pcmData.readInt16LE(i * 2) / 32768;
    buf[i] = v;
    dcSum += v;
  }
  const dc = dcSum / numSamples;

  // Stage 1: 80 Hz high-pass filter
  const rcHp = 1 / (2 * Math.PI * 80);
  const dt = 1 / Math.max(8000, sampleRate);
  const alphaHp = rcHp / (rcHp + dt);
  let prevX = buf[0]! - dc;
  let prevY = 0;
  for (let i = 0; i < numSamples; i++) {
    const x = buf[i]! - dc;
    const y = alphaHp * (prevY + x - prevX);
    prevX = x;
    prevY = y;
    buf[i] = y;
  }

  // Stage 2: Dynamic high-frequency sibilance de-esser (detects >4.5 kHz energy bursts and attenuates HF)
  const rcLp = 1 / (2 * Math.PI * 4500);
  const alphaLp = dt / (rcLp + dt);
  let lowState = 0;
  let hfEnv = 0;
  let bbEnv = 0;
  for (let i = 0; i < numSamples; i++) {
    const s = buf[i]!;
    lowState += alphaLp * (s - lowState);
    const highBand = s - lowState;
    const hfAbs = Math.abs(highBand);
    const bbAbs = Math.abs(s);
    hfEnv = hfEnv * 0.985 + hfAbs * 0.015;
    bbEnv = bbEnv * 0.992 + bbAbs * 0.008;
    // When sibilant band dominates broadband energy, attenuate HF smoothly up to -4.5 dB
    const sibRatio = hfEnv / (bbEnv + 0.002);
    const hfGain =
      sibRatio > 0.52 ? Math.max(0.58, 1 - (sibRatio - 0.52) * 0.65) : 1.0;
    buf[i] = lowState + highBand * hfGain;
  }

  // Stage 3: Smooth RMS vocal leveler (2.0:1 above -24 dBFS) + downward room-tone noise expander (<-47 dBFS)
  // so makeupGain in Stage 4 never amplifies background hiss or comfort room tone above ACX's -60 dBFS floor!
  const compThresh = dbToLinear(-24);
  const gateThresh = dbToLinear(-47);
  const att = Math.exp(-1 / (sampleRate * 0.012));
  const rel = Math.exp(-1 / (sampleRate * 0.14));
  let env = 0;
  for (let i = 0; i < numSamples; i++) {
    const a = Math.abs(buf[i]!);
    env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
    if (env > compThresh) {
      const overDb = 20 * Math.log10(env / compThresh);
      const gainReductionDb = -overDb * 0.45; // ~1.8:1 gentle ratio
      buf[i] = buf[i]! * dbToLinear(gainReductionDb);
    } else if (env < gateThresh) {
      // Gentle 2.4:1 downward expansion below -47 dBFS keeps room tone warm (~-66 dBFS) yet well below -60 dBFS
      const ratio = Math.max(0.08, Math.pow(env / gateThresh, 1.4));
      buf[i] = buf[i]! * ratio;
    }
  }

  // Stage 4: Calibrate overall RMS to target with iterative ceiling-aware gain & soft-knee peak limiter
  let sumSq = 0;
  for (let i = 0; i < numSamples; i++) {
    sumSq += buf[i]! * buf[i]!;
  }
  const curRms = Math.sqrt(sumSq / numSamples);
  if (curRms > 1e-6) {
    const desiredRms = dbToLinear(targetOverallRmsDb);
    const makeupGain = Math.min(dbToLinear(16), desiredRms / curRms);
    const kneeStart = ceilingLin * 0.82;
    const kneeHeadroom = ceilingLin - kneeStart;

    let postSq = 0;
    for (let i = 0; i < numSamples; i++) {
      let s = buf[i]! * makeupGain;
      const a = Math.abs(s);
      if (a > kneeStart) {
        const sign = s < 0 ? -1 : 1;
        s =
          sign *
          (kneeStart +
            kneeHeadroom *
              Math.tanh((a - kneeStart) / Math.max(1e-4, kneeHeadroom)));
      }
      buf[i] = s;
      postSq += s * s;
    }

    // For ACX preset, if heavy peak limiting pulled overall RMS slightly below -22.5 dB, apply a gentle 2nd pass
    if (preset === "acx") {
      const postRmsDb = linearToDb(Math.sqrt(postSq / numSamples));
      if (postRmsDb < -22.5) {
        const trimBoost = Math.min(1.35, dbToLinear(-20.5 - postRmsDb));
        for (let i = 0; i < numSamples; i++) {
          let s = buf[i]! * trimBoost;
          if (Math.abs(s) > ceilingLin) {
            s = (s < 0 ? -1 : 1) * ceilingLin;
          }
          buf[i] = s;
        }
      }
    }
  }

  const out = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-ceilingLin, Math.min(ceilingLin, buf[i]!));
    out.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return out;
}

/**
 * Matches intra-paragraph prosody continuity across sequential chunks (`--continuity`):
 * Smooths sudden inter-chunk vocal energy jumps so chunk `i` enters within ±1.2 dB of chunk `i-1`'s trailing phrase.
 */
export function matchParagraphProsodyContinuityPcm(
  chunks: Array<{ pcmData: Buffer; paragraphIndex: number }>,
  sampleRate = 24000,
): Buffer[] {
  if (chunks.length <= 1) return chunks.map((c) => c.pcmData);
  const result: Buffer[] = [];
  let prevTailRms = 0;
  let prevPara = -1;

  const measureWindowRms = (
    buf: Buffer,
    fromFrac: number,
    toFrac: number,
  ): number => {
    const n = Math.floor(buf.length / 2);
    if (n < 100) return 0;
    const start = Math.max(0, Math.floor(n * fromFrac));
    const end = Math.min(n, Math.ceil(n * toFrac));
    let sq = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      const v = buf.readInt16LE(i * 2) / 32768;
      if (Math.abs(v) > 0.008) {
        sq += v * v;
        count++;
      }
    }
    return count > 20 ? Math.sqrt(sq / count) : 0;
  };

  for (let idx = 0; idx < chunks.length; idx++) {
    const cur = chunks[idx]!;
    let buf = cur.pcmData;
    const headRms = measureWindowRms(buf, 0.0, 0.35);

    if (
      idx > 0 &&
      cur.paragraphIndex === prevPara &&
      prevTailRms > 0.01 &&
      headRms > 0.01
    ) {
      const ratio = prevTailRms / headRms;
      const clampedRatio = Math.max(0.72, Math.min(1.38, ratio));
      if (Math.abs(clampedRatio - 1) > 0.05) {
        const n = Math.floor(buf.length / 2);
        const rampSamples = Math.min(n, Math.round(sampleRate * 1.4));
        const adjusted = Buffer.alloc(n * 2);
        for (let i = 0; i < n; i++) {
          const blend =
            i < rampSamples
              ? clampedRatio + (1 - clampedRatio) * (i / rampSamples) * 0.55
              : 1 + (clampedRatio - 1) * 0.45;
          const s = Math.max(
            -0.95,
            Math.min(0.95, (buf.readInt16LE(i * 2) / 32768) * blend),
          );
          adjusted.writeInt16LE(Math.round(s * 32767), i * 2);
        }
        buf = adjusted;
      }
    }

    prevTailRms = measureWindowRms(buf, 0.65, 1.0) || headRms;
    prevPara = cur.paragraphIndex;
    result.push(buf);
  }
  return result;
}

// ============================================================================
// 3. Linguistic G2P, Abbreviation Split Guard, Technical TN & Lexicon
// ============================================================================

const NON_SENTENCE_END_ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "mx",
  "dr",
  "prof",
  "rev",
  "fr",
  "sr",
  "jr",
  "st",
  "mt",
  "ft",
  "ave",
  "blvd",
  "rd",
  "ln",
  "ct",
  "pl",
  "sq",
  "inc",
  "ltd",
  "corp",
  "co",
  "llc",
  "plc",
  "vs",
  "v",
  "etc",
  "eg",
  "ie",
  "cf",
  "al",
  "et",
  "fig",
  "figs",
  "eq",
  "eqs",
  "vol",
  "vols",
  "no",
  "nos",
  "pp",
  "p",
  "ch",
  "chap",
  "sec",
  "art",
  "approx",
  "est",
  "dept",
  "gov",
  "gen",
  "col",
  "lt",
  "sgt",
  "capt",
  "cmdr",
  "adm",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "u.s",
  "u.k",
  "e.u",
  "u.n",
  "e.g",
  "i.e",
  "a.m",
  "p.m",
]);

/**
 * Returns `true` when the period at `text[periodIndex]` belongs to an honorific, title,
 * single-letter initial (`J. R. R.`), dotted acronym (`U.S.`), or numeric version (`v1.5`)
 * and MUST NOT be treated as a sentence-ending chunk boundary.
 */
export function isAbbreviationOrInitialBeforePeriod(
  text: string,
  periodIndex: number,
): boolean {
  if (periodIndex <= 0 || text[periodIndex] !== ".") return false;

  // Walk backwards over word/dot characters to extract the token preceding the period
  let start = periodIndex - 1;
  while (start >= 0 && /[A-Za-z0-9.]/.test(text[start]!)) {
    start--;
  }
  const token = text.slice(start + 1, periodIndex);
  if (!token) return false;

  const lower = token.toLowerCase();
  if (NON_SENTENCE_END_ABBREVIATIONS.has(lower)) return true;

  // Single uppercase initial (e.g., "J. Smith", "Franklin D. Roosevelt")
  if (/^[A-Z]$/.test(token)) return true;

  // Dotted initialisms like "U.S.", "Ph.D.", "B.C."
  if (/^(?:[A-Za-z]\.)+[A-Za-z]$/.test(token)) return true;

  // Semver or decimal digits preceding dot (if followed by digit or short token)
  if (/^v?\d+(?:\.\d+)*$/i.test(token)) {
    const after = text.slice(periodIndex + 1, periodIndex + 6);
    if (/^\d/.test(after)) return true;
  }

  return false;
}

const ROMAN_VALUES: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
};

function parseSmallRomanNumeral(roman: string): number | null {
  if (!/^[IVXLC]{1,7}$/.test(roman)) return null;
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const cur = ROMAN_VALUES[roman[i]!] ?? 0;
    const next = ROMAN_VALUES[roman[i + 1] ?? ""] ?? 0;
    if (cur < next) total -= cur;
    else total += cur;
  }
  return total >= 1 && total <= 50 ? total : null;
}

const ORDINAL_WORDS: Record<number, string> = {
  1: "First",
  2: "Second",
  3: "Third",
  4: "Fourth",
  5: "Fifth",
  6: "Sixth",
  7: "Seventh",
  8: "Eighth",
  9: "Ninth",
  10: "Tenth",
  11: "Eleventh",
  12: "Twelfth",
  13: "Thirteenth",
  14: "Fourteenth",
  15: "Fifteenth",
  16: "Sixteenth",
  17: "Seventeenth",
  18: "Eighteenth",
  19: "Nineteenth",
  20: "Twentieth",
  21: "Twenty-First",
  22: "Twenty-Second",
  23: "Twenty-Third",
};

const CARDINAL_WORDS: Record<number, string> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
  11: "Eleven",
  12: "Twelve",
  13: "Thirteen",
  14: "Fourteen",
  15: "Fifteen",
  16: "Sixteen",
  17: "Seventeen",
  18: "Eighteen",
  19: "Nineteen",
  20: "Twenty",
};

const CURRENCY_NAMES: Record<string, [string, string, string, string]> = {
  $: ["dollar", "dollars", "cent", "cents"],
  "€": ["euro", "euros", "cent", "cents"],
  "£": ["pound", "pounds", "penny", "pence"],
  "¥": ["yen", "yen", "sen", "sen"],
};

const MAGNITUDE_WORDS: Record<string, string> = {
  k: "thousand",
  K: "thousand",
  m: "million",
  M: "million",
  b: "billion",
  B: "billion",
  t: "trillion",
  T: "trillion",
};

/**
 * Expands currencies with magnitudes (`$1.5M`, `$42.50`, `€100k`), software versions (`v1.5.4`),
 * CLI flags (`--llm-clean`), hardware/audio units (`24kHz`, `x86_64`, `32×`), and Roman numerals
 * (`Henry VIII`, `Chapter IV`, `World War II`) into natural spoken words.
 */
export function expandTechnicalAndNumericForSpeech(input: string): string {
  let s = String(input || "");
  if (!s) return s;

  // 1. Currencies with magnitude suffixes: $1.5M, €100k, £2.4B -> "1.5 million dollars"
  s = s.replace(
    /(?<![A-Za-z0-9])([$€£¥])(\d+(?:,\d{3})*(?:\.\d+)?)\s*([kKmMbBtT])\b/g,
    (_m, sym: string, numRaw: string, mag: string) => {
      const cleanNum = numRaw.replace(/,/g, "");
      const cur = CURRENCY_NAMES[sym] ?? ["dollar", "dollars", "cent", "cents"];
      const magWord = MAGNITUDE_WORDS[mag] ?? "";
      return `${cleanNum} ${magWord} ${cur[1]}`;
    },
  );

  // 2. Currencies with cents: $42.50 -> "42 dollars and 50 cents", $1 -> "1 dollar"
  s = s.replace(
    /(?<![A-Za-z0-9])([$€£¥])(\d+(?:,\d{3})*)(?:\.(\d{2}))?\b(?![.\d])/g,
    (_m, sym: string, wholeRaw: string, centsRaw?: string) => {
      const whole = wholeRaw.replace(/,/g, "");
      const wholeNum = Number(whole);
      const cur = CURRENCY_NAMES[sym] ?? ["dollar", "dollars", "cent", "cents"];
      const unitWord = wholeNum === 1 ? cur[0] : cur[1];
      if (centsRaw && Number(centsRaw) > 0) {
        const cNum = Number(centsRaw);
        const cWord = cNum === 1 ? cur[2] : cur[3];
        return `${whole} ${unitWord} and ${cNum} ${cWord}`;
      }
      return `${whole} ${unitWord}`;
    },
  );

  // 3. Software semantic versions: v1.5.4 -> "version 1 point 5 point 4" (handles sentence-final "v2.4.1.")
  s = s.replace(
    /\bv(\d+)\.(\d+)(?:\.(\d+))?(?!(?:\.\d|\d))/gi,
    (_m, maj: string, min: string, pat?: string) =>
      pat
        ? `version ${maj} point ${min} point ${pat}`
        : `version ${maj} point ${min}`,
  );

  // 4. Long CLI double-dash flags: --llm-clean -> "dash dash llm clean"
  s = s.replace(
    /(?<=\s|^|\()--([a-zA-Z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*)(?=\s|$|[),.;:!?])/g,
    (_m, flagName: string) => `dash dash ${flagName.replace(/-/g, " ")}`,
  );

  // 5. Multiplication / speedup symbol: 32× -> "32 times"
  s = s.replace(
    /(?<![A-Za-z])(\d+(?:\.\d+)?)\s*×(?=\s|$|[),.;:!?])/g,
    "$1 times",
  );

  // 6. Common audio/CPU architecture specs: 24kHz -> "24 kilohertz", x86_64 -> "x86 64"
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*kHz\b/gi, "$1 kilohertz");
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*MHz\b/gi, "$1 megahertz");
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*GHz\b/gi, "$1 gigahertz");
  s = s.replace(/\bx86_64\b/g, "x86 64");
  s = s.replace(/\baarch64\b/g, "arm 64");

  // 7. Structural Roman numerals: "Chapter IV" -> "Chapter Four", "World War II" -> "World War Two"
  s = s.replace(
    /\b(Chapter|Part|Book|Volume|Act|Scene|Section|Phase|Stage|Tier|World War|War)\s+([IVXLC]{1,6})\b/g,
    (full, label: string, rom: string) => {
      const val = parseSmallRomanNumeral(rom);
      if (!val) return full;
      return `${label} ${CARDINAL_WORDS[val] ?? String(val)}`;
    },
  );

  // 8. Regnal / monarch Roman numerals: "Henry VIII" -> "Henry the Eighth", "Elizabeth II" -> "Elizabeth the Second"
  s = s.replace(
    /\b(King|Queen|Pope|Emperor|Louis|Henry|Elizabeth|Charles|George|Edward|Richard|Philip|James|William|Leo|Pius|John Paul|Benedict|Napoleon|ivan|Peter|Catherine)\s+((?:[A-Z][a-z]+\s+)?)([IVX]{2,6})\b/g,
    (full, first: string, mid: string, rom: string) => {
      const val = parseSmallRomanNumeral(rom);
      const ord = val ? ORDINAL_WORDS[val] : undefined;
      if (!ord) return full;
      return `${first} ${mid}the ${ord}`;
    },
  );

  return s;
}

export const BUILTIN_TECH_LEXICON: PhononLexiconEntry[] = [
  { display: "SQLite", spoken: "sequel lite" },
  { display: "PostgreSQL", spoken: "postgres Q L" },
  { display: "MySQL", spoken: "my sequel" },
  { display: "kubectl", spoken: "kube control" },
  { display: "nginx", spoken: "engine X" },
  { display: "FFmpeg", spoken: "F F M peg" },
  { display: "macOS", spoken: "mac O S", caseSensitive: true },
  { display: "PyPI", spoken: "pie P I", caseSensitive: true },
];

/**
 * Loads a pronunciation lexicon from a JSON file (`{ "SQLite": "sequel lite" }` or `PhononLexiconEntry[]`),
 * simple `key = value` lines, and/or inline CLI overrides (`word=spoken`).
 */
export function loadPronunciationLexicon(opts?: {
  lexiconPath?: string;
  inlineEntries?: string[] | Record<string, string> | PhononLexiconEntry[];
  cwd?: string;
  includeBuiltins?: boolean;
}): PhononLexiconEntry[] {
  const map = new Map<string, PhononLexiconEntry>();

  if (opts?.includeBuiltins) {
    for (const e of BUILTIN_TECH_LEXICON) {
      map.set(e.display.toLowerCase(), { ...e });
    }
  }

  const parseContent = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (
            item &&
            typeof item.display === "string" &&
            typeof item.spoken === "string"
          ) {
            map.set(item.display.toLowerCase(), {
              display: item.display.trim(),
              spoken: item.spoken.trim(),
              caseSensitive: Boolean(item.caseSensitive),
            });
          }
        }
      } else if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string" && k.trim() && v.trim()) {
            map.set(k.trim().toLowerCase(), {
              display: k.trim(),
              spoken: v.trim(),
            });
          }
        }
      }
      return;
    }

    for (const line of trimmed.split(/\r?\n/)) {
      const clean = line.trim();
      if (!clean || clean.startsWith("#") || clean.startsWith("//")) continue;
      const eq = clean.indexOf("=");
      if (eq > 0) {
        const display = clean
          .slice(0, eq)
          .trim()
          .replace(/^["']|["']$/g, "");
        const spoken = clean
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (display && spoken) {
          map.set(display.toLowerCase(), { display, spoken });
        }
      }
    }
  };

  // Auto-discover `.ttsdict.json` in cwd if no explicit path provided
  const candidatePath = opts?.lexiconPath?.trim()
    ? nodePath.resolve(opts.cwd || process.cwd(), opts.lexiconPath.trim())
    : opts?.cwd && existsSync(nodePath.join(opts.cwd, ".ttsdict.json"))
      ? nodePath.join(opts.cwd, ".ttsdict.json")
      : "";

  if (candidatePath && existsSync(candidatePath)) {
    try {
      parseContent(readFileSync(candidatePath, "utf8"));
    } catch {}
  }

  const inline = opts?.inlineEntries;
  if (Array.isArray(inline)) {
    for (const item of inline) {
      if (typeof item === "string") {
        const eq = item.indexOf("=");
        if (eq > 0) {
          const display = item.slice(0, eq).trim();
          const spoken = item.slice(eq + 1).trim();
          if (display && spoken) {
            map.set(display.toLowerCase(), { display, spoken });
          }
        }
      } else if (item && typeof item === "object" && "display" in item) {
        map.set(item.display.toLowerCase(), { ...item });
      }
    }
  } else if (inline && typeof inline === "object") {
    for (const [k, v] of Object.entries(inline)) {
      if (typeof v === "string" && k.trim() && v.trim()) {
        map.set(k.trim().toLowerCase(), {
          display: k.trim(),
          spoken: v.trim(),
        });
      }
    }
  }

  return [...map.values()];
}

/**
 * Applies a Dual-Track Pronunciation Lexicon to a text chunk:
 *  - Produces `spokenText` (phonetic respellings sent to TTS)
 *  - Tracks exact word-span indices (`spans`) so `remapWordsToDisplayLexicon` restores the original
 *    visual spelling (e.g., `"SQLite"`, `"kubectl"`) in `.srt`, `.vtt`, `.ass`, and Read-Along MP4 slides!
 */
export function applyDualTrackLexicon(
  text: string,
  lexicon: PhononLexiconEntry[],
): DualTrackLexiconResult {
  if (!text || lexicon.length === 0) {
    return {
      spokenText: text,
      displayText: text,
      replacementsApplied: 0,
      spans: [],
    };
  }

  // Build sorted lookup (longest display terms first)
  const sorted = [...lexicon].filter(
    (e) => e.display.trim().length > 0 && e.spoken.trim().length > 0,
  );
  sorted.sort((a, b) => b.display.length - a.display.length);

  // Tokenize by whitespace to maintain exact 1-to-N word-alignment spans
  const parts = text.split(/(\s+)/);
  const spokenParts: string[] = [];
  const spans: DualTrackWordSpan[] = [];
  let spokenTokenIdx = 0;
  let replacementsApplied = 0;

  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      spokenParts.push(part);
      continue;
    }

    // Separate leading/trailing punctuation from core word token
    const m = part.match(
      /^([("'[\u2018\u201C]*)(.+?)([)"'\].,;:!?…\u2019\u201D]*)$/,
    );
    if (!m) {
      spokenParts.push(part);
      spokenTokenIdx += 1;
      continue;
    }
    const leadPunct = m[1] ?? "";
    const core = m[2] ?? "";
    const tailPunct = m[3] ?? "";

    const matched = sorted.find((entry) =>
      entry.caseSensitive
        ? entry.display === core
        : entry.display.toLowerCase() === core.toLowerCase(),
    );

    if (!matched) {
      spokenParts.push(part);
      spokenTokenIdx += 1;
      continue;
    }

    const spokenWords = matched.spoken.trim().split(/\s+/).filter(Boolean);
    if (spokenWords.length === 0) {
      spokenParts.push(part);
      spokenTokenIdx += 1;
      continue;
    }

    spokenWords[0] = `${leadPunct}${spokenWords[0]}`;
    spokenWords[spokenWords.length - 1] =
      `${spokenWords[spokenWords.length - 1]}${tailPunct}`;

    spans.push({
      spokenTokenStart: spokenTokenIdx,
      spokenTokenCount: spokenWords.length,
      displayToken: part,
    });
    spokenParts.push(spokenWords.join(" "));
    spokenTokenIdx += spokenWords.length;
    replacementsApplied++;
  }

  return {
    spokenText: spokenParts.join(""),
    displayText: text,
    replacementsApplied,
    spans,
  };
}

/**
 * Collapses multi-word phonetic respelling timings back into their single original `displayToken`
 * (merging `startMs` of the first phonetic word and `endMs` of the last phonetic word) so
 * Read-Along MP4 slides and SRT/VTT/ASS subtitles show `"SQLite"` instead of `"sequel lite"`.
 */
export function remapWordsToDisplayLexicon<
  T extends {
    word: string;
    wordIndex: number;
    startMs: number;
    endMs: number;
    durationMs: number;
    charStart: number;
    charEnd: number;
  },
>(words: T[], spans: DualTrackWordSpan[], displayText: string): T[] {
  if (spans.length === 0 || words.length === 0) return words;

  const spanByStart = new Map<number, DualTrackWordSpan>();
  for (const sp of spans) {
    spanByStart.set(sp.spokenTokenStart, sp);
  }

  const out: T[] = [];
  let i = 0;
  let charCursor = 0;
  while (i < words.length) {
    const sp = spanByStart.get(i);
    if (sp && i + sp.spokenTokenCount <= words.length) {
      const first = words[i]!;
      const last = words[i + sp.spokenTokenCount - 1]!;
      const idxInDisplay = displayText.indexOf(sp.displayToken, charCursor);
      const charStart = idxInDisplay >= 0 ? idxInDisplay : first.charStart;
      const charEnd = charStart + sp.displayToken.length;
      charCursor = charEnd;

      out.push({
        ...first,
        word: sp.displayToken,
        wordIndex: out.length,
        startMs: first.startMs,
        endMs: last.endMs,
        durationMs: Math.max(1, last.endMs - first.startMs),
        charStart,
        charEnd,
      });
      i += sp.spokenTokenCount;
    } else {
      const cur = words[i]!;
      const idxInDisplay = displayText.indexOf(cur.word, charCursor);
      const charStart = idxInDisplay >= 0 ? idxInDisplay : cur.charStart;
      const charEnd = charStart + cur.word.length;
      if (idxInDisplay >= 0) charCursor = charEnd;
      out.push({
        ...cur,
        wordIndex: out.length,
        charStart,
        charEnd,
      });
      i++;
    }
  }
  return out;
}

/**
 * Verbatim Diff Guard for `--llm-clean`: verifies that an LLM-polished chunk preserved the author's
 * content words rather than summarizing, truncating, or hallucinating unrelated prose.
 */
export function verifyLlmCleanedFidelity(
  deterministicText: string,
  llmText: string,
  opts: { minWordRecall?: number; minLengthRatio?: number } = {},
): {
  accepted: boolean;
  wordRecall: number;
  lengthRatio: number;
  reason?: string;
} {
  const detClean = deterministicText.trim();
  const llmClean = llmText.trim();
  if (!llmClean) {
    return {
      accepted: false,
      wordRecall: 0,
      lengthRatio: 0,
      reason: "Empty LLM response",
    };
  }

  const extractWords = (s: string) =>
    (s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(Boolean);

  const detWords = extractWords(detClean);
  if (detWords.length < 10) {
    return {
      accepted: true,
      wordRecall: 1,
      lengthRatio: llmClean.length / Math.max(1, detClean.length),
    };
  }

  const llmWordSet = new Set(extractWords(llmClean));
  let hits = 0;
  for (const w of detWords) {
    if (llmWordSet.has(w)) hits++;
  }
  const wordRecall = Math.round((hits / detWords.length) * 1000) / 1000;
  const lengthRatio =
    Math.round((llmClean.length / Math.max(1, detClean.length)) * 1000) / 1000;

  const minWordRecall = opts.minWordRecall ?? 0.48;
  const minLengthRatio = opts.minLengthRatio ?? 0.35;

  if (lengthRatio < minLengthRatio) {
    return {
      accepted: false,
      wordRecall,
      lengthRatio,
      reason: `LLM truncated chunk to ${Math.round(lengthRatio * 100)}% of original length`,
    };
  }
  if (wordRecall < minWordRecall) {
    return {
      accepted: false,
      wordRecall,
      lengthRatio,
      reason: `LLM summarized or rewrote content (word recall ${Math.round(wordRecall * 100)}% < ${Math.round(minWordRecall * 100)}%)`,
    };
  }
  return { accepted: true, wordRecall, lengthRatio };
}

// ============================================================================
// 4. Inline Stage-Direction DSL, Multi-Voice Casting & Podcast Generator
// ============================================================================

const EMOTION_MODIFIERS: Record<
  PhononEmotionProfile,
  { speedMul: number; pitchDelta: number }
> = {
  neutral: { speedMul: 1.0, pitchDelta: 0 },
  calm: { speedMul: 0.93, pitchDelta: -0.5 },
  excited: { speedMul: 1.08, pitchDelta: 1.0 },
  serious: { speedMul: 0.95, pitchDelta: -1.0 },
  whisper: { speedMul: 0.91, pitchDelta: -0.5 },
};

export function getEmotionProsodyModifiers(emotion?: PhononEmotionProfile): {
  speedMul: number;
  pitchDelta: number;
} {
  if (!emotion || !(emotion in EMOTION_MODIFIERS)) {
    return EMOTION_MODIFIERS.neutral;
  }
  return EMOTION_MODIFIERS[emotion];
}

/**
 * Strips inline stage-direction tags (`[pause: 500ms]`, `[voice: Russell]`, `[speed: 0.9]`,
 * `[pitch: -1]`, `[emotion: calm]`) from display/subtitle text.
 */
export function stripStageDirectionTags(input: string): string {
  return String(input || "")
    .replace(
      /\[\s*(?:pause|break|voice|speaker|speed|rate|pitch|emotion|style|tone)\s*:\s*[^\]]+\]/gi,
      " ",
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Parses inline stage-direction tags (`[voice: Russell]`, `[pause: 600ms]`, `[speed: 0.92]`,
 * `[pitch: -1.5]`, `[emotion: calm]`) and optional multi-voice dialogue turns (`**Russell:** ...`
 * or novel quoted dialogue attribution `"..." said Silas`) into synthesis segments.
 */
export function parseStageAndDialogueSegments(
  inputText: string,
  opts: {
    defaultVoice: string;
    availableVoices?: string[];
    multiVoice?: boolean;
    castMap?: Record<string, string>;
  },
): {
  segments: StageDirectedSegment[];
  castUsed: Record<string, string>;
} {
  const defaultVoice = opts.defaultVoice || "Zoey";
  const pool =
    opts.availableVoices && opts.availableVoices.length > 0
      ? opts.availableVoices.filter((v) => v !== "default")
      : [
          "Zoey",
          "Russell",
          "Easton",
          "Freya",
          "Edwin",
          "Maeve",
          "Hugh",
          "Captain Silas Blackwater",
          "Alfie",
        ];
  const castUsed: Record<string, string> = {
    Narrator: defaultVoice,
    ...(opts.castMap ?? {}),
  };

  const FEMALE_HINT_RE =
    /\b(she|her|queen|lady|princess|duchess|sister|mother|mom|alice|sarah|elena|zoey|freya|maeve|claire|emma|olivia|sophia|aria|luna)\b/i;
  const MALE_HINT_RE =
    /\b(he|him|king|lord|prince|duke|brother|father|dad|captain|silas|russell|easton|edwin|hugh|alfie|john|marcus|david|arthur|thomas)\b/i;

  const femalePool = pool.filter((v) =>
    /^(zoey|freya|maeve|claire|ava|lily|isla|chloe|nora|hazel|ruby|stella|grace|violet)/i.test(
      v,
    ),
  );
  const malePool = pool.filter((v) =>
    /^(russell|easton|edwin|hugh|alfie|captain|arthur|owen|liam|noah|caleb|miles|felix|jasper|theo)/i.test(
      v,
    ),
  );

  let nextCastCounter = 0;
  const resolveActorVoice = (rawName: string): string => {
    const clean = rawName.trim();
    if (!clean || /^narrator$/i.test(clean)) return defaultVoice;
    // Exact match against an existing Phonon voice name
    const exactVoice = pool.find(
      (v) => v.toLowerCase() === clean.toLowerCase(),
    );
    if (exactVoice) {
      castUsed[clean] = exactVoice;
      return exactVoice;
    }
    const existingKey = Object.keys(castUsed).find(
      (k) => k.toLowerCase() === clean.toLowerCase(),
    );
    if (existingKey) return castUsed[existingKey]!;

    let candidates = pool.filter((v) => v !== defaultVoice);
    if (FEMALE_HINT_RE.test(clean) && femalePool.length > 0) {
      candidates = femalePool.filter((v) => v !== defaultVoice);
    } else if (MALE_HINT_RE.test(clean) && malePool.length > 0) {
      candidates = malePool.filter((v) => v !== defaultVoice);
    }
    if (candidates.length === 0) candidates = pool;
    const chosen =
      candidates[nextCastCounter % Math.max(1, candidates.length)] ||
      defaultVoice;
    nextCastCounter++;
    castUsed[clean] = chosen;
    return chosen;
  };

  const paragraphs = String(inputText || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments: StageDirectedSegment[] = [];
  let activeVoice = defaultVoice;
  let activeSpeed = 1.0;
  let activePitch = 0;
  let activeEmotion: PhononEmotionProfile = "neutral";

  const parsePauseValueMs = (rawVal: string): number => {
    const m = rawVal.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds?)?$/i);
    if (!m) return 300;
    const n = Number(m[1]);
    const unit = (m[2] || "ms").toLowerCase();
    return Math.min(
      5000,
      Math.max(0, Math.round(unit.startsWith("s") ? n * 1000 : n)),
    );
  };

  const emitWithInlineTags = (
    rawSegmentText: string,
    paraIdx: number,
    speakerOverride?: string,
    voiceOverride?: string,
  ) => {
    const tagRe =
      /\[\s*(pause|break|voice|speaker|speed|rate|pitch|emotion|style|tone)\s*:\s*([^\]]+)\]/gi;
    let cursor = 0;
    let pendingPauseBefore: number | undefined;
    let segVoice = voiceOverride || activeVoice;
    let segSpeaker = speakerOverride;

    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(rawSegmentText)) !== null) {
      const before = rawSegmentText.slice(cursor, match.index).trim();
      const directive = (match[1] || "").toLowerCase();
      const val = (match[2] || "").trim();

      if (directive === "pause" || directive === "break") {
        const ms = parsePauseValueMs(val);
        if (before) {
          const emoMod = getEmotionProsodyModifiers(activeEmotion);
          segments.push({
            text: before,
            displayText: before,
            voice: segVoice,
            ...(segSpeaker ? { speakerLabel: segSpeaker } : {}),
            speedMultiplier:
              Math.round(activeSpeed * emoMod.speedMul * 100) / 100,
            pitchDelta: activePitch + emoMod.pitchDelta,
            emotion: activeEmotion,
            ...(pendingPauseBefore !== undefined
              ? { pauseBeforeMs: pendingPauseBefore }
              : {}),
            pauseAfterMs: ms,
            paragraphIndex: paraIdx,
          });
          pendingPauseBefore = undefined;
        } else {
          pendingPauseBefore = (pendingPauseBefore ?? 0) + ms;
        }
      } else {
        if (before) {
          const emoMod = getEmotionProsodyModifiers(activeEmotion);
          segments.push({
            text: before,
            displayText: before,
            voice: segVoice,
            ...(segSpeaker ? { speakerLabel: segSpeaker } : {}),
            speedMultiplier:
              Math.round(activeSpeed * emoMod.speedMul * 100) / 100,
            pitchDelta: activePitch + emoMod.pitchDelta,
            emotion: activeEmotion,
            ...(pendingPauseBefore !== undefined
              ? { pauseBeforeMs: pendingPauseBefore }
              : {}),
            paragraphIndex: paraIdx,
          });
          pendingPauseBefore = undefined;
        }
        if (directive === "voice" || directive === "speaker") {
          activeVoice = resolveActorVoice(val);
          segVoice = activeVoice;
          segSpeaker = val;
        } else if (directive === "speed" || directive === "rate") {
          const sp = Number(val.replace(/x$/i, ""));
          if (isFinite(sp) && sp >= 0.5 && sp <= 2.5) activeSpeed = sp;
        } else if (directive === "pitch") {
          const pt = Number(val.replace(/st|semitones?$/i, "").trim());
          if (isFinite(pt) && pt >= -6 && pt <= 6) activePitch = pt;
        } else if (
          directive === "emotion" ||
          directive === "style" ||
          directive === "tone"
        ) {
          const low = val.toLowerCase() as PhononEmotionProfile;
          if ((PHONON_EMOTION_PROFILES as readonly string[]).includes(low)) {
            activeEmotion = low;
          }
        }
      }
      cursor = match.index + match[0].length;
    }

    const tail = rawSegmentText.slice(cursor).trim();
    if (tail) {
      const emoMod = getEmotionProsodyModifiers(activeEmotion);
      segments.push({
        text: tail,
        displayText: tail,
        voice: segVoice,
        ...(segSpeaker ? { speakerLabel: segSpeaker } : {}),
        speedMultiplier: Math.round(activeSpeed * emoMod.speedMul * 100) / 100,
        pitchDelta: activePitch + emoMod.pitchDelta,
        emotion: activeEmotion,
        ...(pendingPauseBefore !== undefined
          ? { pauseBeforeMs: pendingPauseBefore }
          : {}),
        paragraphIndex: paraIdx,
      });
    }
  };

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx]!;

    if (opts.multiVoice) {
      // 1. Check line-by-line script turns (`**Zoey:** Hello`, `**Zoey**: Hello`, or `Russell: Welcome`)
      const lines = para.split("\n");
      const scriptTurnRe =
        /^(?:\*\*|__)?\[?([A-Z][A-Za-z0-9 _.-]{1,28})\]?(?:\*\*|__)?\s*:(?:\*\*|__)?\s+(.+)$/;
      if (lines.some((l) => scriptTurnRe.test(l.trim()))) {
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          const m = trimmedLine.match(scriptTurnRe);
          if (m && !/^https?$/i.test(m[1]!)) {
            const speaker = m[1]!.trim();
            const spokenLine = m[2]!.trim();
            const actorVoice = resolveActorVoice(speaker);
            emitWithInlineTags(spokenLine, pIdx, speaker, actorVoice);
          } else {
            emitWithInlineTags(trimmedLine, pIdx);
          }
        }
        continue;
      }

      // 2. Check novel quoted dialogue attribution: `"We must hurry," said Silas.`
      const attribMatch = para.match(
        /^[""\u201C]([^""\u201D]{4,400})[""\u201D]\s*(?:said|asked|replied|whispered|shouted|murmured|called|answered|exclaimed|growled|laughed)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)([.,!?;:][\s\S]*)?$/,
      );
      if (attribMatch) {
        const quoteBody = attribMatch[1]!.trim();
        const character = attribMatch[2]!.trim();
        const restNarration = para.slice(quoteBody.length + 2).trim();
        const charVoice = resolveActorVoice(character);
        emitWithInlineTags(quoteBody, pIdx, character, charVoice);
        if (restNarration) {
          emitWithInlineTags(restNarration, pIdx, "Narrator", defaultVoice);
        }
        continue;
      }
    }

    emitWithInlineTags(para, pIdx);
  }

  return { segments, castUsed };
}

/**
 * Generates a natural 2-host conversational podcast script from any cleaned document text.
 * Uses an installed Ollama text LLM when available, and falls back deterministically to an
 * intelligent 2-host structured breakdown when offline or when no text LLM is installed.
 */
export async function generatePodcastScriptFromDocument(params: {
  cleanedText?: string;
  sourceText?: string;
  title?: string;
  hostAVoice?: string;
  hostBVoice?: string;
  hostA?: { name?: string; voice?: string; pan?: number };
  hostB?: { name?: string; voice?: string; pan?: number };
  targetTurns?: number;
  ollamaBaseUrl?: string;
  llmModel?: string | null;
}): Promise<{
  turns: PodcastDialogueTurn[];
  usedLlm: boolean;
  modelUsed: string | null;
  scriptMarkdown: string;
  transcriptMarkdown: string;
}> {
  const hostAVoice =
    params.hostA?.voice?.trim() || params.hostAVoice?.trim() || "Zoey";
  const hostBVoice =
    params.hostB?.voice?.trim() || params.hostBVoice?.trim() || "Russell";
  const hostAName = params.hostA?.name?.trim() || hostAVoice;
  const hostBName = params.hostB?.name?.trim() || hostBVoice;
  const panA = typeof params.hostA?.pan === "number" ? params.hostA.pan : -0.18;
  const panB = typeof params.hostB?.pan === "number" ? params.hostB.pan : 0.18;
  const targetTurns = Math.min(36, Math.max(4, params.targetTurns ?? 8));
  const docTitle = params.title?.trim() || "Deep Dive Briefing";
  const rawSource = params.cleanedText ?? params.sourceText ?? "";
  const sourceExcerpt = rawSource.trim().slice(0, 9000);

  const parseScriptLines = (raw: string): PodcastDialogueTurn[] => {
    const out: PodcastDialogueTurn[] = [];
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const m = line
        .trim()
        .match(
          /^(?:\*\*|__)?([A-Za-z0-9 _-]{2,30})(?:\*\*|__)?\s*:(?:\*\*|__)?\s+(.+)$/,
        );
      if (!m) continue;
      const rawSpeaker = m[1]!.trim();
      const body = stripStageDirectionTags(m[2]!.trim()).replace(
        /^[""]|[""]$/g,
        "",
      );
      if (!body || body.length < 3) continue;
      const isB =
        rawSpeaker.toLowerCase() === hostBVoice.toLowerCase() ||
        rawSpeaker.toLowerCase() === hostBName.toLowerCase() ||
        /\bhost\s*2|host\s*b\b/i.test(rawSpeaker);
      out.push({
        speaker: isB ? hostBName : hostAName,
        voice: isB ? hostBVoice : hostAVoice,
        text: body,
        pan: isB ? panB : panA,
      });
    }
    return out;
  };

  if (params.llmModel && params.ollamaBaseUrl) {
    try {
      const prompt = [
        `Convert the following document titled "${docTitle}" into a lively, natural ${targetTurns}-turn podcast conversation between two hosts named ${hostAName} and ${hostBName}.`,
        `Rules:`,
        `- Format EVERY line strictly as "${hostAName}: <spoken dialogue>" or "${hostBName}: <spoken dialogue>".`,
        `- Sound natural, curious, insightful, and conversational—avoid robotic bullet lists or stage directions.`,
        `- Cover the core insights accurately without inventing facts.`,
        ``,
        `Document:`,
        sourceExcerpt,
      ].join("\n");

      const res = await fetch(
        `${params.ollamaBaseUrl.replace(/\/+$/, "")}/api/generate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: params.llmModel,
            prompt,
            stream: false,
            options: { temperature: 0.45 },
          }),
          signal: AbortSignal.timeout(45_000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { response?: string };
        const cleanedResp = String(data.response || "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .trim();
        const turns = parseScriptLines(cleanedResp);
        if (turns.length >= 3) {
          const scriptMarkdown = turns
            .map((t) => `${t.speaker}: ${t.text}`)
            .join("\n\n");
          return {
            turns,
            usedLlm: true,
            modelUsed: params.llmModel,
            scriptMarkdown,
            transcriptMarkdown: scriptMarkdown,
          };
        }
      }
    } catch {
      // Fall back to deterministic 2-host podcast script builder
    }
  }

  // Deterministic 2-Host Conversational Script Builder (100% offline/CI reliable)
  const sentences = sourceExcerpt
    .replace(
      /(?:^|\n)\s*(?:\*\*|__)?\[?[A-Z][A-Za-z0-9 _.-]{1,24}\]?(?:\*\*|__)?\s*:(?:\*\*|__)?\s+/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => stripStageDirectionTags(s).trim())
    .filter((s) => s.length >= 18);

  const turns: PodcastDialogueTurn[] = [];
  turns.push({
    speaker: hostAName,
    voice: hostAVoice,
    text: `Welcome back! Today we are diving into ${docTitle}, and there is a lot to unpack here.`,
    pan: panA,
  });

  if (sentences.length === 0) {
    const fallbackBody = sourceExcerpt || docTitle;
    turns.push({
      speaker: hostBName,
      voice: hostBVoice,
      text: `Glad to be here, ${hostAName}. Here is the core takeaway: ${fallbackBody}`,
      pan: panB,
    });
  } else {
    const maxMidTurns = Math.max(2, targetTurns - 2);
    const groupSize = Math.max(1, Math.ceil(sentences.length / maxMidTurns));
    const leadInsA = [
      "What really stood out to me next is this:",
      "Building on that point,",
      "And look at how that connects here:",
      "Another key detail worth highlighting:",
    ];
    const leadInsB = [
      `Right, ${hostAName}, and to put that in context:`,
      "Exactly. Listen to this part:",
      "That brings us straight to the next takeaway:",
      "Spot on. Here is what makes it work:",
    ];

    let groupIdx = 0;
    for (
      let i = 0;
      i < sentences.length && turns.length < targetTurns - 1;
      i += groupSize
    ) {
      const slice = sentences.slice(i, i + groupSize).join(" ");
      const isHostB = groupIdx % 2 === 0;
      const lead = isHostB
        ? leadInsB[(groupIdx >> 1) % leadInsB.length]!
        : leadInsA[(groupIdx >> 1) % leadInsA.length]!;
      turns.push({
        speaker: isHostB ? hostBName : hostAName,
        voice: isHostB ? hostBVoice : hostAVoice,
        text: `${lead} ${slice}`,
        pan: isHostB ? panB : panA,
      });
      groupIdx++;
    }
  }

  const lastIsB = turns[turns.length - 1]?.voice === hostBVoice;
  turns.push({
    speaker: lastIsB ? hostAName : hostBName,
    voice: lastIsB ? hostAVoice : hostBVoice,
    text: `That wraps up our breakdown of ${docTitle}. Thanks for listening, and catch you in the next episode!`,
    pan: lastIsB ? panA : panB,
  });

  const scriptMarkdown = turns
    .map((t) => `${t.speaker}: ${t.text}`)
    .join("\n\n");
  return {
    turns,
    usedLlm: false,
    modelUsed: null,
    scriptMarkdown,
    transcriptMarkdown: scriptMarkdown,
  };
}

// ============================================================================
// 5. True Single-File `.M4B` Chaptered Audiobook Metadata & Cover Art
// ============================================================================

export function escapeFfmetadataValue(val: string): string {
  return String(val || "")
    .replace(/\\/g, "\\\\")
    .replace(/=/g, "\\=")
    .replace(/;/g, "\\;")
    .replace(/#/g, "\\#")
    .replace(/\r\n?|\n/g, "\\n");
}

/**
 * Generates an FFmpeg `FFMETADATA1` manifest with audiobook tags (`title`, `artist`, `album`,
 * `composer`, `genre=Audiobook`, optional synced LRC lyrics) and exact millisecond `[CHAPTER]` markers.
 */
export function buildFfmetadataChapters(params: {
  bookTitle: string;
  author?: string;
  narratorVoice: string;
  chapters: M4bChapterSpec[];
  syncedLyricsLrc?: string;
}): string {
  const lines: string[] = [
    ";FFMETADATA1",
    `title=${escapeFfmetadataValue(params.bookTitle)}`,
    `album=${escapeFfmetadataValue(params.bookTitle)}`,
    `artist=${escapeFfmetadataValue(params.author || "Phonon Audiobook Studio")}`,
    `composer=${escapeFfmetadataValue(`Narrated by ${params.narratorVoice}`)}`,
    "genre=Audiobook",
    "media_type=2",
  ];

  if (params.syncedLyricsLrc) {
    lines.push(`lyrics-eng=${escapeFfmetadataValue(params.syncedLyricsLrc)}`);
  }

  for (const ch of params.chapters) {
    const startMs = Math.max(0, Math.round(ch.startMs));
    const endMs = Math.max(startMs + 50, Math.round(ch.endMs));
    lines.push(
      "",
      "[CHAPTER]",
      "TIMEBASE=1/1000",
      `START=${startMs}`,
      `END=${endMs}`,
      `title=${escapeFfmetadataValue(ch.title || `Chapter ${ch.number}`)}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Generates a clean 600x600 24-bit uncompressed BMP audiobook cover art image (zero external libraries
 * required, natively accepted by FFmpeg `-disposition:v attached_pic` with `-c:v mjpeg` or `png` on all OSes).
 */
export function generateAudiobookCoverBmp(params: {
  title: string;
  voice: string;
  width?: number;
  height?: number;
}): Buffer {
  const width = params.width ?? 600;
  const height = params.height ?? 600;
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowStride * height;
  const fileSize = 54 + pixelBytes;
  const buf = Buffer.alloc(fileSize);

  // BMP File Header (14 bytes) + DIB BITMAPINFOHEADER (40 bytes)
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelBytes, 34);

  // Rich midnight-indigo gradient + gold/cyan geometric framing bar
  const titleHash = createHash("md5")
    .update(`${params.title}:${params.voice}`)
    .digest();
  const accentR = 70 + (titleHash[0]! % 150);
  const accentG = 130 + (titleHash[1]! % 110);
  const accentB = 200 + (titleHash[2]! % 55);

  for (let y = 0; y < height; y++) {
    const vFrac = 1 - y / Math.max(1, height - 1);
    const rowOff = 54 + y * rowStride;
    for (let x = 0; x < width; x++) {
      const hFrac = x / Math.max(1, width - 1);
      const isBorder = x < 24 || x >= width - 24 || y < 24 || y >= height - 24;
      const isInnerFrame =
        (x >= 38 && x <= 42 && y >= 38 && y <= height - 38) ||
        (x >= width - 42 && x <= width - 38 && y >= 38 && y <= height - 38) ||
        (y >= 38 && y <= 42 && x >= 38 && x <= width - 38) ||
        (y >= height - 42 && y <= height - 38 && x >= 38 && x <= width - 38);
      const isAccentBand =
        y >= Math.floor(height * 0.46) &&
        y <= Math.floor(height * 0.54) &&
        x >= 80 &&
        x <= width - 80;

      let r = Math.round(14 + vFrac * 22 + hFrac * 12);
      let g = Math.round(18 + vFrac * 30 + hFrac * 18);
      let b = Math.round(34 + vFrac * 52 + hFrac * 24);

      if (isBorder) {
        r = 10;
        g = 12;
        b = 24;
      } else if (isInnerFrame || isAccentBand) {
        r = accentR;
        g = accentG;
        b = accentB;
      }

      const px = rowOff + x * 3;
      buf[px] = b;
      buf[px + 1] = g;
      buf[px + 2] = r;
    }
  }
  return buf;
}

/**
 * Extracts an embedded cover image (`cover.jpg`, `cover.jpeg`, `cover.png`) directly from an `.epub`
 * ZIP archive using `node:zlib` without requiring an external `unzip` binary.
 */
export function extractCoverFromEpubArchive(
  epubPath: string,
): { ext: string; data: Buffer } | null {
  try {
    const zipBuf = readFileSync(epubPath);
    if (zipBuf.length < 64 || zipBuf.readUInt32LE(0) !== 0x04034b50) {
      return null;
    }
    // Locate End of Central Directory (EOCD: 0x06054b50)
    let eocdPos = -1;
    const minPos = Math.max(0, zipBuf.length - 65557);
    for (let i = zipBuf.length - 22; i >= minPos; i--) {
      if (zipBuf.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    if (eocdPos < 0) return null;

    const totalEntries = zipBuf.readUInt16LE(eocdPos + 10);
    const cdOffset = zipBuf.readUInt32LE(eocdPos + 16);
    let ptr = cdOffset;
    let bestEntry: {
      name: string;
      method: number;
      compSize: number;
      localOffset: number;
      score: number;
    } | null = null;

    for (let e = 0; e < totalEntries && ptr + 46 <= zipBuf.length; e++) {
      if (zipBuf.readUInt32LE(ptr) !== 0x02014b50) break;
      const method = zipBuf.readUInt16LE(ptr + 10);
      const compSize = zipBuf.readUInt32LE(ptr + 20);
      const uncompSize = zipBuf.readUInt32LE(ptr + 24);
      const nameLen = zipBuf.readUInt16LE(ptr + 28);
      const extraLen = zipBuf.readUInt16LE(ptr + 30);
      const commentLen = zipBuf.readUInt16LE(ptr + 32);
      const localOffset = zipBuf.readUInt32LE(ptr + 42);
      const name = zipBuf
        .subarray(ptr + 46, ptr + 46 + nameLen)
        .toString("utf8");
      ptr += 46 + nameLen + extraLen + commentLen;

      if (
        /\.(jpe?g|png)$/i.test(name) &&
        uncompSize > 512 &&
        uncompSize < 15 * 1024 * 1024 &&
        (method === 0 || method === 8)
      ) {
        const base = nodePath.basename(name).toLowerCase();
        const score = /^cover\.(jpe?g|png)$/.test(base)
          ? 100
          : base.includes("cover")
            ? 80
            : name.toLowerCase().includes("cover")
              ? 60
              : 10;
        if (!bestEntry || score > bestEntry.score) {
          bestEntry = { name, method, compSize, localOffset, score };
        }
      }
    }

    if (!bestEntry || bestEntry.score < 50) return null;
    const loc = bestEntry.localOffset;
    if (loc + 30 > zipBuf.length || zipBuf.readUInt32LE(loc) !== 0x04034b50) {
      return null;
    }
    const locNameLen = zipBuf.readUInt16LE(loc + 26);
    const locExtraLen = zipBuf.readUInt16LE(loc + 28);
    const dataStart = loc + 30 + locNameLen + locExtraLen;
    const compSlice = zipBuf.subarray(
      dataStart,
      dataStart + bestEntry.compSize,
    );
    const data =
      bestEntry.method === 0
        ? Buffer.from(compSlice)
        : inflateRawSync(compSlice);
    const ext = /\.png$/i.test(bestEntry.name) ? "png" : "jpg";
    return { ext, data };
  } catch {
    return null;
  }
}

/**
 * Attempts to extract cover art from a source `.epub` archive, locate a companion cover image
 * (`cover.jpg`, `cover.png`, `<stem>.jpg`), or generate a crisp studio cover BMP when none exists.
 */
export async function resolveOrCreateAudiobookCoverFile(params: {
  sourceFilePath?: string;
  tmpDir: string;
  bookTitle: string;
  voice: string;
}): Promise<string> {
  if (params.sourceFilePath) {
    if (
      /\.(epub|ibooks)$/i.test(params.sourceFilePath) &&
      existsSync(params.sourceFilePath)
    ) {
      const epubCover = extractCoverFromEpubArchive(params.sourceFilePath);
      if (epubCover) {
        const outCover = nodePath.join(
          params.tmpDir,
          `epub-cover.${epubCover.ext}`,
        );
        await fsp.writeFile(outCover, epubCover.data);
        return outCover;
      }
    }

    const dir = nodePath.dirname(params.sourceFilePath);
    const stem = nodePath.basename(
      params.sourceFilePath,
      nodePath.extname(params.sourceFilePath),
    );
    const candidates = [
      nodePath.join(dir, `${stem}.jpg`),
      nodePath.join(dir, `${stem}.png`),
      nodePath.join(dir, "cover.jpg"),
      nodePath.join(dir, "cover.jpeg"),
      nodePath.join(dir, "cover.png"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  }

  const coverPath = nodePath.join(params.tmpDir, "cover.bmp");
  const bmpBuf = generateAudiobookCoverBmp({
    title: params.bookTitle,
    voice: params.voice,
  });
  await fsp.writeFile(coverPath, bmpBuf);
  return coverPath;
}

// ============================================================================
// 6. Crash-Resumable Disk Checkpointing (`--resume`)
// ============================================================================

let ckptTmpNonce = 0;

export class PhononDiskCheckpoint {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(this.dir, { recursive: true });
  }

  chunkKey(voice: string, text: string, speed = 1, pitch = 0): string {
    return createHash("sha256")
      .update(`ckpt-v1\0${voice}\0${speed}\0${pitch}\0${text}`)
      .digest("hex")
      .slice(0, 28);
  }

  async loadChunkWav(key: string): Promise<Buffer | null> {
    const p = nodePath.join(this.dir, `${key}.wav`);
    if (!existsSync(p)) return null;
    try {
      const buf = await fsp.readFile(p);
      if (
        buf.length > 44 &&
        buf.subarray(0, 4).toString("ascii") === "RIFF" &&
        buf.subarray(8, 12).toString("ascii") === "WAVE"
      ) {
        const riffChunkSize = buf.readUInt32LE(4);
        if (
          riffChunkSize === 0xffffffff ||
          (buf.length >= Math.min(riffChunkSize + 8, 46) &&
            buf.length >= riffChunkSize + 8)
        ) {
          return buf;
        }
      }
    } catch {}
    return null;
  }

  async saveChunkWav(key: string, wavBuf: Buffer): Promise<void> {
    const p = nodePath.join(this.dir, `${key}.wav`);
    const tmp = `${p}.tmp-${process.pid}-${++ckptTmpNonce}-${Date.now().toString(36)}`;
    try {
      await fsp.writeFile(tmp, wavBuf);
      await fsp.rename(tmp, p);
    } catch {
      await fsp.rm(tmp, { force: true }).catch(() => {});
    }
  }

  async cleanup(): Promise<void> {
    await fsp.rm(this.dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ============================================================================
// 7. Closed-Loop QA Verification, Fast-Start Clause Split, Cloning & Flux
// ============================================================================

/**
 * Verifies a synthesized chunk's acoustic integrity (`--verify`):
 *  - Detects empty/dead-air failures, severe digital clipping bursts, runaway AR babble loops,
 *    and truncated/dropped speech relative to character count.
 */
export function verifySynthesizedChunkPcm(
  pcmData: Buffer,
  sampleRate: number,
  expectedSpokenText: string,
): ChunkVerificationReport {
  const numSamples = Math.floor(pcmData.length / 2);
  const durationSec =
    sampleRate > 0 ? Math.round((numSamples / sampleRate) * 1000) / 1000 : 0;
  const alphaChars = (expectedSpokenText.match(/[\p{L}\p{N}]/gu) ?? []).length;

  if (alphaChars === 0) {
    return {
      ok: true,
      durationSec,
      charsPerSec: 0,
      peakDbfs: -120,
      speechRatio: 0,
    };
  }

  if (durationSec < 0.08) {
    return {
      ok: false,
      reason: `Chunk audio too short (${durationSec}s for ${alphaChars} alphanumeric chars)`,
      durationSec,
      charsPerSec: alphaChars / Math.max(0.001, durationSec),
      peakDbfs: -120,
      speechRatio: 0,
    };
  }

  let peak = 0;
  let clippedSamples = 0;
  const winLen = Math.min(
    Math.max(1, numSamples),
    Math.max(1, Math.round(sampleRate * 0.02)),
  );
  const numWins = Math.max(1, Math.floor(numSamples / winLen));
  let activeWins = 0;

  for (let i = 0; i < numSamples; i++) {
    const a = Math.abs(pcmData.readInt16LE(i * 2)) / 32768;
    if (a > peak) peak = a;
    if (a >= 0.998) clippedSamples++;
  }

  const gate = Math.max(0.003, peak * 0.05);
  for (let w = 0; w < numWins; w++) {
    let sq = 0;
    let cnt = 0;
    const base = w * winLen;
    for (let j = 0; j < winLen; j++) {
      const byteOff = (base + j) * 2;
      if (byteOff + 2 > pcmData.length) break;
      const a = pcmData.readInt16LE(byteOff) / 32768;
      sq += a * a;
      cnt++;
    }
    if (cnt > 0 && Math.sqrt(sq / cnt) >= gate) activeWins++;
  }

  const peakDbfs = linearToDb(peak);
  const speechRatio = Math.round((activeWins / numWins) * 1000) / 1000;
  const charsPerSec =
    Math.round((alphaChars / Math.max(0.05, durationSec)) * 100) / 100;

  if (peak < 0.002) {
    return {
      ok: false,
      reason: "Synthesized chunk contains only dead air / silence",
      durationSec,
      charsPerSec,
      peakDbfs,
      speechRatio,
    };
  }

  if (clippedSamples / Math.max(1, numSamples) > 0.12) {
    return {
      ok: false,
      reason: "Severe vocoder clipping distortion detected",
      durationSec,
      charsPerSec,
      peakDbfs,
      speechRatio,
    };
  }

  // Runaway babble loop check: e.g. >12s of audio for a tiny phrase (< 1.2 chars/sec)
  if (alphaChars >= 2 && durationSec > 12 && charsPerSec < 1.2) {
    return {
      ok: false,
      reason: `Runaway babble duration detected (${durationSec}s for ${alphaChars} chars)`,
      durationSec,
      charsPerSec,
      peakDbfs,
      speechRatio,
    };
  }

  // Truncated/dropped tail check: >40 alphanumeric chars spoken faster than 48 chars/sec (~600 WPM)
  if (alphaChars >= 40 && charsPerSec > 48) {
    return {
      ok: false,
      reason: `Truncated speech detected (${charsPerSec} chars/sec suggests dropped words)`,
      durationSec,
      charsPerSec,
      peakDbfs,
      speechRatio,
    };
  }

  return {
    ok: true,
    durationSec,
    charsPerSec,
    peakDbfs,
    speechRatio,
  };
}

/**
 * Splits an opening text chunk into a short lead clause (35–85 chars) plus remainder so live `speak`
 * playback achieves `<250 ms` Time-to-First-Audio (TTFA) while background chunks prefetch concurrently.
 */
export function splitFirstClauseForFastStart(
  text: string,
  targetMaxLeadChars = 85,
): [string, string] | [string] {
  const trimmed = text.trim();
  if (trimmed.length <= targetMaxLeadChars) return [trimmed];

  // Prefer punctuation clause break between char 14 and targetMaxLeadChars
  for (
    let i = 14;
    i <= Math.min(trimmed.length - 12, targetMaxLeadChars);
    i++
  ) {
    const ch = trimmed[i];
    const next = trimmed[i + 1] ?? "";
    if (
      (ch === "," ||
        ch === ";" ||
        ch === ":" ||
        ch === "." ||
        ch === "!" ||
        ch === "?" ||
        ch === "—") &&
      /\s/.test(next)
    ) {
      if (ch === "." && isAbbreviationOrInitialBeforePeriod(trimmed, i)) {
        continue;
      }
      const head = trimmed.slice(0, i + 1).trim();
      const rest = trimmed.slice(i + 1).trim();
      if (head && rest) return [head, rest];
    }
  }

  // Fallback: split before a natural subordinate conjunction between chars 26 and targetMaxLeadChars
  const windowSlice = trimmed.slice(
    26,
    Math.min(trimmed.length - 12, targetMaxLeadChars),
  );
  const conjMatch =
    /\s+(?:where|while|which|because|although|though|after|before|unless|whereas|when|so that)\s+/i.exec(
      windowSlice,
    );
  if (conjMatch && conjMatch.index >= 0) {
    const splitPos = 26 + conjMatch.index;
    const head = trimmed.slice(0, splitPos).trim();
    const rest = trimmed.slice(splitPos).trim();
    if (head.length >= 18 && rest.length >= 12) return [head, rest];
  }

  return [trimmed];
}

/**
 * Conditions a voice cloning reference recording (`--clone-voice`):
 *  - When a clip exceeds `maxTargetSec` (e.g. >11s, where zero-shot F5-TTS degrades or leaks prompt words),
 *    slides a `9.0s` window to select the highest-SNR, continuously voiced speech span without long dead-air gaps.
 *  - Applies soft downward noise-gate expansion on quiet background hiss windows.
 */
export function selectOptimalCloningWindowPcm(
  pcm24k: Buffer,
  sampleRate = 24000,
  targetSec = 9.0,
  maxBeforeSliceSec = 11.5,
): Buffer {
  const numSamples = Math.floor(pcm24k.length / 2);
  const totalSec = numSamples / Math.max(1, sampleRate);
  if (totalSec <= maxBeforeSliceSec) return pcm24k;

  const winSamples = Math.round(sampleRate * 0.25); // 250ms analysis hops
  const numWins = Math.floor(numSamples / winSamples);
  const targetWins = Math.max(4, Math.round(targetSec / 0.25));
  if (numWins <= targetWins) return pcm24k;

  const winRms = new Float64Array(numWins);
  let maxRms = 0;
  for (let w = 0; w < numWins; w++) {
    let sq = 0;
    const base = w * winSamples;
    for (let j = 0; j < winSamples; j++) {
      const s = pcm24k.readInt16LE((base + j) * 2) / 32768;
      sq += s * s;
    }
    const r = Math.sqrt(sq / winSamples);
    winRms[w] = r;
    if (r > maxRms) maxRms = r;
  }

  const activeThresh = Math.max(0.01, maxRms * 0.12);
  let bestStartW = 0;
  let bestScore = -Infinity;

  for (let w = 0; w <= numWins - targetWins; w++) {
    let activeCount = 0;
    let energySum = 0;
    let clippedPenalty = 0;
    for (let k = 0; k < targetWins; k++) {
      const r = winRms[w + k]!;
      energySum += r;
      if (r >= activeThresh) activeCount++;
      if (r > 0.7) clippedPenalty += 0.5;
    }
    // Prefer ~75–92% voiced density (steady speech with natural short breaths, no multi-second dead air)
    const density = activeCount / targetWins;
    const densityScore = 1 - Math.abs(density - 0.84) * 2.2;
    const score =
      densityScore * 3.0 + (energySum / targetWins) * 2.0 - clippedPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestStartW = w;
    }
  }

  const startByte = bestStartW * winSamples * 2;
  const endByte = Math.min(
    pcm24k.length,
    (bestStartW + targetWins) * winSamples * 2,
  );
  return masterChunkSeamPcm(pcm24k.subarray(startByte, endByte), sampleRate, {
    trimSilence: true,
    padMs: 80,
    fadeMs: 12,
  }).pcmData;
}

/**
 * Computes normalized per-frame Spectral Flux (`[0..1]`) across 10ms speech frames by measuring
 * frame-to-frame changes in Zero-Crossing Rate (ZCR) and high-frequency-to-broadband energy ratio.
 * Spikes on vowel-to-glide and formant transitions (e.g. *"we were all away"*) where amplitude stays flat!
 */
export function computeFrameSpectralFlux(
  pcmData: Buffer,
  frameSamples: number,
  numFrames: number,
): Float64Array {
  const flux = new Float64Array(Math.max(0, numFrames));
  if (numFrames <= 1 || frameSamples < 8 || pcmData.length < 4) return flux;

  const zcr = new Float64Array(numFrames);
  const hfRatio = new Float64Array(numFrames);

  for (let f = 0; f < numFrames; f++) {
    const base = f * frameSamples;
    if (base * 2 + 2 > pcmData.length) break;
    let crossings = 0;
    let bbSq = 0;
    let diffSq = 0;
    let validSamples = 0;
    let prev = pcmData.readInt16LE(base * 2) / 32768;
    for (let j = 1; j < frameSamples; j++) {
      const idx = (base + j) * 2;
      if (idx + 2 > pcmData.length) break;
      const cur = pcmData.readInt16LE(idx) / 32768;
      if ((cur >= 0 && prev < 0) || (cur < 0 && prev >= 0)) crossings++;
      bbSq += cur * cur;
      const d = cur - prev;
      diffSq += d * d;
      prev = cur;
      validSamples++;
    }
    zcr[f] = validSamples > 0 ? crossings / validSamples : 0;
    hfRatio[f] = bbSq > 1e-7 ? Math.min(4, Math.sqrt(diffSq / bbSq)) : 0;
  }

  let maxRaw = 1e-6;
  for (let f = 1; f < numFrames; f++) {
    const dZcr = Math.abs(zcr[f]! - zcr[f - 1]!);
    const dHf = Math.abs(hfRatio[f]! - hfRatio[f - 1]!);
    const raw = dZcr * 1.8 + dHf * 0.65;
    flux[f] = raw;
    if (raw > maxRaw) maxRaw = raw;
  }
  for (let f = 0; f < numFrames; f++) {
    flux[f] = flux[f]! / maxRaw;
  }
  return flux;
}

/**
 * Stereo-linked broadcast/podcast mastering chain for 2-channel interleaved 16-bit PCM:
 * Masters overall stereo RMS to the target preset (`podcast`: `-16.5 dBFS`) while preserving
 * exact Left/Right constant-power panning balance between podcast hosts!
 */
export function applyMasterChainStereoPcm(
  stereoPcm: Buffer,
  sampleRate = 24000,
  preset: PhononMasterPreset = "podcast",
): Buffer {
  if (preset === "none") return stereoPcm;
  const numFrames = Math.floor(stereoPcm.length / 4);
  if (numFrames < 64) return stereoPcm;

  const targetRmsDb =
    preset === "acx" ? -20.0 : preset === "broadcast" ? -23.0 : -16.5;
  const ceilingDb = preset === "acx" ? -3.2 : -1.5;
  const ceilingLin = dbToLinear(ceilingDb);

  const left = new Float64Array(numFrames);
  const right = new Float64Array(numFrames);
  let dcL = 0;
  let dcR = 0;
  for (let i = 0; i < numFrames; i++) {
    const l = stereoPcm.readInt16LE(i * 4) / 32768;
    const r = stereoPcm.readInt16LE(i * 4 + 2) / 32768;
    left[i] = l;
    right[i] = r;
    dcL += l;
    dcR += r;
  }
  dcL /= numFrames;
  dcR /= numFrames;

  // Linked 80 Hz HPF + linked vocal leveler + linked RMS makeup gain
  const rcHp = 1 / (2 * Math.PI * 80);
  const dt = 1 / Math.max(8000, sampleRate);
  const alphaHp = rcHp / (rcHp + dt);
  let pxL = left[0]! - dcL;
  let pyL = 0;
  let pxR = right[0]! - dcR;
  let pyR = 0;

  const compThresh = dbToLinear(-24);
  const gateThresh = dbToLinear(-48);
  const att = Math.exp(-1 / (sampleRate * 0.012));
  const rel = Math.exp(-1 / (sampleRate * 0.14));
  let env = 0;
  let sumSq = 0;

  for (let i = 0; i < numFrames; i++) {
    const xL = left[i]! - dcL;
    pyL = alphaHp * (pyL + xL - pxL);
    pxL = xL;

    const xR = right[i]! - dcR;
    pyR = alphaHp * (pyR + xR - pxR);
    pxR = xR;

    const linkedAbs = Math.max(Math.abs(pyL), Math.abs(pyR));
    env =
      linkedAbs > env
        ? att * env + (1 - att) * linkedAbs
        : rel * env + (1 - rel) * linkedAbs;
    let g = 1.0;
    if (env > compThresh) {
      const overDb = 20 * Math.log10(env / compThresh);
      g = dbToLinear(-overDb * 0.45);
    } else if (env < gateThresh) {
      g = Math.max(0.1, Math.pow(env / gateThresh, 1.3));
    }
    left[i] = pyL * g;
    right[i] = pyR * g;
    sumSq += 0.5 * (left[i]! * left[i]! + right[i]! * right[i]!);
  }

  const curRms = Math.sqrt(sumSq / numFrames);
  const makeup =
    curRms > 1e-6
      ? Math.min(dbToLinear(16), dbToLinear(targetRmsDb) / curRms)
      : 1.0;
  const kneeStart = ceilingLin * 0.82;
  const kneeHeadroom = ceilingLin - kneeStart;

  const out = Buffer.alloc(numFrames * 4);
  for (let i = 0; i < numFrames; i++) {
    let l = left[i]! * makeup;
    let r = right[i]! * makeup;
    const peakLR = Math.max(Math.abs(l), Math.abs(r));
    if (peakLR > kneeStart) {
      const lim =
        kneeStart +
        kneeHeadroom *
          Math.tanh((peakLR - kneeStart) / Math.max(1e-4, kneeHeadroom));
      const scale = Math.min(1, Math.min(ceilingLin, lim) / peakLR);
      l *= scale;
      r *= scale;
    }
    out.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(l * 32767))),
      i * 4,
    );
    out.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(r * 32767))),
      i * 4 + 2,
    );
  }
  return out;
}

/**
 * Pitch-preserving WSOLA speech time-stretch (`speedMul > 1` faster, `speedMul < 1` slower) on 16-bit mono PCM
 * for inline `[speed: ...]` and `[emotion: ...]` per-segment cadence modulation.
 */
export function timeStretchSpeechPcm(
  pcmData: Buffer,
  speedMul: number,
  sampleRate = 24000,
): Buffer {
  const numSamples = Math.floor(pcmData.length / 2);
  if (
    !Number.isFinite(speedMul) ||
    Math.abs(speedMul - 1) < 0.03 ||
    numSamples < 800
  ) {
    return pcmData;
  }
  const clampedSpeed = Math.max(0.5, Math.min(2.5, speedMul));
  const outSamples = Math.max(120, Math.round(numSamples / clampedSpeed));
  const winLen = Math.min(
    Math.floor(numSamples / 3),
    Math.max(120, Math.round(sampleRate * 0.024)),
  );
  const hopOut = Math.max(32, Math.floor(winLen / 2));
  const searchRadius = Math.max(16, Math.round(sampleRate * 0.006));

  const src = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    src[i] = pcmData.readInt16LE(i * 2) / 32768;
  }
  const dst = new Float32Array(outSamples);
  const weight = new Float32Array(outSamples);
  const hann = new Float32Array(winLen);
  for (let j = 0; j < winLen; j++) {
    hann[j] = 0.5 * (1 - Math.cos((2 * Math.PI * j) / Math.max(1, winLen - 1)));
  }

  let outPos = 0;
  let prevInEnd = 0;
  while (outPos < outSamples) {
    const idealIn = Math.round(outPos * clampedSpeed);
    let bestIn = Math.max(0, Math.min(numSamples - winLen, idealIn));
    if (outPos > 0 && prevInEnd + 32 < numSamples) {
      let bestCorr = -Infinity;
      const minIn = Math.max(0, idealIn - searchRadius);
      const maxIn = Math.min(numSamples - winLen, idealIn + searchRadius);
      for (let cand = minIn; cand <= maxIn; cand += 2) {
        let corr = 0;
        for (let k = 0; k < 48 && outPos + k < outSamples; k++) {
          corr += dst[outPos + k]! * src[cand + k]!;
        }
        if (corr > bestCorr) {
          bestCorr = corr;
          bestIn = cand;
        }
      }
    }
    for (let j = 0; j < winLen && outPos + j < outSamples; j++) {
      const w = hann[j]!;
      dst[outPos + j] = dst[outPos + j]! + src[bestIn + j]! * w;
      weight[outPos + j] = weight[outPos + j]! + w;
    }
    prevInEnd = bestIn + hopOut;
    outPos += hopOut;
  }

  const outBuf = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const s = weight[i]! > 1e-4 ? dst[i]! / weight[i]! : 0;
    outBuf.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(s * 32767))),
      i * 2,
    );
  }
  return outBuf;
}

const WIN32_RESERVED_STEM_RE =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/**
 * Sanitizes any title/stem into a cross-platform (POSIX + Windows NTFS) safe filename stem,
 * stripping illegal characters (`< > : " / \ | ? *` + control chars), trailing dots/spaces,
 * and guarding Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1–9`, `LPT1–9`).
 */
export function sanitizeSafeFilenameStem(
  raw: string,
  fallback = "speech",
  maxLen = 80,
): string {
  let clean = String(raw || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^_+|_+$/g, "")
    .trim()
    .slice(0, maxLen)
    .replace(/[. _]+$/g, "")
    .trim();
  if (!clean) clean = fallback;
  if (WIN32_RESERVED_STEM_RE.test(clean)) {
    clean = `_${clean}`;
  }
  return clean;
}

/**
 * Applies constant-power stereo panning (`pan` in `[-1.0 .. +1.0]`) to a 16-bit mono PCM buffer,
 * returning an interleaved 2-channel 16-bit stereo PCM buffer (ideal for 2-host AI podcasts).
 */
export function panMonoToStereoPcm(monoPcm: Buffer, pan = 0): Buffer {
  const numSamples = Math.floor(monoPcm.length / 2);
  const clampedPan = Math.max(-1, Math.min(1, pan));
  const angle = ((clampedPan + 1) * Math.PI) / 4; // 0 (hard L) .. pi/4 (center) .. pi/2 (hard R)
  const leftGain = Math.cos(angle);
  const rightGain = Math.sin(angle);
  const out = Buffer.alloc(numSamples * 4);
  for (let i = 0; i < numSamples; i++) {
    const s = monoPcm.readInt16LE(i * 2);
    const l = Math.max(-32767, Math.min(32767, Math.round(s * leftGain)));
    const r = Math.max(-32767, Math.min(32767, Math.round(s * rightGain)));
    out.writeInt16LE(l, i * 4);
    out.writeInt16LE(r, i * 4 + 2);
  }
  return out;
}

/**
 * Formats synchronized Read-Along cues into `.lrc` lyrics format (`[mm:ss.xx] line`) for embedding
 * directly inside `.m4b` / `.m4a` / `.mp3` metadata tags.
 */
export function formatLrcSyncedLyrics(
  cues: Array<{ startMs: number; text: string }>,
): string {
  const lines: string[] = [];
  for (const cue of cues) {
    const totalCs = Math.max(0, Math.round(cue.startMs / 10));
    const mins = Math.floor(totalCs / 6000);
    const secs = Math.floor((totalCs % 6000) / 100);
    const cs = totalCs % 100;
    const tag = `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}]`;
    lines.push(`${tag} ${cue.text.replace(/\r?\n/g, " ").trim()}`);
  }
  return lines.join("\n");
}
