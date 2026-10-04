// Feature: RAD - bitutils
// Bit manipulation: a fixed-size BitSet (Uint32Array words) with set algebra and fast iteration,
// 32-bit integer bit helpers, and named-flag bitmasks (define / combine / describe).

/**
 * Fixed-size bit array. Out-of-range reads return `false`; out-of-range writes are ignored.
 * @example
 * ```ts
 * const seen = new BitSet(1_000_000);
 * seen.set(42);
 * seen.get(42);        // true
 * seen.countSet();     // 1
 * [...seen.indices()]; // [42]
 * ```
 */
export class BitSet {
  private words: Uint32Array;
  readonly size: number;

  constructor(size: number) {
    if (!(size > 0)) throw new Error(`[bitutils] BitSet size must be > 0 (got ${size})`);
    this.size = Math.floor(size);
    this.words = new Uint32Array(Math.ceil(this.size / 32));
  }

  /** BitSet with the given indices set. */
  static fromIndices(size: number, indices: Iterable<number>): BitSet {
    const bs = new BitSet(size);
    for (const i of indices) bs.set(i);
    return bs;
  }

  /** Parse `"1011"` (index 0 = first character). */
  static fromBinaryString(bits: string): BitSet {
    if (!/^[01]+$/.test(bits)) throw new Error(`[bitutils.BitSet.fromBinaryString] Invalid binary string "${bits}"`);
    const bs = new BitSet(bits.length);
    for (let i = 0; i < bits.length; i++) if (bits[i] === "1") bs.set(i);
    return bs;
  }

  set(index: number, val = true): void {
    if (index < 0 || index >= this.size) return;
    const w = index >>> 5;
    const mask = 1 << (index & 31);
    this.words[w] = val ? this.words[w]! | mask : this.words[w]! & ~mask;
  }

  get(index: number): boolean {
    if (index < 0 || index >= this.size) return false;
    return (this.words[index >>> 5]! & (1 << (index & 31))) !== 0;
  }

  clear(index: number): void {
    this.set(index, false);
  }

  toggle(index: number): void {
    this.set(index, !this.get(index));
  }

  /** Set every bit (`true`) or clear every bit (`false`). */
  fill(val = true): void {
    this.words.fill(val ? 0xffffffff : 0);
    if (val) this.maskTail();
  }

  /** Number of set bits. */
  countSet(): number {
    let count = 0;
    for (const w of this.words) count += popcount(w);
    return count;
  }

  any(): boolean {
    return this.words.some((w) => w !== 0);
  }

  none(): boolean {
    return !this.any();
  }

  all(): boolean {
    return this.countSet() === this.size;
  }

  /** Lowest set index ≥ `from`, or `-1`. */
  nextSetBit(from = 0): number {
    for (let i = Math.max(0, from); i < this.size; i++) {
      if ((i & 31) === 0 && this.words[i >>> 5] === 0) {
        i += 31;
        continue;
      }
      if (this.get(i)) return i;
    }
    return -1;
  }

  /** Iterate set indices ascending (skips empty words). */
  *indices(): IterableIterator<number> {
    for (let i = this.nextSetBit(0); i !== -1; i = this.nextSetBit(i + 1)) yield i;
  }

  /** Set indices as an array. */
  toIndices(): number[] {
    return [...this.indices()];
  }

  and(other: BitSet): BitSet {
    return this.combine(other, (a, b) => a & b);
  }

  or(other: BitSet): BitSet {
    return this.combine(other, (a, b) => a | b);
  }

  xor(other: BitSet): BitSet {
    return this.combine(other, (a, b) => a ^ b);
  }

  /** Bits set here but not in `other`. */
  andNot(other: BitSet): BitSet {
    return this.combine(other, (a, b) => a & ~b);
  }

  clone(): BitSet {
    const c = new BitSet(this.size);
    c.words.set(this.words);
    return c;
  }

  equals(other: BitSet): boolean {
    return this.size === other.size && this.words.every((w, i) => w === other.words[i]);
  }

  /** `"0101…"` with index 0 first. */
  toBinaryString(): string {
    let s = "";
    for (let i = 0; i < this.size; i++) s += this.get(i) ? "1" : "0";
    return s;
  }

  private combine(other: BitSet, op: (a: number, b: number) => number): BitSet {
    if (other.size !== this.size) throw new Error(`[bitutils.BitSet] Size mismatch: ${this.size} vs ${other.size}`);
    const out = new BitSet(this.size);
    for (let i = 0; i < this.words.length; i++) out.words[i] = op(this.words[i]!, other.words[i]!) >>> 0;
    out.maskTail();
    return out;
  }

