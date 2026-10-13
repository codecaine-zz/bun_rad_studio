import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
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

describe("The generated command list does not depend on the user's launcher history", () => {
  test("favourites and launch counts do not change the wrapper definitions or their order", () => {
    const baseline = buildWrapperDefinitions().map((d) => d.binName);
    const dir = mkdtempSync(join(tmpdir(), "launcher-history-"));
    const file = join(dir, "history.json");
    const previous = process.env.LAUNCHER_HISTORY_FILE;
    try {
      const ids = scanWorkspaceApps().map((a) => a.id);
      writeFileSync(file, JSON.stringify({ favorites: ids.filter((id) => id.startsWith("rad_") || id.startsWith("cli_")).slice(-6), launchHistory: Object.fromEntries(ids.slice(0, 8).map((id, i) => [id, { count: 50 - i, lastLaunched: Date.now() }])) }));
      process.env.LAUNCHER_HISTORY_FILE = file;
      const withHistory = buildWrapperDefinitions().map((d) => d.binName);
      expect(withHistory).toEqual(baseline);
    } finally {
      if (previous === undefined) delete process.env.LAUNCHER_HISTORY_FILE;
      else process.env.LAUNCHER_HISTORY_FILE = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
