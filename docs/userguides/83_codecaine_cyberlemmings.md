# 🧵 Codecaine CyberLemmings: Kernel Thread Rescue

![Codecaine CyberLemmings Banner](../../screenshots/apps/lemmings_desktop.png)

**Port**: `3267`  
**Studio Launcher ID**: `lemmings`  
**Server Entrypoint**: `applications/lemmings_studio.ts`  
**Interactive Frontend**: `resources/lemmings/index.html`

---

## 1. Overview & 1991 DMA Design / Psygnosis Heritage

**Codecaine CyberLemmings: Kernel Thread Rescue** is a 60fps HTML5 Canvas tribute and cyberpunk kernel-engineering expansion of DMA Design & Psygnosis's legendary 1991 puzzle-strategy classic **Lemmings** (created by Mike Dailly, David Jones, Gary Timmons, and Scott Johnston).

Guide autonomous green-haired **Kernel Daemon Threads** dropping out of the **Orbital Entry Hatch (`🛸`)** across destructible multi-material pixel caverns into the swirling **Kernel Exit Portal (`🏰`)** by assigning **8 specialized Daemon Thread Skills (`Keys 1–8`)**.

### Quick Launch Commands

```bash
# Launch native desktop window (with local background server on port 3267)
bun run app:lemmings

# Launch headless local web server on http://127.0.0.1:3267
bun run applications/lemmings_studio.ts --server
```

---

## 2. Destructible Pixel Terrain Engine (`880 × 460`)

The stage is powered by a real-time per-pixel material mask (`Uint8Array(880 * 460)`) paired with an offscreen pixel buffer rendered with 3D beveled neon-moss top edges, strata shading, and animated hazards:

| Material ID | Material Name | Destructible? | Tactical Behavior |
| :---: | :--- | :---: | :--- |
| `1` | **🌱 `DIRT`** | ✅ Yes | Organic cyber-soil with 3D beveled neon-moss top edges; can be bashed, mined, dug, or bombed. |
| `2` | **🧱 `CYBER_BRICK`** | ✅ Yes | Circuit masonry & diagonal bridge steps placed by `Builder` threads. |
| `3` | **🛡️ `INDESTRUCTIBLE_STEEL`** | ❌ No | Riveted titanium plates; deflects `Basher`, `Miner`, and `Digger` tools with a metallic clang and resists `Bomber` craters. |
| `4` | **➡️ `ONE_WAY_WALL`** | ➡️ Right-Only | Directional plasma barrier that can only be bashed or mined in the forward (`+X`) arrow direction. |
| `5` | **💧 `WATER_HAZARD`** | ❌ Hazard | Bioluminescent coolant trench at cavern bottom; drowns threads unless bridged over by a `Builder`. |
| `6` | **🌋 `LAVA_CORE`** | ❌ Hazard | Incandescent magma core pit in Mayhem stages that immediately vaporizes threads on contact. |

---

## 3. All 8 Assignable Daemon Thread Skills (`Keys 1–8`)

Select a skill from the bottom command deck (or press `1`–`8`), then left-click any active Kernel Thread on the canvas:

| Key | Skill | Type | Behavior & Mechanics |
| :---: | :--- | :---: | :--- |
| **`1`** | **🧗 Climber** | Permanent Trait | Scales vertical walls of any height until reaching a top ledge or bumping into a ceiling overhang. |
| **`2`** | **☂️ Floater** | Permanent Trait | Deploys a cyber-parachute umbrella during long drops to survive any fall height (`>= 68 px`). |
| **`3`** | **💣 Bomber** | 5s Countdown | Starts a `5..4..3..2..1` timer above the thread's head, cries `"OH NO!"`, and blasts a `22 px` radius crater in destructible terrain. |
| **`4`** | **🛑 Blocker** | Stance | Stands firmly with arms outstretched, reversing the walking direction of all other threads that collide with it. |
| **`5`** | **🪜 Builder** | 12-Brick Bridge | Constructs a 12-step diagonal upward `CYBER_BRICK` bridge (`+4 px` forward, `-2 px` up per step) with an **audible warning click on the last 3 bricks**. |
| **`6`** | **⛏️ Basher** | Horizontal Tunnel | Carves a horizontal `14 px` tall corridor through destructible terrain until breaking into open air or striking `INDESTRUCTIBLE_STEEL`. |
| **`7`** | **⚒️ Miner** | `45°` Down Tunnel | Swings a pickaxe to carve a diagonal downward shaft (`+2 px` forward, `+1 px` down per cycle) through terrain. |
| **`8`** | **🌀 Digger** | Vertical Shaft | Drills a `12 px` wide vertical shaft straight down through terrain until reaching open air or steel. |

