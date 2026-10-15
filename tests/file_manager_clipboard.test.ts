/**
 * "Copy to the clipboard" for files (clip/image and clip/text): what is copied, what is refused and why, and that the
 * real clipboard is never touched (every test uses a recording clipboard).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { MAX_CLIP_IMAGE_BYTES, MAX_CLIP_TEXT_BYTES, copyImageToClipboard, copyTextFileToClipboard } from "../src/features/filemanager/fmClipboardOps";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-clip-test-"));
const home = join(root, "home");
const work = join(home, "work");
mkdirSync(work, { recursive: true });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function sandbox(over: { text?: boolean; image?: boolean } = {}) {
  const got: { text: string[]; image: Array<{ file: string; mime: string }> } = { text: [], image: [] };
  const ctx = createContext({
    home, dataDir: join(root, "data"),
    clipboard: {
      writeText: (t) => { if (over.text === false) return false; got.text.push(t); return true; },
      writeImage: async (file, mime) => { if (over.image === false) return false; got.image.push({ file, mime }); return true; },
    },
  });
  return { ctx, got };
}
const put = (name: string, body: string | Buffer) => { writeFileSync(join(work, name), body); return join(work, name); };
const fails = async (p: Promise<unknown>, code: string, text?: RegExp) => {
  try { await p; } catch (e: any) { expect(e.code).toBe(code); if (text) expect(e.message).toMatch(text); return; }
  throw new Error(`expected ${code}`);
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe("copy a text file's contents", () => {
  test("puts the whole text on the clipboard, with line and character counts", async () => {
    const { ctx, got } = sandbox();
    const r = await copyTextFileToClipboard(ctx, put("a.txt", "one\ntwo\nthree\n"));
    expect(r).toEqual({ copied: true, chars: 14, lines: 3 });
    expect(got.text).toEqual(["one\ntwo\nthree\n"]);
  });
  test("keeps Unicode and unusual names, drops a byte-order mark, and counts a last line with no newline", async () => {
    const { ctx, got } = sandbox();
    const file = put("żółć 日本語 \"quoted\" $(x).md", "\uFEFFhéllo 🌍\nlast");
    const r = await copyTextFileToClipboard(ctx, file);
    expect(got.text[0]).toBe("héllo 🌍\nlast");
    expect(r.lines).toBe(2);
  });
  test("refuses binary files, invalid UTF-8, empty files, big files, folders, missing files and relative paths", async () => {
    const { ctx, got } = sandbox();
    await fails(copyTextFileToClipboard(ctx, put("b.bin", Buffer.from([1, 2, 0, 3]))), "NOT_TEXT");
    await fails(copyTextFileToClipboard(ctx, put("latin1.txt", Buffer.from([0x68, 0xe9, 0x6c, 0x6c, 0x6f]))), "NOT_TEXT", /UTF-8/);
    await fails(copyTextFileToClipboard(ctx, put("empty.txt", "")), "EMPTY");
    await fails(copyTextFileToClipboard(ctx, put("big.txt", Buffer.alloc(MAX_CLIP_TEXT_BYTES + 1, 97))), "TOO_BIG", /5(\.0)? MB/);
    await fails(copyTextFileToClipboard(ctx, work), "NOT_A_FILE");
    await fails(copyTextFileToClipboard(ctx, join(work, "missing.txt")), "ENOENT");
    await fails(copyTextFileToClipboard(ctx, "relative.txt"), "BAD_PATH");
    await fails(copyTextFileToClipboard(ctx, "a\0b"), "BAD_PATH");
    expect(got.text).toEqual([]);
  });
  test("says so when no clipboard tool works", async () => {
    const { ctx } = sandbox({ text: false });
    await fails(copyTextFileToClipboard(ctx, put("c.txt", "x")), "CLIPBOARD_FAILED", /clipboard/);
  });
  test("a link to a text file copies the text it points to", async () => {
    const { ctx, got } = sandbox();
    const target = put("target.txt", "linked");
    symlinkSync(target, join(work, "link.txt"));
    await copyTextFileToClipboard(ctx, join(work, "link.txt"));
    expect(got.text).toEqual(["linked"]);
  });
});

describe("copy a picture", () => {
  test("hands the file and its type to the clipboard tool", async () => {
    const { ctx, got } = sandbox();
    await copyImageToClipboard(ctx, put("p.png", PNG));
    await copyImageToClipboard(ctx, put("q.JPG", PNG));
    await copyImageToClipboard(ctx, put("r.webp", PNG));
    expect(got.image).toEqual([
      { file: join(work, "p.png"), mime: "image/png" },
      { file: join(work, "q.JPG"), mime: "image/jpeg" },
      { file: join(work, "r.webp"), mime: "image/webp" },
    ]);
  });
  test("refuses things that are not pictures, are too big, are folders or are missing", async () => {
    const { ctx, got } = sandbox();
    await fails(copyImageToClipboard(ctx, put("notes.txt", "x")), "NOT_AN_IMAGE");
    await fails(copyImageToClipboard(ctx, put("fake.png.txt", "x")), "NOT_AN_IMAGE");
    await fails(copyImageToClipboard(ctx, work), "NOT_A_FILE");
    await fails(copyImageToClipboard(ctx, join(work, "gone.png")), "ENOENT");
    const big = join(work, "huge.png");
    writeFileSync(big, "");
    Bun.spawnSync(["truncate", "-s", String(MAX_CLIP_IMAGE_BYTES + 1), big]);
    if (Bun.file(big).size > MAX_CLIP_IMAGE_BYTES) await fails(copyImageToClipboard(ctx, big), "TOO_BIG");
    expect(got.image).toEqual([]);
  });
  test("says so when the tool can't do it, so the page can try the browser", async () => {
    const { ctx } = sandbox({ image: false });
    await fails(copyImageToClipboard(ctx, put("s.png", PNG)), "CLIPBOARD_FAILED", /format|tool/);
  });
});

describe("the API", () => {
  test("clip/text and clip/image answer over HTTP, need the token, and report refusals as errors", async () => {
    const copied: string[] = [];
    const server = startFileManagerServer({ port: 0, token: "tok", context: { home, dataDir: join(root, "data3"), clipboard: { writeText: (t) => { copied.push(t); return true; }, writeImage: async () => true } } });
    const call = async (op: string, body: unknown, token = "tok") => {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": token }, body: JSON.stringify(body) });
      return { status: res.status, json: (await res.json()) as any };
    };
    try {
      const file = put("api.txt", "over http");
      const ok = await call("clip/text", { path: file });
      expect([ok.status, ok.json.ok, ok.json.copied, ok.json.lines]).toEqual([200, true, true, 1]);
      expect(copied).toEqual(["over http"]);
      expect((await call("clip/text", { path: file }, "wrong")).status).toBe(401);
      const refused = await call("clip/text", { path: put("api.bin", Buffer.from([0, 1])) });
      expect(refused.json.ok).toBe(false);
      expect(refused.json.error.code).toBe("NOT_TEXT");
      expect((await call("clip/image", { path: put("api.png", PNG) })).json.copied).toBe(true);
      expect((await call("clip/image", { path: file })).json.error.code).toBe("NOT_AN_IMAGE");
    } finally {
      server.stop(true);
    }
  });
});
