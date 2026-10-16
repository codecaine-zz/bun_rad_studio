/**
 * Finds a Redis server running on this computer at its usual address (127.0.0.1:6379, what a Homebrew install
 * gives you), so the Databases tool can offer it without anyone typing the host and port.
 *
 * It sends one PING to the standard Redis port and nothing else: no key is read and no password is tried.
 * Set BUN_RAD_FM_LOCAL_REDIS=off to turn the check off.
 */
import { createConnection } from "net";
import { connectionFingerprint } from "./fmDbModel";
import type { EnvConnection } from "./fmDbDetect";

export const LOCAL_REDIS_HOST = "127.0.0.1";
export const LOCAL_REDIS_PORT = 6379;

export type LocalRedisState = "open" | "password" | "none";

/** "open": answered PING. "password": it is Redis but wants a password first. "none": nothing (usable) there. */
export function probeLocalRedis(host = LOCAL_REDIS_HOST, port = LOCAL_REDIS_PORT, timeoutMs = 600): Promise<LocalRedisState> {
  if (process.env.BUN_RAD_FM_LOCAL_REDIS === "off") return Promise.resolve("none");
  return new Promise((resolve) => {
    let done = false;
    const socket = createConnection({ host, port });
    const finish = (state: LocalRedisState) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(state);
    };
    socket.setTimeout(timeoutMs, () => finish("none"));
    socket.once("error", () => finish("none"));
    socket.once("connect", () => socket.write("PING\r\n"));
    socket.once("data", (buf) => {
      const reply = buf.toString("latin1", 0, 32);
      if (reply.startsWith("+PONG")) finish("open");
      else if (reply.startsWith("-NOAUTH") || reply.startsWith("-DENIED") || reply.startsWith("-ERR operation not permitted")) finish("password");
      else finish("none");
    });
  });
}

/** The connection card for the local server: host and port only, never a password. */
export function localRedisConnection(state: LocalRedisState): EnvConnection {
  const prov = { kind: "local" as const, variable: "" };
  const fingerprint = connectionFingerprint("redis", { host: LOCAL_REDIS_HOST, port: LOCAL_REDIS_PORT, dbIndex: 0 });
  return {
    engine: "redis",
    fields: {
      host: { value: LOCAL_REDIS_HOST, name: "local server", prov },
      port: { value: LOCAL_REDIS_PORT, name: "local server", prov },
    },
    variables: [],
    files: [],
    ignored: [],
    warnings: state === "password" ? ["This server wants a password. Save it, then use Edit to add the password."] : [],
    ambiguous: false,
    fingerprint,
    slot: "redis:local-default",
    suggestedName: "Local server (127.0.0.1:6379)",
  };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** True when a saved Redis connection already points at the usual local server (so nothing is added twice). */
export function isLocalDefaultRedis(p: { engine: string; host?: string; port?: number; dbIndex?: number; user?: string }): boolean {
  return p.engine === "redis" && LOCAL_HOSTS.has(String(p.host ?? "localhost").toLowerCase()) && Number(p.port ?? LOCAL_REDIS_PORT) === LOCAL_REDIS_PORT && !p.user;
}
