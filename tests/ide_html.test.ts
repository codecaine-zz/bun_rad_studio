import { describe, test, expect, afterAll } from "bun:test";
import { join } from "path";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { JSDOM } from "jsdom";
import { getIdeHtml, exportProjectHelper, runPreviewHelper, tsStringLiteral, safeDimension } from "../index.ts";

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

describe("Designer: importing a layout that contains scripts", () => {
    const html = getIdeHtml();
    const start = html.indexOf("function countImportedScripts");
    let depth = 0;
    let end = html.indexOf("{", start);
    for (; end < html.length; end++) {
        if (html[end] === "{") depth++;
        else if (html[end] === "}" && --depth === 0) break;
    }
    const count = new Function(`${html.slice(start, end + 1)}; return countImportedScripts;`)() as (spec: any) => number;

    test("plain function names are not scripts", () => {
        expect(count({ controls: [{ id: "a", event_handlers: { onClick: "doIt", onChange: " other_1 " } }] })).toBe(0);
        expect(count({ controls: [] })).toBe(0);
        expect(count({})).toBe(0);
    });

    test("code in event_handlers and in onXxx fields is counted", () => {
        const spec = {
            controls: [
                { id: "a", event_handlers: { onClick: "alert(1)", onHover: "doIt" } },
                { id: "b", onclick: "fetch('/x')", onChange: "go" },
                { id: "c", text: "onfoo not a handler", event_handlers: { onFocus: "  " } },
            ],
        };
        expect(count(spec)).toBe(2);
    });

    test("the import asks before replacing the form, and only after validation", () => {
        const fn = html.slice(html.indexOf("function processImportJSON"), html.indexOf("// MS Access Database CRUD Form Wizard"));
        expect(fn).toContain("confirm(");
        expect(fn.indexOf("normalizeImportedSpec(parsed)")).toBeLessThan(fn.indexOf("confirm("));
        expect(fn.indexOf("confirm(")).toBeLessThan(fn.indexOf("formSpec = "));
    });
});

describe("Designer: keyboard access", () => {
    const html = getIdeHtml();

    test("a visible focus outline is defined for keyboard focus", () => {
        const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
        expect(css).toMatch(/button:focus-visible[\s\S]*?outline:\s*2px solid var\(--accent\) !important/);
    });

    function setup() {
        const start = html.indexOf("function makeClickablesKeyboardOperable");
        let depth = 0;
        let end = html.indexOf("{", start);
        for (; end < html.length; end++) {
            if (html[end] === "{") depth++;
            else if (html[end] === "}" && --depth === 0) break;
        }
        const body = html.slice(html.indexOf("<body"), html.indexOf("<script>", html.indexOf("<body")));
        const dom = new JSDOM(`<!DOCTYPE html>${body}</body>`);
        const fn = new Function("document", `${html.slice(start, end + 1)}; return makeClickablesKeyboardOperable;`)(dom.window.document) as () => void;
        return { dom, run: fn };
    }

    test("every clickable non-button element becomes focusable, is announced as a button and has a name", () => {
        const { dom, run } = setup();
        const doc = dom.window.document;
        const targets = [...doc.querySelectorAll("[onclick]")].filter((e) => !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName));
        expect(targets.length).toBeGreaterThan(100);
        run();
        for (const el of targets) {
            expect(el.getAttribute("tabindex")).toBe("0");
            expect(el.getAttribute("role")).toBe("button");
            expect((el.getAttribute("aria-label") ?? "").length).toBeGreaterThan(0);
        }
    });

    test("real buttons are left alone, and existing tabindex or role values are kept", () => {
        const { dom, run } = setup();
        const doc = dom.window.document;
        const native = doc.querySelector("button[onclick]")!;
        const custom = doc.createElement("div");
        custom.setAttribute("onclick", "x()");
        custom.setAttribute("tabindex", "-1");
        custom.setAttribute("role", "menuitem");
        doc.body.appendChild(custom);
        run();
        expect(native.hasAttribute("role")).toBe(false);
        expect(custom.getAttribute("tabindex")).toBe("-1");
        expect(custom.getAttribute("role")).toBe("menuitem");
    });

    test("Enter and Space activate the element; other keys do not", () => {
        const { dom, run } = setup();
        const doc = dom.window.document;
        const el = doc.createElement("div");
        el.setAttribute("onclick", "x()");
        el.textContent = "Do it";
        doc.body.appendChild(el);
        run();
        let clicks = 0;
        el.addEventListener("click", () => clicks++);
        const press = (key: string) => el.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        press("Enter");
        press(" ");
        press("a");
        press("Tab");
        expect(clicks).toBe(2);
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
        (globalThis as any).__evals = [];
        mod.setTimelineSteps("t1", "One, Two, Three");
        mod.setBreadcrumbs("b1", "Home, Docs, Page");
        mod.setTreeNodes("tree1", "Root, Child");
        mod.setAvatarGroup("av1", "AB, CD, +3");
        expect((globalThis as any).__evals.length).toBe(4);
        for (const code of (globalThis as any).__evals) {
            expect(() => new Function(code)).not.toThrow();
        }
    });
});

