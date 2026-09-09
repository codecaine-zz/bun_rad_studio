# 🔐 Crypto Studio Pro -- User Guide

**Crypto Studio Pro** is a comprehensive cryptographic workbench and security analysis tool. Built on native Node/Bun cryptographic primitives (`node:crypto` and `Bun.CryptoHasher`), it provides hardware-accelerated hashing, symmetric encryption, token inspection, password entropy analysis, and unique identifier generation.

---

## ⚡ Quick Start

```bash
bun run app:crypto
```

---

## 🖥️ User Interface Overview

Crypto Studio Pro organizes developer security tools into four high-utility panels:

1. **Cryptographic Hashes & Message Digests**:
   - **Algorithms**: SHA-256, SHA-512, MD5, SHA-1.
   - **Input Text Area**: Enter any string or raw text to hash.
   - **⚡ Calculate Hashes**: Computes all 4 hash variants simultaneously with sub-millisecond execution.
2. **HMAC Message Authentication**:
   - **Secret Key Input**: The symmetric HMAC secret key.
   - **Algorithm**: HMAC-SHA256.
   - **🔒 Generate HMAC**: Computes the authenticated message signature.
3. **AES-256-GCM Symmetric Encryption & Decryption**:
   - **Passphrase / Key Input**: Password used to derive encryption key via PBKDF2/SHA-256.
   - **🔒 Encrypt (AES-256-GCM)**: Produces an authenticated ciphertext payload containing initialization vector (IV), auth tag, and encrypted data.
   - **🔓 Decrypt**: Verifies the authentication tag and decrypts the ciphertext.
4. **JWT Inspector & Decoder**:
   - **JWT Input**: Paste standard base64-encoded JSON Web Tokens (`eyJ...`).
   - **Decoded Header & Payload View**: Formatted JSON displaying algorithm (`alg`), token type (`typ`), issuer (`iss`), subject (`sub`), audience (`aud`), expiration (`exp`), and issued-at (`iat`) with readable UTC dates.
5. **Security Utilities & Entropy Meter**:
   - **Password / Secret Input**: Test password strength against Shannon entropy formulas.
   - **Bit-Entropy Indicator**: Visual strength gauge (Weak, Moderate, Strong, Very Strong) with exact bit score.
   - **🎲 Generate UUID v4**: Produces cryptographically secure UUID version 4 strings.
   - **URL Encode / Decode**: Fast query string encoding and decoding.

---

## 📖 Practical Tutorials

### 1. Generating Hashes for File Verification
1. Paste a file's content or checksum string into the input text area.
2. Click **⚡ Calculate Hashes**.
3. Copy the SHA-256 or SHA-512 digest to compare against upstream release hashes.

### 2. Inspecting and Debugging an Expired JWT
1. Paste the bearer token into the **JWT Inspector** box.
2. The workstation decodes both the header and claims payload:
   ```json
   {
     "sub": "user_49821",
     "name": "Jane Doe",
     "role": "admin",
     "exp": 1788982800
   }
   ```
3. Crypto Studio Pro automatically parses `exp` and displays whether the token is currently active or expired.

### 3. Measuring Password Entropy
1. Type a candidate master password in the **Entropy Meter** box.
2. The bit calculator updates in real time:
   - `< 28 bits`: *Very Weak*
   - `28 - 35 bits`: *Weak*
   - `36 - 59 bits`: *Moderate*
   - `60 - 127 bits`: *Strong*
   - `128+ bits`: *Cryptographically Secure*

---

## 🛡️ Enterprise Resilience Features
- **Zero Insecure Algorithms for Encryption**: Encryption is standardized on AES-256-GCM with authenticated tags to prevent tampering and padding oracle attacks.
- **Hardware Acceleration**: Relies on Apple Silicon AES hardware instructions via OpenSSL/Bun bindings.
- **Client-Side Privacy**: All cryptographic operations occur strictly locally in memory. No keys or plaintexts ever touch the disk or network.
