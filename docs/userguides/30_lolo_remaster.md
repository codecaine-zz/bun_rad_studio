# 🏰 Adventures of Lolo: Cyberpunk Remaster -- Complete Production User Guide

```
Version: 4.8.0  •  Engine: Native HTML5 Canvas & Web Audio Chiptune Synthesizer  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:lolo]  •  [Headless Server: bun run applications/lolo_studio.ts --server]
```

---

## 🌟 Executive Overview
**Adventures of Lolo: Cyberpunk Remaster** is a AAA procedural logic puzzle arcade game built natively for Bun RAD Studio. Reimagining the classic HAL Laboratory / Nintendo puzzle series inside a dark cyberpunk universe, it combines 100 mathematical logic chambers, autonomous hostile drone AI, temporal rewinding, an AI holographic pathfinding solver, and an in-game level editor.

You play as **LOLO** (Low-latency Optical Logic Operative), navigating the impenetrable **Eggerland Megastructure Citadel** to decrypt memory cores, outwit rogue sentry algorithms, and rescue **Princess Lala**.

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
| ![Lolo Remaster Desktop](../../screenshots/apps/lolo_desktop.png) | ![Lolo Remaster Responsive](../../screenshots/apps/lolo_responsive.png) |

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
| **Snakey** | Static Repulsor | Green Serpent | Passive sentinel. Does not move or attack, but blocks passages. Shoot to encase into pushable egg and use as a shield or bridge. |
| **Gol** | Heat Plasma Sentry | Red Dragon | Dormant until the final Heart Framer is collected. Once awake, fires fatal high-speed fireballs if you cross its direct line of sight. |
| **Skull** | Skeletal Stalker | Brown Bone Drone | Remains dormant until the Jewel Chest is unlocked, then awakens and relentlessly charges directly at Lolo. |
| **Alma** | Rolling Sentry | Red Armadillo | Actively patrols corridors and rolls toward Lolo at high speed. Block its movement with emerald prisms or eggs. |
| **Medusa** | Stare Cannon | Gray Gorgon | Immobile turret that instantly incinerates Lolo with lethal line-of-sight laser beams. Must be obstructed with blocks or eggs. |
| **Don Medusa** | Kinetic Laser Sentry | Green Spike Drone | Patrols back and forth along a fixed axis, firing lethal line-of-sight lasers in all 4 cardinal directions. |
| **Leeper** | Fatigue Parasite | Green Hopper | Hops toward Lolo. If it touches Lolo, it falls permanently asleep, turning into an immovable obstacle that can trap you if mismanaged. |
| **Rocky** | Inertial Bulldozer | Gray Golem | Charges forward and pushes Lolo against obstacles or traps him in corners. Slow-moving and easily dodged. |
| **King Egger** | Citadel Mainframe | Rogue Core | The supreme Citadel boss requiring multi-stage puzzle mechanics and precise timing to defeat. |

---

## ⌨️ Desktop Keyboard & Gamepad Controls

| Key / Input | Category | Tactical Function |
| :--- | :--- | :--- |
| **WASD** / **Arrow Keys** | Movement | Move Lolo; push alloy blocks, emerald prisms, and eggs along paths. |
| **Space** / **X** | Combat | **Plasma Stasis Blaster**: 1st shot turns enemy into pushable egg; 2nd shot disintegrates it. |
| **Z** | Tactical | **Temporal Rewind (Undo)**: Rewinds time by 1 move with unlimited memory and zero penalty. |
| **R** | Tactical | **Chamber Reset**: Resets the current chamber to initial layout. |
| **H** | Intelligence | **Holographic Ghost Guide**: Toggles AI mathematical shortest-path solver. |
| **M** | Navigation | **Sector Map**: Opens the 5-sector tactical campaign overview. |
| **L** | Navigation | **Level Selector**: Jump to any of the 100 unlocked operations. |
| **E** | Creative | **Architect Studio**: Launch built-in custom level editor. |
| **D** | Challenge | **Daily Cyber Hack**: Loads globally synchronized daily puzzle. |
| **O** | Procedural | **Random Synthesis Lab**: Generates mathematically verified random chambers. |
| **F1** or **?** | System | Open in-game tactical field manual. |
| **F11** or **F** | Global | Toggle borderless fullscreen display. |
