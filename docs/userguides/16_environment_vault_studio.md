# 🛡️ Environment Vault Studio -- User Guide

**Environment Vault Studio** is an enterprise `.env` file management, secret auditing, and multi-stage environment synchronization workbench. It provides syntax validation, sensitive secret detection and visual masking (`sk_live_...`, passwords, database credentials), and multi-environment diffing against `.env.example` to prevent missing configuration variables in production deployments.

---

## ⚡ Quick Start

```bash
bun run app:env
```

---

## 🖥️ User Interface Overview

1. **File Selection & Ingestion Bar**:
   - **Target File Path**: Path to the active environment file (defaults to `./.env`).
   - **Reference / Example File**: Path to the template or example file (defaults to `./.env.example`).
   - **📂 Load Environment**: Reads both files into the workbench.
   - **💾 Save Environment**: Writes validated updates back to disk atomically.
2. **Secret Masking & Security Controls**:
   - **Mask Sensitive Values (Toggle)**: Automatically conceals API keys, private keys, database URLs, and passwords behind visual masks (`••••••••` / `sk_live_••••`).
   - **👁️ Reveal All Secrets (Hold / Toggle)**: Temporarily unmasks all values for auditing.
   - **Secret Audit Badge**: Displays total detected high-risk credentials.
3. **Syntax & Key Validation Engine**:
   - **Detect Duplicate Keys**: Flags keys defined multiple times in the same `.env` file.
   - **Syntax Error Warnings**: Flags unquoted spaces, invalid characters, or malformed export statements.
4. **Multi-Environment Diff & Sync**:
   - **Missing Keys in .env**: Variables present in `.env.example` but missing from `.env` (prevents production crashes).
   - **Extra / Undocumented Keys**: Variables defined in `.env` but omitted from documentation.
   - **🛠️ Sync Missing Keys from Example**: Automatically inserts missing keys with default empty placeholders into `.env`.
   - **📝 Generate Clean .env.example**: Automatically generates an exportable `.env.example` template with all secret values stripped.
5. **Interactive Key-Value Table**:
   - Filterable, sortable table displaying:
     - `KEY`: Environment variable name.
     - `VALUE`: Masked or plain value.
     - `TYPE`: String, Number, Boolean, or Secret.
     - `STATUS`: Valid, Missing in Example, or Duplicate.

---

## 📖 Practical Tutorials

### 1. Auditing a Project for Missing Environment Variables
1. Launch Environment Vault Studio:
   ```bash
   bun run app:env
   ```
2. Click **📂 Load Environment**.
3. Check the **Environment Diff** panel:
   - If your `.env.example` defines `REDIS_URL` or `STRIPE_WEBHOOK_SECRET` and your local `.env` is missing it, a red **Missing Key** alert is displayed.
4. Click **🛠️ Sync Missing Keys from Example**.
5. The missing variables are appended to your `.env` editor so you can populate values safely.

### 2. Sanitizing and Generating a Production `.env.example` Template
1. Load your populated development `.env` containing real API keys and credentials.
2. Click **📝 Generate Clean .env.example**.
3. Environment Vault Studio strips all actual secrets (`sk_live_abc123` ➔ `your_stripe_key_here`, `db_pass_99` ➔ `password`) while preserving comments and variable names.
4. Click **Save to .env.example** to commit clean documentation to Git safely.

### 3. Masking Secrets During Video Presentations and Demos
1. Keep the **Mask Sensitive Values** checkbox enabled.
2. Open Environment Vault Studio during pairing sessions or screen shares.
3. All sensitive tokens (AWS, Stripe, OpenAI, Database passwords) remain completely obscured from view, preventing accidental secret leakage.

---

## 🛡️ Enterprise Resilience Features
- **Zero Network Transmission**: Never transmits environment variables over any network socket. All parsing is 100% local.
- **Atomic File Writing**: When saving `.env`, the file is written to a temporary file before atomic renaming, ensuring no data loss occurs if an editor crash or power cut happens during write.
- **Comment and Section Preservation**: Preserves custom `# Section` headers and comments within `.env` files.
