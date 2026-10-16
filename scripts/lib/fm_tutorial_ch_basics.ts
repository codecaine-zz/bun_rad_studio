import type { Chapter } from "./fm_tutorial_types";

/** Chapters 0 to 4: welcome, the window, getting around, how files are shown, choosing and making things. */
export const basics: Chapter[] = [
  {
    id: "00_intro", chapter: "WELCOME", title: "Welcome", kind: "card",
    card: { kicker: "A calm, complete tour", title: "Codecaine File Manager", lines: ["Every button explained", "Terminal + files, working together", "Image and Media Studios, presets for many files", "Every tool, themes and databases"] },
    steps: [
      {
        cap: "Welcome",
        say: "Welcome. In this video, we are going to take our time, and learn the Codecaine File Manager one piece at a time. There is no rush. We will press every button together, and I will tell you what it does before we press it. First, the basics. Browsing, copying, moving, renaming, searching and previewing your files. Then, the part that makes you really fast. The terminal and your files, following each other, so you never type a long folder path again. After that, every tool in the toolbox. The Image Studio and the Media Studio, for editing pictures, songs and videos, and presets that edit a whole folder of photos at once. Then themes you can make your own, and two complete database walkthroughs. Everything happens on a folder of sample files, so nothing real is touched. Pause whenever you like, and follow along on your own computer. Let's begin.",
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
        cap: "The main window",
        say: "Now we are looking at the main window. It is built from a few simple bands, from top to bottom. We will visit each one slowly. On the left is a list of places. In the middle is the list of files. And along the top, there are the buttons that do things.",
        act: async (d) => { await d.hover("#sidebar", 1200); await d.hover("#list", 1500); await d.hover("#view-switch", 1500); },
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
          await d.hover("#crumbs", 1800); await d.hover("#fav-star", 1500); await d.hover("#edit-address", 1500); await d.hover("#search", 2000);
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
          await d.key("Backspace", "Backspace"); await d.wait(1200);
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
          await d.click("#fav-star", { pause: 1600 });
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
];
