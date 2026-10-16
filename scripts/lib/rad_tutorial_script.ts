// The chapters of "Bun RAD Studio: the complete RAD tutorial": build real desktop apps with the SimpleGUI A P I, design quickly,
// use the rad utility modules and system tools, and ship a binary. Every program on screen is real and every line of code
// shown is the file in examples/rad_tutorial/. The stage (scripts/lib/rad_stage.ts) shows the file and the running program side
// by side; steps highlight the lines being talked about and then use the program.
import { stage, outputs } from "./rad_stage";
import type { Chapter, Step } from "./fm_tutorial_types";
import type { Do } from "./step_video";

/** What each live chapter shows. `make` is the function of the example that creates the window. */
export interface StageSpec { file: string; title: string; make?: string; term?: { command: string[]; show: string } | { build: true }; designer?: boolean }
export const stages: Record<string, StageSpec> = {
  "01_first_app": { file: "01_quickstart.ts", title: "Your first window", make: "createQuickstart" },
  "02_layout": { file: "02_layout.ts", title: "Layout", make: "createLayout" },
  "03_controls": { file: "03_controls.ts", title: "Controls", make: "createControls" },
  "04_state": { file: "04_state.ts", title: "State and binding", make: "createState" },
  "05_dialogs_menus": { file: "05_dialogs_menus.ts", title: "Menus, dialogs, timers", make: "createDialogsMenus" },
  "06_themes": { file: "06_themes.ts", title: "Themes", make: "createThemes" },
  "07_capstone": { file: "07_contacts.ts", title: "A finished app", make: "createContacts" },
  "08_rad_modules": { file: "10_rad_modules.ts", title: "The rad modules", term: { command: ["bun", "run", "examples/rad_tutorial/10_rad_modules.ts"], show: "bun run examples/rad_tutorial/10_rad_modules.ts" } },
  "09_system_tools": { file: "11_system_tools.ts", title: "System tools as functions", term: { command: ["bun", "run", "examples/rad_tutorial/11_system_tools.ts"], show: "bun run examples/rad_tutorial/11_system_tools.ts" } },
  "10_designer": { file: "", title: "", designer: true },
  "11_ship": { file: "../hello_simplegui.ts", title: "Ship it", term: { build: true } },
};

const A = stage.inApp;
const wait = (d: Do, ms: number) => d.wait(ms);
/** A step whose action is a function of the stage. */
const step = (cap: string, say: string, act?: (d: Do) => Promise<void>, extra: Partial<Step> = {}): Step => ({ cap, say, act, ...extra });

/**
 * Types into a text box of the running program, then checks what the box really holds. The program's boxes talk to Bun on every
 * key, and on a busy computer that can double letters, so a wrong box is cleared and typed again, more slowly.
 */
