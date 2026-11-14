#!/usr/bin/env bun
/**
 * 🎙️ Ollama Phonon TTS & Document-to-Audio/MP4 Studio CLI (`tts-cli`)
 *
 * Terminal Text-to-Speech, Intelligent Document Cleaner (Deterministic + Ollama LLM),
 * Multi-Format Audio Exporter (WAV, MP3, M4A, AAC, FLAC, OGG, Opus, AIFF, WMA),
 * Read-Along Karaoke Video Renderer (MP4, MOV, WebM, MKV + SRT/VTT/ASS Subtitles),
 * and Multi-Chapter Audiobook Generator.
 *
 * Usage:
 *   bun run cli:tts [subcommand] [options] [files_or_text...]
 *
 * Subcommands:
 *   export       Extract, clean, and synthesize documents/text to audio or Read-Along video (default)
 *   clean        Extract & clean documents (deterministic + optional Ollama LLM) to plain speakable text
 *   speak        Clean and read documents/text aloud over the system speaker with live terminal progress
 *   audiobook    Split a book/document into chapters and export a full multi-chapter audiobook + M3U8 playlist
 *   voices       List all 38+ built-in Ollama Phonon neural voices and custom cloned voices
 *   formats      List all supported audio (wav, mp3, m4a, aac, flac, ogg, opus, aiff, wma) & video (mp4, mov, webm, mkv) formats
 *   status       Inspect Ollama, Phonon TTS model, text LLM cleaner models, and FFmpeg readiness
 *   clone-voice  Create a custom cloned voice from a reference audio recording (.wav, .mp3, .m4a, .flac)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";
import { SimpleCLI } from "../src/index.ts";
import {
  createContext,
  type FmContext,
  type FmContextOptions,
} from "../src/features/filemanager/fmCore.ts";
import {
  ALL_MEDIA_FORMAT_INFO,
  AUDIO_FORMAT_INFO,
  cleanTextForSpeech,
  createCustomVoiceFromAudio,
  DEFAULT_PHONON_VOICES,
  ensureOllamaDaemon,
  extractAudiobookChapters,
  extractPlainTextFromFile,
  formatAssKaraokeSubtitles,
  formatSrtSubtitles,
  formatVttSubtitles,
  getPhononStatus,
  isPhononVideoFormat,
  PHONON_BATCH_CHUNK_CHARS,
  PHONON_DEFAULT_CHUNK_CHARS,
  PHONON_HARD_MAX_CHUNK_CHARS,
  PHONON_VIDEO_ASPECTS,
  PHONON_VIDEO_THEMES,
  splitTextForPhonon,
  synthesizeAndExportAudioFile,
  synthesizePhononChunkWav,
  VIDEO_ASPECT_INFO,
  VIDEO_FORMAT_INFO,
  VIDEO_THEME_INFO,
  type CleanTextOptions,
  type PhononReadAlongTimeline,
  type PhononTextChunk,
  type PhononVideoAspect,
  type PhononVideoTheme,
} from "../src/features/filemanager/fmPhonon.ts";
import {
  cleanTextForPhononSpeech,
  convertNumericDatesToWords,
} from "../src/features/filemanager/fmOllama.ts";
import {
  PHONON_AUDIO_FORMATS,
  type PhononAudioFormat,
} from "../src/features/filemanager/fmSettings.ts";
import { resolveTool } from "../src/features/filemanager/fmToolDetect.ts";

// ============================================================================
// SimpleCLI Flag Registration (for --help & File Manager CLI Utilities Catalog)
// ============================================================================

export function buildTtsCliApp(): SimpleCLI {
  const app = SimpleCLI.newApp("tts-cli", "1.0.0").setDescription(
    "Ollama Text-to-Speech, Document Cleaner & Multi-Format Audio/MP4 Video Exporter",
  );

  app.addFlagString(
    "input",
    "i",
    "",
    "Input document or text file path (PDF, DOCX, EPUB, MD, HTML, TXT, SRT, XLSX, etc.)",
  );
  app.addFlagString(
    "text",
    "t",
    "",
    "Inline text string to clean and synthesize",
  );
  app.addFlagString(
    "output",
    "o",
    "",
    "Output file or directory path (.wav, .mp3, .m4a, .aac, .flac, .ogg, .opus, .aiff, .wma, .mp4, .mov, .webm, .mkv, .txt)",
  );
  app.addFlagString(
    "format",
    "f",
    "",
    "Target export format(s), comma-separated (wav, mp3, m4a, aac, flac, ogg, opus, aiff, wma, mp4, webm, mov, mkv)",
  );
  app.addFlagString(
    "voice",
    "v",
    "Zoey",
    "Ollama Phonon voice name (e.g. Zoey, Easton, Freya, Edwin, Hugh, Maeve, Alfie, Captain Silas Blackwater)",
  );
  app.addFlagString(
    "model",
    "m",
    "phonon",
    "Ollama speech synthesis model name (default: phonon)",
  );
  app.addFlagBool(
    "clean",
    "c",
    true,
    "Clean document markup, Markdown, HTML, URLs, timestamps, and dates before speech",
  );
  app.addFlagBool(
    "no-clean",
    "N",
    false,
    "Disable automatic document text cleaning",
  );
  app.addFlagBool(
    "llm-clean",
    "L",
    false,
    "Use an Ollama LLM to deeply polish and rewrite messy OCR/document text for natural narration",
  );
  app.addFlagString(
    "clean-model",
    "M",
    "auto",
    "Ollama LLM model to use with --llm-clean (default: auto-detect installed LLM)",
  );
  app.addFlagBool(
    "clean-only",
    "C",
    false,
    "Only extract and clean the document text (output to stdout or --output .txt without audio synthesis)",
  );
  app.addFlagBool(
    "strip-code",
    "k",
    false,
    "Omit fenced code blocks from spoken narration",
  );
  app.addFlagBool(
    "unwrap-lines",
    "u",
    false,
    "Unwrap single hard-wrapped line breaks inside paragraphs (ideal for PDFs and plain text)",
  );
  app.addFlagBool(
    "expand-abbrev",
    "e",
    true,
    "Expand common abbreviations (e.g., i.e., etc., vs.) and math symbols into spoken words",
  );
  app.addFlagString(
    "save-txt",
    "T",
    "",
    "Also save the cleaned plain text document to this .txt file path",
  );
  app.addFlagFloat(
    "speed",
    "s",
    1.0,
    "Speech playback and synthesis speed multiplier (0.5 to 2.5)",
  );
  app.addFlagFloat(
    "pitch",
    "P",
    0.0,
    "Voice pitch adjustment in semitones (-6.0 to +6.0)",
  );
  app.addFlagInt(
    "pause",
    "p",
    200,
    "Silence pause between paragraphs in milliseconds (0 to 2000)",
  );
  app.addFlagInt(
    "chunk-size",
    "z",
    520,
    "Maximum characters per synthesis chunk (150 to 1200)",
  );
  app.addFlagString(
    "aspect",
    "a",
    "16:9",
    "Read-Along video aspect ratio: 16:9 (1920x1080), 9:16 (1080x1920 Shorts), or 1:1 (1080x1080)",
  );
  app.addFlagString(
    "theme",
    "w",
    "midnight",
    "Read-Along video theme: midnight, parchment, cyber, or high_contrast",
  );
  app.addFlagString(
    "title",
    "n",
    "",
    "Custom document/video/audiobook title header",
  );
  app.addFlagBool(
    "subtitles",
    "S",
    true,
    "Generate companion .srt and .vtt subtitle files (always enabled by default for video formats)",
  );
  app.addFlagBool(
    "no-subtitles",
    "X",
    false,
    "Disable companion .srt and .vtt subtitle generation",
  );
  app.addFlagString(
    "srt",
    "",
    "",
    "Explicit output path for .srt subtitle file",
  );
  app.addFlagString(
    "vtt",
    "",
    "",
    "Explicit output path for .vtt WebVTT subtitle file",
  );
  app.addFlagString(
    "ass",
    "",
    "",
    "Explicit output path for .ass karaoke subtitle file",
  );
  app.addFlagBool(
    "speak",
    "l",
    false,
    "Read the cleaned text aloud over the system speaker",
  );
  app.addFlagBool(
    "play",
    "y",
    false,
    "Play the exported audio file on the system speaker when finished",
  );
  app.addFlagBool(
    "audiobook",
    "B",
    false,
    "Split input document/book into chapters and export a multi-chapter audiobook folder + M3U8 playlist",
  );
  app.addFlagInt(
    "max-chapters",
    "",
    80,
    "Maximum chapters to extract in --audiobook mode",
  );
  app.addFlagString(
    "clone-voice",
    "",
    "",
    "Path to a reference audio file (.wav, .mp3, .m4a) to clone into a custom Phonon voice",
  );
  app.addFlagString(
    "voice-name",
    "",
    "",
    "Display name for the cloned voice when using --clone-voice",
  );
  app.addFlagBool(
    "voices",
    "V",
    false,
    "List all 38+ built-in and custom Ollama Phonon voices",
  );
  app.addFlagBool(
    "formats",
    "F",
    false,
    "List all supported audio and Read-Along video export formats",
  );
  app.addFlagBool(
    "status",
    "d",
    false,
    "Show Ollama, Phonon model, LLM cleaner, and FFmpeg status",
  );
  app.addFlagBool("json", "j", false, "Format CLI output as structured JSON");

  return app;
}

// ============================================================================
// Document Cleaning Engine (Deterministic Stage 1 + Ollama LLM Stage 2)
// ============================================================================

export interface DocumentCleanOptions extends CleanTextOptions {
  /** Enable deterministic speech cleanup (default: true). */
  clean?: boolean;
  /** Expand common abbreviations (e.g., i.e., etc., vs., w/, w/o) and symbols into spoken words (default: true). */
  expandAbbreviations?: boolean;
  /** Strip YAML frontmatter at top of Markdown files (default: true). */
  stripFrontmatter?: boolean;
  /** Strip academic bracket citations like [1], [12, 15] and footnote markers [^1] (default: true). */
  stripCitations?: boolean;
  /** Use an Ollama completion LLM to further polish messy OCR/PDF/technical text (default: false). */
  llmClean?: boolean;
  /** Specific Ollama LLM model for --llm-clean, or "auto" (default: "auto"). */
  cleanModel?: string;
}