---

## 4. All 8 Playable Game Modes (`#lemmingsModeSelect`)

1. **🌱 Fun Tier (`fun`)**: Generous 12 of every skill, `50%` rescue quota, and multi-terrace `DIRT` & `CYBER_BRICK` formations ideal for practicing `Digger`, `Basher`, and `Builder` combinations.
2. **🧩 Tricky Tier (`tricky`)**: Bridge over a wide `WATER_HAZARD` chasm onto a stepping island and bash through a fortified brick tower to reach the Exit Portal (`65%` quota).
3. **🔥 Taxing Tier (`taxing`)**: Navigate `INDESTRUCTIBLE_STEEL` deflectors, a directional `ONE_WAY_WALL`, and high drops requiring `Floater` or `Miner` coordination (`75%` quota).
4. **💀 Mayhem Tier (`mayhem`)**: Ring-0 Meltdown! High release rate (`75`), zero `Blocker` skills (`0`), twin `LAVA_CORE` pits, and an `80%` rescue requirement.
5. **⚔️ 2-Tribe Vs. AI Rescue (`vs_ai`)**: Emerald Player Tribe vs. Magenta AI Demon Tribe! Race the autonomous AI rescue commander across a symmetric dual-hatch cavern.
6. **⚡ 90s Speedrun Rescue (`speedrun`)**: High-tempo 90-second blitz with rapid hatch spawning (`Release Rate 80`) and time-bonus multipliers.
7. **🏗️ Terrain Sandbox & Brush Editor (`sandbox`)**: Live pixel terrain painter! Paint `DIRT`, `CYBER_BRICK`, `INDESTRUCTIBLE_STEEL`, `ONE_WAY_WALL`, `WATER_HAZARD`, `LAVA_CORE`, or `ERASE` directly onto the stage while threads walk across your creations in real time.
8. **🎲 Procedural Level Architect (`procedural` / `[G]`)**: Generates infinite procedural multi-tier caverns, one-way gates, and chasm puzzles on demand.

---

## 5. Tactical Controls & Keyboard Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `1` – `8` | Select Daemon Thread Skill (`Climber`, `Floater`, `Bomber`, `Blocker`, `Builder`, `Basher`, `Miner`, `Digger`) |
| `Left Click` | Assign selected skill to hovered thread (or paint terrain in Sandbox Brush mode) |
| `-` / `+` (or `[` / `]`) | Decrease / Increase **Entry Hatch Release Rate** (`MIN` to `99`) |
| `P` | Toggle **Tactical Pause** (inspect terrain & select skills while paused) |
| `F` | Cycle **Fast-Forward Simulation Speed** (`1×` → `2×` → `3×`) |
| `H` | Trigger **AI Bridge/Rescue Coach** (highlights lead thread & auto-assigns optimal skill) |
| `G` | Generate new stage via **Procedural Level Architect** |
| `N` | **Nuke All (`☢️`)** — closes hatch and initiates staggered 5-second Bomber countdowns on all active threads |
| `M` | Toggle **1991 Chiptune March BGM Synthesizer** |
| `R` | Reset / Restart current stage |
