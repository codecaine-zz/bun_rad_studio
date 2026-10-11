# 🔴 Cyberpunk Connect 4 Champion -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Minimax Heuristics AI Engine & Kinetic Falling Physics  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:connect4]  •  [Headless Server: bun run applications/connect4_studio.ts --server]
```

---

## 🌟 Executive Overview
**Cyberpunk Connect 4 Champion** is a neon-infused, tactical 2-player and AI board game studio built natively for Bun RAD Studio. It combines real-time column hover drop previews, kinetic gravity disc falling physics, celebratory particle bursts, Web Audio sound effects, and a configurable Minimax heuristic AI.

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
| ![Connect 4 Desktop](../../screenshots/apps/connect4_desktop.png) | ![Connect 4 Responsive](../../screenshots/apps/connect4_responsive.png) |

---

## 🕹️ Game Modes & AI Difficulty
- **Player vs AI**:
  - `Cadet (Easy)`: Casual heuristics, perfect for relaxing play.
  - `Cyber (Medium)`: Looks ahead 3–4 plies, blocks immediate threats.
  - `Overclocked (Hard)`: Deep Minimax tree search with positional evaluation.
- **2-Player Local Battle**: Play head-to-head on the same keyboard or mouse.
- **Turn Timer**: Optional 15s / 30s shot clock to keep matches fast and competitive.
- **Win Streak Counter**: Tracks consecutive victories and high-score streaks.

---

## ⌨️ Controls Reference
- **Drop Disc in Column 1..7**: Keys `1`, `2`, `3`, `4`, `5`, `6`, `7` or direct mouse click.
- **Reset Board**: `R`
- **Toggle AI Mode**: `M`
- **Fullscreen**: `F` / `F11`
