#!/usr/bin/env bun
/**
 * 🎙️ Local AI Audio-to-Text & Subtitle Transcription CLI (`transcribe-cli`)
 *
 * Cross-platform speech-to-text transcription for audio and video files using
 * the Codecaine File Manager ASR backend (`whisper-cli`, `python-whisper`,
 * `openai-asr`, `ollama-omni`, `os-native`, or `companion`), outputting
 * Markdown, plain text, SRT, WebVTT, LRC lyrics, or structured JSON.
 *
 * Usage:
 *   bun run cli_apps/transcribe_cli.ts [options] <audio_or_video_files...>
 *   codecaine-file-manager transcribe [options] <audio_or_video_files...>
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import * as nodePath from "node:path";
import { SimpleCLI } from "../src/index.ts";
import {
  assertCreatable,
  createContext,
  type FmContext,
  type FmContextOptions,
} from "../src/features/filemanager/fmCore.ts";
import { uniqueName } from "../src/features/filemanager/fmPaths.ts";
import { resolveTool } from "../src/features/filemanager/fmToolDetect.ts";

// ============================================================================
// Shared Backend Contract Interfaces (decoupled from fmTranscribe.ts)
// ============================================================================

export type TranscribeFormat = "md" | "txt" | "srt" | "vtt" | "lrc" | "json";

export type TranscribeEngineId =
  | "auto"
  | "python-whisper"
  | "whisper-cli"
  | "openai-asr"
  | "ollama-omni"
  | "os-native"
  | "companion";

export interface TranscribeSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeChapter {
  start: number;
  title: string;
}

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
  chapters: TranscribeChapter[];
  savedPath: string | null;
}

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
  [key: string]: unknown;
}

export interface TranscribeStatus {
  ready: boolean;
  recommendedEngine: string;
  recommendedLabel: string;
  ffmpegAvailable: boolean;
  ffmpegPath: string | null;
  ollamaAvailable: boolean;
  asrEnvInstalled: boolean;
  asrEnvPython: string | null;
  engines: unknown;
  supportedExtensions: string[];
  supportedFormats: TranscribeFormat[];
  models: unknown[];
  languages: unknown[];
}

export interface TranscribeFormatSource {
  fileName: string;
  engine: string;
  model: string;
  language: string;
  durationSec: number;
  text: string;
  segments: TranscribeSegment[];
  summary?: string | null;
  actionItems?: string[];
  chapters?: TranscribeChapter[];
}

interface FmTranscribeModule {
  getTranscribeStatus: (ctx: FmContext) => Promise<TranscribeStatus>;
  transcribeAudioPaths: (
    ctx: FmContext,
    options: TranscribeRunOptions,
    hooks?: TranscribeHooks,
  ) => Promise<{ results: TranscribeSingleResult[]; count: number }>;
  formatTranscriptOutput: (
    source: TranscribeFormatSource,
    format: TranscribeFormat,
  ) => string;
}

export interface TranscribeCliIo {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  cwd?: string;
  contextOptions?: FmContextOptions;
  hooks?: TranscribeHooks;
}

export const SUPPORTED_TRANSCRIBE_FORMATS: readonly TranscribeFormat[] = [
  "md",
  "txt",
  "srt",
  "vtt",
  "lrc",
  "json",
] as const;

export const SUPPORTED_TRANSCRIBE_ENGINES: readonly TranscribeEngineId[] = [
  "auto",
  "python-whisper",
  "whisper-cli",
  "openai-asr",
  "ollama-omni",
  "os-native",
  "companion",
] as const;

const TRANSCRIBE_MEDIA_EXTS = [
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
];

// ============================================================================
// SimpleCLI Registration (for File Manager CLI Utilities Catalog discovery)
// ============================================================================

/** Builds the SimpleCLI metadata specification for `fmCliUtils` discovery. */
export function buildTranscribeCliApp(): SimpleCLI {
  const app = SimpleCLI.newApp("transcribe-cli", "1.0.0").setDescription(
    "Local AI Audio-to-Text & Subtitle Transcription CLI (Whisper, Ollama Omni, OS Speech, SRT/VTT/LRC/MD)",
  );

  app.addFlagBool(
    "status",
    "d",
    false,
    "Inspect ASR engine, FFmpeg, Ollama, and local Whisper readiness",
  );
  app.addFlagString(
    "format",
    "f",
    "md",
    "Transcript output format: md, txt, srt, vtt, lrc, or json",
  );
  app.addFlagString(
    "out",
    "o",
    "",
    "Output file path or directory to save formatted transcript(s)",
  );
  app.addFlagString(
    "engine",
    "e",
    "auto",
    "ASR engine: auto, python-whisper, whisper-cli, openai-asr, ollama-omni, os-native, companion",
  );
  app.addFlagString(
    "model",
    "m",
    "",
    "ASR model identifier (e.g. openai/whisper-tiny, openai/whisper-base, openai/whisper-small)",
  );
  app.addFlagString(
    "lang",
    "l",
    "auto",
    "Language code (e.g. auto, en, es, fr, de, ja, zh)",
  );
  app.addFlagBool(
    "enhance",
    "",
    false,
    "Apply speech enhancement audio filters before transcription",
  );
  app.addFlagBool(
    "summarize",
    "",
    false,
    "Generate AI executive summary, action items, and chapters when Ollama is available",
  );
  app.addFlagBool(
    "save",
    "",
    false,
    "Save sidecar transcript file next to each source media file",
  );
  app.addFlagBool("json", "j", false, "Format CLI output as structured JSON");

  return app;
}

