# 🐭 Rodent's Revenge Deluxe -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native HTML5 Canvas & Retro Sound Synthesis  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:rodents_revenge]  •  [Headless Server: bun run applications/rodents_revenge_studio.ts --server]
```

---

## 🌟 Executive Overview
**Rodent's Revenge Deluxe** is a high-DPI modern arcade revival of the classic 1991 Microsoft Windows puzzle game, rebuilt natively for Bun RAD Studio. You control a clever mouse trapped inside a grid crawling with hungry hostile cats.

By pushing movable green blocks, you must outmaneuver the feline predators, trap them so they cannot move, and turn them into delicious wedges of score-multiplying cheese!

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Rodents Revenge Desktop](../../screenshots/apps/rodents_revenge_desktop.png) | ![Rodents Revenge Responsive](../../screenshots/apps/rodents_revenge_responsive.png) |

---

## 🕹️ Gameplay & Strategic Rules
- **Pushing Blocks**: The mouse can push a single movable block or a whole row of blocks if there is an empty space at the end.
- **Trapping Cats**: When a cat has zero valid moves left on any of its four adjacent tiles, it transforms into a wedge of cheese worth bonus points.
- **Obstacles**: Watch out for mousetraps, yarn balls, sinkholes, and perimeter border barriers.
- **Level Progression**: Clear all cats on the board to advance to the next level with faster cats and tighter grids.

---

## ⌨️ Controls Reference

| Action | Primary Key | Secondary Key |
| :--- | :--- | :--- |
| **Move Up / Down / Left / Right** | Arrow Keys | `W`, `S`, `A`, `D` |
| **Pause Game** | `P` | `Escape` |
| **Restart Level** | `R` | — |
| **Toggle Sound** | `M` | — |
| **Fullscreen** | `F` | `F11` |
