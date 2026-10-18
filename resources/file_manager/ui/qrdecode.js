// QR Code reader: finds a QR code in a picture (pixels in, text out) with no library. It works in steps: make the
// picture black and white, find the three big corner squares, work out where every module is (with an alignment-pattern
// correction for tilt and perspective), read the format and version, undo the mask, correct errors with Reed-Solomon,
// and decode the text segments. Pure functions: the caller supplies pixels (see decodeQr).
import {
  blockLayout, dataOrder, decodeFormatBits, decodeVersionBits, maskFlips, rsCorrect, sizeOf, versionOfSize,
} from "./qrtables.js";

// ---------------------------------------------------------------------------------------------------------------
// From a grid of modules to text
// ---------------------------------------------------------------------------------------------------------------

const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const ECI_LABELS = { 1: "iso-8859-1", 3: "iso-8859-1", 4: "iso-8859-2", 5: "iso-8859-3", 6: "iso-8859-4", 7: "iso-8859-5", 9: "iso-8859-7", 11: "iso-8859-9", 15: "iso-8859-15", 20: "shift_jis", 21: "windows-1250", 22: "windows-1251", 23: "windows-1252", 24: "windows-1256", 25: "utf-16be", 26: "utf-8", 27: "us-ascii", 28: "big5", 29: "gb18030", 30: "euc-kr" };

function decodeBytes(bytes, label) {
  if (label) {
    try {
      return { text: new TextDecoder(label === "us-ascii" ? "utf-8" : label).decode(Uint8Array.from(bytes)), binary: false };
    } catch { /* an encoding this engine doesn't know: fall through */ }
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes)), binary: false };
  } catch { /* not UTF-8 */ }
  // Many old codes hold Shift_JIS or Latin-1 without saying so.
  const latin = String.fromCharCode(...bytes);
  return { text: latin, binary: bytes.some((b) => b < 9 || (b > 13 && b < 32)) };
}

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }
  get left() {
    return this.bytes.length * 8 - this.pos;
  }
  read(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      v = (v << 1) | ((this.bytes[this.pos >> 3] >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
}

/** The text segments of a symbol's data codewords. Returns { text, binary, modes, eci, structured } or null when they make no sense. */
export function parseSegments(data, version) {
  const r = new BitReader(data);
  const band = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  const counts = { numeric: [10, 12, 14][band], alnum: [9, 11, 13][band], byte: [8, 16, 16][band], kanji: [8, 10, 12][band] };
  const modes = [];
  const pieces = []; // strings, or { bytes, label }
  let eci = null;
  let structured = null;
  let fnc1 = false;
  while (r.left >= 4) {
    const mode = r.read(4);
    if (mode === 0) break;
    if (mode === 1) {
      let n = r.read(counts.numeric);
      let s = "";
      while (n >= 3) { if (r.left < 10) return null; const v = r.read(10); if (v > 999) return null; s += String(v).padStart(3, "0"); n -= 3; }
      if (n === 2) { if (r.left < 7) return null; const v = r.read(7); if (v > 99) return null; s += String(v).padStart(2, "0"); }
      if (n === 1) { if (r.left < 4) return null; const v = r.read(4); if (v > 9) return null; s += String(v); }
      pieces.push(s);
      modes.push("numeric");
    } else if (mode === 2) {
      let n = r.read(counts.alnum);
      let s = "";
      while (n >= 2) { if (r.left < 11) return null; const v = r.read(11); if (v >= 45 * 45) return null; s += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45]; n -= 2; }
      if (n === 1) { if (r.left < 6) return null; const v = r.read(6); if (v >= 45) return null; s += ALNUM[v]; }
      pieces.push(s);
      modes.push("alnum");
    } else if (mode === 4) {
      const n = r.read(counts.byte);
      if (r.left < n * 8) return null;
      const bytes = [];
      for (let i = 0; i < n; i++) bytes.push(r.read(8));
      pieces.push({ bytes, label: eci ? ECI_LABELS[eci] : null });
      modes.push("byte");
    } else if (mode === 8) {
      const n = r.read(counts.kanji);
      if (r.left < n * 13) return null;
      const bytes = [];
      for (let i = 0; i < n; i++) {
        const v = r.read(13);
        let w = (Math.floor(v / 0xc0) << 8) | (v % 0xc0);
        w += w + 0x8140 <= 0x9ffc ? 0x8140 : 0xc140;
        bytes.push(w >> 8, w & 255);
      }
      pieces.push({ bytes, label: "shift_jis" });
      modes.push("kanji");
    } else if (mode === 7) {
      if (r.left < 8) return null;
      let v = r.read(8);
      if ((v & 0x80) === 0) eci = v;
      else if ((v & 0xc0) === 0x80) eci = ((v & 0x3f) << 8) | r.read(8);
      else eci = ((v & 0x1f) << 16) | r.read(16);
    } else if (mode === 3) {
      if (r.left < 16) return null;
      structured = { index: r.read(4), total: r.read(4) + 1, parity: r.read(8) };
    } else if (mode === 5) fnc1 = true;
    else if (mode === 9) { if (r.left < 8) return null; r.read(8); fnc1 = true; }
    else return null;
  }
  if (!modes.length) return null;
  // Neighbouring byte segments with the same encoding are decoded together, so a character split between them survives.
  let text = "";
  let binary = false;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (typeof p === "string") { text += p; continue; }
    const bytes = [...p.bytes];
    while (i + 1 < pieces.length && typeof pieces[i + 1] !== "string" && pieces[i + 1].label === p.label) bytes.push(...pieces[++i].bytes);
    const d = decodeBytes(bytes, p.label);
    text += d.text;
    binary ||= d.binary;
  }
  return { text, binary, modes: [...new Set(modes)], eci: eci ? ECI_LABELS[eci] ?? `ECI ${eci}` : null, structured, fnc1 };
}

