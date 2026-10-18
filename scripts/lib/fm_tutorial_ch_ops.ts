import { chmodSync } from "fs";
import { join } from "path";
import type { Chapter } from "./fm_tutorial_types";

/** Chapters 5 to 9: copying, the task panel, moving, deleting, and looking at files without opening them. */
export const operations: Chapter[] = [
  {
    id: "05_copy", chapter: "COPY & PASTE", title: "Copying files, and name clashes", blurb: "Copy, paste, duplicate, and what happens when a name is taken",
    path: "<HOME>/Documents",
    steps: [
      {
        cap: "Copy: choose, Copy, go there, Paste",
        say: "Copying is a three step dance. First, choose what you want to copy. Second, press Copy. Third, go to the folder where the copy should go, and press Paste. Let me copy meeting notes. I click it, press Copy, open the Desktop, go into the folder called Copies, and press Paste.",
        act: async (d) => {
          await d.row("meeting-notes.txt", "click", { pause: 900 });
          await d.click("#tool-copy", { pause: 900 });
          await d.click("#sidebar .side-item >> Desktop", { pause: 1300 });
          await d.row("Copies", "dblclick", { pause: 1300 });
          await d.click("#tool-paste", { pause: 1800 });
        },
      },
      {
        cap: "The copy is there; the original stays",
        say: "There it is. The copy appears in the new folder, and the original is still where it was. A small message in the corner confirms what happened, and offers an Undo button in case you pasted into the wrong place.",
        act: async (d) => { await d.hover("#list", 1500); await d.hover("#tool-undo", 1600); },
      },
      {
        cap: "Keyboard: Command C and Command V",
        say: "The keyboard shortcuts are the same ones you know from everywhere else. Command C copies, and Command X cuts, which means move. Command V pastes. On Windows and Linux, use Control instead of Command.",
        act: async (d) => {
          await d.click("#sidebar .side-item >> Documents", { pause: 1200 });
          await d.row("quarterly-report.md", "click", { pause: 800 });
          await d.key("Meta+c", "⌘ C"); await d.wait(900);
          await d.click("#sidebar .side-item >> Desktop", { pause: 1200 });
          await d.row("Copies", "dblclick", { pause: 1200 });
          await d.key("Meta+v", "⌘ V"); await d.wait(1800);
        },
      },
      {
        cap: "Duplicate: a copy beside the original",
        say: "Sometimes you want a copy right beside the original, in the same folder. That is what Duplicate does. Right-click a file, choose Duplicate, and a second file appears, with the word copy added to its name.",
        act: async (d) => {
          await d.rclick("#list .row >> quarterly-report.md", { pause: 900 });
          await d.menu("Duplicate", { pause: 1800 });
        },
      },
      {
        cap: "When the name is already taken",
        say: "Now for the important part. What if the place you are pasting into already has a file with the same name? The app never overwrites anything silently. Instead it stops, and asks. Watch. In Documents there is a file called budget dot csv. The Backup folder on the Desktop already has a different file with that very name. I will copy it there.",
        act: async (d) => {
          await d.click("#sidebar .side-item >> Documents", { pause: 1200 });
          await d.row("budget.csv", "click", { pause: 800 });
          await d.key("Meta+c", "⌘ C"); await d.wait(700);
          await d.click("#sidebar .side-item >> Desktop", { pause: 1200 });
          await d.row("Backup", "dblclick", { pause: 1200 });
          await d.key("Meta+v", "⌘ V"); await d.wait(1200);
        },
      },
      {
        cap: "Keep both, Replace, Skip, or Cancel",
        say: "A window appears with your choices. Keep both is the safe default. It keeps the old file, and gives the new one a number, so nothing is lost. Replace puts the old file in the Recycle Bin first, so even that can be undone. Skip leaves the old file alone, and does not copy this one. And Cancel stops everything. I will choose Keep both.",
        act: async (d) => { await d.hover(".dialog", 2500); await d.dialog("Keep both", { pause: 2200 }); },
      },
      {
        cap: "Both files are there",
        say: "Look at the list. The original budget file is untouched, and the new one is named budget, space, two, in brackets. The app also checks again at the very last moment. If a name appears after you pressed Paste, it is still never overwritten.",
        act: async (d) => { await d.hover("#list .row >> budget.csv", 1500); await d.hover("#list .row >> budget (2).csv", 1800); },
      },
    ],
  },

  {
    id: "06_queue", chapter: "THE TASK PANEL", title: "Big jobs: progress, Cancel, Retry and Activity", blurb: "Copying runs in the background; failures are never lost",
    path: "<HOME>/Documents",
    setup: (w) => {
      w.put("Documents/Trip/locked-note.txt", "A file this account may not read.\n");
      chmodSync(join(w.home, "Documents", "Trip", "locked-note.txt"), 0o000);
    },
    steps: [
      {
        cap: "Copying runs in the background",
        say: "Copying a few small files takes a blink. But copying a big folder, or a huge video, can take a while. So the File Manager does that work in the background, and shows it in a small task panel in the corner. You can keep browsing while it works. Let me copy the Trip folder, and the meeting notes, to the Copies folder.",
        act: async (d) => {
          await d.row("Trip", "click", { pause: 700 });
          await d.row("meeting-notes.txt", "click", { pause: 800, extend: "ctrl" });
          await d.key("Meta+c", "⌘ C"); await d.wait(700);
          await d.click("#sidebar .side-item >> Desktop", { pause: 1200 });
          await d.row("Copies", "dblclick", { pause: 1200 });
          await d.key("Meta+v", "⌘ V"); await d.wait(2200);
        },
      },
      {
        cap: "A failure is shown, never hidden",
        say: "Look at the task panel. One of the two items worked. The other one did not, and the panel says exactly which one, and why. This folder contains a file that this account is not allowed to read. The app does not pretend that all went well, and it does not leave a half finished copy behind. Each item is all or nothing.",
        act: async (d) => { await d.hover("#tasks", 2500); await d.hover("#tasks .task-problems", 3000); },
      },
      {
        cap: "Fix the problem, then Retry unfinished",
        say: "Now I fix the cause. Behind the scenes, I give myself permission to read that file, the way you would in the permissions window, or the terminal. Then I press Retry unfinished. Only the item that failed is tried again. The one that already worked is not copied a second time.",
        act: async (d) => {
          chmodSync(join(d.world.home, "Documents", "Trip", "locked-note.txt"), 0o644);
          await d.wait(1200);
          await d.click("#tasks .task-retry", { pause: 2600 });
        },
      },
      {
        cap: "Both items are now copied",
        say: "This time it worked. The task panel says so, and the Trip folder is in the Copies folder, together with the meeting notes. When you are done reading a message, press Dismiss to clear it away.",
        act: async (d) => { await d.hover("#list", 1500); await d.click("#tasks .task-dismiss", { pause: 1200 }); },
      },
      {
        cap: "A huge file, and the Cancel button",
        say: "Now a really big file. This holiday video is twelve gigabytes. I will copy it to the Archive folder. The panel shows how much has been copied, out of the total, and a bar that fills as it goes. If you change your mind, press Cancel.",
        act: async (d) => {
          await d.click("#sidebar .side-item >> Downloads", { pause: 1300 });
          await d.row("holiday-video.mov", "click", { pause: 800 });
          await d.key("Meta+c", "⌘ C"); await d.wait(700);
          await d.click("#sidebar .side-item >> Desktop", { pause: 1200 });
          await d.row("Archive", "dblclick", { pause: 1200 });
        },
      },
      {
        cap: "Cancel removes the half-made copy",
        say: "I press Cancel. The app stops at once, and removes the part of the copy it had made, so you are not left with a broken, half sized file. The panel tells you what was finished and what was not. Nothing of that file was kept. The original video is, of course, untouched.",
        act: async (d) => {
          // The paste happens here, not in the step before: a fast disk finishes a copy during a long explanation.
          await d.key("Meta+v", "⌘ V"); await d.wait(900);
          await d.hover("#tasks", 1600);
          await d.click("#tasks .task-cancel", { pause: 2000 });
          await d.hover("#tasks", 2500);
        },
      },
      {
        cap: "Activity: the history of copies and moves",
        say: "The Activity button on the toolbar opens a history of your copies, moves, and renames. It lists what finished, what failed, and what was canceled, with the full paths. It is kept between sessions, and it contains only names and results, never the contents of your files. Press Close when you are done.",
        act: async (d) => {
          await d.click("#tool-activity", { pause: 3500 });
          await d.hover(".dialog", 2500);
          await d.dialog("Close", { pause: 900 });
        },
      },
    ],
  },

  {
    id: "07_move", chapter: "MOVING", title: "Moving files: cut, drag, and two panes", blurb: "Cut and paste, dragging, the Dual view and F5 / F6",
    path: "<HOME>/Documents",
    steps: [
      {
        cap: "Cut and Paste moves a file",
        say: "Moving is just like copying, except that the original goes away. Choose the file, press Cut, go to the new folder, and press Paste. I will move the budget file into the Archive folder on the Desktop.",
        act: async (d) => {
          await d.row("budget.csv", "click", { pause: 800 });
          await d.click("#tool-cut", { pause: 900 });
          await d.click("#sidebar .side-item >> Desktop", { pause: 1200 });
          await d.row("Archive", "dblclick", { pause: 1200 });
          await d.click("#tool-paste", { pause: 1800 });
        },
      },
      {
        cap: "Dragging works too",
        say: "You can also simply drag. Drag a file onto a folder, and it moves there. Hold the Option key, or Control on Windows, while you drop it, and it is copied instead. Drag a file onto an item in the places list, and it goes there too. Dragging is quick, but the buttons are clearer. Use whichever you prefer.",
        act: async (d) => {
          await d.click("#sidebar .side-item >> Documents", { pause: 1200 });
          await d.hover("#list .row >> meeting-notes.txt", 1400);
          await d.hover("#list .row >> Trip", 1500);
        },
      },
      {
        cap: "The Dual view: two folders side by side",
        say: "For serious copying, there is the Dual view. It shows two folders side by side. Press Dual at the top. The left side is where you were, and on the right you can open any other folder. Click a folder in the right hand list to open it.",
        act: async (d) => {
          await d.click("#view-dual", { pause: 1800 });
          await d.hover("#dual-pane", 1500);
        },
      },
      {
        cap: "F5 copies, F6 moves",
        say: "In the Dual view, the function keys do the work. Choose a file on the left, and press F5 to copy it to the folder on the right. Press F6 to move it. Tab switches between the two sides. It is the quickest way to tidy up, once you get used to it.",
        act: async (d) => {
          await d.row("meeting-notes.txt", "click", { pause: 900 });
          await d.key("F5", "F5"); await d.wait(1800);
        },
      },
      {
        cap: "Undo a move",
        say: "And remember, everything we just did can be undone. Press Undo, and the last copy is taken back. The undo button remembers a long chain of steps, so you can walk backwards, one action at a time.",
        act: async (d) => {
          await d.click("#view-files", { pause: 1400 });
          await d.click("#tool-undo", { pause: 1800 });
        },
      },
    ],
  },

  {
    id: "08_delete", chapter: "DELETING", title: "Deleting safely: the Recycle Bin", blurb: "Delete, restore, delete forever, and emptying the bin",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "Delete sends files to the Recycle Bin",
        say: "Deleting is gentle here. When you press Delete, the file is not destroyed. It moves into the app's own Recycle Bin, where it waits. Let me delete the old draft folder. I choose it, and press the Delete button.",
        act: async (d) => {
          await d.row("to-delete", "click", { pause: 900 });
          await d.click("#tool-delete", { pause: 1800 });
        },
      },
      {
        cap: "Open the Recycle Bin",
        say: "The folder is gone from the list. To find it again, click the Recycle Bin at the bottom of the places list. Everything you deleted is here, with the date, and where it came from.",
        act: async (d) => { await d.click("#sidebar .side-item >> Recycle Bin", { pause: 2500 }); },
      },
      {
        cap: "Restore puts it back where it was",
        say: "Choose the item, and press Restore. It goes back to exactly the place it came from. If something with the same name is there now, the restored one gets a number, so nothing is overwritten.",
        act: async (d) => {
          await d.row("to-delete", "click", { pause: 900 });
          await d.click("#tool-restore", { pause: 2200 });
        },
      },
      {
        cap: "Delete forever, and Empty bin",
        say: "To really get rid of something, delete it while you are inside the Recycle Bin, and choose Delete forever. The app always asks first, because this one cannot be undone. The Empty bin button clears the whole bin, and asks as well. Shift Delete deletes forever straight from any folder, with the same question.",
        act: async (d) => {
          await d.click("#tool-back", { pause: 1200 });
          await d.row("to-delete", "click", { pause: 900 });
          await d.click("#tool-delete", { pause: 1400 });
          await d.click("#sidebar .side-item >> Recycle Bin", { pause: 1600 });
          await d.row("to-delete", "click", { pause: 900 });
          await d.click("#tool-deleteForever", { pause: 2200 });
          await d.hover(".dialog", 2500);
          await d.dialog("Cancel", { pause: 1000 });
        },
      },
      {
        cap: "Protected folders can't be deleted",
        say: "One more safety net. Folders that your computer needs, such as your home folder, or the system folders, are protected. The app refuses to delete or move them, however hard you try. So a slip of the finger cannot break your computer.",
        act: async (d) => { await d.click("#sidebar .side-item >> Home", { pause: 2000 }); },
      },
    ],
  },

  {
    id: "09_quicklook", chapter: "PREVIEW & CLIPBOARD", title: "Look without opening: Quick Look and copy to clipboard", blurb: "Space to preview pictures, sound, video, text and documents",
    path: "<HOME>/Documents/Trip",
    steps: [
      {
        cap: "Press Space to look at a file",
        say: "Here is one of my favorite features. You do not have to open a file to see what it is. Just choose it, and press the Space bar. A window appears with the file inside. I will choose the first photo, and press Space.",
        act: async (d) => {
          await d.row("IMG_0001.jpg", "click", { pause: 900 });
          await d.key(" ", "Space"); await d.wait(2500);
        },
      },
      {
        cap: "Arrow keys flip through the folder",
        say: "While the preview is open, the arrow keys move to the next file, or the one before. It is like flipping through a photo album. The counter at the top says where you are. The file that is highlighted in the list follows along, so when you close the preview, you are right where you stopped.",
        act: async (d) => {
          for (const k of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowLeft"]) { await d.key(k, k === "ArrowRight" ? "→" : "←"); await d.wait(1500); }
        },
      },
      {
        cap: "Text files, too",
        say: "It works for text. Move to the itinerary, and you can read it right there. Large files show their beginning. Tables, such as comma separated files, are drawn as proper tables. Source code shows as plain text.",
        act: async (d) => { await d.key("End", "End"); await d.wait(600); await d.key("ArrowLeft", "←"); await d.wait(2800); },
      },
      {
        cap: "Copy picture, Copy text, Open, Close",
        say: "The buttons at the top of the preview do useful things. Copy picture, or Copy text, puts the picture, or the words, on your clipboard, ready to paste into a chat or a document. Open opens the file in its own program. And Close, or pressing Space or Escape again, closes the preview.",
        act: async (d) => { await d.hover(".ql-head", 2500); },
      },
      {
        cap: "Close with Space or Escape",
        say: "Press Space again, and the preview closes. Sound files and videos can be previewed in the same way, and they start playing at once. On a Mac, even documents such as PDFs and Word files show as a picture of their first page.",
        act: async (d) => { await d.key(" ", "Space"); await d.wait(1200); },
      },
      {
        cap: "Right-click: Quick Look and Copy image",
        say: "The same things are in the right-click menu. Right-click a picture, and you will see Quick Look, and also Copy image to clipboard, which puts the picture itself on the clipboard. For a text file, the menu offers Copy text to clipboard instead. The ordinary Copy button copies the file, for pasting into a folder. These two copy what is inside.",
        act: async (d) => {
          await d.rclick("#list .row >> IMG_0003.jpg", { pause: 3500 });
          await d.key("Escape", "Esc"); await d.wait(700);
          await d.rclick("#list .row >> itinerary.txt", { pause: 3500 });
          await d.key("Escape", "Esc"); await d.wait(700);
        },
      },
    ],
  },
];

export const HOME_PLACEHOLDER = "<HOME>";