describe("Exported project: a crafted layout cannot inject code", () => {
    const dirs: string[] = [];
    afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

    test("tsStringLiteral and safeDimension", () => {
        for (const text of ['plain', 'a"b', "a\\", "line\nbreak", "\u2028", "</script>", '"; evil(); //']) {
            expect(eval(tsStringLiteral(text))).toBe(text);
        }
        expect(tsStringLiteral(undefined)).toBe('""');
        expect(safeDimension(640, 800)).toBe(640);
        expect(safeDimension("640", 800)).toBe(640);
        for (const bad of ["400, x: 1", NaN, -5, 0, Infinity, null, undefined, {}, 1e9]) expect(safeDimension(bad, 800)).toBe(800);
    });

    const attacks: Record<string, any> = {
        title: { title: 'x"; globalThis.PWNED_TITLE = 1; //' },
        titleBackslash: { title: "x\\" },
        titleNewline: { title: "a\nglobalThis.PWNED_NL = 1;\n//" },
        width: { width: "400, hint: 0 }; globalThis.PWNED_WIDTH = 1; //" },
        height: { height: "300 }; globalThis.PWNED_HEIGHT = 1; //" },
        controlId: { controls: [{ id: 'a"+(globalThis.PWNED_ID=1)+"', control_type: "button", text: "b", event_handlers: { onClick: "doIt" } }] },
        eventName: { controls: [{ id: "a", control_type: "button", text: "b", event_handlers: { 'onClick"+(globalThis.PWNED_EVT=1)+"': "doIt" } }] },
    };

    for (const [name, patch] of Object.entries(attacks)) {
        test(`${name}: the exported app only treats it as data`, async () => {
            const dir = mkdtempSync(join(tmpdir(), "rad-inject-"));
            dirs.push(dir);
            const spec = { title: "T", width: 400, height: 300, background_color: "#fff", font_color: "#000", padding: 10, spacing: 5, controls: [], ...patch };
            expect(exportProjectHelper(JSON.stringify(spec), dir).success).toBe(true);
            const fakeDir = join(dir, "node_modules", "webview-bun");
            Bun.spawnSync(["mkdir", "-p", fakeDir]);
            await Bun.write(join(fakeDir, "package.json"), JSON.stringify({ name: "webview-bun", main: "index.js" }));
            await Bun.write(
                join(fakeDir, "index.js"),
                `export const SizeHint = { NONE: 0 };
export class Webview {
  constructor() { globalThis.__wv = this; this.binds = {}; }
  setHTML() {} run() {} destroy() {} eval() {} navigate() {} init() {}
  bind(name, fn) { this.binds[name] = fn; }
}`,
            );
            const script = `await import(${JSON.stringify(join(dir, "index.ts"))});
if (globalThis.__wv.binds.doIt) globalThis.__wv.binds.doIt("x");
console.log(JSON.stringify({ title: globalThis.__wv.title, size: globalThis.__wv.size, pwned: Object.keys(globalThis).filter((k) => k.startsWith("PWNED")) }));`;
            const r = Bun.spawnSync(["bun", "-e", script], { cwd: dir, stdout: "pipe", stderr: "pipe" });
            const line = r.stdout.toString().split("\n").find((l) => l.startsWith("{"));
            expect(line, r.stdout.toString() + r.stderr.toString()).toBeDefined();
            const seen = JSON.parse(line!);
            expect(seen.pwned).toEqual([]);
            if ("title" in patch) expect(seen.title).toBe(patch.title);
            if ("width" in patch) expect(seen.size.width).toBe(800);
            if ("height" in patch) expect(seen.size.height).toBe(600);
        });
    }
});

