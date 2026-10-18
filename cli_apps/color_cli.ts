#!/usr/bin/env bun
/**
 * Color & Design Token Studio CLI
 * HEX/RGB/HSL conversion, WCAG 2.1 contrast audit, 50-950 scale generator & design token export
 */
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('color-cli', '1.0.0')
  .setDescription('Color Converter, WCAG 2.1 Accessibility Auditor & Design Token Generator');

app.addFlagString('color', 'c', '#0284c7', 'Base HEX color code (e.g. #0284c7, #10b981)');
app.addFlagString('tokens', 't', '', 'Export design tokens format: css, tailwind, ts, json');
app.addFlagBool('contrast', 'C', false, 'Audit WCAG 2.1 contrast against white & black');
app.addFlagBool('scale', 's', false, 'Generate 50-950 tonal palette');

if (!app.parseCli()) process.exit(0);

const hex = app.getFlagString('color').replace(/^#/, '');

function hexToRgb(h: string): { r: number; g: number; b: number } {
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function getLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (a[0] ?? 0) + 0.7152 * (a[1] ?? 0) + 0.0722 * (a[2] ?? 0);
}

function getContrast(rgb1: { r: number; g: number; b: number }, rgb2: { r: number; g: number; b: number }): number {
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return Math.round(ratio * 100) / 100;
}

function generateScale(h: number, s: number): Record<string, string> {
  const lightMap: Record<string, number> = {
    '50': 96, '100': 90, '200': 80, '300': 70, '400': 60,
    '500': 50, '600': 40, '700': 30, '800': 20, '900': 12, '950': 6
  };
  const res: Record<string, string> = {};
  for (const [step, l] of Object.entries(lightMap)) {
    const rgb = hslToRgb(h, s, l);
    res[step] = `#${((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1)}`;
  }
  return res;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

async function main() {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const contrastWhite = getContrast(rgb, { r: 255, g: 255, b: 255 });
  const contrastBlack = getContrast(rgb, { r: 0, g: 0, b: 0 });

  const tokenFmt = app.getFlagString('tokens').toLowerCase();
  const scale = generateScale(hsl.h, hsl.s);

  if (tokenFmt === 'css') {
    console.log(':root {');
    for (const [step, hexVal] of Object.entries(scale)) {
      console.log(`  --color-brand-${step}: ${hexVal};`);
    }
    console.log('}');
    return;
  }

  if (tokenFmt === 'tailwind') {
    console.log(`brand: ${JSON.stringify(scale, null, 2)}`);
    return;
  }

  if (tokenFmt === 'ts') {
    console.log(`export const brandColors = ${JSON.stringify(scale, null, 2)} as const;`);
    return;
  }

  if (tokenFmt === 'json') {
    console.log(JSON.stringify({ hex: `#${hex}`, rgb, hsl, contrast: { white: contrastWhite, black: contrastBlack }, scale }, null, 2));
    return;
  }

  app.banner('Color & Design Token Studio CLI', `Base Color: #${hex}`);
  app.printKv({
    'HEX': `#${hex}`,
    'RGB': `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    'HSL': `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    'Contrast vs White (#FFF)': `${contrastWhite}:1 ${contrastWhite >= 4.5 ? app.green('(AA PASS)') : app.red('(FAIL)')}`,
    'Contrast vs Black (#000)': `${contrastBlack}:1 ${contrastBlack >= 4.5 ? app.green('(AA PASS)') : app.red('(FAIL)')}`,
  });

  app.info('50-950 Tonal Scale:');
  app.table(
    ['Stop', 'HEX Value'],
    Object.entries(scale).map(([s, val]) => [s, val])
  );
}

main();
