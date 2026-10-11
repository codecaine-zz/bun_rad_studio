# 🍄 Codecaine Bros. Arcade -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: 1983 Bumping Arcade Physics & 4-Channel Polyphonic Synth  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:codecaine_bros]  •  [Headless Server: bun run applications/codecaine_bros_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Bros. Arcade** is an authentic, overclocked remaster of the legendary 1983 Mario Bros. sewer arcade platformer built natively for Bun RAD Studio. Re-engineered with responsive bumping physics, polyphonic square-wave sound bursts, an interactive suspended POW block, and multiplier combo cascades.

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

## 🕹️ Core Mechanics & Rules
- **Under-Platform Bumping**: Unlike later games where you jump on top of enemies, in Codecaine Bros. you must run underneath the platforms and **jump to hit the ceiling directly beneath the enemy** to flip them onto their backs.
- **Kicking Flipped Enemies**: Once an enemy is flipped and stunned, jump up to their ledge and run into them to kick them off the screen into the sewer water for bonus points!
- **Interactive POW Block**: Hitting the central POW block causes an earthquake that flips all grounded enemies simultaneously. Conserve its 3 charges!
- **Enemy Escalation**:
  - **Spinies**: Require 1 hit from beneath.
  - **Fighter Flies**: Hop along platforms; must be hit when touching down.
  - **Sidesteppers (Crabs)**: Require 2 bumps: 1st hit angers them and speeds them up; 2nd hit flips them.
  - **Freezies**: Slide across ledges turning platforms into slippery ice; hit them before they freeze the floor!

---

## ⌨️ Desktop Controls Reference

| Action | Player 1 (Keyboard) | Player 2 (Keyboard) |
| :--- | :--- | :--- |
| **Move Left / Right** | `A` / `D` or `←` / `→` | `J` / `L` |
| **Jump** | `Space` or `W` or `↑` | `I` or `K` |
| **Pause** | `P` | `P` |
| **Restart** | `R` | `R` |
| **Fullscreen** | `F` / `F11` | `F` / `F11` |
