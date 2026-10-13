# Update and remove

## Update

Run these commands from the repository root (the `bun_rad_studio` folder).

```bash
git status
git pull
bun install
```

1. `git status` shows whether you have changed files. If it lists changes you want to keep, save them first (commit them, or copy the files elsewhere); `git pull` can refuse to run or ask you to merge.
2. `git pull` downloads the newest version of the project.
3. `bun install` installs any packages that changed.

*Verification:* these are standard Git/Bun commands; `bun install` was verified (see [Install](install-and-first-launch.md#step-3-install-the-packages)). `git pull` against the GitHub repository was **not** run for this handbook.

After updating, run `bun test tests/db/splitter.test.ts` (or `bun test`) to check that the project still works on your computer.

## What the project saves on your computer

| What | Where | Verified from |
|---|---|---|
| Database connection profiles (no passwords) | `~/.bun_rad_studio/connections.json`, or the folder in the environment variable `STUDIO_DB_PROFILE_DIR` | `src/db/profiles.ts` |
| Database passwords | Your operating system's credential store (macOS Keychain), service name `bun-rad-studio.database` | `src/db/profiles.ts` |
| Saved macros and queries of the database studios | `~/.bun_rad_studio/macros` (override: `STUDIO_MACRO_STORE_DIR`) | `applications/studio_macros_server.ts` |
| Studio file exports | MySQL Studio: the folder you started it from (override: `STUDIO_EXPORT_DIR`). PostgreSQL Studio: `~/.bun_rad_studio/exports`. Other studios: not checked | `applications/mysql_studio_server.ts`, `applications/postgres_studio_server.ts` |
| Launcher favourites and history | `.launcher_history.json` in the folder you started the launcher from, or the file named by `LAUNCHER_HISTORY_FILE` (ignored by Git) | `applications/launcher_studio.ts` |
| Designer export | `exported_project/` in the current folder (ignored by Git) | `index.ts` |
| Downloaded packages | `node_modules/` in the repository folder | `bun install` |
| Build output | `dist/` | `bun run build` |

Other tools may keep their own files; this table lists only what was checked.

## Back up before removing

Copy `~/.bun_rad_studio/` if you want to keep your connection profiles, macros and exports. Your databases are **not** stored by the project (except SQLite files you created yourself): back those up separately; see [Database Workbench: import/export versus backup/restore](../databases/workbench.md#importexport-versus-backuprestore).

## Remove

> **Warning – this deletes files.** Check each path before running a command. The commands below only remove what the project created; they never touch your databases.

1. Close every window that was opened from the project.
2. Delete the repository folder, for example `rm -r /path/to/bun_rad_studio`. This removes the project, `node_modules`, `dist` and the launcher history.
3. Optional – delete saved settings: `rm -r ~/.bun_rad_studio`.
4. Optional – delete stored database passwords. Open **Keychain Access** (macOS), search for `bun-rad-studio.database` and delete those entries. (Within the Workbench, deleting a connection profile also deletes its stored password.)
5. If you installed the Homebrew suite (`install_homebrew_suite.sh`): see [HOMEBREW_SUITE_GUIDE.md](../HOMEBREW_SUITE_GUIDE.md). Removal of those links was **not** verified.

*Expected result:* no folder named `bun_rad_studio` remains. Bun itself is not removed; uninstall it separately if you wish.

## Next

[Databases overview](../databases/index.md)
