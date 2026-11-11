#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import * as nodePath from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { SimpleCLI } from "../src/index.ts";
import {
  unzipToDir,
  listZipDetails,
} from "../src/features/rad/modules/archiveutils.ts";
import {
  extractTarFile,
  unpackTarGz,
} from "../src/features/rad/modules/tarutils.ts";

const MAX_GZ_OUTPUT_BYTES = 256 * 1024 * 1024;

const app = SimpleCLI.newApp("ouch-cli", "1.0.0").setDescription(
  "Universal Archive Compressor & Decompressor (zip, tar, gz)",
);

app.addFlagString("compress", "c", "", "Create compressed archive");
app.addFlagString("extract", "x", "", "Extract compressed archive");
app.addFlagString("decompress", "d", "", "Extract compressed archive (alias)");
app.addFlagString("input", "i", "", "Source file or directory to compress");
app.addFlagString("output", "o", ".", "Destination directory for extraction");
app.addFlagBool("list", "l", false, "List archive contents without extracting");
app.addFlagBool("force", "f", false, "Overwrite existing destination files");

/**
 * Validates an archive entry path against zip-slip (`..`, leading `/`, backslashes, drive letters, NUL bytes).
 */
export function assertSafeArchiveEntryPath(
  entryName: string,
  destDir: string,
): string {
  if (!entryName || entryName.includes("\0") || /^[a-zA-Z]:/.test(entryName)) {
    throw new Error(
      `[ouch-cli] Unsafe archive entry "${entryName}": invalid or drive-prefixed path`,
    );
  }
  const normalized = entryName.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === "..")
  ) {
    throw new Error(
      `[ouch-cli] Zip-slip blocked for entry "${entryName}": path traversal detected`,
    );
  }
  const root = nodePath.resolve(destDir);
  const resolved = nodePath.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(root + nodePath.sep)) {
    throw new Error(
      `[ouch-cli] Zip-slip blocked for entry "${entryName}": escapes ${root}`,
    );
  }
  return resolved;
}