async function fill(d: Do, selector: string, text: string, perChar = 110): Promise<void> {
  const inner = JSON.stringify(selector);
  for (let attempt = 0; attempt < 4; attempt++) {
    await d.click(`${A} ${selector}`, { pause: 350 });
    await d.c.evalFrame("#appframe", `(() => { const e = document.querySelector(${inner}); if (e) { e.focus(); e.select(); } })()`);
    if (text === "") await d.c.evalFrame("#appframe", `(() => { const e = document.querySelector(${inner}); e.value = ""; e.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    else await d.type(text, perChar + attempt * 70);
    await d.wait(700);
    const now = await d.c.evalFrame("#appframe", `document.querySelector(${inner})?.value ?? null`);
    if (now === text) return;
  }
  throw new Error(`the box ${selector} would not hold "${text}"`);
}

const setTheme = (d: Do, name: string) =>
  d.c.evalFrame("#appframe", `(() => { const s = document.getElementById("cmbTheme"); s.value = ${JSON.stringify(name)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);

export const radChapters: Chapter[] = [
  {
    id: "00_intro", chapter: "WELCOME", title: "Welcome", kind: "card",
    card: { kicker: "Rapid application development with Bun", title: "Build Desktop Apps Fast", lines: ["The SimpleGUI A P I, line by line", "The visual designer, the rad modules and the system tools", "Then ship a single program"] },
    steps: [{
      cap: "Rapid desktop apps, in TypeScript",
      say: "Welcome. This tutorial shows how to build real desktop applications quickly with Bun RAD Studio. We start with the SimpleGUI A P I, one idea at a time, with the code on the left and the running program on the right. Then we design a form visually, use the rad utility modules and the system tools from code, and ship the result as one program. Everything you will see is the real thing, and the files are in the examples folder, so you can follow along.",
    }],
  },

  {
    id: "01_first_app", chapter: "FIRST APP", title: "Your first window", blurb: "A window, a card, two fields and a button",
    steps: [
      step("A whole app in under 30 lines", "Here is a complete desktop app. The code is on the left, and the program it makes is on the right. There is no project to set up, no build step and no framework to learn first. One TypeScript file, run with Bun. Let us read it from the top.", async (d) => { await stage.hl(d); await wait(d, 1500); }),
      step("Create the window", "First, the window. New simple window takes a title, a width, a height, and some options. Here the option is a theme, apple dark. SimpleGUI has one hundred thirty three themes built in, and you will see them later.", async (d) => { await stage.hl(d, "const win = newSimpleWindow"); await wait(d, 1200); }),
      step("Controls go in, top to bottom", "Then you add controls, one after another, and they stack from the top. Group them with begin card and end card, and put things side by side with begin row and end row. A label here, a text input there. Each one is just a function call.", async (d) => { await stage.hl(d, "win.addLabel(\"⚡"); await wait(d, 1800); await stage.hl(d, "win.beginCard", "win.endCard"); await wait(d, 1500); }),
      step("Chain size, colour and font", "Every control you add returns a reference you can chain. Give it an I D so you can find it again, then a width, a height, a font, a colour. The button here has a background, a bold style, and a click handler that receives the window. Inside the handler, get text reads the input by its I D, and info shows a dialog.", async (d) => { await stage.hl(d, "win.addButton(", "height(38)"); await wait(d, 1500); }),
      step("Run it: type a name, press Login", "Now I use it. I click the user name box, type a name, and press Login. The handler ran, read the box, and showed the dialog. That is the whole loop of SimpleGUI: add a control, give it an I D, and react to it in a handler.", async (d) => {
        await fill(d, "input", "Alex", 130);
        await d.click(`${A} button >> Login`, { pause: 2600 });
        await d.click(`${A} button >> OK`, { pause: 900 });
      }),
      step("One command to run it", "To run it yourself, you type bun run, and the name of the file. The same file runs on Mac, Windows and Linux. The window you see is the same one the other tools in this suite use, so there is nothing else to install.", async (d) => { await stage.hl(d, "if (import.meta.main)"); await wait(d, 1500); }),
    ],
  },

  {
    id: "02_layout", chapter: "LAYOUT", title: "Rows, grids and cards", blurb: "Arrange controls without pixel maths",
    steps: [
      step("Stack, with a heading", "Layout in SimpleGUI is automatic. Controls stack from top to bottom by default. Add heading gives you a title with a smaller line under it, and there are matching helpers for subheadings and captions.", async (d) => { await stage.hl(d, "win.addHeading"); await wait(d, 1500); }),
      step("Rows put controls side by side", "Begin row and end row put controls on one line. Here is a label, a search box and a button. I type a word, press Go, and the handler writes into the status bar at the bottom.", async (d) => {
        await stage.hl(d, "win.beginRow", "win.endRow");
        await fill(d, "input[placeholder*=keywords]", "invoice");
        await d.click(`${A} button >> Go`, { pause: 1800 });
      }),
      step("Grids make equal columns", "Begin grid takes a number of columns and a gap. The controls inside fill the grid row by row, and wrap to a new row by themselves. Three text boxes and a switch make a tidy form, with no coordinates at all.", async (d) => { await stage.hl(d, "win.beginGrid", "win.endGrid"); await wait(d, 2500); }),
      step("Cards group related things", "A card is a titled box with rounded corners. It can have a small subtitle. Cards inside grids give you dashboards. They are the main way to make a window feel organised.", async (d) => { await stage.hl(d, "win.beginCard", "win.endCard"); await wait(d, 2500); }),
      step("Status bar and exact positions", "Add status bar creates the strip at the bottom, and set status bar text changes it any time. If you ever need exact placement, any control accepts at, with an x and a y, to leave the automatic layout. Most windows never need it.", async (d) => { await stage.hl(d, "win.addStatusBar"); await wait(d, 2500); }),
    ],
  },

  {
    id: "03_controls", chapter: "CONTROLS", title: "The controls you can use", blurb: "Form fields, tables, meters and about a hundred more",
    steps: [
      step("Standard controls", "SimpleGUI has the controls you expect: labels, buttons, text inputs, password and search boxes, text areas, check boxes, switches, drop downs, list boxes, sliders, steppers, progress bars, color and date pickers, badges, tables and tree views. Each one is a single call, and you can chain styling on the result.", async (d) => { await stage.hl(d); await wait(d, 2500); }),
      step("Form fields with their labels", "For forms there are compound helpers that add the label and the control together. Add form field, add form dropdown, add form slider and add form switch each take a label, an I D and a starting value. That is a whole form in four lines.", async (d) => { await stage.hl(d, "win.beginCard(\"📝 Form\")", "win.endCard"); await wait(d, 2500); }),
      step("Meters and dashboard controls", "For dashboards and developer tools there are circular progress, gauges, sparklines, charts, a property grid, a console, an activity feed, a markdown viewer, a PIN box, colour palettes and more. In all, well over fifty. Here are a circular progress and a gauge.", async (d) => { await stage.hl(d, "win.addCircularProgress", "win.addGauge"); await wait(d, 2500); }),
      step("Tables, with a click handler", "Add table takes an I D, the column headings and the rows. You can pass a handler as well, and it receives the row that was clicked. I click a row to show it. The full list of controls, with every argument, is in the SimpleGUI A P I guide.", async (d) => {
        await stage.hl(d, "win.addTable", "]);");
        await d.click(`${A} table tr >> WARN`, { pause: 2200 });
      }),
    ],
  },

  {
    id: "04_state", chapter: "STATE", title: "State and binding", blurb: "Controls that follow your data",
    steps: [
      step("Bind a control to state", "Real apps keep their data in one place. SimpleGUI has a state store: named values, and controls can be bound to them. Bind state connects a control to a key, in both directions. Type in the box, and the state changes. Change the state, and the box changes.", async (d) => {
        await stage.hl(d, "win.addTextInput", "bindState(\"volume\")");
        await fill(d, "#txtUser", "Grace Hopper", 100);
        await wait(d, 1200);
      }),
      step("React to changes", "On state change runs your function whenever a key changes, whoever changed it. Here one function rebuilds the summary line. Look: the label under the controls already shows the new name.", async (d) => { await stage.hl(d, "const refresh", "win.onStateChange(\"volume\""); await wait(d, 3000); }),
      step("Set state from code", "And you can set state from anywhere in your code. This button sets two keys. Watch the text box, the slider and the label all move together, without any code that touches them directly.", async (d) => {
        await stage.hl(d, "win.addButton(\"Set the state");
        await d.click(`${A} button >> Set the state`, { pause: 2600 });
      }),
      step("Themes at run time", "Even the theme is one call. Set theme changes the whole window at once, and it can remember the choice for next time. There is also save app state, which keeps your state in the right folder for each operating system.", async (d) => {
        await stage.hl(d, "win.addButton(\"Switch to the Nord", "win.addButton(\"Switch to Apple Light");
        await d.click(`${A} button >> Nord`, { pause: 2200 });
        await d.click(`${A} button >> Apple Light`, { pause: 2200 });
      }),
    ],
  },

  {
    id: "05_dialogs_menus", chapter: "MENUS & DIALOGS", title: "Menus, dialogs, timers and busy states", blurb: "The parts of a real desktop app",
    steps: [
      step("A menu bar", "Desktop apps have menus. Add menu bar takes the menus and their items as text, and a separator is three dashes. One click handler receives whatever was chosen. I open the File menu and choose Save, and the handler shows a message.", async (d) => {
        await stage.hl(d, "win.addMenuBar", "win.onClick(\"mainMenu\"");
        await d.click(`${A} button >> File`, { pause: 900 });
        await d.click(`${A} .menu-dropdown-item >> Save`, { pause: 1800 });
      }),
      step("Toolbar and status bar", "A toolbar works the same way. You give it the button labels, and one handler gets the choice. This one reports into the status bar, so you can see the message at the bottom.", async (d) => {
        await stage.hl(d, "win.addToolBar", "win.onClick(\"mainBar\"");
        await d.click(`${A} button >> Open`, { pause: 1800 });
      }),
      step("Timers", "Add timer runs a function every so many milliseconds. This clock updates its label each second. There is a remove timer as well, so you can stop it when you want.", async (d) => { await stage.hl(d, "win.addLabel(\"⏰", "}, { id: \"clock\" });"); await wait(d, 3500); }),
      step("Dialogs: tell, warn and ask", "Dialogs are built in. Info, warn and error show a message. Ask returns the answer of a confirm box. I press Info, and close it. Then Ask first, which waits for a choice before the code goes on.", async (d) => {
        await stage.hl(d, "win.beginRow", "win.endRow");
        await d.click(`${A} button >> Info`, { pause: 1800 });
        await d.click(`${A} button >> OK`, { pause: 900 });
        await d.click(`${A} button >> Ask first`, { pause: 1800 });
        await d.c.evalFrame("#appframe", "(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(OK|Yes|Confirm|Delete)$/i.test(x.textContent.trim()) && x.offsetParent !== null); if (b) b.click(); })()");
        await wait(d, 1200);
      }),
      step("Busy states for slow work", "For slow work there is with busy state. It disables the controls you name, shows a message, runs your async function, and turns everything back on when it finishes, even if something goes wrong. I press Sync, and after two seconds the dialog says it is done.", async (d) => {
        await stage.hl(d, "win.addButton(\"☁️ Sync", ".id(\"btnSyncLabel\")");
        await d.click(`${A} button >> Sync`, { pause: 3200 });
        await d.click(`${A} button >> OK`, { pause: 900 });
      }),
    ],
  },

  {
    id: "06_themes", chapter: "THEMES", title: "One hundred thirty three themes", blurb: "Restyle the whole window with one call",
    steps: [
      step("Pick a theme by name", "SimpleGUI ships with one hundred thirty three themes: Mac, Windows, Linux desktop looks, editor palettes like Dracula, Nord and Solarized, and some wild futuristic ones. This little program lists all of them in a drop down, and a change calls set theme.", async (d) => { await stage.hl(d, "const names", "win.addDropdown"); await wait(d, 2500); }),
      step("Watch the same window change", "I pick Nord. Then Dracula. Then Synthwave. Then a light theme. The controls, the cards and the text all follow, with no code of your own. A theme is a set of colours, and the library applies it everywhere.", async (d) => {
        for (const t of ["nord", "dracula", "synthwave84", "solarized_light", "cyberpunk_hologram", "tokyo_night"]) { await setTheme(d, t); await wait(d, 1900); }
      }),
      step("Themes you can browse", "The full list is in the themes page of the documentation, with a picture of each. In the File Manager there is also a Themes button in the ribbon. And in the designer, the form theme and the effects are properties you set while you build.", async (d) => { await stage.hl(d); await setTheme(d, "apple_dark"); await wait(d, 2500); }),
    ],
  },

  {
    id: "07_capstone", chapter: "A FINISHED APP", title: "Put it together: a contacts app with SQLite", blurb: "Form, table, search, confirm dialog and a database",
    steps: [
      step("The plan", "Let us put it all together in one small, finished app. A list of contacts, saved in a SQLite database. It uses a table, a search box, a form, a confirm dialog, and the rad modules for the database. Under a hundred lines, and every line you have already seen, except for the database.", async (d) => { await stage.hl(d); await wait(d, 1500); }),
      step("The database in four lines", "The database comes from the rad utilities. Open db opens a file, or memory. Exec sql runs any statement. Insert row takes an object, and query all gives back rows. No driver to install, because it is built on Bun's own SQLite.", async (d) => { await stage.hl(d, "const db = rad.sqliteutils.openDb", "insertRow(db, \"contacts\", { name: \"Alan"); await wait(d, 3000); }),
      step("One function draws the table", "One small function, show, reads the filter box, asks the database, and sets the table rows. Every handler calls it, so the table is always right. I type a few letters into the filter, and the table follows.", async (d) => {
        await stage.hl(d, "const show", "};");
        await fill(d, "input[placeholder*=Filter]", "ada", 140);
        await wait(d, 1400);
        await fill(d, "input[placeholder*=Filter]", "");
        await wait(d, 800);
      }),
      step("Add a contact", "The add button reads the two fields, checks the name, inserts a row, clears the form and shows a message. I add Grace Hopper, and she appears in the table straight away.", async (d) => {
        await stage.hl(d, "win.addButton(\"➕ Add\"", "}).bg(\"#0284c7\")");
        await fill(d, "#txtName", "Grace Hopper", 100);
        await fill(d, "#txtEmail", "grace@example.com", 80);
        await d.click(`${A} button >> Add`, { pause: 2200 });
      }),
      step("Delete, with a confirmation", "To delete, I click a row, and press delete. The program asks first, because ask waits for the answer. After I confirm, the row is gone, from the table and from the database.", async (d) => {
        await stage.hl(d, "win.addButton(\"🗑 Delete", "}).bg(\"#dc2626\")");
        await d.click(`${A} table tr >> Grace`, { pause: 900 });
        await d.click(`${A} button >> Delete the chosen`, { pause: 1800 });
        await d.c.evalFrame("#appframe", "(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(OK|Yes|Confirm|Delete)$/i.test(x.textContent.trim()) && x.offsetParent !== null); if (b) b.click(); })()");
        await wait(d, 1800);
      }),
    ],
  },

  {
    id: "08_rad_modules", chapter: "THE RAD MODULES", title: "Forty-five utility modules", blurb: "Strings, files, SQLite, hashing, time and more, as functions",
    steps: [
      step("A toolbox with no setup", "Behind the windows is a second library: the rad modules. Forty-five small modules for everyday work, from strings and arrays, to files, SQLite, archives, hashing, validation, caching, and dates. They are plain TypeScript functions, so you can use them in a window, or in a script with no window at all.", async (d) => { await stage.hl(d); await wait(d, 2500); }),
      step("Text and data", "Here is the first block. Slugify turns a title into a web address. Mask email hides most of an address. Chunk splits a list. At with minus one reads the last item. Is email checks an address. Now I run the file, and the real results appear on the right.", async (d) => {
        await stage.hl(d, "// Text and data", "isEmail");
        await stage.term(d, (stages["08_rad_modules"]!.term as any).show, outputs["08_rad_modules"] ?? "");
        await wait(d, 1500);
      }),
      step("Files and a database", "The next block saves a JSON file and loads it back, and then opens an in-memory SQLite database, stores a key and reads it. Those results are the lines root and production in the output.", async (d) => { await stage.hl(d, "// Files and a database", "getKv(db"); await wait(d, 3000); }),
      step("Maths, time and versions", "Mean and median, a relative time like one hour ago, a version check that tells you two point four point one fits caret two, and a tiny sparkline made of text. Each is one line.", async (d) => { await stage.hl(d, "// Maths, time, versions", "renderSparkline"); await wait(d, 3000); }),
      step("Security, web and caches", "And more: a SHA two fifty six hash, a query string builder, and a least recently used cache. The full list of modules, with every function, is in the rad readme, and the examples folder has a cookbook that runs all of them.", async (d) => { await stage.hl(d, "// Security and the web", "lru.get"); await wait(d, 3500); }),
    ],
  },

  {
    id: "09_system_tools", chapter: "SYSTEM TOOLS", title: "The system tools, as functions", blurb: "fd, sd, tokei, gdu, watchexec and friends from your own code",
    steps: [
      step("Ten tools you can call", "The same engines behind the studio apps are available as functions. Find files like f d. Replace text like s d. Count code like tokei. Measure folders like g d u. Watch files like watchexec. And rip, procs, ip info, subfinder and doggo too. Use them in your own tools and scripts.", async (d) => { await stage.hl(d); await wait(d, 2500); }),
      step("Run it and read the results", "This file calls five of them. Find the files whose names contain simplegui. Replace the word World with Bun. Count the lines of code in the examples folder. Measure the folder. And ask whether a change would trigger a watcher. I run it, and the real answers show up on the right.", async (d) => {
        await stage.hl(d, "// fd: find files", "console.log(\"fd");
        await stage.term(d, (stages["09_system_tools"]!.term as any).show, outputs["09_system_tools"] ?? "");
        await wait(d, 1500);
      }),
      step("Plain objects in, plain results out", "Every function takes an options object and returns plain data, so there is nothing to parse. That makes them easy to put behind a button in a SimpleGUI window. The system utilities guide lists every option, with a cookbook for each tool.", async (d) => { await stage.hl(d, "// tokei: count lines of code", "console.log(\"gdu"); await wait(d, 3500); }),
    ],
  },

  {
    id: "10_designer", chapter: "DESIGN QUICKLY", title: "Design a form visually", blurb: "Drag, preview, and get the code",
    steps: [
      step("The visual designer", "When a window is mostly a form, you do not have to type it. The visual designer, in the same toolbox, works like Delphi or Visual Basic did. A palette of about a hundred controls on the left, the form in the middle, and the properties on the right. There is a whole tutorial for it, so here is the quick version.", async (d) => { await wait(d, 2000); }),
      step("Start from a template", "I click a template, Auth Login. There are templates for logins, customer forms, settings pages, media players, checkouts and more. Now there is a real form on the canvas that I can change, move, and restyle.", async (d) => { await d.click(".template-chip >> Auth Login", { pause: 2000 }); }),
      step("The code writes itself", "The designer writes the code as you work. This tab is Bun TypeScript for SimpleGUI. The others are plain HTML, React, Vue and Python. You can copy any of it into your own project.", async (d) => { await d.click(".tab-item >> Bun TS", { pause: 1600 }); await d.scroll("#bunTsPreviewText", 400, 5); await wait(d, 1500); }),
      step("Preview, then export", "Run opens a live preview of the form right on top of the designer. Export writes a complete project folder. Then you add your logic in the handlers, exactly as in the first chapters.", async (d) => {
        await d.click("button >> Run", { pause: 2500 });
        await d.waitFor("#__preview", 6000);
        await d.hover("#__preview", 2200);
      }),
    ],
  },

  {
    id: "11_ship", chapter: "SHIP IT", title: "Turn it into a program people can run", blurb: "One command, one file",
    steps: [
      step("Compile to one program", "When your app is ready, Bun can compile it into a single program. Here I compile the first example. The result is one file, with Bun inside, so the people you share it with do not need to install anything but the window library that comes with the suite.", async (d) => {
        await stage.hl(d);
        await stage.term(d, "bun build --compile examples/hello_simplegui.ts --outfile hello && ls -lh hello", outputs["11_ship"] ?? "", 38);
        await wait(d, 2500);
      }),
      step("Release builds for every platform", "For the whole suite there is a release builder. Build mac apps makes a double-clickable app with its own icon for every program. Release build makes one archive for each platform and processor, Mac, Windows and Linux, with checksums and release notes, and release publish uploads them to a GitHub release. The File Manager has its own one-click downloads too.", async (d) => { await wait(d, 3000); }),
    ],
  },

  {
    id: "12_map", chapter: "WHERE EVERYTHING IS", title: "Where to look things up", kind: "card",
    card: { kicker: "Everything in this tutorial is in the repository", title: "Your map of the A P I", lines: ["docs/SIMPLEGUI_API.md: every control, event, dialog and theme", "docs/API.md: the designer's form data and code generators", "docs/SYSTEM_UTILITIES_API.md: fd, sd, rip, procs, tokei, gdu and more", "src/features/rad/README.md: the forty-five rad modules", "examples/rad_tutorial: the programs from this video"] },
    steps: [{
      cap: "Where to look things up",
      say: "Here is your map. The SimpleGUI A P I guide describes every control, event, dialog and theme, with a how do I section for common questions. The A P I page describes the designer's form data and its code generators. The system utilities guide covers the ten tools and their options. The rad readme lists all forty-five modules. And the examples folder holds every program you saw today, ready to run and to change.",
    }],
  },

  {
    id: "13_outro", chapter: "THE END", title: "Now build something", kind: "card",
    card: { kicker: "Free and open source", title: "Thank you for watching", lines: ["github.com/codecaine-zz/bun_rad_studio", "bun run examples/rad_tutorial/01_quickstart.ts", "Make it yours"] },
    steps: [{
      cap: "Now build something",
      say: "That is rapid application development with Bun RAD Studio. A window in a few lines, layouts, controls, state, menus, dialogs, themes, a database, a visual designer, and a way to ship. Pick one of the examples, change it, and make it yours. Thank you for watching, and happy building.",
    }],
  },
];
