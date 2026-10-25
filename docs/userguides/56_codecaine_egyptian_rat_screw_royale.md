# 🎴 Codecaine Egyptian Rat Screw Royale -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: High-Speed Reflex Card Slap Engine, Multi-CPU AI & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:rat_screw]  •  [Headless Server: bun run applications/rat_screw_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Egyptian Rat Screw Royale** is a fast-paced reflex card-slapping studio built natively for Bun RAD Studio. Face off against configurable CPU opponents or local challengers with face-cardroyal challenges, customizable slap rules (Doubles, Sandwiches, Top-Bottom, Tens, Marriage, Sequence), penalty burn protection, reaction-time telemetry, and the **Codecaine Game Master FX & Post-Processing Engine (`Alt+G`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:rat_screw
bun run app:ers

# Launch headless server
bun run applications/rat_screw_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Codecaine Egyptian Rat Screw Royale Desktop](../../screenshots/apps/rat_screw_desktop.png) | ![Codecaine Egyptian Rat Screw Royale Responsive](../../screenshots/apps/rat_screw_responsive.png) |

---

## 🕹️ Controls Reference
- **Play Card**: `D` or `Enter` or click your deck
- **Slap Center Pile**: `Space` or `S` or click the center pile
- **Game Master FX HUD**: `Alt + G`

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