const getModule = (m, size, x, y) => m[y * size + x];

function readFormat(m, size) {
  const at = (x, y) => getModule(m, size, x, y);
  let a = 0;
  for (let i = 0; i <= 5; i++) a |= at(8, i) << i;
  a |= at(8, 7) << 6;
  a |= at(8, 8) << 7;
  a |= at(7, 8) << 8;
  for (let i = 9; i < 15; i++) a |= at(14 - i, 8) << i;
  let b = 0;
  for (let i = 0; i < 8; i++) b |= at(size - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) b |= at(8, size - 15 + i) << i;
  return decodeFormatBits(a) ?? decodeFormatBits(b);
}

function readVersionBits(m, size) {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 18; i++) {
    const p = size - 11 + (i % 3);
    const q = Math.floor(i / 3);
    a |= getModule(m, size, p, q) << i;
    b |= getModule(m, size, q, p) << i;
  }
  return decodeVersionBits(a) || decodeVersionBits(b);
}

function transpose(m, size) {
  const t = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) t[x * size + y] = m[y * size + x];
  return t;
}

function decodeOriented(m, size) {
  const version = versionOfSize(size);
  if (!version) return null;
  if (version >= 7 && readVersionBits(m, size) !== version) return null;
  const fmt = readFormat(m, size);
  if (!fmt) return null;
  const order = dataOrder(version);
  const { blocks, ecc, shortCount, shortLen } = blockLayout(version, fmt.level);
  const total = blocks * shortLen + (blocks - shortCount);
  const words = new Uint8Array(total);
  for (let i = 0; i < total * 8 && i < order.length; i++) {
    const [x, y] = order[i];
    let bit = m[y * size + x];
    if (maskFlips(fmt.mask, x, y)) bit ^= 1;
    words[i >> 3] |= bit << (7 - (i & 7));
  }
  // Undo the interleaving.
  const dataBlocks = [];
  const lens = [];
  for (let j = 0; j < blocks; j++) {
    lens.push(shortLen - ecc + (j < shortCount ? 0 : 1));
    dataBlocks.push(new Uint8Array(shortLen + (j < shortCount ? 0 : 1)));
  }
  let at = 0;
  const longest = shortLen - ecc + 1;
  for (let i = 0; i < longest; i++) for (let j = 0; j < blocks; j++) if (i < lens[j]) dataBlocks[j][i] = words[at++];
  for (let i = 0; i < ecc; i++) for (let j = 0; j < blocks; j++) dataBlocks[j][lens[j] + i] = words[at++];
  let corrected = 0;
  const data = [];
  for (let j = 0; j < blocks; j++) {
    const fixedCount = rsCorrect(dataBlocks[j], ecc);
    if (fixedCount < 0) return null;
    corrected += fixedCount;
    for (let i = 0; i < lens[j]; i++) data.push(dataBlocks[j][i]);
  }
  const parsed = parseSegments(Uint8Array.from(data), version);
  if (!parsed) return null;
  return { ...parsed, version, ecc: fmt.level, mask: fmt.mask, corrected, size, bytes: Uint8Array.from(data) };
}

