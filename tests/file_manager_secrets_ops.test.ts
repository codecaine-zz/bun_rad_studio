import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { PASSWORD, PASSWORD2, TOKEN, createVault, loginItem, makeEnv, type Env } from "./file_manager_secrets_helpers";

const envs: Env[] = [];
const fresh = (extra = {}, http = false) => {
  const e = makeEnv(extra, { http });
  envs.push(e);
  return e;
};
const logged: string[] = [];
const spies: Array<{ mockRestore: () => void }> = [];
beforeAll(() => {
  for (const m of ["log", "error", "warn", "info", "debug"] as const) spies.push(spyOn(console, m).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" "))));
});
afterAll(() => {
  for (const s of spies) s.mockRestore();
  for (const e of envs) {
    e.stop();
    e.svc.lock();
    rmSync(e.root, { recursive: true, force: true });
  }
});

const vaultFile = (e: Env) => join(e.dataDir, "file_manager_secrets.radsec");
const save = async (e: Env, item: Record<string, any>, id?: string) => (await e.call("secrets/save", { id, item })).item;
const failure = async (p: Promise<unknown>): Promise<{ code: string; message: string; details?: any }> => {
  try {
    await p;
  } catch (e: any) {
    return { code: e.code, message: e.message, details: e.details };
  }
  throw new Error("expected a failure");
};

describe("who may call, and what is validated", () => {
  test("a token is required, foreign pages and hosts are refused, unknown operations and bad bodies get plain answers", async () => {
    const e = fresh({}, true);
    for (const headers of [{}, { "x-fm-token": "wrong" }, { "x-fm-token": `${TOKEN}x` }] as Array<Record<string, string>>) expect((await e.http("secrets/status", {}, headers)).status).toBe(401);
    const headers = { "Content-Type": "application/json", "x-fm-token": TOKEN };
    expect((await fetch(`${e.base}/api/secrets/status`, { method: "POST", headers: { ...headers, Origin: "https://evil.example" }, body: "{}" })).status).toBe(403);
    expect((await fetch(`${e.base}/api/secrets/status`, { method: "POST", headers: { ...headers, Host: "attacker.example" }, body: "{}" })).status).toBe(403);
    expect((await fetch(`${e.base}/api/secrets/unlock`, { method: "GET" })).status).not.toBe(200);
    expect((await e.http("secrets/nonsense")).status).toBe(404);
    const bad = await e.http("secrets/create", { password: 12345 });
    expect(bad.status).toBe(400);
    expect(bad.json.error.message).toMatch(/master password/i);
    expect(["127.0.0.1", "::1", "localhost"]).toContain(String(e.server!.hostname));
    expect((await e.http("secrets/status")).json.status.exists).toBe(false);
  });

  test("the master password rules: 12 characters and about 60 bits, or a passphrase of 5 or more words", async () => {
    const e = fresh();
    for (const weak of ["Qz9!", "Password1234", "aaaaaaaaaaaaaaaa", "qwertyuiopasdf", "Summer2024!!", "twelve-ch12", "1234567890123456"]) {
      const err = await failure(e.call("secrets/create", { password: weak }));
      expect(err.code, weak).toBe("WEAK_PASSWORD");
      expect(err.message.includes(weak), weak).toBe(false);
    }
    expect(existsSync(vaultFile(e))).toBe(false);
    expect((await failure(e.call("secrets/create", { password: PASSWORD, strength: "extreme" }))).code).toBe("BAD_REQUEST");
    expect((await e.call("secrets/check-password", { password: "short" })).acceptable).toBe(false);
    expect((await e.call("secrets/check-password", { password: PASSWORD2 })).acceptable).toBe(true);
    await e.call("secrets/create", { password: PASSWORD2 }); // five or more words is accepted
    expect(e.svc.unlocked).not.toBeNull();
    expect((await failure(e.call("secrets/create", { password: PASSWORD }))).code).toBe("EXISTS");
  });

  test("status never leaks: locked it says nothing about contents, unlocked it only counts", async () => {
    const e = fresh();
    expect((await e.call("secrets/status")).status).toMatchObject({ exists: false, locked: true, params: null });
    await createVault(e);
    await save(e, loginItem({ title: "Hidden-title-ZZ9", fields: { username: "hidden-user-ZZ9", password: "hidden-pw-ZZ9!", url: "https://zz9.test" } }));
    const open = JSON.stringify(await e.call("secrets/status"));
    expect(open).toMatch(/"items":1/);
    for (const m of ["Hidden-title-ZZ9", "hidden-user-ZZ9", "hidden-pw-ZZ9", "zz9.test", PASSWORD]) expect(open.includes(m), m).toBe(false);
    e.svc.lock();
    const locked = (await e.call("secrets/status")).status;
    expect(locked).toMatchObject({ exists: true, locked: true, keyFile: false, recovery: true, device: false });
    expect(locked.items).toBeUndefined();
    expect(locked.params).toMatchObject({ strength: "standard", passes: 1, parallelism: 1 });
    expect(JSON.stringify(locked)).not.toContain("Hidden-title");
  });

  test("while locked nothing but status, unlock, create, generate and password checks works", async () => {
    const e = fresh();
    await createVault(e);
    e.svc.lock();
    for (const [op, body] of [["secrets/list", {}], ["secrets/get", { id: "x" }], ["secrets/reveal", { id: "x", field: "password" }], ["secrets/copy", { id: "x", field: "password" }], ["secrets/save", { item: loginItem() }], ["secrets/health", {}], ["secrets/audit", {}], ["secrets/settings", {}], ["secrets/facets", {}], ["secrets/delete", { id: "x" }], ["secrets/totp", { id: "x" }]] as const) {
      expect((await failure(e.call(op, body as any))).code, op).toBe("LOCKED");
    }
    expect((await e.call("secrets/generate", {})).generated.value.length).toBe(20);
    expect((await e.call("secrets/check-password", { password: "x" })).acceptable).toBe(false);
  });
});

