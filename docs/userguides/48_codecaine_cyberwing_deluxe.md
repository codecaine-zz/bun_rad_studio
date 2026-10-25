# 🐦 Codecaine CyberWing Deluxe -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Kinetic Thrust Physics, Parallax Skyline & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:flappy_bird]  •  [Headless Server: bun run applications/flappy_bird_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberWing Deluxe** is a kinetic side-scrolling aerial reflex arcade studio built natively for Bun RAD Studio. Pilot a glowing cyber-wing drone through high-voltage plasma conduits across a multi-layer parallax cyberpunk skyline with medal achievements, difficulty tuning, Web Audio synth effects, and the **Codecaine Game Master FX & Post-Processing Engine (`Alt+G`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:flappy_bird
bun run app:bird

# Launch headless server
bun run applications/flappy_bird_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Codecaine CyberWing Deluxe Desktop](../../screenshots/apps/flappy_bird_desktop.png) | ![Codecaine CyberWing Deluxe Responsive](../../screenshots/apps/flappy_bird_responsive.png) |

---

## 🕹️ Controls Reference
- **Flap / Thrust**: `Space`, `↑` Up Arrow, `W`, or `Left Click`
- **Pause / Restart**: `P` / `R`
- **Game Master FX HUD**: `Alt + G`

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
