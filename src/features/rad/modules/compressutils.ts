// Feature: RAD - compressutils
// Synchronous, zero-dependency compression on Bun's native codecs: gzip, raw deflate, zstd
// (Bun.*Sync) and brotli (node:zlib). Includes Base64 string helpers, a format-dispatching
// `compress`/`decompress` pair, magic-byte detection, file helpers and ratio math.

import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from "node:zlib";

/** Supported codecs. `"deflate"` is **raw** DEFLATE (no zlib header), matching `Bun.deflateSync`. */
export type CompressionFormat = "gzip" | "deflate" | "brotli" | "zstd";

/** Result of {@link detectCompression}; raw deflate and brotli have no magic bytes → `"unknown"`. */
export type DetectedCompression = "gzip" | "zstd" | "zlib" | "unknown";

type Bytes = Uint8Array<ArrayBuffer>;

function toBytes(data: string | Uint8Array): Bytes {
  return (typeof data === "string" ? Buffer.from(data, "utf-8") : data) as Bytes;
}

function clampLevel(level: number | undefined, min: number, max: number): number | undefined {
  return level === undefined ? undefined : Math.min(max, Math.max(min, Math.round(level)));
}

/**
 * Gzip-compress a string (UTF-8) or bytes.
 * @param level - 0 (store) … 9 (smallest). Default: zlib default (6).
 * @example `const gz = compressutils.gzipCompress("hello".repeat(100), 9);`
 */
export function gzipCompress(data: string | Uint8Array, level?: number): Uint8Array {
  const lvl = clampLevel(level, 0, 9) as any;
  return lvl === undefined ? Bun.gzipSync(toBytes(data)) : Bun.gzipSync(toBytes(data), { level: lvl });
}

/**
 * Decompress gzip bytes.
 * @throws `[compressutils.gzipDecompress]` when the input is not valid gzip.
 * @example `new TextDecoder().decode(compressutils.gzipDecompress(gz));`
 */
export function gzipDecompress(data: Uint8Array): Uint8Array {
  try {
    return Bun.gunzipSync(data as Bytes);
  } catch (err: any) {
    throw new Error(`[compressutils.gzipDecompress] Invalid gzip data (${data.length} bytes): ${err.message}`);
  }
}

/**
 * Gzip a string and return Base64 — handy for storing compressed text in JSON/DB/env vars.
 * @example `const b64 = compressutils.gzipCompressString("big payload");`
 */
export function gzipCompressString(str: string): string {
  return Buffer.from(gzipCompress(str)).toString("base64");
}

/**
 * Reverse of {@link gzipCompressString}: Base64 gzip → UTF-8 string.
 * @example `compressutils.gzipDecompressString(b64); // "big payload"`
 */
export function gzipDecompressString(base64Str: string): string {
  return Buffer.from(gzipDecompress(Buffer.from(base64Str, "base64"))).toString("utf-8");
}

/**
 * Raw-DEFLATE compress a string or bytes.
 * @param level - 0 … 9.
 * @example `compressutils.deflateCompress("data");`
 */
export function deflateCompress(data: string | Uint8Array, level?: number): Uint8Array {
  const lvl = clampLevel(level, 0, 9) as any;
  return lvl === undefined ? Bun.deflateSync(toBytes(data)) : Bun.deflateSync(toBytes(data), { level: lvl });
}

/**
 * Inflate raw-DEFLATE bytes.
 * @throws When the input is not valid raw deflate.
 * @example `compressutils.deflateDecompress(compressutils.deflateCompress("x"));`
 */
export function deflateDecompress(data: Uint8Array): Uint8Array {
  try {
    return Bun.inflateSync(data as Bytes);
  } catch (err: any) {
    throw new Error(`[compressutils.deflateDecompress] Invalid deflate data (${data.length} bytes): ${err.message}`);
  }
}

/**
 * Brotli-compress (best ratio for text/web assets).
 * @param quality - 0 … 11. Default 11.
 * @example `compressutils.brotliCompress(html, 9);`
 */
export function brotliCompress(data: string | Uint8Array, quality = 11): Uint8Array {
  const q = clampLevel(quality, 0, 11)!;
  return new Uint8Array(brotliCompressSync(toBytes(data), { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: q } }));
}

/**
 * Decompress brotli bytes.
 * @throws When the input is not valid brotli.
 * @example `compressutils.brotliDecompress(br);`
 */
export function brotliDecompress(data: Uint8Array): Uint8Array {
  try {
    return new Uint8Array(brotliDecompressSync(data));
  } catch (err: any) {
    throw new Error(`[compressutils.brotliDecompress] Invalid brotli data (${data.length} bytes): ${err.message}`);
  }
}

