import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { NON_APP_MODULES, scanWorkspaceApps } from "../applications/launcher_studio.ts";
import { buildWrapperDefinitions } from "../scripts/generate_brew_suite.ts";

const ROOT = join(import.meta.dir, "..");

describe("Launcher lists only things that can be launched", () => {
  const apps = scanWorkspaceApps().filter((a) => a.displayPath.startsWith("./applications/"));

  test("library modules and browser assets in applications/ are not offered as apps", () => {
    const listed = new Set(apps.map((a) => a.displayPath.replace("./applications/", "")));
    for (const name of NON_APP_MODULES) expect(listed.has(name)).toBe(false);
  });

  test("every listed application has a start-up entry point", () => {
    const missing = apps
      .map((a) => a.displayPath.replace("./applications/", ""))
      .filter((file) => !/\bimport\.meta\.main\b/.test(readFileSync(join(ROOT, "applications", file), "utf8")));
    expect(missing).toEqual([]);
  });

  test("no generated command wraps a non-app module", () => {
    const wrapped = buildWrapperDefinitions().map((d) => d.targetScript.replace("applications/", ""));
    for (const name of NON_APP_MODULES) expect(wrapped).not.toContain(name);
  });
});