describe("secrets only travel when asked for", () => {
  test("list and get never carry a secret; reveal and copy give exactly one field, and only when unlocked", async () => {
    const e = fresh({}, true);
    await e.http("secrets/create", { password: PASSWORD });
    const saved = await e.http("secrets/save", { item: { type: "login", title: "Site", fields: { username: "pub-user", password: "SECRET-PW-M1", url: "https://site.test", totp: "JBSWY3DPEHPK3PXP" }, notes: "SECRET-NOTE-M2", custom: [{ label: "pin", kind: "hidden", value: "SECRET-CUSTOM-M3" }, { label: "plain", kind: "text", value: "visible" }] } });
    const id = saved.json.item.id;
    for (const body of [saved.text, (await e.http("secrets/list", {})).text, (await e.http("secrets/get", { id })).text, (await e.http("secrets/status", {})).text, (await e.http("secrets/facets", {})).text]) {
      for (const m of ["SECRET-PW-M1", "SECRET-NOTE-M2", "SECRET-CUSTOM-M3", "JBSWY3DPEHPK3PXP"]) expect(body.includes(m), m).toBe(false);
    }
    const detail = (await e.http("secrets/get", { id })).json.item;
    expect(detail.fields).toEqual({ username: "pub-user", url: "https://site.test" });
    expect(detail.present).toMatchObject({ password: true, totp: true });
    expect(detail.custom).toEqual([{ id: expect.any(String), label: "pin", kind: "hidden", hasValue: true }, { id: expect.any(String), label: "plain", kind: "text", hasValue: true, value: "visible" }]);
    expect((await e.http("secrets/reveal", { id, field: "password" })).json.value).toBe("SECRET-PW-M1");
    expect((await e.http("secrets/reveal", { id, field: "notes" })).json.value).toBe("SECRET-NOTE-M2");
    expect((await e.http("secrets/reveal", { id, field: `custom:${detail.custom[0].id}` })).json.value).toBe("SECRET-CUSTOM-M3");
    expect((await e.http("secrets/reveal", { id, field: "nope" })).status).toBe(400);
    expect((await e.http("secrets/reveal", { id: "unknown", field: "password" })).json.error.code).toBe("NOT_FOUND");
    const copy = await e.http("secrets/copy", { id, field: "password" });
    expect(copy.text.includes("SECRET-PW-M1")).toBe(false);
    expect(copy.json).toMatchObject({ copied: true, clearsInSeconds: 30 });
    expect(e.clip.text).toBe("SECRET-PW-M1");
    await e.http("secrets/lock");
    const after = await e.http("secrets/reveal", { id, field: "password" });
    expect(after.status).toBe(400);
    expect(after.json.error.code).toBe("LOCKED");
  });

  test("no secret appears in any non-reveal response, error message, log line or on disk (marker strings through every operation)", async () => {
    logged.length = 0;
    const e = fresh({}, true);
    const MARK = { pw: "MARK-PW-7f3a9", note: "MARK-NOTE-7f3a9", card: "4929MARK7f3a9", custom: "MARK-CUSTOM-7f3a9", master: "MARK-MASTER-7f3a9-Zx!" };
    const seen: string[] = [];
    const record = async (op: string, body: Record<string, any> = {}) => {
      const r = await e.http(op, body);
      seen.push(r.text);
      return r;
    };
    const created = await record("secrets/create", { password: MARK.master, recovery: true });
    seen.pop(); // the one answer that carries the recovery key, by design
    expect(created.json.recoveryKey).toBeTruthy();
    const a = (await record("secrets/save", { item: { type: "login", title: "A", fields: { username: "u", password: MARK.pw, url: "https://a.test", totp: "JBSWY3DPEHPK3PXP" }, notes: MARK.note, custom: [{ label: "k", kind: "hidden", value: MARK.custom }] } })).json.item;
    const card = (await record("secrets/save", { item: { type: "card", title: "C", fields: { number: MARK.card, cvv: "999" } } })).json.item;
    await record("secrets/save", { id: a.id, item: { fields: { password: `${MARK.pw}-2` } } });
    for (const [op, body] of [
      ["secrets/status", {}], ["secrets/list", { query: MARK.note }], ["secrets/list", { query: MARK.pw }], ["secrets/get", { id: a.id }], ["secrets/get", { id: card.id }], ["secrets/facets", {}], ["secrets/health", {}], ["secrets/audit", {}], ["secrets/settings", {}],
      ["secrets/duplicate", { id: a.id }], ["secrets/delete", { id: a.id }], ["secrets/restore", { id: a.id }], ["secrets/import", { text: `title,url,username,password\nImp,https://i.test,u,${MARK.pw}\n` }],
      ["secrets/save", { item: { type: "nope", title: MARK.pw, notes: MARK.note } }], ["secrets/save", { id: "missing", item: { notes: MARK.note } }], ["secrets/reveal", { id: a.id, field: MARK.pw }], ["secrets/copy", { id: a.id, field: MARK.note }],
      ["secrets/change-password", { password: MARK.pw, newPassword: MARK.pw }], ["secrets/change-password", { password: "wrong-password-MARK-1!", newPassword: MARK.master }], ["secrets/change-password", { password: MARK.master, newPassword: `${MARK.pw}short` }],
      ["secrets/export-csv", { path: join(e.root, "x.csv"), confirm: true, password: MARK.pw }], ["secrets/recovery", { action: "verify", recoveryKey: MARK.pw }], ["secrets/import-backup", { path: join(e.root, "missing"), password: MARK.pw }],
      ["secrets/unlock", { password: MARK.pw }], ["secrets/attach", { id: a.id, path: join(e.root, "missing") }],
    ] as const) await record(op, body as any);
    await record("secrets/lock");
    await record("secrets/unlock", { password: MARK.pw });
    await record("secrets/unlock", { recoveryKey: MARK.pw });
    await record("secrets/unlock", { password: MARK.master });
    await record("secrets/lock");
    for (const m of [MARK.pw, MARK.note, MARK.card, MARK.custom, MARK.master, "JBSWY3DPEHPK3PXP"]) expect(seen.filter((t) => t.includes(m)).length, m).toBe(0);
    expect(seen.filter((t) => t.includes(created.json.recoveryKey)).length).toBe(0);
    expect(logged.join("\n")).not.toMatch(/MARK-|4929MARK/);
    const raw = readFileSync(vaultFile(e)).toString("latin1");
    for (const m of [MARK.pw, MARK.note, MARK.custom, MARK.card, MARK.master, "JBSWY3DPEHPK3PXP"]) expect(raw.includes(m)).toBe(false);
    for (const f of readdirSync(e.dataDir)) expect(readFileSync(join(e.dataDir, f)).toString("latin1").includes("MARK-")).toBe(false);
  });
});

