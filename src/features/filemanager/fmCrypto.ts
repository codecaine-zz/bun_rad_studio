/**
 * The "Crypto" power tool's logic, kept apart from the HTTP table (fmCryptoOps.ts) so it can be tested directly.
 *
 * Secrets (passphrases, HMAC keys, JWT secrets, passwords, plain text) only ever pass through these functions:
 * nothing here writes them anywhere, logs them, or puts them in an error message.
 */
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { stdlib } from "../../simplecli/stdlib";
import { clampPasswordLength, describeJwtTimes, fromBase64, fromHex, generatePassword, matchChecksum, toBase64, toHex, verifyJwtHmac, type HashRow } from "../../crypto_tools";
import { FmError } from "./fmPaths";

export const MAX_TEXT_BYTES = 200 * 1024;
export const MAX_RANDOM_BYTES = 1024;
export const MAX_SECRET_CHARS = 10_000;

/** Reads a text field from a request: must be a string within the size limit. */
export function textField(value: unknown, what: string, { required = false }: { required?: boolean } = {}): string {
  if (value !== undefined && value !== null && typeof value !== "string") throw new FmError("BAD_REQUEST", `That ${what} isn't text.`);
  if (typeof value !== "string" || value === "") {
    if (required) throw new FmError("BAD_REQUEST", `Type or paste ${what} first.`);
    return "";
  }
  if (Buffer.byteLength(value, "utf8") > MAX_TEXT_BYTES) throw new FmError("TOO_LARGE", `That ${what} is too big. The limit is ${MAX_TEXT_BYTES / 1024} KB.`);
  return value;
}

/** A passphrase, key or secret: a string with at most MAX_SECRET_CHARS characters. */
export function secretField(value: unknown, what: string, { required = false }: { required?: boolean } = {}): string {
  if (value !== undefined && value !== null && typeof value !== "string") throw new FmError("BAD_REQUEST", `That ${what} isn't text.`);
  if (typeof value !== "string" || value === "") {
    if (required) throw new FmError("BAD_REQUEST", `Enter ${what} first.`);
    return "";
  }
  if (value.length > MAX_SECRET_CHARS) throw new FmError("TOO_LARGE", `That ${what} is too long.`);
  return value;
}

// ---------------------------------------------------------------------------------------------------------------
// Hashes and HMAC
// ---------------------------------------------------------------------------------------------------------------

const HASH_CANDIDATES: Array<[label: string, algo: string, hmac?: string]> = [
  ["SHA-256", "sha256", "HMAC-SHA256"],
  ["SHA-512", "sha512", "HMAC-SHA512"],
  ["SHA-384", "sha384", "HMAC-SHA384"],
  ["SHA-1", "sha1", "HMAC-SHA1"],
  ["MD5", "md5", "HMAC-MD5"],
  ["SHA-224", "sha224"],
  ["SHA-512/256", "sha512-256"],
  ["SHA3-256", "sha3-256"],
  ["SHA3-384", "sha3-384"],
  ["SHA3-512", "sha3-512"],
  ["BLAKE2b-512", "blake2b512"],
  ["BLAKE2s-256", "blake2s256"],
  ["RIPEMD-160", "ripemd160"],
];

const supports = (make: () => unknown): boolean => {
  try { make(); return true; } catch { return false; }
};

/** Only the algorithms this runtime really has (SHA-3, BLAKE2 and so on depend on the runtime). */
const HASHES = HASH_CANDIDATES.filter(([, algo]) => supports(() => createHash(algo)));
const HMACS = HASHES.filter(([, algo, hmac]) => hmac && supports(() => createHmac(algo, "k"))).map(([, algo, hmac]) => [hmac!, algo] as const);

export const hashAlgorithms = () => HASHES.map(([label]) => label);
export const hmacAlgorithms = () => HMACS.map(([label]) => label);

