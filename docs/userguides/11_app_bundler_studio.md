# 📦 App Bundler Studio -- User Guide

**App Bundler Studio** is a standalone binary compilation and native application packaging suite. Leveraging Bun's built-in `bun build --compile` engine, it compiles TypeScript applications into single-file native executables and packages them into self-contained macOS `.app` desktop bundles with custom icons and metadata.

---

## ⚡ Quick Start

```bash
bun run app:bundler
```

---

## 🖥️ User Interface Overview

1. **Compilation Source & Output Options**:
   - **Entrypoint File**: Path to the TypeScript source file (e.g. `./index.ts`, `./applications/database_studio.ts`).
   - **Output Binary Name**: Target binary name (e.g. `bun_rad_studio`, `sqlite_studio_app`).
   - **Destination Directory**: Output directory (defaults to `./dist`).
2. **Compilation Flags & Target Matrix**:
   - **Target Architecture**:
     - `bun-darwin-arm64` (macOS Apple Silicon M1/M2/M3/M4)
     - `bun-darwin-x64` (macOS Intel)
     - `bun-linux-x64` (Linux 64-bit Server/Desktop)
     - `bun-windows-x64` (Windows 64-bit Executable)
   - **Bytecode Minification**: Strips whitespace, minifies symbols, and reduces executable size.
   - **Sourcemap Generation**: Optional embedded sourcemaps for production stack traces.
3. **macOS `.app` Bundle Packager**:
   - **Bundle Identifier**: Reverse-domain ID (e.g. `com.enterprise.radstudio`).
   - **Version String**: Semantic version (e.g. `1.0.0`).
   - **App Icon File**: Path to `.icns` or `.png` icon.
   - **Package as macOS .app**: Automatically constructs the required directory hierarchy:
     ```text
     MyApp.app/
       Contents/
         Info.plist
         MacOS/MyApp (Native Binary)
         Resources/AppIcon.icns
     ```
4. **Compilation Actions**:
   - **⚡ Compile Standalone Binary**: Triggers native `bun build --compile`.
   - **📦 Build macOS .app Bundle**: Builds the binary and wraps it in the application bundle.
   - **📂 Open Output Directory**: Reveals the built binary in macOS Finder.
5. **Build Telemetry & Log Console**:
   - Real-time compiler output, binary file size in megabytes, and build duration in milliseconds.

---

## 📖 Practical Tutorials

### 1. Compiling a Single-File Native Binary for macOS Apple Silicon
1. Set **Entrypoint File** to:
   ```text
   ./applications/sqlite_studio.ts
   ```
2. Set **Output Binary Name** to:
   ```text
   sqlite_studio
   ```
3. Ensure **Target Architecture** is set to `bun-darwin-arm64`.
4. Enable **Bytecode Minification**.
5. Click **⚡ Compile Standalone Binary**.
6. The compiler packages the Bun runtime, JavaScript engine, and TypeScript code into a single executable in `./dist/sqlite_studio` that runs on any macOS machine without Bun installed!

### 2. Packaging an Application into a macOS `.app`
1. Check **Package as macOS .app**.
2. Enter **Bundle Identifier**: `com.mycompany.sqlitestudio`.
3. Click **📦 Build macOS .app Bundle**.
4. The studio generates `./dist/sqlite_studio.app`, complete with `Info.plist` and executable permissions. You can drag and drop it into `/Applications`.

---

## 🛡️ Enterprise Resilience Features
- **Zero External Compilers**: Uses Bun's native single-file executable generator. No GCC, Clang, or Xcode required for standard CLI compilation.
- **Cross-Compilation Ready**: Compiles binaries for Linux servers directly from a macOS developer workstation.
- **Atomic Build Isolation**: Builds in temporary working directories and atomically moves the final output to `./dist` to prevent corrupt binaries if interrupted.
