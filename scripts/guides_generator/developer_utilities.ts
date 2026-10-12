import { writeFileSync } from "fs";
import { join } from "path";

export function generateDeveloperUtilities(outDir: string) {
  // 07_api_studio.md
  writeFileSync(join(outDir, "07_api_studio.md"), `# 🌐 API Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: curl  •  Dependencies: 0  •  Local endpoints work offline
Launchers: [Desktop GUI: bun run app:api]  •  [Terminal CLI: bun run cli:api]
\`\`\`

---

## 🌟 Executive Overview
**API Studio Pro** is a desktop HTTP/REST client built into Bun RAD Studio. Requests are sent with the system \`curl\` binary, so what you test is exactly what \`curl\` would do. There is no account and no cloud sync. Your requests go only to the endpoints you type, and nothing is sent to any other server.

It covers the everyday jobs: sending requests with auth, reusing values through variables, importing a \`curl\` command copied from your browser, inspecting response headers, filtering JSON and load-testing an endpoint.

> Remote endpoints need an internet connection. Local endpoints (\`http://127.0.0.1:3000\`) work offline.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Desktop GUI
bun run app:api

# Interactive terminal client
bun run cli:api
\`\`\`

1. Pick a **Quick Endpoint** preset, or type a URL (\`localhost:3000/health\` and \`example.com\` get a scheme automatically).
2. Click **🚀 Send Request**.
3. Read the body, the **Response headers** table and the status line (code, latency, size).

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop | Responsive Viewport |
| :---: | :---: |
| ![API Studio Desktop](../../screenshots/apps/api_studio_desktop.png) | ![API Studio Responsive](../../screenshots/apps/api_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Presets, Auth & cURL
- **Quick Endpoints**: ready-made examples (JSONPlaceholder, GitHub, HTTPBin). Choosing one fills the form **and sends it immediately**.
- **Auth Mode + credential**: \`Bearer Token\`, \`Basic Auth\` (enter \`user:pass\`) or \`API Key Header\` (sent as \`X-API-Key\`).
- **📋 Copy cURL**: copies a reproducible \`curl\` command that includes your auth, query parameters, redirect/TLS/timeout options, and also logs it in the console.

### 2. Request
- **Method**, **Target URL** and **Headers** (one \`Key: Value\` per line).
- **Query parameters**: one \`key=value\` per line. They are appended to the URL and percent-encoded for you.
- **Request Body**: sent for \`POST\`, \`PUT\`, \`PATCH\` and \`DELETE\`. If you did not set a \`Content-Type\`, API Studio adds \`application/json\` for JSON bodies and \`text/plain\` otherwise. **✨ Format JSON Body** pretty-prints and validates it.
- **🚀 Send Request** and **⚡ Benchmark**.

### 3. Variables, Options & Import
- **Variables**: define \`NAME=value\` lines, then use \`{{NAME}}\` in the URL, headers, query, body or credential. Built-ins: \`{{$uuid}}\`, \`{{$timestamp}}\`, \`{{$isoTimestamp}}\`, \`{{$randomInt}}\`. If a variable is undefined the request is **blocked** with a message instead of being sent with a literal \`{{NAME}}\`.
- **Follow redirects**, **Ignore TLS certificate errors** (for self-signed dev servers only), **Pretty-print JSON** and **Timeout (s)**.
- **Benchmark requests / Concurrency**: how many requests to send (1-200) and how many at once (1-20).
- **⬇ Import cURL**: paste a command (for example Chrome DevTools → right-click request → *Copy as cURL*) and the method, URL, headers, body, basic-auth and options fill the form.

### 4. Response
- **Body viewer**: JSON is pretty-printed. Bodies larger than 1 MB are truncated on screen only. **Export** always saves the full response.
- **📋 Copy Response**, **💾 Export Response JSON** (asks where to save) and **Clear Response**.
- **Filter**: type a path such as \`.items[0].name\` and click **Apply Filter** to view just that part. Clear the filter and apply it again to see the full response.
- **Response headers** table and the console, which logs every dispatch and response.

### 5. Request History
- The last 30 requests are listed with method, URL, status and time. **Click a row** to restore its method, URL, headers and body. History is kept for the current session only. **Clear History** empties it.

### 6. Saving Your Work
- **💾 Save Request** remembers the current form for the next launch.
- **📄 Save Request File… / 📂 Open Request File…** store a request (including query and variables) as a \`.apireq.json\` file you can share. **Credentials are never written to these files.**

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Testing an Authenticated POST with Variables
1. Run \`bun run app:api\`.
2. In **Variables** enter \`host=https://httpbin.org\` and \`token=my-secret-jwt-token\`.
3. Set the method to **POST** and the URL to \`{{host}}/post\`.
4. Set **Auth Mode** to **Bearer Token** and the credential to \`{{token}}\`.
5. Enter a JSON body and click **✨ Format JSON Body**.
6. Click **🚀 Send Request**. Confirm \`200 OK\`, check the mirrored body, then read the \`Authorization\` header you sent in the response.
7. Click **📋 Copy cURL** to get the equivalent terminal command.

### Tutorial: Reproduce a Browser Request
1. In your browser, open DevTools → Network, right-click a request and choose **Copy as cURL**.
2. Paste into **Import cURL** and click **⬇ Import cURL**.
3. Click **🚀 Send Request**, then use **Filter** to pull out the field you care about.

### Tutorial: Quick Load Test
1. Set a **GET** URL and choose **Benchmark requests** (for example 50) and **Concurrency** (for example 5).
2. Click **⚡ Benchmark**. The console reports success count, min/avg/p50/p95/p99/max latency and requests per second.
3. For **POST**, **PUT**, **PATCH** and **DELETE** you are asked to confirm first, because they can change data on the server.

---

## 🔒 Safety Notes
- Only \`http://\` and \`https://\` URLs are accepted. \`file://\` and other schemes are refused, including through redirects.
- The credential field and variables are saved with the form when you use **💾 Save Request** or when the app remembers its state. Do not keep production secrets there on a shared computer.
- **Ignore TLS certificate errors** disables certificate checking for that request. Use it only for servers you trust.

---

## 💡 Pro Tips
- Use \`{{$uuid}}\` in a header such as \`X-Request-Id\` to get a unique value on every send.
- Switch off **Follow redirects** to see the \`302\` and its \`Location\` header.
- Lower the **Timeout** when testing flaky services so a hung request fails fast.
`);

  // 08_data_converter_studio.md
  writeFileSync(join(outDir, "08_data_converter_studio.md"), `# 🔄 Data Converter Studio -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Pure TypeScript Data Transformers  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:convert]  •  [Terminal CLI: bun run cli:convert]
\`\`\`

---

## 🌟 Executive Overview
**Data Converter Studio** is a multi-format data interchange workstation designed to seamlessly convert structured datasets across **CSV, TSV, JSON, YAML, Base64, and Markdown Tables**. Engineered with pure TypeScript data transformers, it eliminates external online conversion sites that compromise data privacy.

Whether converting spreadsheet exports into typed JSON, transforming API payloads into Markdown documentation tables, or encoding assets to Base64, Data Converter Studio provides instant, real-time bidirectional conversion.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:convert

# Shorthand alias
bun run app:dataconvert
\`\`\`

### 2. Launch Terminal CLI Converter Mode
\`\`\`bash
# Convert CSV file to JSON in terminal
bun run cli:convert input.csv --to json

# Convert JSON to Markdown table
bun run cli:convert users.json --to markdown
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Data Converter Desktop](../../screenshots/apps/dataconvert_studio_desktop.png) | ![Data Converter Responsive](../../screenshots/apps/dataconvert_studio_responsive.png) |

---

## 🧭 Supported Data Formats & Matrix

| Input Format | Output Formats Supported | Key Feature |
| :--- | :--- | :--- |
| **JSON** | CSV, TSV, YAML, Markdown Table, Base64 | Auto-detects array of objects vs nested trees. |
| **CSV** | JSON, TSV, YAML, Markdown Table | RFC 4180 compliant with escaped commas & quotes. |
| **TSV** | JSON, CSV, YAML, Markdown Table | Tab-delimited parsing ideal for spreadsheet copy-paste. |
| **YAML** | JSON, CSV, Markdown Table | Clean YAML 1.2 parsing and indentation formatting. |
| **Markdown** | JSON, CSV, TSV | Parses GitHub Flavored Markdown (GFM) pipe tables. |
| **Base64** | UTF-8 Text, Hex, Binary | Safe encoding/decoding with URL-safe variants. |

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Converting CSV to a Markdown Documentation Table
1. Launch Data Converter Studio: \`bun run app:convert\`.
2. Select **Source Format**: \`CSV\`.
3. Select **Target Format**: \`Markdown Table\`.
4. Paste your CSV data into the left pane:
   \`\`\`csv
   id,feature,status,priority
   1,OAuth 2.0,Completed,High
   2,Dark Mode,In Progress,Medium
   3,Stripe Billing,Pending,Critical
   \`\`\`
5. The right pane instantly renders a formatted GitHub-compatible Markdown table:
   \`\`\`markdown
   | id | feature | status | priority |
   | -- | ------- | ------ | -------- |
   | 1 | OAuth 2.0 | Completed | High |
   | 2 | Dark Mode | In Progress | Medium |
   | 3 | Stripe Billing | Pending | Critical |
   \`\`\`
6. Click **📋 Copy Output** to paste directly into your README or pull request description.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | Input Pane | Force immediate conversion |
| **Cmd + Shift + C** | Output Pane | Copy converted data to clipboard |
| **Cmd + Shift + X** | Global | Swap Source and Target formats |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Never Upload Sensitive Data to Web Converters**: Commercial web converters frequently log user data. Data Converter Studio runs 100% offline in local memory—ideal for converting proprietary databases, PII, financial spreadsheets, and credentials safely.
`);

  // 09_crypto_studio.md
  writeFileSync(join(outDir, "09_crypto_studio.md"), `# 🔐 Crypto Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native node:crypto & Web Crypto API  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:crypto]  •  [Terminal CLI: bun run cli:crypto]
\`\`\`

---

## 🌟 Executive Overview
**Crypto Studio Pro** is an enterprise cryptographic toolkit and security laboratory built natively on Bun's hardware-accelerated \`node:crypto\` and Web Crypto subsystems. It provides a tactile desktop workstation for hashing, HMAC signatures, symmetric AES encryption, JWT token inspection, and cryptographic UUID generation.

Engineered for security engineers, backend developers, and penetration testers, Crypto Studio Pro eliminates insecure web tools, ensuring all key derivations, hashes, and ciphertexts remain strictly in offline memory.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:crypto
\`\`\`

### 2. Launch Terminal CLI Cryptographic Utilities
\`\`\`bash
# Generate SHA-256 hash in terminal
bun run cli:crypto hash "Hello World" --algo sha256

# Generate UUID v4
bun run cli:crypto uuid
\`\`\`

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
- Decodes header and payload into readable JSON and lists the time claims (\`iat\`, \`nbf\`, \`exp\`) with relative times and an expired flag.

### 4. 🎲 Generators & Entropy
- **UUID v4**, **32-byte hex key**, **base64 256-bit key**, an **entropy check**, and **URL encode/decode**.

### 5. 🧰 Productivity Toolkit
- **File hashing**: type a path or click **Browse** to pick a file. SHA-256/512/384/1 and MD5 are computed in one streaming pass, so large files are fine.
- **Checksum verify**: paste an expected digest (uppercase, \`0x\` prefix, colons and spaces are accepted). It is matched against every non-HMAC digest.
- **Copy / Save digests**: copy the digest report or save it to a file.
- **Password generator**: length 4-256, lower/upper/digits/symbols, optional no look-alikes (\`O0l1I\`). Uses a CSPRNG, guarantees each selected class, and shows entropy.
- **Base64 / Hex**: encode or decode the Input Payload, with validation of malformed input.
- **JWT verify**: check an HS256/384/512 signature with a secret. Tokens with \`alg=none\` are rejected.
- **Copy Output / Clear All**.

---

## 🛠️ Step-by-Step Tutorial: Verify a Download
1. Launch with \`bun run app:crypto\`.
2. In the Productivity Toolkit click **Browse** and choose the downloaded file.
3. Click **Hash File**.
4. Paste the publisher's checksum into **Expected** and click **Verify Checksum**.
5. A match toast names the algorithm; a mismatch is reported as an error.

---

## 💡 Pro Tips & Best Practices
- **Privacy**: values typed into the app (including secrets and generated passwords) may be kept in the saved form state. Use **Clear All** after sensitive work.
- **MD5 and SHA-1 are not collision-resistant**: use them only for legacy checksums.
- **CBC provides no authentication**: do not rely on it to detect tampering.
`);

  // 10_regex_studio.md
  writeFileSync(join(outDir, "10_regex_studio.md"), `# 🎯 Regex Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: ECMAScript RegExp (Bun/JavaScriptCore)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:regex]  •  [Terminal CLI: bun run cli:regex]
\`\`\`

---

## 🌟 Executive Overview
**Regex Studio Pro** is a desktop workbench for writing and debugging regular expressions. It uses the JavaScript (ECMAScript) regex engine built into Bun, so results match what your TypeScript or JavaScript code will do. Everything runs locally and nothing is uploaded.

You get live match results as you type, a highlighted view of matches in context, a capture-group table with line and column positions, substitution preview, a plain-English pattern explainer, a library of ready-made patterns and code snippets for six languages.

> Other languages use different regex dialects. Snippets for Python, Go, Java and PHP are translated where it is safe to do so, and Go snippets warn when your pattern uses features Go does not support.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Desktop GUI
bun run app:regex

# Terminal evaluator
bun run cli:regex -p "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b" -t "test@example.com"
\`\`\`

1. Type a pattern, or pick one from **Preset Library**.
2. Paste or **load** your text into the corpus box. Matches update as you type.
3. Read the **Highlighted view** and the **matches table**.

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop | Responsive Viewport |
| :---: | :---: |
| ![Regex Studio Desktop](../../screenshots/apps/regex_studio_desktop.png) | ![Regex Studio Responsive](../../screenshots/apps/regex_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Pattern & Flags
- **Regex Pattern**: the expression, without surrounding slashes.
- **Flags**: Global (\`g\`), Case Insensitive (\`i\`), Multiline (\`m\`), DotAll (\`s\`) and Unicode (\`u\`).
- **Live results while typing**: re-evaluates on every edit. It pauses automatically for large text (over 100,000 characters) or patterns that look prone to catastrophic backtracking (nested quantifiers such as \`(a+)+\`). Click **⚡ Test Pattern** to run anyway.
- **🧠 Explain**: prints a token-by-token explanation of the pattern in the console.
- **📖 Cheat Sheet**: prints a quick syntax reference in the console.
- **Preset Library**: 14 patterns (email, IPv4, SemVer, UUID, URLs, ISO dates, hex colors, US phone numbers, HTML tags, duplicate words, MAC addresses, hashtags, quoted strings, surrounding whitespace). Picking one fills the pattern and tests it.
- The status bar shows pattern errors immediately, and the number of capture groups when the pattern is valid.

### 2. Test Corpus
- **Corpus box**: your sample text. **📂 Load Text File…** reads a file up to 5 MB.
- **Highlighted view**: your text with every match wrapped in \` « » \` so you can see matches in context.

### 3. Matches & Capture Groups
- The table lists match number, matched text, index, length, capture groups (numbered and named) and **Line:Col**. Results are capped at 1,000 matches.
- **Copy group #**: 0 copies every full match, one per line. A number copies that capture group from every match.
- **💾 Export Matches…** saves JSON, or CSV if you choose a \`.csv\` filename.
- **Preview Replace** applies the **Substitution** to the corpus. Use \`$1\`, \`$<name>\`, \`$&\` and \`$$\`. The result appears in the console. **Copy Replaced Text** and **Save Replaced Text…** keep it. Replace honours the Global flag, so without it only the first match changes.

### 4. Code Generator
- Choose TypeScript, JavaScript, Python, Go, Java or PHP and click **💻 Code Snippet**. The snippet is shown in the console and copied to your clipboard. Snippets always use global matching.

### 5. Workspaces
- **💾 Save Workspace** remembers the form for the next launch.
- **📄 Save Workspace File… / 📂 Open Workspace File…** store pattern, substitution, flags and corpus in a \`.regex.json\` file you can share.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Parsing Key-Value Configuration
1. Run \`bun run app:regex\`.
2. Enter the pattern \`^([A-Z_]+)=["']?([^"'\\r\\n]+)["']?$\` and turn on **Global** and **Multiline**.
3. Paste this into the corpus:
   \`\`\`text
   DATABASE_PORT=5432
   NODE_ENV="production"
   API_KEY='secret_token_123'
   \`\`\`
4. The table shows three matches with \`G1\` as the name and \`G2\` as the value.
5. Type \`2\` in **Copy group #** and click **Copy Matches** to copy just the values.
6. Choose **Python** and click **Code Snippet** to get ready-to-paste code.

### Tutorial: Understand an Unfamiliar Pattern
1. Paste the pattern into **Regex Pattern**.
2. Click **🧠 Explain** and read the indented breakdown in the console. Groups are indented so you can see the structure.

### Tutorial: Clean Up a File
1. **Load Text File…** and enter a pattern such as \`^\\s+|\\s+$\` (use the Multiline flag).
2. Leave **Substitution** empty and click **Preview Replace**, then **Save Replaced Text…**.

---

## 🔒 Safety Notes
- Evaluation runs in a background worker with a time limit (2 seconds for live results, 4 seconds for Test Pattern). If a pattern takes too long it is stopped and you get an error instead of a frozen window. The JavaScript engine also gives up on some runaway patterns by itself after about half a second, so a "no matches" result for a very complex pattern on long text may not be reliable.
- Your pattern and corpus are saved with the form state when you use **💾 Save Workspace**, so avoid putting secrets in the corpus.

---

## 💡 Pro Tips
- Turn off **Live results** when working with big files, then use **Test Pattern** when you are ready.
- Prefer lazy quantifiers (\`.*?\`) when matching between delimiters.
- A match with length 0 (for example \`x*\`) is normal: it means the pattern can match nothing at that position.
`);

  console.log("✔ Developer Utilities (07 to 10) generated with AAA quality.");
}
