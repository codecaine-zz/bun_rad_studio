/**
 * The precedence rule, in one place:
 *
 *     connection chosen in the File Manager  >  the File Manager's defaults for that engine
 *       >  environment variables (real ones and `.env` files Bun loaded)  >  the studio's built-in defaults
 *
 * `resolveConnection` works out every value and where it came from (for the "Effective settings" panel) and
 * `buildLaunch` turns the same answer into the environment, arguments and folder a studio is started with. Because
 * both come from one function, what the panel says is what the studio gets.
 */
import { provenanceText, type EnvView, type Provenance } from "./fmDbEnvView";
import { readEnvFields } from "./fmDbDetect";
import { ENGINES, PRIVATE_ENV_PREFIXES, CONTROL_ENV, isEngineVariable, isScrubbedVariable, type DbEngine, type FieldName } from "./fmDbModel";
import type { DbProfile, EngineSettings, ProfileMeta, RedisProfile } from "./fmDbStore";
import type { ConnectionProfile } from "../../db/profiles";

export type SourceKind = "profile" | "defaults" | "env" | "builtin" | "none";

export interface Source {
  kind: SourceKind;
  /** Plain words: "this connection", "environment variable MSQL_HOST", "`.env` in the application folder (~/app), variable X" ... */
  text: string;
  /** The variable name, for an environment source. */
  name?: string;
  prov?: Provenance;
}

export interface Resolved {
  engine: DbEngine;
  /** profile: a saved connection; defaults: no connection but File Manager defaults; environment: the studio is left to read the environment itself, as before; builtin: nothing at all. */
  mode: "profile" | "defaults" | "environment" | "builtin";
  values: { host?: string; port?: number; user?: string; password?: string; database?: string; schema?: string; tls?: boolean; path?: string; dbIndex?: number };
  sources: Partial<Record<FieldName, Source>>;
  /** Connection variables that are set but not used (names and where they are). */
  ignored: Array<{ name: string; origin: string }>;
  notes: string[];
  warnings: string[];
}

const BUILTIN: Record<DbEngine, Resolved["values"]> = {
  sqlite: { path: ":memory:" },
  mysql: { host: "localhost", port: 3306, user: "root", database: "my_app_dev", tls: false },
  postgres: { host: "localhost", port: 5432, user: "postgres", database: "mydb", schema: "public", tls: false },
  redis: { host: "127.0.0.1", port: 6379, dbIndex: 0, tls: false },
};

export const FIELD_ORDER: Record<DbEngine, FieldName[]> = {
  sqlite: ["path"],
  mysql: ["host", "port", "user", "password", "database", "tls"],
  postgres: ["host", "port", "user", "password", "database", "schema", "tls"],
  redis: ["host", "port", "user", "password", "dbIndex", "tls"],
};

const profileTls = (p: DbProfile): boolean | undefined => (p.tls === undefined ? undefined : p.tls === false ? false : true);

function fromProfile(p: DbProfile): Resolved["values"] {
  if (p.engine === "sqlite") return { path: (p as ConnectionProfile).path };
  if (p.engine === "redis") {
    const r = p as RedisProfile;
    return { host: r.host, port: r.port, user: r.user, dbIndex: r.dbIndex, tls: profileTls(r) };
  }
  const c = p as ConnectionProfile;
  return { host: c.host, port: c.port, user: c.user, database: c.database, schema: c.schema, tls: profileTls(c) };
}

export interface ResolveInput {
  engine: DbEngine;
  profile?: DbProfile | null;
  /** The profile's saved password (kept on the server). */
  password?: string | null;
  settings: EngineSettings;
  view: EnvView;
}