/** Reads a grid of modules (Uint8Array of size*size, 1 = dark) as a QR code. Also tries the mirror image. Returns the result or null. */
export function decodeMatrix(modules, size) {
  const r = decodeOriented(modules, size);
  if (r) return { ...r, mirrored: false };
  const t = decodeOriented(transpose(modules, size), size);
  return t ? { ...t, mirrored: true } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// From pixels to a grid of modules
// ---------------------------------------------------------------------------------------------------------------

/** Brightness (0-255) of RGBA pixels, with see-through pixels treated as white. */
export function toGray({ data, width, height }) {
  const g = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    const a = data[p + 3] / 255;
    const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    g[i] = Math.round(lum * a + 255 * (1 - a));
  }
  return { gray: g, width, height };
}

/** Shrinks a gray picture by an integer factor, averaging each block (keeps thin lines visible). */
function shrink({ gray, width, height }, factor) {
  if (factor <= 1) return { gray, width, height };
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Uint8Array(w * h);
  const n = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy++) for (let dx = 0; dx < factor; dx++) sum += gray[(y * factor + dy) * width + x * factor + dx];
      out[y * w + x] = Math.round(sum / n);
    }
  }
  return { gray: out, width: w, height: h };
}

/** Enlarges a gray picture by an integer factor with smooth (bilinear) steps. */
function enlarge({ gray, width, height }, factor) {
  const w = width * factor;
  const h = height * factor;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(height - 1, Math.max(0, (y + 0.5) / factor - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(width - 1, Math.max(0, (x + 0.5) / factor - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(width - 1, x0 + 1);
      const tx = fx - x0;
      const top = gray[y0 * width + x0] * (1 - tx) + gray[y0 * width + x1] * tx;
      const bottom = gray[y1 * width + x0] * (1 - tx) + gray[y1 * width + x1] * tx;
      out[y * w + x] = Math.round(top * (1 - ty) + bottom * ty);
    }
  }
  return { gray: out, width: w, height: h };
}

/** Black and white by the average of the neighbourhood (copes with shadows and uneven light). 1 = dark. */
export function binarizeLocal({ gray, width, height }) {
  const bs = Math.max(8, Math.min(32, Math.round(Math.min(width, height) / 40)));
  const bw = Math.ceil(width / bs);
  const bh = Math.ceil(height / bs);
  const black = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      let min = 255;
      let max = 0;
      let n = 0;
      for (let y = by * bs; y < Math.min(height, by * bs + bs); y++) {
        for (let x = bx * bs; x < Math.min(width, bx * bs + bs); x++) {
          const v = gray[y * width + x];
          sum += v;
          if (v < min) min = v;
          if (v > max) max = v;
          n++;
        }
      }
      let avg = sum / n;
      if (max - min <= 24) {
        // A flat block: assume it is light, unless the neighbours say it is dark.
        avg = min / 2;
        if (bx > 0 && by > 0) {
          const nb = (black[(by - 1) * bw + bx] + 2 * black[by * bw + bx - 1] + black[(by - 1) * bw + bx - 1]) / 4;
          if (min < nb) avg = nb;
        }
      }
      black[by * bw + bx] = avg;
    }
  }
  const bits = new Uint8Array(width * height);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const yy = Math.min(bh - 1, Math.max(0, by + dy));
        const xx = Math.min(bw - 1, Math.max(0, bx + dx));
        sum += black[yy * bw + xx];
        n++;
      }
      const threshold = sum / n;
      for (let y = by * bs; y < Math.min(height, by * bs + bs); y++) {
        for (let x = bx * bs; x < Math.min(width, bx * bs + bs); x++) bits[y * width + x] = gray[y * width + x] < threshold ? 1 : 0;
      }
    }
  }
  return { bits, width, height };
}

