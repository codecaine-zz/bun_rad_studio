import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { importAny, importBitwarden, importCsv, parseCsv } from "../src/features/filemanager/fmSecretsImport";
import { generateSecret } from "../src/features/filemanager/fmSecretsGen";
import { nonceOf } from "../src/features/filemanager/fmSecretsFormat";
import { VAULT_WORDS } from "../src/features/filemanager/fmVaultWords";
import { parseTotp, totpAt } from "../src/features/filemanager/fmSecretsTotp";
import { writeAtomic } from "../src/features/filemanager/fmSecretsStore";
import { PASSWORD, createVault, loginItem, makeEnv, type Env } from "./file_manager_secrets_helpers";

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
const save = async (e: Env, item: Record<string, any>, id?: string) => (await e.call("secrets/save", { id, item })).item;
const bytes = (path: string) => readFileSync(path);

describe("atomic saving, backups and conflicts", () => {
  test("the vault file is private (0600 in a 0700 folder) and holds none of the stored text", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem({ title: "PLAINTEXT-TITLE-Q1", fields: { username: "plain-user-Q2", password: "plain-pass-Q3-xyz!", url: "https://q4.example" }, notes: "plain-note-Q5" }));
    if (process.platform !== "win32") {
      expect(statSync(vaultFile(e)).mode & 0o777).toBe(0o600);
      expect(statSync(e.dataDir).mode & 0o777).toBe(0o700);
    }
    const raw = bytes(vaultFile(e)).toString("latin1");
    for (const marker of ["PLAINTEXT-TITLE-Q1", "plain-user-Q2", "plain-pass-Q3", "q4.example", "plain-note-Q5", "alice", "login"]) expect(raw.includes(marker), marker).toBe(false);
    expect(readdirSync(e.dataDir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  test("a failure between the temporary file and the rename leaves the old vault whole, and what is in memory is put back", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem({ title: "Kept" }));
    const before = bytes(vaultFile(e));
    e.svc.hooks.faultBeforeRename = () => {
      throw new Error("simulated crash");
    };
    await expect(save(e, loginItem({ title: "Lost" }))).rejects.toMatchObject({ code: "SECRETS_ERROR" });
    expect(bytes(vaultFile(e)).equals(before)).toBe(true);
    expect(readdirSync(e.dataDir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect((await e.call("secrets/list")).items.map((i: any) => i.title)).toEqual(["Kept"]);
    e.svc.hooks.faultBeforeRename = undefined;
    await save(e, loginItem({ title: "Now saved" }));
    e.svc.lock();
    await e.call("secrets/unlock", { password: PASSWORD });
    expect((await e.call("secrets/list")).items.map((i: any) => i.title).sort()).toEqual(["Kept", "Now saved"]);
  });

  test("a temporary file left by a killed save is ignored and cleaned up at the next unlock", async () => {
    const e = fresh();
    await createVault(e);
    e.svc.lock();
    const stale = `${vaultFile(e)}.deadbeef.tmp`;
    writeFileSync(stale, "half written");
    await e.call("secrets/unlock", { password: PASSWORD });
    expect(existsSync(stale)).toBe(false);
  });

  test("an empty save is refused and never replaces the vault", () => {
    const e = fresh();
    mkdirSync(e.dataDir, { recursive: true });
    writeFileSync(vaultFile(e), "old");
    expect(() => writeAtomic(vaultFile(e), Buffer.alloc(0))).toThrow(/empty vault/);
    expect(readFileSync(vaultFile(e), "utf8")).toBe("old");
  });

  test("a save that cannot be verified by decrypting it again is not put in place", () => {
    const e = fresh();
    mkdirSync(e.dataDir, { recursive: true });
    writeFileSync(vaultFile(e), "old");
    expect(() => writeAtomic(vaultFile(e), Buffer.from("new"), { verify: () => { throw new Error("cannot open"); } })).toThrow();
    expect(readFileSync(vaultFile(e), "utf8")).toBe("old");
  });

  test("backups .1 .2 .3 rotate, are themselves encrypted vaults, and a failed save leaves them alone", async () => {
    const e = fresh();
    await createVault(e);
    for (let i = 1; i <= 5; i++) await save(e, loginItem({ title: `Item ${i}` }));
    const backups = [1, 2, 3].map((n) => `${vaultFile(e)}.${n}`);
    for (const b of backups) expect(existsSync(b), b).toBe(true);
    expect(existsSync(`${vaultFile(e)}.4`)).toBe(false);
    expect(new Set(backups.map((b) => createHash("sha256").update(bytes(b)).digest("hex"))).size).toBe(3);
    for (const b of backups) expect(bytes(b).toString("latin1").includes("Item 1")).toBe(false);
    const snapshot = backups.map((b) => bytes(b));
    e.svc.hooks.faultBeforeRename = () => {
      throw new Error("crash");
    };
    await expect(save(e, loginItem({ title: "never" }))).rejects.toThrow();
    backups.forEach((b, i) => expect(bytes(b).equals(snapshot[i]!)).toBe(true));
    // a backup is a real vault: restoring it brings the old state back
    e.svc.hooks.faultBeforeRename = undefined;
    const target = join(e.root, "restore.radsec");
    copyFileSync(backups[0]!, target);
    await e.call("secrets/import-backup", { path: target, password: PASSWORD });
    expect((await e.call("secrets/list")).total).toBe(4);
  });

  test("backups are made no more often than the interval allows, but the first save after unlocking always makes one", async () => {
    const e = fresh({ backupMinIntervalMs: 10 * 60_000 });
    await createVault(e);
    await save(e, loginItem({ title: "A" }));
    await save(e, loginItem({ title: "B" }));
    await e.call("secrets/settings", { settings: { autoLockMinutes: 0 } });
    expect(existsSync(`${vaultFile(e)}.1`)).toBe(true);
    expect(existsSync(`${vaultFile(e)}.2`)).toBe(false);
    e.clock.advance(11 * 60_000);
    await save(e, loginItem({ title: "C" }));
    expect(existsSync(`${vaultFile(e)}.2`)).toBe(true);
  });

  test("a vault file changed behind the app's back is never silently overwritten", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem({ title: "One" }));
    const outside = bytes(`${vaultFile(e)}.1`); // some other state of the vault, as a sync tool might put there
    writeFileSync(vaultFile(e), outside);
    await expect(save(e, loginItem({ title: "Two" }))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(bytes(vaultFile(e)).equals(outside)).toBe(true);
    expect((await e.call("secrets/status")).status.conflict).toBe(true);
    await expect(save(e, loginItem({ title: "Three" }))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(bytes(vaultFile(e)).equals(outside)).toBe(true);
    // keeping the open copy overwrites, and the changed file is kept as backup .1
    await e.call("secrets/resolve", { action: "keep" });
    expect((await e.call("secrets/status")).status.conflict).toBe(false);
    expect(bytes(`${vaultFile(e)}.1`).equals(outside)).toBe(true);
    expect(bytes(vaultFile(e)).equals(outside)).toBe(false);
    await save(e, loginItem({ title: "Four" }));
  });

  test("choosing to reload from disk locks the vault and drops the unsaved copy", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem({ title: "One" }));
    writeFileSync(vaultFile(e), bytes(`${vaultFile(e)}.1`));
    await expect(save(e, loginItem({ title: "Two" }))).rejects.toMatchObject({ code: "CONFLICT" });
    const res = await e.call("secrets/resolve", { action: "discard" });
    expect(res.status.locked).toBe(true);
    expect(e.svc.session).toBeNull();
  });

  test("a nonce is never used twice across many saves", async () => {
    const e = fresh({ backupMinIntervalMs: 24 * 3600_000 });
    await createVault(e);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      await save(e, loginItem({ title: `n${i}` }));
      seen.add(nonceOf(bytes(vaultFile(e))).toString("hex"));
    }
    expect(seen.size).toBe(60);
  });
});

