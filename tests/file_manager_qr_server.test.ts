import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { copyQrImage, openQrUrl, qrOperations, saveQr } from "../src/features/filemanager/fmQr";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import * as ui9 from "../resources/file_manager/ui/qrencode.js";
const { encodeQr }: any = ui9;
import * as ui10 from "../resources/file_manager/ui/qrrender.js";
const { qrToSvg, qrToText }: any = ui10;
import { deflateSync } from "zlib";

const root = mkdtempSync(join(tmpdir(), "fm-qr-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function crc(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}
/** A real PNG of a code, drawn here so no browser is needed. */
function pngOf(text: string): Buffer {
  const qr = encodeQr(text, { ecc: "M" });
  const scale = 4, border = 4, side = (qr.size + border * 2) * scale;
  const rows: Buffer[] = [];
  for (let y = 0; y < side; y++) {
    const row = Buffer.alloc(1 + side, 255);
    row[0] = 0;
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / scale) - border, my = Math.floor(y / scale) - border;
      if (mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx]) row[1 + x] = 0;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(side, 0); ihdr.writeUInt32BE(side, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

const copied: Array<{ file: string; mime: string; bytes: number }> = [];
const ctx = createContext({
  home: root, dataDir: join(root, "data"), platform: process.platform as any,
  clipboard: { writeImage: async (file: string, mime: string) => (copied.push({ file, mime, bytes: readFileSync(file).length }), true), writeText: () => true },
} as any);

describe("saving a QR code", () => {
  const dir = join(root, "out");
  mkdirSync(dir);
  const png = pngOf("https://example.com").toString("base64");

  test("a PNG is written with the right ending, and a second save gets a free name", async () => {
    const a = await saveQr(ctx, { dir, name: "qr-code", kind: "png", data: png });
    const b = await saveQr(ctx, { dir, name: "qr-code.png", kind: "png", data: png });
    expect(a.name).toBe("qr-code.png");
    expect(b.name).toBe("qr-code (2).png");
    expect(readFileSync(a.path).subarray(1, 4).toString()).toBe("PNG");
    expect(readdirSync(dir).sort()).toEqual(["qr-code (2).png", "qr-code.png"]);
  });
  test("an existing file is never replaced", async () => {
    writeFileSync(join(dir, "keep.svg"), "mine");
    const qr = encodeQr("hello");
    const r = await saveQr(ctx, { dir, name: "keep", kind: "svg", data: qrToSvg(qr) });
    expect(r.name).toBe("keep (2).svg");
    expect(readFileSync(join(dir, "keep.svg"), "utf8")).toBe("mine");
  });
  test("SVG and text are saved; the name can't escape the folder", async () => {
    const qr = encodeQr("hello");
    const s = await saveQr(ctx, { dir, name: "../../evil", kind: "svg", data: qrToSvg(qr) });
    expect(s.path.startsWith(dir)).toBe(true);
    expect(s.name.includes("/")).toBe(false);
    const t = await saveQr(ctx, { dir, name: "art", kind: "txt", data: qrToText(qr) });
    expect(readFileSync(t.path, "utf8")).toContain("█");
    expect(existsSync(join(root, "evil.svg"))).toBe(false);
  });
  test("only a real PNG, an SVG or text can be written, and each refusal says why", async () => {
    await expect(saveQr(ctx, { dir, kind: "png", data: Buffer.from("not a png at all, just text that is long enough to pass").toString("base64") })).rejects.toThrow(/isn't a PNG/);
    await expect(saveQr(ctx, { dir, kind: "png", data: "!!!" })).rejects.toThrow(/isn't valid/);
    await expect(saveQr(ctx, { dir, kind: "svg", data: "<html></html>" })).rejects.toThrow(/isn't an SVG/);
    await expect(saveQr(ctx, { dir, kind: "svg", data: '<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>' })).rejects.toThrow(/active content/);
    await expect(saveQr(ctx, { dir, kind: "exe", data: "x" })).rejects.toThrow(/PNG, SVG or text/);
    await expect(saveQr(ctx, { dir, kind: "txt", data: "" })).rejects.toThrow(/nothing to save/);
    await expect(saveQr(ctx, { dir: join(root, "missing"), kind: "txt", data: "x" })).rejects.toThrow();
    await expect(saveQr(ctx, { dir: "relative/path", kind: "txt", data: "x" })).rejects.toThrow(/full path/);
    await expect(saveQr(ctx, { dir: join(dir, "qr-code.png"), kind: "txt", data: "x" })).rejects.toThrow(/folder/);
  });
});

describe("copying a QR code as a picture", () => {
  test("the PNG goes to the clipboard through a temporary file that is removed", async () => {
    const png = pngOf("copy me");
    expect(await copyQrImage(ctx, png.toString("base64"))).toEqual({ copied: true });
    expect(copied.at(-1)).toMatchObject({ mime: "image/png", bytes: png.length });
    expect(existsSync(copied.at(-1)!.file)).toBe(false);
  });
  test("a clipboard that can't take pictures is reported, not hidden", async () => {
    const bad = createContext({ home: root, dataDir: join(root, "data2"), platform: process.platform as any, clipboard: { writeImage: async () => false, writeText: () => true } } as any);
    await expect(copyQrImage(bad, pngOf("x").toString("base64"))).rejects.toThrow(/clipboard/);
  });
});

describe("over HTTP", () => {
  test("qr/save needs the token and answers with the new name", async () => {
    const server = startFileManagerServer({ port: 0, token: "qr-token", context: { home: root, dataDir: join(root, "data3") } });
    try {
      const dir = join(root, "http");
      mkdirSync(dir);
      const call = async (token: string | null, body: unknown) => {
        const res = await fetch(`http://127.0.0.1:${server.port}/api/qr/save`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-fm-token": token } : {}) }, body: JSON.stringify(body) });
        return { status: res.status, json: (await res.json()) as any };
      };
      expect((await call(null, { dir, kind: "txt", data: "x" })).status).toBeGreaterThanOrEqual(400);
      const ok = await call("qr-token", { dir, name: "web", kind: "png", data: pngOf("hello").toString("base64") });
      expect(ok.json.ok === true || ok.json.name === "web.png" || ok.json.data?.name === "web.png").toBe(true);
      expect(existsSync(join(dir, "web.png"))).toBe(true);
    } finally {
      server.stop(true);
    }
  });
});

describe("opening an address read from a code", () => {
  const launched: Array<{ command: string; args: string[] }> = [];
  const c = createContext({ home: root, dataDir: join(root, "data4"), platform: "darwin", launch: async (command: string, args: string[]) => void launched.push({ command, args }) } as any);
  test("an ordinary web address is opened with the system opener", async () => {
    expect(await openQrUrl(c, "https://example.com/a?b=1#c")).toEqual({ opened: "https://example.com/a?b=1#c" });
    expect(launched.at(-1)).toEqual({ command: "open", args: ["https://example.com/a?b=1#c"] });
  });
  test("anything else is refused and nothing is started", async () => {
    const before = launched.length;
    for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "ftp://x.org", "smb://host/share", "https://user:pw@example.com/", "https://exa mple.com", "https://example.com/\nx", "", "   ", "not a url", `https://example.com/${"a".repeat(3000)}`]) {
      await expect(openQrUrl(c, bad), bad.slice(0, 30)).rejects.toThrow();
    }
    await expect(openQrUrl(c, 5 as any)).rejects.toThrow();
    expect(launched.length).toBe(before);
  });
  test("a missing opener gives a sentence", async () => {
    const gone = createContext({ home: root, dataDir: join(root, "data5"), platform: "linux", launch: async () => { throw Object.assign(new Error("x"), { code: "ENOENT" }); } } as any);
    await expect(openQrUrl(gone, "https://example.com")).rejects.toThrow(/xdg-open/);
  });
});

describe("the same operations under picture names (a frame of an animated GIF)", () => {
  test("png/save always writes a PNG, and png/copy puts it on the clipboard", async () => {
    const dir = join(root, "frames");
    mkdirSync(dir);
    const png = pngOf("frame").toString("base64");
    const r: any = await qrOperations["png/save"]!(ctx, { dir, name: "demo-frame-3", kind: "svg", data: png });
    expect(r.name).toBe("demo-frame-3.png");
    expect(readFileSync(r.path).subarray(1, 4).toString()).toBe("PNG");
    expect(await qrOperations["png/copy"]!(ctx, { data: png })).toEqual({ copied: true });
  });
});
