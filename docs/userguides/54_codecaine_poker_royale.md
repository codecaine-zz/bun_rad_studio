# ♠️ Codecaine Texas Hold'em & 5-Card Draw Poker Royale -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 6-Max Casino Poker AI Engine, Vector Cards & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:poker]  •  [Headless Server: bun run applications/poker_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Texas Hold'em & 5-Card Draw Poker Royale** is a deluxe casino poker table studio built natively for Bun RAD Studio. Featuring both **No-Limit Texas Hold'em** and classic **5-Card Draw**, 6-max AI opponent personalities with distinct bluffing and pot-odds heuristics, custom Codecaine Royale vector playing cards, side-pot resolution, live hand-strength evaluation, and the **Codecaine Game Master FX & Post-Processing Engine (`Alt+G`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:poker
bun run app:holdem
bun run app:draw

# Launch headless server
bun run applications/poker_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Codecaine Poker Royale Desktop](../../screenshots/apps/poker_desktop.png) | ![Codecaine Poker Royale Responsive](../../screenshots/apps/poker_responsive.png) |

---

## 🕹️ Controls Reference
- **Fold / Check / Call / Raise**: Action buttons or keyboard shortcuts (`F`, `C`, `R`)
- **Switch Variant (Hold'em / 5-Card Draw)**: Top mode selector
- **Game Master FX HUD**: `Alt + G`

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
