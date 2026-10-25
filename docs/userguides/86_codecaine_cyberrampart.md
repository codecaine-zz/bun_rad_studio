# 🏰 Codecaine CyberRampart: Fortress Build & Cannon Siege

![Codecaine CyberRampart Banner](../../screenshots/apps/rampart_desktop.png)

**Port**: `3270`  
**Studio Launcher ID**: `rampart`  
**Server Entrypoint**: `applications/rampart_studio.ts`  
**Interactive Frontend**: `resources/rampart/index.html`

---

## 1. Overview & 1990 Atari Games *Rampart* Heritage

**Codecaine CyberRampart: Fortress Build & Cannon Siege** is a 60fps HTML5 Canvas tribute and modern expansion of Atari Games' pioneering 1990 arcade classic ***Rampart***—the foundational ancestor of the Tower Defense, Real-Time Tactics, and Polyomino Fortress-Building genres.

Command a **28 × 18 Coastline & Fortress Grid** where you enclose **Castle Keeps (`🏰`)** inside continuous stone ramparts, deploy batteries of heavy coastal artillery (`💣`), fire simultaneous arcing cannonball salvos against invading naval armadas (`⛵`, `🚢`, `🐙`), and frantically repair wall breaches using rotating **Tetris-style Polyomino masonry blocks (`🧱`)** before time expires!

---

## 2. Quick Start & Launch Commands

```bash
# Launch Desktop Native Window (Bun + Webview)
bun run app:rampart

# Launch Headless HTTP Server on Port 3270
bun run applications/rampart_studio.ts --server
```

---

## 3. Authentic 3-Phase Strategic Loop & Flood-Fill Enclosure Engine

### 3.1 BFS Flood-Fill Territory Enclosure (`CAPTURED TERRITORY`)
At every wall placement or cannonball impact, CyberRampart runs a **Breadth-First Search (BFS) Flood-Fill** from the map perimeter and ocean tiles (`WATER`):
- Any land tile, **Castle Keep (`🏰`)**, or **Cannon (`💣`)** that cannot be reached from the exterior because it is completely surrounded by a closed loop of **Wall (`🧱`)** tiles is claimed as **`CAPTURED TERRITORY`** (illuminated in glowing Royal Blue & Gold).
- Only cannons located inside **enclosed `CAPTURED TERRITORY`** are powered and able to fire during the Siege Phase!
- Every additional **Castle Keep (`🏰`)** you enclose grants bonus **Reserve Cannons** at the start of the next round.

### 3.2 The 3-Phase Tactical Cycle
1. **Phase 1 — `💣 DEPLOY CANNONS` (`12s` or `[SPACE]`)**: Place your reserve cannons inside enclosed `CAPTURED TERRITORY` tiles.
2. **Phase 2 — `🔥 CANNON SIEGE` (`18s`)**: Click anywhere on the ocean to unleash arcing cannonball salvos simultaneously from all active enclosed cannons. Sink **Red Frigate Ships (`⛵`)**, **Mortar Galleons (`🚢`)**, **Landing Grunts (`👾`)**, and the **Sea Kraken Boss (`🐙`)** before their broadsides punch flaming rubble craters into your castle walls.
3. **Phase 3 — `🧱 POLYOMINO WALL REPAIR` (`18s`)**: Rotate (`[R]` / `Right-Click`) and place Tetris-style polyomino masonry blocks around your Keeps to seal all breaches before the timer runs out, or press **`🤖 Auto-Patch Wall [H]`** for instant AI masonry repair.

---

## 4. All 8 Playable Game Modes (`#rampartModeSelect`)

1. **🏆 Archipelago Campaign (`campaign`)**: Progressive multi-wave coastal defense across the Cyber-Archipelago.
2. **⚔️ 2-Citadel Vs. AI Cannon Duel (`citadel_duel`)**: Head-to-head artillery duel against a rival coastal bastion.
3. **🐙 Kraken Armada Boss Blitz (`kraken_boss`)**: High-HP **Sea Kraken Leviathans** lead relentless naval assaults.
4. **🧱 Polyomino Architect Rush (`polyomino_rush`)**: High-speed territory expansion and multi-keep enclosure challenge.
5. **💣 Super Cannon Overdrive (`super_cannon`)**: Start with massive cannon reserves for overwhelming broadside barrages.
6. **🛡️ Ironclad Endless Siege (`endless_siege`)**: Survive escalating armada waves for the ultimate high score.
7. **🏝️ Custom Island Map Generator (`island_gen`)**: Procedurally generate fresh coastal peninsulas at any time with `[G]`.
8. **⚡ Blitz 10-Second Repair (`blitz_10s`)**: Extreme 10-second repair clocks for master fortress architects.

---

## 5. Controls & Keyboard Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `Left-Click` on Ocean | Fire Simultaneous **Arcing Cannonball Salvo** from all enclosed cannons |
| `Left-Click` on Land | Place **Polyomino Wall Block** (`🧱`) or **Reserve Cannon** (`💣`) |
| `R` or `Right-Click` | Rotate current **Polyomino Wall Piece** `90°` |
| `H` | **🤖 Auto-Patch Wall Breach** (automatically seals unenclosed Keeps & rubble) |
| `F` | Fire Full Cannon Barrage at nearest warship |
| `SPACE` | Advance immediately to Next Phase (`Deploy → Siege → Repair`) |
| `G` | Generate New Procedural Coastline Map |
| `M` | Toggle Orchestral-Synth WebAudio Battle Soundtrack & Cannon SFX |
| `Alt + G` | Toggle Codecaine Game Master FX Post-Processing HUD |