describe("limits", () => {
  test("field sizes, item count and attachment sizes are limited with plain messages", async () => {
    const e = fresh({ backupMinIntervalMs: 24 * 3600_000 });
    await createVault(e);
    await expect(save(e, loginItem({ title: "x".repeat(201) }))).rejects.toThrow(/title is too long/);
    await expect(save(e, loginItem({ notes: "n".repeat(100_001) }))).rejects.toThrow(/notes is too long/);
    await expect(save(e, loginItem({ fields: { password: "p".repeat(4097) } }))).rejects.toThrow(/too long/);
    await expect(save(e, loginItem({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }))).rejects.toThrow(/at most 20 tags/);
    await expect(save(e, { type: "bogus", title: "x" })).rejects.toThrow(/Choose what kind/);
    await expect(save(e, loginItem({ fields: { nonsense: "x" } }))).rejects.toThrow(/no “nonsense” field/);
    const item = await save(e, loginItem());
    const big = join(e.root, "big.bin");
    writeFileSync(big, Buffer.alloc(1024 * 1024 + 1));
    await expect(e.call("secrets/attach", { id: item.id, path: big })).rejects.toThrow(/at most 1 MB/);
    const one = join(e.root, "one.bin");
    writeFileSync(one, Buffer.alloc(1024 * 1024, 7));
    const holders = [];
    for (let i = 0; i < 2; i++) holders.push(await save(e, loginItem({ title: `holder${i}` })));
    for (let i = 0; i < 10; i++) await e.call("secrets/attach", { id: holders[i % 2]!.id, path: one });
    await expect(e.call("secrets/attach", { id: item.id, path: one })).rejects.toThrow(/total at most 10 MB/);
    const got = (await e.call("secrets/get", { id: holders[0]!.id })).item;
    expect(got.attachmentList.length).toBe(5);
    const out = join(e.root, "out.bin");
    await e.call("secrets/save-attachment", { id: holders[0]!.id, attachmentId: got.attachmentList[0].id, path: out });
    expect(bytes(out).equals(Buffer.alloc(1024 * 1024, 7))).toBe(true);
    expect(bytes(vaultFile(e)).length).toBeLessThan(16 * 1024 * 1024);
  });

  test("a vault holds at most 5,000 items", async () => {
    const e = fresh({ backupMinIntervalMs: 24 * 3600_000 });
    await createVault(e);
    const rows = ["title,url,username,password"];
    for (let i = 0; i < 5000; i++) rows.push(`site${i},https://s${i}.example,user${i},pw-${i}-Zq!`);
    const preview = await e.call("secrets/import", { text: rows.join("\n") });
    expect(preview.count).toBe(5000);
    await e.call("secrets/import", { commit: true, token: preview.token });
    await expect(save(e, loginItem({ title: "one too many" }))).rejects.toMatchObject({ code: "TOO_MANY" });
    expect((await e.call("secrets/list", { limit: 1000, offset: 4500 })).items.length).toBe(500);
    const more = await e.call("secrets/import", { text: `${rows.slice(0, 2).join("\n")}\nextra,https://x.example,u,p-9-Zq!\n` });
    await expect(e.call("secrets/import", { commit: true, token: more.token })).rejects.toMatchObject({ code: "TOO_MANY" });
  });
});

