/**
 * "Test connection": one explicit attempt to connect, within 10 seconds, that only reads (it never changes anything)
 * and answers in plain words. The password is only handed to the database driver; it is never part of an answer.
 */
import { promises as fsp } from "fs";
import { dirname } from "path";
import { RedisClient } from "bun";
import { createConnection } from "net";
import { createAdapter } from "../../db";
import { DbError, normalizeError, redact, type DbErrorCode } from "../../db/errors";
import type { DbEngine } from "./fmDbModel";

export const TEST_TIMEOUT_MS = 10_000;

export interface TestInput {
  engine: DbEngine;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  schema?: string;
  tls?: boolean | { ca?: string; verify?: boolean };
  path?: string;
  sqliteMode?: "readwrite" | "readonly" | "create" | "memory";
  dbIndex?: number;
  keyPrefix?: string;
  connectTimeoutMs?: number;
  production: boolean;
}

export interface TestResult {
  ok: boolean;
  ms: number;
  code?: DbErrorCode | "NOT_FOUND" | "NOT_A_FILE";
  /** Plain words, safe to show: it never contains the password. */
  message: string;
  version?: string;
  /** Short extra facts (number of tables, keys with the prefix ...). */
  facts: string[];
}

const PLAIN: Partial<Record<DbErrorCode, (i: TestInput) => string>> = {
  AUTH_FAILED: () => "The server refused the user name or password. Check them, and that this account may connect from this computer.",
  CONNECTION_REFUSED: (i) => `Nothing answered at ${i.host}:${i.port}. Is the server running, and are the host and port right? (If it is, it may need TLS.)`,
  HOST_NOT_FOUND: (i) => `The server name "${i.host}" couldn't be found. Check it for typos and your network connection.`,
  TLS_ERROR: () => "The secure (TLS) connection failed. Check the certificate and CA file, or turn TLS off for a server you trust on this computer.",
  DATABASE_NOT_FOUND: (i) => `The server is there, but it has no database called "${i.database ?? ""}".`,
  TIMEOUT: () => `There was no answer within ${TEST_TIMEOUT_MS / 1000} seconds.`,
  PERMISSION_DENIED: () => "The account may connect but isn't allowed to look at this. Ask the person who runs the server for access.",
  CONNECTION_LOST: () => "The connection was closed by the server. It may need TLS, or a different port.",
};

function redisCode(err: unknown): DbErrorCode {
  const m = String((err as { message?: string })?.message ?? err).toLowerCase();
  if (/wrongpass|noauth|invalid password|auth|nopermission|denied/.test(m) && !/author/.test(m)) return "AUTH_FAILED";
  if (/econnrefused|refused/.test(m)) return "CONNECTION_REFUSED";
  if (/enotfound|getaddrinfo|eai_again/.test(m)) return "HOST_NOT_FOUND";
  if (/tls|ssl|certificate/.test(m)) return "TLS_ERROR";
  if (/timeout|timed out/.test(m)) return "TIMEOUT";
  if (/closed|econnreset|socket/.test(m)) return "CONNECTION_LOST";
  return "UNKNOWN";
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new DbError("TIMEOUT", "timed out")), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });

export async function testConnection(input: TestInput, timeoutMs = TEST_TIMEOUT_MS): Promise<TestResult> {
  const started = performance.now();
  const done = (r: Omit<TestResult, "ms" | "facts"> & { facts?: string[] }): TestResult => ({ ms: Math.round(performance.now() - started), facts: [], ...r, message: `${r.message}${r.ok && input.production ? " This was only a test: nothing was changed or opened." : ""}` });
  try {
    if (input.engine === "sqlite") return done(await testSqlite(input));
    if (input.engine === "redis") return done(await withTimeout(testRedis(input, timeoutMs), timeoutMs + 500));
    return done(await withTimeout(testSql(input, timeoutMs), timeoutMs + 500));
  } catch (err) {
    const code: DbErrorCode = err instanceof DbError ? err.code : input.engine === "redis" ? redisCode(err) : normalizeError(input.engine as "mysql", err, [input.password]).code;
    const plain = PLAIN[code]?.(input);
    const detail = redact(err instanceof Error ? err.message : String(err), [input.password]).replace(/\s+/g, " ").slice(0, 160);
    return done({ ok: false, code, message: plain ?? `The connection failed. ${detail}` });
  }
}

