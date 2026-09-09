/**
 * ⚡ Bun RAD Studio - Redis Studio Pro Specification & Verification Suite
 * 
 * Tests the complete native Redis Studio Pro engine, background telemetry server,
 * data structure operations, CLI command runner, Pub/Sub system, and workstation HTML.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startRedisStudioServer, RedisManager } from "../applications/redis_studio_server.ts";
import { generateRedisStudioHtml, createRedisStudio } from "../applications/redis_studio.ts";

describe("⚡ Redis Studio Pro Enterprise Engine Suite", () => {
  let serverInstance: any;
  let baseUrl: string;
  const TEST_PORT = 5821;

  beforeAll(async () => {
    serverInstance = startRedisStudioServer({
      port: TEST_PORT,
      url: "redis://127.0.0.1:6379",
      db: 15, // Use test database 15
    });
    baseUrl = serverInstance.url;
  });

  afterAll(() => {
    if (serverInstance) {
      serverInstance.close();
    }
  });

  it("1. Background server starts and serves workstation HTML with contextmenu suppression", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Redis Studio Pro");
    expect(html).toContain('oncontextmenu="return false;"');
    expect(html).toContain("Bun Native Engine");
    expect(html).toContain("Interactive CLI Console");
    expect(html).toContain("tickTtls");
    expect(html).toContain("syncActiveTtl");
    expect(html).toContain("doCloseOrQuit");
    expect(html).toContain("doToggleFullscreen");
  });

  it("2. Telemetry and KPIs endpoint reports real-time metrics", async () => {
    const res = await fetch(`${baseUrl}/api/kpis`);
    expect(res.status).toBe(200);
    const kpis = await res.json();
    expect(kpis.connected).toBe(true);
    expect(typeof kpis.totalKeys).toBe("number");
    expect(typeof kpis.usedMemoryHuman).toBe("string");
    expect(typeof kpis.uptimeFormatted).toBe("string");
    expect(typeof kpis.redisVersion).toBe("string");
  });

  it("3. Enterprise Sample Dataset seeder populates rich multi-type keys", async () => {
    const res = await fetch(`${baseUrl}/api/seed`, { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.keysCreated).toBeGreaterThan(0);
  });

  it("4. Key scanner reflects seeded keys and calculates namespace hierarchies", async () => {
    const res = await fetch(`${baseUrl}/api/keys?pattern=*`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.keys)).toBe(true);
    expect(data.total).toBeGreaterThan(0);

    const types = data.keys.map((k: any) => k.type);
    expect(types).toContain("string");
    expect(types).toContain("hash");
    expect(types).toContain("list");
    expect(types).toContain("set");
    expect(types).toContain("zset");
  });

  it("5. Key detail inspection inspects string, hash, list, set, and sorted set types", async () => {
    // String
    const strRes = await fetch(`${baseUrl}/api/key/get?key=config:system:max_concurrency`);
    const strData = await strRes.json();
    expect(strData.type).toBe("string");
    expect(strData.value).toBe("5000");

    // Hash
    const hashRes = await fetch(`${baseUrl}/api/key/get?key=catalog:product:SKU-9901`);
    const hashData = await hashRes.json();
    expect(hashData.type).toBe("hash");
    expect(hashData.value.name).toBe("Quantum Pro Neural Accelerator");
    expect(hashData.value.category).toBe("Hardware");

    // List
    const listRes = await fetch(`${baseUrl}/api/key/get?key=queue:worker:tasks`);
    const listData = await listRes.json();
    expect(listData.type).toBe("list");
    expect(Array.isArray(listData.value)).toBe(true);
    expect(listData.length).toBeGreaterThan(0);

    // Set
    const setRes = await fetch(`${baseUrl}/api/key/get?key=cluster:nodes:active`);
    const setData = await setRes.json();
    expect(setData.type).toBe("set");
    expect(Array.isArray(setData.value)).toBe(true);
    expect(setData.length).toBeGreaterThan(0);

    // ZSet
    const zsetRes = await fetch(`${baseUrl}/api/key/get?key=leaderboard:global_latency`);
    const zsetData = await zsetRes.json();
    expect(zsetData.type).toBe("zset");
    expect(Array.isArray(zsetData.value)).toBe(true);
    expect(zsetData.value.some((it: any) => it.member === "edge-tokyo")).toBe(true);

    // HyperLogLog (Clean Cardinality Counter inspection without binary text)
    const hllRes = await fetch(`${baseUrl}/api/key/get?key=analytics:unique_visitors:today`);
    const hllData = await hllRes.json();
    expect(hllData.type).toBe("hyperloglog");
    expect(hllData.isHyperLogLog).toBe(true);
    expect(hllData.value.cardinality).toBeGreaterThan(0);
    expect(hllData.value.rawHeader).toBe("HYLL");

    // Bitmap (Bit array offset inspection)
    const bitRes = await fetch(`${baseUrl}/api/key/get?key=bitmap:user_active_days:usr_101`);
    const bitData = await bitRes.json();
    expect(bitData.type).toBe("bitmap");
    expect(bitData.isBitmap).toBe(true);
    expect(bitData.value.setBits).toBeGreaterThan(0);
    expect(Array.isArray(bitData.value.activePositions)).toBe(true);
  });

  it("6. Key CRUD mutations support creating, updating, and expiring keys", async () => {
    const testKey = "test:unit_runner:flag";

    // Set
    const setRes = await fetch(`${baseUrl}/api/key/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: testKey, type: "string", value: "active", ttl: 300 }),
    });
    const setData = await setRes.json();
    expect(setData.success).toBe(true);

    // Verify TTL
    const getRes = await fetch(`${baseUrl}/api/key/get?key=${testKey}`);
    const getData = await getRes.json();
    expect(getData.value).toBe("active");
    expect(getData.ttl).toBeGreaterThan(0);

    // Update TTL
    const ttlRes = await fetch(`${baseUrl}/api/key/ttl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: testKey, ttl: 600 }),
    });
    const ttlData = await ttlRes.json();
    expect(ttlData.success).toBe(true);

    // Query ground-truth TTL via GET /api/key/ttl
    const getTtlRes = await fetch(`${baseUrl}/api/key/ttl?key=${testKey}`);
    const getTtlData = await getTtlRes.json();
    expect(getTtlData.success).toBe(true);
    expect(getTtlData.ttl).toBeGreaterThan(0);
    expect(getTtlData.ttl).toBeLessThanOrEqual(600);

    // Rename
    const renameRes = await fetch(`${baseUrl}/api/key/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldKey: testKey, newKey: `${testKey}_renamed` }),
    });
    const renameData = await renameRes.json();
    expect(renameData.success).toBe(true);

    // Delete
    const delRes = await fetch(`${baseUrl}/api/key/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `${testKey}_renamed` }),
    });
    const delData = await delRes.json();
    expect(delData.success).toBe(true);
  });

  it("7. Interactive CLI Runner executes native Redis commands via Bun send API", async () => {
    const cliRes = await fetch(`${baseUrl}/api/cli`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "PING" }),
    });
    const cliData = await cliRes.json();
    expect(cliData.result).toBe("PONG");
    expect(typeof cliData.executionTimeMs).toBe("number");

    // Test DBSIZE
    const dbsizeRes = await fetch(`${baseUrl}/api/cli`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "DBSIZE" }),
    });
    const dbsizeData = await dbsizeRes.json();
    expect(typeof dbsizeData.result).toBe("number");
  });

  it("8. Pub/Sub engine supports broadcasting and receiving messages", async () => {
    // Subscribe
    const subRes = await fetch(`${baseUrl}/api/pubsub/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "alerts_test" }),
    });
    const subData = await subRes.json();
    expect(subData.success).toBe(true);

    // Publish
    const pubRes = await fetch(`${baseUrl}/api/pubsub/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "alerts_test", message: "CRITICAL: Server CPU spike" }),
    });
    const pubData = await pubRes.json();
    expect(typeof pubData.receivers).toBe("number");

    // Fetch messages log
    const msgsRes = await fetch(`${baseUrl}/api/pubsub/messages`);
    const msgsData = await msgsRes.json();
    expect(Array.isArray(msgsData.messages)).toBe(true);
    expect(msgsData.messages.some((m: any) => m.channel === "alerts_test")).toBe(true);
  });

  it("9. Server info and slowlog inspection endpoints respond correctly", async () => {
    const infoRes = await fetch(`${baseUrl}/api/info?section=server`);
    expect(infoRes.status).toBe(200);
    const infoData = await infoRes.json();
    expect(infoData.info).toContain("redis_version");

    const slowlogRes = await fetch(`${baseUrl}/api/slowlog`);
    expect(slowlogRes.status).toBe(200);
    const slowlogData = await slowlogRes.json();
    expect(Array.isArray(slowlogData.slowlog)).toBe(true);
  });

  it("10. Workstation Factory creates desktop instance with default fullscreen", () => {
    const app = createRedisStudio({ fullscreen: true });
    expect(app.fullscreen).toBe(true);
    expect(app.title).toContain("Redis Studio Pro");
    expect(typeof app.generateHtml).toBe("function");
    const html = app.generateHtml();
    expect(html).toContain("Redis Studio Pro");
  });
});