// ============================================================================
// Dynamic Backend Loader & Standalone Fallback
// ============================================================================

async function loadFmTranscribeBackend(): Promise<FmTranscribeModule | null> {
  // Construct specifier dynamically so standalone typecheck works while fmTranscribe.ts is built in parallel.
  const specifier = [
    "..",
    "src",
    "features",
    "filemanager",
    "fmTranscribe",
  ].join("/");
  try {
    const mod = (await import(specifier)) as Partial<FmTranscribeModule>;
    if (
      typeof mod.getTranscribeStatus === "function" &&
      typeof mod.transcribeAudioPaths === "function" &&
      typeof mod.formatTranscriptOutput === "function"
    ) {
      return mod as FmTranscribeModule;
    }
  } catch {
    // Fallback mode is used when fmTranscribe.ts is not yet present on the branch.
  }
  return null;
}

function pad2(n: number): string {
  return String(Math.floor(Math.max(0, n))).padStart(2, "0");
}

function pad3(n: number): string {
  return String(Math.floor(Math.max(0, n))).padStart(3, "0");
}

function formatSubtitleTimestamp(sec: number, sep: "," | "."): string {
  const totalMs = Math.max(
    0,
    Math.round((Number.isFinite(sec) ? sec : 0) * 1000),
  );
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}${sep}${pad3(ms)}`;
}

function formatLrcTimestamp(sec: number): string {
  const totalCs = Math.max(
    0,
    Math.round((Number.isFinite(sec) ? sec : 0) * 100),
  );
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `[${pad2(m)}:${pad2(s)}.${pad2(cs)}]`;
}

function formatDurationSeconds(sec: number): string {
  const clean = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const mins = Math.floor(clean / 60);
  const rem = clean - mins * 60;
  return mins > 0 ? `${mins}m ${rem.toFixed(1)}s` : `${rem.toFixed(2)}s`;
}

function parseWavDurationSec(filePath: string): number {
  try {
    if (!filePath.toLowerCase().endsWith(".wav")) return 0;
    const buf = readFileSync(filePath);
    if (buf.byteLength < 44) return 0;
    if (
      buf.toString("ascii", 0, 4) !== "RIFF" ||
      buf.toString("ascii", 8, 12) !== "WAVE"
    ) {
      return 0;
    }
    let offset = 12;
    let byteRate = 0;
    let dataSize = 0;
    while (offset + 8 <= buf.byteLength) {
      const id = buf.toString("ascii", offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      if (id === "fmt " && offset + 20 <= buf.byteLength) {
        byteRate = buf.readUInt32LE(offset + 16);
      } else if (id === "data") {
        dataSize = size;
        break;
      }
      offset += 8 + size + (size % 2);
    }
    if (byteRate > 0 && dataSize > 0) {
      return Math.round((dataSize / byteRate) * 1000) / 1000;
    }
  } catch {
    // Ignore malformed WAV headers and fall back to hook duration.
  }
  return 0;
}

function normalizeSegments(
  segments: TranscribeSegment[] | undefined,
  text: string,
  durationSec: number,
): TranscribeSegment[] {
  if (Array.isArray(segments) && segments.length > 0) {
    return segments.map((seg) => ({
      start: Number(seg.start) || 0,
      end: Math.max(Number(seg.start) || 0, Number(seg.end) || 0),
      text: String(seg.text || "").trim(),
    }));
  }
  const clean = text.trim();
  if (!clean) return [];
  return [{ start: 0, end: Math.max(0.5, durationSec), text: clean }];
}

function fallbackFormatTranscriptOutput(
  source: TranscribeFormatSource,
  format: TranscribeFormat,
): string {
  const segments = normalizeSegments(
    source.segments,
    source.text,
    source.durationSec,
  );
  switch (format) {
    case "txt":
      return source.text.trim();
    case "srt":
      return segments
        .map(
          (seg, i) =>
            `${i + 1}\n${formatSubtitleTimestamp(seg.start, ",")} --> ${formatSubtitleTimestamp(seg.end, ",")}\n${seg.text}`,
        )
        .join("\n\n")
        .concat(segments.length > 0 ? "\n" : "");
    case "vtt":
      return (
        "WEBVTT\n\n" +
        segments
          .map(
            (seg) =>
              `${formatSubtitleTimestamp(seg.start, ".")} --> ${formatSubtitleTimestamp(seg.end, ".")}\n${seg.text}`,
          )
          .join("\n\n")
          .concat(segments.length > 0 ? "\n" : "")
      );
    case "lrc":
      return segments
        .map((seg) => `${formatLrcTimestamp(seg.start)}${seg.text}`)
        .join("\n")
        .concat(segments.length > 0 ? "\n" : "");
    case "json":
      return JSON.stringify(
        {
          fileName: source.fileName,
          engine: source.engine,
          model: source.model,
          language: source.language,
          durationSec: source.durationSec,
          text: source.text,
          segments,
          summary: source.summary ?? null,
          actionItems: source.actionItems ?? [],
          chapters: source.chapters ?? [],
        },
        null,
        2,
      );
    case "md": {
      const lines: string[] = [
        `# Transcript: ${source.fileName}`,
        "",
        `- **Engine:** ${source.engine}`,
        `- **Model:** ${source.model}`,
        `- **Language:** ${source.language}`,
        `- **Duration:** ${formatDurationSeconds(source.durationSec)}`,
      ];
      if (source.summary) {
        lines.push("", "## Summary", "", source.summary);
      }
      if (source.actionItems && source.actionItems.length > 0) {
        lines.push("", "## Action Items", "");
        for (const item of source.actionItems) {
          lines.push(`- [ ] ${item}`);
        }
      }
      if (source.chapters && source.chapters.length > 0) {
        lines.push("", "## Chapters", "");
        for (const ch of source.chapters) {
          lines.push(`- ${formatLrcTimestamp(ch.start)} ${ch.title}`);
        }
      }
      lines.push("", "## Transcript", "");
      if (segments.length > 0) {
        for (const seg of segments) {
          lines.push(
            `- **[${formatSubtitleTimestamp(seg.start, ".")}]** ${seg.text}`,
          );
        }
      } else {
        lines.push(source.text.trim());
      }
      return lines.join("\n") + "\n";
    }
  }
}

