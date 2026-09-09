import { describe, it, expect } from "bun:test";
import { evaluateBunJsonQuery, createJqStudio } from "../applications/jq_studio";
import { createBrewStudio, createBunSystemStudio } from "../applications/brew_studio";
import { createWatchexecStudio, createBunWatchStudio } from "../applications/watchexec_studio";
import { createOmnitoolStudio } from "../applications/omnitool_studio";

describe("⚡ Bun Native System & Zero-Homebrew Suite", () => {
  const sampleData = {
    project: "Bun RAD Studio",
    version: "2.0.0",
    author: { name: "Alex", active: true },
    metrics: { stars: 4800, open_issues: 0 },
    modules: [
      { name: "simplegui", lines: 3900, status: "stable" },
      { name: "simplecli", lines: 4500, status: "stable" },
      { name: "applications", lines: 2800, status: "stable" },
      { name: "designer", lines: 1200, status: "preview" },
    ],
    tags: ["bun", "typescript", "native-mac"],
  };

  it("1. Evaluates identity (.) and primitives natively", () => {
    expect(evaluateBunJsonQuery(sampleData, ".")).toEqual(sampleData);
    expect(evaluateBunJsonQuery(sampleData, "")).toEqual(sampleData);
  });

  it("2. Evaluates keys and length natively", () => {
    const keys = evaluateBunJsonQuery(sampleData, "keys");
    expect(keys).toContain("project");
    expect(keys).toContain("metrics");
    expect(keys).toContain("modules");

    expect(evaluateBunJsonQuery(sampleData.modules, "length")).toBe(4);
    expect(evaluateBunJsonQuery(sampleData.tags, "length")).toBe(3);
  });

  it("3. Evaluates property path traversal natively", () => {
    expect(evaluateBunJsonQuery(sampleData, ".author.name")).toBe("Alex");
    expect(evaluateBunJsonQuery(sampleData, ".metrics.stars")).toBe(4800);
    expect(evaluateBunJsonQuery(sampleData, ".modules[0].name")).toBe("simplegui");
    expect(evaluateBunJsonQuery(sampleData, ".tags[1]")).toBe("typescript");
  });

  it("4. Evaluates pipeline operators (map, select, join, add) natively", () => {
    const names = evaluateBunJsonQuery(sampleData, ".modules | map(.name)");
    expect(names).toEqual(["simplegui", "simplecli", "applications", "designer"]);

    const joined = evaluateBunJsonQuery(sampleData, '.tags | join(", ")');
    expect(joined).toBe("bun, typescript, native-mac");

    const stable = evaluateBunJsonQuery(sampleData, '.modules[] | select(.status == "stable")');
    expect(stable.length).toBe(3);
  });

  it("5. Evaluates JavaScript expressions ($) natively", () => {
    const uppercaseNames = evaluateBunJsonQuery(
      sampleData,
      "$.modules.map(m => m.name.toUpperCase())"
    );
    expect(uppercaseNames).toEqual(["SIMPLEGUI", "SIMPLECLI", "APPLICATIONS", "DESIGNER"]);

    const totalLines = evaluateBunJsonQuery(
      sampleData,
      "$.modules.reduce((acc, m) => acc + m.lines, 0)"
    );
    expect(totalLines).toBe(12400);
  });

  it("6. Instantiates Bun System & Package Workstation (Zero Homebrew)", () => {
    const win1 = createBunSystemStudio();
    const html1 = win1.generateHtml();
    expect(html1).toContain("Bun System & Package Workstation");
    expect(html1).toContain("btn_search");

    // Check alias
    const win2 = createBrewStudio();
    const html2 = win2.generateHtml();
    expect(html2).toContain("Bun System & Package Workstation");
    expect(html2).toContain("btn_search");
  });

  it("7. Instantiates Bun Watch Studio (fs.watch, Zero Homebrew)", () => {
    const win = createWatchexecStudio();
    const html = win.generateHtml();
    expect(html).toContain("Bun Watch Studio");
    expect(html).toContain("btn_start_watch");
    expect(html).toContain("fs.watch");

    const winAlias = createBunWatchStudio();
    expect(winAlias.generateHtml()).toContain("Bun Watch Studio");
  });

  it("8. Instantiates JQ Studio Pro (Bun Native JSON Engine, Zero Homebrew)", () => {
    const win = createJqStudio();
    const html = win.generateHtml();
    expect(html).toContain("JQ Studio Pro");
    expect(html).toContain("Bun Native Engine (Zero Homebrew)");
    expect(html).toContain("btn_execute");
  });

  it("9. Instantiates OmniTool Studio Pro (6 Bun Native Tool Engines, Zero Homebrew)", () => {
    const win = createOmnitoolStudio();
    const html = win.generateHtml();
    expect(html).toContain("OmniTool Studio Pro");
    expect(html).toContain("RG: Ready");
    expect(html).toContain("FD: Ready");
    expect(html).toContain("SD: Ready");
    expect(html).toContain("WATCHEXEC: Ready");
    expect(html).toContain("RIP: Ready");
    expect(html).toContain("JQ: Ready");
    expect(html).toContain("btn_run_omni");
  });

  it("10. Instantiates newly named modern studio entry points", async () => {
    const { createSystemStudio } = await import("../applications/system_studio");
    const { createWatcherStudio } = await import("../applications/watcher_studio");
    const { createJsonStudio } = await import("../applications/json_studio");
    const { createDevToolsStudio } = await import("../applications/devtools_studio");
    const { createProcessStudio } = await import("../applications/process_studio");
    const { createDatabaseStudio } = await import("../applications/database_studio");

    expect(createSystemStudio().generateHtml()).toContain("System & Package Workstation");
    expect(createWatcherStudio().generateHtml()).toContain("Bun Watch Studio");
    expect(createJsonStudio().generateHtml()).toContain("JQ Studio Pro");
    expect(createDevToolsStudio().generateHtml()).toContain("OmniTool Studio Pro");
    expect(createProcessStudio().generateHtml()).toContain("Task Manager Pro");
    expect(createDatabaseStudio().generateHtml()).toContain("SQLite Studio Pro");
  });
});
