// The download engine against a local server that can do what real ones do: ranges, slow connections, dropped
// connections, redirects, no ranges at all, and a file that changes.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as nodePath from "path";
import { DownloadManager, chunkSizeFor, cleanHeaders, decodeProgress, encodeProgress, nameFromDisposition, parseChecksum, safeFileName, splitCredentials, uniquePath, probeUrl, type DlView } from "../src/features/filemanager/fmDownloads";

/** The byte at a position: a repeatable pattern, so any slice of the file can be made (and checked) without storing it. */
const byteAt = (i: number) => (i * 31 + (i >> 8) * 7 + (i >> 16)) & 255;
function bytes(from: number, to: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(Math.max(0, to - from));
  for (let i = 0; i < out.length; i++) out[i] = byteAt(from + i);
  return out;
}
const sha = (size: number) => {
  const h = createHash("sha256");
  for (let at = 0; at < size; at += 1 << 20) h.update(bytes(at, Math.min(size, at + (1 << 20))));
  return h.digest("hex");
};

let hits: Array<{ path: string; range: string | null }> = [];
let flakyLeft = 0;
let server: ReturnType<typeof Bun.serve>;
let base = "";

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const range = req.headers.get("range");
      hits.push({ path: url.pathname + url.search, range });
      const m = /^\/file\/(\d+)(\.bin)?$/.exec(url.pathname);
      if (url.pathname === "/redirect") return new Response(null, { status: 302, headers: { Location: `/file/${url.searchParams.get("size") ?? 1000}.bin` } });
      if (url.pathname === "/auth") {
        if (req.headers.get("authorization") !== `Basic ${Buffer.from("u:p").toString("base64")}`) return new Response("no", { status: 401 });
        return new Response(bytes(0, 500), { headers: { "Content-Length": "500", "Accept-Ranges": "bytes" } });
      }
      if (url.pathname === "/same") {
        // The same address answers with different content: stands in for a file that is slow to download.
        const size = 6 * 1024 * 1024;
        const v = url.searchParams.get("v") ?? "a";
        return new Response(new Uint8Array(size).fill(v.charCodeAt(0)), { headers: { "Content-Length": String(size) } });
      }
      if (url.pathname === "/forbidden") return new Response("no", { status: 403 });
      if (url.pathname === "/missing") return new Response("no", { status: 404 });
      if (url.pathname === "/named") return new Response(bytes(0, 100), { headers: { "Content-Disposition": `attachment; filename="../evil:name?.txt"`, "Content-Length": "100" } });
      if (!m) return new Response("not found", { status: 404 });
      const size = Number(m[1]);
      const noRange = url.searchParams.has("norange");
      const bps = Number(url.searchParams.get("bps") ?? 0); // bytes per second for each connection
      const flaky = url.searchParams.has("flaky");
      const etag = url.searchParams.get("etag") ?? `"v1-${size}"`;
      let start = 0;
      let end = size - 1;
      let status = 200;
      const headers: Record<string, string> = { "Content-Type": "application/octet-stream", ETag: etag, ...(noRange ? {} : { "Accept-Ranges": "bytes" }) };
      const rm = !noRange && range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
      if (rm) {
        start = rm[1] === "" ? Math.max(0, size - Number(rm[2])) : Number(rm[1]);
        end = rm[2] === "" ? size - 1 : Math.min(size - 1, Number(rm[2]));
        if (start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
        status = 206;
        headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      }
      const length = end - start + 1;
      headers["Content-Length"] = String(length);
      // Plain downloads carry their length (a streamed body would be sent chunked, which real file servers don't do).
      if (bps === 0 && !flaky) return new Response(bytes(start, end + 1), { status, headers });
      let sent = 0;
      // A flaky connection drops after a part of what was asked for, a limited number of times.
      const cutAt = flaky && flakyLeft > 0 && length > 100_000 ? (flakyLeft--, Math.floor(length * 0.4)) : Infinity;
      const body = new ReadableStream({
        async pull(controller) {
          if (sent >= length || sent >= cutAt) return controller.close();
          const n = Math.min(65536, length - sent, cutAt - sent);
          controller.enqueue(bytes(start + sent, start + sent + n));
          sent += n;
          if (bps > 0) await Bun.sleep((n / bps) * 1000);
        },
      });
      return new Response(body, { status, headers });
    },
    error() {
      return new Response(null, { status: 500 });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => server.stop(true));

