// Animated GIF reader: pulls the frames, their delays and the loop count out of a GIF file, and joins them into whole
// pictures (undoing the "leave", "clear" and "go back" rules each frame carries). Pure functions on bytes; the viewer
// (gifviewer.js) draws and plays the result. No library.

export class GifError extends Error {}

const CLEAR_DELAY_MS = 100;

/** How long a frame is shown: browsers treat a delay of 0 or 1 hundredth of a second as 0.1 s, and so do we. */
export const frameMs = (delayCs) => (delayCs <= 1 ? CLEAR_DELAY_MS : delayCs * 10);

function lzwDecode(data, minCodeSize, pixelCount) {
  const out = new Uint8Array(pixelCount);
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const prefix = new Uint16Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  let size = minCodeSize + 1;
  let mask = (1 << size) - 1;
  let next = end + 1;
  let prev = -1;
  let first = 0;
  let bits = 0;
  let acc = 0;
  let pos = 0;
  let o = 0;
  for (let i = 0; i < clear; i++) suffix[i] = i;
  while (o < pixelCount) {
    while (bits < size) {
      if (pos >= data.length) return { pixels: out, filled: o };
      acc |= data[pos++] << bits;
      bits += 8;
    }
    let code = acc & mask;
    acc >>>= size;
    bits -= size;
    if (code === clear) {
      size = minCodeSize + 1;
      mask = (1 << size) - 1;
      next = end + 1;
      prev = -1;
      continue;
    }
    if (code === end) break;
    if (prev === -1) {
      if (code >= clear) throw new GifError("The picture data is damaged.");
      out[o++] = suffix[code];
      prev = code;
      first = code;
      continue;
    }
    const incoming = code;
    let sp = 0;
    if (code >= next) {
      if (code > next) throw new GifError("The picture data is damaged.");
      stack[sp++] = first;
      code = prev;
    }
    while (code >= clear) {
      if (sp >= 4096) throw new GifError("The picture data is damaged.");
      stack[sp++] = suffix[code];
      code = prefix[code];
    }
    first = suffix[code];
    stack[sp++] = first;
    if (next < 4096) {
      prefix[next] = prev;
      suffix[next] = first;
      next++;
      if ((next & mask) === 0 && next < 4096) {
        size++;
        mask = (1 << size) - 1;
      }
    }
    prev = incoming;
    while (sp > 0 && o < pixelCount) out[o++] = stack[--sp];
  }
  return { pixels: out, filled: o };
}

function deinterlace(pixels, w, h) {
  const out = new Uint8Array(pixels.length);
  let src = 0;
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) {
    for (let y = start; y < h; y += step) {
      out.set(pixels.subarray(src * w, src * w + w), y * w);
      src++;
    }
  }
  return out;
}

/**
 * Reads a GIF. Returns { width, height, loop (0 = forever, -1 = play once, n = n more times), frames: [{ x, y, w, h, delay (hundredths of a
 * second), disposal, transparent (palette index or -1), palette (Uint8Array of r,g,b), pixels (Uint8Array of palette indices) }], comment }.
 * Throws GifError (with a sentence) when the file is not a GIF or is too damaged to read.
 */
