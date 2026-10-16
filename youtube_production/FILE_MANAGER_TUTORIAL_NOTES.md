# Codecaine File Manager: the complete, step-by-step guide (1:27:05)

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
10:47 Copying files, and name clashes
13:15 Big jobs: progress, Cancel, Retry and Activity
15:41 Moving files: cut, drag, and two panes
17:16 Deleting safely: the Recycle Bin
18:41 Look without opening: Quick Look and copy to clipboard
20:41 Convert and process files
22:13 Find files, and rename the matches
23:29 Review before anything changes
25:39 Compare two folders
27:38 Projects: get back to where you were
29:11 Actions: saved recipes
30:55 Make and read QR codes
32:01 The built-in code editor, and text conversions
33:20 The terminal and your files, working together
37:50 Replace across files, and the Dev tab
40:02 Watch and Serve: let the computer do the routine
41:20 The rest of the toolbox
43:17 One-click picture, video and sound edits
44:38 Image Studio: edit a picture with sliders
46:05 Media Studio: trim, speed, sound and video
47:31 Save a preset, then edit many files at once
48:55 Recent files and media open right here
50:11 Make it yours: themes, effects and shortcuts
55:31 The database studios
56:26 SQLite: A database in the file list
57:21 SQLite: Saving and testing a connection
58:47 SQLite: A sample database in one click
59:24 SQLite: SQLite Studio inside the File Manager
1:00:41 SQLite: Browsing a table
1:01:55 SQLite: Add, edit and delete rows without SQL
1:03:01 SQLite: Designing tables visually
1:04:01 SQLite: The SQL editor
1:05:21 SQLite: The visual query designer
1:06:29 SQLite: Building and running a macro
1:07:40 SQLite: Inspect, tune and maintain
1:08:34 SQLite: Export and one-click backup
1:09:15 SQLite: Import with staging, from the file list
1:10:43 SQLite: Production connections and shortcuts
1:11:20 MySQL: Find the connection and save it
1:12:52 MySQL: Test it, see where every value comes from
1:14:26 MySQL: Open MySQL Studio inside the window
1:15:36 MySQL: The studio's own connection workbench
1:16:35 MySQL: The data grid: browse, filter, total and edit rows
1:18:07 MySQL: The S Q L editor, presets, and one-click backup
1:19:25 MySQL: Design queries and schemas visually
1:21:04 MySQL: Live activity, locks, plans and maintenance
1:22:47 MySQL: Automate it: build and run a macro
1:23:49 MySQL: Load a CSV file with staging, from the file list
1:25:35 MySQL: Back to the File Manager: stop, shortcuts and safety
1:26:26 That is the tour

#FileManager #OpenSource #Tutorial
```

## Notes

- Recorded from the real program in headless Chrome with a visible cursor; nothing is faked. Each chapter starts from a fresh throwaway world in /tmp, so no real file or setting appears. The terminal uses a throwaway shell profile.
- The SQLite and MySQL chapters are the recorded chapters of `sqlite_studio_tutorial` and `mysql_studio_tutorial`, joined in without their own intro and outro (build those first).
- The desktop-only keys (Right Option + ] / [ / /, Command+Q) are shown on screen; the theme change is the real one.
- The picture is 1920x972 above its own caption strip, so the captions never cover the program.
- Narration: Edge neural voice (en-US-AvaMultilingualNeural, female) at +3% speed with 0.45s between sentences, cleaned up with a gentle compressor and loudness normalised to -16 LUFS.
- Rebuild: `bun scripts/tutorial_file_manager.ts all` (needs Google Chrome, ffmpeg-full from Homebrew and the internet for the voice). Re-record one chapter: `... record 18_terminal` then `... build`.
