import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { API_OPERATIONS, MAX_BODY_BYTES, startFileManagerServer } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-server-"));
const home = join(root, "home");
const work = join(root, "work");
const launched: Array<{ command: string; args: string[] }> = [];
let server: ReturnType<typeof startFileManagerServer>;
let base: string;
const TOKEN = "test-token-123";

beforeAll(() => {
  mkdirSync(home);
  mkdirSync(work);
  server = startFileManagerServer({
    port: 0,
    host: "127.0.0.1",
    token: TOKEN,
    context: { home, dataDir: join(root, "data"), launch: async (command, args) => void launched.push({ command, args }) },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

async function api(op: string, body: unknown = {}, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
}

describe("page and assets", () => {
  test("GET / serves the page with this session's token, a strict CSP and no sniffing", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await res.text();
    expect(html).toContain(`content="${TOKEN}"`);
    expect(html).not.toContain("__FM_TOKEN__");
    expect(html).not.toContain("__FM_PLATFORM__");
  });

  test("a random token is made when none is given, and differs between servers", async () => {
    const a = startFileManagerServer({ port: 0, context: { home, dataDir: join(root, "d2") } });
    const b = startFileManagerServer({ port: 0, context: { home, dataDir: join(root, "d3") } });
    try {
      expect(a.token).not.toBe(b.token);
      expect(a.token.length).toBeGreaterThanOrEqual(24);
      expect(await (await fetch(`http://127.0.0.1:${a.port}/`)).text()).toContain(a.token);
    } finally {
      a.stop(true);
      b.stop(true);
    }
  });

  test("scripts and styles are served from /ui/, with the right type", async () => {
    const js = await fetch(`${base}/ui/main.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("text/javascript");
    const css = await fetch(`${base}/ui/style.css`);
    expect(css.headers.get("content-type")).toContain("text/css");
  });

  test("nothing outside the UI folder can be fetched, however the path is written", async () => {
    for (const p of ["/ui/../../../package.json", "/ui/..%2f..%2f..%2fpackage.json", "/ui/%2e%2e/%2e%2e/package.json", "/ui/%2e%2e%2f%2e%2e%2fpackage.json", "/ui/sub/x.js", "/ui/main.js%00.png", "/ui/.env", "/package.json", "/src/features/filemanager/fmServer.ts", "/ui/nope.js"]) {
      const res = await fetch(`${base}${p}`);
      expect([404, 400], p).toContain(res.status);
      const text = await res.text();
      expect(text, p).not.toContain("bun_rad_studio");
    }
    // The URL parser itself turns "/ui/%2e%2e/index.html" into "/index.html": that is only the public page.
    const resolved = await fetch(`${base}/ui/%2e%2e/index.html`);
    const sameNonce = (html: string) => html.replace(/name="fm-nonce" content="[^"]*"/, 'name="fm-nonce" content=""');
    expect(sameNonce(await resolved.text())).toBe(sameNonce(await (await fetch(`${base}/`)).text()));
  });

  test("health needs no token and reveals nothing sensitive", async () => {
    const res = (await (await fetch(`${base}/api/health`)).json()) as any;
    expect(res).toMatchObject({ status: "ok", app: "file_manager_studio", name: "Codecaine File Manager" });
    expect(JSON.stringify(res)).not.toContain(TOKEN);
    expect(JSON.stringify(res)).not.toContain(home);
  });

  test("it only listens on the loopback address", () => {
    expect(["127.0.0.1", "::1", "localhost"]).toContain(String(server.hostname));
  });
});

describe("who may call the API", () => {
  test("no token, a wrong token and a token of the wrong length are all refused", async () => {
    for (const headers of [{ "x-fm-token": "" }, { "x-fm-token": "wrong" }, { "x-fm-token": TOKEN + "x" }, { "x-fm-token": TOKEN.slice(0, -1) }]) {
      const r = await api("places", {}, headers);
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe("NO_TOKEN");
    }
    const bare = await fetch(`${base}/api/places`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(bare.status).toBe(401);
  });

  test("another web page can't call it: foreign Origin and foreign Host are refused even with the token", async () => {
    const origin = await fetch(`${base}/api/places`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, Origin: "https://evil.example" }, body: "{}" });
    expect(origin.status).toBe(403);
    const host = await fetch(`${base}/api/places`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, Host: "attacker.example" }, body: "{}" });
    expect(host.status).toBe(403);
    const own = await fetch(`${base}/api/places`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, Origin: base }, body: "{}" });
    expect(own.status).toBe(200);
  });

  test("only JSON is accepted for changes, so a plain-text 'simple request' from a web page is useless", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      const res = await fetch(`${base}/api/places`, { method: "POST", headers: { "Content-Type": type, "x-fm-token": TOKEN }, body: "{}" });
      expect(res.status, type).toBe(415);
    }
  });

  test("bad bodies: invalid JSON, arrays, and over-size bodies", async () => {
    const bad = await fetch(`${base}/api/list`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: "{ nope" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error.code).toBe("BAD_JSON");
    expect((await api("list", [1, 2] as any)).status).toBe(400);
    const huge = await fetch(`${base}/api/list`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify({ path: "x".repeat(MAX_BODY_BYTES + 10) }) });
    expect([413, 400]).toContain(huge.status);
  });

  test("unknown operations, GET on the API, and inherited object keys are not operations", async () => {
    expect((await api("nothing")).status).toBe(404);
    expect((await api("constructor")).status).toBe(404);
    expect((await api("__proto__")).status).toBe(404);
    expect((await api("toString")).status).toBe(404);
    const get = await fetch(`${base}/api/places`);
    expect(get.status).toBe(404);
  });

  test("every documented operation exists", () => {
    for (const op of ["places", "list", "props", "mkdir", "newfile", "rename", "relocate", "conflicts", "copy", "move", "trash", "trash/list", "trash/restore", "trash/delete", "delete", "search", "preview", "open", "reveal", "zip", "unzip", "bulkrename", "settings", "typedpath", "copytext"]) {
      expect(API_OPERATIONS).toContain(op);
    }
  });
});

describe("the API works end to end", () => {
  test("places, list, new folder, rename, copy, move, trash, restore", async () => {
    mkdirSync(join(home, "Documents"), { recursive: true });
    const places = await api("places");
    expect(places.status).toBe(200);
    expect(places.json).toMatchObject({ ok: true, home, trash: { count: 0 } });
    expect(places.json.places.map((p: any) => p.name)).toContain("Documents");
    expect(places.json.settings.view).toBe("details");

    const made = await api("mkdir", { parent: work, name: "Photos" });
    expect(made.json).toMatchObject({ ok: true, path: join(work, "Photos"), name: "Photos" });
    writeFileSync(join(work, "Photos", "a.txt"), "hello");
    const listed = await api("list", { path: join(work, "Photos") });
    expect(listed.json.entries.map((e: any) => e.name)).toEqual(["a.txt"]);

    const renamed = await api("rename", { path: join(work, "Photos", "a.txt"), name: "b.txt" });
    expect(renamed.json.to).toBe(join(work, "Photos", "b.txt"));

    const copied = await api("copy", { sources: [join(work, "Photos", "b.txt")], dest: work });
    expect(copied.json.results[0]).toMatchObject({ ok: true, value: { status: "done", destination: join(work, "b.txt") } });
    const moved = await api("move", { sources: [join(work, "b.txt")], dest: join(work, "Photos"), policy: "rename" });
    expect(moved.json.results[0].value.destination).toBe(join(work, "Photos", "b (2).txt"));

    const trashed = await api("trash", { paths: [join(work, "Photos")] });
    const id = trashed.json.results[0].value.id;
    expect(existsSync(join(work, "Photos"))).toBe(false);
    expect((await api("trash/list")).json.count).toBe(1);
    const restored = await api("trash/restore", { ids: [id] });
    expect(restored.json.results[0].value.restoredTo).toBe(join(work, "Photos"));
    expect(readFileSync(join(work, "Photos", "b.txt"), "utf8")).toBe("hello");
  });

  test("errors are returned as plain-language messages with a code", async () => {
    const missing = await api("list", { path: join(work, "does-not-exist") });
    expect(missing.status).toBe(400);
    expect(missing.json).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(missing.json.error.message).toContain("doesn't exist");
    const relative = await api("list", { path: "relative/path" });
    expect(relative.json.error.code).toBe("BAD_PATH");
    const noPath = await api("list", {});
    expect(noPath.json.ok).toBe(false);
    const badName = await api("mkdir", { parent: work, name: "a/b" });
    expect(badName.json.error.code).toBe("BAD_NAME");
  });

  test("protected places are refused through the API", async () => {
    if (process.platform === "win32") return;
    const r = await api("trash", { paths: ["/usr"] });
    expect(r.json.results[0]).toMatchObject({ ok: false, code: "PROTECTED" });
    const r2 = await api("mkdir", { parent: "/usr/bin", name: "x" });
    expect(r2.json.error.code).toBe("PROTECTED");
  });

  test("deleting for good needs an explicit confirmation", async () => {
    writeFileSync(join(work, "victim.txt"), "x");
    const without = await api("delete", { paths: [join(work, "victim.txt")] });
    expect(without.status).toBe(409);
    expect(without.json.error.code).toBe("NEEDS_CONFIRM");
    expect(existsSync(join(work, "victim.txt"))).toBe(true);
    const falsy = await api("delete", { paths: [join(work, "victim.txt")], confirm: "yes" });
    expect(falsy.status).toBe(409);
    const confirmed = await api("delete", { paths: [join(work, "victim.txt")], confirm: true });
    expect(confirmed.json.results[0].ok).toBe(true);
    expect(existsSync(join(work, "victim.txt"))).toBe(false);
    const emptyBin = await api("trash/delete", {});
    expect(emptyBin.status).toBe(409);
    expect((await api("trash/delete", { confirm: true })).json.deleted).toBeGreaterThanOrEqual(0);
  });

  test("opening a program asks for confirmation first; ordinary files open and are remembered as recent", async () => {
    writeFileSync(join(work, "setup.exe"), "MZ");
    writeFileSync(join(work, "doc.txt"), "d");
    launched.length = 0;
    const exe = await api("open", { path: join(work, "setup.exe") });
    expect(exe.status).toBe(409);
    expect(exe.json.error.code).toBe("NEEDS_CONFIRM");
    expect(launched.length).toBe(0);
    expect((await api("open", { path: join(work, "doc.txt") })).json.ok).toBe(true);
    expect(launched.length).toBe(1);
    const s = await api("settings");
    expect(s.json.settings.recents[0].path).toBe(join(work, "doc.txt"));
  });

  test("search, preview, properties, zip, unzip, bulk rename, settings and typed paths", async () => {
    mkdirSync(join(work, "S", "inner"), { recursive: true });
    writeFileSync(join(work, "S", "inner", "needle.txt"), "text inside");
    expect((await api("search", { path: work, query: "needle" })).json.entries[0].name).toBe("needle.txt");
    expect((await api("preview", { path: join(work, "S", "inner", "needle.txt") })).json.preview).toMatchObject({ type: "text", text: "text inside" });
    expect((await api("props", { paths: [join(work, "S")] })).json.properties).toMatchObject({ isDir: true, files: 1, size: 11 });
    const zipped = await api("zip", { paths: [join(work, "S")] });
    expect(zipped.json.zipPath).toBe(join(work, "S.zip"));
    const unzipped = await api("unzip", { path: zipped.json.zipPath, dest: work });
    expect(readFileSync(join(unzipped.json.folder, "S", "inner", "needle.txt"), "utf8")).toBe("text inside");
    writeFileSync(join(work, "x1.txt"), "1");
    writeFileSync(join(work, "x2.txt"), "2");
    const plan = await api("bulkrename", { folder: work, names: ["x1.txt", "x2.txt"], spec: { mode: "number", pattern: "y{n}" } });
    expect(plan.json).toMatchObject({ applied: false });
    expect(plan.json.rows.map((r: any) => r.to)).toEqual(["y1.txt", "y2.txt"]);
    await api("bulkrename", { folder: work, names: ["x1.txt", "x2.txt"], spec: { mode: "number", pattern: "y{n}" }, apply: true });
    expect(existsSync(join(work, "y2.txt"))).toBe(true);
    expect((await api("settings", { set: { view: "icons", theme: "dark" } })).json.settings).toMatchObject({ view: "icons", theme: "dark" });
    const typed = await api("typedpath", { text: "~", cwd: work });
    expect(typed.json).toMatchObject({ path: home, exists: true, isDir: true });
    expect((await api("typedpath", { text: "", cwd: work })).json.error.code).toBe("BAD_PATH");
    expect((await api("typedpath", { text: "nope", cwd: work })).json).toMatchObject({ exists: false });
  });

  test("a failing item inside a batch is reported per item", async () => {
    writeFileSync(join(work, "real.txt"), "r");
    const r = await api("trash", { paths: [join(work, "ghost.txt"), join(work, "real.txt")] });
    expect(r.json.results[0]).toMatchObject({ ok: false, code: "ENOENT" });
    expect(r.json.results[1].ok).toBe(true);
  });
});

describe("picture previews (/api/raw)", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const raw = (path: string, token = TOKEN) => fetch(`${base}/api/raw?path=${encodeURIComponent(path)}&token=${token}`);

  test("serves pictures to the page, with a sandbox policy and the right type", async () => {
    writeFileSync(join(work, "dot.png"), png);
    const res = await raw(join(work, "dot.png"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);
  });

  test("needs the token, only serves pictures, and not folders or missing files", async () => {
    writeFileSync(join(work, "dot.png"), png);
    writeFileSync(join(work, "secret.txt"), "secret");
    writeFileSync(join(work, "fake.png.txt"), "x");
    expect((await raw(join(work, "dot.png"), "wrong")).status).toBe(401);
    expect((await fetch(`${base}/api/raw?path=${encodeURIComponent(join(work, "dot.png"))}`)).status).toBe(401);
    for (const p of [join(work, "secret.txt"), join(work, "fake.png.txt"), join(home, "..", "..", "etc", "passwd")]) expect((await raw(p)).status, p).toBe(415);
    mkdirSync(join(work, "folder.png"), { recursive: true });
    expect((await raw(join(work, "folder.png"))).status).toBe(400);
    expect([400, 404, 500]).toContain((await raw(join(work, "missing.png"))).status);
    expect((await raw("relative.png")).status).toBe(400);
  });
});
