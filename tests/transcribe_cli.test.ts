import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildTranscribeCliApp,
  runTranscribeCli,
  type TranscribeHooks,
} from "../cli_apps/transcribe_cli";
import {
  isFileManagerCliInvocation,
  runFileManagerCli,
} from "../src/features/filemanager/fmCli";
import {
  ensureCliUtilsFolder,
  listCliUtils,
} from "../src/features/filemanager/fmCliUtils";
import { createContext } from "../src/features/filemanager/fmCore";
import { createWavHeader } from "../src/features/filemanager/fmPhonon";
import { rmDir } from "./helpers/rm";

const root = mkdtempSync(join(tmpdir(), "transcribe-cli-test-"));
const home = join(root, "home");
const dataDir = join(root, "data");
const toolDir = join(root, "tools");
const workDir = join(root, "work");

function makeSampleWavBuffer(
  durationSec = 1.2,
  sampleRate = 16000,
  freqHz = 220,
): Buffer {
  const numSamples = Math.max(160, Math.round(sampleRate * durationSec));
  const pcm = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const val = Math.sin(2 * Math.PI * freqHz * t) * 0.4;
    pcm.writeInt16LE(Math.round(val * 16000), i * 2);
  }
  const header = createWavHeader(pcm.length, sampleRate, 1, 16);
  return Buffer.concat([header, pcm]);
}

function makeMockHooks(
  seenOpts: Array<{
    wavPath: string;
    engine: string;
    model: string;
    language: string;
  }> = [],
): TranscribeHooks {
  return {
    transcribeWav: async (wavPath, opts) => {
      seenOpts.push({ wavPath, ...opts });
      return {
        text: "Hello world. Subtitles work cleanly across platforms.",
        language: opts.language === "auto" ? "en" : opts.language,
        durationSec: 3.4,
        engine: opts.engine === "auto" ? "python-whisper" : opts.engine,
        model: opts.model || "openai/whisper-base",
        segments: [
          { start: 0, end: 1.5, text: "Hello world." },
          {
            start: 1.5,
            end: 3.4,
            text: "Subtitles work cleanly across platforms.",
          },
        ],
      };
    },
  };
}

async function runCliCapture(
  args: string[],
  hooks?: TranscribeHooks,
  cwd = workDir,
) {
  const outLines: string[] = [];
  const errLines: string[] = [];
  const code = await runTranscribeCli(args, {
    stdout: (line) => outLines.push(line),
    stderr: (line) => errLines.push(line),
    cwd,
    contextOptions: { home, dataDir, toolDirs: [toolDir] },
    hooks,
  });
  return {
    code,
    stdout: outLines.join("\n"),
    stderr: errLines.join("\n"),
  };
}

beforeAll(() => {
  mkdirSync(home, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(toolDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });

  writeFileSync(join(workDir, "sample.wav"), makeSampleWavBuffer(1.2));
  writeFileSync(join(workDir, "second.wav"), makeSampleWavBuffer(0.8));
});

afterAll(() => {
  rmDir(root);
});