async function fallbackGetTranscribeStatus(
  ctx: FmContext,
): Promise<TranscribeStatus> {
  const ffmpegPath = resolveTool(ctx, "ffmpeg") || Bun.which("ffmpeg") || null;
  return {
    ready: false,
    recommendedEngine: "auto",
    recommendedLabel: "Auto ASR (Local Whisper / OS Speech)",
    ffmpegAvailable: Boolean(ffmpegPath),
    ffmpegPath,
    ollamaAvailable: false,
    asrEnvInstalled: false,
    asrEnvPython: null,
    engines: SUPPORTED_TRANSCRIBE_ENGINES.filter((id) => id !== "auto").map(
      (id) => ({
        id,
        label: id,
        available: false,
      }),
    ),
    supportedExtensions: [...TRANSCRIBE_MEDIA_EXTS],
    supportedFormats: [...SUPPORTED_TRANSCRIBE_FORMATS],
    models: [
      "openai/whisper-tiny",
      "openai/whisper-base",
      "openai/whisper-small",
      "openai/whisper-large-v3-turbo",
    ],
    languages: ["auto", "en", "es", "fr", "de", "ja", "zh", "pt", "it", "ko"],
  };
}

async function fallbackTranscribeAudioPaths(
  ctx: FmContext,
  options: TranscribeRunOptions,
  hooks?: TranscribeHooks,
): Promise<{ results: TranscribeSingleResult[]; count: number }> {
  if (!hooks?.transcribeWav) {
    throw new Error(
      "Transcription backend (fmTranscribe) is not available and no hooks.transcribeWav handler was provided.",
    );
  }
  const format: TranscribeFormat = options.format ?? "md";
  const engine: TranscribeEngineId = options.engine ?? "auto";
  const model = options.model ?? "openai/whisper-base";
  const language = options.language ?? "auto";
  const results: TranscribeSingleResult[] = [];

  for (const rawPath of options.paths) {
    const startedAt = Date.now();
    const absPath = nodePath.resolve(rawPath);
    const fileName = nodePath.basename(absPath);
    const hookRes = await hooks.transcribeWav(absPath, {
      engine,
      model,
      language,
    });
    const text = String(hookRes.text || "").trim();
    const headerDuration = parseWavDurationSec(absPath);
    const segDuration =
      hookRes.segments && hookRes.segments.length > 0
        ? Math.max(...hookRes.segments.map((s) => Number(s.end) || 0))
        : 0;
    const durationSec =
      typeof hookRes.durationSec === "number" && hookRes.durationSec > 0
        ? hookRes.durationSec
        : headerDuration || segDuration;
    const segments = normalizeSegments(hookRes.segments, text, durationSec);
    const resolvedLang = hookRes.language || language;
    const resolvedEngine = hookRes.engine || engine;
    const resolvedModel = hookRes.model || model;
    const formatted = fallbackFormatTranscriptOutput(
      {
        fileName,
        engine: resolvedEngine,
        model: resolvedModel,
        language: resolvedLang,
        durationSec,
        text,
        segments,
      },
      format,
    );

    let savedPath: string | null = null;
    if (options.saveSidecar) {
      const targetDir = options.outputDir
        ? nodePath.resolve(options.outputDir)
        : nodePath.dirname(absPath);
      const stem = nodePath.basename(absPath, nodePath.extname(absPath));
      const candidate = uniqueName(`${stem}.${format}`, (c) =>
        existsSync(nodePath.join(targetDir, c)),
      );
      const dest = nodePath.join(targetDir, candidate);
      writeTextSafely(ctx, dest, formatted);
      savedPath = dest;
    }

    results.push({
      sourcePath: absPath,
      fileName,
      engine: resolvedEngine,
      model: resolvedModel,
      language: resolvedLang,
      durationSec,
      elapsedMs: Math.max(1, Date.now() - startedAt),
      wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
      text,
      segments,
      formatted,
      format,
      summary: null,
      actionItems: [],
      chapters: [],
      savedPath,
    });
  }

  return { results, count: results.length };
}

