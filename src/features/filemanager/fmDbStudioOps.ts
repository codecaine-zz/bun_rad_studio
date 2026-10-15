/**
 * Starting, stopping and showing the database studios. A studio is started for one connection with exactly the
 * environment the precedence rule produces (fmDbResolve.ts): the File Manager's own token and session never reach it.
 */
import { mkdirSync } from "fs";
import { join } from "path";
import type { ConnectionProfile } from "../../db/profiles";
import type { FmContext, FmHandler } from "./fmCore";
import { effectiveFor, isObject, profileFor } from "./fmDbCommon";
import { grantImport, importAsk, newStagingToken, rememberStagingToken, stagingEnv } from "./fmDbImport";
import { ENGINES, OTHER_ENV, STUDIO_ENV, isEngine, type DbEngine } from "./fmDbModel";
import { buildLaunch, type Resolved } from "./fmDbResolve";
import { checkSqlitePath, dbState } from "./fmDbState";
import type { DbProfile } from "./fmDbStore";
import type { StudioInfo } from "./fmDbStudios";
import { openCommand } from "./fmOpen";
import { FmError } from "./fmPaths";

interface Prepared {
  engine: DbEngine;
  profile: DbProfile | null;
  path?: string;
  key: string;
  title: string;
  resolved: Resolved;
  writesNeeded: "production" | "readonly" | null;
}

/** Works out which connection a request means and what it would start with. */
async function prepare(ctx: FmContext, b: Record<string, any>): Promise<Prepared> {
  const st = dbState(ctx);
  let profile: DbProfile | null = null;
  let engine: DbEngine;
  let path: string | undefined;
  if (typeof b.profileId === "string") {
    profile = profileFor(st.store, b.profileId);
    engine = profile.engine as DbEngine;
  } else if (isEngine(b.engine)) {
    engine = b.engine;
    if (engine === "sqlite" && typeof b.path === "string") path = await checkSqlitePath(ctx, b.path, "readwrite");
  } else throw new FmError("BAD_REQUEST", "Choose a connection or a kind of database.");

  const stub = path ? ({ id: "path", name: path, engine: "sqlite", path, sqliteMode: "readwrite", tags: [], favorite: false, environment: "development", readOnly: false, createdAt: "" } as ConnectionProfile) : profile;
  const { resolved } = await effectiveFor(ctx, engine, stub);
  const info = ENGINES[engine];
  const writesNeeded = profile && profile.environment === "production" ? "production" : profile && (profile.readOnly || (profile.engine === "sqlite" && (profile as ConnectionProfile).sqliteMode === "readonly")) ? "readonly" : null;
  return {
    engine,
    profile,
    path,
    key: `${engine}:${profile ? profile.id : path ? `path:${path}` : "none"}`,
    title: `${info.studioName}${profile ? `: ${profile.name}` : path ? `: ${path.split(/[\\/]/).pop()}` : ""}`,
    resolved,
    writesNeeded,
  };
}

function confirmWrites(p: Prepared, given: unknown): boolean {
  if (!p.writesNeeded) return false;
  if (given !== true) {
    const what = p.writesNeeded === "production" ? "marked as a production connection" : "marked read-only";
    throw new FmError("NEEDS_CONFIRM", `"${p.profile!.name}" is ${what}, but ${ENGINES[p.engine].studioName} has no read-only mode: you could change or delete data in it. Open it anyway?`, { reason: p.writesNeeded, name: p.profile!.name, engine: p.engine });
  }
  return true;
}

/** Values a studio's log must never show: the password it was given, and any password variable that is simply passed along. */
function secretsFor(ctx: FmContext, p: Prepared): string[] {
  const out = new Set<string>();
  if (p.resolved.values.password) out.add(p.resolved.values.password);
  const env = dbState(ctx).hooks.env();
  for (const names of [STUDIO_ENV[p.engine].password, OTHER_ENV[p.engine].password]) for (const n of names ?? []) if (env[n]) out.add(env[n]!);
  return [...out].filter((s) => s.length >= 3);
}

const neutralDir = (ctx: FmContext) => {
  const dir = join(ctx.dataDir, "db_studios", "files");
  mkdirSync(dir, { recursive: true });
  return dir;
};

