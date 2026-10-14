/**
 * The "Crypto" power tool's logic, kept apart from the HTTP table (fmCryptoOps.ts) so it can be tested directly.
 *
 * Secrets (passphrases, HMAC keys, JWT secrets, passwords, plain text) only ever pass through these functions:
 * nothing here writes them anywhere, logs them, or puts them in an error message.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { stdlib } from "../../simplecli/stdlib";
import { clampPasswordLength, describeJwtTimes, fromBase64, fromHex, generatePassword, matchChecksum, toBase64, toHex, verifyJwtHmac, type HashRow } from "../../crypto_tools";
import { digestBytes, fastSpecs, secureSpecs } from "./fmHashes";
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

const SECURE = secureSpecs();
const HMACS = SECURE.filter((s) => s.hmac && s.algo).map((s) => [s.hmac!, s.algo!] as const);

export const hashAlgorithms = () => SECURE.map((s) => s.label);
export const fastAlgorithms = () => fastSpecs().map((s) => s.label);
export const hmacAlgorithms = () => HMACS.map(([label]) => label);

/** Every secure digest of `text`, plus an HMAC of each classic kind when a key is given. */
export function hashText(text: string, key = ""): HashRow[] {
  const data = Buffer.from(text, "utf8");
  const rows: HashRow[] = [];
  for (const s of SECURE) {
    rows.push([s.label, s.whole(data)]);
    if (key && s.hmac) rows.push([s.hmac, createHmac(s.algo!, key).update(data).digest("hex")]);
  }
  return rows;
}

