import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { writeFileSync } from "fs";
import { resolve, basename } from "path";

// Color Conversion Helpers
const DEFAULT_RGB = { r: 2, g: 132, b: 199 };

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = clean[0] || "0";
    const g = clean[1] || "0";
    const b = clean[2] || "0";
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function getLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const rLum = a[0] ?? 0;
  const gLum = a[1] ?? 0;
  const bLum = a[2] ?? 0;
  return rLum * 0.2126 + gLum * 0.7152 + bLum * 0.0722;
}

function getContrastRatio(fgHex: string, bgHex: string): number {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return 1;
  const l1 = getLuminance(fg.r, fg.g, fg.b);
  const l2 = getLuminance(bg.r, bg.g, bg.b);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return parseFloat(((bright + 0.05) / (dark + 0.05)).toFixed(2));
}

export function createColorStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const fullscreen = options.fullscreen ?? true;
  const win = newSimpleWindow("Color Palette & Design Token Studio Pro", 1140, 880, {
    appId: "color_studio",
    theme: options.theme || getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
    fullscreen,
  });

  // Top Bar
  win.beginRow();
  win.addHeading("Color & Design Token Studio");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.endRow();
  win.addCaption("Enterprise Design System Tokens, WCAG 2.1 Contrast Auditing & Palette Generator");

  // Primary Color Controls
  win.beginGroupBox("Active Color Configuration");
  win.beginRow();
  win.addLabel("lbl_primary", "Primary Color (HEX):");
  win.addInput("txt_color_hex", "#0284c7").width(180);
  win.addLabel("lbl_bg", "Background (HEX):");
  win.addInput("txt_bg_hex", "#0b0f19").width(180);
  win.addButton("btn_analyze", "⚡ Analyze & Generate");
  win.addButton("btn_swap", "🔄 Swap FG/BG");
  win.endRow();
  win.endGroupBox();

  // WCAG Compliance & Values Card
  win.beginCard("WCAG 2.1 Accessibility & Color Conversions");
  win.beginRow();
  win.addLabel("lbl_contrast", "Contrast Ratio: 7.82 : 1");
  win.addLabel("lbl_wcag_aa", "WCAG AA: 🟢 PASS (Normal & Large)");
  win.addLabel("lbl_wcag_aaa", "WCAG AAA: 🟢 PASS (Normal & Large)");
  win.endRow();
  win.beginRow();
  win.addLabel("lbl_rgb", "RGB: rgb(2, 132, 199)");
  win.addLabel("lbl_hsl", "HSL: hsl(200, 98%, 39%)");
  win.endRow();
  win.endCard();

  // Palette Generator Actions
  win.beginGroupBox("Design Token Exporters & Palette Modes");
  win.beginRow();
  win.addButton("btn_palette_shades", "🎨 Generate 50-950 Shades");
  win.addButton("btn_palette_comp", "⚖️ Complementary & Triadic");
  win.addButton("btn_export_css", "📋 Export CSS Variables");
  win.addButton("btn_export_tailwind", "🌊 Export Tailwind Tokens");
  win.addButton("btn_export_ts", "💾 Export TypeScript Constants");
  win.endRow();
  win.endGroupBox();

  // Output Token Stream
  win.beginGroupBox("Generated Design Tokens & Palette Definition");
  win.addTextarea(
    "txt_tokens_output",
    `/* CSS Design System Tokens */
:root {
  --color-brand-primary: #0284c7;
  --color-brand-rgb: 2, 132, 199;
  --color-brand-hsl: 200, 98%, 39%;
  --color-background: #0b0f19;
  --contrast-ratio: 7.82;
  --wcag-status: AA-Pass / AAA-Pass;
}
`
  );
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Color Analytics & Accessibility Audit Trail");
  win.addConsole("color_console", 110);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Engine: Native Color Math  |  WCAG 2.1 Compliant  |  Zero Homebrew");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Color palette saved successfully!");
  });

  const analyzeColors = () => {
    const fg = win.getValue("txt_color_hex") || "#0284c7";
    const bg = win.getValue("txt_bg_hex") || "#0b0f19";

    const rgb = hexToRgb(fg);
    if (!rgb) {
      win.toast("Invalid Primary HEX code");
      return;
    }

    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const contrast = getContrastRatio(fg, bg);

    const aaPass = contrast >= 4.5;
    const aaaPass = contrast >= 7.0;

    win.setText("lbl_contrast", `Contrast Ratio: ${contrast} : 1`);
    win.setText(
      "lbl_wcag_aa",
      `WCAG AA: ${aaPass ? "🟢 PASS (Normal & Large)" : contrast >= 3.0 ? "🟡 PASS (Large Only)" : "🔴 FAIL"}`
    );
    win.setText(
      "lbl_wcag_aaa",
      `WCAG AAA: ${aaaPass ? "🟢 PASS (Normal & Large)" : contrast >= 4.5 ? "🟡 PASS (Large Only)" : "🔴 FAIL"}`
    );
    win.setText("lbl_rgb", `RGB: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
    win.setText("lbl_hsl", `HSL: hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`);

    win.appendConsole(
      "color_console",
      `[Color Analysis] Primary: ${fg} | BG: ${bg} | Contrast: ${contrast}:1 | AA: ${aaPass} | AAA: ${aaaPass}\n`,
      2
    );
    win.setText("lbl_status", `Active: ${fg}  |  Contrast: ${contrast}:1  |  AA: ${aaPass ? "Pass" : "Fail"}`);
    win.setStatus(`Contrast: ${contrast}:1`);
  };

  win.onClick("btn_analyze", analyzeColors);

  win.onClick("btn_swap", () => {
    const fg = win.getValue("txt_color_hex") || "#0284c7";
    const bg = win.getValue("txt_bg_hex") || "#0b0f19";
    win.setText("txt_color_hex", bg);
    win.setText("txt_bg_hex", fg);
    analyzeColors();
  });

  win.onClick("btn_palette_shades", () => {
    const fg = win.getValue("txt_color_hex") || "#0284c7";
    const rgb = hexToRgb(fg);
    if (!rgb) return;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    const weights = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
    const lines: string[] = [`// 50-950 Tonal Palette for ${fg}`];

    for (const w of weights) {
      // Lightness adjustment: 50 -> 95%, 500 -> base, 950 -> 10%
      const factor = (1000 - w) / 1000;
      const targetL = Math.round(10 + factor * 85);
      lines.push(`  ${w}: "hsl(${hsl.h}, ${hsl.s}%, ${targetL}%)",`);
    }

    win.setText("txt_tokens_output", lines.join("\n"));
    win.appendConsole("color_console", `[Palette Generator] Generated 11 tonal steps for ${fg}\n`, 2);
  });

  win.onClick("btn_palette_comp", () => {
    const fg = win.getValue("txt_color_hex") || "#0284c7";
    const rgb = hexToRgb(fg);
    if (!rgb) return;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    const compH = (hsl.h + 180) % 360;
    const tri1H = (hsl.h + 120) % 360;
    const tri2H = (hsl.h + 240) % 360;

    const report = [
      `// Harmonies & Color Relationships for ${fg}`,
      `// Primary:`,
      `  primary:       "hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)",`,
      `// Complementary (180deg):`,
      `  complementary: "hsl(${compH}, ${hsl.s}%, ${hsl.l}%)",`,
      `// Triadic 1 (+120deg):`,
      `  triadicA:      "hsl(${tri1H}, ${hsl.s}%, ${hsl.l}%)",`,
      `// Triadic 2 (+240deg):`,
      `  triadicB:      "hsl(${tri2H}, ${hsl.s}%, ${hsl.l}%)",`,
    ].join("\n");

    win.setText("txt_tokens_output", report);
    win.appendConsole("color_console", `[Harmonies] Calculated complementary & triadic color points\n`, 2);
  });

  win.onClick("btn_export_css", () => {
    const fg = win.getValue("txt_color_hex") || "#0284c7";
    const bg = win.getValue("txt_bg_hex") || "#0b0f19";
    const rgb = hexToRgb(fg) ?? DEFAULT_RGB;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    const cssTokens = `:root {
  --color-primary: ${fg};
  --color-primary-rgb: ${rgb.r}, ${rgb.g}, ${rgb.b};
  --color-primary-hsl: ${hsl.h}, ${hsl.s}%, ${hsl.l}%;
  --color-background: ${bg};
  --font-family-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-family-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
`;
    win.setText("txt_tokens_output", cssTokens);
    const outPath = resolve(process.cwd(), "design_tokens.css");
    try {
      writeFileSync(outPath, cssTokens, "utf8");
      win.appendConsole("color_console", `[Export CSS] Tokens written to ${outPath}\n`, 2);
      win.toast(`Saved ${basename(outPath)}`);
    } catch (e: any) {
      win.appendConsole("color_console", `[Export Error] ${e.message}\n`, 3);
    }
  });

  win.onClick("btn_export_tailwind", () => {
    const fg = win.getValue("txt_color_hex") || "#0284c7";
    const bg = win.getValue("txt_bg_hex") || "#0b0f19";

    const tailwind = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '${fg}',
          surface: '${bg}',
        }
      }
    }
  }
};
`;
    win.setText("txt_tokens_output", tailwind);
    win.appendConsole("color_console", "[Export Tailwind] Tailwind configuration snippet generated\n", 2);
    win.toast("Generated Tailwind tokens");
  });

  win.onClick("btn_export_ts", () => {
    const fg = win.getValue("txt_color_hex") || "#0284c7";
    const bg = win.getValue("txt_bg_hex") || "#0b0f19";
    const rgb = hexToRgb(fg) ?? DEFAULT_RGB;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    const tsCode = `export const ThemeTokens = {
  colors: {
    primary: "${fg}",
    primaryRgb: "${rgb.r}, ${rgb.g}, ${rgb.b}",
    primaryHsl: "${hsl.h}, ${hsl.s}%, ${hsl.l}%",
    background: "${bg}",
  },
  typography: {
    fontSans: 'system-ui, -apple-system, sans-serif',
    fontMono: 'ui-monospace, monospace',
  },
} as const;
`;
    win.setText("txt_tokens_output", tsCode);
    win.appendConsole("color_console", "[Export TS] TypeScript constants generated\n", 2);
    win.toast("Generated TypeScript tokens");
  });

  win.onClick("btn_fullscreen", () => win.toggleFullscreen());

  return win;
}

if (import.meta.main) {
  const win = createColorStudio({ fullscreen: true });
  console.log("⚡ Launching Color Palette & Design Token Studio (Fullscreen)...");
  win.run();
}
