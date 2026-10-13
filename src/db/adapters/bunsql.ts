import { SQL } from "bun";
import type { Capabilities, ConnectionConfig, DbSession, ObjectRef, Param, QueryOptions, QueryResult, ServerInfo, WireValue } from "../types";
import { DbError, assertReadOnlyStatement, normalizeError } from "../errors";
import { leadingKeyword, splitStatements } from "../splitter";
import { decodeParams, toWire } from "../wire";
import { BaseAdapter, type Executor } from "./base";

const WRITE_KEYWORDS = new Set(["INSERT", "UPDATE", "DELETE", "REPLACE", "MERGE"]);

type Conn = { unsafe(sql: string, params?: unknown[]): Promise<any> };
type Reserved = Conn & { release(): void };

/** Common behaviour of the two server engines, both driven by Bun's built-in SQL client. */
export abstract class BunSqlAdapter extends BaseAdapter {
  protected pool: SQL | null = null;

  /** Statements that put a reserved connection into a server-enforced read-only transaction. */
  protected abstract readonly beginReadOnlySql: string;
  protected abstract readonly beginSql: string;
  protected abstract setTimeoutSql(ms: number): string;
  protected abstract resetTimeoutSql(): string;
  protected abstract backendIdSql: string;
  protected abstract cancelSql(id: string): string;
  protected abstract versionSql: string;
  /** Extra statements run on a reserved connection before the first user statement. */
  protected prepareReadOnlyConnection(): string[] {
    return [];
  }
  protected abstract driverOptions(): Record<string, unknown>;

  protected get p(): SQL {
    if (!this.pool) throw new DbError("CONNECTION_LOST", "Not connected. Call connect() first.");
    return this.pool;
  }

  protected tlsOption(): unknown {
    const t = this.config.tls;
    if (!t) return false;
    if (t === true) return { rejectUnauthorized: true };
    return { rejectUnauthorized: t.verify !== false, ...(t.ca ? { ca: t.ca } : {}) };
  }

  async connect(): Promise<void> {
    if (this.pool) return;
    const c = this.config;
    const pool = new SQL({
      adapter: this.engine,
      hostname: c.host ?? "localhost",
      port: c.port ?? (this.engine === "mysql" ? 3306 : 5432),
      username: c.user,
      password: this.password,
      database: c.database,
      max: c.maxConnections ?? 4,
      connectionTimeout: Math.ceil((c.connectTimeoutMs ?? 10000) / 1000),
      tls: this.tlsOption(),
      ...this.driverOptions(),
    } as never);
    try {
      await pool.unsafe("SELECT 1");
    } catch (e) {
      await pool.close().catch(() => {});
      throw normalizeError(this.engine, e, [this.password]);
    }
    this.pool = pool;
  }

  async close(): Promise<void> {
    const p = this.pool;
    this.pool = null;
    await p?.close().catch(() => {});
  }

  async ping(): Promise<ServerInfo> {
    const t = performance.now();
    try {
      const r = (await this.p.unsafe(this.versionSql)) as { v: string; d: string | null }[];
      return { version: String(r[0]?.v ?? ""), currentDatabase: r[0]?.d ?? null, latencyMs: Math.round((performance.now() - t) * 100) / 100 };
    } catch (e) {
      throw normalizeError(this.engine, e, [this.password]);
    }
  }

  protected get readOnly(): boolean {
    return Boolean(this.config.readOnly);
  }

