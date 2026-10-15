/**
 * Operations of the Databases tab: connections (add, change, copy, delete), pasted addresses, Test connection,
 * the Effective settings panel and the per-engine settings. Passwords only ever travel one way: from the page to the
 * keychain (or to a driver for one test). No answer contains one.
 */
import { statSync } from "fs";
import { lstat, readFile } from "fs/promises";
import { sanitizeProfileInput, type ConnectionProfile } from "../../db/profiles";
import type { FmHandler } from "./fmCore";
import { detectOperations } from "./fmDbDetectOps";
import { ENGINES, DB_ENGINES, isEngine, parseConnectionUrl, type DbEngine } from "./fmDbModel";
import { buildLaunch, describeEffective } from "./fmDbResolve";
import { checkSqlitePath, dbState, envView, guarded, looksLikeSqlite, secretKind, stashPassword, takeStashed } from "./fmDbState";
import { studioOperations } from "./fmDbStudioOps";
import { effectiveFor, isObject, profileFor, testInputFor } from "./fmDbCommon";
import { sanitizeRedisProfile, type DbProfile, type RedisProfile } from "./fmDbStore";
import { FmError, extensionOf } from "./fmPaths";
import { absolutePath } from "./fmCore";

const SQLITE_EXTENSIONS = ["sqlite", "sqlite3", "db", "db3", "s3db"];
const MAX_CHECK = 60;

/** The checked copy of a profile being edited in the page (never saved). */
async function draft(input: unknown, id?: string): Promise<DbProfile> {
  if (!isObject(input) || !isEngine(input.engine)) throw new FmError("BAD_REQUEST", "Choose what kind of database this is.");
  const now = new Date().toISOString();
  return await guarded(async () => (input.engine === "redis" ? ({ ...sanitizeRedisProfile(input), id: id ?? "draft", createdAt: now } as RedisProfile) : ({ ...sanitizeProfileInput(input), id: id ?? "draft", createdAt: now } as ConnectionProfile)));
}