// ============================================================================
// Safe Path & File Output Helpers
// ============================================================================

function resolveCliPath(ctx: FmContext, raw: string, cwd: string): string {
  const trimmed = raw.trim();
  if (trimmed === "~") return ctx.home;
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return nodePath.join(ctx.home, trimmed.slice(2));
  }
  return nodePath.resolve(cwd, trimmed);
}

function writeTextSafely(
  ctx: FmContext,
  destPath: string,
  content: string,
): void {
  const absDest = nodePath.resolve(destPath);
  const parentDir = nodePath.dirname(absDest);
  assertCreatable(ctx, parentDir);

  if (existsSync(absDest)) {
    const st = lstatSync(absDest);
    if (st.isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlink: ${absDest}`);
    }
    if (st.isDirectory()) {
      throw new Error(`Output path is an existing directory: ${absDest}`);
    }
  }

  mkdirSync(parentDir, { recursive: true });
  const tmpPath = nodePath.join(
    parentDir,
    `.${nodePath.basename(absDest)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  try {
    writeFileSync(tmpPath, content, { encoding: "utf8", flag: "wx" });
    renameSync(tmpPath, absDest);
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup of temp file.
    }
    throw err;
  }
}

function inferFormatFromOutPath(outFlag: string): TranscribeFormat | null {
  const trimmed = outFlag.trim();
  if (!trimmed || trimmed.endsWith("/") || trimmed.endsWith("\\")) return null;
  const ext = nodePath.extname(trimmed).replace(/^\./, "").toLowerCase();
  if ((SUPPORTED_TRANSCRIBE_FORMATS as readonly string[]).includes(ext)) {
    return ext as TranscribeFormat;
  }
  return null;
}

function writeOutResults(
  ctx: FmContext,
  results: TranscribeSingleResult[],
  outFlag: string,
  cwd: string,
): string[] {
  if (results.length === 0) return [];
  const resolvedOut = resolveCliPath(ctx, outFlag, cwd);
  const looksLikeDir =
    outFlag.endsWith("/") ||
    outFlag.endsWith("\\") ||
    (existsSync(resolvedOut) && statSync(resolvedOut).isDirectory()) ||
    results.length > 1;

  if (!looksLikeDir) {
    const single = results[0]!;
    writeTextSafely(ctx, resolvedOut, single.formatted);
    single.savedPath = resolvedOut;
    return [resolvedOut];
  }

  if (existsSync(resolvedOut)) {
    const st = lstatSync(resolvedOut);
    if (st.isSymbolicLink()) {
      throw new Error(
        `Refusing to write into symlink directory: ${resolvedOut}`,
      );
    }
    if (!st.isDirectory()) {
      throw new Error(
        `Cannot write ${results.length} transcripts to file path "${resolvedOut}". Pass a directory path to --out.`,
      );
    }
  }

  assertCreatable(ctx, resolvedOut);
  mkdirSync(resolvedOut, { recursive: true });

  const written: string[] = [];
  const usedInBatch = new Set<string>();
  for (const r of results) {
    const stem =
      nodePath.basename(r.sourcePath, nodePath.extname(r.sourcePath)) ||
      "transcript";
    const baseName = `${stem}.${r.format}`;
    const fileName = usedInBatch.has(baseName)
      ? uniqueName(
          baseName,
          (candidate) =>
            usedInBatch.has(candidate) ||
            existsSync(nodePath.join(resolvedOut, candidate)),
        )
      : baseName;
    usedInBatch.add(fileName);

    const dest = nodePath.join(resolvedOut, fileName);
    writeTextSafely(ctx, dest, r.formatted);
    r.savedPath = dest;
    written.push(dest);
  }
  return written;
}

// ============================================================================
// Help & Status Formatting
// ============================================================================

function printHelp(out: (line: string) => void): void {
  out("🎙️  Audio-to-Text AI & Subtitle Transcription CLI (transcribe-cli)");
  out(
    "   Transcribe audio and video files locally into Markdown, Plain Text, SRT, WebVTT, LRC, or JSON.",
  );
  out("");
  out("USAGE:");
  out("  bun run cli_apps/transcribe_cli.ts [options] <audio_or_video...>");
  out("  codecaine-file-manager transcribe [options] <audio_or_video...>");
  out("  codecaine-file-manager stt [options] <audio_or_video...>");
  out("  codecaine-file-manager asr [options] <audio_or_video...>");
  out("");
  out("OPTIONS:");
  out("  -h, --help                 Show this help message");
  out(
    "  -d, --status               Inspect ASR engines, FFmpeg, Ollama, and Whisper readiness",
  );
  out(
    "  -f, --format <fmt>         Output format: md, txt, srt, vtt, lrc, json (default: md)",
  );
  out(
    "  -o, --out <path>           Write transcript output to file path or directory",
  );
  out(
    "  -e, --engine <id>          Engine: auto, python-whisper, whisper-cli, openai-asr, ollama-omni, os-native, companion",
  );
  out(
    "  -m, --model <name>         ASR model name (e.g. openai/whisper-tiny, openai/whisper-base)",
  );
  out(
    "  -l, --lang <code>          Spoken language code (e.g. auto, en, es, fr, de, ja, zh)",
  );
  out(
    "      --enhance              Apply speech enhancement audio filters before transcription",
  );
  out(
    "      --summarize            Generate AI summary, action items, and chapters via Ollama",
  );
  out(
    "      --save                 Save sidecar transcript file next to each source file",
  );
  out("  -j, --json                 Output structured JSON result to stdout");
  out("");
  out("EXAMPLES:");
  out("  $ codecaine-file-manager transcribe --status");
  out(
    "  $ codecaine-file-manager transcribe meeting.m4a --format md --summarize",
  );
  out(
    "  $ codecaine-file-manager stt lecture.mp4 --format srt --out lecture.srt",
  );
  out("  $ codecaine-file-manager asr *.wav --format vtt --out ./subtitles/");
}

function formatCatalogItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    const id = String(obj.id ?? obj.code ?? obj.name ?? "");
    const label = String(obj.label ?? obj.name ?? "");
    if (id && label && id !== label) return `${id} (${label})`;
    return id || label;
  }
  return String(item);
}

