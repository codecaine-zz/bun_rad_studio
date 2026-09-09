/**
 * ⚡ Bun RAD Studio - Redis Studio Pro Server Engine
 * 
 * High-performance background HTTP telemetry & database engine for Redis Studio Pro.
 * Powered 100% by Bun's native C-speed Redis client (`import { redis, RedisClient } from "bun"`).
 * 
 * Features:
 * - Direct native Redis client with sub-millisecond execution latency
 * - Comprehensive CRUD across all Redis types: String, Hash, List, Set, ZSet, Stream, Bitmap, HyperLogLog
 * - Interactive raw CLI runner via `client.send(cmd, args)`
 * - Server telemetry: Memory, Ops/sec, Hit Ratio, Connected Clients, Slowlog
 * - Real-time Pub/Sub manager with message logging
 * - Dynamic URL & DB selector switcher (DB 0-15)
 * - Rich Enterprise Sample Dataset seeder spanning all Redis data structures
 */

import { redis, RedisClient } from "bun";
import { generateRedisStudioHtml } from "./redis_studio.ts";

export interface RedisServerOptions {
  port?: number;
  host?: string;
  url?: string;
  db?: number;
}

export interface RedisKpis {
  connected: boolean;
  url: string;
  activeDb: number;
  totalKeys: number;
  usedMemoryHuman: string;
  usedMemoryBytes: number;
  usedMemoryPeakHuman: string;
  memFragmentationRatio: number;
  connectedClients: number;
  instantaneousOpsPerSec: number;
  totalCommandsProcessed: number;
  uptimeInSeconds: number;
  uptimeFormatted: string;
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRatioPercent: number;
  redisVersion: string;
  os: string;
  arch: string;
  tcpPort: number;
}

export interface KeySummary {
  key: string;
  type: string;
  ttl: number; // -1: no expiry, -2: not found
  length?: number;
  memoryUsage?: number;
}

// -------------------------------------------------------------------------------------------------
// Redis Manager
// -------------------------------------------------------------------------------------------------

export class RedisManager {
  public client: RedisClient;
  public subClient: RedisClient | null = null;
  public activeUrl: string;
  public activeDb: number;
  public pubsubMessages: { channel: string; message: string; timestamp: string }[] = [];
  public subscribedChannels: Set<string> = new Set();

  constructor(url: string = "redis://127.0.0.1:6379", db: number = 0) {
    this.activeUrl = url;
    this.activeDb = db;
    this.client = new RedisClient(url);
    if (db > 0) {
      this.selectDb(db).catch(() => {});
    }
  }

