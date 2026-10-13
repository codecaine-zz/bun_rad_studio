import { createHash, randomUUID } from "crypto";
import { existsSync, statSync } from "fs";
import { resolve } from "path";
import { Database } from "bun:sqlite";
import type {
  BrowseRequest,
  Capabilities,
  ConnectionConfig,
  DbAdapter,
  DbSession,
  ObjectRef,
  Param,
  QueryResult,
  RowDelete,
  RowInsert,
  RowUpdate,
} from "./types";
import { DbError, normalizeError } from "./errors";
import { createAdapter } from "./index";
import type { SqliteAdapter } from "./adapters/sqlite";
import { classifyStatement, needsConfirmation, type Classification } from "./classify";
import { splitStatements } from "./splitter";
import { ProfileStore, profileToConfig, sanitizeProfileInput, type ConnectionProfile, type Environment } from "./profiles";

export interface ConnectionSummary {
  connectionId: string;
  profileId: string | null;
  name: string;
  engine: ConnectionProfile["engine"];
  environment: Environment;
  readOnly: boolean;
  database: string | null;
  version: string;
  capabilities: Capabilities;
  temporary: boolean;
  inTransaction: boolean;
}

interface Live {
  id: string;
  profile: ConnectionProfile;
  adapter: DbAdapter;
  session: DbSession;
  capabilities: Capabilities;
  database: string | null;
}

interface Pending {
  connectionId: string;
  digest: string;
  summary: ConfirmationSummary;
  requireTyped: string | null;
  expires: number;
}

export interface ConfirmationSummary {
  connection: string;
  environment: Environment;
  engine: string;
  database: string | null;
  operation: string;
  statements: string[];
  reasons: string[];
}

export interface ConfirmationRequired {
  needsConfirmation: true;
  token: string;
  /** When set, the user must type exactly this text to proceed (production connections). */
  requireTyped: string | null;
  summary: ConfirmationSummary;
}

export interface ConfirmInput {
  token?: string;
  typed?: string;
}

export interface ScriptStatementResult {
  index: number;
  line: number;
  sql: string;
  ok: boolean;
  result?: QueryResult;
  error?: { code: string; message: string; hint?: string };
}

export interface ScriptResult {
  statements: ScriptStatementResult[];
  stoppedAt: number | null;
  atomic: boolean;
  rolledBack: boolean;
}

const CONFIRM_TTL_MS = 2 * 60_000;
const digestOf = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex");
const MAX_SCRIPT_RESULT_ROWS = 1000;

/**
 * Orchestrates connections, sessions and safety checks for the workbench. All engine access goes through
 * the shared adapters; this layer decides *whether* an operation may run (read-only, confirmation).
 */
export class WorkbenchService {
  private readonly live = new Map<string, Live>();
  private readonly pending = new Map<string, Pending>();

  constructor(
    readonly profiles: ProfileStore,
    private readonly makeAdapter: (config: ConnectionConfig) => DbAdapter = createAdapter,
  ) {}

  // ---- connections ------------------------------------------------------------------------------------------

  async connect(input: { profileId?: string; profile?: unknown; password?: string }): Promise<ConnectionSummary> {
    let profile: ConnectionProfile;
    let config: ConnectionConfig;
    if (input.profileId) {
      const p = this.profiles.get(input.profileId);
      if (!p) throw new DbError("INVALID_REQUEST", "Unknown connection profile");
      profile = p;
      config = await this.profiles.resolveConfig(p.id, input.password);
    } else {
      const clean = sanitizeProfileInput(input.profile);
      profile = { ...clean, id: `tmp-${randomUUID()}`, createdAt: new Date().toISOString() };
      config = profileToConfig(profile, input.password);
    }
    const adapter = this.makeAdapter(config);
    await adapter.connect();
    try {
      const session = await adapter.openSession();
      const capabilities = await adapter.capabilities();
      const info = await adapter.ping();
      const id = randomUUID();
      this.live.set(id, { id, profile, adapter, session, capabilities, database: info.currentDatabase });
      if (input.profileId) this.profiles.markUsed(input.profileId);
      return this.summary(this.live.get(id)!);
    } catch (e) {
      await adapter.close().catch(() => {});
      throw e;
    }
  }

