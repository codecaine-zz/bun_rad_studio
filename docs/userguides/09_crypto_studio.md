# 🔐 Crypto Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native node:crypto & Web Crypto API  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:crypto]  •  [Terminal CLI: bun run cli:crypto]
```

---

## 🌟 Executive Overview
**Crypto Studio Pro** is an enterprise cryptographic toolkit and security laboratory built natively on Bun's hardware-accelerated `node:crypto` and Web Crypto subsystems. It provides a tactile desktop workstation for hashing, HMAC signatures, symmetric AES encryption, JWT token inspection, and cryptographic UUID generation.

Engineered for security engineers, backend developers, and penetration testers, Crypto Studio Pro eliminates insecure web tools, ensuring all key derivations, hashes, and ciphertexts remain strictly in offline memory.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:crypto
```

### 2. Launch Terminal CLI Cryptographic Utilities
```bash
# Generate SHA-256 hash in terminal
bun run cli:crypto hash "Hello World" --algo sha256

# Generate UUID v4
bun run cli:crypto uuid
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Crypto Studio Desktop](../../screenshots/apps/crypto_studio_desktop.png) | ![Crypto Studio Responsive](../../screenshots/apps/crypto_studio_responsive.png) |

---

## 🧭 Complete Cryptographic Workspaces

### 1. 🔑 Hash & HMAC Table
- Enter text in **Input Payload** (and optionally a secret) and compute **SHA-256, HMAC-SHA256, SHA-512, MD5, SHA-1** in one table.

### 2. 🛡️ AES-256 Cipher (CBC / PKCS7)
- **Encrypt / Decrypt** the payload with a passphrase-derived key. Decryption fails cleanly on a wrong key.

### 3. 🎫 JWT Decoder
- Decodes header and payload into readable JSON and lists the time claims (`iat`, `nbf`, `exp`) with relative times and an expired flag.

### 4. 🎲 Generators & Entropy
- **UUID v4**, **32-byte hex key**, **base64 256-bit key**, an **entropy check**, and **URL encode/decode**.

### 5. 🧰 Productivity Toolkit
- **File hashing**: type a path or click **Browse** to pick a file. SHA-256/512/384/1 and MD5 are computed in one streaming pass, so large files are fine.
- **Checksum verify**: paste an expected digest (uppercase, `0x` prefix, colons and spaces are accepted). It is matched against every non-HMAC digest.
- **Copy / Save digests**: copy the digest report or save it to a file.
- **Password generator**: length 4-256, lower/upper/digits/symbols, optional no look-alikes (`O0l1I`). Uses a CSPRNG, guarantees each selected class, and shows entropy.
- **Base64 / Hex**: encode or decode the Input Payload, with validation of malformed input.
- **JWT verify**: check an HS256/384/512 signature with a secret. Tokens with `alg=none` are rejected.
- **Copy Output / Clear All**.

---

## 🛠️ Step-by-Step Tutorial: Verify a Download
1. Launch with `bun run app:crypto`.
2. In the Productivity Toolkit click **Browse** and choose the downloaded file.
3. Click **Hash File**.
4. Paste the publisher's checksum into **Expected** and click **Verify Checksum**.
5. A match toast names the algorithm; a mismatch is reported as an error.

---

## 💡 Pro Tips & Best Practices
- **Privacy**: values typed into the app (including secrets and generated passwords) may be kept in the saved form state. Use **Clear All** after sensitive work.
- **MD5 and SHA-1 are not collision-resistant**: use them only for legacy checksums.
- **CBC provides no authentication**: do not rely on it to detect tampering.
