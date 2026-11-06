/**
 * How each studio hands its current database to the staging import. The staging import keeps its own connections (a separate
 * one per job for file and server databases), so it never interferes with a query the person is running in the studio.
 */
import type { Database } from "bun:sqlite";
import { createAdapter, type DbAdapter } from "../index";
import { AdapterStageDb, SqliteStageDb, type StageDb } from "./db";

/** Minimal interface describing a SQLite studio manager's active database state. */
export interface SqliteLike {
  db: Database;
  activePath: string;
  isMemory: boolean;
}

/** Returns a cached `StageDb` factory that tracks the active SQLite database or in-memory instance. */
export function sqliteProvider(get: () => SqliteLike): () => Promise<StageDb> {
  let last: { key: unknown; value: StageDb } | null = null;
  return async () => {
    const m = get();
    const key = m.isMemory ? m.db : m.activePath;
    if (last && last.key === key) return last.value;
    const value = new SqliteStageDb(
      m.isMemory ? { path: ":memory:", shared: m.db } : { path: m.activePath },
    );
    last = { key, value };
    return value;
  };
}

/** Connection parameters for a MySQL or PostgreSQL server managed by a studio instance. */
export interface ServerLike {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema?: string;
  tls?: boolean;
}

/** Returns a cached `StageDb` factory that manages dedicated adapter connections for MySQL or PostgreSQL. */
export function serverProvider(
  engine: "mysql" | "postgres",
  get: () => ServerLike,
): () => Promise<StageDb> {
  let last: { key: string; adapter: DbAdapter; value: StageDb } | null = null;
  return async () => {
    const c = get();
    const key = JSON.stringify([
      c.host,
      c.port,
      c.user,
      c.password,
      c.database,
      c.schema ?? "",
      !!c.tls,
    ]);
    if (last && last.key === key) return last.value;
    if (last) await last.adapter.close().catch(() => {});
    const adapter = createAdapter({
      engine,
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      database: c.database,
      ...(engine === "postgres"
        ? { schema: c.schema || "public" }
        : { allowPublicKeyRetrieval: true }),
      tls: !!c.tls,
      maxConnections: 4,
    });
    const value = new AdapterStageDb(adapter, c.database);
    last = { key, adapter, value };
    return value;
  };
}
