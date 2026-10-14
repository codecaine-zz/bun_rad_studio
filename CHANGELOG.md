# Changelog

All notable changes. The project has no versioned releases yet, so everything is under **Unreleased**. Each entry points to the record of what was observed and how it was checked in [discrepancies](docs/documentation-maintenance/discrepancies.md). History before 13 October 2026 is only in git.

## Unreleased (13 October 2026 review)

### Added

- **`LICENSE` (MIT, © 2026 Jerome Scott)** and `"license": "MIT"` in `package.json`. The README already declared MIT and its badge linked to a `LICENSE` file that did not exist. Licenses of bundled third-party assets were not audited.
- `SECURITY.md` (how to report a problem and what is in scope) and this changelog.

### Behaviour changes to know about

- **Library server helpers listen on `127.0.0.1` by default.** `serveStatic` and `createWsHub` (RAD `serverutils`) and `Sys.serve` / `Sys.serveStatic` (SimpleCLI) used to listen on all network interfaces. Pass `hostname` (for example `"0.0.0.0"`) to expose a server on purpose ([D-037](docs/documentation-maintenance/discrepancies.md#d-037)).
- **Designer keyboard and dialogs:** Enter or Space on a palette item now places the control; Alt + arrows resize; Escape closes any dialog; editing shortcuts are ignored while a dialog is open ([D-035](docs/documentation-maintenance/discrepancies.md#d-035), [D-036](docs/documentation-maintenance/discrepancies.md#d-036)).
- **Designer autosave:** the open form is copied to `~/.bun_rad_studio/designer_draft.json` after each change, and a banner offers to restore it on the next start ([D-039](docs/documentation-maintenance/discrepancies.md#d-039)).
- **Export keeps your edits:** a generated file that would change is first kept as `<name>.bak-<time>` ([D-022](docs/documentation-maintenance/discrepancies.md#d-022)).
- **Import** warns before loading a layout that contains event scripts ([D-024](docs/documentation-maintenance/discrepancies.md#d-024)).

### Security

- Every studio HTTP server binds to loopback and refuses foreign `Origin` and `Host` headers; a test fails if a new `Bun.serve` has no `hostname` or no guard ([D-012](docs/documentation-maintenance/discrepancies.md#d-012), [D-013](docs/documentation-maintenance/discrepancies.md#d-013), [D-037](docs/documentation-maintenance/discrepancies.md#d-037)).
- Code Studio no longer runs commands for any web page.
- Crafted layouts can no longer inject code through titles, sizes or other generated-code fields ([D-021](docs/documentation-maintenance/discrepancies.md#d-021)); the Audit report escapes ids and the form title ([D-041](docs/documentation-maintenance/discrepancies.md#d-041)).
- A test-only package (`jsdom`) moved out of runtime dependencies; `bun audit` is clean ([D-029](docs/documentation-maintenance/discrepancies.md#d-029)).

### Fixed

- `bun start` crashed at launch ([D-001](docs/documentation-maintenance/discrepancies.md#d-001)); the designer page's script was cut short so the page did nothing, and its Import, Keys and Audit dialogs could never appear ([D-016](docs/documentation-maintenance/discrepancies.md#d-016), [D-017](docs/documentation-maintenance/discrepancies.md#d-017)).
- Exported projects did not parse ([D-011](docs/documentation-maintenance/discrepancies.md#d-011)); Import could corrupt the open form ([D-018](docs/documentation-maintenance/discrepancies.md#d-018)).
- Run only worked from the project folder ([D-023](docs/documentation-maintenance/discrepancies.md#d-023)); Frogger, Snake and Tetris only started from the repository root ([D-038](docs/documentation-maintenance/discrepancies.md#d-038)). Run now keeps the preview's output in `.rad_preview/preview.log` and shows failures in the status bar ([D-040](docs/documentation-maintenance/discrepancies.md#d-040)).
- The launcher listed library files as applications ([D-014](docs/documentation-maintenance/discrepancies.md#d-014)); the Redis studio crashed when started directly ([D-015](docs/documentation-maintenance/discrepancies.md#d-015)).
- Real defects found while removing 679 type errors, such as the PostgreSQL dump header, game window titles and the unified `src/index.ts` exporting undefined names ([D-026](docs/documentation-maintenance/discrepancies.md#d-026), [D-027](docs/documentation-maintenance/discrepancies.md#d-027)).

### Accessibility (designer page only)

- Visible keyboard focus, a keyboard-reachable palette, readable button contrast in every theme ([D-031](docs/documentation-maintenance/discrepancies.md#d-031), [D-019](docs/documentation-maintenance/discrepancies.md#d-019)); component Tree rows can be selected (also as ranges) from the keyboard ([D-035](docs/documentation-maintenance/discrepancies.md#d-035)). Not tested with a screen reader. Details: [Accessibility](docs/accessibility.md).

### Developer and project health

- **Linux:** the automated suite passes in CI on `ubuntu-latest` (1,224 pass, 0 fail) with `libwebkitgtk-6.0-4 libgtk-4-1 xvfb xclip` installed; Windows still fails 31 of 1,400 tests and is unsupported ([D-042](docs/documentation-maintenance/discrepancies.md#d-042)). On Linux, **Copy no longer stalls** when `xclip` or `wl-copy` is installed, and the type-check ratchet and docs generator are portable.

- A macOS CI workflow (type-check ratchet, documentation check, tests); the type-error baseline is 0 ([D-020](docs/documentation-maintenance/discrepancies.md#d-020), [D-032](docs/documentation-maintenance/discrepancies.md#d-032), [D-033](docs/documentation-maintenance/discrepancies.md#d-033)).
- Tests no longer depend on the author's machine: Redis, MySQL, PostgreSQL and live-network tests are opt-in ([D-032](docs/documentation-maintenance/discrepancies.md#d-032)); generated files are no longer tracked or modified by test runs ([D-006](docs/documentation-maintenance/discrepancies.md#d-006), [D-025](docs/documentation-maintenance/discrepancies.md#d-025), [D-030](docs/documentation-maintenance/discrepancies.md#d-030)).
- **The designer page is edited as 23 parts in `src/ide/`** and built into the (still committed, byte-identical) `src/ide.html` with `bun run ide:build`; `bun run ide:check` and a CI step catch drift. Refactor only ([D-044](docs/documentation-maintenance/discrepancies.md#d-044)).
- 14 game servers now share `src/studio_server.ts` (−924 lines, no behaviour change) ([D-034](docs/documentation-maintenance/discrepancies.md#d-034)).
- A documentation handbook under [docs/](docs/index.md) with an automated link and command check; open and unverified items are listed in [discrepancies](docs/documentation-maintenance/discrepancies.md) and the [risk register](docs/documentation-maintenance/baseline-and-risks.md).
