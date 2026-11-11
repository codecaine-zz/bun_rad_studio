/**
 * High-Performance Namespaced Redis Client & Wrapper for Bun
 * Zero-dependency multi-tenant isolation, typed KV, JSON, Hashes, Sets, Lists, ZSets, Locks, Pub/Sub & In-Memory Fallback
 */

import { RedisClient } from "bun";
import * as crypto from "node:crypto";

/** Configuration options for creating a `NamespacedRedis` client instance. */
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

/** Expiration and conditional existence options for Redis `SET` operations. */
export interface SetOptions {
  ex?: number; // Expiry time in seconds
  px?: number; // Expiry time in milliseconds
  nx?: boolean; // Only set if key does not exist
  xx?: boolean; // Only set if key already exists
  keepTtl?: boolean; // Retain existing TTL
}

interface MemoryEntry {
  type: "string" | "hash" | "list" | "set" | "zset";
  value: any;
  expiresAt: number | null; // epoch ms, or null for persistent
}

function globToRegExp(pattern: string): RegExp {
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else if ("+^$.()|[]\\{}".includes(c)) re += "\\" + c;
    else re += c;
  }
  re += "$";
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

  private getValidEntry(
    key: string,
    expectedType?: MemoryEntry["type"],
  ): MemoryEntry | null {
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

  /** Responds with `PONG` or the provided message string. */
  public async ping(message?: string): Promise<string> {
    return message || "PONG";
  }

  /** Gets the string value of `key`, or `null` if the key does not exist or has expired. */
  public async get(key: string): Promise<string | null> {
    const entry = this.getValidEntry(key, "string");
    if (!entry) return null;
    if (entry.value instanceof Uint8Array) {
      return Buffer.from(entry.value).toString("utf8");
    }
    return String(entry.value);
  }

  /** Gets the byte buffer of `key`, or `null` if the key does not exist. */
  public async getBuffer(key: string): Promise<Uint8Array | null> {
    const entry = this.getValidEntry(key, "string");
    if (!entry) return null;
    if (entry.value instanceof Uint8Array) {
      return new Uint8Array(entry.value);
    }
    return new Uint8Array(Buffer.from(String(entry.value), "utf8"));
  }

  /** Sets the string or binary value of `key` with optional `EX`, `PX`, `NX`, `XX`, or `KEEPTTL` flags. */
  public async set(
    key: string,
    val: string | Uint8Array,
    ...args: any[]
  ): Promise<"OK" | null> {
    const existing = this.getValidEntry(key);
    let expiresAt: number | null = null;
    let nx = false;
    let xx = false;
    let keepTtl = false;

    for (let i = 0; i < args.length; i++) {
      const flag = String(args[i] ?? "").toUpperCase();
      if (flag === "EX") {
        const sec = Number(args[++i] ?? 0);
        expiresAt = Date.now() + Math.max(0, sec * 1000);
      } else if (flag === "PX") {
        const ms = Number(args[++i] ?? 0);
        expiresAt = Date.now() + Math.max(0, ms);
      } else if (flag === "NX") {
        nx = true;
      } else if (flag === "XX") {
        xx = true;
      } else if (flag === "KEEPTTL") {
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
      type: "string",
      value: val instanceof Uint8Array ? new Uint8Array(val) : String(val),
      expiresAt,
    });
    return "OK";
  }

  /** Atomically deletes `key` only when its current string value equals `expected`. */
  public compareAndDel(key: string, expected: string): number {
    const entry = this.getValidEntry(key, "string");
    if (!entry) return 0;
    const cur =
      entry.value instanceof Uint8Array
        ? Buffer.from(entry.value).toString("utf8")
        : String(entry.value);
    if (cur === expected) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }

  /** Deletes one or more keys and returns the number of keys removed. */
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

  /** Returns the count of specified keys that currently exist in the store. */
  public async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.getValidEntry(k) !== null) count++;
    }
    return count;
  }

  /** Sets a timeout on `key` in seconds, returning `1` if the timeout was set or `0` if `key` does not exist. */
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

  /** Sets a timeout on `key` in milliseconds, returning `1` if set or `0` if `key` does not exist. */
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

  /** Returns the remaining time to live of `key` in seconds (`-1` if persistent, `-2` if missing). */
  public async ttl(key: string): Promise<number> {
    const entry = this.getValidEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  /** Returns the remaining time to live of `key` in milliseconds (`-1` if persistent, `-2` if missing). */
  public async pttl(key: string): Promise<number> {
    const entry = this.getValidEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.max(0, entry.expiresAt - Date.now());
  }

  /** Removes the existing timeout on `key`, returning `1` if a timeout was cleared or `0` otherwise. */
  public async persist(key: string): Promise<number> {
    const entry = this.getValidEntry(key);
    if (!entry || entry.expiresAt === null) return 0;
    entry.expiresAt = null;
    return 1;
  }

  /** Increments the integer value of `key` by `amount` and returns the new value. */
  public async incrby(key: string, amount: number): Promise<number> {
    const entry = this.getValidEntry(key, "string");
    const cur = entry ? parseInt(String(entry.value), 10) || 0 : 0;
    const next = cur + amount;
    this.store.set(key, {
      type: "string",
      value: String(next),
      expiresAt: entry ? entry.expiresAt : null,
    });
    return next;
  }

  /** Increments the integer value of `key` by `1` and returns the new value. */
  public async incr(key: string): Promise<number> {
    return this.incrby(key, 1);
  }

  /** Decrements the integer value of `key` by `1` and returns the new value. */
  public async decr(key: string): Promise<number> {
    return this.incrby(key, -1);
  }

  /** Decrements the integer value of `key` by `amount` and returns the new value. */
  public async decrby(key: string, amount: number): Promise<number> {
    return this.incrby(key, -amount);
  }

  /** Returns the string values of all specified keys in order (`null` for missing keys). */
  public async mget(...keys: string[]): Promise<(string | null)[]> {
    const out: (string | null)[] = [];
    for (const k of keys) {
      out.push(await this.get(k));
    }
    return out;
  }

  /** Sets multiple keys to their respective values given alternating `key, value` arguments. */
  public async mset(...args: string[]): Promise<"OK"> {
    for (let i = 0; i < args.length; i += 2) {
      const k = args[i];
      const v = args[i + 1] ?? "";
      if (k !== undefined) {
        await this.set(k, v);
      }
    }
    return "OK";
  }

  // Hashes
  /** Gets the value of a hash field stored at `key`, or `null` if not found. */
  public async hget(key: string, field: string): Promise<string | null> {
    const entry = this.getValidEntry(key, "hash");
    if (!entry) return null;
    const map = entry.value as Map<string, string>;
    return map.has(field) ? map.get(field)! : null;
  }

  /** Sets one or more field-value pairs in the hash stored at `key` and returns the count of newly added fields. */
  public async hset(key: string, ...args: string[]): Promise<number> {
    let entry = this.getValidEntry(key, "hash");
    if (!entry) {
      entry = {
        type: "hash",
        value: new Map<string, string>(),
        expiresAt: null,
      };
      this.store.set(key, entry);
    }
    const map = entry.value as Map<string, string>;
    let added = 0;
    for (let i = 0; i < args.length; i += 2) {
      const f = args[i];
      const v = args[i + 1] ?? "";
      if (f !== undefined) {
        if (!map.has(f)) added++;
        map.set(f, String(v));
      }
    }
    return added;
  }

  /** Returns all fields and values of the hash stored at `key` as a plain object. */
  public async hgetall(key: string): Promise<Record<string, string>> {
    const entry = this.getValidEntry(key, "hash");
    if (!entry) return {};
    const map = entry.value as Map<string, string>;
    const obj: Record<string, string> = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    return obj;
  }

  /** Removes one or more fields from the hash stored at `key` and returns the count of removed fields. */
  public async hdel(key: string, ...fields: string[]): Promise<number> {
    const entry = this.getValidEntry(key, "hash");
    if (!entry) return 0;
    const map = entry.value as Map<string, string>;
    let removed = 0;
    for (const f of fields) {
      if (map.delete(f)) removed++;
    }
    if (map.size === 0) this.store.delete(key);
    return removed;
  }

  /** Returns `1` if `field` exists in the hash stored at `key`, or `0` otherwise. */
  public async hexists(key: string, field: string): Promise<number> {
    const entry = this.getValidEntry(key, "hash");
    if (!entry) return 0;
    return (entry.value as Map<string, string>).has(field) ? 1 : 0;
  }

  /** Returns all field names in the hash stored at `key`. */
  public async hkeys(key: string): Promise<string[]> {
    const entry = this.getValidEntry(key, "hash");
    if (!entry) return [];
    return Array.from((entry.value as Map<string, string>).keys());
  }

  /** Returns all values in the hash stored at `key`. */
  public async hvals(key: string): Promise<string[]> {
    const entry = this.getValidEntry(key, "hash");
    if (!entry) return [];
    return Array.from((entry.value as Map<string, string>).values());
  }

  /** Returns the number of fields contained in the hash stored at `key`. */
  public async hlen(key: string): Promise<number> {
    const entry = this.getValidEntry(key, "hash");
    if (!entry) return 0;
    return (entry.value as Map<string, string>).size;
  }

  /** Increments the integer value of a hash `field` at `key` by `amount` and returns the new value. */
  public async hincrby(
    key: string,
    field: string,
    amount: number,
  ): Promise<number> {
    const curStr = await this.hget(key, field);
    const cur = curStr !== null ? parseInt(curStr, 10) || 0 : 0;
    const next = cur + amount;
    await this.hset(key, field, String(next));
    return next;
  }

  // Lists
  /** Prepends one or more values to the head of the list stored at `key` and returns the new list length. */
  public async lpush(key: string, ...values: string[]): Promise<number> {
    let entry = this.getValidEntry(key, "list");
    if (!entry) {
      entry = { type: "list", value: [] as string[], expiresAt: null };
      this.store.set(key, entry);
    }
    const list = entry.value as string[];
    for (const v of values) {
      list.unshift(String(v));
    }
    return list.length;
  }

  /** Appends one or more values to the tail of the list stored at `key` and returns the new list length. */
  public async rpush(key: string, ...values: string[]): Promise<number> {
    let entry = this.getValidEntry(key, "list");
    if (!entry) {
      entry = { type: "list", value: [] as string[], expiresAt: null };
      this.store.set(key, entry);
    }
    const list = entry.value as string[];
    for (const v of values) {
      list.push(String(v));
    }
    return list.length;
  }

  /** Removes and returns the first element of the list stored at `key`, or `null` if empty. */
  public async lpop(key: string): Promise<string | null> {
    const entry = this.getValidEntry(key, "list");
    if (!entry) return null;
    const list = entry.value as string[];
    const item = list.shift() ?? null;
    if (list.length === 0) this.store.delete(key);
    return item;
  }

  /** Removes and returns the last element of the list stored at `key`, or `null` if empty. */
  public async rpop(key: string): Promise<string | null> {
    const entry = this.getValidEntry(key, "list");
    if (!entry) return null;
    const list = entry.value as string[];
    const item = list.pop() ?? null;
    if (list.length === 0) this.store.delete(key);
    return item;
  }

  /** Returns the specified inclusive range of elements `[start, stop]` from the list stored at `key`. */
  public async lrange(
    key: string,
    start: number,
    stop: number,
  ): Promise<string[]> {
    const entry = this.getValidEntry(key, "list");
    if (!entry) return [];
    const list = entry.value as string[];
    const len = list.length;
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : stop;
    if (s >= len || s > e) return [];
    return list.slice(s, e + 1);
  }

  /** Returns the length of the list stored at `key`. */
  public async llen(key: string): Promise<number> {
    const entry = this.getValidEntry(key, "list");
    return entry ? (entry.value as string[]).length : 0;
  }

  /** Returns the element at `index` in the list stored at `key`, or `null` if out of range. */
  public async lindex(key: string, index: number): Promise<string | null> {
    const entry = this.getValidEntry(key, "list");
    if (!entry) return null;
    const list = entry.value as string[];
    const idx = index < 0 ? list.length + index : index;
    return list[idx] ?? null;
  }

  // Sets
  /** Adds one or more members to the set stored at `key` and returns the count of newly added members. */
  public async sadd(key: string, ...members: string[]): Promise<number> {
    let entry = this.getValidEntry(key, "set");
    if (!entry) {
      entry = { type: "set", value: new Set<string>(), expiresAt: null };
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

  /** Removes one or more members from the set stored at `key` and returns the count of removed members. */
  public async srem(key: string, ...members: string[]): Promise<number> {
    const entry = this.getValidEntry(key, "set");
    if (!entry) return 0;
    const set = entry.value as Set<string>;
    let removed = 0;
    for (const m of members) {
      if (set.delete(String(m))) removed++;
    }
    if (set.size === 0) this.store.delete(key);
    return removed;
  }

  /** Returns all members of the set stored at `key`. */
  public async smembers(key: string): Promise<string[]> {
    const entry = this.getValidEntry(key, "set");
    return entry ? Array.from(entry.value as Set<string>) : [];
  }

  /** Returns `1` if `member` is a member of the set stored at `key`, or `0` otherwise. */
  public async sismember(key: string, member: string): Promise<number> {
    const entry = this.getValidEntry(key, "set");
    if (!entry) return 0;
    return (entry.value as Set<string>).has(String(member)) ? 1 : 0;
  }

  /** Returns the cardinality (number of elements) of the set stored at `key`. */
  public async scard(key: string): Promise<number> {
    const entry = this.getValidEntry(key, "set");
    return entry ? (entry.value as Set<string>).size : 0;
  }

  // Sorted Sets (ZSet)
  /** Adds or updates a `member` with `score` in the sorted set stored at `key`, returning `1` if newly added or `0` if updated. */
  public async zadd(
    key: string,
    score: number,
    member: string,
  ): Promise<number> {
    let entry = this.getValidEntry(key, "zset");
    if (!entry) {
      entry = {
        type: "zset",
        value: new Map<string, number>(),
        expiresAt: null,
      };
      this.store.set(key, entry);
    }
    const zmap = entry.value as Map<string, number>;
    const isNew = !zmap.has(member);
    zmap.set(member, Number(score));
    return isNew ? 1 : 0;
  }

  private getSortedZSet(key: string): Array<[string, number]> {
    const entry = this.getValidEntry(key, "zset");
    if (!entry) return [];
    const zmap = entry.value as Map<string, number>;
    return Array.from(zmap.entries()).sort(
      (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
    );
  }

  /** Returns the members in the sorted set at `key` within the rank range `[start, stop]` ordered by ascending score. */
  public async zrange(
    key: string,
    start: number,
    stop: number,
  ): Promise<string[]> {
    const sorted = this.getSortedZSet(key);
    const len = sorted.length;
    if (len === 0) return [];
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : stop;
    if (s >= len || s > e) return [];
    return sorted.slice(s, e + 1).map(([member]) => member);
  }

  /** Removes one or more members from the sorted set at `key` and returns the count of removed members. */
  public async zrem(key: string, ...members: string[]): Promise<number> {
    const entry = this.getValidEntry(key, "zset");
    if (!entry) return 0;
    const zmap = entry.value as Map<string, number>;
    let removed = 0;
    for (const m of members) {
      if (zmap.delete(m)) removed++;
    }
    if (zmap.size === 0) this.store.delete(key);
    return removed;
  }

  /** Returns the score of `member` in the sorted set at `key` as a string, or `null` if not present. */
  public async zscore(key: string, member: string): Promise<string | null> {
    const entry = this.getValidEntry(key, "zset");
    if (!entry) return null;
    const zmap = entry.value as Map<string, number>;
    const sc = zmap.get(member);
    return sc !== undefined ? String(sc) : null;
  }

  /** Returns the number of members in the sorted set stored at `key`. */
  public async zcard(key: string): Promise<number> {
    const entry = this.getValidEntry(key, "zset");
    return entry ? (entry.value as Map<string, number>).size : 0;
  }

  /** Returns the 0-based ascending rank of `member` in the sorted set at `key`, or `null` if missing. */
  public async zrank(key: string, member: string): Promise<number | null> {
    const sorted = this.getSortedZSet(key);
    const idx = sorted.findIndex(([m]) => m === member);
    return idx >= 0 ? idx : null;
  }

  // Keys & PubSub
  /** Returns all non-expired keys matching the glob `pattern` (default `'*'`). */
  public async keys(pattern: string = "*"): Promise<string[]> {
    const re = globToRegExp(pattern);
    const matched: string[] = [];
    for (const k of Array.from(this.store.keys())) {
      if (this.getValidEntry(k) !== null && re.test(k)) {
        matched.push(k);
      }
    }
    return matched;
  }

  /** Publishes `message` to all in-memory subscribers on `channel` and returns the subscriber count. */
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

  /** Subscribes `callback` to messages published on `channel` and returns an unsubscribe function. */
  public subscribe(
    channel: string,
    callback: (message: string) => void,
  ): () => void {
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

  /** No-op close method for compatibility with the native Redis client interface. */
  public close(): void {
    // no-op for in-memory store
  }
}

const sharedMemoryStores = new Map<string, InMemoryRedisClient>();
const sharedMemoryRefCounts = new Map<string, number>();

const RELEASE_LOCK_LUA =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

function getSharedMemoryStore(urlKey: string = "default"): InMemoryRedisClient {
  let store = sharedMemoryStores.get(urlKey);
  if (!store) {
    store = new InMemoryRedisClient();
    sharedMemoryStores.set(urlKey, store);
  }
  sharedMemoryRefCounts.set(
    urlKey,
    (sharedMemoryRefCounts.get(urlKey) ?? 0) + 1,
  );
  return store;
}

function releaseSharedMemoryStore(urlKey: string = "default"): void {
  const next = (sharedMemoryRefCounts.get(urlKey) ?? 1) - 1;
  if (next <= 0) {
    sharedMemoryRefCounts.delete(urlKey);
    sharedMemoryStores.delete(urlKey);
  } else {
    sharedMemoryRefCounts.set(urlKey, next);
  }
}

function isRedisTransportError(err: unknown): boolean {
  const e = err as any;
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? err ?? "").trim();
  if (
    /^(WRONGTYPE|ERR\b|EXECABORT|MOVED|ASK|NOSCRIPT|OOM|READONLY|NOPERM|NOAUTH|BUSYGROUP|CROSSSLOT|INVALID)/i.test(
      msg,
    )
  ) {
    return false;
  }
  if (
    /^(ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|ECONNRESET|EPIPE|EAI_AGAIN|ERR_REDIS_CONNECTION|ERR_SOCKET)/i.test(
      code,
    )
  ) {
    return true;
  }
  return /connect|connection|closed|unreachable|refused|timed?\s*out|socket|ECONN|ENOTFOUND|EHOSTUNREACH/i.test(
    msg,
  );
}

/**
 * Namespaced Redis client wrapper providing multi-tenant key prefixing, typed JSON helpers,
 * distributed locks, pub/sub, and transparent fallback to `InMemoryRedisClient`.
 */
export class NamespacedRedis {
  public readonly namespaceName: string;
  public readonly delimiter: string;
  public client: any;
  private isOwnedClient: boolean;
  private fallbackToMemory: boolean;
  private memoryStore: InMemoryRedisClient;
  private usingMemoryFallback: boolean = false;
  private connectionUrl: string;
  private subscriberClients: Set<any> = new Set();
  private closed: boolean = false;

  /** Creates a `NamespacedRedis` client for the specified namespace string or `NamespacedRedisOptions`. */
  constructor(options: NamespacedRedisOptions | string) {
    if (typeof options === "string") {
      this.namespaceName = options;
      this.delimiter = ":";
      this.connectionUrl = "redis://localhost:6379";
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
      this.delimiter = options.delimiter || ":";
      const defaultUrl =
        options.host || options.port
          ? `redis://${options.host || "127.0.0.1"}:${options.port || 6379}`
          : "redis://localhost:6379";
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
        this.usingMemoryFallback =
          options.client instanceof InMemoryRedisClient;
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

  private async execWithFallback<T>(
    op: (activeClient: any) => Promise<T>,
  ): Promise<T> {
    if (this.usingMemoryFallback) {
      return op(this.memoryStore);
    }
    try {
      return await op(this.client);
    } catch (err) {
      if (!this.fallbackToMemory || !isRedisTransportError(err)) {
        throw err;
      }
      try {
        if (this.isOwnedClient && typeof this.client?.close === "function") {
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
    return this.execWithFallback(
      async (c) => (await c.ping(message)) || "PONG",
    );
  }

  // ===========================================================================
  // 1. Strings & Key-Value Operations
  // ===========================================================================

  /** Gets the string value of a namespaced `key`, or `null` if missing. */
  public async get(key: string): Promise<string | null> {
    return this.execWithFallback(
      async (c) => (await c.get(this.prefixKey(key))) as string | null,
    );
  }

  /** Gets the raw `Uint8Array` buffer of a namespaced `key`, or `null` if missing. */
  public async getBuffer(key: string): Promise<Uint8Array | null> {
    return this.execWithFallback(
      async (c) =>
        (await c.getBuffer(this.prefixKey(key))) as Uint8Array | null,
    );
  }

  /** Sets a namespaced `key` to `value` with optional TTL seconds or `SetOptions` (`ex`, `px`, `nx`, `xx`, `keepTtl`). */
  public async set(
    key: string,
    value: string | number | boolean | Uint8Array,
    optionsOrTtlSeconds?: SetOptions | number,
  ): Promise<"OK" | null> {
    const options: SetOptions | undefined =
      typeof optionsOrTtlSeconds === "number"
        ? { ex: optionsOrTtlSeconds }
        : optionsOrTtlSeconds;
    const fullKey = this.prefixKey(key);
    const valPayload: string | Buffer =
      value instanceof Uint8Array
        ? Buffer.from(value)
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);

    const extraArgs: any[] = [];
    if (options?.ex !== undefined) {
      extraArgs.push("EX", options.ex);
    } else if (options?.px !== undefined) {
      extraArgs.push("PX", options.px);
    } else if (options?.keepTtl) {
      extraArgs.push("KEEPTTL");
    }
    if (options?.nx) {
      extraArgs.push("NX");
    } else if (options?.xx) {
      extraArgs.push("XX");
    }

    return this.execWithFallback(
      async (c) =>
        (await c.set(fullKey, valPayload, ...extraArgs)) as "OK" | null,
    );
  }

  /** Gets and JSON-parses the value at `key`, returning `defaultVal` (or `null`) if missing. */
  public async getJson<T = any>(
    key: string,
    defaultVal?: T,
  ): Promise<T | null> {
    const val = await this.get(key);
    if (val === null || val === undefined) {
      return defaultVal !== undefined ? defaultVal : null;
    }
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }

  /** JSON-serializes `value` and stores it at the namespaced `key` with optional TTL or `SetOptions`. */
  public async setJson(
    key: string,
    value: any,
    optionsOrTtlSeconds?: SetOptions | number,
  ): Promise<"OK" | null> {
    const jsonStr = JSON.stringify(value);
    return this.set(key, jsonStr, optionsOrTtlSeconds);
  }

  /**
   * Cache-aside helper: returns cached JSON value if present, otherwise calls `fetcher()`, stores it, and returns it.
   */
  public async getOrSet<T = any>(
    key: string,
    fetcher: () => Promise<T> | T,
    ttlSeconds?: number,
  ): Promise<T> {
    const existing = await this.getJson<T>(key);
    if (existing !== null && existing !== undefined) {
      return existing;
    }
    const fresh = await fetcher();
    await this.setJson(
      key,
      fresh,
      ttlSeconds !== undefined ? { ex: ttlSeconds } : undefined,
    );
    return fresh;
  }

  /** Deletes one or more namespaced keys and returns the count of removed keys. */
  public async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const fullKeys = keys.map((k) => this.prefixKey(k));
    return this.execWithFallback(
      async (c) => (await c.del(...fullKeys)) as number,
    );
  }

  /** Returns how many of the given namespaced keys currently exist. */
  public async exists(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const fullKeys = keys.map((k) => this.prefixKey(k));
    return this.execWithFallback(async (c) =>
      Number(await c.exists(...fullKeys)),
    );
  }

  /** Returns `true` if the namespaced `key` exists. */
  public async has(key: string): Promise<boolean> {
    const count = await this.exists(key);
    return count > 0;
  }

  /** Sets an expiration timeout in seconds on the namespaced `key`. */
  public async expire(key: string, seconds: number): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.expire(this.prefixKey(key), seconds)) as number,
    );
  }

  /** Sets an expiration timeout in milliseconds on the namespaced `key`. */
  public async pexpire(key: string, milliseconds: number): Promise<number> {
    return this.execWithFallback(
      async (c) =>
        (await c.pexpire(this.prefixKey(key), milliseconds)) as number,
    );
  }

  /** Returns the remaining time to live in seconds for the namespaced `key`. */
  public async ttl(key: string): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.ttl(this.prefixKey(key))) as number,
    );
  }

  /** Returns the remaining time to live in milliseconds for the namespaced `key`. */
  public async pttl(key: string): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.pttl(this.prefixKey(key))) as number,
    );
  }

  /** Removes any expiration timeout from the namespaced `key`. */
  public async persist(key: string): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.persist(this.prefixKey(key))) as number,
    );
  }

  /** Increments the integer value of the namespaced `key` by `1` and returns the new value. */
  public async incr(key: string): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.incr(this.prefixKey(key))) as number,
    );
  }

  /** Decrements the integer value of the namespaced `key` by `1` and returns the new value. */
  public async decr(key: string): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.decr(this.prefixKey(key))) as number,
    );
  }

  /** Increments the integer value of the namespaced `key` by `amount` and returns the new value. */
  public async incrby(key: string, amount: number): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.incrby(this.prefixKey(key), amount)) as number,
    );
  }

  /** Decrements the integer value of the namespaced `key` by `amount` and returns the new value. */
  public async decrby(key: string, amount: number): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.decrby(this.prefixKey(key), amount)) as number,
    );
  }

  /** Fetches the string values of multiple namespaced keys in a single call. */
  public async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const fullKeys = keys.map((k) => this.prefixKey(k));
    return this.execWithFallback(
      async (c) => (await c.mget(...fullKeys)) as (string | null)[],
    );
  }

  /** Sets multiple namespaced keys from a key-value dictionary in a single call. */
  public async mset(
    kvMap: Record<string, string | number | boolean>,
  ): Promise<"OK"> {
    const args: string[] = [];
    for (const [k, v] of Object.entries(kvMap)) {
      args.push(this.prefixKey(k), String(v));
    }
    return this.execWithFallback(async (c) => (await c.mset(...args)) as "OK");
  }

  // ===========================================================================
  // 2. Hashes
  // ===========================================================================

  /** Gets the string value of `field` in the hash stored at the namespaced `key`. */
  public async hget(key: string, field: string): Promise<string | null> {
    return this.execWithFallback(
      async (c) => (await c.hget(this.prefixKey(key), field)) as string | null,
    );
  }

  /** Gets and JSON-parses `field` from the hash stored at the namespaced `key`, returning `defaultVal` if missing. */
  public async hgetJson<T = any>(
    key: string,
    field: string,
    defaultVal?: T,
  ): Promise<T | null> {
    const raw = await this.hget(key, field);
    if (!raw) return defaultVal !== undefined ? defaultVal : null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  /** Sets a single `field`/`val` pair or an object map of fields in the hash at the namespaced `key`. */
  public async hset(
    key: string,
    fieldOrObj: string | Record<string, any>,
    val?: any,
  ): Promise<number> {
    const fullKey = this.prefixKey(key);
    return this.execWithFallback(async (c) => {
      if (typeof fieldOrObj === "object") {
        const flatArgs: string[] = [];
        for (const [f, v] of Object.entries(fieldOrObj)) {
          flatArgs.push(
            f,
            typeof v === "object" ? JSON.stringify(v) : String(v),
          );
        }
        return (await c.hset(fullKey, ...flatArgs)) as number;
      } else {
        const valStr =
          typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
        return (await c.hset(fullKey, fieldOrObj, valStr)) as number;
      }
    });
  }

  /** Returns all field-value pairs from the hash stored at the namespaced `key`. */
  public async hgetall(key: string): Promise<Record<string, string>> {
    return this.execWithFallback(async (c) => {
      const res = (await c.hgetall(this.prefixKey(key))) as Record<
        string,
        string
      > | null;
      return res || {};
    });
  }

  /** Deletes one or more `fields` from the hash stored at the namespaced `key`. */
  public async hdel(key: string, ...fields: string[]): Promise<number> {
    if (fields.length === 0) return 0;
    return this.execWithFallback(
      async (c) => (await c.hdel(this.prefixKey(key), ...fields)) as number,
    );
  }

  /** Returns `true` if `field` exists in the hash stored at the namespaced `key`. */
  public async hexists(key: string, field: string): Promise<boolean> {
    return this.execWithFallback(async (c) =>
      Boolean(await c.hexists(this.prefixKey(key), field)),
    );
  }

  /** Returns all field names in the hash stored at the namespaced `key`. */
  public async hkeys(key: string): Promise<string[]> {
    return this.execWithFallback(
      async (c) => (await c.hkeys(this.prefixKey(key))) as string[],
    );
  }

  /** Returns all field values in the hash stored at the namespaced `key`. */
  public async hvals(key: string): Promise<string[]> {
    return this.execWithFallback(
      async (c) => (await c.hvals(this.prefixKey(key))) as string[],
    );
  }

  /** Returns the number of fields in the hash stored at the namespaced `key`. */
  public async hlen(key: string): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.hlen(this.prefixKey(key))) as number,
    );
  }

  /** Increments the integer value of `field` in the hash at the namespaced `key` by `amount`. */
  public async hincrby(
    key: string,
    field: string,
    amount: number,
  ): Promise<number> {
    return this.execWithFallback(
      async (c) =>
        (await c.hincrby(this.prefixKey(key), field, amount)) as number,
    );
  }

  // ===========================================================================
  // 3. Lists
  // ===========================================================================

  /** Prepends one or more values to the head of the list at the namespaced `key`. */
  public async lpush(
    key: string,
    ...values: (string | number)[]
  ): Promise<number> {
    if (values.length === 0) return 0;
    const valStrs = values.map(String);
    return this.execWithFallback(
      async (c) => (await c.lpush(this.prefixKey(key), ...valStrs)) as number,
    );
  }

  /** Appends one or more values to the tail of the list at the namespaced `key`. */
  public async rpush(
    key: string,
    ...values: (string | number)[]
  ): Promise<number> {
    if (values.length === 0) return 0;
    const valStrs = values.map(String);
    return this.execWithFallback(
      async (c) => (await c.rpush(this.prefixKey(key), ...valStrs)) as number,
    );
  }

  /** Removes and returns the first element of the list at the namespaced `key`, or `null` if empty. */
  public async lpop(key: string): Promise<string | null> {
    return this.execWithFallback(
      async (c) => (await c.lpop(this.prefixKey(key))) as string | null,
    );
  }

  /** Removes and returns the last element of the list at the namespaced `key`, or `null` if empty. */
  public async rpop(key: string): Promise<string | null> {
    return this.execWithFallback(
      async (c) => (await c.rpop(this.prefixKey(key))) as string | null,
    );
  }

  /** Returns the elements in the inclusive range `[start, stop]` from the list at the namespaced `key`. */
  public async lrange(
    key: string,
    start: number,
    stop: number,
  ): Promise<string[]> {
    return this.execWithFallback(
      async (c) =>
        (await c.lrange(this.prefixKey(key), start, stop)) as string[],
    );
  }

  /** Returns the length of the list stored at the namespaced `key`. */
  public async llen(key: string): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.llen(this.prefixKey(key))) as number,
    );
  }

  /** Returns the element at `index` in the list stored at the namespaced `key`, or `null` if out of bounds. */
  public async lindex(key: string, index: number): Promise<string | null> {
    return this.execWithFallback(
      async (c) =>
        (await c.lindex(this.prefixKey(key), index)) as string | null,
    );
  }

  // ===========================================================================
  // 4. Sets
  // ===========================================================================

  /** Adds one or more members to the set at the namespaced `key` and returns the count of newly added members. */
  public async sadd(
    key: string,
    ...members: (string | number)[]
  ): Promise<number> {
    if (members.length === 0) return 0;
    const memberStrs = members.map(String);
    return this.execWithFallback(
      async (c) => (await c.sadd(this.prefixKey(key), ...memberStrs)) as number,
    );
  }

  /** Removes one or more members from the set at the namespaced `key` and returns the count of removed members. */
  public async srem(
    key: string,
    ...members: (string | number)[]
  ): Promise<number> {
    if (members.length === 0) return 0;
    const memberStrs = members.map(String);
    return this.execWithFallback(
      async (c) => (await c.srem(this.prefixKey(key), ...memberStrs)) as number,
    );
  }

  /** Returns all members of the set stored at the namespaced `key`. */
  public async smembers(key: string): Promise<string[]> {
    return this.execWithFallback(
      async (c) => (await c.smembers(this.prefixKey(key))) as string[],
    );
  }

  /** Returns `true` if `member` belongs to the set stored at the namespaced `key`. */
  public async sismember(
    key: string,
    member: string | number,
  ): Promise<boolean> {
    return this.execWithFallback(async (c) =>
      Boolean(await c.sismember(this.prefixKey(key), String(member))),
    );
  }

  /** Returns the cardinality (member count) of the set stored at the namespaced `key`. */
  public async scard(key: string): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.scard(this.prefixKey(key))) as number,
    );
  }

  // ===========================================================================
  // 5. Sorted Sets (ZSet)
  // ===========================================================================

  /** Adds or updates `member` with `score` in the sorted set at the namespaced `key`. */
  public async zadd(
    key: string,
    score: number,
    member: string,
  ): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.zadd(this.prefixKey(key), score, member)) as number,
    );
  }

  /** Returns members within the rank range `[start, stop]` from the sorted set at the namespaced `key`. */
  public async zrange(
    key: string,
    start: number,
    stop: number,
  ): Promise<string[]> {
    return this.execWithFallback(
      async (c) =>
        (await c.zrange(this.prefixKey(key), start, stop)) as string[],
    );
  }

  /** Removes one or more `members` from the sorted set at the namespaced `key`. */
  public async zrem(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    return this.execWithFallback(
      async (c) => (await c.zrem(this.prefixKey(key), ...members)) as number,
    );
  }

  /** Returns the score of `member` in the sorted set at the namespaced `key` as a string, or `null` if missing. */
  public async zscore(key: string, member: string): Promise<string | null> {
    return this.execWithFallback(
      async (c) =>
        (await c.zscore(this.prefixKey(key), member)) as string | null,
    );
  }

  /** Returns the number of elements in the sorted set at the namespaced `key`. */
  public async zcard(key: string): Promise<number> {
    return this.execWithFallback(
      async (c) => (await c.zcard(this.prefixKey(key))) as number,
    );
  }

  /** Returns the 0-based ascending rank of `member` in the sorted set at the namespaced `key`, or `null` if missing. */
  public async zrank(key: string, member: string): Promise<number | null> {
    return this.execWithFallback(
      async (c) =>
        (await c.zrank(this.prefixKey(key), member)) as number | null,
    );
  }

  // ===========================================================================
  // 6. Namespace Scoped Search & Flush
  // ===========================================================================

  /**
   * Search all keys belonging to this namespace, returning them un-prefixed
   */
  public async keys(pattern: string = "*"): Promise<string[]> {
    const fullPattern = this.prefixKey(pattern);
    const fullKeys = await this.execWithFallback(
      async (c) => (await c.keys(fullPattern)) as string[],
    );
    return fullKeys.map((k) => this.unprefixKey(k));
  }

  /**
   * Total count of keys currently belonging to this namespace
   */
  public async count(): Promise<number> {
    const allKeys = await this.keys("*");
    return allKeys.length;
  }

  /**
   * Safely deletes all keys under this namespace without touching other apps
   */
  public async flushNamespace(): Promise<number> {
    const allPrefixedKeys = await this.execWithFallback(
      async (c) => (await c.keys(this.prefixKey("*"))) as string[],
    );
    if (allPrefixedKeys.length === 0) return 0;
    return this.execWithFallback(
      async (c) => (await c.del(...allPrefixedKeys)) as number,
    );
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
  public async acquireLock(
    lockKey: string,
    ttlMs: number = 5000,
  ): Promise<string | null> {
    const fullLockKey = this.prefixKey(`lock:${lockKey}`);
    const token = `${Date.now()}-${crypto.randomUUID()}`;
    const result = await this.execWithFallback(async (c) =>
      c.set(fullLockKey, token, "PX", ttlMs, "NX"),
    );
    return result === "OK" ? token : null;
  }

  /**
   * Release an acquired distributed lock atomically
   */
  public async releaseLock(lockKey: string, token: string): Promise<boolean> {
    const fullLockKey = this.prefixKey(`lock:${lockKey}`);
    return this.execWithFallback(async (c) => {
      if (c instanceof InMemoryRedisClient) {
        return c.compareAndDel(fullLockKey, token) === 1;
      }
      if (typeof c?.send === "function") {
        const res = await c.send("EVAL", [
          RELEASE_LOCK_LUA,
          "1",
          fullLockKey,
          token,
        ]);
        return Number(res) === 1;
      }
      if (typeof c?.eval === "function") {
        const res = await c.eval(RELEASE_LOCK_LUA, 1, fullLockKey, token);
        return Number(res) === 1;
      }
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
  public async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    ttlMs: number = 5000,
  ): Promise<T> {
    const token = await this.acquireLock(lockKey, ttlMs);
    if (!token) {
      throw new Error(
        `Failed to acquire lock for key "${lockKey}" in namespace "${this.namespaceName}"`,
      );
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
  public async publish(
    channel: string,
    message: string | object,
  ): Promise<number> {
    const fullChannel = this.prefixKey(`pubsub:${channel}`);
    const msgStr =
      typeof message === "object" ? JSON.stringify(message) : String(message);
    return this.execWithFallback(
      async (c) => (await c.publish(fullChannel, msgStr)) as number,
    );
  }

  /**
   * Subscribe to messages on a namespaced channel across live Redis or in-memory fallback
   */
  public subscribe(
    channel: string,
    handler: (message: string) => void,
  ): (() => void) & { unsubscribe: () => Promise<void> } {
    const fullChannel = this.prefixKey(`pubsub:${channel}`);
    let cancelled = false;
    let memUnsub: (() => void) | null = null;
    let subClient: any = null;

    if (this.usingMemoryFallback) {
      memUnsub = this.memoryStore.subscribe(fullChannel, (msg) => {
        if (!cancelled) handler(msg);
      });
    } else if (typeof this.client?.subscribe === "function") {
      try {
        subClient =
          typeof this.client.duplicate === "function"
            ? null
            : new RedisClient(this.connectionUrl, {
                connectionTimeout: 400,
                autoReconnect: false,
                maxRetries: 0,
              } as any);
      } catch {
        subClient = null;
      }

      const attachLiveSub = async () => {
        try {
          if (!subClient && typeof this.client?.duplicate === "function") {
            subClient = await this.client.duplicate();
          }
          const target = subClient || this.client;
          if (subClient) {
            this.subscriberClients.add(subClient);
          }
          if (cancelled) {
            if (subClient && typeof subClient.close === "function") {
              subClient.close();
              this.subscriberClients.delete(subClient);
            }
            return;
          }
          await target.subscribe(fullChannel, (msg: string) => {
            if (!cancelled) handler(String(msg));
          });
        } catch (err) {
          if (subClient) {
            try {
              subClient.close?.();
            } catch {}
            this.subscriberClients.delete(subClient);
            subClient = null;
          }
          if (this.fallbackToMemory && isRedisTransportError(err)) {
            this.usingMemoryFallback = true;
            this.client = this.memoryStore;
            if (!cancelled && !memUnsub) {
              memUnsub = this.memoryStore.subscribe(fullChannel, (msg) => {
                if (!cancelled) handler(msg);
              });
            }
          }
        }
      };
      void attachLiveSub();
    } else {
      memUnsub = this.memoryStore.subscribe(fullChannel, (msg) => {
        if (!cancelled) handler(msg);
      });
    }

    const doUnsubscribe = async (): Promise<void> => {
      if (cancelled) return;
      cancelled = true;
      if (memUnsub) {
        memUnsub();
        memUnsub = null;
      }
      if (subClient) {
        this.subscriberClients.delete(subClient);
        try {
          if (typeof subClient.unsubscribe === "function") {
            await subClient.unsubscribe(fullChannel);
          }
        } catch {}
        try {
          subClient.close?.();
        } catch {}
        subClient = null;
      }
    };

    const unsubFn = (() => {
      void doUnsubscribe();
    }) as (() => void) & { unsubscribe: () => Promise<void> };
    unsubFn.unsubscribe = doUnsubscribe;
    return unsubFn;
  }

  /**
   * Close connection if this instance created its own client and release shared memory references
   */
  public close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const sub of this.subscriberClients) {
      try {
        sub?.close?.();
      } catch {}
    }
    this.subscriberClients.clear();
    if (this.isOwnedClient && typeof this.client?.close === "function") {
      try {
        this.client.close();
      } catch {}
    }
    releaseSharedMemoryStore(this.connectionUrl);
  }
}

/**
 * Factory helper function to create a new NamespacedRedis client
 */
export function createRedisNamespace(
  namespace: string,
  options?: Omit<NamespacedRedisOptions, "namespace">,
): NamespacedRedis {
  return new NamespacedRedis({
    namespace,
    ...options,
  });
}
