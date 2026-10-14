import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, createHmac, randomBytes } from "crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { formatDigestReport } from "../src/crypto_tools";
import { stdlib } from "../src/simplecli/stdlib";
import { createContext } from "../src/features/filemanager/fmCore";
import {
  MAX_TEXT_BYTES, checkChecksum, decryptText, encodeText, encryptText, estimateEntropy, generateValue, hashAlgorithms, inspectUuid, uuidV7, hashText, hmacAlgorithms, inspectJwt,
} from "../src/features/filemanager/fmCrypto";
import { cryptoOperations } from "../src/features/filemanager/fmCryptoOps";
import { FmError } from "../src/features/filemanager/fmPaths";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-crypto-"));
const home = join(root, "home");
const dataDir = join(root, "data");
const work = join(home, "work");
let server: ReturnType<typeof startFileManagerServer>;
let base: string;
const TOKEN = "crypto-test-token";
const PASS = "S3cr3t-Passphrase-ZZ9";

beforeAll(() => {
  mkdirSync(work, { recursive: true });
  server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home, dataDir } });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

async function api(op: string, body: unknown = {}, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
}

const ctx = createContext({ home, dataDir });
const op = (name: string, body: Record<string, any> = {}) => cryptoOperations[`crypto/${name}`]!(ctx, body) as Promise<any>;
const digest = (rows: [string, string][], label: string) => rows.find(([l]) => l === label)?.[1];
/** The error an operation throws, as { code, message }. */
async function failure(name: string, body: Record<string, any>) {
  try {
    await op(name, body);
  } catch (err: any) {
    expect(err).toBeInstanceOf(FmError);
    return { code: err.code as string, message: err.message as string };
  }
  throw new Error(`crypto/${name} should have failed`);
}
const b64url = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function makeJwt(header: object, payload: object, secret: string | null, algo = "sha256") {
  const signing = `${b64url(header)}.${b64url(payload)}`;
  return `${signing}.${secret === null ? "" : createHmac(algo, secret).update(signing).digest("base64url")}`;
}

