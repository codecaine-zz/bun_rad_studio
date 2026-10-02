import zlib from "node:zlib";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export interface ZipEntryInput {
  name: string;
  data: string | Uint8Array;
}

export interface ZipEntryHeader {
  name: string;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  offset: number;
  compressionMethod: number;
}

// Doer: Pack memory entries into standard PKZIP binary buffer (pure calculation)
export function zipFiles(entries: ZipEntryInput[]): Uint8Array {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let currentOffset = 0;

  for (const entry of entries) {
    const rawData = typeof entry.data === "string" ? Buffer.from(entry.data, "utf-8") : Buffer.from(entry.data);
    const compressed = zlib.deflateRawSync(rawData);
    const crc = Bun.hash.crc32(rawData);
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, "/"), "utf-8");

    // Local file header: 30 bytes + name length + data length
    const local = Buffer.alloc(30 + nameBuf.length + compressed.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // compression method (deflate)
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(crc, 14); // crc32
    local.writeUInt32LE(compressed.length, 18); // compressed size
    local.writeUInt32LE(rawData.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26); // name length
    local.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(local, 30);
    compressed.copy(local, 30 + nameBuf.length);

    localHeaders.push(local);

    // Central directory header: 46 bytes + name length
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // method (deflate)
    central.writeUInt16LE(0, 12); // time
    central.writeUInt16LE(0, 14); // date
    central.writeUInt32LE(crc, 16); // crc32
    central.writeUInt32LE(compressed.length, 20); // compressed size
    central.writeUInt32LE(rawData.length, 24); // uncompressed size
    central.writeUInt16LE(nameBuf.length, 28); // name length
    central.writeUInt16LE(0, 30); // extra field len
    central.writeUInt16LE(0, 32); // comment len
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // internal attr
    central.writeUInt32LE(0, 38); // external attr
    central.writeUInt32LE(currentOffset, 42); // relative offset of local header
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    currentOffset += local.length;
  }

  const centralOffset = currentOffset;
  const centralTotalSize = centralHeaders.reduce((acc, h) => acc + h.length, 0);

  // End of Central Directory (EOCD): 22 bytes
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(entries.length, 8); // total records on disk
  eocd.writeUInt16LE(entries.length, 10); // total records
  eocd.writeUInt32LE(centralTotalSize, 12); // size of central directory
  eocd.writeUInt32LE(centralOffset, 16); // offset of central directory
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

// Doer: Parse Central Directory headers from Zip buffer
function parseCentralDirectory(buf: Buffer): ZipEntryHeader[] {
  const headers: ZipEntryHeader[] = [];
  let pos = 0;
  while (pos < buf.length - 4) {
    const sig = buf.readUInt32LE(pos);
    if (sig === 0x02014b50) {
      const method = buf.readUInt16LE(pos + 10);
      const crc = buf.readUInt32LE(pos + 16);
      const compSize = buf.readUInt32LE(pos + 20);
      const uncompSize = buf.readUInt32LE(pos + 24);
      const nameLen = buf.readUInt16LE(pos + 28);
      const extraLen = buf.readUInt16LE(pos + 30);
      const commentLen = buf.readUInt16LE(pos + 32);
      const offset = buf.readUInt32LE(pos + 42);
      const name = buf.toString("utf-8", pos + 46, pos + 46 + nameLen);

      headers.push({
        name,
        crc32: crc,
        compressedSize: compSize,
        uncompressedSize: uncompSize,
        offset,
        compressionMethod: method,
      });

      pos += 46 + nameLen + extraLen + commentLen;
    } else {
      pos++;
    }
  }
  return headers;
}

// Coordinator: List all file entries inside Zip archive asynchronously
export async function listZipEntries(zipDataOrPath: Uint8Array | string): Promise<string[]> {
  const buf = typeof zipDataOrPath === "string"
    ? Buffer.from(await Bun.file(zipDataOrPath).bytes())
    : Buffer.from(zipDataOrPath);
  return parseCentralDirectory(buf).map((h) => h.name);
}

// Coordinator: Read and decompress specific file from Zip archive asynchronously
export async function readZipEntry(
  zipDataOrPath: Uint8Array | string,
  entryName: string
): Promise<Uint8Array | null> {
  const buf = typeof zipDataOrPath === "string"
    ? Buffer.from(await Bun.file(zipDataOrPath).bytes())
    : Buffer.from(zipDataOrPath);
  const headers = parseCentralDirectory(buf);
  const entry = headers.find((h) => h.name === entryName);
  if (!entry) return null;

  const localOffset = entry.offset;
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed;
  }
  return zlib.inflateRawSync(compressed);
}

// Coordinator: Unzip archive to destination directory asynchronously
export async function unzipToDir(zipDataOrPath: Uint8Array | string, destDir: string): Promise<void> {
  const buf = typeof zipDataOrPath === "string"
    ? Buffer.from(await Bun.file(zipDataOrPath).bytes())
    : Buffer.from(zipDataOrPath);
  const headers = parseCentralDirectory(buf);
  for (const h of headers) {
    if (h.name.endsWith("/")) {
      await mkdir(join(destDir, h.name), { recursive: true });
      continue;
    }
    const data = await readZipEntry(buf, h.name);
    if (data) {
      const outPath = join(destDir, h.name);
      await mkdir(dirname(outPath), { recursive: true });
      await Bun.write(outPath, data);
    }
  }
}

// Coordinator: Zip single file to destination zip path asynchronously
export async function zipFile(srcPath: string, destZipPath: string): Promise<void> {
  const file = Bun.file(srcPath);
  const data = await file.bytes();
  const name = srcPath.split(/[/\\]/).pop() || "file";
  const bytes = zipFiles([{ name, data }]);
  await mkdir(dirname(destZipPath), { recursive: true });
  await Bun.write(destZipPath, bytes);
}

// Coordinator: Recursively zip directory to destination zip path asynchronously
export async function zipDir(srcDir: string, destZipPath: string): Promise<void> {
  const entries: ZipEntryInput[] = [];

  async function walk(current: string) {
    const list = await readdir(current, { withFileTypes: true });
    for (const item of list) {
      const full = join(current, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile()) {
        const rel = relative(srcDir, full).replace(/\\/g, "/");
        const fileBytes = await Bun.file(full).bytes();
        entries.push({ name: rel, data: fileBytes });
      }
    }
  }

  await walk(srcDir);
  const bytes = zipFiles(entries);
  await mkdir(dirname(destZipPath), { recursive: true });
  await Bun.write(destZipPath, bytes);
}

export const archiveutils = {
  zipFiles,
  zipFile,
  zipDir,
  listZipEntries,
  readZipEntry,
  unzipToDir,
};
