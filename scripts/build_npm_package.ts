#!/usr/bin/env bun
/**
 * ⚡ Bun RAD Studio / Codecaine Utility Suite — Publish-Ready npm & Bun Package Builder
 *
 * Builds a compact, self-contained, cross-platform npm/Bun package in `dist/npm/`
 * (`bun-rad-studio`) supporting BOTH:
 *   • `bun add -g bun-rad-studio`  / `bunx bun-rad-studio`
 *   • `npm install -g bun-rad-studio` / `npx bun-rad-studio`
 *   • Library imports: `import { ... } from "bun-rad-studio"` & `"bun-rad-studio/simplegui"`
 *
 * Usage:
 *   bun run scripts/build_npm_package.ts           # Build dist/npm/
 *   bun run scripts/build_npm_package.ts --pack    # Build dist/npm/ and pack .tgz tarball
 */

import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { buildWrapperDefinitions } from "./generate_brew_suite.ts";
import { listSourceApps, ROOT, VERSION } from "./release/common.ts";

export interface BuildNpmOptions {
  outDir?: string;
  pack?: boolean;
  quiet?: boolean;
}

export interface BuildNpmResult {
  outDir: string;
  version: string;
  guiCount: number;
  cliCount: number;
  demoCount: number;
  binCount: number;
  tarballPath?: string;
}

const WORKER_ENTRIES = [
  {
    name: "fmFindWorker",
    source: "src/features/filemanager/fmFindWorker.ts",
  },
  {
    name: "fmConvWorker",
    source: "src/features/filemanager/fmConvWorker.ts",
  },
  {
    name: "fmSdWorker",
    source: "src/features/filemanager/fmSdWorker.ts",
  },
  {
    name: "regex_worker",
    source: "src/regex_worker.ts",
  },
] as const;

const WEBVIEW_LIBS = [
  "libwebview.dylib",
  "libwebview-x64.so",
  "libwebview-arm64.so",
  "libwebview.dll",
] as const;

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Bun bundler plugin tailored for code-split (`splitting: true`) npm/Bun packages:
 *  1. Replaces `webview-bun`'s native loader with a lazy, multi-OS `WEBVIEW_PATH` / `lib/` resolver
 *     (incorporating our `webview-bun` patch and ensuring headless CLI tools never touch GTK/WebKit).
 *  2. Preserves `import.meta.main` guards even when shared modules (like `index.ts` or `launcher_studio.ts`)
 *     are extracted into `dist/npm/_chunks/*.js`.
 *  3. Rewrites sidecar (`ide.html`, `postgres_designer.js`) and Worker (`fm*Worker`, `regex_worker`) paths
 *     so they resolve cleanly from `dist/npm/_chunks/`, `dist/npm/apps/`, and `dist/npm/index.js`.
 */
