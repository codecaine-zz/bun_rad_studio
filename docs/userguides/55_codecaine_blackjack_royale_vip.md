# 🪙 Codecaine Blackjack Royale VIP -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Multi-Hand 6-Deck Shoe Engine, Hi-Lo Telemetry & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:blackjack]  •  [Headless Server: bun run applications/blackjack_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Blackjack Royale VIP** is a high-roller multi-hand casino 21 studio built natively for Bun RAD Studio. Play up to 3 simultaneous betting spots with authentic 6-deck shoe dealing, Split, Double Down, Insurance, and optional Side Bets (Perfect Pairs & 21+3), optional Hi-Lo running/true count & basic-strategy trainer telemetry, custom Codecaine Royale vector cards, and the **Codecaine Game Master FX & Post-Processing Engine (`Alt+G`)**.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:blackjack
bun run app:21

# Launch headless server
bun run applications/blackjack_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Codecaine Blackjack Royale VIP Desktop](../../screenshots/apps/blackjack_desktop.png) | ![Codecaine Blackjack Royale VIP Responsive](../../screenshots/apps/blackjack_responsive.png) |

---

## 🕹️ Controls Reference
- **Place Chips & Deal**: Click chip denominations and betting spots, then click **Deal**
- **Hit / Stand / Double / Split**: Action buttons or keys (`H`, `S`, `D`, `P`)
- **Game Master FX HUD**: `Alt + G`

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
