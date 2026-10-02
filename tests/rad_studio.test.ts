import { describe, it, expect } from "bun:test";
import { createRadStudio, getRecipeForModule } from "../applications/rad_studio.ts";
import { RAD_MODULES_CATALOG } from "../cli_apps/rad_cli.ts";
import { rad, fileutils, arrutils, objutils, fnutils, sqliteutils, globutils, shellutils, hashutils } from "../src/index.ts";
import { resolve } from "node:path";

describe("⚡ RAD Utilities Studio Pro & CLI Specification Suite", () => {
  it("1. Verifies all 44 RAD utility modules are exported from src/index.ts", () => {
    expect(rad).toBeDefined();
    expect(typeof fileutils.saveJson).toBe("function");
    expect(typeof arrutils.at).toBe("function");
    expect(typeof arrutils.chunk).toBe("function");
    expect(typeof objutils.get).toBe("function");
    expect(typeof objutils.pick).toBe("function");
    expect(typeof fnutils.memoize).toBe("function");
    expect(typeof fnutils.pipe).toBe("function");
    expect(typeof sqliteutils.openDb).toBe("function");
    expect(typeof globutils.glob).toBe("function");
    expect(typeof shellutils.which).toBe("function");
    expect(typeof hashutils.wyhash).toBe("function");
    expect(RAD_MODULES_CATALOG.length).toBe(44);
  });

  it("2. Verifies createRadStudio initializes with expected SimpleGUI controls", () => {
    const win = createRadStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("RAD Utilities Studio Pro");
    expect(win.appId).toBe("rad_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);

    expect(ids).toContain("dd_theme");
    expect(ids).toContain("btn_save_state");
    expect(ids).toContain("btn_center");
    expect(ids).toContain("btn_fullscreen");
    expect(ids).toContain("dd_category");
    expect(ids).toContain("dd_module");
    expect(ids).toContain("btn_run_module");
    expect(ids).toContain("btn_run_all");
    expect(ids).toContain("btn_copy_recipe");
    expect(ids).toContain("btn_clear");
    expect(ids).toContain("tbl_modules");
    expect(ids).toContain("txt_recipe");
    expect(ids).toContain("console_rad");
  });

  it("3. Verifies getRecipeForModule generates valid TypeScript code recipes", () => {
    const fileutilsRecipe = getRecipeForModule("fileutils");
    expect(fileutilsRecipe).toContain("import { fileutils }");
    expect(fileutilsRecipe).toContain("fileutils.saveJson");

    const arrutilsRecipe = getRecipeForModule("arrutils");
    expect(arrutilsRecipe).toContain("arrutils.at");
    expect(arrutilsRecipe).toContain("arrutils.chunk");

    const fnutilsRecipe = getRecipeForModule("fnutils");
    expect(fnutilsRecipe).toContain("fnutils.memoize");
    expect(fnutilsRecipe).toContain("fnutils.pipe");
  });

  it("4. Verifies RAD CLI runs with --list and outputs all 6 categories", async () => {
    const cliScript = resolve(process.cwd(), "cli_apps/rad_cli.ts");
    const proc = Bun.spawn(["bun", cliScript, "--list"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    const output = stdout + stderr;
    expect(output).toContain("File & Storage");
    expect(output).toContain("Data Structures");
    expect(output).toContain("Strings & Formats");
    expect(output).toContain("System & Runtime");
    expect(output).toContain("Network & Web");
    expect(output).toContain("Functions & Logic");
    expect(output).toContain("fileutils");
    expect(output).toContain("sqliteutils");
  });

  it("5. Verifies RAD CLI runs single module demo with --module", async () => {
    const cliScript = resolve(process.cwd(), "cli_apps/rad_cli.ts");
    const proc = Bun.spawn(["bun", cliScript, "--module", "arrutils"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    const output = stdout + stderr;
    expect(output).toContain("arrutils.at(-1)");
    expect(output).toContain("arrutils.chunk");
  });

  it("6. Verifies RAD CLI outputs JSON catalog with --json", async () => {
    const cliScript = resolve(process.cwd(), "cli_apps/rad_cli.ts");
    const proc = Bun.spawn(["bun", cliScript, "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(44);
    expect(parsed[0].name).toBe("fileutils");
  });
});
