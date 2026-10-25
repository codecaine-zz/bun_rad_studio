# 🔮 Codecaine CyberMarble Madness: Isometric Gravity Odyssey -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 3D Isometric Heightmap & Slope Gravity Engine, 8 Game Modes, 4 Marble Chassis & Procedural Web Audio + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:marble_madness]  •  [Headless Server: bun run applications/marble_madness_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberMarble Madness: Isometric Gravity Odyssey** is a modern homage to Atari's 1984 *Marble Madness*, *Marble Blast Ultra*, and *Super Monkey Ball*. Powered by a true 3D isometric heightmap and surface-gradient gravity engine `(dz/dx, dz/dy)`, every ramp, half-pipe, tightrope, undulating wave floor, springboard jump pad, ice slick, acid puddle, and moving elevator applies authentic downhill acceleration, airborne trajectories, and glass-shatter impact physics.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:marble_madness

# Launch headless server
bun run applications/marble_madness_studio.ts --server
```

---

## 🎮 8 Playable Game Modes (`[1]`–`[8]`)

### 1. 🏆 Classic 1984 6-Race Odyssey (`Practice → Beginner → Intermediate → Aerial → Silly → Ultimate`)
- Conquer all 6 iconic courses against a rolling countdown timer where leftover seconds carry over as bonus time!
- Survive **Black Steel Hunter Marbles**, **Green Marble-Muncher Worms**, **Acid Puddles**, **Thwomp Piston Crushers**, **Undulating Sine-Wave Floor Tiles**, **Vacuum Tubes**, and **Uphill Reversed-Gravity Ramps** in the Silly Race.

### 2. 💎 Marble Blast Gem Hunt (`Collect All Prism Gems + Power-Ups`)
- Collect every floating **3D Prism Gem (`💎`)** across multi-tiered sky islands to unlock the glowing **Goal Pad**.
- Trigger Marble Blast power-ups with **`[E]`**: **`🚀 Super Jump`**, **`⚡ Super Speed`**, **`🚁 Gyrocopter Blade (5s Air Glide)`**, **`🧲 Shock Absorber`**, and **`⏳ Time Travel (+5s Clock Freeze)`**.

### 3. 🏗️ Endless Procedural Sky-Course Architect (`[G]` New Course)
- Procedurally generates guaranteed-connectable isometric ramp/bridge/tightrope courses across 4 selectable difficulty tiers (`🟢 Novice`, `🔵 Tour`, `🟣 Expert`, `🔴 Insane Tightrope`).

### 4. 📐 Tilt Labyrinth World (`Super Monkey Ball Board Tilt`)
- Your directional inputs physically tilt the entire isometric course's **Pitch & Roll angles (`±16°`)**, tracked by a live **2D Bubble Level Inclinometer HUD**!

### 5. 💥 Cyber Sumo Bumper Royale (`Knock Rivals Off the Hex Plateau`)
- Battle 4 aggressive **Steel Rival Marbles** on an elevated isometric hex arena with pinball bumpers and a rechargeable **`[E]` Shockwave Repulsor**.

### 6. ⏱️ Speedrun Time Trial + Ghost Marble Replay
- Race the clock while a translucent **Cyan Ghost Marble** replays your fastest personal-best trajectory in real time!

### 7. 👁️ Boss Course: The Obsidian Colossus
- Ascend a spiral fortress while the **Obsidian Sentinel Core** fires expanding laser shockwaves and dispatches hunter marbles down the chutes. Smash the 3 power nodes to shatter the boss!

### 8. 👥 2-Player Dual-Marble Race (`P1 WASD` vs `P2 Arrows`)
- Simultaneous local 2-player race where **Player 1 (Cyan Marble, `WASD`)** and **Player 2 (Crimson Marble, `Arrow Keys`)** battle bumper-to-bumper to the Goal Pad!

---

## ⚙️ 4 Selectable Marble Physics Chassis

- **🔮 Cyber Glass**: Balanced grip, crisp downhill roll, and agile steering.
- **⚙️ Heavy Chrome Steel**: High mass that smashes **Black Steel Hunter Marbles** off ledges and resists high-altitude shatter impacts.
- **🏀 Super-Rubber**: Shatter-proof high-elasticity chassis with `+25%` Gyro-Hop height and lively bumper rebounds.
- **❄️ Plasma Hover-Orb**: Ultra-low friction glider with maximum top speed across ramps and ice slicks.

---

## 🕹️ Keyboard & Trackball Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `W / A / S / D` or `Arrow Keys` | Roll marble in isometric screen directions (or tilt board in Mode 4) |
| `Mouse Drag / Trackball Flick` | Click & drag anywhere on the canvas like an arcade trackball |
| `Spacebar` | **Gyro-Hop Jump** (leap chasms, acid pools, and shockwaves) |
| `Shift` | **Turbo Overdrive Boost** (drains rechargeable boost capacitor) |
| `E` | Activate Equipped Power-Up (`Super Jump`, `Gyrocopter`, `Shockwave`, etc.) |
| `1` – `8` | Quick-switch between the 8 Game Modes |
| `G` | Generate New Procedural Course (or advance stage) |
| `R` | Instant Restart Current Stage / Race |
| `M` | Mute / Unmute Procedural Web Audio Synthesizer |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
