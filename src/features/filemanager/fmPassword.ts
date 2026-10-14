/**
 * Password hashing for the Crypto tab, with `Bun.password` (argon2id, argon2i, argon2d and bcrypt).
 *
 * A password is never stored, logged or put in an error message. Settings are bounded so nobody can freeze the app
 * by asking for a gigantic cost, and hashes pasted to be checked are parsed first so a hostile hash can't ask this
 * computer for far more memory or time than the same limits allow.
 */
import { performance } from "perf_hooks";
import { FmError } from "./fmPaths";

export const PASSWORD_ALGORITHMS = ["argon2id", "argon2i", "argon2d", "bcrypt"] as const;
export type PasswordAlgorithm = (typeof PASSWORD_ALGORITHMS)[number];

export const PASSWORD_LIMITS = {
  /** Argon2 memory in KiB (8 KiB to 1 GiB). */
  memoryCost: { min: 8, max: 1024 * 1024, default: 65536 },
  /** Argon2 passes. */
  timeCost: { min: 1, max: 10, default: 2 },
  /** bcrypt work factor (each +1 doubles the time). */
  cost: { min: 4, max: 16, default: 10 },
  /** The longest hash text that is read when checking. */
  hashChars: 512,
  /** The longest a single hash or check may take before it is given up on. */
  timeoutMs: 60_000,
};

export interface PasswordParams {
  algorithm: PasswordAlgorithm;
  memoryCost?: number;
  timeCost?: number;
  cost?: number;
}

const BCRYPT_NOTE = "bcrypt only reads the first 72 bytes of a password. Bun avoids silently cutting longer passwords off by first squashing them with SHA-512, so a hash made here for such a password will not check out in other bcrypt programs.";

function intIn(value: unknown, range: { min: number; max: number; default: number }, what: string): number {
  if (value === undefined || value === null || value === "") return range.default;
  const n = Number(value);
  if (!Number.isInteger(n) || n < range.min || n > range.max) throw new FmError("BAD_REQUEST", `${what} must be a whole number from ${range.min.toLocaleString("en-US")} to ${range.max.toLocaleString("en-US")}.`);
  return n;
}

/** Checks the settings of a request and fills in the defaults. */
export function passwordParams(body: Record<string, any>): Required<PasswordParams> {
  const algorithm = body.algorithm === undefined ? "argon2id" : String(body.algorithm);
  if (!(PASSWORD_ALGORITHMS as readonly string[]).includes(algorithm)) throw new FmError("BAD_REQUEST", "Choose argon2id, argon2i, argon2d or bcrypt.");
  const L = PASSWORD_LIMITS;
  return {
    algorithm: algorithm as PasswordAlgorithm,
    memoryCost: intIn(body.memoryCost, L.memoryCost, "The memory cost (in KiB)"),
    timeCost: intIn(body.timeCost, L.timeCost, "The number of passes"),
    cost: intIn(body.cost, L.cost, "The bcrypt cost"),
  };
}

/** A rough guess of how long a hash takes on a typical computer, from measurements of Bun's implementation (not a promise). */
export function estimatePasswordMs(p: Required<PasswordParams>): number {
  if (p.algorithm === "bcrypt") return Math.round(45 * 2 ** (p.cost - 10));
  return Math.max(1, Math.round((p.memoryCost / 1024) * p.timeCost * 0.5));
}

export interface ParsedHash {
  algorithm: PasswordAlgorithm;
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
  cost?: number;
}

const ARGON = /^\$(argon2id|argon2i|argon2d)\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
const BCRYPT = /^\$2[abxy]\$(\d\d)\$[./A-Za-z0-9]{53}$/;

/** Reads the algorithm and cost settings out of a stored hash, or returns null when it isn't one Bun can check. */
export function parsePasswordHash(hash: string): ParsedHash | null {
  const a = ARGON.exec(hash);
  if (a) return { algorithm: a[1] as PasswordAlgorithm, memoryCost: Number(a[3]), timeCost: Number(a[4]), parallelism: Number(a[5]) };
  const b = BCRYPT.exec(hash);
  if (b) return { algorithm: "bcrypt", cost: Number(b[1]) };
  return null;
}

export const describeHash = (p: ParsedHash): string =>
  p.algorithm === "bcrypt" ? `bcrypt, cost ${p.cost}` : `${p.algorithm}, ${p.memoryCost! >= 1024 ? `${Math.round((p.memoryCost! / 1024) * 10) / 10} MiB` : `${p.memoryCost} KiB`} of memory, ${p.timeCost} pass${p.timeCost === 1 ? "" : "es"}, ${p.parallelism} thread${p.parallelism === 1 ? "" : "s"}`;

