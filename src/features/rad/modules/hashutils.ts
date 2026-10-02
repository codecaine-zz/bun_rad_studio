// Feature: RAD - hashutils
// Ultra-fast non-cryptographic hashes & Bloom filter powered by native Bun.hash
import { hash } from "bun";

export type HashAlgorithm = "wyhash" | "cityHash64" | "cityHash32" | "crc32" | "adler32" | "murmur32v3" | "murmur64v2" | "rapidhash";

// Doer: Compute 64-bit wyhash (default ultra-fast hash)
export function wyhash(data: string | Uint8Array, seed?: number | bigint): bigint {
  return hash.wyhash(data, seed);
}

// Doer: Compute 32-bit CRC32 checksum
export function crc32(data: string | Uint8Array): number {
  return hash.crc32(data);
}

// Doer: Compute 32-bit Adler-32 checksum
export function adler32(data: string | Uint8Array): number {
  return hash.adler32(data);
}

// Doer: Compute 64-bit CityHash
export function cityHash64(data: string | Uint8Array, seed?: number | bigint): bigint {
  return hash.cityHash64(data, seed);
}

// Doer: Compute 32-bit CityHash
export function cityHash32(data: string | Uint8Array): number {
  return hash.cityHash32(data);
}

// Doer: Compute 32-bit MurmurHash3
export function murmur32v3(data: string | Uint8Array, seed?: number): number {
  return hash.murmur32v3(data, seed);
}

// Doer: Compute 64-bit MurmurHash2
export function murmur64v2(data: string | Uint8Array, seed?: number | bigint): bigint {
  return hash.murmur64v2(data, seed);
}

// Doer: Compute 64-bit rapidhash
export function rapidhash(data: string | Uint8Array, seed?: number | bigint): bigint {
  return hash.rapidhash(data, seed);
}

// Coordinator: Compute hexadecimal digest of specified hash algorithm
export function hashHex(data: string | Uint8Array, algo: HashAlgorithm = "wyhash"): string {
  switch (algo) {
    case "wyhash":
      return wyhash(data).toString(16);
    case "rapidhash":
      return rapidhash(data).toString(16);
    case "cityHash64":
      return cityHash64(data).toString(16);
    case "murmur64v2":
      return murmur64v2(data).toString(16);
    case "crc32":
      return (crc32(data) >>> 0).toString(16);
    case "adler32":
      return (adler32(data) >>> 0).toString(16);
    case "cityHash32":
      return (cityHash32(data) >>> 0).toString(16);
    case "murmur32v3":
      return (murmur32v3(data) >>> 0).toString(16);
  }
}

export interface BloomFilter {
  add(item: string): void;
  has(item: string): boolean;
  count(): number;
  sizeBits(): number;
}

// Coordinator: Create a high-performance Bloom Filter using double hashing (wyhash + murmur32v3)
export function createBloomFilter(expectedItems = 1000, falsePositiveRate = 0.01): BloomFilter {
  const m = Math.max(64, Math.ceil(-(expectedItems * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2)));
  const k = Math.max(1, Math.round((m / expectedItems) * Math.LN2));
  const buffer = new Uint8Array(Math.ceil(m / 8));
  let itemCount = 0;

  function getHashes(item: string): number[] {
    const h1 = Number(wyhash(item) & 0xffffffffn);
    const h2 = murmur32v3(item);
    const indices: number[] = [];
    for (let i = 0; i < k; i++) {
      const combined = (h1 + i * h2) >>> 0;
      indices.push(combined % m);
    }
    return indices;
  }

  return {
    add(item: string): void {
      for (const idx of getHashes(item)) {
        const byteIdx = Math.floor(idx / 8);
        const bitMask = 1 << (idx % 8);
        buffer[byteIdx] |= bitMask;
      }
      itemCount++;
    },
    has(item: string): boolean {
      for (const idx of getHashes(item)) {
        const byteIdx = Math.floor(idx / 8);
        const bitMask = 1 << (idx % 8);
        if ((buffer[byteIdx] & bitMask) === 0) {
          return false;
        }
      }
      return true;
    },
    count(): number {
      return itemCount;
    },
    sizeBits(): number {
      return m;
    },
  };
}

export const hashutils = {
  wyhash,
  crc32,
  adler32,
  cityHash64,
  cityHash32,
  murmur32v3,
  murmur64v2,
  rapidhash,
  hashHex,
  createBloomFilter,
};
