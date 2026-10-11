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

### 1. 🔑 Cryptographic Hash & Digest Suite
- **Algorithms Supported**: `SHA-256`, `SHA-512`, `SHA-384`, `SHA-1`, `MD5`, `RIPEMD-160`.
- **HMAC Signatures**: Optional secret key input to calculate keyed-hash message authentication codes.
- **Output Formats**: Hexadecimal, Base64, and Base64URL.

### 2. 🛡️ Symmetric Cipher Lab (AES-256-GCM)
- **Encryption**: Encrypts plaintext using authenticated AES-256-GCM with automatically generated 12-byte initialization vectors (IV).
- **Authentication Tag**: Computes and verifies 16-byte authentication tags to guarantee integrity.
- **Decryption**: Verifies ciphertext integrity and decrypts back to original plaintext.

### 3. 🎫 JWT Decoder & Token Dissector
- **Header & Payload**: Decodes base64url JSON Web Tokens into formatted, inspectable JSON structures.
- **Expiration Diagnostics**: Calculates token validity, issue time (`iat`), and expiration timestamp (`exp`) with relative countdown.

### 4. 🎲 Secure Random & UUID Generator
- **UUID v4 & UUID v7**: Cryptographically secure random identifiers.
- **Random Byte Generator**: Generates cryptographically secure random bytes in Hex, Base64, or integer arrays.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Encrypting and Decrypting Confidential Credentials with AES-256-GCM
1. Launch Crypto Studio Pro: `bun run app:crypto`.
2. Select the **AES-256-GCM** tab.
3. Enter your secret passphrase in **Secret Key** (e.g. `super-secret-master-key-32ch!`).
4. Type your confidential message in **Plaintext**:
   ```text
   DATABASE_PASSWORD=postgres://admin:top_secret_99@prod.internal:5432/main
   ```
5. Click **🔒 Encrypt Plaintext**.
6. The workstation displays the combined ciphertext and authentication tag in Base64 format.
7. To verify, paste the generated ciphertext into the Decryption panel, provide the same key, and click **🔓 Decrypt Ciphertext** to recover the exact original text.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | Active Tab | Compute Hash / Encrypt / Decrypt |
| **Cmd + 1..4** / **Ctrl + 1..4** | Workspace | Switch between Hash, AES, JWT, and UUID |
| **Cmd + Shift + C** | Output | Copy active hash or ciphertext to clipboard |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Always Prefer AES-GCM over CBC**: AES-GCM is an AEAD (Authenticated Encryption with Associated Data) cipher. It protects both confidentiality and authenticity, preventing padding oracle attacks that affect older CBC modes.
