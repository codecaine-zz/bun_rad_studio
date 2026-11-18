import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
// @ts-ignore
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const GLOBALS = [
  "document",
  "window",
  "Node",
  "Element",
  "Event",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "navigator",
  "location",
  "fetch",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
  "MouseEvent",
  "KeyboardEvent",
  "CSS",
  "Audio",
  "MediaRecorder",
  "AudioContext",
  "Blob",
] as const;

const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-transcribe-ui-"));
const home = join(root, "home");
const work = join(home, "audio");
const dataDir = join(root, "data");

let server: ReturnType<typeof startFileManagerServer>;
let dom: JSDOM;
let win: any;
let doc: any;
let state: any;
let api: any;
let nav: any;
let power: any;
let toolbar: any;
let sidebar: any;
let homeTiles: any;
let homeMod: any;
let commandPalette: any;
let contextmenu: any;
let menus: any;
let selection: any;
let transcribeMod: any;

const copied: string[] = [];
const apiRequests: Array<{ op: string; body: any }> = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn: () => any, ms = 4000, what = "condition") {
  const end = Date.now() + ms;
  for (;;) {
    const val = fn();
    if (val) return val;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(15);
  }
}

const q = (sel: string, from: any = doc): any => from.querySelector(sel);
const qa = (sel: string, from: any = doc): any[] => [
  ...from.querySelectorAll(sel),
];

const DEMO_SEGMENTS = [
  { start: 0.0, end: 2.5, text: "Welcome to Codecaine Audio to Text Studio." },
  {
    start: 2.5,
    end: 5.8,
    text: "Timestamped segments stay synchronized with audio.",
  },
  {
    start: 5.8,
    end: 9.0,
    text: "Export directly to Markdown, SRT, VTT, LRC, or JSON.",
  },
];

