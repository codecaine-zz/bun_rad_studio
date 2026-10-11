# 🏓 Neon Cyber Pong -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Kinetic Vector Ball Physics & Synthetic Audio  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:pong]  •  [Headless Server: bun run applications/pong_studio.ts --server]
```

---

## 🌟 Executive Overview
**Neon Cyber Pong** is a high-speed, kinetic arcade tennis remaster built natively for Bun RAD Studio. Featuring responsive paddle spin deflection physics, particle collision shockwaves, Web Audio frequency synthesis, multi-tier AI opponents, and local 2-player multiplayer.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:pong

# Launch headless server
bun run applications/pong_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Cyber Pong Desktop](../../screenshots/apps/pong_desktop.png) | ![Cyber Pong Responsive](../../screenshots/apps/pong_responsive.png) |

---

## 🕹️ Physics & Deflection Mechanics
- **Edge Spin Deflection**: Hitting the ball with the outer edges of the paddle introduces severe vertical spin, deflecting the ball at sharp, high-speed angles to outmaneuver opponents.
- **Paddle Momentum Acceleration**: Moving the paddle in the direction of the ball during impact increases velocity by 15%, delivering a power smash.
- **Victory Race**: First player to score 11 points wins the match with a celebratory neon fanfare.

---

## ⌨️ Controls Reference

| Player | Up | Down |
| :--- | :--- | :--- |
| **Player 1 (Left Paddle)** | `W` | `S` |
| **Player 2 (Right Paddle / Local)** | `↑` Up Arrow | `↓` Down Arrow |
| **Pause Game** | `P` or `Escape` | — |
| **Toggle AI / 2-Player** | `M` | — |
| **Fullscreen** | `F` / `F11` | — |
