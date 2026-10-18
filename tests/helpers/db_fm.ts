import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { SecretStore } from "../../src/db/profiles";
import type { DatabasesHooks, StudioCommand } from "../../src/features/filemanager/fmDbHooks";
import { startFileManagerServer } from "../../src/features/filemanager/fmServer";

export const FAKE_STUDIO = join(import.meta.dir, "fake_studio.ts");

/** A keychain that lives in this test: what is "in the keychain" can be looked at directly. */
export class FakeKeychain implements SecretStore {
  readonly map = new Map<string, string>();
  constructor(readonly kind: SecretStore["kind"] = "os-keychain") {}
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

/** The stand-in studio as a studio command (the real Bun, a real child process, no database). */
export const fakeStudioCommand = (): StudioCommand => ({ kind: "dev", where: FAKE_STUDIO, build: (bunArgs, studioArgs) => [process.execPath, ...bunArgs, FAKE_STUDIO, ...studioArgs] });

export interface DbTestOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
  roots?: string[];
  keychain?: FakeKeychain;
  hooks?: Partial<DatabasesHooks>;
  /** Reuse a computer (home and data folders) from an earlier call, to test what survives a restart. */
  dir?: string;
}

export function dbComputer(options: DbTestOptions = {}) {
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), "fm-db-"));
  const home = join(dir, "home");
  const dataDir = join(dir, "data");
  mkdirSync(home, { recursive: true });
  const keychain = options.keychain ?? new FakeKeychain();
  const server = startFileManagerServer({
    port: 0,
    token: "db-token",
    context: {
      home,
      dataDir,
      databases: { secretStore: async () => keychain, env: () => options.env ?? {}, cwd: () => options.cwd ?? join(dir, "start"), appRoots: () => options.roots ?? [], studioCommand: () => fakeStudioCommand(), ...options.hooks },
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const api = async (op: string, body: Record<string, unknown> = {}) => {
    const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", "x-fm-token": "db-token" }, body: JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: JSON.parse(text) as any, text };
  };
  const ok = async (op: string, body: Record<string, unknown> = {}) => {
    const r = await api(op, body);
    if (r.status !== 200) throw new Error(`${op} failed: ${r.status} ${r.text}`);
    return r.json;
  };
  return {
    dir, home, dataDir, keychain, server, base, api, ok,
    stop() {
      server.stop(true);
    },
    remove() {
      server.stop(true);
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Windows may briefly hold a handle to a killed child process's working folder.
      }
    },
  };
}

export type DbComputer = ReturnType<typeof dbComputer>;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function until<T>(fn: () => T | Promise<T>, what: string, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(25);
  }
}