function printStatusTable(
  out: (line: string) => void,
  status: TranscribeStatus,
): void {
  out("🎙️  Audio-to-Text AI (ASR) — System Status");
  out("────────────────────────────────────────────────────────────────────");
  out(`  Readiness:          ${status.ready ? "✅ Ready" : "⚠️ Setup Needed"}`);
  out(
    `  Recommended Engine: ${status.recommendedLabel} (${status.recommendedEngine})`,
  );
  out(
    `  FFmpeg Transcoder:  ${status.ffmpegAvailable ? `✅ ${status.ffmpegPath || "available"}` : "⚠️ Not found (PCM .wav supported natively)"}`,
  );
  out(
    `  Ollama AI Summary:  ${status.ollamaAvailable ? "✅ Available (--summarize ready)" : "⚪ Offline"}`,
  );
  out(
    `  Local ASR Python:   ${status.asrEnvInstalled ? `✅ ${status.asrEnvPython || "installed"}` : "⚪ Not installed"}`,
  );
  out(
    `  Output Formats:     ${status.supportedFormats.map((f) => f.toUpperCase()).join(", ")}`,
  );
  out(`  Media Extensions:   ${status.supportedExtensions.join(", ")}`);
  if (Array.isArray(status.engines)) {
    out("  Engines:");
    for (const eng of status.engines) {
      if (eng && typeof eng === "object") {
        const e = eng as Record<string, unknown>;
        const badge = e.available ? "✓" : "✗";
        const id = String(e.id ?? e.name ?? "engine");
        const label = String(e.label ?? e.detail ?? "");
        out(`    [${badge}] ${id.padEnd(16)} ${label}`);
      } else {
        out(`    • ${String(eng)}`);
      }
    }
  }
  if (Array.isArray(status.models) && status.models.length > 0) {
    out(
      `  Models:             ${status.models.map(formatCatalogItem).join(", ")}`,
    );
  }
  if (Array.isArray(status.languages) && status.languages.length > 0) {
    out(
      `  Languages:          ${status.languages.map(formatCatalogItem).join(", ")}`,
    );
  }
}

