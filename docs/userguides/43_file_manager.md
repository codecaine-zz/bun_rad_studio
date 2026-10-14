# File Manager

An easy, safe file manager for **macOS, Windows and Linux**, built for people who do not want to learn anything first. Everything is visible and labelled, nothing is deleted for good unless you say so twice, and almost every action can be undone.

Added on 14 October 2026; the record of what was checked is [D-045](../documentation-maintenance/discrepancies.md#d-045).

## Contents

- [Start it](#start-it)
- [The window](#the-window)
- [Everyday tasks](#everyday-tasks)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Convert and process files](#convert-and-process-files)
- [How it keeps your files safe](#how-it-keeps-your-files-safe)
- [The terminal](#the-terminal)
- [Where it keeps its own files](#where-it-keeps-its-own-files)
- [What was verified, and what was not](#what-was-verified-and-what-was-not)
- [Limits](#limits)
- [For developers](#for-developers)

## Start it

```bash
bun run app:files                    # open the window
bun run app:files --path ~/Pictures  # open it at a folder
bun run app:files --server           # only the server; open the printed address in a browser
```

It is also in the **Launcher** under *File & Directory Tools*. Options: `--port N`, `--path DIR`, `--width N`, `--height N`, and (mainly for testing) `--home DIR` and `--data-dir DIR`.

## The window

| Part | What it does |
|---|---|
| **Toolbar** (top) | Back, Forward, Up, Refresh, New folder, New file, Cut, Copy, Paste, Rename, Delete, Undo, View, Details, Settings, Help. Buttons that cannot be used right now are greyed out |
| **Address bar** | Shows where you are as clickable steps. Click an empty part, press the pencil, or press Ctrl/⌘+L to **type** a location (`~` means your home folder) |
| **Search box** | Looks in the current folder and everything below it. Type part of a name, or use `*` and `?` as wildcards (`*.jpg`) |
| **Sidebar** (left) | Your **Favorites**, the usual **Places** (Home, Documents, Downloads, Pictures and so on), your **Drives** with a free-space bar, recently opened folders, and the **Recycle Bin** with the number of items in it |
| **File list** (middle) | Three views: **Details** (a table you can sort by clicking a heading), **List** and **Icons**. Folders come first if you keep that setting on. Numbers sort naturally (`Folder 2` before `Folder 10`) |
| **Details panel** (right, optional) | Type, size and dates of the selected item, with a **preview** of images and text files |
| **Status line** (bottom) | How many items there are and what is selected |

## Everyday tasks

- **Open** a folder or file: double-click, or select it and press Enter. Files open in the program your computer normally uses for them.
- **Select several**: Ctrl/⌘+click to add or remove one, Shift+click for a range, Ctrl/⌘+A for all.
- **Copy or move**: Copy (or Cut), go to the other folder, Paste. Or drag items onto a folder in the list or the sidebar; hold Ctrl (Option on a Mac) while dropping to copy instead of move.
- **If a name is already taken**, a window asks what to do: **Keep both** (the default; the new one becomes `name (2)`), **Replace** (the old one goes to the Recycle Bin first) or **Skip**.
- **Rename**: F2. Choose several items and press F2 for **bulk rename**: pick a pattern (for example "Album {n}") and a **live preview** shows every new name before anything changes. If any one rename fails, all of them are put back.
- **Delete**: Delete moves items to the **Recycle Bin**. Open the Recycle Bin from the sidebar to **Restore** an item (to where it came from), **Delete forever**, or **Empty bin**. *Delete permanently* (Shift+Delete) and emptying the bin always ask first.
- **Undo**: Ctrl/⌘+Z undoes the last new item, rename, copy, move, delete, restore, zip or unzip, one step at a time.
- **Compress and extract**: right-click → *Compress to zip*, or on a `.zip` file → *Extract here* (it makes a new folder, so nothing is overwritten).
- **Terminal**: click **Terminal** in the toolbar (or press Ctrl+`, Control on every system) to open a real terminal at the bottom, **already in the folder you are looking at**. **Go to this folder** moves the shell to wherever you have browsed since; **Restart** starts a fresh shell there. The ✕ only hides the panel, so a command that is running keeps running; type `exit` (or press Enter after it ends) to finish it. Drag the thin bar above it, or use its up and down arrow keys, to change the height. See [the terminal's safety notes](#the-terminal).
- **Favorites**: right-click a folder → *Add to Favorites*.
- **Properties**: Alt+Enter or the Properties button: size (folders are counted, with a limit), dates, location.
- **Settings**: colours (match the computer, light or dark), text size, hidden files, folders first, Details panel.
- **Help** (F1) lists everything above, and a short welcome appears the first time.

## Keyboard shortcuts

On a Mac, use ⌘ where this table says Ctrl. Press F1 in the app for the same list.

| What | Keys |
|---|---|
| Open | Enter, or double-click |
| Up one folder | Backspace, or Alt+↑ |
| Back, Forward | Alt+←, Alt+→ |
| Copy, Cut, Paste | Ctrl+C, Ctrl+X, Ctrl+V |
| Duplicate | Ctrl+D |
| Rename | F2 |
| Move to Recycle Bin | Delete (⌘⌫ on a Mac) |
| Delete permanently | Shift+Delete |
| Undo | Ctrl+Z |
| Select all | Ctrl+A |
| New folder, New file | Ctrl+Shift+N, Ctrl+Alt+N |
| Search, type a location | Ctrl+F, Ctrl+L |
| Refresh | F5 |
| Hidden files, Details panel | Ctrl+Shift+H, Ctrl+I |
| Views | Ctrl+1, Ctrl+2, Ctrl+3 |
| Properties | Alt+Enter |
| Show or hide the terminal | Ctrl+` (Control on a Mac too) |
| Context menu | Shift+F10 or the Menu key |
| Jump to an item | Start typing its name |
| Help | F1 or ? |

Everything can be done from the keyboard: the page has a "Skip to the files" link, dialogs trap focus and close with Escape, and the focused item has a visible outline.

## Convert and process files

Select pictures, videos, sound files or documents, then **right-click → Convert or process…** (or the **Convert** button). A window lists what can be done with *exactly those files*, in plain words, and puts each result **next to the original as a new file**; originals are never changed and nothing is overwritten (`photo.jpg` becomes `photo (2).jpg` if `photo.jpg` exists). It works on any number of files at once, shows progress in a **tasks panel** that you can cancel, selects the new files when it finishes, and explains a failure in a sentence ("ffmpeg can't read this file. It may be damaged…"). A file that fails never stops the others and never leaves a half-written file behind.

| Group | Does | Done by |
|---|---|---|
| Pictures | Convert to JPG, PNG, WebP, PDF, icon (.ico); half or quarter size; fit within 1920, 1280 or 800 px; rotate; black and white; remove location and camera info; **combine into one PDF** | ImageMagick |
| Video | Convert to MP4, WebM, animated GIF; make smaller for sharing; save the sound as MP3; save a cover picture | ffmpeg |
| Sound | Convert to MP3, M4A (AAC), WAV, FLAC | ffmpeg |
| Documents | Convert Markdown, Word, HTML, ODT, EPUB, RTF, LaTeX and more to HTML, Word, ODT, Markdown, plain text, EPUB, or PDF (needs a PDF engine such as Typst or LaTeX) | pandoc |

**The helper programs.** The three tools are free and installed once. The window shows whether each is installed (and its version), and what to do if not:

| Your computer | What the window offers |
|---|---|
| macOS or Linux **with Homebrew** | **Install** button: `brew install ffmpeg-full`, `imagemagick-full`, `pandoc` (no password; "full" builds read and write every common format, including HEIC and x264). Progress and the installer's output appear in the tasks panel |
| macOS or Linux **without Homebrew** | An explanation, the official Homebrew install command with **Copy the command** and **Type it in the Terminal** (typed, not run: you press Enter), then **Check again** |
| Windows | **Install** with winget (built into Windows 10 and 11), or Scoop if that is what you have; if neither exists, how to get winget |
| Linux with apt, dnf or pacman | The exact `sudo …` command, to copy or type in the Terminal (it needs your password, so the File Manager does not run it) |

If a program is installed but built without a format (for example Homebrew's plain `ffmpeg` has no libx264 on some systems), the affected buttons say so and name the "full" build. **Install all missing programs** installs everything that can be installed without a password in one go. The same logic is available without the window:

```bash
bun run tools:check               # what is installed, and which package managers were found
bun run tools:install             # installs what is missing, asking first
bun run tools:install ffmpeg pandoc --yes
```

Programs are found on your PATH **and** in the places package managers use (for example Homebrew's `opt/ffmpeg-full/bin`, which is not on the PATH when the window is opened from Finder, the Dock or the launcher), WinGet's links folder, Scoop's shims and Chocolatey's `bin`.

## How it keeps your files safe

- **Nothing is deleted for good by accident.** Delete is a move to the app's Recycle Bin; permanent delete needs a confirmation in the page *and* an explicit `confirm` in the request.
- **Nothing is overwritten silently.** Copy, move, rename, extract and restore pick a free name unless you choose *Replace*, and Replace keeps the old item in the Recycle Bin.
- **System and personal folders are protected.** The operating system folders (for example `/usr`, `C:\Windows`), your home folder and the standard folders inside it (Documents, Downloads and so on) cannot be moved, renamed or deleted; their contents can be changed. This is enforced by the server, not just hidden buttons. The Recycle Bin's own folder is protected too.
- **Helper programs never see a shell.** Every conversion is a program plus a list of arguments, so a file called `$(rm -rf ~).png` or `; touch x` is just a name. Names that ImageMagick would read as instructions (`[`, `]`, `*`, `%`, `:`) are handled by giving it a temporary safe name. Installing needs a confirmation and only runs the fixed command for that tool.
- **Programs ask first.** Opening an application or installer (for example `.exe`, `.msi`, `.app`, `.jar`; see `fmPaths.ts` for the full list) asks "Run this program?" with *Cancel* selected.
- **Zip files are checked.** Entries that would be written outside the new folder (`../x`, absolute paths, drive letters), links, encrypted or ZIP64 archives, wrong sizes or checksums are refused, and a failed extract removes the folder it started.
- **Plain-language errors.** "That name is already used", "You don't have permission", "The disk is full", rather than error codes.
- **Only this computer can use it.** The server listens on `127.0.0.1`, refuses foreign `Origin`/`Host` headers, needs a random per-session token on every action, accepts only JSON and a small body, and sends a strict Content-Security-Policy (no inline script). File names are only ever shown as text. See [Security](../security.md) for what this does *not* stop (another program running as you can read the page and token).

### The terminal

- It is a **full shell running as you** (your login shell, for example zsh or bash), so everything the File Manager protects does **not** apply inside it: `rm` skips the Recycle Bin and cannot be undone, and system folders are not protected from you. The panel says so.
- Only the page that was opened by this window can start one: the connection needs the session's secret token, must come from the page's own address, and at most 4 shells run at once. Closing the window (or the connection) ends every shell, and a shell is also ended if the window's process is killed.
- **macOS and Linux only for now.** Bun can open a pseudo-terminal only there; on Windows the Terminal button is greyed out with a tooltip that says so.
- It is the open-source **xterm.js** (MIT), copied into `resources/file_manager/vendor/` with its licence; nothing is loaded from the internet. It is dark in both colour schemes.
- Copy and paste work as in any terminal window (⌘C/⌘V on a Mac; Ctrl+Shift+C/V on Linux where your system's terminal does that). The terminal's text size follows the **Text size** setting.

## Where it keeps its own files

| What | Where |
|---|---|
| Temporary copies while ImageMagick works | a `fm-magick-…` folder in the system temp folder, removed when each file is done |
| Settings (favorites, recent folders, view, sort, theme) | `~/.bun_rad_studio/file_manager.json` (readable only by you) |
| The Recycle Bin | `~/.bun_rad_studio/file_manager_trash/` |

The Recycle Bin is the app's **own**, not the operating system's Trash or Recycle Bin: items deleted here do not appear in Finder, Explorer or your desktop's trash, and an item on another disk is copied into this folder (so deleting a large file on a USB drive takes time and uses space here). Emptying the bin frees that space.

## What was verified, and what was not

Checked on **macOS** only, with a sandbox home folder so no real files were touched:

- All backend functions and the HTTP API by automated tests (about 230), including real `zip`/`unzip` interoperability and crafted malicious archives.
- The page in a real browser: browsing, selection, navigation, new folder, rename (including errors), copy, move, undo, delete, Recycle Bin restore, search, the three views, the context menu, type-ahead, the conflict window, zip and extract, bulk rename with undo, favorites, typed locations, the "Run this program?" prompt (cancelled), protected-folder messages, settings, help, no console or CSP errors.
- Drag and drop with **synthetic** drag events (drop on a folder, on the Recycle Bin, Option to copy). A real mouse drag could not be driven by the test tool.
- The **terminal** in a real browser: opens in the current folder, runs commands and shows colours, Ctrl+` toggles it (also from inside it), the shell survives hiding and showing, **Go to this folder** with a folder named `it's a $HOME "test"`, **Restart**, `exit` then Enter, resizing by drag and by keyboard, no console or CSP errors. Real shells over the WebSocket and the limits are covered by tests.
- The terminal in the **real native macOS window** (WebKit): Ctrl+` opens it in the folder on screen and a typed command ran. (A first attempt showed that focus set during the shortcut did not stick in the native window, so the keystrokes went to the file list; the panel now also refocuses after layout.) **Convert and process** on macOS with the real Homebrew `ffmpeg-full`, `imagemagick-full` and `pandoc`: every action (32) on real pictures, a video, a sound file and a Markdown file; a picture named `weird [name] 100%.png`; a broken video (the plain-language failure, no leftover file); the dialog, tray and "new files are selected" in a browser; and the "no tools, no Homebrew" screen. Installing was tested only with a stand-in `brew`, never against the real network.
- The real native window opens, shows the page and shuts its server down when the window's process ends.

**Not verified:** installing for real on any system (a stand-in package manager was used), anything on Windows (winget, Scoop and `.cmd` programs) and on Linux (apt, dnf, pacman, Linuxbrew), PDF output from pandoc (no PDF engine here), HEIC and AVIF input, long videos; the terminal on **Linux** (it uses the same code, but was only run on macOS), and it cannot exist on Windows yet; vim, ssh and other full-screen programs inside the terminal; the native window on **Windows and Linux** (on macOS the terminal was checked in it); the Windows commands used to open a file (`rundll32 url.dll,FileProtocolHandler`) and *Show in Explorer* (`explorer.exe /select,`); Linux `xdg-open`; Windows drive letters and long paths. The backend tests do run in the experimental Linux/Windows CI job, but the project as a whole is not supported on Windows (see [Testing](../testing/index.md#other-platforms)). A screen reader was not used.

## Limits

- No rubber-band (drag a box) selection.
- Cut and Copy work **inside the app only**; they do not use the system clipboard, and you cannot drop files from another program onto it.
- Zip: no passwords, no ZIP64 (over 4 GB or 65,535 entries); at most 8 GB and 100,000 entries.
- A folder shows at most 50,000 items (500 are drawn at a time with a "show more" button); search and size counts have limits and say when they stop early.
- Symbolic links are copied as links and never followed when counting or searching.
- The terminal does not exist on Windows (no pseudo-terminal there from Bun) and is not tied to the Recycle Bin or the protected folders.
- It reads its page from `resources/file_manager/` at run time, so a single compiled executable of it (`bun build --compile`) was not tried and would need that folder beside it.
- Conversions use the helper programs' standard settings (JPG quality 90, MP4 CRF 23 and so on); there are no per-file options yet. Video conversion can take a long time and progress is per file, not per percent. PDF from documents needs a PDF engine. Batches are limited to 500 files.
- Setting a file's permissions, tags and "Open with" a chosen program are not included.

## For developers

| Part | File |
|---|---|
| Window and `--server` | `applications/file_manager_studio.ts` (the server runs in a child process, because the window blocks its own process; the child exits when its parent is gone) |
| HTTP API and security | `src/features/filemanager/fmServer.ts` |
| Operations | `fmOps.ts` (create, rename, copy, move, bulk rename), `fmTrash.ts`, `fmZip.ts`, `fmList.ts` (listing, properties, search, drives, preview), `fmOpen.ts`, `fmSettings.ts`, `fmPaths.ts` (names, protected paths, classification), `fmCore.ts` |
| Page | `resources/file_manager/index.html`, `ui/style.css` and ES modules in `ui/` (no framework, no inline script) |
| Convert and process | `fmTools.ts` (catalog, detection folders, command building, install plans: pure), `fmBatch.ts` (detection, action list, batches, installs), `fmJobs.ts` (job runner), `ui/tools.js`, and `scripts/install_media_tools.ts` |
| Terminal | `src/features/filemanager/fmTerminal.ts` (shells on a PTY), the `/api/terminal` WebSocket in `fmServer.ts`, `ui/terminal.js`, and the vendored library in `resources/file_manager/vendor/` (see its `README.md` for the two small changes made to it) |
| Tests | `tests/file_manager_*.test.ts` |

The window deliberately does **not** use `attachWindowShortcuts`: that shared script closes the window on a double-tap of Alt and handles F5 and zoom keys, which would conflict with this app's keys. The page asks the window to close with Ctrl/⌘+W through a bound `closeApp` function.
