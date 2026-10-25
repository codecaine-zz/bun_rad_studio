# 💣 Codecaine CyberBomber Grid Arena -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 8-Mode 15×13 Cruciform Blast Matrix, Cyber-Louie Mounts, 6 Biomes & Chiptune Synth + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:bomberman]  •  [Headless Server: bun run applications/bomberman_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberBomber Grid Arena — Lifetime DX Edition** is a 60fps tactical grid-demolition arcade suite inspired by *Super Bomberman R*, *Saturn Bomberman*, and *Bomberman '94*, built natively for Bun RAD Studio. It features **8 infinitely replayable game modes**, **11 iconic power-ups & bomb types**, **4 mountable Cyber-Louie Kangaroos (`🦘`)** hatched from spotted eggs, **6 interactive arena biomes** (Conveyor Belts, Warp Teleporters, Slippery Cryo Ice, and Erupting Magma Vents), **45-second Sudden Death Pressure Blocks**, **Revenge Bomber Carts** with player revival, **Titan Mech Bosses**, a persistent **Lifetime Career Vault** (`codecaine_bomberman_lifetime_v2`), **6 Bomber Suits**, and the **BomberAudio** 90s Chiptune / Synthwave Web Audio engine.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:bomberman

# Launch headless server
bun run applications/bomberman_studio.ts --server
```

---

## 🎮 Complete Guide to All 8 Game Modes (`#modeSelect`)

### 1. 🏰 50-Stage Cyber-Tower Campaign (`campaign` / `[1]`)
- **Objective**: Clear soft neon crates and defeat all classic enemy drones (**Ballom**, **Oneal**, **Dahl**, **Minvo**, **Kondoria**, **Ovapi**, **Pontan**) to uncover the hidden Power-Up and step onto the glowing **Exit Portal (`🌀`)**.
- **Portal Penalty**: Blasting an already-revealed Exit Portal with a bomb explosion unleashes fast, wall-phasing **Pontan** penalty ghosts!
- **Boss Encounters**: Every 5th stage (`Stage 5, 10, 15 ... 50`) triggers a **Titan Mech Boss Encounter**!

### 2. 👑 4-Bomber Battle Royale + Sudden Death + Revenge Carts (`royale` / `[2]`)
- **Objective**: Classic 4-corner showdown (`P1 Cyber`, `Crimson Bot`, `Gold Bot`, `Emerald Bot`).
- **Sudden Death Pressure Blocks (`⚠️`)**: In the final 45 seconds of a round, indestructible pressure blocks spiral inward from the outer perimeter to crush campers!
- **Revenge Bomber Carts (`🛒`)**: Eliminated bombers ride around the outer border track and can lob bombs back into the arena (`Space`); if a Revenge Bomber blasts a living player, they **revive directly back onto the grid**!

### 3. 🃏 Endless Roguelike Bomb Dungeon (`roguelike` / `[3]`)
- **Objective**: Descend through procedural dungeon floors and draft **1-of-3 Cyber Perks** after every cleared floor (`🔥 +2 Fire Range`, `💠 Pierce Plasma Bombs`, `🦘 Cyber-Louie Mount`, `📡 Remote Detonator [Q]`, `🥊 Power Glove [E]`, `🛡️ Blast Shield Vest`, `⚡ Hyper-Skates + Kick`, `🧨 Line-Bomb Barrage [C]`).

### 4. 🤖 Titan Mech Boss Colosseum (`boss_rush` / `[4]`)
- **Objective**: Continuous boss-rush gauntlet against multi-tile **Titan Cyber-Bosses**:
  - **🤖 Titan Spider-Mech**: Fires full-row/column laser crossbeams.
  - **🐉 Magma Wyrm Leviathan**: Slithers across corridors leaving scorching magma trails.
  - **🛸 Dreadnought Core**: Teleports across the matrix and summons reinforcement drones.

### 5. 💎 Grand Prix Crystal / Crown Heist (`crown_rush` / `[5]`)
- **Objective**: Collect sparkling **Cyber-Crowns (`👑`)** spawning across the arena. Blasting a rival causes them to drop half their crowns onto the floor! Most crowns when the clock expires wins.

### 6. 💀 Skull & Plague Survival Wave (`zombie` / `[6]`)
- **Objective**: Survive endless waves of infected drones while navigating **Skull Curse Tiles (`💀`)** that inflict hilarious temporary Bomberman curses (`Diarrhea Auto-Bomb`, `Ultra-Speed`, `Slow Snail`, `Mini-Flame`, `Position Swap`). Cure a curse by touching another bomber or picking up a power-up!

