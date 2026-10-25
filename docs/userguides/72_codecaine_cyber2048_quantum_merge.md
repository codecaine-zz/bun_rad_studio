# 🔢 Codecaine Cyber2048 Quantum Merge -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: High-DPI Quantum Tile Synthesizer, Expectimax AI & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:2048]  •  [Headless Server: bun run applications/cyber2048_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Cyber2048 Quantum Merge** is a high-DPI neon power-of-2 sliding tile synthesizer built natively for Bun RAD Studio. Fuse quantum tiles across `2 → 4 → 8 → 16 → 32 → 64 → 128 → 256 → 512 → 1024 → 2048 → 4096 → 8192` with smooth cubic-bezier slide interpolation, pop-scale merge animations, pitch-ascending pentatonic Web Audio chimes, and an integrated **Expectimax AI Advisor**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:2048

# Launch headless server
bun run applications/cyber2048_studio.ts --server
```

---

## ⚡ Gameplay Rules & Quantum Enhancements

### 1. Three Reactor Grid Modes
- **3×3 Turbo (`1`)**: Fast-paced compact tactical grid where space management is critical.
- **4×4 Classic (`2`)**: Standard championship 2048 matrix balanced for reaching `2048`, `4096`, and `8192`.
- **5×5 Quantum Reactor (`3`)**: Expanded 25-cell lattice enabling massive combo chains and high-octave tile synthesis.

### 2. Modern Tactical Modules
- **⏪ 5-Step Temporal Undo (`Z`)**: Rewinds up to 5 previous board states and scores per session so you can recover from an unfavorable spawn or mis-slide.
- **⚡ Quantum Tile Zap (`X`)**: Vaporizes the lowest-value `2` or `4` tile on the board once per game with a particle burst, freeing a critical slot when the lattice is congested.
- **🧠 AI Expectimax Best-Move Hint (`H`)**: Runs a 2-ply Expectimax lookahead heuristic evaluating corner gradients, smoothness, and open cell entropy to recommend (or execute) the optimal slide direction.

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Arrow Keys` / `WASD` | Slide Tiles (`Up`, `Down`, `Left`, `Right`) |
| `Mouse / Touch Swipe` | Drag in any cardinal direction on the canvas to slide tiles |
| `Z` | Trigger 5-Step Temporal Undo |
| `X` | Trigger Quantum Tile Zap (Vaporizes lowest `2`/`4` tile once per game) |
| `H` | Scan & Highlight AI Expectimax Best-Move Hint |
| `1` / `2` / `3` | Switch Grid Mode (`3×3 Turbo`, `4×4 Classic`, `5×5 Quantum Reactor`) |
| `N` | Start New Game |
| `M` | Mute / Unmute Harmonic Web Audio Synthesizer |
| `?` | Open / Close Quantum Manual Modal |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
