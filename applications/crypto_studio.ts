import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { stdlib } from "../src/simplecli/stdlib";
import { createHmac } from "crypto";

function estimateEntropy(str: string): { bits: number; strength: string } {
  let pool = 0;
  if (/[a-z]/.test(str)) pool += 26;
  if (/[A-Z]/.test(str)) pool += 26;
  if (/[0-9]/.test(str)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(str)) pool += 32;

  if (pool === 0 || str.length === 0) return { bits: 0, strength: "None" };
  const bits = Math.round(str.length * (Math.log(pool) / Math.log(2)));
  const strength = bits < 40 ? "🔴 Very Weak" : bits < 60 ? "🟡 Moderate" : bits < 80 ? "🟢 Strong" : "✨ Enterprise (Very Strong)";
  return { bits, strength };
}

function decodeJwt(token: string): { header: any; payload: any } | null {
  const parts = token.trim().split(".");
  if (parts.length < 2) return null;
  try {
    const headerJson = Buffer.from(parts[0] || "", "base64url").toString("utf8");
    const payloadJson = Buffer.from(parts[1] || "", "base64url").toString("utf8");
    return {
      header: JSON.parse(headerJson),
      payload: JSON.parse(payloadJson),
    };
  } catch {
    return null;
  }
}

export function createCryptoStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const fullscreen = options.fullscreen ?? true;
  const win = newSimpleWindow("Crypto Studio Pro -- Cryptography, Security & Token Workbench", 1160, 920, {
    appId: "crypto_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen,
  });

  // Title Row
  win.beginRow();
  win.addHeading("Crypto Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.endRow();
  win.addCaption("Enterprise Cryptography Workbench: Hashes, HMAC, AES-256 Ciphers, JWT Decoders & Entropy Auditing");

  // Hash & HMAC Generator
  win.beginGroupBox("Cryptographic Hashing & HMAC Engine");
  win.beginRow();
  win.addLabel("lbl_hash_input", "Input Payload:");
  win.addInput("txt_hash_input", "The quick brown fox jumps over the lazy dog").width(420);
  win.addLabel("lbl_hmac_key", "HMAC Key:");
  win.addInput("txt_hmac_key", "secret-signing-key").width(220);
  win.addButton("btn_calc_hashes", "⚡ Calculate Hashes & HMAC");
  win.endRow();

  win.addTable("tbl_hashes", ["Algorithm / Primitive", "Computed Digest (Hex)"], [
    ["SHA-256", "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"],
    ["HMAC-SHA256", "796fc78f141bf526f4f22ae803b9ecbe0d64ccbe0e65fd903006437d8a9e0839"],
    ["SHA-512", "07e547d9586f6a73f73fbac0435ed76951218fb7d0c8d788a30f761b4028608b..."],
    ["MD5", "9e107d9d372bb6826bd81d3542a419d6"],
    ["SHA-1", "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12"],
  ]).height(105);
  win.endGroupBox();

  // AES-256 Encryption & Decryption
  win.beginGroupBox("AES-256 Symmetric Cipher (CBC / PKCS7)");
  win.beginRow();
  win.addLabel("lbl_passphrase", "Cipher Passphrase:");
  win.addInput("txt_passphrase", "super-secret-vault-key-2026").width(280);
  win.addButton("btn_encrypt", "🔒 Encrypt Payload");
  win.addButton("btn_decrypt", "🔓 Decrypt Ciphertext");
  win.addButton("btn_entropy", "📊 Check Entropy");
  win.endRow();

  win.addLabel("lbl_cipher_text", "Ciphertext / Payload Output:");
  win.addTextarea("txt_cipher_text", "").height(65);
  win.endGroupBox();

  // JWT & Entropy Tools
  win.beginGroupBox("JWT Forensics, Token Generation & Entropy Meter");
  win.beginRow();
  win.addButton("btn_gen_uuid", "🎲 New UUID v4");
  win.addButton("btn_gen_hex32", "🔑 32-Byte Hex Key");
  win.addButton("btn_gen_b64", "📦 Base64 256-bit Key");
  win.addButton("btn_decode_jwt", "🔍 Decode JWT Token");
  win.addButton("btn_url_encode", "🌐 URL Encode/Decode");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_token_out", "Generated Token: (Click button above)");
  win.addLabel("lbl_entropy_out", "Entropy: ~78 bits (Strong)");
  win.endRow();
  win.endGroupBox();

  // Console Telemetry
  win.beginGroupBox("Cryptographic Operations Telemetry & Audit Log");
  win.addConsole("crypto_console", 85);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Hardware WebCrypto Acceleration: Active  |  Zero Homebrew");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Crypto workspace state saved!");
  });

  win.onClick("btn_calc_hashes", () => {
    const text = win.getValue("txt_hash_input") || "";
    const key = win.getValue("txt_hmac_key") || "secret";

    const t0 = performance.now();
    const sha256 = stdlib.sha256(text);
    const sha512 = stdlib.sha512(text);
    const md5 = stdlib.md5(text);
    const sha1 = stdlib.sha1(text);

    let hmacSha256 = "";
    try {
      hmacSha256 = createHmac("sha256", key).update(text).digest("hex");
    } catch {
      hmacSha256 = "(HMAC compute error)";
    }

    const elapsed = (performance.now() - t0).toFixed(2);
    win.setTableData("tbl_hashes", ["Algorithm / Primitive", "Computed Digest (Hex)"], [
      ["SHA-256", sha256],
      ["HMAC-SHA256", hmacSha256],
      ["SHA-512", sha512.slice(0, 64) + "..."],
      ["MD5", md5],
      ["SHA-1", sha1],
    ]);

    win.appendConsole("crypto_console", `[Hashes] Computed SHA-256/512, MD5, SHA-1 and HMAC in ${elapsed}ms\n`, 2);
    win.setStatus(`Hashes calculated (${elapsed}ms)`);
    win.toast("Calculated cryptographic hashes");
  });

  win.onClick("btn_encrypt", () => {
    const text = win.getValue("txt_hash_input") || "";
    const pass = win.getValue("txt_passphrase") || "";
    if (!text || !pass) {
      win.toast("Please supply input payload and passphrase");
      return;
    }

    try {
      const encrypted = stdlib.aesEncrypt(text, pass);
      win.setText("txt_cipher_text", encrypted);
      win.appendConsole("crypto_console", `[AES-256] Encrypted payload (${text.length} chars) -> ${encrypted.length} Base64 chars\n`, 2);
      win.setStatus("AES-256 Encryption Successful");
      win.toast("Payload encrypted");
    } catch (e: any) {
      win.appendConsole("crypto_console", `[AES-256 Error] ${e.message}\n`, 3);
      win.setStatus(`Encryption Error: ${e.message}`);
    }
  });

  win.onClick("btn_decrypt", () => {
    const cipher = win.getValue("txt_cipher_text") || "";
    const pass = win.getValue("txt_passphrase") || "";
    if (!cipher || !pass) {
      win.toast("Please supply ciphertext and passphrase");
      return;
    }

    try {
      const decrypted = stdlib.aesDecrypt(cipher, pass);
      win.setText("txt_hash_input", decrypted);
      win.appendConsole("crypto_console", `[AES-256] Decrypted ciphertext -> "${decrypted}"\n`, 2);
      win.setStatus("Decryption Successful");
      win.toast("Decrypted successfully");
    } catch (e: any) {
      win.appendConsole("crypto_console", `[AES-256 Decrypt Error] ${e.message}\n`, 3);
      win.setStatus(`Decryption Error: ${e.message}`);
    }
  });

  win.onClick("btn_entropy", () => {
    const pass = win.getValue("txt_passphrase") || "";
    const res = estimateEntropy(pass);
    win.setText("lbl_entropy_out", `Entropy: ~${res.bits} bits (${res.strength})`);
    win.appendConsole("crypto_console", `[Entropy Audit] Passphrase evaluated: ~${res.bits} bits (${res.strength})\n`, 2);
    win.toast(`Entropy: ~${res.bits} bits`);
  });

  win.onClick("btn_gen_uuid", () => {
    const uuid = crypto.randomUUID();
    win.setText("lbl_token_out", `UUID: ${uuid}`);
    win.appendConsole("crypto_console", `[UUID v4] Generated: ${uuid}\n`, 1);
    win.toast("UUID generated");
  });

  win.onClick("btn_gen_hex32", () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    win.setText("lbl_token_out", `Hex Key: ${hex}`);
    win.appendConsole("crypto_console", `[32-Byte Key] Generated: ${hex}\n`, 1);
    win.toast("32-byte key generated");
  });

  win.onClick("btn_gen_b64", () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const b64 = Buffer.from(bytes).toString("base64");
    win.setText("lbl_token_out", `Base64 Key: ${b64}`);
    win.appendConsole("crypto_console", `[Base64 Key] Generated: ${b64}\n`, 1);
    win.toast("Base64 key generated");
  });

  win.onClick("btn_decode_jwt", () => {
    const text = win.getValue("txt_cipher_text") || win.getValue("txt_hash_input") || "";
    const decoded = decodeJwt(text);
    if (!decoded) {
      win.toast("Input is not a valid 3-part JWT token");
      win.appendConsole("crypto_console", "[JWT Error] Input does not match JWT format (header.payload.signature)\n", 3);
      return;
    }
    const report = [
      "// Decoded JWT Structure",
      "// Header:",
      JSON.stringify(decoded.header, null, 2),
      "// Payload / Claims:",
      JSON.stringify(decoded.payload, null, 2),
    ].join("\n");

    win.setText("txt_cipher_text", report);
    win.appendConsole("crypto_console", `[JWT Decoded] Algorithm: ${decoded.header.alg}, Subject: ${decoded.payload.sub || "N/A"}\n`, 2);
    win.toast("JWT claims decoded");
  });

  win.onClick("btn_url_encode", () => {
    const input = win.getValue("txt_hash_input") || "";
    if (input.includes("%")) {
      const decoded = decodeURIComponent(input);
      win.setText("txt_hash_input", decoded);
      win.appendConsole("crypto_console", `[URL Decode] Decoded -> ${decoded}\n`, 1);
      win.toast("URL Decoded");
    } else {
      const encoded = encodeURIComponent(input);
      win.setText("txt_hash_input", encoded);
      win.appendConsole("crypto_console", `[URL Encode] Encoded -> ${encoded}\n`, 1);
      win.toast("URL Encoded");
    }
  });

  win.onClick("btn_fullscreen", () => win.toggleFullscreen());

  return win;
}

if (import.meta.main) {
  const win = createCryptoStudio({ fullscreen: true });
  console.log("⚡ Launching Crypto Studio Pro (Fullscreen)...");
  win.run();
}
