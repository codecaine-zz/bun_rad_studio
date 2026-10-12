import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { stdlib } from "../src/simplecli/stdlib";
import { createHmac } from "crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  hashFile,
  matchChecksum,
  generatePassword,
  clampPasswordLength,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  describeJwtTimes,
  verifyJwtHmac,
  formatDigestReport,
  type HashRow,
} from "../src/crypto_tools";

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

  // Productivity Toolkit
  win.beginGroupBox("Productivity Toolkit: File Hashing, Checksum Verify, Password Generator & Encoders");
  win.beginRow();
  win.addLabel("lbl_file_path", "File to hash:");
  win.addInput("txt_file_path", "", "Choose a file to compute SHA-256/512/384, SHA-1 and MD5...").width(360);
  win.addButton("btn_browse_file", "📄 Browse...");
  win.addButton("btn_hash_file", "🧮 Hash File");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_expected", "Expected checksum:");
  win.addInput("txt_expected", "", "Paste a published SHA-256 / SHA-1 / MD5 ... to compare").width(420);
  win.addButton("btn_verify_checksum", "✔ Verify Checksum");
  win.addButton("btn_copy_digests", "📋 Copy Digests");
  win.addButton("btn_save_digests", "💾 Save Digests As...");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_pw_len", "Password length:");
  win.addInput("txt_pw_len", "20").width(60);
  win.addCheckbox("chk_pw_lower", "a-z", true);
  win.addCheckbox("chk_pw_upper", "A-Z", true);
  win.addCheckbox("chk_pw_digits", "0-9", true);
  win.addCheckbox("chk_pw_symbols", "Symbols", true);
  win.addCheckbox("chk_pw_noamb", "No look-alikes", false);
  win.addButton("btn_gen_password", "🔐 Generate Password");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_pw_out", "Generated password:");
  win.addInput("txt_pw_out", "", "Click Generate Password").width(420);
  win.addButton("btn_copy_password", "📋 Copy Password");
  win.endRow();

  win.beginRow();
  win.addButton("btn_b64_encode", "Base64 Encode");
  win.addButton("btn_b64_decode", "Base64 Decode");
  win.addButton("btn_hex_encode", "Hex Encode");
  win.addButton("btn_hex_decode", "Hex Decode");
  win.addLabel("lbl_jwt_secret", "JWT secret:");
  win.addInput("txt_jwt_secret", "", "HS256/384/512 shared secret").width(220);
  win.addButton("btn_verify_jwt", "🛡 Verify JWT Signature");
  win.addButton("btn_copy_output", "📋 Copy Output");
  win.addButton("btn_clear_all", "✕ Clear All");
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

  let lastRows: HashRow[] = [];
  let lastSource = "";

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
    lastRows = [
      ["SHA-256", sha256],
      ["HMAC-SHA256", hmacSha256],
      ["SHA-512", sha512],
      ["MD5", md5],
      ["SHA-1", sha1],
    ];
    lastSource = "Text input";
    win.setTableData("tbl_hashes", ["Algorithm / Primitive", "Computed Digest (Hex)"], lastRows);

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
      ...(describeJwtTimes(decoded.payload).length ? ["// Time claims:", ...describeJwtTimes(decoded.payload).map((l) => "// " + l)] : []),
    ].join("\n");

    win.setText("txt_cipher_text", report);
    win.appendConsole("crypto_console", `[JWT Decoded] Algorithm: ${decoded.header.alg}, Subject: ${decoded.payload.sub || "N/A"}\n`, 2);
    win.toast("JWT claims decoded");
  });

  win.onClick("btn_url_encode", () => {
    const input = win.getValue("txt_hash_input") || "";
    if (input.includes("%")) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(input);
      } catch {
        win.toast("Malformed percent-encoding; cannot decode");
        win.appendConsole("crypto_console", "[URL Decode Error] Malformed % sequence\n", 3);
        return;
      }
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

  // ---------------------------------------------------------------------------------------------
  // Productivity toolkit
  // ---------------------------------------------------------------------------------------------
  const HASH_HEADERS = ["Algorithm / Primitive", "Computed Digest (Hex)"];

  win.onClick("btn_browse_file", () => {
    win.openFile({ title: "Select a file to hash" }, (p) => {
      if (p) win.setValue("txt_file_path", p);
    });
  });

  win.onClick("btn_hash_file", async () => {
    const file = String(win.getValue("txt_file_path") || "").trim();
    if (!file) { win.toast("Choose a file first", 2500, "warning"); return; }
    if (!fs.existsSync(file)) { win.toast(`File not found: ${file}`, 3500, "error"); return; }
    try {
      win.setStatus("Hashing file...");
      const t0 = performance.now();
      const { rows, size } = await hashFile(file);
      lastRows = rows;
      lastSource = `${file} (${size} bytes)`;
      win.setTableData("tbl_hashes", HASH_HEADERS, rows);
      const ms = (performance.now() - t0).toFixed(1);
      win.appendConsole("crypto_console", `[File Hash] ${path.basename(file)} (${size} bytes) hashed in ${ms}ms; SHA-256 ${rows[0]![1]}\n`, 2);
      win.setStatus(`File hashed (${ms}ms)`);
      win.toast("File hashed", 2000, "success");
    } catch (e: any) {
      win.appendConsole("crypto_console", `[File Hash Error] ${e.message}\n`, 3);
      win.toast(`Could not hash file: ${e.message}`, 4000, "error");
    }
  });

  win.onClick("btn_verify_checksum", () => {
    if (lastRows.length === 0) { win.toast("Calculate hashes or hash a file first", 3000, "warning"); return; }
    const expected = String(win.getValue("txt_expected") || "");
    if (!expected.trim()) { win.toast("Paste the expected checksum first", 2500, "warning"); return; }
    const res = matchChecksum(expected, lastRows);
    if (res.match) {
      win.appendConsole("crypto_console", `[Checksum] MATCH (${res.match}) for ${lastSource}\n`, 2);
      win.setStatus(`Checksum verified: ${res.match} matches`);
      win.toast(`\u2714 Checksum matches (${res.match})`, 3500, "success");
    } else {
      win.appendConsole("crypto_console", `[Checksum] MISMATCH for ${lastSource}\n`, 3);
      win.setStatus("Checksum does NOT match any computed digest");
      win.toast("\u2716 Checksum does not match", 4000, "error");
    }
  });

  const digestText = () => (lastRows.length ? formatDigestReport(lastRows, lastSource) : "");
  win.onClick("btn_copy_digests", () => {
    const t = digestText();
    if (!t) { win.toast("Nothing to copy yet", 2500, "warning"); return; }
    win.copyToClipboard(t);
    win.toast("Digests copied", 2000, "success");
  });
  win.onClick("btn_save_digests", () => {
    const t = digestText();
    if (!t) { win.toast("Nothing to save yet", 2500, "warning"); return; }
    win.saveFile({ title: "Save digests", defaultName: "digests.txt", filter: "txt" }, (p) => {
      if (!p) return;
      try {
        fs.writeFileSync(p, t, "utf-8");
        win.toast(`Saved ${path.basename(p)}`, 3000, "success");
      } catch (e: any) {
        win.toast(`Save failed: ${e.message}`, 4000, "error");
      }
    });
  });

  win.onClick("btn_gen_password", () => {
    try {
      const len = clampPasswordLength(parseInt(String(win.getValue("txt_pw_len") || "20"), 10));
      const pw = generatePassword({
        length: len,
        lower: win.getBool("chk_pw_lower"),
        upper: win.getBool("chk_pw_upper"),
        digits: win.getBool("chk_pw_digits"),
        symbols: win.getBool("chk_pw_symbols"),
        noAmbiguous: win.getBool("chk_pw_noamb"),
      });
      win.setValue("txt_pw_out", pw);
      win.setValue("txt_pw_len", String(len));
      const e = estimateEntropy(pw);
      win.setText("lbl_entropy_out", `Entropy: ~${e.bits} bits (${e.strength})`);
      win.appendConsole("crypto_console", `[Password] Generated ${len}-char password (~${e.bits} bits)\n`, 1);
      win.toast("Password generated", 2000, "success");
    } catch (e: any) {
      win.toast(e.message, 3000, "warning");
    }
  });
  win.onClick("btn_copy_password", () => {
    const pw = String(win.getValue("txt_pw_out") || "");
    if (!pw) { win.toast("Generate a password first", 2500, "warning"); return; }
    win.copyToClipboard(pw);
    win.toast("Password copied", 2000, "success");
  });

  const transform = (label: string, fn: (s: string) => string) => {
    const input = String(win.getValue("txt_hash_input") || "");
    try {
      const out = fn(input);
      win.setText("txt_hash_input", out);
      win.appendConsole("crypto_console", `[${label}] ${input.length} -> ${out.length} chars\n`, 1);
      win.toast(`${label} done`, 1800, "success");
    } catch (e: any) {
      win.appendConsole("crypto_console", `[${label} Error] ${e.message}\n`, 3);
      win.toast(e.message, 3500, "error");
    }
  };
  win.onClick("btn_b64_encode", () => transform("Base64 Encode", toBase64));
  win.onClick("btn_b64_decode", () => transform("Base64 Decode", fromBase64));
  win.onClick("btn_hex_encode", () => transform("Hex Encode", toHex));
  win.onClick("btn_hex_decode", () => transform("Hex Decode", fromHex));

  win.onClick("btn_verify_jwt", () => {
    const token = String(win.getValue("txt_hash_input") || "").trim() || String(win.getValue("txt_cipher_text") || "").trim();
    const secret = String(win.getValue("txt_jwt_secret") || "");
    if (!token) { win.toast("Paste a JWT into the Input Payload first", 3000, "warning"); return; }
    if (!secret) { win.toast("Enter the JWT secret", 2500, "warning"); return; }
    const r = verifyJwtHmac(token, secret);
    win.appendConsole("crypto_console", `[JWT Verify] ${r.ok ? "VALID" : "INVALID"} (${r.alg})${r.reason ? " - " + r.reason : ""}\n`, r.ok ? 2 : 3);
    win.toast(r.ok ? `\u2714 Signature valid (${r.alg})` : `\u2716 ${r.reason}`, 4000, r.ok ? "success" : "error");
  });

  win.onClick("btn_copy_output", () => {
    const t = String(win.getValue("txt_cipher_text") || "");
    if (!t) { win.toast("Output box is empty", 2500, "warning"); return; }
    win.copyToClipboard(t);
    win.toast("Output copied", 2000, "success");
  });

  win.onClick("btn_clear_all", () => {
    for (const id of ["txt_hash_input", "txt_cipher_text", "txt_expected", "txt_file_path", "txt_pw_out", "txt_jwt_secret"]) win.setText(id, "");
    win.setTableData("tbl_hashes", HASH_HEADERS, []);
    win.clearConsole("crypto_console");
    lastRows = [];
    lastSource = "";
    win.toast("Cleared", 1500, "info");
  });

  win.onClick("btn_fullscreen", () => win.toggleFullscreen());

  return win;
}

if (import.meta.main) {
  const win = createCryptoStudio({ fullscreen: true });
  console.log("⚡ Launching Crypto Studio Pro (Fullscreen)...");
  win.run();
}
