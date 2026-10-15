// QR Code (ISO/IEC 18004, Model 2) tables and maths shared by the encoder and the reader: sizes, error-correction block
// layout, Reed-Solomon arithmetic, which modules are fixed patterns, and the order data modules are read in.
// Pure functions; no page, no server.

export const ECC_LEVELS = ["L", "M", "Q", "H"];
/** The two format bits of each level. */
export const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };
export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

// Error-correction codewords per block, and number of blocks, by level and version (index 0 unused).
const ECC_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

export const sizeOf = (version) => 17 + 4 * version;
export const versionOfSize = (size) => ((size - 17) % 4 === 0 && size >= 21 && size <= 177 ? (size - 17) / 4 : 0);

/** Positions (row and column) of the alignment patterns' centres. */
export function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const out = [6];
  for (let pos = sizeOf(version) - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** Modules that can hold data or error correction (everything but the fixed patterns), as bits. */
export function rawDataModules(version) {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const a = Math.floor(version / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

export const eccPerBlock = (version, level) => ECC_PER_BLOCK[level][version];
export const blockCount = (version, level) => BLOCKS[level][version];
export const dataCodewords = (version, level) => Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[level][version] * BLOCKS[level][version];

/** The layout of blocks: how many short and long ones and how long each is, counting data and error-correction codewords. */
export function blockLayout(version, level) {
  const blocks = BLOCKS[level][version];
  const ecc = ECC_PER_BLOCK[level][version];
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortCount = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  return { blocks, ecc, raw, shortCount, shortLen };
}

// ---------------------------------------------------------------------------------------------------------------
// Reed-Solomon over GF(256), polynomial 0x11D
// ---------------------------------------------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

export const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
export const gfDiv = (a, b) => (a === 0 ? 0 : EXP[(LOG[a] + 255 - LOG[b]) % 255]);
export const gfPow = (e) => EXP[((e % 255) + 255) % 255];
export const gfInv = (a) => EXP[255 - LOG[a]];

const generators = new Map();
/** The generator polynomial of the given degree (highest power first, without the leading 1). */
export function generatorPoly(degree) {
  let g = generators.get(degree);
  if (g) return g;
  g = new Uint8Array(degree);
  g[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      g[j] = gfMul(g[j], root);
      if (j + 1 < degree) g[j] ^= g[j + 1];
    }
    root = gfMul(root, 2);
  }
  generators.set(degree, g);
  return g;
}

/** The error-correction codewords of a block of data. */
export function rsEncode(data, degree) {
  const g = generatorPoly(degree);
  const out = new Uint8Array(degree);
  for (const b of data) {
    const factor = b ^ out[0];
    out.copyWithin(0, 1);
    out[degree - 1] = 0;
    for (let i = 0; i < degree; i++) out[i] ^= gfMul(g[i], factor);
  }
  return out;
}

/**
 * Corrects a received block (data then error-correction codewords) in place. Returns the number of errors fixed,
 * or -1 when there are more than can be fixed.
 */
export function rsCorrect(block, degree) {
  const n = block.length;
  const syn = new Uint8Array(degree);
  let clean = true;
  for (let i = 0; i < degree; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s = gfMul(s, gfPow(i)) ^ block[j];
    syn[i] = s;
    if (s) clean = false;
  }
  if (clean) return 0;
  // Berlekamp-Massey: the error locator polynomial (lowest power first).
  let locator = [1];
  let previous = [1];
  let l = 0;
  let m = 1;
  let b = 1;
  for (let i = 0; i < degree; i++) {
    let d = syn[i];
    for (let j = 1; j <= l; j++) d ^= gfMul(locator[j] ?? 0, syn[i - j]);
    if (d === 0) {
      m++;
      continue;
    }
    const t = locator.slice();
    const coef = gfDiv(d, b);
    while (locator.length < previous.length + m) locator.push(0);
    for (let j = 0; j < previous.length; j++) locator[j + m] ^= gfMul(coef, previous[j]);
    if (2 * l <= i) {
      l = i + 1 - l;
      previous = t;
      b = d;
      m = 1;
    } else m++;
  }
  while (locator.length && locator[locator.length - 1] === 0) locator.pop();
  const errors = locator.length - 1;
  if (errors < 1 || errors * 2 > degree) return -1;
  // Chien search: positions where the locator is zero.
  const positions = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j <= errors; j++) sum ^= gfMul(locator[j], gfPow((255 - (n - 1 - i)) * j));
    if (sum === 0) positions.push(i);
  }
  if (positions.length !== errors) return -1;
  // Forney: error values from the evaluator polynomial.
  const omega = new Uint8Array(errors);
  for (let i = 0; i < errors; i++) {
    let v = 0;
    for (let j = 0; j <= i; j++) v ^= gfMul(locator[j], syn[i - j]);
    omega[i] = v;
  }
  for (const pos of positions) {
    let num = 0;
    for (let j = 0; j < errors; j++) num ^= gfMul(omega[j], gfPow((255 - (n - 1 - pos)) * j));
    let den = 0;
    for (let j = 1; j <= errors; j += 2) den ^= gfMul(locator[j], gfPow((255 - (n - 1 - pos)) * (j - 1)));
    if (den === 0) return -1;
    block[pos] ^= gfMul(gfDiv(num, den), gfPow(n - 1 - pos));
  }
  // The block must now be a valid code word.
  for (let i = 0; i < degree; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s = gfMul(s, gfPow(i)) ^ block[j];
    if (s) return -1;
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------------------------
// Format and version information
// ---------------------------------------------------------------------------------------------------------------

/** The remainder of `value` shifted up by the polynomial's degree, divided by `poly` (a BCH code's check bits). */
const bchRemainder = (value, poly, polyBits, dataBits) => {
  const degree = polyBits - 1;
  let v = value << degree;
  for (let i = dataBits + degree - 1; i >= degree; i--) if ((v >>> i) & 1) v ^= poly << (i - degree);
  return v;
};

/** The 15 format bits (level and mask, with their error correction, masked) for a level and mask number. */
export function formatBits(level, mask) {
  const data = (ECC_FORMAT_BITS[level] << 3) | mask;
  const bits = (data << 10) | bchRemainder(data, 0x537, 11, 5);
  return bits ^ 0x5412;
}

/** The 18 version bits, for versions 7 and up. */
export function versionBits(version) {
  return (version << 12) | bchRemainder(version, 0x1f25, 13, 6);
}

const popcount = (x) => {
  let c = 0;
  for (let v = x >>> 0; v; v &= v - 1) c++;
  return c;
};
export { popcount };

/** The level and mask nearest to some read format bits (up to 3 wrong bits are tolerated), or null. */
export function decodeFormatBits(bits) {
  let best = null;
  let bestDist = 4;
  for (const level of ECC_LEVELS) {
    for (let mask = 0; mask < 8; mask++) {
      const dist = popcount(formatBits(level, mask) ^ bits);
      if (dist < bestDist) {
        bestDist = dist;
        best = { level, mask };
      }
    }
  }
  return best;
}

export function decodeVersionBits(bits) {
  let best = 0;
  let bestDist = 4;
  for (let v = 7; v <= MAX_VERSION; v++) {
    const dist = popcount(versionBits(v) ^ bits);
    if (dist < bestDist) {
      bestDist = dist;
      best = v;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// The fixed parts of the symbol, masks and the reading order
// ---------------------------------------------------------------------------------------------------------------

/** 1 for every module that is part of a fixed pattern (finders, separators, timing, alignment, format and version areas). */
export function functionMask(version) {
  const size = sizeOf(version);
  const m = new Uint8Array(size * size);
  const fill = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < size && y < size) m[y * size + x] = 1;
  };
  fill(0, 0, 9, 9);
  fill(size - 8, 0, 8, 9);
  fill(0, size - 8, 9, 8);
  fill(6, 0, 1, size);
  fill(0, 6, size, 1);
  const a = alignmentPositions(version);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === a.length - 1) || (i === a.length - 1 && j === 0)) continue;
      fill(a[i] - 2, a[j] - 2, 5, 5);
    }
  }
  if (version >= 7) {
    fill(size - 11, 0, 3, 6);
    fill(0, size - 11, 6, 3);
  }
  return m;
}

/** Whether mask pattern `mask` flips the module at column x, row y. */
export function maskFlips(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** Module positions [x, y] of data and error-correction bits in the order they are written and read (two-column zig-zag from the lower right). */
export function dataOrder(version) {
  const size = sizeOf(version);
  const fixed = functionMask(version);
  const out = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let i = 0; i < size; i++) {
      const y = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const x = right - c;
        if (!fixed[y * size + x]) out.push([x, y]);
      }
    }
    upward = !upward;
  }
  return out;
}