/** Every supported digest of `data`, plus an HMAC of each kind when a key is given. */
export function hashText(text: string, key = ""): HashRow[] {
  const data = Buffer.from(text, "utf8");
  const rows: HashRow[] = [];
  for (const [label, algo, hmac] of HASHES) {
    rows.push([label, createHash(algo).update(data).digest("hex")]);
    if (key && hmac && HMACS.some(([l]) => l === hmac)) rows.push([hmac, createHmac(algo, key).update(data).digest("hex")]);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// AES (the File Manager reuses the standard library's helpers; see the notes in the page)
// ---------------------------------------------------------------------------------------------------------------

/** stdlib.aesEncrypt: AES-256-CBC, key = SHA-256(passphrase), random 16-byte IV, result "ivHex:base64". */
export function encryptText(text: string, passphrase: string): string {
  try {
    return stdlib.aesEncrypt(text, passphrase);
  } catch {
    throw new FmError("ENCRYPT_FAILED", "Couldn't lock that text.");
  }
}

const CIPHER_FORMAT = /^([0-9a-fA-F]{32}):([A-Za-z0-9+/]+={0,2})$/;

export function decryptText(cipher: string, passphrase: string): { text: string; suspicious: boolean } {
  const compact = cipher.replace(/\s+/g, "");
  const m = CIPHER_FORMAT.exec(compact);
  if (!m || Buffer.from(m[2]!, "base64").length % 16 !== 0) {
    throw new FmError("BAD_CIPHERTEXT", "That doesn't look like text locked by this tool. It should be 32 letters/digits, a colon, then a long run of letters and digits, exactly as it was produced.");
  }
  try {
    const text = stdlib.aesDecrypt(compact, passphrase);
    // CBC has no built-in check: a wrong passphrase can occasionally "work" and give nonsense.
    return { text, suspicious: text.includes("\uFFFD") };
  } catch {
    throw new FmError("DECRYPT_FAILED", "Couldn't unlock that. Either the passphrase is wrong, or the locked text was changed or cut short.");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Strength estimate
// ---------------------------------------------------------------------------------------------------------------

export interface Entropy {
  bits: number;
  /** 0 = nothing typed, 1 = very weak ... 4 = very strong */
  level: 0 | 1 | 2 | 3 | 4;
  strength: string;
  length: number;
  pool: number;
  advice: string;
}

/** The same estimate as Crypto Studio Pro: length x log2(size of the character kinds used). */
export function estimateEntropy(text: string): Entropy {
  const length = [...text].length;
  let pool = 0;
  if (/[a-z]/.test(text)) pool += 26;
  if (/[A-Z]/.test(text)) pool += 26;
  if (/[0-9]/.test(text)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(text)) pool += 32;
  if (pool === 0 || length === 0) return { bits: 0, level: 0, strength: "Nothing to measure", length, pool, advice: "Type or paste something to see how strong it is." };
  const bits = Math.round(length * Math.log2(pool));
  const [level, strength, advice] = bits < 40
    ? [1 as const, "Very weak", "Someone could guess this quickly. Make it much longer, ideally a few random words or 16+ characters."]
    : bits < 60
      ? [2 as const, "Moderate", "OK for a throw-away account, but not for anything important. Add length: every extra character helps."]
      : bits < 80
        ? [3 as const, "Strong", "Good for most uses. A longer passphrase would make it stronger still."]
        : [4 as const, "Very strong", "Very hard to guess by trial and error, as long as it was chosen randomly and isn't reused anywhere."];
  const unique = new Set(text).size;
  const tip = unique < Math.max(4, length / 4) ? " Many characters repeat, so the real strength is lower than this estimate." : " This is an estimate for randomly chosen characters; real words and patterns are easier to guess.";
  return { bits, level, strength, length, pool, advice: advice + tip };
}

// ---------------------------------------------------------------------------------------------------------------
// Random values and passwords
// ---------------------------------------------------------------------------------------------------------------

export interface Generated {
  kind: string;
  value: string;
  bits?: number;
  strength?: string;
}

export function generateValue(body: Record<string, any>): Generated {
  const kind = body.kind;
  switch (kind) {
    case "uuid": return { kind, value: randomUUID(), bits: 122 };
    case "hex32": return { kind, value: randomBytes(32).toString("hex"), bits: 256 };
    case "base64-256": return { kind, value: randomBytes(32).toString("base64"), bits: 256 };
    case "bytes": {
      const n = Number(body.length);
      if (!Number.isInteger(n) || n < 1 || n > MAX_RANDOM_BYTES) throw new FmError("BAD_REQUEST", `Choose a number of bytes from 1 to ${MAX_RANDOM_BYTES}.`);
      const format = body.format === "base64" ? "base64" : "hex";
      return { kind, value: randomBytes(n).toString(format), bits: n * 8 };
    }
    case "password": {
      const length = clampPasswordLength(Number(body.length));
      let value: string;
      try {
        value = generatePassword({ length, lower: body.lower !== false, upper: body.upper !== false, digits: body.digits !== false, symbols: body.symbols === true, noAmbiguous: body.noAmbiguous === true });
      } catch {
        throw new FmError("BAD_REQUEST", "Tick at least one kind of character (a–z, A–Z, 0–9 or symbols).");
      }
      const e = estimateEntropy(value);
      return { kind, value, bits: e.bits, strength: e.strength };
    }
    default: throw new FmError("BAD_REQUEST", "Choose what to generate.");
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Encoders
// ---------------------------------------------------------------------------------------------------------------

const ENCODERS: Record<string, (s: string) => string> = {
  "url-encode": (s) => encodeURIComponent(s),
  "url-decode": (s) => {
    try { return decodeURIComponent(s); } catch { throw new Error("That isn't valid URL-encoded text. A % must be followed by two hex digits (like %20)."); }
  },
  "base64-encode": toBase64,
  "base64-decode": fromBase64,
  "hex-encode": toHex,
  "hex-decode": fromHex,
};

export function encodeText(mode: unknown, text: string): { output: string; note?: string } {
  const fn = typeof mode === "string" && Object.hasOwn(ENCODERS, mode) ? ENCODERS[mode]! : null;
  if (!fn) throw new FmError("BAD_REQUEST", "Choose an encoder.");
  if (text === "") throw new FmError("BAD_REQUEST", "Type or paste some text first.");
  let output: string;
  try {
    output = fn(text);
  } catch (err: any) {
    throw new FmError("BAD_INPUT", String(err?.message || "Couldn't convert that."));
  }
  return output.includes("\uFFFD") ? { output, note: "The result isn't plain text, so some characters show as �. It may be binary data." } : { output };
}

// ---------------------------------------------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------------------------------------------

export interface JwtReport {
  alg: string;
  headerText: string;
  payloadText: string;
  times: string[];
  expired: boolean | null;
  signed: boolean;
  verified: { ok: boolean; alg: string; reason?: string } | null;
  warnings: string[];
}

const B64URL = /^[A-Za-z0-9_-]*$/;
const HS_ALGS = new Set(["HS256", "HS384", "HS512"]);

function parseJson(part: string, what: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw new FmError("BAD_TOKEN", `That doesn't look like a JWT: the ${what} isn't readable.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FmError("BAD_TOKEN", `That doesn't look like a JWT: the ${what} should be a JSON object.`);
  return value as Record<string, unknown>;
}

/** Decodes a JWT and, when a secret is given, checks an HS256/384/512 signature. `nowMs` is for tests. */
export function inspectJwt(tokenRaw: string, secret = "", nowMs = Date.now()): JwtReport {
  const token = tokenRaw.trim().replace(/^bearer\s+/i, "");
  if (!token) throw new FmError("BAD_REQUEST", "Paste a token first.");
  const parts = token.split(".");
  if ((parts.length !== 3 && parts.length !== 2) || parts.some((p) => !B64URL.test(p))) {
    throw new FmError("BAD_TOKEN", "That doesn't look like a JWT. A token is three parts joined by dots (header.payload.signature), written with letters, digits, - and _.");
  }
  const header = parseJson(parts[0]!, "header");
  const payload = parseJson(parts[1]!, "payload");
  const alg = typeof header.alg === "string" ? header.alg.slice(0, 40) : "?";
  const signed = parts.length === 3 && parts[2] !== "";
  const warnings = ["Reading a token is not the same as trusting it. Anyone can write a token; only a signature check proves it is genuine."];
  if (alg.toLowerCase() === "none") warnings.push("This token says it is unsigned (alg=none). Never accept such a token as proof of anything.");
  else if (!signed) warnings.push("This token has no signature part.");

  let times: string[];
  try {
    times = describeJwtTimes(payload, nowMs);
  } catch {
    times = ["Some time claims are outside the range of real dates."];
  }
  const exp = payload.exp;
  const expired = typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 < nowMs : null;

  let verified: JwtReport["verified"] = null;
  if (secret) {
    if (parts.length !== 3) verified = { ok: false, alg, reason: "Token must have 3 dot-separated parts" };
    else if (!HS_ALGS.has(alg)) verified = { ok: false, alg, reason: alg.toLowerCase() === "none" ? "Unsigned token (alg=none) — never trust it" : `Only HS256/HS384/HS512 can be verified with a secret (this token uses ${alg})` };
    else {
      try {
        verified = verifyJwtHmac(token, secret);
      } catch {
        verified = { ok: false, alg, reason: "The signature couldn't be checked." };
      }
    }
  }
  return { alg, headerText: JSON.stringify(header, null, 2), payloadText: JSON.stringify(payload, null, 2), times, expired, signed, verified, warnings };
}

// ---------------------------------------------------------------------------------------------------------------
// Checksums
// ---------------------------------------------------------------------------------------------------------------

const KNOWN_LENGTHS: Record<number, string> = { 32: "MD5", 40: "SHA-1", 56: "SHA-224", 64: "SHA-256", 96: "SHA-384", 128: "SHA-512" };

/** Compares a pasted checksum (as published, with extra words, spaces, "sha256:" and so on) with computed digests. */
export function checkChecksum(expectedRaw: string, rows: HashRow[]): { match: string | null; hint: string } {
  if (expectedRaw.length > 2000) throw new FmError("TOO_LARGE", "That's too long to be a checksum.");
  const variants = [expectedRaw, ...(expectedRaw.match(/[0-9a-fA-F]{32,128}/g) ?? [])];
  for (const v of variants) {
    const res = matchChecksum(v, rows);
    if (res.match) return { match: res.match, hint: `The checksum matches (${res.match}).` };
  }
  const normalized = (variants[1] ?? expectedRaw).trim().replace(/^0x/i, "").replace(/[\s:]/g, "").toLowerCase();
  if (!normalized) return { match: null, hint: "Paste the checksum you were given first." };
  if (!/^[0-9a-f]+$/.test(normalized)) return { match: null, hint: "That doesn't look like a checksum. It should only contain the digits 0-9 and the letters a-f." };
  const kind = KNOWN_LENGTHS[normalized.length];
  return {
    match: null,
    hint: kind
      ? `It has the length of a ${kind} checksum but doesn't match. The item may have changed or been damaged, or the checksum may belong to a different file.`
      : `It's ${normalized.length} characters long, which isn't the length of a common checksum (32, 40, 64, 96 or 128).`,
  };
}

/** Rows sent back by the page (they are only digests): checks their shape and size. */
export function parseRows(value: unknown): HashRow[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new FmError("BAD_REQUEST", "There are no results to use yet. Calculate some hashes first.");
  return value.map((r) => {
    if (!Array.isArray(r) || typeof r[0] !== "string" || typeof r[1] !== "string" || r[0].length > 64 || r[1].length > 300) throw new FmError("BAD_REQUEST", "Those results aren't valid.");
    return [r[0], r[1]] as HashRow;
  });
}
