# 🍄 Codecaine Bros. Arcade — AAA Lifetime-Replayability Platformer & Roguelike Arena Guide

```
Version: 3.0.0 (AAA Lifetime Edition)  •  Engine: 60fps Arcade Bumping Physics, Roguelike Perks & 4-Channel Polyphonic Synth  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:codecaine_bros]  •  [Headless Server: bun run applications/codecaine_bros_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Bros. Arcade (AAA Lifetime Edition)** reimagines the iconic 1983 sewer arcade platformer as a 6-mode, endlessly replayable action platformer and roguelike colosseum built natively for Bun RAD Studio. Featuring responsive **Coyote Time**, **Jump Buffering**, **Wall-Jumps**, **Air-Dashes (`Shift`)**, **Ground-Pounds (`Down/S` in mid-air)**, **Plasma Fireballs (`F`)**, **Thunder Hammer swings (`E`)**, persistent **Career XP & 6 Unlockable Hero Suits**, and a **4-channel NES/Arcade polyphonic chiptune soundtrack (`🎶 MUSIC [B]`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:codecaine_bros

# Launch headless web server
bun run applications/codecaine_bros_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Codecaine Bros Desktop](../../screenshots/apps/codecaine_bros_desktop.png) | ![Codecaine Bros Responsive](../../screenshots/apps/codecaine_bros_responsive.png) |

---

## 🎮 6 Playable Game Modes for Lifetime Replayability
Select any mode instantaneously from the top HUD Mode Selector Bar or by pressing keys **`[1]` – `[6]`**:

### 1. `🕹️ [1] Classic 1983 Arcade`
- Authentic subterranean sewer platformer with **Shellcreepers** (1 bump), **Sidesteppers / Crabs** (require 2 bumps — first bump enrages and speeds them up!), **Fighterflies** (hop along ledges), and **Slipice / Freezies** (crystallize platforms into slick ice!).
- Dodge or bump green & red bouncing **Fireballs**, conserve your central **POW Block (`3 charges`)**, and clear **Bonus Coin Mania** stages every 3rd phase.

### 2. `♾️ [2] Roguelike Endless Gauntlet (Perks & Upgrades)`
- Battle endless escalating waves across dynamic platform topologies!
- Every **2 waves cleared**, draft **1 of 3 Cyber-Plumber Roguelike Perks** from the interactive **Upgrade Draft Card** overlay (or press **`[1]` / `[2]` / `[3]`**):
  - `👢 Jet-Boost Double Jump` — Grants an extra mid-air double jump plus jetpack hover when holding Jump!
  - `⚡ Phase Dash [Shift]` — Invulnerable horizontal air-dash with neon afterimages and reduced cooldown!
  - `🔥 Plasma Fireball Glove [F]` — Shoot dual bouncing plasma fireballs directly from your hands!
  - `🔨 Thunder Hammer [E]` — Swing a heavy cyber-hammer (`[E]`) or Ground-Pound (`[Down/S]` in mid-air) to send seismic shockwaves across your floor!
  - `🧲 Quantum Coin Magnet` — Automatically pulls coins and bonus gems across the screen toward your plumber!
  - `🔄 Self-Charging POW Core` — Regenerates `+1` POW Block charge at the start of every wave!

### 3. `👑 [3] Boss Rush Colosseum`
- Face off against 4 multi-phase cyber-sewer titans with a live top-screen **Boss HP Bar**, minion summons, and shockwave barrages:
  1. **🦀 King Krabzilla** — Giant armored crimson crustacean with pincer shockwaves and crab swarms.
  2. **🐢 Mecha-Shell Juggernaut** — High-velocity titanium koopa tank.
  3. **❄️ Lord Frostbite** — Cryo-monarch that flash-freezes platforms and summons Slipice.
  4. **🐉 Inferno Dragon** — Breathes bouncing plasma fireballs and triggers floor-shaking slams.
- **How to Defeat Bosses**: Bump the platform directly beneath the Boss (`-20 HP`), blast them with Plasma Fireballs (`[F]`), slam a Ground-Pound (`[Down/S]` in mid-air) or Thunder Hammer (`[E]`), or detonate the POW Block!

### 4. `⏱️ [4] 90s Parkour Coin Blitz`
- High-speed 90-second platforming time attack!
- Collect glowing **Golden Coin Rings**, ride speed-pad **Conveyor Belts**, launch off **Springboard Trampolines**, chain Wall-Jumps & Air-Dashes, and build up a **`x10` Combo Multiplier** before the clock hits `00:00.0`!

### 5. `🎲 [5] Procedural Biome Architect (6 Dynamic Worlds)`
- Generates 6 distinct arena topologies (or click **`🌍 BIOME`** in the HUD at any time to cycle worlds):
  1. **Twin Gap Sewer** (Authentic 1983 layout)
  2. **Pyramid Citadel** (Central tiered pyramid with dual floor springboards)
  3. **Conveyor Factory** (Motorized left/right conveyor belt ledges + central springboard)
  4. **Springboard Spire** (High-altitude vertical gap arena with 3 super-trampolines)
  5. **Ice Cavern** (Permafrost glacier ledges with upper springboard)
  6. **Low-G Orbital Sewer** (0.66G space-station gravity with oscillating **Moving Platforms**)

### 6. `👥 [6] 2P Co-Op & Versus Battle Royale` (`WASD` vs `Arrow Keys`)
- Use the **`⚔️ SUB-MODE`** button in the HUD to toggle between:
  - **🤝 2P Co-Op Campaign**: Team up locally to clear waves and bosses together.
  - **⚔️ 2P Versus Coin Battle**: Bump your friend from below to **stun them (`💫 STUN!`)** and knock loose their coins, or stomp a stunned rival for a **KO**! First player to **50 Coins** or **3 KOs** wins the Battle Royale Crown (`👑`)!

---

## 👕 Persistent Career XP, Plumber Ranks & 6 Unlockable Hero Suits
Every enemy kicked, coin collected, perk drafted, and boss defeated awards persistent **Career XP** saved in `localStorage`. Click **`👕 Suit Locker [U]`** in the top bar to view your Plumber Rank (`Apprentice Plumber` → `Overclocked Legend`) and equip any of the **6 Hero Suits**:
1. **Classic Red/Blue** (Default)
2. **Cyber Neon Gold** (`1,500 XP`)
3. **Fire Flower White/Red** (`3,500 XP`)
4. **Ice Plumber Cyan** (`6,000 XP`)
5. **Shadow Ninja** (`10,000 XP`)
6. **Synthwave Chrome** (`15,000 XP`)

---

## ⌨️ Desktop Controls Reference

| Action | Player 1 (Keyboard) | Player 2 (Keyboard) |
| :--- | :--- | :--- |
| **Move Left / Right** | `A` / `D` (or `←` / `→` in 1P) | `←` / `→` or `J` / `L` |
| **Jump / Double-Jump / Wall-Jump** | `W` or `Space` (or `↑` in 1P) | `↑` or `I` or `Enter` |
| **Ground-Pound (Mid-Air)** | `S` or `↓` while airborne | `↓` while airborne |
| **Phase Air-Dash** | `Left Shift` | `Right Shift` |
| **Plasma Fireball Throw** | `F` | `/` or `K` |
| **Thunder Hammer Swing** | `E` | `Right Shift` |
| **Select Game Mode 1–6** | `1` – `6` | `1` – `6` |
| **Draft Roguelike Perk** | `1` / `2` / `3` | `1` / `2` / `3` |
| **Hero Suit Locker** | `U` | `U` |
| **Toggle Chiptune Music** | `B` | `B` |
| **Toggle Master Mute / CRT** | `M` / `C` | `M` / `C` |
| **Pause / Restart Phase** | `P` / `R` | `P` / `R` |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Open **Settings (`⚙️`)** and enable **Low Resource Mode** or toggle off **CRT Scanlines (`C`)** to further reduce GPU/CPU compositing overhead on older hardware.
