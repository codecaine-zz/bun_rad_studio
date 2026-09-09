# 🎨 Color & Design Token Studio -- User Guide

**Color & Design Token Studio** is an enterprise color palette engineering and accessibility audit suite. Designed for design system architects and frontend developers, it provides bidirectional HEX/RGB/HSL conversion, WCAG 2.1 contrast ratio compliance checking, 50–950 tonal shade generation, and one-click token export to CSS Variables, Tailwind Configs, and TypeScript constants.

---

## ⚡ Quick Start

```bash
bun run app:color
```

---

## 🖥️ User Interface Overview

1. **Color Input & Multi-Format Inspector**:
   - **Base Color Input**: Enter HEX code (e.g. `#0284c7`, `#10b981`, `#6366f1`).
   - **Interactive Color Swatch**: Visual preview of the selected color.
   - **Real-Time Values**:
     - `HEX`: `#0284c7`
     - `RGB`: `rgb(2, 132, 199)`
     - `HSL`: `hsl(200, 98%, 39%)`
2. **WCAG 2.1 Contrast Ratio & Accessibility Audit**:
   - **Foreground & Background Pair**: Test the base color against pure White (`#FFFFFF`) and pure Black (`#000000`) or a custom background.
   - **Contrast Ratio Score**: Precise numerical ratio (e.g. `4.82:1`).
   - **Compliance Badges**:
     - `WCAG AA Normal Text (4.5:1)`: PASS / FAIL
     - `WCAG AA Large Text (3.0:1)`: PASS / FAIL
     - `WCAG AAA Normal Text (7.0:1)`: PASS / FAIL
     - `WCAG AAA Large Text (4.5:1)`: PASS / FAIL
3. **50–950 Tonal Scale Generator**:
   - Automatically computes a 10-step perceptual tonal ramp:
     - `50`, `100`, `200`, `300`, `400`, `500` (Base), `600`, `700`, `800`, `900`, `950`
   - Visual color swatch strip displaying each shade with its exact HEX value.
4. **Color Harmonics & Palette Pairings**:
   - **Complementary Color**: The 180° opposite hue on the color wheel.
   - **Triadic Harmonies**: The two equidistant 120° color pairings.
   - **Analogous Harmonies**: Neighboring 30° hues for subtle gradients.
5. **Design Token Exporter**:
   - **CSS Custom Properties**: Exports `:root { --color-primary-50: ...; }`.
   - **Tailwind CSS Config**: Exports `colors: { primary: { '50': '...', ... } }`.
   - **TypeScript Constant Object**: Strongly typed exported object ready for frontend design systems.

---

## 📖 Practical Tutorials

### 1. Verifying WCAG AA Compliance for a Button Label
1. In **Base Color Input**, enter your button's primary brand color:
   ```text
   #0284c7
   ```
2. Check the **WCAG 2.1 Accessibility Audit** section.
3. Review the contrast ratio against white text (`#FFFFFF`):
   - Contrast: `4.54:1`
   - `WCAG AA Normal`: **PASS**
   - `WCAG AA Large`: **PASS**
   - `WCAG AAA Normal`: **FAIL** (requires 7.0:1)
4. If targeting AAA compliance, darken the shade until the ratio reaches 7.0:1.

### 2. Exporting a Complete Design System Palette to Tailwind CSS
1. Enter your primary brand color.
2. Click **Export Tailwind Config**.
3. The generated JavaScript/TypeScript snippet is ready to paste into `tailwind.config.js`:
   ```javascript
   module.exports = {
     theme: {
       extend: {
         colors: {
           brand: {
             50: '#f0f9ff',
             100: '#e0f2fe',
             200: '#bae6fd',
             300: '#7dd3fc',
             400: '#38bdf8',
             500: '#0ea5e9',
             600: '#0284c7',
             700: '#0369a1',
             800: '#075985',
             900: '#0c4a6e',
             950: '#082f49',
           }
         }
       }
     }
   }
   ```

---

## 🛡️ Enterprise Resilience Features
- **Perceptually Uniform Color Calculations**: Utilizes calibrated mathematical color models rather than naive linear RGB blending.
- **Accurate WCAG Luminance Calculations**: Implements the official W3C relative luminance formula `L = 0.2126 * R + 0.7152 * G + 0.0722 * B`.
- **Zero Heavy Web Design Packages**: 100% native client-side computation.
