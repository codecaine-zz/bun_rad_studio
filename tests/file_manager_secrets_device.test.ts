import { afterAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SERVICE, bunCredentialStore, encodeEntry, entryName, parseEntry, probe } from "../src/features/filemanager/fmSecretsDevice";
import { FLAG_DEVICE, parseHeader } from "../src/features/filemanager/fmSecretsFormat";
import { PASSWORD, PASSWORD2, createVault, loginItem, makeEnv, type Env } from "./file_manager_secrets_helpers";

const DAY = 86_400_000;
const envs: Env[] = [];
const fresh = (extra = {}) => {
  const e = makeEnv(extra);
  envs.push(e);
  return e;
};
afterAll(() => {
  for (const e of envs) {
    e.svc.lock();
    rmSync(e.root, { recursive: true, force: true });
  }
});

const vaultFile = (e: Env) => join(e.dataDir, "file_manager_secrets.radsec");
const header = (e: Env) => parseHeader(readFileSync(vaultFile(e)));
const entryKey = (e: Env) => `${SERVICE}\u0000${entryName(header(e).vaultId)}`;
const failure = async (p: Promise<unknown>): Promise<{ code: string; message: string }> => {
  try {
    await p;
  } catch (e: any) {
    return { code: e.code, message: e.message };
  }
  throw new Error("expected a failure");
};

/** A vault with "Unlock with this computer" turned on, left locked. */
async function deviceVault(e: Env, body: Record<string, any> = {}) {
  await createVault(e, body);
  await e.call("secrets/settings", { settings: { autoLockMinutes: 0 } });
  const item = (await e.call("secrets/save", { item: loginItem({ title: "Inside" }) })).item;
  await e.call("secrets/device", { action: "enable", password: PASSWORD });
  e.svc.lock();
  return item;
}

