import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import type { ConnectionConfig, Engine } from "./types";
import { DbError } from "./errors";

export type Environment = "development" | "test" | "staging" | "production";

export interface ConnectionProfile {
  id: string;
  name: string;
  engine: Engine;
  folder?: string;
  tags: string[];
  favorite: boolean;
  environment: Environment;
  readOnly: boolean;
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  schema?: string;
  tls?: boolean | { ca?: string; verify?: boolean };
  /** SQLite file path (or ":memory:"). */
  path?: string;
  sqliteMode?: "readwrite" | "readonly" | "create" | "memory";
  /** Name of an environment variable holding the password (alternative to the OS keychain). */
  passwordEnv?: string;
  statementTimeoutMs?: number;
  /** How long to wait for the server when connecting, in ms. */
  connectTimeoutMs?: number;
  allowPublicKeyRetrieval?: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

/** A profile as shown to the browser: never carries a password, only whether one is stored. */
export type PublicProfile = ConnectionProfile & { hasPassword: boolean };

export interface SecretStore {
  readonly kind: "os-keychain" | "memory";
  get(profileId: string): Promise<string | null>;
  set(profileId: string, password: string): Promise<void>;
  delete(profileId: string): Promise<void>;
}

const SERVICE = "bun-rad-studio.database";

/** Stores passwords in the OS credential store (Keychain / Credential Manager / libsecret) via Bun.secrets. */
export class KeychainSecretStore implements SecretStore {
  readonly kind = "os-keychain" as const;
  constructor(private readonly service = SERVICE) {}
  async get(id: string) {
    return (await Bun.secrets.get({ service: this.service, name: id })) ?? null;
  }
  async set(id: string, password: string) {
    await Bun.secrets.set({ service: this.service, name: id, value: password });
  }
  async delete(id: string) {
    await Bun.secrets.delete({ service: this.service, name: id });
  }
}

/** Process-lifetime only: used when the OS credential store is unavailable. Nothing is written to disk. */
export class MemorySecretStore implements SecretStore {
  readonly kind = "memory" as const;
  private readonly map = new Map<string, string>();
  async get(id: string) {
    return this.map.get(id) ?? null;
  }
  async set(id: string, password: string) {
    this.map.set(id, password);
  }
  async delete(id: string) {
    this.map.delete(id);
  }
}

/** Use the OS credential store when it works, otherwise the in-memory store (and say so). */
export async function detectSecretStore(service = SERVICE): Promise<SecretStore> {
  try {
    const probe = `probe-${randomUUID()}`;
    await Bun.secrets.set({ service, name: probe, value: "x" });
    const ok = (await Bun.secrets.get({ service, name: probe })) === "x";
    await Bun.secrets.delete({ service, name: probe });
    if (ok) return new KeychainSecretStore(service);
  } catch {}
  return new MemorySecretStore();
}

export function defaultProfileDir(): string {
  return process.env.STUDIO_DB_PROFILE_DIR || join(homedir(), ".bun_rad_studio");
}

const ENVIRONMENTS: Environment[] = ["development", "test", "staging", "production"];
const bad = (m: string) => new DbError("INVALID_REQUEST", m);
const str = (v: unknown, field: string, max: number, required = false): string | undefined => {
  if (v === undefined || v === null || v === "") {
    if (required) throw bad(`${field} is required`);
    return undefined;
  }
  if (typeof v !== "string" || v.length > max || v.includes("\0")) throw bad(`${field} must be text up to ${max} characters`);
  return v;
};

/** Validate untrusted profile input (ids, timestamps and passwords are never taken from it). */
export function sanitizeProfileInput(input: unknown, existing?: ConnectionProfile): Omit<ConnectionProfile, "id" | "createdAt" | "lastUsedAt"> {
  if (typeof input !== "object" || input === null) throw bad("Profile must be an object");
  const o = input as Record<string, unknown>;
  const engine = o.engine;
  if (engine !== "sqlite" && engine !== "mysql" && engine !== "postgres") throw bad("engine must be sqlite, mysql or postgres");
  const environment = (o.environment ?? "development") as Environment;
  if (!ENVIRONMENTS.includes(environment)) throw bad("environment must be development, test, staging or production");
  const tags = Array.isArray(o.tags) ? o.tags.map((t) => str(t, "tag", 40, true)!).slice(0, 20) : [];
  const out: Omit<ConnectionProfile, "id" | "createdAt" | "lastUsedAt"> = {
    name: str(o.name, "name", 80, true)!,
    engine,
    folder: str(o.folder, "folder", 80),
    tags,
    favorite: Boolean(o.favorite),
    environment,
    readOnly: Boolean(o.readOnly),
  };
  if (engine === "sqlite") {
    const mode = (o.sqliteMode ?? "readwrite") as string;
    if (!["readwrite", "readonly", "create", "memory"].includes(mode)) throw bad("Invalid SQLite mode");
    out.sqliteMode = mode as ConnectionProfile["sqliteMode"];
    out.path = mode === "memory" ? ":memory:" : str(o.path, "path", 1024, true);
    if (mode === "readonly") out.readOnly = true;
  } else {
    out.host = str(o.host, "host", 255) ?? "localhost";
    if (!/^[A-Za-z0-9._:\-\[\]]+$/.test(out.host)) throw bad("host contains invalid characters");
    const port = o.port === undefined || o.port === "" ? undefined : Number(o.port);
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) throw bad("port must be 1-65535");
    out.port = port;
    out.user = str(o.user, "user", 128);
    out.database = str(o.database, "database", 128);
    out.schema = str(o.schema, "schema", 128);
    const tls = o.tls;
    if (tls !== undefined && tls !== null) {
      if (typeof tls === "boolean") out.tls = tls;
      else if (typeof tls === "object") {
        const t = tls as Record<string, unknown>;
        out.tls = { ...(t.ca ? { ca: str(t.ca, "tls.ca", 100_000) } : {}), ...(t.verify === false ? { verify: false } : {}) };
      } else throw bad("tls must be boolean or an object");
    }
    out.passwordEnv = str(o.passwordEnv, "passwordEnv", 128);
    if (out.passwordEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(out.passwordEnv)) throw bad("passwordEnv must be an environment variable name");
    if (o.statementTimeoutMs !== undefined && o.statementTimeoutMs !== "") {
      const ms = Number(o.statementTimeoutMs);
      if (!Number.isInteger(ms) || ms < 0 || ms > 3_600_000) throw bad("statementTimeoutMs must be 0-3600000");
      out.statementTimeoutMs = ms;
    }
    if (o.connectTimeoutMs !== undefined && o.connectTimeoutMs !== "") {
      const ms = Number(o.connectTimeoutMs);
      if (!Number.isInteger(ms) || ms < 1000 || ms > 120_000) throw bad("connectTimeoutMs must be 1000-120000");
      out.connectTimeoutMs = ms;
    }
    if (o.allowPublicKeyRetrieval) out.allowPublicKeyRetrieval = true;
  }
  if (existing && existing.engine !== out.engine) throw bad("A profile's engine cannot be changed; create a new profile");
  return out;
}