/** Black and white by one threshold for the whole picture (Otsu's method). 1 = dark. */
export function binarizeGlobal({ gray, width, height }) {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  const bits = new Uint8Array(width * height);
  for (let i = 0; i < bits.length; i++) bits[i] = gray[i] <= threshold ? 1 : 0;
  return { bits, width, height };
}

const invertBits = ({ bits, width, height }) => ({ bits: bits.map((b) => 1 - b), width, height });

// Finder patterns: a row of a finder square reads dark, light, dark, light, dark in the ratio 1:1:3:1:1.
function crossesRatio(c) {
  const total = c[0] + c[1] + c[2] + c[3] + c[4];
  if (total < 7) return false;
  const m = total / 7;
  const v = m * 0.65;
  return Math.abs(m - c[0]) < v && Math.abs(m - c[1]) < v && Math.abs(3 * m - c[2]) < 3 * v && Math.abs(m - c[3]) < v && Math.abs(m - c[4]) < v;
}

function crossCheck(bits, width, height, startX, startY, dx, dy, maxCount, originalTotal) {
  const c = [0, 0, 0, 0, 0];
  const limit = dx ? width : height;
  let p = dx ? startX : startY;
  const at = (q) => (dx ? bits[startY * width + q] : bits[q * width + startX]);
  while (p >= 0 && at(p) === 1) { c[2]++; p--; }
  if (p < 0) return NaN;
  while (p >= 0 && at(p) === 0 && c[1] <= maxCount) { c[1]++; p--; }
  if (p < 0 || c[1] > maxCount) return NaN;
  while (p >= 0 && at(p) === 1 && c[0] <= maxCount) { c[0]++; p--; }
  if (c[0] > maxCount) return NaN;
  p = (dx ? startX : startY) + 1;
  while (p < limit && at(p) === 1) { c[2]++; p++; }
  if (p >= limit) return NaN;
  while (p < limit && at(p) === 0 && c[3] < maxCount) { c[3]++; p++; }
  if (p >= limit || c[3] >= maxCount) return NaN;
  while (p < limit && at(p) === 1 && c[4] < maxCount) { c[4]++; p++; }
  if (c[4] >= maxCount) return NaN;
  const total = c[0] + c[1] + c[2] + c[3] + c[4];
  if (5 * Math.abs(total - originalTotal) >= 2 * originalTotal) return NaN;
  return crossesRatio(c) ? p - c[4] - c[3] - c[2] / 2 : NaN;
}

