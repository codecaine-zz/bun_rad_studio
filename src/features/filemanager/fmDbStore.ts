/**
 * Where the File Manager keeps database connections.
 *
 * SQLite, MySQL/MariaDB and PostgreSQL profiles live in the shared ProfileStore (src/db/profiles.ts, the same
 * `connections.json` the Database Workbench uses). That layer doesn't know Redis, and widening its `Engine` type would
 * touch every adapter, so Redis profiles are a small sibling file (`connections_redis.json`) with the same shape and
 * the same rules: metadata on disk (mode 0600), passwords only in the SecretStore (the OS keychain).
 * Settings that belong to this feature (engine defaults, "use my environment", detection choices) are in
 * `file_manager_databases.json`.
 */
import { randomUUID } from "crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { DbError } from "../../db/errors";
import {
  ProfileStore,
  type ConnectionProfile,
  type Environment,
  type SecretStore,
} from "../../db/profiles";
import {
  DB_ENGINES,
  isEngine,
  validHost,
  validPort,
  type DbEngine,
} from "./fmDbModel";

/** Saved connection profile for a Redis server endpoint. */
export interface RedisProfile {
  id: string;
  name: string;
  engine: "redis";
  folder?: string;
  tags: string[];
  favorite: boolean;
  environment: Environment;
  readOnly: boolean;
  host: string;
  port?: number;
  /** The ACL user name. */
  user?: string;
  /** Database number, 0 to 15. */
  dbIndex?: number;
  tls?: boolean | { ca?: string; verify?: boolean };
  keyPrefix?: string;
  connectTimeoutMs?: number;
  createdAt: string;
  lastUsedAt?: string;
}

/** Union of SQL (`ConnectionProfile`) and Redis (`RedisProfile`) saved connection profiles. */
export type DbProfile = ConnectionProfile | RedisProfile;

/** Origin and environment provenance metadata attached to a saved database connection profile. */
export interface ProfileMeta {
  /** How the profile came to be. */
  source: "manual" | "environment" | "dotenv" | "envfile" | "url" | "local";
  /** Environment variable names it was made from (names only). */
  variables?: string[];
  slot?: string;
  fingerprint?: string;
  savedAt: string;
}

/** Database connection profile enriched with `hasPassword` and optional `ProfileMeta` for UI display. */
export type PublicDbProfile = DbProfile & {
  hasPassword: boolean;
  meta?: ProfileMeta;
};

/** User-configured fallback host, port, user, database, and TLS settings for a database engine. */
export interface EngineDefaults {
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  schema?: string;
  tls?: boolean;
}

/** Per-engine configuration controlling environment variable fallback and default connection values. */
export interface EngineSettings {
  /** When no profile is chosen, start the studio with this program's environment variables as before; also lets a profile fall back to them for blank fields. */
  useEnv: boolean;
  defaults: EngineDefaults;
}

/** Persisted Databases feature settings including auto-detection preferences, per-engine defaults, and dismissed keys. */
export interface DbSettings {
  version: 1;
  detect: { auto: boolean; autoSave: boolean };
  engines: Record<DbEngine, EngineSettings>;
  /** Fingerprints of detected connections the person chose "Never for this one" for. */
  dismissed: string[];
  meta: Record<string, ProfileMeta>;
}

const bad = (m: string) => new DbError("INVALID_REQUEST", m);
const ENVIRONMENTS: Environment[] = [
  "development",
  "test",
  "staging",
  "production",
];

/** Creates a fresh `DbSettings` object with default per-engine settings and auto-detection enabled. */
export function defaultSettings(): DbSettings {
  const engines = Object.fromEntries(
    DB_ENGINES.map((e) => [e, { useEnv: true, defaults: {} }]),
  ) as Record<DbEngine, EngineSettings>;
  return {
    version: 1,
    detect: { auto: true, autoSave: false },
    engines,
    dismissed: [],
    meta: {},
  };
}

const text = (v: unknown, field: string, max: number): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || v.length > max || /[\u0000-\u001f]/.test(v))
    throw bad(`${field} must be text up to ${max} characters`);
  return v;
};

