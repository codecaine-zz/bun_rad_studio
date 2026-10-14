# Security

What the project protects, what it does not, and how to use it safely. Each protection says how it was checked. Reviewed on **13 October 2026** (macOS); Windows and Linux behaviour was not assessed. This is a review of this repository's own code, not a security audit or a guarantee.

## Contents

- [The short version](#the-short-version)
- [What is protected](#what-is-protected)
- [What is not protected](#what-is-not-protected)
- [File encryption (RADENC)](#file-encryption-radenc)
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
| **File Manager safety** ([guide](userguides/43_file_manager.md#how-it-keeps-your-files-safe)): per-session token and JSON-only on every action, strict Content-Security-Policy, names only written as text, delete goes to an undoable Recycle Bin and permanent delete needs a confirmation, system and personal folders cannot be changed, programs ask before running, zip extraction refuses paths outside the new folder, links, encrypted and ZIP64 archives | Another web page or program driving the file manager; deleting or overwriting files by accident; zip-slip | `tests/file_manager_server.test.ts`, `file_manager_zip.test.ts` (crafted archives), `file_manager_paths.test.ts`, `file_manager_ui_structure.test.ts` (no inline script, no `innerHTML`); the page was also used in a browser ([D-045](documentation-maintenance/discrepancies.md#d-045)) |
| **File Manager terminal** ([guide](userguides/43_file_manager.md#the-terminal)): a shell is only opened for a WebSocket that carries the session token, comes from the page's own address (`Origin` must equal the host) and passes the loopback guard; at most 4 at once; all are ended when the connection or the server closes; the page's policy allows a WebSocket to its own address only and style elements only with a one-time nonce (no `unsafe-inline`) | Another web page or local program opening a shell through the file manager; leftover shells | `tests/file_manager_terminal.test.ts` (wrong or missing token, foreign and missing origin, non-folder, limit, shells ended), used in a browser ([D-046](documentation-maintenance/discrepancies.md#d-046)). **A terminal is a full shell: anything that gets the token gets code execution as you** (see below) |
| **File Manager helper programs** ([guide](userguides/43_file_manager.md#convert-and-process-files)): every conversion is a program with a list of arguments (never a shell), choices come from a fixed catalog (the page cannot send command text), outputs are new files that never replace anything and are removed when a step fails, installs run only a fixed command per tool after an explicit confirmation | A crafted file name or request running commands; losing a file to a conversion | `tests/file_manager_tools.test.ts` (names like `$(touch pwned)`, `; touch`, `-rf`, tabs, brackets; an existing output left untouched; cancel, timeout and failure cleanup; a missing confirmation) ([D-048](documentation-maintenance/discrepancies.md#d-048)) |
| **Secret scan** in the documentation checker | Passwords, keys or tokens written into the docs | `bun run docs:check` |

## What is not protected

| Gap | Detail |
|---|---|
| **The File Manager terminal is a full shell as you** | Its protections (Recycle Bin, protected folders, confirmations) do not apply inside it. Any program already running as your user can read the page and its token and open one ([D-046](documentation-maintenance/discrepancies.md#d-046)); that is the same trust boundary as Code Studio's terminal and the other studios that run commands |
| **Studios are powerful by design.** Code Studio runs shell commands you type; Task Manager can signal processes; Rip Studio moves files | Anything running as **you** on your computer can use them, because the guard only stops web pages and other machines, not local programs. Do not run them on a shared machine you do not control |
| **No login.** Local servers have no password. A program or user on the same machine can reach them | Loopback binding is the boundary |
| **`.env` passwords** for the older MySQL and PostgreSQL studios are plain text, copied into the process environment | [D-009](documentation-maintenance/discrepancies.md#d-009), accepted and documented |
| **A layout is code.** Event handlers that are not plain function names run as script in the Run preview and in exported projects, and control text is inserted as raw HTML | [D-024](documentation-maintenance/discrepancies.md#d-024). Import warns and asks; nothing else stops it. The page can call only a few window functions. Import layouts you did not write only after reading the JSON |
| **The designer's autosaved draft** (`~/.bun_rad_studio/designer_draft.json`) is plain text, readable only by your user account, and can hold event scripts | [D-039](documentation-maintenance/discrepancies.md#d-039); restoring a draft with scripts asks for confirmation, but anything that can write that file can offer you a form |
| **Windows launching of external links** uses `cmd /c start`; not assessed | Source only |
| **Dependencies** | `bun audit` on 13 October 2026 reported 11 advisories (3 high), all through `jsdom` (a test-only package that was listed as a runtime dependency) and its `undici` and `source-map-js`. `jsdom` was moved to `devDependencies` and `bun audit fix` applied; `bun audit` then reported **no vulnerabilities** in 46 packages and in the 3 runtime packages (`bun audit --prod`). New advisories appear over time: CI runs `bun audit` as an informational step. No software bill of materials exists |
| **CI blocks on one platform** | The blocking job runs on macOS; Linux and Windows run in a non-blocking experimental job ([Testing](testing/index.md#other-platforms)), where Windows fails 31 tests. CI results are only as strong as the tests; the live MySQL and PostgreSQL security tests are skipped there |
| **Real database servers**: the injection, read-only and confirmation tests that need MySQL or PostgreSQL are skipped without a disposable server | 152 tests skip by default |

## File encryption (RADENC)

The File Manager's **Encrypt…** and `bun run cli:vault` lock files and folders with a password you choose, into `.radenc` files ([byte-exact format](reference/vault-format.md), [how to use it](userguides/43_file_manager.md#encrypt-and-decrypt-files-and-folders)). Design: Argon2id (256 MiB, 3 passes by default; 1 GiB, 4 passes at *Maximum*) turns the password into a key, HKDF-SHA-256 derives the file key, and AES-256-GCM seals 1 MiB chunks in a STREAM construction whose authenticated data is the whole header. No new dependencies: it uses Bun's `node:crypto`.

**What it protects.** Against someone who gets the `.radenc` file but not the password:

| Threat | How it is handled |
|---|---|
| Reading the contents, the original file name, the number of files, their sizes and times | All of that is inside the encrypted data. The disk name is your choice (`Encrypted file 1.radenc` hides it) |
| Guessing the password offline | A slow, memory-hard key derivation (about 0.45 s and 256 MiB per guess on a fast laptop, about 2.5 s and 1 GiB at Maximum) makes each guess expensive, and the page refuses short and obvious passwords. A random 6-word passphrase (66 bits) is the recommended choice. A weak password is still weak: the format cannot fix that |
| Changing, truncating, reordering, duplicating or extending the file | Every chunk is authenticated, the header is authenticated, and the last chunk is flagged. Any change fails with one message (*"Wrong password, or the file is damaged or has been changed."*) and nothing is written, so a wrong password and a damaged file can't be told apart |
| A hostile file that tries to harm the computer that opens it | Key-derivation settings are checked **before** they run (memory ≤ 2 GiB, passes ≤ 10, lanes ≤ 16). Extraction validates every path (no `..`, absolute paths, drive letters, backslashes, control characters, reserved Windows names, collisions, depth, length, entry and size caps), writes into a fresh temporary folder, never follows or creates links, never overwrites, and removes the folder on any failure |
| Losing data to the tool itself | A new file is written to a temporary name, flushed, **re-read and authenticated chunk by chunk with the same key**, and only then given its final name without replacing anything. The original is never changed; "move the original to the Recycle Bin" is off by default and happens only after that check, through the ordinary Recycle Bin |
| The password leaking from the app | It exists only in the request body and in memory while the key is made; the key and intermediate buffers are zeroed afterwards. It is never logged, stored in settings, put in a job view, a result or an error message, or written to disk. The page empties its password boxes when the request is sent and when the window closes. There is no `--password` option in the command-line tool |

**What it does not protect.**

- **A lost password cannot be recovered.** There is no reset, no escrow and no back door. Write it down somewhere safe.
- **File names on disk, and the size of the file.** `<name>.radenc` shows the name unless you hide it; the total size is visible (compression changes it but does not hide it), and so are the times the file system records for the `.radenc` file itself.
- **The original**, until you remove it. Encrypting copies; the plain original stays in place (and a deleted original may remain recoverable from the disk) unless you move it to the Recycle Bin and empty that. Secure erasure is not offered, because SSDs and journaling file systems make it unreliable.
- **A compromised computer.** Malware, a keylogger, a screen recorder or another program that can read this program's memory sees the password and the plain data while you use them. Memory in JavaScript cannot be wiped completely: the typed password is a string that the runtime may copy and free later; only the derived keys and byte copies are zeroed.
- **Timing and access patterns.** Work takes longer for larger files and slower settings; nothing is done to hide that. A hostile local user who can watch the disk learns when and how much you encrypt.
- **Metadata that is not stored:** symbolic links and special files are skipped (each skip is reported), as are extended attributes, ACLs and owners; only the permission bits and the modification time are kept.
- **Streaming caveat.** Plain data is written to the temporary folder as each chunk authenticates and is only published after the last chunk does; an attacker with write access to the folder you choose could observe or race the temporary files. A tiny race remains between "name is free" and the final rename on disks without hard links.
- **No signature or sender identity.** Anyone who knows the password can make a file that decrypts. Encryption proves "made by someone with the password", not "made by a particular person".
- **Not independently audited.** The format follows standard constructions and is tested against an independent reference decryptor, but no outside review has been done.

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