export const databaseOperations: Record<string, FmHandler> = {
  async "db/overview"(ctx) {
    const st = dbState(ctx);
    const kind = await secretKind(ctx);
    const settings = st.store.getSettings();
    return {
      engines: DB_ENGINES.map((e) => ({ id: e, label: ENGINES[e].label, icon: ENGINES[e].icon, defaultPort: ENGINES[e].defaultPort ?? null, studioName: ENGINES[e].studioName, studioAvailable: st.hooks.studioCommand(e) !== null })),
      profiles: await st.store.list(),
      secretStore: { kind, persistent: kind === "os-keychain" },
      settings: { detect: settings.detect, engines: settings.engines },
      studios: st.studios.list(),
      limits: { maxStudios: st.hooks.maxStudios },
    };
  },

  /**
   * The saved connections for quick-open buttons (Home, the Databases tab): no keychain is read, so showing them never asks
   * for anything, and no password is in the answer. `windowReady` says whether the studio can run in its own window.
   */
  async "db/shortcuts"(ctx) {
    const st = dbState(ctx);
    return {
      shortcuts: st.store.listPlain().map((p) => {
        const info = ENGINES[p.engine];
        return { ...p, label: info.label, icon: info.icon, studioName: info.studioName, studioAvailable: Boolean(st.hooks.studioCommand(p.engine)) };
      }),
    };
  },

  async "db/profile/save"(ctx, b) {
    const st = dbState(ctx);
    if (!isObject(b.profile)) throw new FmError("BAD_REQUEST", "There is no connection to save.");
    const input: Record<string, any> = { ...b.profile };
    if (!isEngine(input.engine)) throw new FmError("BAD_REQUEST", "Choose what kind of database this is.");
    const engine: DbEngine = input.engine;
    if (b.id !== undefined && typeof b.id !== "string") throw new FmError("BAD_REQUEST", "That isn't a saved connection.");
    if (engine === "sqlite") {
      const mode = typeof input.sqliteMode === "string" ? input.sqliteMode : "readwrite";
      input.sqliteMode = mode;
      input.path = await checkSqlitePath(ctx, input.path, mode);
    }
    let password: string | undefined;
    if (b.clearPassword === true) password = "";
    else if (typeof b.password === "string" && b.password !== "") password = b.password;
    else if (b.passwordToken !== undefined) password = takeStashed(st, b.passwordToken, engine);
    if (engine === "sqlite" && password) throw new FmError("BAD_REQUEST", "SQLite files have no password.");
    const saved = await guarded(() => st.store.save(input, password, b.id));
    if (!b.id) {
      const meta = { source: b.source === "url" ? ("url" as const) : ("manual" as const), savedAt: new Date().toISOString() };
      st.store.setMeta(saved.id, meta);
      saved.meta = meta;
    }
    return { profile: saved };
  },

  async "db/profile/delete"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Deleting a connection needs your confirmation. Its saved password is deleted with it.");
    const st = dbState(ctx);
    const p = profileFor(st.store, b.id);
    for (const [studioId, src] of st.sources) if (src.profileId === p.id) await st.studios.stop(studioId).catch(() => {});
    await guarded(() => st.store.remove(p.id));
    return { removed: p.id };
  },

  async "db/profile/duplicate"(ctx, b) {
    const st = dbState(ctx);
    const p = profileFor(st.store, b.id);
    // Copying the password is the person's choice: without a clear yes, the copy has none.
    const copy = await guarded(() => st.store.duplicate(p.id, b.copyPassword === true));
    const meta = { source: "manual" as const, savedAt: new Date().toISOString() };
    st.store.setMeta(copy.id, meta);
    return { profile: { ...copy, meta } };
  },

  async "db/profile/favorite"(ctx, b) {
    const st = dbState(ctx);
    const p = profileFor(st.store, b.id);
    const saved = await guarded(() => st.store.save({ ...p, favorite: b.favorite === true }, undefined, p.id));
    return { profile: saved };
  },

  async "db/password/clear"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Removing the saved password needs your confirmation.");
    const st = dbState(ctx);
    const p = profileFor(st.store, b.id);
    await st.store.clearPassword(p.id);
    return { cleared: p.id };
  },

  async "db/url/parse"(ctx, b) {
    const parsed = parseConnectionUrl(b.text);
    if (!parsed.ok) throw new FmError("BAD_ADDRESS", parsed.error);
    const { password, notes, ...fields } = parsed.value;
    const st = dbState(ctx);
    return { engine: fields.engine, fields, hasPassword: password !== undefined, passwordToken: password !== undefined ? stashPassword(st, fields.engine, password) : null, notes };
  },

  async "db/test"(ctx, b) {
    const st = dbState(ctx);
    let profile: DbProfile;
    let password: string | null | undefined;
    if (typeof b.id === "string") {
      profile = profileFor(st.store, b.id);
      if (typeof b.password === "string" && b.password) password = b.password;
    } else {
      profile = await draft(b.profile);
      const typed = typeof b.password === "string" && b.password ? b.password : undefined;
      password = typed ?? takeStashed(st, b.passwordToken, profile.engine as DbEngine) ?? null;
      if (profile.engine === "sqlite") {
        const p = profile as ConnectionProfile;
        if (p.sqliteMode !== "memory" && p.path) p.path = absolutePath(ctx, p.path);
      }
    }
    const { resolved } = await effectiveFor(ctx, profile.engine as DbEngine, profile, password);
    // A draft shown in the editor may be a saved profile being edited: its saved password counts when none was typed.
    if (!resolved.values.password && profile.id === "draft" && typeof b.draftOf === "string") {
      const saved = st.store.get(b.draftOf);
      if (saved && saved.engine === profile.engine) resolved.values.password = (await st.store.password(saved.id)) ?? undefined;
    }
    const result = await st.hooks.testConnection(testInputFor(profile, resolved));
    if (typeof b.id === "string") st.store.markUsed(b.id);
    return { result };
  },

  async "db/effective"(ctx, b) {
    const st = dbState(ctx);
    const profile = typeof b.id === "string" ? profileFor(st.store, b.id) : null;
    const engine = profile ? (profile.engine as DbEngine) : b.engine;
    if (!isEngine(engine)) throw new FmError("BAD_REQUEST", "Choose an engine.");
    const { resolved, view, meta } = await effectiveFor(ctx, engine, profile);
    // The same answer the studio would be started with, so the panel can say whether the environment is left alone.
    const launch = buildLaunch(resolved, { baseEnv: st.hooks.env(), parentPid: st.hooks.pid, filesDir: "" });
    return { effective: describeEffective(resolved, profile, meta, view), startsWithEnvironment: !launch.explicit, files: view.files, nodeEnv: view.nodeEnv };
  },

  async "db/engine/save"(ctx, b) {
    if (!isEngine(b.engine)) throw new FmError("BAD_REQUEST", "Choose an engine.");
    const st = dbState(ctx);
    const settings = await guarded(async () => st.store.setEngineSettings(b.engine, { useEnv: b.useEnv, defaults: b.defaults }));
    return { engine: b.engine, settings };
  },

  async "db/ca/read"(ctx, b) {
    const path = absolutePath(ctx, b.path);
    const st = await lstat(path).catch(() => null);
    if (!st) throw new FmError("NOT_FOUND", "That file doesn't exist.");
    if (!st.isFile()) throw new FmError("NOT_A_FILE", "That isn't a file (links aren't followed).");
    if (st.size > 100_000) throw new FmError("TOO_BIG", "That file is too big for a certificate.");
    const pem = await readFile(path, "utf8");
    if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(pem)) throw new FmError("NOT_A_CERTIFICATE", "That doesn't look like a certificate file in PEM form (it should contain BEGIN CERTIFICATE).");
    return { pem };
  },

  async "db/sqlite/check"(ctx, b) {
    if (!Array.isArray(b.paths)) throw new FmError("BAD_REQUEST", "No files were given.");
    if (b.paths.length > MAX_CHECK) throw new FmError("TOO_MANY", `Check at most ${MAX_CHECK} files at once.`);
    const results: Array<{ path: string; sqlite: boolean }> = [];
    for (const raw of b.paths) {
      let path: string;
      try {
        path = absolutePath(ctx, raw);
      } catch {
        continue;
      }
      // Only files that are named like databases are opened to look at their first bytes, and an empty file is not offered.
      const named = SQLITE_EXTENSIONS.includes(extensionOf(path.split(/[\\/]/).pop() ?? ""));
      let sqlite = false;
      if (named) {
        try {
          sqlite = statSync(path).size > 0 && (await looksLikeSqlite(path));
        } catch {
          sqlite = false;
        }
      }
      results.push({ path, sqlite });
    }
    return { results };
  },

};

Object.assign(databaseOperations, detectOperations, studioOperations);
