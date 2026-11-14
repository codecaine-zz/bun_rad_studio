import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanDocumentForTts,
  cleanDocumentWithOllamaLlm,
  expandAbbreviationsForSpeech,
  extractAndCleanInput,
  resolveOllamaCleanerModel,
  resolveOutputFilePath,
  resolveTargetFormats,
  runTtsCli,
} from "../cli_apps/tts_cli";
import { createContext } from "../src/features/filemanager/fmCore";
import { runFileManagerCli } from "../src/features/filemanager/fmCli";
import {
  ensureCliUtilsFolder,
  listCliUtils,
} from "../src/features/filemanager/fmCliUtils";
import { createWavHeader as makeWavHeader } from "../src/features/filemanager/fmPhonon";
import { rmDir } from "./helpers/rm";

const root = mkdtempSync(join(tmpdir(), "tts-cli-test-"));
const home = join(root, "home");
const dataDir = join(root, "data");
const toolDir = join(root, "tools");
const workDir = join(root, "work");

function makeSampleWavBuffer(
  durationSec = 0.5,
  sampleRate = 24000,
  freqHz = 195,
): Buffer {
  const numSamples = Math.max(240, Math.round(sampleRate * durationSec));
  const pcm = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.sin((Math.PI * i) / numSamples);
    const val =
      (Math.sin(2 * Math.PI * freqHz * t) * 0.6 +
        Math.sin(2 * Math.PI * freqHz * 2 * t) * 0.25) *
      env;
    pcm.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(val * 18000))),
      i * 2,
    );
  }
  const header = makeWavHeader(pcm.length, sampleRate, 1, 16);
  return Buffer.concat([header, pcm]);
}

beforeAll(() => {
  process.env.TTS_CLI_NO_AUDIO = "1";
  mkdirSync(home, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(toolDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });

  // Create deterministic cross-platform mock `ollama` and `ffmpeg` tools in `toolDir` for fast, hermetic tests
  const sampleWavHex = makeSampleWavBuffer(0.45, 24000, 190).toString("hex");
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
  console.log("  Model\\n    architecture        gradium_phonon_tts\\n    context length      8192\\n\\n  Voices\\n    Zoey          4096 tokens\\n    Easton        4096 tokens\\n    Freya         4096 tokens\\n    Edwin         4096 tokens\\n");
  process.exit(0);
}
if (args[0] === "list") {
  console.log("NAME             ID              SIZE      MODIFIED\\nphonon:latest    58f58601e4e8    112 MB    2 days ago\\nqwen2.5:3b       123456789abc    1.9 GB    2 days ago\\n");
  process.exit(0);
}
if (args[0] === "run") {
  const model = args[1] || "";
  if (model.startsWith("phonon")) {
    process.stdout.write(Buffer.from("${sampleWavHex}", "hex"));
    process.exit(0);
  }
  console.log("Polished spoken narration from Ollama LLM cleaner.");
  process.exit(0);
}
process.exit(0);
`,
    "utf8",
  );

  const ffmpegJs = join(toolDir, "ffmpeg_mock.js");
  writeFileSync(
    ffmpegJs,
    `#!/usr/bin/env bun
import { writeFileSync } from "fs";
const args = process.argv.slice(2);
const outArg = args[args.length - 1] || "out.mp3";
writeFileSync(outArg, Buffer.from("${sampleWavHex}", "hex"));
process.exit(0);
`,
    "utf8",
  );

  if (process.platform === "win32") {
    writeFileSync(
      join(toolDir, "ollama.cmd"),
      `@echo off\r\n"${process.execPath}" "${ollamaJs}" %*\r\n`,
    );
    writeFileSync(
      join(toolDir, "ffmpeg.cmd"),
      `@echo off\r\n"${process.execPath}" "${ffmpegJs}" %*\r\n`,
    );
  } else {
    const ollamaSh = join(toolDir, "ollama");
    const ffmpegSh = join(toolDir, "ffmpeg");
    writeFileSync(
      ollamaSh,
      `#!/usr/bin/env sh\nexec "${process.execPath}" "${ollamaJs}" "$@"\n`,
    );
    writeFileSync(
      ffmpegSh,
      `#!/usr/bin/env sh\nexec "${process.execPath}" "${ffmpegJs}" "$@"\n`,
    );
    chmodSync(ollamaSh, 0o755);
    chmodSync(ffmpegSh, 0o755);
  }
});