describe("items: trash, history, search, filters and sorting", () => {
  test("Trash, restore, permanent delete and empty-trash with confirmation", async () => {
    const e = fresh();
    await createVault(e);
    const a = await save(e, loginItem({ title: "A" }));
    const b = await save(e, loginItem({ title: "B" }));
    await e.call("secrets/delete", { id: a.id });
    expect((await e.call("secrets/list")).items.map((i: any) => i.title)).toEqual(["B"]);
    expect((await e.call("secrets/list", { trash: true })).items.map((i: any) => i.title)).toEqual(["A"]);
    await expect(save(e, loginItem({ title: "edit" }), a.id)).rejects.toMatchObject({ code: "IN_TRASH" });
    await e.call("secrets/restore", { id: a.id });
    expect((await e.call("secrets/list")).total).toBe(2);
    await e.call("secrets/delete", { id: a.id });
    await expect(e.call("secrets/empty-trash", {})).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });
    await expect(e.call("secrets/delete", { id: b.id, permanent: true })).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });
    expect((await e.call("secrets/empty-trash", { confirm: true })).removed).toBe(1);
    expect((await e.call("secrets/list", { trash: true })).total).toBe(0);
    await e.call("secrets/delete", { id: b.id, permanent: true, confirm: true });
    await expect(e.call("secrets/get", { id: b.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("password history keeps the last 10 values, newest first, and an update that leaves a field out keeps it", async () => {
    const e = fresh({ backupMinIntervalMs: 24 * 3600_000 });
    await createVault(e);
    const item = await save(e, loginItem({ title: "H", fields: { username: "u", password: "pw-0", url: "" } }));
    for (let i = 1; i <= 12; i++) {
      e.clock.advance(1000);
      await save(e, { fields: { password: `pw-${i}` } }, item.id);
    }
    const got = (await e.call("secrets/get", { id: item.id })).item;
    expect(got.history.length).toBe(10);
    expect((await e.call("secrets/reveal", { id: item.id, field: "history:0" })).value).toBe("pw-11");
    expect((await e.call("secrets/reveal", { id: item.id, field: "history:9" })).value).toBe("pw-2");
    expect((await e.call("secrets/reveal", { id: item.id, field: "password" })).value).toBe("pw-12");
    expect(got.fields.username).toBe("u");
    await save(e, { title: "Renamed" }, item.id); // password, username and notes are left alone
    expect((await e.call("secrets/reveal", { id: item.id, field: "password" })).value).toBe("pw-12");
    expect((await e.call("secrets/get", { id: item.id })).item.history.length).toBe(10);
  });

  test("search covers titles, usernames, addresses, tags, folders and note bodies; filters and sorting work", async () => {
    const e = fresh({ backupMinIntervalMs: 24 * 3600_000 });
    await createVault(e);
    await save(e, loginItem({ title: "Bank", tags: ["money", "Important"], folder: "Finance/Banks", fields: { username: "carol@bank.test", password: "pw-bank-1!", url: "https://secure.bank.test" } }));
    e.clock.advance(1000);
    await save(e, loginItem({ title: "alpha mail", favorite: true, fields: { username: "zed", password: "pw-mail-1!", url: "https://mail.test" }, notes: "needle-in-a-note" }));
    e.clock.advance(1000);
    await save(e, { type: "note", title: "Zebra", notes: "my plain note" });
    await save(e, { type: "card", title: "Visa", fields: { cardholder: "A Person", number: "4111111111111111", cvv: "123" } });
    const titles = async (b: Record<string, any>) => (await e.call("secrets/list", b)).items.map((i: any) => i.title);
    expect(await titles({ query: "carol" })).toEqual(["Bank"]);
    expect(await titles({ query: "SECURE.bank" })).toEqual(["Bank"]);
    expect(await titles({ query: "important" })).toEqual(["Bank"]);
    expect(await titles({ query: "banks" })).toEqual(["Bank"]);
    expect(await titles({ query: "needle" })).toEqual(["alpha mail"]);
    expect(await titles({ query: "bank money" })).toEqual(["Bank"]);
    expect(await titles({ query: "pw-bank" })).toEqual([]); // passwords are never searched
    expect(await titles({ query: "4111" })).toEqual([]); // nor card numbers
    expect(await titles({ type: "note" })).toEqual(["Zebra"]);
    expect(await titles({ favorite: true })).toEqual(["alpha mail"]);
    expect(await titles({ tag: "money" })).toEqual(["Bank"]);
    expect(await titles({ folder: "Finance" })).toEqual(["Bank"]);
    expect(await titles({})).toEqual(["alpha mail", "Bank", "Visa", "Zebra"]); // favourites first, then A–Z ignoring case
    expect(await titles({ sort: "title", dir: "desc", favoritesFirst: false })).toEqual(["Zebra", "Visa", "Bank", "alpha mail"]);
    expect((await titles({ sort: "modified", favoritesFirst: false }))[0]).toBe("Visa");
    expect(await titles({ limit: 2, offset: 1 })).toEqual(["Bank", "Visa"]);
    const facets = await e.call("secrets/facets");
    expect(facets.tags.map((t: any) => t.name)).toEqual(["Important", "money"]);
    expect(facets.favorites).toBe(1);
    // the list never carries a secret
    const dump = JSON.stringify(await e.call("secrets/list", {}));
    for (const secret of ["pw-bank-1!", "pw-mail-1!", "4111111111111111", "needle-in-a-note", "my plain note", "123"]) expect(dump.includes(secret), secret).toBe(false);
  });

  test("a duplicate is a copy with a new id and no history", async () => {
    const e = fresh();
    await createVault(e);
    const a = await save(e, loginItem({ title: "Orig" }));
    await save(e, { fields: { password: "changed-1" } }, a.id);
    const copy = (await e.call("secrets/duplicate", { id: a.id })).item;
    expect(copy.id).not.toBe(a.id);
    expect(copy.title).toBe("Orig (copy)");
    expect(copy.history.length).toBe(0);
    expect((await e.call("secrets/reveal", { id: copy.id, field: "password" })).value).toBe("changed-1");
  });
});

describe("health audit and breach check", () => {
  test("weak, reused, old, missing 2FA, duplicate addresses and passwords in notes are found, and no fingerprint is stored", async () => {
    const e = fresh({ backupMinIntervalMs: 24 * 3600_000 });
    await createVault(e);
    await save(e, loginItem({ title: "Reuse 1", fields: { username: "a", password: "Same-Strong-pw-9$k", url: "https://one.test/x" } }));
    await save(e, loginItem({ title: "Reuse 2", fields: { username: "b", password: "Same-Strong-pw-9$k", url: "https://one.test/x/" } }));
    await save(e, loginItem({ title: "Weak", fields: { username: "c", password: "abc123", url: "" } }));
    await save(e, loginItem({ title: "Github", fields: { username: "d", password: "Uniq-Strong-pw-77#z", url: "https://github.com/login" }, notes: "password: Uniq-Strong-pw-77#z" }));
    await save(e, loginItem({ title: "With 2FA", fields: { username: "e", password: "Another-Strong-pw-5&q", url: "https://github.com", totp: "JBSWY3DPEHPK3PXP" } }));
    await e.call("secrets/settings", { settings: { autoLockMinutes: 0 } });
    e.clock.advance(400 * 86_400_000);
    await save(e, loginItem({ title: "Fresh", fields: { username: "f", password: "Fresh-Strong-pw-31%w", url: "https://fresh.test" } }));
    const { report } = await e.call("secrets/health");
    expect(report.checked).toBe(6);
    expect(report.weak.map((x: any) => x.title)).toEqual(["Weak"]);
    expect(report.reused).toHaveLength(1);
    expect(report.reused[0].titles.sort()).toEqual(["Reuse 1", "Reuse 2"]);
    expect(report.old.map((x: any) => x.title).sort()).toEqual(["Github", "Reuse 1", "Reuse 2", "Weak", "With 2FA"]);
    expect(report.no2fa.map((x: any) => x.title)).toEqual(["Github"]);
    expect(report.duplicateUrls.map((d: any) => d.host)).toEqual(["one.test/x"]);
    expect(report.inNotes.map((x: any) => x.title)).toEqual(["Github"]);
    expect(new Set(report.flagged).size).toBe(3);
    expect((await e.call("secrets/list", { flagged: true })).items.map((i: any) => i.title).sort()).toEqual(["Reuse 1", "Reuse 2", "Weak"]);
    const text = JSON.stringify(report);
    for (const pw of ["Same-Strong-pw-9$k", "abc123", "Uniq-Strong-pw-77#z"]) expect(text.includes(pw)).toBe(false);
    // nothing derived from passwords is kept in the database: no hash-looking values
    expect(JSON.stringify(e.svc.session!.db).match(/[0-9a-f]{40,}/g)).toBeNull();
  });

  test("the breach check sends only a 5-character prefix with the padding header, only when confirmed", async () => {
    const e = fresh();
    await createVault(e);
    const pw = "Breached-pw-0001!";
    const sha = createHash("sha1").update(pw).digest("hex").toUpperCase();
    await save(e, loginItem({ title: "Leaky", fields: { username: "x", password: pw, url: "" } }));
    await save(e, loginItem({ title: "Clean", fields: { username: "y", password: "Clean-pw-ever-9981!", url: "" } }));
    await expect(e.call("secrets/breach", {})).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });
    expect(e.fetches.length).toBe(0);
    e.fetchReply.current = (url) => {
      const prefix = url.slice(-5);
      const lines = prefix === sha.slice(0, 5) ? [`${sha.slice(5)}:1234`, "0000000000000000000000000000000000A:0"] : ["1111111111111111111111111111111111A:0", "2222222222222222222222222222222222B:5"];
      return { ok: true, status: 200, text: lines.join("\r\n") };
    };
    const { result } = await e.call("secrets/breach", { confirm: true });
    expect(result.breached).toEqual([{ id: expect.any(String), title: "Leaky", count: 1234 }]);
    expect(result.checked).toBe(2);
    expect(e.fetches.length).toBe(2);
    for (const f of e.fetches) {
      expect(f.url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
      expect(f.headers["Add-Padding"]).toBe("true");
      expect(Object.keys(f.headers).sort()).toEqual(["Add-Padding", "User-Agent"]);
      expect(f.url.includes(sha.slice(5, 12))).toBe(false);
    }
  });

  test("bad answers from the service are handled: partial failure is counted, total failure is a plain message", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem({ title: "One", fields: { username: "x", password: "Aaaa-pw-0001-Zz!", url: "" } }));
    await save(e, loginItem({ title: "Two", fields: { username: "y", password: "Bbbb-pw-0002-Zz!", url: "" } }));
    e.fetchReply.current = () => ({ ok: false, status: 503, text: "oops" });
    await expect(e.call("secrets/breach", { confirm: true })).rejects.toMatchObject({ code: "BREACH_UNAVAILABLE" });
    e.fetchReply.current = () => ({ ok: true, status: 200, text: "<html>not a range answer</html>" });
    await expect(e.call("secrets/breach", { confirm: true })).rejects.toMatchObject({ code: "BREACH_UNAVAILABLE" });
    let n = 0;
    e.fetchReply.current = () => (n++ === 0 ? { ok: false, status: 500, text: "" } : { ok: true, status: 200, text: "" });
    const { result } = await e.call("secrets/breach", { confirm: true });
    expect(result.failed).toBe(1);
    expect(result.breached).toEqual([]);
  });
});

