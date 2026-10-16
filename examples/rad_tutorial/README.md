# RAD tutorial programs

The programs from the video tutorial "Build Desktop Apps Fast With Bun". Each one is a complete file. Run it from the repository folder:

```bash
bun run examples/rad_tutorial/01_quickstart.ts
```

| File | What it teaches | Reference |
|---|---|---|
| `01_quickstart.ts` | A window, a card, two fields and a button with a click handler | [SimpleGUI API, quick start](../../docs/SIMPLEGUI_API.md) |
| `02_layout.ts` | Rows, grids, cards, headings and the status bar | [Layout](../../docs/SIMPLEGUI_API.md) |
| `03_controls.ts` | Form fields, a drop down, a slider, a switch, meters, a table and a badge | [Controls](../../docs/SIMPLEGUI_API.md) |
| `04_state.ts` | The state store, `bindState`, `onStateChange`, changing the theme at run time | [State and binding](../../docs/SIMPLEGUI_API.md) |
| `05_dialogs_menus.ts` | Menu bar, toolbar, timer, info / warn / ask dialogs, `withBusyState` | [Dialogs, timers, menus](../../docs/SIMPLEGUI_API.md) |
| `06_themes.ts` | Choosing any of the built-in themes while the program runs | [Themes](../../docs/THEMES.md) |
| `07_contacts.ts` | A finished app: table, search, form, confirm dialog and a SQLite file | [rad modules](../../src/features/rad/README.md) |
| `10_rad_modules.ts` | Text, file, SQLite, maths, time, hashing and cache helpers as plain functions | [rad modules](../../src/features/rad/README.md) |
| `11_system_tools.ts` | fd, sd, tokei, gdu and watchexec called from code | [System utilities](../../docs/SYSTEM_UTILITIES_API.md) |

The windows are created by `createQuickstart()`, `createLayout()` and so on, and only open when the file is run directly. That is how the video tooling (`bun scripts/tutorial_rad.ts`) shows them inside a web page next to their code.

To turn any of them into one program: `bun build --compile examples/rad_tutorial/01_quickstart.ts --outfile my-app`.
