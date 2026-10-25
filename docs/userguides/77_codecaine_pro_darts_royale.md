# 🎯 Codecaine Pro Darts Royale: 501, Cricket & 14-Game Arena -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 14-Game Championship & Pub Darts Suite, 4-Tier 3D Tungsten Ballistics, PDC Checkout Solver & Cricket Arena + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:darts]  •  [Headless Server: bun run applications/darts_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Pro Darts Royale: 501 & Cricket Arena** is a championship television-broadcast bristle dartboard simulator built for **Bun RAD Studio**. Step up to the oche under the Ally Pally stage lights and compete across **14 Official Championship, Pub, Training & Arcade Dart Games** (`501`, `301`, `701`, `Standard Cricket`, `Cut-Throat Cricket`, `English Tactics 12–20`, `Around the Clock`, `Shanghai`, `Killer`, `Bob's 27`, `Halve-It`, `Baseball Darts`, `9-Hole Darts Golf`, and `Arcade Count-Up`), powered by **4-Tier Ballistic Throw Physics (`Beginner Assisted`, `Club Gravity`, `Pro Ballistics`, `PDC Master Sim`)**, selectable **Tungsten Barrel Weights (`18g`, `22g`, `26g`)**, a **Live AI PDC Checkout Route Advisor (`170` down to `2`)**, and a multi-tier **PDC Pro AI (`Pub Regular`, `County Champion`, `World Stage Legend`)** or **2-Player Pass & Play**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:darts

# Launch headless server
bun run applications/darts_studio.ts --server
```

---

## 🎮 All 14 Official Championship, Pub, Training & Arcade Dart Games

Select any of the 14 modes at any time using the top **`#modeSelect` Game Mode Selector** dropdown or quick-access mode buttons:

### 🏆 01 Championship Games (`501`, `301`, `701`)
1. **`501` — 501 Championship (Double-Out / Straight-Out)**:
   - Both players start at **501 points** and throw 3 darts per visit to reach **exact `0`**.
   - **Official Double-Out (`🎯 Finish: Double-Out`)**: Your final winning dart must land in an outer **Double Ring (`D1–D20`)** or the center **Inner Bullseye (`DBULL / 50 pts`)**. Going below `0`, dropping to `1` (in Double-Out), or hitting `0` on a Single/Treble triggers a **`💥 BUST!`** and resets your score to the start of the visit.
2. **`301` — 301 Fast Play**:
   - Fast-paced countdown starting from **301 points** with full Checkout Coach support.
3. **`701` — 701 Marathon**:
   - High-endurance tournament countdown starting from **701 points**.

### 🦗 Cricket & Tactics Games (`CRICKET`, `CUTTHROAT`, `TACTICS`)
4. **`CRICKET` — Standard Cricket (`15–20 & Bull`)**:
   - Close numbers **`20, 19, 18, 17, 16, 15, and BULL`** with 3 marks (`/` = 1, `✕` = 2, `⊗` = 3 Closed).
   - Once you close a number (`⊗`) while your opponent has fewer than 3 marks, additional hits on that number add points to your score. First player to close all 7 targets with the highest (or tied) score wins!
5. **`CUTTHROAT` — Cut-Throat Cricket (Reverse Penalty)**:
   - Uses the `15–20 & Bull` board, except overflow hits on a number you have closed **add penalty points to your opponent's score**!
   - First player to close all 7 numbers with the **lowest total penalty score** wins!
6. **`TACTICS` — English Tactics (`12–20 & Bull`)**:
   - Extended 10-target British Tactical Cricket covering **`20, 19, 18, 17, 16, 15, 14, 13, 12, and BULL`**.

### 🍺 Classic Pub & Party Games (`SHANGHAI`, `KILLER`, `HALVEIT`, `CLOCK`)
7. **`SHANGHAI` — Shanghai (Rounds `1–7` + Instant Shanghai KO)**:
   - Played over 7 innings targeting `1` in Round 1, `2` in Round 2, ..., up to `7` in Round 7. Only hits on the active round's number score (`Round × Multiplier`).
   - **🐉 INSTANT SHANGHAI KO**: Hitting a **Single + Double + Triple** of the active round's number within a single 3-dart visit wins the leg immediately by knockout!
8. **`KILLER` — Killer (Pub Elimination Survival 💀)**:
   - Each player is assigned a distinct personal number (e.g. `#20` vs `#19`).
   - Hit your own number until you reach **3 hits (`3/3`)** to arm yourself as a **`KILLER 💀`** (`3❤️ Lives`).
   - Once armed as a **KILLER 💀**, aim at your **opponent's number** to strip their lives (`-1` Single, `-2` Double, `-3` Triple)—and avoid hitting your own number, which wounds yourself! First Killer to reduce the opponent to `0❤️` wins!
