# ❌ Codecaine Neon Tic-Tac-Toe Arcade -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Unbeatable Minimax Game Theory Engine, Infinity Decay Mode & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:tictactoe]  •  [Headless Server: bun run applications/tictactoe_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Neon Tic-Tac-Toe Arcade** is an interactive, cyberpunk-styled 3x3 strategy game and game theory workstation built natively for Bun RAD Studio. It showcases the classic **Minimax Algorithm** in an unbeatable AI mode, alongside **⚡ Infinity Decay (No Draws)** mode, casual practice modes, local 2-player matches, animated SVG vector `X`/`O` glyphs with radial spark bursts, a live `🔥 Win Streak` counter, and sound synthesis.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:tictactoe

# Launch headless server
bun run applications/tictactoe_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Codecaine Neon Tic-Tac-Toe Arcade Desktop](../../screenshots/apps/tictactoe_desktop.png) | ![Codecaine Neon Tic-Tac-Toe Arcade Responsive](../../screenshots/apps/tictactoe_responsive.png) |

---

## 🧭 Game Modes & AI Theory
- **⚡ Infinity Decay (No Draws) Rule Variant**: Each player may hold at most **3 marks** on the grid at once; placing a 4th mark vaporizes that player's oldest mark (highlighted with a pulsing warning halo when 3 marks are active), making draws impossible!
- **Unbeatable Minimax AI**: Recursively evaluates all future game states ($3^9 = 19,683$ possible leaf nodes). In Classic 3x3 mode, the best possible outcome against Optimal AI is a hard-fought Draw.
- **Casual Mode**: Introduces a 20% random exploration probability, allowing players to practice win scenarios.
- **2-Player Local Battle**: Play against a friend on the same machine.
- **Scoreboard & Win Streak**: Tracks Player X Wins, Player O Wins, Draws, and active `🔥 Win Streak`.

---

## ⌨️ Controls Reference
- **Place Marker on Grid**: Numpad keys `1..9` (mapped to 3x3 grid) or direct mouse click.
- **Restart Round**: `R`
- **Toggle Mode**: `M`
- **Game Master FX HUD**: `Alt + G`
- **Fullscreen**: `F` / `F11`

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