// ============================================================================
// CLI Execution Entrypoint (`runTranscribeCli`)
// ============================================================================

interface ParsedCliArgs {
  help: boolean;
  status: boolean;
  format?: TranscribeFormat;
  outPath: string;
  engine: TranscribeEngineId;
  model?: string;
  language?: string;
  enhanceAudio: boolean;
  summarize: boolean;
  saveSidecar: boolean;
  json: boolean;
  rawInputs: string[];
  ctxOptions: FmContextOptions;
}

function parseCliArgs(
  rawArgs: string[],
  baseCtxOptions: FmContextOptions = {},
): ParsedCliArgs {
  const ctxOptions: FmContextOptions = { ...baseCtxOptions };
  const pathSep = process.platform === "win32" ? ";" : ":";

  let help = false;
  let status = false;
  let format: TranscribeFormat | undefined;
  let outPath = "";
  let engine: TranscribeEngineId = "auto";
  let model: string | undefined;
  let language: string | undefined;
  let enhanceAudio = false;
  let summarize = false;
  let saveSidecar = false;
  let json = false;
  const rawInputs: string[] = [];
  let stopFlags = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]!;
    if (stopFlags) {
      rawInputs.push(arg);
      continue;
    }
    if (arg === "--") {
      stopFlags = true;
      continue;
    }

    const eqIdx = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const flag = eqIdx > 0 ? arg.slice(0, eqIdx) : arg;
    const inlineVal = eqIdx > 0 ? arg.slice(eqIdx + 1) : undefined;
    const nextVal = (): string => {
      if (inlineVal !== undefined) return inlineVal;
      const v = rawArgs[i + 1];
      if (v === undefined) {
        throw new Error(`Flag ${flag} requires a value.`);
      }
      i++;
      return v;
    };

    switch (flag) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--status":
      case "-d":
        status = true;
        break;
      case "--format":
      case "-f": {
        const val = nextVal().trim().toLowerCase() as TranscribeFormat;
        if (
          !(SUPPORTED_TRANSCRIBE_FORMATS as readonly string[]).includes(val)
        ) {
          throw new Error(
            `Unsupported format "${val}". Choose from: ${SUPPORTED_TRANSCRIBE_FORMATS.join(", ")}.`,
          );
        }
        format = val;
        break;
      }
      case "--out":
      case "-o":
      case "--output":
        outPath = nextVal().trim();
        if (!outPath) {
          throw new Error(`Flag ${flag} requires a non-empty output path.`);
        }
        break;
      case "--engine":
      case "-e": {
        const val = nextVal().trim().toLowerCase() as TranscribeEngineId;
        if (
          !(SUPPORTED_TRANSCRIBE_ENGINES as readonly string[]).includes(val)
        ) {
          throw new Error(
            `Unsupported engine "${val}". Choose from: ${SUPPORTED_TRANSCRIBE_ENGINES.join(", ")}.`,
          );
        }
        engine = val;
        break;
      }
      case "--model":
      case "-m":
        model = nextVal().trim();
        if (!model) {
          throw new Error(`Flag ${flag} requires a non-empty model name.`);
        }
        break;
      case "--lang":
      case "--language":
      case "-l":
        language = nextVal().trim();
        if (!language) {
          throw new Error(`Flag ${flag} requires a language code.`);
        }
        break;
      case "--enhance":
        enhanceAudio = true;
        break;
      case "--summarize":
        summarize = true;
        break;
      case "--save":
        saveSidecar = true;
        break;
      case "--json":
      case "-j":
        json = true;
        break;
      case "--home":
        ctxOptions.home = nextVal();
        break;
      case "--data-dir":
        ctxOptions.dataDir = nextVal();
        break;
      case "--tool-dirs":
        ctxOptions.toolDirs = nextVal().split(pathSep).filter(Boolean);
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(
            `Unknown option "${arg}". Run with --help for usage.`,
          );
        }
        rawInputs.push(arg);
        break;
    }
  }

  return {
    help,
    status,
    format,
    outPath,
    engine,
    model,
    language,
    enhanceAudio,
    summarize,
    saveSidecar,
    json,
    rawInputs,
    ctxOptions,
  };
}

