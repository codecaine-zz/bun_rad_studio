/**
 * High-Performance Namespaced Redis Client & Wrapper for Bun
 * Zero-dependency multi-tenant isolation, typed KV, JSON, Hashes, Sets, Lists, Locks, and Pub/Sub
 */

import { RedisClient } from 'bun';

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
   * Existing native RedisClient instance to reuse
   */
  client?: RedisClient;
}

export interface SetOptions {
  ex?: number;       // Expiry time in seconds
  px?: number;       // Expiry time in milliseconds
  nx?: boolean;      // Only set if key does not exist
  xx?: boolean;      // Only set if key already exists
  keepTtl?: boolean; // Retain existing TTL
}

export class NamespacedRedis {
  public readonly namespaceName: string;
  public readonly delimiter: string;
  public readonly client: RedisClient;
  private isOwnedClient: boolean;

  constructor(options: NamespacedRedisOptions | string) {
    if (typeof options === 'string') {
      this.namespaceName = options;
      this.delimiter = ':';
      this.client = new RedisClient();
      this.isOwnedClient = true;
    } else {
      this.namespaceName = options.namespace;
      this.delimiter = options.delimiter || ':';
      if (options.client) {
        this.client = options.client;
        this.isOwnedClient = false;
      } else if (options.url) {
        this.client = new RedisClient(options.url);
        this.isOwnedClient = true;
      } else {
        this.client = new RedisClient();
        this.isOwnedClient = true;
      }
    }
  }

  /**
   * Returns the underlying native Bun RedisClient
   */
  public get raw(): RedisClient {
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
      client: this.client,
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
    return (await (this.client as any).ping(message)) || 'PONG';
  }

  // ===========================================================================
  // 1. Strings & Key-Value Operations
  // ===========================================================================

  public async get(key: string): Promise<string | null> {
    return (await this.client.get(this.prefixKey(key))) as string | null;
  }

  public async getBuffer(key: string): Promise<Uint8Array | null> {
    return (await (this.client as any).getBuffer(this.prefixKey(key))) as Uint8Array | null;
  }

  public async set(
    key: string,
    value: string | number | boolean | Uint8Array,
    options?: SetOptions
  ): Promise<'OK' | null> {
    const fullKey = this.prefixKey(key);
    const valStr = typeof value === 'object' && !(value instanceof Uint8Array)
      ? JSON.stringify(value)
      : String(value);

    if (options?.ex !== undefined) {
      return (await (this.client as any).set(fullKey, valStr, 'EX', options.ex)) as 'OK' | null;
    }
    if (options?.px !== undefined) {
      return (await (this.client as any).set(fullKey, valStr, 'PX', options.px)) as 'OK' | null;
    }
    if (options?.nx) {
      return (await (this.client as any).set(fullKey, valStr, 'NX')) as 'OK' | null;
    }
    if (options?.xx) {
      return (await (this.client as any).set(fullKey, valStr, 'XX')) as 'OK' | null;
    }

    return (await (this.client as any).set(fullKey, valStr)) as 'OK' | null;
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

  public async setJson(key: string, value: any, options?: SetOptions): Promise<'OK' | null> {
    const jsonStr = JSON.stringify(value);
    return this.set(key, jsonStr, options);
  }

  public async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const fullKeys = keys.map(k => this.prefixKey(k));
    return (await (this.client as any).del(...fullKeys)) as number;
  }

  public async exists(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    const fullKeys = keys.map(k => this.prefixKey(k));
    return (await (this.client as any).exists(...fullKeys)) as number;
  }

  public async expire(key: string, seconds: number): Promise<number> {
    return (await this.client.expire(this.prefixKey(key), seconds)) as number;
  }

  public async pexpire(key: string, milliseconds: number): Promise<number> {
    return (await (this.client as any).pexpire(this.prefixKey(key), milliseconds)) as number;
  }

