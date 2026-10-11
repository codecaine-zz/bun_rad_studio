# 💊 Dr. Codecaine Arcade -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native HTML5 Canvas & Web Audio Chiptune Synthesizer  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:dr_codecaine]  •  [Headless Server: bun run applications/dr_codecaine_studio.ts --server]
```

---

## 🌟 Executive Overview
**Dr. Codecaine Arcade** is a fast-paced, tactile capsule-matching puzzle arcade experience built natively for Bun RAD Studio. Combining nostalgic color-matching puzzle mechanics with procedural viral pathogens, retro audio synthesis, high-DPI scaling, and responsive desktop windowing, Dr. Codecaine Arcade brings pure arcade energy directly to your desktop workstation.

Featuring an authentic dual-tone capsule falling engine, 60fps physics, gravity cascade chaining, polyphonic square-wave sound effects, and pathogen AI, it offers endless hours of mental sharpness and dopamine-fueled puzzle action.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:dr_codecaine

# Launch headless web server
bun run applications/dr_codecaine_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Dr. Codecaine Desktop](../../screenshots/apps/dr_codecaine_desktop.png) | ![Dr. Codecaine Responsive](../../screenshots/apps/dr_codecaine_responsive.png) |

---

## 🕹️ Gameplay Rules & Core Mechanics

### 1. Dual-Tone Capsule Matching
- **Objective**: Eradicate all viral pathogens in the pill jar before the capsules stack up to the top neck.
- **Tricolor Palette**:
  - 🔴 **Red Pathogen & Pill Segment** (Fever)
  - 🟡 **Yellow Pathogen & Pill Segment** (Jaundice)
  - 🔵 **Blue Pathogen & Pill Segment** (Chills)
- **4-in-a-Row Alignment**: Align 4 or more matching color segments horizontally or vertically to dissolve the cluster and eradicate any embedded pathogens.

### 2. Gravity & Cascade Multiplier Chains
- When a horizontal or vertical match dissolves, any unsupported capsule halves above it drop under real gravity.
- If falling halves create new matches upon landing, you trigger a **Cascade Chain**, multiplying your score exponentially (2x, 4x, 8x, 16x) and clearing the board in style.

### 3. Difficulty & Progression Modes
- **Speed Settings**:
  - `LOW`: Relaxed pacing, ideal for warm-up and deep tactical planning.
  - `MED`: Standard arcade speed, rapid reflexes required.
  - `HI`: High-speed descent for competitive high-score marathon runs.
- **Virus Count Slider**: Scale initial pathogen count from 1 up to 20 pathogens per stage.

---

## ⌨️ Desktop Keyboard & Gamepad Controls

| Action | Primary Key | Secondary Key |
| :--- | :--- | :--- |
| **Move Left** | `←` Left Arrow | `A` |
| **Move Right** | `→` Right Arrow | `D` |
| **Soft Drop (Accelerate)** | `↓` Down Arrow | `S` |
| **Hard Drop (Instant)** | `Space` | `Enter` |
| **Rotate Clockwise** | `↑` Up Arrow | `W` / `X` |
| **Rotate Counter-Clockwise** | `Z` | `Shift` |
| **Pause / Resume** | `P` | `Escape` |
| **Restart Level** | `R` | — |
| **Toggle Fullscreen** | `F` | `F11` |

---

## 💡 Pro Tips & Strategic Masterclass
- **Build Horizontal Foundations**: Try to place capsules flat horizontally across the floor to build stable bases before dropping vertical colors.
- **Watch Next Pill Window**: Always check the "NEXT" capsule preview in the top right to plan where your next colors will drop before your current pill touches down.
- **Set Up Cascade Combos**: Leave a suspended matching half-capsule ready to fall into place when a lower virus dissolves.
