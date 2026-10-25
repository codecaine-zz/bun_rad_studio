# 🟡 Codecaine CyberChomp Arcade — 6-Mode Lifetime Replayability Edition

```
Version: 3.0.0  •  Engine: Native HTML5 Canvas, 6 Game Modes, Procedural Maze Architect & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:pacman]  •  [Headless Server: bun run applications/pacman_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberChomp Arcade** is an AAA retro-futuristic maze-chase arcade suite built natively for Bun RAD Studio. Engineered with a rock-solid 60Hz fixed-timestep engine, procedural Web Audio synthwave soundtrack + harmonic SFX, 4 distinct pursuit drone AI personalities, **6 distinct playable game modes**, **6 procedural Cyber Biomes**, **Phase Dash (`Shift`)**, **DX Flash Smart Bombs (`E`)**, **Plasma Laser & 256 Glitch Power-Ups**, and persistent **Career XP, Rank Titles & 6 Chomp Skins**.

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![CyberChomp Desktop](../../screenshots/apps/pacman_desktop.png) | ![CyberChomp Responsive](../../screenshots/apps/pacman_responsive.png) |

---

## 🎮 6 Playable Game Modes (Hotkeys `1`–`6` or Top Mode Bar)

| Mode Key | Mode Name | Core Mechanics & Replayability Highlights |
| :--- | :--- | :--- |
| **`1`** | **🕹️ Classic Arcade** | Authentic 4-Ghost AI (`Crimson`, `Pulse`, `Glitch`, `Amber`), Scatter/Chase wave timers, fruit bonuses, and progressive speed. |
| **`2`** | **⚡ Championship DX+** | **5-Minute Blitz**! Brush past sleeping neon micro-ghosts to wake them into a **25-Ghost Train**. Eat a Power Pellet for slow-motion Ghost Train fireworks (`200 → 400 → 800 → 1600 → 3200`) or press **`E`** to detonate a **Smart Bomb**! |
| **`3`** | **🎲 Endless Procedural** | Generates a brand-new symmetric wrap-around maze every level across **6 Cyber Biomes** (`Neon Grid`, `Cryo-Vault`, `Solar Reactor`, `Emerald Matrix`, `Void Nebula`, `Golden Palace`) with **Cyber Speed Boost Pads**! |
| **`4`** | **🔥 256 Glitch Survival** | Outrun the rising **Hex/ASCII Glitch Tide** creeping up from the bottom of the maze! Chain **256-Dot Combos** to vaporize all ghosts and collect **Plasma Laser Beams**, **Cryo-Freeze**, **Magnet**, and **Giant Chomp** power-ups! |
| **`5`** | **👻 Ghost Hunter (Blinky)** | Reverse roles! You control **Crimson (Blinky)** while an AI Speedrunner CyberChomp tries to clear the maze. Press **`Q`** or **`E`** to trigger a 5-second **Squad Ambush** pincer maneuver! |
| **`6`** | **👥 2P Co-Op & Versus** | **Player 1** (Gold CyberChomp, `WASD`) and **Player 2** (Cyan Ms. CyberChomp, `Arrow Keys`) team up in the same maze! Eating a Power Pellet revives a fallen partner. |

---

## 👻 Ghost Drone AI Personality Dossier

| Drone | Name | Nickname | Targeting Algorithm |
| :--- | :--- | :--- | :--- |
| 🔴 **Red** | Blinky | Crimson | Aggressive Pursuer: Directly targets CyberChomp's exact grid tile. Playable in **Mode 5: Ghost Hunter**! |
| 🌸 **Pink** | Pinky | Pulse | Tactical Ambusher: Targets 4 tiles ahead of CyberChomp's current direction to cut off escape routes. |
| 🔷 **Cyan** | Inky | Glitch | Vector Flanker: Computes target using vector doubling between Crimson and 2 tiles ahead of CyberChomp. |
| 🟠 **Orange**| Clyde | Amber | Shy Patrol: Chases CyberChomp when far away ($> 8$ tiles), but retreats to scatter corner when close. |

---

## ⚡ Tactical Abilities, Power-Ups & Career Skins

- **Phase Dash (`Shift` or `⚡ DASH` button)**: Short-cooldown hyper-dash with cyan afterimage trail and brief phase-invulnerability to slip through tight ghost intersections.
- **DX Flash Smart Bomb (`E` or `💣 BOMB` button)**: Warps all active ghosts back to the regeneration pen and awards bonus points for any trailing Ghost Train.
- **Collectible Power-Up Orbs (`powerUpItem` / `activePowerUp`)**:
  - **Plasma Laser (`LASER`)**: Fires high-energy horizontal/vertical beams down your corridor, vaporizing ghosts on contact.
  - **Cryo-Freeze (`FREEZE`)**: Freezes all roaming ghosts in solid ice for 7 seconds.
  - **Pellet Magnet (`MAGNET`)**: Pulls in all pellets within a 2-tile radius automatically.
  - **Giant Chomp (`GIANT`)**: Expands CyberChomp's size and crushes ghosts without needing a Power Pellet.
  - **Hyper Speed (`SPEED`)**: Overclocks movement speed by 35%.
- **6 Chomp Skins & Career Ranks**: Earn Career XP for every dot, fruit, ghost train, and level cleared to climb from `🏅 Rookie` to `👑 Cyber Legend` and switch between `Classic Gold`, `Cyber Cyan`, `Plasma Magenta`, `Emerald Viper`, `Solar Phoenix`, and `Rainbow Prism`.

---

## ⌨️ Controls Reference
- **Move (P1 / Solo)**: `W`, `A`, `S`, `D` or `Arrow Keys` (or Touch Swipe / Virtual D-Pad)
- **Move (P2 in 2P Co-Op)**: `Arrow Keys` (`P1` uses `W`, `A`, `S`, `D`)
- **Select Game Mode**: `1` – `6` keys or click the top Mode Bar
- **Phase Dash**: `Shift`
- **Smart Bomb / Squad Ambush**: `E` or `Q`
- **Toggle Synthwave Music**: `B` or `🎶` button
- **Pause / Resume**: `P` or `Space`
- **Game Master FX HUD**: `Alt + G`
- **Fullscreen**: `F` or `F11`

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
