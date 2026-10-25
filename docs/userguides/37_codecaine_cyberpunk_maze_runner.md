# 🌀 Codecaine Cyberpunk Maze Runner -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 5 Graph Theory Generators, A*/Dijkstra/BFS Solvers & Game Master FX (Alt+G)  •  Dependencies: 0  •  Works offline (fonts load online, with system fallback)
Launchers: [Desktop GUI: bun run app:maze]  •  [Headless Server: bun run applications/maze_generator_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Cyberpunk Maze Runner** is an interactive procedural labyrinth workstation, pathfinding visualization platform, and exploration arcade game built natively for Bun RAD Studio. It provides mathematical demonstrations of 5 graph theory algorithms, 3 real-time pathfinding solvers, high-DPI neon canvas rendering with circuit glow, ambient cyber drone synthesizer, daily challenges, telemetry records, and the **Codecaine Game Master FX & Post-Processing Engine (`Alt+G`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:maze

# Launch headless server
bun run applications/maze_generator_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Maze Generator Desktop](../../screenshots/apps/maze_generator_desktop.png) | ![Maze Generator Responsive](../../screenshots/apps/maze_generator_responsive.png) |

---

## 🧭 Procedural Algorithms & Solvers

### 1. Maze Generation Algorithms
- **Recursive Backtracker (DFS)**: Produces long, winding corridors with deep solution paths and high bottleneck complexity.
- **Randomized Prim's**: Generates short, highly branched mazes with numerous dead ends and high fractal density.
- **Randomized Kruskal's**: Balanced spanning tree built via disjoint set edge merges and minimum spanning tree logic.
- **Wilson's Algorithm**: Generates completely unbiased uniform random spanning trees using loop-erased random walks.
- **Braided Labyrinth**: Removes dead ends by selectively punching loop connections, creating multiple viable paths.

### 2. Real-Time Pathfinding Solvers
- **A* Search (A-Star)**: Heuristic-driven shortest path finder using Manhattan distance ($f(n) = g(n) + h(n)$).
- **Dijkstra's Algorithm**: Exhaustive uniform-cost wavefront expansion showing every visited node in glowing neon.
- **Breadth-First Search (BFS)**: Unweighted level-order exploration exploring radially from the player position.

---

## 🕹️ Exploration Modes & Gameplay
- **Classic**: Pure exploration at your own pace with move counting and personal best tracking.
- **Time Attack**: High-stress neural countdown timer with audible warning ticks under 10 seconds.
- **Fog of War**: Deep darkness with a rotating sonar sweep illuminating only nearby corridors.
- **AI Solver**: Automated real-time step navigation watching algorithms explore and navigate to the exit portal.
- **Daily Challenge (D)**: Synchronized calendar-day puzzle identical across all users on that date.
- **Replay (R)**: Restarts the exact same labyrinth from scratch with 0 steps and reset timer.
- **Pause (P / Space)**: Real timer freeze with backdrop blur overlay; also pauses on modal open or window blur.
- **Give Up (G)**: Two-click confirmation reveals the optimal solution path and logs mission surrender.
- **Telemetry & Stats (T)**: Tracks expeditions, win rate, total steps, shards found, and best times/steps per mode and size (with 2-click reset).
- **Energy Shards**: Scattered throughout dead-end corridors; collecting them replenishes neural hint charges.
- **Persistence**: Preferences and telemetry persist across runs in `.maze_generator_state.json` in the launch folder.

---

## ⌨️ Controls Reference
- **Player Movement**: `W` `A` `S` `D` or `Arrow Keys`
- **New Labyrinth (N)**: Generates a fresh random maze with new seed
- **Replay Labyrinth (R)**: Restarts current maze from start with same seed
- **Daily Labyrinth (D)**: Loads synchronized daily challenge
- **Pause / Resume (P / Space)**: Freezes game session and timer
- **Neural Hint (H)**: Highlights optimal path (consumes 1 hint charge)
- **Give Up (G)**: 2-click confirm reveals solution and logs surrender
- **Telemetry & Stats (T)**: Opens mission records and performance metrics
- **Toggle Sound (M)**: Mutes or unmutes Web Audio sound effects
- **Help (?)**: Opens system protocols and rules
- **Close / Unpause (Esc)**: Closes open modals or resumes game
- **Fullscreen (F / F11)**: Toggles distraction-free fullscreen mode

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
