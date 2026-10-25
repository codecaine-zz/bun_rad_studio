# 🌈 Codecaine CyberPeggle: Extreme Pachinko Odyssey -- Complete Production User Guide

![Codecaine CyberPeggle Banner](../../screenshots/apps/peggle_desktop.png)

```
Version: 2.5.0  •  Engine: 900×560 2D Rigid-Body Peg & Brick Pachinko Physics, 8 Cyber-Masters, 8 Game Modes & Ode to Joy WebAudio Fanfare + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:peggle]  •  [Headless Server: bun run applications/peggle_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberPeggle: Extreme Pachinko Odyssey** is an authentic homage to PopCap's cult-classic *Peggle Deluxe* and *Peggle Nights*. Aim the top-mounted **Cyber-Cannon**, launch **10 Chrome Balls** from the left **Ball-O-Tron Cylinder**, light up all **25 Orange Pegs (`🟠`)**, watch the camera zoom in slow-motion as your ball approaches the **25th and final Orange Peg**, and celebrate **EXTREME FEVER** with **Beethoven's *Ode to Joy* WebAudio Synth Fanfare** and **5 Fever Scoring Chutes (`10,000` • `50,000` • `100,000` • `50,000` • `10,000`)**!

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:peggle

# Launch headless server on Port 3274
bun run applications/peggle_studio.ts --server
```

---

## 🧙 8 Selectable Cyber-Masters (`#masterSelect`)

| Cyber-Master | Green Peg Power-Up | Tactical Effect |
| :--- | :--- | :--- |
| **🦄 Bjorn** | **Super Guide** | Shows full 2-bounce trajectory preview for 3 turns |
| **🐹 Jimmy Lightning** | **Multiball** | Spawns a 2nd Chrome Ball directly out of the Green Peg |
| **🐱 Kat Tut** | **Pyramid Bucket** | Widens the oscillating Free-Ball Bucket with a golden pyramid funnel |
| **👽 Splork** | **Space Blast** | Detonates a 110px cosmic shockwave lighting up all nearby pegs |
| **🦞 Claude** | **Pinball Flippers** | Summons dual pinball flippers above the bottom chute (`[SPACE]`) |
| **🔥 Lord Cinderbottom** | **Fireball** | Turns your ball into a blazing Fireball that pierces straight through pegs |
| **🐰 Warren** | **Lucky Spin** | Triples all shot points (`3×`) on Green Peg activation |
| **🦉 Master Hu** | **Zen Ball** | Subtly curves your ball's flight toward the best remaining Orange Peg |

---

## 🎮 8 Playable Game Modes (`#peggleModeSelect`)

1. **🏆 Adventure Odyssey (12 Stages)**: Progress through 12 distinct peg & curved-brick architectures.
2. **🌙 Peggle Nights (Low-Light Neon Stages)**: Deep-space nocturnal boards with glowing neon peg rims.
3. **⚔️ Duel Vs. AI Master (Turn-Based Score Battle)**: Compete shot-for-shot against an AI Master scoreboard.
4. **🟠 35-Orange Challenge**: High-density gauntlet requiring 35 Orange Peg clears for Extreme Fever.
5. **🎯 1-Ball Trick Shot Puzzle**: Clear the single target Orange Peg with 1 Chrome Ball.
6. **♾️ Endless Peg Regen**: Pegs regenerate after every shot for infinite combo score chasing.
7. **🏗️ Custom Peg Board Architect**: `Shift+Click` on the arena to add custom Orange Pegs and playtest immediately.
8. **🎲 Random Procedural Peg Field (`[G]`)**: Generates symmetric procedural pachinko fields on demand.

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Mouse Move` | Aim the top Rotating Cyber-Cannon (`-78°` to `+78°`) |
| `Left / Right Arrows` or `A / D` | Precision fine-tune cannon angle (`±1.2°`) |
| `Mouse Click` or `Spacebar` | Fire Chrome Ball (or trigger Claude's Pinball Flippers mid-shot) |
| `G` | Generate a new **Random Procedural Peg Field** |
| `R` | Instant Reset Current Stage |
| `M` | Mute / Unmute Ascending Chime & *Ode to Joy* WebAudio Synth |
| `Alt + G` | Toggle Codecaine Game Master FX Post-Processing HUD |
