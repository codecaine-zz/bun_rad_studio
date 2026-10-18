/**
 * What the Databases feature needs from the computer, replaceable so tests never touch the real keychain,
 * start real studios, or read this machine's environment.
 */
import { existsSync, readdirSync } from "fs";
import { basename, dirname, join } from "path";
import type { ConnectionConfig, DbAdapter } from "../../db/types";
import { detectSecretStore, type SecretStore } from "../../db/profiles";
import { testConnection, type TestInput, type TestResult } from "./fmDbTest";
import { ENGINES, type DbEngine } from "./fmDbModel";

export interface CloneRedisClient {
  send(command: string, args: string[]): Promise<unknown>;
  close(): void;
}

/** A running child program as the studio manager sees it. */
export interface DbProcess {
  pid: number;
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  /** Resolves with the exit code when the program ends. */
  exited: Promise<number | null>;
  /** Ends the program and everything it started: `TERM` first, `KILL` when it didn't stop. */
  kill(signal: "SIGTERM" | "SIGKILL"): void;
}

export interface SpawnOptions {
  env: Record<string, string>;
  cwd: string;
}

export interface StudioCommand {
  kind: "dev" | "bundle" | "app" | "executable";
  /** Builds the full command from Bun's own flags (ignored for an executable) and the studio's arguments. */
  build(bunArgs: string[], studioArgs: string[]): string[];
  /** Where it was found, for messages. */
  where: string;
}

export interface DatabasesHooks {
  secretStore(): Promise<SecretStore>;
  /** The environment this program was started with (including what Bun loaded from `.env` files). */
  env(): Record<string, string | undefined>;
  /** The folder this program was started in: where Bun looked for `.env` files. */
  cwd(): string;
  /** The application's own folders besides the start folder: its install folder. */
  appRoots(): string[];
  now(): number;
  spawn(command: string[], options: SpawnOptions): DbProcess;
  /** Starts a desktop window that outlives this program. Resolves once it has stayed up for a moment, or with the reason it didn't. */
  spawnWindow(command: string[], options: SpawnOptions): Promise<{ ok: true } | { ok: false; reason: string }>;
  studioCommand(engine: DbEngine): StudioCommand | null;
  /** One attempt to connect (Test connection). */
  testConnection(input: TestInput): Promise<TestResult>;
  /** Optional override for opening a SQL adapter (used by database cloning). */
  openAdapter?(config: ConnectionConfig): DbAdapter;
  /** Optional override for opening a Redis client (used by database cloning). */
  openRedis?(input: TestInput): Promise<CloneRedisClient>;
  /** Is the studio's page answering on this port? */
  probe(port: number): Promise<boolean>;
  startTimeoutMs: number;
  /** How long a studio gets to stop after `SIGTERM` before it is killed. */
  killGraceMs: number;
  maxStudios: number;
  /** A studio is stopped after this long, so a forgotten one doesn't run for days. */
  maxLifetimeMs: number;
  pid: number;
}

/* ------------------------------------------------------------------ finding the studios */

export interface StudioLayout {
  execPath: string;
  /** The script this program was started from (process.argv[1]). */
  argv1: string;
  /** The project folder when running from source. */
  repoRoot: string;
  exists(path: string): boolean;
  readdir(path: string): string[];
}

const dashed = (s: string) => s.replace(/_/g, "-");

export function realLayout(): StudioLayout {
  return { execPath: process.execPath, argv1: process.argv[1] ?? "", repoRoot: join(import.meta.dir, "..", "..", ".."), exists: existsSync, readdir: (p) => { try { return readdirSync(p); } catch { return []; } } };
}

/** The folder with this program's own files: the project when running from source, the release folder (or the .app's Resources) otherwise. */
export function installRoot(layout: StudioLayout): string {
  if (layout.exists(join(layout.repoRoot, "applications"))) return layout.repoRoot;
  const dir = dirname(layout.argv1 || layout.execPath);
  return ["apps", "app", "cli"].includes(basename(dir)) ? dirname(dir) : dir;
}

/**
 * How to start a studio's `--server` mode:
 *  - a release folder or .app: the studio's bundle (`sqlite-studio.js`) next to this program's, run by the bundled runtime;
 *  - a different .app in the same folder (the Mac downloads are one .app per tool): that app's bundle and runtime;
 *  - a compiled executable named like the studio next to this one;
 *  - from source: `applications/<name>.ts` run by Bun.
 */