const b32 = (buf: Buffer): string => {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const byte of buf) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += A[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  return bits ? out + A[(acc << (5 - bits)) & 31] : out;
};

describe("one-time codes (RFC 6238)", () => {
  const secrets = { SHA1: "12345678901234567890", SHA256: "12345678901234567890123456789012", SHA512: "1234567890123456789012345678901234567890123456789012345678901234" } as const;
  const vectors: Array<[number, string, string, string]> = [
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1111111111, "14050471", "67062674", "99943326"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ];
  test("the published test vectors for SHA-1, SHA-256 and SHA-512", () => {
    for (const [time, sha1, sha256, sha512] of vectors) {
      const want = { SHA1: sha1, SHA256: sha256, SHA512: sha512 };
      for (const algo of ["SHA1", "SHA256", "SHA512"] as const) {
        const spec = parseTotp(`otpauth://totp/Test:me?secret=${b32(Buffer.from(secrets[algo]))}&algorithm=${algo}&digits=8&period=30`);
        expect(totpAt(spec, time * 1000).code, `${algo} at ${time}`).toBe(want[algo]);
      }
    }
  });

  test("a bare base32 secret (lower case, spaces, padding) gives 6 digits and counts down the period", () => {
    const spec = parseTotp("jbsw y3dp ehpk 3pxp");
    expect(spec).toMatchObject({ algorithm: "SHA1", digits: 6, period: 30 });
    const t = totpAt(spec, 59_000);
    expect(t.code).toBe("996554");
    expect(t.secondsLeft).toBe(1);
    expect(totpAt(spec, 60_000).secondsLeft).toBe(30);
    expect(parseTotp("JBSWY3DPEHPK3PXP====").secret.length).toBe(10);
  });

  test("otpauth:// edge cases: issuer, encoded labels, algorithms, digits and periods", () => {
    expect(parseTotp("otpauth://totp/GitHub:me%40x.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub").issuer).toBe("GitHub");
    expect(parseTotp("otpauth://totp/Acme%20Co:bob?secret=JBSWY3DPEHPK3PXP").issuer).toBe("Acme Co");
    expect(parseTotp("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=sha-256&period=60&digits=7")).toMatchObject({ algorithm: "SHA256", period: 60, digits: 7 });
    for (const bad of [
      "otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1", "otpauth://totp/x", "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=9", "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=5",
      "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=10", "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=61", "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5",
      "otpauth://totp/x?secret=!!!", "otpauth://totp/x?secret=AAAA", "", "   ", "not base32 at all 1 8 9", "otpauth:", `JBSWY3DPEHPK3PXP${"A".repeat(300)}`,
    ]) expect(() => parseTotp(bad), bad).toThrow();
  });

  test("the op returns the current code and the seconds left, and a login without a secret says so", async () => {
    const e = fresh();
    await createVault(e);
    const item = await save(e, loginItem({ fields: { username: "u", password: "p-Zq-1234!", url: "", totp: "otpauth://totp/Acme:u?secret=JBSWY3DPEHPK3PXP&issuer=Acme" } }));
    const t = await e.call("secrets/totp", { id: item.id });
    expect(t.code).toMatch(/^\d{6}$/);
    expect(t.issuer).toBe("Acme");
    expect(t.secondsLeft).toBeGreaterThan(0);
    const plain = await save(e, loginItem({ title: "No 2FA" }));
    await expect(e.call("secrets/totp", { id: plain.id })).rejects.toMatchObject({ code: "BAD_TOTP" });
    await expect(save(e, { fields: { totp: "not-a-secret!!" } }, item.id)).resolves.toBeTruthy(); // stored as typed; reading it reports the problem
    await expect(e.call("secrets/totp", { id: item.id })).rejects.toMatchObject({ code: "BAD_TOTP" });
  });
});