/** Profile metadata on disk (mode 0600). Passwords never live here: see `SecretStore`. */
export class ProfileStore {
  private profiles: ConnectionProfile[] = [];
  private loaded = false;
  readonly file: string;

  constructor(
    dir: string = defaultProfileDir(),
    private readonly secrets: SecretStore,
  ) {
    this.file = join(dir, "connections.json");
  }

  get secretStoreKind() {
    return this.secrets.kind;
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, "utf8"));
        if (Array.isArray(parsed?.profiles)) this.profiles = parsed.profiles;
      }
    } catch {
      this.profiles = [];
    }
  }

  private persist() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, profiles: this.profiles }, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    try {
      chmodSync(this.file, 0o600);
    } catch {}
  }

  private async pub(p: ConnectionProfile): Promise<PublicProfile> {
    return { ...p, hasPassword: Boolean(p.passwordEnv) || (await this.secrets.get(p.id)) !== null };
  }

  async list(): Promise<PublicProfile[]> {
    this.load();
    return Promise.all(this.profiles.map((p) => this.pub(p)));
  }

  /** The profiles without checking the keychain for passwords. */
  listPlain(): ConnectionProfile[] {
    this.load();
    return [...this.profiles];
  }

  get(id: string): ConnectionProfile | undefined {
    this.load();
    return this.profiles.find((p) => p.id === id);
  }

  /** Create (no id) or update (existing id). `password`: string to store, "" to clear, undefined to keep. */
  async save(input: unknown, password?: string, id?: string): Promise<PublicProfile> {
    this.load();
    const existing = id ? this.get(id) : undefined;
    if (id && !existing) throw new DbError("INVALID_REQUEST", "Unknown connection profile");
    const clean = sanitizeProfileInput(input, existing);
    if (password !== undefined && (typeof password !== "string" || password.length > 1024)) throw bad("Invalid password");
    let profile: ConnectionProfile;
    if (existing) {
      profile = { ...existing, ...clean };
      this.profiles[this.profiles.indexOf(existing)] = profile;
    } else {
      profile = { ...clean, id: randomUUID(), createdAt: new Date().toISOString() };
      this.profiles.push(profile);
    }
    if (password !== undefined) {
      if (password === "") await this.secrets.delete(profile.id);
      else await this.secrets.set(profile.id, password);
    }
    this.persist();
    return this.pub(profile);
  }

  async remove(id: string): Promise<void> {
    this.load();
    const i = this.profiles.findIndex((p) => p.id === id);
    if (i < 0) throw new DbError("INVALID_REQUEST", "Unknown connection profile");
    this.profiles.splice(i, 1);
    await this.secrets.delete(id);
    this.persist();
  }

  /** `copyPassword: false` leaves the copy without a saved password. */
  async duplicate(id: string, copyPassword = true): Promise<PublicProfile> {
    this.load();
    const src = this.get(id);
    if (!src) throw new DbError("INVALID_REQUEST", "Unknown connection profile");
    const copy: ConnectionProfile = { ...src, id: randomUUID(), name: `${src.name} (copy)`.slice(0, 80), createdAt: new Date().toISOString(), lastUsedAt: undefined, favorite: false };
    this.profiles.push(copy);
    const pw = copyPassword ? await this.secrets.get(id) : null;
    if (pw !== null) await this.secrets.set(copy.id, pw);
    this.persist();
    return this.pub(copy);
  }

  markUsed(id: string) {
    const p = this.get(id);
    if (!p) return;
    p.lastUsedAt = new Date().toISOString();
    this.persist();
  }

  /** Recently used profiles, newest first. */
  async recent(limit = 5): Promise<PublicProfile[]> {
    return (await this.list())
      .filter((p) => p.lastUsedAt)
      .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""))
      .slice(0, limit);
  }

  /** Build the adapter config, fetching the password from the keychain / environment (never from the file). */
  async resolveConfig(id: string, passwordOverride?: string): Promise<ConnectionConfig> {
    const p = this.get(id);
    if (!p) throw new DbError("INVALID_REQUEST", "Unknown connection profile");
    return profileToConfig(p, passwordOverride ?? (p.passwordEnv ? process.env[p.passwordEnv] : undefined) ?? (await this.secrets.get(id)) ?? undefined);
  }
}

export function profileToConfig(p: ConnectionProfile, password?: string): ConnectionConfig {
  if (p.engine === "sqlite") {
    return { engine: "sqlite", path: p.path, sqliteMode: p.sqliteMode, readOnly: p.readOnly };
  }
  return {
    engine: p.engine,
    host: p.host,
    port: p.port,
    user: p.user,
    password,
    database: p.database,
    schema: p.schema,
    tls: p.tls,
    readOnly: p.readOnly,
    statementTimeoutMs: p.statementTimeoutMs,
    connectTimeoutMs: p.connectTimeoutMs,
    allowPublicKeyRetrieval: p.allowPublicKeyRetrieval,
  };
}