async function testSqlite(i: TestInput): Promise<Omit<TestResult, "ms" | "facts"> & { facts?: string[] }> {
  if (i.sqliteMode === "memory" || i.path === ":memory:") return { ok: true, message: "An in-memory database needs no file: it is created empty each time it is opened.", facts: ["Nothing is saved"] };
  const path = i.path ?? "";
  let st;
  try {
    st = await fsp.stat(path);
  } catch {
    if (i.sqliteMode === "create") {
      const parent = await fsp.stat(dirname(path)).then((s) => s.isDirectory(), () => false);
      return parent ? { ok: true, message: "The file doesn't exist yet. It will be created when the database is opened.", facts: ["New file"] } : { ok: false, code: "NOT_FOUND", message: "The folder for the new file doesn't exist." };
    }
    return { ok: false, code: "NOT_FOUND", message: "That database file doesn't exist." };
  }
  if (!st.isFile()) return { ok: false, code: "NOT_A_FILE", message: "That isn't a file." };
  const adapter = createAdapter({ engine: "sqlite", path, sqliteMode: "readonly", readOnly: true });
  try {
    await adapter.connect();
    const info = await adapter.ping();
    const tables = (await adapter.listObjects()).length;
    return { ok: true, message: `Opened the file for reading. SQLite ${info.version}.`, version: info.version, facts: [`${tables} ${tables === 1 ? "table or view" : "tables and views"}`] };
  } finally {
    await adapter.close().catch(() => {});
  }
}

async function testSql(i: TestInput, timeoutMs: number): Promise<Omit<TestResult, "ms" | "facts"> & { facts?: string[] }> {
  const adapter = createAdapter({
    engine: i.engine as "mysql" | "postgres",
    host: i.host,
    port: i.port,
    user: i.user,
    password: i.password,
    database: i.database,
    schema: i.schema,
    tls: i.tls,
    readOnly: true,
    connectTimeoutMs: Math.min(i.connectTimeoutMs ?? timeoutMs, timeoutMs),
    allowPublicKeyRetrieval: i.engine === "mysql",
    maxConnections: 1,
  });
  try {
    await adapter.connect();
    const info = await adapter.ping();
    return { ok: true, message: `Connected to ${i.engine === "mysql" ? "MySQL / MariaDB" : "PostgreSQL"} ${info.version}.`, version: info.version, facts: [info.currentDatabase ? `Database: ${info.currentDatabase}` : "No database chosen", `${Math.max(1, Math.round(info.latencyMs))} ms`] };
  } catch (err) {
    throw err instanceof DbError ? err : normalizeError(i.engine as "mysql", err, [i.password]);
  } finally {
    await adapter.close().catch(() => {});
  }
}

async function testRedis(i: TestInput, timeoutMs: number): Promise<Omit<TestResult, "ms" | "facts"> & { facts?: string[] }> {
  const tls = !!i.tls;
  const auth = i.user || i.password ? `${i.user ? encodeURIComponent(i.user) : ""}${i.password ? `:${encodeURIComponent(i.password)}` : ""}@` : "";
  const url = `${tls ? "rediss" : "redis"}://${auth}${i.host?.includes(":") ? `[${i.host}]` : i.host}:${i.port}`;
  const client = new RedisClient(url, { connectionTimeout: timeoutMs, autoReconnect: false, maxRetries: 0, ...(tls && typeof i.tls === "object" ? { tls: { rejectUnauthorized: i.tls.verify !== false, ...(i.tls.ca ? { ca: i.tls.ca } : {}) } } : {}) } as never) as RedisClient & { select(db: number): Promise<unknown> };
  try {
    try {
      await client.connect();
    } catch (err) {
      // Bun says "Connection closed" both when nothing is listening and when the server hangs up on a wrong password,
      // so ask the network which it was: a server that picks up the phone but won't talk is a login (or TLS) problem.
      if (redisCode(err) === "CONNECTION_LOST") {
        if (!(await tcpReachable(i.host ?? "127.0.0.1", i.port ?? 6379, 3000))) throw new DbError("CONNECTION_REFUSED", "refused");
        throw new DbError(tls ? "TLS_ERROR" : "AUTH_FAILED", "closed");
      }
      throw err;
    }
    await client.ping();
    if (i.dbIndex) await client.select(i.dbIndex);
    const info = String(await client.send("INFO", ["server"]));
    const version = /redis_version:([^\r\n]+)/.exec(info)?.[1]?.trim() ?? /valkey_version:([^\r\n]+)/.exec(info)?.[1]?.trim() ?? "";
    const facts: string[] = [`Database ${i.dbIndex ?? 0}`];
    if (i.keyPrefix) {
      const res: any = await client.send("SCAN", ["0", "MATCH", `${i.keyPrefix}*`, "COUNT", "1000"]);
      const found = Array.isArray(res?.[1]) ? res[1].length : 0;
      facts.push(`${found}${res?.[0] && String(res[0]) !== "0" ? "+" : ""} keys start with "${i.keyPrefix}" (first look)`);
    }
    return { ok: true, message: `Connected to Redis${version ? ` ${version}` : ""}.`, version, facts };
  } finally {
    try {
      client.close();
    } catch {}
  }
}

/** Can a plain TCP connection be made? (Nothing is sent.) */
function tcpReachable(host: string, port: number, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(ms, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}
