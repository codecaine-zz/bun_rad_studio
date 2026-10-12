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
Version: 2.4.0  •  Engine: Native V8 ECMAScript RegExp Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:regex]  •  [Terminal CLI: bun run cli:regex]
\`\`\`

---

## 🌟 Executive Overview
**Regex Studio Pro** is an interactive regular expression testing, evaluation, match group dissection, and code generation workbench built natively for Bun RAD Studio. Designed to replace ad-supported online regex testers, it evaluates complex regular expressions in real time directly against your sample text with zero latency.

It features capture group breakdown tables, visual match highlighting, real-time string substitution previews, a built-in library of common production regex patterns, and instant code generation for TypeScript and JavaScript.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:regex
\`\`\`

### 2. Launch Terminal CLI Regex Evaluator
\`\`\`bash
# Test regex pattern against string in terminal
bun run cli:regex -p "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b" -t "test@example.com"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Regex Studio Desktop](../../screenshots/apps/regex_studio_desktop.png) | ![Regex Studio Responsive](../../screenshots/apps/regex_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Regex Pattern & Flags Toolbar
- **Regular Expression Pattern Input**: Text input for regex pattern (e.g. \`(\\w+):\\s*(\\d+)\`).
- **Flags Toggles**:
  - \`g\` (Global): Find all matches rather than stopping at the first.
  - \`i\` (Ignore Case): Case-insensitive matching.
  - \`m\` (Multiline): \`^\` and \`$\` match beginning and end of each line.
  - \`s\` (DotAll): Dot (\`.\`) matches newline characters.
  - \`u\` (Unicode): Full Unicode character class matching.
- **Pattern Presets Dropdown**: Instant presets for Email, URL, IPv4, UUID, SemVer, Dates, and Hex Colors.

### 2. Test String & Live Visual Match Inspector
- **Test String Editor**: Multi-line textarea to paste log files, source code, or sample inputs.
- **Visual Match Highlighting**: Matches are color-coded in yellow/cyan with clear boundary markers.
- **Match Telemetry Pill**: Displays total match count and evaluation duration in microseconds.

### 3. Match Groups & Capture Table
- **Interactive Match Table**: Lists Match Index, Full Match String, Start Index, End Index, and individual Capture Groups (\`$1\`, \`$2\`, etc.).
- **Named Capture Groups**: Automatically detects and displays \`(?<name>...)\` capture groups by name.

### 4. String Substitution & Code Generator
- **Replacement String Input**: Type substitution pattern with capture references (\`$1\`, \`$2\`, \`$<name>\`).
- **Substitution Preview Pane**: Live display of the replaced string.
- **TypeScript Code Generator**: Instant code snippet ready to paste into your codebase.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Parsing Key-Value Configurations with Capture Groups
1. Launch Regex Studio Pro: \`bun run app:regex\`.
2. In the **Pattern** field, enter:
   \`\`\`regex
   ^([A-Z_]+)=["']?([^"'\r\n]+)["']?$
   \`\`\`
3. Enable flags: \`g\` (Global) and \`m\` (Multiline).
4. Paste sample \`.env\` text into **Test String**:
   \`\`\`text
   DATABASE_PORT=5432
   NODE_ENV="production"
   API_KEY='secret_token_123'
   \`\`\`
5. Review the **Capture Groups Table**:
   - Match 1: \`$1 = DATABASE_PORT\`, \`$2 = 5432\`
   - Match 2: \`$1 = NODE_ENV\`, \`$2 = production\`
   - Match 3: \`$1 = API_KEY\`, \`$2 = secret_token_123\`
6. Click **Copy TypeScript Snippet** to paste working parser code into your project.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | Pattern / Test String | Force immediate re-evaluation |
| **Cmd + Shift + P** | Pattern Bar | Open Pattern Presets menu |
| **Cmd + Shift + C** | Generator | Copy TypeScript code snippet |
| **F11** or **F** | Global | Toggle borderless fullscreen |
`);

  console.log("✔ Developer Utilities (07 to 10) generated with AAA quality.");
}