export interface CleanedDocumentResult {
  rawText: string;
  cleanedText: string;
  formatLabel: string;
  extractionMethod: string;
  cleaningMethod: string;
  llmModelUsed: string | null;
  rawCharCount: number;
  cleanedCharCount: number;
  wordCount: number;
  chunkCount: number;
  estimatedSeconds: number;
  title?: string;
}

/**
 * Expands common technical/document abbreviations, symbols, and units so TTS engines pronounce them naturally.
 */
export function expandAbbreviationsForSpeech(input: string): string {
  let s = String(input || "");
  // Common Latin / English document abbreviations
  s = s.replace(/\be\.g\.,?(?=\s)/gi, "for example,");
  s = s.replace(/\bi\.e\.,?(?=\s)/gi, "that is,");
  s = s.replace(/\betc\.(?=\s|$|[),;:])/gi, "et cetera");
  s = s.replace(/\bvs\.(?=\s)/gi, "versus");
  s = s.replace(/\bw\/o(?=\s)/gi, "without");
  s = s.replace(/(?<=\s|^)w\/(?=\s)/gi, "with");
  s = s.replace(/\bFig\.\s*(\d+)/g, "Figure $1");
  s = s.replace(/\bEq\.\s*(\d+)/g, "Equation $1");
  s = s.replace(/\bVol\.\s*(\d+)/gi, "Volume $1");
  s = s.replace(/\bNo\.\s*(\d+)/g, "Number $1");
  s = s.replace(/\bpp\.\s*(\d+)/gi, "pages $1");

  // Mathematical & comparison symbols when surrounded by spaces or numbers
  s = s.replace(/(?<=\s)&(?=\s)/g, "and");
  s = s.replace(/\s*≈\s*/g, " approximately ");
  s = s.replace(/\s*≠\s*/g, " is not equal to ");
  s = s.replace(/\s*≥\s*/g, " is greater than or equal to ");
  s = s.replace(/\s*≤\s*/g, " is less than or equal to ");
  s = s.replace(/(?<=\s)(?:→|->|=>)(?=\s)/g, "to");

  return s.replace(/[ \t]{2,}/g, " ");
}

/**
 * Performs comprehensive deterministic document cleaning for natural Text-to-Speech synthesis:
 * 1. Strips YAML frontmatter (`--- ... ---`) at the start of Markdown documents
 * 2. Strips LLM `<think>...</think>`, `<reasoning>...</reasoning>`, and Harmony channel tags
 * 3. Applies `cleanTextForSpeech` (strips Markdown, HTML, code blocks, subtitle timestamps, simplifies URLs, unwraps lines)
 * 4. Converts numeric dates (`2026-11-13`, `11/13/2026`, `11/13`) into natural spoken words (`November 13, 2026`)
 * 5. Strips academic footnote/citation markers (`[^1]`, `[12]`) and LaTeX inline formatting (`\textbf{...}`)
 * 6. Expands common abbreviations (`e.g.`, `i.e.`, `etc.`, `vs.`) and math symbols into spoken words
 */
export function cleanDocumentForTts(
  rawText: string,
  opts: DocumentCleanOptions = {},
): string {
  let s = String(rawText || "")
    .replace(/^\ufeff/, "")
    .replace(/\r\n?/g, "\n");
  if (opts.clean === false) {
    return s.trim();
  }

  // 1. Strip YAML frontmatter at top of Markdown/RMarkdown documents
  if (opts.stripFrontmatter !== false) {
    s = s.replace(/^---\n[\s\S]{1,4000}?\n---\n+/, "");
  }

  // 2. Strip <think>...</think>, <reasoning>...</reasoning>, and Harmony tags before Markdown/HTML cleanup
  s = s.replace(
    /<\|(?:start\|>assistant<\|)?channel\|>(?:analysis|thinking|thought)<\|message\|>[\s\S]*?(?:<\|end\|>|<\|return\|>)/gi,
    " ",
  );
  s = s.replace(
    /<\|(?:start\|>assistant<\|)?channel\|>final<\|message\|>/gi,
    " ",
  );
  s = s.replace(/<\|(?:end|return|start|channel|message)\|>/gi, " ");
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  s = s.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, " ");

  // 3. Strip LaTeX inline wrappers (\textbf{foo} -> foo, \cite{...} -> "")
  s = s.replace(/\\(?:cite|citep|citet|ref|eqref|label)\{[^}]*\}/g, "");
  s = s.replace(
    /\\(?:textbf|textit|emph|underline|textrm|texttt)\{([^}]*)\}/g,
    "$1",
  );

  // 4. Strip Markdown footnote references [^1] and standalone numeric citation brackets [1], [2, 3]
  if (opts.stripCitations !== false) {
    s = s.replace(/\[\^[^\]]+\]/g, "");
    s = s.replace(/\s*\[(?:\d+(?:\s*[-,]\s*\d+)*)\](?=[.,;:!\s]|$)/g, "");
  }

  // 5. Core Phonon document cleaner (HTML, Markdown, code blocks, URLs, timestamps, dividers, line unwrapping)
  s = cleanTextForSpeech(s, {
    stripMarkdown: opts.stripMarkdown ?? true,
    stripHtml: opts.stripHtml ?? true,
    stripCodeBlocks: opts.stripCodeBlocks ?? false,
    simplifyUrls: opts.simplifyUrls ?? true,
    stripTimestamps: opts.stripTimestamps ?? true,
    unwrapLines: opts.unwrapLines ?? false,
    bookTitle: opts.bookTitle,
  });

  // 6. Convert numeric dates (YYYY-MM-DD, MM/DD/YYYY, MM/DD) into natural spoken words
  s = convertNumericDatesToWords(s);

  // 7. Expand abbreviations and comparison symbols
  if (opts.expandAbbreviations !== false) {
    s = expandAbbreviationsForSpeech(s);
  }

  // 8. Final whitespace & paragraph normalization
  s = s
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return s;
}

const NON_TEXT_CLEANER_MODEL_RE =
  /\b(phonon|embed|nomic-embed|mxbai-embed|all-minilm|bge-|arctic-embed|kokoro|orpheus|oute-tts|parler-tts|whisper)\b/i;

/**
 * Discovers an installed Ollama text-completion model suitable for `--llm-clean` (excluding speech/embedding models).
 */
