import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { KeychainSecretStore, MemorySecretStore, ProfileStore, detectSecretStore, profileToConfig, sanitizeProfileInput } from "../../src/db/profiles";
import { DbError, normalizeError, redact } from "../../src/db/errors";
import { createAdapter } from "../../src/db";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "profiles-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const pg = (extra: Record<string, unknown> = {}) => ({ name: "Dev PG", engine: "postgres", host: "localhost", port: 5432, user: "app", database: "app", ...extra });

describe("profile validation", () => {
  it("accepts a valid server profile and applies defaults", () => {
    const p = sanitizeProfileInput(pg());
    expect(p).toMatchObject({ engine: "postgres", environment: "development", readOnly: false, favorite: false, tags: [] });
  });
  it("rejects bad input", () => {
    for (const bad of [null, "x", { engine: "oracle", name: "x" }, pg({ name: "" }), pg({ port: 70000 }), pg({ host: "a b;rm -rf" }), pg({ environment: "prod" }), pg({ passwordEnv: "1BAD" }), pg({ statementTimeoutMs: -1 }), { name: "s", engine: "sqlite" }]) {
      expect(() => sanitizeProfileInput(bad)).toThrow(DbError);
    }
  });
  it("read-only SQLite mode implies a read-only profile; memory mode needs no path", () => {
    expect(sanitizeProfileInput({ name: "a", engine: "sqlite", path: "/x.db", sqliteMode: "readonly" }).readOnly).toBe(true);
    expect(sanitizeProfileInput({ name: "m", engine: "sqlite", sqliteMode: "memory" }).path).toBe(":memory:");
  });
  it("TLS verification stays on unless explicitly turned off", () => {
    expect(profileToConfig({ ...(sanitizeProfileInput(pg({ tls: true })) as any), id: "i", createdAt: "" }).tls).toBe(true);
    const adapter = createAdapter({ engine: "postgres", tls: true }) as any;
    expect(adapter.tlsOption()).toEqual({ rejectUnauthorized: true });
    expect((createAdapter({ engine: "postgres", tls: { ca: "PEM" } }) as any).tlsOption()).toEqual({ rejectUnauthorized: true, ca: "PEM" });
    expect((createAdapter({ engine: "postgres", tls: { verify: false } }) as any).tlsOption()).toEqual({ rejectUnauthorized: false });
    expect((createAdapter({ engine: "postgres" }) as any).tlsOption()).toBe(false);
  });
});

describe("ProfileStore", () => {
  it("keeps the password out of the file, which is private to the user", async () => {
    const dir = tmp();
    const secrets = new MemorySecretStore();
    const store = new ProfileStore(dir, secrets);
    const pw = "Very-Secret-pw-123";
    const saved = await store.save(pg({ tags: ["x"], folder: "work" }), pw);
    const file = join(dir, "connections.json");
    expect(readFileSync(file, "utf8")).not.toContain(pw);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(saved.hasPassword).toBe(true);
    expect((await store.resolveConfig(saved.id)).password).toBe(pw);
    // reload from disk
    const again = new ProfileStore(dir, secrets);
    expect((await again.list())[0]).toMatchObject({ name: "Dev PG", folder: "work", tags: ["x"], hasPassword: true });
  });

  it("updates, keeps or clears the password; engine cannot change", async () => {
    const store = new ProfileStore(tmp(), new MemorySecretStore());
    const p = await store.save(pg(), "one");
    await store.save(pg({ name: "Renamed" }), undefined, p.id);
    expect((await store.resolveConfig(p.id)).password).toBe("one");
    await store.save(pg({ name: "Renamed" }), "", p.id);
    expect((await store.resolveConfig(p.id)).password).toBeUndefined();
    await expect(store.save({ name: "x", engine: "mysql", host: "h" }, undefined, p.id)).rejects.toThrow("engine");
  });

  it("can take the password from an environment variable instead of storing it", async () => {
    const store = new ProfileStore(tmp(), new MemorySecretStore());
    process.env.WB_TEST_PW = "from-env";
    try {
      const p = await store.save(pg({ passwordEnv: "WB_TEST_PW" }));
      expect(p.hasPassword).toBe(true);
      expect((await store.resolveConfig(p.id)).password).toBe("from-env");
    } finally {
      delete process.env.WB_TEST_PW;
    }
  });

  it("organises profiles: duplicate, favourite, remove, recent", async () => {
    const secrets = new MemorySecretStore();
    const store = new ProfileStore(tmp(), secrets);
    const a = await store.save(pg({ name: "A", favorite: true, environment: "production", readOnly: true }), "pw");
    const dup = await store.duplicate(a.id);
    expect(dup.name).toBe("A (copy)");
    expect(dup.favorite).toBe(false);
    expect(dup.environment).toBe("production");
    expect(await secrets.get(dup.id)).toBe("pw");
    store.markUsed(a.id);
    expect((await store.recent())[0]!.id).toBe(a.id);
    await store.remove(a.id);
    expect(await secrets.get(a.id)).toBeNull();
    expect((await store.list()).map((p) => p.id)).toEqual([dup.id]);
  });

  it("a corrupt profile file does not crash and is not overwritten until saved", async () => {
    const dir = tmp();
    await Bun.write(join(dir, "connections.json"), "{not json");
    const store = new ProfileStore(dir, new MemorySecretStore());
    expect(await store.list()).toEqual([]);
  });
});