/** Candidate finder-pattern centers: [{ x, y, size (module size), count }]. */
export function findFinders({ bits, width, height }) {
  const found = [];
  const add = (cx, cy, total) => {
    const size = total / 7;
    for (const f of found) {
      if (Math.abs(f.x - cx) <= f.size && Math.abs(f.y - cy) <= f.size && (Math.abs(f.size - size) <= f.size || Math.abs(f.size - size) <= 1)) {
        const n = f.count + 1;
        f.x = (f.x * f.count + cx) / n;
        f.y = (f.y * f.count + cy) / n;
        f.size = (f.size * f.count + size) / n;
        f.count = n;
        return;
      }
    }
    found.push({ x: cx, y: cy, size, count: 1 });
  };
  const handle = (state, y, endX) => {
    const total = state[0] + state[1] + state[2] + state[3] + state[4];
    let cx = endX - state[4] - state[3] - state[2] / 2;
    const cy = crossCheck(bits, width, height, Math.floor(cx), y, 0, 1, state[2], total);
    if (Number.isNaN(cy)) return;
    cx = crossCheck(bits, width, height, Math.floor(cx), Math.floor(cy), 1, 0, state[2], total);
    if (Number.isNaN(cx)) return;
    add(cx, cy, total);
  };
  const step = height > 1200 ? 2 : 1;
  for (let y = 0; y < height; y += step) {
    const state = [0, 0, 0, 0, 0];
    let cur = 0;
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x] === 1) {
        if (cur & 1) cur++;
        state[cur]++;
      } else if (cur & 1) state[cur]++;
      else if (cur === 4) {
        if (crossesRatio(state)) {
          handle(state, y, x);
          state[0] = state[2]; state[1] = state[3]; state[2] = state[4]; state[3] = 1; state[4] = 0; cur = 3;
        } else {
          state[0] = state[2]; state[1] = state[3]; state[2] = state[4]; state[3] = 1; state[4] = 0; cur = 3;
        }
      } else state[++cur]++;
    }
    if (cur === 4 && crossesRatio(state)) handle(state, y, width);
  }
  return found;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** The most likely triples of finder patterns (corner squares), best first. */
export function chooseTriples(found) {
  const good = found.filter((f) => f.count >= 2).sort((a, b) => b.count - a.count).slice(0, 12);
  const pool = good.length >= 3 ? good : found.slice().sort((a, b) => b.count - a.count).slice(0, 8);
  const out = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const t = [pool[i], pool[j], pool[k]];
        const sizes = t.map((p) => p.size);
        if (Math.max(...sizes) / Math.min(...sizes) > 1.7) continue;
        const d = [dist(t[0], t[1]), dist(t[1], t[2]), dist(t[0], t[2])].sort((a, b) => a - b);
        const mod = (sizes[0] + sizes[1] + sizes[2]) / 3;
        if (d[0] < 9 * mod) continue;
        const score = Math.abs(d[0] - d[1]) / d[0] + Math.abs(d[2] / d[0] - Math.SQRT2);
        if (score < 0.45) out.push({ t, score });
      }
    }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 5).map((o) => o.t);
}

/** Puts three finder patterns in order: top-left, top-right, bottom-left. */
export function orderTriple(t) {
  const [a, b, c] = t;
  const ab = dist(a, b);
  const bc = dist(b, c);
  const ac = dist(a, c);
  let tl;
  let p;
  let q;
  if (bc >= ab && bc >= ac) [tl, p, q] = [a, b, c];
  else if (ac >= ab && ac >= bc) [tl, p, q] = [b, a, c];
  else [tl, p, q] = [c, a, b];
  const cross = (p.x - tl.x) * (q.y - tl.y) - (p.y - tl.y) * (q.x - tl.x);
  return cross > 0 ? { tl, tr: p, bl: q } : { tl, tr: q, bl: p };
}

function solve(a, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[max][i])) max = r;
    [a[i], a[max]] = [a[max], a[i]];
    [b[i], b[max]] = [b[max], b[i]];
    if (Math.abs(a[i][i]) < 1e-12) return null;
    for (let r = i + 1; r < n; r++) {
      const f = a[r][i] / a[i][i];
      for (let c = i; c < n; c++) a[r][c] -= f * a[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= a[i][c] * x[c];
    x[i] = s / a[i][i];
  }
  return x;
}

/** A function that turns module coordinates (u, v) into picture coordinates, from four known pairs. */
export function homography(src, dst) {
  const a = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i];
    const [x, y] = dst[i];
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    a.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const h = solve(a, b);
  if (!h) return null;
  return (u, v) => {
    const d = h[6] * u + h[7] * v + 1;
    return [(h[0] * u + h[1] * v + h[2]) / d, (h[3] * u + h[4] * v + h[5]) / d];
  };
}

