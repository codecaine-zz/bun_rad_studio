import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { stdlib } from "../src/simplecli/stdlib";

export function createCryptoStudio(): SimpleWindow {
  const win = newSimpleWindow("Crypto & Security Studio -- Encryption, Hashes & Keys", 1140, 920, {
    appId: "crypto_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  // Title Row
  win.beginRow();
  win.addHeading("Crypto & Security Studio");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center");
  win.endRow();

  // Hash Generator Group
  win.beginGroupBox("Cryptographic Hashing (SHA-256, SHA-512, MD5)");
  win.beginRow();
  win.addLabel("lbl_hash_input", "Input String / Payload:");
  win.addInput("txt_hash_input", "The quick brown fox jumps over the lazy dog");
  win.addButton("btn_calc_hashes", "⚡ Calculate Hashes");
  win.endRow();

  win.addTable("tbl_hashes", ["Algorithm", "Digest (Hex)"], [
    ["SHA-256", "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"],
    ["SHA-512", "07e547d9586f6a73f73fbac0435ed76951218fb7d0c8d788a30f761b4028608b..."],
    ["MD5", "9e107d9d372bb6826bd81d3542a419d6"],
    ["SHA-1", "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12"],
  ]);
  win.endGroupBox();

  // AES-256 Encryption & Decryption
  win.beginGroupBox("AES-256 Symmetric Cipher (CBC with PKCS7)");
  win.beginRow();
  win.addLabel("lbl_passphrase", "Secret Passphrase:");
  win.addInput("txt_passphrase", "super-secret-vault-key-2026");
  win.addButton("btn_encrypt", "🔒 Encrypt Payload");
  win.addButton("btn_decrypt", "🔓 Decrypt Payload");
  win.endRow();

  win.addLabel("lbl_cipher_text", "Ciphertext (Base64 Encoded):");
  win.addTextarea("txt_cipher_text", "");
  win.endGroupBox();

  // Key & Token Generation
  win.beginGroupBox("Entropy & Secret Key Generation");
  win.beginRow();
  win.addButton("btn_gen_uuid", "🎲 New UUID v4");
  win.addButton("btn_gen_hex32", "🔑 32-Byte Hex Key");
  win.addButton("btn_gen_b64", "📦 Base64 256-bit Key");
  win.addLabel("lbl_token_out", "Generated Token: (Click button above)");
  win.endRow();
  win.endGroupBox();

  // Console Telemetry
  win.beginGroupBox("Cryptographic Activity Console");
  win.addConsole("crypto_console", 70);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  OpenSSL / WebCrypto Native Acceleration Active");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Crypto Studio state saved successfully!");
  });

  win.onClick("btn_calc_hashes", () => {
    const text = win.getValue("txt_hash_input") || "";
    const sha256 = stdlib.sha256(text);
    const sha512 = stdlib.sha512(text);
    const md5 = stdlib.md5(text);
    const sha1 = stdlib.sha1(text);

    win.setTableData("tbl_hashes", ["Algorithm", "Digest (Hex)"], [
      ["SHA-256", sha256],
      ["SHA-512", sha512.slice(0, 64) + "..."],
      ["MD5", md5],
      ["SHA-1", sha1],
    ]);
    win.appendConsole("crypto_console", `[Hashes] Computed SHA-256/512, MD5, SHA-1 for payload (${text.length} chars)\n`, 2);
    win.setStatus("Hashes computed");
  });

  win.onClick("btn_encrypt", () => {
    const text = win.getValue("txt_hash_input") || "";
    const pass = win.getValue("txt_passphrase") || "";
    if (!text || !pass) return;

    try {
      const encrypted = stdlib.aesEncrypt(text, pass);
      win.setText("txt_cipher_text", encrypted);
      win.appendConsole("crypto_console", `[AES-256] Successfully encrypted payload -> ${encrypted.length} chars Base64\n`, 2);
      win.setStatus("Encrypted successfully");
    } catch (e: any) {
      win.appendConsole("crypto_console", `[AES-256 Error] ${e.message}\n`, 3);
      win.setStatus(`Encryption Error: ${e.message}`);
    }
  });

  win.onClick("btn_decrypt", () => {
    const cipher = win.getValue("txt_cipher_text") || "";
    const pass = win.getValue("txt_passphrase") || "";
    if (!cipher || !pass) return;

    try {
      const decrypted = stdlib.aesDecrypt(cipher, pass);
      win.setText("txt_hash_input", decrypted);
      win.appendConsole("crypto_console", `[AES-256] Successfully decrypted -> "${decrypted}"\n`, 2);
      win.setStatus("Decrypted successfully");
    } catch (e: any) {
      win.appendConsole("crypto_console", `[AES-256 Decrypt Error] ${e.message}\n`, 3);
      win.setStatus(`Decryption Error: ${e.message}`);
    }
  });

  win.onClick("btn_gen_uuid", () => {
    const uuid = crypto.randomUUID();
    win.setText("lbl_token_out", `UUID: ${uuid}`);
    win.appendConsole("crypto_console", `[UUID] Generated: ${uuid}\n`, 1);
  });

  win.onClick("btn_gen_hex32", () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    win.setText("lbl_token_out", `32-Byte Hex: ${hex}`);
    win.appendConsole("crypto_console", `[Hex Key] Generated: ${hex}\n`, 1);
  });

  win.onClick("btn_gen_b64", () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const b64 = Buffer.from(bytes).toString("base64");
    win.setText("lbl_token_out", `Base64 Key: ${b64}`);
    win.appendConsole("crypto_console", `[Base64 Key] Generated: ${b64}\n`, 1);
  });

  return win;
}

if (import.meta.main) {
  const win = createCryptoStudio();
  console.log("Launching Crypto & Security Studio...");
  win.run();
}
