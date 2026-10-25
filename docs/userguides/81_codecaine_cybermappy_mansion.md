# 🐭 Codecaine CyberMappy: Mansion Heist & Trampoline Police

**Port**: `3265`  
**Studio Launcher ID**: `mappy`  
**Server Entrypoint**: `applications/mappy_studio.ts`  
**Interactive Frontend**: `resources/mappy/index.html`

---

## 1. Overview & Classic 1983 Namco Mappy Heritage

**Codecaine CyberMappy: Mansion Heist & Trampoline Police** is a 60fps HTML5 Canvas tribute and modern expansion of Namco's beloved 1983 arcade classic **Mappy** (designed by Nobuhirooka & scored by Nobuyuki Ohnogi).

Guide **Officer Mappy**, the courageous Micro-Police mouse in his signature blue uniform and badge, inside the 6-story **Nyamco Victorian Cyber-Mansion** to recover all **10 stolen treasures** per stage from **Boss Goro (Nyamco)** and his mischievous pink cat gang, the **Meowkies**.

---

## 2. Authentic Trampoline Physics & Mid-Air Shaft Invincibility

### 2.1 Color-Coded Elastic Trampoline Tension
The 6-story mansion is divided by **4 vertical Trampoline Shafts**. Bouncing consecutively on the same trampoline without stepping onto a mansion floor increases its elastic stress:

| Trampoline State | Consecutive Bounces Left | Visual Color | Behavior |
| :--- | :---: | :---: | :--- |
| **Fresh Tension** | `3` (or `5` w/ Kevlar) | 🟢 **Green** (`#22c55e`) | Safe elastic launch across all 6 stories |
| **Worn Tension** | `2` | 🔵 **Blue** (`#3b82f6`) | Moderate tension warning |
| **Stressed Tension** | `1` | 🟡 **Yellow** (`#eab308`) | One safe bounce remaining |
| **Critical Tension** | `0` | 🔴 **Red** (`#ef4444`) | **DANGER!** Landing on this trampoline a 4th consecutive time without touching a floor **SNAPS** the mat! |

> **Tension Reset Rule**: Stepping onto **any** of the 6 mansion floors immediately restores all non-snapped trampolines back to **🟢 Green** full tension.

### 2.2 Mid-Air Shaft Invincibility
True to the 1983 arcade rules, **Officer Mappy is 100% invincible to Pink Meowkies and Boss Goro while airborne inside any vertical trampoline shaft**. Collisions with cats only occur when both Mappy and a cat are walking on the **same horizontal floor**.

---

## 3. Doors, Microwave Shockwaves & Pitfall Bells

- **Regular Mansion Doors (`[SPACE]` / `[E]`)**: Flip open or closed to block pursuing Meowkies or slam directly into adjacent cats to stun them (`+50 PTS`).
- **Flashing Microwave Shockwave Doors (`[SPACE]` / `[E]`)**: Unleash a horizontal **Sonic Wave Beam** that sweeps every cat on that floor off-screen!
  - **1 Meowky Swept**: `200 PTS`
  - **2 Meowkies Swept**: `400 PTS`
  - **3 Meowkies Swept**: `800 PTS`
  - **4+ Meowkies Swept**: `1,200` – `4,000 PTS`
  - **😼 Boss Goro Swept in Wave**: **Doubles (`2X`)** the entire wave score plus `+1,000 PTS`!
- **Hanging Pitfall Bells (`🔔`)**: Touch a bell near the top of Shafts 2 or 3 to drop it down the shaft, crushing any Meowkies below for `+300 PTS` each.

---

## 4. Stolen Treasure Pairs & Boss Goro's Hideout Multiplier

Each stage features **10 stolen items** (2 of each of the 5 treasure tiers):

1. 📻 **Boombox Stereo**: `100 PTS`
2. 📺 **Holo-Television**: `200 PTS`
3. 🖥️ **Quantum PC**: `300 PTS`
4. 🖼️ **Mona Lisa Art**: `400 PTS`
5. 🏦 **Gold Vault Safe**: `500 PTS`

### Catching Boss Goro Hiding Behind Loot (`x2` → `x6` Multiplier)
Watch for **Boss Goro's crimson ears and yellow eyes peeking above an uncollected treasure**. Recovering a treasure while Goro is hiding behind it awards **`+1,000 PTS`** immediately and permanently upgrades your **Consecutive Pair Multiplier** (`x2` → `x3` → `x4` → `x5` → `x6`) whenever you collect matching treasure pairs in sequence!

---

## 5. All 8 Playable Game Modes

1. **🏛️ 1983 Classic Mansion (`classic`)**: Authentic 6-story Nyamco Mansion heist recovery with Roof Balloon Bonus stages every 3rd level.
2. **⚡ Roguelike Police Gadgets (`roguelike`)**: Draft tactical upgrades from the **Precinct Armory (`[U]`)**, including **Kevlar 5-Bounce Trampolines**, **Police Taser Batons (`[F]`)**, and **Riot Armor Vests**.
3. **😼 Play as Boss Goro (`play_goro`)**: Reverse-role mode! Control Boss Goro directly across the floors and shafts to intercept AI Officer Mappy (`+1,500 PTS` per tag).
4. **🎈 Balloon Bonus Marathon (`balloon_marathon`)**: Non-stop music-synced **Roof Trampoline Bonus Stages**—pop all 15 red balloons and the **2,000-PT Giant Goro Balloon** before the timer expires!
5. **🤖 Mega-Nyamco Boss Raid (`boss_raid`)**: Battle the armored **Mega-Nyamco Penthouse Tank** on Floor 1 using Microwave Shockwave Doors and Police Taser pulses.
6. **⏱️ 90s Mansion Speed Blitz (`speed_blitz`)**: High-tempo 90-second score attack with rapid Goro hideout rotations.
7. **🐭🐭 2P Co-Op Police Partners (`coop_partners`)**: Officer Mappy & Partner Mappy Jr. patrol the mansion together (supports `J`/`L` partner steering or smart AI assist).
8. **🚓 Cops vs. Robbers Showdown (`cops_robbers`)**: High-intensity syndicate chase across all 6 stories.

---

## 6. Controls & Keyboard Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `A` / `D` or `◄` / `►` | Walk left/right on floors, or steer off a Trampoline Shaft onto an aligned floor |
| `SPACE` or `E` or `B` | Open/Close nearest Door or fire a **Flashing Microwave Shockwave Door** |
| `F` | Discharge **Police Taser Baton** (stuns all nearby Meowkies & Boss Goro) |
| `G` | Toggle **Roof Balloon Bonus Stage** |
| `U` | Open **Precinct Armory Roguelike Upgrade Draft** |
| `M` | Toggle synthesized **1983 Namco Jazz-Ragtime Web Audio Soundtrack** |
| `1` – `8` | Instant switch between all 8 Game Modes |
