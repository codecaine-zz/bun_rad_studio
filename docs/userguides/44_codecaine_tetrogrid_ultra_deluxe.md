# ⚡ Codecaine TetroGrid Ultra Deluxe

**Application ID**: `tetris_studio`  
**Default Port**: `3120`  
**Entry Point**: [`applications/tetris_studio.ts`](../../applications/tetris_studio.ts)  
**Web Assets**: [`resources/tetris_studio/index.html`](../../resources/tetris_studio/index.html)

---

## 🌟 Overview

**Codecaine TetroGrid Ultra Deluxe** is a competitive & arcade block-puzzle workstation combining the mechanics of *Tetris Effect: Connected*, *Super Puzzle Fighter II Turbo*, *TETR.IO*, *Tetris: The Grand Master (TGM 20G)*, *Tetris Blast*, and *Pentomino Madness*.

It features **11 distinct playable modes**, **🥊 Super Puzzle Fighter II Turbo Crash Gem Dojo (`fighter`)**, **Authentic TGM Master 20G (`500ms` / 15-Move Step-Reset Lock Delay + `9` → `GM` Grade System)**, **3D Crystalline Beveled Jewel / Cyber-Glass Minos**, **🌀 Zone Overdrive Time-Stop**, **⚔️ Versus AI Garbage Battles** with a live **🥊 Ryu-Caine vs 👹 Akuma-Bot Cyber Dojo & TetroBot AI Radar**, a real-time **🤖 Pierre Dellacherie AI Best-Move Ghost Advisor**, **💣 Plasma Bomb Cores & Cascade Gravity**, **⏪ Temporal Undo/Rewind**, **6 visual themes**, and **⚡ Pro Competitive DAS/ARR Handling Presets**.

---

## 🏆 11 Modern Game Modes (`[1–0, F]` Hotkeys / Top Mode Ribbon / `#modeSelect`)

| # | Mode | Hotkey | Description |
| :---: | :--- | :---: | :--- |
| **1** | **🏆 Marathon (20-Level Championship)** | `1` | Classic 1–20 gravity curve with T-Spin, Back-to-Back (`x1.5`), Combo, and Perfect Clear bonuses. |
| **2** | **🥊 Puzzle Fighter (Crash Gem Dojo)** | `F` | *Super Puzzle Fighter II Turbo* mode! Drop **2-Gem Domino Pairs** in 4 gem colors (Cyan, Gold, Emerald, Crimson), fuse `2×2` / `3×2` / `3×3` rectangles into unified **⚡ Giant Power Gems (`2.5×` bonus)**, detonate connected color clusters with **💥 Pulsing Crash Gems**, shatter entire colors with **💎 Rainbow Diamonds**, tick down **⏱️ Numbered Counter Gems (`5→0`)**, and launch **🔥 Hadouken Fireballs** from **🥊 Ryu-Caine** at **👹 Akuma-Bot**! |
| **3** | **🌌 Zone Effect (Time-Stop Overdrive)** | `2` | Clearing lines charges the **🌀 Zone Meter (`0%–100%`)**. Press **`[E]`** (`Shift+Z` or click `🌀 ZONE OVERDRIVE`) to freeze gravity, shift into a golden time-stop dimension, and stack cleared lines at the bottom for **Octotris (8-Line)**, **Decatris (12-Line)**, or **Ultimatris (16+ Line)** clears! |
| **4** | **⚔️ Versus AI Garbage Battle (`TETR.IO` Style)** | `3` | Duel **TetroBot AI**! Watch the **Incoming Red Garbage Meter** on the left edge of the board and the live **TetroBot AI Radar** on the right. T-Spins, Tetrises, B2B chains, and Combos cancel incoming garbage and send attack lines to KO TetroBot! |
| **5** | **🧀 Cheese Race (Garbage Dig)** | `4` | Excavate down through 20 Swiss-cheese garbage layers with 1-block holes as fast as possible. |
| **6** | **🧩 Pentomino & Giant Mix** | `5` | Adds 5-block **Pentominoes (`P`, `U`, `V`, `W`, `X`, `F`)** and **Trominoes (`I3`, `L3`)** alongside the 7 classic Tetrominoes. |
| **7** | **💣 Bomb Blast & Cascade Gravity** | `6` | Pieces spawn with glowing **💣 Plasma Bomb Cores**. Clearing a line containing a bomb detonates a `3×3` blast crater and triggers **Cascade Gravity** where floating blocks drop into empty spaces below! |
| **8** | **⚡ 40-Line Sprint (Pro Telemetry)** | `7` | High-speed 40-line time trial with live **PPS (Pieces/sec)**, **APM (Attack/min)**, and **KPP (Keys/piece)** telemetry. |
| **9** | **⏱️ 2-Minute Ultra Blitz** | `8` | 120-second score attack with Fever combo multipliers. |
| **10** | **👑 Master 20G & Phantom Roll** | `9` | Authentic *Tetris: The Grand Master* `20G` instant surface gravity (`0ms` drop) paired with a **`500ms` Lock Delay + 15 Move/Rotation Step Resets**, live **Lock Delay Progress Bar**, expanded step-up wall kicks, live **👑 TGM Grade Progression (`9` → `S1..S9` → `M` → `GM`)**, and a toggleable **👻 Phantom Invisible Stack (`[I]`)** modifier! |
| **11** | **🧘 Zen Chill + AI Coach** | `0` | Endless stress-free flow mode where overflow rows auto-dissolve so you never top out. |

