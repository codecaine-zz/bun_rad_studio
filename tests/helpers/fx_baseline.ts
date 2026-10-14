// Page output for themes WITHOUT an `fx` descriptor, hashed. The fixture tests/fixtures/fx_baseline_hashes.json
// was written before the futuristic theme layer existed, so any change to these pages shows up as a mismatch.
//   bun run tests/helpers/fx_baseline.ts   prints the current hashes
import { createHash } from "crypto";
import { createThemeShowcase } from "../../demos/23_all_themes_all_controls_showcase";
import { generatePreviewHtml } from "../../index";
import { FX_THEME_KEYS } from "../../src/shared/fxThemes";

export const BASELINE_THEMES = ["midnight", "dracula", "win95", "apple_light", "tokyo_night", "oled_black"];

const sha = (s: string) => ({ sha256: createHash("sha256").update(s).digest("hex"), length: s.length });

// The showcase pages list every theme in a dropdown; the futuristic themes added to that list are the only intended difference.
const withoutFxOptions = (html: string) => html.replace(/<option[^>]*value="([^"]*)"[^>]*>[^<]*<\/option>/g, (m, v) => (FX_THEME_KEYS.includes(v) ? "" : m));

const designerControls = [
    { id: "b1", type: "button", text: "Save", x: 10, y: 10, width: 100, height: 34 },
    { id: "i1", type: "input", text: "", placeholder: "Name", x: 10, y: 54, width: 220, height: 34 },
    { id: "g1", type: "groupbox", text: "Group", x: 10, y: 98, width: 240, height: 80 },
    { id: "t1", type: "table", columns: ["A", "B"], rows: [["1", "2"], ["3", "4"]], x: 10, y: 190, width: 300, height: 120 },
    { id: "tb1", type: "tabs", items: ["One", "Two"], x: 10, y: 320, width: 300, height: 40 },
    { id: "p1", type: "progress", value: 40, x: 10, y: 370, width: 300, height: 20 },
    { id: "c1", type: "card", title: "Card", x: 330, y: 10, width: 240, height: 160 },
    { id: "m1", type: "modal", title: "Modal", is_open: true, x: 330, y: 190, width: 280, height: 160 },
];

export function computeBaseline(): Record<string, { sha256: string; length: number }> {
    const out: Record<string, { sha256: string; length: number }> = {};
    for (const t of BASELINE_THEMES) out[`window:${t}`] = sha(withoutFxOptions(createThemeShowcase(t).getHtml()));
    out["designer:dark"] = sha(generatePreviewHtml({ title: "T", width: 640, height: 480, background_color: "#0f172a", font_color: "#e2e8f0", accent_color: "#38bdf8", controls: designerControls }));
    out["designer:light"] = sha(generatePreviewHtml({ title: "T", width: 640, height: 480, background_color: "#f8fafc", font_color: "#0f172a", accent_color: "#0284c7", is_dark: false, controls: designerControls }));
    return out;
}

if (import.meta.main) console.log(JSON.stringify(computeBaseline(), null, 2));