  private summary(c: Live): ConnectionSummary {
    return {
      connectionId: c.id,
      profileId: c.profile.id.startsWith("tmp-") ? null : c.profile.id,
      name: c.profile.name,
      engine: c.profile.engine,
      environment: c.profile.environment,
      readOnly: c.profile.readOnly,
      database: c.database,
      version: c.capabilities.version,
      capabilities: c.capabilities,
      temporary: c.profile.engine === "sqlite" && c.profile.sqliteMode === "memory",
      inTransaction: c.session.inTransaction,
    };
  }

  list(): ConnectionSummary[] {
    return [...this.live.values()].map((c) => this.summary(c));
  }

  private get(id: unknown): Live {
    const c = typeof id === "string" ? this.live.get(id) : undefined;
    if (!c) throw new DbError("INVALID_REQUEST", "Unknown or closed connection");
    return c;
  }

  /** Close a connection. An open transaction means unsaved work: the caller must opt in to discarding it. */
  async disconnect(id: string, opts: { discardTransaction?: boolean } = {}): Promise<void> {
    const c = this.get(id);
    if (c.session.inTransaction && !opts.discardTransaction) {
      throw new DbError("INVALID_REQUEST", "This connection has an open transaction with uncommitted changes.", "Commit or roll back first, or disconnect with discardTransaction to roll it back.");
    }
    await c.session.close().catch(() => {});
    await c.adapter.close();
    this.live.delete(id);
    for (const [t, p] of this.pending) if (p.connectionId === id) this.pending.delete(t);
  }

  async closeAll(): Promise<void> {
    for (const id of [...this.live.keys()]) await this.disconnect(id, { discardTransaction: true }).catch(() => {});
  }

  async test(input: { profileId?: string; profile?: unknown; password?: string }): Promise<{ ok: true; version: string; latencyMs: number }> {
    const summary = await this.connect(input);
    try {
      const info = await this.get(summary.connectionId).adapter.ping();
      return { ok: true, version: info.version, latencyMs: info.latencyMs };
    } finally {
      await this.disconnect(summary.connectionId, { discardTransaction: true });
    }
  }

  // ---- metadata and data ------------------------------------------------------------------------------------

  objects(id: string): Promise<ObjectRef[]> {
    return this.get(id).adapter.listObjects();
  }
  describe(id: string, ref: ObjectRef) {
    return this.get(id).adapter.describeTable(ref);
  }
  browse(id: string, req: BrowseRequest) {
    return this.get(id).adapter.browse(req);
  }

  private assertWritable(c: Live) {
    if (c.profile.readOnly) throw new DbError("READ_ONLY", `"${c.profile.name}" is a read-only connection.`, "Use a read-write profile to change data.");
  }

  /** Row edits are single, key-guarded statements; production connections still require a confirmation. */
  async updateRow(id: string, req: RowUpdate, confirm: ConfirmInput = {}) {
    const c = this.get(id);
    this.assertWritable(c);
    const gate = this.gate(c, "Update one row", [`UPDATE ${req.table.name} (1 row, key ${JSON.stringify(req.key)})`], { kind: "write", reasons: ["Changes data"] }, confirm, digestOf("row-update", JSON.stringify(req)));
    if (gate) return gate;
    return this.viaSession(c, () => c.adapter.updateRow(req));
  }
  async deleteRow(id: string, req: RowDelete, confirm: ConfirmInput = {}) {
    const c = this.get(id);
    this.assertWritable(c);
    const gate = this.gate(c, "Delete one row", [`DELETE FROM ${req.table.name} (1 row, key ${JSON.stringify(req.key)})`], { kind: "destructive", reasons: ["Permanently deletes a row"] }, confirm, digestOf("row-delete", JSON.stringify(req)));
    if (gate) return gate;
    return this.viaSession(c, () => c.adapter.deleteRow(req));
  }
  async insertRow(id: string, req: RowInsert, confirm: ConfirmInput = {}) {
    const c = this.get(id);
    this.assertWritable(c);
    const gate = this.gate(c, "Insert one row", [`INSERT INTO ${req.table.name}`], { kind: "write", reasons: ["Changes data"] }, confirm, digestOf("row-insert", JSON.stringify(req)));
    if (gate) return gate;
    return this.viaSession(c, () => c.adapter.insertRow(req));
  }

