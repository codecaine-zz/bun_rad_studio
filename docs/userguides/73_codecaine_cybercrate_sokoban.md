# 📦 Codecaine CyberCrate Sokoban -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 100 Verified Chambers, Multi-Difficulty Winnable Random Generator, AI BFS Solver & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:sokoban]  •  [Headless Server: bun run applications/sokoban_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberCrate Sokoban** reimagines the 1982 Japanese warehouse box-pushing logic classic inside a neon cyberpunk cargo facility. Pilot the Cyber-Loader Drone to push glowing Quantum Crates onto every magenta Target Pressure Pad (`◎`) across **100 guaranteed-solvable campaign chambers (`001`–`100`)** plus an **Always-Winnable Procedural Random Chamber Generator** with 4 selectable difficulty tiers (**Easy**, **Medium**, **Hard**, **Expert**), assisted by a **Real-Time Corner Deadlock Detector**, Par Move tracking, **AI Hint (`H`) / Auto-Solve (`X`)**, and unlimited Move-by-Move Undo/Redo.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:sokoban

# Launch headless server
bun run applications/sokoban_studio.ts --server
```

---

## 🧠 Gameplay Rules & Modern Enhancements

### 1. Core Warehouse Pushing Rules
- Push every **Cyan Quantum Crate (`📦`)** onto a pulsing **Pink Target Pressure Pad (`◎`)**. When locked onto a target pad, the crate turns **Emerald Green**.
- The loader drone can only push **one crate at a time** into an empty space directly behind the crate, and **cannot pull** crates.

### 2. 100 BFS-Verified Solvable Campaign Chambers
- Includes **100 built-in solvable chambers** organized across four progressive difficulty tiers:
  - **Easy (`001`–`025` • Cadet Sector)**: 2–3 crates, open bays, Par 7–42.
  - **Medium (`026`–`050` • Engineer Sector)**: 3 crates, structural pillars, Par 18–55.
  - **Hard (`051`–`075` • Commander Sector)**: 4 crates, tight shunts, Par 24–72.
  - **Expert (`076`–`100` • Grandmaster Sector)**: 4–5 crates, deep labyrinths, Par 30–82.
- Filter the 100-chamber grid by tier (`ALL`, `EASY`, `MED`, `HARD`, `EXP`) and track your completion progress (`0 / 100`) persistently in `localStorage`.

### 3. 🎲 Always-Winnable Multi-Difficulty Random Chamber Generator (`[G]`)
- Choose your desired difficulty from the **Always-Winnable Generator** dropdown:
  - **🟢 Easy (Cadet • 2–3 Crates)**
  - **🔵 Medium (Engineer • 3 Crates)**
  - **🟣 Hard (Commander • 4 Crates)**
  - **🔴 Expert (Grandmaster • 5 Crates)**
- Press **`G`** (or click **`🎲 GENERATE WINNABLE CHAMBER (G)`**) to synthesize a brand-new procedural chamber on the fly using **Reverse-Pull Synthesis from a Solved State + Walk/Push Shortest-Path Optimization + Forward Replay Verification**.
- Every randomly generated chamber is **mathematically 100% guaranteed to be winnable**, starts with zero corner deadlocks, and includes a verified `solution` path so **`💡 HINT (H)`** and **`🤖 AUTO-SOLVE (X)`** work on every random chamber too!

### 4. Real-Time Corner Deadlock Detector & Live AI BFS Solver (`[H]` / `[X]`)
- **Corner Deadlock Alert**: Any crate pushed into a non-target wall corner immediately glows **Warning Amber** and displays a live deadlock banner so you can press **`Z`** to undo right away.
- **AI Hint (`[H]`) & Auto-Solve (`[X]`)**: Press **`H`** at any time for the AI solver to execute the next optimal winning move, or press **`X`** to watch the Cyber-Loader Drone automatically solve the entire chamber step-by-step.

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Arrow Keys` / `WASD` | Move Loader Drone / Push Adjacent Quantum Crate |
| `Click / Tap Canvas` | Step one tile toward the clicked direction |
| `G` | **Generate New Winnable Random Chamber** (at selected difficulty) |
| `H` | **AI Hint** (Computes & executes next optimal winning move) |
| `X` | **AI Auto-Solve** (Animates complete winning solution step-by-step) |
| `Z` | Unlimited Move-by-Move Undo |
| `Y` | Unlimited Move-by-Move Redo |
| `R` | Restart Current Chamber |
| `[` / `]` or `N` | Switch to Previous / Next Campaign Chamber (`1`–`100`) |
| `Space` / `Enter` | Advance to Next Chamber (or Next Random Chamber) after Victory |
| `M` | Mute / Unmute Web Audio Synthesizer |
| `?` | Open / Close Operations Manual Modal |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
