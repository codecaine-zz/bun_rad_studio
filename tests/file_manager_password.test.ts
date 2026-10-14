import { describe, expect, test } from "bun:test";
import { createContext } from "../src/features/filemanager/fmCore";
import { cryptoOperations } from "../src/features/filemanager/fmCryptoOps";
import { PASSWORD_LIMITS, estimatePasswordMs, parsePasswordHash, passwordParams } from "../src/features/filemanager/fmPassword";
import { FmError } from "../src/features/filemanager/fmPaths";
import { API_OPERATIONS } from "../src/features/filemanager/fmServer";

const ctx = createContext({ home: "/", dataDir: "/" });
const op = (name: string, body: Record<string, any> = {}) => cryptoOperations[`crypto/${name}`]!(ctx, body) as Promise<any>;
async function failure(name: string, body: Record<string, any>) {
  try {
    await op(name, body);
  } catch (err: any) {
    expect(err).toBeInstanceOf(FmError);
    return { code: err.code as string, message: err.message as string };
  }
  throw new Error(`crypto/${name} should have failed`);
}
const SECRET = "pw-secret-ZQ41-correct horse";
// Published test vectors: argon2id of "password" with salt "somesalt" (from the argon2 reference test-suite) and the crypt_blowfish bcrypt vector for "U*U".
const ARGON2ID = "$argon2id$v=19$m=65536,t=2,p=1$c29tZXNhbHQ$CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc";
const BCRYPT = "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW";

