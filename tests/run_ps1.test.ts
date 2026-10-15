import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const script = readFileSync(join(import.meta.dir, "..", "run.ps1"), "utf8");

// PowerShell names are case-insensitive, so $target IS the typed [string]$Target parameter.
// Assigning a catalog object to it at script level turns the object into text; the
// launcher then had no path, joined to the project folder and `bun run` started index.ts (the IDE).
describe("run.ps1 launcher dispatch", () => {
  test("script-level code never assigns to the [string]$Target parameter", () => {
    const lines = script.split("\n");
    let depth = 0;
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      const code = line.replace(/#.*$/, "");
      if (depth === 0 && /^\s*\$target\s*=/i.test(code)) offenders.push(`${i + 1}: ${line.trim()}`);
      for (const ch of code) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
    });
    expect(offenders).toEqual([]);
  });

  test("-Gui and -Cli select the launcher apps through their own variables", () => {
    expect(script).toMatch(/if \(\$Gui\) \{\s*\$guiItem = \$allCatalog \| Where-Object \{ \$_\.Id -eq 'launcher_studio' \}\s*Launch-Item \$guiItem/);
    expect(script).toMatch(/if \(\$Cli\) \{\s*\$cliItem = \$allCatalog \| Where-Object \{ \$_\.Id -eq 'launcher_cli' \}\s*Launch-Item \$cliItem/);
  });

  test("Launch-Item refuses an item without a path", () => {
    expect(script).toMatch(/if \(-not \$Item -or -not \$Item\.RelativePath\)/);
  });
});