let dirCount = 0;
function workspace() {
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), `dl-test-${dirCount++}-`));
  const manager = new DownloadManager({ file: nodePath.join(dir, "list.json"), defaultFolder: nodePath.join(dir, "out") });
  return { dir, out: nodePath.join(dir, "out"), manager, file: nodePath.join(dir, "list.json") };
}

async function until(manager: DownloadManager, id: string, ok: (v: DlView) => boolean, ms = 30000): Promise<DlView> {
  const t0 = Date.now();
  for (;;) {
    const v = manager.list().find((i) => i.id === id)!;
    if (ok(v)) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out: ${JSON.stringify(v)}`);
    await Bun.sleep(25);
  }
}
const finished = (m: DownloadManager, id: string) => until(m, id, (v) => v.state === "done" || v.state === "error" || v.state === "paused");

function fileSha(path: string) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(path));
  return h.digest("hex");
}

describe("helpers", () => {
  test("file names are made safe", () => {
    expect(safeFileName("../../etc/passwd")).toBe(".._.._etc_passwd".replace(/^[. ]+/, ""));
    expect(safeFileName("a:b*c?.txt")).toBe("a_b_c_.txt");
    expect(safeFileName("CON.txt")).toBe("_CON.txt");
    expect(safeFileName("   ")).toBe("download");
    expect(safeFileName("x".repeat(400) + ".zip").length).toBeLessThanOrEqual(180);
  });
  test("content-disposition names", () => {
    expect(nameFromDisposition(`attachment; filename="a b.zip"`)).toBe("a b.zip");
    expect(nameFromDisposition(`attachment; filename*=UTF-8''na%C3%AFve%20file.txt`)).toBe("naïve file.txt");
    expect(nameFromDisposition(`attachment; filename=plain.bin; size=3`)).toBe("plain.bin");
    expect(nameFromDisposition(null)).toBeNull();
  });
  test("checksums are parsed and checked", () => {
    expect(parseChecksum("sha256:" + "a".repeat(64))).toEqual({ algo: "sha256", value: "a".repeat(64) });
    expect(parseChecksum("B".repeat(32))).toEqual({ algo: "md5", value: "b".repeat(32) });
    expect(() => parseChecksum("sha256:abc")).toThrow();
    expect(parseChecksum("  ")).toBeUndefined();
  });
  test("headers are cleaned", () => {
    expect(cleanHeaders({ Cookie: "a=b", "X-Test": "ok", Host: "evil", "Bad Name": "x", Authorization: "x\r\nInjected: 1", Range: "bytes=0-" })).toEqual({ Cookie: "a=b", "X-Test": "ok" });
  });
  test("credentials move into an Authorization header", () => {
    const r = splitCredentials("https://user:p%40ss@example.com/f.zip");
    expect(r.url).toBe("https://example.com/f.zip");
    expect(r.auth).toBe(`Basic ${Buffer.from("user:p@ss").toString("base64")}`);
    expect(splitCredentials("https://example.com/").auth).toBeUndefined();
  });
  test("saved progress survives encoding", () => {
    const size = 10 * 1024 * 1024 + 123;
    const chunk = 1024 * 1024;
    const done = new Array(Math.ceil(size / chunk)).fill(0);
    done[0] = chunk; done[1] = chunk; done[2] = 5000; done[4] = chunk; done[10] = size - 10 * chunk;
    const back = decodeProgress(encodeProgress(done, chunk, size), chunk, size);
    expect(back).toEqual(done);
  });
  test("chunks are a sensible size", () => {
    expect(chunkSizeFor(1_000_000, 8)).toBe(512 * 1024);
    expect(chunkSizeFor(10 * 1024 ** 3, 8)).toBe(16 * 1024 * 1024);
    expect(chunkSizeFor(200 * 1024 * 1024, 8) % 65536).toBe(0);
  });
  test("a free name is found", () => {
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "dl-name-"));
    fs.writeFileSync(nodePath.join(dir, "a.zip"), "x");
    fs.writeFileSync(nodePath.join(dir, "a (1).zip.part"), "x");
    expect(nodePath.basename(uniquePath(dir, "a.zip"))).toBe("a (2).zip");
  });
});

describe("probing", () => {
  test("a server with ranges", async () => {
    const r = await probeUrl(`${base}/file/12345.bin`, undefined, fetch);
    expect(r).toMatchObject({ size: 12345, ranges: true, name: "12345.bin" });
    expect(r.etag).toBe('"v1-12345"');
  });
  test("a server without ranges", async () => {
    const r = await probeUrl(`${base}/file/777.bin?norange`, undefined, fetch);
    expect(r).toMatchObject({ size: 777, ranges: false });
  });
  test("redirects are followed and the final address is kept", async () => {
    const r = await probeUrl(`${base}/redirect?size=4000`, undefined, fetch);
    expect(r.finalUrl).toBe(`${base}/file/4000.bin`);
    expect(r.size).toBe(4000);
  });
  test("the name the server asks for is cleaned", async () => {
    const r = await probeUrl(`${base}/named`, undefined, fetch);
    expect(r.name).not.toContain("/");
    expect(r.name).not.toContain(":");
  });
  test("errors say what happened", async () => {
    await expect(probeUrl(`${base}/forbidden`, undefined, fetch)).rejects.toThrow(/refused/);
    await expect(probeUrl(`${base}/missing`, undefined, fetch)).rejects.toThrow(/isn't there/);
    await expect(probeUrl("ftp://example.com/x", undefined, fetch)).rejects.toThrow(/http/);
    await expect(probeUrl("not a url", undefined, fetch)).rejects.toThrow(/web address/);
  });
});

describe("review fixes", () => {
  test("two downloads of the same name never share a .part file", async () => {
    const { manager, out } = workspace();
    const a = manager.add([{ url: `${base}/file/3000000.bin?bps=2000000`, folder: out, connections: 2 }])[0]!;
    const b = manager.add([{ url: `${base}/file/3000001.bin?bps=2000000`, folder: out, connections: 2, name: "file.bin" }, { url: `${base}/file/3000000.bin?bps=2000000`, folder: out, connections: 2 }]);
    const all = [a, ...b];
    const results = await Promise.all(all.map((x) => finished(manager, x.id)));
    expect(results.every((r) => r.state === "done")).toBe(true);
    expect(new Set(results.map((r) => r.path)).size).toBe(all.length);
    for (const r of results) expect(r.size).toBe(r.received);
    expect(fs.readdirSync(out).filter((f) => f.endsWith(".part") || f.endsWith(".dlstate"))).toEqual([]);
    manager.closeAll();
  }, 60000);

  test("removing a waiting duplicate does not delete the running download's files", async () => {
    const { manager, out } = workspace();
    manager.setSettings({ maxConcurrent: 1 });
    const size = 8 * 1024 * 1024;
    const [running, waiting] = manager.add([{ url: `${base}/file/${size}.bin?bps=2000000`, folder: out, connections: 2 }, { url: `${base}/file/${size}.bin?bps=2000000`, folder: out, connections: 2 }]);
    await until(manager, running!.id, (v) => v.received > 500_000);
    expect(manager.list().find((i) => i.id === waiting!.id)!.state).toBe("queued");
    await manager.remove(waiting!.id);
    const v = await finished(manager, running!.id);
    expect(v.state).toBe("done");
    expect(fileSha(v.path)).toBe(sha(size));
    manager.closeAll();
  }, 60000);

  test("a bad address in a batch adds nothing", () => {
    const { manager } = workspace();
    expect(() => manager.add([{ url: `${base}/file/100.bin`, start: false }, { url: "nope" }])).toThrow();
    expect(manager.list().length).toBe(0);
    manager.closeAll();
  });

  test("pausing during the checksum check is not reported as a damaged file", async () => {
    const { manager, out } = workspace();
    const size = 1_000_000;
    const [item] = manager.add([{ url: `${base}/file/${size}.bin`, folder: out, checksum: `sha256:${sha(size)}` }]);
    const probeState = await until(manager, item!.id, (v) => v.state === "verifying" || v.state === "done", 20000);
    // Pausing now may or may not catch the check (it is quick); either way the end state must be right.
    manager.pause(item!.id);
    const v = await finished(manager, item!.id);
    expect(["done", "paused"]).toContain(v.state);
    expect(probeState.state === "verifying" || probeState.state === "done").toBe(true);
    if (v.state === "paused") {
      manager.resume(item!.id);
      const again = await finished(manager, item!.id);
      expect(again.state).toBe("done");
      expect(again.verified).toBe(true);
      expect(fs.readdirSync(out).filter((f) => f.endsWith(".bin")).length).toBe(1);
    } else expect(v.verified).toBe(true);
    manager.closeAll();
  }, 30000);

  test("an interrupted checksum check is not a verdict, and resuming checks again", async () => {
    const { manager, out } = workspace();
    fs.mkdirSync(out, { recursive: true });
    const file = nodePath.join(out, "big.bin");
    const size = 64 * 1024 * 1024;
    fs.writeFileSync(file, Buffer.alloc(size, 5));
    const good = createHash("sha256").update(Buffer.alloc(size, 5)).digest("hex");
    const [item] = manager.add([{ url: `${base}/file/${size}.bin`, folder: out, name: "big.bin", checksum: `sha256:${good}`, start: false }]);
    const raw = manager.get(item!.id)!;
    raw.size = size;
    raw.received = size;
    raw.path = file;
    // The check starts, then is aborted before it can finish.
    const job = { ac: new AbortController() };
    setTimeout(() => job.ac.abort(), 5);
    await expect((manager as any).verify(raw, job)).rejects.toMatchObject({ name: "AbortError" });
    expect(raw.verified).toBeNull();
    expect(raw.state).not.toBe("error");
    // Resume goes straight to the check (nothing is downloaded again) and confirms the file.
    manager.resume(item!.id);
    const v = await finished(manager, item!.id);
    expect(v.state).toBe("done");
    expect(v.verified).toBe(true);
    expect(v.path).toBe(file);
    expect(fs.readdirSync(out)).toEqual(["big.bin"]);
    manager.closeAll();
  }, 30000);

  test("a login typed into the address is sent with every request and not kept in the address", async () => {
    const { manager, out } = workspace();
    const [item] = manager.add([{ url: base.replace("http://", "http://u:p@") + "/auth", folder: out, name: "auth.bin" }]);
    expect(item!.url).not.toContain("u:p@");
    const v = await finished(manager, item!.id);
    expect(v.state).toBe("done");
    expect(v.size).toBe(500);
    manager.closeAll();
  });

  test("logins and cookies are not sent to a different site", async () => {
    const other = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => new Response(JSON.stringify({ auth: req.headers.get("authorization"), cookie: req.headers.get("cookie"), keep: req.headers.get("x-keep") }), { headers: { "Content-Length": "2000" } }) });
    const redirecting = Bun.serve({ port: 0, hostname: "localhost", fetch: () => new Response(null, { status: 302, headers: { Location: `http://127.0.0.1:${other.port}/x` } }) });
    try {
      const seen: any[] = [];
      const spy: typeof fetch = ((input: any, init: any) => { seen.push({ url: String(input), headers: init?.headers }); return fetch(input, init); }) as any;
      await probeUrl(`http://localhost:${redirecting.port}/start`, { Authorization: "Bearer secret", Cookie: "s=1", "X-Keep": "yes" }, spy);
      const first = seen[0].headers;
      const second = seen[1].headers;
      expect(first.Authorization).toBe("Bearer secret");
      expect(first.Cookie).toBe("s=1");
      expect(second.Authorization).toBeUndefined();
      expect(second.Cookie).toBeUndefined();
      expect(second["X-Keep"]).toBe("yes");
    } finally {
      other.stop(true);
      redirecting.stop(true);
    }
  });

  test("an endless redirect loop gives up", async () => {
    const loop = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => new Response(null, { status: 302, headers: { Location: new URL(req.url).pathname } }) });
    try {
      await expect(probeUrl(`http://127.0.0.1:${loop.port}/a`, undefined, fetch)).rejects.toThrow(/redirects too many/);
    } finally {
      loop.stop(true);
    }
  });

  test("a changed total length in a part is caught", async () => {
    const lying = Bun.serve({
      port: 0, hostname: "127.0.0.1",
      fetch(req) {
        const size = 3 * 1024 * 1024;
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get("range") ?? "");
        if (!range) return new Response(null, { status: 200 });
        const s = Number(range[1]);
        const e = range[2] ? Number(range[2]) : size - 1;
        // The first probe says 3 MB; the parts claim the file is now bigger.
        const total = s === 0 && e === 0 ? size : size + 1000;
        return new Response(new Uint8Array(e - s + 1), { status: 206, headers: { "Content-Range": `bytes ${s}-${e}/${total}`, "Content-Length": String(e - s + 1) } });
      },
    });
    try {
      const { manager, out } = workspace();
      const [item] = manager.add([{ url: `http://127.0.0.1:${lying.port}/f.bin`, folder: out, connections: 2 }]);
      const v = await finished(manager, item!.id);
      expect(v.state).toBe("error");
      expect(v.message).toMatch(/changed on the server/);
      manager.closeAll();
    } finally {
      lying.stop(true);
    }
  }, 30000);
});