export async function resolveOllamaCleanerModel(
  ctx: FmContext,
  requestedModel?: string,
): Promise<string | null> {
  const req = String(requestedModel || "").trim();
  if (req && req.toLowerCase() !== "auto") {
    if (NON_TEXT_CLEANER_MODEL_RE.test(req)) {
      throw new Error(
        `Model "${req}" is a speech or embedding model and cannot be used for LLM text cleaning.`,
      );
    }
    return req;
  }

  const rawHost =
    ctx.ollama?.baseUrl?.trim() ||
    process.env.OLLAMA_HOST?.trim() ||
    "http://127.0.0.1:11434";
  const baseUrl = /^https?:\/\//i.test(rawHost)
    ? rawHost.replace(/\/+$/, "")
    : `http://${rawHost.replace(/\/+$/, "")}`;

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{
          name?: string;
          model?: string;
          capabilities?: string[];
        }>;
      };
      const models = Array.isArray(data?.models) ? data.models : [];
      const candidates = models
        .map((m) => String(m.name || m.model || "").trim())
        .filter(
          (name) => Boolean(name) && !NON_TEXT_CLEANER_MODEL_RE.test(name),
        );
      // Prefer local non-cloud models first for offline speed, then cloud models
      const localFirst = candidates.find((n) => !n.endsWith(":cloud"));
      if (localFirst) return localFirst;
      if (candidates[0]) return candidates[0];
    }
  } catch {}

  const ollamaExe = resolveTool(ctx, "ollama") || Bun.which("ollama");
  if (ollamaExe) {
    try {
      const proc = Bun.spawnSync([ollamaExe, "list"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      if (proc.exitCode === 0) {
        const lines = proc.stdout.toString("utf8").split(/\r?\n/).slice(1);
        const names: string[] = [];
        for (const line of lines) {
          const col = line.trim().split(/\s+/)[0];
          if (col && !NON_TEXT_CLEANER_MODEL_RE.test(col)) {
            names.push(col);
          }
        }
        const localFirst = names.find((n) => !n.endsWith(":cloud"));
        if (localFirst) return localFirst;
        if (names[0]) return names[0];
      }
    } catch {}
  }

  return null;
}

/**
 * Uses an Ollama completion LLM to clean and rewrite messy document/OCR text into smooth, natural narration text,
 * falling back gracefully to `cleanDocumentForTts` if Ollama or the model is unavailable.
 */
export async function cleanDocumentWithOllamaLlm(
  ctx: FmContext,
  text: string,
  opts: DocumentCleanOptions = {},
): Promise<{ text: string; modelUsed: string | null; usedLlm: boolean }> {
  const preCleaned = cleanDocumentForTts(text, opts);
  if (!preCleaned) {
    return { text: "", modelUsed: null, usedLlm: false };
  }

  const model = await resolveOllamaCleanerModel(ctx, opts.cleanModel);
  if (!model) {
    return { text: preCleaned, modelUsed: null, usedLlm: false };
  }

  const rawHost =
    ctx.ollama?.baseUrl?.trim() ||
    process.env.OLLAMA_HOST?.trim() ||
    "http://127.0.0.1:11434";
  const baseUrl = /^https?:\/\//i.test(rawHost)
    ? rawHost.replace(/\/+$/, "")
    : `http://${rawHost.replace(/\/+$/, "")}`;

  // Split into manageable ~2000-char sections for LLM cleaning
  const sections = splitTextForPhonon(preCleaned, {
    maxChars: 2000,
    mergeShortParagraphs: true,
  });

  const cleanedSections: string[] = [];
  let anySucceeded = false;

  const systemPrompt =
    "You are an expert audiobook and text-to-speech document cleaner. " +
    "Rewrite the provided document excerpt into clean, natural plain text ready to be spoken aloud by a narrator. " +
    "Remove any leftover formatting artifacts, broken OCR words, table borders, headers/footers, or raw syntax. " +
    "Write out numbers, dates, and abbreviations naturally where appropriate. " +
    "Keep 100% of the factual meaning and original tone. " +
    "Output ONLY the cleaned narration text with no introduction, explanation, or markdown formatting.";

  for (const sec of sections) {
    let polished: string | null = null;
    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          prompt: sec.text,
          stream: false,
          think: false,
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { response?: string };
        const candidate = cleanDocumentForTts(String(data?.response || ""), {
          ...opts,
          clean: true,
        });
        if (
          candidate &&
          candidate.length >= Math.min(12, sec.text.length * 0.25)
        ) {
          polished = candidate;
          anySucceeded = true;
        }
      }
    } catch {}

    if (!polished) {
      // Try CLI `ollama run <model> --hidethinking` if HTTP API didn't return a response (e.g. CLI test stub)
      const ollamaExe = resolveTool(ctx, "ollama") || Bun.which("ollama");
      if (ollamaExe) {
        try {
          const proc = Bun.spawnSync(
            [
              ollamaExe,
              "run",
              model,
              "--hidethinking",
              `${systemPrompt}\n\n${sec.text}`,
            ],
            {
              stdout: "pipe",
              stderr: "pipe",
              timeout: 20_000,
            },
          );
          if (proc.exitCode === 0) {
            const outStr = proc.stdout.toString("utf8");
            // Ensure stdout isn't a RIFF WAVE header
            if (!outStr.startsWith("RIFF")) {
              const candidate = cleanDocumentForTts(outStr, {
                ...opts,
                clean: true,
              });
              if (candidate) {
                polished = candidate;
                anySucceeded = true;
              }
            }
          }
        } catch {}
      }
    }

    cleanedSections.push(polished || sec.text);
  }

  return {
    text: cleanedSections.join("\n\n").trim(),
    modelUsed: anySucceeded ? model : null,
    usedLlm: anySucceeded,
  };
}

/**
 * Extracts and cleans a document file or inline text string using Stage 1 deterministic speech cleaning
 * and optional Stage 2 Ollama LLM polishing.
 */
export async function extractAndCleanInput(
  ctx: FmContext,
  input: {
    filePath?: string;
    text?: string;
    cleanOpts?: DocumentCleanOptions;
    maxChunkChars?: number;
  },
): Promise<CleanedDocumentResult> {
  const cleanOpts = input.cleanOpts ?? {};
  const shouldClean = cleanOpts.clean !== false;
  const maxChunkChars = input.maxChunkChars ?? PHONON_DEFAULT_CHUNK_CHARS;

  let rawText = "";
  let formatLabel = "Direct Text";
  let extractionMethod = "Inline / Stdin Text";
  let title: string | undefined;

  if (input.filePath && input.filePath.trim()) {
    const absPath = nodePath.resolve(input.filePath.trim());
    const extracted = await extractPlainTextFromFile(ctx, absPath, {
      clean: false,
      maxChars: maxChunkChars,
    });
    rawText = extracted.rawText || extracted.text;
    formatLabel = extracted.formatLabel;
    extractionMethod = extracted.method;
    title =
      extracted.title || nodePath.basename(absPath).replace(/\.[^.]+$/, "");
  } else if (typeof input.text === "string" && input.text.trim()) {
    rawText = input.text;
  } else {
    throw new Error(
      'No input provided. Pass a document file (-i <file> or positional argument), inline text (-t "..."), or pipe text via stdin.',
    );
  }

  let cleanedText = shouldClean
    ? cleanDocumentForTts(rawText, { ...cleanOpts, bookTitle: title })
    : rawText.replace(/\r\n?/g, "\n").trim();

  let cleaningMethod = shouldClean
    ? "Deterministic Speech Cleaner (Markdown/HTML/URL/Date/Abbrev)"
    : "Raw Unmodified Text";
  let llmModelUsed: string | null = null;

  if (shouldClean && cleanOpts.llmClean) {
    const llmRes = await cleanDocumentWithOllamaLlm(ctx, cleanedText, {
      ...cleanOpts,
      bookTitle: title,
    });
    cleanedText = llmRes.text;
    llmModelUsed = llmRes.modelUsed;
    cleaningMethod = llmRes.usedLlm
      ? `Ollama LLM (${llmRes.modelUsed}) + Deterministic Speech Cleaner`
      : "Deterministic Speech Cleaner (LLM fallback)";
  }

  if (!cleanedText) {
    throw new Error(
      "After cleaning markup and non-speech blocks, no speakable words remained.",
    );
  }

  const chunks = splitTextForPhonon(cleanedText, {
    maxChars: maxChunkChars,
    mergeShortParagraphs: true,
  });
  const wordCount = chunks.reduce((sum, c) => sum + c.wordCount, 0);
  const estimatedSeconds = Math.max(1, Math.round((wordCount / 155) * 60));

  return {
    rawText,
    cleanedText,
    formatLabel,
    extractionMethod,
    cleaningMethod,
    llmModelUsed,
    rawCharCount: rawText.length,
    cleanedCharCount: cleanedText.length,
    wordCount,
    chunkCount: chunks.length,
    estimatedSeconds,
    ...(title ? { title } : {}),
  };
}

// ============================================================================
// Format Resolution & Multi-Format Export Helpers
// ============================================================================

const VALID_FORMATS_SET = new Set<string>(
  PHONON_AUDIO_FORMATS as unknown as string[],
);

/**
 * Parses and validates one or more target media formats from `--format` and/or `--output` extension.
 * Supports all 9 audio formats (`wav`, `mp3`, `m4a`, `aac`, `flac`, `ogg`, `opus`, `aiff`, `wma`)
 * and all 4 Read-Along video formats (`mp4`, `webm`, `mov`, `mkv`).
 */
export function resolveTargetFormats(
  formatFlag?: string,
  outputPath?: string,
): PhononAudioFormat[] {
  const results: PhononAudioFormat[] = [];
  const addFmt = (raw: string) => {
    const clean = raw.trim().toLowerCase().replace(/^\./, "");
    if (!clean) return;
    const mapped =
      clean === "wave"
        ? "wav"
        : clean === "aif"
          ? "aiff"
          : clean === "ogg-vorbis" || clean === "vorbis"
            ? "ogg"
            : clean === "m4b"
              ? "m4a"
              : clean;
    if (!VALID_FORMATS_SET.has(mapped)) {
      throw new Error(
        `Unsupported export format "${raw}". Supported formats: ${(PHONON_AUDIO_FORMATS as readonly string[]).join(", ")}`,
      );
    }
    if (!results.includes(mapped as PhononAudioFormat)) {
      results.push(mapped as PhononAudioFormat);
    }
  };

  if (formatFlag && formatFlag.trim()) {
    for (const part of formatFlag.split(",")) {
      addFmt(part);
    }
  }

  if (results.length === 0 && outputPath && outputPath.trim()) {
    const ext = nodePath
      .extname(outputPath.trim())
      .toLowerCase()
      .replace(/^\./, "");
    if (ext && ext !== "txt") {
      try {
        addFmt(ext);
      } catch {}
    }
  }

  if (results.length === 0) {
    results.push("wav");
  }
  return results;
}

/**
 * Computes the destination file path for a specific export format given an optional `--output` flag and source file path.
 */
