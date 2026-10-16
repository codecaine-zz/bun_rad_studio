# Codecaine File Manager: the complete, step-by-step guide (87:05)

## YouTube title

Codecaine File Manager: Terminal + Files Together, Image & Media Studios, Every Tool, Themes and Databases (complete guide)

## YouTube description (copy and paste)

```text
A calm, complete, step-by-step guide to the Codecaine File Manager from Bun RAD Studio, made so anyone can follow along. Every button is shown and explained in real time, on a throwaway folder of sample files.

What you will learn:
- The basics: the window, getting around, views, selecting, copying and moving with the task panel (progress, Cancel, Retry), name clashes, the Recycle Bin and Undo, Quick Look.
- Work faster with the terminal: the file list follows the terminal when you cd, "Go to this folder" and "Open terminal here" move the terminal to your files, and "Insert paths in Terminal" types safely quoted paths of the selected files and folders for you. "Copy paths for Terminal" does the same for any other terminal app. On Windows it follows PowerShell, the Command Prompt and WSL, writing each path the way that shell needs (C:\Users becomes /mnt/c/Users in WSL).
- Every tool: Convert, Find and bulk rename, Review, Compare, Projects, Actions, QR codes, the code editor, Replace across files with preview and Undo, the Dev tab (code stats, Git, TODO), Watch, Serve, Crypto, Secrets, Env, IP info, Network, Subdomains, Downloads, Calculator, Timer, API, Bundler and the Graveyard.
- Edit pictures, songs and videos: dozens of one-click edits (black and white, round pictures, sepia, shapes, GIFs), the Image Studio and Media Studio with live sliders, hold to compare, trim, speed, fades and quick recipes, saved presets applied to many files at once, Recent files, and pictures, songs and videos that open right inside the File Manager on Enter.
- Make it yours: 180 themes with an effects filter (special effects or plain colours), futuristic and rare-system looks (BeOS, OS/2 Warp, Palm OS, Zune…), the theme editor with panel opacity, glass blur, glow, corners, borders and scanlines, ⌘⇧T and Right Option + T to open themes, Right Option + ] / [ to flip through them, Right Option + / for full screen (Esc never leaves it), Command+Q to quit (with an option to only close with the close button), and editable keyboard shortcuts.
- The database studios: complete SQLite Studio and MySQL Studio walkthroughs.

Free and open source: https://github.com/codecaine-zz/bun_rad_studio
Download: https://github.com/codecaine-zz/bun_rad_studio/releases/latest

Chapters
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
60:41 SQLite: Browsing a table
61:55 SQLite: Add, edit and delete rows without SQL
63:01 SQLite: Designing tables visually
64:01 SQLite: The SQL editor
65:21 SQLite: The visual query designer
66:29 SQLite: Building and running a macro
67:40 SQLite: Inspect, tune and maintain
68:34 SQLite: Export and one-click backup
69:15 SQLite: Import with staging, from the file list
70:43 SQLite: Production connections and shortcuts
71:20 MySQL: Find the connection and save it
72:52 MySQL: Test it, see where every value comes from
74:26 MySQL: Open MySQL Studio inside the window
75:36 MySQL: The studio's own connection workbench
76:35 MySQL: The data grid: browse, filter, total and edit rows
78:07 MySQL: The S Q L editor, presets, and one-click backup
79:25 MySQL: Design queries and schemas visually
81:04 MySQL: Live activity, locks, plans and maintenance
82:47 MySQL: Automate it: build and run a macro
83:49 MySQL: Load a CSV file with staging, from the file list
85:35 MySQL: Back to the File Manager: stop, shortcuts and safety
86:26 That is the tour
```

## Notes

- Recorded from the real program in headless Chrome with a visible cursor; nothing is faked. Each chapter starts from a fresh throwaway world in /tmp, so no real file or setting appears. The terminal uses a throwaway shell profile.
- The SQLite and MySQL chapters are the recorded chapters of `sqlite_studio_tutorial` and `mysql_studio_tutorial`, joined in without their own intro and outro (build those first).
- The desktop-only keys (Right Option + ] / [ / /, Command+Q) are shown on screen; the theme change is the real one.
- The picture is 1920x972 above its own caption strip, so the captions never cover the program.
- Narration: Edge neural voice (en-US-AvaMultilingualNeural, female) at +3% speed with 0.45s between sentences, cleaned up with a gentle compressor and loudness normalised to -16 LUFS.
- Rebuild: `bun scripts/tutorial_file_manager.ts all` (needs Google Chrome, ffmpeg-full from Homebrew and the internet for the voice). Re-record one chapter: `... record 18_terminal` then `... build`.