describe("locking", () => {
  test("lock zeroes the key buffers and drops the database; the spy on destroy fires once", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem());
    const session = e.svc.session!;
    const dataKey = session.keys.dataKey;
    expect(dataKey.some((b) => b !== 0)).toBe(true);
    const destroy = spyOn(session, "destroy");
    const res = await e.call("secrets/lock");
    expect(res.saved).toBe(true);
    expect(res.status.locked).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(dataKey.every((b) => b === 0)).toBe(true);
    expect(session.db).toBeNull();
    expect(e.svc.session).toBeNull();
    expect(() => session.database()).toThrow(/locked/);
    destroy.mockRestore();
  });

  test("it locks itself after the idle time, counting from the last real use (status polling does not count)", async () => {
    const e = fresh();
    await createVault(e);
    expect((await e.call("secrets/status")).status.idleSeconds).toBe(300);
    e.clock.advance(4 * 60_000 + 59_000);
    expect((await e.call("secrets/status")).status.idleSeconds).toBe(1);
    expect(e.svc.unlocked).not.toBeNull();
    await e.call("secrets/ping"); // activity restarts the countdown
    expect((await e.call("secrets/status")).status.idleSeconds).toBe(300);
    e.clock.advance(2 * 60_000);
    await e.call("secrets/list");
    e.clock.advance(4 * 60_000);
    expect(e.svc.unlocked).not.toBeNull();
    e.clock.advance(60_001);
    expect(e.svc.unlocked).toBeNull();
    expect((await e.call("secrets/status")).status.locked).toBe(true);
    expect(e.clock.pending()).toBe(0);
    await e.call("secrets/unlock", { password: PASSWORD });
    expect((await e.call("secrets/audit")).events.map((x: any) => x.ev)).toEqual(expect.arrayContaining(["created", "auto-lock", "unlock"]));
  });

  test("the idle time is a setting: 1 to 60 minutes or never; bad values are refused", async () => {
    const e = fresh();
    await createVault(e);
    await e.call("secrets/settings", { settings: { autoLockMinutes: 1 } });
    e.clock.advance(61_000);
    expect(e.svc.unlocked).toBeNull();
    await e.call("secrets/unlock", { password: PASSWORD });
    expect((await e.call("secrets/status")).status.settings.autoLockMinutes).toBe(1);
    for (const bad of [{ autoLockMinutes: 61 }, { autoLockMinutes: -1 }, { autoLockMinutes: 1.5 }, { clipboardSeconds: 5 }, { clipboardSeconds: 121 }, { deviceMaxDays: 0 }, { deviceMaxDays: 91 }]) expect((await failure(e.call("secrets/settings", { settings: bad }))).code, JSON.stringify(bad)).toBe("BAD_REQUEST");
    await e.call("secrets/settings", { settings: { autoLockMinutes: 0, clipboardSeconds: 0, lockOnBlur: true } });
    e.clock.advance(10 * 3600_000);
    expect(e.svc.unlocked).not.toBeNull();
    expect((await e.call("secrets/status")).status).toMatchObject({ idleSeconds: null, settings: { autoLockMinutes: 0, clipboardSeconds: 0, lockOnBlur: true } });
  });

  test("stopping the File Manager locks the vault and saves it (the shutdown hook)", async () => {
    const e = fresh({}, true);
    await e.http("secrets/create", { password: PASSWORD });
    await e.http("secrets/save", { item: loginItem({ title: "Before shutdown" }) });
    const key = e.svc.session!.keys.dataKey;
    e.server!.stop(true);
    expect(e.svc.session).toBeNull();
    expect(key.every((b) => b === 0)).toBe(true);
  });
});

