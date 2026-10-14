# Security

What the project protects, what it does not, and how to use it safely. Each protection says how it was checked. Reviewed on **13 October 2026** (macOS); Windows and Linux behaviour was not assessed. This is a review of this repository's own code, not a security audit or a guarantee.

## Contents

- [The short version](#the-short-version)
- [What is protected](#what-is-protected)
- [What is not protected](#what-is-not-protected)
- [Safe practice](#safe-practice)
- [Reporting a problem](#reporting-a-problem)
- [See also](#see-also)

## The short version

- Studios run a small web server on **your own computer only** (`127.0.0.1`). Other machines cannot reach it, and web pages open in your browser are refused.
- Some studios can run commands or change files (Code Studio, Task Manager, Rip Studio, the file tools). They are for **you**; do not expose them to a network.
- Database passwords are safest in the **Database Workbench** (operating-system credential store). The older MySQL and PostgreSQL studios read a plain-text `.env` file.
- **A designer layout can contain scripts. Import layouts only from sources you trust;** the designer asks before importing one that has scripts.

## What is protected

| Protection | What it stops | How it was checked |
|---|---|---|
| **Loopback bind**: every studio server listens on `127.0.0.1`, not on the network | Another computer on your network using a studio | Test starts the standalone servers and tries the machine's LAN address (`tests/standalone_server_binding.test.ts`); static rule over all of `applications/` (`tests/studio_servers_local_only.test.ts`) |
| **Loopback guard** (`src/localGuard.ts`): requests with a foreign `Origin` or a non-loopback `Host` get `403` | A web page you have open driving a studio; DNS rebinding | Tests on Code Studio, Balatro, Interval Timer and Maze Generator; a rule that every file with `Bun.serve({` must call the guard |
| **Workspace containment** in Code Studio: paths must lie inside the workspace folder (`isInsideWorkspace`) | Reading, saving, renaming or deleting files outside the workspace, including a sibling folder that shares the name prefix | `tests/code_studio_security.test.ts` |
| **Workbench API**: per-process token, loopback `Host`, same-origin `Origin`, JSON content type | Other programs or pages using the Workbench | Documented and tested in `tests/db/workbench_http.test.ts` (see the [Workbench guide](databases/workbench.md#safety)) |
| **Read-only connections**, enforced by the engine as well as a filter | Writes through a connection marked read-only | Tests against throwaway servers when available; skipped otherwise ([Testing](testing/index.md#what-is-skipped-and-why)) |
| **Server-checked confirmations**: one-time tokens for risky statements; production connections need the name typed | Accidental `DROP`, `TRUNCATE`, `DELETE` without `WHERE` | `tests/db/` |
| **Parameterised values** in the Workbench and the fixed SQL-injection holes in the older MySQL and PostgreSQL studios | SQL injection | `tests/db/studio_injection.test.ts` |
| **Passwords in the credential store**, removed from error messages and logs, never sent back to the page | Passwords in files, logs or the browser | Workbench tests; see [Workbench guide](databases/workbench.md#connections-and-credentials) |
| **Rows rendered as text**, never HTML, in the Workbench | Script injection through database content | Workbench UI tests |
| **Escaped generated code** (`tsStringLiteral`, `safeDimension`) in the designer's export and preview | A crafted layout running code when the exported project starts | `tests/ide_html.test.ts`, seven attacks ([D-021](documentation-maintenance/discrepancies.md#d-021)) |
| **Layout import validation** (`normalizeImportedSpec`) and a **warning when a layout contains scripts** | A malformed layout breaking the open form; importing code without noticing | `tests/ide_html.test.ts`; the warning also checked in a browser ([D-018](documentation-maintenance/discrepancies.md#d-018), [D-024](documentation-maintenance/discrepancies.md#d-024)) |
| **Export keeps your edits** (`.bak-<time>` copies) | Losing hand-edited exported code | `tests/ide_html.test.ts` ([D-022](documentation-maintenance/discrepancies.md#d-022)) |
| **`openExternalUrl`** only opens `http`, `https` and `mailto` links, without a shell on macOS | A page launching arbitrary programs | Source only |
| **Secret scan** in the documentation checker | Passwords, keys or tokens written into the docs | `bun run docs:check` |

## What is not protected

| Gap | Detail |
|---|---|
| **Studios are powerful by design.** Code Studio runs shell commands you type; Task Manager can signal processes; Rip Studio moves files | Anything running as **you** on your computer can use them, because the guard only stops web pages and other machines, not local programs. Do not run them on a shared machine you do not control |
| **No login.** Local servers have no password. A program or user on the same machine can reach them | Loopback binding is the boundary |
| **`.env` passwords** for the older MySQL and PostgreSQL studios are plain text, copied into the process environment | [D-009](documentation-maintenance/discrepancies.md#d-009), accepted and documented |
| **A layout is code.** Event handlers that are not plain function names run as script in the Run preview and in exported projects, and control text is inserted as raw HTML | [D-024](documentation-maintenance/discrepancies.md#d-024). Import warns and asks; nothing else stops it. The page can call only a few window functions. Import layouts you did not write only after reading the JSON |
| **The designer's autosaved draft** (`~/.bun_rad_studio/designer_draft.json`) is plain text, readable only by your user account, and can hold event scripts | [D-039](documentation-maintenance/discrepancies.md#d-039); restoring a draft with scripts asks for confirmation, but anything that can write that file can offer you a form |
| **Windows launching of external links** uses `cmd /c start`; not assessed | Source only |
| **Dependencies** | `bun audit` on 13 October 2026 reported 11 advisories (3 high), all through `jsdom` (a test-only package that was listed as a runtime dependency) and its `undici` and `source-map-js`. `jsdom` was moved to `devDependencies` and `bun audit fix` applied; `bun audit` then reported **no vulnerabilities** in 46 packages and in the 3 runtime packages (`bun audit --prod`). New advisories appear over time: CI runs `bun audit` as an informational step. No software bill of materials exists |
| **CI covers one platform** | The workflow runs on macOS only, and its results are only as strong as the tests ([Testing](testing/index.md#continuous-integration)); the live MySQL and PostgreSQL security tests are skipped there |
| **Real database servers**: the injection, read-only and confirmation tests that need MySQL or PostgreSQL are skipped without a disposable server | 152 tests skip by default |

## Safe practice

1. Start studios from a folder you do not mind them writing into ([Data and files](reference/data-and-files.md)).
2. Use a database account with the **least privilege** you need (read-only if you only browse). A read-only account is the one hard guarantee.
3. Keep `.env` private (`chmod 600 .env`); prefer the Workbench's credential store.
4. Never paste real passwords into `.env.example` (it is committed), issues, chats or layouts.
5. Do not change a studio's host to `0.0.0.0` or put it behind a tunnel or reverse proxy; its guard assumes loopback. The same applies to the library helpers `serveStatic`, `createWsHub`, `Sys.serve` and `Sys.serveStatic`: they listen on `127.0.0.1` unless you pass a `hostname` ([D-037](documentation-maintenance/discrepancies.md#d-037)); they have **no** loopback guard, so exposing one publishes it to the network.
6. Run `bun run docs:check` before sharing documentation: it scans for secret-looking text.
7. Treat a designer layout like a project with scripts: read the `event_handlers` in its JSON before you import or run it, and say no when the import asks.

## Reporting a problem

The repository has no security policy file or private reporting address yet. Until it has one, report a suspected vulnerability to the repository owner privately rather than in a public issue.

## See also

- [Troubleshooting](troubleshooting.md)
- [Workbench: safety](databases/workbench.md#safety)
- [Baseline and risks](documentation-maintenance/baseline-and-risks.md)
- [Glossary: loopback guard](glossary.md#loopback-guard)
