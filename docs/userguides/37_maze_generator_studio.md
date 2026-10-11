# 🌀 Cyberpunk Maze Generator & Solver -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Procedural Maze Graph Algorithms & A*/Dijkstra Solvers  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:maze]  •  [Headless Server: bun run applications/maze_generator_studio.ts --server]
```

---

## 🌟 Executive Overview
**Cyberpunk Maze Generator & Solver** is an interactive procedural labyrinth generation, pathfinding visualization, and exploration studio built natively for Bun RAD Studio. It provides live visual demonstrations of graph theory algorithms, dynamic neon particle trails, and interactive player navigation with optional fog-of-war.

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
- **Recursive Backtracker**: Produces long, winding corridors with deep solution paths.
- **Prim's Algorithm**: Generates short, highly branched mazes with numerous dead ends.
- **Kruskal's Algorithm**: Randomized minimum spanning tree algorithm creating balanced labyrinths.
- **Wilson's Algorithm**: Generates completely unbiased uniform spanning trees using loop-erased random walks.

### 2. Real-Time Pathfinding Solvers
- **A* Search (A-Star)**: Heuristic-driven shortest path finder using Manhattan distance ($f(n) = g(n) + h(n)$).
- **Dijkstra's Algorithm**: Exhaustive breadth-first wavefront exploration showing every visited node in glowing neon.

---

## ⌨️ Controls Reference
- **Interactive Player Movement**: `WASD` or `Arrow Keys`
- **Generate New Maze**: `N` or `Space`
- **Toggle AI Solver**: `S`
- **Clear Solution Path**: `C`
- **Fullscreen**: `F` / `F11`