describe("the clipboard", () => {
  test("copying is done by the server, clears itself after the set time, only if the clipboard is unchanged", async () => {
    const e = fresh();
    await createVault(e);
    const item = await save(e, loginItem({ fields: { username: "u", password: "Clip-pw-001!", url: "", totp: "JBSWY3DPEHPK3PXP" } }));
    const res = await e.call("secrets/copy", { id: item.id, field: "password" });
    expect(JSON.stringify(res)).not.toContain("Clip-pw-001!");
    expect(e.clip.text).toBe("Clip-pw-001!");
    e.clock.advance(29_000);
    expect(e.clip.text).toBe("Clip-pw-001!");
    e.clock.advance(1_000);
    expect(e.clip.text).toBe("");
    // the person copied something else in the meantime: leave it alone
    await e.call("secrets/copy", { id: item.id, field: "password" });
    e.clip.text = "something I copied myself";
    e.clock.advance(31_000);
    expect(e.clip.text).toBe("something I copied myself");
    // a second copy restarts the timer; the one-time code is copied as the current code
    await e.call("secrets/copy", { id: item.id, field: "password" });
    e.clock.advance(20_000);
    await e.call("secrets/copy", { id: item.id, field: "totp" });
    expect(e.clip.text).toMatch(/^\d{6}$/);
    e.clock.advance(20_000);
    expect(e.clip.text).toMatch(/^\d{6}$/);
    e.clock.advance(11_000);
    expect(e.clip.text).toBe("");
    await expect(e.call("secrets/copy", { id: item.id, field: "notes" })).rejects.toThrow(/nothing to copy/);
  });

  test("the time is configurable, 'never' sets no timer, and locking clears a copy that is still there", async () => {
    const e = fresh();
    await createVault(e);
    const item = await save(e, loginItem({ fields: { username: "u", password: "Clip-pw-002!", url: "" } }));
    await e.call("secrets/settings", { settings: { clipboardSeconds: 10, autoLockMinutes: 0 } });
    await e.call("secrets/copy", { id: item.id, field: "password" });
    e.clock.advance(10_000);
    expect(e.clip.text).toBe("");
    await e.call("secrets/settings", { settings: { clipboardSeconds: 0 } });
    const before = e.clock.pending();
    expect((await e.call("secrets/copy", { id: item.id, field: "password" })).clearsInSeconds).toBeNull();
    expect(e.clock.pending()).toBe(before);
    e.clock.advance(3600_000);
    expect(e.clip.text).toBe("Clip-pw-002!");
    await e.call("secrets/settings", { settings: { clipboardSeconds: 60 } });
    await e.call("secrets/copy", { id: item.id, field: "password" });
    await e.call("secrets/lock");
    expect(e.clip.text).toBe("");
  });
});