afterAll(() => {
  rmDir(root);
});

describe("Ollama Terminal TTS & Document Cleaner CLI (`cli_apps/tts_cli.ts`)", () => {
  test("cleanDocumentForTts strips frontmatter, thinking tags, HTML, Markdown, citations, URLs, and expands dates & abbreviations", () => {
    const dirtyDoc = `---
title: Deep Architecture Spec
date: 2026-11-13
---
<think>Internal reasoning step that should never be spoken aloud.</think>
# System Overview (2026-11-13)

Welcome to **Bun RAD Studio** & *Ollama Phonon* [1, 2]!
Check the [User Guide](https://docs.example.com/path/to/page?query=123&foo=bar) or raw https://sub.domain.org/a/b/c, e.g., for setup, i.e., audio export, etc.[^note1]

| Feature | Status |
| --- | --- |
| Export | Ready |

<div class="callout"><script>alert(1)</script>Scheduled for 12/25/2026 vs. prior plan (latency ≤ 50 ms, throughput ≈ 100%).</div>
`;

    const cleaned = cleanDocumentForTts(dirtyDoc);
    expect(cleaned).not.toContain("title: Deep Architecture Spec");
    expect(cleaned).not.toContain("Internal reasoning step");
    expect(cleaned).not.toContain("alert(1)");
    expect(cleaned).not.toContain("[1, 2]");
    expect(cleaned).not.toContain("[^note1]");
    expect(cleaned).not.toContain("query=123");
    expect(cleaned).toContain("System Overview (November 13, 2026)");
    expect(cleaned).toContain("Bun RAD Studio and Ollama Phonon!");
    expect(cleaned).toContain(
      "Check the User Guide or raw sub.domain.org for example, for setup, that is, audio export, et cetera",
    );
    expect(cleaned).toContain("Feature, Status");
    expect(cleaned).toContain("Export, Ready");
    expect(cleaned).toContain(
      "Scheduled for December 25, 2026 versus prior plan",
    );
    expect(cleaned).toContain("is less than or equal to 50 ms");
    expect(cleaned).toContain("approximately 100%");
  });

  test("cleanDocumentWithOllamaLlm uses local Ollama /api/generate when available and rejects speech models as text cleaners", async () => {
    const mockServer = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/api/tags") {
          return Response.json({
            models: [{ name: "phonon:latest" }, { name: "qwen2.5:3b" }],
          });
        }
        if (url.pathname === "/api/generate") {
          const body = (await req.json()) as {
            model?: string;
            prompt?: string;
          };
          return Response.json({
            response: `<think>drafting</think>Polished by ${body.model}: ${body.prompt} (10/28/2026).`,
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });

    try {
      const ctx = createContext({
        home,
        dataDir,
        toolDirs: [toolDir],
        ollama: { baseUrl: `http://127.0.0.1:${mockServer.port}` },
      });

      // Speech model must be rejected if explicitly requested as text cleaner
      await expect(
        resolveOllamaCleanerModel(ctx, "phonon:latest"),
      ).rejects.toThrow(/speech or embedding model/i);

      // Auto-detects qwen2.5:3b (skipping phonon:latest)
      const detected = await resolveOllamaCleanerModel(ctx, "auto");
      expect(detected).toBe("qwen2.5:3b");

      const llmRes = await cleanDocumentWithOllamaLlm(
        ctx,
        "Raw OCR text with **bold** and 2026-11-13.",
        { cleanModel: "auto" },
      );
      expect(llmRes.usedLlm).toBe(true);
      expect(llmRes.modelUsed).toBe("qwen2.5:3b");
      expect(llmRes.text).not.toContain("<think>");
      expect(llmRes.text).toContain("Polished by qwen2.5:3b");
      expect(llmRes.text).toContain("November 13, 2026");
      expect(llmRes.text).toContain("October 28, 2026");
    } finally {
      mockServer.stop(true);
    }
  });

  test("resolveTargetFormats and resolveOutputFilePath support all 9 audio & 4 video formats and multi-format lists", () => {
    expect(resolveTargetFormats("wav,mp3,flac,mp4")).toEqual([
      "wav",
      "mp3",
      "flac",
      "mp4",
    ]);
    expect(resolveTargetFormats("", "lecture.webm")).toEqual(["webm"]);
    expect(resolveTargetFormats("", "podcast.m4b")).toEqual(["m4a"]);
    expect(resolveTargetFormats("", "")).toEqual(["wav"]);
    expect(() => resolveTargetFormats("invalidfmt")).toThrow(
      /Unsupported export format/,
    );

    const singleOut = resolveOutputFilePath({
      outputFlag: "out/custom_name",
      voice: "Zoey",
      format: "mp4",
      multiFormat: false,
      cwd: workDir,
    });
    expect(singleOut).toBe(join(workDir, "out", "custom_name.mp4"));

    const multiOutMp3 = resolveOutputFilePath({
      outputFlag: "out/bundle.wav",
      voice: "Zoey",
      format: "mp3",
      multiFormat: true,
      cwd: workDir,
    });
    expect(multiOutMp3).toBe(join(workDir, "out", "bundle.mp3"));
  });

  test("runTtsCli status, voices, and formats subcommands return complete JSON and human tables", async () => {
    const runCapture = async (args: string[]) => {
      const outLines: string[] = [];
      const errLines: string[] = [];
      const code = await runTtsCli(args, {
        stdout: (l) => outLines.push(l),
        stderr: (l) => errLines.push(l),
        cwd: workDir,
        contextOptions: { home, dataDir, toolDirs: [toolDir] },
      });
      return { code, stdout: outLines.join("\n"), stderr: errLines.join("\n") };
    };

    const statusRes = await runCapture(["status", "--json"]);
    expect(statusRes.code).toBe(0);
    const statusJson = JSON.parse(statusRes.stdout);
    expect(statusJson.ok).toBe(true);
    expect(statusJson.ollamaInstalled).toBe(true);
    expect(statusJson.ffmpegInstalled).toBe(true);
    expect(statusJson.voices.length).toBeGreaterThanOrEqual(38);

    const voicesRes = await runCapture(["voices", "--json"]);
    expect(voicesRes.code).toBe(0);
    const voicesJson = JSON.parse(voicesRes.stdout);
    expect(voicesJson.ok).toBe(true);
    expect(voicesJson.count).toBeGreaterThanOrEqual(38);

    const formatsRes = await runCapture(["formats", "--json"]);
    expect(formatsRes.code).toBe(0);
    const formatsJson = JSON.parse(formatsRes.stdout);
    expect(formatsJson.audioFormats.map((f: any) => f.id)).toEqual([
      "wav",
      "mp3",
      "m4a",
      "aac",
      "flac",
      "ogg",
      "opus",
      "aiff",
      "wma",
    ]);
    expect(formatsJson.videoFormats.map((f: any) => f.id)).toEqual([
      "mp4",
      "webm",
      "mov",
      "mkv",
    ]);
  });

  test("runTtsCli cleans a Markdown file and exports WAV, MP3, AIFF, and MP4 Read-Along Video with SRT/VTT/ASS subtitles", async () => {
    const docPath = join(workDir, "briefing.md");
    writeFileSync(
      docPath,
      `# Project Briefing (2026-11-13)\n\nWe shipped **Ollama Phonon** CLI, e.g., audio & video export at https://ollama.com/library/phonon!`,
      "utf8",
    );

    const outLines: string[] = [];
    const errLines: string[] = [];
    const outBase = join(workDir, "briefing_out");
    const txtSave = join(workDir, "briefing_cleaned.txt");
    const assSave = join(workDir, "briefing_karaoke.ass");

    const code = await runTtsCli(
      [
        "export",
        "-i",
        docPath,
        "-f",
        "wav,mp3,aiff,mp4",
        "-o",
        outBase,
        "--save-txt",
        txtSave,
        "--ass",
        assSave,
        "--voice",
        "Zoey",
        "--aspect",
        "16:9",
        "--theme",
        "midnight",
        "--json",
      ],
      {
        stdout: (l) => outLines.push(l),
        stderr: (l) => errLines.push(l),
        cwd: workDir,
        contextOptions: { home, dataDir, toolDirs: [toolDir] },
      },
    );

    expect(code).toBe(0);
    const result = JSON.parse(outLines.join("\n"));
    expect(result.ok).toBe(true);
    expect(result.cleanedText).toContain(
      "Project Briefing (November 13, 2026)",
    );
    expect(result.cleanedText).toContain(
      "for example, audio and video export at ollama.com",
    );
    expect(result.exports.length).toBe(4);

    for (const ext of ["wav", "mp3", "aiff", "mp4"]) {
      const p = `${outBase}.${ext}`;
      expect(existsSync(p)).toBe(true);
    }
    expect(existsSync(txtSave)).toBe(true);
    expect(existsSync(assSave)).toBe(true);
    expect(readFileSync(assSave, "utf8")).toContain("[Script Info]");

    const mp4Export = result.exports.find((e: any) => e.format === "mp4");
    expect(mp4Export).toBeDefined();
    expect(mp4Export.srtPath).toBeTruthy();
    expect(mp4Export.vttPath).toBeTruthy();
    expect(existsSync(mp4Export.srtPath)).toBe(true);
    expect(existsSync(mp4Export.vttPath)).toBe(true);
  });

  test("runTtsCli audiobook subcommand splits multi-chapter Markdown into per-chapter audio + M3U8 playlist & manifest", async () => {
    const bookPath = join(workDir, "mini_book.md");
    writeFileSync(
      bookPath,
      `# Chapter 1: The Beginning\n\nSunrise over the mountains on 2026-11-13.\n\n# Chapter 2: The Journey\n\nWalking through the quiet forest, e.g., along the river.`,
      "utf8",
    );

    const bookOutDir = join(workDir, "mini_book_audiobook");
    const outLines: string[] = [];
    const code = await runTtsCli(
      [
        "audiobook",
        "-i",
        bookPath,
        "-f",
        "wav",
        "-o",
        bookOutDir,
        "--voice",
        "Edwin",
        "--json",
      ],
      {
        stdout: (l) => outLines.push(l),
        cwd: workDir,
        contextOptions: { home, dataDir, toolDirs: [toolDir] },
      },
    );

    expect(code).toBe(0);
    const data = JSON.parse(outLines.join("\n"));
    expect(data.ok).toBe(true);
    expect(data.chapterCount).toBe(2);
    expect(existsSync(data.playlistPath)).toBe(true);
    expect(existsSync(data.manifestPath)).toBe(true);
    for (const ch of data.chapters) {
      expect(existsSync(ch.outputPath)).toBe(true);
    }
  });

  test("File Manager CLI (`fmCli`) exposes `tts` subcommand and `fmCliUtils` catalogs `tts` and `say`", async () => {
    const fmOut: string[] = [];
    const code = await runFileManagerCli(
      [
        "tts",
        "clean",
        "-t",
        "Hello **world** on 2026-11-13, e.g. test!",
        "--json",
      ],
      {
        stdout: (l) => fmOut.push(l),
        cwd: workDir,
        contextOptions: { home, dataDir, toolDirs: [toolDir] },
      },
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(fmOut.join("\n"));
    expect(parsed.ok).toBe(true);
    expect(parsed.text).toBe(
      "Hello world on November 13, 2026, for example, test!",
    );

    const ctx = createContext({ home, dataDir, toolDirs: [toolDir] });
    ensureCliUtilsFolder(ctx);
    const catalog = listCliUtils(ctx);
    const ttsTool = catalog.tools.find((t) => t.id === "tts");
    expect(ttsTool).toBeDefined();
    expect(ttsTool!.category).toBe("Media & Graphics");
    expect(ttsTool!.icon).toBe("🎙️");
  });
});