describe("password hashing with Bun.password", () => {
  test("operations are registered", () => {
    for (const n of ["pwhash", "pwcheck", "pwcost"]) expect(API_OPERATIONS).toContain(`crypto/${n}`);
  });

  test("known vectors check out, and a wrong password is just 'no'", async () => {
    const good = await op("pwcheck", { password: "password", hash: ARGON2ID });
    expect(good).toMatchObject({ matches: true, algorithm: "argon2id" });
    expect(good.description).toBe("argon2id, 64 MiB of memory, 2 passes, 1 thread");
    expect((await op("pwcheck", { password: "Password", hash: ARGON2ID })).matches).toBe(false);
    expect(await op("pwcheck", { password: "U*U", hash: BCRYPT })).toMatchObject({ matches: true, algorithm: "bcrypt", description: "bcrypt, cost 5" });
    expect((await op("pwcheck", { password: "U*V", hash: `  ${BCRYPT}\n` })).matches).toBe(false);
  });

  test("every algorithm round-trips and gives the standard stored form", async () => {
    const small = { memoryCost: 1024, timeCost: 1, cost: 4 };
    for (const [algorithm, prefix] of [["argon2id", "$argon2id$v=19$"], ["argon2i", "$argon2i$v=19$"], ["argon2d", "$argon2d$v=19$"], ["bcrypt", "$2b$04$"]] as const) {
      const r = await op("pwhash", { password: SECRET, algorithm, ...small });
      expect(r.hash.startsWith(prefix), algorithm).toBe(true);
      expect(r.algorithm).toBe(algorithm);
      expect(r.ms).toBeGreaterThanOrEqual(0);
      expect(typeof r.estimateMs).toBe("number");
      const check = await op("pwcheck", { password: SECRET, hash: r.hash });
      expect(check).toMatchObject({ matches: true, algorithm });
      expect((await op("pwcheck", { password: SECRET + "x", hash: r.hash })).matches).toBe(false);
      expect(JSON.stringify(r)).not.toContain(SECRET);
    }
  });

  test("the same password gives a different hash every time (random salt)", async () => {
    const a = await op("pwhash", { password: SECRET, algorithm: "bcrypt", cost: 4 });
    const b = await op("pwhash", { password: SECRET, algorithm: "bcrypt", cost: 4 });
    expect(a.hash).not.toBe(b.hash);
  });

  test("defaults are argon2id with Bun's usual 64 MiB and 2 passes", async () => {
    const r = await op("pwhash", { password: "x" });
    expect(r.hash).toContain("$argon2id$v=19$m=65536,t=2,p=1$");
  });

  test("bcrypt: a password longer than 72 bytes is explained, and the extra bytes still count", async () => {
    const long = "a".repeat(72) + "X";
    const r = await op("pwhash", { password: long, algorithm: "bcrypt", cost: 4 });
    expect(r.note).toMatch(/72 bytes/);
    expect(r.note).toMatch(/SHA-512/);
    expect((await op("pwcheck", { password: long, hash: r.hash })).matches).toBe(true);
    expect((await op("pwcheck", { password: "a".repeat(72) + "Y", hash: r.hash })).matches).toBe(false);
    expect((await op("pwhash", { password: "short", algorithm: "bcrypt", cost: 4 })).note).toBe("");
    // 72 bytes of multi-byte text are counted in bytes, not characters
    expect((await op("pwhash", { password: "é".repeat(40), algorithm: "bcrypt", cost: 4 })).note).toMatch(/72 bytes/);
  });

  test("costs are bounded, with plain explanations", async () => {
    const L = PASSWORD_LIMITS;
    for (const bad of [{ cost: 3 }, { cost: 17 }, { cost: 4.5 }, { algorithm: "bcrypt", cost: 31 }, { memoryCost: 7 }, { memoryCost: L.memoryCost.max + 1 }, { timeCost: 0 }, { timeCost: 11 }, { timeCost: "lots" }]) {
      const f = await failure("pwhash", { password: "x", ...bad });
      expect(f.code, JSON.stringify(bad)).toBe("BAD_REQUEST");
      expect(f.message).toMatch(/whole number from/);
      expect(f.message).not.toContain("x\"");
    }
    expect((await failure("pwhash", { password: "x", algorithm: "md5" })).message).toMatch(/Choose argon2id/);
    expect(() => passwordParams({ memoryCost: L.memoryCost.max, timeCost: L.timeCost.max, cost: L.cost.max })).not.toThrow();
  });

  test("the extremes really work: the largest allowed bcrypt cost is not needed, the smallest argon2 settings are", async () => {
    const r = await op("pwhash", { password: "x", algorithm: "argon2id", memoryCost: 8, timeCost: 1 });
    expect(r.hash).toContain("m=8,t=1,p=1");
  }, 30_000);

  test("estimates grow with the settings", () => {
    const base = { algorithm: "argon2id", memoryCost: 65536, timeCost: 2, cost: 10 } as const;
    expect(estimatePasswordMs({ ...base, timeCost: 4 })).toBe(estimatePasswordMs(base) * 2);
    expect(estimatePasswordMs({ ...base, algorithm: "bcrypt", cost: 12 })).toBe(estimatePasswordMs({ ...base, algorithm: "bcrypt", cost: 11 }) * 2);
  });

  test("the cost hint operation needs no password and validates the settings", async () => {
    expect((await op("pwcost", { algorithm: "bcrypt", cost: 14 })).estimateMs).toBeGreaterThan(300);
    expect((await failure("pwcost", { cost: 99 })).code).toBe("BAD_REQUEST");
  });

  test("bad input: empty password, missing or odd hashes", async () => {
    expect((await failure("pwhash", { password: "" })).message).toMatch(/Enter a password/);
    expect((await failure("pwhash", {})).code).toBe("BAD_REQUEST");
    expect((await failure("pwhash", { password: 42 })).code).toBe("BAD_REQUEST");
    expect((await failure("pwcheck", { password: "x", hash: "" })).message).toMatch(/Enter the stored hash/);
    expect((await failure("pwcheck", { password: "", hash: ARGON2ID })).message).toMatch(/Enter a password/);
    for (const hash of ["not a hash", "$foo$bar", "$argon2id$garbage", "$2b$04$short", `${ARGON2ID}\n${ARGON2ID}`, "5f4dcc3b5aa765d61d8327deb882cf99"]) {
      expect((await failure("pwcheck", { password: "x", hash })).code, hash).toBe("BAD_HASH");
    }
    expect((await failure("pwcheck", { password: "x", hash: "$argon2id$v=19$m=65536,t=2,p=1$" + "A".repeat(600) })).code).toBe("TOO_LARGE");
  });

  test("a pasted hash can't ask for more memory or time than the limits allow", async () => {
    const huge = "$argon2id$v=19$m=4194304,t=2,p=1$c29tZXNhbHQ$CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc";
    const slow = "$argon2id$v=19$m=65536,t=99,p=1$c29tZXNhbHQ$CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc";
    const bcrypt31 = "$2b$31$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW";
    for (const hash of [huge, slow, bcrypt31]) {
      const f = await failure("pwcheck", { password: "x", hash });
      expect(f.code).toBe("TOO_COSTLY");
      expect(f.message).toMatch(/tie up the computer/);
    }
  });

  test("parsePasswordHash reads the algorithm and cost out of the hash", () => {
    expect(parsePasswordHash(ARGON2ID)).toEqual({ algorithm: "argon2id", memoryCost: 65536, timeCost: 2, parallelism: 1 });
    expect(parsePasswordHash(BCRYPT)).toEqual({ algorithm: "bcrypt", cost: 5 });
    expect(parsePasswordHash("hello")).toBeNull();
  });

  test("one job at a time: a second one is refused instead of piling up", async () => {
    const first = op("pwhash", { password: "x", algorithm: "argon2id", memoryCost: 262144, timeCost: 3 });
    const second = failure("pwhash", { password: "y", algorithm: "bcrypt", cost: 4 });
    expect((await second).code).toBe("TOO_MANY");
    expect((await first).hash).toContain("$argon2id$");
    expect((await op("pwhash", { password: "z", algorithm: "bcrypt", cost: 4 })).hash).toContain("$2b$04$"); // free again afterwards
  }, 30_000);

  test("the password never appears in an error message", async () => {
    const f = await failure("pwcheck", { password: SECRET, hash: "garbage" });
    expect(f.message).not.toContain(SECRET);
    const g = await failure("pwhash", { password: SECRET, cost: 99, algorithm: "bcrypt" });
    expect(g.message).not.toContain(SECRET);
  });
});
