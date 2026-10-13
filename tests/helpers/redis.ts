/**
 * Opt-in access to a disposable Redis server for integration tests.
 *
 * Several Redis tests seed data and run FLUSHDB on databases 14 and 15, so they must never run against a Redis
 * server you use for real work. They run only when you name a throwaway server:
 *
 *   TEST_REDIS_URL=redis://127.0.0.1:6379
 *
 * Without the variable, or when the server does not answer PING within a second, `describeRedis` skips the suite.
 */
import { describe } from "bun:test";
import { RedisClient } from "bun";

export const TEST_REDIS_URL: string | undefined = process.env.TEST_REDIS_URL || undefined;

async function reachable(url: string): Promise<boolean> {
  const client = new RedisClient(url);
  try {
    await Promise.race([client.ping(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1000))]);
    return true;
  } catch {
    return false;
  } finally {
    try {
      client.close();
    } catch {}
  }
}

export const redisAvailable: boolean = TEST_REDIS_URL ? await reachable(TEST_REDIS_URL) : false;

/** `describe` when a disposable Redis is configured and reachable, otherwise `describe.skip`. */
export const describeRedis = redisAvailable ? describe : describe.skip;
