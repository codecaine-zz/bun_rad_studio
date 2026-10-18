/**
 * What the File Manager knows about the four database engines it can open: how each studio is started, which
 * environment variables each studio reads, and how connection addresses (mysql://, postgres://, redis://, sqlite:/...)
 * are understood. Everything here is pure (no files, no network), so it can be tested exhaustively.
 */
import { createHash } from "crypto";

export type DbEngine = "sqlite" | "mysql" | "postgres" | "redis";
export const DB_ENGINES: DbEngine[] = ["sqlite", "mysql", "postgres", "redis"];

export interface EngineInfo {
  id: DbEngine;
  label: string;
  icon: string;
  /** The studio's file name in applications/ (and, with dashes, in release bundles). */
  script: string;
  defaultPort?: number;
  studioName: string;
}

export const ENGINES: Record<DbEngine, EngineInfo> = {
  sqlite: { id: "sqlite", label: "SQLite", icon: "🪶", script: "sqlite_studio", studioName: "SQLite Studio" },
  mysql: { id: "mysql", label: "MySQL / MariaDB", icon: "🐬", script: "mysql_studio", defaultPort: 3306, studioName: "MySQL Studio" },
  postgres: { id: "postgres", label: "PostgreSQL", icon: "🐘", script: "postgres_studio", defaultPort: 5432, studioName: "PostgreSQL Studio" },
  redis: { id: "redis", label: "Redis", icon: "🧰", script: "redis_studio", defaultPort: 6379, studioName: "Redis Studio" },
};

export const isEngine = (v: unknown): v is DbEngine => typeof v === "string" && (DB_ENGINES as string[]).includes(v);

export type FieldName = "host" | "port" | "user" | "password" | "database" | "schema" | "tls" | "path" | "dbIndex";

/**
 * The variables each studio reads, per field, in the order the studio looks at them (first one that is set wins).
 * Derived from the studios' own start-up code (applications/*_studio*.ts); `url` overrides the single fields, as it does there.
 */
export const STUDIO_ENV: Record<DbEngine, Partial<Record<FieldName | "url", string[]>>> = {
  sqlite: { path: ["SQLITE_STUDIO_DB", "SQLITE_DB_PATH"] },
  mysql: {
    host: ["MSQL_HOST", "MYSQL_HOST", "DB_HOST"],
    port: ["MSQL_PORT", "MYSQL_PORT", "DB_PORT"],
    user: ["MSQL_USER", "MYSQL_USER", "DB_USER"],
    password: ["MSQL_PASSWORD", "MYSQL_PASSWORD", "DB_PASSWORD"],
    database: ["MSQL_NAME", "MSQL_DATABASE", "MSQL_DB", "MYSQL_DATABASE", "MYSQL_DB_PATH", "DB_NAME"],
    tls: ["MSQL_TLS", "MYSQL_TLS"],
    url: ["MSQL_URL", "DATABASE_URL"],
  },
  postgres: {
    host: ["PG_HOST", "POSTGRES_HOST", "DB_HOST"],
    port: ["PG_PORT", "POSTGRES_PORT", "DB_PORT"],
    user: ["PG_USER", "POSTGRES_USER", "DB_USER"],
    password: ["PG_PASSWORD", "POSTGRES_PASSWORD", "DB_PASSWORD"],
    database: ["PG_DATABASE", "PG_NAME", "PG_DB", "POSTGRES_DB", "DB_NAME"],
    schema: ["PG_SCHEMA"],
    tls: ["PG_TLS", "PG_SSL"],
    url: ["PG_URL", "DATABASE_URL"],
  },
  redis: { url: ["REDIS_URL"], dbIndex: ["REDIS_DB"] },
};

