import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startCodeStudioServer, isInsideWorkspace } from "../applications/code_studio.ts";

describe("Code Studio: local-only protection", () => {
  let base: string;
  let workspace: string;
  let sibling: string;
  let server: ReturnType<typeof startCodeStudioServer>;
  let parent: string;

  beforeAll(() => {
    parent = mkdtempSync(join(tmpdir(), "code-studio-sec-"));
    workspace = join(parent, "ws");
    // Shares the workspace's name as a prefix, which defeats a plain startsWith() check.
    sibling = join(parent, "ws-evil");
    mkdirSync(workspace);
    mkdirSync(sibling);
    writeFileSync(join(workspace, "hello.txt"), "hi");
    writeFileSync(join(sibling, "secret.txt"), "secret");
    server = startCodeStudioServer({ port: 0, host: "127.0.0.1", workspaceRoot: workspace });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
    rmSync(parent, { recursive: true, force: true });
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", ...headers },
      body: JSON.stringify(body),
    });

  test("a command from a web page on another origin is refused and not run", async () => {
    const marker = join(workspace, "pwned.txt");
    const res = await post("/api/exec", { command: `echo x > "${marker}"` }, { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(existsSync(marker)).toBe(false);
  });

  test("a request with a non-loopback Host header (DNS rebinding) is refused", async () => {
    const res = await post("/api/exec", { command: "echo hi" }, { Host: "attacker.example" });
    expect(res.status).toBe(403);
  });

  test("file reads and saves from another origin are refused", async () => {
    const read = await post("/api/fs/read", { path: "hello.txt" }, { Origin: "https://evil.example" });
    expect(read.status).toBe(403);
    const save = await post("/api/fs/save", { path: "hello.txt", content: "changed" }, { Origin: "https://evil.example" });
    expect(save.status).toBe(403);
    expect(readFileSync(join(workspace, "hello.txt"), "utf8")).toBe("hi");
  });

  test("the studio's own page (same origin, or no Origin header) still works", async () => {
    const res = await post("/api/exec", { command: "echo ok" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).stdout.trim()).toBe("ok");

    const sameOrigin = await post("/api/fs/read", { path: "hello.txt" }, { Origin: base });
    expect(sameOrigin.status).toBe(200);
    expect(((await sameOrigin.json()) as any).content).toBe("hi");
  });

  test("paths cannot escape the workspace, including a sibling folder sharing its name prefix", async () => {
    for (const path of ["../ws-evil/secret.txt", "../../etc/hosts", join(sibling, "secret.txt")]) {
      const res = await post("/api/fs/read", { path });
      expect(res.status).toBe(403);
    }
    const write = await post("/api/fs/save", { path: "../ws-evil/new.txt", content: "x" });
    expect(write.status).toBe(403);
    expect(existsSync(join(sibling, "new.txt"))).toBe(false);

    const del = await post("/api/fs/delete", { path: "../ws-evil/secret.txt" });
    expect(del.status).toBe(403);
    expect(existsSync(join(sibling, "secret.txt"))).toBe(true);

    const rename = await post("/api/fs/rename", { oldPath: "hello.txt", newPath: "../ws-evil/moved.txt" });
    expect(rename.status).toBe(403);
    expect(existsSync(join(workspace, "hello.txt"))).toBe(true);
  });

  test("deleting removes a non-empty folder inside the workspace, and never the workspace itself", async () => {
    mkdirSync(join(workspace, "tmpdir/sub"), { recursive: true });
    writeFileSync(join(workspace, "tmpdir/sub/f.txt"), "x");
    const ok = await post("/api/fs/delete", { path: "tmpdir" });
    expect(ok.status).toBe(200);
    expect(existsSync(join(workspace, "tmpdir"))).toBe(false);
    const root = await post("/api/fs/delete", { path: "." });
    expect(root.status).toBe(403);
    expect(existsSync(workspace)).toBe(true);
  });

  test("isInsideWorkspace", () => {
    expect(isInsideWorkspace("/a/ws", "/a/ws")).toBe(true);
    expect(isInsideWorkspace("/a/ws", "/a/ws/sub/file.txt")).toBe(true);
    expect(isInsideWorkspace("/a/ws", "/a/ws/..foo")).toBe(true);
    expect(isInsideWorkspace("/a/ws", "/a/ws-evil/file.txt")).toBe(false);
    expect(isInsideWorkspace("/a/ws", "/a/other")).toBe(false);
    expect(isInsideWorkspace("/a/ws", "/a")).toBe(false);
  });
});