describe("wrong passwords, throttling and damaged files", () => {
  test("after a few wrong passwords each try costs a growing wait; the wait is kept in a small non-secret file", async () => {
    const e = fresh();
    await createVault(e);
    e.svc.lock();
    const wrong = async () => failure(e.call("secrets/unlock", { password: "Wrong-Password-1234!" }));
    expect((await wrong()).code).toBe("WRONG_OR_DAMAGED");
    expect((await wrong()).details).toBeUndefined();
    const third = await wrong();
    expect(third.details.retryAfterMs).toBe(1000);
    const counter = JSON.parse(readFileSync(`${vaultFile(e)}.attempts`, "utf8"));
    expect(Object.keys(counter).sort()).toEqual(["fails", "lastFailAt", "until"]);
    expect(counter.fails).toBe(3);
    const early = await failure(e.call("secrets/unlock", { password: PASSWORD }));
    expect(early.code).toBe("THROTTLED");
    expect(early.message).toMatch(/Wait 1 second/);
    expect((await e.call("secrets/status")).status.waitMs).toBeGreaterThan(0);
    e.clock.advance(1000);
    const fourth = await wrong();
    expect(fourth.details.retryAfterMs).toBe(2000);
    e.clock.advance(2000);
    expect((await wrong()).details.retryAfterMs).toBe(4000);
    expect((await failure(e.call("secrets/unlock", { password: PASSWORD }))).code).toBe("THROTTLED");
    e.clock.advance(4000);
    await e.call("secrets/unlock", { password: PASSWORD });
    expect(existsSync(`${vaultFile(e)}.attempts`)).toBe(false);
    expect((await e.call("secrets/audit")).events.find((x: any) => x.ev === "failed-attempts").n).toBe(5);
    e.svc.lock();
    for (let i = 0; i < 20; i++) {
      const err = await wrong();
      if (err.details) e.clock.advance(err.details.retryAfterMs);
    }
    expect(JSON.parse(readFileSync(`${vaultFile(e)}.attempts`, "utf8")).until - e.clock.now()).toBeLessThanOrEqual(15 * 60_000);
  });

  test("a wrong password, a damaged file and a header with absurd settings give the same message; only a foreign file says what it is", async () => {
    const e = fresh();
    await createVault(e);
    e.svc.lock();
    const good = readFileSync(vaultFile(e));
    const wrongPw = await failure(e.call("secrets/unlock", { password: "Wrong-Password-1234!" }));
    e.clock.advance(60_000);
    const flipped = Buffer.from(good);
    flipped[flipped.length - 3] = flipped[flipped.length - 3]! ^ 0xff;
    writeFileSync(vaultFile(e), flipped);
    const damaged = await failure(e.call("secrets/unlock", { password: PASSWORD }));
    e.clock.advance(60_000);
    const bomb = Buffer.from(good);
    bomb.writeUInt32BE(0xffffffff, 9);
    writeFileSync(vaultFile(e), bomb);
    const started = performance.now();
    const bombed = await failure(e.call("secrets/unlock", { password: PASSWORD }));
    expect(performance.now() - started).toBeLessThan(5000);
    e.clock.advance(60_000);
    writeFileSync(vaultFile(e), good.subarray(0, good.length - 100));
    const cut = await failure(e.call("secrets/unlock", { password: PASSWORD }));
    for (const f of [damaged, bombed, cut]) {
      expect(f.message).toBe(wrongPw.message);
      expect(f.code).toBe(wrongPw.code);
    }
    e.clock.advance(60_000);
    writeFileSync(vaultFile(e), "this is a text file, not a vault");
    const foreign = await failure(e.call("secrets/unlock", { password: PASSWORD }));
    expect(foreign.message).toBe("This isn't a RADSEC vault file.");
    expect((await e.call("secrets/status")).status.valid).toBe(false);
    writeFileSync(vaultFile(e), good);
    e.clock.advance(3600_000);
    await e.call("secrets/unlock", { password: PASSWORD });
  });

  test("unlocking with nothing typed or with no vault is refused in plain words", async () => {
    const e = fresh();
    expect((await failure(e.call("secrets/unlock", { password: PASSWORD }))).code).toBe("NO_VAULT");
    await createVault(e);
    e.svc.lock();
    expect((await failure(e.call("secrets/unlock", { password: "" }))).code).toBe("BAD_REQUEST");
    expect((await failure(e.call("secrets/unlock", {}))).code).toBe("BAD_REQUEST");
  });
});

