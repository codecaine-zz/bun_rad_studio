# 🎈 Codecaine CyberBalloon Fight: Sky Joust & Storm Trip -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 60fps Aerial Momentum & Physics Joust Engine, Satoru Iwata Balloon Trip & 6-Mode Roguelike Suite + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:balloon_fight]  •  [Headless Server: bun run applications/balloon_fight_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberBalloon Fight: Sky Joust & Storm Trip** is a standalone 60fps aerial momentum and physics arcade suite inspired by Nintendo's classic 1985 NES *Balloon Fight* (both the **1-Player / 2-Player Sky Arena** and Satoru Iwata's legendary side-scrolling **Balloon Trip** mode), expanded into a modern 6-mode cyber-arcade workstation with **Emergency Balloon Re-Inflation Pumps**, **Roguelike Sky-Joust Perks**, **Multi-Balloon Sky Leviathan Bosses**, and a procedural **Web Audio Synthesizer & Chiptune Sequencer (`BalloonAudio`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:balloon_fight

# Launch headless server (default port 3263 or dynamic)
bun run applications/balloon_fight_studio.ts --server
```

---

## 🎮 The 6 Playable Game Modes (`[1–6]`)

### 1. 🎈 Classic 1985 Sky Arena (`[1]`)
- **Inertial Flap & Bank Physics**: Tap or hold `W` / `Space` / `Up` to flap your wings and gain altitude; bank left/right (`A`/`D` or `Left`/`Right`) with authentic air momentum and horizontal screen wrap-around.
- **Two-Step Enemy Knockdown & Tier Upgrades**:
  - Enemy **Bird-Knights** begin each phase pumping up their balloons on floating grass/metal islands.
  - Strike an airborne Bird-Knight from above to **pop their balloon** (`+500` to `+1,000 pts`), forcing them to deploy a **Parachute**.
  - Hit them mid-parachute or kick them off a platform while pumping for huge bonus points (`+750` to `+1,500 pts`)!
  - If a parachuting enemy lands safely on an island and finishes pumping a new balloon, they **upgrade** from **Pink → Emerald Green → Crimson Red** (faster flight speed and more aggressive pursuit!).
- **20-Balloon Chimney Pipe Bonus Stage (`[G]` or Every 3rd Wave)**:
  - Every 3 waves (or on demand via `G`), fly above 4 brass chimney pipes and pop 20 rising balloons! Catching all 20 awards a **+10,000 pt Super Bonus**.

### 2. ⚡ Balloon Trip — Endless Lightning Odyssey (`[2]`)
- **Authentic Side-Scrolling Survival**: The starlit night sky scrolls continuously while you weave through fields of rotating **Lightning Spark Stars**.
- **Soap Bubbles & Freeze Combo**: Pop rising **Soap Bubbles** (`+500 pts`) to briefly **freeze obstacle scrolling for 2.5 seconds** and build your combo multiplier as you climb from **Rank 50 down to Rank 1**.

### 3. ♾️ Roguelike Sky Gauntlet (`[3]`)
- Endless escalating waves where every 2 waves (or at any time via **`U`**) you draft **1 of 3 Sky-Joust Perks**:
  - `🎈 Triple-Balloon Armor` — Increases max balloon capacity to **3 Balloons** and attaches an extra Golden Helium Balloon.
  - `⚡ Afterburner Air-Dash [Shift]` — High-impulse horizontal jet dash with invulnerability frames.
  - `💥 Meteor Dive-Stomp [Down/S]` — Fast midair downward stomp that pops enemy balloons with a shockwave bounce.
  - `🛡️ Faraday Storm Shield` — Absorbs 1 Lightning Spark hit per wave without losing a balloon.
  - `🪶 Feather Dart Blaster [F]` — Fires twin horizontal cyber-feather darts that pop enemy balloons at range.
  - `🔧 Turbo Re-Inflate Pump [R]` — Doubles emergency balloon pump speed on platforms and grants brief invulnerability while pumping.

### 4. 👾 Boss Storm: Sky Leviathan (`[4]`)
- Face giant multi-balloon aerial bosses (**Mecha-Roc Sky Dreadnought**, **Thunder Nimbus Core**, and **King Piranha Prime**). Pop their dorsal armor balloons from above or strike their core with Feather Darts!

### 5. 🤝 2P Co-Op Sky Squadron (`[5]`)
- **Player 1 (`WASD`)** and **Player 2 (`Arrow Keys` or AI Wingman)** fly together with **friendly elastic balloon-bounce** (bouncing off your partner never pops their balloons!) to clear waves and Pipe Bonus stages together.

### 6. ⚔️ 2P Versus Balloon Dogfight (`[6]`)
- Competitive aerial jousting! Swoop above your rival to pop their balloons, bounce them into spinning **Flippers**, or herd them toward the **Giant Abyssal Piranha** — first pilot to **5 KOs** wins the Dogfight Cup!

---

## ⚠️ Classic Environmental Hazards & Emergency Balloon Pump

- **🐟 Giant Cyber-Piranha (Bottom Water Channel)**: Hovering too close to the water surface triggers warning dorsal ripples before the **Giant Piranha** leaps out of the waves with snapping jaws! When enemies splash into the water, a **Soap Bubble (`+500 pts`)** rises from the waves.
- **🌩️ Crackling Storm Clouds & Lightning Sparks**: Storm clouds build electrostatic charge, flash warning bolts, and spit fast-bouncing **Lightning Sparks** across the arena.
- **🔄 Spinning Pinwheel Flippers**: Contacting a Flipper spins its arms and ricochets flyers and enemies across the sky at high velocity.
- **🎈 Emergency Balloon Re-Inflation Pump (`[R]` or `[S]` on Platform)**: Lost one of your balloons? Land safely on any island and rapidly tap **`R`** or **`S`** to pump up a replacement balloon!

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `W` / `Space` / `Left Click` | **Player 1 Flap Wings** (Gain altitude & momentum) |
| `A` / `D` | **Player 1 Bank Left / Right** (Horizontal inertia & screen wrap) |
| `R` or `S` (on platform) | **Emergency Balloon Pump** (Re-inflate lost balloon on an island) |
| `S` (in midair) | **Meteor Dive-Stomp** (Fast downward dive attack) |
| `Shift` | **Afterburner Air-Dash** (Horizontal jet burst) |
| `F` | **Feather Dart Blaster** (Ranged horizontal dart) |
| `Arrow Keys` + `Enter` / `/` | **Player 2 Controls** (Flap, Bank, Pump/Dive, Dash, Dart in Modes 5 & 6) |
| `1` – `6` | Instant Mode Switch (`Classic`, `Trip`, `Roguelike`, `Boss`, `Co-Op`, `Versus`) |
| `U` | Open **Sky-Joust Perk Armory Modal** |
| `G` | Launch **20-Balloon Chimney Pipe Bonus Stage** |
| `B` / `M` | Toggle **Arcade Chiptune Music (`B`)** / **Web Audio SFX (`M`)** |
| `P` / `N` / `H` | Pause (`P`), New Flight (`N`), Pilot Flight Manual (`H`) |
| `Alt + G` | Toggle **Codecaine Game Master FX HUD** |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D physics, starfields, and Web Audio synthesizers significantly faster.
- Launch with `--server` (`bun run applications/balloon_fight_studio.ts --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
