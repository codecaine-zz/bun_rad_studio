# Performance

What was measured, under what conditions, and what the numbers do **not** show. Nothing here is a claim about other machines, other operating systems or real user workloads. No "before and after" comparison exists because nothing was optimised: the numbers are a baseline.

## Contents

- [Conditions](#conditions)
- [Results](#results)
- [What was found](#what-was-found)
- [Not measured](#not-measured)
- [How to repeat it](#how-to-repeat-it)

## Conditions

Measured on 13 October 2026 on one machine: Apple M4 Pro, 14 cores, macOS 27.0.1, Bun 1.4.2, a warm file cache, no other heavy work running. Times are wall-clock milliseconds from `performance.now()` or `time`. "Median" is the middle of 3 to 5 runs.

## Results

| What | Result |
|---|---|
| Build the library (`bun run build`) | about 0.04 s; writes an 818 KB `dist/index.js` |
| Full test suite (`bun test`) | 84 s wall-clock for 1,322 tests; the process and the children it waited for used about 47 s of CPU (33 s user, 13 s system), so roughly half of the time is waiting (server start-ups, subprocesses, timeouts) |
| Application smoke test | under 1 s for 73 imports and 32 headless starts (they run in parallel batches) |
| Start a headless studio and get its first page | 32 studios: minimum 23 ms, median 24 ms, maximum 120 ms (Task Manager). Measured as process start to the first `GET /` answered |
| Launcher scan of all tools (`scanWorkspaceApps`) | about 92 ms |
| Generate the designer page (`getIdeHtml`) | under 1 ms; the page is 386 KB |
| Generate the preview page for a form | 100 controls 0.6 ms, 1,000 controls 1.4 ms, 4,000 controls 6.4 ms (median) |
| Export a project (`exportProjectHelper`, includes writing three files) | 100 controls 0.9 ms, 1,000 controls 4.5 ms, 4,000 controls 22 ms |
| Size of the generated page | about 2.7 KB per control: 1,000 controls is 2.7 MB, 4,000 controls is 10.8 MB |

**Designer page in a browser** (Chromium-based, one run per size; the page was driven through its own functions):

| Controls on the form | Import | One more edit (snapshot for undo plus full re-render) | Undo | DOM nodes |
|---|---|---|---|---|
| 50 | 4 ms | 4 ms | 2 ms | about 2,000 |
| 500 | 17 ms | 19 ms | 23 ms | about 11,000 |
| 1,000 | 40 ms | 35 ms | 35 ms | about 21,000 |
| 2,000 | 63 ms | 70 ms | 67 ms | about 41,000 |

## What was found

- **Everything measured scales roughly linearly** with the number of controls. No quadratic behaviour showed up in generation, export, import, edit or undo up to 4,000 controls (generation) and 2,000 controls (page).
- **Every edit re-renders the whole canvas** (the "one more edit" column). At 2,000 controls that is about 70 ms per edit, which will feel slow while dragging (not measured). Forms of a few hundred controls are far below that.
- **Undo history is bounded** at 41 snapshots (`saveHistoryState` in `src/ide.html`), each a full JSON copy of the form, so memory is bounded too (memory was not measured).
- Studio start-up is dominated by starting Bun itself; the first page is served within about 25 ms for all but one studio.
- **Code Studio's workspace search** reads files on the server's only thread, one after the other, until it has 300 matches (so a query with few or no hits reads everything). It used to read every file under 1 MB, including images, in full. On this repository (1,460 searchable files, 67 MB, of which 47.5 MB PNG screenshots) a search with no hits took about **340 ms** and now takes about **31 ms** (median of 5 runs each, macOS, warm file cache, same results) after skipping known binary file types ([D-043](documentation-maintenance/discrepancies.md#d-043)). It is still a synchronous full scan, so a much larger workspace will block the studio for proportionally longer; that was not measured.

## Not measured

Real window start-up (the native window opening), memory use, idle CPU, the database layer with large tables (the Workbench has its own large-data test, `tests/db/large_data.test.ts`, which checks correctness, not speed), the games' frame rates, drag and resize in the designer, any other machine, Windows and Linux.

## How to repeat it

The measurements used throw-away scripts that were not kept. To repeat the generation and export numbers, call `generatePreviewHtml(spec)` and `exportProjectHelper(JSON.stringify(spec), dir)` from `index.ts` in a loop with `performance.now()` for specs of different sizes. For start-up times, spawn `bun applications/<studio>.ts --server --port 0` and time until the first `GET /` returns. Record the machine and Bun version next to any numbers you publish.

## See also

- [Testing](testing/index.md)
- [Baseline and risks](documentation-maintenance/baseline-and-risks.md)