  private maskTail(): void {
    const extra = this.size & 31;
    if (extra) this.words[this.words.length - 1]! &= (1 << extra) - 1;
  }
}

/** Set-bit count of a 32-bit integer (Hamming weight). @example `bitutils.popcount(0b1011); // 3` */
export function popcount(n: number): number {
  let v = n >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Test bit `i` (0–31). @example `bitutils.getBit(0b100, 2); // true` */
export function getBit(n: number, i: number): boolean {
  return ((n >>> i) & 1) === 1;
}

/** Set bit `i`. @example `bitutils.setBit(0, 3); // 8` */
export function setBit(n: number, i: number): number {
  return (n | (1 << i)) >>> 0;
}

/** Clear bit `i`. @example `bitutils.clearBit(0b1111, 0); // 14` */
export function clearBit(n: number, i: number): number {
  return (n & ~(1 << i)) >>> 0;
}

/** Flip bit `i`. @example `bitutils.toggleBit(0, 1); // 2` */
export function toggleBit(n: number, i: number): number {
  return (n ^ (1 << i)) >>> 0;
}

/** Trailing zero count (32 for 0). @example `bitutils.countTrailingZeros(8); // 3` */
export function countTrailingZeros(n: number): number {
  const v = n >>> 0;
  return v === 0 ? 32 : 31 - Math.clz32(v & -v);
}

/** Zero-padded binary string. @example `bitutils.toBinary(5, 8); // "00000101"` */
export function toBinary(n: number, width = 32): string {
  return (n >>> 0).toString(2).padStart(width, "0");
}

/** Add `mask` bits. @example `bitutils.setFlag(0b001, 0b100); // 5` */
export function setFlag(flags: number, mask: number): number {
  return (flags | mask) >>> 0;
}

/** `true` when ALL bits of `mask` are set. @example `bitutils.hasFlag(0b101, 0b100); // true` */
export function hasFlag(flags: number, mask: number): boolean {
  return (flags & mask) === mask;
}

/** `true` when ANY bit of `mask` is set. @example `bitutils.hasAnyFlag(0b001, 0b011); // true` */
export function hasAnyFlag(flags: number, mask: number): boolean {
  return (flags & mask) !== 0;
}

/** Remove `mask` bits. @example `bitutils.clearFlag(0b111, 0b010); // 5` */
export function clearFlag(flags: number, mask: number): number {
  return (flags & ~mask) >>> 0;
}

/** Flip `mask` bits. @example `bitutils.toggleFlag(0b101, 0b001); // 4` */
export function toggleFlag(flags: number, mask: number): number {
  return (flags ^ mask) >>> 0;
}

/**
 * Build a name → bit map (`1, 2, 4, …`) from up to 31 names.
 * @throws With more than 31 names.
 * @example
 * ```ts
 * const Perm = bitutils.defineFlags(["READ", "WRITE", "EXEC"] as const);
 * Perm.WRITE; // 2
 * ```
 */
export function defineFlags<const N extends string>(names: readonly N[]): Record<N, number> {
  if (names.length > 31) throw new Error(`[bitutils.defineFlags] Max 31 flags (got ${names.length})`);
  return Object.fromEntries(names.map((n, i) => [n, 1 << i])) as Record<N, number>;
}

/** OR together named flags. @example `bitutils.combineFlags(Perm, ["READ", "EXEC"]); // 5` */
export function combineFlags<N extends string>(flagMap: Record<N, number>, names: readonly N[]): number {
  return names.reduce((acc, n) => (acc | flagMap[n]) >>> 0, 0);
}

/** Names whose bits are set in `value`. @example `bitutils.describeFlags(5, Perm); // ["READ", "EXEC"]` */
export function describeFlags<N extends string>(value: number, flagMap: Record<N, number>): N[] {
  return (Object.keys(flagMap) as N[]).filter((n) => hasFlag(value, flagMap[n]));
}

export const bitutils = {
  BitSet,
  popcount,
  getBit,
  setBit,
  clearBit,
  toggleBit,
  countTrailingZeros,
  toBinary,
  setFlag,
  hasFlag,
  hasAnyFlag,
  clearFlag,
  toggleFlag,
  defineFlags,
  combineFlags,
  describeFlags,
};
