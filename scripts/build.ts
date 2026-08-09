#!/usr/bin/env bun
/**
 * Bun RAD Studio — dist build script
 *
 * Usage:
 *   bun run build              → bundles the library to dist/
 *   bun run build:binary       → compiles a standalone executable to dist/
 *   bun run build:all          → runs both targets
 *
 * Outputs:
 *   dist/index.js              → bundled ESM library (for importers)
 *   dist/simplegui.js          → standalone SimpleGUI module bundle
 *   dist/src/ide.html          → RAD Studio IDE HTML asset
 *   dist/package.json          → dist-ready package manifest
 *   dist/bun_rad_studio        → standalone native binary (build:binary)
 */

import { mkdirSync, copyFileSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const PKG  = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

// ─── helpers ────────────────────────────────────────────────────────────────

function log(emoji: string, msg: string) {
    console.log(`${emoji}  ${msg}`);
}

function die(msg: string): never {
    console.error(`❌  ${msg}`);
    process.exit(1);
}

async function run(cmd: string[]) {
    log("🔧", cmd.join(" "));
    const proc = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit", cwd: ROOT });
    const code = await proc.exited;
    if (code !== 0) die(`Command failed with exit code ${code}`);
}

// ─── targets ────────────────────────────────────────────────────────────────

/** Bundle the library (index.ts + src/simplegui.ts) to dist/ */
async function buildLib() {
    log("📦", `Building library → dist/  (v${PKG.version ?? "0.0.0"})`);

    mkdirSync(DIST, { recursive: true });

    // ── main library bundle (index.ts → dist/index.js) ──────────────────────
    log("🔧", `bun build index.ts → dist/index.js`);
    const mainResult = await Bun.build({
        entrypoints: [join(ROOT, "index.ts")],
        outdir: DIST,
        naming: "[name].[ext]",          // → dist/index.js
        target: "bun",
        format: "esm",
        sourcemap: "external",
        minify: true,
    });
    if (!mainResult.success) {
        for (const log_ of mainResult.logs) console.error(log_);
        die("Main library bundle failed");
    }
    log("✅", `Bundled dist/index.js (${mainResult.outputs.map(o => o.path).join(", ")})`);

    // ── simplegui standalone bundle (src/simplegui.ts → dist/simplegui.js) ──
    log("🔧", `bun build src/simplegui.ts → dist/simplegui.js`);
    const sgResult = await Bun.build({
        entrypoints: [join(ROOT, "src", "simplegui.ts")],
        outdir: DIST,
        naming: "[name].[ext]",          // → dist/simplegui.js
        target: "bun",
        format: "esm",
        sourcemap: "external",
        minify: true,
    });
    if (!sgResult.success) {
        for (const log_ of sgResult.logs) console.error(log_);
        die("SimpleGUI bundle failed");
    }
    log("✅", `Bundled dist/simplegui.js (${sgResult.outputs.map(o => o.path).join(", ")})`);

    // --- copy src/ide.html into dist/src/ so bundled app can reference it ---
    const distSrc = join(DIST, "src");
    mkdirSync(distSrc, { recursive: true });
    copyFileSync(join(ROOT, "src", "ide.html"), join(distSrc, "ide.html"));
    log("📄", "Copied src/ide.html → dist/src/ide.html");

    // --- emit a minimal dist package.json ---
    const distPkg = {
        name: PKG.name,
        version: PKG.version ?? "0.0.0",
        type: "module",
        main: "./index.js",
        exports: {
            ".":           { import: "./index.js",     default: "./index.js"    },
            "./simplegui": { import: "./simplegui.js", default: "./simplegui.js" },
        },
        peerDependencies: PKG.peerDependencies ?? {},
        dependencies:     PKG.dependencies     ?? {},
        license: PKG.license ?? "MIT",
    };
    writeFileSync(
        join(DIST, "package.json"),
        JSON.stringify(distPkg, null, 2) + "\n"
    );
    log("📄", "Generated dist/package.json");

    // --- copy readme & API docs ---
    for (const file of ["README.md", "API.md", "SIMPLEGUI_API.md"]) {
        const src = join(ROOT, file);
        if (existsSync(src)) {
            copyFileSync(src, join(DIST, file));
            log("📄", `Copied ${file} → dist/${file}`);
        }
    }

    log("✅", "Library build complete → dist/");
}

/** Compile a single-file standalone binary via bun build --compile */
async function buildBinary() {
    log("⚡", "Compiling standalone binary → dist/bun_rad_studio");

    mkdirSync(DIST, { recursive: true });

    await run([
        "bun", "build",
        "--compile",
        join(ROOT, "index.ts"),
        "--outfile", join(DIST, "bun_rad_studio"),
        "--target", "bun",
        "--minify",
    ]);

    log("✅", "Binary build complete → dist/bun_rad_studio");
}

// ─── entry ──────────────────────────────────────────────────────────────────

const mode = process.argv[2] ?? "lib";

if (mode === "lib"    || mode === "all") await buildLib();
if (mode === "binary" || mode === "all") await buildBinary();

if (!["lib", "binary", "all"].includes(mode)) {
    console.error(`Unknown build mode: "${mode}". Valid: lib | binary | all`);
    process.exit(1);
}