/** Defaults a person types for an engine: only the host, port, user, database, schema and TLS choice. */
export function sanitizeDefaults(input: unknown): EngineDefaults {
  const o = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const out: EngineDefaults = {};
  const host = text(o.host, "host", 255);
  if (host) {
    if (!validHost(host)) throw bad("host contains invalid characters");
    out.host = host;
  }
  if (o.port !== undefined && o.port !== "" && o.port !== null) {
    const port = Number(o.port);
    if (!validPort(port)) throw bad("port must be 1-65535");
    out.port = port;
  }
  const user = text(o.user, "user", 128);
  if (user) out.user = user;
  const database = text(o.database, "database", 128);
  if (database) out.database = database;
  const schema = text(o.schema, "schema", 128);
  if (schema) out.schema = schema;
  if (typeof o.tls === "boolean") out.tls = o.tls;
  return out;
}

/** Validates and normalizes an untrusted Redis connection profile payload. */
export function sanitizeRedisProfile(
  input: unknown,
  existing?: RedisProfile,
): Omit<RedisProfile, "id" | "createdAt" | "lastUsedAt"> {
  if (typeof input !== "object" || input === null)
    throw bad("Profile must be an object");
  const o = input as Record<string, unknown>;
  const environment = (o.environment ?? "development") as Environment;
  if (!ENVIRONMENTS.includes(environment))
    throw bad("environment must be development, test, staging or production");
  const name = text(o.name, "name", 80);
  if (!name) throw bad("name is required");
  const host = text(o.host, "host", 255) ?? "localhost";
  if (!validHost(host)) throw bad("host contains invalid characters");
  const out: Omit<RedisProfile, "id" | "createdAt" | "lastUsedAt"> = {
    name,
    engine: "redis",
    folder: text(o.folder, "folder", 80),
    tags: Array.isArray(o.tags)
      ? o.tags
          .map((t) => text(t, "tag", 40))
          .filter((t): t is string => !!t)
          .slice(0, 20)
      : [],
    favorite: Boolean(o.favorite),
    environment,
    readOnly: Boolean(o.readOnly),
    host,
  };
  if (o.port !== undefined && o.port !== "" && o.port !== null) {
    const port = Number(o.port);
    if (!validPort(port)) throw bad("port must be 1-65535");
    out.port = port;
  }
  out.user = text(o.user, "user", 128);
  if (o.dbIndex !== undefined && o.dbIndex !== "" && o.dbIndex !== null) {
    const n = Number(o.dbIndex);
    if (!Number.isInteger(n) || n < 0 || n > 15)
      throw bad("The database number must be 0 to 15");
    out.dbIndex = n;
  }
  const tls = o.tls;
  if (tls !== undefined && tls !== null) {
    if (typeof tls === "boolean") out.tls = tls;
    else if (typeof tls === "object") {
      const t = tls as Record<string, unknown>;
      out.tls = {
        ...(t.ca ? { ca: text(t.ca, "tls.ca", 100_000) } : {}),
        ...(t.verify === false ? { verify: false } : {}),
      };
    } else throw bad("tls must be on/off or an object");
  }
  out.keyPrefix = text(o.keyPrefix, "key prefix", 128);
  if (
    o.connectTimeoutMs !== undefined &&
    o.connectTimeoutMs !== "" &&
    o.connectTimeoutMs !== null
  ) {
    const ms = Number(o.connectTimeoutMs);
    if (!Number.isInteger(ms) || ms < 1000 || ms > 120_000)
      throw bad("connectTimeoutMs must be 1000-120000");
    out.connectTimeoutMs = ms;
  }
  if (existing && existing.engine !== "redis")
    throw bad("A profile's engine cannot be changed; create a new profile");
  return out;
}

function readJson(file: string): any {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  } catch {
    return null;
  }
}

function writeJson(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
  try {
    chmodSync(file, 0o600);
  } catch {}
}

/** Unified persistence store managing SQL profiles, Redis profiles, connection passwords, and Databases settings. */
export class DbStore {
  readonly sql: ProfileStore;
  private redis: RedisProfile[] = [];
  private redisLoaded = false;
  private settings: DbSettings | null = null;
  private readonly redisFile: string;
  private readonly settingsFile: string;

  /** Initializes a `DbStore` backed by JSON files in `dir` and the provided `SecretStore`. */
  constructor(
    readonly dir: string,
    readonly secrets: SecretStore,
  ) {
    this.sql = new ProfileStore(dir, secrets);
    this.redisFile = join(dir, "connections_redis.json");
    this.settingsFile = join(dir, "file_manager_databases.json");
  }

  /** Returns the active secret storage backend kind (`keychain`, `file`, or `memory`). */
  get secretKind() {
    return this.secrets.kind;
  }

