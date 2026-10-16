# Codecaine File Manager: the complete, slow walkthrough (33:14)

## YouTube title

The Codecaine File Manager, Explained Step by Step (every button, nothing skipped)

## YouTube description (copy and paste)

```text
A calm, complete, step-by-step tour of the Codecaine File Manager from Bun RAD Studio. Every button is shown and explained in real time, on a throwaway folder of sample files: the window and toolbar, getting around, the views, choosing files, copying and moving with the task panel (progress, Cancel, Retry) and name clashes, the Recycle Bin and Undo, Quick Look, converting files, Find and bulk rename, reviewing changes before they happen, comparing two folders, saved Projects and Actions, QR codes, the built-in code editor with its text conversions, then themes, keyboard shortcuts and the terminal.

Free and open source: https://github.com/codecaine-zz/bun_rad_studio
Download: https://github.com/codecaine-zz/bun_rad_studio/releases/latest

Chapters
0:00 Welcome
0:36 The window, piece by piece
4:41 Getting around
6:44 How the list looks
8:14 Choosing files, and making new ones
10:09 Copying files, and name clashes
12:31 Big jobs: progress, Cancel, Retry and Activity
14:49 Moving files: cut, drag, and two panes
16:18 Deleting safely: the Recycle Bin
17:40 Look without opening: Quick Look and copy to clipboard
19:35 Convert and process files
21:04 Find files, and rename the matches
22:17 Review before anything changes
24:21 Compare two folders
26:16 Projects: get back to where you were
27:46 Actions: saved recipes
29:25 Make and read QR codes
30:28 The built-in code editor, and text conversions
31:45 Make it yours: themes, shortcuts and the terminal
32:52 That is the tour
```

## Notes

- Recorded from the real program in headless Chrome with a visible cursor; nothing is faked. Each chapter starts from a fresh throwaway world in /tmp, so no real file or setting appears.
- The picture is 1920x972 above its own caption strip, so the captions never cover the program.
- Narration: Edge neural voice (en-US-AvaMultilingualNeural, female) at +8% speed with 0.4s between sentences.
- Rebuild: `bun scripts/tutorial_file_manager.ts all` (needs Google Chrome, ffmpeg-full from Homebrew and the internet for the voice). Re-record one chapter: `... record 04_copy` then `... build`.