  public async ttl(key: string): Promise<number> {
    return (await (this.client as any).ttl(this.prefixKey(key))) as number;
  }

  public async pttl(key: string): Promise<number> {
    return (await (this.client as any).pttl(this.prefixKey(key))) as number;
  }

  public async persist(key: string): Promise<number> {
    return (await (this.client as any).persist(this.prefixKey(key))) as number;
  }

  public async incr(key: string): Promise<number> {
    return (await this.client.incr(this.prefixKey(key))) as number;
  }

  public async decr(key: string): Promise<number> {
    return (await this.client.decr(this.prefixKey(key))) as number;
  }

  public async incrby(key: string, amount: number): Promise<number> {
    return (await this.client.incrby(this.prefixKey(key), amount)) as number;
  }

  public async decrby(key: string, amount: number): Promise<number> {
    return (await this.client.decrby(this.prefixKey(key), amount)) as number;
  }

  public async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const fullKeys = keys.map(k => this.prefixKey(k));
    return (await (this.client as any).mget(...fullKeys)) as (string | null)[];
  }

  public async mset(kvMap: Record<string, string | number | boolean>): Promise<'OK'> {
    const args: string[] = [];
    for (const [k, v] of Object.entries(kvMap)) {
      args.push(this.prefixKey(k), String(v));
    }
    return (await (this.client as any).mset(...args)) as 'OK';
  }

  // ===========================================================================
  // 2. Hashes
  // ===========================================================================

  public async hget(key: string, field: string): Promise<string | null> {
    return (await this.client.hget(this.prefixKey(key), field)) as string | null;
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
    if (typeof fieldOrObj === 'object') {
      const flatArgs: string[] = [];
      for (const [f, v] of Object.entries(fieldOrObj)) {
        flatArgs.push(f, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
      return (await (this.client as any).hset(fullKey, ...flatArgs)) as number;
    } else {
      const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
      return (await (this.client as any).hset(fullKey, fieldOrObj, valStr)) as number;
    }
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    const res = (await (this.client as any).hgetall(this.prefixKey(key))) as Record<string, string> | null;
    return res || {};
  }

  public async hdel(key: string, ...fields: string[]): Promise<number> {
    if (fields.length === 0) return 0;
    return (await (this.client as any).hdel(this.prefixKey(key), ...fields)) as number;
  }

  public async hexists(key: string, field: string): Promise<boolean> {
    const res = await this.client.hexists(this.prefixKey(key), field);
    return Boolean(res);
  }


  public async hkeys(key: string): Promise<string[]> {
    return (await this.client.hkeys(this.prefixKey(key))) as string[];
  }

  public async hvals(key: string): Promise<string[]> {
    return (await this.client.hvals(this.prefixKey(key))) as string[];
  }

  public async hlen(key: string): Promise<number> {
    return (await this.client.hlen(this.prefixKey(key))) as number;
  }

  public async hincrby(key: string, field: string, amount: number): Promise<number> {
    return (await this.client.hincrby(this.prefixKey(key), field, amount)) as number;
  }

  // ===========================================================================
  // 3. Lists
  // ===========================================================================

  public async lpush(key: string, ...values: (string | number)[]): Promise<number> {
    if (values.length === 0) return 0;
    const valStrs = values.map(String);
    return (await (this.client as any).lpush(this.prefixKey(key), ...valStrs)) as number;
  }

  public async rpush(key: string, ...values: (string | number)[]): Promise<number> {
    if (values.length === 0) return 0;
    const valStrs = values.map(String);
    return (await (this.client as any).rpush(this.prefixKey(key), ...valStrs)) as number;
  }

  public async lpop(key: string): Promise<string | null> {
    return (await this.client.lpop(this.prefixKey(key))) as string | null;
  }

  public async rpop(key: string): Promise<string | null> {
    return (await this.client.rpop(this.prefixKey(key))) as string | null;
  }

  public async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return (await this.client.lrange(this.prefixKey(key), start, stop)) as string[];
  }

  public async llen(key: string): Promise<number> {
    return (await this.client.llen(this.prefixKey(key))) as number;
  }

  public async lindex(key: string, index: number): Promise<string | null> {
    return (await this.client.lindex(this.prefixKey(key), index)) as string | null;
  }

  // ===========================================================================
  // 4. Sets
  // ===========================================================================

  public async sadd(key: string, ...members: (string | number)[]): Promise<number> {
    if (members.length === 0) return 0;
    const memberStrs = members.map(String);
    return (await (this.client as any).sadd(this.prefixKey(key), ...memberStrs)) as number;
  }

  public async srem(key: string, ...members: (string | number)[]): Promise<number> {
    if (members.length === 0) return 0;
    const memberStrs = members.map(String);
    return (await (this.client as any).srem(this.prefixKey(key), ...memberStrs)) as number;
  }

  public async smembers(key: string): Promise<string[]> {
    return (await this.client.smembers(this.prefixKey(key))) as string[];
  }

  public async sismember(key: string, member: string | number): Promise<boolean> {
    const res = await this.client.sismember(this.prefixKey(key), String(member));
    return Boolean(res);
  }


  public async scard(key: string): Promise<number> {
    return (await this.client.scard(this.prefixKey(key))) as number;
  }

  // ===========================================================================
  // 5. Sorted Sets (ZSet)
  // ===========================================================================

  public async zadd(key: string, score: number, member: string): Promise<number> {
    return (await (this.client as any).zadd(this.prefixKey(key), score, member)) as number;
  }

  public async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return (await this.client.zrange(this.prefixKey(key), start, stop)) as string[];
  }

  public async zrem(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    return (await (this.client as any).zrem(this.prefixKey(key), ...members)) as number;
  }

  public async zscore(key: string, member: string): Promise<string | null> {
    return (await this.client.zscore(this.prefixKey(key), member)) as string | null;
  }

  public async zcard(key: string): Promise<number> {
    return (await this.client.zcard(this.prefixKey(key))) as number;
  }

  public async zrank(key: string, member: string): Promise<number | null> {
    return (await (this.client as any).zrank(this.prefixKey(key), member)) as number | null;
  }

  // ===========================================================================
  // 6. Namespace Scoped Search & Flush
  // ===========================================================================

  /**
   * Search all keys belonging to this namespace, returning them un-prefixed
   */
  public async keys(pattern: string = '*'): Promise<string[]> {
    const fullPattern = this.prefixKey(pattern);
    const fullKeys = (await this.client.keys(fullPattern)) as string[];
    return fullKeys.map(k => this.unprefixKey(k));
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
    const allPrefixedKeys = (await this.client.keys(this.prefixKey('*'))) as string[];
    if (allPrefixedKeys.length === 0) return 0;
    return (await this.client.del(...allPrefixedKeys)) as number;
  }

  /**
   * Clear is an alias for flushNamespace()
   */
  public async clear(): Promise<number> {
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
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await (this.client as any).set(fullLockKey, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  /**
   * Release an acquired distributed lock
   */
  public async releaseLock(lockKey: string, token: string): Promise<boolean> {
    const fullLockKey = this.prefixKey(`lock:${lockKey}`);
    const currentToken = await this.client.get(fullLockKey);
    if (currentToken === token) {
      await this.client.del(fullLockKey);
      return true;
    }
    return false;
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
    return (await (this.client as any).publish(fullChannel, msgStr)) as number;
  }

  /**
   * Close connection if this instance created its own client
   */
  public close(): void {
    if (this.isOwnedClient && typeof (this.client as any).close === 'function') {
      (this.client as any).close();
    }
  }
}

/**
 * Factory helper function to create a new NamespacedRedis client
 */
export function createRedisNamespace(namespace: string, options?: Omit<NamespacedRedisOptions, 'namespace'>): NamespacedRedis {
  return new NamespacedRedis({
    namespace,
    ...options,
  });
}
