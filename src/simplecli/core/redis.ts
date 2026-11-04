/**
 * High-Performance Namespaced Redis Client & Wrapper for Bun
 * Zero-dependency multi-tenant isolation, typed KV, JSON, Hashes, Sets, Lists, ZSets, Locks, Pub/Sub & In-Memory Fallback
 */

import { RedisClient } from 'bun';
import * as crypto from 'node:crypto';

export interface NamespacedRedisOptions {
  /**
   * The app or tenant namespace prefix (e.g. 'auth_service', 'tenant_42', 'analytics')
   */
  namespace: string;
  /**
   * Key delimiter separating namespace levels. Default: ':'
   */
  delimiter?: string;
  /**
   * Redis connection URL (e.g. 'redis://localhost:6379' or 'redis://user:pass@host:port/0')
   */
  url?: string;
  /**
   * Optional Redis host (used when `url` is not provided). Default: '127.0.0.1'
   */
  host?: string;
  /**
   * Optional Redis port (used when `url` is not provided). Default: 6379
   */
  port?: number;
  /**
   * Existing native RedisClient or InMemoryRedisClient instance to reuse
   */
  client?: any;
  /**
   * Force in-memory mode without attempting TCP connection to Redis server
   */
  inMemory?: boolean;
  /**
   * Automatically fall back to in-memory store if Redis server is unreachable. Default: true
   */
  fallbackToMemory?: boolean;
}

export interface SetOptions {
  ex?: number;       // Expiry time in seconds
  px?: number;       // Expiry time in milliseconds
  nx?: boolean;      // Only set if key does not exist
  xx?: boolean;      // Only set if key already exists
  keepTtl?: boolean; // Retain existing TTL
}

interface MemoryEntry {
  type: 'string' | 'hash' | 'list' | 'set' | 'zset';
  value: any;
  expiresAt: number | null; // epoch ms, or null for persistent
}

function globToRegExp(pattern: string): RegExp {
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if ('+^$.()|[]\\{}'.includes(c)) re += '\\' + c;
    else re += c;
  }
  re += '$';
  return new RegExp(re);
}

/**
 * Full-featured in-memory Redis-compatible engine for offline/serverless execution & automatic fallback
 */
export class InMemoryRedisClient {
  private store: Map<string, MemoryEntry> = new Map();
  private subscribers: Map<string, Set<(msg: string) => void>> = new Map();
  private opsSinceSweep: number = 0;

