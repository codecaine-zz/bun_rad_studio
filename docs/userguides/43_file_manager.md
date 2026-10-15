# Codecaine File Manager

An easy, safe file manager for **macOS, Windows and Linux**, built for people who do not want to learn anything first. Everything is visible and labelled, nothing is deleted for good unless you say so twice, and almost every action can be undone.

Added on 14 October 2026; the record of what was checked is [D-045](../documentation-maintenance/discrepancies.md#d-045).

## Contents

- [Start it](#start-it)
- [The window](#the-window)
- [Window size and position](#window-size-and-position)
- [Views](#views)
- [Everyday tasks](#everyday-tasks)
- [Change permissions](#change-permissions)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Convert and process files](#convert-and-process-files)
- [Encrypt and decrypt files and folders](#encrypt-and-decrypt-files-and-folders)
- [Secrets: password manager and notes](#secrets-password-manager-and-notes)
- [The code editor](#the-code-editor)
- [Developer information (Dev tab)](#developer-information-dev-tab)
- [Live server and PHP server (Serve tab)](#live-server-and-php-server-serve-tab)
- [Databases (Databases tab)](#databases-databases-tab)
- [Subdomains (Subfinder)](#subdomains-subfinder)
- [Downloads (fast, resumable)](#downloads-fast-resumable)
- [API Studio, App Bundler and Env Studio](#api-studio-app-bundler-and-env-studio)
- [Files that aren't what their name says](#files-that-arent-what-their-name-says)
- [More info and metadata](#more-info-and-metadata)
- [Tools built on Bun's own utilities](#tools-built-on-buns-own-utilities)
- [Graveyard (Rip)](#graveyard-rip)
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

It is also in the **Launcher** under *File & Directory Tools* (type `--reset-window` in its *CLI Flags / Args* box to start with the default window). Options: `--port N`, `--path DIR`, `--width N` and `--height N` (a one-off window size: nothing is restored or remembered), `--reset-window` (forget the remembered window, see [Window size and position](#window-size-and-position)), and (mainly for testing) `--home DIR` and `--data-dir DIR`.

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

## Window size and position

**The window opens filling the screen.** That means the screen's usable area: on a Mac the menu bar and the Dock stay in view (the window is "zoomed", the same as clicking the green button with the Option key held), on Windows it is maximised, on Linux it is maximised where the system lets it (see below).

**When you change the window, the app remembers it.** Resize it, move it, un-maximise it, or put it in full screen, and the next time the File Manager opens exactly like that. Merely opening it never saves anything, so a window you didn't touch keeps opening full. The first time you change it, a message says *"Your window size is remembered. Settings → Window → Reset to default to go back to full screen."*

If the window was saved on a monitor that is no longer connected, or is bigger than the screen it now has, it comes back fully on screen (centred, or filling the screen if that is how you left it).

**Settings → Window** has three choices:

| Choice | What happens at start-up |
|---|---|
| **Fill the screen (default)** | The window fills the screen's usable area |
| **Remember my window** | The window opens with the size and position you last left it at. This is chosen for you the moment you change the window. Choosing it yourself, when nothing is remembered yet, remembers the window as it is now |
| **True full screen** | The computer's full-screen mode. On a Mac the window gets its own desktop; leave it with **Ctrl+⌘+F** or by choosing another mode here. **Esc never leaves full screen**, so it keeps its own jobs inside the tools (closing a dialog, cancelling a query). The database studios inside the File Manager don't use the browser's full screen either |

Picking a choice applies it to the open window straight away. Under the choices Settings shows what is saved in plain words (for example *Saved: 1280 × 820 at 120, 80*), and two buttons:

- **Use this window as my preference now** saves how the window looks right now and switches to *Remember my window*.
- **Reset window to default** forgets the saved window, switches back to *Fill the screen* and makes the open window fill the screen right away. The same **Reset window** button is in the Help dialog, and `bun run app:files --reset-window` does it before opening.

Where it is stored: `~/.bun_rad_studio/file_manager_window.json` (readable only by you), a separate small file from the settings file. Delete it to get the default back. Starting the File Manager in a browser (`--server`) has no window to manage: none of this applies and the Window part of Settings is not shown.

How it differs by system:

- **macOS** (checked on a real window): fill = the window's *zoom*; true full screen = the system's full-screen mode; the window's real size and position are read from the system, so moving it counts as a change too.
- **Windows** (written, not run on Windows): fill = maximised; true full screen = a borderless window over the whole monitor (leave it with *Settings → Window → Fill the screen* or *Reset*). The window's outer size and position are read and set with the system's window functions.
- **Linux**: GTK can't be called safely from Bun, so the window's size is set and read through the page only, a window can't be moved by the app, and *fill* and *true full screen* use `wmctrl` when it is installed and the session is X11. Without it, *fill* is a window the size of the screen's usable area and *true full screen* does the same.

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

The **left** and **right** sides are the same kind of list. Each has its **own folder, address steps, selection and column headings**; the left one also has the sidebar, the address bar with Back and Forward, and the search box above it. The side you last clicked or tabbed into is marked with a coloured line along its top, and the keys, the toolbar buttons and the right-click menus act on that side.

- **Tab** moves between the two lists (Shift+Tab moves the focus the ordinary way).
- **F5** copies and **F6** moves the selected items from the active side into the other side's folder. The right-click menu has the same two as **Copy to the other pane** and **Move to the other pane**, and the buttons under the right pane do the same in either direction (**Copy →**, **Move →**, **← Copy**, **← Move**). Name clashes ask the same question as everywhere else, and Undo works.
- **Drag** items from one side onto the other (or onto a folder in it); hold Ctrl/⌥ to copy instead of move.
- **Same options on both sides.** Both lists show the same columns (Name, Date modified, Type, Size) with the same dates, icons and warning marks for files that are not what their name says, and click-to-sort headings above each one. View (Details, List, Icons), sort order, folders first and hidden files are **one setting that both sides follow**: change it on either side (the View button, Ctrl/⌘+1/2/3, a column heading) and both lists change. Each list drops the **Type** column when it is narrower than about 900 pixels and the **Date** column when it is narrower than about 440 pixels, by the same rule, so in a narrow window the two sides can show different columns only if they are different widths.
- **Same right-click menu.** Right-click a file, a folder, several items or empty space on the right and you get exactly the menu the left gives, working on the right pane's selection and folder (Open, Open with, Edit in Code editor, SQLite Studio, Convert, Encrypt, Cut / Copy / Paste, Rename, Zip, Move to Recycle Bin, Bury (Rip), Permissions, More info, Properties, New folder / New file, live server, and so on).
- **Same keys.** On the active side: arrow keys, Home/End, Page Up/Down, Shift and Ctrl/⌘ select, Ctrl/⌘+A, typing a few letters to jump to a name, Enter to open, Backspace or Alt+↑ to go up, **F2** to rename in place, Ctrl/⌘+C, X, V and D, Delete (to the Recycle Bin or the Rip graveyard, as chosen in Settings), Shift+Delete, Alt+Enter for Properties, and Ctrl/⌘+Z to undo. The toolbar buttons (New folder, New file, Cut, Copy, Paste, Rename, Delete, Lock, Convert, Up) work on the active side too. The status line under the right pane says the same things as the one under the left.
- Both sides reload when something changes in either folder, and the right folder is remembered.

What is **only on the left**, because it needs a place the right pane does not have: the **search box** (search shows its results in the left list), **Back and Forward** history, the **Recycle Bin view**, the **Details panel** (there is no room for it in this view; right-click → **More info…** works on either side) and the **sidebar** and address bar. The right pane always shows a folder, so the menu items for search results and the Recycle Bin never appear there.

## Everyday tasks

- **Open** a folder or file: double-click, or select it and press Enter. Files open in the program your computer normally uses for them.
- **Quick Look (Space)**: select a file and press **Space** to look at it without opening another program, like the Finder. Pictures (with their size in pixels), **sound** and **video** (they start playing; **P** plays or pauses), text and source files, and **CSV or TSV files as a table** show right in the window. On a **Mac**, documents the page can't draw itself (PDF, Word, Excel, PowerPoint, Pages, Numbers, Keynote, RTF, EPUB, HEIC and camera RAW pictures, and videos such as MKV or AVI) show as a picture of the first page made by the system's own Quick Look (`qlmanage`), which can take a second or two; on Windows and Linux those files get the plain information card (type, size, date) and **Enter** opens them in their own program. Folders show how many files and folders they hold. **← →** (or ↑ ↓) show the next or previous item of the list and move the selection with them, **Home** and **End** jump to the first and last, **Enter** opens the item in its own program, **Space** or **Esc** (or a click outside) closes it and puts you back where you were. It is also in the right-click menu. Sound and video are streamed in pieces from the local server (so seeking works and a big file is not loaded whole); whether a file plays depends on the formats the window's browser engine knows (MP3, WAV, AAC/M4A, FLAC, OGG and Opus; MP4, MOV and WebM, where the codec is supported), and if it can't, the card says so. Pictures made for the preview live in a private temporary folder that is deleted when the File Manager stops. Not previewed: PDF pages beyond the first, spreadsheets' other sheets, archives' contents, and anything in the Recycle Bin (restore it first).
- **Copy a picture or a text file to the clipboard**: right-click a picture → **Copy image to clipboard** to paste the picture itself into a document, chat or image editor; right-click a text or source file → **Copy text to clipboard** to paste what is written in it. (The ordinary **Copy** copies the *file*, for pasting into a folder.) The same two buttons appear in the Quick Look window (**Copy picture** / **Copy text**). It works for one item at a time. The File Manager reads the file itself and writes the system clipboard: on macOS the picture is converted to PNG if needed (`sips`) and placed with `osascript`; on Windows PowerShell's `System.Windows.Forms` is used (PNG, JPEG, GIF, BMP, ICO and TIFF); on Linux `wl-copy` or `xclip` is needed. If the system tools can't handle a picture's format, the browser's own clipboard is tried (it knows WebP, AVIF and SVG); if that also fails the message says why. Limits: a picture up to 50 MB; text only if the file is valid UTF-8 text without binary bytes and no bigger than 5 MB (for more, use the code editor and copy the part you need). Other programs can read the clipboard, so paste soon if the text is private.
- **Select several**: Ctrl/⌘+click to add or remove one, Shift+click for a range, Ctrl/⌘+A for all.
- **Copy or move**: Copy (or Cut), go to the other folder, Paste. Or drag items onto a folder in the list or the sidebar; hold Ctrl (Option on a Mac) while dropping to copy instead of move.
- **If a name is already taken**, a window asks what to do: **Keep both** (the default; the new one becomes `name (2)`), **Replace** (the old one goes to the Recycle Bin first) or **Skip**. The choice is applied again when each item actually runs, so a name that turns up after you asked is never overwritten.
- **Copy and move run in the tasks panel**, so you can keep browsing. Each item is its own step. The panel shows items and, when the sizes could be measured, bytes (`3 of 12 items · 1.2 GB of 4.8 GB`); when they could not (an unreadable folder, or more than 200,000 entries) it says *the total size can't be measured* and shows an empty bar instead of a false percentage. **Cancel** stops the item in progress and removes its partly made copy; items already finished stay finished and the rest are reported as *not started*. A move on the same disk is a single rename and cannot be cut in half; a move to another disk copies first and removes the original only after the copy succeeded (if the original can't be removed, both stay and the message says so). A failed item stays in the panel until you dismiss it, with its path and the reason, and **Retry unfinished** runs only the items that failed or were cancelled. Files that change while being copied, pipes and sockets, and folders copied into themselves fail with a sentence rather than producing a damaged copy. A *Replace* that then fails puts the old item back from the Recycle Bin. Copies and moves can be undone with Ctrl/⌘+Z as before, for the items that finished.
- **Activity** (toolbar, 🕘): a history of copies, moves and renames that is kept between runs in `file_operations.json` in the app's data folder (paths, counts and messages only, never file contents; newest 200 operations; owner-only permissions). An operation still running when the app closed is shown as *interrupted*. Clearing the list does not touch any file. A finished operation can only be retried while the app stays open.
- **Rename**: F2. Choose several items and press F2 for **bulk rename**: pick a pattern (for example "Album {n}") and a **live preview** shows every new name before anything changes. If any one rename fails, all of them are put back.
- **Delete**: Delete moves items to the **Recycle Bin**. Open the Recycle Bin from the sidebar to **Restore** an item (to where it came from), **Delete forever**, or **Empty bin**. *Delete permanently* (Shift+Delete) and emptying the bin always ask first. If you prefer, **Settings → When I press Delete, use → The Rip graveyard** makes Delete bury items instead, and right-click → **Bury (Rip)** (Alt+Delete) always does; see [Graveyard (Rip)](#graveyard-rip).
- **Undo**: Ctrl/⌘+Z undoes the last new item, rename, copy, move, delete, restore, zip or unzip, one step at a time.
- **Compress and extract**: right-click → *Compress to zip*, or on a `.zip` file → *Extract here* (it makes a new folder, so nothing is overwritten).
- **Terminal**: click **Terminal** in the toolbar (or press Ctrl+`, Control on every system) to open a real terminal at the bottom, **already in the folder you are looking at**. **Go to this folder** moves the shell to the folder you have selected in the list (or, with nothing selected, wherever you are browsing); **Restart** starts a fresh shell there. **Follow terminal** (on by default, remembered) makes the file list move to the same folder whenever you change folder in the terminal with `cd`; untick it to keep the list where it is. (On macOS and Linux the server asks the system where the shell is, a moment after you press Enter and every few seconds; a symlinked folder shows up as its real path.) The ✕ only hides the panel, so a command that is running keeps running; type `exit` (or press Enter after it ends) to finish it. Drag the thin bar above it, or use its up and down arrow keys, to change the height. See [the terminal's safety notes](#the-terminal).
- **Favorites** (places you can jump to): click the **★** at the right of the address bar to add the folder you are in (click again to remove it), or right-click a folder → *Add to Favorites*. The sidebar's **Favorites** section lists them (**＋** adds a typed path such as `~/Projects`, **⚙** opens *Manage favorites*); the **⭐ Favorites** toolbar button (Ctrl/⌘+Shift+B) shows the same list as a menu. *Manage favorites* lets you rename (a name is only a label), reorder, remove and add; a folder that has since gone is marked as missing. Up to 100, saved in your settings.
- **Properties**: Alt+Enter or the Properties button: size (folders are counted, with a limit), dates, location.
- **More info**: Alt+Shift+Enter, right-click → *More info…*, or the *More info…* button in Properties and in the Details panel: every detail about a file, picture, folder or selection, including the hidden ones (see [More info and metadata](#more-info-and-metadata)).
- **Themes**: Settings → *Choose a theme…* (or the Home view's **Themes** tile) opens a gallery of 135 colour themes in five groups: Futuristic, Editors and classics, Linux, Windows and macOS. Search by name, show only light or only dark ones, and click a theme to try it: it applies at once and is remembered. *Standard* goes back to the plain Light/Dark/automatic colours. The themes are the same ones the SimpleGUI apps use, turned into this window's colours; for every theme the text, buttons, warnings and messages are adjusted until they reach the same readability checks as the built-in colours (`tests/file_manager_themes.test.ts` runs them all). **Make your own:** in the gallery press *Create or edit a theme…*. The theme editor starts from any theme (or a plain light or dark one), lets you change the window background, panels, text, accent, lines and the red, amber, green and blue status colours with a colour picker or a hex code, and shows the result in the whole window while you edit. Text and buttons are adjusted a little when a colour choice would be hard to read, and the editor says so. *Save theme* keeps it in a **My themes** group at the top of the gallery (up to 50); when you edit one of your own, *Save* replaces it and *Save as a copy* keeps both. *Export…* gives you text you can keep or send to someone, and *Import…* turns that text back into a theme you can adjust before saving. Your themes are kept in `file_manager_themes.json` in the app's data folder. Glow, glass and animation effects of the Futuristic themes are not applied here, only their colours. The built-in terminal stays dark.
- **Settings**: colours (match the computer, light or dark), text size, hidden files, folders first, Details panel, and the **code editor** that *Open in your editor* starts.
- **Help** (F1) lists everything above, and a short welcome appears the first time. Its **About and GitHub** button (also a tile on the Home view) opens the project's GitHub page, the issue tracker, releases, the author's profile, the author's website and YouTube channel, and the **Markdown tutorials** (https://codefreelance.net/apps/markdown_tutorials/) in your web browser. The Home view also has a **Markdown tutorials** tile. **Donate with a QR code…** (in About, and as the **Support the project** tile on Home) shows the same PayPal QR code as the project's GitHub page, with buttons to open or copy the link; donating is optional.

## Change permissions

Right-click → **Permissions…** (or Properties → the **Permissions** section) shows who may do what with a file or folder, and lets you change it. Right-click on a file also offers **Make executable** and **Remove execute** as one-click shortcuts. The Details panel shows one line, for example `Permissions: rw-r--r-- (644)`.

**What the boxes mean** (macOS and Linux). Three rows (**Owner** = you, **Group** = the people in the file's group, **Others** = everyone else) and three columns:

| Box | For a file | For a folder |
|---|---|---|
| **Read** | open and read it | see what is inside |
| **Write** | change it | add, rename and delete things inside |
| **Run** (a folder: **Run / open folder**) | run it as a program or script | go into it |

The same permissions are also shown as **digits** and **letters**, and the three stay in step when you change any of them. `644` is "owner reads and writes, everyone else only reads" (4 = read, 2 = write, 1 = run, added up for owner, group, others), the same as `rw-r--r--`. You can type digits (three, or four with a special setting such as `4755`) instead of ticking boxes. When you select several items whose permissions differ, a box that isn't the same for all shows a **dash (mixed)**; clicking it cycles *on → off → leave as it is*, and Apply changes only the boxes you changed. The owner and group are shown as names; **changing the owner needs administrator rights and isn't done here**.

**Quick choices**

| Choice | Files | Folders |
|---|---|---|
| **Private** | 600 | 700 |
| **Normal** | 644 | 755 |
| **Shared with my group** | 664 | 775 |
| **Read-only** | 444 | 555 |
| **Make executable (+x)** | adds Run for everyone | left alone |
| **Remove execute (−x)** | takes Run away | left alone (a folder needs it to be opened) |
| **Everyone can read** | adds Read for everyone; adds Run only if it already runs | adds Read and Run |

**Advanced** (closed until you open it): *setuid* (a program runs with its owner's rights), *setgid* (a program runs with its group's rights; on a folder, new items join the folder's group) and *sticky* (on a shared folder, people can delete only their own files). Each has a plain-words warning.

**Everything inside.** For a folder, tick **Apply to everything inside** and choose **Files and folders**, **Only files** or **Only folders** (the folder itself changes only if folders are included). **Add "Run" only to folders and files that already run** is on by default, so that making a tree readable doesn't turn plain documents into programs (this is chmod's capital `X`). Links are never followed or changed, and a run stays on the disk it started on.

**Preview, Apply, Undo.** Before anything changes, a line tells you what would happen: *"42 items will change, 3 are already correct, 2 can't be changed"*, with the reasons and a list of examples. **Apply** then changes them. Every change is **one Undo step** (Ctrl/⌘+Z, the toolbar, or **Undo this change** in the window). Undo puts back the exact earlier permissions and leaves alone any item that was changed again, replaced or deleted since.

**What needs your confirmation** (and the server asks for it itself, so the page can't skip it): giving **everyone write access** (777 and the like); removing **your own read or write** access (or open access to a folder), which could lock you out; **setuid/setgid on a file**; and changing **more than 50 items** inside a folder. **What is refused outright:** system folders, the Recycle Bin's folder and anything in them, and "everything inside" for your home folder itself (choose the folders inside it). Items you don't own are reported, not attempted. A big run can be stopped with **Stop**; it keeps what it already did, and that can be undone. It looks at most 100,000 items and works for at most 60 seconds.

**Differences between systems**

- **macOS:** the same boxes, plus **Locked** (can't be changed or deleted, the system's "user immutable" flag) and **Hidden** (not shown in Finder). A locked item has to be unlocked before its permissions can change; ticking **Locked** off together with a permission change does both.
- **Windows:** files don't have these permissions. The section offers **Read-only** and **Hidden** (changed with the system's `attrib` program, started from a list of arguments, never a shell). Windows access rules (ACLs, "who may open this") aren't edited here.
- **Linux:** the same boxes; there is no Locked or Hidden (a file is hidden when its name starts with a dot, so rename it). The immutable attribute isn't offered. If an item has extra access rules (an ACL) a note says so; they aren't shown or changed.

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
| Bury in the Rip graveyard | Alt+Delete (⌥⌫ on a Mac) |
| Undo | Ctrl+Z |
| Select all | Ctrl+A |
| New folder, New file | Ctrl+Shift+N, Ctrl+Alt+N (right-click empty space also offers **New SQLite database**) |
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
| **Documents** | Markdown, HTML, Word (DOCX), ODT, RTF, EPUB, LaTeX, reStructuredText, Org, AsciiDoc, MediaWiki, Textile, Jupyter, man page, FB2, plain text, **PowerPoint (PPTX from Markdown)**, PDF; standalone HTML with embedded resources; table of contents option | pandoc (primary). PDF needs a PDF engine (Typst or LaTeX). Markdown → HTML without pandoc is **built in**, using Bun's Markdown renderer |
| | Old Office files (DOC, DOT, WPS, WPD, PAGES, XLS, PPT, KEY…) and any Office → **PDF**, DOCX, ODT, text | LibreOffice (only for what pandoc can't read, and for faithful Office → PDF) |
| | **Read the text in a picture or a scanned PDF (OCR)** → text file, or a **searchable PDF**; language chosen from the installed packs | Tesseract (+ Ghostscript for PDFs) |
| | Markdown → web page, web page → text | pandoc, or **built in** when pandoc isn't installed |
| **Data & text** (all **built in**) | **JSON ⇄ YAML ⇄ TOML ⇄ CSV ⇄ TSV ⇄ XML ⇄ JSON Lines ⇄ INI ⇄ .env ⇄ .properties ⇄ Markdown table ⇄ HTML table ⇄ SQL INSERT ⇄ plist**; JSON5 and JSONC are read; make JSON easy to read, as small as possible, or with sorted keys. Nested data becomes dotted columns in tables (and can be rebuilt); big whole numbers, `007`, `1.50` and duplicate keys are kept or reported, never silently changed. Also **TypeScript / JSX → JavaScript** (`.ts .tsx .jsx .mts .cts`, with the target, minify and JSX-style options; see below) | nothing |
| | **XLSX / ODS → CSV, JSON, YAML, Markdown, HTML, SQL…** (first sheet, or every sheet in one file or as separate CSV files), **CSV / JSON / any data → XLSX** | nothing |
| | **Text encoding** (UTF-8, UTF-8 with BOM, UTF-16, Latin-1, Windows-1250/1251/1252, KOI8-R, Mac Roman, Shift_JIS, EUC-JP, GBK, Big5, EUC-KR; found automatically, undecodable bytes reported), **line endings** (LF, CRLF, CR), tabs ⇄ spaces, trailing spaces, BOM, plain text → web page | nothing |
| **Archives** | **Zip**, **tar.gz** and **tar.zst** (files and folders), **unpack** zip, tar.gz, tar, tar.zst, tar.bz2, tar.xz, 7z, RAR, ISO, CAB, DMG…, **zip ⇄ tar.gz** without unpacking to disk, gzip / gunzip, **Zstandard (.zst)**, Brotli, open .xz / .bz2, **list what is inside**, pack a **7z**; a **compression level** for gzip (1–9) and Zstandard (1–19) | zip, tar.gz, tar.zst, gzip, zstd, Brotli: **built in**. Others: the system's **bsdtar** (macOS and Windows 10/11 have it), then **7-Zip**, then **The Unarchiver** |
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

Programs are found on your PATH **and** in the places they install to: Homebrew's `opt/<name>/bin` (not on the PATH when the window is opened from Finder, the Dock or the launcher), `/Applications/LibreOffice.app/Contents/MacOS` and `/Applications/calibre.app/Contents/MacOS`, WinGet's links and nested package folders (including portable FFmpeg and Poppler), WindowsApps aliases such as winget, Scoop's shims, Chocolatey's `bin`, `Program Files\LibreOffice\program`, `Calibre2`, `7-Zip`, `Tesseract-OCR`, `gs\gs*\bin`, and Linux's `/usr/lib/libreoffice/program` and `/opt/calibre`. **Check again** also finds newly installed portable WinGet packages without restarting the app. **Download** buttons open the official helper websites in your default browser.

**Safety.** Programs are started with a list of arguments, never through a shell, so a file called `$(rm -rf ~).png` is just a name. Every option is checked on the server (choices must be listed, numbers are limited, times and page ranges must match a strict pattern, text is length-limited), names that programs would read as instructions (`[`, `*`, `%`, `@`, a leading `-`) never reach them (they get safe temporary names, absolute paths, a `file:` prefix, or come after `--`), LibreOffice runs with its own private profile so a LibreOffice you have open is never disturbed, and **archives are unpacked defensively**: names that leave the folder (`../`, absolute paths, drive letters) are skipped, links are never created, the item count and total size are limited (a "zip bomb" is stopped while it unpacks), zip checksums are verified, and a failed unpack removes its folder. At most 500 items per run.

### One-click setup of the helper programs

In **Convert & process → Helper programs…** the **One-click setup** box installs everything that is missing in one go.

- **Install everything missing** asks once (it lists the programs, the big downloads and whether a password is needed) and then installs them all.
- **Choose what to install…** shows the list with every program ticked. Untick what you don't want, or use *Select all*, *Only the main ones* and *Select none*. Programs the chosen installer has no package for are greyed out.
- **Which installer:** on a Mac, Homebrew. On Linux, apt, dnf or pacman (whichever your computer has) or Homebrew; pick one in the window. On Windows, winget or Scoop.
- **No Homebrew yet?** On a Mac, or on Linux when you choose Homebrew, the setup installs Homebrew from its official address (https://github.com/Homebrew/install), adds it to your shell settings (`~/.zprofile`, `~/.bash_profile` or `~/.profile`, only if it is not there already) and then installs your programs.
- **Passwords:** apt, dnf, pacman and a first-time Homebrew need your computer's password, so they run in the built-in **Terminal** at the bottom: you watch every step and type the password there (nothing shows as you type). The commands live in a short script you can read, `install_helper_programs.sh` in the app's data folder. When Homebrew is already installed (or on Windows) the installs run as background tasks with no password and show in the task list.
- When the Terminal says **All done**, open Helper programs again and press **Check again**.


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

## Secrets: password manager and notes

**Find & more → Secrets** (🗝️, in the Security group; also a tile on the Home page) is a private place for **passwords, secure notes, cards, identities, API keys, Wi-Fi details, SSH keys and small files**. Everything you put in it is locked inside **one encrypted file** on this computer, `file_manager_secrets.radsec`. Nothing is sent anywhere, and nothing sensitive is kept in plain text, in settings, in logs, in the clipboard history or in the page. It is a personal tool: it has **not been independently audited** and it is **not a replacement for a mature, audited password manager** if the stakes are high ([why, in detail](../security.md#secrets-vault-radsec)).

### Start

1. Open **Secrets**. The first time, a short wizard (**Create your secret space**) asks you to:
   - **Choose a master password.** At least 12 characters of real variety, or a **passphrase of 5 or more random words**; *Suggest a passphrase* makes a good one. A meter and a note say plainly whether it is accepted. Use it for nothing else.
   - **Optionally add a key file.** A random file you keep somewhere safe; it is needed *as well as* the password. If you lose it, only the recovery key opens the vault.
   - **Make a recovery key (strongly recommended).** A code shown **once**, as 8 groups of 4 characters. Write it on paper. It is the only way back in if you forget the password. The window has **Copy to clipboard** (the clipboard is cleared again after the usual time, 30 seconds unless you changed it) and **Save to a file…** (a new text file only you can read, never overwriting an existing one), so you never have to type the key by hand. Put it somewhere offline, not in a note app that syncs.
   - **Pick how slow guessing should be:** Standard (256 MB), Strong (512 MB) or Maximum (1 GB). *Measure on this computer* shows how long each takes to open here.
2. **There is no password reset.** If you forget the master password and have no recovery key, nobody can open the vault, not even the author. That is the price of real encryption.
3. Afterwards the tab may offer **Unlock with this computer** (see below). It is off unless you turn it on.

### Everyday use

- **Add things:** **New item ▾** → Login, Secure note, Card, Identity, API key, Wi-Fi, SSH key or Custom. A login has a user name, password, address and a one-time-code secret (2FA); every kind can have notes (Markdown), tags, a folder, your own extra fields (text, hidden, address, date, one-time code) and attachments (up to 1 MB each, 10 MB in all).
- **Generate a password:** the **Generate** button next to a password opens a small panel: random characters (length, a–z, A–Z, 0–9, symbols, no look-alikes), a **passphrase** of random words, or a pronounceable password, with a strength readout.
- **Find things:** the list on the left filters as you type (titles, user names, addresses, tags and the text of notes; never passwords). Chips choose **All, Logins, Notes, Cards, Favourites, Weak or reused, Trash** or a tag. Press **/** to jump to the search box, the arrow keys to move, **Enter** to open.
- **See a secret only when you ask.** Passwords, notes, one-time-code secrets and card numbers show as bullets. **Reveal** shows one for 15 seconds (notes for a minute) and hides it again, and it also hides when you lock, switch tab or window, or choose another item.
- **Copy a password** with **Copy** (or **Ctrl/⌘+Shift+C** for the selected login). The program, not the page, puts it on the clipboard and **empties the clipboard after 30 seconds** (10 to 120, or never), but only if it still holds that password.
- **One-time codes:** *Show code* displays the current 6-digit code with a ring that counts down to the next one, and *Copy* copies it. Paste the secret (the letters and digits next to a QR code) or the whole `otpauth://` address.
- **Open a website:** **Open** next to an address starts your browser, for `http` and `https` addresses only.
- **Duplicate, favourite, Move to Trash.** Trash keeps deleted items so you can **Restore** them; *Empty the Trash* deletes for good after a confirmation. The last 10 old passwords of a login are kept in its history.
- **Lock now** is always on the toolbar (**Ctrl/⌘+L** inside the tab). The status bar shows **🔒 Locked** or **🔓 Unlocked · locks in 4:32**.

### Locking and the clipboard

The vault **locks itself after 5 minutes without use** (change it in **Settings**: 1 minute to 1 hour, or *Never*, with a warning), optionally **when you switch to another window**, and when the File Manager closes. Locking forgets everything: the keys are overwritten and nothing is left on the screen.

### Keeping it healthy

- **Health report** lists weak, reused and old passwords, logins at sites that offer two-step sign-in but have no code, several logins for the same address, and passwords written in notes, with a plain hint for each. It is worked out on this computer.
- **Known breaches (optional, off by default).** The report has a button that asks haveibeenpwned.com whether your passwords appear in leaks. It sends **only the first 5 characters** of a one-way fingerprint of each password and explains this before you confirm.
- **Backups.** The program keeps three encrypted backups next to the vault. **More ▾ → Export an encrypted backup…** saves a standalone `.radsec` copy (right-click a `.radsec` file → **Open in Secrets** to restore one). A restore opens the backup first to prove it is good, and keeps the vault it replaces.
- **Change master password**, **Re-key** (choose a different strength), **Recovery key** (make a new one, check one you wrote down, or remove it) and **Vault info** are in **More ▾**. Changing the password or the recovery key **deletes the old backups**, because they would still open with the old secret.
- **Activity log** shows when the vault was unlocked, locked, backed up or exported, and how many wrong attempts were made. It has no passwords or item names.
- After a few wrong passwords the program makes you **wait** (1 second, doubling up to 15 minutes), and says so on the unlock screen.

### Import and export

- **Import…** reads exports from **Chrome, Edge, Firefox, Safari, 1Password, LastPass, KeePass (CSV) and Bitwarden (unencrypted JSON)**. You see a **preview** (how many items, how many are duplicates, a sample) before anything is added. Delete the export file afterwards: it isn't encrypted.
- **More ▾ → Export as plain text (CSV)…** writes everything **unencrypted**. It needs the master password again, a tick and a loud warning, and the file can be read only by you. Use it only to move to another program, then delete it. Open it in a plain text editor, not a spreadsheet.

### Unlock with this computer (optional)

**More ▾ → Unlock with this computer…** keeps a random key in your computer's own secure storage (macOS Keychain, Windows Credential Manager, Linux Secret Service) so you can open the vault without typing the password. The master password and recovery key still work. **Don't turn it on** on a shared computer, or if you want the vault to stay shut when your computer is unlocked and unattended: anyone who can use your logged-in account (and malware running as you) can open it. The master password is asked for again **at least every 14 days** (Settings: 1 to 90). If the secure storage isn't available (on Linux it needs a running Secret Service such as GNOME Keyring), the option is greyed out with the reason; if the key goes missing or changes, the unlock screen says so and you use the master password. *Turn off* removes the key from the computer and the extra wrapping from the vault.

### Limits

At most 5,000 items; titles up to 200 characters, notes 100,000; attachments 1 MB each (10 per item, 10 MB in all); the whole vault 64 MB. One vault per File Manager data folder. Format: [RADSEC v1](../reference/secrets-format.md).

### What it can't protect against

Malware or a keylogger on your computer, someone watching your screen, a weak master password, a lost recovery key together with a forgotten password, and someone who can replace the vault file with an older copy of it. Revealed text and the typed password cannot be wiped from memory completely (only the keys are zeroed). See [Security](../security.md#secrets-vault-radsec) for the full, honest list.

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

**Tools.** Which developer programs are installed (git, bun, node, npm, pnpm, yarn, deno, python3, pip, go, rustc, cargo, v, java, javac, dotnet, ruby, php, swift, clang, gcc, make, cmake, docker, tokei, ripgrep, fd, jq, gh) and their versions, from a quick `--version` on each (each answer is waited for 2.5 seconds, and the whole check for 8; a program that is too slow is listed as *found, but it didn't answer in time*, and **Check again** tries again). Missing ones show an install command to read; nothing is installed from here. The answer is remembered for five minutes; **Check again** asks again.

**Safety and limits.** Every `dev/…` operation needs the session token and the loopback checks like all the others. Scans never follow symbolic links (files are opened without following links, and links are counted as skipped), read file contents only inside the chosen folder (the one exception: the `.gitignore` files of the repository around it, read only to apply their patterns and never shown), and stop at 200,000 files, 100,000 folders, 8 MB per file (1 GB in all) or 60 seconds; the page says when a limit cut a scan short. Scans run in the background with a progress line and a **Cancel** button (at most three at once). Exports and snapshots are the only writes, and an export can only be saved inside the scanned folder.

## Live server and PHP server (Serve tab)

**Find & more → Serve** turns a small web server on and off for a folder, so you can look at your web pages in a browser the way a visitor would, without installing anything.

- **Live server** (for HTML, CSS, JavaScript and any other files). It shows the folder at an address like `http://127.0.0.1:5500/` and **reloads the page by itself when you save a file** (a change to only a `.css` file swaps the styles without reloading, so you don't lose your place). It is built into the File Manager; there is nothing to install.
- **PHP server** (PHP's own built-in server, `php -S`). It needs **PHP installed on your computer**; the File Manager only looks for it and never installs it. If `php` is missing the tab says so and shows what to type for your system (`brew install php`, `sudo apt install php-cli`, `winget install PHP.PHP` or `scoop install php`). A folder with `index.php`, `composer.json`, `artisan`, `wp-config.php` or any `.php` file is recognised as PHP; a Laravel or Symfony project suggests its `public` folder as the document root, and WordPress says it needs a database that this server doesn't provide.

**Ways to start one.**

- **Right-click a folder** → *Start live server here* / *Stop live server*, and, when the folder looks like a PHP project, *Start PHP server here* / *Stop PHP server*.
- **Right-click empty space** in the file list to start or stop the same servers for the folder you are in.
- **Right-click an `.html` or `.htm` file** → *Open with live server*: serves that file's folder (or reuses the server already running for it) and opens that page in your browser.
- **The Serve tab** has two switches for the folder you are looking at, a list of every running server, and a *Start a new server* form: folder, kind (automatic: PHP if the folder has PHP files, otherwise live), port (Auto, or 1024–65535), reload on change, open the browser, show hidden files, allow other websites to read the files (CORS), and, under *PHP options*, a document folder inside the project (for example `public`), a router script and a particular PHP program.
- The Home tile **Live server** opens the tab for the folder you are in.

Each row of the list shows the kind (and PHP version), the folder, the address, the port, when it started, how many requests it answered and its state, with an on/off switch (it says **On** or **Off** in words, not only by colour), *Open in browser*, *Copy URL*, *Restart*, *Stop* and a **log** (the requests the live server answered, or everything PHP printed, newest at the bottom; at most 500 lines or 256 KB are kept). While any server runs, the status bar shows a pill such as **● Live :5500**; press it to come back to the tab. The page asks for news every 3 seconds, and only while the tab is open or a server is running.

**Safety.**

- **This computer only, by default.** Servers listen on `127.0.0.1` and refuse any request whose `Host` is not `127.0.0.1`, `localhost` or `[::1]` with its own port (so a web page on another site can't reach them through DNS tricks).
- **The network option is off, and never remembered.** *Let other devices on my network see it (LAN)* starts the server for everyone on your Wi-Fi or network, so you are asked to confirm in plain words first; the box is cleared after every start. PHP's built-in server is for development only and is not safe on a network.
- **Read only, and only inside the folder.** The live server answers `GET` and `HEAD` only and accepts no request body. Every address is checked: `..`, encoded slashes and backslashes, null characters, over-long addresses and Windows device names (`CON`, `NUL`…) are refused, and each file is resolved with its real path, so a symbolic link that points outside the folder is never followed. Hidden files (names starting with a dot, such as `.env`) are not shown unless you tick *Show hidden files*, and **`.git` is never shown**. The File Manager's own files and settings are never served, and your home folder, the top of a drive and system folders can't be chosen.
- **The File Manager itself is out of reach.** The served ports have no connection to its page, token or API.
- **The PHP server is a development server and shows errors.** It starts PHP with `display_errors`, `error_reporting=E_ALL` and `log_errors` switched on, whatever your `php.ini` says (Linux packages ship with errors hidden), so a mistake in a script appears in the page and in the log. Don't expose it to other people.
- **PHP is started with an argument list, never through a shell**, in the document folder, with only `PATH`, `HOME`, `LANG` and `TMPDIR` (none of the File Manager's own variables), and its input closed. Folder names that start with `-` or hold spaces, quotes or `$(...)` are just names. Stopping asks PHP to end (SIGTERM) and, after 2 seconds, forces it (SIGKILL), with anything it started; closing the File Manager ends every server, and a last-resort handler ends any PHP still running if the program exits.
- Servers never come back after the File Manager is closed, and nothing about them is saved except your choices of kind, reload and open-browser (never the network option).

**Limits.** At most 8 servers at once, one per folder and kind (starting the same folder again just shows the one that is running); the live server serves at most 64 requests at the same moment and 50 open pages; live reload watches up to 5,000 folders (more than that: the server still works, the row says live reload is off), ignoring `node_modules`, `.git` and editor scratch files, and says so if the folder is deleted. HTML pages bigger than 8 MB are served without the reload script. Single-range `Range` requests are supported (video and audio can be skipped through); several ranges at once are answered with the whole file. PHP's server runs one request at a time, as PHP's does. Pages that use WebSockets or need HTTPS can't be tried here.

## Databases (Databases tab)

**Find & more → Databases** (🗄️, also a tile on Home) keeps your database **connections** in one place and opens the real **SQLite Studio, MySQL Studio, PostgreSQL Studio and Redis Studio** inside the window, each for the connection you choose. A connection you save here is used **instead of** environment variables.

**Connections.** *Add connection* (SQLite, MySQL / MariaDB, PostgreSQL or Redis), *Paste address…* (a `mysql://`, `mariadb://`, `postgres://`, `postgresql://`, `redis://`, `rediss://` or `sqlite:/full/path` address fills the form in for you to check), *Import from environment…* and *Import .env file…*. The list is grouped by folder (favourites first) and each row says its environment in words and an icon: Development, Test, Staging or **⚠ Production**. For each connection: **Open in … Studio**, **Test connection** (an explicit click only, at most 10 seconds, plain-words answers such as "The server refused the user name or password" or "Nothing answered at host:port"; it only reads, and for a production connection it says it was only a test), **Edit**, **Duplicate** (you choose whether the copy also gets the saved password), **Favourite** and **Delete** (asks first; the saved password is deleted with it).

**New sample database…** (button in the Databases tab) creates a new SQLite file filled with one of the production-style synthetic [sample databases](../databases/sample-datasets.md) (Medicare Part D formulary builder, hospital, claims, banking, e-commerce and more). Choose the sample, a size (Small, Medium or Large), the folder and a file name. An existing file is never overwritten and no folder is created for you; the file is saved as a connection and can then be opened in a studio window, your browser or the tab.

**Passwords** are written only to your computer's keychain (macOS Keychain, Windows Credential Manager, libsecret). They are never in the connection file, a log, an error message, the page or its address. The password box is write-only: the page only ever learns *whether* one is saved, and **Remove saved password** deletes it. When the keychain isn't available the editor says so: the password then lives in memory until the File Manager closes and you are asked again next time.

**Found in your environment.** When the tab opens (and once, quietly, when the File Manager starts) it looks at this program's environment variables for connection settings (`MSQL_*`, `MYSQL_*`, `MARIADB_*`, `DB_*`, `PG*`, `POSTGRES_*`, `REDIS_*` and SQLite path variables; `DATABASE_URL` goes to the engine its scheme names). Each find is a card showing host, port, user, database, TLS, whether a password exists (never the password) and **which variable or file each value came from**. *Save to the manager* creates a normal connection (the password goes to the keychain; saving the same connection twice leaves one); *Not now* hides it until the File Manager is opened again; *Never for this one* remembers that. Detection never connects to anything. *Detection settings* has two switches: **Detect my environment variables automatically** (on) and **Save detected connections automatically** (off: saving always takes one click unless you turn this on). After a save, the page lists the variables that are **no longer needed** (names only; nothing is edited for you, so remove them from your shell profile or `.env` yourself if you like) and offers **Stop using environment variables for this engine**. If the environment changes later (a different host, user, password or address), the card says **Your environment changed since this was saved** with a field-by-field list (passwords are only compared, never shown) and an **Update the saved connection** button.

**`.env` files.** Bun loads `.env` files from the folder it is started in into the environment before any program runs (in this order, later wins: `.env`, `.env.production`/`.env.development`/`.env.test` by `NODE_ENV`, `.env.local`, `.env.<mode>.local`; real environment variables win over all of them). The tab reads, read-only, the `.env*` files in **the application's own folders only**: the folder it was started from and its install folder. It never runs anything in them, ignores links, binary files and files over 256 KB (and says so), and tells you where each value came from: *environment variable NAME*, *`.env.local` in the start folder (~/…)*, or, when Bun did not load a file (another start folder, or loading was turned off), *found in the file but not loaded into the environment*. Such a connection can still be saved. To import a `.env` file from anywhere else, right-click it → **Import database settings…** (preview first; nothing is written until you confirm, and the file is never changed). The tab never scans other folders by itself.

**Which value wins** (the *Effective settings* panel of each connection shows every value and where it comes from):

1. the **connection** you chose in the File Manager;
2. the File Manager's **defaults for that engine** (*Defaults…*: host, port, user, database, schema, TLS);
3. **environment variables** (and `.env` files Bun loaded);
4. the **studio's own defaults**.

A blank field in a connection falls back down this list. A password never falls back to the environment: an environment password is never sent to a connection that has its own host. When a studio is started for a connection, it gets a **rebuilt environment**: every connection variable of every engine (`MSQL_*`, `MYSQL_*`, `MARIADB_*`, `DB_*`, `DATABASE_URL`, `PG*`, `POSTGRES_*`, `REDIS_*`, `VALKEY_*`, `SQLITE*`) is removed, then the connection's values are set under the names that studio reads; the File Manager's own settings never reach it, it starts in a folder with no `.env` files and with Bun's automatic `.env` loading switched off (`--no-env-file`), so nothing stale can leak in. The panel lists the variables being **ignored** and the ones **no longer needed**, by name. The switch **"Use environment variables for this engine"** (on by default) means: with **no connection chosen** the studio is started with your environment as it always was, and a connection may fall back to it for blank fields. Turn it off and no environment variable or `.env` file is used for that engine, ever.

**Studios inside the window.** *Open in … Studio* starts the studio's own server on `127.0.0.1` (a port the system picks) and shows its page in a frame. One studio per connection, at most four at once; **Stop**, **Restart** (settings are read again), **Open in a separate window** (the desktop app with the same connection; Redis Studio's window is refused when a password is involved, because its address would be on the command line) and **Open in my browser**. The status says starting, running, stopped or stopped unexpectedly, with the last log lines (secrets are hidden). Studios end when the File Manager closes, and also when it is killed. The frame can't read this window or its secret token, and may only do what it needs (scripts, its own server, forms, its question boxes, downloads, copying, full screen); it can't navigate this window elsewhere or open pop-up windows.

**Production and read-only.** The studios have **no read-only mode**, so a connection marked *Production* or *Read-only* asks before a studio opens ("you could change or delete data in it. Open it anyway?") and keeps a warning banner above the studio. For a real read-only session use a database account that can only read.

**Shortcuts.** Every saved connection also has two quick buttons in its details, **Open in a window** (its own desktop window, nothing inside the File Manager) and **Open in my browser** (the studio runs in the background and your browser is pointed at it; it stops when the File Manager closes). The Home page shows a tile for your favourite and most recently used connections that opens it with one click, and **Shift+Enter** on a connection in the list does the same. Which of the two the tiles and Shift+Enter use is **Settings → Database shortcuts open in** (their own window, the default, or my web browser). Production and read-only connections still ask first. Showing the tiles never reads your keychain, and a Redis connection with a password can only be opened in the browser (its window takes the address on the command line).

**Import with staging.** For a saved SQLite, MySQL or PostgreSQL connection, **Import data with staging…** (in its details) opens that connection's studio with its **📥 Import with staging** wizard — here in the tab, in its own window or in your browser. Right-click a **CSV, TSV, JSON or JSON Lines** file → **Load into a database (staging first)…** asks for a saved connection (or the full path of a SQLite file) and where to open it, and the wizard starts with **that file already chosen**; Excel files get a disabled item that says to save them as CSV UTF-8 first. The rows are copied into a staging table, checked there, and only then promoted into a table — with a dry run and an undo ([the full guide](../databases/staging-import.md)). The file is only read, never changed: the File Manager checks the path (a real file of an importable kind, under 2 GB), then starts the studio with it, or hands the path to a studio that is already running through a route protected by a secret that only the File Manager and that studio know. A connection marked production or read-only asks for the table name to be typed before anything is promoted. Redis has no tables, so its button is switched off and says why.

**New SQLite database.** Right-click empty space → **New SQLite database** makes a real, empty database file (`New database.sqlite`, then `New database (2).sqlite` and so on, never replacing anything) in the folder you are looking at and lets you name it straight away. Then right-click it to open it in SQLite Studio (in the tab, its own window or your browser) or add it as a connection.

**SQLite files.** In the file list, a file whose first bytes really are SQLite's header (not just one named `.db`) gets **Open in SQLite Studio** (in the tab), **Open in SQLite Studio in its own window**, **Open in SQLite Studio in my browser** and **Add as database connection** in its right-click menu, and **Open with…** offers *SQLite Studio (built in)* (you can choose it for a file type; the default way of opening a file is not changed).

**Limits.** Redis Studio shows every key, ignores a key prefix and cannot be made read-only; MySQL and PostgreSQL Studio only switch TLS on or off (a CA file and "don't check the certificate" apply to *Test connection* only); MySQL Studio needs a database name (without one it opens `my_app_dev`); SQLite *read-only* mode applies to *Test connection* only. Pages in a studio that open a new browser window (printing a report, for example) are blocked by the frame. Studios are the same programs you start from the launcher: in a release folder they are looked for beside the File Manager, and in the one-app-per-download Mac packages in the other `.app` folders next to it (this lookup is tested with stand-in folder layouts, not yet with the real downloads).

## Subdomains (Subfinder)

**Find & more → Subdomains** (🔭, in the Network group beside the Network tab, and a tile on Home) finds the subdomains of a domain you own or are allowed to test (`www.example.com`, `mail.example.com`, `shop.example.com` …). It is the [Subfinder Studio](25_subfinder_studio.md) engine inside the File Manager, and it can hand a host to the Network tab for DNS, certificate and port checks.

**Responsible use.** Asking the public sources is generally fine: it reads public records (certificate logs, passive-DNS services) and never contacts the domain. The three **active** steps — DNS lookups, HTTP/HTTPS probing and port probing — do contact the target's own computers, so only use them on domains you own or have permission to test. They are **off by default**, each has its own explanation, and the first time you tick one you must tick *I own this domain or have permission to test it*. That tick is remembered for that domain until the File Manager is closed (never saved), and the server enforces it too.

**The domain box.** Type a domain such as `example.com`. It is lower-cased, international names are turned into their `xn--` form (both are shown), and a trailing dot is dropped. Refused with a plain message: web addresses (`http://…`, paths, user names), ports, IP addresses (in any spelling), wildcards, underscores, parts longer than 63 or a total longer than 253 characters, hidden or right-to-left control characters, `localhost` and other reserved endings, and shared suffixes with no site name (`com`, `co.uk`, `github.io`).

**Sources.** Tick any of **crt.sh**, **HackerTarget**, **AlienVault OTX**, **Anubis** and, when installed, the **subfinder program**. Each shows its own status (asking…, answered, timed out, failed, cancelled), how many hosts it gave and, if it failed, why in plain words. One source failing never fails the run. Only hosts inside the target domain are kept: names from other domains, malformed names and hostile text are dropped (the per-source count shows how many).

**Options.** Time limit per source (3–60 s, default 15), most results to keep (up to 10,000, default 2,000), then the active steps:

| Step | What it does |
| --- | --- |
| **Resolve DNS** | Looks up each host's IP addresses (IPv4 first), up to 10 lookups at once (default 8). |
| **Detect wildcard DNS** | Asks for three random names that cannot exist. If they answer, hosts that only match that answer are marked *wildcard*. Needs Resolve DNS. |
| **Probe HTTP/HTTPS** | Reads each live host's status code and page title (HTTPS first, then HTTP), up to 5 at once (default 4), with a pause between requests to one host. At most 3 redirects, only to hosts inside the target domain, never from HTTPS down to HTTP. No cookies are sent; HTTPS certificates are verified unless you tick *Accept untrusted HTTPS certificates*. Needs Resolve DNS. |
| **Probe ports** | Tries to connect to the listed ports (default `80,443`; lists and ranges like `8000-8003`; at most 20) on each live host. Needs Resolve DNS. |
| **Allow private/internal addresses** | Off by default: a host whose DNS points to a loopback, private (10.x, 172.16–31.x, 192.168.x), link-local, shared (100.64.x), unique-local (IPv6 `fc00::/7`), multicast or reserved address is **never connected to** — not directly, not after a redirect, and not if its DNS answer changes between the check and the connection. Tick it only to test your own internal network. |

Every request identifies itself as the File Manager, all lookups and connections of all runs share one cap so the window stays responsive, and a run is stopped after 20 minutes. Everything is cancellable with **Cancel**; what was found so far is kept.

**Results.** The table fills while the run goes: host, found by, IP addresses, web status, page title, open ports, wildcard. Click a heading to sort. Narrow it by text, IP address (has / none), web status (2xx … none), source, or **Only live** (has an IP address or answered on the web); the counts line says how many hosts match. Titles and notes are plain text, never HTML. Only the first 300 rows are drawn (*Show more* adds 300), but copy and export always use every row that matches the filters.

- **Copy.** The table gets the usual **Copy** button (see [Copy any section](#copy-any-section)). Besides it: *Copy hosts (one per line)*, *Copy as CSV / JSON / Markdown*, *Copy column*, double-click a cell to copy just that cell, and *Copy row* for the selected row.
- **A selected host.** *Open in Network tab* fills the Network tab's host box (DNS, certificate and port checks there are still your choice). *Copy URL* copies the `https://` or `http://` address. *Open in browser* opens it in your web browser — only `http`/`https`, only for a host of the current run, only when you press it.

**Export and report.** Choose a folder (*Use current folder* fills in the one you are looking at), optionally a name, and press **Export** for a `.txt` host list, a `.csv` spreadsheet (cells that start with `=`, `+`, `-` or `@` are made plain text so a spreadsheet can't run them) or `.json`. If a table filter is on, only the rows shown are exported. **Save as a report** writes a Markdown file with the date, target, sources used and how each did, counts, the hosts and a *Notes in plain words* section. Files are only ever created: if the name is taken, a number is added.

**History and privacy.** The last 20 runs are listed with the target, time, steps used and counts, in a small file in the app's data folder. **No host names are stored** unless you tick *Keep these results in the history* before the run (then up to 2,000 hosts of that run are kept, and *Show kept results* displays them again). **Clear history** deletes the file.

**The optional `subfinder` program.** If the real [`subfinder`](https://github.com/projectdiscovery/subfinder) is installed, it appears as one more source (tagged `subfinder`, results merged and validated like the others). It is found like the other helper programs (the PATH and the usual install places), run with an argument list — never through a shell — with `-silent -json -nc -disable-update-check -timeout … -max-time … -d <domain>`, a time limit and a 4 MB output cap. If it is missing, the page says how to get it (`brew install subfinder`); the File Manager never installs it for you. Its own config (API keys for more sources) is its business: this tool doesn't read or change it.

**Limits.** One run per tab at a time and two at once; finished runs are kept in memory for 30 minutes (at most 6); a source answer larger than 4–16 MB is refused; wildcard detection only tests the target domain itself, not sub-zones such as `*.dev.example.com`; passive sources can be out of date or incomplete, and some limit anonymous use (HackerTarget has a daily quota, AlienVault OTX may answer 429, Anubis may be blocked by its Cloudflare check): such a source shows its own error and the others still deliver, so the list is a starting point, not a guarantee. This tool does not pretend to be a web browser to get around such blocks.

**For developers.** Operations: `subdomains/info`, `subdomains/start`, `subdomains/status`, `subdomains/results`, `subdomains/cancel`, `subdomains/export`, `subdomains/report`, `subdomains/open`, `subdomains/history`, `subdomains/history/clear`, all behind the session token and the loopback checks. The engine lives in `src/features/subfinder/` (`subfinderEngine.ts`, `subfinderNames.ts`, `subfinderSources.ts`, `subfinderNet.ts`, `subfinderProgram.ts`); the server side is `fmSubdomains*.ts`. Tests replace fetch, DNS, HTTP, TCP and the clock through `context.subdomains` and never use the network.

## Downloads (fast, resumable)

**Find & more → Downloads** (⬇️, in the Network group) downloads files from the web faster than a browser, and keeps going after a pause, a lost connection or a restart.

**How it is fast.** It asks the server about the file first (one tiny request), then, when the server allows it, cuts the file into pieces and fetches several pieces **at the same time over separate connections** (8 by default, up to 32). A fast connection simply takes more pieces, so one slow connection doesn't hold the rest back. The pieces are written straight into the right place in a `name.part` file, which is renamed when the last byte is in.

**Add downloads.** Paste one or more web addresses (one per line; lines starting with `#` are ignored) and press **Download**. **Check the file** shows the name, the size and whether the server can be split and resumed, without downloading anything. Optional: a folder, a name to save as, a **checksum** (`sha256:…`, or md5, sha1, sha512, checked when the file is finished) and request **headers** (a login cookie, a referer, an authorisation token: they stay on this computer and are never shown again in the list). `https://user:password@host/file` addresses work.

**Pause, resume, queue.** Each row has Pause, Resume (or Try again after a problem), Show, and Remove. Progress is saved next to the file (`name.part` and `name.dlstate`), so a download you paused, or that was running when the File Manager closed, shows as **Paused** next time and **Resume** carries on from where it stopped. Before it continues, the server's file is checked against what was saved (size and ETag): a file that changed is fetched afresh instead of being stitched together from two versions. A few files download at once (3 by default); the rest wait their turn. **Pause all**, **Resume all** and **Clear finished** work on the whole list.

**When things go wrong.** A dropped connection is retried, with growing waits (6 tries per piece by default); a busy server's `Retry-After` is respected. Servers that can't send pieces are downloaded in one stream, and resumed with `Range` when they allow it. A file that arrives with the wrong checksum is kept, marked as a problem, and says so. Out of disk space is reported before the download starts.

**Settings.** *Files at once*, *Connections per file*, a **speed limit** shared by everything (so a big download can't use all your internet), and the download folder (the **Downloads** folder in your home folder unless changed).

**Limits.** Only `http://` and `https://` addresses (not FTP or torrents). It doesn't open a browser, so a link that needs you to click through a web page or log in with a form needs the cookie pasted into **Headers**. Names the server asks for are cleaned (no folders, no characters a system can't store); a name that already exists gets ` (1)`, ` (2)` … rather than overwriting.

## API Studio, App Bundler and Env Studio

Three more of the project's apps run inside the File Manager, as tools in **Find & more**:

| Tool | Where | What it is for |
|---|---|---|
| 🛰️ **API** | Network group | **API Studio**: send HTTP and REST requests, import a cURL command, set headers, a body and variables, benchmark an endpoint, and export the response. |
| 📦 **Bundler** | Files and text group | **App Bundler**: bundle a Bun project into one file, a standalone program, or a macOS `.app`. |
| 🔑 **Env** | Security group | **Env Studio**: edit `.env` files, find duplicates and mistakes, compare with an example file, and keep secret-looking values masked. |

They are the same programs that open their own window when you run them alone (`bun run applications/api_studio.ts` and so on); here each one starts the first time you open its tab and is shown in a frame, so nothing needs installing. **Restart** closes a tool and starts it fresh; it also stops when the File Manager closes. The tools run on this computer: the API Studio sends its requests from here, and the Env Studio never sends a value anywhere.

**How they are kept apart.** Like the Calculator, each tool's page is served on the *other* spelling of this address (`127.0.0.1` ↔ `localhost`), which a browser treats as a separate site, so a tool can't read the File Manager's page or its secret token. Starting a tool needs the File Manager's token, and the tool's page and its connection need a secret that only that run of that tool has; an old one stops working when the tool is restarted.

## Files that aren't what their name says

A file's name can lie. `invoice.pdf` can really be a Windows program, `photo.jpg` can really be a PNG or a zip, and `report.pdf.exe` or a name with a hidden right-to-left character can hide what it ends in. The File Manager reads the first few hundred bytes of the files you can see and puts a small badge after the name when the contents don't match:

- **⛔ Danger**: a program or a script (a Windows program, a Linux or Mac program, a text file starting with `#!`) with a name like a document, picture, sound, video, archive or text file; a name such as `report.pdf.exe` where a document or picture ending is followed by one that runs (`.exe .scr .bat .cmd .msi .vbs .js .lnk .jar .ps1 .app .dmg .pkg` and so on); a name with a right-to-left override or another invisible or control character; a long gap of spaces, dots or underscores before the ending; a trailing dot or space.
- **⚠ Warning**: a different sort of file than the name says (a `.pdf` that is plain text, a web page, a zip or a database; a `.txt` that is binary).
- **ℹ️ Note**: another format of the same sort of file (a `.jpg` that is a PNG, an `.mp4` that is a Matroska video). It offers **Rename to .png** (or whatever the real ending is); the rename never overwrites a file that already has that name, and **Undo** is offered afterwards.

- **ℹ️ Note about the name itself**: an **empty** file whose name promises real content (an empty `.png`, `.mp3`, `.pdf`, `.zip` or `.docx`: it is not that kind of file until it holds real data), and a name with **two file types** such as `New file.txt.png` (only the last ending counts, so it is treated as a picture, not as text). For the second it offers **Rename to .txt**. Empty text, code and database files say nothing.

You are told **right away** when you create or rename a file: a message at the bottom says what is odd about the new name, with a **Details** button that opens the explanation.

Press the badge (it is a button, so Tab and Enter work too) for a plain explanation, what it means and what to do. The same explanation is in the **Details** panel and in **Properties**. A file that matches its name shows nothing.

Opening a **Danger** file asks first ("This file isn't what its name says", *Don't open* is selected); *Open anyway* then opens it (a real program still asks "Run this program?" after that). This applies to double-click, Enter, **Open with…** and the Find tool. Warnings and notes never block opening.

Turn it off in **Settings → Warn when a file isn't what its name says** (no badges and no extra question; the page then confirms for you). Files with no ending, unusual endings, `.dat`/`.bin`/`.tmp`/`.bak`, empty files, folders and links are never judged by their contents, Office, e-book and package files (`.docx`, `.epub`, `.jar`, `.apk` and so on) are zip files by design and are not flagged, and nothing is ever run or opened to find out. Only the first 300 rows of a folder are checked automatically; showing more of a large folder checks the rest.

## More info and metadata

**More info** opens a window with every detail about the selected item, written in plain words. Open it with **Alt+Shift+Enter**, right-click → **More info…**, the **More info…** button in *Properties*, or the button under the preview in the **Details** panel. (Ctrl/⌘+I still shows or hides the Details panel, so it can't also open this window.) It works for one file, a folder (counted in the background, with a **Cancel** button) and for several items at once (a total size and a breakdown).

**What it shows**, in groups you can fold: **General** (full path, the real kind worked out from the first bytes, MIME type, size in bytes and "on disk", permissions with owner and group, hidden or not), **Dates**, **Image** (size, megapixels, aspect ratio, colour type, bit depth, density, interlace, frames and loops of animations, the structure of the file), **Camera and shot** (camera, lens, date taken, exposure, aperture, ISO, focal length, flash, white balance and more), **Location**, **Colour profile**, **Extra notes (XMP)**, **Media** (container, duration, codecs, bit rate, tracks, tags, chapters, cover art), **Document** (PDF, Office, OpenDocument, EPUB, archives, databases, fonts, programs, text files and JSON), **Origin and security**, **Fingerprints**, an optional **Everything (ExifTool)** list and **What this file reveals**. A hover tooltip on every row with jargon (EXIF, ICC profile, bit depth, codec, subsampling…) explains it in a sentence.

**Searching and copying.** The sticky search box hides every row that doesn't contain all the words you type (Esc empties it). Every row has a **copy** button (it is a real button: Tab to it, then Enter or Space). **Copy report** copies everything shown as text, JSON or Markdown, and **Save report** writes it next to the item as `<name>.info.txt`, `.info.json` or `.info.md`; an existing report is never overwritten (the next one is `… (2)`). Saving is off when several items are selected.

**Pictures.** The built-in readers need no helper program and read PNG (all chunks, including text notes, `pHYs`, `iCCP`, `tIME`, `eXIf` and APNG), JPEG (baseline or progressive, subsampling, a quality estimate, JFIF, Exif, XMP, ICC, Adobe, MPF and Photoshop segments, comments), GIF (frames, duration, loops), WebP (lossy, lossless, extended, animated, with EXIF/XMP/ICC), BMP, ICO and CUR (every size), TIFF, HEIC and AVIF (size and colour boxes only) and SVG (read as text: size, `viewBox`, a count of tags, and a safety check that *reports* scripts, event handlers, links to other sites and entity definitions and never runs, fetches or expands them). EXIF is read in both byte orders, with guards against loops and damaged data: camera, lens, settings, orientation, the thumbnail and the maker's private notes (their presence), and the GPS position. The **Colour palette** (up to eight main colours with HEX, RGB and HSL; click one to copy it) is worked out in the page from a tiny copy of the picture, with no server work. The Details panel shows a compact **Photo** strip (size, camera, date, ISO, aperture, shutter, focal length) and, when there is a position, a **📍 Has location** badge.

**Privacy.** *What this file reveals* lists, with text and an icon (not colour alone), whether the picture holds the place it was taken (GPS), a camera or lens serial number, an owner or author name, the program used, the date and time, a hidden thumbnail, the camera maker's private notes, XMP or IPTC. A picture with a position shows **"This photo contains the location where it was taken."**, the coordinates in degrees and decimals, and **Copy coordinates**. **Open map…** is never automatic: it explains that the place will be sent to openstreetmap.org and opens it in your web browser only after you confirm. **Remove private info…** makes a *copy* named `<name> (no metadata).<ext>` next to the picture, without the EXIF, GPS, XMP, IPTC, comments, text notes, time stamps and the extra data some phones append after the picture; the picture data is copied byte for byte (nothing is re-encoded, no quality is lost), colour profiles are kept, and you may keep the note about which way up the picture is. It works for **JPEG, PNG and WebP**; the original is never touched and nothing is overwritten. If ExifTool is installed, **Remove only the location…** uses the existing *Convert or process → Remove only the location (GPS)* action (the date, camera and picture stay) and shows its progress in the task list. For other kinds of picture use *Convert or process → Remove location and camera info*.

**Fingerprints.** *Calculate fingerprints* works out MD5, SHA-1, SHA-256, SHA-512 and CRC32 by reading the file in 1 MB pieces (so it works for files of any size), with a progress bar and **Cancel**. **More kinds…** adds SHA-224, SHA-384, SHA-512/256, SHA-3, BLAKE2, RIPEMD-160, the obsolete MD4 and the *fast checksums* (see "Tools built on Bun's own utilities"). Paste a fingerprint from a download page into **Compare**: capitals, spaces, colons, `0x` and a name in front such as `sha256:` are all fine.

**Where it came from (macOS).** The macOS details come from `mdls`, `xattr` and `codesign` (all read only, with time limits): the Finder's kind, tags and comment, the web addresses the file was downloaded from, whether it carries the quarantine flag (and which program and date), the extended attributes, and for programs a summary of the code signature (shown, not verified). On Linux the `file` and `getfattr` programs are used when present. On Windows only what the file system reports is shown (the read-only attribute); the hidden attribute is not read.

**Helper programs (optional).** **ExifTool** adds *Show everything*: every tag it can read, grouped by family, for pictures, RAW photos (CR2, NEF, ARW, DNG…), video, sound and PDFs. **ffprobe** (part of FFmpeg) gives the full media details; without it the built-in readers cover MP3 (ID3v1 and v2.2–2.4, Xing and VBRI durations, cover art), WAV, FLAC, Ogg Vorbis and Opus, MP4/MOV/M4A (duration, tracks, codecs, tags, chapters) and, best effort, MKV/WebM. Install hints are shown in the window and are display only: `brew install exiftool` and `brew install ffmpeg` on macOS, `winget install OliverBetz.ExifTool` and `winget install Gyan.FFmpeg` on Windows, your package manager on Linux (`libimage-exiftool-perl`, `ffmpeg`). The programs are started with an argument list (never a shell), with a time limit and an output limit, and a file name starting with `-` or ending in `|` cannot become an option or a command.

**Documents and others.** PDF (version, pages, page size, the Info dictionary, encrypted, fast web view, and a warning about JavaScript, launch actions, embedded files and open actions, found by scanning the text, never by running anything), Word/Excel/PowerPoint (title, author, who saved it last, dates, pages, words, sheets, slides, macros), OpenDocument, EPUB, zip and tar and `.tar.gz` (entry count, unpacked size, compression ratio, largest items, password-protected entries, and a warning when the numbers look like a zip bomb), SQLite (page size, encoding, WAL, user version, table list), fonts (family, style, version, designer, licence, glyphs), text files (encoding, byte-order mark, line endings, counts, longest line, indentation, `#!` line, JSON validity), and program headers (Windows PE, Linux ELF, Mac Mach-O including universal files).

**Safety.** Every `info/…` operation needs the session token and the loopback checks like all others, and every path goes through the usual path checks. Files are inspected with `lstat` first: a link is described but not followed (its target can be shown separately), and only ordinary files are read (a named pipe is refused without being opened). Only the start of a file (at most 4 MB) or the needed pieces are read, strings from files are cut at 2,000 characters and lists at 2,000 rows, nothing is ever run or opened, no network is used (the one exception is the map link you confirm), and each operation stops after 10 seconds (hashes and folder counts run as cancellable jobs instead, at most four at a time).

**Limits.** HEIC and AVIF are read for size and colour details only (install ExifTool for their camera notes and location); WOFF2 fonts, RAR/7-Zip/bzip2/xz archives and ZIP64 archives are not listed; EXIF maker notes are reported as present but not decoded; MKV/WebM and MP4 reading is best effort; the built-in cleaner works on JPEG, PNG and WebP only; the PDF scan can miss scrambled content; a big PDF (over 24 MB) is only scanned at its ends. macOS is the only system these were run on; the Linux and Windows branches (the `file`/`getfattr` extras, the read-only attribute) are written but **not verified**. There is no Details-list column choice yet.

## Tools built on Bun's own utilities

Bun (the program this app runs on) has a toolbox of small built-in utilities. These parts of the File Manager use them, so none of them needs anything installed. Each one says in its tooltip what it is for.

**Zstandard compression (Convert & process → Archives).** *Compress with Zstandard (.zst)*, *Open a .zst file* and *Pack into a .tar.zst file* work with no helper program, and `.tar.zst` archives unpack with the built-in reader (Bun's zstd codec, streamed in 1 MB pieces, so a very large file doesn't fill the memory). gzip and `.tar.gz` also got a **compression level** (1 fastest to 9 smallest, default 6); Zstandard has 1–19 (default 3). A file that isn't a zst file, was **cut short** (an unfinished download) or is damaged is explained in plain words, and nothing is left behind. Opening is capped like gzip: if the unpacked result would pass **8 GiB** (a "decompression bomb") it stops with a message. Files made by the zstd and tar programs open here, and files made here pass `zstd -t`. A zst file made with an enormous window setting (`--long=31`) can need more memory than is allowed and is refused with a sentence. Not provided: `.zz` (zlib/deflate) files, which add nothing next to gzip.

**More fingerprints (Crypto tab and More info).** Besides SHA-256, SHA-512, SHA-384, SHA-1 and MD5, the Crypto tab shows SHA-224, SHA-512/256, SHA3-256/384/512, BLAKE2b-256 and -512, BLAKE2s-256, RIPEMD-160 and the old **MD4 (marked obsolete and broken, for very old systems only)**, each with a plain-words tooltip. A separate group called **Fast checksums (to spot accidental changes only, NOT secure)** shows CRC32, Adler-32, xxHash32, xxHash64, XXH3, wyhash, CityHash32/64, MurmurHash2 (32 and 64-bit), MurmurHash3 and rapidhash (Bun.hash, seed 0). Each is the number the function returns written in hex with the most significant digit first, 8 digits for 32-bit kinds and 16 for 64-bit ones (that is also what `xxhsum` and `cksum` print). Files are read in pieces for every kind that can be continued (all the secure ones, CRC32, Adler-32); the other fast checksums need the whole file in memory at once, so they are skipped, with the reason shown, for files over **256 MB**. *Hash a file* has a box **Also work out the extra kinds and the fast checksums** (off by default because it takes longer on big files). The **Check the checksum** box understands every kind, and *More info → Fingerprints* has a **More kinds…** list with checkboxes.

**Password hashing (Crypto tab).** *Hash a password for storing* uses `Bun.password`: **argon2id** (the default and the recommended choice), argon2i, argon2d or **bcrypt**. The result is the standard stored form (`$argon2id$…` or `$2b$…`) with the method, settings and a random salt inside, plus the measured time. Settings are bounded so nobody can freeze the app: argon2 memory 8 KiB–1 GiB, 1–10 passes, bcrypt cost 4–16 (each +1 doubles the time), with a rough time guess. bcrypt only reads the first **72 bytes** of a password; Bun squashes a longer password with SHA-512 first, so a hash made here for such a password won't check in other bcrypt programs (the page says so). *Check a password against a stored hash* reads the method from the hash and answers ✔ or ✖; a pasted hash that asks for more than 1 GiB or 10 passes (or bcrypt cost over 16) is refused so it can't tie up the computer. Only one password job runs at a time, **Stop waiting** gives up on an answer, and a job that takes over 60 seconds is dropped. Passwords are never saved or logged and the box is emptied after use (unless you untick that).

**Colour converter and text tools (Crypto tab).** The *Colour converter* reads any CSS colour (a name, `#hex`, `rgb()`, `hsl()`, `hwb()`, `lab()`, `oklch()`, `0xRRGGBB`) with `Bun.color`, draws a swatch (a chequered background shows transparency) and lists it as CSS, hex, HEX, rgb, rgba, hsl, lab, a number, `{r,g,b}` and `[r,g,b]` forms and the three terminal colour codes, each with its own **Copy**. Forms a wide-gamut colour can't be written in are left out and said so; trailing junk such as `red; x` is refused. The *Encoders* card gained **HTML escape**, **HTML unescape** (the five entities and numeric references only, always as plain text), **Remove colour codes** (strips the ANSI colour codes from pasted terminal logs) and **Text width** (characters, bytes and terminal columns: wide letters and emoji take two).

**Version tools (Dev tab → Versions).** Compare two versions (older, the same or newer; `1.10.0` is newer than `1.9.0`), check a version against a range (`^1.2.0`, `~1.2.0`, `>=2 <3`, `1.x`, `1.2.3 - 2.0.0`, alternatives with `||`), and sort a pasted list (oldest or newest first). **Does this computer meet the project's versions?** reads `engines` in `package.json`, `.tool-versions`, `.nvmrc`, `.node-version`, `.bun-version`, `.python-version` and `.ruby-version` in the folder and marks each tool that is too old, too new or missing. Versions and ranges are checked for the right shape first, because `Bun.semver` alone answers "yes" to text that isn't a range.

**Open in your editor and `file://` addresses.** Right-click a text or code file → **Open in your editor** starts the editor chosen in **Settings → Code editor** (Automatic, VS Code, Sublime Text, WebStorm or IntelliJ IDEA) with `Bun.openInEditor`, never through a shell. Automatic uses the editor named by `$VISUAL` / `$EDITOR` (terminal editors such as vim are refused, since they have no terminal here) or else the first known editor found. Bun can't report afterwards whether the editor started, so the command is looked up first and a missing one is explained with how to fix it ("In VS Code run *Shell Command: Install 'code' command in PATH*"); the usual install places are searched too, because an app opened from the Dock has a short PATH. **Copy path as a file:// address** copies `file:///Users/you/My%20Docs/a.txt` style addresses (`Bun.pathToFileURL`), and **Go to folder** accepts a pasted `file://` address (`Bun.fileURLToPath`; another computer's name or an encoded slash is refused with a sentence).

**TypeScript and JSX to JavaScript, and Imports and exports.** *Make JavaScript from TypeScript or JSX* (Convert & process → Data & text) turns `.ts .tsx .jsx .mts .cts` into `.js` (`.mjs`, `.cjs`) next to the original with `Bun.Transpiler`: choose the target (browser, Bun, Node.js), whether to remove spaces, shorten local names and simplify code, and for JSX whether tags become `React.createElement` or Preact's `h`. It removes types only: nothing is type-checked or bundled, and a mistake in the code fails that one file with the line and column. *More info → Imports and exports* lists the modules a JS/TS file imports (`import`, `import()`, `require()`) and what it exports, read with the same parser (the file is never run; capped at 30 names shown).

**Compare data files.** Select exactly two JSON, JSON5/JSONC, YAML or TOML files → right-click → **Compare data files…**. They are read with Bun's own parsers and compared **by meaning**, so key order, spacing, comments and quoting don't matter (and a JSON file can equal a YAML file). The window says ✔ identical or ✖ how many differences, then lists *Changed* (path, left value, right value), *Only in the left file* and *Only in the right file*, each with its own **Copy**, and **Copy everything**. Lists are compared item by item; a value that changed kind says so ("a number became text"). Files over 5 MB, data nested over 100 levels and more than 300 listed differences are limited (the total is still counted).

**Markdown to a web page.** *Convert to a web page (HTML)* uses pandoc when it is installed. Without it, a `.md` file is turned into a page by **Bun's Markdown renderer**, which handles nested lists, tables with alignment, task lists, strikethrough, web addresses that become links, reference-style links and underlined headings; the older built-in renderer is kept as the fallback (it flattens nested lists and has no reference links). **Safety:** raw HTML in the Markdown is switched off (it shows as text), every link and picture address must be a web, mail or relative address (a `javascript:` address loses its link), links get `rel="noopener noreferrer"`, the page forbids scripts, and the result is checked for any tag or attribute the renderer shouldn't write; if anything looks wrong the older renderer is used instead. A page made from untrusted Markdown is therefore safe to open, but still check what you publish.

**About window.** Shows the app's name and version, the **Bun version and build** (for example `Bun 1.4.2 (744846f8)`) and your system (macOS, Windows or Linux with the processor type) with a **Copy** button for bug reports.

## Graveyard (Rip)

The **Graveyard** (Find & more → **Graveyard**, or its tile on the Home view) is everything [Rip Studio](18_rip_studio.md) does, inside the File Manager: a safe, undoable alternative to deleting. Buried items are *moved* into a quarantine folder, the **Rip graveyard**, with a record of where each one came from, and stay there until you restore them or delete them for good.

**Recycle Bin or graveyard?** Both can be undone; they differ in who else can see them.

| | Recycle Bin | Rip graveyard |
|---|---|---|
| Who uses it | This app only | This app, **Rip Studio** and the `bun run cli:rip` command (the same folder and the same records) |
| Where | `~/.bun_rad_studio/file_manager_trash/` | `~/.local/share/rip/graveyard/`, or the folder named by the `GRAVEYARD` environment variable |
| Bring back | Sidebar → Recycle Bin → Restore, or Undo | Find & more → Graveyard → Restore, or Undo; from a terminal: `bun run cli:rip -u` |
| Delete key | The default | Choose it in **Settings → When I press Delete, use** |

The Recycle Bin item in the sidebar always shows the old bin, whatever you choose.

**Burying.** Right-click → **Bury (Rip)**, or press **Alt+Delete** (⌥⌫ on a Mac), or set Settings to **The Rip graveyard** and press Delete. The toast says what was buried and offers **Open Graveyard**; **Ctrl/⌘+Z** brings everything from that burial back in one step. The same folders are protected as for Delete (system folders, your home folder and its main folders, the top of a disk, the Recycle Bin), and the graveyard can't be buried into itself or into a folder that contains it. An item on another disk than the graveyard is copied, the copy is **checked** (names, kinds, sizes, link targets and permissions) and only then is the original removed; this runs as a task in the task list with **Cancel**, and if anything goes wrong the original is left exactly where it was. Items buried that way aren't part of the one-step Undo; restore them from the Graveyard tab.

**Going to the Graveyard and other tools.** **Open Graveyard** is in the right-click menu of any item and of empty space (and of the Recycle Bin view), so the tool is one click away from wherever you are. Right-click empty space also has **Open SQLite Studio**, **Open MySQL Studio**, **Open PostgreSQL Studio** and **Open Redis Studio** (the Databases tool opens the only saved connection of that kind, asks you to choose when there are several, or helps you add the first one) and **Open a tool…**, a list of every tool grouped like Find & more. Items have **Open a tool…** too.

**The Graveyard tab.**

- **Cards:** how many items are buried, their total size, the oldest and the newest, and the free space on the disk that holds the graveyard. Below them is the graveyard folder, with **Show in file manager** (your computer's own file manager) and **Open here**.
- **The list:** name, kind, size, the folder each item *came from* and when it was buried. A **search** box (several words must all match), a **Show** choice (*All*, *From the current folder*, *Files*, *Folders*), sorting by any column heading, a page size and Previous/Next, so even tens of thousands of items show one page at a time. Tick items, or use **Select all** (every page that matches) and **Select none**. Items whose files have gone say **⚠ files missing**.
- **Restore** puts the selected items back where they came from. If the folder is gone you can **Create the folder** or **Choose another folder…** (typed location). If something with the same name is in the way you get the usual **Replace / Keep both / Skip** question (Replace sends the old item to the Recycle Bin first); nothing is overwritten without that answer. **Restore to…** puts them in a folder you choose. Undo buries them again.
- **Preview:** click a name to see the start of a text file, a picture, the names inside a folder or where a link points, read-only and without restoring. **Open its folder** shows the original folder in the file list.
- **Delete for good…** deletes the selected items after telling you how many and how big. **Delete old…** deletes everything buried more than a number of days ago (it shows the count first). **Empty graveyard…** deletes everything: you must type the word **empty**, and the button unlocks after a few seconds. The server refuses if the graveyard changed since you looked, and asks for the typed word itself, so a script can't skip it either. Deleting many items runs as a task.
- **Verify…** compares the list with the files in the graveyard (optionally checking that small files haven't changed). **Repair** only fixes the list: it removes entries whose files are gone, adds back files that have no entry (their original place is then unknown, so use *Restore to…*), clears unfinished copies, and, if the record file is damaged, keeps it aside as `manifest.json.damaged-<time>` and starts a new list. Nothing buried is ever deleted by Repair. While the record file is damaged every change is refused, so a bad read can't wipe the list.

**Works with the `rip` command?** The graveyard is shared with **Rip Studio** and `bun run cli:rip`, which use the same engine and folder. The separate `rip` program (for example from Homebrew) is a *different tool* that keeps its own graveyard in a different layout (a `.record` file and a copy of the original path, in `$RIP_GRAVEYARD` or a temporary folder), so it does not show what is buried here and `rip -u` can't restore it. The two can share a folder without harming each other (tested with the real `rip` 0.9.7), but they don't share items.

**Safety, in order.** Burying: check the rules, measure, move the files, then write the record. If something stops in between, the files are in the graveyard without a record, and Verify finds and re-records them. Restoring: check the destination, move the files out, then mark the record restored. Emptying: delete the files, then remove the record. The page never sends a path for an item, only its id; the server finds the files from the graveyard folder and the id (and refuses an id or name that isn't of the expected shape), never follows links, and only reads inside the graveyard for the preview.

**Limits.** Cancelling a copy between disks stops between files (and between 4 MB pieces of a very large file). A link is buried as a link; devices, pipes and sockets can be buried only on the same disk. Only the first part of a file (64 KB of text, 8 MB of a picture) is previewed. The graveyard list holds up to 200,000 items. Extended attributes and macOS resource forks of a file that must be copied between disks are kept only where the operating system's copy keeps them. The Dual view's Delete button and Delete key follow the same setting as the left list.

## How it keeps your files safe

- **Nothing is deleted for good by accident.** Delete is a move to the app's Recycle Bin; permanent delete needs a confirmation in the page *and* an explicit `confirm` in the request.
- **Nothing is overwritten silently.** Copy, move, rename, extract and restore pick a free name unless you choose *Replace*, and Replace keeps the old item in the Recycle Bin.
- **System and personal folders are protected.** The operating system folders (for example `/usr`, `C:\Windows`), your home folder and the standard folders inside it (Documents, Downloads and so on) cannot be moved, renamed or deleted; their contents can be changed. This is enforced by the server, not just hidden buttons. The Recycle Bin's own folder is protected too. Burying in the [graveyard](#graveyard-rip) obeys the same rules and also refuses the graveyard itself and any folder that contains it.
- **Permissions are changed carefully.** Changing who may read, write or run something ([Change permissions](#change-permissions)) is previewed first, refuses system folders and the Recycle Bin, never follows or changes links, asks for confirmation for risky results (decided by the server, not the page), and every change can be undone.
- **Helper programs never see a shell.** Every conversion is a program plus a list of arguments, so a file called `$(rm -rf ~).png` or `; touch x` is just a name. Names that ImageMagick would read as instructions (`[`, `]`, `*`, `%`, `:`) are handled by giving it a temporary safe name. Installing needs a confirmation and only runs the fixed command for that tool.
- **Programs ask first.** Opening an application or installer (for example `.exe`, `.msi`, `.app`, `.jar`; see `fmPaths.ts` for the full list) asks "Run this program?" with *Cancel* selected.
- **Zip files are checked.** Entries that would be written outside the new folder (`../x`, absolute paths, drive letters), links, encrypted or ZIP64 archives, wrong sizes or checksums are refused, and a failed extract removes the folder it started.
- **Plain-language errors.** "That name is already used", "You don't have permission", "The disk is full", rather than error codes.
- **Only this computer can use it.** The server listens on `127.0.0.1`, refuses foreign `Origin`/`Host` headers, needs a random per-session token on every action, accepts only JSON and a small body, and sends a strict Content-Security-Policy (no inline script). File names are only ever shown as text. See [Security](../security.md) for what this does *not* stop (another program running as you can read the page and token).

### The terminal

- It is a **full shell running as you** (your login shell, for example zsh or bash), so everything the File Manager protects does **not** apply inside it: `rm` skips the Recycle Bin and cannot be undone, and system folders are not protected from you. The panel says so.
- Only the page that was opened by this window can start one: the connection needs the session's secret token, must come from the page's own address, and at most 4 shells run at once. Closing the window (or the connection) ends every shell, and a shell is also ended if the window's process is killed.
- **Windows, macOS and Linux.** Windows uses a local ConPTY bridge and Windows PowerShell; macOS/Linux use Bun's pseudo-terminal. The first Windows session briefly compiles the bridge with the built-in C# compiler. No terminal package is downloaded. **Follow terminal** works on all three systems. On Windows, PowerShell reports its filesystem folder when returning to the prompt after a command (including `cd`, `Set-Location`, `Push-Location` and `Pop-Location`). Registry and other non-filesystem providers leave the file list unchanged. Untick **Follow terminal** to browse independently; the setting is remembered.
- **WSL on Windows:** entering `wsl` or `wsl.exe` also enables folder following in the distribution's Bash shell, including `-d`/`--distribution`, `-u`/`--user`, `--cd` and `wsl ~`. Windows-mounted paths map back to Windows drives, while Linux-native folders open through `\\wsl.localhost\<distribution>\...`. **Go to this folder** works inside WSL too. Exiting WSL resumes PowerShell following. Your existing Bash startup configuration is loaded but not edited. Other WSL shells open with a notice that tracking requires Bash; explicit `wsl --exec ...` commands and management options retain their normal behavior and do not enable tracking.
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
| The window's size and position, and how it opens | `~/.bun_rad_studio/file_manager_window.json` (readable only by you) |
| The Recycle Bin | `~/.bun_rad_studio/file_manager_trash/` |
| Copy, move and rename history (paths and outcomes only, newest 200, readable only by you) | `~/.bun_rad_studio/file_operations.json` |
| The Rip graveyard (shared with Rip Studio) | `~/.local/share/rip/graveyard/`, or the folder in the `GRAVEYARD` environment variable |
| Dev tab snapshots of code statistics (up to 50) | `~/.bun_rad_studio/file_manager_dev_snapshots.json` (readable only by you) |
| Database connections (SQLite, MySQL / MariaDB, PostgreSQL; the same file the Database Workbench uses) and Redis connections | `~/.bun_rad_studio/connections.json` and `connections_redis.json` (readable only by you; **no passwords**: those are in your computer's keychain) |
| Downloads: the list, the settings, and the progress of unfinished ones | `~/.bun_rad_studio/file_manager_downloads.json` (readable only by you); next to each unfinished file, `name.part` and `name.dlstate` |
| Databases settings: engine defaults, environment switches, detection choices, which connection came from where | `~/.bun_rad_studio/file_manager_databases.json` (readable only by you) |
| Files a studio writes (exports, uploads) | `~/.bun_rad_studio/db_studios/files/` (the folder studios run in) |

The Recycle Bin is the app's **own**, not the operating system's Trash or Recycle Bin: items deleted here do not appear in Finder, Explorer or your desktop's trash, and an item on another disk is copied into this folder (so deleting a large file on a USB drive takes time and uses space here). Emptying the bin frees that space.

## What was verified, and what was not

Checked on **macOS** only, with a sandbox home folder so no real files were touched:

- All backend functions and the HTTP API by automated tests (about 230), including real `zip`/`unzip` interoperability and crafted malicious archives.
- The page in a real browser: browsing, selection, navigation, new folder, rename (including errors), copy, move, undo, delete, Recycle Bin restore, search, the three views, the context menu, type-ahead, the conflict window, zip and extract, bulk rename with undo, favorites, typed locations, the "Run this program?" prompt (cancelled), protected-folder messages, settings, help, no console or CSP errors.
- Drag and drop with **synthetic** drag events (drop on a folder, on the Recycle Bin, Option to copy). A real mouse drag could not be driven by the test tool.
- The **terminal** in a real browser: opens in the current folder, runs commands and shows colours, Ctrl+` toggles it (also from inside it), the shell survives hiding and showing, **Go to this folder** with a folder named `it's a $HOME "test"`, **Restart**, `exit` then Enter, resizing by drag and by keyboard, no console or CSP errors. Real shells over the WebSocket and the limits are covered by tests.
- The terminal in the **real native macOS window** (WebKit): Ctrl+` opens it in the folder on screen and a typed command ran. (A first attempt showed that focus set during the shortcut did not stick in the native window, so the keystrokes went to the file list; the panel now also refocuses after layout.) **Convert and process** on macOS with the real Homebrew `ffmpeg-full`, `imagemagick-full` and `pandoc`: every action (32) on real pictures, a video, a sound file and a Markdown file; a picture named `weird [name] 100%.png`; a broken video (the plain-language failure, no leftover file); the dialog, tray and "new files are selected" in a browser; and the "no tools, no Homebrew" screen. Installing was tested only with a stand-in `brew`, never against the real network.
- The real native window opens, shows the page and shuts its server down when the window's process ends.
- The **Graveyard** (see [Graveyard (Rip)](#graveyard-rip)): `tests/file_manager_graveyard.test.ts` (the server, real files and a private graveyard folder, including copies "between disks" forced through a test hook, an interrupted copy, a cancelled copy, a damaged record file, 6,000-item lists, and the real `rip` 0.9.7 sharing a folder when it is installed) and `tests/file_manager_graveyard_page.test.ts` (the tab, the right-click item, the shortcut, Undo and the Delete setting in a fake browser). Both also passed as root on Linux (aarch64, in a container; the `rip` tests are skipped there). In a real browser on macOS: several files, a folder and a link were buried from the right-click menu, one was restored and one deleted for good from the tab, Undo of a restore buried it again, and each step was compared with the folder on disk and with `bun run cli:rip --seance --all`, which read the same list.
- The **Subdomains** tab (see [Subdomains (Subfinder)](#subdomains-subfinder)): `tests/file_manager_subdomains.test.ts` and `tests/file_manager_subdomains_page.test.ts` (no network: fetch, DNS, HTTP and TCP are replaced; domain-validation fuzzing, hostile source data, per-source failure isolation, cancellation, caps and rate limits on a fake clock, wildcard DNS, redirect limits, refusal of private, loopback and rebinding addresses, stand-in `subfinder` programs, CSV/Markdown safety, the history file, the HTTP operations, and the page in a fake browser). A real run against `example.com` with the page in a real browser (once, passive only) showed the page and Network-tab hand-off working; **crt.sh** answered (6 hosts) while HackerTarget (daily limit reached), AlienVault OTX (HTTP 429) and Anubis (now behind a Cloudflare check that blocks scripts) each showed their own plain error without failing the run, and the real `subfinder` 2.17.0 gave about 25,000 mostly meaningless `example.com` names in a direct trial, which the result cap handles. No active step (DNS, web or port probing) was run against a real domain; the real HTTP client was tried once each against `example.com` (status 200, title read), and against `self-signed.badssl.com` and `wrong.host.badssl.com`, two sites made for testing: with verification on both are refused as "certificate isn't trusted", with *Accept untrusted HTTPS certificates* both answer.

**Not verified:** installing for real on any system (a stand-in package manager was used), anything on Windows (winget, Scoop and `.cmd` programs) and on Linux (apt, dnf, pacman, Linuxbrew), PDF output from pandoc (no PDF engine here), HEIC and AVIF input, long videos; the terminal on **Linux** (it uses the same code, but was only run on macOS), and it cannot exist on Windows yet; vim, ssh and other full-screen programs inside the terminal; the native window on **Windows and Linux** (on macOS the terminal was checked in it); the Windows commands used to open a file (`rundll32 url.dll,FileProtocolHandler`) and *Show in Explorer* (`explorer.exe /select,`); Linux `xdg-open`; Windows drive letters and long paths. The backend tests do run in the experimental Linux/Windows CI job, but the project as a whole is not supported on Windows (see [Testing](../testing/index.md#other-platforms)). A screen reader was not used.

## Limits

- No rubber-band (drag a box) selection.
- Cut and Copy work **inside the app only**; they do not use the system clipboard, and you cannot drop files from another program onto it.
- Zip: no passwords, no ZIP64 (over 4 GB or 65,535 entries); at most 8 GB and 100,000 entries.
- A folder shows at most 50,000 items (500 are drawn at a time with a "show more" button); search and size counts have limits and say when they stop early.
- Symbolic links are copied as links and never followed when counting or searching.
- The terminal is not tied to the Recycle Bin or protected folders. Windows uses ConPTY rather than Bun's POSIX-only terminal option.
- It reads its page from `resources/file_manager/` at run time, so a single compiled executable of it (`bun build --compile`) was not tried and would need that folder beside it.
- Conversions use the helper programs' standard settings (JPG quality 90, MP4 CRF 23 and so on); there are no per-file options yet. Video conversion can take a long time and progress is per file, not per percent. PDF from documents needs a PDF engine. Batches are limited to 500 files.
- Permissions: owner and group can't be changed (that needs administrator rights); Windows access rules (ACLs) and macOS/Linux extra access rules are neither shown nor edited; the Linux immutable attribute isn't offered. Links are skipped. "Everything inside" is capped at 100,000 items and 60 seconds, and the Locked/Hidden/Read-only settings need one helper-program call per item, so a very large run with them is slow. Setting a file's tags and "Open with" a chosen program are not included.
- Zstandard: opened files are capped at 8 GiB unpacked, like gzip; `.zz` and 7-Zip-style `.zst` with dictionaries are not provided, and *List what is inside* for `.tar.zst` still needs bsdtar, 7-Zip or The Unarchiver. Fast checksums other than CRC32 and Adler-32 need the whole file in memory and stop at 256 MB. Password hashing is one job at a time (argon2 up to 1 GiB and 10 passes, bcrypt up to cost 16). *Open in your editor* can't confirm that the editor really started. *Compare data files* reads files up to 5 MB.
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
| Graveyard (Rip) | Server, all `grave/…` operations: `fmGraveyardOps.ts` (the API and the jobs), `fmGraveyard.ts` (bury, restore, empty), `fmGraveyardMove.ts` (rename, or copy-check-remove between disks), `fmGraveyardStore.ts` (reading and changing the records, queries, statistics), `fmGraveyardCheck.ts` (Verify, Repair, preview), `fmGraveyardHooks.ts` (test seams: `graveyardDir` and `graveyardHooks` in the context). They build on `applications/rip_engine.ts`, the engine Rip Studio uses. Page: `ui/graveyard.js` (the tab), `graveList.js`, `gravePreview.js`, `graveActions.js`, `graveVerify.js`, `graveBury.js` (right-click, shortcut, Delete setting), `grave.css` |
| Permissions | Server, `perms/get`, `perms/plan`, `perms/apply`, `perms/undo`, `perms/progress`, `perms/cancel`: `fmPermsOps.ts` (the API; long runs go through a job hub of their own), `fmPerms.ts` (reading, the scan that both the preview and the change use, applying, Undo), `fmPermsModel.ts` (the chmod-style text parser, mode arithmetic, which changes are risky), `fmPermsSys.ts` (the replaceable file system, program runner, user id and limits; Locked, Hidden and Read-only through `chflags`/`attrib`). Page: `ui/permsPanel.js` (the section of Properties), `ui/permsModel.js`, `ui/permsQuick.js` (right-click items), `ui/perms.css` |
| Terminal | `src/features/filemanager/fmTerminal.ts` (shells on a PTY), the `/api/terminal` WebSocket in `fmServer.ts`, `ui/terminal.js`, and the vendored library in `resources/file_manager/vendor/` (see its `README.md` for the two small changes made to it) |
| Views | `ui/workspace.js` (the view switcher, Split divider, Focus, sidebar fold; it plugs into `power.js` through `setPowerHost`), `ui/home.js` + `ui/homeTiles.js` (the Home page; other modules add tiles with `registerHomeTile()`, and every tool registered with `registerPowerTab()` gets one automatically), `ui/dual.js` (the right-hand pane's folder loading, address and buttons) with `ui/pane.js` (the "pane" shape both lists share: `list.js`, `selection.js`, `contextmenu.js`, `ops.js` and `keys.js` work on the active pane), `ui/chrome.js` (toolbar "More" menu, status-bar view buttons), `ui/views.css`; the saved keys (`workspace`, `startWith`, `splitSide`, `splitSize`, `sidebarCollapsed`, `focusMode`, `activeTool`, `splitTool`, `dualPath`) are validated in `fmSettings.ts` |
| Tests | `tests/file_manager_*.test.ts` (`file_manager_views.test.ts` runs the whole page, views included, in a fake browser) |

The window deliberately does **not** use `attachWindowShortcuts`: that shared script closes the window on a double-tap of Alt and handles F5 and zoom keys, which would conflict with this app's keys. The page asks the window to close with Ctrl/⌘+W through a bound `closeApp` function.
