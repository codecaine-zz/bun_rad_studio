# 🐛 Codecaine CyberCentipede Blaster -- Complete Production User Guide

```
Version: 2.0.0  •  Engine: High-Speed Grid Collision, Chain-Splitting Centipede AI & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:centipede]  •  [Headless Server: bun run applications/centipede_studio.ts --server]
```

---

## 🌟 Executive Overview

**Codecaine CyberCentipede Blaster** is a high-speed neon tribute to Atari's 1981 arcade shooter *Centipede*. Maneuver your Cyber-Blaster freely across the lower 25% combat zone while firing rapid-fire plasma lasers into a dense grid of destructible **Cyber-Spores**, splitting multi-segment Centipedes, and fending off **Bouncing Cyber-Spiders**, **Flea Droppers**, and **Poison Scorpions**.

---

## 🚀 Quick Start & Launch

```bash
# Launch desktop application window
bun run app:centipede

# Launch headless local HTTP server (for browser gameplay)
bun run applications/centipede_studio.ts --server
```

---

## 🎮 Gameplay Rules & Insectoid Threat Matrix

1. **Chain-Splitting Centipede Physics**:
   - The Centipede winds horizontally across the 30×28 arena, dropping one row and reversing direction whenever it strikes a wall or a **Cyber-Spore (Mushroom)**.
   - Destroying any segment awards **100 pts (Head)** or **10 pts (Body)**, spawns a new Cyber-Spore at that exact grid coordinate, and **splits the Centipede into two independent chains**, turning the trailing segment into a new autonomous Head!
2. **Bouncing Cyber-Spider (`300 / 600 / 900 pts`)**:
   - Zig-zags erratically through the lower player zone, eating Cyber-Spores along its path. Close-range shots award up to **900 pts**!
3. **Flea Dropper (`200 pts`)**:
   - Plummets vertically from the top edge, seeding fresh Cyber-Spores in its wake. Takes 2 laser hits to vaporize.
4. **Poison Scorpion (`1,000 pts`)**:
   - Scurries across upper rows, poisoning every Cyber-Spore it touches (**Neon Magenta**). Any Centipede touching a poisoned spore **dives straight vertically down** toward the player zone!

---

## ⌨️ Keyboard & Mouse Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `Mouse Move` / `WASD` / `Arrow Keys` | Maneuver Cyber-Blaster freely in the bottom 25% zone |
| `Left Click` / `Space` | Fire rapid plasma laser |
| `F` | Toggle Rapid Auto-Fire (`ON` by default) |
| `P` | Pause / Resume game |
| `N` | Start New Game |
| `M` | Toggle Web Audio Synthesizer Mute |
| `H` / `?` | Open / Close Tactical Briefing Modal |
| `Alt + G` | Toggle **Codecaine Game Master FX HUD** |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip

- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
