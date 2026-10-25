# ⛏️ Codecaine CyberLode: Gold Cache Heist

![Codecaine CyberLode Banner](../../screenshots/apps/lode_runner_desktop.png)

**Port**: `3268`  
**Studio Launcher ID**: `lode_runner`  
**Server Entrypoint**: `applications/lode_runner_studio.ts`  
**Interactive Frontend**: `resources/lode_runner/index.html`

---

## 1. Overview & 1983 Broderbund Lode Runner Heritage

**Codecaine CyberLode: Gold Cache Heist** is a 60fps HTML5 Canvas tribute and modern expansion of Douglas E. Smith and Broderbund's 1983 puzzle-platforming masterpiece **Lode Runner**.

Infiltrate a multi-story **`28 × 16` Tile Vault**, shimmy across overhead **Hand-Bar zip-lines**, climb vertical **Cyber-Ladders**, and fire your **Diagonal Laser Drill (`[Q]`/`[Z]` Left, `[E]`/`[X]` Right)** to carve temporary pits in `DIGGABLE_BRICK` floors that trap pursuing **AI Malware Guards (`STUNNED_IN_HOLE`)**. Once every glowing **Gold Cache (`🪙`)** ingot is recovered, the **Hidden Escape Ladder** materializes with an ascending fanfare—climb to the top row (`Row 0`) to clear the heist!

### Quick Launch Commands

```bash
# Launch native desktop window (with local background server on port 3268)
bun run app:lode_runner

# Launch headless local web server on http://127.0.0.1:3268
bun run applications/lode_runner_studio.ts --server
```

---

## 2. Authentic `28 × 16` Tile Grid Architecture

Every stage is built on a crisp `28 × 16` tile matrix (`896 × 512` pixels) with 8 specialized tile behaviors:

| Tile ID | Tile Type | Drillable? | Mechanics & Tactical Properties |
| :---: | :--- | :---: | :--- |
| `0` | **`EMPTY`** | — | Open vault air; entities fall if unsupported below (`LADDER`, `HAND_BAR`, or solid floor). |
| `1` | **🧱 `DIGGABLE_BRICK`** | ✅ Yes | Classic crimson masonry; can be laser-drilled via `[Q]`/`[Z]` (Down-Left) or `[E]`/`[X]` (Down-Right) and **regenerates after `5.5s`** with warning particles! |
| `2` | **🛡️ `SOLID_CONCRETE`** | ❌ No | Indestructible titanium-concrete bedrock and Championship vault barriers. |
| `3` | **🪜 `LADDER`** | ❌ No | Vertical climbable cyber-ladder supporting bidirectional ascent and descent. |
| `4` | **〰️ `HAND_BAR`** | ❌ No | Overhead monkey-bar zip-line rail; shimmy horizontally across chasms or press `S` / `Down` to drop off. |
| `5` | **⚠️ `TRAP_BRICK`** | ❌ No | Looks identical to `DIGGABLE_BRICK` during normal play, but entities fall straight through it! |
| `6` | **🪙 `GOLD_CACHE`** | — | Glowing golden data ingot (`+250 PTS`); collect all ingots to unlock the Escape Ladder. |
| `7` | **✨ `HIDDEN_ESCAPE_LADDER`** | ❌ No | Remains invisible until all `GOLD_CACHE` ingots are collected, then materializes leading to `Row 0`. |

---

## 3. Smart AI Malware Guards & Brick Regeneration Physics

- **Pursuit & Gold Theft**: `3–5` AI Malware Guards actively pursue the runner across floors, ladders, and hand-bars. If a guard walks over an uncollected `GOLD_CACHE`, it picks up the ingot (`carryingGold = 1`) and carries it until dropping it later or falling into a drilled hole.
- **Trapping Guards (`STUNNED_IN_HOLE`)**: When a guard steps into a drilled `DIGGABLE_BRICK` hole:
  - You earn **`+75 PTS`** immediately.
  - Any carried `GOLD_CACHE` is automatically dropped directly above the hole at `(col, row - 1)`.
  - **Safe Head-Bridge**: You can walk safely right across the top of a stunned guard's head!
  - **Climb-Out (`3.5s`)**: If the brick has not yet closed, the guard shakes and climbs out of the hole after `3.5 seconds`.
  - **Brick Crush & Top Respawn (`5.5s`)**: When the drilled brick regenerates at `5.5 seconds`, any guard still trapped inside is **crushed (`+250 PTS`)** and respawns at the top of the screen (`Row 0`)!

---

## 4. All 8 Playable Game Modes (`#lodeModeSelect`)

1. **🏆 Classic 150-Style Heist (`classic`)**: Iconic 5-deck brick architecture, interconnected ladders, overhead hand-bars, 10 Gold Caches, and 3 patrolling Malware Guards.
2. **👑 Championship Lode Runner (Hard) (`championship`)**: High-security vault featuring `SOLID_CONCRETE` floor locks, 5 aggressive guards, and multi-brick drilling sequences.
3. **💣 Bomb & Trapdoors (`trapdoors`)**: Deceptive `TRAP_BRICK` false floors that drop unsuspecting runners or guards into lower decks.
4. **⚡ 90s Gold Rush Blitz (`blitz`)**: High-speed 90-second score attack with turbo runner movement and `2×` Gold Cache point value (`500 PTS` per ingot).
5. **🤝 2P Co-Op Heist (WASD + Arrows) (`coop`)**: Runner 1 (`WASD` + `Q`/`E` drill) and Partner Runner 2 (`Arrow Keys` + `,`/`.` drill) raid the vault together!
6. **👻 Stealth No-Drill Challenge (`stealth`)**: Laser drills are locked—rely purely on route planning, hand-bar drops, and guard kiting to extract every Gold Cache.
7. **🏗️ Built-In Level Editor (`editor`)**: Select any tile brush from the bottom Editor Bar (`Diggable Brick`, `Solid Concrete`, `Ladder`, `Hand-Bar`, `Trap Brick`, `Gold Cache`, `Escape Ladder`, `Empty`) and click directly on the `28 × 16` canvas to sculpt and playtest custom stages live!
8. **🎲 Procedural Winnable Heist (`procedural` / `[G]`)**: Generates infinite procedural `28 × 16` heist vaults guaranteed to have full ladder connectivity and an escape route.

---

## 5. Controls & Keyboard Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `W` / `A` / `S` / `D` or `Arrow Keys` | Run left/right, climb ladders up/down, shimmy across hand-bars, or drop from a hand-bar (`S` / `Down`) |
| `Q` or `Z` | Fire **Laser Drill Down-Left** (`col - 1, row + 1`) |
| `E` or `X` | Fire **Laser Drill Down-Right** (`col + 1, row + 1`) |
| `,` / `.` (in 2P Co-Op Mode) | Player 2 Laser Drill Down-Left / Down-Right |
| `H` | Trigger **AI Path & Drill Hint** (highlights nearest Gold Cache route & optimal drill tile) |
| `G` | Generate a new stage via **Procedural Winnable Heist** |
| `P` | Toggle **Pause / Resume** |
| `M` | Toggle **WebAudio Chiptune Heist Soundtrack** |
| `R` | Reset / Restart current stage |
