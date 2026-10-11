# 🔑 Environment Vault Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native .env Parser & TypeScript Schema Gen  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:env]  •  [Terminal CLI: bun run cli:env]
```

---

## 🌟 Executive Overview
**Environment Vault Studio** is a secure desktop configuration editor, secret validator, and diff workbench for `.env` files. Designed to prevent production outages caused by missing environment variables, syntax errors, or mismatched `.env.example` keys, it gives developers a visual, audited interface for managing local secrets safely.

It includes secret masking toggles, duplicate key detection, automatic diffing against template files, and one-click generation of typed TypeScript configuration schemas (compatible with Zod and clean interfaces).

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:env
```

### 2. Launch Terminal CLI Environment Validator
```bash
# Validate .env against .env.example
bun run cli:env check .env --template .env.example

# Generate TypeScript types from .env
bun run cli:env types .env
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Environment Vault Desktop](../../screenshots/apps/env_studio_desktop.png) | ![Environment Vault Responsive](../../screenshots/apps/env_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. File Path & Security Bar
- **Environment File Input**: Path to target file (e.g. `./.env`, `./.env.local`, `./.env.production`).
- **Template File Input**: Path to example file (e.g. `./.env.example`).
- **👁️ Mask Secrets Toggle**: Toggles asterisks (`••••••••`) over secret values for safe screen sharing and presentations.

### 2. Environment Variables Grid
- **Key**: Name of the environment variable (checks uppercase conventions).
- **Value**: Current value with inline editing.
- **Status Badge**: Flags `MISSING IN EXAMPLE`, `DUPLICATE`, or `EMPTY`.
- **Delete / Add Key**: One-click row management.

### 3. Schema & Type Generator
- Generates strongly-typed TypeScript interfaces:
  ```typescript
  export interface ProcessEnv {
    PORT: string;
    DATABASE_URL: string;
    JWT_SECRET: string;
  }
  ```
