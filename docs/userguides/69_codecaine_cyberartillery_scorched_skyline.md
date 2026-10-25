# 💥 Codecaine CyberArtillery: Scorched Skyline -- Complete Production User Guide

```
Version: 2.0.0  •  Engine: Pixel-Destructible Skyscraper Terrain, Wind Ballistics & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:artillery]  •  [Headless Server: bun run applications/artillery_studio.ts --server]
```

---

## 🌟 Executive Overview

**Codecaine CyberArtillery: Scorched Skyline** fuses two legendary 1991 MS-DOS classics—QBasic's **`GORILLAS.BAS`** and Wendell Hicken's **`Scorched Earth`**—into a cyberpunk rooftop artillery duel. Command your Cyber-Mech atop a procedurally generated neon skyscraper skyline where every explosion carves circular pixel craters directly through buildings!

---

## 🚀 Quick Start & Launch

```bash
# Launch desktop application window
bun run app:artillery

# Launch headless local HTTP server (for browser gameplay)
bun run applications/artillery_studio.ts --server
```

---

## 🎮 Gameplay Rules & Arsenal

1. **Pixel-Destructible Skyscraper Terrain**:
   - Every shell detonation carves a circular crater out of the offscreen building bitmap. You can blast tunnels straight through towering skyscrapers or erode the rooftop beneath an enemy turret so it drops!
2. **Live Wind Vector & Parabolic Physics**:
   - Inspect the live **Wind Vector Indicator** at top-center before firing. Strong east or west crosswinds bend high-angle shots significantly.
3. **5 Tactical Weapons (`1`–`5`)**:
   - **`1` Plasma Shell (∞)**: Reliable high-explosive artillery round.
   - **`2` 3-Way MIRV (2)**: Splits at the trajectory apex into three independent warheads.
   - **`3` 5-Burst Funky Bomb (2)**: Detonates into a cluster of five colorful sub-explosions.
   - **`4` Bunker Buster (2)**: Heavy warhead that carves a massive 58px crater through skyscrapers.
   - **`5` Shield + Tracer (2)**: Raises an energy shield reducing incoming damage by 65% and projects a long-range ballistic trajectory preview.
4. **Game Modes**:
   - Play **1P vs AI** across 3 difficulty tiers (**Cadet**, **Sharpshooter**, **Ballistic AI**) or **2P Pass-and-Play**.

---

## ⌨️ Keyboard & Mouse Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `Arrow Up` / `Arrow Down` | Adjust turret elevation Angle (`5°–88°`) |
| `Arrow Left` / `Arrow Right` | Adjust launch Velocity / Power (`15–115`) |
| `Space` or `FIRE! Button` | Fire selected weapon |
| `1` – `5` | Select weapon (`Plasma`, `MIRV`, `Funky Bomb`, `Bunker Buster`, `Shield + Tracer`) |
| `N` | Generate New Skyline |
| `P` | Pause / Resume match |
| `M` | Toggle Web Audio Synthesizer Mute |
| `H` / `?` | Open / Close Ballistics Manual |
| `Alt + G` | Toggle **Codecaine Game Master FX HUD** |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip

- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
