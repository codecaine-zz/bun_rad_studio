// Dynamic BitSet backed by Uint32Array words
export class BitSet {
  private words: Uint32Array;
  readonly size: number;

  constructor(size: number) {
    if (size <= 0) throw new Error("[bitutils] BitSet size must be > 0");
    this.size = size;
    this.words = new Uint32Array(Math.ceil(size / 32));
  }

  set(index: number, val = true): void {
    if (index < 0 || index >= this.size) return;
    const wordIdx = Math.floor(index / 32);
    const bitIdx = index % 32;
    if (val) {
      this.words[wordIdx]! |= 1 << bitIdx;
    } else {
      this.words[wordIdx]! &= ~(1 << bitIdx);
    }
  }

  get(index: number): boolean {
    if (index < 0 || index >= this.size) return false;
    const wordIdx = Math.floor(index / 32);
    const bitIdx = index % 32;
    return (this.words[wordIdx]! & (1 << bitIdx)) !== 0;
  }

  clear(index: number): void {
    this.set(index, false);
  }

  toggle(index: number): void {
    this.set(index, !this.get(index));
  }

  countSet(): number {
    let count = 0;
    for (let i = 0; i < this.words.length; i++) {
      count += popcount(this.words[i]!);
    }
    return count;
  }

  toBinaryString(): string {
    const chars: string[] = [];
    for (let i = 0; i < this.size; i++) {
      chars.push(this.get(i) ? "1" : "0");
    }
    return chars.join("");
  }
}

// Doer: Count set bits in 32-bit integer (Hamming weight)
export function popcount(n: number): number {
  let v = n >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// Doer: Set bitmask flag
export function setFlag(flags: number, mask: number): number {
  return (flags | mask) >>> 0;
}

// Doer: Test if bitmask flag is active
export function hasFlag(flags: number, mask: number): boolean {
  return (flags & mask) === mask;
}

// Doer: Clear bitmask flag
export function clearFlag(flags: number, mask: number): number {
  return (flags & ~mask) >>> 0;
}

// Doer: Toggle bitmask flag
export function toggleFlag(flags: number, mask: number): number {
  return (flags ^ mask) >>> 0;
}

export const bitutils = {
  BitSet,
  popcount,
  setFlag,
  hasFlag,
  clearFlag,
  toggleFlag,
};
