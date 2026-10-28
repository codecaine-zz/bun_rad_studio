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

export const AUDIO_FORMAT_INFO: Array<{
  id: PhononAudioFormat;
  label: string;
  ext: string;
  mime: string;
  needsFfmpeg: boolean;
  desc: string;
}> = [
  { id: "wav", label: "WAV (24 kHz PCM — Native)", ext: "wav", mime: "audio/wav", needsFfmpeg: false, desc: "Uncompressed studio-grade 24 kHz 16-bit mono WAV directly from Phonon. Works without ffmpeg." },
  { id: "mp3", label: "MP3 (Universal Audio)", ext: "mp3", mime: "audio/mpeg", needsFfmpeg: true, desc: "Compact MP3 audio file playable on every phone, car, and media player (uses ffmpeg)." },
  { id: "m4a", label: "M4A / AAC (Apple & Podcast)", ext: "m4a", mime: "audio/mp4", needsFfmpeg: true, desc: "High-efficiency AAC audio in an M4A container for Apple devices and audiobooks (uses ffmpeg)." },
  { id: "aac", label: "AAC (Raw ADTS Stream)", ext: "aac", mime: "audio/aac", needsFfmpeg: true, desc: "Advanced Audio Coding stream (uses ffmpeg)." },
  { id: "flac", label: "FLAC (Lossless Compressed)", ext: "flac", mime: "audio/flac", needsFfmpeg: true, desc: "Archival lossless compression, ~50% smaller than WAV with identical audio quality (uses ffmpeg)." },
  { id: "ogg", label: "OGG Vorbis", ext: "ogg", mime: "audio/ogg", needsFfmpeg: true, desc: "Open-source Ogg Vorbis audio format (uses ffmpeg)." },
  { id: "opus", label: "Opus (Best Speech Compression)", ext: "opus", mime: "audio/opus", needsFfmpeg: true, desc: "Modern low-bitrate voice codec ideal for long audiobooks and voice notes (uses ffmpeg)." },
  { id: "aiff", label: "AIFF (Apple Uncompressed PCM)", ext: "aiff", mime: "audio/aiff", needsFfmpeg: false, desc: "Uncompressed PCM AIFF audio file. Works natively even without ffmpeg." },
  { id: "wma", label: "WMA (Windows Media Audio)", ext: "wma", mime: "audio/x-ms-wma", needsFfmpeg: true, desc: "Windows Media Audio format (uses ffmpeg)." },
];

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
  settings: {
    voice: string;
    format: PhononAudioFormat;
    speed: number;
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
    settings: {
      voice: settings.phononVoice || "Zoey",
      format: settings.phononFormat || "wav",
      speed: settings.phononSpeed || 1,
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
  sampleRate: number;
  byteLength: number;
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
 * Synthesizes a chunk for live "Read Out Loud" playback (or returns it immediately from cache if already prefetched).
 */
export async function speakChunk(
  ctx: FmContext,
  input: { text?: unknown; voice?: unknown },
): Promise<{ audioId: string; url: string; durationSec: number; sampleRate: number; byteLength: number; voice: string }> {
  const rawText = typeof input.text === "string" ? input.text.trim() : "";
  if (!rawText) throw new FmError("BAD_REQUEST", "Provide text to read out loud.");

  const settings = await loadSettings(ctx);
  const voice = typeof input.voice === "string" && /^[A-Za-z0-9 _-]{1,48}$/.test(input.voice.trim()) ? input.voice.trim() : settings.phononVoice || "Zoey";

  // Ensure the chunk is within Phonon's context window even if the caller passed a longer string
  const safeChunks = splitTextForPhonon(rawText, { maxChars: PHONON_HARD_MAX_CHUNK_CHARS });
  const chunkText = safeChunks[0]?.text ?? rawText.slice(0, PHONON_HARD_MAX_CHUNK_CHARS);

  const cache = getAudioCache(ctx);
  const key = createHash("sha256").update(`${voice}\0${chunkText}`).digest("hex").slice(0, 24);
  const existing = cache.items.get(key);
  if (existing && existsSync(existing.filePath)) {
    return {
      audioId: existing.id,
      url: `/api/phonon/audio?id=${encodeURIComponent(existing.id)}`,
      durationSec: existing.durationSec,
      sampleRate: existing.sampleRate,
      byteLength: existing.byteLength,
      voice,
    };
  }

  const ollamaExe = resolveTool(ctx, "ollama");
  if (!ollamaExe) {
    throw new FmError("MISSING_TOOL", "Ollama isn't installed yet. Click the Install Ollama & Phonon button to add it in one click.");
  }
  await ensureOllamaDaemon(ctx, ollamaExe);

  const wavBuf = await synthesizePhononChunkWav(ctx, ollamaExe, chunkText, voice);
  const parsed = parseWavPcm(wavBuf);
  const cleanWav = Buffer.concat([createWavHeader(parsed.pcmData.length, parsed.sampleRate, parsed.numChannels, parsed.bitsPerSample), parsed.pcmData]);
  const bytesPerSec = Math.max(1, parsed.sampleRate * parsed.numChannels * (parsed.bitsPerSample >> 3));
  const durationSec = Math.round((parsed.pcmData.length / bytesPerSec) * 100) / 100;

  // Evict oldest if cache is full
  if (cache.items.size >= MAX_CACHED_CHUNKS) {
    const oldestKey = cache.items.keys().next().value;
    if (oldestKey) {
      const old = cache.items.get(oldestKey);
      cache.items.delete(oldestKey);
      if (old) await fsp.rm(old.filePath, { force: true }).catch(() => {});
    }
  }

  const filePath = nodePath.join(cache.dir, `${key}.wav`);
  await fsp.writeFile(filePath, cleanWav);
  const item: CachedAudioItem = {
    id: key,
    filePath,
    createdAt: Date.now(),
    durationSec,
    sampleRate: parsed.sampleRate,
    byteLength: cleanWav.length,
  };
  cache.items.set(key, item);

  return {
    audioId: key,
    url: `/api/phonon/audio?id=${encodeURIComponent(key)}`,
    durationSec,
    sampleRate: parsed.sampleRate,
    byteLength: cleanWav.length,
    voice,
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

function buildAtempoFilter(speed: number): string[] {
  const s = Math.min(2.5, Math.max(0.5, speed));
  if (Math.abs(s - 1) < 0.01) return [];
  const parts: string[] = [];
  let rem = s;
  while (rem > 2.0) {
    parts.push("atempo=2.0");
    rem /= 2.0;
  }
  while (rem < 0.5) {
    parts.push("atempo=0.5");
    rem /= 0.5;
  }
  parts.push(`atempo=${Math.round(rem * 1000) / 1000}`);
  return ["-af", parts.join(",")];
}

function ffmpegEncoderArgsForFormat(format: PhononAudioFormat, speed: number): string[] {
  const filter = buildAtempoFilter(speed);
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
  }
}

/**
 * Synthesizes an arbitrarily long list of text chunks using `ollama run phonon`, stitches their 24 kHz 16-bit mono
 * PCM samples directly on disk (inserting `pauseMs` of silence between paragraphs), and converts to the requested
 * target audio format (`wav`, `mp3`, `m4a`, `aac`, `flac`, `ogg`, `opus`, `aiff`, `wma`).
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
    pauseMs: number;
    outputPath: string;
    signal?: AbortSignal;
    onChunkProgress?: (doneChunks: number, totalChunks: number) => void;
  },
): Promise<{ outputPath: string; chunkCount: number; durationSec: number; sizeBytes: number }> {
  const { ollamaExe, ffmpegExe, chunks, voice, format, speed, pauseMs, outputPath, signal, onChunkProgress } = params;
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

        if (parsed.pcmData.length > 0) {
          await wavHandle.write(parsed.pcmData, 0, parsed.pcmData.length, 44 + totalPcmBytes);
          totalPcmBytes += parsed.pcmData.length;
        }

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

    const needsSpeedFilter = Math.abs(speed - 1) >= 0.01;
    if (format === "wav" && (!needsSpeedFilter || !ffmpegExe)) {
      await publishStagedFile(stitchedWavPath, outputPath);
    } else if (format === "aiff" && !ffmpegExe) {
      await convertWavFileToAiffNative(stitchedWavPath, stagedOutPath);
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
        ...ffmpegEncoderArgsForFormat(format, speed),
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
      chunkCount: chunks.length,
      durationSec,
      sizeBytes: finalStat.size,
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
    pauseMs?: unknown;
    cleanText?: unknown;
    outputDir?: unknown;
    outputName?: unknown;
    maxChunkChars?: unknown;
  },
): Promise<{ job: ReturnType<FmContext["jobs"]["start"]>; outputs: string[] }> {
  const settings = await loadSettings(ctx);
  const voice = typeof body.voice === "string" && /^[A-Za-z0-9 _-]{1,48}$/.test(body.voice.trim()) ? body.voice.trim() : settings.phononVoice || "Zoey";
  const format: PhononAudioFormat = (PHONON_AUDIO_FORMATS as readonly string[]).includes(String(body.format ?? ""))
    ? (body.format as PhononAudioFormat)
    : settings.phononFormat || "wav";
  const speed = typeof body.speed === "number" && isFinite(body.speed) ? Math.min(2.5, Math.max(0.5, body.speed)) : settings.phononSpeed || 1;
  const pauseMs = typeof body.pauseMs === "number" && isFinite(body.pauseMs) ? Math.min(2000, Math.max(0, Math.round(body.pauseMs))) : settings.phononPauseMs ?? 200;
  const cleanText = typeof body.cleanText === "boolean" ? body.cleanText : (settings.phononCleanText ?? true);
  const maxChunkChars = typeof body.maxChunkChars === "number" && isFinite(body.maxChunkChars)
    ? Math.min(PHONON_HARD_MAX_CHUNK_CHARS, Math.max(150, Math.round(body.maxChunkChars)))
    : PHONON_BATCH_CHUNK_CHARS;

  const ollamaExe = resolveTool(ctx, "ollama");
  if (!ollamaExe) {
    throw new FmError("MISSING_TOOL", "Ollama isn't installed yet. Click Install Ollama & Phonon first.");
  }
  const ffmpegExe = resolveTool(ctx, "ffmpeg");
  const fmtInfo = AUDIO_FORMAT_INFO.find((f) => f.id === format)!;
  if (fmtInfo.needsFfmpeg && !ffmpegExe) {
    throw new FmError("MISSING_TOOL", `Saving as .${format.toUpperCase()} needs ffmpeg. Install ffmpeg or choose WAV / AIFF.`);
  }

  const rawPaths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string" && p.trim().length > 0) : [];
  const directText = typeof body.text === "string" ? body.text.trim() : "";

  if (!directText && rawPaths.length === 0) {
    throw new FmError("BAD_REQUEST", "Provide text or select at least one file to save as audio.");
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

  if (directText) {
    const cleaned = cleanText ? cleanTextForSpeech(directText) : directText;
    const chunks = splitTextForPhonon(cleaned, { maxChars: maxChunkChars, mergeShortParagraphs: true });
    if (!chunks.length) throw new FmError("EMPTY_TEXT", "There are no readable words to save as audio.");

    const rawBase = typeof body.outputName === "string" && body.outputName.trim()
      ? splitName(nodePath.basename(body.outputName.trim()))[0] || "speech"
      : "speech";
    const safeStem = rawBase.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "speech";
    const outPath = uniqueOutputFilePath(targetDir, `${safeStem}.${fmtInfo.ext}`);
    outputs.push(outPath);

    steps.push({
      label: `${nodePath.basename(outPath)} (${chunks.length} chunk${chunks.length === 1 ? "" : "s"}, voice: ${voice})`,
      output: outPath,
      timeoutMs: Math.max(10 * 60 * 1000, chunks.length * 90_000),
      prepare: async () => ({
        work: async (signal: AbortSignal, log: (text: string) => void) => {
          await ensureOllamaDaemon(ctx, ollamaExe);
          await synthesizeAndExportAudioFile(ctx, {
            ollamaExe,
            ffmpegExe,
            chunks,
            voice,
            format,
            speed,
            pauseMs,
            outputPath: outPath,
            signal,
            onChunkProgress: (done, total) => {
              log(`Synthesized chunk ${done} of ${total} (${voice})\n`);
            },
          });
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
        label: `${nodePath.basename(srcPath)} → ${nodePath.basename(outPath)} (${voice})`,
        output: outPath,
        timeoutMs: 60 * 60 * 1000,
        prepare: async () => ({
          work: async (signal: AbortSignal, log: (text: string) => void) => {
            await ensureOllamaDaemon(ctx, ollamaExe);
            const extracted = await extractPlainTextFromFile(ctx, srcPath, { clean: cleanText, maxChars: maxChunkChars });
            const chunks = splitTextForPhonon(extracted.text, { maxChars: maxChunkChars, mergeShortParagraphs: true });
            if (!chunks.length) throw new Error(`No readable text in ${nodePath.basename(srcPath)}.`);
            await synthesizeAndExportAudioFile(ctx, {
              ollamaExe,
              ffmpegExe,
              chunks,
              voice,
              format,
              speed,
              pauseMs,
              outputPath: outPath,
              signal,
              onChunkProgress: (done, total) => {
                log(`Synthesized chunk ${done} of ${total} for ${nodePath.basename(srcPath)}\n`);
              },
            });
          },
        }),
      });
    }
  }

  const job = ctx.jobs.start({
    kind: "convert",
    title: `Phonon Speech to ${format.toUpperCase()} (${voice})`,
    steps,
  });

  return { job, outputs };
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
    if (typeof rec.cleanText === "boolean") patch.phononCleanText = rec.cleanText;
    if (typeof rec.pauseMs === "number") patch.phononPauseMs = rec.pauseMs;
    const settings = await updateSettings(ctx, patch);
    return {
      voice: settings.phononVoice,
      format: settings.phononFormat,
      speed: settings.phononSpeed,
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
  "phonon/speak": (ctx, b) => speakChunk(ctx, (b ?? {}) as { text?: unknown; voice?: unknown }),
  "phonon/save": (ctx, b) => startPhononAudioExportJob(ctx, (b ?? {}) as Record<string, unknown>),
  "phonon/savetxt": (ctx, b) => savePlainTextToFile(ctx, (b ?? {}) as Record<string, unknown>),
};