describe("hashes of text (known answers)", () => {
  const rows = hashText("abc");
  const vectors: Record<string, string> = {
    "SHA-256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "SHA-384": "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
    "SHA-512": "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    "SHA-1": "a9993e364706816aba3e25717850c26c9cd0d89d",
    MD5: "900150983cd24fb0d6963f7d28e17f72",
    "SHA-224": "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7",
    "SHA-512/256": "53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23",
    "SHA3-256": "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532",
    "SHA3-384": "ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b298d88cea927ac7f539f1edf228376d25",
    "SHA3-512": "b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0",
    "BLAKE2b-512": "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923",
    "BLAKE2s-256": "508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982",
    "RIPEMD-160": "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc",
  };
  for (const [label, expected] of Object.entries(vectors)) {
    test(`${label}("abc")`, () => {
      // SHA-3, BLAKE2 and the like depend on the runtime; the always-present ones must exist.
      if (!hashAlgorithms().includes(label)) {
        expect(["SHA-256", "SHA-384", "SHA-512", "SHA-1", "MD5"]).not.toContain(label);
        return;
      }
      expect(digest(rows, label)).toBe(expected);
    });
  }

  test("the five classic algorithms are always offered, and the list has no duplicates", () => {
    for (const a of ["SHA-256", "SHA-512", "SHA-384", "SHA-1", "MD5"]) expect(hashAlgorithms()).toContain(a);
    expect(new Set(hashAlgorithms()).size).toBe(hashAlgorithms().length);
  });

  test("no key means no HMAC rows; the empty string has its well-known SHA-256", () => {
    expect(rows.some(([l]) => l.startsWith("HMAC"))).toBe(false);
    expect(digest(hashText(""), "SHA-256")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  test("hashes are of the UTF-8 bytes", () => {
    expect(digest(hashText("héllo ✓"), "SHA-256")).toBe(createHash("sha256").update(Buffer.from("héllo ✓", "utf8")).digest("hex"));
  });

  test("HMAC: RFC 4231 / RFC 2202 test case 2 and RFC 4231 test case 1", () => {
    const r = hashText("what do ya want for nothing?", "Jefe");
    expect(digest(r, "HMAC-SHA256")).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    expect(digest(r, "HMAC-SHA384")).toBe("af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649");
    expect(digest(r, "HMAC-SHA512")).toBe("164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737");
    expect(digest(r, "HMAC-SHA1")).toBe("effcdf6ae5eb2fa2d27416d5f184df9c259a7c79");
    expect(digest(r, "HMAC-MD5")).toBe("750c783e6ab0b503eaa86e310a5db738");
    expect(hmacAlgorithms()).toContain("HMAC-SHA256");
    expect(digest(hashText("Hi There", "\x0b".repeat(20)), "HMAC-SHA256")).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });

  test("the text is also exactly what stdlib computes (the Crypto Studio Pro results)", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const r = hashText(text, "secret-signing-key");
    expect(digest(r, "SHA-256")).toBe(stdlib.sha256(text));
    expect(digest(r, "SHA-512")).toBe(stdlib.sha512(text));
    expect(digest(r, "MD5")).toBe(stdlib.md5(text));
    expect(digest(r, "SHA-1")).toBe(stdlib.sha1(text));
    expect(digest(r, "HMAC-SHA256")).toBe(stdlib.hmacSha256("secret-signing-key", text));
  });
});

describe("AES lock and unlock", () => {
  test("round trip, including unicode and long text; a fresh IV each time", () => {
    for (const text of ["hello", "naïve café ✓ 日本語 🔐", "x".repeat(50_000), "line1\nline2\r\n\ttabbed"]) {
      const locked = encryptText(text, PASS);
      expect(locked).toMatch(/^[0-9a-f]{32}:[A-Za-z0-9+/]+=*$/);
      expect(decryptText(locked, PASS)).toEqual({ text, suspicious: false });
    }
    expect(encryptText("same", PASS)).not.toBe(encryptText("same", PASS));
  });

  test("the format is what the standard library makes, and pasted line breaks are tolerated", () => {
    const locked = stdlib.aesEncrypt("from stdlib", PASS);
    expect(decryptText(locked, PASS).text).toBe("from stdlib");
    expect(decryptText(`  ${locked.slice(0, 40)}\n${locked.slice(40)}  `, PASS).text).toBe("from stdlib");
  });

  const fixed = stdlib.aesEncrypt("meet me at noon, bring the documents", PASS, "00112233445566778899aabbccddeeff");

  test("a wrong passphrase gives a plain sentence (or is flagged as nonsense), never a stack trace", () => {
    let outcome: string;
    try {
      outcome = decryptText(fixed, "not-the-passphrase").suspicious ? "flagged" : "silently-wrong";
    } catch (err: any) {
      expect(err).toBeInstanceOf(FmError);
      expect(err.code).toBe("DECRYPT_FAILED");
      expect(err.message).toMatch(/passphrase is wrong/);
      expect(err.message).not.toMatch(/at \w|\.ts|bad decrypt|EVP|OpenSSL/i);
      outcome = "error";
    }
    expect(["error", "flagged"]).toContain(outcome);
  });

  test("tampered, cut-short and nonsense ciphertext are explained", () => {
    const [iv, data] = fixed.split(":") as [string, string];
    const raw = Buffer.from(data, "base64");
    const flipped = Buffer.from(raw);
    flipped[flipped.length - 1] = flipped[flipped.length - 1]! ^ 0xff;
    const cases = [
      `${iv}:${flipped.toString("base64")}`, // last block changed: padding no longer valid
      `${iv}:${raw.subarray(0, raw.length - 5).toString("base64")}`, // cut short, not a whole block
      `${iv}:${raw.subarray(0, 16).toString("base64")}`, // whole block but wrong padding
      "not encrypted text at all",
      `${iv}:`,
      `${iv.slice(2)}:${data}`, // IV too short
      `${iv}:@@@@`,
    ];
    for (const bad of cases) {
      let caught: any;
      try { decryptText(bad, PASS); } catch (err) { caught = err; }
      expect(caught, bad).toBeInstanceOf(FmError);
      expect(caught.message).not.toMatch(/\bat \w|\.ts:|EVP|OpenSSL|bad decrypt|Invalid IV/i);
    }
  });

  test("a 64-digit hex passphrase is used directly as the key (documented)", () => {
    const key = randomBytes(32).toString("hex");
    expect(decryptText(encryptText("raw key", key), key).text).toBe("raw key");
  });
});

describe("strength estimate", () => {
  const expectedBits = (text: string) => {
    const pool = (/[a-z]/.test(text) ? 26 : 0) + (/[A-Z]/.test(text) ? 26 : 0) + (/[0-9]/.test(text) ? 10 : 0) + (/[^a-zA-Z0-9]/.test(text) ? 32 : 0);
    return Math.round([...text].length * Math.log2(pool));
  };
  const table: Array<[string, number]> = [
    ["", 0], ["abc", 1], ["1234", 1], ["abcdefgh", 1], ["abcdefghi", 2], ["abcdefghijkl", 2], ["abcdefghijklm", 3], ["abcdefghijklmnop", 3],
    ["abcdefghijklmnopq", 4], ["Password1!", 3], ["Tr0ub4dor&3", 3], ["correct horse battery staple", 4],
  ];
  for (const [text, level] of table) {
    test(`"${text}" is level ${level}`, () => {
      const e = estimateEntropy(text);
      expect(e.level as number).toBe(level);
      expect(e.bits).toBe(text ? expectedBits(text) : 0);
      expect(e.strength.length).toBeGreaterThan(0);
      expect(e.advice.length).toBeGreaterThan(10);
    });
  }
  test("repetition is called out, and characters beyond ASCII count once each", () => {
    expect(estimateEntropy("a".repeat(30)).advice).toMatch(/repeat/);
    expect(estimateEntropy("🔐🔐").length).toBe(2);
  });
});

describe("UUID v7", () => {
  const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  test("a new one is version 7, carries the current time, and a later one sorts after an earlier one", () => {
    const before = Date.now();
    const made = Array.from({ length: 200 }, () => uuidV7());
    const after = Date.now();
    for (const u of made) {
      expect(u).toMatch(V7);
      const t = parseInt(u.replaceAll("-", "").slice(0, 12), 16);
      expect(t).toBeGreaterThanOrEqual(before - 1);
      expect(t).toBeLessThanOrEqual(after + 1);
    }
    expect(new Set(made).size).toBe(200);
    expect(uuidV7(1_700_000_000_000)).toMatch(/^018bcfe5-6800-7/);
    expect(uuidV7(0).startsWith("00000000-0000-7")).toBe(true);
    const early = uuidV7(1_000);
    const late = uuidV7(2_000);
    expect([late, early].sort()).toEqual([early, late]);
  });

  test("generate: count, formats, a chosen time, and limits", () => {
    const one = generateValue({ kind: "uuid7" });
    expect(one.value).toMatch(V7);
    expect(one.bits).toBe(74);
    const ten = generateValue({ kind: "uuid7", count: 10, format: "plain" }).value.split("\n");
    expect(ten).toHaveLength(10);
    for (const u of ten) expect(u).toMatch(/^[0-9a-f]{12}7[0-9a-f]{3}[89ab][0-9a-f]{15}$/);
    expect(generateValue({ kind: "uuid7", format: "upper" }).value).toMatch(/^[0-9A-F-]{36}$/);
    const compact = generateValue({ kind: "uuid7", format: "base64url" }).value;
    expect(compact).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(inspectUuid(compact).version).toBe(7);
    expect(generateValue({ kind: "uuid7", timeMs: 1_700_000_000_000 }).value).toMatch(/^018bcfe5-6800-7/);
    expect(generateValue({ kind: "uuid7", timeMs: "1700000000000" }).value).toMatch(/^018bcfe5-6800-7/);
    for (const bad of [0, -1, 101, 1.5, "x", NaN]) expect(() => generateValue({ kind: "uuid7", count: bad }), String(bad)).toThrow(FmError);
    for (const bad of [-1, 2 ** 48, 1.5, "soon"]) expect(() => generateValue({ kind: "uuid7", timeMs: bad }), String(bad)).toThrow(FmError);
    expect(() => generateValue({ kind: "uuid7", format: "nope" })).toThrow(FmError);
  });

  test("inspect: version, variant and time of v1, v4, v5, v6 and v7, nil and max, and every way of writing one", () => {
    const v7 = inspectUuid("018bcfe5-6800-75c2-9b8f-d45f5bde5010");
    expect(v7).toMatchObject({ version: 7, variant: "Standard (RFC 9562)", timeMs: 1_700_000_000_000, iso: "2023-11-14T22:13:20.000Z" });
    expect(inspectUuid("1ee8bd0e-1e8f-6c80-8c10-0242ac120002").version).toBe(6);
    const v1 = inspectUuid("c232ab00-9414-11ec-b3c8-9f6bdeced846");
    expect(v1).toMatchObject({ version: 1, iso: "2022-02-22T19:22:22.000Z" });
    const v6 = inspectUuid("1ec9414c-232a-6b00-b3c8-9f6bdeced846");
    expect(v6).toMatchObject({ version: 6, iso: "2022-02-22T19:22:22.000Z" });
    expect(inspectUuid("3b241101-e2bb-4255-8caf-4136c566a962")).toMatchObject({ version: 4 });
    expect(inspectUuid("3b241101-e2bb-4255-8caf-4136c566a962").iso).toBeUndefined();
    expect(inspectUuid("886313e1-3b8a-5372-9b90-0c9aee199e5d").version).toBe(5);
    expect(inspectUuid("00000000-0000-0000-0000-000000000000")).toMatchObject({ variant: "Nil", version: null });
    expect(inspectUuid("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")).toMatchObject({ variant: "Max", version: null });
    const canonical = "018bcfe5-6800-75c2-9b8f-d45f5bde5010";
    for (const written of ["018BCFE5-6800-75C2-9B8F-D45F5BDE5010", "018bcfe5680075c29b8fd45f5bde5010", `{${canonical}}`, `urn:uuid:${canonical}`, `  ${canonical}  `, "AYvP5WgAdcKbj9RfW95QEA"]) {
      expect(inspectUuid(written).canonical, written).toBe(canonical);
    }
    expect(inspectUuid("018bcfe5-6800-75c2-0b8f-d45f5bde5010").kind).toMatch(/Not a standard/);
  });

  test("bad input is explained in plain words", () => {
    for (const bad of ["", "   ", "hello", "018bcfe5-6800-75c2-9b8f-d45f5bde501", "018bcfe5-6800-75c2-9b8f-d45f5bde50100", "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz", null, 5, {}]) {
      expect(() => inspectUuid(bad), String(bad)).toThrow(FmError);
    }
    expect(() => inspectUuid("hello")).toThrow(/isn't a UUID/);
  });

  test("the operations answer, and need the token", async () => {
    const made = await cryptoOperations["crypto/generate"]!(createContext({ platform: "linux", home: root, dataDir: root }), { kind: "uuid7", count: 2 }) as any;
    expect(made.value.split("\n")).toHaveLength(2);
    const info = await cryptoOperations["crypto/uuid"]!(createContext({ platform: "linux", home: root, dataDir: root }), { text: made.value.split("\n")[0] }) as any;
    expect(info.version).toBe(7);
    expect(API_OPERATIONS).toContain("crypto/uuid");
  });
});

describe("random values", () => {
  test("UUID v4, hex key, Base64 key", () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const u = generateValue({ kind: "uuid" }).value;
      expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      uuids.add(u);
    }
    expect(uuids.size).toBe(50);
    const hex = new Set(Array.from({ length: 50 }, () => generateValue({ kind: "hex32" }).value));
    expect(hex.size).toBe(50);
    for (const v of hex) expect(v).toMatch(/^[0-9a-f]{64}$/);
    const b64 = generateValue({ kind: "base64-256" });
    expect(Buffer.from(b64.value, "base64").length).toBe(32);
    expect(b64.value).toHaveLength(44);
    expect(b64.bits).toBe(256);
  });

  test("random bytes: lengths 1 to 1024, hex or Base64; everything else refused", () => {
    for (const n of [1, 2, 16, 1000, 1024]) {
      expect(generateValue({ kind: "bytes", length: n }).value).toMatch(new RegExp(`^[0-9a-f]{${n * 2}}$`));
      expect(Buffer.from(generateValue({ kind: "bytes", length: n, format: "base64" }).value, "base64").length).toBe(n);
    }
    expect(generateValue({ kind: "bytes", length: 8 }).bits).toBe(64);
    for (const bad of [0, -1, 1025, 1.5, NaN, "abc", null, undefined]) expect(() => generateValue({ kind: "bytes", length: bad })).toThrow(FmError);
    expect(() => generateValue({ kind: "nonsense" })).toThrow(FmError);
    expect(() => generateValue({})).toThrow(FmError);
  });

  test("passwords: length is clamped, character kinds are honoured, look-alikes can be left out", () => {
    expect(generateValue({ kind: "password", length: 2 }).value).toHaveLength(4);
    expect(generateValue({ kind: "password", length: 1000 }).value).toHaveLength(256);
    expect(generateValue({ kind: "password", length: "nope" }).value).toHaveLength(20);
    const lowerOnly = generateValue({ kind: "password", length: 40, lower: true, upper: false, digits: false, symbols: false }).value;
    expect(lowerOnly).toMatch(/^[a-z]{40}$/);
    const full = generateValue({ kind: "password", length: 24, symbols: true }).value;
    expect(full).toMatch(/[a-z]/);
    expect(full).toMatch(/[A-Z]/);
    expect(full).toMatch(/[0-9]/);
    expect(full).toMatch(/[^a-zA-Z0-9]/);
    for (let i = 0; i < 200; i++) expect(generateValue({ kind: "password", length: 64, symbols: true, noAmbiguous: true }).value).not.toMatch(/[O0oIl1|`'"]/);
    expect(new Set(Array.from({ length: 30 }, () => generateValue({ kind: "password", length: 20 }).value)).size).toBe(30);
    const g = generateValue({ kind: "password", length: 20, symbols: true });
    expect(g.bits).toBe(estimateEntropy(g.value).bits);
    expect(() => generateValue({ kind: "password", length: 12, lower: false, upper: false, digits: false, symbols: false })).toThrow(/at least one kind/);
  });
});

describe("JWT", () => {
  const JWT_IO = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const RFC7515 = "eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const NOW = Date.UTC(2024, 0, 1);

  test("decodes header, payload and times; a known HS256 token verifies only with its secret", () => {
    const r = inspectJwt(JWT_IO, "", NOW);
    expect(r.alg).toBe("HS256");
    expect(JSON.parse(r.headerText)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(r.payloadText)).toEqual({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
    expect(r.times[0]).toContain("Issued at (iat): 2018-01-18T01:30:22Z");
    expect(r.verified).toBeNull();
    expect(r.signed).toBe(true);
    expect(inspectJwt(JWT_IO, "your-256-bit-secret", NOW).verified).toEqual({ ok: true, alg: "HS256" });
    const wrong = inspectJwt(JWT_IO, "your-256-bit-secreT", NOW).verified!;
    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toMatch(/does not match/);
  });

  test("the RFC 7515 example decodes (CRLF inside its JSON included) and is reported as expired", () => {
    const r = inspectJwt(RFC7515, "", NOW);
    expect(JSON.parse(r.payloadText)).toEqual({ iss: "joe", exp: 1300819380, "http://example.com/is_root": true });
    expect(r.expired).toBe(true);
    expect(r.times).toContain("Status: EXPIRED");
    expect(r.times.join("\n")).toContain("Expires (exp): 2011-03-22T18:43:00Z");
    expect(inspectJwt(RFC7515, "", Date.UTC(2011, 0, 1)).times).toContain("Status: not expired");
    expect(inspectJwt(RFC7515, "", Date.UTC(2011, 0, 1)).expired).toBe(false);
  });

  test("HS384 and HS512 tokens verify; the other algorithms are explained, not attempted", () => {
    for (const [alg, algo] of [["HS384", "sha384"], ["HS512", "sha512"]] as const) {
      expect(inspectJwt(makeJwt({ alg }, { a: 1 }, "k", algo), "k").verified).toEqual({ ok: true, alg });
      expect(inspectJwt(makeJwt({ alg }, { a: 1 }, "k", algo), "other").verified!.ok).toBe(false);
    }
    const rs = inspectJwt(makeJwt({ alg: "RS256" }, { a: 1 }, "x"), "x").verified!;
    expect(rs.ok).toBe(false);
    expect(rs.reason).toMatch(/Only HS256\/HS384\/HS512/);
  });

  test("alg=none is never accepted, with or without a secret, in any spelling", () => {
    for (const alg of ["none", "None", "NONE"]) {
      const token = makeJwt({ alg, typ: "JWT" }, { sub: "admin" }, null);
      const r = inspectJwt(token, "anything");
      expect(r.verified!.ok).toBe(false);
      expect(r.verified!.reason).toMatch(/alg=none/);
      expect(r.warnings.join(" ")).toMatch(/unsigned/);
      expect(inspectJwt(token).verified).toBeNull();
    }
    // a "none" token that carries a signature part is not trusted either
    expect(inspectJwt(makeJwt({ alg: "none" }, {}, "k"), "k").verified!.ok).toBe(false);
  });

  test("an empty or altered signature, a tampered payload and odd algorithm names fail safely", () => {
    const good = makeJwt({ alg: "HS256" }, { sub: "a" }, "k");
    const [h, p, s] = good.split(".") as [string, string, string];
    expect(inspectJwt(`${h}.${p}.`, "k").verified!.ok).toBe(false);
    expect(inspectJwt(`${h}.${b64url({ sub: "b" })}.${s}`, "k").verified!.ok).toBe(false);
    for (const alg of ["__proto__", "constructor", "toString", "", 5, null]) {
      const r = inspectJwt(makeJwt({ alg }, {}, "k"), "k");
      expect(r.verified!.ok).toBe(false);
    }
    expect(inspectJwt(`${h}.${p}`, "k").verified!.ok).toBe(false); // two parts: no signature at all
  });

  test("a signature with extra junk characters is rejected, not quietly accepted", () => {
    const good = makeJwt({ alg: "HS256" }, { sub: "a" }, "k");
    for (const junk of ["!!", "=", "+", "/", "é"]) expect(() => inspectJwt(good + junk, "k")).toThrow(FmError);
    expect(inspectJwt(`${good}\n `, "k").verified!.ok).toBe(true); // surrounding whitespace from copy and paste is fine
  });

  test("not a token: plain sentences", () => {
    for (const bad of ["hello", "a.b.c.d", "a..c", "!!.@@.##", `${b64url("not json")}.${b64url({})}.x`, `${b64url([1])}.${b64url({})}.x`, `${b64url({})}.${b64url("true")}.x`]) {
      let caught: any;
      try { inspectJwt(bad, "k"); } catch (err) { caught = err; }
      expect(caught, bad).toBeInstanceOf(FmError);
      expect(caught.code).toBe("BAD_TOKEN");
      expect(caught.message).not.toContain("k\"");
    }
  });

  test("a Bearer prefix is ignored, and absurd time claims don't crash", () => {
    expect(inspectJwt(`Bearer ${JWT_IO}`, "your-256-bit-secret").verified!.ok).toBe(true);
    const r = inspectJwt(makeJwt({ alg: "HS256" }, { exp: 1e20, iat: -1e20 }, "k"), "", NOW);
    expect(r.times.length).toBeGreaterThan(0);
  });
});

describe("encoders", () => {
  test("round trips", () => {
    const text = "a b&c=d/é?✓ 日本";
    for (const [enc, dec] of [["url-encode", "url-decode"], ["base64-encode", "base64-decode"], ["hex-encode", "hex-decode"]] as const) {
      const out = encodeText(enc, text).output;
      expect(encodeText(dec, out).output).toBe(text);
    }
    expect(encodeText("url-encode", "a b&c").output).toBe("a%20b%26c");
    expect(encodeText("base64-encode", "Hello").output).toBe("SGVsbG8=");
    expect(encodeText("hex-encode", "Hi").output).toBe("4869");
    expect(encodeText("base64-decode", "SGVsbG8").output).toBe("Hello");
    expect(encodeText("hex-decode", "0x48 69").output).toBe("Hi");
    expect(encodeText("base64-decode", "SGVs\nbG8=").output).toBe("Hello");
  });

  test("invalid input gets a plain explanation", () => {
    const cases: Array<[string, string, RegExp]> = [
      ["base64-decode", "!!!", /not valid Base64/],
      ["hex-decode", "abc", /valid hex/],
      ["hex-decode", "zz", /valid hex/],
      ["url-decode", "%E0%A4%A", /valid URL-encoded/],
      ["url-decode", "100%", /valid URL-encoded/],
    ];
    for (const [mode, text, re] of cases) {
      let caught: any;
      try { encodeText(mode, text); } catch (err) { caught = err; }
      expect(caught, `${mode} ${text}`).toBeInstanceOf(FmError);
      expect(caught.message).toMatch(re);
    }
    expect(() => encodeText("rot13", "x")).toThrow(FmError);
    expect(() => encodeText("__proto__", "x")).toThrow(FmError);
    expect(() => encodeText("hex-encode", "")).toThrow(FmError);
  });

  test("binary results are flagged", () => {
    expect(encodeText("base64-decode", "/w==").note).toMatch(/binary/);
    expect(encodeText("base64-decode", "SGk=").note).toBeUndefined();
  });
});

describe("checksum matching", () => {
  const rows = hashText("abc", "key");
  const sha256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  const md5 = "900150983cd24fb0d6963f7d28e17f72";
  test("whitespace, case, prefixes and tool output formats all match", () => {
    const variants = [
      sha256, sha256.toUpperCase(), `  ${sha256}\n`, `sha256:${sha256}`, `SHA256=${sha256}`, `0x${sha256}`,
      sha256.replace(/(..)/g, "$1:").slice(0, -1), sha256.replace(/(.{8})/g, "$1 ").trim(), `${sha256}  abc.txt`, `${sha256} *abc.txt`, `SHA256 (abc.txt) = ${sha256}`,
      `Checksum: ${sha256.toUpperCase()}`,
    ];
    for (const v of variants) expect(checkChecksum(v, rows).match, v).toBe("SHA-256");
    expect(checkChecksum(`MD5 (abc.txt) = ${md5}`, rows).match).toBe("MD5");
    expect(checkChecksum(sha256.slice(0, 40), rows).match).toBeNull();
  });
  test("a wrong checksum says why", () => {
    const flipped = (sha256[0] === "a" ? "b" : "a") + sha256.slice(1);
    expect(checkChecksum(flipped, rows)).toMatchObject({ match: null });
    expect(checkChecksum(flipped, rows).hint).toMatch(/length of a SHA-256/);
    expect(checkChecksum("xyz-not-hex", rows).hint).toMatch(/doesn't look like a checksum/);
    expect(checkChecksum("abcd123", rows).hint).toMatch(/7 characters/);
    expect(checkChecksum("abcd1234", rows).hint).toMatch(/length of a 32-bit fast/);
    expect(checkChecksum("d".repeat(40), rows).hint).toMatch(/SHA-1/);
    expect(checkChecksum("   ", rows).match).toBeNull();
  });
  test("an HMAC digest is never accepted as a checksum", () => {
    const hmac = digest(rows, "HMAC-SHA256")!;
    expect(checkChecksum(hmac, rows).match).toBeNull();
  });
  test("absurdly long input is refused", () => {
    expect(() => checkChecksum("a".repeat(2001), rows)).toThrow(FmError);
  });
});

describe("operations: limits and secrets in errors", () => {
  const big = "x".repeat(MAX_TEXT_BYTES + 1);
  test("oversize text is refused by every operation that takes text", async () => {
    for (const [name, body] of [["hash", { text: big }], ["encrypt", { text: big, passphrase: PASS }], ["decrypt", { cipher: big, passphrase: PASS }], ["entropy", { text: big }], ["encode", { mode: "hex-encode", text: big }], ["jwt", { token: big }], ["verify", { expected: big, text: "a" }]] as const) {
      expect((await failure(name, body)).code, name).toBe("TOO_LARGE");
    }
    expect(Buffer.byteLength("é".repeat(MAX_TEXT_BYTES / 2 + 1))).toBeGreaterThan(MAX_TEXT_BYTES);
    expect((await failure("hash", { text: "é".repeat(MAX_TEXT_BYTES / 2 + 1) })).code).toBe("TOO_LARGE");
    expect((await op("hash", { text: "x".repeat(MAX_TEXT_BYTES) })).bytes).toBe(MAX_TEXT_BYTES);
    expect((await failure("hash", { text: "a", key: "k".repeat(10_001) })).code).toBe("TOO_LARGE");
    expect((await failure("hash", { text: 42 })).code).toBe("BAD_REQUEST");
    expect((await failure("hash", { text: "a", key: { k: 1 } })).code).toBe("BAD_REQUEST");
  });

  test("passphrases, keys and secrets never appear in an error message", async () => {
    const secrets = [PASS, "hmac-key-QQ77", "jwt-secret-KK33"];
    const attempts: Array<[string, Record<string, any>]> = [
      ["encrypt", { text: big, passphrase: PASS }],
      ["encrypt", { text: "", passphrase: PASS }],
      ["decrypt", { cipher: "garbage", passphrase: PASS }],
      ["decrypt", { cipher: encryptText("hi", "other"), passphrase: PASS }],
      ["decrypt", { cipher: big, passphrase: PASS }],
      ["hash", { text: big, key: "hmac-key-QQ77" }],
      ["jwt", { token: "not.a.jwt", secret: "jwt-secret-KK33" }],
      ["jwt", { token: big, secret: "jwt-secret-KK33" }],
      ["encrypt", { text: "abc", passphrase: "p".repeat(10_001) }],
    ];
    for (const [name, body] of attempts) {
      let message = "";
      try { await op(name, body); } catch (err: any) { message = String(err.message) + String(err.stack ?? "").split("\n")[0]; }
      // the suspicious-but-"worked" wrong passphrase case has nothing to leak either
      for (const s of secrets) expect(message, name).not.toContain(s);
    }
    const jwtResult = JSON.stringify(inspectJwt(makeJwt({ alg: "HS256" }, {}, "x"), "jwt-secret-KK33"));
    expect(jwtResult).not.toContain("jwt-secret-KK33");
    const wrongSig = await failure("decrypt", { cipher: "zzz", passphrase: PASS });
    expect(wrongSig.message).not.toContain(PASS);
  });

  test("passphrase and key are required where they matter", async () => {
    expect((await failure("encrypt", { text: "hi" })).code).toBe("BAD_REQUEST");
    expect((await failure("decrypt", { cipher: encryptText("a", "b") })).code).toBe("BAD_REQUEST");
    expect((await failure("jwt", { token: "" })).code).toBe("BAD_REQUEST");
  });
});

describe("file hashing and saving digests", () => {
  let big: string;
  beforeAll(() => {
    big = join(work, "big.bin");
    writeFileSync(big, randomBytes(6 * 1024 * 1024 + 123));
    writeFileSync(join(work, "empty.txt"), "");
    writeFileSync(join(work, "abc.txt"), "abc");
    mkdirSync(join(work, "folder"), { recursive: true });
  });

  test("a multi-megabyte file gives exactly what Node's createHash gives, for every algorithm", async () => {
    const data = readFileSync(big);
    const { results } = await op("filehash", { paths: [big] });
    const [r] = results;
    expect(r.ok).toBe(true);
    expect(r.size).toBe(statSync(big).size);
    expect(r.name).toBe("big.bin");
    for (const [label, algo] of [["SHA-256", "sha256"], ["SHA-512", "sha512"], ["SHA-384", "sha384"], ["SHA-1", "sha1"], ["MD5", "md5"]] as const) {
      expect(digest(r.rows, label), label).toBe(createHash(algo).update(data).digest("hex"));
    }
  });

  test("several files: results keep their order, and one bad item does not stop the rest", async () => {
    const { results } = await op("filehash", { paths: [join(work, "abc.txt"), join(work, "missing.txt"), join(work, "folder"), join(work, "empty.txt")] });
    expect(results.map((r: any) => r.ok)).toEqual([true, false, false, true]);
    expect(digest(results[0].rows, "SHA-256")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(results[1].error).toMatch(/doesn't exist/);
    expect(results[2].error).toMatch(/folder/);
    expect(digest(results[3].rows, "MD5")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(results[3].size).toBe(0);
  });

  test("limits and bad paths", async () => {
    expect((await failure("filehash", { paths: [] })).code).toBe("BAD_REQUEST");
    expect((await failure("filehash", {})).code).toBe("BAD_REQUEST");
    expect((await failure("filehash", { paths: Array.from({ length: 21 }, () => join(work, "abc.txt")) })).code).toBe("TOO_MANY");
    expect((await op("filehash", { paths: Array.from({ length: 20 }, () => join(work, "abc.txt")) })).results).toHaveLength(20);
    expect((await failure("filehash", { paths: ["relative/path.txt"] })).code).toBe("BAD_PATH");
    expect((await failure("filehash", { paths: [`${work}/a\0b`] })).code).toBe("BAD_PATH");
    expect((await failure("filehash", { paths: [42] })).code).toBe("BAD_PATH");
  });

  test("verify: a file, some text, or digests the page already has", async () => {
    const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const f = await op("verify", { path: join(work, "abc.txt"), expected: ` SHA256:${abc.toUpperCase()} ` });
    expect(f).toMatchObject({ matched: true, match: "SHA-256", source: "abc.txt" });
    expect(await op("verify", { text: "abc", expected: "900150983cd24fb0d6963f7d28e17f72" })).toMatchObject({ matched: true, match: "MD5" });
    expect(await op("verify", { rows: [["SHA-256", abc]], expected: abc, source: "the page" })).toMatchObject({ matched: true });
    const no = await op("verify", { path: join(work, "abc.txt"), expected: "0".repeat(64) });
    expect(no.matched).toBe(false);
    expect(no.hint).toMatch(/SHA-256/);
    expect((await failure("verify", { path: join(work, "nope"), expected: abc })).code).toBe("CANNOT_HASH");
    expect((await failure("verify", { rows: "x", expected: abc })).code).toBe("BAD_REQUEST");
    expect((await failure("verify", { rows: [], expected: abc })).code).toBe("BAD_REQUEST");
    expect((await failure("verify", { rows: [["a", 5]], expected: abc })).code).toBe("BAD_REQUEST");
    expect((await failure("verify", { path: join(work, "abc.txt") })).code).toBe("BAD_REQUEST");
  });

  const rows = [["SHA-256", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"], ["MD5", "900150983cd24fb0d6963f7d28e17f72"]];

  test("savedigests makes a new uniquely named file every time and never overwrites", async () => {
    const dir = join(work, "reports");
    mkdirSync(dir);
    writeFileSync(join(dir, "Digests.txt"), "PRECIOUS");
    writeFileSync(join(dir, "DIGESTS (2).TXT"), "ALSO PRECIOUS");
    const a = await op("savedigests", { folder: dir, rows, source: "abc.txt (3 bytes)" });
    expect(a.name).toBe("Digests (3).txt");
    expect(a.path).toBe(join(dir, "Digests (3).txt"));
    const b = await op("savedigests", { folder: dir, rows, source: "abc.txt (3 bytes)" });
    expect(b.name).toBe("Digests (4).txt");
    expect(readFileSync(join(dir, "Digests.txt"), "utf8")).toBe("PRECIOUS");
    expect(readFileSync(join(dir, "DIGESTS (2).TXT"), "utf8")).toBe("ALSO PRECIOUS");
    expect(readFileSync(a.path, "utf8")).toBe(formatDigestReport(rows as any, "abc.txt (3 bytes)"));
    const named = await op("savedigests", { folder: dir, rows, name: "my report.txt" });
    expect(named.name).toBe("my report.txt");
    expect((await op("savedigests", { folder: dir, rows, name: "my report.txt" })).name).toBe("my report (2).txt");
    expect(readdirSync(dir).sort()).toEqual(["DIGESTS (2).TXT", "Digests (3).txt", "Digests (4).txt", "Digests.txt", "my report (2).txt", "my report.txt"]);
  });

  test("savedigests: only a real, writable folder; sane names; sane rows", async () => {
    expect((await failure("savedigests", { folder: join(work, "nope"), rows })).code).toBe("NOT_FOUND");
    expect((await failure("savedigests", { folder: join(work, "abc.txt"), rows })).code).toBe("NOT_A_FOLDER");
    expect((await failure("savedigests", { folder: "relative", rows })).code).toBe("BAD_PATH");
    expect((await failure("savedigests", { rows })).code).toBe("BAD_PATH");
    expect((await failure("savedigests", { folder: work, rows, name: "../evil.txt" })).code).toBe("BAD_NAME");
    expect((await failure("savedigests", { folder: work, rows, name: "a/b.txt" })).code).toBe("BAD_NAME");
    expect((await failure("savedigests", { folder: work, rows: [] })).code).toBe("BAD_REQUEST");
    mkdirSync(ctx.trashRoot, { recursive: true });
    expect((await failure("savedigests", { folder: ctx.trashRoot, rows })).code).toBe("PROTECTED");
    expect(readdirSync(ctx.trashRoot)).toEqual([]);
    const injected = await op("savedigests", { folder: work, rows, source: "line one\nSHA-256  forged\n", name: "inject.txt" });
    expect(readFileSync(injected.path, "utf8").split("\n")[0]).toBe("Source: line one SHA-256  forged ");
  });

  test("report text is the Crypto Studio Pro digest report", async () => {
    expect((await op("report", { rows, source: "Text input" })).text).toBe(formatDigestReport(rows as any, "Text input"));
  });
});

describe("over HTTP (the real server)", () => {
  test("the operations are registered and need the session token", async () => {
    for (const name of ["hash", "encrypt", "decrypt", "entropy", "generate", "jwt", "encode", "filehash", "verify", "savedigests", "report", "info"]) expect(API_OPERATIONS).toContain(`crypto/${name}`);
    const res = await fetch(`${base}/api/crypto/hash`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
    const notJson = await fetch(`${base}/api/crypto/hash`, { method: "POST", headers: { "Content-Type": "text/plain", "x-fm-token": TOKEN }, body: "{}" });
    expect(notJson.status).toBe(415);
  });

  test("info lists the limits, the algorithms and an honest description of the lock", async () => {
    const { status, json } = await api("crypto/info");
    expect(status).toBe(200);
    expect(json.limits).toEqual({ textBytes: 204800, randomBytes: 1024, files: 20 });
    expect(json.hashes).toContain("SHA-256");
    expect(json.aes).toMatchObject({ cipher: "AES-256-CBC", authenticated: false });
  });

  test("hash, then lock and unlock", async () => {
    const h = await api("crypto/hash", { text: "abc", key: "" });
    expect(h.status).toBe(200);
    expect(h.json.ok).toBe(true);
    expect(digest(h.json.rows, "SHA-256")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const locked = await api("crypto/encrypt", { text: "top secret ✓", passphrase: PASS });
    expect(locked.json.output).toMatch(/^[0-9a-f]{32}:/);
    expect(locked.json.output).not.toContain("top secret");
    const unlocked = await api("crypto/decrypt", { cipher: locked.json.output, passphrase: PASS });
    expect(unlocked.json).toMatchObject({ ok: true, text: "top secret ✓", suspicious: false });
    const wrong = await api("crypto/decrypt", { cipher: stdlib.aesEncrypt("meet me at noon, bring the documents", PASS, "00112233445566778899aabbccddeeff"), passphrase: "nope" });
    if (wrong.status === 200) expect(wrong.json.suspicious).toBe(true);
    else {
      expect(wrong.status).toBe(400);
      expect(wrong.json.error.message).toMatch(/passphrase is wrong/);
      expect(JSON.stringify(wrong.json)).not.toContain("nope\"");
    }
    const garbage = await api("crypto/decrypt", { cipher: "hello", passphrase: PASS });
    expect(garbage.status).toBe(400);
    expect(garbage.json.error.code).toBe("BAD_CIPHERTEXT");
    expect(JSON.stringify(garbage.json)).not.toContain(PASS);
  });

  test("entropy, generate, jwt, encode, verify, filehash and savedigests answer in the documented shape", async () => {
    expect((await api("crypto/entropy", { text: "Password1!" })).json).toMatchObject({ ok: true, bits: 66, level: 3, strength: "Strong" });
    expect((await api("crypto/generate", { kind: "bytes", length: 3, format: "hex" })).json.value).toMatch(/^[0-9a-f]{6}$/);
    expect((await api("crypto/generate", { kind: "bytes", length: 5000 })).status).toBe(400);
    const jwt = await api("crypto/jwt", { token: makeJwt({ alg: "HS256" }, { exp: 1000 }, "s3"), secret: "s3" });
    expect(jwt.json.verified).toEqual({ ok: true, alg: "HS256" });
    expect(jwt.json.expired).toBe(true);
    expect(jwt.json.times).toContain("Status: EXPIRED");
    expect((await api("crypto/encode", { mode: "base64-encode", text: "Hello" })).json.output).toBe("SGVsbG8=");
    const bad = await api("crypto/encode", { mode: "hex-decode", text: "xyz" });
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe("BAD_INPUT");
    const file = join(work, "abc.txt");
    const fh = await api("crypto/filehash", { paths: [file] });
    expect(fh.json.results[0]).toMatchObject({ ok: true, size: 3, name: "abc.txt" });
    const v = await api("crypto/verify", { rows: fh.json.results[0].rows, expected: "a9993e364706816aba3e25717850c26c9cd0d89d" });
    expect(v.json).toMatchObject({ ok: true, matched: true, match: "SHA-1" });
    const dir = join(work, "http-reports");
    mkdirSync(dir);
    const s1 = await api("crypto/savedigests", { folder: dir, rows: fh.json.results[0].rows, source: "abc.txt" });
    const s2 = await api("crypto/savedigests", { folder: dir, rows: fh.json.results[0].rows, source: "abc.txt" });
    expect(s1.json.name).toBe("Digests.txt");
    expect(s2.json.name).toBe("Digests (2).txt");
    expect(existsSync(s1.json.path)).toBe(true);
  });

  test("a request that is too big is refused before it is read", async () => {
    const res = await fetch(`${base}/api/crypto/hash`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify({ text: "x".repeat(1024 * 1024 + 10) }) });
    expect(res.status).toBe(413);
    const sized = await api("crypto/hash", { text: "x".repeat(MAX_TEXT_BYTES + 1) });
    expect(sized.status).toBe(400);
    expect(sized.json.error.code).toBe("TOO_LARGE");
  });

  test("secrets are not written anywhere in the app's data folder", async () => {
    await api("crypto/encrypt", { text: "persist-check-plaintext", passphrase: "persist-check-passphrase" });
    await api("crypto/hash", { text: "persist-check-plaintext", key: "persist-check-hmac-key" });
    await api("crypto/jwt", { token: makeJwt({ alg: "HS256" }, {}, "persist-check-jwt-secret"), secret: "persist-check-jwt-secret" });
    await api("crypto/generate", { kind: "password", length: 24 });
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name)));
    };
    if (existsSync(dataDir)) walk(dataDir);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const needle of ["persist-check-plaintext", "persist-check-passphrase", "persist-check-hmac-key", "persist-check-jwt-secret"]) expect(text, f).not.toContain(needle);
    }
  });
});