/** Looks near (ex, ey) for an alignment pattern: a dark center in a light ring, one module wide each. */
function findAlignment({ bits, width, height }, ex, ey, mod, reachModules = 4.5) {
  const reach = Math.ceil(mod * reachModules);
  const x0 = Math.max(0, Math.floor(ex - reach));
  const x1 = Math.min(width - 1, Math.ceil(ex + reach));
  const y0 = Math.max(0, Math.floor(ey - reach));
  const y1 = Math.min(height - 1, Math.ceil(ey + reach));
  const near = (a, b) => Math.abs(a - b) < mod * 0.6;
  let best = null;
  const consider = (cx, cy) => {
    const d = Math.hypot(cx - ex, cy - ey);
    if (!best || d < best.d) best = { x: cx, y: cy, d };
  };
  for (let y = y0; y <= y1; y++) {
    let x = x0;
    const runs = [];
    let color = bits[y * width + x0];
    let start = x0;
    for (x = x0 + 1; x <= x1 + 1; x++) {
      const c = x <= x1 ? bits[y * width + x] : -1;
      if (c !== color) {
        runs.push({ color, start, len: x - start });
        color = c;
        start = x;
      }
    }
    for (let i = 1; i + 1 < runs.length; i++) {
      const [l1, d, l2] = [runs[i - 1], runs[i], runs[i + 1]];
      if (d.color !== 1 || l1.color !== 0 || l2.color !== 0) continue;
      if (!near(d.len, mod) || !near(l1.len, mod) || !near(l2.len, mod)) continue;
      const cx = d.start + d.len / 2;
      // The same pattern must show going down the middle of it.
      let up = 0;
      let yy = y;
      while (yy >= 0 && bits[yy * width + Math.floor(cx)] === 1) { up++; yy--; }
      let lightUp = 0;
      while (yy >= 0 && bits[yy * width + Math.floor(cx)] === 0 && lightUp <= mod * 2) { lightUp++; yy--; }
      let down = 0;
      yy = y + 1;
      while (yy < height && bits[yy * width + Math.floor(cx)] === 1) { down++; yy++; }
      let lightDown = 0;
      while (yy < height && bits[yy * width + Math.floor(cx)] === 0 && lightDown <= mod * 2) { lightDown++; yy++; }
      if (near(up + down, mod) && near(lightUp, mod) && near(lightDown, mod)) consider(cx, y - up + (up + down) / 2);
    }
  }
  return best && best.d <= reach ? best : null;
}

/** Reads the grid of modules of a code with the given finder patterns, side length and (optionally) alignment pattern. */
/** `alignment`: 0 = don't look for the alignment pattern, otherwise how many modules around the expected place to search. */
function sampleGrid(img, order, dim, alignment) {
  const { tl, tr, bl } = order;
  const mod = (tl.size + tr.size + bl.size) / 3;
  const corner = { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y };
  const src = [[3.5, 3.5], [dim - 3.5, 3.5], [3.5, dim - 3.5]];
  const dst = [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y]];
  let fourth = [corner.x, corner.y];
  let fourthSrc = [dim - 3.5, dim - 3.5];
  if (alignment && dim >= 25) {
    // Where the alignment pattern would be if the code were flat, to start looking from.
    const k = (dim - 10) / (dim - 7);
    const ex = tl.x + (tr.x - tl.x) * k + (bl.x - tl.x) * k;
    const ey = tl.y + (tr.y - tl.y) * k + (bl.y - tl.y) * k;
    const ap = findAlignment(img, ex, ey, mod, alignment);
    if (ap) {
      fourth = [ap.x, ap.y];
      fourthSrc = [dim - 6.5, dim - 6.5];
    }
  }
  const h = homography([...src, fourthSrc], [...dst, fourth]);
  if (!h) return null;
  const m = new Uint8Array(dim * dim);
  const { bits, width, height } = img;
  const offsets = [[0, 0], [-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]];
  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      let dark = 0;
      for (const [ox, oy] of offsets) {
        const [px, py] = h(x + 0.5 + ox, y + 0.5 + oy);
        const ix = Math.round(px - 0.5);
        const iy = Math.round(py - 0.5);
        if (ix < 0 || iy < 0 || ix >= width || iy >= height) return null;
        dark += bits[iy * width + ix];
      }
      m[y * dim + x] = dark >= 3 ? 1 : 0;
    }
  }
  return m;
}

