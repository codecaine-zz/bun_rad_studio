# ⚡ Codecaine CyberQix: Laser Territory Claim -- Complete Production User Guide

![Codecaine CyberQix Banner](../../screenshots/apps/qix_desktop.png)

```
Version: 2.5.0  •  Port: 3271  •  Engine: 160×100 Vector Grid Territory Slicer, Flood-Fill Cavity Solver, Harmonic Plasma Qix & Volfied Power Cubes + Game Master FX (Alt+G)
Launchers: [Desktop GUI: bun run app:qix]  •  [Headless Server: bun run applications/qix_studio.ts --server]
```

---

## 🌟 Executive Overview

**Codecaine CyberQix: Laser Territory Claim** is a 60fps HTML5 Canvas tribute to Taito's 1981 vector arcade masterpiece **Qix** (designed by Randy & Sandy Pfeiffer) and its 1989 sci-fi sequel **Volfied** (*Ultimate Qix*).

Pilot your **Diamond Perimeter Marker (`💎`)** along the neon containment wire, venture into unclaimed void leaving a glowing **Stix Laser Trail**, and complete closed loops to flood-fill and claim crystalline territory while evading the undulating **Harmonic Plasma Qix** and patrolling **Perimeter Sparx**.

---

## 🚀 Quick Start & Launch

```bash
# Launch Desktop Studio GUI
bun run app:qix

# Launch Headless HTTP Server on Port 3271
bun run applications/qix_studio.ts --server
```

---

## ⚡ Core Territory-Slicing Mechanics (`160 × 100` High-Res Grid)

### 1. Fast Draw (`1×` Cyan) vs. Slow Draw (`2×` Amber)
- **Perimeter Navigation**: Move safely along any `BORDER` cell (`#00f5d4`) using `WASD` or `Arrow Keys`.
- **Fast Draw (`Hold [SPACE]`)**: Step into `UNCLAIMED` space at full speed leaving a cyan Stix laser trail. Captured polygons award **`1×` standard points**.
- **Slow Draw (`Hold [SHIFT]` or Toggle `🐢 Slow 2×`)**: Step into `UNCLAIMED` space at half speed leaving a high-voltage amber/magenta Stix trail. Captured polygons award **DOUBLE (`2×`) points**!

### 2. Flood-Fill Cavity Capture & Split-Qix Multiplier (`2×`–`4×`)
- Reaching any `BORDER` cell completes the circuit and triggers the **BFS Cavity Flood-Fill Solver**:
  - Identifies which cavity contains the **Harmonic Plasma Qix** and converts all non-Qix cavities (plus your Stix trail) into glowing crystalline `CLAIMED` territory.
  - **♊ Split-Qix Bonus (`2×` → `4×` Multiplier)**: Drawing a Stix line that separates two **Qix Cores** into two isolated cavities triggers a **Split-Qix Bonus**, capturing the smaller cavity and permanently upgrading your **Core Score Multiplier**!

### 3. Stix Fuse (`🔥`) & Volfied Power Cubes (`🧊`)
- **Stix Fuse**: Hesitating mid-draw in unclaimed space ignites a sizzling **Fuse (`🔥`)** at the base of your Stix trail that burns toward your marker until you resume moving!
- **Volfied Power Cubes**: Enclosing floating 3D holo-cubes inside captured territory activates tactical bonuses:
  - `⏱️ Sparx Freeze`: Freezes all patrolling Perimeter Sparx for 6 seconds.
  - `⚡ Speed 1.8×`: Boosts Stix drawing velocity by `1.8×`.
  - `🔫 Plasma Gun [F]`: Arms twin laser cannons to vaporize patrolling Sparx (`+1,000 PTS`).
  - `🛡️ Stix Shield`: Absorbs one Qix or Sparx collision without shattering your trail.

---

## 🎮 Complete Guide to All 8 Game Modes (`#qixModeSelect`)

| # | Mode Name | Target | Special Mechanics |
| :--- | :--- | :---: | :--- |
| **1** | **🏆 Classic Qix (75% Target)** | `75%` | Authentic 1981 Taito vector rules with Twin Qix & Overfill Bonuses |
| **2** | **🛡️ Volfied Power-Cube Mode** | `80%` | High-density Volfied Power Cubes & Plasma Cannon combat |
| **3** | **♊ Split-Qix Twin Core** | `75%` | Dual Harmonic Plasma Qix cores focused on `2×`–`4×` Split-Qix slicing |
| **4** | **🐢 Slow-Draw 2x High-Risk** | `75%` | Locked high-voltage Amber Slow-Draw (`2×` points on every capture) |
| **5** | **⚡ 90s Speed Slice Blitz** | `75%` | 90-second score attack caravan mode with rapid cube respawns |
| **6** | **🌌 90% Precision Grandmaster** | `90%` | Extreme 90% territory requirement demanding razor-close Qix slices |
| **7** | **🤖 Vs. AI Territory Race** | `75%` | Compete against a Rival Cyber-Slicer claiming crimson sectors |
| **8** | **🧘 Zen Neon Weaver** | `∞` | Invulnerable neon polygon art sandbox with zero life loss |

---

## ⌨️ Controls & Keyboard Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `WASD` or `Arrow Keys` | Steer Perimeter Marker (`💎`) along borders or through unclaimed void |
| `Hold SPACE` | **Fast Draw (`1×` Cyan Stix)** into unclaimed territory |
| `Hold SHIFT` | **Slow Draw (`2×` Amber Stix)** for double capture points |
| `E` | Toggle **Auto-Draw Latch** (draw without holding Space/Shift) |
| `F` | Fire **Volfied Plasma Laser Cannon** along heading |
| `H` or `Click Canvas` | Trigger **AI Precision Tactical Slice** demonstration |
| `R` | Reset current stage arena |
| `M` | Toggle WebAudio Synthwave Arpeggiator BGM & Laser SFX |
| `1` – `8` | Instant switch between all 8 Game Modes |
