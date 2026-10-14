import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { OS_THEMES } from "../src/shared/osThemes";
import { apply, buildBlock } from "../scripts/build_os_theme_docs";

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
