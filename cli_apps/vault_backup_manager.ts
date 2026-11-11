#!/usr/bin/env bun
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { SimpleCLI } from "../src/index.ts";
import {
  packTarGz,
  unpackTarGz,
} from "../src/features/rad/modules/tarutils.ts";

const VAULT_MAGIC = Buffer.from("VBKP1", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

const app = SimpleCLI.newApp("vault-backup", "1.0.0").setDescription(
  "Encrypted Backup & Restore Manager (AES-256-GCM)",
);

app.addFlagString("file", "f", "", "Path to encrypted backup archive (.vbkp)");
app.addFlagString("source", "s", "", "Source file or directory to back up");
app.addFlagBool("restore", "r", false, "Restore encrypted backup archive");
app.addFlagString("out", "o", "", "Destination directory when restoring");
app.addFlagBool(
  "key-stdin",
  "",
  false,
  "Read encryption passphrase from stdin (recommended over --key)",
);
app.addFlagString(
  "key",
  "k",
  "",
  "Passphrase (prefer VAULT_BACKUP_KEY env or --key-stdin to avoid ps exposure)",
);

/**
 * Encrypts raw archive bytes using `scrypt` key derivation and authenticated `AES-256-GCM`.
 */
export function encryptVaultPayload(
  plaintext: Uint8Array,
  passphrase: string,
): Buffer {
  if (!passphrase || passphrase.length < 1) {
    throw new Error("Vault encryption passphrase must not be empty");
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([VAULT_MAGIC, salt, iv, authTag, encrypted]);
}

/**
 * Decrypts and authenticates a `VBKP1` `AES-256-GCM` backup payload.
 */
export function decryptVaultPayload(
  payload: Uint8Array,
  passphrase: string,
): Buffer {
  if (!passphrase || passphrase.length < 1) {
    throw new Error("Vault decryption passphrase must not be empty");
  }
  const buf = Buffer.from(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const headerLen = VAULT_MAGIC.length + SALT_BYTES + IV_BYTES + TAG_BYTES;
  if (buf.length < headerLen) {
    throw new Error("Truncated or invalid vault backup archive");
  }
  if (!buf.subarray(0, VAULT_MAGIC.length).equals(VAULT_MAGIC)) {
    throw new Error("Unrecognized vault backup header (expected VBKP1)");
  }
  let offset = VAULT_MAGIC.length;
  const salt = buf.subarray(offset, offset + SALT_BYTES);
  offset += SALT_BYTES;
  const iv = buf.subarray(offset, offset + IV_BYTES);
  offset += IV_BYTES;
  const authTag = buf.subarray(offset, offset + TAG_BYTES);
  offset += TAG_BYTES;
  const ciphertext = buf.subarray(offset);

  const key = scryptSync(passphrase, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Resolves the encryption passphrase from `VAULT_BACKUP_KEY` / `VAULT_KEY`, `--key-stdin`, or `--key`.
 */
export async function resolveVaultPassphrase(options: {
  cliKey?: string;
  keyStdin?: boolean;
  env?: Record<string, string | undefined>;
}): Promise<{ passphrase: string; usedCliArg: boolean }> {
  const env = options.env ?? process.env;
  const envKey = env.VAULT_BACKUP_KEY || env.VAULT_KEY;
  if (envKey && envKey.length > 0) {
    return { passphrase: envKey, usedCliArg: false };
  }
  if (options.keyStdin) {
    const stdinText = (await new Response(Bun.stdin.stream()).text()).replace(
      /\r?\n$/,
      "",
    );
    if (!stdinText) {
      throw new Error("No passphrase received on stdin for --key-stdin");
    }
    return { passphrase: stdinText, usedCliArg: false };
  }
  if (options.cliKey && options.cliKey.length > 0) {
    return { passphrase: options.cliKey, usedCliArg: true };
  }
  throw new Error(
    "Missing encryption passphrase. Set VAULT_BACKUP_KEY (recommended), pass --key-stdin, or pass -k.",
  );
}

function collectSourceTarEntries(srcPath: string) {
  const resolved = path.resolve(srcPath);
  const st = fs.statSync(resolved);
  if (st.isFile()) {
    return [
      {
        name: path.basename(resolved),
        data: fs.readFileSync(resolved),
        mode: st.mode,
        mtime: st.mtime,
      },
    ];
  }
  const entries: {
    name: string;
    data: Uint8Array | string;
    type?: "file" | "directory";
    mode?: number;
    mtime?: Date;
  }[] = [];
  const walk = (dir: string) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      const rel = path.relative(resolved, full).replace(/\\/g, "/");
      const itemStat = fs.lstatSync(full);
      if (itemStat.isSymbolicLink()) continue;
      if (itemStat.isDirectory()) {
        entries.push({
          name: `${rel}/`,
          data: "",
          type: "directory",
          mode: itemStat.mode,
          mtime: itemStat.mtime,
        });
        walk(full);
      } else if (itemStat.isFile()) {
        entries.push({
          name: rel,
          data: fs.readFileSync(full),
          mode: itemStat.mode,
          mtime: itemStat.mtime,
        });
      }
    }
  };
  walk(resolved);
  return entries;
}

if (import.meta.main) {
  if (!app.parseCli()) process.exit(0);

  app.banner(
    "Vault Backup Manager",
    "v1.0.0 - Authenticated AES-256-GCM Backups",
  );

  const backupFile = app.getFlagString("file");
  const sourcePath =
    app.getFlagString("source") || (app.getPositionalArgs()[0] ?? "");
  const restoreMode = app.getFlagBool("restore");
  const outDir = app.getFlagString("out") || ".";

  if (!backupFile) {
    app.error(
      "Backup archive path required: pass --file <archive.vbkp> (with --source <path> to create or --restore --out <dir> to restore).",
    );
    process.exit(1);
  }

  let passphrase = "";
  try {
    const resolvedKey = await resolveVaultPassphrase({
      cliKey: app.getFlagString("key"),
      keyStdin: app.getFlagBool("key-stdin"),
    });
    passphrase = resolvedKey.passphrase;
    if (resolvedKey.usedCliArg) {
      app.warn(
        "Passphrase supplied via --key CLI flag is visible in process listings; prefer VAULT_BACKUP_KEY or --key-stdin.",
      );
    }
  } catch (err: any) {
    app.error(err.message);
    process.exit(1);
  }

  const resolvedBackup = path.resolve(backupFile);

  if (restoreMode) {
    if (!fs.existsSync(resolvedBackup)) {
      app.error(`Backup file not found: ${resolvedBackup}`);
      process.exit(1);
    }
    try {
      const encrypted = fs.readFileSync(resolvedBackup);
      const tarGzBytes = decryptVaultPayload(encrypted, passphrase);
      const entries = unpackTarGz(tarGzBytes);
      const destRoot = path.resolve(outDir);
      fs.mkdirSync(destRoot, { recursive: true, mode: 0o700 });
      let restoredFiles = 0;
      for (const entry of entries) {
        const normalized = entry.name.replace(/\\/g, "/");
        if (
          !normalized ||
          normalized.startsWith("/") ||
          normalized.split("/").some((seg) => seg === "..")
        ) {
          throw new Error(`Unsafe path in backup archive: ${entry.name}`);
        }
        const target = path.resolve(destRoot, normalized);
        if (target !== destRoot && !target.startsWith(destRoot + path.sep)) {
          throw new Error(`Path escapes restore root: ${entry.name}`);
        }
        if (entry.type === "directory") {
          fs.mkdirSync(target, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, entry.data, { mode: entry.mode & 0o777 });
          restoredFiles++;
        }
      }
      app.success(
        `Verified & restored ${restoredFiles} file(s) into ${destRoot}`,
      );
    } catch (err: any) {
      app.error(`Restore failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      app.error(
        `Source path not found: ${sourcePath || "(pass --source <file_or_dir>)"}`,
      );
      process.exit(1);
    }
    try {
      const entries = collectSourceTarEntries(sourcePath);
      const tarGz = packTarGz(entries);
      const checksum = createHash("sha256").update(tarGz).digest("hex");
      const encrypted = encryptVaultPayload(tarGz, passphrase);
      // Verify round-trip integrity before writing
      const verified = decryptVaultPayload(encrypted, passphrase);
      if (createHash("sha256").update(verified).digest("hex") !== checksum) {
        throw new Error("Post-encryption integrity verification failed");
      }
      fs.mkdirSync(path.dirname(resolvedBackup), { recursive: true });
      const tmpPath = `${resolvedBackup}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
      fs.writeFileSync(tmpPath, encrypted, { mode: 0o600 });
      fs.renameSync(tmpPath, resolvedBackup);
      app.success(
        `Encrypted ${entries.length} item(s) -> ${resolvedBackup} (${encrypted.byteLength} bytes, SHA-256 ${checksum.slice(0, 16)}...)`,
      );
    } catch (err: any) {
      app.error(`Backup failed: ${err.message}`);
      process.exit(1);
    }
  }
}