describe("the password generator", () => {
  test("random characters: length, classes, no look-alikes", () => {
    for (let i = 0; i < 40; i++) {
      const g = generateSecret({ mode: "password", length: 24, lower: true, upper: true, digits: true, symbols: true, noAmbiguous: true });
      expect(g.value.length).toBe(24);
      expect(g.value).toMatch(/[a-z]/);
      expect(g.value).toMatch(/[A-Z]/);
      expect(g.value).toMatch(/[2-9]/);
      expect(g.value).toMatch(/[^a-zA-Z0-9]/);
      expect(g.value).not.toMatch(/[O0oIl1|`'"]/);
    }
    expect(generateSecret({ length: 16, lower: false, upper: false, digits: true, symbols: false }).value).toMatch(/^\d{16}$/);
    expect(new Set(Array.from({ length: 50 }, () => generateSecret({ length: 20 }).value)).size).toBe(50);
    expect(generateSecret({ length: 20 }).bits).toBeGreaterThan(100);
  });
  test("passphrases use the built-in word list; pronounceable passwords alternate consonants and vowels", () => {
    const g = generateSecret({ mode: "passphrase", words: 6, separator: "-", capitalize: true, number: true });
    const parts = g.value.split("-");
    expect(parts.length).toBe(7);
    for (const w of parts.slice(0, 6)) expect(VAULT_WORDS).toContain(w.toLowerCase());
    expect(g.bits).toBe(Math.round(6 * Math.log2(2048) + Math.log2(100)));
    const p = generateSecret({ mode: "pronounceable", length: 14, digits: true, symbols: false, upper: false });
    expect(p.value).toMatch(/^([bcdfghjklmnprstvwz][aeiou]){6}\d\d$/);
    expect(generateSecret({ mode: "pronounceable", length: 20, digits: false, upper: true }).value.length).toBe(20);
  });
  test("bad requests are refused in plain words", () => {
    for (const bad of [{ mode: "x" }, { length: 3 }, { length: 300 }, { length: 10, lower: false, upper: false, digits: false, symbols: false }, { mode: "passphrase", words: 2 }, { mode: "passphrase", separator: "@@" }, { mode: "pronounceable", length: 4 }]) expect(() => generateSecret(bad as any)).toThrow();
  });
});

describe("importing other password managers' exports", () => {
  test("each dialect is recognised and mapped", () => {
    const chrome = importCsv("name,url,username,password,note\nGit,https://github.com,me,pw1,hello\n");
    expect(chrome.dialect).toBe("Chrome or Edge");
    expect(chrome.items[0]).toMatchObject({ title: "Git", type: "login", notes: "hello", fields: { username: "me", password: "pw1", url: "https://github.com" } });
    const firefox = importCsv('url,username,password,httpRealm,formActionOrigin,guid,timeCreated,timeLastUsed,timePasswordChanged\nhttps://a.test,u,p,,https://a.test,"{x}",1,2,3\n');
    expect(firefox.dialect).toBe("Firefox");
    expect(firefox.items[0]!.title).toBe("a.test");
    const safari = importCsv("Title,URL,Username,Password,Notes,OTPAuth\nS,https://s.test,u,p,n,otpauth://totp/S?secret=JBSWY3DPEHPK3PXP\n");
    expect(safari.dialect).toBe("Safari");
    expect(safari.items[0]!.fields.totp).toContain("otpauth://");
    const onepw = importCsv("Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\nO,https://o.test,u,p,,1,0,\"a, b\",nn\n");
    expect(onepw.dialect).toBe("1Password");
    expect(onepw.items[0]).toMatchObject({ favorite: true, tags: ["a", "b"] });
    const lastpass = importCsv("url,username,password,totp,extra,name,grouping,fav\nhttps://l.test,u,p,,note,LP,Work\\Team,1\n");
    expect(lastpass.dialect).toBe("LastPass");
    expect(lastpass.items[0]).toMatchObject({ title: "LP", folder: "Work/Team", notes: "note", favorite: true });
    const keepass = importCsv('"Group","Title","Username","Password","URL","Notes","TOTP","Icon","Last Modified","Created"\n"Root/Web","K","u","p","https://k.test","n","","0","x","y"\n');
    expect(keepass.dialect).toBe("KeePass");
    expect(keepass.items[0]).toMatchObject({ title: "K", folder: "Root/Web" });
    const bwCsv = importCsv("folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\nF,1,login,BW,n,,0,https://b.test,u,p,\n");
    expect(bwCsv.dialect).toBe("Bitwarden CSV");
    expect(bwCsv.items[0]!.fields.url).toBe("https://b.test");
    const note = importCsv("folder,favorite,type,name,notes,login_uri,login_username,login_password\n,0,note,My note,body,,,\n");
    expect(note.items[0]!.type).toBe("note");
  });

  test("Bitwarden JSON: logins, notes, cards, identities, custom fields, folders; encrypted exports are refused", () => {
    const json = JSON.stringify({
      encrypted: false, folders: [{ id: "f1", name: "Work" }],
      items: [
        { type: 1, name: "L", folderId: "f1", favorite: true, notes: "nn", login: { username: "u", password: "p", totp: "JBSWY3DPEHPK3PXP", uris: [{ uri: "https://one.test" }, { uri: "https://two.test" }] }, fields: [{ name: "pin", value: "1234", type: 1 }, { name: "x", value: "y", type: 0 }] },
        { type: 2, name: "N", notes: "secret note" },
        { type: 3, name: "C", card: { cardholderName: "Me", number: "4111", expMonth: "01", expYear: "2030", code: "999" } },
        { type: 4, name: "I", identity: { firstName: "A", lastName: "B", email: "a@b.c", address1: "1 Road", city: "Town", country: "XX" } },
        { type: 99, name: "weird" },
      ],
    });
    const r = importBitwarden(json);
    expect(r.items.map((i) => i.type)).toEqual(["login", "note", "card", "identity"]);
    expect(r.items[0]).toMatchObject({ folder: "Work", favorite: true });
    expect(r.items[0]!.custom).toEqual([{ label: "pin", kind: "hidden", value: "1234" }, { label: "x", kind: "text", value: "y" }, { label: "Another website", kind: "url", value: "https://two.test" }]);
    expect(r.items[2]!.fields.expiry).toBe("01/2030");
    expect(r.warnings.join(" ")).toMatch(/1 item of a kind/);
    expect(() => importBitwarden('{"encrypted":true,"items":[]}')).toThrow(/encrypted/);
    expect(() => importBitwarden("{nope")).toThrow(/valid JSON/);
    expect(() => importBitwarden("[1,2]")).toThrow(/Bitwarden/);
  });

  test("hostile input stays plain text: formulas, BOMs, quotes, line breaks, huge fields, junk", async () => {
    const formula = "=cmd|' /C calc'!A0";
    const r = importCsv(`\uFEFFtitle,url,username,password,notes\r\n"${formula}",https://x.test,@SUM(1+1),"+1+1","line one\r\nline ""two"""\r\n`);
    expect(r.items[0]).toMatchObject({ title: formula, fields: { username: "@SUM(1+1)", password: "+1+1" }, notes: 'line one\nline "two"'.replace("\n", "\r\n") });
    expect(parseCsv('a,"b\nc",d\n1,2,3')).toEqual([["a", "b\nc", "d"], ["1", "2", "3"]]);
    expect(parseCsv('a,"unterminated\nb,c')).toEqual([["a", "unterminated\nb,c"]]);
    expect(() => importCsv("")).toThrow();
    expect(() => importCsv("foo,bar\n1,2\n")).toThrow(/doesn't look like a password export/);
    expect(() => importCsv("title,url,username,password\n")).toThrow(/no rows/);
    expect(() => parseCsv(`a\n${"1\n".repeat(5100)}`)).toThrow(/more than 5,000 rows/);
    expect(importAny('\uFEFF{"items":[]}').dialect).toBe("Bitwarden JSON");
    const e = fresh();
    await createVault(e);
    const huge = `title,url,username,password,notes\nBig,https://x.test,u,p,${"n".repeat(300_000)}\nOk,https://y.test,u2,p2,fine\n`;
    const preview = await e.call("secrets/import", { text: huge });
    expect(preview.count).toBe(1);
    expect(preview.skipped).toBe(1);
    await expect(e.call("secrets/import", { text: "x".repeat(1_000_000) })).rejects.toMatchObject({ code: "TOO_LARGE" });
    await expect(e.call("secrets/import", { path: join(e.root, "nope.csv") })).rejects.toMatchObject({ code: "BAD_PATH" });
  });

  test("a preview counts first and changes nothing; the commit imports; a second import skips what is already there", async () => {
    const e = fresh();
    await createVault(e);
    const file = join(e.root, "export.csv");
    writeFileSync(file, "name,url,username,password\nOne,https://1.test,u1,pw-1-Zq!\nTwo,https://2.test,u2,pw-2-Zq!\n");
    const preview = await e.call("secrets/import", { path: file });
    expect(preview).toMatchObject({ count: 2, duplicates: 0, skipped: 0, dialect: "Chrome or Edge" });
    expect(preview.sample.map((s: any) => s.title)).toEqual(["One", "Two"]);
    expect(JSON.stringify(preview).includes("pw-1-Zq!")).toBe(false);
    expect((await e.call("secrets/list")).total).toBe(0);
    await expect(e.call("secrets/import", { commit: true, token: "wrong" })).rejects.toThrow(/expired/);
    expect((await e.call("secrets/import", { commit: true, token: preview.token })).imported).toBe(2);
    expect((await e.call("secrets/list")).total).toBe(2);
    const again = await e.call("secrets/import", { path: file });
    expect(again).toMatchObject({ count: 0, duplicates: 2 });
  });
});

describe("plain-text CSV export is gated", () => {
  test("needs the password again and a confirmation, writes 0600, never overwrites, and round-trips through the importer", async () => {
    const e = fresh();
    await createVault(e);
    await save(e, loginItem({ title: "Exp", fields: { username: "u", password: "pw,with\"quote-1!", url: "https://e.test" }, notes: "two\nlines", tags: ["a", "b"] }));
    await save(e, { type: "card", title: "Card", fields: { number: "4111111111111111" } });
    const path = join(e.root, "out.csv");
    await expect(e.call("secrets/export-csv", { path, password: PASSWORD })).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });
    await expect(e.call("secrets/export-csv", { path, confirm: true })).rejects.toThrow(/master password/);
    await expect(e.call("secrets/export-csv", { path, confirm: true, password: "Not-The-Password-1!" })).rejects.toMatchObject({ code: "WRONG_PASSWORD" });
    expect(existsSync(path)).toBe(false);
    const res = await e.call("secrets/export-csv", { path, confirm: true, password: PASSWORD });
    expect(res.count).toBe(2);
    expect(res.reminder).toMatch(/NOT encrypted/);
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
    const back = importCsv(readFileSync(path, "utf8"));
    expect(back.items.find((i) => i.title === "Exp")).toMatchObject({ fields: { password: 'pw,with"quote-1!' }, favorite: false, tags: ["a", "b"] });
    await expect(e.call("secrets/export-csv", { path, confirm: true, password: PASSWORD })).rejects.toMatchObject({ code: "EXISTS" });
    e.svc.lock();
    await expect(e.call("secrets/export-csv", { path: join(e.root, "x.csv"), confirm: true, password: PASSWORD })).rejects.toMatchObject({ code: "LOCKED" });
  });
});