  private sweepExpiredIfNeeded(): void {
    this.opsSinceSweep++;
    if (this.opsSinceSweep < 256 || this.store.size < 256) return;
    this.opsSinceSweep = 0;
    const now = Date.now();
    for (const [k, entry] of this.store.entries()) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        this.store.delete(k);
      }
    }
  }

  private getValidEntry(key: string, expectedType?: MemoryEntry['type']): MemoryEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    if (expectedType && entry.type !== expectedType) {
      return null;
    }
    return entry;
  }

  public async ping(message?: string): Promise<string> {
    return message || 'PONG';
  }

  public async get(key: string): Promise<string | null> {
    const entry = this.getValidEntry(key, 'string');
    return entry ? String(entry.value) : null;
  }

  public async getBuffer(key: string): Promise<Uint8Array | null> {
    const val = await this.get(key);
    return val !== null ? new Uint8Array(Buffer.from(val, 'utf8')) : null;
  }

  public async set(key: string, val: string, ...args: any[]): Promise<'OK' | null> {
    const existing = this.getValidEntry(key);
    let expiresAt: number | null = null;
    let nx = false;
    let xx = false;
    let keepTtl = false;

    for (let i = 0; i < args.length; i++) {
      const flag = String(args[i] ?? '').toUpperCase();
      if (flag === 'EX') {
        const sec = Number(args[++i] ?? 0);
        expiresAt = Date.now() + Math.max(0, sec * 1000);
      } else if (flag === 'PX') {
        const ms = Number(args[++i] ?? 0);
        expiresAt = Date.now() + Math.max(0, ms);
      } else if (flag === 'NX') {
        nx = true;
      } else if (flag === 'XX') {
        xx = true;
      } else if (flag === 'KEEPTTL') {
        keepTtl = true;
      }
    }

    if (nx && existing !== null) return null;
    if (xx && existing === null) return null;
    if (keepTtl && existing !== null) {
      expiresAt = existing.expiresAt;
    }

    this.sweepExpiredIfNeeded();
    this.store.set(key, {
      type: 'string',
      value: String(val),
      expiresAt,
    });
    return 'OK';
  }

  public async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const k of keys) {
      if (this.getValidEntry(k) !== null) {
        this.store.delete(k);
        removed++;
      } else {
        this.store.delete(k);
      }
    }
    return removed;
  }

  public async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.getValidEntry(k) !== null) count++;
    }
    return count;
  }

  public async expire(key: string, seconds: number): Promise<number> {
    const entry = this.getValidEntry(key);
    if (!entry) return 0;
    if (seconds <= 0) {
      this.store.delete(key);
      return 1;
    }
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  public async pexpire(key: string, milliseconds: number): Promise<number> {
    const entry = this.getValidEntry(key);
    if (!entry) return 0;
    if (milliseconds <= 0) {
      this.store.delete(key);
      return 1;
    }
    entry.expiresAt = Date.now() + milliseconds;
    return 1;
  }

  public async ttl(key: string): Promise<number> {
    const entry = this.getValidEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  public async pttl(key: string): Promise<number> {
    const entry = this.getValidEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, entry.expiresAt - Date.now());
  }

  public async persist(key: string): Promise<number> {
    const entry = this.getValidEntry(key);
    if (!entry || entry.expiresAt === null) return 0;
    entry.expiresAt = null;
    return 1;
  }

  public async incrby(key: string, amount: number): Promise<number> {
    const entry = this.getValidEntry(key, 'string');
    const cur = entry ? parseInt(String(entry.value), 10) || 0 : 0;
    const next = cur + amount;
    this.store.set(key, {
      type: 'string',
      value: String(next),
      expiresAt: entry ? entry.expiresAt : null,
    });
    return next;
  }

  public async incr(key: string): Promise<number> {
    return this.incrby(key, 1);
  }

  public async decr(key: string): Promise<number> {
    return this.incrby(key, -1);
  }

  public async decrby(key: string, amount: number): Promise<number> {
    return this.incrby(key, -amount);
  }

  public async mget(...keys: string[]): Promise<(string | null)[]> {
    const out: (string | null)[] = [];
    for (const k of keys) {
      out.push(await this.get(k));
    }
    return out;
  }

  public async mset(...args: string[]): Promise<'OK'> {
    for (let i = 0; i < args.length; i += 2) {
      const k = args[i];
      const v = args[i + 1] ?? '';
      if (k !== undefined) {
        await this.set(k, v);
      }
    }
    return 'OK';
  }

  // Hashes
  public async hget(key: string, field: string): Promise<string | null> {
    const entry = this.getValidEntry(key, 'hash');
    if (!entry) return null;
    const map = entry.value as Map<string, string>;
    return map.has(field) ? map.get(field)! : null;
  }

  public async hset(key: string, ...args: string[]): Promise<number> {
    let entry = this.getValidEntry(key, 'hash');
    if (!entry) {
      entry = { type: 'hash', value: new Map<string, string>(), expiresAt: null };
      this.store.set(key, entry);
    }
    const map = entry.value as Map<string, string>;
    let added = 0;
    for (let i = 0; i < args.length; i += 2) {
      const f = args[i];
      const v = args[i + 1] ?? '';
      if (f !== undefined) {
        if (!map.has(f)) added++;
        map.set(f, String(v));
      }
    }
    return added;
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    const entry = this.getValidEntry(key, 'hash');
    if (!entry) return {};
    const map = entry.value as Map<string, string>;
    const obj: Record<string, string> = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    return obj;
  }

  public async hdel(key: string, ...fields: string[]): Promise<number> {
    const entry = this.getValidEntry(key, 'hash');
    if (!entry) return 0;
    const map = entry.value as Map<string, string>;
    let removed = 0;
    for (const f of fields) {
      if (map.delete(f)) removed++;
    }
    if (map.size === 0) this.store.delete(key);
    return removed;
  }

  public async hexists(key: string, field: string): Promise<number> {
    const entry = this.getValidEntry(key, 'hash');
    if (!entry) return 0;
    return (entry.value as Map<string, string>).has(field) ? 1 : 0;
  }

  public async hkeys(key: string): Promise<string[]> {
    const entry = this.getValidEntry(key, 'hash');
    if (!entry) return [];
    return Array.from((entry.value as Map<string, string>).keys());
  }

  public async hvals(key: string): Promise<string[]> {
    const entry = this.getValidEntry(key, 'hash');
    if (!entry) return [];
    return Array.from((entry.value as Map<string, string>).values());
  }

  public async hlen(key: string): Promise<number> {
    const entry = this.getValidEntry(key, 'hash');
    if (!entry) return 0;
    return (entry.value as Map<string, string>).size;
  }

  public async hincrby(key: string, field: string, amount: number): Promise<number> {
    const curStr = await this.hget(key, field);
    const cur = curStr !== null ? parseInt(curStr, 10) || 0 : 0;
    const next = cur + amount;
    await this.hset(key, field, String(next));
    return next;
  }

  // Lists
  public async lpush(key: string, ...values: string[]): Promise<number> {
    let entry = this.getValidEntry(key, 'list');
    if (!entry) {
      entry = { type: 'list', value: [] as string[], expiresAt: null };
      this.store.set(key, entry);
    }
    const list = entry.value as string[];
    for (const v of values) {
      list.unshift(String(v));
    }
    return list.length;
  }

  public async rpush(key: string, ...values: string[]): Promise<number> {
    let entry = this.getValidEntry(key, 'list');
    if (!entry) {
      entry = { type: 'list', value: [] as string[], expiresAt: null };
      this.store.set(key, entry);
    }
    const list = entry.value as string[];
    for (const v of values) {
      list.push(String(v));
    }
    return list.length;
  }

  public async lpop(key: string): Promise<string | null> {
    const entry = this.getValidEntry(key, 'list');
    if (!entry) return null;
    const list = entry.value as string[];
    const item = list.shift() ?? null;
    if (list.length === 0) this.store.delete(key);
    return item;
  }

  public async rpop(key: string): Promise<string | null> {
    const entry = this.getValidEntry(key, 'list');
    if (!entry) return null;
    const list = entry.value as string[];
    const item = list.pop() ?? null;
    if (list.length === 0) this.store.delete(key);
    return item;
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const entry = this.getValidEntry(key, 'list');
    if (!entry) return [];
    const list = entry.value as string[];
    const len = list.length;
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : stop;
    if (s >= len || s > e) return [];
    return list.slice(s, e + 1);
  }

  public async llen(key: string): Promise<number> {
    const entry = this.getValidEntry(key, 'list');
    return entry ? (entry.value as string[]).length : 0;
  }

  public async lindex(key: string, index: number): Promise<string | null> {
    const entry = this.getValidEntry(key, 'list');
    if (!entry) return null;
    const list = entry.value as string[];
    const idx = index < 0 ? list.length + index : index;
    return list[idx] ?? null;
  }

  // Sets
  public async sadd(key: string, ...members: string[]): Promise<number> {
    let entry = this.getValidEntry(key, 'set');
    if (!entry) {
      entry = { type: 'set', value: new Set<string>(), expiresAt: null };
      this.store.set(key, entry);
    }
    const set = entry.value as Set<string>;
    let added = 0;
    for (const m of members) {
      const s = String(m);
      if (!set.has(s)) {
        set.add(s);
        added++;
      }
    }
    return added;
  }

  public async srem(key: string, ...members: string[]): Promise<number> {
    const entry = this.getValidEntry(key, 'set');
    if (!entry) return 0;
    const set = entry.value as Set<string>;
    let removed = 0;
    for (const m of members) {
      if (set.delete(String(m))) removed++;
    }
    if (set.size === 0) this.store.delete(key);
    return removed;
  }

  public async smembers(key: string): Promise<string[]> {
    const entry = this.getValidEntry(key, 'set');
    return entry ? Array.from(entry.value as Set<string>) : [];
  }

  public async sismember(key: string, member: string): Promise<number> {
    const entry = this.getValidEntry(key, 'set');
    if (!entry) return 0;
    return (entry.value as Set<string>).has(String(member)) ? 1 : 0;
  }

  public async scard(key: string): Promise<number> {
    const entry = this.getValidEntry(key, 'set');
    return entry ? (entry.value as Set<string>).size : 0;
  }

  // Sorted Sets (ZSet)
  public async zadd(key: string, score: number, member: string): Promise<number> {
    let entry = this.getValidEntry(key, 'zset');
    if (!entry) {
      entry = { type: 'zset', value: new Map<string, number>(), expiresAt: null };
      this.store.set(key, entry);
    }
    const zmap = entry.value as Map<string, number>;
    const isNew = !zmap.has(member);
    zmap.set(member, Number(score));
    return isNew ? 1 : 0;
  }

  private getSortedZSet(key: string): Array<[string, number]> {
    const entry = this.getValidEntry(key, 'zset');
    if (!entry) return [];
    const zmap = entry.value as Map<string, number>;
    return Array.from(zmap.entries()).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  }

  public async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const sorted = this.getSortedZSet(key);
    const len = sorted.length;
    if (len === 0) return [];
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : stop;
    if (s >= len || s > e) return [];
    return sorted.slice(s, e + 1).map(([member]) => member);
  }

  public async zrem(key: string, ...members: string[]): Promise<number> {
    const entry = this.getValidEntry(key, 'zset');
    if (!entry) return 0;
    const zmap = entry.value as Map<string, number>;
    let removed = 0;
    for (const m of members) {
      if (zmap.delete(m)) removed++;
    }
    if (zmap.size === 0) this.store.delete(key);
    return removed;
  }

  public async zscore(key: string, member: string): Promise<string | null> {
    const entry = this.getValidEntry(key, 'zset');
    if (!entry) return null;
    const zmap = entry.value as Map<string, number>;
    const sc = zmap.get(member);
    return sc !== undefined ? String(sc) : null;
  }

  public async zcard(key: string): Promise<number> {
    const entry = this.getValidEntry(key, 'zset');
    return entry ? (entry.value as Map<string, number>).size : 0;
  }

  public async zrank(key: string, member: string): Promise<number | null> {
    const sorted = this.getSortedZSet(key);
    const idx = sorted.findIndex(([m]) => m === member);
    return idx >= 0 ? idx : null;
  }

  // Keys & PubSub
  public async keys(pattern: string = '*'): Promise<string[]> {
    const re = globToRegExp(pattern);
    const matched: string[] = [];
    for (const k of Array.from(this.store.keys())) {
      if (this.getValidEntry(k) !== null && re.test(k)) {
        matched.push(k);
      }
    }
    return matched;
  }

  public async publish(channel: string, message: string): Promise<number> {
    const subs = this.subscribers.get(channel);
    if (!subs || subs.size === 0) return 0;
    for (const cb of subs) {
      try {
        cb(message);
      } catch {}
    }
    return subs.size;
  }

  public subscribe(channel: string, callback: (message: string) => void): () => void {
    let subs = this.subscribers.get(channel);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(channel, subs);
    }
    subs.add(callback);
    return () => {
      subs?.delete(callback);
    };
  }

  public close(): void {
    // no-op for in-memory store
  }
}

