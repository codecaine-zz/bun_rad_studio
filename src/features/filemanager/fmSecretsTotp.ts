/**
 * One-time codes (RFC 4226 HOTP / RFC 6238 TOTP) with SHA-1, SHA-256 or SHA-512, 6 to 8 digits and a 15 to 60 second
 * period. A stored secret may be a bare base32 string or an `otpauth://totp/...` address (as in a QR code).
 */
import { createHmac } from "node:crypto";
import { FmError } from "./fmPaths";

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";
export interface TotpSpec {
  secret: Buffer;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
  issuer?: string;
  label?: string;
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, case and spaces and `=` padding ignored. Returns null for anything else. */
export function base32Decode(input: string): Buffer | null {
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!clean) return null;
  let bits = 0;
  let acc = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
      acc &= (1 << bits) - 1;
    }
  }
  return out.length ? Buffer.from(out) : null;
}

const bad = (message: string): never => {
  throw new FmError("BAD_TOTP", message);
};

const ALGORITHMS: Record<string, TotpAlgorithm> = { SHA1: "SHA1", SHA256: "SHA256", SHA512: "SHA512", "SHA-1": "SHA1", "SHA-256": "SHA256", "SHA-512": "SHA512" };

/** Understands a bare base32 secret or an otpauth://totp/ address. Throws a plain-words FmError otherwise. */
export function parseTotp(input: string): TotpSpec {
  const text = input.trim();
  if (!text) return bad("There is no one-time code secret yet.");
  const spec: TotpSpec = { secret: Buffer.alloc(0), algorithm: "SHA1", digits: 6, period: 30 };
  let rawSecret = text;
  if (/^otpauth:/i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return bad("That one-time code address isn't valid.");
    }
    if (url.hostname.toLowerCase() !== "totp") return bad("Only time-based codes (otpauth://totp/…) are supported.");
    const q = url.searchParams;
    rawSecret = q.get("secret") ?? "";
    if (!rawSecret) return bad("That one-time code address has no secret in it.");
    const algo = ALGORITHMS[(q.get("algorithm") ?? "SHA1").toUpperCase()];
    if (!algo) return bad("That one-time code uses an algorithm this program doesn't support (use SHA-1, SHA-256 or SHA-512).");
    spec.algorithm = algo;
    if (q.has("digits")) spec.digits = Number(q.get("digits"));
    if (q.has("period")) spec.period = Number(q.get("period"));
    let label = "";
    try {
      label = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    } catch {
      label = url.pathname.replace(/^\/+/, "");
    }
    const issuer = q.get("issuer") ?? (label.includes(":") ? label.split(":")[0]!.trim() : "");
    if (issuer) spec.issuer = issuer.slice(0, 100);
    if (label) spec.label = label.slice(0, 200);
  }
  if (!Number.isInteger(spec.digits) || spec.digits < 6 || spec.digits > 8) return bad("One-time codes must have 6 to 8 digits.");
  if (!Number.isInteger(spec.period) || spec.period < 15 || spec.period > 60) return bad("The one-time code period must be 15 to 60 seconds.");
  const key = base32Decode(rawSecret);
  if (!key || key.length < 10) return bad("That one-time code secret isn't valid. It should be letters A–Z and digits 2–7, as shown next to the QR code.");
  if (key.length > 128) return bad("That one-time code secret is too long.");
  spec.secret = key;
  return spec;
}

const HASH: Record<TotpAlgorithm, string> = { SHA1: "sha1", SHA256: "sha256", SHA512: "sha512" };

/** HOTP (RFC 4226, section 5.3) for one counter value. */
export function hotp(secret: Buffer, counter: number, digits: number, algorithm: TotpAlgorithm): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(HASH[algorithm], secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** The code valid at `nowMs` and how many whole seconds remain before it changes. */
export function totpAt(spec: TotpSpec, nowMs: number): { code: string; secondsLeft: number; period: number; digits: number } {
  const seconds = Math.floor(nowMs / 1000);
  return { code: hotp(spec.secret, Math.floor(seconds / spec.period), spec.digits, spec.algorithm), secondsLeft: spec.period - (seconds % spec.period), period: spec.period, digits: spec.digits };
}
