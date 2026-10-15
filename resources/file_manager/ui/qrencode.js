// QR Code encoder: text (or bytes) in, a square of dark and light modules out. Follows ISO/IEC 18004 (Model 2): numeric,
// alphanumeric and byte modes, versions 1 to 40, error-correction levels L M Q H, automatic choice of the best mask.
// Pure functions; the picture is drawn elsewhere (qrrender.js).
import {
  ECC_LEVELS, MAX_VERSION, MIN_VERSION, alignmentPositions, blockLayout, dataCodewords, dataOrder, formatBits, functionMask, maskFlips, rsEncode, sizeOf, versionBits,
} from "./qrtables.js";

export class QrError extends Error {}

const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const MODE_BITS = { numeric: 1, alnum: 2, byte: 4, eci: 7 };
const countBits = (mode, version) => {
  const band = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  return { numeric: [10, 12, 14], alnum: [9, 11, 13], byte: [8, 16, 16] }[mode][band];
};

export const isNumeric = (s) => /^[0-9]*$/.test(s);
export const isAlnum = (s) => [...s].every((c) => ALNUM.includes(c));

/** The cheapest mode that can hold all of the text. */
export function bestMode(text) {
  if (text !== "" && isNumeric(text)) return "numeric";
  if (text !== "" && isAlnum(text)) return "alnum";
  return "byte";
}