  /* ---------------------------------------------------------------- settings */

  /** Loads (and caches) the persisted `DbSettings` from disk, falling back to `defaultSettings()`. */
  getSettings(): DbSettings {
    if (this.settings) return this.settings;
    const base = defaultSettings();
    const raw = readJson(this.settingsFile);
    if (raw && typeof raw === "object") {
      if (raw.detect && typeof raw.detect === "object") {
        base.detect.auto = raw.detect.auto !== false;
        base.detect.autoSave = raw.detect.autoSave === true;
      }
      for (const e of DB_ENGINES) {
        const s = raw.engines?.[e];
        if (s && typeof s === "object") {
          base.engines[e].useEnv = s.useEnv !== false;
          try {
            base.engines[e].defaults = sanitizeDefaults(s.defaults);
          } catch {
            base.engines[e].defaults = {};
          }
        }
      }
      if (Array.isArray(raw.dismissed))
        base.dismissed = raw.dismissed
          .filter(
            (x: unknown) =>
              typeof x === "string" && /^[a-z]+:[0-9a-f]{16}$/.test(x),
          )
          .slice(0, 200);
      if (raw.meta && typeof raw.meta === "object") {
        for (const [id, m] of Object.entries(raw.meta as Record<string, any>)) {
          if (
            m &&
            typeof m === "object" &&
            [
              "manual",
              "environment",
              "dotenv",
              "envfile",
              "url",
              "local",
            ].includes(m.source)
          ) {
            base.meta[id] = {
              source: m.source,
              variables: Array.isArray(m.variables)
                ? m.variables
                    .filter((v: unknown) => typeof v === "string")
                    .slice(0, 40)
                : undefined,
              slot: typeof m.slot === "string" ? m.slot : undefined,
              fingerprint:
                typeof m.fingerprint === "string" ? m.fingerprint : undefined,
              savedAt: String(m.savedAt ?? ""),
            };
          }
        }
      }
    }
    this.settings = base;
    return base;
  }

  /** Writes the current `DbSettings` state to `databases_settings.json`. */
  saveSettings() {
    writeJson(this.settingsFile, this.getSettings());
  }

  /** Updates `useEnv` and default connection fields for `engine` and persists the settings. */
  setEngineSettings(
    engine: DbEngine,
    change: { useEnv?: unknown; defaults?: unknown },
  ) {
    const s = this.getSettings().engines[engine];
    if (change.useEnv !== undefined) s.useEnv = change.useEnv === true;
    if (change.defaults !== undefined)
      s.defaults = sanitizeDefaults(change.defaults);
    this.saveSettings();
    return s;
  }

  /** Updates automatic environment connection detection preferences and persists the settings. */
  setDetect(change: { auto?: unknown; autoSave?: unknown }) {
    const s = this.getSettings();
    if (change.auto !== undefined) s.detect.auto = change.auto === true;
    if (change.autoSave !== undefined)
      s.detect.autoSave = change.autoSave === true;
    this.saveSettings();
    return s.detect;
  }

  /** Records a detected connection key in the dismissed list so it is hidden from future auto-detection. */
  dismiss(key: string) {
    const s = this.getSettings();
    if (!s.dismissed.includes(key)) s.dismissed.push(key);
    this.saveSettings();
  }

  /** Clears all dismissed environment connection keys and persists the updated settings. */
  undismissAll() {
    this.getSettings().dismissed = [];
    this.saveSettings();
  }

  /** Attaches or removes provenance `ProfileMeta` for a profile ID and persists the settings. */
  setMeta(id: string, meta: ProfileMeta | null) {
    const s = this.getSettings();
    if (meta) s.meta[id] = meta;
    else delete s.meta[id];
    this.saveSettings();
  }

  /* ---------------------------------------------------------------- profiles */

  private loadRedis() {
    if (this.redisLoaded) return;
    this.redisLoaded = true;
    const raw = readJson(this.redisFile);
    this.redis = Array.isArray(raw?.profiles) ? raw.profiles : [];
  }

  private persistRedis() {
    writeJson(this.redisFile, { version: 1, profiles: this.redis });
  }

  /** Looks up a saved SQL or Redis connection profile by ID. */
  get(id: string): DbProfile | undefined {
    this.loadRedis();
    return this.sql.get(id) ?? this.redis.find((p) => p.id === id);
  }

