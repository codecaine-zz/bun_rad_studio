import { describe, expect, it } from "bun:test";
import {
  buildReplacerRegex,
  computeDiffHunks,
  countMatches,
  escapeRegExp,
  expandTargets,
  replaceText,
} from "./sdDoers.ts";
import { processFile } from "./sdCoordinator.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("sd doers", () => {
  it("escapes special regex characters in string mode", () => {
    const raw = "foo.bar*[1]";
    const escaped = escapeRegExp(raw);
    const regex = buildReplacerRegex(raw, true, "g");
    expect(regex.test("foo.bar*[1]")).toBe(true);
    expect(regex.test("fooxbar01")).toBe(false);
  });

  it("replaces text with regex capture groups", () => {
    const regex = buildReplacerRegex("hello (\\w+)", false, "g");
    const result = replaceText("hello world hello bun", regex, "hi $1");
    expect(result).toBe("hi world hi bun");
  });

  it("computes diff hunks accurately", () => {
    const original = "line1\nline2\nline3";
    const modified = "line1\nchanged2\nline3";
    const hunks = computeDiffHunks(original, modified);
    expect(hunks.length).toBe(1);
    expect(hunks[0]?.lineNumber).toBe(2);
    expect(hunks[0]?.original).toBe("line2");
    expect(hunks[0]?.modified).toBe("changed2");
  });

  it("counts matches accurately across content", () => {
    const regex = buildReplacerRegex("foo", false, "g");
    expect(countMatches("foo bar foo baz foo", regex)).toBe(3);
    expect(countMatches("hello world", regex)).toBe(0);
  });

  it("handles case-insensitive replacement flag", () => {
    const regex = buildReplacerRegex("apple", false, "g", true);
    const result = replaceText("Apple APPLE apple", regex, "pear");
    expect(result).toBe("pear pear pear");
  });

  it("expands directory targets recursively", async () => {
    const files = await expandTargets(["src/features/sd"]);
    expect(files.some((f) => f.endsWith("sdDoers.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("sdCoordinator.ts"))).toBe(true);
  });

  it("matches whole words only when wholeWord is true", () => {
    const regex = buildReplacerRegex("cat", false, "g", false, true);
    const text = "the cat in the category";
    const replaced = replaceText(text, regex, "dog");
    expect(replaced).toBe("the dog in the category");
  });

  it("creates a backup file before modification", async () => {
    const { createBackup } = await import("./sdDoers.ts");
    const testFile = join(tmpdir(), `sd_bak_${Date.now()}.txt`);
    await Bun.write(testFile, "original data");
    const bakFile = await createBackup(testFile, ".bak");
    expect(await Bun.file(bakFile).exists()).toBe(true);
    expect(await Bun.file(bakFile).text()).toBe("original data");
    await Bun.file(testFile).delete();
    await Bun.file(bakFile).delete();
  });
});

describe("sd coordinator file processing", () => {
  it("processes file and reports modifications", async () => {
    const tempFile = join(tmpdir(), `sd_test_${Date.now()}.txt`);
    await Bun.write(tempFile, "apple orange banana");

    const regex = buildReplacerRegex("orange", false, "g");
    const result = await processFile(tempFile, regex, "grape");

    expect(result.hasChanged).toBe(true);
    expect(result.newContent).toBe("apple grape banana");
    expect(result.diffHunks.length).toBe(1);
  });
});