class Bits {
  constructor() {
    this.bits = [];
  }
  push(value, count) {
    for (let i = count - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() {
    return this.bits.length;
  }
}

/** The bits of one text segment (without the mode and count), and how many characters it counts. */
function segmentData(mode, text, bytes) {
  const b = new Bits();
  if (mode === "numeric") {
    for (let i = 0; i < text.length; i += 3) {
      const part = text.slice(i, i + 3);
      b.push(Number(part), part.length * 3 + 1);
    }
    return { bits: b, count: text.length };
  }
  if (mode === "alnum") {
    for (let i = 0; i < text.length; i += 2) {
      if (i + 1 < text.length) b.push(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
      else b.push(ALNUM.indexOf(text[i]), 6);
    }
    return { bits: b, count: text.length };
  }
  for (const v of bytes) b.push(v, 8);
  return { bits: b, count: bytes.length };
}

/** The number of bits the data takes at a version, with the mode and count fields. */
function dataLength(mode, seg, version, eci) {
  return (eci ? 12 : 0) + 4 + countBits(mode, version) + seg.bits.length;
}

const getBit = (value, i) => (value >>> i) & 1;

/**
 * Makes a QR code.
 *  text: a string (sent as UTF-8) or a Uint8Array of bytes.
 *  options: { ecc: "L"|"M"|"Q"|"H" (default "M"), minVersion, maxVersion, mask (0-7, default: the best), boostEcc (raise the level when it costs no size), eci (mark the bytes as UTF-8) }
 * Returns { version, ecc, mask, size, modules (Uint8Array of size*size, 1 = dark), mode, capacityBytes }.
 */
export function encodeQr(text, options = {}) {
  let ecc = options.ecc ?? "M";
  if (!ECC_LEVELS.includes(ecc)) throw new QrError("The error-correction level must be L, M, Q or H.");
  const minVersion = Math.max(MIN_VERSION, options.minVersion ?? MIN_VERSION);
  const maxVersion = Math.min(MAX_VERSION, options.maxVersion ?? MAX_VERSION);
  const isBytes = text instanceof Uint8Array;
  const bytes = isBytes ? text : new TextEncoder().encode(text);
  const mode = isBytes ? "byte" : bestMode(text);
  const eci = !!options.eci && mode === "byte";
  const seg = segmentData(mode, isBytes ? "" : text, bytes);

  let version = 0;
  for (let v = minVersion; v <= maxVersion; v++) {
    if (dataLength(mode, seg, v, eci) <= dataCodewords(v, ecc) * 8 && seg.count < 2 ** countBits(mode, v)) {
      version = v;
      break;
    }
  }
  if (!version) {
    const best = maxCapacity(mode, ecc);
    throw new QrError(`That is too much for one QR code at level ${ecc} (the most is about ${best.toLocaleString()} ${mode === "byte" ? "bytes" : "characters"}${bytes.length !== (isBytes ? bytes.length : text.length) ? "; accented and other non-English letters take 2 to 4 bytes each" : ""}). Use a lower error-correction level, or shorten the text.`);
  }
  if (options.boostEcc) {
    for (const level of ["M", "Q", "H"]) {
      if (ECC_LEVELS.indexOf(level) > ECC_LEVELS.indexOf(ecc) && dataLength(mode, seg, version, eci) <= dataCodewords(version, level) * 8) ecc = level;
    }
  }

  const out = new Bits();
  if (eci) {
    out.push(MODE_BITS.eci, 4);
    out.push(26, 8);
  }
  out.push(MODE_BITS[mode], 4);
  out.push(seg.count, countBits(mode, version));
  out.bits.push(...seg.bits.bits);
  const capacityBits = dataCodewords(version, ecc) * 8;
  out.push(0, Math.min(4, capacityBits - out.length));
  out.push(0, (8 - (out.length % 8)) % 8);
  for (let pad = 0xec; out.length < capacityBits; pad ^= 0xec ^ 0x11) out.push(pad, 8);
  const data = new Uint8Array(out.length / 8);
  out.bits.forEach((bit, i) => (data[i >> 3] |= bit << (7 - (i & 7))));

  const codewords = interleave(data, version, ecc);
  const size = sizeOf(version);
  const base = new Uint8Array(size * size);
  const fixed = functionMask(version);
  placeData(base, codewords, version);

  let mask = options.mask;
  let modules;
  if (Number.isInteger(mask) && mask >= 0 && mask <= 7) {
    modules = withMask(base, fixed, version, ecc, mask);
  } else {
    let bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      const candidate = withMask(base, fixed, version, ecc, m);
      const score = penalty(candidate, size);
      if (score < bestScore) {
        bestScore = score;
        mask = m;
        modules = candidate;
      }
    }
  }
  return { version, ecc, mask, size, modules, mode, capacityBytes: dataCodewords(version, ecc) };
}

/** The most characters (or bytes) that fit at a level, in the largest version. */
export function maxCapacity(mode, ecc) {
  const bits = dataCodewords(MAX_VERSION, ecc) * 8 - 4 - countBits(mode, MAX_VERSION);
  if (mode === "numeric") return Math.floor((bits / 10) * 3);
  if (mode === "alnum") return Math.floor((bits / 11) * 2);
  return Math.floor(bits / 8);
}

/** Splits the data into blocks, adds error correction to each, and interleaves them. */
function interleave(data, version, level) {
  const { blocks, ecc, shortCount, shortLen } = blockLayout(version, level);
  const dataBlocks = [];
  const eccBlocks = [];
  let at = 0;
  for (let i = 0; i < blocks; i++) {
    const len = shortLen - ecc + (i < shortCount ? 0 : 1);
    const block = data.subarray(at, at + len);
    at += len;
    dataBlocks.push(block);
    eccBlocks.push(rsEncode(block, ecc));
  }
  const out = [];
  const longest = shortLen - ecc + 1;
  for (let i = 0; i < longest; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecc; i++) for (const b of eccBlocks) out.push(b[i]);
  return out;
}

function placeData(modules, codewords, version) {
  const size = sizeOf(version);
  const order = dataOrder(version);
  for (let i = 0; i < order.length; i++) {
    const [x, y] = order[i];
    const bit = i < codewords.length * 8 ? getBit(codewords[i >> 3], 7 - (i & 7)) : 0;
    modules[y * size + x] = bit;
  }
}

/** A copy of the symbol with the mask applied and all fixed patterns drawn. */
function withMask(base, fixed, version, level, mask) {
  const size = sizeOf(version);
  const m = new Uint8Array(base);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y * size + x] && maskFlips(mask, x, y)) m[y * size + x] ^= 1;
  const set = (x, y, v) => {
    if (x >= 0 && y >= 0 && x < size && y < size) m[y * size + x] = v ? 1 : 0;
  };
  // The timing lines go first: the finder patterns are drawn over their ends.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, dist !== 2 && dist !== 4);
    }
  }
  const a = alignmentPositions(version);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === a.length - 1) || (i === a.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a[i] + dx, a[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // The two copies of the format information, and the always-dark module.
  const bits = formatBits(level, mask);
  for (let i = 0; i <= 5; i++) set(8, i, getBit(bits, i));
  set(8, 7, getBit(bits, 6));
  set(8, 8, getBit(bits, 7));
  set(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, getBit(bits, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, getBit(bits, i));
  set(8, size - 8, true);
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = getBit(vb, i);
      const p = size - 11 + (i % 3);
      const q = Math.floor(i / 3);
      set(p, q, bit);
      set(q, p, bit);
    }
  }
  return m;
}

/** How hard a pattern is for a reader (ISO 18004 section 7.8.3): lower is better. */
export function penalty(m, size) {
  let score = 0;
  const at = (x, y) => m[y * size + x];
  const FINDER_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const FINDER_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const lineScore = (get) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) s += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) s += 3 + (run - 5);
    for (let i = 0; i + 11 <= size; i++) {
      let a = true;
      let b = true;
      for (let k = 0; k < 11 && (a || b); k++) {
        const v = get(i + k);
        if (v !== FINDER_A[k]) a = false;
        if (v !== FINDER_B[k]) b = false;
      }
      if (a) s += 40;
      if (b) s += 40;
    }
    return s;
  };
  for (let y = 0; y < size; y++) score += lineScore((i) => at(i, y));
  for (let x = 0; x < size; x++) score += lineScore((i) => at(x, i));
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = at(x, y);
      dark += v;
      if (x + 1 < size && y + 1 < size && v === at(x + 1, y) && v === at(x, y + 1) && v === at(x + 1, y + 1)) score += 3;
    }
  }
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}