function createNpmBundlePlugin(
  entryTargetsBySourcePath: Map<string, string[]>,
): import("bun").BunPlugin {
  const indexSourcePath = resolve(ROOT, "index.ts");
  const pgDesignerSourcePath = resolve(
    ROOT,
    "applications",
    "postgres_studio_designer.ts",
  );
  const workerRunners = new Set([
    resolve(ROOT, "src/features/filemanager/fmFindRun.ts"),
    resolve(ROOT, "src/features/filemanager/fmConvRun.ts"),
    resolve(ROOT, "src/features/filemanager/fmSdRun.ts"),
    resolve(ROOT, "src/regex_tools.ts"),
  ]);

  return {
    name: "codecaine-npm-bundle",
    setup(build) {
      // 1. Lazy cross-platform webview-bun FFI resolver
      build.onLoad(
        { filter: /webview-bun[\\/]src[\\/]ffi\.ts$/ },
        ({ path }) => {
          const source = readFileSync(path, "utf8");
          const fileExpr =
            'process.platform === "win32" ? "libwebview.dll" : process.platform === "darwin" ? "libwebview.dylib" : `libwebview-${process.arch}.so`';
          const replacement = [
            `import { join as __join } from "node:path";`,
            `import { existsSync as __existsSync } from "node:fs";`,
            `const __wvFile = ${fileExpr};`,
            `const __wvCand1 = __join(import.meta.dir, "lib", __wvFile);`,
            `const __wvCand2 = __join(import.meta.dir, "..", "lib", __wvFile);`,
            `const lib_file = { default: process.env.WEBVIEW_PATH || (__existsSync(__wvCand1) ? __wvCand1 : __wvCand2) };`,
            "",
            "",
          ].join("\n");
          const patched = source.replace(
            /let lib_file;[\s\S]*?(?=export const lib = dlopen)/,
            replacement,
          );
          if (patched === source) {
            throw new Error(
              "webview-bun's ffi.ts layout changed; update createNpmBundlePlugin in scripts/build_npm_package.ts",
            );
          }
          const lazy = patched.replace(
            "export const lib = dlopen(",
            "const loadLibrary = () => dlopen(",
          );
          return {
            contents: `${lazy}
let nativeLibrary: ReturnType<typeof loadLibrary> | undefined;
export const lib = {
  get symbols() { return (nativeLibrary ??= loadLibrary()).symbols; },
  close() { nativeLibrary?.close(); },
};
`,
            loader: "ts",
          };
        },
      );

      // 2. Source transforms for entrypoints, sidecars, and workers
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, ({ path }) => {
        const absPath = resolve(path);
        const relTargets = entryTargetsBySourcePath.get(absPath);
        const isIndex = absPath === indexSourcePath;
        const isPgDesigner = absPath === pgDesignerSourcePath;
        const isWorkerRunner = workerRunners.has(absPath);

        if (!relTargets && !isIndex && !isPgDesigner && !isWorkerRunner) {
          return undefined;
        }

        let source = readFileSync(absPath, "utf8").replace(
          /^#![^\r\n]*(?:\r?\n|$)/,
          "",
        );

        if (isIndex) {
          // Ensure getIdeHtml() also checks ../src/ide.html when index.ts is code-split into _chunks/
          source = source.replace(
            'join(import.meta.dir, "src", "ide.html"),',
            'join(import.meta.dir, "src", "ide.html"),\n    join(import.meta.dir, "..", "src", "ide.html"),',
          );
          // Ensure RAD Designer Live Preview imports index.js when running from bundled package
          source = source.replace(
            'join(import.meta.dir, "index.ts")',
            '(existsSync(join(import.meta.dir, "index.ts")) ? join(import.meta.dir, "index.ts") : existsSync(join(import.meta.dir, "index.js")) ? join(import.meta.dir, "index.js") : join(import.meta.dir, "..", "index.js"))',
          );
        }

        if (isPgDesigner) {
          source = [
            `import { existsSync, readFileSync } from "node:fs";`,
            `import { resolve } from "node:path";`,
            `const __pgCandidates = [`,
            `  resolve(import.meta.dir, "postgres_designer.js"),`,
            `  resolve(import.meta.dir, "..", "apps", "postgres_designer.js"),`,
            `];`,
            `const __pgPath = __pgCandidates.find((p) => existsSync(p)) ?? __pgCandidates[0]!;`,
            `export const POSTGRES_DESIGNER_SCRIPT = readFileSync(__pgPath, "utf8");`,
          ].join("\n");
        }

        if (isWorkerRunner) {
          source = source.replace(
            /new URL\("\.\/(fmFindWorker|fmConvWorker|fmSdWorker|regex_worker)\.ts",\s*import\.meta\.url\)/g,
            'new URL("../workers/$1.js", import.meta.url)',
          );
        }

        if (relTargets && /\bimport\.meta\.main\b/.test(source)) {
          const targetsLit = JSON.stringify(relTargets);
          const helper = [
            `const __npmEntryTargets = ${targetsLit};`,
            `const __isNpmEntry = (__directMain: boolean): boolean => {`,
            `  if (__directMain) return true;`,
            `  const __active = (globalThis as any).__CODECAINE_ENTRY;`,
            `  if (typeof __active === "string") return __npmEntryTargets.includes(__active);`,
            `  const __main = typeof Bun !== "undefined" && typeof Bun.main === "string" ? Bun.main.replace(/\\\\/g, "/") : "";`,
            `  return __main ? __npmEntryTargets.some((t: string) => __main.endsWith("/" + t)) : false;`,
            `};`,
          ].join("\n");
          source = `${helper}\n${source.replace(
            /\bimport\.meta\.main\b/g,
            "__isNpmEntry(import.meta.main)",
          )}`;
        }

        return {
          contents: source,
          loader: absPath.endsWith(".tsx")
            ? "tsx"
            : absPath.endsWith(".ts")
              ? "ts"
              : "js",
        };
      });
    },
  };
}

