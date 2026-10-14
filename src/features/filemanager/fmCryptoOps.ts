import { promises as fsp } from "fs";
import { performance } from "perf_hooks";
import { formatDigestReport, type HashRow } from "../../crypto_tools";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext, type FmHandler } from "./fmCore";
import {
  MAX_RANDOM_BYTES, MAX_TEXT_BYTES, checkChecksum, decryptText, encodeText, encryptText, estimateEntropy, fastAlgorithms, fastText, generateValue, hashAlgorithms,
  hashText, hmacAlgorithms, inspectJwt, inspectUuid, parseRows, secretField, textField,
} from "./fmCrypto";
import { CLASSIC_IDS, FAST_GROUP_TITLE, HASH_SPECS, digestFile as digestFileWith, hashHints, type HashSpec } from "./fmHashes";
import { convertColor } from "./fmColor";
import { PASSWORD_ALGORITHMS, PASSWORD_LIMITS, checkPassword, estimatePasswordMs, hashPassword, passwordParams } from "./fmPassword";
import { FmError, describeFsError, uniqueName, validateName } from "./fmPaths";

const MAX_FILES = 20;
const ms = (t0: number) => Math.round((performance.now() - t0) * 10) / 10;

interface FileDigest {
  path: string;
  name: string;
  ok: boolean;
  size?: number;
  rows?: HashRow[];
  /** The fast checksums (CRC32, xxHash, ...), kept apart because they are not secure. */
  fast?: HashRow[];
  /** Kinds left out (and why): the ones that need the whole file at once, for a very big file. */
  skipped?: Array<{ label: string; reason: string }>;
  ms?: number;
  error?: string;
}

/** Hashes one file by streaming it (it is never loaded into memory at once). Problems are reported per file. */
async function digestFile(ctx: FmContext, input: unknown, specs: HashSpec[]): Promise<FileDigest> {
  const path = absolutePath(ctx, input);
  const name = pathApi(ctx).basename(path);
  const t0 = performance.now();
  try {
    const st = await fsp.stat(path);
    if (st.isDirectory()) return { path, name, ok: false, error: "That is a folder. Only files can be hashed." };
    if (!st.isFile()) return { path, name, ok: false, error: "That isn't an ordinary file, so it can't be hashed." };
    const { rows, size, skipped } = await digestFileWith(path, specs);
    return { path, name, ok: true, size, rows: rows.filter((r) => r.spec.group !== "fast").map((r) => [r.spec.label, r.value] as HashRow), fast: rows.filter((r) => r.spec.group === "fast").map((r) => [r.spec.label, r.value] as HashRow), skipped: skipped.map((x) => ({ label: x.spec.label, reason: x.reason })), ms: ms(t0) };
  } catch (err) {
    return { path, name, ok: false, error: describeFsError(err, "read that file").message };
  }
}

/** The kinds worth working out for a pasted checksum: the ones whose result has that many digits (the five classic ones when unsure). */
function specsForChecksum(expected: string): HashSpec[] {
  const lengths = new Set((expected.match(/[0-9a-fA-F]{8,128}/g) ?? []).map((w) => w.length));
  const fitting = HASH_SPECS.filter((s) => lengths.has(s.hex));
  return fitting.length ? fitting : HASH_SPECS.filter((s) => CLASSIC_IDS.includes(s.id));
}

const cleanSource = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.replace(/[\u0000-\u001f]+/g, " ").slice(0, 1000) : fallback);

/** Writes the report as a new file in `folder`. A name that is taken gets "(2)", "(3)" ...; nothing is overwritten. */
async function saveDigests(ctx: FmContext, b: Record<string, any>): Promise<{ path: string; name: string }> {
  const rows = parseRows(b.rows);
  const text = formatDigestReport(rows, cleanSource(b.source, "Text input"));
  const folder = absolutePath(ctx, b.folder);
  await assertFolder(folder, "That folder");
  assertCreatable(ctx, folder);
  const wanted = typeof b.name === "string" && b.name.trim() ? b.name.trim() : "Digests.txt";
  const reason = validateName(wanted, ctx.platform);
  if (reason) throw new FmError("BAD_NAME", reason);
  const p = pathApi(ctx);
  const taken = new Set((await fsp.readdir(folder)).map((n) => n.toLowerCase()));
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = uniqueName(wanted, (n) => taken.has(n.toLowerCase()));
    const target = p.join(folder, name);
    try {
      await fsp.writeFile(target, text, { flag: "wx" });
      return { path: target, name };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
      taken.add(name.toLowerCase()); // appeared meanwhile: try the next free name
    }
  }
  throw new FmError("NO_FREE_NAME", "Could not find a free name for the report.");
}

