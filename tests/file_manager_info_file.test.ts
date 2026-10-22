import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, truncateSync, writeFileSync } from "fs";
import { join } from "path";
import { crc32 } from "zlib";
import { createContext } from "../src/features/filemanager/fmCore";
import { fileInfo, localTime, parseMdls, parseQuarantine, permissionText } from "../src/features/filemanager/fmInfoFile";
import { folderInfo, manyInfo } from "../src/features/filemanager/fmInfoFolder";
import { imageInfo, mapUrl } from "../src/features/filemanager/fmInfoImageOps";
import { cancelTask, compareHash, hashFile, normalizeHash, startTask, taskView } from "../src/features/filemanager/fmInfoTasks";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";
import { icc, jpeg, png, scratchRoot, app1Exif, photoTiff } from "./file_manager_info_fixtures";

const root = scratchRoot("file");
afterAll(() => root.remove());
const home = join(root.dir, "home");
const dir = join(home, "work");
mkdirSync(dir, { recursive: true });
const launched: Array<{ command: string; args: string[] }> = [];
const ctx = createContext({ home, dataDir: join(root.dir, "data"), launch: async (command, args) => void launched.push({ command, args }) });
const put = (name: string, data: Buffer | string) => {
  const p = join(dir, name);
  writeFileSync(p, data);
  return p;
};
const rows = (groups: Array<{ id: string; rows: Array<{ label: string; value: string; flag?: string }> }>) => Object.fromEntries(groups.flatMap((g) => g.rows.map((r) => [`${g.id}/${r.label}`, r.value])));
const sha = (algo: string, b: Buffer) => createHash(algo).update(b).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tool = (n: string) => Bun.which(n);
const sys = (argv: string[]) => Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });

