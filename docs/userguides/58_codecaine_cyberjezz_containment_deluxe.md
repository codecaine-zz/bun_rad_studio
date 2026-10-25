# ⚛️ Codecaine CyberJezz Containment Deluxe -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Bidirectional Laser Containment & Flood-Fill Cyber-Circuit Engine + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:jezzball]  •  [Headless Server: bun run applications/jezzball_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberJezz Containment Deluxe** is a high-voltage cyberpunk remaster of the classic 1992 Windows Entertainment Pack *JezzBall*, engineered natively for Bun RAD Studio. Trap hyper-velocity plasma atoms inside a `40×28` containment matrix by firing bidirectional laser beams. Seal off empty quadrants to automatically flood-fill them with glowing cyber-circuitry, utilize **Cryo Slow-Mo (`E`)** and **Shielded Beams (`Q`)**, and capture at least **75%** of the arena to advance through increasingly intense reactor levels.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:jezzball

# Launch headless server
bun run applications/jezzball_studio.ts --server
```

---

## 🎮 Gameplay Rules & Tactical Mechanics

1. **Bidirectional Containment Beams**: Move the cursor over any uncaptured cell in the `40×28` reactor grid and `Left Click` (or press `Enter`) to fire a laser wall expanding simultaneously in both directions along the active axis (`Horizontal ━` or `Vertical ┃`).
2. **Axis Rotation**: Toggle your beam orientation at any time using `Right Click`, `Space`, or `R`. Both the HUD badge and the live canvas reticle indicate the active orientation.
3. **Beam Vulnerability**: If a bouncing plasma atom strikes a building laser beam before **both** ends lock into solid walls, the beam shatters, triggering a containment breach (`-1 Life`, screen shake, and particle burst).
4. **Automatic Quadrant Flood-Fill**: When a beam locks at both ends, any enclosed region containing **zero plasma atoms** is automatically captured and filled with glowing cyber-circuit tiles for massive bonus points.
5. **75% Clearance Target**: Reach **75% or higher** containment to clear the sector and advance to the next level (`+1 Plasma Atom` per level).
6. **Tactical Reactor Abilities**:
   - **Shielded Beam Charge (`Q`)**: Arm your next containment beam with an energy barrier that deflects **1 plasma atom impact** without shattering.
   - **Cryo Slow-Mo Charge (`E`)**: Inject liquid nitrogen into the grid, reducing plasma atom velocity by **65% for 5 seconds**.

---

## 🕹️ Controls Reference

| Action | Primary Control | Alternate Control |
| :--- | :--- | :--- |
| **Fire Containment Beam** | `Left Click` | `Enter` |
| **Toggle Beam Axis (`━` / `┃`)** | `Right Click` | `Space` or `R` |
| **Move Grid Reticle** | `Mouse Cursor` | `Arrow Keys` / `WASD` |
| **Activate Shielded Beam** | `Q` | Click **Shield (`Q`)** Button |
| **Activate Cryo Slow-Mo (5s)** | `E` | Click **Cryo (`E`)** Button |
| **Pause / Resume Simulation** | `P` | Click **Pause** Button |
| **New Game / Reset Reactor** | `N` | Click **New Game** Button |
| **Mute / Unmute Synthesizer** | `M` | Click **Audio** Button |
| **Game Master FX HUD** | `Alt + G` | — |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
