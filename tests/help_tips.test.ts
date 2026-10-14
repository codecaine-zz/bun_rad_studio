import { describe, expect, test } from "bun:test";
import { HELP_SKIP, HELP_TIPS } from "../src/shared/help";
import { auditHtml, describe as describeControl, uncovered } from "../src/shared/helpAudit";
import { helpApps, helpIdOf, pageFor, GAME_APPS, appFiles, OTHER_HELP } from "../src/shared/helpPages";
import { helpScript, injectHelp, matchTip, normalizeLabel, type ElementInfo } from "../src/shared/helpTips";

const el = (over: Partial<ElementInfo> = {}): ElementInfo => ({ tag: "button", id: "", classes: [], text: "", placeholder: "", aria: "", name: "", title: "", type: "", role: "", ...over });
const tip = (info: Partial<ElementInfo>, tips: Record<string, string>) => matchTip(el(info), tips, normalizeLabel);

describe("matching a control to its tip", () => {
  test("ids, labels, placeholders, aria labels, names and classes all work, and an id beats a label", () => {
    const tips = { "#go": "by id", "text:Save as": "by text", "ph:Search files": "by placeholder", "aria:Close window": "by aria", "name:email": "by name", ".danger": "by class", "text^:Items": "by start" };
    expect(tip({ id: "go", text: "Save as" }, tips)).toBe("by id");
    expect(tip({ text: "Save as" }, tips)).toBe("by text");
    expect(tip({ tag: "input", placeholder: "Search files" }, tips)).toBe("by placeholder");
    expect(tip({ aria: "Close window" }, tips)).toBe("by aria");
    expect(tip({ tag: "input", name: "email" }, tips)).toBe("by name");
    expect(tip({ classes: ["x", "danger"] }, tips)).toBe("by class");
    expect(tip({ text: "Items (12)" }, tips)).toBe("by start");
    expect(tip({ text: "Nothing like it" }, tips)).toBeNull();
  });

  test("labels ignore case, spacing, leading icons and emoji, and trailing symbols", () => {
    const tips = { "text:Audit & Validate": "ok" };
    for (const text of ["⚡ Audit & Validate", "  audit   &  VALIDATE ", "🚀  Audit & Validate ▾", "Audit & Validate…"]) expect(tip({ text }, tips), text).toBe("ok");
    expect(normalizeLabel("🔒 Mask Secrets")).toBe("mask secrets");
    expect(normalizeLabel("Items (3)")).toBe("items (3)");
  });
});

describe("the script that goes into a page", () => {
  test("is injected once, with its tips escaped so they cannot close the script", () => {
    const once = injectHelp("<html><body><p>x</p></body></html>", "demo");
    expect(once).toContain("<!-- studio-help:demo -->");
    expect(injectHelp(once, "demo")).toBe(once);
    const evil = helpScript({ "#a": "</script><script>alert(1)</script>", "#b": "line\u2028sep" });
    expect(evil.match(/<\/script>/g)?.length).toBe(1);
    expect(evil).not.toContain("<script>alert");
    const body = evil.replace(/^<script>/, "").replace(/<\/script>$/, "");
    expect(() => new Function(body)).not.toThrow();
  });

  test("works on a page with no body tag and for an unknown app (it still upgrades title attributes)", () => {
    expect(injectHelp("<p>fragment</p>", "nope")).toContain("studio-tip");
    expect(helpIdOf(injectHelp("<body></body>", "a_b-1"))).toBe("a_b-1");
    expect(helpIdOf(injectHelp("<body></body>", 'a"><b'))).toBe("ab");
  });
});

describe("every app that is not a game has help tips for all of its controls", () => {
  test("games are named, every other app is accounted for, and no dictionary is for an app that doesn't exist", () => {
    const files = new Set(appFiles());
    for (const g of GAME_APPS) expect(files.has(g), `${g} is listed as a game but is not an app`).toBe(true);
    for (const o of OTHER_HELP) expect(files.has(o), o).toBe(true);
    expect(helpApps().length).toBeGreaterThan(30);
  });

  for (const app of helpApps()) {
    test(app, async () => {
      const html = await pageFor(app);
      const id = helpIdOf(html);
      expect(id, `${app} did not get the help script (its page generator must call injectHelp)`).not.toBeNull();
      const tips = HELP_TIPS[id!];
      expect(tips, `no dictionary for "${id}": create src/shared/help/${id}.ts and register it in src/shared/help/index.ts`).toBeDefined();
      const controls = await auditHtml(html, tips!);
      const missing = uncovered(controls, HELP_SKIP[id!] ?? []);
      expect(missing.map(describeControl), `${app}: controls without a tip (run: bun run scripts/help_controls.ts ${app} --missing)`).toEqual([]);
    }, 30000);
  }
});

describe("the tips themselves", () => {
  test("each is a real sentence: not empty, not just the label again, not a wall of text", () => {
    const bad: string[] = [];
    for (const [id, tips] of Object.entries(HELP_TIPS)) {
      for (const [key, text] of Object.entries(tips)) {
        const label = normalizeLabel(key.replace(/^(text\^?|ph|aria|name):/, "").replace(/^[#.]/, ""));
        if (text.trim().length < 12) bad.push(`${id} ${key}: too short`);
        if (text.length > 360) bad.push(`${id} ${key}: ${text.length} characters is too long for a tooltip`);
        if (normalizeLabel(text) === label) bad.push(`${id} ${key}: only repeats the label`);
        if (/[<>]/.test(text)) bad.push(`${id} ${key}: contains < or > (tips are plain text)`);
        if (/\s{2,}|\n/.test(text)) bad.push(`${id} ${key}: has line breaks or double spaces`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("every skip rule says why", () => {
    for (const [id, rules] of Object.entries(HELP_SKIP)) for (const r of rules) expect(r.why.length, `${id}: a skip rule has no reason`).toBeGreaterThan(8);
  });
});
