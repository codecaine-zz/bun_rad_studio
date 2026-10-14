import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { OS_THEMES } from "../src/shared/osThemes";
import { FX_THEMES } from "../src/shared/fxThemes";
import { apply, applyFx, buildBlock, buildFxBlock, FX_STATE_SHOTS } from "../scripts/build_os_theme_docs";

const root = join(import.meta.dir, "..");

describe("docs/THEMES.md new themes block", () => {
    test("equals what the generator writes from the theme data", () => {
        const doc = readFileSync(join(root, "docs", "THEMES.md"), "utf8");
        expect(apply(doc, buildBlock())).toBe(doc);
    });

    test("every new theme has a screenshot", () => {
        for (const key of Object.keys(OS_THEMES)) expect(existsSync(join(root, "screenshots", "themes", `${key}.png`)), key).toBe(true);
    });
});

describe("docs/THEMES.md futuristic themes block", () => {
    test("equals what the generator writes from the theme data", () => {
        const doc = readFileSync(join(root, "docs", "THEMES.md"), "utf8");
        expect(applyFx(apply(doc, buildBlock()), buildFxBlock())).toBe(doc);
    });

    test("every futuristic theme is in the gallery and has a screenshot", () => {
        const doc = readFileSync(join(root, "docs", "THEMES.md"), "utf8");
        for (const key of Object.keys(FX_THEMES)) {
            expect(existsSync(join(root, "screenshots", "themes", `${key}.png`)), key).toBe(true);
            expect(doc, key).toContain(`<a id="theme-${key}"></a>`);
        }
        expect(doc).toContain("(133 Themes)");
    });

    test("the interaction-state captures exist", () => {
        for (const key of FX_STATE_SHOTS) expect(existsSync(join(root, "screenshots", "themes", "fx", `${key}_states.png`)), key).toBe(true);
    });
});