  /**
   * Row edits run as their own key-guarded statement. On SQLite the single connection is shared, so they join an
   * open transaction; on MySQL/PostgreSQL they would bypass it, so they are refused until it is finished.
   */
  private async viaSession<T>(c: Live, fn: () => Promise<T>): Promise<T> {
    if (c.session.inTransaction && c.profile.engine !== "sqlite") {
      throw new DbError("INVALID_REQUEST", "A SQL transaction is open on this connection; row edits cannot join it.", "Commit or roll back the transaction first.");
    }
    return fn();
  }

  exportCsv(id: string, source: Parameters<DbAdapter["exportCsv"]>[0]) {
    return this.get(id).adapter.exportCsv(source);
  }

  // ---- SQL execution ----------------------------------------------------------------------------------------

  /** Run a single statement. Returns a confirmation request instead when the statement needs one. */
  async query(id: string, sql: string, params: Param[] = [], opts: { maxRows?: number } & ConfirmInput = {}): Promise<QueryResult | ConfirmationRequired> {
    const c = this.get(id);
    const stmts = splitStatements(sql, { engine: c.profile.engine });
    if (stmts.length !== 1) throw new DbError("INVALID_REQUEST", stmts.length ? "Run one statement at a time, or use Run script." : "Enter a statement to run.");
    const cls = classifyStatement(c.profile.engine, stmts[0]!.sql);
    if (c.profile.readOnly && cls.kind !== "read") {
      throw new DbError("READ_ONLY", `"${c.profile.name}" is a read-only connection: ${cls.reasons[0] ?? "this statement is not a read"}.`, "Use a read-write profile to change data.");
    }
    const gate = this.gate(c, "Run SQL statement", [stmts[0]!.sql], cls, opts, digestOf("query", sql, JSON.stringify(params)));
    if (gate) return gate;
    return c.session.query(sql, params, { maxRows: opts.maxRows ?? 1000 });
  }

