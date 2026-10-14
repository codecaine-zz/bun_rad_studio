/**
 * A small zip writer for the built-in converters: entries are given one at a time (a whole entry in memory, so each
 * is limited by the caller) and written to a file that is created exclusively, so nothing is ever overwritten.
 * No ZIP64: archives over 4 GB or 65,535 entries are refused with a plain message.
 */
import { promises as fsp } from "fs";
import * as zlib from "zlib";
import { ConvError } from "./fmConvCommon";

const U32 = 0xffffffff;

function dos(date: Date): { time: number; date: number } {
  const y = date.getFullYear();
  if (y < 1980) return { time: 0, date: (1 << 5) | 1 };
  return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() };
}

export class ZipFileWriter {
  private offset = 0;
  private readonly central: Buffer[] = [];
  private count = 0;
  private constructor(private readonly handle: fsp.FileHandle, private readonly path: string) {}

  static async create(path: string): Promise<ZipFileWriter> {
    return new ZipFileWriter(await fsp.open(path, "wx", 0o644), path);
  }

  private async write(buf: Buffer): Promise<void> {
    let done = 0;
    while (done < buf.length) {
      const { bytesWritten } = await this.handle.write(buf, done, buf.length - done);
      done += bytesWritten;
    }
    this.offset += buf.length;
  }

  /** Adds a file (or, with a name ending in "/", a folder) to the zip. */
  async add(name: string, data: Uint8Array, mtime = new Date(), mode = 0o644): Promise<void> {
    if (this.count >= 65_535) throw new ConvError("That's too many items for one zip file (the limit is 65,535).");
    const nameBuf = Buffer.from(name, "utf8");
    if (nameBuf.length > 0xffff) throw new ConvError("A file name inside is too long for a zip file.");
    const isDir = name.endsWith("/");
    const raw = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (raw.length > U32) throw new ConvError(`"${name}" is over 4 GB, which this zip writer doesn't support.`);
    const crc = isDir ? 0 : zlib.crc32(raw) >>> 0;
    const packed = isDir || raw.length === 0 ? Buffer.alloc(0) : zlib.deflateRawSync(raw, { level: 6 });
    const method = packed.length > 0 && packed.length < raw.length ? 8 : 0;
    const body = method === 8 ? packed : isDir ? Buffer.alloc(0) : raw;
    const { time, date } = dos(mtime);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(isDir ? 0 : raw.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    const localOffset = this.offset;
    await this.write(header);
    await this.write(nameBuf);
    await this.write(body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE((3 << 8) | 20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(isDir ? 0 : raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    const unix = ((mode & 0o170000) || (isDir ? 0o040000 : 0o100000)) | (mode & 0o777 || (isDir ? 0o755 : 0o644));
    cd.writeUInt32LE(((unix << 16) | (isDir ? 0x10 : 0)) >>> 0, 38);
    cd.writeUInt32LE(localOffset, 42);
    this.central.push(cd, nameBuf);
    this.count++;
  }

  /** Adds a file whose bytes arrive in pieces (so it is never held whole in memory). */
  async addStream(name: string, chunks: AsyncIterable<Buffer>, mtime = new Date(), mode = 0o644): Promise<void> {
    if (this.count >= 65_535) throw new ConvError("That's too many items for one zip file (the limit is 65,535).");
    const nameBuf = Buffer.from(name, "utf8");
    if (nameBuf.length > 0xffff) throw new ConvError("A file name inside is too long for a zip file.");
    const { time, date } = dos(mtime);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x808, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt16LE(nameBuf.length, 26);
    const localOffset = this.offset;
    await this.write(header);
    await this.write(nameBuf);
    const deflater = zlib.createDeflateRaw({ level: 6 });
    let crc = 0;
    let usize = 0;
    let csize = 0;
    const consumer = (async () => {
      for await (const c of deflater) {
        csize += (c as Buffer).length;
        await this.write(c as Buffer);
      }
    })();
    consumer.catch(() => {});
    try {
      for await (const c of chunks) {
        crc = zlib.crc32(c, crc);
        usize += c.length;
        if (usize > U32) throw new ConvError(`"${name}" is over 4 GB, which this zip writer doesn't support.`);
        if (!deflater.write(c)) await Promise.race([new Promise<void>((resolve) => deflater.once("drain", () => resolve())), consumer]);
      }
      deflater.end();
      await consumer;
    } catch (err) {
      deflater.destroy();
      throw err;
    }
    if (csize > U32) throw new ConvError(`"${name}" is over 4 GB, which this zip writer doesn't support.`);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc >>> 0, 4);
    descriptor.writeUInt32LE(csize, 8);
    descriptor.writeUInt32LE(usize, 12);
    await this.write(descriptor);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE((3 << 8) | 20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x808, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc >>> 0, 16);
    cd.writeUInt32LE(csize, 20);
    cd.writeUInt32LE(usize, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(((0o100000 | (mode & 0o777 || 0o644)) << 16) >>> 0, 38);
    cd.writeUInt32LE(localOffset, 42);
    this.central.push(cd, nameBuf);
    this.count++;
  }

  async finish(): Promise<void> {
    const start = this.offset;
    const size = this.central.reduce((n, b) => n + b.length, 0);
    for (const b of this.central) await this.write(b);
    if (this.offset + 22 > U32) throw new ConvError("The zip file would be over 4 GB, which this zip writer doesn't support.");
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.count, 8);
    end.writeUInt16LE(this.count, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(start, 16);
    await this.write(end);
    await this.handle.close();
  }

  /** Stops and removes the file (it was created by this writer, so it is the writer's to remove). */
  async abort(): Promise<void> {
    await this.handle.close().catch(() => {});
    await fsp.rm(this.path, { force: true }).catch(() => {});
  }
}

/** A whole small zip in memory (for spreadsheets). */
export function zipBuffer(entries: Array<{ name: string; data: Uint8Array }>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const now = dos(new Date());
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const raw = Buffer.from(e.data);
    const crc = zlib.crc32(raw) >>> 0;
    const packed = zlib.deflateRawSync(raw, { level: 6 });
    const method = packed.length < raw.length ? 8 : 0;
    const body = method === 8 ? packed : raw;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x800, 6);
    h.writeUInt16LE(method, 8);
    h.writeUInt16LE(now.time, 10);
    h.writeUInt16LE(now.date, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(body.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt16LE(now.time, 12);
    c.writeUInt16LE(now.date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    parts.push(h, nameBuf, body);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}