export function resolveConnection(input: ResolveInput): Resolved {
  const { engine, profile, settings, view } = input;
  const defaults = settings.defaults;
  const hasDefaults = Object.keys(defaults).length > 0;
  const mode: Resolved["mode"] = profile ? "profile" : hasDefaults ? "defaults" : settings.useEnv ? "environment" : "builtin";
  const values: Resolved["values"] = {};
  const sources: Resolved["sources"] = {};
  const warnings: string[] = [];
  const notes: string[] = [];
  const own = profile ? fromProfile(profile) : {};
  const useDefaults = engine !== "sqlite";
  // Started with no connection and no defaults, the studio is left to read the environment itself, and Bun gives it the `.env` files of its start folder.
  const childLoads = mode === "environment" ? (p: Provenance) => p.where === "start" || p.where === "application" : undefined;
  const env = settings.useEnv ? readEnvFields(engine, view, { studioOnly: true, loadedOnly: true, childLoads }) : null;
  const usedEnv = new Set<string>();

  for (const field of FIELD_ORDER[engine]) {
    if (field === "password") continue;
    const f = field as Exclude<FieldName, "password">;
    const set = (v: unknown, source: Source) => {
      (values as Record<string, unknown>)[f] = v;
      sources[f] = source;
    };
    const mine = (own as Record<string, unknown>)[f];
    const dflt = useDefaults ? (defaults as Record<string, unknown>)[f] : undefined;
    const fromEnv = env?.fields[f];
    if (mine !== undefined && mine !== "") set(mine, { kind: "profile", text: "this connection (saved in the File Manager)" });
    else if (dflt !== undefined) set(dflt, { kind: "defaults", text: `your defaults for ${ENGINES[engine].label} (File Manager)` });
    else if (fromEnv) {
      set(fromEnv.value, { kind: "env", text: provenanceText(fromEnv.prov), name: fromEnv.name, prov: fromEnv.prov });
      usedEnv.add(fromEnv.name);
    } else if (BUILTIN[engine][f] !== undefined) set(BUILTIN[engine][f], { kind: "builtin", text: "the studio's built-in default" });
  }

  // Passwords never cross from the environment into a saved connection: that would send a password meant for one server to another.
  if (engine !== "sqlite") {
    if (profile) {
      if (input.password) {
        values.password = input.password;
        sources.password = { kind: "profile", text: "this connection (saved in the OS keychain)" };
      } else sources.password = { kind: "none", text: "not saved: environment passwords are never used with a saved connection" };
    } else if (env?.password && String(env.password.value) !== "") {
      values.password = String(env.password.value);
      sources.password = { kind: "env", text: provenanceText(env.password.prov), name: env.password.name, prov: env.password.prov };
      usedEnv.add(env.password.name);
    } else sources.password = { kind: "none", text: "no password" };
  }

  // Which connection variables are present but not part of the answer.
  const ignored: Resolved["ignored"] = [];
  for (const [name, v] of view.vars) {
    const present = v.prov.kind === "process" || !!v.prov.loaded || !!childLoads?.(v.prov);
    if (!isEngineVariable(engine, name) || !present || usedEnv.has(name)) continue;
    ignored.push({ name, origin: provenanceText(v.prov) });
  }
  if (env) warnings.push(...env.warnings);
  if (mode === "environment") notes.push("No connection is chosen, so the studio reads the environment itself, as before.");
  if (mode === "builtin") notes.push("No connection is chosen and environment variables are turned off for this engine, so the studio uses its own defaults.");

  if (profile) {
    const tls = profile.tls;
    if (engine !== "sqlite" && tls && typeof tls === "object" && (tls.ca || tls.verify === false)) warnings.push(`${ENGINES[engine].studioName} can only switch TLS on or off: it ignores the CA file and the "verify" choice. Those apply to Test connection only.`);
    if (engine === "mysql" && !(profile as ConnectionProfile).database && !defaults.database && !env?.fields.database) warnings.push("MySQL Studio needs a database name. With none set it opens one called my_app_dev.");
    if (engine === "redis") {
      if ((profile as RedisProfile).keyPrefix) warnings.push("Redis Studio shows every key: the key prefix is only used by Test connection.");
      if (profile.readOnly) warnings.push("Redis Studio can't be made read-only. Use a Redis account that can only read.");
    }
    if (engine === "sqlite" && (profile as ConnectionProfile).sqliteMode === "readonly") warnings.push("SQLite Studio opens the file for reading and writing. Read-only applies to Test connection only.");
  }
  return { engine, mode, values, sources, ignored, notes, warnings };
}

/* ------------------------------------------------------------------ launching */

export interface LaunchSpec {
  /** The studio's whole environment. */
  env: Record<string, string>;
  /** Flags for Bun itself, before the script. */
  bunArgs: string[];
  /** Arguments after the script. */
  studioArgs: string[];
  /** "neutral": a folder of our own with no .env files; "inherit": where this program was started, as before. */
  cwd: "neutral" | "inherit";
  /** The environment was rebuilt from the connection (true), or left as it was (false: "start with my environment as before"). */
  explicit: boolean;
}

export interface LaunchInput {
  baseEnv: Record<string, string | undefined>;
  parentPid: number;
  /** A folder for files the studio writes (exports, uploads). */
  filesDir: string;
}

function redisUrl(v: Resolved["values"]): string {
  const auth = v.user || v.password ? `${v.user ? encodeURIComponent(v.user) : ""}${v.password ? `:${encodeURIComponent(v.password)}` : ""}@` : "";
  return `${v.tls ? "rediss" : "redis"}://${auth}${v.host?.includes(":") ? `[${v.host}]` : v.host}:${v.port}`;
}

