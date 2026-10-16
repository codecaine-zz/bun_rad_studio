# SQLite in the Codecaine File Manager: the complete walkthrough (16:23)

## YouTube title

SQLite in the Codecaine File Manager: Browse, Edit, Query, Design and Import (Bun + TypeScript)

## YouTube description (copy and paste)

```text
Work with SQLite databases without leaving the Codecaine File Manager, part of Bun RAD Studio. See how a real SQLite file is recognised in the file list, saved as a connection in the Databases tool (found in your environment, tested, edited, marked production), and opened in SQLite Studio inside the File Manager window. Then use the whole studio: sort, filter, totals and column chooser in the data grid, adding, editing and deleting rows without SQL, designing tables visually, the SQL editor with presets, explain plan and create view, the visual query designer with automatic joins, building and running a macro, PRAGMA settings, the audit log, exports and one-click backups, and Import with staging that checks every row before it reaches your table. All on made-up sample data.

Free and open source: https://github.com/codecaine-zz/bun_rad_studio
SQLite Studio guide: https://github.com/codecaine-zz/bun_rad_studio/blob/main/docs/userguides/01_sqlite_studio.md
File Manager guide: https://github.com/codecaine-zz/bun_rad_studio/blob/main/docs/userguides/43_file_manager.md

Chapters
0:00 Welcome
0:22 A database in the file list
1:17 Saving and testing a connection
2:46 A sample database in one click
3:27 SQLite Studio inside the File Manager
4:47 Browsing a table
6:05 Add, edit and delete rows without SQL
7:14 Designing tables visually
8:18 The SQL editor
9:41 The visual query designer
10:53 Building and running a macro
12:08 Inspect, tune and maintain
13:05 Export and one-click backup
13:49 Import with staging, from the file list
15:21 Production connections and shortcuts
16:01 Thank you for watching
```

## Tags (copy and paste)

```text
SQLite, SQLite tutorial, SQLite Studio, SQLite GUI, SQLite browser, database file manager, file manager database, Codecaine File Manager, Bun RAD Studio, Bun, bun:sqlite, TypeScript, SQL tutorial, SQL editor, visual query designer, query plan, EXPLAIN QUERY PLAN, CSV import, import with staging, database backup, SQL dump, PRAGMA, macro automation, database client, desktop database tool, open source, macOS, developer tools, database design
```

## Hashtags

#SQLite #SQL #Bun #TypeScript #FileManager #Database #DatabaseTools #OpenSource #DevTools #SQLiteStudio #Tutorial #Programming #CSV #DataImport #RAD

## Notes

- Recorded from the real File Manager in headless Chrome with a visible cursor; nothing is faked. SQLite Studio is shown exactly as the File Manager shows it: inside the Databases tool, in a frame.
- Every chapter starts from a fresh throwaway world, so no real file, setting or password appears. The File Manager ran from a private copy of the program with a made-up .env file; the system keychain was replaced by an in-memory store for the recording.
- The picture is 1920x972 above its own caption strip, so captions never cover the program.
- Narration: Edge neural voice (en-US-AvaMultilingualNeural, female).
- Rebuild: `bun scripts/tutorial_sqlite_studio.ts all` (needs Google Chrome, ffmpeg-full from Homebrew and the internet for the voice). Re-record one chapter: `... record 06_crud` then `... build`.
