/**
 * Reads `.env` files the way Bun does at start-up, but only to look: nothing in a file is ever executed, no file
 * outside the folders asked about is touched, and links, huge files and binary files are refused.
 *
 * Bun loads these from the folder it starts in, in this order (later wins): `.env`, `.env.<mode>`, `.env.local`
 * (not in test mode), `.env.<mode>.local`. The mode is NODE_ENV; production and test pick their own files, anything
 * else (including nothing) means development. Real environment variables win over all of them, and `$NAME`,
 * `${NAME}` and `${NAME:-fallback}` are expanded from the real environment and what the same file defined before (`\$` keeps a literal dollar sign).
 * tests/file_manager_db_dotenv.test.ts compares this reader with the real Bun loader.
 */
import { promises as fsp } from "fs";
import { join } from "path";

export const DOTENV_MAX_BYTES = 256 * 1024;
const MAX_LINES = 4000;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type DotenvMode = "production" | "development" | "test";

export function dotenvMode(nodeEnv: string | undefined): DotenvMode {
  return nodeEnv === "production" ? "production" : nodeEnv === "test" ? "test" : "development";
}

/** The files Bun reads for a NODE_ENV, lowest precedence first. */
export function dotenvFileNames(nodeEnv: string | undefined): string[] {
  const mode = dotenvMode(nodeEnv);
  return mode === "test" ? [".env", ".env.test", ".env.test.local"] : [".env", `.env.${mode}`, ".env.local", `.env.${mode}.local`];
}

export interface RawEntry {
  name: string;
  raw: string;
  /** The quote the value was written in, or "" when it had none. */
  quote: "" | '"' | "'" | "`";
}

/** Splits a file into NAME=value entries without expanding anything. Lines that aren't assignments are skipped. */
export function parseDotenv(text: string): RawEntry[] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  const out: RawEntry[] = [];
  for (let i = 0; i < lines.length && i < MAX_LINES; i++) {
    let line = lines[i]!.trimStart();
    if (!line || line.startsWith("#")) continue;
    if (/^export\s+/.test(line)) line = line.replace(/^export\s+/, "");
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    if (!NAME.test(name)) continue;
    let rest = line.slice(eq + 1).trimStart();
    const q = rest[0];
    if (q === '"' || q === "'" || q === "`") {
      // A quoted value runs to the matching quote, and may continue over several lines.
      let body = rest.slice(1);
      let close = findClose(body, q);
      let extra = 0;
      while (close < 0 && i + 1 + extra < lines.length && extra < 200) {
        extra++;
        body += "\n" + lines[i + extra]!;
        close = findClose(body, q);
      }
      if (close >= 0) {
        out.push({ name, raw: body.slice(0, close), quote: q });
        i += extra;
        continue;
      }
      // never closed: it is taken as plain text below
    }
    // Bun ends an unquoted value at the first # (even without a space before it).
    let value = rest;
    const hash = value.indexOf("#");
    if (hash >= 0) value = value.slice(0, hash);
    out.push({ name, raw: value.trim(), quote: "" });
  }
  return out;
}

function findClose(body: string, q: string): number {
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && q === '"') {
      i++;
      continue;
    }
    if (body[i] === q) return i;
  }
  return -1;
}

/** Expands `$NAME`, `${NAME}` and `${NAME:-fallback}`; `\$` stays a dollar sign. Unknown names become empty. */
export function expandValue(raw: string, quote: RawEntry["quote"], lookup: (name: string) => string | undefined): string {
  let text = raw;
  if (quote === '"') text = text.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"');
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\" && text[i + 1] === "$") {
      out += "$";
      i++;
      continue;
    }
    if (c !== "$") {
      out += c;
      continue;
    }
    const braced = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/.exec(text.slice(i));
    if (braced) {
      const got = lookup(braced[1]!);
      out += got !== undefined && got !== "" ? got : (braced[2] ?? "");
      i += braced[0].length - 1;
      continue;
    }
    const plain = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(text.slice(i));
    if (plain) {
      out += lookup(plain[1]!) ?? "";
      i += plain[0].length - 1;
      continue;
    }
    out += c;
  }
  return out;
}

export interface DotenvFile {
  /** ".env", ".env.local" ... */
  name: string;
  path: string;
  /** Why it was not read: "missing" files are normal and not reported. */
  skipped?: "link" | "not-a-file" | "too-big" | "binary" | "unreadable";
  /** How many NAME=value lines it defines. */
  count: number;
}

export interface DotenvValue {
  value: string;
  /** The file this value finally came from (the highest-precedence one that sets it). */
  file: string;
  path: string;
}

export interface DotenvFolder {
  dir: string;
  files: DotenvFile[];
  values: Map<string, DotenvValue>;
}

/** Reads one file without following a link; null when it doesn't exist. */
export async function readDotenvFile(path: string): Promise<{ text: string } | { skipped: NonNullable<DotenvFile["skipped"]> } | null> {
  let st;
  try {
    st = await fsp.lstat(path);
  } catch {
    return null;
  }
  if (st.isSymbolicLink()) return { skipped: "link" };
  if (!st.isFile()) return { skipped: "not-a-file" };
  if (st.size > DOTENV_MAX_BYTES) return { skipped: "too-big" };
  try {
    const bytes = await fsp.readFile(path);
    if (bytes.includes(0)) return { skipped: "binary" };
    return { text: bytes.toString("utf8") };
  } catch {
    return { skipped: "unreadable" };
  }
}

/**
 * Reads the `.env*` files Bun would load from `dir`, in Bun's order, and returns the final value of each name.
 * `realEnv` is what the process already had: it wins, and is also used when a value refers to `$OTHER`.
 */
export async function readDotenvFolder(dir: string, nodeEnv: string | undefined, realEnv: Record<string, string | undefined>): Promise<DotenvFolder> {
  const files: DotenvFile[] = [];
  const values = new Map<string, DotenvValue>();
  for (const name of dotenvFileNames(nodeEnv)) {
    // A reference sees the real environment and what the same file defined before it (not other files: Bun's rule).
    const defined = new Map<string, string>();
    const lookup = (n: string) => realEnv[n] ?? defined.get(n);
    const path = join(dir, name);
    const read = await readDotenvFile(path);
    if (!read) continue;
    if ("skipped" in read) {
      files.push({ name, path, skipped: read.skipped, count: 0 });
      continue;
    }
    const entries = parseDotenv(read.text);
    files.push({ name, path, count: entries.length });
    for (const e of entries) {
      const value = expandValue(e.raw, e.quote, lookup);
      defined.set(e.name, value);
      values.set(e.name, { value, file: name, path });
    }
  }
  return { dir, files, values };
}