describe("Unlock with this computer", () => {
  test("it is off by default; turning it on needs the master password, stores a random key in the credential store and a third wrapping in the file", async () => {
    const e = fresh();
    await createVault(e);
    expect((await e.call("secrets/status")).status.device).toBe(false);
    expect(e.store.map.size).toBe(0);
    await expect(e.call("secrets/device", { action: "enable" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await failure(e.call("secrets/device", { action: "enable", password: "Wrong-Password-1234!" }))).code).toBe("WRONG_PASSWORD");
    expect(e.store.map.size).toBe(0);
    const res = await e.call("secrets/device", { action: "enable", password: PASSWORD });
    expect(res.status.device).toBe(true);
    expect(header(e).flags & FLAG_DEVICE).toBe(FLAG_DEVICE);
    // named by the vault's random id (public, inside the header), never by the file's path
    const [key, value] = [...e.store.map.entries()][0]!;
    expect(key).toBe(entryKey(e));
    expect(key).toContain("vault-device-key:");
    expect(key.includes(e.root)).toBe(false);
    const entry = parseEntry(value!)!;
    expect(entry.key.length).toBe(32);
    expect(entry.days).toBe(14);
    expect(value!.includes(PASSWORD)).toBe(false);
    expect(readFileSync(vaultFile(e)).includes(entry.key)).toBe(false);
  });

  test("unlocking with it needs no password, never counts as a wrong password, and the master password still works beside it", async () => {
    const e = fresh();
    const item = await deviceVault(e);
    expect((await e.call("secrets/status")).status).toMatchObject({ locked: true, device: true });
    await e.call("secrets/unlock", { device: true });
    expect((await e.call("secrets/status")).status).toMatchObject({ locked: false, via: "device" });
    expect((await e.call("secrets/get", { id: item.id })).item.title).toBe("Inside");
    // sensitive actions still ask for the master password
    await expect(e.call("secrets/change-password", { newPassword: PASSWORD2 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(e.call("secrets/export-csv", { path: join(e.root, "x.csv"), confirm: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await e.call("secrets/audit")).events.map((x: any) => x.ev)).toContain("device-unlock");
    e.svc.lock();
    await e.call("secrets/unlock", { password: PASSWORD });
    expect((await e.call("secrets/status")).status.via).toBe("password");
  });

  test("a missing, damaged, wrong or unreachable entry falls back to the master password with a plain message and leaves no trace", async () => {
    const e = fresh();
    await deviceVault(e);
    const real = e.store.map.get(entryKey(e))!;
    const codes: string[] = [];
    e.store.map.delete(entryKey(e));
    codes.push((await failure(e.call("secrets/unlock", { device: true }))).code);
    e.store.map.set(entryKey(e), "not json at all");
    codes.push((await failure(e.call("secrets/unlock", { device: true }))).code);
    e.store.map.set(entryKey(e), JSON.stringify({ v: 1, key: randomBytes(32).toString("base64"), passwordAt: e.clock.now(), days: 14 }));
    const wrongKey = await failure(e.call("secrets/unlock", { device: true }));
    codes.push(wrongKey.code);
    expect(wrongKey.message).toMatch(/Use your master password/);
    e.store.map.set(entryKey(e), real);
    e.store.down = true;
    const down = await failure(e.call("secrets/unlock", { device: true }));
    codes.push(down.code);
    expect(down.message).toMatch(/isn't available or didn't allow access/);
    expect(down.message).not.toMatch(/Error|\bat \w/);
    e.store.down = false;
    expect(codes).toEqual(["DEVICE_MISSING", "DEVICE_MISSING", "DEVICE_CHANGED", "DEVICE_UNAVAILABLE"]);
    expect(e.svc.unlocked).toBeNull();
    expect((await e.call("secrets/status")).status.waitMs).toBe(0); // none of this counted against the password
    expect(() => readFileSync(`${vaultFile(e)}.attempts`)).toThrow();
    await e.call("secrets/unlock", { password: PASSWORD });
    e.svc.lock();
    await e.call("secrets/unlock", { device: true }); // the real entry still works
    expect(e.svc.unlocked).not.toBeNull();
  });

  test("a tampered wrapping in the file fails to open with the device key, and the header MAC stops the other paths too", async () => {
    const e = fresh();
    await deviceVault(e);
    const good = readFileSync(vaultFile(e));
    const h = parseHeader(good);
    const bad = Buffer.from(good);
    bad[h.length - 32 - 30] = bad[h.length - 32 - 30]! ^ 1; // inside the device wrap
    writeFileSync(vaultFile(e), bad);
    expect((await failure(e.call("secrets/unlock", { device: true }))).code).toBe("DEVICE_CHANGED");
    expect((await failure(e.call("secrets/unlock", { password: PASSWORD }))).code).toBe("WRONG_OR_DAMAGED");
    writeFileSync(vaultFile(e), good);
    e.clock.advance(60_000);
    await e.call("secrets/unlock", { password: PASSWORD });
  });

  test("a vault with no device wrapping says so; a copy of the vault on another computer finds no key there", async () => {
    const plain = fresh();
    await createVault(plain);
    plain.svc.lock();
    expect((await failure(plain.call("secrets/unlock", { device: true }))).code).toBe("DEVICE_OFF");
    const source = fresh();
    await deviceVault(source);
    const elsewhere = fresh(); // another computer: same vault file, its own (empty) credential store
    mkdirSync(elsewhere.dataDir, { recursive: true });
    copyFileSync(vaultFile(source), vaultFile(elsewhere));
    expect((await failure(elsewhere.call("secrets/unlock", { device: true }))).code).toBe("DEVICE_MISSING");
    await elsewhere.call("secrets/unlock", { password: PASSWORD });
    expect(elsewhere.store.map.size).toBe(0); // opening a copy elsewhere doesn't create a key
  });

  test("it expires after N days without the master password; typing the password brings it back", async () => {
    const e = fresh();
    await deviceVault(e);
    e.clock.advance(13 * DAY);
    await e.call("secrets/unlock", { device: true });
    e.svc.lock();
    e.clock.advance(DAY + 1000); // 14 days and a bit since the master password was typed
    const expired = await failure(e.call("secrets/unlock", { device: true }));
    expect(expired.code).toBe("DEVICE_EXPIRED");
    expect(expired.message).toMatch(/at least every 14 days/);
    await e.call("secrets/unlock", { password: PASSWORD }); // refreshes the clock on the entry
    e.svc.lock();
    e.clock.advance(10 * DAY);
    await e.call("secrets/unlock", { device: true });
    expect(e.svc.unlocked).not.toBeNull();
    // the limit is a setting (1 to 90 days) and is copied to the entry
    await e.call("secrets/settings", { settings: { deviceMaxDays: 1 } });
    expect(parseEntry(e.store.map.get(entryKey(e))!)!.days).toBe(1);
    e.svc.lock();
    e.clock.advance(2 * DAY);
    expect((await failure(e.call("secrets/unlock", { device: true }))).code).toBe("DEVICE_EXPIRED");
    // an entry stamped in the far future is not trusted either
    const entry = parseEntry(e.store.map.get(entryKey(e))!)!;
    e.store.map.set(entryKey(e), encodeEntry({ ...entry, passwordAt: e.clock.now() + 30 * DAY, days: 90 }));
    expect((await failure(e.call("secrets/unlock", { device: true }))).code).toBe("DEVICE_EXPIRED");
  });

  test("changing the master password or the Argon2 settings keeps the device shortcut working; rotating the key ends it", async () => {
    const e = fresh();
    await deviceVault(e);
    await e.call("secrets/unlock", { password: PASSWORD });
    await e.call("secrets/change-password", { password: PASSWORD, newPassword: PASSWORD2 });
    await e.call("secrets/rekey", { password: PASSWORD2, strength: "strong" });
    e.svc.lock();
    await e.call("secrets/unlock", { device: true });
    expect((await e.call("secrets/status")).status).toMatchObject({ via: "device", device: true });
    e.svc.lock();
    await e.call("secrets/unlock", { password: PASSWORD2 });
    await e.call("secrets/rekey", { password: PASSWORD2, strength: "standard", rotateKey: true });
    expect((await e.call("secrets/status")).status.device).toBe(false);
    expect(e.store.map.size).toBe(0);
    e.svc.lock();
    expect((await failure(e.call("secrets/unlock", { device: true }))).code).toBe("DEVICE_OFF");
  });

  test("turning it off removes the keychain entry and the wrapping in the file, and the old backups that still had it", async () => {
    const e = fresh();
    await deviceVault(e);
    await e.call("secrets/unlock", { password: PASSWORD });
    await e.call("secrets/save", { item: loginItem({ title: "Later" }) });
    const res = await e.call("secrets/device", { action: "disable" });
    expect(res).toMatchObject({ keychainRemoved: true, status: { device: false } });
    expect(e.store.map.size).toBe(0);
    expect(header(e).flags & FLAG_DEVICE).toBe(0);
    expect(header(e).devWrap).toBeNull();
    for (const n of [1, 2, 3]) expect(() => readFileSync(`${vaultFile(e)}.${n}`)).toThrow();
    e.svc.lock();
    expect((await failure(e.call("secrets/unlock", { device: true }))).code).toBe("DEVICE_OFF");
    await e.call("secrets/unlock", { password: PASSWORD });
  });

  test("turning it off still removes the file wrapping when the keychain can't be reached, and says so", async () => {
    const e = fresh();
    await deviceVault(e);
    await e.call("secrets/unlock", { password: PASSWORD });
    e.store.down = true;
    const res = await e.call("secrets/device", { action: "disable" });
    expect(res.keychainRemoved).toBe(false);
    expect(res.status.device).toBe(false);
    expect(header(e).devWrap).toBeNull();
  });

  test("turning it on when the credential store is unavailable changes nothing, and the failed check is remembered for a minute", async () => {
    const e = fresh();
    await createVault(e);
    e.store.down = true;
    const before = readFileSync(vaultFile(e));
    const err = await failure(e.call("secrets/device", { action: "enable", password: PASSWORD }));
    expect(err.code).toBe("DEVICE_UNAVAILABLE");
    expect(err.message).toMatch(/Secret Service|didn't allow/);
    expect(readFileSync(vaultFile(e)).equals(before)).toBe(true);
    expect((await e.call("secrets/status")).status.device).toBe(false);
    e.store.down = false;
    expect((await e.call("secrets/device", { action: "probe" })).availability.ok).toBe(false);
    e.clock.advance(61_000);
    expect((await e.call("secrets/device", { action: "probe" })).availability.ok).toBe(true);
  });

  test("a failed save while turning it on removes the entry again", async () => {
    const e = fresh();
    await createVault(e);
    e.svc.hooks.faultBeforeRename = () => {
      throw new Error("disk full");
    };
    await expect(e.call("secrets/device", { action: "enable", password: PASSWORD })).rejects.toThrow();
    e.svc.hooks.faultBeforeRename = undefined;
    expect(e.store.map.size).toBe(0);
    expect(header(e).devWrap).toBeNull();
  });

  test("destroying the vault also removes its keychain entry", async () => {
    const e = fresh();
    await deviceVault(e);
    expect(e.store.map.size).toBe(1);
    await e.call("secrets/destroy", { confirm: "DELETE" });
    expect(e.store.map.size).toBe(0);
  });

  test("an unknown action is refused", async () => {
    const e = fresh();
    await createVault(e);
    await expect(e.call("secrets/device", { action: "explode" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("the real credential store (Bun.secrets)", () => {
  test.skipIf(Boolean(process.env.CI))("a random test service round-trips and is cleaned up", async () => {
    const real = bunCredentialStore();
    const availability = await probe(real);
    if (!availability.ok) return; // Linux without a Secret Service: nothing to test here
    const service = `codecaine-fm-test-${randomBytes(6).toString("hex")}`;
    const name = "vault-device-key:smoke";
    try {
      expect(await real.get(service, name)).toBeNull();
      const entry = { key: randomBytes(32), passwordAt: Date.now(), days: 14 };
      await real.set(service, name, encodeEntry(entry));
      const back = parseEntry(await real.get(service, name));
      expect(back?.key.equals(entry.key)).toBe(true);
    } finally {
      await real.delete(service, name).catch(() => false);
    }
    expect(await real.get(service, name)).toBeNull();
  });
});
