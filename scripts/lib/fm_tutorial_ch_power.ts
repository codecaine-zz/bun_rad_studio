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
    id: "21_toolbox",
    chapter: "THE TOOLBOX IN DETAIL",
    title: "Crypto, Secrets Vault, Env, IP & Subnet, Network, Subdomains, Downloads, API, Bundler, Calc, Timer & Graveyard",
    blurb: "Step-by-step live walkthrough of every security, network, developer, and productivity tool in the Tools panel",
    path: "<HOME>/Projects/shop-app",
    view: "#view-tools",
    setup: (w) => {
      w.put("Projects/shop-app/old-draft-to-bury.txt", "Temporary draft that will be buried into the Rip Graveyard and restored.\n");
    },
    steps: [
      {
        cap: "Crypto Studio Pro: SHA-256/512/BLAKE2b hashes, HMAC, AES-256 lock, Argon2id, UUID v7 & keys",
        say: "Let's explore every remaining tool in the Tools panel in full detail, starting with Crypto. In the Hash some text card, I type a release string and click Calculate hashes. Instantly it computes SHA two fifty-six, SHA five twelve, SHA three, BLAKE2b, and fast checksums like C R C thirty-two and x x Hash. You can also hash up to twenty selected files in bulk and verify them against a published checksum. Scrolling down, you can lock and unlock text with A E S two fifty-six, hash passwords with Argon2id or bcrypt, and generate bulk U U I D version seven keys, two-fifty-six-bit hex or Base64 secrets, and high-entropy passphrases.",
        act: async (d) => {
          await tab(d, "crypto", 1000);
          await d.click("#power-pane-crypto textarea", { pause: 400 }).catch(() => {});
          await d.type("Codecaine File Manager M4 Ultra Release v4.2", 45);
          await d.click("#power-pane-crypto button >> Calculate hashes", { pause: 1600 }).catch(() => {});
          await d.hover("#power-pane-crypto .crypto-tablehost", 1400).catch(() => {});
          await d.scroll("#power-body", 650, 6).catch(() => {});
          await d.click("#power-pane-crypto button >> New UUID v7", { pause: 1000 }).catch(() => {});
          await d.click("#power-pane-crypto button >> 32-byte hex key", { pause: 1000 }).catch(() => {});
          await d.click("#power-pane-crypto button >> Generate password", { pause: 1200 }).catch(() => {});
        },
      },
      {
        cap: "Secrets Vault: encrypted password manager, hardware strength benchmark & recovery keys",
        say: "Next is Secrets, a complete encrypted password and secure-notes vault locked with one master password and Argon2id memory-hard encryption. You can click Suggest a passphrase to generate a four-word passphrase, choose an optional key file and recovery key, and click Measure on this computer to benchmark Standard two-fifty-six megabyte, Strong five-twelve megabyte, and Maximum one gigabyte vault unlocking right on your hardware. Once unlocked, it stores logins, secure notes, payment cards, S S H keys, Wi-Fi credentials, and A P I tokens with a password health report and one-click auto-lock.",
        act: async (d) => {
          await tab(d, "secrets", 1000);
          await d.click("#power-pane-secrets button >> Suggest a passphrase", { pause: 1300 }).catch(() => {});
          await d.click("#power-pane-secrets button >> Measure on this computer", { pause: 2200 }).catch(() => {});
          await d.hover("#power-pane-secrets", 1400).catch(() => {});
        },
      },
      {
        cap: "Env Studio: inspect .env files, mask secrets, spot duplicate keys & compare with .env.example",
        say: "Beside Secrets is Env Studio, dedicated to dot E N V configuration files. It runs inside an isolated loopback security frame, masks secret-looking API keys and tokens on screen until you reveal them, highlights duplicate keys or syntax mistakes, and compares your local dot env file against dot env dot example so no required variable is ever missing before deployment.",
        act: async (d) => {
          await tab(d, "env", 2200);
          await d.hover("#power-pane-env .embed-bar", 1200).catch(() => {});
          await d.hover("#power-pane-env iframe", 1800).catch(() => {});
        },
      },
      {
        cap: "IP Info & Subnet Calculator: public IP, CIDR range math, and local network adapters",
        say: "Now let's open the Network group, starting with I P info. You can look up any public I P address or domain, or type a C I D R block like one nine two dot one six eight dot one dot zero slash twenty-four and click Subnet calculator. It calculates the netmask, network and broadcast addresses, and usable host range right on your machine. And clicking Network adapters lists every local network interface and I P v 4 or I P v 6 address on this computer, ready to copy as J S O N or C S V.",
        act: async (d) => {
          await tab(d, "ip", 1000);
          await d.click("#power-pane-ip .ip-target", { pause: 400 }).catch(() => {});
          await d.eval(`(() => { const el = document.querySelector('#power-pane-ip .ip-target'); if (el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
          await d.type("192.168.1.0/24", 60);
          await d.click("#power-pane-ip button >> Subnet calculator", { pause: 1600 }).catch(() => {});
          await d.hover("#power-pane-ip .ip-details", 1400).catch(() => {});
          await d.click("#power-pane-ip button >> Network adapters", { pause: 1600 }).catch(() => {});
          await d.click("#power-pane-ip button >> Copy JSON", { pause: 900 }).catch(() => {});
        },
      },
      {
        cap: "Network Inspector: HTTP probe, live TCP port scanner, Full DNS Audit, SSL Certs & TCP Ping",
        say: "The Network tab is your complete diagnostics workbench. You can check a website's status and headers, inspect its S S L certificate chain and expiration date, run a five-packet T C P latency ping, or run a Full D N S Audit across A, quad-A, M X, T X T, N S, S O A, and C A A records. Let's click Scan common ports on localhost: it scans web, S S H, and database ports in parallel, shows every open port in the results table, logs every step in the live diagnostics stream, and saves the report straight to your open folder.",
        act: async (d) => {
          await tab(d, "net", 1000);
          await d.click("#power-pane-net button >> Scan common ports", { pause: 2400 }).catch(() => {});
          await d.hover("#power-pane-net .net-results", 1500).catch(() => {});
          await d.click("#power-pane-net button >> Use current folder", { pause: 900 }).catch(() => {});
          await d.click("#power-pane-net button >> Save report", { pause: 1200 }).catch(() => {});
        },
      },
      {
        cap: "Subdomains Recon & Multi-Connection Downloads Accelerator",
        say: "Next are Subdomains and Downloads. Subdomains queries passive Certificate Transparency logs and public archives to discover subdomains for a domain, with optional D N S resolution, H T T P status probing, wildcard detection, and one-click export to C S V, J S O N, Markdown, or a hosts list. And Downloads is a multi-connection download manager that splits large files across up to thirty-two parallel connections with pause and resume, bandwidth limits, custom request headers, and automatic S H A two fifty-six checksum verification.",
        act: async (d) => {
          await tab(d, "subs", 1000);
          await d.click('#power-pane-subs input[aria-label="Domain to look up"]', { pause: 400 }).catch(() => {});
          await d.type("example.com", 70);
          await d.hover("#power-pane-subs .subs-sources", 1200).catch(() => {});
          await tab(d, "downloads", 1000);
          await d.click("#power-pane-downloads .dl-urls", { pause: 400 }).catch(() => {});
          await d.type("https://example.com/releases/codecaine-studio-arm64.dmg", 40);
          await d.click("#power-pane-downloads button >> Use the open folder", { pause: 900 }).catch(() => {});
          await d.eval(`(() => { const s = document.querySelector('#power-pane-downloads select[aria-label="Connections per file"]'); if (s) { s.value = '16'; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
          await d.hover("#power-pane-downloads .dl-add", 1200).catch(() => {});
        },
      },
      {
        cap: "Calculator, Pomodoro Timer, REST API Studio & Bun App Bundler",
        say: "In the Handy and Files groups, Calculator gives you scientific, graphing, programmer binary and hex, and unit conversion modes. Timer runs Pomodoro focus sprints, countdowns, and lap stopwatches. A P I Studio sends local H T T P and R E S T requests, imports c U R L commands, and formats J S O N responses. And Bundler packages any Bun or TypeScript project into a single bundled script, a standalone native binary executable, or a signed mac O S dot app bundle.",
        act: async (d) => {
          await tab(d, "calc", 1600);
          await tab(d, "timer", 1500);
          await tab(d, "api", 1600);
          await tab(d, "bundler", 1600);
        },
      },
      {
        cap: "Graveyard: bury (Rip), inspect original path & size, and bulk restore in one click",
        say: "Finally, Graveyard, shared with Rip Studio and the rip command-line tool. When you right-click any file or selection and choose Bury, it moves safely into the Graveyard with its original folder path, size, and deletion date preserved. Here in the Graveyard tab, clicking Select all and Restore returns every buried item straight back to its original folder.",
        act: async (d) => {
          await d.eval(`(async () => {
            const { call } = await import('/ui/api.js');
            const { currentPath } = await import('/ui/state.js');
            const folder = currentPath();
            if (folder) await call('grave/bury', { paths: [folder + '/old-draft-to-bury.txt'] }).catch(() => {});
          })()`);
          await tab(d, "grave", 1600);
          await d.click("#power-body .pw-btn >> Select all", { pause: 1000 }).catch(() => {});
          await d.click("#power-body .pw-btn >> Restore", { pause: 1400 }).catch(() => {});
          await d.click("#view-files", { pause: 1400 });
        },
      },
    ],
  },
];
