# 🛸 Codecaine CyberCadet Pinball 2099 -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 60FPS 8x Sub-Stepped 2D Vector Pinball Physics & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:pinball]  •  [Headless Server: bun run applications/pinball_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberCadet Pinball 2099** is a high-voltage tribute to *3D Pinball for Windows – Space Cadet*, built natively for Bun RAD Studio. It features an 8x sub-stepped 60fps 2D vector physics engine with circle-vs-segment and circle-vs-circle collision resolution, kinematic flipper angular velocity transfer, 3 High-Voltage Pop Bumpers, Left/Right Slingshot Kickers, 3 Drop-Target Mission Lights, a Hyperspace Top Orbit Loop, a Wormhole Black Hole Kickout Well with 2-Ball Multiball, and Space Fleet Rank Progression (`Cadet` → `Ensign` → `Lieutenant` → `Commander` → `Captain` → `Fleet Admiral`).

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:pinball

# Launch headless server
bun run applications/pinball_studio.ts --server
```

---

## 🕹️ Gameplay Rules & Table Features
- **Spring Plunger Launch Lane**: Hold and release `Space` or `Down Arrow` (or the on-screen Plunger button) to compress the plasma spring and launch the ball into the orbital arch.
- **3 High-Voltage Pop Bumpers (`1000W`, `NOVA`, `CORE`)**: Flash and pulse on impact, awarding multiplied points and advancing your active Space Fleet mission.
- **Left & Right Slingshot Kickers**: High-restitution triangular kickers above the flippers that ricochet the ball across the playfield.
- **3 Drop-Target Mission Lights**: Light all 3 yellow cyber-targets along the upper-left bank to earn a 7,500-point bonus, advance your mission, and re-arm the Left Outlane Kickback laser!
- **Hyperspace Top Orbit Rollover Lanes (`A` • `B` • `C`)**: Light all three top lanes to permanently boost your score multiplier (`1x` up to `8x`).
- **Wormhole Black Hole Kickout Well**: Captures the ball inside its upper-left gravity vortex, awards an 8,000-point singularity bonus, and ejects **2-Ball Cyber Multiball**!
- **Space Fleet Rank Progression**: Climb from **Cadet** to **Ensign** (15,000), **Lieutenant** (45,000), **Commander** (95,000), **Captain** (175,000), and **Fleet Admiral** (300,000+).

---

## ⌨️ Keyboard & Mouse Shortcuts

| Action | Primary Key | Alternate Key / Mouse |
| :--- | :--- | :--- |
| **Left Flipper** | `Z` | `Left Arrow` / `A` / Left Canvas Click |
| **Right Flipper** | `/` | `Right Arrow` / `D` / Right Canvas Click |
| **Spring Plunger Launch** | `Space` (Hold & Release) | `Down Arrow` / Launch Button |
| **Table Nudge** | `X` | Deck Nudge Button |
| **Pause / Resume** | `P` | Header Pause Button |
| **New Game / Reset** | `R` | Header New Game Button |
| **Mute Synthesizer** | `M` | Header SFX Button |
| **Flight Manual / Help** | `H` / `?` | Header Help Button |
| **Game Master FX HUD** | `Alt + G` | — |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
