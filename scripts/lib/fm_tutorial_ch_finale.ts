import type { Chapter } from "./fm_tutorial_types";

/** Chapters 16 to 19: QR codes, the code editor, your own look and feel, and the goodbye. */
export const finale: Chapter[] = [
  {
    id: "16_qr", chapter: "QR CODES", title: "Make and read QR codes", blurb: "Links, Wi-Fi, contacts, and reading a code from a picture",
    path: "<HOME>/Documents",
    view: "#view-tools",
    steps: [
      {
        cap: "Open the QR tab",
        say: "The QR tab makes and reads QR codes, with nothing to install and nothing sent over the internet. I open it, and there is a text box. I type a web address.",
        act: async (d) => { await d.click("#power-tab-qr", { pause: 1600 }); await d.click("#qr-text-text", { pause: 600 }); await d.type("https://github.com/codecaine-zz/bun_rad_studio", 55); await d.wait(900); },
      },
      {
        cap: "A live code, checked by reading it back",
        say: "The code appears as I type. Underneath, the app says which version of the code it made, and it reads its own picture back to check that a scanner would see exactly what I typed. That is a real check, not a promise.",
        act: async (d) => { await d.hover(".qr-facts", 2200); await d.hover(".qr-check", 2200); },
      },
      {
        cap: "Wi-Fi, contacts and more",
        say: "The drop down lets you make other kinds. Wi-Fi sign in, a contact card, an email, a phone number, a calendar event, and more. The Wi-Fi password is hidden while you type, and a very short one is explained rather than accepted.",
        act: async (d) => { await d.eval(`(() => { const s = document.querySelector('.qr-left select'); s.value = 'wifi'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await d.wait(1800); await d.hover(".qr-left", 2200); },
      },
      {
        cap: "Save, copy, and read a code",
        say: "Save puts the picture in the folder you are looking at. Copy puts it on the clipboard. And on the Read tab, you can drop a picture, or a screenshot of a code, and the app decodes it. You can also right click any picture in your files, and choose Read QR code.",
        act: async (d) => { await d.click(".qr-tab >> Read a QR code", { pause: 1500 }); await d.hover(".qr-drop", 2500); },
      },
    ],
  },

  {
    id: "17_code", chapter: "CODE EDITOR", title: "The built-in code editor, and text conversions", blurb: "Open any text file, undo with the keyboard, and change text in one click",
    path: "<HOME>/Documents/Trip",
    steps: [
      {
        cap: "Text files open in the editor",
        say: "Double click a text file, and it opens in the built in editor. Plain text files with no extension, like a license file, open here too, instead of launching another program. There is a setting if you prefer a different editor.",
        act: async (d) => { await d.row("itinerary.txt", "dblclick", { pause: 2200 }); await d.waitFor(".code-root, .code-editor", 8000); await d.hover(".code-root", 1800); },
      },
      {
        cap: "Convert text: about seventy conversions",
        say: "The Convert button turns the selected text, or the whole file, into something else. Upper case, lower case, title case, snake case, camel case, sorting lines, removing duplicate lines, encoding and decoding, and many more. There is a search box to find the one you want. And there is a conversion that removes accents, turning the letter e with an accent into a plain e.",
        act: async (d) => { await d.click("#power-body button >> Convert", { pause: 1600 }); await d.waitFor(".dialog", 6000); await d.hover(".dialog", 3000); },
      },
      {
        cap: "Search the list, apply one",
        say: "I type upper, and choose upper case. The text changes at once.",
        act: async (d) => { await d.type("upper", 120); await d.wait(800); await d.click(".dialog [role=option], .dialog li, .dialog button >> UPPER", { pause: 1800 }).catch(() => {}); await d.key("Escape", "Esc").catch(() => {}); },
      },
      {
        cap: "Undo with the keyboard",
        say: "Control Z, or Command Z on a Mac, undoes it. It works from the keyboard, just like the Undo button in the toolbar. Control Shift Z, or Control Y, redoes it.",
        act: async (d) => { await d.click(".code-root textarea", { pause: 600 }); await d.key("Meta+z", "⌘ Z"); await d.wait(1500); },
      },
      {
        cap: "Zen mode",
        say: "And when you want nothing else on the screen, zen mode hides everything except your text. There is always a visible way out. A button that says Leave zen mode, and the Escape key.",
        act: async (d) => {
          await d.click("#power-body button >> Zen", { pause: 2200 });
          await d.wait(2500);
          if (await d.eval(`!!document.querySelector('.code-zen')`)) await d.key("Escape", "Esc");
          await d.wait(800);
        },
      },
    ],
  },

  {
    id: "18_yours", chapter: "YOUR WAY", title: "Make it yours: themes, shortcuts and the terminal", blurb: "135 themes, editable keyboard shortcuts, and a terminal in the current folder",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "The Themes button",
        say: "The Themes button in the ribbon changes the colours of the whole app, without going into Settings. It shows your most recent themes first, then all one hundred and thirty five, and a theme editor so you can make your own.",
        act: async (d) => { await d.click("#tool-themes", { pause: 1800 }); await d.hover(".menu", 2500); },
      },
      {
        cap: "Pick a theme",
        say: "I choose All themes, and a gallery opens, with a little preview of each one. I click one, and the whole window changes at once. Futuristic themes even have a gentle motion layer.",
        act: async (d) => {
          await d.click(".menu .menu-item >> All themes", { pause: 1800 });
          await d.waitFor(".theme-card", 6000);
          await d.hover(".theme-card:nth-child(5)", 1500);
          await d.click(".theme-card:nth-child(14)", { pause: 2200 });
          await d.key("Escape", "Esc");
          await d.wait(1500);
        },
      },
      {
        cap: "Every keyboard shortcut can be changed",
        say: "Every keyboard shortcut can be changed. In the Help window, press Change keyboard shortcuts. Pick an action, press the keys you want, and it is saved. The app will not let two actions share the same keys. If you try, it tells you which action already has them.",
        act: async (d) => { await d.key("F1", "F1"); await d.waitFor(".dialog", 6000); await d.hover(".dialog", 2200); await d.click(".dialog .btn >> Change keyboard shortcuts", { pause: 1800 }).catch(() => {}); await d.hover(".dialog", 2500); },
      },
      {
        cap: "The terminal, one click away",
        say: "And the terminal. The button in the status bar opens it in the folder you are looking at. Control Alt T does the same, and so does Open terminal here, in the right click menu. It is a real shell, so it can do anything you can do, and the panel says so.",
        act: async (d) => {
          while (await d.eval(`!!document.querySelector('.modal-backdrop')`)) { await d.key("Escape", "Esc"); await d.wait(400); }
          await d.click("#status-terminal", { pause: 2200 });
          await d.type("ls", 120);
          await d.key("Enter", "Enter");
          await d.wait(1800);
        },
      },
    ],
  },

  {
    id: "19_outro", chapter: "THE END", title: "That is the tour", kind: "card",
    card: { kicker: "Free and open source", title: "Thank you for watching", lines: ["Download: github.com/codecaine-zz/bun_rad_studio", "Every guide is in the docs folder", "Press F1 inside the app any time"] },
    steps: [
      {
        cap: "Thank you for watching",
        say: "That was the whole tour. Everything is safe by default. Deleting goes to the Recycle Bin. Nothing is overwritten silently. Big changes are shown to you first, and checked again when they run. The guides are in the docs folder, and press F1 inside the app at any time. Thank you for watching.",
      },
    ],
  },
];
