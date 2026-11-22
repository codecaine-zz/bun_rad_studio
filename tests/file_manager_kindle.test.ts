import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTtsCli } from "../cli_apps/tts_cli";
import { runFileManagerCli } from "../src/features/filemanager/fmCli";
import { createContext } from "../src/features/filemanager/fmCore";
import { bufferSource } from "../src/features/filemanager/fmInfoCommon";
import {
  areKindlePagesDuplicate,
  captureKindlePagesBatch,
  classifyKindlePageRole,
  cleanKindlePageText,
  createKindleOps,
  extractKindleHeaderBookTitle,
  isKindleEndOfBookScreen,
  isKindleSupportedPlatform,
  isTableOfContentsPage,
  KINDLE_OPS,
  listKindleWindows,
  orderKindleOcrObservations,
  resolveCleanKindleBookTitle,
  scoreKindleWindow,
  sendPageTurnKey,
  stitchKindlePages,
  trimBookFrontAndBackFluff,
  type KindleDeps,
  type KindleOcrObservation,
  type KindleWindowInfo,
} from "../src/features/filemanager/fmKindle";
import { FmError } from "../src/features/filemanager/fmPaths";
import {
  createWavHeader,
  extractPlainTextFromFile,
  PHONON_OPS,
} from "../src/features/filemanager/fmPhonon";
import {
  decompressPalmDocLz77,
  inspectKindleMobiRich,
  isNonProseKindlePreview,
} from "../src/features/filemanager/fmPreview";
import {
  API_OPERATIONS,
  startFileManagerServer,
} from "../src/features/filemanager/fmServer";
import { rmDir } from "./helpers/rm";

const root = mkdtempSync(join(tmpdir(), "fm-kindle-test-"));
const home = join(root, "home");
const dataDir = join(root, "data");
const toolDir = join(root, "tools");
const outDir = join(root, "out");

function makeSampleWavBuffer(
  durationSec = 0.4,
  sampleRate = 24000,
  freqHz = 210,
): Buffer {
  const numSamples = Math.max(240, Math.round(sampleRate * durationSec));
  const pcm = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.sin((Math.PI * i) / numSamples);
    const val = Math.sin(2 * Math.PI * freqHz * t) * 0.55 * env;
    pcm.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(val * 18000))),
      i * 2,
    );
  }
  return Buffer.concat([createWavHeader(pcm.length, sampleRate, 1, 16), pcm]);
}

const SAMPLE_WINDOWS: KindleWindowInfo[] = [
  {
    id: 401,
    ownerName: "Safari",
    title: "Kindle Cloud Reader — Designing Data-Intensive Applications",
    pid: 201,
    bounds: { x: 80, y: 80, width: 1200, height: 850 },
    isKindle: true,
    score: 90,
  },
  {
    id: 502,
    ownerName: "Amazon Kindle",
    title: "The Pragmatic Programmer",
    pid: 302,
    bounds: { x: 100, y: 60, width: 1280, height: 900 },
    isKindle: true,
    score: 131,
  },
  {
    id: 603,
    ownerName: "Notes",
    title: "Scratchpad",
    pid: 403,
    bounds: { x: 200, y: 200, width: 640, height: 480 },
    isKindle: false,
    score: 11,
  },
];

function createMockKindleDeps(
  pages: string[],
  opts?: { onTurn?: (key: string) => void },
): { deps: KindleDeps; turnCount: () => number } {
  let cursor = 0;
  let turns = 0;
  const deps: KindleDeps = {
    listWindows: async () => ({
      windows: [...SAMPLE_WINDOWS].sort((a, b) => b.score - a.score),
    }),
    captureWindow: async (_win, outPng) => {
      writeFileSync(outPng, Buffer.from("89504e470d0a1a0a", "hex"));
    },
    ocrImage: async () => {
      const idx = Math.min(cursor, Math.max(0, pages.length - 1));
      return { text: pages[idx] ?? "", engine: "vision" };
    },
    turnPage: async (_win, turnKey) => {
      turns++;
      opts?.onTurn?.(turnKey);
      if (cursor < pages.length - 1) cursor++;
    },
    sleep: async () => {},
  };
  return { deps, turnCount: () => turns };
}

