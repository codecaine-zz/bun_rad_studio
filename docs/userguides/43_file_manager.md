# File Manager

An easy, safe file manager for **macOS, Windows and Linux**, built for people who do not want to learn anything first. Everything is visible and labelled, nothing is deleted for good unless you say so twice, and almost every action can be undone.

Added on 14 October 2026; the record of what was checked is [D-045](../documentation-maintenance/discrepancies.md#d-045).

## Contents

- [Start it](#start-it)
- [The window](#the-window)
- [Views](#views)
- [Everyday tasks](#everyday-tasks)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Convert and process files](#convert-and-process-files)
- [Encrypt and decrypt files and folders](#encrypt-and-decrypt-files-and-folders)
- [The code editor](#the-code-editor)
- [Developer information (Dev tab)](#developer-information-dev-tab)
- [Live server and PHP server (Serve tab)](#live-server-and-php-server-serve-tab)
- [Files that aren't what their name says](#files-that-arent-what-their-name-says)
- [More info and metadata](#more-info-and-metadata)
- [How it keeps your files safe](#how-it-keeps-your-files-safe)
- [The terminal](#the-terminal)
- [Copy any section](#copy-any-section)
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
| **Status line** (bottom) | How many items there are and what is selected, with quick **Details / List / Icons** buttons for how the list looks |
| **View switcher** (very top) | **Files, Home, Tools, Split, Dual** (see [Views](#views)), a **Places** button that folds the sidebar away, and a **Focus** button |

On a narrow window the toolbar keeps to one row: the buttons that don't fit move, from the end, into a **More** menu, and the view switcher shows only its pictures (their names are still read out to screen readers and shown as tooltips).

## Views

The five buttons at the top change what the window shows. Pick one with the mouse, with the arrow keys once one of them has focus, or with **Alt+1 … Alt+5** (**⌥1 … ⌥5** on a Mac).

| View | Keys | What it is for |
|---|---|---|
| 📁 **Files** | Alt+1 | The everyday view: sidebar, address bar and the file list. |
| 🏠 **Home** | Alt+2 | A friendly start page. A search box (Enter looks for files in the folder you were in; typing also filters the tiles), a **tile for everything the app can do** (Browse, Convert, every tool in the Tools view, Terminal, Open with, Recycle Bin, Settings, Help), your **pinned folders**, **places and drives** with free space, **recent files**, **quick actions** (New folder, New file, Paste, Undo, Empty Recycle Bin), a few **tips**, and which **helper programs** for converting files are installed. |
| 🧰 **Tools** | Alt+3 | The tools — Find, Replace, Code, Watch, Crypto, IP info, Network, Calculator, Timer — with the whole window. The tabs are grouped (a thin line between groups) and scroll sideways with the ‹ › buttons when they don't fit. **← Back to files** (or Esc) returns. The toolbar's **Find & more** button and Ctrl/⌘+Shift+F open this view. The tool you used last here is remembered. |
| ⫼ **Split** | Alt+4 | Your files **and** a tool at once, so you can keep the list in view while you search, convert, edit code, calculate or run the timer. Drag the dividing line, or focus it and press the arrow keys (Shift for bigger steps, Home or a double-click to put it back in the middle). **Stacked / Side by side** (top right) puts the tool under the files or beside them. The size, the direction and the tool you used last in Split are remembered. In Split, Esc is left to the tool; use **← Back to files** to close it. |
| 🗂 **Dual** | Alt+5 | Two folders side by side. See [Dual view](#dual-view). |
| ⛶ **Focus** | Alt+6 | Not a view but a switch: hides the toolbar, the sidebar, the Details panel and the status line so the list or tool has the whole window. Press **Esc** (or the button) to bring them back. |

**Alt+7** (or the **Places** button) folds the sidebar away and back. Which view you were in, the split's direction and size, whether the sidebar is folded and whether Focus is on are saved. At start-up the page opens on **My files**; in **Settings → When the File Manager starts, show** you can choose **The Home page** or **The view I used last time**. Nothing shows until the saved view has been put in place, so you never see the wrong view flash by.

### Dual view

The **left** side is the normal file list with everything it can do (sorting, searching, rename, right-click menu, the sidebar and the address bar above it). The **right** side is a lighter pane with its **own folder, address steps and selection**. The side you last clicked or tabbed into is marked with a coloured line along its top.

- **Tab** moves between the two lists (Shift+Tab moves the focus the ordinary way).
- **F5** copies and **F6** moves the selected items from the active side into the other side's folder. The buttons under the right pane do the same in either direction (**Copy →**, **Move →**, **← Copy**, **← Move**), and **Delete** moves the right selection to the Recycle Bin. Name clashes ask the same question as everywhere else, and Undo works.
- **Drag** items from one side onto the other (or onto a folder in it); hold Ctrl/⌥ to copy instead of move.
- In the right pane: double-click or Enter opens a folder (or a file), Backspace goes up, Delete moves to the Recycle Bin, arrow keys, Shift and Ctrl/⌘+A select, and the right-click menu offers Open, Copy to / Move to the left folder, and Delete. The folder is remembered.

What the right pane does **not** do: rename, sort by clicking headings (it follows the left side's sort order and hidden-files setting), search, the Details panel, new folder/new file, or the sidebar. Use the left side for those.

## Everyday tasks

- **Open** a folder or file: double-click, or select it and press Enter. Files open in the program your computer normally uses for them.
- **Select several**: Ctrl/⌘+click to add or remove one, Shift+click for a range, Ctrl/⌘+A for all.
- **Copy or move**: Copy (or Cut), go to the other folder, Paste. Or drag items onto a folder in the list or the sidebar; hold Ctrl (Option on a Mac) while dropping to copy instead of move.
- **If a name is already taken**, a window asks what to do: **Keep both** (the default; the new one becomes `name (2)`), **Replace** (the old one goes to the Recycle Bin first) or **Skip**.
- **Rename**: F2. Choose several items and press F2 for **bulk rename**: pick a pattern (for example "Album {n}") and a **live preview** shows every new name before anything changes. If any one rename fails, all of them are put back.
- **Delete**: Delete moves items to the **Recycle Bin**. Open the Recycle Bin from the sidebar to **Restore** an item (to where it came from), **Delete forever**, or **Empty bin**. *Delete permanently* (Shift+Delete) and emptying the bin always ask first.
- **Undo**: Ctrl/⌘+Z undoes the last new item, rename, copy, move, delete, restore, zip or unzip, one step at a time.
- **Compress and extract**: right-click → *Compress to zip*, or on a `.zip` file → *Extract here* (it makes a new folder, so nothing is overwritten).
- **Terminal**: click **Terminal** in the toolbar (or press Ctrl+`, Control on every system) to open a real terminal at the bottom, **already in the folder you are looking at**. **Go to this folder** moves the shell to the folder you have selected in the list (or, with nothing selected, wherever you are browsing); **Restart** starts a fresh shell there. **Follow terminal** (on by default, remembered) makes the file list move to the same folder whenever you change folder in the terminal with `cd`; untick it to keep the list where it is. (On macOS and Linux the server asks the system where the shell is, a moment after you press Enter and every few seconds; a symlinked folder shows up as its real path.) The ✕ only hides the panel, so a command that is running keeps running; type `exit` (or press Enter after it ends) to finish it. Drag the thin bar above it, or use its up and down arrow keys, to change the height. See [the terminal's safety notes](#the-terminal).
- **Favorites** (places you can jump to): click the **★** at the right of the address bar to add the folder you are in (click again to remove it), or right-click a folder → *Add to Favorites*. The sidebar's **Favorites** section lists them (**＋** adds a typed path such as `~/Projects`, **⚙** opens *Manage favorites*); the **⭐ Favorites** toolbar button (Ctrl/⌘+Shift+B) shows the same list as a menu. *Manage favorites* lets you rename (a name is only a label), reorder, remove and add; a folder that has since gone is marked as missing. Up to 100, saved in your settings.
- **Properties**: Alt+Enter or the Properties button: size (folders are counted, with a limit), dates, location.
- **More info**: Alt+Shift+Enter, right-click → *More info…*, or the *More info…* button in Properties and in the Details panel: every detail about a file, picture, folder or selection, including the hidden ones (see [More info and metadata](#more-info-and-metadata)).
- **Themes**: Settings → *Choose a theme…* (or the Home view's **Themes** tile) opens a gallery of 135 colour themes in five groups: Futuristic, Editors and classics, Linux, Windows and macOS. Search by name, show only light or only dark ones, and click a theme to try it: it applies at once and is remembered. *Standard* goes back to the plain Light/Dark/automatic colours. The themes are the same ones the SimpleGUI apps use, turned into this window's colours; for every theme the text, buttons, warnings and messages are adjusted until they reach the same readability checks as the built-in colours (`tests/file_manager_themes.test.ts` runs them all). **Make your own:** in the gallery press *Create or edit a theme…*. The theme editor starts from any theme (or a plain light or dark one), lets you change the window background, panels, text, accent, lines and the red, amber, green and blue status colours with a colour picker or a hex code, and shows the result in the whole window while you edit. Text and buttons are adjusted a little when a colour choice would be hard to read, and the editor says so. *Save theme* keeps it in a **My themes** group at the top of the gallery (up to 50); when you edit one of your own, *Save* replaces it and *Save as a copy* keeps both. *Export…* gives you text you can keep or send to someone, and *Import…* turns that text back into a theme you can adjust before saving. Your themes are kept in `file_manager_themes.json` in the app's data folder. Glow, glass and animation effects of the Futuristic themes are not applied here, only their colours. The built-in terminal stays dark.
- **Settings**: colours (match the computer, light or dark), text size, hidden files, folders first, Details panel.
- **Help** (F1) lists everything above, and a short welcome appears the first time. Its **About and GitHub** button (also a tile on the Home view) opens the project's GitHub page, the issue tracker, releases and the author's profile in your web browser.

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
| Refresh | F5 (in the Dual view F5 copies; use Ctrl+R to refresh) |
| Hidden files, Details panel | Ctrl+Shift+H, Ctrl+I |
| List views | Ctrl+1, Ctrl+2, Ctrl+3 |
| Window views: Files, Home, Tools, Split, Dual | Alt+1, Alt+2, Alt+3, Alt+4, Alt+5 (⌥ on a Mac) |
| Focus (hide toolbar and side panels), leave with Esc | Alt+6 |
| Fold the sidebar away | Alt+7 |
| Open Find in the Tools view | Ctrl+Shift+F |
| Dual view: switch side, copy, move | Tab, F5, F6 |
| Resize the Split divider | ←/→ (↑/↓ when stacked), Shift for bigger steps, Home to reset |
| Properties | Alt+Enter |
| More info and hidden details | Alt+Shift+Enter (Ctrl+I stays "Details panel") |
| Copy the section you are in | Alt+Shift+C (⌥⇧C on a Mac) |
| Show or hide the terminal | Ctrl+` (Control on a Mac too) |
| Context menu | Shift+F10 or the Menu key |
| Jump to an item | Start typing its name |
| Help | F1 or ? |

Everything can be done from the keyboard: the page has a "Skip to the files" link, dialogs trap focus and close with Escape, and the focused item has a visible outline.

## Convert and process files

Select anything (files, folders, or both), then **right-click → Convert or process…** (or the **Convert** button). The window asks **"What do you want to turn these into?"**, says what you selected ("2 pictures, 1 video and 1 folder"), and lists *only what applies to exactly those items*, grouped as **Pictures, Video, Sound, Documents, Data & text, Archives, PDF tools, Ebooks, Fonts** and **Other**, each with a one-line description and a label that says what it needs: **Built in** (nothing to install), **Uses ffmpeg**, or **Needs Tesseract** (greyed out, with the reason and an **Install** button). A search box narrows the list by any word (`pdf`, `small`, `mp3`, `csv`, `rotate`…), and the group buttons show one group. Press the **Down arrow** in the search box to move into the list.

Choosing an action opens its **options** (a quality slider, a size, start and end times like `1:30` or `00:01:30.5`, a page range like `1-3,5`, an encoding, a separator, whether to flatten nested data, the merge order…), where the **new files go** (next to the originals by default, or in another existing folder) and **what they are called** (automatic, or a pattern such as `{name} (small)`; `{name}`, `{n}` and `{date}` are filled in, the file type is added for you), and a **preview of exactly which files will be made** before anything runs. It says plainly whether you get *one new file for each* selected item or *one from all of them together* ("Merge PDFs", "Zip", "Contact sheet"). A wrong value is explained in words and **Convert** waits.

Originals are never changed and nothing is ever overwritten (`photo.jpg` becomes `photo (2).jpg` if it exists; if a file appears at the very last moment it is left alone and the step fails with a sentence). Work runs in the background with progress in the **tasks panel** (cancel any time, **Show the new files**), failures are explained in one sentence, a failed file never stops the others and never leaves a half-written file behind, and things a conversion could not keep exactly ("Nested data was flattened…", "3 items were skipped for safety") are listed with the finished task. Built-in conversions run in a separate worker, so a big file never freezes the File Manager.

### Every conversion

*Primary* is the engine used first; a *fallback* is tried only when the primary isn't installed or can't do that file (decided by asking the installed program what it can do, never by guessing). Files over **100 MB** are refused by the built-in converters with a plain message.

| Group | From → to | Needs |
|---|---|---|
| **Pictures** | JPG, PNG, WebP, AVIF, HEIC, TIFF, BMP, GIF, ICO, ICNS (Mac icon), SVG, HEIC/HEIF… → JPG, PNG, WebP, AVIF, HEIC, TIFF, BMP, GIF, ICO, favicon (16/32/48), ICNS, PDF (one each, or **all pictures in name order as one PDF**) | ImageMagick (primary, the only engine). Reading HEIC, AVIF, SVG, PDF and writing WebP, AVIF, HEIC needs the **full** build; the window says so |
| | **Web-sized picture** (format, longest side, quality, metadata removed), **make the file smaller** (same format), resize (fit, width, height, percent; 50 %, 25 %, 1920, 1280, 1080, 800 px, thumbnail 256), social sizes (square, story, link preview, banner, YouTube, avatar), rotate / flip / upright, black and white, convert to sRGB, remove location and camera info, text watermark, SVG → sharp PNG, **contact sheet**, **animated GIF or WebP from pictures** | ImageMagick |
| **Video** | → MP4 (H.264/AAC), MKV (no re-encoding), WebM (VP9/Opus), MOV, AVI, animated GIF (palette-optimised, or custom part/size/smoothness), GIF → MP4 | ffmpeg (primary, the only engine); H.264, VP9, MP3 and other encoders are checked first |
| | Make smaller for sharing / email / smallest file, shrink a screen recording, 1080p / 720p / 480p, **trim** (start/end, fast or exact), speed up / slow down, remove the sound, rotate, **extract the sound** (MP3, M4A, FLAC, WAV, OGG, Opus, AIFF), save a cover or a picture at a time, **many pictures every N seconds**, **join videos in the order chosen**, **burn subtitles in**, save subtitles out, **SRT ⇄ VTT ⇄ ASS**, HDR → SDR | ffmpeg (subtitles burn-in needs libass, HDR needs libzimg: both in `ffmpeg-full`) |
| **Sound** | → MP3, M4A (AAC), FLAC, WAV, OGG, Opus, AIFF, WMA; **choose bitrate (128/192/256/320 or variable), sample rate, mono/stereo**; normalise loudness (EBU R128), cut silence at the ends, speed (pitch kept), **join**, change title/artist/album, remove tags, remove cover art, draw the waveform, **make a ringtone** (iPhone .m4r or MP3, with a fade-out) | ffmpeg |
| **Documents** | Markdown, HTML, Word (DOCX), ODT, RTF, EPUB, LaTeX, reStructuredText, Org, AsciiDoc, MediaWiki, Textile, Jupyter, man page, FB2, plain text, **PowerPoint (PPTX from Markdown)**, PDF; standalone HTML with embedded resources; table of contents option | pandoc (primary). PDF needs a PDF engine (Typst or LaTeX) |
| | Old Office files (DOC, DOT, WPS, WPD, PAGES, XLS, PPT, KEY…) and any Office → **PDF**, DOCX, ODT, text | LibreOffice (only for what pandoc can't read, and for faithful Office → PDF) |
| | **Read the text in a picture or a scanned PDF (OCR)** → text file, or a **searchable PDF**; language chosen from the installed packs | Tesseract (+ Ghostscript for PDFs) |
| | Markdown → web page, web page → text | pandoc, or **built in** when pandoc isn't installed |
| **Data & text** (all **built in**) | **JSON ⇄ YAML ⇄ TOML ⇄ CSV ⇄ TSV ⇄ XML ⇄ JSON Lines ⇄ INI ⇄ .env ⇄ .properties ⇄ Markdown table ⇄ HTML table ⇄ SQL INSERT ⇄ plist**; JSON5 and JSONC are read; make JSON easy to read, as small as possible, or with sorted keys. Nested data becomes dotted columns in tables (and can be rebuilt); big whole numbers, `007`, `1.50` and duplicate keys are kept or reported, never silently changed | nothing |
| | **XLSX / ODS → CSV, JSON, YAML, Markdown, HTML, SQL…** (first sheet, or every sheet in one file or as separate CSV files), **CSV / JSON / any data → XLSX** | nothing |
| | **Text encoding** (UTF-8, UTF-8 with BOM, UTF-16, Latin-1, Windows-1250/1251/1252, KOI8-R, Mac Roman, Shift_JIS, EUC-JP, GBK, Big5, EUC-KR; found automatically, undecodable bytes reported), **line endings** (LF, CRLF, CR), tabs ⇄ spaces, trailing spaces, BOM, plain text → web page | nothing |
| **Archives** | **Zip** and **tar.gz** (files and folders), **unpack** zip, tar.gz, tar, tar.bz2, tar.xz, tar.zst, 7z, RAR, ISO, CAB, DMG…, **zip ⇄ tar.gz** without unpacking to disk, gzip / gunzip, Brotli, open .xz / .bz2 / .zst, **list what is inside**, pack a **7z** | zip, tar.gz, gzip, Brotli: **built in**. Others: the system's **bsdtar** (macOS and Windows 10/11 have it), then **7-Zip**, then **The Unarchiver** |
| **PDF tools** | **Merge**, **split into pages**, **keep some pages** (range), **make smaller**, **PDF/A**, pages → **PNG** or **JPG**, PDF → text | Ghostscript (primary). **qpdf** keeps pages exactly and does **rotate** and **fast web viewing**. **poppler**'s `pdftotext -layout` is used for text when installed, else Ghostscript |
| **Ebooks** | EPUB, MOBI, AZW3, FB2, PDF, DOCX, TXT ⇄ each other | calibre (`ebook-convert`); EPUB and FB2 from Markdown, Word and the like by pandoc |
| **Fonts** | TTF / OTF → WOFF2, WOFF; WOFF / WOFF2 → TTF | fontTools (WOFF2 needs its Brotli add-on), or the `woff2` program when that is missing |
| **Other** | Hidden details (camera, place, date) → text or JSON; **remove only the location (GPS)**; any file ⇄ **Base64** or **hex** | ExifTool; Base64 and hex are built in |

TTF ⇄ OTF is not offered: it means redrawing every outline, which no command-line tool does reliably.

**The helper programs.** The three main ones (ffmpeg, ImageMagick, pandoc) and the optional ones are free and installed once. A second tool is only offered where the first genuinely can't do the job; there is no sox, HandBrake, cwebp or similar, because `ffmpeg-full` and `imagemagick-full` already cover them. The window's **Helper programs…** page shows whether each is installed (and its version) and what to do if not:

| Your computer | What the window offers |
|---|---|
| macOS or Linux **with Homebrew** | **Install** button: `brew install ffmpeg-full`, `imagemagick-full`, `pandoc`, `ghostscript`, `qpdf`, `poppler`, `tesseract tesseract-lang`, `fonttools`, `woff2`, `sevenzip`, `unar`, `libarchive`, `exiftool`; and, for the two big applications, **`brew install --cask libreoffice`** and **`--cask calibre`** (hundreds of megabytes, so the button says so first). No password is needed. Progress and the installer's output appear in the tasks panel |
| macOS or Linux **without Homebrew** | An explanation, the official Homebrew install command with **Copy the command** and **Type it in the Terminal** (typed, not run: you press Enter), then **Check again** |
| Windows | **Install** with winget (built into Windows 10 and 11), or Scoop if that is what you have (LibreOffice and calibre come from Scoop's "extras" list); if neither exists, how to get winget. A program with no package (fontTools) says where to download it |
| Linux with apt, dnf or pacman | The exact `sudo …` command, to copy or type in the Terminal (it needs your password, so the File Manager does not run it) |

If a program is installed but built without a format (for example Homebrew's plain `ffmpeg` has no libx264 on some systems), the affected actions say so and name the "full" build. The same logic is available without the window; **nothing is installed without your confirmation**:

```bash
bun run tools:check               # what is installed, and which package managers were found
bun run tools:install             # the three main programs, asking first
bun run tools:install --all       # also the optional ones (it asks for each; the big casks are never installed silently)
bun run tools:install ffmpeg pandoc --yes
bun run tools:install libreoffice
```

Programs are found on your PATH **and** in the places they install to: Homebrew's `opt/<name>/bin` (not on the PATH when the window is opened from Finder, the Dock or the launcher), `/Applications/LibreOffice.app/Contents/MacOS` and `/Applications/calibre.app/Contents/MacOS`, WinGet's links folder, Scoop's shims, Chocolatey's `bin`, `Program Files\LibreOffice\program`, `Calibre2`, `7-Zip`, `Tesseract-OCR`, `gs\gs*\bin`, and Linux's `/usr/lib/libreoffice/program` and `/opt/calibre`.

**Safety.** Programs are started with a list of arguments, never through a shell, so a file called `$(rm -rf ~).png` is just a name. Every option is checked on the server (choices must be listed, numbers are limited, times and page ranges must match a strict pattern, text is length-limited), names that programs would read as instructions (`[`, `*`, `%`, `@`, a leading `-`) never reach them (they get safe temporary names, absolute paths, a `file:` prefix, or come after `--`), LibreOffice runs with its own private profile so a LibreOffice you have open is never disturbed, and **archives are unpacked defensively**: names that leave the folder (`../`, absolute paths, drive letters) are skipped, links are never created, the item count and total size are limited (a "zip bomb" is stopped while it unpacks), zip checksums are verified, and a failed unpack removes its folder. At most 500 items per run.

## Encrypt and decrypt files and folders

Lock files and folders with **a password you choose**, so only someone who knows it can read them. The result is a `.radenc` file you can keep, email or back up. It is not tied to this app: [the format is public](../reference/vault-format.md), and `bun run cli:vault` opens it from the command line.

> **A lost password cannot be recovered.** There is no reset and nobody to ask. Write the password down and keep it somewhere safe.

**Lock (encrypt).** Select files or folders and click **Lock** in the toolbar, or right-click → **Encrypt…**. The window shows what will be locked and asks for:

- **A password**, typed twice. Use **Suggest a passphrase** for 6 random words (shown so you can write them down); it is the strongest and easiest kind to remember. The strength meter says *Too short*, *Weak*, *Good* or *Strong* in words. Passwords under 10 characters and obvious ones (`password123`, `1234567890`, the file's own name) are refused. **Show** reveals what you typed; a hint appears if Caps Lock is on.
- **How strong the lock is.** *Standard* (recommended): about half a second per item, 256 MB of memory. *Maximum*: a few seconds and 1 GB of memory; if the computer can't spare it, the app says so and you can choose Standard.
- **Options.** *Compress first* (on); *Hide the file name* (the file is called `Encrypted file 1.radenc`; the real name is kept inside and returns when you unlock); *Move the original to the Recycle Bin after checking the locked copy* (off); and an *output folder* (empty means next to each original).

A list shows the file names that will be created. After you press **Encrypt** the app makes the key (slow on purpose), writes the locked file, **re-reads it and checks every part**, and only then reports success. Only after that, and only if you ticked it, does the original go to the Recycle Bin. **Cancel** (or closing the window) stops the job and removes anything half-written. Existing files are never replaced: a taken name becomes `name (2).radenc`. Folders are locked whole, including empty folders; shortcuts (symbolic links) and special files are skipped and listed in the result.

**Unlock (decrypt).** Double-click or press Enter on a `.radenc` file, or select it and click **Lock**, or right-click → **Decrypt…**. The window first shows what the file is (its strength and whether it is compressed; no password needed), or says plainly that it isn't a RADENC file. Type the password and press **Decrypt**. Items come back with their original names, next to the locked file or in a folder you choose, never replacing anything. A wrong password and a damaged file give the same message (*"Wrong password, or the file is damaged or has been changed."*) and leave nothing behind.

**From the command line:**

```bash
bun run cli:vault encrypt report.pdf photos/ --level standard --out ~/Locked   # asks for the password (twice), hidden
bun run cli:vault decrypt ~/Locked/report.pdf.radenc --out ~/Unlocked
bun run cli:vault info ~/Locked/report.pdf.radenc
```

Options for `encrypt`: `--level standard|maximum`, `--no-compress`, `--hide-name`, `--out DIR`. The password comes from the hidden prompt, `--password-file FILE` (first line), or the `RADENC_PASSWORD` environment variable; there is deliberately no `--password` option (it would show in the process list and shell history). Exit codes: `0` done, `1` error, `2` wrong password or damaged file.

What it protects and what it doesn't (file names on disk, file size, timing, no recovery) is in [Security](../security.md#file-encryption-radenc).

## The code editor

**Find & more → Code** (or right-click a text file → **Edit in Code editor**, or select it and press Ctrl/Cmd+E; **Open with…** also lists "Code editor (built in)") opens a small code editor inside the window: tabs, a folder tree, find and replace, find in all files, Git changes (read only), an outline, bookmarks, a Markdown preview and coloured HTML source, six colour themes besides the File Manager's light and dark, zoom, word wrap and a zen mode. Every button has a plain-language tooltip, and F1 lists every shortcut.

- **Files are handled carefully.** UTF-8, UTF-8 with BOM, UTF-16 and the line endings (LF, CRLF) are kept as they were; binary files are refused; files over 5 MB are shown only in part and cannot be saved; a save is written atomically and is refused if the file changed on disk meanwhile (you choose: overwrite, load the disk version, or save a copy); links are never written through; deleting moves a file to the Recycle Bin. Closing a tab, or leaving the page, with unsaved changes asks first. Open tabs, cursor positions and settings are remembered (`code_session.json` in the app's data folder).
- **Autosave.** Click **Autosave: Off** in the status bar (or View → Autosave) to turn it on; **View → Autosave options…** sets how long it waits after you stop typing (half a second to 30 seconds, 1.5 s by default) and whether it also saves the moment you switch to another tab, panel or window. The status bar then says **Autosaved**. It only saves files that already exist on disk (a new file still needs Save As), skips read-only files, and never overwrites a file that changed on disk behind your back: it shows the usual "changed on disk" notice instead. The choices are kept in the editor session.
- **Suggestions while you type.** A list appears under the cursor after two letters, or after `.`, `::` or `->` (Alt+/ or Ctrl+Space opens it yourself; Enter or Tab accepts, Esc closes). It offers keywords, built-in functions, standard-library members, names from this file and from the other open tabs, and **snippets** whose blanks you move between with Tab (the same name in several places is filled in together). A small tip shows the arguments of the function you are calling. It can be turned off in the View menu.
- **Run and Build presets.** Save named commands per file (or for every file with the same ending), with `{file}`, `{name}`, `{stem}`, `{ext}`, `{dir}`, `{workspace}` and `{root}` filled in and quoted for your shell. **Run** (Ctrl/Cmd+Enter) and **Build** (Ctrl/Cmd+B) type the command into the File Manager's **Terminal** after `cd`-ing to the right folder and press Enter, so the output appears there live. Nothing runs unless you press Run; commands that look risky (`rm`, `sudo`, `>` …) ask first. On Windows, which has no Terminal yet, you get the command to copy.
- **V (vlang 0.5.2).** `.v`, `.vsh`, `.vv`, `v.mod` and `*.c.v` files get V colouring, an outline, tab indentation, completion for the language, its modules and your structs, about 45 snippets, ready-made presets (`v run {file}`, `v test {file}`, `v -prod {file}`, `v fmt -w {file}`, `v vet {file}`, `v .`) and **Tools → Format document**, which runs `v fmt` for you on a private temporary copy (10 s limit; a friendly message if V is not installed).

## Developer information (Dev tab)

**Find & more → Dev** (or right-click a folder → **Code statistics…**) shows what a developer wants to know about a folder: lines of code, what kind of project it is, its Git history, where the disk space goes, and your TODO notes. The folder is the one you are browsing (press **Use current folder** or **Use selected folder**) or any location you type. **Everything is read only**: the only thing it ever writes is an export or a snapshot you ask for.

**Code stats ("tokei studio").** Lines of code, comments and blank lines per language, with a sortable table, a share bar and a legend (the numbers are always written out, never colour alone). Press a language to list its files (sortable, filterable); press a file to select it in the file list; double-press it to open it in the Code editor. Options: respect `.gitignore` (default on), include hidden files, include vendored folders (`node_modules`, `target`, `dist`, `build`, `.git`; off by default), patterns to leave out, and treat documentation comments (Rust `///`, Python docstrings …) as comments. **Export** the table or the file list as CSV, JSON or a Markdown table (copy it, or save it as a new file in the folder: an existing file is never replaced; CSV cells that start with `=`, `+`, `-` or `@` get a leading `'` so a spreadsheet won't run them as formulas). **Snapshots** keep today's numbers under a name (up to 50, in `file_manager_dev_snapshots.json` in the app's data folder); later you can **Compare** to see +/− lines and files per language.

- **Two engines, and the page says which one counted** ("Counted with tokei 15.0.0 in 45 ms" or "Built-in counter"). If the real [tokei](https://github.com/XAMPPRocky/tokei) is installed it is used (a program plus an argument list, never a shell; 60 s limit; 64 MB output limit); otherwise the **built-in counter** (a TypeScript counter with a table of more than 100 languages, including **V**: `.v`, `.vv`, `.vsh`, `//` and nested `/* */`) does the work. One button runs the same count with the other engine. **tokei is optional**; to get it: `brew install tokei` (macOS and Linux), `cargo install tokei`, `winget install XAMPPRocky.tokei` or `scoop install tokei`. The page shows these hints when it is missing, and nothing is installed for you.
- **How the built-in counter counts.** A line with any code is a code line even if it also has a comment; a line with only a comment, or inside a block comment, is a comment line; blank lines inside a block comment count as comments and inside a multi-line string as code (the same rules tokei uses). Strings are understood (`"http://x"` is not a comment), block comments nest where the language allows it (Rust, V, Haskell, Kotlin …), shell `#` only starts a comment at the start of a word, extension-less scripts are recognised by their `#!` line, JavaScript/CSS inside HTML and fenced code in Markdown are counted under their own language, Markdown and plain text count as comments (like tokei). Binary files and files over 8 MB are skipped and reported.
- **Where the two engines differ** (the totals of lines agree to a few lines; on this repository the built-in counter finds about 1% less code and 4% more comments): tokei reads `.gitignore` only inside a Git repository (the built-in counter honours it in any folder, and also in a repository's parent folders), tokei mis-reads a `'"'` character literal in Rust or C as the start of a string, tokei counts a `<script src="…"></script>` line oddly in HTML, and the built-in counter handles a few embedded languages less thoroughly. tokei does not know **V** (it counts `.v` as Coq). The doc-comment switch only applies to the built-in counter.

**Project.** Summary cards for the kinds of project it finds: **Node/Bun** (name, version, scripts, workspaces, engines, dependency counts, lockfile, TypeScript, test runner), **Rust** (package, edition, dependencies, workspace members), **Go**, **Python** (pyproject, requirements, virtual environment), **V** (`v.mod`), **Java/Kotlin** (Maven, Gradle), **.NET**, **PHP**, **Ruby**, **Swift**, **C/C++** build files, **Docker** (images, Compose services), **Make** targets, **CI** (GitHub Actions workflow names, GitLab CI and more), `.editorconfig`, README, the licence type read from the licence text (MIT, Apache-2.0, GPL, BSD, ISC, MPL, Unlicense …), CODEOWNERS and version-pin files. `.env` files are listed **by name only; their contents are never read**. Manifests are only parsed (size-capped, never run, nothing fetched). Each package script has **▶ Run in terminal**: it asks first, then types `cd <folder> && bun run <script>` (or `npm`/`pnpm`/`yarn`, by the lockfile) into the built-in Terminal and presses Enter, like the Code editor's Run presets; script names with unusual characters are never put into a command.

**Git.** Read-only: branch, ahead/behind, changed/staged/untracked counts, last commit, commit count, first commit date, remotes (**passwords and tokens in the address are removed**), top 10 contributors, a commits-per-month chart for the last 12 months, tags, the size of `.git` and the biggest tracked files.

**Disk & files.** Size by top-level entry and by file type (bars plus numbers), **heavy folders** (`node_modules`, `target`, `.venv`, `dist`, `build`, `.next`, `__pycache__`, `Pods`, `.gradle`, `DerivedData`) with a **Move to Recycle Bin…** button that always asks first and never deletes for good, the largest, newest and oldest files, empty files and folders, and **duplicate files** (same size, then a fingerprint of the start and end, then a full SHA-256; it only reports, with a button to show each copy).

**TODO.** Finds `TODO`, `FIXME`, `HACK`, `XXX`, `BUG` and `NOTE` (or your own words) in the folder's text files, grouped by marker and file; press a line to open it in the Code editor at that line. A marker is a whole capital-letter word, so `["TODO"]` in a string and `TODO_LIST` don't count. Export as CSV, JSON or Markdown.

**Tools.** Which developer programs are installed (git, bun, node, npm, pnpm, yarn, deno, python3, pip, go, rustc, cargo, v, java, javac, dotnet, ruby, php, swift, clang, gcc, make, cmake, docker, tokei, ripgrep, fd, jq, gh) and their versions, from a quick `--version` on each. Missing ones show an install command to read; nothing is installed from here. The answer is remembered for five minutes; **Check again** asks again.

**Safety and limits.** Every `dev/…` operation needs the session token and the loopback checks like all the others. Scans never follow symbolic links (files are opened without following links, and links are counted as skipped), read file contents only inside the chosen folder (the one exception: the `.gitignore` files of the repository around it, read only to apply their patterns and never shown), and stop at 200,000 files, 100,000 folders, 8 MB per file (1 GB in all) or 60 seconds; the page says when a limit cut a scan short. Scans run in the background with a progress line and a **Cancel** button (at most three at once). Exports and snapshots are the only writes, and an export can only be saved inside the scanned folder.

## Live server and PHP server (Serve tab)

**Find & more → Serve** turns a small web server on and off for a folder, so you can look at your web pages in a browser the way a visitor would, without installing anything.

- **Live server** (for HTML, CSS, JavaScript and any other files). It shows the folder at an address like `http://127.0.0.1:5500/` and **reloads the page by itself when you save a file** (a change to only a `.css` file swaps the styles without reloading, so you don't lose your place). It is built into the File Manager; there is nothing to install.
- **PHP server** (PHP's own built-in server, `php -S`). It needs **PHP installed on your computer**; the File Manager only looks for it and never installs it. If `php` is missing the tab says so and shows what to type for your system (`brew install php`, `sudo apt install php-cli`, `winget install PHP.PHP` or `scoop install php`). A folder with `index.php`, `composer.json`, `artisan`, `wp-config.php` or any `.php` file is recognised as PHP; a Laravel or Symfony project suggests its `public` folder as the document root, and WordPress says it needs a database that this server doesn't provide.

**Ways to start one.**

- **Right-click a folder** → *Start live server here* / *Stop live server*, and, when the folder looks like a PHP project, *Start PHP server here* / *Stop PHP server*.
- **Right-click an `.html` or `.htm` file** → *Open with live server*: serves that file's folder (or reuses the server already running for it) and opens that page in your browser.
- **The Serve tab** has two switches for the folder you are looking at, a list of every running server, and a *Start a new server* form: folder, kind (automatic: PHP if the folder has PHP files, otherwise live), port (Auto, or 1024–65535), reload on change, open the browser, show hidden files, allow other websites to read the files (CORS), and, under *PHP options*, a document folder inside the project (for example `public`), a router script and a particular PHP program.
- The Home tile **Live server** opens the tab for the folder you are in.

Each row of the list shows the kind (and PHP version), the folder, the address, the port, when it started, how many requests it answered and its state, with an on/off switch (it says **On** or **Off** in words, not only by colour), *Open in browser*, *Copy URL*, *Restart*, *Stop* and a **log** (the requests the live server answered, or everything PHP printed, newest at the bottom; at most 500 lines or 256 KB are kept). While any server runs, the status bar shows a pill such as **● Live :5500**; press it to come back to the tab. The page asks for news every 3 seconds, and only while the tab is open or a server is running.

**Safety.**

- **This computer only, by default.** Servers listen on `127.0.0.1` and refuse any request whose `Host` is not `127.0.0.1`, `localhost` or `[::1]` with its own port (so a web page on another site can't reach them through DNS tricks).
- **The network option is off, and never remembered.** *Let other devices on my network see it (LAN)* starts the server for everyone on your Wi-Fi or network, so you are asked to confirm in plain words first; the box is cleared after every start. PHP's built-in server is for development only and is not safe on a network.
- **Read only, and only inside the folder.** The live server answers `GET` and `HEAD` only and accepts no request body. Every address is checked: `..`, encoded slashes and backslashes, null characters, over-long addresses and Windows device names (`CON`, `NUL`…) are refused, and each file is resolved with its real path, so a symbolic link that points outside the folder is never followed. Hidden files (names starting with a dot, such as `.env`) are not shown unless you tick *Show hidden files*, and **`.git` is never shown**. The File Manager's own files and settings are never served, and your home folder, the top of a drive and system folders can't be chosen.
- **The File Manager itself is out of reach.** The served ports have no connection to its page, token or API.
- **PHP is started with an argument list, never through a shell**, in the document folder, with only `PATH`, `HOME`, `LANG` and `TMPDIR` (none of the File Manager's own variables), and its input closed. Folder names that start with `-` or hold spaces, quotes or `$(...)` are just names. Stopping asks PHP to end (SIGTERM) and, after 2 seconds, forces it (SIGKILL), with anything it started; closing the File Manager ends every server, and a last-resort handler ends any PHP still running if the program exits.
- Servers never come back after the File Manager is closed, and nothing about them is saved except your choices of kind, reload and open-browser (never the network option).

**Limits.** At most 8 servers at once, one per folder and kind (starting the same folder again just shows the one that is running); the live server serves at most 64 requests at the same moment and 50 open pages; live reload watches up to 5,000 folders (more than that: the server still works, the row says live reload is off), ignoring `node_modules`, `.git` and editor scratch files, and says so if the folder is deleted. HTML pages bigger than 8 MB are served without the reload script. Single-range `Range` requests are supported (video and audio can be skipped through); several ranges at once are answered with the whole file. PHP's server runs one request at a time, as PHP's does. Pages that use WebSockets or need HTTPS can't be tried here.

## Files that aren't what their name says

A file's name can lie. `invoice.pdf` can really be a Windows program, `photo.jpg` can really be a PNG or a zip, and `report.pdf.exe` or a name with a hidden right-to-left character can hide what it ends in. The File Manager reads the first few hundred bytes of the files you can see and puts a small badge after the name when the contents don't match:

- **⛔ Danger**: a program or a script (a Windows program, a Linux or Mac program, a text file starting with `#!`) with a name like a document, picture, sound, video, archive or text file; a name such as `report.pdf.exe` where a document or picture ending is followed by one that runs (`.exe .scr .bat .cmd .msi .vbs .js .lnk .jar .ps1 .app .dmg .pkg` and so on); a name with a right-to-left override or another invisible or control character; a long gap of spaces, dots or underscores before the ending; a trailing dot or space.
- **⚠ Warning**: a different sort of file than the name says (a `.pdf` that is plain text, a web page, a zip or a database; a `.txt` that is binary).
- **ℹ️ Note**: another format of the same sort of file (a `.jpg` that is a PNG, an `.mp4` that is a Matroska video). It offers **Rename to .png** (or whatever the real ending is); the rename never overwrites a file that already has that name, and **Undo** is offered afterwards.

Press the badge (it is a button, so Tab and Enter work too) for a plain explanation, what it means and what to do. The same explanation is in the **Details** panel and in **Properties**. A file that matches its name shows nothing.

Opening a **Danger** file asks first ("This file isn't what its name says", *Don't open* is selected); *Open anyway* then opens it (a real program still asks "Run this program?" after that). This applies to double-click, Enter, **Open with…** and the Find tool. Warnings and notes never block opening.

Turn it off in **Settings → Warn when a file isn't what its name says** (no badges and no extra question; the page then confirms for you). Files with no ending, unusual endings, `.dat`/`.bin`/`.tmp`/`.bak`, empty files, folders and links are never judged by their contents, Office, e-book and package files (`.docx`, `.epub`, `.jar`, `.apk` and so on) are zip files by design and are not flagged, and nothing is ever run or opened to find out. Only the first 300 rows of a folder are checked automatically; showing more of a large folder checks the rest.

## More info and metadata

**More info** opens a window with every detail about the selected item, written in plain words. Open it with **Alt+Shift+Enter**, right-click → **More info…**, the **More info…** button in *Properties*, or the button under the preview in the **Details** panel. (Ctrl/⌘+I still shows or hides the Details panel, so it can't also open this window.) It works for one file, a folder (counted in the background, with a **Cancel** button) and for several items at once (a total size and a breakdown).

**What it shows**, in groups you can fold: **General** (full path, the real kind worked out from the first bytes, MIME type, size in bytes and "on disk", permissions with owner and group, hidden or not), **Dates**, **Image** (size, megapixels, aspect ratio, colour type, bit depth, density, interlace, frames and loops of animations, the structure of the file), **Camera and shot** (camera, lens, date taken, exposure, aperture, ISO, focal length, flash, white balance and more), **Location**, **Colour profile**, **Extra notes (XMP)**, **Media** (container, duration, codecs, bit rate, tracks, tags, chapters, cover art), **Document** (PDF, Office, OpenDocument, EPUB, archives, databases, fonts, programs, text files and JSON), **Origin and security**, **Fingerprints**, an optional **Everything (ExifTool)** list and **What this file reveals**. A hover tooltip on every row with jargon (EXIF, ICC profile, bit depth, codec, subsampling…) explains it in a sentence.

**Searching and copying.** The sticky search box hides every row that doesn't contain all the words you type (Esc empties it). Every row has a **copy** button (it is a real button: Tab to it, then Enter or Space). **Copy report** copies everything shown as text, JSON or Markdown, and **Save report** writes it next to the item as `<name>.info.txt`, `.info.json` or `.info.md`; an existing report is never overwritten (the next one is `… (2)`). Saving is off when several items are selected.

**Pictures.** The built-in readers need no helper program and read PNG (all chunks, including text notes, `pHYs`, `iCCP`, `tIME`, `eXIf` and APNG), JPEG (baseline or progressive, subsampling, a quality estimate, JFIF, Exif, XMP, ICC, Adobe, MPF and Photoshop segments, comments), GIF (frames, duration, loops), WebP (lossy, lossless, extended, animated, with EXIF/XMP/ICC), BMP, ICO and CUR (every size), TIFF, HEIC and AVIF (size and colour boxes only) and SVG (read as text: size, `viewBox`, a count of tags, and a safety check that *reports* scripts, event handlers, links to other sites and entity definitions and never runs, fetches or expands them). EXIF is read in both byte orders, with guards against loops and damaged data: camera, lens, settings, orientation, the thumbnail and the maker's private notes (their presence), and the GPS position. The **Colour palette** (up to eight main colours with HEX, RGB and HSL; click one to copy it) is worked out in the page from a tiny copy of the picture, with no server work. The Details panel shows a compact **Photo** strip (size, camera, date, ISO, aperture, shutter, focal length) and, when there is a position, a **📍 Has location** badge.

**Privacy.** *What this file reveals* lists, with text and an icon (not colour alone), whether the picture holds the place it was taken (GPS), a camera or lens serial number, an owner or author name, the program used, the date and time, a hidden thumbnail, the camera maker's private notes, XMP or IPTC. A picture with a position shows **"This photo contains the location where it was taken."**, the coordinates in degrees and decimals, and **Copy coordinates**. **Open map…** is never automatic: it explains that the place will be sent to openstreetmap.org and opens it in your web browser only after you confirm. **Remove private info…** makes a *copy* named `<name> (no metadata).<ext>` next to the picture, without the EXIF, GPS, XMP, IPTC, comments, text notes, time stamps and the extra data some phones append after the picture; the picture data is copied byte for byte (nothing is re-encoded, no quality is lost), colour profiles are kept, and you may keep the note about which way up the picture is. It works for **JPEG, PNG and WebP**; the original is never touched and nothing is overwritten. If ExifTool is installed, **Remove only the location…** uses the existing *Convert or process → Remove only the location (GPS)* action (the date, camera and picture stay) and shows its progress in the task list. For other kinds of picture use *Convert or process → Remove location and camera info*.

**Fingerprints.** *Calculate fingerprints* works out MD5, SHA-1, SHA-256, SHA-512 and CRC32 by reading the file in 1 MB pieces (so it works for files of any size), with a progress bar and **Cancel**. Paste a fingerprint from a download page into **Compare**: capitals, spaces, colons, `0x` and a name in front such as `sha256:` are all fine.

**Where it came from (macOS).** The macOS details come from `mdls`, `xattr` and `codesign` (all read only, with time limits): the Finder's kind, tags and comment, the web addresses the file was downloaded from, whether it carries the quarantine flag (and which program and date), the extended attributes, and for programs a summary of the code signature (shown, not verified). On Linux the `file` and `getfattr` programs are used when present. On Windows only what the file system reports is shown (the read-only attribute); the hidden attribute is not read.

**Helper programs (optional).** **ExifTool** adds *Show everything*: every tag it can read, grouped by family, for pictures, RAW photos (CR2, NEF, ARW, DNG…), video, sound and PDFs. **ffprobe** (part of FFmpeg) gives the full media details; without it the built-in readers cover MP3 (ID3v1 and v2.2–2.4, Xing and VBRI durations, cover art), WAV, FLAC, Ogg Vorbis and Opus, MP4/MOV/M4A (duration, tracks, codecs, tags, chapters) and, best effort, MKV/WebM. Install hints are shown in the window and are display only: `brew install exiftool` and `brew install ffmpeg` on macOS, `winget install OliverBetz.ExifTool` and `winget install Gyan.FFmpeg` on Windows, your package manager on Linux (`libimage-exiftool-perl`, `ffmpeg`). The programs are started with an argument list (never a shell), with a time limit and an output limit, and a file name starting with `-` or ending in `|` cannot become an option or a command.

**Documents and others.** PDF (version, pages, page size, the Info dictionary, encrypted, fast web view, and a warning about JavaScript, launch actions, embedded files and open actions, found by scanning the text, never by running anything), Word/Excel/PowerPoint (title, author, who saved it last, dates, pages, words, sheets, slides, macros), OpenDocument, EPUB, zip and tar and `.tar.gz` (entry count, unpacked size, compression ratio, largest items, password-protected entries, and a warning when the numbers look like a zip bomb), SQLite (page size, encoding, WAL, user version, table list), fonts (family, style, version, designer, licence, glyphs), text files (encoding, byte-order mark, line endings, counts, longest line, indentation, `#!` line, JSON validity), and program headers (Windows PE, Linux ELF, Mac Mach-O including universal files).

**Safety.** Every `info/…` operation needs the session token and the loopback checks like all others, and every path goes through the usual path checks. Files are inspected with `lstat` first: a link is described but not followed (its target can be shown separately), and only ordinary files are read (a named pipe is refused without being opened). Only the start of a file (at most 4 MB) or the needed pieces are read, strings from files are cut at 2,000 characters and lists at 2,000 rows, nothing is ever run or opened, no network is used (the one exception is the map link you confirm), and each operation stops after 10 seconds (hashes and folder counts run as cancellable jobs instead, at most four at a time).

**Limits.** HEIC and AVIF are read for size and colour details only (install ExifTool for their camera notes and location); WOFF2 fonts, RAR/7-Zip/bzip2/xz archives and ZIP64 archives are not listed; EXIF maker notes are reported as present but not decoded; MKV/WebM and MP4 reading is best effort; the built-in cleaner works on JPEG, PNG and WebP only; the PDF scan can miss scrambled content; a big PDF (over 24 MB) is only scanned at its ends. macOS is the only system these were run on; the Linux and Windows branches (the `file`/`getfattr` extras, the read-only attribute) are written but **not verified**. There is no Details-list column choice yet.

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

## Copy any section

Most windows and tools show information in blocks: a group in *Properties* or *More info*, a table of results, a log, a list of facts, an error message. Every such block has a small **Copy** button, so you never need to select text by hand.

- **Where it is.** Point at a block (or Tab to it) and **Copy** appears in its top right corner, next to the heading. It is a real button with a name and a tooltip, it is always visible on touch screens, and it works with every theme. Tables have their own **Copy table** button above them, lists have **Copy list**, error lines have **Copy error**, and a pop-up error message has **Copy error** beside its ✕.
- **What it copies.** Plain text, ready to paste: the heading, paragraphs, `Name: value` lines for facts, `- ` bullets for lists, tab-separated rows for tables (header row included), and code or log text exactly as it is, with every space. Hidden parts, icons, buttons and the Copy buttons themselves are left out. Anything you typed into a box is never included, and password boxes never. Text over 100,000 characters is cut and ends with "(shortened)"; the message says so.
- **Other formats.** The small **▾** beside the button offers **Copy as table (for spreadsheets)** (tab-separated, pastes into Excel, Numbers and Sheets), **Copy as Markdown**, **Copy as JSON** (tables and lists of facts) and **Copy text without the heading**. Only the choices that make sense for that block are listed.
- **Keyboard.** Click or Tab into a block and press **Alt+Shift+C** (⌥⇧C on a Mac) to copy the section you are in, the same as its button.
- **Long lists.** Where a tool holds more than it shows (for example all results of a search), the button copies everything it holds, not only the rows on screen.
- **Crypto tab, one value at a time.** Each digest row, each log entry, each generated password, key, UUID or random value, each converted text, the header and payload of a token, the token times, the signature verdict and the checksum check result has its own **Copy**, and each card has a **Copy** for the whole card. **Copy all** in the toolbar copies the whole tab (results and log, never what you typed). The old **Copy output** button still copies the newest result.
- **Privacy.** Copying uses the computer's clipboard, and other programs can read the clipboard. For secrets (passwords, keys, locked and unlocked text, tokens) the message after copying says so: *Other programs can read the clipboard, so paste it soon.* Copy only what you mean to paste.
- **Not on everything.** There is no button on the file list, the terminal, the code editor, menus, or on windows that are only forms.

## Where it keeps its own files

| What | Where |
|---|---|
| Temporary copies while ImageMagick works | a `fm-magick-…` folder in the system temp folder, removed when each file is done |
| Settings (favorites, recent folders, view, sort, theme, which window view, split direction and size, sidebar, Focus) | `~/.bun_rad_studio/file_manager.json` (readable only by you) |
| The Recycle Bin | `~/.bun_rad_studio/file_manager_trash/` |
| Dev tab snapshots of code statistics (up to 50) | `~/.bun_rad_studio/file_manager_dev_snapshots.json` (readable only by you) |

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
- Dev tab: tokei is optional (see above). Scans stop at 200,000 files, 100,000 folders and 60 seconds; the built-in counter does not count files over 8 MB, has no embedded languages beyond `<script>`/`<style>` in markup and fenced code in Markdown, and its numbers differ slightly from tokei's (see "Where the two engines differ").

## For developers

| Part | File |
|---|---|
| Window and `--server` | `applications/file_manager_studio.ts` (the server runs in a child process, because the window blocks its own process; the child exits when its parent is gone) |
| HTTP API and security | `src/features/filemanager/fmServer.ts` |
| Operations | `fmOps.ts` (create, rename, copy, move, bulk rename), `fmTrash.ts`, `fmZip.ts`, `fmList.ts` (listing, properties, search, drives, preview), `fmOpen.ts`, `fmSettings.ts`, `fmPaths.ts` (names, protected paths, classification), `fmCore.ts` |
| Page | `resources/file_manager/index.html`, `ui/style.css` and ES modules in `ui/` (no framework, no inline script) |
| Convert and process | `fmTools.ts` (the 15 programs, detection folders, capability probing, install plans: pure), `fmToolDetect.ts` (finding programs and asking what they can do), `fmConvert.ts` (plan, preview, jobs), `fmConvCatalog.ts` with `fmConvMedia.ts`, `fmConvDocs.ts`, `fmConvBuiltinDefs.ts` (every action and its exact command), `fmConvOptions.ts` (option checks), the built-in converters `fmConvData.ts`, `fmConvMarkup.ts`, `fmConvFormats.ts`, `fmConvText.ts`, `fmConvSheet.ts`, `fmConvArchive.ts`, `fmConvZip.ts` run by `fmConvBuiltin.ts` in a worker (`fmConvWorker.ts`, `fmConvRun.ts`), `fmConvExec.ts` (temporary folders, safe publishing, size limits), `fmBatch.ts` (installs), `fmJobs.ts` (job runner), `ui/tools.js`, `ui/convert.js`, `ui/convertopts.js`, `ui/convertdata.js`, and `scripts/install_media_tools.ts` |
| Dev tab | Server, all `dev/…` operations: `fmDevOps.ts` (the API), `fmDevScan.ts` (engine choice, the built-in counter over a folder), `fmDevCount.ts` + `fmDevLangs.ts` (counting a text; the language table), `fmDevTokei.ts` (the real tokei), `fmDevWalk.ts` + `fmDevIgnore.ts` + `fmDevRead.ts` (the safe walk, `.gitignore` rules, no-follow reads), `fmDevJobs.ts` (jobs polled with `since`, cancel), `fmDevProject.ts` + `fmDevManifest.ts`, `fmDevGit.ts` (uses `fmCodeGit.ts`'s runner), `fmDevDisk.ts`, `fmDevTodo.ts`, `fmDevEnv.ts`, `fmDevStore.ts` (snapshots), `fmDevExport.ts`. Page: `ui/dev.js` (frame and tabs) with `devStats.js`, `devStatsFiles.js`, `devStatsSnap.js`, `devProject.js`, `devGit.js`, `devDisk.js`, `devDupes.js`, `devTodo.js`, `devEnv.js`, `devCore.js` (jobs, tables), `devChart.js` (SVG), `devActions.js`, `dev.css`; tests `tests/file_manager_dev.test.ts` and `tests/file_manager_dev_page.test.ts` |
| More info | Server, all `info/…` operations: `fmInfoOps.ts` (the API), `fmInfoCommon.ts` (rows, safe reading, running helper programs), `fmInfoFile.ts` (general facts, macOS and Linux extras), `fmInfoImage.ts` with `fmInfoImage2.ts`, `fmInfoPng.ts`, `fmInfoJpeg.ts`, `fmInfoSvg.ts`, `fmInfoExif.ts` + `fmInfoTables.ts`, `fmInfoMeta.ts` (ICC and XMP), `fmInfoStrip.ts` (the lossless cleaner), `fmInfoImageOps.ts` (picture report, saving, map link), `fmInfoExiftool.ts`, `fmInfoMedia.ts` + `fmInfoMediaRows.ts` + `fmInfoAudio.ts` + `fmInfoVideo.ts`, `fmInfoDoc.ts` + `fmInfoPdf.ts` + `fmInfoZipDoc.ts` + `fmInfoBinary.ts` + `fmInfoText.ts`, `fmInfoFolder.ts`, `fmInfoTasks.ts` (cancellable hash and folder jobs). Page: `ui/fileinfo.js` (the window) with `fileinfoRender.js`, `fileinfoReport.js`, `fileinfoHash.js`, `fileinfoPalette.js`, `fileinfoPrivacy.js`, `fileinfoPhoto.js` (the Details panel strip) and `fileinfo.css`; tests `tests/file_manager_info_*.test.ts` (with real byte-accurate fixtures built in `file_manager_info_fixtures.ts`) |
| Terminal | `src/features/filemanager/fmTerminal.ts` (shells on a PTY), the `/api/terminal` WebSocket in `fmServer.ts`, `ui/terminal.js`, and the vendored library in `resources/file_manager/vendor/` (see its `README.md` for the two small changes made to it) |
| Views | `ui/workspace.js` (the view switcher, Split divider, Focus, sidebar fold; it plugs into `power.js` through `setPowerHost`), `ui/home.js` + `ui/homeTiles.js` (the Home page; other modules add tiles with `registerHomeTile()`, and every tool registered with `registerPowerTab()` gets one automatically), `ui/dual.js` (the right-hand pane), `ui/chrome.js` (toolbar "More" menu, status-bar view buttons), `ui/views.css`; the saved keys (`workspace`, `startWith`, `splitSide`, `splitSize`, `sidebarCollapsed`, `focusMode`, `activeTool`, `splitTool`, `dualPath`) are validated in `fmSettings.ts` |
| Tests | `tests/file_manager_*.test.ts` (`file_manager_views.test.ts` runs the whole page, views included, in a fake browser) |

The window deliberately does **not** use `attachWindowShortcuts`: that shared script closes the window on a double-tap of Alt and handles F5 and zoom keys, which would conflict with this app's keys. The page asks the window to close with Ctrl/⌘+W through a bound `closeApp` function.