/** API operations of the "Crypto" power tool, namespaced `crypto/...`. */
export const cryptoOperations: Record<string, FmHandler> = {
  async "crypto/info"() {
    return {
      limits: { textBytes: MAX_TEXT_BYTES, randomBytes: MAX_RANDOM_BYTES, files: MAX_FILES },
      hashes: hashAlgorithms(),
      fast: { title: FAST_GROUP_TITLE, algorithms: fastAlgorithms(), seed: 0, note: "Each result is the number the function returns, written in hex with the most significant digit first (8 digits for 32-bit results, 16 for 64-bit ones)." },
      hints: hashHints(),
      hmacs: hmacAlgorithms(),
      password: { algorithms: PASSWORD_ALGORITHMS, limits: PASSWORD_LIMITS },
      aes: { cipher: "AES-256-CBC", key: "SHA-256 of the passphrase (no salt, no stretching)", authenticated: false, format: "ivHex:base64" },
    };
  },

  async "crypto/hash"(_ctx, b) {
    const text = textField(b.text, "text");
    const key = secretField(b.key, "key");
    const t0 = performance.now();
    return { rows: hashText(text, key), fast: fastText(text), hmac: key !== "", bytes: Buffer.byteLength(text, "utf8"), ms: ms(t0), hints: hashHints(), fastTitle: FAST_GROUP_TITLE };
  },

  async "crypto/encrypt"(_ctx, b) {
    const text = textField(b.text, "the text to lock", { required: true });
    const passphrase = secretField(b.passphrase, "a passphrase", { required: true });
    const t0 = performance.now();
    const output = encryptText(text, passphrase);
    return { output, bytes: Buffer.byteLength(text, "utf8"), ms: ms(t0) };
  },

  async "crypto/decrypt"(_ctx, b) {
    const cipher = textField(b.cipher, "the locked text", { required: true });
    const passphrase = secretField(b.passphrase, "the passphrase", { required: true });
    const t0 = performance.now();
    const { text, suspicious } = decryptText(cipher, passphrase);
    return { text, suspicious, bytes: Buffer.byteLength(cipher, "utf8"), ms: ms(t0) };
  },

  async "crypto/pwhash"(_ctx, b) {
    const password = secretField(b.password, "a password", { required: true });
    return { ...(await hashPassword(password, passwordParams(b))) };
  },

  async "crypto/pwcheck"(_ctx, b) {
    const password = secretField(b.password, "a password", { required: true });
    return { ...(await checkPassword(password, secretField(b.hash, "the stored hash", { required: true }))) };
  },

  /** A rough time guess for the chosen settings (no password involved). */
  async "crypto/pwcost"(_ctx, b) {
    const p = passwordParams(b);
    return { estimateMs: estimatePasswordMs(p) };
  },

  async "crypto/entropy"(_ctx, b) {
    return { ...estimateEntropy(textField(b.text, "text")) };
  },

  async "crypto/generate"(_ctx, b) {
    return { ...generateValue(b) };
  },

  async "crypto/uuid"(_ctx, b) {
    return { ...inspectUuid(b.text) };
  },

  async "crypto/color"(_ctx, b) {
    return { ...convertColor(b.text) };
  },

  async "crypto/jwt"(_ctx, b) {
    const token = textField(b.token, "token", { required: true });
    const secret = secretField(b.secret, "the secret");
    return { ...inspectJwt(token, secret) };
  },

  async "crypto/encode"(_ctx, b) {
    const text = textField(b.text, "text");
    const t0 = performance.now();
    return { ...encodeText(b.mode, text), bytes: Buffer.byteLength(text, "utf8"), ms: ms(t0) };
  },

  async "crypto/filehash"(ctx, b) {
    if (!Array.isArray(b.paths) || b.paths.length === 0) throw new FmError("BAD_REQUEST", "Choose a file to hash.");
    if (b.paths.length > MAX_FILES) throw new FmError("TOO_MANY", `Hash up to ${MAX_FILES} files at a time.`);
    // Normally the five classic digests; `extras: true` adds every other secure kind and the fast checksums (slower for big files).
    const specs = b.extras === true ? HASH_SPECS : HASH_SPECS.filter((s) => CLASSIC_IDS.includes(s.id));
    const results: FileDigest[] = [];
    for (const p of b.paths) results.push(await digestFile(ctx, p, specs));
    return { results, hints: hashHints(), fastTitle: FAST_GROUP_TITLE };
  },

  /** Checks a pasted checksum against digests: of a file (`path`), of some text (`text`), or ones the page already has (`rows`). */
  async "crypto/verify"(ctx, b) {
    const expected = textField(b.expected, "checksum", { required: true });
    let rows: HashRow[];
    let source: string;
    if (typeof b.path === "string") {
      const file = await digestFile(ctx, b.path, specsForChecksum(expected));
      if (!file.ok) throw new FmError("CANNOT_HASH", file.error!);
      rows = [...file.rows!, ...file.fast!];
      source = file.name;
    } else if (typeof b.text === "string") {
      const text = textField(b.text, "text");
      rows = [...hashText(text), ...fastText(text)];
      source = "the text";
    } else {
      rows = parseRows(b.rows);
      source = cleanSource(b.source, "the results");
    }
    const { match, hint } = checkChecksum(expected, rows);
    return { matched: match !== null, match, hint, source, rows };
  },

  async "crypto/report"(_ctx, b) {
    return { text: formatDigestReport(parseRows(b.rows), cleanSource(b.source, "Text input")) };
  },

  async "crypto/savedigests"(ctx, b) {
    return await saveDigests(ctx, b);
  },
};
