import { describe, it, expect } from "bun:test";
import { checkDocs, findCommandProblems, findSecrets, parseMarkdown, slugify } from "../scripts/docs/check_docs";
import { renderAll } from "../scripts/docs/build_docs";
import { readFileSync } from "fs";
import { join } from "path";

describe("documentation checker", () => {
  it("slugifies headings like GitHub (emoji-led headings keep a leading hyphen)", () => {
    expect(slugify("Step 3: Install the packages")).toBe("step-3-install-the-packages");
    expect(slugify("Import/export versus backup/restore")).toBe("importexport-versus-backuprestore");
    expect(slugify("💻 How to Use Any Theme")).toBe("-how-to-use-any-theme");
    expect(slugify("Compiling (`.app`) with Icons")).toBe("compiling-app-with-icons");
  });

  it("finds links outside code, ignores fenced and inline code, and detects unclosed fences", () => {
    const p = parseMarkdown("# T\n\n[a](x.md) `[no](y.md)`\n\n```\n[no](z.md)\n```\n\n## Next\n```bash\nopen\n");
    expect(p.links.map((l) => l.target)).toEqual(["x.md"]);
    expect(p.fenceProblems.length).toBe(1);
    expect([...p.anchors]).toEqual(["t", "next"]);
  });

  it("flags bun run commands whose script or file does not exist", () => {
    const scripts = new Set(["docs:build", "app:calc"]);
    const exists = (p: string) => p === "applications/pong_studio.ts";
    const check = (line: string) => findCommandProblems([line], scripts, exists).map((c) => c.what);
    expect(check("Run `bun run docs:build` first")).toEqual([]);
    expect(check("`bun run app:calc`, then `bun run nosuch`")).toEqual(["no such script in package.json"]);
    expect(check("bun run docs:biuld")).toEqual(["no such script in package.json"]);
    expect(check("bun run applications/pong_studio.ts --server")).toEqual([]);
    expect(check("bun run ./applications/pong_studio.ts")).toEqual([]);
    expect(check("bun run applications/gone_studio.ts")).toEqual(["file does not exist"]);
    // placeholders and built-ins are fine
    expect(check("bun run <name>, bun run app:, bun run app.ts, bun run start, bun run build")).toEqual([]);
  });

  it("flags secrets but not placeholders, code identifiers or documented examples", () => {
    const hit = (s: string) => findSecrets([s]).length > 0;
    expect(hit("password = 'Tr0ub4dor&3xyz'")).toBe(true);
    expect(hit("postgres://app:realsecret99@db.example.com/x")).toBe(true);
    expect(hit("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
    expect(hit("ghp_abcdefghijklmnopqrstuvwxyz0123456789")).toBe(true);
    expect(hit("MSQL_PASSWORD=your-password")).toBe(false);
    expect(hit("mysql://user:your-password@localhost:3306")).toBe(false);
    expect(hit("const token = cryptoutils.randomToken(32);")).toBe(false);
    expect(hit("password: <your password>")).toBe(false);
  });

  it("the real documentation has no broken links/anchors, orphans, unclosed fences or secrets", async () => {
    const { issues } = await checkDocs();
    expect(issues.filter((i) => i.severity === "error").map((i) => `${i.file}:${i.line} ${i.message}`)).toEqual([]);
  });

  it("generated pages (table of contents, indexes, coverage matrix) are up to date", async () => {
    const out = await renderAll();
    for (const [rel, text] of Object.entries(out)) {
      expect(readFileSync(join(import.meta.dir, "..", rel), "utf8"), `${rel} is stale: run bun run docs:build`).toBe(text);
    }
  });
});
