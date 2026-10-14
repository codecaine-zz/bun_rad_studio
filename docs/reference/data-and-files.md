# Data and files

Everything the project reads or writes on your computer, sorted by how much it matters: what is **your work** (do not lose it), what is **regenerable** (safe to delete), what is **temporary**, and what is **sensitive** (do not share it). Facts were read from the source; paths marked "checked" were also seen on a real machine on 13 October 2026 (macOS). Windows and Linux locations were not checked.

## Contents

- [The four kinds of data](#the-four-kinds-of-data)
- [Inventory](#inventory)
- [Things that surprise people](#things-that-surprise-people)
- [Safe habits](#safe-habits)
- [File formats and compatibility](#file-formats-and-compatibility)
- [See also](#see-also)

## The four kinds of data

| Kind | Meaning | If you delete it |
|---|---|---|
| **Your work** | Created or chosen by you; the project cannot recreate it | It is gone |
| **Regenerable** | Produced from other files by a command | Run the command again |
| **Temporary** | Scratch files for one run or one test | Nothing is lost |
| **Sensitive** | Could harm you if someone else reads it (passwords, host names, tokens) | n/a: keep private |

## Inventory

| What | Where | Kind | Written by | Ignored by git? |
|---|---|---|---|---|
| A form layout | The open designer page, plus an **autosaved draft** `~/.bun_rad_studio/designer_draft.json` (mode 0600, the one latest form, replaced about 0.8 s after each change). It can hold event scripts, so treat it as private. Copy the **JSON** tab to keep a named copy | Your work | Designer (`src/ide.html`) and `saveDraftHelper` in `index.ts` | outside the repository |
| Exported project | `exported_project/` in the folder you started the designer from. A file that would change is first kept as `<name>.bak-<time>` | Your work once you edit it, else regenerable | `exportProjectHelper` in `index.ts` | yes |
| Live preview files | `.rad_preview/preview.html` and `preview.ts` in the current folder | Temporary | **Run** button (`runPreviewHelper`) | yes (since [D-025](../documentation-maintenance/discrepancies.md#d-025)) |
| Database connection profiles | `~/.bun_rad_studio/connections.json` (mode 0600), or `STUDIO_DB_PROFILE_DIR` | Your work, and sensitive (host names, user names) | Database Workbench | outside the repository |
| Database passwords | OS credential store, service `bun-rad-studio.database` (or only in memory if no store exists) | Sensitive | Database Workbench | outside the repository |
| Saved macros and queries | `~/.bun_rad_studio/macros` (checked), or `STUDIO_MACRO_STORE_DIR` | Your work | SQLite, MySQL and PostgreSQL studios | outside the repository |
| MySQL Studio and PostgreSQL Studio exports | MySQL: the current folder (or `STUDIO_EXPORT_DIR`). PostgreSQL: `~/.bun_rad_studio/exports` (checked) | Your work | those studios | outside (PostgreSQL), no (MySQL, depends on folder) |
| Uploaded SQLite files | `.sqlite_uploads/` in the current folder: **a copy** of the file you chose | Your work (edits go to the copy) | SQLite Studio upload | yes |
| SQLite runtime files | `*.sqlite-wal` and `*.sqlite-shm` next to a database | Temporary | SQLite | yes |
| Legacy studio database settings | `.env` in the current folder | **Sensitive** | you; read by MySQL and PostgreSQL studios | yes |
| Launcher favourites and history | `.launcher_history.json` in the current folder, or `LAUNCHER_HISTORY_FILE` | Your preferences | Launcher | yes |
| Maze and word-search game state | `.maze_generator_state.json`, `.word_search_state.json` in the current folder (maze: `MAZE_GENERATOR_STATE_FILE`) | Your progress | those games, through a temporary file and a rename | yes |
| Other games' progress | The browser storage inside the studio's window (a fallback keeps it in memory if storage is blocked) | Your progress | the game pages | n/a |
| Files edited in Code Studio | The workspace folder it was started in (`process.cwd()` unless a folder is given) | Your work | Code Studio (`/api/fs/*`) | depends |
| Files moved by Rip Studio | `$GRAVEYARD`, else `~/.local/share/rip/graveyard` | **Your work** (files you "deleted") | Rip Studio | outside the repository |
| Environment Vault output | The path you choose | Your work, possibly sensitive | Environment Vault | n/a |
| Installed packages | `node_modules/` | Regenerable (`bun install`) | Bun | yes |
| Build output | `dist/` | Regenerable (`bun run build`, checked) | `scripts/build.ts` | yes |
| Command wrappers and manifest | `bin/` | Regenerable (`bun run scripts/generate_brew_suite.ts`) | the generator | **no**, tracked |
| Test leftovers | `test_db_*.sqlite-shm` and similar files in the repository folder | Temporary | tests that open SQLite files | yes |
| Screenshots | `screenshots/`, `.temp_screens/` | Regenerable (capture scripts) | `scripts/capture_*.ts` | `.temp_screens/` yes, `screenshots/` no |

## Things that surprise people

- **The designer cannot save a layout.** There is no Save or Open command in the toolbar. Closing the window loses the layout unless you copied the JSON tab. **Import** reads that JSON back. (Source: toolbar in `src/ide.html`; no save code exists.)
- **Uploading a SQLite file in SQLite Studio works on a copy** in `.sqlite_uploads/`. Your original is not modified. Uploading another file with the same name replaces the earlier copy.
- **Several files are created in the folder you start from**, not in the project folder: `.env` is read from it, and `exported_project/`, `.rad_preview/`, `.launcher_history.json` and `.sqlite_uploads/` are written to it. Starting the same studio from two folders gives two separate sets.
- **Rip Studio's graveyard lives outside the project.** Deleting the repository does not delete it, and it may hold files you meant to throw away or keep. Check it before cleaning up.
- **Exports are not backups.** See [Workbench: import/export versus backup/restore](../databases/workbench.md#importexport-versus-backuprestore).

## Safe habits

1. Before removing or updating the project, copy `~/.bun_rad_studio/` and check `$GRAVEYARD` or `~/.local/share/rip/graveyard`. See [Update and remove](../getting-started/update-and-remove.md).
2. Keep `.env`, `connections.json` and anything in your credential store private; do not paste them into issues or chats. Files that hold secrets are git-ignored, but only as long as you do not force-add them.
3. Copy the JSON of a form you care about into a file of your own.
4. Start studios from a folder you do not mind them writing into.

## File formats and compatibility

None of the project's saved files carries a version number. The formats that other programs may read are: `connections.json` (an array of connection profiles), the launcher history (JSON), the two game state files (JSON) and the exported project (a Bun project). No saved format has been changed on purpose so far; when one is, the change will be listed under [Maintenance](../documentation-maintenance/discrepancies.md) with a migration note. The [form spec](../API.md#1-formspec-data-model-schema) is the one format users hand-edit; **Import** accepts older or partial specs and fills in defaults ([D-018](../documentation-maintenance/discrepancies.md#d-018)).

## See also

- [Update and remove](../getting-started/update-and-remove.md#what-the-project-saves-on-your-computer)
- [Environment variables](index.md#environment-variables)
- [Architecture](../developer/architecture.md#persistent-data)
