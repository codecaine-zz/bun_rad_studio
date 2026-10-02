import { createHmac, randomBytes } from "node:crypto";

// Doer: Calculate SHA-256 hex digest using native Bun.SHA256.hash
export function sha256(data: string | Uint8Array): string {
  return Bun.SHA256.hash(data, "hex");
}

// Doer: Calculate SHA-512 hex digest using native Bun.SHA512.hash
export function sha512(data: string | Uint8Array): string {
  return Bun.SHA512.hash(data, "hex");
}

// Doer: Calculate MD5 hex digest using native Bun.MD5.hash
export function md5(data: string | Uint8Array): string {
  return Bun.MD5.hash(data, "hex");
}

// Doer: Calculate HMAC-SHA256 hex digest
export function hmacSha256(data: string | Uint8Array, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

// Doer: Encode string or buffer to Base64
export function base64Encode(data: string | Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

// Doer: Decode Base64 string to utf-8 text
export function base64Decode(str: string): string {
  return Buffer.from(str, "base64").toString("utf-8");
}

// Doer: Encode string or buffer to Base64URL
export function base64UrlEncode(data: string | Uint8Array): string {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Doer: Decode Base64URL string to utf-8 text
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

// Doer: Generate random UUID v4
export function uuidV4(): string {
  return crypto.randomUUID();
}

// Doer: Generate ordered UUID v7 using native Bun.randomUUIDv7
export function uuidV7(): string {
  return Bun.randomUUIDv7();
}

// Doer: Generate cryptographically secure random hex token
export function randomToken(length = 32): string {
  return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

// Doer: Hash password using Bun's native argon2id/bcrypt
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password);
}

// Doer: Verify password against stored hash using Bun's native verifier
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

export const cryptoutils = {
  sha256,
  sha512,
  md5,
  hmacSha256,
  base64Encode,
  base64Decode,
  base64UrlEncode,
  base64UrlDecode,
  uuidV4,
  uuidV7,
  randomToken,
  hashPassword,
  verifyPassword,
};

