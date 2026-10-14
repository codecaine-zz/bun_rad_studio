# Terminal library (vendored)

The File Manager's terminal panel uses **xterm.js** (MIT). Only the ES-module builds are kept, so the page needs no
install step and loads nothing from the network.

| File | From | Version |
|---|---|---|
| `xterm.mjs`, `xterm.css` | `@xterm/xterm` (`lib/xterm.mjs`, `css/xterm.css`) | 6.0.0 |
| `addon-fit.mjs` | `@xterm/addon-fit` (`lib/addon-fit.mjs`) | 0.11.0 |
| `LICENSE-xterm.txt` | both packages' licence files | |

Changes made to the upstream files (both are checked by `tests/file_manager_ui_structure.test.ts`):

1. The `//# sourceMappingURL=` lines were removed (the maps are not shipped).
2. `xterm.mjs` creates three `<style>` elements, which the page's strict Content-Security-Policy would block. They are now
   created through `__fmStyle(document)` (defined at the top of the file), which gives each one the nonce from
   `<meta name="fm-nonce">`. The server makes a new nonce for every page load, so `unsafe-inline` is not needed.

To update: install the new version in a scratch folder, copy the files above, repeat changes 1 and 2, and run
`bun test tests/file_manager_ui_structure.test.ts tests/file_manager_terminal.test.ts`.