function renderRunnerMjs(version: string): string {
  return `// Universal Bun + Node.js launcher runtime for bun-rad-studio v${version}
import { spawn, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BIN_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(BIN_DIR, "..");
const SUITE_VERSION = ${JSON.stringify(version)};

function resolveWebviewLibrary() {
  const file =
    process.platform === "win32"
      ? "libwebview.dll"
      : process.platform === "darwin"
        ? "libwebview.dylib"
        : \`libwebview-\${process.arch}.so\`;
  const candidate = join(PKG_ROOT, "lib", file);
  return existsSync(candidate) ? candidate : "";
}

function findWindowsWebView2Dir() {
  if (process.platform !== "win32") return "";
  const roots = [
    process.env["ProgramFiles(x86)"] || "C:\\\\Program Files (x86)",
    process.env.ProgramFiles || "C:\\\\Program Files",
    process.env.LOCALAPPDATA || "",
  ].filter(Boolean);

  for (const base of roots) {
    const edgeRoot = join(base, "Microsoft", "EdgeWebView", "Application");
    if (!existsSync(edgeRoot)) continue;
    try {
      const versions = readdirSync(edgeRoot).sort().reverse();
      for (const v of versions) {
        const candidate = join(edgeRoot, v, "EBWebView", "x64", "WebView2Loader.dll");
        if (existsSync(candidate)) return dirname(candidate);
      }
    } catch {}
  }
  return "";
}

function prepareGuiWorkDir(relTarget) {
  const appStem = relTarget.replace(/^apps\\//, "").replace(/\\.js$/, "");
  const workDir = join(homedir(), ".bun_rad_studio", "run", \`\${appStem}-\${SUITE_VERSION}\`);
  try {
    mkdirSync(workDir, { recursive: true });
    const srcResources = join(PKG_ROOT, "resources");
    const dstResources = join(workDir, "resources");
    if (existsSync(srcResources)) {
      let needsLink = true;
      try {
        const st = lstatSync(dstResources);
        if (st.isSymbolicLink() || st.isDirectory()) needsLink = false;
      } catch {}
      if (needsLink) {
        try {
          unlinkSync(dstResources);
        } catch {}
        symlinkSync(
          srcResources,
          dstResources,
          process.platform === "win32" ? "junction" : "dir",
        );
      }
    }
    return workDir;
  } catch {
    return PKG_ROOT;
  }
}

function canExecuteBun(binPath) {
  if (!binPath) return false;
  try {
    const res = spawnSync(binPath, ["--version"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 4000,
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

function resolveNpmInstalledBun(kind) {
  const req = createRequire(import.meta.url);
  const isWin = process.platform === "win32";
  const exe = isWin ? "bun.exe" : "bun";

  const ovenPlatform =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "windows"
        : process.platform === "freebsd"
          ? "freebsd"
          : "linux";

  const archOrder =
    isWin && process.arch === "arm64" && kind === "gui"
      ? ["x64", "aarch64"]
      : process.arch === "arm64"
        ? ["aarch64", "x64"]
        : ["x64"];

  for (const arch of archOrder) {
    const suffixes = ovenPlatform === "linux" ? ["", "-musl"] : [""];
    for (const suffix of suffixes) {
      const pkgName = \`@oven/bun-\${ovenPlatform}-\${arch}\${suffix}/package.json\`;
      try {
        const pkgJson = req.resolve(pkgName);
        const candidate = join(dirname(pkgJson), "bin", exe);
        if (existsSync(candidate) && canExecuteBun(candidate)) {
          return candidate;
        }
      } catch {}
    }
  }

  try {
    const bunPkgJson = req.resolve("bun/package.json");
    const bunDir = dirname(bunPkgJson);
    for (const rel of [join("bin", exe), join("bin", "bun.exe"), join("bin", "bun")]) {
      const candidate = join(bunDir, rel);
      if (existsSync(candidate) && canExecuteBun(candidate)) {
        return candidate;
      }
    }
  } catch {}

  return "";
}

function resolveBunExecutable(kind) {
  if (process.env.CODECAINE_BUN_BIN && existsSync(process.env.CODECAINE_BUN_BIN)) {
    return process.env.CODECAINE_BUN_BIN;
  }

  // On Windows ARM64, desktop GUI studios need an x64 Bun process for libwebview.dll if available
  const preferNpmFirst =
    process.env.CODECAINE_NO_PATH_BUN === "1" ||
    (process.platform === "win32" && process.arch === "arm64" && kind === "gui");

  if (preferNpmFirst) {
    const npmBun = resolveNpmInstalledBun(kind);
    if (npmBun) return npmBun;
  }

  if (process.env.CODECAINE_NO_PATH_BUN !== "1") {
    if (canExecuteBun("bun")) return "bun";
    const home = homedir();
    const fallbackPaths =
      process.platform === "win32"
        ? [join(home, ".bun", "bin", "bun.exe")]
        : [
            "/opt/homebrew/bin/bun",
            "/usr/local/bin/bun",
            "/home/linuxbrew/.linuxbrew/bin/bun",
            join(home, ".bun", "bin", "bun"),
          ];
    for (const p of fallbackPaths) {
      if (existsSync(p) && canExecuteBun(p)) return p;
    }
  }

  const npmBun = resolveNpmInstalledBun(kind);
  if (npmBun) return npmBun;

  return "";
}

export async function runEntry(relTarget, kind = "cli") {
  const absTarget = join(PKG_ROOT, relTarget);
  process.env.CODECAINE_SUITE = "1";
  process.env.CODECAINE_HOME = PKG_ROOT;

  if (!process.env.WEBVIEW_PATH) {
    const wv = resolveWebviewLibrary();
    if (wv) process.env.WEBVIEW_PATH = wv;
  }

  if (kind === "gui" && process.platform === "win32") {
    const wv2Dir = findWindowsWebView2Dir();
    if (wv2Dir && !(process.env.PATH || "").includes(wv2Dir)) {
      process.env.PATH = \`\${wv2Dir}\${delimiter}\${process.env.PATH || ""}\`;
    }
  }

  const targetCwd = kind === "gui" ? prepareGuiWorkDir(relTarget) : process.cwd();

  // Fast path: already executing inside Bun
  if (typeof globalThis.Bun !== "undefined") {
    if (kind === "gui" && targetCwd !== process.cwd()) {
      try {
        process.chdir(targetCwd);
      } catch {}
    }
    process.argv[1] = absTarget;
    globalThis.__CODECAINE_ENTRY = relTarget;
    await import(pathToFileURL(absTarget).href);
    return;
  }

  // Node.js path (npm install -g / npx / pnpm): delegate seamlessly to Bun
  const bunBin = resolveBunExecutable(kind);
  if (!bunBin) {
    console.error("❌ Bun runtime could not be located to run bun-rad-studio.");
    console.error("   Install Bun via: npm install -g bun  OR  curl -fsSL https://bun.sh/install | bash");
    process.exit(1);
  }

  const child = spawn(bunBin, [absTarget, ...process.argv.slice(2)], {
    cwd: targetCwd,
    env: process.env,
    stdio: "inherit",
  });

  const forwardSignal = (sig) => {
    try {
      child.kill(sig);
    } catch {}
  };
  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("error", (err) => {
    console.error(\`❌ Failed to launch Bun runtime (\${bunBin}): \${err.message}\`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
}
`;
}

