import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext, type FmContext } from "../src/features/filemanager/fmCore";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";
import { LIVE_CLIENT_JS, LIVE_SCRIPT_PATH, countDirs, injectLive, isIgnoredChange } from "../src/features/filemanager/fmServeLive";
import { LOG_MAX_CHARS, LOG_MAX_LINES, RingLog } from "../src/features/filemanager/fmServeLog";
import { FALLBACK_MIME, MIME_TYPES, mimeFor } from "../src/features/filemanager/fmServeMime";
import { MAX_SERVERS, getServeRegistry } from "../src/features/filemanager/fmServeRegistry";
import { installHints } from "../src/features/filemanager/fmServePhp";
import { serveOperations } from "../src/features/filemanager/fmServeOps";
import { MAX_URL_LENGTH, parseRange, startStaticServer, type StaticOptions, type StaticServer } from "../src/features/filemanager/fmServeStatic";
import { sanitizeSettings, updateSettings } from "../src/features/filemanager/fmSettings";

const root = mkdtempSync(join(tmpdir(), "fm-serve-"));
const home = join(root, "home");
mkdirSync(home);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let counter = 0;
const stoppers: Array<() => unknown> = [];

function folder(name = "site"): string {
  const dir = join(root, `${name}${++counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function serve(dir: string, extra: Partial<StaticOptions> = {}): Promise<StaticServer & { url: string }> {
  const s = await startStaticServer({ root: dir, host: "127.0.0.1", port: 0, liveReload: false, ...extra });
  stoppers.push(() => s.stop());
  return Object.assign(s, { url: `http://127.0.0.1:${s.port}` });
}

/** One raw HTTP exchange, for requests fetch() would tidy up (odd Host headers, raw paths). */
function raw(port: number, request: string, waitMs = 3000): Promise<{ status: number; head: string; body: string }> {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const text = buf.toString("latin1");
      const at = text.indexOf("\r\n\r\n");
      const head = at >= 0 ? text.slice(0, at) : text;
      resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(head)?.[1] ?? 0), head, body: at >= 0 ? text.slice(at + 4) : "" });
    };
    Bun.connect({ hostname: "127.0.0.1", port, socket: {
      open(sock) { sock.write(request); },
      data(_sock, data) { buf = Buffer.concat([buf, Buffer.from(data)]); },
      close: finish,
      error: finish,
    } }).catch(finish);
    setTimeout(finish, waitMs);
  });
}
const get = (port: number, path: string, extraHeaders = "", host = `127.0.0.1:${port}`) => raw(port, `GET ${path} HTTP/1.1\r\nHost: ${host}\r\n${extraHeaders}Connection: close\r\n\r\n`);

async function portIsFree(port: number): Promise<boolean> {
  try {
    const probe = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("x") });
    await probe.stop(true);
    return true;
  } catch {
    return false;
  }
}

/** Reads server-sent events: resolves with the next JSON message, or null on timeout/end. */
function eventReader(res: Response) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  // One read at a time: a read that lost a race against a timeout must still deliver its data to the next call.
  let pending: Promise<{ done: boolean; value?: Uint8Array }> | null = null;
  const readChunk = () => {
    pending ??= reader.read().then(
      (r) => { pending = null; return r as { done: boolean; value?: Uint8Array }; },
      () => { pending = null; return { done: true }; },
    );
    return pending;
  };
  return {
    async next(ms = 3000): Promise<any | null> {
      const deadline = Date.now() + ms;
      for (;;) {
        const at = buffer.indexOf("\n\n");
        if (at >= 0) {
          const block = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
          if (data) return JSON.parse(data);
          continue;
        }
        const left = deadline - Date.now();
        if (left <= 0) return null;
        const chunk = await Promise.race([readChunk(), sleep(left).then(() => "timeout" as const)]);
        if (chunk === "timeout" || chunk.done) return null;
        buffer += dec.decode(chunk.value!, { stream: true });
      }
    },
    async ended(ms = 3000): Promise<boolean> {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const chunk = await Promise.race([readChunk(), sleep(200).then(() => "timeout" as const)]);
        if (chunk !== "timeout" && chunk.done) return true;
      }
      return false;
    },
    cancel: () => reader.cancel().catch(() => {}),
  };
}