async function startStudio(ctx: FmContext, b: Record<string, any>, already?: { writesConfirmed: boolean }) {
  const st = dbState(ctx);
  const p = await prepare(ctx, b);
  const writes = already ? already.writesConfirmed : confirmWrites(p, b.confirmWrites);
  const ask = await importAsk(ctx, b);
  const found = st.studios.find(p.key);
  if (found) {
    await grantImport(found, ask);
    return { studio: found, frame: `/app/dbstudio/${found.id}/`, reused: true };
  }
  const command = st.hooks.studioCommand(p.engine);
  if (!command) throw new FmError("NOT_AVAILABLE", `${ENGINES[p.engine].studioName} isn't part of this copy of the program, so it can't be opened here.`);
  const files = neutralDir(ctx);
  const launch = buildLaunch(p.resolved, { baseEnv: st.hooks.env(), parentPid: st.hooks.pid, filesDir: files });
  const stagingToken = newStagingToken();
  Object.assign(launch.env, stagingEnv(stagingToken, ask, p.writesNeeded));
  const info = await st.studios.start({
    engine: p.engine,
    key: p.key,
    profileId: p.profile?.id ?? null,
    title: p.title,
    command: command.build(launch.bunArgs, launch.studioArgs),
    env: launch.env,
    // A folder with no .env files, so Bun (and the studios' own .env reading) finds nothing to load.
    cwd: launch.cwd === "neutral" ? files : st.hooks.cwd(),
    secrets: secretsFor(ctx, p),
    writesConfirmed: writes,
  });
  rememberStagingToken(info.id, stagingToken);
  st.sources.set(info.id, { engine: p.engine, profileId: p.profile?.id ?? null, path: p.path, writesConfirmed: writes });
  if (p.profile) st.store.markUsed(p.profile.id);
  return { studio: info, frame: info.state === "running" ? `/app/dbstudio/${info.id}/` : null, reused: false };
}

function studioOf(ctx: FmContext, id: unknown): StudioInfo {
  const info = typeof id === "string" ? dbState(ctx).studios.get(id) : undefined;
  if (!info) throw new FmError("NOT_FOUND", "That studio isn't there any more.");
  return info;
}

export const studioOperations: Record<string, FmHandler> = {
  async "db/studio/start"(ctx, b) {
    return await startStudio(ctx, isObject(b) ? b : {});
  },

  async "db/studio/stop"(ctx, b) {
    const info = studioOf(ctx, b.id);
    return { studio: await dbState(ctx).studios.stop(info.id) };
  },

  async "db/studio/restart"(ctx, b) {
    const st = dbState(ctx);
    const info = studioOf(ctx, b.id);
    const src = st.sources.get(info.id);
    if (!src) throw new FmError("NOT_FOUND", "That studio can't be restarted: open it again from its connection.");
    await st.studios.stop(info.id);
    // Settings are read again, so a changed connection or environment takes effect.
    return await startStudio(ctx, { engine: src.engine, ...(src.profileId ? { profileId: src.profileId } : {}), ...(src.path ? { path: src.path } : {}) }, { writesConfirmed: src.writesConfirmed });
  },

  async "db/studio/list"(ctx) {
    return { studios: dbState(ctx).studios.list() };
  },

  async "db/studio/logs"(ctx, b) {
    const info = studioOf(ctx, b.id);
    return { studio: info, lines: dbState(ctx).studios.logs(info.id, 200) };
  },

  async "db/studio/browser"(ctx, b) {
    const info = studioOf(ctx, b.id);
    if (info.state !== "running" || !info.url) throw new FmError("NOT_RUNNING", "That studio isn't running.");
    // Only the address of a studio this program started is ever opened.
    const { command, args } = openCommand(ctx.platform, info.url);
    try {
      await ctx.launch(command, args);
    } catch (err: any) {
      throw new FmError("OPEN_FAILED", `Couldn't open your web browser: ${err?.message ?? err}. The address is ${info.url}`);
    }
    return { opened: info.url };
  },

  async "db/studio/window"(ctx, b) {
    const st = dbState(ctx);
    const p = await prepare(ctx, isObject(b) ? b : {});
    confirmWrites(p, b.confirmWrites);
    const command = st.hooks.studioCommand(p.engine);
    if (!command) throw new FmError("NOT_AVAILABLE", `${ENGINES[p.engine].studioName} isn't part of this copy of the program, so it can't be opened here.`);
    const files = neutralDir(ctx);
    const launch = buildLaunch(p.resolved, { baseEnv: st.hooks.env(), parentPid: st.hooks.pid, filesDir: files });
    // The window is a program of its own: it must not stop when the File Manager does.
    delete launch.env.STUDIO_PARENT_PID;
    // A window is a program of its own: it gets what to open through its environment, and no secret (nobody can send it a file later).
    Object.assign(launch.env, stagingEnv("", await importAsk(ctx, b), p.writesNeeded));
    const v = p.resolved.values;
    let argv: string[] = [];
    if (p.engine === "sqlite") argv = [v.path ?? ":memory:"];
    else if (p.engine === "mysql" || p.engine === "postgres") argv = v.database ? [v.database] : [];
    else {
      if (v.password || v.user) throw new FmError("NOT_AVAILABLE", "Redis Studio's window takes its address on the command line, where other programs on this computer could read a password. Use the studio inside the File Manager instead.");
      argv = [`${v.tls ? "rediss" : "redis"}://${v.host}:${v.port}`];
    }
    const result = await st.hooks.spawnWindow(command.build(launch.bunArgs, argv), { env: launch.env, cwd: launch.cwd === "neutral" ? files : st.hooks.cwd() });
    if (!result.ok) throw new FmError("OPEN_FAILED", result.reason);
    if (p.profile) st.store.markUsed(p.profile.id);
    return { opened: true };
  },
};