function renderPostinstallMjs(): string {
  return `// Optional postinstall helper: ensures executable permissions and supports Bun-only hosts without Node.js
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

try {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const binDir = join(root, "bin");
  if (existsSync(binDir) && process.platform !== "win32") {
    const hasNode =
      spawnSync("sh", ["-c", "command -v node >/dev/null 2>&1"], {
        stdio: "ignore",
      }).status === 0;
    const isBun = typeof globalThis.Bun !== "undefined";

    for (const file of readdirSync(binDir)) {
      if (!file.endsWith(".mjs")) continue;
      const full = join(binDir, file);
      if (isBun && !hasNode && file !== "_runner.mjs") {
        const content = readFileSync(full, "utf8");
        if (content.startsWith("#!/usr/bin/env node\\n")) {
          writeFileSync(
            full,
            content.replace("#!/usr/bin/env node\\n", "#!/usr/bin/env bun\\n"),
            "utf8",
          );
        }
      }
      chmodSync(full, 0o755);
    }
  }
} catch {
  // Postinstall is strictly best-effort and must never fail package installation
}
`;
}

function renderNpmReadme(
  version: string,
  guiCount: number,
  cliCount: number,
  binCount: number,
): string {
  return `# Bun RAD Studio & Codecaine Utility Suite (\`bun-rad-studio\`)

Cross-platform RAD desktop studio suite, visual form designer, **SimpleGUI** declarative desktop toolkit, and **${guiCount + cliCount}+ native desktop & CLI developer tools** (macOS, Linux & Windows) — v${version}.

## Quick Install

### Using Bun (Recommended)
\`\`\`bash
bun add -g bun-rad-studio
\`\`\`

### Using npm / Node.js
Works out of the box even if you only have Node.js installed (automatically pulls the official \`bun\` runtime dependency):
\`\`\`bash
npm install -g bun-rad-studio
\`\`\`

### Zero-Install One-Shot (\`bunx\` / \`npx\`)
\`\`\`bash
bunx bun-rad-studio --help
npx bun-rad-studio list
\`\`\`

### Using Homebrew (macOS & Linux)
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/codecaine-zz/bun_rad_studio/main/install_homebrew_suite.sh | bash
# Optional native macOS File Manager app in /Applications:
brew install --cask codecaine-zz/tap/codecaine-file-manager
\`\`\`

## Primary Commands (${binCount} Binaries Included)

\`\`\`bash
# Master CLI hub & diagnostics
codecaine --version
codecaine doctor
codecaine list
codecaine search sqlite

# Launch desktop studios
codecaine gui                     # Unified Launcher Studio Pro
codecaine-file-manager            # Codecaine File Manager Studio
bun-rad-studio-ide                # Visual Form Designer (Delphi/VB style)
codecaine-sqlite-studio           # SQLite Studio Pro
codecaine-postgres-studio         # Postgres Studio Pro
codecaine-mysql-studio            # MySQL Studio Pro
dr-codecaine                      # Dr. Codecaine Arcade

# Run CLI utilities directly
codecaine-database --db :memory: --query "SELECT 42 AS answer"
codecaine-system --help
codecaine-api --help
\`\`\`

## Programmatic Library Usage

\`\`\`bash
bun add bun-rad-studio
\`\`\`

\`\`\`ts
import { simplegui } from "bun-rad-studio";

const win = simplegui.createWindow("Hello RAD", 520, 340, {
  theme: "apple_dark",
});
win.addLabel("⚡ Bun RAD Studio").font(20, "#38bdf8", "700");
win.addButton("Click Me", () => console.log("Clicked!"));
win.run();
\`\`\`

## Platform Notes for Desktop GUI Windows

- **macOS:** Uses built-in Apple WebKit (zero external dependencies).
- **Windows:** Uses Microsoft Edge WebView2 (pre-installed on Windows 11).
- **Linux:** Desktop GUI windows require GTK 4 and WebKitGTK 6.0 (\`sudo apt install libgtk-4-1 libwebkitgtk-6.0-4\`). All ${cliCount} CLI tools run headless with zero GUI libraries required.

## License

MIT — see \`LICENSE\`.
`;
}

