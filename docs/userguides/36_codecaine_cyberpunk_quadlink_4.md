# 🔴 Codecaine Cyberpunk QuadLink 4 -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Minimax Heuristics AI Engine, Kinetic Falling Physics & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:connect4]  •  [Headless Server: bun run applications/connect4_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Cyberpunk QuadLink 4** is a neon-infused, tactical 2-player and AI 4-in-a-row board game studio built natively for Bun RAD Studio. It combines a laser target column beam with landing cell preview ring, 3D reactor-core discs with kinetic gravity drop physics, 3 Board Themes (*Cyber Cyan/Gold*, *Synthwave Pink/Cyan*, *Matrix Emerald/Red*), an `↩ UNDO` move button, a live `🔥 Win Streak` counter, celebratory particle bursts, Web Audio sound effects, and a configurable Minimax heuristic AI.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:connect4

# Launch headless server
bun run applications/connect4_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Cyberpunk QuadLink 4 Desktop](../../screenshots/apps/connect4_desktop.png) | ![Cyberpunk QuadLink 4 Responsive](../../screenshots/apps/connect4_responsive.png) |

---

## 🕹️ Game Modes & AI Difficulty
- **Player vs AI**:
  - `Cadet (Easy)`: Casual heuristics, perfect for relaxing play.
  - `Cyber (Medium)`: Looks ahead 3–4 plies, blocks immediate threats.
  - `Overclocked (Hard)`: Deep Minimax tree search with positional evaluation.
- **2-Player Local Battle**: Play head-to-head on the same keyboard or mouse.
- **3 Board Themes**: Switch instantly between *Cyber Cyan/Gold*, *Synthwave Pink/Cyan*, and *Matrix Emerald/Red*.
- **Undo Move (`↩ UNDO`)**: Step back your last move (or last player + AI turn pair in 1P vs AI mode).
- **Turn Timer & Win Streak Counter**: Optional shot clock plus live `🔥 Win Streak` tracking.

---

## ⌨️ Controls Reference
- **Drop Disc in Column 1..7**: Keys `1`, `2`, `3`, `4`, `5`, `6`, `7` or direct mouse click.
- **Undo Move**: Click `↩ UNDO`
- **Reset Board**: `R`
- **Toggle AI Mode**: `M`
- **Game Master FX HUD**: `Alt + G`
- **Fullscreen**: `F` / `F11`

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
