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
  describe(`${name} theme colors`, () => {
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
  test("same colors in the media query as in [data-theme=dark]", () => {
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

  test("zen mode keeps the editor on screen: the Code pane stays absolutely positioned and no rule makes it 'relative'", () => {
    const ui = join(import.meta.dir, "..", "resources", "file_manager", "ui");
    expect(readFileSync(join(ui, "power.css"), "utf8")).toMatch(/\.power-pane \{[^}]*position: absolute; inset: 0/);
    const code = readFileSync(join(ui, "code.css"), "utf8");
    // Setting position on the pane itself would shrink it to nothing (it is laid out by inset: 0), so only its children may.
    for (const m of code.matchAll(/(^|\n)([^{}\n]+)\{([^}]*)\}/g)) {
      const selectors = m[2]!.split(",").map((x) => x.trim());
      if (selectors.some((x) => x === ".code-zen" || x === ".code-root" || x === ".power-pane.code-root")) expect(m[3], m[2]).not.toMatch(/\bposition:/);
    }
  });

  test("all File Manager power tools, media players, embedded apps, hosted studios, and database studios follow File Manager themes", () => {
    const rootDir = join(import.meta.dir, "..");
    const ui = join(rootDir, "resources", "file_manager", "ui");

    // 1. Code Studio & Sub-Studio Tokens
    const codeCss = readFileSync(join(ui, "code.css"), "utf8");
    expect(codeCss).toContain("var(--fm-code-bg, var(--bg))");
    expect(codeCss).toContain("var(--fm-syntax-keyword,");
    expect(codeCss).toContain("var(--fm-syntax-string,");

    // 2. Databases & Downloads & Power CSS use semantic File Manager tokens
    const dbCss = readFileSync(join(ui, "databases.css"), "utf8");
    expect(dbCss).toContain("var(--fm-db-bg, var(--bg))");
    expect(dbCss).not.toContain("var(--fg)");
    expect(dbCss).not.toContain("var(--sel)");

    const dlCss = readFileSync(join(ui, "downloads.css"), "utf8");
    expect(dlCss).toContain("var(--good,");

    const powerCss = readFileSync(join(ui, "power.css"), "utf8");
    expect(powerCss).toContain("var(--surface-sunken, var(--bg))");

    // 3. Media Deck & Quick Look Media Player default to Match App Theme ("theme")
    const playerDeckJs = readFileSync(join(ui, "playerDeck.js"), "utf8");
    const mediaPlayerJs = readFileSync(join(ui, "mediaplayer.js"), "utf8");
    const playerCss = readFileSync(join(ui, "player.css"), "utf8");
    expect(playerDeckJs).toContain('skin: "theme"');
    expect(mediaPlayerJs).toContain('skin: "theme"');
    expect(playerCss).toContain('.wa-shell[data-skin="theme"]');
    expect(playerCss).toContain('.wa-mini-bar[data-skin="theme"]');
    expect(playerCss).toContain('.wa-floating-pip[data-skin="theme"]');

    // 4. Embedded Apps, Hosted Studios, and Database Studios receive and apply fmTheme
    const fmServerTs = readFileSync(join(rootDir, "src", "features", "filemanager", "fmServer.ts"), "utf8");
    expect(fmServerTs).toContain("_applyFmTheme(e.data.fmTheme)");
    expect(fmServerTs).toContain("fm-embedded-theme");

    const simpleguiHostTs = readFileSync(join(rootDir, "src", "simplegui_host.ts"), "utf8");
    expect(simpleguiHostTs).toContain("applyFmTheme(e.data.fmTheme)");
    expect(simpleguiHostTs).toContain("fm-hosted-studio-theme");

    const dbStudioJs = readFileSync(join(ui, "dbStudio.js"), "utf8");
    const studioPolishTs = readFileSync(join(rootDir, "src", "shared", "studioPolish.ts"), "utf8");
    expect(dbStudioJs).toContain('on("theme-changed"');
    expect(studioPolishTs).toContain("applyFmTheme(e.data.fmTheme)");
    expect(studioPolishTs).toContain("fm-db-studio-theme");
  });

  test("modern web guidance UI enhancements: IME-safe Enter submit, typography balance/pretty, Quick Look 1:1 & Bionic Vision, and Details Quick Actions", () => {
    const rootDir = join(import.meta.dir, "..");
    const ui = join(rootDir, "resources", "file_manager", "ui");

    // 1. Typography legibility (text-wrap: balance & text-wrap: pretty) and skip-link :focus-visible
    expect(css).toContain("text-wrap: balance");
    expect(css).toContain("text-wrap: pretty");
    expect(css).toContain(".skip-link:focus-visible");
    expect(css).toContain(".info-quick-actions");
    expect(css).toContain(".info-qa-btn");

    const bionicCss = readFileSync(join(ui, "bionic.css"), "utf8");
    expect(bionicCss).toContain("text-wrap: balance");
    expect(bionicCss).toContain("text-wrap: pretty");

    // 2. Reduced-motion damping on .ollama-spinner
    const ollamaCss = readFileSync(join(ui, "ollama.css"), "utf8");
    expect(ollamaCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ollama-spinner/);

    // 3. IME-safe Enter composition guards (e.isComposing || e.keyCode === 229) & prompt history recall
    for (const file of [
      "ollama.js",
      "bionic.js",
      "codeAiChat.js",
      "codeFindBar.js",
      "quicklookFormat.js",
      "findUi.js",
      "findPicker.js",
      "sdform.js",
      "codePanels.js",
      "serveForm.js",
      "studioCommon.js",
      "net.js",
      "ip.js",
      "iptools.js",
      "subs.js",
      "fileinfoHash.js",
      "crypto_color.js",
      "vaultEncrypt.js",
      "vaultDecrypt.js",
      "permsPanel.js",
      "tasks.js",
      "cliUtils.js",
    ]) {
      const src = readFileSync(join(ui, file), "utf8");
      expect(src, file).toContain("e.isComposing || e.keyCode === 229");
    }
    const ollamaJs = readFileSync(join(ui, "ollama.js"), "utf8");
    const bionicJs = readFileSync(join(ui, "bionic.js"), "utf8");
    expect(ollamaJs).toContain("lastSubmittedPrompt");
    expect(bionicJs).toContain("lastSubmittedPrompt");
    expect(ollamaJs).toContain('"data-ollama-subtab"');

    // 4. Quick Look Image Inspector 1:1 actual size, 2D panning stage, double-click zoom, wheel zoom, and Ask Bionic Vision
    const qlJs = readFileSync(join(ui, "quicklook.js"), "utf8");
    expect(qlJs).toContain("qlImgActual");
    expect(qlJs).toContain("qlImgAskBionic");
    expect(qlJs).toContain('"1": "[data-ql-img-actual]"');
    expect(qlJs).toContain("Interactive image stage for");
    expect(css).toContain("scroll-axis-lock: none");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain("accent-color: var(--accent)");
    expect(css).toContain(":user-invalid");
    expect(ollamaCss).toContain("field-sizing: content");

    // 5. Details Panel Quick Actions strip & Floating Selection Bar AI actions
    const infoJs = readFileSync(join(ui, "info.js"), "utf8");
    expect(infoJs).toContain("info-quick-actions");
    expect(infoJs).toContain('infoAction: "quicklook"');
    expect(infoJs).toContain('infoAction: "ask-ai"');
    expect(infoJs).toContain('infoAction: "ask-bionic"');
    expect(infoJs).toContain('infoAction: "read-aloud"');

    const quickbarJs = readFileSync(join(ui, "quickbar.js"), "utf8");
    expect(quickbarJs).toContain('addAct("ollama"');
    expect(quickbarJs).toContain('addAct("bionic"');

    // 6. Shared Database Studio polish (studioPolish.ts)
    const studioPolishTs = readFileSync(join(rootDir, "src", "shared", "studioPolish.ts"), "utf8");
    expect(studioPolishTs).toContain("accent-color: var(--cyan)");
    expect(studioPolishTs).toContain(":user-invalid");
    expect(studioPolishTs).toContain("text-wrap: balance");
    expect(studioPolishTs).toContain("text-wrap: pretty");

    // 7. Code Editor AI Chat front-and-centre Diff & Per-Hunk Review before Apply
    const codeAiChatJs = readFileSync(join(ui, "codeAiChat.js"), "utf8");
    const codePreviewJs = readFileSync(join(ui, "codePreview.js"), "utf8");
    const codeCss = readFileSync(join(ui, "code.css"), "utf8");
    expect(codeAiChatJs).toContain("computeDiffHunks");
    expect(codeAiChatJs).toContain("applySelectedDiffHunks");
    expect(codeAiChatJs).toContain("locateTargetRangeInFile");
    expect(codeAiChatJs).toContain('"data-ai-apply-selected-hunks"');
    expect(codeAiChatJs).toContain('"data-ai-accept-hunk"');
    expect(codeAiChatJs).toContain('"data-ai-hunk-check"');
    expect(codeAiChatJs).toContain('"data-ai-view-mode"');
    expect(codePreviewJs).toContain("onDiscardHunk");
    expect(codeCss).toContain(".code-ai-diff-review");
    expect(codeCss).toContain(".code-ai-hunk-card");
    expect(codeCss).toContain(".code-ai-hunk-checkbox");
  });
});
