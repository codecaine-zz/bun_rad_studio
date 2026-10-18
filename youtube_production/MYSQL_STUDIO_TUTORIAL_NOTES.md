# MySQL in the Codecaine File Manager (17:51)

## YouTube title

MySQL in the Codecaine File Manager: Save, Test and Open MySQL Studio Pro, Then Master the Studio (Bun + TypeScript)

## YouTube description (copy and paste)

```text
A complete, narrated tutorial of MySQL Studio Pro, done from inside the Codecaine File Manager (Bun RAD Studio). Find a connection in a .env file or your environment variables, save it in the File Manager's Databases tab, test it, see where every setting comes from, and open the real MySQL Studio in the File Manager window. Then the studio itself: the data grid with GUI editing, filter bar, totals row and report, the SQL editor with presets and a one-click backup and dump, the visual query designer with cardinality badges, the schema designer and DDL, ENUM and SET types, partition trees, live activity and locks, replication and binary logs, the query plan visualizer, the raw JSON inspector, maintenance and telemetry, the macro designer, and loading a CSV file safely with staging, straight from the file list.

Everything runs on a throwaway MySQL server with sample data, so nothing real is shown.

Free and open source: https://github.com/codecaine-zz/bun_rad_studio
MySQL Studio guide: https://github.com/codecaine-zz/bun_rad_studio/blob/main/docs/userguides/41_mysql_studio.md
File Manager guide (Databases): https://github.com/codecaine-zz/bun_rad_studio/blob/main/docs/userguides/43_file_manager.md

Chapters
0:00 MySQL in the Codecaine File Manager
0:20 A MySQL server to talk to
0:41 Find the connection and save it
2:14 Test it, see where every value comes from
3:51 Open MySQL Studio inside the window
5:04 The studio's own connection workbench
6:07 The data grid: browse, filter, total and edit rows
7:43 The S Q L editor, presets, and one-click backup
9:04 Design queries and schemas visually
10:47 Live activity, locks, plans and maintenance
12:33 Automate it: build and run a macro
13:39 Row inspector, FK jump, SQL worksheets, ER diagram, schema diff & codegen
14:46 Load a CSV file with staging, from the file list
16:35 Back to the File Manager: stop, shortcuts and safety
17:30 That is MySQL in the File Manager
```

## Tags (comma separated)

mysql, mysql studio, mysql gui, mysql client, mysql tutorial, mysql workbench alternative, database gui, database manager, file manager, codecaine file manager, bun, bun runtime, typescript, bun rad studio, sql editor, visual query designer, query builder, schema designer, mysql partitions, mysql enum, explain plan, query plan, binary log, replication, lock monitor, mysql backup, sql dump, csv import, staging import, macos

## Hashtags

#mysql #mysqlstudio #sql #database #databasegui #bun #typescript #filemanager #macos #opensource #dataengineering #devtools #sqleditor #queryplan #backend

## Notes

- Recorded from the real Codecaine File Manager in headless Chrome with a visible cursor: the Databases tool, and MySQL Studio Pro running inside the File Manager window (a studio is a page inside a frame, and the recording drives it). Nothing is faked, but note these honest points:
  - The MySQL server is a **throwaway** server (MySQL 26.7.0 from Homebrew) on port 3399 with an **empty root password** and the studio's own sample "shop" database, started just for the recording and deleted afterwards. The real server and data are never touched.
  - Because the root password is empty, no password was saved. On a real Mac a password goes to the system keychain. For the recording, the File Manager's keychain code was replaced in memory by a throwaway stand-in (the preload scripts/lib/mysql_tutorial_nokeychain.ts) so nothing could touch the recorder's own keychain. The same preload hides the repository's own .env file from the Databases tab. No program file is edited.
  - On this very new MySQL version the lock banner of the Live Activity pane stays green even while a real lock exists (it reads the old information_schema.innodb_lock_waits table); the process list shows the blockage. The Join Properties dialog offers five join choices in words (the guide mentions a Venn diagram, which is not drawn). Duplicating a row copies the created_at value in a format MySQL rejects, so the video presses "Now". The "Run ANALYZE TABLE" button of the maintenance pane sends no table name and fails, so the video uses "Optimize all tables" instead.
- The picture is 1920x972 above its own caption strip, so captions never cover the program.
- Narration: Edge neural voice (en-US-AvaMultilingualNeural, female).
- Rebuild: `bun scripts/tutorial_mysql_studio.ts all` (needs Google Chrome, ffmpeg-full and mysql from Homebrew, and the internet for the voice). Re-record one chapter: `... record 06_grid` then `... build`.
