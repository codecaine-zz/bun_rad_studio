// Feature: RAD - mathutils
// Practical math for apps, games and dashboards: interpolation & mapping, rounding/snapping,
// 2D points & axis-aligned rectangles, number theory, angles, percentages, float comparison,
// and random numbers (fast, cryptographically secure, or seeded/reproducible).

export interface Point2D {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Linear interpolation `a → b` by `t` (0…1; extrapolates outside). @example `mathutils.lerp(0, 100, 0.25); // 25` */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse of lerp: where `val` sits between `a` and `b` (0…1). @example `mathutils.inverseLerp(10, 20, 15); // 0.5` */
export function inverseLerp(a: number, b: number, val: number): number {
  return a === b ? 0 : (val - a) / (b - a);
}

/** Map `val` from `[inMin, inMax]` to `[outMin, outMax]`. @example `mathutils.remap(5, 0, 10, 0, 100); // 50` */
export function remap(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  return outMin + (outMax - outMin) * ((val - inMin) / (inMax - inMin));
}

/** Constrain to `[min, max]`. @example `mathutils.clamp(15, 0, 10); // 10` */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Wrap into `[min, max)` (angles, carousels, tile maps). @example `mathutils.wrap(370, 0, 360); // 10` */
export function wrap(val: number, min: number, max: number): number {
  const span = max - min;
  return span === 0 ? min : ((((val - min) % span) + span) % span) + min;
}

/** Snap to the nearest multiple of `step`. @example `mathutils.roundToStep(4.78, 0.25); // 4.75` */
export function roundToStep(val: number, step: number): number {
  if (step <= 0) return val;
  return Number((Math.round(val / step) * step).toFixed(10));
}

/** Round to `precision` decimals (negative = tens/hundreds), correcting float drift like 1.005. @example `mathutils.round(1.005, 2); // 1.01` */
export function round(val: number, precision = 0): number {
  if (!Number.isFinite(val)) return val;
  const s = String(val);
  if (s.includes("e")) {
    // Already in exponent form (e.g. 1e-7): the string-shift trick would produce "1e-7e2".
    const factor = 10 ** precision;
    return Math.round(val * factor) / factor;
  }
  return Number(Math.round(Number(`${s}e${precision}`)) + `e${-precision}`);
}

/** `true` when |a − b| ≤ epsilon. @example `mathutils.approxEqual(0.1 + 0.2, 0.3); // true` */
export function approxEqual(a: number, b: number, epsilon = 1e-9): boolean {
  return Math.abs(a - b) <= epsilon;
}

/** Euclidean distance. @example `mathutils.distance({ x: 0, y: 0 }, { x: 3, y: 4 }); // 5` */
export function distance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/** Midpoint of two points. @example `mathutils.midpoint({ x: 0, y: 0 }, { x: 2, y: 4 }); // { x: 1, y: 2 }` */
export function midpoint(p1: Point2D, p2: Point2D): Point2D {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

/** Angle in radians from `p1` to `p2` (atan2, −π…π). @example `mathutils.angleBetween({ x: 0, y: 0 }, { x: 0, y: 1 }); // π/2` */
export function angleBetween(p1: Point2D, p2: Point2D): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/** Rotate `p` around `origin` by `radians` (counter-clockwise). @example `mathutils.rotatePoint({ x: 1, y: 0 }, Math.PI / 2); // ≈ { x: 0, y: 1 }` */
export function rotatePoint(p: Point2D, radians: number, origin: Point2D = { x: 0, y: 0 }): Point2D {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

/** Degrees → radians. @example `mathutils.degToRad(180); // Math.PI` */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Radians → degrees. @example `mathutils.radToDeg(Math.PI); // 180` */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Overlap test for axis-aligned rectangles (touching edges do not count). @example `mathutils.rectIntersects(a, b);` */
export function rectIntersects(r1: Rect, r2: Rect): boolean {
  return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x && r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
}

/** Overlapping region, or `null`. @example `mathutils.rectIntersection({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }); // { x: 5, y: 5, width: 5, height: 5 }` */
export function rectIntersection(r1: Rect, r2: Rect): Rect | null {
  if (!rectIntersects(r1, r2)) return null;
  const x = Math.max(r1.x, r2.x);
  const y = Math.max(r1.y, r2.y);
  return { x, y, width: Math.min(r1.x + r1.width, r2.x + r2.width) - x, height: Math.min(r1.y + r1.height, r2.y + r2.height) - y };
}

/** Smallest rectangle containing both. @example `mathutils.rectUnion(a, b);` */
export function rectUnion(r1: Rect, r2: Rect): Rect {
  const x = Math.min(r1.x, r2.x);
  const y = Math.min(r1.y, r2.y);
  return { x, y, width: Math.max(r1.x + r1.width, r2.x + r2.width) - x, height: Math.max(r1.y + r1.height, r2.y + r2.height) - y };
}

/** `true` when `p` lies inside `r` (edges inclusive). @example `mathutils.rectContainsPoint({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 5 }); // true` */
export function rectContainsPoint(r: Rect, p: Point2D): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** Area (negative sizes count as 0). @example `mathutils.rectArea({ x: 0, y: 0, width: 4, height: 5 }); // 20` */
export function rectArea(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

/** Greatest common divisor (Euclid). @example `mathutils.gcd(48, 18); // 6` */
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/** Least common multiple. @example `mathutils.lcm(4, 6); // 12` */
export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

/** `true` for 1, 2, 4, 8, … (32-bit safe). @example `mathutils.isPowerOfTwo(64); // true` */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Smallest power of two ≥ n. @example `mathutils.nextPowerOfTwo(100); // 128` */
export function nextPowerOfTwo(n: number): number {
  return n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n));
}

/** Deterministic primality (6k ± 1 trial division). @example `mathutils.isPrime(97); // true` */
export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;
  return true;
}

/** Prime factorisation, ascending with repeats. @example `mathutils.primeFactors(360); // [2, 2, 2, 3, 3, 5]` */
export function primeFactors(n: number): number[] {
  const out: number[] = [];
  let rest = Math.abs(Math.trunc(n));
  for (let p = 2; p * p <= rest; p++) {
    while (rest % p === 0) {
      out.push(p);
      rest /= p;
    }
  }
  if (rest > 1) out.push(rest);
  return out;
}

/** Exact factorial as bigint. @throws For negative/non-integer input. @example `mathutils.factorial(20); // 2432902008176640000n` */
export function factorial(n: number): bigint {
  if (!Number.isInteger(n) || n < 0) throw new Error(`[mathutils.factorial] n must be a non-negative integer (got ${n})`);
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return r;
}

/** Binomial coefficient "n choose k" (exact for results < 2^53). @example `mathutils.binomial(5, 2); // 10` */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
  return Math.round(r);
}