describe("Audio-to-Text CLI (`cli_apps/transcribe_cli.ts` & `fmCli`)", () => {
  test("isFileManagerCliInvocation recognizes transcribe, stt, and asr subcommands", () => {
    expect(isFileManagerCliInvocation(["transcribe", "a.mp3"])).toBe(true);
    expect(isFileManagerCliInvocation(["stt", "--status"])).toBe(true);
    expect(isFileManagerCliInvocation(["asr", "--help"])).toBe(true);
    expect(isFileManagerCliInvocation(["TRANSCRIBE", "clip.wav"])).toBe(true);
    expect(isFileManagerCliInvocation(["--server", "--port", "0"])).toBe(false);
  });

  test("runTranscribeCli --help and -h print complete usage and flags", async () => {
    const res = await runCliCapture(["--help"]);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe("");
    expect(res.stdout).toContain("transcribe");
    expect(res.stdout).toContain("--status");
    expect(res.stdout).toContain("--format");
    expect(res.stdout).toContain("--out");
    expect(res.stdout).toContain("--engine");
    expect(res.stdout).toContain("--model");
    expect(res.stdout).toContain("--lang");
    expect(res.stdout).toContain("--enhance");
    expect(res.stdout).toContain("--summarize");
    expect(res.stdout).toContain("--save");
    expect(res.stdout).toContain("--json");

    const shortRes = await runCliCapture(["-h"]);
    expect(shortRes.code).toBe(0);
    expect(shortRes.stdout).toContain("USAGE:");
  });

  test("runTranscribeCli --status and --status --json report backend readiness", async () => {
    const humanRes = await runCliCapture(["--status"]);
    expect(humanRes.code).toBe(0);
    expect(humanRes.stderr).toBe("");
    expect(humanRes.stdout).toContain("Audio-to-Text AI");
    expect(humanRes.stdout).toContain("Recommended Engine:");
    expect(humanRes.stdout).toContain("Output Formats:");

    const jsonRes = await runCliCapture(["--status", "--json"]);
    expect(jsonRes.code).toBe(0);
    const parsed = JSON.parse(jsonRes.stdout);
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.ready).toBe("boolean");
    expect(typeof parsed.recommendedEngine).toBe("string");
    expect(typeof parsed.recommendedLabel).toBe("string");
    expect(typeof parsed.ffmpegAvailable).toBe("boolean");
    expect(Array.isArray(parsed.supportedExtensions)).toBe(true);
    expect(Array.isArray(parsed.supportedFormats)).toBe(true);
    expect(parsed.supportedFormats).toContain("md");
    expect(parsed.supportedFormats).toContain("srt");
    expect(parsed).toHaveProperty("engines");
    expect(parsed).toHaveProperty("models");
    expect(parsed).toHaveProperty("languages");
  });

  test("runTranscribeCli transcribes temporary WAV with hooks.transcribeWav across srt, vtt, lrc, txt, md, json, and --out", async () => {
    const seenOpts: Array<{
      wavPath: string;
      engine: string;
      model: string;
      language: string;
    }> = [];
    const hooks = makeMockHooks(seenOpts);

    // 1. SRT output to stdout
    const srtRes = await runCliCapture(
      [
        "sample.wav",
        "--format",
        "srt",
        "--engine",
        "python-whisper",
        "--model",
        "openai/whisper-small",
        "--lang",
        "en",
      ],
      hooks,
    );
    expect(srtRes.code).toBe(0);
    expect(srtRes.stderr).toBe("");
    expect(srtRes.stdout).toContain(
      "1\n00:00:00,000 --> 00:00:01,500\nHello world.",
    );
    expect(srtRes.stdout).toContain(
      "2\n00:00:01,500 --> 00:00:03,400\nSubtitles work cleanly across platforms.",
    );
    expect(seenOpts[0]?.engine).toBe("python-whisper");
    expect(seenOpts[0]?.model).toBe("openai/whisper-small");
    expect(seenOpts[0]?.language).toBe("en");

    // 2. VTT, LRC, TXT formats (including --flag=value syntax)
    const vttRes = await runCliCapture(["sample.wav", "--format=vtt"], hooks);
    expect(vttRes.code).toBe(0);
    expect(vttRes.stdout).toContain("WEBVTT");
    expect(vttRes.stdout).toContain("00:00:00.000 --> 00:00:01.500");

    const lrcRes = await runCliCapture(
      ["sample.wav", "--format", "lrc"],
      hooks,
    );
    expect(lrcRes.code).toBe(0);
    expect(lrcRes.stdout).toContain("[00:00.00]");
    expect(lrcRes.stdout).toContain("Hello world.");

    const txtRes = await runCliCapture(
      ["sample.wav", "--format", "txt"],
      hooks,
    );
    expect(txtRes.code).toBe(0);
    expect(txtRes.stdout).toContain("Hello world.");

    // 3. Markdown output to stdout
    const mdRes = await runCliCapture(["sample.wav", "--format", "md"], hooks);
    expect(mdRes.code).toBe(0);
    expect(mdRes.stdout).toContain("sample.wav");
    expect(mdRes.stdout).toContain("Hello world.");
    expect(mdRes.stdout).toContain("Subtitles work cleanly across platforms.");

    // 4. Structured JSON output to stdout
    const jsonRes = await runCliCapture(
      ["sample.wav", "--format", "md", "--json", "--enhance", "--summarize"],
      hooks,
    );
    expect(jsonRes.code).toBe(0);
    const jsonPayload = JSON.parse(jsonRes.stdout);
    expect(jsonPayload.ok).toBe(true);
    expect(jsonPayload.count).toBe(1);
    expect(jsonPayload.results).toHaveLength(1);
    expect(jsonPayload.results[0].fileName).toBe("sample.wav");
    expect(jsonPayload.results[0].text).toContain("Hello world.");
    expect(jsonPayload.results[0].segments).toHaveLength(2);
    expect(jsonPayload.results[0].wordCount).toBeGreaterThan(0);

    // 5. --out single file output (relative to cwd)
    const outFileRel = "out/custom_transcript.md";
    const outFileAbs = join(workDir, outFileRel);
    const outRes = await runCliCapture(
      ["sample.wav", "--format", "md", "--out", outFileRel],
      hooks,
    );
    expect(outRes.code).toBe(0);
    expect(existsSync(outFileAbs)).toBe(true);
    const writtenMd = readFileSync(outFileAbs, "utf8");
    expect(writtenMd).toContain("sample.wav");
    expect(writtenMd).toContain("Hello world.");

    // 6. --out directory output with multiple files
    const batchOutDir = join(workDir, "batch_subs");
    const batchRes = await runCliCapture(
      ["sample.wav", "second.wav", "--format", "srt", "--out", batchOutDir],
      hooks,
    );
    expect(batchRes.code).toBe(0);
    expect(existsSync(join(batchOutDir, "sample.srt"))).toBe(true);
    expect(existsSync(join(batchOutDir, "second.srt"))).toBe(true);
    expect(readFileSync(join(batchOutDir, "sample.srt"), "utf8")).toContain(
      "00:00:00,000 --> 00:00:01,500",
    );

    // 7. --save sidecar next to source file
    const sidecarInput = join(workDir, "sidecar_clip.wav");
    writeFileSync(sidecarInput, makeSampleWavBuffer(0.6));
    const saveRes = await runCliCapture(
      [sidecarInput, "--format", "srt", "--save", "--json"],
      hooks,
    );
    expect(saveRes.code).toBe(0);
    const saveJson = JSON.parse(saveRes.stdout);
    expect(saveJson.results[0].savedPath).toBeTruthy();
    expect(existsSync(saveJson.results[0].savedPath)).toBe(true);
  });

  test("runTranscribeCli validates unknown flags, invalid option values, missing files, and protected --out paths", async () => {
    const hooks = makeMockHooks();

    const unknownFlag = await runCliCapture(["--bogus-flag"], hooks);
    expect(unknownFlag.code).not.toBe(0);
    expect(unknownFlag.stderr).toContain("Unknown option");

    const invalidFormat = await runCliCapture(
      ["sample.wav", "--format", "docx"],
      hooks,
    );
    expect(invalidFormat.code).not.toBe(0);
    expect(invalidFormat.stderr).toContain("Unsupported format");

    const invalidEngine = await runCliCapture(
      ["sample.wav", "--engine", "nonexistent-engine"],
      hooks,
    );
    expect(invalidEngine.code).not.toBe(0);
    expect(invalidEngine.stderr).toContain("Unsupported engine");

    const missingVal = await runCliCapture(["sample.wav", "--format"], hooks);
    expect(missingVal.code).not.toBe(0);
    expect(missingVal.stderr).toContain("requires a value");

    const emptyOut = await runCliCapture(["sample.wav", "--out", ""], hooks);
    expect(emptyOut.code).not.toBe(0);
    expect(emptyOut.stderr).toContain("non-empty output path");

    const missingInput = await runCliCapture(["does_not_exist.wav"], hooks);
    expect(missingInput.code).not.toBe(0);
    expect(missingInput.stderr).toContain("Input file not found");

    const noInput = await runCliCapture([], hooks);
    expect(noInput.code).not.toBe(0);
    expect(noInput.stderr).toContain("No input");

    const ctx = createContext({ home, dataDir, toolDirs: [toolDir] });
    const protectedOut = await runCliCapture(
      ["sample.wav", "--out", join(ctx.trashRoot, "blocked.md")],
      hooks,
    );
    expect(protectedOut.code).not.toBe(0);
    expect(protectedOut.stderr).toContain("Recycle Bin");
  });

  test("runFileManagerCli delegates transcribe, stt, and asr subcommands and prints help entry", async () => {
    const runFm = async (args: string[], hooks?: TranscribeHooks) => {
      const outLines: string[] = [];
      const errLines: string[] = [];
      const code = await runFileManagerCli(args, {
        stdout: (line) => outLines.push(line),
        stderr: (line) => errLines.push(line),
        cwd: workDir,
        contextOptions: { home, dataDir, toolDirs: [toolDir] },
        hooks,
      });
      return {
        code,
        stdout: outLines.join("\n"),
        stderr: errLines.join("\n"),
      };
    };

    const fmHelp = await runFm(["--help"]);
    expect(fmHelp.code).toBe(0);
    expect(fmHelp.stdout).toContain("transcribe, stt, asr");

    const subHelp = await runFm(["transcribe", "--help"]);
    expect(subHelp.code).toBe(0);
    expect(subHelp.stdout).toContain("--format");

    const sttStatus = await runFm(["stt", "--status", "--json"]);
    expect(sttStatus.code).toBe(0);
    const sttJson = JSON.parse(sttStatus.stdout);
    expect(sttJson.ok).toBe(true);
    expect(Array.isArray(sttJson.supportedFormats)).toBe(true);

    const asrRes = await runFm(
      ["asr", "sample.wav", "--format", "srt"],
      makeMockHooks(),
    );
    expect(asrRes.code).toBe(0);
    expect(asrRes.stdout).toContain("00:00:00,000 --> 00:00:01,500");
  });

  test("SimpleCLI spec and fmCliUtils discover transcribe_cli", () => {
    const app = buildTranscribeCliApp();
    expect(app).toBeDefined();

    const ctx = createContext({ home, dataDir, toolDirs: [toolDir] });
    ensureCliUtilsFolder(ctx);
    const catalog = listCliUtils(ctx);
    const transcribeTool = catalog.tools.find((t) => t.id === "transcribe");
    expect(transcribeTool).toBeDefined();
    expect(transcribeTool!.stem).toBe("transcribe_cli");
    expect(transcribeTool!.flags.some((f) => f.name === "format")).toBe(true);
  });
});