describe("Export keeps the user's edits", () => {
    const dirs: string[] = [];
    afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
    const spec = (title: string) => JSON.stringify({ title, width: 400, height: 300, background_color: "#fff", font_color: "#000", padding: 10, spacing: 5, controls: [] });
    const fresh = () => {
        const d = mkdtempSync(join(tmpdir(), "rad-backup-"));
        dirs.push(d);
        return d;
    };

    test("a first export creates no backups", () => {
        const dir = fresh();
        const r = exportProjectHelper(spec("A"), dir);
        expect(r.success).toBe(true);
        expect(r.backups).toEqual([]);
        expect(readdirSync(dir).sort()).toEqual(["index.html", "index.ts", "package.json"]);
    });

    test("exporting the same layout again changes nothing and creates no backups", () => {
        const dir = fresh();
        exportProjectHelper(spec("A"), dir);
        const r = exportProjectHelper(spec("A"), dir);
        expect(r.backups).toEqual([]);
        expect(readdirSync(dir).length).toBe(3);
    });

    test("a file the user edited is kept as a backup before it is replaced", () => {
        const dir = fresh();
        exportProjectHelper(spec("A"), dir);
        writeFileSync(join(dir, "index.ts"), "// my own handler code\n");
        const r = exportProjectHelper(spec("A"), dir);
        expect(r.success).toBe(true);
        expect(r.backups!.length).toBe(1);
        expect(readFileSync(r.backups![0]!, "utf-8")).toBe("// my own handler code\n");
        expect(readFileSync(join(dir, "index.ts"), "utf-8")).toContain("webview-bun");
    });

    test("a changed layout keeps the previous generated files too", () => {
        const dir = fresh();
        exportProjectHelper(spec("First"), dir);
        const r = exportProjectHelper(spec("Second"), dir);
        expect(r.backups!.length).toBeGreaterThanOrEqual(2);
        expect(readFileSync(join(dir, "index.html"), "utf-8")).toContain("Second");
    });
});

describe("Run: the live preview script", () => {
    const dirs: string[] = [];
    afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
    const make = (patch: object = {}) => {
        const cwd = mkdtempSync(join(tmpdir(), "rad-preview-"));
        dirs.push(cwd);
        const spec = { title: "Preview me", width: 420, height: 310, background_color: "#fff", font_color: "#000", padding: 10, spacing: 5, controls: [], ...patch };
        const result = runPreviewHelper(JSON.stringify(spec), { cwd, start: false });
        return { cwd, result };
    };

    test("writes preview.html and preview.ts into .rad_preview of the given folder", () => {
        const { cwd, result } = make();
        expect(result.success).toBe(true);
        expect(readdirSync(join(cwd, ".rad_preview")).sort()).toEqual(["preview.html", "preview.ts"]);
        expect(readFileSync(join(cwd, ".rad_preview", "preview.ts"), "utf-8")).toContain("Preview me - Live Preview");
    });

    test("the script is valid TypeScript, also for hostile titles and sizes", () => {
        for (const patch of [{}, { title: 'x"; globalThis.PWNED = 1; //' }, { title: "x\\" }, { title: "a\nb" }, { width: "1, y: 2 }; evil(); //", height: "5)" }]) {
            const { cwd, result } = make(patch);
            expect(result.success).toBe(true);
            const src = readFileSync(join(cwd, ".rad_preview", "preview.ts"), "utf-8");
            expect(() => new Bun.Transpiler({ loader: "ts" }).transformSync(src)).not.toThrow();
            expect(src).not.toContain("evil()\n");
        }
    });

    test("invalid JSON is reported, not thrown", () => {
        const cwd = mkdtempSync(join(tmpdir(), "rad-preview-"));
        dirs.push(cwd);
        const result = runPreviewHelper("{ nope", { cwd, start: false });
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
    });

    test("a real preview process starts and stays up (no window is shown by the test runner's fake)", async () => {
        const { cwd } = make({ title: "Real start" });
        const dir = join(cwd, ".rad_preview");
        // Same script, but with a stand-in webview so the test needs no window system.
        const fake = join(dir, "node_modules", "webview-bun");
        Bun.spawnSync(["mkdir", "-p", fake]);
        await Bun.write(join(fake, "package.json"), JSON.stringify({ name: "webview-bun", main: "index.js" }));
        await Bun.write(join(fake, "index.js"), `export const SizeHint = { NONE: 0 };
export class Webview { setHTML() {} bind() {} eval() {} init() {} navigate() {} destroy() {} run() { console.log("RUNNING:" + this.title + ":" + this.size.width + "x" + this.size.height); } }`);
        const r = Bun.spawnSync(["bun", "run", join(dir, "preview.ts")], { cwd, stdout: "pipe", stderr: "pipe" });
        expect(r.stdout.toString() + r.stderr.toString()).toContain("RUNNING:Real start - Live Preview:420x310");
    });
});

describe("Generated output is not tracked by git", () => {
    test("the preview and export folders are ignored, and no file in them is tracked", () => {
        const tracked = Bun.spawnSync(["git", "ls-files", ".rad_preview", "exported_project"], { cwd: REPO_ROOT, stdout: "pipe" }).stdout.toString().trim();
        expect(tracked).toBe("");
        for (const path of [".rad_preview/preview.ts", "exported_project/index.ts"]) {
            const r = Bun.spawnSync(["git", "check-ignore", "-q", path], { cwd: REPO_ROOT });
            expect(r.exitCode, `${path} must be in .gitignore`).toBe(0);
        }
    });
});
