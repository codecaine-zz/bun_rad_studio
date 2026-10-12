/**
 * Pure helpers for Crypto Studio: file hashing, checksum comparison, password
 * generation, Base64/hex conversion and JWT inspection/verification. No GUI access.
 */
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";

export type HashRow = [string, string];

export const FILE_HASH_ALGOS: { label: string; algo: string }[] = [
  { label: "SHA-256", algo: "sha256" },
  { label: "SHA-512", algo: "sha512" },
  { label: "SHA-384", algo: "sha384" },
  { label: "SHA-1", algo: "sha1" },
  { label: "MD5", algo: "md5" },
];

/** Streams a file through every algorithm in one pass (safe for large files). */
export async function hashFile(filePath: string): Promise<{ rows: HashRow[]; size: number }> {
  const st = fs.statSync(filePath);
  if (!st.isFile()) throw new Error("Not a regular file");
  const hashers = FILE_HASH_ALGOS.map((a) => ({ label: a.label, h: createHash(a.algo) }));
  await new Promise<void>((resolve, reject) => {
    const s = fs.createReadStream(filePath);
    s.on("data", (chunk) => { for (const x of hashers) x.h.update(chunk); });
    s.on("error", reject);
    s.on("end", () => resolve());
  });
  return { rows: hashers.map((x) => [x.label, x.h.digest("hex")] as HashRow), size: st.size };
}

/** Strips whitespace/"0x"/colons and lowercases a pasted checksum. */
export function normalizeChecksum(raw: string): string {
  return (raw || "").trim().replace(/^0x/i, "").replace(/[\s:]/g, "").toLowerCase();
}

/** Compares an expected checksum with computed digest rows; returns the matching algorithm label or null. */
export function matchChecksum(expectedRaw: string, rows: HashRow[]): { match: string | null; normalized: string } {
  const normalized = normalizeChecksum(expectedRaw);
  if (!normalized) return { match: null, normalized };
  for (const [label, digest] of rows) {
    if (label.startsWith("HMAC")) continue;
    const d = digest.toLowerCase();
    if (d.length === normalized.length && timingSafeEqual(Buffer.from(d), Buffer.from(normalized))) return { match: label, normalized };
  }
  return { match: null, normalized };
}

export interface PasswordOptions {
  length: number;
  lower?: boolean;
  upper?: boolean;
  digits?: boolean;
  symbols?: boolean;
  /** Exclude look-alike characters such as O/0 and l/1/I. */
  noAmbiguous?: boolean;
}

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?";
const AMBIGUOUS = /[O0oIl1|`'"]/g;

export function clampPasswordLength(n: number): number {
  if (!Number.isFinite(n)) return 20;
  return Math.max(4, Math.min(256, Math.floor(n)));
}

/** Generates a password with at least one character from every selected class (CSPRNG). */
export function generatePassword(opts: PasswordOptions, rand: (max: number) => number = (m) => randomInt(m)): string {
  const len = clampPasswordLength(opts.length);
  const classes: string[] = [];
  const clean = (s: string) => (opts.noAmbiguous ? s.replace(AMBIGUOUS, "") : s);
  if (opts.lower !== false) classes.push(clean(LOWER));
  if (opts.upper !== false) classes.push(clean(UPPER));
  if (opts.digits !== false) classes.push(clean(DIGITS));
  if (opts.symbols) classes.push(clean(SYMBOLS));
  if (classes.length === 0) throw new Error("Select at least one character type");
  const all = classes.join("");
  const out: string[] = classes.map((c) => c[rand(c.length)]!);
  while (out.length < len) out.push(all[rand(all.length)]!);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.slice(0, len).join("");
}

export function toBase64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

export function fromBase64(s: string): string {
  const t = s.trim().replace(/\s+/g, "");
  if (!t) throw new Error("Nothing to decode");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(t)) throw new Error("Input is not valid Base64");
  return Buffer.from(t.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function toHex(s: string): string {
  return Buffer.from(s, "utf8").toString("hex");
}

export function fromHex(s: string): string {
  const t = s.trim().replace(/^0x/i, "").replace(/[\s:]/g, "");
  if (!t) throw new Error("Nothing to decode");
  if (t.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(t)) throw new Error("Input is not valid hex (needs an even number of 0-9a-f digits)");
  return Buffer.from(t, "hex").toString("utf8");
}

/** Describes iat / nbf / exp claims relative to `nowMs`. */
export function describeJwtTimes(payload: any, nowMs = Date.now()): string[] {
  const out: string[] = [];
  const fmt = (sec: number) => new Date(sec * 1000).toISOString().replace(".000Z", "Z");
  const rel = (sec: number) => {
    const diff = Math.round(sec - nowMs / 1000);
    const abs = Math.abs(diff);
    const unit = abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.round(abs / 60)}m` : abs < 86400 ? `${Math.round(abs / 3600)}h` : `${Math.round(abs / 86400)}d`;
    return diff >= 0 ? `in ${unit}` : `${unit} ago`;
  };
  for (const [claim, name] of [["iat", "Issued at"], ["nbf", "Not before"], ["exp", "Expires"]] as const) {
    const v = payload?.[claim];
    if (typeof v === "number" && Number.isFinite(v)) out.push(`${name} (${claim}): ${fmt(v)} (${rel(v)})`);
  }
  if (typeof payload?.exp === "number") {
    out.push(payload.exp * 1000 < nowMs ? "Status: EXPIRED" : "Status: not expired");
  }
  return out;
}

const HMAC_ALGS: Record<string, string> = { HS256: "sha256", HS384: "sha384", HS512: "sha512" };

/** Verifies an HS256/384/512 JWT signature with a shared secret. */
export function verifyJwtHmac(token: string, secret: string): { ok: boolean; alg: string; reason?: string } {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return { ok: false, alg: "?", reason: "Token must have 3 dot-separated parts" };
  let alg = "?";
  try {
    alg = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")).alg;
  } catch {
    return { ok: false, alg, reason: "Header is not valid base64url JSON" };
  }
  const node = HMAC_ALGS[alg];
  if (!node) return { ok: false, alg, reason: alg === "none" ? "Unsigned token (alg=none) — never trust it" : `Only HS256/HS384/HS512 can be verified with a secret (token uses ${alg})` };
  const expected = createHmac(node, secret).update(`${parts[0]}.${parts[1]}`).digest();
  let given: Buffer;
  try { given = Buffer.from(parts[2]!, "base64url"); } catch { return { ok: false, alg, reason: "Signature is not valid base64url" }; }
  const ok = given.length === expected.length && timingSafeEqual(given, expected);
  return ok ? { ok, alg } : { ok, alg, reason: "Signature does not match this secret" };
}

/** Plain-text report of the last results for Save As / clipboard. */
export function formatDigestReport(rows: HashRow[], source: string): string {
  const w = Math.max(...rows.map((r) => r[0].length), 4);
  return [`Source: ${source}`, "", ...rows.map(([a, d]) => `${a.padEnd(w)}  ${d}`)].join("\n") + "\n";
}
