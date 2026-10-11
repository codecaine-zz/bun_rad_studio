import { writeFileSync } from "fs";
import { join } from "path";

export function generateDeveloperUtilities(outDir: string) {
  // 07_api_studio.md
  writeFileSync(join(outDir, "07_api_studio.md"), `# 🌐 API Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native fetch & Web Standards  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:api]  •  [Terminal CLI: bun run cli:api]
\`\`\`

---

## 🌟 Executive Overview
**API Studio Pro** is an enterprise-grade REST and HTTP API testing client built natively into Bun RAD Studio. Designed as a lightweight, private, and instant alternative to heavy electronic tools like Postman and Insomnia, it operates with zero cloud telemetry, stores all requests locally on your machine, and executes requests at native Bun HTTP speeds.

Whether testing local development endpoints (\`http://127.0.0.1:3000\`), inspecting third-party OAuth microservices, analyzing response headers, or generating ready-to-paste \`cURL\` commands, API Studio Pro delivers a responsive, privacy-first developer experience.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:api
\`\`\`

### 2. Launch Terminal CLI HTTP Client Mode
\`\`\`bash
# Fast GET request via CLI
bun run cli:api "https://api.github.com/users/octocat"

# POST request with JSON payload via CLI
bun run cli:api -X POST "https://httpbin.org/post" -d '{"hello":"world"}'
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![API Studio Desktop](../../screenshots/apps/api_studio_desktop.png) | ![API Studio Responsive](../../screenshots/apps/api_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Request Address & Method Bar
- **HTTP Method Selector**: Dropdown supporting \`GET\`, \`POST\`, \`PUT\`, \`DELETE\`, \`PATCH\`, \`HEAD\`, and \`OPTIONS\`.
- **URL Endpoint Bar**: Complete URL input supporting query strings, ports, and protocols.
- **⚡ Send Request Button (Cmd+Enter)**: Executes the HTTP request and starts high-precision latency measurement.
- **cURL Generator Button**: Converts the configured method, headers, and body into a reproducible \`curl\` command string.

### 2. Request Configuration Tabs
- **Headers Tab**: Key-value table for standard and custom headers (e.g. \`Content-Type: application/json\`, \`User-Agent\`).
- **Query Params Tab**: Interactive key-value editor that automatically encodes and syncs with the URL address bar.
- **Body Editor Tab**: Multi-line editor for \`JSON\`, \`Form-Data\`, \`Text\`, or \`GraphQL\` payloads with formatting validation.
- **Auth Preset Tab**: Supports \`No Auth\`, \`Bearer Token\`, \`Basic Auth\` (Base64 username/password), and \`API Key\`.

### 3. Response Telemetry & Inspector Panel
- **Status Code Pill**: Visual badge displaying HTTP status code and message (e.g. \`200 OK\`, \`404 Not Found\`, \`500 Internal Error\`) color-coded green, yellow, or red.
- **Latency & Size Metrics**: Displays exact round-trip time in milliseconds (e.g., \`48ms\`) and payload size in KB/MB.
- **Response Body Viewer**: Formatted, syntax-highlighted response viewer with collapsible JSON nodes and search.
- **Response Headers Table**: Displays all incoming HTTP headers (Cache-Control, Content-Type, CORS, etc.).

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Testing an Authenticated POST Endpoint
1. Launch API Studio Pro: \`bun run app:api\`.
2. Change the method dropdown to **POST**.
3. Enter URL: \`https://httpbin.org/post\`.
4. Switch to the **Auth Preset Tab**, select **Bearer Token**, and enter \`my-secret-jwt-token\`.
5. Switch to the **Body Editor Tab** and enter:
   \`\`\`json
   {
     "action": "create_user",
     "email": "developer@example.com"
   }
   \`\`\`
6. Click **⚡ Send Request** (or press \`Cmd+Enter\`).
7. Review the response in the bottom panel; confirm status \`200 OK\` and inspect the mirrored payload.
8. Click **cURL Generator** to copy the equivalent terminal command.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | URL / Body | Execute HTTP Request |
| **Cmd + L** / **Ctrl + L** | Global | Focus URL address bar |
| **Cmd + Shift + C** | Response Pane | Copy formatted response to clipboard |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Zero Cloud Leakage**: Unlike cloud-synced API clients, API Studio Pro never transmits your secret API keys, staging tokens, or customer payloads to external third-party servers. All request history remains 100% on your local machine.
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

### 1. 🔑 Cryptographic Hash & Digest Suite
- **Algorithms Supported**: \`SHA-256\`, \`SHA-512\`, \`SHA-384\`, \`SHA-1\`, \`MD5\`, \`RIPEMD-160\`.
- **HMAC Signatures**: Optional secret key input to calculate keyed-hash message authentication codes.
- **Output Formats**: Hexadecimal, Base64, and Base64URL.

### 2. 🛡️ Symmetric Cipher Lab (AES-256-GCM)
- **Encryption**: Encrypts plaintext using authenticated AES-256-GCM with automatically generated 12-byte initialization vectors (IV).
- **Authentication Tag**: Computes and verifies 16-byte authentication tags to guarantee integrity.
- **Decryption**: Verifies ciphertext integrity and decrypts back to original plaintext.

### 3. 🎫 JWT Decoder & Token Dissector
- **Header & Payload**: Decodes base64url JSON Web Tokens into formatted, inspectable JSON structures.
- **Expiration Diagnostics**: Calculates token validity, issue time (\`iat\`), and expiration timestamp (\`exp\`) with relative countdown.

### 4. 🎲 Secure Random & UUID Generator
- **UUID v4 & UUID v7**: Cryptographically secure random identifiers.
- **Random Byte Generator**: Generates cryptographically secure random bytes in Hex, Base64, or integer arrays.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Encrypting and Decrypting Confidential Credentials with AES-256-GCM
1. Launch Crypto Studio Pro: \`bun run app:crypto\`.
2. Select the **AES-256-GCM** tab.
3. Enter your secret passphrase in **Secret Key** (e.g. \`super-secret-master-key-32ch!\`).
4. Type your confidential message in **Plaintext**:
   \`\`\`text
   DATABASE_PASSWORD=postgres://admin:top_secret_99@prod.internal:5432/main
   \`\`\`
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
