#!/usr/bin/env bun
/**
 * vault_cli: lock and unlock files and folders with a password, from the command line.
 * Makes and opens the same `.radenc` files as the File Manager (format: docs/reference/vault-format.md),
 * so encrypted files are never tied to this app.
 *
 *   bun run cli:vault encrypt <path...> [--level standard|maximum] [--no-compress] [--hide-name] [--out DIR]
 *   bun run cli:vault decrypt <file...> [--out DIR]
 *   bun run cli:vault info <file>
 *
 * The password comes from a hidden prompt (asked twice when locking), or `--password-file FILE`, or the RADENC_PASSWORD
 * environment variable. There is deliberately no `--password` option: anything typed on the command line is visible to
 * other programs and stays in the shell history.
 *
 * Exit codes: 0 done, 1 error, 2 wrong password or damaged file.
 */
import { promises as fsp, statSync } from "node:fs";
import { homedir } from "node:os";
import * as nodePath from "node:path";
import { decryptFile, encryptItem, inspectFile, vaultErrorInfo } from "../src/features/filemanager/fmVaultEngine";
import { EXTENSION, LEVELS, WRONG_OR_DAMAGED, type Level } from "../src/features/filemanager/fmVaultFormat";
import { checkPasswordPolicy } from "../src/features/filemanager/fmVaultPolicy";
import { formatSize, protectedReason } from "../src/features/filemanager/fmPaths";

const USAGE = `vault_cli: lock and unlock files and folders with a password (RADENC v1)

Usage:
  vault_cli encrypt <path...> [--level standard|maximum] [--no-compress] [--hide-name] [--out DIR]
  vault_cli decrypt <file...> [--out DIR]
  vault_cli info <file>

Options:
  --level standard|maximum   how hard the password is to guess by brute force (default standard: 256 MB, ~0.5 s;
                             maximum uses 1 GB and takes a few seconds)
  --no-compress              don't compress before encrypting
  --hide-name                name the result "Encrypted file 1${EXTENSION}" instead of "<name>${EXTENSION}"
  --out DIR                  put results in DIR (default: next to each original)
  --password-file FILE       read the password from the first line of FILE
  -h, --help                 show this help

The password is asked for with a hidden prompt, or read from --password-file, or from the RADENC_PASSWORD environment
variable. There is no --password option on purpose. If the password is lost, the files can't be recovered.

Exit codes: 0 done, 1 error, 2 wrong password or damaged file.`;

class UsageError extends Error {}

interface Options {
  command: string;
  paths: string[];
  level: Level;
  compress: boolean;
  hideName: boolean;
  out?: string;
  passwordFile?: string;
}

function parseArgs(argv: string[]): Options | "help" {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) return "help";
  const [command, ...rest] = argv;
  if (command !== "encrypt" && command !== "decrypt" && command !== "info") throw new UsageError(`Unknown command "${command}". Use encrypt, decrypt or info.`);
  const o: Options = { command, paths: [], level: "standard", compress: true, hideName: false };
  const value = (i: number, name: string) => {
    const v = rest[i + 1];
    if (v === undefined || (v.startsWith("--") && v.length > 2)) throw new UsageError(`${name} needs a value.`);
    return v;
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    const [name, inline] = a.startsWith("--") && a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    const take = () => (inline !== undefined ? inline : (i++, value(i - 1, name)));
    switch (name) {
      case "--password":
      case "-p":
        throw new UsageError("There is no --password option: a password on the command line is visible to other programs. Use the hidden prompt, --password-file FILE, or the RADENC_PASSWORD environment variable.");
      case "--level": {
        const v = take();
        if (v !== "standard" && v !== "maximum") throw new UsageError('--level must be "standard" or "maximum".');
        o.level = v;
        break;
      }
      case "--no-compress": o.compress = false; break;
      case "--hide-name": o.hideName = true; break;
      case "--out": o.out = take(); break;
      case "--password-file": o.passwordFile = take(); break;
      case "--": o.paths.push(...rest.slice(i + 1)); i = rest.length; break;
      default:
        if (a.startsWith("-") && a.length > 1) throw new UsageError(`Unknown option ${a}. Try --help.`);
        o.paths.push(a);
    }
  }
  if (o.paths.length === 0) throw new UsageError(o.command === "encrypt" ? "Give at least one file or folder to encrypt." : o.command === "decrypt" ? "Give at least one .radenc file to decrypt." : "Give a file to look at.");
  if (o.command === "info" && o.paths.length !== 1) throw new UsageError("info takes exactly one file.");
  return o;
}

