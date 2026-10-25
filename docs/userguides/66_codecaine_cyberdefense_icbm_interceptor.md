# 🚀 Codecaine CyberDefense: ICBM Interceptor -- Complete Production User Guide

```
Version: 2.0.0  •  Engine: HTML5 Canvas 2D Thermonuclear Plasma Physics, Web Audio Synth & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:missile_command]  •  [Headless Server: bun run applications/missile_command_studio.ts --server]
```

---

## 🌟 Executive Overview

**Codecaine CyberDefense: ICBM Interceptor** is a high-octane cyberpunk remaster of Atari's legendary 1980 arcade masterpiece *Missile Command*. Command three independent surface-to-air Counter-Missile Batteries (**Alpha**, **Beta Hypersonic**, and **Gamma**) to shield six glowing neon Cyber-Cities along the sector horizon against relentless waves of ballistic ICBMs, splitting MIRV warheads, high-altitude Orbital Bombers, and evasive Smart Bombs.

---

## 🚀 Quick Start & Launch

```bash
# Launch desktop application window
bun run app:missile_command

# Launch headless local HTTP server (for browser gameplay)
bun run applications/missile_command_studio.ts --server
```

---

## 🎮 Gameplay Rules & Tactical Mechanics

1. **Three Counter-Missile Batteries**:
   - **Alpha Battery (`A` or `1`)**: Guarding the western sector (10 interceptors per wave).
   - **Beta Hypersonic Battery (`S` or `2`)**: Guarding the central sector with **1.65× high-velocity interceptors** ideal for distant or urgent intercepts (10 interceptors per wave).
   - **Gamma Battery (`D` or `3`)**: Guarding the eastern sector (10 interceptors per wave).
   - Clicking anywhere in the sky (or pressing `Space`) automatically fires from the **nearest armed battery**.
2. **Thermonuclear Plasma Spheres & Chain Reactions**:
   - Counter-missiles detonate at the exact target reticle coordinate, creating an expanding and contracting plasma sphere.
   - Any enemy ICBM, MIRV, Orbital Bomber, or Smart Bomb that touches an active plasma sphere immediately vaporizes and triggers a **secondary chain-reaction blast sphere**!
3. **Enemy Threat Matrix**:
   - **Ballistic ICBMs (25 pts × Multiplier)**: Rain down from orbit targeting Cyber-Cities and missile silos.
   - **MIRV Splitting Warheads**: Amber-trailed carriers that split mid-air into multiple independent warheads.
   - **Orbital Bombers (100 pts × Multiplier)**: Traverse horizontally across the upper atmosphere, periodically dropping warheads.
   - **Smart Evader Bombs (125 pts × Multiplier)**: Diamond-shaped autonomous warheads that actively sense and dodge nearby plasma blasts—place your shots directly in their path!
4. **End-of-Wave Bonus & City Reconstruction**:
   - Surviving Cyber-Cities award **100 pts × Multiplier** each, and remaining interceptor missiles award **5 pts × Multiplier** each.
   - Every **10,000 points** earned awards a reserve Cyber-City that automatically rebuilds a destroyed city at the end of a wave.

---

## ⌨️ Keyboard & Mouse Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `Left Click` / `Space` | Fire counter-missile from nearest armed battery to crosshair |
| `A` or `1` | Fire counter-missile specifically from **Alpha Battery (Left)** |
| `S` or `2` | Fire counter-missile specifically from **Beta Hypersonic Battery (Center)** |
| `D` or `3` | Fire counter-missile specifically from **Gamma Battery (Right)** |
| `Mouse Move` / `Arrow Keys` | Aim target reticle across the defense sector |
| `P` | Pause / Resume tactical defense |
| `N` | Start New Game |
| `M` | Toggle Web Audio Synthesizer Mute |
| `H` / `?` | Open / Close Tactical Briefing Modal |
| `Alt + G` | Toggle **Codecaine Game Master FX HUD** |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip

- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