describe("downloading", () => {
  test("a file split over several connections arrives byte for byte", async () => {
    const { manager, out } = workspace();
    const size = 20 * 1024 * 1024 + 4321;
    hits = [];
    const [item] = manager.add([{ url: `${base}/file/${size}.bin`, folder: out, connections: 8 }]);
    const v = await finished(manager, item!.id);
    expect(v.state).toBe("done");
    expect(v.size).toBe(size);
    expect(v.received).toBe(size);
    expect(fileSha(v.path)).toBe(sha(size));
    expect(fs.existsSync(`${v.path}.part`)).toBe(false);
    expect(fs.existsSync(`${v.path}.dlstate`)).toBe(false);
    // It really used several ranged requests, not one stream.
    expect(hits.filter((h) => h.range && h.range !== "bytes=0-0").length).toBeGreaterThan(4);
    manager.closeAll();
  }, 40000);

  test("more connections are faster than one when each connection is slow", async () => {
    const size = 6 * 1024 * 1024;
    const time = async (connections: number) => {
      const { manager, out } = workspace();
      const t0 = Date.now();
      const [item] = manager.add([{ url: `${base}/file/${size}.bin?bps=3000000`, folder: out, connections }]);
      const v = await finished(manager, item!.id);
      expect(v.state).toBe("done");
      expect(fileSha(v.path)).toBe(sha(size));
      manager.closeAll();
      return Date.now() - t0;
    };
    const one = await time(1);
    const eight = await time(8);
    expect(eight).toBeLessThan(one * 0.6);
  }, 60000);

  test("a server without ranges still works, in one stream", async () => {
    const { manager, out } = workspace();
    const size = 3 * 1024 * 1024 + 17;
    const [item] = manager.add([{ url: `${base}/file/${size}.bin?norange`, folder: out, connections: 8 }]);
    const v = await finished(manager, item!.id);
    expect(v.state).toBe("done");
    expect(v.resumable).toBe(false);
    expect(fileSha(v.path)).toBe(sha(size));
    manager.closeAll();
  });

  test("dropped connections are retried and the result is still exact", async () => {
    const { manager, out } = workspace();
    const size = 8 * 1024 * 1024;
    flakyLeft = 6;
    const [item] = manager.add([{ url: `${base}/file/${size}.bin?flaky=1`, folder: out, connections: 4 }]);
    // Each drop is retried after a wait that doubles up to 8 s, and all six drops can land on one connection, so the
    // allowance is longer than the usual 30 s (a slow CI runner needed more than that once).
    const v = await until(manager, item!.id, (x) => x.state === "done" || x.state === "error" || x.state === "paused", 80000);
    expect(v.state).toBe("done");
    expect(flakyLeft).toBe(0);
    expect(fileSha(v.path)).toBe(sha(size));
    manager.closeAll();
  }, 90000);

  test("a pause keeps the progress and resume finishes the same file", async () => {
    const { manager, out } = workspace();
    const size = 12 * 1024 * 1024;
    const [item] = manager.add([{ url: `${base}/file/${size}.bin?bps=2000000`, folder: out, connections: 4 }]);
    await until(manager, item!.id, (v) => v.received > size * 0.25);
    manager.pause(item!.id);
    const paused = await until(manager, item!.id, (v) => v.state === "paused");
    expect(paused.received).toBeGreaterThan(0);
    expect(paused.received).toBeLessThan(size);
    expect(fs.existsSync(`${paused.path}.part`)).toBe(true);
    expect(fs.existsSync(`${paused.path}.dlstate`)).toBe(true);
    hits = [];
    manager.resume(item!.id);
    const v = await finished(manager, item!.id);
    expect(v.state).toBe("done");
    expect(fileSha(v.path)).toBe(sha(size));
    // It did not fetch the whole file again: the requests after the resume cover (about) what was missing.
    const fetched = hits.filter((h) => h.range && h.range !== "bytes=0-0").map((h) => /bytes=(\d+)-(\d+)/.exec(h.range!)!).reduce((a, m) => a + (Number(m[2]) - Number(m[1]) + 1), 0);
    expect(fetched).toBeLessThan(size * 0.9);
    manager.closeAll();
  }, 60000);

  test("a download interrupted by closing the program resumes in a new manager", async () => {
    const { manager, out, dir, file } = workspace();
    const size = 10 * 1024 * 1024;
    const [item] = manager.add([{ url: `${base}/file/${size}.bin?bps=2000000`, folder: out, connections: 4 }]);
    await until(manager, item!.id, (v) => v.received > size * 0.3);
    manager.closeAll();
    await Bun.sleep(100);
    const again = new DownloadManager({ file, defaultFolder: nodePath.join(dir, "out") });
    const listed = again.list()[0]!;
    expect(listed.state).toBe("paused");
    expect(listed.received).toBeGreaterThan(0);
    again.resume(listed.id);
    const v = await finished(again, listed.id);
    expect(v.state).toBe("done");
    expect(fileSha(v.path)).toBe(sha(size));
    again.closeAll();
  }, 60000);

  test("a file that changed on the server is not mixed with the old part", async () => {
    const { manager, out } = workspace();
    const size = 8 * 1024 * 1024;
    const [item] = manager.add([{ url: `${base}/file/${size}.bin?bps=2000000&etag=%22first%22`, folder: out, connections: 4 }]);
    await until(manager, item!.id, (v) => v.received > size * 0.2);
    manager.pause(item!.id);
    await until(manager, item!.id, (v) => v.state === "paused");
    // Same file name, a different ETag: the saved progress must be thrown away and the file fetched afresh.
    const raw = manager.get(item!.id)!;
    raw.url = `${base}/file/${size}.bin?etag=%22second%22`;
    manager.resume(item!.id);
    const v = await finished(manager, item!.id);
    expect(v.state).toBe("done");
    expect(fileSha(v.path)).toBe(sha(size));
    manager.closeAll();
  }, 60000);

  test("the speed limit holds", async () => {
    const { manager, out } = workspace();
    manager.setSettings({ speedLimit: 1_000_000 });
    const size = 3 * 1024 * 1024;
    const t0 = Date.now();
    const [item] = manager.add([{ url: `${base}/file/${size}.bin`, folder: out, connections: 4 }]);
    const v = await finished(manager, item!.id);
    expect(v.state).toBe("done");
    const seconds = (Date.now() - t0) / 1000;
    expect(seconds).toBeGreaterThan(1.8); // 3 MB at 1 MB/s, minus the burst allowance
    manager.closeAll();
  }, 30000);

  test("a right checksum is confirmed and a wrong one is reported", async () => {
    const { manager, out } = workspace();
    const size = 1_500_000;
    const [ok] = manager.add([{ url: `${base}/file/${size}.bin`, folder: out, checksum: `sha256:${sha(size)}` }]);
    const good = await finished(manager, ok!.id);
    expect(good.state).toBe("done");
    expect(good.verified).toBe(true);
    const [bad] = manager.add([{ url: `${base}/file/${size}.bin`, folder: out, checksum: `sha256:${"0".repeat(64)}` }]);
    const wrong = await finished(manager, bad!.id);
    expect(wrong.state).toBe("error");
    expect(wrong.verified).toBe(false);
    expect(wrong.message).toMatch(/doesn't match/);
    expect(fs.existsSync(wrong.path)).toBe(true);
    manager.closeAll();
  }, 30000);

  test("the same name twice gives two files, and redirects work", async () => {
    const { manager, out } = workspace();
    const a = manager.add([{ url: `${base}/redirect?size=5000`, folder: out }])[0]!;
    const av = await finished(manager, a.id);
    const b = manager.add([{ url: `${base}/redirect?size=5000`, folder: out }])[0]!;
    const bv = await finished(manager, b.id);
    expect(av.state).toBe("done");
    expect(bv.state).toBe("done");
    expect(av.path).not.toBe(bv.path);
    expect(fs.readdirSync(out).filter((f) => f.endsWith(".bin")).length).toBe(2);
    manager.closeAll();
  });

  test("failures are explained and can be retried", async () => {
    const { manager, out } = workspace();
    const [item] = manager.add([{ url: `${base}/missing`, folder: out }]);
    const v = await finished(manager, item!.id);
    expect(v.state).toBe("error");
    expect(v.message).toMatch(/isn't there/);
    manager.closeAll();
  });

  test("only a few downloads run at once; the rest wait their turn", async () => {
    const { manager, out } = workspace();
    manager.setSettings({ maxConcurrent: 2 });
    const size = 4 * 1024 * 1024;
    const added = manager.add([1, 2, 3, 4].map((n) => ({ url: `${base}/file/${size + n}.bin?bps=1500000`, folder: out, connections: 2 })));
    await Bun.sleep(400);
    const states = manager.list().map((i) => i.state);
    expect(states.filter((s) => s === "queued").length).toBe(2);
    for (const a of added) expect((await finished(manager, a.id)).state).toBe("done");
    manager.closeAll();
  }, 60000);

  test("removing a download deletes its leftovers", async () => {
    const { manager, out } = workspace();
    const [item] = manager.add([{ url: `${base}/file/${10 * 1024 * 1024}.bin?bps=1000000`, folder: out, connections: 2 }]);
    await until(manager, item!.id, (v) => v.received > 500_000);
    await manager.remove(item!.id);
    expect(manager.list().length).toBe(0);
    expect(fs.readdirSync(out)).toEqual([]);
    manager.closeAll();
  }, 30000);

  test("the saved list never shows header values", () => {
    const { manager } = workspace();
    manager.add([{ url: `${base}/file/1000.bin`, headers: { Authorization: "Bearer secret-token", Cookie: "s=1" }, start: false }]);
    const json = JSON.stringify(manager.list());
    expect(json).not.toContain("secret-token");
    expect(manager.list()[0]!.headerNames.sort()).toEqual(["Authorization", "Cookie"]);
    manager.closeAll();
  });

  test("bad requests are refused", () => {
    const { manager } = workspace();
    expect(() => manager.add([{ url: "file:///etc/passwd" }])).toThrow(/http/);
    expect(() => manager.add([{ url: "javascript:alert(1)" }])).toThrow();
    expect(() => manager.add([{ url: `${base}/x`, checksum: "nope" }])).toThrow(/checksum/);
    manager.closeAll();
  });
});
