import { describe, test, expect, afterAll } from "bun:test";
import { join } from "path";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { getIdeHtml, exportProjectHelper } from "../index.ts";

const REPO_ROOT = join(import.meta.dir, "..");

describe("Designer page loading (regression for D-001)", () => {
    test("getIdeHtml returns the real designer page, not the fallback stub", () => {
        const html = getIdeHtml();
        expect(html.length).toBeGreaterThan(100_000);
        expect(html).toContain("let formSpec =");
    });

    test("the __SPEC_JSON__ placeholder is replaced with a default form spec", () => {
        const html = getIdeHtml();
        expect(html).not.toContain("__SPEC_JSON__");
        const match = html.match(/let formSpec = (\{.*\});/);
        expect(match).not.toBeNull();
        const spec = JSON.parse(match![1]!);
        expect(spec.title).toBe("Form1");
        expect(Array.isArray(spec.controls)).toBe(true);
    });

    test("works when started from a different working directory", () => {
        const script = `import { getIdeHtml } from ${JSON.stringify(join(REPO_ROOT, "index.ts"))};
const h = getIdeHtml();
console.log(h.includes("let formSpec =") && h.length > 100000 ? "OK" : "FALLBACK");`;
        const result = Bun.spawnSync(["bun", "-e", script], { cwd: "/tmp" });
        expect(result.stderr.toString()).toBe("");
        expect(result.stdout.toString().trim()).toBe("OK");
    });
});

describe("Exported project (regression for nested template literals)", () => {
    const dirs: string[] = [];
    afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

    const spec = JSON.stringify({
        title: "Export check",
        width: 400,
        height: 300,
        background_color: "#ffffff",
        font_color: "#000000",
        padding: 10,
        spacing: 5,
        controls: [
            { id: "b1", control_type: "button", x: 10, y: 10, width: 100, height: 30, text: "Hi", event_handlers: { onClick: "doHi" } },
        ],
    });

    function exportToTemp() {
        const dir = mkdtempSync(join(tmpdir(), "rad-export-"));
        dirs.push(dir);
        const result = exportProjectHelper(spec, dir);
        expect(result.success).toBe(true);
        return dir;
    }

    test("writes index.html, index.ts and package.json", () => {
        const dir = exportToTemp();
        for (const f of ["index.html", "index.ts", "package.json"]) {
            expect(readFileSync(join(dir, f), "utf-8").length).toBeGreaterThan(0);
        }
    });

    test("exported index.ts is syntactically valid TypeScript", () => {
        const dir = exportToTemp();
        const source = readFileSync(join(dir, "index.ts"), "utf-8");
        expect(() => new Bun.Transpiler({ loader: "ts" }).transformSync(source)).not.toThrow();
    });

    test("exported helpers send syntactically valid JavaScript to the page", async () => {
        const dir = exportToTemp();
        // Stand-in for the native webview so the generated app can run headlessly.
        const fakeDir = join(dir, "node_modules", "webview-bun");
        Bun.spawnSync(["mkdir", "-p", fakeDir]);
        await Bun.write(join(fakeDir, "package.json"), JSON.stringify({ name: "webview-bun", main: "index.js" }));
        await Bun.write(
            join(fakeDir, "index.js"),
            `export const SizeHint = { NONE: 0 };
export class Webview {
  constructor() { (globalThis.__evals = globalThis.__evals || []); }
  setHTML() {} bind() {} run() {} destroy() {} navigate() {} init() {}
  eval(code) { globalThis.__evals.push(code); }
}`,
        );
        const mod = await import(join(dir, "index.ts"));
        globalThis.__evals = [];
        mod.setTimelineSteps("t1", "One, Two, Three");
        mod.setBreadcrumbs("b1", "Home, Docs, Page");
        mod.setTreeNodes("tree1", "Root, Child");
        mod.setAvatarGroup("av1", "AB, CD, +3");
        expect(globalThis.__evals.length).toBe(4);
        for (const code of globalThis.__evals) {
            expect(() => new Function(code)).not.toThrow();
        }
    });
});
