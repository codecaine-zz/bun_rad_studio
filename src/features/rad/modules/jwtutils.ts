import { createHmac } from "node:crypto";

function base64UrlEncodeJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function base64UrlDecodeJson<T>(str: string): T {
  const json = Buffer.from(str, "base64url").toString("utf-8");
  return JSON.parse(json) as T;
}

// Coordinator: Sign HS256 JSON Web Token
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
export function verifyJwt<T = Record<string, any>>(token: string, secret: string): T {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("[jwtutils] Malformed JWT token format");
  }

  const [headerB64, payloadB64, signature] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac("sha256", secret).update(signingInput).digest("base64url");

  if (signature !== expectedSig) {
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
export function decodeJwtUnverified<T = Record<string, any>>(token: string): T {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("[jwtutils] Malformed JWT token format");
  }
  return base64UrlDecodeJson<T>(parts[1]!);
}

export const jwtutils = {
  signJwt,
  verifyJwt,
  decodeJwtUnverified,
};
