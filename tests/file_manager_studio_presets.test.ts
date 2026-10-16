import { describe, expect, test } from "bun:test";
import { createContext } from "../src/features/filemanager/fmCore";
import { DEFAULT_SETTINGS, MAX_PRESET_NAME, MAX_STUDIO_PRESETS, sanitizeSettings } from "../src/features/filemanager/fmSettings";

describe("Image Studio and Media Studio presets in the settings", () => {
  const ctx = createContext({ platform: "linux", home: "/home/u", dataDir: "/tmp/x" });
  const presets = (studioPresets: unknown) => sanitizeSettings({ studioPresets }, ctx).studioPresets;

  test("there are none to begin with", () => {
    expect(DEFAULT_SETTINGS.studioPresets).toEqual({ image: [], media: [] });
    expect(sanitizeSettings({}, ctx).studioPresets).toEqual({ image: [], media: [] });
  });

  test("good presets are kept as they are", () => {
    const image = [{ name: "Web thumbnails", options: { width: 300, gray: true, format: "webp", rotate: "0" } }];
    const media = [{ name: "Soft intro", options: { fadeIn: 1, volume: 150, normalize: false } }];
    expect(presets({ image, media })).toEqual({ image, media });
  });

  test("names are cleaned, shortened, required and unique (ignoring case)", () => {
    const out = presets({ image: [
      { name: "  Tab\there\nnew  ", options: {} },
      { name: "x".repeat(200), options: {} },
      { name: "   ", options: {} },
      { name: "TAB HERE NEW", options: {} },
      { options: {} },
    ] }).image;
    expect(out.map((p) => p.name)).toEqual(["Tab here new", "x".repeat(MAX_PRESET_NAME)]);
  });

  test("only simple option values with plain ids survive", () => {
    const out = presets({ media: [{ name: "x", options: { ok: 1, yes: true, text: "auto", nan: Number.NaN, obj: { a: 1 }, list: [1], "bad-id": 1, __proto__x: 1, long: "y".repeat(61), nul: "a\0b" } }] }).media;
    expect(out[0]!.options).toEqual({ ok: 1, yes: true, text: "auto" });
  });

  test("there is a limit, and junk is ignored", () => {
    const many = Array.from({ length: MAX_STUDIO_PRESETS + 10 }, (_, i) => ({ name: `p${i}`, options: {} }));
    expect(presets({ image: many }).image.length).toBe(MAX_STUDIO_PRESETS);
    for (const bad of [null, 5, "x", [], { image: "no", media: [null, 3, "x"] }]) expect(presets(bad)).toEqual({ image: [], media: [] });
  });
});
