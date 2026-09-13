import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { searchFiles } from "./fdCoordinator.ts";
import { buildMatcher, matchesExtension, matchesType, isEntryExecutable, matchesSize, matchesExclude } from "./fdDoers.ts";
import type { FdEntry } from "./fdTypes.ts";

describe("fd doers", () => {
  it("buildMatcher performs smart case matching", () => {
    const matcherLower = buildMatcher("index");
    expect(matcherLower("index.ts", "src/index.ts")).toBe(true);
    expect(matcherLower("INDEX.ts", "src/INDEX.ts")).toBe(true);

    const matcherUpper = buildMatcher("INDEX");
    expect(matcherUpper("INDEX.ts", "src/INDEX.ts")).toBe(true);
    expect(matcherUpper("index.ts", "src/index.ts")).toBe(false);
  });

  it("matchesExtension checks file extension", () => {
    expect(matchesExtension("file.ts", "ts")).toBe(true);
    expect(matchesExtension("file.ts", ".ts")).toBe(true);
    expect(matchesExtension("file.js", "ts")).toBe(false);
  });

  it("matchesType filters correctly", () => {
    const dummyFile: FdEntry = {
      path: "/test/a.txt",
      displayPath: "a.txt",
      name: "a.txt",
      isDirectory: false,
      isFile: true,
      isSymlink: false,
      isExecutable: false,
      depth: 1,
    };
    expect(matchesType(dummyFile, "f")).toBe(true);
    expect(matchesType(dummyFile, "d")).toBe(false);
  });

  it("parses size filter and matches file sizes correctly", () => {
    expect(matchesSize(1024 * 1024 * 10, "+5M")).toBe(true);
    expect(matchesSize(1024 * 1024, "+5M")).toBe(false);
    expect(matchesSize(500, "-1k")).toBe(true);
    expect(matchesSize(2000, "-1k")).toBe(false);
  });

  it("matchesExclude excludes matching patterns", () => {
    expect(matchesExclude("node_modules/bun/index.d.ts", ["node_modules"])).toBe(true);
    expect(matchesExclude("src/features/fd/fdCli.ts", ["node_modules"])).toBe(false);
  });

  it("parses duration strings and checks changedWithin", () => {
    const { parseDurationMs, matchesChangedWithin, matchesMinDepth } = require("./fdDoers.ts");
    expect(parseDurationMs("10m")).toBe(10 * 60 * 1000);
    expect(parseDurationMs("2h")).toBe(2 * 60 * 60 * 1000);
    expect(parseDurationMs("1d")).toBe(24 * 60 * 60 * 1000);

    const recent = new Date();
    const old = new Date(Date.now() - 3600 * 1000 * 5); // 5 hours ago
    expect(matchesChangedWithin(recent, "10m")).toBe(true);
    expect(matchesChangedWithin(old, "1h")).toBe(false);

    expect(matchesMinDepth(2, 2)).toBe(true);
    expect(matchesMinDepth(1, 2)).toBe(false);
  });
});

describe("fd coordinator", () => {
  it("finds package.json in workspace root", async () => {
    const results = await searchFiles({
      pattern: "package.json",
      rootPath: ".",
      hidden: false,
      absolute: false,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === "package.json")).toBe(true);
  });

  it("filters by extension", async () => {
    const results = await searchFiles({
      extension: "json",
      rootPath: ".",
      hidden: false,
      absolute: false,
      maxDepth: 2,
    });
    expect(results.every((r) => r.name.endsWith(".json"))).toBe(true);
  });
});