beforeAll(() => {
  process.env.TTS_CLI_NO_AUDIO = "1";
  mkdirSync(home, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(toolDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const sampleWavHex = makeSampleWavBuffer().toString("hex");
  const ollamaJs = join(toolDir, "ollama_mock.js");
  writeFileSync(
    ollamaJs,
    `#!/usr/bin/env bun
const args = process.argv.slice(2);
if (args[0] === "--version" || args[0] === "-v") {
  console.log("ollama version is 0.40.16");
  process.exit(0);
}
if (args[0] === "show") {
  console.log("  Model\\n    architecture        gradium_phonon_tts\\n\\n  Voices\\n    Zoey          4096 tokens\\n");
  process.exit(0);
}
if (args[0] === "list" || args[0] === "ls") {
  console.log("NAME              ID           SIZE    MODIFIED");
  console.log("phonon:latest     abc123456    180 MB  2 days ago");
  process.exit(0);
}
if (args[0] === "run") {
  const wavIdx = args.indexOf("--wav");
  const outIdx = args.indexOf("--output");
  const target = wavIdx >= 0 ? args[wavIdx + 1] : outIdx >= 0 ? args[outIdx + 1] : "";
  if (target) {
    require("fs").writeFileSync(target, Buffer.from("${sampleWavHex}", "hex"));
    process.exit(0);
  }
  console.log("OK");
  process.exit(0);
}
process.exit(0);
`,
    "utf8",
  );
  if (process.platform === "win32") {
    writeFileSync(
      join(toolDir, "ollama.cmd"),
      `@echo off\nbun "${ollamaJs}" %*\n`,
      "utf8",
    );
  } else {
    const sh = join(toolDir, "ollama");
    writeFileSync(sh, `#!/bin/sh\nexec bun "${ollamaJs}" "$@"\n`, "utf8");
    chmodSync(sh, 0o755);
  }
});

afterAll(() => rmDir(root));

describe("Kindle pure text cleaning, stitching, deduplication & window scoring", () => {
  test("cleanKindlePageText strips Kindle UI chrome, normalizes ligatures, and unwraps paragraphs", () => {
    const raw = [
      "Amazon Kindle",
      "The Pragmatic Programmer",
      "12",
      "CHAPTER 1",
      "Software craftsmanship begins with a ﬁrst-class commit-",
      "ment to clarity and steady practice.",
      "",
      "Every craftsman chooses tools care-",
      "ﬂuently and tests assumptions early.",
      "Location 142 of 3810",
      "8 mins left in chapter",
      "42%",
    ].join("\n");

    const cleaned = cleanKindlePageText(raw);
    expect(cleaned).not.toContain("Amazon Kindle");
    expect(cleaned).not.toContain("Location 142");
    expect(cleaned).not.toContain("8 mins left in chapter");
    expect(cleaned).not.toContain("42%");
    expect(cleaned).not.toMatch(/^\s*12\s*$/m);
    expect(cleaned).toContain("CHAPTER 1");
    expect(cleaned).toContain(
      "first-class commitment to clarity and steady practice.",
    );
    expect(cleaned).toContain("carefluently and tests assumptions early.");
  });

  test("cleanKindlePageText handles Page X of Y and Learning Reading Speed chrome", () => {
    const raw = [
      "Aa  Bookmark  Sync",
      "The system stays simple when each module owns one job.",
      "Page 14 of 300 • 5%",
      "Learning Reading Speed…",
    ].join("\n");

    const cleaned = cleanKindlePageText(raw);
    expect(cleaned).toBe(
      "The system stays simple when each module owns one job.",
    );
  });

  test("stitchKindlePages joins mid-sentence page breaks and preserves paragraph boundaries", () => {
    const p1 = "Good architecture defers irreversible decisions until";
    const p2 = "the team understands the real constraints.";
    const p3 = "Next chapter starts a fresh idea.";

    const stitched = stitchKindlePages([p1, p2, p3]);
    expect(stitched).toBe(
      "Good architecture defers irreversible decisions until the team understands the real constraints.\n\nNext chapter starts a fresh idea.",
    );

    const withMarkers = stitchKindlePages(["Page one.", "Page two."], {
      includePageMarkers: true,
    });
    expect(withMarkers).toContain("--- Page 1 ---");
    expect(withMarkers).toContain("--- Page 2 ---");
  });

  test("areKindlePagesDuplicate detects exact matches, minor OCR jitter, and distinct pages", () => {
    const pageA =
      "Small, sharp tools compose far better than monolithic frameworks when requirements evolve.";
    const pageAJitter =
      "Small, sharp tools compose far better than monolithic frameworks when requirements evolve!";
    const pageB =
      "Concurrency bugs disappear faster when shared mutable state is eliminated at the boundary.";

    expect(areKindlePagesDuplicate(pageA, pageA)).toBe(true);
    expect(areKindlePagesDuplicate(pageA, pageAJitter)).toBe(true);
    expect(areKindlePagesDuplicate(pageA, pageB)).toBe(false);
    expect(areKindlePagesDuplicate("", "")).toBe(false);
  });

  test("scoreKindleWindow prioritizes Amazon Kindle > Kindle Cloud Reader > generic, and filters tiny windows", () => {
    const kindleDesktop = scoreKindleWindow("Amazon Kindle", "Clean Code", {
      width: 1200,
      height: 900,
    });
    const cloudReader = scoreKindleWindow(
      "Google Chrome",
      "Kindle Cloud Reader — Clean Code",
      { width: 1200, height: 900 },
    );
    const appleBooks = scoreKindleWindow("Books", "EPUB Reader", {
      width: 1000,
      height: 800,
    });
    const generic = scoreKindleWindow("Finder", "Downloads", {
      width: 1000,
      height: 800,
    });
    const tinyOverlay = scoreKindleWindow("Amazon Kindle", "Tooltip", {
      width: 150,
      height: 40,
    });

    expect(kindleDesktop.isKindle).toBe(true);
    expect(cloudReader.isKindle).toBe(true);
    expect(appleBooks.isKindle).toBe(false);
    expect(generic.isKindle).toBe(false);
    expect(tinyOverlay).toEqual({ isKindle: false, score: 0 });
    expect(kindleDesktop.score).toBeGreaterThan(cloudReader.score);
    expect(cloudReader.score).toBeGreaterThan(appleBooks.score);
    expect(appleBooks.score).toBeGreaterThan(generic.score);
  });

  test("scoreKindleWindow & listKindleWindows exclude self/File Manager windows and 1728x33 bars while keeping onScreen:false Kindle windows", async () => {
    const fullScreenKindle = scoreKindleWindow(
      "Kindle",
      "Kindle",
      { width: 1728, height: 1003 },
      { pid: 999991, onScreen: false },
    );
    expect(fullScreenKindle.isKindle).toBe(true);
    expect(fullScreenKindle.score).toBeGreaterThanOrEqual(100);

    const toolbarBar = scoreKindleWindow(
      "Kindle",
      "",
      { width: 1728, height: 33 },
      { pid: 999991, onScreen: false },
    );
    expect(toolbarBar).toEqual({ isKindle: false, score: 0 });

    const selfPid = scoreKindleWindow(
      "Amazon Kindle",
      "Clean Code",
      { width: 1200, height: 900 },
      { pid: process.pid, onScreen: true },
    );
    expect(selfPid).toEqual({ isKindle: false, score: 0 });

    const fmWindow = scoreKindleWindow(
      "Codecaine File Manager",
      "Kindle Reader Studio",
      { width: 1400, height: 900 },
      { pid: 88888, onScreen: true },
    );
    expect(fmWindow).toEqual({ isKindle: false, score: 0 });

    const fmTitle = scoreKindleWindow(
      "Google Chrome",
      "bun_rad_studio — file-manager-studio",
      { width: 1400, height: 900 },
      { pid: 88889, onScreen: true },
    );
    expect(fmTitle).toEqual({ isKindle: false, score: 0 });

    const ctx = createContext({
      platform: "darwin",
      home,
      dataDir,
      toolDirs: [toolDir],
    });
    const listed = await listKindleWindows(ctx, {
      listWindows: async () => ({
        windows: [
          {
            id: 101,
            ownerName: "Codecaine File Manager",
            title: "Kindle Open-Book Reader",
            pid: 77777,
            bounds: { x: 0, y: 0, width: 1400, height: 900 },
            isKindle: false,
            score: 0,
            onScreen: true,
          },
          {
            id: 102,
            ownerName: "Bun",
            title: "Self Process",
            pid: process.pid,
            bounds: { x: 0, y: 0, width: 1400, height: 900 },
            isKindle: false,
            score: 0,
            onScreen: true,
          },
          {
            id: 103,
            ownerName: "Kindle",
            title: "",
            pid: 64951,
            bounds: { x: 0, y: 0, width: 1728, height: 33 },
            isKindle: false,
            score: 0,
            onScreen: false,
          },
          {
            id: 104,
            ownerName: "Kindle",
            title: "Kindle",
            pid: 64951,
            bounds: { x: 0, y: 33, width: 1728, height: 1003 },
            isKindle: true,
            score: 137,
            onScreen: false,
          },
        ],
      }),
    });

    expect(listed.windows.map((w) => w.id)).toEqual([104]);
    expect(listed.windows[0]?.onScreen).toBe(false);
    expect(listed.windows[0]?.isKindle).toBe(true);

    const prevScreenshotMode = process.env.SCREENSHOT_MODE;
    process.env.SCREENSHOT_MODE = "1";
    try {
      const demo = await listKindleWindows(ctx);
      expect(demo.windows.length).toBe(2);
      expect(demo.windows.every((w) => w.onScreen === true)).toBe(true);
    } finally {
      if (prevScreenshotMode === undefined) {
        delete process.env.SCREENSHOT_MODE;
      } else {
        process.env.SCREENSHOT_MODE = prevScreenshotMode;
      }
    }
  });

  test("extractKindleHeaderBookTitle extracts centered title and rejects Kindle/Aa/42% chrome", () => {
    const observations: KindleOcrObservation[] = [
      { text: "Kindle", midY: 0.985, minX: 0.45, maxX: 0.55 },
      { text: "Library", midY: 0.945, minX: 0.03, maxX: 0.11 },
      { text: "Designing Data-Intensive", midY: 0.945, minX: 0.3, maxX: 0.52 },
      { text: "Applications", midY: 0.945, minX: 0.53, maxX: 0.7 },
      { text: "Aa", midY: 0.945, minX: 0.82, maxX: 0.86 },
      { text: "Search Book", midY: 0.945, minX: 0.88, maxX: 0.97 },
      { text: "42%", midY: 0.925, minX: 0.91, maxX: 0.96 },
      { text: "Page 14 of 300", midY: 0.925, minX: 0.05, maxX: 0.18 },
      {
        text: "Body paragraph line outside header.",
        midY: 0.8,
        minX: 0.1,
        maxX: 0.9,
      },
    ];
    expect(extractKindleHeaderBookTitle(observations, 8)).toBe(
      "Designing Data-Intensive Applications",
    );

    const chromeOnly: KindleOcrObservation[] = [
      { text: "Amazon Kindle", midY: 0.98, minX: 0.4, maxX: 0.6 },
      { text: "Home", midY: 0.94, minX: 0.04, maxX: 0.1 },
      { text: "Back", midY: 0.94, minX: 0.11, maxX: 0.17 },
      { text: "Contents", midY: 0.94, minX: 0.22, maxX: 0.32 },
      { text: "Go", midY: 0.94, minX: 0.35, maxX: 0.38 },
      { text: "To", midY: 0.94, minX: 0.39, maxX: 0.42 },
      { text: "Bookmark", midY: 0.94, minX: 0.7, maxX: 0.8 },
      { text: "Sync", midY: 0.94, minX: 0.81, maxX: 0.86 },
      { text: "Notebook", midY: 0.94, minX: 0.87, maxX: 0.95 },
      { text: "Aa", midY: 0.93, minX: 0.48, maxX: 0.52 },
      { text: "42%", midY: 0.93, minX: 0.54, maxX: 0.59 },
      { text: "Location 120", midY: 0.93, minX: 0.61, maxX: 0.72 },
      { text: "14", midY: 0.93, minX: 0.2, maxX: 0.23 },
    ];
    expect(extractKindleHeaderBookTitle(chromeOnly, 8)).toBe("");
  });

  test("orderKindleOcrObservations reads 2-column spreads left-column completely before right-column, and 1-column top-to-bottom", () => {
    const twoColObs: KindleOcrObservation[] = [
      { text: "Kindle", midY: 0.985, minX: 0.46, maxX: 0.54 },
      { text: "Clean Architecture", midY: 0.945, minX: 0.38, maxX: 0.62 },
      { text: "Aa", midY: 0.945, minX: 0.85, maxX: 0.88 },
      // Interleaved coordinates in Vision output: top row has left & right, middle row, bottom row
      { text: "Right column first line", midY: 0.84, minX: 0.54, maxX: 0.9 },
      { text: "Left column first line", midY: 0.84, minX: 0.08, maxX: 0.44 },
      { text: "Right column second line", midY: 0.78, minX: 0.54, maxX: 0.9 },
      { text: "Left column second line", midY: 0.78, minX: 0.08, maxX: 0.44 },
      { text: "Right column third line.", midY: 0.72, minX: 0.54, maxX: 0.9 },
      { text: "Left column third line", midY: 0.72, minX: 0.08, maxX: 0.44 },
      { text: "Right column fourth line.", midY: 0.66, minX: 0.54, maxX: 0.9 },
      {
        text: "Left column fourth line ends mid",
        midY: 0.66,
        minX: 0.08,
        maxX: 0.44,
      },
      { text: "42%", midY: 0.03, minX: 0.9, maxX: 0.95 },
    ];

    const twoCol = orderKindleOcrObservations(twoColObs, {
      cropTopPct: 8,
      cropBottomPct: 8,
      cropLeftPct: 3,
      cropRightPct: 3,
    });
    expect(twoCol.twoColumn).toBe(true);
    expect(twoCol.bookTitle).toBe("Clean Architecture");
    expect(twoCol.leftRaw).toBe(
      [
        "Left column first line",
        "Left column second line",
        "Left column third line",
        "Left column fourth line ends mid",
      ].join("\n"),
    );
    expect(twoCol.rightRaw).toBe(
      [
        "Right column first line",
        "Right column second line",
        "Right column third line.",
        "Right column fourth line.",
      ].join("\n"),
    );
    expect(twoCol.rawText.indexOf("Left column fourth line")).toBeLessThan(
      twoCol.rawText.indexOf("Right column first line"),
    );

    const oneColObs: KindleOcrObservation[] = [
      { text: "The Pragmatic Programmer", midY: 0.95, minX: 0.35, maxX: 0.65 },
      { text: "First full-width line", midY: 0.85, minX: 0.1, maxX: 0.88 },
      { text: "Second", midY: 0.79, minX: 0.1, maxX: 0.25 },
      { text: "full-width line", midY: 0.79, minX: 0.27, maxX: 0.85 },
      { text: "Third full-width line.", midY: 0.73, minX: 0.1, maxX: 0.86 },
      { text: "Fourth full-width line.", midY: 0.67, minX: 0.1, maxX: 0.86 },
      { text: "Fifth full-width line.", midY: 0.61, minX: 0.1, maxX: 0.86 },
      { text: "Sixth full-width line.", midY: 0.55, minX: 0.1, maxX: 0.86 },
    ];

    const oneCol = orderKindleOcrObservations(oneColObs, {
      cropTopPct: 8,
      cropBottomPct: 8,
      cropLeftPct: 3,
      cropRightPct: 3,
    });
    expect(oneCol.twoColumn).toBe(false);
    expect(oneCol.bookTitle).toBe("The Pragmatic Programmer");
    expect(oneCol.rawText).toBe(
      [
        "First full-width line",
        "Second full-width line",
        "Third full-width line.",
        "Fourth full-width line.",
        "Fifth full-width line.",
        "Sixth full-width line.",
      ].join("\n"),
    );
  });

  test("resolveCleanKindleBookTitle resolves header book title when window.title is generic Kindle", () => {
    expect(
      resolveCleanKindleBookTitle(
        { ownerName: "Kindle", title: "Kindle" },
        "Designing Data-Intensive Applications",
      ),
    ).toBe("Designing Data-Intensive Applications");

    expect(
      resolveCleanKindleBookTitle(
        { ownerName: "Amazon Kindle", title: "Amazon Kindle" },
        "Kindle — Clean Code",
      ),
    ).toBe("Clean Code");

    expect(
      resolveCleanKindleBookTitle(
        {
          ownerName: "Safari",
          title: "Kindle Cloud Reader — The Pragmatic Programmer",
        },
        "Ignored Header",
      ),
    ).toBe("The Pragmatic Programmer");

    expect(
      resolveCleanKindleBookTitle(
        {
          ownerName: "Codecaine File Manager",
          title: "Codecaine File Manager",
        },
        "",
      ),
    ).toBe("Kindle Book");
  });
});

describe("KINDLE_OPS handlers, session lifecycle & server registration", () => {
  test("API_OPERATIONS registers all kindle/* endpoints", () => {
    for (const op of [
      "kindle/status",
      "kindle/windows",
      "kindle/capture-page",
      "kindle/start-capture",
      "kindle/session",
      "kindle/stop-capture",
    ]) {
      expect(API_OPERATIONS).toContain(op);
      expect(typeof KINDLE_OPS[op]).toBe("function");
    }
  });

  test("kindle/status, kindle/windows, and kindle/capture-page work with mocked dependencies", async () => {
    const ctx = createContext({
      platform: "darwin",
      home,
      dataDir,
      toolDirs: [toolDir],
    });
    const { deps } = createMockKindleDeps([
      "Amazon Kindle\nFirst open page paragraph.\nLocation 10 of 500\n2%",
    ]);
    const ops = createKindleOps(deps);

    const status = (await ops["kindle/status"]!(ctx, {})) as any;
    expect(status.supported).toBe(true);
    expect(status.kindleWindowCount).toBe(2);
    expect(status.windowsCount).toBe(3);

    const listed = (await ops["kindle/windows"]!(ctx, {})) as any;
    expect(listed.windows[0].ownerName).toBe("Amazon Kindle");
    expect(listed.windows[0].id).toBe(502);

    const captured = (await ops["kindle/capture-page"]!(ctx, {})) as any;
    expect(captured.window.id).toBe(502);
    expect(captured.page.engine).toBe("vision");
    expect(captured.page.text).toBe("First open page paragraph.");
    expect(captured.page.wordCount).toBe(4);
  });

  test("kindle/start-capture turns pages, detects end-of-book duplicate, and supports kindle/stop-capture", async () => {
    const ctx = createContext({
      platform: "darwin",
      home,
      dataDir,
      toolDirs: [toolDir],
    });
    const turnKeys: string[] = [];
    const { deps, turnCount } = createMockKindleDeps(
      [
        "Page one ends mid",
        "sentence and continues cleanly.\nLocation 20 of 500",
        "sentence and continues cleanly.\nLocation 20 of 500",
      ],
      { onTurn: (k) => turnKeys.push(k) },
    );
    const ops = createKindleOps(deps);

    const started = (await ops["kindle/start-capture"]!(ctx, {
      pages: 5,
      turnKey: "space",
      delayMs: 250,
      stopOnDuplicate: true,
      maxDuplicateRetries: 0,
    })) as any;
    expect(started.sessionId).toBeTruthy();
    expect(started.totalPages).toBe(5);

    let snap: any;
    for (let i = 0; i < 40; i++) {
      snap = await ops["kindle/session"]!(ctx, {
        sessionId: started.sessionId,
      });
      if (snap.status !== "running") break;
      await new Promise((r) => setTimeout(r, 15));
    }

    expect(snap.status).toBe("completed");
    expect(snap.capturedPagesCount).toBe(2);
    expect(snap.stoppedReason).toContain("duplicate");
    expect(snap.combinedText).toBe(
      "Page one ends mid sentence and continues cleanly.",
    );
    expect(turnKeys).toEqual(["space", "space"]);
    expect(turnCount()).toBe(2);

    // Explicit stop-capture flow
    const slowPages = [
      "Alpha page.",
      "Beta page.",
      "Gamma page.",
      "Delta page.",
    ];
    let gateResolve!: () => void;
    const gate = new Promise<void>((r) => {
      gateResolve = r;
    });
    const slowMock = createMockKindleDeps(slowPages);
    const slowDeps: KindleDeps = {
      ...slowMock.deps,
      sleep: async () => {
        await gate;
      },
    };
    const slowOps = createKindleOps(slowDeps);
    const s2 = (await slowOps["kindle/start-capture"]!(ctx, {
      pages: 4,
      delayMs: 250,
    })) as any;
    await new Promise((r) => setTimeout(r, 20));
    const stoppedSnap = (await slowOps["kindle/stop-capture"]!(ctx, {
      sessionId: s2.sessionId,
    })) as any;
    expect(stoppedSnap.capturedPagesCount).toBeGreaterThanOrEqual(1);
    gateResolve();
    for (let i = 0; i < 30; i++) {
      const fin = (await slowOps["kindle/session"]!(ctx, {
        sessionId: s2.sessionId,
      })) as any;
      if (fin.status !== "running") {
        expect(fin.status).toBe("stopped");
        break;
      }
      await new Promise((r) => setTimeout(r, 15));
    }
  });

  test("live File Manager server validates kindle/session requests", async () => {
    const srv = startFileManagerServer({
      port: 0,
      token: "kindle-test-token",
      context: { home, dataDir, launch: async () => {} },
    });
    try {
      const base = `http://127.0.0.1:${srv.port}`;
      const missingRes = await fetch(`${base}/api/kindle/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fm-token": "kindle-test-token",
        },
        body: JSON.stringify({}),
      });
      expect(missingRes.status).toBe(400);

      const unknownRes = await fetch(`${base}/api/kindle/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fm-token": "kindle-test-token",
        },
        body: JSON.stringify({ sessionId: "non-existent" }),
      });
      expect(unknownRes.status).toBe(400);
      const body = (await unknownRes.json()) as any;
      expect(body.error.code).toBe("NOT_FOUND");
    } finally {
      srv.stop(true);
    }
  });
});

