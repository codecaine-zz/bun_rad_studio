# 💾 Codecaine CyberChip's Labyrinth -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 1989 Tile Puzzle Gauntlet, Procedural Sector Generator & Unlimited Undo + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:chips_challenge]  •  [Headless Server: bun run applications/chips_challenge_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberChip's Labyrinth** is a neon-infused tribute to the legendary 1989/1991 Windows Entertainment Pack puzzle game *Chip's Challenge*, built natively for Bun RAD Studio. Navigate 8 handcrafted puzzle sectors plus an infinite **Procedural Level Generator**, collect every **Quantum Microchip (`💾`)** to unlock the **Socket Gate**, and master classic tile mechanics including **Color-Coded Keys & Doors**, **Water Trenches & Flippers**, **Fire Plasma & Fire Boots**, **Ice Slides & Ice Cleats**, **Force Conveyors & Suction Boots**, **Pushable Alloy Blocks** (which form bridges over water!), **Patrolling Sentry Bugs**, and **Unlimited Move Undo (`Z`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:chips_challenge

# Launch headless server
bun run applications/chips_challenge_studio.ts --server
```

---

## 🎮 Gameplay Rules & Tile Mechanics

1. **Quantum Microchips (`💾`) & Socket Gate**: Collect all required Microchips in the sector to unlock the **Socket Gate**, then step onto the **Exit Portal** to advance.
2. **Color-Coded Keys & Doors**:
   - **Red, Blue, and Yellow Keys** unlock their matching doors (consuming 1 key per door).
   - **Green Master Key** unlocks all Green Doors permanently without being consumed.
3. **Elemental Hazards & Cyber-Boots**:
   - **Water Trenches (`🌊`)**: Fatal unless you have equipped **Flippers (`🏊`)**—or push an **Alloy Block** into the water to build a solid bridge!
   - **Fire Plasma (`🔥`)**: Fatal unless you have equipped **Fire Boots (`🥾`)**.
   - **Cryo Ice (`🧊`)**: Causes uncontrolled sliding in your movement direction until hitting an obstacle, unless you have equipped **Ice Cleats (`⛸️`)**.
   - **Force Conveyors (`⏩`)**: Automatically propels you along the conveyor arrow unless you have equipped **Suction Boots (`🧲`)**.
4. **Pushable Alloy Blocks & Sentry Bugs**:
   - Push **Alloy Blocks** to clear paths, block patrolling **Sentry Bugs**, or fill **Water Trenches** to form walkable floor bridges.
5. **Unlimited Undo (`Z`)**: Rewind any mistake step-by-step at any time—even after a fatal hazard!

---

## 🕹️ Controls Reference

| Action | Primary Control | Alternate Control |
| :--- | :--- | :--- |
| **Move / Push Block / Slide** | `Arrow Keys` | `WASD` or Click Adjacent Tile |
| **Undo Last Move (Unlimited)** | `Z` | `Backspace` or **Undo** Button |
| **Restart Current Sector** | `R` | Click **Restart** Button |
| **Generate Procedural Sector** | `G` | Click **Procedural Lab** Button |
| **Previous / Next Sector** | `[` / `]` | Level Selector Dropdown |
| **Pause / Resume Timer** | `P` | Click **Pause** Button |
| **Mute / Unmute Synthesizer** | `M` | Click **Audio** Button |
| **Game Master FX HUD** | `Alt + G` | — |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