function mapSourceTargetToBundle(targetScript: string): {
  relBundle: string;
  kind: "gui" | "cli" | "suite";
} {
  const normalized = toPosix(targetScript).replace(/^\.\//, "");
  if (normalized === "index.ts") {
    return { relBundle: "apps/rad-designer.js", kind: "gui" };
  }
  if (normalized.startsWith("applications/")) {
    const stem = basename(normalized, ".ts").replace(/_/g, "-");
    return { relBundle: `apps/${stem}.js`, kind: "gui" };
  }
  if (normalized.startsWith("cli_apps/")) {
    const stem = basename(normalized, ".ts").replace(/_/g, "-");
    const kind = stem === "codecaine-suite-cli" ? "suite" : "cli";
    return { relBundle: `cli/${stem}.js`, kind };
  }
  throw new Error(`Unsupported wrapper target script: ${targetScript}`);
}

export async function buildNpmPackage(
  options: BuildNpmOptions = {},
): Promise<BuildNpmResult> {
  const outDir = resolve(options.outDir ?? join(ROOT, "dist", "npm"));
  const stageEntriesDir = join(
    dirname(outDir),
    `.npm-entries-${process.pid}-${Date.now()}`,
  );
  const log = (emoji: string, msg: string) => {
    if (!options.quiet) console.log(`${emoji}  ${msg}`);
  };

  rmSync(outDir, { recursive: true, force: true });
  rmSync(stageEntriesDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  mkdirSync(stageEntriesDir, { recursive: true });

  try {
    const rootPkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    );
    const sourceApps = listSourceApps();
    const demoFiles = readdirSync(join(ROOT, "demos"))
      .filter((f) => f.endsWith(".ts"))
      .sort();

    // Map real source paths -> bundled relative entry targets for import.meta.main preservation
    const entryTargetsBySourcePath = new Map<string, string[]>();
    const addEntryTarget = (absSrc: string, relOut: string) => {
      const list = entryTargetsBySourcePath.get(absSrc) ?? [];
      if (!list.includes(relOut)) list.push(relOut);
      entryTargetsBySourcePath.set(absSrc, list);
    };

    const stagedEntrypoints: string[] = [];
    const writeStagedEntry = (relStagedTs: string, content: string) => {
      const full = join(stageEntriesDir, relStagedTs);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content, "utf8");
      stagedEntrypoints.push(full);
    };

    const importSpec = (fromRelStagedTs: string, targetAbs: string): string => {
      const fromDir = dirname(join(stageEntriesDir, fromRelStagedTs));
      let rel = toPosix(relative(fromDir, targetAbs));
      if (!rel.startsWith(".")) rel = `./${rel}`;
      return JSON.stringify(rel);
    };

    // 1. Library entrypoints (index.js & simplegui.js)
    const indexAbs = resolve(ROOT, "index.ts");
    const simpleguiAbs = resolve(ROOT, "src", "simplegui.ts");
    writeStagedEntry(
      "index.ts",
      `export * from ${importSpec("index.ts", indexAbs)};\n`,
    );
    writeStagedEntry(
      "simplegui.ts",
      `export * from ${importSpec("simplegui.ts", simpleguiAbs)};\n`,
    );
    addEntryTarget(indexAbs, "index.js");

    // 2. All GUI Studios & CLI Utilities
    let guiCount = 0;
    let cliCount = 0;
    for (const app of sourceApps) {
      const srcAbs = resolve(ROOT, app.entry);
      const subDir = app.kind === "gui" ? "apps" : "cli";
      const relStagedTs = `${subDir}/${app.name}.ts`;
      const relOutJs = `${subDir}/${app.name}.js`;
      writeStagedEntry(
        relStagedTs,
        `import ${importSpec(relStagedTs, srcAbs)};\n`,
      );
      addEntryTarget(srcAbs, relOutJs);
      if (app.kind === "gui") guiCount++;
      else cliCount++;
    }

    // 3. Showcase Demos
    for (const demoFile of demoFiles) {
      const stem = demoFile.replace(/\.ts$/, "");
      const srcAbs = resolve(ROOT, "demos", demoFile);
      const relStagedTs = `demos/${stem}.ts`;
      const relOutJs = `demos/${stem}.js`;
      writeStagedEntry(
        relStagedTs,
        `import ${importSpec(relStagedTs, srcAbs)};\n`,
      );
      addEntryTarget(srcAbs, relOutJs);
    }

    log(
      "📦",
      `Bundling ${stagedEntrypoints.length} code-split entrypoints (${guiCount} studios, ${cliCount} CLI tools, ${demoFiles.length} demos, 2 libraries)...`,
    );

    const bundleOut = await Bun.build({
      root: stageEntriesDir,
      entrypoints: stagedEntrypoints,
      outdir: outDir,
      splitting: true,
      target: "bun",
      format: "esm",
      minify: true,
      plugins: [createNpmBundlePlugin(entryTargetsBySourcePath)],
      naming: {
        entry: "[dir]/[name].[ext]",
        chunk: "_chunks/[name]-[hash].[ext]",
        asset: "_assets/[name]-[hash].[ext]",
      },
    });

    if (!bundleOut.success) {
      const details = bundleOut.logs.map((l) => l.message).join("\n");
      throw new Error(`Code-split npm bundle failed:\n${details}`);
    }

    // Clean up any auto-copied native binary assets (native libs live cleanly in dist/npm/lib/)
    rmSync(join(outDir, "_assets"), { recursive: true, force: true });

    // 4. Bundle standalone Web Workers into dist/npm/workers/*.js
    const workersOutDir = join(outDir, "workers");
    mkdirSync(workersOutDir, { recursive: true });
    for (const w of WORKER_ENTRIES) {
      const wRes = await Bun.build({
        entrypoints: [resolve(ROOT, w.source)],
        outdir: workersOutDir,
        target: "bun",
        format: "esm",
        minify: true,
        naming: { entry: `${w.name}.js` },
      });
      if (!wRes.success) {
        const details = wRes.logs.map((l) => l.message).join("\n");
        throw new Error(`Worker bundle failed (${w.name}):\n${details}`);
      }
    }
    // Keep fmFindWorker.ts alongside file-manager-studio.js for parity with release layout checks
    cpSync(
      join(workersOutDir, "fmFindWorker.js"),
      join(outDir, "apps", "fmFindWorker.ts"),
    );

    // 5. Copy native multi-OS webview libraries, sidecar files, and resources
    const libOutDir = join(outDir, "lib");
    mkdirSync(libOutDir, { recursive: true });
    for (const libName of WEBVIEW_LIBS) {
      const srcLib = join(
        ROOT,
        "node_modules",
        "webview-bun",
        "build",
        libName,
      );
      if (!existsSync(srcLib)) {
        throw new Error(`Missing native webview library: ${srcLib}`);
      }
      cpSync(srcLib, join(libOutDir, libName));
    }

    mkdirSync(join(outDir, "src"), { recursive: true });
    cpSync(join(ROOT, "src", "ide.html"), join(outDir, "src", "ide.html"));
    cpSync(
      join(ROOT, "applications", "postgres_designer.js"),
      join(outDir, "apps", "postgres_designer.js"),
    );

    cpSync(join(ROOT, "resources"), join(outDir, "resources"), {
      recursive: true,
      filter: (src) => basename(src) !== ".DS_Store",
    });

    if (existsSync(join(ROOT, "LICENSE"))) {
      cpSync(join(ROOT, "LICENSE"), join(outDir, "LICENSE"));
    }
    writeFileSync(join(outDir, "VERSION"), `${VERSION}\n`, "utf8");

    // 6. Generate universal Node.js + Bun shims in dist/npm/bin/
    const binOutDir = join(outDir, "bin");
    mkdirSync(binOutDir, { recursive: true });
    writeFileSync(
      join(binOutDir, "_runner.mjs"),
      renderRunnerMjs(VERSION),
      "utf8",
    );

    const binMap: Record<string, string> = {};
    const writeBinShim = (
      binName: string,
      relBundle: string,
      kind: "gui" | "cli" | "suite",
    ) => {
      if (binMap[binName]) return;
      const fileName = `${binName}.mjs`;
      const fullPath = join(binOutDir, fileName);
      const code = `#!/usr/bin/env node\nimport { runEntry } from "./_runner.mjs";\nawait runEntry(${JSON.stringify(relBundle)}, ${JSON.stringify(kind)});\n`;
      writeFileSync(fullPath, code, "utf8");
      if (process.platform !== "win32") {
        chmodSync(fullPath, 0o755);
      }
      binMap[binName] = `./bin/${fileName}`;
    };

    // Package-named entrypoints (`npx bun-rad-studio` / `bunx bun-rad-studio`)
    writeBinShim("bun-rad-studio", "cli/codecaine-suite-cli.js", "suite");
    writeBinShim("bun-rad-studio-ide", "apps/rad-designer.js", "gui");
    writeBinShim("codecaine-rad-designer", "apps/rad-designer.js", "gui");

    // All Codecaine Utility Suite wrappers
    for (const def of buildWrapperDefinitions()) {
      const mapped = mapSourceTargetToBundle(def.targetScript);
      if (existsSync(join(outDir, mapped.relBundle))) {
        writeBinShim(def.binName, mapped.relBundle, mapped.kind);
      }
    }

    // 7. Postinstall script & README & package.json
    const scriptsOutDir = join(outDir, "scripts");
    mkdirSync(scriptsOutDir, { recursive: true });
    writeFileSync(
      join(scriptsOutDir, "postinstall.mjs"),
      renderPostinstallMjs(),
      "utf8",
    );

    const binCount = Object.keys(binMap).length;
    writeFileSync(
      join(outDir, "README.md"),
      renderNpmReadme(VERSION, guiCount, cliCount, binCount),
      "utf8",
    );

    const sortedBins = Object.fromEntries(
      Object.entries(binMap).sort(([a], [b]) => a.localeCompare(b)),
    );

    const npmPkgJson = {
      name: "bun-rad-studio",
      version: VERSION,
      description:
        "Cross-platform RAD desktop studio suite, visual form designer, SimpleGUI toolkit, and 200+ native developer & system CLI utilities powered by Bun.",
      type: "module",
      license: rootPkg.license ?? "MIT",
      preferGlobal: true,
      main: "./index.js",
      exports: {
        ".": {
          import: "./index.js",
          default: "./index.js",
        },
        "./simplegui": {
          import: "./simplegui.js",
          default: "./simplegui.js",
        },
        "./package.json": "./package.json",
      },
      bin: sortedBins,
      files: [
        "index.js",
        "simplegui.js",
        "apps",
        "cli",
        "demos",
        "_chunks",
        "workers",
        "bin",
        "lib",
        "resources",
        "src",
        "scripts",
        "VERSION",
        "README.md",
        "LICENSE",
      ],
      scripts: {
        postinstall: "node ./scripts/postinstall.mjs",
      },
      dependencies: {
        bun: "^1.4.4",
      },
      engines: {
        node: ">=18.0.0",
        bun: ">=1.1.0",
      },
      keywords: [
        "bun",
        "rad",
        "gui",
        "desktop",
        "webview",
        "simplegui",
        "codecaine",
        "file-manager",
        "sqlite",
        "postgres",
        "mysql",
        "cli",
        "devtools",
      ],
      repository: {
        type: "git",
        url: "git+https://github.com/codecaine-zz/bun_rad_studio.git",
      },
      homepage: "https://github.com/codecaine-zz/bun_rad_studio#readme",
      bugs: {
        url: "https://github.com/codecaine-zz/bun_rad_studio/issues",
      },
      funding: rootPkg.funding,
    };

    writeFileSync(
      join(outDir, "package.json"),
      `${JSON.stringify(npmPkgJson, null, 2)}\n`,
      "utf8",
    );

    let tarballPath: string | undefined;
    if (options.pack) {
      const packDestDir = resolve(join(ROOT, "dist"));
      mkdirSync(packDestDir, { recursive: true });
      const expectedTarball = join(
        packDestDir,
        `bun-rad-studio-${VERSION}.tgz`,
      );
      rmSync(expectedTarball, { force: true });

      log("📦", `Packing tarball → ${expectedTarball}`);
      const proc = Bun.spawn(
        [
          process.execPath,
          "pm",
          "pack",
          "--destination",
          packDestDir,
          "--quiet",
        ],
        {
          cwd: outDir,
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (code !== 0) {
        throw new Error(`Failed to pack tarball: ${stderr || stdout}`);
      }
      tarballPath = existsSync(expectedTarball)
        ? expectedTarball
        : join(packDestDir, stdout.trim());
      const sizeMb = (statSync(tarballPath).size / (1024 * 1024)).toFixed(2);
      log("✅", `Packed ${tarballPath} (${sizeMb} MB)`);
    }

    log(
      "✅",
      `Built publish-ready npm/Bun package in ${outDir} (${binCount} commands, v${VERSION})`,
    );

    return {
      outDir,
      version: VERSION,
      guiCount,
      cliCount,
      demoCount: demoFiles.length,
      binCount,
      tarballPath,
    };
  } finally {
    rmSync(stageEntriesDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const pack = args.includes("--pack");
  const outIdx = args.indexOf("--outdir");
  const outDir =
    outIdx >= 0 && args[outIdx + 1] ? resolve(args[outIdx + 1]!) : undefined;

  await buildNpmPackage({ outDir, pack });
}