export function resolveOutputFilePath(params: {
  outputFlag?: string;
  inputFilePath?: string;
  title?: string;
  voice: string;
  format: PhononAudioFormat;
  multiFormat: boolean;
  cwd: string;
}): string {
  const { outputFlag, inputFilePath, title, voice, format, multiFormat, cwd } =
    params;
  const safeVoice =
    voice
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "zoey";
  const defaultStem = inputFilePath
    ? nodePath.basename(inputFilePath, nodePath.extname(inputFilePath))
    : title
      ? title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 60)
      : `speech-${safeVoice}`;

  if (!outputFlag || !outputFlag.trim()) {
    const baseDir = inputFilePath
      ? nodePath.dirname(nodePath.resolve(cwd, inputFilePath))
      : cwd;
    return nodePath.join(baseDir, `${defaultStem}.${format}`);
  }

  const resolvedOut = nodePath.resolve(cwd, outputFlag.trim());
  const existsAsDir =
    existsSync(resolvedOut) && statSync(resolvedOut).isDirectory();
  if (
    existsAsDir ||
    outputFlag.trim().endsWith("/") ||
    outputFlag.trim().endsWith("\\")
  ) {
    mkdirSync(resolvedOut, { recursive: true });
    return nodePath.join(resolvedOut, `${defaultStem}.${format}`);
  }

  const parentDir = nodePath.dirname(resolvedOut);
  mkdirSync(parentDir, { recursive: true });

  if (multiFormat) {
    const ext = nodePath.extname(resolvedOut);
    const stem = ext ? resolvedOut.slice(0, -ext.length) : resolvedOut;
    return `${stem}.${format}`;
  }

  const ext = nodePath.extname(resolvedOut);
  if (!ext) {
    return `${resolvedOut}.${format}`;
  }
  return resolvedOut;
}

function formatDurationHuman(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins === 0) return `${rem}s`;
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins % 60}m ${rem}s`;
  }
  return `${mins}m ${rem}s`;
}

function formatBytesHuman(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let val = bytes / 1024;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[idx]}`;
}

/**
 * Plays a WAV or audio file on the host OS speaker (`afplay` on macOS, `paplay`/`pw-play`/`aplay`/`ffplay` on Linux, PowerShell on Windows).
 */
export async function playAudioFileOnSpeaker(filePath: string): Promise<{
  played: boolean;
  player: string;
}> {
  if (process.env.TTS_CLI_NO_AUDIO === "1") {
    return { played: false, player: "disabled" };
  }
  const abs = nodePath.resolve(filePath);
  if (!existsSync(abs)) {
    return { played: false, player: "missing-file" };
  }

  if (process.platform === "darwin") {
    const afplay = Bun.which("afplay") || "/usr/bin/afplay";
    if (existsSync(afplay)) {
      const proc = Bun.spawn([afplay, "--", abs], {
        stdout: "ignore",
        stderr: "ignore",
      });
      const code = await proc.exited;
      return { played: code === 0, player: "afplay" };
    }
  } else if (process.platform === "linux") {
    for (const bin of ["paplay", "pw-play", "aplay", "ffplay"]) {
      const resolved = Bun.which(bin);
      if (resolved) {
        const args =
          bin === "ffplay"
            ? [
                resolved,
                "-nodisp",
                "-autoexit",
                "-loglevel",
                "quiet",
                "--",
                abs,
              ]
            : [resolved, "--", abs];
        const proc = Bun.spawn(args, { stdout: "ignore", stderr: "ignore" });
        const code = await proc.exited;
        return { played: code === 0, player: bin };
      }
    }
  } else if (process.platform === "win32") {
    const ps = Bun.which("powershell") || "powershell";
    const proc = Bun.spawn(
      [
        ps,
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "if ($env:TTS_WAV_PATH) { (New-Object Media.SoundPlayer $env:TTS_WAV_PATH).PlaySync() }",
      ],
      {
        stdout: "ignore",
        stderr: "ignore",
        env: { ...process.env, TTS_WAV_PATH: abs },
      },
    );
    const code = await proc.exited;
    return { played: code === 0, player: "PowerShell SoundPlayer" };
  }

  const ffplay = Bun.which("ffplay");
  if (ffplay) {
    const proc = Bun.spawn(
      [ffplay, "-nodisp", "-autoexit", "-loglevel", "quiet", "--", abs],
      { stdout: "ignore", stderr: "ignore" },
    );
    const code = await proc.exited;
    return { played: code === 0, player: "ffplay" };
  }

  return { played: false, player: "none" };
}

// ============================================================================
// CLI Execution Runner (`runTtsCli`)
// ============================================================================

export interface TtsCliIo {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  cwd?: string;
  stdinText?: string;
  contextOptions?: FmContextOptions;
}

function printRichHelp(out: (line: string) => void): void {
  out("🎙️  Ollama Phonon TTS & Document-to-Audio/MP4 Studio CLI (v1.0.0)");
  out(
    "   Clean documents (Markdown, PDF, DOCX, EPUB, HTML, SRT, TXT) with Ollama & export to any audio or Read-Along video format.",
  );
  out("");
  out("USAGE:");
  out("  bun run cli:tts [subcommand] [options] [file_or_text...]");
  out("  codecaine-tts [subcommand] [options] [file_or_text...]");
  out("");
  out("SUBCOMMANDS:");
  out(
    "  export <file|text>     Extract, clean & synthesize to WAV, MP3, M4A, AAC, FLAC, OGG, Opus, AIFF, WMA, MP4, MOV, WebM, or MKV",
  );
  out(
    "  clean <file|text>      Extract & clean a document (deterministic + optional --llm-clean) into speakable plain text",
  );
  out(
    "  speak <file|text>      Clean and read a document or text aloud directly on the system speaker",
  );
  out(
    "  audiobook <file>       Split an EPUB/PDF/Markdown/DOCX book into chapters and export a full audiobook + M3U8 playlist",
  );
  out(
    "  voices                 List all 38+ built-in Ollama Phonon voices and custom cloned voices",
  );
  out(
    "  formats                List all 9 audio formats and 4 Read-Along video formats, aspect ratios & visual themes",
  );
  out(
    "  status                 Check Ollama, Phonon speech model, text cleaner LLM, and FFmpeg readiness",
  );
  out(
    "  clone-voice <audio>    Clone a custom voice from a reference audio file (.wav, .mp3, .m4a, .flac)",
  );
  out("");
  out("INPUT & CLEANING OPTIONS:");
  out(
    "  -i, --input <path>         Input document path (PDF, DOCX, ODT, RTF, EPUB, PPTX, XLSX, CSV, MD, HTML, SRT, VTT, IPYNB, TXT)",
  );
  out(
    "  -t, --text <string>        Inline text string to clean and synthesize (or pipe via stdin)",
  );
  out(
    "  -c, --clean                Clean Markdown, HTML, URLs, timestamps, dates & abbreviations before speech (default: true)",
  );
  out("  -N, --no-clean             Disable automatic text cleaning");
  out(
    "  -L, --llm-clean            Use an Ollama LLM to deeply polish noisy OCR/PDF/document prose for narration",
  );
  out(
    "  -M, --clean-model <model>  Ollama LLM model for --llm-clean (default: auto-detect installed text LLM)",
  );
  out(
    "  -C, --clean-only           Only clean and output/save plain text without synthesizing audio",
  );
  out(
    "  -k, --strip-code           Omit fenced code blocks from spoken output",
  );
  out(
    "  -u, --unwrap-lines         Unwrap single line breaks inside paragraphs (great for PDFs and plain text)",
  );
  out(
    "  -T, --save-txt <path>      Save the cleaned plain text alongside the audio/video export",
  );
  out("");
  out("VOICE & PROSODY OPTIONS:");
  out(
    "  -v, --voice <name>         Phonon voice (default: Zoey; e.g. Easton, Freya, Edwin, Hugh, Maeve, Alfie, Russell)",
  );
  out("  -s, --speed <0.5..2.5>     Speech speed multiplier (default: 1.0)");
  out(
    "  -P, --pitch <-6..+6>       Voice pitch shift in semitones (default: 0)",
  );
  out(
    "  -p, --pause <ms>           Silence pause between paragraphs in ms (default: 200)",
  );
  out(
    "  -z, --chunk-size <chars>   Max characters per synthesis chunk (default: 520, max: 1200)",
  );
  out("");
  out("AUDIO & READ-ALONG VIDEO EXPORT OPTIONS:");
  out(
    "  -o, --output <path>        Output file path or directory (format auto-detected from extension if -f omitted)",
  );
  out(
    "  -f, --format <fmt[,fmt]>   Target format(s): wav, mp3, m4a, aac, flac, ogg, opus, aiff, wma, mp4, webm, mov, mkv",
  );
  out(
    "  -a, --aspect <ratio>       Video aspect ratio for MP4/MOV/WebM/MKV: 16:9 (1080p), 9:16 (Vertical Short), 1:1 (Square)",
  );
  out(
    "  -w, --theme <theme>        Video color theme: midnight, parchment, cyber, high_contrast",
  );
  out(
    "  -n, --title <title>        Custom header title for Read-Along video or audiobook",
  );
  out(
    "  -S, --subtitles            Write companion .srt and .vtt subtitle files",
  );
  out(
    "  -X, --no-subtitles         Do not write companion .srt/.vtt subtitle files for video exports",
  );
  out(
    "      --srt <path>           Write synchronized SubRip (.srt) subtitles to this path",
  );
  out(
    "      --vtt <path>           Write synchronized WebVTT (.vtt) subtitles to this path",
  );
  out(
    "      --ass <path>           Write synchronized ASS karaoke (.ass) subtitles to this path",
  );
  out(
    "  -l, --speak / -y, --play   Play synthesized audio aloud on the system speaker",
  );
  out(
    "  -B, --audiobook            Export multi-chapter audiobook folder with audiobook.m3u8 & chapters.json",
  );
  out("  -j, --json                 Output structured JSON result");
  out("");
  out("EXAMPLES:");
  out("  $ bun run cli:tts -i README.md -o readme.mp3 --voice Zoey");
  out(
    "  $ bun run cli:tts -i report.pdf -o report.mp4 --voice Edwin --aspect 16:9 --theme midnight",
  );
  out(
    "  $ bun run cli:tts -i notes.md -f wav,mp3,mp4 -o ./exports/notes --llm-clean",
  );
  out("  $ bun run cli:tts clean -i paper.md --llm-clean -o paper_cleaned.txt");
  out(
    "  $ bun run cli:tts audiobook -i book.epub -f m4a --voice Hugh -o ./audiobooks",
  );
  out(
    '  $ bun run cli:tts speak -t "Meeting scheduled for 2026-11-13 at https://ollama.com/blog" --voice Freya',
  );
  out("  $ bun run cli:tts voices");
  out("  $ bun run cli:tts formats");
}