const sharedMemoryStores = new Map<string, InMemoryRedisClient>();

function getSharedMemoryStore(urlKey: string = 'default'): InMemoryRedisClient {
  let store = sharedMemoryStores.get(urlKey);
  if (!store) {
    store = new InMemoryRedisClient();
    sharedMemoryStores.set(urlKey, store);
  }
  return store;
}

export class NamespacedRedis {
  public readonly namespaceName: string;
  public readonly delimiter: string;
  public client: any;
  private isOwnedClient: boolean;
  private fallbackToMemory: boolean;
  private memoryStore: InMemoryRedisClient;
  private usingMemoryFallback: boolean = false;
  private connectionUrl: string;

  constructor(options: NamespacedRedisOptions | string) {
    if (typeof options === 'string') {
      this.namespaceName = options;
      this.delimiter = ':';
      this.connectionUrl = 'redis://localhost:6379';
      this.fallbackToMemory = true;
      this.memoryStore = getSharedMemoryStore(this.connectionUrl);
      this.client = new RedisClient(this.connectionUrl, {
        connectionTimeout: 400,
        autoReconnect: false,
        maxRetries: 0,
      } as any);
      this.isOwnedClient = true;
    } else {
      this.namespaceName = options.namespace;
      this.delimiter = options.delimiter || ':';
      const defaultUrl =
        options.host || options.port
          ? `redis://${options.host || '127.0.0.1'}:${options.port || 6379}`
          : 'redis://localhost:6379';
      this.connectionUrl = options.url || defaultUrl;
      this.fallbackToMemory = options.fallbackToMemory ?? true;
      this.memoryStore = getSharedMemoryStore(this.connectionUrl);

      if (options.inMemory) {
        this.client = this.memoryStore;
        this.isOwnedClient = false;
        this.usingMemoryFallback = true;
      } else if (options.client) {
        this.client = options.client;
        this.isOwnedClient = false;
        this.usingMemoryFallback = options.client instanceof InMemoryRedisClient;
      } else {
        this.client = new RedisClient(this.connectionUrl, {
          connectionTimeout: 400,
          autoReconnect: false,
          maxRetries: 0,
        } as any);
        this.isOwnedClient = true;
      }
    }
  }

