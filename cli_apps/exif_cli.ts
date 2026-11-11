#!/usr/bin/env bun
import { createHash, randomBytes } from "node:crypto";
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
app.addFlagBool("strip", "s", false, "Strip all EXIF metadata (JPEG)");
app.addFlagBool("json", "j", false, "Output metadata as JSON");

/**
 * Strips JPEG metadata segments (`APP1` EXIF/XMP, `APP13` IPTC, `COM` comments) while preserving image scan data.
 */
export function stripJpegMetadataBuffer(buf: Buffer): {
  buffer: Buffer;
  removedSegments: number;
} {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error("Not a valid JPEG buffer (missing 0xFFD8 SOI marker)");
  }
  const chunks: Buffer[] = [buf.subarray(0, 2)];
  let pos = 2;
  let removedSegments = 0;

  while (pos < buf.length) {
    if (buf[pos] !== 0xff) {
      throw new Error(`Malformed JPEG marker stream at byte offset ${pos}`);
    }
    const segStart = pos;
    while (pos < buf.length && buf[pos] === 0xff) {
      pos++;
    }
    if (pos >= buf.length) {
      chunks.push(buf.subarray(segStart));
      break;
    }
    const marker = buf[pos]!;
    pos++;

    // EOI or SOS (Start of Scan): copy from segment start to end of file verbatim
    if (marker === 0xd9 || marker === 0xda) {
      chunks.push(buf.subarray(segStart));
      break;
    }

    // Standalone markers without a 2-byte length field (RST0-RST7, TEM)
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(buf.subarray(segStart, pos));
      continue;
    }

    if (pos + 2 > buf.length) {
      throw new Error(
        `Truncated JPEG segment header for marker 0x${marker.toString(16)}`,
      );
    }
    const segLen = buf.readUInt16BE(pos);
    if (segLen < 2 || pos + segLen > buf.length) {
      throw new Error(
        `Invalid JPEG segment length ${segLen} at offset ${segStart}`,
      );
    }
    const segEnd = pos + segLen;
    // Strip APP1 (0xE1 EXIF/XMP), APP13 (0xED IPTC), and COM (0xFE comments)
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) {
      removedSegments++;
    } else {
      chunks.push(buf.subarray(segStart, segEnd));
    }
    pos = segEnd;
  }

  return {
    buffer: Buffer.concat(chunks),
    removedSegments,
  };
}

/**
 * Atomically strips metadata from a JPEG file on disk using a sibling temp file + `renameSync`.
 */
export function stripJpegFileAtomically(filePath: string): {
  removedSegments: number;
  bytesBefore: number;
  bytesAfter: number;
} {
  const resolved = nodePath.resolve(filePath);
  const st = fs.statSync(resolved);
  const raw = fs.readFileSync(resolved);
  const { buffer: strippedBuf, removedSegments } = stripJpegMetadataBuffer(raw);
  const tmpPath = nodePath.join(
    nodePath.dirname(resolved),
    `.${nodePath.basename(resolved)}.exif-tmp-${process.pid}-${randomBytes(6).toString("hex")}`,
  );
  try {
    fs.writeFileSync(tmpPath, strippedBuf, { mode: st.mode & 0o777 });
    fs.renameSync(tmpPath, resolved);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
  return {
    removedSegments,
    bytesBefore: raw.byteLength,
    bytesAfter: strippedBuf.byteLength,
  };
}

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

if (import.meta.main) {
  if (!app.parseCli()) process.exit(0);

  const file = app.getFlagString("file") || app.getPositionalArgs()[0];
  const strip = app.getFlagBool("strip");
  const asJson = app.getFlagBool("json");

  if (!file || !fs.existsSync(file)) {
    app.banner("EXIF Metadata Studio", "v1.0.0 - Image Telemetry Extractor");
    app.error("Please provide a valid image file with -f <file>");
    process.exit(1);
  }

  const resolved = nodePath.resolve(file);
  let st = fs.statSync(resolved);
  if (st.isDirectory()) {
    app.error(`Target path is a directory, expected image file: ${resolved}`);
    process.exit(1);
  }

  let buf = fs.readFileSync(resolved);
  let sig = detectFormatAndDimensions(buf);
  let stripped = false;
  let removedSegments = 0;

  if (strip) {
    if (sig.format !== "JPEG") {
      app.error(
        `--strip is only supported for JPEG images (detected ${sig.format}). Refusing to fake metadata removal.`,
      );
      process.exit(1);
    }
    try {
      const stripRes = stripJpegFileAtomically(resolved);
      stripped = true;
      removedSegments = stripRes.removedSegments;
      st = fs.statSync(resolved);
      buf = fs.readFileSync(resolved);
      sig = detectFormatAndDimensions(buf);
    } catch (err: any) {
      app.error(`Failed to strip JPEG EXIF metadata: ${err.message}`);
      process.exit(1);
    }
  }

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
          stripped,
          ...(strip ? { removedSegments } : {}),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  app.banner("EXIF Metadata Studio", "v1.0.0 - Image Telemetry Extractor");
  if (stripped) {
    app.success(
      `Stripped ${removedSegments} metadata segment(s) from ${nodePath.basename(resolved)}.`,
    );
  }

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
        new Date(
          meta?.createdTime || st.birthtimeMs || Date.now(),
        ).toISOString(),
      ],
    ],
  );
}
