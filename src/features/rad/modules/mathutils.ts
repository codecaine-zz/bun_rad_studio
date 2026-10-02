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

// Doer: Linear interpolation between a and b by factor t (0.0 to 1.0)
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Doer: Remap value from [inMin, inMax] to [outMin, outMax]
export function remap(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  const t = (val - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
}

// Doer: Clamp value between [min, max]
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Doer: Snap number to nearest step multiple (e.g. 4.78 snapped to 0.25 -> 4.75)
export function roundToStep(val: number, step: number): number {
  if (step <= 0) return val;
  return Number((Math.round(val / step) * step).toFixed(10));
}

// Doer: Euclidean distance between two 2D points
export function distance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Doer: Midpoint between two 2D points
export function midpoint(p1: Point2D, p2: Point2D): Point2D {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

// Doer: Axis-aligned rectangle intersection test
export function rectIntersects(r1: Rect, r2: Rect): boolean {
  return (
    r1.x < r2.x + r2.width &&
    r1.x + r1.width > r2.x &&
    r1.y < r2.y + r2.height &&
    r1.y + r1.height > r2.y
  );
}

// Doer: Calculate rectangle area
export function rectArea(r: Rect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

// Doer: Greatest Common Divisor (Euclid's algorithm)
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

// Doer: Least Common Multiple
export function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

// Doer: Check if integer is power of two
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

// Doer: Check if number is in range [start, end)
export function inRange(val: number, start: number, end?: number): boolean {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  return val >= Math.min(start, end) && val < Math.max(start, end);
}

// Doer: Sum an array of numbers
export function sum(arr: readonly number[]): number {
  return arr.reduce((acc, n) => acc + n, 0);
}

// Doer: Sum an array of items by numeric selector
export function sumBy<T>(arr: readonly T[], fn: (item: T) => number): number {
  return arr.reduce((acc, item) => acc + fn(item), 0);
}

// Doer: Generate random integer between min and max (inclusive)
export function randomInt(min: number, max: number): number {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

// Doer: Round number to specified decimal precision
export function round(val: number, precision = 0): number {
  const factor = 10 ** precision;
  return Math.round(val * factor) / factor;
}

export const mathutils = {
  lerp,
  remap,
  clamp,
  roundToStep,
  distance,
  midpoint,
  rectIntersects,
  rectArea,
  gcd,
  lcm,
  isPowerOfTwo,
  inRange,
  sum,
  sumBy,
  randomInt,
  round,
};

