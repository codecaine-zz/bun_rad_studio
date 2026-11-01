import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { describeRedis, TEST_REDIS_URL } from "./helpers/redis";
import { startRedisStudioServer, RedisManager } from "../applications/redis_studio_server.ts";
import { generateRedisStudioHtml } from "../applications/redis_studio.ts";
import {
  isDangerousCommand,
  normalizeDeletePattern,
  validateExportDoc,
  exportFileName,
} from "../src/redis_helpers";

describe("RedisManager.setKeyValue Hash & ZSet key creation (offline unit tests)", () => {
  const makeMockManager = () => {
    const hsetCalls: Array<[string, string, string]> = [];
    const expireCalls: Array<[string, number]> = [];
    const zaddCalls: Array<[string, number, string]> = [];
    const mgr = Object.create(RedisManager.prototype) as RedisManager;
    (mgr as any).client = {
      hset: async (k: string, f: string, v: string) => {
        hsetCalls.push([k, f, v]);
        return 1;
      },
      expire: async (k: string, ttl: number) => {
        expireCalls.push([k, ttl]);
        return 1;
      },
      zadd: async (k: string, score: number, val: string) => {
        zaddCalls.push([k, score, val]);
        return 1;
      },
    };
    return { mgr, hsetCalls, expireCalls, zaddCalls };
  };

  it("creates a Hash key from explicit field + value, JSON object string, field:value lines, or single string fallback", async () => {
    const m1 = makeMockManager();
    expect((await m1.mgr.setKeyValue({ key: "user:1", type: "hash", field: "name", value: "Alice", ttl: 60 })).success).toBe(true);
    expect(m1.hsetCalls).toEqual([["user:1", "name", "Alice"]]);
    expect(m1.expireCalls).toEqual([["user:1", 60]]);

    const m2 = makeMockManager();
    expect((await m2.mgr.setKeyValue({ key: "user:2", type: "hash", value: '{"role":"admin","tier":"pro"}' })).success).toBe(true);
    expect(m2.hsetCalls).toEqual([
      ["user:2", "role", "admin"],
      ["user:2", "tier", "pro"],
    ]);

    const m3 = makeMockManager();
    expect((await m3.mgr.setKeyValue({ key: "user:3", type: "hash", value: "host:127.0.0.1\nport=6379" })).success).toBe(true);
    expect(m3.hsetCalls).toEqual([
      ["user:3", "host", "127.0.0.1"],
      ["user:3", "port", "6379"],
    ]);

    const m4 = makeMockManager();
    expect((await m4.mgr.setKeyValue({ key: "user:4", type: "hash", value: "just_a_value" })).success).toBe(true);
    expect(m4.hsetCalls).toEqual([["user:4", "field1", "just_a_value"]]);

    const m5 = makeMockManager();
    expect((await m5.mgr.setKeyValue({ key: "user:5", type: "hash", value: "" })).success).toBe(true);
    expect(m5.hsetCalls).toEqual([["user:5", "field1", ""]]);

    const m6 = makeMockManager();
    expect((await m6.mgr.setKeyValue({ key: "lb:1", type: "zset", score: 42.5, value: "player1" })).success).toBe(true);
    expect(m6.zaddCalls).toEqual([["lb:1", 42.5, "player1"]]);
  });

  it("renders #newKeyField, #newKeyScore, and onNewKeyTypeChange in the Create New Redis Key modal", () => {
    const html = generateRedisStudioHtml();
    expect(html).toContain('id="newKeyField"');
    expect(html).toContain('id="newKeyScore"');
    expect(html).toContain("function onNewKeyTypeChange()");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
  });

  it("disables autocorrect, autocapitalize, spellcheck, and autocomplete on body and all Redis database text/number inputs and textareas", () => {
    const html = generateRedisStudioHtml();
    expect(html).toContain('<body spellcheck="false" autocorrect="off" autocapitalize="off" oncontextmenu="return false;">');
    expect(html).toContain("function disableInputAutoCorrect(el)");
    expect(html).toContain("disableInputAutoCorrect(input)");

    const tags = [...html.matchAll(/<(?:input|textarea)\b[^>]*>/g)].map((m) => m[0]!);
    expect(tags.length).toBeGreaterThanOrEqual(20);
    for (const tag of tags) {
      if (/type=["'](?:file|checkbox)["']/.test(tag)) continue;
      expect(tag).toContain('spellcheck="false"');
      expect(tag).toContain('autocomplete="off"');
      expect(tag).toContain('autocorrect="off"');
      expect(tag).toContain('autocapitalize="off"');
    }
  });
});

describe("redis_helpers", () => {
  it("flags dangerous commands", () => {
    for (const c of ["FLUSHALL", "flushdb", "  shutdown nosave", "CONFIG SET maxmemory 1", "debug sleep 1"]) {
      expect(isDangerousCommand(c)).toBe(true);
    }
    for (const c of ["GET a", "CONFIG GET maxmemory", "KEYS *", ""]) expect(isDangerousCommand(c)).toBe(false);
  });

  it("normalizes delete patterns", () => {
    expect(normalizeDeletePattern("").ok).toBe(false);
    expect(normalizeDeletePattern("  ").ok).toBe(false);
    expect(normalizeDeletePattern("sess:*")).toMatchObject({ ok: true, matchesAll: false });
    expect(normalizeDeletePattern("*").matchesAll).toBe(true);
  });

  it("validates export documents", () => {
    const good = { format: "redis-studio-export", version: 1, keys: [{ key: "a", type: "string", ttl: -1, value: "x" }] };
    expect(validateExportDoc(good).ok).toBe(true);
    expect(validateExportDoc(JSON.stringify(good)).ok).toBe(true);
    expect(validateExportDoc("{bad").ok).toBe(false);
    expect(validateExportDoc({ keys: [] }).ok).toBe(false);
    const bad = validateExportDoc({ ...good, keys: [{ key: "h", type: "hash", value: [1] }, { key: "s", type: "stream", value: "x" }] });
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBe(2);
  });

  it("builds export file names", () => {
    expect(exportFileName(3, new Date(2026, 0, 2, 3, 4, 5))).toBe("redis_export_db3_20260102_030405.json");
  });
});

describeRedis("Redis Studio productivity API (live Redis, DB 14)", () => {
  let srv: any;
  let base: string;
  const post = (p: string, body: any): Promise<any> =>
    fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<any>);

  beforeAll(async () => {
    srv = startRedisStudioServer({ port: 5833, url: TEST_REDIS_URL, db: 14 });
    base = srv.url;
    await post("/api/cli", { command: "FLUSHDB" });
  });
  afterAll(async () => {
    await post("/api/cli", { command: "FLUSHDB" });
    srv?.close();
  });

  it("round-trips export → flush → import for every supported type", async () => {
    await post("/api/cli", { command: "SET tt:str hello" });
    await post("/api/cli", { command: "HSET tt:hash a 1 b 2" });
    await post("/api/cli", { command: "RPUSH tt:list x y z" });
    await post("/api/cli", { command: "SADD tt:set m n" });
    await post("/api/cli", { command: "ZADD tt:z 1.5 one 2 two" });
    await post("/api/cli", { command: "SET tt:ttl keep EX 500" });

    const doc: any = await fetch(base + "/api/export?pattern=" + encodeURIComponent("tt:*")).then((r) => r.json());
    expect(doc.format).toBe("redis-studio-export");
    expect(doc.keys.length).toBe(6);

    expect((await post("/api/keys/delete-pattern", { pattern: "tt:*" })).deleted).toBe(6);
    expect((await post("/api/cli", { command: "EXISTS tt:str" })).result).toBe(0);

    const imp = await post("/api/import", { doc });
    expect(imp.success).toBe(true);
    expect(imp.imported).toBe(6);

    expect((await post("/api/cli", { command: "GET tt:str" })).result).toBe("hello");
    expect((await post("/api/cli", { command: "LLEN tt:list" })).result).toBe(3);
    expect((await post("/api/cli", { command: "SCARD tt:set" })).result).toBe(2);
    expect(Number((await post("/api/cli", { command: "ZSCORE tt:z one" })).result)).toBe(1.5);
    const ttl = (await post("/api/cli", { command: "TTL tt:ttl" })).result;
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(500);

    // existing keys are skipped without overwrite
    const again = await post("/api/import", { doc });
    expect(again.imported).toBe(0);
    expect(again.skipped).toBe(6);
    expect((await post("/api/import", { doc, overwrite: true })).imported).toBe(6);
  });

  it("rejects empty delete patterns and invalid imports", async () => {
    const r = await post("/api/keys/delete-pattern", { pattern: "" });
    expect(r.success).toBe(false);
    const bad = await post("/api/import", { text: "not json" });
    expect(bad.success).toBe(false);
    expect(bad.errors[0]).toContain("Invalid JSON");
  });

  it("duplicates keys without overwriting", async () => {
    await post("/api/cli", { command: "SET dup:a v1" });
    expect((await post("/api/key/duplicate", { key: "dup:a", newKey: "dup:b" })).success).toBe(true);
    expect((await post("/api/cli", { command: "GET dup:b" })).result).toBe("v1");
    const again = await post("/api/key/duplicate", { key: "dup:a", newKey: "dup:b" });
    expect(again.success).toBe(false);
    expect(again.error).toContain("already exists");
    expect((await post("/api/key/duplicate", { key: "nope", newKey: "dup:c" })).success).toBe(false);
  });

  it("serves the new UI controls and valid client JS", async () => {
    const html = generateRedisStudioHtml();
    for (const id of ["keySort", "autoRefresh", "keyCountLabel", "importModal", "importText", "importOverwrite"]) {
      expect(html).toContain(`id="${id}"`);
    }
    for (const fn of ["exportKeys", "deleteMatchingKeys", "flushCurrentDb", "duplicateCurrentKey", "copyKeyName", "uiAsk", "submitImport"]) {
      expect(html).toContain(`function ${fn}(`);
    }
    // every inline <script> must parse
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
  });

  it("defines every handler the key editor buttons call", () => {
    const html = generateRedisStudioHtml();
    for (const fn of ["addHashField", "deleteHashField", "pushListItem", "removeListItem", "addSetMember", "removeSetMember", "addZsetMember", "removeZsetMember", "saveKeyChanges"]) {
      expect(html).toContain(`function ${fn}(`);
    }
  });

  it("edits and removes elements of hash, list, set and zset keys", async () => {
    await post("/api/cli", { command: "HSET el:h a 1 b 2" });
    await post("/api/cli", { command: "RPUSH el:l x y z" });
    await post("/api/cli", { command: "SADD el:s m n" });
    await post("/api/cli", { command: "ZADD el:z 1 one 2 two" });
    const el = (body: any) => post("/api/key/element", body);
    const cli = async (command: string) => (await post("/api/cli", { command })).result;

    expect((await el({ key: "el:h", type: "hash", op: "update", field: "a", value: "9" })).success).toBe(true);
    expect(await cli("HGET el:h a")).toBe("9");
    expect((await el({ key: "el:h", type: "hash", op: "remove", field: "b" })).success).toBe(true);
    expect(await cli("HEXISTS el:h b")).toBe(0);

    expect((await el({ key: "el:l", type: "list", op: "update", index: 0, value: "X" })).success).toBe(true);
    expect((await el({ key: "el:l", type: "list", op: "remove", index: 1 })).success).toBe(true);
    expect(await cli("LRANGE el:l 0 -1")).toEqual(["X", "z"]);

    expect((await el({ key: "el:s", type: "set", op: "update", oldMember: "m", value: "M" })).success).toBe(true);
    expect((await el({ key: "el:s", type: "set", op: "remove", oldMember: "n" })).success).toBe(true);
    expect(await cli("SMEMBERS el:s")).toEqual(["M"]);

    expect((await el({ key: "el:z", type: "zset", op: "update", oldMember: "one", value: "ONE", score: 5 })).success).toBe(true);
    expect((await el({ key: "el:z", type: "zset", op: "remove", oldMember: "two" })).success).toBe(true);
    expect(await cli("ZSCORE el:z ONE")).toBe(5);
    expect(await cli("ZCARD el:z")).toBe(1);

    expect((await el({ key: "el:l", type: "list", op: "update", index: 99, value: "q" })).success).toBe(false);
    expect((await el({ key: "el:z", type: "zset", op: "update", oldMember: "ONE", score: "abc" })).success).toBe(false);
    expect((await el({ key: "el:h", type: "stream", op: "remove" })).success).toBe(false);
  });
});