describe("general facts", () => {
  test("name, path, kind, type, size (bytes and on disk), dates", async () => {
    const p = put("pic.png", png({ w: 4, h: 4 }));
    const r = await fileInfo(ctx, p);
    const x = rows(r.groups);
    expect([r.name, r.isDir, r.isLink, r.mime, r.family, r.sniffKind]).toEqual(["pic.png", false, false, "image/png", "image", "png"]);
    expect(x["general/Full path"]).toBe(p);
    expect(x["general/Kind"]).toBe("PNG picture");
    expect(x["general/Size"]).toContain(`${readFileSync(p).length.toLocaleString("en-US")} bytes`);
    if (process.platform !== "win32") expect(x["general/Size on disk"]).toContain("blocks of 512 bytes");
    expect(x["dates/Modified"]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(x["dates/Opened"]).toBeDefined();
    if (process.platform !== "linux") expect(x["dates/Created"]).toBeDefined();
    expect(localTime(0)).toMatch(/^19(69|70)-/);
  });

  test("a name that doesn't match the content is flagged, but zip-based documents and aliases are not", async () => {
    const lie = await fileInfo(ctx, put("holiday.jpg", png()));
    const row = lie.groups[0]!.rows.find((r) => r.label === "Name and content")!;
    expect(row.flag).toBe("warn");
    expect(row.value).toContain("name ends in .jpg");
    expect(row.value).toContain("PNG");
    for (const [name, data] of [["ok.jpeg", jpeg()], ["fine.PNG", png()], ["notes.md", "# hi\n"], ["data.docx", Buffer.from([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]] as const) {
      expect((await fileInfo(ctx, put(name, data as Buffer))).groups[0]!.rows.some((r) => r.label === "Name and content"), name).toBe(false);
    }
  });

  test("permissions: octal, rwx text, owner and group names, executable and hidden", async () => {
    if (process.platform === "win32") return;
    const p = put(".secret.sh", "#!/bin/sh\n");
    chmodSync(p, 0o750);
    const x = rows((await fileInfo(ctx, p)).groups);
    expect(x["permissions/Permissions"]).toBe("750  (rwxr-x---)");
    expect(x["permissions/Hidden"]).toContain("starts with a dot");
    expect(x["permissions/Can be run"]).toContain("execute");
    expect(x["permissions/Owner and group"]).toMatch(/^\S+ : \S+$/);
    expect(permissionText(0o4755)).toBe("rwsr-xr-x");
    expect(permissionText(0o1777)).toBe("rwxrwxrwt");
    expect(permissionText(0o640)).toBe("rw-r-----");
  });

  test("a folder, an empty file and an item that is missing", async () => {
    const f = await fileInfo(ctx, dir);
    expect([f.isDir, f.kind, f.mime]).toEqual([true, "Folder", "inode/directory"]);
    const e = await fileInfo(ctx, put("empty.txt", ""));
    expect(rows(e.groups)["general/Size"]).toBe("0 bytes");
    await expect(fileInfo(ctx, join(dir, "nope.txt"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(fileInfo(ctx, "relative/path")).rejects.toMatchObject({ code: "BAD_PATH" });
    await expect(fileInfo(ctx, "/etc/passwd\0x")).rejects.toMatchObject({ code: "BAD_PATH" });
  });
});

describe("links and special files", () => {
  test("a link is described, not followed: its target is shown separately, and content readers refuse it", async () => {
    if (process.platform === "win32") return;
    const target = put("target.png", png());
    const link = join(dir, "link.png");
    symlinkSync(target, link);
    const r = await fileInfo(ctx, link);
    const x = rows(r.groups);
    expect(r.isLink).toBe(true);
    expect(r.realPath).toBe(await Bun.file(target).exists().then(() => require("fs").realpathSync(target)));
    expect(x["general/Link points to"]).toBe(target);
    expect(x["general/Target is"]).toBe("File");
    expect(r.groups.some((g) => g.id === "permissions")).toBe(true);
    await expect(imageInfo(ctx, link)).rejects.toMatchObject({ code: "IS_LINK", details: { target: r.realPath } });
    await expect(hashFile(ctx, link, { signal: new AbortController().signal, progress() {} })).rejects.toMatchObject({ code: "IS_LINK" });
  });

  test("a broken link is reported as pointing to nothing", async () => {
    if (process.platform === "win32") return;
    const link = join(dir, "dangling");
    symlinkSync(join(dir, "gone"), link);
    const r = await fileInfo(ctx, link);
    expect(r.realPath).toBeNull();
    expect(r.groups[0]!.rows.find((x) => x.label === "Target")!.flag).toBe("warn");
    await expect(imageInfo(ctx, link)).rejects.toMatchObject({ code: "IS_LINK", details: { target: null } });
  });

  test("a named pipe is refused without waiting for data", async () => {
    if (process.platform === "win32" || !sys(["which", "mkfifo"]).success) return;
    const fifo = join(dir, "pipe");
    sys(["mkfifo", fifo]);
    const start = Date.now();
    await expect(imageInfo(ctx, fifo)).rejects.toMatchObject({ code: "NOT_A_FILE" });
    await expect(fileInfo(ctx, fifo)).rejects.toMatchObject({ code: "NOT_A_FILE" });
    expect(Date.now() - start).toBeLessThan(1500);
  });
});

describe("what the operating system knows", () => {
  test("pure parsers: mdls output and the quarantine value", () => {
    const md = parseMdls(['kMDItemKind = "PNG image"', "kMDItemUserTags = (", '    Red,', '    "Project X"', ")", "kMDItemWhereFroms = (", '    "https://example.com/a.png",', '    "https://example.com/"', ")", "kMDItemFinderComment = (null)"].join("\n"));
    expect(md).toEqual({ kMDItemKind: ["PNG image"], kMDItemUserTags: ["Red", "Project X"], kMDItemWhereFroms: ["https://example.com/a.png", "https://example.com/"] });
    const q = parseQuarantine("0083;5f7a1b2c;Safari;ABCD-1234")!;
    expect(q).toMatchObject({ app: "Safari", flags: "0083" });
    expect(q.when).toMatch(/^2020-10-/);
    expect(parseQuarantine("nonsense")).toBeNull();
  });

  test.skipIf(process.platform !== "darwin")("macOS: kind, quarantine flag and extended attributes from the real system tools", async () => {
    const p = put("downloaded.png", png());
    sys(["/usr/bin/xattr", "-w", "com.apple.quarantine", "0083;5f7a1b2c;Safari;ABCD-1234", p]);
    const r = await fileInfo(ctx, p);
    const x = rows(r.groups);
    expect(x["security/Quarantine"]).toContain("Marked as downloaded from the internet by Safari");
    expect(r.groups.find((g) => g.id === "security")!.rows.find((row) => row.label === "Quarantine")!.flag).toBe("warn");
    expect(x["security/Extended attributes"]).toContain("com.apple.quarantine");
    const clean = rows((await fileInfo(ctx, put("clean.png", png()))).groups);
    expect(clean["security/Quarantine"]).toBe("Not marked");
  });

  test.skipIf(process.platform !== "darwin" || !existsSync("/usr/bin/codesign"))("macOS: a system program shows its signature summary", async () => {
    const x = rows((await fileInfo(ctx, "/bin/ls")).groups);
    expect(x["security/Code signature"]).toContain("Signed");
  });

  test.skipIf(process.platform !== "darwin")("macOS: Finder tags written as a real attribute are read back", async () => {
    const p = put("tagged.png", png());
    const plist = join(dir, "tags.plist");
    writeFileSync(plist, '<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><array><string>Red\n6</string></array></plist>');
    const bin = sys(["/usr/bin/plutil", "-convert", "binary1", "-o", "-", plist]);
    sys(["/usr/bin/xattr", "-wx", "com.apple.metadata:_kMDItemUserTags", Buffer.from(bin.stdout).toString("hex"), p]);
    const x = rows((await fileInfo(ctx, p)).groups);
    // Spotlight may not have indexed the new file yet; when it has, the tag is shown.
    if (x["macos/Finder tags"]) expect(x["macos/Finder tags"]).toContain("Red");
    expect(x["security/Extended attributes"]).toContain("_kMDItemUserTags");
  });

  test("other systems: nothing macOS-only is shown, and nothing breaks", async () => {
    const linuxCtx = createContext({ platform: "linux", home, dataDir: join(root.dir, "d2") });
    const r = await fileInfo(linuxCtx, put("plain.txt", "x"));
    expect(r.groups.some((g) => g.id === "macos")).toBe(false);
    const win = createContext({ platform: "win32", home: "C:\\Users\\u", dataDir: "C:\\x" });
    await expect(fileInfo(win, "relative")).rejects.toMatchObject({ code: "BAD_PATH" });
  });
});

describe("hashes", () => {
  const control = () => ({ signal: new AbortController().signal, progress() {} });

  test("MD5, SHA-1, SHA-256, SHA-512 and CRC32 agree with node:crypto, zlib and the shasum program", async () => {
    const data = Buffer.from("123456789");
    const p = put("nine.txt", data);
    const { rows: r, size } = await hashFile(ctx, p, control());
    const byId = Object.fromEntries(r.map((x) => [x.id, x.value]));
    expect(size).toBe(9);
    expect(byId.md5).toBe("25f9e794323b453885f5181f1b624d0b");
    expect(byId.crc32).toBe("cbf43926");
    for (const a of ["md5", "sha1", "sha256", "sha512"]) expect(byId[a]).toBe(sha(a, data));
    expect(byId.crc32).toBe((crc32(data) >>> 0).toString(16).padStart(8, "0"));
    if (tool("shasum")) expect(sys(["shasum", "-a", "256", p]).stdout.toString().split(" ")[0]!.replace(/^\\/, "")).toBe(byId.sha256!);
    if (tool("md5")) expect(sys(["md5", "-q", p]).stdout.toString().trim()).toBe(byId.md5!);
  });

  test("an empty file and a file bigger than one read chunk", async () => {
    const empty = await hashFile(ctx, put("zero", ""), control());
    expect(empty.rows.find((x) => x.id === "sha256")!.value).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const big = Buffer.alloc(3 * 1024 * 1024 + 17, 0x5a);
    const r = await hashFile(ctx, put("big.bin", big), control());
    expect(r.rows.find((x) => x.id === "sha256")!.value).toBe(sha("sha256", big));
    expect(r.rows.find((x) => x.id === "crc32")!.value).toBe((crc32(big) >>> 0).toString(16).padStart(8, "0"));
  });

  test("only the chosen kinds are made", async () => {
    const r = await hashFile(ctx, put("x.txt", "x"), control(), ["sha256", "crc32"]);
    expect(r.rows.map((x) => x.id)).toEqual(["sha256", "crc32"]);
    await expect(hashFile(ctx, put("y.txt", "y"), control(), ["nonsense"])).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("a job reports progress, finishes, and keeps its answer", async () => {
    const p = put("progress.bin", Buffer.alloc(40 * 1024 * 1024, 1));
    const task = startTask(ctx, "hash", (c) => hashFile(ctx, p, c));
    let last = -1;
    let seen = 0;
    for (;;) {
      const v = taskView(ctx, task.id);
      expect(v.done).toBeGreaterThanOrEqual(last);
      expect(v.done).toBeLessThanOrEqual(Math.max(v.total, 0));
      last = v.done;
      seen++;
      if (v.state !== "running") {
        expect(v.state).toBe("done");
        expect((v.result as any).rows).toHaveLength(5);
        expect(v.done).toBe(v.total);
        break;
      }
      await sleep(10);
    }
    expect(seen).toBeGreaterThan(1);
    expect(taskView(ctx, task.id).state).toBe("done");
  });

  test("cancelling stops a hash of a very large (sparse) file promptly", async () => {
    const p = join(dir, "huge.bin");
    writeFileSync(p, "");
    truncateSync(p, 3 * 1024 ** 3);
    const task = startTask(ctx, "hash", (c) => hashFile(ctx, p, c));
    await sleep(150);
    const mid = taskView(ctx, task.id);
    expect(mid.state).toBe("running");
    expect(mid.done).toBeGreaterThan(0);
    expect(cancelTask(ctx, task.id)).toBe(true);
    const start = Date.now();
    while (taskView(ctx, task.id).state === "running" && Date.now() - start < 3000) await sleep(10);
    const v = taskView(ctx, task.id);
    expect(v.state).toBe("cancelled");
    expect(v.done).toBeLessThan(v.total);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(cancelTask(ctx, task.id)).toBe(false);
  });

  test("only a few jobs may run at once, and stopping the server cancels them all", async () => {
    const p = join(dir, "huge2.bin");
    writeFileSync(p, "");
    truncateSync(p, 3 * 1024 ** 3);
    const local = createContext({ home, dataDir: join(root.dir, "d3") });
    const ids = [1, 2, 3, 4].map(() => startTask(local, "hash", (c) => hashFile(local, p, c)).id);
    expect(() => startTask(local, "hash", (c) => hashFile(local, p, c))).toThrow(/already being worked out/);
    for (const d of local.disposers.splice(0)) d();
    for (const id of ids) expect(() => taskView(local, id)).toThrow(/isn't running/);
  });

  test("unknown job ids and a folder are plain errors", async () => {
    expect(() => taskView(ctx, "nope")).toThrow();
    expect(cancelTask(ctx, 5 as any)).toBe(false);
    await expect(hashFile(ctx, dir, control())).rejects.toMatchObject({ code: "NOT_A_FILE" });
  });
});

describe("comparing with a fingerprint you were given", () => {
  const rowsFor = (data: Buffer) => [{ id: "md5", value: sha("md5", data) }, { id: "sha1", value: sha("sha1", data) }, { id: "sha256", value: sha("sha256", data) }, { id: "sha512", value: sha("sha512", data) }, { id: "crc32", value: (crc32(data) >>> 0).toString(16).padStart(8, "0") }];
  const data = Buffer.from("compare me");
  const r = rowsFor(data);
  const want = r.find((x) => x.id === "sha256")!.value;

  test("capitals, spaces, colons, 0x and an algorithm name in front are all fine", () => {
    for (const form of [want, want.toUpperCase(), ` ${want} `, `sha256:${want}`, `SHA256: ${want.toUpperCase()}`, `sha-256=${want}`, `SHA256 (file.txt) = ${want}`, want.replace(/(..)/g, "$1:").slice(0, -1), `${want}  file name.txt`, want.replace(/(.{8})/g, "$1 ")]) {
      expect(compareHash(form, r).matched, form).toBe("sha256");
    }
    expect(compareHash(r.find((x) => x.id === "crc32")!.value.toUpperCase(), r).matched).toBe("crc32");
    expect(compareHash(`md5:${r[0]!.value}`, r).matched).toBe("md5");
    expect(normalizeHash("0xABCDEF12")).toEqual({ hex: "abcdef12", named: null });
  });

  test("a different file, a wrong length and something that isn't a checksum are explained", () => {
    const other = compareHash(sha("sha256", Buffer.from("other")), r);
    expect(other.matched).toBeNull();
    expect(other.hint).toContain("does NOT match");
    expect(compareHash(want.slice(0, 50), r).hint).toContain("50 characters");
    expect(compareHash("hello there", r).hint).toContain("doesn't look like a checksum");
    expect(compareHash("", r).matched).toBeNull();
    expect(compareHash(`sha1:${want}`, r).matched).toBeNull();
    expect(compareHash(undefined, r).matched).toBeNull();
    expect(compareHash("a".repeat(100_000), r).matched).toBeNull();
  });
});

describe("folders and many items", () => {
  const base = join(dir, "tree");
  beforeAll(() => {
    mkdirSync(join(base, "a", "b"), { recursive: true });
    mkdirSync(join(base, ".hidden"), { recursive: true });
    writeFileSync(join(base, "one.txt"), "x".repeat(100));
    writeFileSync(join(base, "two.png"), png());
    writeFileSync(join(base, "a", "three.txt"), "y".repeat(5000));
    writeFileSync(join(base, "a", "b", "four.jpg"), jpeg());
    writeFileSync(join(base, ".hidden", "h.txt"), "z");
    if (process.platform !== "win32") {
      symlinkSync(base, join(base, "a", "loop"));
      symlinkSync(join(base, "one.txt"), join(base, "alias.txt"));
    }
  });

  test("counts, sizes, kinds, newest and oldest, largest; links are counted but never followed", async () => {
    const r = await folderInfo(ctx, base);
    const x = rows(r.groups);
    const links = process.platform === "win32" ? 0 : 2;
    expect([r.files, r.folders, r.partial]).toEqual([5, 3, false]);
    expect(x["general/Files"]).toBe("5");
    expect(x["general/Folders"]).toBe("3");
    expect(x["general/Items"]).toBe(String(5 + 3 + links));
    expect(x["general/Total size"]).toContain(`${(100 + png().length + 5000 + jpeg().length + 1).toLocaleString("en-US")} bytes`);
    expect(x["general/Hidden items"]).toBe("1");
    expect(r.bytes).toBe(100 + png().length + 5000 + jpeg().length + 1);
    expect(r.groups.find((g) => g.id === "largest")!.rows[0]!.label).toBe("three.txt");
    expect(r.groups.find((g) => g.id === "kinds")!.rows.length).toBeGreaterThanOrEqual(3);
    expect(x["general/Newest file"]).toContain("changed");
    expect(x["general/Oldest file"]).toContain("changed");
  });

  test("the item cap and the time cap give partial answers that say so", async () => {
    const capped = await folderInfo(ctx, base, { maxEntries: 3 });
    expect(capped.partial).toBe(true);
    expect(capped.groups[0]!.note).toContain("safety limit");
    const slow = await folderInfo(ctx, base, { maxMs: -1 });
    expect(slow.partial).toBe(true);
  });

  test("cancelling a scan of a big folder stops it and says it was stopped", async () => {
    const big = join(dir, "bigtree");
    for (let d = 0; d < 20; d++) {
      mkdirSync(join(big, `d${d}`), { recursive: true });
      for (let f = 0; f < 150; f++) writeFileSync(join(big, `d${d}`, `f${f}.txt`), "x");
    }
    const abort = new AbortController();
    let progressed = 0;
    const p = folderInfo(ctx, big, { signal: abort.signal, progress: () => { if (++progressed === 2) abort.abort(); } });
    const r = await p;
    expect(r.cancelled).toBe(true);
    expect(r.partial).toBe(true);
    expect(r.files).toBeLessThan(3000);
    expect(r.groups[0]!.note).toContain("Stopped");
    const full = await folderInfo(ctx, big);
    expect(full.files).toBe(3000);
  });

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)("an unreadable folder is counted, not fatal", async () => {
    const t = join(dir, "locked");
    mkdirSync(join(t, "closed"), { recursive: true });
    writeFileSync(join(t, "ok.txt"), "a");
    chmodSync(join(t, "closed"), 0);
    try {
      const x = rows((await folderInfo(ctx, t)).groups);
      expect(x["general/Not readable"]).toContain("1");
    } finally {
      chmodSync(join(t, "closed"), 0o755);
    }
  });

  test("many items: total size, count, kinds and the date range, with a missing item skipped", async () => {
    const r = await manyInfo(ctx, [join(base, "one.txt"), join(base, "two.png"), join(base, "a"), join(base, "missing")]);
    expect(r.selected).toBe(3);
    expect([r.files, r.folders]).toEqual([4, 2]);
    expect(rows(r.groups)["general/Total size"]).toContain(`${(100 + png().length + 5000 + jpeg().length).toLocaleString("en-US")} bytes`);
    await expect(manyInfo(ctx, [])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(manyInfo(ctx, Array.from({ length: 5001 }, () => base))).rejects.toMatchObject({ code: "TOO_MANY" });
    await expect(folderInfo(ctx, join(base, "one.txt"))).rejects.toMatchObject({ code: "NOT_A_FOLDER" });
  });
});

describe("the map link", () => {
  test("is built here from two numbers and nothing else", () => {
    expect(mapUrl(48.858222, 2.2945)).toBe("https://www.openstreetmap.org/?mlat=48.858222&mlon=2.294500#map=16/48.858222/2.294500");
    for (const bad of [[91, 0], [0, 181], [NaN, 1], ["1", "2"], [null, undefined]]) expect(() => mapUrl(bad[0], bad[1])).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Over HTTP, the way the page calls it
// ---------------------------------------------------------------------------------------------------------------
describe("HTTP: token, loopback, path checks and limits", () => {
  let server: ReturnType<typeof startFileManagerServer>;
  let url: string;
  const TOKEN = "info-token-xyz";
  const calls: Array<{ command: string; args: string[] }> = [];
  beforeAll(() => {
    server = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: join(root.dir, "d4"), launch: async (command, args) => void calls.push({ command, args }) } });
    url = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));
  async function api(op: string, body: unknown = {}, headers: Record<string, string> = {}, token: string | null = TOKEN) {
    const res = await fetch(`${url}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-fm-token": token } : {}), ...headers }, body: JSON.stringify(body) });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { ok: false, text };
    }
    return { status: res.status, json };
  }

  test("every info operation is registered", () => {
    for (const op of ["info/file", "info/image", "info/exiftool", "info/media", "info/document", "info/folder", "info/many", "info/hash", "info/folderscan", "info/task", "info/cancel", "info/compare", "info/strip", "info/save", "info/openmap"]) expect(API_OPERATIONS, op).toContain(op);
  });

  test("the token is required: none, a wrong one and a nearly right one are all refused", async () => {
    const p = put("t.png", png());
    for (const op of ["info/file", "info/image", "info/hash", "info/strip", "info/save", "info/openmap", "info/task", "info/folder", "info/many", "info/compare", "info/exiftool", "info/media", "info/document", "info/cancel", "info/folderscan"]) {
      for (const token of [null, "wrong", TOKEN + "x", TOKEN.slice(0, -1)]) {
        const r = await api(op, { path: p }, {}, token);
        expect([op, token, r.status]).toEqual([op, token, 401]);
      }
    }
    expect((await fetch(`${url}/api/info/file?path=${encodeURIComponent(p)}`)).status).not.toBe(200);
  });

  test("only this window's own address and a JSON body are accepted", async () => {
    const p = put("loop.png", png());
    expect((await api("info/file", { path: p }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await api("info/file", { path: p }, { Host: "attacker.example" })).status).toBe(403);
    const form = await fetch(`${url}/api/info/file`, { method: "POST", headers: { "Content-Type": "text/plain", "x-fm-token": TOKEN }, body: JSON.stringify({ path: p }) });
    expect(form.status).toBe(415);
    expect((await api("info/file", { path: p })).status).toBe(200);
    expect(server.hostname).toBe("127.0.0.1");
  });

  test("paths are checked like everywhere else: relative, empty, null bytes and missing", async () => {
    for (const path of ["relative/x.png", "", "   ", "/a\0b", 5, null, ["/x"]]) {
      const r = await api("info/file", { path });
      expect([r.status, r.json.ok]).toEqual([400, false]);
      expect(["BAD_PATH", "NOT_FOUND"]).toContain(r.json.error.code);
    }
    const missing = await api("info/image", { path: join(dir, "no-such.png") });
    expect([missing.status, missing.json.error.code]).toEqual([400, "NOT_FOUND"]);
    const folder = await api("info/image", { path: dir });
    expect(folder.json.error.code).toBe("NOT_A_FILE");
  });

  test("a link is refused for content with the target in the details", async () => {
    if (process.platform === "win32") return;
    const target = put("real.jpg", jpeg({ segments: [app1Exif(photoTiff(false))] }));
    const link = join(dir, "http-link.jpg");
    symlinkSync(target, link);
    const r = await api("info/image", { path: link });
    expect([r.status, r.json.error.code, r.json.error.details.target]).toEqual([400, "IS_LINK", require("fs").realpathSync(target)]);
    const ok = await api("info/image", { path: target });
    expect(ok.json.gps.lat).toBeCloseTo(48.858222, 5);
    expect(ok.json.photo.camera).toBe("Canon EOS R5");
  });

  test("hash job over HTTP: start, poll, compare, cancel", async () => {
    const p = put("h.txt", "hash me over http");
    const started = await api("info/hash", { path: p });
    expect(started.json.task.state).toBe("running");
    let task = started.json.task;
    for (let i = 0; i < 200 && task.state === "running"; i++) {
      await sleep(10);
      task = (await api("info/task", { id: task.id })).json.task;
    }
    expect(task.state).toBe("done");
    const rows2 = task.result.rows.map((r: any) => ({ id: r.id, value: r.value }));
    expect(rows2.find((r: any) => r.id === "sha256").value).toBe(sha("sha256", Buffer.from("hash me over http")));
    const same = await api("info/compare", { expected: ` SHA256:${rows2.find((r: any) => r.id === "sha256").value.toUpperCase()} `, rows: rows2 });
    expect(same.json.matched).toBe("sha256");
    expect((await api("info/compare", { expected: "abc", rows: "bad" })).status).toBe(400);
    expect((await api("info/compare", { expected: "abc", rows: Array.from({ length: 41 }, () => ({ id: "md5", value: "a" })) })).status).toBe(400); // up to 40 kinds can be compared now
    expect((await api("info/task", { id: "missing" })).json.error.code).toBe("NO_TASK");
    expect((await api("info/hash", { path: dir })).json.error.code).toBe("NOT_A_FILE");
    expect((await api("info/cancel", { id: task.id })).json.cancelled).toBe(false);
  });

  test("folder scans over HTTP can be started and read", async () => {
    const started = await api("info/folderscan", { path: join(dir, "tree") });
    let task = started.json.task;
    for (let i = 0; i < 300 && task.state === "running"; i++) {
      await sleep(10);
      task = (await api("info/task", { id: task.id })).json.task;
    }
    expect(task.state).toBe("done");
    expect(task.result.files).toBe(5);
    const sync = await api("info/folder", { path: join(dir, "tree") });
    expect(sync.json.files).toBe(5);
    const many = await api("info/many", { paths: [join(dir, "tree", "one.txt"), join(dir, "tree", "two.png")] });
    expect(many.json.files).toBe(2);
  });

  test("saving a report: three formats, next to the file, never overwriting, and sanity limits", async () => {
    const p = put("report-me.png", png());
    const first = await api("info/save", { path: p, format: "txt", content: "details one" });
    expect(first.json.name).toBe("report-me.png.info.txt");
    const second = await api("info/save", { path: p, format: "txt", content: "details two" });
    expect(second.json.name).toBe("report-me.png.info (2).txt");
    expect(readFileSync(first.json.path, "utf8")).toBe("details one");
    expect(readFileSync(second.json.path, "utf8")).toBe("details two");
    expect((await api("info/save", { path: p, format: "json", content: '{"a":1}' })).json.name).toBe("report-me.png.info.json");
    expect((await api("info/save", { path: p, format: "md", content: "# x" })).json.name).toBe("report-me.png.info.md");
    expect((await api("info/save", { path: p, format: "exe", content: "x" })).json.error.code).toBe("BAD_REQUEST");
    expect((await api("info/save", { path: p, format: "txt", content: "" })).json.error.code).toBe("BAD_REQUEST");
    expect((await api("info/save", { path: p, format: "txt", content: 5 })).json.error.code).toBe("BAD_REQUEST");
    expect((await api("info/save", { path: p, format: "txt", content: "x".repeat(950_000) })).json.error.code).toBe("TOO_LARGE");
    expect((await api("info/save", { path: join(dir, "ghost.png"), format: "txt", content: "x" })).json.error.code).toBe("NOT_FOUND");
    expect(readdirSync(dir).filter((n) => n.startsWith("report-me.png.info")).sort()).toEqual(["report-me.png.info (2).txt", "report-me.png.info.json", "report-me.png.info.md", "report-me.png.info.txt"]);
  });

  test("the map is opened only with an explicit confirmation, and only a map address is ever launched", async () => {
    calls.length = 0;
    const no = await api("info/openmap", { lat: 1, lon: 2 });
    expect([no.status, no.json.error.code]).toEqual([409, "NEEDS_CONFIRM"]);
    expect(calls).toEqual([]);
    expect((await api("info/openmap", { lat: "x", lon: 2, confirm: true })).json.error.code).toBe("BAD_REQUEST");
    expect((await api("info/openmap", { lat: 1, lon: 2, url: "https://evil.example", confirm: true })).json.opened).toBe("https://www.openstreetmap.org/?mlat=1.000000&mlon=2.000000#map=16/1.000000/2.000000");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args.join(" ")).toContain("openstreetmap.org");
    expect(calls[0]!.args.join(" ")).not.toContain("evil");
  });

  test("a request that is too big is refused", async () => {
    try {
      const res = await fetch(`${url}/api/info/save`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify({ path: "/x", format: "txt", content: "y".repeat(2 * 1024 * 1024) }) });
      expect(res.status).toBe(413);
    } catch (e: any) {
      expect(["ECONNRESET", "EPIPE", "ECONNABORTED"]).toContain(e?.code);
    }
  });

  test("every operation answers quickly for a normal file", async () => {
    const p = put("quick.jpg", jpeg({ segments: [app1Exif(photoTiff(true))] }));
    const start = Date.now();
    for (const op of ["info/file", "info/image", "info/exiftool", "info/document"]) {
      const r = await api(op, { path: p });
      expect(r.status, op).toBeLessThan(500);
    }
    expect(Date.now() - start).toBeLessThan(5000);
    expect(icc().length).toBeGreaterThan(100);
  });
});
