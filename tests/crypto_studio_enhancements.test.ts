import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHmac, createHash } from "node:crypto";
import {
  hashFile,
  matchChecksum,
  normalizeChecksum,
  generatePassword,
  clampPasswordLength,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  describeJwtTimes,
  verifyJwtHmac,
  formatDigestReport,
} from "../src/crypto_tools";
import { createCryptoStudio } from "../applications/crypto_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, id: string, event = "click", val?: any) {
  const h = win.eventHandlersMap.get(`${id}:on${event}`) || win.eventHandlersMap.get(`${id}:${event}`) || win.eventHandlersMap.get(id);
  if (!h) throw new Error(`no handler for ${id}`);
  return await h(win, val);
}

const b64u = (o: any) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function makeJwt(alg: string, payload: any, secret: string, nodeAlg = "sha256") {
  const h = b64u({ alg, typ: "JWT" });
  const p = b64u(payload);
  const sig = createHmac(nodeAlg, secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}

describe("crypto_tools", () => {
  let dir: string;
  let file: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "crypto_test_"));
    file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "hello world");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("hashFile matches node digests and checksum matching works", async () => {
    const { rows, size } = await hashFile(file);
    expect(size).toBe(11);
    const sha256 = createHash("sha256").update("hello world").digest("hex");
    expect(rows.find((r) => r[0] === "SHA-256")![1]).toBe(sha256);
    expect(rows.find((r) => r[0] === "MD5")![1]).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");
    expect(matchChecksum(sha256.toUpperCase(), rows).match).toBe("SHA-256");
    expect(matchChecksum("  0x" + sha256 + "\n", rows).match).toBe("SHA-256");
    expect(matchChecksum("deadbeef", rows).match).toBeNull();
    expect(matchChecksum("", rows).match).toBeNull();
    expect(normalizeChecksum("AA:bb cc")).toBe("aabbcc");
    await expect(hashFile(dir)).rejects.toThrow();
  });

  test("password generator honours classes, length and ambiguity", () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword({ length: 24, symbols: true });
      expect(pw.length).toBe(24);
      expect(/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^a-zA-Z0-9]/.test(pw)).toBe(true);
    }
    expect(generatePassword({ length: 40, lower: false, upper: false, digits: true, symbols: false })).toMatch(/^[0-9]{40}$/);
    for (let i = 0; i < 30; i++) expect(generatePassword({ length: 60, noAmbiguous: true, symbols: true })).not.toMatch(/[O0oIl1|`'"]/);
    expect(() => generatePassword({ length: 10, lower: false, upper: false, digits: false, symbols: false })).toThrow();
    expect(clampPasswordLength(2)).toBe(4);
    expect(clampPasswordLength(9999)).toBe(256);
    expect(clampPasswordLength(NaN)).toBe(20);
    // different calls differ
    expect(generatePassword({ length: 32 })).not.toBe(generatePassword({ length: 32 }));
  });

  test("base64 / hex round-trips and validation", () => {
    const s = "héllo ✓ wörld";
    expect(fromBase64(toBase64(s))).toBe(s);
    expect(fromHex(toHex(s))).toBe(s);
    expect(fromBase64("aGk_-w==".replace("_", "/").replace("-", "+"))).toBeTypeOf("string");
    expect(() => fromBase64("not base64!!")).toThrow();
    expect(() => fromHex("abc")).toThrow();
    expect(() => fromHex("zz")).toThrow();
    expect(fromHex("0x68:69")).toBe("hi");
  });

  test("JWT verification and time claims", () => {
    const tok = makeJwt("HS256", { sub: "u1", exp: 2_000_000_000 }, "s3cret");
    expect(verifyJwtHmac(tok, "s3cret").ok).toBe(true);
    const bad = verifyJwtHmac(tok, "wrong");
    expect(bad.ok).toBe(false);
    expect(bad.reason).toContain("does not match");
    expect(verifyJwtHmac(makeJwt("HS512", { a: 1 }, "k", "sha512"), "k").ok).toBe(true);
    expect(verifyJwtHmac(makeJwt("RS256", { a: 1 }, "k"), "k").reason).toContain("HS256");
    expect(verifyJwtHmac(`${b64u({ alg: "none" })}.${b64u({})}.`, "k").reason).toContain("alg=none");
    expect(verifyJwtHmac("a.b", "k").ok).toBe(false);

    const now = Date.UTC(2026, 0, 1);
    const lines = describeJwtTimes({ iat: now / 1000 - 3600, exp: now / 1000 + 86400 }, now);
    expect(lines.join("\n")).toContain("1h ago");
    expect(lines.join("\n")).toContain("in 1d");
    expect(lines.join("\n")).toContain("not expired");
    expect(describeJwtTimes({ exp: now / 1000 - 5 }, now).join("\n")).toContain("EXPIRED");
    expect(describeJwtTimes({}, now)).toEqual([]);
  });

  test("digest report", () => {
    const r = formatDigestReport([["SHA-256", "aa"], ["MD5", "bb"]], "x");
    expect(r).toContain("Source: x");
    expect(r).toContain("SHA-256  aa");
  });
});

describe("Crypto Studio enhancements (GUI handlers)", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "crypto_gui_"));
    fs.writeFileSync(path.join(dir, "f.txt"), "hello world");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("renders new controls", () => {
    const html = createCryptoStudio({ fullscreen: false }).generateHtml();
    for (const id of ["txt_file_path", "btn_browse_file", "btn_hash_file", "txt_expected", "btn_verify_checksum", "btn_gen_password", "txt_pw_out", "btn_b64_encode", "btn_hex_decode", "txt_jwt_secret", "btn_verify_jwt", "btn_clear_all", "btn_save_digests"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test("hash file → verify checksum → clear", async () => {
    const win = createCryptoStudio({ fullscreen: false });
    win.setValue("txt_file_path", path.join(dir, "f.txt"));
    await trigger(win, "btn_hash_file");
    const rows = win.getValue("tbl_hashes") as string[][];
    expect(rows.find((r) => r[0] === "MD5")![1]).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");
    win.setValue("txt_expected", "5EB63BBBE01EEED093CB22BB8F5ACDC3");
    await trigger(win, "btn_verify_checksum");
    expect(win.getValue("crypto_console")).toContain("MATCH (MD5)");
    win.setValue("txt_expected", "00");
    await trigger(win, "btn_verify_checksum");
    expect(win.getValue("crypto_console")).toContain("MISMATCH");
    await trigger(win, "btn_clear_all");
    expect(win.getValue("txt_expected") || "").toBe("");
  });

  test("password, encoders and JWT verify via buttons", async () => {
    const win = createCryptoStudio({ fullscreen: false });
    win.setValue("txt_pw_len", "32");
    await trigger(win, "btn_gen_password");
    expect(String(win.getValue("txt_pw_out")).length).toBe(32);
    expect(win.getValue("lbl_entropy_out")).toContain("Entropy: ~");

    win.setValue("txt_hash_input", "hi there");
    await trigger(win, "btn_b64_encode");
    expect(win.getValue("txt_hash_input")).toBe("aGkgdGhlcmU=");
    await trigger(win, "btn_b64_decode");
    expect(win.getValue("txt_hash_input")).toBe("hi there");
    await trigger(win, "btn_hex_encode");
    expect(win.getValue("txt_hash_input")).toBe("6869207468657265");
    await trigger(win, "btn_hex_decode");
    expect(win.getValue("txt_hash_input")).toBe("hi there");

    win.setValue("txt_hash_input", makeJwt("HS256", { sub: "x" }, "abc"));
    win.setValue("txt_jwt_secret", "abc");
    await trigger(win, "btn_verify_jwt");
    expect(win.getValue("crypto_console")).toContain("[JWT Verify] VALID");
    win.setValue("txt_jwt_secret", "nope");
    await trigger(win, "btn_verify_jwt");
    expect(win.getValue("crypto_console")).toContain("[JWT Verify] INVALID");
  });
});
