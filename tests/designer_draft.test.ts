import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearDraftHelper, draftFilePath, loadDraftHelper, saveDraftHelper } from "../index.ts";

const dirs: string[] = [];
function dir() {
  const d = mkdtempSync(join(tmpdir(), "draft-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const form = { title: "My form", width: 800, height: 600, controls: [{ id: "button_1", control_type: "button", x: 1, y: 2, width: 3, height: 4, text: "Hi" }] };

describe("Designer draft autosave (backend)", () => {
  test("a saved form comes back unchanged, with the time it was saved", () => {
    const d = dir();
    expect(saveDraftHelper(JSON.stringify(form), d)).toEqual({ ok: true });
    const draft = loadDraftHelper(d)!;
    expect(JSON.parse(draft.specJson)).toEqual(form);
    expect(Date.now() - new Date(draft.savedAt).getTime()).toBeLessThan(10_000);
  });

  test("saving again replaces the draft and leaves no temporary file behind", () => {
    const d = dir();
    saveDraftHelper(JSON.stringify(form), d);
    saveDraftHelper(JSON.stringify({ ...form, title: "Second" }), d);
    expect(JSON.parse(loadDraftHelper(d)!.specJson).title).toBe("Second");
    expect(readdirSync(d)).toEqual(["designer_draft.json"]);
  });

  test("the draft is readable only by its owner", () => {
    if (process.platform === "win32") return;
    const d = dir();
    saveDraftHelper(JSON.stringify(form), d);
    expect(statSync(draftFilePath(d)).mode & 0o777).toBe(0o600);
  });

  test("text that is not a form is refused and nothing is written", () => {
    const d = dir();
    for (const bad of ["not json", "42", "null", "[]", '{"title":"x"}', '{"controls":"no"}']) {
      expect(saveDraftHelper(bad, d).ok).toBe(false);
    }
    expect(saveDraftHelper(undefined as any, d).ok).toBe(false);
    expect(existsSync(draftFilePath(d))).toBe(false);
  });

  test("a form over 10 MB is refused", () => {
    const d = dir();
    const huge = JSON.stringify({ controls: [], note: "x".repeat(10 * 1024 * 1024 + 1) });
    const result = saveDraftHelper(huge, d);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("too large");
  });

  test("loading finds nothing when there is no draft, or the file is damaged or the wrong shape", () => {
    const d = dir();
    expect(loadDraftHelper(d)).toBeNull();
    writeFileSync(draftFilePath(d), "{ broken");
    expect(loadDraftHelper(d)).toBeNull();
    writeFileSync(draftFilePath(d), JSON.stringify({ savedAt: "x", spec: { title: "no controls" } }));
    expect(loadDraftHelper(d)).toBeNull();
    writeFileSync(draftFilePath(d), JSON.stringify([1, 2]));
    expect(loadDraftHelper(d)).toBeNull();
  });

  test("clearing deletes the draft once and then reports there was nothing to delete", () => {
    const d = dir();
    saveDraftHelper(JSON.stringify(form), d);
    expect(clearDraftHelper(d)).toBe(true);
    expect(loadDraftHelper(d)).toBeNull();
    expect(clearDraftHelper(d)).toBe(false);
  });

  test("by default the draft lives in the per-user app folder, not the project folder", () => {
    const file = draftFilePath();
    expect(file.endsWith("designer_draft.json")).toBe(true);
    expect(file).toContain("bun_rad_studio");
    expect(file.startsWith(process.cwd())).toBe(false);
  });
});