describe("keys: key file, recovery key, change password, re-key, backups", () => {
  test("a key file is required when set; a wrong or missing one fails like a wrong password", async () => {
    const e = fresh();
    const kf = join(e.root, "my.key");
    const made = await e.call("secrets/keyfile", { path: kf });
    expect(made.path).toBe(kf);
    expect(statSync(kf).size).toBe(64);
    if (process.platform !== "win32") expect(statSync(kf).mode & 0o777).toBe(0o600);
    expect((await failure(e.call("secrets/keyfile", { path: kf }))).code).toBe("EXISTS");
    await e.call("secrets/create", { password: PASSWORD, keyFile: kf, recovery: false });
    expect((await e.call("secrets/status")).status).toMatchObject({ keyFile: true, recovery: false });
    e.svc.lock();
    expect((await failure(e.call("secrets/unlock", { password: PASSWORD }))).code).toBe("NEEDS_KEY_FILE");
    const other = join(e.root, "other.key");
    writeFileSync(other, randomBytes(64));
    expect((await failure(e.call("secrets/unlock", { password: PASSWORD, keyFile: other }))).code).toBe("WRONG_OR_DAMAGED");
    e.clock.advance(60_000);
    expect((await failure(e.call("secrets/unlock", { password: PASSWORD, keyFile: join(e.root, "missing.key") }))).code).toBe("BAD_KEY_FILE");
    await e.call("secrets/unlock", { password: PASSWORD, keyFile: kf });
    expect(e.svc.unlocked).not.toBeNull();
  });

  test("the recovery key opens a vault whose password is forgotten, and a new password can be set without the old one", async () => {
    const e = fresh();
    const created = await createVault(e);
    expect(created.recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    const item = await save(e, loginItem({ title: "Precious" }));
    e.svc.lock();
    await e.call("secrets/unlock", { recoveryKey: created.recoveryKey.toLowerCase() });
    expect((await e.call("secrets/status")).status.via).toBe("recovery");
    expect((await e.call("secrets/get", { id: item.id })).item.title).toBe("Precious");
    await e.call("secrets/change-password", { newPassword: PASSWORD2 });
    e.svc.lock();
    expect((await failure(e.call("secrets/unlock", { password: PASSWORD }))).code).toBe("WRONG_OR_DAMAGED");
    e.clock.advance(3600_000);
    await e.call("secrets/unlock", { password: PASSWORD2 });
    e.svc.lock();
    await e.call("secrets/unlock", { recoveryKey: created.recoveryKey });
    e.svc.lock();
    expect((await failure(e.call("secrets/unlock", { recoveryKey: "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA" }))).code).toBe("WRONG_OR_DAMAGED");
  });

  test("create, verify and remove the recovery key (the password is needed again), shown once", async () => {
    const e = fresh();
    await createVault(e, { recovery: false });
    expect((await failure(e.call("secrets/recovery", { action: "create" }))).code).toBe("BAD_REQUEST");
    expect((await failure(e.call("secrets/recovery", { action: "create", password: "Wrong-Password-1234!" }))).code).toBe("WRONG_PASSWORD");
    const made = await e.call("secrets/recovery", { action: "create", password: PASSWORD });
    expect(made.recoveryKey).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    expect(made.status.recovery).toBe(true);
    expect(JSON.stringify(await e.call("secrets/status"))).not.toContain(made.recoveryKey);
    expect((await e.call("secrets/recovery", { action: "verify", recoveryKey: made.recoveryKey })).matches).toBe(true);
    expect((await e.call("secrets/recovery", { action: "verify", recoveryKey: "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA" })).matches).toBe(false);
    const again = await e.call("secrets/recovery", { action: "create", password: PASSWORD });
    expect((await e.call("secrets/recovery", { action: "verify", recoveryKey: made.recoveryKey })).matches).toBe(false); // a new key replaces the old one
    await e.call("secrets/recovery", { action: "remove", password: PASSWORD });
    expect((await e.call("secrets/status")).status.recovery).toBe(false);
    expect((await e.call("secrets/recovery", { action: "verify", recoveryKey: again.recoveryKey })).matches).toBe(false);
  });

  test("changing the master password re-wraps the keys: the old password stops working, the data stays, old backups are deleted", async () => {
    const e = fresh();
    await createVault(e);
    const item = await save(e, loginItem({ title: "Data" }));
    await save(e, loginItem({ title: "More" }));
    expect(existsSync(`${vaultFile(e)}.1`)).toBe(true);
    expect((await failure(e.call("secrets/change-password", { password: "Wrong-Password-1234!", newPassword: PASSWORD2 }))).code).toBe("WRONG_PASSWORD");
    expect((await failure(e.call("secrets/change-password", { password: PASSWORD, newPassword: "weak" }))).code).toBe("WEAK_PASSWORD");
    const before = readFileSync(vaultFile(e));
    const res = await e.call("secrets/change-password", { password: PASSWORD, newPassword: PASSWORD2 });
    expect(res.backupsDeleted).toBeGreaterThan(0);
    expect(existsSync(`${vaultFile(e)}.1`)).toBe(false);
    expect(readFileSync(vaultFile(e)).equals(before)).toBe(false);
    e.svc.lock();
    expect((await failure(e.call("secrets/unlock", { password: PASSWORD }))).code).toBe("WRONG_OR_DAMAGED");
    e.clock.advance(3600_000);
    await e.call("secrets/unlock", { password: PASSWORD2 });
    expect((await e.call("secrets/reveal", { id: item.id, field: "password" })).value).toBe("S3cret-pw-1!");
  });

  test("re-key with other Argon2 settings keeps the data and the recovery key; rotating the key drops the recovery key and old backups", async () => {
    const e = fresh();
    const created = await createVault(e);
    const item = await save(e, loginItem({ title: "Data" }));
    expect((await e.call("secrets/status")).status.params.strength).toBe("standard");
    const re = await e.call("secrets/rekey", { password: PASSWORD, strength: "maximum" });
    expect(re.status.params).toMatchObject({ strength: "maximum", passes: 2, belowStandard: false });
    e.svc.lock();
    expect((await e.call("secrets/status")).status.params.strength).toBe("maximum");
    await e.call("secrets/unlock", { recoveryKey: created.recoveryKey });
    e.svc.lock();
    await e.call("secrets/unlock", { password: PASSWORD });
    expect((await e.call("secrets/get", { id: item.id })).item.title).toBe("Data");
    const rotated = await e.call("secrets/rekey", { password: PASSWORD, strength: "strong", rotateKey: true });
    expect(rotated.recoveryRemoved).toBe(true);
    expect(existsSync(`${vaultFile(e)}.1`)).toBe(false);
    e.svc.lock();
    expect((await failure(e.call("secrets/unlock", { recoveryKey: created.recoveryKey }))).code).toBe("WRONG_OR_DAMAGED");
    e.clock.advance(3600_000);
    await e.call("secrets/unlock", { password: PASSWORD });
    expect((await e.call("secrets/status")).status.params.strength).toBe("strong");
    expect((await failure(e.call("secrets/rekey", { password: PASSWORD, strength: "nope" }))).code).toBe("BAD_REQUEST");
  });

  test("an encrypted backup copy can be exported (locked or unlocked), never overwrites, and restoring verifies it first", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem({ title: "Original" }));
    await e.call("secrets/settings", { settings: { autoLockMinutes: 0 } });
    const backup = join(e.root, "backup.radsec");
    await e.call("secrets/export-backup", { path: backup });
    expect((await failure(e.call("secrets/export-backup", { path: backup }))).code).toBe("EXISTS");
    await save(e, loginItem({ title: "Newer" }));
    const current = readFileSync(vaultFile(e));
    const damaged = join(e.root, "damaged.radsec");
    const bytes = Buffer.from(readFileSync(backup));
    bytes[bytes.length - 2] = bytes[bytes.length - 2]! ^ 1;
    writeFileSync(damaged, bytes);
    expect((await failure(e.call("secrets/import-backup", { path: damaged, password: PASSWORD }))).code).toBe("WRONG_OR_DAMAGED");
    expect(readFileSync(vaultFile(e)).equals(current)).toBe(true);
    e.clock.advance(60_000);
    expect((await failure(e.call("secrets/import-backup", { path: backup, password: "Wrong-Password-1234!" }))).code).toBe("WRONG_OR_DAMAGED");
    expect(readFileSync(vaultFile(e)).equals(current)).toBe(true);
    const notVault = join(e.root, "notes.txt");
    writeFileSync(notVault, "hello");
    expect((await failure(e.call("secrets/import-backup", { path: notVault, password: PASSWORD }))).message).toMatch(/isn't a RADSEC/);
    e.clock.advance(3600_000);
    await e.call("secrets/import-backup", { path: backup, password: PASSWORD });
    expect((await e.call("secrets/list")).items.map((i: any) => i.title)).toEqual(["Original"]);
    expect(readFileSync(`${vaultFile(e)}.1`).equals(current)).toBe(true); // the vault it replaced is kept
    e.svc.lock();
    const locked = join(e.root, "locked-copy.radsec");
    await e.call("secrets/export-backup", { path: locked });
    expect(existsSync(locked)).toBe(true);
    const other = fresh(); // restoring onto a computer with no vault at all
    await other.call("secrets/import-backup", { path: backup, password: PASSWORD });
    expect((await other.call("secrets/list")).total).toBe(1);
  });

  test("destroying the vault needs the word DELETE and removes the file, backups and counter", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem());
    await save(e, loginItem());
    expect((await failure(e.call("secrets/destroy", {}))).code).toBe("NEEDS_CONFIRM");
    expect(existsSync(vaultFile(e))).toBe(true);
    await e.call("secrets/destroy", { confirm: "DELETE" });
    expect(readdirSync(e.dataDir).filter((f) => f.includes("radsec"))).toEqual([]);
    expect((await e.call("secrets/status")).status.exists).toBe(false);
  });
});