let busy = false;

/** One password job at a time: the work is heavy on purpose, so several at once would only slow the computer down. */
async function exclusive<T>(run: () => Promise<T>): Promise<T> {
  if (busy) throw new FmError("TOO_MANY", "A password hash is already being worked out. Wait for it to finish.");
  busy = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new FmError("TIMEOUT", "That took too long, so it was given up on. Choose smaller settings.")), PASSWORD_LIMITS.timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    busy = false;
  }
}

export interface HashedPassword {
  hash: string;
  algorithm: PasswordAlgorithm;
  description: string;
  ms: number;
  estimateMs: number;
  note: string;
}

/** Hashes a password into the standard stored form ($argon2id$... or $2b$...). Runs off the main loop (Bun's threadpool). */
export async function hashPassword(password: string, p: Required<PasswordParams>): Promise<HashedPassword> {
  if (password === "") throw new FmError("BAD_REQUEST", "Enter a password first.");
  const options = p.algorithm === "bcrypt" ? ({ algorithm: "bcrypt", cost: p.cost } as const) : ({ algorithm: p.algorithm, memoryCost: p.memoryCost, timeCost: p.timeCost } as const);
  const t0 = performance.now();
  let hash: string;
  try {
    hash = await exclusive(() => Bun.password.hash(password, options));
  } catch (err) {
    if (err instanceof FmError) throw err;
    throw new FmError("HASH_FAILED", "Couldn't hash that password.");
  }
  const parsed = parsePasswordHash(hash);
  return {
    hash,
    algorithm: p.algorithm,
    description: parsed ? describeHash(parsed) : p.algorithm,
    ms: Math.round((performance.now() - t0) * 10) / 10,
    estimateMs: estimatePasswordMs(p),
    note: p.algorithm === "bcrypt" && Buffer.byteLength(password, "utf8") > 72 ? BCRYPT_NOTE : "",
  };
}

export interface PasswordCheck {
  /** Named `matches`, not `ok`: `ok` is the HTTP envelope's own flag. */
  matches: boolean;
  algorithm: PasswordAlgorithm;
  description: string;
  ms: number;
}

/** Checks a password against a stored hash. The algorithm is read from the hash itself. */
export async function checkPassword(password: string, hashRaw: string): Promise<PasswordCheck> {
  const hash = hashRaw.trim();
  if (!hash) throw new FmError("BAD_REQUEST", "Paste the stored hash first.");
  if (password === "") throw new FmError("BAD_REQUEST", "Enter a password first.");
  if (hash.length > PASSWORD_LIMITS.hashChars) throw new FmError("TOO_LARGE", "That is too long to be a password hash.");
  const parsed = parsePasswordHash(hash);
  if (!parsed) throw new FmError("BAD_HASH", "That doesn't look like a password hash this tool can check. It should start with $argon2id$, $argon2i$, $argon2d$ or $2b$ (bcrypt) and have no spaces or line breaks.");
  const L = PASSWORD_LIMITS;
  if (parsed.algorithm === "bcrypt") {
    if (parsed.cost! < L.cost.min || parsed.cost! > L.cost.max) throw new FmError("TOO_COSTLY", `That bcrypt hash uses cost ${parsed.cost}. This tool only checks costs from ${L.cost.min} to ${L.cost.max}, so a pasted hash can't tie up the computer.`);
  } else if (parsed.memoryCost! > L.memoryCost.max || parsed.timeCost! > L.timeCost.max || parsed.parallelism! > 16 || parsed.memoryCost! < L.memoryCost.min || parsed.timeCost! < 1) {
    throw new FmError("TOO_COSTLY", `That hash asks for ${describeHash(parsed)}. This tool only checks hashes using up to 1 GiB of memory and ${L.timeCost.max} passes, so a pasted hash can't tie up the computer.`);
  }
  const t0 = performance.now();
  let matches: boolean;
  try {
    matches = await exclusive(() => Bun.password.verify(password, hash));
  } catch (err) {
    if (err instanceof FmError) throw err;
    throw new FmError("BAD_HASH", "That hash is damaged, so it can't be checked.");
  }
  return { matches, algorithm: parsed.algorithm, description: describeHash(parsed), ms: Math.round((performance.now() - t0) * 10) / 10 };
}
