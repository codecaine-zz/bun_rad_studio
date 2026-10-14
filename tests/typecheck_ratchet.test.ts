import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { compareCounts, countErrorsByFile } from "../scripts/typecheck_ratchet.ts";

const ROOT = join(import.meta.dir, "..");

describe("countErrorsByFile", () => {
  test("counts error lines per file and ignores continuation lines", () => {
    const out = [
      "src/a.ts(1,2): error TS2532: Object is possibly 'undefined'.",
      "src/a.ts(9,1): error TS7006: Parameter 'x' implicitly has an 'any' type.",
      "  Type 'x' is not assignable to type 'y'.",
      "src\\b.ts(3,3): error TS2339: Property 'q' does not exist on type 'Z'.",
      "Found 3 errors in 2 files.",
    ].join("\n");
    expect(countErrorsByFile(out, "/repo")).toEqual({ "src/a.ts": 2, "src/b.ts": 1 });
  });

  test("normalises paths relative to the root", () => {
    expect(countErrorsByFile("/repo/x/y.ts(1,1): error TS1005: ';' expected.", "/repo")).toEqual({ "x/y.ts": 1 });
  });

  test("no errors gives an empty result", () => {
    expect(countErrorsByFile("", "/repo")).toEqual({});
  });
});

describe("compareCounts", () => {
  test("a higher count, or an error in a file that had none, is a regression", () => {
    const { regressions, improvements } = compareCounts({ "a.ts": 2, "c.ts": 1 }, { "a.ts": 3, "b.ts": 1, "c.ts": 1 });
    expect(regressions).toEqual([
      { file: "a.ts", before: 2, now: 3 },
      { file: "b.ts", before: 0, now: 1 },
    ]);
    expect(improvements).toEqual([]);
  });

  test("fewer errors, or a file that is now clean, is an improvement and not a failure", () => {
    const { regressions, improvements } = compareCounts({ "a.ts": 3, "b.ts": 1 }, { "a.ts": 1 });
    expect(regressions).toEqual([]);
    expect(improvements).toEqual([
      { file: "a.ts", before: 3, now: 1 },
      { file: "b.ts", before: 1, now: 0 },
    ]);
  });

  test("equal counts change nothing", () => {
    expect(compareCounts({ "a.ts": 2 }, { "a.ts": 2 })).toEqual({ regressions: [], improvements: [] });
  });
});

describe("typecheck script on a disposable project", () => {
  const dir = mkdtempSync(join(tmpdir(), "typecheck-ratchet-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const baseline = join(dir, "baseline.json");
  const run = (...extra: string[]) => {
    const r = Bun.spawnSync(
      [process.execPath, "scripts/typecheck_ratchet.ts", "--project", join(dir, "tsconfig.json"), "--baseline", baseline, ...extra],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    return { code: r.exitCode, text: r.stdout.toString() + r.stderr.toString() };
  };
  const write = (name: string, body: string) => writeFileSync(join(dir, name), body);

  write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [] }, files: ["a.ts", "b.ts"] }));
  write("a.ts", "export const a: number = 1;\n");
  write("b.ts", "export const b: number = 2;\n");

  test("without a baseline it explains how to create one", () => {
    const r = run();
    expect(r.code).toBe(2);
    expect(r.text).toContain("--update");
  });

  test("--update records the current errors and a clean project passes", () => {
    write("a.ts", 'export const a: number = "not a number";\n');
    expect(run("--update").code).toBe(0);
    const saved = JSON.parse(readFileSync(baseline, "utf8"));
    expect(saved.total).toBe(1);
    const r = run();
    expect(r.code).toBe(0);
    expect(r.text).toContain("No new type errors");
  });

  test("an error in another file fails and names it", () => {
    write("b.ts", 'export const b: number = "oops";\n');
    const r = run();
    expect(r.code).toBe(1);
    expect(r.text).toContain("New type errors");
    expect(r.text).toMatch(/b\.ts: 0 -> 1/);
  });

  test("fixing errors does not fail, and says how to keep the gain", () => {
    write("b.ts", "export const b: number = 2;\n");
    write("a.ts", "export const a: number = 1;\n");
    const r = run();
    expect(r.code).toBe(0);
    expect(r.text).toContain("Fewer errors than recorded");
  });

  test("a broken tsconfig fails instead of looking like zero errors", () => {
    write("tsconfig.json", "{ not json");
    const r = run();
    expect(r.code).toBe(1);
    expect(r.text).toContain("tsconfig.json");
  });

  test("a project that cannot be found is reported as a tsc failure", () => {
    const r = Bun.spawnSync([process.execPath, "scripts/typecheck_ratchet.ts", "--project", join(dir, "missing.json"), "--baseline", baseline], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString() + r.stdout.toString()).toContain("tsc failed");
  });
});
