import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const css = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "ui", "style.css"), "utf8");

/** The `--name: value` pairs of one rule, found by its selector text. */
function variables(selectorStart: string): Record<string, string> {
  const start = css.indexOf(selectorStart);
  expect(start, selectorStart).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

// Pairs that actually appear in the page: [foreground, background, minimum ratio].
const PAIRS: Array<[string, string, number]> = [
  ["text", "bg", 4.5], ["text", "panel", 4.5], ["muted", "bg", 4.5], ["muted", "panel", 4.5], ["text", "hover", 4.5], ["muted", "hover", 4.5],
  ["selected-text", "selected", 4.5], ["accent-text", "accent", 4.5], ["accent", "bg", 4.5], ["accent", "panel", 4.5],
  ["danger", "bg", 4.5], ["danger", "hover", 4.5], ["danger-text", "danger-bg", 4.5], ["danger", "danger-bg", 3],
  ["toast-text", "toast-bg", 4.5], ["toast-action", "toast-bg", 4.5], ["warn-text", "warn-bg", 4.5], ["toast-good", "toast-bg", 3], ["toast-bad", "toast-bg", 3], ["good", "panel", 3],
  ["muted", "selected", 3],
];

for (const [name, selector] of [["light", ":root {"], ["dark", ':root[data-theme="dark"]']] as const) {
  describe(`${name} theme colours`, () => {
    const vars = variables(selector);
    test("every text and background pair is readable", () => {
      const low: string[] = [];
      for (const [fg, bg, min] of PAIRS) {
        expect(vars[fg], fg).toMatch(/^#[0-9a-f]{6}$/i);
        expect(vars[bg], bg).toMatch(/^#[0-9a-f]{6}$/i);
        const r = ratio(vars[fg]!, vars[bg]!);
        if (r < min) low.push(`${fg} on ${bg}: ${r.toFixed(2)} (needs ${min})`);
      }
      expect(low).toEqual([]);
    });
  });
}

describe("the automatic dark theme matches the dark theme", () => {
  test("same colours in the media query as in [data-theme=dark]", () => {
    const dark = variables(':root[data-theme="dark"]');
    const auto = variables(":root:not([data-theme])");
    for (const [k, v] of Object.entries(dark)) expect(auto[k], k).toBe(v);
    expect(Object.keys(auto).sort()).toEqual(Object.keys(dark).sort());
  });
  test("light and dark define the same variables", () => {
    expect(Object.keys(variables(":root {")).sort()).toEqual(Object.keys(variables(':root[data-theme="dark"]')).sort());
  });
});

describe("accessibility basics in the stylesheet", () => {
  test("keyboard focus is visible and reduced motion is respected", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  test("an outline is only removed where something else shows the focus", () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
    const removed = rules.filter((r) => /outline:\s*none/.test(r.body));
    expect(removed.length).toBeGreaterThan(0);
    for (const r of removed) {
      const showsAnother = /background:/.test(r.body); // a menu item that is highlighted instead
      const insideInput = r.selector === ".address-input" || r.selector === ".search-input"; // their container draws the ring
      expect(showsAnother || insideInput, r.selector).toBe(true);
    }
    expect(css).toContain(".address-main:focus-within");
    expect(css).toContain(".search:focus-within");
  });
  test("text size scales with the user's setting", () => {
    expect(css).toContain("--fm-scale");
  });
});
