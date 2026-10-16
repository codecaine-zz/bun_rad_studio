import type { Chapter } from "./fm_tutorial_types";

/** Chapters 10 to 15: converting, finding, the review window, comparing folders, projects and saved actions. */
export const toolsAndSafety: Chapter[] = [
  {
    id: "10_convert", chapter: "CONVERT", title: "Convert and process files", blurb: "Pictures, video, sound and documents, in batches",
    path: "<HOME>/Documents/Trip",
    steps: [
      {
        cap: "Select three photos",
        say: "The File Manager can convert files for you, in batches, without any other program to learn. I will make small web pictures from three holiday photos. First, I choose the photos. I click the first one, then hold Shift and click the third, to choose all three.",
        act: async (d) => { await d.row("IMG_0001", "click", { pause: 800 }); await d.row("IMG_0003", "click", { extend: "shift", pause: 900 }); },
      },
      {
        cap: "Open Convert & process",
        say: "Now I press the Convert button in the toolbar. A window opens that lists everything that can be done with these particular files. It only shows what makes sense for pictures. For other kinds of files, you would see other choices.",
        act: async (d) => { await d.click("#tool-tools", { pause: 1500 }); await d.waitFor(".dialog", 6000); await d.hover(".dialog", 1800); },
      },
      {
        cap: "Pick a conversion, set its options",
        say: "I will search for web. Then I choose Make a web sized picture. Below it, the choices for this conversion appear, such as the format and the size. Everything has a plain sentence under it that explains what it does. The defaults are sensible, so I keep them.",
        act: async (d) => {
          await d.click("#cv-search", { pause: 500 });
          await d.type("web", 120);
          await d.wait(900);
          await d.click(".cv-main >> web-sized", { pause: 1400 });
          await d.hover(".dialog", 1800);
        },
      },
      {
        cap: "Start: it runs in the task panel",
        say: "I press the start button. The window closes, and the work continues in the task panel at the bottom. You can keep browsing while it runs, or even start another job. When it is done, the new pictures appear in the same folder, and the originals are never changed.",
        act: async (d) => { await d.click(".dialog .btn.primary", { pause: 1500 }); await d.waitFor("#tasks .task", 8000).catch(() => {}); await d.wait(3500); },
      },
      {
        cap: "The new files, beside the originals",
        say: "Here they are. Each new file has the word web in its name, so you can tell the copies from the originals. If a helper program is missing, the window offers to install it for you with one click.",
        act: async (d) => { await d.hover("#list", 1800); },
      },
    ],
  },

  {
    id: "11_find", chapter: "FIND", title: "Find files, and rename the matches", blurb: "Search a whole folder tree, then act on the results",
    path: "<HOME>/Documents",
    view: "#view-tools",
    steps: [
      {
        cap: "Open the Find tool",
        say: "The Tools view has a tab for every tool. Let me open Find. It searches a whole folder and everything inside it. The folder box already has the folder I was looking at.",
        act: async (d) => { await d.click("#power-tab-find", { pause: 1500 }); await d.hover("#power-body", 1800); },
      },
      {
        cap: "Type what to look for",
        say: "I type part of a name. I will look for I M G, which is how my camera named the photos, and I press Find.",
        act: async (d) => {
          await d.click(".find-input[aria-label='What to look for']", { pause: 500 });
          await d.type("IMG_", 120);
          await d.click("#power-body .pw-btn.primary", { pause: 1800 });
          await d.waitFor(".pw-table tbody tr", 8000).catch(() => {});
        },
      },
      {
        cap: "Results you can sort and select",
        say: "The matches appear in a table. You can sort by any column, filter them, and click one to see its details. Every result is a real file, and the buttons below act on the ones you choose.",
        act: async (d) => { await d.hover(".pw-table", 1800); await d.hover(".find-actions, .pw-card >> Act on", 1200).catch(() => {}); },
      },
      {
        cap: "Rename all the matches, with a preview",
        say: "Scrolling down, there is a card called Rename all the matches. I type I M G underscore in Find, and Rome underscore in Replace with. First I press Preview, which shows what every name would become, and changes nothing.",
        act: async (d) => {
          await d.scroll("#power-body", 700, 6);
          await d.click(".find-input[aria-label='Find']", { pause: 500 });
          await d.type("IMG_", 110);
          await d.click(".find-input[aria-label='Replace with']", { pause: 500 });
          await d.type("Rome_", 110);
          await d.click("#power-body .pw-btn >> Preview the new names", { pause: 1800 });
        },
      },
      {
        cap: "The review window",
        say: "Now I press Rename them. Before anything changes, a review window opens. We will study it properly in the next chapter. For now, notice that nothing has happened yet. I will close it.",
        act: async (d) => {
          await d.click("#power-body .pw-btn >> Rename them", { pause: 1800 });
          await d.waitFor(".dialog .plan-summary", 6000);
          await d.hover(".dialog", 2200);
          await d.dialog("Cancel", { pause: 900 });
        },
      },
    ],
  },

  {
    id: "12_review", chapter: "SAFETY", title: "Review before anything changes", blurb: "Plans, approvals, and the ways back that really exist",
    path: "<HOME>/Documents/Trip",
    steps: [
      {
        cap: "Rename several files at once",
        say: "Whenever you change many files at once, or delete for good, the File Manager shows you a plan first. Let me rename the eight photos together. I choose them all with Command A, and press F2.",
        act: async (d) => { await d.row("IMG_0001", "click", { pause: 700 }); await d.key("Meta+a", "⌘ A"); await d.wait(700); await d.key("F2", "F2"); await d.waitFor(".dialog", 6000); },
      },
      {
        cap: "Replace text in the names",
        say: "A dialog lets me choose how. I will replace text. Find I M G underscore, and replace it with Holiday underscore. The table shows every new name before I commit to anything.",
        act: async (d) => {
          await d.click(".dialog .field >> Find", { pause: 500 });
          await d.type("IMG_", 110);
          await d.click(".dialog .field >> Replace with", { pause: 500 });
          await d.type("Holiday_", 110);
          await d.hover(".bulk-table", 2200);
        },
      },
      {
        cap: "Review: summary, each item, recovery",
        say: "When I press Rename, one more window appears: Review before anything changes. At the top is a summary with counts. Below that, a section called If you change your mind says which ways back really exist for this operation. Undo is available. The Recycle Bin is not, because nothing here is deleted. No backup is made, and nothing goes to the Graveyard. It never promises a recovery it cannot give.",
        act: async (d) => { await d.click(".dialog .btn.primary", { pause: 1600 }); await d.waitFor(".dialog .plan-summary", 6000); await d.hover(".plan-summary", 2000); await d.hover(".plan-recovery", 3500); },
      },
      {
        cap: "Every change, one by one",
        say: "The list shows every change, with the old name and the new one. You can show only what will change, only what is skipped, or only items with a warning. Each row has a checkbox, so you can leave out any single file. Items with a problem are never hidden. They stay in the list, with the reason.",
        act: async (d) => { await d.hover(".plan-items", 2500); await d.hover(".plan-filter select", 1500); },
      },
      {
        cap: "Apply, then Undo",
        say: "I press Apply. The renames run in the task panel. And a message offers Undo. If I press it, every file goes back to its old name, as long as I have not changed them since.",
        act: async (d) => {
          await d.click(".modal-backdrop:last-child .btn.primary", { pause: 2200 });
          await d.waitFor(".toast .toast-action", 8000);
          await d.hover(".toast", 2200);
          await d.click(".toast .toast-action", { pause: 2200 });
        },
      },
      {
        cap: "Deleting for good needs two confirmations",
        say: "Deleting for good works the same way, but stricter. I choose a file and press Shift and Delete. The review window opens again. This time Undo says it is not available, because the file is deleted for good. And the Apply button stays off until I tick two boxes, one to approve the change, and one to confirm that it cannot be brought back. I will cancel. Normal Delete only moves things to the Recycle Bin.",
        act: async (d) => {
          await d.row("itinerary.txt", "click", { pause: 800 });
          await d.key("Shift+Delete", "⇧ Delete");
          await d.waitFor(".dialog .plan-summary", 6000);
          await d.hover(".plan-recovery", 3500);
          await d.click("#plan-approve", { pause: 900 });
          await d.click("#plan-permanent", { pause: 1200 });
          await d.dialog("Cancel", { pause: 900 });
        },
      },
    ],
  },

  {
    id: "13_compare", chapter: "COMPARE", title: "Compare two folders", blurb: "See the differences, and copy the ones you choose",
    path: "<HOME>/Desktop",
    view: "#view-tools",
    setup: (w) => {
      w.put("Desktop/Site-v1/index.html", "<h1>Home</h1>\n");
      w.put("Desktop/Site-v1/about.html", "<h1>About us</h1>\n");
      w.put("Desktop/Site-v1/old-notes.txt", "to delete someday\n");
      w.put("Desktop/Site-v1/css/site.css", "body { margin: 0 }\n");
      w.put("Desktop/Site-v2/index.html", "<h1>Home, new design</h1>\n");
      w.put("Desktop/Site-v2/about.html", "<h1>About us</h1>\n");
      w.put("Desktop/Site-v2/contact.html", "<h1>Contact</h1>\n");
      w.put("Desktop/Site-v2/css/site.css", "body { margin: 0 }\n");
    },
    steps: [
      {
        cap: "Pick a left and a right folder",
        say: "Compare shows what is different between two folders. Maybe an old version of a website, and a new one. I open the Compare tab, and type the left folder, Site version one, and the right folder, Site version two.",
        act: async (d) => {
          await d.click("#power-tab-compare", { pause: 1400 });
          await d.click("#compare-left", { pause: 500 });
          await d.eval(`document.querySelector('#compare-left').select()`);
          await d.type(`${d.world.home}/Desktop/Site-v1`, 35);
          await d.click("#compare-right", { pause: 500 });
          await d.eval(`document.querySelector('#compare-right').select()`);
          await d.type(`${d.world.home}/Desktop/Site-v2`, 35);
        },
      },
      {
        cap: "Ignore rules and how carefully",
        say: "The ignore box works like a git ignore file. Things like node modules and dot git are already left out. And How carefully chooses between a quick check, which compares size and date, and a verified check, which reads every file.",
        act: async (d) => { await d.hover(".compare-ignore", 1800); await d.hover(".compare-pane select", 1800); },
      },
      {
        cap: "Compare: five groups",
        say: "I press Compare. The result is sorted into five groups. Only on the left. Only on the right. Different. Identical. And Cannot compare, for things that could not be read. Each row shows the path, the size and date on each side, and a sentence about what was found.",
        act: async (d) => { await d.click(".compare-pane .pw-btn.primary", { pause: 1500 }); await d.waitFor(".compare-table tbody tr", 8000); await d.hover(".compare-chips", 2500); await d.hover(".compare-table", 2500); },
      },
      {
        cap: "Quick is honest: 'not verified'",
        say: "Notice the note above the table. Files that have the same size and date are listed as identical, but marked not verified, because their contents were not read. The app never claims a file is identical from size and date alone. Verify them now reads the files and settles it.",
        act: async (d) => { await d.hover(".compare-note", 2500); await d.click(".compare-note button", { pause: 2500 }).catch(() => {}); await d.waitFor(".compare-table tbody tr", 8000); },
      },
      {
        cap: "Choose differences to copy",
        say: "Now I choose what to copy. I tick the file that is only on the left, and the one that is different. The direction says copy to the right. A tick box is greyed out when a row cannot be copied that way, for example something that only exists on the other side.",
        act: async (d) => {
          await d.click(".compare-chips button >> Only on the left", { pause: 1200 });
          await d.click(".compare-table tbody tr input[type=checkbox]", { pause: 900 });
          await d.click(".compare-chips button >> All", { pause: 1000 });
        },
      },
      {
        cap: "Preview, approve, copy. Nothing is deleted",
        say: "I press Copy the selected. It opens the same review window as before. It lists exactly what will be created in the right folder. Nothing is ever deleted from either side. There is no two way sync, and no mirror mode, on purpose. I press Apply.",
        act: async (d) => { await d.click(".compare-actions .pw-btn.primary", { pause: 1800 }); await d.waitFor(".dialog .plan-summary", 6000); await d.hover(".plan-items", 2500); await d.click(".dialog .btn.primary", { pause: 2000 }); await d.wait(2000); },
      },
    ],
  },

  {
    id: "14_projects", chapter: "PROJECTS", title: "Projects: get back to where you were", blurb: "Folders, tools and favorite commands in one click",
    path: "<HOME>/Projects/shop-app",
    view: "#view-tools",
    steps: [
      {
        cap: "Open the Projects tab",
        say: "A project remembers your set up for one piece of work. Which folders, which tool, your search settings, your ignore rules, favorite commands, and which database connections you use. Let me save the shop app as a project.",
        act: async (d) => { await d.click("#power-tab-projects", { pause: 1600 }); await d.hover("#power-body", 1500); },
      },
      {
        cap: "Save the current layout",
        say: "I press Save the current layout as a project, and give it a name.",
        act: async (d) => {
          await d.click("#power-body .pw-btn.primary", { pause: 1400 });
          await d.waitFor(".dialog .text-input", 6000);
          await d.type("Shop app", 110);
          await d.dialog("Continue", { pause: 1600 });
        },
      },
      {
        cap: "Folders, tool, ignore rules, commands",
        say: "The next screen has everything. The project folders. The folders to open. The view and tool. Ignore rules. And favorite commands. I will add one, called Run the tests, with the command bun test. Commands are never run by themselves. And if I type a password or a token into a command, the app refuses to save it.",
        act: async (d) => {
          await d.click(".dialog .btn >> Add a command", { pause: 900 });
          await d.click(".proj-cmd input[aria-label='Name of command 1']", { pause: 500 });
          await d.type("Run the tests", 100);
          await d.click(".proj-cmd input[aria-label^='Command 1']", { pause: 500 });
          await d.type("bun test", 110);
          await d.hover(".dialog", 2000);
        },
      },
      {
        cap: "Database connections: names only",
        say: "At the bottom, database connections. Only the name of a connection is saved. The password stays in the system keychain, where the Databases tool already keeps it. I press Save project.",
        act: async (d) => { await d.scroll(".dialog", 900, 6); await d.hover(".proj-dbs", 1800); await d.click(".dialog .btn.primary", { pause: 2200 }); },
      },
      {
        cap: "Open it, and see the details",
        say: "Now the project is in the list. Open takes me back to its folders, view and tool. Details shows what is still there. A folder that moved, or a connection that was deleted, is listed as missing, and everything else still opens. The command can be typed into the terminal for me, but it is never run until I press Enter.",
        act: async (d) => { await d.click(".proj-card .pw-btn >> Details", { pause: 1800 }); await d.hover(".proj-detail", 3000); await d.click(".proj-card .pw-btn >> Open", { pause: 2000 }); },
      },
    ],
  },

  {
    id: "15_actions", chapter: "ACTIONS", title: "Actions: saved recipes", blurb: "Run the same steps again and again, safely",
    path: "<HOME>/Documents",
    view: "#view-tools",
    setup: (w) => { w.put("Documents/people.csv", "name,city\nAda,London\nLinus,Helsinki\n"); w.put("Documents/prices.csv", "item,price\nTea,3\nCoffee,4\n"); },
    steps: [
      {
        cap: "A recipe of conversion steps",
        say: "An action is a saved recipe. The same steps, on any files you choose, whenever you like. There are three ready made ones. One of them prepares pictures for a website, by making smaller copies, turning them into web p, and putting them in a folder called optimized. Every action says that your original files are never changed.",
        act: async (d) => { await d.click("#power-tab-actions", { pause: 1600 }); await d.hover(".act-cards", 3500); },
      },
      {
        cap: "Select files, then choose the action",
        say: "I will use the one that turns data files into Y A M L. First I go back to my files and select the two spreadsheets. Then I press Choose files and run.",
        act: async (d) => {
          await d.click("#view-files", { pause: 1200 });
          await d.row("people.csv", "click", { pause: 700 });
          await d.row("prices.csv", "click", { extend: "ctrl", pause: 800 });
          await d.click("#view-tools", { pause: 1200 });
          await d.click(".act-card:nth-child(2) .pw-btn.primary", { pause: 1500 });
        },
      },
      {
        cap: "Checked before anything runs",
        say: "Press Use the selected files. The action checks everything first. The files. The settings. And the helper programs that every step needs. If something is missing, it says which step, and why, and the Run button stays off.",
        act: async (d) => { await d.click(".act-panel .pw-btn >> Use the selected files", { pause: 1800 }); await d.waitFor(".act-check .pw-ok", 6000); await d.hover(".act-check", 3000); },
      },
      {
        cap: "Run: steps, results, no overwriting",
        say: "I press Run the action. Each step runs in the task queue, using the same programs as Convert and process. The results are copied into the output folder only after every step has worked. If a step fails, the message names the step and the files, and nothing is written. And a name that is already taken never gets overwritten.",
        act: async (d) => { await d.click(".act-panel .pw-btn >> Run the action", { pause: 1500 }); await d.waitFor(".act-run .pw-ok", 15000); await d.hover(".act-run", 2500); },
      },
      {
        cap: "Make your own",
        say: "You can make your own too. New action lets you name it, say which file types it takes, add steps from the list of conversions, change their settings, and tick Ask me each time for any setting you want to be asked about. You can also run actions from a terminal, with bun run files actions.",
        act: async (d) => { await d.click("#power-body .pw-btn >> New action", { pause: 2200 }); await d.hover(".dialog", 3000); await d.dialog("Cancel", { pause: 800 }); },
      },
    ],
  },
];