function mockFormatted(source: any, format: string) {
  const segs = Array.isArray(source?.segments)
    ? source.segments
    : DEMO_SEGMENTS;
  if (format === "srt") {
    return segs
      .map(
        (s: any, i: number) =>
          `${i + 1}\n00:00:0${Math.floor(s.start)},000 --> 00:00:0${Math.floor(s.end)},000\n${s.text}`,
      )
      .join("\n\n");
  }
  if (format === "vtt") {
    return (
      `WEBVTT\n\n` +
      segs
        .map(
          (s: any) =>
            `00:00:0${Math.floor(s.start)}.000 --> 00:00:0${Math.floor(s.end)}.000\n${s.text}`,
        )
        .join("\n\n")
    );
  }
  if (format === "lrc") {
    return segs
      .map((s: any) => `[00:0${s.start.toFixed(2)}]${s.text}`)
      .join("\n");
  }
  if (format === "json") {
    return JSON.stringify(
      { fileName: source?.fileName || "sample.mp3", segments: segs },
      null,
      2,
    );
  }
  if (format === "txt") {
    return segs.map((s: any) => s.text).join(" ");
  }
  return `# Transcript: ${source?.fileName || "sample.mp3"}\n\n${segs.map((s: any) => `- [${s.start.toFixed(1)}s] ${s.text}`).join("\n")}`;
}

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({
    terminalShell: () => "posix",
    terminalWsl: () => ({}),
    terminalAvailable: () => false,
    typeInTerminal: () => false,
    showTerminal() {},
    hideTerminal() {},
    toggleTerminal() {},
    wireTerminal() {},
    isTerminalOpen: () => false,
  }));
  mkdirSync(work, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(work, "interview.mp3"), "fake-mp3");
  writeFileSync(join(work, "meeting.mov"), "fake-mov");
  writeFileSync(join(work, "notes.txt"), "plain text file");

  server = startFileManagerServer({
    port: 0,
    token: "ui-token",
    context: {
      home,
      dataDir,
      launch: async () => {},
    },
  });

  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(
    join(import.meta.dir, "..", "resources", "file_manager", "index.html"),
    "utf8",
  )
    .replace(/__FM_TOKEN__/g, "ui-token")
    .replace(/__FM_PLATFORM__/g, process.platform)
    .replace(/__FM_PHONON__/g, "1")
    .replace(/__FM_START__/g, "")
    .replace(/__FM_NONCE__/g, "n");

  dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
  win = dom.window;
  doc = win.document;

  const g = globalThis as any;
  for (const k of GLOBALS) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter(
    (x) =>
      x !== "fetch" &&
      x !== "ResizeObserver" &&
      x !== "CSS" &&
      x !== "MediaRecorder" &&
      x !== "AudioContext" &&
      x !== "Audio" &&
      x !== "Blob",
  )) {
    const val = win[k];
    Object.defineProperty(g, k, {
      value:
        typeof val === "function" && !/^[A-Z]/.test(k) ? val.bind(win) : val,
      configurable: true,
      writable: true,
    });
  }

  Object.defineProperty(g, "ResizeObserver", {
    value: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(g, "CSS", {
    value: { escape: (s: string) => s.replace(/["\\]/g, "\\$&") },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(g, "Blob", {
    value: win.Blob,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(g, "Audio", {
    value: win.Audio,
    configurable: true,
    writable: true,
  });
  win.HTMLCanvasElement.prototype.getContext = () => null;

  // Mock HTMLMediaElement playback properties for JSDOM segment click-to-seek tests
  const mp = win.HTMLMediaElement.prototype;
  for (const [k, d] of [
    ["currentTime", 0],
    ["duration", 15],
  ] as const) {
    Object.defineProperty(mp, k, {
      get() {
        return (this.__m ??= {})[k] ?? d;
      },
      set(v) {
        (this.__m ??= {})[k] = v;
      },
      configurable: true,
    });
  }
  Object.defineProperty(mp, "paused", {
    get() {
      return (this.__m ??= {}).paused !== false;
    },
    configurable: true,
  });
  mp.play = function () {
    (this.__m ??= {}).paused = false;
    (this.__m ??= {}).playCount = ((this.__m ??= {}).playCount || 0) + 1;
    this.dispatchEvent(new win.Event("play"));
    return Promise.resolve();
  };
  mp.pause = function () {
    (this.__m ??= {}).paused = true;
    this.dispatchEvent(new win.Event("pause"));
  };
  win.Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(win.HTMLElement.prototype, "offsetParent", {
    get() {
      return win.document.body;
    },
    configurable: true,
  });

  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", {
    value: async (u: any, o: any) => {
      const urlStr = String(u || "");
      if (urlStr.endsWith("/api/copytext")) {
        copied.push(JSON.parse(o.body).text);
        return Response.json({ ok: true, copied: true });
      }
      if (urlStr.includes("/api/transcribe/")) {
        const op = urlStr.slice(urlStr.indexOf("/api/") + 5);
        const body = o?.body ? JSON.parse(o.body) : {};
        apiRequests.push({ op, body });

        if (op === "transcribe/status") {
          return Response.json({
            ok: true,
            ready: true,
            recommendedEngine: "python-whisper",
            recommendedLabel: "Python Whisper (faster-whisper)",
            ffmpegAvailable: true,
            ffmpegPath: "/usr/bin/ffmpeg",
            ollamaAvailable: true,
            asrEnvInstalled: true,
            engines: [
              { id: "python-whisper", available: true },
              { id: "whisper-cli", available: false },
            ],
            supportedExtensions: ["mp3", "wav", "m4a", "mov", "mp4"],
            supportedFormats: ["md", "txt", "srt", "vtt", "lrc", "json"],
            models: [
              "openai/whisper-tiny",
              "openai/whisper-base",
              "openai/whisper-small",
            ],
            languages: ["auto", "en", "es", "fr"],
          });
        }
        if (op === "transcribe/run") {
          const fmt = body.format || "md";
          const results = (body.paths || []).map((p: string) => {
            const fileName = p.split(/[\\/]/).pop() || "audio.mp3";
            const formatted = mockFormatted(
              { fileName, segments: DEMO_SEGMENTS },
              fmt,
            );
            return {
              sourcePath: p,
              fileName,
              engine: body.engine === "auto" ? "python-whisper" : body.engine,
              model: body.model || "openai/whisper-base",
              language: body.language === "auto" ? "en" : body.language,
              durationSec: 9.0,
              elapsedMs: 310,
              wordCount: 22,
              text: DEMO_SEGMENTS.map((s) => s.text).join(" "),
              segments: DEMO_SEGMENTS,
              formatted,
              format: fmt,
              summary: body.summarize
                ? "Discussion covering synchronized audio playback and multi-format subtitle exports."
                : null,
              actionItems: body.summarize
                ? [
                    "Review generated SRT timestamps",
                    "Publish transcript to project docs",
                  ]
                : [],
              chapters: body.summarize
                ? [
                    { start: 0.0, title: "Studio Intro" },
                    { start: 5.8, title: "Export Formats" },
                  ]
                : [],
              savedPath: body.saveSidecar ? `${p}.${fmt}` : null,
            };
          });
          return Response.json({ ok: true, results, count: results.length });
        }
        if (op === "transcribe/format") {
          const fmt = body.format || "txt";
          return Response.json({
            ok: true,
            format: fmt,
            formatted: mockFormatted(body.source, fmt),
          });
        }
        if (op === "transcribe/save") {
          const fmt = body.format || "md";
          const outName = `${body.name || "transcript"}.${fmt}`;
          const savedPath = join(body.folder || work, outName);
          writeFileSync(savedPath, String(body.content ?? ""), "utf8");
          return Response.json({ ok: true, savedPath, name: outName });
        }
        if (op === "transcribe/install") {
          if (body.confirm !== true) {
            return Response.json(
              {
                ok: false,
                error: { code: "NEEDS_CONFIRM", message: "Confirm required" },
              },
              { status: 400 },
            );
          }
          return Response.json({
            ok: true,
            job: {
              id: "install-whisper-1",
              state: "done",
              title: "Install Whisper AI",
            },
          });
        }
        if (op === "transcribe/mic") {
          const fmt = body.options?.format || "md";
          const formatted = mockFormatted(
            { fileName: body.fileName, segments: DEMO_SEGMENTS },
            fmt,
          );
          return Response.json({
            ok: true,
            recordingPath: join(work, body.fileName || "mic.webm"),
            result: {
              sourcePath: join(work, body.fileName || "mic.webm"),
              fileName: body.fileName || "mic.webm",
              engine: "python-whisper",
              model: body.options?.model || "openai/whisper-base",
              language: "en",
              durationSec: 9.0,
              elapsedMs: 250,
              wordCount: 22,
              text: DEMO_SEGMENTS.map((s) => s.text).join(" "),
              segments: DEMO_SEGMENTS,
              formatted,
              format: fmt,
              summary: "Live microphone capture transcribed cleanly.",
              actionItems: ["Follow up on mic notes"],
              chapters: [],
              savedPath: null,
            },
          });
        }
      }
      if (urlStr.endsWith("/api/jobs/list")) {
        return Response.json({ ok: true, jobs: [] });
      }
      return realFetch(urlStr.startsWith("/") ? base + urlStr : u, o);
    },
    configurable: true,
    writable: true,
  });

  menus = await import("../resources/file_manager/ui/menus.js");
  menus.closeMenu();
  power = await import("../resources/file_manager/ui/power.js");
  power.resetPower();
  state = (await import("../resources/file_manager/ui/state.js")).state;
  api = await import("../resources/file_manager/ui/api.js");
  nav = await import("../resources/file_manager/ui/nav.js");
  selection = await import("../resources/file_manager/ui/selection.js");
  toolbar = await import("../resources/file_manager/ui/toolbar.js");
  sidebar = await import("../resources/file_manager/ui/sidebar.js");
  homeMod = await import("../resources/file_manager/ui/home.js");
  homeTiles = await import("../resources/file_manager/ui/homeTiles.js");
  commandPalette =
    await import("../resources/file_manager/ui/commandPalette.js");
  contextmenu = await import("../resources/file_manager/ui/contextmenu.js");
  await import("../resources/file_manager/ui/code.js");
  await import("../resources/file_manager/ui/phonon.js");
  transcribeMod = await import("../resources/file_manager/ui/transcribe.js");

  Object.assign(state, {
    platform: process.platform,
    sep: process.platform === "win32" ? "\\" : "/",
    home,
    cliUtilsDir: join(root, "cli"),
    places: [{ name: "Home", icon: "🏠", path: home }],
    drives: [],
    workspace: "files",
    powerOpen: false,
    search: null,
    loading: false,
    busy: 0,
    terminalOpen: false,
  });
  state.settings = (await api.call("settings")).settings;
  power.wirePower();
  toolbar.wireToolbar();
  sidebar.renderSidebar();
  homeTiles.registerHomeTiles();
  await nav.goTo(work, { push: false });
});

afterAll(async () => {
  await sleep(150);
  try {
    menus?.closeMenu?.();
    power?.resetPower?.();
  } catch {}
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const before = saved.get(k);
    if (before) Object.defineProperty(g, k, before);
    else delete g[k];
  }
  mock.restore();
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("Audio-to-Text AI Studio UI", () => {
  test("1. canTranscribeWithAi matches audio/video kinds and all 24 extensions", () => {
    for (const ext of [
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
    ]) {
      expect(
        transcribeMod.canTranscribeWithAi({
          name: `clip.${ext}`,
          isDir: false,
        }),
        ext,
      ).toBe(true);
      expect(
        transcribeMod.canTranscribeWithAi({
          name: `CLIP.${ext.toUpperCase()}`,
          isDir: false,
        }),
        ext,
      ).toBe(true);
    }
    expect(
      transcribeMod.canTranscribeWithAi({
        name: "blob",
        kind: "audio",
        isDir: false,
      }),
    ).toBe(true);
    expect(
      transcribeMod.canTranscribeWithAi({
        name: "blob",
        kind: "video",
        isDir: false,
      }),
    ).toBe(true);
    expect(
      transcribeMod.canTranscribeWithAi({ name: "song.mp3", isDir: true }),
    ).toBe(false);
    expect(
      transcribeMod.canTranscribeWithAi({ name: "readme.md", isDir: false }),
    ).toBe(false);
    expect(transcribeMod.canTranscribeWithAi(null)).toBe(false);
  });

  test("2. HTML, main.js, CSS tokens, Power Tab registration, sidebar, Home tiles, and Command Palette are wired", () => {
    const html = readFileSync(
      join(import.meta.dir, "..", "resources", "file_manager", "index.html"),
      "utf8",
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="/ui/transcribe.css" />',
    );
    expect(html.indexOf('id="viewbar-transcribe"')).toBeGreaterThan(
      html.indexOf('id="viewbar-phonon"'),
    );

    const mainJs = readFileSync(
      join(import.meta.dir, "..", "resources", "file_manager", "ui", "main.js"),
      "utf8",
    );
    expect(mainJs).toContain('import "./transcribe.js";');

    const css = readFileSync(
      join(
        import.meta.dir,
        "..",
        "resources",
        "file_manager",
        "ui",
        "transcribe.css",
      ),
      "utf8",
    );
    for (const token of [
      "var(--bg)",
      "var(--panel)",
      "var(--text)",
      "var(--muted)",
      "var(--accent)",
      "var(--border)",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).not.toContain("var(--fg");
    expect(css).not.toContain("var(--sel)");
    expect(css).toContain("prefers-reduced-motion: reduce");

    const tabs = power.listPowerTabs();
    const tTab = tabs.find((t: any) => t.id === "transcribe");
    expect(tTab).toMatchObject({
      id: "transcribe",
      label: "Audio to Text",
      icon: "🎙️",
      group: "media",
    });
    const phononIdx = tabs.findIndex((t: any) => t.id === "phonon");
    const transcribeIdx = tabs.findIndex((t: any) => t.id === "transcribe");
    expect(transcribeIdx).toBe(phononIdx + 1);

    // Toolbar button
    expect(q("#tool-transcribe")?.textContent).toContain("Audio to Text");

    // Sidebar item immediately after Ollama TTS
    const sideLabels = qa("#sidebar .side-item .sl").map((e: any) =>
      e.textContent.trim(),
    );
    const ttsIdx = sideLabels.indexOf("Ollama TTS");
    expect(ttsIdx).toBeGreaterThanOrEqual(0);
    expect(sideLabels[ttsIdx + 1]).toBe("Audio to Text");

    // Home tile
    const tile = homeMod
      .listHomeTiles()
      .find((t: any) => t.id === "tool-transcribe");
    expect(tile).toBeDefined();
    expect(tile.title).toBe("Audio to Text");
    expect(tile.text).toContain("SRT/VTT subtitles");

    // Command palette commands
    const catalog = commandPalette.buildPaletteCatalog();
    expect(catalog.some((c: any) => c.id === "act.transcribeAudio")).toBe(true);
    expect(catalog.some((c: any) => c.id === "act.transcribeSubtitles")).toBe(
      true,
    );
  });

  test("3. #viewbar-transcribe passes selected audio/video paths and show({ paths, format }) updates queue and format", async () => {
    const mp3Path = join(work, "interview.mp3");
    const txtPath = join(work, "notes.txt");
    selection.selectKeys([mp3Path, txtPath]);

    q("#viewbar-transcribe").click();
    await waitFor(
      () => q("#power-pane-transcribe"),
      2000,
      "transcribe pane mounted",
    );
    await sleep(40);

    const pane = q("#power-pane-transcribe");
    expect(pane.hidden).toBe(false);
    expect(q("#power-tab-transcribe").getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(q("#transcribe-engine-pill").textContent).toContain(
      "Python Whisper",
    );
    expect(q("#transcribe-ffmpeg-pill").textContent).toContain("FFmpeg Ready");
    expect(q("#transcribe-ollama-pill").textContent).toContain(
      "Ollama AI Summary",
    );

    // Only interview.mp3 should have been queued (not notes.txt)
    const chips = qa(".transcribe-file-chip", pane).map(
      (el: any) => el.textContent,
    );
    expect(chips.length).toBe(1);
    expect(chips[0]).toContain("interview.mp3");

    // Calling openPower("transcribe", { paths, format }) updates queue and format select
    const movPath = join(work, "meeting.mov");
    power.openPower("transcribe", { paths: [movPath], format: "srt" });
    await sleep(30);
    expect(q("#transcribe-format", pane).value).toBe("srt");
    expect(
      qa(".transcribe-file-chip", pane)
        .map((el: any) => el.textContent)
        .join(" "),
    ).toContain("meeting.mov");

    // Manual path add & chip removal
    const pathInput = q("#transcribe-path-input", pane);
    pathInput.value = mp3Path;
    q("#transcribe-add-path-btn", pane).click();
    expect(qa(".transcribe-file-chip", pane).length).toBe(2);
    qa(".transcribe-chip-remove", pane)[0].click();
    expect(qa(".transcribe-file-chip", pane).length).toBe(1);
  });

  test("4. Transcribe run renders player, clickable timestamped segments, timeupdate sync, format switching, and action buttons", async () => {
    const pane = q("#power-pane-transcribe");
    const mp3Path = join(work, "interview.mp3");
    power.openPower("transcribe", { paths: [mp3Path], format: "md" });
    await sleep(20);

    q("#transcribe-run-btn", pane).click();
    await waitFor(
      () => !q("#transcribe-results-body", pane).hidden,
      3000,
      "transcribe results displayed",
    );

    const audioEl = q("#transcribe-audio-player", pane);
    expect(audioEl.getAttribute("src")).toContain(encodeURIComponent(mp3Path));
    expect(q("#transcribe-result-tabs", pane).hidden).toBe(true);
    expect(q("#transcribe-result-tabs", pane).hasAttribute("role")).toBe(false);
    expect(q("#transcribe-result-panel", pane).hasAttribute("role")).toBe(
      false,
    );

    // Segments rendered with [MM:SS.s] stamps
    const segBtns = qa(".transcribe-seg-btn", pane);
    expect(segBtns.length).toBe(3);
    expect(segBtns[0].textContent).toContain("[00:00.0]");
    expect(segBtns[1].textContent).toContain("[00:02.5]");

    // Clicking segment 1 seeks <audio> and marks it active
    segBtns[1].click();
    expect(audioEl.currentTime).toBe(2.5);
    expect(segBtns[1].classList.contains("is-active")).toBe(true);
    expect(segBtns[1].getAttribute("aria-current")).toBe("true");

    // timeupdate at 6.2s highlights segment 2
    audioEl.currentTime = 6.2;
    audioEl.dispatchEvent(new win.Event("timeupdate"));
    expect(segBtns[2].classList.contains("is-active")).toBe(true);
    expect(segBtns[1].classList.contains("is-active")).toBe(false);

    // AI Summary, Action Items, Chapters rendered
    expect(q("#transcribe-insights", pane).hidden).toBe(false);
    expect(q("#transcribe-insights", pane).textContent).toContain(
      "synchronized audio playback",
    );
    expect(q("#transcribe-insights", pane).textContent).toContain(
      "Review generated SRT timestamps",
    );
    expect(q("#transcribe-insights", pane).textContent).toContain(
      "Export Formats",
    );

    // Format switching calls transcribe/format and updates preview immediately
    const fmtSelect = q("#transcribe-format", pane);
    fmtSelect.value = "vtt";
    fmtSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    await waitFor(
      () => q("#transcribe-preview", pane).value.startsWith("WEBVTT"),
      2000,
      "VTT reformat",
    );
    expect(q("#transcribe-format-badge", pane).textContent).toBe(".VTT");

    // Copy button
    q("#transcribe-copy-btn", pane).click();
    await waitFor(
      () => copied.some((t) => t.startsWith("WEBVTT")),
      2000,
      "copied VTT",
    );

    // Save to current folder enables Open in Code Editor
    expect(q("#transcribe-open-code-btn", pane).disabled).toBe(true);
    q("#transcribe-save-btn", pane).click();
    await waitFor(
      () => q("#transcribe-open-code-btn", pane).disabled === false,
      2000,
      "saved file enables open in code editor",
    );

    // Open in Code Editor
    q("#transcribe-open-code-btn", pane).click();
    await sleep(30);
    expect(power.activePowerTab()).toBe("code");

    // Switch back to transcribe and Send to Voice Reader
    power.openPower("transcribe");
    await sleep(20);
    q("#transcribe-send-phonon-btn", pane).click();
    await waitFor(
      () => q("#power-pane-phonon textarea"),
      2000,
      "phonon textarea mounted",
    );
    expect(power.activePowerTab()).toBe("phonon");
    expect(q("#power-pane-phonon textarea").value).toContain(
      "Welcome to Codecaine Audio to Text Studio.",
    );
  });

  test("5. 1-Click Install Local Whisper AI confirms with user before calling transcribe/install", async () => {
    power.openPower("transcribe");
    await sleep(20);
    const pane = q("#power-pane-transcribe");
    apiRequests.length = 0;

    q("#transcribe-install-btn", pane).click();
    await waitFor(() => q(".modal-backdrop .dialog"), 2000, "confirm dialog");
    expect(q(".modal-backdrop .dialog-title").textContent).toContain(
      "Install Local Whisper AI",
    );
    q(".modal-backdrop button.primary").click();

    await waitFor(
      () => apiRequests.some((r) => r.op === "transcribe/install"),
      2000,
      "transcribe/install call",
    );
    const installReq = apiRequests.find((r) => r.op === "transcribe/install")!;
    expect(installReq.body.confirm).toBe(true);
  });

  test("6. Live microphone recording sends audioBase64 to transcribe/mic and displays result", async () => {
    power.openPower("transcribe");
    await sleep(20);
    const pane = q("#power-pane-transcribe");

    const g = globalThis as any;
    let fakeTrackStopped = false;
    win.navigator.mediaDevices = {
      getUserMedia: async () => ({
        getTracks: () => [
          {
            stop: () => {
              fakeTrackStopped = true;
            },
          },
        ],
      }),
    };
    g.MediaRecorder = class {
      state = "inactive";
      ondataavailable: ((ev: any) => void) | null = null;
      onstop: (() => void) | null = null;
      static isTypeSupported(t: string) {
        return t === "audio/webm";
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new win.Blob(["fake-audio-bytes"], { type: "audio/webm" }),
        });
        this.onstop?.();
      }
    };

    q("#transcribe-mic-btn", pane).click();
    await waitFor(
      () => q("#transcribe-mic-btn", pane).textContent.includes("Stop"),
      2000,
      "recording started",
    );
    apiRequests.length = 0;
    q("#transcribe-mic-btn", pane).click();

    await waitFor(
      () => apiRequests.some((r) => r.op === "transcribe/mic"),
      3000,
      "transcribe/mic request",
    );
    expect(fakeTrackStopped).toBe(true);
    const micReq = apiRequests.find((r) => r.op === "transcribe/mic")!;
    expect(micReq.body.audioBase64.length).toBeGreaterThan(4);
    await waitFor(
      () => q("#transcribe-mic-status", pane).textContent.includes("complete"),
      2000,
      "mic transcription status",
    );
  });

  test("7. Right-click context menu shows Transcribe Audio to Text… and Generate Subtitles (.SRT) for audio/video files", async () => {
    menus.closeMenu();
    const mp3Entry = {
      name: "interview.mp3",
      path: join(work, "interview.mp3"),
      isDir: false,
      kind: "audio",
    };
    const txtEntry = {
      name: "notes.txt",
      path: join(work, "notes.txt"),
      isDir: false,
      kind: "text",
    };

    contextmenu.showEntryMenu([txtEntry], { x: 10, y: 10 });
    const txtLabels = qa(".menu .menu-item .menu-label").map(
      (e: any) => e.textContent,
    );
    expect(txtLabels).not.toContain("Transcribe Audio to Text…");
    expect(txtLabels).not.toContain("Generate Subtitles (.SRT)");
    menus.closeMenu();

    contextmenu.showEntryMenu([mp3Entry], { x: 10, y: 10 });
    const audioLabels = qa(".menu .menu-item .menu-label").map(
      (e: any) => e.textContent,
    );
    expect(audioLabels).toContain("Transcribe Audio to Text…");
    expect(audioLabels).toContain("Generate Subtitles (.SRT)");

    const srtBtn = qa(".menu .menu-item").find(
      (b: any) =>
        b.querySelector(".menu-label")?.textContent ===
        "Generate Subtitles (.SRT)",
    );
    srtBtn.click();
    await sleep(30);

    expect(power.activePowerTab()).toBe("transcribe");
    const pane = q("#power-pane-transcribe");
    expect(q("#transcribe-format", pane).value).toBe("srt");
    expect(
      qa(".transcribe-file-chip", pane)
        .map((el: any) => el.textContent)
        .join(" "),
    ).toContain("interview.mp3");
  });

  test("8. Demo mode (?demo=1) renders clean synthetic session with zero real user paths", () => {
    const prevUrl = win.location.href;
    win.history.replaceState({}, "", `${prevUrl.split("?")[0]}?demo=1`);
    try {
      const tabDef = transcribeMod.buildDemoTranscribeSession();
      expect(tabDef.result.fileName).toBe("studio-architecture-note.m4a");
      expect(tabDef.result.segments.length).toBe(5);
      expect(tabDef.result.summary).toContain("Architecture review");
      expect(tabDef.result.actionItems.length).toBeGreaterThanOrEqual(3);

      // Mount fresh via power tab definition in demo=1
      power.resetPower();
      q("#power-body").replaceChildren();
      power.wirePower();
      power.openPower("transcribe");
      const pane = q("#power-pane-transcribe");
      expect(pane.textContent).toContain("studio-architecture-note.m4a");
      expect(pane.textContent).toContain("Whisper Neural ASR · whisper-base");
      expect(qa(".transcribe-seg-btn", pane).length).toBe(5);
      expect(pane.textContent).toContain("AI Executive Summary");
      expect(pane.textContent).toContain("Action Items");
      expect(pane.textContent).not.toContain("/Users/");
      expect(pane.textContent).not.toContain(root);
    } finally {
      win.history.replaceState({}, "", prevUrl);
    }
  });

  test("9. Cross-platform mediaBaseName, queue deduplication, audioUrlFor, and timestamp rollover work accurately", async () => {
    // 9a. mediaBaseName handles Windows, UNC, POSIX, mixed separators, trailing slashes regardless of state.sep
    const prevPlatform = state.platform;
    const prevSep = state.sep;
    try {
      state.sep = "/";
      expect(transcribeMod.mediaBaseName("C:\\Users\\Demo\\clip.mp3")).toBe(
        "clip.mp3",
      );
      expect(transcribeMod.mediaBaseName("\\\\nas\\share\\clip.wav")).toBe(
        "clip.wav",
      );
      expect(transcribeMod.mediaBaseName("/home/demo/clip.flac")).toBe(
        "clip.flac",
      );
      expect(
        transcribeMod.mediaBaseName("C:/Users/Demo\\mixed/clip.m4a/"),
      ).toBe("clip.m4a");
      state.sep = "\\";
      expect(transcribeMod.mediaBaseName("/home/demo/clip.ogg///")).toBe(
        "clip.ogg",
      );

      // Dotfiles and extensionless files inside dotted folders must not falsely match
      expect(transcribeMod.canTranscribeWithAi("/home/demo/.mp3")).toBe(false);
      expect(
        transcribeMod.canTranscribeWithAi("C:\\Users\\Demo.mp3\\README"),
      ).toBe(false);
      expect(
        transcribeMod.canTranscribeWithAi("\\\\nas\\share\\recording.wav"),
      ).toBe(true);

      // 9b. Timestamp rounding rollover fix: 59.96s must format as [01:00.0], never [00:60.0]
      expect(transcribeMod.formatSegmentStamp(0)).toBe("[00:00.0]");
      expect(transcribeMod.formatSegmentStamp(59.96)).toBe("[01:00.0]");
      expect(transcribeMod.formatSegmentStamp(119.99)).toBe("[02:00.0]");
      expect(transcribeMod.formatSegmentStamp(3661.04)).toBe("[61:01.0]");

      // 9c. audioUrlFor supports playable audio & video containers (.mp4, .webm, .mov),
      // Windows/UNC paths, blob:, and blocks .mkv & microphone:// ephemeral URIs
      expect(transcribeMod.audioUrlFor("/home/demo/video.mp4")).toContain(
        "/api/raw?path=%2Fhome%2Fdemo%2Fvideo.mp4",
      );
      expect(transcribeMod.audioUrlFor("/home/demo/video.webm")).toContain(
        "/api/raw",
      );
      expect(transcribeMod.audioUrlFor("/home/demo/video.mov")).toContain(
        "/api/raw",
      );
      expect(transcribeMod.audioUrlFor("C:\\Users\\Demo\\clip.mp3")).toContain(
        "/api/raw",
      );
      expect(transcribeMod.audioUrlFor("\\\\nas\\share\\clip.wav")).toContain(
        "/api/raw",
      );
      expect(transcribeMod.audioUrlFor("blob:http://127.0.0.1/abc")).toBe(
        "blob:http://127.0.0.1/abc",
      );
      expect(transcribeMod.audioUrlFor("/home/demo/video.mkv")).toBe("");
      expect(transcribeMod.audioUrlFor("microphone://session-1")).toBe("");
      expect(transcribeMod.audioUrlFor("relative-ephemeral.wav")).toBe("");

      // 9d. Queue deduplication normalizes separators & respects OS case rules
      power.resetPower();
      q("#power-body").replaceChildren();
      power.wirePower();
      power.openPower("transcribe");
      const pane = q("#power-pane-transcribe");
      const inp = q("#transcribe-path-input", pane);
      const addBtn = q("#transcribe-add-path-btn", pane);
      const clearBtn = q("#transcribe-clear-queue-btn", pane);

      state.platform = "win32";
      state.sep = "\\";
      clearBtn.click();
      for (const p of [
        "C:\\Users\\Demo\\clip.mp3",
        "C:/Users/Demo/clip.mp3",
        "c:\\users\\demo\\CLIP.MP3",
        "\\\\nas\\share\\clip.wav",
        "//nas/share/CLIP.WAV",
      ]) {
        inp.value = p;
        addBtn.click();
      }
      expect(
        qa(".transcribe-chip-name", pane).map((el: any) => el.textContent),
      ).toEqual(["clip.mp3", "clip.wav"]);

      state.platform = "linux";
      state.sep = "/";
      clearBtn.click();
      for (const p of [
        "/home/demo/clip.flac",
        "/home/demo/Clip.flac",
        "/home/demo//clip.flac",
      ]) {
        inp.value = p;
        addBtn.click();
      }
      expect(
        qa(".transcribe-chip-name", pane).map((el: any) => el.textContent),
      ).toEqual(["clip.flac", "Clip.flac"]);
    } finally {
      state.platform = prevPlatform;
      state.sep = prevSep;
    }
  });

  test("10. renderStatusHeader merges structured { id, label } models & strings while preserving valid selection", async () => {
    const g = globalThis as any;
    const prevFetch = g.fetch;
    g.fetch = async (u: any, o: any) => {
      if (String(u || "").includes("/api/transcribe/status")) {
        return Response.json({
          ok: true,
          ready: true,
          recommendedEngine: "python-whisper",
          recommendedLabel: "Python Whisper AI",
          ffmpegAvailable: true,
          ffmpegPath: "/usr/bin/ffmpeg",
          ollamaAvailable: false,
          asrEnvInstalled: true,
          engines: [],
          supportedExtensions: ["mp3", "wav"],
          supportedFormats: ["md", "txt", "srt", "vtt", "lrc", "json"],
          models: [
            {
              id: "openai/whisper-tiny.en",
              label: "Whisper Tiny English (~75 MB · Fast EN)",
            },
            {
              id: "openai/whisper-base",
              label: "Whisper Base (~145 MB · Balanced)",
            },
            { id: "custom/no-label" },
            "openai/whisper-medium",
          ],
          languages: [{ code: "auto", label: "Auto-Detect" }],
        });
      }
      return prevFetch(u, o);
    };

    try {
      power.resetPower();
      q("#power-body").replaceChildren();
      power.wirePower();
      power.openPower("transcribe", { model: "openai/whisper-tiny.en" });
      const pane = q("#power-pane-transcribe");
      await waitFor(
        () =>
          [...q("#transcribe-model", pane).options].some(
            (o: any) => o.value === "openai/whisper-medium",
          ),
        2000,
        "structured models rendered",
      );

      const opts = [...q("#transcribe-model", pane).options].map((o: any) => ({
        value: o.value,
        label: o.textContent,
      }));
      expect(opts).toContainEqual({
        value: "openai/whisper-tiny.en",
        label: "Whisper Tiny English (~75 MB · Fast EN)",
      });
      expect(opts).toContainEqual({
        value: "openai/whisper-base",
        label: "Whisper Base (~145 MB · Balanced)",
      });
      expect(opts).toContainEqual({
        value: "custom/no-label",
        label: "custom/no-label",
      });
      expect(opts).toContainEqual({
        value: "openai/whisper-medium",
        label: "openai/whisper-medium",
      });
      expect(q("#transcribe-model", pane).value).toBe("openai/whisper-tiny.en");
    } finally {
      g.fetch = prevFetch;
    }
  });

  test("11. applyPayload supports autoStart and all config options, multi-file ARIA tab keyboard nav, formatSeq race guard, and .mkv preview safety", async () => {
    power.resetPower();
    q("#power-body").replaceChildren();
    power.wirePower();
    apiRequests.length = 0;

    const mkvPath = join(work, "session.mkv");
    const mp3Path = join(work, "interview.mp3");
    writeFileSync(mkvPath, "fake-mkv");

    power.openPower("transcribe", {
      paths: [mp3Path, mkvPath],
      engine: "python-whisper",
      model: "openai/whisper-small",
      language: "es",
      format: "srt",
      enhanceAudio: true,
      summarize: false,
      saveSidecar: true,
      autoStart: true,
    });

    const pane = q("#power-pane-transcribe");
    await waitFor(
      () =>
        apiRequests.some((r) => r.op === "transcribe/run") &&
        !q("#transcribe-results-body", pane).hidden,
      3000,
      "autoStart batch transcription completed",
    );

    const runReq = apiRequests.find((r) => r.op === "transcribe/run")!;
    expect(runReq.body).toMatchObject({
      paths: [mp3Path, mkvPath],
      engine: "python-whisper",
      model: "openai/whisper-small",
      language: "es",
      format: "srt",
      enhanceAudio: true,
      summarize: false,
      saveSidecar: true,
    });
    expect(q("#transcribe-engine", pane).value).toBe("python-whisper");
    expect(q("#transcribe-model", pane).value).toBe("openai/whisper-small");
    expect(q("#transcribe-language", pane).value).toBe("es");
    expect(q("#transcribe-format", pane).value).toBe("srt");
    expect(q("#transcribe-enhance", pane).checked).toBe(true);
    expect(q("#transcribe-summarize", pane).checked).toBe(false);
    expect(q("#transcribe-save-sidecar", pane).checked).toBe(true);

    // Multi-file ARIA tablist + keyboard navigation to .mkv tab
    const tablist = q("#transcribe-result-tabs", pane);
    expect(tablist.getAttribute("role")).toBe("tablist");
    const tabs = qa('[role="tab"]', tablist);
    expect(tabs.length).toBe(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(q("#transcribe-result-panel", pane).getAttribute("role")).toBe(
      "tabpanel",
    );

    // ArrowRight switches to Tab 1 (session.mkv) which must NOT set <audio src> to .mkv
    tablist.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    const tabsAfterRight = qa('[role="tab"]', tablist);
    expect(tabsAfterRight[1].getAttribute("aria-selected")).toBe("true");
    expect(tabsAfterRight[0].getAttribute("aria-selected")).toBe("false");
    expect(q("#transcribe-audio-player", pane).hasAttribute("src")).toBe(false);
    expect(q("#transcribe-player-note", pane).hidden).toBe(false);
    expect(q("#transcribe-player-note", pane).textContent).toContain(".mkv");

    // ArrowLeft switches back to Tab 0 (interview.mp3)
    tablist.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    const tabsAfterLeft = qa('[role="tab"]', tablist);
    expect(tabsAfterLeft[0].getAttribute("aria-selected")).toBe("true");
    expect(q("#transcribe-audio-player", pane).getAttribute("src")).toContain(
      encodeURIComponent(mp3Path),
    );

    // formatSeq race guard: slow earlier response must not overwrite newer format response
    const g = globalThis as any;
    const prevFetch = g.fetch;
    let resolveFirst: ((r: Response) => void) | null = null;
    let fmtCall = 0;
    g.fetch = async (u: any, o: any) => {
      if (String(u || "").includes("/api/transcribe/format")) {
        fmtCall++;
        const n = fmtCall;
        if (n === 1) {
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Response.json({
          ok: true,
          format: "lrc",
          formatted: "[00:00.00]Newer LRC output",
        });
      }
      return prevFetch(u, o);
    };
    try {
      const fmtSel = q("#transcribe-format", pane);
      fmtSel.value = "txt";
      fmtSel.dispatchEvent(new win.Event("change", { bubbles: true }));
      await sleep(10);
      fmtSel.value = "lrc";
      fmtSel.dispatchEvent(new win.Event("change", { bubbles: true }));
      await waitFor(
        () =>
          q("#transcribe-preview", pane).value === "[00:00.00]Newer LRC output",
        2000,
        "newer LRC format applied",
      );
      resolveFirst!(
        Response.json({
          ok: true,
          format: "txt",
          formatted: "STALE TXT SHOULD BE IGNORED",
        }),
      );
      await sleep(30);
      expect(q("#transcribe-preview", pane).value).toBe(
        "[00:00.00]Newer LRC output",
      );
      expect(q("#transcribe-format-badge", pane).textContent).toBe(".LRC");
    } finally {
      g.fetch = prevFetch;
    }
  });

  test("12. transcribe.css includes #app.power-max clearance and ephemeral mic uses blob URL instead of /api/raw", async () => {
    const css = readFileSync(
      join(
        import.meta.dir,
        "..",
        "resources",
        "file_manager",
        "ui",
        "transcribe.css",
      ),
      "utf8",
    );
    expect(css).toMatch(
      /#app\.power-max\s+\.transcribe-root\s*\{[^}]*padding-top:/,
    );

    const g = globalThis as any;
    const prevFetch = g.fetch;
    const prevCreate = g.URL?.createObjectURL;
    const prevRevoke = g.URL?.revokeObjectURL;
    let revoked: string[] = [];
    if (g.URL) {
      g.URL.createObjectURL = () => "blob:http://127.0.0.1/ephemeral-mic-1";
      g.URL.revokeObjectURL = (u: string) => revoked.push(u);
    }
    g.fetch = async (u: any, o: any) => {
      if (String(u || "").includes("/api/transcribe/mic")) {
        return Response.json({
          ok: true,
          recordingPath: null,
          result: {
            sourcePath: "microphone://ephemeral",
            fileName: "mic-ephemeral.webm",
            engine: "python-whisper",
            model: "openai/whisper-base",
            language: "en",
            durationSec: 2.0,
            elapsedMs: 120,
            wordCount: 3,
            text: "Ephemeral mic test.",
            segments: [{ start: 0, end: 2.0, text: "Ephemeral mic test." }],
            formatted: "Ephemeral mic test.\n",
            format: "txt",
            summary: null,
            actionItems: [],
            chapters: [],
            savedPath: null,
          },
        });
      }
      return prevFetch(u, o);
    };

    try {
      power.openPower("transcribe");
      const pane = q("#power-pane-transcribe");
      win.navigator.mediaDevices = {
        getUserMedia: async () => ({
          getTracks: () => [{ stop() {} }],
        }),
      };
      g.MediaRecorder = class {
        state = "inactive";
        ondataavailable: ((ev: any) => void) | null = null;
        onstop: (() => void) | null = null;
        static isTypeSupported(t: string) {
          return t === "audio/webm";
        }
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          this.ondataavailable?.({
            data: new win.Blob(["mic-bytes"], { type: "audio/webm" }),
          });
          this.onstop?.();
        }
      };

      q("#transcribe-mic-btn", pane).click();
      await waitFor(
        () => q("#transcribe-mic-btn", pane).textContent.includes("Stop"),
        2000,
        "mic started",
      );
      q("#transcribe-mic-btn", pane).click();
      await waitFor(
        () =>
          q("#transcribe-preview", pane).value.includes("Ephemeral mic test."),
        2000,
        "ephemeral mic result rendered",
      );
      expect(q("#transcribe-audio-player", pane).getAttribute("src")).toBe(
        "blob:http://127.0.0.1/ephemeral-mic-1",
      );
    } finally {
      g.fetch = prevFetch;
      if (g.URL) {
        if (prevCreate) g.URL.createObjectURL = prevCreate;
        else delete g.URL.createObjectURL;
        if (prevRevoke) g.URL.revokeObjectURL = prevRevoke;
        else delete g.URL.revokeObjectURL;
      }
    }
  });
});