  protected toResult(raw: any, kw: string, started: number, maxRows?: number): QueryResult {
    const all: Record<string, unknown>[] = Array.isArray(raw) ? Array.from(raw as Record<string, unknown>[]) : [];
    const truncated = maxRows !== undefined && all.length > maxRows;
    const rows = (truncated ? all.slice(0, maxRows) : all).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, toWire(v)])) as Record<string, WireValue>);
    const write = WRITE_KEYWORDS.has(kw);
    const count = this.engine === "mysql" ? raw?.affectedRows : raw?.count;
    const lastId = this.engine === "mysql" && write ? raw?.lastInsertRowid : null;
    return {
      columns: rows[0] ? Object.keys(rows[0]) : [],
      rows,
      rowCount: rows.length,
      affectedRows: write && count !== undefined && count !== null ? Number(count) : null,
      lastInsertId: lastId !== null && lastId !== undefined && String(lastId) !== "0" ? String(lastId) : null,
      truncated,
      elapsedMs: Math.round((performance.now() - started) * 100) / 100,
    };
  }

  private single(sql: string): string {
    const stmts = splitStatements(sql, { engine: this.engine });
    if (stmts.length !== 1) throw new DbError("INVALID_REQUEST", stmts.length === 0 ? "Empty statement." : "Run one statement at a time (use the script runner for several).");
    const text = stmts[0]!.sql;
    if (this.readOnly) assertReadOnlyStatement(this.engine, text);
    return text;
  }

  protected execute: Executor = async (sql, params, options) => {
    const text = this.single(sql);
    const bound = decodeParams(params, this.engine);
    const started = performance.now();
    const kw = leadingKeyword(text);
    const timeout = this.config.statementTimeoutMs ?? 0;
    try {
      if (!this.readOnly && !timeout) {
        const raw = await this.p.unsafe(text, bound);
        return this.toResult(raw, kw, started, options?.maxRows);
      }
      const conn = (await this.p.reserve()) as unknown as Reserved;
      let began = false;
      try {
        for (const s of this.readOnly ? this.prepareReadOnlyConnection() : []) await conn.unsafe(s);
        began = await this.enterGuard(conn, timeout);
        const raw = await conn.unsafe(text, bound);
        await this.leaveGuard(conn, began, timeout, false);
        began = false;
        return this.toResult(raw, kw, started, options?.maxRows);
      } catch (e) {
        if (began) await this.leaveGuard(conn, true, timeout, true).catch(() => {});
        throw e;
      } finally {
        conn.release();
      }
    } catch (e) {
      throw normalizeError(this.engine, e, [this.password]);
    }
  };

  /** Start the per-statement guard (read-only transaction and/or timeout). Returns true if a transaction was opened. */
  protected abstract enterGuard(conn: Conn, timeoutMs: number): Promise<boolean>;
  protected abstract leaveGuard(conn: Conn, began: boolean, timeoutMs: number, failed: boolean): Promise<void>;

  async openSession(): Promise<DbSession> {
    const conn = (await this.p.reserve()) as unknown as Reserved;
    const self = this;
    let inTx = false;
    let released = false;
    let backendId: string | null = null;
    const timeout = this.config.statementTimeoutMs ?? 0;
    try {
      if (this.readOnly) for (const s of this.prepareReadOnlyConnection()) await conn.unsafe(s);
      if (timeout) await conn.unsafe(this.setTimeoutSql(timeout));
      const idRow = (await conn.unsafe(this.backendIdSql)) as { id: unknown }[];
      backendId = String(idRow[0]?.id ?? "");
    } catch (e) {
      conn.release();
      throw normalizeError(this.engine, e, [this.password]);
    }
    const exec = async (sql: string, params: Param[] = [], options?: QueryOptions): Promise<QueryResult> => {
      const text = self.single(sql);
      const started = performance.now();
      try {
        // Outside an explicit transaction a read-only session still runs each statement read-only.
        const guard = self.readOnly && !inTx;
        if (guard) await conn.unsafe(self.beginReadOnlySql);
        try {
          const raw = await conn.unsafe(text, decodeParams(params, self.engine));
          return self.toResult(raw, leadingKeyword(text), started, options?.maxRows);
        } finally {
          if (guard) await conn.unsafe("ROLLBACK").catch(() => {});
        }
      } catch (e) {
        throw normalizeError(self.engine, e, [self.password]);
      }
    };
    return {
      get inTransaction() {
        return inTx;
      },
      query: exec,
      async begin() {
        if (inTx) throw new DbError("INVALID_REQUEST", "A transaction is already open.");
        await conn.unsafe(self.readOnly ? self.beginReadOnlySql : self.beginSql).catch((e) => {
          throw normalizeError(self.engine, e, [self.password]);
        });
        inTx = true;
      },
      async commit() {
        if (!inTx) throw new DbError("INVALID_REQUEST", "No transaction is open.");
        await conn.unsafe("COMMIT").catch((e) => {
          throw normalizeError(self.engine, e, [self.password]);
        });
        inTx = false;
      },
      async rollback() {
        if (!inTx) return;
        await conn.unsafe("ROLLBACK").catch((e) => {
          throw normalizeError(self.engine, e, [self.password]);
        });
        inTx = false;
      },
      async cancel() {
        if (!backendId) return false;
        try {
          await self.p.unsafe(self.cancelSql(backendId));
          return true;
        } catch {
          return false;
        }
      },
      async close() {
        if (released) return;
        released = true;
        try {
          if (inTx) await conn.unsafe("ROLLBACK").catch(() => {});
          if (timeout) await conn.unsafe(self.resetTimeoutSql()).catch(() => {});
        } finally {
          inTx = false;
          conn.release();
        }
      },
    };
  }

  abstract override capabilities(): Promise<Capabilities>;
  abstract override listObjects(): Promise<ObjectRef[]>;
}
