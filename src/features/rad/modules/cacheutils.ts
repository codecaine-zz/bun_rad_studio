// Feature: RAD - cacheutils
// In-memory caches: O(1) LRUCache (Map insertion order) with eviction callbacks, peek, resize and
// hit/miss stats; TTLCache with per-entry TTLs, sliding refresh, in-flight request de-duplication
// for getOrSet (thundering-herd protection), optional background sweeping, and stats.

/** Counters exposed by `stats()` on both caches. */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  /** `hits / (hits + misses)`, 0 when unused. */
  hitRate: number;
}

function makeStats(hits: number, misses: number, evictions: number, size: number): CacheStats {
  const total = hits + misses;
  return { hits, misses, evictions, size, hitRate: total ? hits / total : 0 };
}

/**
 * O(1) Least-Recently-Used cache. When full, inserting a new key evicts the least recently
 * read/written key.
 * @example
 * ```ts
 * const lru = new LRUCache<string, Buffer>(500, (key) => console.log("evicted", key));
 * lru.set("a", buf);
 * lru.get("a");            // refreshes recency
 * lru.peek("a");           // read WITHOUT refreshing recency
 * lru.getOrSet("b", () => load("b"));
 * lru.stats();             // { hits, misses, evictions, size, hitRate }
 * ```
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private cap: number;

  /**
   * @param capacity - Maximum entries (> 0).
   * @param onEvict - Called with `(key, value)` whenever an entry is evicted for capacity.
   */
  constructor(capacity: number, private readonly onEvict?: (key: K, value: V) => void) {
    if (!(capacity > 0)) throw new Error(`[cacheutils] LRUCache capacity must be > 0 (got ${capacity})`);
    this.cap = Math.floor(capacity);
  }

  /** Current maximum number of entries. */
  get capacity(): number {
    return this.cap;
  }

  /** Read and mark as most recently used. */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      this.misses++;
      return undefined;
    }
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    this.hits++;
    return value;
  }

  /** Read without touching recency or stats. */
  peek(key: K): V | undefined {
    return this.cache.get(key);
  }

  /** Insert/replace and mark as most recently used; evicts the LRU entry when full. */
  set(key: K, value: V): void {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);
    this.evictOverflow();
  }

  /** Return the cached value, or compute it with `factory`, store it and return it. */
  getOrSet(key: K, factory: () => V): V {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const fresh = factory();
    this.set(key, fresh);
    return fresh;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  /** Change capacity; shrinking evicts LRU entries immediately. */
  resize(capacity: number): void {
    if (!(capacity > 0)) throw new Error(`[cacheutils] LRUCache capacity must be > 0 (got ${capacity})`);
    this.cap = Math.floor(capacity);
    this.evictOverflow();
  }

  /** Keys from least → most recently used. */
  keys(): K[] {
    return [...this.cache.keys()];
  }

  /** Values from least → most recently used. */
  values(): V[] {
    return [...this.cache.values()];
  }

  /** `[key, value]` pairs from least → most recently used. */
  entries(): [K, V][] {
    return [...this.cache.entries()];
  }

  stats(): CacheStats {
    return makeStats(this.hits, this.misses, this.evictions, this.cache.size);
  }

  private evictOverflow(): void {
    while (this.cache.size > this.cap) {
      const [oldKey, oldVal] = this.cache.entries().next().value as [K, V];
      this.cache.delete(oldKey);
      this.evictions++;
      this.onEvict?.(oldKey, oldVal);
    }
  }
}

interface TtlEntry<V> {
  value: V;
  expiresAt: number;
  ttlMs: number;
}

/** Options for {@link TTLCache}. */
export interface TTLCacheOptions {
  /** Sweep expired entries every N ms in the background (timer is `unref`'d). Default: off. */
  sweepIntervalMs?: number;
  /** Reset an entry's TTL each time it is read (sliding expiration). Default `false`. */
  sliding?: boolean;
}

/**
 * Time-To-Live cache. Expired entries are dropped lazily on access (and optionally swept in the
 * background). `getOrSet` shares a single in-flight factory call between concurrent callers.
 * @example
 * ```ts
 * const cache = new TTLCache<string, User>(30_000, { sliding: true });
 * const user = await cache.getOrSet(`user:${id}`, () => fetchUser(id)); // concurrent callers share 1 fetch
 * cache.ttl(`user:${id}`); // ms remaining
 * cache.dispose();          // stop background sweeper (if enabled)
 * ```
 */
export class TTLCache<K, V> {
  private store = new Map<K, TtlEntry<V>>();
  private inflight = new Map<K, Promise<V>>();
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly defaultTtlMs: number;
  readonly sliding: boolean;

  constructor(defaultTtlMs = 60_000, options: TTLCacheOptions = {}) {
    if (!(defaultTtlMs > 0)) throw new Error(`[cacheutils] TTLCache defaultTtlMs must be > 0 (got ${defaultTtlMs})`);
    this.defaultTtlMs = defaultTtlMs;
    this.sliding = options.sliding ?? false;
    if (options.sweepIntervalMs) {
      this.timer = setInterval(() => this.prune(), options.sweepIntervalMs);
      (this.timer as any).unref?.();
    }
  }

  /** Read a live value (expired → `undefined`). Refreshes TTL in sliding mode. */
  get(key: K): V | undefined {
    const entry = this.liveEntry(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (this.sliding) entry.expiresAt = Date.now() + entry.ttlMs;
    this.hits++;
    return entry.value;
  }

  /** Store with a TTL (defaults to `defaultTtlMs`). */
  set(key: K, value: V, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs, ttlMs });
  }

  /**
   * Return the cached value or run `factory` once — concurrent calls for the same key await the
   * same promise. A rejected factory is not cached.
   */
  async getOrSet(key: K, factory: () => Promise<V> | V, ttlMs = this.defaultTtlMs): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = (async () => {
      try {
        const fresh = await factory();
        this.set(key, fresh, ttlMs);
        return fresh;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  /** `true` when a live (non-expired) entry exists. Does not affect stats. */
  has(key: K): boolean {
    return this.liveEntry(key) !== undefined;
  }

  /** Milliseconds until `key` expires, or `-1` when absent/expired. */
  ttl(key: K): number {
    const entry = this.liveEntry(key);
    return entry ? Math.max(0, entry.expiresAt - Date.now()) : -1;
  }

  /** Extend a live entry's lifetime. @returns `false` when absent/expired. */
  touch(key: K, ttlMs?: number): boolean {
    const entry = this.liveEntry(key);
    if (!entry) return false;
    if (ttlMs !== undefined) entry.ttlMs = ttlMs;
    entry.expiresAt = Date.now() + entry.ttlMs;
    return true;
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Remove all expired entries now. @returns How many were removed. */
  prune(): number {
    const now = Date.now();
    let removed = 0;
    for (const [k, v] of this.store) {
      if (now > v.expiresAt) {
        this.store.delete(k);
        removed++;
      }
    }
    this.evictions += removed;
    return removed;
  }

  /** Live entry count (prunes first). */
  size(): number {
    this.prune();
    return this.store.size;
  }

  /** Keys of live entries. */
  keys(): K[] {
    this.prune();
    return [...this.store.keys()];
  }

  stats(): CacheStats {
    return makeStats(this.hits, this.misses, this.evictions, this.size());
  }

  /** Stop the background sweeper (if any). Safe to call repeatedly. */
  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private liveEntry(key: K): TtlEntry<V> | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.evictions++;
      return undefined;
    }
    return entry;
  }
}

export const cacheutils = {
  LRUCache,
  TTLCache,
};
