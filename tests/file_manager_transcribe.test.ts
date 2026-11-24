import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext } from "../src/features/filemanager/fmCore";
import {
  encodeFloat32SamplesToWav,
  runBionicWhisper,
} from "../src/features/filemanager/fmBionic";
import { routePlainEnglishRequest } from "../src/features/filemanager/fmOllama";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import {
  TRANSCRIBE_MEDIA_EXTS,
  formatTranscriptOutput,
  getTranscribeStatus,
  isMacOsSpeechBundleAuthorized,
  isTranscribableMediaPath,
  parseWavHeaderInfo,
  runLocalAsrEngine,
  startInstallLocalWhisperJob,
  transcribeAudioPaths,
  transcribeMicrophoneRecording,
  type TranscribeHooks,
  type TranscribeSegment,
} from "../src/features/filemanager/fmTranscribe";

function writeWinMockExe(outExe: string, tsSource: string) {
  const srcPath = `${outExe}.src.ts`;
  writeFileSync(srcPath, tsSource);
  const res = Bun.spawnSync([
    process.execPath,
    "build",
    "--compile",
    srcPath,
    "--outfile",
    outExe,
  ]);
  if (res.exitCode !== 0) {
    throw new Error(
      `Failed to compile mock exe ${outExe}: ${res.stderr.toString()}`,
    );
  }
}

function createTestWavBuffer(
  durationSec = 1.5,
  sampleRate = 16000,
): Uint8Array {
  const sampleCount = Math.max(160, Math.round(durationSec * sampleRate));
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
  }
  return encodeFloat32SamplesToWav(samples, sampleRate);
}

