/**
 * The reading side of the RADENC container: parses the authenticated plaintext stream, checks every entry against
 * strict rules and writes it into a fresh temporary folder. Nothing here can write outside that folder, overwrite
 * anything, or follow a link; the caller moves the finished result into place.
 */
import * as fs from "node:fs";
import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";
import { randomBytes } from "node:crypto";
import { MAX_ENTRIES, MAX_MANIFEST_BYTES, MAX_NAME_BYTES, checkEntryPath, collisionKey, componentProblem, unsafe, type Manifest } from "./fmVaultContainer";
import { VaultError, throwIfAborted } from "./fmVaultFormat";
import { platformName, type Platform } from "./fmPaths";

const EMPTY = Buffer.alloc(0);
const WRITE_SIZE = 1 << 20;
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Pulls exact amounts of bytes out of a stream of buffers. */
class Pull {
  private it: AsyncIterator<Buffer>;
  private buf: Buffer = EMPTY;
  private ended = false;
  constructor(source: AsyncIterable<Buffer>) {
    this.it = source[Symbol.asyncIterator]();
  }
  private async fill(): Promise<boolean> {
    while (this.buf.length === 0) {
      if (this.ended) return false;
      const next = await this.it.next();
      if (next.done) {
        this.ended = true;
        return false;
      }
      this.buf = next.value;
    }
    return true;
  }
  async exact(n: number): Promise<Buffer> {
    if (n === 0) return EMPTY;
    const parts: Buffer[] = [];
    let need = n;
    while (need > 0) {
      if (!(await this.fill())) throw unsafe("the contents end too early");
      const take = this.buf.subarray(0, need);
      this.buf = this.buf.subarray(take.length);
      parts.push(take);
      need -= take.length;
    }
    return parts.length === 1 ? parts[0]! : Buffer.concat(parts);
  }
  async some(max: number): Promise<Buffer> {
    if (!(await this.fill())) throw unsafe("the contents end too early");
    const take = this.buf.subarray(0, max);
    this.buf = this.buf.subarray(take.length);
    return take;
  }
  async hasMore(): Promise<boolean> {
    return this.fill();
  }
  /** Stops the source early (an error, or a cancel) so its files and streams are released. */
  async close(): Promise<void> {
    this.ended = true;
    await this.it.return?.().catch(() => {});
  }
}

export interface ExtractOptions {
  /** Where the temporary folder is made. */
  tempParent: string;
  platform?: Platform;
  signal?: AbortSignal;
  onBytes?: (n: number) => void;
  /** Filled in as soon as the temporary folder exists, so the caller can remove it after a failure. */
  state: { tempDir?: string };
}

export interface Extracted {
  kind: "file" | "folder";
  name: string;
  /** The extracted item inside the temporary folder. */
  path: string;
  entries: number;
  bytes: number;
}

function parseManifest(json: Buffer, platform: Platform): Manifest {
  let m: any;
  try {
    m = JSON.parse(decoder.decode(json));
  } catch {
    throw unsafe("the table of contents is unreadable");
  }
  const intIn = (v: unknown, max: number) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
  if (!m || typeof m !== "object" || m.v !== 1) throw unsafe("the table of contents has an unknown version");
  if (m.kind !== "file" && m.kind !== "folder") throw unsafe("the table of contents has an unknown kind");
  if (typeof m.name !== "string" || componentProblem(m.name, platform) || Buffer.byteLength(m.name, "utf8") > MAX_NAME_BYTES) throw unsafe("the original name isn't safe");
  if (typeof m.created !== "string" || m.created.length > 64) throw unsafe("the table of contents is invalid");
  if (!intIn(m.count, MAX_ENTRIES) || !intIn(m.bytes, Number.MAX_SAFE_INTEGER)) throw unsafe("the table of contents has impossible sizes");
  if (m.kind === "file" && m.count !== 1) throw unsafe("the table of contents is inconsistent");
  return { v: 1, kind: m.kind, name: m.name, created: m.created, count: m.count, bytes: m.bytes };
}