/**
 * Zstandard-compress (very fast with excellent ratios — great for logs and caches).
 * @param level - 1 … 22. Default 3.
 * @example `compressutils.zstdCompress(jsonText, 19);`
 */
export function zstdCompress(data: string | Uint8Array, level = 3): Uint8Array {
  return Bun.zstdCompressSync(toBytes(data), { level: clampLevel(level, 1, 22)! });
}

/**
 * Decompress zstd bytes.
 * @throws When the input is not valid zstd.
 * @example `compressutils.zstdDecompress(zst);`
 */
export function zstdDecompress(data: Uint8Array): Uint8Array {
  try {
    return Bun.zstdDecompressSync(data as Bytes);
  } catch (err: any) {
    throw new Error(`[compressutils.zstdDecompress] Invalid zstd data (${data.length} bytes): ${err.message}`);
  }
}

/**
 * Compress with any supported format — one call site, swappable codec.
 * @example `compressutils.compress("payload", "zstd");`
 */
export function compress(data: string | Uint8Array, format: CompressionFormat, level?: number): Uint8Array {
  switch (format) {
    case "gzip":
      return gzipCompress(data, level);
    case "deflate":
      return deflateCompress(data, level);
    case "brotli":
      return brotliCompress(data, level);
    case "zstd":
      return zstdCompress(data, level);
  }
  throw new Error(`[compressutils.compress] Unsupported format: ${format}`);
}

/**
 * Decompress with any supported format.
 * @example `compressutils.decompress(bytes, "brotli");`
 */
export function decompress(data: Uint8Array, format: CompressionFormat): Uint8Array {
  switch (format) {
    case "gzip":
      return gzipDecompress(data);
    case "deflate":
      return deflateDecompress(data);
    case "brotli":
      return brotliDecompress(data);
    case "zstd":
      return zstdDecompress(data);
  }
  throw new Error(`[compressutils.decompress] Unsupported format: ${format}`);
}

/**
 * Sniff the codec from magic bytes (gzip `1f 8b`, zstd `28 b5 2f fd`, zlib `78 01|5e|9c|da`).
 * @example `compressutils.detectCompression(Bun.gzipSync("x")); // "gzip"`
 */
export function detectCompression(data: Uint8Array): DetectedCompression {
  if (data[0] === 0x1f && data[1] === 0x8b) return "gzip";
  if (data[0] === 0x28 && data[1] === 0xb5 && data[2] === 0x2f && data[3] === 0xfd) return "zstd";
  if (data[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(data[1] ?? -1)) return "zlib";
  return "unknown";
}

/**
 * Compress a file on disk. Destination defaults to `src + ".gz" | ".br" | ".zst" | ".deflate"`.
 * @returns The destination path.
 * @example `await compressutils.compressFile("./access.log", "zstd"); // "./access.log.zst"`
 */
export async function compressFile(src: string, format: CompressionFormat = "gzip", dest?: string): Promise<string> {
  const file = Bun.file(src);
  if (!(await file.exists())) throw new Error(`[compressutils.compressFile] File not found: ${src}`);
  const ext = { gzip: ".gz", deflate: ".deflate", brotli: ".br", zstd: ".zst" }[format];
  const out = dest ?? `${src}${ext}`;
  await Bun.write(out, compress(await file.bytes(), format));
  return out;
}

/**
 * Decompress a file on disk. Destination defaults to `src` with its compression extension removed.
 * @returns The destination path.
 * @example `await compressutils.decompressFile("./access.log.zst", "zstd"); // "./access.log"`
 */
export async function decompressFile(src: string, format: CompressionFormat = "gzip", dest?: string): Promise<string> {
  const file = Bun.file(src);
  if (!(await file.exists())) throw new Error(`[compressutils.decompressFile] File not found: ${src}`);
  const stripped = src.replace(/\.(gz|deflate|br|zst)$/i, "");
  const out = dest ?? (stripped === src ? `${src}.out` : stripped);
  await Bun.write(out, decompress(await file.bytes(), format));
  return out;
}

/**
 * Percentage of space saved, rounded to 1 decimal: `(1 - compressed / original) * 100`.
 * Negative when "compression" made the data larger.
 * @example `compressutils.compressionRatio(1000, 250); // 75`
 */
export function compressionRatio(uncompressedLen: number, compressedLen: number): number {
  if (uncompressedLen === 0) return 0;
  return Number((((uncompressedLen - compressedLen) / uncompressedLen) * 100).toFixed(1));
}

export const compressutils = {
  gzipCompress,
  gzipDecompress,
  gzipCompressString,
  gzipDecompressString,
  deflateCompress,
  deflateDecompress,
  brotliCompress,
  brotliDecompress,
  zstdCompress,
  zstdDecompress,
  compress,
  decompress,
  detectCompression,
  compressFile,
  decompressFile,
  compressionRatio,
};