---

## 🥊 Super Puzzle Fighter II Turbo Mechanics (`fighter` Mode)

- **2-Gem Domino Pairs & Loose-Block Cascade Gravity**: Pieces spawn as 2-gem pairs (`Cyan`, `Gold`, `Emerald`, `Crimson`). When locked on an uneven surface, unsupported gems independently drop down into empty spaces below (`applyCascadeGravity()`).
- **⚡ Giant Power Gems (`2×2` / `3×2` / `3×3`)**: Forming a solid `2×2` or larger rectangle of matching Normal Gems fuses them visually into a unified **Giant Power Gem** with a glowing beveled frame and `⚡POWER` emblem that multiplies shatter damage by **`2.5×`**.
- **💥 Crash Gems (`200+`)**: Pulsing orb gems with a glowing core and crosshair. Placing or cascading a Crash Gem next to any matching-color gem (or Power Gem) shatters the entire connected cluster via flood-fill and triggers **Multi-Step Cascade Chains (`2x CHAIN!`, `3x SUPER COMBO!`)**.
- **💎 Rainbow Diamond Gems (`300`)**: Spawns every 11th piece and shatters **every gem of the color it lands on** across the entire playfield (`💎 DIAMOND CRASH!`).
- **⏱️ Countdown Counter Gems (`500+`)**: Garbage gems drop with a numeric countdown (`5` down to `1`) that ticks down every piece placement before converting into live normal gems for massive counter-chains.
- **🥊 Ryu-Caine vs 👹 Akuma-Bot Cyber Dojo Stage**: Real-time animated fighter stage above the opponent radar with HP bars, bobbing chibi fighters, and flying **🔥 Hadouken** energy projectiles on every chain or line clear.

---

## 👑 Authentic TGM Master 20G & Visual Polish

- **Instant 20G Surface Gravity + `500ms` / 15-Step Lock Delay**: In `Master 20G`, pieces instantly slam onto the stack (`0ms` air time) and remain slideable and rotatable across the surface for `500ms` per step (up to `15` move/rotation resets) with a live **Lock Delay Progress Bar** rendered directly beneath the grounded piece. Pressing `↓` (Soft Drop) on the stack performs an instant **Sonic Lock**.
- **👑 TGM Grand Master Grade System**: Real-time grade badge (`9` → `8` → `7` → `6` → `5` → `4` → `3` → `2` → `1` → `S1`..`S9` → `M` → `GM`) rendered on the playfield header and Level HUD.
- **💎 3D Crystalline Beveled Jewel / Cyber-Glass Minos**: Every block renders with a multi-stop jewel gradient, top/left specular trapezoid bevel, bottom/right shadow bevel, inner facet core, and corner specular glint, plus an **Active Column Light Beam**, **Row-4 `⚠️ DANGER ZONE` Top-Out Warning Line**, and **Horizontal Line-Clear Laser Flash Bars**.

---

## ⌨️ Controls Summary

| Input | Action |
| :--- | :--- |
| `←` / `→` | Move Left / Right (with configurable DAS / ARR auto-shift & 20G Lock-Delay step reset) |
| `↓` | Soft Drop (`+1 pt/cell`, or Sonic Lock when grounded) |
| `Space` | Hard Drop (`+2 pts/cell` + Laser Drop Beam & Kinetic Board Recoil) |
| `↑` / `X` | Rotate Clockwise (`90° CW` with SRS + TGM Step-Up Wall/Floor Kicks) |
| `Z` / `Ctrl` | Rotate Counter-Clockwise (`90° CCW`) |
| `A` | Rotate `180°` |
| `C` / `Shift` | Hold Active Piece |
| `E` / `Shift+Z` | Activate / End **🌀 Zone Overdrive** |
| `F` | Switch to **🥊 Puzzle Fighter (Crash Gem Dojo)** Mode |
| `H` | Toggle **🤖 AI Best-Move Ghost Advisor** |
| `B` | Trigger **⏪ Temporal Rewind (Undo Misdrop)** |
| `I` | Toggle **👻 Phantom Invisible Stack** |
| `1` – `0` | Instant Switch Between Modes `1–10` |
| `P` / `Esc` | Pause / Resume |
| `R` | Quick Restart Match |