/** More names that mean the same thing in other tools. They are noticed (and removed from a studio's environment) but the studios don't read them. */
export const OTHER_ENV: Record<DbEngine, Partial<Record<FieldName | "url", string[]>>> = {
  sqlite: { path: ["SQLITE_PATH", "SQLITE_DB", "SQLITE_DATABASE", "SQLITE_FILE", "DB_PATH", "DATABASE_PATH"] },
  mysql: {
    host: ["MARIADB_HOST", "MYSQL_ADDRESS"],
    port: ["MARIADB_PORT", "MYSQL_TCP_PORT"],
    user: ["MARIADB_USER"],
    password: ["MARIADB_PASSWORD", "MARIADB_ROOT_PASSWORD", "MYSQL_PWD", "MYSQL_ROOT_PASSWORD"],
    database: ["MARIADB_DATABASE", "MYSQL_STUDIO_DB"],
    tls: ["MARIADB_TLS", "MARIADB_SSL", "MYSQL_SSL"],
    url: ["MYSQL_URL", "MARIADB_URL"],
  },
  postgres: {
    host: ["PGHOST", "PGHOSTADDR"],
    port: ["PGPORT"],
    user: ["PGUSER"],
    password: ["PGPASSWORD"],
    database: ["PGDATABASE", "PG_STUDIO_DB", "PG_DB_PATH"],
    tls: ["PGSSLMODE"],
    url: ["POSTGRES_URL", "POSTGRESQL_URL", "PGURL"],
  },
  redis: {
    url: ["VALKEY_URL"],
    host: ["REDIS_HOST", "REDIS_ADDR", "VALKEY_HOST"],
    port: ["REDIS_PORT", "VALKEY_PORT"],
    user: ["REDIS_USERNAME", "REDIS_USER"],
    password: ["REDIS_PASSWORD", "REDIS_PASS", "REDISCLI_AUTH", "VALKEY_PASSWORD"],
    tls: ["REDIS_TLS", "REDIS_SSL"],
  },
};

/** Variables that steer a studio's start-up rather than its connection; a studio started by the File Manager never inherits them. */
export const CONTROL_ENV = ["PORT", "PG_STUDIO_PORT", "STUDIO_WORKER", "STUDIO_PARENT_PID", "STUDIO_EXPORT_DIR"];

/** Prefixes of the File Manager's own settings, which no studio gets. */
export const PRIVATE_ENV_PREFIXES = ["FM_", "FILE_MANAGER_"];

const PREFIXES: Record<DbEngine, RegExp> = {
  sqlite: /^SQLITE_/,
  mysql: /^(MSQL|MYSQL|MARIADB)_/,
  postgres: /^(PG|POSTGRES|POSTGRESQL)_/,
  redis: /^(REDIS|VALKEY)_/,
};

const PG_LIBPQ = new Set(["PGHOST", "PGHOSTADDR", "PGPORT", "PGUSER", "PGPASSWORD", "PGPASSFILE", "PGSERVICE", "PGSERVICEFILE", "PGDATABASE", "PGSSLMODE", "PGSSLCERT", "PGSSLKEY", "PGSSLROOTCERT", "PGSSLCRL", "PGOPTIONS", "PGCONNECT_TIMEOUT", "PGAPPNAME", "PGCHANNELBINDING", "PGREQUIREAUTH", "PGTARGETSESSIONATTRS"]);

/** Names MySQL and PostgreSQL setups both use, so a name alone doesn't say which one it is for. */
export const GENERIC_ENV = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_DATABASE", "DB_URL", "DATABASE_URL", "TLS_DATABASE_URL"];

/** Every exact name that can carry a connection setting for `engine`. */
export function engineVariableNames(engine: DbEngine): string[] {
  const names = new Set<string>();
  for (const group of [STUDIO_ENV[engine], OTHER_ENV[engine]]) for (const list of Object.values(group)) for (const n of list ?? []) names.add(n);
  if (engine === "mysql" || engine === "postgres") for (const n of GENERIC_ENV) names.add(n);
  return [...names];
}

