/**
 * Lightweight JSON Web Token (JWT) signing, constant-time HMAC-SHA256 (`HS256`) verification,
 * expiration enforcement, and unverified payload inspection.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function base64UrlEncodeJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function base64UrlDecodeJson<T>(str: string): T {
  const json = Buffer.from(str, "base64url").toString("utf-8");
  return JSON.parse(json) as T;
}

// Coordinator: Sign HS256 JSON Web Token
/**
 * Signs a JSON `payload` as an `HS256` JWT using `secret`, automatically populating `iat` and `exp` claims.
 */
export function signJwt(payload: Record<string, any>, secret: string, expiresInSeconds = 3600): string {
  const header = { alg: "HS256", typ: "JWT" };
  const nowSec = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: payload.iat ?? nowSec,
    exp: payload.exp ?? nowSec + expiresInSeconds,
  };

  const headerB64 = base64UrlEncodeJson(header);
  const payloadB64 = base64UrlEncodeJson(claims);
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");

  return `${signingInput}.${signature}`;
}

// Coordinator: Verify HS256 JSON Web Token signature and expiration
/**
 * Verifies an `HS256` JWT's signature in constant time and checks its `exp` claim, returning the decoded payload.
 * @throws If the token is malformed, uses an unsupported algorithm, fails signature verification, or is expired.
 */
export function verifyJwt<T = Record<string, any>>(token: string, secret: string): T {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("[jwtutils] Malformed JWT token format");
  }

  const [headerB64, payloadB64, signature] = parts;
  const header = base64UrlDecodeJson<any>(headerB64!);
  if (!header || header.alg !== "HS256") {
    throw new Error("[jwtutils] Unsupported or missing JWT algorithm");
  }
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac("sha256", secret).update(signingInput).digest("base64url");

  const sigBuf = Buffer.from(signature ?? "", "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("[jwtutils] Invalid JWT token signature");
  }

  const payload = base64UrlDecodeJson<any>(payloadB64!);
  if (payload.exp && typeof payload.exp === "number") {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > payload.exp) {
      throw new Error("[jwtutils] JWT token has expired");
    }
  }

  return payload as T;
}

// Doer: Decode token payload without signature verification
/**
 * Decodes and returns a JWT's payload claims without verifying its cryptographic signature.
 */
export function decodeJwtUnverified<T = Record<string, any>>(token: string): T {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("[jwtutils] Malformed JWT token format");
  }
  return base64UrlDecodeJson<T>(parts[1]!);
}

/**
 * Namespace bundling JWT signing, verification, and unverified decoding helpers.
 */
export const jwtutils = {
  signJwt,
  verifyJwt,
  decodeJwtUnverified,
};
