import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { findStudioResources } from "../src/studio_resources";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function tree() {
  const root = mkdtempSync(join(tmpdir(), "studio-res-"));
  dirs.push(root);
  mkdirSync(join(root, "applications"), { recursive: true });
  return root;
}
function addPage(base: string, name: string) {
  mkdirSync(join(base, "resources", name), { recursive: true });
  writeFileSync(join(base, "resources", name, "index.html"), "<p>x</p>");
}

describe("findStudioResources", () => {
  test("finds the resources next to the studio even when the working directory is somewhere else", () => {
    const root = tree();
    addPage(root, "frogger_studio");
    const elsewhere = tree();
    expect(findStudioResources("frogger_studio", join(root, "applications"), elsewhere)).toBe(join(root, "resources", "frogger_studio"));
  });

  test("still finds resources in the working directory when none sit next to the studio (previous behaviour)", () => {
    const studioRoot = tree();
    const cwd = tree();
    addPage(cwd, "snake_studio");
    expect(findStudioResources("snake_studio", join(studioRoot, "applications"), cwd)).toBe(join(cwd, "resources", "snake_studio"));
  });

  test("prefers the studio's own copy when both exist", () => {
    const root = tree();
    const cwd = tree();
    addPage(root, "tetris_studio");
    addPage(cwd, "tetris_studio");
    expect(findStudioResources("tetris_studio", join(root, "applications"), cwd)).toBe(join(root, "resources", "tetris_studio"));
  });

  test("when nothing exists it returns the studio-relative path so the error message names it", () => {
    const root = tree();
    expect(findStudioResources("nope", join(root, "applications"), tree())).toBe(join(root, "resources", "nope"));
  });

  test("the real games find their pages from the repository whatever the working directory", () => {
    for (const name of ["frogger_studio", "snake_studio", "tetris_studio"]) {
      const dir = findStudioResources(name, join(import.meta.dir, "..", "applications"), tmpdir());
      expect(dir).toBe(join(import.meta.dir, "..", "resources", name));
      expect(Bun.file(join(dir, "index.html")).size).toBeGreaterThan(0);
    }
  });
});
