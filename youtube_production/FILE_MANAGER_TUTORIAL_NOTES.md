# Codecaine File Manager: the complete, step-by-step guide (1:42:39)

## YouTube title

Codecaine File Manager Full Tutorial: Terminal, Media Studios, 180 Themes & Databases

## YouTube description (copy and paste)

```text
The complete, step-by-step guide to the Codecaine File Manager: a free, open-source, keyboard-friendly file manager for macOS, Windows and Linux, with its own terminal, picture and media studios, developer tools, 180 themes and full SQLite and MySQL studios built in. Every click is shown in real time, on a throwaway folder of sample files, so you can follow along at your own pace.

⬇️ Download (free): https://github.com/codecaine-zz/bun_rad_studio/releases/latest
⭐ Source code: https://github.com/codecaine-zz/bun_rad_studio

WHAT YOU WILL LEARN
📁 The basics: the window, getting around, views, selecting, copy and move with progress, Cancel and Retry, name clashes, the Recycle Bin, Undo and Quick Look.
⌨️ Terminal + files together: the file list follows your cd, "Open terminal here", and selected files and folders typed into the terminal as safely quoted paths. On Windows it works with PowerShell, the Command Prompt, Git Bash and WSL (C:\Users becomes /mnt/c/Users), no external terminal needed.
🧰 Every tool: Convert, Find and bulk rename, Review, Compare, Projects, Actions, QR codes, the code editor, Replace across files with Undo, the Dev tab (code stats, Git, TODOs), Watch, Serve, Crypto, Secrets, Env, Network, Downloads, Calculator, Timer, API, Bundler and the Graveyard.
🎬 Pictures, songs and videos: one-click edits, the Image Studio and Media Studio with live sliders, trim, speed and fades, presets for many files at once, and a built-in viewer and player that opens on Enter.
🎨 Make it yours: 180 themes, with glass, glow and motion effects, futuristic looks and rare classic systems (BeOS, OS/2 Warp, Palm OS, Zune and more), an effects filter, your own themes with panel opacity and blur, ⌘⇧T to open themes, and every keyboard shortcut changeable.
🗄️ Databases: complete SQLite Studio and MySQL Studio walkthroughs, from browsing and editing rows to the visual query designer, macros, imports and backups.

CHAPTERS
0:00 Welcome
0:51 The window, piece by piece
5:06 Getting around
7:14 How the list looks
8:49 Choosing files, and making new ones
10:47 Folder tabs, the sidebar folder tree, color tags and grouping
11:57 Copying files, and name clashes
14:25 Big jobs: progress, Cancel, Retry and Activity
16:50 Moving files: cut, drag, and two panes
18:25 Deleting safely: the Recycle Bin
19:50 Look without opening: Quick Look and copy to clipboard
21:51 More info, permissions and password encryption
23:02 Convert and process files
24:34 Find files, and rename the matches
25:50 Review before anything changes
28:00 Compare two folders
29:59 Projects: get back to where you were
31:32 Actions: saved recipes
33:16 Make and read QR codes
34:22 The built-in code editor, and text conversions
35:41 The terminal and your files, working together
40:11 Replace across files, and the Dev tab
42:23 Watch and Serve: let the computer do the routine
43:41 The rest of the toolbox
45:38 Home view, Split view, Calendar & World Clocks, and CLI Utilities
46:43 One-click picture, video and sound edits
48:03 Image Studio: edit a picture with sliders
49:30 Media Studio: trim, speed, sound and video
50:57 Save a preset, then edit many files at once
52:20 Recent files and media open right here
53:36 Media Deck, Paint Studio & 24 Built-in Arcade Games
54:26 Make it yours: themes, effects and shortcuts
59:46 The database studios
1:00:48 Databases Hub: SQLite files in the file list & one-click sample databases
1:01:42 Databases Hub: Connecting SQLite, MySQL, PostgreSQL and Redis
1:02:28 Databases Hub: Cloning databases and tables across SQLite, PostgreSQL and MySQL
1:03:51 Databases Hub: Cloning SQL tables into Redis Hashes & back into a new SQLite file
1:04:42 Databases Hub: The Bun JavaScript & Visual Macro Studio across all engines
1:06:04 Databases Hub: Universal 15-format import & the 5-step Staging Wizard
1:07:00 Databases Hub: Per-column filter bar, Side Row Inspector, FK jump & backups
1:07:51 Databases Hub: Multi-tab SQL IDE, Full ER Diagram, Schema Diff & Code Generation
1:09:04 Databases Hub: Live PostgreSQL, MySQL and Redis Studios & the Open Studios Switcher
1:09:53 SQLite: A database in the file list
1:10:49 SQLite: Saving and testing a connection
1:12:14 SQLite: A sample database in one click
1:12:52 SQLite: SQLite Studio inside the File Manager
1:14:08 SQLite: Browsing a table
1:15:23 SQLite: Add, edit and delete rows without SQL
1:16:28 SQLite: Designing tables visually
1:17:28 SQLite: The SQL editor
1:18:48 SQLite: The visual query designer
1:19:56 SQLite: Building and running a macro
1:21:07 SQLite: Inspect, tune and maintain
1:22:01 SQLite: Row inspector, FK jump, SQL worksheets, ER diagram, schema diff & codegen
1:23:05 SQLite: Export and one-click backup
1:23:46 SQLite: Import with staging, from the file list
1:25:13 SQLite: Production connections and shortcuts
1:25:50 MySQL: Find the connection and save it
1:27:23 MySQL: Test it, see where every value comes from
1:28:56 MySQL: Open MySQL Studio inside the window
1:30:06 MySQL: The studio's own connection workbench
1:31:06 MySQL: The data grid: browse, filter, total and edit rows
1:32:38 MySQL: The S Q L editor, presets, and one-click backup
1:33:56 MySQL: Design queries and schemas visually
1:35:35 MySQL: Live activity, locks, plans and maintenance
1:37:17 MySQL: Automate it: build and run a macro
1:38:20 MySQL: Row inspector, FK jump, SQL worksheets, ER diagram, schema diff & codegen
1:39:23 MySQL: Load a CSV file with staging, from the file list
1:41:09 MySQL: Back to the File Manager: stop, shortcuts and safety
1:42:00 That is the tour

#FileManager #OpenSource #Tutorial
```

## Notes

- Recorded from the real program in headless Chrome with a visible cursor; nothing is faked. Each chapter starts from a fresh throwaway world in /tmp, so no real file or setting appears. The terminal uses a throwaway shell profile.
- The SQLite and MySQL chapters are the recorded chapters of `sqlite_studio_tutorial` and `mysql_studio_tutorial`, joined in without their own intro and outro (build those first).
- The desktop-only keys (Right Option + ] / [ / /, Command+Q) are shown on screen; the theme change is the real one.
- The picture is 1920x972 above its own caption strip, so the captions never cover the program.
- Narration: Edge neural voice (en-US-AvaMultilingualNeural, female) at +3% speed with 0.45s between sentences, cleaned up with a gentle compressor and loudness normalized to -16 LUFS.
- Rebuild: `bun scripts/tutorial_file_manager.ts all` (needs Google Chrome, ffmpeg-full from Homebrew and the internet for the voice). Re-record one chapter: `... record 18_terminal` then `... build`.