describe("CLI integration: tts_cli `kindle` and fmCli", () => {
  test("runTtsCli kindle --help and fmCli --help document kindle subcommand", async () => {
    const helpLines: string[] = [];
    const code = await runTtsCli(["kindle", "--help"], {
      stdout: (l) => helpLines.push(l),
      contextOptions: { platform: "darwin" },
    });
    expect(code).toBe(0);
    expect(helpLines.join("\n")).toContain("kindle [options]");
    expect(helpLines.join("\n")).toContain("--list-windows");

    const fmLines: string[] = [];
    const fmCode = await runFileManagerCli(["--help"], {
      stdout: (l) => fmLines.push(l),
      contextOptions: { platform: "darwin" },
    });
    expect(fmCode).toBe(0);
    expect(fmLines.join("\n")).toContain("kindle [args...]");
  });

  test("runTtsCli kindle --list-windows --json lists detected Kindle windows", async () => {
    const { deps } = createMockKindleDeps(["Sample text"]);
    const lines: string[] = [];
    const code = await runTtsCli(["kindle", "--list-windows", "--json"], {
      stdout: (l) => lines.push(l),
      contextOptions: {
        platform: "darwin",
        home,
        dataDir,
        toolDirs: [toolDir],
      },
      kindleDeps: deps,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.ok).toBe(true);
    expect(parsed.kindleCount).toBe(2);
    expect(parsed.windows[0].ownerName).toBe("Amazon Kindle");
  });

  test("runTtsCli kindle captures multi-page text and exports WAV audio", async () => {
    const { deps } = createMockKindleDeps([
      "Amazon Kindle\nOpening sentence from Kindle page one.\nLocation 10 of 200",
      "Amazon Kindle\nSecond page completes the thought.\nLocation 20 of 200",
    ]);
    const cleanLines: string[] = [];
    const cleanCode = await runTtsCli(
      ["kindle", "--pages", "2", "--clean-only", "--json"],
      {
        stdout: (l) => cleanLines.push(l),
        contextOptions: {
          platform: "darwin",
          home,
          dataDir,
          toolDirs: [toolDir],
        },
        kindleDeps: deps,
      },
    );
    expect(cleanCode).toBe(0);
    const cleanJson = JSON.parse(cleanLines.join("\n"));
    expect(cleanJson.ok).toBe(true);
    expect(cleanJson.text).toContain("Opening sentence from Kindle page one.");
    expect(cleanJson.text).toContain("Second page completes the thought.");

    const wavOut = join(outDir, "kindle_audio.wav");
    const exportLines: string[] = [];
    const { deps: deps2 } = createMockKindleDeps([
      "Page one audio synthesis sample.",
      "Page two audio synthesis sample.",
    ]);
    const exportCode = await runTtsCli(
      ["kindle", "--pages", "2", "-f", "wav", "-o", wavOut, "--json"],
      {
        stdout: (l) => exportLines.push(l),
        cwd: outDir,
        contextOptions: {
          platform: "darwin",
          home,
          dataDir,
          toolDirs: [toolDir],
        },
        kindleDeps: deps2,
      },
    );
    expect(exportCode).toBe(0);
    const exportJson = JSON.parse(exportLines.join("\n"));
    expect(exportJson.ok).toBe(true);
    expect(exportJson.outputPath).toBe(wavOut);
    expect(existsSync(wavOut)).toBe(true);
    const hdr = readFileSync(wavOut).subarray(0, 4).toString("ascii");
    expect(hdr).toBe("RIFF");
  });

  test("kindle/capture-page stitches 2-column spreads and tts_cli names output from detected bookTitle", async () => {
    const ctx = createContext({
      platform: "darwin",
      home,
      dataDir,
      toolDirs: [toolDir],
    });
    const genericTitleWindow: KindleWindowInfo = {
      id: 777,
      ownerName: "Kindle",
      title: "Kindle",
      pid: 64951,
      bounds: { x: 0, y: 33, width: 1728, height: 1003 },
      isKindle: true,
      score: 137,
      onScreen: false,
    };
    const twoColDeps: KindleDeps = {
      listWindows: async () => ({ windows: [genericTitleWindow] }),
      captureWindow: async (_win, outPng) => {
        writeFileSync(outPng, Buffer.from("89504e470d0a1a0a", "hex"));
      },
      ocrImage: async () => ({
        text: "Left column ends mid\n\nsentence on right column.",
        leftRaw: "Left column ends mid",
        rightRaw: "sentence on right column.",
        engine: "vision",
        bookTitle: "Deep Work",
        twoColumn: true,
      }),
      turnPage: async () => {},
      sleep: async () => {},
    };

    const ops = createKindleOps(twoColDeps);
    const captured = (await ops["kindle/capture-page"]!(ctx, {})) as any;
    expect(captured.bookTitle).toBe("Deep Work");
    expect(captured.page.bookTitle).toBe("Deep Work");
    expect(captured.page.twoColumn).toBe(true);
    expect(captured.page.text).toBe(
      "Left column ends mid sentence on right column.",
    );

    const dirOut = join(outDir, "auto_named");
    mkdirSync(dirOut, { recursive: true });
    const cliLines: string[] = [];
    const cliCode = await runTtsCli(
      ["kindle", "--pages", "1", "-f", "wav", "-o", `${dirOut}/`, "--json"],
      {
        stdout: (l) => cliLines.push(l),
        cwd: dirOut,
        contextOptions: {
          platform: "darwin",
          home,
          dataDir,
          toolDirs: [toolDir],
        },
        kindleDeps: twoColDeps,
      },
    );
    expect(cliCode).toBe(0);
    const cliJson = JSON.parse(cliLines.join("\n"));
    expect(cliJson.ok).toBe(true);
    expect(cliJson.outputPath).toBe(join(dirOut, "Deep Work.wav"));
    expect(existsSync(cliJson.outputPath)).toBe(true);

    // Batch capture session & batch CLI output naming from detected bookTitle
    let batchPageIdx = 0;
    const batchBookPages = [
      {
        text: "First chapter opens clearly.",
        leftRaw: "First chapter opens",
        rightRaw: "clearly.",
        bookTitle: "Atomic Habits",
        twoColumn: true,
      },
      {
        text: "Second page builds momentum.",
        leftRaw: "Second page builds",
        rightRaw: "momentum.",
        bookTitle: "Atomic Habits",
        twoColumn: true,
      },
    ];
    const batchDeps: KindleDeps = {
      listWindows: async () => ({ windows: [genericTitleWindow] }),
      captureWindow: async (_win, outPng) => {
        writeFileSync(outPng, Buffer.from("89504e470d0a1a0a", "hex"));
      },
      ocrImage: async () => {
        const entry =
          batchBookPages[Math.min(batchPageIdx, batchBookPages.length - 1)]!;
        return { ...entry, engine: "vision" as const };
      },
      turnPage: async () => {
        batchPageIdx++;
      },
      sleep: async () => {},
    };
    const batchOps = createKindleOps(batchDeps);
    const startedBatch = (await batchOps["kindle/start-capture"]!(ctx, {
      pages: 2,
      delayMs: 250,
    })) as any;
    let batchSnap: any;
    for (let i = 0; i < 40; i++) {
      batchSnap = await batchOps["kindle/session"]!(ctx, {
        sessionId: startedBatch.sessionId,
      });
      if (batchSnap.status !== "running") break;
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(batchSnap.status).toBe("completed");
    expect(batchSnap.bookTitle).toBe("Atomic Habits");
    expect(batchSnap.latestPage?.twoColumn).toBe(true);

    batchPageIdx = 0;
    const batchDirOut = join(outDir, "auto_named_batch");
    mkdirSync(batchDirOut, { recursive: true });
    const batchCliLines: string[] = [];
    const batchCliCode = await runTtsCli(
      [
        "kindle",
        "--pages",
        "2",
        "-f",
        "wav",
        "-o",
        `${batchDirOut}/`,
        "--json",
      ],
      {
        stdout: (l) => batchCliLines.push(l),
        cwd: batchDirOut,
        contextOptions: {
          platform: "darwin",
          home,
          dataDir,
          toolDirs: [toolDir],
        },
        kindleDeps: batchDeps,
      },
    );
    expect(batchCliCode).toBe(0);
    const batchCliJson = JSON.parse(batchCliLines.join("\n"));
    expect(batchCliJson.ok).toBe(true);
    expect(batchCliJson.outputPath).toBe(
      join(batchDirOut, "Atomic Habits.wav"),
    );
    expect(existsSync(batchCliJson.outputPath)).toBe(true);

    // Also verify sendPageTurnKey honors deps.turnPage & activateWindow cleanly
    let turned = false;
    await sendPageTurnKey(genericTitleWindow, "right", true, ctx, {
      turnPage: async (_w, key, activate) => {
        expect(key).toBe("right");
        expect(activate).toBe(true);
        turned = true;
      },
    });
    expect(turned).toBe(true);
  });

  test("runTtsCli kindle -f mp4 exports Read-Along .mp4 and companion .srt/.vtt subtitles", async () => {
    const sysFfmpeg = Bun.which("ffmpeg");
    let cliToolDir = toolDir;
    if (!sysFfmpeg) {
      cliToolDir = join(outDir, "mp4_tools_fallback");
      mkdirSync(cliToolDir, { recursive: true });
      const ollamaMockName =
        process.platform === "win32" ? "ollama.cmd" : "ollama";
      writeFileSync(
        join(cliToolDir, ollamaMockName),
        readFileSync(join(toolDir, ollamaMockName)),
      );
      if (process.platform !== "win32") {
        chmodSync(join(cliToolDir, ollamaMockName), 0o755);
      }
      const ffmpegJs = join(cliToolDir, "ffmpeg_mock.js");
      writeFileSync(
        ffmpegJs,
        `#!/usr/bin/env bun
const fs = require("fs");
const args = process.argv.slice(2);
const out = args[args.length - 1];
if (out && !out.startsWith("-")) {
  fs.writeFileSync(out, Buffer.from("000000186674797069736f6d0000020069736f6d", "hex"));
}
process.exit(0);
`,
        "utf8",
      );
      if (process.platform === "win32") {
        const ffmpegExe = join(cliToolDir, "ffmpeg.exe");
        const compileRes = Bun.spawnSync([
          process.execPath,
          "build",
          "--compile",
          ffmpegJs,
          "--outfile",
          ffmpegExe,
        ]);
        if (compileRes.exitCode !== 0) {
          throw new Error(
            `Failed to compile mock ffmpeg.exe: ${compileRes.stderr.toString()}`,
          );
        }
      } else {
        const sh = join(cliToolDir, "ffmpeg");
        writeFileSync(sh, `#!/bin/sh\nexec bun "${ffmpegJs}" "$@"\n`, "utf8");
        chmodSync(sh, 0o755);
      }
    }

    const mp4Window: KindleWindowInfo = {
      id: 888,
      ownerName: "Kindle",
      title: "Kindle",
      pid: 64952,
      bounds: { x: 0, y: 33, width: 1728, height: 1003 },
      isKindle: true,
      score: 138,
      onScreen: true,
    };
    const mp4Deps: KindleDeps = {
      listWindows: async () => ({ windows: [mp4Window] }),
      captureWindow: async (_win, outPng) => {
        writeFileSync(outPng, Buffer.from("89504e470d0a1a0a", "hex"));
      },
      ocrImage: async () => ({
        text: "Distributed logs keep every replica synchronized across failures.",
        engine: "vision",
        bookTitle: "Designing Data-Intensive Applications",
        twoColumn: false,
      }),
      turnPage: async () => {},
      sleep: async () => {},
    };

    const mp4Path = join(outDir, "kindle_read_along.mp4");
    const lines: string[] = [];
    const code = await runTtsCli(
      ["kindle", "--pages", "1", "-f", "mp4", "-o", mp4Path, "--json"],
      {
        stdout: (l) => lines.push(l),
        cwd: outDir,
        contextOptions: {
          platform: "darwin",
          home,
          dataDir,
          toolDirs: [cliToolDir],
        },
        kindleDeps: mp4Deps,
      },
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(lines.join("\n"));
    expect(parsed.ok).toBe(true);
    expect(parsed.format).toBe("mp4");
    expect(parsed.outputPath).toBe(mp4Path);
    expect(existsSync(mp4Path)).toBe(true);
    expect(statSync(mp4Path).size).toBeGreaterThan(16);
    if (sysFfmpeg) {
      const mp4Hdr = readFileSync(mp4Path).subarray(4, 8).toString("ascii");
      expect(mp4Hdr).toBe("ftyp");
    }

    const srtPath = parsed.srtPath as string;
    const vttPath = parsed.vttPath as string;
    expect(typeof srtPath).toBe("string");
    expect(typeof vttPath).toBe("string");
    expect(existsSync(srtPath)).toBe(true);
    expect(existsSync(vttPath)).toBe(true);
    const srtText = readFileSync(srtPath, "utf8");
    const vttText = readFileSync(vttPath, "utf8");
    expect(srtText).toContain("-->");
    expect(srtText).toContain("Distributed");
    expect(vttText).toContain("WEBVTT");
    expect(vttText).toContain("synchronized");
  });
});

function compressPalmDocLz77(input: Buffer): Buffer {
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    // Check for backreference of length 3..10 within distance 1..2047
    let bestDist = 0;
    let bestLen = 0;
    const maxDist = Math.min(2047, i);
    const maxLen = Math.min(10, input.length - i);
    if (maxLen >= 3) {
      for (let d = 1; d <= maxDist; d++) {
        let l = 0;
        while (l < maxLen && input[i - d + (l % d)] === input[i + l]) {
          l++;
        }
        if (l >= 3 && l > bestLen) {
          bestLen = l;
          bestDist = d;
          if (bestLen === 10) break;
        }
      }
    }
    if (bestLen >= 3) {
      const pair = 0x8000 | (bestDist << 3) | (bestLen - 3);
      out.push((pair >> 8) & 0xff, pair & 0xff);
      i += bestLen;
      continue;
    }

    const b = input[i]!;
    if (b === 0x20 && i + 1 < input.length) {
      const nxt = input[i + 1]!;
      if (nxt >= 0x40 && nxt <= 0x7f) {
        out.push(nxt ^ 0x80);
        i += 2;
        continue;
      }
    }
    if (b === 0x00 || (b >= 0x09 && b <= 0x7f)) {
      out.push(b);
      i++;
      continue;
    }
    // Literal run for 0x01..0x08 and 0x80..0xFF
    const runBytes: number[] = [];
    while (
      i < input.length &&
      runBytes.length < 8 &&
      input[i]! !== 0x00 &&
      (input[i]! < 0x09 || input[i]! > 0x7f)
    ) {
      runBytes.push(input[i++]!);
    }
    out.push(runBytes.length, ...runBytes);
  }
  return Buffer.from(out);
}

function buildTestKindleMobiBuffer(opts: {
  pdbName: string;
  bookTitle: string;
  author?: string;
  textRecords: Buffer[];
  compression?: 1 | 2;
  encryptionType?: number;
  encoding?: 65001 | 1252;
}): Buffer {
  const compression = opts.compression ?? 2;
  const encryptionType = opts.encryptionType ?? 0;
  const encoding = opts.encoding ?? 65001;
  const textCodec = encoding === 65001 ? "utf8" : "latin1";

  const mobiHeaderLen = 232;
  const exthRecords: Buffer[] = [];
  const pushExth = (recType: number, val: string) => {
    const valBuf = Buffer.from(val, textCodec);
    const rec = Buffer.alloc(8 + valBuf.length);
    rec.writeUInt32BE(recType, 0);
    rec.writeUInt32BE(8 + valBuf.length, 4);
    valBuf.copy(rec, 8);
    exthRecords.push(rec);
  };
  pushExth(503, opts.bookTitle);
  if (opts.author) pushExth(100, opts.author);

  const exthBody = Buffer.concat(exthRecords);
  const exthLen = 12 + exthBody.length;
  const exthPad = (4 - (exthLen % 4)) % 4;
  const exthBuf = Buffer.alloc(exthLen + exthPad);
  exthBuf.write("EXTH", 0, "ascii");
  exthBuf.writeUInt32BE(exthLen + exthPad, 4);
  exthBuf.writeUInt32BE(exthRecords.length, 8);
  exthBody.copy(exthBuf, 12);

  const fullNameBuf = Buffer.from(opts.bookTitle, textCodec);
  const fullNameOffset = 16 + mobiHeaderLen + exthBuf.length;
  const rec0 = Buffer.alloc(fullNameOffset + fullNameBuf.length + 2);
  rec0.writeUInt16BE(compression, 0);
  rec0.writeUInt16BE(opts.textRecords.length, 8);
  rec0.writeUInt16BE(encryptionType, 12);
  rec0.write("MOBI", 16, "ascii");
  rec0.writeUInt32BE(mobiHeaderLen, 20);
  rec0.writeUInt32BE(encoding, 28);
  rec0.writeUInt32BE(fullNameOffset, 84);
  rec0.writeUInt32BE(fullNameBuf.length, 88);
  rec0.writeUInt32BE(0x40, 128);
  exthBuf.copy(rec0, 16 + mobiHeaderLen);
  fullNameBuf.copy(rec0, fullNameOffset);

  const encodedTextRecords = opts.textRecords.map((r) =>
    compression === 2 ? compressPalmDocLz77(r) : r,
  );
  const allRecords = [rec0, ...encodedTextRecords];
  const headerLen = 78 + allRecords.length * 8;
  const pdbHeader = Buffer.alloc(headerLen);
  Buffer.from(opts.pdbName.slice(0, 31), "ascii").copy(pdbHeader, 0);
  pdbHeader.write("BOOKMOBI", 60, "ascii");
  pdbHeader.writeUInt16BE(allRecords.length, 76);

  let cursor = headerLen;
  for (let idx = 0; idx < allRecords.length; idx++) {
    pdbHeader.writeUInt32BE(cursor, 78 + idx * 8);
    pdbHeader.writeUInt32BE(idx, 78 + idx * 8 + 4);
    cursor += allRecords[idx]!.length;
  }
  return Buffer.concat([pdbHeader, ...allRecords]);
}

describe("Built-in Kindle MOBI/AZW3 PalmDOC LZ77 & DRM detection", () => {
  test("parses PalmDOC LZ77 .mobi and .azw3 with NO Calibre in toolDirs", async () => {
    const htmlPage1 =
      "<html><body><h1>Chapter 1: Foundations</h1><p>PalmDOC LZ77 compression handles repeating prose cleanly without external Calibre binaries.</p><mbp:pagebreak/>";
    const htmlPage2 =
      "<h2>Chapter 2: Resilience</h2><p>Built-in decompression recovers UTF-8 text and structured chapters cleanly.</p></body></html>";

    const raw1 = Buffer.from(htmlPage1, "utf8");
    const raw2 = Buffer.from(htmlPage2, "utf8");
    const compressed1 = compressPalmDocLz77(raw1);
    expect(decompressPalmDocLz77(compressed1).toString("utf8")).toBe(htmlPage1);

    const mobiBuf = buildTestKindleMobiBuffer({
      pdbName: "Clean_Architecture",
      bookTitle: "Clean Architecture Guide",
      author: "Ada Lovelace",
      textRecords: [raw1, raw2],
      compression: 2,
      encryptionType: 0,
      encoding: 65001,
    });
    const azw3Buf = buildTestKindleMobiBuffer({
      pdbName: "Systems_Handbook",
      bookTitle: "Systems Handbook",
      author: "Grace Hopper",
      textRecords: [
        Buffer.from(
          "<html><body><h1>Part One</h1><p>Zero-dependency AZW3 inspection extracts readable chapters reliably.</p></body></html>",
          "latin1",
        ),
      ],
      compression: 2,
      encryptionType: 0,
      encoding: 1252,
    });

    const ebookDir = join(outDir, "kindle_ebooks");
    mkdirSync(ebookDir, { recursive: true });
    const mobiPath = join(ebookDir, "clean_architecture.mobi");
    const azw3Path = join(ebookDir, "systems_handbook.azw3");
    writeFileSync(mobiPath, mobiBuf);
    writeFileSync(azw3Path, azw3Buf);

    const richMobi = await inspectKindleMobiRich(
      bufferSource(mobiBuf),
      mobiPath,
      mobiBuf,
      false,
    );
    expect(richMobi).not.toBeNull();
    expect(richMobi!.kind).toBe("document");
    expect(richMobi!.title).toBe("Clean Architecture Guide");
    expect(richMobi!.author).toBe("Ada Lovelace");
    expect(richMobi!.chapters?.length).toBeGreaterThanOrEqual(2);
    expect(richMobi!.plainText).toContain("PalmDOC LZ77 compression");
    expect(richMobi!.plainText).toContain("structured chapters cleanly");
    expect(isNonProseKindlePreview(richMobi!)).toBe(false);

    const richAzw3 = await inspectKindleMobiRich(
      bufferSource(azw3Buf),
      azw3Path,
      azw3Buf,
      false,
    );
    expect(richAzw3).not.toBeNull();
    expect(richAzw3!.title).toBe("Systems Handbook");
    expect(richAzw3!.plainText).toContain("Zero-dependency AZW3 inspection");
    expect(isNonProseKindlePreview(richAzw3!)).toBe(false);

    // Explicitly pass toolDirs: [] so NO Calibre binary can be resolved
    const noCalibreCtx = createContext({
      home,
      dataDir,
      toolDirs: [],
    });
    const mobiExtracted = await extractPlainTextFromFile(
      noCalibreCtx,
      mobiPath,
    );
    expect(mobiExtracted.method).toBe("Built-in DOCUMENT Extractor");
    expect(mobiExtracted.title).toBe("Clean Architecture Guide");
    expect(mobiExtracted.text).toContain("Chapter 1: Foundations");
    expect(mobiExtracted.text).toContain(
      "PalmDOC LZ77 compression handles repeating prose cleanly",
    );
    expect(mobiExtracted.text).not.toContain("<html>");

    const azw3Extracted = await extractPlainTextFromFile(
      noCalibreCtx,
      azw3Path,
    );
    expect(azw3Extracted.method).toBe("Built-in DOCUMENT Extractor");
    expect(azw3Extracted.title).toBe("Systems Handbook");
    expect(azw3Extracted.text).toContain("Zero-dependency AZW3 inspection");
  });

  test("detects DRM-encrypted .mobi and .kfx via isNonProseKindlePreview and rejects with DRM_PROTECTED", async () => {
    const drmMobiBuf = buildTestKindleMobiBuffer({
      pdbName: "Locked_Kindle_Book",
      bookTitle: "Encrypted Kindle Title",
      author: "Locked Author",
      textRecords: [Buffer.from("ciphertext-payload-placeholder", "utf8")],
      compression: 2,
      encryptionType: 2,
      encoding: 65001,
    });
    const kfxContBuf = Buffer.concat([
      Buffer.from("CONT", "ascii"),
      Buffer.alloc(64, 0x00),
      Buffer.from("kfx-drm-payload", "utf8"),
    ]);

    const drmDir = join(outDir, "kindle_drm");
    mkdirSync(drmDir, { recursive: true });
    const drmMobiPath = join(drmDir, "locked_book.mobi");
    const kfxPath = join(drmDir, "locked_book.kfx");
    writeFileSync(drmMobiPath, drmMobiBuf);
    writeFileSync(kfxPath, kfxContBuf);

    const drmMobiRich = await inspectKindleMobiRich(
      bufferSource(drmMobiBuf),
      drmMobiPath,
      drmMobiBuf,
      false,
    );
    expect(drmMobiRich).not.toBeNull();
    expect(isNonProseKindlePreview(drmMobiRich!)).toBe(true);
    expect(
      drmMobiRich!.meta.some(([k, v]) => k === "Encryption" && /DRM/i.test(v)),
    ).toBe(true);

    const kfxRich = await inspectKindleMobiRich(
      bufferSource(kfxContBuf),
      kfxPath,
      kfxContBuf,
      false,
    );
    expect(kfxRich).not.toBeNull();
    expect(isNonProseKindlePreview(kfxRich!)).toBe(true);
    expect(
      kfxRich!.meta.some(([k, v]) => k === "Protection" && /KFX/i.test(v)),
    ).toBe(true);

    const noCalibreCtx = createContext({
      home,
      dataDir,
      toolDirs: [],
    });

    let mobiErr: unknown;
    try {
      await extractPlainTextFromFile(noCalibreCtx, drmMobiPath);
    } catch (e) {
      mobiErr = e;
    }
    expect(mobiErr).toBeInstanceOf(FmError);
    expect((mobiErr as FmError).code).toBe("DRM_PROTECTED");

    let kfxErr: unknown;
    try {
      await extractPlainTextFromFile(noCalibreCtx, kfxPath);
    } catch (e) {
      kfxErr = e;
    }
    expect(kfxErr).toBeInstanceOf(FmError);
    expect((kfxErr as FmError).code).toBe("DRM_PROTECTED");
  });
});

describe("Whole-book 283+ page resilience, retry recovery & front/back fluff skipping", () => {
  test("recovers from missed page turns via 3-step retries and completes all pages before true end-of-book", async () => {
    const ctx = createContext({
      platform: "darwin",
      home,
      dataDir,
      toolDirs: [toolDir],
    });
    const kindleWin: KindleWindowInfo = {
      id: 901,
      ownerName: "Kindle",
      title: "Kindle",
      pid: 64951,
      bounds: { x: 0, y: 0, width: 1728, height: 1003 },
      isKindle: true,
      score: 137,
      onScreen: false,
    };

    const totalRealPages = 12;
    let currentPageIdx = 0;
    let turnAttempt = 0;
    const fallbackCalls: boolean[] = [];

    const retryDeps: KindleDeps = {
      listWindows: async () => ({ windows: [kindleWin] }),
      captureWindow: async (_win, outPng) => {
        writeFileSync(outPng, Buffer.from(`png-${currentPageIdx}`, "utf8"));
      },
      ocrImage: async () => {
        const sampleBodies = [
          "Opening narrative introduces the engineering team and production database migration.",
          "Distributed consensus guarantees linearizability across replicated partitions.",
          "Write-ahead logs recover committed transactions smoothly after sudden power loss.",
          "Columnar storage compresses analytical queries across billions of historical events.",
          "Backpressure queues prevent cascading failures during unexpected traffic surges.",
          "Deterministic simulation tests catch rare race conditions before deployment.",
          "Idempotent event handlers allow safe retries across unreliable network links.",
          "Consistent hashing balances shard placement without moving unrelated keys.",
          "Bloom filters avoid costly disk lookups for missing keys in LSM trees.",
          "Adaptive timeouts isolate slow downstream replicas while keeping tails low.",
          "Schema evolution decouples readers from writers across rolling upgrades.",
          "Observability traces connect high-level user requests to exact storage latency.",
        ];
        return {
          text: `${sampleBodies[currentPageIdx] ?? ""} (real page ${currentPageIdx + 1})`,
          engine: "vision",
          bookTitle: "Resilient Book",
        };
      },
      turnPage: async (_w, _k, _a, _c, opts) => {
        turnAttempt++;
        fallbackCalls.push(Boolean(opts?.forceFallback));
        // Simulate missed turn on attempt #3 (recovers on retry 2) and on attempt #7 (recovers only on retry 3 forceFallback)
        if (turnAttempt === 3) return;
        if (turnAttempt === 7 || turnAttempt === 8) return;
        if (currentPageIdx < totalRealPages - 1) currentPageIdx++;
      },
      sleep: async () => {},
    };

    const sess = await captureKindlePagesBatch(
      ctx,
      {
        readAllPages: true,
        delayMs: 250,
        maxDuplicateRetries: 3,
      },
      retryDeps,
    );

    expect(sess.status).toBe("completed");
    expect(sess.capturedPages.length).toBe(totalRealPages);
    expect(sess.stoppedReason).toContain("Reached end of book");
    expect(fallbackCalls.some(Boolean)).toBe(true);
    for (let i = 1; i <= totalRealPages; i++) {
      expect(sess.combinedText).toContain(`real page ${i}`);
    }
  });

  test("distinct blank or illustration pages with different imageHash do not falsely stop capture", async () => {
    const ctx = createContext({
      platform: "darwin",
      home,
      dataDir,
      toolDirs: [toolDir],
    });
    const kindleWin: KindleWindowInfo = {
      id: 902,
      ownerName: "Kindle",
      title: "Illustrated Book",
      pid: 64951,
      bounds: { x: 0, y: 0, width: 1200, height: 800 },
      isKindle: true,
      score: 125,
    };

    let idx = 0;
    const sequence = [
      {
        img: "img-page-1",
        text: "Chapter 1 begins with clear narrative prose.",
      },
      { img: "img-illustration-a", text: "" },
      { img: "img-illustration-b", text: "" },
      {
        img: "img-page-4",
        text: "Chapter 2 resumes right after the illustrations.",
      },
    ];

    const blankDeps: KindleDeps = {
      listWindows: async () => ({ windows: [kindleWin] }),
      captureWindow: async (_w, outPng) => {
        const cur = sequence[Math.min(idx, sequence.length - 1)]!;
        writeFileSync(outPng, Buffer.from(cur.img, "utf8"));
      },
      ocrImage: async () => {
        const cur = sequence[Math.min(idx, sequence.length - 1)]!;
        return {
          text: cur.text,
          engine: "vision",
          bookTitle: "Illustrated Book",
        };
      },
      turnPage: async () => {
        if (idx < sequence.length - 1) idx++;
      },
      sleep: async () => {},
    };

    const sess = await captureKindlePagesBatch(
      ctx,
      { pages: 4, delayMs: 250, stopOnDuplicate: true },
      blankDeps,
    );
    expect(sess.capturedPages.length).toBe(4);
    expect(sess.combinedText).toContain("Chapter 1 begins");
    expect(sess.combinedText).toContain("Chapter 2 resumes");
  });

  test("skips cover, copyright, TOC, and preface to start at Introduction or Chapter 1, and stops before back-matter fluff", async () => {
    const ctx = createContext({
      platform: "darwin",
      home,
      dataDir,
      toolDirs: [toolDir],
    });
    const kindleWin: KindleWindowInfo = {
      id: 903,
      ownerName: "Kindle",
      title: "Kindle",
      pid: 64951,
      bounds: { x: 0, y: 0, width: 1400, height: 900 },
      isKindle: true,
      score: 130,
    };

    const bookPages = [
      "GREAT SYSTEMS\nBy Ada Example",
      "Copyright © 2026 Example Press\nAll rights reserved. ISBN 978-0-123456-78-9",
      "Table of Contents\nIntroduction 1\nChapter 1: Foundations 12\nChapter 2: Reliability 45\nAcknowledgments 260\nIndex 275",
      "Preface\n\nI wrote this book after many years of debugging production systems in real environments.",
      "Introduction\n\nWelcome to Great Systems. This introductory chapter sets the core theme.",
      "Chapter 1: Foundations\n\nEvery durable system starts with explicit boundaries and clear invariants.",
      "Chapter 2: Final Thoughts\n\nAnd that brings our journey to a clean close.\n\nAcknowledgments\n\nThanks to my editor and family.",
      "Index\n\nAvailability, 42\nBackpressure, 88",
    ];

    expect(isTableOfContentsPage(bookPages[2]!)).toBe(true);
    expect(isTableOfContentsPage(bookPages[5]!)).toBe(false);

    // Mid-chapter page without front-matter triggers keeps body text immediately
    const midBookRole = classifyKindlePageRole(
      "This long paragraph starts mid-chapter with ordinary storytelling and technical analysis. It has multiple sentences and no front-matter heading at all so it should never be skipped.",
      {
        startMode: "intro",
        stopAtBackMatter: true,
        hasStartedBody: false,
        inFrontMatterSection: false,
        skippedFrontPages: 0,
      },
    );
    expect(midBookRole.action).toBe("keep");

    // 1. startMode = "intro": skips Cover, Copyright, TOC, Preface -> starts at Introduction, stops before Acknowledgments (never reads Index)
    let cursor = 0;
    const makeMock = () => ({
      listWindows: async () => ({ windows: [kindleWin] }),
      captureWindow: async (_w: KindleWindowInfo, outPng: string) => {
        writeFileSync(outPng, Buffer.from(`book-${cursor}`, "utf8"));
      },
      ocrImage: async () => ({
        text: bookPages[Math.min(cursor, bookPages.length - 1)]!,
        engine: "vision" as const,
        bookTitle: "Great Systems",
      }),
      turnPage: async () => {
        if (cursor < bookPages.length - 1) cursor++;
      },
      sleep: async () => {},
    });

    const introSess = await captureKindlePagesBatch(
      ctx,
      {
        readAllPages: true,
        startMode: "intro",
        stopAtBackMatter: true,
        delayMs: 250,
      },
      makeMock(),
    );
    expect(introSess.status).toBe("completed");
    expect(introSess.skippedFrontPages).toBe(4);
    expect(introSess.startHeading).toBe("Introduction");
    expect(introSess.stoppedHeading).toBe("Acknowledgments");
    expect(introSess.combinedText).not.toContain("ISBN");
    expect(introSess.combinedText).not.toContain("Table of Contents");
    expect(introSess.combinedText).not.toContain(
      "I wrote this book after many years",
    );
    expect(introSess.combinedText).toContain("Introduction");
    expect(introSess.combinedText).toContain("Chapter 1: Foundations");
    expect(introSess.combinedText).toContain(
      "And that brings our journey to a clean close.",
    );
    expect(introSess.combinedText).not.toContain("Thanks to my editor");
    expect(introSess.combinedText).not.toContain("Backpressure, 88");

    // 2. startMode = "chapter1": also skips Introduction -> starts at Chapter 1
    cursor = 0;
    const ch1Sess = await captureKindlePagesBatch(
      ctx,
      {
        readAllPages: true,
        startMode: "chapter1",
        stopAtBackMatter: true,
        delayMs: 250,
      },
      makeMock(),
    );
    expect(ch1Sess.skippedFrontPages).toBe(5);
    expect(ch1Sess.startHeading).toBe("Chapter 1: Foundations");
    expect(ch1Sess.combinedText).not.toContain("Welcome to Great Systems");
    expect(ch1Sess.combinedText).toContain("Chapter 1: Foundations");

    // 3. Pure trimBookFrontAndBackFluff + PHONON_OPS["phonon/extract"] trimBookFluff
    const fullRaw = bookPages.join("\n\n");
    const trimmedRes = trimBookFrontAndBackFluff(fullRaw, {
      startMode: "intro",
      stripBackMatter: true,
    });
    expect(trimmedRes.trimmedFront).toBe(true);
    expect(trimmedRes.trimmedBack).toBe(true);
    expect(trimmedRes.text).toContain("Introduction");
    expect(trimmedRes.text).not.toContain("Copyright");
    expect(trimmedRes.text).not.toContain("Thanks to my editor");

    const extracted = (await PHONON_OPS["phonon/extract"]!(ctx, {
      text: fullRaw,
      trimBookFluff: true,
      bookStartMode: "chapter1",
      stripBackMatter: true,
    })) as any;
    expect(extracted.text).toContain("Chapter 1: Foundations");
    expect(extracted.text).not.toContain("Welcome to Great Systems");
    expect(extracted.text).not.toContain("Backpressure, 88");
  });

  test("Read All Pages & trimBookFrontAndBackFluff handle spelled-out (ONE, TWO, THREE), numeric (1, 2, 3), and Roman (I, II, III) chapter books", async () => {
    const ctx = createContext({ home, dataDir, toolDirs: [toolDir], platform: "darwin" });
    const kindleWin: KindleWindowInfo = {
      id: 4202,
      ownerName: "Kindle",
      title: "The Rising",
      pid: 9912,
      bounds: { x: 0, y: 0, width: 1728, height: 1084 },
      isKindle: true,
      score: 120,
      onScreen: false,
    };

    const novelPages = [
      "The Rising\n\nA Novel",
      "Copyright © 2003 Author. All rights reserved. ISBN 978-0-000-00001-1.\n1",
      "For everyone who stayed up past midnight.",
      "ONE\nTWO\nTHREE\nFOUR\nFIVE",
      "Preface\n\nThis edition restores several scenes from the original draft.",
      "ONE\n\nThe storm rolled over the ridge just before dawn. Jim listened to the rain hammering the porch roof and checked the locks one more time.",
      "TWO\n\nBy morning the highway was quiet except for the distant hum of a generator. Nobody had driven past the turnoff since Tuesday.",
      "THREE\n\nThey packed the truck in silence and headed south toward the river crossing. Every mile felt longer than the last.\n\nAbout the Author\n\nThe author lives in Pennsylvania and writes fiction.",
      "Also by the Author\n\nCity of the Dead\nDark Hollow",
    ];

    expect(isTableOfContentsPage(novelPages[3]!)).toBe(true);
    expect(isTableOfContentsPage(novelPages[5]!)).toBe(false);

    let cursor = 0;
    const makeMock = (pages: string[], startAt = 0) => {
      cursor = startAt;
      return {
        listWindows: async () => ({ windows: [kindleWin] }),
        captureWindow: async (_w: KindleWindowInfo, outPng: string) => {
          writeFileSync(outPng, Buffer.from(`novel-${cursor}`, "utf8"));
        },
        ocrImage: async () => ({
          text: pages[Math.min(cursor, pages.length - 1)]!,
          engine: "vision" as const,
          bookTitle: "The Rising",
        }),
        turnPage: async () => {
          if (cursor < pages.length - 1) cursor++;
        },
        sleep: async () => {},
      };
    };

    // 1. Full book read from Cover with startMode="intro" -> skips front fluff, starts at ONE, reads ONE/TWO/THREE, stops before About the Author
    const fullSess = await captureKindlePagesBatch(
      ctx,
      {
        readAllPages: true,
        startMode: "intro",
        stopAtBackMatter: true,
        delayMs: 250,
      },
      makeMock(novelPages, 0),
    );
    expect(fullSess.status).toBe("completed");
    expect(fullSess.skippedFrontPages).toBe(5);
    expect(fullSess.startHeading).toBe("ONE");
    expect(fullSess.stoppedHeading).toBe("About the Author");
    expect(fullSess.capturedPages.length).toBe(3);
    expect(fullSess.combinedText).toContain("The storm rolled over the ridge");
    expect(fullSess.combinedText).toContain("By morning the highway was quiet");
    expect(fullSess.combinedText).toContain("They packed the truck in silence");
    expect(fullSess.combinedText).not.toContain("ISBN");
    expect(fullSess.combinedText).not.toContain("original draft");
    expect(fullSess.combinedText).not.toContain("lives in Pennsylvania");

    // 2. Starting mid-book at TWO with Read All Pages (startMode="intro") -> starts immediately at TWO and reads through THREE
    const midSess = await captureKindlePagesBatch(
      ctx,
      {
        readAllPages: true,
        startMode: "intro",
        stopAtBackMatter: true,
        delayMs: 250,
      },
      makeMock(novelPages, 6),
    );
    expect(midSess.status).toBe("completed");
    expect(midSess.skippedFrontPages).toBe(0);
    expect(midSess.capturedPages.length).toBe(2);
    expect(midSess.combinedText).toContain("By morning the highway was quiet");
    expect(midSess.combinedText).toContain("They packed the truck in silence");

    // 3. Bare Roman numeral chapters (I, II, III) after Copyright with stray page number "1"
    const romanPages = [
      "Copyright © 2024 Press. All rights reserved. ISBN 978-0-000-00002-8.\n1",
      "I\n\nThe valley lay silent under a silver mist. Two travelers paused at the edge of the timberline to check their compass.",
      "II\n\nBy noon they reached the stone bridge. Water rushed beneath the arches as the wind shifted north.",
      "Acknowledgments\n\nMany thanks to our readers.",
    ];
    const romanSess = await captureKindlePagesBatch(
      ctx,
      {
        readAllPages: true,
        startMode: "chapter1",
        stopAtBackMatter: true,
        delayMs: 250,
      },
      makeMock(romanPages, 0),
    );
    expect(romanSess.skippedFrontPages).toBe(1);
    expect(romanSess.startHeading).toBe("I");
    expect(romanSess.capturedPages.length).toBe(2);
    expect(romanSess.combinedText).toContain("The valley lay silent");
    expect(romanSess.combinedText).toContain("By noon they reached the stone bridge");
    expect(romanSess.combinedText).not.toContain("Many thanks");

    // 4. trimBookFrontAndBackFluff trims a full ONE/TWO/THREE novel cleanly
    const trimmed = trimBookFrontAndBackFluff(novelPages.join("\n\n"), {
      startMode: "chapter1",
      stripBackMatter: true,
    });
    expect(trimmed.trimmedFront).toBe(true);
    expect(trimmed.trimmedBack).toBe(true);
    expect(trimmed.startHeading).toBe("ONE");
    expect(trimmed.stoppedHeading).toBe("About the Author");
    expect(trimmed.text).toContain("The storm rolled over the ridge");
    expect(trimmed.text).not.toContain("ISBN");
    expect(trimmed.text).not.toContain("lives in Pennsylvania");
  });

  test("Read All Pages stops cleanly on Kindle end-of-book screens, flashing blank pages, short-page OCR jitter, and A/B oscillation", async () => {
    const ctx = createContext({ home, dataDir, toolDirs: [toolDir], platform: "darwin" });
    const kindleWin: KindleWindowInfo = {
      id: 4203,
      ownerName: "Kindle",
      title: "The Rising",
      pid: 9913,
      bounds: { x: 0, y: 0, width: 1728, height: 1084 },
      isKindle: true,
      score: 120,
      onScreen: false,
    };

    expect(
      isKindleEndOfBookScreen(
        "Before you go...\nRate this book\nMark as Read\nReturn to Library",
      ),
    ).toBe(true);
    expect(
      isKindleEndOfBookScreen(
        "Before you go, Jim said, make sure you check the generator and lock the cellar door. ".repeat(
          15,
        ),
      ),
    ).toBe(false);

    const makeSequenceMock = (frames: Array<{ text: string; hash: string }>) => {
      let idx = 0;
      return {
        listWindows: async () => ({ windows: [kindleWin] }),
        captureWindow: async (_w: KindleWindowInfo, outPng: string) => {
          const f = frames[Math.min(idx, frames.length - 1)]!;
          writeFileSync(outPng, Buffer.from(f.hash, "utf8"));
        },
        ocrImage: async () => {
          const f = frames[Math.min(idx, frames.length - 1)]!;
          return { text: f.text, engine: "vision" as const, bookTitle: "The Rising" };
        },
        turnPage: async () => {
          if (idx < frames.length - 1) idx++;
        },
        sleep: async () => {},
      };
    };

    // 1. Kindle "Before you go / Rate this book" screen stops cleanly without appending UI text
    const endScreenSess = await captureKindlePagesBatch(
      ctx,
      { readAllPages: true, startMode: "none", stopAtBackMatter: false, delayMs: 250 },
      makeSequenceMock([
        { text: "ONE\n\nFinal chapter prose ends on a quiet note.", hash: "p1" },
        { text: "Before you go...\nRate this book\nMark as Read\nReturn to Library", hash: "p2" },
        { text: "Before you go...\nRate this book\nMark as Read\nReturn to Library", hash: "p3" },
      ]),
    );
    expect(endScreenSess.status).toBe("completed");
    expect(endScreenSess.stoppedReason).toContain("end-of-book screen");
    expect(endScreenSess.capturedPages.length).toBe(1);
    expect(endScreenSess.combinedText).not.toContain("Rate this book");

    // 2. Consecutive blank pages with changing imageHash (flashing HUD) stop cleanly after 3 blanks
    const blankSess = await captureKindlePagesBatch(
      ctx,
      { readAllPages: true, startMode: "none", stopAtBackMatter: false, delayMs: 250 },
      makeSequenceMock([
        { text: "ONE\n\nLast real page of text.", hash: "b1" },
        { text: "", hash: "hud-on-1" },
        { text: "", hash: "hud-off-2" },
        { text: "", hash: "hud-on-3" },
        { text: "", hash: "hud-off-4" },
      ]),
    );
    expect(blankSess.status).toBe("completed");
    expect(blankSess.stoppedReason).toContain("consecutive blank pages");

    // 3. Short final page (<80 chars) with 1-char OCR jitter stops cleanly
    const jitterSess = await captureKindlePagesBatch(
      ctx,
      {
        readAllPages: true,
        startMode: "none",
        stopAtBackMatter: false,
        delayMs: 250,
        maxDuplicateRetries: 1,
      },
      makeSequenceMock([
        { text: "The sun rose quietly over the empty harbor.", hash: "j1" },
        { text: "The sun rose quietly over the empty harbor. l", hash: "j2" },
        { text: "The sun rose quietly over the empty harbor.", hash: "j3" },
      ]),
    );
    expect(jitterSess.status).toBe("completed");
    expect(jitterSess.capturedPages.length).toBe(1);
    expect(jitterSess.stoppedReason).toContain("duplicate");

    // 4. 2-page oscillation (A -> B -> A) at end of book stops cleanly
    const bounceSess = await captureKindlePagesBatch(
      ctx,
      { readAllPages: true, startMode: "none", stopAtBackMatter: false, delayMs: 250 },
      makeSequenceMock([
        { text: "Final narrative paragraph of the novel.", hash: "o1" },
        { text: "End card overlay widget.", hash: "o2" },
        { text: "Final narrative paragraph of the novel.", hash: "o3" },
        { text: "End card overlay widget.", hash: "o4" },
      ]),
    );
    expect(bounceSess.status).toBe("completed");
    expect(bounceSess.stoppedReason).toContain("repeated after turn");
  });

  test("File Manager server accepts >1 MB phonon/chunk body for full 283-page books without HTTP 413", async () => {
    const srv = startFileManagerServer({
      port: 0,
      token: "large-book-token",
      context: { home, dataDir, launch: async () => {} },
    });
    try {
      const base = `http://127.0.0.1:${srv.port}`;
      // ~1.35 MB text simulating a 283-page book
      const bigBook = Array.from(
        { length: 283 },
        (_, i) =>
          `Page ${i + 1}: ` +
          "Systems design relies on durable state and careful boundaries. ".repeat(
            75,
          ),
      ).join("\n\n");
      expect(bigBook.length).toBeGreaterThan(1_100_000);

      const res = await fetch(`${base}/api/phonon/chunk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fm-token": "large-book-token",
        },
        body: JSON.stringify({ text: bigBook, maxChars: 520 }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.ok).toBe(true);
      expect(data.chunkCount).toBeGreaterThan(100);
    } finally {
      srv.stop(true);
    }
  });
});

function getFreeTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not resolve free TCP port")));
      }
    });
  });
}

describe("Cross-OS macOS-only gating for Kindle Open-Book Reader", () => {
  test("isKindleSupportedPlatform returns true only on darwin", () => {
    expect(isKindleSupportedPlatform("darwin")).toBe(true);
    expect(isKindleSupportedPlatform("linux")).toBe(false);
    expect(isKindleSupportedPlatform("win32")).toBe(false);
    expect(isKindleSupportedPlatform("freebsd")).toBe(false);
  });

  test("KINDLE_OPS disables kindle/* operations on linux and win32 while keeping darwin supported", async () => {
    const { deps } = createMockKindleDeps(["Sample Kindle text."]);
    const ops = createKindleOps(deps);

    const macCtx = createContext({
      platform: "darwin",
      home,
      dataDir,
      toolDirs: [toolDir],
    });
    const macStatus = (await ops["kindle/status"]!(macCtx, {})) as any;
    expect(macStatus.supported).toBe(true);
    expect(macStatus.platform).toBe("darwin");

    for (const plat of ["linux", "win32"] as const) {
      const ctx = createContext({
        platform: plat,
        home,
        dataDir,
        toolDirs: [toolDir],
      });
      const status = (await ops["kindle/status"]!(ctx, {})) as any;
      expect(status).toEqual({
        supported: false,
        platform: plat,
        visionAvailable: false,
        tesseractAvailable: false,
        screencaptureAvailable: false,
        osascriptAvailable: false,
        kindleWindowCount: 0,
        windowsCount: 0,
        permissionHint: "Kindle Open-Book Reader is available on macOS only.",
      });

      for (const [opName, payload] of [
        ["kindle/windows", {}],
        ["kindle/capture-page", {}],
        ["kindle/start-capture", { pages: 2 }],
      ] as const) {
        let caught: unknown;
        try {
          await ops[opName]!(ctx, payload);
        } catch (err) {
          caught = err;
        }
        expect(caught, `${plat} ${opName} should throw FmError`).toBeInstanceOf(
          FmError,
        );
        expect((caught as FmError).code).toBe("UNSUPPORTED_PLATFORM");
      }

      let batchCaught: unknown;
      try {
        await captureKindlePagesBatch(ctx, { pages: 2 }, deps);
      } catch (err) {
        batchCaught = err;
      }
      expect(batchCaught).toBeInstanceOf(FmError);
      expect((batchCaught as FmError).code).toBe("UNSUPPORTED_PLATFORM");
    }
  });

  test("fmPreview and fmPhonon hide macOS Kindle Open-Book Reader hints on linux and win32", async () => {
    const drmMobiBuf = buildTestKindleMobiBuffer({
      pdbName: "Locked_CrossOS_Book",
      bookTitle: "Locked CrossOS Title",
      author: "Example Author",
      textRecords: [Buffer.from("ciphertext", "utf8")],
      compression: 2,
      encryptionType: 2,
      encoding: 65001,
    });
    const kfxContBuf = Buffer.concat([
      Buffer.from("CONT", "ascii"),
      Buffer.alloc(64, 0x00),
      Buffer.from("kfx-drm-payload", "utf8"),
    ]);

    const previewDir = join(outDir, "kindle_crossos_drm");
    mkdirSync(previewDir, { recursive: true });
    const drmMobiPath = join(previewDir, "locked_crossos.mobi");
    const kfxPath = join(previewDir, "locked_crossos.kfx");
    writeFileSync(drmMobiPath, drmMobiBuf);
    writeFileSync(kfxPath, kfxContBuf);

    const macMobi = await inspectKindleMobiRich(
      bufferSource(drmMobiBuf),
      drmMobiPath,
      drmMobiBuf,
      false,
      "darwin",
    );
    expect(macMobi!.plainText).toContain("Kindle Open-Book Reader");

    for (const plat of ["linux", "win32"] as const) {
      const mobiRich = await inspectKindleMobiRich(
        bufferSource(drmMobiBuf),
        drmMobiPath,
        drmMobiBuf,
        false,
        plat,
      );
      expect(mobiRich).not.toBeNull();
      expect(mobiRich!.plainText).not.toContain("Kindle Open-Book Reader");
      expect(mobiRich!.plainText).not.toContain(
        "Open this book in Amazon Kindle",
      );

      const kfxRich = await inspectKindleMobiRich(
        bufferSource(kfxContBuf),
        kfxPath,
        kfxContBuf,
        false,
        plat,
      );
      expect(kfxRich).not.toBeNull();
      expect(kfxRich!.plainText).not.toContain("Kindle Open-Book Reader");
      expect(kfxRich!.plainText).not.toContain(
        "Open this book in Amazon Kindle",
      );

      const noCalibreCtx = createContext({
        platform: plat,
        home,
        dataDir,
        toolDirs: [],
      });
      for (const target of [drmMobiPath, kfxPath]) {
        let caught: unknown;
        try {
          await extractPlainTextFromFile(noCalibreCtx, target);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(FmError);
        expect((caught as FmError).code).toBe("DRM_PROTECTED");
        expect((caught as FmError).message).not.toContain(
          "Kindle Open-Book Reader",
        );
        expect((caught as FmError).message).not.toContain(
          "Open this book in Amazon Kindle",
        );
      }
    }
  });

  test("fmCli and tts_cli hide Kindle help on linux/win32 and exit 1 if kindle is invoked", async () => {
    for (const plat of ["linux", "win32"] as const) {
      const fmHelp: string[] = [];
      const fmHelpCode = await runFileManagerCli(["--help"], {
        stdout: (l) => fmHelp.push(l),
        contextOptions: { platform: plat },
      });
      expect(fmHelpCode).toBe(0);
      expect(fmHelp.join("\n")).not.toContain("kindle [args...]");

      const ttsHelp: string[] = [];
      const ttsHelpCode = await runTtsCli(["--help"], {
        stdout: (l) => ttsHelp.push(l),
        contextOptions: { platform: plat },
      });
      expect(ttsHelpCode).toBe(0);
      const helpStr = ttsHelp.join("\n");
      expect(helpStr).not.toContain("kindle [options]");
      expect(helpStr).not.toContain("KINDLE OPEN-BOOK CAPTURE OPTIONS");
      expect(helpStr).toContain("--skip-fluff");

      const errLines: string[] = [];
      const outLines: string[] = [];
      const failCode = await runTtsCli(["kindle", "--list-windows"], {
        stdout: (l) => outLines.push(l),
        stderr: (l) => errLines.push(l),
        contextOptions: { platform: plat, home, dataDir, toolDirs: [toolDir] },
      });
      expect(failCode).toBe(1);
      expect(errLines.join("\n")).toContain(
        "Kindle Open-Book Reader is only available on macOS.",
      );

      const jsonOut: string[] = [];
      const jsonCode = await runTtsCli(["kindle", "--pages", "1", "--json"], {
        stdout: (l) => jsonOut.push(l),
        stderr: (l) => errLines.push(l),
        contextOptions: { platform: plat, home, dataDir, toolDirs: [toolDir] },
      });
      expect(jsonCode).toBe(1);
      const parsed = JSON.parse(jsonOut.join("\n"));
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toContain("macOS");

      const fmKindleErr: string[] = [];
      const fmKindleCode = await runFileManagerCli(
        ["kindle", "--list-windows"],
        {
          stderr: (l) => fmKindleErr.push(l),
          contextOptions: {
            platform: plat,
            home,
            dataDir,
            toolDirs: [toolDir],
          },
        },
      );
      expect(fmKindleCode).toBe(1);
      expect(fmKindleErr.join("\n")).toContain("macOS");
    }

    const macTtsHelp: string[] = [];
    const macTtsCode = await runTtsCli(["--help"], {
      stdout: (l) => macTtsHelp.push(l),
      contextOptions: { platform: "darwin" },
    });
    expect(macTtsCode).toBe(0);
    expect(macTtsHelp.join("\n")).toContain("kindle [options]");
    expect(macTtsHelp.join("\n")).toContain("KINDLE OPEN-BOOK CAPTURE OPTIONS");
  });

  test("headless Chrome DOM hides Kindle panel, button, and palette actions on linux/win32 and shows them on darwin", async () => {
    const CHROME_BIN =
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    if (!existsSync(CHROME_BIN)) {
      return;
    }

    const prevScreenshot = process.env.SCREENSHOT_MODE;
    process.env.SCREENSHOT_MODE = "1";
    const port = await getFreeTcpPort();
    const userDataDir = mkdtempSync(join(tmpdir(), "fm-kindle-chrome-"));
    const proc = Bun.spawn(
      [
        CHROME_BIN,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        "about:blank",
      ],
      { stdout: "ignore", stderr: "ignore" },
    );

    let ws: WebSocket | null = null;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const kindleApiRequests: string[] = [];

    try {
      let pageTarget: { type: string; webSocketDebuggerUrl: string } | null =
        null;
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/json/list`);
          if (r.ok) {
            const list = (await r.json()) as any[];
            const found = list.find((t) => t.type === "page");
            if (found) {
              pageTarget = found;
              break;
            }
          }
        } catch {}
        await sleep(100);
      }
      expect(pageTarget).toBeTruthy();

      ws = new WebSocket(pageTarget!.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        ws!.addEventListener("open", () => resolve(), { once: true });
        ws!.addEventListener("error", (e) => reject(e), { once: true });
      });

      let seq = 0;
      const pending = new Map<
        number,
        { resolve: (v: any) => void; reject: (e: Error) => void }
      >();
      const listeners = new Map<string, Set<(p: any) => void>>();
      ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (typeof msg.id === "number") {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message));
            else p.resolve(msg.result);
          }
        } else if (msg.method) {
          for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
        }
      });

      const send = (method: string, params: Record<string, any> = {}) => {
        const id = ++seq;
        ws!.send(JSON.stringify({ id, method, params }));
        return new Promise<any>((resolve, reject) => {
          pending.set(id, { resolve, reject });
        });
      };
      const on = (event: string, fn: (p: any) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn);
      };
      const evalJs = async (expression: string) => {
        const res = await send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (res.exceptionDetails) {
          throw new Error(
            `Eval exception: ${res.exceptionDetails.text} ${JSON.stringify(res.exceptionDetails.exception)}`,
          );
        }
        return res.result?.value;
      };

      await send("Page.enable");
      await send("Runtime.enable");
      await send("Network.enable");
      await send("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });

      on("Network.requestWillBeSent", (p) => {
        const url = String(p?.request?.url || "");
        if (url.includes("/api/kindle/")) {
          kindleApiRequests.push(url);
        }
      });

      const waitForReady = async () => {
        for (let i = 0; i < 75; i++) {
          const ok = await evalJs(
            `Boolean(document.body && document.body.classList.contains("ready") && document.getElementById("power-pane-phonon")?.querySelector(".phonon-card"))`,
          );
          if (ok) return;
          await sleep(80);
        }
        throw new Error("Timed out waiting for Phonon Voice Reader UI");
      };

      for (const plat of ["linux", "win32", "darwin"] as const) {
        const platRoot = mkdtempSync(join(tmpdir(), `fm-kindle-dom-${plat}-`));
        const platHome = join(platRoot, "home");
        const platData = join(platRoot, "data");
        mkdirSync(platHome, { recursive: true });
        mkdirSync(platData, { recursive: true });

        const srv = startFileManagerServer({
          port: 0,
          token: `kindle-dom-${plat}`,
          context: { platform: plat, home: platHome, dataDir: platData },
        });
        const base = `http://127.0.0.1:${srv.port}`;

        try {
          const reqCountBefore = kindleApiRequests.length;
          await send("Page.navigate", { url: `${base}/?tool=phonon&max=1` });
          await waitForReady();
          await sleep(200);

          const domState = await evalJs(`(async () => {
            const pane = document.getElementById("power-pane-phonon");
            const hasSkipFluff = !![...pane.querySelectorAll(".phonon-cleanup-bar label, .phonon-cleanup-bar span")].find(el => el.textContent.includes("Skip Book Fluff"));
            const cpMod = await import("/ui/commandPalette.js");
            const ids = cpMod.buildPaletteCatalog().map(x => x.id);

            document.getElementById("viewbar-palette")?.click();
            await new Promise(r => setTimeout(r, 80));
            const cpInput = document.getElementById("command-palette-input");
            let paletteTitles = [];
            if (cpInput) {
              cpInput.value = "Kindle";
              cpInput.dispatchEvent(new Event("input", { bubbles: true }));
              await new Promise(r => setTimeout(r, 60));
              paletteTitles = [...document.querySelectorAll("#cp-list .cp-item")].map(el => el.textContent || "");
              cpInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            }

            if ("${plat}" !== "darwin") {
              const powerMod = await import("/ui/power.js");
              powerMod.openPower("phonon", { focusKindle: true, autoCaptureMp4: true });
              await new Promise(r => setTimeout(r, 120));
            }

            return {
              metaPlat: document.querySelector('meta[name="fm-platform"]')?.getAttribute("content"),
              hasKindlePanel: !!document.getElementById("phonon-kindle-panel"),
              hasKindleToggleBtn: !!document.getElementById("phonon-kindle-toggle-btn"),
              hasBookViewBtn: !!document.getElementById("phonon-book-view-btn"),
              hasSkipFluff,
              hasActAudio: ids.includes("act.kindleAudioReader"),
              hasActMp4: ids.includes("act.kindleReadAlongMp4"),
              paletteHasKindleAudio: paletteTitles.some(t => t.includes("Kindle: Read Open Book")),
              paletteHasKindleMp4: paletteTitles.some(t => t.includes("Kindle: Capture & Export Read-Along")),
            };
          })()`);

          expect(domState.metaPlat).toBe(plat);
          expect(domState.hasBookViewBtn).toBe(true);
          expect(domState.hasSkipFluff).toBe(true);

          if (plat === "darwin") {
            expect(domState.hasKindlePanel).toBe(true);
            expect(domState.hasKindleToggleBtn).toBe(true);
            expect(domState.hasActAudio).toBe(true);
            expect(domState.hasActMp4).toBe(true);
            expect(domState.paletteHasKindleAudio).toBe(true);
            expect(domState.paletteHasKindleMp4).toBe(true);
          } else {
            expect(domState.hasKindlePanel).toBe(false);
            expect(domState.hasKindleToggleBtn).toBe(false);
            expect(domState.hasActAudio).toBe(false);
            expect(domState.hasActMp4).toBe(false);
            expect(domState.paletteHasKindleAudio).toBe(false);
            expect(domState.paletteHasKindleMp4).toBe(false);
            expect(kindleApiRequests.length).toBe(reqCountBefore);
          }
        } finally {
          srv.stop(true);
          rmDir(platRoot);
        }
      }
    } finally {
      if (prevScreenshot === undefined) delete process.env.SCREENSHOT_MODE;
      else process.env.SCREENSHOT_MODE = prevScreenshot;
      try {
        ws?.close();
      } catch {}
      try {
        proc.kill();
      } catch {}
      rmDir(userDataDir);
    }
  }, 45_000);
});
