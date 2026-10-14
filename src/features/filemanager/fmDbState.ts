/**
 * Shared state of the Databases feature for one File Manager server: the hooks, the connection store (made when
 * first needed, because finding the keychain takes a moment), the running studios, and a few short-lived memories.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { promises as fsp } from "fs";
import { dirname } from "path";
import { DbError } from "../../db/errors";
import type { ConnectionProfile, SecretStore } from "../../db/profiles";
import { absolutePath, assertCreatable, assertModifiable, type FmContext } from "./fmCore";
import { defaultDatabasesHooks, type DatabasesHooks } from "./fmDbHooks";
import { buildEnvView, type EnvView } from "./fmDbEnvView";
import { connectionFingerprint, type DbEngine } from "./fmDbModel";
import { StudioManager } from "./fmDbStudios";
import { DbStore, type DbProfile, type RedisProfile } from "./fmDbStore";
import { FmError } from "./fmPaths";
import { SNIFF_BYTES, sniffType } from "./fmSniff";

export interface StudioSource {
  engine: DbEngine;
  profileId: string | null;
  /** A SQLite file opened directly, without a saved connection. */
  path?: string;
  /** Production or read-only connection: the person was asked and agreed that the studio can change data. */
  writesConfirmed: boolean;
}

/** Finds the keychain the first time a password is needed, so merely looking at the connections never touches it. */
export class LazySecretStore implements SecretStore {
  private real: Promise<SecretStore> | null = null;
  private resolved: SecretStore | null = null;
  constructor(private readonly find: () => Promise<SecretStore>) {}
  get kind(): SecretStore["kind"] {
    return this.resolved?.kind ?? "memory";
  }
  /** Looks for the keychain (once) and says which kind of store it is. */
  async ensure(): Promise<SecretStore> {
    this.real ??= this.find().then((s) => (this.resolved = s));
    return this.real;
  }
  async get(id: string) {
    return (await this.ensure()).get(id);
  }
  async set(id: string, password: string) {
    return (await this.ensure()).set(id, password);
  }
  async delete(id: string) {
    return (await this.ensure()).delete(id);
  }
}

export interface DbState {
  hooks: DatabasesHooks;
  secrets: LazySecretStore;
  store: DbStore;
  studios: StudioManager;
  /** Passwords read from a pasted address, held for a few minutes so the page never has to send them back. */
  stash: Map<string, { engine: DbEngine; password: string; expires: number }>;
  /** "Not now": detected connections left alone until the File Manager is restarted. */
  snoozed: Set<string>;
  sources: Map<string, StudioSource>;
  salt: Buffer;
  /** Variables seen by the quiet scan at start-up, so it speaks up once. */
  announced: boolean;
}

const states = new WeakMap<FmContext, DbState>();

export function dbState(ctx: FmContext): DbState {
  let s = states.get(ctx);
  if (s) return s;
  const hooks: DatabasesHooks = { ...defaultDatabasesHooks(), ...ctx.databases };
  const studios = new StudioManager(hooks);
  const secrets = new LazySecretStore(() => hooks.secretStore());
  s = {
    hooks,
    secrets,
    store: new DbStore(ctx.dataDir, secrets),
    studios,
    stash: new Map(),
    snoozed: new Set(),
    sources: new Map(),
    salt: randomBytes(16),
    announced: false,
  };
  states.set(ctx, s);
  ctx.disposers.push(() => studios.dispose());
  return s;
}

export const dbStore = (ctx: FmContext) => dbState(ctx).store;

/** The keychain kind (looks for it if that hasn't happened yet). */
export async function secretKind(ctx: FmContext): Promise<SecretStore["kind"]> {
  const s = dbState(ctx);
  await s.secrets.ensure();
  return s.secrets.kind;
}

export async function envView(ctx: FmContext): Promise<EnvView> {
  const { hooks } = dbState(ctx);
  return buildEnvView({ env: hooks.env(), cwd: hooks.cwd(), roots: hooks.appRoots(), home: ctx.home });
}

/** Turns a validation error from the database layer into the File Manager's error type (a plain message, never a secret). */
export function asFmError(err: unknown): unknown {
  if (err instanceof DbError) return new FmError(err.code === "INVALID_REQUEST" ? "BAD_REQUEST" : err.code, err.message);
  return err;
}

export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw asFmError(err);
  }
}

/** A salted hash for comparing two secrets without keeping or showing either (the salt only lives in this process). */
export function sameSecret(state: DbState, a: string | undefined | null, b: string | undefined | null): boolean {
  const h = (x: string | undefined | null) => createHash("sha256").update(state.salt).update(x ?? "").digest();
  return timingSafeEqual(h(a), h(b));
}

export function stashPassword(state: DbState, engine: DbEngine, password: string): string {
  const now = state.hooks.now();
  for (const [k, v] of state.stash) if (v.expires < now) state.stash.delete(k);
  while (state.stash.size >= 12) state.stash.delete(state.stash.keys().next().value!);
  const token = randomUUID();
  state.stash.set(token, { engine, password, expires: now + 5 * 60_000 });
  return token;
}

export function takeStashed(state: DbState, token: unknown, engine: DbEngine): string | undefined {
  if (typeof token !== "string") return undefined;
  const hit = state.stash.get(token);
  if (!hit) throw new FmError("BAD_REQUEST", "The password from the pasted address has expired. Paste the address again.");
  if (hit.expires < state.hooks.now() || hit.engine !== engine) {
    state.stash.delete(token);
    throw new FmError("BAD_REQUEST", "The password from the pasted address has expired. Paste the address again.");
  }
  return hit.password;
}

export function profileFingerprint(p: DbProfile): string {
  if (p.engine === "sqlite") return connectionFingerprint("sqlite", { path: (p as ConnectionProfile).path });
  if (p.engine === "redis") {
    const r = p as RedisProfile;
    return connectionFingerprint("redis", { host: r.host, port: r.port, user: r.user, dbIndex: r.dbIndex });
  }
  const c = p as ConnectionProfile;
  return connectionFingerprint(c.engine, { host: c.host, port: c.port, user: c.user, database: c.database });
}

/** True for SQLite's header ("SQLite format 3") or an empty file. */
export async function looksLikeSqlite(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await fsp.open(path, "r");
    const st = await handle.stat();
    if (!st.isFile()) return false;
    if (st.size === 0) return true;
    const buf = Buffer.alloc(Math.min(SNIFF_BYTES, st.size));
    await handle.read(buf, 0, buf.length, 0);
    return sniffType(buf)?.kind === "sqlite";
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/** Checks a SQLite file path from the page: a full path, a real SQLite file (or a place a new one may be made), nothing protected. */
export async function checkSqlitePath(ctx: FmContext, input: unknown, mode: string): Promise<string> {
  if (mode === "memory") return ":memory:";
  const path = absolutePath(ctx, input);
  const st = await fsp.stat(path).catch(() => null);
  if (st) {
    if (!st.isFile()) throw new FmError("NOT_A_FILE", "That isn't a file.");
    if (!(await looksLikeSqlite(path))) throw new FmError("NOT_SQLITE", "That file isn't an SQLite database (it doesn't start with SQLite's header).");
    if (mode !== "readonly") assertModifiable(ctx, path);
    return path;
  }
  if (mode !== "create") throw new FmError("NOT_FOUND", "That database file doesn't exist. Choose \"Create it if missing\" to make a new one.");
  const parent = dirname(path);
  const pst = await fsp.stat(parent).catch(() => null);
  if (!pst?.isDirectory()) throw new FmError("NOT_FOUND", "The folder for the new database doesn't exist.");
  assertCreatable(ctx, parent);
  return path;
}