/**
 * Executes the Audio-to-Text CLI (`transcribe-cli`) with the provided arguments and I/O hooks.
 * Returns `0` on success and a non-zero exit code on validation or runtime errors.
 */
export async function runTranscribeCli(
  args: string[],
  io: TranscribeCliIo = {},
): Promise<number> {
  const out = io.stdout ?? ((line: string) => console.log(line));
  const err = io.stderr ?? ((line: string) => console.error(line));
  const cwd = io.cwd ?? process.cwd();

  let parsed: ParsedCliArgs;
  try {
    parsed = parseCliArgs(args, io.contextOptions);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    err(`❌ Error: ${msg}`);
    return 1;
  }

  if (parsed.help) {
    printHelp(out);
    return 0;
  }

  const ctx = createContext(parsed.ctxOptions);

  try {
    const backend = await loadFmTranscribeBackend();

    if (parsed.status) {
      const status = backend
        ? await backend.getTranscribeStatus(ctx)
        : await fallbackGetTranscribeStatus(ctx);
      if (parsed.json) {
        out(JSON.stringify({ ok: true, ...status }, null, 2));
      } else {
        printStatusTable(out, status);
      }
      return 0;
    }

    if (parsed.rawInputs.length === 0) {
      err(
        "❌ No input audio or video file specified. Pass one or more file paths or run with --help.",
      );
      return 1;
    }

    const resolvedPaths: string[] = [];
    for (const raw of parsed.rawInputs) {
      const abs = resolveCliPath(ctx, raw, cwd);
      if (!existsSync(abs)) {
        err(`❌ Input file not found: ${abs}`);
        return 1;
      }
      if (!statSync(abs).isFile()) {
        err(`❌ Input path is not a file: ${abs}`);
        return 1;
      }
      resolvedPaths.push(abs);
    }

    const targetFormat: TranscribeFormat =
      parsed.format ??
      (parsed.outPath ? inferFormatFromOutPath(parsed.outPath) : null) ??
      "md";

    const runOptions: TranscribeRunOptions = {
      paths: resolvedPaths,
      engine: parsed.engine,
      ...(parsed.model ? { model: parsed.model } : {}),
      ...(parsed.language ? { language: parsed.language } : {}),
      format: targetFormat,
      enhanceAudio: parsed.enhanceAudio,
      summarize: parsed.summarize,
      saveSidecar: parsed.saveSidecar,
    };

    const transcribed = backend
      ? await backend.transcribeAudioPaths(ctx, runOptions, io.hooks)
      : await fallbackTranscribeAudioPaths(ctx, runOptions, io.hooks);

    const writtenPaths = parsed.outPath
      ? writeOutResults(ctx, transcribed.results, parsed.outPath, cwd)
      : [];

    if (parsed.json) {
      out(
        JSON.stringify(
          {
            ok: true,
            count: transcribed.count,
            format: targetFormat,
            ...(transcribed.results.length === 1
              ? { result: transcribed.results[0] }
              : {}),
            ...(writtenPaths.length === 1
              ? { outputPath: writtenPaths[0] }
              : writtenPaths.length > 1
                ? { outputPaths: writtenPaths }
                : {}),
            results: transcribed.results,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    if (parsed.outPath) {
      for (const r of transcribed.results) {
        out(
          `✅ Saved ${r.format.toUpperCase()} transcript: ${r.savedPath} (${r.wordCount} words, ${r.engine})`,
        );
      }
      return 0;
    }

    if (transcribed.results.length === 1) {
      const single = transcribed.results[0]!;
      out(single.formatted);
      return 0;
    }

    if (targetFormat === "json") {
      const items = transcribed.results.map((r) => {
        try {
          return JSON.parse(r.formatted);
        } catch {
          return { fileName: r.fileName, text: r.text, formatted: r.formatted };
        }
      });
      out(JSON.stringify(items, null, 2));
      return 0;
    }

    for (const r of transcribed.results) {
      out(`=== ${r.fileName} ===\n${r.formatted}`);
    }
    return 0;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    err(`❌ Error: ${msg}`);
    return 1;
  } finally {
    for (const dispose of ctx.disposers) {
      try {
        dispose();
      } catch {
        // Ignore cleanup failures on exit.
      }
    }
  }
}

if (import.meta.main) {
  const code = await runTranscribeCli(process.argv.slice(2));
  process.exit(code);
}
