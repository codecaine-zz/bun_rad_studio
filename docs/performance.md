# Performance

What was measured, under what conditions, and what the numbers do **not** show. Nothing here is a claim about other machines, other operating systems or real user workloads. The original 13 October 2026 baseline is preserved alongside the `v1.5.3` measurements and build/tooling optimizations verified on the same hardware class.

## Contents

- [Conditions](#conditions)
- [Results](#results)
- [What was found](#what-was-found)
- [Not measured](#not-measured)
- [How to repeat it](#how-to-repeat-it)

## Conditions

- **Initial baseline (13 October 2026)**: Apple M4 Pro, 14 cores, macOS 27.0.1, Bun 1.4.2, warm file cache, no other heavy work running.
- **`v1.5.3` re-measurement (November 2026)**: Apple M4 Pro, 14 cores (48 GB RAM), macOS 27.2.1 (`darwin arm64`), Bun 1.4.4, warm file cache, uncontended CPU. Times are wall-clock milliseconds from `performance.now()` or `time`; "median" is the middle of 3 to 5 runs.

## Results

| What | Oct 2026 Baseline (Bun 1.4.2) | `v1.5.3` Verified (Bun 1.4.4) |
|---|---|---|
| Build the library (`bun run build`) | about 40 ms; 818 KB `dist/index.js` | **11.5 ms**; 1.45 MB (`355.5 KiB` gzip) |
| Type-check ratchet (`bun run typecheck`) | cold `tsc --noEmit` | **43.1 s cold -> ~1.6 s warm** (`tsconfig.json` `incremental` + static JS bundle exclusions) |
| Full test suite (`bun test` / `bun run test:fast`) | 84 s wall-clock for 1,322 tests (105 files) | **278 files, 6,380+ tests**; `db_samples_large.test.ts` runs in **~1.7 s** by default (`TEST_LARGE_SAMPLES=1` for 2.8M-row stress scale); `bun run test:fast` shards independent suites in parallel |
| Start a headless studio and get its first page | 32 studios: min 23 ms, median 24 ms, max 120 ms | **74 studios**: min **32.8 ms**, median **35.0 ms**, max **155.9 ms**; idle RSS **54.9–111.8 MiB** (median **59.2 MiB**) |
| Launcher scan of all tools (`scanWorkspaceApps`) | about 92 ms | **130.4 ms** median across **209** detected tools |
| Generate the designer page (`getIdeHtml`) | under 1 ms; 386 KB | **0.17 ms** median (`0.68 ms` p95) |
| Generate the preview page (`generatePreviewHtml`) | 100 ctrls 0.6 ms, 1,000 ctrls 1.4 ms, 4,000 ctrls 6.4 ms | **0.29 ms / 1.03 ms / 4.62 ms** median |
| Export a project (`exportProjectHelper`, three files) | 100 ctrls 0.9 ms, 1,000 ctrls 4.5 ms, 4,000 ctrls 22 ms | **0.55 ms / 3.70 ms / 19.29 ms** median |
| Size of the generated page | about 2.7 KB per control | about 1.3–2.7 KB per control (`184.6 KiB` gzip at 4,000 single-handler controls) |

**Designer page in a browser** (Chromium-based, one run per size; the page was driven through its own functions):

| Controls on the form | Import | One more edit (snapshot for undo plus full re-render) | Undo | DOM nodes |
|---|---|---|---|---|
| 50 | 4 ms | 4 ms | 2 ms | about 2,000 |
| 500 | 17 ms | 19 ms | 23 ms | about 11,000 |
| 1,000 | 40 ms | 35 ms | 35 ms | about 21,000 |
| 2,000 | 63 ms | 70 ms | 67 ms | about 41,000 |

## What was found

- **Everything measured scales roughly linearly** with the number of controls. No quadratic behavior showed up in generation, export, import, edit or undo up to 4,000 controls (generation) and 2,000 controls (page).
- **Every edit re-renders the whole canvas** (the "one more edit" column). At 2,000 controls that is about 70 ms per edit, which will feel slow while dragging (not measured). Forms of a few hundred controls are far below that.
- **Undo history is bounded** at 41 snapshots (`saveHistoryState` in `src/ide.html`), each a full JSON copy of the form, so memory is bounded too (memory was not measured).
- Studio start-up is dominated by starting Bun itself; the first page is served within about 25 ms for all but one studio.
- **Code Studio's workspace search** reads files on the server's thread up to 300 matches. On the initial repository snapshot (1,460 searchable files, 67 MB, of which 47.5 MB PNG screenshots) a zero-hit search dropped from **340 ms** to **31 ms** after skipping binary extensions ([D-043](documentation-maintenance/discrepancies.md#d-043)), and `v1.5.3` also excludes generated `release/` / cache trees and pre-filters file text before splitting lines.
- **Build, packaging and installer optimizations (`v1.5.3`)**: `tsconfig.json` enables incremental `.tsbuildinfo` caching and excludes pre-bundled browser JS assets (`43.1 s` cold down to `~1.6 s` warm); `makeIcns` (`scripts/release/icons.ts`) runs all 10 `sips` iconset resizes concurrently via `Promise.all`; `postinstall` skips rewriting the `bin/` Homebrew wrappers when `bin/manifest.json` already matches `package.json`; and the Linux Ollama installer streams `.tar.zst` archives directly to disk while hashing with `Bun.CryptoHasher("sha256")` instead of buffering multi-gigabyte archives in RAM.

## Not measured

Real window start-up (the native window opening), memory use, idle CPU, the database layer with large tables (the Workbench has its own large-data test, `tests/db/large_data.test.ts`, which checks correctness, not speed), the games' frame rates, drag and resize in the designer, any other machine, Windows and Linux.

## How to repeat it

The measurements used throw-away scripts that were not kept. To repeat the generation and export numbers, call `generatePreviewHtml(spec)` and `exportProjectHelper(JSON.stringify(spec), dir)` from `index.ts` in a loop with `performance.now()` for specs of different sizes. For start-up times, spawn `bun applications/<studio>.ts --server --port 0` and time until the first `GET /` returns. Record the machine and Bun version next to any numbers you publish.

## See also

- [Testing](testing/index.md)
- [Baseline and risks](documentation-maintenance/baseline-and-risks.md)
