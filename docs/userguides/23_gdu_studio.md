# 💾 Gdu Studio Pro -- User Guide

**Gdu Studio Pro** is a fast, visual disk usage analyzer and storage explorer workstation built natively for Bun. Designed as a visual counterpart to `gdu` and `gdu-go`, it provides rapid filesystem traversal, proportional visual size bars (`[#####     ]`), directory drill-down navigation, mounted storage disk inspection, and safe file/folder deletion to reclaim storage.

---

## ⚡ Quick Start

```bash
# Launch Gdu Studio Pro desktop workstation
bun run app:gdu

# Launch CLI mode directly
bun run cli:gdu .
bun run cli:gdu -d
bun run cli:gdu -B -C .
```

You can also launch programmatically in TypeScript:
```ts
import { createGduStudio } from "./applications/gdu_studio";
const win = createGduStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

1. **Header Toolbar**:
   - Dynamic theme switcher, Fullscreen toggle, Save Config, and Window Centering.
2. **Disk Usage & Volume Telemetry**:
   - Current directory path, Total consumed storage, Total item count, and Largest item details.
3. **Navigation & Scanner Controls**:
   - **Target Path**: Directory to scan (defaults to `./`).
   - **Sort Order**: Sort by Size (Desc), Name (Asc), Item Count (Desc), or Modified Date.
   - **Min Size**: Filter items smaller than threshold (e.g. `10M`, `500k`).
   - **Decimal SI**: Toggle binary (`MiB`, `GiB`) vs decimal (`MB`, `GB`) units.
   - **Navigation Buttons**: Up to Parent, Drill Down, Rescan, Mounted Disks (`df`), and Delete Item.
4. **Directory Structure & Storage Table**:
   - Interactive table showing Item Name, Type (DIR / FILE), Size, Proportion Bar, Sub-Items count, and Modified Date.
5. **Inspection & Volume Telemetry Console**:
   - Details of selected items and full mounted disk volume listings (`df`).