  /** Run several statements in order. `onError`: stop (default) or continue. `atomic` wraps them in a transaction. */
  async script(id: string, sql: string, opts: { onError?: "stop" | "continue"; atomic?: boolean; maxRows?: number } & ConfirmInput = {}): Promise<ScriptResult | ConfirmationRequired> {
    const c = this.get(id);
    const stmts = splitStatements(sql, { engine: c.profile.engine });
    if (stmts.length === 0) throw new DbError("INVALID_REQUEST", "Enter a script to run.");
    const classes = stmts.map((s) => classifyStatement(c.profile.engine, s.sql));
    if (c.profile.readOnly) {
      const bad = classes.findIndex((k) => k.kind !== "read");
      if (bad >= 0) throw new DbError("READ_ONLY", `"${c.profile.name}" is read-only; statement ${bad + 1} is not a read.`);
    }
    const merged: Classification = {
      kind: classes.some((k) => k.kind === "destructive") ? "destructive" : classes.some((k) => k.kind === "admin") ? "admin" : classes.some((k) => k.kind === "other") ? "other" : classes.some((k) => k.kind === "ddl") ? "ddl" : classes.some((k) => k.kind === "write") ? "write" : "read",
      reasons: [...new Set(classes.flatMap((k) => k.reasons))],
    };
    const atomic = Boolean(opts.atomic);
    if (atomic && c.profile.engine === "mysql" && classes.some((k) => k.kind === "ddl" || k.kind === "destructive")) {
      throw new DbError("INVALID_REQUEST", "MySQL commits implicitly around DDL statements, so this script cannot be run atomically.", "Remove the DDL statements or run without \"atomic\".");
    }
    const gate = this.gate(c, `Run script (${stmts.length} statements)`, stmts.map((s) => s.sql), merged, opts, digestOf("script", sql, String(atomic), opts.onError ?? "stop"));
    if (gate) return gate;

    const onError = opts.onError ?? "stop";
    const out: ScriptStatementResult[] = [];
    let stoppedAt: number | null = null;
    let rolledBack = false;
    const startedTx = atomic && !c.session.inTransaction;
    if (startedTx) await c.session.begin();
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i]!;
      try {
        const result = await c.session.query(s.sql, [], { maxRows: opts.maxRows ?? MAX_SCRIPT_RESULT_ROWS });
        out.push({ index: i, line: s.line, sql: s.sql, ok: true, result });
      } catch (e) {
        const err = e instanceof DbError ? e : normalizeError(c.profile.engine, e);
        out.push({ index: i, line: s.line, sql: s.sql, ok: false, error: { code: err.code, message: err.message, hint: err.hint } });
        if (onError === "stop" || atomic) {
          stoppedAt = i;
          break;
        }
      }
    }
    if (startedTx) {
      if (stoppedAt !== null) {
        await c.session.rollback();
        rolledBack = true;
      } else await c.session.commit();
    }
    return { statements: out, stoppedAt, atomic, rolledBack };
  }

  async transaction(id: string, action: "begin" | "commit" | "rollback") {
    const c = this.get(id);
    if (action === "begin") {
      if (c.profile.readOnly) {
        // A read-only connection may still open a (read-only) transaction for consistent reads.
      }
      await c.session.begin();
    } else if (action === "commit") await c.session.commit();
    else await c.session.rollback();
    return { inTransaction: c.session.inTransaction };
  }

  async cancel(id: string): Promise<{ canceled: boolean; explanation?: string }> {
    const c = this.get(id);
    if (!c.capabilities.cancelQuery) return { canceled: false, explanation: c.capabilities.notes.cancelQuery ?? "This engine cannot cancel a running statement." };
    return { canceled: await c.session.cancel() };
  }

  // ---- confirmations ----------------------------------------------------------------------------------------

  /**
   * Returns a ConfirmationRequired when the operation needs one and `confirm` does not carry a valid, matching,
   * unexpired token (plus the typed text on production). A token works once.
   */
  private gate(c: Live, operation: string, statements: string[], cls: Classification, confirm: ConfirmInput, digest: string): ConfirmationRequired | null {
    const production = c.profile.environment === "production";
    if (!needsConfirmation(cls, production)) return null;
    if (confirm.token) {
      const p = this.pending.get(confirm.token);
      this.pending.delete(confirm.token);
      if (!p || p.expires < Date.now() || p.connectionId !== c.id || p.digest !== digest) {
        throw new DbError("INVALID_REQUEST", "The confirmation is no longer valid for this operation.", "Review the operation and confirm again.");
      }
      if (p.requireTyped !== null && confirm.typed !== p.requireTyped) {
        throw new DbError("INVALID_REQUEST", "The confirmation text did not match.", `Type exactly: ${p.requireTyped}`);
      }
      return null;
    }
    const token = randomUUID();
    const requireTyped = production ? c.profile.name : null;
    const summary: ConfirmationSummary = {
      connection: c.profile.name,
      environment: c.profile.environment,
      engine: c.profile.engine,
      database: c.database,
      operation,
      statements: statements.map((s) => (s.length > 2000 ? s.slice(0, 2000) + " …" : s)).slice(0, 50),
      reasons: cls.reasons,
    };
    this.pending.set(token, { connectionId: c.id, digest, summary, requireTyped, expires: Date.now() + CONFIRM_TTL_MS });
    return { needsConfirmation: true, token, requireTyped, summary };
  }

  // ---- SQLite backup / restore ------------------------------------------------------------------------------

  /**
   * Consistent backup of a live SQLite database with VACUUM INTO (safe with WAL and open writers, unlike a file
   * copy). The result is opened and checked before it is reported as a backup. Never overwrites an existing file.
   */
  async sqliteBackup(id: string, destPath: string) {
    const c = this.get(id);
    if (c.profile.engine !== "sqlite") throw new DbError("INVALID_REQUEST", "Backup by this method is only available for SQLite.");
    if (c.session.inTransaction) throw new DbError("INVALID_REQUEST", "Finish the open transaction before creating a backup.");
    const dest = this.checkNewFile(destPath);
    const source = await c.adapter.query("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'");
    (c.adapter as SqliteAdapter).backupTo(dest);
    const verified = verifySqlite(dest);
    return { path: dest, bytes: statSync(dest).size, ...verified, sourceTables: Number(source.rows[0]?.n ?? 0) };
  }

  /** Describe what restoring `backupPath` into a NEW file `targetPath` would do. Returns a token to confirm it. */
  sqliteRestorePreview(backupPath: string, targetPath: string) {
    const backup = resolve(backupPath);
    if (!existsSync(backup) || !statSync(backup).isFile()) throw new DbError("INVALID_REQUEST", `Backup file not found: ${backup}`);
    const target = this.checkNewFile(targetPath);
    const check = verifySqlite(backup);
    if (!check.integrityOk) throw new DbError("INVALID_REQUEST", `The backup failed its integrity check: ${check.integrityMessages.join("; ")}`);
    const token = randomUUID();
    this.pending.set(token, {
      connectionId: "sqlite-restore",
      digest: digestOf("sqlite-restore", backup, target),
      summary: { connection: "(restore)", environment: "development", engine: "sqlite", database: target, operation: "Restore SQLite backup into a new file", statements: [`${backup} -> ${target}`], reasons: [`${check.tables.length} tables, ${check.tables.reduce((n, t) => n + t.rows, 0)} rows will be written to a new file`] },
      requireTyped: null,
      expires: Date.now() + CONFIRM_TTL_MS,
    });
    return { token, backup, target, bytes: statSync(backup).size, ...check, willOverwrite: false };
  }

  sqliteRestoreExecute(backupPath: string, targetPath: string, token: string) {
    const backup = resolve(backupPath);
    const target = this.checkNewFile(targetPath);
    const p = this.pending.get(token);
    this.pending.delete(token);
    if (!p || p.expires < Date.now() || p.digest !== digestOf("sqlite-restore", backup, target)) {
      throw new DbError("INVALID_REQUEST", "The restore confirmation is invalid or expired.", "Preview the restore again.");
    }
    const src = new Database(backup, { readonly: true });
    try {
      src.query("VACUUM INTO ?").run(target);
    } finally {
      src.close();
    }
    return { path: target, ...verifySqlite(target) };
  }

  private checkNewFile(path: string): string {
    if (typeof path !== "string" || path.trim() === "" || path.includes("\0")) throw new DbError("INVALID_REQUEST", "A file path is required.");
    const full = resolve(path);
    if (existsSync(full)) throw new DbError("INVALID_REQUEST", `${full} already exists. Existing files are never overwritten.`, "Choose a new file name.");
    return full;
  }
}

export interface SqliteVerification {
  integrityOk: boolean;
  integrityMessages: string[];
  tables: { name: string; rows: number }[];
}

/** Open a SQLite file read-only, run integrity_check and count rows per table. */
export function verifySqlite(path: string): SqliteVerification {
  const db = new Database(path, { readonly: true, safeIntegers: true });
  try {
    const messages = (db.query("PRAGMA integrity_check").all() as { integrity_check: string }[]).map((r) => r.integrity_check);
    const names = (db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    const tables = names.map((name) => ({ name, rows: Number((db.query(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`).get() as { n: bigint }).n) }));
    return { integrityOk: messages.length === 1 && messages[0] === "ok", integrityMessages: messages, tables };
  } finally {
    db.close();
  }
}
