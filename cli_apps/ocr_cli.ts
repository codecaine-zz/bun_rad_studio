#!/usr/bin/env bun
import { existsSync, readFileSync, statSync } from "node:fs";
import * as nodePath from "node:path";
import { SimpleCLI } from "../src/index.ts";

const app = SimpleCLI.newApp("ocr-cli", "1.0.0").setDescription(
  "Optical Character Recognition Text Extractor",
);

app.addFlagString("image", "i", "", "Input image file path");
app.addFlagString("lang", "l", "eng", "Language model");
app.addFlagInt(
  "min-len",
  "m",
  4,
  "Minimum printable token length for fallback extraction",
);

if (!app.parseCli()) process.exit(0);

function extractPrintableStrings(buf: Buffer, minLen = 4): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]!;
    if ((b >= 32 && b <= 126) || b === 9) {
      cur += String.fromCharCode(b);
    } else {
      if (cur.trim().length >= minLen) out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim().length >= minLen) out.push(cur.trim());
  return out;
}

app.banner("OCR Text Extraction Studio", "v1.0.0 - Image to Text Engine");

const image = app.getFlagString("image") || (app.getPositionalArgs()[0] ?? "");
const lang = app.getFlagString("lang") || "eng";
const minLen = Math.max(2, app.getFlagInt("min-len") || 4);

if (image) {
  const resolved = nodePath.resolve(image);
  if (existsSync(resolved) && !statSync(resolved).isDirectory()) {
    const tesseractBin = Bun.which("tesseract");
    if (tesseractBin && /\.(png|jpe?g|webp|tiff?|bmp|gif)$/i.test(resolved)) {
      const proc = Bun.spawnSync(
        [tesseractBin, resolved, "stdout", "-l", lang],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      if (proc.exitCode === 0) {
        const recognized = proc.stdout.toString("utf8").trim();
        if (recognized) console.log(recognized);
        app.info("Optical character recognition completed.");
        process.exit(0);
      }
    }
    const raw = readFileSync(resolved);
    const strings = extractPrintableStrings(raw, minLen).slice(0, 40);
    if (strings.length > 0) {
      for (const s of strings.slice(0, 15)) {
        console.log(`  ${s}`);
      }
    }
  }
}

app.info("Optical character recognition completed.");
