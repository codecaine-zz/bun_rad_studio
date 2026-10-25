# 🎳 Codecaine CyberStrike Bowling: 300 Perfect Club -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 3D Perspective 39-Board Maple & Cosmic Lane, 40ft Oil Pattern Hook Physics, 10-Pin Domino Rigid-Body Engine & PBA 300 Scoring + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:bowling]  •  [Headless Server: bun run applications/bowling_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberStrike Bowling: 300 Perfect Club** is a 3D-perspective Ten-Pin Bowling simulation featuring an authentic 39-board maple and cosmic glow lane, a 40-foot synthetic lane oil pattern (glossy low-friction heads transitioning into a high-friction dry backend breakpoint), a 3-ball pro reactive/urethane/polyester arsenal, full 10-pin rigid-body domino chain-reaction physics, an official 10-frame PBA television scoring header, and procedural Web Audio pin-crash foley. Compete in **10-Frame Championship (1P vs Pro AI)**, **2P Pass & Play**, or master impossible conversions in the **Split Spare Clinic**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:bowling

# Launch headless server
bun run applications/bowling_studio.ts --server
```

---

## 🎮 Game Modes & Pro Features

### 1. 🏆 10-Frame Championship (`1P vs Pro AI`) & `2P Pass & Play`
- Challenge three selectable AI pros:
  - **🟢 Alley Amateur**: Casual house-ball bowler (~135–165 average).
  - **🔵 League Semi-Pro**: Consistent pocket stroker (~185–215 average).
  - **🟣 PBA 300 Legend**: High-rev reactive cranker hunting the 1–3 pocket (~235–279+ average).
- Switch to **2P Pass & Play** for local head-to-head 10-frame matches on the dual-row PBA television scoreboard.

### 2. 🎯 Split Spare Clinic (5 Famous Pro Splits)
Practice converting the toughest spares in ten-pin bowling with instant reset and trajectory feedback:
- **`7-10 Bedposts`** (`7, 10`): Clip the outside edge of the `7` or `10` at high speed (`19+ mph`) to bounce a pin across the pit!
- **`Greek Church (4-6-7-9-10)`**: Slide the `6` pin sideways into the `4-7` cluster.
- **`Big Four (4-6-7-10)`**: Slice the inside wall of the `6` pin into the `4-7` on the left side.
- **`Baby Split (3-10)`**: Fit the 8.5-inch bowling ball cleanly between the `3` and `10` pins.
- **`Washout (1-2-4-10)`**: Hook into the right edge of the `1` headpin so it deflects left into `2-4` while the ball continues into `10`.

### 3. 🛢️ 40-Foot Lane Oil Pattern & 3-Ball Pro Arsenal
- **0–40 ft Oiled Zone (Skid & Hook Phase)**: High-gloss conditioner reduces friction so the ball skids along your initial launch line.
- **40–60 ft Dry Backend (Roll & Breakpoint Phase)**: Once the ball exits the 40-foot oil line onto the dry maple backend, its core and coverstock bite into the boards and hook sharply toward the `1–3` (or `1–2`) pocket!
- **3-Ball Pro Arsenal**:
  - **🔵 Reactive Pearl 15lb (`High Hook`)**: Aggressive angular backend snap for deep inside pocket strikes.
  - **🟣 Urethane Control 15lb (`Smooth Arc`)**: Predictable early read and controlled pocket entry.
  - **🟢 Polyester Spare 14lb (`Laser Straight`)**: Minimal friction for picking off single `10`-pin or `7`-pin corner spares without over-hooking.

### 4. 📊 Official 10-Frame PBA Scoring Rules
- **Strike (`X`)**: Knocking down all 10 pins on the first ball of a frame awards `10` plus the total of your **next 2 rolls**. Consecutive strikes trigger **DOUBLE!**, **TURKEY! (`🦃`)**, **HAMBONE (`4x`)**, and up to 12 consecutive strikes for a **300 Perfect Game**!
- **Spare (`/`)**: Knocking down all remaining pins on the second ball of a frame awards `10` plus your **next 1 roll**.
- **10th Frame Bonus**: Rolling a Strike or Spare in the 10th frame unlocks the **3rd bonus roll box** to complete your final score.

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Left / Right Arrows` or `A / D` | Move bowler stance left/right across the 39 approach boards |
| `Up / Down Arrows` or `W / S` | Adjust launch aim angle down the range-finder arrows |
| `Q / E` | Cycle Hook / Spin Curve (`Strong Left` .. `Straight` .. `Strong Right`) |
| `1` / `2` / `3` | Select Arsenal Ball (`Reactive Pearl` / `Urethane Control` / `Polyester Spare`) |
| `Spacebar` or `🎳 BOWL BALL` | Hold & release power meter (or click/drag-and-flick directly on the lane!) |
| `C` | Toggle Maple Hardwood / Cosmic Glow Lane Theme |
| `N` | Start New 10-Frame Match |
| `M` | Mute / Unmute Web Audio Foley Synthesizer |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
