/**
 * Where incoming bytes come from (a file on disk or pasted text), and how they become text.
 * Nothing here loads a whole file: bytes are read in chunks and decoded as a stream.
 */
import { statSync } from "fs";
import { StagingError, limitMessage, limits } from "./limits";

export type EncodingName = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

export interface EncodingInfo {
  encoding: EncodingName;
  /** Bytes of byte-order mark to skip. */
  bomBytes: number;
  /** Plain-words name for the screen. */
  label: string;
}

export const ENCODING_LABELS: Record<EncodingName, string> = {
  "utf-8": "UTF-8",
  "utf-16le": "UTF-16 (little-endian)",
  "utf-16be": "UTF-16 (big-endian)",
  "windows-1252": "Latin-1 / Windows-1252 (older Western text)",
};

export const isEncodingName = (v: unknown): v is EncodingName => typeof v === "string" && v in ENCODING_LABELS;

export interface ByteSource {
  /** File name for display (never a path). */
  name: string;
  size: number;
  /** The first bytes, enough to detect the format. */
  sample(bytes?: number): Promise<Uint8Array>;
  /** Every byte, in chunks. May be called more than once. */
  chunks(): AsyncIterable<Uint8Array>;
}

export function fileSource(path: string, name?: string): ByteSource {
  const st = statSync(path);
  if (!st.isFile()) throw new StagingError("That is not a file.", "NOT_A_FILE");
  if (st.size > limits.maxFileBytes) throw new StagingError(limitMessage("file"), "FILE_TOO_BIG", 413);
  const file = Bun.file(path);
  return {
    name: name ?? path.split(/[\\/]/).pop() ?? "file",
    size: st.size,
    async sample(bytes = 65536) {
      return new Uint8Array(await file.slice(0, bytes).arrayBuffer());
    },
    chunks() {
      return Bun.file(path).stream() as unknown as AsyncIterable<Uint8Array>;
    },
  };
}

export function memorySource(text: string, name = "pasted text"): ByteSource {
  if (text.length > limits.maxPasteChars) throw new StagingError(limitMessage("paste"), "PASTE_TOO_BIG", 413);
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.byteLength,
    async sample(n = 65536) {
      return bytes.subarray(0, n);
    },
    async *chunks() {
      for (let i = 0; i < bytes.length; i += 1 << 16) yield bytes.subarray(i, i + (1 << 16));
    },
  };
}

function validUtf8(sample: Uint8Array): boolean {
  // A sample may end in the middle of a character: ignore an incomplete sequence at the very end, but nothing else.
  let end = sample.length;
  for (let i = end - 1; i >= Math.max(0, end - 3); i--) {
    const b = sample[i]!;
    if ((b & 0xc0) === 0x80) continue;
    if (b >= 0xc0) {
      const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2;
      if (end - i < need) end = i;
    }
    break;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, end));
    return true;
  } catch {
    return false;
  }
}

export function detectEncoding(sample: Uint8Array): EncodingInfo {
  const info = (encoding: EncodingName, bomBytes = 0): EncodingInfo => ({ encoding, bomBytes, label: ENCODING_LABELS[encoding] });
  if (sample.length >= 3 && sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) return info("utf-8", 3);
  if (sample.length >= 2 && sample[0] === 0xff && sample[1] === 0xfe) return info("utf-16le", 2);
  if (sample.length >= 2 && sample[0] === 0xfe && sample[1] === 0xff) return info("utf-16be", 2);
  const n = Math.min(sample.length, 4096);
  if (n >= 4) {
    let even = 0;
    let odd = 0;
    for (let i = 0; i < n; i++) if (sample[i] === 0) (i % 2 === 0 ? even++ : odd++);
    const half = n / 2;
    if (odd > half * 0.3 && even < half * 0.05) return info("utf-16le");
    if (even > half * 0.3 && odd < half * 0.05) return info("utf-16be");
  }
  return validUtf8(sample) ? info("utf-8") : info("windows-1252");
}

/** Decodes a byte stream to text chunks. Counts characters that could not be read in `stats.replaced`. */
export async function* decodeChunks(chunks: AsyncIterable<Uint8Array>, enc: EncodingInfo, stats: { replaced: number } = { replaced: 0 }): AsyncGenerator<string> {
  const decoder = new TextDecoder(enc.encoding as any, { fatal: false, ignoreBOM: true });
  let skip = enc.bomBytes;
  let sawStart = false;
  for await (let chunk of chunks) {
    if (skip > 0) {
      const drop = Math.min(skip, chunk.length);
      chunk = chunk.subarray(drop);
      skip -= drop;
      if (!chunk.length) continue;
    }
    let text = decoder.decode(chunk, { stream: true });
    if (!sawStart && text) {
      sawStart = true;
      // A BOM that survived (for example UTF-8 text declared as Latin-1) must not end up in the first header name.
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    if (text && enc.encoding === "utf-8" && text.includes("\ufffd")) stats.replaced += text.split("\ufffd").length - 1;
    if (text) yield text;
  }
  const tail = decoder.decode();
  if (tail) {
    if (tail.includes("\ufffd")) stats.replaced += tail.split("\ufffd").length - 1;
    yield tail;
  }
}