describe("the audit log, links and the generator over the wire", () => {
  test("the log keeps only non-sensitive events with times, inside the vault", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem({ title: "NOTLOGGED-TITLE" }));
    await e.call("secrets/export-backup", { path: join(e.root, "b.radsec") });
    const events = (await e.call("secrets/audit")).events;
    expect(events.map((x: any) => x.ev)).toEqual(expect.arrayContaining(["created", "export-backup"]));
    for (const ev of events) expect(Object.keys(ev).sort().filter((k) => k !== "n")).toEqual(["ev", "t"]);
    expect(JSON.stringify(events)).not.toContain("NOTLOGGED");
    expect(readFileSync(vaultFile(e)).toString("latin1")).not.toContain("export-backup");
  });

  test("Open only launches http and https addresses, through the app's launcher", async () => {
    const e = fresh();
    await createVault(e);
    const ok = await save(e, loginItem({ fields: { username: "u", password: "p-Zq-1234!", url: "example.com/login" } }));
    expect((await e.call("secrets/open-url", { id: ok.id })).opened).toBe("example.com");
    expect(e.launched.at(-1)!.at(-1)).toBe("https://example.com/login");
    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x.test", "data:text/html,hi", "vbscript:x"]) {
      const item = await save(e, loginItem({ title: bad, fields: { username: "u", password: "p-Zq-1234!", url: bad } }));
      expect((await failure(e.call("secrets/open-url", { id: item.id }))).code, bad).toBe("BAD_URL");
    }
    expect(e.launched.length).toBe(1);
  });

  test("answers that mean 'no' are still successful answers (the page treats a top-level ok:false as an error)", async () => {
    const e = fresh({}, true);
    const weak = await e.http("secrets/check-password", { password: "x" });
    expect(weak.status).toBe(200);
    expect(weak.json).toMatchObject({ ok: true, acceptable: false });
    await e.http("secrets/create", { password: PASSWORD, recovery: true });
    const verify = await e.http("secrets/recovery", { action: "verify", recoveryKey: "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA" });
    expect(verify.status).toBe(200);
    expect(verify.json).toMatchObject({ ok: true, matches: false });
  });

  test("the generator answers while locked and honours its options", async () => {
    const e = fresh({}, true);
    const r = await e.http("secrets/generate", { mode: "passphrase", words: 4, separator: " " });
    expect(r.json.generated.value.split(" ").length).toBe(4);
    expect((await e.http("secrets/generate", { mode: "password", length: 3 })).status).toBe(400);
  });
});
