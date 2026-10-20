import type { Chapter } from "./fm_tutorial_types";

/** Chapters 0 to 4: welcome, the window, getting around, how files are shown, choosing and making things. */
export const basics: Chapter[] = [
  {
    id: "00_intro", chapter: "WELCOME", title: "Welcome", kind: "card",
    card: {
      kicker: "A calm, complete MacAcademy-style tour · Apple Mac Studio M4 Ultra · Pro Display XDR 6K 120Hz",
      title: "Codecaine File Manager",
      lines: [
        "Every single button, menu, shortcut & studio explained step by step",
        "Quickbar, Command Palette (⌘⇧P), Starter Templates, Zip & Extract",
        "Terminal + files together, Image & Media Studios, Paint & 24 Games",
        "310 Themes, 194 120Hz Shaders, Process & Hardware Telemetry, and 4 Databases",
        "🍎 Recorded on Apple Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · 6K XDR 120Hz",
      ],
    },
    steps: [
      {
        cap: "Welcome · Apple Mac Studio M4 Ultra · Pro Display XDR 6K @ 120Hz ProMotion",
        say: "Welcome. In this video, we are going to take our time, and learn the Codecaine File Manager one piece at a time, in the classic MacAcademy style where every single click is shown on screen. We are recording on our flagship workstation: an Apple Mac Studio with the M4 Ultra chip, featuring a thirty-two-core C P U, an eighty-core G P U, one hundred and ninety-two gigabytes of unified memory, and an Apple Pro Display X D R six-K monitor running at one hundred and twenty Hertz ProMotion. There is no rush. We will press every button together, and I will tell you what it does before we press it. First, the basics: the window, views, folder tabs, the sidebar folder tree, color tags, the Quick-Filter Bar, the Universal Command Palette, starter file templates, and archive extraction. Then, copying, moving, Undo, Quick Look, permissions, and file encryption. Next, the terminal and your files following each other automatically. After that, every power tool, the Image and Media Studios, Paint, twenty-four arcade games, three hundred and ten themes with one hundred and ninety-four live shaders, and the four built-in database studios. Everything happens on sample files, so nothing real is touched. Pause whenever you like, and follow along at your own pace. Let's begin.",
      },
    ],
  },

  {
    id: "01_window", chapter: "THE WINDOW", title: "The window, piece by piece", blurb: "What every part of the screen is for", welcome: true,
    steps: [
      {
        cap: "The first-run welcome window",
        say: "The first time you open the app, a short welcome window appears. It explains the basics in plain words. Read it at your own pace. When you are ready, press the Start button.",
        act: async (d) => { await d.wait(1500); await d.click(".dialog button >> Start", { pause: 900 }); },
      },
      {
        cap: "The main window · Halloween Jack-O'-Lantern 6K Ultra Intro & 3D Icons Mode",
        say: "Because it is Halloween month, we are opening our tour in the Ultra Halloween Carved Jack-O'-Lantern and Witching Hour theme at one hundred and twenty Hertz. Watch what happens when we switch to Icons view for a moment: every folder is a sculpted three-D tile spinning on a one-hundred-and-twenty-Hertz turntable, wearing a bobbing Jack-O'-Lantern crest in the corner while autumn leaves, embers, and fireflies drift across the screen. Let's admire the three-D folders in Icons mode, and then switch back to Details view to tour the window bands from top to bottom: Places on the left, files in the middle, and action buttons along the top.",
        act: async (d) => {
          await d.click("#status-views button >> Icons", { pause: 600 });
          await d.row("src", "click", { pause: 900 });
          await d.hover("#list .row.is-folder", 1400);
          await d.click("#status-views button >> Details", { pause: 600 });
          await d.hover("#sidebar", 900);
          await d.hover("#list", 1000);
          await d.hover("#view-switch", 1000);
        },
      },
      {
        cap: "The view bar: Files, Home, Tools, Split, Dual",
        say: "At the very top is the view bar. It chooses how the whole window is arranged. Files is the ordinary list of files, and it is where we will spend most of our time. Home is a friendly start page that shows everything the app can do. Tools opens a panel of power tools, such as search, a code editor, and a terminal. Split keeps your files on one side and a tool on the other. And Dual shows two folders side by side, which is wonderful for copying between them.",
        act: async (d) => {
          await d.hover("#view-files", 1300); await d.hover("#view-home", 1500); await d.hover("#view-tools", 2200);
          await d.hover("#view-split", 2000); await d.hover("#view-dual", 2000);
        },
      },
      {
        cap: "Focus and the Places button",
        say: "Two more buttons live up here. The Places button on the left hides or shows the list of places, to give your files more room. And the Focus button on the right hides the toolbar and side panels completely, so you see only your files. Press it again, or press Escape, to bring everything back.",
        act: async (d) => {
          await d.hover("#sidebar-toggle", 1200);
          await d.hover("#focus-toggle", 1800);
        },
      },
      {
        cap: "The toolbar: going places",
        say: "Under the view bar is the toolbar. Each button has a small picture, and if you rest the pointer on it, a tip appears. The first four are for getting around. Back and Forward walk through the folders you have visited, like in a web browser. Up goes to the folder that contains this one. And Refresh reads the folder again, in case something changed.",
        act: async (d) => {
          for (const id of ["#tool-back", "#tool-forward", "#tool-up", "#tool-refresh"]) await d.hover(id, 1500);
        },
      },
      {
        cap: "The toolbar: making and changing things",
        say: "The next buttons make and change things. New folder and New file create something empty, right here. Cut, Copy and Paste move or duplicate your selection. Rename changes a name. Delete sends things to the Recycle Bin, where they can be brought back. And Undo takes back the last thing you did.",
        act: async (d) => {
          for (const id of ["#tool-newFolder", "#tool-newFile", "#tool-cut", "#tool-copy", "#tool-paste", "#tool-rename", "#tool-delete", "#tool-undo"]) await d.hover(id, 1100);
        },
      },
      {
        cap: "The toolbar: Activity, View, Favorites, Details, Lock, Convert",
        say: "Then come a few helpers. Activity shows a history of your copies and moves. View changes how the list looks. Favorites jumps to folders you like. Details shows a panel about the selected file. Lock protects files with a password. And Convert turns files into other formats, such as pictures into smaller pictures. We will meet each of these later in this video.",
        act: async (d) => {
          for (const id of ["#tool-activity", "#tool-view", "#tool-favorites", "#tool-info", "#tool-lock", "#tool-tools"]) await d.hover(id, 1500);
        },
      },
      {
        cap: "The address bar and the search box",
        say: "Below the toolbar is the address bar. It shows where you are as a trail of folder names. You can click any name in the trail to jump straight back to that folder. The star puts the current folder in your favorites, and the pencil lets you type a location. On the right is the search box, which looks for names inside the folder you are in.",
        act: async (d) => {
          await d.hover("#crumbs", 1800); await d.hover("#pin-folder", 1500); await d.hover("#edit-address", 1500); await d.hover("#search", 2000);
        },
      },
      {
        cap: "The places on the left",
        say: "The panel on the left lists your places. At the top are your favorites, which start out empty. Under that are the usual places, such as Home, Desktop, Documents, Downloads, and Pictures. Then your drives, with a bar showing how much space is free. And at the bottom is the Recycle Bin. Clicking any of them takes you there at once.",
        act: async (d) => {
          await d.hover("#sidebar .side-item >> Home", 1200); await d.hover("#sidebar .side-item >> Documents", 1300);
          await d.hover("#sidebar .side-item >> Downloads", 1200); await d.hover("#sidebar .side-item >> Computer", 1600); await d.hover("#sidebar .side-item >> Recycle Bin", 1600);
        },
      },
      {
        cap: "The list of files and its columns",
        say: "In the middle is the list itself. Each row is a file or a folder, with its name, the date it was last changed, its kind, and its size. The headings at the top are buttons. Click Name to sort by name, click it again to reverse the order. The same works for the date and the size.",
        act: async (d) => {
          await d.hover("#list-head", 1500);
          await d.click("#list-head >> Size", { pause: 1400 });
          await d.click("#list-head >> Name", { pause: 1400 });
        },
      },
      {
        cap: "The status bar",
        say: "And along the bottom is the status bar. On the left it tells you how many items are here, and how many you have selected. On the right are three small buttons that switch between Details, List, and Icons. Whenever the app is busy copying or moving something, a small task panel appears in the corner, and we will see that soon.",
        act: async (d) => { await d.hover("#status-left", 1800); await d.hover("#status-views", 2200); },
      },
    ],
  },

  {
    id: "02_moving", chapter: "GETTING AROUND", title: "Getting around", blurb: "Folders, the address bar, favorites and the keyboard",
    steps: [
      {
        cap: "Open a folder: double-click",
        say: "Let's move around. We are in a project folder called shop-app. To open a folder inside it, double-click its name. I will open the folder called docs.",
        act: async (d) => { await d.row("docs", "dblclick", { pause: 1500 }); },
      },
      {
        cap: "The address bar follows you",
        say: "Notice that the address bar now ends with docs. The trail shows every folder on the way here. Clicking any name in this trail jumps back to that folder. Let me click shop-app to go back.",
        act: async (d) => { await d.hover("#crumbs", 1200); await d.click("#crumbs button >> shop-app", { pause: 1400 }); },
      },
      {
        cap: "Back, Forward and Up",
        say: "The Back button returns to the folder you were just in. Forward goes the other way. And Up goes to the folder that holds this one. Let me open src, press Back, then Forward, and then Up.",
        act: async (d) => {
          await d.row("src", "dblclick", { pause: 1200 });
          await d.click("#tool-back", { pause: 1300 });
          await d.click("#tool-forward", { pause: 1300 });
          await d.click("#tool-up", { pause: 1400 });
        },
      },
      {
        cap: "The keyboard: arrows and Enter",
        say: "You can do all of this from the keyboard too. The arrow keys move the highlight up and down the list. Enter opens whatever is highlighted. Backspace goes up one folder. Try it: down, down, then Enter to open a folder, and Backspace to come back out.",
        act: async (d) => {
          await d.click("#list .row >> docs", { pause: 600 });
          await d.key("ArrowDown", "↓"); await d.wait(500); await d.key("ArrowUp", "↑"); await d.wait(500);
          await d.key("Enter", "Enter"); await d.wait(1200);
          await d.key("Backspace", "Backspace");
          await d.eval("document.getElementById('tool-up')?.click()");
          await d.wait(1200);
        },
      },
      {
        cap: "Type a few letters to jump",
        say: "Here is a small trick. Just start typing a name, and the highlight jumps to the first item that matches. If I type the letters r e a, it jumps to the readme file. It is the fastest way to find something in a long list.",
        act: async (d) => { await d.click("#list .row >> docs", { pause: 400 }); await d.type("rea", 300); await d.wait(1500); },
      },
      {
        cap: "The places on the left",
        say: "The places on the left are shortcuts. Click Documents, and you are there. Click Downloads, and you are there. They always take you straight to the same place, wherever you started.",
        act: async (d) => {
          await d.click("#sidebar .side-item >> Documents", { pause: 1800 });
          await d.click("#sidebar .side-item >> Downloads", { pause: 1800 });
        },
      },
      {
        cap: "Type a location",
        say: "If you know exactly where you want to go, click the pencil beside the address bar and type it. Folders you type can start with a tilde, which stands for your home folder. I will type tilde slash Projects, and press Enter.",
        act: async (d) => {
          await d.click("#edit-address", { pause: 600 });
          await d.type("~/Projects", 90); await d.wait(600);
          await d.key("Enter", "Enter"); await d.wait(1800);
        },
      },
      {
        cap: "Favorites: keep a folder close",
        say: "Some folders you visit every day. Open one of them, then click the star in the address bar. It is added to Favorites at the top of the places list. Click the star again, and it is removed. Let me open shop-app, and star it.",
        act: async (d) => {
          await d.row("shop-app", "dblclick", { pause: 1300 });
          await d.click("#pin-folder", { pause: 1600 });
          await d.hover("#sidebar", 1500);
        },
      },
    ],
  },

  {
    id: "03_views", chapter: "VIEWS", title: "How the list looks", blurb: "Details, list and icons; sorting; hidden files; the Details panel",
    steps: [
      {
        cap: "Three ways to show the list",
        say: "The list can look in three different ways. Details, which we have been using, shows columns. List is more compact. And Icons shows large pictures, which is lovely for photos. You can switch with the buttons at the bottom right, or press Command one, two, or three. Let's try each.",
        act: async (d) => {
          await d.click("#status-views button >> List", { pause: 2200 });
          await d.click("#status-views button >> Icons", { pause: 2600 });
          await d.click("#status-views button >> Details", { pause: 1800 });
        },
      },
      {
        cap: "The View menu",
        say: "The View button on the toolbar holds the same choices, and a few more. Here you can pick what to sort by, whether folders come first, whether to show hidden files, and whether to show the details panel. Let me open it, so you can see.",
        act: async (d) => { await d.click("#tool-view", { pause: 2800 }); await d.key("Escape", "Esc"); await d.wait(400); },
      },
      {
        cap: "Hidden files",
        say: "Some files are hidden on purpose. Their names begin with a dot, and programs use them for settings. Look at the list now: there is no dot env file. If I choose Show hidden files, it appears. You can hide them again the same way. The shortcut is Command Shift H.",
        act: async (d) => {
          await d.click("#tool-view", { pause: 700 }); await d.menu("Show hidden files", { pause: 1800 });
          await d.click("#tool-view", { pause: 700 }); await d.menu("Show hidden files", { pause: 1500 });
        },
      },
      {
        cap: "The Details panel",
        say: "The Details panel is a strip on the right that tells you about whatever is selected. Press the Details button, then click a file. You see a preview, its size, when it changed, and who may read it. For a picture, you see the picture. For a text file, you see the first lines.",
        act: async (d) => {
          await d.click("#tool-info", { pause: 1200 });
          await d.row("README.md", "click", { pause: 2200 });
          await d.row("package.json", "click", { pause: 2200 });
        },
      },
      {
        cap: "Close the Details panel",
        say: "When you have seen enough, press the Details button again to close the panel. Your choice is remembered, so the app looks the same the next time you open it.",
        act: async (d) => { await d.click("#tool-info", { pause: 1500 }); },
      },
    ],
  },

  {
    id: "04_select_create", chapter: "SELECT & CREATE", title: "Choosing files, and making new ones", blurb: "Selecting, new folders, new files and renaming",
    steps: [
      {
        cap: "Select one file",
        say: "To do anything with a file, you first choose it by clicking it. The row turns blue, and the status bar says one file is selected. Click somewhere else to choose a different one.",
        act: async (d) => { await d.row("README.md", "click", { pause: 1500 }); await d.row("package.json", "click", { pause: 1500 }); },
      },
      {
        cap: "Select several",
        say: "To choose several, hold the Command key, which is Control on Windows and Linux, and click more files. Each click adds one, or removes it if it was already chosen. To choose a whole run of files, click the first, hold Shift, and click the last.",
        act: async (d) => {
          await d.row("README.md", "click", { pause: 900 });
          await d.row("index.html", "click", { pause: 1000, extend: "ctrl" });
          await d.row("style.css", "click", { pause: 1400, extend: "ctrl" });
          await d.row("app.js", "click", { pause: 600 });
          await d.row("package.json", "click", { pause: 1600, extend: "shift" });
        },
      },
      {
        cap: "Select everything, or nothing",
        say: "Command A chooses everything in the folder. Escape chooses nothing. Watch the status bar as I do each.",
        act: async (d) => {
          await d.key("Meta+a", "⌘ A"); await d.wait(1800);
          await d.key("Escape", "Esc"); await d.wait(1500);
        },
      },
      {
        cap: "Make a new folder",
        say: "Let's make something. Press New folder. A new row appears with its name ready to edit. Type a name, such as Invoices, and press Enter. That is all. The folder exists now.",
        act: async (d) => {
          await d.click("#tool-newFolder", { pause: 1200 });
          await d.key("Meta+a", "⌘ A"); await d.type("Invoices", 110); await d.wait(500); await d.key("Enter", "Enter"); await d.wait(1600);
        },
      },
      {
        cap: "Make a new file",
        say: "New file works in the same way. Press it, type the name including the ending, such as notes dot txt, and press Enter. An empty file is created. If you pick a name that is already taken, the app tells you, and never replaces anything.",
        act: async (d) => {
          await d.click("#tool-newFile", { pause: 1200 });
          await d.key("Meta+a", "⌘ A"); await d.type("notes.txt", 110); await d.wait(500); await d.key("Enter", "Enter"); await d.wait(1600);
        },
      },
      {
        cap: "Rename: F2",
        say: "To rename something, choose it and press F2, or press the Rename button. The name becomes editable. Type the new name and press Enter. Press Escape instead, if you change your mind. I will rename notes dot txt to ideas dot txt.",
        act: async (d) => {
          await d.row("notes.txt", "click", { pause: 700 });
          await d.key("F2", "F2"); await d.wait(700);
          await d.key("Meta+a", "⌘ A"); await d.type("ideas.txt", 110); await d.wait(500); await d.key("Enter", "Enter"); await d.wait(1600);
        },
      },
      {
        cap: "Undo",
        say: "Everyone makes mistakes, so the app keeps a short history of what you did. Press the Undo button, or Command Z, and the rename is taken back. Press it again, and the new file disappears. You can undo a long chain of things this way, one step at a time.",
        act: async (d) => {
          await d.click("#tool-undo", { pause: 1800 });
          await d.click("#tool-undo", { pause: 1800 });
        },
      },
    ],
  },

  {
    id: "04b_tabs_tree_tags",
    chapter: "TABS, TREE & TAGS",
    title: "Folder tabs, the sidebar folder tree, color tags and grouping",
    blurb: "Multiple folder tabs, lazy-loaded sidebar tree, color tag filters, Group By, and Extension/Permissions columns",
    steps: [
      {
        cap: "Folder tabs: duplicate a tab, open a new tab, switch and close",
        say: "Right above the file list is the folder tab bar. Each tab keeps its own folder, selection, and Back and Forward history. Click Duplicate tab to open a second tab in the same folder, navigate into docs, or click the plus button to open another tab. Click any tab to switch folders instantly, and click the close button when you are done with it.",
        act: async (d) => {
          await d.hover("#tabbar", 1000);
          await d.click(".fm-tab-dup", { pause: 1200 });
          await d.row("docs", "dblclick", { pause: 1200 });
          await d.click(".fm-tab-add", { pause: 1100 });
          await d.click("#tabbar .fm-tab-select", { pause: 1200 });
          await d.click("#tabbar .fm-tab:not(.active) .fm-tab-close", { pause: 900 });
          await d.click("#tabbar .fm-tab:not(.active) .fm-tab-close", { pause: 900 });
        },
      },
      {
        cap: "The expandable Folder Tree in the sidebar",
        say: "In the sidebar under Places, click the arrow next to Folder tree to open an expandable directory tree. You can expand subfolders on demand, jump straight into any branch, or right-click a branch to open it in a new folder tab.",
        act: async (d) => {
          await d.scroll("#sidebar", 260, 5).catch(() => {});
          await d.click("[data-tree-toggle]", { pause: 1400 });
          await d.hover(".folder-tree", 1400);
          await d.click("[data-tree-toggle]", { pause: 900 });
        },
      },
      {
        cap: "Color tags, sidebar tag filters, Group by Kind, and Permissions column",
        say: "You can also organize files with seven color tags. Right-click README dot md and choose Tag Red, then right-click package dot json and choose Tag Blue. In the sidebar under Tags, click Red to filter the folder down to red-tagged items, then clear the filter. And in the View menu, you can group items by Kind, Date, or Size, and toggle the Extension and Permissions columns.",
        act: async (d) => {
          await d.row("README.md", "rclick", { pause: 800 });
          await d.menu("Tag: Red", { pause: 1200 });
          await d.row("package.json", "rclick", { pause: 800 });
          await d.menu("Tag: Blue", { pause: 1200 });
          await d.click('[data-tag-filter="red"]', { pause: 1500 });
          await d.click("[data-tag-clear-filter]", { pause: 1000 });
          await d.click("#tool-view", { pause: 900 });
          await d.menu("Group by: Kind", { pause: 1600 });
          await d.click("#tool-view", { pause: 900 });
          await d.menu("Column: Permissions", { pause: 1500 });
          await d.click("#tool-view", { pause: 800 });
          await d.menu("Group by: None", { pause: 900 });
        },
      },
    ],
  },

  {
    id: "04c_quickbar_palette_templates_extract",
    chapter: "QUICKBAR, PALETTE & TEMPLATES",
    title: "The Quick-Filter Bar, Command Palette, Starter Templates, Selection Bar & Archive Extraction",
    blurb: "Smart file-kind chips, live folder filter, 1-click grouping & density, Command Palette (⌘⇧P), 12 starter templates, floating selection bar, Zip & Extract",
    steps: [
      {
        cap: "Quick-Filter Bar: Smart File-Kind Chips & Live Folder Filter (⌘⌥F)",
        say: "Right below the address bar is the Quick-Filter and Productivity Bar. Along the middle are Smart File-Kind Chips with live item counts for Folders, Code, Docs, Pictures, Media, Data, and Archives. Click Code to show only source files, click Docs to show documentation, or click All to show everything again. On the left is the instant folder filter box, which you can focus anytime with Command Option F. Type a few letters to filter the current folder as you type, then click the clear button or press Escape.",
        act: async (d) => {
          await d.hover("#quickbar", 900);
          await d.click('#kind-chips [data-kind-chip="code"]', { pause: 1300 });
          await d.click('#kind-chips [data-kind-chip="document"]', { pause: 1300 });
          await d.click('#kind-chips [data-kind-chip="all"]', { pause: 1000 });
          await d.click("#quick-filter", { pause: 500 });
          await d.type("json", 110);
          await d.wait(1100);
          await d.click("#quick-filter-clear", { pause: 900 });
        },
      },
      {
        cap: "One-click Row Grouping, Row Density & Address Bar Subfolder Peek",
        say: "On the right side of the Quickbar are one-click pills for grouping and row spacing. Click Group to group files under section headers by Kind, Date, or Size, and click the density pill to switch between Compact, Comfortable, and Spacious row height. And in the address bar above, you can click any arrow between folder names to peek inside its subfolders without leaving where you are, or click the clipboard button to copy the current folder path.",
        act: async (d) => {
          await d.click("#qb-group-btn", { pause: 800 });
          await d.menu("Group by: Kind", { pause: 1300 });
          await d.click("#qb-group-btn", { pause: 800 });
          await d.menu("Group by: None", { pause: 900 });
          await d.click("#qb-density-btn", { pause: 800 });
          await d.menu("Density: Compact", { pause: 1100 });
          await d.click("#qb-density-btn", { pause: 800 });
          await d.menu("Density: Comfortable", { pause: 900 });
          await d.click("#crumbs .crumb-sep", { pause: 1200 }).catch(() => {});
          await d.key("Escape", "Esc");
          await d.wait(400);
          await d.click("#copy-address", { pause: 900 });
        },
      },
      {
        cap: "Universal Command Palette & Quick-Jump Omnibar (⌘⇧P / ⌘P)",
        say: "In the top bar, click Command, or press Command Shift P or Command P from anywhere, to open the Universal Command Palette and Quick-Jump Omnibar. It searches across every file action, favorite folder, open tab, recent file, current folder item, power tool, starter template, color tag, and theme. Click the category tabs at the top, or type a prefix such as a question mark for tools or a plus sign for templates, and press Enter to run any command immediately.",
        act: async (d) => {
          await d.click("#viewbar-palette", { pause: 1200 });
          await d.waitFor("#command-palette-input", 6000);
          await d.click('.cp-cat-btn[data-cp-cat="tools"]', { pause: 1000 });
          await d.click('.cp-cat-btn[data-cp-cat="templates"]', { pause: 1000 });
          await d.click('.cp-cat-btn[data-cp-cat="all"]', { pause: 800 });
          await d.click("#command-palette-input", { pause: 400 });
          await d.type("?sysinfo", 95);
          await d.wait(1100);
          await d.key("Escape", "Esc");
          await d.wait(600);
        },
      },
      {
        cap: "New File from Starter Template Studio (⌘⌥K)",
        say: "To create a ready-to-edit file without writing boilerplate from scratch, click the plus Template button on the Quickbar or toolbar, or press Command Option K. Choose from twelve developer templates—including Markdown, TypeScript, Python, HTML5, JSON, package dot json, Shell script, dot env, gitignore, C S V, S Q L schema, and Dockerfile. You can customize the filename and starter content right in the preview box, then click Create File. Like every file action, it supports full Command Z undo.",
        act: async (d) => {
          await d.click("#qb-template-btn", { pause: 1200 });
          await d.waitFor(".tpl-card", 6000);
          await d.click('.tpl-card[data-tpl-id="typescript"]', { pause: 1100 });
          await d.click('.tpl-card[data-tpl-id="sql"]', { pause: 1100 });
          await d.hover("#tpl-content-preview", 1000);
          await d.dialog("Create File", { pause: 1400 });
        },
      },
      {
        cap: "Context-Aware Selection Bar, Compress to .zip (⌘⇧Z) & Extract Here (⌘⇧E)",
        say: "Whenever you select one or more items, a floating Context-Aware Selection Action Bar appears at the bottom of the list. It shows how many items and bytes are selected, lets you apply or clear color tags in one click, and offers smart buttons for Quick Look, Code, SQLite Studio, Image Studio, Media Deck, Bulk Rename, Copy Path, and Delete. Click Zip, or press Command Shift Z, to compress the selected files into a conflict-free zip archive. Then select any archive—including zip, tar dot gz, seven-z, or z-standard—and click Extract, or press Command Shift E, to unpack it into its own clean folder.",
        act: async (d) => {
          await d.row("README.md", "click", { pause: 700 });
          await d.row("package.json", "click", { pause: 800, extend: "ctrl" });
          await d.hover("#selection-bar", 1000);
          await d.click('.sb-tag-btn[data-sb-tag="purple"]', { pause: 900 });
          await d.click('.sb-btn[data-sb-action="zip"]', { pause: 2200 });
          await d.click('.sb-btn[data-sb-action="extract"]', { pause: 2200 }).catch(() => {});
          await d.click('.sb-btn[data-sb-action="clear"]', { pause: 700 }).catch(() => {});
        },
      },
    ],
  },
];

