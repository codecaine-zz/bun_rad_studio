import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startRedisStudioServer } from "../applications/redis_studio_server.ts";
import { generateRedisStudioHtml } from "../applications/redis_studio.ts";
import {
  isDangerousCommand,
  normalizeDeletePattern,
  validateExportDoc,
  exportFileName,
} from "../src/redis_helpers";

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

describe("Redis Studio productivity API (live Redis, DB 14)", () => {
  let srv: any;
  let base: string;
  const post = (p: string, body: any): Promise<any> =>
    fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<any>);

  beforeAll(async () => {
    srv = startRedisStudioServer({ port: 5833, url: "redis://127.0.0.1:6379", db: 14 });
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
});
