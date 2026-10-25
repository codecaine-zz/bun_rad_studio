# 🏓 Codecaine Neon Cyber Paddle -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Kinetic Vector Ball Physics, Power-Up Orbs, Synthetic Audio & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:pong]  •  [Headless Server: bun run applications/pong_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Neon Cyber Paddle** is a high-speed, kinetic arcade paddle battle studio built natively for Bun RAD Studio. Featuring responsive paddle spin deflection physics, 4 Arena Themes (*Cyber Neon*, *Synthwave Sunset*, *Matrix Grid*, *Solar Reactor*), collectible mid-arena Power-Up Orbs (*🛡️ Mega Paddle*, *🔥 Fireball Smash*, *🌀 Plasma Curve*, *⚡ Overclock*), a rotating center reactor ring, impact shockwaves, speed-reactive comet trails, live `RALLY` & `BALL SPEED` HUD badges, multi-tier AI opponents, and local 2-player multiplayer.

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
| ![Codecaine Neon Cyber Paddle Desktop](../../screenshots/apps/pong_desktop.png) | ![Codecaine Neon Cyber Paddle Responsive](../../screenshots/apps/pong_responsive.png) |

---

## 🕹️ Physics, Power-Up Orbs & Deflection Mechanics
- **Edge Spin Deflection**: Hitting the ball with the outer edges of the paddle introduces severe vertical spin, deflecting the ball at sharp, high-speed angles to outmaneuver opponents.
- **Paddle Momentum Acceleration**: Moving the paddle in the direction of the ball during impact increases velocity by 15%, delivering a power smash.
- **Collectible Power-Up Orbs** (toggleable in top bar):
  - `🛡️ Mega Paddle`: Expands your paddle height by 45% for 8 seconds.
  - `🔥 Fireball Smash`: Ignites the ball and boosts speed by 35%.
  - `🌀 Plasma Curve`: Applies a sinusoidal plasma curve to the ball's trajectory.
  - `⚡ Overclock`: Grants +50% paddle movement speed for 8 seconds.
- **Victory Race**: First player to score 11 points wins the match with a celebratory neon fanfare.

---

## ⌨️ Controls Reference

| Player | Up | Down |
| :--- | :--- | :--- |
| **Player 1 (Left Paddle)** | `W` | `S` |
| **Player 2 (Right Paddle / Local)** | `↑` Up Arrow | `↓` Down Arrow |
| **Pause Game** | `P` or `Escape` | — |
| **Toggle AI / 2-Player** | `M` | — |
| **Game Master FX HUD** | `Alt + G` | — |
| **Fullscreen** | `F` / `F11` | — |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
