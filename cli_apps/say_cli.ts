#!/usr/bin/env bun
/**
 * 🗣️ Text-to-Speech & Ollama Document-to-Audio/MP4 CLI (`say-cli`)
 *
 * Supports both quick inline speech synthesis (`--text "..." --voice Zoey`) and full
 * Ollama Phonon document cleaning + multi-format audio/MP4 Read-Along video export
 * (`--input doc.md --output out.mp3`, `--format mp4`, `--llm-clean`, `--voices`, `--formats`).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SimpleCLI, sys } from "../src/index.ts";
import { DEFAULT_PHONON_VOICES } from "../src/features/filemanager/fmPhonon.ts";
import { runTtsCli } from "./tts_cli.ts";

const app = SimpleCLI.newApp("say-cli", "1.0.0").setDescription(
  "Ollama Phonon & Native Text-to-Speech Synthesis, Document Cleaner & Audio/MP4 Exporter",
);

app.addFlagString("text", "t", "", "Speech text to read or export");
app.addFlagString(
  "input",
  "i",
  "",
  "Input document path to clean and synthesize (MD, PDF, DOCX, EPUB, HTML, TXT, SRT)",
);
app.addFlagString(
  "output",
  "o",
  "",
  "Output audio or Read-Along video file path (.wav, .mp3, .m4a, .flac, .opus, .mp4, .mov, .webm, .mkv)",
);
app.addFlagString(
  "format",
  "f",
  "",
  "Target export format (wav, mp3, m4a, aac, flac, ogg, opus, aiff, wma, mp4, webm, mov, mkv)",
);
app.addFlagString(
  "voice",
  "v",
  "Zoey",
  "Voice name (Ollama Phonon voice like Zoey, Easton, Freya, Edwin, or OS voice like Samantha)",
);
app.addFlagBool(
  "llm-clean",
  "L",
  false,
  "Use an Ollama LLM to polish messy document text before speech",
);
app.addFlagBool(
  "clean-only",
  "C",
  false,
  "Clean document text and print/save without audio synthesis",
);
app.addFlagBool(
  "voices",
  "V",
  false,
  "List all 38+ Ollama Phonon neural voices",
);
app.addFlagBool(
  "formats",
  "F",
  false,
  "List all supported audio and Read-Along video formats",
);
app.addFlagBool(
  "status",
  "d",
  false,
  "Check Ollama, Phonon TTS, and FFmpeg readiness",
);
app.addFlagBool("json", "j", false, "Output structured JSON result");

const PHONON_VOICE_SET = new Set(
  DEFAULT_PHONON_VOICES.map((v) => v.id.toLowerCase()),
);

const ADVANCED_TTS_FLAGS = new Set([
  "export",
  "clean",
  "speak",
  "audiobook",
  "voices",
  "formats",
  "status",
  "clone-voice",
  "-i",
  "--input",
  "--file",
  "-o",
  "--output",
  "--out",
  "-f",
  "--format",
  "-L",
  "--llm-clean",
  "-M",
  "--clean-model",
  "-C",
  "--clean-only",
  "-V",
  "--voices",
  "-F",
  "--formats",
  "-d",
  "--status",
  "-B",
  "--audiobook",
  "--clone-voice",
  "--srt",
  "--vtt",
  "--ass",
  "-a",
  "--aspect",
  "-w",
  "--theme",
  "-j",
  "--json",
]);

if (import.meta.main) {
  const rawArgs = process.argv.slice(2);
  const hasAdvancedFlag = rawArgs.some((a) => {
    const base = a.includes("=") ? a.slice(0, a.indexOf("=")) : a;
    return ADVANCED_TTS_FLAGS.has(base);
  });
  const firstPositional = rawArgs.find((a) => !a.startsWith("-"));
  const positionalIsFile = Boolean(
    firstPositional && existsSync(resolve(process.cwd(), firstPositional)),
  );

  if (hasAdvancedFlag || positionalIsFile) {
    const code = await runTtsCli(rawArgs);
    process.exit(code);
  }

  if (!app.parseCli()) process.exit(0);

  app.banner(
    "Text-to-Speech Voice Engine",
    "v1.0.0 — Ollama Phonon & OS Speech",
  );
  const text =
    app.getFlagString("text") ||
    app.getPositionalArgs().join(" ") ||
    "Hello from Bun Simple CLI!";
  const voice = app.getFlagString("voice") || "Samantha";

  if (PHONON_VOICE_SET.has(voice.toLowerCase())) {
    await runTtsCli(["speak", "--text", text, "--voice", voice]);
  } else {
    sys.say(text, voice);
  }
  app.success(`Speaking: "${text}"`);
}
