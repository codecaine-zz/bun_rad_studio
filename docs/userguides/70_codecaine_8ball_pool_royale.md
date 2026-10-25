# 🎱 Codecaine 8-Ball Pool Royale: Cyber Billiards Suite -- Complete Production User Guide

```
Version: 3.0.0  •  Engine: 10-Mode Pool/Snooker/Billiards Simulator, 8x Sub-Stepped 3D Jump & Masse Physics + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:pool]  •  [Headless Server: bun run applications/pool_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine 8-Ball Pool Royale: Cyber Billiards Suite** is a tournament-grade 10-discipline pool, snooker, and artistic billiards simulator featuring an **8x sub-stepped rigid-body physics engine** (`SUBSTEPS = 8`), **True Cue Elevation (`0°–75°`)** for **Curved Masse Shots** and **3D Airborne Jump Shots**, **4-Tier Aim Guide Realism**, **Interactive Pocket Calling (`🎯 Call Pocket [C]`)**, an **Interactive Blue Chalk Cube (`🟦 Chalk [K]`)**, **5 Championship Felt Themes**, **4 Pro Cue Sticks**, and **Instant Shot Replay (`🎥 Replay [V]`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:pool

# Launch headless server
bun run applications/pool_studio.ts --server
```

---

## 🎮 All 10 Pool, Snooker & Billiards Game Modes (`#modeSelect`)

1. **🎱 WPA 8-Ball Championship (`8ball`)**: Open table after the break until a legal pot assigns **Solids (`1–7`)** vs **Stripes (`9–15`)**. Clear your group and legally sink the `8-Ball` into your called pocket to win.
2. **💎 World 9-Ball Tour (`9ball`)**: 1–9 Diamond rack. Always contact the **lowest-numbered ball** on the table first (highlighted with a pulsing gold ring). Includes a post-break **🔀 Push Out** option, and sinking the `9-Ball` on any legal stroke/combination wins immediately.
3. **🔟 Pro 10-Ball Call-Shot (`10ball`)**: 1–10 Triangle rack (`10-Ball` in center). Must hit the lowest ball first; early `10-Ball` combinations re-spot on the foot spot unless the pocket was called (`🎯 Called Pocket`)!
4. **📈 14.1 Continuous Straight Pool (`straight`)**: Race to **25 Points** where any legal pot scores `+1 pt`. When 14 object balls are pocketed and only 1 remains on the felt, the 14 pocketed balls **automatically re-rack in a headless triangle** so you can continue your uninterrupted high-run break!
5. **🕳️ One-Pocket Hustler Showdown (`onepocket`)**: Race to **5 Points**. Player 1 owns the **Bottom-Left Corner Pocket** (Cyan ring) and Player 2/AI owns the **Bottom-Right Corner Pocket** (Gold ring). Balls dropped into the 4 neutral pockets re-spot on the foot spot!
6. **⚔️ 3-Group Cut-Throat Pool (`cutthroat`)**: Player 1 shields balls `1–5` while eliminating `6–15`; Player 2/AI shields `6–10`. Last player with surviving shield balls wins!
7. **🔴 6-Red Mini-Snooker Championship (`snooker`)**: Rack 6 Reds (`1 pt` each) below the Pink spot plus all 6 Snooker Colors on their authentic spots (`Yellow 2`, `Green 3`, `Brown 4` on the balk-line "D", `Blue 5`, `Pink 6`, `Black 7`). Alternate `RED (1 pt)` → `ANY COLOR (2–7 pts, re-spotted while Reds remain)` → then clear the Colors in ascending sequence (`2 → 3 → 4 → 5 → 6 → 7`)!
8. **📐 Bank Pool Royale (`bankpool`)**: Race to **5 Points**. A pocketed ball **only counts if it banked off at least 1 cushion** (`ball.cushionHitsThisShot >= 1`) or was kicked via a rail before contact! Direct unbanked pots re-spot on the foot spot.
9. **⚡ 60-Second Speed Pool Blitz (`speed`)**: High-tempo time attack with `+5s` bonus time per potted ball and an escalating **Combo Multiplier**.
10. **🎪 12-Stage Artistic Trick Shot Vault (`trick`)**: Step through 12 curated trick shot challenges (`◀ Stage X/12 ▶`) including *Classic Combo*, *Cross-Side Bank*, *Two-Rail Kick Escape*, *Full-Table Backspin Draw*, *Extreme Masse Curve Around Blocker*, *Airborne Jump Shot Over Blocker*, *4-Ball Butterfly Cluster Split*, *Three-Cushion Carom Kiss*, *Frozen Rail Nurse*, *Double-Bank Z-Shot*, *5-Ball Domino Chain*, and *Golden 8-Ball Crown Finale*.

---

## 🌀 Cue Elevation (`0°–75°`), Masse Curves, Airborne Jumps & 4-Tier Guides

- **Curved Masse Shots (`15°–44° Elevation` + Left/Right Spin)**: Raising `#elevationSlider` into the Masse zone while applying side English bends the cue ball's trajectory around blocking balls and renders a **purple curved trajectory preview arc**.
- **3D Airborne Jump Shots (`45°–75° Elevation` + `≥45% Power`)**: Elevating the cue to `45°+` launches the cue ball into the air (`ball.z > 0`, `ball.vz`) with a dynamic ground shadow so it physically leaps over obstructing balls!
- **4-Tier Aim Guide Selector (`#guideModeSelect`)**:
  - `🟢 Guide: Pro Laser` (Full Ghost Ball + Cushion Bounce Reflection + Target/Tangent Lines)
  - `🔵 Guide: Club` (Ghost Ball + Short Tangent)
  - `🟣 Guide: Hustler` (Short Aim Line Only)
  - `🔴 Guide: Purist Sim` (No Aim Lines + Realistic Cue Squirt & Throw Physics)

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Mouse Move` | Aim the custom pro cue stick and Ghost-Ball laser sight |
| `Left Click & Drag Back` / `Space` | Pull back cue stick (or hold `Space`) and release to strike |
| `Click Any Pocket` / `C` | **Call Target Pocket (`🎯 CALLED`)** for `+$250` Called-Shot bonus |
| `K` | **Chalk Cue Tip (`🟦 100% Grip`)** to prevent miscues on heavy English |
| `E` | Cycle Cue Elevation presets (`0° Level` → `32° Masse` → `55° Jump`) |
| `Q` / `◀ Aim ▶` | Micro-adjust aim angle in `0.1°` increments |
| `V` | **Instant Shot Replay (`🎥 Replay`)** of the most recent stroke |
| `R` | Rack a fresh frame in the active discipline |
| `M` | Mute / Unmute Procedural Web Audio Foley Synthesizer |
| `?` / `Esc` | Open or close the 10-Mode Billiards Encyclopedia modal |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