### 7. 🤝 2-Player Local Co-Op Campaign & Boss Raid (`coop_2p` / `[7]`)
- **Objective**: `P1 (WASD + Space)` and `P2 (Arrows + Enter)` fight side-by-side through Campaign stages and Titan Bosses.

### 8. ⚔️ 2-Player Local Battle + 2 AI Bots (`versus_2p` / `[8]`)
- **Objective**: 4-Bomber Battle Royale with two local human players (`P1 WASD+Space` vs `P2 Arrows+Enter`) and two AI bots (`Gold Bot` & `Jade Bot`).

---

## 🎒 Iconic Arsenal, Bomb Types & Cyber-Louie Mounts (`🦘`)

| Power-Up / Mount | Icon | Tactical Effect & Shortcut |
| :--- | :---: | :--- |
| **Bomb Up** | `💣` | Increases maximum simultaneous bombs (`1 → 8`) |
| **Fire Up / Full Fire** | `🔥` / `🌞` | Increases cruciform blast radius (`1 → 8` tiles) |
| **Speed Skates** | `👟` | Permanently increases grid movement speed |
| **Bomb Kick** | `👢` | Walk into a bomb to slide it across the corridor; press **`[X]`** to stop it! |
| **Boxing / Power Glove** | `🥊` | Press **`[E]`** to punch or throw an adjacent/underfoot bomb 3 tiles over walls! |
| **Remote Detonator** | `📡` | Press **`[Q]`** to detonate your oldest placed remote bomb on command! |
| **Pierce Bomb** | `💠` | Spiky blue plasma bomb whose blast cuts straight through multiple soft crates! |
| **Line Bomb** | `🧨` | Press **`[C]`** to deploy all remaining available bombs in a line ahead of you! |
| **Vest / Heart Shield** | `🛡️` | Absorbs 1 fatal explosion or enemy drone impact |
| **Cyber-Louie Egg** | `🥚` → `🦘` | Hatches a mountable **Cyber-Louie Kangaroo** (+1 extra hit point & **`[V]`** special skill: **Blue** = Punch Bomb, **Yellow** = Kick Soft Block, **Pink** = Hop Over 1 Block, **Green** = Hyper Dash) |

---

## 🌍 6 Interactive Arena Biomes (`#biomeSelect`)
- **🌐 Cyber Grid**: Classic tournament matrix.
- **⚙️ Conveyor Factory**: Animated **Conveyor Belt Tiles (`◀ ▲ ▶ ▼`)** carry both bombers and ticking bombs along the track.
- **🌀 Warp Portal Lab**: Color-coded **Teleporter Pads** warp players and sliding kicked bombs across the arena.
- **❄️ Cryo Slippery Ice**: Low-friction ice tiles introduce momentum skidding around corners.
- **🌋 Magma Geyser Core**: Volcanic floor vents periodically erupt in a 1-tile cruciform magma burst.
- **🎲 Random Biome**: Selects a surprise biome each stage.

---

## ⌨️ Keyboard & Mouse Controls Reference

| Action | Player 1 / Primary | Player 2 (Co-Op / 2P) / Alternate |
| :--- | :--- | :--- |
| **Move Bomber** | `W` `A` `S` `D` (or `Arrows` in 1P) | `Arrow Keys` |
| **Plant Plasma Bomb** | `Space` | `Enter` or `/` |
| **Remote Detonate Bomb** | `Q` | Bottom Bar `[Q]` Button |
| **Power Glove Punch / Throw** | `E` | Bottom Bar `[E]` Button |
| **Line-Bomb Barrage** | `C` | Bottom Bar `[C]` Button |
| **Stop Sliding Kicked Bomb** | `X` | Bottom Bar `[X]` Button |
| **Cyber-Louie Mount Skill** | `V` or `Shift` | Bottom Bar `[V]` Button |
| **Instant Mode Switch** | `1` – `8` | Header `#modeSelect` Dropdown |
| **Toggle Chiptune Music** | `B` | Header `🎵 Music` Button |
| **Mute Synthesizer SFX** | `M` | Header `🔊 SFX` Button |
| **Pause / New Game** | `P` / `R` | Header Pause / New Game Buttons |
| **Game Master FX HUD** | `Alt + G` | — |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
