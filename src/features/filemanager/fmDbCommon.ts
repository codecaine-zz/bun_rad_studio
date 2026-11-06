/** Small helpers the Databases operations share. */
import type { ConnectionProfile } from "../../db/profiles";
import type { FmContext } from "./fmCore";
import type { DbEngine } from "./fmDbModel";
import { resolveConnection } from "./fmDbResolve";
import { dbState, envView } from "./fmDbState";
import type { DbProfile, DbStore, RedisProfile } from "./fmDbStore";
import type { TestInput } from "./fmDbTest";
import { FmError } from "./fmPaths";

/** Type guard that checks whether `v` is a non-null, non-array plain object. */
export const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Works out what a connection really uses (profile, then the engine's defaults, then the environment, then built-ins). */
export async function effectiveFor(
  ctx: FmContext,
  engine: DbEngine,
  profile: DbProfile | null,
  passwordOverride?: string | null,
) {
  const st = dbState(ctx);
  const settings = st.store.getSettings().engines[engine];
  const password =
    passwordOverride !== undefined
      ? passwordOverride
      : profile && profile.id !== "draft"
        ? await st.store.password(profile.id)
        : null;
  const view = await envView(ctx);
  const resolved = resolveConnection({
    engine,
    profile,
    password,
    settings,
    view,
  });
  return {
    resolved,
    view,
    password,
    meta: profile ? st.store.getSettings().meta[profile.id] : undefined,
  };
}

/** Builds a `TestInput` connection test payload from an optional saved profile and its resolved connection values. */
export function testInputFor(
  profile: DbProfile | null,
  resolved: ReturnType<typeof resolveConnection>,
): TestInput {
  const v = resolved.values;
  const base: TestInput = {
    engine: resolved.engine,
    production: profile?.environment === "production",
    host: v.host,
    port: v.port,
    user: v.user,
    password: v.password,
    database: v.database,
    schema: v.schema,
    tls: v.tls,
    path: v.path,
    dbIndex: v.dbIndex,
  };
  if (profile) {
    if (profile.tls && typeof profile.tls === "object") base.tls = profile.tls;
    if (profile.engine === "sqlite")
      base.sqliteMode = (profile as ConnectionProfile).sqliteMode;
    if (profile.engine === "redis")
      base.keyPrefix = (profile as RedisProfile).keyPrefix;
    const t = (profile as { connectTimeoutMs?: number }).connectTimeoutMs;
    if (t) base.connectTimeoutMs = t;
  }
  return base;
}

/** Looks up a saved database connection profile by ID in `store`, throwing `NOT_FOUND` if missing. */
export function profileFor(store: DbStore, id: unknown): DbProfile {
  const p = typeof id === "string" ? store.get(id) : undefined;
  if (!p)
    throw new FmError("NOT_FOUND", "That connection doesn't exist any more.");
  return p;
}