/** Does this variable name carry a connection setting for `engine`? */
export function isEngineVariable(engine: DbEngine, name: string): boolean {
  return engineVariableNames(engine).includes(name) || PREFIXES[engine].test(name) || (engine === "postgres" && PG_LIBPQ.has(name));
}

/** True when `name` is a connection setting for any of the engines. */
export const isAnyConnectionVariable = (name: string) => DB_ENGINES.some((e) => isEngineVariable(e, name));

/** The variables a studio started from a profile must never see (all engines: a profile is then the only source). */
export function isScrubbedVariable(name: string): boolean {
  return isAnyConnectionVariable(name) || CONTROL_ENV.includes(name) || PRIVATE_ENV_PREFIXES.some((p) => name.startsWith(p));
}

/* ------------------------------------------------------------------ hosts, ports, names */

export const HOST_PATTERN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?|[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]+)$/;
export const validHost = (h: string) => h.length > 0 && h.length <= 255 && HOST_PATTERN.test(h);
export const validPort = (p: number) => Number.isInteger(p) && p >= 1 && p <= 65535;
export const isLoopbackHost = (h: string) => /^(localhost|127(\.\d{1,3}){3}|::1)$/i.test(h);

/* ------------------------------------------------------------------ connection addresses */

export interface ParsedConnectionUrl {
  engine: DbEngine;
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  schema?: string;
  tls?: boolean;
  path?: string;
  sqliteMode?: "memory";
  dbIndex?: number;
  connectTimeoutMs?: number;
  /** Kept apart from the fields: callers send it to the keychain and never echo it. */
  password?: string;
  /** Plain-words remarks about parts that were understood only partly or ignored. They never contain values. */
  notes: string[];
}

export type UrlResult = { ok: true; value: ParsedConnectionUrl } | { ok: false; error: string };

const SCHEMES: Record<string, { engine: DbEngine; tls?: boolean }> = {
  mysql: { engine: "mysql" },
  mariadb: { engine: "mysql" },
  postgres: { engine: "postgres" },
  postgresql: { engine: "postgres" },
  redis: { engine: "redis" },
  rediss: { engine: "redis", tls: true },
  sqlite: { engine: "sqlite" },
  sqlite3: { engine: "sqlite" },
  file: { engine: "sqlite" },
};

/** The engine an address belongs to by its scheme, or null (used to attribute DATABASE_URL). */
export function engineOfScheme(text: string): DbEngine | null {
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(text.trim());
  return m ? SCHEMES[m[1]!.toLowerCase()]?.engine ?? null : null;
}

const fail = (error: string): UrlResult => ({ ok: false, error });

function decode(part: string, what: string): string | { error: string } {
  try {
    return decodeURIComponent(part);
  } catch {
    return { error: `The ${what} contains a % that isn't a valid code. Write special characters as %XX.` };
  }
}

const TRUE = new Set(["true", "1", "yes", "on", "required", "require"]);

