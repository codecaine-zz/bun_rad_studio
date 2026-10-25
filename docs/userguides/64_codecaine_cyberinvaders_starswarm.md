# 👾 Codecaine CyberInvaders: StarSwarm -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Space Invaders × Galaga Swarm AI, Destructible Bunkers & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:space_invaders]  •  [Headless Server: bun run applications/space_invaders_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberInvaders: StarSwarm** fuses the iconic 1978 *Space Invaders* formation march and destructible plasma bunkers with 1981 *Galaga* swooping dive-bomber attacks and Twin-Fighter Dual-Blasters. Built natively for Bun RAD Studio, it features 5 rows × 10 columns of distinct neon alien ships (`Commanders`, `Cruisers`, `Grunts`), 4 chunk-destructible Plasma Bunkers, a Red Mystery UFO that drops upgrade pods, an Overcharge Wave Cannon (`E`), and an accelerating 4-note bass march Web Audio synthesizer.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:space_invaders

# Launch headless server
bun run applications/space_invaders_studio.ts --server
```

---

## 🕹️ Gameplay Rules & Tactical Systems
- **5×10 StarSwarm Formation & Dive-Bombers**:
  - **Commanders (Top Row — `40 pts` / `80 pts` diving)**
  - **Cruisers (Middle Rows — `20 pts` / `40 pts` diving)**
  - **Grunts (Bottom Rows — `10 pts` / `20 pts` diving)**
  - As you thin the swarm, their horizontal march and 4-note synth tempo accelerate, while individual alien ships peel off in Galaga-style sinusoidal dive-bomber runs!
- **4 Destructible Plasma Bunkers**: Absorb incoming alien plasma fire and erode chunk-by-chunk on impact.
- **Red Mystery UFO & Upgrade Pods**: Flies across the upper sector for `300 bonus points` and drops a collectible pod:
  - **`2X` Twin-Fighter Pod**: Attaches a wingman fighter for Dual-Blaster rapid fire!
  - **`FIX` Shield Repair Pod**: Reconstructs all 4 Plasma Bunkers to 100% integrity!
- **Overcharge Wave Cannon (`E`)**: Every alien destroyed charges your combo meter (+8%). At 100%, press `E` to fire a full-height vertical Wave Cannon that vaporizes every invader and projectile in that column!

---

## ⌨️ Keyboard & Mouse Shortcuts

| Action | Primary Key | Alternate Key / Mouse |
| :--- | :--- | :--- |
| **Move Defender Left / Right** | `Left` / `Right Arrow` | `A` / `D` / `Mouse Move` |
| **Fire Plasma Blaster** | `Space` | `Left Click` |
| **Overcharge Wave Cannon** | `E` (at 100% Charge) | Bottom Bar Wave Cannon Button |
| **Pause / Resume** | `P` | Header Pause Button |
| **New Game / Reset** | `R` | Header New Game Button |
| **Mute Synthesizer** | `M` | Header SFX Button |
| **Defender Manual / Help** | `H` / `?` | Header Help Button |
| **Game Master FX HUD** | `Alt + G` | — |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