/** The environment and arguments a studio is started with for a resolved connection. */
export function buildLaunch(r: Resolved, input: LaunchInput): LaunchSpec {
  const explicit = r.mode !== "environment";
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.baseEnv)) {
    if (v === undefined) continue;
    // A studio never gets this program's own settings or start-up steering; and when it is started for a connection, no connection variables at all.
    if (PRIVATE_ENV_PREFIXES.some((p) => k.startsWith(p)) || CONTROL_ENV.includes(k)) continue;
    if (explicit && isScrubbedVariable(k)) continue;
    env[k] = v;
  }
  env.STUDIO_PARENT_PID = String(input.parentPid);
  env.STUDIO_EXPORT_DIR = input.filesDir;
  const studioArgs = ["--server"];
  const v = r.values;
  const e = r.engine;
  const tlsText = (x: boolean | undefined) => (x ? "true" : "false");
  // With nothing chosen and the environment turned off, the studio is simply left to use its own defaults.
  const setValues = explicit && r.mode !== "builtin";
  if (e === "sqlite") {
    studioArgs.push("--port", "0");
    if (setValues || (!explicit && v.path !== undefined)) env.SQLITE_STUDIO_DB = v.path ?? ":memory:";
  } else if (e === "mysql" && setValues) {
    env.MSQL_HOST = env.MYSQL_HOST = v.host ?? "localhost";
    env.MSQL_PORT = env.MYSQL_PORT = String(v.port ?? 3306);
    env.MSQL_USER = env.MYSQL_USER = v.user ?? "root";
    if (v.password) env.MSQL_PASSWORD = env.MYSQL_PASSWORD = v.password;
    if (v.database) {
      env.MSQL_NAME = env.MYSQL_DATABASE = env.MYSQL_STUDIO_DB = v.database;
    }
    env.MSQL_TLS = env.MYSQL_TLS = tlsText(v.tls);
  } else if (e === "postgres") {
    env.PG_STUDIO_PORT = "0";
    if (setValues) {
      env.PG_HOST = v.host ?? "localhost";
      env.PG_PORT = String(v.port ?? 5432);
      env.PG_USER = v.user ?? "postgres";
      if (v.password) env.PG_PASSWORD = v.password;
      if (v.database) env.PG_DATABASE = env.PG_STUDIO_DB = v.database;
      if (v.schema) env.PG_SCHEMA = v.schema;
      env.PG_TLS = tlsText(v.tls);
    }
  } else if (e === "redis" && setValues) {
    env.REDIS_URL = redisUrl({ ...v, host: v.host ?? "127.0.0.1", port: v.port ?? 6379 });
    env.REDIS_DB = String(v.dbIndex ?? 0);
  }
  return { env, bunArgs: explicit ? ["--no-env-file"] : [], studioArgs, cwd: explicit ? "neutral" : "inherit", explicit };
}

/** The panel: every field with its value (never the password), where it came from, and what is ignored. */
export function describeEffective(r: Resolved, profile: DbProfile | null, meta: ProfileMeta | undefined, view: EnvView) {
  const fields = FIELD_ORDER[r.engine].map((f) => {
    const src = r.sources[f] ?? { kind: "none", text: "not set" };
    if (f === "password") return { field: f, label: "Password", secret: true, present: !!r.values.password, value: null as string | null, source: src };
    const raw = (r.values as Record<string, unknown>)[f];
    const value = raw === undefined ? null : f === "tls" ? (raw ? "on" : "off") : String(raw);
    return { field: f, label: LABELS[f], secret: false, present: raw !== undefined, value, source: src };
  });
  const noLonger: Array<{ name: string; origin: string }> = [];
  if (meta && (meta.source === "environment" || meta.source === "dotenv") && meta.variables) {
    for (const name of meta.variables) {
      const v = view.vars.get(name);
      if (v) noLonger.push({ name, origin: provenanceText(v.prov) });
    }
  }
  return {
    engine: r.engine,
    mode: r.mode,
    profile: profile ? { id: profile.id, name: profile.name } : null,
    fields,
    ignored: r.ignored,
    noLongerNeeded: noLonger,
    notes: r.notes,
    warnings: r.warnings,
    willUse: r.mode === "environment" ? "the environment, as before" : r.mode === "builtin" ? "the studio's own defaults" : "the values above, and nothing from the environment or any .env file",
  };
}

const LABELS: Record<FieldName, string> = { host: "Host", port: "Port", user: "User", password: "Password", database: "Database", schema: "Schema", tls: "TLS", path: "File", dbIndex: "Database number" };