  public async connect(url: string, db: number = 0): Promise<{ success: boolean; error?: string }> {
    try {
      const normalizedUrl = url.trim() || "redis://127.0.0.1:6379";
      const newClient = new RedisClient(normalizedUrl);
      // Validate connection via PING
      await newClient.ping();

      if (db > 0) {
        await newClient.select(db);
      }

      // Close previous client cleanly
      try { this.client.close(); } catch {}
      if (this.subClient) {
        try { this.subClient.close(); } catch {}
        this.subClient = null;
        this.subscribedChannels.clear();
      }

      this.client = newClient;
      this.activeUrl = normalizedUrl;
      this.activeDb = db;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async selectDb(dbIndex: number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.select(dbIndex);
      this.activeDb = dbIndex;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Telemetry & Server KPIs
  // -----------------------------------------------------------------------------------------------

  public async getKpis(): Promise<RedisKpis> {
    try {
      const infoStr = await this.client.info();
      const dbsize = await this.client.dbsize();

      const parseInfo = (str: string): Record<string, string> => {
        const result: Record<string, string> = {};
        for (const line of str.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && trimmed.includes(":")) {
            const idx = trimmed.indexOf(":");
            result[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
          }
        }
        return result;
      };

      const info = parseInfo(infoStr);

      const hits = parseInt(info.keyspace_hits || "0", 10);
      const misses = parseInt(info.keyspace_misses || "0", 10);
      const totalLookups = hits + misses;
      const hitRatio = totalLookups > 0 ? (hits / totalLookups) * 100 : 100;

      const uptimeSec = parseInt(info.uptime_in_seconds || "0", 10);
      const days = Math.floor(uptimeSec / 86400);
      const hours = Math.floor((uptimeSec % 86400) / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const uptimeFormatted = `${days}d ${hours}h ${minutes}m ${uptimeSec % 60}s`;

      return {
        connected: true,
        url: this.activeUrl,
        activeDb: this.activeDb,
        totalKeys: dbsize,
        usedMemoryHuman: info.used_memory_human || "0B",
        usedMemoryBytes: parseInt(info.used_memory || "0", 10),
        usedMemoryPeakHuman: info.used_memory_peak_human || "0B",
        memFragmentationRatio: parseFloat(info.mem_fragmentation_ratio || "1.0"),
        connectedClients: parseInt(info.connected_clients || "1", 10),
        instantaneousOpsPerSec: parseInt(info.instantaneous_ops_per_sec || "0", 10),
        totalCommandsProcessed: parseInt(info.total_commands_processed || "0", 10),
        uptimeInSeconds: uptimeSec,
        uptimeFormatted,
        keyspaceHits: hits,
        keyspaceMisses: misses,
        hitRatioPercent: Math.round(hitRatio * 10) / 10,
        redisVersion: info.redis_version || "Unknown",
        os: info.os || "Unknown",
        arch: info.arch_bits ? `${info.arch_bits}-bit` : "64-bit",
        tcpPort: parseInt(info.tcp_port || "6379", 10),
      };
    } catch (err: any) {
      return {
        connected: false,
        url: this.activeUrl,
        activeDb: this.activeDb,
        totalKeys: 0,
        usedMemoryHuman: "0B",
        usedMemoryBytes: 0,
        usedMemoryPeakHuman: "0B",
        memFragmentationRatio: 1.0,
        connectedClients: 0,
        instantaneousOpsPerSec: 0,
        totalCommandsProcessed: 0,
        uptimeInSeconds: 0,
        uptimeFormatted: "Disconnected",
        keyspaceHits: 0,
        keyspaceMisses: 0,
        hitRatioPercent: 0,
        redisVersion: "Offline",
        os: "N/A",
        arch: "N/A",
        tcpPort: 6379,
      };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Keys Explorer & Pattern Scanner
  // -----------------------------------------------------------------------------------------------

  public async scanKeys(pattern: string = "*", limit: number = 250): Promise<{
    keys: KeySummary[];
    total: number;
    namespaces: { prefix: string; count: number }[];
  }> {
    try {
      const allKeys = await this.client.keys(pattern || "*");
      const sortedKeys = allKeys.sort().slice(0, limit);

      const summaries: KeySummary[] = [];
      const namespaceMap: Record<string, number> = {};

      for (const k of sortedKeys) {
        try {
          const type = (await this.client.type(k)) || "none";
          const ttl = await this.client.ttl(k);
          
          let length = 0;
          let detectedType = type;
          if (type === "string") {
            length = await this.client.strlen(k);
            if (length >= 4) {
              try {
                const sample = await this.client.getrange(k, 0, 3);
                if (sample === "HYLL") {
                  detectedType = "hyperloglog";
                  length = await this.client.pfcount(k);
                }
              } catch {}
            }
            if (detectedType === "string" && (k.startsWith("bitmap:") || k.includes(":bitmap"))) {
              try {
                detectedType = "bitmap";
                length = await this.client.bitcount(k);
              } catch {}
            }
          }
          else if (type === "hash") length = await this.client.hlen(k);
          else if (type === "list") length = await this.client.llen(k);
          else if (type === "set") length = await this.client.scard(k);
          else if (type === "zset") length = await this.client.zcard(k);
          else if (type === "stream") length = await this.client.xlen(k);

          summaries.push({ key: k, type: detectedType, ttl, length });

          // Calculate namespace prefixes (e.g. "auth:user:123" -> "auth")
          const separatorIdx = k.indexOf(":");
          const prefix = separatorIdx > 0 ? k.slice(0, separatorIdx) : "root";
          namespaceMap[prefix] = (namespaceMap[prefix] || 0) + 1;
        } catch {
          summaries.push({ key: k, type: "unknown", ttl: -1 });
        }
      }

      const namespaces = Object.entries(namespaceMap)
        .map(([prefix, count]) => ({ prefix, count }))
        .sort((a, b) => b.count - a.count);

      return {
        keys: summaries,
        total: allKeys.length,
        namespaces,
      };
    } catch {
      return { keys: [], total: 0, namespaces: [] };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Key Inspection by Data Structure
  // -----------------------------------------------------------------------------------------------

  public async getKeyDetails(key: string): Promise<{
    key: string;
    type: string;
    ttl: number;
    value: any;
    length: number;
    isJson?: boolean;
    isHyperLogLog?: boolean;
    isBitmap?: boolean;
    error?: string;
  }> {
    try {
      const type = await this.client.type(key);
      if (!type || type === "none") {
        return { key, type: "none", ttl: -2, value: null, length: 0, error: "Key does not exist" };
      }

      const ttl = await this.client.ttl(key);
      let value: any = null;
      let length = 0;
      let isJson = false;

      switch (type) {
        case "string": {
          const raw = await this.client.get(key);
          length = raw ? raw.length : 0;

          // Check if this is a HyperLogLog (Redis magic header HYLL)
          if (raw && raw.startsWith("HYLL")) {
            const count = await this.client.pfcount(key);
            return {
              key,
              type: "hyperloglog",
              ttl,
              value: {
                cardinality: count,
                cardinalityFormatted: count.toLocaleString(),
                rawHeader: "HYLL",
                encoding: length <= 32 ? "Sparse register encoding" : "Dense register encoding (16,384 registers)",
                memoryUsageFormatted: `${(length / 1024).toFixed(2)} KB (${length} bytes)`,
                standardError: "0.81%",
              },
              length: count,
              isHyperLogLog: true,
            };
          }

          // Check if this is a Bitmap
          if (key.startsWith("bitmap:") || key.includes(":bitmap") || (raw && /[\x00-\x08\x0E-\x1F]/.test(raw))) {
            const setBits = await this.client.bitcount(key);
            const bitPositions: number[] = [];
            if (raw) {
              const buf = Buffer.from(raw, "latin1");
              for (let byteIdx = 0; byteIdx < buf.length && bitPositions.length < 100; byteIdx++) {
                const b = buf[byteIdx];
                if (b > 0) {
                  for (let bit = 0; bit < 8; bit++) {
                    if ((b & (1 << (7 - bit))) !== 0) {
                      bitPositions.push(byteIdx * 8 + bit);
                    }
                  }
                }
              }
            }
            return {
              key,
              type: "bitmap",
              ttl,
              value: {
                setBits,
                totalBits: length * 8,
                activePositions: bitPositions,
                memoryUsageFormatted: `${length} bytes`,
              },
              length: setBits,
              isBitmap: true,
            };
          }

          value = raw;
          if (raw && (raw.startsWith("{") || raw.startsWith("["))) {
            try {
              JSON.parse(raw);
              isJson = true;
            } catch {}
          }
          break;
        }
        case "hash": {
          const rawEntries = await this.client.hgetall(key);
          // Handle object or array formats from Redis
          value = rawEntries || {};
          length = Object.keys(value).length;
          break;
        }
        case "list": {
          value = await this.client.lrange(key, 0, 999);
          length = await this.client.llen(key);
          break;
        }
        case "set": {
          value = await this.client.smembers(key);
          length = await this.client.scard(key);
          break;
        }
        case "zset": {
          // Fetch members with scores using raw send command for precision
          const rawZset = await this.client.send("ZRANGE", [key, "0", "999", "WITHSCORES"]);
          const items: { member: string; score: number }[] = [];
          if (Array.isArray(rawZset)) {
            if (rawZset.length > 0 && Array.isArray(rawZset[0])) {
              // Bun native tuple format: [[member, score], ...]
              for (const entry of rawZset) {
                if (Array.isArray(entry) && entry.length >= 2) {
                  items.push({
                    member: String(entry[0]),
                    score: parseFloat(entry[1]),
                  });
                }
              }
            } else {
              // Flat array format: [member, score, member, score, ...]
              for (let i = 0; i < rawZset.length; i += 2) {
                items.push({
                  member: String(rawZset[i]),
                  score: parseFloat(rawZset[i + 1]),
                });
              }
            }
          }
          value = items;
          length = await this.client.zcard(key);
          break;
        }
        case "stream": {
          // Fetch latest 100 stream entries
          const rawStream = await this.client.xrevrange(key, "+", "-", "COUNT", "100");
          value = rawStream;
          length = await this.client.xlen(key);
          break;
        }
        default: {
          value = `[Type ${type} inspection not supported]`;
          length = 0;
          break;
        }
      }

      return { key, type, ttl, value, length, isJson };
    } catch (err: any) {
      return { key, type: "unknown", ttl: -1, value: null, length: 0, error: err?.message || String(err) };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Key Mutations & CRUD
  // -----------------------------------------------------------------------------------------------

  public async setKeyValue(payload: {
    key: string;
    type: string;
    value: any;
    ttl?: number;
    field?: string;
    score?: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { key, type, value, ttl, field, score } = payload;
      if (!key) throw new Error("Key name is required");

      switch (type) {
        case "string": {
          const strVal = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
          if (ttl && ttl > 0) {
            await this.client.setex(key, ttl, strVal);
          } else {
            await this.client.set(key, strVal);
          }
          break;
        }
        case "hash": {
          if (field) {
            const strVal = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
            await this.client.hset(key, field, strVal);
          } else if (typeof value === "object") {
            for (const [f, v] of Object.entries(value)) {
              await this.client.hset(key, f, typeof v === "object" ? JSON.stringify(v) : String(v));
            }
          }
          break;
        }
        case "list": {
          const strVal = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
          await this.client.rpush(key, strVal);
          break;
        }
        case "set": {
          const strVal = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
          await this.client.sadd(key, strVal);
          break;
        }
        case "zset": {
          const strVal = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
          const numScore = score !== undefined ? Number(score) : 0;
          await this.client.zadd(key, numScore, strVal);
          break;
        }
        case "stream": {
          if (typeof value === "object" && value !== null) {
            const args: string[] = ["*"];
            for (const [k, v] of Object.entries(value)) {
              args.push(k, String(v));
            }
            await this.client.send("XADD", [key, ...args]);
          } else {
            await this.client.xadd(key, "*", "data", String(value ?? ""));
          }
          break;
        }
        case "hyperloglog": {
          const item = String(value ?? "").trim();
          if (item) {
            await this.client.send("PFADD", [key, item]);
          }
          break;
        }
        case "bitmap": {
          const offset = Number(field ?? 0);
          const bitVal = Number(value ? 1 : 0);
          await this.client.setbit(key, offset, bitVal);
          break;
        }
        default:
          throw new Error(`Unsupported type: ${type}`);
      }

      if (ttl !== undefined) {
        if (ttl > 0) {
          await this.client.expire(key, ttl);
        } else if (ttl === -1) {
          await this.client.persist(key);
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async deleteKey(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.del(key);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async unlinkKey(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.unlink(key);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async renameKey(oldKey: string, newKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.rename(oldKey, newKey);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async setKeyTtl(key: string, ttl: number): Promise<{ success: boolean; error?: string }> {
    try {
      if (ttl === -1) {
        await this.client.persist(key);
      } else {
        await this.client.expire(key, ttl);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async getKeyTtl(key: string): Promise<{ success: boolean; key: string; ttl: number; error?: string }> {
    try {
      const ttl = await this.client.ttl(key);
      return { success: true, key, ttl };
    } catch (err: any) {
      return { success: false, key, ttl: -2, error: err?.message || String(err) };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Interactive Raw Redis CLI Console Runner
  // -----------------------------------------------------------------------------------------------

  public async executeRawCommand(commandLine: string): Promise<{
    command: string;
    result: any;
    executionTimeMs: number;
    error?: string;
  }> {
    const trimmed = (commandLine || "").trim();
    if (!trimmed) {
      return { command: "", result: null, executionTimeMs: 0, error: "Empty command" };
    }

    const startTime = performance.now();
    try {
      // Split command string preserving quoted tokens
      const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      const cleanParts = parts.map((p) => {
        if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
          return p.slice(1, -1);
        }
        return p;
      });

      const cmd = cleanParts[0].toUpperCase();
      const args = cleanParts.slice(1);

      // Execute dynamically via Bun native client's send method
      const result = await this.client.send(cmd, args);
      const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

      return {
        command: trimmed,
        result,
        executionTimeMs,
      };
    } catch (err: any) {
      const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
      return {
        command: trimmed,
        result: null,
        executionTimeMs,
        error: err?.message || String(err),
      };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Pub/Sub Broadcast & Monitoring
  // -----------------------------------------------------------------------------------------------

  public async publishMessage(channel: string, message: string): Promise<{ receivers: number; error?: string }> {
    try {
      const receivers = await this.client.publish(channel, message);
      this.pubsubMessages.unshift({
        channel,
        message,
        timestamp: new Date().toLocaleTimeString(),
      });
      if (this.pubsubMessages.length > 200) {
        this.pubsubMessages.pop();
      }
      return { receivers };
    } catch (err: any) {
      return { receivers: 0, error: err?.message || String(err) };
    }
  }

  public async subscribeChannel(channel: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.subClient) {
        this.subClient = new RedisClient(this.activeUrl);
      }
      if (!this.subscribedChannels.has(channel)) {
        await this.subClient.subscribe(channel, (msg: string, ch: string) => {
          this.pubsubMessages.unshift({
            channel: ch,
            message: msg,
            timestamp: new Date().toLocaleTimeString(),
          });
          if (this.pubsubMessages.length > 200) {
            this.pubsubMessages.pop();
          }
        });
        this.subscribedChannels.add(channel);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Slowlog & Clients Inspector
  // -----------------------------------------------------------------------------------------------

  public async getSlowlog(limit: number = 25): Promise<any[]> {
    try {
      const raw = await this.client.send("SLOWLOG", ["GET", String(limit)]);
      if (Array.isArray(raw)) {
        return raw.map((entry: any) => {
          const micros = Number(entry[2]) || 0;
          let executionFormatted = `${micros} μs`;
          if (micros >= 1000000) {
            executionFormatted = `${(micros / 1000000).toFixed(2)} s`;
          } else if (micros >= 1000) {
            executionFormatted = `${(micros / 1000).toFixed(2)} ms`;
          }

          const date = new Date(Number(entry[1]) * 1000);
          return {
            id: entry[0],
            timestamp: date.toISOString(),
            timestampFormatted: date.toLocaleTimeString(),
            executionTimeMicroseconds: micros,
            executionFormatted,
            command: Array.isArray(entry[3]) ? entry[3].join(" ") : String(entry[3]),
            clientAddress: entry[4] || "N/A",
            clientName: entry[5] || "",
          };
        });
      }
      return [];
    } catch {
      return [];
    }
  }

  public async getClients(): Promise<string[]> {
    try {
      const raw = await this.client.client("LIST");
      return (raw || "").split("\n").filter((l: string) => l.trim().length > 0);
    } catch {
      return [];
    }
  }

  public async getParsedClients(): Promise<any[]> {
    try {
      const lines = await this.getClients();
      return lines.map((line) => {
        const tokens = line.trim().split(/\s+/);
        const map: Record<string, string> = {};
        for (const token of tokens) {
          const eqIdx = token.indexOf("=");
          if (eqIdx > 0) {
            map[token.slice(0, eqIdx)] = token.slice(eqIdx + 1);
          }
        }

        const ageSec = parseInt(map["age"] || "0", 10);
        const idleSec = parseInt(map["idle"] || "0", 10);
        const memBytes = parseInt(map["tot-mem"] || "0", 10);

        let ageFormatted = `${ageSec}s`;
        if (ageSec >= 86400) ageFormatted = `${Math.floor(ageSec / 86400)}d ${Math.floor((ageSec % 86400) / 3600)}h`;
        else if (ageSec >= 3600) ageFormatted = `${Math.floor(ageSec / 3600)}h ${Math.floor((ageSec % 3600) / 60)}m`;
        else if (ageSec >= 60) ageFormatted = `${Math.floor(ageSec / 60)}m ${ageSec % 60}s`;

        let idleFormatted = idleSec === 0 ? "Active now" : `${idleSec}s ago`;
        if (idleSec >= 60) idleFormatted = `${Math.floor(idleSec / 60)}m ${idleSec % 60}s ago`;

        let memFormatted = `${memBytes} B`;
        if (memBytes >= 1048576) memFormatted = `${(memBytes / 1048576).toFixed(1)} MB`;
        else if (memBytes >= 1024) memFormatted = `${(memBytes / 1024).toFixed(1)} KB`;

        const cmdClean = (map["cmd"] || "idle").replace(/\|/g, " ").toUpperCase();

        return {
          id: map["id"] || "N/A",
          addr: map["addr"] || "127.0.0.1",
          name: map["name"] || "anonymous",
          db: parseInt(map["db"] || "0", 10),
          cmd: cmdClean,
          ageFormatted,
          idleFormatted,
          memFormatted,
          raw: line,
        };
      });
    } catch {
      return [];
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Enterprise Sample Dataset Seeder
  // -----------------------------------------------------------------------------------------------

  public async seedEnterpriseDataset(): Promise<{ success: boolean; keysCreated: number }> {
    try {
      // 1. Strings (Auth, Configurations, JSON Sessions)
      await this.client.set(
        "auth:user:101:session",
        JSON.stringify({
          userId: "usr_9918",
          username: "alex.mercer",
          role: "Enterprise Admin",
          ip: "192.168.1.144",
          loginTime: new Date().toISOString(),
          permissions: ["all", "sudo", "billing"],
        }),
      );
      await this.client.expire("auth:user:101:session", 3600);

      await this.client.set("config:system:maintenance_mode", "false");
      await this.client.set("config:system:max_concurrency", "5000");
      await this.client.set("metrics:cache:compression_ratio", "3.42");

      // 2. Hashes (Product Catalog, Customer Profiles)
      await this.client.hset("catalog:product:SKU-9901", "name", "Quantum Pro Neural Accelerator");
      await this.client.hset("catalog:product:SKU-9901", "price", "4299.99");
      await this.client.hset("catalog:product:SKU-9901", "stock", "48");
      await this.client.hset("catalog:product:SKU-9901", "category", "Hardware");
      await this.client.hset("catalog:product:SKU-9901", "manufacturer", "Cyberdyne Corp");

      await this.client.hset("customer:corp:apple", "tier", "Platinum Enterprise");
      await this.client.hset("customer:corp:apple", "mrr", "125000");
      await this.client.hset("customer:corp:apple", "account_rep", "Sarah Connor");
      await this.client.hset("customer:corp:apple", "health_score", "98.5");

      // 3. Lists (Recent Event Logs, Message Queue)
      await this.client.del("queue:worker:tasks");
      await this.client.rpush("queue:worker:tasks", "TASK-8812: Generate monthly compliance audit");
      await this.client.rpush("queue:worker:tasks", "TASK-8813: Rebuild Vector Index partition #4");
      await this.client.rpush("queue:worker:tasks", "TASK-8814: Sync Stripe billing webhooks");
      await this.client.rpush("queue:worker:tasks", "TASK-8815: Invalidate edge CDN cache clusters");

      // 4. Sets (Unique Visitors, Feature Flags, Active Nodes)
      await this.client.del("cluster:nodes:active");
      await this.client.sadd("cluster:nodes:active", "node-us-east-1a");
      await this.client.sadd("cluster:nodes:active", "node-us-east-1b");
      await this.client.sadd("cluster:nodes:active", "node-eu-central-1");
      await this.client.sadd("cluster:nodes:active", "node-ap-southeast-1");

      await this.client.del("features:beta_testers");
      await this.client.sadd("features:beta_testers", "usr_9918");
      await this.client.sadd("features:beta_testers", "usr_7721");
      await this.client.sadd("features:beta_testers", "usr_5502");

      // 5. Sorted Sets (ZSets - Leaderboards, API Rate Limits, Priority Queues)
      await this.client.del("leaderboard:global_latency");
      await this.client.zadd("leaderboard:global_latency", 0.42, "edge-tokyo");
      await this.client.zadd("leaderboard:global_latency", 0.65, "edge-london");
      await this.client.zadd("leaderboard:global_latency", 0.88, "edge-singapore");
      await this.client.zadd("leaderboard:global_latency", 1.12, "edge-frankfurt");
      await this.client.zadd("leaderboard:global_latency", 1.84, "edge-saopaulo");

      await this.client.del("leaderboard:top_spenders");
      await this.client.zadd("leaderboard:top_spenders", 245000, "Apex Financial");
      await this.client.zadd("leaderboard:top_spenders", 188000, "Vertex AI Labs");
      await this.client.zadd("leaderboard:top_spenders", 125000, "Titan Global");

      // 6. Streams (Telemetry Event Log)
      await this.client.xadd("stream:telemetry:sensor_feed", "*", "sensorId", "SN-4091", "tempC", "42.8", "pressureBar", "1.04");
      await this.client.xadd("stream:telemetry:sensor_feed", "*", "sensorId", "SN-4092", "tempC", "43.1", "pressureBar", "1.05");
      await this.client.xadd("stream:telemetry:sensor_feed", "*", "sensorId", "SN-4093", "tempC", "44.0", "pressureBar", "1.08");

      // 7. HyperLogLog & Bitmaps (Realistic unique visitor cardinality & activity)
      await this.client.send("PFADD", [
        "analytics:unique_visitors:today",
        "usr_session_4921",
        "usr_session_8832",
        "usr_session_1092",
        "ip_192.168.1.10",
        "ip_192.168.1.11",
        "ip_10.0.0.55",
        "ip_172.16.0.4",
      ]);
      await this.client.setbit("bitmap:user_active_days:usr_101", 1, 1);
      await this.client.setbit("bitmap:user_active_days:usr_101", 3, 1);
      await this.client.setbit("bitmap:user_active_days:usr_101", 7, 1);
      await this.client.setbit("bitmap:user_active_days:usr_101", 14, 1);
      await this.client.setbit("bitmap:user_active_days:usr_101", 30, 1);

      return { success: true, keysCreated: 12 };
    } catch (err: any) {
      return { success: false, keysCreated: 0 };
    }
  }
}

// -------------------------------------------------------------------------------------------------
// HTTP Server Factory
// -------------------------------------------------------------------------------------------------

export function startRedisStudioServer(options: RedisServerOptions = {}) {
  const host = options.host || "127.0.0.1";
  const port = options.port !== undefined ? options.port : 0;
  const initialUrl = options.url || "redis://127.0.0.1:6379";
  const initialDb = options.db || 0;

  const manager = new RedisManager(initialUrl, initialDb);

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // Enable CORS for workstation flexibility
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Root Workstation UI
      if (pathname === "/" || pathname === "/index.html") {
        const html = generateRedisStudioHtml();
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      // 1. KPIs & Server Telemetry
      if (pathname === "/api/kpis") {
        const kpis = await manager.getKpis();
        return Response.json(kpis, { headers: corsHeaders });
      }

      // 2. Scan / List Keys
      if (pathname === "/api/keys") {
        const pattern = url.searchParams.get("pattern") || "*";
        const limit = parseInt(url.searchParams.get("limit") || "250", 10);
        const data = await manager.scanKeys(pattern, limit);
        return Response.json(data, { headers: corsHeaders });
      }

      // 3. Inspect Specific Key Details
      if (pathname === "/api/key/get") {
        const key = url.searchParams.get("key");
        if (!key) {
          return Response.json({ error: "Missing 'key' parameter" }, { status: 400, headers: corsHeaders });
        }
        const details = await manager.getKeyDetails(key);
        return Response.json(details, { headers: corsHeaders });
      }

      // 4. Mutate / Set Key Value
      if (pathname === "/api/key/set" && req.method === "POST") {
        try {
          const body = await req.json();
          const result = await manager.setKeyValue(body);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 5. Delete Key
      if (pathname === "/api/key/delete" && req.method === "POST") {
        try {
          const body = await req.json();
          const key = body.key;
          if (!key) return Response.json({ error: "Key required" }, { status: 400, headers: corsHeaders });
          const result = await manager.deleteKey(key);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 6. Rename Key
      if (pathname === "/api/key/rename" && req.method === "POST") {
        try {
          const body = await req.json();
          const { oldKey, newKey } = body;
          if (!oldKey || !newKey) {
            return Response.json({ error: "oldKey and newKey required" }, { status: 400, headers: corsHeaders });
          }
          const result = await manager.renameKey(oldKey, newKey);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 7. Adjust / Query TTL
      if (pathname === "/api/key/ttl" && req.method === "GET") {
        try {
          const key = url.searchParams.get("key");
          if (!key) {
            return Response.json({ error: "key required" }, { status: 400, headers: corsHeaders });
          }
          const result = await manager.getKeyTtl(key);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (pathname === "/api/key/ttl" && req.method === "POST") {
        try {
          const body = await req.json();
          const { key, ttl } = body;
          if (!key || ttl === undefined) {
            return Response.json({ error: "key and ttl required" }, { status: 400, headers: corsHeaders });
          }
          const result = await manager.setKeyTtl(key, Number(ttl));
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 8. Raw Command CLI Runner
      if (pathname === "/api/cli" && req.method === "POST") {
        try {
          const body = await req.json();
          const result = await manager.executeRawCommand(body.command || "");
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 9. Pub/Sub Management
      if (pathname === "/api/pubsub/publish" && req.method === "POST") {
        try {
          const body = await req.json();
          const { channel, message } = body;
          const result = await manager.publishMessage(channel || "general", message || "");
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (pathname === "/api/pubsub/subscribe" && req.method === "POST") {
        try {
          const body = await req.json();
          const { channel } = body;
          const result = await manager.subscribeChannel(channel || "general");
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (pathname === "/api/pubsub/messages") {
        return Response.json({
          messages: manager.pubsubMessages,
          channels: Array.from(manager.subscribedChannels),
        }, { headers: corsHeaders });
      }

      // 10. Server Info Sections
      if (pathname === "/api/info") {
        try {
          const section = url.searchParams.get("section") || "";
          const rawInfo = section ? await manager.client.info(section) : await manager.client.info();
          return Response.json({ section: section || "all", info: rawInfo }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 11. Slowlog
      if (pathname === "/api/slowlog") {
        const slowlog = await manager.getSlowlog(25);
        return Response.json({ slowlog }, { headers: corsHeaders });
      }

      // 12. Client Registry
      if (pathname === "/api/clients") {
        const clients = await manager.getClients();
        const parsedClients = await manager.getParsedClients();
        return Response.json({ clients, parsedClients }, { headers: corsHeaders });
      }

      // 13. Dynamic Connection & DB Switcher
      if (pathname === "/api/connect" && req.method === "POST") {
        try {
          const body = await req.json();
          const { url: newUrl, db: newDb } = body;
          const result = await manager.connect(newUrl, newDb ?? 0);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      if (pathname === "/api/select-db" && req.method === "POST") {
        try {
          const body = await req.json();
          const { db: newDb } = body;
          const result = await manager.selectDb(Number(newDb ?? 0));
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 14. Seed Sample Dataset
      if (pathname === "/api/seed" && req.method === "POST") {
        const result = await manager.seedEnterpriseDataset();
        return Response.json(result, { headers: corsHeaders });
      }

      // 15. Flush Active Database (Cautionary operation)
      if (pathname === "/api/flushdb" && req.method === "POST") {
        try {
          await manager.client.flushdb();
          return Response.json({ success: true, message: `Database ${manager.activeDb} flushed` }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 16. Shutdown / Close workstation
      if ((pathname === "/api/shutdown" || pathname === "/api/close") && (req.method === "POST" || req.method === "GET")) {
        setTimeout(() => process.exit(0), 100);
        return Response.json({ success: true, message: "Workstation shutting down..." }, { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return {
    server,
    manager,
    port: server.port,
    url: `http://${host}:${server.port}`,
    close: () => {
      try { server.stop(); } catch {}
      try { manager.client.close(); } catch {}
      if (manager.subClient) {
        try { manager.subClient.close(); } catch {}
      }
    },
  };
}

// -------------------------------------------------------------------------------------------------
// Worker Sub-Process Auto-Bootstrap Mode
// -------------------------------------------------------------------------------------------------

if (!Bun.isMainThread && (!process.env.STUDIO_WORKER || process.env.STUDIO_WORKER === "redis_studio")) {
  const preferredPort = 0; // Dynamic ephemeral port prevents any collisions
  const initialUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const initialDb = process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0;
  const serverInstance = startRedisStudioServer({ port: preferredPort, url: initialUrl, db: initialDb });

  (globalThis as any).postMessage({
    ready: true,
    type: "redis_studio",
    port: serverInstance.port,
    url: serverInstance.url,
  });
}

// -------------------------------------------------------------------------------------------------
// Standalone CLI Web Server Mode
// -------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const preferredPort = Number(process.env.PORT) || 5820;
  const serverInstance = startRedisStudioServer({ port: preferredPort, host: "0.0.0.0" });
  console.log(`⚡ Redis Studio Pro Telemetry Server active at: ${serverInstance.url}`);
}
