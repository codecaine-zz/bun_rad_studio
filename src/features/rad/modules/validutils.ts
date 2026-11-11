/**
 * Common input validation predicates for emails, URLs, IPv4/IPv6 addresses, phone numbers,
 * alphanumeric strings, numeric ranges, UUIDs, and JSON payloads.
 */

import { isIP } from "node:net";

// Doer: Validate email address format
/**
 * Returns `true` if `str` matches a standard `user@domain.tld` email format.
 */
export function isEmail(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

// Doer: Validate standard HTTP/HTTPS/FTP URL
/**
 * Returns `true` if `str` is a valid `http:`, `https:`, or `ftp:` URL.
 */
export function isUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return ["http:", "https:", "ftp:"].includes(url.protocol);
  } catch {
    return false;
  }
}

// Doer: Validate IPv4 address
/**
 * Returns `true` if `str` is a valid dotted-quad IPv4 address (`0.0.0.0`–`255.255.255.255`) with no leading zeroes.
 */
export function isIpv4(str: string): boolean {
  const parts = str.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d+$/.test(p)) return false;
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255 && (p === "0" || !p.startsWith("0"));
  });
}

// Doer: Validate IPv6 address
/**
 * Returns `true` if `str` is a valid full or compressed hexadecimal IPv6 address.
 */
export function isIpv6(str: string): boolean {
  return isIP(str.trim()) === 6;
}

// Doer: Validate E.164 or common domestic phone number format
/**
 * Returns `true` if `str` is a plausible E.164 or formatted domestic telephone number with at least 7 digits.
 */
export function isPhone(str: string): boolean {
  return (
    /^\+?[0-9\s\-\(\)\.]{7,20}$/.test(str.trim()) &&
    str.replace(/\D/g, "").length >= 7
  );
}

// Doer: Validate alphanumeric string without spaces or symbols
/**
 * Returns `true` if `str` consists exclusively of ASCII letters and digits (`a-z`, `A-Z`, `0-9`).
 */
export function isAlphanumeric(str: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(str);
}

// Doer: Check if number falls within inclusive range [min, max]
/**
 * Returns `true` if `val` falls within the inclusive range `[min, max]`.
 */
export function inRange(val: number, min: number, max: number): boolean {
  return val >= min && val <= max;
}

// Doer: Validate UUID format (RFC 9562 v1–v8, nil, and max UUIDs)
/**
 * Returns `true` if `str` is a valid RFC 9562 / RFC 4122 UUID (versions 1–8, plus nil and max UUIDs).
 */
export function isUuid(str: string): boolean {
  return /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i.test(
    str.trim(),
  );
}

// Doer: Validate string is valid JSON
/**
 * Returns `true` if `str` can be parsed by `JSON.parse` without throwing.
 */
export function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Namespace bundling all string, network, identifier, and numeric validation predicates.
 */
export const validutils = {
  isEmail,
  isUrl,
  isIpv4,
  isIpv6,
  isPhone,
  isAlphanumeric,
  inRange,
  isUuid,
  isJson,
};
