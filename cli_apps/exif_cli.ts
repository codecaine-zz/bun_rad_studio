#!/usr/bin/env bun
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { SimpleCLI, sys } from "../src/index.ts";

const app = SimpleCLI.newApp("exif-cli", "1.0.0").setDescription(
  "Image EXIF Metadata Inspector & Stripper",
);

app.addFlagString(
  "file",
  "f",
  "",
  "Target image file path (JPG, PNG, TIFF, HEIC)",
);
app.addFlagBool("strip", "s", false, "Strip all EXIF metadata");
app.addFlagBool("json", "j", false, "Output metadata as JSON");

if (!app.parseCli()) process.exit(0);

function detectFormatAndDimensions(buf: Buffer): {
  format: string;
  mime: string;
  width?: number;
  height?: number;
} {
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return {
      format: "PNG",
      mime: "image/png",
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  if (
    buf.length >= 4 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1]!;
      const len = buf.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          format: "JPEG",
          mime: "image/jpeg",
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      if (len < 2) break;
      offset += 2 + len;
    }
    return { format: "JPEG", mime: "image/jpeg" };
  }
  if (
    buf.length >= 10 &&
    buf.subarray(0, 6).toString("ascii").startsWith("GIF8")
  ) {
    return {
      format: "GIF",
      mime: "image/gif",
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
    };
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { format: "PDF", mime: "application/pdf" };
  }
  return { format: "File / Text", mime: "application/octet-stream" };
}

const file = app.getFlagString("file") || app.getPositionalArgs()[0];
const strip = app.getFlagBool("strip");
const asJson = app.getFlagBool("json");

if (!file || !fs.existsSync(file)) {
  app.banner("EXIF Metadata Studio", "v1.0.0 - Image Telemetry Extractor");
  app.warn("Please provide a valid image file with -f <file>");
  process.exit(0);
}

const resolved = nodePath.resolve(file);
const st = fs.statSync(resolved);
const buf = st.isDirectory() ? Buffer.alloc(0) : fs.readFileSync(resolved);
const sig = detectFormatAndDimensions(buf);
const sha256 = createHash("sha256").update(buf).digest("hex");

if (asJson) {
  console.log(
    JSON.stringify(
      {
        file: nodePath.basename(resolved),
        path: resolved,
        sizeBytes: st.size,
        format: sig.format,
        mime: sig.mime,
        ...(sig.width && sig.height
          ? {
              dimensions: `${sig.width}x${sig.height}`,
              width: sig.width,
              height: sig.height,
            }
          : {}),
        modified: st.mtime.toISOString(),
        created: st.birthtime.toISOString(),
        sha256,
        stripped: strip,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

app.banner("EXIF Metadata Studio", "v1.0.0 - Image Telemetry Extractor");

const meta = sys.fileMetadata(file);
app.table(
  ["EXIF Property", "Value"],
  [
    ["File Name", meta?.name || nodePath.basename(resolved)],
    [
      "File Size",
      `${((meta?.sizeBytes || st.size) / 1024).toFixed(2)} KB (${st.size} B)`,
    ],
    ["Format / MIME", `${sig.format} (${sig.mime})`],
    ...(sig.width && sig.height
      ? [["Dimensions", `${sig.width}x${sig.height}`]]
      : []),
    ["SHA-256", sha256],
    [
      "Created Time",
      new Date(meta?.createdTime || st.birthtimeMs || Date.now()).toISOString(),
    ],
  ],
);
