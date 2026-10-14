import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ABOUT_LINKS } from "../src/features/filemanager/fmAboutOps";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const TOKEN = "about-token";
let root: string;
let server: ReturnType<typeof startFileManagerServer>;
const launched: Array<{ command: string; args: string[] }> = [];

const post = (op: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${server.port}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify(body) });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "fm-about-"));
  server = startFileManagerServer({ port: 0, token: TOKEN, context: { home: root, dataDir: join(root, "data"), launch: async (command, args) => void launched.push({ command, args }) } });
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("About links", () => {
  test("the project and the author's GitHub pages are listed, all over https", () => {
    const urls = ABOUT_LINKS.map((l) => l.url);
    expect(urls).toContain("https://github.com/codecaine-zz/bun_rad_studio");
    expect(urls).toContain("https://github.com/codecaine-zz");
    expect(urls).toContain("https://codefreelance.net/apps/markdown_tutorials/");
    for (const u of urls) expect(u.startsWith("https://")).toBe(true);
    expect(new Set(ABOUT_LINKS.map((l) => l.id)).size).toBe(ABOUT_LINKS.length);
  });

  test("about/info lists them and about/open starts the browser with the fixed address", async () => {
    const info = (await (await post("about/info")).json()) as { links: Array<{ id: string }> };
    expect(info.links.map((l) => l.id)).toContain("project");
    const res = await post("about/open", { id: "project" });
    expect(res.status).toBe(200);
    expect(launched.at(-1)!.args).toContain("https://github.com/codecaine-zz/bun_rad_studio");
    expect((await post("about/open", { id: "tutorials" })).status).toBe(200);
    expect(launched.at(-1)!.args).toContain("https://codefreelance.net/apps/markdown_tutorials/");
  });

  test("an unknown id, or an address sent instead of an id, opens nothing", async () => {
    const before = launched.length;
    expect((await post("about/open", { id: "https://evil.example" })).status).toBe(400);
    expect((await post("about/open", { id: "nope", url: "https://evil.example" })).status).toBe(400);
    expect(launched.length).toBe(before);
  });

  test("the token is required", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/about/open`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "project" }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