function validateExternalZipArchive(
  srcArchive: string,
  targetDir: string,
  force: boolean,
): void {
  const namesProc = Bun.spawnSync(["unzip", "-Z", "-1", "--", srcArchive], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const infoProc = Bun.spawnSync(["unzip", "-Z", "-l", "--", srcArchive], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (namesProc.exitCode !== 0 || infoProc.exitCode !== 0) {
    throw new Error(
      `[ouch-cli] Failed to inspect ZIP archive "${srcArchive}": ${namesProc.stderr.toString("utf8").trim() || infoProc.stderr.toString("utf8").trim()}`,
    );
  }
  for (const line of infoProc.stdout.toString("utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^l[rwxst-]{9}\b/i.test(trimmed)) {
      throw new Error(
        `[ouch-cli] Refusing to extract ZIP archive containing symlink entry: ${trimmed}`,
      );
    }
  }
  const entries = namesProc.stdout
    .toString("utf8")
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  for (const entry of entries) {
    const destPath = assertSafeArchiveEntryPath(entry, targetDir);
    if (!force && !entry.endsWith("/") && existsSync(destPath)) {
      throw new Error(
        `[ouch-cli] Destination file already exists: ${destPath} (pass --force to overwrite)`,
      );
    }
  }
}

function validateExternalTarArchive(
  srcArchive: string,
  targetDir: string,
  force: boolean,
): void {
  const listProc = Bun.spawnSync(["tar", "-tvf", srcArchive], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (listProc.exitCode !== 0) {
    throw new Error(
      `[ouch-cli] Failed to inspect TAR archive "${srcArchive}": ${listProc.stderr.toString("utf8").trim()}`,
    );
  }
  const namesProc = Bun.spawnSync(["tar", "-tf", srcArchive], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (namesProc.exitCode !== 0) {
    throw new Error(
      `[ouch-cli] Failed to list TAR entries "${srcArchive}": ${namesProc.stderr.toString("utf8").trim()}`,
    );
  }
  for (const line of listProc.stdout.toString("utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[lhbcps]/i.test(trimmed)) {
      throw new Error(
        `[ouch-cli] Refusing to extract TAR archive containing special/symlink/hardlink entry: ${trimmed}`,
      );
    }
  }
  for (const entry of namesProc.stdout.toString("utf8").split(/\r?\n/)) {
    if (!entry) continue;
    const cleanEntry = entry.startsWith("./") ? entry.slice(2) : entry;
    if (!cleanEntry) continue;
    const destPath = assertSafeArchiveEntryPath(cleanEntry, targetDir);
    if (!force && !cleanEntry.endsWith("/") && existsSync(destPath)) {
      throw new Error(
        `[ouch-cli] Destination file already exists: ${destPath} (pass --force to overwrite)`,
      );
    }
  }
}

if (import.meta.main) {
  if (!app.parseCli()) process.exit(0);

  const compressTarget = app.getFlagString("compress");
  const decompressTarget =
    app.getFlagString("extract") || app.getFlagString("decompress");
  const inputPath =
    app.getFlagString("input") || (app.getPositionalArgs()[0] ?? "");
  const outDir = app.getFlagString("output") || ".";
  const listMode = app.getFlagBool("list");
  const forceOverwrite = app.getFlagBool("force");

  app.banner("Universal Archive Manager (ouch-cli)", "v1.0.0");

  if (listMode && (decompressTarget || inputPath)) {
    const archivePath = nodePath.resolve(decompressTarget || inputPath);
    if (!existsSync(archivePath)) {
      app.error(`Archive not found: ${archivePath}`);
      process.exit(1);
    }
    const st = statSync(archivePath);
    app.info(`Listing archive: ${archivePath} (${st.size} bytes)`);
    try {
      if (/\.zip$/i.test(archivePath)) {
        const details = await listZipDetails(archivePath);
        for (const d of details) {
          console.log(
            `${d.uncompressedSize.toString().padStart(10)}  ${d.name}`,
          );
        }
      } else if (/\.(tar|tar\.gz|tgz)$/i.test(archivePath)) {
        const entries = unpackTarGz(readFileSync(archivePath));
        for (const e of entries) {
          console.log(`${e.size.toString().padStart(10)}  ${e.name}`);
        }
      } else {
        app.error(`Unsupported archive format for --list: ${archivePath}`);
        process.exit(1);
      }
      app.success(`Archive verified (${st.size} bytes)`);
    } catch (err: any) {
      app.error(`Failed to list archive: ${err.message}`);
      process.exit(1);
    }
  } else if (compressTarget) {
    const destArchive = nodePath.resolve(compressTarget);
    const src = inputPath ? nodePath.resolve(inputPath) : "";
    if (!src || !existsSync(src)) {
      app.error(`Input source not found: ${inputPath || "(none specified)"}`);
      process.exit(1);
    }
    if (!forceOverwrite && existsSync(destArchive)) {
      app.error(
        `Output archive already exists: ${destArchive} (pass --force to overwrite)`,
      );
      process.exit(1);
    }
    const st = statSync(src);
    if (
      !st.isDirectory() &&
      destArchive.endsWith(".gz") &&
      !destArchive.endsWith(".tar.gz")
    ) {
      const raw = readFileSync(src);
      const gz = gzipSync(raw);
      writeFileSync(destArchive, gz);
      const ratio =
        raw.byteLength > 0
          ? ((1 - gz.byteLength / raw.byteLength) * 100).toFixed(1)
          : "0.0";
      app.success(
        `Compressed ${nodePath.basename(src)} -> ${destArchive} (${raw.byteLength}B -> ${gz.byteLength}B, ${ratio}% saved)`,
      );
      process.exit(0);
    }
    const parentDir = nodePath.dirname(src);
    const baseName = nodePath.basename(src);
    if (baseName.startsWith("-")) {
      app.error(`Refusing source basename starting with '-': ${baseName}`);
      process.exit(1);
    }
    const cmd = destArchive.endsWith(".zip")
      ? ["zip", "-rq", destArchive, "--", baseName]
      : ["tar", "-czf", destArchive, "-C", parentDir, "--", baseName];
    const proc = Bun.spawnSync(cmd, {
      cwd: parentDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0 || !existsSync(destArchive)) {
      app.error(
        `Compression failed: ${proc.stderr.toString("utf8").trim() || `exit code ${proc.exitCode}`}`,
      );
      process.exit(1);
    }
    const outSize = statSync(destArchive).size;
    app.success(`Compressed ${baseName} -> ${destArchive} (${outSize} bytes)`);
    process.exit(0);
  } else if (decompressTarget) {
    const srcArchive = nodePath.resolve(decompressTarget);
    if (!existsSync(srcArchive)) {
      app.error(`Archive not found: ${srcArchive}`);
      process.exit(1);
    }
    const targetDir = nodePath.resolve(outDir);
    mkdirSync(targetDir, { recursive: true });
    try {
      if (srcArchive.endsWith(".gz") && !srcArchive.endsWith(".tar.gz")) {
        const outName = nodePath.basename(srcArchive, ".gz");
        const destFile = assertSafeArchiveEntryPath(outName, targetDir);
        if (!forceOverwrite && existsSync(destFile)) {
          throw new Error(
            `Destination file already exists: ${destFile} (pass --force to overwrite)`,
          );
        }
        const raw = gunzipSync(readFileSync(srcArchive), {
          maxOutputLength: MAX_GZ_OUTPUT_BYTES,
        });
        writeFileSync(destFile, raw);
        app.success(
          `Extracted ${srcArchive} -> ${destFile} (${raw.byteLength} bytes)`,
        );
        process.exit(0);
      }
      if (/\.zip$/i.test(srcArchive)) {
        if (Bun.which("unzip")) {
          validateExternalZipArchive(srcArchive, targetDir, forceOverwrite);
          const proc = Bun.spawnSync(
            [
              "unzip",
              forceOverwrite ? "-oq" : "-nq",
              "--",
              srcArchive,
              "-d",
              targetDir,
            ],
            { stdout: "pipe", stderr: "pipe" },
          );
          if (proc.exitCode !== 0) {
            throw new Error(
              proc.stderr.toString("utf8").trim() ||
                `unzip exited with code ${proc.exitCode}`,
            );
          }
        } else {
          const details = await listZipDetails(srcArchive);
          for (const entry of details) {
            const destPath = assertSafeArchiveEntryPath(entry.name, targetDir);
            if (!forceOverwrite && !entry.isDirectory && existsSync(destPath)) {
              throw new Error(
                `Destination file already exists: ${destPath} (pass --force to overwrite)`,
              );
            }
          }
          await unzipToDir(srcArchive, targetDir);
        }
      } else if (/\.(tar|tar\.gz|tgz)$/i.test(srcArchive)) {
        if (Bun.which("tar")) {
          validateExternalTarArchive(srcArchive, targetDir, forceOverwrite);
          const tarArgs = [
            /\.(tar\.gz|tgz)$/i.test(srcArchive) ? "-xzf" : "-xf",
            srcArchive,
            "--no-same-owner",
            ...(forceOverwrite ? [] : ["-k"]),
            "-C",
            targetDir,
          ];
          const proc = Bun.spawnSync(["tar", ...tarArgs], {
            stdout: "pipe",
            stderr: "pipe",
          });
          if (proc.exitCode !== 0) {
            throw new Error(
              proc.stderr.toString("utf8").trim() ||
                `tar exited with code ${proc.exitCode}`,
            );
          }
        } else {
          const entries = unpackTarGz(readFileSync(srcArchive));
          for (const entry of entries) {
            const destPath = assertSafeArchiveEntryPath(entry.name, targetDir);
            if (
              !forceOverwrite &&
              entry.type === "file" &&
              existsSync(destPath)
            ) {
              throw new Error(
                `Destination file already exists: ${destPath} (pass --force to overwrite)`,
              );
            }
          }
          await extractTarFile(srcArchive, targetDir);
        }
      } else {
        throw new Error(`Unsupported archive format: ${srcArchive}`);
      }
      const items = readdirSync(targetDir).length;
      app.success(
        `Extracted ${srcArchive} into ${targetDir} (${items} items in destination)`,
      );
      process.exit(0);
    } catch (err: any) {
      app.error(`Extraction failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    app.info("Archive utility ready.");
  }
}
