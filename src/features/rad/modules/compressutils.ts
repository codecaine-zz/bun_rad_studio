// Doer: Gzip compress input string or buffer
export function gzipCompress(data: string | Uint8Array): Uint8Array {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return Bun.gzipSync(buf);
}

// Doer: Gunzip decompress input buffer
export function gzipDecompress(data: Uint8Array): Uint8Array {
  return Bun.gunzipSync(data);
}

// Coordinator: Compress text string and encode as base64
export function gzipCompressString(str: string): string {
  const compressed = gzipCompress(str);
  return Buffer.from(compressed).toString("base64");
}

// Coordinator: Decompress base64 gzip payload into text string
export function gzipDecompressString(base64Str: string): string {
  const compressed = Buffer.from(base64Str, "base64");
  const decompressed = gzipDecompress(compressed);
  return Buffer.from(decompressed).toString("utf-8");
}

// Doer: Deflate compress input string or buffer
export function deflateCompress(data: string | Uint8Array): Uint8Array {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return Bun.deflateSync(buf);
}

// Doer: Inflate decompress input buffer
export function deflateDecompress(data: Uint8Array): Uint8Array {
  return Bun.inflateSync(data);
}

// Doer: Calculate compression savings percentage ((1 - comp / orig) * 100)
export function compressionRatio(uncompressedLen: number, compressedLen: number): number {
  if (uncompressedLen === 0) return 0;
  const ratio = ((uncompressedLen - compressedLen) / uncompressedLen) * 100;
  return Number(ratio.toFixed(1));
}

export const compressutils = {
  gzipCompress,
  gzipDecompress,
  gzipCompressString,
  gzipDecompressString,
  deflateCompress,
  deflateDecompress,
  compressionRatio,
};