/** Understands mysql://, mariadb://, postgres://, postgresql://, redis://, rediss://, sqlite:/path, file:///path and a plain absolute path. */
export function parseConnectionUrl(input: unknown): UrlResult {
  if (typeof input !== "string") return fail("Paste a connection address.");
  const text = input.trim();
  if (!text) return fail("Paste a connection address.");
  if (text.length > 2048) return fail("That address is too long.");
  if (/[\u0000-\u001f\u007f]/.test(text)) return fail("A connection address can't contain control characters.");

  // A bare absolute path means an SQLite file (its folder names may contain spaces).
  if (/^(\/|[A-Za-z]:[\\/])/.test(text)) return { ok: true, value: { engine: "sqlite", path: text, notes: [] } };

  const m = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/s.exec(text);
  if (!m) return fail("That doesn't look like a connection address. Start with mysql://, postgres://, redis://, sqlite: or a full file path.");
  const scheme = SCHEMES[m[1]!.toLowerCase()];
  if (!scheme) return fail(`"${m[1]!.slice(0, 20)}" isn't a kind of database address this app knows. Use mysql://, mariadb://, postgres://, postgresql://, redis://, rediss:// or sqlite:.`);
  const rest = m[2]!;
  const notes: string[] = [];
  if (scheme.engine !== "sqlite" && /\s/.test(text)) return fail("A connection address can't contain spaces. Write them as %20.");

  if (scheme.engine === "sqlite") return parseSqlite(rest);

  if (!rest.startsWith("//")) return fail(`After ${m[1]}: there should be // and then the server, like ${m[1]}://localhost/name.`);
  const body = rest.slice(2);
  const authEnd = body.search(/[/?#]/);
  const authority = authEnd < 0 ? body : body.slice(0, authEnd);
  let tail = authEnd < 0 ? "" : body.slice(authEnd);
  const hash = tail.indexOf("#");
  if (hash >= 0) tail = tail.slice(0, hash);
  const q = tail.indexOf("?");
  const pathPart = q < 0 ? tail : tail.slice(0, q);
  const query = q < 0 ? "" : tail.slice(q + 1);

  const out: ParsedConnectionUrl = { engine: scheme.engine, notes };
  const at = authority.lastIndexOf("@");
  const userinfo = at >= 0 ? authority.slice(0, at) : "";
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  if (at >= 0) {
    const colon = userinfo.indexOf(":");
    const rawUser = colon < 0 ? userinfo : userinfo.slice(0, colon);
    const rawPass = colon < 0 ? undefined : userinfo.slice(colon + 1);
    if (rawUser) {
      const u = decode(rawUser, "user name");
      if (typeof u !== "string") return fail(u.error);
      if (u.length > 128 || u.includes("\0")) return fail("The user name is too long.");
      out.user = u;
    }
    if (rawPass !== undefined && rawPass !== "") {
      const p = decode(rawPass, "password");
      if (typeof p !== "string") return fail(p.error);
      if (p.length > 1024) return fail("The password in the address is too long.");
      out.password = p;
    }
  }
  const hp = /^(\[[^\]]*\]|[^:\[\]]*)(?::(.*))?$/.exec(hostPort);
  if (!hp) return fail("The server part of the address isn't valid.");
  let host = hp[1] ?? "";
  if (host.startsWith("[")) host = host.slice(1, -1);
  if (host) {
    if (!validHost(host)) return fail("The server name has characters that aren't allowed in a host name.");
    out.host = host.toLowerCase();
  }
  if (hp[2] !== undefined && hp[2] !== "") {
    if (!/^\d{1,5}$/.test(hp[2])) return fail("The port must be a number from 1 to 65535.");
    const port = Number(hp[2]);
    if (!validPort(port)) return fail("The port must be a number from 1 to 65535.");
    out.port = port;
  }

  const seg = pathPart.replace(/^\//, "");
  if (seg) {
    const d = decode(seg, "database name");
    if (typeof d !== "string") return fail(d.error);
    if (scheme.engine === "redis") {
      if (!/^\d{1,2}$/.test(d) || Number(d) > 15) return fail("A Redis address ends with the database number, 0 to 15, like redis://host:6379/2.");
      out.dbIndex = Number(d);
    } else {
      if (d.includes("/")) return fail("The database name can't contain a slash.");
      if (d.length > 128 || d.includes("\0")) return fail("The database name is too long.");
      out.database = d;
    }
  }
  if (scheme.tls) out.tls = true;

  const ignored: string[] = [];
  for (const pair of query ? query.split("&") : []) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = (eq < 0 ? pair : pair.slice(0, eq)).toLowerCase();
    const rawValue = eq < 0 ? "" : pair.slice(eq + 1);
    const dv = decode(rawValue.replace(/\+/g, " "), `"${key.slice(0, 20)}" setting`);
    if (typeof dv !== "string") return fail(dv.error);
    const value = dv;
    if (key === "sslmode") {
      const v = value.toLowerCase();
      if (v === "disable") out.tls = false;
      else if (["require", "verify-ca", "verify-full"].includes(v)) {
        out.tls = true;
        if (v === "require") notes.push("sslmode=require was read as TLS on with the certificate checked (stricter than PostgreSQL's own meaning).");
      } else notes.push(`sslmode=${v.slice(0, 20)} isn't supported and was ignored. Choose TLS on or off yourself.`);
    } else if (["ssl", "tls", "usessl", "secure"].includes(key)) out.tls = TRUE.has(value.toLowerCase());
    else if (key === "schema" || key === "currentschema") {
      if (value && value.length <= 128) out.schema = value;
    } else if (key === "connect_timeout" || key === "connecttimeout") {
      const s = Number(value);
      if (Number.isFinite(s) && s >= 1 && s <= 120) out.connectTimeoutMs = Math.round(s * 1000);
    } else if (key === "db" && scheme.engine === "redis") {
      if (!/^\d{1,2}$/.test(value) || Number(value) > 15) return fail("The db setting must be a number from 0 to 15.");
      out.dbIndex = Number(value);
    } else if (key === "user" || key === "username") {
      if (!out.user && value) out.user = value.slice(0, 128);
    } else if (key === "password" || key === "pwd") {
      if (out.password === undefined && value) out.password = value.slice(0, 1024);
    } else ignored.push(key.slice(0, 30));
  }
  if (ignored.length) notes.push(`Ignored settings: ${[...new Set(ignored)].slice(0, 8).join(", ")}.`);
  return { ok: true, value: out };
}

function parseSqlite(rest: string): UrlResult {
  const notes: string[] = [];
  let p = rest;
  const q = p.search(/[?#]/);
  if (q >= 0) {
    p = p.slice(0, q);
    notes.push("The settings after ? were ignored.");
  }
  if (/^\/\/[A-Za-z]:[\\/]/.test(p)) {
    p = p.slice(2);
  } else if (p.startsWith("//")) {
    const slash = p.indexOf("/", 2);
    const host = slash < 0 ? p.slice(2) : p.slice(2, slash);
    if (host && host.toLowerCase() !== "localhost") return fail("An SQLite address names a file on this computer, like sqlite:///Users/you/data.db.");
    p = slash < 0 ? "" : p.slice(slash);
  }
  const d = decode(p, "file path");
  if (typeof d !== "string") return fail(d.error);
  const path = /^\/[A-Za-z]:[\\/]/.test(d) ? d.slice(1) : d;
  if (path === ":memory:" || path === "/:memory:") return { ok: true, value: { engine: "sqlite", path: ":memory:", sqliteMode: "memory", notes } };
  if (!path || path.includes("\0") || path.length > 1024) return fail("The file path is missing or too long.");
  if (!/^(\/|[A-Za-z]:[\\/])/.test(path)) return fail("Use a full path, like sqlite:///Users/you/data.db. A short name like data.db doesn't say where the file is.");
  return { ok: true, value: { engine: "sqlite", path, notes } };
}

/** The same address with the password hidden, for showing. */
export function maskUrl(text: string): string {
  return text.replace(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/[^:/@?#\s]*:)[^@/?#\s]*@/, "$1••••@").replace(/([?&](?:password|pwd)=)[^&#]*/gi, "$1••••");
}

/* ------------------------------------------------------------------ fingerprints */

export interface FingerprintParts {
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  path?: string;
  dbIndex?: number;
}

/** A short stable id of where a connection goes (never of its password), used to notice duplicates. */
export function connectionFingerprint(engine: DbEngine, f: FingerprintParts): string {
  const info = ENGINES[engine];
  const parts = engine === "sqlite"
    ? [engine, f.path ?? ""]
    : [engine, (f.host || "localhost").toLowerCase(), String(f.port ?? info.defaultPort ?? ""), f.user ?? "", engine === "redis" ? String(f.dbIndex ?? 0) : f.database ?? ""];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}
