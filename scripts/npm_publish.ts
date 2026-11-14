#!/usr/bin/env bun
/**
 * ⚡ Bun RAD Studio — Smart npm Publisher (`bun run npm:publish`)
 *
 * Automatically resolves a clean, unpublished npm version (avoiding npm 409
 * conflicts over previously published or staged versions such as "1.5.4"),
 * builds `dist/npm/` with full README, CHANGELOG, LICENSE & TypeScript types,
 * and publishes via official `npm@latest`.
 *
 * Usage:
 *   bun run npm:publish                     # Build & publish next clean version
 *   bun run npm:publish -- --dry-run        # Preview without uploading
 *   bun run npm:publish -- --version 1.5.6  # Publish an explicit version
 */

import { buildNpmPackage } from "./build_npm_package.ts";
import { VERSION } from "./release/common.ts";

/** Versions permanently reserved/burned by npm staged-publishing placeholders. */
const BURNED_STAGED_VERSIONS = new Set(["1.5.4"]);

function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  if (pa[1] !== pb[1]) return pa[1] - pb[1];
  return pa[2] - pb[2];
}

function bumpPatch(v: string): string {
  const p = parseSemver(v);
  if (!p) return `${v}.1`;
  return `${p[0]}.${p[1]}.${p[2] + 1}`;
}

async function fetchPublishedVersions(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const res = await fetch("https://registry.npmjs.org/bun-rad-studio", {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as { versions?: Record<string, unknown> };
      for (const ver of Object.keys(data.versions ?? {})) {
        if (ver && ver !== "0.0.0-stage") set.add(ver);
      }
    }
  } catch {
    // Offline or registry unreachable; fall back to local knowledge
  }
  return set;
}

export interface PublishNpmOptions {
  explicitVersion?: string;
  dryRun?: boolean;
  /** When true (called from release_publish.ts), skip if VERSION is already live on npm. */
  releaseMode?: boolean;
}

export async function publishNpmPackage(
  options: PublishNpmOptions = {},
): Promise<number> {
  const published = await fetchPublishedVersions();

  if (options.releaseMode && published.has(VERSION)) {
    console.log(
      `ℹ️  npm package bun-rad-studio@${VERSION} is already live on npmjs.com; skipping.`,
    );
    return 0;
  }

  let targetVersion = options.explicitVersion ?? VERSION;
  if (!options.explicitVersion) {
    // Ensure targetVersion is higher than any already-published or burned version
    const allTaken = new Set([...published, ...BURNED_STAGED_VERSIONS]);
    for (const taken of allTaken) {
      if (compareSemver(targetVersion, taken) <= 0) {
        targetVersion = bumpPatch(taken);
      }
    }
    while (allTaken.has(targetVersion)) {
      targetVersion = bumpPatch(targetVersion);
    }
    if (targetVersion !== VERSION) {
      console.log(
        `ℹ️  Version ${VERSION} is already taken/staged on npm; publishing clean version v${targetVersion}.`,
      );
    }
  }

  const built = await buildNpmPackage({ version: targetVersion });
  const npmArgs = [
    "bunx",
    "npm@latest",
    "publish",
    "--access",
    "public",
    ...(options.dryRun ? ["--dry-run"] : []),
  ];

  console.log(
    `🚀  Publishing bun-rad-studio@${built.version} to https://www.npmjs.com/package/bun-rad-studio${options.dryRun ? " (dry-run)" : ""}…`,
  );
  const proc = Bun.spawn(npmArgs, {
    cwd: built.outDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code === 0 && !options.dryRun) {
    console.log(
      `⏳  Waiting for npm registry CDN & code explorer indexing for v${built.version}…`,
    );
    const checkUrl = `https://registry.npmjs.org/bun-rad-studio/${encodeURIComponent(built.version)}`;
    let live = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${checkUrl}?t=${Date.now()}`, {
          headers: { "Cache-Control": "no-cache" },
        });
        if (res.ok) {
          live = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 10_000));
    }
    if (live) {
      console.log(
        `🎉  Live on npm: https://www.npmjs.com/package/bun-rad-studio/v/${built.version}`,
      );
    } else {
      console.log(
        `ℹ️  Uploaded! npm is still indexing v${built.version} (usually 3–7 minutes): https://www.npmjs.com/package/bun-rad-studio/v/${built.version}`,
      );
    }
  }
  return code;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verIdx = args.indexOf("--version");
  const explicitVersion =
    verIdx >= 0 && args[verIdx + 1] ? args[verIdx + 1]! : undefined;

  const code = await publishNpmPackage({ explicitVersion, dryRun });
  process.exit(code);
}