9. **`HALVEIT` — Halve-It (7-Stage Target or Slash `÷2`!)**:
   - 7 high-stakes stages: **Stage 1: `Any 20`**, **Stage 2: `Any 16`**, **Stage 3: `Any Double Ring`**, **Stage 4: `Any 14`**, **Stage 5: `Any Triple Ring`**, **Stage 6: `Any 18`**, **Stage 7: `Bullseye (25/50)`**.
   - Matching darts add their score to your total. If **all 3 darts in your visit miss** the stage requirement, your **entire accumulated score is slashed in half (`÷2`)**!
10. **`CLOCK` — Around the Clock (`1–20 + Bull`)**:
    - Hit segments **`1` through `20` in sequence**, finishing on the **Bullseye**. Landing a **Double** skips `+2` numbers; landing a **Treble** skips `+3` numbers!

### ⛳ Pro Training, Sports & Arcade (`BOBS27`, `BASEBALL`, `GOLF`, `COUNTUP`)
11. **`BOBS27` — Bob's 27 (Pro Doubles Practice Gauntlet)**:
    - Created by World Champion Bob Anderson. Start at **27 points** and progress through 21 rounds targeting `D1, D2, ... D20, DBULL`.
    - Every hit on the target Double adds its value (`+2×N` or `+50`). Missing with all 3 darts **subtracts** the Double's value! Dropping below `1` point results in an instant **`💥 BUSTED OUT!`**.
12. **`BASEBALL` — Baseball Darts (9 Innings: `1–9` Runs)**:
    - 9 Innings targeting segments `1` through `9`. Single = `1 Run`, Double = `2 Runs`, Triple = `3 Runs`. Scoring `7+ Runs` in a single inning triggers a **`⚾ GRAND SLAM!`** celebration!
13. **`GOLF` — 9-Hole Darts Golf (Par 36 Low-Stroke Tour)**:
    - Play Holes `1` through `9` (Par 4 per hole = Par 36): **Triple = `1 Stroke (Eagle)`**, **Double = `2 Strokes (Birdie)`**, **Inner Single = `3 Strokes`**, **Outer Single = `4 Strokes (Par)`**, **Miss = `5 Strokes (Bogey)`**. Press **`H`** (or click **`⛳ Hold Stroke [H]`**) to lock your hole score early! Lowest 9-hole stroke total wins.
14. **`COUNTUP` — Arcade Count-Up (8 Rounds Max Score)**:
    - Start at `0` and throw 8 rounds (24 darts) to post the highest total score (`Max 1,440`).

---

## 🎯 4-Tier Ballistic Throw Physics & Tungsten Barrel Lab

Choose your preferred realism level via **`#physicsModeSelect`** and **`#barrelWeightSelect`**:
- **4 Ballistic Tiers**:
  - `🟢 Beginner Assisted (ARCADE)`: Point-and-click release with minimal dispersion.
  - `🔵 Club Gravity Physics (CLUB)`: Enables the **Vertical Release Power & Angle Gauge** (`78% OPT` sweet spot; under-powering drops low under gravity, over-powering climbs high).
  - `🟣 Pro Ballistics (PRO)`: Adds **Stage HVAC Crosswind (`mph`)** and **Spider-Wire Deflections & Bounce-Outs**.
  - `🔴 PDC Master Sim (MASTER)`: Full tournament pressure with **Heartbeat BPM Systolic Pulse** (surging to `140+ BPM` on 180 attempts and double-out finishes) and manual-only aiming.
- **Tungsten Barrel Weights (`18g Feather`, `22g Tour Pro`, `26g Heavy`)**: Lighter barrels fly faster with flatter arcs but drift more in crosswinds; heavier barrels resist hand sway and wind but drop steeper if under-powered.

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Mouse Move` or `Arrow Keys / WASD` | Position aiming reticle across the bristle dartboard |
| `Hold Shift` or `Right-Click` | **Steady-Breath Focus** (tightens hand sway for pinpoint doubles/trebles) |
| `Hold & Release Left-Click / Spacebar` | Charge **Ballistic Power Gauge** (aim for `78% OPT`) & release tungsten dart |
| `R` | Snap Aim directly to **AI Recommended Target / Active Mode Wedge** |
| `T` | Snap Aim directly to **Treble 20 (`T20` — 60 pts)** |
| `B` | Snap Aim directly to **Inner Bullseye (`DBULL` — 50 pts)** |
| `H` | **Hold Stroke** in 9-Hole Darts Golf |
| `N` | Start a Fresh Match |
| `M` | Mute / Unmute Web Audio Synthesizer (`DartsAudio`) |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (`bun run applications/darts_studio.ts --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
