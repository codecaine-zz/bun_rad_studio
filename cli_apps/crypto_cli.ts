#!/usr/bin/env bun
import { SimpleCLI, stdlib } from "../src/index.ts";
import * as fs from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";

const app = SimpleCLI.newApp("crypto-cli", "1.0.0").setDescription(
  "Cryptographic Hash, Symmetric AES, HMAC, JWT, UUID & Entropy Meter",
);

app.addFlagString(
  "algo",
  "a",
  "sha256",
  "Hash algorithm: md5, sha1, sha256, sha512, bcrypt",
);
app.addFlagString("text", "t", "", "Input plaintext string");
app.addFlagString("file", "f", "", "Input file path for hashing");
app.addFlagString(
  "encrypt",
  "e",
  "",
  "Encrypt input text using AES-256 with key",
);
app.addFlagString(
  "decrypt",
  "d",
  "",
  "Decrypt ciphertext using AES-256 with key",
);
app.addFlagString("key", "k", "", "Passphrase/key for AES or HMAC operations");
app.addFlagString(
  "hmac",
  "H",
  "",
  "Generate HMAC-SHA256 signature for input text with --key",
);
app.addFlagString("jwt", "j", "", "Decode JWT token header and claims payload");
app.addFlagString(
  "entropy",
  "E",
  "",
  "Calculate Shannon bit-entropy and strength for a password",
);
app.addFlagBool(
  "uuid",
  "u",
  false,
  "Generate cryptographically random UUID v4",
);
app.addFlagBool(
  "interactive",
  "x",
  false,
  "Launch interactive crypto workstation",
);

function calculateEntropy(pwd: string): { bits: number; rating: string } {
  let pool = 0;
  if (/[a-z]/.test(pwd)) pool += 26;
  if (/[A-Z]/.test(pwd)) pool += 26;
  if (/[0-9]/.test(pwd)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pwd)) pool += 33;
  const bits = Math.round(pwd.length * (pool > 0 ? Math.log2(pool) : 0));
  let rating = "Very Weak";
  if (bits >= 128) rating = "Cryptographically Secure (128+ bits)";
  else if (bits >= 60) rating = "Strong (60-127 bits)";
  else if (bits >= 36) rating = "Moderate (36-59 bits)";
  else if (bits >= 28) rating = "Weak (28-35 bits)";
  return { bits, rating };
}

/**
 * Computes raw byte digest (MD5, SHA-1, SHA-256, SHA-512) without UTF-8 corruption on binary files.
 */
export function hashFileBytes(buf: Uint8Array, algo: string): string {
  const normalized = algo.toLowerCase();
  const digestAlgo =
    normalized === "md5" ||
    normalized === "sha1" ||
    normalized === "sha256" ||
    normalized === "sha512"
      ? normalized
      : "sha256";
  return createHash(digestAlgo).update(buf).digest("hex");
}

/**
 * Computes byte-level Shannon entropy in bits per byte (`0..8`) and total bits for a `Uint8Array`.
 */
export function calculateByteShannonEntropy(buf: Uint8Array): {
  bitsPerByte: number;
  totalBits: number;
} {
  if (buf.byteLength === 0) return { bitsPerByte: 0, totalBits: 0 };
  const counts = new Uint32Array(256);
  for (let i = 0; i < buf.byteLength; i++) {
    counts[buf[i]!]!++;
  }
  let h = 0;
  const len = buf.byteLength;
  for (let b = 0; b < 256; b++) {
    const c = counts[b]!;
    if (c > 0) {
      const p = c / len;
      h -= p * Math.log2(p);
    }
  }
  return {
    bitsPerByte: Number(h.toFixed(4)),
    totalBits: Math.round(h * len),
  };
}

function decodeJwt(token: string) {
  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    app.error(
      "Invalid JWT: A valid token must have 3 dot-separated parts (header.payload.signature).",
    );
    process.exit(1);
  }
  try {
    const header = JSON.parse(
      Buffer.from(parts[0]!, "base64url").toString("utf8"),
    );
    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8"),
    );
    app.panel("JWT Header", JSON.stringify(header, null, 2));
    app.panel("JWT Payload Claims", JSON.stringify(payload, null, 2));
    if (payload.exp !== undefined) {
      const expDate = new Date(payload.exp * 1000);
      const isExpired = expDate.getTime() <= Date.now();
      app.info(
        `Expiration: ${expDate.toISOString()} (${isExpired ? app.red("EXPIRED") : app.green("ACTIVE")})`,
      );
    }
  } catch (e: any) {
    app.error(`Failed to decode JWT: ${e.message}`);
    process.exit(1);
  }
}

