import type { Chapter } from "./fm_tutorial_types";
import type { Do } from "../tutorial_file_manager";

/** Clicks inside the terminal so what is typed next goes to the shell. */
const intoTerminal = (d: Do) => d.click("#terminal-host", { pause: 500 });

/** Types a command into the terminal and presses Enter. */
async function run(d: Do, command: string, settle = 1600) {
  await intoTerminal(d);
  await d.type(command, 85);
  await d.key("Enter", "Enter");
  await d.wait(settle);
}

/** Opens one tab of the Tools view and lets the viewer look at it. */
async function tab(d: Do, id: string, look = 2200) {
  await d.click(`#power-tab-${id}`, { pause: 1300 });
  await d.hover("#power-body", look);
}

/** Chapters 18 to 21: the terminal and the File Manager together, then a tour of every other tool. */
export const power: Chapter[] = [
  {
    id: "18_terminal", chapter: "TERMINAL + FILES", title: "The terminal and your files, working together", blurb: "The file list follows the terminal, the terminal follows you, and paths are never typed by hand",
    path: "<HOME>/Projects/shop-app",
    setup: (w) => {
      w.put("Projects/shop-app/docs/meeting notes (final).md", "# Meeting notes\n\n- Launch on Friday\n- Ada checks the cart\n");
    },
    steps: [
      {
        cap: "Terminal button, or Control + `",
        say: "This next part is where the File Manager becomes really fast. A terminal, and your files, working together as one. At the bottom right, there is a Terminal button. You can also press Control and the back tick key. I click it, and a real terminal opens under my files. Notice that it is already in the folder I am looking at. I did not type a single folder name.",
        act: async (d) => { await d.click("#status-terminal", { pause: 1800 }); await run(d, "pwd", 1400); },
      },
      {
        cap: "The terminal bar: Follow, Go to this folder, Restart",
        say: "Let's look at the bar above the terminal. On the left, the name of the folder it is in. Then a reminder that this is a real terminal, so a file deleted here skips the Recycle Bin. Then three controls. Follow terminal. Go to this folder. And Restart. The cross hides the panel, and the shell keeps running.",
        act: async (d) => { await d.hover("#terminal-title", 1300); await d.hover(".term-note", 1600); await d.hover(".term-follow", 1600); await d.hover("#terminal-cd", 1300); await d.hover("#terminal-restart", 1100); await d.hover("#terminal-close", 900); },
      },
      {
        cap: "Type cd: the file list follows",
        say: "Now watch the files above, while I type in the terminal. I type c d, space, s r c, and press Enter. The terminal moves into the s r c folder. And the file list moves with it, by itself. That is Follow terminal. Wherever the terminal goes, your files go too.",
        act: async (d) => { await run(d, "cd src", 2600); await d.hover("#list", 1200); },
      },
      {
        cap: "cd ../docs, cd .. : always in step",
        say: "Let me try another one. c d, dot dot, slash docs. The file list jumps straight to the docs folder. And c d dot dot takes both of them back up, to the project. You can work in whichever one is easier, and they never get out of step.",
        act: async (d) => { await run(d, "cd ../docs", 2600); await run(d, "cd ..", 2400); },
      },
      {
        cap: "The other way round: Go to this folder",
        say: "It also works the other way round. In the file list, I double click the docs folder to open it. Now I press Go to this folder, in the terminal bar. The terminal types the c d command for me, with the path already quoted, and moves to the same place. Then I can run l s, to list what is here.",
        act: async (d) => {
          await d.row("docs", "dblclick", { pause: 1800 });
          await d.click("#terminal-cd", { pause: 2000 });
          await run(d, "ls", 2000);
        },
      },
      {
        cap: "Right-click a folder: Open terminal here",
        say: "There is an even quicker way. I go up one level, and right click the s r c folder. Open terminal here. The terminal goes into that folder, and because Follow terminal is on, the file list goes there too. The keyboard shortcut for this is Command, Option, T.",
        act: async (d) => {
          await d.click("#tool-up", { pause: 1600 });
          await d.row("src", "rclick", { pause: 1500 });
          await d.menu("Open terminal here", { pause: 2500 });
        },
      },
      {
        cap: "Insert paths in Terminal: no more typing names",
        say: "Now the best trick of all. In the terminal, I start a command. w c, space, dash l, space. That counts the lines in files. Now, instead of typing the file names, I select two files in the list. Products and server. I right click, and choose Insert paths in Terminal. Both full paths are typed in for me, safely quoted. Nothing runs until I press Enter. So I press Enter, and there is the answer.",
        act: async (d) => {
          await intoTerminal(d);
          await d.type("wc -l ", 110);
          await d.row("products.ts", "click", { pause: 700 });
          await d.row("server.ts", "click", { extend: "ctrl", pause: 900 });
          await d.row("server.ts", "rclick", { pause: 1500 });
          await d.menu("Insert paths in Terminal", { pause: 2600 });
          await d.key("Enter", "Enter");
          await d.wait(1800);
        },
      },
      {
        cap: "Spaces, brackets, folders: always quoted correctly",
        say: "Names with spaces and brackets are where typing by hand usually goes wrong. Here is a file called meeting notes, final, in brackets. I type cat, and a space. Select the file. Right click, Insert paths in Terminal. The quotes are added for me, so the shell reads it as one name. Enter, and the file is printed. This works for folders too. Select one folder, or ten, and insert them all at once.",
        act: async (d) => {
          await d.click("#tool-up", { pause: 1200 });
          await d.row("docs", "dblclick", { pause: 1600 });
          await intoTerminal(d);
          await d.type("cat ", 110);
          await d.row("meeting notes (final).md", "click", { pause: 800 });
          await d.row("meeting notes (final).md", "rclick", { pause: 1400 });
          await d.menu("Insert paths in Terminal", { pause: 2600 });
          await d.key("Enter", "Enter");
          await d.wait(1800);
        },
      },
      {
        cap: "Copy paths for Terminal: for any other terminal app",
        say: "And if you use a different terminal app, like Terminal or iTerm, right click and choose Copy paths for Terminal instead. The same quoted paths go to the clipboard, ready to paste after any command. On Windows, there is one for PowerShell, one for the Command Prompt, and one for W S L. In W S L, a path like C, Users, becomes slash mount, slash c, slash Users, so Linux understands it. And the built in terminal knows which of these shells you are in, all by itself.",
        act: async (d) => {
          await d.click("#tool-up", { pause: 1200 });
          await d.row("docs", "click", { pause: 600 });
          await d.row("src", "click", { extend: "ctrl", pause: 800 });
          await d.row("src", "rclick", { pause: 1500 });
          await d.hover(".menu [role^=menuitem] >> Copy paths for Terminal", 2600);
          await d.key("Escape", "Esc");
        },
      },
      {
        cap: "Hide it, bring it back: the shell keeps running",
        say: "When you need more room, press the cross, or Control and back tick again. The terminal hides, but keeps running. Bring it back, and everything is still there, exactly where you left it. You can also drag the top edge to make it taller. Together, the file list and the terminal let you see your files, and command them, without ever typing a long path again.",
        act: async (d) => {
          await d.click("#terminal-close", { pause: 1800 });
          await d.click("#status-terminal", { pause: 2000 });
          await d.hover("#terminal-resizer", 1500);
        },
      },
    ],
  },

  {
    id: "19_dev", chapter: "DEVELOPER TOOLS", title: "Replace across files, and the Dev tab", blurb: "Change text in many files with a preview and Undo; code stats, Git and TODO lists",
    path: "<HOME>/Projects/shop-app",
    view: "#view-tools",
    steps: [
      {
        cap: "Tools: every tool in one row of tabs",
        say: "Now let's walk through the other tools. They all live in the Tools view, as a row of tabs. Find and Compare, which we already used. Then Replace, Code, Dev, Projects, and many more. Just click a tab to open it. You can also right click anywhere and choose Open a tool.",
        act: async (d) => { await d.hover("#power-tabs", 2500); await d.scroll("#power-tabs", 400, 3).catch(() => {}); await d.wait(800); await d.scroll("#power-tabs", -400, 3).catch(() => {}); },
      },
      {
        cap: "Replace: find and replace text in many files",
        say: "Replace changes text across many files at once. Say our shop moved to a new web address. The old one, old shop dot example dot com, is written in several documents. I type the old address in Find, and the new one in Replace with. I tick Plain text, so the dots are just dots.",
        act: async (d) => {
          await d.click("#power-tab-sd", { pause: 1500 });
          await d.click(".sd-form .pw-card:nth-child(1) .sd-grid label:nth-child(1) input", { pause: 400 });
          await d.type("oldshop.example.com", 70);
          await d.click(".sd-form .pw-card:nth-child(1) .sd-grid label:nth-child(2) input", { pause: 400 });
          await d.type("shop.example.com", 70);
          await d.click(".sd-form .pw-card:nth-child(1) .sd-checks label:nth-child(1) input", { pause: 900 });
        },
      },
      {
        cap: "Where to look, then Preview changes",
        say: "Where to look. I press Use the open folder, so it searches this whole project. Folders like node modules and dot git are skipped for you. Now the important part. I press Preview changes. Nothing is changed yet. It shows every file, and every line, before and after.",
        act: async (d) => {
          await d.click(".sd-form .pw-btn >> Use the open folder", { pause: 1500 });
          await d.click("#power-body .pw-btn >> Preview changes", { pause: 2500 });
          await d.scroll("#power-body", 500, 6).catch(() => {});
          await d.wait(2000);
        },
      },
      {
        cap: "Replace in ticked files, with Undo",
        say: "Each file has a tick box, so you choose exactly which ones change. When it looks right, press Replace in ticked files. And if you change your mind, Undo last replace puts every file back the way it was. You can even keep a backup copy of each file.",
        act: async (d) => {
          await d.hover("#power-body .pw-btn >> Replace in ticked files", 2000);
          await d.hover("#power-body .pw-btn >> Undo last replace", 1800);
          await d.scroll("#power-body", -500, 6).catch(() => {});
          await d.wait(800);
        },
      },
      {
        cap: "Dev: code stats for the folder",
        say: "Next, the Dev tab. It tells you about a code project. Code stats counts the lines of code in each language, with comments and blank lines counted separately. It always looks at the folder you have open, or you can type any other.",
        act: async (d) => {
          await d.click("#power-tab-dev", { pause: 1500 });
          await d.click("#dev-tab-stats", { pause: 1200 });
          await d.click("#power-body .pw-btn >> Use current folder", { pause: 1200 });
          await d.click("#power-body button >> Count code", { pause: 3000 });
          await d.hover("#power-body", 1500);
        },
      },
      {
        cap: "Project, Git, Disk, TODO, Tools, Versions",
        say: "The other tabs are just as handy. Project explains what kind of project this is, with its scripts and dependencies. Git shows the branch, the history and who worked on it. Disk and files shows where the space goes. And TODO collects every to do and fix me note in your code, so nothing gets forgotten. Here they are, in our shop app.",
        act: async (d) => {
          await d.click("#dev-tab-project", { pause: 2400 });
          await d.click("#dev-tab-git", { pause: 1800 });
          await d.click("#dev-tab-disk", { pause: 1800 });
          await d.click("#dev-tab-todo", { pause: 1200 });
          await d.click("#power-body button >> Find markers", { pause: 2800 });
          await d.hover("#power-body", 1500);
        },
      },
    ],
  },

  {
    id: "20_automate", chapter: "AUTOMATE", title: "Watch and Serve: let the computer do the routine", blurb: "Run a command when files change, and start a local web server with one click",
    path: "<HOME>/Projects/shop-app",
    view: "#view-tools",
    steps: [
      {
        cap: "Watch: run a command whenever files change",
        say: "The Watch tool runs a command for you, every time a file changes. For example, run the tests whenever you save. I type the command, bun test. Then I press Use current folder, so it watches this project.",
        act: async (d) => {
          await d.click("#power-tab-watch", { pause: 1500 });
          await d.click("#power-body input[placeholder='For example: bun test']", { pause: 400 });
          await d.type("bun test", 100);
          await d.click("#power-body .pw-btn >> Use current folder", { pause: 1400 });
        },
      },
      {
        cap: "File types, ignore list, and wait time",
        say: "You can choose which file types count, which folders to ignore, and how long to wait after a change, so saving ten files at once runs the command only one time. Start watching asks you to confirm the command first. The output appears right here, and you can stop at any time.",
        act: async (d) => { await d.scroll("#power-body", 300, 4).catch(() => {}); await d.hover("#power-body", 3000); await d.hover("#power-body .pw-btn >> Start watching", 1500); },
      },
      {
        cap: "Serve: a local web server for any folder",
        say: "Serve starts a small web server for a folder, so you can open a website project in your browser. I press Use the folder I'm looking at. I choose the kind of server. A live server reloads the page every time you save. There is also P H P's built in server, for P H P projects.",
        act: async (d) => {
          await d.click("#power-tab-serve", { pause: 1500 });
          await d.click("#power-body .pw-btn >> Use the folder I'm looking at", { pause: 1500 });
          await d.hover("#power-body select[aria-label='Kind of server']", 2000);
        },
      },
      {
        cap: "Start server: it gets its own address",
        say: "I press Start server. It picks a free port by itself, and shows the address in the list. Click it, and the site opens in your browser. Every running server is listed in one place, so you always know what is on, and you can stop each one with one click.",
        act: async (d) => {
          // Untick "Open my browser when it starts": the recording must not open a real browser window.
          await d.click("#power-body label >> Open my browser when it starts", { pause: 800 });
          await d.click("#power-body .pw-btn >> Start server", { pause: 2500 });
          await d.scroll("#power-body", -600, 4).catch(() => {});
          await d.hover("#power-body", 4500);
          await d.click("#power-body .pw-btn >> Stop", { pause: 1200 });
        },
      },
    ],
  },

  {
    id: "21_toolbox", chapter: "THE TOOLBOX", title: "The rest of the toolbox", blurb: "Security, network and handy tools, all one click away",
    path: "<HOME>/Projects/shop-app",
    view: "#view-tools",
    setup: (w) => {
      w.put("Projects/shop-app/old-draft-to-bury.txt", "Temporary draft that will be buried into the Rip Graveyard and restored.\n");
    },
    steps: [
      {
        cap: "Crypto: hashes, passwords, encryption",
        say: "Crypto collects the security helpers. Make a hash of a file, to check that a download was not changed. Make a strong password, or a random token. Encrypt and decrypt text with a passphrase. And encode or decode things like base sixty four. Nothing you type here is saved anywhere.",
        act: async (d) => { await tab(d, "crypto", 2000); await d.scroll("#power-body", 600, 6).catch(() => {}); await d.click("#power-body button >> Generate password", { pause: 2200 }); },
      },
      {
        cap: "Secrets and Env: passwords and .env files",
        say: "Secrets is an encrypted vault for passwords and private notes, locked with one master password. And Env opens dot env files, the settings files many projects use. It finds duplicate names and mistakes, compares with an example file, and keeps the values hidden until you choose to see them.",
        act: async (d) => { await tab(d, "secrets", 2600); await tab(d, "env", 2600); },
      },
      {
        cap: "IP info, Network, Subdomains, Downloads",
        say: "The network tools. IP info looks up an address or a web site, and has subnet helpers. Network checks ports, D N S records, and security certificates, so you can see why a site will not load. Subdomains lists the public sub addresses of a domain. And Downloads fetches big files fast, with pause and resume.",
        act: async (d) => { await tab(d, "ip", 1800); await tab(d, "net", 1800); await tab(d, "subs", 1500); await tab(d, "downloads", 1500); },
      },
      {
        cap: "Calculator, Timer, QR, API, Bundler",
        say: "And the handy ones. A full Calculator, with scientific, graphing, programmer and unit modes. A Timer, for work sprints and breaks. QR codes, which we saw earlier. API, to send web requests and look at the answers. And Bundler, which turns a Bun project into a single program, or a Mac app.",
        act: async (d) => { await tab(d, "calc", 2000); await tab(d, "timer", 1600); await tab(d, "api", 1500); await tab(d, "bundler", 1500); },
      },
      {
        cap: "Graveyard: bury (Rip), inspect, and restore in one click",
        say: "Finally, Graveyard, shared with Rip Studio and the rip command line tool. When you right-click a file and choose Bury, it rests safely in the graveyard instead of being lost. Here in the Graveyard tab, you see its original folder and size, and clicking Select all and Restore brings it right back to its home folder.",
        act: async (d) => {
          await d.eval(`(async () => {
            const { call } = await import('/ui/api.js');
            const { currentPath } = await import('/ui/state.js');
            const folder = currentPath();
            if (folder) await call('grave/bury', { paths: [folder + '/old-draft-to-bury.txt'] }).catch(() => {});
          })()`);
          await tab(d, "grave", 1800);
          await d.click("#power-body .pw-btn >> Select all", { pause: 1000 }).catch(() => {});
          await d.click("#power-body .pw-btn >> Restore", { pause: 1400 }).catch(() => {});
          await d.click("#view-files", { pause: 1500 });
        },
      },
    ],
  },
];
