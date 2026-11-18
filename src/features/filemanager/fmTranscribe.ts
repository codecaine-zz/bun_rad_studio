/**
 * Cross-Platform AI Audio-to-Text & Subtitle Engine for Codecaine File Manager.
 *
 * Implements a 6-tier local ASR pipeline:
 *   1. `whisper-cli` (`mlx_whisper`, `whisper-cli`/`whisper-cpp`, `faster-whisper`, `whisper`)
 *   2. `python-whisper` (`asr-env` / `f5-mlx-env` with `faster_whisper` or HuggingFace `transformers`)
 *   3. `openai-asr` (local OpenAI-compatible `POST /v1/audio/transcriptions`)
 *   4. `ollama-omni` (local Ollama `lfm3-omni` multimodal audio model)
 *   5. `os-native` (macOS `SFSpeechRecognizer` via Swift; Windows `.NET System.Speech.Recognition`)
 *   6. `companion` (sidecar `.srt`/`.vtt`/`.lrc` or `ffmpeg` embedded subtitle stream extraction)
 *
 * Also handles PCM WAV header parsing, optional ffmpeg speech enhancement (`highpass`, `lowpass`,
 * `dynaudnorm`), 6-format transcript rendering (`md`, `txt`, `srt`, `vtt`, `lrc`, `json`),
 * microphone upload transcription, optional local Ollama summarization, and one-click `asr-env` install.
 */
import { existsSync, promises as fsp, readFileSync, statSync } from "fs";
import { homedir } from "os";
import * as nodePath from "path";
import {
  absolutePath,
  assertCreatable,
  assertFolder,
  assertModifiable,
  pathApi,
  type FmContext,
  type FmHandler,
} from "./fmCore";
import {
  assertRealpathInsideSandboxSync,
  createSessionTempDirSync,
  removePathForceSync,
  writeNewFileExclusiveAsync,
} from "./fmNativeFs";
import {
  FmError,
  isSameOrInside,
  splitName,
  uniqueName,
  validateName,
} from "./fmPaths";
import { childEnv, findExecutable, searchDirs } from "./fmTools";

// ---------------------------------------------------------------------------------------------------------------
// 1. Public Contract Types & Constants
// ---------------------------------------------------------------------------------------------------------------

/** Output formats supported by the transcript formatter and saver. */
export type TranscribeFormat = "md" | "txt" | "srt" | "vtt" | "lrc" | "json";

/** Engine selection identifier (`auto` tries tiers 1-6 in priority order). */
export type TranscribeEngineId =
  | "auto"
  | "python-whisper"
  | "whisper-cli"
  | "openai-asr"
  | "ollama-omni"
  | "os-native"
  | "companion";

/** Single timed speech segment returned by an ASR engine. */
export interface TranscribeSegment {
  start: number;
  end: number;
  text: string;
}

/** Complete transcription result for one media file or microphone recording. */
export interface TranscribeSingleResult {
  sourcePath: string;
  fileName: string;
  engine: string;
  model: string;
  language: string;
  durationSec: number;
  elapsedMs: number;
  wordCount: number;
  text: string;
  segments: TranscribeSegment[];
  formatted: string;
  format: TranscribeFormat;
  summary: string | null;
  actionItems: string[];
  chapters: Array<{ start: number; title: string }>;
  savedPath: string | null;
}

/** Options for batch or single-file transcription via `transcribeAudioPaths`. */
export interface TranscribeRunOptions {
  paths: string[];
  engine?: TranscribeEngineId;
  model?: string;
  language?: string;
  format?: TranscribeFormat;
  enhanceAudio?: boolean;
  summarize?: boolean;
  saveSidecar?: boolean;
  outputDir?: string;
}

/** Test and dependency-injection hooks for `transcribeAudioPaths` and `transcribeMicrophoneRecording`. */
export interface TranscribeHooks {
  transcribeWav?: (
    wavPath: string,
    opts: { engine: TranscribeEngineId; model: string; language: string },
  ) => Promise<{
    text: string;
    language?: string;
    durationSec?: number;
    engine: string;
    model: string;
    segments: TranscribeSegment[];
  }>;
}

/** Availability report for a single ASR engine tier. */
export interface TranscribeEngineStatus {
  id: Exclude<TranscribeEngineId, "auto">;
  label: string;
  available: boolean;
  priority: number;
  detail: string;
  path?: string | null;
}

/** Overall readiness, environment, and option metadata returned by `getTranscribeStatus`. */
export interface TranscribeStatus {
  ready: boolean;
  recommendedEngine: Exclude<TranscribeEngineId, "auto">;
  recommendedLabel: string;
  ffmpegAvailable: boolean;
  ffmpegPath: string | null;
  ollamaAvailable: boolean;
  asrEnvInstalled: boolean;
  asrEnvPython: string | null;
  engines: TranscribeEngineStatus[];
  supportedExtensions: string[];
  supportedFormats: TranscribeFormat[];
  models: Array<{ id: string; label: string }>;
  languages: Array<{ code: string; label: string }>;
}

/** Lowercase extensions (without leading dot) recognized as transcribable audio or video media. */
export const TRANSCRIBE_MEDIA_EXTS: ReadonlySet<string> = new Set([
  "mp3",
  "wav",
  "m4a",
  "m4b",
  "aac",
  "flac",
  "ogg",
  "opus",
  "oga",
  "aiff",
  "aif",
  "wma",
  "webm",
  "amr",
  "caf",
  "mp4",
  "mov",
  "mkv",
  "avi",
  "m4v",
  "ts",
  "mts",
  "flv",
  "3gp",
]);

const SUPPORTED_FORMATS: TranscribeFormat[] = [
  "md",
  "txt",
  "srt",
  "vtt",
  "lrc",
  "json",
];

const DEFAULT_MODELS: Array<{ id: string; label: string }> = [
  { id: "openai/whisper-tiny", label: "Whisper Tiny (~75 MB · Fastest)" },
  {
    id: "openai/whisper-tiny.en",
    label: "Whisper Tiny English (~75 MB · Fast EN)",
  },
  { id: "openai/whisper-base", label: "Whisper Base (~145 MB · Balanced)" },
  { id: "openai/whisper-small", label: "Whisper Small (~465 MB · Accurate)" },
  {
    id: "openai/whisper-large-v3-turbo",
    label: "Whisper Large v3 Turbo (~1.6 GB · Best)",
  },
];

const DEFAULT_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "auto", label: "Auto-Detect" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "ko", label: "Korean" },
];

const VALID_ENGINES = new Set<TranscribeEngineId>([
  "auto",
  "python-whisper",
  "whisper-cli",
  "openai-asr",
  "ollama-omni",
  "os-native",
  "companion",
]);

function basenameAny(nameOrPath: string): string {
  const cleaned = String(nameOrPath ?? "")
    .trim()
    .replace(/[\\/]+$/, "");
  if (!cleaned) return "";
  const slashIdx = Math.max(
    cleaned.lastIndexOf("/"),
    cleaned.lastIndexOf("\\"),
  );
  return slashIdx >= 0 ? cleaned.slice(slashIdx + 1) : cleaned;
}

/** Returns true when `nameOrPath` ends with one of `TRANSCRIBE_MEDIA_EXTS`. */
export function isTranscribableMediaPath(nameOrPath: string): boolean {
  if (typeof nameOrPath !== "string" || !nameOrPath.trim()) return false;
  const base = basenameAny(nameOrPath);
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return false;
  return TRANSCRIBE_MEDIA_EXTS.has(base.slice(dot + 1).toLowerCase());
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Internal Path, Validation, & Subprocess Helpers
// ---------------------------------------------------------------------------------------------------------------

function isAbsoluteInput(ctx: FmContext, raw: string): boolean {
  if (raw.startsWith("/")) return true;
  if (ctx.platform === "win32" && /^[A-Za-z]:[\\/]/.test(raw)) return true;
  if (ctx.platform === "win32" && raw.startsWith("\\\\")) return true;
  return false;
}

function realpathCheckPlatform(
  ctx: FmContext,
  targetPath: string,
): NodeJS.Platform {
  if (
    process.platform !== "win32" &&
    targetPath.startsWith("/") &&
    !targetPath.startsWith("//") &&
    (!ctx.sandboxRoot ||
      (ctx.sandboxRoot.startsWith("/") && !ctx.sandboxRoot.startsWith("//")))
  ) {
    return process.platform;
  }
  return ctx.platform;
}

function resolveInsideSandbox(ctx: FmContext, rawPath: string): string {
  const raw = String(rawPath || "").trim();
  if (!raw || raw.includes("\0")) {
    throw new FmError("BAD_PATH", "Invalid or empty file path.");
  }
  const p = pathApi(ctx);
  const base = ctx.sandboxRoot || ctx.home;
  const isAbs = isAbsoluteInput(ctx, raw);
  const candidate = raw === "." ? base : isAbs ? raw : p.join(base, raw);
  const resolved = absolutePath(ctx, candidate);

  if (ctx.trashRoot && isSameOrInside(resolved, ctx.trashRoot, ctx.platform)) {
    throw new FmError(
      "PROTECTED",
      "This folder belongs to the File Manager's Recycle Bin. Use the Recycle Bin to restore or delete items.",
    );
  }
  if (
    ctx.sandboxRoot &&
    !isSameOrInside(resolved, ctx.sandboxRoot, ctx.platform)
  ) {
    throw new FmError(
      "PROTECTED_PATH",
      "Path escapes the configured workspace sandbox root.",
    );
  }
  if (!isAbs && !isSameOrInside(resolved, base, ctx.platform)) {
    throw new FmError(
      "PROTECTED_PATH",
      "Relative path traversal outside the workspace root is not permitted.",
    );
  }
  assertRealpathInsideSandboxSync(
    resolved,
    ctx.sandboxRoot,
    realpathCheckPlatform(ctx, resolved),
  );
  return resolved;
}

function resolveSaveFolder(ctx: FmContext, rawFolder: string): string {
  const raw = String(rawFolder || "").trim();
  if (!raw || raw.includes("\0")) {
    throw new FmError("BAD_PATH", "Invalid folder path.");
  }
  const p = pathApi(ctx);
  const base = ctx.sandboxRoot || ctx.home;
  const isAbs = isAbsoluteInput(ctx, raw);
  const resolved = absolutePath(
    ctx,
    raw === "." ? base : isAbs ? raw : p.join(base, raw),
  );
  // Check Recycle Bin / OS protected paths first so callers get a consistent PROTECTED error.
  assertCreatable(ctx, resolved);
  if (
    ctx.sandboxRoot &&
    !isSameOrInside(resolved, ctx.sandboxRoot, ctx.platform)
  ) {
    throw new FmError(
      "PROTECTED_PATH",
      "Target folder escapes the configured workspace sandbox root.",
    );
  }
  if (!isAbs && !isSameOrInside(resolved, base, ctx.platform)) {
    throw new FmError(
      "PROTECTED_PATH",
      "Relative folder traversal outside the workspace root is not permitted.",
    );
  }
  assertRealpathInsideSandboxSync(
    resolved,
    ctx.sandboxRoot,
    realpathCheckPlatform(ctx, resolved),
  );
  return resolved;
}

function normalizeFormat(raw: unknown): TranscribeFormat {
  const low = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!low) return "md";
  if (low === "markdown") return "md";
  if ((SUPPORTED_FORMATS as string[]).includes(low)) {
    return low as TranscribeFormat;
  }
  throw new FmError(
    "BAD_REQUEST",
    `Unsupported transcript format "${String(raw)}". Supported formats: ${SUPPORTED_FORMATS.join(", ")}.`,
  );
}

