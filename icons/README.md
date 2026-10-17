# 🎨 Bun RAD Studio - Application Icons Directory

This directory contains application icons for compiling standalone macOS `.app` bundles, Windows executables, and Linux desktop packages.

## Shared release artwork

`desktop/` contains the exact artwork exported from the 65 macOS apps in the project's published [v1.3.0 release](https://github.com/codecaine-zz/bun_rad_studio/releases/tag/v1.3.0), plus a manifest of their application names. Each PNG is the original 1024-pixel image from `AppIcon.icns`; its ICO carries the original 32, 64, 128 and 256-pixel PNG frames. These are the project's icons, not replacements drawn to look similar.

All release builders reuse these assets. macOS converts the shared PNG to ICNS; Windows embeds the ICO in the File Manager executable even when cross-built on a Mac or Linux; full-suite Windows shortcuts and Linux menu entries use the same artwork. Known aliases reuse the matching application's icon. Missing artwork fails the build rather than silently falling back to Bun's logo.

To change a release icon, export the updated Mac artwork into the matching PNG and ICO in `desktop/`, keeping all ICO sizes, and update `desktop/manifest.json` for new applications or renamed titles. `scripts/release/iconDesigns.ts` and `iconRenderer.ts` remain the macOS drawing sources.

## 📂 Available Pre-Configured Icons
- **`app_default.icns` / `.png`**: Universal Bun RAD Studio application icon.
- **`database_studio.icns` / `.png`**: SQLite Studio Pro & Database Studio icon.
- **`redis_studio.icns` / `.png`**: Redis Studio Pro in-memory workstation icon.
- **`system_studio.icns` / `.png`**: System Information & Hardware Telemetry Studio icon.
- **`devtools_studio.icns` / `.png`**: DevTools & Developer CLI Studio icon.
- **`api_studio.icns` / `.png`**: API Testing Studio Pro icon.
- **`network_studio.icns` / `.png`**: Network Diagnostics & Forensics Studio icon.
- **`git_studio.icns` / `.png`**: Git Version Control Studio icon.
- **`crypto_studio.icns` / `.png`**: Cryptography & Hashing Studio icon.
- **`color_studio.icns` / `.png`**: Color Palette & Design Token Studio icon.

## 📥 Adding Custom Icons
You can drop any custom `.icns` or `.png` (512x512 recommended) file into this folder.
In **App Bundler Studio Pro**, select your custom icon from the dropdown or click **📂 Browse Icon...** to pick any icon from disk.
When packaging a macOS `.app` bundle, PNG icons are automatically converted to native multi-resolution Apple `.icns` bundles.
