# 📦 App Bundler Studio -- User Guide

**App Bundler Studio** is a standalone binary compilation and native application packaging suite. Leveraging Bun's built-in `bun build --compile` engine, it compiles TypeScript applications into single-file native executables and packages them into self-contained macOS `.app` desktop bundles with custom icons and metadata.

---

## ⚡ Quick Start

```bash
bun run app:bundler
```

---

## 🖥️ User Interface Overview

1. **Application Selection, Browsing & Preset Loading**:
   - **Pre-Configured App Dropdown**: Quick-browse and select from detected Studio applications in `./applications/` (e.g. SQLite Studio, DevTools Studio, Redis Studio, etc.). Selecting an application automatically loads its entry script, infers the PascalCase application name, and updates compiler specs.
   - **📥 Load App**: Explicitly loads the selected application from the dropdown into the form fields.
   - **📂 Browse File... / 📂 Browse...**: Opens the native OS file picker (macOS Cocoa, Linux Zenity, Windows PowerShell) to select any TypeScript/JavaScript entry script from disk without typing.
   - **🔄 Rescan**: Refreshes the discovered list of studio applications in `./applications/`.
2. **Compilation Source & Output Options**:
   - **Entry Script**: Path to the TypeScript source file (auto-filled on browse or dropdown select).
   - **Application Name**: Clean PascalCase binary name (auto-derived from selected filename).
   - **Destination Directory**: Output directory (defaults to `./dist`).
3. **Compilation Flags & Target Matrix**:
   - **Target Architecture**:
     - `bun-darwin-arm64` (macOS Apple Silicon M1/M2/M3/M4)
     - `bun-darwin-x64` (macOS Intel)
     - `bun-linux-x64` (Linux 64-bit Server/Desktop)
     - `bun-windows-x64` (Windows 64-bit Executable)
   - **Bytecode Minification**: Strips whitespace, minifies symbols, and reduces executable size.
   - **Sourcemap Generation**: Optional embedded sourcemaps for production stack traces.
4. **macOS `.app` Bundle Packager & Icon Management**:
   - **Bundle Identifier**: Reverse-domain ID (e.g. `com.enterprise.radstudio`).
   - **Version String**: Semantic version (e.g. `1.0.0`).
   - **Pre-Configured Icon Dropdown**: Select from pre-made high-resolution icons in `./icons/` (e.g., `database_studio.icns`, `redis_studio.icns`, `system_studio.icns`, `devtools_studio.icns`, `app_default.icns`, etc.).
   - **Application Icon Path**: Path to `.icns`, `.png`, or `.ico` icon file.
   - **📂 Browse Icon...**: Opens the native OS file picker to choose any icon file from disk.
   - **Automatic Icon Conversion**: On macOS, PNG icons are automatically converted into multi-tier Apple `.icns` packages using `sips` and `iconutil`.
   - **Package as macOS .app**: Automatically constructs the required directory hierarchy and `Info.plist`:
     ```text
     MyApp.app/
       Contents/
         Info.plist
         MacOS/MyApp (Native Mach-O Binary)
         Resources/
           AppIcon.icns
           src/ide.html
     ```
5. **Compilation Actions**:
   - **⚡ Compile Standalone Binary**: Triggers native `bun build --compile`.
   - **📦 Build macOS .app Bundle**: Builds the binary and wraps it in the application bundle.
   - **📂 Open Output Directory**: Reveals the built binary in macOS Finder.
6. **Build Telemetry & Log Console**:
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