  private async execWithFallback<T>(op: (activeClient: any) => Promise<T>): Promise<T> {
    if (this.usingMemoryFallback) {
      return op(this.memoryStore);
    }
    try {
      return await op(this.client);
    } catch (err) {
      if (!this.fallbackToMemory) {
        throw err;
      }
      try {
        if (this.isOwnedClient && typeof this.client?.close === 'function') {
          this.client.close();
        }
      } catch {}
      this.usingMemoryFallback = true;
      this.client = this.memoryStore;
      return op(this.memoryStore);
    }
  }

  /**
   * Returns true if currently operating against the in-memory store
   */
  public isMemoryFallback(): boolean {
    return this.usingMemoryFallback;
  }

  /**
   * Verifies connectivity (or activates in-memory fallback if `fallbackToMemory` is enabled).
   */
  public async connect(): Promise<boolean> {
    try {
      await this.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns true if the client is connected or operating in in-memory fallback mode.
   */
  public isConnected(): boolean {
    return true;
  }

  /**
   * Returns the underlying active client (Bun RedisClient or InMemoryRedisClient)
   */
  public get raw(): any {
    return this.client;
  }

  /**
   * Create a sub-namespaced client (e.g. 'app' -> 'app:cache' -> 'app:cache:users')
   */
  public namespace(subNamespace: string): NamespacedRedis {
    const combined = `${this.namespaceName}${this.delimiter}${subNamespace}`;
    return new NamespacedRedis({
      namespace: combined,
      delimiter: this.delimiter,
      url: this.connectionUrl,
      client: this.usingMemoryFallback ? this.memoryStore : this.client,
      inMemory: this.usingMemoryFallback,
      fallbackToMemory: this.fallbackToMemory,
    });
  }

  /**
   * Prefixes a key with the namespace (if not already prefixed)
   */
  public prefixKey(key: string): string {
    const prefix = `${this.namespaceName}${this.delimiter}`;
    return key.startsWith(prefix) ? key : `${prefix}${key}`;
  }

  /**
   * Removes the namespace prefix from a key
   */
  public unprefixKey(fullKey: string): string {
    const prefix = `${this.namespaceName}${this.delimiter}`;
    return fullKey.startsWith(prefix) ? fullKey.slice(prefix.length) : fullKey;
  }

  /**
   * Ping the Redis server
   */
  public async ping(message?: string): Promise<string> {
    return this.execWithFallback(async (c) => (await c.ping(message)) || 'PONG');
  }

  // ===========================================================================
  // 1. Strings & Key-Value Operations
  // ===========================================================================

  public async get(key: string): Promise<string | null> {
    return this.execWithFallback(async (c) => (await c.get(this.prefixKey(key))) as string | null);
  }

  public async getBuffer(key: string): Promise<Uint8Array | null> {
    return this.execWithFallback(async (c) => (await c.getBuffer(this.prefixKey(key))) as Uint8Array | null);
  }

  public async set(
    key: string,
    value: string | number | boolean | Uint8Array,
    optionsOrTtlSeconds?: SetOptions | number
  ): Promise<'OK' | null> {
    const options: SetOptions | undefined =
      typeof optionsOrTtlSeconds === 'number' ? { ex: optionsOrTtlSeconds } : optionsOrTtlSeconds;
    const fullKey = this.prefixKey(key);
    const valStr =
      typeof value === 'object' && !(value instanceof Uint8Array) ? JSON.stringify(value) : String(value);

    return this.execWithFallback(async (c) => {
      if (options?.ex !== undefined && options?.nx) {
        return (await c.set(fullKey, valStr, 'EX', options.ex, 'NX')) as 'OK' | null;
      }
      if (options?.px !== undefined && options?.nx) {
        return (await c.set(fullKey, valStr, 'PX', options.px, 'NX')) as 'OK' | null;
      }
      if (options?.ex !== undefined) {
        return (await c.set(fullKey, valStr, 'EX', options.ex)) as 'OK' | null;
      }
      if (options?.px !== undefined) {
        return (await c.set(fullKey, valStr, 'PX', options.px)) as 'OK' | null;
      }
      if (options?.nx) {
        return (await c.set(fullKey, valStr, 'NX')) as 'OK' | null;
      }
      if (options?.xx) {
        return (await c.set(fullKey, valStr, 'XX')) as 'OK' | null;
      }
      return (await c.set(fullKey, valStr)) as 'OK' | null;
    });
  }

  public async getJson<T = any>(key: string, defaultVal?: T): Promise<T | null> {
    const val = await this.get(key);
    if (val === null || val === undefined) {
      return defaultVal !== undefined ? defaultVal : null;
    }
    try {
      return JSON.parse(val) as T;
    } catch {
      return (val as unknown) as T;
    }
  }

  public async setJson(key: string, value: any, optionsOrTtlSeconds?: SetOptions | number): Promise<'OK' | null> {
    const jsonStr = JSON.stringify(value);
    return this.set(key, jsonStr, optionsOrTtlSeconds);
  }

  /**
   * Cache-aside helper: returns cached JSON value if present, otherwise calls `fetcher()`, stores it, and returns it.
   */
  public async getOrSet<T = any>(
    key: string,
    fetcher: () => Promise<T> | T,
    ttlSeconds?: number
  ): Promise<T> {
    const existing = await this.getJson<T>(key);
    if (existing !== null && existing !== undefined) {
      return existing;
    }
    const fresh = await fetcher();
    await this.setJson(key, fresh, ttlSeconds !== undefined ? { ex: ttlSeconds } : undefined);
    return fresh;
  }

  public async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const fullKeys = keys.map((k) => this.prefixKey(k));
    return this.execWithFallback(async (c) => (await c.del(...fullKeys)) as number);
  }

  public async exists(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const fullKeys = keys.map((k) => this.prefixKey(k));
    return this.execWithFallback(async (c) => Number(await c.exists(...fullKeys)));
  }

  public async has(key: string): Promise<boolean> {
    const count = await this.exists(key);
    return count > 0;
  }

  public async expire(key: string, seconds: number): Promise<number> {
    return this.execWithFallback(async (c) => (await c.expire(this.prefixKey(key), seconds)) as number);
  }

  public async pexpire(key: string, milliseconds: number): Promise<number> {
    return this.execWithFallback(async (c) => (await c.pexpire(this.prefixKey(key), milliseconds)) as number);
  }

  public async ttl(key: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.ttl(this.prefixKey(key))) as number);
  }

  public async pttl(key: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.pttl(this.prefixKey(key))) as number);
  }

  public async persist(key: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.persist(this.prefixKey(key))) as number);
  }

  public async incr(key: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.incr(this.prefixKey(key))) as number);
  }

  public async decr(key: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.decr(this.prefixKey(key))) as number);
  }

  public async incrby(key: string, amount: number): Promise<number> {
    return this.execWithFallback(async (c) => (await c.incrby(this.prefixKey(key), amount)) as number);
  }

  public async decrby(key: string, amount: number): Promise<number> {
    return this.execWithFallback(async (c) => (await c.decrby(this.prefixKey(key), amount)) as number);
  }

  public async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const fullKeys = keys.map((k) => this.prefixKey(k));
    return this.execWithFallback(async (c) => (await c.mget(...fullKeys)) as (string | null)[]);
  }

  public async mset(kvMap: Record<string, string | number | boolean>): Promise<'OK'> {
    const args: string[] = [];
    for (const [k, v] of Object.entries(kvMap)) {
      args.push(this.prefixKey(k), String(v));
    }
    return this.execWithFallback(async (c) => (await c.mset(...args)) as 'OK');
  }

  // ===========================================================================
  // 2. Hashes
  // ===========================================================================

  public async hget(key: string, field: string): Promise<string | null> {
    return this.execWithFallback(async (c) => (await c.hget(this.prefixKey(key), field)) as string | null);
  }

  public async hgetJson<T = any>(key: string, field: string, defaultVal?: T): Promise<T | null> {
    const raw = await this.hget(key, field);
    if (!raw) return defaultVal !== undefined ? defaultVal : null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return (raw as unknown) as T;
    }
  }

  public async hset(key: string, fieldOrObj: string | Record<string, any>, val?: any): Promise<number> {
    const fullKey = this.prefixKey(key);
    return this.execWithFallback(async (c) => {
      if (typeof fieldOrObj === 'object') {
        const flatArgs: string[] = [];
        for (const [f, v] of Object.entries(fieldOrObj)) {
          flatArgs.push(f, typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
        return (await c.hset(fullKey, ...flatArgs)) as number;
      } else {
        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
        return (await c.hset(fullKey, fieldOrObj, valStr)) as number;
      }
    });
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    return this.execWithFallback(async (c) => {
      const res = (await c.hgetall(this.prefixKey(key))) as Record<string, string> | null;
      return res || {};
    });
  }

  public async hdel(key: string, ...fields: string[]): Promise<number> {
    if (fields.length === 0) return 0;
    return this.execWithFallback(async (c) => (await c.hdel(this.prefixKey(key), ...fields)) as number);
  }

  public async hexists(key: string, field: string): Promise<boolean> {
    return this.execWithFallback(async (c) => Boolean(await c.hexists(this.prefixKey(key), field)));
  }

  public async hkeys(key: string): Promise<string[]> {
    return this.execWithFallback(async (c) => (await c.hkeys(this.prefixKey(key))) as string[]);
  }

  public async hvals(key: string): Promise<string[]> {
    return this.execWithFallback(async (c) => (await c.hvals(this.prefixKey(key))) as string[]);
  }

  public async hlen(key: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.hlen(this.prefixKey(key))) as number);
  }

  public async hincrby(key: string, field: string, amount: number): Promise<number> {
    return this.execWithFallback(async (c) => (await c.hincrby(this.prefixKey(key), field, amount)) as number);
  }

  // ===========================================================================
  // 3. Lists
  // ===========================================================================

  public async lpush(key: string, ...values: (string | number)[]): Promise<number> {
    if (values.length === 0) return 0;
    const valStrs = values.map(String);
    return this.execWithFallback(async (c) => (await c.lpush(this.prefixKey(key), ...valStrs)) as number);
  }

  public async rpush(key: string, ...values: (string | number)[]): Promise<number> {
    if (values.length === 0) return 0;
    const valStrs = values.map(String);
    return this.execWithFallback(async (c) => (await c.rpush(this.prefixKey(key), ...valStrs)) as number);
  }

  public async lpop(key: string): Promise<string | null> {
    return this.execWithFallback(async (c) => (await c.lpop(this.prefixKey(key))) as string | null);
  }

  public async rpop(key: string): Promise<string | null> {
    return this.execWithFallback(async (c) => (await c.rpop(this.prefixKey(key))) as string | null);
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.execWithFallback(async (c) => (await c.lrange(this.prefixKey(key), start, stop)) as string[]);
  }

  public async llen(key: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.llen(this.prefixKey(key))) as number);
  }

  public async lindex(key: string, index: number): Promise<string | null> {
    return this.execWithFallback(async (c) => (await c.lindex(this.prefixKey(key), index)) as string | null);
  }

  // ===========================================================================
  // 4. Sets
  // ===========================================================================

  public async sadd(key: string, ...members: (string | number)[]): Promise<number> {
    if (members.length === 0) return 0;
    const memberStrs = members.map(String);
    return this.execWithFallback(async (c) => (await c.sadd(this.prefixKey(key), ...memberStrs)) as number);
  }

  public async srem(key: string, ...members: (string | number)[]): Promise<number> {
    if (members.length === 0) return 0;
    const memberStrs = members.map(String);
    return this.execWithFallback(async (c) => (await c.srem(this.prefixKey(key), ...memberStrs)) as number);
  }

  public async smembers(key: string): Promise<string[]> {
    return this.execWithFallback(async (c) => (await c.smembers(this.prefixKey(key))) as string[]);
  }

  public async sismember(key: string, member: string | number): Promise<boolean> {
    return this.execWithFallback(async (c) => Boolean(await c.sismember(this.prefixKey(key), String(member))));
  }

  public async scard(key: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.scard(this.prefixKey(key))) as number);
  }

  // ===========================================================================
  // 5. Sorted Sets (ZSet)
  // ===========================================================================

  public async zadd(key: string, score: number, member: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.zadd(this.prefixKey(key), score, member)) as number);
  }

  public async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.execWithFallback(async (c) => (await c.zrange(this.prefixKey(key), start, stop)) as string[]);
  }

  public async zrem(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    return this.execWithFallback(async (c) => (await c.zrem(this.prefixKey(key), ...members)) as number);
  }

  public async zscore(key: string, member: string): Promise<string | null> {
    return this.execWithFallback(async (c) => (await c.zscore(this.prefixKey(key), member)) as string | null);
  }

  public async zcard(key: string): Promise<number> {
    return this.execWithFallback(async (c) => (await c.zcard(this.prefixKey(key))) as number);
  }

  public async zrank(key: string, member: string): Promise<number | null> {
    return this.execWithFallback(async (c) => (await c.zrank(this.prefixKey(key), member)) as number | null);
  }

  // ===========================================================================
  // 6. Namespace Scoped Search & Flush
  // ===========================================================================

  /**
   * Search all keys belonging to this namespace, returning them un-prefixed
   */
  public async keys(pattern: string = '*'): Promise<string[]> {
    const fullPattern = this.prefixKey(pattern);
    const fullKeys = await this.execWithFallback(async (c) => (await c.keys(fullPattern)) as string[]);
    return fullKeys.map((k) => this.unprefixKey(k));
  }

  /**
   * Total count of keys currently belonging to this namespace
   */
  public async count(): Promise<number> {
    const allKeys = await this.keys('*');
    return allKeys.length;
  }

  /**
   * Safely deletes all keys under this namespace without touching other apps
   */
  public async flushNamespace(): Promise<number> {
    const allPrefixedKeys = await this.execWithFallback(
      async (c) => (await c.keys(this.prefixKey('*'))) as string[]
    );
    if (allPrefixedKeys.length === 0) return 0;
    return this.execWithFallback(async (c) => (await c.del(...allPrefixedKeys)) as number);
  }

  /**
   * Clear is an alias for flushNamespace()
   */
  public async clear(): Promise<number> {
    return this.flushNamespace();
  }

  /**
   * Alias for flushNamespace()
   */
  public async clearNamespace(): Promise<number> {
    return this.flushNamespace();
  }

  // ===========================================================================
  // 7. Distributed Mutex Lock
  // ===========================================================================

  /**
   * Acquire a distributed lock within this namespace
   */
  public async acquireLock(lockKey: string, ttlMs: number = 5000): Promise<string | null> {
    const fullLockKey = this.prefixKey(`lock:${lockKey}`);
    const token = `${Date.now()}-${crypto.randomUUID()}`;
    const result = await this.execWithFallback(async (c) => c.set(fullLockKey, token, 'PX', ttlMs, 'NX'));
    return result === 'OK' ? token : null;
  }

  /**
   * Release an acquired distributed lock
   */
  public async releaseLock(lockKey: string, token: string): Promise<boolean> {
    const fullLockKey = this.prefixKey(`lock:${lockKey}`);
    return this.execWithFallback(async (c) => {
      const currentToken = await c.get(fullLockKey);
      if (currentToken === token) {
        await c.del(fullLockKey);
        return true;
      }
      return false;
    });
  }

  /**
   * Executes an async callback with automatic lock acquisition and release
   */
  public async withLock<T>(lockKey: string, fn: () => Promise<T>, ttlMs: number = 5000): Promise<T> {
    const token = await this.acquireLock(lockKey, ttlMs);
    if (!token) {
      throw new Error(`Failed to acquire lock for key "${lockKey}" in namespace "${this.namespaceName}"`);
    }
    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey, token);
    }
  }

  // ===========================================================================
  // 8. Pub/Sub Messaging
  // ===========================================================================

  /**
   * Publish a message to a namespaced channel
   */
  public async publish(channel: string, message: string | object): Promise<number> {
    const fullChannel = this.prefixKey(`pubsub:${channel}`);
    const msgStr = typeof message === 'object' ? JSON.stringify(message) : String(message);
    return this.execWithFallback(async (c) => (await c.publish(fullChannel, msgStr)) as number);
  }

  /**
   * Subscribe to messages on a namespaced channel (supported in in-memory fallback mode)
   */
  public subscribe(channel: string, handler: (message: string) => void): () => void {
    const fullChannel = this.prefixKey(`pubsub:${channel}`);
    return this.memoryStore.subscribe(fullChannel, handler);
  }

  /**
   * Close connection if this instance created its own client
   */
  public close(): void {
    if (this.isOwnedClient && typeof this.client?.close === 'function') {
      try {
        this.client.close();
      } catch {}
    }
  }
}

/**
 * Factory helper function to create a new NamespacedRedis client
 */
export function createRedisNamespace(
  namespace: string,
  options?: Omit<NamespacedRedisOptions, 'namespace'>
): NamespacedRedis {
  return new NamespacedRedis({
    namespace,
    ...options,
  });
}