/** `[start, end)` membership; one bound = `[0, start)`; reversed bounds allowed. @example `mathutils.inRange(3, 1, 5); // true` */
export function inRange(val: number, start: number, end?: number): boolean {
  const [lo, hi] = end === undefined ? [0, start] : [start, end];
  return val >= Math.min(lo, hi) && val < Math.max(lo, hi);
}

/** Sum. @example `mathutils.sum([1, 2, 3]); // 6` */
export function sum(arr: readonly number[]): number {
  return arr.reduce((acc, n) => acc + n, 0);
}

/** Sum by selector (same as `arrutils.sumBy`). @example `mathutils.sumBy([{ n: 1 }], (x) => x.n); // 1` */
export function sumBy<T>(arr: readonly T[], fn: (item: T) => number): number {
  return arr.reduce((acc, item) => acc + fn(item), 0);
}

/** Product (1 for empty). @example `mathutils.product([2, 3, 4]); // 24` */
export function product(arr: readonly number[]): number {
  return arr.reduce((acc, n) => acc * n, 1);
}

/** `part` as a percentage of `whole` (0 when whole is 0). @example `mathutils.percentOf(25, 200); // 12.5` */
export function percentOf(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

/** Percentage change from `from` to `to` (0 when from is 0). @example `mathutils.percentChange(80, 100); // 25` */
export function percentChange(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / Math.abs(from)) * 100;
}

/** Fast random integer in `[min, max]` (Math.random — not for secrets). @example `mathutils.randomInt(1, 6);` */
export function randomInt(min: number, max: number): number {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

/** Random float in `[min, max)`. @example `mathutils.randomFloat(0.5, 1.5);` */
export function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Cryptographically secure, unbiased integer in `[min, max]` (rejection sampling on `crypto.getRandomValues`).
 * @throws When the span exceeds 2^32.
 * @example `mathutils.secureRandomInt(100000, 999999); // OTP code`
 */
export function secureRandomInt(min: number, max: number): number {
  const low = Math.ceil(Math.min(min, max));
  const span = Math.floor(Math.max(min, max)) - low + 1;
  if (span > 2 ** 32) throw new Error(`[mathutils.secureRandomInt] range too large (${span})`);
  const limit = 2 ** 32 - (2 ** 32 % span);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  return low + (buf[0]! % span);
}

/**
 * Seeded PRNG (mulberry32) returning floats in `[0, 1)`. Same seed ⇒ same sequence —
 * perfect for reproducible tests, fixtures and procedural generation.
 * @example
 * ```ts
 * const rng = mathutils.seededRandom(42);
 * arrutils.shuffle([1, 2, 3, 4], rng); // identical order on every run
 * ```
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mathutils = {
  lerp,
  inverseLerp,
  remap,
  clamp,
  wrap,
  roundToStep,
  round,
  approxEqual,
  distance,
  midpoint,
  angleBetween,
  rotatePoint,
  degToRad,
  radToDeg,
  rectIntersects,
  rectIntersection,
  rectUnion,
  rectContainsPoint,
  rectArea,
  gcd,
  lcm,
  isPowerOfTwo,
  nextPowerOfTwo,
  isPrime,
  primeFactors,
  factorial,
  binomial,
  inRange,
  sum,
  sumBy,
  product,
  percentOf,
  percentChange,
  randomInt,
  randomFloat,
  secureRandomInt,
  seededRandom,
};
