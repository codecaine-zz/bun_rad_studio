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

describe("Designer page structure (regression for broken script and hidden dialogs)", () => {
    const html = getIdeHtml();

    test("every inline script is valid JavaScript, as a browser would split the page", () => {
        // A browser ends a script at the first closing script tag, even inside a JS string.
        const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
        expect(scripts.length).toBeGreaterThan(0);
        for (const code of scripts) expect(() => new Function(code)).not.toThrow();
    });

    test("dialogs, context menu and status bar are not nested inside another dialog", () => {
        const body = html.slice(html.indexOf("<body"), html.indexOf("<script>", html.indexOf("<body")));
        const depthAt = (needle: string) => {
            const at = body.indexOf(needle);
            expect(at).toBeGreaterThan(-1);
            let depth = 0;
            for (const m of body.slice(0, at).matchAll(/<div\b|<\/div>/g)) depth += m[0] === "</div>" ? -1 : 1;
            return depth;
        };
        const top = depthAt('id="eventEditorModal"');
        for (const id of ["importModal", "hotkeysModal", "diagnosticsModal", "contextMenu"]) {
            expect(depthAt(`id="${id}"`)).toBe(top);
        }
        const opens = (body.match(/<div\b/g) || []).length;
        const closes = (body.match(/<\/div>/g) || []).length;
        expect(opens).toBe(closes);
    });
});

describe("Designer: importing a JSON layout", () => {
    // Runs the real function from the page, so the test cannot drift from the shipped code.
    const html = getIdeHtml();
    const start = html.indexOf("function normalizeImportedSpec");
    let depth = 0;
    let end = html.indexOf("{", start);
    for (; end < html.length; end++) {
        if (html[end] === "{") depth++;
        else if (html[end] === "}" && --depth === 0) break;
    }
    const normalize = new Function(`${html.slice(start, end + 1)}; return normalizeImportedSpec;`)() as (
        v: unknown,
    ) => { spec?: any; error?: string };

    test("a complete layout is kept as is", () => {
        const input = { title: "T", width: 500, height: 300, controls: [{ id: "b", control_type: "button", x: 1, y: 2, width: 3, height: 4, text: "Hi" }] };
        const { spec, error } = normalize(input);
        expect(error).toBeUndefined();
        expect(spec.controls).toEqual(input.controls);
        expect(spec.width).toBe(500);
    });

    test("missing values are filled in", () => {
        const { spec } = normalize({ title: "Only a title" });
        expect(spec.controls).toEqual([]);
        expect([spec.width, spec.height]).toEqual([840, 560]);
        const filled = normalize({ controls: [{ control_type: "button" }, { control_type: "label", x: "7", width: NaN }] }).spec;
        expect(filled.title).toBe("Imported Form");
        expect(filled.controls[0]).toMatchObject({ id: "button_1", x: 0, y: 0, width: 150, height: 36, text: "" });
        expect(filled.controls[1]).toMatchObject({ x: 0, width: 150 });
    });

    test("duplicate ids are made unique", () => {
        const ids = normalize({ controls: [{ id: "a", control_type: "label" }, { id: "a", control_type: "label" }] }).spec.controls.map((c: any) => c.id);
        expect(new Set(ids).size).toBe(2);
    });

    test("unusable input is rejected with a specific message", () => {
        for (const [input, message] of [
            [null, "one JSON object"],
            [[1, 2], "one JSON object"],
            ["text", "one JSON object"],
            [{ foo: 1 }, "neither"],
            [{ title: "x", controls: "abc" }, "list of controls"],
            [{ controls: [{ text: "no type" }] }, "Control #1"],
            [{ controls: [null] }, "Control #1"],
        ] as Array<[unknown, string]>) {
            const result = normalize(input);
            expect(result.spec).toBeUndefined();
            expect(result.error).toContain(message);
        }
    });

    test("the open form is only replaced after validation succeeds", () => {
        const fn = html.slice(html.indexOf("function processImportJSON"), html.indexOf("// MS Access Database CRUD Form Wizard"));
        expect(fn.indexOf("normalizeImportedSpec(parsed)")).toBeGreaterThan(-1);
        expect(fn.indexOf("formSpec = ")).toBeGreaterThan(fn.indexOf("normalizeImportedSpec(parsed)"));
    });
});

describe("Designer themes: readable button text (D-019)", () => {
    const html = getIdeHtml();
    const grab = (name: string) => {
        const start = html.indexOf(`function ${name}(`);
        expect(start).toBeGreaterThan(-1);
        let depth = 0;
        let end = html.indexOf("{", start);
        for (; end < html.length; end++) {
            if (html[end] === "{") depth++;
            else if (html[end] === "}" && --depth === 0) break;
        }
        return html.slice(start, end + 1);
    };
    const api = new Function(`${grab("contrastRatio")}; ${grab("getRawThemeColors")}; ${grab("getThemeColors")}; return { contrastRatio, getThemeColors, getRawThemeColors };`)() as {
        contrastRatio: (a: string, b: string) => number;
        getThemeColors: (t: string) => Record<string, string>;
        getRawThemeColors: (t: string) => Record<string, string>;
    };
    const themes = [...html.match(/id="propFormTheme"[\s\S]*?<\/select>/)![0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]!);

    test("the theme list is found", () => {
        expect(themes.length).toBeGreaterThan(40);
    });

    test("contrastRatio matches known values", () => {
        expect(api.contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
        expect(api.contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    });

    test("every theme's button text reaches 4.5:1 on the button fill", () => {
        const failing = themes.filter((t) => {
            const c = api.getThemeColors(t);
            return api.contrastRatio(c.btnFg!, c.btnBg!) < 4.5;
        });
        expect(failing).toEqual([]);
    });

    test("a theme whose own button text already reads well keeps it", () => {
        for (const t of themes) {
            const raw = api.getRawThemeColors(t);
            if (api.contrastRatio(raw.btnFg!, raw.btnBg!) >= 4.5) expect(api.getThemeColors(t).btnFg).toBe(raw.btnFg);
        }
    });

    test("only the button text colour is adjusted", () => {
        for (const t of themes) {
            const { btnFg: _a, ...raw } = api.getRawThemeColors(t);
            const { btnFg: _b, ...adjusted } = api.getThemeColors(t);
            expect(adjusted).toEqual(raw);
        }
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