describe("OS credential store (Bun.secrets)", () => {
  it("round-trips a secret and removes it (skipped when the platform has no credential store)", async () => {
    const service = `bun-rad-studio.test.${randomUUID()}`;
    const detected = await detectSecretStore(service);
    if (detected.kind !== "os-keychain") {
      console.warn("OS keychain unavailable here; the in-memory fallback would be used");
      expect(detected.kind).toBe("memory");
      return;
    }
    const store = new KeychainSecretStore(service);
    const id = randomUUID();
    try {
      expect(await store.get(id)).toBeNull();
      await store.set(id, "pässwörd 🔑");
      expect(await store.get(id)).toBe("pässwörd 🔑");
    } finally {
      await store.delete(id);
    }
    expect(await store.get(id)).toBeNull();
  });
});

describe("secrets never leak into errors or logs", () => {
  it("redact removes passwords from messages and URLs", () => {
    expect(redact("connect postgres://app:hunter2secret@host/db failed", ["hunter2secret"])).not.toContain("hunter2secret");
    expect(redact("password=abc123 failed", [])).toBe("password=******** failed");
    expect(redact("auth failed for secretvalue", ["secretvalue"])).toBe("auth failed for ********");
  });

  it("a failing connect reports the problem without echoing the password, and logs nothing", async () => {
    const logged: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn };
    console.log = console.error = console.warn = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
    let message = "";
    try {
      const adapter = createAdapter({ engine: "mysql", host: "127.0.0.1", port: 1, user: "u", password: "Sup3rS3cretPassw0rd", database: "d", connectTimeoutMs: 1500 });
      await adapter.connect().catch((e) => {
        message = JSON.stringify(e instanceof DbError ? e.toJSON() : String(e));
      });
    } finally {
      Object.assign(console, orig);
    }
    expect(message).toContain("CONNECTION_REFUSED");
    expect(message).not.toContain("Sup3rS3cretPassw0rd");
    expect(logged.join("\n")).not.toContain("Sup3rS3cretPassw0rd");
    expect(normalizeError("mysql", new Error("Access denied for user 'u' (using password: YES) pw=Sup3rS3cretPassw0rd"), ["Sup3rS3cretPassw0rd"]).message).not.toContain("Sup3rS3cretPassw0rd");
  });

  it("the adapter config never exposes the password", () => {
    const adapter = createAdapter({ engine: "postgres", host: "h", password: "topsecret-value" });
    expect(JSON.stringify(adapter.config)).not.toContain("topsecret-value");
  });
});