afterEach(async () => {
  for (const stop of stoppers.splice(0)) await stop();
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------------------------

describe("MIME table", () => {
  test("covers at least 60 types, with text types in UTF-8 and unknown ones as downloads", () => {
    expect(Object.keys(MIME_TYPES).length).toBeGreaterThanOrEqual(60);
    for (const [ext, type] of Object.entries(MIME_TYPES)) {
      expect(ext, ext).toMatch(/^[a-z0-9]+$/);
      expect(type, ext).toMatch(/^[a-z]+\/[a-z0-9.+-]+(; charset=utf-8)?$/);
    }
    expect(mimeFor("a.html")).toBe("text/html; charset=utf-8");
    expect(mimeFor("A.HTM")).toBe("text/html; charset=utf-8");
    expect(mimeFor("x.mjs")).toContain("text/javascript");
    expect(mimeFor("x.wasm")).toBe("application/wasm");
    expect(mimeFor("x.svg")).toBe("image/svg+xml");
    expect(mimeFor("x.webp")).toBe("image/webp");
    expect(mimeFor("x.avif")).toBe("image/avif");
    expect(mimeFor("x.woff2")).toBe("font/woff2");
    expect(mimeFor("x.json")).toContain("application/json");
    expect(mimeFor("x.js.map")).toContain("application/json");
    // A ".ts" file in a project folder is TypeScript, not video.
    expect(mimeFor("main.ts")).toContain("text/plain");
    expect(mimeFor("movie.mp4")).toBe("video/mp4");
    expect(mimeFor("noextension")).toBe(FALLBACK_MIME);
    expect(mimeFor("weird.zzzz")).toBe(FALLBACK_MIME);
    // Names that are properties of every object must not find a type.
    expect(mimeFor("x.constructor")).toBe(FALLBACK_MIME);
    expect(mimeFor("x.__proto__")).toBe(FALLBACK_MIME);
  });
});

describe("range parsing", () => {
  test.each([
    ["bytes=0-9", 100, { kind: "ok", start: 0, end: 9 }],
    ["bytes=90-", 100, { kind: "ok", start: 90, end: 99 }],
    ["bytes=-10", 100, { kind: "ok", start: 90, end: 99 }],
    ["bytes=50-5000", 100, { kind: "ok", start: 50, end: 99 }],
    ["bytes=100-", 100, { kind: "bad" }],
    ["bytes=-0", 100, { kind: "bad" }],
    ["bytes=0-1,5-6", 100, { kind: "none" }],
    ["bytes=9-2", 100, { kind: "none" }],
    ["lines=0-5", 100, { kind: "none" }],
    ["bytes=-", 100, { kind: "none" }],
    ["bytes=0-0", 0, { kind: "bad" }],
  ])("%s of %d bytes", (header, size, expected) => {
    expect(parseRange(header, size)).toEqual(expected as any);
  });
  test("no header means no range", () => expect(parseRange(null, 5)).toEqual({ kind: "none" }));
});

describe("serving files", () => {
  test("serves files with the right type, safe headers and streamed bodies", async () => {
    const dir = folder();
    writeFileSync(join(dir, "a.txt"), "hello text");
    writeFileSync(join(dir, "app.js"), "console.log(1)");
    writeFileSync(join(dir, "pic.png"), Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]));
    writeFileSync(join(dir, "data.unknownext"), "bin");
    const s = await serve(dir);
    const a = await fetch(`${s.url}/a.txt`);
    expect(a.status).toBe(200);
    expect(await a.text()).toBe("hello text");
    expect(a.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(a.headers.get("x-content-type-options")).toBe("nosniff");
    expect(a.headers.get("access-control-allow-origin")).toBeNull();
    expect(a.headers.get("accept-ranges")).toBe("bytes");
    expect(a.headers.get("etag")).toBeTruthy();
    expect(a.headers.get("last-modified")).toBeTruthy();
    expect((await fetch(`${s.url}/app.js`)).headers.get("content-type")).toContain("text/javascript");
    const png = await fetch(`${s.url}/pic.png`);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect([...new Uint8Array(await png.arrayBuffer())]).toEqual([137, 80, 78, 71, 0, 1, 2, 3]);
    expect((await fetch(`${s.url}/data.unknownext`)).headers.get("content-type")).toBe("application/octet-stream");
    // Without live reload, pages may be cached but must be re-checked.
    expect(a.headers.get("cache-control")).toBe("no-cache");
  });

  test("serves a big file without trouble and a unicode name", async () => {
    const dir = folder();
    writeFileSync(join(dir, "big.bin"), Buffer.alloc(5 * 1024 * 1024, 7));
    writeFileSync(join(dir, "ünï cödé 日本.txt"), "unicode");
    const s = await serve(dir);
    const big = await fetch(`${s.url}/big.bin`);
    expect(big.headers.get("content-length")).toBe(String(5 * 1024 * 1024));
    expect((await big.arrayBuffer()).byteLength).toBe(5 * 1024 * 1024);
    expect(await (await fetch(`${s.url}/${encodeURIComponent("ünï cödé 日本.txt")}`)).text()).toBe("unicode");
  });

  test("a folder is answered with its index.html, or index.htm, or a list", async () => {
    const dir = folder();
    mkdirSync(join(dir, "withhtml"));
    mkdirSync(join(dir, "withhtm"));
    mkdirSync(join(dir, "plain"));
    writeFileSync(join(dir, "index.html"), "<h1>root</h1>");
    writeFileSync(join(dir, "withhtml", "index.html"), "<p>html index</p>");
    writeFileSync(join(dir, "withhtm", "index.htm"), "<p>htm index</p>");
    writeFileSync(join(dir, "plain", "one.txt"), "1");
    const s = await serve(dir);
    expect(await (await fetch(`${s.url}/`)).text()).toBe("<h1>root</h1>");
    expect(await (await fetch(`${s.url}/withhtml/`)).text()).toBe("<p>html index</p>");
    expect(await (await fetch(`${s.url}/withhtm/`)).text()).toBe("<p>htm index</p>");
    const list = await fetch(`${s.url}/plain/`);
    expect(list.status).toBe(200);
    expect(list.headers.get("content-type")).toContain("text/html");
    const html = await list.text();
    expect(html).toContain('href="/plain/one.txt"');
    expect(html).toContain("⬆️");
  });

  test("a folder address without the closing slash is redirected to one with it, and never off this site", async () => {
    const dir = folder();
    mkdirSync(join(dir, "docs"));
    mkdirSync(join(dir, "evil.com"));
    writeFileSync(join(dir, "docs", "index.html"), "docs");
    const s = await serve(dir);
    const r = await fetch(`${s.url}/docs?x=1`, { redirect: "manual" });
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/docs/?x=1");
    const protocolRelative = await get(s.port, "//evil.com");
    expect(protocolRelative.status).toBe(301);
    expect(/location: (.*)/i.exec(protocolRelative.head)?.[1]?.trim()).toBe("/evil.com/");
    expect((await fetch(`${s.url}/docs/`)).status).toBe(200);
  });

  test("the list page escapes names, so a file called <script> can't run anything", async () => {
    const dir = folder();
    const nasty =
      process.platform === "win32"
        ? ["quote's&amp;.txt", "a b#c%d.txt"]
        : ["<script>alert(1)<script>.txt", 'quote"s&amp;.txt', "<img src=x onerror=alert(1)>.txt", "a b#c%d.txt"];
    for (const n of nasty) writeFileSync(join(dir, n), "x");
    if (process.platform !== "win32") mkdirSync(join(dir, "<b>folder<b>"));
    const s = await serve(dir);
    const res = await fetch(`${s.url}/`);
    const html = await res.text();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>folder<b>");
    if (process.platform === "win32") {
      expect(html).toContain("quote&#39;s&amp;amp;.txt");
    } else {
      expect(html).toContain("&lt;script&gt;alert(1)&lt;script&gt;.txt");
      expect(html).toContain("quote&quot;s&amp;amp;.txt");
    }
    expect(html).toContain(`href="/${encodeURIComponent("a b#c%d.txt")}"`);
    // A page of this kind carries its own restrictive policy.
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    // And the odd names can be fetched through those links.
    expect(await (await fetch(`${s.url}/${encodeURIComponent("a b#c%d.txt")}`)).text()).toBe("x");
    if (process.platform !== "win32") {
      expect(await (await fetch(`${s.url}/${encodeURIComponent("<script>alert(1)<script>.txt")}`)).text()).toBe("x");
    }
  });

  test("with listings off, a folder without an index is refused", async () => {
    const dir = folder();
    writeFileSync(join(dir, "a.txt"), "x");
    const s = await serve(dir, { listing: false });
    expect((await fetch(`${s.url}/`)).status).toBe(403);
  });

  test("missing things get a friendly 404 page", async () => {
    const s = await serve(folder());
    const res = await fetch(`${s.url}/nope.html`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("There is no file at this address");
    const head = await fetch(`${s.url}/nope.html`, { method: "HEAD" });
    expect(head.status).toBe(404);
  });

  test("Windows device names are never served, even where a file of that name can exist", async () => {
    const dir = folder();
    writeFileSync(join(dir, "con.txt"), "device");
    writeFileSync(join(dir, "NUL"), "device");
    writeFileSync(join(dir, "ok.txt"), "fine");
    const s = await serve(dir);
    expect((await fetch(`${s.url}/con.txt`)).status).toBe(404);
    expect((await fetch(`${s.url}/NUL`)).status).toBe(404);
    expect((await fetch(`${s.url}/COM1`)).status).toBe(404);
    expect((await fetch(`${s.url}/ok.txt`)).status).toBe(200);
    expect(await (await fetch(`${s.url}/`)).text()).not.toContain("con.txt");
  });
});

describe("keeping inside the folder", () => {
  const SECRET = "TOP-SECRET-OUTSIDE-CONTENT";
  const canSymlink = (() => {
    const probe = join(root, "symlink-probe");
    const target = join(root, "symlink-target");
    try {
      writeFileSync(target, "x");
      symlinkSync(target, probe);
      rmSync(probe, { force: true });
      rmSync(target, { force: true });
      return true;
    } catch {
      return false;
    }
  })();

  function layout() {
    const base = folder("outer");
    const dir = join(base, "site");
    mkdirSync(dir);
    writeFileSync(join(base, "secret.txt"), SECRET);
    writeFileSync(join(dir, "index.html"), "<p>inside</p>");
    mkdirSync(join(base, "outsidedir"));
    writeFileSync(join(base, "outsidedir", "inner.txt"), SECRET);
    return { base, dir };
  }

  test("traversal attempts of every shape never reveal a file outside", async () => {
    const { dir } = layout();
    const s = await serve(dir);
    const attempts = [
      "/../secret.txt", "/%2e%2e/secret.txt", "/%2E%2E/secret.txt", "/..%2fsecret.txt", "/%2e%2e%2fsecret.txt", "/..%5csecret.txt", "/%2e%2e%5csecret.txt",
      "/./../secret.txt", "/a/../../secret.txt", "/....//secret.txt", "/..;/secret.txt", "//..//secret.txt", "/%2e%2e/%2e%2e/secret.txt",
      "/..\\secret.txt", "/%00/../secret.txt", "/index.html%00.txt", "/..%00/secret.txt", `/${"..%2f".repeat(20)}secret.txt`,
      "/%c0%ae%c0%ae/secret.txt", "/%252e%252e/secret.txt", "/..%252fsecret.txt",
    ];
    for (const path of attempts) {
      const res = await get(s.port, path);
      expect(res.body, path).not.toContain(SECRET);
      expect([200, 301, 400, 403, 404], `${path} -> ${res.status}`).toContain(res.status);
    }
    // The clearly malformed ones are refused, not just "not found".
    for (const path of ["/..%2fsecret.txt", "/..%5csecret.txt", "/%2e%2e%2fsecret.txt", "/a%00b", "/%00", "/..%00/secret.txt"]) {
      const res = await get(s.port, path);
      expect([400, 403], `${path} -> ${res.status}`).toContain(res.status);
    }
  });

  test("an overlong address is refused, as are too many headers", async () => {
    const { dir } = layout();
    const s = await serve(dir);
    expect((await get(s.port, `/${"a".repeat(MAX_URL_LENGTH + 10)}`)).status).toBe(414);
    const headers = Array.from({ length: 150 }, (_, i) => `X-Test-${i}: v\r\n`).join("");
    expect((await get(s.port, "/index.html", headers)).status).toBe(431);
  });

  test("a symbolic link that leads outside is refused; one that stays inside works", async () => {
    const { base, dir } = layout();
    mkdirSync(join(dir, "real"));
    writeFileSync(join(dir, "real", "ok.txt"), "inside link");
    if (canSymlink) {
      symlinkSync(join(base, "secret.txt"), join(dir, "leak.txt"));
      symlinkSync("../secret.txt", join(dir, "relative-leak.txt"));
    }
    symlinkSync(join(base, "outsidedir"), join(dir, "leakdir"), "junction");
    symlinkSync(join(dir, "real"), join(dir, "okdir"), "junction");
    const s = await serve(dir);
    const forbiddenPaths = canSymlink ? ["/leak.txt", "/leakdir/inner.txt", "/relative-leak.txt"] : ["/leakdir/inner.txt"];
    for (const path of forbiddenPaths) {
      const res = await fetch(`${s.url}${path}`);
      expect(res.status, path).toBe(403);
      expect(await res.text(), path).not.toContain(SECRET);
    }
    expect((await fetch(`${s.url}/leakdir/`)).status).toBe(403);
    expect(await (await fetch(`${s.url}/okdir/ok.txt`)).text()).toBe("inside link");
    // The list doesn't even mention the escaping links.
    const list = await (await fetch(`${s.url}/okdir/../`)).text();
    expect(list).toBe("<p>inside</p>");
    writeFileSync(join(dir, "index.html"), "x");
    rmSync(join(dir, "index.html"));
    const listing = await (await fetch(`${s.url}/`)).text();
    expect(listing).not.toContain("leak.txt");
    expect(listing).not.toContain("leakdir");
    expect(listing).toContain("okdir");
  });

  test.skipIf(!canSymlink)("an index.html that is a link to outside is not served", async () => {
    const { base, dir } = layout();
    rmSync(join(dir, "index.html"));
    symlinkSync(join(base, "secret.txt"), join(dir, "index.html"));
    const s = await serve(dir);
    const res = await fetch(`${s.url}/`);
    expect(await res.text()).not.toContain(SECRET);
  });

  test("hidden files are 404 by default, and .git is never served", async () => {
    const dir = folder();
    writeFileSync(join(dir, ".env"), "API_KEY=1");
    writeFileSync(join(dir, "index.html"), "ok");
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "config"), "[core]");
    mkdirSync(join(dir, "sub", ".git"), { recursive: true });
    writeFileSync(join(dir, "sub", ".git", "HEAD"), "ref");
    mkdirSync(join(dir, ".hidden"));
    writeFileSync(join(dir, ".hidden", "x.txt"), "x");
    if (canSymlink) symlinkSync(join(dir, ".env"), join(dir, "innocent.txt"));
    const s = await serve(dir);
    for (const path of ["/.env", "/.git/config", "/.git/", "/sub/.git/HEAD", "/.hidden/x.txt", "/innocent.txt", "/.GIT/config"]) expect((await fetch(`${s.url}${path}`)).status, path).toBe(404);
    const list = await (await fetch(`${s.url}/`)).text();
    expect(list).toBe("ok");
    rmSync(join(dir, "index.html"));
    const listing = await (await fetch(`${s.url}/`)).text();
    expect(listing).not.toContain(".env");
    expect(listing).not.toContain(".git");
    expect(listing).not.toContain("innocent");

    const open = await serve(dir, { dotfiles: true });
    expect(await (await fetch(`${open.url}/.env`)).text()).toBe("API_KEY=1");
    expect(await (await fetch(`${open.url}/.hidden/x.txt`)).text()).toBe("x");
    // Even with hidden files allowed, version-control data stays private.
    for (const path of ["/.git/config", "/sub/.git/HEAD", "/.git/"]) expect((await fetch(`${open.url}${path}`)).status, path).toBe(404);
    expect(await (await fetch(`${open.url}/`)).text()).not.toContain(".git<");
  });

  test("the File Manager's own folders are never served, even inside the chosen folder", async () => {
    const dir = folder();
    mkdirSync(join(dir, "app-data"));
    writeFileSync(join(dir, "app-data", "file_manager.json"), "{}");
    writeFileSync(join(dir, "mine.txt"), "mine");
    const s = await serve(dir, { forbidden: [join(dir, "app-data")] });
    expect((await fetch(`${s.url}/app-data/file_manager.json`)).status).toBe(403);
    expect(await (await fetch(`${s.url}/mine.txt`)).text()).toBe("mine");
  });
});

