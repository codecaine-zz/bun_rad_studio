# 👾 Codecaine Adventures of Caine Remaster -- Complete Production User Guide

```
Version: 4.9.0  •  Engine: Native HTML5 Canvas, Web Audio Chiptune Synthesizer & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:lolo]  •  [Headless Server: bun run applications/lolo_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Adventures of Caine Remaster** is a AAA procedural logic puzzle arcade game built natively for Bun RAD Studio. Set inside a dark cyberpunk universe, it combines 100 mathematical logic chambers, autonomous hostile drone AI, temporal rewinding, an AI holographic pathfinding solver, an in-game level editor, and the **Codecaine Game Master FX & Post-Processing Engine (`Alt+G`)**.

You play as **CAINE** (Cybernetic Autonomous Infiltration & Neural Operative), navigating the impenetrable **Cyber-Citadel Megastructure** to decrypt memory cores, outwit rogue sentry algorithms, and rescue **Princess Caina**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:lolo

# Launch headless server
bun run applications/lolo_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Adventures of Caine Desktop](../../screenshots/apps/lolo_desktop.png) | ![Adventures of Caine Responsive](../../screenshots/apps/lolo_responsive.png) |

---

## 🕹️ Core Objectives & Operational Sequence

1. **Collect All Heart Framers (Memory Cores)**:
   - Each chamber contains glowing Heart Framers. You must collect every one on the grid to unlock the central chest.
   - **Plasma Ammo Batteries**: Certain Heart Framers contain compressed plasma batteries granting **2 Plasma Stasis Blaster shots**. Conserve shots carefully!
2. **Decrypt the Jewel Chest (Quantum Key Recovery)**:
   - Collecting the final Heart Framer opens the Jewel Chest.
   - Stepping onto the open chest extracts the decryption key, immediately freezes all hostiles into permanent harmless stasis, and unlocks the extraction gate.
3. **Evacuate Through the Warp Gate**:
   - Exit through the opened door along the upper wall to advance to the next chamber.

---

## 👾 Hostile Threat Bestiary (9 Drone Classes)

| Drone Class | Identity | Visual | Behavior & Countermeasures |
| :--- | :--- | :--- | :--- |
| **Snakey** | Static Repulsor | Green Serpent | Passive sentinel. Does not move or attack, but blocks passages. Shoot to encase into pushable orb and use as a shield or bridge. |
| **Gol** | Heat Plasma Sentry | Red Dragon | Dormant until the final Heart Framer is collected. Once awake, fires fatal high-speed fireballs if you cross its direct line of sight. |
| **Skull** | Skeletal Stalker | Brown Bone Drone | Remains dormant until the Jewel Chest is unlocked, then awakens and relentlessly charges directly at Caine. |
| **Alma** | Rolling Sentry | Red Armadillo | Actively patrols corridors and rolls toward Caine at high speed. Block its movement with emerald prisms or orbs. |
| **Medusa** | Stare Cannon | Gray Gorgon | Immobile turret that instantly incinerates Caine with lethal line-of-sight laser beams. Must be obstructed with blocks or orbs. |
| **Don Medusa** | Kinetic Laser Sentry | Green Spike Drone | Patrols back and forth along a fixed axis, firing lethal line-of-sight lasers in all 4 cardinal directions. |
| **Leeper** | Fatigue Parasite | Green Hopper | Hops toward Caine. If it touches Caine, it falls permanently asleep, turning into an immovable obstacle that can trap you if mismanaged. |
| **Rocky** | Inertial Bulldozer | Gray Golem | Charges forward and pushes Caine against obstacles or traps him in corners. Slow-moving and easily dodged. |
| **Overlord Core** | Citadel Mainframe | Rogue Core | The supreme Citadel boss requiring multi-stage puzzle mechanics and precise timing to defeat. |

---

## ⌨️ Desktop Keyboard & Gamepad Controls

| Key / Input | Category | Tactical Function |
| :--- | :--- | :--- |
| **WASD** / **Arrow Keys** | Movement | Move Caine; push alloy blocks, emerald prisms, and stasis orbs along paths. |
| **Space** / **X** | Combat | **Plasma Stasis Blaster**: 1st shot turns enemy into pushable orb; 2nd shot disintegrates it. |
| **Z** | Tactical | **Temporal Rewind (Undo)**: Rewinds time by 1 move with unlimited memory and zero penalty. |
| **R** | Tactical | **Chamber Reset**: Resets the current chamber to initial layout. |
| **H** | Intelligence | **Holographic Ghost Guide**: Toggles AI mathematical shortest-path solver. |
| **M** | Navigation | **Sector Map**: Opens the 5-sector tactical campaign overview. |
| **L** | Navigation | **Level Selector**: Jump to any of the 100 unlocked operations. |
| **E** | Creative | **Architect Studio**: Launch built-in custom level editor. |
| **D** | Challenge | **Daily Cyber Hack**: Loads globally synchronized daily puzzle. |
| **O** | Procedural | **Random Synthesis Lab**: Generates mathematically verified random chambers. |
| **Alt + G** | Visual FX | Toggle **Codecaine Game Master FX** shader & particle HUD dock. |
| **F1** or **?** | System | Open in-game tactical field manual. |
| **F11** or **F** | Global | Toggle borderless fullscreen display. |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
