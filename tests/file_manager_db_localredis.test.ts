import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createServer, type Server } from "net";
import { dbComputer, type DbComputer } from "./helpers/db_fm";
import { isLocalDefaultRedis, localRedisConnection, probeLocalRedis } from "../src/features/filemanager/fmDbLocal";

const computers: DbComputer[] = [];
const computer = (o: Parameters<typeof dbComputer>[0] = {}) => {
  const c = dbComputer(o);
  computers.push(c);
  return c;
};
afterAll(() => computers.forEach((c) => c.remove()));

function fakeRedis(reply: string): Promise<{ port: number; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer((s) => s.on("data", () => s.end(reply)));
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as any).port, server }));
  });
}

// Needs a Redis on the real default port; skipped when there is none (CI).
const OFF = "BUN_RAD_FM_LOCAL_REDIS";
let before: string | undefined;
// Other test files switch the check off for themselves; these tests need it on and put it back afterwards.
const enable = () => { before = process.env[OFF]; delete process.env[OFF]; };
const restore = () => { if (before === undefined) delete process.env[OFF]; else process.env[OFF] = before; };
enable();
const live = (await probeLocalRedis()) === "open";
restore();

describe("the Redis server on this computer's usual address", () => {
  beforeEach(enable);
  afterEach(restore);

  test("a server that answers PING is 'open', one that wants a password is 'password', anything else is 'none'", async () => {
    const open = await fakeRedis("+PONG\r\n");
    const locked = await fakeRedis("-NOAUTH Authentication required.\r\n");
    const other = await fakeRedis("HTTP/1.1 400 Bad Request\r\n\r\n");
    try {
      expect(await probeLocalRedis("127.0.0.1", open.port)).toBe("open");
      expect(await probeLocalRedis("127.0.0.1", locked.port)).toBe("password");
      expect(await probeLocalRedis("127.0.0.1", other.port)).toBe("none");
      const closed = await fakeRedis("");
      const port = closed.port;
      await new Promise((r) => closed.server.close(r));
      expect(await probeLocalRedis("127.0.0.1", port)).toBe("none");
      process.env.BUN_RAD_FM_LOCAL_REDIS = "off";
      expect(await probeLocalRedis("127.0.0.1", open.port)).toBe("none");
    } finally {
      open.server.close();
      locked.server.close();
      other.server.close();
    }
  });

  test("the card has a host and a port, never a password, and a saved local connection is recognised", () => {
    const c = localRedisConnection("open");
    expect(c.fields.host?.value).toBe("127.0.0.1");
    expect(c.fields.port?.value).toBe(6379);
    expect(c.password).toBeUndefined();
    expect(c.warnings).toEqual([]);
    expect(localRedisConnection("password").warnings.length).toBe(1);
    expect(isLocalDefaultRedis({ engine: "redis", host: "localhost", port: 6379 })).toBe(true);
    expect(isLocalDefaultRedis({ engine: "redis", host: "127.0.0.1" })).toBe(true);
    expect(isLocalDefaultRedis({ engine: "redis", host: "cache.example", port: 6379 })).toBe(false);
    expect(isLocalDefaultRedis({ engine: "redis", host: "localhost", port: 6380 })).toBe(false);
    expect(isLocalDefaultRedis({ engine: "mysql", host: "localhost", port: 6379 })).toBe(false);
  });

  (live ? test : test.skip)("a running local Redis is saved once, without a click, and is not added again after it is deleted", async () => {
    const c = computer();
    const first = await c.ok("db/detect", { quiet: true });
    expect(first.autoSaved).toEqual([expect.objectContaining({ engine: "redis", local: true })]);
    const overview = await c.ok("db/overview");
    const redis = overview.profiles.filter((p: any) => p.engine === "redis");
    expect(redis).toHaveLength(1);
    expect(redis[0]).toMatchObject({ host: "127.0.0.1", port: 6379, hasPassword: false, meta: { source: "local" } });

    const again = await c.ok("db/detect", { quiet: true });
    expect(again.autoSaved).toEqual([]);

    await c.ok("db/profile/delete", { id: redis[0].id, confirm: true });
    const afterDelete = await c.ok("db/detect", { quiet: true });
    expect(afterDelete.autoSaved).toEqual([]);
    const manual = await c.ok("db/detect", { manual: true });
    expect(manual.cards.find((x: any) => x.engine === "redis")?.status).toBe("dismissed");
  });

  (live ? test : test.skip)("a Redis set up in the environment is used instead of probing", async () => {
    const c = computer({ env: { REDIS_HOST: "cache.example" } });
    const res = await c.ok("db/detect", { manual: true });
    const redis = res.cards.filter((x: any) => x.engine === "redis");
    expect(redis).toHaveLength(1);
    expect(redis[0].fields.host.value).toBe("cache.example");
  });
});
