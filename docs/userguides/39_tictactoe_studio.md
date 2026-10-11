# ⭕ Neon Tic-Tac-Toe AI Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Unbeatable Minimax Game Theory Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:tictactoe]  •  [Headless Server: bun run applications/tictactoe_studio.ts --server]
```

---

## 🌟 Executive Overview
**Neon Tic-Tac-Toe AI Studio** is an interactive, cyberpunk-styled 3x3 strategy game and game theory workstation built natively for Bun RAD Studio. It showcases the classic **Minimax Algorithm** in an unbeatable AI mode, alongside casual practice modes, local 2-player matches, glowing neon canvas visuals, particle celebrations, and sound synthesis.

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
| ![Tic Tac Toe Desktop](../../screenshots/apps/tictactoe_desktop.png) | ![Tic Tac Toe Responsive](../../screenshots/apps/tictactoe_responsive.png) |

---

## 🧭 Game Modes & AI Theory
- **Unbeatable Minimax AI**: Recursively evaluates all future game states ($3^9 = 19,683$ possible leaf nodes). It is mathematically impossible to win against this mode—the best possible outcome is a hard-fought Draw.
- **Casual Mode**: Introduces a 20% random exploration probability, allowing players to practice win scenarios.
- **2-Player Local Battle**: Play against a friend on the same machine.
- **Scoreboard**: Tracks Player X Wins, Player O Wins, Draws, and active win streaks.

---

## ⌨️ Controls Reference
- **Place Marker on Grid**: Numpad keys `1..9` (mapped to 3x3 grid) or direct mouse click.
- **Restart Round**: `R`
- **Toggle Mode**: `M`
- **Fullscreen**: `F` / `F11`
