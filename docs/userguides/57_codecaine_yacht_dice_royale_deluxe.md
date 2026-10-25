# 🎲 Codecaine Yacht Dice Royale Deluxe -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 3D Tactile Dice Engine, Championship Scorecard & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:yahtzee]  •  [Headless Server: bun run applications/yahtzee_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Yacht Dice Royale Deluxe** is a 5-dice tactical scorecard studio built natively for Bun RAD Studio. Roll and hold 3D tactile dice across 13 championship scoring categories, earn the +35 Upper Section bonus and multi-Yacht Joker bonuses, challenge the probability-optimizing AI opponent or local players, and customize visual shaders via the **Codecaine Game Master FX & Post-Processing Engine (`Alt+G`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:yahtzee
bun run app:dice

# Launch headless server
bun run applications/yahtzee_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Codecaine Yacht Dice Royale Deluxe Desktop](../../screenshots/apps/yahtzee_desktop.png) | ![Codecaine Yacht Dice Royale Deluxe Responsive](../../screenshots/apps/yahtzee_responsive.png) |

---

## 🕹️ Controls Reference
- **Roll Dice**: `Space` or click **Roll Dice**
- **Hold / Unhold Die 1..5**: Keys `1`..`5` or click any die
- **Score Category**: Click any highlighted row on the scorecard
- **Game Master FX HUD**: `Alt + G`

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
