import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isBinaryPath, startCodeStudioServer } from "../applications/code_studio.ts";

describe("Code Studio workspace search", () => {
  const root = mkdtempSync(join(tmpdir(), "code-studio-search-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "const x = 'needle in text';\n");
  writeFileSync(join(root, "notes.log"), "another needle\n");
  // Binary types that happen to contain the word must not be read or returned.
  writeFileSync(join(root, "shot.png"), "needle hidden in a png");
  writeFileSync(join(root, "data.sqlite-shm"), "needle in shared memory");
  writeFileSync(join(root, "UPPER.PNG"), "needle in an upper-case extension");
  const server = startCodeStudioServer({ port: 0, host: "127.0.0.1", workspaceRoot: root }) as any;
  const base = `http://127.0.0.1:${server.port}`;
  afterAll(() => {
    server.stop(true);
    rmSync(root, { recursive: true, force: true });
  });

  const search = async (body: object) => (await (await fetch(`${base}/api/fs/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()) as any;

  test("finds text in source and unknown text-like files, and skips known binary types", async () => {
    const data = await search({ query: "needle" });
    expect(data.success).toBe(true);
    expect(data.results.map((r: any) => r.path).sort()).toEqual(["notes.log", join("src", "a.ts")]);
    expect(data.totalMatches).toBe(2);
  });

  test("isBinaryPath is case-insensitive and does not mistake text files", () => {
    for (const p of ["a/b.png", "x.PNG", "data.sqlite-shm", "lib.dylib", "movie.MP4"]) expect(isBinaryPath(p)).toBe(true);
    for (const p of ["a.ts", "README.md", "noextension", "png", "archive.png.txt", "a.log"]) expect(isBinaryPath(p)).toBe(false);
  });
});
