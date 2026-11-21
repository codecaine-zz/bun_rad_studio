/**
 * Kindle Open-Book Page Reader & OCR Engine (`fmKindle.ts`)
 *
 * Discovers open Kindle desktop / Kindle Cloud Reader / e-reader windows,
 * captures clean window screenshots, performs high-accuracy OCR (Apple Vision on
 * macOS with Tesseract fallback across platforms), strips Kindle UI chrome
 * (headers, footers, location/percentage indicators), stitches pages cleanly,
 * and supports cancellable multi-page capture sessions with automatic page turns.
 */
import { createHash, randomUUID } from "crypto";
import { existsSync, promises as fsp } from "fs";
import { tmpdir } from "os";
import * as nodePath from "path";
import type { FmContext, FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";
import { resolveTool } from "./fmToolDetect";
import { childEnv } from "./fmTools";

export type KindleOcrEngine = "auto" | "vision" | "tesseract";
export type KindlePageTurnKey = "right" | "space" | "pagedown" | "left";
export type KindleBookStartMode = "none" | "intro" | "chapter1";

export type KindleOcrObservation = {
  text: string;
  midY: number;
  minX: number;
  maxX: number;
};

export interface KindleWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KindleWindowInfo {
  id: number;
  ownerName: string;
  title: string;
  pid: number;
  bounds: KindleWindowBounds;
  isKindle: boolean;
  score: number;
  onScreen?: boolean;
}

export interface KindleCaptureOptions {
  windowId?: number;
  ownerName?: string;
  ocrEngine?: KindleOcrEngine;
  language?: string;
  cropTopPct?: number;
  cropBottomPct?: number;
  cropLeftPct?: number;
  cropRightPct?: number;
  stripKindleChrome?: boolean;
  unwrapLines?: boolean;
  activateWindow?: boolean;
}

export interface KindleBatchOptions extends KindleCaptureOptions {
  pages: number;
  readAllPages?: boolean;
  turnKey?: KindlePageTurnKey;
  delayMs?: number;
  stopOnDuplicate?: boolean;
  includePageMarkers?: boolean;
  startMode?: KindleBookStartMode;
  stopAtBackMatter?: boolean;
  maxDuplicateRetries?: number;
}

export interface KindlePageResult {
  pageIndex: number;
  text: string;
  rawText: string;
  engine: "vision" | "tesseract";
  wordCount: number;
  charCount: number;
  duplicate?: boolean;
  windowTitle: string;
  bookTitle: string;
  twoColumn?: boolean;
  imageHash?: string;
  durationMs: number;
}

export interface KindleCaptureSession {
  sessionId: string;
  status: "running" | "completed" | "stopped" | "error";
  phase: "skipping_front" | "capturing" | "retrying" | "done";
  capturedPages: KindlePageResult[];
  combinedText: string;
  currentPage: number;
  totalPages: number;
  readAllPages: boolean;
  skippedFrontPages: number;
  startHeading?: string;
  stoppedHeading?: string;
  stoppedReason?: string;
  error?: string;
  cancelRequested: boolean;
  windowTitle: string;
  bookTitle: string;
  startedAt: number;
}

export interface KindleDeps {
  listWindows?: (
    ctx: FmContext,
  ) => Promise<{ windows: KindleWindowInfo[]; permissionHint?: string }>;
  captureWindow?: (
    window: KindleWindowInfo,
    outPng: string,
    ctx: FmContext,
  ) => Promise<void>;
  ocrImage?: (
    pngPath: string,
    opts: {
      engine: KindleOcrEngine;
      language: string;
      cropTopPct: number;
      cropBottomPct: number;
      cropLeftPct: number;
      cropRightPct: number;
    },
    ctx: FmContext,
  ) => Promise<{
    text: string;
    engine: "vision" | "tesseract";
    bookTitle?: string;
    twoColumn?: boolean;
    leftRaw?: string;
    rightRaw?: string;
  }>;
  turnPage?: (
    window: KindleWindowInfo,
    turnKey: KindlePageTurnKey,
    activateWindow: boolean,
    ctx: FmContext,
    opts?: { forceFallback?: boolean },
  ) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

const MAX_SESSIONS = 40;
const SESSION_TTL_MS = 60 * 60 * 1000;
const activeKindleSessions = new Map<string, KindleCaptureSession>();

function pruneOldSessions(): void {
  const now = Date.now();
  for (const [id, sess] of activeKindleSessions) {
    if (sess.status !== "running" && now - sess.startedAt > SESSION_TTL_MS) {
      activeKindleSessions.delete(id);
    }
  }
  while (activeKindleSessions.size > MAX_SESSIONS) {
    const oldest = activeKindleSessions.keys().next().value;
    if (!oldest) break;
    activeKindleSessions.delete(oldest);
  }
}

function clampNum(
  val: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeCaptureOptions(
  raw: Record<string, unknown> | KindleCaptureOptions,
  defaultActivate = false,
): Required<Omit<KindleCaptureOptions, "windowId" | "ownerName">> & {
  windowId?: number;
  ownerName?: string;
} {
  const r = raw as Record<string, unknown>;
  const engineRaw = String(r.ocrEngine ?? "auto").toLowerCase();
  const ocrEngine: KindleOcrEngine =
    engineRaw === "vision" || engineRaw === "tesseract" ? engineRaw : "auto";
  const windowId =
    typeof r.windowId === "number" &&
    Number.isFinite(r.windowId) &&
    r.windowId > 0
      ? Math.round(r.windowId)
      : typeof r.windowId === "string" && /^\d+$/.test(r.windowId.trim())
        ? Number(r.windowId.trim())
        : undefined;
  const ownerName =
    typeof r.ownerName === "string" && r.ownerName.trim()
      ? r.ownerName.trim()
      : undefined;
  const language =
    typeof r.language === "string" && r.language.trim()
      ? r.language.trim()
      : "en-US";
  return {
    ...(windowId !== undefined ? { windowId } : {}),
    ...(ownerName !== undefined ? { ownerName } : {}),
    ocrEngine,
    language,
    cropTopPct: clampNum(r.cropTopPct, 8, 0, 35),
    cropBottomPct: clampNum(r.cropBottomPct, 8, 0, 35),
    cropLeftPct: clampNum(r.cropLeftPct, 3, 0, 30),
    cropRightPct: clampNum(r.cropRightPct, 3, 0, 30),
    stripKindleChrome: r.stripKindleChrome !== false,
    unwrapLines: r.unwrapLines !== false,
    activateWindow:
      typeof r.activateWindow === "boolean"
        ? r.activateWindow
        : defaultActivate,
  };
}

function normalizeBatchOptions(
  raw: Record<string, unknown> | KindleBatchOptions,
): ReturnType<typeof normalizeCaptureOptions> & {
  pages: number;
  readAllPages: boolean;
  turnKey: KindlePageTurnKey;
  delayMs: number;
  stopOnDuplicate: boolean;
  includePageMarkers: boolean;
  startMode: KindleBookStartMode;
  stopAtBackMatter: boolean;
  maxDuplicateRetries: number;
} {
  const base = normalizeCaptureOptions(raw, true);
  const r = raw as Record<string, unknown>;
  const tk = String(r.turnKey ?? "right").toLowerCase();
  const turnKey: KindlePageTurnKey =
    tk === "space" || tk === "pagedown" || tk === "left" ? tk : "right";
  const rawPages = Number(r.pages);
  const readAllPages =
    r.readAllPages === true ||
    r.pages === "all" ||
    (Number.isFinite(rawPages) && rawPages === 0);
  const pages = readAllPages ? 2500 : Math.round(clampNum(r.pages, 5, 1, 5000));
  const sm = String(r.startMode ?? "none").toLowerCase();
  const startMode: KindleBookStartMode =
    sm === "intro" || sm === "chapter1" ? sm : "none";
  return {
    ...base,
    pages,
    readAllPages,
    turnKey,
    delayMs: Math.round(clampNum(r.delayMs, 900, 250, 10000)),
    stopOnDuplicate: readAllPages ? true : r.stopOnDuplicate !== false,
    includePageMarkers: r.includePageMarkers === true,
    startMode,
    stopAtBackMatter: r.stopAtBackMatter === true,
    maxDuplicateRetries: Math.round(clampNum(r.maxDuplicateRetries, 3, 0, 5)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Pure Text Cleaning, Page Stitching, Deduplication & Window Scoring
// ---------------------------------------------------------------------------------------------------------------

const KINDLE_TOOLBAR_ITEMS_RE =
  /^(?:(?:Amazon\s+Kindle|Kindle(?:\s+Cloud\s+Reader)?|Go\s+To|Aa|Bookmark|Sync|Notebook|Library|Home|Back|Contents|Search\s+Book)(?:\s+|$))+$/i;

const KINDLE_CHROME_EXACT_RE =
  /^(?:Location\s+\d+(?:\s*(?:of|\/)\s*\d+)?|Loc\.?\s*\d+(?:\s*(?:of|\/)\s*\d+)?|Page\s+\d+(?:\s*(?:of|\/)\s*\d+)?|\d{1,3}\s*%|Learning\s+Reading\s+Speed[….…]*)$/i;

const KINDLE_TIME_LEFT_RE =
  /^(?:\d+\s*(?:hr|hrs|hour|hours|min|mins|minute|minutes)(?:\s+\d+\s*(?:min|mins|minute|minutes))?\s+left\s+in\s+(?:chapter|book)|<\s*1\s*min(?:ute)?\s+left\s+in\s+(?:chapter|book))$/i;

const KINDLE_FOOTER_INLINE_RE =
  /(?:Location\s+\d+(?:\s*(?:of|\/)\s*\d+)?|Loc\.?\s*\d+|Page\s+\d+(?:\s*(?:of|\/)\s*\d+)?)\s*(?:[•·|]\s*)?(?:\d+\s*(?:hr|hrs|hour|hours|min|mins|minute|minutes)\s+left\s+in\s+(?:chapter|book))?\s*(?:[•·|]\s*)?(?:\d{1,3}\s*%)?$/i;

const HEADING_LINE_RE =
  /^(?:CHAPTER|Chapter|PART|Part|BOOK|Book|SECTION|Section|PROLOGUE|Prologue|EPILOGUE|Epilogue|APPENDIX|Appendix|INTRODUCTION|Introduction|PREFACE|Preface|FOREWORD|Foreword)\b/;

const LIST_ITEM_RE = /^(?:[-*•\u2022\u2013\u2014]\s+|\d+[.)]\s+)/;

function isKindleChromeLine(line: string, isEdgeLine: boolean): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (KINDLE_CHROME_EXACT_RE.test(trimmed)) return true;
  if (KINDLE_TOOLBAR_ITEMS_RE.test(trimmed)) return true;
  if (KINDLE_TIME_LEFT_RE.test(trimmed)) return true;
  // Combined footer like "Location 142 of 3810 • 42%" or "Page 12 of 300   8 mins left in chapter   4%"
  if (
    /^(?:Location|Loc\.?|Page)\s+\d+/i.test(trimmed) &&
    /(?:%|\bof\s+\d+|\bleft\s+in\s+(?:chapter|book))/i.test(trimmed)
  ) {
    return true;
  }
  if (isEdgeLine && /^\d{1,4}$/.test(trimmed)) return true;
  return false;
}

/**
 * Cleans OCR text captured from a Kindle window: removes top/bottom Kindle UI
 * chrome, fixes common ligatures, rejoins hyphenated word wraps, and unwraps
 * hard line breaks within paragraphs.
 */
export function cleanKindlePageText(
  raw: string,
  opts?: { stripChrome?: boolean; unwrapLines?: boolean },
): string {
  const stripChrome = opts?.stripChrome !== false;
  const unwrapLines = opts?.unwrapLines !== false;

  let text = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");

  if (stripChrome) {
    const rawLines = text.split("\n");
    const nonEmptyIndices: number[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      if (rawLines[i]!.trim().length > 0) nonEmptyIndices.push(i);
    }
    const edgeSet = new Set<number>([
      ...nonEmptyIndices.slice(0, 3),
      ...nonEmptyIndices.slice(-4),
    ]);
    const filtered: string[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]!;
      if (isKindleChromeLine(line, edgeSet.has(i))) continue;
      // Strip trailing Kindle footer badge if somehow glued to last edge line
      if (edgeSet.has(i) && KINDLE_FOOTER_INLINE_RE.test(line.trim())) {
        const cleaned = line.trim().replace(KINDLE_FOOTER_INLINE_RE, "").trim();
        if (cleaned) filtered.push(cleaned);
        continue;
      }
      filtered.push(line);
    }
    text = filtered.join("\n");
  }

  // Rejoin words broken across a line ending with a hyphen
  text = text.replace(/([A-Za-z])-\s*\n\s*([a-z])/g, "$1$2");

  if (unwrapLines) {
    const blocks = text.split(/\n[ \t]*\n+/);
    const outBlocks: string[] = [];
    for (const block of blocks) {
      const lines = block
        .split("\n")
        .map((l) => l.replace(/[ \t]+/g, " ").trim())
        .filter(Boolean);
      if (lines.length === 0) continue;

      const rebuilt: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const prev = rebuilt[rebuilt.length - 1];
        const isHeading =
          HEADING_LINE_RE.test(line) ||
          (line.length <= 56 &&
            /[A-Z]/.test(line) &&
            line === line.toUpperCase() &&
            !/^\d+$/.test(line));
        const prevIsHeading =
          prev !== undefined &&
          (HEADING_LINE_RE.test(prev) ||
            (prev.length <= 56 &&
              /[A-Z]/.test(prev) &&
              prev === prev.toUpperCase() &&
              !/^\d+$/.test(prev)));
        if (
          prev !== undefined &&
          !isHeading &&
          !prevIsHeading &&
          !LIST_ITEM_RE.test(line)
        ) {
          rebuilt[rebuilt.length - 1] = `${prev} ${line}`;
        } else {
          rebuilt.push(line);
        }
      }
      outBlocks.push(rebuilt.join("\n\n"));
    }
    text = outBlocks.join("\n\n");
  } else {
    text = text
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  return text.trim();
}

/**
 * Stitches consecutive captured Kindle pages into seamless prose, joining
 * mid-sentence page breaks with a single space (or de-hyphenating split words)
 * and separating complete paragraphs with a blank line.
 */
export function stitchKindlePages(
  pages: string[],
  opts?: { includePageMarkers?: boolean },
): string {
  const cleaned = pages.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (opts?.includePageMarkers) {
    return cleaned
      .map((p, idx) => `--- Page ${idx + 1} ---\n\n${p}`)
      .join("\n\n");
  }
  let acc = cleaned[0]!;
  for (let i = 1; i < cleaned.length; i++) {
    const next = cleaned[i]!;
    const endsWithHyphenWord = /[A-Za-z]-$/.test(acc) && /^[a-z]/.test(next);
    if (endsWithHyphenWord) {
      acc = `${acc.slice(0, -1)}${next}`;
      continue;
    }
    const endsCompleteSentence = /[.?!:;"'”’\)\]]\s*$/.test(acc);
    const startsLowercase = /^[a-z]/.test(next);
    if (!endsCompleteSentence && startsLowercase) {
      acc = `${acc} ${next}`;
    } else {
      acc = `${acc}\n\n${next}`;
    }
  }
  return acc.trim();
}

/**
 * Returns true if two captured page texts are effectively identical (exact
 * normalized match or >= 95% character-bigram Sorensen-Dice similarity), used
 * to detect end-of-book or stuck page turns during multi-page capture.
 */
export function areKindlePagesDuplicate(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 2 || nb.length < 2) return false;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < na.length - 1; i++) {
    const bg = na.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) ?? 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < nb.length - 1; i++) {
    const bg = nb.slice(i, i + 2);
    const count = bigramsA.get(bg) ?? 0;
    if (count > 0) {
      intersection++;
      bigramsA.set(bg, count - 1);
    }
  }
  const dice = (2 * intersection) / (na.length - 1 + (nb.length - 1));
  return dice >= 0.95;
}

const SELF_FILE_MANAGER_WINDOW_RE =
  /\bcodecaine\s+file\s+manager\b|\bfile-manager-studio\b|\bbun_rad_studio\b/i;

function isSelfOrFileManagerWindow(win: {
  pid?: number;
  ownerName?: string;
  title?: string;
}): boolean {
  if (typeof win.pid === "number" && win.pid > 0 && win.pid === process.pid) {
    return true;
  }
  const owner = win.ownerName || "";
  const title = win.title || "";
  return (
    SELF_FILE_MANAGER_WINDOW_RE.test(owner) ||
    SELF_FILE_MANAGER_WINDOW_RE.test(title)
  );
}

/**
 * Scores an open desktop window to prioritize Amazon Kindle / Kindle Cloud Reader
 * windows above generic browser or OS windows, and filters tiny utility windows
 * as well as File Manager / self windows.
 */
export function scoreKindleWindow(
  ownerName: string,
  title: string,
  bounds: { width: number; height: number },
  opts?: { pid?: number; onScreen?: boolean },
): { isKindle: boolean; score: number } {
  if (!bounds || bounds.width < 240 || bounds.height < 240) {
    return { isKindle: false, score: 0 };
  }
  if (isSelfOrFileManagerWindow({ pid: opts?.pid, ownerName, title })) {
    return { isKindle: false, score: 0 };
  }
  const ownerLower = (ownerName || "").toLowerCase();
  const titleLower = (title || "").toLowerCase();
  const areaBonus = Math.min(
    20,
    Math.floor((bounds.width * bounds.height) / 100000),
  );
  const onScreenBonus = opts?.onScreen === false ? 0 : 5;

  if (
    ownerLower.includes("amazon kindle") ||
    ownerLower === "kindle" ||
    /\bkindle\b/.test(ownerLower)
  ) {
    return {
      isKindle: true,
      score: 100 + (title.trim() ? 20 : 0) + areaBonus + onScreenBonus,
    };
  }

  if (
    titleLower.includes("kindle cloud reader") ||
    titleLower.includes("read.amazon.") ||
    /\bkindle\b/.test(titleLower)
  ) {
    return {
      isKindle: true,
      score: 80 + areaBonus + onScreenBonus,
    };
  }

  if (
    ownerLower.includes("books") ||
    ownerLower.includes("calibre") ||
    titleLower.includes("kobo") ||
    titleLower.includes("epub")
  ) {
    return {
      isKindle: false,
      score: 40 + areaBonus + onScreenBonus,
    };
  }

  return {
    isKindle: false,
    score: 10 + Math.min(10, Math.floor(areaBonus / 2)) + onScreenBonus,
  };
}

const KINDLE_HEADER_CHROME_RE =
  /^(?:Amazon\s+Kindle|Kindle(?:\s+Cloud\s+Reader)?|Library|Home|Back|Contents|Table\s+of\s+Contents|Aa|Go\s+To|Bookmark|Sync|Notebook|Search(?:\s+Book)?)$/i;

function isKindleHeaderChrome(rawText: string): boolean {
  const trimmed = rawText.replace(/\s+/g, " ").trim();
  if (!trimmed) return true;
  const strippedEdge = trimmed
    .replace(/^[<>←→‹›«»•·|]+\s*|\s*[<>←→‹›«»•·|]+$/g, "")
    .trim();
  const variants =
    strippedEdge && strippedEdge !== trimmed
      ? [trimmed, strippedEdge]
      : [trimmed];
  for (const s of variants) {
    if (!s) return true;
    if (KINDLE_HEADER_CHROME_RE.test(s)) return true;
    if (KINDLE_TOOLBAR_ITEMS_RE.test(s)) return true;
    if (KINDLE_CHROME_EXACT_RE.test(s)) return true;
    if (KINDLE_TIME_LEFT_RE.test(s)) return true;
    if (/^\d{1,5}$/.test(s)) return true;
    if (/^\d{1,3}(?:\.\d+)?\s*%$/.test(s)) return true;
    if (/^(?:Page|Location|Loc\.?)\s+\d+/i.test(s)) return true;
    if (/^https?:\/\//i.test(s) || /\bread\.amazon\./i.test(s)) return true;
    if (/^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i.test(s)) return true;
    if (!/[\p{L}\p{N}]/u.test(s)) return true;
  }
  return false;
}

/**
 * Extracts a clean book title from Vision OCR observations in the top header
 * band, filtering out Kindle toolbar chrome and preferring centered header text.
 */
export function extractKindleHeaderBookTitle(
  observations: KindleOcrObservation[],
  cropTopPct = 8,
): string {
  if (!Array.isArray(observations) || observations.length === 0) return "";
  const headerMinY = 1 - Math.max(8, cropTopPct) / 100;
  const headerItems = observations.filter(
    (o) =>
      o &&
      typeof o.text === "string" &&
      Number.isFinite(o.midY) &&
      o.midY >= headerMinY &&
      o.text.trim().length > 0,
  );
  if (headerItems.length === 0) return "";

  const sortedByY = [...headerItems].sort((a, b) => {
    if (b.midY !== a.midY) return b.midY - a.midY;
    return a.minX - b.minX;
  });

  const rows: KindleOcrObservation[][] = [];
  let rowAnchorY = sortedByY[0]!.midY;
  let currentRow: KindleOcrObservation[] = [];
  for (const item of sortedByY) {
    if (currentRow.length === 0 || Math.abs(item.midY - rowAnchorY) <= 0.015) {
      currentRow.push(item);
    } else {
      rows.push(currentRow);
      currentRow = [item];
      rowAnchorY = item.midY;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const centeredCandidates: Array<{
    text: string;
    midY: number;
    distFromCenter: number;
  }> = [];
  const fallbackCandidates: Array<{
    text: string;
    midY: number;
    distFromCenter: number;
  }> = [];

  for (const row of rows) {
    row.sort((a, b) => a.minX - b.minX);

    // Collapse tight adjacent pairs first so split chrome like "Go"+"To" or
    // "Search"+"Book" can be recognized and dropped as chrome.
    const tightFiltered: KindleOcrObservation[] = [];
    for (let i = 0; i < row.length; i++) {
      const cur = row[i]!;
      if (isKindleHeaderChrome(cur.text)) continue;
      const next = row[i + 1];
      if (
        next &&
        next.minX - cur.maxX <= 0.04 &&
        isKindleHeaderChrome(`${cur.text.trim()} ${next.text.trim()}`)
      ) {
        i++;
        continue;
      }
      tightFiltered.push(cur);
    }
    if (tightFiltered.length === 0) continue;

    // Group adjacent same-row items into horizontal phrases.
    const phrases: Array<{
      text: string;
      midY: number;
      minX: number;
      maxX: number;
    }> = [];
    for (const item of tightFiltered) {
      const txt = item.text.replace(/\s+/g, " ").trim();
      const prev = phrases[phrases.length - 1];
      if (prev && item.minX - prev.maxX <= 0.06) {
        prev.text = `${prev.text} ${txt}`;
        prev.maxX = Math.max(prev.maxX, item.maxX);
        prev.midY = (prev.midY + item.midY) / 2;
      } else {
        phrases.push({
          text: txt,
          midY: item.midY,
          minX: item.minX,
          maxX: item.maxX,
        });
      }
    }

    const centeredPieces = phrases.filter((p) => {
      const midX = (p.minX + p.maxX) / 2;
      return midX >= 0.2 && midX <= 0.8 && !isKindleHeaderChrome(p.text);
    });
    if (centeredPieces.length > 0) {
      const joined = centeredPieces
        .map((p) => p.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (joined && !isKindleHeaderChrome(joined)) {
        const minX = centeredPieces[0]!.minX;
        const maxX = centeredPieces[centeredPieces.length - 1]!.maxX;
        const midX = (minX + maxX) / 2;
        centeredCandidates.push({
          text: joined,
          midY: centeredPieces[0]!.midY,
          distFromCenter: Math.abs(midX - 0.5),
        });
      }
      continue;
    }

    for (const p of phrases) {
      const cleaned = p.text.replace(/\s+/g, " ").trim();
      if (cleaned && !isKindleHeaderChrome(cleaned)) {
        const midX = (p.minX + p.maxX) / 2;
        fallbackCandidates.push({
          text: cleaned,
          midY: p.midY,
          distFromCenter: Math.abs(midX - 0.5),
        });
      }
    }
  }

  if (centeredCandidates.length > 0) {
    centeredCandidates.sort((a, b) => {
      if (Math.abs(b.midY - a.midY) > 0.015) return b.midY - a.midY;
      return a.distFromCenter - b.distFromCenter;
    });
    return centeredCandidates[0]!.text.trim();
  }

  if (fallbackCandidates.length > 0) {
    fallbackCandidates.sort((a, b) => {
      if (Math.abs(b.midY - a.midY) > 0.015) return b.midY - a.midY;
      return a.distFromCenter - b.distFromCenter;
    });
    return fallbackCandidates[0]!.text.trim();
  }

  return "";
}

function assembleObservationsToLines(items: KindleOcrObservation[]): string {
  if (items.length === 0) return "";
  const sortedByY = [...items].sort((a, b) => {
    if (b.midY !== a.midY) return b.midY - a.midY;
    return a.minX - b.minX;
  });

  const rows: KindleOcrObservation[][] = [];
  let rowAnchorY = sortedByY[0]!.midY;
  let currentRow: KindleOcrObservation[] = [];

  for (const item of sortedByY) {
    if (currentRow.length === 0 || Math.abs(item.midY - rowAnchorY) <= 0.012) {
      currentRow.push(item);
    } else {
      rows.push(currentRow);
      currentRow = [item];
      rowAnchorY = item.midY;
    }
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  const lines: string[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.minX - b.minX);
    let buf = "";
    let currentMaxX = 0;
    for (const item of row) {
      const txt = item.text.trim();
      if (!txt) continue;
      if (!buf) {
        buf = txt;
        currentMaxX = item.maxX;
      } else if (item.minX - currentMaxX < 0.06) {
        buf += " " + txt;
        currentMaxX = Math.max(currentMaxX, item.maxX);
      } else {
        lines.push(buf);
        buf = txt;
        currentMaxX = item.maxX;
      }
    }
    if (buf) {
      lines.push(buf);
    }
  }

  return lines.join("\n");
}

/**
 * Orders raw Vision OCR observations into reading order: extracts any header
 * book title, crops body observations, detects two-column Kindle spreads, and
 * emits left-column-first then right-column reading order when 2-column.
 */
export function orderKindleOcrObservations(
  observations: KindleOcrObservation[],
  crop: {
    cropTopPct: number;
    cropBottomPct: number;
    cropLeftPct: number;
    cropRightPct: number;
  },
): {
  rawText: string;
  leftRaw?: string;
  rightRaw?: string;
  bookTitle: string;
  twoColumn: boolean;
} {
  const safeObs = Array.isArray(observations)
    ? observations.filter(
        (o) => o && typeof o.text === "string" && o.text.trim().length > 0,
      )
    : [];
  const bookTitle = extractKindleHeaderBookTitle(safeObs, crop.cropTopPct);

  const maxY = 1 - crop.cropTopPct / 100;
  const minY = crop.cropBottomPct / 100;
  const minXBound = crop.cropLeftPct / 100;
  const maxXBound = 1 - crop.cropRightPct / 100;

  const body = safeObs.filter(
    (o) =>
      o.midY <= maxY &&
      o.midY >= minY &&
      o.maxX >= minXBound &&
      o.minX <= maxXBound,
  );

  const leftItems = body.filter((o) => o.maxX <= 0.52);
  const rightItems = body.filter((o) => o.minX >= 0.48);
  const spanningItems = body.filter((o) => o.minX < 0.45 && o.maxX > 0.55);
  const twoColumn =
    body.length >= 6 &&
    leftItems.length >= 3 &&
    rightItems.length >= 3 &&
    spanningItems.length <= Math.floor(body.length * 0.05);

  if (twoColumn) {
    const leftCol: KindleOcrObservation[] = [];
    const rightCol: KindleOcrObservation[] = [];
    for (const o of body) {
      if (o.maxX <= 0.52 && o.minX < 0.48) {
        leftCol.push(o);
      } else if (o.minX >= 0.48 && o.maxX > 0.52) {
        rightCol.push(o);
      } else {
        const midX = (o.minX + o.maxX) / 2;
        if (midX <= 0.5) {
          leftCol.push(o);
        } else {
          rightCol.push(o);
        }
      }
    }
    const leftRaw = assembleObservationsToLines(leftCol);
    const rightRaw = assembleObservationsToLines(rightCol);
    const rawText = [leftRaw, rightRaw].filter(Boolean).join("\n\n");
    return {
      rawText,
      leftRaw,
      rightRaw,
      bookTitle,
      twoColumn: true,
    };
  }

  return {
    rawText: assembleObservationsToLines(body),
    bookTitle,
    twoColumn: false,
  };
}

const GENERIC_KINDLE_TITLE_RE =
  /^(?:(?:amazon\s+)?kindle(?:\s+(?:cloud\s+reader|for\s+mac|reader))?|(?:codecaine\s+)?file\s+manager|google\s+chrome|chrome|safari|firefox|mozilla\s+firefox|microsoft\s+edge|arc|brave)$/i;

function cleanKindleTitleCandidate(raw?: string): string {
  let s = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  s = s.replace(/^📖\s*/, "").trim();
  s = s
    .replace(
      /\s*(?:[—–\-|]+)\s*(?:google\s+chrome|safari|mozilla\s+firefox|firefox|microsoft\s+edge|arc|brave)$/i,
      "",
    )
    .trim();
  s = s
    .replace(
      /^(?:(?:amazon\s+)?kindle(?:\s+cloud\s+reader)?)\s*(?:[—–\-:|]+)\s*/i,
      "",
    )
    .trim();
  s = s
    .replace(
      /\s*(?:[—–\-|]+)\s*(?:(?:amazon\s+)?kindle(?:\s+cloud\s+reader)?)$/i,
      "",
    )
    .trim();
  if (!s || GENERIC_KINDLE_TITLE_RE.test(s)) return "";
  return s;
}

/**
 * Resolves a clean human-readable book title from the window metadata and/or
 * OCR header title, stripping generic app/browser prefixes and labels.
 */
export function resolveCleanKindleBookTitle(
  window: Pick<KindleWindowInfo, "ownerName" | "title">,
  headerBookTitle?: string,
): string {
  const fromWindow = cleanKindleTitleCandidate(window?.title);
  if (fromWindow) return fromWindow;
  const fromHeader = cleanKindleTitleCandidate(headerBookTitle);
  if (fromHeader) return fromHeader;
  return "Kindle Book";
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Book Front-Matter Skipping & Back-Matter Fluff Detection
// ---------------------------------------------------------------------------------------------------------------

const START_INTRO_HEADING_RE =
  /^(?:introduction|prologue|intro(?:\s+chapter)?|chapter\s+(?:1|one|i)\b(?:\s*[:—–.-].*)?|part\s+(?:1|one|i)\b(?:\s*[:—–.-].*)?|book\s+(?:1|one|i)\b(?:\s*[:—–.-].*)?|1[.:]\s+[A-Z].{2,70})$/i;

const START_CHAPTER1_HEADING_RE =
  /^(?:chapter\s+(?:1|one|i)\b(?:\s*[:—–.-].*)?|book\s+(?:1|one|i)\b(?:\s*[:—–.-].*)?|1[.:]\s+[A-Z].{2,70})$/i;

const FRONT_MATTER_HEADING_RE =
  /^(?:title\s+page|half\s+title|copyright(?:\s+page)?|dedication|epigraph|praise(?:\s+for\b.*)?|advance\s+praise(?:\s+for\b.*)?|foreword|preface|acknowledgm?ents|list\s+of\s+(?:figures|tables|illustrations|abbreviations)|note\s+to\s+the\s+reader|a\s+note\s+to\s+readers|how\s+to\s+use\s+this\s+book|about\s+the\s+authors?|author\s+note|contents|table\s+of\s+contents|brief\s+contents|detailed\s+contents|also\s+by\b.*|other\s+(?:books|titles)\s+by\b.*)$/i;

const FRONT_MATTER_PROSE_SIGNAL_RE =
  /\b(?:all\s+rights\s+reserved|copyright\s*©|\bISBN(?:-1[03])?\b|library\s+of\s+congress|printed\s+in\s+(?:the\s+)?(?:united\s+states|usa|u\.s\.a\.|uk|great\s+britain|canada)|published\s+by|first\s+(?:edition|published|printing)|no\s+part\s+of\s+this\s+(?:book|publication)\s+may\s+be\s+reproduced|cataloging-in-publication)\b/i;

const BACK_MATTER_HEADING_RE =
  /^(?:appendi(?:x|ces)(?:\s+[a-z0-9]+)?(?:\s*[:—–-].*)?|notes|endnotes|chapter\s+notes|footnotes|bibliography|selected\s+bibliography|references|works\s+cited|sources|further\s+reading|suggested\s+reading|glossary|index|subject\s+index|author\s+index|acknowledgm?ents|about\s+the\s+authors?|a\s+note\s+(?:about|on)\s+the\s+authors?|author\s+bio(?:graphy)?|also\s+by\b.*|other\s+(?:books|titles)\s+(?:by|from)\b.*|from\s+the\s+same\s+author|reading\s+group\s+guide|discussion\s+questions|book\s+club\s+questions|sneak\s+pe[ea]k|bonus\s+chapter|preview\s+of\b.*|excerpt\s+from\b.*|about\s+the\s+publisher|colophon|permissions|(?:photo|image|illustration)\s+credits|credits)$/i;

function normalizeCandidateHeading(rawLine: string): string {
  return rawLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[*_~`]+|[*_~`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isStandaloneHeadingCandidate(line: string): boolean {
  const clean = normalizeCandidateHeading(line);
  if (!clean || clean.length > 90) return false;
  if (/[,;]$/.test(clean)) return false;
  if (/[.!?]\s+[A-Z]/.test(clean)) return false;
  if (/\.{2,}|[·…]{2,}/.test(clean)) return false;
  if (
    /^(?:introduction|prologue|preface|foreword|acknowledgm?ents|contents|table\s+of\s+contents)\b.*\s+(?:\d{1,4}|[ivxlcdm]+)$/i.test(
      clean,
    )
  ) {
    return false;
  }
  if (/^(?:chapter|part|book)\s+\w+[:\s—–-]+\S.*\s+\d{1,4}$/i.test(clean)) {
    return false;
  }
  return true;
}

/**
 * Returns true if an OCR page or section looks like a Table of Contents page.
 */
export function isTableOfContentsPage(text: string): boolean {
  const lines = String(text ?? "")
    .split(/\n+/)
    .map((l) => normalizeCandidateHeading(l))
    .filter(Boolean);
  if (lines.length === 0) return false;

  for (const line of lines.slice(0, 4)) {
    if (
      /^(?:table\s+of\s+contents|brief\s+contents|detailed\s+contents|contents)$/i.test(
        line,
      )
    ) {
      return true;
    }
  }

  let tocLineCount = 0;
  for (const line of lines) {
    if (line.length > 96) continue;
    const hasLeaderOrPageNum =
      /\.{3,}|\s+(?:\d{1,4}|[ivxlcdm]{1,6})$/i.test(line) &&
      /^(?:chapter|part|book|section|appendix|introduction|prologue|preface|foreword|epilogue|acknowledgm?ents|index|glossary|notes|\d+[.:]|\w+)/i.test(
        line,
      );
    const shortChapterListItem =
      /^(?:chapter|part|book|appendix)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five)\b/i.test(
        line,
      ) && !/[.!?]$/.test(line);
    if (hasLeaderOrPageNum || shortChapterListItem) {
      tocLineCount++;
    }
  }

  return tocLineCount >= 4 && tocLineCount >= Math.ceil(lines.length * 0.45);
}

/**
 * Classifies a captured Kindle page as front-matter fluff to skip, the intro/chapter
 * start boundary, normal body text, or the start of back-matter fluff to stop before.
 */
export function classifyKindlePageRole(
  text: string,
  state: {
    startMode: KindleBookStartMode;
    stopAtBackMatter: boolean;
    hasStartedBody: boolean;
    inFrontMatterSection: boolean;
    skippedFrontPages: number;
  },
): {
  action: "keep" | "skip_front" | "start_here" | "stop_back";
  keptText: string;
  matchedHeading?: string;
  entersFrontSection?: boolean;
} {
  const trimmed = String(text ?? "").trim();
  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!state.hasStartedBody && state.startMode !== "none") {
    if (state.skippedFrontPages >= 60) {
      return { action: "keep", keptText: trimmed };
    }
    if (!trimmed) {
      return {
        action: "skip_front",
        keptText: "",
        matchedHeading: "Blank / Cover Page",
      };
    }
    if (isTableOfContentsPage(trimmed)) {
      return {
        action: "skip_front",
        keptText: "",
        matchedHeading: "Table of Contents",
        entersFrontSection: true,
      };
    }

    const startRe =
      state.startMode === "chapter1"
        ? START_CHAPTER1_HEADING_RE
        : START_INTRO_HEADING_RE;

    for (let i = 0; i < lines.length; i++) {
      const candidate = normalizeCandidateHeading(lines[i]!);
      if (!isStandaloneHeadingCandidate(lines[i]!)) continue;
      if (startRe.test(candidate)) {
        const keptLines = lines.slice(i);
        // Also check if back matter starts later on this very same page/spread
        if (state.stopAtBackMatter) {
          for (let j = 1; j < keptLines.length; j++) {
            const backCand = normalizeCandidateHeading(keptLines[j]!);
            if (
              isStandaloneHeadingCandidate(keptLines[j]!) &&
              BACK_MATTER_HEADING_RE.test(backCand)
            ) {
              return {
                action: "stop_back",
                keptText: keptLines.slice(0, j).join("\n\n").trim(),
                matchedHeading: backCand,
              };
            }
          }
        }
        return {
          action: "start_here",
          keptText: keptLines.join("\n\n").trim(),
          matchedHeading: candidate,
        };
      }
    }

    // Check explicit front-matter section headings or copyright/ISBN/short title pages
    let frontHeading: string | undefined;
    for (const line of lines.slice(0, 6)) {
      const cand = normalizeCandidateHeading(line);
      if (!isStandaloneHeadingCandidate(line)) continue;
      if (
        FRONT_MATTER_HEADING_RE.test(cand) ||
        (state.startMode === "chapter1" &&
          /^(?:introduction|prologue|intro(?:\s+chapter)?)$/i.test(cand))
      ) {
        frontHeading = cand;
        break;
      }
    }
    if (frontHeading) {
      return {
        action: "skip_front",
        keptText: "",
        matchedHeading: frontHeading,
        entersFrontSection: true,
      };
    }

    if (FRONT_MATTER_PROSE_SIGNAL_RE.test(trimmed)) {
      return {
        action: "skip_front",
        keptText: "",
        matchedHeading: "Copyright / Front Matter",
        entersFrontSection: true,
      };
    }

    const words = countWords(trimmed);
    const sentenceCount = (trimmed.match(/[.!?](?:\s|$)/g) ?? []).length;
    if (words < 45 && sentenceCount < 2) {
      return {
        action: "skip_front",
        keptText: "",
        matchedHeading: "Title / Dedication Page",
      };
    }

    if (state.inFrontMatterSection) {
      return {
        action: "skip_front",
        keptText: "",
        entersFrontSection: true,
      };
    }
  }

  if (state.stopAtBackMatter && lines.length > 0) {
    for (let i = 0; i < lines.length; i++) {
      const cand = normalizeCandidateHeading(lines[i]!);
      if (!isStandaloneHeadingCandidate(lines[i]!)) continue;
      if (BACK_MATTER_HEADING_RE.test(cand)) {
        return {
          action: "stop_back",
          keptText: lines.slice(0, i).join("\n\n").trim(),
          matchedHeading: cand,
        };
      }
    }
  }

  return { action: "keep", keptText: trimmed };
}

/**
 * Trims front-matter fluff (before Introduction / Prologue or Chapter 1) and
 * back-matter fluff (Acknowledgments, Appendix, Notes, Bibliography, Index, etc.)
 * from a complete extracted book/document string.
 */
export function trimBookFrontAndBackFluff(
  fullText: string,
  opts?: { startMode?: KindleBookStartMode; stripBackMatter?: boolean },
): {
  text: string;
  trimmedFront: boolean;
  trimmedBack: boolean;
  startHeading?: string;
  stoppedHeading?: string;
} {
  const startMode = opts?.startMode ?? "intro";
  const stripBackMatter = opts?.stripBackMatter !== false;
  const raw = String(fullText ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!raw) {
    return { text: "", trimmedFront: false, trimmedBack: false };
  }

  const lines = raw.split(/\n+/);
  let startIdx = 0;
  let trimmedFront = false;
  let startHeading: string | undefined;

  if (startMode !== "none") {
    const startRe =
      startMode === "chapter1"
        ? START_CHAPTER1_HEADING_RE
        : START_INTRO_HEADING_RE;
    const scanLimit = Math.min(
      lines.length,
      Math.max(120, Math.floor(lines.length * 0.45)),
    );
    let tocRunRemaining = 0;
    for (let i = 0; i < scanLimit; i++) {
      const line = lines[i]!;
      const cand = normalizeCandidateHeading(line);
      if (
        /^(?:table\s+of\s+contents|brief\s+contents|detailed\s+contents|contents)$/i.test(
          cand,
        )
      ) {
        tocRunRemaining = 80;
        continue;
      }
      if (tocRunRemaining > 0) {
        tocRunRemaining--;
        // Skip TOC lines (short lines or lines with trailing page numbers) until we pass the TOC
        if (
          cand.length === 0 ||
          /\.{2,}|\s+(?:\d{1,4}|[ivxlcdm]{1,6})$/i.test(cand) ||
          (cand.length < 75 && !/[.!?]$/.test(cand))
        ) {
          continue;
        }
        tocRunRemaining = 0;
      }
      if (isStandaloneHeadingCandidate(line) && startRe.test(cand)) {
        if (i > 0) {
          startIdx = i;
          trimmedFront = true;
          startHeading = cand;
        }
        break;
      }
    }
  }

  let endIdx = lines.length;
  let trimmedBack = false;
  let stoppedHeading: string | undefined;

  if (stripBackMatter) {
    const minBackScan = Math.max(startIdx + 1, Math.floor(lines.length * 0.35));
    for (let i = minBackScan; i < lines.length; i++) {
      const line = lines[i]!;
      const cand = normalizeCandidateHeading(line);
      if (
        isStandaloneHeadingCandidate(line) &&
        BACK_MATTER_HEADING_RE.test(cand)
      ) {
        endIdx = i;
        trimmedBack = true;
        stoppedHeading = cand;
        break;
      }
    }
  }

  const out = lines
    .slice(startIdx, endIdx)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: out || raw,
    trimmedFront,
    trimmedBack,
    ...(startHeading ? { startHeading } : {}),
    ...(stoppedHeading ? { stoppedHeading } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// macOS Swift Helpers (CGWindowListCopyWindowInfo & Vision VNRecognizeTextRequest)
// ---------------------------------------------------------------------------------------------------------------

const MACOS_LIST_WINDOWS_SWIFT = `
import CoreGraphics
import Foundation

struct WinOut: Codable {
  let id: Int
  let ownerName: String
  let title: String
  let pid: Int
  let width: Double
  let height: Double
  let x: Double
  let y: Double
  let onScreen: Bool
}

let opts: CGWindowListOption = [.excludeDesktopElements]
var results: [WinOut] = []
if let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
  for info in list {
    let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? -1
    if layer != 0 { continue }
    let id = (info[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0
    if id <= 0 { continue }
    let owner = (info[kCGWindowOwnerName as String] as? String) ?? ""
    if owner == "Window Server" || owner == "Dock" || owner == "Control Center" || owner == "Notification Center" {
      continue
    }
    let title = (info[kCGWindowName as String] as? String) ?? ""
    let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.intValue ?? 0
    let onScreen = (info[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue ?? false
    let bDict = info[kCGWindowBounds as String] as? [String: Any]
    let x = (bDict?["X"] as? NSNumber)?.doubleValue ?? 0
    let y = (bDict?["Y"] as? NSNumber)?.doubleValue ?? 0
    let w = (bDict?["Width"] as? NSNumber)?.doubleValue ?? 0
    let h = (bDict?["Height"] as? NSNumber)?.doubleValue ?? 0
    if w < 240 || h < 240 { continue }
    results.append(WinOut(id: id, ownerName: owner, title: title, pid: pid, width: w, height: h, x: x, y: y, onScreen: onScreen))
  }
}
let enc = JSONEncoder()
if let data = try? enc.encode(results), let s = String(data: data, encoding: .utf8) {
  print(s)
} else {
  print("[]")
}
`;

const MACOS_VISION_OCR_SWIFT = `
import Vision
import CoreGraphics
import ImageIO
import Foundation

struct OcrObsOut: Codable {
  let text: String
  let midY: Double
  let minX: Double
  let maxX: Double
}

let args = CommandLine.arguments
if args.count < 2 {
  fputs("Usage: vision_ocr <imagePath> [lang]\\n", stderr)
  exit(2)
}

let imgPath = args[1]
let langArg = args.count > 2 ? args[2] : "en-US"

let url = URL(fileURLWithPath: imgPath)
guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
      let cgImg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  fputs("Could not load image for OCR\\n", stderr)
  exit(1)
}

var recognizedItems: [OcrObsOut] = []
var ocrError: Error?

let request = VNRecognizeTextRequest { req, err in
  if let err = err {
    ocrError = err
    return
  }
  guard let obs = req.results as? [VNRecognizedTextObservation] else { return }
  for o in obs {
    if let top = o.topCandidates(1).first {
      let box = o.boundingBox
      recognizedItems.append(OcrObsOut(
        text: top.string,
        midY: Double(box.midY),
        minX: Double(box.minX),
        maxX: Double(box.maxX)
      ))
    }
  }
}
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
if !langArg.isEmpty {
  request.recognitionLanguages = [langArg]
}

let handler = VNImageRequestHandler(cgImage: cgImg, options: [:])
do {
  try handler.perform([request])
} catch {
  fputs("Vision OCR error: \\(error)\\n", stderr)
  exit(1)
}
if let err = ocrError {
  fputs("Vision OCR callback error: \\(err)\\n", stderr)
  exit(1)
}

let enc = JSONEncoder()
if let data = try? enc.encode(recognizedItems), let s = String(data: data, encoding: .utf8) {
  print(s)
} else {
  print("[]")
}
`;

// Captures a window by CGWindowID via CGWindowListCreateImage (works even when the window is in another Space / Full-Screen).
const MACOS_CAPTURE_WINDOW_SWIFT = `
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
if args.count < 3 {
  fputs("Usage: kindle_capture <windowId> <outPng>\\n", stderr)
  exit(2)
}

guard let wid = UInt32(args[1]), wid > 0 else {
  fputs("Invalid window ID\\n", stderr)
  exit(2)
}
let outPath = args[2]

_ = CGMainDisplayID()
guard let cgHandle = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_LAZY),
      let sym = dlsym(cgHandle, "CGWindowListCreateImage") else {
  fputs("CGWindowListCreateImage unavailable\\n", stderr)
  exit(3)
}

typealias CaptureFn = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
let captureFn = unsafeBitCast(sym, to: CaptureFn.self)

// kCGWindowListOptionIncludingWindow = 8, kCGWindowImageBoundsIgnoreFraming = 1
guard let unmanaged = captureFn(CGRect.null, 8, wid, 1) else {
  fputs("Could not create window image\\n", stderr)
  exit(1)
}
let cgImg = unmanaged.takeRetainedValue()
if cgImg.width < 20 || cgImg.height < 20 {
  fputs("Captured window image is empty\\n", stderr)
  exit(1)
}

let url = URL(fileURLWithPath: outPath)
guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
  fputs("Could not create PNG destination\\n", stderr)
  exit(1)
}
CGImageDestinationAddImage(dest, cgImg, nil)
if !CGImageDestinationFinalize(dest) {
  fputs("Could not finalize PNG image\\n", stderr)
  exit(1)
}
`;

// Activates target app/Space when requested and sends keyboard events cleanly via CGEvent.
// Supports `--frontmost-pid` and `--restore-if-frontmost <expectedCurrentPid> <restorePid>` helpers.
const MACOS_PAGE_TURN_SWIFT = `
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

let args = CommandLine.arguments
if args.count >= 2 && args[1] == "--frontmost-pid" {
  print(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0)
  exit(0)
}

if args.count >= 4 && args[1] == "--restore-if-frontmost" {
  guard let expectedPid = Int32(args[2]), let restorePid = Int32(args[3]), restorePid > 0 else {
    exit(0)
  }
  if NSWorkspace.shared.frontmostApplication?.processIdentifier == expectedPid {
    if let app = NSRunningApplication(processIdentifier: restorePid) {
      app.unhide()
      app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
    }
    let axApp = AXUIElementCreateApplication(restorePid)
    AXUIElementSetAttributeValue(axApp, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
  }
  exit(0)
}

if args.count < 3 {
  fputs("Usage: kindle_turn <pid> <keyCode> [activate:0|1]\\n", stderr)
  exit(2)
}

guard let pid = Int32(args[1]), pid > 0, let keyCodeInt = UInt16(args[2]) else {
  fputs("Invalid pid or keyCode\\n", stderr)
  exit(2)
}

let shouldActivate = args.count >= 4 && args[3] == "1"

if !AXIsProcessTrusted() {
  fputs("not allowed assistive access\\n", stderr)
  exit(4)
}

func hasLargeOnScreenWindow(_ targetPid: Int32) -> Bool {
  guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
    return false
  }
  for w in list {
    guard let ownerPid = w[kCGWindowOwnerPID as String] as? Int32, ownerPid == targetPid else { continue }
    let layer = (w[kCGWindowLayer as String] as? Int) ?? -1
    guard layer == 0 else { continue }
    if let b = w[kCGWindowBounds as String] as? [String: Any] {
      let width = (b["Width"] as? Double) ?? 0
      let height = (b["Height"] as? Double) ?? 0
      if width >= 300 && height >= 300 {
        return true
      }
    }
  }
  return false
}

let isFrontmostNow = (NSWorkspace.shared.frontmostApplication?.processIdentifier == pid)
let wasOnScreen = hasLargeOnScreenWindow(pid)

if shouldActivate && (!isFrontmostNow || !wasOnScreen) {
  if let app = NSRunningApplication(processIdentifier: pid) {
    app.unhide()
    app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
  }
  let axApp = AXUIElementCreateApplication(pid)
  AXUIElementSetAttributeValue(axApp, kAXFrontmostAttribute as CFString, kCFBooleanTrue)

  let maxIters = wasOnScreen ? 9 : 28
  for _ in 0..<maxIters {
    if NSWorkspace.shared.frontmostApplication?.processIdentifier == pid && hasLargeOnScreenWindow(pid) {
      break
    }
    usleep(50000)
  }
  usleep(wasOnScreen ? 80000 : 220000)
}

let frontAfter = (NSWorkspace.shared.frontmostApplication?.processIdentifier == pid)
if shouldActivate && !frontAfter {
  fputs("activate_fallback_needed\\n", stderr)
  exit(5)
}

let src = CGEventSource(stateID: .privateState)
guard let keyDown = CGEvent(keyboardEventSource: src, virtualKey: CGKeyCode(keyCodeInt), keyDown: true),
      let keyUp = CGEvent(keyboardEventSource: src, virtualKey: CGKeyCode(keyCodeInt), keyDown: false) else {
  fputs("Could not create CGEvent\\n", stderr)
  exit(1)
}

let flags: CGEventFlags
if keyCodeInt >= 123 && keyCodeInt <= 126 {
  flags = [.maskNumericPad, .maskSecondaryFn]
} else if keyCodeInt == 116 || keyCodeInt == 121 {
  flags = [.maskSecondaryFn]
} else {
  flags = []
}
keyDown.flags = flags
keyUp.flags = flags

if frontAfter {
  keyDown.post(tap: .cgSessionEventTap)
  usleep(40000)
  keyUp.post(tap: .cgSessionEventTap)
} else {
  keyDown.postToPid(pid)
  usleep(40000)
  keyUp.postToPid(pid)
}
`;

async function runCmd(
  argv: string[],
  env: Record<string, string>,
  timeoutMs = 15000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(argv, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env,
    windowsHide: true,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {}
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${argv[0]}`));
    }, timeoutMs);
  });
  try {
    const [stdout, stderr, code] = await Promise.race([
      Promise.all([
        new Response(proc.stdout as ReadableStream).text(),
        new Response(proc.stderr as ReadableStream).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);
    return { code, stdout, stderr };
  } finally {
    if (timer && !timedOut) clearTimeout(timer);
    if (timer && timedOut) clearTimeout(timer);
  }
}

const compiledSwiftCache = new Map<string, Promise<string | null>>();

async function getCompiledSwiftBinary(
  name: string,
  source: string,
  env: Record<string, string>,
): Promise<{ binPath: string | null; scriptPath: string }> {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const workDir = nodePath.join(tmpdir(), "bun-rad-kindle-swift");
  await fsp.mkdir(workDir, { recursive: true });
  const scriptPath = nodePath.join(workDir, `${name}-${hash}.swift`);
  const binPath = nodePath.join(workDir, `${name}-${hash}`);

  if (!existsSync(scriptPath)) {
    await fsp.writeFile(scriptPath, source, "utf8");
  }

  if (existsSync(binPath)) {
    return { binPath, scriptPath };
  }

  const swiftc = Bun.which("swiftc");
  if (!swiftc) {
    return { binPath: null, scriptPath };
  }

  let pending = compiledSwiftCache.get(binPath);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await runCmd(
          [swiftc, "-O", scriptPath, "-o", binPath],
          env,
          45000,
        );
        if (res.code === 0 && existsSync(binPath)) {
          return binPath;
        }
      } catch {}
      return null;
    })();
    compiledSwiftCache.set(binPath, pending);
  }
  const compiled = await pending;
  return { binPath: compiled, scriptPath };
}

function mapLanguageForVision(lang: string): string {
  const lower = (lang || "").trim().toLowerCase();
  if (!lower || lower === "eng" || lower === "en") return "en-US";
  if (lower === "spa" || lower === "es") return "es-ES";
  if (lower === "fra" || lower === "fre" || lower === "fr") return "fr-FR";
  if (lower === "deu" || lower === "ger" || lower === "de") return "de-DE";
  if (lower === "ita" || lower === "it") return "it-IT";
  if (lower === "por" || lower === "pt") return "pt-BR";
  if (lower === "jpn" || lower === "ja") return "ja-JP";
  if (lower === "chi_sim" || lower === "zh") return "zh-Hans";
  return lang;
}

function mapLanguageForTesseract(lang: string): string {
  const lower = (lang || "").trim().toLowerCase();
  if (!lower || lower.startsWith("en-") || lower === "en") return "eng";
  if (lower.startsWith("es-") || lower === "es") return "spa";
  if (lower.startsWith("fr-") || lower === "fr") return "fra";
  if (lower.startsWith("de-") || lower === "de") return "deu";
  if (lower.startsWith("it-") || lower === "it") return "ita";
  if (lower.startsWith("pt-") || lower === "pt") return "por";
  if (lower.startsWith("ja-") || lower === "ja") return "jpn";
  return lang;
}

// ---------------------------------------------------------------------------------------------------------------
// Platform Support & Default Platform Adapters
// ---------------------------------------------------------------------------------------------------------------

/** Returns `true` only on macOS (`darwin`), where Kindle Open-Book Reader is supported. */
export function isKindleSupportedPlatform(platform: string): boolean {
  return platform === "darwin";
}

function assertKindleSupportedPlatform(ctx: FmContext): void {
  if (!isKindleSupportedPlatform(ctx.platform)) {
    throw new FmError(
      "UNSUPPORTED_PLATFORM",
      "Kindle Open-Book Reader is only available on macOS.",
    );
  }
}

export async function listKindleWindows(
  ctx: FmContext,
  deps?: KindleDeps,
): Promise<{ windows: KindleWindowInfo[]; permissionHint?: string }> {
  assertKindleSupportedPlatform(ctx);
  if (deps?.listWindows) {
    const res = await deps.listWindows(ctx);
    return {
      ...res,
      windows: res.windows.filter(
        (w) =>
          w.id > 0 &&
          !isSelfOrFileManagerWindow(w) &&
          (!w.bounds || (w.bounds.width >= 240 && w.bounds.height >= 240)),
      ),
    };
  }
  if (process.env.SCREENSHOT_MODE === "1") {
    return {
      windows: [
        {
          id: 9001,
          ownerName: "Amazon Kindle",
          title: "Designing Data-Intensive Applications",
          pid: 1001,
          bounds: { x: 80, y: 60, width: 1280, height: 860 },
          isKindle: true,
          score: 132,
          onScreen: true,
        },
        {
          id: 9002,
          ownerName: "Safari",
          title: "Kindle Cloud Reader — Sample Book",
          pid: 1002,
          bounds: { x: 120, y: 90, width: 1200, height: 820 },
          isKindle: true,
          score: 90,
          onScreen: true,
        },
      ],
    };
  }

  const env = childEnv(ctx);
  const rawWindows: Array<{
    id: number;
    ownerName: string;
    title: string;
    pid: number;
    bounds: KindleWindowBounds;
    onScreen?: boolean;
  }> = [];

  if (ctx.platform === "darwin") {
    const swiftExe = Bun.which("swift") || "/usr/bin/swift";
    if (!existsSync(swiftExe) && !Bun.which("swift")) {
      throw new FmError(
        "MISSING_TOOL",
        "Swift runtime is unavailable on macOS for window discovery.",
      );
    }
    const { binPath, scriptPath } = await getCompiledSwiftBinary(
      "kindle_windows",
      MACOS_LIST_WINDOWS_SWIFT,
      env,
    );
    const argv = binPath ? [binPath] : [swiftExe, scriptPath];
    const res = await runCmd(argv, env, 15000);
    if (res.code !== 0) {
      throw new FmError(
        "WINDOW_LIST_FAILED",
        `Could not list open windows: ${res.stderr.trim() || "Unknown Swift error"}`,
      );
    }
    try {
      const parsed = JSON.parse(res.stdout.trim() || "[]");
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (!row || typeof row !== "object") continue;
          rawWindows.push({
            id: Number(row.id) || 0,
            ownerName: String(row.ownerName ?? ""),
            title: String(row.title ?? ""),
            pid: Number(row.pid) || 0,
            bounds: {
              x: Number(row.x) || 0,
              y: Number(row.y) || 0,
              width: Number(row.width) || 0,
              height: Number(row.height) || 0,
            },
            ...(typeof row.onScreen === "boolean"
              ? { onScreen: row.onScreen }
              : {}),
          });
        }
      }
    } catch {
      // Ignore malformed JSON
    }
  } else if (ctx.platform === "win32") {
    const ps = Bun.which("powershell") || "powershell.exe";
    const psCmd =
      "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object @{N='id';E={[int64]$_.MainWindowHandle}}, @{N='ownerName';E={$_.ProcessName}}, @{N='title';E={$_.MainWindowTitle}}, @{N='pid';E={$_.Id}} | ConvertTo-Json -Compress";
    const res = await runCmd([ps, "-NoProfile", "-Command", psCmd], env, 12000);
    if (res.code === 0 && res.stdout.trim()) {
      try {
        const parsed = JSON.parse(res.stdout.trim());
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const row of arr) {
          if (!row || !row.id) continue;
          rawWindows.push({
            id: Number(row.id) || 0,
            ownerName: String(row.ownerName ?? ""),
            title: String(row.title ?? ""),
            pid: Number(row.pid) || 0,
            bounds: { x: 0, y: 0, width: 1024, height: 768 },
          });
        }
      } catch {}
    }
  } else {
    const wmctrl = Bun.which("wmctrl");
    if (wmctrl) {
      const res = await runCmd([wmctrl, "-l", "-G", "-p"], env, 8000);
      if (res.code === 0) {
        for (const line of res.stdout.split("\n")) {
          const m =
            /^(0x[0-9a-f]+)\s+-?\d+\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s+\S+\s+(.*)$/i.exec(
              line.trim(),
            );
          if (!m) continue;
          const id = parseInt(m[1]!, 16);
          const pid = Number(m[2]) || 0;
          const x = Number(m[3]) || 0;
          const y = Number(m[4]) || 0;
          const width = Number(m[5]) || 0;
          const height = Number(m[6]) || 0;
          const title = (m[7] ?? "").trim();
          rawWindows.push({
            id,
            ownerName: title,
            title,
            pid,
            bounds: { x, y, width, height },
          });
        }
      }
    }
  }

  const scored: KindleWindowInfo[] = rawWindows
    .map((w) => {
      const { isKindle, score } = scoreKindleWindow(
        w.ownerName,
        w.title,
        w.bounds,
        { pid: w.pid, onScreen: w.onScreen },
      );
      return { ...w, isKindle, score };
    })
    .filter((w) => w.id > 0 && w.score > 0)
    .sort((a, b) => {
      if (a.isKindle !== b.isKindle) return a.isKindle ? -1 : 1;
      return b.score - a.score;
    });

  let permissionHint: string | undefined;
  if (
    ctx.platform === "darwin" &&
    scored.length > 0 &&
    scored.every((w) => !w.title.trim())
  ) {
    permissionHint =
      "Window titles are hidden by macOS privacy controls. If page capture fails, grant Screen Recording permission in System Settings → Privacy & Security → Screen Recording.";
  }

  return { windows: scored, ...(permissionHint ? { permissionHint } : {}) };
}

export async function captureWindowToPng(
  window: KindleWindowInfo,
  outPng: string,
  ctx: FmContext,
  deps?: KindleDeps,
): Promise<void> {
  if (deps?.captureWindow) {
    await deps.captureWindow(window, outPng, ctx);
    return;
  }

  const env = childEnv(ctx);
  await fsp.mkdir(nodePath.dirname(outPng), { recursive: true });

  if (ctx.platform === "darwin") {
    const sc = Bun.which("screencapture") || "/usr/sbin/screencapture";
    const swiftExe = Bun.which("swift") || "/usr/bin/swift";
    const tryScreencapture = async () => {
      const res = await runCmd(
        [sc, "-l", String(window.id), "-o", "-x", outPng],
        env,
        15000,
      );
      if (res.code === 0 && existsSync(outPng)) {
        const st = await fsp.stat(outPng).catch(() => null);
        if (st && st.size >= 100) return { ok: true, detail: "" };
      }
      return { ok: false, detail: res.stderr.trim() || res.stdout.trim() };
    };
    const tryCgWindowCapture = async () => {
      if (!existsSync(swiftExe) && !Bun.which("swift")) {
        return { ok: false, detail: "Swift runtime unavailable" };
      }
      const { binPath, scriptPath } = await getCompiledSwiftBinary(
        "kindle_capture",
        MACOS_CAPTURE_WINDOW_SWIFT,
        env,
      );
      const argv = binPath
        ? [binPath, String(window.id), outPng]
        : [swiftExe, scriptPath, String(window.id), outPng];
      const res = await runCmd(argv, env, 15000);
      if (res.code === 0 && existsSync(outPng)) {
        const st = await fsp.stat(outPng).catch(() => null);
        if (st && st.size >= 100) return { ok: true, detail: "" };
      }
      return { ok: false, detail: res.stderr.trim() || res.stdout.trim() };
    };

    // macOS `screencapture -l` fails for windows on other Spaces (`onScreen === false`),
    // while `CGWindowListCreateImage` captures Full-Screen / off-Space windows cleanly.
    const primary =
      window.onScreen === false
        ? await tryCgWindowCapture()
        : await tryScreencapture();
    if (primary.ok) return;

    const fallback =
      window.onScreen === false
        ? await tryScreencapture()
        : await tryCgWindowCapture();
    if (fallback.ok) return;

    const detail = primary.detail || fallback.detail;
    throw new FmError(
      "CAPTURE_FAILED",
      `Could not capture window "${window.title || window.ownerName}". Ensure Screen Recording permission is enabled in System Settings → Privacy & Security → Screen Recording.${detail ? ` (${detail})` : ""}`,
    );
  }

  if (ctx.platform === "win32") {
    const ps = Bun.which("powershell") || "powershell.exe";
    const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public class Win32 {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$h = [IntPtr]::new(${window.id})
$r = New-Object RECT
if (-not [Win32]::GetWindowRect($h, [ref]$r)) { throw "GetWindowRect failed" }
$w = [Math]::Max(1, $r.Right - $r.Left)
$ht = [Math]::Max(1, $r.Bottom - $r.Top)
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$bmp.Save('${outPng.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
`;
    const res = await runCmd(
      [ps, "-NoProfile", "-Command", psScript],
      env,
      15000,
    );
    if (res.code !== 0 || !existsSync(outPng)) {
      throw new FmError(
        "CAPTURE_FAILED",
        `Failed to capture Windows window screenshot: ${res.stderr.trim() || "Unknown error"}`,
      );
    }
    return;
  }

  const importBin = Bun.which("import");
  if (importBin) {
    const res = await runCmd(
      [importBin, "-window", String(window.id), outPng],
      env,
      15000,
    );
    if (res.code === 0 && existsSync(outPng)) return;
  }
  const scrotBin = Bun.which("scrot");
  if (scrotBin) {
    const res = await runCmd([scrotBin, "-u", outPng], env, 15000);
    if (res.code === 0 && existsSync(outPng)) return;
  }
  throw new FmError(
    "MISSING_TOOL",
    "Window screenshot capture on Linux requires ImageMagick (`import`) or `scrot`.",
  );
}

export async function ocrImageFile(
  pngPath: string,
  opts: {
    engine: KindleOcrEngine;
    language: string;
    cropTopPct: number;
    cropBottomPct: number;
    cropLeftPct: number;
    cropRightPct: number;
  },
  ctx: FmContext,
  deps?: KindleDeps,
): Promise<{
  text: string;
  engine: "vision" | "tesseract";
  bookTitle?: string;
  twoColumn?: boolean;
  leftRaw?: string;
  rightRaw?: string;
}> {
  if (deps?.ocrImage) {
    return await deps.ocrImage(pngPath, opts, ctx);
  }

  const env = childEnv(ctx);
  const canTryVision =
    ctx.platform === "darwin" &&
    (opts.engine === "auto" || opts.engine === "vision");

  if (canTryVision) {
    const swiftExe = Bun.which("swift") || "/usr/bin/swift";
    if (existsSync(swiftExe) || Bun.which("swift")) {
      try {
        const { binPath, scriptPath } = await getCompiledSwiftBinary(
          "kindle_vision_ocr",
          MACOS_VISION_OCR_SWIFT,
          env,
        );
        const visionLang = mapLanguageForVision(opts.language);
        const args = [pngPath, visionLang];
        const argv = binPath
          ? [binPath, ...args]
          : [swiftExe, scriptPath, ...args];
        const res = await runCmd(argv, env, 30000);
        if (res.code === 0) {
          const trimmedOut = res.stdout.trim();
          try {
            const parsed = JSON.parse(trimmedOut || "[]");
            if (Array.isArray(parsed)) {
              const observations: KindleOcrObservation[] = parsed
                .filter(
                  (item): item is Record<string, unknown> =>
                    Boolean(item) && typeof item === "object",
                )
                .map((item) => ({
                  text: String(item.text ?? ""),
                  midY: Number(item.midY) || 0,
                  minX: Number(item.minX) || 0,
                  maxX: Number(item.maxX) || 0,
                }));
              const ordered = orderKindleOcrObservations(observations, {
                cropTopPct: opts.cropTopPct,
                cropBottomPct: opts.cropBottomPct,
                cropLeftPct: opts.cropLeftPct,
                cropRightPct: opts.cropRightPct,
              });
              return {
                text: ordered.rawText,
                ...(ordered.leftRaw !== undefined
                  ? { leftRaw: ordered.leftRaw }
                  : {}),
                ...(ordered.rightRaw !== undefined
                  ? { rightRaw: ordered.rightRaw }
                  : {}),
                engine: "vision",
                bookTitle: ordered.bookTitle,
                twoColumn: ordered.twoColumn,
              };
            }
          } catch {
            // Fall through to raw stdout if non-JSON output was produced
          }
          return { text: res.stdout, engine: "vision" };
        }
        if (opts.engine === "vision") {
          throw new FmError(
            "OCR_FAILED",
            `Apple Vision OCR failed: ${res.stderr.trim() || "Unknown error"}`,
          );
        }
      } catch (e) {
        if (opts.engine === "vision") throw e;
      }
    } else if (opts.engine === "vision") {
      throw new FmError(
        "MISSING_TOOL",
        "Apple Vision OCR requires Swift on macOS.",
      );
    }
  }

  const tesseract = resolveTool(ctx, "tesseract") || Bun.which("tesseract");
  if (!tesseract) {
    throw new FmError(
      "MISSING_TOOL",
      "No OCR engine available. Install Tesseract (`brew install tesseract`) or run on macOS with Apple Vision.",
    );
  }

  let targetImg = pngPath;
  let tempCroppedPath: string | null = null;
  const hasCrop =
    opts.cropTopPct > 0 ||
    opts.cropBottomPct > 0 ||
    opts.cropLeftPct > 0 ||
    opts.cropRightPct > 0;
  if (hasCrop) {
    const ffmpeg = resolveTool(ctx, "ffmpeg") || Bun.which("ffmpeg");
    if (ffmpeg) {
      const l = opts.cropLeftPct / 100;
      const r = opts.cropRightPct / 100;
      const t = opts.cropTopPct / 100;
      const b = opts.cropBottomPct / 100;
      const wExpr = `iw*${Math.max(0.1, 1 - l - r).toFixed(4)}`;
      const hExpr = `ih*${Math.max(0.1, 1 - t - b).toFixed(4)}`;
      const xExpr = `iw*${l.toFixed(4)}`;
      const yExpr = `ih*${t.toFixed(4)}`;
      tempCroppedPath = `${pngPath}.cropped.png`;
      const cropRes = await runCmd(
        [
          ffmpeg,
          "-y",
          "-i",
          pngPath,
          "-vf",
          `crop=${wExpr}:${hExpr}:${xExpr}:${yExpr}`,
          tempCroppedPath,
        ],
        env,
        15000,
      );
      if (cropRes.code === 0 && existsSync(tempCroppedPath)) {
        targetImg = tempCroppedPath;
      } else {
        tempCroppedPath = null;
      }
    }
  }

  try {
    const tessLang = mapLanguageForTesseract(opts.language);
    const res = await runCmd(
      [tesseract, targetImg, "stdout", "-l", tessLang, "--psm", "3"],
      env,
      30000,
    );
    if (res.code !== 0) {
      throw new FmError(
        "OCR_FAILED",
        `Tesseract OCR failed: ${res.stderr.trim() || "Unknown error"}`,
      );
    }
    return { text: res.stdout, engine: "tesseract" };
  } finally {
    if (tempCroppedPath) {
      await fsp.rm(tempCroppedPath, { force: true }).catch(() => {});
    }
  }
}

export async function sendPageTurnKey(
  window: KindleWindowInfo,
  turnKey: KindlePageTurnKey,
  activateWindow: boolean,
  ctx: FmContext,
  deps?: KindleDeps,
  opts?: { forceFallback?: boolean },
): Promise<void> {
  if (deps?.turnPage) {
    await deps.turnPage(window, turnKey, activateWindow, ctx, opts);
    return;
  }

  const env = childEnv(ctx);
  if (ctx.platform === "darwin") {
    const keyCodeMap: Record<KindlePageTurnKey, number> = {
      right: 124,
      left: 123,
      space: 49,
      pagedown: 121,
    };
    const code = keyCodeMap[turnKey] ?? 124;

    if (!opts?.forceFallback && window.pid > 0) {
      const swiftExe = Bun.which("swift") || "/usr/bin/swift";
      if (existsSync(swiftExe) || Bun.which("swift")) {
        const { binPath, scriptPath } = await getCompiledSwiftBinary(
          "kindle_turn",
          MACOS_PAGE_TURN_SWIFT,
          env,
        );
        const args = [
          String(window.pid),
          String(code),
          activateWindow ? "1" : "0",
        ];
        const argv = binPath
          ? [binPath, ...args]
          : [swiftExe, scriptPath, ...args];
        const cgRes = await runCmd(argv, env, 12000);
        if (cgRes.code === 0) {
          return;
        }
        const cgErr = `${cgRes.stderr}\n${cgRes.stdout}`;
        if (cgRes.code === 4 || /not allowed assistive access/i.test(cgErr)) {
          throw new FmError(
            "PERMISSION_DENIED",
            "macOS Accessibility permission is required to turn Kindle pages automatically. Enable your terminal or Codecaine File Manager in System Settings → Privacy & Security → Accessibility (single-page capture still works without Accessibility).",
          );
        }
      }
    }

    const osascript = Bun.which("osascript") || "/usr/bin/osascript";
    const settleDelay =
      window.onScreen === false || opts?.forceFallback ? "0.95" : "0.18";
    const lines = ['tell application "System Events"'];
    if (activateWindow || opts?.forceFallback) {
      if (window.pid > 0) {
        lines.push(
          `  set frontmost of first application process whose unix id is ${window.pid} to true`,
        );
      } else if (window.ownerName) {
        const escaped = window.ownerName
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');
        if (/\bkindle\b/i.test(window.ownerName)) {
          lines.push(
            `  set frontmost of (first application process whose name is "${escaped}" or name contains "Kindle") to true`,
          );
        } else {
          lines.push(`  set frontmost of process "${escaped}" to true`);
        }
      }
      lines.push(`  delay ${settleDelay}`);
    }
    lines.push(`  key code ${code}`);
    lines.push("end tell");

    const res = await runCmd([osascript, "-e", lines.join("\n")], env, 10000);
    if (res.code !== 0) {
      const errText = `${res.stderr}\n${res.stdout}`;
      if (
        /not allowed assistive access|not allowed to send keystrokes|-1719|-25211|1002/i.test(
          errText,
        )
      ) {
        throw new FmError(
          "PERMISSION_DENIED",
          "macOS Accessibility permission is required to turn Kindle pages automatically. Enable your terminal or File Manager app in System Settings → Privacy & Security → Accessibility (single-page capture still works without Accessibility).",
        );
      }
      throw new FmError(
        "PAGE_TURN_FAILED",
        `Could not send page-turn key to "${window.title || window.ownerName}": ${res.stderr.trim() || "AppleScript error"}`,
      );
    }
    return;
  }

  if (ctx.platform === "win32") {
    const ps = Bun.which("powershell") || "powershell.exe";
    const sendKeyMap: Record<KindlePageTurnKey, string> = {
      right: "{RIGHT}",
      left: "{LEFT}",
      space: " ",
      pagedown: "{PGDN}",
    };
    const key = sendKeyMap[turnKey] ?? "{RIGHT}";
    const script = `
$wshell = New-Object -ComObject WScript.Shell
${activateWindow && window.pid > 0 ? `$null = $wshell.AppActivate(${window.pid}); Start-Sleep -Milliseconds 120` : ""}
$wshell.SendKeys('${key}')
`;
    const res = await runCmd(
      [ps, "-NoProfile", "-Command", script],
      env,
      10000,
    );
    if (res.code !== 0) {
      throw new FmError(
        "PAGE_TURN_FAILED",
        `Could not turn page on Windows: ${res.stderr.trim() || "SendKeys failed"}`,
      );
    }
    return;
  }

  const xdotool = Bun.which("xdotool");
  if (!xdotool) {
    throw new FmError(
      "MISSING_TOOL",
      "Automatic page turning on Linux requires `xdotool`.",
    );
  }
  const xKeyMap: Record<KindlePageTurnKey, string> = {
    right: "Right",
    left: "Left",
    space: "space",
    pagedown: "Page_Down",
  };
  const args = activateWindow
    ? [
        "windowactivate",
        "--sync",
        String(window.id),
        "key",
        xKeyMap[turnKey] ?? "Right",
      ]
    : ["key", "--window", String(window.id), xKeyMap[turnKey] ?? "Right"];
  const res = await runCmd([xdotool, ...args], env, 10000);
  if (res.code !== 0) {
    throw new FmError(
      "PAGE_TURN_FAILED",
      `Could not turn page with xdotool: ${res.stderr.trim() || "Unknown error"}`,
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Target Window Resolution & High-Level Capture Workflows
// ---------------------------------------------------------------------------------------------------------------

export async function resolveTargetKindleWindow(
  ctx: FmContext,
  opts: { windowId?: number; ownerName?: string },
  deps?: KindleDeps,
): Promise<{
  window: KindleWindowInfo;
  allWindows: KindleWindowInfo[];
  permissionHint?: string;
}> {
  const { windows, permissionHint } = await listKindleWindows(ctx, deps);
  if (windows.length === 0) {
    throw new FmError(
      "NO_WINDOWS",
      "No open desktop windows were found. Open Amazon Kindle or Kindle Cloud Reader and try again.",
    );
  }

  if (opts.windowId !== undefined) {
    const exact = windows.find((w) => w.id === opts.windowId);
    if (exact) return { window: exact, allWindows: windows, permissionHint };
    throw new FmError(
      "WINDOW_NOT_FOUND",
      `Target window ID ${opts.windowId} is no longer open. Click Detect Kindle to refresh open windows.`,
    );
  }

  if (opts.ownerName) {
    const targetLower = opts.ownerName.toLowerCase();
    const byOwner = windows.find(
      (w) =>
        w.ownerName.toLowerCase().includes(targetLower) ||
        w.title.toLowerCase().includes(targetLower),
    );
    if (byOwner)
      return { window: byOwner, allWindows: windows, permissionHint };
  }

  const kindle = windows.find((w) => w.isKindle);
  if (kindle) return { window: kindle, allWindows: windows, permissionHint };

  throw new FmError(
    "KINDLE_NOT_FOUND",
    "No open Kindle window was detected. Open Amazon Kindle (or Kindle Cloud Reader in your browser), or select a window from the dropdown.",
  );
}

function updateSessionBookTitle(
  session: KindleCaptureSession,
  page: KindlePageResult,
): void {
  if (
    page.bookTitle &&
    (session.bookTitle === "Kindle Book" || page.bookTitle !== "Kindle Book")
  ) {
    session.bookTitle = page.bookTitle;
  }
}

async function captureAndOcrPage(
  window: KindleWindowInfo,
  pageIndex: number,
  opts: ReturnType<typeof normalizeCaptureOptions>,
  ctx: FmContext,
  deps?: KindleDeps,
): Promise<KindlePageResult> {
  const started = Date.now();
  const tmpDir = nodePath.join(
    tmpdir(),
    `bun-rad-kindle-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  );
  await fsp.mkdir(tmpDir, { recursive: true });
  const pngPath = nodePath.join(tmpDir, `page_${pageIndex}.png`);
  try {
    await captureWindowToPng(window, pngPath, ctx, deps);
    let imageHash: string | undefined;
    try {
      const pngBytes = await fsp.readFile(pngPath);
      imageHash = createHash("sha256").update(pngBytes).digest("hex");
    } catch {}
    const ocr = await ocrImageFile(
      pngPath,
      {
        engine: opts.ocrEngine,
        language: opts.language,
        cropTopPct: opts.cropTopPct,
        cropBottomPct: opts.cropBottomPct,
        cropLeftPct: opts.cropLeftPct,
        cropRightPct: opts.cropRightPct,
      },
      ctx,
      deps,
    );
    const cleaned =
      ocr.twoColumn && ocr.leftRaw !== undefined && ocr.rightRaw !== undefined
        ? stitchKindlePages([
            cleanKindlePageText(ocr.leftRaw, {
              stripChrome: opts.stripKindleChrome,
              unwrapLines: opts.unwrapLines,
            }),
            cleanKindlePageText(ocr.rightRaw, {
              stripChrome: opts.stripKindleChrome,
              unwrapLines: opts.unwrapLines,
            }),
          ])
        : cleanKindlePageText(ocr.text, {
            stripChrome: opts.stripKindleChrome,
            unwrapLines: opts.unwrapLines,
          });
    const bookTitle = resolveCleanKindleBookTitle(window, ocr.bookTitle ?? "");
    return {
      pageIndex,
      text: cleaned,
      rawText: ocr.text,
      engine: ocr.engine,
      wordCount: countWords(cleaned),
      charCount: cleaned.length,
      windowTitle: window.title || window.ownerName || `Window #${window.id}`,
      bookTitle,
      ...(ocr.twoColumn !== undefined ? { twoColumn: ocr.twoColumn } : {}),
      ...(imageHash ? { imageHash } : {}),
      durationMs: Date.now() - started,
    };
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function captureSingleKindlePage(
  ctx: FmContext,
  rawOpts: KindleCaptureOptions | Record<string, unknown> = {},
  deps?: KindleDeps,
): Promise<{
  page: KindlePageResult;
  window: KindleWindowInfo;
  bookTitle: string;
}> {
  assertKindleSupportedPlatform(ctx);
  const opts = normalizeCaptureOptions(rawOpts, false);
  const { window } = await resolveTargetKindleWindow(ctx, opts, deps);
  const page = await captureAndOcrPage(window, 1, opts, ctx, deps);
  return { page, window, bookTitle: page.bookTitle };
}

function isScannedPageUnchanged(
  prevText: string,
  prevHash: string | undefined,
  curPage: KindlePageResult,
): boolean {
  if (prevText.length > 0 && curPage.text.length > 0) {
    // Only use fuzzy >=95% Dice similarity on substantial pages (>=80 chars); short pages must match exactly when normalized
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const na = norm(prevText);
    const nb = norm(curPage.text);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.length < 80 || nb.length < 80) return false;
    return areKindlePagesDuplicate(prevText, curPage.text);
  }
  if (prevText.length === 0 && curPage.text.length === 0) {
    return Boolean(
      prevHash && curPage.imageHash && prevHash === curPage.imageHash,
    );
  }
  return false;
}

function createInitialSession(
  window: KindleWindowInfo,
  opts: ReturnType<typeof normalizeBatchOptions>,
): KindleCaptureSession {
  return {
    sessionId: randomUUID(),
    status: "running",
    phase: opts.startMode !== "none" ? "skipping_front" : "capturing",
    capturedPages: [],
    combinedText: "",
    currentPage: 0,
    totalPages: opts.pages,
    readAllPages: opts.readAllPages,
    skippedFrontPages: 0,
    cancelRequested: false,
    windowTitle: window.title || window.ownerName || `Window #${window.id}`,
    bookTitle: resolveCleanKindleBookTitle(window),
    startedAt: Date.now(),
  };
}

async function runCaptureSessionLoop(
  session: KindleCaptureSession,
  window: KindleWindowInfo,
  opts: ReturnType<typeof normalizeBatchOptions>,
  ctx: FmContext,
  deps?: KindleDeps,
  onProgress?: (session: KindleCaptureSession) => void,
): Promise<void> {
  const wait =
    deps?.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let hasStartedBody = opts.startMode === "none";
  let inFrontMatterSection = false;
  let hasPrevScanned = false;
  let prevScannedText = "";
  let prevScannedHash: string | undefined;

  const env = ctx.platform === "darwin" ? childEnv(ctx) : null;
  let previousFrontmostPid = 0;
  let turnToolArgvPrefix: string[] | null = null;
  if (
    ctx.platform === "darwin" &&
    !deps?.turnPage &&
    opts.activateWindow &&
    env
  ) {
    try {
      const swiftExe = Bun.which("swift") || "/usr/bin/swift";
      if (existsSync(swiftExe) || Bun.which("swift")) {
        const { binPath, scriptPath } = await getCompiledSwiftBinary(
          "kindle_turn",
          MACOS_PAGE_TURN_SWIFT,
          env,
        );
        turnToolArgvPrefix = binPath ? [binPath] : [swiftExe, scriptPath];
        const frontRes = await runCmd(
          [...turnToolArgvPrefix, "--frontmost-pid"],
          env,
          5000,
        );
        if (frontRes.code === 0) {
          const parsedPid = Number.parseInt(frontRes.stdout.trim(), 10);
          if (Number.isFinite(parsedPid) && parsedPid > 0) {
            previousFrontmostPid = parsedPid;
          }
        }
      }
    } catch {}
  }

  try {
    for (let i = 1; i <= opts.pages; i++) {
      if (session.cancelRequested) {
        session.status = "stopped";
        session.phase = "done";
        session.stoppedReason = "Stopped by user";
        return;
      }

      session.currentPage = i;
      let page = await captureAndOcrPage(window, i, opts, ctx, deps);
      updateSessionBookTitle(session, page);

      if (
        hasPrevScanned &&
        opts.stopOnDuplicate &&
        isScannedPageUnchanged(prevScannedText, prevScannedHash, page)
      ) {
        let stillDuplicate = true;
        for (let r = 1; r <= opts.maxDuplicateRetries; r++) {
          if (session.cancelRequested) {
            session.status = "stopped";
            session.phase = "done";
            session.stoppedReason = "Stopped by user";
            return;
          }
          session.phase = "retrying";
          if (r === 1) {
            await wait(Math.max(800, opts.delayMs));
          } else if (r === 2) {
            await sendPageTurnKey(window, opts.turnKey, true, ctx, deps);
            await wait(Math.max(opts.delayMs, 1100));
          } else {
            await sendPageTurnKey(window, opts.turnKey, true, ctx, deps, {
              forceFallback: true,
            });
            await wait(Math.max(opts.delayMs, 1300));
          }
          const retryPage = await captureAndOcrPage(window, i, opts, ctx, deps);
          updateSessionBookTitle(session, retryPage);
          if (
            !isScannedPageUnchanged(prevScannedText, prevScannedHash, retryPage)
          ) {
            page = retryPage;
            stillDuplicate = false;
            break;
          }
        }

        if (stillDuplicate) {
          page.duplicate = true;
          session.status = "completed";
          session.phase = "done";
          session.stoppedReason =
            opts.maxDuplicateRetries > 0
              ? "Reached end of book (duplicate page unchanged after retries)."
              : "Reached duplicate page (end of book or window focus unchanged).";
          onProgress?.(session);
          return;
        }
      }

      prevScannedText = page.text;
      prevScannedHash = page.imageHash;
      hasPrevScanned = true;

      const role = classifyKindlePageRole(page.text, {
        startMode: opts.startMode,
        stopAtBackMatter: opts.stopAtBackMatter,
        hasStartedBody,
        inFrontMatterSection,
        skippedFrontPages: session.skippedFrontPages,
      });

      if (role.action === "skip_front") {
        session.skippedFrontPages++;
        if (role.entersFrontSection !== undefined) {
          inFrontMatterSection = role.entersFrontSection;
        }
        session.phase = "skipping_front";
        onProgress?.(session);
      } else if (role.action === "stop_back") {
        hasStartedBody = true;
        inFrontMatterSection = false;
        session.phase = "done";
        if (role.matchedHeading) {
          session.stoppedHeading = role.matchedHeading;
        }
        if (role.keptText) {
          const trimmedPage: KindlePageResult = {
            ...page,
            text: role.keptText,
            wordCount: countWords(role.keptText),
            charCount: role.keptText.length,
          };
          session.capturedPages.push(trimmedPage);
          session.combinedText = stitchKindlePages(
            session.capturedPages.map((p) => p.text),
            { includePageMarkers: opts.includePageMarkers },
          );
        }
        session.status = "completed";
        session.stoppedReason = role.matchedHeading
          ? `Stopped at back matter ("${role.matchedHeading}").`
          : "Stopped at last chapter.";
        onProgress?.(session);
        return;
      } else {
        hasStartedBody = true;
        inFrontMatterSection = false;
        session.phase = "capturing";
        if (role.action === "start_here") {
          if (role.matchedHeading && !session.startHeading) {
            session.startHeading = role.matchedHeading;
          }
          page = {
            ...page,
            text: role.keptText,
            wordCount: countWords(role.keptText),
            charCount: role.keptText.length,
          };
        }
        session.capturedPages.push(page);
        session.combinedText = stitchKindlePages(
          session.capturedPages.map((p) => p.text),
          { includePageMarkers: opts.includePageMarkers },
        );
        onProgress?.(session);
      }

      if (i < opts.pages && !session.cancelRequested) {
        await sendPageTurnKey(
          window,
          opts.turnKey,
          opts.activateWindow,
          ctx,
          deps,
        );
        await wait(opts.delayMs);
      }
    }

    session.phase = "done";
    if (session.status === "running") {
      session.status = session.cancelRequested ? "stopped" : "completed";
      if (session.cancelRequested && !session.stoppedReason) {
        session.stoppedReason = "Stopped by user";
      } else if (
        session.capturedPages.length === 0 &&
        session.skippedFrontPages > 0 &&
        !session.stoppedReason
      ) {
        session.stoppedReason = `Skipped ${session.skippedFrontPages} front-matter page(s) without reaching start heading; raise Pages or choose Current Page.`;
      }
    }
  } finally {
    if (
      ctx.platform === "darwin" &&
      !deps?.turnPage &&
      opts.activateWindow &&
      env &&
      turnToolArgvPrefix &&
      previousFrontmostPid > 0 &&
      previousFrontmostPid !== window.pid
    ) {
      try {
        await runCmd(
          [
            ...turnToolArgvPrefix,
            "--restore-if-frontmost",
            String(window.pid),
            String(previousFrontmostPid),
          ],
          env,
          5000,
        );
      } catch {}
    }
  }
}

export async function captureKindlePagesBatch(
  ctx: FmContext,
  rawOpts: KindleBatchOptions | Record<string, unknown>,
  deps?: KindleDeps,
  onProgress?: (session: KindleCaptureSession) => void,
): Promise<KindleCaptureSession> {
  assertKindleSupportedPlatform(ctx);
  const opts = normalizeBatchOptions(rawOpts);
  const { window } = await resolveTargetKindleWindow(ctx, opts, deps);
  const session = createInitialSession(window, opts);
  pruneOldSessions();
  activeKindleSessions.set(session.sessionId, session);

  await runCaptureSessionLoop(session, window, opts, ctx, deps, onProgress);
  return session;
}

export async function startKindleCaptureSession(
  ctx: FmContext,
  rawOpts: KindleBatchOptions | Record<string, unknown>,
  deps?: KindleDeps,
): Promise<{
  sessionId: string;
  status: KindleCaptureSession["status"];
  totalPages: number;
  readAllPages: boolean;
  window: KindleWindowInfo;
  bookTitle: string;
}> {
  assertKindleSupportedPlatform(ctx);
  const opts = normalizeBatchOptions(rawOpts);
  const { window } = await resolveTargetKindleWindow(ctx, opts, deps);
  const session = createInitialSession(window, opts);
  pruneOldSessions();
  activeKindleSessions.set(session.sessionId, session);

  void (async () => {
    try {
      await runCaptureSessionLoop(session, window, opts, ctx, deps);
    } catch (err) {
      session.status = "error";
      session.phase = "done";
      session.error =
        err instanceof Error ? err.message : String(err || "Capture failed.");
    }
  })();

  return {
    sessionId: session.sessionId,
    status: session.status,
    totalPages: session.totalPages,
    readAllPages: session.readAllPages,
    window,
    bookTitle: session.bookTitle,
  };
}

export function getKindleSessionSnapshot(sessionId: string) {
  const session = activeKindleSessions.get(sessionId);
  if (!session) {
    throw new FmError(
      "NOT_FOUND",
      `Kindle capture session "${sessionId}" not found.`,
    );
  }
  const latestPage =
    session.capturedPages.length > 0
      ? session.capturedPages[session.capturedPages.length - 1]!
      : null;
  return {
    sessionId: session.sessionId,
    status: session.status,
    phase: session.phase,
    currentPage: session.currentPage,
    totalPages: session.totalPages,
    readAllPages: session.readAllPages,
    skippedFrontPages: session.skippedFrontPages,
    ...(session.startHeading ? { startHeading: session.startHeading } : {}),
    ...(session.stoppedHeading
      ? { stoppedHeading: session.stoppedHeading }
      : {}),
    capturedPagesCount: session.capturedPages.length,
    latestPage,
    combinedText: session.combinedText,
    wordCount: countWords(session.combinedText),
    stoppedReason: session.stoppedReason,
    error: session.error,
    windowTitle: session.windowTitle,
    bookTitle: session.bookTitle,
  };
}

export function stopKindleSession(sessionId: string) {
  const session = activeKindleSessions.get(sessionId);
  if (!session) {
    throw new FmError(
      "NOT_FOUND",
      `Kindle capture session "${sessionId}" not found.`,
    );
  }
  session.cancelRequested = true;
  if (session.status === "running" && session.capturedPages.length > 0) {
    session.stoppedReason = "Stopping after current page…";
  }
  return getKindleSessionSnapshot(sessionId);
}

export async function getKindleStatus(
  ctx: FmContext,
  deps?: KindleDeps,
): Promise<{
  supported: boolean;
  platform: string;
  visionAvailable: boolean;
  tesseractAvailable: boolean;
  screencaptureAvailable: boolean;
  osascriptAvailable: boolean;
  kindleWindowCount: number;
  windowsCount: number;
  permissionHint?: string;
}> {
  if (!isKindleSupportedPlatform(ctx.platform)) {
    return {
      supported: false,
      platform: ctx.platform,
      visionAvailable: false,
      tesseractAvailable: false,
      screencaptureAvailable: false,
      osascriptAvailable: false,
      kindleWindowCount: 0,
      windowsCount: 0,
      permissionHint: "Kindle Open-Book Reader is available on macOS only.",
    };
  }

  const visionAvailable =
    ctx.platform === "darwin" &&
    (Boolean(Bun.which("swift")) || existsSync("/usr/bin/swift"));
  const tesseractAvailable = Boolean(
    resolveTool(ctx, "tesseract") || Bun.which("tesseract"),
  );
  const screencaptureAvailable =
    ctx.platform === "darwin"
      ? Boolean(
          Bun.which("screencapture") || existsSync("/usr/sbin/screencapture"),
        )
      : ctx.platform === "win32" ||
        Boolean(Bun.which("import") || Bun.which("scrot"));
  const osascriptAvailable =
    ctx.platform === "darwin"
      ? Boolean(Bun.which("osascript") || existsSync("/usr/bin/osascript"))
      : ctx.platform === "win32" || Boolean(Bun.which("xdotool"));

  let windows: KindleWindowInfo[] = [];
  let permissionHint: string | undefined;
  try {
    const listed = await listKindleWindows(ctx, deps);
    windows = listed.windows;
    permissionHint = listed.permissionHint;
  } catch {}

  return {
    supported: isKindleSupportedPlatform(ctx.platform),
    platform: ctx.platform,
    visionAvailable,
    tesseractAvailable,
    screencaptureAvailable,
    osascriptAvailable,
    kindleWindowCount: windows.filter((w) => w.isKindle).length,
    windowsCount: windows.length,
    ...(permissionHint ? { permissionHint } : {}),
  };
}

/**
 * Builds File Manager RPC operation handlers (`kindle/*`), accepting optional
 * dependency overrides for deterministic unit and integration testing.
 */
export function createKindleOps(deps?: KindleDeps): Record<string, FmHandler> {
  return {
    "kindle/status": (ctx) => getKindleStatus(ctx, deps),
    "kindle/windows": (ctx) => listKindleWindows(ctx, deps),
    "kindle/capture-page": (ctx, b) =>
      captureSingleKindlePage(ctx, b ?? {}, deps),
    "kindle/start-capture": (ctx, b) =>
      startKindleCaptureSession(ctx, b ?? {}, deps),
    "kindle/session": async (_ctx, b) => {
      const id = typeof b?.sessionId === "string" ? b.sessionId.trim() : "";
      if (!id) throw new FmError("BAD_REQUEST", "sessionId is required.");
      return getKindleSessionSnapshot(id);
    },
    "kindle/stop-capture": async (_ctx, b) => {
      const id = typeof b?.sessionId === "string" ? b.sessionId.trim() : "";
      if (!id) throw new FmError("BAD_REQUEST", "sessionId is required.");
      return stopKindleSession(id);
    },
  };
}

/** Default File Manager HTTP API handlers for `kindle/*` operations. */
export const KINDLE_OPS: Record<string, FmHandler> = createKindleOps();