const KNOWN_SUBCOMMANDS = new Set([
  "export",
  "clean",
  "speak",
  "audiobook",
  "voices",
  "formats",
  "status",
  "clone-voice",
  "help",
]);

/**
 * Executes the Ollama TTS & Document-to-Audio/MP4 CLI with the provided arguments and I/O hooks.
 */
export async function runTtsCli(
  rawArgs: string[],
  io: TtsCliIo = {},
): Promise<number> {
  const out = io.stdout ?? ((line: string) => console.log(line));
  const err = io.stderr ?? ((line: string) => console.error(line));
  const cwd = io.cwd ?? process.cwd();

  // Extract context override flags (--home, --data-dir, --tool-dirs) if passed
  const filteredArgs: string[] = [];
  const ctxOptions: FmContextOptions = { ...io.contextOptions };
  const pathSep = process.platform === "win32" ? ";" : ":";

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i]!;
    if (a === "--home" && rawArgs[i + 1]) {
      ctxOptions.home = rawArgs[++i]!;
    } else if (a === "--data-dir" && rawArgs[i + 1]) {
      ctxOptions.dataDir = rawArgs[++i]!;
    } else if (a === "--tool-dirs" && rawArgs[i + 1]) {
      ctxOptions.toolDirs = rawArgs[++i]!.split(pathSep).filter(Boolean);
    } else {
      filteredArgs.push(a);
    }
  }

  // Detect optional leading subcommand
  let subcommand = "";
  let cliArgs = filteredArgs;
  const firstArg = filteredArgs[0]?.trim() ?? "";
  if (
    firstArg &&
    !firstArg.startsWith("-") &&
    KNOWN_SUBCOMMANDS.has(firstArg.toLowerCase())
  ) {
    subcommand = firstArg.toLowerCase();
    cliArgs = filteredArgs.slice(1);
  }

  if (
    subcommand === "help" ||
    cliArgs.includes("--help") ||
    cliArgs.includes("-h")
  ) {
    printRichHelp(out);
    return 0;
  }

  if (cliArgs.includes("--version")) {
    out("tts-cli v1.0.0 (Ollama Phonon TTS & Document-to-Audio/MP4 Exporter)");
    return 0;
  }

  // Parse flags manually for full flexibility with subcommands, multiple positionals, and boolean negations
  let inputFile = "";
  let inlineText = "";
  let outputPath = "";
  let formatFlag = "";
  let voice = "Zoey";
  let model = "phonon";
  let clean = true;
  let llmClean = false;
  let cleanModel = "auto";
  let cleanOnly = subcommand === "clean";
  let stripCodeBlocks = false;
  let unwrapLines = false;
  let expandAbbreviations = true;
  let saveTxtPath = "";
  let speed = 1.0;
  let pitch = 0.0;
  let pauseMs = 200;
  let chunkSize = PHONON_DEFAULT_CHUNK_CHARS;
  let aspectRatio: PhononVideoAspect = "16:9";
  let videoTheme: PhononVideoTheme = "midnight";
  let title = "";
  let subtitlesExplicit: boolean | undefined;
  let srtOutPath = "";
  let vttOutPath = "";
  let assOutPath = "";
  let speakMode = subcommand === "speak";
  let playAfterExport = false;
  let audiobookMode = subcommand === "audiobook";
  let maxChapters = 80;
  let cloneVoiceSource = "";
  let cloneVoiceName = "";
  let showVoices = subcommand === "voices";
  let showFormats = subcommand === "formats";
  let showStatus = subcommand === "status";
  let jsonOutput = false;
  const positionals: string[] = [];

  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i]!;
    const eqIdx = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const flag = eqIdx > 0 ? arg.slice(0, eqIdx) : arg;
    const inlineVal = eqIdx > 0 ? arg.slice(eqIdx + 1) : undefined;
    const nextVal = () => {
      if (inlineVal !== undefined) return inlineVal;
      const v = cliArgs[i + 1];
      if (v === undefined) throw new Error(`Flag ${flag} requires a value.`);
      i++;
      return v;
    };

    switch (flag) {
      case "-i":
      case "--input":
      case "--file":
        inputFile = nextVal();
        break;
      case "-t":
      case "--text":
        inlineText = nextVal();
        break;
      case "-o":
      case "--output":
      case "--out":
        outputPath = nextVal();
        break;
      case "-f":
      case "--format":
        formatFlag = nextVal();
        break;
      case "-v":
      case "--voice":
        voice = nextVal();
        break;
      case "-m":
      case "--model":
        model = nextVal();
        break;
      case "-c":
      case "--clean":
        clean = true;
        break;
      case "-N":
      case "--no-clean":
        clean = false;
        break;
      case "-L":
      case "--llm-clean":
        llmClean = true;
        break;
      case "-M":
      case "--clean-model":
        cleanModel = nextVal();
        llmClean = true;
        break;
      case "-C":
      case "--clean-only":
        cleanOnly = true;
        break;
      case "-k":
      case "--strip-code":
        stripCodeBlocks = true;
        break;
      case "-u":
      case "--unwrap-lines":
        unwrapLines = true;
        break;
      case "-e":
      case "--expand-abbrev":
        expandAbbreviations = true;
        break;
      case "--no-expand-abbrev":
        expandAbbreviations = false;
        break;
      case "-T":
      case "--save-txt":
        saveTxtPath = nextVal();
        break;
      case "-s":
      case "--speed":
        speed = Math.max(0.5, Math.min(2.5, Number(nextVal()) || 1.0));
        break;
      case "-P":
      case "--pitch":
        pitch = Math.max(-6, Math.min(6, Number(nextVal()) || 0));
        break;
      case "-p":
      case "--pause":
        pauseMs = Math.max(
          0,
          Math.min(2000, Math.round(Number(nextVal()) || 200)),
        );
        break;
      case "-z":
      case "--chunk-size":
        chunkSize = Math.max(
          150,
          Math.min(
            PHONON_HARD_MAX_CHUNK_CHARS,
            Math.round(Number(nextVal()) || PHONON_DEFAULT_CHUNK_CHARS),
          ),
        );
        break;
      case "-a":
      case "--aspect": {
        const val = nextVal() as PhononVideoAspect;
        if (!(PHONON_VIDEO_ASPECTS as readonly string[]).includes(val)) {
          throw new Error(
            `Invalid --aspect "${val}". Choose from: ${PHONON_VIDEO_ASPECTS.join(", ")}`,
          );
        }
        aspectRatio = val;
        break;
      }
      case "-w":
      case "--theme": {
        const val = nextVal() as PhononVideoTheme;
        if (!(PHONON_VIDEO_THEMES as readonly string[]).includes(val)) {
          throw new Error(
            `Invalid --theme "${val}". Choose from: ${PHONON_VIDEO_THEMES.join(", ")}`,
          );
        }
        videoTheme = val;
        break;
      }
      case "-n":
      case "--title":
        title = nextVal();
        break;
      case "-S":
      case "--subtitles":
        subtitlesExplicit = true;
        break;
      case "-X":
      case "--no-subtitles":
        subtitlesExplicit = false;
        break;
      case "--srt":
        srtOutPath = nextVal();
        subtitlesExplicit = true;
        break;
      case "--vtt":
        vttOutPath = nextVal();
        subtitlesExplicit = true;
        break;
      case "--ass":
        assOutPath = nextVal();
        subtitlesExplicit = true;
        break;
      case "-l":
      case "--speak":
        speakMode = true;
        break;
      case "-y":
      case "--play":
        playAfterExport = true;
        break;
      case "-B":
      case "--audiobook":
        audiobookMode = true;
        break;
      case "--max-chapters":
        maxChapters = Math.max(
          1,
          Math.min(200, Math.round(Number(nextVal()) || 80)),
        );
        break;
      case "--clone-voice":
        cloneVoiceSource = nextVal();
        break;
      case "--voice-name":
        cloneVoiceName = nextVal();
        break;
      case "-V":
      case "--voices":
        showVoices = true;
        break;
      case "-F":
      case "--formats":
        showFormats = true;
        break;
      case "-d":
      case "--status":
        showStatus = true;
        break;
      case "-j":
      case "--json":
        jsonOutput = true;
        break;
      default:
        if (arg.startsWith("-")) {
          err(`❌ Unknown option: ${arg}. Run with --help for usage.`);
          return 1;
        }
        positionals.push(arg);
        break;
    }
  }

  const ctx = createContext(ctxOptions);

  try {
    // ------------------------------------------------------------------------
    // 1. STATUS (`status` / `--status`)
    // ------------------------------------------------------------------------
    if (showStatus) {
      const [status, cleanerModel] = await Promise.all([
        getPhononStatus(ctx),
        resolveOllamaCleanerModel(ctx, cleanModel).catch(() => null),
      ]);
      if (jsonOutput) {
        out(
          JSON.stringify(
            {
              ok: true,
              ...status,
              llmCleanerModel: cleanerModel,
            },
            null,
            2,
          ),
        );
        return 0;
      }

      out("🎙️  Ollama Phonon TTS & Document Cleaner — System Status");
      out(
        "────────────────────────────────────────────────────────────────────",
      );
      out(
        `  TTS Engine:         ${status.ttsEngineLabel} (${status.activeTtsEngine})`,
      );
      out(
        `  Ollama Binary:      ${status.ollamaInstalled ? `✅ ${status.ollamaPath} (${status.ollamaVersion || "installed"})` : "❌ Not found in PATH"}`,
      );
      out(
        `  Ollama Daemon:      ${status.daemonRunning ? "🟢 Running" : "⚪ Standby (auto-starts on synthesis)"}`,
      );
      out(
        `  Phonon TTS Model:   ${status.modelInstalled ? "✅ Installed (phonon)" : "⚠️ Not pulled yet (run: ollama pull phonon)"}`,
      );
      out(
        `  LLM Doc Cleaner:    ${cleanerModel ? `✅ ${cleanerModel} (ready for --llm-clean)` : "ℹ️ Deterministic cleaner active (pull an LLM for --llm-clean)"}`,
      );
      out(
        `  FFmpeg Transcoder:  ${status.ffmpegInstalled ? "✅ Installed (all 9 audio + 4 video formats enabled)" : "⚠️ Not found (native WAV & AIFF enabled)"}`,
      );
      out(
        `  Available Voices:   ${status.voices.length} neural voices (${status.customVoices.length} custom cloned)`,
      );
      out(
        `  Audio Formats:      ${AUDIO_FORMAT_INFO.map((f) => f.id.toUpperCase()).join(", ")}`,
      );
      out(
        `  Video Formats:      ${VIDEO_FORMAT_INFO.map((f) => f.id.toUpperCase()).join(", ")} (Read-Along Karaoke + SRT/VTT)`,
      );
      return 0;
    }

    // ------------------------------------------------------------------------
    // 2. VOICES (`voices` / `--voices`)
    // ------------------------------------------------------------------------
    if (showVoices) {
      const status = await getPhononStatus(ctx);
      if (jsonOutput) {
        out(
          JSON.stringify(
            {
              ok: true,
              count: status.voices.length,
              defaultVoice: status.settings.voice || "Zoey",
              voices: status.voices,
            },
            null,
            2,
          ),
        );
        return 0;
      }

      out(
        `🎙️  Ollama Phonon Neural Voices (${status.voices.length} available)`,
      );
      out(
        "────────────────────────────────────────────────────────────────────────────",
      );
      out(` ${"VOICE ID".padEnd(28)} | ${"CATEGORY".padEnd(18)} | DESCRIPTION`);
      out(
        "──────────────────────────────┼────────────────────┼─────────────────────────",
      );
      for (const v of status.voices) {
        out(` ${v.id.padEnd(28)} | ${v.category.padEnd(18)} | ${v.desc}`);
      }
      out(
        '\n💡 Use any voice with: --voice "<Voice ID>" (e.g. --voice Zoey or --voice "Captain Silas Blackwater")',
      );
      return 0;
    }

    // ------------------------------------------------------------------------
    // 3. FORMATS (`formats` / `--formats`)
    // ------------------------------------------------------------------------
    if (showFormats) {
      if (jsonOutput) {
        out(
          JSON.stringify(
            {
              ok: true,
              audioFormats: AUDIO_FORMAT_INFO,
              videoFormats: VIDEO_FORMAT_INFO,
              videoAspects: Object.values(VIDEO_ASPECT_INFO),
              videoThemes: Object.values(VIDEO_THEME_INFO),
            },
            null,
            2,
          ),
        );
        return 0;
      }

      out("🎵  Supported Audio Export Formats (9 Formats):");
      out(
        "────────────────────────────────────────────────────────────────────────────────────",
      );
      for (const f of AUDIO_FORMAT_INFO) {
        const dep = f.needsFfmpeg ? "FFmpeg" : "Native (Zero-Dep)";
        out(
          `  • ${f.id.toUpperCase().padEnd(6)} (.${f.ext.padEnd(4)}) [${dep.padEnd(17)}] — ${f.desc}`,
        );
      }
      out("");
      out(
        "🎬  Supported Read-Along Video Export Formats (4 Formats with Synchronized Text + .SRT/.VTT):",
      );
      out(
        "────────────────────────────────────────────────────────────────────────────────────",
      );
      for (const f of VIDEO_FORMAT_INFO) {
        out(
          `  • ${f.id.toUpperCase().padEnd(6)} (.${f.ext.padEnd(4)}) [1080p Karaoke Video] — ${f.desc}`,
        );
      }
      out("");
      out(
        "📐  Read-Along Video Aspect Ratios (--aspect): 16:9 (1920×1080), 9:16 (1080×1920 Shorts), 1:1 (1080×1080 Square)",
      );
      out(
        "🎨  Read-Along Video Color Themes (--theme):   midnight, parchment, cyber, high_contrast",
      );
      return 0;
    }

    // ------------------------------------------------------------------------
    // 4. CLONE VOICE (`clone-voice` / `--clone-voice`)
    // ------------------------------------------------------------------------
    if (subcommand === "clone-voice" || cloneVoiceSource) {
      const srcFile = cloneVoiceSource || positionals[0] || inputFile;
      if (!srcFile) {
        err(
          "❌ Provide a reference audio file (.wav, .mp3, .m4a, .flac) to clone.",
        );
        return 1;
      }
      const absSource = nodePath.resolve(cwd, srcFile);
      if (!existsSync(absSource)) {
        err(`❌ Audio file not found: ${absSource}`);
        return 1;
      }
      const desiredName =
        cloneVoiceName ||
        positionals[1] ||
        title ||
        nodePath.basename(absSource, nodePath.extname(absSource));

      const cloned = await createCustomVoiceFromAudio(ctx, {
        name: desiredName,
        sourcePath: absSource,
      });

      if (jsonOutput) {
        out(
          JSON.stringify(
            {
              ok: true,
              voice: cloned.voice,
              totalCustomVoices: cloned.voices.length,
            },
            null,
            2,
          ),
        );
        return 0;
      }

      out(
        `✅ Cloned custom Phonon voice: "${cloned.voice.label}" (ID: ${cloned.voice.id})`,
      );
      out(`   • Base Voice Match:   ${cloned.voice.baseVoiceId}`);
      out(
        `   • Fundamental Pitch:  ${cloned.voice.profile.medianF0Hz} Hz (${cloned.voice.profile.voiceRegister})`,
      );
      out(`   • Timbre Profile:     ${cloned.voice.profile.timbreLabel}`);
      out(`   • Use with:           --voice "${cloned.voice.id}"`);
      return 0;
    }

    // ------------------------------------------------------------------------
    // Resolve Input Source (File, Positional File/Text, or Stdin)
    // ------------------------------------------------------------------------
    if (!inputFile && !inlineText && positionals.length > 0) {
      const firstPos = positionals[0]!;
      const candidatePath = nodePath.resolve(cwd, firstPos);
      if (positionals.length === 1 && existsSync(candidatePath)) {
        inputFile = candidatePath;
      } else {
        inlineText = positionals.join(" ");
      }
    }

    if (!inputFile && !inlineText && io.stdinText) {
      inlineText = io.stdinText;
    } else if (!inputFile && !inlineText && inputFile === "-") {
      inlineText = await new Response(Bun.stdin.stream()).text();
      inputFile = "";
    }

    // If launched with no arguments at all, show status overview + quick usage hint
    if (!inputFile && !inlineText) {
      printRichHelp(out);
      return 0;
    }

    const resolvedInputFile = inputFile
      ? nodePath.resolve(cwd, inputFile)
      : undefined;
    if (resolvedInputFile && !existsSync(resolvedInputFile)) {
      err(`❌ Input file not found: ${resolvedInputFile}`);
      return 1;
    }

    const cleanOpts: DocumentCleanOptions = {
      clean,
      llmClean,
      cleanModel,
      stripCodeBlocks,
      unwrapLines,
      expandAbbreviations,
      ...(title ? { bookTitle: title } : {}),
    };

    // ------------------------------------------------------------------------
    // 5. MULTI-CHAPTER AUDIOBOOK (`audiobook` / `--audiobook`)
    // ------------------------------------------------------------------------
    if (audiobookMode) {
      const targetFormats = resolveTargetFormats(formatFlag, outputPath);
      const primaryFormat = targetFormats[0]!;
      const fmtInfo =
        ALL_MEDIA_FORMAT_INFO.find((f) => f.id === primaryFormat) ??
        AUDIO_FORMAT_INFO[0]!;
      const ollamaExe = resolveTool(ctx, "ollama") || Bun.which("ollama") || "";
      const ffmpegExe =
        resolveTool(ctx, "ffmpeg") || Bun.which("ffmpeg") || null;

      if (fmtInfo.needsFfmpeg && !ffmpegExe) {
        err(
          `❌ Exporting audiobook as .${primaryFormat.toUpperCase()} requires ffmpeg. Install ffmpeg or use --format wav / aiff.`,
        );
        return 1;
      }

      const extractedBook = await extractAudiobookChapters(ctx, {
        path: resolvedInputFile,
        text: inlineText || undefined,
        clean,
        maxChapters,
        ext: fmtInfo.ext,
      });

      const bookTitle = title || extractedBook.bookTitle || "Audiobook";
      const safeBookTitle =
        bookTitle
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80) || "Audiobook";

      const baseOutDir = outputPath
        ? nodePath.resolve(cwd, outputPath)
        : resolvedInputFile
          ? nodePath.join(
              nodePath.dirname(resolvedInputFile),
              `${safeBookTitle} - Audiobook`,
            )
          : nodePath.join(cwd, `${safeBookTitle} - Audiobook`);

      await fsp.mkdir(baseOutDir, { recursive: true });

      if (!jsonOutput) {
        out(`📚 Exporting Multi-Chapter Audiobook: "${safeBookTitle}"`);
        out(`   • Source Format:  ${extractedBook.formatLabel}`);
        out(`   • Chapters:       ${extractedBook.chapters.length}`);
        out(`   • Voice & Format: ${voice} · ${primaryFormat.toUpperCase()}`);
        out(`   • Output Folder:  ${baseOutDir}`);
      }

      if (ollamaExe) {
        await ensureOllamaDaemon(ctx, ollamaExe).catch(() => {});
      }

      const exportedChapters: Array<{
        number: number;
        title: string;
        fileName: string;
        outputPath: string;
        wordCount: number;
        durationSec: number;
        sizeBytes: number;
      }> = [];

      for (const ch of extractedBook.chapters) {
        let chText = ch.text;
        if (clean) {
          chText = cleanDocumentForTts(chText, cleanOpts);
          if (llmClean) {
            const llmRes = await cleanDocumentWithOllamaLlm(
              ctx,
              chText,
              cleanOpts,
            );
            chText = llmRes.text;
          }
        }
        const chChunks = splitTextForPhonon(chText, {
          maxChars: chunkSize,
          mergeShortParagraphs: true,
        });
        const chOutPath = nodePath.join(baseOutDir, ch.safeFileName);
        if (!jsonOutput) {
          out(
            `   ⏳ Chapter ${ch.number}/${extractedBook.chapters.length}: "${ch.title}" (${ch.wordCount} words, ${chChunks.length} chunks)...`,
          );
        }
        const exported = await synthesizeAndExportAudioFile(ctx, {
          ollamaExe,
          ffmpegExe,
          chunks: chChunks,
          voice,
          format: primaryFormat,
          speed,
          pitch,
          pauseMs,
          outputPath: chOutPath,
          aspectRatio,
          videoTheme,
          saveSubtitles: Boolean(subtitlesExplicit),
          title: `${safeBookTitle} - ${ch.title}`,
        });
        exportedChapters.push({
          number: ch.number,
          title: ch.title,
          fileName: ch.safeFileName,
          outputPath: exported.outputPath,
          wordCount: ch.wordCount,
          durationSec: exported.durationSec,
          sizeBytes: exported.sizeBytes,
        });
      }

      const playlistPath = nodePath.join(baseOutDir, "audiobook.m3u8");
      const manifestPath = nodePath.join(baseOutDir, "chapters.json");
      const m3uLines = [
        "#EXTM3U",
        `#PLAYLIST:${safeBookTitle} (${voice})`,
        ...exportedChapters.flatMap((ch) => [
          `#EXTINF:${Math.round(ch.durationSec)},${safeBookTitle} - ${ch.title}`,
          ch.fileName,
        ]),
        "",
      ];
      await fsp.writeFile(playlistPath, m3uLines.join("\n"), "utf8");

      const totalDurationSec = exportedChapters.reduce(
        (s, c) => s + c.durationSec,
        0,
      );
      const totalWords = exportedChapters.reduce((s, c) => s + c.wordCount, 0);
      const manifestData = {
        ok: true,
        bookTitle: safeBookTitle,
        formatLabel: extractedBook.formatLabel,
        voice,
        format: primaryFormat,
        audiobookDir: baseOutDir,
        playlistPath,
        manifestPath,
        chapterCount: exportedChapters.length,
        totalWords,
        totalDurationSec: Math.round(totalDurationSec * 100) / 100,
        chapters: exportedChapters,
      };
      await fsp.writeFile(
        manifestPath,
        JSON.stringify(manifestData, null, 2),
        "utf8",
      );

      if (jsonOutput) {
        out(JSON.stringify(manifestData, null, 2));
      } else {
        out(
          `✅ Audiobook export complete (${exportedChapters.length} chapters, ${formatDurationHuman(totalDurationSec)})`,
        );
        out(`   • Playlist: ${playlistPath}`);
        out(`   • Manifest: ${manifestPath}`);
      }
      return 0;
    }

    // ------------------------------------------------------------------------
    // 6. EXTRACT & CLEAN DOCUMENT (`extractAndCleanInput`)
    // ------------------------------------------------------------------------
    const cleanedDoc = await extractAndCleanInput(ctx, {
      filePath: resolvedInputFile,
      text: inlineText || undefined,
      cleanOpts,
      maxChunkChars: chunkSize,
    });

    // Save cleaned plain text if `--save-txt` was requested, or if `--clean-only` + `--output` was given
    if (saveTxtPath) {
      const absTxt = nodePath.resolve(cwd, saveTxtPath);
      mkdirSync(nodePath.dirname(absTxt), { recursive: true });
      writeFileSync(absTxt, `${cleanedDoc.cleanedText}\n`, "utf8");
    }

    if (
      cleanOnly ||
      (outputPath && /\.txt$/i.test(outputPath) && !formatFlag)
    ) {
      const targetTxtPath = outputPath ? nodePath.resolve(cwd, outputPath) : "";
      if (targetTxtPath) {
        mkdirSync(nodePath.dirname(targetTxtPath), { recursive: true });
        writeFileSync(targetTxtPath, `${cleanedDoc.cleanedText}\n`, "utf8");
      }

      if (jsonOutput) {
        out(
          JSON.stringify(
            {
              ok: true,
              mode: "clean",
              inputFile: resolvedInputFile ?? null,
              outputFile:
                targetTxtPath ||
                (saveTxtPath ? nodePath.resolve(cwd, saveTxtPath) : null),
              formatLabel: cleanedDoc.formatLabel,
              extractionMethod: cleanedDoc.extractionMethod,
              cleaningMethod: cleanedDoc.cleaningMethod,
              llmModelUsed: cleanedDoc.llmModelUsed,
              rawCharCount: cleanedDoc.rawCharCount,
              cleanedCharCount: cleanedDoc.cleanedCharCount,
              wordCount: cleanedDoc.wordCount,
              chunkCount: cleanedDoc.chunkCount,
              estimatedSeconds: cleanedDoc.estimatedSeconds,
              text: cleanedDoc.cleanedText,
            },
            null,
            2,
          ),
        );
        return 0;
      }

      if (targetTxtPath) {
        out(`🧹 Cleaned Document Saved: ${targetTxtPath}`);
        out(
          `   • Source Format:   ${cleanedDoc.formatLabel} (${cleanedDoc.extractionMethod})`,
        );
        out(`   • Cleaner Used:    ${cleanedDoc.cleaningMethod}`);
        out(
          `   • Characters:      ${cleanedDoc.rawCharCount} raw → ${cleanedDoc.cleanedCharCount} cleaned`,
        );
        out(
          `   • Word Count:      ${cleanedDoc.wordCount} words (~${formatDurationHuman(cleanedDoc.estimatedSeconds)} speech)`,
        );
      } else {
        out(cleanedDoc.cleanedText);
      }
      return 0;
    }

    // ------------------------------------------------------------------------
    // 7. SYNTHESIZE & EXPORT TO ANY AUDIO / VIDEO FORMAT (OR LIVE SPEAK)
    // ------------------------------------------------------------------------
    const chunks: PhononTextChunk[] = splitTextForPhonon(
      cleanedDoc.cleanedText,
      {
        maxChars: chunkSize,
        mergeShortParagraphs: true,
      },
    );

    const ollamaExe = resolveTool(ctx, "ollama") || Bun.which("ollama") || "";
    const ffmpegExe = resolveTool(ctx, "ffmpeg") || Bun.which("ffmpeg") || null;

    if (ollamaExe) {
      await ensureOllamaDaemon(ctx, ollamaExe).catch(() => {});
    }

    // Pure `speak` mode without file export: synthesize & play aloud chunk-by-chunk (or full file if -o / -f also passed)
    if (speakMode && !outputPath && !formatFlag) {
      if (!jsonOutput) {
        out(
          `🔊 Speaking with Ollama Phonon (Voice: ${voice}, Chunks: ${chunks.length}, Words: ${cleanedDoc.wordCount})`,
        );
        out(`   • Cleaning: ${cleanedDoc.cleaningMethod}`);
      }

      const tmpPlayPath = nodePath.join(
        ctx.dataDir,
        `tts_cli_speak_${process.pid}_${Date.now()}.wav`,
      );
      mkdirSync(nodePath.dirname(tmpPlayPath), { recursive: true });

      const exported = await synthesizeAndExportAudioFile(ctx, {
        ollamaExe,
        ffmpegExe,
        chunks,
        voice,
        format: "wav",
        speed,
        pitch,
        pauseMs,
        outputPath: tmpPlayPath,
        title: title || cleanedDoc.title,
        onChunkProgress: (done, total) => {
          if (!jsonOutput) {
            out(`   🎙️  Synthesizing chunk ${done}/${total}...`);
          }
        },
      });

      if (!jsonOutput) {
        for (const c of chunks) {
          out(`   💬 "${c.text}"`);
        }
      }

      const playRes = await playAudioFileOnSpeaker(exported.outputPath);
      await fsp.rm(tmpPlayPath, { force: true }).catch(() => {});

      if (jsonOutput) {
        out(
          JSON.stringify(
            {
              ok: true,
              mode: "speak",
              voice,
              model,
              cleaningMethod: cleanedDoc.cleaningMethod,
              llmModelUsed: cleanedDoc.llmModelUsed,
              wordCount: cleanedDoc.wordCount,
              chunkCount: exported.chunkCount,
              durationSec: exported.durationSec,
              playedOnSpeaker: playRes.played,
              player: playRes.player,
              cleanedText: cleanedDoc.cleanedText,
            },
            null,
            2,
          ),
        );
      } else {
        out(
          `✅ Finished speaking (${formatDurationHuman(exported.durationSec)} via ${playRes.player}).`,
        );
      }
      return 0;
    }

    // Export to 1 or more target formats (wav, mp3, m4a, aac, flac, ogg, opus, aiff, wma, mp4, webm, mov, mkv)
    const targetFormats = resolveTargetFormats(formatFlag, outputPath);
    const multiFormat = targetFormats.length > 1;

    for (const fmt of targetFormats) {
      const fmtInfo = ALL_MEDIA_FORMAT_INFO.find((f) => f.id === fmt);
      if (fmtInfo?.needsFfmpeg && !ffmpegExe) {
        err(
          `❌ Exporting to .${fmt.toUpperCase()} requires ffmpeg. Install ffmpeg (brew install ffmpeg) or choose --format wav / aiff.`,
        );
        return 1;
      }
    }

    if (!jsonOutput) {
      out("🎙️  Ollama Phonon TTS — Document Cleaner & Media Exporter");
      out(
        "────────────────────────────────────────────────────────────────────",
      );
      out(
        `  • Source:         ${resolvedInputFile ? `${nodePath.basename(resolvedInputFile)} (${cleanedDoc.formatLabel})` : "Inline / Stdin Text"}`,
      );
      out(
        `  • Document Clean: ${cleanedDoc.cleaningMethod} (${cleanedDoc.rawCharCount} → ${cleanedDoc.cleanedCharCount} chars)`,
      );
      out(
        `  • Text Stats:     ${cleanedDoc.wordCount} words across ${chunks.length} chunk${chunks.length === 1 ? "" : "s"} (~${formatDurationHuman(cleanedDoc.estimatedSeconds)})`,
      );
      out(
        `  • Voice & Speed:  ${voice} · ${speed}x speed${pitch !== 0 ? ` · ${pitch > 0 ? "+" : ""}${pitch} st pitch` : ""}`,
      );
      out(
        `  • Target Format:  ${targetFormats.map((f) => f.toUpperCase()).join(", ")}`,
      );
    }

    const exportsCompleted: Array<{
      format: PhononAudioFormat;
      isVideo: boolean;
      outputPath: string;
      sizeBytes: number;
      sizeHuman: string;
      durationSec: number;
      srtPath?: string;
      vttPath?: string;
      assPath?: string;
    }> = [];

    let lastTimeline: PhononReadAlongTimeline | undefined;

    for (let idx = 0; idx < targetFormats.length; idx++) {
      const fmt = targetFormats[idx]!;
      const isVideo = isPhononVideoFormat(fmt);
      const destPath = resolveOutputFilePath({
        outputFlag: outputPath,
        inputFilePath: resolvedInputFile,
        title: title || cleanedDoc.title,
        voice,
        format: fmt,
        multiFormat,
        cwd,
      });

      const saveSubtitlesForVideo =
        subtitlesExplicit !== undefined ? subtitlesExplicit : isVideo;

      const exported = await synthesizeAndExportAudioFile(ctx, {
        ollamaExe,
        ffmpegExe,
        chunks,
        voice,
        format: fmt,
        speed,
        pitch,
        pauseMs,
        outputPath: destPath,
        aspectRatio,
        videoTheme,
        saveSubtitles: saveSubtitlesForVideo,
        title: title || cleanedDoc.title,
        onChunkProgress: (done, total) => {
          if (!jsonOutput && idx === 0) {
            out(
              `  ⏳ Synthesizing speech chunk ${done}/${total} with Ollama (${voice})...`,
            );
          }
        },
        onStageLog: (line) => {
          if (!jsonOutput) {
            out(`  🎬 ${line}`);
          }
        },
      });

      lastTimeline = exported.timeline ?? lastTimeline;
      let srtPath = exported.srtPath;
      let vttPath = exported.vttPath;
      let assPath: string | undefined;

      // If user requested companion subtitles on an audio-only format (or explicit --srt / --vtt / --ass paths)
      if (exported.timeline) {
        const stemPath = destPath.replace(/\.[^.]+$/, "");
        if (
          !isVideo &&
          subtitlesExplicit === true &&
          !srtOutPath &&
          !vttOutPath
        ) {
          srtPath = `${stemPath}.srt`;
          vttPath = `${stemPath}.vtt`;
          writeFileSync(srtPath, formatSrtSubtitles(exported.timeline), "utf8");
          writeFileSync(vttPath, formatVttSubtitles(exported.timeline), "utf8");
        }
        if (srtOutPath && idx === 0) {
          srtPath = nodePath.resolve(cwd, srtOutPath);
          mkdirSync(nodePath.dirname(srtPath), { recursive: true });
          writeFileSync(srtPath, formatSrtSubtitles(exported.timeline), "utf8");
        }
        if (vttOutPath && idx === 0) {
          vttPath = nodePath.resolve(cwd, vttOutPath);
          mkdirSync(nodePath.dirname(vttPath), { recursive: true });
          writeFileSync(vttPath, formatVttSubtitles(exported.timeline), "utf8");
        }
        if (assOutPath && idx === 0) {
          assPath = nodePath.resolve(cwd, assOutPath);
          mkdirSync(nodePath.dirname(assPath), { recursive: true });
          writeFileSync(
            assPath,
            formatAssKaraokeSubtitles(exported.timeline, {
              voice,
              title: title || cleanedDoc.title || "Phonon Read-Along",
              aspectRatio,
              videoTheme,
            }),
            "utf8",
          );
        }
      }

      exportsCompleted.push({
        format: fmt,
        isVideo,
        outputPath: exported.outputPath,
        sizeBytes: exported.sizeBytes,
        sizeHuman: formatBytesHuman(exported.sizeBytes),
        durationSec: exported.durationSec,
        ...(srtPath ? { srtPath } : {}),
        ...(vttPath ? { vttPath } : {}),
        ...(assPath ? { assPath } : {}),
      });

      if (!jsonOutput) {
        out(
          `  ✅ Exported ${fmt.toUpperCase()}: ${exported.outputPath} (${formatBytesHuman(exported.sizeBytes)}, ${formatDurationHuman(exported.durationSec)})`,
        );
        if (srtPath) out(`     📝 Subtitles (SRT): ${srtPath}`);
        if (vttPath) out(`     📝 Subtitles (VTT): ${vttPath}`);
        if (assPath) out(`     📝 Subtitles (ASS): ${assPath}`);
      }
    }

    if ((speakMode || playAfterExport) && exportsCompleted[0]) {
      const playTarget = exportsCompleted[0].outputPath;
      const playRes = await playAudioFileOnSpeaker(playTarget);
      if (!jsonOutput && playRes.played) {
        out(`  🔊 Played on system speaker via ${playRes.player}`);
      }
    }

    if (jsonOutput) {
      const primary = exportsCompleted[0]!;
      out(
        JSON.stringify(
          {
            ok: true,
            mode: "export",
            voice,
            model,
            speed,
            pitch,
            pauseMs,
            inputFile: resolvedInputFile ?? null,
            formatLabel: cleanedDoc.formatLabel,
            extractionMethod: cleanedDoc.extractionMethod,
            cleaningMethod: cleanedDoc.cleaningMethod,
            llmModelUsed: cleanedDoc.llmModelUsed,
            rawCharCount: cleanedDoc.rawCharCount,
            cleanedCharCount: cleanedDoc.cleanedCharCount,
            wordCount: cleanedDoc.wordCount,
            chunkCount: chunks.length,
            durationSec: primary.durationSec,
            outputPath: primary.outputPath,
            format: primary.format,
            sizeBytes: primary.sizeBytes,
            srtPath: primary.srtPath ?? null,
            vttPath: primary.vttPath ?? null,
            assPath: primary.assPath ?? null,
            savedTextPath: saveTxtPath
              ? nodePath.resolve(cwd, saveTxtPath)
              : null,
            exports: exportsCompleted,
            cleanedText: cleanedDoc.cleanedText,
            cueCount: lastTimeline?.cues.length ?? 0,
          },
          null,
          2,
        ),
      );
    }

    return 0;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (jsonOutput) {
      out(JSON.stringify({ ok: false, error: msg }, null, 2));
    } else {
      err(`❌ Error: ${msg}`);
    }
    return 1;
  } finally {
    for (const dispose of ctx.disposers) {
      try {
        dispose();
      } catch {}
    }
  }
}

if (import.meta.main) {
  const code = await runTtsCli(process.argv.slice(2));
  process.exit(code);
}