describe("Codecaine File Manager — AI Audio-to-Text & Subtitle Engine Backend", () => {
  let tempRoot = "";
  let homeDir = "";
  let docsDir = "";
  let dataDir = "";
  let emptyBin = "";
  let mockAsrServer: ReturnType<typeof Bun.serve>;
  let mockAsrUrl = "";
  let mockOllamaServer: ReturnType<typeof Bun.serve>;
  let mockOllamaUrl = "";
  let fmServer: ReturnType<typeof startFileManagerServer>;
  let fmUrl = "";
  let fmToken = "";
  let prevAsrBaseUrl: string | undefined;
  let prevOllamaHost: string | undefined;

  const sampleSegments: TranscribeSegment[] = [
    { start: 0, end: 2.5, text: "Welcome to Codecaine File Manager." },
    {
      start: 2.5,
      end: 65.432,
      text: "Here is a cross-platform speech transcript.",
    },
    { start: 3661.005, end: 3664.5, text: "Hour rollover timestamp check." },
  ];

  beforeAll(async () => {
    prevAsrBaseUrl = process.env.FM_ASR_BASE_URL;
    prevOllamaHost = process.env.OLLAMA_HOST;

    tempRoot = join(tmpdir(), `fm_transcribe_test_${Date.now()}`);
    homeDir = join(tempRoot, "home");
    docsDir = join(homeDir, "docs");
    dataDir = join(tempRoot, "data");
    emptyBin = join(tempRoot, "empty-bin");

    mkdirSync(docsDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(emptyBin, { recursive: true });

    writeFileSync(join(docsDir, "sample.wav"), createTestWavBuffer(2.0, 16000));
    writeFileSync(
      join(docsDir, "meeting.wav"),
      createTestWavBuffer(3.0, 16000),
    );
    writeFileSync(join(docsDir, "clip.m4a"), Buffer.from("fake-m4a-bytes"));

    // Mock OpenAI-compatible ASR server (/v1/models + /v1/audio/transcriptions)
    mockAsrServer = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/v1/models") {
          return Response.json({
            object: "list",
            data: [{ id: "whisper-1", object: "model" }],
          });
        }
        if (
          url.pathname === "/v1/audio/transcriptions" &&
          req.method === "POST"
        ) {
          const form = await req.formData();
          const file = form.get("file");
          const model = String(form.get("model") || "whisper-1");
          const fileName =
            file && typeof file === "object" && "name" in file
              ? String((file as File).name)
              : "audio.wav";
          return Response.json({
            text: `Transcribed ${fileName} via OpenAI ASR.`,
            language: "en",
            duration: 2.0,
            model,
            segments: [
              {
                start: 0,
                end: 1.0,
                text: `Transcribed ${fileName}`,
              },
              {
                start: 1.0,
                end: 2.0,
                text: "via OpenAI ASR.",
              },
            ],
          });
        }
        return new Response("Not Found", { status: 404 });
      },
    });
    mockAsrUrl = `http://127.0.0.1:${mockAsrServer.port}`;
    process.env.FM_ASR_BASE_URL = mockAsrUrl;

    // Mock Ollama server (/api/tags + /api/chat) for summarization & lfm3-omni
    mockOllamaServer = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/tags") {
          return Response.json({
            models: [
              { name: "qwen3.5:4b", model: "qwen3.5:4b" },
              { name: "lfm3-omni:latest", model: "lfm3-omni:latest" },
              { name: "phonon:latest", model: "phonon:latest" },
            ],
          });
        }
        if (url.pathname === "/api/chat" && req.method === "POST") {
          const body = (await req.json()) as any;
          if (String(body?.model || "").includes("lfm3-omni")) {
            return Response.json({
              model: body.model,
              message: {
                role: "assistant",
                content: "Transcribed via Ollama LFM3-Omni multimodal audio.",
              },
              done: true,
            });
          }
          return Response.json({
            model: body.model || "qwen3.5:4b",
            message: {
              role: "assistant",
              content: JSON.stringify({
                summary:
                  "Key discussion covering cross-platform audio transcription architecture.",
                actionItems: [
                  "Ship local Whisper AI installer",
                  "Verify subtitle export formats",
                ],
                chapters: [
                  { start: 0, title: "Introduction" },
                  { start: 2.5, title: "Architecture Walkthrough" },
                ],
              }),
            },
            done: true,
          });
        }
        return new Response("Not Found", { status: 404 });
      },
    });
    mockOllamaUrl = `http://127.0.0.1:${mockOllamaServer.port}`;
    process.env.OLLAMA_HOST = mockOllamaUrl;

    fmServer = startFileManagerServer({
      port: 0,
      host: "127.0.0.1",
      token: "test-transcribe-token",
      context: {
        home: homeDir,
        sandboxRoot: homeDir,
        dataDir,
        toolDirs: [emptyBin],
        ollama: { baseUrl: mockOllamaUrl },
      },
    });
    fmUrl = `http://127.0.0.1:${fmServer.port}`;
    fmToken = fmServer.token;
  });

  afterAll(() => {
    if (prevAsrBaseUrl === undefined) delete process.env.FM_ASR_BASE_URL;
    else process.env.FM_ASR_BASE_URL = prevAsrBaseUrl;
    if (prevOllamaHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = prevOllamaHost;

    try {
      fmServer?.stop(true);
    } catch {}
    try {
      mockAsrServer?.stop(true);
    } catch {}
    try {
      mockOllamaServer?.stop(true);
    } catch {}
    try {
      rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  async function apiCall(op: string, payload: Record<string, any> = {}) {
    const res = await fetch(`${fmUrl}/api/${op}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fm-token": fmToken,
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as any;
    return { status: res.status, json };
  }

  test("1. TRANSCRIBE_MEDIA_EXTS, isTranscribableMediaPath, and pure-TS WAV parser work", () => {
    const expectedExts = [
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
    for (const ext of expectedExts) {
      expect(TRANSCRIBE_MEDIA_EXTS.has(ext)).toBe(true);
      expect(isTranscribableMediaPath(`/media/note.${ext}`)).toBe(true);
      expect(
        isTranscribableMediaPath(`C:\\Clips\\VIDEO.${ext.toUpperCase()}`),
      ).toBe(true);
    }
    expect(isTranscribableMediaPath("notes.md")).toBe(false);
    expect(isTranscribableMediaPath("transcript.srt")).toBe(false);
    expect(isTranscribableMediaPath("README")).toBe(false);
    expect(isTranscribableMediaPath("")).toBe(false);

    const wav16k = createTestWavBuffer(2.0, 16000);
    const info16k = parseWavHeaderInfo(wav16k);
    expect(info16k.valid).toBe(true);
    expect(info16k.isPcm16kMono).toBe(true);
    expect(info16k.sampleRate).toBe(16000);
    expect(info16k.channels).toBe(1);
    expect(info16k.durationSec).toBeCloseTo(2.0, 2);

    const wav44k = createTestWavBuffer(1.0, 44100);
    const info44k = parseWavHeaderInfo(wav44k);
    expect(info44k.valid).toBe(true);
    expect(info44k.isPcm16kMono).toBe(false);
    expect(info44k.durationSec).toBeCloseTo(1.0, 2);

    expect(parseWavHeaderInfo(new Uint8Array([1, 2, 3, 4])).valid).toBe(false);
  });

  test("2. formatTranscriptOutput renders md, txt, srt, vtt, lrc, and json with exact timestamps", () => {
    const src = {
      fileName: "studio-note.wav",
      engine: "python-whisper",
      model: "openai/whisper-base",
      language: "en",
      durationSec: 3664.5,
      text: "Welcome to Codecaine File Manager. Here is a cross-platform speech transcript. Hour rollover timestamp check.",
      segments: sampleSegments,
      summary: "Short overview of the architecture.",
      actionItems: ["Review subtitles", "Ship release"],
      chapters: [{ start: 0, title: "Intro" }],
    };

    const srt = formatTranscriptOutput(src, "srt");
    expect(srt).toContain(
      "1\n00:00:00,000 --> 00:00:02,500\nWelcome to Codecaine File Manager.",
    );
    expect(srt).toContain(
      "2\n00:00:02,500 --> 00:01:05,432\nHere is a cross-platform speech transcript.",
    );
    expect(srt).toContain(
      "3\n01:01:01,005 --> 01:01:04,500\nHour rollover timestamp check.",
    );

    const vtt = formatTranscriptOutput(src, "vtt");
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:02.500");
    expect(vtt).toContain("00:01:05.432");
    expect(vtt).toContain("01:01:01.005 --> 01:01:04.500");

    const lrc = formatTranscriptOutput(src, "lrc");
    expect(lrc).toContain("[ti:studio-note.wav]");
    expect(lrc).toContain("[00:00.00]Welcome to Codecaine File Manager.");
    expect(lrc).toContain(
      "[00:02.50]Here is a cross-platform speech transcript.",
    );
    expect(lrc).toContain("[61:01.01]Hour rollover timestamp check.");

    const txt = formatTranscriptOutput(src, "txt");
    expect(txt.trim()).toBe(src.text);

    const md = formatTranscriptOutput(src, "md");
    expect(md).toContain("# Transcript: studio-note.wav");
    expect(md).toContain("## AI Summary");
    expect(md).toContain("Short overview of the architecture.");
    expect(md).toContain("## Action Items");
    expect(md).toContain("- [ ] Review subtitles");
    expect(md).toContain("## Chapters");
    expect(md).toContain("**00:00** — Intro");
    expect(md).toContain("## Timestamped Segments");

    const jsonStr = formatTranscriptOutput(src, "json");
    const parsed = JSON.parse(jsonStr);
    expect(parsed.fileName).toBe("studio-note.wav");
    expect(parsed.segments.length).toBe(3);
    expect(parsed.actionItems).toEqual(["Review subtitles", "Ship release"]);
  });

  test("3. transcribeAudioPaths supports TranscribeHooks, Ollama summarize + offline fallback, saveSidecar uniqueName, and sandbox bounds", async () => {
    const ctx = createContext({
      home: homeDir,
      sandboxRoot: homeDir,
      dataDir,
      toolDirs: [emptyBin],
      ollama: { baseUrl: mockOllamaUrl },
    });

    const hooks: TranscribeHooks = {
      async transcribeWav(wavPath, opts) {
        expect(existsSync(wavPath)).toBe(true);
        return {
          text: "Hello from Whisper hook test.",
          language: opts.language === "auto" ? "en" : opts.language,
          engine: "mock-hook",
          model: opts.model,
          segments: [
            { start: 0, end: 1.1, text: "Hello from" },
            { start: 1.1, end: 2.0, text: "Whisper hook test." },
          ],
        };
      },
    };

    const res1 = await transcribeAudioPaths(
      ctx,
      {
        paths: ["docs/sample.wav"],
        format: "md",
        summarize: true,
        saveSidecar: true,
      },
      hooks,
    );
    expect(res1.count).toBe(1);
    const first = res1.results[0]!;
    expect(first.engine).toBe("mock-hook");
    expect(first.wordCount).toBe(5);
    expect(first.durationSec).toBeCloseTo(2.0, 2);
    expect(first.summary).toContain("cross-platform audio transcription");
    expect(first.actionItems.length).toBe(2);
    expect(first.chapters.length).toBe(2);
    expect(first.savedPath).toBe(join(docsDir, "sample.md"));
    expect(existsSync(first.savedPath!)).toBe(true);

    // Second saveSidecar creates sample (2).md via uniqueName instead of overwriting
    const res2 = await transcribeAudioPaths(
      ctx,
      {
        paths: ["docs/sample.wav"],
        format: "md",
        summarize: false,
        saveSidecar: true,
      },
      hooks,
    );
    expect(res2.results[0]!.savedPath).toBe(join(docsDir, "sample (2).md"));
    expect(existsSync(join(docsDir, "sample (2).md"))).toBe(true);

    // Graceful no-op summarize fallback when Ollama is offline
    const offlineCtx = createContext({
      home: homeDir,
      sandboxRoot: homeDir,
      dataDir,
      toolDirs: [emptyBin],
      ollama: { baseUrl: "http://127.0.0.1:1" },
    });
    const offlineRes = await transcribeAudioPaths(
      offlineCtx,
      {
        paths: ["docs/sample.wav"],
        format: "srt",
        summarize: true,
      },
      hooks,
    );
    expect(offlineRes.results[0]!.summary).toBeNull();
    expect(offlineRes.results[0]!.actionItems).toEqual([]);
    expect(offlineRes.results[0]!.chapters).toEqual([]);
    expect(offlineRes.results[0]!.formatted).toContain(
      "00:00:00,000 --> 00:00:01,100",
    );

    // Sandbox traversal blocked
    await expect(
      transcribeAudioPaths(ctx, { paths: ["../../etc/passwd"] }, hooks),
    ).rejects.toMatchObject({ code: "PROTECTED_PATH" });
  });

  test("4. 6-tier runLocalAsrEngine supports whisper-cli, python-whisper, ollama-omni, companion sidecar, and fmBionic fallback", async () => {
    const tierRoot = join(tempRoot, "tiers");
    const tierHome = join(tierRoot, "home");
    const tierData = join(tierRoot, "data");
    const tierBin = join(tierRoot, "bin");
    mkdirSync(tierHome, { recursive: true });
    mkdirSync(tierData, { recursive: true });
    mkdirSync(tierBin, { recursive: true });

    const wavFile = join(tierHome, "voice.wav");
    writeFileSync(wavFile, createTestWavBuffer(1.2, 16000));

    // Companion sidecar test (no other engines available)
    const noToolsDir = join(tierRoot, "notools");
    mkdirSync(noToolsDir, { recursive: true });
    const prevAsr = process.env.FM_ASR_BASE_URL;
    process.env.FM_ASR_BASE_URL = "http://127.0.0.1:1";
    try {
      const sidecarSrt = join(tierHome, "voice.srt");
      writeFileSync(
        sidecarSrt,
        "1\n00:00:00,000 --> 00:00:01,200\nSidecar subtitle line.\n",
      );
      const compCtx = createContext({
        home: tierHome,
        sandboxRoot: tierHome,
        dataDir: tierData,
        toolDirs: [noToolsDir],
        ollama: { baseUrl: "http://127.0.0.1:1" },
      });
      const compRes = await runLocalAsrEngine(compCtx, wavFile, {
        engine: "companion",
      });
      expect(compRes.engine).toBe("companion:sidecar-srt");
      expect(compRes.text).toBe("Sidecar subtitle line.");

      rmSync(sidecarSrt);
      // Without any tier available, throws honest ASR_ENGINE_UNAVAILABLE
      await expect(runLocalAsrEngine(compCtx, wavFile)).rejects.toMatchObject({
        code: "ASR_ENGINE_UNAVAILABLE",
      });
    } finally {
      process.env.FM_ASR_BASE_URL = prevAsr;
    }

    // Tier 2: python-whisper via ctx.dataDir/asr-env/bin/python3 (or Scripts/python.exe on Windows)
    if (process.platform === "win32") {
      const asrEnvScripts = join(tierData, "asr-env", "Scripts");
      mkdirSync(asrEnvScripts, { recursive: true });
      writeWinMockExe(
        join(asrEnvScripts, "python.exe"),
        `if (process.argv.includes("-c")) process.exit(0);
console.log('@@FM_ASR_JSON@@{"ok":true,"engine":"python-whisper:faster-whisper","model":"openai/whisper-base","language":"en","durationSec":1.2,"text":"Mock Python Whisper output.","segments":[{"start":0,"end":1.2,"text":"Mock Python Whisper output."}]}');
`,
      );
    } else {
      const asrEnvBin = join(tierData, "asr-env", "bin");
      mkdirSync(asrEnvBin, { recursive: true });
      const mockPy = join(asrEnvBin, "python3");
      writeFileSync(
        mockPy,
        `#!/bin/sh
if [ "$1" = "-c" ]; then
  exit 0
fi
echo '@@FM_ASR_JSON@@{"ok":true,"engine":"python-whisper:faster-whisper","model":"openai/whisper-base","language":"en","durationSec":1.2,"text":"Mock Python Whisper output.","segments":[{"start":0,"end":1.2,"text":"Mock Python Whisper output."}]}'
`,
      );
      chmodSync(mockPy, 0o755);
    }

    const pyCtx = createContext({
      home: tierHome,
      sandboxRoot: tierHome,
      dataDir: tierData,
      toolDirs: [noToolsDir],
      ollama: { baseUrl: "http://127.0.0.1:1" },
    });
    const pyRes = await runLocalAsrEngine(pyCtx, wavFile, {
      engine: "python-whisper",
    });
    expect(pyRes.engine).toContain("python-whisper");
    expect(pyRes.text).toBe("Mock Python Whisper output.");

    // Verify fmBionic.runBionicWhisper falls back to runLocalAsrEngine when whisper-cli is absent
    const bionicRes = await runBionicWhisper(pyCtx, wavFile);
    expect(bionicRes.transcript).toBe("Mock Python Whisper output.");
    expect(bionicRes.engine).toContain("python-whisper");

    // Tier 1: whisper-cli mock executable in toolDirs
    if (process.platform === "win32") {
      writeWinMockExe(
        join(tierBin, "whisper-cli.exe"),
        `import { writeFileSync } from "node:fs";
const idx = process.argv.indexOf("-of");
const outPrefix = idx >= 0 ? process.argv[idx + 1] : "";
if (outPrefix) {
  writeFileSync(\`\${outPrefix}.json\`, '{"result":{"language":"en"},"transcription":[{"offsets":{"from":0,"to":1200},"text":"Whisper CLI mock result."}]}');
}
`,
      );
    } else {
      const mockWhisperCli = join(tierBin, "whisper-cli");
      writeFileSync(
        mockWhisperCli,
        `#!/bin/sh
OUT_PREFIX=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-of" ]; then
    OUT_PREFIX="$2"
    shift 2
  else
    shift
  fi
done
echo '{"result":{"language":"en"},"transcription":[{"offsets":{"from":0,"to":1200},"text":"Whisper CLI mock result."}]}' > "$OUT_PREFIX.json"
`,
      );
      chmodSync(mockWhisperCli, 0o755);
    }
    const cliCtx = createContext({
      home: tierHome,
      sandboxRoot: tierHome,
      dataDir: tierData,
      toolDirs: [tierBin],
      ollama: { baseUrl: "http://127.0.0.1:1" },
    });
    const cliRes = await runLocalAsrEngine(cliCtx, wavFile, {
      engine: "whisper-cli",
    });
    expect(cliRes.engine).toBe("whisper-cli:whisper-cli");
    expect(cliRes.text).toBe("Whisper CLI mock result.");

    // Tier 4: ollama-omni
    const omniCtx = createContext({
      home: tierHome,
      sandboxRoot: tierHome,
      dataDir: tierData,
      toolDirs: [noToolsDir],
      ollama: { baseUrl: mockOllamaUrl },
    });
    const omniRes = await runLocalAsrEngine(omniCtx, wavFile, {
      engine: "ollama-omni",
    });
    expect(omniRes.engine).toBe("ollama-omni");
    expect(omniRes.text).toContain("LFM3-Omni");
  });

  test("5. fmOllama routePlainEnglishRequest routes audio files with transcription/subtitle prompts to transcribe", async () => {
    const ctx = createContext({
      home: homeDir,
      sandboxRoot: homeDir,
      dataDir,
      toolDirs: [emptyBin],
      ollama: { baseUrl: mockOllamaUrl },
    });

    const srtRoute = await routePlainEnglishRequest(ctx, {
      prompt: "Transcribe this audio and generate .srt subtitles",
      paths: ["docs/sample.wav"],
      model: "qwen3.5:4b",
    });
    expect(srtRoute.routedCapability).toBe("transcribe");
    expect(srtRoute.result.count).toBe(1);
    expect(srtRoute.result.results[0].format).toBe("srt");
    expect(srtRoute.result.results[0].formatted).toContain(
      "00:00:00,000 --> 00:00:01,000",
    );

    const blankAudioRoute = await routePlainEnglishRequest(ctx, {
      prompt: "",
      paths: ["docs/meeting.wav"],
      model: "qwen3.5:4b",
    });
    expect(blankAudioRoute.routedCapability).toBe("transcribe");
    expect(blankAudioRoute.result.results[0].format).toBe("md");
    expect(blankAudioRoute.result.results[0].summary).toBeTruthy();
  });

  test("6. HTTP API: /api/transcribe/status, /run, /mic, /format, /save, and /install", async () => {
    // 6a. transcribe/status
    const statusRes = await apiCall("transcribe/status", {});
    expect(statusRes.status).toBe(200);
    expect(statusRes.json.ok).toBe(true);
    expect(statusRes.json.ready).toBe(true);
    expect(statusRes.json.recommendedEngine).toBe("openai-asr");
    expect(statusRes.json.ollamaAvailable).toBe(true);
    expect(Array.isArray(statusRes.json.engines)).toBe(true);
    expect(statusRes.json.engines.length).toBe(6);
    expect(statusRes.json.supportedFormats).toEqual([
      "md",
      "txt",
      "srt",
      "vtt",
      "lrc",
      "json",
    ]);
    expect(statusRes.json.supportedExtensions).toContain("m4a");
    expect(statusRes.json.supportedExtensions).toContain("caf");
    expect(Array.isArray(statusRes.json.models)).toBe(true);
    expect(Array.isArray(statusRes.json.languages)).toBe(true);

    // 6b. transcribe/run
    const runRes = await apiCall("transcribe/run", {
      paths: ["docs/sample.wav"],
      engine: "openai-asr",
      format: "vtt",
      summarize: true,
    });
    expect(runRes.status).toBe(200);
    expect(runRes.json.ok).toBe(true);
    expect(runRes.json.count).toBe(1);
    expect(runRes.json.results[0].engine).toBe("openai-asr");
    expect(runRes.json.results[0].format).toBe("vtt");
    expect(runRes.json.results[0].formatted).toContain("WEBVTT");
    expect(runRes.json.results[0].summary).toContain(
      "cross-platform audio transcription",
    );

    // 6c. transcribe/mic (also verify >1MB body passes raised 24MB limit)
    const bigWav = createTestWavBuffer(25.5, 16000); // ~816 KB binary -> >1 MB base64!
    const micB64 = Buffer.from(bigWav).toString("base64");
    expect(micB64.length).toBeGreaterThan(1024 * 1024);
    const micRes = await apiCall("transcribe/mic", {
      audioBase64: `data:audio/wav;base64,${micB64}`,
      mimeType: "audio/wav",
      fileName: "voice-memo.wav",
      saveRecordingFolder: "docs",
      options: {
        engine: "openai-asr",
        format: "lrc",
      },
    });
    expect(micRes.status).toBe(200);
    expect(micRes.json.ok).toBe(true);
    expect(micRes.json.recordingPath).toBe(join(docsDir, "voice-memo.wav"));
    expect(existsSync(micRes.json.recordingPath)).toBe(true);
    expect(micRes.json.result.format).toBe("lrc");
    expect(micRes.json.result.formatted).toContain("[00:00.00]");

    // 6d. transcribe/format
    const fmtRes = await apiCall("transcribe/format", {
      source: {
        fileName: "voice-memo.wav",
        engine: "openai-asr",
        model: "whisper-1",
        language: "en",
        durationSec: 5.0,
        text: "Hello world.",
        segments: [{ start: 0, end: 2.5, text: "Hello world." }],
      },
      format: "srt",
    });
    expect(fmtRes.status).toBe(200);
    expect(fmtRes.json.format).toBe("srt");
    expect(fmtRes.json.formatted).toContain(
      "1\n00:00:00,000 --> 00:00:02,500\nHello world.",
    );

    // 6e. transcribe/save with uniqueName + Recycle Bin protection + BAD_NAME check
    const save1 = await apiCall("transcribe/save", {
      content: fmtRes.json.formatted,
      folder: docsDir,
      name: "notes",
      format: "srt",
    });
    expect(save1.status).toBe(200);
    expect(save1.json.name).toBe("notes.srt");
    expect(save1.json.savedPath).toBe(join(docsDir, "notes.srt"));
    expect(readFileSync(save1.json.savedPath, "utf8")).toContain(
      "Hello world.",
    );

    const save2 = await apiCall("transcribe/save", {
      content: "Second copy",
      folder: docsDir,
      name: "notes.srt",
      format: "srt",
    });
    expect(save2.status).toBe(200);
    expect(save2.json.name).toBe("notes (2).srt");
    expect(save2.json.savedPath).toBe(join(docsDir, "notes (2).srt"));

    // Recycle Bin protection
    const trashSave = await apiCall("transcribe/save", {
      content: "Should fail",
      folder: fmServer.context.trashRoot,
      name: "blocked.txt",
      format: "txt",
    });
    expect(trashSave.status).toBe(400);
    expect(trashSave.json.error.code).toBe("PROTECTED");

    // Path traversal inside name blocked
    const badNameSave = await apiCall("transcribe/save", {
      content: "Should fail",
      folder: docsDir,
      name: "../escape.txt",
      format: "txt",
    });
    expect(badNameSave.status).toBe(400);
    expect(badNameSave.json.error.code).toBe("BAD_NAME");

    // 6f. transcribe/install requires confirm: true (NEEDS_CONFIRM -> 409)
    const noConfirm = await apiCall("transcribe/install", {});
    expect(noConfirm.status).toBe(409);
    expect(noConfirm.json.error.code).toBe("NEEDS_CONFIRM");

    // With confirm: true using mock python3 in an isolated FmContext, job runs cleanly
    const installRoot = join(tempRoot, "install-test");
    const installBin = join(installRoot, "bin");
    const installData = join(installRoot, "data");
    mkdirSync(installBin, { recursive: true });
    mkdirSync(installData, { recursive: true });
    if (process.platform === "win32") {
      writeWinMockExe(
        join(installBin, "python.exe"),
        `import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
if (args[0] === "-m" && args[1] === "venv" && args[2]) {
  const scripts = join(args[2], "Scripts");
  mkdirSync(scripts, { recursive: true });
  copyFileSync(process.execPath, join(scripts, "python.exe"));
}
`,
      );
    } else {
      const fakeSysPy = join(installBin, "python3");
      writeFileSync(
        fakeSysPy,
        `#!/bin/sh
if [ "$1" = "-m" ] && [ "$2" = "venv" ]; then
  /bin/mkdir -p "$3/bin"
  printf '#!/bin/sh\nexit 0\n' > "$3/bin/python3"
  /bin/chmod 755 "$3/bin/python3"
fi
exit 0
`,
      );
      chmodSync(fakeSysPy, 0o755);
    }

    const installCtx = createContext({
      home: installRoot,
      sandboxRoot: installRoot,
      dataDir: installData,
      toolDirs: [installBin],
    });
    const job = startInstallLocalWhisperJob(installCtx, {
      model: "openai/whisper-base",
    });
    const doneJob = await installCtx.jobs.whenDone(job.id);
    expect(doneJob.state).toBe("done");
    const expectedEnvPython =
      process.platform === "win32"
        ? join(installData, "asr-env", "Scripts", "python.exe")
        : join(installData, "asr-env", "bin", "python3");
    expect(existsSync(expectedEnvPython)).toBe(true);
  });

  test("7. transcribeMicrophoneRecording works with TranscribeHooks without saving recording", async () => {
    const ctx = createContext({
      home: homeDir,
      sandboxRoot: homeDir,
      dataDir,
      toolDirs: [emptyBin],
    });
    const wavB64 = Buffer.from(createTestWavBuffer(1.0, 16000)).toString(
      "base64",
    );
    const out = await transcribeMicrophoneRecording(
      ctx,
      {
        audioBase64: wavB64,
        mimeType: "audio/wav",
        fileName: "ephemeral-mic.wav",
        options: { format: "txt" },
      },
      {
        async transcribeWav() {
          return {
            text: "Ephemeral microphone capture.",
            engine: "mock-mic",
            model: "tiny",
            language: "en",
            segments: [
              { start: 0, end: 1.0, text: "Ephemeral microphone capture." },
            ],
          };
        },
      },
    );
    expect(out.recordingPath).toBeNull();
    expect(out.result.fileName).toBe("ephemeral-mic.wav");
    expect(out.result.text).toBe("Ephemeral microphone capture.");
    expect(out.result.formatted).toBe("Ephemeral microphone capture.\n");
  });

  test("8. Cross-platform os-native labels and macOS unbundled TCC crash guard work cleanly", async () => {
    const prevBaseUrl = process.env.FM_ASR_BASE_URL;
    const prevMacEnable = process.env.FM_ENABLE_MACOS_NATIVE_SPEECH;
    process.env.FM_ASR_BASE_URL = "http://127.0.0.1:1";
    delete process.env.FM_ENABLE_MACOS_NATIVE_SPEECH;

    const isoRoot = join(tempRoot, "os-native-guard");
    const isoHome = join(isoRoot, "home");
    const isoData = join(isoRoot, "data");
    const isoEmpty = join(isoRoot, "empty");
    mkdirSync(isoHome, { recursive: true });
    mkdirSync(isoData, { recursive: true });
    mkdirSync(isoEmpty, { recursive: true });

    try {
      // Linux label accuracy
      const linuxCtx = createContext({
        platform: "linux",
        home: isoHome,
        sandboxRoot: isoHome,
        dataDir: isoData,
        toolDirs: [isoEmpty],
        ollama: { baseUrl: "http://127.0.0.1:1" },
      });
      const linuxStatus = await getTranscribeStatus(linuxCtx);
      const linuxNative = linuxStatus.engines.find((e) => e.id === "os-native");
      expect(linuxNative).toBeDefined();
      expect(linuxNative!.label).toBe(
        "OS Native Speech Recognition (macOS / Windows)",
      );
      expect(linuxNative!.available).toBe(false);

      // Windows label accuracy
      const winCtx = createContext({
        platform: "win32",
        home: isoHome,
        sandboxRoot: isoHome,
        dataDir: isoData,
        toolDirs: [isoEmpty],
        ollama: { baseUrl: "http://127.0.0.1:1" },
      });
      const winStatus = await getTranscribeStatus(winCtx);
      const winNative = winStatus.engines.find((e) => e.id === "os-native");
      expect(winNative!.label).toBe("Windows Speech Recognition");

      // macOS unbundled run (no toolDirs, no FM_ENABLE_MACOS_NATIVE_SPEECH, not inside .app bundle)
      // Must NOT falsely report os-native ready or invoke TCC-blocked swift!
      const macUnbundledCtx = createContext({
        platform: "darwin",
        home: isoHome,
        sandboxRoot: isoHome,
        dataDir: isoData,
        ollama: { baseUrl: "http://127.0.0.1:1" },
      });
      const macStatus = await getTranscribeStatus(macUnbundledCtx);
      const macNative = macStatus.engines.find((e) => e.id === "os-native");
      expect(macNative!.label).toBe("macOS Speech Recognition");
      if (
        process.platform === "darwin" &&
        !isMacOsSpeechBundleAuthorized(process.execPath)
      ) {
        expect(macNative!.available).toBe(false);
        expect(macNative!.path).toBeNull();
        expect(macNative!.detail).toBe(
          "Requires .app bundle speech permission or FM_ENABLE_MACOS_NATIVE_SPEECH=1 (use Local Whisper AI)",
        );
        const wavPath = join(isoHome, "guard.wav");
        writeFileSync(wavPath, createTestWavBuffer(0.6, 16000));
        await expect(
          runLocalAsrEngine(macUnbundledCtx, wavPath, { engine: "os-native" }),
        ).rejects.toMatchObject({
          code: "ASR_ENGINE_UNAVAILABLE",
          message: expect.stringContaining(
            "Requires .app bundle speech permission",
          ),
        });
      } else if (!isMacOsSpeechBundleAuthorized(process.execPath)) {
        expect(macNative!.available).toBe(false);
        expect(macNative!.path).toBeNull();
        expect(macNative!.detail).toMatch(
          /Requires (\.app bundle speech permission|macOS with Swift CLI)/,
        );
      }

      // macOS explicit test toolDirs with mock swift binary enables os-native cleanly
      const swiftBin = join(isoRoot, "swift-bin");
      mkdirSync(swiftBin, { recursive: true });
      const mockSwift = join(swiftBin, "swift");
      writeFileSync(
        mockSwift,
        `#!/bin/sh
echo '{"text":"Mock Swift speech transcript.","segments":[{"start":0,"end":0.6,"text":"Mock Swift speech transcript."}]}'
`,
      );
      chmodSync(mockSwift, 0o755);

      const macToolCtx = createContext({
        platform: "darwin",
        home: isoHome,
        sandboxRoot: isoHome,
        dataDir: isoData,
        toolDirs: [swiftBin],
        ollama: { baseUrl: "http://127.0.0.1:1" },
      });
      const macToolStatus = await getTranscribeStatus(macToolCtx);
      expect(
        macToolStatus.engines.find((e) => e.id === "os-native")!.available,
      ).toBe(true);
      const wavPath = join(isoHome, "swift_test.wav");
      writeFileSync(wavPath, createTestWavBuffer(0.6, 16000));
      if (process.platform !== "win32") {
        const swiftRes = await runLocalAsrEngine(macToolCtx, wavPath, {
          engine: "os-native",
        });
        expect(swiftRes.engine).toBe("os-native:sfspeech");
        expect(swiftRes.text).toBe("Mock Swift speech transcript.");
      }

      // macOS .app bundle Info.plist detection helper (Contents/MacOS and Contents/Resources/runtime)
      const appMacOs = join(isoRoot, "Demo.app", "Contents", "MacOS");
      const appRuntime = join(
        isoRoot,
        "Demo.app",
        "Contents",
        "Resources",
        "runtime",
      );
      mkdirSync(appMacOs, { recursive: true });
      mkdirSync(appRuntime, { recursive: true });
      const fakeBundleBin = join(appMacOs, "Demo");
      const fakeRuntimeBun = join(appRuntime, "bun");
      writeFileSync(fakeBundleBin, "");
      writeFileSync(fakeRuntimeBun, "");
      const plistPath = join(isoRoot, "Demo.app", "Contents", "Info.plist");
      writeFileSync(
        plistPath,
        "<plist><dict><key>CFBundleName</key></dict></plist>",
      );
      expect(isMacOsSpeechBundleAuthorized(fakeBundleBin)).toBe(false);
      expect(isMacOsSpeechBundleAuthorized(fakeRuntimeBun)).toBe(false);
      writeFileSync(
        plistPath,
        "<plist><dict><key>NSSpeechRecognitionUsageDescription</key><string>Transcribe audio locally</string></dict></plist>",
      );
      expect(isMacOsSpeechBundleAuthorized(fakeBundleBin)).toBe(true);
      expect(isMacOsSpeechBundleAuthorized(fakeRuntimeBun)).toBe(true);
      expect(
        isMacOsSpeechBundleAuthorized(
          join(isoRoot, "Demo.app", "Contents", "Resources", "other", "bun"),
        ),
      ).toBe(false);
      expect(isMacOsSpeechBundleAuthorized("/usr/local/bin/bun")).toBe(false);

      // FM_ENABLE_MACOS_NATIVE_SPEECH=1 enables os-native on darwin host when swift is present
      if (process.platform === "darwin" && existsSync("/usr/bin/swift")) {
        process.env.FM_ENABLE_MACOS_NATIVE_SPEECH = "1";
        const enabledStatus = await getTranscribeStatus(macUnbundledCtx);
        expect(
          enabledStatus.engines.find((e) => e.id === "os-native")!.available,
        ).toBe(true);
      }
    } finally {
      if (prevBaseUrl === undefined) delete process.env.FM_ASR_BASE_URL;
      else process.env.FM_ASR_BASE_URL = prevBaseUrl;
      if (prevMacEnable === undefined)
        delete process.env.FM_ENABLE_MACOS_NATIVE_SPEECH;
      else process.env.FM_ENABLE_MACOS_NATIVE_SPEECH = prevMacEnable;
    }
  });

  test("9. Error paths, explicit engine error codes, UNC/Windows paths, and dotted-stem save work accurately", async () => {
    const ctx = createContext({
      home: homeDir,
      sandboxRoot: homeDir,
      dataDir,
      toolDirs: [emptyBin],
      ollama: { baseUrl: "http://127.0.0.1:1" },
    });

    // runLocalAsrEngine fails fast on invalid/missing paths
    await expect(runLocalAsrEngine(ctx, "")).rejects.toMatchObject({
      code: "BAD_PATH",
    });
    await expect(
      runLocalAsrEngine(ctx, join(docsDir, "does-not-exist.wav")),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Explicit python-whisper on non-WAV without FFmpeg preserves ASR_NEEDS_FFMPEG
    await expect(
      runLocalAsrEngine(ctx, join(docsDir, "clip.m4a"), {
        engine: "python-whisper",
      }),
    ).rejects.toMatchObject({ code: "ASR_NEEDS_FFMPEG" });

    // transcribeAudioPaths validates format/engine before creating outputDir
    const uncreatedOutDir = join(homeDir, "never-created-out");
    await expect(
      transcribeAudioPaths(ctx, {
        paths: ["docs/sample.wav"],
        format: "docx" as any,
        outputDir: uncreatedOutDir,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(existsSync(uncreatedOutDir)).toBe(false);

    // Windows / UNC path edge cases
    expect(isTranscribableMediaPath("\\\\nas\\share\\clip.wav")).toBe(true);
    expect(isTranscribableMediaPath("C:\\Users\\Demo\\dir.mp3\\README")).toBe(
      false,
    );
    expect(isTranscribableMediaPath("/home/demo/.mp3")).toBe(false);

    const winSandboxCtx = createContext({
      platform: "win32",
      home: "C:\\Users\\Demo",
      sandboxRoot: "C:\\Users\\Demo",
      dataDir: "C:\\Users\\Demo\\.bun_rad_studio",
      toolDirs: [emptyBin],
    });
    await expect(
      transcribeAudioPaths(winSandboxCtx, { paths: ["D:\\Other\\clip.wav"] }),
    ).rejects.toMatchObject({ code: "PROTECTED_PATH" });
    await expect(
      transcribeAudioPaths(winSandboxCtx, {
        paths: ["\\\\nas\\share\\clip.wav"],
      }),
    ).rejects.toMatchObject({ code: "PROTECTED_PATH" });

    // Dotted filename stem in transcribe/save appends .md instead of treating .2026 as transcript ext
    const dottedSave = await apiCall("transcribe/save", {
      content: "# Meeting 2026\n",
      folder: docsDir,
      name: "meeting.2026",
      format: "md",
    });
    expect(dottedSave.status).toBe(200);
    expect(dottedSave.json.name).toBe("meeting.2026.md");
    expect(existsSync(join(docsDir, "meeting.2026.md"))).toBe(true);
  });
});
