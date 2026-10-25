# ☄️ Codecaine VoidVector Asteroids Deluxe -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 60FPS Neon Vector Geometry, Newtonian Thrust & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:asteroids]  •  [Headless Server: bun run applications/asteroids_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine VoidVector Asteroids Deluxe** is a neon-drenched remaster of Atari's 1979 vector arcade classic *Asteroids*, engineered natively for Bun RAD Studio. Featuring true Newtonian inertia thrust, glowing vector line-segment shatters, a rechargeable energy shield, emergency hyperspace warp, Large & Small Hunter-Seeker UFO Saucers, collectible Weapon Power-Up Orbs (`Twin Spread Shot`, `Rapid Pulse`, `Rear Tailgun`), and an accelerating two-tone heartbeat Web Audio synthesizer.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:asteroids

# Launch headless server
bun run applications/asteroids_studio.ts --server
```

---

## 🕹️ Gameplay Rules & Vector Systems
- **Asteroid Shatter Chain**: Large jagged polygon boulders (`20 pts`) split into 2 Medium boulders (`50 pts`), which split into 2 Small boulders (`100 pts`) with glowing vector line-segment shatters.
- **Hunter-Seeker UFO Saucers**:
  - **Large Saucer (`200 pts`)**: Traverses the sector firing random plasma bolts.
  - **Small Sharpshooter Saucer (`1,000 pts`)**: Locks onto your vector interceptor's coordinates with targeted fire.
- **Weapon Power-Up Orbs**: Destroying any UFO drops a glowing `ORB` (+500 pts) that upgrades your primary cannon for 12 seconds with **Twin Spread Shot**, **Rapid Pulse**, or **Rear Tailgun**, while restoring 100% Shield Energy.
- **Rechargeable Energy Shield (`Shift` / `S`)**: Absorbs enemy plasma bolts and deflects asteroid collisions while energy remains.
- **Hyperspace Quantum Warp (`H` / `E`)**: Teleports your interceptor to random sector coordinates with brief arrival invulnerability.

---

## ⌨️ Keyboard & Mouse Shortcuts

| Action | Primary Key | Alternate Key / Mouse |
| :--- | :--- | :--- |
| **Rotate Left / Right** | `Left` / `Right Arrow` | `A` / `D` |
| **Newtonian Thrust** | `Up Arrow` | `W` |
| **Fire Plasma Cannon** | `Space` | `Left Click` (Aims & Fires) |
| **Rechargeable Energy Shield** | `Shift` (Hold) | `S` (Hold) |
| **Hyperspace Warp** | `H` | `E` |
| **Pause / Resume** | `P` | Header Pause Button |
| **New Game / Reset** | `R` | Header New Game Button |
| **Mute Synthesizer** | `M` | Header SFX Button |
| **Pilot Briefing / Help** | `?` / `F1` | Header Help Button |
| **Game Master FX HUD** | `Alt + G` | — |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