  private async decorate(p: DbProfile): Promise<PublicDbProfile> {
    const meta = this.getSettings().meta[p.id];
    return {
      ...p,
      hasPassword: (await this.secrets.get(p.id)) !== null,
      ...(meta ? { meta } : {}),
    };
  }

  /** The saved connections without looking at the keychain (no `hasPassword`). */
  listPlain(): DbProfile[] {
    this.loadRedis();
    return [...this.sql.listPlain(), ...this.redis];
  }

  /** Returns all saved SQL and Redis profiles enriched with `hasPassword` and `ProfileMeta`, sorted by recent use. */
  async list(): Promise<PublicDbProfile[]> {
    this.loadRedis();
    const all: DbProfile[] = [
      ...(await this.sql.list()).map(
        ({ hasPassword: _h, ...p }) => p as ConnectionProfile,
      ),
      ...this.redis,
    ];
    return Promise.all(all.map((p) => this.decorate(p)));
  }

  /** Create (no `id`) or update. `password`: text to store, "" to remove, undefined to leave it as it is. */
  async save(
    input: Record<string, unknown>,
    password: string | undefined,
    id?: string,
  ): Promise<PublicDbProfile> {
    this.loadRedis();
    if (
      password !== undefined &&
      (typeof password !== "string" || password.length > 1024)
    )
      throw bad("Invalid password");
    const engine = input.engine;
    if (!isEngine(engine))
      throw bad("engine must be sqlite, mysql, postgres or redis");
    if (engine !== "redis") {
      const saved = await this.sql.save(input, password, id);
      const { hasPassword: _h, ...p } = saved;
      return this.decorate(p as ConnectionProfile);
    }
    const existing = id ? this.redis.find((p) => p.id === id) : undefined;
    if (id && !existing) throw bad("Unknown connection profile");
    const clean = sanitizeRedisProfile(input, existing);
    let profile: RedisProfile;
    if (existing) {
      profile = { ...existing, ...clean };
      if (clean.tls === undefined) delete profile.tls;
      this.redis[this.redis.indexOf(existing)] = profile;
    } else {
      profile = {
        ...clean,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      this.redis.push(profile);
    }
    if (password !== undefined) {
      if (password === "") await this.secrets.delete(profile.id);
      else await this.secrets.set(profile.id, password);
    }
    this.persistRedis();
    return this.decorate(profile);
  }

  /** Deletes a saved SQL or Redis profile along with its stored password and metadata. */
  async remove(id: string): Promise<void> {
    this.loadRedis();
    const i = this.redis.findIndex((p) => p.id === id);
    if (i >= 0) {
      this.redis.splice(i, 1);
      await this.secrets.delete(id);
      this.persistRedis();
    } else await this.sql.remove(id);
    this.setMeta(id, null);
  }

  /** Creates a copy of an existing SQL or Redis profile, optionally copying its stored password. */
  async duplicate(id: string, copyPassword: boolean): Promise<PublicDbProfile> {
    this.loadRedis();
    const redis = this.redis.find((p) => p.id === id);
    if (!redis) {
      const copy = await this.sql.duplicate(id, copyPassword);
      const { hasPassword: _h, ...p } = copy;
      return this.decorate(p as ConnectionProfile);
    }
    const copy: RedisProfile = {
      ...redis,
      id: randomUUID(),
      name: `${redis.name} (copy)`.slice(0, 80),
      createdAt: new Date().toISOString(),
      lastUsedAt: undefined,
      favorite: false,
    };
    this.redis.push(copy);
    const pw = copyPassword ? await this.secrets.get(id) : null;
    if (pw !== null) await this.secrets.set(copy.id, pw);
    this.persistRedis();
    return this.decorate(copy);
  }

  /** The saved password, for starting a studio or testing. It goes to a child process or a driver, never to the page. */
  async password(id: string): Promise<string | null> {
    return this.secrets.get(id);
  }

  /** Deletes the stored password for the specified connection profile ID. */
  async clearPassword(id: string): Promise<void> {
    if (!this.get(id)) throw bad("Unknown connection profile");
    await this.secrets.delete(id);
  }

  /** Updates the `lastUsedAt` timestamp for a SQL or Redis profile to the current time. */
  markUsed(id: string) {
    this.loadRedis();
    const r = this.redis.find((p) => p.id === id);
    if (r) {
      r.lastUsedAt = new Date().toISOString();
      this.persistRedis();
    } else this.sql.markUsed(id);
  }
}
