# 🟧 Codecaine CyberCube Hopper -- Complete Production User Guide

```
Version: 2.0.0  •  Engine: Isometric 3D Pyramid Renderer, Coily AI & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:qbert]  •  [Headless Server: bun run applications/qbert_studio.ts --server]
```

---

## 🌟 Executive Overview

**Codecaine CyberCube Hopper** brings the iconic 1982 isometric pyramid action of *Q\*bert* into the Codecaine Cyberpunk Arcade Suite. Hop diagonally across a 7-row, 28-cube floating isometric pyramid to flip every top surface to the target neon color while outsmarting **Coily the Purple Cyber-Snake**, dodging **Red Hazard Orbs**, intercepting **Slick**, and riding **Spinning Escape Discs** back to the apex.

---

## 🚀 Quick Start & Launch

```bash
# Launch desktop application window
bun run app:qbert

# Launch headless local HTTP server (for browser gameplay)
bun run applications/qbert_studio.ts --server
```

---

## 🎮 Gameplay Rules & Pyramid Entities

1. **Flipping the 28-Cube Isometric Pyramid**:
   - Landing on an unflipped cube changes its top diamond face to the level's **Target Color** (`+25 pts`).
   - Flipping all 28 cubes completes the level (`+1,000 pts` + `100 pts` per unused Spinning Escape Disc).
2. **Coily the Purple Cyber-Snake & Spinning Escape Discs**:
   - Coily enters at the top of the pyramid as a bouncing purple egg and hatches upon reaching the bottom row (Row 7), transforming into a coiled cyber-snake that actively pursues your grid position.
   - Hop off the edge onto a floating **Spinning Escape Disc** when Coily is close behind—you will ride the elevator beam safely back to the apex while Coily leaps off the pyramid into the void (`+500 pts` and clears all enemies!).
3. **Slick & Chrono-Orbs**:
   - **Slick (Teal Gremlin)**: Hops down the pyramid reverting flipped cubes back to their base color. Jump onto Slick to eliminate him for **+300 pts**.
   - **Green Chrono-Orb**: Catching a green orb awards **+100 pts** and freezes all enemies for **5 seconds**.

---

## ⌨️ Keyboard & Mouse Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `Q` or `Arrow Up` | Hop diagonally **Up-Left (↖)** |
| `W` or `Arrow Right` | Hop diagonally **Up-Right (↗)** |
| `A` or `Arrow Left` | Hop diagonally **Down-Left (↙)** |
| `S` or `Arrow Down` | Hop diagonally **Down-Right (↘)** |
| `Left Click on Canvas` | Hop diagonally toward the clicked quadrant relative to your hopper |
| `P` | Pause / Resume game |
| `N` | Start New Game |
| `M` | Toggle Web Audio Synthesizer Mute |
| `H` / `?` | Open / Close How-to-Play Modal |
| `Alt + G` | Toggle **Codecaine Game Master FX HUD** |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip

- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