function normalizeEngine(raw: unknown): TranscribeEngineId {
  if (typeof raw !== "string" || !raw.trim()) return "auto";
  const low = raw.trim().toLowerCase() as TranscribeEngineId;
  if (!VALID_ENGINES.has(low)) {
    throw new FmError(
      "BAD_REQUEST",
      `Unknown ASR engine "${raw}". Supported engines: ${[...VALID_ENGINES].join(", ")}.`,
    );
  }
  return low;
}

async function readTakenNames(
  dirPath: string,
  platform: FmContext["platform"],
): Promise<Set<string>> {
  const entries = await fsp.readdir(dirPath).catch(() => []);
  const ci = platform !== "linux";
  return new Set(entries.map((n) => (ci ? n.toLowerCase() : n)));
}

function normCase(name: string, platform: FmContext["platform"]): string {
  return platform === "linux" ? name : name.toLowerCase();
}

async function runProcess(
  argv: string[],
  env: Record<string, string>,
  timeoutMs = 180_000,
  signal?: AbortSignal,
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(argv, {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env,
      windowsHide: true,
    });
  } catch (err) {
    return {
      code: null,
      stdout: "",
      stderr: (err as Error)?.message ?? String(err),
      timedOut: false,
    };
  }

  let timedOut = false;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  let forceResolve:
    | ((val: {
        code: number | null;
        stdout: string;
        stderr: string;
        timedOut: boolean;
      }) => void)
    | undefined;

  const onAbort = () => {
    try {
      proc.kill();
    } catch {}
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {}
    hardTimer = setTimeout(() => {
      try {
        proc.kill(9);
      } catch {}
      forceResolve?.({ code: null, stdout: "", stderr: "", timedOut: true });
    }, 500);
  }, timeoutMs);

  const abandoned = new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }>((resolve) => {
    forceResolve = resolve;
  });

  const finished = (async () => {
    try {
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout as ReadableStream).text(),
        new Response(proc.stderr as ReadableStream).text(),
        proc.exited,
      ]);
      return { code, stdout, stderr, timedOut };
    } catch {
      return { code: null, stdout: "", stderr: "", timedOut };
    }
  })();

  try {
    return await Promise.race([finished, abandoned]);
  } finally {
    clearTimeout(timer);
    clearTimeout(hardTimer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Pure-TS WAV Parser & FFmpeg Audio Preprocessor
// ---------------------------------------------------------------------------------------------------------------

export interface WavHeaderInfo {
  valid: boolean;
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataBytes: number;
  durationSec: number;
  isPcm16kMono: boolean;
}

/** Parses RIFF/WAVE header chunks (`fmt ` and `data`) in pure TypeScript without external binaries. */
export function parseWavHeaderInfo(
  buf: Uint8Array,
  totalFileSize = buf.byteLength,
): WavHeaderInfo {
  const invalid: WavHeaderInfo = {
    valid: false,
    audioFormat: 0,
    channels: 0,
    sampleRate: 0,
    bitsPerSample: 0,
    dataBytes: 0,
    durationSec: 0,
    isPcm16kMono: false,
  };
  if (buf.byteLength < 44) return invalid;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (off: number) =>
    String.fromCharCode(buf[off]!, buf[off + 1]!, buf[off + 2]!, buf[off + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return invalid;

  let audioFormat = 1;
  let channels = 0;
  let sampleRate = 0;
  let byteRate = 0;
  let bitsPerSample = 0;
  let dataBytes = -1;
  let offset = 12;
  const effectiveLength = Math.max(buf.byteLength, totalFileSize);

  while (offset + 8 <= buf.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= buf.byteLength) {
      audioFormat = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      byteRate = view.getUint32(body + 8, true);
      bitsPerSample = view.getUint16(body + 14, true);
      if (audioFormat === 0xfffe && body + 26 <= buf.byteLength) {
        audioFormat = view.getUint16(body + 24, true);
      }
    } else if (id === "data") {
      const available = Math.max(0, effectiveLength - body);
      dataBytes =
        size > 0 && size !== 0xffffffff && size <= available ? size : available;
      break;
    }
    const step = size + (size % 2);
    if (step <= 0 && size === 0) {
      offset = body;
    } else {
      offset = body + step;
    }
  }

  if (channels <= 0 || sampleRate <= 0) return invalid;
  if (dataBytes < 0) dataBytes = Math.max(0, effectiveLength - 44);

  const computedByteRate =
    byteRate > 0 ? byteRate : sampleRate * channels * (bitsPerSample / 8);
  const durationSec = computedByteRate > 0 ? dataBytes / computedByteRate : 0;

  return {
    valid: true,
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample,
    dataBytes,
    durationSec,
    isPcm16kMono:
      audioFormat === 1 &&
      sampleRate === 16000 &&
      channels === 1 &&
      bitsPerSample === 16,
  };
}

async function readWavHeaderFromFile(filePath: string): Promise<WavHeaderInfo> {
  try {
    const fh = await fsp.open(filePath, "r");
    try {
      const st = await fh.stat();
      const headSize = Math.min(st.size, 8192);
      const buf = Buffer.alloc(headSize);
      const { bytesRead } = await fh.read(buf, 0, headSize, 0);
      return parseWavHeaderInfo(buf.subarray(0, bytesRead), st.size);
    } finally {
      await fh.close().catch(() => {});
    }
  } catch {
    return parseWavHeaderInfo(new Uint8Array(0));
  }
}

interface PreparedAudio {
  wavPath: string | null;
  isWav: boolean;
  durationSec: number;
  ffmpegPath: string | null;
}

function findFfmpeg(ctx: FmContext): string | null {
  return findExecutable(ctx.platform, ["ffmpeg"], searchDirs(ctx));
}

async function prepareAudioForAsr(
  ctx: FmContext,
  mediaAbsPath: string,
  tmpDir: string,
  enhanceAudio: boolean,
): Promise<PreparedAudio> {
  const ffmpegPath = findFfmpeg(ctx);
  const wavInfo = await readWavHeaderFromFile(mediaAbsPath);
  const needsConvert = !wavInfo.valid || !wavInfo.isPcm16kMono || enhanceAudio;

  if (ffmpegPath && needsConvert) {
    const outWav = nodePath.join(tmpDir, "prepared_16k.wav");
    const afArgs = enhanceAudio
      ? ["-af", "highpass=f=70,lowpass=f=7800,dynaudnorm"]
      : [];
    const argv = [
      ffmpegPath,
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i",
      mediaAbsPath,
      "-vn",
      ...afArgs,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      outWav,
    ];
    const res = await runProcess(argv, childEnv(ctx), 120_000);
    if (res.code === 0 && existsSync(outWav)) {
      const outInfo = await readWavHeaderFromFile(outWav);
      if (outInfo.valid && outInfo.dataBytes > 0) {
        return {
          wavPath: outWav,
          isWav: true,
          durationSec: outInfo.durationSec,
          ffmpegPath,
        };
      }
    }
  }

  if (wavInfo.valid) {
    return {
      wavPath: mediaAbsPath,
      isWav: true,
      durationSec: wavInfo.durationSec,
      ffmpegPath,
    };
  }

  return {
    wavPath: null,
    isWav: false,
    durationSec: 0,
    ffmpegPath,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Timestamp Formatters, Segment Normalization & Subtitle Parsers
// ---------------------------------------------------------------------------------------------------------------

const pad2 = (n: number) => String(Math.floor(Math.max(0, n))).padStart(2, "0");
const pad3 = (n: number) => String(Math.floor(Math.max(0, n))).padStart(3, "0");

function formatSrtTime(sec: number): string {
  const clamped = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const totalMs = Math.round(clamped * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

function formatVttTime(sec: number): string {
  const clamped = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const totalMs = Math.round(clamped * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

function formatLrcTime(sec: number): string {
  const clamped = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const totalCentis = Math.round(clamped * 100);
  const xx = totalCentis % 100;
  const totalSec = Math.floor(totalCentis / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `[${pad2(m)}:${pad2(s)}.${pad2(xx)}]`;
}

function formatDisplayTimestamp(sec: number): string {
  const clamped = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const totalSec = Math.floor(clamped);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function normalizeSegmentsAndText(
  rawText: string,
  rawSegments: TranscribeSegment[] | undefined,
  durationSec: number,
): { text: string; segments: TranscribeSegment[]; durationSec: number } {
  const segments: TranscribeSegment[] = [];
  for (const seg of rawSegments ?? []) {
    const t = String(seg?.text ?? "").trim();
    if (!t) continue;
    const start = Math.max(
      0,
      Number.isFinite(Number(seg?.start)) ? Number(seg.start) : 0,
    );
    const rawEnd = Number.isFinite(Number(seg?.end)) ? Number(seg.end) : start;
    const end = rawEnd > start ? rawEnd : start + 0.5;
    segments.push({
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      text: t,
    });
  }
  const text =
    String(rawText ?? "").trim() ||
    segments
      .map((s) => s.text)
      .join(" ")
      .trim();
  const maxSegEnd =
    segments.length > 0 ? Math.max(...segments.map((s) => s.end)) : 0;
  const finalDuration =
    durationSec > 0 ? Math.round(durationSec * 1000) / 1000 : maxSegEnd;
  if (segments.length === 0 && text) {
    segments.push({
      start: 0,
      end: Math.max(0.5, finalDuration || 5),
      text,
    });
  }
  return { text, segments, durationSec: finalDuration };
}

/** Formats a transcript and its optional metadata into `md`, `txt`, `srt`, `vtt`, `lrc`, or `json`. */
export function formatTranscriptOutput(
  source: {
    fileName: string;
    engine: string;
    model: string;
    language: string;
    durationSec: number;
    text: string;
    segments: TranscribeSegment[];
    summary?: string | null;
    actionItems?: string[];
    chapters?: Array<{ start: number; title: string }>;
  },
  format: TranscribeFormat,
): string {
  const fmt = normalizeFormat(format);
  const norm = normalizeSegmentsAndText(
    source.text,
    source.segments,
    Number(source.durationSec || 0),
  );
  const summary = source.summary ? String(source.summary).trim() : null;
  const actionItems = Array.isArray(source.actionItems)
    ? source.actionItems.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const chapters = Array.isArray(source.chapters)
    ? source.chapters
        .map((c) => ({
          start: Math.max(0, Number(c?.start) || 0),
          title: String(c?.title ?? "").trim(),
        }))
        .filter((c) => Boolean(c.title))
    : [];

  if (fmt === "txt") {
    return norm.text ? `${norm.text}\n` : "";
  }

  if (fmt === "srt") {
    if (norm.segments.length === 0) return "";
    return (
      norm.segments
        .map(
          (seg, i) =>
            `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text}`,
        )
        .join("\n\n") + "\n"
    );
  }

  if (fmt === "vtt") {
    const body = norm.segments
      .map(
        (seg) =>
          `${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}\n${seg.text}`,
      )
      .join("\n\n");
    return body ? `WEBVTT\n\n${body}\n` : "WEBVTT\n";
  }

  if (fmt === "lrc") {
    const header = [
      `[ti:${source.fileName || "Transcript"}]`,
      `[re:Codecaine File Manager (${source.engine || "asr"})]`,
    ];
    const lines = norm.segments.map(
      (seg) => `${formatLrcTime(seg.start)}${seg.text}`,
    );
    return [...header, ...lines].join("\n") + "\n";
  }

  if (fmt === "json") {
    return JSON.stringify(
      {
        fileName: source.fileName,
        engine: source.engine,
        model: source.model,
        language: source.language,
        durationSec: norm.durationSec,
        wordCount: countWords(norm.text),
        text: norm.text,
        segments: norm.segments,
        summary,
        actionItems,
        chapters,
      },
      null,
      2,
    );
  }

  // Markdown ("md")
  const lines: string[] = [
    `# Transcript: ${source.fileName || "Audio"}`,
    "",
    `- **Engine:** ${source.engine || "asr"}`,
    `- **Model:** ${source.model || "default"}`,
    `- **Language:** ${source.language || "auto"}`,
    `- **Duration:** ${formatDisplayTimestamp(norm.durationSec)}`,
    `- **Words:** ${countWords(norm.text)}`,
  ];

  if (summary) {
    lines.push("", "## AI Summary", "", summary);
  }
  if (actionItems.length > 0) {
    lines.push("", "## Action Items", "");
    for (const item of actionItems) lines.push(`- [ ] ${item}`);
  }
  if (chapters.length > 0) {
    lines.push("", "## Chapters", "");
    for (const ch of chapters) {
      lines.push(`- **${formatDisplayTimestamp(ch.start)}** — ${ch.title}`);
    }
  }
  lines.push("", "## Transcript", "", norm.text || "_No speech detected._");
  if (norm.segments.length > 0) {
    lines.push("", "## Timestamped Segments", "");
    for (const seg of norm.segments) {
      lines.push(
        `- **[${formatDisplayTimestamp(seg.start)} → ${formatDisplayTimestamp(seg.end)}]** ${seg.text}`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

function parseClockSeconds(raw: string): number {
  const cleaned = raw.trim().replace(",", ".");
  const parts = cleaned.split(":").map((x) => Number(x));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0] ?? 0;
}

function parseSrtOrVttSegments(raw: string): TranscribeSegment[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const segments: TranscribeSegment[] = [];
  const timeRe =
    /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (!timeRe.test(line)) {
      i++;
      continue;
    }
    const [leftRaw = "0", rightRaw = "0"] = line.split("-->");
    const start = parseClockSeconds(leftRaw.trim().split(/\s+/)[0] ?? "0");
    const end = parseClockSeconds(rightRaw.trim().split(/\s+/)[0] ?? "0");
    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "") {
      const stripped = lines[i]!.replace(/<[^>]+>/g, "").trim();
      if (stripped) textLines.push(stripped);
      i++;
    }
    const text = textLines.join(" ").trim();
    if (text) {
      segments.push({ start, end: end > start ? end : start + 1, text });
    }
  }
  return segments;
}

function parseLrcSegments(
  raw: string,
  fallbackDuration: number,
): TranscribeSegment[] {
  const parsed: Array<{ start: number; text: string }> = [];
  const lrcRe = /^\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/;
  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const m = lrcRe.exec(rawLine.trim());
    if (!m) continue;
    const mins = Number(m[1]);
    const secs = Number(m[2]);
    const frac = m[3] ? Number(`0.${m[3]}`) : 0;
    const text = (m[4] || "").trim();
    if (!text) continue;
    parsed.push({ start: mins * 60 + secs + frac, text });
  }
  return parsed.map((item, idx) => {
    const nextStart = parsed[idx + 1]?.start;
    const end =
      nextStart && nextStart > item.start
        ? nextStart
        : Math.max(item.start + 2, fallbackDuration || item.start + 3);
    return { start: item.start, end, text: item.text };
  });
}

function parseWhisperJsonOutput(
  raw: string,
  fallbackDuration: number,
): { text: string; language?: string; segments: TranscribeSegment[] } | null {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;

    if (Array.isArray(data.segments)) {
      const segs: TranscribeSegment[] = data.segments
        .map((s: any) => ({
          start: Number(s?.start ?? 0),
          end: Number(s?.end ?? 0),
          text: String(s?.text ?? "").trim(),
        }))
        .filter((s: TranscribeSegment) => Boolean(s.text));
      const text =
        String(data.text ?? "").trim() ||
        segs
          .map((s) => s.text)
          .join(" ")
          .trim();
      return {
        text,
        language: typeof data.language === "string" ? data.language : undefined,
        segments: segs,
      };
    }

    // whisper.cpp `-oj` format: { transcription: [{ offsets: { from, to }, timestamps: { from, to }, text }] }
    if (Array.isArray(data.transcription)) {
      const segs: TranscribeSegment[] = data.transcription
        .map((t: any) => {
          const start =
            typeof t?.offsets?.from === "number"
              ? t.offsets.from / 1000
              : typeof t?.timestamps?.from === "string"
                ? parseClockSeconds(t.timestamps.from)
                : 0;
          const end =
            typeof t?.offsets?.to === "number"
              ? t.offsets.to / 1000
              : typeof t?.timestamps?.to === "string"
                ? parseClockSeconds(t.timestamps.to)
                : start + 1;
          return { start, end, text: String(t?.text ?? "").trim() };
        })
        .filter((s: TranscribeSegment) => Boolean(s.text));
      const text = segs
        .map((s) => s.text)
        .join(" ")
        .trim();
      return {
        text,
        language:
          typeof data.result?.language === "string"
            ? data.result.language
            : undefined,
        segments: segs,
      };
    }

    if (typeof data.text === "string" && data.text.trim()) {
      const norm = normalizeSegmentsAndText(
        data.text,
        undefined,
        fallbackDuration,
      );
      return {
        text: norm.text,
        language: typeof data.language === "string" ? data.language : undefined,
        segments: norm.segments,
      };
    }
  } catch {}
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Environment Discovery & Status (`getTranscribeStatus`)
// ---------------------------------------------------------------------------------------------------------------

function allowHostAsrEnv(ctx: FmContext): boolean {
  const p = pathApi(ctx);
  return (
    normCase(p.resolve(ctx.home), ctx.platform) ===
      normCase(p.resolve(homedir()), ctx.platform) ||
    process.env.FM_TRANSCRIBE_ALLOW_HOST_ENV === "1"
  );
}

function pythonBinaryInEnv(
  envDir: string,
  platform: FmContext["platform"],
): string | null {
  const candidates =
    platform === "win32"
      ? [
          nodePath.win32.join(envDir, "Scripts", "python.exe"),
          nodePath.posix.join(envDir, "bin", "python3"),
          nodePath.posix.join(envDir, "bin", "python"),
        ]
      : [
          nodePath.join(envDir, "bin", "python3"),
          nodePath.join(envDir, "bin", "python"),
        ];
  for (const cand of candidates) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

function discoverAsrPythonCandidates(ctx: FmContext): Array<{
  envName: string;
  envDir: string;
  pythonPath: string;
}> {
  const p = pathApi(ctx);
  const dirs: Array<{ envName: string; envDir: string }> = [
    { envName: "asr-env (dataDir)", envDir: p.join(ctx.dataDir, "asr-env") },
  ];
  if (allowHostAsrEnv(ctx)) {
    dirs.push({
      envName: "asr-env (host)",
      envDir: nodePath.join(homedir(), ".bun_rad_studio", "asr-env"),
    });
  }
  dirs.push({
    envName: "f5-mlx-env (dataDir)",
    envDir: p.join(ctx.dataDir, "f5-mlx-env"),
  });
  if (allowHostAsrEnv(ctx)) {
    dirs.push({
      envName: "f5-mlx-env (host)",
      envDir: nodePath.join(homedir(), ".bun_rad_studio", "f5-mlx-env"),
    });
  }

  const seen = new Set<string>();
  const out: Array<{ envName: string; envDir: string; pythonPath: string }> =
    [];
  for (const item of dirs) {
    const key = normCase(p.resolve(item.envDir), ctx.platform);
    if (seen.has(key)) continue;
    seen.add(key);
    const pythonPath = pythonBinaryInEnv(item.envDir, ctx.platform);
    if (pythonPath) {
      out.push({ ...item, pythonPath });
    }
  }
  return out;
}

const pythonProbeCache = new Map<string, boolean>();

function fileStamp(filePath: string): string {
  try {
    return `${filePath}|${statSync(filePath).mtimeMs}`;
  } catch {
    return filePath;
  }
}

async function probePythonAsrAvailable(
  ctx: FmContext,
  pythonExe: string,
): Promise<boolean> {
  const key = fileStamp(pythonExe);
  const cached = pythonProbeCache.get(key);
  if (cached !== undefined) return cached;
  const res = await runProcess(
    [
      pythonExe,
      "-c",
      "import importlib.util, sys; sys.exit(0 if (importlib.util.find_spec('faster_whisper') or importlib.util.find_spec('transformers')) else 1)",
    ],
    childEnv(ctx),
    4000,
  );
  const ok = res.code === 0;
  pythonProbeCache.set(key, ok);
  return ok;
}

function defaultPythonWhisperModel(ctx: FmContext): string {
  const hfRoot = process.env.HF_HOME
    ? nodePath.join(process.env.HF_HOME, "hub")
    : allowHostAsrEnv(ctx)
      ? nodePath.join(homedir(), ".cache", "huggingface", "hub")
      : "";
  if (
    hfRoot &&
    existsSync(nodePath.join(hfRoot, "models--openai--whisper-tiny.en"))
  ) {
    return "openai/whisper-tiny.en";
  }
  return "openai/whisper-base";
}

interface WhisperCliSpec {
  bin: string;
  kind: "mlx_whisper" | "whisper-cli" | "faster-whisper" | "whisper";
}

function findWhisperCli(ctx: FmContext): WhisperCliSpec | null {
  const dirs = searchDirs(ctx);
  const specs: Array<{ names: string[]; kind: WhisperCliSpec["kind"] }> = [
    { names: ["mlx_whisper"], kind: "mlx_whisper" },
    { names: ["whisper-cli", "whisper-cpp"], kind: "whisper-cli" },
    { names: ["faster-whisper"], kind: "faster-whisper" },
    { names: ["whisper"], kind: "whisper" },
  ];
  for (const spec of specs) {
    const bin = findExecutable(ctx.platform, spec.names, dirs);
    if (bin) return { bin, kind: spec.kind };
  }
  return null;
}

function getOpenAiAsrBaseUrls(): string[] {
  const envUrl = process.env.FM_ASR_BASE_URL?.trim();
  if (envUrl) return [envUrl.replace(/\/+$/, "")];
  return ["http://127.0.0.1:1234", "http://127.0.0.1:8080"];
}

async function probeOpenAiAsr(): Promise<{
  available: boolean;
  baseUrl: string | null;
}> {
  const explicit = Boolean(process.env.FM_ASR_BASE_URL?.trim());
  for (const baseUrl of getOpenAiAsrBaseUrls()) {
    try {
      const res = await fetch(`${baseUrl}/v1/models`, {
        method: "GET",
        signal: AbortSignal.timeout(1200),
      });
      if (explicit && res.status < 500) {
        return { available: true, baseUrl };
      }
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as any;
        const models: any[] = Array.isArray(data?.data) ? data.data : [];
        const hasAsrModel = models.some((m) =>
          /whisper|asr|stt|speech|parakeet|canary|omni|audio/i.test(
            String(m?.id || ""),
          ),
        );
        if (hasAsrModel || baseUrl.endsWith(":8080")) {
          return { available: true, baseUrl };
        }
      }
    } catch {}
    if (baseUrl.endsWith(":8080")) {
      try {
        const health = await fetch(`${baseUrl}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(900),
        });
        if (health.ok) return { available: true, baseUrl };
      } catch {}
    }
  }
  return { available: false, baseUrl: null };
}

async function probeOllamaStatus(ctx: FmContext): Promise<{
  ollamaAvailable: boolean;
  omniModel: string | null;
  chatModel: string | null;
}> {
  try {
    const { isPhononModelName, ollamaFetchJson } = await import("./fmOllama");
    const tags = await ollamaFetchJson(ctx, "/api/tags", {
      method: "GET",
      timeoutMs: 1800,
    });
    if (!tags.ok) {
      return { ollamaAvailable: false, omniModel: null, chatModel: null };
    }
    const list: Array<{ name?: string; model?: string }> = Array.isArray(
      tags.data?.models,
    )
      ? tags.data.models
      : [];
    const names = list
      .map((m) => String(m?.name || m?.model || "").trim())
      .filter(Boolean);
    const omniModel = names.find((n) => /\blfm3-omni\b/i.test(n)) ?? null;
    const chatModel =
      names.find(
        (n) =>
          !isPhononModelName(n) &&
          !/embed|minilm|bge-|nomic-embed|mxbai-embed/i.test(n),
      ) ?? null;
    return { ollamaAvailable: true, omniModel, chatModel };
  } catch {
    return { ollamaAvailable: false, omniModel: null, chatModel: null };
  }
}

/**
 * Returns true when `execPath` lives inside a macOS `.app/Contents/MacOS/` bundle whose
 * `../Info.plist` declares `NSSpeechRecognitionUsageDescription` (preventing TCC SIGABRT crashes
 * when running unbundled CLI or server binaries).
 */
export function isMacOsSpeechBundleAuthorized(
  execPath: string = process.execPath,
): boolean {
  if (!execPath) return false;
  const norm = String(execPath).replace(/\\/g, "/");
  const match = /^(.*\.app\/Contents)\/MacOS\/[^/]+$/.exec(norm);
  if (!match) return false;
  const plistPath = `${match[1]}/Info.plist`;
  try {
    if (!existsSync(plistPath)) return false;
    return readFileSync(plistPath, "utf8").includes(
      "NSSpeechRecognitionUsageDescription",
    );
  } catch {
    return false;
  }
}

function findOsNativeRunner(ctx: FmContext): {
  available: boolean;
  executable: string | null;
  detail: string;
} {
  if (ctx.platform === "darwin") {
    const dirs = ctx.toolDirs
      ? searchDirs(ctx)
      : [...searchDirs(ctx), "/usr/bin"];
    const swiftExe =
      process.platform === "darwin" || ctx.toolDirs
        ? findExecutable("darwin", ["swift"], dirs)
        : null;
    if (!swiftExe) {
      return {
        available: false,
        executable: null,
        detail: "Requires macOS with Swift CLI",
      };
    }
    const allowed =
      Boolean(ctx.toolDirs) ||
      process.env.FM_ENABLE_MACOS_NATIVE_SPEECH === "1" ||
      isMacOsSpeechBundleAuthorized(process.execPath);
    if (!allowed) {
      return {
        available: false,
        executable: null,
        detail:
          "Requires .app bundle speech permission or FM_ENABLE_MACOS_NATIVE_SPEECH=1 (use Local Whisper AI)",
      };
    }
    return {
      available: true,
      executable: swiftExe,
      detail: "macOS SFSpeechRecognizer (Swift)",
    };
  }
  if (ctx.platform === "win32") {
    const dirs = searchDirs(ctx);
    const psExe =
      findExecutable("win32", ["powershell", "pwsh"], dirs) ??
      (!ctx.toolDirs && process.platform === "win32" ? "powershell.exe" : null);
    return {
      available: Boolean(psExe),
      executable: psExe,
      detail: psExe
        ? "Windows .NET SpeechRecognitionEngine"
        : "Requires Windows PowerShell",
    };
  }
  return {
    available: false,
    executable: null,
    detail: "OS native speech recognition is available on macOS and Windows",
  };
}

/** Reports readiness of all 6 local ASR tiers, FFmpeg, Ollama, Python `asr-env`, models, and languages. */
export async function getTranscribeStatus(
  ctx: FmContext,
): Promise<TranscribeStatus> {
  const ffmpegPath = findFfmpeg(ctx);
  const ffmpegAvailable = Boolean(ffmpegPath);
  const cliSpec = findWhisperCli(ctx);
  const pyCandidates = discoverAsrPythonCandidates(ctx);

  let asrEnvPython: string | null = null;
  let pythonWhisperAvailable = false;
  for (const cand of pyCandidates) {
    if (!asrEnvPython && cand.envName.startsWith("asr-env")) {
      asrEnvPython = cand.pythonPath;
    }
    if (await probePythonAsrAvailable(ctx, cand.pythonPath)) {
      if (!asrEnvPython) asrEnvPython = cand.pythonPath;
      pythonWhisperAvailable = true;
      break;
    }
  }
  const asrEnvInstalled = Boolean(asrEnvPython);

  const [openAiProbe, ollamaProbe] = await Promise.all([
    probeOpenAiAsr(),
    probeOllamaStatus(ctx),
  ]);
  const osNative = findOsNativeRunner(ctx);

  const engines: TranscribeEngineStatus[] = [
    {
      id: "whisper-cli",
      label: "Whisper CLI (mlx_whisper / whisper-cli / whisper)",
      available: Boolean(cliSpec),
      priority: 1,
      detail: cliSpec
        ? `${cliSpec.kind} (${cliSpec.bin})`
        : "Not found in PATH",
      path: cliSpec?.bin ?? null,
    },
    {
      id: "python-whisper",
      label: "Python Whisper AI (faster-whisper / Transformers)",
      available: pythonWhisperAvailable,
      priority: 2,
      detail: pythonWhisperAvailable
        ? `Ready (${asrEnvPython})`
        : asrEnvInstalled
          ? "asr-env present (Whisper packages not detected)"
          : "Not installed (click 1-Click Install Local Whisper AI)",
      path: asrEnvPython,
    },
    {
      id: "openai-asr",
      label: "Local OpenAI ASR Server (/v1/audio/transcriptions)",
      available: openAiProbe.available,
      priority: 3,
      detail: openAiProbe.available
        ? `Reachable at ${openAiProbe.baseUrl}`
        : "No local /v1/audio/transcriptions server detected",
      path: openAiProbe.baseUrl,
    },
    {
      id: "ollama-omni",
      label: "Ollama Multimodal Audio (lfm3-omni)",
      available: Boolean(ollamaProbe.omniModel),
      priority: 4,
      detail: ollamaProbe.omniModel
        ? `Model ${ollamaProbe.omniModel} ready`
        : ollamaProbe.ollamaAvailable
          ? "Ollama running (pull lfm3-omni to enable)"
          : "Ollama offline",
      path: ollamaProbe.omniModel,
    },
    {
      id: "os-native",
      label:
        ctx.platform === "win32"
          ? "Windows Speech Recognition"
          : ctx.platform === "darwin"
            ? "macOS Speech Recognition"
            : "OS Native Speech Recognition (macOS / Windows)",
      available: osNative.available,
      priority: 5,
      detail: osNative.detail,
      path: osNative.executable,
    },
    {
      id: "companion",
      label: "Companion Subtitles (.srt/.vtt/.lrc & embedded tracks)",
      available: true,
      priority: 6,
      detail: ffmpegAvailable
        ? "Reads sidecar .srt/.vtt/.lrc and extracts embedded streams via FFmpeg"
        : "Reads sidecar .srt/.vtt/.lrc next to media files",
      path: ffmpegPath,
    },
  ];

  const activeEngine = engines.find((e) => e.id !== "companion" && e.available);
  const recommended = activeEngine ?? engines[engines.length - 1]!;

  return {
    ready: Boolean(activeEngine),
    recommendedEngine: recommended.id,
    recommendedLabel: recommended.label,
    ffmpegAvailable,
    ffmpegPath,
    ollamaAvailable: ollamaProbe.ollamaAvailable,
    asrEnvInstalled,
    asrEnvPython,
    engines,
    supportedExtensions: [...TRANSCRIBE_MEDIA_EXTS],
    supportedFormats: [...SUPPORTED_FORMATS],
    models: DEFAULT_MODELS,
    languages: DEFAULT_LANGUAGES,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Six-Tier Local ASR Execution (`runLocalAsrEngine`)
// ---------------------------------------------------------------------------------------------------------------

interface RawAsrOutput {
  text: string;
  segments: TranscribeSegment[];
  engine: string;
  model: string;
  language: string;
  durationSec: number;
}

const PYTHON_WHISPER_SCRIPT = `
import json, os, sys, wave

def load_wav_16k_mono(wav_path):
    import numpy as np
    try:
        from scipy.io import wavfile
        sr, data = wavfile.read(wav_path)
        if data.dtype == np.int16:
            audio = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            audio = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.uint8:
            audio = (data.astype(np.float32) - 128.0) / 128.0
        else:
            audio = data.astype(np.float32)
    except Exception:
        with wave.open(wav_path, "rb") as wf:
            sr = wf.getframerate()
            ch = wf.getnchannels()
            sw = wf.getsampwidth()
            frames = wf.readframes(wf.getnframes())
        if sw == 2:
            audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        elif sw == 4:
            audio = np.frombuffer(frames, dtype=np.int32).astype(np.float32) / 2147483648.0
        elif sw == 1:
            audio = (np.frombuffer(frames, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
        else:
            raise RuntimeError(f"Unsupported WAV sample width: {sw}")
        if ch > 1:
            audio = audio.reshape(-1, ch)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    duration_sec = float(len(audio)) / float(sr) if sr > 0 else 0.0
    if sr != 16000 and sr > 0 and len(audio) > 0:
        target_len = max(1, int(round(len(audio) * 16000.0 / float(sr))))
        x_old = np.linspace(0.0, 1.0, num=len(audio), endpoint=False)
        x_new = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
        audio = np.interp(x_new, x_old, audio).astype(np.float32)
    return audio.astype(np.float32), duration_sec

def map_fw_model(model_name):
    mapping = {
        "openai/whisper-tiny": "tiny",
        "openai/whisper-tiny.en": "tiny.en",
        "openai/whisper-base": "base",
        "openai/whisper-base.en": "base.en",
        "openai/whisper-small": "small",
        "openai/whisper-small.en": "small.en",
        "openai/whisper-medium": "medium",
        "openai/whisper-medium.en": "medium.en",
        "openai/whisper-large-v3": "large-v3",
        "openai/whisper-large-v3-turbo": "large-v3-turbo",
    }
    return mapping.get(model_name, model_name)

def main():
    wav_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else "openai/whisper-base"
    lang = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else "auto"
    audio, duration_sec = load_wav_16k_mono(wav_path)
    lang_arg = None if (not lang or lang == "auto") else lang

    try:
        from faster_whisper import WhisperModel
        fw_id = map_fw_model(model_name)
        fw_model = WhisperModel(fw_id, device="cpu", compute_type="int8")
        try:
            seg_iter, info = fw_model.transcribe(audio, language=lang_arg, vad_filter=True)
            seg_list = list(seg_iter)
        except Exception:
            seg_iter, info = fw_model.transcribe(audio, language=lang_arg, vad_filter=False)
            seg_list = list(seg_iter)
        segments = []
        parts = []
        for s in seg_list:
            txt = (s.text or "").strip()
            if not txt:
                continue
            parts.append(txt)
            segments.append({"start": float(s.start), "end": float(s.end), "text": txt})
        out = {
            "ok": True,
            "engine": "python-whisper:faster-whisper",
            "model": model_name,
            "language": getattr(info, "language", None) or lang or "en",
            "durationSec": float(getattr(info, "duration", 0) or duration_sec),
            "text": " ".join(parts).strip(),
            "segments": segments,
        }
        sys.stdout.write("@@FM_ASR_JSON@@" + json.dumps(out) + "\\n")
        return
    except ImportError:
        pass

    import torch
    from transformers import pipeline
    device = "cuda:0" if torch.cuda.is_available() else ("mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else "cpu")
    asr = pipeline(
        "automatic-speech-recognition",
        model=model_name,
        device=device,
        return_timestamps=True,
        chunk_length_s=30,
    )
    kwargs = {}
    if lang_arg and not model_name.endswith(".en"):
        kwargs["generate_kwargs"] = {"language": lang_arg}
    res = asr({"array": audio, "sampling_rate": 16000}, **kwargs)
    full_text = str(res.get("text") or "").strip()
    segments = []
    for ch in res.get("chunks") or []:
        txt = str(ch.get("text") or "").strip()
        if not txt:
            continue
        ts = ch.get("timestamp") or (0.0, duration_sec)
        start = float(ts[0]) if ts[0] is not None else 0.0
        end = float(ts[1]) if len(ts) > 1 and ts[1] is not None else max(start + 0.5, duration_sec)
        segments.append({"start": start, "end": end, "text": txt})
    out = {
        "ok": True,
        "engine": "python-whisper:transformers",
        "model": model_name,
        "language": lang_arg or "en",
        "durationSec": duration_sec,
        "text": full_text,
        "segments": segments,
    }
    sys.stdout.write("@@FM_ASR_JSON@@" + json.dumps(out) + "\\n")

if __name__ == "__main__":
    main()
`;

async function runWhisperCliTier(
  ctx: FmContext,
  mediaAbsPath: string,
  prep: PreparedAudio,
  tmpDir: string,
  model: string,
  language: string,
): Promise<RawAsrOutput> {
  const spec = findWhisperCli(ctx);
  if (!spec) {
    throw new FmError(
      "ASR_ENGINE_UNAVAILABLE",
      "No whisper-cli, mlx_whisper, faster-whisper, or whisper binary found.",
    );
  }
  const inputPath = prep.wavPath ?? mediaAbsPath;
  const outPrefix = nodePath.join(tmpDir, "transcript");
  const lang = language && language !== "auto" ? language : "";
  const shortModel = model.startsWith("openai/whisper-")
    ? model.slice("openai/whisper-".length)
    : "";

  let argv: string[];
  if (spec.kind === "whisper-cli") {
    argv = [
      spec.bin,
      "-oj",
      "-osrt",
      "-otxt",
      "-of",
      outPrefix,
      ...(lang ? ["-l", lang] : []),
      ...(model && existsSync(model) ? ["-m", model] : []),
      "-f",
      inputPath,
    ];
  } else if (spec.kind === "mlx_whisper") {
    argv = [
      spec.bin,
      "--output-format",
      "all",
      "--output-dir",
      tmpDir,
      "--output-name",
      "transcript",
      ...(lang ? ["--language", lang] : []),
      ...(model.startsWith("mlx-community/") ? ["--model", model] : []),
      "--",
      inputPath,
    ];
  } else if (spec.kind === "faster-whisper") {
    argv = [
      spec.bin,
      "--output_format",
      "json",
      "--output_dir",
      tmpDir,
      ...(lang ? ["--language", lang] : []),
      ...(shortModel ? ["--model", shortModel] : []),
      inputPath,
    ];
  } else {
    argv = [
      spec.bin,
      "--output_format",
      "all",
      "--output_dir",
      tmpDir,
      ...(lang ? ["--language", lang] : []),
      ...(shortModel ? ["--model", shortModel] : []),
      "--",
      inputPath,
    ];
  }

  const res = await runProcess(argv, childEnv(ctx), 300_000);
  if (res.timedOut) {
    throw new FmError("ASR_TIMEOUT", `${spec.kind} timed out.`);
  }

  const inputStem = splitName(basenameAny(inputPath))[0] || "input";
  const stems = [outPrefix, nodePath.join(tmpDir, inputStem)];

  for (const base of stems) {
    const jsonFile = `${base}.json`;
    if (existsSync(jsonFile)) {
      const parsed = parseWhisperJsonOutput(
        await fsp.readFile(jsonFile, "utf8"),
        prep.durationSec,
      );
      if (parsed && (parsed.text || parsed.segments.length > 0)) {
        const norm = normalizeSegmentsAndText(
          parsed.text,
          parsed.segments,
          prep.durationSec,
        );
        return {
          ...norm,
          engine: `whisper-cli:${spec.kind}`,
          model: model || spec.kind,
          language: parsed.language || language || "auto",
        };
      }
    }
  }

  for (const base of stems) {
    const srtFile = `${base}.srt`;
    if (existsSync(srtFile)) {
      const segs = parseSrtOrVttSegments(await fsp.readFile(srtFile, "utf8"));
      if (segs.length > 0) {
        const norm = normalizeSegmentsAndText("", segs, prep.durationSec);
        return {
          ...norm,
          engine: `whisper-cli:${spec.kind}`,
          model: model || spec.kind,
          language: language || "auto",
        };
      }
    }
  }

  for (const base of stems) {
    const txtFile = `${base}.txt`;
    if (existsSync(txtFile)) {
      const txt = (await fsp.readFile(txtFile, "utf8")).trim();
      if (txt) {
        const norm = normalizeSegmentsAndText(txt, undefined, prep.durationSec);
        return {
          ...norm,
          engine: `whisper-cli:${spec.kind}`,
          model: model || spec.kind,
          language: language || "auto",
        };
      }
    }
  }

  const stdoutTrimmed = res.stdout.trim();
  if (res.code === 0 && stdoutTrimmed) {
    const parsedJson = parseWhisperJsonOutput(stdoutTrimmed, prep.durationSec);
    if (parsedJson) {
      const norm = normalizeSegmentsAndText(
        parsedJson.text,
        parsedJson.segments,
        prep.durationSec,
      );
      return {
        ...norm,
        engine: `whisper-cli:${spec.kind}`,
        model: model || spec.kind,
        language: parsedJson.language || language || "auto",
      };
    }
    const norm = normalizeSegmentsAndText(
      stdoutTrimmed,
      undefined,
      prep.durationSec,
    );
    return {
      ...norm,
      engine: `whisper-cli:${spec.kind}`,
      model: model || spec.kind,
      language: language || "auto",
    };
  }

  throw new FmError(
    "ASR_FAILED",
    res.stderr.trim() || `${spec.kind} exited with code ${res.code}.`,
  );
}

async function runPythonWhisperTier(
  ctx: FmContext,
  prep: PreparedAudio,
  tmpDir: string,
  model: string,
  language: string,
): Promise<RawAsrOutput> {
  if (!prep.wavPath) {
    throw new FmError(
      "ASR_NEEDS_FFMPEG",
      "FFmpeg is required to convert non-WAV media to 16 kHz WAV for python-whisper.",
    );
  }
  const candidates = discoverAsrPythonCandidates(ctx);
  let selectedPy: string | null = null;
  for (const cand of candidates) {
    if (await probePythonAsrAvailable(ctx, cand.pythonPath)) {
      selectedPy = cand.pythonPath;
      break;
    }
  }
  if (!selectedPy) {
    throw new FmError(
      "ASR_ENGINE_UNAVAILABLE",
      "No Python Whisper environment (asr-env or f5-mlx-env) with faster-whisper or transformers is installed.",
    );
  }

  const effectiveModel = model || defaultPythonWhisperModel(ctx);
  const scriptPath = nodePath.join(tmpDir, "run_whisper.py");
  await fsp.writeFile(scriptPath, PYTHON_WHISPER_SCRIPT, {
    encoding: "utf8",
    mode: 0o600,
  });

  const res = await runProcess(
    [selectedPy, scriptPath, prep.wavPath, effectiveModel, language || "auto"],
    childEnv(ctx),
    300_000,
  );
  if (res.timedOut) {
    throw new FmError("ASR_TIMEOUT", "Python Whisper transcription timed out.");
  }

  const marker = "@@FM_ASR_JSON@@";
  const markerIdx = res.stdout.lastIndexOf(marker);
  const jsonText =
    markerIdx >= 0
      ? res.stdout.slice(markerIdx + marker.length).trim()
      : res.stdout.trim();
  const parsed = parseWhisperJsonOutput(jsonText, prep.durationSec);
  if (res.code === 0 && parsed) {
    let rawObj: any = null;
    try {
      rawObj = JSON.parse(jsonText);
    } catch {}
    const norm = normalizeSegmentsAndText(
      parsed.text,
      parsed.segments,
      Number(rawObj?.durationSec || prep.durationSec),
    );
    return {
      ...norm,
      engine: String(rawObj?.engine || "python-whisper"),
      model: String(rawObj?.model || effectiveModel),
      language: parsed.language || language || "auto",
    };
  }

  throw new FmError(
    "ASR_FAILED",
    res.stderr.trim() || `Python Whisper exited with code ${res.code}.`,
  );
}

async function runOpenAiAsrTier(
  mediaAbsPath: string,
  prep: PreparedAudio,
  model: string,
  language: string,
): Promise<RawAsrOutput> {
  const filePath = prep.wavPath ?? mediaAbsPath;
  const bytes = await fsp.readFile(filePath);
  const fileName = basenameAny(filePath);
  const mime = prep.isWav ? "audio/wav" : "application/octet-stream";

  let lastErr = "No OpenAI-compatible ASR endpoint responded.";
  for (const baseUrl of getOpenAiAsrBaseUrls()) {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), fileName);
    form.append("model", model || "whisper-1");
    form.append("response_format", "verbose_json");
    if (language && language !== "auto") {
      form.append("language", language);
    }
    try {
      const res = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status} from ${baseUrl}/v1/audio/transcriptions`;
        continue;
      }
      const rawText = await res.text();
      const parsed = parseWhisperJsonOutput(rawText, prep.durationSec);
      if (parsed) {
        let jsonData: any = null;
        try {
          jsonData = JSON.parse(rawText);
        } catch {}
        const dur = Number(jsonData?.duration || prep.durationSec);
        const norm = normalizeSegmentsAndText(
          parsed.text,
          parsed.segments,
          dur,
        );
        return {
          ...norm,
          engine: "openai-asr",
          model: String(jsonData?.model || model || "whisper-1"),
          language: parsed.language || language || "auto",
        };
      }
      if (rawText.trim()) {
        const norm = normalizeSegmentsAndText(
          rawText,
          undefined,
          prep.durationSec,
        );
        return {
          ...norm,
          engine: "openai-asr",
          model: model || "whisper-1",
          language: language || "auto",
        };
      }
    } catch (err) {
      lastErr = (err as Error)?.message ?? String(err);
    }
  }
  throw new FmError("ASR_ENGINE_UNAVAILABLE", lastErr);
}

async function runOllamaOmniTier(
  ctx: FmContext,
  mediaAbsPath: string,
  prep: PreparedAudio,
  language: string,
): Promise<RawAsrOutput> {
  const status = await probeOllamaStatus(ctx);
  if (!status.ollamaAvailable || !status.omniModel) {
    throw new FmError(
      "ASR_ENGINE_UNAVAILABLE",
      "Ollama lfm3-omni model is not installed or Ollama is offline.",
    );
  }
  const filePath = prep.wavPath ?? mediaAbsPath;
  const bytes = await fsp.readFile(filePath);
  const b64 = Buffer.from(bytes).toString("base64");
  const prompt = `Transcribe all spoken words in this audio accurately${language && language !== "auto" ? ` (language: ${language})` : ""}. Output only the verbatim transcript.`;

  const { ollamaFetchJson } = await import("./fmOllama");
  // Try native Ollama /api/chat audio array first, then OpenAI-compatible input_audio fallback.
  const chatRes = await ollamaFetchJson(ctx, "/api/chat", {
    method: "POST",
    timeoutMs: 90_000,
    body: JSON.stringify({
      model: status.omniModel,
      stream: false,
      messages: [{ role: "user", content: prompt, audio: [b64] }],
    }),
  });

  let text = String(chatRes.data?.message?.content ?? "").trim();
  if (!chatRes.ok || !text) {
    const oaiRes = await ollamaFetchJson(ctx, "/v1/chat/completions", {
      method: "POST",
      timeoutMs: 90_000,
      body: JSON.stringify({
        model: status.omniModel,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "input_audio",
                input_audio: {
                  data: b64,
                  format: prep.isWav ? "wav" : "mp3",
                },
              },
            ],
          },
        ],
      }),
    });
    text = String(oaiRes.data?.choices?.[0]?.message?.content ?? "").trim();
  }

  if (!text) {
    throw new FmError(
      "ASR_FAILED",
      "Ollama lfm3-omni returned an empty transcript.",
    );
  }
  const norm = normalizeSegmentsAndText(text, undefined, prep.durationSec);
  return {
    ...norm,
    engine: "ollama-omni",
    model: status.omniModel,
    language: language || "auto",
  };
}

const MACOS_SF_SPEECH_SWIFT = `
import Foundation
import Speech

let args = CommandLine.arguments
guard args.count >= 2 else { exit(2) }
let audioURL = URL(fileURLWithPath: args[1])
let langArg = args.count >= 3 ? args[2] : "auto"
let locale = (langArg != "auto" && !langArg.isEmpty) ? Locale(identifier: langArg) : Locale.current
guard let rec = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer(), rec.isAvailable else {
  fputs("SFSpeechRecognizer is unavailable.\\n", stderr)
  exit(3)
}

let sem = DispatchSemaphore(value: 0)
var outText = ""
var outSegs: [[String: Any]] = []
var outErr: String? = nil

SFSpeechRecognizer.requestAuthorization { status in
  guard status == .authorized else {
    outErr = "Speech recognition permission not granted (\\(status.rawValue))."
    sem.signal()
    return
  }
  let req = SFSpeechURLRecognitionRequest(url: audioURL)
  req.shouldReportPartialResults = false
  if #available(macOS 10.15, *) {
    if rec.supportsOnDeviceRecognition {
      req.requiresOnDeviceRecognition = true
    }
  }
  rec.recognitionTask(with: req) { result, error in
    if let error = error {
      outErr = error.localizedDescription
      sem.signal()
      return
    }
    if let res = result, res.isFinal {
      outText = res.bestTranscription.formattedString
      for s in res.bestTranscription.segments {
        outSegs.append([
          "start": s.timestamp,
          "end": s.timestamp + s.duration,
          "text": s.substring
        ])
      }
      sem.signal()
    }
  }
}

let waitRes = sem.wait(timeout: .now() + 90)
if waitRes == .timedOut {
  fputs("macOS SFSpeechRecognizer timed out.\\n", stderr)
  exit(5)
}
if outText.isEmpty, let err = outErr {
  fputs(err + "\\n", stderr)
  exit(4)
}
let payload: [String: Any] = ["text": outText, "segments": outSegs]
if let data = try? JSONSerialization.data(withJSONObject: payload),
   let str = String(data: data, encoding: .utf8) {
  print(str)
}
`;

async function runOsNativeTier(
  ctx: FmContext,
  mediaAbsPath: string,
  prep: PreparedAudio,
  tmpDir: string,
  language: string,
): Promise<RawAsrOutput> {
  const runner = findOsNativeRunner(ctx);
  if (!runner.available || !runner.executable) {
    throw new FmError("ASR_ENGINE_UNAVAILABLE", runner.detail);
  }

  if (ctx.platform === "darwin") {
    const swiftPath = nodePath.join(tmpDir, "sf_transcribe.swift");
    await fsp.writeFile(swiftPath, MACOS_SF_SPEECH_SWIFT, {
      encoding: "utf8",
      mode: 0o600,
    });
    const inputPath = prep.wavPath ?? mediaAbsPath;
    const res = await runProcess(
      [runner.executable, swiftPath, inputPath, language || "auto"],
      childEnv(ctx),
      95_000,
    );
    const parsed = parseWhisperJsonOutput(res.stdout.trim(), prep.durationSec);
    if (res.code === 0 && parsed && parsed.text.trim()) {
      const norm = normalizeSegmentsAndText(
        parsed.text,
        parsed.segments,
        prep.durationSec,
      );
      return {
        ...norm,
        engine: "os-native:sfspeech",
        model: "SFSpeechRecognizer",
        language: language || "auto",
      };
    }
    throw new FmError(
      "ASR_FAILED",
      res.stderr.trim() || "macOS SFSpeechRecognizer returned no transcript.",
    );
  }

  if (ctx.platform === "win32") {
    if (!prep.wavPath) {
      throw new FmError(
        "ASR_NEEDS_FFMPEG",
        "FFmpeg is required to convert non-WAV media for Windows SpeechRecognitionEngine.",
      );
    }
    const psScript = [
      "Add-Type -AssemblyName System.Speech;",
      "$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine;",
      "$rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar));",
      "$rec.SetInputToWaveFile($env:FM_ASR_WAV);",
      "$segs = New-Object System.Collections.Generic.List[object];",
      "$texts = New-Object System.Collections.Generic.List[string];",
      "while ($true) {",
      "  $r = $rec.Recognize();",
      "  if ($null -eq $r) { break }",
      "  $t = [string]$r.Text;",
      "  if ($t) {",
      "    $texts.Add($t);",
      "    $start = if ($r.Audio) { [double]$r.Audio.AudioPosition.TotalSeconds } else { 0 };",
      "    $dur = if ($r.Audio) { [double]$r.Audio.Duration.TotalSeconds } else { 0 };",
      "    $segs.Add(@{ start = $start; end = $start + $dur; text = $t });",
      "  }",
      "}",
      "$rec.Dispose();",
      "@{ text = ($texts -join ' '); segments = $segs } | ConvertTo-Json -Compress -Depth 4",
    ].join(" ");
    const env = {
      ...childEnv(ctx),
      FM_ASR_WAV: prep.wavPath,
      FM_ASR_LANG: language || "auto",
    };
    const res = await runProcess(
      [
        runner.executable,
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        psScript,
      ],
      env,
      120_000,
    );
    const parsed = parseWhisperJsonOutput(res.stdout.trim(), prep.durationSec);
    if (res.code === 0 && parsed && parsed.text.trim()) {
      const norm = normalizeSegmentsAndText(
        parsed.text,
        parsed.segments,
        prep.durationSec,
      );
      return {
        ...norm,
        engine: "os-native:win-speech",
        model: "System.Speech.Recognition",
        language: language || "auto",
      };
    }
    throw new FmError(
      "ASR_FAILED",
      res.stderr.trim() ||
        "Windows SpeechRecognitionEngine returned no transcript.",
    );
  }

  throw new FmError("ASR_ENGINE_UNAVAILABLE", runner.detail);
}

async function runCompanionSubtitleTier(
  ctx: FmContext,
  mediaAbsPath: string,
  prep: PreparedAudio,
  tmpDir: string,
  language: string,
): Promise<RawAsrOutput> {
  const p = pathApi(ctx);
  const dir = p.dirname(mediaAbsPath);
  const base = p.basename(mediaAbsPath);
  const [stem] = splitName(base);

  for (const ext of ["srt", "vtt", "lrc"] as const) {
    for (const cand of [
      p.join(dir, `${stem}.${ext}`),
      p.join(dir, `${base}.${ext}`),
    ]) {
      if (!existsSync(cand)) continue;
      const content = await fsp.readFile(cand, "utf8").catch(() => "");
      if (!content.trim()) continue;
      const segs =
        ext === "lrc"
          ? parseLrcSegments(content, prep.durationSec)
          : parseSrtOrVttSegments(content);
      if (segs.length > 0) {
        const norm = normalizeSegmentsAndText("", segs, prep.durationSec);
        return {
          ...norm,
          engine: `companion:sidecar-${ext}`,
          model: "sidecar",
          language: language || "auto",
        };
      }
    }
  }

  if (prep.ffmpegPath) {
    const outSrt = nodePath.join(tmpDir, "embedded.srt");
    const res = await runProcess(
      [
        prep.ffmpegPath,
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        mediaAbsPath,
        "-map",
        "0:s:0",
        outSrt,
      ],
      childEnv(ctx),
      45_000,
    );
    if (res.code === 0 && existsSync(outSrt)) {
      const content = await fsp.readFile(outSrt, "utf8").catch(() => "");
      const segs = parseSrtOrVttSegments(content);
      if (segs.length > 0) {
        const norm = normalizeSegmentsAndText("", segs, prep.durationSec);
        return {
          ...norm,
          engine: "companion:embedded-srt",
          model: "embedded-subtitles",
          language: language || "auto",
        };
      }
    }
  }

  throw new FmError(
    "ASR_ENGINE_UNAVAILABLE",
    "No sidecar (.srt/.vtt/.lrc) or embedded subtitle track found.",
  );
}

async function executeEngineOrder(
  ctx: FmContext,
  mediaAbsPath: string,
  prep: PreparedAudio,
  tmpDir: string,
  engine: TranscribeEngineId,
  model: string,
  language: string,
): Promise<RawAsrOutput> {
  const order: Array<Exclude<TranscribeEngineId, "auto">> =
    engine === "auto"
      ? [
          "whisper-cli",
          "python-whisper",
          "openai-asr",
          "ollama-omni",
          "os-native",
          "companion",
        ]
      : [engine];

  const failures: string[] = [];
  for (const tier of order) {
    try {
      if (tier === "whisper-cli") {
        return await runWhisperCliTier(
          ctx,
          mediaAbsPath,
          prep,
          tmpDir,
          model,
          language,
        );
      }
      if (tier === "python-whisper") {
        return await runPythonWhisperTier(ctx, prep, tmpDir, model, language);
      }
      if (tier === "openai-asr") {
        return await runOpenAiAsrTier(mediaAbsPath, prep, model, language);
      }
      if (tier === "ollama-omni") {
        return await runOllamaOmniTier(ctx, mediaAbsPath, prep, language);
      }
      if (tier === "os-native") {
        return await runOsNativeTier(ctx, mediaAbsPath, prep, tmpDir, language);
      }
      if (tier === "companion") {
        return await runCompanionSubtitleTier(
          ctx,
          mediaAbsPath,
          prep,
          tmpDir,
          language,
        );
      }
    } catch (err) {
      if (order.length === 1 && err instanceof FmError) {
        throw err;
      }
      failures.push(`${tier}: ${(err as Error)?.message || "unavailable"}`);
    }
  }

  throw new FmError(
    "ASR_ENGINE_UNAVAILABLE",
    `No local ASR engine could transcribe "${basenameAny(mediaAbsPath)}". Install Local Whisper AI or FFmpeg + Whisper CLI. Details: ${failures.join(" | ")}`,
  );
}

/** Runs the 6-tier local ASR engine directly on an audio/video file path on disk. */
export async function runLocalAsrEngine(
  ctx: FmContext,
  mediaAbsPath: string,
  opts: {
    engine?: TranscribeEngineId;
    model?: string;
    language?: string;
  } = {},
): Promise<{
  text: string;
  segments: TranscribeSegment[];
  engine: string;
  model: string;
  language: string;
  durationSec: number;
}> {
  const engine = normalizeEngine(opts.engine);
  const model = String(opts.model ?? "").trim();
  const language = String(opts.language ?? "auto").trim() || "auto";
  const rawPath = String(mediaAbsPath ?? "").trim();
  if (!rawPath || rawPath.includes("\0")) {
    throw new FmError("BAD_PATH", "Invalid or empty media file path.");
  }
  const st = await fsp.stat(rawPath).catch(() => null);
  if (!st || !st.isFile()) {
    throw new FmError("NOT_FOUND", `Media file not found: ${rawPath}`);
  }
  const tmpDir = createSessionTempDirSync("fm-asr-");
  try {
    const prep = await prepareAudioForAsr(ctx, rawPath, tmpDir, false);
    return await executeEngineOrder(
      ctx,
      rawPath,
      prep,
      tmpDir,
      engine,
      model,
      language,
    );
  } finally {
    removePathForceSync(tmpDir);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Optional AI Summarization via Local Ollama
// ---------------------------------------------------------------------------------------------------------------

async function summarizeTranscriptWithOllama(
  ctx: FmContext,
  fileName: string,
  text: string,
  segments: TranscribeSegment[],
): Promise<{
  summary: string | null;
  actionItems: string[];
  chapters: Array<{ start: number; title: string }>;
}> {
  const empty = { summary: null, actionItems: [], chapters: [] };
  if (!text.trim()) return empty;

  try {
    const status = await probeOllamaStatus(ctx);
    if (!status.ollamaAvailable || !status.chatModel) return empty;

    const { ollamaFetchJson } = await import("./fmOllama");
    const segPreview = segments
      .slice(0, 80)
      .map((s) => `[${Math.round(s.start)}s] ${s.text}`)
      .join("\n")
      .slice(0, 14_000);

    const prompt = [
      `Analyze this transcript for "${fileName}".`,
      `Return ONLY valid JSON with keys:`,
      `- "summary": concise 2-4 sentence executive summary string`,
      `- "actionItems": array of concrete action item strings (empty array if none)`,
      `- "chapters": array of { "start": number_in_seconds, "title": string }`,
      "",
      segPreview || text.slice(0, 14_000),
    ].join("\n");

    const res = await ollamaFetchJson(ctx, "/api/chat", {
      method: "POST",
      timeoutMs: 18_000,
      body: JSON.stringify({
        model: status.chatModel,
        stream: false,
        format: "json",
        think: false,
        messages: [
          {
            role: "system",
            content:
              "You summarize audio transcripts into structured JSON with summary, actionItems, and chapters.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return empty;

    let rawContent = String(res.data?.message?.content ?? "").trim();
    rawContent = rawContent
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    if (!rawContent) return empty;

    const parsed = JSON.parse(rawContent);
    const summary =
      typeof parsed?.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : null;
    const actionItems = Array.isArray(parsed?.actionItems)
      ? parsed.actionItems
          .map((item: unknown) => String(item ?? "").trim())
          .filter(Boolean)
      : [];
    const chapters = Array.isArray(parsed?.chapters)
      ? parsed.chapters
          .map((c: any) => ({
            start: Math.max(0, Number(c?.start) || 0),
            title: String(c?.title ?? "").trim(),
          }))
          .filter((c: { start: number; title: string }) => Boolean(c.title))
      : [];
    return { summary, actionItems, chapters };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 8. Core Batch & Microphone Transcription Workflows
// ---------------------------------------------------------------------------------------------------------------

async function transcribeResolvedFile(
  ctx: FmContext,
  mediaAbsPath: string,
  displaySourcePath: string,
  displayFileName: string,
  options: Omit<TranscribeRunOptions, "paths">,
  hooks?: TranscribeHooks,
  outputDirAbs?: string,
): Promise<TranscribeSingleResult> {
  const t0 = Date.now();
  const engine = normalizeEngine(options.engine);
  const format = normalizeFormat(options.format);
  const language = String(options.language ?? "auto").trim() || "auto";
  const enhanceAudio = Boolean(options.enhanceAudio);
  const summarize = Boolean(options.summarize);
  const saveSidecar = Boolean(options.saveSidecar);
  const requestedModel = String(options.model ?? "").trim();

  const tmpDir = createSessionTempDirSync("fm-transcribe-");
  let rawOut: RawAsrOutput;
  let prepDurationSec = 0;

  try {
    const prep = await prepareAudioForAsr(
      ctx,
      mediaAbsPath,
      tmpDir,
      enhanceAudio,
    );
    prepDurationSec = prep.durationSec;

    if (hooks?.transcribeWav) {
      const hookModel = requestedModel || defaultPythonWhisperModel(ctx);
      const hooked = await hooks.transcribeWav(prep.wavPath ?? mediaAbsPath, {
        engine,
        model: hookModel,
        language,
      });
      const norm = normalizeSegmentsAndText(
        hooked.text,
        hooked.segments,
        Number(hooked.durationSec ?? prep.durationSec),
      );
      rawOut = {
        ...norm,
        engine: hooked.engine || (engine === "auto" ? "hook" : engine),
        model: hooked.model || hookModel,
        language: hooked.language || language,
      };
    } else {
      rawOut = await executeEngineOrder(
        ctx,
        mediaAbsPath,
        prep,
        tmpDir,
        engine,
        requestedModel,
        language,
      );
    }
  } finally {
    removePathForceSync(tmpDir);
  }

  const finalNorm = normalizeSegmentsAndText(
    rawOut.text,
    rawOut.segments,
    rawOut.durationSec || prepDurationSec,
  );
  const aiNotes = summarize
    ? await summarizeTranscriptWithOllama(
        ctx,
        displayFileName,
        finalNorm.text,
        finalNorm.segments,
      )
    : { summary: null, actionItems: [], chapters: [] };

  const formatted = formatTranscriptOutput(
    {
      fileName: displayFileName,
      engine: rawOut.engine,
      model: rawOut.model,
      language: rawOut.language,
      durationSec: finalNorm.durationSec,
      text: finalNorm.text,
      segments: finalNorm.segments,
      summary: aiNotes.summary,
      actionItems: aiNotes.actionItems,
      chapters: aiNotes.chapters,
    },
    format,
  );

  let savedPath: string | null = null;
  if (saveSidecar) {
    const destDir = outputDirAbs ?? pathApi(ctx).dirname(mediaAbsPath);
    assertCreatable(ctx, destDir);
    await fsp.mkdir(destDir, { recursive: true });
    assertRealpathInsideSandboxSync(
      destDir,
      ctx.sandboxRoot,
      realpathCheckPlatform(ctx, destDir),
    );

    const stem = splitName(displayFileName)[0] || "transcript";
    const wantedName = `${stem}.${format}`;
    const nameErr = validateName(wantedName, ctx.platform);
    if (nameErr) throw new FmError("BAD_NAME", nameErr);

    const taken = await readTakenNames(destDir, ctx.platform);
    const chosenName = uniqueName(wantedName, (cand) =>
      taken.has(normCase(cand, ctx.platform)),
    );
    const outAbs = pathApi(ctx).join(destDir, chosenName);
    assertModifiable(ctx, outAbs);
    assertRealpathInsideSandboxSync(
      outAbs,
      ctx.sandboxRoot,
      realpathCheckPlatform(ctx, outAbs),
    );
    await writeNewFileExclusiveAsync(outAbs, formatted);
    savedPath = outAbs;
  }

  return {
    sourcePath: displaySourcePath,
    fileName: displayFileName,
    engine: rawOut.engine,
    model: rawOut.model,
    language: rawOut.language,
    durationSec: finalNorm.durationSec,
    elapsedMs: Math.max(1, Date.now() - t0),
    wordCount: countWords(finalNorm.text),
    text: finalNorm.text,
    segments: finalNorm.segments,
    formatted,
    format,
    summary: aiNotes.summary,
    actionItems: aiNotes.actionItems,
    chapters: aiNotes.chapters,
    savedPath,
  };
}

/** Transcribes one or more workspace media files using the configured ASR engine (or `hooks.transcribeWav`). */
export async function transcribeAudioPaths(
  ctx: FmContext,
  options: TranscribeRunOptions,
  hooks?: TranscribeHooks,
): Promise<{ results: TranscribeSingleResult[]; count: number }> {
  const rawPaths = Array.isArray(options?.paths)
    ? options.paths.map((p) => String(p ?? "").trim()).filter(Boolean)
    : [];
  if (rawPaths.length === 0) {
    throw new FmError(
      "INVALID_INPUT",
      "Select one or more audio or video files to transcribe.",
    );
  }

  normalizeEngine(options?.engine);
  normalizeFormat(options?.format);

  let outputDirAbs: string | undefined;
  if (typeof options.outputDir === "string" && options.outputDir.trim()) {
    outputDirAbs = resolveSaveFolder(ctx, options.outputDir);
    await fsp.mkdir(outputDirAbs, { recursive: true });
    assertRealpathInsideSandboxSync(
      outputDirAbs,
      ctx.sandboxRoot,
      realpathCheckPlatform(ctx, outputDirAbs),
    );
  }

  const resolvedFiles: string[] = [];
  for (const raw of rawPaths) {
    const abs = resolveInsideSandbox(ctx, raw);
    const st = await fsp.stat(abs).catch(() => null);
    if (!st || !st.isFile()) {
      throw new FmError("NOT_FOUND", `Media file not found: ${raw}`);
    }
    resolvedFiles.push(abs);
  }

  const results: TranscribeSingleResult[] = [];
  for (const mediaAbs of resolvedFiles) {
    const fileName = basenameAny(mediaAbs);
    results.push(
      await transcribeResolvedFile(
        ctx,
        mediaAbs,
        mediaAbs,
        fileName,
        options,
        hooks,
        outputDirAbs,
      ),
    );
  }

  return { results, count: results.length };
}

function inferMicExtension(
  buf: Buffer,
  mimeType?: string,
  fileName?: string,
): string {
  if (
    buf.byteLength >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "wav";
  }
  const mime = String(mimeType ?? "").toLowerCase();
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac"))
    return "m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("flac")) return "flac";

  if (typeof fileName === "string") {
    const dot = fileName.lastIndexOf(".");
    if (dot > 0 && dot < fileName.length - 1) {
      const ext = fileName.slice(dot + 1).toLowerCase();
      if (TRANSCRIBE_MEDIA_EXTS.has(ext)) return ext;
    }
  }
  return "webm";
}

/** Decodes a base64 microphone recording, optionally saves it inside the workspace, and transcribes it. */
export async function transcribeMicrophoneRecording(
  ctx: FmContext,
  payload: {
    audioBase64: string;
    mimeType?: string;
    fileName?: string;
    saveRecordingFolder?: string;
    options?: Omit<TranscribeRunOptions, "paths">;
  },
  hooks?: TranscribeHooks,
): Promise<{ recordingPath: string | null; result: TranscribeSingleResult }> {
  const rawB64 =
    typeof payload?.audioBase64 === "string" ? payload.audioBase64.trim() : "";
  if (!rawB64) {
    throw new FmError(
      "INVALID_INPUT",
      "Microphone recording audioBase64 is required.",
    );
  }
  const cleanB64 = rawB64.replace(/^data:[^;]+;base64,/i, "");
  const audioBuf = Buffer.from(cleanB64, "base64");
  if (audioBuf.byteLength === 0) {
    throw new FmError(
      "INVALID_INPUT",
      "Microphone recording payload decoded to 0 bytes.",
    );
  }
  if (audioBuf.byteLength > 20 * 1024 * 1024) {
    throw new FmError(
      "TOO_LARGE",
      "Microphone recording exceeds the 20 MB upload limit.",
    );
  }

  const ext = inferMicExtension(audioBuf, payload.mimeType, payload.fileName);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  let wantedFileName =
    typeof payload.fileName === "string" && payload.fileName.trim()
      ? payload.fileName.trim()
      : `mic-recording-${stamp}.${ext}`;
  if (!splitName(wantedFileName)[1]) {
    wantedFileName = `${wantedFileName}.${ext}`;
  }
  const nameErr = validateName(wantedFileName, ctx.platform);
  if (nameErr) throw new FmError("BAD_NAME", nameErr);

  const opts = payload.options ?? {};
  let outputDirAbs: string | undefined;
  if (typeof opts.outputDir === "string" && opts.outputDir.trim()) {
    outputDirAbs = resolveSaveFolder(ctx, opts.outputDir);
    await fsp.mkdir(outputDirAbs, { recursive: true });
    assertRealpathInsideSandboxSync(
      outputDirAbs,
      ctx.sandboxRoot,
      realpathCheckPlatform(ctx, outputDirAbs),
    );
  }

  if (
    typeof payload.saveRecordingFolder === "string" &&
    payload.saveRecordingFolder.trim()
  ) {
    const recDir = resolveSaveFolder(ctx, payload.saveRecordingFolder);
    assertCreatable(ctx, recDir);
    await fsp.mkdir(recDir, { recursive: true });
    assertRealpathInsideSandboxSync(
      recDir,
      ctx.sandboxRoot,
      realpathCheckPlatform(ctx, recDir),
    );
    const taken = await readTakenNames(recDir, ctx.platform);
    const finalRecName = uniqueName(wantedFileName, (cand) =>
      taken.has(normCase(cand, ctx.platform)),
    );
    const recordingPath = pathApi(ctx).join(recDir, finalRecName);
    assertModifiable(ctx, recordingPath);
    assertRealpathInsideSandboxSync(
      recordingPath,
      ctx.sandboxRoot,
      realpathCheckPlatform(ctx, recordingPath),
    );
    await writeNewFileExclusiveAsync(recordingPath, audioBuf);

    const result = await transcribeResolvedFile(
      ctx,
      recordingPath,
      recordingPath,
      finalRecName,
      opts,
      hooks,
      outputDirAbs,
    );
    return { recordingPath, result };
  }

  const tmpDir = createSessionTempDirSync("fm-mic-upload-");
  try {
    const tmpAudio = nodePath.join(tmpDir, wantedFileName);
    await fsp.writeFile(tmpAudio, audioBuf, { mode: 0o600 });
    const result = await transcribeResolvedFile(
      ctx,
      tmpAudio,
      wantedFileName,
      wantedFileName,
      // Do not write sidecar next to ephemeral /tmp audio unless outputDir was explicitly given.
      outputDirAbs ? opts : { ...opts, saveSidecar: false },
      hooks,
      outputDirAbs,
    );
    return { recordingPath: null, result };
  } finally {
    removePathForceSync(tmpDir);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 9. One-Click Local Whisper AI Installation Job (`startInstallLocalWhisperJob`)
// ---------------------------------------------------------------------------------------------------------------

/** Starts a background job to provision `asr-env`, install `faster-whisper` (or `transformers`), and warm the model. */
export function startInstallLocalWhisperJob(
  ctx: FmContext,
  options: { model?: string } = {},
): ReturnType<FmContext["jobs"]["start"]> {
  const targetModel =
    String(options?.model ?? "").trim() || "openai/whisper-base";
  const p = pathApi(ctx);
  const envDir = p.join(ctx.dataDir, "asr-env");
  const envVars = childEnv(ctx);

  const findSystemPython = () => {
    const names =
      ctx.platform === "win32"
        ? ["python", "python3", "py"]
        : ["python3", "python"];
    return findExecutable(ctx.platform, names, searchDirs(ctx));
  };

  return ctx.jobs.start({
    kind: "install",
    title: "Install Local Whisper AI (asr-env)",
    steps: [
      {
        label: "Create Python Virtual Environment (~/.bun_rad_studio/asr-env)",
        timeoutMs: 5 * 60 * 1000,
        prepare: async () => ({
          work: async (signal, log) => {
            const existingPy = pythonBinaryInEnv(envDir, ctx.platform);
            if (existingPy) {
              log(`Reusing existing Python environment at ${existingPy}\n`);
              return;
            }
            const sysPy = findSystemPython();
            if (!sysPy) {
              throw new Error(
                "Python 3 was not found in PATH. Install Python 3.10+ and try again.",
              );
            }
            await fsp.mkdir(p.dirname(envDir), { recursive: true });
            log(`Creating venv with ${sysPy} at ${envDir}...\n`);
            const res = await runProcess(
              [sysPy, "-m", "venv", envDir],
              envVars,
              3 * 60 * 1000,
              signal,
            );
            if (res.stdout) log(res.stdout);
            if (res.stderr) log(res.stderr);
            if (res.code !== 0) {
              throw new Error(
                res.stderr.trim() || `python -m venv exited with ${res.code}`,
              );
            }
          },
        }),
      },
      {
        label: "Install Whisper Packages (faster-whisper / transformers)",
        timeoutMs: 20 * 60 * 1000,
        prepare: async () => ({
          work: async (signal, log) => {
            const venvPy = pythonBinaryInEnv(envDir, ctx.platform);
            if (!venvPy) {
              throw new Error(`Python binary missing in ${envDir}`);
            }
            await runProcess(
              [venvPy, "-m", "pip", "install", "--upgrade", "pip"],
              envVars,
              5 * 60 * 1000,
              signal,
            );
            log("Installing faster-whisper + numpy...\n");
            const fw = await runProcess(
              [venvPy, "-m", "pip", "install", "faster-whisper", "numpy"],
              envVars,
              15 * 60 * 1000,
              signal,
            );
            if (fw.stdout) log(fw.stdout);
            if (fw.stderr) log(fw.stderr);
            if (fw.code === 0) return;

            log(
              "faster-whisper wheel unavailable; falling back to transformers + torch + scipy...\n",
            );
            const hf = await runProcess(
              [
                venvPy,
                "-m",
                "pip",
                "install",
                "transformers",
                "torch",
                "scipy",
                "numpy",
              ],
              envVars,
              20 * 60 * 1000,
              signal,
            );
            if (hf.stdout) log(hf.stdout);
            if (hf.stderr) log(hf.stderr);
            if (hf.code !== 0) {
              throw new Error(
                hf.stderr.trim() || "Failed to install local Whisper packages.",
              );
            }
          },
        }),
      },
      {
        label: `Warm Whisper Model (${targetModel})`,
        timeoutMs: 15 * 60 * 1000,
        prepare: async () => ({
          work: async (signal, log) => {
            const venvPy = pythonBinaryInEnv(envDir, ctx.platform);
            if (!venvPy) {
              throw new Error(`Python binary missing in ${envDir}`);
            }
            const warmScript = [
              "import sys",
              "m = sys.argv[1]",
              "try:",
              "    from faster_whisper import WhisperModel",
              "    short = m.replace('openai/whisper-', '')",
              "    WhisperModel(short, device='cpu', compute_type='int8')",
              "    print('Warmed faster-whisper:', short)",
              "except ImportError:",
              "    from transformers import pipeline",
              "    pipeline('automatic-speech-recognition', model=m)",
              "    print('Warmed transformers:', m)",
            ].join("\n");
            const res = await runProcess(
              [venvPy, "-c", warmScript, targetModel],
              envVars,
              15 * 60 * 1000,
              signal,
            );
            if (res.stdout) log(res.stdout);
            if (res.stderr) log(res.stderr);
            if (res.code !== 0) {
              throw new Error(
                res.stderr.trim() || `Failed to warm model ${targetModel}`,
              );
            }
            pythonProbeCache.clear();
          },
        }),
      },
    ],
  });
}

// ---------------------------------------------------------------------------------------------------------------
// 10. HTTP API Operation Table (`TRANSCRIBE_OPS`)
// ---------------------------------------------------------------------------------------------------------------

/** File Manager HTTP API handlers for `transcribe/*` operations. */
export const TRANSCRIBE_OPS: Record<string, FmHandler> = {
  "transcribe/status": (ctx) => getTranscribeStatus(ctx),

  "transcribe/run": async (ctx, b) => {
    const rec = b ?? {};
    const paths = Array.isArray(rec.paths)
      ? rec.paths.map((p: unknown) => String(p ?? "")).filter(Boolean)
      : typeof rec.path === "string" && rec.path.trim()
        ? [rec.path.trim()]
        : [];
    return transcribeAudioPaths(ctx, {
      paths,
      engine: rec.engine as TranscribeEngineId | undefined,
      model: typeof rec.model === "string" ? rec.model : undefined,
      language: typeof rec.language === "string" ? rec.language : undefined,
      format: rec.format as TranscribeFormat | undefined,
      enhanceAudio: Boolean(rec.enhanceAudio),
      summarize: Boolean(rec.summarize),
      saveSidecar: Boolean(rec.saveSidecar),
      outputDir: typeof rec.outputDir === "string" ? rec.outputDir : undefined,
    });
  },

  "transcribe/mic": async (ctx, b) => {
    const rec = b ?? {};
    return transcribeMicrophoneRecording(ctx, {
      audioBase64: typeof rec.audioBase64 === "string" ? rec.audioBase64 : "",
      mimeType: typeof rec.mimeType === "string" ? rec.mimeType : undefined,
      fileName: typeof rec.fileName === "string" ? rec.fileName : undefined,
      saveRecordingFolder:
        typeof rec.saveRecordingFolder === "string"
          ? rec.saveRecordingFolder
          : undefined,
      options:
        rec.options && typeof rec.options === "object"
          ? rec.options
          : undefined,
    });
  },

  "transcribe/format": async (_ctx, b) => {
    const rec = b ?? {};
    if (!rec.source || typeof rec.source !== "object") {
      throw new FmError(
        "BAD_REQUEST",
        "Provide a transcript source object to format.",
      );
    }
    const format = normalizeFormat(rec.format);
    const formatted = formatTranscriptOutput(rec.source, format);
    return { format, formatted };
  },

  "transcribe/save": async (ctx, b) => {
    const rec = b ?? {};
    if (typeof rec.content !== "string") {
      throw new FmError("BAD_REQUEST", "Provide transcript content to save.");
    }
    const format = normalizeFormat(rec.format);
    const folderInput =
      typeof rec.folder === "string" && rec.folder.trim()
        ? rec.folder.trim()
        : ctx.sandboxRoot || ctx.home;
    const folder = resolveSaveFolder(ctx, folderInput);
    await assertFolder(folder, "Target folder");

    let rawName =
      typeof rec.name === "string" && rec.name.trim()
        ? rec.name.trim()
        : `transcript.${format}`;
    const lowerRaw = rawName.toLowerCase();
    const hasTranscriptExt = SUPPORTED_FORMATS.some((ext) =>
      lowerRaw.endsWith(`.${ext}`),
    );
    if (!hasTranscriptExt) {
      rawName = `${rawName}.${format}`;
    }
    const nameErr = validateName(rawName, ctx.platform);
    if (nameErr) throw new FmError("BAD_NAME", nameErr);

    const taken = await readTakenNames(folder, ctx.platform);
    const finalName = uniqueName(rawName, (cand) =>
      taken.has(normCase(cand, ctx.platform)),
    );
    const savedPath = pathApi(ctx).join(folder, finalName);
    assertModifiable(ctx, savedPath);
    assertRealpathInsideSandboxSync(
      savedPath,
      ctx.sandboxRoot,
      realpathCheckPlatform(ctx, savedPath),
    );
    await fsp.writeFile(savedPath, rec.content, {
      flag: "wx",
      encoding: "utf8",
    });
    return { savedPath, name: finalName };
  },

  "transcribe/install": async (ctx, b) => {
    const rec = b ?? {};
    if (rec.confirm !== true) {
      throw new FmError(
        "NEEDS_CONFIRM",
        "Confirm to install the local Whisper AI Python environment (~/.bun_rad_studio/asr-env).",
      );
    }
    const model = typeof rec.model === "string" ? rec.model : undefined;
    return { job: startInstallLocalWhisperJob(ctx, { model }) };
  },
};
