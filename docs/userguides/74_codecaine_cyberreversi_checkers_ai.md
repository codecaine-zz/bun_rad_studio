# ⚪ Codecaine CyberReversi & Checkers AI -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Dual 8×8 Strategy Workstation, Alpha-Beta Minimax AI & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:reversi_checkers]  •  [Headless Server: bun run applications/reversi_checkers_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberReversi & Checkers AI** combines two iconic 8×8 board strategy classics—**CyberReversi (Othello)** and **CyberCheckers (Championship Draughts)**—into a unified neon workstation. Challenge three tiers of Alpha-Beta Minimax AI (`Cadet`, `Tactical`, `Grandmaster`) or play **2-Player Local Versus**, complete with flip-count indicators, animated disc-flip waves, multi-jump capture chains, **Move Undo (`Z`)**, **Grandmaster Move Hints (`H`)**, and a live **Positional Advantage Bar**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:reversi_checkers

# Launch headless server
bun run applications/reversi_checkers_studio.ts --server
```

---

## ♟️ Dual Game Modes & AI Systems

### 1. CyberReversi (Othello)
- Place **Cyan** (`P1`) or **Magenta** (`P2 / AI`) discs on the 8×8 grid to outflank opponent lines horizontally, vertically, or diagonally.
- **Exact Flip-Count Indicators**: Every legal move square displays a glowing ring with the exact number of opponent discs that move will flip (`+1`, `+3`, `+6`, etc.).
- **Corner-Weighted Positional AI**: The Alpha-Beta Minimax engine prioritizes high-value corner anchors (`+120` weight), avoids dangerous X-squares adjacent to open corners, and maximizes move mobility.

### 2. CyberCheckers (Championship Draughts)
- Advance pieces diagonally across dark squares and jump opponent pieces to capture them.
- **Mandatory Capture & Multi-Jump Chains**: When a jump capture is available, capturing is mandatory; if the landing square enables another immediate jump, a multi-jump chain continues automatically.
- **King Crowning (`👑`)**: Reaching the opponent's back rank crowns your piece into a **King (`👑`)** capable of moving and jumping both forward and backward.

### 3. AI Difficulty Tiers & Advantage Telemetry
- Switch anytime between **🤖 Cadet AI**, **🧠 Tactical AI**, **⚡ Grandmaster AI**, and **👥 2P Local Versus**.
- The **Positional Advantage Bar** continuously tracks material and positional dominance between Cyan and Magenta.

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Left Click / Tap` | Place Reversi Disc or Select / Move Checkers Piece |
| `Arrow Keys` / `WASD` | Move 8×8 Board Selection Cursor |
| `Enter` / `Space` | Confirm Selection / Execute Move at Cursor |
| `1` / `2` | Switch Mode (`1` = CyberReversi, `2` = CyberCheckers) |
| `Z` | Undo Last Turn |
| `H` | Request Grandmaster Minimax AI Best-Move Hint |
| `N` | Start New Match |
| `M` | Mute / Unmute Web Audio Synthesizer |
| `?` | Open / Close Strategy Manual Modal |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
