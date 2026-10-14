# Security

What the project protects, what it does not, and how to use it safely. Each protection says how it was checked. Reviewed on **13 October 2026** (macOS); Windows and Linux behaviour was not assessed. This is a review of this repository's own code, not a security audit or a guarantee.

## Contents

- [The short version](#the-short-version)
- [What is protected](#what-is-protected)
- [What is not protected](#what-is-not-protected)
- [File encryption (RADENC)](#file-encryption-radenc)
- [Secrets vault (RADSEC)](#secrets-vault-radsec)
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

## Secrets vault (RADSEC)

The File Manager's **Secrets** tool is a personal password manager and secure-notes vault. Everything in it (titles, user names, addresses, passwords, notes, tags, one-time-code secrets, card numbers, attachments, settings, the activity log) is stored in ONE file, `file_manager_secrets.radsec`, in the app's data folder ([byte-exact format](reference/secrets-format.md), [how to use it](userguides/43_file_manager.md#secrets-password-manager-and-notes)). **It has not been independently audited and is not a replacement for a mature, audited password manager for high-risk use** (journalists, activists, administrators of critical systems, large sums of money).

**Design.** A random 256-bit *data key* encrypts the whole database as one AES-256-GCM message with a fresh random nonce at every save; the entire header is its authenticated data and is also covered by an HMAC. The data key is stored wrapped under up to three independent keys: the master password (Argon2id, 256 MiB / 3 passes / 4 lanes by default, 512 MiB or 1 GiB at *Strong* and *Maximum*, then HKDF-SHA-256, plus an optional key file mixed in), an optional 160-bit recovery key, and an optional device key held in the operating system's credential store (*Unlock with this computer*). Nothing but Bun's `node:crypto` is used. A save writes a temporary file, flushes it, reads it back and decrypts it in memory, and only then renames it into place, after rotating three encrypted backups; a failed or empty save changes nothing.

**What it protects against:**

| Threat | How it is handled |
|---|---|
| Someone steals the vault file (or a backup, or a sync copy) | Nothing is readable without the master password (and key file, if one is set), the recovery key, or the device key from your own credential store. No plain index exists; even the number of items is hidden by padding to 4 KiB |
| Offline guessing of the master password | Argon2id makes each guess cost 256 MiB to 1 GiB of memory and about 0.4 to 2.8 s on a fast laptop. The program demands at least 12 characters and about 60 bits, or a passphrase of 5 or more words, and refuses common passwords. A weak password is still weak: nothing here can fix that |
| Tampering, truncating, reordering or swapping parts of the file | The header and database are authenticated and the wraps are bound to their position. Every failure gives the same message, so a wrong password and a damaged file can't be told apart |
| A hostile file (memory bomb) | Argon2 settings are checked before any key is derived (memory ≤ 2 GiB, passes ≤ 10, lanes ≤ 16); other limits apply to size |
| Guessing through the program | Wrong passwords add waits that double up to 15 minutes, kept in a small non-secret counter file |
| Losing data to a crash or a bad save | Atomic write, verification, three rotating backups, conflict detection: a vault file changed behind the program's back is never overwritten without asking |
| Secrets leaking out of the program | Passwords, notes, one-time-code secrets and card numbers are fetched one at a time and only when asked; the list never carries them; they hide again after 15 seconds, on lock, when the window loses focus or the tab changes. **Copying is done by the server**, so a copied password never passes through the page, and the clipboard is cleared after 30 seconds (10 to 120, or never) but only if it still holds that value. Nothing secret is written to settings, logs, error messages, the clipboard history of this program, the browser's storage, the address or any attribute of the page (a test scans for all of these). Decrypted data is never written to disk: there are no temporary files, and exports are explicit |
| Walking away | The vault locks after 5 minutes idle by default (1 minute to 1 hour, or never, with a warning), optionally when you switch windows, and when the File Manager closes. Locking zeroes the key buffers and drops the database |
| A leaked old password | Changing the master password, the recovery key or the device shortcut deletes the old backups, which would still open with the old secret |

**What it does not protect against:**

- **A compromised computer.** Malware or a keylogger running as you, a screen recorder, or someone looking over your shoulder sees what you see and type. Malware running as you can also read the clipboard while a password is on it and can read this program's memory.
- **Memory forensics of a running program.** JavaScript strings cannot be wiped: the decrypted text, the typed password and revealed values are strings the runtime may copy and free later. Only the key buffers and byte copies are zeroed on lock. A memory dump of the running program (or swap/hibernation files) may contain them.
- **A weak master password**, a master password reused elsewhere, or a recovery key stored badly. Anyone who has the recovery key can open the vault, with no password and no key file.
- **Losing everything.** There is **no reset**. Without the master password (and key file) and without the recovery key, nobody can open the vault. Losing the key file alone leaves only the recovery key.
- **Rollback.** Someone who can replace the file with an older copy of it can serve you old data; an offline file has no way to notice.
- **Clipboard sniffing.** A copied password is on the system clipboard for a while, where other programs (and, on some systems, a clipboard-history feature such as Windows' Win+V) can read it. Auto-clear helps only when nothing else has already read it.
- **The plain-text export** (CSV) and every attachment you save out are not encrypted. The export needs the password again and a loud confirmation and is written readable only by you, but it is then your job to delete it.
- **The optional breach check** sends the first 5 characters of a SHA-1 of each password to haveibeenpwned.com (with the padding header, nothing else). It is off unless you press the button; the service learns 20 bits of each hash, which fits very many passwords.
- **Timing and file size.** Work and file size grow with the vault; an observer of the disk learns when you change it.

**"Unlock with this computer" (off by default).** When you turn it on, a random 256-bit device key goes into the operating system's credential store (macOS Keychain, Windows Credential Manager, Linux Secret Service, through `Bun.secrets`, still marked experimental by Bun) under the name `vault-device-key:<vault id>`, and a third wrapping of the data key under a key made from it goes into the vault file. You then open the vault with just your computer login. The trade-off, plainly: **anyone who can use your logged-in operating-system session can open the vault, and so can malware running as you** (the credential store may ask permission, but it is built to serve your own programs). A stolen vault file without that credential-store entry still needs the master password. The master password is asked for at least every 14 days by default (1 to 90); this expiry is enforced by this program, not by cryptography, so it does not stop a program that reads the entry itself. Don't turn it on for shared computers, or if you want the vault shut whenever your computer is unlocked and unattended. If the credential store is missing, refuses, or has lost the entry, the program says so in plain words and the master password works as always. Turning it off removes both the entry and the wrapping.

**How this was checked.** About 130 automated tests, with real cryptography and real files: a known-answer file and an independent reference decryptor written with `node:crypto` only; every header field; truncated, flipped, reordered and extended files; memory-bomb headers; nonce uniqueness across hundreds of saves; wrapping, key file, recovery and device keys; crash simulation between the temporary file and the rename; conflict detection; throttling and auto-lock with injected clocks; the clipboard clear with an injected clipboard; the breach check with an injected network that proves only a 5-character prefix is sent; RFC 6238 test vectors; importers fed hostile input; and a marker-string test that proves no secret appears in any response that is not a reveal, in any error or log line, or on disk. The page is tested in jsdom for the same. No independent person or company has reviewed it.

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