/** The fast checksums (CRC32, xxHash, ...) of `text`: they only spot accidental changes and are not secure. */
export function fastText(text: string): HashRow[] {
  return digestBytes(Buffer.from(text, "utf8"), fastSpecs());
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

export const UUID7_FORMATS = ["standard", "plain", "upper", "base64url"] as const;
export const MAX_UUID_COUNT = 100;
const MAX_UUID7_MS = 2 ** 48 - 1;

/** A version 7 UUID (a millisecond timestamp, then random bits, so new ones sort after older ones), from Bun's built-in `Bun.randomUUIDv7`. */
export function uuidV7(ms?: number): string {
  return ms === undefined ? Bun.randomUUIDv7() : Bun.randomUUIDv7("hex", ms);
}

export function formatUuid(uuid: string, format: string): string {
  if (format === "plain") return uuid.replaceAll("-", "");
  if (format === "upper") return uuid.toUpperCase();
  if (format === "base64url") return Buffer.from(uuid.replaceAll("-", ""), "hex").toString("base64url");
  return uuid;
}

export interface UuidInfo {
  canonical: string;
  version: number | null;
  variant: string;
  kind: string;
  /** For versions 1, 6 and 7: when it was made, in milliseconds since 1970. */
  timeMs?: number;
  iso?: string;
}

const GREGORIAN_OFFSET_100NS = 122192928000000000n;

/** Reads a UUID written with or without dashes, in braces, as `urn:uuid:…`, or as 22-character Base64URL, and says what it is. */
export function inspectUuid(input: unknown): UuidInfo {
  let text = typeof input === "string" ? input.trim() : "";
  if (!text) throw new FmError("BAD_REQUEST", "Type or paste a UUID first.");
  text = text.replace(/^urn:uuid:/i, "").replace(/^\{(.*)\}$/, "$1").trim();
  let hex = "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) hex = text.replaceAll("-", "");
  else if (/^[0-9a-f]{32}$/i.test(text)) hex = text;
  else if (/^[A-Za-z0-9_-]{22}$/.test(text)) hex = Buffer.from(text, "base64url").toString("hex");
  if (hex.length !== 32) throw new FmError("BAD_REQUEST", "That isn't a UUID. A UUID has 32 letters and digits (0-9, a-f), usually written 8-4-4-4-12 with dashes.");
  hex = hex.toLowerCase();
  const canonical = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (hex === "0".repeat(32)) return { canonical, version: null, variant: "Nil", kind: "The nil UUID: all zeros, used to mean 'no value'." };
  if (hex === "f".repeat(32)) return { canonical, version: null, variant: "Max", kind: "The max UUID: all ones." };
  const variantBits = parseInt(hex[16]!, 16);
  const variant = variantBits < 8 ? "Reserved (NCS)" : variantBits < 12 ? "Standard (RFC 9562)" : variantBits < 14 ? "Reserved (Microsoft)" : "Reserved (future)";
  const version = parseInt(hex[12]!, 16);
  const KINDS: Record<number, string> = { 1: "Time and computer based (v1).", 2: "DCE security (v2).", 3: "Name based, MD5 (v3).", 4: "Random (v4).", 5: "Name based, SHA-1 (v5).", 6: "Time based, sortable (v6).", 7: "Time-ordered: a millisecond timestamp, then random bits (v7). Sorts by creation time.", 8: "Custom (v8)." };
  const info: UuidInfo = { canonical, version, variant, kind: variantBits >= 8 && variantBits < 12 ? KINDS[version] ?? "An unknown version." : "Not a standard UUID layout." };
  let timeMs: number | undefined;
  if (variantBits >= 8 && variantBits < 12) {
    if (version === 7) timeMs = parseInt(hex.slice(0, 12), 16);
    else if (version === 1) timeMs = Number((BigInt(`0x${hex.slice(13, 16)}${hex.slice(8, 12)}${hex.slice(0, 8)}`) - GREGORIAN_OFFSET_100NS) / 10000n);
    else if (version === 6) timeMs = Number((BigInt(`0x${hex.slice(0, 8)}${hex.slice(8, 12)}${hex.slice(13, 16)}`) - GREGORIAN_OFFSET_100NS) / 10000n);
  }
  if (timeMs !== undefined && Number.isFinite(timeMs) && timeMs >= -62135596800000 && timeMs <= 8.64e15) {
    info.timeMs = timeMs;
    info.iso = new Date(timeMs).toISOString();
  }
  return info;
}

export function generateValue(body: Record<string, any>): Generated {
  const kind = body.kind;
  switch (kind) {
    case "uuid": return { kind, value: randomUUID(), bits: 122 };
    case "uuid7": {
      const count = body.count === undefined ? 1 : Number(body.count);
      if (!Number.isInteger(count) || count < 1 || count > MAX_UUID_COUNT) throw new FmError("BAD_REQUEST", `Choose how many UUIDs to make, from 1 to ${MAX_UUID_COUNT}.`);
      const format = body.format === undefined ? "standard" : String(body.format);
      if (!(UUID7_FORMATS as readonly string[]).includes(format)) throw new FmError("BAD_REQUEST", "Choose how to write the UUIDs: with dashes, without, in capitals, or compact.");
      let at: number | undefined;
      if (body.timeMs !== undefined && body.timeMs !== null && body.timeMs !== "") {
        at = Number(body.timeMs);
        if (!Number.isInteger(at) || at < 0 || at > MAX_UUID7_MS) throw new FmError("BAD_REQUEST", "The time must be a whole number of milliseconds since 1970, from 0 to 281474976710655.");
      }
      const made = Array.from({ length: count }, () => uuidV7(at));
      return { kind, value: made.map((u) => formatUuid(u, format)).join("\n"), bits: 74 };
    }
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

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/**
 * Turns the five HTML entities (&amp; &lt; &gt; &quot; &apos;) and numeric references (&#39; &#x27;) back into the
 * characters they stand for. Anything else, including other named entities and invalid numbers, is left as typed.
 * It only works on text, so nothing is ever interpreted as HTML.
 */
export function unescapeHtml(text: string): string {
  return text.replace(/&(?:(amp|lt|gt|quot|apos)|#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6}));/g, (whole, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
    if (name) return HTML_ENTITIES[name]!;
    const code = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
    return code >= 1 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
  });
}

/** How wide some text is: characters, bytes, and the columns it takes in a terminal (wide letters and emoji take two). */
export function describeTextWidth(text: string): string {
  const chars = [...text].length;
  const columns = Bun.stringWidth(text);
  return [
    `Characters: ${chars}`,
    `Bytes (UTF-8): ${Buffer.byteLength(text, "utf8")}`,
    `Columns in a terminal: ${columns}`,
    columns === chars ? "Every character takes one column." : columns > chars ? "Some characters (Chinese, Japanese, Korean letters, emoji) take two columns, so the text is wider than it is long." : "Some characters (accents added on top, zero-width marks) take no column of their own, so the text is narrower than it is long.",
  ].join("\n");
}

const ENCODERS: Record<string, (s: string) => string> = {
  "url-encode": (s) => encodeURIComponent(s),
  "url-decode": (s) => {
    try { return decodeURIComponent(s); } catch { throw new Error("That isn't valid URL-encoded text. A % must be followed by two hex digits (like %20)."); }
  },
  "base64-encode": toBase64,
  "base64-decode": fromBase64,
  "hex-encode": toHex,
  "hex-decode": fromHex,
  "html-escape": (s) => Bun.escapeHTML(s),
  "html-unescape": unescapeHtml,
  "strip-ansi": (s) => Bun.stripANSI(s),
  "text-width": describeTextWidth,
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

const KNOWN_LENGTHS: Record<number, string> = { 8: "32-bit fast (like CRC32)", 16: "64-bit fast", 32: "MD5", 40: "SHA-1", 56: "SHA-224", 64: "SHA-256", 96: "SHA-384", 128: "SHA-512" };

/** Compares a pasted checksum (as published, with extra words, spaces, "sha256:" and so on) with computed digests. */
export function checkChecksum(expectedRaw: string, rows: HashRow[]): { match: string | null; hint: string } {
  if (expectedRaw.length > 2000) throw new FmError("TOO_LARGE", "That's too long to be a checksum.");
  const variants = [expectedRaw, ...(expectedRaw.match(/[0-9a-fA-F]{8,128}/g) ?? [])];
  for (const v of variants) {
    const res = matchChecksum(v, rows);
    if (res.match) return { match: res.match, hint: `The checksum matches (${res.match}).` };
  }
  const normalized = ([...variants.slice(1)].sort((x, y) => y.length - x.length)[0] ?? expectedRaw).trim().replace(/^0x/i, "").replace(/[\s:]/g, "").toLowerCase();
  if (!normalized) return { match: null, hint: "Paste the checksum you were given first." };
  if (!/^[0-9a-f]+$/.test(normalized)) return { match: null, hint: "That doesn't look like a checksum. It should only contain the digits 0-9 and the letters a-f." };
  const kind = KNOWN_LENGTHS[normalized.length];
  return {
    match: null,
    hint: kind
      ? `It has the length of a ${kind} checksum but doesn't match. The item may have changed or been damaged, or the checksum may belong to a different file.`
      : `It's ${normalized.length} characters long, which isn't the length of a common checksum (8, 16, 32, 40, 56, 64, 96 or 128).`,
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