async function main() {
  if (app.getFlagBool("uuid")) {
    const id = randomUUID();
    app.success("Generated UUID v4:");
    console.log(id);
    return;
  }

  const entropyPwd = app.getFlagString("entropy");
  if (entropyPwd) {
    const { bits, rating } = calculateEntropy(entropyPwd);
    app.printKv({
      "Password Length": `${entropyPwd.length} characters`,
      "Shannon Entropy": `${bits} bits`,
      "Security Rating": rating,
    });
    return;
  }

  const jwtToken = app.getFlagString("jwt");
  if (jwtToken) {
    decodeJwt(jwtToken);
    return;
  }

  const key = app.getFlagString("key");
  const hmacTxt = app.getFlagString("hmac");
  if (hmacTxt) {
    if (!key) {
      app.error("HMAC requires --key / -k flag.");
      process.exit(1);
    }
    const hmac = createHmac("sha256", key).update(hmacTxt).digest("hex");
    app.success("HMAC-SHA256 Signature:");
    console.log(hmac);
    return;
  }

  if (app.getFlagBool("interactive")) {
    app.panel(
      "Crypto Studio REPL",
      "Supported algorithms: MD5, SHA-1, SHA-256, SHA-512, BCrypt, AES-256.",
    );
    const text = await app.prompt(
      "Enter plaintext to process",
      "MasterPassword123!",
    );
    const hMd5 = stdlib.md5(text);
    const hSha256 = stdlib.sha256(text);
    const hSha512 = stdlib.sha512(text);
    const hBcrypt = await stdlib.bcryptHash(text);

    app.table(
      ["Algorithm", "Hash / Digest"],
      [
        ["MD5", hMd5],
        ["SHA-256", hSha256],
        ["SHA-512", hSha512.slice(0, 32) + "..."],
        ["BCrypt", hBcrypt],
      ],
    );
    return;
  }

  const encryptTxt = app.getFlagString("encrypt");
  const decryptTxt = app.getFlagString("decrypt");

  if (encryptTxt) {
    if (!key) {
      app.error("Encryption requires --key / -k flag.");
      process.exit(1);
    }
    const cipher = stdlib.aesEncrypt(encryptTxt, key);
    app.success("AES-256 Encrypted Ciphertext:");
    console.log(cipher);
    return;
  }

  if (decryptTxt) {
    if (!key) {
      app.error("Decryption requires --key / -k flag.");
      process.exit(1);
    }
    try {
      const plain = stdlib.aesDecrypt(decryptTxt, key);
      app.success("AES-256 Decrypted Plaintext:");
      console.log(plain);
    } catch (err: any) {
      app.error(`AES decryption failed: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  const algo = app.getFlagString("algo").toLowerCase();
  const filePath = app.getFlagString("file");
  let inputBytes: Buffer | null = null;
  let inputText =
    app.getFlagString("text") || app.getPositionalArgs().join(" ");

  if (filePath) {
    if (!fs.existsSync(filePath)) {
      app.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    inputBytes = fs.readFileSync(filePath);
    app.info(`Read ${inputBytes.byteLength} bytes from ${filePath}`);
  } else {
    if (!inputText) {
      inputText = "Hello, World!";
      app.info(`No text or file specified. Using default input "${inputText}"`);
    }
    inputBytes = Buffer.from(inputText, "utf8");
  }

  app.resetTimer();
  let hashOut = "";
  if (algo === "bcrypt") {
    hashOut = await stdlib.bcryptHash(inputBytes.toString("utf8"));
  } else {
    hashOut = hashFileBytes(inputBytes, algo);
  }

  app.success(`${algo.toUpperCase()} Hash computed in ${app.elapsedMs()} ms:`);
  console.log(hashOut);
}

if (import.meta.main) {
  if (!app.parseCli()) process.exit(0);
  app.banner(
    "Crypto & Hashing Studio CLI",
    "v1.0.0 - Headless Security Toolkit",
  );
  await main();
}
