# 🎨 Color & Design Token Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native Color Space & WCAG 2.1 Math Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:color]  •  [Terminal CLI: bun run cli:color]
```

---

## 🌟 Executive Overview
**Color & Design Token Studio** is an enterprise color space converter, accessibility contrast auditor, and design token generator built natively for Bun RAD Studio. It empowers UI/UX designers, design engineers, and frontend developers to construct harmonious, accessible color palettes adhering to **WCAG 2.1 AA and AAA accessibility standards**.

It provides bidirectional conversion across **HEX, RGB, HSL, and OKLCH**, generates complete 50–950 tonal shade scales, audits foreground/background contrast ratios in real time, and exports production-ready tokens for Tailwind CSS, CSS Custom Properties, and TypeScript.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:color
```

### 2. Launch Terminal CLI Color Inspector
```bash
# Check contrast between two colors
bun run cli:color contrast "#a855f7" "#0f172a"

# Generate 50-950 scale for a hex color
bun run cli:color scale "#3b82f6"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Color Studio Desktop](../../screenshots/apps/color_studio_desktop.png) | ![Color Studio Responsive](../../screenshots/apps/color_studio_responsive.png) |

---

## 🧭 Core Workspaces & Capabilities

### 1. 🌈 Color Converter & Channel Inspector
- **Inputs**: Supports `#hex`, `rgb(r, g, b)`, `hsl(h, s%, l%)`, and `oklch(l, c, h)`.
- **Live Color Chip**: Displays high-DPI color swatch with one-click clipboard copy.

### 2. 👁️ WCAG 2.1 Contrast Auditor
- Evaluates contrast ratio between Foreground and Background (e.g. `12.4:1`).
- Visual badges for:
  - **Normal Text AA** (Requires $ge 4.5:1$)
  - **Large Text AA** (Requires $ge 3.0:1$)
  - **Normal Text AAA** (Requires $ge 7.0:1$)
  - **Large Text AAA** (Requires $ge 4.5:1$)

### 3. 🎨 50–950 Tonal Scale Generator
- Generates 10 harmonious shades: `50`, `100`, `200`, `300`, `400`, `500`, `600`, `700`, `800`, `900`, `950`.
- Exports directly to Tailwind CSS configuration format or CSS Variables.
