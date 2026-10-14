/** Shared set-up for the Secrets tests: a fake clock and timers, fake clipboard, credential store and network, tiny key-derivation costs. */
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, type FmContext, type FmContextOptions } from "../src/features/filemanager/fmCore";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import type { CredentialStore, SecretsHooks } from "../src/features/filemanager/fmSecretsHooks";
import { secretsOperations } from "../src/features/filemanager/fmSecretsOps";
import { secretsService, type SecretsService } from "../src/features/filemanager/fmSecretsService";

export const TINY = {
  standard: { memoryKiB: 64, passes: 1, parallelism: 1 },
  strong: { memoryKiB: 128, passes: 1, parallelism: 1 },
  maximum: { memoryKiB: 256, passes: 2, parallelism: 1 },
};

export const PASSWORD = "Gx7!kqL2#vN9@pRz";
export const PASSWORD2 = "violet-anchor-lizard-orbit-meadow-quartz";

export function makeClock(start = 1_700_000_000_000) {
  let now = start;
  let id = 0;
  const timers = new Map<number, { fn: () => void; at: number }>();
  return {
    now: () => now,
    setTimer(fn: () => void, ms: number) {
      const h = ++id;
      timers.set(h, { fn, at: now + ms });
      return h;
    },
    clearTimer(h: unknown) {
      timers.delete(h as number);
    },
    /** Moves time forward, running every timer that falls due on the way, in order. */
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = Math.max(now, next[1].at);
        next[1].fn();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}

export class FakeStore implements CredentialStore {
  map = new Map<string, string>();
  down = false;
  calls: string[] = [];
  private key = (s: string, n: string) => `${s}\u0000${n}`;
  async get(service: string, name: string) {
    this.calls.push(`get ${name}`);
    if (this.down) throw new Error("no keychain");
    return this.map.get(this.key(service, name)) ?? null;
  }
  async set(service: string, name: string, value: string) {
    this.calls.push(`set ${name}`);
    if (this.down) throw new Error("no keychain");
    this.map.set(this.key(service, name), value);
  }
  async delete(service: string, name: string) {
    this.calls.push(`delete ${name}`);
    if (this.down) throw new Error("no keychain");
    return this.map.delete(this.key(service, name));
  }
}

export interface Env {
  root: string;
  home: string;
  dataDir: string;
  ctx: FmContext;
  svc: SecretsService;
  clock: ReturnType<typeof makeClock>;
  clip: { text: string; writes: string[] };
  store: FakeStore;
  fetches: Array<{ url: string; headers: Record<string, string> }>;
  fetchReply: { current: (url: string) => { ok: boolean; status: number; text: string } };
  call: (op: string, body?: Record<string, any>) => Promise<any>;
  launched: string[][];
  /** Present when made with { http: true }: a real File Manager server and a function that POSTs to it with the token. */
  server?: ReturnType<typeof startFileManagerServer>;
  base: string;
  http: (op: string, body?: Record<string, any>, headers?: Record<string, string>) => Promise<{ status: number; json: any; text: string }>;
  stop: () => void;
}

export const TOKEN = "secrets-test-token";

export function makeEnv(extra: Partial<SecretsHooks> = {}, { http = false }: { http?: boolean } = {}): Env {
  const root = mkdtempSync(join(tmpdir(), "fm-secrets-"));
  const home = join(root, "home");
  const dataDir = join(root, "data");
  mkdirSync(home, { recursive: true });
  const clock = makeClock();
  const clip = { text: "", writes: [] as string[] };
  const store = new FakeStore();
  const fetches: Env["fetches"] = [];
  const fetchReply: Env["fetchReply"] = { current: () => ({ ok: true, status: 200, text: "" }) };
  const launched: string[][] = [];
  const options: FmContextOptions = {
    home,
    dataDir,
    launch: async (command, args) => {
      launched.push([command, ...args]);
    },
    secrets: {
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      kdf: TINY,
      backupMinIntervalMs: 0,
      clipboard: {
        read: () => clip.text,
        write: (t) => {
          clip.text = t;
          clip.writes.push(t);
          return true;
        },
      },
      store,
      fetch: async (url, init) => {
        fetches.push({ url, headers: init.headers });
        const r = fetchReply.current(url);
        return { ok: r.ok, status: r.status, text: async () => r.text };
      },
      ...extra,
    },
  };
  const server = http ? startFileManagerServer({ port: 0, token: TOKEN, context: options }) : undefined;
  const ctx = server ? server.context : createContext(options);
  const svc = secretsService(ctx);
  const base = server ? `http://127.0.0.1:${server.port}` : "";
  const post = async (op: string, body: Record<string, any> = {}, headers: Record<string, string> = { "x-fm-token": TOKEN }) => {
    const r = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: r.status, json, text };
  };
  const call = async (op: string, body: Record<string, any> = {}) => {
    const handler = secretsOperations[op];
    if (!handler) throw new Error(`no such op ${op}`);
    return (await handler(ctx, body)) as any;
  };
  return { root, home, dataDir, ctx, svc, clock, clip, store, fetches, fetchReply, call, launched, server, base, http: post, stop: () => server?.stop(true) };
}

/** Creates and leaves unlocked a vault with the standard test password. */
export async function createVault(env: Env, body: Record<string, any> = {}) {
  return env.call("secrets/create", { password: PASSWORD, recovery: true, ...body });
}

export const loginItem = (over: Record<string, any> = {}) => ({ type: "login", title: "Example", fields: { username: "alice", password: "S3cret-pw-1!", url: "https://example.com/login" }, ...over });