export function parseGif(bytes, { maxFrames = 2000 } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sig = String.fromCharCode(...b.subarray(0, 6));
  if (sig !== "GIF87a" && sig !== "GIF89a") throw new GifError("This isn't a GIF file.");
  const u16 = (i) => b[i] | (b[i + 1] << 8);
  const width = u16(6);
  const height = u16(8);
  if (!width || !height) throw new GifError("This GIF has no size.");
  const flags = b[10];
  let p = 13;
  let globalPalette = null;
  if (flags & 0x80) {
    const n = 3 * (2 << (flags & 7));
    globalPalette = b.subarray(p, p + n);
    p += n;
  }
  const frames = [];
  let loop = -1;
  let comment = "";
  let gce = { delay: 0, disposal: 0, transparent: -1 };
  const skipBlocks = () => {
    while (p < b.length && b[p] !== 0) p += b[p] + 1;
    p++;
  };
  while (p < b.length) {
    const tag = b[p++];
    if (tag === 0x3b) break;
    if (tag === 0x21) {
      const label = b[p++];
      if (label === 0xf9 && b[p] === 4) {
        const f = b[p + 1];
        gce = { disposal: (f >> 2) & 7, delay: u16(p + 2), transparent: f & 1 ? b[p + 4] : -1 };
        p += 6;
        continue;
      }
      if (label === 0xff && b[p] === 11) {
        const name = String.fromCharCode(...b.subarray(p + 1, p + 12));
        p += 12;
        if ((name === "NETSCAPE2.0" || name === "ANIMEXTS1.0") && b[p] >= 3 && b[p + 1] === 1) loop = u16(p + 2);
        skipBlocks();
        continue;
      }
      if (label === 0xfe) {
        let text = "";
        while (p < b.length && b[p] !== 0) {
          text += String.fromCharCode(...b.subarray(p + 1, p + 1 + b[p]));
          p += b[p] + 1;
        }
        p++;
        comment = comment || text.slice(0, 500);
        continue;
      }
      skipBlocks();
      continue;
    }
    if (tag !== 0x2c) throw new GifError("This GIF is damaged (an unknown part was found).");
    if (p + 9 > b.length) break;
    const x = u16(p);
    const y = u16(p + 2);
    const w = u16(p + 4);
    const h = u16(p + 6);
    const f = b[p + 8];
    p += 9;
    let palette = globalPalette;
    if (f & 0x80) {
      const n = 3 * (2 << (f & 7));
      palette = b.subarray(p, p + n);
      p += n;
    }
    if (!palette) throw new GifError("This GIF has no colors.");
    const minCode = b[p++];
    if (minCode < 1 || minCode > 11) throw new GifError("This GIF is damaged (a bad color size).");
    const chunks = [];
    let total = 0;
    while (p < b.length && b[p] !== 0) {
      chunks.push(b.subarray(p + 1, p + 1 + b[p]));
      total += b[p];
      p += b[p] + 1;
    }
    p++;
    const data = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { data.set(c, at); at += c.length; }
    const decoded = lzwDecode(data, minCode, w * h);
    let pixels = decoded.pixels;
    if (f & 0x40) pixels = deinterlace(pixels, w, h);
    frames.push({ x, y, w, h, delay: gce.delay, disposal: gce.disposal, transparent: gce.transparent, palette, pixels, partial: decoded.filled < w * h });
    gce = { delay: 0, disposal: 0, transparent: -1 };
    if (frames.length > maxFrames) throw new GifError(`This GIF has more than ${maxFrames} frames, which is too many to show frame by frame.`);
  }
  if (!frames.length) throw new GifError("This GIF has no pictures in it.");
  return { width, height, loop, frames, comment };
}

/** Total time of one pass in milliseconds. */
export const durationMs = (gif) => gif.frames.reduce((sum, f) => sum + frameMs(f.delay), 0);

/** The memory the joined frames take, in bytes. */
export const composedBytes = (gif) => gif.width * gif.height * 4 * gif.frames.length;

/**
 * Joins the frames into whole pictures: an array of Uint8ClampedArray (RGBA, width*height*4), one per frame. A frame's
 * "disposal" says what to do with its area before the next one: 0/1 leave it, 2 clear it, 3 put back what was there before.
 */
export function composeFrames(gif) {
  const { width: W, height: H } = gif;
  const out = [];
  let canvas = new Uint8ClampedArray(W * H * 4);
  let before = null;
  let prev = null;
  for (const f of gif.frames) {
    if (prev) {
      if (prev.disposal === 2) {
        for (let y = prev.y; y < Math.min(H, prev.y + prev.h); y++) canvas.fill(0, (y * W + prev.x) * 4, (y * W + Math.min(W, prev.x + prev.w)) * 4);
      } else if (prev.disposal === 3 && before) canvas = new Uint8ClampedArray(before);
    }
    before = f.disposal === 3 ? new Uint8ClampedArray(canvas) : null;
    const pal = f.palette;
    for (let row = 0; row < f.h; row++) {
      const y = f.y + row;
      if (y >= H) break;
      for (let col = 0; col < f.w; col++) {
        const x = f.x + col;
        if (x >= W) break;
        const idx = f.pixels[row * f.w + col];
        if (idx === f.transparent) continue;
        const o = (y * W + x) * 4;
        canvas[o] = pal[idx * 3];
        canvas[o + 1] = pal[idx * 3 + 1];
        canvas[o + 2] = pal[idx * 3 + 2];
        canvas[o + 3] = 255;
      }
    }
    out.push(new Uint8ClampedArray(canvas));
    prev = f;
  }
  return out;
}

/** A few facts to show next to the picture. */
export function describeGif(gif) {
  const ms = durationMs(gif);
  const n = gif.frames.length;
  return {
    frames: n,
    seconds: ms / 1000,
    fps: n > 1 && ms > 0 ? Math.round(((n * 1000) / ms) * 10) / 10 : 0,
    loop: gif.loop === 0 ? "forever" : gif.loop < 0 ? "once" : `${gif.loop + 1} times`,
    animated: n > 1,
    transparent: gif.frames.some((f) => f.transparent >= 0),
  };
}
