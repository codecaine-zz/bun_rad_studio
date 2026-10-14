import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { buildShowcase } from "../scripts/build_showcase";

const ROOT = join(import.meta.dir, "..");

describe("SHOWCASE.md, the picture-led page for promoting the applications", () => {
  const text = readFileSync(join(ROOT, "SHOWCASE.md"), "utf8");

  test("is exactly what `bun run showcase` makes from the screenshots and the launcher's descriptions", () => {
    expect(text).toBe(buildShowcase());
  });

  test("every picture it shows exists, and every application heading has one", () => {
    const images = [...new Set([...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]!))];
    expect(images.length).toBeGreaterThan(60);
    for (const image of images) expect(existsSync(join(ROOT, image)), image).toBe(true);
    const headings = text.match(/^### /gm)?.length ?? 0;
    // The File Manager's four pictures are also shown in its featured block; each application heading has its own picture.
    const featured = images.filter((i) => /file_manager_studio_(convert|terminal|responsive)\.png$/.test(i)).length;
    expect(images.length - featured).toBe(headings);
  });

  test("shows each distinct application window once, so a screenshot added later cannot be silently left out", () => {
    const shown = new Set([...text.matchAll(/\(screenshots\/apps\/([a-z0-9_]+)_desktop\.png\)/g)].map((m) => m[1]!));
    // Pictures that are not an application's window, or are another name for a window shown under its preferred name.
    const notApps = new Set(["calculator_intuitionlab", "codefreelance_theme", "context_menu_studio", "database_studio", "json_studio", "watcher_studio"]);
    const present = readdirSync(join(ROOT, "screenshots", "apps")).filter((f) => f.endsWith("_desktop.png")).map((f) => f.replace("_desktop.png", ""));
    const missing = present.filter((n) => !shown.has(n) && !notApps.has(n));
    expect(missing).toEqual([]);
  });

  test("gives every application a name, a description, a way to start it and nothing broken", () => {
    const sections = text.split(/^### /m).slice(1);
    for (const s of sections) {
      const title = s.split("\n")[0]!;
      expect(s.includes("`bun run "), `${title} has no start command`).toBe(true);
      expect(s.split("\n").filter((l) => l.trim() && !l.startsWith("![") && !l.startsWith("`") && l !== title).length, `${title} has no description`).toBeGreaterThan(0);
    }
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
  });
});