function tryDecodeTriple(img, triple) {
  const order = orderTriple(triple);
  const mod = (order.tl.size + order.tr.size + order.bl.size) / 3;
  const across = (dist(order.tl, order.tr) + dist(order.tl, order.bl)) / 2;
  const estimate = across / mod + 7;
  const first = Math.round((estimate - 17) / 4);
  const versions = [first, first - 1, first + 1, first - 2, first + 2].filter((v, i, all) => v >= 1 && v <= 40 && all.indexOf(v) === i);
  for (const v of versions) {
    const dim = sizeOf(v);
    for (const alignment of v < 2 ? [0] : [4.5, 8, 13, 0]) {
      const grid = sampleGrid(img, order, dim, alignment);
      if (!grid) continue;
      const r = decodeMatrix(grid, dim);
      if (r) return { ...r, corners: order };
    }
  }
  return null;
}

/** Tries to find and read one QR code in a binarised picture. */
export function decodeBits(img) {
  const finders = findFinders(img);
  if (finders.length < 3) return null;
  for (const triple of chooseTriples(finders)) {
    const r = tryDecodeTriple(img, triple);
    if (r) return r;
  }
  return null;
}

/**
 * Finds and reads a QR code in a picture: `{ data (RGBA), width, height }` as from canvas getImageData.
 * Returns { text, binary, modes, eci, version, ecc, mask, corrected, mirrored, size, bytes, corners, scale } or null.
 * The `corners` are in the coordinates of the picture given.
 */
export function decodeQr(image) {
  for (const attempt of attempts(image)) {
    const r = attempt();
    if (r) return r;
  }
  return null;
}

/** The same, but gives the page a moment between attempts (and stops when `signal` is aborted). */
export async function decodeQrAsync(image, signal) {
  for (const attempt of attempts(image)) {
    if (signal?.aborted) return null;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const r = attempt();
    if (r) return r;
  }
  return null;
}

/** The ways to try, cheapest and likeliest first: normal and inverted, two kinds of black-and-white, a few sizes. */
function* attempts(image) {
  const base = toGray(image);
  const side = Math.max(base.width, base.height);
  const small = Math.min(base.width, base.height);
  const scales = [];
  if (side > 2400) scales.push(Math.ceil(side / 1600));
  else scales.push(1);
  if (side > 900) scales.push(Math.max(2, Math.ceil(side / 700)));
  if (side > 3000) scales.push(Math.ceil(side / 400));
  if (small < 220) scales.push(0.5, 0.25);
  const seen = new Set();
  for (const s of scales) {
    if (seen.has(s)) continue;
    seen.add(s);
    let g;
    const enlargeBy = s < 1 ? Math.round(1 / s) : 0;
    const getGray = () => (g ??= enlargeBy ? enlarge(base, enlargeBy) : shrink(base, s));
    for (const kind of ["local", "global"]) {
      for (const inverted of [false, true]) {
        yield () => {
          const gray = getGray();
          let bin = kind === "local" ? binarizeLocal(gray) : binarizeGlobal(gray);
          if (inverted) bin = invertBits(bin);
          const r = decodeBits(bin);
          if (!r) return null;
          const k = enlargeBy ? 1 / enlargeBy : s;
          const scale = (p) => ({ x: p.x * k, y: p.y * k, size: p.size * k });
          return { ...r, corners: { tl: scale(r.corners.tl), tr: scale(r.corners.tr), bl: scale(r.corners.bl) }, scale: k, inverted };
        };
      }
    }
  }
}
