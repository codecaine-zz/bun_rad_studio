# 🃏 Codecaine Solitaire Royale: Klondike, Spider & FreeCell -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 3-in-1 Patience Suite, Smart Hint Engine & Win95 Victory Cascade + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:solitaire]  •  [Headless Server: bun run applications/solitaire_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Solitaire Royale: Klondike, Spider & FreeCell** brings the three most iconic desktop card games in history into one authentic casino-felt Bun RAD Studio suite. Every card is rendered like a **real physical Bicycle/Casino playing card**—complete with warm ivory linen card stock, 3D tabletop drop shadows, top-left and 180°-rotated bottom-right corner indices, traditional multi-pip layouts for ranks `2`–`10` (with inverted lower pips), an ornate Ace of Spades medallion, gold-framed court portraits for Jacks, Queens, and Kings, and crimson-and-gold guilloché lattice card backs. Switch seamlessly between **Klondike (Draw 1 & Draw 3)**, **FreeCell (8 Cascades, 4 Free Cells, 4 Foundations)**, and **Spider Solitaire (1-Suit & 2-Suit)**, with **Double-Click / `A` Auto-Move to Foundation**, **Smart Hint (`H`)**, **Unlimited Undo (`Z`)**, and the legendary **Windows 95 Bouncing Cards Waterfall Animation (`🎆 Cascade`)**!

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:solitaire

# Launch headless server
bun run applications/solitaire_studio.ts --server
```

---

## 🎮 Gameplay Modes & Rules

1. **Klondike (Draw 1 / Draw 3)**:
   - Build the 7 tableau cascades down in **alternating colors** (`Red` on `Black`, `Black` on `Red`). Empty tableau columns accept **Kings** (or stacks starting with a King).
   - Build the 4 foundations up by suit from **Ace (`A`) to King (`K`)**.
2. **FreeCell**:
   - All 52 cards are dealt face-up across 8 cascades. Use the **4 Free Cells** (top-left) as temporary single-card buffers while sorting all 4 suits (`A` → `K`) onto the **4 Foundations** (top-right).
3. **Spider (1-Suit & 2-Suit)**:
   - 104 cards (2 decks) across 10 columns plus 5 stock deal bundles of 10 cards.
   - Any card can be placed on a card one rank higher (`7` on `8`), and groups of cards sharing the **same suit** in descending sequence can be moved together.
   - Completing a full `K` → `A` same-suit run automatically sweeps the 13-card stack to the foundation!
4. **Win95 Bouncing Cards Waterfall (`🎆 Cascade` / `W`)**:
   - Complete any game—or click **🎆 Cascade** at any time—to launch the nostalgic Windows 95 bouncing card trail waterfall across the canvas!

---

## 🕹️ Controls Reference

| Action | Primary Control | Alternate Control |
| :--- | :--- | :--- |
| **Move Card / Stack** | `Drag & Drop` | `Click Source` → `Click Destination` |
| **Auto-Send to Foundation** | `Double Click` Card | Press `A` (Sweeps all eligible cards) |
| **Deal from Stock Pile** | `Click Stock Pile` | Press `D` or `Space` |
| **Smart Move Hint** | `H` | Click **💡 Hint (`H`)** Button |
| **Unlimited Undo** | `Z` | `Backspace` or **⏪ Undo (`Z`)** Button |
| **Win95 Card Waterfall** | `W` | Click **🎆 Cascade** Button |
| **New Deal** | `N` | Click **⚡ New Deal** Button |
| **Mute / Unmute Synthesizer** | `M` | Click **🔊 Audio** Button |
| **Game Master FX HUD** | `Alt + G` | — |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
