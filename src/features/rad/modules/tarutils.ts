import { mkdir, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export interface TarEntry {
  name: string;
  data: Uint8Array | string;
}

export interface UnpackedTarEntry {
  name: string;
  data: Uint8Array;
  text: string;
}

// Doer: Create 512-byte POSIX ustar header block
function createTarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0, "utf-8"); // name
  header.write("0000644\0", 100); // file mode
  header.write("0000000\0", 108); // uid
  header.write("0000000\0", 116); // gid
  header.write(size.toString(8).padStart(11, "0") + "\0", 124); // size
  header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136); // mtime
  header.fill(" ", 148, 156); // checksum placeholder
  header.write("0", 156); // typeflag (regular file)
  header.write("ustar\0", 257); // magic
  header.write("00", 263); // version

  // Calculate header checksum (sum of all 512 unsigned bytes with chksum treated as spaces)
  let chksum = 0;
  for (let i = 0; i < 512; i++) {
    chksum += header[i]!;
  }
  header.write(chksum.toString(8).padStart(6, "0") + "\0 ", 148);
  return header;
}

// Coordinator: Pack memory entries into TAR binary buffer
export function packTarBytes(entries: TarEntry[]): Uint8Array {
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    const rawData = typeof entry.data === "string" ? Buffer.from(entry.data, "utf-8") : Buffer.from(entry.data);
    const header = createTarHeader(entry.name.replace(/\\/g, "/"), rawData.length);
    chunks.push(header);
    chunks.push(rawData);

    // Pad file content to 512-byte boundary
    const remainder = rawData.length % 512;
    if (remainder > 0) {
      chunks.push(Buffer.alloc(512 - remainder));
    }
  }

  // End of archive marker: 1024 zero bytes
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

// Coordinator: Unpack TAR binary buffer into array of files
export function unpackTarBytes(bytes: Uint8Array): UnpackedTarEntry[] {
  const buf = Buffer.from(bytes);
  const entries: UnpackedTarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= buf.length) {
    const headerBlock = buf.subarray(offset, offset + 512);
    // Check if end of archive (all zeroes)
    if (headerBlock.every((b) => b === 0)) break;

    const rawName = headerBlock.subarray(0, 100).toString("utf-8");
    const name = rawName.replace(/\0/g, "").trim();
    if (!name) break;

    const rawSize = headerBlock.subarray(124, 136).toString("utf-8").replace(/\0/g, "").trim();
    const size = parseInt(rawSize, 8) || 0;

    offset += 512;
    const fileData = buf.subarray(offset, offset + size);
    entries.push({
      name,
      data: fileData,
      text: Buffer.from(fileData).toString("utf-8"),
    });

    // Advance past file content and padding
    const remainder = size % 512;
    const padding = remainder > 0 ? 512 - remainder : 0;
    offset += size + padding;
  }

  return entries;
}

// Coordinator: Create TAR file from directory asynchronously
export async function createTarFile(srcDir: string, destTarPath: string): Promise<void> {
  const entries: TarEntry[] = [];

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
  const tarBytes = packTarBytes(entries);
  await mkdir(dirname(destTarPath), { recursive: true });
  await Bun.write(destTarPath, tarBytes);
}

// Coordinator: Extract TAR file to target directory asynchronously
export async function extractTarFile(tarPath: string, destDir: string): Promise<void> {
  const file = Bun.file(tarPath);
  const tarBytes = await file.bytes();
  const entries = unpackTarBytes(tarBytes);
  for (const entry of entries) {
    const outPath = join(destDir, entry.name);
    await mkdir(dirname(outPath), { recursive: true });
    await Bun.write(outPath, entry.data);
  }
}

export const tarutils = {
  packTarBytes,
  unpackTarBytes,
  createTarFile,
  extractTarFile,
};