async function freeSpace(dir: string): Promise<number | null> {
  try {
    const s = await (fsp as any).statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

export async function extractContainer(source: AsyncIterable<Buffer>, opts: ExtractOptions): Promise<Extracted> {
  const pull = new Pull(source);
  try {
    return await extractFrom(pull, opts);
  } finally {
    await pull.close();
  }
}

async function extractFrom(pull: Pull, opts: ExtractOptions): Promise<Extracted> {
  const platform = opts.platform ?? platformName();
  const p = platform === "win32" ? nodePath.win32 : nodePath.posix;

  if ((await pull.exact(1))[0] !== 0x4d) throw unsafe("the table of contents is missing");
  const len = (await pull.exact(4)).readUInt32BE(0);
  if (len > MAX_MANIFEST_BYTES) throw unsafe("the table of contents is too large");
  const manifest = parseManifest(await pull.exact(len), platform);

  const free = await freeSpace(opts.tempParent);
  if (free !== null && manifest.bytes > free) {
    throw new VaultError("NO_SPACE", `There isn't enough free space here to unlock this (it needs about ${Math.ceil(manifest.bytes / 1048576)} MB). Choose another folder or free some space.`);
  }

  const tempDir = p.join(opts.tempParent, `.radenc-${randomBytes(6).toString("hex")}.tmp`);
  await fsp.mkdir(tempDir, { mode: 0o700 });
  opts.state.tempDir = tempDir;
  const root = p.join(tempDir, manifest.name);
  if (manifest.kind === "folder") await fsp.mkdir(root, { mode: 0o700 });

  const kinds = new Map<string, "file" | "dir">();
  const explicit = new Set<string>();
  const made = new Set<string>();
  const dirMeta: Array<{ abs: string; mode: number; mtime: number; depth: number }> = [];
  let entries = 0;
  let bytes = 0;

  const safeJoin = (parts: string[]) => {
    const abs = p.join(root, ...parts);
    if (!abs.startsWith(root + p.sep)) throw unsafe("a path that leaves the destination");
    return abs;
  };

  const register = (parts: string[], isDir: boolean) => {
    for (let i = 1; i < parts.length; i++) {
      const key = collisionKey(parts.slice(0, i).join("/"), platform);
      const k = kinds.get(key);
      if (k === "file") throw unsafe("a file that is also used as a folder");
      if (!k) kinds.set(key, "dir");
    }
    const key = collisionKey(parts.join("/"), platform);
    const existing = kinds.get(key);
    if (existing !== undefined) {
      if (explicit.has(key)) throw unsafe("the same name twice");
      if (!isDir) throw unsafe("a file that is also used as a folder");
    }
    kinds.set(key, isDir ? "dir" : "file");
    explicit.add(key);
  };

  const ensureParents = async (parts: string[]) => {
    for (let i = 1; i < parts.length; i++) {
      const key = collisionKey(parts.slice(0, i).join("/"), platform);
      if (made.has(key)) continue;
      await fsp.mkdir(safeJoin(parts.slice(0, i)), { mode: 0o700 });
      made.add(key);
    }
  };

  for (;;) {
    throwIfAborted(opts.signal);
    const tag = (await pull.exact(1))[0];
    if (tag === 0x45) break;
    if (tag !== 0x46 && tag !== 0x44) throw unsafe("an unknown kind of entry");
    if (++entries > manifest.count) throw unsafe("more entries than announced");
    const plen = (await pull.exact(2)).readUInt16BE(0);
    if (plen === 0 || plen > 1024) throw unsafe("a path of impossible length");
    let path: string;
    try {
      path = decoder.decode(await pull.exact(plen));
    } catch {
      throw unsafe("a path that isn't valid text");
    }
    const parts = checkEntryPath(path, platform);
    const meta = await pull.exact(10);
    const mode = meta.readUInt16BE(0);
    const mtime = meta.readDoubleBE(2);
    const isDir = tag === 0x44;

    if (manifest.kind === "file") {
      if (isDir || parts.length !== 1 || path !== manifest.name || entries !== 1) throw unsafe("the contents don't match the table of contents");
    }
    register(parts, isDir);

    if (isDir) {
      const key = collisionKey(path, platform);
      if (!made.has(key)) {
        await ensureParents(parts);
        await fsp.mkdir(safeJoin(parts), { mode: 0o700 });
        made.add(key);
      }
      dirMeta.push({ abs: safeJoin(parts), mode, mtime, depth: parts.length });
      continue;
    }

    const sizeBytes = await pull.exact(8);
    const size = sizeBytes.readUInt32BE(0) * 2 ** 32 + sizeBytes.readUInt32BE(4);
    if (!Number.isSafeInteger(size) || size > manifest.bytes - bytes) throw unsafe("a file larger than announced");
    const abs = manifest.kind === "file" ? root : (await ensureParents(parts), safeJoin(parts));
    const fh = await fsp.open(abs, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    try {
      let left = size;
      while (left > 0) {
        throwIfAborted(opts.signal);
        const piece = await pull.some(Math.min(left, WRITE_SIZE));
        let off = 0;
        while (off < piece.length) off += (await fh.write(piece, off, piece.length - off)).bytesWritten;
        left -= piece.length;
        opts.onBytes?.(piece.length);
      }
    } finally {
      await fh.close();
    }
    bytes += size;
    if (platform !== "win32") await fsp.chmod(abs, (mode & 0o777) | 0o600).catch(() => {});
    if (Number.isFinite(mtime) && mtime > 0 && mtime < 8.64e15) await fsp.utimes(abs, new Date(mtime), new Date(mtime)).catch(() => {});
  }

  if (await pull.hasMore()) throw unsafe("extra data after the end");
  if (entries !== manifest.count || bytes !== manifest.bytes) throw unsafe("the contents don't match the table of contents");

  dirMeta.sort((a, b) => b.depth - a.depth);
  for (const d of dirMeta) {
    if (platform !== "win32") await fsp.chmod(d.abs, (d.mode & 0o777) | 0o700).catch(() => {});
    if (Number.isFinite(d.mtime) && d.mtime > 0 && d.mtime < 8.64e15) await fsp.utimes(d.abs, new Date(d.mtime), new Date(d.mtime)).catch(() => {});
  }
  return { kind: manifest.kind, name: manifest.name, path: root, entries, bytes };
}