/** Reads a password without echoing it. Backspace works; Ctrl-C cancels. */
function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    process.stderr.write(label);
    let text = "";
    const finish = (err?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
      if (err) reject(err);
      else resolve(text);
    };
    const onData = (chunk: string) => {
      if (chunk.startsWith("\u001b")) return; // arrow keys and other escape sequences
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") return finish(new UsageError("Cancelled."));
        if (ch === "\u0004" && text === "") return finish(new UsageError("Cancelled."));
        if (ch === "\u007f" || ch === "\b") text = [...text].slice(0, -1).join("");
        else if (ch >= " ") text += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword(o: Options, confirm: boolean): Promise<string> {
  if (o.passwordFile) {
    try {
      const mode = statSync(o.passwordFile).mode;
      if (process.platform !== "win32" && (mode & 0o077) !== 0) process.stderr.write(`Warning: ${o.passwordFile} can be read by other users. Run: chmod 600 ${o.passwordFile}\n`);
      const text = await fsp.readFile(o.passwordFile, "utf8");
      return text.split(/\r?\n/, 1)[0] ?? "";
    } catch {
      throw new UsageError(`Can't read the password file "${o.passwordFile}".`);
    }
  }
  const fromEnv = process.env.RADENC_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) throw new UsageError("No password given and no terminal to ask on. Use --password-file FILE or set RADENC_PASSWORD.");
  const first = await promptHidden("Password: ");
  if (confirm) {
    const second = await promptHidden("Type it again: ");
    if (first !== second) throw new UsageError("The two passwords are not the same.");
  }
  return first;
}

function resolveOut(out: string | undefined): string | undefined {
  if (!out) return undefined;
  const dir = nodePath.resolve(out);
  const reason = protectedReason(dir, { home: homedir() }, "create");
  if (reason) throw new UsageError(reason);
  return dir;
}

const WRONG_CODES = new Set(["WRONG_PASSWORD", "NOT_RADENC", "UNSUPPORTED", "BAD_PARAMS", "BAD_CONTAINER"]);

function progressLine(name: string): { onPhase: (p: string) => void; onBytes: (n: number) => void; done: () => void } {
  let total = 0;
  let dirty = false;
  const tty = process.stderr.isTTY;
  return {
    onPhase: (phase) => {
      if (dirty) process.stderr.write("\n");
      dirty = false;
      const text = phase === "deriving" ? "making the key (this takes a moment)" : phase === "verifying" ? "checking the result" : phase === "finishing" ? "finishing" : phase;
      if (phase === "encrypting" || phase === "decrypting") return;
      process.stderr.write(`${name}: ${text}…\n`);
    },
    onBytes: (n) => {
      total += n;
      if (tty) {
        process.stderr.write(`\r${name}: ${formatSize(total)}      `);
        dirty = true;
      }
    },
    done: () => {
      if (dirty) process.stderr.write("\n");
      dirty = false;
    },
  };
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed === "help") {
    console.log(USAGE);
    return 0;
  }
  const o = parsed;

  if (o.command === "info") {
    const file = nodePath.resolve(o.paths[0]!);
    const info = await inspectFile(file);
    if (!info.valid) {
      console.log(`${file}: ${info.message}`);
      return 2;
    }
    const lv = info.level === "custom" ? "custom" : `${info.level} (${LEVELS[info.level].memoryKiB / 1024} MB, ${LEVELS[info.level].passes} passes)`;
    console.log(`${file}\n  RADENC version ${info.version}\n  strength: ${lv}\n  compressed: ${info.compressed ? "yes" : "no"}\n  size: ${formatSize(info.size)}\n  block size: ${formatSize(info.chunkSize)}`);
    console.log("The name and contents are inside, and need the password.");
    return 0;
  }

  const out = resolveOut(o.out);
  if (out) await fsp.mkdir(out, { recursive: true });
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());
  const sources = o.paths.map((p) => nodePath.resolve(p));
  let failed = 0;
  let damaged = 0;

  if (o.command === "encrypt") {
    const password = await readPassword(o, true);
    checkPasswordPolicy(password, sources.map((s) => nodePath.basename(s)));
    for (const source of sources) {
      const name = nodePath.basename(source);
      const p = progressLine(name);
      try {
        const r = await encryptItem({ source, outputDir: out ?? nodePath.dirname(source), password, level: o.level, compress: o.compress, hideName: o.hideName, signal: abort.signal, onPhase: p.onPhase, onBytes: (n, phase) => phase === "encrypting" && p.onBytes(n) });
        p.done();
        for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
        console.log(`Created ${r.output}`);
      } catch (err) {
        p.done();
        const info = vaultErrorInfo(err, "write the encrypted file");
        process.stderr.write(`${name}: ${info.message}\n`);
        if (info.code === "CANCELLED") return 130;
        failed++;
      }
    }
    if (failed === 0) process.stderr.write("Done. If you lose the password, these files can't be opened by anyone, including us.\n");
  } else {
    const password = await readPassword(o, false);
    for (const source of sources) {
      const name = nodePath.basename(source);
      const p = progressLine(name);
      try {
        const r = await decryptFile({ source, outputDir: out ?? nodePath.dirname(source), password, signal: abort.signal, onPhase: p.onPhase, onBytes: p.onBytes });
        p.done();
        console.log(`Created ${r.output}`);
      } catch (err) {
        p.done();
        const info = vaultErrorInfo(err, "read that file");
        process.stderr.write(`${name}: ${info.message}\n`);
        if (info.code === "CANCELLED") return 130;
        if (WRONG_CODES.has(info.code) || info.message === WRONG_OR_DAMAGED) damaged++;
        else failed++;
      }
    }
  }
  return damaged > 0 ? 2 : failed > 0 ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    if (err instanceof UsageError) process.stderr.write(`${err.message}\n`);
    else process.stderr.write(`${vaultErrorInfo(err).message}\n`);
    process.exit(1);
  },
);
