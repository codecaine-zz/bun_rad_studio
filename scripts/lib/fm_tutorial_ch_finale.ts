import type { Chapter } from "./fm_tutorial_types";

/** Chapters 16 and 17: QR codes and the code editor. */
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
        cap: "Outline, Git, History, TODOs, Split & Live Preview",
        say: "On the left, the side bar has tabs for Files, Search, Outline of functions and headings, Bookmarks, TO DO markers, Git changes, and local file History snapshots. In the top bar, you can open a side-by-side Split editor, or click Preview to see a live Markdown, H T M L, J S O N, or C S V preview and code inspector right next to your text, plus Run and Build buttons when editing a script.",
        act: async (d) => {
          await d.click('.code-side-tab[data-panel="outline"]', { pause: 900 }).catch(() => {});
          await d.click('.code-side-tab[data-panel="todos"]', { pause: 900 }).catch(() => {});
          await d.click('.code-side-tab[data-panel="git"]', { pause: 900 }).catch(() => {});
          await d.click('.code-side-tab[data-panel="history"]', { pause: 900 }).catch(() => {});
          await d.click('.code-side-tab[data-panel="files"]', { pause: 700 }).catch(() => {});
          await d.click("#power-body button >> Preview", { pause: 1600 }).catch(() => {});
          await d.click("#power-body button >> Preview", { pause: 900 }).catch(() => {});
        },
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
];
