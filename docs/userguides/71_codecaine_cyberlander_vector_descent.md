# 🚀 Codecaine CyberLander: Vector Descent -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 1979 Vector Physics Simulator, Multi-World Gravity & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:lunar_lander]  •  [Headless Server: bun run applications/lunar_lander_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberLander: Vector Descent** is a 1979 Atari *Lunar Lander* precision vector physics simulator engineered natively for Bun RAD Studio. Navigate procedural jagged mountain ranges, manage propellant burn rates, monitor real-time telemetry (`VX`, `VY`, `DEG`, `ALT`), and touch down softly on glowing multiplier Landing Pads (`1x`, `2x`, `3x`, and narrow canyon `5x`) across three distinct planetary gravity environments.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:lunar_lander

# Launch headless server
bun run applications/lunar_lander_studio.ts --server
```

---

## 🪐 Gameplay Rules & Telemetry Systems

### 1. Safe Touchdown Parameters
To complete a sector landing without destroying the lunar excursion module, both landing skids must contact a flat glowing **Landing Pad** while satisfying all three flight telemetry thresholds:
- **Vertical Descent Speed (`VY`)**: Must be **`< 2.20 m/s`** (displays green when safe, red when descending too rapidly).
- **Horizontal Drift Speed (`VX`)**: Must be **`< 1.60 m/s`**.
- **Attitude Tilt Angle (`DEG`)**: Must be within **`±10.0°`** of vertical (`0°`).

### 2. Multiplier Pads & Fuel Depots
- Each sector generates four flat landing pads marked **`1x`**, **`2x`**, **`3x`**, and a narrow deep-canyon **`5x`** pad.
- Pads labeled **`⛽ FUEL`** act as propellant depots, replenishing **+38% Fuel** upon a successful touchdown.
- When descending below `165m` AGL, an automatic **2× Radar Proximity Magnifier PIP** opens in the upper-right corner of the viewport.

### 3. Selectable Gravity Worlds
- **🌙 Luna (`1.62 m/s²`)**: Classic vacuum lunar descent with zero atmospheric crosswind.
- **🔴 Mars (`3.71 m/s²` + Dust Wind)**: High-gravity red canyon descent with shifting horizontal dust-storm gusts.
- **🪐 Titan Orbital Station (`0.80 m/s²` + Moving Pads)**: Low-gravity orbital environment featuring horizontally oscillating landing platforms.

### 4. Emergency Retro-Stabilizer (`E`)
- Once per mission, pressing **`E`** fires the **Emergency Retro-Stabilizer**, automatically leveling the lander's attitude angle toward `0°` and dampening both vertical and horizontal velocities.

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Up Arrow` / `W` / `Space` | Engage Variable Main Rocket Thruster |
| `Left Arrow` / `A` | Rotate Attitude Counter-Clockwise (Left) |
| `Right Arrow` / `D` | Rotate Attitude Clockwise (Right) |
| `E` | Trigger Emergency Retro-Stabilizer (1× per mission) |
| `1` / `2` / `3` | Switch Gravity World (Luna / Mars / Titan) |
| `N` / `R` | Start New Campaign / Retry Sector |
| `P` | Pause / Resume Flight Telemetry |
| `M` | Mute / Unmute Web Audio Vector Synthesizer |
| `?` / `H` | Open / Close Flight Manual Modal |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