export function resolveStudioCommand(engine: DbEngine, layout: StudioLayout = realLayout()): StudioCommand | null {
  const script = ENGINES[engine].script;
  const bundle = `${dashed(script)}.js`;
  const argvDir = layout.argv1 ? dirname(layout.argv1) : "";
  const run = (exe: string, file: string, kind: StudioCommand["kind"]): StudioCommand => ({ kind, where: file, build: (bunArgs, studioArgs) => [exe, ...bunArgs, file, ...studioArgs] });

  if (argvDir && layout.exists(join(argvDir, bundle))) return run(layout.execPath, join(argvDir, bundle), "bundle");

  // Mac: X.app/Contents/Resources/app/<this>.js, with the other tools as sibling .app folders.
  const m = /^(.*\.app)\/Contents\/Resources\/app$/.exec(argvDir.replace(/\\/g, "/"));
  if (m) {
    const holder = dirname(m[1]!);
    for (const name of layout.readdir(holder)) {
      if (!name.endsWith(".app")) continue;
      const res = join(holder, name, "Contents", "Resources");
      const file = join(res, "app", bundle);
      const runtime = join(res, "runtime", "bun");
      if (layout.exists(file) && layout.exists(runtime)) return run(runtime, file, "app");
    }
  }

  for (const suffix of ["", ".exe"]) {
    const exe = join(dirname(layout.execPath), `${dashed(script)}${suffix}`);
    if (basename(layout.execPath).toLowerCase().replace(/\.exe$/, "") !== dashed(script) && layout.exists(exe)) return { kind: "executable", where: exe, build: (_bunArgs, studioArgs) => [exe, ...studioArgs] };
  }

  for (const dir of [argvDir, join(layout.repoRoot, "applications")]) {
    if (!dir) continue;
    const file = join(dir, `${script}.ts`);
    if (layout.exists(file)) return run(layout.execPath, file, "dev");
  }
  return null;
}

/* ------------------------------------------------------------------ real implementations */

function killTree(pid: number, signal: "SIGTERM" | "SIGKILL") {
  if (process.platform === "win32") {
    try {
      Bun.spawn(["taskkill", "/PID", String(pid), "/T", ...(signal === "SIGKILL" ? ["/F"] : [])], { stdout: "ignore", stderr: "ignore" });
    } catch {}
    return;
  }
  // The studio runs in its own process group, so one signal reaches anything it started.
  try {
    process.kill(-pid, signal);
    return;
  } catch {}
  try {
    process.kill(pid, signal);
  } catch {}
}

export function defaultDatabasesHooks(): DatabasesHooks {
  let store: Promise<SecretStore> | null = null;
  return {
    secretStore: () => (store ??= detectSecretStore()),
    env: () => process.env,
    cwd: () => process.cwd(),
    appRoots: () => [installRoot(realLayout())],
    now: () => Date.now(),
    spawn(command, options) {
      const child = Bun.spawn(command, { env: options.env, cwd: options.cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe", detached: process.platform !== "win32" });
      return { pid: child.pid, stdout: child.stdout as ReadableStream<Uint8Array>, stderr: child.stderr as ReadableStream<Uint8Array>, exited: child.exited, kill: (sig) => killTree(child.pid, sig) };
    },
    async spawnWindow(command, options) {
      try {
        const child = Bun.spawn(command, { env: options.env, cwd: options.cwd, stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true });
        const early = await Promise.race([child.exited, new Promise<"up">((r) => setTimeout(() => r("up"), 2500))]);
        if (early === "up") {
          child.unref();
          return { ok: true };
        }
        return { ok: false, reason: "The window closed again straight away. Desktop windows need the window library for this computer." };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message.slice(0, 200) : "It could not be started." };
      }
    },
    studioCommand: (engine) => resolveStudioCommand(engine),
    testConnection: (input) => testConnection(input),
    async probe(port) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2500) });
        await res.arrayBuffer().catch(() => {});
        return res.status < 500;
      } catch {
        return false;
      }
    },
    startTimeoutMs: 20_000,
    killGraceMs: 2000,
    maxStudios: 4,
    maxLifetimeMs: 8 * 3600_000,
    pid: process.pid,
  };
}