describe("conditional requests, ranges and methods", () => {
  test("Range requests return 206 with the right bytes; impossible ones 416; media can be streamed", async () => {
    const dir = folder();
    writeFileSync(join(dir, "n.txt"), "0123456789");
    const s = await serve(dir);
    const r1 = await fetch(`${s.url}/n.txt`, { headers: { Range: "bytes=2-4" } });
    expect(r1.status).toBe(206);
    expect(await r1.text()).toBe("234");
    expect(r1.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(r1.headers.get("content-length")).toBe("3");
    const r2 = await fetch(`${s.url}/n.txt`, { headers: { Range: "bytes=7-" } });
    expect(await r2.text()).toBe("789");
    const r3 = await fetch(`${s.url}/n.txt`, { headers: { Range: "bytes=-4" } });
    expect(await r3.text()).toBe("6789");
    expect(r3.headers.get("content-range")).toBe("bytes 6-9/10");
    const r4 = await fetch(`${s.url}/n.txt`, { headers: { Range: "bytes=5-500" } });
    expect(await r4.text()).toBe("56789");
    const bad = await fetch(`${s.url}/n.txt`, { headers: { Range: "bytes=50-60" } });
    expect(bad.status).toBe(416);
    expect(bad.headers.get("content-range")).toBe("bytes */10");
    const multi = await fetch(`${s.url}/n.txt`, { headers: { Range: "bytes=0-1,4-5" } });
    expect(multi.status).toBe(200);
    expect(await multi.text()).toBe("0123456789");
    const headRange = await fetch(`${s.url}/n.txt`, { method: "HEAD", headers: { Range: "bytes=0-3" } });
    expect(headRange.status).toBe(206);
    expect(headRange.headers.get("content-length")).toBe("4");
  });

  test("ETag and Last-Modified make repeat requests 304", async () => {
    const dir = folder();
    writeFileSync(join(dir, "c.css"), "a{}");
    const s = await serve(dir);
    const first = await fetch(`${s.url}/c.css`);
    const etag = first.headers.get("etag")!;
    const modified = first.headers.get("last-modified")!;
    const hit = await fetch(`${s.url}/c.css`, { headers: { "If-None-Match": etag } });
    expect(hit.status).toBe(304);
    expect(await hit.text()).toBe("");
    expect((await fetch(`${s.url}/c.css`, { headers: { "If-None-Match": `"other", ${etag}` } })).status).toBe(304);
    expect((await fetch(`${s.url}/c.css`, { headers: { "If-None-Match": '"other"' } })).status).toBe(200);
    expect((await fetch(`${s.url}/c.css`, { headers: { "If-Modified-Since": modified } })).status).toBe(304);
    expect((await fetch(`${s.url}/c.css`, { headers: { "If-Modified-Since": new Date(0).toUTCString() } })).status).toBe(200);
    await sleep(1100);
    writeFileSync(join(dir, "c.css"), "a{color:red}");
    const changed = await fetch(`${s.url}/c.css`, { headers: { "If-None-Match": etag } });
    expect(changed.status).toBe(200);
    expect(changed.headers.get("etag")).not.toBe(etag);
  });

  test("HEAD returns the headers without a body; other methods are 405; a request body is refused", async () => {
    const dir = folder();
    writeFileSync(join(dir, "h.txt"), "twelve bytes");
    const s = await serve(dir);
    const head = await fetch(`${s.url}/h.txt`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("12");
    expect(head.headers.get("content-type")).toContain("text/plain");
    expect(await head.text()).toBe("");
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const res = await fetch(`${s.url}/h.txt`, { method, body: method === "OPTIONS" ? undefined : "x" });
      expect(res.status, method).toBe(405);
      expect(res.headers.get("allow")).toBe("GET, HEAD");
    }
    const withBody = await raw(s.port, `GET /h.txt HTTP/1.1\r\nHost: 127.0.0.1:${s.port}\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello`);
    expect([400, 413]).toContain(withBody.status);
  });

  test("the CORS option adds the header, and is off otherwise", async () => {
    const dir = folder();
    writeFileSync(join(dir, "x.json"), "{}");
    const off = await serve(dir);
    expect((await fetch(`${off.url}/x.json`)).headers.get("access-control-allow-origin")).toBeNull();
    const on = await serve(dir, { cors: true });
    expect((await fetch(`${on.url}/x.json`)).headers.get("access-control-allow-origin")).toBe("*");
    expect((await fetch(`${on.url}/x.json`, { method: "OPTIONS" })).status).toBe(204);
    expect((await fetch(`${on.url}/nope`)).headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("only this computer can use a loopback server (DNS rebinding)", () => {
  test("requests addressed to other names, or the wrong port, are refused", async () => {
    const dir = folder();
    writeFileSync(join(dir, "i.txt"), "ok");
    const s = await serve(dir);
    const p = s.port;
    expect((await get(p, "/i.txt", "", `127.0.0.1:${p}`)).status).toBe(200);
    expect((await get(p, "/i.txt", "", `localhost:${p}`)).status).toBe(200);
    expect((await get(p, "/i.txt", "", `LOCALHOST:${p}`)).status).toBe(200);
    expect((await get(p, "/i.txt", "", `[::1]:${p}`)).status).toBe(200);
    for (const host of ["evil.example", `evil.example:${p}`, `127.0.0.1.evil.example:${p}`, `localhost.evil.example:${p}`, `127.0.0.1:${p + 1}`, "127.0.0.1", "192.168.1.5:" + p, ""]) {
      const res = await get(p, "/i.txt", "", host);
      expect(res.status, `Host: ${host}`).toBe(403);
      expect(res.body, `Host: ${host}`).not.toContain("ok");
    }
  });

  test("a server meant for the network accepts any Host name", async () => {
    const dir = folder();
    writeFileSync(join(dir, "i.txt"), "ok");
    const s = await serve(dir, { lan: true, host: "0.0.0.0" });
    expect((await get(s.port, "/i.txt", "", "my-laptop.local:1234")).status).toBe(200);
    expect(await (await fetch(`http://127.0.0.1:${s.port}/i.txt`)).text()).toBe("ok");
  });
});

describe("live reload", () => {
  test("pages get the script once, other files none, and nothing is cached", async () => {
    const dir = folder();
    writeFileSync(join(dir, "index.html"), "<html><body><h1>Hi</h1></body></html>");
    writeFileSync(join(dir, "nobody.html"), "<h1>no body tag</h1>");
    writeFileSync(join(dir, "twice.html"), `<body>x<script src="${LIVE_SCRIPT_PATH}"></script></body>`);
    writeFileSync(join(dir, "notes.txt"), "<body></body> plain");
    writeFileSync(join(dir, "style.css"), "body{}");
    writeFileSync(join(dir, "latin.html"), Buffer.from("<html><body>caf\xe9</body></html>", "latin1"));
    writeFileSync(join(dir, "upper.html"), "<HTML><BODY>x</BODY></HTML>");
    const s = await serve(dir, { liveReload: true });
    const page = await fetch(`${s.url}/index.html`);
    const html = await page.text();
    expect(html.split(LIVE_SCRIPT_PATH).length - 1).toBe(1);
    expect(html.indexOf(LIVE_SCRIPT_PATH)).toBeLessThan(html.indexOf("</body>"));
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("content-length")).toBe(String(Buffer.byteLength(html)));
    expect(page.headers.get("content-security-policy")).toBeNull();
    expect((await (await fetch(`${s.url}/nobody.html`)).text()).endsWith("</script>")).toBe(true);
    expect((await (await fetch(`${s.url}/twice.html`)).text()).split(LIVE_SCRIPT_PATH).length - 1).toBe(1);
    expect((await (await fetch(`${s.url}/upper.html`)).text()).split(LIVE_SCRIPT_PATH).length - 1).toBe(1);
    expect(await (await fetch(`${s.url}/notes.txt`)).text()).toBe("<body></body> plain");
    const css = await fetch(`${s.url}/style.css`);
    expect(await css.text()).toBe("body{}");
    expect(css.headers.get("cache-control")).toBe("no-store");
    // A page in another encoding keeps its bytes exactly.
    const latin = Buffer.from(await (await fetch(`${s.url}/latin.html`)).arrayBuffer());
    expect(latin.includes(Buffer.from([0x63, 0x61, 0x66, 0xe9]))).toBe(true);
    // HEAD agrees with GET about the length.
    const head = await fetch(`${s.url}/index.html`, { method: "HEAD" });
    expect(head.headers.get("content-length")).toBe(String(Buffer.byteLength(html)));
    // The script is served from a path of its own, so a site that forbids inline scripts still runs it.
    const script = await fetch(`${s.url}${LIVE_SCRIPT_PATH}`);
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(await script.text()).toBe(LIVE_CLIENT_JS);
    expect((await fetch(`${s.url}${LIVE_SCRIPT_PATH}`, { headers: { "If-None-Match": script.headers.get("etag")! } })).status).toBe(304);
    // The client script is valid JavaScript.
    expect(() => new Function(LIVE_CLIENT_JS)).not.toThrow();
  });

  test("injectLive puts the tag before the last </body>, otherwise at the end, and never twice", () => {
    expect(injectLive("<body>a</body>")).toBe(`<body>a${`<script src="${LIVE_SCRIPT_PATH}" data-fm-live></script>`}</body>`);
    expect(injectLive("<body>a</body><p>b</body >")).toContain("b<script");
    expect(injectLive("<p>x</p>").endsWith("</script>")).toBe(true);
    const once = injectLive("<p>x</p>");
    expect(injectLive(once)).toBe(once);
  });

  test("the reserved /__live__ path is never a file, with or without live reload", async () => {
    const dir = folder();
    mkdirSync(join(dir, "__live__"));
    writeFileSync(join(dir, "__live__", "client.js"), "STOLEN FILE");
    writeFileSync(join(dir, "__live__", "other.txt"), "STOLEN FILE");
    writeFileSync(join(dir, "index.html"), "<body></body>");
    const on = await serve(dir, { liveReload: true });
    expect(await (await fetch(`${on.url}/__live__/client.js`)).text()).toBe(LIVE_CLIENT_JS);
    expect((await fetch(`${on.url}/__live__/other.txt`)).status).toBe(404);
    expect((await fetch(`${on.url}/__LIVE__/other.txt`)).status).toBe(404);
    expect((await fetch(`${on.url}/__live__/client.js/extra`)).status).toBe(404);
    const off = await serve(dir);
    for (const path of ["/__live__", "/__live__/", "/__live__/client.js", "/__live__/other.txt", "/__Live__/other.txt"]) {
      const res = await fetch(`${off.url}${path}`);
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).not.toContain("STOLEN");
    }
  });

  test("changing a file sends a reload message; CSS-only changes are flagged so styles can be swapped", async () => {
    const dir = folder();
    writeFileSync(join(dir, "index.html"), "<body>v1</body>");
    writeFileSync(join(dir, "a.css"), "a{}");
    writeFileSync(join(dir, "b.css"), "b{}");
    const s = await serve(dir, { liveReload: true });
    const res = await fetch(`${s.url}/__live__`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const events = eventReader(res);
    const hello = await events.next();
    expect(hello).toMatchObject({ type: "hello", id: s.live!.serverId });
    expect(s.live!.clientCount).toBe(1);

    await sleep(550);
    writeFileSync(join(dir, "index.html"), "<body>v2</body>");
    const reload = await events.next();
    expect(reload.type).toBe("reload");
    expect(reload.files).toContain("index.html");

    await sleep(300);
    writeFileSync(join(dir, "a.css"), "a{color:red}");
    const css = await events.next();
    expect(css.type).toBe("css");
    expect(css.files).toEqual(["a.css"]);

    // Two quick saves arrive as one message (debounce), and a mix of CSS and HTML reloads the page.
    await sleep(300);
    writeFileSync(join(dir, "a.css"), "a{color:blue}");
    writeFileSync(join(dir, "index.html"), "<body>v3</body>");
    const mixed = await events.next();
    expect(mixed.type).toBe("reload");
    expect(await events.next(500)).toBeNull();

    // New files in new folders are noticed too.
    mkdirSync(join(dir, "newdir"));
    await sleep(300);
    await events.next(300);
    writeFileSync(join(dir, "newdir", "page.html"), "x");
    const created = await events.next();
    expect(created?.type).toBe("reload");
    await events.cancel();
  });

  test("changes in node_modules, .git, editor scratch files and hidden files are ignored", async () => {
    expect(isIgnoredChange("node_modules/x/y.js")).toBe(true);
    expect(isIgnoredChange("a/node_modules/x.js")).toBe(true);
    expect(isIgnoredChange(".git/index")).toBe(true);
    expect(isIgnoredChange("sub\\.git\\HEAD")).toBe(true);
    expect(isIgnoredChange("page.html~")).toBe(true);
    expect(isIgnoredChange(".page.html.swp")).toBe(true);
    expect(isIgnoredChange("x.tmp")).toBe(true);
    expect(isIgnoredChange("4913")).toBe(true);
    expect(isIgnoredChange(".env")).toBe(true);
    expect(isIgnoredChange(".env", true)).toBe(false);
    expect(isIgnoredChange("src/app.js")).toBe(false);
    expect(isIgnoredChange("index.html")).toBe(false);

    const dir = folder();
    mkdirSync(join(dir, "node_modules"));
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, "index.html"), "<body></body>");
    const s = await serve(dir, { liveReload: true });
    const events = eventReader(await fetch(`${s.url}/__live__`));
    await events.next();
    await sleep(550);
    writeFileSync(join(dir, "node_modules", "dep.js"), "1");
    writeFileSync(join(dir, ".git", "index"), "1");
    writeFileSync(join(dir, ".hidden"), "1");
    writeFileSync(join(dir, "index.html~"), "1");
    expect(await events.next(600)).toBeNull();
    writeFileSync(join(dir, "index.html"), "<body>changed</body>");
    expect((await events.next())?.type).toBe("reload");
    await events.cancel();
  });

  test("a folder with too many subfolders is not watched, and the status says so", async () => {
    const dir = folder();
    for (let i = 0; i < 12; i++) mkdirSync(join(dir, `d${i}`));
    mkdirSync(join(dir, "node_modules", "a", "b"), { recursive: true });
    expect(await countDirs(dir, 100)).toBe(13);
    expect(await countDirs(dir, 5)).toBeGreaterThan(5);
    writeFileSync(join(dir, "index.html"), "<body>still served</body>");
    const s = await serve(dir, { liveReload: true, liveOptions: { maxDirs: 5 } });
    expect(s.live!.watching).toBe(false);
    expect(s.live!.warning).toContain("more than 5 subfolders");
    expect(await (await fetch(`${s.url}/index.html`)).text()).toContain("still served");
    const ok = await serve(dir, { liveReload: true, liveOptions: { maxDirs: 50 } });
    expect(ok.live!.watching).toBe(true);
    expect(ok.live!.warning).toBe("");
  });

  test("a deleted folder is reported instead of failing quietly", async () => {
    const dir = folder("gone");
    writeFileSync(join(dir, "index.html"), "<body></body>");
    const s = await serve(dir, { liveReload: true });
    await sleep(500);
    rmSync(dir, { recursive: true, force: true });
    s.live!.changed("index.html");
    await sleep(400);
    expect(s.live!.warning).toContain("deleted or moved");
    expect(s.live!.watching).toBe(false);
    expect((await fetch(`${s.url}/index.html`)).status).toBe(404);
  });

  test("too many open pages are turned away", async () => {
    const dir = folder();
    const s = await serve(dir, { liveReload: true, liveOptions: { maxClients: 2 } });
    const a = await fetch(`${s.url}/__live__`);
    const b = await fetch(`${s.url}/__live__`);
    const c = await fetch(`${s.url}/__live__`);
    expect([a.status, b.status, c.status]).toEqual([200, 200, 503]);
    await a.body?.cancel();
    await b.body?.cancel();
  });
});

describe("stopping", () => {
  test("stop closes pages that are listening, ends the watch and frees the port", async () => {
    const dir = folder();
    writeFileSync(join(dir, "index.html"), "<body></body>");
    const s = await serve(dir, { liveReload: true });
    const port = s.port;
    const events = eventReader(await fetch(`${s.url}/__live__`));
    expect((await events.next())?.type).toBe("hello");
    expect(s.live!.clientCount).toBe(1);
    await s.stop();
    expect(await events.ended()).toBe(true);
    expect(s.live!.clientCount).toBe(0);
    expect(s.live!.watching).toBe(false);
    expect(await portIsFree(port)).toBe(true);
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toBeDefined();
    await s.stop();
  });

  test("a failed start leaves nothing behind", async () => {
    const dir = folder();
    const first = await serve(dir);
    await expect(startStaticServer({ root: dir, host: "127.0.0.1", port: first.port, liveReload: true })).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Log buffer
// ---------------------------------------------------------------------------------------------------------------

describe("the server log", () => {
  test("keeps the newest lines within the caps, reads from a cursor and never splits a line", () => {
    const log = new RingLog(5, 1000);
    log.write("one\ntw");
    log.write("o\nthree\n");
    expect(log.read().lines.map((l) => l.text)).toEqual(["one", "two", "three"]);
    log.write("partial");
    expect(log.read().lines.length).toBe(3);
    log.flush();
    const all = log.read();
    expect(all.lines.at(-1)!.text).toBe("partial");
    expect(log.read(all.cursor).lines).toEqual([]);
    for (let i = 0; i < 20; i++) log.add(`line ${i}`);
    expect(log.size).toBe(5);
    const after = log.read(all.cursor);
    expect(after.dropped).toBe(true);
    expect(after.lines.at(-1)!.text).toBe("line 19");
    const big = new RingLog();
    for (let i = 0; i < LOG_MAX_LINES * 3; i++) big.add("x".repeat(900));
    expect(big.size).toBeLessThanOrEqual(LOG_MAX_LINES);
    expect(big.totalChars).toBeLessThanOrEqual(LOG_MAX_CHARS + 1000);
    const wild = new RingLog();
    wild.add("a\u0000b\u001b[31mred");
    expect(wild.read().lines[0]!.text).not.toMatch(/[\u0000\u001b]/);
    wild.add("y".repeat(10_000));
    expect(wild.read().lines[1]!.text.length).toBeLessThan(2100);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Operations: registry, validation and the HTTP layer
// ---------------------------------------------------------------------------------------------------------------

let ctxCounter = 0;
const contexts: FmContext[] = [];
function newCtx(options: Parameters<typeof createContext>[0] = {}): FmContext & { launched: Array<{ command: string; args: string[] }> } {
  const launched: Array<{ command: string; args: string[] }> = [];
  const ctx = createContext({ home, dataDir: join(root, `data${++ctxCounter}`), launch: async (command, args) => { launched.push({ command, args }); }, ...options });
  contexts.push(ctx);
  return Object.assign(ctx, { launched });
}
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await getServeRegistry(ctx).stopAll();
});
const op = (ctx: FmContext, name: string, body: Record<string, any> = {}): Promise<any> => serveOperations[name]!(ctx, body) as Promise<any>;
const fails = async (promise: Promise<any>, code: string, message?: RegExp) => {
  const err: any = await promise.then(() => null, (e) => e);
  expect(err, `expected ${code}`).not.toBeNull();
  expect(err.code).toBe(code);
  if (message) expect(err.message).toMatch(message);
  expect(err.message).not.toMatch(/\bnull\b|\bundefined\b|\[object/);
  return err;
};

describe("starting and stopping live servers", () => {
  test("starts on the first free port from 5500, serves the folder, counts requests and logs them", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.html"), "<body>hello</body>");
    const { server, openError } = await op(ctx, "serve/start", { root: dir, kind: "static" });
    expect(openError).toBe("");
    expect(server).toMatchObject({ kind: "static", root: dir, host: "127.0.0.1", lan: false, status: "running", liveReload: true, dotfiles: false, cors: false });
    expect(server.port).toBeGreaterThanOrEqual(5500);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);
    expect(server.lanUrl).toBeNull();
    expect(Date.parse(server.startedAt)).toBeGreaterThan(Date.now() - 60_000);
    const html = await (await fetch(server.url)).text();
    expect(html).toContain("hello");
    expect(html).toContain(LIVE_SCRIPT_PATH);
    await fetch(`${server.url}missing`);
    const status = await op(ctx, "serve/status");
    expect(status.servers).toHaveLength(1);
    expect(status.servers[0].requests).toBe(2);
    expect(status.servers[0].lastRequestAt).not.toBeNull();
    expect(status.max).toBe(MAX_SERVERS);
    expect(status.firstPorts).toEqual({ static: 5500, php: 8000 });
    const log = await op(ctx, "serve/log", { id: server.id });
    expect(log.lines.map((l: any) => l.text).join("\n")).toMatch(/GET \/ 200[\s\S]*GET \/missing 404/);
    expect((await op(ctx, "serve/log", { id: server.id, since: log.cursor })).lines).toEqual([]);
    const stopped = await op(ctx, "serve/stop", { id: server.id });
    expect(stopped.server.status).toBe("stopped");
    expect((await op(ctx, "serve/status")).servers).toEqual([]);
    expect(await portIsFree(server.port)).toBe(true);
    await fails(op(ctx, "serve/stop", { id: server.id }), "NOT_FOUND", /isn't there any more/);
  });

  test("a second start for the same folder reports the one already running; another folder gets another port", async () => {
    const ctx = newCtx();
    const dir = folder();
    const other = folder();
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "static" });
    const err = await fails(op(ctx, "serve/start", { root: dir, kind: "static" }), "ALREADY_RUNNING", /already running/);
    expect(err.details.server.id).toBe(server.id);
    expect(err.details.server.url).toBe(server.url);
    const second = (await op(ctx, "serve/start", { root: other, kind: "static" })).server;
    expect(second.port).not.toBe(server.port);
    expect((await op(ctx, "serve/status")).servers).toHaveLength(2);
    // Starting the same folder in parallel still gives one server.
    const results = await Promise.allSettled([op(ctx, "serve/start", { root: folder("par"), kind: "static", port: null }), op(ctx, "serve/start", { root: dir, kind: "static" })]);
    expect(results[1]!.status).toBe("rejected");
    expect(await op(ctx, "serve/stopAll")).toEqual({ stopped: 3 });
    expect((await op(ctx, "serve/status")).servers).toEqual([]);
  });

  test("at most 8 servers run at once", async () => {
    const ctx = newCtx();
    const ports = new Set<number>();
    for (let i = 0; i < MAX_SERVERS; i++) ports.add((await op(ctx, "serve/start", { root: folder("many"), kind: "static", liveReload: false })).server.port);
    expect(ports.size).toBe(MAX_SERVERS);
    await fails(op(ctx, "serve/start", { root: folder("many"), kind: "static" }), "TOO_MANY", /8 servers are already running/);
    const [first] = (await op(ctx, "serve/status")).servers;
    await op(ctx, "serve/stop", { id: first.id });
    expect((await op(ctx, "serve/start", { root: folder("many"), kind: "static" })).server.status).toBe("running");
  });

  test("a port that is taken is explained, a free one typed in is used, and Auto goes around busy ports", async () => {
    const ctx = newCtx();
    const probe = (await op(ctx, "serve/start", { root: folder(), kind: "static" })).server.port;
    await op(ctx, "serve/stopAll");
    const blocker = Bun.serve({ hostname: "127.0.0.1", port: probe, fetch: () => new Response("busy") });
    try {
      const err = await fails(op(ctx, "serve/start", { root: folder(), kind: "static", port: probe }), "PORT_IN_USE", /Port \d+ is already used by another program/);
      expect(err.message).toContain(String(probe));
      const auto = (await op(ctx, "serve/start", { root: folder(), kind: "static" })).server;
      expect(auto.port).not.toBe(probe);
      expect(auto.port).toBeGreaterThanOrEqual(5500);
    } finally {
      await blocker.stop(true);
    }
    const free = await (async () => { const s = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") }); const p = s.port!; await s.stop(true); return p; })();
    const typed = (await op(ctx, "serve/start", { root: folder(), kind: "static", port: String(free) })).server;
    expect(typed.port).toBe(free);
  });

  test("the network option binds every interface only when asked, is shown with a network address, and is never remembered", async () => {
    const ctx = newCtx();
    const local = (await op(ctx, "serve/start", { root: folder(), kind: "static" })).server;
    expect(local).toMatchObject({ host: "127.0.0.1", lan: false, lanUrl: null });
    const lan = (await op(ctx, "serve/start", { root: folder(), kind: "static", lan: true })).server;
    expect(lan).toMatchObject({ host: "0.0.0.0", lan: true });
    expect(lan.lanUrl === null || /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/$/.test(lan.lanUrl)).toBe(true);
    const viaHost = (await op(ctx, "serve/start", { root: folder(), kind: "static", host: "lan" })).server;
    expect(viaHost.lan).toBe(true);
    // Still reachable from this computer, and a loopback server is not reachable through a network address.
    expect((await fetch(lan.url)).status).toBe(200);
    if (lan.lanUrl) {
      expect((await fetch(lan.lanUrl)).status).toBe(200);
      const refused = await fetch(local.url.replace("127.0.0.1", new URL(lan.lanUrl).hostname)).then((r) => r.status, () => 0);
      expect(refused).not.toBe(200);
    }
    // Settings remember the form choices, but no network choice.
    const saved = await updateSettings(ctx, { serveOptions: { kind: "php", liveReload: false, openBrowser: false, lan: true, host: "0.0.0.0" } });
    expect(saved.serveOptions).toEqual({ kind: "php", liveReload: false, openBrowser: false });
    expect(JSON.stringify(saved)).not.toMatch(/lan|0\.0\.0\.0/i);
    expect(readFileSync(join(ctx.dataDir, "file_manager.json"), "utf8")).not.toMatch(/"lan"|0\.0\.0\.0/);
    expect(sanitizeSettings({ serveOptions: { kind: "evil", liveReload: "yes", openBrowser: 3 } }, ctx).serveOptions).toEqual({ kind: "auto", liveReload: true, openBrowser: true });
    expect(sanitizeSettings({ serveOptions: "x" }, ctx).serveOptions).toEqual({ kind: "auto", liveReload: true, openBrowser: true });
  });

  test("opens the browser on start when asked, and says so plainly when it can't", async () => {
    const ctx = newCtx();
    const { server } = await op(ctx, "serve/start", { root: folder(), kind: "static", openBrowser: true });
    expect(ctx.launched).toHaveLength(1);
    expect(ctx.launched[0]!.args).toContain(server.url);
    const bad = newCtx({ launch: async () => { throw new Error("no browser"); } });
    const res = await op(bad, "serve/start", { root: folder(), kind: "static", openBrowser: true });
    expect(res.server.status).toBe("running");
    expect(res.openError).toMatch(/Couldn't open your web browser/);
  });

  test("open only reaches servers started here, with addresses on that server", async () => {
    const ctx = newCtx();
    const { server } = await op(ctx, "serve/start", { root: folder(), kind: "static" });
    const opened = await op(ctx, "serve/open", { id: server.id, path: "/pages/a%20b.html?x=1" });
    expect(opened.opened).toBe(`http://127.0.0.1:${server.port}/pages/a%20b.html?x=1`);
    expect(ctx.launched.at(-1)!.args).toContain(opened.opened);
    await op(ctx, "serve/open", { id: server.id });
    expect(ctx.launched.at(-1)!.args).toContain(server.url);
    for (const path of ["//evil.example/x", "http://evil.example/", "/a\\b", "relative", "/a\nb", "/\u0000", "/" + "a".repeat(5000), 5, {}]) {
      await fails(op(ctx, "serve/open", { id: server.id, path }), "BAD_REQUEST");
    }
    await fails(op(ctx, "serve/open", { id: "nope", path: "/" }), "NOT_FOUND");
    await fails(op(ctx, "serve/open", {}), "NOT_FOUND");
    const count = ctx.launched.length;
    await fails(op(ctx, "serve/open", { url: "http://evil.example/" }), "NOT_FOUND");
    expect(ctx.launched.length).toBe(count);
  });

  test("a document folder inside the project can be served instead of the project", async () => {
    const ctx = newCtx();
    const dir = folder();
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "dist", "index.html"), "<p>built</p>");
    writeFileSync(join(dir, "secret.txt"), "OUTSIDE-DOCROOT");
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "static", docroot: "dist", liveReload: false });
    expect(await (await fetch(server.url)).text()).toBe("<p>built</p>");
    expect((await fetch(`${server.url}secret.txt`)).status).toBe(404);
    expect(server.docroot).toBe(join(dir, "dist"));
    await fails(op(ctx, "serve/start", { root: dir, kind: "static", docroot: "../x" }), "BAD_REQUEST", /inside the folder/);
    await fails(op(ctx, "serve/start", { root: dir, kind: "static", docroot: dir }), "BAD_REQUEST", /not a full path/);
    await fails(op(ctx, "serve/start", { root: dir, kind: "static", docroot: "missing" }), "NOT_FOUND");
    await fails(op(ctx, "serve/start", { root: dir, kind: "static", docroot: "secret.txt" }), "NOT_A_FOLDER");
    symlinkSync(join(root), join(dir, "linkout"), "junction");
    await fails(op(ctx, "serve/start", { root: dir, kind: "static", docroot: "linkout" }), "BAD_REQUEST", /outside/);
  });

  test("the File Manager's own files can't be served", async () => {
    const ctx = newCtx();
    const own = join(import.meta.dir, "..", "resources", "file_manager");
    await fails(op(ctx, "serve/start", { root: own, kind: "static" }), "PROTECTED", /own files/);
    await fails(op(ctx, "serve/start", { root: join(own, "ui"), kind: "static" }), "PROTECTED", /own files/);
    mkdirSync(ctx.dataDir, { recursive: true });
    await fails(op(ctx, "serve/start", { root: ctx.dataDir, kind: "static" }), "PROTECTED", /own files/);
    // A folder above them may be served, but they stay hidden.
    const { server } = await op(ctx, "serve/start", { root: join(import.meta.dir, "..", "resources"), kind: "static", liveReload: false });
    expect((await fetch(`${server.url}file_manager/index.html`)).status).toBe(403);
    expect((await fetch(`${server.url}file_manager/ui/api.js`)).status).toBe(403);
  });
});

describe("what the operations check", () => {
  test("folders that are too broad or belong to the system are refused", async () => {
    const ctx = newCtx();
    for (const path of ["/", home, "/etc", "/usr/bin", "/System", "/Users", "/opt", "/var"]) {
      if (!existsSync(path)) continue;
      const err = await fails(op(ctx, "serve/start", { root: path, kind: "static" }), "PROTECTED", /too broad or belongs to the system/);
      expect(err.message).not.toContain("moved, renamed or deleted");
    }
    await fails(op(ctx, "serve/detect", { path: "/" }), "PROTECTED");
    // A project inside Documents or Desktop is fine, and so is the Documents folder itself; only the home folder is too broad.
    mkdirSync(join(home, "Documents", "project"), { recursive: true });
    writeFileSync(join(home, "Documents", "project", "index.html"), "<body></body>");
    expect((await op(ctx, "serve/start", { root: join(home, "Documents", "project"), kind: "static" })).server.status).toBe("running");
    expect((await op(ctx, "serve/start", { root: join(home, "Documents"), kind: "static" })).server.status).toBe("running");
  });

  test("bad input is explained in plain words", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "file.txt"), "x");
    await fails(op(ctx, "serve/start", {}), "BAD_PATH", /No location was given/);
    await fails(op(ctx, "serve/start", { root: "relative/path" }), "BAD_PATH", /isn't a full path/);
    await fails(op(ctx, "serve/start", { root: `${dir}\0x` }), "BAD_PATH");
    await fails(op(ctx, "serve/start", { root: `${dir}\nx` }), "BAD_PATH");
    await fails(op(ctx, "serve/start", { root: join(root, "does-not-exist") }), "NOT_FOUND", /doesn't exist/);
    await fails(op(ctx, "serve/start", { root: join(dir, "file.txt") }), "NOT_A_FOLDER", /isn't a folder/);
    for (const port of [80, 1023, 65536, -1, 1.5, "abc", "99999", true, {}, []]) await fails(op(ctx, "serve/start", { root: dir, port }), "BAD_REQUEST", /port must be a whole number/);
    await fails(op(ctx, "serve/start", { root: dir, kind: "ruby" }), "BAD_REQUEST", /kind of server/);
    await fails(op(ctx, "serve/start", { root: dir, host: "10.0.0.5" }), "BAD_REQUEST", /this computer only, or your network/);
    for (const key of ["liveReload", "dotfiles", "cors", "listing", "openBrowser"]) await fails(op(ctx, "serve/start", { root: dir, kind: "static", [key]: "yes" }), "BAD_REQUEST", /must be on or off/);
    await fails(op(ctx, "serve/log", { id: 5 }), "NOT_FOUND");
    await fails(op(ctx, "serve/stop", {}), "NOT_FOUND");
    expect((await op(ctx, "serve/status")).servers).toEqual([]);
  });

  test("options can come in an options object, and unknown keys are ignored", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "i.html"), "<body></body>");
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "static", options: { liveReload: false, cors: true, dotfiles: true, nonsense: 1 }, extra: "ignored" });
    expect(server).toMatchObject({ liveReload: false, cors: true, dotfiles: true });
    const res = await fetch(`${server.url}i.html`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.text()).toBe("<body></body>");
  });

  test("detect tells what a folder looks like", async () => {
    const ctx = newCtx();
    const staticDir = folder("plain");
    writeFileSync(join(staticDir, "index.html"), "x");
    const d1 = await op(ctx, "serve/detect", { path: staticDir });
    expect(d1).toMatchObject({ kind: "static", framework: null, suggestedDocroot: "", indexFiles: ["index.html"], hasPhp: false, hasHtml: true, path: staticDir });
    expect(d1.hints.join(" ")).toContain("live server");
    expect(d1.running).toEqual({ static: null, php: null });

    const laravel = folder("laravel");
    mkdirSync(join(laravel, "public"));
    writeFileSync(join(laravel, "artisan"), "<?php");
    writeFileSync(join(laravel, "composer.json"), "{}");
    writeFileSync(join(laravel, "public", "index.php"), "<?php");
    const d2 = await op(ctx, "serve/detect", { path: laravel });
    expect(d2).toMatchObject({ kind: "php", framework: "laravel", suggestedDocroot: "public", hasPhp: true });
    expect(d2.hints.join(" ")).toContain("Laravel project");

    const symfony = folder("symfony");
    mkdirSync(join(symfony, "public"));
    writeFileSync(join(symfony, "composer.json"), "{}");
    writeFileSync(join(symfony, "symfony.lock"), "{}");
    writeFileSync(join(symfony, "public", "index.php"), "<?php");
    expect(await op(ctx, "serve/detect", { path: symfony })).toMatchObject({ kind: "php", framework: "symfony", suggestedDocroot: "public" });

    const wp = folder("wp");
    writeFileSync(join(wp, "wp-config.php"), "<?php");
    writeFileSync(join(wp, "index.php"), "<?php");
    const d3 = await op(ctx, "serve/detect", { path: wp });
    expect(d3).toMatchObject({ kind: "php", framework: "wordpress", suggestedDocroot: "" });
    expect(d3.hints.join(" ")).toContain("needs a database");

    const plainPhp = folder("plainphp");
    writeFileSync(join(plainPhp, "tool.php"), "<?php");
    expect(await op(ctx, "serve/detect", { path: plainPhp })).toMatchObject({ kind: "php", framework: null, hasPhp: true, indexFiles: [] });

    const htdocs = folder("htdocs-site");
    mkdirSync(join(htdocs, "htdocs"));
    writeFileSync(join(htdocs, "htdocs", "index.php"), "<?php");
    expect(await op(ctx, "serve/detect", { path: htdocs })).toMatchObject({ suggestedDocroot: "htdocs", kind: "php" });

    const composerOnly = folder("composer");
    writeFileSync(join(composerOnly, "composer.json"), "{}");
    expect((await op(ctx, "serve/detect", { path: composerOnly })).framework).toBe("composer");

    const { server } = await op(ctx, "serve/start", { root: staticDir, kind: "static" });
    expect((await op(ctx, "serve/detect", { path: staticDir })).running.static.id).toBe(server.id);
  });

  test("a PHP server without PHP says what to install, per system, and installs nothing", async () => {
    const empty = folder("no-tools");
    const hints = { darwin: /brew install php/, linux: /sudo apt install php-cli/, win32: /winget install PHP\.PHP[\s\S]*scoop install php/ };
    for (const platform of ["darwin", "linux", "win32"] as const) {
      expect(installHints(platform).join(" ")).toMatch(hints[platform]);
      const ctx = newCtx({ platform, toolDirs: [empty] });
      const status = await op(ctx, "serve/status");
      expect(status.php).toMatchObject({ available: false, path: null, version: null });
      expect(status.php.hints.join(" ")).toMatch(hints[platform]);
      const dir = folder();
      writeFileSync(join(dir, "index.php"), "<?php echo 1;");
      // A Windows-style context can't be pointed at this computer's folders, so for it only the status is checked.
      if (platform === "win32") continue;
      const err = await fails(op(ctx, "serve/start", { root: dir, kind: "php" }), "NO_PHP", /PHP isn't installed on this computer/);
      expect(err.message).toMatch(hints[platform]);
      expect(err.details.hints.length).toBeGreaterThan(0);
      // Automatic kind picks PHP for a PHP folder, and then says the same.
      await fails(op(ctx, "serve/start", { root: dir }), "NO_PHP");
      expect((await op(ctx, "serve/detect", { path: dir })).phpAvailable).toBe(false);
    }
    // A live server doesn't need PHP at all.
    const ctx = newCtx({ toolDirs: [empty] });
    expect((await op(ctx, "serve/start", { root: folder(), kind: "static" })).server.status).toBe("running");
  });
});

describe("closing the File Manager ends every server", () => {
  test("disposers stop servers, watchers and pages", async () => {
    const ctx = newCtx();
    const dir = folder();
    writeFileSync(join(dir, "index.html"), "<body></body>");
    const { server } = await op(ctx, "serve/start", { root: dir, kind: "static" });
    const events = eventReader(await fetch(`${server.url}__live__`));
    expect((await events.next())?.type).toBe("hello");
    expect(ctx.disposers.length).toBeGreaterThan(0);
    for (const dispose of ctx.disposers.splice(0)) dispose();
    expect(await events.ended()).toBe(true);
    for (let i = 0; i < 20 && !(await portIsFree(server.port)); i++) await sleep(100);
    expect(await portIsFree(server.port)).toBe(true);
    expect((await op(ctx, "serve/status")).servers).toEqual([]);
  });
});

describe("through the File Manager's own server", () => {
  const TOKEN = "serve-token";
  let fm: ReturnType<typeof startFileManagerServer>;
  let base = "";
  const launched: string[][] = [];

  beforeAll(() => {
    fm = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: join(root, "fm-data"), launch: async (c, a) => { launched.push([c, ...a]); } } });
    base = `http://127.0.0.1:${fm.port}`;
  });
  afterAll(async () => {
    fm.stop(true);
  });

  const call = async (name: string, body: Record<string, any> = {}, token: string | null = TOKEN, extra: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "x-fm-token": token } : {}), ...extra }, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  };

  test("every operation is registered, needs the token, and answers in the usual shape", async () => {
    for (const name of Object.keys(serveOperations)) expect(API_OPERATIONS, name).toContain(name);
    expect((await call("serve/status", {}, null)).status).toBe(401);
    expect((await call("serve/status", {}, "wrong")).status).toBe(401);
    const ok = await call("serve/status");
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ ok: true, servers: [], max: 8 });
    expect(ok.json.php).toHaveProperty("available");
    const bad = await call("serve/start", { root: "relative" });
    expect(bad.status).toBe(400);
    expect(bad.json).toMatchObject({ ok: false, error: { code: "BAD_PATH" } });
    const notJson = await fetch(`${base}/api/serve/status`, { method: "POST", headers: { "Content-Type": "text/plain", "x-fm-token": TOKEN }, body: "{}" });
    expect(notJson.status).toBe(415);
  });

  test("only this computer can use them", async () => {
    const wrongHost = await raw(fm.port!, `POST /api/serve/status HTTP/1.1\r\nHost: evil.example\r\nContent-Type: application/json\r\nx-fm-token: ${TOKEN}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`);
    expect(wrongHost.status).toBe(403);
    const crossSite = await fetch(`${base}/api/serve/status`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, Origin: "http://evil.example" }, body: "{}" });
    expect(crossSite.status).toBe(403);
  });

  test("start, list, log, open and stop work end to end; the File Manager's token and API are not reachable through a served port", async () => {
    const dir = folder();
    writeFileSync(join(dir, "index.html"), "<body>through the api</body>");
    writeFileSync(join(dir, "only-in-the-served-folder.html"), "<p>x</p>");
    const started = await call("serve/start", { root: dir, kind: "static", openBrowser: true });
    expect(started.status).toBe(200);
    const server = started.json.server;
    expect(launched.at(-1)!.join(" ")).toContain(server.url);
    expect(await (await fetch(server.url)).text()).toContain("through the api");

    // The served port is not the File Manager: no API, no token, no pages of its own.
    for (const path of ["/api/health", "/api/serve/status", "/api/raw?path=/etc/hosts", "/ui/main.js", "/vendor/xterm.mjs", "/"]) {
      const res = await fetch(`${server.url.slice(0, -1)}${path}`, { headers: { "x-fm-token": TOKEN } });
      const text = await res.text();
      expect(text, path).not.toContain(TOKEN);
      expect(text, path).not.toContain("fm-token");
      expect(text, path).not.toContain('"app":"file_manager_studio"');
    }
    const post = await fetch(`${server.url}api/serve/status`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: "{}" });
    expect(post.status).toBe(405);
    expect((await fetch(`${server.url}api/health`)).status).toBe(404);
    // And the File Manager's own port knows nothing of the served site.
    expect((await fetch(`${base}/only-in-the-served-folder.html`)).status).toBe(404);

    const listed = await call("serve/status");
    expect(listed.json.servers.map((s: any) => s.id)).toEqual([server.id]);
    const log = await call("serve/log", { id: server.id });
    expect(log.json.lines.length).toBeGreaterThan(0);
    const open = await call("serve/open", { id: server.id, path: "/index.html" });
    expect(open.json.opened).toBe(`${server.url}index.html`);
    expect((await call("serve/stop", { id: server.id })).status).toBe(200);
    expect((await call("serve/stop", { id: server.id })).json.error.code).toBe("NOT_FOUND");
    expect(await portIsFree(server.port)).toBe(true);
  });

  test("stopping the File Manager stops its servers", async () => {
    const own = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: join(root, "fm-data2"), launch: async () => {} } });
    const ownBase = `http://127.0.0.1:${own.port}`;
    const dir = folder();
    writeFileSync(join(dir, "index.html"), "<body></body>");
    const res = await fetch(`${ownBase}/api/serve/start`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify({ root: dir, kind: "static" }) });
    const { server } = (await res.json()) as any;
    expect((await fetch(server.url)).status).toBe(200);
    own.stop(true);
    for (let i = 0; i < 30 && !(await portIsFree(server.port)); i++) await sleep(100);
    expect(await portIsFree(server.port)).toBe(true);
    expect(existsSync(dir)).toBe(true);
  });
});
